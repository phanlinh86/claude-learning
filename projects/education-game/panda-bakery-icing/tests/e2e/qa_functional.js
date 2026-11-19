// QA functional probe (Mochi's Icing Bakery) — goes beyond tests/e2e/functional.js. Report-only: never edits the game.
// isMobile + hasTouch contexts, REAL CDP touch input (Input.dispatchTouchEvent, multi-finger where needed).
//   node tests/e2e/qa_functional.js                (all groups)
//   node tests/e2e/qa_functional.js jitter chips   (some groups)
// Writes tests/out/qa_functional/results.json, exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'qa_functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 }, iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 }, ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ONLY = process.argv.slice(2);
const results = [];
const external = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũầấậẩẫềếệểễồốộổỗờớợởỡừứựửữằắặẳẵ]/i;
let srv, browser;

// fake speechSynthesis (records speak / cancel; "speaks" for 400 ms) so voice paths run in headless Chromium
const FAKE_SYNTH = () => {
  const log = window.__synth = { spoken: [], cancels: 0, speaking: false };
  let cur = null, timer = 0;
  class U { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; } }
  const synth = {
    get speaking() { return log.speaking; }, get pending() { return false; }, paused: false,
    getVoices() { return [{ name: 'Fake EN', lang: 'en-US', localService: true, default: true }, { name: 'Fake VI', lang: 'vi-VN', localService: true }]; },
    speak(u) { log.spoken.push({ text: u.text, lang: u.lang, volume: u.volume }); cur = u; log.speaking = true;
      setTimeout(() => u.onstart && u.onstart({}), 5);
      timer = setTimeout(() => { log.speaking = false; cur = null; u.onend && u.onend({}); }, 400); },
    cancel() { log.cancels++; clearTimeout(timer); const u = cur; cur = null; log.speaking = false; if (u && u.onend) setTimeout(() => u.onend({}), 0); },
    pause() {}, resume() {}, addEventListener() {}, removeEventListener() {}, onvoiceschanged: null
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
  window.SpeechSynthesisUtterance = U;
};

async function open(dev, q = '', opts = {}) {
  const ctx = opts.ctx || await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: opts.locale || 'en-US' });
  if (opts.voice && !opts.ctx) await ctx.addInitScript(FAKE_SYNTH);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(srv.url) && !/^(data|blob|about):/.test(u)) external.push(u); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(srv.url + (opts.voice ? '?' : '?mute=1&novoice=1&') + q);
  await page.waitForFunction(() => window.IB && IB.debug && IB.debug.mode === 'title', null, { timeout: 20000 });
  await page.evaluate(() => {
    const w = IB.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () { const e = o(); for (const x of e) window.__ev.push(Object.assign({ t: performance.now() }, x, { talk: undefined, gallery: undefined })); return e; };
  });
  return { ctx, page, cdp, errors };
}
const until = (P, fn, arg, t = 30000) => P.page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
// touch helpers: `pts` = [{x, y, id}]
const tp = (x, y, id = 1) => ({ x, y, id });
async function touchRaw(P, type, points) { await P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }); }
async function touch(P, type, x, y) { await touchRaw(P, type, type === 'touchEnd' ? [] : [tp(x, y)]); }
async function tap(P, p, hold = 70) { await touch(P, 'touchStart', p.x, p.y); await sleep(hold); await touch(P, 'touchEnd'); await sleep(60); }
async function drag(P, pts, { every = 2, gap = 8, lift = true } = {}) {
  if (!pts || !pts.length) return;
  await touch(P, 'touchStart', pts[0][0], pts[0][1]); await sleep(40);
  for (let i = 1; i < pts.length; i += every) { await touch(P, 'touchMove', pts[i][0], pts[i][1]); if (gap) await sleep(gap); }
  const L = pts[pts.length - 1]; await touch(P, 'touchMove', L[0], L[1]); await sleep(30);
  if (lift) await touch(P, 'touchEnd');
}
async function traceAll(P, max = 8) {
  let n = 0;
  for (; n < max; n++) {
    const st = await P.page.evaluate(() => { const w = IB.debug.world, s = w.stepInfo; return s && s.mode === 'trace' && w.traceState && !w.traceState.complete ? IB.debug.tracePoints() : null; });
    if (!st || !st.length) break;
    await drag(P, st); await sleep(120);
  }
  return n;
}
const center = (P, sel) => P.page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
const evs = (P, type) => P.page.evaluate(t => window.__ev.filter(e => e.type === t), type);
const clearEv = P => P.page.evaluate(() => { window.__ev.length = 0; });
const total = P => P.page.evaluate(() => IB.debug.world.traceState ? IB.debug.world.traceState.total : null);
const tolPx = P => P.page.evaluate(() => { const w = IB.debug.world; return w.tol * w.layout.tray.s * IB.debug.view().s; });
async function startTopic(P, topic, lvl = 0, surprises = []) {
  await P.page.evaluate(({ topic, lvl, surprises }) => { IB.debug.startGame(); const w = IB.debug.world; w.cfg.surpriseTypes = surprises; w.levels[lvl] = topic; w.startLevel(lvl); IB.debug.setSpeed(5); }, { topic, lvl, surprises });
  await until(P, () => IB.debug.world.interactive);
  await P.page.evaluate(() => IB.debug.setSpeed(1));
  await sleep(200);
}
async function waitMode(P, m, t = 12000) {
  await P.page.evaluate(() => IB.debug.setSpeed(4));
  await until(P, mm => { const w = IB.debug.world, s = w.stepInfo; return w.interactive && s && s.mode === mm; }, m, t);
  await P.page.evaluate(() => IB.debug.setSpeed(1));
  await sleep(150);
}
async function tapRight(P) {
  const p = await P.page.evaluate(() => { const a = IB.debug.answer(); return a && a.choice ? IB.debug.choiceScreen(a.choice) : null; });
  if (p) await tap(P, p);
  return p;
}
async function toTrace(P, topic, dev, q = 'seed=6&age=4') {
  await startTopic(P, topic);
  const m = await P.page.evaluate(() => IB.debug.world.stepInfo.mode);
  if (m !== 'trace') { await tapRight(P); await waitMode(P, 'trace'); }
}
async function finishRound(P) {   // bot-free: trace + chips + picks with real touch until roundDone
  for (let k = 0; k < 12; k++) {
    if ((await evs(P, 'roundDone')).length) return true;
    const m = await P.page.evaluate(() => { const w = IB.debug.world, s = w.stepInfo; return w.state === 'round' && w.interactive && s ? s.mode : null; });
    if (m === 'trace') await traceAll(P);
    else if (m === 'chips') { const p = await P.page.evaluate(() => IB.debug.chipScreen()); if (p) await tap(P, p); await sleep(300); }
    else if (m === 'pickBag' || m === 'pickCookie') { await tapRight(P); }
    await P.page.evaluate(() => IB.debug.setSpeed(4)); await sleep(500); await P.page.evaluate(() => IB.debug.setSpeed(1));
  }
  return (await evs(P, 'roundDone')).length > 0;
}
const gear = async (P, ms = 2300) => { const g = await center(P, '#btnParents'); await touch(P, 'touchStart', g.x, g.y); await sleep(ms); await touch(P, 'touchEnd'); await sleep(300); };
const noErr = (check, n, P) => check(`${n}: no console errors / pageerrors`, P.errors.length === 0, P.errors.slice(0, 5));

