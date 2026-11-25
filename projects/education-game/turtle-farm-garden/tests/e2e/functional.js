// Functional QA suite for Tumi's Flower Farm — REAL touch input (CDP Input.dispatchTouchEvent) on iPhone / iPad sized
// mobile contexts (isMobile + hasTouch). It never edits the game: it reads FT.debug / world state, jumps to a chapter topic,
// and touches the screen (taps + finger drags along FT.debug.tracePoints()).
//   node tests/e2e/functional.js                    (all groups)
//   node tests/e2e/functional.js trace talk         (only some groups)
// Groups: boot lang gate persist pick mistakes trace offpath lift chips talk pause visibility hud rotate audio surprise bots
// Prints PASS/FAIL per check, writes tests/out/functional/results.json, exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const { drag, traceAll } = require('./smoke');

const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 }, iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 }, ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ONLY = process.argv.slice(2);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũầấậẩẫềếệểễồốộổỗờớợởỡừứựửữằắặẳẵ]/i;
function badText(s) {
  s = String(s == null ? '' : s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|count|wrong|hint|idle|praise|finish|trace|needPick|enter)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
  return null;
}
let srv, browser;
async function open(dev, q = '', keepStorage) {
  const ctx = keepStorage || await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(srv.url + '?mute=1&novoice=1&' + q);
  await page.waitForFunction(() => window.FT && FT.debug && FT.debug.mode === 'title', null, { timeout: 20000 });
  // event recorder (test instrumentation only)
  await page.evaluate(() => {
    const w = FT.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () { const e = o(); for (const x of e) window.__ev.push(Object.assign({ t: performance.now() }, x, { talk: undefined, gallery: undefined })); return e; };
  });
  return { ctx, page, cdp, errors };
}
const until = (P, fn, arg, t = 30000) => P.page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
async function touch(P, type, x, y) { await P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }); }
async function tap(P, p, hold = 70) { await touch(P, 'touchStart', p.x, p.y); await sleep(hold); await touch(P, 'touchEnd'); await sleep(60); }
const center = (P, sel) => P.page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
const evs = (P, type) => P.page.evaluate(t => window.__ev.filter(e => e.type === t), type);
const clearEv = P => P.page.evaluate(() => { window.__ev.length = 0; });
const stepMode = P => P.page.evaluate(() => { const w = FT.debug.world, s = w.stepInfo; return w.interactive && s ? s.mode : null; });
async function startTopic(P, topic, lvl = 0) {
  await P.page.evaluate(({ topic, lvl }) => { FT.debug.startGame(); const w = FT.debug.world; w.cfg.surpriseTypes = []; w.levels[lvl] = topic; w.startLevel(lvl); FT.debug.setSpeed(5); }, { topic, lvl });
  await until(P, () => FT.debug.world.interactive);
  await P.page.evaluate(() => FT.debug.setSpeed(1));
  await sleep(200);
}
async function waitMode(P, m, t = 10000) {
  await P.page.evaluate(() => FT.debug.setSpeed(4));
  await until(P, mm => { const w = FT.debug.world, s = w.stepInfo; return w.interactive && s && s.mode === mm; }, m, t);
  await P.page.evaluate(() => FT.debug.setSpeed(1));
  await sleep(150);
}
async function tapRight(P) {
  const p = await P.page.evaluate(() => { const a = FT.debug.answer(); return a && a.choice ? FT.debug.choiceScreen(a.choice) : null; });
  if (p) await tap(P, p);
  return p;
}
const G = {
  async boot(check) {
    for (const [n, d] of Object.entries(DEV)) {
      const P = await open(d, 'seed=2&age=4');
      const s = await P.page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return { play: [r.width, r.height], title: document.title, missing: FT.Assets.missing }; });
      check(`${n}: Play button ≥ 100 px`, s.play[0] >= 100 && s.play[1] >= 100, s.play);
      check(`${n}: title`, /Tumi/.test(s.title), s.title);
      check(`${n}: every asset loads`, s.missing.length === 0, s.missing);
      await tap(P, await center(P, '#btnPlay'));
      await until(P, () => FT.debug.mode === 'play');
      await P.page.evaluate(() => FT.debug.setSpeed(5));
      await until(P, () => FT.debug.world.interactive);
      const L = await P.page.evaluate(() => { const L = FT.debug.world.layout; return { W: L.W, H: L.H, tray: L.tray, slots: FT.debug.world.choices.map(c => ({ x: c.x, y: c.y, r: c.r })) }; });
      const T = L.tray;
      check(`${n}: tray inside the screen`, T.x >= 0 && T.y >= 0 && T.x + T.w <= L.W && T.y + T.h <= L.H, T);
      check(`${n}: choices inside the screen, off the tray`, L.slots.every(c => c.x - c.r >= 0 && c.x + c.r <= L.W && c.y + c.r <= L.H && !(c.x > T.x && c.x < T.x + T.w && c.y > T.y && c.y < T.y + T.h)), L.slots);
      check(`${n}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async lang(check) {
    const P = await open(DEV.iphoneL, 'seed=3&age=4');
    await tap(P, await center(P, '#scrTitle [data-lang="vi"]')); await sleep(200);
    const t = await P.page.evaluate(() => ({ lang: document.documentElement.lang, logo: document.getElementById('logo2').textContent, title: document.title }));
    check('title language switch → vi', t.lang === 'vi' && VI_RE.test(t.logo + t.title), t);
    await startTopic(P, 'colors');
    const txt = await P.page.evaluate(() => document.getElementById('bubbleText').textContent);
    check('vi: prompt in Vietnamese', VI_RE.test(txt) && !badText(txt), txt);
    await tap(P, await P.page.evaluate(() => FT.debug.choiceScreen(FT.debug.answer().choice))); await sleep(300);
    const lines = await P.page.evaluate(() => (FT.debug.voiceLog || []).map(x => x.text || x.display || String(x)));
    check('vi: voice log lines are clean', lines.every(l => !badText(l)), lines.filter(l => badText(l)).slice(0, 3));
    await tap(P, await center(P, '#btnPause')); await sleep(500); await tap(P, await center(P, '#btnHome')); await sleep(400);
    await tap(P, await center(P, '#scrTitle [data-lang="en"]')); await sleep(200);
    check('title language switch back → en', await P.page.evaluate(() => document.documentElement.lang === 'en' && /Flower Farm/.test(document.getElementById('logo2').textContent)));
    check('lang: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async gate(check) {
    const P = await open(DEV.iphoneP, 'seed=13');
    const g = await center(P, '#btnParents');
    await tap(P, g); await sleep(300);
    check('a quick tap on ⚙ does not open settings', await P.page.evaluate(() => document.getElementById('scrSettings').classList.contains('hidden')));
    await touch(P, 'touchStart', g.x, g.y); await sleep(900); await touch(P, 'touchEnd'); await sleep(300);
    check('a 0.9 s hold does not open settings', await P.page.evaluate(() => document.getElementById('scrSettings').classList.contains('hidden')));
    await touch(P, 'touchStart', g.x, g.y); await sleep(2300); await touch(P, 'touchEnd'); await sleep(300);
    check('holding ⚙ 2 s opens settings', await P.page.evaluate(() => !document.getElementById('scrSettings').classList.contains('hidden')));
    const vol = await P.page.evaluate(() => { const r = document.getElementById('optVolume').getBoundingClientRect(); return r.width > 0; });
    check('settings has a volume slider', vol);
    await P.ctx.close();
  },
  async persist(check) {
    const ctx = await browser.newContext({ viewport: DEV.iphoneL.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US' });
    let P = await open(DEV.iphoneL, 'seed=21&age=3&lang=vi', ctx);
    const g = await center(P, '#btnParents');
    await touch(P, 'touchStart', g.x, g.y); await sleep(2300); await touch(P, 'touchEnd'); await sleep(300);
    await tap(P, await center(P, '#ageChips [data-age="5"]'));
    await P.page.evaluate(() => { const m = document.getElementById('optMusic'); m.scrollIntoView(); });
    await tap(P, await center(P, '#optMusic')); await sleep(100);
    await P.page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = 60; v.dispatchEvent(new Event('input')); });
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    const saved = await P.page.evaluate(() => JSON.parse(localStorage.getItem('ft:settings') || '{}'));
    check('settings saved (age 5, music off, volume 0.6)', saved.age === 5 && saved.music === false && Math.abs(saved.volume - 0.6) < 0.01, saved);
    check('URL flags are not saved (?lang=vi kept out)', saved.lang === 'en', saved.lang);
    await P.page.close();
    P = await open(DEV.iphoneL, 'seed=22', ctx);
    const st = await P.page.evaluate(() => FT.debug.getState().settings);
    check('settings persist after a reload', st.age === 5 && st.music === false && Math.abs(st.volume - 0.6) < 0.01 && st.lang === 'en', st);
    check('persist: no console errors', P.errors.length === 0, P.errors);
    await ctx.close();
  },
  async pick(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL]]) {
      const P = await open(d, 'seed=4&age=4');
      await startTopic(P, 'colors');
      const a = await P.page.evaluate(() => { const x = FT.debug.answer(); return { id: x.choice, color: FT.debug.world.choiceById(x.choice).color }; });
      await clearEv(P); await tapRight(P); await sleep(500);
      check(`${n}: real tap on the right bag → pick`, (await evs(P, 'pick')).some(e => e.id === a.id));
      check(`${n}: the bag carries the colour`, await P.page.evaluate(c => FT.debug.world.bag.color === c, a.color));
      await waitMode(P, 'trace');
      const tp = await P.page.evaluate(() => FT.debug.tracePoints().length);
      check(`${n}: trace step shows dots`, tp > 5, tp);
      await P.ctx.close();
    }
  },
  async mistakes(check) {
    const P = await open(DEV.iphoneL, 'seed=5&age=4');
    await startTopic(P, 'colors');
    // the tray before the pick → needPick (not a mistake)
    const T = await P.page.evaluate(() => { const T = FT.debug.world.layout.tray; return FT.debug.toScreen(T.x + T.w / 2, T.y + T.h / 2); });
    await clearEv(P); await tap(P, T); await sleep(300);
    check('a tap on the tray before the pick → needPick', (await evs(P, 'needPick')).length === 1);
    check('needPick is not a miss', await P.page.evaluate(() => FT.debug.world.misses === 0));
    const wrongP = () => P.page.evaluate(() => { const w = FT.debug.world; const c = w.choices.find(c => c.id !== w.stepInfo.answer && !c.gone); return FT.debug.choiceScreen(c.id); });
    await tap(P, await wrongP()); await sleep(1700);
    const we = await evs(P, 'wrong');
    check('wrong bag → wrong {kind: bag}', we.length === 1 && we[0].kind === 'bag', we);
    check('one miss counted', await P.page.evaluate(() => FT.debug.world.misses === 1));
    await tap(P, await wrongP()); await sleep(400);
    check('2nd wrong → miss 2 + a hint glow', await P.page.evaluate(() => FT.debug.world.misses === 2) && ((await evs(P, 'hint')).length >= 1 || await P.page.evaluate(() => FT.debug.world.choices.some(c => c.glow > 0))));
    const wl = await P.page.evaluate(() => (FT.debug.voiceLog || []).map(x => x.text || x.display || String(x)));
    check('kind words, never negative', wl.every(l => !/\b(no|not|wrong|bad)\b/i.test(l)), wl);
    await tapRight(P);
    await waitMode(P, 'trace');
    await traceAll(P.cdp, P.page);
    await P.page.evaluate(() => FT.debug.setSpeed(4));
    await until(P, () => window.__ev.some(e => e.type === 'roundDone'));
    const rd = (await evs(P, 'roundDone'))[0];
    check('stars by the rule: 2 misses → 1 star', rd && rd.stars === 1 && rd.misses === 2, rd);
    check('mistakes: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async trace(check) {
    for (const [n, d, topic] of [['iphoneP', DEV.iphoneP, 'shapes'], ['iphoneL', DEV.iphoneL, 'colors'], ['ipadP', DEV.ipadP, 'letters']]) {
      const P = await open(d, 'seed=6&age=5');
      await startTopic(P, topic);
      if (await stepMode(P) !== 'trace') { await tapRight(P); await waitMode(P, 'trace'); }
      await clearEv(P);
      const drags = await traceAll(P.cdp, P.page);
      await sleep(300);
      const ok = (await evs(P, 'traceDone')).length >= 1;
      const ic = await P.page.evaluate(() => ({ icing: FT.debug.world.icing.filter(i => i.pts.length > 3).length, magic: FT.debug.world.magic }));
      check(`${n} ${topic}: a real finger drag completes the trace (${drags} drag(s))`, ok && !ic.magic, ic);
      check(`${n} ${topic}: icing drawn on the path`, ic.icing >= 1, ic);
      check(`${n}: traceStart from the touch`, (await evs(P, 'traceStart')).length >= 1);
      check(`${n}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async offpath(check) {
    const P = await open(DEV.ipadL, 'seed=7&age=4');
    await startTopic(P, 'colors');
    await tapRight(P); await waitMode(P, 'trace');
    // slide the finger round the tray corner, far from the dots
    const c = await P.page.evaluate(() => { const T = FT.debug.world.layout.tray; return FT.debug.toScreen(T.x + 30, T.y + 30); });
    await clearEv(P);
    const pts = []; for (let i = 0; i <= 60; i++) pts.push([c.x + 25 * Math.cos(i / 6), c.y + 25 * Math.sin(i / 6)]);
    await drag(P.cdp, pts, { every: 1, gap: 22 });
    await sleep(200);
    const s = await P.page.evaluate(() => ({ total: FT.debug.world.traceState.total, complete: FT.debug.world.traceState.complete, misses: FT.debug.world.misses }));
    check('an off-path drag does not advance the trace', s.total < 0.02 && !s.complete, s);
    check('off path → offPath (not a mistake)', (await evs(P, 'offPath')).length >= 1 && s.misses === 0, await evs(P, 'offPath'));
    await P.ctx.close();
  },
  async lift(check) {
    const P = await open(DEV.iphoneP, 'seed=8&age=4');
    await startTopic(P, 'colors');
    await tapRight(P); await waitMode(P, 'trace');
    const pts = await P.page.evaluate(() => FT.debug.tracePoints());
    await clearEv(P);
    await drag(P.cdp, pts.slice(0, Math.floor(pts.length * 0.55)));
    await sleep(500);
    const t1 = await P.page.evaluate(() => FT.debug.world.traceState.total);
    check('half a drag then lift → progress kept', t1 > 0.3 && t1 < 0.95, t1);
    check('lift → tracePause', (await evs(P, 'tracePause')).length >= 1);
    await sleep(600);
    check('progress still kept after a pause', await P.page.evaluate(t => FT.debug.world.traceState.total >= t - 1e-6, t1));
    await traceAll(P.cdp, P.page);
    await sleep(300);
    check('the rest of the drag finishes the trace', (await evs(P, 'traceDone')).length === 1);
    await P.ctx.close();
  },
  async chips(check) {
    const P = await open(DEV.ipadP, 'seed=9&age=4');
    await startTopic(P, 'count');
    if (await stepMode(P) === 'pickCookie') { await tapRight(P); await waitMode(P, 'trace'); }
    await traceAll(P.cdp, P.page);
    await waitMode(P, 'chips');
    const need = await P.page.evaluate(() => FT.debug.world.stepInfo.need);
    await clearEv(P);
    for (let i = 0; i < need; i++) {
      const p = await P.page.evaluate(() => FT.debug.chipScreen());
      if (!p) break;
      await tap(P, p); await sleep(450);
    }
    await sleep(500);
    const ce = await evs(P, 'chip');
    check('chips: every tap counts 1..N', ce.length === need && ce.every((e, i) => e.i === i + 1), ce.map(e => e.i));
    check('chips: chipsDone', (await evs(P, 'chipsDone')).length === 1);
    const p = await P.page.evaluate(() => { const c = FT.debug.cookieScreen(); return c; });
    if (p) { await tap(P, p); await sleep(300); }
    check('chips: no chip beyond N', (await evs(P, 'chip')).length === need);
    check('chips: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async talk(check) {
    for (const [n, d, age] of [['iphoneL', DEV.iphoneL, 4], ['iphoneP', DEV.iphoneP, 7]]) {
      const P = await open(d, `seed=10&age=${age}`);
      await startTopic(P, age >= 7 ? 'add' : 'shapes');
      await P.page.evaluate(() => FT.debug.world._startTalk());
      await until(P, () => FT.debug.mode === 'talk');
      await sleep(300);
      const info = await P.page.evaluate(() => {
        const w = FT.debug.world, btn = [...document.querySelectorAll('#talkChoices button')];
        const right = btn.find(b => b.dataset.id === String(w.talk.answer)).getBoundingClientRect();
        return { n: btn.length, pics: btn.filter(b => b.querySelector('canvas')).length, p: { x: right.x + right.width / 2, y: right.y + right.height / 2 }, sz: btn.map(b => b.getBoundingClientRect().height), q: document.getElementById('talkQ').textContent };
      });
      check(`${n} age ${age}: talk choices`, info.n >= 2, info.n);
      if (age <= 5) check(`${n}: picture choices for age ≤ 5`, info.pics === info.n, info);
      check(`${n}: buttons ≥ 64 px`, info.sz.every(h => h >= 64), info.sz);
      check(`${n}: question clean`, !badText(info.q), info.q);
      await tap(P, info.p); await sleep(300);
      const r = await evs(P, 'talkResult');
      check(`${n}: real tap on the right answer`, r.length === 1 && r[0].correct, r);
      await until(P, () => FT.debug.world.state !== 'talk', null, 15000);
      check(`${n}: talk: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async pause(check) {
    const P = await open(DEV.iphoneP, 'seed=11&age=4');
    await startTopic(P, 'colors');
    await tap(P, await center(P, '#btnPause')); await sleep(300);
    check('pause button pauses', await P.page.evaluate(() => FT.debug.mode === 'paused'));
    const t0 = await P.page.evaluate(() => FT.debug.world.time); await sleep(500);
    check('the world stops while paused', await P.page.evaluate(t => FT.debug.world.time === t, t0));
    const v0 = await P.page.evaluate(() => document.getElementById('volLevel').textContent);
    await tap(P, await center(P, '#btnVolDown')); await sleep(200);
    const v1 = await P.page.evaluate(() => document.getElementById('volLevel').textContent);
    check('volume − works', v1 !== v0, [v0, v1]);
    await tap(P, await center(P, '#btnVolUp')); await sleep(200);
    check('volume + works', await P.page.evaluate(v => document.getElementById('volLevel').textContent === v, v0));
    await tap(P, await center(P, '#btnResume')); await sleep(300);
    check('resume', await P.page.evaluate(() => FT.debug.mode === 'play'));
    check('the world runs again', await P.page.evaluate(t => FT.debug.world.time > t, t0));
    await P.ctx.close();
  },
  async visibility(check) {
    const P = await open(DEV.iphoneL, 'seed=12&age=4');
    await startTopic(P, 'colors');
    await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    check('page hidden → pause', await P.page.evaluate(() => FT.debug.mode === 'paused'));
    await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    check('page visible again → stays paused until Resume', await P.page.evaluate(() => FT.debug.mode === 'paused'));
    check('visibility: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async hud(check) {
    const P = await open(DEV.iphoneL, 'seed=13&age=4');
    await startTopic(P, 'colors');
    const bb = await P.page.evaluate(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; });
    await clearEv(P); await tap(P, bb); await sleep(200);
    check('bubble tap does not reach the world', (await P.page.evaluate(() => window.__ev.filter(e => ['needPick', 'offTap', 'pick', 'wrong', 'soft'].includes(e.type)).length)) === 0);
    const ov = await P.page.evaluate(() => {
      const L = FT.debug.world.layout, v = FT.debug.view(), T = L.tray;
      const c = { x: v.left + T.x * v.s, y: v.top + T.y * v.s, w: T.w * v.s, h: T.h * v.s };
      const hit = (r, b) => r.x < b.x + b.w && r.x + r.width > b.x && r.y < b.y + b.h && r.y + r.height > b.y;
      return { bubble: hit(document.getElementById('bubble').getBoundingClientRect(), c), hud: hit(document.getElementById('hud').getBoundingClientRect(), c) };
    });
    check('bubble does not cover the tray', !ov.bubble, ov);
    check('HUD does not cover the tray', !ov.hud, ov);
    await sleep(3200);
    const m = await P.page.evaluate(() => FT.debug.mochiScreen());
    await tap(P, { x: m.x, y: m.y });
    await sleep(200);
    check('tap on Mochi → pokeMochi', (await evs(P, 'pokeMochi')).length >= 1);
    await P.ctx.close();
  },
  async rotate(check) {
    const P = await open(DEV.iphoneP, 'seed=14&age=4');
    await startTopic(P, 'colors');
    await tapRight(P); await waitMode(P, 'trace');
    const pts = await P.page.evaluate(() => FT.debug.tracePoints());
    // press and slide half way, then rotate WITHOUT lifting the finger
    const half = pts.slice(0, Math.floor(pts.length * 0.5));
    await touch(P, 'touchStart', half[0][0], half[0][1]); await sleep(40);
    for (let i = 1; i < half.length; i += 2) { await touch(P, 'touchMove', half[i][0], half[i][1]); await sleep(8); }
    await sleep(100);
    const t1 = await P.page.evaluate(() => FT.debug.world.traceState.total);
    await P.page.setViewportSize({ width: 852, height: 393 }); await sleep(800);
    const s = await P.page.evaluate(() => ({ W: FT.debug.world.layout.W, H: FT.debug.world.layout.H, total: FT.debug.world.traceState.total, press: !!FT.debug.world._press }));
    check('rotation re-lays out', s.W > s.H, s);
    check('rotation mid-trace cancels the press', !s.press, s);
    check('the trace keeps its progress', s.total >= t1 - 1e-6 && t1 > 0.2, { t1, s });
    // the old finger's later moves are dropped; lift it and trace the rest in the new layout
    await touch(P, 'touchMove', 10, 10); await touch(P, 'touchEnd'); await sleep(200);
    check('stale moves after the rotation do nothing', await P.page.evaluate(t => Math.abs(FT.debug.world.traceState.total - t) < 0.02, s.total));
    await clearEv(P);
    await traceAll(P.cdp, P.page); await sleep(300);
    check('after rotation the trace completes', (await evs(P, 'traceDone')).length === 1);
    check('rotate: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async audio(check) {
    const P = await open(DEV.iphoneL, 'seed=15&age=4');
    await P.page.goto(srv.url + '?novoice=1&seed=15&age=4');   // NOT muted: the real chain
    await until(P, () => window.FT && FT.debug && FT.debug.mode === 'title');
    await tap(P, await center(P, '#btnPlay'));
    await sleep(500);
    const a = await P.page.evaluate(() => { const A = FT.debug.audio(); return { ctx: !!A.ctx, music: A._playing, hum: !!A._hum, gains: A.gains() }; });
    check('audio context after the first tap', a.ctx, a);
    check('music + kitchen hum start with the game', a.music && a.hum, a);
    check('loud chain: makeup ×1.6 at full volume', a.gains && Math.abs(a.gains.user - 1.6) < 0.05, a.gains);
    const ok = await P.page.evaluate(() => { const A = FT.debug.audio(); try { ['pop', 'squish', 'pickCookie', 'land', 'stroke', 'traceDone', 'tock', 'count', 'chipsDone', 'boing', 'hop', 'bigHop', 'rack', 'finish', 'ding', 'chirp', 'squeak', 'fanfare', 'magic'].forEach(n => A.play(n, { color: 'blue', i: 2 })); A.setFlow(true, 0.5); A.setFlow(false); return true; } catch (e) { return String(e); } });
    check('every SFX plays without throwing', ok === true, ok);
    check('audio: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async surprise(check) {
    const P = await open(DEV.ipadL, 'seed=16&age=4');
    await P.page.evaluate(() => { FT.debug.startGame(); const w = FT.debug.world; w.cfg.surpriseTypes = ['mouse']; w.levels[0] = 'animals'; w.startLevel(0); w._surpriseRound = 1; w.round = 1; FT.debug.setSpeed(5); });
    await until(P, () => FT.debug.world.interactive && !!FT.debug.world.sack);
    await P.page.evaluate(() => FT.debug.setSpeed(1));
    await clearEv(P);
    await tap(P, await P.page.evaluate(() => FT.debug.mouseScreen())); await sleep(300);
    check('sack tap → mouseTap', (await evs(P, 'mouseTap')).length === 1);
    check('the mouse is not a mistake', await P.page.evaluate(() => FT.debug.world.misses === 0));
    await P.ctx.close();
  },
  async bots(check) {
    for (const age of [3, 4, 5, 6, 7]) {
      const d = age % 2 ? DEV.iphoneP : DEV.ipadL;
      const P = await open(d, `seed=${30 + age}&age=${age}&speed=10&bot=1`);
      await P.page.evaluate(() => FT.debug.startGame());
      try {
        await until(P, () => FT.debug.mode === 'done', null, 300000);
        const s = await P.page.evaluate(() => ({ rounds: FT.debug.stats.rounds, cookies: FT.debug.world.gallery.length, levels: FT.debug.world.levels, stars: FT.debug.world.stars }));
        check(`age ${age}: full bot session ${JSON.stringify(s.levels)}`, s.rounds >= 12 && s.cookies === s.rounds, s);
      } catch (e) { check(`age ${age}: full bot session`, false, await P.page.evaluate(() => FT.debug.getState())); }
      check(`age ${age}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  }
};
(async () => {
  srv = await serve(); browser = await chromium.launch();
  for (const n of Object.keys(G)) {
    if (ONLY.length && !ONLY.includes(n)) continue;
    const log = [];
    const check = (name, ok, info) => { results.push({ group: n, name, ok: !!ok, info: ok ? '' : info }); log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + JSON.stringify(info).slice(0, 400))); };
    try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 500)); }
    console.log(`[${n}]\n  ` + log.join('\n  '));
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED` : ''));
  process.exit(fails.length ? 1 : 0);
})();
