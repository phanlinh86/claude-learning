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
  await p.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1');
  await p.waitForFunction(() => SC.debug && SC.debug.mode === 'playing');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.evaluate(() => { SC.debug.setBot(true, 1); SC.debug.setSpeed(1); });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => SC.debug.gotoLevel(l), lv);
    await p.waitForTimeout(6000);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // the bot plays at speed 8 from level 1 for a while (fast-forward stress: drops, catches, zaps, level changes)
  await p.evaluate(() => { SC.debug.gotoLevel(0); SC.debug.setBot(true, 1); SC.debug.setSpeed(8); });
  await p.waitForTimeout(8000);
  const mid = await p.evaluate(() => SC.debug.getState());
  console.log('bot x8 after 8 s:', JSON.stringify({ level: mid.level, score: mid.score, hearts: mid.hearts, jar: mid.jar, run: mid.run }));
  await p.screenshot({ path: OUT + '/smoke_bot8.png' });
  // then hands off: thunder puffs end the game
  await p.evaluate(() => { SC.debug.setBot(false); SC.debug.setSpeed(8); });
  await p.waitForFunction(() => SC.debug.mode === 'over', null, { timeout: 120000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => SC.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
