// Visual QA: the Autumn banner arrow vs the real current direction (seed 42 → current flows LEFT).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://127.0.0.1:8792/index.html?mute=1&seed=42&level=2');
  await p.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  await p.evaluate(() => { RF.Game.settings.peek = 0; RF.debug.startGame(); RF.debug.setSpeed(0); const G = RF.Game; for (let i = 0; i < 96; i++) { G.step(1/120); G.renderer.update(1/120); } });
  await p.waitForTimeout(100);
  console.log(JSON.stringify(await p.evaluate(() => RF.debug.world.gravity)));
  await p.screenshot({ path: __dirname + '/../out/visual/banner_autumn.png' });
  await b.close();
})();
