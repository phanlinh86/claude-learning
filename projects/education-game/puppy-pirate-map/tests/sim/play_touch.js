#!/usr/bin/env node
// Mit's Treasure Map — "I play it myself": the real page at speed 1 in Playwright with REAL touch drags (CDP touch events),
// reading TM.debug.pieceScreen / slotScreen. The finger presses where the piece WAS `--react` ms ago (a 4-year-old's
// reaction lag while it bobs), drags in ≈ 0.9 s and lets go. Logs grabs missed, fits, phase timings, screenshots.
//   node tests/sim/play_touch.js [--secs 60] [--age 4] [--lang en] [--react 350] [--vp ipad|iphone]
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SECS = +get('secs', 60), AGE = +get('age', 4), LANG = get('lang', 'en'), REACT = +get('react', 350), VP = get('vp', 'ipad');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const vp = VP === 'iphone' ? { width: 852, height: 393, dpr: 3 } : { width: 1180, height: 820, dpr: 2 };
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${srv.url}?mute=1&age=${AGE}&lang=${LANG}&seed=17`);
  await page.waitForFunction(() => window.TM && TM.debug && TM.debug.mode === 'title', null, { timeout: 20000 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12 }] });
  await page.evaluate(() => {
    const w = TM.debug.world, emit = w._emit.bind(w); window.__ev = [];
    w._emit = e => { window.__ev.push({ type: e.type, t: +w.time.toFixed(2), id: e.id }); return emit(e); };
    TM.debug.startGame();
  });
  const log = [], t0 = Date.now(); let shots = 0, drags = 0, missGrab = 0, fits = 0, bobErr = [];
  const shot = async n => { if (shots < 8) { shots++; await page.screenshot({ path: path.join(OUT, `play_${n}.png`) }); } };
  let shotWash = false, shotRoll = false, shotFly = false;
  while (Date.now() - t0 < SECS * 1000) {
    const s = await page.evaluate(() => { const w = TM.debug.world; return { st: w.state, ph: w.phase, inter: w.interactive, pt: w.phaseTime, ans: TM.debug.answer(), sT: w.board.scrollT, turn: w.board.turn }; });
    if (s.st === 'round' && s.ph === 'enter' && s.pt > 0.5 && !shotWash) { shotWash = true; await shot('washin'); }
    if (s.st === 'roundDone' && s.ph === 'turn' && s.turn > 0.5 && s.sT === 0 && !shotRoll) { shotRoll = true; await shot('rollup'); }
    if (s.st === 'roundDone' && s.ph === 'turn' && s.sT > 0.3 && !shotFly) { shotFly = true; await shot('scrollfly'); }
    if (s.st === 'talk') { const ok = await page.evaluate(() => { const t = TM.debug.world.talk; if (!t || TM.debug.world.talkAnswered) return false; return TM.debug.world.talkAnswer(t.answer); }); await sleep(1500); continue; }
    if (!s.inter || !s.ans) { await sleep(60); continue; }
    await sleep(1200);   // listening to Mit + thinking
    const before = await page.evaluate(id => TM.debug.pieceScreen(id), s.ans.piece);
    if (!before) continue;
    await sleep(REACT);   // the finger arrives where the piece WAS
    const now = await page.evaluate(id => TM.debug.pieceScreen(id), s.ans.piece);
    bobErr.push(Math.hypot(now.x - before.x, now.y - before.y));
    drags++;
    await touch('touchStart', before.x, before.y + 6);
    await sleep(40);
    const held = await page.evaluate(() => TM.debug.world.held ? TM.debug.world.held.id || TM.debug.world.held : null);
    if (!held) { missGrab++; await touch('touchEnd'); log.push('grab missed (piece moved ' + bobErr[bobErr.length - 1].toFixed(1) + ' px, r ' + now.r.toFixed(0) + ')'); continue; }
    const slot = await page.evaluate(id => TM.debug.slotScreen(id), s.ans.slot);
    const N = 50;
    for (let i = 1; i <= N; i++) { const u = i / N, e = u * u * (3 - 2 * u); await touch('touchMove', before.x + (slot.x - before.x) * e, before.y + 6 + (slot.y - before.y - 10) * e - Math.sin(u * Math.PI) * 40); await sleep(18); }
    await sleep(120); await touch('touchEnd');
    await sleep(250);
    const placed = await page.evaluate(id => { const p = TM.debug.world.pieceById(id); return p && (p.state === 'snap' || p.state === 'placed'); }, s.ans.piece);
    if (placed) fits++; else log.push('drop did not fit: ' + JSON.stringify(slot));
  }
  const ev = await page.evaluate(() => window.__ev);
  // phase timings from events
  const tl = []; let r0 = 0, ask0 = -1, done0 = -1;
  for (const e of ev) {
    if (e.type === 'round') { if (done0 >= 0) tl.push({ k: 'roundDone→next round', d: e.t - done0 }); r0 = e.t; ask0 = -1; }
    if (e.type === 'ask' && ask0 < 0) { ask0 = e.t; tl.push({ k: 'round→first ask (unroll + wash-in)', d: e.t - r0 }); }
    if (e.type === 'roundDone') done0 = e.t;
    if (e.type === 'boardOut') tl.push({ k: 'roundDone→boardOut', d: e.t - done0 });
    if (e.type === 'scrollCatch') tl.push({ k: 'roundDone→scrollCatch', d: e.t - done0 });
  }
  const agg = {}; tl.forEach(x => { (agg[x.k] = agg[x.k] || []).push(x.d); });
  const wt = await page.evaluate(() => ({ wt: TM.debug.world.time, st: TM.debug.world.state, ph: TM.debug.world.phase, fr: TM.debug.stats.frames, slow: TM.debug.stats.slowFrames }));
  const res = { world: wt, wall: (Date.now() - t0) / 1000, age: AGE, lang: LANG, react: REACT, drags, missGrab, fits, bobMovePx: { mean: bobErr.reduce((a, b) => a + b, 0) / Math.max(1, bobErr.length), max: Math.max(0, ...bobErr) },
    rounds: ev.filter(e => e.type === 'roundDone').length, timings: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)])), log: log.slice(0, 10), errors };
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close(); process.exit(0);
})();
