// Smoke test: boot, title (bot demo), a real mouse drag-and-release fling, a tap-to-puff, keyboard aim + Space,
// bot play at speed, every season, growth sizes, game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.CFF && CFF.debug && CFF.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => CFF.debug && CFF.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: OUT + '/smoke_hint.png' });
  // a real player: drag back with the mouse
  await p.mouse.move(640, 300); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(640 - i * 9, 300 + i * 8); await p.waitForTimeout(16); }
  const pull = await p.evaluate(() => CFF.debug.world.pull);
  if (!pull || !(pull.x < -0.5 && pull.y < -0.5)) errs.push('drag did not pull ' + JSON.stringify(pull));
  await p.screenshot({ path: OUT + '/smoke_aim.png' });
  await p.mouse.up();
  const ph = await p.evaluate(() => CFF.debug.world.phase);
  if (ph !== 'fly') errs.push('release did not fling: ' + ph);
  await p.waitForFunction(() => CFF.debug.world.nubi.vy < 3, null, { timeout: 6000 }).catch(() => {});
  await p.mouse.click(640, 300);
  const fl = await p.evaluate(() => CFF.debug.world.puffed);
  if (!fl) errs.push('tap did not puff');
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/smoke_fly.png' });
  await p.waitForFunction(() => CFF.debug.world.phase === 'aim', null, { timeout: 8000 }).catch(() => errs.push('no next shot'));
  // keyboard: aim with arrows, Space to fling
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(300); await p.keyboard.up('ArrowUp');
  const kp = await p.evaluate(() => CFF.debug.world.pull);
  if (!kp) errs.push('arrow keys did not aim');
  await p.keyboard.press('Space');
  if ((await p.evaluate(() => CFF.debug.world.phase)) !== 'fly') errs.push('Space did not fling');
  // bot play
  await p.evaluate(() => { CFF.debug.startGame(); CFF.debug.setBot(true, 1); CFF.debug.setSpeed(6); });
  await p.waitForFunction(() => CFF.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => CFF.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { CFF.debug.gotoLevel(l); CFF.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(2500);
    await p.evaluate(() => CFF.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // growth: big Nubi on the wagon
  await p.evaluate(() => { CFF.debug.gotoLevel(0); CFF.debug.setSize(1.7); CFF.debug.setBot(true, 1); CFF.debug.setSpeed(1); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/smoke_big_fly.png' });
  await p.waitForFunction(() => CFF.debug.world.phase === 'land', null, { timeout: 15000 }).catch(() => errs.push('big Nubi never landed'));
  await p.waitForTimeout(450);
  await p.screenshot({ path: OUT + '/smoke_big_land.png' });
  // game over: no bot, fling weakly-but-far onto the grass until the hearts run out
  await p.evaluate(() => { CFF.debug.setBot(false); CFF.debug.setSpeed(4); window._t = setInterval(() => { const w = CFF.debug.world; if (w && w.phase === 'aim') { CFF.debug.aim(-0.4, -1.4); CFF.debug.release(); } }, 100); });
  await p.waitForFunction(() => CFF.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); CFF.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  // portrait phone
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  m.on('pageerror', e => errs.push('mobile: ' + e));
  await m.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&speed=2');
  await m.waitForTimeout(4000);
  await m.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => CFF.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  await b.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
