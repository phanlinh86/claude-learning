// Smoke test: boot, title (bot demo), a real mouse drag-and-release fling, a tap-to-flutter, keyboard aim + Space,
// bot play at speed, every island, night, game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.FIF && FIF.debug && FIF.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => FIF.debug && FIF.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: OUT + '/smoke_hint.png' });
  // a real player: drag back with the mouse
  await p.mouse.move(640, 300); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(640 - i * 9, 300 + i * 8); await p.waitForTimeout(16); }
  const pull = await p.evaluate(() => FIF.debug.world.pull);
  if (!pull || !(pull.x < -0.5 && pull.y < -0.5)) errs.push('drag did not pull ' + JSON.stringify(pull));
  await p.screenshot({ path: OUT + '/smoke_aim.png' });
  await p.mouse.up();
  const ph = await p.evaluate(() => FIF.debug.world.phase);
  if (ph !== 'fly') errs.push('release did not fling: ' + ph);
  await p.waitForFunction(() => FIF.debug.world.fox.vy < 3, null, { timeout: 6000 }).catch(() => {});
  await p.mouse.click(640, 300);
  const fl = await p.evaluate(() => FIF.debug.world.fluttered);
  if (!fl) errs.push('tap did not flutter');
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/smoke_fly.png' });
  await p.waitForFunction(() => FIF.debug.world.phase === 'aim', null, { timeout: 8000 }).catch(() => errs.push('no next shot'));
  // keyboard: aim with arrows, Space to fling
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(300); await p.keyboard.up('ArrowUp');
  const kp = await p.evaluate(() => FIF.debug.world.pull);
  if (!kp) errs.push('arrow keys did not aim');
  await p.keyboard.press('Space');
  if ((await p.evaluate(() => FIF.debug.world.phase)) !== 'fly') errs.push('Space did not fling');
  // bot play
  await p.evaluate(() => { FIF.debug.startGame(); FIF.debug.setBot(true, 1); FIF.debug.setSpeed(6); });
  await p.waitForFunction(() => FIF.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => FIF.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { FIF.debug.gotoLevel(l); FIF.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(2500);
    await p.evaluate(() => FIF.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // night
  await p.evaluate(() => { FIF.debug.setDay(0.8); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/smoke_night.png' });
  await p.evaluate(() => { FIF.debug.setDay(0.62); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_dusk.png' });
  // game over: no bot, fling weakly-but-far into the sea until the hearts run out
  await p.evaluate(() => { FIF.debug.setBot(false); FIF.debug.setSpeed(4); window._t = setInterval(() => { const w = FIF.debug.world; if (w && w.phase === 'aim') { FIF.debug.aim(-0.4, -1.4); FIF.debug.release(); } }, 100); });
  await p.waitForFunction(() => FIF.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); FIF.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  // portrait phone
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  m.on('pageerror', e => errs.push('mobile: ' + e));
  await m.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&speed=2');
  await m.waitForTimeout(4000);
  await m.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => FIF.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  await b.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
