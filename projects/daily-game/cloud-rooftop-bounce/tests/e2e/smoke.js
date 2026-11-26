// Smoke test: boot, title (bot demo), real mouse steering + click serve, keyboard move + Space serve, the magnet
// (gem pull, a stuck pearl, aim + release), bot play at speed 8 through a zone change (the descend), every zone,
// a game over, then a touch phone (landscape + portrait) and an iPad; zero console errors. Screenshots in tests/out/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const srv = await serve(), GAME = srv.url;
  const b = await chromium.launch();
  const errs = [];
  const watch = (pg, tag) => {
    pg.on('console', m => { if (m.type() === 'error') errs.push(tag + ': ' + m.text()); });
    pg.on('pageerror', e => errs.push(tag + ': ' + e));
    pg.on('requestfailed', r => errs.push(tag + ': failed ' + r.url()));
    pg.on('response', r => { if (r.status() >= 400) errs.push(tag + ': HTTP ' + r.status() + ' ' + r.url()); });
  };
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  watch(p, 'desktop');
  await p.goto(GAME + '?mute=1&seed=7');
  await p.waitForFunction(() => window.WRB && WRB.debug && WRB.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=easy');
  await p.waitForFunction(() => WRB.debug && WRB.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // mouse steers without a button
  await p.mouse.move(300, 400); await p.waitForTimeout(700);
  let x = await p.evaluate(() => WRB.debug.world.paddle.x);
  if (!(x < 5.5)) errs.push('mouse did not steer left: ' + x);
  await p.mouse.move(1000, 400); await p.waitForTimeout(700);
  x = await p.evaluate(() => WRB.debug.world.paddle.x);
  if (!(x > 10.5)) errs.push('mouse did not steer right: ' + x);
  await p.screenshot({ path: OUT + '/smoke_serve.png' });
  await p.mouse.click(1000, 400);
  if ((await p.evaluate(() => WRB.debug.world.phase)) !== 'play') errs.push('click did not serve');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  // keyboard
  await p.evaluate(() => WRB.debug.startGame());
  await p.waitForTimeout(200);
  const x0 = await p.evaluate(() => WRB.debug.world.paddle.x);
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft');
  const x1 = await p.evaluate(() => WRB.debug.world.paddle.x);
  if (!(x1 < x0 - 1)) errs.push('ArrowLeft did not move: ' + x0 + ' → ' + x1);
  await p.keyboard.press('Space');
  if ((await p.evaluate(() => WRB.debug.world.phase)) !== 'play') errs.push('Space did not serve');
  // the magnet: give it, drop gems, put the pearl right above Wisp falling down → it sticks; aim; Space releases
  await p.evaluate(() => { WRB.debug.giveMagnet(); WRB.debug.drop('gem'); WRB.debug.drop('gem'); });
  await p.waitForTimeout(300);
  const mg = await p.evaluate(() => WRB.debug.world.magnet.t);
  if (!(mg > 0)) errs.push('giveMagnet did not turn the magnet on');
  await p.evaluate(() => { const w = WRB.debug.world, b = w.ball; b.x = b.px = w.paddle.x + 0.6; b.y = b.py = 2.4; b.vx = 0; b.vy = -4; });
  await p.waitForFunction(() => WRB.debug.world.ball && WRB.debug.world.ball.stuck, null, { timeout: 4000 }).catch(() => errs.push('the pearl did not stick'));
  await p.screenshot({ path: OUT + '/smoke_magnet_stuck.png' });
  await p.keyboard.press('Space');
  await p.waitForTimeout(100);
  if (await p.evaluate(() => WRB.debug.world.ball && WRB.debug.world.ball.stuck)) errs.push('Space did not release the stuck pearl');
  await p.evaluate(() => WRB.debug.drop('magnet'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_magnet_drop.png' });
  // bot play through a zone change (the descend transition)
  await p.evaluate(() => { WRB.debug.startGame(); WRB.debug.setBot(true, 1); WRB.debug.setSpeed(8); });
  await p.waitForFunction(() => WRB.debug.world.phase === 'clear' || WRB.debug.world.level >= 1, null, { timeout: 90000 }).catch(() => errs.push('no zone clear'));
  await p.evaluate(() => WRB.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_descend.png' });
  await p.evaluate(() => WRB.debug.setSpeed(8));
  await p.waitForFunction(() => WRB.debug.world.level >= 1, null, { timeout: 30000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => WRB.debug.setSpeed(1));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [0, 1, 2, 3]) {
    await p.evaluate(l => { WRB.debug.gotoLevel(l); WRB.debug.setSpeed(2); }, lv);
    await p.waitForTimeout(3500);
    await p.evaluate(() => WRB.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
    const sc = await p.evaluate(() => WRB.debug.getState());
    if (sc.zone !== lv || sc.scene !== lv) errs.push('zone ' + lv + ': world zone ' + sc.zone + ', scene ' + sc.scene);
  }
  // game over: no bot, Wisp stays in the corner
  await p.evaluate(() => { WRB.debug.setBot(false); WRB.debug.world.net.saves = 0; WRB.debug.setSpeed(8); window._t = setInterval(() => { WRB.debug.setPaddle(0); WRB.debug.serve(); }, 100); });
  await p.waitForFunction(() => WRB.debug.mode === 'over', null, { timeout: 120000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); WRB.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => WRB.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  // touch phone in landscape: a tap serves, a slide moves
  const m = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  watch(m, 'phone');
  await m.goto(GAME + '?mute=1&seed=3&autostart=1');
  await m.waitForFunction(() => window.WRB && WRB.debug && WRB.debug.mode === 'playing');
  await m.waitForTimeout(400);
  await m.touchscreen.tap(200, 250);
  await m.waitForTimeout(400);
  const mp = await m.evaluate(() => [WRB.debug.world.phase, WRB.debug.world.paddle.x]);
  if (mp[0] !== 'play') errs.push('touch tap did not serve: ' + mp[0]);
  if (!(mp[1] < 6)) errs.push('touch tap did not move: ' + mp[1]);
  await m.evaluate(() => { WRB.debug.giveMagnet(); const w = WRB.debug.world, b = w.ball; b.x = b.px = w.paddle.x - 0.8; b.y = b.py = 2.4; b.vx = 0; b.vy = -4; });
  await m.waitForFunction(() => WRB.debug.world.ball && WRB.debug.world.ball.stuck, null, { timeout: 4000 }).catch(() => errs.push('phone: the pearl did not stick'));
  await m.waitForTimeout(150);
  await m.screenshot({ path: OUT + '/smoke_phone_magnet.png' });
  const px0 = await m.evaluate(() => WRB.debug.world.paddle.x);
  await m.touchscreen.tap(700, 250);   // far right: a tap releases, it must not yank Wisp first
  await m.waitForTimeout(100);
  const rel = await m.evaluate(() => [WRB.debug.world.ball && WRB.debug.world.ball.stuck, WRB.debug.world.paddle.x]);
  if (rel[0]) errs.push('phone: a tap did not release the stuck pearl');
  if (Math.abs(rel[1] - px0) > 0.6) errs.push('phone: the release tap moved Wisp ' + px0 + ' → ' + rel[1]);
  await m.screenshot({ path: OUT + '/smoke_phone.png' });
  const pp = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  watch(pp, 'portrait');
  await pp.goto(GAME + '?mute=1&seed=3&autostart=1');
  await pp.waitForTimeout(1500);
  await pp.screenshot({ path: OUT + '/smoke_portrait.png' });
  const ip = await b.newPage({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  watch(ip, 'ipad');
  await ip.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&speed=2');
  await ip.waitForTimeout(3000);
  await ip.screenshot({ path: OUT + '/smoke_ipad_portrait.png' });
  await b.close(); srv.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
