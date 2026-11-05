// Functional QA suite for Bolt's Rooftop Flip.
// Run: node tests/e2e/functional.js [sectionFilter]      (LONG_RUN_S=75 real seconds at ×16 by default)
// Prints PASS/FAIL per check, screenshots in tests/out/func_*.png, exits 1 on any FAIL.
// Sections: static (Go wrapper + iOS) · boot · menus · input · touch · mech (flip buffer / coyote / resize, headless world) ·
// rules (scoring, gates) · hearts (bump, fall, finish, levels) · pause · over (game-over screen, restart lock) ·
// settings · best · pictures · layout (8 sizes / DPRs) · rotate · long bot run at ?speed=16.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const GAME = 'file://' + path.join(ROOT, 'game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const LONG_RUN_S = +(process.env.LONG_RUN_S || 75);

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
// start counter + event log (copied out of the world's events before the game consumes them)
async function instrument(page) {
  await page.waitForFunction(() => window.RF && RF.debug && RF.Game && RF.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = RF.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; window._ev = []; return o.apply(this, arguments); };
    window._ev = [];
    const h = G.handleEvents;
    G.handleEvents = function (evts) {
      if (this.mode !== 'title') for (const e of evts) window._ev.push({ type: e.type, combo: e.combo, mult: e.mult, points: e.points, bonus: e.bonus, hearts: e.hearts, level: e.level, zone: e.zone, color: e.color, grav: e.grav, side: e.side, score: this.world.score, t: +this.world.time.toFixed(3) });
      if (window._ev.length > 4000) window._ev.splice(0, 2000);
      return h.apply(this, arguments);
    };
  });
}
const mode = p => p.evaluate(() => RF.Game.mode);
const ui = p => p.evaluate(() => RF.UI.current);
const starts = p => p.evaluate(() => RF.Game._starts);
const flips = p => p.evaluate(() => RF.debug.world.stats.flips);
const waitMode = (p, m, t) => p.waitForFunction(m => RF.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => RF.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const grounded = (p, t) => p.waitForFunction(() => { const w = RF.debug.world; return RF.Game.mode === 'playing' && w.hero.grounded && w.hero.state === 'run'; }, null, { timeout: t || 6000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const evs = (p, type) => p.evaluate(t => window._ev.filter(e => e.type === t), type);
async function stageXY(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left + r.width * 0.55, r.top + r.height * 0.5]; }); }
// start a run on a hand-made, fully solid track (no hazards, no fireflies) with lots of batteries
async function startSafe(p, spec, keepHearts) {
  await p.evaluate(() => RF.Game.startGame());
  await waitMode(p, 'playing');
  await p.evaluate(([spec, keep]) => { const w = RF.debug.world; w.setTrack(spec || {}); if (!keep) w.hearts = 99; window._ev = []; }, [spec || null, !!keepHearts]);
  await grounded(p);
}
// game over now: one battery, a vent right ahead, then the 1.6 s death delay
async function killNow(p, score) {
  await p.evaluate(s => { const w = RF.debug.world; w.hearts = 1; w.hero.invuln = 0; if (s != null) w.score = s; w.setTrack({ obstacles: [{ kind: 'vent', x: 1.2 }, { kind: 'sign', x: 1.2 }] }); RF.debug.setSpeed(3); }, score);
  const ok = await waitMode(p, 'over', 10000);
  await p.evaluate(() => RF.debug.setSpeed(1));
  return ok;
}

// ======================================================================= static review
async function sStatic() {
  const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
  check('static/app: fixed loopback port 127.0.0.1:47622 with free-port fallback', /127\.0\.0\.1:47622/.test(go) && /127\.0\.0\.1:0"/.test(go));
  check('static/app: storage in %APPDATA%\\BoltsRooftopFlip\\data', /filepath\.Join\(appData, "BoltsRooftopFlip"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go));
  check('static/app: binds ffStoreAll/Set/Del, ffFullscreen, ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  check('static/app: atomic write (tmp + rename) and key filter', /\.tmp"/.test(go) && /os\.Rename/.test(go) && /\^\[a-zA-Z0-9_\\-\]\{1,64\}\$/.test(go));
  const keys = ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_firefly', 'shape_firefly', 'img_bg_dawn', 'img_bg_noon', 'img_bg_sunset', 'img_bg_night'];
  check('static/app: every storage key the game writes passes the Go key filter', keys.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k)));
  check('static/app: single-instance mutex name and window title match the game', go.includes('BoltsRooftopFlip.SingleInstance') && (go.match(/"Bolt's Rooftop Flip"/g) || []).length >= 3);
  check('static/app: browser fallback strips ?app=1 (Quit would not work in a tab)', /TrimSuffix\(url, "\?app=1"\)/.test(go));
  check('static/app: WebView2 data in %LOCALAPPDATA%\\BoltsRooftopFlip', /filepath\.Join\(localAppData, "BoltsRooftopFlip", "WebView2"\)/.test(go));
  const build = fs.readFileSync(path.join(ROOT, 'tools/build.sh'), 'utf8');
  check('static/app: build produces dist/BoltsRooftopFlip.exe', /dist\/BoltsRooftopFlip\.exe/.test(build));
  const store = fs.readFileSync(path.join(ROOT, 'game/js/storage.js'), 'utf8');
  check('static/app: the JS store uses the same 3 bindings and the brf: prefix', /ffStoreAll/.test(store) && /ffStoreSet/.test(store) && /ffStoreDel/.test(store) && /'brf:'/.test(store));
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  check('static/iOS: viewport no zoom + viewport-fit=cover', /user-scalable=no/.test(html) && /maximum-scale=1/.test(html) && /viewport-fit=cover/.test(html));
  check('static/iOS: apple-mobile-web-app-capable, touch icon and manifest', /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  check('static/iOS: home-screen PNG icons exist', ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'game/assets/icons', f))));
  // every default asset referenced by assets.js exists on disk
  const D = path.join(ROOT, 'game/assets/default'), need = ['icon', 'drone', 'finish', 'battery', 'battery_empty', 'vent_0', 'vent_1', 'sign_0', 'sign_1'];
  ['run_0', 'run_1', 'run_2', 'run_3', 'air', 'bump', 'happy'].forEach(f => need.push('bolt_' + f));
  ['pink', 'yellow', 'cyan'].forEach(c => need.push('firefly_' + c + '_0', 'firefly_' + c + '_1', 'gate_' + c));
  ['mist', 'seed', 'mote', 'leaf', 'star', 'sparkle', 'puff', 'spark', 'bit_pink', 'bit_yellow', 'bit_cyan', 'shoot'].forEach(x => need.push('particles/' + x));
  ['dawn', 'noon', 'sunset', 'night'].forEach(z => ['sky', 'far', 'mid', 'building', 'rail', 'rail_end'].forEach(l => need.push('levels/' + z + '/' + l)));
  const missing = need.filter(f => !fs.existsSync(path.join(D, f + '.svg')));
  check('static: every default asset file exists (' + need.length + ' SVGs)', missing.length === 0, missing.length ? missing : undefined);
}

// ======================================================================= boot
async function sBoot() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  check('boot: reaches the title screen', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  await p.waitForFunction(() => RF.debug.world.stats.flips > 0 && RF.debug.world.distance > 5, null, { timeout: 12000 }).catch(() => {});
  const st = await p.evaluate(() => ({ flips: RF.debug.world.stats.flips, dist: RF.debug.world.distance, hud: !document.getElementById('hud').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id, errors: RF.debug.stats.errors.length }));
  check('boot: title demo bot runs and flips behind the menu, HUD hidden', st.flips > 0 && st.dist > 5 && !st.hud, st);
  check('boot: Play is focused for keyboard users', st.focus === 'btnPlay', st.focus);
  check('boot: zero console errors / frame errors', errs.length === 0 && st.errors === 0, errs.slice(0, 3));
  await p.screenshot({ path: OUT + '/func_title.png' });
  await ctx.close();
}

