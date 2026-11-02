// Smoke test: boot, title (bot demo), play with the bot, every depth zone, a golden gem, game over;
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
  await p.waitForFunction(() => window.PR && PR.debug && PR.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1');
  await p.waitForFunction(() => PR.debug && PR.debug.mode === 'playing');
  await p.waitForTimeout(1000);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: hold to sink for a moment
  await p.mouse.move(640, 500); await p.mouse.down(); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_hold.png' });
  await p.mouse.up();
  await p.evaluate(() => { PR.debug.setBot(true, 0.95); });
  await p.waitForFunction(() => PR.debug.world.phase === 'reel', null, { timeout: 20000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/smoke_reel.png' });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => PR.debug.gotoLevel(l), lv);
    await p.waitForTimeout(3500);
    if (lv === 3) { await p.evaluate(() => PR.debug.spawnGold()); await p.waitForTimeout(1200); }
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // a full zone at high speed with the bot: must clear and move on
  await p.evaluate(() => { PR.debug.gotoLevel(0); PR.debug.setSpeed(8); });
  await p.waitForFunction(() => PR.debug.world.level >= 1, null, { timeout: 40000 });
  // game over: no bot, park the hook in a puffer's path until the lines run out
  await p.evaluate(() => { PR.debug.setBot(false); PR.debug.world.lines = 1; PR.debug.world.invuln = 0; });
  await p.evaluate(() => { const w = PR.debug.world; w._snap({ x: 0, y: 300 }); });
  await p.evaluate(() => PR.debug.setSpeed(1));
  await p.waitForFunction(() => PR.debug.mode === 'over', null, { timeout: 20000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  // portrait phone
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9');
  await q.waitForTimeout(5000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => PR.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, gems: st.gems, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
