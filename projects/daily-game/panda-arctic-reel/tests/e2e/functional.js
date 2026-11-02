// Functional QA suite for Bao's Arctic Reel.
// Run: NODE_PATH=$(npm root -g) node tests/e2e/functional.js
// Prints PASS/FAIL per check, saves screenshots to tests/out/func_*.png, exits 1 on any FAIL.
// Sections: boot · menus (mouse / keyboard / touch) · input · rules · pause & mute · settings persistence ·
// Change Pictures · layout at 7 sizes · long bot run at ?speed=16.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const LONG_RUN_S = +(process.env.LONG_RUN_S || 75);   // real seconds of the ×16 bot run (75 s ≈ 20 simulated minutes)

let nPass = 0, nFail = 0;
const fails = [];
function check(name, ok, info) {
  if (ok) { nPass++; console.log('PASS  ' + name + (info !== undefined ? '  (' + fmt(info) + ')' : '')); }
  else { nFail++; fails.push(name); console.log('FAIL  ' + name + (info !== undefined ? '  (' + fmt(info) + ')' : '')); }
  return ok;
}
function fmt(v) { return typeof v === 'string' ? v : JSON.stringify(v); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function open(opts, query, ctxIn) {
  const ctx = ctxIn || await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(GAME + (query || '?mute=1'));
  await page.waitForFunction(() => window.PR && PR.debug && PR.Game && PR.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {   // count real game starts (UI handlers call game.startGame())
    const G = PR.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; return o.apply(this, arguments); };
  });
  return { ctx, page, errs };
}
const mode = p => p.evaluate(() => PR.Game.mode);
const ui = p => p.evaluate(() => PR.UI.current);
const waitMode = (p, m, t) => p.waitForFunction(m => PR.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => PR.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
// a calm sea: nothing spawns, nothing swims (input tests must not hook a gem or bump a puffer by accident)
const calm = p => p.evaluate(() => { const w = PR.debug.world; w.items.length = 0; w._gemT = 1e9; w._pufT = 1e9; w._fishT = 1e9; });
const hook = p => p.evaluate(() => { const h = PR.debug.world.hook; return { y: h.y, vy: h.vy, holding: h.holding, drop: h.drop }; });
const casts = p => p.evaluate(() => PR.debug.world.stats.casts);
async function startPlaying(p) {
  await p.evaluate(() => PR.Game.startGame());
  await waitMode(p, 'playing');
  await calm(p);
  await sleep(1600);   // the fresh line drops in through the hole and settles under the ice
  await calm(p);
}
// put the world into a reel with a gem of the given type, hook at the deepest point; game clock frozen (speed 0)
async function setupReel(p, type, deep) {
  return p.evaluate(([type, deep]) => {
    PR.debug.setSpeed(0);
    const w = PR.debug.world, L = w.layout;
    w.items.length = 0; w._gemT = w._pufT = w._fishT = 1e9;
    if (w.phase === 'reel') w._endReel();
    w.phase = 'roam'; w._hangT = 0; w.invuln = 0;
    Object.assign(w.hook, { lost: false, drop: false, holding: false, vy: 0 });
    w.hook.y = w.hook.prevY = deep === false ? L.minHookY + 40 : L.maxHookY;
    const it = w._spawnGem(false, type === 'gold'); it.type = type;
    it.x = it.prevX = w.hook.x; it.by = it.y = it.prevY = w.hook.y; it.vx = 0; it.bobAmp = 0;
    w.update(1 / 120);
    return { phase: w.phase, steps: w.reel.steps, stepPx: w.reel.stepPx };
  }, [type, deep]);
}
// one reel tap with the needle placed on purpose: 'perfect' | 'good' | 'slip'
const reelTap = (p, kind) => p.evaluate(kind => {
  const w = PR.debug.world, r = w.reel;
  r.needle = kind === 'perfect' ? r.zone : kind === 'good' ? r.zone + r.width * 0.4 : (r.zone > 0.5 ? 0 : 1);
  const before = { y: r.targetY, slips: r.slips, score: w.score };
  w.press(); w.release();
  return { before, after: { y: r.targetY, slips: r.slips, score: w.score, phase: w.phase, catching: !!w._catching } };
}, kind);

// ======================================================================= sections
async function sBoot() {
  const { page: p, errs, ctx } = await open();
  check('boot: reaches the title', await mode(p) === 'title');
  check('boot: title screen shown', await ui(p) === 'scrTitle' && await visible(p, '#btnPlay'));
  check('boot: document title', (await p.title()) === "Bao's Arctic Reel");
  await sleep(2500);
  const st = await p.evaluate(() => PR.debug.getState());
  check('boot: title demo (bot) is playing the sea', st && st.time > 1 && st.mode === 'title', { time: st && +st.time.toFixed(2) });
  check('boot: HUD hidden on title', !(await visible(p, '#hud')));
  check('boot: best score line shows a number', /^\d+$/.test(await p.textContent('#bestTitle')));
  await p.screenshot({ path: OUT + '/func_title.png' });
  check('boot: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sMenusMouseKeyboard() {
  const { page: p, errs, ctx } = await open();
  // ---- mouse
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.click(btn);
    const opened = await waitUi(p, scr);
    await p.click('#' + scr + ' .btn-back');
    const closed = await waitUi(p, 'scrTitle');
    check(`menus/mouse: ${scr} opens and closes (Back button)`, opened && closed);
  }
  // ---- keyboard: Esc closes; Enter on the focused button opens/closes; Space too
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.focus(btn); await p.keyboard.press('Enter');
    const opened = await waitUi(p, scr);
    await p.keyboard.press('Escape');
    const closedEsc = await waitUi(p, 'scrTitle');
    await p.focus(btn); await p.keyboard.press('Space');
    const opened2 = await waitUi(p, scr);
    await sleep(80);   // show() focuses the screen's main button after 30 ms
    await p.keyboard.press('Enter');
    const closedEnter = await waitUi(p, 'scrTitle');
    check(`menus/keyboard: ${scr} Enter-open, Esc-close, Space-open, Enter-close`, opened && closedEsc && opened2 && closedEnter, { opened, closedEsc, opened2, closedEnter });
  }
  check('menus/keyboard: still on the title, no game started', await mode(p) === 'title' && await p.evaluate(() => PR.Game._starts) === 0);
  // ---- Space on the title starts exactly one game (focused Play button must not double-start)
  await sleep(100);
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
  await p.keyboard.press('Space');
  await waitMode(p, 'playing');
  await sleep(300);
  check('menus/keyboard: Space on title (Play focused) starts exactly one game', await p.evaluate(() => PR.Game._starts) === 1, { focused, starts: await p.evaluate(() => PR.Game._starts) });
  // ---- Enter on focused Play starts exactly one game
  await p.evaluate(() => PR.Game.toTitle()); await sleep(150);
  await p.focus('#btnPlay'); await p.keyboard.press('Enter'); await waitMode(p, 'playing'); await sleep(300);
  check('menus/keyboard: Enter on focused Play starts exactly one game', await p.evaluate(() => PR.Game._starts) === 2);
  // ---- Pause: Esc / P / buttons
  await calm(p); await sleep(300);
  await p.keyboard.press('Escape'); const pz1 = await waitMode(p, 'paused'); const pzUi = await ui(p);
  await p.keyboard.press('Escape'); const r1 = await waitMode(p, 'playing');
  check('menus/pause: Esc pauses and Esc resumes', pz1 && pzUi === 'scrPause' && r1);
  await p.keyboard.press('p'); const pz2 = await waitMode(p, 'paused');
  await p.keyboard.press('p'); const r2 = await waitMode(p, 'playing');
  check('menus/pause: P pauses and P resumes', pz2 && r2);
  await p.click('#btnPause'); const pz3 = await waitMode(p, 'paused');
  await p.click('#btnResume'); const r3 = await waitMode(p, 'playing');
  check('menus/pause: HUD pause button + Resume button (mouse)', pz3 && r3);
  await p.keyboard.press('Escape'); await waitMode(p, 'paused'); await sleep(80);
  await p.keyboard.press('Enter'); const r4 = await waitMode(p, 'playing');
  check('menus/pause: Enter on the focused Resume button resumes', r4);
  await p.keyboard.press('Escape'); await waitMode(p, 'paused'); await sleep(80);
  await p.keyboard.press('Space'); const r5 = await waitMode(p, 'playing'); await sleep(200);
  check('menus/pause: Space on the focused Resume button resumes (no stray cast)', r5 && !(await hook(p)).holding);
  // settings from pause and back with Esc → pause again
  await p.keyboard.press('Escape'); await waitMode(p, 'paused');
  await p.click('#btnPauseSettings'); const s1 = await waitUi(p, 'scrSettings');
  await p.keyboard.press('Escape'); const s2 = await waitUi(p, 'scrPause');
  await p.click('#btnPauseSettings'); await waitUi(p, 'scrSettings');
  await p.click('#scrSettings .btn-back'); const s3 = await waitUi(p, 'scrPause');
  check('menus/pause: Settings from Pause, back with Esc and Done → Pause', s1 && s2 && s3 && await mode(p) === 'paused');
  await p.click('#btnRestart'); const rs = await waitMode(p, 'playing');
  check('menus/pause: Restart starts a fresh game', rs && await p.evaluate(() => PR.debug.world.time < 2));
  await p.keyboard.press('Escape'); await waitMode(p, 'paused');
  await p.click('#btnPauseMenu'); const mm = await waitMode(p, 'title');
  check('menus/pause: Main Menu returns to the title', mm && await ui(p) === 'scrTitle');
  // ---- Game over: buttons, keyboard
  await p.evaluate(() => PR.Game.startGame()); await waitMode(p, 'playing');
  await killNow(p);
  const over = await waitMode(p, 'over', 6000);
  check('menus/over: game over screen appears', over && await ui(p) === 'scrOver');
  await p.screenshot({ path: OUT + '/func_over.png' });
  await sleep(800);
  await p.click('#btnOverMenu'); const om = await waitMode(p, 'title');
  check('menus/over: Menu button returns to the title', om);
  await p.evaluate(() => PR.Game.startGame()); await waitMode(p, 'playing'); await killNow(p); await waitMode(p, 'over', 6000);
  await sleep(800);
  const s0 = await p.evaluate(() => PR.Game._starts);
  await p.click('#btnAgain'); const ag = await waitMode(p, 'playing'); await sleep(200);
  check('menus/over: Play Again (mouse) starts exactly one game', ag && await p.evaluate(() => PR.Game._starts) === s0 + 1);
  for (const key of ['Enter', 'Space']) {
    await killNow(p); await waitMode(p, 'over', 6000);
    const sA = await p.evaluate(() => PR.Game._starts);
    await p.keyboard.press(key); await sleep(150);
    const locked = await mode(p) === 'over';
    await sleep(800);
    await p.keyboard.press(key); const again = await waitMode(p, 'playing'); await sleep(250);
    const sB = await p.evaluate(() => PR.Game._starts);
    check(`menus/over: ${key} is ignored for 0.7 s, then restarts exactly once`, locked && again && sB === sA + 1, { locked, again, starts: sB - sA });
  }
  await killNow(p); await waitMode(p, 'over', 6000);
  const sC = await p.evaluate(() => PR.Game._starts);
  await p.click('#btnAgain'); await sleep(150);
  const lockedClick = await mode(p) === 'over' && await p.evaluate(() => PR.Game._starts) === sC;
  check('menus/over: Play Again click within 0.7 s is ignored (restart lock)', lockedClick);
  await p.keyboard.press('Escape'); await sleep(100);
  check('menus/over: Esc on game over does nothing harmful', await mode(p) === 'over');
  check('menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// last line → snap → game over (death), using a puffer placed on the hook
async function killNow(p) {
  await p.evaluate(() => {
    const w = PR.debug.world; w.lines = 1; w.invuln = 0;
    if (w.phase === 'reel') w._endReel();
    if (w.phase !== 'roam') { w.phase = 'roam'; w.hook.lost = false; }
    w._hangT = 0; w.hook.drop = false;
    if (w.hook.y < w.layout.minHookY) w.hook.y = w.hook.prevY = w.layout.minHookY + 10;
    const pf = w._spawnPuffer(); pf.x = pf.prevX = w.hook.x; pf.by = pf.y = pf.prevY = w.hook.y; pf.vx = 0; pf.bobAmp = 0;
  });
}

async function sMenusTouch() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  check('touch: game detects a touch device', await p.evaluate(() => PR.Game.isTouch && document.body.classList.contains('touch')));
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.tap(btn); const opened = await waitUi(p, scr);
    await sleep(700);   // past the ghost-click window
    const still = await ui(p) === scr;   // ghost click must not have closed it
    await p.tap('#' + scr + ' .btn-back'); const closed = await waitUi(p, 'scrTitle');
    check(`touch/menus: ${scr} opens (stays open after the ghost click) and closes by tap`, opened && still && closed);
    await sleep(700);
  }
  await p.tap('#btnPlay'); const pl = await waitMode(p, 'playing'); await sleep(400);
  check('touch/menus: tap Play starts exactly one game', pl && await p.evaluate(() => PR.Game._starts) === 1);
  await calm(p); await sleep(1200); await calm(p);
  const c0 = await casts(p);
  await p.tap('#btnPause'); const pz = await waitMode(p, 'paused');
  check('touch/HUD: tapping Pause pauses and does not cast the hook', pz && await casts(p) === c0);
  await sleep(700);
  await p.tap('#btnResume'); const rs = await waitMode(p, 'playing'); await sleep(200);
  check('touch/menus: tap Resume resumes', rs && !(await hook(p)).holding);
  const m0 = await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute);
  await p.tap('#btnMuteHud'); await sleep(250);
  const m1 = await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute);
  check('touch/HUD: tapping Mute toggles sound and does not cast', m0 !== m1 && await casts(p) === c0 && !(await hook(p)).holding);
  await killNow(p); await waitMode(p, 'over', 6000); await sleep(800);
  await p.tap('#btnAgain'); const ag = await waitMode(p, 'playing');
  check('touch/over: tap Play Again restarts', ag);
  await killNow(p); await waitMode(p, 'over', 6000); await sleep(800);
  await p.tap('#btnOverMenu'); const om = await waitMode(p, 'title');
  check('touch/over: tap Menu returns to the title', om);
  check('touch/menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sInput() {
  const { page: p, errs, ctx } = await open();
  await startPlaying(p);
  const settle = async () => { await p.evaluate(() => { const w = PR.debug.world; w.items.length = 0; }); await sleep(1300); };
  async function holdTest(name, down, up) {
    await settle();
    const a = await hook(p);
    await down(); await sleep(650);
    const b = await hook(p);
    await up(); await sleep(900);
    const c = await hook(p);
    check(`input: holding ${name} sinks the hook, releasing lets it rise`, b.y > a.y + 40 && b.holding && !c.holding && c.y < b.y - 20, { y0: a.y | 0, held: b.y | 0, released: c.y | 0 });
  }
  await holdTest('Space', () => p.keyboard.down('Space'), () => p.keyboard.up('Space'));
  await holdTest('ArrowDown', () => p.keyboard.down('ArrowDown'), () => p.keyboard.up('ArrowDown'));
  await holdTest('S', () => p.keyboard.down('s'), () => p.keyboard.up('s'));
  await holdTest('mouse', async () => { await p.mouse.move(300, 600); await p.mouse.down(); }, () => p.mouse.up());
  // two keys: hold Space, add ArrowDown, release Space → still holding; release ArrowDown → rises
  await settle();
  await p.keyboard.down('Space'); await sleep(150); await p.keyboard.down('ArrowDown'); await sleep(150);
  await p.keyboard.up('Space'); await sleep(150);
  const h1 = await hook(p);
  await p.keyboard.up('ArrowDown'); await sleep(150);
  const h2 = await hook(p);
  check('input: a second key keeps the hold when the first key is released', h1.holding && !h2.holding);
  // right mouse button does nothing
  await settle(); const cR = await casts(p);
  await p.mouse.move(300, 600); await p.mouse.down({ button: 'right' }); await sleep(200); await p.mouse.up({ button: 'right' });
  check('input: right mouse button does not cast', await casts(p) === cR);
  // HUD buttons never play (mouse)
  await settle();
  const c0 = await casts(p), mute0 = await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute);
  await p.click('#btnMuteHud'); await sleep(200);
  check('input: clicking the HUD Mute button toggles sound, never casts', await casts(p) === c0 && !(await hook(p)).holding && mute0 !== await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute));
  // the Mute button now has focus: Space must sink, not click Mute again
  const mute1 = await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute);
  await p.keyboard.down('Space'); await sleep(300);
  const hs = await hook(p);
  await p.keyboard.up('Space'); await sleep(200);
  const mute2 = await p.evaluate(() => PR.Game.settings.muted || PR.Game.urlMute);
  check('input: Space after clicking the HUD Mute button sinks (no second Mute click)', hs.holding && mute1 === mute2, { holding: hs.holding, muteToggledAgain: mute1 !== mute2 });
  await p.click('#btnMuteHud'); await sleep(150);   // sound state back
  await p.click('#btnPause'); await waitMode(p, 'paused');
  check('input: clicking the HUD Pause button pauses, never casts', await casts(p) === c0 + 1);   // +1 = the Space hold above
  await p.click('#btnResume'); await waitMode(p, 'playing');

  // ---- reel taps: exactly one reel tap per press, for mouse / Space / Enter
  for (const [name, act] of [
    ['mouse click', () => p.mouse.click(300, 600)],
    ['Space press', () => p.keyboard.press('Space')],
    ['Enter press', () => p.keyboard.press('Enter')],
    ['ArrowDown press', () => p.keyboard.press('ArrowDown')]]) {
    await setupReel(p, 'ruby');
    await p.evaluate(() => { PR.debug.world.reel.needle = 0; PR.debug.world.reel.zone = 0.6; });
    const t0 = await p.evaluate(() => PR.debug.world.reel.taps);
    await act(); await sleep(120);
    const t1 = await p.evaluate(() => ({ taps: PR.debug.world.reel.taps, phase: PR.debug.world.phase }));
    check(`input: a ${name} during the reel = exactly one reel tap`, t1.taps === t0 + 1 && t1.phase === 'reel', { taps: t1.taps - t0 });
  }
  // holding a key through the hook-up: the held key is no reel tap, auto-repeat does nothing
  await setupReel(p, 'ruby');
  const tr0 = await p.evaluate(() => PR.debug.world.reel.taps);
  await p.keyboard.down('Space'); await sleep(100);
  for (let i = 0; i < 5; i++) await p.keyboard.down('Space');   // auto-repeat
  await p.keyboard.up('Space'); await sleep(100);
  check('input: key auto-repeat during the reel gives one tap only', await p.evaluate(() => PR.debug.world.reel.taps) === tr0 + 1);
  // HUD during reel
  const tr1 = await p.evaluate(() => PR.debug.world.reel.taps);
  await p.click('#btnMuteHud'); await sleep(100); await p.click('#btnMuteHud'); await sleep(100);
  check('input: HUD Mute clicks during the reel are no reel taps', await p.evaluate(() => PR.debug.world.reel.taps) === tr1);
  await p.evaluate(() => PR.debug.setSpeed(1));

  // ---- hook a gem with real input: gem parked just below the hook, hold Space
  await p.evaluate(() => { const w = PR.debug.world; if (w.phase === 'reel') w._endReel(); });
  await settle();
  await p.evaluate(() => {
    const w = PR.debug.world, it = w._spawnGem(false); it.type = 'emerald';
    it.x = it.prevX = w.hook.x; it.by = it.y = it.prevY = w.hook.y + 110; it.vx = 0; it.bobAmp = 0;
  });
  await p.keyboard.down('Space');
  const hooked = await p.waitForFunction(() => PR.debug.world.phase === 'reel', null, { timeout: 4000 }).then(() => true, () => false);
  await p.keyboard.up('Space');
  check('input: holding Space down onto a gem hooks it (phase → reel)', hooked);
  await p.screenshot({ path: OUT + '/func_reel.png' });
  // reel it in with real taps timed off the needle
  let guard = 0;
  while (await p.evaluate(() => PR.debug.world.phase === 'reel') && guard++ < 40) {
    await p.waitForFunction(() => { const r = PR.debug.world.reel; return !r.active || Math.abs(r.needle - r.zone) < r.width * 0.25; }, null, { timeout: 5000 }).catch(() => {});
    await p.keyboard.press('Space'); await sleep(260);
  }
  await sleep(500);
  const st = await p.evaluate(() => ({ g: PR.debug.world.totalGems, s: PR.debug.world.score, esc: PR.debug.world.stats.escapes }));
  check('input: timed Space taps reel the gem in (caught, scored)', st.g === 1 && st.s >= 20, st);

  // ---- blur releases the hold and pauses
  await settle();
  await p.keyboard.down('Space'); await sleep(200);
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  const bl = await p.evaluate(() => ({ m: PR.Game.mode, h: PR.debug.world.hook.holding }));
  await p.keyboard.up('Space');
  check('input: window blur releases the hold and pauses', bl.m === 'paused' && !bl.h, bl);
  await p.keyboard.press('Escape'); await waitMode(p, 'playing');
  // visibility hidden pauses
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const vh = await mode(p);
  await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  check('input: page hidden (visibilitychange) pauses', vh === 'paused');
  check('input: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sTouchInput() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await startPlaying(p);
  const F1 = [120, 650, 1], F2 = [260, 700, 2];
  await sleep(300);
  const a = await hook(p);
  await touch('touchStart', [F1]); await sleep(650);
  const b = await hook(p);
  await touch('touchEnd', []); await sleep(900);
  const c = await hook(p);
  check('touch input: holding a finger sinks the hook, lifting it lets it rise', b.y > a.y + 40 && b.holding && !c.holding && c.y < b.y - 20, { y0: a.y | 0, held: b.y | 0, released: c.y | 0 });
  // two fingers: lift the first, the second still holds
  await sleep(600);
  await touch('touchStart', [F1]); await sleep(120);
  await touch('touchStart', [F1, F2]); await sleep(120);
  await touch('touchEnd', [F1]); await sleep(150);   // CDP touchEnd lifts the listed point: F2 stays down
  const d = await hook(p);
  await touch('touchEnd', []); await sleep(150);
  const e = await hook(p);
  check('touch input: second finger keeps the hold when the first lifts', d.holding && !e.holding, { during: d.holding, after: e.holding });
  // a tap during the reel = one reel tap
  await setupReel(p, 'ruby');
  await p.evaluate(() => { PR.debug.world.reel.needle = 0; PR.debug.world.reel.zone = 0.6; });
  const t0 = await p.evaluate(() => PR.debug.world.reel.taps);
  await p.touchscreen.tap(150, 650); await sleep(150);
  check('touch input: one tap during the reel = exactly one reel tap', await p.evaluate(() => PR.debug.world.reel.taps) === t0 + 1);
  // hold with one finger while reeling, tap with a second = one more tap
  const t1 = await p.evaluate(() => PR.debug.world.reel.taps);
  await touch('touchStart', [F1]); await sleep(80); await touch('touchStart', [F1, F2]); await sleep(80); await touch('touchEnd', [F1]); await sleep(80); await touch('touchEnd', []);
  await sleep(100);
  check('touch input: two fingers in the reel = two reel taps', await p.evaluate(() => PR.debug.world.reel.taps) === t1 + 2);
  // Pause by tap while another finger holds (the iOS second-finger case)
  await p.evaluate(() => { const w = PR.debug.world; w._endReel(); PR.debug.setSpeed(1); });
  await calm(p); await sleep(800);
  const hb = await p.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [F1]); await sleep(200);
  await touch('touchStart', [F1, [hb[0], hb[1], 3]]); await sleep(80);
  await touch('touchEnd', [[hb[0], hb[1], 3]]); await sleep(200);   // CDP touchEnd lifts the listed point
  const pz = await mode(p);
  await touch('touchEnd', []); await sleep(150);
  check('touch input: tapping Pause with a second finger while holding pauses', pz === 'paused', pz);
  check('touch input: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sRules() {
  const { page: p, errs, ctx } = await open();
  await p.evaluate(() => PR.Game.setSetting('difficulty', 'normal'));   // the first-run default is Easy; these checks use Normal
  await startPlaying(p);
  const pts = { amethyst: 10, emerald: 20, ruby: 30, gold: 50 };
  // ---- Good / Perfect / slip / escape mechanics
  let r = await setupReel(p, 'ruby');
  check('rules: a gem touching the hook is hooked (phase reel)', r.phase === 'reel' && r.steps >= 4, r);
  let t = await reelTap(p, 'good');
  check('rules: Good tap pulls the gem up one step, no bonus', Math.abs((t.before.y - t.after.y) - r.stepPx) < 0.01 && t.after.score === t.before.score, { dy: +(t.before.y - t.after.y).toFixed(1), stepPx: r.stepPx });
  t = await reelTap(p, 'perfect');
  check('rules: Perfect tap pulls two steps and adds +5', Math.abs((t.before.y - t.after.y) - 2 * r.stepPx) < 0.01 && t.after.score === t.before.score + 5);
  t = await reelTap(p, 'slip');
  check('rules: a miss slips the gem down half a step', Math.abs((t.after.y - t.before.y) - r.stepPx / 2) < 0.01 && t.after.slips === 1);
  await reelTap(p, 'slip');
  t = await reelTap(p, 'slip');
  const esc = await p.evaluate(() => ({ phase: PR.debug.world.phase, escapes: PR.debug.world.stats.escapes, holding: PR.debug.world.hook.holding }));
  check('rules: third slip → gem escapes, back to roaming, hold cleared', esc.phase === 'roam' && esc.escapes === 1 && !esc.holding, esc);
  // zone moves after each tap (≥ 0.22 apart when possible)
  r = await setupReel(p, 'ruby');
  const z0 = await p.evaluate(() => PR.debug.world.reel.zone); await reelTap(p, 'good'); const z1 = await p.evaluate(() => PR.debug.world.reel.zone);
  check('rules: the green zone jumps after a tap', Math.abs(z1 - z0) >= 0.2, { z0: +z0.toFixed(2), z1: +z1.toFixed(2) });
  // ---- catch points per type with Good taps only, then with Perfect taps
  for (const type of Object.keys(pts)) {
    await p.evaluate(() => { PR.debug.world.score = 0; });
    await setupReel(p, type);
    let n = 0; while (n++ < 30) { const x = await reelTap(p, 'good'); if (x.after.catching || x.after.phase !== 'reel') break; }
    await p.evaluate(() => PR.debug.world.update(0.4));
    const s = await p.evaluate(() => ({ score: PR.debug.world.score, phase: PR.debug.world.phase }));
    check(`rules: catching ${type} with Good taps scores ${pts[type]}`, s.score === pts[type] && s.phase === 'roam', s);
  }
  await p.evaluate(() => { PR.debug.world.score = 0; });
  await setupReel(p, 'amethyst');
  let np = 0, n = 0; while (n++ < 30) { const x = await reelTap(p, 'perfect'); np++; if (x.after.catching || x.after.phase !== 'reel') break; }
  await p.evaluate(() => PR.debug.world.update(0.4));
  const sp = await p.evaluate(() => PR.debug.world.score);
  check('rules: amethyst with only Perfect taps scores 10 + 5 per Perfect', sp === 10 + 5 * np, { score: sp, perfects: np });
  // the caught gem flies to the bucket and is removed; the counters move
  await p.evaluate(() => { for (let i = 0; i < 20; i++) PR.debug.world.update(0.05); });   // update() caps one call at 0.25 s
  const cs = await p.evaluate(() => { const w = PR.debug.world; return { items: w.items.length, gz: w.gemsInZone, total: w.totalGems, byType: w.stats.byType }; });
  check('rules: catches counted (gemsInZone/totalGems/byType)', cs.total === 5 && cs.gz === 5 && cs.byType.gold === 1 && cs.byType.amethyst === 2, cs);
  check('rules: the caught gem is gone after its flight to the bucket', cs.items === 0, cs.items);
  // ---- golden gem spawn hook
  const gold = await p.evaluate(() => { const it = PR.debug.spawnGold(); return { type: it.type, vx: it.vx }; });
  check('rules: spawnGold() makes a golden gem drifting toward the hole', gold.type === 'gold' && gold.vx > 0);
  await p.evaluate(() => { PR.debug.world.items.length = 0; });
  // ---- zone clear → next zone + a line back
  await p.evaluate(() => { const w = PR.debug.world; w.gemsInZone = w.gemsNeeded - 1; w.lines = 2; w.score = 0; });
  await setupReel(p, 'amethyst', false);
  n = 0; while (n++ < 30) { const x = await reelTap(p, 'good'); if (x.after.catching || x.after.phase !== 'reel') break; }
  await p.evaluate(() => PR.debug.world.update(0.4));
  await sleep(150);   // the game loop drains levelUp → visuals
  const zc = await p.evaluate(() => { const w = PR.debug.world, R = PR.Game.renderer; return { level: w.level, zone: w.zone, lines: w.lines, gz: w.gemsInZone, vis: R.vis.cur, banner: !!R.banner }; });
  check('rules: clearing the zone → zone 2 (Kelp Garden), +1 line, counter reset, new visuals + banner', zc.level === 1 && zc.zone === 1 && zc.lines === 3 && zc.gz === 0 && zc.vis === 1 && zc.banner, zc);
  await p.evaluate(() => { const w = PR.debug.world; w.gemsInZone = w.gemsNeeded - 1; w.lines = 3; });
  await setupReel(p, 'amethyst', false);
  n = 0; while (n++ < 30) { const x = await reelTap(p, 'good'); if (x.after.catching || x.after.phase !== 'reel') break; }
  await p.evaluate(() => PR.debug.world.update(0.4));
  const zc2 = await p.evaluate(() => ({ level: PR.debug.world.level, lines: PR.debug.world.lines }));
  check('rules: lines never exceed 3 on zone clear', zc2.level === 2 && zc2.lines === 3, zc2);
  // endless loop: level 4 = Shallows again, loop 1, faster
  const lp = await p.evaluate(() => { const w = PR.debug.world, n0 = w._needle; PR.debug.gotoLevel(4); return { zone: w.zone, loop: w.loop, faster: w._needle > 0 && w._mult() > 1 }; });
  check('rules: after Aurora Deep the zones loop (level 4 → zone 0, loop 1, faster)', lp.zone === 0 && lp.loop === 1 && lp.faster, lp);
  await p.evaluate(() => PR.debug.gotoLevel(0));
  // ---- pufferfish snap → lines −1, invulnerable while the new line drops in
  const sn = await p.evaluate(() => {
    const w = PR.debug.world, L = w.layout; w.items.length = 0; w.lines = 3; w.invuln = 0; w.phase = 'roam';
    Object.assign(w.hook, { lost: false, drop: false }); w.hook.y = w.hook.prevY = L.minHookY + 100;
    const pf = w._spawnPuffer(); pf.x = pf.prevX = w.hook.x; pf.by = pf.y = pf.prevY = w.hook.y; pf.vx = 0; pf.bobAmp = 0;
    w.update(1 / 120);
    const a = { lines: w.lines, phase: w.phase, lost: w.hook.lost, puffed: pf.state };
    for (let i = 0; i < 21; i++) w.update(0.05);   // the new line drops in (update() caps one call at 0.25 s)
    const b = { phase: w.phase, invuln: w.invuln };
    const pf2 = w._spawnPuffer(); pf2.x = pf2.prevX = w.hook.x; pf2.by = pf2.y = pf2.prevY = Math.max(w.hook.y, L.waterTop + 5); pf2.vx = 0; pf2.bobAmp = 0;
    w.hook.drop = false; w.hook.y = w.hook.prevY = pf2.y;
    w.update(1 / 120);
    return { a, b, linesAfterInvuln: w.lines };
  });
  check('rules: puffer bump snaps the line: lines 3→2, phase snap, puffer puffs', sn.a.lines === 2 && sn.a.phase === 'snap' && sn.a.lost && sn.a.puffed === 'puffed', sn.a);
  check('rules: a new line comes back after ~1 s and is briefly invulnerable', sn.b.phase === 'roam' && sn.b.invuln > 0 && sn.linesAfterInvuln === 2, sn);
  // puffers ignore the hook while reeling
  const ir = await p.evaluate(() => {
    const w = PR.debug.world; w.invuln = 0;
    return w.lines;
  });
  await setupReel(p, 'ruby');
  const ir2 = await p.evaluate(() => {
    const w = PR.debug.world; w.invuln = 0;
    const pf = w._spawnPuffer(); pf.x = pf.prevX = w.hook.x; pf.by = pf.y = pf.prevY = w.hook.y; pf.vx = 0; pf.bobAmp = 0;
    w.update(0.05); return { lines: w.lines, phase: w.phase };
  });
  check('rules: puffers ignore the hook while reeling', ir2.lines === ir && ir2.phase === 'reel', ir2);
  await p.evaluate(() => { const w = PR.debug.world; w._endReel(); w.items.length = 0; });
  // ---- game over at 0 lines, best score per difficulty
  await p.evaluate(() => { PR.debug.world.score = 0; PR.debug.world.score = 135; });
  await p.evaluate(() => PR.debug.setSpeed(1));
  await killNow(p);
  await sleep(120);
  const death = await p.evaluate(() => ({ phase: PR.debug.world.phase, lines: PR.debug.world.lines, mode: PR.Game.mode, deadT: PR.Game.deadT }));
  check('rules: last line snapped → phase over, lines 0', death.phase === 'over' && death.lines === 0, death);
  // no pause on the death frame / during the death pause
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  const dm = await mode(p);
  check('pause: Esc / blur during the death moment do not pause', dm === 'playing', dm);
  const ov = await waitMode(p, 'over', 4000);
  check('rules: game over screen ≈1.4 s after the last snap', ov);
  const ovs = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: localStorage.getItem('par:best_normal') }));
  check('rules: game over shows score, best and NEW!, best saved for normal', ovs.score === '135' && ovs.best === '135' && ovs.nb && ovs.stored === '135', ovs);
  check('rules: the death recorded in PR.debug.stats', await p.evaluate(() => PR.debug.stats.games === 1 && PR.debug.stats.scores[0] === 135));
  // lower score next time: best stays, no NEW!
  await sleep(800);
  await p.keyboard.press('Enter'); await waitMode(p, 'playing');
  await p.evaluate(() => { PR.debug.world.score = 40; });
  await killNow(p); await waitMode(p, 'over', 5000);
  const ovs2 = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: localStorage.getItem('par:best_normal') }));
  check('rules: a lower score keeps the best and shows no NEW!', ovs2.score === '40' && ovs2.best === '135' && !ovs2.nb && ovs2.stored === '135', ovs2);
  // per difficulty: switch to Easy → best 0 on the title; back to normal → 135
  await sleep(800); await p.click('#btnOverMenu'); await waitMode(p, 'title');   // Menu has the 0.7 s restart lock too
  check('rules: title shows the best score for the current difficulty (normal 135)', (await p.textContent('#bestTitle')) === '135');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#setDifficulty button[data-v=easy]');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  const eb = await p.textContent('#bestTitle');
  await p.evaluate(() => PR.Game.startGame()); await waitMode(p, 'playing');
  const ed = await p.evaluate(() => ({ d: PR.debug.world.difficulty, need: PR.debug.world.gemsNeeded }));
  await p.evaluate(() => { PR.debug.world.score = 60; }); await killNow(p); await waitMode(p, 'over', 5000);
  const es = await p.evaluate(() => ({ easy: localStorage.getItem('par:best_easy'), normal: localStorage.getItem('par:best_normal') }));
  check('rules: Easy has its own best (title 0, game easy with 6 gems/zone, saved separately)', eb === '0' && ed.d === 'easy' && ed.need === 6 && es.easy === '60' && es.normal === '135', { eb, ed, es });
  // Reset best: needs two taps
  await sleep(800); await p.click('#btnOverMenu'); await waitMode(p, 'title');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest'); const armed = await p.evaluate(() => [localStorage.getItem('par:best_easy'), document.getElementById('btnResetBest').textContent]);
  await p.click('#btnResetBest'); const cleared = await p.evaluate(() => [localStorage.getItem('par:best_easy'), localStorage.getItem('par:best_normal')]);
  check('settings: Reset best asks "Sure?" first and clears all bests on the second tap', armed[0] === '60' && armed[1] === 'Sure?' && cleared[0] === null && cleared[1] === null, { armed, cleared });
  await p.click('#setDifficulty button[data-v=normal]');
  check('rules: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sMuteSettings() {
  // ---- ?mute=1 is never saved; M toggles; settings persist across reload
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let o = await open(null, '?mute=1', ctx);
  let p = o.page;
  const st = () => p.evaluate(() => ({ s: JSON.parse(localStorage.getItem('par:settings') || 'null'), g: Object.assign({}, PR.Game.settings), url: PR.Game.urlMute }));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx) .tog');
  let a = await st();
  check('mute: ?mute=1 starts muted but is not written into settings', a.url === true && a.s && a.s.muted === false && a.s.sfx === false, a);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('m'); a = await st();
  check('mute: M under ?mute=1 turns sound on without saving muted', a.url === false && !a.g.muted && a.s.muted === false, a);
  await p.keyboard.press('m'); a = await st();
  check('mute: M again mutes and saves muted=true (a real choice)', a.g.muted === true && a.s.muted === true, a);
  await p.keyboard.press('m'); a = await st();
  check('mute: M again unmutes and saves', a.g.muted === false && a.s.muted === false, a);
  await p.evaluate(() => PR.Game.startGame()); await waitMode(p, 'playing');
  await p.keyboard.press('m'); a = await st();
  const icon = await p.evaluate(() => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6'));
  check('mute: M in game mutes and the HUD icon shows muted', a.g.muted === true && icon && await mode(p) === 'playing');
  await p.keyboard.press('m');
  // settings: music off, difficulty hard, sfx stays off → reload without ?mute
  await p.evaluate(() => PR.Game.toTitle());
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setMusic) .tog');
  await p.click('#setDifficulty button[data-v=hard]');
  await p.click('#scrSettings .btn-back');
  await o.page.close();
  o = await open(null, '?seed=2', ctx); p = o.page;
  a = await st();
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  const dom = await p.evaluate(() => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, diff: document.querySelector('#setDifficulty button.on') && document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: sound, music and difficulty persist across reload (state + controls)', a.g.sfx === false && a.g.music === false && a.g.difficulty === 'hard' && !a.g.muted && !a.url && dom.sfx === false && dom.music === false && dom.diff === 'hard', { g: a.g, dom });
  await p.keyboard.press('Escape');
  await p.evaluate(() => PR.Game.startGame()); await waitMode(p, 'playing');
  check('settings: the saved difficulty is used by the next game', await p.evaluate(() => PR.debug.world.difficulty === 'hard' && PR.debug.world.gemsNeeded === 10));
  await p.evaluate(() => PR.Game.toTitle());
  // ?diff= flag is never saved
  await o.page.close();
  o = await open(null, '?mute=1&diff=easy', ctx); p = o.page;
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings'); await p.click('label.set:has(#setSfx) .tog');
  const sd = await p.evaluate(() => JSON.parse(localStorage.getItem('par:settings')).difficulty);
  check('settings: ?diff=easy test flag is not saved into settings', sd === 'hard', sd);
  // restore defaults
  await p.click('label.set:has(#setMusic) .tog'); await p.click('#setDifficulty button[data-v=normal]');
  check('settings: no console errors', o.errs.length === 0, o.errs.slice(0, 3));
  await ctx.close();
}

async function sPictures() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=4');
  // make test images in the browser (canvas → bytes)
  const mk = await p.evaluate(async () => {
    const out = {};
    const enc = (c, type, q) => new Promise(r => c.toBlob(b => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }, type, q));
    let c = document.createElement('canvas'); c.width = 300; c.height = 240; let g = c.getContext('2d');
    g.fillStyle = '#e33'; g.beginPath(); g.arc(150, 120, 90, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(120, 90, 60, 60);
    out.png = await enc(c, 'image/png');
    c = document.createElement('canvas'); c.width = 800; c.height = 600; g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 800, 600); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#fd5'); g.fillStyle = gr; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#933'; g.beginPath(); g.arc(400, 300, 160, 0, 7); g.fill();
    out.jpg = await enc(c, 'image/jpeg', 0.9);
    c = document.createElement('canvas'); c.width = 6000; c.height = 4000; g = c.getContext('2d');
    const g2 = g.createLinearGradient(0, 0, 6000, 4000); g2.addColorStop(0, '#147'); g2.addColorStop(0.5, '#6cf'); g2.addColorStop(1, '#fe9'); g.fillStyle = g2; g.fillRect(0, 0, 6000, 4000);
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 37 % 360},70%,60%)`; g.beginPath(); g.arc((i * 911) % 6000, (i * 577) % 4000, 40 + i % 90, 0, 7); g.fill(); }
    out.huge = await enc(c, 'image/jpeg', 0.85);
    return out;
  });
  const files = {
    png: { name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(mk.png, 'base64') },
    jpg: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(mk.jpg, 'base64') },
    huge: { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(mk.huge, 'base64') },
    txt: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') }
  };
  const slotIndex = { hero: 0, gem: 1, puffer: 2, bg_shallows: 3, bg_kelp: 4, bg_twilight: 5, bg_aurora: 6 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  async function pick(slot, file) {
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && !/Saving/.test(t.textContent); }, null, { timeout: 15000 }).catch(() => {});
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('par:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('par:shape_' + slot) };
  }, slot);
  let toast = await pick('hero', files.png); let s = await stored('hero');
  check('pictures: PNG with transparency → hero, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit' && await p.evaluate(() => PR.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('gem', files.jpg); s = await stored('gem');
  check('pictures: opaque JPEG photo → gem, becomes a round sticker', /saved/i.test(toast) && s && s.shape === 'circle' && await p.evaluate(() => PR.Assets.custom.gem.width === 512), { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(2) .tag');
  check('pictures: the card shows "Your picture" and the Round shape is selected', /Your picture/.test(tag) && await p.evaluate(() => document.querySelector('#slotGrid .slot:nth-child(2) .shape button.on').dataset.shape === 'circle'));
  toast = await pick('puffer', files.txt); s = await stored('puffer');
  check('pictures: a non-image file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('bg_shallows', files.huge); s = await stored('bg_shallows');
  check('pictures: 6000×4000 photo → background downscaled to 1600 px long edge and stored', /saved/i.test(toast) && s && s.w === 1600 && s.h === 1067, { toast, s });
  toast = await pick('puffer', files.huge); s = await stored('puffer');
  check('pictures: 6000×4000 photo → puffer downscaled to ≤512 px', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512, { toast, s });
  // shape toggle
  await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=circle]');
  check('pictures: shape buttons switch hero to Round', await p.evaluate(() => localStorage.getItem('par:shape_hero') === 'circle' && PR.Assets.custom.hero.width === 512));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  // play with the custom pictures
  await p.evaluate(() => { PR.Game.startGame(); PR.debug.setBot(true, 0.9); PR.debug.setSpeed(3); });
  await sleep(4000);
  await p.evaluate(() => { const w = PR.debug.world; const pf = w._spawnPuffer(); pf.x = w.layout.holeX + 120; });
  await p.evaluate(() => PR.debug.setSpeed(1)); await sleep(600);
  const bg = await p.evaluate(() => { const R = PR.Game.renderer; return { custom: !!R.background(0).custom, zone: R.vis.cur }; });
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const pc = await p.evaluate(() => { const c = PR.Game.renderer.canvas, g = c.getContext('2d'); const d = g.getImageData(0, Math.round(c.height * 0.85), c.width, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  check('pictures: the game runs with custom hero/gem/puffer/background (custom scene in use)', bg.custom && bg.zone === 0 && await p.evaluate(() => PR.debug.stats.errors.length === 0), bg);
  check('pictures: the custom background is actually drawn (canvas not blank)', pc > 30, Math.round(pc));
  await p.evaluate(() => PR.debug.gotoLevel(1)); await sleep(1500);
  check('pictures: zones without a custom picture still use the default scene', await p.evaluate(() => !PR.Game.renderer.background(1).custom));
  // reload keeps them
  await p.reload(); await p.waitForFunction(() => window.PR && PR.Game && PR.Game.mode === 'title');
  check('pictures: custom pictures survive a reload', await p.evaluate(() => ['hero', 'gem', 'puffer', 'bg_shallows'].every(s => PR.Assets.hasCustom(s))));
  // reset one, then reset all
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: PR.Assets.hasCustom('hero'), k: localStorage.getItem('par:img_hero'), shape: localStorage.getItem('par:shape_hero'), gem: PR.Assets.hasCustom('gem') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.gem, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: PR.Assets.SLOTS.some(s => PR.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^par:(img|shape)_/.test(k)) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0, r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => PR.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene is drawn again', await p.evaluate(() => !PR.Game.renderer.background(0).custom));
  check('pictures: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

async function sLayout() {
  const sizes = [
    ['1280x720', { width: 1280, height: 720 }, 1, false],
    ['960x540', { width: 960, height: 540 }, 1, false],
    ['1024x768', { width: 1024, height: 768 }, 1, false],
    ['2560x1440', { width: 2560, height: 1440 }, 1, false],
    ['iphone_portrait', { width: 390, height: 844 }, 3, true],
    ['ipad_portrait', { width: 1024, height: 1366 }, 2, true],
    ['phone_landscape', { width: 844, height: 390 }, 3, true]
  ];
  for (const [name, vp, dpr, mobile] of sizes) {
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.9');
    await waitMode(p, 'playing'); await sleep(2800);
    await p.screenshot({ path: OUT + `/func_${name}_play.png` });
    const geo = await p.evaluate(() => {
      const R = PR.Game.renderer, w = PR.debug.world, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW;
      const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
      const b = R.baoBox(w);
      // Bao's visible body (sprite box minus its transparent margins: ~x 10..150, y 10..150 of 160)
      const bao = css(b.x + 10 * 0.8, b.y + 10 * 0.8, 120 * 0.8 * 1.0 + 8, 140 * 0.8);
      const hud = document.getElementById('hud').getBoundingClientRect();
      // score plate & zone pill, as drawHud computes them
      const I = R.ins, L = w.layout, portrait = R.VW < R.VH, K = portrait ? Math.min(R._hudK || 1, 1.3) : (R._hudK || 1);
      const x0 = I.left + 12, y0 = portrait ? Math.max(L.waterTop + 22, I.top + 10) : I.top + 10, ic = Math.round(26 * K);
      const plate = css(x0 - 4, y0 - 4, Math.round(Math.max(3 * (ic + 4) + 16, 120 * K)), Math.round(76 * K));
      const btnL = R._hudBtn ? R._hudBtn.l : R.VW - 110;
      let left = L.holeX + 60, right = btnL - 10, py = I.top + 10;
      if (portrait || right - left < 200) { left = L.holeX + 26; right = R.VW - I.right - 10; py = I.top + 74 * (R._hudK || 1); }
      const pw = Math.min(250 * K, right - left - 16), cx = (left + right) / 2;
      const pill = pw > 70 ? css(cx - pw / 2 - 8, py - 4, pw + 16, Math.round(50 * K)) : null;
      // reel meter at the shallowest and deepest hook
      const hy = w.hook.y, reel = [];
      for (const y of [L.minHookY, L.maxHookY]) { w.hook.y = y; const [rx, ry, RR] = R.reelPos(w); reel.push({ l: rx - RR - 16, t: ry - RR - 20, r: rx + RR + 16, b: ry + 44, VW: R.VW, VH: R.VH }); }
      w.hook.y = hy;
      const rod = R.rodTip(w);
      return { vw: innerWidth, vh: innerHeight, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, VW: R.VW, VH: R.VH, bao, hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width },
        plate, pill, reel, holeCss: c.left + L.holeX * k, rodCss: { x: c.left + rod[0] * k, y: c.top + rod[1] * k }, px: R.px, errors: PR.debug.stats.errors.length };
    });
    const inVp = (r, slack = 1) => r && r.l >= -slack && r.t >= -slack && r.r <= geo.vw + slack && r.b <= geo.vh + slack;
    const ov = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    check(`layout ${name}: canvas inside the viewport`, inVp(geo.canvas), { canvas: geo.canvas, VW: geo.VW, VH: geo.VH });
    check(`layout ${name}: HUD buttons visible and inside the viewport`, geo.hud.w > 0 && inVp(geo.hud), geo.hud);
    check(`layout ${name}: HUD buttons do not overlap Bao`, !ov(geo.hud, geo.bao), { hud: geo.hud, bao: geo.bao });
    check(`layout ${name}: score plate does not overlap Bao`, !ov(geo.plate, geo.bao), { plate: geo.plate, bao: geo.bao });
    check(`layout ${name}: zone pill drawn and does not overlap Bao or the HUD buttons`, geo.pill && !ov(geo.pill, geo.bao) && !ov(geo.pill, geo.hud), { pill: geo.pill });
    check(`layout ${name}: score plate and HUD buttons inside the canvas`, inVp(geo.plate) && geo.plate.l >= geo.canvas.l - 1 && geo.plate.r <= geo.canvas.r + 1);
    check(`layout ${name}: reel meter stays on screen (shallow and deep hook)`, geo.reel.every(r => r.l >= 0 && r.t >= 0 && r.r <= r.VW && r.b <= r.VH), geo.reel);
    // panels
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
      await p.evaluate(s => {
        if (s === 'scrPause') { PR.Game.mode = 'playing'; PR.Game.deadT = -1; PR.debug.world.phase = 'roam'; PR.Game.pause(); }
        else if (s === 'scrOver') PR.UI.showGameOver({ score: 1234, best: 5678, newBest: true, cleared: 3, gems: 33, gold: 2, perfect: 12, escapes: 3, snaps: 3, reached: 'Aurora Deep (dive 2)' });
        else PR.UI.show(s);
      }, scr);
      await sleep(450);   // pop animation
      const pr = await p.evaluate(s => {
        const el = document.querySelector('#' + s + ' .panel') || document.querySelector('#' + s + ' .title-wrap');
        const r = el.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#' + s + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0)
          .map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.className.split(' ').slice(-1)[0] || b.textContent.trim().slice(0, 10), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height }; });
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroll: el.scrollHeight > el.clientHeight + 2, btns };
      }, scr);
      await p.screenshot({ path: OUT + `/func_${name}_${scr}.png` });
      const offBtns = pr.btns.filter(b => !inVp(b, 1)).map(b => b.id);
      check(`layout ${name}: ${scr} panel fits the screen (no scrolling, all buttons visible)`, inVp(pr) && !pr.scroll && offBtns.length === 0, { panel: { l: pr.l | 0, t: pr.t | 0, r: pr.r | 0, b: pr.b | 0 }, scroll: pr.scroll, offBtns });
      if (mobile) {
        const small = pr.btns.filter(b => b.h < 31.5).map(b => b.id + ':' + Math.round(b.h));
        check(`layout ${name}: ${scr} buttons are finger-sized (≥32 px tall)`, small.length === 0, small);
      }
      if (scr === 'scrPause') await p.evaluate(() => PR.Game.resume());
    }
    // the reel in play: screenshot with the meter visible
    await p.evaluate(() => { PR.UI.hideAll(); PR.Game.mode = 'playing'; PR.UI.setHud(true); });
    await p.waitForFunction(() => PR.debug.world.phase === 'reel', null, { timeout: 15000 }).catch(() => {});
    await sleep(300);
    await p.screenshot({ path: OUT + `/func_${name}_reel.png` });
    check(`layout ${name}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // live resize / rotation keeps the hook and items inside the new sea
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.9');
  await waitMode(p, 'playing'); await sleep(2000);
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(800);
  const rz = await p.evaluate(() => { const w = PR.debug.world, L = w.layout, R = PR.Game.renderer; return { VW: R.VW, VH: R.VH, lw: L.width, lh: L.height, hookOk: w.hook.lost || w.hook.drop || (w.hook.y >= L.minHookY - 0.5 && w.hook.y <= L.maxHookY + 0.5), items: w.items.filter(i => i.state === 'swim' && (i.y < L.waterTop || i.y > L.floorY + 20)).length }; });
  check('layout: rotating landscape → portrait re-lays out the world (hook and swimmers inside the sea)', rz.VW === 560 && rz.lw === 560 && rz.lh === rz.VH && rz.hookOk && rz.items === 0, rz);
  await sleep(1500);
  check('layout: no errors after rotation', errs.length === 0 && await p.evaluate(() => PR.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

async function sLongRun() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=21&autostart=1&bot=1&skill=0.9&speed=16&autorestart=1');
  await waitMode(p, 'playing');
  let maxP = 0, maxFx = 0, maxLevel = 0, maxItems = 0, simT = 0, last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(500);
    const s = await p.evaluate(() => { const st = PR.debug.getState(); return { p: st.particles, fx: st.fx, level: st.level, items: st.items, time: st.time, texts: PR.Game.renderer.texts.length, games: PR.debug.stats.games }; });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxLevel = Math.max(maxLevel, s.level); maxItems = Math.max(maxItems, s.items);
    if (last && s.time < last.time) simT += last.time;   // a new game started
    last = s;
  }
  simT += last ? last.time : 0;
  const stats = await p.evaluate(() => ({ games: PR.debug.stats.games, levels: PR.debug.stats.levels, scores: PR.debug.stats.scores, gems: PR.debug.stats.gems, gold: PR.debug.stats.gold, snaps: PR.debug.stats.snaps, errors: PR.debug.stats.errors, px: PR.Game.renderer.px }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxItems, maxLevel, stats }));
  check('long run: several simulated minutes', simT > 180, { simMin: +(simT / 60).toFixed(1) });
  check('long run: zones advance (bot reaches zone 3+)', Math.max(maxLevel, ...(stats.levels.length ? stats.levels : [0])) >= 2, { maxLevel, levels: stats.levels });
  check('long run: particles bounded (< 160)', maxP < 160, maxP);
  check('long run: fx / items bounded', maxFx < 60 && maxItems < 40, { maxFx, maxItems });
  check('long run: PR.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// a phone that renders at a steady 30 fps (iOS Low Power Mode caps requestAnimationFrame at 30 Hz):
// the adaptive-resolution guard must not mistake the 33 ms vsync for an overloaded GPU and blur the game
async function sLowPower30fps() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 33.4); });
  const { page: p, errs } = await open(null, '?mute=1&seed=9&autostart=1&bot=1&skill=0.9', ctx);
  await waitMode(p, 'playing'); await sleep(1000);
  const a = await p.evaluate(() => PR.Game.renderer.px);
  await sleep(9000);
  const b = await p.evaluate(() => ({ px: PR.Game.renderer.px, cw: PR.Game.renderer.canvas.width }));
  check('low power (30 fps): render resolution is not cut at a steady 30 fps', b.px >= a * 0.99, { pxStart: +a.toFixed(2), pxAfter10s: +b.px.toFixed(2), canvasPx: b.cw, screenPx: 390 * 3 });
  check('low power (30 fps): no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const sections = { sBoot, sMenusMouseKeyboard, sMenusTouch, sInput, sTouchInput, sRules, sMuteSettings, sPictures, sLayout, sLowPower30fps, sLongRun };
  for (const [name, fn] of Object.entries(sections)) {
    if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
    console.log('\n== ' + name);
    try { await fn(); } catch (e) { check(name + ': section ran to the end', false, String(e && e.message || e).split('\n')[0]); }
  }
  await browser.close();
  console.log(`\nRESULT: ${nPass} passed, ${nFail} failed`);
  if (nFail) console.log('FAILED:\n  ' + fails.join('\n  '));
  process.exit(nFail ? 1 : 0);
})();
