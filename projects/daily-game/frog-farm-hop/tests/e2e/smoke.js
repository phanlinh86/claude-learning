// Smoke test: boot, title (bot demo), real keys / held pointer steer Clover, bot play at speed, a wind gust, every
// weather level, level change, game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.FH && FH.debug && FH.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => FH.debug && FH.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: hold keys to steer
  const x0 = await p.evaluate(() => FH.debug.world.hero.x);
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(400); await p.keyboard.up('ArrowLeft');
  const x1 = await p.evaluate(() => FH.debug.world.hero.x);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(600); await p.keyboard.up('ArrowRight');
  const x2 = await p.evaluate(() => FH.debug.world.hero.x);
  if (!(x1 < x0 - 1 && x2 > x1 + 1)) errs.push('keys did not steer ' + [x0, x1, x2]);
  // hold the left half with the mouse
  await p.mouse.move(200, 400); await p.mouse.down(); await p.waitForTimeout(400);
  const d1 = await p.evaluate(() => FH.debug.world.hero.dir);
  await p.mouse.up(); await p.waitForTimeout(50);
  const d2 = await p.evaluate(() => FH.debug.world.hero.dir);
  if (!(d1 === -1 && d2 === 0)) errs.push('pointer hold did not steer ' + [d1, d2]);
  await p.screenshot({ path: OUT + '/smoke_steer.png' });
  await p.evaluate(() => { FH.debug.startGame(); FH.debug.setBot(true, 1); FH.debug.setSpeed(4); });
  await p.waitForFunction(() => FH.debug.world.maxY >= 40, null, { timeout: 40000 }).catch(() => errs.push('bot climbed < 40 m'));
  await p.evaluate(() => FH.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => FH.debug.gust(1));
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_warn.png' });
  await p.waitForFunction(() => FH.debug.world.wind.state === 'blow', null, { timeout: 8000 }).catch(() => errs.push('no gust'));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_gust.png' });
  await p.evaluate(() => FH.debug.setSpeed(8));
  await p.waitForFunction(() => FH.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => FH.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { FH.debug.gotoLevel(l); FH.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(3000);
    await p.evaluate(() => FH.debug.setSpeed(1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: no bot, steer into the wall and let her fall
  await p.evaluate(() => { FH.debug.setBot(false); FH.debug.setSpeed(4); window._t = setInterval(() => { const w = FH.debug.world; if (w && w.phase === 'play') { w.platforms.forEach(q => { if (q.y < w.hero.y + 30) q.y -= 1000; }); } }, 200); });
  await p.waitForFunction(() => FH.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); FH.debug.setSpeed(1); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9&speed=2');
  await q.waitForTimeout(8000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => FH.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, heights: st.heights, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
