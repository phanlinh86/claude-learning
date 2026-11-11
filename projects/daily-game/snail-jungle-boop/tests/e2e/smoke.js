// Smoke test: boot, title (bot demo), a real click on a matching friend, a wrong-colour click, keys 1–9, a touch tap
// on a phone, bot play at speed through a biome change, every biome, game over; zero console errors.
// Screenshots in tests/out/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
// screen position of hole i's hit-zone centre
const holeXY = (pg, i) => pg.evaluate(i => {
  const R = ZJB.Game.renderer, h = ZJB.debug.world.holes[i], r = R.canvas.getBoundingClientRect();
  const k = R.k / (R.canvas.width / r.width);
  return [r.left + R.ox / (R.canvas.width / r.width) + h.x * k, r.top + R.oy / (R.canvas.height / r.height) + (h.y - 45 * h.s) * k];
}, i);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(GAME + '?mute=1&seed=7');
  await p.waitForFunction(() => window.ZJB && ZJB.debug && ZJB.debug.mode === 'title', null, { timeout: 15000 });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: OUT + '/smoke_title.png' });
  await p.goto(GAME + '?mute=1&seed=7&autostart=1&diff=easy');
  await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'playing');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '/smoke_banner.png' });
  // a real click on a matching friend
  await p.evaluate(() => { const w = ZJB.debug.world; w.holes.forEach((h, i) => { h.critter = null; }); ZJB.debug.spawn(1, w.colour); });
  await p.waitForTimeout(400);
  let [x, y] = await holeXY(p, 1);
  const s0 = await p.evaluate(() => ZJB.debug.world.score);
  await p.mouse.click(x, y);
  await p.waitForTimeout(120);
  await p.screenshot({ path: OUT + '/smoke_boop.png' });
  const s1 = await p.evaluate(() => ZJB.debug.world.score);
  if (!(s1 > s0)) errs.push('click on a matching friend did not score: ' + s0 + ' → ' + s1);
  await p.waitForTimeout(600);
  // a wrong colour
  await p.evaluate(() => { const w = ZJB.debug.world; ZJB.debug.spawn(4, w.colours.find(c => c !== w.colour)); });
  await p.waitForTimeout(400);
  [x, y] = await holeXY(p, 4);
  const l0 = await p.evaluate(() => ZJB.debug.world.leaves);
  await p.mouse.click(x, y);
  await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/smoke_wrong.png' });
  const l1 = await p.evaluate(() => ZJB.debug.world.leaves);
  if (!(l1 === l0 - 1)) errs.push('wrong colour did not cost a leaf: ' + l0 + ' → ' + l1);
  await p.waitForTimeout(700);
  // keyboard 1–9
  await p.evaluate(() => { const w = ZJB.debug.world; ZJB.debug.spawn(0, w.colour); });
  await p.waitForTimeout(400);
  const b0 = await p.evaluate(() => ZJB.debug.world.boops);
  await p.keyboard.press('Digit1');
  const b1 = await p.evaluate(() => ZJB.debug.world.boops);
  if (!(b1 === b0 + 1)) errs.push('key 1 did not boop: ' + b0 + ' → ' + b1);
  // bot play through a biome change
  await p.evaluate(() => { ZJB.debug.startGame(); ZJB.debug.setBot(true, 1); ZJB.debug.setSpeed(8); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => ZJB.debug.setSpeed(1));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/smoke_play.png' });
  await p.evaluate(() => ZJB.debug.setSpeed(8));
  await p.waitForFunction(() => ZJB.debug.world.level >= 1, null, { timeout: 60000 }).catch(() => errs.push('no level 2'));
  await p.evaluate(() => ZJB.debug.setSpeed(1));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/smoke_levelup.png' });
  for (const lv of [1, 2, 3]) {
    await p.evaluate(l => { ZJB.debug.gotoLevel(l); ZJB.debug.setSpeed(2); }, lv);
    await p.waitForTimeout(4000);
    await p.evaluate(() => ZJB.debug.setSpeed(1));
    await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/smoke_zone' + lv + '.png' });
  }
  // game over: tap only wrong colours
  await p.evaluate(() => {
    ZJB.debug.setBot(false); ZJB.debug.setSpeed(4);
    window._t = setInterval(() => { const w = ZJB.debug.world; w.holes.forEach((h, i) => { if (h.critter && h.critter.colour !== w.colour && h.critter.colour !== w.graceColour) ZJB.debug.tap(i); }); }, 50);
  });
  await p.waitForFunction(() => ZJB.debug.mode === 'over', null, { timeout: 120000 }).catch(() => errs.push('no game over'));
  await p.evaluate(() => { clearInterval(window._t); ZJB.debug.setSpeed(1); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/smoke_over.png' });
  // touch phone in landscape: a tap on a matching friend boops
  const m = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  m.on('pageerror', e => errs.push('mobile: ' + e));
  await m.goto(GAME + '?mute=1&seed=3&autostart=1');
  await m.waitForFunction(() => window.ZJB && ZJB.debug && ZJB.debug.mode === 'playing');
  await m.evaluate(() => { const w = ZJB.debug.world; ZJB.debug.spawn(3, w.colour); });
  await m.waitForTimeout(400);
  [x, y] = await holeXY(m, 3);
  await m.touchscreen.tap(x, y);
  await m.waitForTimeout(150);
  if ((await m.evaluate(() => ZJB.debug.world.boops)) !== 1) errs.push('touch tap did not boop');
  await m.screenshot({ path: OUT + '/smoke_phone.png' });
  const pp = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await pp.goto(GAME + '?mute=1&seed=3&autostart=1');
  await pp.waitForTimeout(1500);
  await pp.screenshot({ path: OUT + '/smoke_portrait.png' });
  const ip = await b.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ip.goto(GAME + '?mute=1&seed=3&autostart=1&bot=1&speed=2');
  await ip.waitForTimeout(3500);
  await ip.screenshot({ path: OUT + '/smoke_ipad.png' });
  const st = await p.evaluate(() => ZJB.debug.stats);
  if (st.errors.length) errs.push(...st.errors);
  await b.close();
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
  console.log('PASS smoke');
})();
