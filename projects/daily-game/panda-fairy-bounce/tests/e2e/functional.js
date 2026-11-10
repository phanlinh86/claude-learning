#!/usr/bin/env node
// Mochi's Fairy Bounce — functional QA suite (Playwright, file://).
// Run from anywhere:   node tests/e2e/functional.js          (add --quick to shorten the long bot soak)
// Prints PASS/FAIL per check, a summary, and exits 1 on any failure. Screenshots go to tests/out/functional_*.png.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const GAME = 'file://' + path.join(ROOT, 'game/index.html');
const OUT = path.join(ROOT, 'tests/out'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail != null ? '  — ' + detail : ''));
}
async function section(name, fn) {
  console.log('\n== ' + name);
  try { await fn(); } catch (e) { check(name + ': section ran to the end', false, String(e && e.message || e).split('\n')[0]); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
const allKeys = new Set();   // every storage key the game wrote (checked against the Go wrapper's key rule)

/** A fresh context (own localStorage) + page, booted. Returns { ctx, p, errs }. */
async function open(q = 'mute=1&seed=7', opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e));
  await p.goto(GAME + (q ? '?' + q : ''));
  await booted(p);
  return { ctx, p, errs };
}
async function booted(p) {
  await p.waitForFunction(() => window.MFB && MFB.debug && (MFB.debug.mode === 'title' || MFB.debug.mode === 'playing'), null, { timeout: 15000 });
  await p.evaluate(() => {
    // spies: count startGame calls, record events, record storage keys
    const G = MFB.Game;
    if (!G._spied) {
      G._spied = true; window._starts = 0; window._ev = []; window._keys = [];
      const sg = G.startGame; G.startGame = function () { window._starts++; return sg.apply(this, arguments); };
      const he = G.handleEvents; G.handleEvents = function (e) { if (window._ev.length < 5000) window._ev.push(...e.map(x => Object.assign({}, x))); return he.apply(this, arguments); };
      const S = MFB.Storage, ss = S.set, sd = S.del;
      S.set = function (k) { window._keys.push(k); return ss.apply(this, arguments); };
      S.del = function (k) { window._keys.push(k); return sd.apply(this, arguments); };
    }
  });
}
async function collectKeys(p) { try { (await p.evaluate(() => window._keys || [])).forEach(k => allKeys.add(k)); } catch (_) {} }
async function close(o, label) {
  await collectKeys(o.p);
  const st = await o.p.evaluate(() => MFB.debug.stats.errors).catch(() => []);
  check(label + ': zero console/page errors', o.errs.length === 0 && st.length === 0, [...o.errs, ...st].slice(0, 3).join(' | '));
  await o.ctx.close();
}
const W = (p, fn, arg) => p.evaluate(fn, arg);
const mode = p => W(p, () => MFB.debug.mode);
const phase = p => W(p, () => MFB.debug.world.phase);
const visibleScreen = p => W(p, () => MFB.UI.current);
const isHidden = (p, id) => W(p, id => document.getElementById(id).classList.contains('hidden'), id);
async function waitGameTime(p, sec) {
  const t0 = await W(p, () => MFB.debug.world.time);
  await p.waitForFunction(t => MFB.debug.world.time >= t, t0 + sec, { timeout: 20000 });
}
/** keep the ball on the cap (no auto-serve) — isolates tests from a ball falling by itself */
const holdServe = p => W(p, () => { const w = MFB.debug.world; if (w.phase === 'serve') w.serveT = -1e6; });
/** make the ball drop past Mochi right now (from below the bounce line, far from the cap) */
const dropBall = (p, keepNet) => W(p, keep => {
  const w = MFB.debug.world;
  if (w.phase === 'serve') w.serve();
  if (!keep) w.net.saves = 0;
  const b = w.ball; b.x = w.paddle.x > 8 ? 2 : 14; b.y = 0.9; b.px = b.x; b.py = b.y; b.vx = 0; b.vy = -6;
}, !!keepNet);
async function forceGameOver(p) {
  await W(p, () => { MFB.debug.world.hearts = 1; MFB.debug.setSpeed(3); });
  await dropBall(p);
  await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 15000 });
  await W(p, () => MFB.debug.setSpeed(1));
}
/** a picture made in the browser: returns a Buffer */
async function makeImage(p, w, h, type, kind) {
  const b64 = await p.evaluate(([w, h, type, kind]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (kind === 'cutout') {   // transparent corners, a pink blob in the middle
      g.fillStyle = '#ff4fa0'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.4, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.42, h * 0.45, w * 0.05, 0, 7); g.arc(w * 0.58, h * 0.45, w * 0.05, 0, 7); g.fill();
    } else if (kind === 'green') {
      g.fillStyle = '#00c800'; g.fillRect(0, 0, w, h);
    } else {                   // a "photo": opaque gradient with shapes
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3060c0'); gr.addColorStop(1, '#f0c040');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, 7); g.fill();
    }
    return c.toDataURL(type, 0.9).split(',')[1];
  }, [w, h, type, kind]);
  return Buffer.from(b64, 'base64');
}
async function pickFile(p, slotIdx, file) {
  const [fc] = await Promise.all([
    p.waitForEvent('filechooser', { timeout: 5000 }),
    p.locator('#slotGrid .slot').nth(slotIdx).locator('[data-act=pick]').click()
  ]);
  await fc.setFiles(file);
  // wait for the toast to report the outcome
  await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && !/Saving/.test(t.textContent); }, null, { timeout: 15000 });
  return W(p, () => document.getElementById('toast').textContent);
}
const SLOT = { hero: 0, ball: 1, star: 2, bg_spring: 3, bg_summer: 4, bg_autumn: 5, bg_winter: 6 };

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ------------------------------------------------------------------ boot + menus
  await section('boot and menus', async () => {
    const o = await open('mute=1&seed=7'), p = o.p;
    check('boots to the title (mode title, scrTitle shown)', (await mode(p)) === 'title' && (await visibleScreen(p)) === 'scrTitle');
    check('title runs a bot demo (world time advances)', await (async () => { const t = await W(p, () => MFB.debug.world.time); await sleep(400); return (await W(p, () => MFB.debug.world.time)) > t; })());
    check('HUD hidden on title', await isHidden(p, 'hud'));
    check('Quit button hidden in the browser', await isHidden(p, 'btnQuit'));
    // How to Play: open, OK closes
    await p.click('#btnHow');
    check('How to Play opens', (await visibleScreen(p)) === 'scrHow');
    await p.click('#scrHow .btn-back');
    check('How to Play "OK" goes back to the title', (await visibleScreen(p)) === 'scrTitle');
    await p.click('#btnHow'); await p.keyboard.press('Escape');
    check('Esc closes How to Play', (await visibleScreen(p)) === 'scrTitle');
    // Settings
    await p.click('#btnSettings');
    check('Settings opens', (await visibleScreen(p)) === 'scrSettings');
    await p.click('#scrSettings .btn-back');
    check('Settings "Done" goes back to the title', (await visibleScreen(p)) === 'scrTitle');
    await p.click('#btnSettings'); await p.keyboard.press('Escape');
    check('Esc closes Settings', (await visibleScreen(p)) === 'scrTitle');
    // Change pictures
    await p.click('#btnCustomize');
    check('Change Pictures opens with 7 slot cards', (await visibleScreen(p)) === 'scrCustom' && (await p.locator('#slotGrid .slot').count()) === 7);
    await p.keyboard.press('Escape');
    check('Esc closes Change Pictures', (await visibleScreen(p)) === 'scrTitle');
    await p.click('#btnCustomize'); await p.click('#scrCustom .btn-back');
    check('Change Pictures "Done" goes back to the title', (await visibleScreen(p)) === 'scrTitle');
    await p.keyboard.press('Escape');
    check('Esc on the title does nothing', (await visibleScreen(p)) === 'scrTitle' && (await mode(p)) === 'title');
    // Play → pause menu
    await p.click('#btnPlay');
    check('Play starts the game (mode playing, HUD shown, no menu)', (await mode(p)) === 'playing' && !(await isHidden(p, 'hud')) && (await visibleScreen(p)) === null);
    check('focus left the menu buttons after Play', await W(p, () => !document.activeElement || document.activeElement.tagName !== 'BUTTON'));
    await holdServe(p);
    await p.keyboard.press('Escape');
    check('Esc pauses (scrPause, HUD hidden)', (await mode(p)) === 'paused' && (await visibleScreen(p)) === 'scrPause' && (await isHidden(p, 'hud')));
    await p.keyboard.press('Escape');
    check('Esc resumes from pause', (await mode(p)) === 'playing' && (await visibleScreen(p)) === null);
    await p.keyboard.press('KeyP');
    check('P pauses', (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings');
    check('Pause → Settings opens', (await visibleScreen(p)) === 'scrSettings' && (await mode(p)) === 'paused');
    await p.keyboard.press('Escape');
    check('Esc in Settings goes back to the Pause menu (not the title)', (await visibleScreen(p)) === 'scrPause' && (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); await p.click('#scrSettings .btn-back');
    check('Settings "Done" from pause goes back to Pause', (await visibleScreen(p)) === 'scrPause');
    await p.click('#btnResume');
    check('Resume button resumes', (await mode(p)) === 'playing');
    await p.keyboard.press('Escape'); await p.click('#btnRestart');
    check('Restart starts a fresh run', (await mode(p)) === 'playing' && (await W(p, () => MFB.debug.world.time)) < 1);
    await p.keyboard.press('Escape'); await p.click('#btnPauseMenu');
    check('Main Menu goes back to the title', (await mode(p)) === 'title' && (await visibleScreen(p)) === 'scrTitle');
    // game over screen
    await p.click('#btnPlay');
    await forceGameOver(p);
    check('game over shows scrOver', (await visibleScreen(p)) === 'scrOver');
    await p.keyboard.press('Escape');
    check('Esc on game over does nothing', (await visibleScreen(p)) === 'scrOver');
    await sleep(800);
    await p.click('#btnOverMenu');
    check('game over "Menu" goes to the title', (await mode(p)) === 'title');
    await p.click('#btnPlay'); await forceGameOver(p); await sleep(800);
    await p.click('#btnAgain');
    check('game over "Play Again" restarts', (await mode(p)) === 'playing');
    await p.screenshot({ path: OUT + '/functional_menus.png' });
    await close(o, 'boot and menus');
  });

  // ------------------------------------------------------------------ focus / double start / restart lock
  await section('focus, keyboard activation, restart lock', async () => {
    let o = await open('mute=1&seed=7'), p = o.p;
    await sleep(200);
    check('Play has focus on the title', await W(p, () => document.activeElement && document.activeElement.id === 'btnPlay'));
    await p.keyboard.press('Space');
    await sleep(150);
    check('Space on the focused Play starts exactly one game', (await W(p, () => window._starts)) === 1 && (await mode(p)) === 'playing');
    check('…and does not also serve the ball', (await phase(p)) === 'serve');
    await W(p, () => MFB.debug.world && MFB.Game.toTitle()); await sleep(200);
    await p.keyboard.press('Enter'); await sleep(150);
    check('Enter on the focused Play starts exactly one game', (await W(p, () => window._starts)) === 2 && (await phase(p)) === 'serve');
    await W(p, () => MFB.Game.toTitle()); await sleep(200);
    await p.focus('#btnSettings'); await p.keyboard.press('Enter'); await sleep(100);
    check('Enter on a focused Settings button opens Settings (no game start)', (await visibleScreen(p)) === 'scrSettings' && (await W(p, () => window._starts)) === 2);
    await p.keyboard.press('Escape');
    // pause menu: Enter on Resume resumes without serving
    await p.click('#btnPlay'); await holdServe(p);
    await p.keyboard.press('Escape'); await sleep(100);
    await p.keyboard.press('Enter'); await sleep(100);
    check('Enter on the focused Resume resumes without serving', (await mode(p)) === 'playing' && (await phase(p)) === 'serve');
    await p.keyboard.press('Escape'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100);
    check('Space on the focused Resume resumes without serving', (await mode(p)) === 'playing' && (await phase(p)) === 'serve');
    // restart lock
    const n0 = await W(p, () => window._starts);
    await W(p, () => { MFB.debug.world.hearts = 1; MFB.debug.setSpeed(3); });
    await dropBall(p);
    await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 15000, polling: 'raf' });
    await W(p, () => MFB.debug.setSpeed(1));
    await p.keyboard.press('Enter');
    const lockedEnter = await mode(p);
    await p.click('#btnAgain', { force: true });
    const lockedClick = await mode(p);
    const sinceOver = await W(p, () => performance.now() - MFB.Game.overAt);
    check('Enter right after game over is ignored (0.7 s lock)', lockedEnter === 'over' || sinceOver > 700, 'mode ' + lockedEnter + ' after ' + sinceOver.toFixed(0) + ' ms');
    check('Play Again click inside the 0.7 s lock is ignored', lockedClick === 'over' || sinceOver > 700, 'mode ' + lockedClick);
    await sleep(800);
    await p.keyboard.press('Enter'); await sleep(100);
    check('Enter after the lock restarts exactly once', (await mode(p)) === 'playing' && (await W(p, () => window._starts)) === n0 + 1);
    // Space on focused Play Again
    await forceGameOver(p); await sleep(850);
    const n1 = await W(p, () => window._starts);
    check('Play Again has focus on game over', await W(p, () => document.activeElement && document.activeElement.id === 'btnAgain'));
    await p.keyboard.press('Space'); await sleep(150);
    check('Space on the focused Play Again restarts exactly once and does not serve', (await W(p, () => window._starts)) === n1 + 1 && (await phase(p)) === 'serve');
    // Enter while the Menu button is focused on game over → goes to the menu, not a restart
    await forceGameOver(p); await sleep(850);
    await p.focus('#btnOverMenu'); await p.keyboard.press('Enter'); await sleep(100);
    check('Enter on a focused "Menu" (game over) opens the title', (await mode(p)) === 'title');
    await close(o, 'focus');
  });

  // ------------------------------------------------------------------ input: mouse + keyboard + HUD
  await section('input: mouse, keyboard, HUD buttons, auto-serve', async () => {
    const o = await open('mute=1&seed=7&autostart=1&diff=easy'), p = o.p;
    await holdServe(p);
    await p.mouse.move(250, 400); await sleep(600);
    const xl = await W(p, () => MFB.debug.world.paddle.x);
    await p.mouse.move(1050, 400); await sleep(600);
    const xr = await W(p, () => MFB.debug.world.paddle.x);
    const want = await W(p, () => MFB.Game.renderer.toWorldX(MFB.Game.renderer.toLogical(1050, 400)[0]));
    check('mouse move (no button) steers left', xl < 5, 'x=' + xl.toFixed(2));
    check('mouse move steers right to the pointer', Math.abs(xr - want) < 0.3, 'x=' + xr.toFixed(2) + ' want ' + want.toFixed(2));
    check('mouse move alone does not serve', (await phase(p)) === 'serve');
    // HUD buttons
    const pauseBox = await p.locator('#btnPause').boundingBox();
    const tg0 = await W(p, () => MFB.debug.world.paddle.target);
    await p.mouse.move(pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2); await sleep(400);
    const xh = await W(p, () => MFB.debug.world.paddle.x), tg1 = await W(p, () => MFB.debug.world.paddle.target);
    check('hovering the HUD Pause button does not steer', tg1 === tg0, 'target ' + tg0 + ' → ' + tg1);
    await p.mouse.down(); await p.mouse.up(); await sleep(100);
    check('clicking HUD Pause pauses and does not serve', (await mode(p)) === 'paused' && (await phase(p)) === 'serve');
    await p.keyboard.press('Escape');
    const muteBox = await p.locator('#btnMuteHud').boundingBox();
    const m0 = await W(p, () => MFB.Game.settings.muted || MFB.Game.urlMute);
    await p.mouse.move(muteBox.x + muteBox.width / 2, muteBox.y + muteBox.height / 2);
    await p.mouse.down(); await p.mouse.up(); await sleep(100);
    const m1 = await W(p, () => MFB.Game.settings.muted || MFB.Game.urlMute);
    check('clicking HUD Mute toggles sound and does not serve or steer', m0 !== m1 && (await phase(p)) === 'serve' && (await mode(p)) === 'playing'
      && Math.abs((await W(p, () => MFB.debug.world.paddle.x)) - xh) < 0.05);
    await p.mouse.down(); await p.mouse.up();   // back on
    // click on the field serves
    await p.mouse.click(640, 400); await sleep(50);
    check('click on the field serves', (await phase(p)) === 'play');
    // keyboard
    await W(p, () => MFB.debug.startGame()); await holdServe(p); await sleep(100);
    for (const [key, dir] of [['ArrowLeft', -1], ['ArrowRight', 1], ['KeyA', -1], ['KeyD', 1]]) {
      await W(p, () => { const w = MFB.debug.world; w.paddle.x = w.paddle.px = 8; w.paddle.vx = 0; });
      const x0 = await W(p, () => MFB.debug.world.paddle.x);
      await p.keyboard.down(key); await sleep(250); await p.keyboard.up(key);
      const x1 = await W(p, () => MFB.debug.world.paddle.x);
      await sleep(350);
      const x2 = await W(p, () => MFB.debug.world.paddle.x), vx = await W(p, () => MFB.debug.world.paddle.vx);
      await sleep(250);
      const x3 = await W(p, () => MFB.debug.world.paddle.x);
      check(key + ' moves Mochi ' + (dir < 0 ? 'left' : 'right'), (x1 - x0) * dir > 1, x0.toFixed(2) + ' → ' + x1.toFixed(2));
      // KEY_RESP 22/s: from 20 u/s the cap glides ≈ 0.9 u, then stands still
      check(key + ' stops on keyup (short glide, then still)', Math.abs(x2 - x1) < 1.1 && Math.abs(x3 - x2) < 0.02 && Math.abs(vx) < 0.3, 'glide ' + (x2 - x1).toFixed(2) + ' drift ' + (x3 - x2).toFixed(3) + ' vx ' + vx.toFixed(2));
    }
    // both keys held = stand still; one released = move
    await p.keyboard.down('ArrowLeft'); await p.keyboard.down('ArrowRight');
    const xb0 = await W(p, () => MFB.debug.world.paddle.x); await sleep(250);
    const xb1 = await W(p, () => MFB.debug.world.paddle.x);
    await p.keyboard.up('ArrowLeft'); await sleep(200);
    const xb2 = await W(p, () => MFB.debug.world.paddle.x);
    await p.keyboard.up('ArrowRight');
    check('← and → held together cancel out; releasing ← moves right', Math.abs(xb1 - xb0) < 0.2 && xb2 - xb1 > 0.5);
    await p.keyboard.press('Space');
    check('Space serves', (await phase(p)) === 'play');
    await W(p, () => MFB.debug.startGame()); await holdServe(p);
    await p.keyboard.press('Enter');
    check('Enter serves', (await phase(p)) === 'play');
    // keys released while paused don't stick
    await W(p, () => MFB.debug.startGame()); await holdServe(p);
    await p.keyboard.down('ArrowLeft'); await p.keyboard.press('Escape'); await p.keyboard.up('ArrowLeft'); await p.keyboard.press('Escape');
    const xs0 = await W(p, () => MFB.debug.world.paddle.x); await sleep(300);
    check('a key released during pause does not keep Mochi walking', Math.abs((await W(p, () => MFB.debug.world.paddle.x)) - xs0) < 0.15);
    // auto-serve after 3 s
    await W(p, () => MFB.debug.startGame());
    await p.waitForFunction(() => MFB.debug.world.phase === 'play', null, { timeout: 8000 });
    const tServe = await W(p, () => { const e = window._ev.filter(e => e.type === 'serve').pop(); return MFB.debug.world.time; });
    check('auto-serve after ~3 s without input', tServe >= 2.95 && tServe < 3.4, 'served at t=' + tServe.toFixed(2));
    await close(o, 'input desktop');
  });

  await section('input: touch', async () => {
    const o = await open('mute=1&seed=3&autostart=1&diff=easy', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = o.p;
    check('touch device detected (pointer:coarse)', await W(p, () => MFB.Game.isTouch));
    await holdServe(p);
    const cdp = await o.ctx.newCDPSession(p);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    // a slow slide: moves, no serve
    await touch('touchStart', 150, 250);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', 150 + i * 45, 250); await sleep(35); }
    await sleep(100);
    await touch('touchEnd');
    await sleep(400);
    const want = await W(p, () => MFB.Game.renderer.toWorldX(MFB.Game.renderer.toLogical(690, 250)[0]));
    const x = await W(p, () => MFB.debug.world.paddle.x);
    check('a finger slide moves Mochi to the finger', Math.abs(x - want) < 0.4, 'x=' + x.toFixed(2) + ' want ' + want.toFixed(2));
    check('a slide does not serve', (await phase(p)) === 'serve');
    // a short tap serves
    await p.touchscreen.tap(300, 250); await sleep(100);
    check('a tap serves', (await phase(p)) === 'play');
    // HUD buttons via touch
    await W(p, () => MFB.debug.startGame()); await holdServe(p); await sleep(100);
    const xb = await W(p, () => MFB.debug.world.paddle.x);
    const pb = await p.locator('#btnPause').boundingBox();
    await p.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(150);
    check('tapping HUD Pause pauses without serving or steering', (await mode(p)) === 'paused' && (await phase(p)) === 'serve' && Math.abs((await W(p, () => MFB.debug.world.paddle.x)) - xb) < 0.05);
    const rb = await p.locator('#btnResume').boundingBox();
    await p.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2); await sleep(700);
    check('tapping Resume resumes and its ghost click does not serve', (await mode(p)) === 'playing' && (await phase(p)) === 'serve');
    const mb = await p.locator('#btnMuteHud').boundingBox();
    await p.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(150);
    check('tapping HUD Mute does not serve or steer', (await phase(p)) === 'serve' && Math.abs((await W(p, () => MFB.debug.world.paddle.x)) - xb) < 0.05);
    // second finger taps Pause while the first steers (iOS sends no click for the 2nd finger)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }] });
    await sleep(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 2 }] });
    await sleep(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 200, y: 250, id: 1 }] });
    await sleep(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    check('a second finger can tap Pause while steering', (await mode(p)) === 'paused');
    await p.screenshot({ path: OUT + '/functional_touch.png' });
    await close(o, 'input touch');
  });

  // ------------------------------------------------------------------ rules
  await section('rules', async () => {
    const o = await open('mute=1&seed=7&autostart=1&diff=easy'), p = o.p;
    // block scoring
    const r1 = await W(p, () => {
      const w = MFB.debug.world; w.serve(); w.boss.nextThrow = 1e9;
      const br = w.bricks.filter(b => b.alive && b.kind === 'bud').sort((a, b) => a.y - b.y)[0];
      const s0 = w.score, n0 = w.stats.bricks;
      const b = w.ball; b.x = br.x; b.y = br.y - br.h / 2 - 0.5; b.px = b.x; b.py = b.y; b.vx = 0; b.vy = b.speed;
      return { id: br.id, s0, n0 };
    });
    await sleep(300);
    const r1b = await W(p, id => { const w = MFB.debug.world, br = w.bricks.find(b => b.id === id); return { alive: br.alive, s: w.score, n: w.stats.bricks }; }, r1.id);
    check('a 1-hit block breaks and scores +10', !r1b.alive && r1b.s - r1.s0 === 10 && r1b.n === r1.n0 + 1, JSON.stringify([r1, r1b]));
    // tough block: two hits, +10 each
    const t = await W(p, () => {
      const w = MFB.debug.world;
      const tb = w.bricks.find(b => b.alive && b.kind === 'tough');
      w.bricks.forEach(b => { if (b !== tb && b.y < tb.y && Math.abs(b.x - tb.x) < 1.5) b.alive = false; });
      return { id: tb.id, hp: tb.hp };
    });
    const hitFromBelow = id => W(p, id => {
      const w = MFB.debug.world, br = w.bricks.find(b => b.id === id), b = w.ball;
      if (!b) return null;
      const s0 = w.score; w.combo = 0; b.x = br.x; b.y = br.y - br.h / 2 - 0.5; b.px = b.x; b.py = b.y; b.vx = 0; b.vy = b.speed; return s0;
    }, id);
    const s0 = await hitFromBelow(t.id); await sleep(300);
    const t1 = await W(p, id => { const w = MFB.debug.world, br = w.bricks.find(b => b.id === id); return { alive: br.alive, hp: br.hp, s: w.score }; }, t.id);
    check('a tough block survives the 1st hit (+10)', t.hp === 2 && t1.alive && t1.hp === 1 && t1.s - s0 === 10, JSON.stringify([t, t1, s0]));
    const s1 = await hitFromBelow(t.id); await sleep(300);
    const t2 = await W(p, id => { const w = MFB.debug.world, br = w.bricks.find(b => b.id === id); return { alive: br.alive, s: w.score }; }, t.id);
    check('a tough block breaks on the 2nd hit (+10)', !t2.alive && t2.s - s1 === 10, JSON.stringify([t2, s1]));
    // star block drops a star; catching it scores +50 and counts
    const sb = await W(p, () => { const w = MFB.debug.world; const k = w.bricks.find(b => b.alive && b.kind === 'star'); w.bricks.forEach(b => { if (b !== k && b.y < k.y && Math.abs(b.x - k.x) < 1.5) b.alive = false; }); return { id: k.id, n: w.stars.length }; });
    await hitFromBelow(sb.id); await sleep(250);
    const st = await W(p, () => MFB.debug.world.stars.length);
    check('a star block drops a falling star', st > sb.n, 'stars ' + sb.n + ' → ' + st);
    const c0 = await W(p, () => { const w = MFB.debug.world, s = w.stars[w.stars.length - 1]; const r = { score: w.score, count: w.starCount }; if (w.ball) { w.ball.x = 15; w.ball.y = 3; } s.x = s.px = w.paddle.x; s.y = s.py = 1.5; s.vy = -2; return r; });
    await sleep(250);
    const c1 = await W(p, () => ({ score: MFB.debug.world.score, count: MFB.debug.world.starCount }));
    check('catching a star scores +50 and counts it', c1.count === c0.count + 1 && c1.score - c0.score >= 50, JSON.stringify([c0, c1]));
    // hearts lost when the ball falls (no vine)
    await W(p, () => MFB.debug.startGame());
    const h0 = await W(p, () => MFB.debug.world.hearts);
    await dropBall(p); await sleep(400);
    const lost = await W(p, () => ({ hearts: MFB.debug.world.hearts, phase: MFB.debug.world.phase, ev: window._ev.filter(e => e.type === 'heartLost').length }));
    check('ball past Mochi costs a heart and goes back to serve', lost.hearts === h0 - 1 && lost.phase === 'serve' && lost.ev >= 1, JSON.stringify(lost));
    // Easy vine
    await W(p, () => MFB.debug.startGame());
    const n0 = await W(p, () => ({ saves: MFB.debug.world.net.saves, hearts: MFB.debug.world.hearts }));
    const NS = await W(p, () => MFB.World.CONFIG.DIFF.easy.netSaves);
    check('Easy starts with ' + NS + ' vine saves (DIFF.easy.netSaves)', n0.saves === NS && NS >= 2);
    await dropBall(p, true); await sleep(400);
    const n1 = await W(p, () => ({ saves: MFB.debug.world.net.saves, hearts: MFB.debug.world.hearts, vy: MFB.debug.world.ball && MFB.debug.world.ball.vy, phase: MFB.debug.world.phase }));
    check('the Easy vine saves the ball (no heart lost, ball goes up)', n1.saves === NS - 1 && n1.hearts === n0.hearts && n1.phase === 'play', JSON.stringify(n1));
    for (let i = 1; i <= NS; i++) { await dropBall(p, true); await sleep(400); }
    const n2 = await W(p, () => ({ saves: MFB.debug.world.net.saves, hearts: MFB.debug.world.hearts }));
    check('after all vine saves the next fall costs a heart', n2.saves === 0 && n2.hearts === n0.hearts - 1, JSON.stringify(n2));
    check('vine saves per difficulty: easy ' + NS + ', normal 1, hard 0', await W(p, n => ['easy', 'normal', 'hard'].map(d => new MFB.World({ seed: 1, difficulty: d }).net.saves).join() === n + ',1,0', NS));
    // pillows: sleepy, never a heart
    await W(p, () => MFB.debug.startGame()); await holdServe(p);
    const speedOf = async () => {
      await W(p, () => { const w = MFB.debug.world; w.paddle.x = w.paddle.px = 3; w.paddle.vx = 0; w.paddle.target = null; });
      const a = await W(p, () => [MFB.debug.world.paddle.x, MFB.debug.world.time]);
      await p.keyboard.down('ArrowRight'); await sleep(300);
      const b = await W(p, () => [MFB.debug.world.paddle.x, MFB.debug.world.time]);
      await p.keyboard.up('ArrowRight');
      return (b[0] - a[0]) / Math.max(1e-3, b[1] - a[1]);
    };
    const vAwake = await speedOf();
    const hp0 = await W(p, () => MFB.debug.world.hearts);
    await W(p, () => { MFB.debug.bossThrow(); const w = MFB.debug.world, pl = w.pillows[w.pillows.length - 1]; pl.x = pl.px = w.paddle.x; pl.y = pl.py = 2.4; pl.vx = 0; pl.vy = -2; });
    await p.waitForFunction(() => window._ev.some(e => e.type === 'pillowHit'), null, { timeout: 5000 });
    const sl = await W(p, () => ({ sleepy: MFB.debug.world.paddle.sleepy, face: MFB.debug.world.paddle.face, hearts: MFB.debug.world.hearts }));
    check('a pillow on Mochi makes him sleepy (face sleepy)', sl.sleepy > 0 && sl.face === 'sleepy', JSON.stringify(sl));
    const vSleepy = await speedOf();
    check('sleepy Mochi moves slower (≈40 %)', vSleepy < vAwake * 0.6 && vSleepy > 0, 'awake ' + vAwake.toFixed(1) + ' u/s, sleepy ' + vSleepy.toFixed(1));
    check('a pillow hit never costs a heart', sl.hearts === hp0);
    await waitGameTime(p, 2.0);
    check('sleepiness wears off', (await W(p, () => MFB.debug.world.paddle.sleepy)) === 0);
    // a pillow that lands on the ground: no heart either
    await W(p, () => { MFB.debug.bossThrow(); const w = MFB.debug.world, pl = w.pillows[w.pillows.length - 1]; pl.x = pl.px = w.paddle.x > 8 ? 1 : 15; pl.vx = 0; w.paddle.target = w.paddle.x; MFB.debug.setSpeed(3); });
    await p.waitForFunction(() => window._ev.some(e => e.type === 'pillowLand'), null, { timeout: 8000 }).catch(() => {});
    await W(p, () => MFB.debug.setSpeed(1));
    check('a pillow landing on the ground costs no heart', (await W(p, () => MFB.debug.world.hearts)) === hp0 && (await W(p, () => window._ev.some(e => e.type === 'pillowLand'))));
    // season clear → next season (bot finishes the last block)
    await W(p, () => { MFB.debug.startGame(); window._ev = []; MFB.debug.clearBricks(1); MFB.debug.setBot(true, 1); MFB.debug.setSpeed(6); });
    await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 60000 });
    await W(p, () => MFB.debug.setSpeed(1));
    const lc = await W(p, () => { const c = window._ev.find(e => e.type === 'levelClear'), g = window._ev.find(e => e.type === 'heartGain' && e.why === 'season'); const w = MFB.debug.world; return { c, g: !!g, level: w.level, zone: w.zone, left: w.bricksLeft(), phase: w.phase, saves: w.net.saves }; });
    check('clearing the last block → levelClear, then the next season (zone 1)', lc.c && lc.level === 1 && lc.zone === 1 && lc.left > 10, JSON.stringify(lc));
    check('season clear bonus = 100 + 20 per heart, +1 heart', lc.c && lc.c.pts >= 100 && (lc.c.pts - 100) % 20 === 0 && lc.g, JSON.stringify(lc.c));
    check('vine saves refill for the new season', lc.saves === NS);
    await W(p, () => MFB.debug.setBot(false));
    await p.screenshot({ path: OUT + '/functional_season2.png' });
    // game over at 0 hearts
    await W(p, () => { MFB.debug.startGame(); window._ev = []; MFB.debug.world.hearts = 1; });
    await dropBall(p);
    await p.waitForFunction(() => MFB.debug.world.phase !== 'play', null, { timeout: 5000 }).catch(() => {});
    const go = await W(p, () => ({ phase: MFB.debug.world.phase, hearts: MFB.debug.world.hearts, ev: window._ev.some(e => e.type === 'gameOver') }));
    check('losing the last heart → phase over + gameOver event', go.phase === 'over' && go.hearts === 0 && go.ev, JSON.stringify(go));
    await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 5000 });
    check('…then the game over screen', (await visibleScreen(p)) === 'scrOver');
    await close(o, 'rules');
  });

  // ------------------------------------------------------------------ best score
  await section('best score per difficulty, bots never save', async () => {
    let o = await open('mute=1&seed=7'), p = o.p;
    await p.click('#btnPlay');
    await W(p, () => { MFB.debug.world.score = 123; });
    await forceGameOver(p);
    const b1 = await W(p, () => ({ ls: localStorage.getItem('mfb:best_easy'), shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
    check('a human run saves best_easy (shown with NEW!)', b1.ls === '123' && b1.shown === '123' && b1.nb, JSON.stringify(b1));
    await sleep(800); await p.click('#btnOverMenu');
    check('title shows the Easy best', (await p.textContent('#bestTitle')) === '123');
    await p.click('#btnSettings'); await p.click('#setDifficulty [data-v=normal]'); await p.click('#scrSettings .btn-back');
    check('title shows the Normal best (0) after switching difficulty', (await p.textContent('#bestTitle')) === '0');
    await p.click('#btnPlay');
    check('the run uses the chosen difficulty (normal: cap 2.5 u)', (await W(p, () => MFB.debug.world.difficulty)) === 'normal' && (await W(p, () => MFB.debug.world.paddle.w)) === 2.5);
    await W(p, () => { MFB.debug.world.score = 50; });
    await forceGameOver(p);
    check('best_normal saved separately; best_easy untouched', await W(p, () => localStorage.getItem('mfb:best_normal') === '50' && localStorage.getItem('mfb:best_easy') === '123'));
    // a lower score does not overwrite
    await sleep(800); await p.click('#btnAgain');
    await W(p, () => { MFB.debug.world.score = 20; });
    await forceGameOver(p);
    check('a lower score does not overwrite the best (no NEW!)', await W(p, () => localStorage.getItem('mfb:best_normal') === '50' && document.getElementById('newBest').classList.contains('hidden')));
    // a bot run never overwrites
    await sleep(800); await p.click('#btnAgain');
    await W(p, () => { MFB.debug.setBot(true, 1); MFB.debug.world.score = 99999; });
    await forceGameOver(p);
    check('a bot run never overwrites the best', await W(p, () => localStorage.getItem('mfb:best_normal') === '50' && document.getElementById('overBest').textContent === '50'));
    await W(p, () => MFB.debug.setBot(false));
    // changing difficulty mid-run (Pause → Settings) keeps the run's difficulty for the best score
    await sleep(800); await p.click('#btnAgain');
    await p.keyboard.press('Escape'); await p.click('#btnPauseSettings'); await p.click('#setDifficulty [data-v=hard]');
    await p.click('#scrSettings .btn-back'); await p.click('#btnResume');
    check('difficulty change mid-run does not change the current run', (await W(p, () => MFB.debug.world.difficulty)) === 'normal');
    await W(p, () => { MFB.debug.world.score = 77; });
    await forceGameOver(p);
    check('…and its best is saved under the run difficulty (normal), not the new one', await W(p, () => localStorage.getItem('mfb:best_normal') === '77' && !localStorage.getItem('mfb:best_hard')));
    await sleep(800); await p.click('#btnOverMenu');
    await p.click('#btnSettings'); await p.click('#setDifficulty [data-v=normal]'); await p.click('#scrSettings .btn-back');
    // ?diff= URL flag is never saved as the setting
    await p.goto(GAME + '?mute=1&diff=hard'); await booted(p);
    await p.click('#btnSettings'); await p.click('#setSfx + .tog'); await p.click('#setSfx + .tog');
    check('?diff=hard is not saved into settings', await W(p, () => JSON.parse(localStorage.getItem('mfb:settings')).difficulty === 'normal'));
    // reset best: two taps
    await p.goto(GAME + '?mute=1'); await booted(p);
    await p.click('#btnSettings');
    await p.click('#btnResetBest');
    const armed = await W(p, () => ({ t: document.getElementById('btnResetBest').textContent, e: localStorage.getItem('mfb:best_easy') }));
    check('Reset best: first tap only arms ("Sure?"), nothing deleted', armed.t === 'Sure?' && armed.e === '123', JSON.stringify(armed));
    await sleep(3200);
    check('Reset best disarms itself after 3 s', (await p.textContent('#btnResetBest')) === 'Reset');
    await p.click('#btnResetBest'); await p.click('#btnResetBest');
    check('Reset best: second tap clears every difficulty', await W(p, () => !localStorage.getItem('mfb:best_easy') && !localStorage.getItem('mfb:best_normal')));
    await p.click('#scrSettings .btn-back');
    check('title best shows 0 after reset', (await p.textContent('#bestTitle')) === '0');
    await close(o, 'best score');
  });

  // ------------------------------------------------------------------ pause / blur / visibility
  await section('pause, resume, auto-pause', async () => {
    const o = await open('mute=1&seed=7&autostart=1'), p = o.p;
    await holdServe(p); await p.keyboard.press('Space');
    await p.keyboard.press('Escape');
    const t0 = await W(p, () => MFB.debug.world.time); await sleep(500);
    const t1 = await W(p, () => MFB.debug.world.time);
    check('the world is frozen while paused', t1 === t0);
    const bp = await W(p, () => [MFB.debug.world.ball.x, MFB.debug.world.ball.y]);
    await p.keyboard.press('Escape'); await sleep(300);
    const t2 = await W(p, () => MFB.debug.world.time);
    check('resume continues the same run (time advances, ball kept)', t2 > t1 && t2 - t1 < 0.6 && (await phase(p)) === 'play', (t2 - t1).toFixed(2));
    check('resume has no time jump (paused time not simulated)', t2 - t1 < 0.6);
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(50);
    check('window blur auto-pauses', (await mode(p)) === 'paused' && (await visibleScreen(p)) === 'scrPause');
    await p.keyboard.press('Escape');
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(50);
    check('page hidden auto-pauses', (await mode(p)) === 'paused');
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(100);
    check('coming back stays paused (waits for the child)', (await mode(p)) === 'paused');
    await p.keyboard.press('Escape');
    // blur during the game-over fall must not pause
    await W(p, () => { MFB.debug.world.hearts = 1; });
    await dropBall(p);
    await p.waitForFunction(() => MFB.debug.world.phase === 'over', null, { timeout: 5000 });
    await W(p, () => window.dispatchEvent(new Event('blur')));
    check('blur after the last heart is lost (game over pending) does not block game over', await p.waitForFunction(() => MFB.debug.mode === 'over', null, { timeout: 6000 }).then(() => true, () => false));
    await W(p, () => window.dispatchEvent(new Event('blur')));
    check('blur on game over keeps the game over screen', (await mode(p)) === 'over');
    await close(o, 'pause');
  });

  // ------------------------------------------------------------------ settings persistence
  await section('settings persistence', async () => {
    const o = await open('seed=7'), p = o.p;   // no mute flag here
    const def = await W(p, () => ({ ...MFB.Game.settings }));
    check('defaults: sound on, music on, Easy', def.sfx && def.music && !def.muted && def.difficulty === 'easy', JSON.stringify(def));
    await p.click('#btnSettings');
    await p.click('#setSfx + .tog'); await p.click('#setMusic + .tog'); await p.click('#setDifficulty [data-v=hard]');
    check('settings UI changes apply', await W(p, () => !MFB.Game.settings.sfx && !MFB.Game.settings.music && MFB.Game.settings.difficulty === 'hard' && MFB.Audio.sfxOn === false && MFB.Audio.musicOn === false));
    await p.reload(); await booted(p);
    await p.click('#btnSettings');
    const r = await W(p, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, diff: document.querySelector('#setDifficulty .on').dataset.v, audio: [MFB.Audio.sfxOn, MFB.Audio.musicOn] }));
    check('sound, music, difficulty persist across reload (UI + audio)', !r.sfx && !r.music && r.diff === 'hard' && r.audio.join() === 'false,false', JSON.stringify(r));
    await p.click('#scrSettings .btn-back'); await p.click('#btnPlay');
    check('a reload run uses the saved difficulty', (await W(p, () => MFB.debug.world.difficulty)) === 'hard');
    // M mutes and persists; ?mute=1 is never saved
    await p.keyboard.press('KeyM');
    check('M mutes and saves muted', await W(p, () => JSON.parse(localStorage.getItem('mfb:settings')).muted === true && MFB.Audio.muted));
    await p.keyboard.press('KeyM');
    check('M again unmutes and saves', await W(p, () => JSON.parse(localStorage.getItem('mfb:settings')).muted === false && !MFB.Audio.muted));
    await p.goto(GAME + '?mute=1&seed=7'); await booted(p);
    check('?mute=1 mutes audio', await W(p, () => MFB.Audio.muted === true));
    await p.click('#btnSettings'); await p.click('#setSfx + .tog'); await p.click('#setSfx + .tog'); await p.click('#scrSettings .btn-back');
    check('?mute=1 is never written into settings', await W(p, () => JSON.parse(localStorage.getItem('mfb:settings')).muted === false));
    await p.keyboard.press('KeyM');
    check('M under ?mute=1 unmutes for this session without saving muted', await W(p, () => !MFB.Audio.muted && JSON.parse(localStorage.getItem('mfb:settings')).muted === false));
    await p.goto(GAME + '?seed=7'); await booted(p);
    check('after a ?mute=1 visit a normal visit is not muted', await W(p, () => MFB.Audio.muted === false));
    // a corrupt settings value falls back to defaults
    await W(p, () => localStorage.setItem('mfb:settings', '{not json'));
    await p.reload(); await booted(p);
    check('corrupt saved settings fall back to defaults without errors', await W(p, () => MFB.Game.settings.difficulty === 'easy' && MFB.Game.settings.sfx === true));
    await W(p, () => localStorage.setItem('mfb:settings', JSON.stringify({ difficulty: 'nightmare', sfx: false })));
    await p.reload(); await booted(p);
    check('an unknown saved difficulty falls back to Easy', await W(p, () => MFB.Game.settings.difficulty === 'easy'));
    await close(o, 'settings');
  });

  // ------------------------------------------------------------------ custom pictures
  await section('Change Pictures', async () => {
    const o = await open('mute=1&seed=7'), p = o.p;
    const png = await makeImage(p, 300, 300, 'image/png', 'cutout');
    const jpg = await makeImage(p, 640, 480, 'image/jpeg', 'photo');
    const huge = await makeImage(p, 4000, 3000, 'image/jpeg', 'green');
    const huge2 = await makeImage(p, 4000, 3000, 'image/jpeg', 'photo');
    await p.click('#btnCustomize');
    let msg = await pickFile(p, SLOT.hero, { name: 'cutout.png', mimeType: 'image/png', buffer: png });
    const hero = await W(p, () => ({ has: MFB.Assets.hasCustom('hero'), shape: localStorage.getItem('mfb:shape_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent, thumb: (document.querySelectorAll('#slotGrid .slot')[0].querySelector('.prev img') || {}).src || '' }));
    check('a transparent PNG → hero picture saved, kept whole', /saved/i.test(msg) && hero.has && hero.shape === 'fit', msg + ' ' + JSON.stringify({ ...hero, thumb: hero.thumb.slice(0, 20) }));
    check('the hero card shows "Your picture" and a thumbnail', /Your picture/.test(hero.tag) && hero.thumb.startsWith('data:image'));
    msg = await pickFile(p, SLOT.ball, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpg });
    const ball = await W(p, () => ({ has: MFB.Assets.hasCustom('ball'), shape: localStorage.getItem('mfb:shape_ball'), w: MFB.Assets.custom.ball && MFB.Assets.custom.ball.width, h: MFB.Assets.custom.ball && MFB.Assets.custom.ball.height }));
    check('an opaque JPEG photo → round sticker', ball.has && ball.shape === 'circle' && ball.w === ball.h, JSON.stringify(ball));
    msg = await pickFile(p, SLOT.bg_spring, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
    const bg = await W(p, () => { const i = MFB.Assets.customSrc.bg_spring; return { has: MFB.Assets.hasCustom('bg_spring'), w: i && i.naturalWidth, h: i && i.naturalHeight, len: (localStorage.getItem('mfb:img_bg_spring') || '').length }; });
    check('a huge 4000×3000 background is downscaled to 1600 px and saved', bg.has && bg.w === 1600 && bg.h === 1200 && bg.len < 1.5e6, JSON.stringify(bg));
    msg = await pickFile(p, SLOT.star, { name: 'huge2.jpg', mimeType: 'image/jpeg', buffer: huge2 });
    const star = await W(p, () => { const i = MFB.Assets.customSrc.star; return { has: MFB.Assets.hasCustom('star'), w: i && i.naturalWidth, h: i && i.naturalHeight }; });
    check('a huge 4000×3000 character picture is downscaled to ≤ 512 px', star.has && Math.max(star.w, star.h) === 512, JSON.stringify(star));
    msg = await pickFile(p, SLOT.bg_summer, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
    check('a non-image file → friendly error, nothing saved', /picture file/i.test(msg) && !(await W(p, () => MFB.Assets.hasCustom('bg_summer'))), msg);
    msg = await pickFile(p, SLOT.bg_autumn, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png') });
    check('a broken image file → friendly error, nothing saved', /could not be opened/i.test(msg) && !(await W(p, () => MFB.Assets.hasCustom('bg_autumn'))), msg);
    // shape toggle
    await p.locator('#slotGrid .slot').nth(SLOT.hero).locator('[data-shape=circle]').click();
    check('the Round/Whole toggle changes and saves the shape', await W(p, () => localStorage.getItem('mfb:shape_hero') === 'circle' && MFB.Assets.custom.hero.width === 512));
    await p.locator('#slotGrid .slot').nth(SLOT.hero).locator('[data-shape=fit]').click();
    await p.screenshot({ path: OUT + '/functional_custom.png' });
    // reset one
    await p.locator('#slotGrid .slot').nth(SLOT.ball).locator('[data-act=reset]').click();
    check('Reset one: ball back to the original, storage keys removed', await W(p, () => !MFB.Assets.hasCustom('ball') && !localStorage.getItem('mfb:img_ball') && !localStorage.getItem('mfb:shape_ball')));
    check('Reset one leaves the others', await W(p, () => MFB.Assets.hasCustom('hero') && MFB.Assets.hasCustom('bg_spring') && MFB.Assets.hasCustom('star')));
    await p.locator('#slotGrid .slot').nth(SLOT.ball).locator('[data-act=pick]').evaluate(() => {});
    msg = await pickFile(p, SLOT.ball, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpg });
    await p.click('#scrCustom .btn-back');
    // persist across reload + show in game
    await p.reload(); await booted(p);
    check('pictures persist after reload (hero, ball, star, spring bg)', await W(p, () => ['hero', 'ball', 'star', 'bg_spring'].every(s => MFB.Assets.hasCustom(s))));
    await W(p, () => { window._drawn = new Set(); const R = MFB.Game.renderer, ds = R.drawSpr; R.drawSpr = function (g, key) { window._drawn.add(key); return ds.apply(this, arguments); }; });
    await p.click('#btnPlay'); await holdServe(p);
    await sleep(500);
    const drawn = await W(p, () => [...window._drawn]);
    check('the custom hero is drawn in game', drawn.includes('custom:hero') && !drawn.some(k => /^mochi_/.test(k)), drawn.filter(k => /hero|mochi/.test(k)).join());
    check('the custom ball is drawn in game', drawn.includes('custom:ball'), drawn.filter(k => /ball/.test(k)).join());
    check('the custom star is drawn (HUD star counter)', drawn.includes('custom:star'));
    // background pixel: our green photo with a pale veil
    const px = await W(p, () => {
      const c = document.getElementById('game'), g = c.getContext('2d');
      const pts = [[0.03, 0.5], [0.97, 0.5], [0.5, 0.92], [0.03, 0.15]];
      return pts.map(([fx, fy]) => Array.from(g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data));
    });
    const greenish = px.filter(([r, g, b]) => g > r + 40 && g > b + 40).length;
    check('the custom Spring background is drawn in game', greenish >= 2, JSON.stringify(px));
    await p.screenshot({ path: OUT + '/functional_custom_ingame.png' });
    // custom pictures on the title demo too
    await p.keyboard.press('Escape'); await p.click('#btnPauseMenu');
    // reset all
    await p.click('#btnCustomize'); await p.click('#btnResetAll');
    check('Reset all clears every picture', await W(p, () => MFB.Assets.SLOTS.every(s => !MFB.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => /^mfb:(img|shape)_/.test(k))));
    await p.click('#scrCustom .btn-back');
    await p.reload(); await booted(p);
    check('after Reset all + reload the originals are back', await W(p, () => MFB.Assets.SLOTS.every(s => !MFB.Assets.hasCustom(s.id))));
    // storage full → friendly error, nothing half-saved
    await p.click('#btnCustomize');
    await W(p, () => { const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/img_/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return si.call(this, k, v); }; });
    msg = await pickFile(p, SLOT.hero, { name: 'cutout.png', mimeType: 'image/png', buffer: png });
    check('storage full → friendly "not enough room" message, nothing kept', /room/i.test(msg) && !(await W(p, () => MFB.Assets.hasCustom('hero'))), msg);
    await close(o, 'custom').catch(() => {});
    o.errs.length = 0;
  });

  // ------------------------------------------------------------------ layout
  const SIZES = [
    { name: '1280x720', viewport: { width: 1280, height: 720 } },
    { name: '1920x1080', viewport: { width: 1920, height: 1080 } },
    { name: '1024x768 iPad', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '844x390 phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
    { name: '390x844 portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
    { name: '2732x2048 dpr2', viewport: { width: 2732, height: 2048 }, deviceScaleFactor: 2 }
  ];
  for (const S of SIZES) {
    await section('layout ' + S.name, async () => {
      const opts = Object.assign({}, S); delete opts.name;
      const o = await open('mute=1&seed=7', opts), p = o.p;
      const touch = !!S.hasTouch;
      const audit = () => W(p, touch => {
        document.getAnimations().forEach(a => { try { if (a.effect && a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (_) {} });   // the menu 'pop' scale-in
        const vw = innerWidth, vh = innerHeight, id = MFB.UI.current, scr = document.getElementById(id);
        const box = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
        const r = box.getBoundingClientRect();
        const bad = [];
        if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('panel outside viewport ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        if (box.scrollHeight > box.clientHeight + 2) bad.push('panel scrolls ' + box.scrollHeight + '>' + box.clientHeight);
        if (document.documentElement.scrollWidth > vw + 1) bad.push('page scrolls sideways');
        const small = [];
        scr.querySelectorAll('button').forEach(b => {
          if (!b.offsetParent || getComputedStyle(b).visibility === 'hidden') return;
          const q = b.getBoundingClientRect();
          if (q.right > vw + 1 || q.bottom > vh + 1 || q.left < -1 || q.top < -1) bad.push('button off-screen: ' + b.textContent.trim().slice(0, 18));
          if (touch && (q.height < 44 - 0.5 || q.width < 44 - 0.5)) small.push((b.id || b.dataset.v || b.dataset.act || b.dataset.shape || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
        });
        return { bad, small };
      }, touch);
      const screens = ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom'];
      for (const id of screens) {
        await W(p, id => MFB.UI.open(id, 'scrTitle'), id); await sleep(150);
        const a = await audit();
        check(S.name + ' ' + id + ' fits (no overflow / off-screen)', a.bad.length === 0, a.bad.join('; '));
        if (touch) check(S.name + ' ' + id + ' buttons ≥ 44 px', a.small.length === 0, [...new Set(a.small)].slice(0, 8).join(', '));
        if (id !== 'scrTitle') await p.screenshot({ path: OUT + '/functional_' + S.name.replace(/\W+/g, '_') + '_' + id + '.png' });
      }
      await W(p, () => MFB.UI.show('scrTitle'));
      await W(p, () => MFB.debug.startGame()); await holdServe(p); await sleep(200);
      if (S.name.includes('portrait')) {
        check('portrait phone: "turn sideways" card shows in game', !(await isHidden(p, 'rotate')));
        const t0 = await W(p, () => MFB.debug.world.time); await sleep(300);
        check('portrait phone: game waits behind the card', (await W(p, () => MFB.debug.world.time)) === t0);
        await p.setViewportSize({ width: 844, height: 390 }); await sleep(500);
        const tl = await W(p, () => MFB.debug.world.time); await sleep(300);
        check('portrait phone turned sideways: the card hides and the game runs', (await isHidden(p, 'rotate')) && (await W(p, () => MFB.debug.world.time)) > tl);
        await p.setViewportSize({ width: 390, height: 844 }); await sleep(500);
        check('turned upright again: the card is back', !(await isHidden(p, 'rotate')));
        const rb = await p.locator('#btnRotateOk').boundingBox();
        check('portrait phone: "Play upright anyway" ≥ 44 px', rb && rb.height >= 44 - 0.5, rb && Math.round(rb.width) + 'x' + Math.round(rb.height));
        await p.screenshot({ path: OUT + '/functional_portrait_rotate.png' });
        await p.locator('#btnRotateOk').tap(); await sleep(300);
        check('portrait phone: "Play upright anyway" dismisses the card and the game runs', (await isHidden(p, 'rotate')) && (await W(p, () => MFB.debug.world.time)) > t0 && (await phase(p)) === 'serve');
      } else {
        check(S.name + ' no rotate card in landscape', await isHidden(p, 'rotate'));
      }
      const cv = await W(p, () => { const r = document.getElementById('game').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, cw: document.getElementById('game').width, ch: document.getElementById('game').height }; });
      check(S.name + ' canvas fills the screen', cv.l <= 1 && cv.t <= 1 && cv.r >= cv.vw - 1 && cv.b >= cv.vh - 1 && cv.r <= cv.vw + 1 && cv.b <= cv.vh + 1, JSON.stringify(cv));
      const hud = await W(p, touch => ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height, r.right <= innerWidth && r.top >= 0]; }));
      check(S.name + ' HUD buttons on screen' + (touch ? ' and ≥ 44 px' : ''), hud.every(([w, h, on]) => on && (!touch || (w >= 43.5 && h >= 43.5))), JSON.stringify(hud));
      // pointer mapping: the field edges map to x≈0 and x≈16
      const map = await W(p, () => { const R = MFB.Game.renderer, r = R.canvas.getBoundingClientRect(); const toX = cx => R.toWorldX(R.toLogical(cx, r.top + r.height / 2)[0]); return [toX(r.left + R.sx(0) * r.width / R.VW), toX(r.left + R.sx(16) * r.width / R.VW)]; });
      check(S.name + ' pointer → world mapping hits the walls', Math.abs(map[0]) < 0.05 && Math.abs(map[1] - 16) < 0.05, JSON.stringify(map));
      await W(p, () => MFB.Game.pause()); await sleep(100);
      if (!(await isHidden(p, 'rotate'))) await W(p, () => { MFB.Game._rotOk = true; MFB.Game.syncRotate(); });
      let a = await audit();
      check(S.name + ' scrPause fits', a.bad.length === 0, a.bad.join('; '));
      if (touch) check(S.name + ' scrPause buttons ≥ 44 px', a.small.length === 0, a.small.join(', '));
      await W(p, () => MFB.Game.resume());
      await W(p, () => { MFB.debug.world.score = 12345; MFB.debug.world.level = 5; });
      await forceGameOver(p); await sleep(300);
      a = await audit();
      check(S.name + ' scrOver fits', a.bad.length === 0, a.bad.join('; '));
      if (touch) check(S.name + ' scrOver buttons ≥ 44 px', a.small.length === 0, a.small.join(', '));
      await p.screenshot({ path: OUT + '/functional_' + S.name.replace(/\W+/g, '_') + '_over.png' });
      await close(o, 'layout ' + S.name);
    });
  }

  // ------------------------------------------------------------------ long bot soak
  await section('long bot run at speed 16', async () => {
    const o = await open('mute=1&seed=5&bot=1&skill=0.8&autostart=1&autorestart=1&speed=16'), p = o.p;
    const realMs = QUICK ? 8000 : 30000;
    let maxP = 0, maxFx = 0, bad = [], maxSpeed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < realMs) {
      await sleep(250);
      const s = await W(p, () => MFB.debug.getState());
      maxP = Math.max(maxP, s.particles); maxFx = Math.max(maxFx, s.fx);
      if (s.ball) {
        maxSpeed = Math.max(maxSpeed, s.ball.speed);
        if (!isFinite(s.ball.x) || s.ball.x < -0.5 || s.ball.x > 16.5 || s.ball.y > 9 || s.ball.y < -1.5) bad.push('ball ' + s.ball.x.toFixed(2) + ',' + s.ball.y.toFixed(2));
      }
      if (!isFinite(s.score) || s.score < 0 || s.hearts < 0 || s.hearts > 5) bad.push('score/hearts ' + s.score + '/' + s.hearts);
    }
    const r = await W(p, () => { const st = MFB.debug.stats, w = MFB.debug.world; return { games: st.games, scores: st.scores, times: st.times, levels: st.levels, bricks: st.bricks, stars: st.stars, runT: MFB.Game.runT, level: w.level, wb: w.stats.bricks, ws: w.score, best: Object.keys(localStorage).filter(k => /best_/.test(k)) }; });
    const gameTime = r.times.reduce((a, b) => a + b, 0) + (r.runT || 0);
    console.log('   soak: ' + gameTime.toFixed(0) + ' s game time, games ' + r.games + ', scores ' + JSON.stringify(r.scores) + ', levels ' + JSON.stringify(r.levels) + ', current level ' + r.level + ' score ' + r.ws + ', max particles ' + maxP + ', max fx ' + maxFx + ', max ball speed ' + maxSpeed.toFixed(2));
    check('soak covered ≥ ' + (QUICK ? 60 : 180) + ' s of game time', gameTime >= (QUICK ? 60 : 180), gameTime.toFixed(0) + ' s');
    check('soak: weather particles ≤ 90', maxP <= 90, maxP);
    check('soak: juice fx bounded (≤ 260)', maxFx <= 260, maxFx);
    check('soak: ball speed ≤ 16 u/s', maxSpeed <= 16.001, maxSpeed);
    check('soak: ball / score / hearts always sane', bad.length === 0, bad.slice(0, 3).join('; '));
    check('soak: the bot breaks blocks and progresses (bricks > 100 or a season cleared)', (r.bricks + r.wb) > 100 || r.level > 0 || r.levels.some(l => l > 0), JSON.stringify(r));
    check('soak: bot runs never saved a best score', r.best.length === 0, r.best.join());
    await p.screenshot({ path: OUT + '/functional_soak.png' });
    await close(o, 'soak');
  });

  // ------------------------------------------------------------------ Windows wrapper (static review)
  await section('app/main.go wrapper review', async () => {
    const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
    const js = ['storage.js', 'main.js'].map(f => fs.readFileSync(path.join(ROOT, 'game/js', f), 'utf8')).join('\n');
    const bound = [...go.matchAll(/w\.Bind\("(\w+)"/g)].map(m => m[1]).sort();
    const used = [...new Set([...js.matchAll(/window\.(mf\w+)/g)].map(m => m[1]))].sort();
    check('Go binds every bridge the game calls (' + used.join(', ') + ')', used.every(n => bound.includes(n)), 'bound ' + bound.join() + ' used ' + used.join());
    check('bridge set is exactly mfStoreAll/mfStoreSet/mfStoreDel/mfFullscreen/mfQuit', bound.join() === 'mfFullscreen,mfQuit,mfStoreAll,mfStoreDel,mfStoreSet', bound.join());
    check('server listens on loopback only', /net\.Listen\("tcp", "127\.0\.0\.1:"/.test(go) && !/0\.0\.0\.0/.test(go));
    check('port fallback: fixed ports, then any free port', /"47821"/.test(go) && /127\.0\.0\.1:0/.test(go));
    check('storage keys are validated before touching the disk (Set/Del)', /func \(s \*store\) Set[\s\S]{0,80}keyRe\.MatchString/.test(go) && /func \(s \*store\) Del[\s\S]{0,80}keyRe\.MatchString/.test(go));
    const keyRe = /^[a-zA-Z0-9_\-]{1,64}$/;
    const keys = [...allKeys];
    check('every storage key the game wrote passes the Go key rule (' + keys.length + ' keys)', keys.length > 0 && keys.every(k => keyRe.test(k)), keys.filter(k => !keyRe.test(k)).join());
    check('app mode is detected from ?app=1 or the bound bridge', /params\.get\('app'\) === '1' \|\| typeof window\.mfStoreSet === 'function'/.test(js));
  });

  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fail.length) + ' passed, ' + fail.length + ' failed (of ' + results.length + ')');
  if (fail.length) { console.log('FAILED:\n' + fail.map(f => ' - ' + f.name + (f.detail != null ? ' — ' + f.detail : '')).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
