// Smoke run: boot, title, play with the bot (incl. a sped-up stretch through seasons), game over, no errors.
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8790/index.html';
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
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + 'deal.png' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + 'spring.png' });
  // a few manual taps on cards
  for (let i = 0; i < 4; i++) { const c = await page.evaluate(i => { const w = RF.debug.world; const k = w.cards.filter(c => c.state === 'down')[i]; return k && k.id; }, i); if (c != null) await page.evaluate(id => RF.debug.select(id), c); await page.waitForTimeout(250); }
  await page.screenshot({ path: out + 'flipped.png' });
  await page.evaluate(() => RF.debug.setBot(true, 1));
  for (const [ms, name] of [[2500, 'bot1'], [2500, 'bot2']]) { await page.waitForTimeout(ms); await page.screenshot({ path: out + name + '.png' }); }
  await page.evaluate(() => RF.debug.setSpeed(6));
  for (let s = 0; s < 4; s++) { await page.waitForTimeout(3500); await page.evaluate(() => RF.debug.setSpeed(1)); await page.waitForTimeout(400); await page.screenshot({ path: out + 'later' + s + '.png' }); console.log('state', JSON.stringify(await page.evaluate(() => RF.debug.getState()))); await page.evaluate(() => RF.debug.setSpeed(6)); }
  await page.evaluate(() => { RF.debug.setBot(false); RF.debug.setSpeed(20); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => RF.debug.setSpeed(1));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + 'over.png' });
  console.log('mode', await page.evaluate(() => RF.debug.mode), 'stats', JSON.stringify(await page.evaluate(() => RF.debug.stats)));
  console.log('errors', JSON.stringify(errors, null, 1));
  await browser.close();
})();