// ======================================================================= menus
async function sMenus() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  for (const [btn, scr, label] of [['#btnHow', 'scrHow', 'How to Play'], ['#btnSettings', 'scrSettings', 'Settings'], ['#btnCustomize', 'scrCustom', 'Change Pictures']]) {
    await p.click(btn);
    check(`menus: ${label} opens`, await waitUi(p, scr));
    await p.click(`#${scr} .btn-back`);
    check(`menus: ${label} → back button returns to the title`, await waitUi(p, 'scrTitle'));
    await p.click(btn); await waitUi(p, scr);
    await p.keyboard.press('Escape');
    check(`menus: ${label} → Esc returns to the title`, await waitUi(p, 'scrTitle'));
  }
  await p.click('#btnPlay');
  check('menus: Play starts a game, HUD shown', await waitMode(p, 'playing') && await visible(p, '#hud'));
  await p.click('#btnPause');
  check('menus: HUD pause button opens Pause', await waitUi(p, 'scrPause') && await mode(p) === 'paused');
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
  await p.click('#btnRestart');
  check('menus: Pause → Restart starts a fresh game', await waitMode(p, 'playing') && await starts(p) === s0 + 1 && await p.evaluate(() => RF.debug.world.distance < 5));
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause');
  await p.click('#btnPauseMenu');
  check('menus: Pause → Main Menu returns to the title (demo)', await waitMode(p, 'title') && await ui(p) === 'scrTitle' && await p.evaluate(() => document.getElementById('hud').classList.contains('hidden')));
  await startSafe(p, null, true);
  check('menus: game over reached', await killNow(p, 0));
  check('menus: game over screen shown with score/best', await ui(p) === 'scrOver' && await visible(p, '#overScore'));
  await p.screenshot({ path: OUT + '/func_over.png' });
  await sleep(800);
  await p.click('#btnOverMenu');
  check('menus: Game over → Menu returns to the title', await waitMode(p, 'title'));
  await startSafe(p, null, true); await killNow(p, 0); await sleep(800);
  const s1 = await starts(p);
  await p.click('#btnAgain');
  check('menus: Game over → Play Again starts once', await waitMode(p, 'playing') && await starts(p) === s1 + 1);
  check('menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= input (mouse / keyboard)
async function sInput() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7&diff=normal');
  await startSafe(p);
  const [sx, sy] = await stageXY(p);
  await p.mouse.click(sx, sy);
  await sleep(100);
  check('input: a mouse click on the stage flips once', await flips(p) === 1 && await p.evaluate(() => RF.debug.world.hero.grav === -1));
  for (const key of ['Space', 'ArrowUp', 'ArrowDown', 'Enter', 'KeyW', 'KeyS']) {
    await grounded(p);
    const f0 = await flips(p);
    await p.keyboard.press(key);
    await sleep(80);
    check(`input: ${key} flips once`, await flips(p) === f0 + 1);
  }
  check('input: Bolt lands on the rail and the roof after those flips (alternating sides)', await grounded(p) && await p.evaluate(() => { const ev = window._ev.filter(e => e.type === 'land'); return ev.length >= 6 && ev.every((e, i) => i === 0 || e.side !== ev[i - 1].side); }));
  // key repeat: hold Space; repeated keydowns (repeat:true) must never flip again
  await grounded(p);
  let f0 = await flips(p);
  await p.keyboard.down('Space');
  for (let i = 0; i < 12; i++) { await sleep(110); await p.keyboard.down('Space'); }
  await p.keyboard.up('Space');
  await sleep(500);
  check('input: holding Space (key repeat for 1.3 s) flips only once', await flips(p) === f0 + 1, { flips: (await flips(p)) - f0 });
  // right click never flips
  await grounded(p);
  f0 = await flips(p);
  await p.mouse.click(sx, sy, { button: 'right' }); await sleep(120);
  check('input: right-click does not flip', await flips(p) === f0);
  // HUD buttons never flip
  const muted0 = await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute);
  await p.click('#btnMuteHud');
  await sleep(150);
  check('input: clicking the mute button toggles sound and does not flip', await flips(p) === f0 && (await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute)) !== muted0);
  // the mute button now has focus: Space / Enter must flip (not press the button again)
  await grounded(p);
  const m1 = await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute);
  await p.keyboard.press('Space'); await sleep(80);
  await grounded(p);
  await p.keyboard.press('Enter'); await sleep(80);
  const m2 = await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute);
  check('input: with the HUD mute button focused, Space and Enter flip and do not toggle mute', await flips(p) === f0 + 2 && m1 === m2, { flips: (await flips(p)) - f0, m1, m2 });
  await p.click('#btnMuteHud');
  await grounded(p);
  f0 = await flips(p);
  await p.click('#btnPause');
  check('input: clicking the pause button pauses and does not flip', await mode(p) === 'paused' && await flips(p) === f0);
  await p.mouse.click(30, 690);   // on the dim pause overlay, away from the panel buttons
  await p.keyboard.press('ArrowUp');
  check('input: clicks / arrow keys on the pause screen never flip', await flips(p) === f0);
  await p.click('#btnResume'); await waitMode(p, 'playing'); await sleep(200);
  check('input: the click on Resume does not flip', await flips(p) === f0);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause'); await sleep(100);
  await p.keyboard.press('Enter'); await sleep(250);   // Resume is focused
  check('input: Enter on the focused Resume button resumes without a flip', await mode(p) === 'playing' && await flips(p) === f0);
  // title: focused Play + Space / Enter start exactly once
  await p.evaluate(() => RF.Game.toTitle());
  await sleep(200);
  let s0 = await starts(p);
  await p.keyboard.press('Space');
  await sleep(300);
  check('input: Space on the title (Play focused) starts exactly once, no flip', await starts(p) === s0 + 1 && await flips(p) === 0, { starts: (await starts(p)) - s0, flips: await flips(p) });
  await p.evaluate(() => RF.Game.toTitle()); await sleep(200);
  s0 = await starts(p);
  await p.keyboard.press('Enter');
  await sleep(300);
  check('input: Enter on the title (Play focused) starts exactly once, no flip', await starts(p) === s0 + 1 && await flips(p) === 0, { starts: (await starts(p)) - s0, flips: await flips(p) });
  await p.evaluate(() => RF.Game.toTitle()); await sleep(200);
  await p.focus('#btnHow'); s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('input: Space on a focused "How to Play" opens it (does not start)', await starts(p) === s0 && await ui(p) === 'scrHow');
  await p.keyboard.press('Escape'); await waitUi(p, 'scrTitle');
  check('input: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= touch
async function sTouch() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, '?mute=1&seed=5&diff=normal');
  check('touch: body gets the .touch class (touch wording)', await p.evaluate(() => document.body.classList.contains('touch')));
  await p.tap('#btnHow');
  check('touch: tap How to Play opens it', await waitUi(p, 'scrHow'));
  await sleep(400);
  check('touch: the ghost click does not close How to Play immediately', await ui(p) === 'scrHow');
  await p.tap('#scrHow .btn-back'); await waitUi(p, 'scrTitle'); await sleep(400);
  await p.tap('#btnPlay');
  check('touch: tap Play starts once', await waitMode(p, 'playing') && await starts(p) === 1);
  await p.evaluate(() => { const w = RF.debug.world; w.setTrack({}); w.hearts = 99; });
  await sleep(300);
  check('touch: the tap on Play did not also flip', await flips(p) === 0);
  await grounded(p);
  const [sx, sy] = await stageXY(p);
  await p.touchscreen.tap(sx, sy); await sleep(100);
  check('touch: a tap on the stage flips exactly once', await flips(p) === 1);
  await grounded(p);
  await p.touchscreen.tap(sx, sy); await sleep(100);
  check('touch: a second tap flips back', await flips(p) === 2);
  await grounded(p);
  const f0 = await flips(p), m0 = await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute);
  await p.tap('#btnMuteHud'); await sleep(700);
  check('touch: tap the mute button toggles once and does not flip', await flips(p) === f0 && (await p.evaluate(() => RF.Game.settings.muted || RF.Game.urlMute)) !== m0);
  await p.tap('#btnPause'); await sleep(700);
  check('touch: tap Pause pauses (ghost click does not hit Resume) and does not flip', await mode(p) === 'paused' && await ui(p) === 'scrPause' && await flips(p) === f0);
  await p.tap('#btnResume'); await sleep(700);
  check('touch: tap Resume resumes without a flip', await mode(p) === 'playing' && await flips(p) === f0);
  check('touch: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= mechanics on a headless world in the page (exact, frame-rate free)
async function sMech() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=1');
  const r = await p.evaluate(() => {
    const mk = (spec, diff) => { const w = new RF.World({ seed: 1, difficulty: diff || 'normal', width: 960, height: 540 }); w.setTrack(spec || {}); return w; };
    const run = (w, s, until) => { for (let t = 0; t < s; t += 1 / 120) { w.update(1 / 120); if (until && until(w)) return t; } return -1; };
    const out = {};
    // flight time and landing
    let w = mk(); w.flip();
    const tl = run(w, 2, w => w.hero.grounded);
    out.flight = { t: +tl.toFixed(3), side: w.hero.side, flipT: w.hero.flipT, ft: +w.flightTime().toFixed(3) };
    // buffer: a press 0.12 s before landing fires on landing
    w = mk(); w.flip(); run(w, 0.25); const bufRet = w.flip(); run(w, 0.3, w => w.stats.flips >= 2);
    out.buffer = { ret: bufRet, flips: w.stats.flips, grav: w.hero.grav };
    // early press (0.05 s after take-off): expired before landing → only one flip
    w = mk(); w.flip(); run(w, 0.05); w.flip(); run(w, 1.5);
    out.early = { flips: w.stats.flips, side: w.hero.side };
    // two presses in the air → still only one extra flip
    w = mk(); w.flip(); run(w, 0.22); w.flip(); run(w, 0.05); w.flip(); run(w, 0.2, w => w.stats.flips >= 2); run(w, 0.05);
    out.double = { flips: w.stats.flips };
    // coyote: run off a roof edge, flip 0.08 s later → flips
    w = mk({ roofs: [[-50, 1], [30, 5000]] }); run(w, 3, w => !w.hero.grounded); run(w, 0.08);
    out.coyote = { ret: w.flip(), flips: w.stats.flips };
    run(w, 1.5); out.coyote.side = w.hero.side; out.coyote.falls = w.stats.falls;
    // past coyote (0.2 s) → no flip, he falls and the drone rescues him
    w = mk({ roofs: [[-50, 1], [12, 5000]] }); run(w, 3, w => !w.hero.grounded); run(w, 0.2);
    out.late = { ret: w.flip(), flips0: w.stats.flips };
    run(w, 0.6); out.late.falls = w.stats.falls; out.late.state = w.hero.state;
    // flip ignored while being rescued
    out.late.rescueFlip = w.flip(); out.late.flipsAfter = w.stats.flips;
    run(w, 4, w => w.hero.state === 'run' && w.hero.grounded);
    out.late.after = { state: w.hero.state, grounded: w.hero.grounded, invuln: +w.hero.invuln.toFixed(2), hearts: w.hearts, drone: !!w.drone };
    // resize mid-flip (landscape → portrait) → lands on the rail, no fall, no bump
    w = mk(); w.flip(); run(w, 0.15); w.setLayout(560, 1213); run(w, 1.5);
    out.resizeAir = { side: w.hero.side, grounded: w.hero.grounded, falls: w.stats.falls, bumps: w.stats.bumps, heroX: +(w.hero.x - w.cam.x).toFixed(1), heroXexp: +w.layout.heroX.toFixed(1), y: +w.hero.y.toFixed(1), stand: +w.standY('ceil').toFixed(1) };
    // resize while standing on the rail, several times
    for (const [a, b] of [[960, 720], [1280, 540], [560, 1000], [720, 960], [1169, 540]]) { w.setLayout(a, b); run(w, 0.3); }
    out.resizeRail = { side: w.hero.side, grounded: w.hero.grounded, falls: w.stats.falls, y: +w.hero.y.toFixed(1), stand: +w.standY('ceil').toFixed(1) };
    // generated world: one surface safe at every x ahead, both difficulties
    out.fair = ['easy', 'normal', 'hard'].map(d => {
      const g = new RF.World({ seed: 5, difficulty: d, width: 960, height: 540 }); let bad = 0, n = 0;
      for (let k = 0; k < 40; k++) {
        run(g, 1);
        const u = g.layout.unit;
        for (let x = g.hero.x; x < g.cam.x + g.layout.width * 2; x += 0.05 * u) { n++; if (!g.safeAt('floor', x) && !g.safeAt('ceil', x)) bad++; }
        g.hearts = 99;
      }
      return { d, bad, n };
    });
    return out;
  });
  check('mech: a flip crosses the corridor in ≈ flightTime() (0.30–0.45 s) and lands on the rail upside-down', r.flight.t > 0.3 && r.flight.t < 0.45 && Math.abs(r.flight.t - r.flight.ft) < 0.03 && r.flight.side === 'ceil' && r.flight.flipT === 1, r.flight);
  check('mech: a press 0.12 s before landing is buffered and fires on landing', r.buffer.ret === false && r.buffer.flips === 2 && r.buffer.grav === 1, r.buffer);
  check('mech: a press right after take-off (> 0.18 s before landing) is dropped', r.early.flips === 1 && r.early.side === 'ceil', r.early);
  check('mech: two presses in the air give only one buffered flip', r.double.flips === 2, r.double);
  check('mech: coyote time: a flip 0.08 s after running off an edge still works (no fall)', r.coyote.ret === true && r.coyote.flips === 1 && r.coyote.side === 'ceil' && r.coyote.falls === 0, r.coyote);
  check('mech: after the coyote window (0.2 s) a press does not flip; he falls and the drone takes him', r.late.ret === false && r.late.flips0 === 0 && r.late.falls === 1 && r.late.state === 'rescue', r.late);
  check('mech: flips are ignored during the rescue', r.late.rescueFlip === false && r.late.flipsAfter === 0, r.late);
  check('mech: after the rescue Bolt runs again with ~1.5 s safety, one battery lost', r.late.after.state === 'run' && r.late.after.grounded && r.late.after.invuln > 1 && r.late.after.hearts === 2, r.late.after);
  check('mech: resize to portrait mid-flip → still lands on the rail, no fall / bump, hero x re-anchored', r.resizeAir.side === 'ceil' && r.resizeAir.grounded && r.resizeAir.falls === 0 && r.resizeAir.bumps === 0 && Math.abs(r.resizeAir.heroX - r.resizeAir.heroXexp) < 1 && Math.abs(r.resizeAir.y - r.resizeAir.stand) < 0.5, r.resizeAir);
  check('mech: five resizes while on the rail → stays clamped on the rail', r.resizeRail.side === 'ceil' && r.resizeRail.grounded && r.resizeRail.falls === 0 && Math.abs(r.resizeRail.y - r.resizeRail.stand) < 0.5, r.resizeRail);
  check('mech: generated tracks: at every x at least one surface is safe (easy / normal / hard)', r.fair.every(f => f.bad === 0 && f.n > 1000), r.fair);
  check('mech: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= scoring / gates
async function sRules() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=11&diff=normal');
  await startSafe(p);
  const c = await p.evaluate(() => RF.debug.world.hero.color);
  const c1 = (c + 1) % 3, c2 = (c + 2) % 3;
  await p.evaluate(([c, c1, c2]) => {
    const w = RF.debug.world;
    w.setTrack({ fireflies: [{ x: 1.5, side: 'floor', color: c }, { x: 3, side: 'floor', color: c1 }, { x: 4.5, side: 'floor', color: c }, { x: 8, side: 'floor', color: c2 }, { x: 9.5, side: 'floor', color: c }],
      gates: [{ x: 6.5, color: c2 }] });
    w.combo = 4; w.mult = 1; w.score = 0; window._ev = []; RF.debug.setSpeed(2);
  }, [c, c1, c2]);
  await p.waitForFunction(() => RF.debug.world.distance > 0 && window._ev.filter(e => ['catch', 'wrong'].includes(e.type)).length >= 5, null, { timeout: 10000 }).catch(() => {});
  await sleep(200);
  await p.evaluate(() => RF.debug.setSpeed(1));
  const ev = await p.evaluate(() => window._ev.filter(e => ['catch', 'wrong', 'gate', 'combo', 'comboBreak'].includes(e.type)));
  const st = await p.evaluate(() => ({ score: RF.debug.world.score, color: RF.debug.world.hero.color, combo: RF.debug.world.combo, caught: RF.debug.world.stats.caught, wrong: RF.debug.world.stats.wrong, gates: RF.debug.world.stats.gates }));
  const seq = ev.map(e => e.type).join(',');
  const catches = ev.filter(e => e.type === 'catch'), main = ev.filter(e => ['catch', 'wrong', 'gate'].includes(e.type));
  check('rules: event order catch, wrong, catch, gate, catch, wrong', main.map(e => e.type).join() === 'catch,wrong,catch,gate,catch,wrong', seq);
  check('rules: own colour at combo 4→5 = +10×2 (multiplier ×2 every 5 in a row), "combo" event', catches[0] && catches[0].points === 20 && catches[0].mult === 2 && catches[0].combo === 5 && ev.some(e => e.type === 'combo' && e.mult === 2), catches[0]);
  const wr = main[1] || {}, iw = ev.indexOf(wr);
  check('rules: wrong colour gives no points, combo resets on Normal (comboBreak right after it)', wr.type === 'wrong' && wr.score === main[0].score && ev[iw + 1] && ev[iw + 1].type === 'comboBreak' && ev[iw + 1].combo === 5, ev.slice(0, 5));
  check('rules: after the reset the next catch is +10×1', catches[1] && catches[1].points === 10 && catches[1].combo === 1, catches[1]);
  const gate = ev.find(e => e.type === 'gate');
  check('rules: the paint arch changes Bolt\'s colour to its own (a different colour)', gate && gate.color === c2 && gate.color !== c, gate);
  check('rules: after the gate the new colour counts and the old colour is "wrong"', catches[2] && catches[2].points === 10 && main[main.length - 1].type === 'wrong' && st.color === c2, { catches, last: main[main.length - 1] });
  check('rules: score = 20 + 10 + 10 = 40, stats counted', st.score === 40 && st.caught === 3 && st.wrong === 2 && st.gates === 1, st);
  const ffs = await p.evaluate(() => RF.debug.world.fireflies.map(f => f.state));
  check('rules: no fireflies left flying on the track (caught ones fly into Bolt, wrong ones flee)', ffs.every(s => s !== 'fly'), ffs);
  // ×5 cap
  await p.evaluate(c => { const w = RF.debug.world; w.setTrack({ fireflies: [{ x: 1.5, side: 'floor', color: c }] }); w.combo = 40; w.score = 0; window._ev = []; }, st.color);
  await p.waitForFunction(() => window._ev.some(e => e.type === 'catch'), null, { timeout: 5000 }).catch(() => {});
  const cap = await p.evaluate(() => (window._ev.find(e => e.type === 'catch') || {}));
  check('rules: the multiplier is capped at ×5 (+50)', cap.points === 50 && cap.mult === 5, cap);
  // fireflies in the middle are caught in flight
  await grounded(p);
  await p.evaluate(c => { const w = RF.debug.world; w.setTrack({ fireflies: [{ x: 0.9, side: 'mid', color: c }] }); w.combo = 0; window._ev = []; RF.debug.flip(); }, st.color);
  await p.waitForFunction(() => RF.debug.world.hero.grounded, null, { timeout: 3000 }).catch(() => {});
  await sleep(200);
  check('rules: a firefly in the flight path is caught mid-flip', await p.evaluate(() => window._ev.some(e => e.type === 'catch')));
  // Easy: a wrong firefly does not break the combo
  await p.goto(GAME + '?mute=1&seed=11&diff=easy'); await instrument(p);
  await startSafe(p);
  await p.evaluate(() => { const w = RF.debug.world, c = w.hero.color; w.setTrack({ fireflies: [{ x: 1.5, side: 'floor', color: (c + 1) % 3 }] }); w.combo = 3; window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'wrong'), null, { timeout: 5000 }).catch(() => {});
  const ez = await p.evaluate(() => ({ combo: RF.debug.world.combo, br: window._ev.filter(e => e.type === 'comboBreak').length, wrong: window._ev.filter(e => e.type === 'wrong').length, hearts: RF.debug.world.maxHearts }));
  check('rules: Easy: a wrong firefly keeps the combo (no comboBreak); Easy has 5 batteries', ez.wrong === 1 && ez.combo === 3 && ez.br === 0 && ez.hearts === 5, ez);
  check('rules: no console errors', errs.length === 0 && await p.evaluate(() => RF.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= batteries / finish / levels
async function sHearts() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3&diff=normal');
  await startSafe(p, null, true);
  check('hearts: Normal starts with 3 batteries', await p.evaluate(() => RF.debug.world.hearts === 3 && RF.debug.world.maxHearts === 3));
  await p.evaluate(() => { const w = RF.debug.world; w.setTrack({ obstacles: [{ kind: 'vent', x: 1.5 }, { kind: 'sign', x: 3 }] }); w.combo = 3; window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'bump'), null, { timeout: 5000 }).catch(() => {});
  await sleep(1500);
  let s = await p.evaluate(() => ({ hearts: RF.debug.world.hearts, bumps: window._ev.filter(e => e.type === 'bump').length, hl: window._ev.filter(e => e.type === 'heartLost').length, br: window._ev.filter(e => e.type === 'comboBreak').length, combo: RF.debug.world.combo, hit: RF.debug.world.obstacles.map(o => o.kind + ':' + o.hit) }));
  check('hearts: a vent on the roof → bump: one battery, the vent is "hit", combo reset; the sign on the rail is not touched', s.hearts === 2 && s.bumps === 1 && s.hl === 1 && s.br === 1 && s.combo === 0 && s.hit.join() === 'vent:true,sign:false', s);
  await grounded(p);
  await p.evaluate(() => { const w = RF.debug.world; w.hero.invuln = 0; w.setTrack({ roofs: [[-50, 1.2], [9, 5000]] }); window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'rescue'), null, { timeout: 8000 }).catch(() => {});
  s = await p.evaluate(() => ({ hearts: RF.debug.world.hearts, ev: window._ev.map(e => e.type).filter(t => ['fall', 'heartLost', 'rescue', 'bump'].includes(t)), hero: RF.debug.world.hero.state, inv: RF.debug.world.hero.invuln }));
  check('hearts: a gap in the roof → fall: one battery, the drone rescues Bolt, then a safety blink', s.hearts === 1 && s.ev.join() === 'fall,heartLost,rescue' && s.hero === 'run' && s.inv > 1, s);
  await p.screenshot({ path: OUT + '/func_rescued.png' });
  // finish arch: bonus, +1 battery, next time of day
  await grounded(p);
  await p.evaluate(() => { const w = RF.debug.world; w.setTrack({ finish: 2 }); w.score = 50; window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 6000 }).catch(() => {});
  await sleep(1800);
  s = await p.evaluate(() => { const w = RF.debug.world, ev = window._ev; return { ev: ev.map(e => e.type).filter(t => ['finish', 'heartGain', 'levelUp'].includes(t)), lu: ev.find(e => e.type === 'levelUp'), hearts: w.hearts, score: w.score, level: w.level, zone: w.zone, vis: RF.Game.renderer.vis.cur, wx: RF.Game.weather.zone !== undefined ? RF.Game.weather.zone : null }; });
  check('hearts: passing the finish arch → finish, heartGain, levelUp (in order)', s.ev.join() === 'finish,heartGain,levelUp', s.ev);
  check('hearts: finish bonus on Dawn = 100, +1 battery (1 → 2)', s.lu && s.lu.bonus === 100 && s.score === 150 && s.hearts === 2, s);
  check('hearts: level 2 is Noon (zone 1) and the renderer switches to Noon', s.level === 1 && s.zone === 1 && s.lu.zone === 1 && s.vis === 1, s);
  // at full batteries a finish gives no extra
  await p.evaluate(() => { const w = RF.debug.world; w.hearts = 3; w.setTrack({ finish: 2 }); window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 6000 }).catch(() => {});
  s = await p.evaluate(() => ({ hearts: RF.debug.world.hearts, gain: window._ev.filter(e => e.type === 'heartGain').length, lu: window._ev.find(e => e.type === 'levelUp') }));
  check('hearts: finish with full batteries: stays at the max (3), Noon bonus 200', s.hearts === 3 && s.gain === 0 && s.lu && s.lu.bonus === 200, s);
  // gotoLevel → every time of day, round 2 bonus
  for (const lv of [3, 0, 5]) {
    await p.evaluate(l => { window._ev = []; RF.debug.gotoLevel(l); }, lv);
    await sleep(1900);
    const g = await p.evaluate(() => ({ level: RF.debug.world.level, zone: RF.debug.world.zone, loop: RF.debug.world.loop, vis: RF.Game.renderer.vis.cur, visT: RF.Game.renderer.vis.t, lu: window._ev.find(e => e.type === 'levelUp') }));
    check(`hearts: gotoLevel(${lv}) → level ${lv}, zone ${lv % 4}, loop ${Math.floor(lv / 4)}, scene switched, levelUp bonus 0`, g.level === lv && g.zone === lv % 4 && g.loop === Math.floor(lv / 4) && g.vis === lv % 4 && g.visT === 1 && g.lu && g.lu.bonus === 0, g);
  }
  await p.screenshot({ path: OUT + '/func_noon_round2.png' });
  await p.evaluate(() => { const w = RF.debug.world; w.setTrack({ finish: 2 }); window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 6000 }).catch(() => {});
  const b2 = await p.evaluate(() => (window._ev.find(e => e.type === 'levelUp') || {}).bonus);
  check('hearts: finishing level 6 (Noon, round 2) gives 100×2×2 = 400', b2 === 400, b2);
  // speed of round 2 > round 1
  const sp = await p.evaluate(() => { const w = RF.debug.world; return [w.speedTarget(w.levelBase ? w.plans[w.planIdx].startX : w.hero.x), w.loop]; });
  check('hearts: the world still runs (level 7 Sunset round 2)', await p.evaluate(() => RF.debug.world.level === 6 && RF.debug.world.zone === 2 && RF.debug.world.phase === 'run'), sp);
  // the last battery: no rescue, game over
  await grounded(p);
  await p.evaluate(() => { const w = RF.debug.world; w.hearts = 1; w.hero.invuln = 0; w.setTrack({ roofs: [[-50, 1.2], [9, 5000]], rails: [[-50, 1.2], [9, 5000]] }); window._ev = []; });
  check('hearts: falling with the last battery → game over (no rescue)', await waitMode(p, 'over', 8000) && await p.evaluate(() => !window._ev.some(e => e.type === 'rescue') && window._ev.some(e => e.type === 'gameOver')));
  const ov = await p.evaluate(() => ({ phase: RF.debug.world.phase, hud: document.getElementById('hud').classList.contains('hidden'), games: RF.debug.stats.games, hero: RF.debug.world.hero.y, VH: RF.Game.renderer.VH }));
  check('hearts: world over, HUD hidden, game counted, Bolt does not fly off for ever', ov.phase === 'over' && ov.hud && ov.games === 1 && ov.hero < ov.VH + 600, ov);
  check('hearts: no console errors', errs.length === 0 && await p.evaluate(() => RF.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= pause / resume
async function sPause() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3&diff=normal');
  await startSafe(p);
  await p.keyboard.press('Escape');
  check('pause: Esc pauses', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  const t0 = await p.evaluate(() => RF.debug.world.time);
  await sleep(700);
  check('pause: the world is frozen while paused', await p.evaluate(() => RF.debug.world.time) === t0);
  await p.keyboard.press('Escape');
  check('pause: Esc again resumes', await mode(p) === 'playing');
  await sleep(300);
  const t1 = await p.evaluate(() => RF.debug.world.time);
  check('pause: time runs again after resume, with no big jump', t1 > t0 && t1 - t0 < 0.6, { dt: +(t1 - t0).toFixed(3) });
  await p.keyboard.press('KeyP');
  check('pause: P pauses', await mode(p) === 'paused');
  await p.keyboard.press('KeyP');
  check('pause: P resumes', await mode(p) === 'playing');
  // pause mid-flip: resume continues the flight and lands normally
  await grounded(p);
  await p.evaluate(() => { RF.debug.flip(); });
  await sleep(90);
  await p.keyboard.press('Escape');
  const air = await p.evaluate(() => RF.debug.world.hero.grounded);
  await sleep(500);
  await p.keyboard.press('Escape');
  await sleep(600);
  check('pause: paused mid-flip, then resumed → Bolt lands on the rail', !air && await p.evaluate(() => RF.debug.world.hero.grounded && RF.debug.world.hero.side === 'ceil' && RF.debug.world.stats.falls === 0));
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('pause: window blur auto-pauses', await mode(p) === 'paused');
  await p.click('#btnResume'); await waitMode(p, 'playing');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('pause: visibilitychange (hidden) auto-pauses', await mode(p) === 'paused');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('pause: coming back stays paused until the player resumes', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  await p.click('#btnResume');
  // death frame: no pause during the 1.6 s game-over delay
  await p.evaluate(() => { const w = RF.debug.world; w.hearts = 1; w.hero.invuln = 0; w.setTrack({ obstacles: [{ kind: 'vent', x: 1.2 }, { kind: 'sign', x: 1.2 }] }); });
  await p.waitForFunction(() => RF.Game.deadT >= 0, null, { timeout: 8000 }).catch(() => {});
  await p.keyboard.press('Escape');
  const dm = await mode(p);
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  const dm2 = await mode(p);
  await p.keyboard.press('KeyP');
  const dm3 = await mode(p);
  check('pause: Esc / blur / P during the game-over delay never open Pause', dm === 'playing' && dm2 === 'playing' && dm3 === 'playing', [dm, dm2, dm3]);
  check('pause: the game-over screen follows', await waitMode(p, 'over') && await ui(p) === 'scrOver');
  await p.keyboard.press('Escape');
  check('pause: Esc on the game-over screen does nothing', await mode(p) === 'over' && await ui(p) === 'scrOver');
  await p.evaluate(() => RF.Game.toTitle());
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('pause: blur on the title does nothing', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  check('pause: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= game over screen + restart lock
async function sOver() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=4&diff=normal');
  await p.evaluate(() => { localStorage.clear(); RF.Storage.cache = {}; });
  await startSafe(p, null, true);
  // finish Dawn (bronze), then a few flips, then die with a known score
  await p.evaluate(() => { const w = RF.debug.world; w.setTrack({ finish: 1.5 }); w.score = 1234 - 100; });
  await p.waitForFunction(() => RF.debug.world.level === 1, null, { timeout: 6000 }).catch(() => {});
  await grounded(p);
  await p.evaluate(() => RF.debug.flip()); await grounded(p); await p.evaluate(() => RF.debug.flip()); await grounded(p);
  const pre = await p.evaluate(() => { const w = RF.debug.world; return { flips: w.stats.flips, caught: w.stats.caught, maxCombo: w.maxCombo, dist: Math.round(w.distance) }; });
  await killNow(p, null);
  const o = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), medal: document.getElementById('medal').className, name: document.getElementById('medalName').textContent, stats: document.getElementById('overStats').textContent, ws: RF.debug.world.score, dist: Math.round(RF.debug.world.distance) }));
  check('over: score on the screen = world score (1234)', o.score === '1234' && o.ws === 1234, o);
  check('over: first game → Best 1234 and NEW!', o.best === '1234' && o.nb, o);
  check('over: one time of day finished → bronze medal', /bronze/.test(o.medal) && /Bronze/.test(o.name), o);
  check('over: stats line shows flips, fireflies, distance and "Reached: Noon"', o.stats.includes('Flips: ' + pre.flips) && o.stats.includes('Fireflies caught: ' + pre.caught) && /Distance: \d+ m/.test(o.stats) && o.stats.includes('Reached: Noon'), { o: o.stats, pre });
  // restart lock 0.7 s
  let s0 = await starts(p);
  await p.keyboard.press('Enter'); await p.keyboard.press('Space'); await p.evaluate(() => document.getElementById('btnAgain').click());
  check('over: Enter / Space / Play Again within 0.7 s of game over are ignored', await starts(p) === s0 && await mode(p) === 'over');
  await sleep(800);
  await p.keyboard.press('Enter'); await sleep(300);
  check('over: Enter after the lock restarts exactly once (focused Play Again does not fire twice)', await starts(p) === s0 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s0 });
  check('over: the restart did not flip', await flips(p) === 0);
  await startSafe(p, null, true);
  await killNow(p, 10); await sleep(800);
  s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('over: Space after the lock restarts exactly once', await starts(p) === s0 + 1 && await flips(p) === 0);
  await startSafe(p, null, true);
  await killNow(p, 10);
  const lo = await p.evaluate(() => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), medal: document.getElementById('medal').className }));
  check('over: a lower score keeps Best 1234, no NEW!, no medal at level 0', lo.best === '1234' && !lo.nb && /none/.test(lo.medal), lo);
  await sleep(800);
  await p.focus('#btnOverMenu'); s0 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(300);
  const r = { starts: (await starts(p)) - s0, mode: await mode(p) };
  check('over: Enter on a focused "Menu" button goes to the menu, not a new game', r.mode === 'title' && r.starts === 0, r);
  check('over: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= settings
async function sSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: p, errs } = await open(null, '?seed=2', ctx);
  const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem('brf:settings') || 'null'));
  check('settings: first run defaults (sfx on, music on, Easy, not muted)', await p.evaluate(() => { const s = RF.Game.settings; return s.sfx && s.music && !s.muted && s.difficulty === 'easy'; }));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('label.set:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]');
  check('settings: the Hard button lights up', await p.evaluate(() => document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('KeyM');
  let s = await ls();
  check('settings: sfx/music off, Hard and mute saved to localStorage', s && s.sfx === false && s.music === false && s.difficulty === 'hard' && s.muted === true, s);
  await p.reload(); await instrument(p);
  const r = await p.evaluate(() => ({ s: RF.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, diff: RF.Game.difficulty(), aud: RF.Audio.opts || null }));
  check('settings: survive a reload (state + controls)', !r.s.sfx && !r.s.music && r.s.muted && r.s.difficulty === 'hard' && !r.sfx && !r.music && r.on === 'hard' && r.diff === 'hard', r);
  await p.evaluate(() => RF.Game.startGame()); await waitMode(p, 'playing');
  check('settings: a new game uses the saved difficulty (Hard: 3 batteries, hard preset)', await p.evaluate(() => RF.debug.world.difficulty === 'hard' && RF.debug.world.maxHearts === 3));
  await p.evaluate(() => RF.Game.toTitle());
  // test flags never saved
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(GAME + '?mute=1&diff=normal&seed=2'); await instrument(p);
  check('settings: ?mute=1 mutes audio without touching saved settings', await p.evaluate(() => RF.Game.urlMute && !RF.Game.settings.muted));
  check('settings: ?diff=normal is used for play', await p.evaluate(() => RF.Game.difficulty() === 'normal'));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  s = await ls();
  check('settings: saving another setting under ?mute=1&diff=normal stores muted:false, difficulty:easy', s && s.muted === false && s.difficulty === 'easy' && s.sfx === false, s);
  const segOn = await p.evaluate(() => { RF.UI.show('scrSettings'); const b = document.querySelector('#setDifficulty .on'); return b && b.dataset.v; });
  check('settings: with ?diff=normal the Settings screen shows the difficulty actually played', segOn === 'normal', segOn);
  await p.evaluate(() => RF.UI.show('scrTitle'));
  await p.keyboard.press('KeyM');   // clears the URL mute only (sound on), nothing saved as muted
  s = await ls();
  check('settings: M under ?mute=1 unmutes for this session without saving "muted"', await p.evaluate(() => !RF.Game.urlMute) && s.muted === false, s);
  await p.goto(GAME + '?seed=2'); await instrument(p);
  check('settings: after leaving the test URL the saved difficulty is still Easy, not muted', await p.evaluate(() => RF.Game.difficulty() === 'easy' && !RF.Game.settings.muted));
  // Reset best: two taps
  await p.evaluate(() => { RF.Storage.set('best_easy', '77'); RF.Storage.set('best_hard', '99'); });
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest');
  check('settings: one tap on Reset best only arms it ("Sure?")', await p.evaluate(() => localStorage.getItem('brf:best_hard') === '99' && document.getElementById('btnResetBest').textContent === 'Sure?'));
  await p.click('#btnResetBest');
  check('settings: a second tap clears every best', await p.evaluate(() => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('brf:best_' + d) === null)));
  check('settings: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= best score per difficulty
async function sBest() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: p, errs } = await open(null, '?mute=1&seed=4', ctx);
  await p.evaluate(() => { localStorage.clear(); RF.Storage.cache = {}; });
  for (const [d, sc] of [['easy', 120], ['normal', 340], ['hard', 560]]) {
    await p.evaluate(d => RF.Game.setSetting('difficulty', d), d);
    await startSafe(p, null, true);
    await killNow(p, sc);
  }
  const b = await p.evaluate(() => ['easy', 'normal', 'hard'].map(d => localStorage.getItem('brf:best_' + d)));
  check('best: saved separately per difficulty', b[0] === '120' && b[1] === '340' && b[2] === '560', b);
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  await p.reload(); await instrument(p);
  const titles = [];
  for (const d of ['easy', 'normal', 'hard']) { await p.evaluate(d => { RF.Game.setSetting('difficulty', d); RF.UI.show('scrTitle'); }, d); titles.push(await p.textContent('#bestTitle')); }
  check('best: after a reload the title shows the best of the chosen difficulty', titles.join() === '120,340,560', titles);
  // a mid-run difficulty change: the run still counts for the difficulty it started on
  await p.evaluate(() => RF.Game.setSetting('difficulty', 'easy'));
  await startSafe(p, null, true);
  await p.evaluate(() => { RF.Game.setSetting('difficulty', 'hard'); RF.debug.world.score = 200; });
  const hudBest = await p.evaluate(() => RF.Game.best(RF.Game.runDifficulty));
  await killNow(p, 200);
  check('best: a run started on Easy saves to best_easy even if Settings changed mid-run', await p.evaluate(() => localStorage.getItem('brf:best_easy') === '200' && localStorage.getItem('brf:best_hard') === '560'));
  check('best: the in-game HUD "Best" belongs to the run\'s difficulty', hudBest === 120, { hudBest });
  // ?diff=hard plays hard and saves to best_hard
  await p.goto(GAME + '?mute=1&seed=4&diff=hard'); await instrument(p);
  const savedD = await p.evaluate(() => JSON.parse(localStorage.getItem('brf:settings')).difficulty);
  await p.evaluate(() => RF.Game.setSetting('difficulty', 'normal'));   // saved: normal, URL: hard
  await startSafe(p, null, true); await killNow(p, 900);
  const hb = await p.evaluate(() => ({ hard: localStorage.getItem('brf:best_hard'), normal: localStorage.getItem('brf:best_normal'), saved: JSON.parse(localStorage.getItem('brf:settings')).difficulty }));
  check('best: a ?diff=hard run saves to best_hard (not the saved difficulty), and ?diff is never saved', hb.hard === '900' && hb.normal === '340' && hb.saved === 'normal', Object.assign({ before: savedD }, hb));
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
    // an opaque "photo" (red, white square) → hero
    let c = document.createElement('canvas'); c.width = 400; c.height = 300; let g = c.getContext('2d');
    g.fillStyle = '#e0302a'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60);
    out.photo = await enc(c, 'image/png');
    // a cut-out with transparency (green circle) → firefly
    c = document.createElement('canvas'); c.width = 200; c.height = 200; g = c.getContext('2d');
    g.fillStyle = '#20c040'; g.beginPath(); g.arc(100, 100, 80, 0, 7); g.fill();
    out.cut = await enc(c, 'image/png');
    // a landscape "photo" for the Dawn background
    c = document.createElement('canvas'); c.width = 1200; c.height = 800; g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, '#2050ff'); gr.addColorStop(1, '#20ffa0'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 800);
    out.bg = await enc(c, 'image/png');
    // huge 6000×4000
    c = document.createElement('canvas'); c.width = 6000; c.height = 4000; g = c.getContext('2d');
    const g2 = g.createLinearGradient(0, 0, 6000, 4000); g2.addColorStop(0, '#147'); g2.addColorStop(0.5, '#6cf'); g2.addColorStop(1, '#fe9'); g.fillStyle = g2; g.fillRect(0, 0, 6000, 4000);
    for (let i = 0; i < 200; i++) { g.fillStyle = `hsl(${i * 37 % 360},70%,60%)`; g.beginPath(); g.arc((i * 911) % 6000, (i * 577) % 4000, 60 + i % 120, 0, 7); g.fill(); }
    out.huge = await enc(c, 'image/jpeg', 0.85);
    return out;
  });
  const files = {
    photo: { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(mk.photo, 'base64') },
    cut: { name: 'sticker.png', mimeType: 'image/png', buffer: Buffer.from(mk.cut, 'base64') },
    bg: { name: 'city.png', mimeType: 'image/png', buffer: Buffer.from(mk.bg, 'base64') },
    huge: { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(mk.huge, 'base64') },
    txt: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') },
    broken: { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png') }
  };
  const slotIndex = { hero: 0, firefly: 1, bg_dawn: 2, bg_noon: 3, bg_sunset: 4, bg_night: 5 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  check('pictures: 6 slots (Bolt, Firefly, Dawn, Noon, Sunset, Night)', await p.evaluate(() => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent).join()) === 'Bolt,Firefly,Dawn,Noon,Sunset,Night');
  async function pick(slot, file) {
    await p.evaluate(() => { const t = document.getElementById('toast'); t.classList.add('hidden'); t.textContent = ''; });
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && t.textContent && !/Saving/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('brf:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('brf:shape_' + slot) };
  }, slot);
  let toast = await pick('hero', files.photo), s = await stored('hero');
  check('pictures: an opaque photo → Bolt, saved, made round ("circle")', /saved/i.test(toast) && s && s.shape === 'circle' && await p.evaluate(() => RF.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('firefly', files.cut); s = await stored('firefly');
  check('pictures: a transparent cut-out → Firefly, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit', { toast, s });
  toast = await pick('bg_dawn', files.bg); s = await stored('bg_dawn');
  check('pictures: a picture → Dawn background (JPEG)', /saved/i.test(toast) && s && s.type === 'image/jpeg' && s.w === 1200, { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(1) .tag');
  check('pictures: the card shows "Your picture"', /Your picture/.test(tag), tag);
  toast = await pick('bg_noon', files.txt); s = await stored('bg_noon');
  check('pictures: a text file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('bg_noon', files.broken); s = await stored('bg_noon');
  check('pictures: a broken "PNG" → friendly error toast, nothing stored', /could not be opened/i.test(toast) && s === null, toast);
  toast = await pick('bg_night', files.huge); s = await stored('bg_night');
  check('pictures: 6000×4000 photo → Night background downscaled to 1600×1067 JPEG', /saved/i.test(toast) && s && s.w === 1600 && Math.abs(s.h - 1067) <= 1 && s.type === 'image/jpeg', { toast, s });
  toast = await pick('firefly', files.huge); s = await stored('firefly');
  check('pictures: 6000×4000 photo → Firefly downscaled to ≤ 512 px (and made round)', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512 && s.shape === 'circle', { toast, s });
  await p.click('#slotGrid .slot:nth-child(2) .shape button[data-shape=fit]');
  check('pictures: the shape buttons switch the Firefly to "Whole picture"', await p.evaluate(() => localStorage.getItem('brf:shape_firefly') === 'fit' && document.querySelector('#slotGrid .slot:nth-child(2) .shape button.on').dataset.shape === 'fit'));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  // play with the custom pictures
  await p.evaluate(() => { RF.Game.startGame(); RF.debug.setBot(true, 1); RF.debug.setSpeed(2); });
  await p.waitForFunction(() => RF.debug.world.stats.caught >= 3 && RF.debug.world.hero.grounded && RF.debug.world.hero.side === 'floor', null, { timeout: 25000 }).catch(() => {});
  await p.evaluate(() => { RF.debug.setSpeed(1); RF.debug.setBot(false); const w = RF.debug.world; w.hearts = 99; w.setTrack({ fireflies: [{ x: 3.5, side: 'floor', color: w.hero.color }] }); });
  await grounded(p);
  await sleep(300);
  const play = await p.evaluate(() => {
    const R = RF.Game.renderer, w = RF.debug.world, g = R.canvas.getContext('2d'), px = R.px;
    const at = (x, y) => { const d = g.getImageData(Math.round(x * px), Math.round(y * px), 1, 1).data; return [d[0], d[1], d[2]]; };
    const hx = w.layout.heroX, hy = w.hero.y, u = w.layout.unit;
    const heroPx = [[0, 0], [-0.1 * u, 0.05 * u], [0.1 * u, -0.05 * u], [0, -0.12 * u]].map(([dx, dy]) => at(hx + dx, hy + dy));
    const f = w.fireflies.find(f => f.state === 'fly');
    const ffPx = f ? at(f.x - w.cam.x, f.y) : null;
    const skyPx = at(R.VW * 0.6, 12);
    return { custom: !!R.background(0).custom, zone: R.vis.cur, caught: w.stats.caught, errors: RF.debug.stats.errors.length, heroPx, ffPx, skyPx };
  });
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const red = c => c[0] > 150 && c[1] < 110 && c[2] < 110;
  check('pictures: the game plays with custom Bolt / firefly / Dawn background, fireflies still caught, no errors', play.custom && play.caught >= 3 && play.errors === 0, { custom: play.custom, caught: play.caught, errors: play.errors });
  check('pictures: Bolt is drawn with the custom photo (red pixels at his body)', play.heroPx.filter(red).length >= 3, play.heroPx);
  check('pictures: the firefly is drawn with the custom picture (green-ish pixel at a firefly)', play.ffPx && play.ffPx[1] > play.ffPx[0] && play.ffPx[1] > 120, play.ffPx);
  check('pictures: the Dawn sky is the custom photo (blue-ish top)', play.skyPx[2] > 150 && play.skyPx[0] < 120, play.skyPx);
  await p.evaluate(() => RF.debug.gotoLevel(1)); await sleep(2000);
  check('pictures: Noon (no custom picture) still uses the default scene', await p.evaluate(() => !RF.Game.renderer.background(1).custom));
  await p.evaluate(() => RF.debug.gotoLevel(3)); await sleep(2000);
  check('pictures: Night uses the custom 6000×4000 photo without errors', await p.evaluate(() => RF.Game.renderer.background(3).custom && RF.debug.stats.errors.length === 0));
  await p.reload(); await instrument(p);
  check('pictures: custom pictures survive a reload', await p.evaluate(() => ['hero', 'firefly', 'bg_dawn', 'bg_night'].every(s => RF.Assets.hasCustom(s))));
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: RF.Assets.hasCustom('hero'), k: localStorage.getItem('brf:img_hero'), shape: localStorage.getItem('brf:shape_hero'), ff: RF.Assets.hasCustom('firefly') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.ff, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: RF.Assets.SLOTS.some(s => RF.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^brf:(img|shape)_/.test(k)), tags: [...document.querySelectorAll('#slotGrid .tag')].map(t => t.textContent) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0 && r2.tags.every(t => t === 'Original'), r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => RF.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene and Bolt are drawn again', await p.evaluate(() => !RF.Game.renderer.background(0).custom && !RF.Assets.hasCustom('hero')));
  check('pictures: no console errors', errs.length === 0 && await p.evaluate(() => RF.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= layout
async function sLayout() {
  const sizes = [
    ['1280x720', { width: 1280, height: 720 }, 1, false],
    ['960x540', { width: 960, height: 540 }, 1, false],
    ['1920x1080', { width: 1920, height: 1080 }, 1, false],
    ['1920x1080', { width: 1920, height: 1080 }, 2, false],
    ['ipad_land_1024x768', { width: 1024, height: 768 }, 2, true],
    ['ipad_port_768x1024', { width: 768, height: 1024 }, 2, true],
    ['iphone_port_390x844', { width: 390, height: 844 }, 3, true],
    ['iphone_land_844x390', { width: 844, height: 390 }, 3, true]
  ];
  for (const [name, vp, dpr, mobile] of sizes) {
    const tag = `${name}@${dpr}x`;
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=1&diff=normal&speed=2');
    await waitMode(p, 'playing');
    await p.waitForFunction(() => RF.debug.world.distance > 12, null, { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => RF.debug.setSpeed(1)); await sleep(500);
    await p.screenshot({ path: OUT + `/func_${name}@${dpr}_play.png` });
    const geo = await p.evaluate(() => {
      const R = RF.Game.renderer, w = RF.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW, u = L.unit;
      const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
      const hud = document.getElementById('hud').getBoundingClientRect();
      const S = u * 0.95;
      const boltAt = y => css(L.heroX - S / 2, y - S / 2, S, S);
      const bolt = [boltAt(w.standY('floor') - 0.1 * u), boltAt(w.standY('ceil') + 0.1 * u)];
      // HUD panels as drawHud lays them out
      const K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, top = I.top + 12, hb = R._hudBtn, VW = R.VW;
      const hs = 22 * Math.min(K, 1.15), pw = Math.max(190 * Math.min(K, 1.1), 28 + w.maxHearts * (hs + 4));
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const right = hb ? hb.l - 10 : VW - 110; let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 220, 340); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      const panelsL = [['score', [x0, top, pw, 98]], ['zone', [cx - cw / 2, cy, cw, 78]]];
      const panels = panelsL.map(([n, a]) => [n, css(...a), a[1] + a[3]]);
      const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; });
      return { vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, portrait: L.portrait, unit: +u.toFixed(1), ceilY: L.ceilY, floorY: L.floorY, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, bolt, panels,
        hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btns, px: R.px, canvasPx: R.canvas.width, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bodyW: document.body.scrollWidth, errors: RF.debug.stats.errors.length };
    });
    const inVp = (r, slack = 1) => r && r.l >= -slack && r.t >= -slack && r.r <= geo.vw + slack && r.b <= geo.vh + slack;
    const inside = (a, b, slack = 1) => a && b && a.l >= b.l - slack && a.t >= b.t - slack && a.r <= b.r + slack && a.b <= b.b + slack;
    const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    const R0 = r => r && ({ l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) });
    check(`layout ${tag}: canvas inside the viewport, no horizontal / vertical page scroll`, inVp(geo.canvas) && geo.docW <= geo.vw && geo.bodyW <= geo.vw && geo.docH <= geo.vh, { canvas: R0(geo.canvas), VW: geo.VW, VH: geo.VH, doc: [geo.docW, geo.docH] });
    check(`layout ${tag}: HUD buttons visible, inside the viewport${mobile ? ', ≥ 44 css px' : ''}`, geo.hud.w > 0 && inVp(geo.hud) && geo.btns.every(b => inVp(b) && (!mobile || (b.w >= 43.5 && b.h >= 43.5))), geo.btns.map(b => Math.round(b.w) + 'x' + Math.round(b.h)));
    check(`layout ${tag}: Bolt on screen on the roof and on the rail`, geo.bolt.every(b => inside(b, geo.canvas, 2)), geo.bolt.map(R0));
    check(`layout ${tag}: both surfaces on screen (rail and rooftops with room around them)`, geo.ceilY > 0.6 * geo.unit && geo.floorY < geo.VH - 0.6 * geo.unit, { ceilY: Math.round(geo.ceilY), floorY: Math.round(geo.floorY), VH: geo.VH });
    const bad = geo.panels.filter(([n, r]) => !inside(r, geo.canvas) || ov(r, geo.hud)).map(([n, r]) => n + ':' + JSON.stringify(R0(r)));
    check(`layout ${tag}: HUD panels inside the canvas and clear of pause/mute`, bad.length === 0, bad.length ? bad : undefined);
    check(`layout ${tag}: HUD panels do not overlap each other`, !ov(geo.panels[0][1], geo.panels[1][1]), geo.panels.map(([n, r]) => n + ':' + JSON.stringify(R0(r))));
    const intoCorr = geo.panels.filter(([n, r, b]) => b > geo.ceilY + 1).map(([n, r, b]) => n + ' bottom ' + Math.round(b) + ' > ceilY ' + Math.round(geo.ceilY));
    check(`layout ${tag}: HUD panels stay above the play corridor (rail underside)`, intoCorr.length === 0, intoCorr.length ? intoCorr : undefined);
    check(`layout ${tag}: canvas backing store sharp for the DPR (within the pixel cap)`, geo.canvasPx >= Math.min(geo.vw * dpr, Math.sqrt((mobile ? 3.2e6 : 1920 * 1080) * geo.VW / geo.VH)) * 0.6, { px: +geo.px.toFixed(2), canvasPx: geo.canvasPx });
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
      await p.evaluate(s => {
        if (s === 'scrPause') { RF.Game.mode = 'playing'; RF.Game.deadT = -1; RF.Game.pause(); }
        else if (s === 'scrOver') RF.UI.showGameOver({ score: 24680, best: 24680, newBest: true, cleared: 5, caught: 412, combo: 57, flips: 388, gates: 31, distance: 1840, reached: 'Noon (round 2)' });
        else RF.UI.show(s);
      }, scr);
      await sleep(600);
      const pr = await p.evaluate(s => {
        const el = document.querySelector('#' + s + ' .panel') || document.querySelector('#' + s + ' .title-wrap');
        const r = el.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#' + s + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0)
          .map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.dataset.v || b.dataset.act || b.dataset.shape || b.textContent.trim().slice(0, 10), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height }; });
        // in a scrollable panel, buttons below the fold are reachable by scrolling: check them against the panel's scroll box instead
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroll: el.scrollHeight > el.clientHeight + 2, sw: el.scrollWidth > el.clientWidth, btns, docW: document.documentElement.scrollWidth };
      }, scr);
      if (mobile || name === '1280x720') await p.screenshot({ path: OUT + `/func_${name}@${dpr}_${scr}.png` });
      const offBtns = pr.btns.filter(b => !(b.l >= -1 && b.r <= geo.vw + 1) || (!pr.scroll && !inVp(b, 1))).map(b => b.id);
      const okFit = inVp(pr) && offBtns.length === 0 && (!pr.scroll || scr === 'scrCustom') && !pr.sw && pr.docW <= geo.vw;
      check(`layout ${tag}: ${scr} fits the screen (all buttons visible${scr === 'scrCustom' ? '' : ', no scrolling'})`, okFit, okFit ? undefined : { panel: R0(pr), scroll: pr.scroll, hscroll: pr.sw, offBtns });
      if (mobile) {
        const small = pr.btns.filter(b => b.h < 31.5).map(b => b.id + ':' + Math.round(b.h));
        check(`layout ${tag}: ${scr} buttons finger-sized (≥ 32 px tall)`, small.length === 0, small.length ? small : undefined);
      }
      if (scr === 'scrPause') await p.evaluate(() => RF.Game.resume());
    }
    check(`layout ${tag}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
    await ctx.close();
  }
}

// ======================================================================= rotate / resize mid-flip in the real page
async function sRotate() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&diff=normal');
  await startSafe(p);
  // slow motion so the 120 ms resize debounce lands mid-flight
  await p.evaluate(() => { RF.debug.setSpeed(0.2); RF.debug.flip(); });
  await sleep(200);
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(450);
  const mid = await p.evaluate(() => ({ air: !RF.debug.world.hero.grounded, portrait: RF.debug.world.layout.portrait }));
  await p.evaluate(() => RF.debug.setSpeed(1));
  await sleep(900);
  let r = await p.evaluate(() => { const w = RF.debug.world; return { side: w.hero.side, grounded: w.hero.grounded, falls: w.stats.falls, bumps: w.stats.bumps, portrait: w.layout.portrait, VW: RF.Game.renderer.VW, lw: w.layout.width, sx: Math.round(w.hero.x - w.cam.x), hx: Math.round(w.layout.heroX) }; });
  check('rotate: the resize happened while Bolt was in the air', mid.air && mid.portrait, mid);
  check('rotate: landscape → portrait mid-flip: lands on the rail, no fall / bump, layout follows the screen', r.side === 'ceil' && r.grounded && r.falls === 0 && r.bumps === 0 && r.portrait && r.lw === r.VW && r.sx === r.hx, r);
  await p.evaluate(() => { RF.debug.setSpeed(0.2); RF.debug.flip(); });
  await sleep(200);
  await p.setViewportSize({ width: 1024, height: 768 });
  await sleep(450);
  await p.evaluate(() => RF.debug.setSpeed(1));
  await sleep(900);
  r = await p.evaluate(() => { const w = RF.debug.world; return { side: w.hero.side, grounded: w.hero.grounded, falls: w.stats.falls, bumps: w.stats.bumps, portrait: w.layout.portrait }; });
  check('rotate: portrait → iPad landscape mid-flip: lands on the roof, no fall / bump', r.side === 'floor' && r.grounded && r.falls === 0 && r.bumps === 0 && !r.portrait, r);
  // a perfect bot on a generated track, rotated every 1.5 s
  await p.evaluate(() => { RF.Game.startGame(); RF.debug.setBot(true, 1); RF.debug.setSpeed(2); });
  const vps = [[390, 844], [844, 390], [768, 1024], [1024, 768], [390, 844], [844, 390], [1280, 720], [390, 844]];
  for (const [a, b] of vps) { await p.setViewportSize({ width: a, height: b }); await sleep(1500); }
  r = await p.evaluate(() => { const w = RF.debug.world; return { falls: w.stats.falls, bumps: w.stats.bumps, flips: w.stats.flips, dist: Math.round(w.distance), errors: RF.debug.stats.errors.length }; });
  check('rotate: a skill-1 bot survives 8 rotations without a fall or bump', r.falls === 0 && r.bumps === 0 && r.flips > 3, r);
  const other = errs.filter(e => !/not iterable/.test(e));   // the known assets.js _pump race is checked on its own just below
  check('rotate: no console errors (besides the _pump race checked below)', other.length === 0 && r.errors === 0, other.slice(0, 3));
  // direct repro: a sprite queued for idle pre-rasterizing, then a scale change (resize / rotate / DPR / F11) before the idle callback
  const n0 = errs.length;
  await p.evaluate(() => { const A = RF.Assets; A.warm([['vent_0', 77, 61], ['sign_0', 79, 65]]); A.setScale(A.scale * 1.37); });
  await sleep(600);
  check('rotate: a scale change while sprites are queued for pre-rendering throws no error (assets.js _pump)', errs.length === n0, errs.slice(n0, n0 + 2));
  await ctx.close();
}

// ======================================================================= long bot run
async function sLongRun() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=21&autostart=1&bot=1&skill=0.5&speed=16&autorestart=1&diff=normal');
  await waitMode(p, 'playing');
  let overRun = 0, notOver = 0, maxP = 0, maxFx = 0, maxObj = { obstacles: 0, fireflies: 0, gates: 0, roofs: 0, rails: 0, hazards: 0 }, maxLevel = 0, simT = 0, lastT = -1, stuck = 0, lastD = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(500);
    const s = await p.evaluate(() => { const st = RF.debug.getState(); return { p: st.particles, fx: st.fx + RF.Game.renderer.texts.length, level: st.level, counts: st.counts, time: st.time, mode: st.mode, dist: st.distance }; });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxLevel = Math.max(maxLevel, s.level);
    for (const k in maxObj) maxObj[k] = Math.max(maxObj[k], s.counts[k]);
    if (s.mode === 'over') { overRun++; notOver = Math.max(notOver, overRun); } else overRun = 0;
    if (s.mode === 'playing' && s.dist === lastD) stuck++;
    if (lastT >= 0 && s.time < lastT) simT += lastT;
    lastT = s.time; lastD = s.dist;
  }
  simT += Math.max(0, lastT);
  const stats = await p.evaluate(() => ({ games: RF.debug.stats.games, levels: RF.debug.stats.levels, scores: RF.debug.stats.scores, times: RF.debug.stats.times, falls: RF.debug.stats.falls, bumps: RF.debug.stats.bumps, errors: RF.debug.stats.errors }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxObj, maxLevel, stats }));
  check('long run: ≥ 4 minutes of game time simulated', simT >= 240, +(simT / 60).toFixed(1) + ' min');
  check('long run: ≥ 2 games completed and auto-restarted', stats.games >= 2, stats.games);
  check('long run: every finished game has a score and a sane length (> 20 s)', stats.scores.every(s => s > 0) && stats.times.every(t => t > 20), { scores: stats.scores, times: stats.times });
  check('long run: autorestart never leaves the game-over screen up', notOver <= 1, notOver);
  check('long run: the world never stalls while playing', stuck === 0, stuck);
  check('long run: weather particles bounded (< 140)', maxP < 140, maxP);
  check('long run: renderer fx + texts bounded (≤ 64)', maxFx <= 64, maxFx);
  check('long run: world objects culled (obstacles < 80, fireflies < 200, spans < 80, gates < 20)', maxObj.obstacles < 80 && maxObj.fireflies < 200 && maxObj.roofs < 80 && maxObj.rails < 80 && maxObj.gates < 20 && maxObj.hazards < 160, maxObj);
  check('long run: RF.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  const T0 = Date.now();
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const sections = { sStatic, sBoot, sMenus, sInput, sTouch, sMech, sRules, sHearts, sPause, sOver, sSettings, sBest, sPictures, sLayout, sRotate, sLongRun };
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
