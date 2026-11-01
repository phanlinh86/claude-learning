// Smoke test: boot, title (bot demo), play with the bot, every time of day, a Baron Fluff visit, game over;
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
  await p.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1');
  await p.waitForFunction(() => KB.debug && KB.debug.mode === 'playing');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.evaluate(() => { KB.debug.setBot(true, 1); KB.debug.setSpeed(1); });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => KB.debug.gotoLevel(l), lv);
    await p.waitForTimeout(6500);
    if (lv === 2) { await p.evaluate(() => KB.debug.bossNow()); await p.waitForTimeout(3300); }
    await p.screenshot({ path: OUT + '/smoke_tod' + lv + '.png' });
  }
  // a full level at high speed with the bot: must clear and move on
  await p.evaluate(() => { KB.debug.gotoLevel(0); KB.debug.setSpeed(8); });
  await p.waitForFunction(() => KB.debug.world.level >= 1, null, { timeout: 30000 });
  await p.evaluate(() => { KB.debug.setBot(false); KB.debug.setSpeed(1); KB.debug.world._die(); });
  await p.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 20000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => KB.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, perfect: st.perfect, miss: st.miss, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
