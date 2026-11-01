// Quick screen tour: title → map → treasure → settings → profile editor → pause → done, on 2 viewports × both languages.
// node tests/e2e/screens.js   → tests/out/screens/*.png
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphoneL', viewport: { width: 852, height: 393 }, dpr: 2 },
  { name: 'iphoneP', viewport: { width: 393, height: 852 }, dpr: 2 },
  { name: 'ipadL', viewport: { width: 1180, height: 820 }, dpr: 1 }
];
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let errs = 0;
  for (const d of DEVICES) for (const lang of ['en', 'vi']) {
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    const shot = n => page.screenshot({ path: path.join(OUT, `${d.name}-${lang}-${n}.png`) });
    await page.goto(srv.url + '?mute=1&seed=5&profile=test&lang=' + lang);
    await page.waitForFunction(() => window.TR && TR.debug && TR.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(500); await shot('1-title');
    // seed some progress so the map has stars/trophies
    await page.evaluate(() => { const P = TR.Progress, p = P.current(); P.recordLagoon(p, 1, [9, 11, 13, 7]); P.recordChapter(p, 2, 0, 8, 40); P.setResume(p, { lagoon: 2, level: 1, levelStars: [8, 0, 0, 0], pearls: p.pearls }); });
    await page.evaluate(() => TR.debug.goMap()); await page.waitForTimeout(400); await shot('2-map');
    await page.click('#btnTreasure'); await page.waitForTimeout(300); await shot('3-treasure');
    await page.click('#btnTreasureBack'); await page.waitForTimeout(200);
    await page.evaluate(() => { TR.debug.goTitle(); });
    // parent gate: hold 2 s
    const gear = await page.$('#btnParents'); const bb = await gear.boundingBox();
    await page.touchscreen.tap; // noop ref
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
    await page.waitForTimeout(300); await shot('4-settings');
    const addBtn = await page.$('#settingsProfiles button:last-child'); if (addBtn) { await addBtn.click(); await page.waitForTimeout(300); await shot('5-profile-edit'); await page.click('#btnProfileCancel'); }
    await page.click('#btnSettingsDone'); await page.waitForTimeout(200);
    await page.evaluate(() => { TR.debug.setSpeed(4); TR.debug.startGame(2); }); await page.waitForTimeout(2500); await shot('6-play');
    await page.evaluate(() => TR.debug.pause()); await page.waitForTimeout(300); await shot('7-pause');
    await page.evaluate(() => TR.debug.resume());
    await page.evaluate(() => { TR.debug.setBot(true, 0.9); TR.debug.setSpeed(8); });
    try { await page.waitForFunction(() => TR.debug.mode === 'talk', null, { timeout: 60000 }); await page.waitForTimeout(400); await shot('8-talk'); } catch (e) { errors.push('no talk'); }
    try { await page.waitForFunction(() => TR.debug.mode === 'done', null, { timeout: 120000 }); await page.waitForTimeout(900); await shot('9-done'); } catch (e) { errors.push('no done'); }
    await page.click('#btnDoneMap'); await page.waitForTimeout(400); await shot('9b-map-after');
    if (errors.length) { errs++; console.log('ERR', d.name, lang, errors.slice(0, 4)); } else console.log('ok', d.name, lang);
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(errs ? 1 : 0);
})();
