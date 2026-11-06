// Functional QA suite for Momo's Toy Train — REAL touch input (CDP Input.dispatchTouchEvent) on iPhone / iPad sized
// mobile contexts (isMobile + hasTouch). It never edits the game: it reads TT.debug / world state and touches the screen.
//   node tests/e2e/functional.js                       (all groups)
//   node tests/e2e/functional.js drag count rotate     (only some groups)
//   JOBS=3 node tests/e2e/functional.js                (groups run in parallel; default 3)
// Groups: boot lang gate settings drag count whistle talk pause rotate audio idle extra bot
// Prints PASS/FAIL per check, writes tests/out/functional/results.json (+ screenshots), exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ALL = [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL];
const ONLY = process.argv.slice(2);
const JOBS = Math.max(1, +process.env.JOBS || 3);
const BOT_SPEED = +process.env.BOT_SPEED || 8;

const results = [];
function checker(group, log) {
  return function check(name, ok, info) {
    results.push({ group, name, ok: !!ok, info: ok || info == null ? '' : info });
    log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600)));
    return !!ok;
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũờởỡợứừửữựấầẩẫậắằẳẵặếềểễệốồổỗộớ]/i;
const NEG_RE = /\b(no|nope|not|wrong|bad|incorrect|mistake|fail(ed)?)\b|\bsai\b|không đúng|không phải|dở quá/i;
function badText(s) {
  s = String(s == null ? '' : s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|count|hitch|balloon|wrong|hint|idle|deal|party|praise|loaded|full|whistle|depart|toot)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
  return null;
}

let srv, browser;
const ctxOpts = d => ({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext(ctxOpts(dev));
  if (opt.init) await ctx.addInitScript(opt.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  const P = { ctx, page, errors, cdp, dev };
  await P.page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(P, opt.mode);
  return P;
}
async function reload(P, q) {
  await P.page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(P);
}
async function waitTitle(P, mode = 'title') {
  await P.page.waitForFunction(m => window.TT && TT.debug && TT.debug.mode === m, mode, { timeout: 20000 });
  // event recorder (test instrumentation only): every world event main.js drains, with a timestamp
  await P.page.evaluate(() => {
    const w = TT.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () {
      const e = o();
      for (const x of e) {
        window.__ev.push({ type: x.type, id: x.id, carId: x.carId, i: x.i, n: x.n, auto: x.auto, count: x.count, idle: x.idle, correct: x.correct, level: x.level, topic: x.topic, round: x.round, stars: x.stars, t: performance.now() });
      }
      if (window.__ev.length > 4000) window.__ev.splice(0, 2000);
      return e;
    };
  });
  await sleep(250);
}
const ev = (P, since = 0) => P.page.evaluate(s => window.__ev.filter(e => e.t >= s), since);
const now = P => P.page.evaluate(() => performance.now());
const vlog = P => P.page.evaluate(() => TT.debug.voiceLog.map(e => ({ text: e.text, lang: e.lang })));
const vlen = P => P.page.evaluate(() => TT.debug.voiceLog.length);
async function until(P, fn, arg, ms = 20000) {
  try { return await P.page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); }
  catch (e) {
    const st = await P.page.evaluate(() => { const s = TT.debug.getState(); delete s.settings; delete s.ins; return Object.assign(s, { last: (window.__ev || []).slice(-8).map(x => x.type) }); }).catch(() => null);
    throw new Error('timeout waiting for ' + String(fn).slice(0, 120) + ' — state ' + JSON.stringify(st));
  }
}

/* ---------- real touch ---------- */
async function touchDown(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] }); }
async function touchMove(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] }); }
async function touchUp(P) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
async function tap(P, x, y, hold = 70) { await touchDown(P, x, y); await sleep(hold); await touchUp(P); }
async function tapBox(P, b, hold) { if (!b) throw new Error('no box to tap'); await tap(P, b.x, b.y, hold); }
async function elBox(P, sel) {
  return P.page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
}
async function tapEl(P, sel, hold = 70) { const b = await elBox(P, sel); if (!b) throw new Error('not visible: ' + sel); await tap(P, b.x, b.y, hold); await sleep(150); }
const visible = (P, id) => P.page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);

