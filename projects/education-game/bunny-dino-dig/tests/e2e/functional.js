// Functional QA suite for Nini's Sea Painting — REAL touch input (CDP Input.dispatchTouchEvent) on iPhone / iPad sized
// mobile contexts (isMobile + hasTouch). It never edits the game: it reads DD.debug / world state and touches the screen.
//   node tests/e2e/functional.js                    (all groups)
//   node tests/e2e/functional.js paint talk         (only some groups)
// Groups: boot lang paint mistakes drag count talk pause hud rotate audio gate surprise
// Prints PASS/FAIL per check, writes tests/out/functional/results.json, exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 }, iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 }, ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ONLY = process.argv.slice(2);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NEG_RE = /\b(no|nope|not|wrong|bad|incorrect|mistake|fail(ed)?)\b|\bsai\b|không đúng|không phải/i;
function badText(s) {
  s = String(s == null ? '' : s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|count|wrong|hint|idle|praise|finish|alive|enter)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
  return null;
}
let srv, browser;
async function open(dev, q = '') {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(srv.url + '?mute=1&novoice=1&' + q);
  await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title', null, { timeout: 20000 });
  // event recorder (test instrumentation only)
  await page.evaluate(() => {
    const w = DD.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () { const e = o(); for (const x of e) window.__ev.push(Object.assign({ t: performance.now() }, x, { talk: undefined, gallery: undefined })); return e; };
  });
  return { ctx, page, cdp, errors };
}
const until = (P, fn, arg, t = 30000) => P.page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
async function touch(P, type, x, y) { await P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }); }
async function tap(P, p, hold = 70) { await touch(P, 'touchStart', p.x, p.y); await sleep(hold); await touch(P, 'touchEnd'); await sleep(60); }
const evs = (P, type) => P.page.evaluate(t => window.__ev.filter(e => e.type === t), type);
const clearEv = P => P.page.evaluate(() => { window.__ev.length = 0; });
async function startTopic(P, topic, lvl = 0) {
  await P.page.evaluate(({ topic, lvl }) => { DD.debug.startGame(); const w = DD.debug.world; w.levels[lvl] = topic; w.startLevel(lvl); DD.debug.setSpeed(5); }, { topic, lvl });
  await until(P, () => DD.debug.world.interactive);
  await P.page.evaluate(() => DD.debug.setSpeed(1));
  await sleep(150);
}
const G = {
  async boot(check) {
    for (const [n, d] of Object.entries(DEV)) {
      const P = await open(d, 'seed=2&age=4');
      const s = await P.page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return { play: [r.width, r.height], title: document.title, missing: DD.Assets.missing }; });
      check(`${n}: Play button ≥ 100 px`, s.play[0] >= 100 && s.play[1] >= 100, s.play);
      check(`${n}: title`, /Nini/.test(s.title), s.title);
      check(`${n}: every asset loads`, s.missing.length === 0, s.missing);
      await tap(P, await P.page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
      await until(P, () => DD.debug.mode === 'play');
      const L = await P.page.evaluate(() => DD.debug.world.layout);
      check(`${n}: canvas inside the screen`, L.canvas.x >= 0 && L.canvas.y >= 0 && L.canvas.x + L.canvas.w <= L.W && L.canvas.y + L.canvas.h <= L.H, L.canvas);
      check(`${n}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async lang(check) {
    const P = await open(DEV.iphoneL, 'seed=3&age=4&lang=vi');
    await startTopic(P, 'colors');
    const txt = await P.page.evaluate(() => document.getElementById('bubbleText').textContent);
    check('vi: prompt in Vietnamese', /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i.test(txt) && !badText(txt), txt);
    const lines = await P.page.evaluate(() => (DD.debug.voiceLog || []).map(x => x.text || x.display || String(x)));
    check('vi: voice log lines are clean', lines.every(l => !badText(l)), lines.filter(l => badText(l)).slice(0, 3));
    await P.ctx.close();
  },
  async paint(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL]]) {
      const P = await open(d, 'seed=4&age=4');
      await startTopic(P, 'colors');
      const a = await P.page.evaluate(() => { const x = DD.debug.answer(); return { c: x.shell, p: DD.debug.shellScreen(x.shell) }; });
      await clearEv(P); await tap(P, a.p); await sleep(400);
      check(`${n}: shell tap → pick`, (await evs(P, 'pick')).some(e => e.color === a.c));
      check(`${n}: brush loaded`, await P.page.evaluate(c => DD.debug.world.brush.color === c, a.c));
      const b = await P.page.evaluate(() => { const x = DD.debug.answer(); return { id: x.part, p: DD.debug.partScreen(x.part) }; });
      await tap(P, b.p); await sleep(1000);
      check(`${n}: part tap → paint + filled`, (await evs(P, 'paint')).some(e => e.partId === b.id) && (await evs(P, 'filled')).some(e => e.partId === b.id));
      // finish the round: alive, roundDone, stars
      await P.page.evaluate(() => { DD.debug.setBot(true, 1); DD.debug.setSpeed(4); });
      await until(P, () => window.__ev.some(e => e.type === 'roundDone'));
      check(`${n}: alive then roundDone`, (await evs(P, 'alive')).length >= 1);
      check(`${n}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async mistakes(check) {
    const P = await open(DEV.iphoneL, 'seed=5&age=4');
    await startTopic(P, 'colors');
    // a part before any paint → needPaint (not a mistake)
    const tgt = await P.page.evaluate(() => { const w = DD.debug.world; return w.stepInfo.targets[0]; });
    await clearEv(P); await tap(P, await P.page.evaluate(id => DD.debug.partScreen(id), tgt)); await sleep(300);
    check('needPaint before a paint is picked', (await evs(P, 'needPaint')).length === 1);
    check('needPaint is not a miss', await P.page.evaluate(() => DD.debug.world.misses === 0));
    // a wrong shell → wrong (a mistake) with kind words
    const wrong = await P.page.evaluate(() => { const w = DD.debug.world; const c = w.shells.find(s => s.color !== w.stepInfo.color).color; return { c, p: DD.debug.shellScreen(c) }; });
    await tap(P, wrong.p); await sleep(300);
    const we = await evs(P, 'wrong');
    check('wrong shell → wrong {kind:color}', we.length === 1 && we[0].kind === 'color', we);
    // the right shell, then a non-target part → notThis (no miss added)
    const m0 = await P.page.evaluate(() => DD.debug.world.misses);
    await tap(P, await P.page.evaluate(() => DD.debug.shellScreen(DD.debug.world.stepInfo.color))); await sleep(500);
    const other = await P.page.evaluate(() => { const w = DD.debug.world; const p = w.parts.find(p => !w.stepInfo.targets.includes(p.id) && !p.painted); return p ? DD.debug.partScreen(p.id) : null; });
    if (other) { await tap(P, other); await sleep(300); check('another part → notThis', (await evs(P, 'notThis')).length >= 1); }
    check('notThis is not a miss', await P.page.evaluate(m => DD.debug.world.misses === m, m0));
    // two non-progress taps → a hint (ghost hand)
    check('hint after taps without progress', (await evs(P, 'hint')).length >= 1 || await P.page.evaluate(() => !!DD.debug.world.hintHand));
    await P.ctx.close();
  },
  async drag(check) {
    const P = await open(DEV.iphoneP, 'seed=6&age=4');
    await startTopic(P, 'colors');
    const a = await P.page.evaluate(() => DD.debug.shellScreen(DD.debug.answer().shell));
    await clearEv(P);
    await touch(P, 'touchStart', a.x, a.y); for (let i = 1; i <= 8; i++) { await touch(P, 'touchMove', a.x, a.y - i * 12); await sleep(20); } await touch(P, 'touchEnd');
    await sleep(300);
    check('a drag is not a tap', (await evs(P, 'pick')).length === 0);
    await touch(P, 'touchStart', a.x, a.y); await sleep(1500); await touch(P, 'touchEnd'); await sleep(200);   // > CONFIG.tapTime (1.0 s)
    check('a long press is not a tap', (await evs(P, 'pick')).length === 0);
    check('a long press gets a soft answer (world soft event)', (await evs(P, 'soft')).length >= 1);
    await P.ctx.close();
  },
  async count(check) {
    const P = await open(DEV.ipadP, 'seed=7&age=4');
    await startTopic(P, 'count');
    const need = await P.page.evaluate(() => DD.debug.world.stepInfo.need);
    for (let i = 0; i < need; i++) {
      const p = await P.page.evaluate(() => { const a = DD.debug.answer(); return a && a.part ? DD.debug.partScreen(a.part) : null; });
      if (!p) break;
      await tap(P, p); await sleep(350);
    }
    await until(P, () => window.__ev.some(e => e.type === 'stepDone'), null, 8000).catch(() => {});
    const pe = (await evs(P, 'paint')).filter(e => e.count);
    check('count: every tap counts 1..N', pe.length === need && pe.every((e, i) => e.count.i === i + 1), pe.map(e => e.count));
    check('count: step done', (await evs(P, 'stepDone')).length >= 1);
    await P.ctx.close();
  },
  async talk(check) {
    const P = await open(DEV.iphoneL, 'seed=8&age=4');
    await startTopic(P, 'shapes');
    await P.page.evaluate(() => DD.debug.world._startTalk());
    await until(P, () => DD.debug.mode === 'talk');
    await sleep(300);
    const info = await P.page.evaluate(() => {
      const w = DD.debug.world, btn = [...document.querySelectorAll('#talkChoices button')];
      const right = btn.find(b => b.dataset.id === w.talk.answer).getBoundingClientRect();
      return { n: btn.length, p: { x: right.x + right.width / 2, y: right.y + right.height / 2 }, sz: btn.map(b => b.getBoundingClientRect().height), q: document.getElementById('talkQ').textContent };
    });
    check('talk: 3 picture buttons', info.n === 3, info.n);
    check('talk: buttons ≥ 64 px', info.sz.every(h => h >= 64), info.sz);
    check('talk: question clean', !badText(info.q), info.q);
    await tap(P, info.p); await sleep(300);
    const r = await evs(P, 'talkResult');
    check('talk: real tap on the right answer', r.length === 1 && r[0].correct, r);
    await until(P, () => DD.debug.mode === 'play' || DD.debug.world.state !== 'talk', null, 15000);
    check('talk: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async pause(check) {
    const P = await open(DEV.iphoneP, 'seed=9&age=4');
    await startTopic(P, 'colors');
    const pb = await P.page.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await tap(P, pb); await sleep(300);
    check('pause button pauses', await P.page.evaluate(() => DD.debug.mode === 'paused'));
    const t0 = await P.page.evaluate(() => DD.debug.world.time); await sleep(500);
    check('the world stops while paused', await P.page.evaluate(t => DD.debug.world.time === t, t0));
    const v0 = await P.page.evaluate(() => document.getElementById('volLevel').textContent);
    const vd = await P.page.evaluate(() => { const r = document.getElementById('btnVolDown').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await tap(P, vd); await sleep(200);
    check('volume − works', await P.page.evaluate(v => document.getElementById('volLevel').textContent !== v, v0));
    const rb = await P.page.evaluate(() => { const r = document.getElementById('btnResume').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await tap(P, rb); await sleep(300);
    check('resume', await P.page.evaluate(() => DD.debug.mode === 'play'));
    await P.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await P.ctx.close();
  },
  async hud(check) {
    const P = await open(DEV.iphoneL, 'seed=10&age=4');
    await startTopic(P, 'colors');
    // the bubble: a tap repeats the prompt and never reaches the canvas
    const bb = await P.page.evaluate(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; });
    await clearEv(P); await tap(P, bb); await sleep(200);
    check('bubble tap does not reach the world', (await P.page.evaluate(() => window.__ev.filter(e => ['needPaint', 'notThis', 'pick', 'wrong'].includes(e.type)).length)) === 0);
    const ov = await P.page.evaluate(() => {
      const L = DD.debug.world.layout, v = DD.debug.view(), C = L.canvas;
      const c = { x: v.left + C.x * v.s, y: v.top + C.y * v.s, w: C.w * v.s, h: C.h * v.s };
      const hit = (r, b) => r.x < b.x + b.w && r.x + r.width > b.x && r.y < b.y + b.h && r.y + r.height > b.y;
      return { bubble: hit(document.getElementById('bubble').getBoundingClientRect(), c), hud: hit(document.getElementById('hud').getBoundingClientRect(), c) };
    });
    check('bubble does not cover the canvas', !ov.bubble, ov);
    check('HUD does not cover the canvas', !ov.hud, ov);
    // Nini tap → pokeNini (repeat)
    await sleep(3200);
    await tap(P, await P.page.evaluate(() => { const b = DD.debug.niniScreen(); return { x: b.x, y: b.y }; }));
    await sleep(200);
    check('tap on Nini → pokeNini', (await evs(P, 'pokeNini')).length >= 1);
    await P.ctx.close();
  },
  async rotate(check) {
    const P = await open(DEV.iphoneP, 'seed=11&age=4');
    await startTopic(P, 'colors');
    await tap(P, await P.page.evaluate(() => DD.debug.shellScreen(DD.debug.answer().shell))); await sleep(400);
    await P.page.setViewportSize({ width: 852, height: 393 }); await sleep(700);
    const L = await P.page.evaluate(() => ({ W: DD.debug.world.layout.W, H: DD.debug.world.layout.H, loaded: DD.debug.world.brush.color }));
    check('rotation re-lays out', L.W > L.H, L);
    const b = await P.page.evaluate(() => { const x = DD.debug.answer(); return x && x.part ? { id: x.part, p: DD.debug.partScreen(x.part) } : null; });
    if (b) { await tap(P, b.p); await sleep(900); }
    check('after rotation the part still paints', !!b && await P.page.evaluate(id => DD.debug.world.st[id].painted, b.id));
    check('rotate: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async audio(check) {
    const P = await open(DEV.iphoneL, 'seed=12&age=4');
    await tap(P, await P.page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    await sleep(500);
    const a = await P.page.evaluate(() => { const A = DD.debug.audio(); return { ctx: !!A.ctx, music: A._playing, hum: !!A._hum }; });
    check('audio context after the first tap', a.ctx, a);
    check('music + underwater hum start with the game', a.music && a.hum, a);
    const ok = await P.page.evaluate(() => { const A = DD.debug.audio(); try { ['plip', 'splotch', 'count', 'boing', 'sweep', 'alive', 'giggle', 'creak', 'chime', 'fanfare'].forEach(n => A.play(n, { color: 'blue', i: 2 })); return true; } catch (e) { return String(e); } });
    check('every SFX plays without throwing', ok === true, ok);
    await P.ctx.close();
  },
  async gate(check) {
    const P = await open(DEV.iphoneP, 'seed=13');
    const g = await P.page.evaluate(() => { const r = document.getElementById('btnParents').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await tap(P, g); await sleep(300);
    check('a quick tap does not open settings', await P.page.evaluate(() => document.getElementById('scrSettings').classList.contains('hidden')));
    await touch(P, 'touchStart', g.x, g.y); await sleep(2300); await touch(P, 'touchEnd'); await sleep(300);
    check('holding 2 s opens settings', await P.page.evaluate(() => !document.getElementById('scrSettings').classList.contains('hidden')));
    await P.ctx.close();
  },
  async surprise(check) {
    const P = await open(DEV.ipadL, 'seed=14&age=4');
    await P.page.evaluate(() => { DD.debug.startGame(); const w = DD.debug.world; w.cfg.surpriseTypes = ['pearl']; w.levels[0] = 'animals'; w.startLevel(0); w._surpriseRound = 1; w.round = 1; DD.debug.setSpeed(5); });
    await until(P, () => DD.debug.world.interactive && !!DD.debug.world.clam);
    await P.page.evaluate(() => DD.debug.setSpeed(1));
    const c = await P.page.evaluate(() => DD.debug.clamScreen());
    await tap(P, c); await sleep(300);
    check('clam tap → pearlTap', (await evs(P, 'pearlTap')).length === 1);
    check('the clam opens', await P.page.evaluate(() => DD.debug.world.clam.open > 0.2));
    await P.ctx.close();
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
