// Functional QA suite for Nimbus's Bubble Garden.
// Run: node tests/e2e/functional.js [sectionFilter]      (LONG_RUN_S=60 real seconds at ×16 by default)
// Prints PASS/FAIL per check, screenshots in tests/out/func_*.png, exits 1 on any FAIL.
// Sections: static (Go wrapper + iOS) · boot · menus · keys (Esc/P) · input (mouse / keyboard / HUD) · touch ·
// rules (headless NB.World: pop, grow, shower, bump, level, game over) · over (live game over, restart lock) ·
// focus (focused button + Space/Enter) · settings · best · pictures · layout (6 sizes + safe area) · rotate ·
// blur / visibility · long bot run at ?speed=16.
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
  await instrument(page);
  return { ctx, page, errs };
}
// start counter + event log (copied before the game consumes the events)
async function instrument(page) {
  await page.waitForFunction(() => window.NB && NB.debug && NB.Game && NB.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = NB.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; window._ev = []; return o.apply(this, arguments); };
    window._ev = [];
    const h = G.handleEvents;
    G.handleEvents = function (evts) {
      if (this.mode !== 'title') for (const e of evts) if (e.type !== 'spawn') window._ev.push({ type: e.type, points: e.points, size: e.size, by: e.by, bonus: e.bonus, hearts: e.hearts, level: e.level, zone: e.zone, score: this.world.score });
      if (window._ev.length > 4000) window._ev.splice(0, 2000);
      return h.apply(this, arguments);
    };
  });
}
const mode = p => p.evaluate(() => NB.Game.mode);
const ui = p => p.evaluate(() => NB.UI.current);
const starts = p => p.evaluate(() => NB.Game._starts);
const waitMode = (p, m, t) => p.waitForFunction(m => NB.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => NB.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && !e.closest('.hidden'); }, sel);
const hero = p => p.evaluate(() => { const h = NB.debug.world.hero; return { x: h.x, y: h.y, tx: h.tx, ty: h.ty, r: h.r, size: h.size }; });
const unit = p => p.evaluate(() => NB.debug.world.layout.unit);
// logical (world) → client (CSS px) and back
const toClient = (p, x, y) => p.evaluate(([x, y]) => { const R = NB.Game.renderer, r = R.canvas.getBoundingClientRect(); return [r.left + x / R.VW * r.width, r.top + y / R.VH * r.height]; }, [x, y]);
const toLogical = (p, cx, cy) => p.evaluate(([x, y]) => NB.Game.renderer.toLogical(x, y), [cx, cy]);
// a calm run: no random spawns, lots of hearts
async function startCalm(p, keepHearts) {
  await p.evaluate(() => NB.Game.startGame());
  await waitMode(p, 'playing');
  await p.evaluate(k => { const w = NB.debug.world; w._spawnT = 1e9; w._burrT = 1e9; if (!k) w.hearts = w.maxHearts = 99; window._ev = []; }, !!keepHearts);
  await sleep(150);
}
// game over now: one heart, a burr dropped right on Nimbus, then the 1.6 s nap delay
async function killNow(p, score) {
  await p.evaluate(s => {
    const w = NB.debug.world; w.hearts = 1; w.hero.invuln = 0; w.hero.rainT = 0; if (s != null) w.score = s;
    w.setTarget(w.hero.x, w.hero.y); w.spawnBurr(w.hero.x); NB.debug.setSpeed(3);
  }, score);
  const ok = await waitMode(p, 'over', 12000);
  await p.evaluate(() => NB.debug.setSpeed(1));
  return ok;
}

