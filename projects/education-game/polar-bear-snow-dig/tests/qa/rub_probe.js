// QA probe (report-only): how fast does a real CDP touch rub reach the world, and how many strokes / scoops does it
// give? Prints, per viewport: wall ms per touchMove, rub strokes (world time), dig events, reveal time after the first dig.
//   node tests/qa/rub_probe.js [dtMs=12] [sub=5] [swings=5] [amp=50]
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const [dt = 12, sub = 5, swings = 5, amp = 50] = process.argv.slice(2).map(Number);
const DEV = { iphoneP: [393, 852, 3], iphoneL: [852, 393, 3], ipadP: [820, 1180, 2], ipadL: [1180, 820, 2] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(), br = await chromium.launch();
  for (const [n, [w, h, dpr]] of Object.entries(DEV)) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    await page.goto(srv.url + '?mute=1&seed=5&age=4');
    await page.waitForFunction(() => window.NK && NK.debug && NK.debug.mode === 'title');
    await page.evaluate(() => { NK.debug.startGame(); const w = NK.debug.world; w.cfg.surpriseTypes = []; w.levels[1] = 'colors'; w.startLevel(1); NK.debug.setSpeed(5); });
    await page.waitForFunction(() => NK.debug.world.interactive, null, { polling: 30 });
    await page.evaluate(() => { NK.debug.setSpeed(1); const w = NK.debug.world; window.__e = []; const o = w.drainEvents.bind(w); w.drainEvents = () => { const e = o(); for (const x of e) window.__e.push({ type: x.type, wt: w.time, again: x.again, added: x.added, queued: x.queued, result: x.result }); return e; }; });
    const id = await page.evaluate(() => NK.debug.answer().mound), p = await page.evaluate(i => NK.debug.moundScreen(i), id);
    const t0 = Date.now(); let moves = 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); await sleep(30);
    let x = p.x;
    for (let i = 0; i < swings; i++) {
      const to = p.x + (i % 2 ? -amp : amp);
      for (let k = 1; k <= sub; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (to - x) * k / sub, y: p.y, id: 1 }] }); moves++; await sleep(dt); }
      x = to;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const wall = Date.now() - t0;
    await page.waitForFunction(() => window.__e.some(e => e.type === 'reveal'), null, { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(() => { const E = window.__e, d0 = E.find(e => e.type === 'dig'), rv = E.find(e => e.type === 'reveal'); return { s: NK.debug.view().s, rubs: E.filter(e => e.type === 'rub').map(e => +(e.wt - d0.wt).toFixed(2)), digs: E.filter(e => e.type === 'dig').map(e => [e.again, e.added, e.queued]), scoops: E.filter(e => e.type === 'scoop').map(e => +(e.wt - d0.wt).toFixed(2)), reveal: rv && +(rv.wt - d0.wt).toFixed(2) }; });
    console.log(n, JSON.stringify({ wallMs: wall, msPerMove: +(wall / moves).toFixed(1), ampLogical: +(amp / r.s).toFixed(0), ...r }));
    await ctx.close();
  }
  await br.close(); srv.close();
})();
