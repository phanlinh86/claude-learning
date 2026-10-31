// Mobile test: iPhone / iPad, portrait + landscape, emulated touch (isMobile + hasTouch) and REAL touch events via CDP.
// Checks: full-screen canvas (no letterbox bars inside the clamps), safe-area-aware HUD, the 💧 button never over
// Puff's reachable shore, one-finger steering, second finger = Cool Rain, rotate mid-game, zero console errors.
// Usage: node tests/e2e/mobile.js [--shots]   → PASS/FAIL lines, screenshots in tests/out/mobile/
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/mobile'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + JSON.stringify(info) : '')); } };
const DEVICES = [
  ['iphone-portrait', 393, 852, 3], ['iphone-landscape', 852, 393, 3],
  ['ipad-portrait', 820, 1180, 2], ['ipad-landscape', 1180, 820, 2], ['ipad-pro-landscape', 1366, 1024, 2],
  ['iphone-se-portrait', 375, 667, 2]
];
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [name, w, h, dsf] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(GAME + '?mute=1&seed=4');
    await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}_title.png` });
    const lay = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), R = VC.Game.renderer; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, L: R.layout, bs: [R.canvas.width, R.canvas.height] }; });
    check(`${name}: canvas fills the screen`, Math.abs(lay.cw - lay.vw) < 2 && Math.abs(lay.ch - lay.vh) < 2, lay);
    check(`${name}: backing store ≤ 3.3 MP`, lay.bs[0] * lay.bs[1] <= 3.3e6, lay.bs);
    // title menu buttons big enough for a finger
    const bh = await page.evaluate(() => ['btnPlay', 'btnCustomize', 'btnHow', 'btnSettings'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height, r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight]; }));
    check(`${name}: title buttons ≥ 40 px tall and on screen`, bh.every(b => b[1] >= 40 && b[2]), bh);
    // start with a real tap on Play
    const pb = await page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.touchscreen.tap(pb[0], pb[1]);
    await page.waitForFunction(() => VC.debug.mode === 'playing', null, { timeout: 5000 }).catch(() => {});
    check(`${name}: tapping Play starts the game`, await page.evaluate(() => VC.debug.mode === 'playing'));
    await page.waitForTimeout(1800);
    // HUD buttons + rain button layout
    const ui = await page.evaluate(() => {
      const R = VC.Game.renderer, L = R.layout, w = VC.debug.world, c = document.getElementById('game').getBoundingClientRect();
      const toL = r => ({ x: (r.left - c.left) / c.width * L.VW, y: (r.top - c.top) / c.height * L.VH, w: r.width / c.width * L.VW, h: r.height / c.height * L.VH, cssW: r.width });
      const a = toL(document.getElementById('btnAction').getBoundingClientRect());
      const hb = ['btnPause', 'btnMuteHud'].map(id => toL(document.getElementById(id).getBoundingClientRect()));
      return { L, a, hb, xMin: w.cfg.xMin, xMax: w.cfg.xMax, vis: !document.getElementById('btnAction').classList.contains('hidden') };
    });
    check(`${name}: 💧 button shown and ≥ 56 css px`, ui.vis && ui.a.cssW >= 56, ui.a);
    // the button must not overlap the band Puff + basket use (scene y 340..500, x in xMin-50..xMax+50)
    const sx = ui.a.x - ui.L.SX, sy = ui.a.y - ui.L.SY;
    const overlapPuff = sx < ui.xMax + 50 && sx + ui.a.w > ui.xMin - 50 && sy < 500 && sy + ui.a.h > 340;
    check(`${name}: 💧 never covers Puff's shore band`, !overlapPuff, { sx, sy, xMin: ui.xMin, xMax: ui.xMax });
    check(`${name}: shore range is wide enough (≥ 440 px portrait, ≥ 640 landscape)`, ui.xMax - ui.xMin >= (h > w ? 440 : 640), [ui.xMin, ui.xMax]);
    check(`${name}: HUD buttons ≥ 44 css px and inside the canvas`, ui.hb.every(b => b.cssW >= 43.5 && b.x >= 0 && b.x + b.w <= ui.L.VW + 1 && b.y >= 0), ui.hb);
    // real touch steering via CDP: hold a finger at the left of the screen, then drag right
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] != null ? p[2] : i })) });
    const sceneToCss = (x, y) => page.evaluate(([x, y]) => { const R = VC.Game.renderer, c = document.getElementById('game').getBoundingClientRect(); return [c.left + (x + R.SX) / R.VW * c.width, c.top + (y + R.SY) / R.VH * c.height]; }, [x, y]);
    const left = await sceneToCss(ui.xMin + 30, 300), right = await sceneToCss(ui.xMax - 30, 300);
    await touch('touchStart', [[left[0], left[1], 1]]);
    await page.waitForTimeout(1200);
    const px1 = await page.evaluate(() => VC.debug.world.puff.x);
    check(`${name}: finger hold steers Puff left`, Math.abs(px1 - (ui.xMin + 30)) < 25, px1);
    for (let i = 1; i <= 10; i++) { const x = left[0] + (right[0] - left[0]) * i / 10; await touch('touchMove', [[x, left[1], 1]]); await page.waitForTimeout(30); }
    await page.waitForTimeout(1200);
    const px2 = await page.evaluate(() => VC.debug.world.puff.x);
    check(`${name}: dragging the finger right moves Puff right`, Math.abs(px2 - (ui.xMax - 30)) < 25, px2);
    // second finger = Cool Rain; it must not steer
    await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
    const mid = await sceneToCss(480, 250);
    await touch('touchStart', [[right[0], right[1], 1], [mid[0], mid[1], 2]]);
    await page.waitForTimeout(80);
    await touch('touchMove', [[right[0], right[1], 1], [mid[0] - 30, mid[1], 2]]);
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ rain: VC.debug.world.rain.active > 0 || VC.debug.world.rains > 0, x: VC.debug.world.puff.x }));
    check(`${name}: second finger starts Cool Rain`, st.rain, st);
    check(`${name}: second finger does not steer`, Math.abs(st.x - (ui.xMax - 30)) < 25, st.x);
    await touch('touchEnd', []);
    await page.waitForTimeout(200);
    // tap the 💧 button
    await page.evaluate(() => { const w = VC.debug.world; w.rain.charge = 1; w.rain.active = 0; });
    const ab = await page.evaluate(() => { const r = document.getElementById('btnAction').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const before = await page.evaluate(() => VC.debug.world.rains);
    await page.touchscreen.tap(ab[0], ab[1]); await page.waitForTimeout(150);
    check(`${name}: tapping 💧 starts Cool Rain`, (await page.evaluate(() => VC.debug.world.rains)) > before);
    // bot play for a few seconds for screenshots
    await page.evaluate(() => { VC.debug.setBot(true, 1); });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/${name}_play.png` });
    await page.evaluate(() => VC.debug.gotoLevel(3)); await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/${name}_night.png` });
    // pause screen
    await page.evaluate(() => VC.Game.pause()); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}_pause.png` });
    await page.evaluate(() => VC.Game.resume());
    // rotate mid-game
    await page.setViewportSize({ width: h, height: w }); await page.waitForTimeout(700);
    const rot = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), w = VC.debug.world; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, x: w.puff.x, xMin: w.cfg.xMin, xMax: w.cfg.xMax, mode: VC.debug.mode }; });
    check(`${name}: after rotating, canvas refills the screen and Puff stays on his shore`, Math.abs(rot.cw - rot.vw) < 2 && Math.abs(rot.ch - rot.vh) < 2 && rot.x >= rot.xMin && rot.x <= rot.xMax, rot);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}_rotated.png` });
    // game over screen
    await page.evaluate(() => { VC.debug.setBot(false); const w = VC.debug.world; w.hearts = 1; w.puff.invuln = 0; });
    await page.evaluate(() => { VC.debug.setSpeed(8); });
    await page.waitForFunction(() => VC.debug.mode === 'over', null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}_over.png` });
    const ov = await page.evaluate(() => { const r = document.querySelector('#scrOver .panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
    check(`${name}: game-over panel fits on screen`, ov);
    check(`${name}: no console errors`, errs.length === 0 && (await page.evaluate(() => VC.debug.stats.errors.length)) === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // notch: simulate safe-area insets by overriding the probe padding
  {
    const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#safeProbe{padding:0 59px 21px 59px !important}'; document.head.appendChild(st); }); });
    await page.goto(GAME + '?mute=1&seed=4&autostart=1');
    await page.waitForFunction(() => VC.debug && VC.debug.mode === 'playing');
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const R = VC.Game.renderer, w = VC.debug.world; return { ins: R.ins, xMin: w.cfg.xMin, xMax: w.cfg.xMax, visL: R.layout.visL, visR: R.layout.visR, hud: document.getElementById('hud').getBoundingClientRect().right }; });
    check('notch landscape: insets read and the shore stays clear of the notch', r.ins.left > 70 && r.xMin >= r.visL + 40 && r.xMax <= r.visR - 40, r);
    check('notch landscape: HUD buttons clear of the right notch', r.hud <= 852 - 59 + 1, r.hud);
    await page.screenshot({ path: `${OUT}/notch_landscape.png` });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})();
