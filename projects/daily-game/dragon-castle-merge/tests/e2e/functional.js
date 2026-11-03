// Functional QA suite for Ember's Glow Castle.
// Run: node tests/e2e/functional.js [sectionFilter]      (LONG_RUN_S=60 by default)
// Prints PASS/FAIL per check, screenshots in tests/out/func_*.png, exits 1 on any FAIL.
// Sections: static (exe wrapper + iOS kid-proofing) · boot · menus (mouse/keyboard) · input · touch · rules ·
// settings · pictures · layout (6 sizes × DPR 1/2/3) · long bot run at ?speed=16.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const GAME = 'file://' + path.join(ROOT, 'game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const LONG_RUN_S = +(process.env.LONG_RUN_S || 60);

let nPass = 0, nFail = 0;
const fails = [];
function fmt(v) { return typeof v === 'string' ? v : JSON.stringify(v); }
function check(name, ok, info) {
  ok = !!ok;
  if (ok) nPass++; else { nFail++; fails.push(name); }
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info !== undefined ? '  (' + fmt(info) + ')' : ''));
  return ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function open(opts, query, ctxIn) {
  const ctx = ctxIn || await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(GAME + (query || '?mute=1'));
  await page.waitForFunction(() => window.EG && EG.debug && EG.Game && EG.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = EG.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; return o.apply(this, arguments); };
    window._ev = [];   // every world event the game loop handles
    const h = G.handleEvents;
    G.handleEvents = function (evts) { for (const e of evts) { window._ev.push(Object.assign({}, e, { item: undefined })); } if (window._ev.length > 2000) window._ev.splice(0, 1000); return h.apply(this, arguments); };
  });
  return { ctx, page, errs };
}
const mode = p => p.evaluate(() => EG.Game.mode);
const ui = p => p.evaluate(() => EG.UI.current);
const starts = p => p.evaluate(() => EG.Game._starts);
const waitMode = (p, m, t) => p.waitForFunction(m => EG.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => EG.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const drops = p => p.evaluate(() => EG.debug.world.stats.drops);
const evs = (p, type) => p.evaluate(t => window._ev.filter(e => e.type === t), type);
const clearEv = p => p.evaluate(() => { window._ev.length = 0; });
// board idle and ready for the next drop
const idle = (p, t) => p.waitForFunction(() => { const w = EG.debug.world; return w && w.phase === 'aim' && !w.isBusy() && w.held; }, null, { timeout: t || 6000 }).then(() => true, () => false);
// an empty board holding a tier-1 light, no combo (input tests must never merge into a game over)
async function emptyBoard(p, held) {
  await idle(p);
  await p.evaluate(h => { const w = EG.debug.world; w.setBoard([]); w.held = { tier: h || 1, kind: 'light' }; w.combo = 0; window._ev.length = 0; }, held);
}
// css centre of column c (on the board's middle row)
const colXY = (p, c) => p.evaluate(c => {
  const L = EG.debug.world.layout, r = document.getElementById('game').getBoundingClientRect(), k = r.width / L.width;
  return [r.left + (L.boardX + (c + 0.5) * L.cell) * k, r.top + (L.boardY + L.boardH * 0.5) * k];
}, c);
async function startPlaying(p) {
  await p.evaluate(() => EG.Game.startGame());
  await waitMode(p, 'playing');
  await idle(p);
  await p.evaluate(() => { EG.Game.renderer.banner = null; });
}
// a full checkerboard of 1/2 and a held tier 3: nothing fits anywhere → the next drop is game over
async function killNow(p, score) {
  await idle(p).catch(() => {});
  await p.evaluate(score => {
    const w = EG.debug.world, cols = [];
    for (let c = 0; c < w.cols; c++) { const col = []; for (let r = 0; r < w.rows; r++) col.push(((c + r) % 2) + 1); cols.push(col); }
    w.setBoard(cols); w.held = { tier: 3, kind: 'light' };
    if (score != null) w.score = score;
    EG.Game.drop(2);
  }, score);
}

// ======================================================================= static review
async function sStatic() {
  const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
  check('static/app: fixed loopback port 127.0.0.1:47620', /net\.Listen\("tcp", "127\.0\.0\.1:47620"\)/.test(go));
  check('static/app: falls back to any free port when 47620 is taken', /net\.Listen\("tcp", "127\.0\.0\.1:0"\)/.test(go));
  check('static/app: storage in %APPDATA%\\EmbersGlowCastle\\data', /filepath\.Join\(appData, "EmbersGlowCastle"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go));
  check('static/app: binds ffStoreAll/Set/Del, ffFullscreen, ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  check('static/app: single instance mutex, WebView2-missing browser fallback', go.includes('SingleInstance') && go.includes('FileProtocolHandler'));
  const keyRe = /\^\[a-zA-Z0-9_\\-\]\{1,64\}\$/.test(go);
  const keys = ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_bg_courtyard', 'img_bg_tower', 'shape_helper'];
  check('static/app: every storage key the game writes passes the Go key filter', keyRe && keys.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k)));
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  check('static/iOS: viewport no zoom + viewport-fit=cover', /user-scalable=no/.test(html) && /maximum-scale=1/.test(html) && /viewport-fit=cover/.test(html));
  check('static/iOS: apple-mobile-web-app-capable, touch icon and manifest', /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  const icons = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'game/assets/icons', f)));
  check('static/iOS: home-screen PNG icons exist', icons);
  const css = fs.readFileSync(path.join(ROOT, 'game/css/style.css'), 'utf8');
  check('static/iOS: CSS kid-proofing (no rubber-band, no callout, no selection, no tap highlight)',
    /overscroll-behavior:none/.test(css) && /-webkit-touch-callout:none/.test(css) && /-webkit-user-select:none/.test(css) && /-webkit-tap-highlight-color:transparent/.test(css));
}

