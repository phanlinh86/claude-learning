// Quick look (integration): bubbles rising untouched, a magnet field, a pebble shadow — 2× screenshot in tests/out/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const lv = +(process.argv[2] || 0);
  await p.goto(GAME + '?mute=1&seed=3&autostart=1&level=' + lv);
  await p.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
  await p.evaluate(() => { MP.debug.world.hog.x = 120; MP.debug.world.setTarget(120); });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: OUT + '/quick_bubbles_' + lv + '.png' });
  await p.evaluate(() => { const w = MP.debug.world; w.magnet.t = 5; w.magnet.dur = 7; });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/quick_magnet_' + lv + '.png' });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