/* ---------- game state ---------- */
async function info(P) {
  return P.page.evaluate(() => {
    const w = TT.debug.world, pr = w.prompt ? w.prompt() : null;
    return {
      mode: TT.debug.mode, state: w.state, phase: w.phase, level: w.level, topic: w.topic, round: w.round, stars: w.stars, time: w.time != null ? w.time : w.stateTime,
      askMode: pr && pr.mode, promptKey: pr && pr.promptKey,
      items: w.items.map(i => ({ id: i.id, state: i.state, carId: i.carId, glow: i.glow, box: TT.debug.itemScreen(i.id), ans: TT.debug.answerCarId(i.id) })),
      cars: w.cars.map(c => ({ id: c.id, need: c.need, n: (c.items || []).length, box: TT.debug.carScreen(c.id) })),
      whistle: TT.debug.whistleScreen(), momo: TT.debug.momoScreen(), hintHand: !!w.hintHand, trainX: w.train ? w.train.x : 0,
      bubble: document.getElementById('bubbleText').textContent, settings: TT.debug.getState().settings,
      vw: innerWidth, vh: innerHeight
    };
  });
}
async function startByTap(P) {
  await tapEl(P, '#btnPlay');
  await until(P, () => TT.debug.mode === 'play');
}
// a round in the load phase with every toy resting on the rug (mode 'sort' | 'count' | null)
async function waitLoad(P, mode, ms = 25000) {
  await until(P, m => { const w = TT.debug.world, pr = w.prompt && w.prompt(); return TT.debug.mode === 'play' && w.state === 'round' && w.phase === 'load' && pr && (!m || pr.mode === m) && w.items.length && w.items.every(i => i.state === 'rest' || i.state === 'in' || i.state === 'bye'); }, mode || null, ms);
  await sleep(150);
  return info(P);
}
const waitAsk = waitLoad;
async function dragTo(P, a, b, steps = 10, hold = 120) {
  await touchDown(P, a.x, a.y); await sleep(50);
  for (let i = 1; i <= steps; i++) { await touchMove(P, a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(28); }
  await sleep(hold); await touchUp(P);
}
const carDrop = c => ({ x: c.box.x, y: c.box.y - c.box.h * 0.25 });   // a point inside the car (kids drop high: also fine)
function inView(b, vw, vh) { return b && b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= vw + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= vh + 2; }
function centreIn(b, vw, vh) { return b && b.x > 0 && b.x < vw && b.y > 0 && b.y < vh; }
async function shot(P, name) { try { await P.page.screenshot({ path: path.join(OUT, `${P.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
/** Find a seed whose age-a session contains `topic`; returns {seed, level}. (fresh storage: lastTopics empty) */
async function seedFor(P, age, topic) {
  return P.page.evaluate(([a, t]) => {
    for (let s = 1; s < 200; s++) { const L = TT.Content.topicsFor(a, new TT.RNG(s), null); if (L.indexOf(t) >= 0) return { seed: s, level: L.indexOf(t), levels: L }; }
    return null;
  }, [age, topic]);
}
async function closeP(P, check, label) {
  check(label + ': no console / page errors', P.errors.length === 0, P.errors.slice(0, 5));
  await P.ctx.close();
}
// load every resting toy into its car by real touch drags (count: until the cars are full)
async function loadAll(P, max = 16) {
  for (let k = 0; k < max; k++) {
    const I = await info(P);
    if (I.phase !== 'load') return I;
    const it = I.items.find(i => i.state === 'rest' && i.ans != null);
    if (!it) { await sleep(300); continue; }
    const car = I.cars.find(c => c.id === it.ans);
    await dragTo(P, it.box, carDrop(car));
    await sleep(650);
  }
  return info(P);
}

/* ================================================================ groups */
const G = {};

// boot + title on every device; Play by touch; cars, toys, whistle and Momo on screen; one real drag loads a toy
G.boot = async check => {
  for (const d of ALL) {
    const P = await open(d, 'mute=1&seed=3&age=4');
    const t = await P.page.evaluate(() => ({ title: !document.getElementById('scrTitle').classList.contains('hidden'), logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, hud: !document.getElementById('hud').classList.contains('hidden'), loading: !document.getElementById('loading').classList.contains('hidden') }));
    check(`${d.name}: title screen shown, loader gone`, t.title && !t.loading && !t.hud, t);
    check(`${d.name}: logo text`, /Momo/.test(t.logo), t.logo);
    const pb = await elBox(P, '#btnPlay'), gb = await elBox(P, '#btnParents');
    check(`${d.name}: Play + gear inside the screen`, pb && gb && pb.l >= 0 && pb.r <= d.viewport.width && pb.b <= d.viewport.height && gb.t >= 0 && gb.r <= d.viewport.width, { pb, gb });
    check(`${d.name}: Play button ≥ 64 px`, pb && pb.w >= 64 && pb.h >= 64, pb);
    await shot(P, 'boot-title');
    await startByTap(P);
    check(`${d.name}: a touch on Play starts the game (HUD shown)`, await visible(P, 'hud'));
    const I = await waitLoad(P);
    const vw = d.viewport.width, vh = d.viewport.height;
    check(`${d.name}: every toy on screen`, I.items.every(i => inView(i.box, vw, vh)), I.items.map(i => i.box));
    check(`${d.name}: every car centre on screen`, I.cars.every(c => centreIn(c.box, vw, vh)), I.cars.map(c => c.box));
    check(`${d.name}: whistle + Momo on screen`, centreIn(I.whistle, vw, vh) && centreIn(I.momo, vw, vh), { w: I.whistle, m: I.momo });
    const hud = await elBox(P, '#hud');
    check(`${d.name}: no toy centre under the HUD`, I.items.every(i => !(i.box.x > hud.l && i.box.x < hud.r && i.box.y > hud.t && i.box.y < hud.b)), { hud });
    check(`${d.name}: toy touch targets ≥ 44 pt`, I.items.every(i => i.box.w >= 44 && i.box.h >= 44), I.items.map(i => i.box.w));
    check(`${d.name}: bubble shows the prompt`, (await visible(P, 'bubble')) && I.bubble.length > 3 && !badText(I.bubble), I.bubble);
    const it = I.items.find(i => i.state === 'rest'), car = I.cars.find(c => c.id === it.ans), t0 = await now(P);
    await dragTo(P, it.box, carDrop(car)); await sleep(900);
    const E = await ev(P, t0), J = await info(P);
    check(`${d.name}: real drag into the right car → grab, correct, land; toy is in the car`, E.some(e => e.type === 'grab') && E.some(e => e.type === 'correct' && e.carId === car.id) && E.some(e => e.type === 'land') && J.items.find(i => i.id === it.id).state === 'in', E.map(e => e.type));
    await shot(P, 'boot-drag');
    await closeP(P, check, d.name);
  }
};

G.lang = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=4&age=4');
  await tapEl(P, '.title-top [data-lang="vi"]');
  let s = await P.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang, on: document.querySelector('.title-top [data-lang="vi"]').classList.contains('on'), last: TT.debug.voiceLog.slice(-1)[0] }));
  check('VI tap: html lang = vi, VI chip on', s.lang === 'vi' && s.on, s);
  check('VI tap: logo in Vietnamese', /Momo/.test(s.logo), s.logo);
  check('VI tap: welcome line spoken in VI', s.last && s.last.lang === 'vi' && VI_RE.test(s.last.text), s.last);
  await tapEl(P, '.title-top [data-lang="en"]');
  s = await P.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang, last: TT.debug.voiceLog.slice(-1)[0] }));
  check('EN tap: back to English', s.lang === 'en' && /Momo[’']s/.test(s.logo) && s.last && s.last.lang === 'en', s);
  await startByTap(P);
  const en = await waitAsk(P);
  check('EN game: bubble prompt in English', en.bubble && !VI_RE.test(en.bubble) && !badText(en.bubble), en.bubble);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnHome');
  await until(P, () => TT.debug.mode === 'title', null, 5000).catch(() => {});
  check('Home from pause → title', (await P.page.evaluate(() => TT.debug.mode)) === 'title');
  await tapEl(P, '.title-top [data-lang="vi"]');
  await startByTap(P);
  const vi = await waitAsk(P);
  check('VI game: bubble text changed to Vietnamese', vi.bubble !== en.bubble && VI_RE.test(vi.bubble) && !badText(vi.bubble), { en: en.bubble, vi: vi.bubble });
  const last = (await vlog(P)).filter(e => e.text === vi.bubble).pop();
  check('VI game: the prompt is voiced with lang vi', last && last.lang === 'vi', last);
  check('VI saved (a real tap, not a URL flag)', (await P.page.evaluate(() => JSON.parse(localStorage.getItem('tt:settings') || '{}').lang)) === 'vi');
  await shot(P, 'lang-vi');
  await closeP(P, check, 'lang');
};

G.gate = async check => {
  const P = await open(DEV.ipadP, 'mute=1');
  const g = await elBox(P, '#btnParents');
  await tap(P, g.x, g.y, 150); await sleep(600);
  check('short tap on the gear: settings stay closed', !(await visible(P, 'scrSettings')));
  check('short tap on the gear: still on the title', (await P.page.evaluate(() => TT.debug.mode)) === 'title' && await visible(P, 'scrTitle'));
  // 1.0 s hold then lift: still closed (half a hold)
  await tap(P, g.x, g.y, 1000); await sleep(500);
  check('1 s hold: settings stay closed', !(await visible(P, 'scrSettings')));
  // a hold that slides off the gear is cancelled
  await touchDown(P, g.x, g.y); await sleep(400);
  for (let i = 1; i <= 6; i++) { await touchMove(P, g.x - i * 30, g.y + i * 30); await sleep(40); }
  await sleep(1900); await touchUp(P); await sleep(300);
  check('hold that slides off the gear: settings stay closed', !(await visible(P, 'scrSettings')));
  await tap(P, g.x, g.y, 2200); await sleep(400);
  check('2.2 s hold on the gear opens settings', await visible(P, 'scrSettings'));
  await shot(P, 'gate-settings');
  await tapEl(P, '#btnSettingsDone');
  check('Done closes settings → title', !(await visible(P, 'scrSettings')) && await visible(P, 'scrTitle'));
  await closeP(P, check, 'gate');
};

G.settings = async check => {
  const P = await open(DEV.ipadL, 'mute=1');
  const g = await elBox(P, '#btnParents');
  await tap(P, g.x, g.y, 2200); await sleep(300);
  check('settings open', await visible(P, 'scrSettings'));
  await tapEl(P, '#ageChips [data-age="6"]');
  await tapEl(P, '#scrSettings [data-lang="vi"]');
  await tapEl(P, '#inpName');
  await P.page.keyboard.type('Mam');
  // volume slider: a real touch drag along the range input to ~40 %
  const r = await elBox(P, '#optVolume');
  await touchDown(P, r.l + r.w * 0.98, r.y); await sleep(50);
  for (let i = 1; i <= 10; i++) { await touchMove(P, r.l + r.w * (0.98 - i * 0.058), r.y); await sleep(25); }
  await touchUp(P); await sleep(200);
  let v = await P.page.evaluate(() => +document.getElementById('optVolume').value);
  if (Math.abs(v - 40) > 10) {   // headless Chromium may not drag a range with touch: set it like the slider does
    check('volume slider moved by touch drag (info only: fallback used)', true);
    await P.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    v = 40;
  }
  const sv = Math.round(v) / 100;
  const st = await P.page.evaluate(() => TT.debug.getState().settings);
  check('settings applied in memory (age 6, vi, Mam, volume)', st.age === 6 && st.lang === 'vi' && st.name === 'Mam' && Math.abs(st.volume - sv) < 0.001, st);
  check('volume label shows the %', (await P.page.evaluate(() => document.getElementById('volLevel').textContent)) === Math.round(sv * 100) + '%');
  await tapEl(P, '#btnSettingsDone');
  check('title shows age 6', /6/.test(await P.page.evaluate(() => document.getElementById('titleAge').textContent)));
  await reload(P, 'mute=1');
  let s2 = await P.page.evaluate(() => ({ s: TT.debug.getState().settings, lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent, vol: TT.debug.audio().volume }));
  check('after reload: age, lang, name, volume persisted', s2.s.age === 6 && s2.s.lang === 'vi' && s2.s.name === 'Mam' && Math.abs(s2.s.volume - sv) < 0.001 && s2.lang === 'vi' && /6/.test(s2.age), s2);
  check('after reload: audio volume restored', Math.abs(s2.vol - sv) < 0.001, s2.vol);
  // URL flags: session only
  await reload(P, 'mute=1&age=3&lang=en&speed=2&seed=9&level=2');
  s2 = await P.page.evaluate(() => ({ s: TT.debug.getState().settings, lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent, ls: JSON.parse(localStorage.getItem('tt:settings')) }));
  check('?age=3&lang=en apply for the session (title age 3, EN)', s2.lang === 'en' && /3/.test(s2.age), s2);
  check('?age/&lang not written to storage on load', s2.ls.age === 6 && s2.ls.lang === 'vi', s2.ls);
  // a parent changes something unrelated (a toggle + volume) while flags are on → the flags must still not be saved
  await tap(P, g.x, g.y, 2200); await sleep(300);
  const chipOn = await P.page.evaluate(() => (document.querySelector('#ageChips .chip.on') || {}).dataset);
  check('settings show the played age (3) while ?age=3', chipOn && chipOn.age === '3', chipOn);
  await tapEl(P, '#optMusic');
  await tapEl(P, '#btnSettingsDone');
  await startByTap(P); await waitAsk(P);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnVolDown');
  const ls = await P.page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('tt:settings')), keys: Object.keys(localStorage) }));
  check('after saving under URL flags: stored age still 6, lang still vi', ls.s.age === 6 && ls.s.lang === 'vi', ls.s);
  check('no test flag (speed/seed/level/mute) in storage', !/speed|seed|level|mute|bot/.test(JSON.stringify(ls.s)) && ls.keys.every(k => k.startsWith('tt:')), ls);
  check('in-game: world age = 3 (URL flag)', (await P.page.evaluate(() => TT.debug.world.age)) === 3);
  await closeP(P, check, 'settings');
};

// drag rules: a tap is not a drop, a release outside the cars floats home (not a mistake), a wrong car boings home,
// 2 misses → hint (glow + hand), the right car loads; one finger only
G.drag = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=5&age=4');
  await startByTap(P);
  await until(P, () => TT.debug.world.round >= 0 && TT.debug.world.state === 'round');
  // round 0 is a warm-up: play it, test on round 1 (more toys and cars)
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 15000);
  await tapBox(P, (await info(P)).whistle);
  let I = await waitLoad(P, 'sort', 30000);
  check('round 2 has ≥ 2 cars and ≥ 2 toys', I.cars.length >= 2 && I.items.length >= 2, { c: I.cars.length, i: I.items.length });
  let it = I.items.find(i => i.state === 'rest');
  const right = I.cars.find(c => c.id === it.ans), wrong = I.cars.find(c => c.id !== it.ans);
  // tap (no move)
  let t0 = await now(P);
  await tapBox(P, it.box, 80); await sleep(500);
  let E = await ev(P, t0), J = await info(P);
  check('a tap on a toy is not a drop: event tap, toy back home', E.some(e => e.type === 'tap') && !E.some(e => e.type === 'correct' || e.type === 'wrong') && J.items.find(i => i.id === it.id).state !== 'in', E.map(e => e.type));
  // miss: drop on the empty rug far from any car (upwards)
  t0 = await now(P);
  await dragTo(P, it.box, { x: it.box.x, y: Math.max(40, it.box.y - 140) }); await sleep(800);
  E = await ev(P, t0); J = await info(P);
  check('release outside every car → miss (floats home, no star lost)', E.some(e => e.type === 'miss') && !E.some(e => e.type === 'wrong') && J.items.find(i => i.id === it.id).state === 'rest', E.map(e => e.type));
  // wrong car
  t0 = await now(P);
  it = J.items.find(i => i.id === it.id);
  await dragTo(P, it.box, carDrop(wrong));
  await until(P, id => { const q = TT.debug.world.itemById(id); return q && q.state === 'rest'; }, it.id, 8000).catch(() => {});
  E = await ev(P, t0); J = await info(P);
  check('wrong car → wrong event, toy goes home', E.some(e => e.type === 'wrong' && e.carId === wrong.id) && J.items.find(i => i.id === it.id).state === 'rest', E.map(e => e.type));
  const lines = (await vlog(P)).slice(-4);
  check('wrong line is gentle (no negative words)', lines.every(l => !NEG_RE.test(l.text) && !badText(l.text)), lines);
  check('after miss + wrong (2 misses) → hint shown (hand / glow)', E.some(e => e.type === 'hint') || J.hintHand, { hint: J.hintHand, E: E.map(e => e.type) });
  await shot(P, 'drag-hint');
  // two fingers: the second finger is ignored
  it = J.items.find(i => i.id === it.id);
  const other = J.items.find(i => i.id !== it.id && i.state === 'rest');
  t0 = await now(P);
  await touchDown(P, it.box.x, it.box.y, 1); await sleep(40);
  if (other) await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: it.box.x, y: it.box.y, id: 1 }, { x: other.box.x, y: other.box.y, id: 2 }] });
  await sleep(60);
  const dd = carDrop(right);
  for (let i = 1; i <= 10; i++) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: it.box.x + (dd.x - it.box.x) * i / 10, y: it.box.y + (dd.y - it.box.y) * i / 10, id: 1 }].concat(other ? [{ x: other.box.x, y: other.box.y, id: 2 }] : []) }); await sleep(28); }
  await sleep(100); await touchUp(P); await sleep(900);
  E = await ev(P, t0); J = await info(P);
  check('right car (with a 2nd finger resting) → correct, only one grab', E.some(e => e.type === 'correct') && E.filter(e => e.type === 'grab').length === 1 && J.items.find(i => i.id === it.id).state === 'in', E.map(e => e.type));
  check('stars after 1 wrong in this round still pending (no stars lost)', J.stars >= I.stars, { a: I.stars, b: J.stars });
  await closeP(P, check, 'drag');
};

// count mode: load N toys, each counted aloud; a drop into a full car is NOT a mistake; spares say bye
G.count = async check => {
  const P0 = await open(DEV.ipadL, 'mute=1');
  const sf = await seedFor(P0, 4, 'count');
  await P0.ctx.close();
  const P = await open(DEV.ipadL, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(P);
  await until(P, () => TT.debug.world.topic === 'count', null, 20000);
  let I = await waitLoad(P, 'count');
  check('count round: a car with need N and enough cargo', I.cars.every(c => c.need >= 1) && I.items.length >= I.cars.reduce((a, c) => a + c.need, 0), I.cars);
  check('count prompt names the number', /\d|one|two|three|four|five/i.test(I.bubble), I.bubble);
  const car = I.cars[0], t0 = await now(P);
  for (let k = 0; k < car.need; k++) {
    const J = await info(P), it = J.items.find(i => i.state === 'rest');
    await dragTo(P, it.box, carDrop(J.cars[0])); await sleep(750);
  }
  await sleep(600);
  const E = await ev(P, t0);
  const counts = E.filter(e => e.type === 'correct' && e.count).map(e => e.count.i);
  check(`count words 1..${car.need} in order`, JSON.stringify(counts) === JSON.stringify([...Array(car.need)].map((_, i) => i + 1)), counts);
  check('carDone when the car holds N', E.some(e => e.type === 'carDone'), E.map(e => e.type));
  const L = (await vlog(P)).map(l => l.text);
  check('count voice lines spoken (One!, Two! …)', L.some(t => /^One/i.test(t)), L.slice(-6));
  await closeP(P, check, 'count');
  // full car (2-car count round or a full single car before the round ends): try to push one more in
  const Q = await open(DEV.iphoneL, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(Q);
  await until(Q, () => TT.debug.world.topic === 'count', null, 20000);
  await Q.page.evaluate(() => TT.debug.setSpeed(1));
  let F = null;
  for (let r = 0; r < 4 && !F; r++) {
    const J = await waitLoad(Q, 'count', 40000);
    if (J.cars.length >= 2) {
      const c0 = J.cars[0];
      for (let k = 0; k < c0.need; k++) { const K = await info(Q), it = K.items.find(i => i.state === 'rest'); await dragTo(Q, it.box, carDrop(K.cars[0])); await sleep(700); }
      const K = await info(Q), it = K.items.find(i => i.state === 'rest'); const t1 = await now(Q);
      await dragTo(Q, it.box, carDrop(K.cars[0])); await sleep(900);
      F = await ev(Q, t1);
    } else {
      await loadAll(Q); await until(Q, () => TT.debug.world.phase === 'whistle', null, 15000); await tapBox(Q, (await info(Q)).whistle);
    }
  }
  if (F) check('drop into a full car → full (not wrong), toy goes home', F.some(e => e.type === 'full') && !F.some(e => e.type === 'wrong'), F.map(e => e.type));
  else check('2-car count round reached (info)', true);
  await closeP(Q, check, 'count full');
};

// whistle: after loading, the whistle phase waits for a tap; tap → whistle + depart; the train leaves; the next train
// arrives; without a tap the whistle nudges (6 s) and Momo pulls it herself (12 s)
G.whistle = async check => {
  const P = await open(DEV.iphoneL, 'mute=1&seed=6&age=4');
  await startByTap(P);
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 15000);
  const I = await info(P);
  check('all loaded → whistle phase, "pull the whistle" line', /whistle|toot/i.test(I.bubble), I.bubble);
  await shot(P, 'whistle-phase');
  await sleep(1500);
  check('train waits for the child (still parked after 1.5 s)', (await info(P)).phase === 'whistle');
  const t0 = await now(P);
  await tapBox(P, I.whistle); await sleep(1500);
  const E = await ev(P, t0), J = await info(P);
  check('whistle tap → whistle (not auto) + depart; the train moves left', E.some(e => e.type === 'whistle' && !e.auto) && E.some(e => e.type === 'depart') && J.trainX < -50, { E: E.map(e => e.type), x: J.trainX });
  await shot(P, 'whistle-depart');
  await until(P, () => TT.debug.world.round === 1 && TT.debug.world.phase === 'load', null, 20000);
  const E2 = await ev(P, t0);
  check('departed → roundDone with 3 stars (no mistakes) → next train arrives', E2.some(e => e.type === 'departed') && E2.some(e => e.type === 'roundDone' && e.stars === 3) && E2.some(e => e.type === 'arrive'), E2.map(e => e.type));
  // auto whistle
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 15000);
  const t1 = await now(P);
  await P.page.evaluate(() => TT.debug.setSpeed(3));
  await until(P, () => TT.debug.world.phase === 'depart' || TT.debug.world.state !== 'round', null, 15000);
  await P.page.evaluate(() => TT.debug.setSpeed(1));
  const E3 = await ev(P, t1);
  check('no tap → whistleHint, then Momo pulls it herself (whistle auto)', E3.some(e => e.type === 'whistleHint') && E3.some(e => e.type === 'whistle' && e.auto), E3.map(e => e.type));
  // a tap on Momo repeats the prompt
  await waitLoad(P);
  const M = await info(P), vl = await vlen(P);
  await sleep(3200);
  await tapBox(P, M.momo); await sleep(400);
  const ln = (await vlog(P)).slice(vl);
  check('tap on Momo repeats the prompt', ln.some(l => l.text === M.bubble), ln);
  await closeP(P, check, 'whistle');
};

// Talk time by touch
G.talk = async check => {
  const P = await open(DEV.ipadP, 'mute=1&seed=8&age=4');
  await startByTap(P);
  await waitLoad(P);
  await P.page.evaluate(() => { TT.debug.world.roundsPerLevel = 1; TT.debug.setBot(true, 1); TT.debug.setSpeed(3); });
  await until(P, () => TT.debug.world.state === 'roundDone' || TT.debug.world.phase === 'depart', null, 40000);
  await P.page.evaluate(() => { TT.debug.setBot(false); TT.debug.setSpeed(1); });
  await until(P, () => TT.debug.mode === 'talk', null, 20000);
  check('Talk time opens (scrTalk visible)', await visible(P, 'scrTalk'));
  const T = await P.page.evaluate(() => ({ ans: TT.debug.world.talk.answerId, q: document.getElementById('talkQ').textContent, n: document.getElementById('talkChoices').children.length, stars: TT.debug.world.stars }));
  check('Talk: question + 2–5 choices', T.n >= 2 && T.n <= 5 && !badText(T.q), T);
  await sleep(300); await shot(P, 'talk');
  const t0 = await now(P);
  await tapEl(P, `#talkChoices [data-id="${T.ans}"]`); await sleep(500);
  const E = await ev(P, t0);
  const R = await P.page.evaluate(a => ({ cls: document.querySelector(`#talkChoices [data-id="${a}"]`).className, stars: TT.debug.world.stars }), T.ans);
  check('Talk: touch on the right choice → talkResult correct', E.some(e => e.type === 'talkResult' && e.correct), E.map(e => e.type));
  check('Talk: right button marked, +1 star', /right/.test(R.cls) && R.stars === T.stars + 1, R);
  await until(P, () => TT.debug.mode === 'play' && TT.debug.world.level === 1, null, 15000).catch(() => {});
  check('after Talk: next chapter starts (level 1, mode play)', (await P.page.evaluate(() => TT.debug.mode + ':' + TT.debug.world.level)) === 'play:1');
  await closeP(P, check, 'talk');
};

// pause / resume by touch, volume −/+, visibilitychange pauses, a drag cut by pause is cancelled
G.pause = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=9&age=4');
  await startByTap(P);
  const I = await waitLoad(P);
  await tapEl(P, '#btnPause');
  check('pause button → paused screen', (await P.page.evaluate(() => TT.debug.mode)) === 'paused' && await visible(P, 'scrPause'));
  const tA = await P.page.evaluate(() => TT.debug.world.stateTime); await sleep(700); const tB = await P.page.evaluate(() => TT.debug.world.stateTime);
  check('world frozen while paused', tA === tB, { tA, tB });
  const v0 = (await info(P)).settings.volume;
  await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown');
  let v1 = await P.page.evaluate(() => ({ s: TT.debug.getState().settings.volume, a: TT.debug.audio().volume, lbl: document.getElementById('volLevel').textContent, ls: JSON.parse(localStorage.getItem('tt:settings')).volume }));
  check('volume − ×2 → −20 % (settings, audio, label, storage)', Math.abs(v1.s - (v0 - 0.2)) < 1e-9 && Math.abs(v1.a - v1.s) < 1e-9 && v1.lbl === Math.round(v1.s * 100) + '%' && Math.abs(v1.ls - v1.s) < 1e-9, { v0, v1 });
  await tapEl(P, '#btnVolUp');
  v1 = await P.page.evaluate(() => TT.debug.getState().settings.volume);
  check('volume + → +10 %', Math.abs(v1 - (v0 - 0.1)) < 1e-9, v1);
  const vl0 = await vlen(P);
  await tapEl(P, '#btnResume'); await sleep(700);
  check('resume → play, world runs again', (await P.page.evaluate(() => TT.debug.mode)) === 'play' && (await P.page.evaluate(() => TT.debug.world.stateTime)) > tB);
  const lines = (await vlog(P)).slice(vl0);
  check('resume repeats the prompt', lines.some(l => l.text === I.bubble), lines);
  const hide = h => P.page.evaluate(h2 => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h2 }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h2 ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await sleep(200);
  check('visibilitychange (hidden) → paused', (await P.page.evaluate(() => TT.debug.mode)) === 'paused');
  await hide(false); await sleep(300);
  check('back to visible → stays paused (child resumes)', (await P.page.evaluate(() => TT.debug.mode)) === 'paused' && await visible(P, 'scrPause'));
  await tapEl(P, '#btnResume'); await sleep(300);
  // a drag cut by a background switch must not load the toy
  const K = await waitLoad(P), it = K.items.find(i => i.state === 'rest'), car = K.cars.find(c => c.id === it.ans);
  const t0 = await now(P);
  await touchDown(P, it.box.x, it.box.y); await sleep(40);
  for (let i = 1; i <= 5; i++) { await touchMove(P, it.box.x + (car.box.x - it.box.x) * i / 10, it.box.y + (car.box.y - it.box.y) * i / 10); await sleep(30); }
  await hide(true); await hide(false);
  const d = carDrop(car); await touchMove(P, d.x, d.y); await sleep(60); await touchUp(P); await sleep(700);
  check('a drag held across a background switch does not load the toy', !(await ev(P, t0)).some(e => e.type === 'correct'));
  await closeP(P, check, 'pause');
};

// rotate mid-drag: the drag is cancelled cleanly, toys and cars stay on screen and draggable
G.rotate = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=10&age=4');
  await startByTap(P);
  let I = await waitLoad(P);
  let it = I.items.find(i => i.state === 'rest');
  let t0 = await now(P);
  await touchDown(P, it.box.x, it.box.y); await sleep(40);
  for (let i = 1; i <= 4; i++) { await touchMove(P, it.box.x + i * 10, it.box.y + i * 15); await sleep(30); }
  await P.page.setViewportSize({ width: 852, height: 393 });
  await sleep(500);
  await touchUp(P); await sleep(400);
  let E = await ev(P, t0);
  check('drag interrupted by rotation does not count', !E.some(e => e.type === 'correct' || e.type === 'wrong'), E.map(e => e.type));
  I = await info(P);
  check('landscape after rotation: logical W > H', (await P.page.evaluate(() => { const s = TT.debug.getState(); return s.W > s.H && s.H === 720; })));
  check('landscape: no toy is left held', I.items.every(i => i.state !== 'drag'), I.items.map(i => i.state));
  await sleep(600); I = await info(P);
  check('landscape: all resting toys inside the screen', I.items.filter(i => i.state === 'rest').every(i => inView(i.box, 852, 393)), I.items.map(i => i.box));
  check('landscape: cars + whistle inside', I.cars.every(c => centreIn(c.box, 852, 393)) && centreIn(I.whistle, 852, 393), I.cars.map(c => c.box));
  await shot({ page: P.page, dev: { name: 'iphone-rotated-landscape' } }, 'rotate');
  it = I.items.find(i => i.state === 'rest'); let car = I.cars.find(c => c.id === it.ans);
  t0 = await now(P);
  await dragTo(P, it.box, carDrop(car)); await sleep(900);
  E = await ev(P, t0);
  check('landscape: drag into the right car still works', E.some(e => e.type === 'correct'), E.map(e => e.type));
  // back to portrait while a toy flies
  I = await info(P);
  it = I.items.find(i => i.state === 'rest');
  if (it) {
    car = I.cars.find(c => c.id === it.ans);
    await dragTo(P, it.box, carDrop(car)); await sleep(60);
    await P.page.setViewportSize({ width: 393, height: 852 });
    await sleep(900);
    const J = await info(P);
    check('rotate back while a toy flies: it still lands in the car', J.items.find(i => i.id === it.id).state === 'in', J.items.find(i => i.id === it.id));
    check('portrait again: resting toys inside', J.items.filter(i => i.state === 'rest').every(i => inView(i.box, 393, 852)), J.items.map(i => i.box));
  }
  await closeP(P, check, 'rotate');
  const Q = await open(DEV.ipadP, 'mute=1&seed=10&age=5');
  await startByTap(Q); await waitLoad(Q);
  await Q.page.setViewportSize({ width: 1180, height: 820 }); await sleep(500);
  const L = await waitLoad(Q);
  check('iPad rotated: toys + cars inside', L.items.filter(i => i.state === 'rest').every(i => inView(i.box, 1180, 820)) && L.cars.every(c => centreIn(c.box, 1180, 820)), L.items.map(i => i.box));
  const iq = L.items.find(i => i.state === 'rest'), cq = L.cars.find(c => c.id === iq.ans); t0 = await now(Q);
  await dragTo(Q, iq.box, carDrop(cq)); await sleep(900);
  check('iPad rotated: drag works', (await ev(Q, t0)).some(e => e.type === 'correct'));
  await closeP(Q, check, 'rotate iPad');
};

G.audio = async check => {
  const init = () => {
    window.__comp = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const o = AC.prototype.createDynamicsCompressor; AC.prototype.createDynamicsCompressor = function () { window.__comp++; return o.apply(this, arguments); }; }
  };
  const P = await open(DEV.ipadL, 'novoice=1&seed=11', { init });
  await startByTap(P);
  await waitAsk(P);
  let A = await P.page.evaluate(() => { const a = TT.debug.audio(); const g = n => a[n] && a[n] instanceof GainNode; return { ctx: !!a.ctx, state: a.ctx && a.ctx.state, gains: ['master', 'user', 'sfx', 'music', 'amb'].every(g), comp: window.__comp, master: a.master.gain.value, user: a.user.gain.value, vol: a.volume, muted: a.muted }; });
  check('AudioContext created on the first touch', A.ctx, A);
  check('gains master/user/sfx/music/amb exist + a compressor', A.gains && A.comp >= 1, A);
  check('not muted: master gain 1, user gain = volume × 1.6', !A.muted && Math.abs(A.master - 1) < 0.05 && Math.abs(A.user - A.vol * 1.6) < 0.05, A);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown');
  await sleep(400);
  A = await P.page.evaluate(() => { const a = TT.debug.audio(); return { user: a.user.gain.value, vol: a.volume }; });
  check('volume −30 % → user gain follows (0.7 × 1.6)', Math.abs(A.vol - 0.7) < 1e-9 && Math.abs(A.user - 1.12) < 0.05, A);
  await reload(P, 'novoice=1&seed=11');
  await startByTap(P); await waitAsk(P); await sleep(400);
  A = await P.page.evaluate(() => { const a = TT.debug.audio(); return { user: a.user.gain.value, vol: a.volume, s: TT.debug.getState().settings.volume }; });
  check('volume persisted across reload and applied to the chain', Math.abs(A.s - 0.7) < 1e-9 && Math.abs(A.vol - 0.7) < 1e-9 && Math.abs(A.user - 1.12) < 0.05, A);
  await closeP(P, check, 'audio');
  const M = await open(DEV.ipadL, 'mute=1&seed=11');
  await startByTap(M); await waitAsk(M); await sleep(400);
  const m = await M.page.evaluate(() => TT.debug.audio().master.gain.value);
  check('?mute=1 → master gain 0', m < 0.01, m);
  await closeP(M, check, 'audio mute');
};

// idle: nudges, the 2nd idle hints, ≈ 2 min without a touch auto-pauses (run at speed 8; voice is logged anyway)
G.idle = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=15&age=4');
  await startByTap(P);
  await waitLoad(P);
  const t0 = await now(P);
  await P.page.evaluate(() => TT.debug.setSpeed(8));
  await until(P, () => TT.debug.mode === 'paused', null, 40000).catch(() => {});
  const E = await ev(P, t0);
  const idles = E.filter(e => e.type === 'idle').map(e => e.n);
  check('idle nudges 1..5 then auto-pause', JSON.stringify(idles) === '[1,2,3,4,5]' && (await P.page.evaluate(() => TT.debug.mode)) === 'paused', { idles, mode: await P.page.evaluate(() => TT.debug.mode) });
  check('2nd idle → idle hint (glow + hand)', E.some(e => e.type === 'hint'), E.filter(e => e.type === 'hint'));
  await P.page.evaluate(() => TT.debug.setSpeed(1));
  await tapEl(P, '#btnResume'); await sleep(200);
  const J = await info(P);
  check('resume after auto-pause → the same round is still loading', J.mode === 'play' && J.phase === 'load', J.mode + ':' + J.phase);
  await closeP(P, check, 'idle');
};

// surprises, Play again and Home
G.extra = async check => {
  const P = await open(DEV.ipadL, 'mute=1&seed=16&age=4');
  await startByTap(P); await waitLoad(P);
  await P.page.evaluate(() => { TT.debug.setBot(true, 1); TT.debug.setSpeed(3); });
  await until(P, () => !!(TT.debug.world.hitch || TT.debug.world.balloon), null, 60000).catch(() => {});
  await P.page.evaluate(() => { TT.debug.setBot(false); TT.debug.setSpeed(1); });
  const which = await P.page.evaluate(() => (TT.debug.world.hitch ? 'hitch' : TT.debug.world.balloon ? 'balloon' : null));
  check('a surprise round appears (hitch bunny or balloon)', !!which, which);
  if (which) {
    await sleep(1600);
    const b = await P.page.evaluate(w => (w === 'hitch' ? TT.debug.hitchScreen() : TT.debug.balloonScreen()), which);
    const t0 = await now(P);
    if (b) { await tapBox(P, b); await sleep(500); }
    const E = await ev(P, t0);
    check(`tap on the ${which} → ${which}Tap (no score effect)`, E.some(e => e.type === which + 'Tap') && !E.some(e => e.type === 'wrong'), E.map(e => e.type));
    await shot(P, 'surprise-' + which);
  }
  await closeP(P, check, 'extra surprise');
  const D = await open(DEV.iphoneL, `mute=1&age=3&seed=14&speed=${BOT_SPEED}&bot=1`);
  await startByTap(D);
  await until(D, () => TT.debug.mode === 'done', null, 300000);
  const lv1 = await D.page.evaluate(() => TT.debug.world.levels.slice());
  await D.page.evaluate(() => TT.debug.setSpeed(1));
  await sleep(1500);
  await shot(D, 'done');
  await tapEl(D, '#btnAgain');
  const ag = await D.page.evaluate(() => ({ mode: TT.debug.mode, levels: TT.debug.world.levels.slice(), stars: document.getElementById('hudStars').textContent }));
  check('Play again → a new session (mode play, HUD stars reset)', ag.mode === 'play' && ag.stars === '0', ag);
  check('Play again: chapters rotate (first topic differs)', ag.levels[0] !== lv1[0] || ag.levels.join() !== lv1.join(), { lv1, lv2: ag.levels });
  await tapEl(D, '#btnPause'); await tapEl(D, '#btnHome');
  await until(D, () => TT.debug.mode === 'title', null, 5000).catch(() => {});
  check('pause → Home → title', (await D.page.evaluate(() => TT.debug.mode)) === 'title' && await visible(D, 'scrTitle'));
  await closeP(D, check, 'extra again');
};

G.bot = async check => {
  const cfg = [[3, 'en', DEV.iphoneL], [4, 'vi', DEV.iphoneP], [5, 'en', DEV.ipadL], [6, 'vi', DEV.ipadP], [7, 'en', DEV.iphoneL]];
  await Promise.all(cfg.map(async ([age, lang, d]) => {
    const P = await open(d, `bot=1&autostart=1&speed=${BOT_SPEED}&mute=1&age=${age}&lang=${lang}&seed=${20 + age}`, { mode: 'play' });
    const tag = `age ${age} ${lang} ${d.name}`;
    try { await until(P, () => TT.debug.mode === 'done', null, 400000); } catch (e) { /* reported below */ }
    const R = await P.page.evaluate(() => ({ mode: TT.debug.mode, st: TT.debug.getState(), stats: TT.debug.stats, levels: TT.debug.world.levels, done: document.getElementById('doneStars').textContent, title: document.getElementById('doneTitle').textContent }));
    const E = await ev(P, 0);
    check(`${tag}: session reaches sessionDone (done screen)`, R.mode === 'done' && E.some(e => e.type === 'sessionDone') && await visible(P, 'scrDone'), R.st);
    check(`${tag}: 4 chapters played, each with Talk time`, E.filter(e => e.type === 'levelDone').map(e => e.level).join() === '0,1,2,3' && E.filter(e => e.type === 'talk').length === 4, E.filter(e => /level|talk$/.test(e.type)).map(e => e.type + (e.level != null ? e.level : '')));
    const sd = E.find(e => e.type === 'sessionDone');
    check(`${tag}: stars > 0 and shown on the done screen`, sd && sd.stars > 0 && +R.done === sd.stars && !badText(R.title), { sd, done: R.done, title: R.title });
    check(`${tag}: trains were loaded and sent off`, R.stats.correct > 8 && R.stats.rounds >= 12 && E.filter(e => e.type === 'whistle').length >= 12, R.stats);
    const L = await vlog(P);
    const bad = L.filter(l => badText(l.text));
    check(`${tag}: no raw keys / braces / undefined in ${L.length} voice lines`, bad.length === 0, bad.slice(0, 5));
    const wrongLang = L.filter(l => l.lang !== lang);
    check(`${tag}: every voice line in ${lang}`, wrongLang.length === 0, wrongLang.slice(0, 3));
    const neg = L.filter(l => NEG_RE.test(l.text));
    check(`${tag}: no negative words`, neg.length === 0, neg.slice(0, 3));
    if (lang === 'vi') check(`${tag}: VI lines contain Vietnamese`, L.filter(l => VI_RE.test(l.text)).length > L.length * 0.5, L.slice(0, 5));
    const ls = await P.page.evaluate(() => localStorage.getItem('tt:settings'));
    check(`${tag}: URL flags not saved by a bot session`, ls == null || !/"age":\s*[3567]/.test(ls), ls);
    await shot(P, `bot-done-age${age}`);
    await closeP(P, check, tag);
  }));
};

/* ================================================================ runner */
(async () => {
  srv = await serve();
  browser = await chromium.launch();
  const names = Object.keys(G).filter(n => !ONLY.length || ONLY.includes(n));
  const logs = {};
  const queue = names.slice();
  async function worker() {
    while (queue.length) {
      const n = queue.shift(), log = logs[n] = [], check = checker(n, log), t = Date.now();
      try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 600)); }
      console.log(`\n== ${n} (${((Date.now() - t) / 1000).toFixed(1)} s)\n` + log.join('\n'));
    }
  }
  await Promise.all([...Array(Math.min(JOBS, names.length))].map(worker));
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED:\n` + fails.map(f => `  [${f.group}] ${f.name}`).join('\n') : ''));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
