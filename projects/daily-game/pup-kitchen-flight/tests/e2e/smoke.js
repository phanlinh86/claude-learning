// Smoke test: boot, title (bot demo), Get Ready, Space / click / touch puffs, bot play at speed through a level change,
// every zone (incl. the dark night), game over; zero console errors. Screenshots in tests/out/.
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(GAME + '?mute=1&seed=7');
  await p.waitForFunction(() => window.BKF && BKF.debug && BKF.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  const demo = await p.evaluate(() => BKF.debug.world.phase);
  if (demo !== 'playing') errs.push('title demo is not flying: ' + demo);

  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=easy');
  await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'ready');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_ready.png' });
  await p.keyboard.press('Space');
  await p.waitForTimeout(100);
  let st = await p.evaluate(() => ({ mode: BKF.debug.mode, phase: BKF.debug.world.phase, vy: BKF.debug.world.pup.vy }));
  if (st.mode !== 'playing' || st.phase !== 'playing' || !(st.vy < 0)) errs.push('Space did not start / puff: ' + JSON.stringify(st));
  // click puffs
  await p.waitForTimeout(500);
  const f0 = await p.evaluate(() => BKF.debug.world.stats.flaps);
  await p.mouse.click(640, 400);
  const f1 = await p.evaluate(() => BKF.debug.world.stats.flaps);
  if (f1 !== f0 + 1) errs.push('click did not puff: ' + f0 + ' → ' + f1);
  // HUD pause button must not puff
  await p.waitForTimeout(200);
  const f2 = await p.evaluate(() => BKF.debug.world.stats.flaps);
  await p.click('#btnPause');
  const f3 = await p.evaluate(() => ({ flaps: BKF.debug.world.stats.flaps, mode: BKF.debug.mode }));
  if (f3.flaps !== f2 || f3.mode !== 'paused') errs.push('pause button puffed or did not pause: ' + JSON.stringify(f3));
  await p.click('#btnResume');
  // bot play through a level change
  await p.evaluate(() => { BKF.debug.setBot(true, 1); BKF.debug.setSpeed(8); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.waitForFunction(() => BKF.debug.world.level >= 1, null, { timeout: 20000 }).catch(() => errs.push('no level change at speed 8'));
  await p.evaluate(() => BKF.debug.setSpeed(1));
  for (let z = 0; z < 4; z++) {
    await p.evaluate(z => { BKF.debug.gotoLevel(z); BKF.debug.world.levelT = z === 3 ? 30 : 10; }, z);
    await p.waitForTimeout(1900);
    await p.screenshot({ path: OUT + `/smoke_zone${z}.png` });
  }
  // game over
  await p.evaluate(() => { BKF.debug.setBot(false); const w = BKF.debug.world; w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 455; w.pup.vy = 400; });
  await p.waitForFunction(() => BKF.debug.mode === 'over', null, { timeout: 15000 }).catch(() => errs.push('no game over'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_over.png' });

  // phone (touch) layout + touch tap
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
  const ph = await ctx.newPage();
  ph.on('pageerror', e => errs.push('phone: ' + e));
  await ph.goto(GAME + '?mute=1&seed=3&autostart=1');
  await ph.waitForFunction(() => BKF.debug && BKF.debug.mode === 'ready');
  await ph.touchscreen.tap(400, 200);
  await ph.waitForTimeout(150);
  const pm = await ph.evaluate(() => BKF.debug.mode);
  if (pm !== 'playing') errs.push('touch tap did not start on phone: ' + pm);
  await ph.waitForTimeout(1500);
  await ph.screenshot({ path: OUT + '/smoke_phone.png' });
  await b.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
