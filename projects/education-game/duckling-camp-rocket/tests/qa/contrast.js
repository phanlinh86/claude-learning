// Answer-colour contrast on every mood: forces 3 mats per launch with given colours, screenshots the play phase.
//   node tests/qa/contrast.js → tests/out/qa_visual/contrast/<dev>-m<mood>-<set>.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', 'contrast'); fs.mkdirSync(OUT, { recursive: true });
const SETS = { gyr: ['green', 'yellow', 'red'], bpo: ['blue', 'purple', 'orange'], pink: ['pink', 'green', 'yellow'] };
const OBJS = { gyr: 'flower', bpo: 'mushroom', pink: 'ball' };
(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  for (const d of [{ name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 }, { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 }]) {
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${srv.url}?mute=1&seed=9&age=6&lang=en`);
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title');
    await page.evaluate(() => DK.debug.startGame());
    for (let m = 0; m < 4; m++) for (const [k, cols] of Object.entries(SETS)) {
      await page.evaluate(([m]) => { const w = DK.debug.world; w.levels[m] = 'colors'; w.cfg.surpriseRounds = [99]; w.startLevel(m); DK.debug.weather.setWeather(m, { instant: true }); DK.debug.setSpeed(6); }, [m]);
      await page.waitForFunction(() => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'play' && w.phaseTime > 0.3; }, null, { timeout: 60000, polling: 'raf' });
      await page.evaluate(([cols, obj]) => { const w = DK.debug.world; DK.debug.setSpeed(1);
        w.mats.filter(x => x.launch === w.launch).forEach((x, i) => { x.thing = Object.assign({}, x.thing, { color: cols[i % cols.length], obj }); }); }, [cols, OBJS[k]]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${d.name}-m${m}-${k}.png`) });
    }
    await ctx.close();
  }
  await browser.close(); srv.close(); console.log('ok');
})();
