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
  await p.waitForFunction(() => window.VC && VC.debug && VC.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1');
  await p.waitForFunction(() => VC.debug && VC.debug.mode === 'playing');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.evaluate(() => { VC.debug.setBot(true, 1); VC.debug.setSpeed(1); });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => VC.debug.gotoLevel(l), lv);
    await p.waitForTimeout(6000);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  await p.evaluate(() => { VC.debug.setBot(false); VC.debug.setSpeed(8); });
  await p.waitForFunction(() => VC.debug.mode === 'over', null, { timeout: 120000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => VC.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
