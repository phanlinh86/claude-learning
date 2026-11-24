// QA: after a rotation mid-swing, does Lolo sit on her (still sliding) log? Compares lolo.dx with the new log's dx.
const { chromium } = require('playwright'); const serve = require('../e2e/serve');
(async () => { const srv = await serve(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
  await page.goto(srv.url + '?mute=1&seed=3&age=4'); await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title');
  await page.evaluate(() => { window.__rot = 0; const w = LL.debug.world, o = w._emit; w._emit = function (e) { if (e.type === 'swing' && e.phase === 'grab' && this.round === 1 && !window.__rot) { window.__rot = 1; LL.debug.setSpeed(0.2); } return o.call(this, e); }; LL.debug.setBot(true, 1); LL.debug.setSpeed(6); LL.debug.startGame(); });
  await page.waitForFunction(() => window.__rot === 1, null, { timeout: 60000 });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.waitForTimeout(300); await page.screenshot({ path: __dirname + '/../out/qa/rotate_midswing.png' });
  for (let i = 0; i < 1; i++) { await page.waitForTimeout(250); console.log(JSON.stringify(await page.evaluate(() => { const w = LL.debug.world; return { ph: w.phase, sT: +w.scrollT.toFixed(2), loloDx: Math.round(w.lolo.dx), logDx: Math.round(w.buildingDx || 0), hang: w.lolo.hang, W: w.layout.W }; }))); }
  await b.close(); srv.close(); })();
