// Smoke test: boot, title (bot demo), real keys/taps/swipes move Pebble, bot play at speed, Fizz visits, every chapter,
// chapter change, game over; zero console errors. Screenshots in tests/out/.
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
  await p.waitForFunction(() => window.PO && PO.debug && PO.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=normal');
  await p.waitForFunction(() => PO.debug && PO.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real player: keys change lanes and jump
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
  const l1 = await p.evaluate(() => PO.debug.world.hero.x);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  const l2 = await p.evaluate(() => PO.debug.world.hero.x);
  if (!(l1 < -0.9 && l2 > 0.9)) errs.push('keys did not change lanes ' + [l1, l2]);
  await p.keyboard.press('Space'); await p.waitForTimeout(250);
  const jy = await p.evaluate(() => PO.debug.world.hero.y);
  if (!(jy > 0.4)) errs.push('space did not jump ' + jy);
  // tap left third → left lane; swipe right
  await p.waitForTimeout(600);
  await p.mouse.click(150, 400); await p.waitForTimeout(400);
  const l3 = await p.evaluate(() => PO.debug.world.hero.x);
  await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(700, 405, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400);
  const l4 = await p.evaluate(() => PO.debug.world.hero.x);
  if (!(l3 < l2 - 0.9 && l4 > l3 + 0.9)) errs.push('tap/swipe did not change lanes ' + [l2, l3, l4]);
  await p.screenshot({ path: OUT + '/smoke_steer.png' });
  await p.evaluate(() => { PO.debug.startGame(); PO.debug.setBot(true, 1); PO.debug.setSpeed(4); });
  await p.waitForFunction(() => PO.debug.world.shells >= 10, null, { timeout: 40000 }).catch(() => errs.push('bot got < 10 shells'));
  await p.evaluate(() => PO.debug.setSpeed(1));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => { PO.debug.summonBoss(); });
  await p.waitForFunction(() => PO.debug.world.objects.some(o => o.kind === 'pillow' && o.state === 'fly'), null, { timeout: 15000 }).catch(() => errs.push('no pillow thrown'));
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/smoke_boss.png' });
  await p.evaluate(() => PO.debug.setSpeed(8));
  await p.waitForFunction(() => PO.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no chapter 2'));
  await p.evaluate(() => PO.debug.setSpeed(1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { PO.debug.gotoLevel(l); PO.debug.setSpeed(3); }, lv);
    await p.waitForTimeout(3000);
    await p.evaluate(() => PO.debug.setSpeed(1));
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: no bot, pots dropped right in Pebble's lane
  await p.evaluate(() => { PO.debug.setBot(false); PO.debug.setSpeed(4); window._potT = setInterval(() => { const w = PO.debug.world; if (w && w.phase === 'play') w.spawn('pots', Math.round(w.hero.x), 4); }, 500); });
  await p.waitForFunction(() => PO.debug.mode === 'over', null, { timeout: 90000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._potT); PO.debug.setSpeed(1); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  q.on('pageerror', e => errs.push('portrait: ' + e));
  await q.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&skill=0.9&speed=2');
  await q.waitForTimeout(8000);
  await q.screenshot({ path: OUT + '/smoke_portrait.png' });
  const st = await p.evaluate(() => PO.debug.stats);
  console.log('stats', JSON.stringify({ games: st.games, scores: st.scores, levels: st.levels, errors: st.errors }));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
  process.exit(errs.length || st.errors.length ? 1 : 0);
})();
