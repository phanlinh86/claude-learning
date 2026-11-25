// Smoke test: boot, title (bot demo), mouse move + click drop, keyboard move + Space drop, touch slide + release (phone),
// bot play at speed 8 (~40 s game time) with progress, every season, wind gust + guide, game over; zero console errors.
// Screenshots in tests/out/ (960×540 landscape and 390×844 portrait).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const errs = [];
  const watch = (pg, tag) => {
    pg.on('console', m => { if (m.type() === 'error') errs.push(tag + ': ' + m.text()); });
    pg.on('pageerror', e => errs.push(tag + ': ' + e));
    pg.on('requestfailed', r => errs.push(tag + ': failed ' + r.url()));
  };
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  watch(p, 'desktop');
  await p.goto(GAME + '?mute=1&seed=7');
  await p.waitForFunction(() => window.MEG && MEG.debug && MEG.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => MEG.debug && MEG.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  await p.waitForTimeout(1800);
  // mouse: hover moves Mossy, click drops
  const W = await p.evaluate(() => ({ ox: MEG.Game.renderer.ox, u: MEG.Game.renderer.unit }));
  const xAt = wx => W.ox + wx * W.u;
  await p.mouse.move(xAt(2), 270); await p.waitForTimeout(600);
  const mx = await p.evaluate(() => MEG.debug.world.mossy.x);
  if (!(Math.abs(mx - 2) < 0.6)) errs.push('mouse did not move Mossy: ' + mx);
  await p.screenshot({ path: OUT + '/smoke_aim.png' });
  const n0 = await p.evaluate(() => MEG.debug.world.stats.drops);
  await p.mouse.click(xAt(2), 270);   // the drop waits until Mossy has arrived (pendingDrop)
  await p.waitForFunction(n => MEG.debug.world.stats.drops === n + 1, n0, { timeout: 3000 }).catch(() => {});
  const n1 = await p.evaluate(() => MEG.debug.world.stats.drops);
  if (n1 !== n0 + 1) errs.push('click did not drop (' + n0 + ' → ' + n1 + ')');
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/smoke_drop.png' });
  // keyboard: → moves, Space drops
  await p.mouse.move(xAt(4.5), 520);   // keep the hover away from the nest
  await p.waitForTimeout(800);
  const k0 = await p.evaluate(() => MEG.debug.world.mossy.x);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(400); await p.keyboard.up('ArrowRight');
  const k1 = await p.evaluate(() => MEG.debug.world.mossy.x);
  if (!(k1 > k0 + 0.5)) errs.push('arrow key did not move Mossy ' + k0 + ' → ' + k1);
  await p.keyboard.press('Space');
  const n2 = await p.evaluate(() => MEG.debug.world.stats.drops);
  if (n2 !== n1 + 1) errs.push('Space did not drop');
  // wind gust + bent guide
  await p.evaluate(() => MEG.debug.setWind(1, 5));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/smoke_wind.png' });
  // bot play at speed 8 for ~40 s of game time
  await p.evaluate(() => { MEG.debug.startGame(); MEG.debug.setBot(true, 1); MEG.debug.setSpeed(8); });
  await p.waitForTimeout(5000);
  const prog = await p.evaluate(() => { const w = MEG.debug.world; return { t: w.time, score: w.score, merges: w.stats.merges, eggs: w.eggs.length, maxKind: w.maxKind, mode: MEG.debug.mode }; });
  console.log('bot progress', JSON.stringify(prog));
  if (!(prog.merges > 3 || prog.mode === 'over')) errs.push('bot made no progress ' + JSON.stringify(prog));
  await p.evaluate(() => MEG.debug.setSpeed(1));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/smoke_bot.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { MEG.debug.gotoLevel(l); MEG.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(2200);
    await p.evaluate(() => MEG.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // a hatch: two golden eggs
  await p.evaluate(() => { MEG.debug.gotoLevel(0); MEG.debug.spawnEgg(8, 2.4, 9); MEG.debug.spawnEgg(8, 6.6, 9); });
  await p.waitForTimeout(1300);
  await p.screenshot({ path: OUT + '/smoke_hatch.png' });
  // game over: no bot, drop everything in one spot
  await p.evaluate(() => { MEG.debug.setBot(false); MEG.debug.setSpeed(6); window._t = setInterval(() => { const w = MEG.debug.world; if (w && w.canDrop) { MEG.debug.moveTo(4.5); MEG.debug.drop(); } }, 60); });
  await p.waitForFunction(() => MEG.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); MEG.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const st = await p.evaluate(() => MEG.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  // portrait phone: touch slide + release drops
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  watch(m, 'mobile');
  await m.goto(GAME + '?mute=1&seed=3&autostart=1&diff=normal');
  await m.waitForFunction(() => MEG.debug && MEG.debug.mode === 'playing');
  await m.waitForTimeout(2800);
  const cdp = await m.context().newCDPSession(m);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const d0 = await m.evaluate(() => MEG.debug.world.stats.drops);
  await touch('touchStart', 120, 500);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', 120 + i * 18, 500); await m.waitForTimeout(16); }
  await m.waitForTimeout(400);
  await m.screenshot({ path: OUT + '/smoke_portrait_aim.png' });
  await touch('touchEnd', 264, 500);
  await m.waitForTimeout(700);
  const d1 = await m.evaluate(() => MEG.debug.world.stats.drops);
  if (d1 !== d0 + 1) errs.push('touch release did not drop (' + d0 + ' → ' + d1 + ')');
  await m.evaluate(() => { MEG.debug.setBot(true, 1); MEG.debug.setSpeed(8); });
  await m.waitForTimeout(3000);
  await m.evaluate(() => MEG.debug.setSpeed(1));
  await m.waitForTimeout(300);
  await m.screenshot({ path: OUT + '/smoke_portrait.png' });
  const ms = await m.evaluate(() => MEG.debug.stats);
  if (ms.errors.length) errs.push(...ms.errors);
  await b.close();
  if (errs.length) { console.log('FAIL\n' + [...new Set(errs)].join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
