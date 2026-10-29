// Visual QA: capture every menu panel at several window sizes.
// Usage: node tests/visual/menus.js  (needs game served on :8772)
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const URL = 'http://localhost:8772/index.html?mute=1&seed=42';
const SIZES = [[1280, 720], [1920, 1080], [800, 600]];

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
    await page.waitForTimeout(1200);
    const tag = `${w}x${h}`;
    const shot = n => page.screenshot({ path: path.join(OUT, `menu_${n}_${tag}.png`) });
    await shot('title');
    await page.click('#btnHow'); await page.waitForTimeout(500); await shot('how');
    await page.click('#scrHow .btn-back'); await page.waitForTimeout(200);
    await page.click('#btnSettings'); await page.waitForTimeout(500); await shot('settings');
    await page.click('#scrSettings .btn-back'); await page.waitForTimeout(200);
    await page.click('#btnCustomize'); await page.waitForTimeout(600); await shot('custom');
    await page.click('#scrCustom .btn-back'); await page.waitForTimeout(200);
    await page.click('#btnPlay'); await page.waitForTimeout(600); await shot('ready');
    await page.evaluate(() => { FF.debug.setBot(true, 1); FF.debug.flap(); });
    await page.waitForTimeout(2500); await shot('playing');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500); await shot('pause');
    await page.click('#btnResume'); await page.waitForTimeout(200);
    await page.evaluate(() => { FF.debug.setBot(false); FF.debug.world.score = 23; FF.debug.world.hits = 23; });
    await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 15000 });
    await page.waitForTimeout(1200); await shot('over');
    console.log(tag, 'errors:', errs);
    await page.close();
  }
  await browser.close();
})();