// ======================================================================= boot
async function sBoot() {
  const { page: p, errs, ctx } = await open();
  check('boot: reaches the title', await mode(p) === 'title');
  check('boot: title screen shown with Play focused', await ui(p) === 'scrTitle' && await visible(p, '#btnPlay'));
  check('boot: document title', (await p.title()) === "Ember's Glow Castle");
  await sleep(2500);
  const st = await p.evaluate(() => EG.debug.getState());
  check('boot: title demo bot is playing behind the menu', st && st.time > 1 && st.mode === 'title', { time: st && +st.time.toFixed(2), drops: st && st.stats.drops });
  check('boot: HUD hidden on title', !(await visible(p, '#hud')));
  check('boot: best score line shows a number', /^\d+$/.test(await p.textContent('#bestTitle')));
  check('boot: first-run difficulty is Easy', await p.evaluate(() => EG.Game.settings.difficulty) === 'easy');
  check('boot: Quit button hidden in the browser', !(await visible(p, '#btnQuit')));
  // kid-proofing listeners (runtime)
  const kp = await p.evaluate(() => {
    const ev = (t, target, init) => { const e = new Event(t, Object.assign({ bubbles: true, cancelable: true }, init)); (target || document).dispatchEvent(e); return e.defaultPrevented; };
    const c = document.getElementById('game');
    return { gesture: ev('gesturestart', c), ctx: ev('contextmenu', c), dbl: ev('dblclick', c), tmove: ev('touchmove', c), tmovePanel: ev('touchmove', document.querySelector('.panel')) };
  });
  check('boot: iOS gestures / context menu / double-click / touchmove on the stage are blocked', kp.gesture && kp.ctx && kp.dbl && kp.tmove, kp);
  check('boot: touchmove inside a panel is allowed (panels can scroll)', !kp.tmovePanel, kp);
  await p.screenshot({ path: OUT + '/func_title.png' });
  check('boot: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= menus
async function sMenus() {
  const { page: p, errs, ctx } = await open();
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.click(btn); const opened = await waitUi(p, scr);
    await p.click('#' + scr + ' .btn-back'); const closed = await waitUi(p, 'scrTitle'); await sleep(80);
    check(`menus/mouse: ${scr} opens and closes with its back button`, opened && closed);
  }
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.focus(btn); await p.keyboard.press('Enter'); const opened = await waitUi(p, scr);
    await p.keyboard.press('Escape'); const esc = await waitUi(p, 'scrTitle');
    await sleep(60);
    await p.focus(btn); await p.keyboard.press('Space'); const opened2 = await waitUi(p, scr);
    await sleep(80); await p.keyboard.press('Enter'); const enter = await waitUi(p, 'scrTitle');
    await sleep(80);   // UI.show() focuses Play 30 ms later: let it, so it does not steal the focus we set next
    check(`menus/keyboard: ${scr} Enter-open, Esc-close, Space-open, Enter-close (focused back button)`, opened && esc && opened2 && enter, { opened, esc, opened2, enter });
  }
  await sleep(60);
  check('menus/keyboard: still on the title, no game started', await mode(p) === 'title' && await starts(p) === 0);
  // focused Play + Space must start exactly one game (keydown handler + keyup button click = double start)
  await p.focus('#btnPlay'); await p.keyboard.press('Space'); await waitMode(p, 'playing'); await sleep(300);
  check('menus/keyboard: Space with Play focused starts exactly one game', await starts(p) === 1, { starts: await starts(p) });
  check('menus/keyboard: focus left the Play button after start', await p.evaluate(() => document.activeElement === document.body || document.activeElement === null));
  await p.evaluate(() => EG.Game.toTitle()); await sleep(100);
  await p.focus('#btnPlay'); await p.keyboard.press('Enter'); await waitMode(p, 'playing'); await sleep(300);
  check('menus/keyboard: Enter with Play focused starts exactly one game', await starts(p) === 2);
  // Space on the title with no button focused also starts
  await p.evaluate(() => EG.Game.toTitle()); await sleep(100);
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('Space'); const sp = await waitMode(p, 'playing'); await sleep(200);
  check('menus/keyboard: Space on the title (nothing focused) starts one game', sp && await starts(p) === 3);
  await idle(p);
  // ---- pause
  await p.keyboard.press('Escape'); const pz1 = await waitMode(p, 'paused'); const pzUi = await ui(p);
  check('menus/pause: HUD hidden while paused', !(await visible(p, '#hud')));
  await p.keyboard.press('Escape'); const r1 = await waitMode(p, 'playing');
  check('menus/pause: Esc pauses and Esc resumes', pz1 && pzUi === 'scrPause' && r1);
  await p.keyboard.press('p'); const pz2 = await waitMode(p, 'paused');
  await p.keyboard.press('p'); const r2 = await waitMode(p, 'playing');
  check('menus/pause: P pauses and P resumes', pz2 && r2);
  const t0 = await p.evaluate(() => EG.debug.world.time);
  await p.keyboard.press('Escape'); await waitMode(p, 'paused'); await sleep(500);
  const t1 = await p.evaluate(() => EG.debug.world.time);
  check('menus/pause: the world clock stops while paused', Math.abs(t1 - t0) < 0.1, { dt: +(t1 - t0).toFixed(3) });
  await p.click('#btnResume'); const r3 = await waitMode(p, 'playing');
  await p.click('#btnPause'); const pz3 = await waitMode(p, 'paused');
  check('menus/pause: HUD pause button + Resume button (mouse)', pz3 && r3);
  await sleep(80); const d0 = await drops(p);
  await p.keyboard.press('Space'); const r5 = await waitMode(p, 'playing'); await sleep(400);
  check('menus/pause: Space on the focused Resume button resumes without dropping a light', r5 && await drops(p) === d0, { drops: (await drops(p)) - d0 });
  await p.keyboard.press('Escape'); await waitMode(p, 'paused'); await sleep(80);
  await p.keyboard.press('Enter'); const r4 = await waitMode(p, 'playing'); await sleep(300);
  check('menus/pause: Enter on the focused Resume resumes without dropping a light', r4 && await drops(p) === d0);
  await p.keyboard.press('Escape'); await waitMode(p, 'paused');
  await p.click('#btnPauseSettings'); const s1 = await waitUi(p, 'scrSettings');
  await p.keyboard.press('Escape'); const s2 = await waitUi(p, 'scrPause');
  await p.click('#btnPauseSettings'); await waitUi(p, 'scrSettings');
  await p.click('#scrSettings .btn-back'); const s3 = await waitUi(p, 'scrPause');
  check('menus/pause: Settings from Pause; Esc and Done return to Pause (still paused)', s1 && s2 && s3 && await mode(p) === 'paused');
  await p.keyboard.press('Escape'); const r6 = await waitMode(p, 'playing');
  check('menus/pause: Esc on Pause after visiting Settings resumes', r6);
  await p.keyboard.press('Escape'); await waitMode(p, 'paused');
  const sR = await starts(p);
  await p.click('#btnRestart'); const rs = await waitMode(p, 'playing');
  check('menus/pause: Restart starts a fresh game', rs && await starts(p) === sR + 1 && await p.evaluate(() => EG.debug.world.time < 2 && EG.debug.world.stats.drops === 0));
  await p.keyboard.press('Escape'); await waitMode(p, 'paused');
  await p.click('#btnPauseMenu'); const mm = await waitMode(p, 'title');
  check('menus/pause: Main Menu returns to the title', mm && await ui(p) === 'scrTitle');
  // ---- game over
  await startPlaying(p);
  await killNow(p);
  await sleep(150);
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('menus/over: Esc / blur during the death pause do not pause', await mode(p) === 'playing' && await p.evaluate(() => EG.debug.world.phase) === 'over');
  const over = await waitMode(p, 'over', 6000);
  check('menus/over: game over screen appears (~1.6 s after the last drop)', over && await ui(p) === 'scrOver');
  await p.screenshot({ path: OUT + '/func_over.png' });
  await p.keyboard.press('Escape'); await sleep(100);
  check('menus/over: Esc on game over does nothing harmful', await mode(p) === 'over' && await ui(p) === 'scrOver');
  await sleep(800);
  await p.click('#btnOverMenu'); const om = await waitMode(p, 'title');
  check('menus/over: Menu returns to the title', om);
  await startPlaying(p); await killNow(p); await waitMode(p, 'over', 6000); await sleep(800);
  const s0 = await starts(p);
  await p.click('#btnAgain'); const ag = await waitMode(p, 'playing'); await sleep(200);
  check('menus/over: Play Again (mouse) starts exactly one game', ag && await starts(p) === s0 + 1);
  for (const key of ['Enter', 'Space']) {
    await idle(p); await killNow(p); await waitMode(p, 'over', 6000);
    const sA = await starts(p);
    await p.keyboard.press(key); await sleep(150);
    const locked = await mode(p) === 'over';
    await sleep(800);
    await p.keyboard.press(key); const again = await waitMode(p, 'playing'); await sleep(300);
    const sB = await starts(p);
    check(`menus/over: ${key} is ignored for 0.7 s, then restarts exactly once`, locked && again && sB === sA + 1, { locked, again, starts: sB - sA });
    check(`menus/over: ${key} restart does not drop a light`, await drops(p) === 0);
  }
  await idle(p); await killNow(p); await waitMode(p, 'over', 6000);
  const sC = await starts(p);
  // raw mouse clicks at the button centres (p.click() waits for the pop animation to settle, which can outlast the lock)
  for (const id of ['btnAgain', 'btnOverMenu']) {
    const c = await p.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, id);
    await p.mouse.click(c[0], c[1]);
  }
  await sleep(120);
  const lockAge = await p.evaluate(() => performance.now() - EG.Game.overAt);
  check('menus/over: Play Again / Menu clicks within 0.7 s are ignored (restart lock)', await mode(p) === 'over' && await starts(p) === sC, { msSinceOver: Math.round(lockAge) });
  check('menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= input (mouse + keyboard)
async function sInput() {
  const { page: p, errs, ctx } = await open();
  await startPlaying(p);
  // mouse move aims
  await emptyBoard(p);
  for (const c of [3, 0, 4]) {
    const [x, y] = await colXY(p, c); await p.mouse.move(x, y); await sleep(80);
    check(`input/mouse: moving over column ${c + 1} aims Ember there`, await p.evaluate(() => EG.debug.world.ember.targetCol) === c);
  }
  // mouse move above the board (where Ember flies) also aims
  const ab = await p.evaluate(() => { const L = EG.debug.world.layout, r = document.getElementById('game').getBoundingClientRect(), k = r.width / L.width; return [r.left + (L.boardX + 1.5 * L.cell) * k, r.top + L.emberY * k]; });
  await p.mouse.move(ab[0], ab[1]); await sleep(80);
  check('input/mouse: moving in Ember\'s flight strip aims too', await p.evaluate(() => EG.debug.world.ember.targetCol) === 1);
  await sleep(400);
  const ember = await p.evaluate(() => { const w = EG.debug.world; return Math.abs(w.ember.x - w.colX(1)); });
  check('input/mouse: Ember flies to the aimed column (within 2 px after 0.4 s)', ember < 2, { off: +ember.toFixed(2) });
  for (const c of [1, 4, 0]) {
    await emptyBoard(p);
    const [x, y] = await colXY(p, c); await p.mouse.click(x, y); await sleep(500);
    const d = await evs(p, 'drop');
    check(`input/mouse: click on column ${c + 1} drops exactly one light there`, d.length === 1 && d[0].col === c, d.map(e => e.col));
  }
  // right button does nothing
  await emptyBoard(p);
  { const [x, y] = await colXY(p, 2); await p.mouse.click(x, y, { button: 'right' }); await sleep(400); }
  check('input/mouse: right click does not drop', (await evs(p, 'drop')).length === 0);
  // a click outside the board (side area) drops into the nearest column (clamped)
  await emptyBoard(p);
  { const r = await p.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return [c.left + 30, c.top + c.height * 0.7]; }); await p.mouse.click(r[0], r[1]); await sleep(500); }
  { const d = await evs(p, 'drop'); check('input/mouse: click left of the board drops into column 1 (clamped)', d.length === 1 && d[0].col === 0, d); }
  // move mouse out of the way so pointermove does not re-aim during keyboard tests
  await p.mouse.move(2, 2);
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  // keyboard aim
  await emptyBoard(p);
  await p.evaluate(() => EG.debug.aim(2)); await sleep(300);
  const seq = [['ArrowLeft', 1], ['a', 0], ['ArrowLeft', 0], ['d', 1], ['ArrowRight', 2], ['D', 3], ['ArrowRight', 4], ['ArrowRight', 4], ['A', 3]];
  const got = [];
  for (const [k] of seq) { await p.keyboard.press(k); await sleep(60); got.push(await p.evaluate(() => EG.debug.world.ember.targetCol)); }
  check('input/keys: ←/→/A/D move Ember one column and clamp at the edges', got.join() === seq.map(s => s[1]).join(), got);
  for (const k of ['Space', 'ArrowDown', 'Enter', 's']) {
    await emptyBoard(p);
    await p.evaluate(() => EG.debug.aim(3)); await sleep(250);
    await p.keyboard.press(k); await sleep(500);
    const d = await evs(p, 'drop');
    check(`input/keys: ${k} drops exactly one light into the aimed column`, d.length === 1 && d[0].col === 3, d.map(e => e.col));
  }
  for (const n of [1, 2, 3, 4, 5]) {
    await emptyBoard(p);
    await p.keyboard.press(String(n)); await sleep(500);
    const d = await evs(p, 'drop');
    check(`input/keys: digit ${n} drops straight into column ${n}`, d.length === 1 && d[0].col === n - 1, d.map(e => e.col));
  }
  await emptyBoard(p);
  await p.keyboard.press('6'); await p.keyboard.press('0'); await sleep(300);
  check('input/keys: digits 6 and 0 do nothing (5 columns)', (await evs(p, 'drop')).length === 0);
  // auto-repeat: holding Space gives one drop
  await emptyBoard(p);
  await p.keyboard.down('Space'); for (let i = 0; i < 6; i++) { await sleep(30); await p.keyboard.down('Space'); } await p.keyboard.up('Space');
  await sleep(700);
  check('input/keys: holding Space (auto-repeat) drops once', (await evs(p, 'drop')).length === 1, (await evs(p, 'drop')).length);
  // aim during the drop flight is applied after the release
  await emptyBoard(p);
  await p.evaluate(() => EG.debug.aim(0)); await sleep(300);
  await p.keyboard.press('5'); await p.keyboard.press('ArrowLeft'); await sleep(600);
  { const s = await p.evaluate(() => ({ t: EG.debug.world.ember.targetCol, d: window._ev.filter(e => e.type === 'drop').map(e => e.col) }));
    check('input/keys: ← during the flight to column 5 still drops in 5, then aims at 4', s.d.join() === '4' && s.t === 3, s); }
  // a drop while the board is busy is buffered (one), not lost and not doubled
  await emptyBoard(p);
  await p.keyboard.press('1'); await sleep(60); await p.keyboard.press('3'); await p.keyboard.press('4'); await sleep(1500);
  { const d = (await evs(p, 'drop')).map(e => e.col); check('input/keys: drops pressed while busy → only the latest is buffered (1 then 4)', d.join() === '0,3', d); }
  // ---- HUD buttons never drop a light
  await emptyBoard(p);
  const m0 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  await p.click('#btnMuteHud'); await sleep(400);
  const m1 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  check('input/HUD: clicking Mute toggles sound and never drops', m0 !== m1 && (await evs(p, 'drop')).length === 0, { m0, m1 });
  const aimBefore = await p.evaluate(() => EG.debug.world.ember.targetCol);
  const hb = await p.evaluate(() => { const r = document.getElementById('btnMuteHud').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await p.mouse.move(hb[0] - 3, hb[1]); await p.mouse.move(hb[0] + 3, hb[1]); await sleep(100);
  check('input/HUD: moving the mouse over the HUD buttons does not re-aim', await p.evaluate(() => EG.debug.world.ember.targetCol) === aimBefore);
  // focus is now on the Mute button: Space must drop, not press Mute again
  await p.keyboard.press('Space'); await sleep(500);
  const m2 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  check('input/HUD: Space after clicking Mute drops one light and does not toggle Mute again', (await evs(p, 'drop')).length === 1 && m2 === m1, { drops: (await evs(p, 'drop')).length, toggledAgain: m2 !== m1 });
  await emptyBoard(p);
  await p.click('#btnMuteHud'); await sleep(150);
  await p.keyboard.press('Enter'); await sleep(500);
  const m3 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  check('input/HUD: Enter after clicking Mute drops one light and does not toggle Mute again', (await evs(p, 'drop')).length === 1 && m3 === m0, { drops: (await evs(p, 'drop')).length, m3 });
  await emptyBoard(p);
  await p.click('#btnPause'); await waitMode(p, 'paused'); await sleep(200);
  check('input/HUD: clicking Pause pauses and never drops', (await evs(p, 'drop')).length === 0);
  await p.click('#btnResume'); await waitMode(p, 'playing'); await sleep(300);
  check('input/HUD: clicking Resume does not drop', (await evs(p, 'drop')).length === 0);
  // M key
  const mk0 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  await p.keyboard.press('m'); await sleep(50);
  const mk1 = await p.evaluate(() => ({ m: EG.Game.settings.muted || EG.Game.urlMute, icon: document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6') }));
  await p.keyboard.press('m');
  check('input/keys: M toggles sound in game and the HUD icon follows', mk1.m !== mk0 && mk1.icon === mk1.m && await mode(p) === 'playing', mk1);
  // ---- blur / hidden pause
  await emptyBoard(p);
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(80);
  check('input: window blur auto-pauses', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  await p.keyboard.press('Escape'); await waitMode(p, 'playing');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const vh = await mode(p);
  await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  check('input: page hidden (visibilitychange) pauses', vh === 'paused');
  await p.keyboard.press('Escape'); await waitMode(p, 'playing');
  // blur while a mouse button is held: no drop on the later release
  await emptyBoard(p);
  { const [x, y] = await colXY(p, 1); await p.mouse.move(x, y); await p.mouse.down();
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(50); await p.mouse.up(); await sleep(300); }
  check('input: a press interrupted by blur does not drop when released (paused)', (await evs(p, 'drop')).length === 0 && await mode(p) === 'paused');
  await p.keyboard.press('Escape'); await waitMode(p, 'playing');
  // bot mode: player input ignored
  await emptyBoard(p);
  check('input: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= touch
async function sTouch() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  check('touch: game detects a touch device (body.touch, keyboard hints hidden)', await p.evaluate(() => EG.Game.isTouch && document.body.classList.contains('touch')) && !(await visible(p, '#scrHow .kb-only')));
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.tap(btn); const opened = await waitUi(p, scr);
    await sleep(700); const still = await ui(p) === scr;
    await p.tap('#' + scr + ' .btn-back'); const closed = await waitUi(p, 'scrTitle');
    check(`touch/menus: ${scr} opens (survives the ghost click) and closes by tap`, opened && still && closed, { opened, still, closed });
    await sleep(700);
  }
  await p.tap('#btnPlay'); const pl = await waitMode(p, 'playing'); await sleep(400);
  check('touch/menus: tap Play starts exactly one game', pl && await starts(p) === 1);
  await idle(p); await p.evaluate(() => { EG.Game.renderer.banner = null; });
  // tap a column
  for (const c of [0, 3]) {
    await emptyBoard(p);
    const [x, y] = await colXY(p, c); await p.touchscreen.tap(x, y); await sleep(600);
    const d = await evs(p, 'drop');
    check(`touch: tap on column ${c + 1} drops exactly one light there`, d.length === 1 && d[0].col === c, d.map(e => e.col));
    await sleep(350);
  }
  // slide then lift (CDP touch)
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id || 1 })) });
  await emptyBoard(p);
  { const [x0, y] = await colXY(p, 0), [x2] = await colXY(p, 2), [x4] = await colXY(p, 4);
    await touch('touchStart', [[x0, y]]); await sleep(80);
    const a0 = await p.evaluate(() => EG.debug.world.ember.targetCol);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[x0 + (x2 - x0) * i / 8, y]]); await sleep(16); }
    const a2 = await p.evaluate(() => EG.debug.world.ember.targetCol);
    const d2 = (await evs(p, 'drop')).length;
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[x2 + (x4 - x2) * i / 8, y]]); await sleep(16); }
    await touch('touchEnd', []); await sleep(600);
    const d = await evs(p, 'drop');
    check('touch: finger down aims, sliding moves Ember (no drop while sliding), lifting drops in the last column', a0 === 0 && a2 === 2 && d2 === 0 && d.length === 1 && d[0].col === 4, { a0, a2, d2, drops: d.map(e => e.col) });
  }
  // a touch that starts on the HUD and slides onto the board must not drop
  await emptyBoard(p); await sleep(350);
  const hb = await p.evaluate(() => { const r = document.getElementById('btnMuteHud').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  { const [x, y] = await colXY(p, 2);
    await touch('touchStart', [[hb[0], hb[1]]]); await sleep(50);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[hb[0] + (x - hb[0]) * i / 6, hb[1] + (y - hb[1]) * i / 6]]); await sleep(16); }
    await touch('touchEnd', []); await sleep(500); }
  check('touch/HUD: a finger that starts on the Mute button and slides onto the board neither drops nor mutes', (await evs(p, 'drop')).length === 0);
  // HUD taps
  await emptyBoard(p); await sleep(400);
  const m0 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  await p.tap('#btnMuteHud'); await sleep(400);
  const m1 = await p.evaluate(() => EG.Game.settings.muted || EG.Game.urlMute);
  check('touch/HUD: tapping Mute toggles sound and does not drop', m0 !== m1 && (await evs(p, 'drop')).length === 0, { m0, m1, drops: (await evs(p, 'drop')).length });
  await sleep(400);
  await p.tap('#btnPause'); const pz = await waitMode(p, 'paused'); await sleep(700);
  check('touch/HUD: tapping Pause pauses and does not drop', pz && (await evs(p, 'drop')).length === 0);
  await p.tap('#btnResume'); const rs = await waitMode(p, 'playing'); await sleep(500);
  check('touch/menus: tap Resume resumes, no drop', rs && (await evs(p, 'drop')).length === 0);
  // second finger on Pause while the first is on the board
  await emptyBoard(p); await sleep(300);
  const pb = await p.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  { const [x, y] = await colXY(p, 1);
    await touch('touchStart', [[x, y, 1]]); await sleep(100);
    await touch('touchStart', [[x, y, 1], [pb[0], pb[1], 2]]); await sleep(60);
    await touch('touchEnd', [[pb[0], pb[1], 2]]); await sleep(150);
    const pm = await mode(p);
    await touch('touchEnd', []); await sleep(400);
    check('touch: tapping Pause with a second finger while one is on the board pauses; lifting the first does not drop', pm === 'paused' && (await evs(p, 'drop')).length === 0, { pm, drops: (await evs(p, 'drop')).length }); }
  await sleep(700); await p.tap('#btnResume'); await waitMode(p, 'playing');
  await idle(p); await killNow(p); await waitMode(p, 'over', 6000); await sleep(800);
  await p.tap('#btnAgain'); const ag = await waitMode(p, 'playing'); await sleep(500);
  check('touch/over: tap Play Again restarts (one start, no drop from the tap)', ag && await drops(p) === 0);
  await idle(p); await killNow(p); await waitMode(p, 'over', 6000); await sleep(800);
  await p.tap('#btnOverMenu'); const om = await waitMode(p, 'title');
  check('touch/over: tap Menu returns to the title', om);
  check('touch: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= rules
async function sRules() {
  const { page: p, errs, ctx } = await open();
  await startPlaying(p);
  const pts = await p.evaluate(() => ({ t2: EG.World.points(2, 2, 0), t3g3: EG.World.points(3, 3, 0), t3c1: EG.World.points(3, 2, 1), t5: EG.World.points(5, 2, 0) }));
  check('rules: points formula 5·2^(t−1)·(1+0.5(g−2))·(1+0.1·combo)', pts.t2 === 10 && pts.t3g3 === 30 && pts.t3c1 === 22 && pts.t5 === 80, pts);
  // two tier 1 → tier 2, +10
  await emptyBoard(p);
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1]]); w.held = { tier: 1, kind: 'light' }; w.score = 0; w.combo = 0; window._ev.length = 0; EG.Game.drop(0); });
  await idle(p);
  let s = await p.evaluate(() => { const w = EG.debug.world; return { score: w.score, board: w.getState().board, combo: w.combo, merges: window._ev.filter(e => e.type === 'merge').map(e => [e.tier, e.count, e.points]) }; });
  check('rules: dropping a firefly on a firefly merges into tier 2 and scores +10', s.score === 10 && JSON.stringify(s.board[0]) === '[2]' && s.merges.length === 1 && s.merges[0][0] === 2 && s.combo === 1, s);
  // group of 3 (horizontal chain) → tier 3, +30 × combo 1 = 33
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[2], [2]]); w.held = { tier: 2, kind: 'light' }; w.score = 0; window._ev.length = 0; EG.Game.drop(2); });
  await idle(p);
  s = await p.evaluate(() => { const w = EG.debug.world; return { score: w.score, board: w.getState().board, combo: w.combo, merges: window._ev.filter(e => e.type === 'merge').map(e => [e.tier, e.count, e.points]) }; });
  check('rules: 3 touching tier 2 → one tier 3 at the landing cell, 30 × 1.1 (combo 1) = 33', s.score === 33 && JSON.stringify(s.board) === '[[],[],[3],[],[]]' && s.merges[0][1] === 3 && s.combo === 2, s);
  // cascade: tier1 lands on [2,1]... column [2] with held 1 on col 1 next to [1] → 2, then next to the 2 → 3
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[2], [1]]); w.held = { tier: 1, kind: 'light' }; w.score = 0; w.combo = 0; window._ev.length = 0; EG.Game.drop(1); });
  await idle(p);
  s = await p.evaluate(() => { const w = EG.debug.world; return { score: w.score, board: w.getState().board, combo: w.combo, merges: window._ev.filter(e => e.type === 'merge').map(e => [e.tier, e.points, e.cascade]) }; });
  check('rules: cascade 1+1 → 2, then 2+2 → 3 (scores 10 + 22, combo 2)', s.merges.length === 2 && s.score === 32 && s.combo === 2 && JSON.stringify(s.board[0].concat(s.board[1])) === '[3]', s);
  // no-merge drop resets combo
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[3]]); w.held = { tier: 1, kind: 'light' }; w.combo = 4; window._ev.length = 0; EG.Game.drop(4); });
  await idle(p);
  s = await p.evaluate(() => ({ combo: EG.debug.world.combo, br: window._ev.filter(e => e.type === 'comboBreak').length }));
  check('rules: a drop with no merge resets the combo (comboBreak event)', s.combo === 0 && s.br === 1, s);
  // combo 5 → Boo
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1], [], [1, 1], [], [1]]); w.held = { tier: 1, kind: 'light' }; w.combo = 4; window._ev.length = 0; EG.Game.drop(0); });
  await idle(p, 10000);
  s = await p.evaluate(() => ({ helper: window._ev.filter(e => e.type === 'helper').length, carried: window._ev.filter(e => e.type === 'helperCarry').length, boos: EG.debug.world.stats.boos, board: EG.debug.world.getState().board }));
  check('rules: reaching combo 5 calls Boo, who carries small lights away', s.helper === 1 && s.carried >= 1 && s.boos >= 1, s);
  // refuse on a full column
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1, 2, 1, 2, 1, 2, 1]]); w.held = { tier: 3, kind: 'light' }; w.score = 0; w.combo = 0; window._ev.length = 0; EG.Game.drop(0); });
  await sleep(300);
  s = await p.evaluate(() => { const w = EG.debug.world; return { refuse: window._ev.filter(e => e.type === 'refuse').map(e => e.col), drops: window._ev.filter(e => e.type === 'drop').length, anim: w.ember.anim, refused: w.stats.refused, held: w.held, h: w.getState().heights, phase: w.phase }; });
  check('rules: a full column refuses the light (refuse event, Ember "oops", nothing dropped, still holding tier 3)', s.refuse.join() === '0' && s.drops === 0 && s.anim === 'oops' && s.held.tier === 3 && s.h[0] === 7 && s.phase === 'aim', s);
  await idle(p);
  // full column whose top matches: accepted and merges
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1, 2, 1, 2, 1, 2, 3]]); w.held = { tier: 3, kind: 'light' }; w.score = 0; w.combo = 0; window._ev.length = 0; EG.Game.drop(0); });
  await idle(p);
  s = await p.evaluate(() => { const w = EG.debug.world; return { refuse: window._ev.filter(e => e.type === 'refuse').length, merges: window._ev.filter(e => e.type === 'merge').map(e => e.tier), col: w.getState().board[0] }; });
  check('rules: a full column whose top light matches still takes it and merges', s.refuse === 0 && s.merges[0] === 4 && s.col.length === 7 && s.col[6] === 4, s);
  // goal via a real merge: 4+4 → candle = goal of the Courtyard
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1, 4], [2]]); w.held = { tier: 4, kind: 'light' }; w.score = 0; w.combo = 0; window._ev.length = 0; EG.Game.drop(1); });
  await p.waitForFunction(() => EG.debug.world.level === 1, null, { timeout: 8000 }).catch(() => {});
  await sleep(150);
  s = await p.evaluate(() => { const w = EG.debug.world, R = EG.Game.renderer; return { level: w.level, zone: w.zone, goalTier: w.goalTier, score: w.score, goal: window._ev.filter(e => e.type === 'goal').map(e => [e.tier, e.bonus]), lv: window._ev.filter(e => e.type === 'levelUp').map(e => e.zone), vis: R.vis.cur, board: w.getState().board }; });
  check('rules: making the candle (goal) floats it away: +80 merge +100 bonus, level 1 (Crystal Cellar), goal → lantern', s.level === 1 && s.zone === 1 && s.goalTier === 6 && s.score === 180 && s.goal.length === 1 && s.goal[0][1] === 100 && s.lv.join() === '1' && s.vis === 1, s);
  check('rules: level-up tidy-up removes tier-1 lights, keeps the rest', JSON.stringify(s.board) === '[[],[2],[],[],[]]', s.board);
  await p.screenshot({ path: OUT + '/func_level1.png' });
  // gotoLevel
  for (const lv of [2, 3, 4]) {
    await p.evaluate(l => EG.debug.gotoLevel(l), lv); await sleep(200);
    s = await p.evaluate(() => { const w = EG.debug.world; return { level: w.level, zone: w.zone, loop: w.loop, goalTier: w.goalTier, vis: EG.Game.renderer.vis.cur, empty: w.getState().heights.every(h => h === 0), phase: w.phase }; });
    const goal = [0, 0, 7, 8, 8][lv];
    check(`rules: gotoLevel(${lv}) → zone ${lv % 4}, loop ${lv >> 2}, goal tier ${goal}, visuals follow, board cleared`, s.level === lv && s.zone === lv % 4 && s.loop === (lv >> 2) && s.goalTier === goal && s.vis === lv % 4 && s.empty && s.phase === 'aim', s);
  }
  await p.evaluate(() => EG.debug.gotoLevel(0)); await idle(p);
  // game over + best per difficulty (Easy is the first-run default)
  await killNow(p, 135);
  await sleep(100);
  check('rules: no column can take the light → phase over', await p.evaluate(() => EG.debug.world.phase) === 'over');
  await waitMode(p, 'over', 5000);
  let ov = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: localStorage.getItem('egc:best_easy') }));
  check('rules: game over shows score 135, best 135, NEW!, saved as best_easy', ov.score === '135' && ov.best === '135' && ov.nb && ov.stored === '135', ov);
  check('rules: the game is recorded in EG.debug.stats', await p.evaluate(() => EG.debug.stats.games === 1 && EG.debug.stats.scores[0] === 135));
  await sleep(800); await p.keyboard.press('Enter'); await waitMode(p, 'playing'); await idle(p);
  await killNow(p, 40); await waitMode(p, 'over', 5000);
  ov = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: localStorage.getItem('egc:best_easy') }));
  check('rules: a lower score keeps the best and shows no NEW!', ov.score === '40' && ov.best === '135' && !ov.nb && ov.stored === '135', ov);
  await sleep(800); await p.click('#btnOverMenu'); await waitMode(p, 'title');
  check('rules: title shows the best for the current difficulty (easy 135)', (await p.textContent('#bestTitle')) === '135');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#setDifficulty button[data-v=hard]');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  const hb = await p.textContent('#bestTitle');
  await startPlaying(p);
  const hd = await p.evaluate(() => ({ d: EG.debug.world.difficulty, rows: EG.debug.world.rows }));
  await killNow(p, 60); await waitMode(p, 'over', 5000);
  const es = await p.evaluate(() => ({ easy: localStorage.getItem('egc:best_easy'), hard: localStorage.getItem('egc:best_hard') }));
  check('rules: Hard has its own best (title 0, 6 rows, saved separately)', hb === '0' && hd.d === 'hard' && hd.rows === 6 && es.easy === '135' && es.hard === '60', { hb, hd, es });
  await sleep(800); await p.click('#btnOverMenu'); await waitMode(p, 'title');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest'); const armed = await p.evaluate(() => [localStorage.getItem('egc:best_easy'), document.getElementById('btnResetBest').textContent]);
  await p.click('#btnResetBest'); const cleared = await p.evaluate(() => [localStorage.getItem('egc:best_easy'), localStorage.getItem('egc:best_hard')]);
  check('settings: Reset best asks "Sure?" first and clears all bests on the second tap', armed[0] === '135' && armed[1] === 'Sure?' && cleared[0] === null && cleared[1] === null, { armed, cleared });
  check('rules: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= settings persistence & test flags
async function sSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let o = await open(null, '?mute=1', ctx), p = o.page;
  const st = () => p.evaluate(() => ({ s: JSON.parse(localStorage.getItem('egc:settings') || 'null'), g: Object.assign({}, EG.Game.settings), url: EG.Game.urlMute }));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx) .tog');
  let a = await st();
  check('settings: ?mute=1 starts muted but muted is not written into settings', a.url === true && a.s && a.s.muted === false && a.s.sfx === false, a);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('m'); a = await st();
  check('settings: M under ?mute=1 turns sound on without saving', a.url === false && !a.g.muted && a.s.muted === false, a);
  await p.keyboard.press('m'); a = await st();
  check('settings: M again mutes and saves muted=true (a real choice)', a.g.muted === true && a.s.muted === true, a);
  await p.keyboard.press('m'); a = await st();
  check('settings: M again unmutes and saves', a.g.muted === false && a.s.muted === false, a);
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setMusic) .tog');
  await p.click('#setDifficulty button[data-v=normal]');
  await p.click('#scrSettings .btn-back');
  await p.close();
  o = await open(null, '?seed=2', ctx); p = o.page;
  a = await st();
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  const dom = await p.evaluate(() => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, diff: document.querySelector('#setDifficulty button.on') && document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: sfx, music and difficulty persist across reload (state + controls)', a.g.sfx === false && a.g.music === false && a.g.difficulty === 'normal' && !a.g.muted && !a.url && dom.sfx === false && dom.music === false && dom.diff === 'normal', { g: a.g, dom });
  check('settings: audio options follow the saved settings', await p.evaluate(() => EG.Audio.sfxOn === false && EG.Audio.musicOn === false && EG.Audio.muted === false));
  await p.keyboard.press('Escape');
  await startPlaying(p);
  check('settings: the saved difficulty is used by the next game', await p.evaluate(() => EG.debug.world.difficulty === 'normal'));
  await p.close();
  // ?diff= flag never saved, but used
  o = await open(null, '?mute=1&diff=hard', ctx); p = o.page;
  await startPlaying(p);
  const fd = await p.evaluate(() => ({ d: EG.debug.world.difficulty, rows: EG.debug.world.rows }));
  await p.evaluate(() => EG.Game.toTitle());
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings'); await p.click('label.set:has(#setSfx) .tog');
  const sd = await p.evaluate(() => JSON.parse(localStorage.getItem('egc:settings')));
  check('settings: ?diff=hard is used for the game but never saved', fd.d === 'hard' && fd.rows === 6 && sd.difficulty === 'normal' && sd.muted === false, { fd, sd });
  const shown = await p.evaluate(() => document.querySelector('#setDifficulty button.on').dataset.v);
  console.log('      note: with ?diff=hard the Settings screen highlights "' + shown + '" (the saved value) while games run on hard');
  // restore
  await p.click('label.set:has(#setMusic) .tog'); await p.click('#setDifficulty button[data-v=easy]');
  // other test flags are never written either
  const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('egc:')));
  check('settings: only egc: keys settings/best_* exist (no speed/bot/seed saved)', keys.every(k => /^egc:(settings|best_\w+)$/.test(k)), keys);
  check('settings: no console errors', o.errs.length === 0, o.errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= Change Pictures
async function sPictures() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=4');
  const mk = await p.evaluate(async () => {
    const out = {};
    const enc = (c, type, q) => new Promise(r => c.toBlob(b => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }, type, q));
    let c = document.createElement('canvas'); c.width = 300; c.height = 240; let g = c.getContext('2d');
    g.fillStyle = '#e33'; g.beginPath(); g.arc(150, 120, 90, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(120, 90, 60, 60);
    out.png = await enc(c, 'image/png');
    c = document.createElement('canvas'); c.width = 640; c.height = 480; g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#fd5'); g.fillStyle = gr; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#933'; g.beginPath(); g.arc(320, 240, 140, 0, 7); g.fill();
    out.opaque = await enc(c, 'image/png');
    c = document.createElement('canvas'); c.width = 4000; c.height = 3000; g = c.getContext('2d');
    const g2 = g.createLinearGradient(0, 0, 4000, 3000); g2.addColorStop(0, '#147'); g2.addColorStop(0.5, '#6cf'); g2.addColorStop(1, '#fe9'); g.fillStyle = g2; g.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${i * 37 % 360},70%,60%)`; g.beginPath(); g.arc((i * 911) % 4000, (i * 577) % 3000, 40 + i % 90, 0, 7); g.fill(); }
    out.huge = await enc(c, 'image/png');
    return out;
  });
  const files = {
    png: { name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(mk.png, 'base64') },
    opaque: { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(mk.opaque, 'base64') },
    huge: { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.from(mk.huge, 'base64') },
    txt: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') },
    broken: { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png') }
  };
  const slotIndex = { hero: 0, item: 1, helper: 2, bg_courtyard: 3, bg_cellar: 4, bg_library: 5, bg_tower: 6 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  check('pictures: 7 slots (hero, light, Boo, 4 places)', await p.evaluate(() => document.querySelectorAll('#slotGrid .slot').length) === 7);
  async function pick(slot, file) {
    await p.evaluate(() => { const t = document.getElementById('toast'); t.classList.add('hidden'); t.textContent = ''; });
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && t.textContent && !/Saving/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('egc:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('egc:shape_' + slot) };
  }, slot);
  let toast = await pick('hero', files.png), s = await stored('hero');
  check('pictures: PNG with transparency → Ember, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit' && await p.evaluate(() => EG.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('item', files.opaque); s = await stored('item');
  check('pictures: opaque picture → Light, becomes a round sticker', /saved/i.test(toast) && s && s.shape === 'circle' && await p.evaluate(() => EG.Assets.custom.item.width === 512), { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(2) .tag');
  check('pictures: the card shows "Your picture" and Round is selected', /Your picture/.test(tag) && await p.evaluate(() => document.querySelector('#slotGrid .slot:nth-child(2) .shape button.on').dataset.shape === 'circle'));
  toast = await pick('helper', files.txt); s = await stored('helper');
  check('pictures: a text file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('helper', files.broken); s = await stored('helper');
  check('pictures: a broken "PNG" → friendly error toast, nothing stored', /could not be opened/i.test(toast) && s === null, toast);
  toast = await pick('bg_courtyard', files.huge); s = await stored('bg_courtyard');
  check('pictures: 4000×3000 picture → Courtyard background downscaled to 1600×1200 JPEG', /saved/i.test(toast) && s && s.w === 1600 && s.h === 1200 && s.type === 'image/jpeg', { toast, s });
  toast = await pick('helper', files.huge); s = await stored('helper');
  check('pictures: 4000×3000 picture → Boo downscaled to ≤ 512 px', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512, { toast, s });
  await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=circle]');
  check('pictures: shape button switches Ember to Round', await p.evaluate(() => localStorage.getItem('egc:shape_hero') === 'circle' && EG.Assets.custom.hero.width === 512));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  // play with the custom pictures
  await p.evaluate(() => { EG.Game.startGame(); EG.debug.setBot(true, 0.9); EG.debug.setSpeed(3); });
  await sleep(5000);
  await p.evaluate(() => EG.debug.setSpeed(1)); await sleep(500);
  const play = await p.evaluate(() => { const R = EG.Game.renderer, w = EG.debug.world; return { custom: !!R.background(0).custom, zone: R.vis.cur, drops: w.stats.drops, merges: w.stats.merges, errors: EG.debug.stats.errors.length }; });
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const px = await p.evaluate(() => { const c = EG.Game.renderer.canvas, g = c.getContext('2d'); const d = g.getImageData(0, Math.round(c.height * 0.5), c.width, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  check('pictures: the game plays with custom Ember / light / Boo / background (bot drops and merges, no errors)', play.custom && play.drops >= 5 && play.merges >= 2 && play.errors === 0, play);
  check('pictures: the frame is actually drawn (not blank)', px > 30, Math.round(px));
  // force Boo in with custom helper art
  await p.evaluate(() => { EG.debug.setBot(false); });
  await idle(p, 10000);
  await p.evaluate(() => { const w = EG.debug.world; w.setBoard([[1], [], [1, 1], [], [1]]); w.held = { tier: 1, kind: 'light' }; w.combo = 4; EG.Game.drop(0); });
  await p.waitForFunction(() => EG.debug.world.boo.active, null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  await p.screenshot({ path: OUT + '/func_custom_boo.png' });
  check('pictures: Boo with a custom picture flies without errors', await p.evaluate(() => EG.debug.stats.errors.length === 0));
  await p.evaluate(() => EG.debug.gotoLevel(1)); await sleep(1500);
  check('pictures: places without a custom picture still use the default scene', await p.evaluate(() => !EG.Game.renderer.background(1).custom));
  await p.reload(); await p.waitForFunction(() => window.EG && EG.Game && EG.Game.mode === 'title');
  check('pictures: custom pictures survive a reload', await p.evaluate(() => ['hero', 'item', 'helper', 'bg_courtyard'].every(s => EG.Assets.hasCustom(s))));
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: EG.Assets.hasCustom('hero'), k: localStorage.getItem('egc:img_hero'), shape: localStorage.getItem('egc:shape_hero'), item: EG.Assets.hasCustom('item') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.item, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: EG.Assets.SLOTS.some(s => EG.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^egc:(img|shape)_/.test(k)) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0, r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => EG.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene is drawn again', await p.evaluate(() => !EG.Game.renderer.background(0).custom));
  check('pictures: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= layout
async function sLayout() {
  const sizes = [
    ['1280x720', { width: 1280, height: 720 }, false],
    ['1920x1080', { width: 1920, height: 1080 }, false],
    ['ipad_land_1024x768', { width: 1024, height: 768 }, true],
    ['ipad_port_768x1024', { width: 768, height: 1024 }, true],
    ['phone_port_390x844', { width: 390, height: 844 }, true],
    ['phone_land_844x390', { width: 844, height: 390 }, true]
  ];
  for (const [name, vp, mobile] of sizes) {
    for (const dpr of [1, 2, 3]) {
      const tag = `${name}@${dpr}x`;
      const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.9&diff=normal');
      await waitMode(p, 'playing'); await sleep(2500);
      if (dpr === 2) await p.screenshot({ path: OUT + `/func_${name}_play.png` });
      const geo = await p.evaluate(() => {
        const R = EG.Game.renderer, w = EG.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW;
        const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
        const hud = document.getElementById('hud').getBoundingClientRect();
        const board = css(L.boardX, L.boardY, L.boardW, L.boardH);
        // HUD panels as drawHud lays them out
        const I = R.ins, panels = [];
        if (!L.portrait) {
          const spaceL = L.boardX - I.left - 26, pw = Math.min(170, Math.max(110, spaceL - 10)), lx = Math.max(I.left + 12, L.boardX - 26 - pw), top = Math.max(I.top + 14, 14);
          panels.push(['left', css(lx, top, pw, 196)]);
          const rx = L.boardX + L.boardW + 26, rw = Math.min(170, Math.max(110, R.VW - I.right - 12 - rx)), rtop = Math.max(top, R._hudBtn ? R._hudBtn.b + 8 : 70);
          panels.push(['right', css(rx, rtop, rw, 150)]);
          panels.push(['zoneName', css(rx, rtop + 166, rw, 20)]);
        } else {
          const top = I.top + 12, x0 = I.left + 14, right = R._hudBtn ? R._hudBtn.l - 10 : R.VW - 120;
          panels.push(['strip', css(x0, top, Math.max(150, right - x0), 92)]);
          panels.push(['combo', css(R.VW / 2 - 130, top + 104 + 14 - 8, 260, 16)]);
          panels.push(['rise', css(R.VW / 2 - 130, top + 104 + 46 - 13, 260, 26)]);
        }
        // Ember's visible sprite top (scan the idle frame's alpha) at her hover line
        const im = EG.Assets.img.ember_idle, sc = document.createElement('canvas'); sc.width = sc.height = 160;
        const g = sc.getContext('2d'); g.drawImage(im, 0, 0, 160, 160); const d = g.getImageData(0, 0, 160, 160).data;
        let top0 = 0; outer: for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (d[(y * 160 + x) * 4 + 3] > 40) { top0 = y; break outer; }
        const S = L.cell * 1.75, eTop = L.emberY - S * 78 / 160 + S * top0 / 160 - L.cell * 0.05;
        const ember = css(L.boardX - S * 0.4, eTop, L.boardW + S * 0.8, L.holdY + L.itemSize / 2 - eTop);
        const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; });
        return { vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, cell: L.cell, portrait: L.portrait, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, board, panels, ember,
          hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btns, px: R.px, canvasPx: R.canvas.width, errors: EG.debug.stats.errors.length };
      });
      const inVp = (r, slack = 1) => r && r.l >= -slack && r.t >= -slack && r.r <= geo.vw + slack && r.b <= geo.vh + slack;
      const inside = (a, b, slack = 1) => a.l >= b.l - slack && a.t >= b.t - slack && a.r <= b.r + slack && a.b <= b.b + slack;
      const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      const R0 = r => ({ l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) });
      check(`layout ${tag}: canvas inside the viewport`, inVp(geo.canvas), { canvas: R0(geo.canvas), VW: geo.VW, VH: geo.VH });
      check(`layout ${tag}: board fully on screen and inside the canvas`, inVp(geo.board) && inside(geo.board, geo.canvas), { board: R0(geo.board), cell: geo.cell });
      check(`layout ${tag}: HUD buttons visible, inside the viewport, finger-sized (≥ 44 css px on touch)`, geo.hud.w > 0 && inVp(geo.hud) && (!mobile || geo.btns.every(b => b.w >= 43.5 && b.h >= 43.5)), geo.btns.map(b => Math.round(b.w)));
      check(`layout ${tag}: HUD buttons do not overlap the board`, !ov(geo.hud, geo.board), { hud: R0(geo.hud), board: R0(geo.board) });
      const bad = geo.panels.filter(([n, r]) => ov(r, geo.board) || ov(r, geo.hud) || !inside(r, geo.canvas)).map(([n, r]) => n + ':' + JSON.stringify(R0(r)));
      check(`layout ${tag}: HUD panels inside the canvas, clear of the board and of the pause/mute buttons`, bad.length === 0, bad.length ? bad : undefined);
      if (geo.portrait) {
        const hit = geo.panels.filter(([n, r]) => ov(r, geo.ember)).map(([n, r]) => n);
        check(`layout ${tag}: portrait HUD strip clear of Ember's flight band and the held light`, hit.length === 0, hit.length ? { hit, ember: R0(geo.ember), strip: R0(geo.panels[0][1]) } : undefined);
      }
      check(`layout ${tag}: canvas backing store matches DPR (sharp) within the pixel cap`, geo.canvasPx >= Math.min(geo.vw * dpr, Math.sqrt(3.2e6 * geo.VW / geo.VH)) * 0.6, { px: +geo.px.toFixed(2), canvasPx: geo.canvasPx });
      if (dpr === 2) {
        for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
          await p.evaluate(s => {
            if (s === 'scrPause') { EG.Game.mode = 'playing'; EG.Game.deadT = -1; EG.Game.pause(); }
            else if (s === 'scrOver') EG.UI.showGameOver({ score: 12345, best: 67890, newBest: true, cleared: 4, biggest: 'Moon', combo: 12, merges: 140, boos: 6, woken: 9, reached: 'Star Tower (round 2)' });
            else EG.UI.show(s);
          }, scr);
          await sleep(750);   // the .45 s pop animation overshoots (scale > 1) near its end
          const pr = await p.evaluate(s => {
            const el = document.querySelector('#' + s + ' .panel') || document.querySelector('#' + s + ' .title-wrap');
            const r = el.getBoundingClientRect();
            const btns = [...document.querySelectorAll('#' + s + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0)
              .map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.dataset.v || b.dataset.act || b.textContent.trim().slice(0, 10), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height }; });
            return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroll: el.scrollHeight > el.clientHeight + 2, btns };
          }, scr);
          await p.screenshot({ path: OUT + `/func_${name}_${scr}.png` });
          const offBtns = pr.btns.filter(b => !inVp(b, 1)).map(b => b.id);
          const okFit = inVp(pr) && offBtns.length === 0 && (!pr.scroll || scr === 'scrCustom');
          check(`layout ${tag}: ${scr} panel fits the screen (all buttons visible${scr === 'scrCustom' ? '' : ', no scrolling'})`, okFit, okFit ? undefined : { panel: R0(pr), scroll: pr.scroll, offBtns });
          if (mobile) {
            const small = pr.btns.filter(b => b.h < 31.5).map(b => b.id + ':' + Math.round(b.h));
            check(`layout ${tag}: ${scr} buttons are finger-sized (≥ 32 px tall)`, small.length === 0, small.length ? small : undefined);
          }
          if (scr === 'scrPause') await p.evaluate(() => EG.Game.resume());
        }
        await p.evaluate(() => { EG.UI.hideAll(); EG.Game.mode = 'playing'; EG.UI.setHud(true); });
      }
      check(`layout ${tag}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
      await ctx.close();
    }
  }
  // rotation while playing
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.9');
  await waitMode(p, 'playing'); await sleep(2000);
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(900);
  const rz = await p.evaluate(() => { const w = EG.debug.world, L = w.layout, R = EG.Game.renderer;
    const off = w.items.filter(i => i.state === 'rest' && (i.x < L.boardX || i.x > L.boardX + L.boardW || i.y < L.boardY || i.y > L.boardY + L.boardH)).length;
    return { VW: R.VW, VH: R.VH, lw: L.width, lh: L.height, portrait: L.portrait, off, emberOk: Math.abs(w.ember.y - L.emberY) < L.cell }; });
  check('layout: rotating landscape → portrait re-lays out the board (items on the board, Ember on her line)', rz.VW === 560 && rz.lw === 560 && rz.lh === rz.VH && rz.portrait && rz.off === 0 && rz.emberOk, rz);
  await sleep(1500);
  check('layout: no errors after rotation', errs.length === 0 && await p.evaluate(() => EG.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= long bot run
async function sLongRun() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=21&autostart=1&bot=1&skill=0.5&speed=16&autorestart=1&diff=hard');
  await waitMode(p, 'playing');
  // Hard + a so-so bot: a game lasts ≈ 5 simulated minutes, so 60 s × 16 gives 2–4 finished games
  let maxP = 0, maxFx = 0, maxLevel = 0, maxItems = 0, stuck = 0, lastT = -1, lastDrops = -1, stuckFor = 0, notOver = 0, simT = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(500);
    const s = await p.evaluate(() => { const st = EG.debug.getState(); return { p: st.particles, fx: st.fx, level: st.level, items: st.items, time: st.time, drops: st.stats.drops, mode: st.mode, phase: st.phase }; });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxLevel = Math.max(maxLevel, s.level); maxItems = Math.max(maxItems, s.items);
    if (s.drops === lastDrops && s.mode === 'playing' && s.phase !== 'over') { stuckFor += 0.5; stuck = Math.max(stuck, stuckFor); } else stuckFor = 0;
    if (s.mode === 'over') notOver++;
    if (lastT >= 0 && s.time < lastT) simT += lastT;   // a new game started
    lastDrops = s.drops; lastT = s.time;
  }
  simT += Math.max(0, lastT);
  const stats = await p.evaluate(() => ({ games: EG.debug.stats.games, levels: EG.debug.stats.levels, scores: EG.debug.stats.scores, times: EG.debug.stats.times, merges: EG.debug.stats.merges, boos: EG.debug.stats.boos, maxTier: EG.debug.stats.maxTier, errors: EG.debug.stats.errors }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxItems, maxLevel, stuckS: stuck, stats }));
  check('long run: ≥ 8 simulated minutes in the real-time budget', simT >= 480, { simMin: +(simT / 60).toFixed(1) });
  check('long run: several games completed and auto-restarted (≥ 2)', stats.games >= 2, stats.games);
  check('long run: every finished game has a score and a sane length', stats.scores.every(s => s > 0) && stats.times.every(t => t > 20), { scores: stats.scores, times: stats.times });
  check('long run: the bot clears places (reaches level 2+)', Math.max(maxLevel, ...(stats.levels.length ? stats.levels : [0])) >= 2, { maxLevel, levels: stats.levels });
  check('long run: never stuck (a drop at least every 3 s of real time at ×16)', stuck < 3, stuck);
  check('long run: autorestart never leaves the game-over screen up', notOver <= 1, notOver);
  check('long run: particles bounded (< 140)', maxP < 140, maxP);
  check('long run: fx / items bounded', maxFx < 80 && maxItems < 60, { maxFx, maxItems });
  check('long run: EG.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const sections = { sStatic, sBoot, sMenus, sInput, sTouch, sRules, sSettings, sPictures, sLayout, sLongRun };
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
