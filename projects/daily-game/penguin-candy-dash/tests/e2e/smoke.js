// Smoke run: boot, title, play with keys + mouse, then the bot through several biomes at speed, game over, no errors.
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8800/index.html';
  const out = __dirname + '/../out/'; require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '?mute=1&seed=42');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + 'title.png' });
  await page.click('#btnPlay');
  await page.waitForTimeout(700); await page.screenshot({ path: out + 'banner.png' });
  await page.waitForTimeout(1200);
  const p0 = await page.evaluate(() => CD.debug.getState().pip);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
  const p1 = await page.evaluate(() => CD.debug.getState().pip);
  console.log('keys move pip', JSON.stringify(p0), '->', JSON.stringify(p1));
  await page.mouse.move(400, 500); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  console.log('mouse move pip', JSON.stringify(await page.evaluate(() => CD.debug.getState().pip)));
  await page.screenshot({ path: out + 'meadow.png' });
  await page.evaluate(() => CD.debug.setBot(true, 1));
  for (let s = 0; s < 5; s++) { await page.evaluate(() => CD.debug.setSpeed(6)); await page.waitForTimeout(3500); await page.evaluate(() => CD.debug.setSpeed(1)); await page.waitForTimeout(400); await page.screenshot({ path: out + 'later' + s + '.png' }); console.log('state', JSON.stringify(await page.evaluate(() => CD.debug.getState()))); }
  await page.evaluate(() => { CD.debug.setBot(true, 0.05); CD.debug.setSpeed(20); });
  await page.waitForTimeout(9000);
  await page.evaluate(() => CD.debug.setSpeed(1)); await page.waitForTimeout(1500);
  await page.screenshot({ path: out + 'over.png' });
  console.log('mode', await page.evaluate(() => CD.debug.mode), 'stats', JSON.stringify(await page.evaluate(() => CD.debug.stats)));
  console.log('errors', JSON.stringify(errors, null, 1));
  await browser.close();
})();
