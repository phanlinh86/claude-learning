// Smoke test: boot, title (bot demo), real mouse moves steer Nimbus, bot play at speed, every time of day, full jar → next level,
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
  await p.waitForFunction(() => window.NB && NB.debug && NB.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => NB.debug && NB.debug.mode === 'playing');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: move the mouse; Nimbus must follow it
  await p.mouse.move(300, 300); await p.waitForTimeout(1200);
  const h1 = await p.evaluate(() => ({ x: NB.debug.world.hero.x, y: NB.debug.world.hero.y }));
  await p.mouse.move(1000, 450); await p.waitForTimeout(1200);
  const h2 = await p.evaluate(() => ({ x: NB.debug.world.hero.x, y: NB.debug.world.hero.y }));
  if (!(h2.x > h1.x + 200)) errs.push('mouse did not steer Nimbus ' + JSON.stringify([h1, h2]));
  await p.screenshot({ path: OUT + '/smoke_steer.png' });
  await p.evaluate(() => { NB.debug.startGame(); NB.debug.setBot(true, 1); NB.debug.setSpeed(4); });
  await p.waitForFunction(() => NB.debug.world.stats.pops >= 10, null, { timeout: 40000 }).catch(() => errs.push('bot popped < 10 bubbles'));
  await p.evaluate(() => NB.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => NB.debug.setSpeed(8));
  await p.waitForFunction(() => NB.debug.world.level >= 1, null, { timeout: 40000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => NB.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { NB.debug.gotoLevel(l); NB.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(3000);
    await p.evaluate(() => NB.debug.setSpeed(1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: no bot, burrs dropped right onto Nimbus
  await p.evaluate(() => { NB.debug.setBot(false); NB.debug.setSpeed(4); window._burrT = setInterval(() => { const w = NB.debug.world; if (w && w.phase === 'play' && w.burrs.length < 2) w.spawnBurr(w.hero.x); }, 400); });
  await p.waitForFunction(() => NB.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._burrT); NB.debug.setSpeed(1); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9&speed=2');
  await q.waitForTimeout(9000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => NB.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
