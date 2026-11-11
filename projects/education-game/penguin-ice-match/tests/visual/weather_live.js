// Live weather (particles running, world thawed) per stage × device: rain/snow over the blocks?   node tests/visual/weather_live.js
const path = require('path'); const V = require('./lib');
(async () => {
  await V.start(); const dir = V.mk(path.join(V.OUT, 'weather'));
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const lv of [0, 1, 2, 3]) {
    const { ctx, page } = await V.open(dev, `age=4&lang=en`);
    await page.evaluate(lv => { const D = IM.debug; D.startGame(); D.gotoLevel(lv); }, lv);
    await V.sleep(6500);
    await V.shot(page, path.join(dir, `${dev}-s${lv}.png`));
    const n = await page.evaluate(() => { const w = IM.debug.weather; return { n: w.particles.length, kinds: w.particles.reduce((a, p) => (a[p.kind || p.type || p.k] = (a[p.kind || p.type || p.k] || 0) + 1, a), {}), phase: IM.debug.world.phase }; });
    console.log(dev, lv, JSON.stringify(n));
    await ctx.close();
  }
  await V.stop();
})();
