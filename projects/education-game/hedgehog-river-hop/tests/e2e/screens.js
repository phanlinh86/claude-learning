// Visual QA screenshots (Nim's River Hop): title, play in each season, wrong + hint, a hop mid-air, a countSel count above
// Nim, the bank roll, Talk time and the done screen, on iPhone portrait / landscape and iPad portrait / landscape (CSS-px
// screenshots, deviceScaleFactor 1). Writes tests/out/screens/<device>-<name>.png.   node tests/e2e/screens.js [devices]
// (devices: comma list of iphone-portrait,iphone-landscape,ipad-portrait,ipad-landscape; default all)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 } },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 } },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 } },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 } }
];
const want = (process.argv[2] || '').split(',').filter(Boolean);
const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });
(async () => {
  const srv = await serve(), browser = await chromium.launch();
  let errors = 0;
  for (const d of DEVICES) {
    if (want.length && !want.includes(d.name)) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    const shot = name => page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) });
    const fresh = async (q, lang) => {
      await page.goto(`${srv.url}?mute=1&seed=${q.seed || 3}&age=${q.age || 4}${lang ? '&lang=' + lang : ''}`);
      await waitFor(page, () => window.NH && NH.debug && NH.debug.mode === 'title', null, 20000);
    };
    const start = async (topic, level, age) => {
      await page.evaluate(([t, lv]) => { NH.debug.startGame(); const w = NH.debug.world; w.levels[lv] = t; w.startLevel(lv); NH.debug.setSpeed(4); }, [topic, level]);
      await waitFor(page, () => NH.debug.world.interactive && NH.debug.world.phaseTime > 1.2);
      await page.evaluate(() => NH.debug.setSpeed(1));
      await page.waitForTimeout(300);
    };
    try {
      await fresh({});
      await page.waitForTimeout(1600);
      await shot('0-title');
      for (let lv = 0; lv < 4; lv++) {
        await fresh({ seed: 3 + lv, age: lv === 2 ? 6 : 4 }, lv === 3 ? 'vi' : '');
        await start(['colors', 'shapes', 'animals', 'count'][lv], lv);
        await page.waitForTimeout(lv === 0 ? 300 : 2600);   // the season crossfade
        await shot(`1-play-${['spring', 'summer', 'autumn', 'winter-vi'][lv]}`);
      }
      // wrong + hint (two wrong stones of the active row), then a hop mid-air
      await fresh({ seed: 6 });
      await start('colors', 0);
      await page.evaluate(() => { const w = NH.debug.world, wr = w.stones.filter(s => s.row === w.row && !s.target && s.state === 'rest'); for (const s of wr.slice(0, 2)) { const h = w.stoneHit(s.id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); } });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const w = NH.debug.world; const h = w.hint && w.hint(); });
      await page.waitForTimeout(700);
      await shot('2-wrong-hint');
      await page.evaluate(() => { NH.debug.setSpeed(0.25); const w = NH.debug.world, a = NH.debug.answer(), h = w.stoneHit(a.id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
      await waitFor(page, () => NH.debug.world.nim.state === 'air' && NH.debug.world._hop && NH.debug.world._hop.t > 0.2);
      await shot('3-hop');
      // the bank roll: let the bot finish the crossing, freeze while Nim rolls over the fruit
      await page.evaluate(() => { NH.debug.setSpeed(1); NH.debug.setBot(true, 1); });
      await waitFor(page, () => NH.debug.world.nim.state === 'roll' && NH.debug.world.nim.curl > 0.8);
      await page.evaluate(() => NH.debug.setSpeed(0.05));
      await page.waitForTimeout(300);
      await shot('4-bank-roll');
      await page.evaluate(() => NH.debug.setSpeed(1));
      await waitFor(page, () => NH.debug.world.state === 'roundDone');
      await page.waitForTimeout(250);
      await shot('5-fruit-on-back');
      // countSel: dots counted above Nim
      await fresh({ seed: 8 });
      await start('count', 0);
      await page.evaluate(() => { NH.debug.setBot(true, 1); NH.debug.setSpeed(6); });
      await waitFor(page, () => NH.debug.world.round === 1 && NH.debug.world.interactive && NH.debug.world.phaseTime > 1, null, 90000);
      await page.evaluate(() => { NH.debug.setBot(false); NH.debug.setSpeed(1); const w = NH.debug.world, a = NH.debug.answer(), h = w.stoneHit(a.id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
      await waitFor(page, () => NH.debug.world.stones.some(s => s.count >= 2));
      await shot('6-count-sel');
      // Talk time
      await page.evaluate(() => { NH.debug.setBot(true, 1); NH.debug.setSpeed(8); });
      await waitFor(page, () => NH.debug.world.state === 'talk', null, 120000);
      await page.evaluate(() => { NH.debug.setBot(false); NH.debug.setSpeed(1); });
      await page.waitForTimeout(800);
      await shot('7-talk');
      // the wipe curtain mid-way + the done screen (a fast bot session)
      await page.goto(`${srv.url}?mute=1&seed=11&age=4&bot=1&speed=10&autostart=1`);
      await waitFor(page, () => window.NH && NH.debug && NH.debug.world && NH.debug.world.wipe && NH.debug.world.wipe.t > 0.3 && NH.debug.world.wipe.t < 0.45, null, 60000);
      await page.evaluate(() => NH.debug.setSpeed(0.01));
      await page.waitForTimeout(200);
      await shot('8-wipe');
      await page.evaluate(() => NH.debug.setSpeed(10));
      await waitFor(page, () => NH.debug.mode === 'done', null, 400000);
      await page.waitForTimeout(2500);
      await shot('9-done');
    } catch (e) { errs.push('exception: ' + e.message.split('\n')[0]); }
    console.log(d.name, errs.length ? 'ERRORS ' + errs.slice(0, 4).join(' | ') : 'ok');
    errors += errs.length;
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(errors ? 1 : 0);
})();
