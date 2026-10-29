// Visual QA: capture every menu screen at three window sizes.
const { chromium } = require('playwright');
const OUT = __dirname + '/../out/visual/';
const BASE = process.argv[2] || 'http://127.0.0.1:8792/index.html';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [vw, vh] of [[1280, 720], [1920, 1080], [800, 600]]) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '?mute=1&seed=42');
    await page.waitForTimeout(2500);
    const tag = vw + 'x' + vh;
    const shot = n => page.screenshot({ path: OUT + 'menu_' + n + '_' + tag + '.png' });
    await shot('title');
    await page.click('#btnHow'); await page.waitForTimeout(500); await shot('how');
    console.log(tag, 'how panel', JSON.stringify(await page.evaluate(() => { const p = document.querySelector('#scrHow .panel'); const r = p.getBoundingClientRect(); return { w: r.width, h: r.height, scrollH: p.scrollHeight, clientH: p.clientHeight, gridKids: document.querySelector('#scrHow .how-grid').children.length }; })));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('#btnSettings'); await page.waitForTimeout(500); await shot('settings');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('#btnCustomize'); await page.waitForTimeout(600); await shot('custom');
    console.log(tag, 'custom panel overflow', JSON.stringify(await page.evaluate(() => { const p = document.querySelector('#scrCustom .panel'); return { scrollH: p.scrollHeight, clientH: p.clientHeight }; })));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('#btnPlay'); await page.waitForTimeout(3500);
    await shot('ingame');
    await page.keyboard.press('Escape'); await page.waitForTimeout(500); await shot('pause');
    await page.click('#btnResume'); await page.waitForTimeout(200);
    await page.evaluate(() => { RF.debug.world.air = 0.05; });
    await page.waitForTimeout(2600); await shot('over');
    await page.close();
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
