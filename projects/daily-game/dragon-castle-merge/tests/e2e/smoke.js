// Smoke test: boot, title (bot demo), real clicks, bot play at speed, every castle place, game over; zero console errors.
// Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.EG && EG.debug && EG.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => EG.debug && EG.debug.mode === 'playing');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: click three columns
  const L = await p.evaluate(() => { const L = EG.debug.world.layout, r = document.getElementById('game').getBoundingClientRect(); return { L, r }; });
  const cx = c => L.r.left + (L.L.boardX + (c + 0.5) * L.L.cell) * L.r.width / L.L.width, cy = L.r.top + (L.L.boardY + L.L.boardH / 2) * L.r.height / L.L.height;
  for (const c of [0, 0, 1, 2, 2, 4]) { await p.mouse.click(cx(c), cy); await p.waitForTimeout(1100); }
  await p.waitForTimeout(400);
  const d1 = await p.evaluate(() => EG.debug.world.stats.drops);
  if (d1 < 5) errs.push('clicks dropped only ' + d1 + ' lights');
  await p.screenshot({ path: OUT + '/smoke_clicks.png' });
  await p.evaluate(() => { EG.debug.setBot(true, 0.9); EG.debug.setSpeed(4); });
  await p.waitForFunction(() => EG.debug.world.stats.merges >= 12, null, { timeout: 30000 });
  await p.evaluate(() => EG.debug.setSpeed(1));
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => EG.debug.gotoLevel(l), lv);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  await p.evaluate(() => { EG.debug.gotoLevel(0); EG.debug.setSpeed(8); });
  await p.waitForFunction(() => EG.debug.world.level >= 1, null, { timeout: 60000 });
  // game over: no bot, a full board of mismatched lights
  await p.evaluate(() => { EG.debug.setBot(false); EG.debug.setSpeed(1);
    const w = EG.debug.world, cols = [];
    for (let c = 0; c < w.cols; c++) { const col = []; for (let r = 0; r < w.rows; r++) col.push(((c + r) % 2) ? 3 + (c % 2) : 1 + ((r >> 1) % 2) * 4 + (c % 3 === 0 ? 1 : 0)); cols.push(col); }
    w.setBoard(cols); });
  await p.waitForTimeout(300);
  for (let c = 0; c < 5; c++) { await p.evaluate(c => EG.debug.drop(c), c); await p.waitForTimeout(700); }
  await p.waitForFunction(() => EG.debug.mode === 'over', null, { timeout: 30000 }).catch(() => errs.push('no game over'));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9');
  await q.waitForTimeout(6000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => EG.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
