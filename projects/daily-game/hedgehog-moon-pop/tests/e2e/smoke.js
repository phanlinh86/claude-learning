// Smoke test: boot, title, play with the bot at high speed, game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.MP && MP.debug && MP.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1');
  await p.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.evaluate(() => { MP.debug.setBot(true, 1); MP.debug.setSpeed(1); });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => MP.debug.gotoLevel(l), lv);
    await p.waitForTimeout(6000);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // the bot plays at speed 8 from level 1 for a while (fast-forward stress: bubbles, pops, pebbles, magnets, level changes)
  await p.evaluate(() => { MP.debug.gotoLevel(0); MP.debug.setBot(true, 1); MP.debug.setSpeed(8); });
  await p.waitForTimeout(8000);
  const mid = await p.evaluate(() => MP.debug.getState());
  console.log('bot x8 after 8 s:', JSON.stringify({ level: mid.level, score: mid.score, hearts: mid.hearts, box: mid.box, boxTarget: mid.boxTarget, run: mid.run }));
  await p.screenshot({ path: OUT + '/smoke_bot8.png' });
  // a jump in the air (ball frame), and the magnet field
  await p.evaluate(() => { MP.debug.setBot(false); MP.debug.setSpeed(1); MP.debug.world.action(); });
  await p.waitForTimeout(450);
  await p.screenshot({ path: OUT + '/smoke_jump.png' });
  // then hands off and end the run (pebbles never land on a hero standing still, so the test ends it itself)
  await p.evaluate(() => { MP.debug.setBot(false); MP.debug.setSpeed(2); const w = MP.debug.world; w.hearts = 0; w.state = 'dead'; MP.Game.deadAt = w.time; });
  await p.waitForFunction(() => MP.debug.mode === 'over', null, { timeout: 120000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => MP.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
