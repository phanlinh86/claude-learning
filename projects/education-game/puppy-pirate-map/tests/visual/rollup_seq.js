// Visual QA: frame sequence of the roll-up + scroll flight to Mit (slow motion) per device.  node tests/visual/rollup_seq.js
const { chromium } = require('playwright'); const path = require('path'); const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual', 'seq');
const DEVS = { 'ip-p': [393, 852, 47, 0, 34, 0], 'ip-l': [852, 393, 0, 47, 21, 47], 'pad-p': [820, 1180, 24, 0, 20, 0], 'pad-l': [1180, 820, 24, 0, 20, 0] };
(async () => {
  const srv = await serve(), b = await chromium.launch();
  for (const [dev, d] of Object.entries(DEVS)) {
    const ctx = await b.newContext({ viewport: { width: d[0], height: d[1] }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
    await page.goto(srv.url + '?mute=1&novoice=1&seed=5&age=4&lang=en');
    await page.waitForFunction(() => window.TM && TM.debug && TM.debug.mode === 'title');
    await page.addStyleTag({ content: `:root{--sa-t:${d[2]}px!important;--sa-r:${d[3]}px!important;--sa-b:${d[4]}px!important;--sa-l:${d[5]}px!important}` });
    await page.evaluate(() => { dispatchEvent(new Event('resize')); TM.debug.startGame(); TM.debug.setSpeed(3); TM.debug.setBot(true, 1); });
    for (let k = 0; k < 3000 && !(await page.evaluate(() => TM.debug.world.phase === 'alive')); k++) await new Promise(r => setTimeout(r, 20));
    console.log(dev, await page.evaluate(() => JSON.stringify(TM.debug.getState()).slice(0, 120)));
    await page.evaluate(() => { TM.debug.setBot(false); TM.debug.setSpeed(0.15); const w = TM.debug.world; w.crab = null; w.bubbles = []; });
    const cfg = await page.evaluate(() => TM.debug.world.cfg); const T = cfg.turnTime, F = cfg.scrollFlyTime;
    for (const [i, t] of [0.2, 0.45, 0.7, 0.88].map(f => f * T).concat([0.2, 0.5, 0.8, 0.97].map(f => T + f * F)).entries()) {
      for (let k = 0; k < 3000 && !(await page.evaluate(t => { const w = TM.debug.world; return w.phase === 'turn' && w.phaseTime >= t; }, t)); k++) await new Promise(r => setTimeout(r, 5));
      await page.screenshot({ path: path.join(OUT, `${dev}-roll${i}.png`) });
    }
    await ctx.close();
  }
  await b.close(); srv.close();
})();
