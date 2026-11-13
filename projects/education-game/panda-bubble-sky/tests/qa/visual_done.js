// Visual QA: the celebration over time (1.5 / 3 / 5 / 8 s) on one device.  DEV=ip-l node tests/qa/visual_done.js
const { chromium } = require('playwright'); const serve = require('../e2e/serve'); const G = require('./visual_geom'); const path = require('path');
const DEV = process.env.DEV || 'ip-l', LANG = process.env.QLANG || 'en';
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  const { page, ctx } = await G.open(browser, srv, DEV, LANG, 4, 5);
  await page.evaluate(() => { PB.debug.startGame(); const w = PB.debug.world; w.startLevel(3); PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
  await page.waitForFunction(() => PB.debug.mode === 'done', null, { timeout: 100000, polling: 50 });
  await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); });
  let t = 0;
  for (const at of [1500, 3000, 5000, 8000]) { await page.waitForTimeout(at - t); t = at; await page.screenshot({ path: path.join(__dirname, '..', 'out', 'qa_visual', `done-${DEV}-${LANG}-${at}.png`) }); }
  console.log(page._errs.join('\n'));
  await ctx.close(); await browser.close(); srv.close();
})();
