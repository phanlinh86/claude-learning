// Visual QA: gameplay in each season + transition crossfade + banner.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const BASE = 'http://localhost:8772/index.html?mute=1&seed=42';

async function setup(page, prevSeason) {
  await page.evaluate((ps) => {
    FF.debug.startGame();
    FF.debug.setBot(true, 1); FF.debug.flap();
    const w = FF.debug.world, G = FF.Game;
    w.score = ps * 10 + 9; w.seasonIndex = ps; w.season = ps;
    G.weather.setSeason(ps, { instant: true }); G.renderer.setSeason(ps, true);
  }, prevSeason);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE);
  await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  const names = ['spring', 'summer', 'autumn', 'winter'];
  for (let target = 1; target <= 4; target++) {
    const ps = target - 1, tn = names[target % 4];
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      await setup(page, ps);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `season_${names[ps]}_steady.png`) });
      try {
        await page.waitForFunction((t) => FF.debug.world.season === t, target % 4, { timeout: 25000, polling: 16 });
        ok = true;
      } catch (e) { console.log('retry', tn, await page.evaluate(() => FF.debug.getState())); }
    }
    if (!ok) { console.log('FAILED to reach', tn); continue; }
    await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `season_${tn}_banner.png`) });
    await page.waitForTimeout(800); await page.screenshot({ path: path.join(OUT, `season_${tn}_crossfade.png`) });
    await page.waitForTimeout(3500); await page.screenshot({ path: path.join(OUT, `season_${tn}_after.png`) });
    console.log('reached', tn, 'alive', await page.evaluate(() => FF.debug.world.state));
  }
  // hit boxes view
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p2.goto(BASE + '&debug=1');
  await p2.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  await p2.evaluate(() => { FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap(); });
  await p2.waitForTimeout(3000);
  await p2.screenshot({ path: path.join(OUT, 'debug_hitboxes.png') });
  console.log('errors', errs);
  await browser.close();
})();
