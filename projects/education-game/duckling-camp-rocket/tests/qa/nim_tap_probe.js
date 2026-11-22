// QA probe: where on Nim's body does a REAL tap count as a stone press? (Nim standing on a stone, and Nim mid-hop)
//   node tests/qa/nim_tap_probe.js
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEVS = { 'iphone-p': [393, 852, 3], 'iphone-l': [852, 393, 3], 'ipad-p': [820, 1180, 2], 'ipad-l': [1180, 820, 2] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve(); const b = await chromium.launch(); let bad = 0;
  for (const [name, [w, h, dpr]] of Object.entries(DEVS)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(srv.url + '?mute=1&seed=12&age=4');
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title');
    await page.evaluate(() => { DK.debug.startGame(); const W = DK.debug.world; W.levels[0] = 'colors'; W.startLevel(0); W.cfg.surpriseRounds = [9]; DK.debug.setSpeed(4); });
    const ready = () => page.waitForFunction(() => { const W = DK.debug.world; return W.interactive && W.stones.every(s => s.state !== 'rise'); }, null, { timeout: 30000, polling: 'raf' });
    // round 1 (2 x 3 or 3 x 2): hop once by a real tap, then probe Nim standing on row 0
    await ready(); await page.evaluate(() => DK.debug.setSpeed(1));
    const a = await page.evaluate(() => DK.debug.stoneScreen(DK.debug.answer().id));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => DK.debug.setSpeed(4)); await ready(); await page.evaluate(() => DK.debug.setSpeed(0.1));
    const r = await page.evaluate(() => {
      const W = DK.debug.world, L = W.layout, b = W.nimHit(); let n = 0, st = 0; const hits = {};
      for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
        const x = b.x + b.w * (i + 0.5) / 20, y = b.y + b.h * (j + 0.5) / 20; n++;
        const s = W._stoneAt(x, y);
        if (s && !s.s.visited && s.s.state === 'rest') { st++; const k = s.s.target ? 'right' : 'wrong'; hits[k] = (hits[k] || 0) + 1; }
      }
      const head = W._stoneAt(b.x + b.w / 2, b.y + b.h * 0.25);
      return { box: [b.x | 0, b.y | 0, b.w | 0, b.h | 0], pct: Math.round(100 * st / n), hits, head: head && !head.s.visited ? (head.s.target ? 'right' : 'WRONG') + ' ' + head.s.id : 'nim', row: W.row };
    });
    // a REAL tap on Nim's face while he stands: what does the world do?
    await page.evaluate(() => DK.debug.setSpeed(1));
    const face = await page.evaluate(() => { const b = DK.debug.nimScreen(); return { x: b.x + b.w / 2, y: b.y + b.h * 0.25 }; });
    const m0 = await page.evaluate(() => DK.debug.world.misses);
    const e0 = await page.evaluate(() => DK.debug.events.length);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: face.x, y: face.y }] }); await sleep(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    const after = await page.evaluate(([m0, e0]) => ({ misses: DK.debug.world.misses - m0, ev: DK.debug.events.slice(e0).map(e => e.type).join(',') }), [m0, e0]);
    console.log(`${name.padEnd(9)} Nim standing on row ${r.row - 1}: ${r.pct}% of his tap box is taken by stones ${JSON.stringify(r.hits)}; the centre of his face → ${r.head}; real tap on his face → ${after.ev} (misses +${after.misses}) ${errs.join(' ')}`);
    if (after.misses > 0 || /wrong|right/.test(after.ev)) bad++;
    // mid-hop: tap the right stone, then tap the centre of Nim's (airborne) box 120 / 220 / 320 ms later
    const res = [];
    for (let k = 0, guard = 0; k < 9 && guard < 40; guard++) {
      await page.evaluate(() => DK.debug.setSpeed(4));
      const okR = await page.waitForFunction(() => { const W = DK.debug.world; return W.interactive && W.stones.every(s => s.state !== 'rise'); }, null, { timeout: 30000, polling: 'raf' }).then(() => true).catch(() => false);
      if (!okR) break;
      if (await page.evaluate(() => { const W = DK.debug.world; return W.row >= W.cur.k - 1; })) {   // last row: just finish the crossing
        const at = await page.evaluate(() => DK.debug.stoneScreen(DK.debug.answer().id));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] }); await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(300); continue;
      }
      k++;
      await page.evaluate(() => { DK.debug.setSpeed(1); const W = DK.debug.world; if (!W.__pd) { const o = W.pointerDown; W.pointerDown = function (x, y) { const r = o.call(this, x, y); (window.__pd = window.__pd || []).push(r); return r; }; W.__pd = 1; } window.__pd = []; });
      const m1 = await page.evaluate(() => DK.debug.world.misses), e1 = await page.evaluate(() => DK.debug.events.length);
      const at = await page.evaluate(() => DK.debug.stoneScreen(DK.debug.answer().id));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] }); await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(90 + 100 * ((k - 1) % 3));
      const nb = await page.evaluate(() => DK.debug.nimScreen());
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nb.cx, y: nb.cy }] }); await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(900);
      const o = await page.evaluate(([m1, e1]) => ({ pd: window.__pd.slice(), dm: DK.debug.world.misses - m1, ev: DK.debug.events.slice(e1).map(e => e.type).filter(t => /right|wrong|pokeNim|squish/.test(t)).join(',') }), [m1, e1]);
      res.push(`${90 + 100 * ((k - 1) % 3)}ms: ${o.pd.join('/')} → ${o.ev}${o.dm ? ' MISS+' + o.dm : ''}`);
      if (o.dm) bad++;
    }
    console.log(`   mid-hop taps on Nim: ${res.join(' ; ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  process.exit(bad ? 1 : 0);
})();
