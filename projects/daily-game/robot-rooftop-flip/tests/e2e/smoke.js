// Smoke test: boot, title (bot demo), real taps flip gravity, bot play at speed, every time of day, finish → next level,
// game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => RF.debug && RF.debug.mode === 'playing');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: click the stage a few times (each click flips once Bolt has landed)
  for (let i = 0; i < 3; i++) { await p.mouse.click(640, 400); await p.waitForTimeout(700); }
  const f1 = await p.evaluate(() => RF.debug.world.stats.flips);
  if (f1 < 3) errs.push('clicks flipped only ' + f1 + ' times');
  await p.mouse.click(640, 400); await p.waitForTimeout(180);
  await p.screenshot({ path: OUT + '/smoke_flip.png' });
  await p.evaluate(() => { RF.debug.startGame(); RF.debug.setBot(true, 1); RF.debug.setSpeed(4); });
  await p.waitForFunction(() => RF.debug.world.stats.caught >= 10, null, { timeout: 40000 }).catch(() => errs.push('bot caught < 10 fireflies'));
  await p.evaluate(() => RF.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => RF.debug.setSpeed(8));
  await p.waitForFunction(() => RF.debug.world.level >= 1, null, { timeout: 40000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => RF.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { RF.debug.gotoLevel(l); RF.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(3000);
    await p.evaluate(() => RF.debug.setSpeed(1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: no bot, nobody flips
  await p.evaluate(() => { RF.debug.setBot(false); RF.debug.setSpeed(8); });
  await p.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => RF.debug.setSpeed(1));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9&speed=2');
  await q.waitForTimeout(9000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => RF.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
