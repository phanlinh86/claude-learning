// Score Card capture at 960 and iPhone portrait. Output: tests/out/visual/scorecard_*.png
const { chromium } = require('playwright'); const path = require('path');
const GAME = process.env.GAME_URL || ('file://' + path.resolve(__dirname, '../../game/index.html'));
const OUT = path.resolve(__dirname, '../out/visual');
(async () => {
  const b = await chromium.launch();
  for (const [n, o] of Object.entries({ '960': { viewport: { width: 960, height: 540 } }, iphoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, iphoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } })) {
    const c = await b.newContext(o); const p = await c.newPage();
    await p.goto(GAME + '?mute=1&seed=7&autostart=1&bot=1&speed=3');
    await p.waitForFunction(() => window.RP && RP.debug && RP.debug.mode !== 'boot');
    await p.waitForTimeout(5000);
    await p.evaluate(() => { const w = RP.debug.world; w.score = 1234; RP.Game.run.notes = 31; RP.Game.run.golds = 2; RP.Game.run.longest = 14; w._die(); });
    await p.waitForTimeout(2500);
    const btn = await p.$('text=Score Card'); if (btn) { await btn.click(); await p.waitForTimeout(1500); }
    await p.screenshot({ path: path.join(OUT, 'scorecard_' + n + '.png') }); console.log('scorecard_' + n, !!btn);
    await c.close();
  }
  await b.close();
})();
