// Smoke test: boot, title (bot demo), real mouse steering + click serve, keyboard move + Space serve, a tap on a
// touch phone, bot play at speed through a season change, every season, a pillow, game over; zero console errors.
// Screenshots in tests/out/.
const { chromium } = require('playwright');
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
  await p.waitForFunction(() => window.MFB && MFB.debug && MFB.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=easy');
  await p.waitForFunction(() => MFB.debug && MFB.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // mouse steers without a button
  await p.mouse.move(300, 400); await p.waitForTimeout(600);
  let x = await p.evaluate(() => MFB.debug.world.paddle.x);
  if (!(x < 5.5)) errs.push('mouse did not steer left: ' + x);
  await p.mouse.move(1000, 400); await p.waitForTimeout(600);
  x = await p.evaluate(() => MFB.debug.world.paddle.x);
  if (!(x > 10.5)) errs.push('mouse did not steer right: ' + x);
  await p.screenshot({ path: OUT + '/smoke_serve.png' });
  await p.mouse.click(1000, 400);
  if ((await p.evaluate(() => MFB.debug.world.phase)) !== 'play') errs.push('click did not serve');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  // keyboard
  await p.evaluate(() => MFB.debug.startGame());
  await p.waitForTimeout(200);
  const x0 = await p.evaluate(() => MFB.debug.world.paddle.x);
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft');
  const x1 = await p.evaluate(() => MFB.debug.world.paddle.x);
  if (!(x1 < x0 - 1)) errs.push('ArrowLeft did not move: ' + x0 + ' → ' + x1);
  await p.keyboard.press('Space');
  if ((await p.evaluate(() => MFB.debug.world.phase)) !== 'play') errs.push('Space did not serve');
  // a pillow
  await p.evaluate(() => MFB.debug.bossThrow());
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_pillow.png' });
  // bot play through a season change
  await p.evaluate(() => { MFB.debug.startGame(); MFB.debug.setBot(true, 1); MFB.debug.setSpeed(8); });
  await p.waitForFunction(() => MFB.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => MFB.debug.setSpeed(1));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { MFB.debug.gotoLevel(l); MFB.debug.setSpeed(2); }, lv);
    await p.waitForTimeout(3500);
    await p.evaluate(() => MFB.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // the clear phase
  await p.evaluate(() => { MFB.debug.gotoLevel(0); MFB.debug.clearBricks(1); });
  await p.waitForFunction(() => MFB.debug.world.phase === 'clear', null, { timeout: 30000 }).catch(() => errs.push('no clear'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_clear.png' });
  // game over: no bot, Mochi stands in the corner
  await p.evaluate(() => { MFB.debug.setBot(false); MFB.debug.setSpeed(8); window._t = setInterval(() => { MFB.debug.setPaddle(0); MFB.debug.serve(); }, 100); });
  await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 120000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); MFB.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  // touch phone in landscape: a tap serves, a slide moves
  const m = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  m.on('pageerror', e => errs.push('mobile: ' + e));
  await m.goto(GAME + '?mute=1&seed=3&autostart=1');
  await m.waitForFunction(() => window.MFB && MFB.debug && MFB.debug.mode === 'playing');
  await m.waitForTimeout(400);
  await m.touchscreen.tap(200, 250);
  await m.waitForTimeout(400);
  const mp = await m.evaluate(() => [MFB.debug.world.phase, MFB.debug.world.paddle.x]);
  if (mp[0] !== 'play') errs.push('touch tap did not serve: ' + mp[0]);
  if (!(mp[1] < 6)) errs.push('touch tap did not move: ' + mp[1]);
  await m.screenshot({ path: OUT + '/smoke_phone.png' });
  const pp = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await pp.goto(GAME + '?mute=1&seed=3&autostart=1');
  await pp.waitForTimeout(1500);
  await pp.screenshot({ path: OUT + '/smoke_portrait.png' });
  const ip = await b.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ip.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&speed=2');
  await ip.waitForTimeout(3000);
  await ip.screenshot({ path: OUT + '/smoke_ipad.png' });
  const st = await p.evaluate(() => MFB.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  await b.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
