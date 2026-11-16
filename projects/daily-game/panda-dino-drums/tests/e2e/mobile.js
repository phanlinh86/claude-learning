// Momo's Dino Drums — mobile test (iPhone / iPad, emulated touch: isMobile + hasTouch, REAL touch events via CDP).
// Checks per device: canvas fills the screen, every menu panel fits or scrolls (and its Done/Back button can be
// reached), finger-sized buttons, HUD inside the safe area (simulated notch), touch lanes (upper / lower half, multi-
// touch, HUD buttons not taps), rotation mid-game (the game plays in both orientations: no rotate prompt expected),
// Easy one-button touch, zero console errors.
// Usage (from the project folder): node tests/e2e/mobile.js   → PASS/FAIL lines, screenshots in tests/out/mobile/
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/mobile'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; fails.push(name); console.log('FAIL ' + name + (info !== undefined ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); } return ok; };
const DEVICES = [
  ['iphone-landscape', 844, 390, 3], ['iphone-portrait', 390, 844, 3],
  ['ipad-landscape', 1024, 768, 2], ['ipad-pro-landscape', 1366, 1024, 2],
  ['iphone-se-portrait', 375, 667, 2], ['iphone-se-landscape', 667, 375, 2], ['ipad-portrait', 768, 1024, 2]
];
// notch simulation: the game reads env(safe-area-inset-*) through #safeProbe's padding
const NOTCH = { landscape: '0 59px 21px 59px', portrait: '59px 0 34px 0' };