const G = {
  // ---------------------------------------------------------------- tracing robustness
  async jitter(check) {
    for (const [n, d, topic, age] of [['iphoneP', DEV.iphoneP, 'colors', 4], ['ipadL', DEV.ipadL, 'shapes', 5], ['iphoneL', DEV.iphoneL, 'letters', 5]]) {
      const P = await open(d, `seed=41&age=${age}`);
      await toTrace(P, topic, d);
      const tol = await tolPx(P);
      await clearEv(P);
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      for (let k = 0; k < 8; k++) {
        const pts = await P.page.evaluate(() => { const w = IB.debug.world; return w.stepInfo && w.stepInfo.mode === 'trace' && !w.traceState.complete ? IB.debug.tracePoints() : null; });
        if (!pts || !pts.length) break;
        const j = pts.map(([x, y]) => [x + rnd() * tol * 0.45, y + rnd() * tol * 0.45]);
        await drag(P, j, { every: 1, gap: 6 }); await sleep(120);
      }
      const done = (await evs(P, 'traceDone')).length;
      const magic = await P.page.evaluate(() => IB.debug.world.magic);
      check(`${n} ${topic} age ${age}: jittery finger (±0.45 tol = ±${(tol * 0.45).toFixed(0)} px) completes without magic`, done === 1 && !magic, { done, magic, tol });
      noErr(check, n, P); await P.ctx.close();
    }
  },
  async backwards(check) {
    const P = await open(DEV.iphoneL, 'seed=42&age=4');
    await toTrace(P, 'colors');
    const pts = await P.page.evaluate(() => IB.debug.tracePoints());
    await clearEv(P);
    // start at the END and slide back towards (but stop short of) the start dot
    const back = pts.slice().reverse().slice(0, Math.floor(pts.length * 0.8));
    await drag(P, back, { every: 1, gap: 6 }); await sleep(200);
    const t1 = await total(P);
    check('backwards drag from the wrong end: no progress', t1 < 0.03, t1);
    // a reverse drag that ends inside the start tolerance may emit traceStart (touching the head), but must ice nothing
    check('backwards drag: no icing drawn', (await P.page.evaluate(() => (IB.debug.world.icing || []).every(s => !s.pts || s.pts.length < 3))), null);
    // whole reverse drag ending ON the start dot: still (almost) no progress
    await drag(P, pts.slice().reverse(), { every: 1, gap: 6 }); await sleep(200);
    const t2 = await total(P), rd = (await evs(P, 'traceDone')).length;
    check('full reverse drag ending on the start: no traceDone, progress ≈0', rd === 0 && t2 < 0.06, { t2, traceDone: rd });
    if (rd) { // start a fresh trace step for the forward check
      await P.page.evaluate(() => IB.debug.setSpeed(5));
      await until(P, () => { const w = IB.debug.world; return w.interactive && w.stepInfo && w.round >= 1; }, null, 20000);
      await P.page.evaluate(() => IB.debug.setSpeed(1));
      if (await P.page.evaluate(() => IB.debug.world.stepInfo.mode) !== 'trace') { await tapRight(P); await waitMode(P, 'trace'); }
      await clearEv(P);
    }
    // a press (no slide) in the MIDDLE of the line, far from the start dot, must not pipe anything
    const mid = await P.page.evaluate(() => { const p = IB.debug.tracePoints(); return p[Math.floor(p.length * 0.45)]; });
    const tm0 = await total(P);
    await touch(P, 'touchStart', mid[0], mid[1]); await sleep(600); await touch(P, 'touchEnd'); await sleep(200);
    const tm = await total(P);
    check('a still press in the middle of the path (not on the start) pipes nothing', tm - tm0 < 0.03, { before: tm0, after: tm });
    // then a correct drag completes
    await traceAll(P); await sleep(300);
    check('after a backwards attempt a forward drag completes', (await evs(P, 'traceDone')).length === 1);
    check('backwards: misses stay 0', await P.page.evaluate(() => IB.debug.world.misses === 0));
    noErr(check, 'backwards', P); await P.ctx.close();
  },
  async resume(check) {
    const P = await open(DEV.ipadP, 'seed=43&age=5');
    await toTrace(P, 'shapes');
    const pts = await P.page.evaluate(() => IB.debug.tracePoints());
    await clearEv(P);
    const q = Math.floor(pts.length / 4); let last = 0, mono = true;
    for (let k = 0; k < 3; k++) {
      const now = await P.page.evaluate(() => IB.debug.tracePoints());
      await drag(P, now.slice(0, q), { every: 1, gap: 6 }); await sleep(400);
      const t = await total(P); if (t <= last) mono = false; last = t;
    }
    check('lift 3× and resume each time from the icing head: progress grows', mono && last > 0.6 && last < 1, last);
    check('each lift → tracePause', (await evs(P, 'tracePause')).length >= 3, (await evs(P, 'tracePause')).length);
    check('resumes flagged resume:true', (await evs(P, 'traceStart')).filter(e => e.resume).length >= 2);
    await traceAll(P); await sleep(300);
    check('resume: the rest completes', (await evs(P, 'traceDone')).length === 1);
    noErr(check, 'resume', P); await P.ctx.close();
  },
  async twofinger(check) {
    const P = await open(DEV.ipadL, 'seed=44&age=4');
    await toTrace(P, 'colors');
    const pts = await P.page.evaluate(() => IB.debug.tracePoints());
    const T = await P.page.evaluate(() => { const T = IB.debug.world.layout.tray; return IB.debug.toScreen(T.x + 20, T.y + 20); });
    await clearEv(P);
    // finger 1 starts the trace; finger 2 lands in the tray corner and wanders; finger 1 continues
    const half = Math.floor(pts.length * 0.5);
    await touchRaw(P, 'touchStart', [tp(pts[0][0], pts[0][1], 1)]); await sleep(40);
    for (let i = 1; i < half; i += 2) { await touchRaw(P, 'touchMove', [tp(pts[i][0], pts[i][1], 1)]); await sleep(6); }
    const tA = await total(P);
    await touchRaw(P, 'touchStart', [tp(pts[half][0], pts[half][1], 1), tp(T.x, T.y, 2)]); await sleep(40);
    for (let i = 0; i < 20; i++) { await touchRaw(P, 'touchMove', [tp(pts[half][0], pts[half][1], 1), tp(T.x + i * 6, T.y + i * 3, 2)]); await sleep(10); }
    const tB = await total(P);
    check('a second finger landing mid-trace does not move the trace', Math.abs(tB - tA) < 0.03, { tA, tB });
    // finger 2 lifts, finger 1 continues to the end
    await touchRaw(P, 'touchEnd', [tp(T.x + 114, T.y + 57, 2)]); await sleep(30);   // CDP touchEnd lists the RELEASED points
    for (let i = half; i < pts.length; i += 2) { await touchRaw(P, 'touchMove', [tp(pts[i][0], pts[i][1], 1)]); await sleep(6); }
    const L = pts[pts.length - 1]; await touchRaw(P, 'touchMove', [tp(L[0], L[1], 1)]); await sleep(30);
    await touchRaw(P, 'touchEnd', []); await sleep(300);
    check('the first finger keeps the stroke and completes it', (await evs(P, 'traceDone')).length === 1, await total(P));
    // second scenario: finger 1 resting off-path on the tray, finger 2 traces the dots → must be ignored
    await P.page.evaluate(() => { IB.debug.setSpeed(5); });
    const r2 = await P.page.evaluate(() => IB.debug.world.round);
    await until(P, r => { const w = IB.debug.world; return w.round > r && w.interactive; }, r2, 20000).catch(() => {});
    await P.page.evaluate(() => IB.debug.setSpeed(1));
    if (await P.page.evaluate(() => IB.debug.world.stepInfo.mode) !== 'trace') { await tapRight(P); await waitMode(P, 'trace'); }
    const p2 = await P.page.evaluate(() => IB.debug.tracePoints());
    await clearEv(P);
    await touchRaw(P, 'touchStart', [tp(T.x, T.y, 1)]); await sleep(60);
    await touchRaw(P, 'touchStart', [tp(T.x, T.y, 1), tp(p2[0][0], p2[0][1], 2)]); await sleep(40);
    for (let i = 1; i < p2.length; i += 2) { await touchRaw(P, 'touchMove', [tp(T.x, T.y, 1), tp(p2[i][0], p2[i][1], 2)]); await sleep(6); }
    const tC = await total(P);
    await touchRaw(P, 'touchEnd', [tp(T.x, T.y, 1)]); await sleep(30); await touchRaw(P, 'touchEnd', []); await sleep(200);
    check('a second finger tracing while the first rests is ignored (one-finger rule)', tC < 0.05, tC);
    noErr(check, 'twofinger', P); await P.ctx.close();
  },
  async offedge(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['iphoneL', DEV.iphoneL]]) {
      const P = await open(d, 'seed=45&age=4');
      await toTrace(P, 'colors');
      const pts = await P.page.evaluate(() => IB.debug.tracePoints());
      const vp = d.viewport;
      await clearEv(P);
      const half = pts.slice(0, Math.floor(pts.length * 0.5));
      await drag(P, half, { lift: false });
      const t1 = await total(P);
      // slide off the tray, across the HUD / bubble, to (and past) the screen edge, lift there
      const L = half[half.length - 1];
      for (let i = 1; i <= 20; i++) { await touch(P, 'touchMove', L[0] + (vp.width + 40 - L[0]) * i / 20, L[1] * (1 - i / 20) - 10 * i / 20); await sleep(10); }
      await touch(P, 'touchEnd'); await sleep(300);
      const s = await P.page.evaluate(() => ({ total: IB.debug.world.traceState.total, press: !!IB.debug.world._press, flowing: IB.debug.world.flowing, mode: IB.debug.mode, bag: IB.debug.world.bag.state }));
      check(`${n}: drag off the tray to the screen edge → press ends, progress kept`, !s.press && s.total >= t1 - 1e-6 && t1 > 0.2, { t1, s });
      check(`${n}: icing stops flowing after the lift outside`, !s.flowing, s);
      check(`${n}: lifting over the HUD did not pause the game`, s.mode === 'play', s.mode);
      await traceAll(P); await sleep(300);
      check(`${n}: trace still completes afterwards`, (await evs(P, 'traceDone')).length === 1);
      noErr(check, n, P); await P.ctx.close();
    }
  },
  async fastswipe(check) {
    for (const [n, d, topic, age, hz, ms] of [['iphoneP', DEV.iphoneP, 'colors', 4, 60, 350], ['ipadL', DEV.ipadL, 'shapes', 4, 60, 500], ['iphoneL', DEV.iphoneL, 'colors', 4, 60, 200]]) {
      const P = await open(d, `seed=46&age=${age}`);
      await toTrace(P, topic);
      const pts = await P.page.evaluate(() => IB.debug.tracePoints());
      const samples = Math.max(3, Math.round(ms / 1000 * hz)), every = Math.max(1, Math.floor(pts.length / samples));
      await clearEv(P);
      await drag(P, pts, { every, gap: 1000 / hz | 0 }); await sleep(250);
      const t = await total(P), done = (await evs(P, 'traceDone')).length;
      const spacing = await P.page.evaluate(e => { const w = IB.debug.world; return (4 * e).toFixed(0) + ' picture px / sample, look ' + w.cfg.look; }, every);
      check(`${n} ${topic}: a fast swipe (${ms} ms, ${hz} Hz, ${samples} samples, ${spacing}) completes in one stroke`, done === 1, { total: t, every, len: pts.length });
      noErr(check, n, P); await P.ctx.close();
    }
  },
  async taphop(check) {
    // quick 70 ms taps hopping along the dots (no slide at all) must not pipe the path: tracing is the "write it" step
    for (const [n, d, topic, age] of [['iphoneL', DEV.iphoneL, 'colors', 4], ['ipadP', DEV.ipadP, 'letters', 5]]) {
      const P = await open(d, `seed=42&age=${age}`);
      await toTrace(P, topic);
      await clearEv(P);
      let taps = 0;
      for (let k = 0; k < 40; k++) {
        const pts = await P.page.evaluate(() => { const w = IB.debug.world; return w.stepInfo && w.stepInfo.mode === 'trace' && !w.traceState.complete ? IB.debug.tracePoints() : null; });
        if (!pts || !pts.length) break;
        const tolP = await tolPx(P);
        // the next point ≈ 1.6 tol ahead along the remaining dots
        let acc = 0, i = 1; for (; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc >= tolP * 1.6) break; }
        const q = pts[Math.min(i, pts.length - 1)];
        await tap(P, { x: q[0], y: q[1] }, 70); taps++; await sleep(120);
      }
      const done = (await evs(P, 'traceDone')), tt = await evs(P, 'traceTap');
      check(`${n} ${topic}: taps along the dots (no slide) do NOT complete the trace`, done.length === 0 || done[0].magic, { taps, traceDone: done.length, magic: done[0] && done[0].magic, traceTaps: tt.length });
      noErr(check, n, P); await P.ctx.close();
    }
  },
  // ---------------------------------------------------------------- tap-only child + help
  async taponly(check) {
    for (const age of [3, 4, 6]) {
      const P = await open(DEV.iphoneL, `seed=47&age=${age}`);
      await startTopic(P, age >= 6 ? 'add' : 'colors');
      const T = await P.page.evaluate(() => { const T = IB.debug.world.layout.tray; return IB.debug.toScreen(T.x + T.w / 2, T.y + T.h / 2); });
      await clearEv(P);
      let taps = 0;
      for (; taps < 60; taps++) {
        if ((await evs(P, 'roundDone')).length) break;
        const live = await P.page.evaluate(() => IB.debug.world.interactive);
        if (!live) { await P.page.evaluate(() => IB.debug.setSpeed(4)); await sleep(250); await P.page.evaluate(() => IB.debug.setSpeed(1)); continue; }
        const mode = await P.page.evaluate(() => IB.debug.world.stepInfo.mode);
        // a toddler: always taps the middle of the tray (where the dotted cookie is); in chips mode that's the cookie anyway
        const p = mode === 'chips' ? await P.page.evaluate(() => IB.debug.chipScreen()) || T : T;
        await tap(P, p, 80); await sleep(250);
      }
      const done = (await evs(P, 'roundDone'))[0];
      const a = await evs(P, 'assist');
      check(`age ${age}: a tap-only child finishes the round (${taps} taps)`, !!done && taps < 60, { taps, assists: a.map(x => x.target) });
      check(`age ${age}: magic icing switched on`, a.some(x => x.target === 'path' && x.magic), a);
      if (age <= 5) check(`age ${age}: pick step assisted (target choice)`, a.some(x => x.target === 'choice'), a);
      check(`age ${age}: tap-only taps are never misses (stars 3)`, done && done.misses === 0 && done.stars === 3, done);
      noErr(check, 'age ' + age, P); await P.ctx.close();
    }
  },
  async stars(check) {
    const P = await open(DEV.iphoneP, 'seed=48&age=5');
    await startTopic(P, 'shapes');
    for (const wrongs of [0, 1, 3]) {
      await clearEv(P);
      const before = await P.page.evaluate(() => IB.debug.world.stars);
      if (await P.page.evaluate(() => IB.debug.world.stepInfo.mode) === 'trace') { check(`stars ${wrongs}: round starts with a pick`, false, 'trace first'); break; }
      for (let k = 0; k < wrongs; k++) {
        const p = await P.page.evaluate(() => { const w = IB.debug.world; const c = w.choices.find(c => c.id !== w.stepInfo.answer && !c.gone); return c ? IB.debug.choiceScreen(c.id) : null; });
        if (p) await tap(P, p); await sleep(450);
      }
      if (wrongs >= 2) {
        const h = await evs(P, 'hint');
        const ans = await P.page.evaluate(() => IB.debug.world.stepInfo.answer);
        check(`after 2 wrong: hint on the right choice + ghost hand`, h.some(e => e.target === 'choice' && e.id === ans), { h, ans });
      }
      await tapRight(P);
      await finishRound(P);
      const rd = (await evs(P, 'roundDone'))[0];
      const want = wrongs === 0 ? 3 : wrongs === 1 ? 2 : 1;
      const after = await P.page.evaluate(() => IB.debug.world.stars);
      check(`${wrongs} wrong → ${want} star(s)`, rd && rd.stars === want && rd.misses === wrongs, rd);
      check(`${wrongs} wrong: HUD total grew by ${want}`, after - before === want, { before, after });
      await P.page.evaluate(() => IB.debug.setSpeed(5));
      await until(P, () => { const w = IB.debug.world; return w.state === 'round' && w.interactive; }, null, 20000);
      await P.page.evaluate(() => IB.debug.setSpeed(1)); await sleep(150);
    }
    noErr(check, 'stars', P); await P.ctx.close();
  },
  async chips(check) {
    const P = await open(DEV.iphoneP, 'seed=49&age=5');
    await startTopic(P, 'count');
    if (await P.page.evaluate(() => IB.debug.world.stepInfo.mode) === 'pickCookie') { await tapRight(P); await waitMode(P, 'trace'); }
    await traceAll(P);
    await waitMode(P, 'chips');
    const need = await P.page.evaluate(() => IB.debug.world.stepInfo.need);
    const C = await P.page.evaluate(() => IB.debug.cookieScreen());
    await clearEv(P);
    // a child hammering the cookie: need + 4 quick taps, 120 ms apart (faster than a chip flies)
    for (let i = 0; i < need + 4; i++) { await tap(P, { x: C.x + ((i % 3) - 1) * 12, y: C.y + ((i % 2) * 2 - 1) * 10 }, 40); await sleep(60); }
    await until(P, () => window.__ev.some(e => e.type === 'chipsDone'), null, 5000).catch(() => {});
    const onWorld = await P.page.evaluate(() => IB.debug.world.chips.length);
    await sleep(1200);
    const drop = await evs(P, 'chipDrop'), land = await evs(P, 'chip'), done = await evs(P, 'chipsDone'), al = await evs(P, 'already');
    check(`chips: ${need + 4} fast taps → exactly ${need} chipDrop`, drop.length === need, drop.map(e => e.i));
    check('chips: chip events count 1..N in order, n = need', land.length === need && land.every((e, i) => e.i === i + 1 && e.n === need), land.map(e => e.i));
    check('chips: one chipsDone', done.length === 1, done.length);
    check('chips: extra taps after N are not misses', await P.page.evaluate(() => IB.debug.world.misses === 0));
    check('chips: chips on the cookie at chipsDone = need', onWorld === need, { onWorld, need });
    const counts = await P.page.evaluate(() => (IB.debug.voiceLog || []).map(x => x.text));
    check('chips: counted aloud (voice log has the count lines)', counts.length > 0, counts.slice(-6));
    check(`chips: extra taps ${al.length ? 'give "already"' : 'silently ignored'} (info)`, true);
    noErr(check, 'chips', P); await P.ctx.close();
  },
  async mochi(check) {
    const P = await open(DEV.iphoneL, 'seed=50&age=4', { voice: true });
    await tap(P, await center(P, '#btnPlay'));
    await P.page.evaluate(() => { const w = IB.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = 'colors'; w.startLevel(0); });
    await until(P, () => IB.debug.world.interactive, null, 20000);
    await sleep(3500);
    const prompt = await P.page.evaluate(() => document.getElementById('bubbleText').textContent);
    const n0 = await P.page.evaluate(() => window.__synth.spoken.length);
    const m = await P.page.evaluate(() => IB.debug.mochiScreen());
    await clearEv(P);
    await tap(P, m); await sleep(700);
    const said = await P.page.evaluate(n => window.__synth.spoken.slice(n).map(s => s.text), n0);
    check('tap on Mochi → pokeMochi', (await evs(P, 'pokeMochi')).length === 1);
    check('tap on Mochi (> 3 s after the prompt) repeats the prompt aloud', said.length >= 1, { said, prompt });
    // bubble tap also repeats
    await sleep(3200);
    const n1 = await P.page.evaluate(() => window.__synth.spoken.length);
    await clearEv(P);
    await tap(P, await center(P, '#bubble')); await sleep(700);
    check('tap on the bubble repeats the prompt aloud', await P.page.evaluate(n => window.__synth.spoken.length > n, n1));
    check('bubble tap is not a world event', (await P.page.evaluate(() => window.__ev.filter(e => ['needPick', 'offTap', 'pick', 'wrong', 'soft', 'pokeMochi'].includes(e.type)).length)) === 0);
    // visibility hidden → paused + speech stopped
    await P.page.evaluate(() => window.speechSynthesis.speak(new SpeechSynthesisUtterance('long line')));
    const c0 = await P.page.evaluate(() => window.__synth.cancels);
    await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    const v = await P.page.evaluate(c => ({ mode: IB.debug.mode, cancels: window.__synth.cancels - c, speaking: window.__synth.speaking, music: IB.debug.audio()._playing, ctx: IB.debug.audio().ctx && IB.debug.audio().ctx.state }), c0);
    check('hidden → paused', v.mode === 'paused', v);
    check('hidden → speech cancelled', v.cancels >= 1 && !v.speaking, v);
    check('hidden → music stopped / audio suspended', !v.music || v.ctx === 'suspended', v);
    const n2 = await P.page.evaluate(() => window.__synth.spoken.length); await sleep(1500);
    check('hidden: nothing new is spoken while hidden', await P.page.evaluate(n => window.__synth.spoken.length === n, n2));
    await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    await tap(P, await center(P, '#btnResume')); await sleep(800);
    check('resume after hidden → play, prompt repeated', await P.page.evaluate(n => IB.debug.mode === 'play' && window.__synth.spoken.length > n, n2));
    // volume applies to speech
    await P.page.evaluate(() => IB.debug.goTitle()); await sleep(200);
    await gear(P);
    await P.page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = 40; v.dispatchEvent(new Event('input')); });
    await sleep(400);
    const g = await P.page.evaluate(() => IB.debug.audio().gains());
    check('volume 40 % → user gain 0.4 × 1.6 = 0.64', g && Math.abs(g.user - 0.64) < 0.03 && g.makeup === 1.6, g);
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    const n3 = await P.page.evaluate(() => window.__synth.spoken.length);
    await tap(P, await center(P, '#btnPlay')); await sleep(2500);
    const vols = await P.page.evaluate(n => window.__synth.spoken.slice(n).map(s => s.volume), n3);
    check('voice volume follows the setting (utterance.volume ≈ 0.4)', vols.length > 0 && vols.every(x => Math.abs(x - 0.4) < 0.05), vols);
    noErr(check, 'mochi/voice', P); await P.ctx.close();
  },
  async surprises(check) {
    const P = await open(DEV.ipadL, 'seed=51&age=4');
    await P.page.evaluate(() => { IB.debug.startGame(); const w = IB.debug.world; w.cfg.surpriseTypes = ['bird']; w.levels[0] = 'colors'; w.startLevel(0); w._surpriseRound = 1; w.round = 1; IB.debug.setSpeed(5); });
    try {
      await until(P, () => !!IB.debug.birdScreen() && IB.debug.world.interactive, null, 25000);
      await P.page.evaluate(() => IB.debug.setSpeed(1));
      await clearEv(P);
      await tap(P, await P.page.evaluate(() => IB.debug.birdScreen())); await sleep(300);
      check('bird tap → birdTap', (await evs(P, 'birdTap')).length === 1, await P.page.evaluate(() => window.__ev.map(e => e.type)));
      check('bird tap is not a mistake / not a pick', await P.page.evaluate(() => IB.debug.world.misses === 0 && !window.__ev.some(e => e.type === 'pick' || e.type === 'wrong')));
    } catch (e) { check('bird appears in a bird round', false, await P.page.evaluate(() => IB.debug.getState())); }
    await P.ctx.close();
    const Q = await open(DEV.iphoneP, 'seed=52&age=4');
    await Q.page.evaluate(() => { IB.debug.startGame(); const w = IB.debug.world; w.cfg.surpriseTypes = ['mouse']; w.levels[0] = 'colors'; w.startLevel(0); w._surpriseRound = 1; w.round = 1; IB.debug.setSpeed(5); });
    try {
      await until(Q, () => IB.debug.world.interactive && !!IB.debug.world.sack, null, 25000);
      await Q.page.evaluate(() => IB.debug.setSpeed(1));
      const m = await Q.page.evaluate(() => IB.debug.mouseScreen());
      const vp = DEV.iphoneP.viewport;
      check('iphoneP: the sack / mouse is on screen', m && m.x - m.r > -5 && m.x + m.r < vp.width + 5 && m.y + m.r < vp.height + 5, m);
      await clearEv(Q);
      for (let i = 0; i < 3; i++) { await tap(Q, m); await sleep(250); }
      const mt = await evs(Q, 'mouseTap');
      check('iphoneP: 3 mouse taps → 3 mouseTap, taps counted', mt.length === 3 && mt[2].taps === 3, mt);
      check('mouse taps are not misses', await Q.page.evaluate(() => IB.debug.world.misses === 0));
    } catch (e) { check('mouse sack appears', false, String(e).slice(0, 200)); }
    noErr(check, 'surprises', Q); await Q.ctx.close();
  },
  async hud(check) {
    const P = await open(DEV.iphoneP, 'seed=53&age=4');
    await toTrace(P, 'colors');
    await clearEv(P);
    // taps on HUD (stars, dots) and the bubble must not reach the world
    for (const sel of ['.hud-stars', '#hudDots', '#bubble']) {
      const ok = await P.page.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
      if (!ok) continue;
      await tap(P, await center(P, sel)); await sleep(150);
    }
    const wev = await P.page.evaluate(() => window.__ev.filter(e => ['traceTap', 'traceStart', 'offTap', 'needPick', 'soft', 'pokeMochi'].includes(e.type)).map(e => e.type));
    check('HUD / bubble taps never reach the world', wev.length === 0, wev);
    // a press starting ON the bubble and sliding onto the tray dots must not start a trace
    const pts = await P.page.evaluate(() => IB.debug.tracePoints());
    const b = await center(P, '#bubble');
    await touch(P, 'touchStart', b.x, b.y); await sleep(30);
    for (const q of pts.slice(0, 40)) { await touch(P, 'touchMove', q[0], q[1]); await sleep(5); }
    await touch(P, 'touchEnd'); await sleep(200);
    check('a press that starts on the bubble cannot pipe icing', (await total(P)) < 0.02, await total(P));
    // a trace that slides UNDER the bubble/HUD keeps going (pointer capture)
    noErr(check, 'hud', P); await P.ctx.close();
  },
  async pausetrace(check) {
    const P = await open(DEV.iphoneL, 'seed=54&age=4');
    await toTrace(P, 'colors');
    const pts = await P.page.evaluate(() => IB.debug.tracePoints());
    const half = Math.floor(pts.length * 0.5);
    await clearEv(P);
    await touchRaw(P, 'touchStart', [tp(pts[0][0], pts[0][1], 1)]); await sleep(40);
    for (let i = 1; i < half; i += 2) { await touchRaw(P, 'touchMove', [tp(pts[i][0], pts[i][1], 1)]); await sleep(6); }
    const t1 = await total(P);
    // second finger taps Pause while finger 1 is still down
    const pb = await center(P, '#btnPause');
    await touchRaw(P, 'touchStart', [tp(pts[half][0], pts[half][1], 1), tp(pb.x, pb.y, 2)]); await sleep(70);
    await touchRaw(P, 'touchEnd', [tp(pb.x, pb.y, 2)]); await sleep(300);
    let s = await P.page.evaluate(() => ({ mode: IB.debug.mode, press: !!IB.debug.world._press, flowing: IB.debug.world.flowing, flow: IB.debug.audio()._flow ? IB.debug.audio()._flow.on : null }));
    if (s.mode !== 'paused') { // fallback: pause via a lone tap (multi-touch tap on a button may be eaten)
      console.log('  INFO second-finger tap on ⏸ while a finger traces did not pause (Chromium never sends click for a non-primary touch; unverified on iOS)', JSON.stringify(s));
      await P.page.evaluate(() => document.getElementById('btnPause').click()); await sleep(200);
      s = await P.page.evaluate(() => ({ mode: IB.debug.mode, press: !!IB.debug.world._press, flowing: IB.debug.world.flowing }));
    }
    check('pause mid-trace → paused, press cancelled, icing stops', s.mode === 'paused' && !s.press && !s.flowing, s);
    // finger 1 keeps moving behind the pause menu
    for (let i = half; i < pts.length; i += 3) { await touchRaw(P, 'touchMove', [tp(pts[i][0], pts[i][1], 1)]); await sleep(6); }
    await touchRaw(P, 'touchEnd', []); await sleep(200);
    const t2 = await total(P);
    check('moves while paused do not pipe', Math.abs(t2 - t1) < 0.03, { t1, t2 });
    await tap(P, await center(P, '#btnResume')); await sleep(400);
    check('resume keeps the trace progress', (await total(P)) >= t1 - 1e-6 && await P.page.evaluate(() => IB.debug.mode === 'play'));
    await traceAll(P); await sleep(300);
    check('after resume the trace completes', (await evs(P, 'traceDone')).length === 1);
    noErr(check, 'pausetrace', P); await P.ctx.close();
  },
  async rotate(check) {
    // rotation mid-trace: iPad landscape → portrait, and iPhone landscape → portrait
    for (const [n, d, to] of [['ipadL→P', DEV.ipadL, { width: 820, height: 1180 }], ['iphoneL→P', DEV.iphoneL, { width: 393, height: 852 }]]) {
      const P = await open(d, 'seed=55&age=5');
      await toTrace(P, 'shapes');
      const pts = await P.page.evaluate(() => IB.debug.tracePoints());
      await clearEv(P);
      await drag(P, pts.slice(0, Math.floor(pts.length * 0.4)), { lift: false });
      const t1 = await total(P);
      await P.page.setViewportSize(to); await sleep(900);
      const s = await P.page.evaluate(() => {
        const w = IB.debug.world, L = w.layout, v = IB.debug.view();
        const dots = IB.debug.tracePoints(), out = dots.filter(([x, y]) => x < 0 || y < 0 || x > innerWidth || y > innerHeight).length;
        const ch = w.choices.filter(c => !c.gone).filter(c => c.x - c.r < 0 || c.x + c.r > L.W || c.y + c.r > L.H || c.y - c.r < 0).length;
        const ck = w.cookie ? IB.debug.cookieScreen() : null;
        return { W: L.W, H: L.H, press: !!w._press, total: w.traceState.total, dotsOut: out, choicesOut: ch, ck, iw: innerWidth, ih: innerHeight };
      });
      check(`${n}: rotation mid-trace cancels the press, keeps the progress`, !s.press && s.total >= t1 - 1e-6 && t1 > 0.15, { t1, s });
      check(`${n}: after rotation every dot is on screen`, s.dotsOut === 0, s);
      check(`${n}: after rotation the cookie is on screen`, !s.ck || (s.ck.x > 0 && s.ck.x < s.iw && s.ck.y > 0 && s.ck.y < s.ih), s.ck);
      await touch(P, 'touchEnd'); await sleep(100);
      await traceAll(P); await sleep(300);
      check(`${n}: trace completes in the new layout`, (await evs(P, 'traceDone')).length === 1);
      noErr(check, n, P); await P.ctx.close();
    }
    // rotation mid-hop: wait for the hop event, rotate during the flight, then check rack / cookie positions
    for (const [n, d, to] of [['iphoneP→L hop', DEV.iphoneP, { width: 852, height: 393 }], ['ipadP→L hop', DEV.ipadP, { width: 1180, height: 820 }]]) {
      const P = await open(d, 'seed=56&age=4');
      await toTrace(P, 'colors');
      await clearEv(P);
      await traceAll(P);
      await until(P, () => window.__ev.some(e => e.type === 'hop'), null, 15000);
      await P.page.setViewportSize(to);
      const samples = [];
      for (let i = 0; i < 25; i++) {
        samples.push(await P.page.evaluate(() => {
          const w = IB.debug.world, L = w.layout, items = [];
          const hop = w._hop ? w._hop.it : null;
          for (const it of [w.cookie, hop].concat(w.rackCookies || [])) if (it && it.x != null) items.push({ x: it.x, y: it.y, s: it.size || 0 });
          return { W: L.W, H: L.H, phase: w.phase, items };
        }));
        await sleep(60);
      }
      const last = samples[samples.length - 1];
      const bad = samples.slice(8).flatMap(s => s.items.filter(it => it.x < -it.s * 0.2 || it.x > s.W + it.s * 0.2 || it.y < -it.s * 0.6 || it.y > s.H + it.s * 0.2).map(it => Object.assign({ phase: s.phase, W: s.W, H: s.H }, it)));
      check(`${n}: re-laid out (${last.W}×${last.H})`, (to.width > to.height) === (last.W > last.H), last);
      check(`${n}: no cookie / rack cookie outside the screen after the rotation`, bad.length === 0, bad.slice(0, 4));
      await P.page.evaluate(() => IB.debug.setSpeed(4));
      try { await until(P, () => window.__ev.some(e => e.type === 'rack'), null, 10000); check(`${n}: the cookie still lands on the rack`, true); }
      catch (e) { check(`${n}: the cookie still lands on the rack`, false, await P.page.evaluate(() => IB.debug.getState())); }
      const rk = await P.page.evaluate(() => { const w = IB.debug.world, L = w.layout; return (w.rackCookies || []).map(c => ({ x: c.x, y: c.y, s: c.size, W: L.W, H: L.H })); });
      check(`${n}: rack cookies inside the screen`, rk.every(c => c.x > 0 && c.x < c.W && c.y > 0 && c.y < c.H), rk);
      noErr(check, n, P); await P.ctx.close();
    }
  },
  // ---------------------------------------------------------------- settings
  async settings(check) {
    const ctx = await browser.newContext({ viewport: DEV.ipadP.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' });
    let P = await open(DEV.ipadP, 'seed=57', { ctx });
    const g = await center(P, '#btnParents');
    await touch(P, 'touchStart', g.x, g.y); await sleep(1800); await touch(P, 'touchEnd'); await sleep(300);
    check('1.8 s hold does not open settings', await P.page.evaluate(() => document.getElementById('scrSettings').classList.contains('hidden')));
    // hold but slide away → cancelled
    await touch(P, 'touchStart', g.x, g.y); await sleep(300);
    for (let i = 0; i < 10; i++) { await touch(P, 'touchMove', g.x + i * 20, g.y + i * 20); await sleep(20); }
    await sleep(2000); await touch(P, 'touchEnd'); await sleep(300);
    check('hold then slide away from ⚙ → not opened', await P.page.evaluate(() => document.getElementById('scrSettings').classList.contains('hidden')));
    await gear(P);
    check('2 s hold opens settings', await P.page.evaluate(() => !document.getElementById('scrSettings').classList.contains('hidden')));
    await tap(P, await center(P, '#ageChips [data-age="6"]'));
    await tap(P, await center(P, '#scrSettings [data-lang="vi"]').catch(() => null) || { x: 0, y: 0 });
    await P.page.evaluate(() => { const i = document.getElementById('inpName'); i.focus(); i.value = 'Mầm<b>'; i.dispatchEvent(new Event('input')); i.blur(); });
    await P.page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = 35; v.dispatchEvent(new Event('input')); });
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    const saved = await P.page.evaluate(() => JSON.parse(localStorage.getItem('ib:settings') || '{}'));
    check('saved: age 6, lang vi, name sanitised "Mầmb", volume 0.35', saved.age === 6 && saved.lang === 'vi' && saved.name === 'Mầmb' && Math.abs(saved.volume - 0.35) < 0.01, saved);
    const ti = await P.page.evaluate(() => document.getElementById('titleAge').textContent);
    check('title shows the new age', /6/.test(ti), ti);
    await P.page.close();
    P = await open(DEV.ipadP, 'seed=58', { ctx });
    const st = await P.page.evaluate(() => ({ s: IB.debug.getState().settings, lang: document.documentElement.lang, vol: IB.debug.audio().volume, title: document.getElementById('titleAge').textContent }));
    check('reload: age / lang / name / volume persist', st.s.age === 6 && st.s.lang === 'vi' && st.s.name === 'Mầmb' && Math.abs(st.s.volume - 0.35) < 0.01 && st.lang === 'vi' && Math.abs(st.vol - 0.35) < 0.01, st);
    // name used in praise
    await P.page.evaluate(() => IB.debug.startGame()); await sleep(200);
    await P.page.close();
    // URL ?lang=en&age=3 overrides for the session but is never saved
    P = await open(DEV.ipadP, 'seed=59&lang=en&age=3', { ctx });
    const u = await P.page.evaluate(() => ({ lang: document.documentElement.lang, title: document.getElementById('titleAge').textContent }));
    check('URL ?lang=en&age=3 applies for the session', u.lang === 'en' && /3/.test(u.title), u);
    await P.page.evaluate(() => IB.debug.startGame()); await sleep(300);
    const wa = await P.page.evaluate(() => IB.debug.world.age);
    check('URL age used by the world', wa === 3, wa);
    // open settings with the URL override and tap Done without changing anything
    await P.page.evaluate(() => IB.debug.goTitle()); await sleep(200);
    await gear(P);
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    const s2 = await P.page.evaluate(() => JSON.parse(localStorage.getItem('ib:settings') || '{}'));
    check('URL flags not saved even after opening settings + Done', s2.age === 6 && s2.lang === 'vi', s2);
    await P.page.close();
    P = await open(DEV.ipadP, 'seed=60&lang=vi&age=6', { ctx });
    await P.page.evaluate(() => localStorage.removeItem('ib:settings'));
    await P.page.close();
    P = await open(DEV.ipadP, 'seed=61&lang=vi&age=6', { ctx });
    await gear(P);
    // change only the volume while ?lang=vi&age=6 are active
    await P.page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = 80; v.dispatchEvent(new Event('input')); });
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    const s3 = await P.page.evaluate(() => JSON.parse(localStorage.getItem('ib:settings') || '{}'));
    check('?lang=vi&age=6 + a volume change: lang/age NOT written to storage', s3.lang !== 'vi' && s3.age !== 6, s3);
    const shown = await P.page.evaluate(() => { const a = document.querySelector('#ageChips .chip.on, #ageChips .chip.active, #ageChips .chip[aria-pressed="true"], #ageChips .chip.sel'); return a ? a.dataset.age : null; });
    check('(info) settings age chip shows the session age (6) under ?age=6', shown === '6', shown);
    noErr(check, 'settings', P); await ctx.close();
  },
  // ---------------------------------------------------------------- full sessions
  async sessions(check) {
    const seen = new Set();
    for (const age of [3, 4, 5, 6, 7]) {
      const d = [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL, DEV.iphoneP][age - 3];
      const P = await open(d, `seed=${70 + age}&age=${age}&speed=8&bot=1`);
      await P.page.evaluate(() => IB.debug.startGame());
      try {
        await until(P, () => IB.debug.mode === 'done', null, 300000);
        const s = await P.page.evaluate(() => ({ st: Object.assign({}, IB.debug.stats), levels: IB.debug.world.levels, gallery: IB.debug.world.gallery.length, stars: IB.debug.world.stars, hud: document.getElementById('hudStars').textContent, done: document.getElementById('doneStars').textContent }));
        s.levels.forEach(t => seen.add(t));
        check(`age ${age}: full session ${JSON.stringify(s.levels)}: 16 rounds, 4 talks`, s.st.rounds === 16 && s.gallery === 16 && s.st.talks === 4, s.st);
        check(`age ${age}: done-screen stars = world stars`, +s.done === s.stars, s);
        const topics = await P.page.evaluate(() => [...new Set(window.__ev.filter(e => e.type === 'level').map(e => e.topic))]);
        check(`age ${age}: 4 chapter topics seen`, topics.length === 4, topics);
      } catch (e) { check(`age ${age}: full session`, false, await P.page.evaluate(() => IB.debug.getState())); }
      noErr(check, `age ${age}`, P); await P.ctx.close();
    }
    const all = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
    check('every topic seen across ages 3..7', all.every(t => seen.has(t)), all.filter(t => !seen.has(t)));
    // a second session (Play again) rotates chapters
    const P = await open(DEV.iphoneL, `seed=80&age=4&speed=8&bot=1`);
    await P.page.evaluate(() => IB.debug.startGame());
    await until(P, () => IB.debug.mode === 'done', null, 300000).catch(() => {});
    const l1 = await P.page.evaluate(() => IB.debug.world.levels.slice());
    await tap(P, await center(P, '#btnAgain')); await sleep(400);
    const l2 = await P.page.evaluate(() => IB.debug.world.levels.slice());
    check('Play again (real tap) → a new session with rotated chapters', IB_eq(l1, l2) === false && (await P.page.evaluate(() => IB.debug.mode)) === 'play', { l1, l2 });
    noErr(check, 'again', P); await P.ctx.close();
  },
  // ---------------------------------------------------------------- Vietnamese everywhere
  async vi(check) {
    const P = await open(DEV.iphoneL, 'seed=90&age=4&lang=vi');
    const grab = () => P.page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.hidden'); };
      return [...document.querySelectorAll('h1,h2,h3,p,span,b,label,button,div')].filter(e => vis(e) && e.children.length === 0 && e.textContent.trim()).map(e => e.textContent.trim());
    });
    const EN = /\b(Play|Settings|Resume|Home|Done|Again|Sound|Music|Voice|Volume|Age|Name|Parents|Talk time|Chapter|Pick|Trace|cookie|Great|Yummy|Follow|Tap|Find|Let's|the)\b/;
    const report = {};
    const scan = async name => { const t = await grab(); const bad = t.filter(s => EN.test(s)); report[name] = bad; check(`vi ${name}: no English text visible`, bad.length === 0, bad.slice(0, 6)); return t; };
    await scan('title');
    await gear(P); await scan('settings');
    await tap(P, await center(P, '#btnSettingsDone')); await sleep(200);
    await tap(P, await center(P, '#btnPlay')); await sleep(400);
    await P.page.evaluate(() => IB.debug.setSpeed(4));
    await until(P, () => IB.debug.world.interactive, null, 20000);
    await P.page.evaluate(() => IB.debug.setSpeed(1)); await sleep(200);
    await scan('play');
    await tap(P, await center(P, '#btnPause')); await sleep(300); await scan('pause');
    await tap(P, await center(P, '#btnResume')); await sleep(200);
    await P.page.evaluate(() => IB.debug.world._startTalk());
    await until(P, () => IB.debug.mode === 'talk'); await sleep(300); await scan('talk');
    const aria = await P.page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).filter(a => /^(Pause|Quieter|Louder|Answer by talking|Parents: hold to open settings)$/.test(a)));
    check('vi: aria-labels translated (VoiceOver)', aria.length === 0, aria);
    await P.ctx.close();
    // a whole VI bot session: every bubble / voice line is Vietnamese
    const Q = await open(DEV.iphoneP, 'seed=91&age=5&lang=vi&speed=8&bot=1');
    await Q.page.evaluate(() => {
      window.__bub = []; const b = document.getElementById('bubbleText');
      new MutationObserver(() => { const t = b.textContent.trim(); if (t) window.__bub.push(t); }).observe(b, { childList: true, characterData: true, subtree: true });
      IB.debug.startGame();
    });
    await until(Q, () => IB.debug.mode === 'done', null, 300000).catch(() => {});
    const lines = await Q.page.evaluate(() => ({ bub: [...new Set(window.__bub)], voice: [...new Set((IB.debug.voiceLog || []).map(x => x.text))], done: document.getElementById('doneTitle').textContent }));
    const EN_W = /\b(the|and|is|are|you|your|let's|tap|find|trace|cookie|great|yummy|follow|dots|home|chips?|which|where|now|well done|good)\b/i;
    const notVi = arr => arr.filter(s => !VI_RE.test(s) && EN_W.test(s));
    check('vi session: every bubble line is Vietnamese', notVi(lines.bub).length === 0, notVi(lines.bub).slice(0, 8));
    check('vi session: every voice line is Vietnamese', notVi(lines.voice).length === 0, notVi(lines.voice).slice(0, 8));
    check('vi session: done title Vietnamese', VI_RE.test(lines.done), lines.done);
    noErr(check, 'vi', Q); await Q.ctx.close();
  },
  async audio(check) {
    const P = await open(DEV.iphoneP, 'seed=92&age=4', { voice: true });
    await tap(P, await center(P, '#btnPlay')); await sleep(500);
    const a = await P.page.evaluate(() => IB.debug.audio().gains());
    check('IB.debug.audio().gains() exists (loud chain, makeup 1.6, compressor)', a && a.makeup === 1.6 && a.compressor && Math.abs(a.user - 1.6) < 0.05, a);
    await tap(P, await center(P, '#btnPause')); await sleep(200);
    for (let i = 0; i < 12; i++) { await tap(P, await center(P, '#btnVolDown')); await sleep(40); }
    await sleep(400);
    const z = await P.page.evaluate(() => ({ g: IB.debug.audio().gains(), lbl: document.getElementById('volLevel').textContent, s: JSON.parse(localStorage.getItem('ib:settings')).volume }));
    check('volume − to 0 → gain 0, label 0 %, saved 0', z.g.user < 0.01 && z.lbl === '0%' && z.s === 0, z);
    for (let i = 0; i < 3; i++) { await tap(P, await center(P, '#btnVolUp')); await sleep(40); }
    await sleep(400);
    const u = await P.page.evaluate(() => IB.debug.audio().gains());
    check('volume + 3× → 30 % → gain 0.48', Math.abs(u.user - 0.48) < 0.03, u);
    await P.page.reload(); await until(P, () => window.IB && IB.debug && IB.debug.mode === 'title');
    check('volume persists after reload (0.3)', await P.page.evaluate(() => Math.abs(IB.debug.audio().volume - 0.3) < 0.01));
    noErr(check, 'audio', P); await P.ctx.close();
  }
};
function IB_eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

(async () => {
  srv = await serve(); browser = await chromium.launch();
  for (const n of Object.keys(G)) {
    if (ONLY.length && !ONLY.includes(n)) continue;
    const log = [];
    const check = (name, ok, info) => { results.push({ group: n, name, ok: !!ok, info: ok ? '' : info }); log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + JSON.stringify(info).slice(0, 500))); };
    const t0 = Date.now();
    try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 600)); }
    console.log(`[${n}] (${((Date.now() - t0) / 1000).toFixed(0)} s)\n  ` + log.join('\n  '));
  }
  results.push({ group: 'network', name: 'no request to an external host', ok: external.length === 0, info: external.slice(0, 10) });
  console.log(`[network]\n  ${external.length ? 'FAIL' : 'PASS'} no request to an external host ${external.length ? JSON.stringify(external.slice(0, 5)) : ''}`);
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED` : ''));
  process.exit(fails.length ? 1 : 0);
})();