// ======================================================================= static review
async function sStatic() {
  const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
  check('static/app: fixed loopback port 127.0.0.1:47623 with free-port fallback', /"47623"/.test(go) && /127\.0\.0\.1:0"/.test(go));
  check('static/app: storage in %APPDATA%\\NimbusBubbleGarden\\data', /filepath\.Join\(appData, "NimbusBubbleGarden"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go));
  check('static/app: binds ffStoreAll/Set/Del, ffFullscreen, ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  check('static/app: bindings registered before Navigate', go.indexOf('w.Bind("ffStoreAll"') > 0 && go.indexOf('w.Bind("ffStoreAll"') < go.indexOf('w.Navigate('));
  check('static/app: atomic write (tmp + rename) and key filter', /\.tmp"/.test(go) && /os\.Rename/.test(go) && /\^\[a-zA-Z0-9_\\-\]\{1,64\}\$/.test(go));
  const keys = ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_gem', 'shape_gem', 'img_bg_dawn', 'img_bg_noon', 'img_bg_sunset', 'img_bg_night'];
  check('static/app: every storage key the game writes passes the Go key filter', keys.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k)));
  const m = /len\(v\) > (\d+)<<20/.exec(go);
  check('static/app: value size limit (≥ 4 MB) fits a 1600 px JPEG data URL', m && +m[1] >= 4, m && m[0]);
  check('static/app: single-instance mutex name and window title match the game', go.includes('NimbusBubbleGarden.SingleInstance') && (go.match(/"Nimbus's Bubble Garden"/g) || []).length >= 3);
  check('static/app: browser fallback strips ?app=1 (Quit would not work in a tab)', /TrimSuffix\(url, "\?app=1"\)/.test(go));
  check('static/app: WebView2 data in %LOCALAPPDATA%\\NimbusBubbleGarden', /filepath\.Join\(localAppData, "NimbusBubbleGarden", "WebView2"\)/.test(go));
  if (fs.existsSync(path.join(ROOT, 'tools/build.sh'))) {
    const build = fs.readFileSync(path.join(ROOT, 'tools/build.sh'), 'utf8');
    check('static/app: build produces dist/NimbusBubbleGarden.exe', /NimbusBubbleGarden\.exe/.test(build));
  }
  const store = fs.readFileSync(path.join(ROOT, 'game/js/storage.js'), 'utf8');
  check('static/app: the JS store uses the same 3 bindings and the nbg: prefix', /ffStoreAll/.test(store) && /ffStoreSet/.test(store) && /ffStoreDel/.test(store) && /'nbg:'/.test(store));
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  check('static/iOS: viewport no zoom + viewport-fit=cover', /user-scalable=no/.test(html) && /maximum-scale=1/.test(html) && /viewport-fit=cover/.test(html));
  check('static/iOS: apple-mobile-web-app-capable, touch icon and manifest', /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  check('static/iOS: home-screen PNG icons exist', ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'game/assets/icons', f))));
  const D = path.join(ROOT, 'game/assets/default'), need = ['icon', 'bubble', 'heart', 'heart_empty', 'jar', 'burr_0', 'burr_1'];
  ['0', '1', 'happy', 'ouch', 'rain'].forEach(f => need.push('nimbus_' + f));
  [0, 1, 2, 3, 4].forEach(i => need.push('gem_' + i));
  ['drop', 'streak', 'ripple', 'splash', 'shard', 'sparkle', 'petal', 'leaf', 'mist', 'glow', 'star', 'puff'].forEach(x => need.push('particles/' + x));
  ['dawn', 'noon', 'sunset', 'night'].forEach(z => ['sky', 'far', 'mid', 'ground'].forEach(l => need.push('levels/' + z + '/' + l)));
  const missing = need.filter(f => !fs.existsSync(path.join(D, f + '.svg')));
  check('static: every default asset file exists (' + need.length + ' SVGs)', missing.length === 0, missing.length ? missing : undefined);
}

// ======================================================================= boot
async function sBoot() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  check('boot: reaches the title screen', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  await p.waitForFunction(() => NB.debug.world.stats.pops > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(300);
  const st = await p.evaluate(() => ({ pops: NB.debug.world.stats.pops, hud: !document.getElementById('hud').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id, errors: NB.debug.stats.errors.length, ns: Object.keys(NB.debug) }));
  check('boot: title demo bot pops bubbles behind the menu, HUD hidden', st.pops > 0 && !st.hud, st);
  check('boot: Play is focused for keyboard users', st.focus === 'btnPlay', st.focus);
  check('boot: NB.debug exposes the DESIGN §5.4 hooks', ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'target'].every(k => st.ns.includes(k)), st.ns);
  check('boot: zero console errors / frame errors', errs.length === 0 && st.errors === 0, errs.slice(0, 3));
  await p.screenshot({ path: OUT + '/func_title.png' });
  await ctx.close();
}

// ======================================================================= menus
async function sMenus() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  for (const [btn, scr, label] of [['#btnHow', 'scrHow', 'How to Play'], ['#btnSettings', 'scrSettings', 'Settings'], ['#btnCustomize', 'scrCustom', 'Change Pictures']]) {
    await p.click(btn);
    check(`menus: ${label} opens`, await waitUi(p, scr) && await visible(p, '#' + scr + ' .panel'));
    await p.click(`#${scr} .btn-back`);
    check(`menus: ${label} → back button returns to the title`, await waitUi(p, 'scrTitle'));
    await p.click(btn); await waitUi(p, scr);
    await p.keyboard.press('Escape');
    check(`menus: ${label} → Esc returns to the title`, await waitUi(p, 'scrTitle'));
  }
  await p.click('#btnPlay');
  check('menus: Play starts a game, HUD shown', await waitMode(p, 'playing') && await visible(p, '#hud') && await ui(p) === null);
  await p.click('#btnPause');
  check('menus: HUD pause button opens Pause', await waitUi(p, 'scrPause') && await mode(p) === 'paused');
  check('menus: HUD hidden while paused', !(await visible(p, '#hud')));
  await p.click('#btnPauseSettings');
  check('menus: Pause → Settings', await waitUi(p, 'scrSettings'));
  await p.keyboard.press('Escape');
  check('menus: Esc in Settings (from Pause) goes back to Pause, still paused', await waitUi(p, 'scrPause') && await mode(p) === 'paused');
  await p.click('#btnPauseSettings'); await waitUi(p, 'scrSettings');
  await p.click('#scrSettings .btn-back');
  check('menus: Done in Settings (from Pause) goes back to Pause', await waitUi(p, 'scrPause'));
  await p.click('#btnResume');
  check('menus: Resume', await waitMode(p, 'playing') && await ui(p) === null);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause');
  const s0 = await starts(p);
  await p.evaluate(() => { NB.debug.world.score = 1234; });
  await p.click('#btnRestart');
  check('menus: Pause → Restart starts a fresh game', await waitMode(p, 'playing') && await starts(p) === s0 + 1 && await p.evaluate(() => NB.debug.world.score === 0));
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause');
  await p.click('#btnPauseMenu');
  check('menus: Pause → Main Menu returns to the title (demo)', await waitMode(p, 'title') && await ui(p) === 'scrTitle' && await p.evaluate(() => document.getElementById('hud').classList.contains('hidden')));
  await startCalm(p, true);
  check('menus: game over reached', await killNow(p, 0));
  check('menus: game over screen shown with score/best', await ui(p) === 'scrOver' && await visible(p, '#overScore') && await visible(p, '#btnAgain'));
  await p.screenshot({ path: OUT + '/func_over.png' });
  await sleep(800);
  await p.click('#btnOverMenu');
  check('menus: Game over → Menu returns to the title', await waitMode(p, 'title'));
  await startCalm(p, true); await killNow(p, 0); await sleep(800);
  const s1 = await starts(p);
  await p.click('#btnAgain');
  check('menus: Game over → Play Again starts once', await waitMode(p, 'playing') && await starts(p) === s1 + 1);
  check('menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= Esc / P
async function sKeys() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  await p.keyboard.press('Escape'); await sleep(150);
  check('keys: Esc on the title does nothing', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  await startCalm(p);
  await p.keyboard.press('KeyP');
  check('keys: P pauses', await waitUi(p, 'scrPause') && await mode(p) === 'paused');
  await p.keyboard.press('KeyP');
  check('keys: P again resumes', await waitMode(p, 'playing') && await ui(p) === null);
  await p.keyboard.press('Escape');
  check('keys: Esc pauses', await waitUi(p, 'scrPause'));
  const t0 = await p.evaluate(() => NB.debug.world.time);
  await sleep(500);
  check('keys: the world is frozen while paused', await p.evaluate(t => NB.debug.world.time === t, t0));
  await p.keyboard.press('Escape');
  check('keys: Esc again resumes', await waitMode(p, 'playing'));
  // Esc / P during the 1.6 s "nap" delay after the last heart must not pause
  await p.evaluate(() => { const w = NB.debug.world; w.hearts = 1; w.hero.invuln = 0; w.spawnBurr(w.hero.x); NB.debug.setSpeed(2); });
  await p.waitForFunction(() => NB.debug.world.phase === 'over', null, { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => NB.debug.setSpeed(1));
  await p.keyboard.press('Escape'); await sleep(100);
  check('keys: Esc during the game-over delay does not pause', await mode(p) === 'playing' && await ui(p) === null);
  check('keys: then the game-over screen appears', await waitMode(p, 'over', 5000) && await ui(p) === 'scrOver');
  await p.keyboard.press('Escape'); await p.keyboard.press('KeyP'); await sleep(150);
  check('keys: Esc / P on the game-over screen do nothing', await mode(p) === 'over' && await ui(p) === 'scrOver');
  const m0 = await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute);
  await p.keyboard.press('KeyM'); await sleep(50);
  check('keys: M toggles sound', await p.evaluate(m => (NB.Game.settings.muted || NB.Game.urlMute) !== m, m0));
  check('keys: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= input (mouse / keyboard / HUD)
async function sInput() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7&diff=normal');
  await startCalm(p);
  const u = await unit(p);
  // mouse: Nimbus floats to the cursor (no lift)
  const L = await p.evaluate(() => NB.debug.world.layout);
  let [cx, cy] = await toClient(p, L.width * 0.2, (L.minY + L.maxY) / 2);
  await p.mouse.move(cx, cy); await sleep(1500);
  let h = await hero(p), [lx, ly] = await toLogical(p, cx, cy);
  check('input: mouse move sets the target exactly at the cursor (no lift)', Math.abs(h.tx - lx) < 1 && Math.abs(h.ty - ly) < 1, { tx: h.tx, lx, ty: h.ty, ly });
  check('input: Nimbus floats to the cursor (within 0.15 u after 1.5 s)', Math.hypot(h.x - lx, h.y - ly) < 0.15 * u, { h, lx, ly });
  [cx, cy] = await toClient(p, L.width * 0.8, L.minY + 0.6 * u);
  await p.mouse.move(cx, cy); await sleep(1500);
  h = await hero(p); [lx, ly] = await toLogical(p, cx, cy);
  check('input: ...and across the garden to the other side', Math.hypot(h.x - lx, h.y - ly) < 0.2 * u, { h, lx, ly });
  // cursor outside the play box: target clamped, Nimbus stays inside
  [cx, cy] = await toClient(p, L.width * 0.5, L.height - 2);
  await p.mouse.move(cx, cy); await sleep(1500);
  h = await hero(p);
  check('input: cursor on the lawn: Nimbus stays above the lawn line (clamped)', h.y + h.r <= L.maxY + 0.5 && h.ty + h.r <= L.maxY + 0.5, { y: h.y, r: h.r, maxY: L.maxY });
  // keyboard
  for (const [key, ax, ay] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0], ['KeyW', 0, -1], ['KeyS', 0, 1]]) {
    await p.evaluate(() => { const w = NB.debug.world, L = w.layout; w.hero.x = w.hero.tx = L.width / 2; w.hero.y = w.hero.ty = (L.minY + L.maxY) / 2; w.hero.vx = w.hero.vy = 0; });
    await sleep(100);
    const a = await hero(p);
    await p.keyboard.down(key); await sleep(450); await p.keyboard.up(key); await sleep(300);
    const b = await hero(p);
    const dx = b.x - a.x, dy = b.y - a.y;
    const ok = ax ? (dx * ax > 0.8 * u && Math.abs(dy) < 0.3 * u) : (dy * ay > 0.5 * u && Math.abs(dx) < 0.3 * u);
    check(`input: ${key} moves Nimbus ${ax < 0 ? 'left' : ax > 0 ? 'right' : ay < 0 ? 'up' : 'down'}`, ok, { dx: Math.round(dx), dy: Math.round(dy) });
  }
  await sleep(500);
  const hs = await hero(p); await sleep(500); const hs2 = await hero(p);
  check('input: Nimbus settles after the key is released (no endless glide)', Math.hypot(hs2.x - hs.x, hs2.y - hs.y) < 0.1 * u);
  // keys after the mouse: still work (the target is reset to Nimbus)
  // HUD buttons never steer
  await p.mouse.move(5, 5);
  const before = await hero(p);
  const m0 = await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute);
  await p.click('#btnMuteHud'); await sleep(200);
  const after = await hero(p);
  check('input: clicking the mute button toggles sound and does not move the target', (await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute)) !== m0 && Math.abs(after.tx - before.tx) < 0.5 && Math.abs(after.ty - before.ty) < 0.5, { before, after });
  check('input: the mute click keeps the game playing', await mode(p) === 'playing');
  // mute button now focused: Space / Enter must not toggle it again
  const m1 = await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute);
  await p.keyboard.press('Space'); await p.keyboard.press('Enter'); await sleep(150);
  check('input: with the HUD mute button focused, Space / Enter do not toggle mute or pause', (await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute)) === m1 && await mode(p) === 'playing');
  await p.click('#btnMuteHud');
  const b2 = await hero(p);
  await p.click('#btnPause');
  check('input: clicking the pause button pauses and does not move the target', await mode(p) === 'paused' && await p.evaluate(b => Math.abs(NB.debug.world.hero.tx - b.tx) < 0.5 && Math.abs(NB.debug.world.hero.ty - b.ty) < 0.5, b2));
  await p.mouse.move(30, 690); await p.mouse.click(30, 690); await p.keyboard.press('ArrowRight');
  check('input: clicks / moves / arrows on the pause screen never steer', await p.evaluate(b => Math.abs(NB.debug.world.hero.tx - b.tx) < 0.5 && Math.abs(NB.debug.world.hero.ty - b.ty) < 0.5, b2));
  await p.click('#btnResume'); await waitMode(p, 'playing'); await sleep(200);
  check('input: the click on Resume does not move the target', await p.evaluate(b => Math.abs(NB.debug.world.hero.tx - b.tx) < 0.5 && Math.abs(NB.debug.world.hero.ty - b.ty) < 0.5, b2));
  // hovering the HUD buttons with the mouse: no steering
  const hb = await p.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const b3 = await hero(p);
  await p.mouse.move(hb[0], hb[1], { steps: 1 }); await sleep(150);
  check('input: hovering the HUD pause button does not steer', await p.evaluate(b => Math.abs(NB.debug.world.hero.tx - b.tx) < 0.5, b3));
  // right click: no context menu, no harm
  const [sx, sy] = await toClient(p, L.width * 0.4, (L.minY + L.maxY) / 2);
  await p.mouse.click(sx, sy, { button: 'right' }); await sleep(100);
  check('input: right-click keeps playing', await mode(p) === 'playing');
  // title: a click on Play does not leak a target into the new run
  await p.evaluate(() => NB.Game.toTitle()); await waitUi(p, 'scrTitle'); await sleep(200);
  await p.click('#btnPlay'); await waitMode(p, 'playing'); await sleep(100);
  const st = await p.evaluate(() => { const w = NB.debug.world, L = w.layout, h = w.hero; return { tx: h.tx, cx: L.width / 2 }; });
  check('input: the click on Play does not steer Nimbus in the new run', Math.abs(st.tx - st.cx) < 1, st);
  // bot mode ignores the player
  await p.evaluate(() => NB.debug.setBot(true, 1));
  check('input: with ?bot the player cannot act (playerCanAct false)', await p.evaluate(() => !NB.Game.playerCanAct()));
  check('input: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= touch
async function sTouch() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, '?mute=1&seed=5&diff=normal');
  check('touch: isTouch and the .touch class (touch wording)', await p.evaluate(() => NB.Game.isTouch && document.body.classList.contains('touch')));
  await p.tap('#btnHow');
  check('touch: tap How to Play opens it', await waitUi(p, 'scrHow'));
  await sleep(400);
  check('touch: the ghost click does not close How to Play immediately', await ui(p) === 'scrHow');
  await p.tap('#scrHow .btn-back'); await waitUi(p, 'scrTitle'); await sleep(400);
  await p.tap('#btnPlay');
  check('touch: tap Play starts once', await waitMode(p, 'playing') && await starts(p) === 1);
  await sleep(400);
  check('touch: the tap on Play does not steer', await p.evaluate(() => Math.abs(NB.debug.world.hero.tx - NB.debug.world.layout.width / 2) < 1));
  await p.evaluate(() => { const w = NB.debug.world; w._spawnT = 1e9; w._burrT = 1e9; w.hearts = 99; });
  const cdp = await ctx.newCDPSession(p);
  const L = await p.evaluate(() => NB.debug.world.layout), u = L.unit;
  // finger down in the middle → target 0.7 u above the finger
  let [fx, fy] = await toClient(p, L.width * 0.3, (L.minY + L.maxY) / 2 + u);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy, id: 1 }] });
  await sleep(100);
  let h = await hero(p), [lx, ly] = await toLogical(p, fx, fy);
  check('touch: finger down sets the target 0.7 unit above the finger', Math.abs(h.tx - lx) < 1 && Math.abs(h.ty - (ly - 0.7 * u)) < 1, { tx: h.tx, ty: h.ty, lx, ly, lift: 0.7 * u });
  // drag
  const pts = [];
  for (let i = 1; i <= 10; i++) pts.push(await toClient(p, L.width * (0.3 + 0.05 * i), (L.minY + L.maxY) / 2 + u - 0.08 * u * i));
  for (const [x, y] of pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); await sleep(40); }
  [fx, fy] = pts[pts.length - 1];
  await sleep(1500);
  h = await hero(p); [lx, ly] = await toLogical(p, fx, fy);
  check('touch: dragging steers Nimbus; she floats 0.7 u above the finger', Math.abs(h.x - lx) < 0.15 * u && Math.abs(h.y - (ly - 0.7 * u)) < 0.15 * u, { x: h.x, y: h.y, lx, ly });
  // second finger taps the HUD pause button while the first one steers
  const pb = await p.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const tx0 = h.tx;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy, id: 1 }, { x: pb[0], y: pb[1], id: 2 }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: pb[0], y: pb[1], id: 2 }] });   // CDP: the listed point is lifted
  await sleep(200);
  check('touch: a second finger on Pause pauses while the first finger steers', await mode(p) === 'paused', await mode(p));
  check('touch: ...and the HUD tap did not move the target', await p.evaluate(t => Math.abs(NB.debug.world.hero.tx - t) < 1, tx0));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  if (await mode(p) === 'paused') { await p.tap('#btnResume'); await waitMode(p, 'playing'); }
  await sleep(400);
  // finger lifted: a move without a finger down (hover) never steers
  const t1 = await hero(p);
  await p.evaluate(([x, y]) => document.getElementById('game').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', pointerId: 99, clientX: x, clientY: y })), [20, 400]);
  await sleep(100);
  check('touch: a stray touch pointermove (finger not down) does not steer', await p.evaluate(t => Math.abs(NB.debug.world.hero.tx - t.tx) < 1, t1));
  // a quick tap on the stage moves her there
  const [qx, qy] = await toClient(p, L.width * 0.7, (L.minY + L.maxY) / 2 + u);
  await p.touchscreen.tap(qx, qy); await sleep(1600);
  h = await hero(p); [lx, ly] = await toLogical(p, qx, qy);
  check('touch: a tap on the stage sends Nimbus there (above the finger)', Math.abs(h.x - lx) < 0.2 * u && Math.abs(h.y - (ly - 0.7 * u)) < 0.2 * u, { x: h.x, y: h.y, lx, ly });
  // tap the HUD mute: toggles, no steering, still playing
  const m0 = await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute), tt = await hero(p);
  await p.tap('#btnMuteHud'); await sleep(700);
  check('touch: tap the HUD mute button toggles once, no steering', (await p.evaluate(() => NB.Game.settings.muted || NB.Game.urlMute)) !== m0 && await mode(p) === 'playing' && await p.evaluate(t => Math.abs(NB.debug.world.hero.tx - t.tx) < 1, tt));
  await p.tap('#btnPause');
  check('touch: tap the HUD pause button pauses', await waitUi(p, 'scrPause'));
  await sleep(700);
  check('touch: Pause stays up (no ghost click on Resume)', await ui(p) === 'scrPause');
  await p.tap('#btnResume');
  check('touch: tap Resume resumes', await waitMode(p, 'playing'));
  check('touch: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= rules on a headless world
async function sRules() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  const r = await p.evaluate(() => {
    const mk = (d) => { const w = new NB.World({ seed: 3, difficulty: d || 'normal', width: 960, height: 540 }); w._spawnT = 1e9; w._burrT = 1e9; w.drainEvents(); return w; };
    const run = (w, s) => { const ev = []; for (let t = 0; t < s; t += 1 / 120) { w.update(1 / 120); ev.push(...w.drainEvents()); } return ev; };
    const popOne = w => { const b = w.spawnBubble(w.hero.x); b.x = w.hero.x; b.y = w.hero.y; b.prevX = b.x; b.prevY = b.y; w.update(1 / 120); return w.drainEvents(); };
    const out = {};
    // 1. pop = 10 × size
    let w = mk();
    const pts = [];
    for (const s of [1, 2, 3, 4, 5]) { w.hero.size = s; w.hero.gemsInSize = 0; const s0 = w.score; const ev = popOne(w); const pe = ev.find(e => e.type === 'pop'); pts.push([s, w.score - s0, pe && pe.points, pe && pe.by]); }
    out.points = pts;
    // 2. growth every 4 gems
    w = mk(); const sizes = [];
    for (let i = 1; i <= 16; i++) { popOne(w); sizes.push(w.hero.size); }
    out.sizes = sizes; out.grow = w.hero.grow;
    // 3. shower: 4 more gems at size 5
    const burr = w.spawnBurr(200); w.drainEvents();
    let ev = []; for (let i = 0; i < 4; i++) ev.push(...popOne(w));
    out.showerStart = { shower: ev.filter(e => e.type === 'shower').length, rainT: w.hero.rainT, size: w.hero.size, invuln: w.hero.invuln, mood: w.hero.mood, burr: burr.state, washed: burr.washed };
    const L = w.layout, many = [];
    const xs = [80, 200, 320, 640, 760, 880, 140];   // away from Nimbus (x 480) so only the rain pops them
    for (let i = 0; i < 7; i++) { const b = w.spawnBubble(xs[i]); b.y = b.prevY = L.topY + 0.8 * L.unit + (i % 3) * 0.9 * L.unit; many.push(b); }
    w.drainEvents();
    const sc0 = w.score;
    ev = run(w, 2.7);
    const rainPops = ev.filter(e => e.type === 'pop' && e.by === 'rain');
    out.shower = { rainPops: rainPops.length, allGone: many.every(b => b.state === 'gone'), sizeDuring: rainPops.map(e => e.size), pts: rainPops.map(e => e.points),
      end: ev.filter(e => e.type === 'showerEnd').length, shrink: ev.filter(e => e.type === 'shrink').map(e => e.size), size: w.hero.size, grow: w.hero.grow, rainT: w.hero.rainT,
      bonus: w.score - sc0 - rainPops.reduce((a, e) => a + e.points, 0), level: w.level, grows: ev.filter(e => e.type === 'grow').length };
    // 4. bump: a falling burr costs a heart and one size
    w = mk(); w.hero.size = 3; w.hero.r = w.rFor(3);
    const h0 = w.hearts; let c = w.spawnBurr(w.hero.x); w.drainEvents();
    let hangBump = false, hangEv = [];
    for (let t = 0; t < w.D.hangTime - 0.05; t += 1 / 120) { w.update(1 / 120); hangEv.push(...w.drainEvents()); }
    hangBump = hangEv.some(e => e.type === 'bump');
    ev = run(w, 2.0);
    out.bump = { hangBump, bump: ev.filter(e => e.type === 'bump').length, hearts: [h0, w.hearts], heartLost: ev.filter(e => e.type === 'heartLost').length, size: w.hero.size, shrink: ev.filter(e => e.type === 'shrink').map(e => e.size),
      invulnSet: w.stats.bumps === 1, hit: c.hit, mood: ev.length ? 'checked' : '', knock: ev.length };
    // invulnerability: a second burr during the blink does not hurt
    w = mk(); w.hero.invuln = 0; c = w.spawnBurr(w.hero.x); ev = run(w, 1.6 + 1.2);
    const hits1 = ev.filter(e => e.type === 'bump').length;
    w.hero.invuln = 1.5; w.spawnBurr(w.hero.x); ev = run(w, 0.9);
    out.invuln = { first: hits1, second: ev.filter(e => e.type === 'bump').length };
    // size 1 stays size 1 after a bump
    w = mk(); w.spawnBurr(w.hero.x); run(w, 3); out.bumpSize1 = { size: w.hero.size, hearts: w.hearts, max: w.maxHearts };
    // a hanging burr overlapping Nimbus does not hurt; a rolling burr does not hurt
    w = mk(); w.setTarget(480, 0); run(w, 1.5);
    c = w.spawnBurr(w.hero.x); w.drainEvents();
    const dHang = Math.hypot(c.x - w.hero.x, c.y - w.hero.y), rrHang = w.hero.r * 0.9 + c.r;
    ev = []; for (let t = 0; t < w.D.hangTime - 0.02; t += 1 / 120) { w.update(1 / 120); ev.push(...w.drainEvents()); }
    out.hang = { overlap: dHang < rrHang, bump: ev.filter(e => e.type === 'bump').length, state: c.state };
    w = mk(); w.setTarget(150, 1e4); run(w, 2);
    c = w.spawnBurr(800); w.drainEvents();
    run(w, w.D.hangTime + 1.0);
    let rollBump = 0, wasRoll = c.state === 'roll';
    for (let t = 0; t < 0.6 && c.state === 'roll'; t += 1 / 120) { c.x = w.hero.x; w.hero.invuln = 0; w.update(1 / 120); rollBump += w.drainEvents().filter(e => e.type === 'bump').length; }
    out.roll = { wasRoll, rollBump };
    // 5. level up: jar full → +bonus, +1 heart (up to max), next zone
    w = mk(); w.hearts = w.maxHearts - 1; w.gems = w.goal - 1;
    let s0 = w.score; ev = popOne(w);
    out.level1 = { lv: ev.filter(e => e.type === 'levelUp').map(e => [e.level, e.zone, e.bonus]), hearts: [w.hearts, w.maxHearts], gain: ev.filter(e => e.type === 'heartGain').length, gems: w.gems, delta: w.score - s0, goal: w.goal };
    w.gems = w.goal - 1; s0 = w.score; ev = popOne(w);
    out.level2 = { lv: ev.filter(e => e.type === 'levelUp').map(e => [e.level, e.zone, e.bonus]), hearts: [w.hearts, w.maxHearts], gain: ev.filter(e => e.type === 'heartGain').length, delta: w.score - s0 };
    // after Night → Dawn of round 2: goal +2
    w.gotoLevel(3); w.drainEvents(); w.gems = w.goal - 1; ev = popOne(w);
    out.loop = { level: w.level, zone: w.zone, loop: w.loop, goal: w.goal, base: NB.World.CONFIG.goal.normal, bonus: (ev.find(e => e.type === 'levelUp') || {}).bonus };
    // difficulty presets
    out.hearts = ['easy', 'normal', 'hard'].map(d => mk(d).maxHearts);
    // 6. game over: last heart → phase over, gameOver once, spawns stop
    w = mk(); w._spawnT = 0.1; w.hearts = 1; w.spawnBurr(w.hero.x);
    ev = run(w, 3);
    const nB = w.bubbles.length;
    const ev2 = run(w, 4);
    out.over = { phase: w.phase, go: ev.filter(e => e.type === 'gameOver').length, hearts: w.hearts, spawnsAfter: ev2.filter(e => e.type === 'spawn').length, popsAfter: ev2.filter(e => e.type === 'pop').length, hangsAfter: ev2.filter(e => e.type === 'hang').length, nB };
    // escaped bubbles cost nothing
    w = mk(); const hb = w.hearts, sb = w.score; const eb = w.spawnBubble(50); eb.y = eb.prevY = -eb.r + 1; w.setTarget(900, 400); ev = run(w, 0.5);
    out.escape = { escaped: ev.filter(e => e.type === 'escape').length, hearts: w.hearts === hb, score: w.score === sb };
    // determinism: same seed + inputs → same state
    const sim = () => { const q = new NB.World({ seed: 42, difficulty: 'hard', width: 960, height: 540 }); const b = new NB.Bot(q, { skill: 0.7, seed: 5 }); for (let i = 0; i < 60 * 40; i++) { b.step(1 / 60); q.update(1 / 60); q.drainEvents(); } return JSON.stringify(q.getState()); };
    out.det = sim() === sim();
    return out;
  });
  check('rules: popping a bubble scores 10 × size (sizes 1..5)', r.points.every(([s, d, pp, by]) => d === 10 * s && pp === 10 * s && by === 'hero'), r.points);
  check('rules: Nimbus grows one size every 4 gems (1 → 5)', JSON.stringify(r.sizes) === JSON.stringify([1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5]), r.sizes);
  check('rules: size 5 + 4 gems starts the rain shower (rainT 2.5 s, invulnerable, mood rain)', r.showerStart.shower === 1 && r.showerStart.rainT > 2.3 && r.showerStart.size === 5 && r.showerStart.invuln >= 2.4 && r.showerStart.mood === 'rain', r.showerStart);
  check('rules: the shower washes a hanging burr off its branch (harmless)', r.showerStart.burr === 'gone' && r.showerStart.washed, r.showerStart);
  check('rules: the shower pops every bubble on screen (by rain)', r.shower.allGone && r.shower.rainPops >= 7, r.shower);
  check('rules: rain pops score at the current size (5 → 50 each), no growth during the shower', r.shower.pts.every(x => x === 50) && r.shower.grows === 0, { pts: r.shower.pts, grows: r.shower.grows });
  check('rules: after the shower: +50 × (level+1) bonus, size back to 1, showerEnd + shrink(1)', r.shower.bonus === 50 * (r.shower.level + 1) && r.shower.size === 1 && r.shower.grow === 0 && r.shower.end === 1 && r.shower.shrink.includes(1) && r.shower.rainT === 0, r.shower);
  check('rules: a hanging burr above Nimbus does not hurt while it dangles', !r.bump.hangBump && !r.hang.bump && r.hang.overlap, r.hang);
  check('rules: a falling burr bump costs one heart and shrinks Nimbus one size (3 → 2)', r.bump.bump === 1 && r.bump.hearts[1] === r.bump.hearts[0] - 1 && r.bump.heartLost === 1 && r.bump.size === 2 && r.bump.shrink.includes(2) && r.bump.hit, r.bump);
  check('rules: bump at size 1 keeps size 1', r.bumpSize1.size === 1 && r.bumpSize1.hearts === r.bumpSize1.max - 1, r.bumpSize1);
  check('rules: no second bump during the 1.5 s blink of safety', r.invuln.first === 1 && r.invuln.second === 0, r.invuln);
  check('rules: a rolling burr never hurts', r.roll.wasRoll && r.roll.rollBump === 0, r.roll);
  check('rules: full jar → level up, bonus 100, +1 heart, gems reset, next zone', JSON.stringify(r.level1.lv) === '[[1,1,100]]' && r.level1.hearts[0] === r.level1.hearts[1] && r.level1.gain === 1 && r.level1.gems === 0 && r.level1.delta === 10 + 100, r.level1);
  check('rules: level up at full hearts gives no extra heart (capped at max)', JSON.stringify(r.level2.lv) === '[[2,2,200]]' && r.level2.hearts[0] === r.level2.hearts[1] && r.level2.gain === 0, r.level2);
  check('rules: after Night the garden loops to Dawn (round 2) with goal +2; Night bonus 100 × 4', r.loop.level === 4 && r.loop.zone === 0 && r.loop.loop === 1 && r.loop.goal === r.loop.base + 2 && r.loop.bonus === 400, r.loop);
  check('rules: hearts Easy 5 / Normal 3 / Hard 3', JSON.stringify(r.hearts) === '[5,3,3]', r.hearts);
  check('rules: last heart → phase over, one gameOver event, no more spawns / pops / burrs', r.over.phase === 'over' && r.over.go === 1 && r.over.hearts === 0 && r.over.spawnsAfter === 0 && r.over.popsAfter === 0 && r.over.hangsAfter === 0, r.over);
  check('rules: an escaped bubble costs nothing', r.escape.escaped === 1 && r.escape.hearts && r.escape.score, r.escape);
  check('rules: the world is deterministic for seed + inputs (bot, 40 s)', r.det);
  // the same rules in the live game (events reach the game and HUD)
  await startCalm(p, true);
  const live = await p.evaluate(async () => {
    const w = NB.debug.world; w.hero.size = 2; w.hero.gemsInSize = 0;
    const b = w.spawnBubble(w.hero.x); b.x = w.hero.x; b.y = w.hero.y; b.prevX = b.x; b.prevY = b.y;
    await new Promise(r => setTimeout(r, 300));
    const h0 = w.hearts; w.hero.invuln = 0; w.spawnBurr(w.hero.x);
    await new Promise(r => setTimeout(r, 3000));
    return { score: w.score, hearts: [h0, w.hearts], pop: window._ev.filter(e => e.type === 'pop').map(e => e.points), bump: window._ev.filter(e => e.type === 'bump').length, stats: NB.Game.stats.errors.length };
  });
  check('rules (live): a pop at size 2 scores 20 and a bump costs a heart in the running game', live.pop[0] === 20 && live.score >= 20 && live.hearts[1] === live.hearts[0] - 1 && live.bump === 1, live);
  await p.evaluate(() => { const w = NB.debug.world; w.gems = w.goal - 1; const b = w.spawnBubble(w.hero.x); b.x = w.hero.x; b.y = w.hero.y; b.prevX = b.x; b.prevY = b.y; });
  await sleep(600);
  check('rules (live): a full jar moves the scene to Noon (renderer + weather follow)', await p.evaluate(() => NB.debug.world.zone === 1 && NB.Game.renderer.vis.cur === 1));
  check('rules: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= live game over + restart lock
async function sOver() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7&diff=normal');
  await startCalm(p, true);
  await p.evaluate(() => { NB.debug.world.score = 560; });
  const ok = await killNow(p, 560);
  check('over: the last heart ends the run → scrOver after the nap delay', ok && await ui(p) === 'scrOver');
  const info = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, hud: document.getElementById('hud').classList.contains('hidden'), stats: document.getElementById('overStats').textContent }));
  check('over: final score and best shown, HUD hidden, stats line filled', info.score === '560' && +info.best >= 560 && info.hud && /Gems/.test(info.stats), info);
  // restart lock: Enter / Space / Play Again right away do nothing
  const s0 = await starts(p);
  await p.keyboard.press('Enter'); await p.keyboard.press('Space');
  await p.evaluate(() => document.getElementById('btnAgain').click());
  await sleep(50);
  check('over: Enter / Space / Play Again within the 0.7 s lock do not restart', await starts(p) === s0 && await mode(p) === 'over');
  await sleep(800);
  await p.keyboard.press('Enter'); await sleep(300);
  check('over: Enter after the lock restarts exactly once (focused Play Again, no double start)', await starts(p) === s0 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s0 });
  await killNow(p, 0); await sleep(850);
  const s1 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('over: Space after the lock restarts exactly once', await starts(p) === s1 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s1 });
  // holding Enter (key repeat) restarts once
  await killNow(p, 0); await sleep(850);
  const s2 = await starts(p);
  await p.keyboard.down('Enter'); for (let i = 0; i < 6; i++) { await sleep(60); await p.keyboard.down('Enter'); } await p.keyboard.up('Enter');
  await sleep(300);
  check('over: holding Enter (key repeat) restarts once', await starts(p) === s2 + 1, { starts: (await starts(p)) - s2 });
  // Enter on a focused "Menu" goes to the menu, no restart
  await killNow(p, 0); await sleep(850);
  await p.focus('#btnOverMenu');
  const s3 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(300);
  check('over: Enter on a focused Menu button goes to the title (no restart)', await starts(p) === s3 && await mode(p) === 'title');
  // stats line counts games
  check('over: NB.debug.stats counts finished games', await p.evaluate(() => NB.debug.stats.games >= 4 && NB.debug.stats.scores.length === NB.debug.stats.games));
  check('over: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= focus / double-trigger
async function sFocus() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  await sleep(200);
  let s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('focus: Space on the title (Play focused) starts exactly once', await starts(p) === s0 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s0 });
  await p.evaluate(() => NB.Game.toTitle()); await sleep(200);
  s0 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(300);
  check('focus: Enter on the title (Play focused) starts exactly once', await starts(p) === s0 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s0 });
  check('focus: nothing keeps keyboard focus once playing', await p.evaluate(() => !document.activeElement || document.activeElement === document.body));
  await p.evaluate(() => NB.Game.toTitle()); await sleep(200);
  await p.focus('#btnHow'); s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('focus: Space on a focused "How to Play" opens it (does not start)', await starts(p) === s0 && await ui(p) === 'scrHow');
  await p.keyboard.press('Enter'); await sleep(300);
  check('focus: Enter on How to Play\'s focused OK goes back to the title, no start', await ui(p) === 'scrTitle' && await starts(p) === s0);
  await p.focus('#btnSettings'); await p.keyboard.press('Enter'); await waitUi(p, 'scrSettings'); await sleep(100);
  const f = await p.evaluate(() => document.activeElement && (document.activeElement.className || document.activeElement.id));
  check('focus: Settings focuses Done (never Reset best)', /btn-back/.test(f), f);
  await p.keyboard.press('Space'); await sleep(200);
  check('focus: Space on Done closes Settings', await ui(p) === 'scrTitle');
  // pause screen: Resume focused, Space / Enter resume once, no restart
  await startCalm(p);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause'); await sleep(100);
  s0 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(250);
  check('focus: Enter on the focused Resume button resumes (no restart)', await mode(p) === 'playing' && await starts(p) === s0);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause'); await sleep(100);
  await p.keyboard.press('Space'); await sleep(250);
  check('focus: Space on the focused Resume button resumes', await mode(p) === 'playing' && await starts(p) === s0);
  // Play clicked with the mouse, then Space: Play button must not stay focused and restart
  await p.evaluate(() => NB.Game.toTitle()); await sleep(200);
  await p.click('#btnPlay'); await waitMode(p, 'playing');
  s0 = await starts(p);
  await p.keyboard.press('Space'); await p.keyboard.press('Enter'); await sleep(250);
  check('focus: after clicking Play, Space / Enter do not start a second game', await starts(p) === s0);
  // pause → Restart via keyboard: Tab to Restart + Enter starts exactly once
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause'); await sleep(100);
  await p.focus('#btnRestart'); s0 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(300);
  check('focus: Enter on a focused Restart restarts exactly once', await starts(p) === s0 + 1 && await mode(p) === 'playing');
  check('focus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= settings
async function sSettings() {
  const { page: p, errs, ctx } = await open({}, '?seed=2');
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await instrument(p);
  check('settings: first run defaults (sound + music on, Easy)', await p.evaluate(() => { const s = NB.Game.settings; return s.sfx && s.music && !s.muted && s.difficulty === 'easy'; }));
  const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem('nbg:settings') || 'null'));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('label.set:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]');
  check('settings: Hard highlighted', await p.evaluate(() => document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
  check('settings: audio options follow the toggles', await p.evaluate(() => { const o = NB.Audio.opts || NB.Audio.options || null; return !o || (o.sfx === false && o.music === false); }));
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('KeyM');
  let s = await ls();
  check('settings: sfx/music off, Hard and mute saved to localStorage', s && s.sfx === false && s.music === false && s.difficulty === 'hard' && s.muted === true, s);
  await p.reload(); await instrument(p);
  const r = await p.evaluate(() => ({ s: NB.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, diff: NB.Game.difficulty() }));
  check('settings: survive a reload (state + controls)', !r.s.sfx && !r.s.music && r.s.muted && r.s.difficulty === 'hard' && !r.sfx && !r.music && r.on === 'hard' && r.diff === 'hard', r);
  await p.evaluate(() => NB.Game.startGame()); await waitMode(p, 'playing');
  check('settings: a new game uses the saved difficulty (Hard: 3 hearts)', await p.evaluate(() => NB.debug.world.difficulty === 'hard' && NB.debug.world.maxHearts === 3));
  await p.evaluate(() => NB.Game.toTitle());
  // test flags never saved
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(GAME + '?mute=1&diff=normal&seed=2'); await instrument(p);
  check('settings: ?mute=1 mutes audio without touching saved settings', await p.evaluate(() => NB.Game.urlMute && !NB.Game.settings.muted && localStorage.getItem('nbg:settings') === null));
  check('settings: ?diff=normal is used for play', await p.evaluate(() => NB.Game.difficulty() === 'normal' && NB.Game.settings.difficulty === 'easy'));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  s = await ls();
  check('settings: saving another setting under ?mute=1&diff=normal stores muted:false, difficulty:easy', s && s.muted === false && s.difficulty === 'easy' && s.sfx === false, s);
  await p.keyboard.press('KeyM');
  s = await ls();
  check('settings: M under ?mute=1 unmutes for this session without saving "muted"', await p.evaluate(() => !NB.Game.urlMute) && s.muted === false, s);
  await p.goto(GAME + '?seed=2'); await instrument(p);
  check('settings: after leaving the test URL the saved difficulty is still Easy, not muted', await p.evaluate(() => NB.Game.difficulty() === 'easy' && !NB.Game.settings.muted));
  // Reset best: two taps
  await p.evaluate(() => { NB.Storage.set('best_easy', '77'); NB.Storage.set('best_hard', '99'); });
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest');
  check('settings: one tap on Reset best only arms it ("Sure?")', await p.evaluate(() => localStorage.getItem('nbg:best_hard') === '99' && document.getElementById('btnResetBest').textContent === 'Sure?'));
  await p.click('#btnResetBest');
  check('settings: a second tap clears every best', await p.evaluate(() => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('nbg:best_' + d) === null)));
  check('settings: storage keys use the nbg: prefix only', await p.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('nbg:'))));
  check('settings: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= best score per difficulty
async function sBest() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: p, errs } = await open(null, '?mute=1&seed=4', ctx);
  await p.evaluate(() => { localStorage.clear(); NB.Storage.cache = {}; });
  for (const [d, sc] of [['easy', 120], ['normal', 340], ['hard', 560]]) {
    await p.evaluate(d => NB.Game.setSetting('difficulty', d), d);
    await startCalm(p, true);
    await killNow(p, sc);
  }
  const b = await p.evaluate(() => ['easy', 'normal', 'hard'].map(d => localStorage.getItem('nbg:best_' + d)));
  check('best: saved separately per difficulty', b[0] === '120' && b[1] === '340' && b[2] === '560', b);
  await p.evaluate(() => NB.Game.setSetting('difficulty', 'normal'));
  await startCalm(p, true); await killNow(p, 100);
  check('best: a lower score does not overwrite the best; NEW! hidden', await p.evaluate(() => localStorage.getItem('nbg:best_normal') === '340' && document.getElementById('newBest').classList.contains('hidden') && document.getElementById('overBest').textContent === '340'));
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  await p.reload(); await instrument(p);
  const titles = [];
  for (const d of ['easy', 'normal', 'hard']) { await p.evaluate(d => { NB.Game.setSetting('difficulty', d); NB.UI.show('scrTitle'); }, d); titles.push(await p.textContent('#bestTitle')); }
  check('best: after a reload the title shows the best of the chosen difficulty', titles.join() === '120,340,560', titles);
  // a mid-run difficulty change: the run still counts for the difficulty it started on
  await p.evaluate(() => NB.Game.setSetting('difficulty', 'easy'));
  await startCalm(p, true);
  await p.evaluate(() => { NB.Game.setSetting('difficulty', 'hard'); });
  const hudBest = await p.evaluate(() => NB.Game.best(NB.Game.runDifficulty));
  await killNow(p, 200);
  check('best: a run started on Easy saves to best_easy even if Settings changed mid-run', await p.evaluate(() => localStorage.getItem('nbg:best_easy') === '200' && localStorage.getItem('nbg:best_hard') === '560'));
  check('best: the in-game HUD "Best" belongs to the run\'s difficulty', hudBest === 120, { hudBest });
  check('best: NEW! badge shown for a new best', await p.evaluate(() => !document.getElementById('newBest').classList.contains('hidden')));
  // ?diff=hard plays hard and saves to best_hard
  await p.goto(GAME + '?mute=1&seed=4&diff=hard'); await instrument(p);
  await p.evaluate(() => NB.Game.setSetting('difficulty', 'normal'));
  await startCalm(p, true); await killNow(p, 900);
  const hb = await p.evaluate(() => ({ hard: localStorage.getItem('nbg:best_hard'), normal: localStorage.getItem('nbg:best_normal'), saved: JSON.parse(localStorage.getItem('nbg:settings')).difficulty }));
  check('best: a ?diff=hard run saves to best_hard, and ?diff is never saved', hb.hard === '900' && hb.normal === '340' && hb.saved === 'normal', hb);
  check('best: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= pictures
async function sPictures() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=4&diff=easy');
  await p.evaluate(() => { localStorage.clear(); });
  const mk = await p.evaluate(async () => {
    const out = {};
    const enc = (c, type, q) => new Promise(r => c.toBlob(b => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }, type, q));
    let c = document.createElement('canvas'); c.width = 400; c.height = 300; let g = c.getContext('2d');
    g.fillStyle = '#e0302a'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60);
    out.photo = await enc(c, 'image/png');
    c = document.createElement('canvas'); c.width = 200; c.height = 200; g = c.getContext('2d');
    g.fillStyle = '#20c040'; g.beginPath(); g.arc(100, 100, 80, 0, 7); g.fill();
    out.cut = await enc(c, 'image/png');
    c = document.createElement('canvas'); c.width = 1200; c.height = 800; g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, '#2050ff'); gr.addColorStop(1, '#20ffa0'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 800);
    out.bg = await enc(c, 'image/jpeg', 0.9);
    c = document.createElement('canvas'); c.width = 6000; c.height = 4000; g = c.getContext('2d');
    const g2 = g.createLinearGradient(0, 0, 6000, 4000); g2.addColorStop(0, '#147'); g2.addColorStop(0.5, '#6cf'); g2.addColorStop(1, '#fe9'); g.fillStyle = g2; g.fillRect(0, 0, 6000, 4000);
    for (let i = 0; i < 200; i++) { g.fillStyle = `hsl(${i * 37 % 360},70%,60%)`; g.beginPath(); g.arc((i * 911) % 6000, (i * 577) % 4000, 60 + i % 120, 0, 7); g.fill(); }
    out.huge = await enc(c, 'image/jpeg', 0.85);
    return out;
  });
  const files = {
    photo: { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(mk.photo, 'base64') },
    cut: { name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(mk.cut, 'base64') },
    bg: { name: 'garden.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(mk.bg, 'base64') },
    huge: { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(mk.huge, 'base64') },
    txt: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') },
    broken: { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png') }
  };
  const slotIndex = { hero: 0, gem: 1, bg_dawn: 2, bg_noon: 3, bg_sunset: 4, bg_night: 5 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  check('pictures: 6 slots (Nimbus, Gem, Dawn, Noon, Sunset, Night)', await p.evaluate(() => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent).join()) === 'Nimbus,Gem,Dawn,Noon,Sunset,Night');
  const waitToast = () => p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && t.textContent && !/Saving/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});
  const clearToast = () => p.evaluate(() => { const t = document.getElementById('toast'); t.classList.add('hidden'); t.textContent = ''; });
  // the first one through the real "Choose…" button + file chooser
  async function pickChooser(slot, file) {
    await clearToast();
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await waitToast();
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  // the rest: setInputFiles on the hidden #filePick (the slot is armed the way Choose… arms it)
  async function pick(slot, file) {
    await clearToast();
    await p.evaluate(s => { NB.UI._pickSlot = s; }, slot);
    await p.setInputFiles('#filePick', file);
    await waitToast();
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('nbg:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('nbg:shape_' + slot) };
  }, slot);
  let toast = await pickChooser('hero', files.photo), s = await stored('hero');
  check('pictures: Choose… opens the file picker; an opaque photo → Nimbus, saved, made round ("circle")', /saved/i.test(toast) && s && s.shape === 'circle' && await p.evaluate(() => NB.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('gem', files.cut); s = await stored('gem');
  check('pictures: a transparent cut-out → Gem, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit', { toast, s });
  toast = await pick('bg_dawn', files.bg); s = await stored('bg_dawn');
  check('pictures: a picture → Dawn background (JPEG, 1200 wide kept)', /saved/i.test(toast) && s && s.type === 'image/jpeg' && s.w === 1200, { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(1) .tag');
  check('pictures: the card shows "Your picture"', /Your picture/.test(tag), tag);
  toast = await pick('bg_noon', files.txt); s = await stored('bg_noon');
  check('pictures: a text file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('bg_noon', files.broken); s = await stored('bg_noon');
  check('pictures: a broken "PNG" → friendly error toast, nothing stored', /could not be opened/i.test(toast) && s === null, toast);
  toast = await pick('bg_night', files.huge); s = await stored('bg_night');
  check('pictures: 6000×4000 photo → Night background downscaled to 1600×1067 JPEG', /saved/i.test(toast) && s && s.w === 1600 && Math.abs(s.h - 1067) <= 1 && s.type === 'image/jpeg', { toast, s });
  toast = await pick('gem', files.huge); s = await stored('gem');
  check('pictures: 6000×4000 photo → Gem downscaled to ≤ 512 px (and made round)', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512 && s.shape === 'circle', { toast, s });
  await p.click('#slotGrid .slot:nth-child(2) .shape button[data-shape=fit]');
  check('pictures: the shape buttons switch the Gem to "Whole picture"', await p.evaluate(() => localStorage.getItem('nbg:shape_gem') === 'fit' && document.querySelector('#slotGrid .slot:nth-child(2) .shape button.on').dataset.shape === 'fit'));
  toast = await pick('gem', files.cut);
  check('pictures: a gem picture can be replaced again', /saved/i.test(toast) && (await stored('gem')).w === 200);
  check('pictures: total stored picture data stays small (< 2.5 MB in localStorage)', await p.evaluate(() => Object.keys(localStorage).filter(k => /img_/.test(k)).reduce((a, k) => a + localStorage.getItem(k).length, 0) < 2.5e6));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  // play with the custom pictures
  await p.evaluate(() => { NB.Game.startGame(); NB.debug.setBot(true, 1); NB.debug.setSpeed(2); });
  await p.waitForFunction(() => NB.debug.world.stats.pops >= 4, null, { timeout: 25000 }).catch(() => {});
  await p.evaluate(() => { NB.debug.setBot(false); const w = NB.debug.world, L = w.layout; w.hearts = 99; w._spawnT = 1e9; w._burrT = 1e9; w.bubbles.length = 0; w.burrs.length = 0;
    w.hero.size = 3; w.hero.r = w.rFor(3); w.hero.rainT = 0; w.setTarget(L.width * 0.3, (L.minY + L.maxY) / 2); });
  await sleep(1500);
  await p.evaluate(() => { const w = NB.debug.world, L = w.layout; const b = w.spawnBubble(L.width * 0.75, 2); b.y = b.prevY = (L.minY + L.maxY) / 2; b.rise = 0; b.vy = 0; window._gb = b; NB.debug.setSpeed(0.001); });
  await sleep(700);
  const play = await p.evaluate(() => {
    const R = NB.Game.renderer, w = NB.debug.world, g = R.canvas.getContext('2d'), px = R.px;
    const at = (x, y) => { const d = g.getImageData(Math.round(x * px), Math.round(y * px), 1, 1).data; return [d[0], d[1], d[2]]; };
    const h = w.hero, u = w.layout.unit, b = window._gb;
    const heroPx = [[0, 0], [-0.1 * u, 0.05 * u], [0.1 * u, -0.05 * u], [0, -0.1 * u]].map(([dx, dy]) => at(h.x + dx, h.y + dy));
    const gemPx = [[0, 0], [0.05 * u, 0], [-0.05 * u, 0.03 * u]].map(([dx, dy]) => at(b.x + dx, b.y + dy));
    const skyPx = at(R.VW * 0.5, R.VH * 0.25);
    return { custom: !!R.background(0).custom, zone: R.vis.cur, pops: w.stats.pops, errors: NB.debug.stats.errors.length, heroPx, gemPx, skyPx, bstate: b.state };
  });
  await p.evaluate(() => NB.debug.setSpeed(1));
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const red = c => c[0] > 150 && c[1] < 110 && c[2] < 110;
  check('pictures: the game plays with custom Nimbus / gem / Dawn background, bubbles still popped, no errors', play.custom && play.pops >= 4 && play.errors === 0, { custom: play.custom, pops: play.pops, errors: play.errors });
  check('pictures: Nimbus is drawn with the custom photo (red pixels at her body)', play.heroPx.filter(red).length >= 3, play.heroPx);
  check('pictures: the gem inside a bubble is drawn with the custom picture (green pixels)', play.gemPx.filter(c => c[1] > 120 && c[1] > c[0] + 40).length >= 2, { gemPx: play.gemPx, state: play.bstate });
  check('pictures: the Dawn sky is the custom photo (blue-green, not the lilac gradient)', play.skyPx[2] > 120 && play.skyPx[0] < 120, play.skyPx);
  await p.evaluate(() => NB.debug.gotoLevel(1)); await sleep(2000);
  check('pictures: Noon (no custom picture) still uses the default scene', await p.evaluate(() => !NB.Game.renderer.background(1).custom));
  await p.evaluate(() => NB.debug.gotoLevel(3)); await sleep(2000);
  check('pictures: Night uses the custom 6000×4000 photo without errors', await p.evaluate(() => NB.Game.renderer.background(3).custom && NB.debug.stats.errors.length === 0));
  await p.reload(); await instrument(p);
  check('pictures: custom pictures survive a reload', await p.evaluate(() => ['hero', 'gem', 'bg_dawn', 'bg_night'].every(s => NB.Assets.hasCustom(s))));
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: NB.Assets.hasCustom('hero'), k: localStorage.getItem('nbg:img_hero'), shape: localStorage.getItem('nbg:shape_hero'), gem: NB.Assets.hasCustom('gem') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.gem, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: NB.Assets.SLOTS.some(s => NB.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^nbg:(img|shape)_/.test(k)), tags: [...document.querySelectorAll('#slotGrid .tag')].map(t => t.textContent) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0 && r2.tags.every(t => t === 'Original'), r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => NB.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene and Nimbus are drawn again', await p.evaluate(() => !NB.Game.renderer.background(0).custom && !NB.Assets.hasCustom('hero')));
  check('pictures: no console errors', errs.length === 0 && await p.evaluate(() => NB.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= layout
async function sLayout() {
  const sizes = [
    ['1280x720', { width: 1280, height: 720 }, 1, false, null],
    ['1920x1080', { width: 1920, height: 1080 }, 1, false, null],
    ['ipad_land_1024x768', { width: 1024, height: 768 }, 2, true, { top: 24, right: 0, bottom: 20, left: 0 }],
    ['ipad_port_768x1024', { width: 768, height: 1024 }, 2, true, { top: 24, right: 0, bottom: 20, left: 0 }],
    ['iphone_port_390x844', { width: 390, height: 844 }, 3, true, { top: 47, right: 0, bottom: 34, left: 0 }],
    ['iphone_land_844x390', { width: 844, height: 390 }, 3, true, { top: 0, right: 47, bottom: 21, left: 47 }]
  ];
  for (const [name, vp, dpr, mobile, safe] of sizes) {
    const tag = `${name}@${dpr}x`;
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=1&diff=easy&speed=2');
    await waitMode(p, 'playing');
    if (safe) {   // emulate the notch / home-bar insets the way iOS reports them (env(safe-area-inset-*) on #safeProbe)
      await p.addStyleTag({ content: `#safeProbe{padding:${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left}px !important}` });
      await p.evaluate(() => NB.Game.relayout());
    }
    await p.waitForFunction(() => NB.debug.world.stats.pops > 3, null, { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => NB.debug.setSpeed(1)); await sleep(500);
    await p.screenshot({ path: OUT + `/func_${name}_play.png` });
    const geo = await p.evaluate(() => {
      const R = NB.Game.renderer, w = NB.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW, u = L.unit;
      const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
      const hud = document.getElementById('hud').getBoundingClientRect();
      // Nimbus at size 5 in the four corners of her box. The sprite square is 2.5 r but its body circle (r 50 of the
      // 128 viewBox) is 0.98 r, so the visible body is ≈ r: test r.
      const r5 = w.rFor(5), bx = w._box(r5), S = r5 * 1.0;
      // the whole play box (Nimbus at size 1 anywhere, bubbles born at puddles) vs the safe area
      const r1 = w.rFor(1), b1 = w._box(r1), P = w._puddles();
      const playBox = { l: b1.x0 - r1, t: b1.y0 - r1, r: b1.x1 + r1, b: b1.y1 + r1 }, puddles = P.length ? [Math.min(...P), Math.max(...P)] : null;
      const corners = [[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x0, bx.y1], [bx.x1, bx.y1]].map(([x, y]) => css(x - S, y - S, 2 * S, 2 * S));
      const K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, top = I.top + 12, hb = R._hudBtn, VW = R.VW;
      const hs = 22 * Math.min(K, 1.15), pw = Math.max(180 * Math.min(K, 1.1), 28 + w.maxHearts * (hs + 4));
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const right = hb ? hb.l - 10 : VW - 110; let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 220, 330); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      const panels = [['score', [x0, top, pw, 98]], ['jar', [cx - cw / 2, cy, cw, 78]]].map(([n, a]) => [n, css(...a), a]);
      const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; });
      // where burrs dangle (sprite 0.7 u) vs the HUD panels: the dangling warning must be visible somewhere along the top
      const hangY = L.topY + 0.15 * u, bs = 0.35 * u;
      let hidden = 0, total = 0;
      for (let x = 0.5 * u; x <= L.width - 0.5 * u; x += 4) { total++; if (panels.some(([n, , a]) => x > a[0] && x < a[0] + a[2] && hangY + bs * 0.3 < a[1] + a[3])) hidden++; }
      const ins = R.ins;
      const safeCss = { l: c.left + ins.left * k, t: c.top + ins.top * k, r: c.right - ins.right * k, b: c.bottom - ins.bottom * k };
      return { vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, portrait: L.portrait, unit: +u.toFixed(1), canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, corners, panels,
        hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btns, px: R.px, canvasPx: R.canvas.width, ins, safeCss, hangHidden: +(hidden / total).toFixed(2),
        playBox, puddles, hangY,
        docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bodyW: document.body.scrollWidth, errors: NB.debug.stats.errors.length,
        lowY: R._lowY(), groundY: L.groundY, maxY: L.maxY };
    });
    const inVp = (r, slack = 1) => r && r.l >= -slack && r.t >= -slack && r.r <= geo.vw + slack && r.b <= geo.vh + slack;
    const inside = (a, b, slack = 1) => a && b && a.l >= b.l - slack && a.t >= b.t - slack && a.r <= b.r + slack && a.b <= b.b + slack;
    const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    const R0 = r => r && ({ l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) });
    check(`layout ${tag}: canvas inside the viewport, no page scroll`, inVp(geo.canvas) && geo.docW <= geo.vw && geo.bodyW <= geo.vw && geo.docH <= geo.vh, { canvas: R0(geo.canvas), VW: geo.VW, VH: geo.VH, doc: [geo.docW, geo.docH] });
    check(`layout ${tag}: HUD buttons visible, inside the viewport${mobile ? ', ≥ 44 css px' : ''}`, geo.hud.w > 0 && inVp(geo.hud) && geo.btns.every(b => inVp(b) && (!mobile || (b.w >= 43.5 && b.h >= 43.5))), geo.btns.map(b => Math.round(b.w) + 'x' + Math.round(b.h)));
    if (safe) {
      check(`layout ${tag}: HUD buttons inside the safe area (insets ${JSON.stringify(safe)})`, geo.btns.every(b => b.t >= safe.top - 0.5 && b.r <= geo.vw - safe.right + 0.5), geo.btns.map(R0));
      check(`layout ${tag}: HUD panels inside the safe area`, geo.panels.every(([n, r]) => inside(r, geo.safeCss)), geo.panels.map(([n, r]) => n + ':' + JSON.stringify(R0(r))));
      const I = geo.ins, pb = geo.playBox, pud = geo.puddles;
      const okPlay = pb.l >= I.left - 1 && pb.r <= geo.VW - I.right + 1 && pb.t >= I.top - 1 && geo.hangY - 0.35 * geo.unit >= I.top - 1 && (!pud || (pud[0] - 0.42 * geo.unit >= I.left - 1 && pud[1] + 0.42 * geo.unit <= geo.VW - I.right + 1));
      check(`layout ${tag}: play area (Nimbus box, puddle bubbles, dangling burrs) clear of the notch / safe-area insets`, okPlay, { insLogical: { l: Math.round(I.left), r: Math.round(I.right), t: Math.round(I.top) }, playBox: R0(pb), VW: geo.VW, puddles: pud && pud.map(Math.round), hangTop: Math.round(geo.hangY - 0.35 * geo.unit) });
    }
    check(`layout ${tag}: Nimbus (size 5 sprite) on screen in every corner of her box`, geo.corners.every(b => inside(b, geo.canvas, 2)), geo.corners.map(R0));
    const bad = geo.panels.filter(([n, r]) => !inside(r, geo.canvas) || ov(r, geo.hud)).map(([n, r]) => n + ':' + JSON.stringify(R0(r)));
    check(`layout ${tag}: HUD panels inside the canvas and clear of pause/mute`, bad.length === 0, bad.length ? bad : { hud: R0(geo.hud) });
    check(`layout ${tag}: HUD panels do not overlap each other`, !ov(geo.panels[0][1], geo.panels[1][1]), geo.panels.map(([n, r]) => n + ':' + JSON.stringify(R0(r))));
    check(`layout ${tag}: dangling burrs not hidden under the HUD panels on most of the width (≤ 50 %)`, geo.hangHidden <= 0.5, { hidden: geo.hangHidden, portrait: geo.portrait });
    check(`layout ${tag}: canvas backing store sharp for the DPR (within the pixel cap)`, geo.canvasPx >= Math.min(geo.vw * dpr, Math.sqrt((mobile ? 3.2e6 : 1920 * 1080) * geo.VW / geo.VH)) * 0.6, { px: +geo.px.toFixed(2), canvasPx: geo.canvasPx });
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
      await p.evaluate(s => {
        if (s === 'scrPause') { NB.Game.mode = 'playing'; NB.Game.deadT = -1; NB.debug.world.phase = 'play'; NB.Game.pause(); }
        else if (s === 'scrOver') NB.UI.showGameOver({ score: 24680, best: 24680, newBest: true, cleared: 5, gems: 412, combo: 57, showers: 9, sizeMax: 5, bumps: 3, reached: 'Noon (round 2)' });
        else NB.UI.show(s);
      }, scr);
      await sleep(600);
      const pr = await p.evaluate(s => {
        const el = document.querySelector('#' + s + ' .panel') || document.querySelector('#' + s + ' .title-wrap');
        const r = el.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#' + s + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0)
          .map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.dataset.v || b.dataset.act || b.dataset.shape || b.textContent.trim().slice(0, 10), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height }; });
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroll: el.scrollHeight > el.clientHeight + 2, sw: el.scrollWidth > el.clientWidth + 1, btns, docW: document.documentElement.scrollWidth };
      }, scr);
      if (mobile || name === '1280x720') await p.screenshot({ path: OUT + `/func_${name}_${scr}.png` });
      const offBtns = pr.btns.filter(b => !(b.l >= -1 && b.r <= geo.vw + 1) || (!pr.scroll && !inVp(b, 1))).map(b => b.id);
      const okFit = inVp(pr) && offBtns.length === 0 && (!pr.scroll || scr === 'scrCustom') && !pr.sw && pr.docW <= geo.vw;
      check(`layout ${tag}: ${scr} fits the screen (all buttons visible${scr === 'scrCustom' ? '' : ', no scrolling'})`, okFit, okFit ? undefined : { panel: R0(pr), scroll: pr.scroll, hscroll: pr.sw, offBtns });
      if (mobile) {
        const small = pr.btns.filter(b => b.h < 31.5).map(b => b.id + ':' + Math.round(b.h));
        check(`layout ${tag}: ${scr} buttons finger-sized (≥ 32 px tall)`, small.length === 0, small.length ? small : undefined);
      }
      if (scr === 'scrPause') await p.evaluate(() => NB.Game.resume());
    }
    check(`layout ${tag}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
    await ctx.close();
  }
}

// ======================================================================= rotate / resize mid-game
async function sRotate() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&diff=normal');
  await p.evaluate(() => { NB.Game.startGame(); NB.debug.setBot(true, 1); NB.debug.setSpeed(1.5); const w = NB.debug.world; w.hearts = w.maxHearts = 99; });
  await sleep(4000);
  const vps = [[390, 844], [844, 390], [768, 1024], [1024, 768], [390, 844], [1280, 720], [844, 390], [390, 844]];
  const outs = [];
  for (const [a, b] of vps) {
    // put Nimbus in the far right-bottom corner just before the turn (worst case), with a falling burr and bubbles near the edge
    await p.evaluate(() => { const w = NB.debug.world, L = w.layout; NB.debug.setBot(false); w.setTarget(1e5, 1e5); w.hero.x = L.width - w.hero.r; w.hero.y = L.maxY - w.hero.r; w.spawnBubble(L.width - 5); const c = w.spawnBurr(L.width - 0.5 * L.unit); c.t = 99; });
    await sleep(250);
    await p.setViewportSize({ width: a, height: b });
    await sleep(400);
    const r = await p.evaluate(() => {
      const w = NB.debug.world, L = w.layout, R = NB.Game.renderer, h = w.hero, E = 0.5;
      const heroIn = h.x - h.r >= -E && h.x + h.r <= L.width + E && h.y - h.r >= L.minY - E && h.y + h.r <= L.maxY + E && h.tx >= 0 && h.tx <= L.width;
      const bubOut = w.bubbles.filter(b => b.state === 'rise' && (b.x < -E || b.x > L.width + E || b.y > L.height + b.r)).length;
      const burOut = w.burrs.filter(c => c.state !== 'gone' && (c.x < -E || c.x > L.width + E || c.y > L.groundY)).length;
      const burInfo = w.burrs.filter(c => c.state !== "gone").map(c => [c.state, Math.round(c.x), Math.round(c.y), Math.round(L.groundY), Math.round(c.fade * 100)]);
      return { burInfo, VW: R.VW, VH: R.VH, lw: L.width, lh: L.height, portrait: L.portrait, heroIn, bubOut, burOut, hero: [Math.round(h.x), Math.round(h.y), Math.round(h.r)], max: [L.width, Math.round(L.maxY)] };
    });
    outs.push(r);
    await p.evaluate(() => NB.debug.setBot(true, 1));
    await sleep(900);
  }
  check('rotate: world layout follows the screen after every rotate', outs.every(r => r.lw === r.VW && r.lh === r.VH), outs.map(r => [r.lw, r.VW, r.lh, r.VH]));
  check('rotate: Nimbus stays inside her box after every rotate (corner case)', outs.every(r => r.heroIn), outs.filter(r => !r.heroIn));
  check('rotate: bubbles stay inside the screen after every rotate', outs.every(r => r.bubOut === 0), outs.map(r => r.bubOut));
  check('rotate: burrs stay inside the screen and above the lawn after every rotate', outs.every(r => r.burOut === 0), outs.map(r => r.burOut ? r.burInfo : 0));
  // rotate while paused: stays paused, no step
  await p.evaluate(() => NB.Game.pause());
  const t0 = await p.evaluate(() => NB.debug.world.time);
  await p.setViewportSize({ width: 844, height: 390 }); await sleep(500);
  check('rotate: rotating while paused keeps the game paused and frozen', await mode(p) === 'paused' && await p.evaluate(t => NB.debug.world.time === t, t0));
  await p.evaluate(() => NB.Game.resume());
  check('rotate: no console errors', errs.length === 0 && await p.evaluate(() => NB.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= window blur / visibility
async function sBlur() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3');
  await startCalm(p);
  await p.keyboard.down('ArrowRight'); await sleep(100);
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  check('blur: window blur pauses the game', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  check('blur: held keys are released on blur', await p.evaluate(() => NB.debug.world._move.x === 0 && NB.debug.world._move.y === 0));
  await p.keyboard.up('ArrowRight');
  await p.evaluate(() => NB.Game.resume());
  const susp = await p.evaluate(() => { let n = 0; const o = NB.Audio.suspend; NB.Audio.suspend = function () { n++; return o.apply(this, arguments); }; window._susp = () => n; return true; });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check('blur: hiding the tab (visibilitychange) pauses and suspends audio', susp && await mode(p) === 'paused' && await p.evaluate(() => window._susp() >= 1));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('blur: coming back stays paused (child resumes on purpose)', await mode(p) === 'paused');
  await p.evaluate(() => NB.Game.resume());
  // a hidden tab does not fast-forward: one long frame is capped
  const t0 = await p.evaluate(() => NB.debug.world.time);
  await p.evaluate(() => { NB.Game.last = performance.now() - 30000; });
  await sleep(50);
  check('blur: a 30 s frame gap does not fast-forward the world (≤ 0.3 s)', await p.evaluate(t => NB.debug.world.time - t < 0.5, t0));
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await p.evaluate(() => NB.Game.toTitle());
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);
  check('blur: blur on the title screen changes nothing', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  check('blur: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= long bot run
async function sLongRun() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=21&autostart=1&bot=1&skill=0.5&speed=16&autorestart=1&diff=normal');
  await waitMode(p, 'playing');
  let overRun = 0, notOver = 0, maxP = 0, maxFx = 0, maxB = 0, maxBurr = 0, maxBurrAll = 0, maxLevel = 0, simT = 0, lastT = -1, stuck = 0, outside = 0;
  const t0 = Date.now();
  let lastKill = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(500);
    // the skill-0.5 bot survives > 12 min of Normal on its own: every ~15 s drop it to one heart and drop a burr right onto it, so autorestart is exercised
    if (Date.now() - lastKill > 15000) { lastKill = Date.now(); await p.evaluate(() => { const w = NB.debug.world; if (NB.Game.mode === 'playing' && w.phase === 'play') { w.hearts = 1; w.hero.invuln = 0; w.hero.rainT = 0; const c = w.spawnBurr(w.hero.x); c.state = 'fall'; c.y = w.hero.y - w.hero.r; c.prevY = c.y; c.vy = 300; } }); }
    const s = await p.evaluate(() => {
      const st = NB.debug.getState(), w = NB.debug.world, L = w.layout, h = w.hero;
      const out = (h.x - h.r < -1 || h.x + h.r > L.width + 1 || h.y - h.r < L.minY - 1 || h.y + h.r > L.maxY + 1) ? 1 : 0;
      return { p: st.particles, fx: st.fx + NB.Game.renderer.texts.length + NB.Game.renderer.flyers.length, level: st.level, counts: st.counts, time: st.time, mode: st.mode, out };
    });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxLevel = Math.max(maxLevel, s.level);
    maxB = Math.max(maxB, s.counts.bubbles); maxBurr = Math.max(maxBurr, s.counts.burrs); maxBurrAll = Math.max(maxBurrAll, s.counts.burrsAll);
    outside += s.out;
    if (s.mode === 'over') { overRun++; notOver = Math.max(notOver, overRun); } else overRun = 0;
    if (s.mode === 'playing' && s.time === lastT) stuck++;
    if (lastT >= 0 && s.time < lastT) simT += lastT;
    lastT = s.time;
  }
  simT += Math.max(0, lastT);
  const stats = await p.evaluate(() => ({ games: NB.debug.stats.games, levels: NB.debug.stats.levels, scores: NB.debug.stats.scores, times: NB.debug.stats.times, pops: NB.debug.stats.pops, bumps: NB.debug.stats.bumps, showers: NB.debug.stats.showers, errors: NB.debug.stats.errors }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxB, maxBurr, maxBurrAll, maxLevel, stats }));
  check('long run: ≥ 4 minutes of game time simulated', simT >= 240, +(simT / 60).toFixed(1) + ' min');
  check('long run: ≥ 2 games completed and auto-restarted', stats.games >= 2, stats.games);
  check('long run: every finished game has a score and a sane length (> 20 s)', stats.scores.every(s => s > 0) && stats.times.every(t => t > 20), { scores: stats.scores, times: stats.times });
  check('long run: the bot pops, grows into showers and gets bumped (all systems exercised)', stats.pops > 100 && stats.showers > 0 && stats.bumps > 0, { pops: stats.pops, showers: stats.showers, bumps: stats.bumps });
  check('long run: autorestart never leaves the game-over screen up', notOver <= 1, notOver);
  check('long run: the world never stalls while playing', stuck === 0, stuck);
  check('long run: Nimbus never leaves her box', outside === 0, outside);
  check('long run: weather particles bounded (< 180)', maxP < 180, maxP);
  check('long run: renderer fx + texts + flyers bounded (≤ 120)', maxFx <= 120, maxFx);
  check('long run: bubbles ≤ maxBubbles(14) + shower slack, live burrs ≤ 3, burr array culled (< 12)', maxB <= 20 && maxBurr <= 3 && maxBurrAll < 12, { maxB, maxBurr, maxBurrAll });
  check('long run: NB.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  const T0 = Date.now();
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const sections = { sStatic, sBoot, sMenus, sKeys, sInput, sTouch, sRules, sOver, sFocus, sSettings, sBest, sPictures, sLayout, sRotate, sBlur, sLongRun };
  for (const [name, fn] of Object.entries(sections)) {
    if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
    console.log('\n== ' + name);
    const t = Date.now();
    try { await fn(); } catch (e) { check(name + ': section ran to the end', false, String(e && e.message || e).split('\n')[0]); }
    console.log(`   (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  console.log(`\nRESULT: ${nPass} passed, ${nFail} failed  (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
  if (nFail) console.log('FAILED:\n  ' + fails.join('\n  '));
  process.exit(nFail ? 1 : 0);
})();
