// Quick smoke run: loads the game, checks for errors, takes screenshots of title, ready, play (bot) and game over.
// usage: node tests/e2e/smoke.js [baseUrl]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8765/index.html';
  const out = __dirname + '/../out/';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '?mute=1&seed=42');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + 'title.png' });
  await page.click('#btnPlay');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + 'ready.png' });
  await page.evaluate(() => { FF.debug.setBot(true, 1); FF.debug.flap(); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: out + 'play.png' });
  await page.evaluate(() => FF.debug.setSpeed(8));
  await page.waitForTimeout(6000);
  await page.evaluate(() => FF.debug.setSpeed(1));
  await page.screenshot({ path: out + 'play_later.png' });
  console.log('state', JSON.stringify(await page.evaluate(() => FF.debug.getState())));
  await page.evaluate(() => { FF.debug.setBot(false); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: out + 'over.png' });
  console.log('mode after no input:', await page.evaluate(() => FF.debug.mode));
  console.log('stats', JSON.stringify(await page.evaluate(() => FF.debug.stats)));
  console.log('errors', JSON.stringify(errors, null, 1));
  await browser.close();
})();
