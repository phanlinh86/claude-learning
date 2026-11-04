// Smoke test: boot, title (bot demo), real taps, bot play at speed, every planet, goal → next planet, game over;
// zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.MS && MS.debug && MS.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => MS.debug && MS.debug.mode === 'playing');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: click the stage a few times
  for (let i = 0; i < 3; i++) { await p.mouse.click(640, 500); await p.waitForTimeout(1500); }
  const d1 = await p.evaluate(() => MS.debug.world.stats.drops);
  if (d1 < 3) errs.push('clicks dropped only ' + d1 + ' crates');
  await p.screenshot({ path: OUT + '/smoke_clicks.png' });
  await p.evaluate(() => { MS.debug.startGame(); MS.debug.setBot(true, 0.9); MS.debug.setSpeed(3); });
  await p.waitForFunction(() => MS.debug.world.placed >= 8, null, { timeout: 40000 }).catch(() => errs.push('bot did not stack 8'));
  await p.evaluate(() => MS.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => MS.debug.setSpeed(3));
  await p.waitForFunction(() => MS.debug.world.phase === 'goal', null, { timeout: 40000 }).catch(() => errs.push('no goal'));
  await p.evaluate(() => MS.debug.setSpeed(1));
  await p.waitForTimeout(1600);
  await p.screenshot({ path: OUT + '/smoke_goal.png' });
  await p.waitForFunction(() => MS.debug.world.level >= 1, null, { timeout: 20000 }).catch(() => errs.push('no level 2'));
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { MS.debug.gotoLevel(l); MS.debug.setSpeed(3); }, lv);
    await p.waitForFunction(() => MS.debug.world.placed >= 6, null, { timeout: 30000 }).catch(() => errs.push('zone ' + lv + ' slow'));
    await p.evaluate(() => MS.debug.setSpeed(1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: a clumsy bot
  await p.evaluate(() => { MS.debug.setBot(true, 0.0); MS.debug.setSpeed(8); });
  await p.waitForFunction(() => MS.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => MS.debug.setSpeed(1));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9&speed=2');
  await q.waitForTimeout(9000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => MS.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