async function open(browser, w, h, dsf, q, insets) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(String(e)));
  if (insets) await page.addInitScript(p => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#safeProbe{padding:' + p + ' !important}'; document.head.appendChild(st); }); }, insets);
  await page.goto(GAME + (q || '?mute=1&seed=4'));
  await page.waitForFunction(() => window.DD && DD.debug && (DD.debug.mode === 'title' || DD.debug.mode === 'playing'), null, { timeout: 20000 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] != null ? p[2] : i })) });
  return { ctx, page, errs, touch };
}
const center = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const laneXY = (page, l, fx = 0.6) => page.evaluate(([l, fx]) => { const R = DD.Game.renderer, r = R.canvas.getBoundingClientRect(); return [r.left + r.width * fx, r.top + R.layout.coinY[l] / R.VH * r.height]; }, [l, fx]);
const taps = page => page.evaluate(() => DD.debug.world.stats.taps);
const freeze = page => page.evaluate(() => { DD.debug.setSpeed(0); const w = DD.debug.world; while (w.state === 'ready') w.update(0.4); });

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [name, w, h, dsf] of DEVICES) {
    const { ctx, page, errs, touch } = await open(browser, w, h, dsf);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}_title.png` });
    const lay = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), R = DD.Game.renderer; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, bs: [R.canvas.width, R.canvas.height], touch: document.body.classList.contains('touch') }; });
    check(`${name}: touch device detected (body.touch)`, lay.touch);
    check(`${name}: canvas fills the screen`, Math.abs(lay.cw - lay.vw) < 2 && Math.abs(lay.ch - lay.vh) < 2, lay);
    check(`${name}: backing store ≤ 3.3 MP`, lay.bs[0] * lay.bs[1] <= 3.3e6, lay.bs);
    check(`${name}: no rotate prompt / overlay blocks either orientation`, await page.evaluate(() => ![...document.querySelectorAll('body *')].some(e => /rotate/i.test(e.id + ' ' + e.className) && getComputedStyle(e).display !== 'none')));
    const bh = await page.evaluate(() => ['btnPlay', 'btnCustomize', 'btnHow', 'btnSettings'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width | 0, r.height | 0, r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight]; }));
    check(`${name}: title buttons ≥ 44 px tall and on screen`, bh.every(b => b[2] >= 43.5 && b[3]), bh);
    check(`${name}: no page scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));

    // every panel fits or scrolls, with its last button reachable — opened with real taps
    for (const [btn, scr, sel] of [['#btnHow', 'scrHow', '#scrHow .btn-back'], ['#btnSettings', 'scrSettings', '#scrSettings .btn-back'], ['#btnCustomize', 'scrCustom', '#scrCustom .btn-back']]) {
      const p = await center(page, btn); await page.touchscreen.tap(p[0], p[1]); await page.waitForTimeout(900);
      check(`${name}: tap ${btn} opens ${scr} (ghost click does not press its OK/Done)`, await page.evaluate(() => DD.UI.current) === scr);
      const fit = await page.evaluate(([scr, sel]) => {
        const panel = document.querySelector('#' + scr + ' .panel'), pr = panel.getBoundingClientRect();
        const inView = pr.left >= -0.5 && pr.top >= -0.5 && pr.right <= innerWidth + 0.5 && pr.bottom <= innerHeight + 0.5;
        const hOver = panel.scrollWidth > panel.clientWidth + 1, scrolls = panel.scrollHeight > panel.clientHeight + 1;
        const clipped = [...panel.querySelectorAll('button, input, .set, .slot')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < pr.left - 1 || r.right > pr.right + 1); }).map(e => e.id || e.className || e.tagName).slice(0, 4);
        const back = document.querySelector(sel); back.scrollIntoView({ block: 'nearest' });
        const br = back.getBoundingClientRect();
        return { inView, hOver, scrolls, clipped, backOk: br.top >= 0 && br.bottom <= innerHeight + 0.5 && br.height >= 39.5 };
      }, [scr, sel]);
      check(`${name}: ${scr} panel inside the screen, no sideways overflow`, fit.inView && !fit.hOver && fit.clipped.length === 0, fit);
      check(`${name}: ${scr} Done/Back reachable (${fit.scrolls ? 'panel scrolls' : 'fits'}) and ≥ 40 px`, fit.backOk, fit);
      await page.screenshot({ path: `${OUT}/${name}_${scr}.png` });
      const b = await center(page, sel); await page.touchscreen.tap(b[0], b[1]); await page.waitForTimeout(700);
      check(`${name}: tap Done/Back on ${scr} returns to title`, await page.evaluate(() => DD.UI.current) === 'scrTitle');
    }

    // start with a real tap on Play
    const pb = await center(page, '#btnPlay');
    await page.touchscreen.tap(pb[0], pb[1]);
    await page.waitForFunction(() => DD.debug.mode === 'playing', null, { timeout: 5000 }).catch(() => {});
    check(`${name}: tapping Play starts the game`, await page.evaluate(() => DD.debug.mode === 'playing'));
    await page.waitForTimeout(700);
    check(`${name}: the Play tap is not also a drum tap`, await taps(page) === 0);
    await freeze(page);
    // HUD
    const hud = await page.evaluate(() => {
      const R = DD.Game.renderer, L = R.layout, c = R.canvas.getBoundingClientRect();
      const bs = ['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect());
      const toL = y => (y - c.top) / c.height * R.VH;
      return { b: bs.map(r => [r.left | 0, r.top | 0, r.right | 0, r.bottom | 0, r.width | 0]), iw: innerWidth, ih: innerHeight, hudBottomL: toL(Math.max(...bs.map(r => r.bottom))), c0: L.coinY[0], drumTop: L.coinY[0] - 40 };
    });
    check(`${name}: HUD buttons ≥ 44 css px and on screen`, hud.b.every(r => r[4] >= 43.5 && r[0] >= 0 && r[2] <= hud.iw + 1 && r[1] >= 0), hud.b);
    check(`${name}: HUD sits above the upper drum`, hud.hudBottomL < hud.drumTop, hud);
    // touch lanes
    for (const lane of [1, 0, 1, 0]) {
      const p = await laneXY(page, lane), b0 = await taps(page);
      await page.touchscreen.tap(p[0], p[1]); await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
      const r = await page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
      check(`${name}: finger on lane ${lane} drums lane ${lane}`, r.lane === lane && r.taps === b0 + 1, r);
    }
    // halves: near the very top (below the HUD) and the very bottom of the screen
    {
      const top = await page.evaluate(() => { const r = DD.Game.renderer.canvas.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.28]; });
      const bot = await page.evaluate(() => { const r = DD.Game.renderer.canvas.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.97]; });
      await page.touchscreen.tap(top[0], top[1]); const l0 = await page.evaluate(() => DD.debug.world.kit.lane);
      await page.touchscreen.tap(bot[0], bot[1]); const l1 = await page.evaluate(() => DD.debug.world.kit.lane);
      check(`${name}: upper part of the screen = upper rail, bottom edge = lower rail`, l0 === 0 && l1 === 1, [l0, l1]);
    }
    // two fingers = two taps
    {
      const p0 = await laneXY(page, 0, 0.4), p1 = await laneXY(page, 1, 0.7), b0 = await taps(page);
      await touch('touchStart', [[p0[0], p0[1], 1]]);
      await touch('touchStart', [[p0[0], p0[1], 1], [p1[0], p1[1], 2]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(50);
      check(`${name}: second finger is a second drum tap`, await taps(page) === b0 + 2, await taps(page) - b0);
    }
    // swipe does not scroll or zoom the page, and counts as one tap
    {
      const p = await laneXY(page, 1), b0 = await taps(page);
      await touch('touchStart', [[p[0], p[1], 3]]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[p[0] - i * 15, p[1] - i * 20, 3]]);
      await touch('touchEnd', []);
      const s = await page.evaluate(() => ({ sx: scrollX, sy: scrollY, vv: window.visualViewport ? visualViewport.scale : 1 }));
      check(`${name}: a swipe is one tap and never scrolls/zooms the page`, await taps(page) === b0 + 1 && s.sx === 0 && s.sy === 0 && s.vv === 1, s);
    }
    // HUD button taps are not drum taps
    {
      const b0 = await taps(page);
      const pp = await center(page, '#btnPause'); await page.touchscreen.tap(pp[0], pp[1]); await page.waitForTimeout(150);
      check(`${name}: tap Pause pauses, no drum tap`, await page.evaluate(() => DD.debug.mode) === 'paused' && await taps(page) === b0);
      await page.screenshot({ path: `${OUT}/${name}_pause.png` });
      const pf = await page.evaluate(() => { const p = document.querySelector('#scrPause .panel').getBoundingClientRect(); return p.top >= 0 && p.bottom <= innerHeight + 0.5 && p.left >= 0 && p.right <= innerWidth + 0.5; });
      check(`${name}: pause panel fits on screen`, pf);
      const rp = await center(page, '#btnResume'); await page.touchscreen.tap(rp[0], rp[1]); await page.waitForTimeout(700);
      check(`${name}: tap Resume resumes, no drum tap`, await page.evaluate(() => DD.debug.mode) === 'playing' && await taps(page) === b0);
    }
    // play a bit with the bot for a screenshot, Pip in
    await page.evaluate(() => { DD.debug.setSpeed(1); DD.debug.setBot(true, 1); });
    await page.waitForTimeout(2500);
    await page.evaluate(() => DD.debug.helperNow()); await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${name}_play_pip.png` });
    const pip = await page.evaluate(() => {
      const R = DD.Game.renderer, L = R.layout, hp = DD.debug.world.helper;
      const x = L.ringX + hp.x01 * 0.5 * (R.VW - L.ringX), y = L.coinY[0] + (hp.y01 - 0.5) * 2 * (L.coinY[1] - L.coinY[0]);
      const c = R.canvas.getBoundingClientRect(), hb = document.getElementById('hud').getBoundingClientRect();
      return { st: hp.state, x, y, VW: R.VW, VH: R.VH, hudL: (hb.left - c.left) / c.width * R.VW, hudB: (hb.bottom - c.top) / c.height * R.VH };
    });
    check(`${name}: Pip perched on screen and not under the HUD buttons`, pip.st === 'with' && pip.x > 20 && pip.x < pip.VW - 20 && pip.y > 20 && !(pip.x > pip.hudL - 40 && pip.y < pip.hudB + 35), pip);
    // rotate mid-game (no rotate prompt: the game re-lays out and keeps playing)
    await page.evaluate(() => DD.debug.setBot(false));
    await page.setViewportSize({ width: h, height: w }); await page.waitForTimeout(700);
    const rot = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(), R = DD.Game.renderer, L = R.layout; return { cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight, mode: DD.debug.mode, portrait: R.VW < R.VH, c0: L.coinY[0], c1: L.coinY[1] }; });
    check(`${name}: after rotating, canvas refills the screen and the game keeps playing`, Math.abs(rot.cw - rot.vw) < 2 && Math.abs(rot.ch - rot.vh) < 2 && rot.mode === 'playing' && rot.portrait === (w > h), rot);
    await freeze(page);
    for (const lane of [1, 0]) {
      const p = await laneXY(page, lane);
      await page.touchscreen.tap(p[0], p[1]);
      check(`${name}: after rotating, finger on lane ${lane} drums lane ${lane}`, await page.evaluate(() => DD.debug.world.kit.lane) === lane);
    }
    await page.evaluate(() => DD.debug.setSpeed(1)); await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${name}_rotated.png` });
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500);
    // game over panel
    await page.evaluate(() => DD.debug.world._die());
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}_over.png` });
    const ov = await page.evaluate(() => { const p = document.querySelector('#scrOver .panel'), r = p.getBoundingClientRect(); const a = document.getElementById('btnAgain'); a.scrollIntoView({ block: 'nearest' }); const ar = a.getBoundingClientRect(); return { inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, again: ar.top >= 0 && ar.bottom <= innerHeight && ar.height >= 44, scrolls: p.scrollHeight > p.clientHeight + 1 }; });
    check(`${name}: game-over panel fits (or scrolls) with Play Again reachable`, ov.inView && ov.again, ov);
    await page.waitForTimeout(200);
    const ap = await center(page, '#btnAgain'); await page.touchscreen.tap(ap[0], ap[1]); await page.waitForTimeout(700);
    check(`${name}: tap Play Again restarts once`, await page.evaluate(() => DD.debug.mode === 'playing' && DD.debug.world.score === 0 && DD.debug.world.stats.taps === 0));
    check(`${name}: no console errors`, errs.length === 0 && (await page.evaluate(() => DD.debug.stats.errors.length)) === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ---- Easy one-button on touch ----
  {
    const { ctx, page, errs } = await open(browser, 844, 390, 3, '?mute=1&seed=4&autostart=1&diff=easy');
    await freeze(page);
    let ok = true; const det = [];
    for (const [fx, fy] of [[0.5, 0.3], [0.8, 0.95], [0.15, 0.6]]) {
      const n = await page.evaluate(() => { const w = DD.debug.world, t = w.songTime + w._acc + w.cfg.goodWin; const n = w.notes.find(n => n.state === 'live' && n.time > t); let d = n.time - (w.songTime + w._acc); while (d > 1e-9) { const s = Math.min(d, 0.4); w.update(s); d -= s; } return n; });
      const p = await page.evaluate(([fx, fy]) => { const r = DD.Game.renderer.canvas.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; }, [fx, fy]);
      await page.touchscreen.tap(p[0], p[1]);
      const s = await page.evaluate(id => DD.debug.world.notes.find(n => n.id === id).state, n.id);
      det.push(`${fx},${fy}→lane ${n.lane}:${s}`); if (s !== 'hit') ok = false;
    }
    check('easy (touch): a tap anywhere catches the next gem', ok, det.join(' '));
    check('easy (touch): no console errors', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  // ---- simulated notch / home indicator: HUD + drums inside the safe area ----
  for (const [name, w, h, ins] of [['notch-landscape', 844, 390, NOTCH.landscape], ['notch-portrait', 390, 844, NOTCH.portrait]]) {
    const { ctx, page, errs } = await open(browser, w, h, 3, '?mute=1&seed=4&autostart=1', ins);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const R = DD.Game.renderer, L = R.layout, c = R.canvas.getBoundingClientRect(), s = c.width / R.VW;
      const hb = document.getElementById('hud').getBoundingClientRect();
      const probe = getComputedStyle(document.getElementById('safeProbe'));
      const sa = ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(probe['padding' + k]));
      const toCss = (x, y) => [c.left + x * s, c.top + y * s];
      const drumL = toCss(L.ringX - 36 * L.gs, L.laneY[1] + 20), kitL = toCss(L.kitX - 48 * L.gs, 0);
      return { sa, hud: [hb.left, hb.top, hb.right, hb.bottom].map(v => Math.round(v)), iw: innerWidth, ih: innerHeight, drumLeftCss: drumL[0], lowerRailBottomCss: drumL[1], kitLeftCss: kitL[0], ins: R.ins };
    });
    check(`${name}: insets read by the renderer`, r.ins.top + r.ins.left + r.ins.right + r.ins.bottom > 10, r.ins);
    check(`${name}: HUD buttons inside the safe area`, r.hud[1] >= r.sa[0] - 0.5 && r.hud[2] <= r.iw - r.sa[1] + 0.5, r);
    check(`${name}: Momo and the drums clear of the side notch`, r.kitLeftCss >= r.sa[3] - 0.5 && r.drumLeftCss >= r.sa[3] - 0.5, r);
    check(`${name}: lower rail above the home indicator`, r.lowerRailBottomCss <= r.ih - r.sa[2] + 0.5, r);
    const p = await laneXY(page, 1); await page.touchscreen.tap(p[0], p[1]);
    check(`${name}: lower-lane touch still works`, await page.evaluate(() => DD.debug.world.kit.lane) === 1);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    check(`${name}: no console errors`, errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
})();
