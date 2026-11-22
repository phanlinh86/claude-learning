// QA probe: the same wrong stone tapped twice within 1 s is ONE miss (real CDP touches, world-time stamps printed).
//   node tests/qa/same_wrong_probe.js
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(); const b = await chromium.launch(); let bad = 0, n = 0;
  for (const [w, h, dpr] of [[820, 1180, 2], [393, 852, 3]]) for (const topic of ['count', 'colors', 'animals']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    await page.goto(srv.url + '?mute=1&seed=3&age=4');
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title');
    await page.evaluate(t => { DK.debug.startGame(); const W = DK.debug.world; W.levels[0] = t; W.startLevel(0); DK.debug.setSpeed(4);
      const o = W._emit; W._emit = function (e) { e._t = W.time; (window.__e = window.__e || []).push({ type: e.type, id: e.id, t: W.time, repeat: e.repeat }); return o.call(this, e); }; }, topic);
    await page.waitForFunction(() => { const W = DK.debug.world; return W.interactive && W.stones.every(s => s.state !== 'rise'); }, null, { timeout: 30000, polling: 'raf' });
    await page.evaluate(() => DK.debug.setSpeed(1));
    for (const gap of [150, 450, 800]) {
      const id = await page.evaluate(() => { const W = DK.debug.world; const s = W.stones.find(s => s.row === W.row && !s.target && s.state === 'rest'); return s && s.id; });
      const at = await page.evaluate(i => DK.debug.stoneScreen(i), id);
      const m0 = await page.evaluate(() => DK.debug.world.misses);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(gap);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(200);
      const r = await page.evaluate(([m0, id]) => ({ dm: DK.debug.world.misses - m0, ev: window.__e.filter(e => e.id === id && (e.type === 'wrong' || e.type === 'squish')).slice(-2).map(e => e.type + '@' + e.t.toFixed(2)) }), [m0, id]);
      n++; if (r.dm !== 1) bad++;
      console.log(`${w}x${h} ${topic} gap ${gap} ms: misses +${r.dm} ${r.ev.join(' ')}`);
      await sleep(1300);
    }
    await ctx.close();
  }
  console.log(`${n - bad}/${n} OK`); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
