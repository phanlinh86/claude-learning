// Functional QA suite for Ziggy's Apple Castle.
// Run: node tests/e2e/functional.js [sectionFilter]      (LONG_RUN_S=60 by default: ≈16 simulated minutes at ×16)
// Serves game/ with `python3 -m http.server` on a free loopback port (like GitHub Pages: a real http origin).
// Prints PASS/FAIL per check, screenshots in tests/out/func_*.png, exits 1 on any FAIL.
// Sections: static (Go wrapper + iOS) · boot · menus · extras (volume, full screen, Score Card) · input · pointer ·
// touch · rules · rules2 (combo cap, glow apples, pie cap) · zones (4 times of day + loop, light monotonic) · hearts ·
// pause · settings · storage keys · best · pictures (7 slots) · light · layout (10 sizes / DPRs) · safe area · rotation ·
// long bot run at ?speed=16.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), net = require('net'), http = require('http');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
let GAME = 'file://' + path.join(ROOT, 'game/index.html');   // replaced by the http URL once the server is up
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const LONG_RUN_S = +(process.env.LONG_RUN_S || 60);
let server = null;
function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
async function startServer() {
  const port = await freePort();
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'game')], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/index.html`;
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise(r => http.get(url, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) { GAME = url; return url; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('python3 http.server did not start on port ' + port);
}
function stopServer() { if (server) { try { server.kill(); } catch (e) { /* gone */ } server = null; } }

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
// counters + event log + an "arm" that makes the player drop at a chosen moment (inside the game loop, exact)
async function instrument(page) {
  await page.waitForFunction(() => window.AC && AC.debug && AC.Game && AC.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = AC.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; window._ev = []; return o.apply(this, arguments); };
    window._ev = [];
    const h = G.handleEvents;
    G.handleEvents = function (evts) {
      for (const e of evts) window._ev.push({ type: e.type, combo: e.combo, bonus: e.bonus, total: e.total, hearts: e.hearts, glow: e.glow, gained: e.gained, points: e.points, level: e.level, zone: e.zone, perfect: e.perfect, count: e.count, score: this.world.score });
      if (window._ev.length > 4000) window._ev.splice(0, 2000);
      return h.apply(this, arguments);
    };
    // window._arm: 'miss' | 'perfect' | 'edge' | 'apple' → the player drops when the predicted landing matches
    const st = G.step;
    G.step = function (dt) {
      const r = st.apply(this, arguments);
      const w = this.world, a = window._arm;
      if (a && this.mode === 'playing' && w.phase === 'swing' && w.held && !this.bot) {
        const pl = w.predictLanding();
        let go = false;
        if (pl) {
          if (a === 'miss') go = !pl.ok && Math.abs(pl.dx) > pl.topW * 0.9;
          else if (a === 'perfect') go = pl.perfect && Math.abs(pl.dx) < pl.tol * 0.5;
          else if (a === 'edge') go = pl.ok && !pl.perfect && Math.abs(pl.dx) < pl.topW * 0.3;
          else if (a === 'apple') {
            const c = w.appleList.find(c => c.state === 'float');
            if (c && pl.perfect && Math.abs(pl.dx) < pl.tol * 0.5) { c.x = (w.held.x + pl.x) / 2; go = true; }
          }
        }
        if (go) { window._arm = null; window._armed = (window._armed || 0) + 1; this.drop(); }
      }
      return r;
    };
  });
}
const mode = p => p.evaluate(() => AC.Game.mode);
const ui = p => p.evaluate(() => AC.UI.current);
const starts = p => p.evaluate(() => AC.Game._starts);
const drops = p => p.evaluate(() => AC.debug.world.stats.drops);
const waitMode = (p, m, t) => p.waitForFunction(m => AC.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => AC.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const holding = (p, t) => p.waitForFunction(() => { const w = AC.debug.world; return AC.Game.mode === 'playing' && w.phase === 'swing' && !!w.held; }, null, { timeout: t || 8000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const evs = (p, type) => p.evaluate(t => window._ev.filter(e => e.type === t), type);
async function stageXY(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.82]; }); }
async function startPlaying(p, keepHearts) {
  await p.evaluate(() => AC.Game.startGame());
  await waitMode(p, 'playing');
  await holding(p);
  if (!keepHearts) await p.evaluate(() => { AC.debug.world.hearts = 99; });
}
// arm a drop and wait until it has happened and the world is holding again (or over)
async function armDrop(p, kind, t) {
  const before = await p.evaluate(() => window._armed || 0);
  await p.evaluate(k => { window._arm = k; }, kind);
  const ok = await p.waitForFunction(b => (window._armed || 0) > b, before, { timeout: t || 15000 }).then(() => true, () => false);
  await p.waitForFunction(() => { const w = AC.debug.world; return (w.phase === 'swing' && w.held) || w.phase === 'over' || w.phase === 'goal' || AC.Game.mode !== 'playing'; }, null, { timeout: 15000 }).catch(() => {});
  if (!ok) await p.evaluate(() => { window._arm = null; });
  return ok;
}
// game over now: one heart, then a sure miss
async function killNow(p, score) {
  await holding(p);
  await p.evaluate(s => { const w = AC.debug.world; w.hearts = 1; if (s != null) w.score = s; AC.debug.setSpeed(3); }, score);
  await armDrop(p, 'miss');
  const ok = await waitMode(p, 'over', 15000);
  await p.evaluate(() => AC.debug.setSpeed(1));
  return ok;
}

// ======================================================================= static review
async function sStatic() {
  const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
  check('static/app: fixed loopback port 127.0.0.1:47627 with free-port fallback', /127\.0\.0\.1:47627/.test(go) && /127\.0\.0\.1:0"/.test(go));
  check('static/app: storage in %APPDATA%\\ZiggysAppleCastle\\data', /filepath\.Join\(appData, "ZiggysAppleCastle"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go));
  check('static/app: binds ffStoreAll/Set/Del, ffFullscreen, ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  check('static/app: atomic write (tmp + rename) and key filter', /\.tmp"/.test(go) && /os\.Rename/.test(go) && /\^\[a-zA-Z0-9_\\-\]\{1,64\}\$/.test(go));
  const keys = ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_crate', 'shape_crate', 'img_apple', 'img_bg_dawn', 'img_bg_night'];
  check('static/app: every storage key the game writes passes the Go key filter', keys.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k)));
  check('static/app: single-instance mutex + WebView2-missing browser fallback', go.includes('SingleInstance') && go.includes('FileProtocolHandler'));
  const fallbackUrlHasApp = /url := .*\?app=1/.test(go) && /FileProtocolHandler", url\)/.test(go);
  check('static/app: browser fallback does not pass ?app=1 (Quit button would not work in a tab)', !fallbackUrlHasApp);
  check('static/app: the http server listens on loopback only (no 0.0.0.0 / ":port")', !/Listen\("tcp", "(0\.0\.0\.0)?:/.test(go) && /net\.Listen\("tcp", "127\.0\.0\.1:/.test(go));
  check('static/app: store caps a value (12 MB) and rejects bad keys on Set / Del / All', /len\(v\) > 12<<20/.test(go) && (go.match(/keyRe\.MatchString\(k\)/g) || []).length >= 3);
  check('static/app: WebView2 profile in %LOCALAPPDATA%\\ZiggysAppleCastle\\WebView2, Debug off', /filepath\.Join\(localAppData, "ZiggysAppleCastle", "WebView2"\)/.test(go) && /Debug:\s+false/.test(go));
  check('static/app: full screen and quit run on the UI thread (w.Dispatch)', /ffFullscreen[\s\S]{0,120}w\.Dispatch/.test(go) && /ffQuit[\s\S]{0,80}w\.Dispatch/.test(go));
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  check('static/iOS: viewport no zoom + viewport-fit=cover', /user-scalable=no/.test(html) && /maximum-scale=1/.test(html) && /viewport-fit=cover/.test(html));
  check('static/iOS: apple-mobile-web-app-capable, touch icon and manifest', /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  check('static/iOS: home-screen PNG icons exist', ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'game/assets/icons', f))));
  const assets = fs.readFileSync(path.join(ROOT, 'game/js/assets.js'), 'utf8');
  const listed = [];
  assets.replace(/D \+ '([^']+)'/g, (m, f) => listed.push(f));
  const missing = [];
  for (const f of listed.filter(f => /\.svg$/.test(f))) if (!fs.existsSync(path.join(ROOT, 'game/assets/default', f))) missing.push(f);
  for (const k of ['idle', 'drop', 'happy', 'oops']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/ziggy_' + k + '.svg'))) missing.push('ziggy_' + k);
  for (const z of ['dawn', 'noon', 'sunset', 'night']) for (const l of ['sky', 'far', 'ground']) if (!fs.existsSync(path.join(ROOT, `game/assets/default/levels/${z}/${l}.svg`))) missing.push(z + '/' + l);
  for (const pn of ['star', 'sparkle', 'puff', 'heart', 'spark', 'applebit', 'petal', 'leaf', 'mist', 'bat_0', 'bat_1', 'firefly', 'wisp']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/particles/' + pn + '.svg'))) missing.push('p_' + pn);
  for (const f of ['beam', 'base', 'flag', 'ghost', 'ghost_wave', 'lantern', 'apple_0', 'apple_1', 'apple_glow', 'pie', 'heart', 'heart_empty', 'icon', 'crate_0', 'crate_3']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/' + f + '.svg'))) missing.push(f);
  check('static: every default asset file exists', missing.length === 0, missing.length ? missing : undefined);
  const art = fs.readdirSync(path.join(ROOT, 'game/assets/default')).filter(f => /^(juno|coin|rocket|flame)/.test(f));
  check('static: no leftover fox-moon-stack art (juno/coin/rocket/flame)', art.length === 0, art.length ? art : undefined);
  const code = ['js/render.js', 'js/main.js', 'js/ui.js', 'js/assets.js', 'js/audio.js', 'index.html'].map(f => fs.readFileSync(path.join(ROOT, 'game', f), 'utf8')).join('\n');
  const old = (code.match(/\b(Juno|juno_|coinList|star-coin|rocket\.svg|Moon Stack|Rusty Dunes|Ring World|Comet Garden)\b/g) || []);
  check('static: no leftover Juno / coin / planet names in the game code', old.length === 0, old.length ? [...new Set(old)] : undefined);
}

// ======================================================================= boot
async function sBoot() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  check('boot: reaches the title screen', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  await sleep(3000);
  const st = await p.evaluate(() => ({ drops: AC.debug.world.stats.drops, hud: !document.getElementById('hud').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id }));
  check('boot: title demo bot plays behind the menu (drops > 0), HUD hidden', st.drops > 0 && !st.hud, st);
  check('boot: Play is focused for keyboard users', st.focus === 'btnPlay', st.focus);
  check('boot: zero console errors', errs.length === 0, errs.slice(0, 3));
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
  await holding(p);
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
  check('menus: Pause → Restart starts a fresh game', await waitMode(p, 'playing') && await starts(p) === s0 + 1 && await p.evaluate(() => AC.debug.world.stats.drops === 0));
  await holding(p);
  await p.keyboard.press('Escape'); await waitUi(p, 'scrPause');
  await p.click('#btnPauseMenu');
  check('menus: Pause → Main Menu returns to the title (demo)', await waitMode(p, 'title') && await ui(p) === 'scrTitle');
  // game over screen
  await startPlaying(p, true);
  check('menus: game over reached (forced miss with 1 heart)', await killNow(p, 0));
  check('menus: game over screen shown with score/best', await ui(p) === 'scrOver' && await visible(p, '#overScore'));
  await p.screenshot({ path: OUT + '/func_over.png' });
  await sleep(800);
  await p.click('#btnOverMenu');
  check('menus: Game over → Menu returns to the title', await waitMode(p, 'title'));
  await startPlaying(p, true); await killNow(p, 0); await sleep(800);
  const s1 = await starts(p);
  await p.click('#btnAgain');
  check('menus: Game over → Play Again starts once', await waitMode(p, 'playing') && await starts(p) === s1 + 1);
  await holding(p);
  check('menus: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= input (mouse / keyboard)
async function sInput() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7&diff=normal');
  await startPlaying(p);
  const [sx, sy] = await stageXY(p);
  await p.mouse.click(sx, sy);
  await sleep(150);
  check('input: a click on the stage drops exactly one crate', await drops(p) === 1);
  for (const key of ['Space', 'Enter', 'ArrowDown']) {
    await holding(p);
    const d0 = await drops(p);
    await p.keyboard.press(key);
    await sleep(120);
    check(`input: ${key} drops one crate`, await drops(p) === d0 + 1);
  }
  // key repeat: hold Space; repeated keydowns (repeat:true) must never drop again
  await holding(p);
  let d0 = await drops(p);
  await p.keyboard.down('Space');
  for (let i = 0; i < 12; i++) { await sleep(120); await p.keyboard.down('Space'); }
  await p.keyboard.up('Space');
  await sleep(600);
  check('input: holding Space (key repeat for 1.4 s) drops only one crate', await drops(p) === d0 + 1, { drops: (await drops(p)) - d0 });
  // buffered press: a press while falling is used when the next crate spawns (≤ 0.25 s), but never twice
  await holding(p);
  d0 = await drops(p);
  await p.keyboard.press('Space'); await sleep(40); await p.keyboard.press('Space');
  await sleep(2500);
  check('input: two quick presses never drop more than two crates', (await drops(p)) - d0 <= 2, (await drops(p)) - d0);
  // HUD buttons never drop
  await holding(p);
  d0 = await drops(p);
  const muted0 = await p.evaluate(() => AC.Game.settings.muted || AC.Game.urlMute);
  await p.click('#btnMuteHud');
  await sleep(200);
  check('input: clicking the mute button toggles sound and does not drop', await drops(p) === d0 && (await p.evaluate(() => AC.Game.settings.muted || AC.Game.urlMute)) !== muted0);
  await p.click('#btnMuteHud');
  await p.click('#btnPause');
  check('input: clicking the pause button pauses and does not drop', await mode(p) === 'paused' && await drops(p) === d0);
  await p.mouse.click(sx, sy);   // on the dim pause overlay
  await p.keyboard.press('Space');
  check('input: clicks / Space on the pause screen never drop', await drops(p) === d0);
  await p.click('#btnResume'); await waitMode(p, 'playing'); await sleep(200);
  check('input: the click on Resume does not drop', await drops(p) === d0);
  // title: focused Play + Space / Enter start exactly once
  await p.evaluate(() => AC.Game.toTitle());
  await sleep(200);
  let s0 = await starts(p);
  await p.keyboard.press('Space');
  await sleep(300);
  check('input: Space on the title (Play focused) starts exactly once, no drop', await starts(p) === s0 + 1 && await drops(p) === 0, { starts: (await starts(p)) - s0 });
  await p.evaluate(() => AC.Game.toTitle()); await sleep(200);
  s0 = await starts(p);
  await p.keyboard.press('Enter');
  await sleep(300);
  check('input: Enter on the title (Play focused) starts exactly once, no drop', await starts(p) === s0 + 1 && await drops(p) === 0, { starts: (await starts(p)) - s0 });
  await p.evaluate(() => AC.Game.toTitle()); await sleep(200);
  await p.focus('#btnHow'); s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('input: Space on a focused "How to Play" opens it (does not start)', await starts(p) === s0 && await ui(p) === 'scrHow');
  await p.keyboard.press('Escape'); await waitUi(p, 'scrTitle');
  // game over: 0.7 s restart lock, then Enter / Space start once
  await startPlaying(p, true); await killNow(p, 0);
  s0 = await starts(p);
  await p.keyboard.press('Enter'); await p.evaluate(() => document.getElementById('btnAgain').click());   // no Playwright actionability wait (the pop animation takes > 0.7 s)
  check('input: Enter / Play Again within 0.7 s of game over is ignored', await starts(p) === s0 && await mode(p) === 'over');
  await sleep(800);
  await p.keyboard.press('Enter'); await sleep(300);
  check('input: Enter after the lock restarts exactly once (focused Play Again does not fire twice)', await starts(p) === s0 + 1 && await mode(p) === 'playing', { starts: (await starts(p)) - s0 });
  await holding(p);
  await killNow(p, 0); await sleep(800);
  s0 = await starts(p);
  await p.keyboard.press('Space'); await sleep(300);
  check('input: Space after the lock restarts exactly once', await starts(p) === s0 + 1);
  await holding(p);
  await killNow(p, 0); await sleep(800);
  await p.focus('#btnOverMenu'); s0 = await starts(p);
  await p.keyboard.press('Enter'); await sleep(300);
  const r = { starts: (await starts(p)) - s0, mode: await mode(p) };
  check('input: Enter on a focused "Menu" button (game over) goes to the menu, not a new game', r.mode === 'title' && r.starts === 0, r);
  // right click never drops
  await startPlaying(p);
  d0 = await drops(p);
  await p.mouse.click(sx, sy, { button: 'right' }); await sleep(150);
  check('input: right-click does not drop', await drops(p) === d0);
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
  await holding(p); await p.evaluate(() => { AC.debug.world.hearts = 99; });
  await sleep(300);
  check('touch: the tap on Play did not also drop a crate', await drops(p) === 0);
  const [sx, sy] = await stageXY(p);
  await p.touchscreen.tap(sx, sy); await sleep(150);
  check('touch: a tap on the stage drops exactly one crate', await drops(p) === 1);
  await holding(p);
  const d0 = await drops(p), m0 = await p.evaluate(() => AC.Game.settings.muted || AC.Game.urlMute);
  await p.tap('#btnMuteHud'); await sleep(700);
  check('touch: tap the mute button toggles once and does not drop', await drops(p) === d0 && (await p.evaluate(() => AC.Game.settings.muted || AC.Game.urlMute)) !== m0);
  await p.tap('#btnPause'); await sleep(700);
  check('touch: tap Pause pauses (ghost click does not hit Resume) and does not drop', await mode(p) === 'paused' && await ui(p) === 'scrPause' && await drops(p) === d0);
  await p.tap('#btnResume'); await sleep(700);
  check('touch: tap Resume resumes without a drop', await mode(p) === 'playing' && await drops(p) === d0);
  check('touch: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= scoring / levels
async function sRules() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=11&diff=normal');
  await startPlaying(p);
  let sc0 = await p.evaluate(() => AC.debug.world.score);
  check('rules: perfect drop armed', await armDrop(p, 'perfect'));
  const APS = () => p.evaluate(() => window._ev.filter(e => e.type === 'apple').reduce((a, e) => a + e.points, 0));
  let st = await p.evaluate(() => ({ score: AC.debug.world.score, combo: AC.debug.world.combo, perf: window._ev.filter(e => e.type === 'perfect').map(e => e.combo) }));
  let ap = await APS();
  check('rules: first perfect = +10 placed + 10×1 bonus (+ apple points)', st.score - sc0 === 20 + ap && st.combo === 1, Object.assign({ delta: st.score - sc0, ap }, st));
  sc0 = st.score; let a0 = ap;
  await armDrop(p, 'perfect');
  st = await p.evaluate(() => ({ score: AC.debug.world.score, combo: AC.debug.world.combo, lanterns: AC.debug.world.lanterns, lanternEv: window._ev.filter(e => e.type === 'lantern').length }));
  ap = await APS();
  check('rules: second perfect in a row = +10 + 10×2', st.score - sc0 === 30 + (ap - a0) && st.combo === 2, { delta: st.score - sc0, combo: st.combo });
  check('rules: every perfect hangs a lantern (lantern event + crate.lantern)', st.lanternEv === 2 && st.lanterns === 2, st);
  sc0 = st.score; a0 = ap;
  await armDrop(p, 'edge');
  st = await p.evaluate(() => ({ score: AC.debug.world.score, combo: AC.debug.world.combo, edge: window._ev.filter(e => e.type === 'edge').length, br: window._ev.filter(e => e.type === 'comboBreak').length, topple: window._ev.filter(e => e.type === 'topple').length, lanterns: AC.debug.world.lanterns }));
  ap = await APS();
  check('rules: off-centre landing = +10 only, combo resets, no new lantern', st.edge === 1 && st.score - sc0 === 10 + (ap - a0) && st.combo === 0 && st.br >= 1 && st.lanterns === 2, Object.assign({ delta: st.score - sc0 }, st));
  // apple: steer a floating apple into the fall path
  await p.waitForFunction(() => AC.debug.world.appleList.some(c => c.state === 'float'), null, { timeout: 2000 }).catch(() => {});
  let tries = 0, got = false;
  while (tries++ < 8 && !got) {
    const hasApple = await p.evaluate(() => AC.debug.world.appleList.some(c => c.state === 'float'));
    const b = await p.evaluate(() => ({ s: AC.debug.world.score, c: AC.debug.world.apples, light: AC.debug.world.light, n: window._ev.length }));
    await armDrop(p, hasApple ? 'apple' : 'perfect');
    const a = await p.evaluate(n => ({ s: AC.debug.world.score, c: AC.debug.world.apples, combo: AC.debug.world.combo, pts: window._ev.slice(n).filter(e => e.type === 'apple').map(e => e.points) }), b.n);
    if (a.c > b.c) {
      got = true;
      const exp = 10 + (a.combo > 0 ? 10 * Math.min(a.combo, 5) : 0) + a.pts.reduce((x, y) => x + y, 0);
      check('rules: an apple caught by the falling crate = +5 in daylight (and counted)', a.s - b.s === exp && a.pts.every(v => v === (b.light < 0.5 ? 10 : 5)), { delta: a.s - b.s, exp, pts: a.pts, light: b.light });
    }
  }
  if (!got) check('rules: an apple caught by the falling crate = +5 in daylight (and counted)', false, 'no apple collected in 8 drops');
  // run to the goal with a perfect bot and check the whole ledger
  await p.evaluate(() => { AC.debug.setBot(true, 1); AC.debug.setSpeed(4); });
  const goal = await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 60000 }).then(() => true, () => false);
  await p.evaluate(() => AC.debug.setSpeed(1));
  check('rules: reaching the crate goal → levelUp', goal);
  const L = await p.evaluate(() => {
    const ev = window._ev, w = AC.debug.world;
    let exp = 0;
    for (const e of ev) {
      if (e.type === 'land') exp += 10;
      if (e.type === 'perfect') exp += 10 * Math.min(e.combo, 5);
      if (e.type === 'apple') exp += e.points;
      if (e.type === 'goal') exp += e.bonus;
    }
    const g = ev.find(e => e.type === 'goal'), lu = ev.find(e => e.type === 'levelUp'), maxCombo = Math.max(0, ...ev.filter(e => e.type === 'perfect').map(e => e.combo));
    const order = ['goal', 'ghost', 'levelUp'].map(t => ev.findIndex(e => e.type === t));
    return { exp, score: w.score, goalBonus: g && g.bonus, lu: lu && { level: lu.level, zone: lu.zone }, level: w.level, zone: w.zone, vis: AC.Game.renderer.vis.cur, order, maxCombo, placed: w.placed, goal: w.goal, hearts: w.hearts, maxHearts: w.maxHearts };
  });
  check('rules: score ledger matches (10/placed + 10×min(combo,5)/perfect + apple points + goal bonus)', L.exp === L.score, { exp: L.exp, score: L.score });
  check('rules: goal bonus on Dawn = 100 × (zone+1) × (loop+1) = 100', L.goalBonus === 100, L.goalBonus);
  check('rules: goal show in order: goal → Granny Boo arrives (ghost) → levelUp', L.order.every(i => i >= 0) && L.order[0] < L.order[1] && L.order[1] < L.order[2], L.order);
  check('rules: level 2 is Noon (zone 1), fresh tower, renderer switches scene', L.lu && L.lu.level === 1 && L.lu.zone === 1 && L.level === 1 && L.vis === 1 && L.placed <= 1 && L.goal === 12, L);
  check('rules: combo is capped at ×5 for points (ledger uses min) and grows past 2', L.maxCombo >= 3, L.maxCombo);
  // goal bonus on zone 3 loop 1: 100×3×2
  await p.evaluate(() => { AC.debug.gotoLevel(6); window._ev = []; AC.debug.setSpeed(6); });
  const g2 = await p.waitForFunction(() => window._ev.some(e => e.type === 'goal'), null, { timeout: 90000 }).then(() => true, () => false);
  await p.evaluate(() => AC.debug.setSpeed(1));
  const gb = await p.evaluate(() => (window._ev.find(e => e.type === 'goal') || {}).bonus);
  check('rules: goal bonus on level 7 (Sunset, round 2) = 100×3×2 = 600', g2 && gb === 600, gb);
  // hearts reward on a new time of day
  await p.evaluate(() => { AC.debug.setBot(false); });
  await holding(p, 20000);
  // gotoLevel is a jump (no reward); the +1 heart belongs to goal → travel → levelUp: make the next crate the goal
  await p.evaluate(() => { AC.debug.gotoLevel(2); });
  await holding(p);
  await p.evaluate(() => { const w = AC.debug.world; w.hearts = 1; w.goal = w.tower.list.length + 1; AC.debug.setBot(true, 1); AC.debug.setSpeed(4); window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => AC.debug.setSpeed(1));
  const hr = await p.evaluate(() => AC.debug.world.hearts);
  check('rules: +1 heart back on reaching a new time of day', hr === 2, hr);
  check('rules: no console errors', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= hearts / game over
async function sHearts() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3&diff=normal');
  await startPlaying(p, true);
  check('hearts: Normal starts with 3 hearts', await p.evaluate(() => AC.debug.world.hearts === 3 && AC.debug.world.maxHearts === 3));
  await armDrop(p, 'miss');
  await sleep(300);
  const s = await p.evaluate(() => ({ hearts: AC.debug.world.hearts, miss: window._ev.filter(e => e.type === 'miss').length, hl: window._ev.filter(e => e.type === 'heartLost').length, mode: AC.Game.mode }));
  check('hearts: a miss costs exactly one heart', s.hearts === 2 && s.miss === 1 && s.hl === 1, s);
  // pie: the 5th apple bakes a pie = +1 heart
  await holding(p);
  await p.evaluate(() => { AC.debug.world.pieApples = 4; });
  let pie = null;
  for (let i = 0; i < 10 && !pie; i++) {
    const has = await p.evaluate(() => AC.debug.world.appleList.some(c => c.state === 'float'));
    await armDrop(p, has ? 'apple' : 'perfect');
    pie = await p.evaluate(() => { const e = window._ev.find(e => e.type === 'pie'); return e ? { gained: e.gained, hearts: AC.debug.world.hearts, pieApples: AC.debug.world.pieApples, pies: AC.debug.world.stats.pies } : null; });
  }
  check('hearts: 5 apples → Apple pie! +1 heart (pie event, counter back to 0)', pie && pie.gained && pie.hearts === 3 && pie.pieApples <= 1 && pie.pies === 1, pie);
  await p.evaluate(() => { AC.debug.world.hearts = 2; });
  // topple: build an offset tower so the COM leaves the support → one heart for miss+topple
  await holding(p);
  await armDrop(p, 'miss');
  await sleep(200);
  check('hearts: second miss → 1 heart left', await p.evaluate(() => AC.debug.world.hearts === 1));
  await armDrop(p, 'miss');
  check('hearts: last heart lost → game over screen', await waitMode(p, 'over', 8000) && await ui(p) === 'scrOver');
  const ov = await p.evaluate(() => ({ phase: AC.debug.world.phase, hud: document.getElementById('hud').classList.contains('hidden'), games: AC.debug.stats.games }));
  check('hearts: world phase over, HUD hidden, game counted', ov.phase === 'over' && ov.hud && ov.games === 1, ov);
  // pause is not possible during the death delay
  await startPlaying(p, true);
  await p.evaluate(() => { AC.debug.world.hearts = 1; });
  await armDrop(p, 'miss');
  await p.waitForFunction(() => AC.Game.deadT >= 0, null, { timeout: 8000 }).catch(() => {});
  await p.keyboard.press('Escape');
  const dm = await mode(p);
  check('hearts: Esc during the game-over delay does not open Pause', dm !== 'paused', dm);
  await waitMode(p, 'over');
  check('hearts: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= pause / resume
async function sPause() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3&diff=normal');
  await startPlaying(p);
  await p.keyboard.press('Escape');
  check('pause: Esc pauses', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  const t0 = await p.evaluate(() => AC.debug.world.time);
  await sleep(700);
  check('pause: the world is frozen while paused', await p.evaluate(() => AC.debug.world.time) === t0);
  await p.keyboard.press('Escape');
  check('pause: Esc again resumes', await mode(p) === 'playing');
  await sleep(300);
  const t1 = await p.evaluate(() => AC.debug.world.time);
  check('pause: time runs again after resume, with no big jump', t1 > t0 && t1 - t0 < 0.6, { dt: +(t1 - t0).toFixed(3) });
  await p.keyboard.press('KeyP');
  check('pause: P pauses', await mode(p) === 'paused');
  await p.keyboard.press('KeyP');
  check('pause: P resumes', await mode(p) === 'playing');
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('pause: window blur auto-pauses', await mode(p) === 'paused');
  await p.click('#btnResume'); await waitMode(p, 'playing');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('pause: visibilitychange (hidden) auto-pauses', await mode(p) === 'paused');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('pause: coming back stays paused until the player resumes', await mode(p) === 'paused' && await ui(p) === 'scrPause');
  await p.click('#btnResume');
  await p.evaluate(() => AC.Game.toTitle());
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('pause: blur on the title does nothing', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  check('pause: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= settings
async function sSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: p, errs } = await open(null, '?seed=2', ctx);
  const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem('kac:settings') || 'null'));
  check('settings: first run defaults (sfx on, music on, Easy, not muted)', await p.evaluate(() => { const s = AC.Game.settings; return s.sfx && s.music && !s.muted && s.difficulty === 'easy'; }));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('label.set:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('KeyM');
  let s = await ls();
  check('settings: sfx/music off, Hard and mute saved to localStorage', s && s.sfx === false && s.music === false && s.difficulty === 'hard' && s.muted === true, s);
  await p.reload(); await instrument(p);
  const r = await p.evaluate(() => ({ s: AC.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, diff: AC.Game.difficulty() }));
  check('settings: survive a reload (state + controls)', !r.s.sfx && !r.s.music && r.s.muted && r.s.difficulty === 'hard' && !r.sfx && !r.music && r.on === 'hard' && r.diff === 'hard', r);
  await p.evaluate(() => AC.Game.startGame()); await waitMode(p, 'playing');
  check('settings: a new game uses the saved difficulty (Hard → 3 hearts, hard preset)', await p.evaluate(() => AC.debug.world.difficulty === 'hard'));
  await p.evaluate(() => AC.Game.toTitle());
  // test flags never saved
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(GAME + '?mute=1&diff=normal&seed=2'); await instrument(p);
  check('settings: ?mute=1 mutes audio without touching saved settings', await p.evaluate(() => AC.Game.urlMute && !AC.Game.settings.muted));
  check('settings: ?diff=normal is used for play', await p.evaluate(() => AC.Game.difficulty() === 'normal'));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  s = await ls();
  check('settings: saving another setting under ?mute=1&diff=normal stores muted:false, difficulty:easy', s && s.muted === false && s.difficulty === 'easy' && s.sfx === false, s);
  const segOn = await p.evaluate(() => { AC.UI.show('scrSettings'); const b = document.querySelector('#setDifficulty .on'); return b && b.dataset.v; });
  check('settings: with ?diff=normal the Settings screen shows the difficulty actually played', segOn === 'normal', segOn);
  await p.evaluate(() => AC.UI.show('scrTitle'));
  await p.keyboard.press('KeyM');   // clears the URL mute only (sound on), nothing saved as muted
  s = await ls();
  check('settings: M under ?mute=1 unmutes for this session without saving "muted"', await p.evaluate(() => !AC.Game.urlMute) && s.muted === false, s);
  await p.goto(GAME + '?seed=2'); await instrument(p);
  check('settings: after leaving the test URL the saved difficulty is still Easy, not muted', await p.evaluate(() => AC.Game.difficulty() === 'easy' && !AC.Game.settings.muted));
  check('settings: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= best score per difficulty
async function sBest() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p, errs } = await open(null, '?mute=1&seed=4', ctx);
  await p.evaluate(() => { localStorage.clear(); AC.Storage.cache = {}; });
  for (const [d, sc] of [['easy', 120], ['normal', 340], ['hard', 560]]) {
    await p.evaluate(d => AC.Game.setSetting('difficulty', d), d);
    await startPlaying(p, true);
    await killNow(p, sc);
  }
  const b = await p.evaluate(() => ['easy', 'normal', 'hard'].map(d => localStorage.getItem('kac:best_' + d)));
  check('best: saved separately per difficulty', b[0] === '120' && b[1] === '340' && b[2] === '560', b);
  check('best: game over shows NEW! for a new best', await p.evaluate(() => !document.getElementById('newBest').classList.contains('hidden')));
  await p.evaluate(() => AC.Game.setSetting('difficulty', 'normal'));
  await startPlaying(p, true); await killNow(p, 100);
  check('best: a lower score keeps the old best and shows no NEW!', await p.evaluate(() => localStorage.getItem('kac:best_normal') === '340' && document.getElementById('overBest').textContent === '340' && document.getElementById('newBest').classList.contains('hidden')));
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  const titles = [];
  for (const d of ['easy', 'normal', 'hard']) { await p.evaluate(d => { AC.Game.setSetting('difficulty', d); AC.UI.show('scrTitle'); }, d); titles.push(await p.textContent('#bestTitle')); }
  check('best: the title shows the best of the chosen difficulty', titles.join() === '120,340,560', titles);
  // a mid-run difficulty change: the run still counts for the difficulty it started on
  await p.evaluate(() => AC.Game.setSetting('difficulty', 'easy'));
  await startPlaying(p, true);
  await p.evaluate(() => { AC.Game.setSetting('difficulty', 'hard'); AC.debug.world.score = 200; });
  await sleep(200);
  const hudBest = await p.evaluate(() => AC.Game.best(AC.Game.runDifficulty));   // what drawHud shows
  await killNow(p, 200);
  check('best: a run started on Easy saves to best_easy even if Settings changed mid-run', await p.evaluate(() => localStorage.getItem('kac:best_easy') === '200' && localStorage.getItem('kac:best_hard') === '560'));
  check('best: the in-game HUD "Best" belongs to the run\'s difficulty (not the one changed mid-run)', hudBest === 120, { hudBest, expected: 120 });
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest');
  check('best: one tap on Reset only arms it ("Sure?")', await p.evaluate(() => localStorage.getItem('kac:best_hard') === '560' && document.getElementById('btnResetBest').textContent === 'Sure?'));
  await p.click('#btnResetBest');
  check('best: a second tap clears every best', await p.evaluate(() => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('kac:best_' + d) === null)));
  check('best: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= pictures
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
  const slotIndex = { hero: 0, crate: 1, apple: 2, bg_dawn: 3, bg_noon: 4, bg_sunset: 5, bg_night: 6 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  check('pictures: 7 slots (Ziggy, crate, apple, 4 times of day)', await p.evaluate(() => document.querySelectorAll('#slotGrid .slot').length) === 7);
  async function pick(slot, file) {
    await p.evaluate(() => { const t = document.getElementById('toast'); t.classList.add('hidden'); t.textContent = ''; });
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && t.textContent && !/Saving/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('kac:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('kac:shape_' + slot) };
  }, slot);
  let toast = await pick('hero', files.png), s = await stored('hero');
  check('pictures: PNG with transparency → Ziggy, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit' && await p.evaluate(() => AC.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('crate', files.opaque); s = await stored('crate');
  check('pictures: opaque picture → crate saved (whole picture: crates are boxes, never round by default)', /saved/i.test(toast) && s && s.shape !== 'circle', { toast, s });
  toast = await pick('apple', files.png); s = await stored('apple');
  check('pictures: apple picture saved', /saved/i.test(toast) && s, { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(1) .tag');
  check('pictures: the card shows "Your picture"', /Your picture/.test(tag), tag);
  toast = await pick('bg_noon', files.txt); s = await stored('bg_noon');
  check('pictures: a text file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('bg_noon', files.broken); s = await stored('bg_noon');
  check('pictures: a broken "PNG" → friendly error toast, nothing stored', /could not be opened/i.test(toast) && s === null, toast);
  toast = await pick('bg_dawn', files.huge); s = await stored('bg_dawn');
  check('pictures: 4000×3000 picture → Dawn background downscaled to 1600×1200 JPEG', /saved/i.test(toast) && s && s.w === 1600 && s.h === 1200 && s.type === 'image/jpeg', { toast, s });
  toast = await pick('crate', files.huge); s = await stored('crate');
  check('pictures: 4000×3000 picture → crate downscaled to ≤ 512 px', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512, { toast, s });
  await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=circle]');
  check('pictures: shape button switches Ziggy to Round', await p.evaluate(() => localStorage.getItem('kac:shape_hero') === 'circle' && AC.Assets.custom.hero.width === 512));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => { AC.Game.startGame(); AC.debug.setBot(true, 0.9); AC.debug.setSpeed(3); });
  await p.waitForFunction(() => AC.debug.world.placed >= 4, null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => AC.debug.setSpeed(1)); await sleep(500);
  const play = await p.evaluate(() => { const R = AC.Game.renderer, w = AC.debug.world; return { custom: !!R.background(0).custom, zone: R.vis.cur, placed: w.placed, errors: AC.debug.stats.errors.length }; });
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const px = await p.evaluate(() => { const c = AC.Game.renderer.canvas, g = c.getContext('2d'); const d = g.getImageData(0, Math.round(c.height * 0.3), c.width, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  check('pictures: the game plays with custom Ziggy / crate / apple / Dawn background (no errors)', play.custom && play.placed >= 4 && play.errors === 0, play);
  check('pictures: the frame is actually drawn (not blank)', px > 30, Math.round(px));
  await p.evaluate(() => AC.debug.gotoLevel(1)); await sleep(1500);
  check('pictures: times of day without a custom picture still use the default scene', await p.evaluate(() => !AC.Game.renderer.background(1).custom));
  // the other three times of day (all 7 slots get a picture)
  await p.evaluate(() => AC.Game.toTitle()); await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  for (const sl of ['bg_noon', 'bg_sunset', 'bg_night']) {
    const t = await pick(sl, files.opaque), s2 = await stored(sl);
    check(`pictures: ${sl} background saved (JPEG, ≤ 1600 px)`, /saved/i.test(t) && s2 && Math.max(s2.w, s2.h) <= 1600, { t, s2 });
  }
  const tags = await p.evaluate(() => [...document.querySelectorAll('#slotGrid .slot .tag')].map(t => /Your picture/.test(t.textContent)));
  check('pictures: all 7 cards show "Your picture"', tags.length === 7 && tags.every(Boolean), tags);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => { AC.Game.startGame(); AC.debug.gotoLevel(3); }); await sleep(2000);
  const nb = await p.evaluate(() => { const R = AC.Game.renderer; return { custom: [0, 1, 2, 3].map(z => !!R.background(z).custom), dark: R._darkA, vis: R.vis.cur, errors: AC.debug.stats.errors.length }; });
  await p.screenshot({ path: OUT + '/func_custom_night.png' });
  check('pictures: every time of day uses its picture, and the darkness still falls over the Night picture', nb.custom.every(Boolean) && nb.vis === 3 && nb.dark > 0.3 && nb.errors === 0, nb);
  await p.reload(); await instrument(p);
  check('pictures: custom pictures survive a reload (all 7 slots)', await p.evaluate(() => AC.Assets.SLOTS.every(s => AC.Assets.hasCustom(s.id)) && AC.Assets.SLOTS.length === 7));
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: AC.Assets.hasCustom('hero'), k: localStorage.getItem('kac:img_hero'), shape: localStorage.getItem('kac:shape_hero'), crate: AC.Assets.hasCustom('crate') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.crate, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: AC.Assets.SLOTS.some(s => AC.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^kac:(img|shape)_/.test(k)) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0, r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => AC.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene is drawn again', await p.evaluate(() => !AC.Game.renderer.background(0).custom));
  check('pictures: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= layout
async function sLayout() {
  const sizes = [
    ['1280x720', { width: 1280, height: 720 }, 1, false],
    ['1024x768', { width: 1024, height: 768 }, 1, false],
    ['1920x1080', { width: 1920, height: 1080 }, 1, false],
    ['phone_390x844', { width: 390, height: 844 }, 3, true],
    ['ipad_port_820x1180', { width: 820, height: 1180 }, 2, true],
    ['ipad_land_1180x820', { width: 1180, height: 820 }, 2, true],
    ['phone_land_844x390', { width: 844, height: 390 }, 3, true],
    ['ipad_1024x768', { width: 1024, height: 768 }, 2, true],
    ['ipad_pro_1366x1024', { width: 1366, height: 1024 }, 2, true],
    ['ipad_pro_port_1024x1366', { width: 1024, height: 1366 }, 2, true]
  ];
  for (const [name, vp, dpr, mobile] of sizes) {
    const tag = `${name}@${dpr}x`;
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.95&diff=normal&speed=3');
    await waitMode(p, 'playing');
    await p.waitForFunction(() => AC.debug.world.placed >= 9 || AC.debug.world.level > 0, null, { timeout: 40000 }).catch(() => {});
    await p.evaluate(() => AC.debug.setSpeed(1)); await sleep(600);
    await p.screenshot({ path: OUT + `/func_${name}_play.png` });
    const geo = await p.evaluate(() => {
      const R = AC.Game.renderer, w = AC.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW, camY = w.cam.y;
      const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
      const hud = document.getElementById('hud').getBoundingClientRect();
      // Ziggy's visible sprite bounds (alpha scan of the idle frame; body centre at (80,78) of the 160 viewBox)
      const im = AC.Assets.img.ziggy_idle, sc = document.createElement('canvas'); sc.width = sc.height = 160;
      const sg = sc.getContext('2d'); sg.drawImage(im, 0, 0, 160, 160); const d = sg.getImageData(0, 0, 160, 160).data;
      let x0a = 160, x1a = 0, y0a = 160, y1a = 0;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (d[(y * 160 + x) * 4 + 3] > 40) { x0a = Math.min(x0a, x); x1a = Math.max(x1a, x); y0a = Math.min(y0a, y); y1a = Math.max(y1a, y); }
      const S = 1.55 * L.unit * (w.saucer.scale || 1), f = S / 160;
      const saucerAt = sx => css(sx + (x0a - 80) * f, w.saucer.y - camY + (y0a - 78) * f, (x1a - x0a) * f, (y1a - y0a) * f);
      const saucer = saucerAt(w.saucer.x);
      const swing = [saucerAt(L.cx - L.swingA), saucerAt(L.cx), saucerAt(L.cx + L.swingA)];
      const top = w.tower.list.length ? w.tower.list[w.tower.list.length - 1] : null;
      const tower = top ? css(top.x - top.w / 2 + w.swayOffset(top.y), top.y - top.h / 2 - camY, top.w, top.h) : null;
      const held = w.held ? css(w.held.x - w.held.w / 2, w.held.y - w.held.h / 2 - camY, w.held.w, w.held.h) : null;
      // HUD panels as drawHud lays them out
      const K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, ptop = I.top + 12, pw = 190 * Math.min(K, 1.1), hb = R._hudBtn;
      const right = hb ? hb.l - 10 : R.VW - 110; let cx, cy, cw;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, R.VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = ptop; }
      else { cw = Math.min(R.VW - I.left - I.right - 24, 420); cx = R.VW / 2; cy = ptop + 108; }
      const panels = [['score', css(x0, ptop, pw, 98)], ['zone', css(cx - cw / 2, cy, cw, 78)]];
      const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; });
      return { vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, portrait: L.portrait, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, saucer, swing, tower, held, panels, placed: w.placed,
        hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btns, px: R.px, canvasPx: R.canvas.width, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, errors: AC.debug.stats.errors.length };
    });
    const inVp = (r, slack = 1) => r && r.l >= -slack && r.t >= -slack && r.r <= geo.vw + slack && r.b <= geo.vh + slack;
    const inside = (a, b, slack = 1) => a && b && a.l >= b.l - slack && a.t >= b.t - slack && a.r <= b.r + slack && a.b <= b.b + slack;
    const ov = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    const R0 = r => r && ({ l: Math.round(r.l), t: Math.round(r.t), r: Math.round(r.r), b: Math.round(r.b) });
    check(`layout ${tag}: canvas inside the viewport, page does not scroll`, inVp(geo.canvas) && geo.docW <= geo.vw && geo.docH <= geo.vh, { canvas: R0(geo.canvas), VW: geo.VW, VH: geo.VH, doc: [geo.docW, geo.docH] });
    check(`layout ${tag}: HUD buttons visible, inside the viewport${mobile ? ', ≥ 44 css px' : ''}`, geo.hud.w > 0 && inVp(geo.hud) && geo.btns.every(b => inVp(b) && (!mobile || (b.w >= 43.5 && b.h >= 43.5))), geo.btns.map(b => Math.round(b.w) + 'x' + Math.round(b.h)));
    check(`layout ${tag}: saucer on screen and inside the canvas`, inside(geo.saucer, geo.canvas, 2), R0(geo.saucer));
    check(`layout ${tag}: tower top crate (after ${geo.placed} placed) on screen`, geo.tower && inside(geo.tower, geo.canvas, 2), R0(geo.tower));
    const bad = geo.panels.filter(([n, r]) => !inside(r, geo.canvas) || ov(r, geo.hud)).map(([n, r]) => n + ':' + JSON.stringify(R0(r)));
    check(`layout ${tag}: HUD panels inside the canvas and clear of pause/mute`, bad.length === 0, bad.length ? bad : undefined);
    check(`layout ${tag}: saucer stays on screen across its whole swing`, geo.swing.every(r => inside(r, geo.canvas, 2)), geo.swing.map(R0));
    const hit = [];
    geo.panels.forEach(([n, r]) => geo.swing.forEach((sw, i) => { if (ov(r, sw)) hit.push([n, i]); }));
    // by design (visual QA P1-2) a panel FADES while Ziggy flies under it: check the renderer's fade for each overlap
    const fades = hit.length ? await p.evaluate(hits => {
      const R = AC.Game.renderer, w = AC.debug.world, L = w.layout, K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, ptop = I.top + 12, pw = 190 * Math.min(K, 1.1), hb = R._hudBtn;
      const right = hb ? hb.l - 10 : R.VW - 110; let cx, cy, cw; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, R.VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = ptop; }
      else { cw = Math.min(R.VW - I.left - I.right - 24, 420); cx = R.VW / 2; cy = ptop + 108; }
      const P = { score: [x0, ptop, pw, 98], zone: [cx - cw / 2, cy, cw, 78] };
      return hits.map(([n, i]) => { const sx = L.cx + [-1, 0, 1][i] * L.swingA, s = Object.assign({}, w.saucer, { x: sx, prevX: sx, prevY: w.saucer.y });
        return R._fadeFor({ phase: 'swing', saucer: s, layout: L, alpha: 0 }, ...P[n]); });
    }, hit) : [];
    check(`layout ${tag}: HUD panels fade (≤ 0.35) whenever Ziggy flies under them`, fades.every(a => a <= 0.35), hit.length ? { hit, fades } : undefined);
    const hh = geo.panels.filter(([n, r]) => ov(r, geo.held)).map(([n]) => n);
    check(`layout ${tag}: HUD panels do not cover the held crate`, hh.length === 0, hh.length ? hh : undefined);
    check(`layout ${tag}: canvas backing store sharp for the DPR (within the pixel cap)`, geo.canvasPx >= Math.min(geo.vw * dpr, Math.sqrt((mobile ? 3.2e6 : 1920 * 1080) * geo.VW / geo.VH)) * 0.6, { px: +geo.px.toFixed(2), canvasPx: geo.canvasPx });
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
      await p.evaluate(s => {
        if (s === 'scrPause') { AC.Game.mode = 'playing'; AC.Game.deadT = -1; AC.Game.pause(); }
        else if (s === 'scrOver') AC.UI.showGameOver({ score: 12345, best: 67890, newBest: true, cleared: 4, placed: 140, perfect: 90, combo: 12, apples: 66, pies: 13, lanterns: 90, tallest: '18 crates', reached: 'Night · Moon Tower (round 2)' });
        else AC.UI.show(s);
      }, scr);
      await sleep(750);
      const pr = await p.evaluate(s => {
        const el = document.querySelector('#' + s + ' .panel') || document.querySelector('#' + s + ' .title-wrap');
        const r = el.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#' + s + ' button')].filter(b => b.offsetParent && b.getBoundingClientRect().width > 0)
          .map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.dataset.v || b.dataset.act || b.textContent.trim().slice(0, 10), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height }; });
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, scroll: el.scrollHeight > el.clientHeight + 2, btns };
      }, scr);
      if (mobile || name === '1280x720') await p.screenshot({ path: OUT + `/func_${name}_${scr}.png` });
      const offBtns = pr.btns.filter(b => !inVp(b, 1)).map(b => b.id);
      const okFit = inVp(pr) && offBtns.length === 0 && (!pr.scroll || scr === 'scrCustom');
      check(`layout ${tag}: ${scr} fits the screen (all buttons visible${scr === 'scrCustom' ? '' : ', no scrolling'})`, okFit, okFit ? undefined : { panel: R0(pr), scroll: pr.scroll, offBtns });
      if (mobile) {
        const small = pr.btns.filter(b => b.h < 31.5).map(b => b.id + ':' + Math.round(b.h));
        check(`layout ${tag}: ${scr} buttons finger-sized (≥ 32 px tall)`, small.length === 0, small.length ? small : undefined);
      }
      if (scr === 'scrPause') await p.evaluate(() => AC.Game.resume());
    }
    await p.evaluate(() => { AC.UI.hideAll(); AC.Game.mode = 'playing'; AC.UI.setHud(true); });
    check(`layout ${tag}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // rotation while playing
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.95&speed=3');
  await waitMode(p, 'playing');
  await p.waitForFunction(() => AC.debug.world.placed >= 6, null, { timeout: 30000 }).catch(() => {});
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(900);
  const rz = await p.evaluate(() => { const w = AC.debug.world, L = w.layout, R = AC.Game.renderer, t = w.tower.list;
    const off = t.filter(c => c.x < 0 || c.x > L.width).length, topS = w.tower.topY - w.cam.y;
    return { VW: R.VW, VH: R.VH, lw: L.width, lh: L.height, portrait: L.portrait, off, baseOk: Math.abs(w.base.x - L.cx) < 1, topS: Math.round(topS), sx: Math.round(w.saucer.x) }; });
  check('layout: rotating landscape → portrait re-lays out the tower (crates on screen, base centred, top visible)', rz.portrait && rz.lw === rz.VW && rz.lh === rz.VH && rz.off === 0 && rz.baseOk && rz.topS > 0 && rz.topS < rz.VH, rz);
  await sleep(1500);
  check('layout: no errors after rotation', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= light (the twist)
async function sLight() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 960, height: 540 } }, '?mute=1&seed=5&diff=normal');
  await startPlaying(p);
  const lum = () => p.evaluate(() => { const c = AC.Game.renderer.canvas, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return s / n; });
  await p.evaluate(() => AC.debug.gotoLevel(1)); await sleep(3500);
  const noon = await p.evaluate(() => ({ light: AC.debug.world.light, dark: AC.Game.renderer._darkA }));
  check('light: Noon starts in full daylight (no darkness layer)', noon.light > 0.97 && !noon.dark, noon);
  const lNoon = await lum();
  await p.evaluate(() => AC.debug.gotoLevel(3)); await sleep(3500);
  const night = await p.evaluate(() => ({ light: AC.debug.world.light, dark: AC.Game.renderer._darkA, tint: AC.debug.world.lightTint }));
  const lNight = await lum();
  check('light: Night is dark (light ≤ 0.31, darkness alpha 0.5–0.62)', night.light <= 0.31 && night.dark >= 0.5 && night.dark <= 0.63 && night.tint === 'night', night);
  check('light: Night frame is clearly darker than Noon but never black (kids must see)', lNight < lNoon * 0.75 && lNight > 25, { noon: Math.round(lNoon), night: Math.round(lNight) });
  // lanterns light up the tower top: compare the pixels around the top crate with and without lanterns
  const topLum = () => p.evaluate(() => { const R = AC.Game.renderer, w = AC.debug.world, c = R.canvas, t = w.tower.list[w.tower.list.length - 1];
    const x = Math.round((t.x - t.w) * R.px), y = Math.round((t.y - t.h * 1.5 - w.cam.y) * R.px), d = c.getContext('2d').getImageData(Math.max(0, x), Math.max(0, y), Math.round(t.w * 2 * R.px), Math.round(t.h * 2 * R.px)).data;
    let s = 0, n = 0; for (let i = 0; i < d.length; i += 16) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return s / n; });
  await p.evaluate(() => { AC.debug.world.setTower([0, 0, 0, 0, 0, 0]); }); await sleep(400);
  const dim = await topLum(), lit0 = await p.evaluate(() => AC.debug.world.predictLanding().lit);
  await p.evaluate(() => { AC.debug.world.setTower([0, 0, 0, 0, 0, 0], { lanterns: true }); }); await sleep(400);
  const bright = await topLum(), lit1 = await p.evaluate(() => AC.debug.world.predictLanding().lit);
  await p.screenshot({ path: OUT + '/func_night_lanterns.png' });
  check('light: lanterns brighten the tower top on screen (≥ +15 %)', bright > dim * 1.15, { dim: Math.round(dim), bright: Math.round(bright) });
  check('light: lanterns raise predictLanding().lit', lit1 > lit0 + 0.2, { lit0: +lit0.toFixed(2), lit1: +lit1.toFixed(2) });
  const glow = await p.evaluate(() => AC.debug.weather.particles.some(q => q.glow));
  check('light: night has glow particles (fireflies / twinkles) drawn above the darkness', glow);
  check('light: no console errors', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= long bot run
async function sLongRun() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 1280, height: 720 } }, '?mute=1&seed=21&autostart=1&bot=1&skill=0.5&speed=16&autorestart=1&diff=normal');
  await waitMode(p, 'playing');
  let overRun = 0, maxP = 0, maxFx = 0, maxLevel = 0, maxCrates = 0, stuck = 0, lastDrops = -1, stuckFor = 0, notOver = 0, simT = 0, lastT = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(500);
    const s = await p.evaluate(() => { const st = AC.debug.getState(); return { p: st.particles, fx: st.fx, level: st.level, crates: st.crates.length, time: st.time, drops: st.stats.drops, mode: st.mode, phase: st.phase, fl: AC.Game.renderer.flyers.length + AC.Game.renderer.texts.length }; });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx + s.fl); maxLevel = Math.max(maxLevel, s.level); maxCrates = Math.max(maxCrates, s.crates);
    if (s.drops === lastDrops && s.mode === 'playing' && s.phase === 'swing') { stuckFor += 0.5; stuck = Math.max(stuck, stuckFor); } else stuckFor = 0;
    if (s.mode === 'over') { overRun++; notOver = Math.max(notOver, overRun); } else overRun = 0;   // a 50 ms over-screen can be sampled; two samples in a row (≥0.5 s) means stuck
    if (lastT >= 0 && s.time < lastT) simT += lastT;
    lastDrops = s.drops; lastT = s.time;
  }
  simT += Math.max(0, lastT);
  const stats = await p.evaluate(() => ({ games: AC.debug.stats.games, levels: AC.debug.stats.levels, scores: AC.debug.stats.scores, times: AC.debug.stats.times, errors: AC.debug.stats.errors }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxCrates, maxLevel, stuckS: stuck, stats }));
  check('long run: several simulated minutes played (≥ 5 min)', simT / 60 >= 5, +(simT / 60).toFixed(1));
  check('long run: ≥ 3 games completed and auto-restarted', stats.games >= 3, stats.games);
  check('long run: every finished game has a score and a sane length (> 15 s)', stats.scores.every(s => s > 0) && stats.times.every(t => t > 15), { scores: stats.scores, times: stats.times });
  check('long run: never stuck in swing (a drop at least every 3 s real time at ×16)', stuck < 3, stuck);
  check('long run: autorestart never leaves the game-over screen up', notOver <= 1, notOver);
  check('long run: weather particles bounded (< 140)', maxP < 140, maxP);
  check('long run: renderer fx / texts / flyers bounded (< 120)', maxFx < 120, maxFx);
  check('long run: crate objects bounded (< 60, gone crates are removed)', maxCrates < 60, maxCrates);
  check('long run: AC.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= extras: volume, full screen, Score Card
async function sExtras() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p, errs } = await open(null, '?seed=2&diff=normal', ctx);   // no ?mute: the volume reaches AC.Audio
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  check('extras: Settings has a Volume slider and − / + buttons', await visible(p, '#setVolume') && await p.evaluate(() => document.querySelectorAll('#scrSettings .vol-step').length === 2));
  await p.fill('#setVolume', '30'); await p.dispatchEvent('#setVolume', 'input');
  let v = await p.evaluate(() => ({ ls: localStorage.getItem('kac:volume'), a: AC.Audio.volume, label: document.getElementById('setVolumeVal').textContent }));
  check('extras: volume 30 % → kac:volume = 0.30, applied to AC.Audio, label 30%', v.ls === '0.30' && Math.abs(v.a - 0.3) < 0.01 && v.label === '30%', v);
  await p.click('.vol-step[data-d="-1"]');
  v = await p.evaluate(() => ({ ls: localStorage.getItem('kac:volume'), a: AC.Audio.volume }));
  check('extras: "−" lowers the volume by 10 % (→ 0.20)', v.ls === '0.20' && Math.abs(v.a - 0.2) < 0.01, v);
  await p.click('.vol-step[data-d="-1"]'); await p.click('.vol-step[data-d="-1"]'); await p.click('.vol-step[data-d="-1"]');
  check('extras: volume clamps at 0 %', await p.evaluate(() => localStorage.getItem('kac:volume') === '0.00' && AC.Audio.volume === 0));
  await p.fill('#setVolume', '70'); await p.dispatchEvent('#setVolume', 'input');
  // full screen
  const fsRow = await visible(p, '#rowFull');
  check('extras: Full screen row shown on desktop (fullscreenEnabled)', fsRow);
  if (fsRow) {
    await p.click('label.set:has(#setFull)'); await sleep(500);
    const f1 = await p.evaluate(() => ({ game: AC.Game.fullscreen, el: !!document.fullscreenElement, box: document.getElementById('setFull').checked }));
    check('extras: Full screen toggle → document full screen, checkbox on', f1.game && f1.el && f1.box, f1);
    await p.keyboard.press('F11'); await sleep(500);
    const f2 = await p.evaluate(() => ({ game: AC.Game.fullscreen, el: !!document.fullscreenElement, box: document.getElementById('setFull').checked }));
    check('extras: F11 leaves full screen again, checkbox off', !f2.game && !f2.el && !f2.box, f2);
    check('extras: full screen is not stored in settings', await p.evaluate(() => !('fullscreen' in JSON.parse(localStorage.getItem('kac:settings') || '{}'))));
  }
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await p.reload(); await instrument(p);
  check('extras: volume survives a reload (70 %)', await p.evaluate(() => Math.abs(AC.Audio.volume - 0.7) < 0.01 && document.getElementById('setVolume').value === '70'));
  // Score Card on game over
  await startPlaying(p, true);
  await killNow(p, 432);
  await sleep(800);
  check('extras: game over shows the Score Card button', await visible(p, '#btnScoreCard'));
  const s0 = await starts(p);
  await p.click('#btnScoreCard');
  const opened = await p.waitForSelector('#scScreen:not(.hidden)', { timeout: 10000 }).then(() => true, () => false);
  await sleep(300);
  const sc = await p.evaluate(() => window.__scoreCard);
  check('extras: Score Card opens a 1080×1350 picture with the score in the share text, no restart', opened && sc && sc.w === 1080 && sc.h === 1350 && /I scored 432 /.test(sc.text) && /^http:\/\/127\.0\.0\.1/.test(sc.text.split(' ').pop()) && await mode(p) === 'over' && await starts(p) === s0, sc && sc.text);
  await p.keyboard.press('Escape'); await sleep(200);
  check('extras: Esc closes the card, game over screen still up', await p.evaluate(() => document.getElementById('scScreen').classList.contains('hidden')) && await ui(p) === 'scrOver' && await mode(p) === 'over');
  // keyboard on the open card: Enter / Space must act on the card, never start a game behind it
  for (const key of ['Enter', 'Space']) {
    await p.click('#btnScoreCard'); await p.waitForSelector('#scScreen:not(.hidden)', { timeout: 10000 }).catch(() => {});
    await sleep(200);
    const s1 = await starts(p), focus = await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    await p.keyboard.press(key); await sleep(300);
    const r = await p.evaluate(() => ({ mode: AC.Game.mode, card: !document.getElementById('scScreen').classList.contains('hidden') }));
    check(`extras: ${key} with the Score Card open (focus ${focus}) does not start a game behind the card`, (await starts(p)) === s1 && r.mode === 'over', Object.assign({ starts: (await starts(p)) - s1 }, r));
    if (r.mode !== 'over') {
      check(`extras: (${key}) if a game did start, the Score Card is not left covering it`, !r.card, r);
      await p.evaluate(() => { const m = document.getElementById('scScreen'); m.classList.add('hidden'); });
      await killNow(p, 432); await sleep(800);
    } else { await p.click('#scClose'); await sleep(150); }
  }
  await p.evaluate(() => { const m = document.getElementById('scScreen'); if (m && !m.classList.contains('hidden')) document.getElementById('scClose').click(); });
  const s2 = await starts(p);
  await p.click('#btnAgain');
  check('extras: after closing the card, Play Again starts once', await waitMode(p, 'playing') && await starts(p) === s2 + 1);
  check('extras: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= pointer events (synthetic pointerdown on every surface)
async function sPointer() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=8&diff=normal');
  await startPlaying(p);
  const pd = (sel, type) => p.evaluate(([s, t]) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: t || 'mouse', pointerId: 7, isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.8 }));
  }, [sel, type]);
  let d0 = await drops(p);
  await pd('#game'); await sleep(120);
  check('pointer: pointerdown (mouse) on the canvas drops one crate', await drops(p) === d0 + 1);
  await holding(p); d0 = await drops(p);
  await pd('#game', 'touch'); await sleep(120);
  check('pointer: pointerdown (touch) on the canvas drops one crate', await drops(p) === d0 + 1);
  await holding(p); d0 = await drops(p);
  await pd('#game', 'pen'); await sleep(120);
  check('pointer: pointerdown (pen / Apple Pencil) on the canvas drops one crate', await drops(p) === d0 + 1);
  await holding(p); d0 = await drops(p);
  for (const sel of ['#btnPause', '#btnMuteHud', '#hud', '#btnPause svg']) await pd(sel, 'touch');
  await sleep(200);
  check('pointer: pointerdown on the HUD (buttons, icons, the bar) never drops', await drops(p) === d0 && await mode(p) === 'playing');
  await p.evaluate(() => AC.UI.toast('Hello', 3000));
  await pd('#game', 'touch'); await sleep(150);
  check('pointer: a tap on the stage while a toast is showing still drops', await drops(p) === d0 + 1);
  await holding(p); d0 = await drops(p);
  await p.evaluate(() => AC.Game.pause());
  for (const sel of ['#scrPause', '#scrPause .panel', '#game']) await pd(sel, 'touch');
  await sleep(150);
  check('pointer: pointerdown on the Pause screen / canvas while paused never drops', await drops(p) === d0 && await mode(p) === 'paused');
  await p.evaluate(() => AC.Game.resume());
  await p.evaluate(() => AC.Game.toTitle()); await sleep(200);
  const t0 = await starts(p);
  for (const sel of ['#scrTitle', '#game']) await pd(sel, 'touch');
  await sleep(200);
  check('pointer: pointerdown on the title (outside the buttons) neither starts nor drops', await starts(p) === t0 && await mode(p) === 'title');
  check('pointer: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= scoring rules 2: combo cap, glow apples, pie cap
async function sRules2() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=13&diff=normal');
  await startPlaying(p);
  const snap = () => p.evaluate(() => ({ s: AC.debug.world.score, n: window._ev.length, light: AC.debug.world.light }));
  const after = n => p.evaluate(n => { const ev = window._ev.slice(n), w = AC.debug.world; return { s: w.score, combo: w.combo, ap: ev.filter(e => e.type === 'apple').reduce((a, e) => a + e.points, 0), perf: ev.filter(e => e.type === 'perfect').map(e => e.combo), apples: ev.filter(e => e.type === 'apple'), pie: ev.filter(e => e.type === 'pie'), land: ev.filter(e => e.type === 'land').length }; }, n);
  for (const c0 of [4, 5, 9]) {
    await holding(p);
    await p.evaluate(c => { AC.debug.world.combo = c; }, c0);
    const b = await snap();
    await armDrop(p, 'perfect');
    const a = await after(b.n);
    const exp = 10 + 10 * Math.min(c0 + 1, 5) + a.ap;
    check(`rules2: perfect with combo ${c0} → combo ${c0 + 1}, +10 + ${10 * Math.min(c0 + 1, 5)} (cap ×5)`, a.perf.length === 1 && a.perf[0] === c0 + 1 && a.s - b.s === exp, { delta: a.s - b.s, exp, perf: a.perf });
  }
  const hudCombo = await p.evaluate(() => Math.min(5, AC.debug.world.combo));
  check('rules2: HUD combo text is capped at ×5', hudCombo === 5, hudCombo);
  // apples by light: noon (light 1) → 5, night (light < 0.5) → 10 glow
  async function catchApple(level) {
    await p.evaluate(l => { AC.debug.gotoLevel(l); AC.debug.world.hearts = 99; }, level);
    await holding(p);
    for (let i = 0; i < 12; i++) {
      await p.waitForFunction(() => AC.debug.world.appleList.some(c => c.state === 'float'), null, { timeout: 2500 }).catch(() => {});
      const has = await p.evaluate(() => AC.debug.world.appleList.some(c => c.state === 'float'));
      const b = await snap();
      await armDrop(p, has ? 'apple' : 'perfect');
      const a = await after(b.n);
      if (a.apples.length) return { b, a };
    }
    return null;
  }
  let r = await catchApple(1);
  check('rules2: Noon (light ≥ 0.5): an apple = +5, not glowing', r && r.b.light >= 0.5 && r.a.apples.every(e => e.points === 5 && !e.glow), r && { light: r.b.light, pts: r.a.apples.map(e => e.points) });
  const g0 = await p.evaluate(() => AC.debug.world.stats.glowApples);
  r = await catchApple(3);
  const g1 = await p.evaluate(() => AC.debug.world.stats.glowApples);
  check('rules2: Night (light < 0.5): an apple = +10 glow apple (event glow, stats.glowApples)', r && r.b.light < 0.5 && r.a.apples.every(e => e.points === 10 && e.glow) && g1 > g0, r && { light: r.b.light, pts: r.a.apples.map(e => e.points), glow: g1 - g0 });
  check('rules2: night apples are drawn with a glow flag while floating', await p.evaluate(() => AC.debug.world.appleList.filter(c => c.state === 'float').every(c => c.glow)));
  // pie at full hearts: no extra heart above the max
  await holding(p);
  await p.evaluate(() => { const w = AC.debug.world; w.hearts = w.maxHearts; w.pieApples = 4; });
  let pie = null;
  for (let i = 0; i < 12 && !pie; i++) {
    await p.waitForFunction(() => AC.debug.world.appleList.some(c => c.state === 'float'), null, { timeout: 2500 }).catch(() => {});
    const has = await p.evaluate(() => AC.debug.world.appleList.some(c => c.state === 'float'));
    const b = await snap();
    await p.evaluate(() => { const w = AC.debug.world; if (w.hearts < w.maxHearts) w.hearts = w.maxHearts; });
    await armDrop(p, has ? 'apple' : 'perfect');
    const a = await after(b.n);
    if (a.pie.length) pie = Object.assign({}, a.pie[0], await p.evaluate(() => ({ h: AC.debug.world.hearts, max: AC.debug.world.maxHearts, pa: AC.debug.world.pieApples })));
  }
  check('rules2: a pie at full hearts → gained:false, hearts stay at the max, counter back to 0', pie && pie.gained === false && pie.h === pie.max && pie.pa <= 1, pie);
  check('rules2: no console errors', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= all 4 times of day + loop, light monotonic
async function sZones() {
  const { page: p, errs, ctx } = await open({ viewport: { width: 960, height: 540 } }, '?mute=1&seed=17&diff=easy');
  await startPlaying(p);
  await p.evaluate(() => {
    const G = AC.Game, st = G.step; window._lt = [];
    G.step = function () {
      const r = st.apply(this, arguments), w = this.world;
      if (this.mode === 'playing' && w) {
        const A = window._lt; let L = A[A.length - 1];
        if (!L || L.level !== w.level) { L = { level: w.level, zone: w.zone, loop: w.loop, start: w.planet.light, end: w.planet.lightEnd, first: w.light, prev: w.light, ups: 0, downs: 0, maxUp: 0, maxDown: 0, n: 0, goal: w.goal, swingW: w.planet.swingW, vis: [], wz: [], minL: w.light }; A.push(L); }
        else {
          const d = w.light - L.prev;
          if (d > 1e-7) { L.ups++; L.maxUp = Math.max(L.maxUp, d); } else if (d < -1e-7) { L.downs++; L.maxDown = Math.max(L.maxDown, -d); }
          L.prev = w.light; L.n++; L.last = w.light; L.minL = Math.min(L.minL, w.light); L.dayT = w.dayT;
          if (L.n === 240) { L.vis = this.renderer.vis.cur; L.wz = this.weather.zone; L.music = AC.Audio._zone != null ? AC.Audio._zone : null; }
        }
      }
      return r;
    };
    AC.debug.setBot(true, 1); AC.debug.setSpeed(8);
  });
  const ok = await p.waitForFunction(() => AC.debug.world.level >= 4 && AC.debug.world.placed >= 3, null, { timeout: 240000 }).then(() => true, () => false);
  await p.evaluate(() => AC.debug.setSpeed(1));
  const R = await p.evaluate(() => ({ lt: window._lt, ups: window._ev.filter(e => e.type === 'levelUp').map(e => [e.level, e.zone]), goals: window._ev.filter(e => e.type === 'goal').map(e => e.bonus), ghosts: window._ev.filter(e => e.type === 'ghost').length, perf: window._ev.filter(e => e.type === 'perfect').length, lant: window._ev.filter(e => e.type === 'lantern').length, w: { level: AC.debug.world.level, zone: AC.debug.world.zone, loop: AC.debug.world.loop, goal: AC.debug.world.goal, phase: AC.debug.world.phase }, mode: AC.Game.mode }));
  check('zones: a perfect bot plays Dawn → Noon → Sunset → Night → Dawn (round 2)', ok && JSON.stringify(R.ups) === JSON.stringify([[1, 1], [2, 2], [3, 3], [4, 0]]), { ok, ups: R.ups, w: R.w, mode: R.mode });
  check('zones: 4 goal shows with bonuses 100 / 200 / 300 / 400 and Granny Boo each time', JSON.stringify(R.goals) === '[100,200,300,400]' && R.ghosts === 4, { goals: R.goals, ghosts: R.ghosts });
  check('zones: round 2 Dawn: loop 1, goal 10 + 1 = 11, rocket swings faster than round 1', R.w.loop === 1 && R.w.goal === 11 && R.lt.length >= 5 && R.lt[4].swingW > R.lt[0].swingW, { loop: R.w.loop, goal: R.w.goal, sw: R.lt.map(l => +l.swingW.toFixed(2)) });
  const vis = R.lt.slice(0, 5).map(l => [l.zone, l.vis, l.wz]);
  check('zones: renderer scene and weather switch to each time of day', vis.every(([z, v, wz]) => v === z && wz === z), vis);
  const names = ['dawn', 'noon', 'sunset', 'night', 'dawn2'];
  for (let i = 0; i < Math.min(5, R.lt.length); i++) {
    const L = R.lt[i], dir = Math.sign(L.end - L.start) || Math.sign(L.end - L.first);
    const against = dir > 0 ? L.downs : L.ups, maxAgainst = dir > 0 ? L.maxDown : L.maxUp;
    check(`zones: light monotonic within ${names[i]} (${L.first.toFixed(2)} → ${(L.last || 0).toFixed(2)}, target ${L.start} → ${L.end})`, against === 0 || maxAgainst < 1e-5, { ups: L.ups, downs: L.downs, maxAgainst });
  }
  const starts4 = R.lt.slice(0, 4).map(l => +l.first.toFixed(2)), ends4 = R.lt.slice(0, 4).map(l => +(l.last || 0).toFixed(2));
  check('zones: light starts ≈ 0.85 / 1.0 / 0.55 / 0.3 and ends ≈ 1.0 / 0.55 / 0.3 / 0.24', [0.85, 1, 0.55, 0.3].every((v, i) => Math.abs(starts4[i] - v) < 0.06) && [1, 0.55, 0.3, 0.24].every((v, i) => Math.abs(ends4[i] - v) < 0.06), { starts4, ends4 });
  check('zones: every perfect hung a lantern over the whole day', R.perf > 0 && R.perf === R.lant, { perf: R.perf, lant: R.lant });
  // night at its darkest is still readable; lanterns keep the top lit
  await p.evaluate(() => { AC.debug.setBot(false); AC.debug.gotoLevel(3); });
  await holding(p);
  await p.evaluate(() => { const w = AC.debug.world; w.setTower([0, 1, 2, 3, 0, 1, 2], { lanterns: true }); w._prog = 1; w.light = w.planet.lightEnd; });
  await sleep(1500);
  const dk = await p.evaluate(() => { const R = AC.Game.renderer, c = R.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return { lum: s / n, dark: R._darkA, light: AC.debug.world.light, lit: AC.debug.world.predictLanding().lit }; });
  await p.screenshot({ path: OUT + '/func_night_end.png' });
  check('zones: darkest night (light 0.24) is never black (mean luminance > 25, darkness ≤ 0.65)', dk.lum > 25 && dk.dark <= 0.65 && dk.light < 0.26, dk);
  check('zones: with lanterns the tower top stays readable at the darkest point (lit ≥ 0.5)', dk.lit >= 0.5, dk.lit);
  check('zones: no console errors', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= storage keys
async function sStorage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p, errs } = await open(null, '?seed=2', ctx);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await instrument(p);
  // play a short game, change every setting, die, set a volume
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setMusic)'); await p.click('#setDifficulty button[data-v=normal]');
  await p.fill('#setVolume', '55'); await p.dispatchEvent('#setVolume', 'input');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await startPlaying(p, true); await killNow(p, 77); await sleep(800);
  await p.keyboard.press('KeyM');
  const keys = await p.evaluate(() => Object.keys(localStorage));
  const bad = keys.filter(k => !k.startsWith('kac:'));
  check('storage: every key the game writes uses the kac: prefix (shared GitHub Pages origin)', bad.length === 0 && keys.length >= 3, { keys, bad });
  check('storage: expected keys present (settings, best_normal, volume)', ['kac:settings', 'kac:best_normal', 'kac:volume'].every(k => keys.includes(k)), keys);
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('kac:settings')));
  check('storage: settings JSON holds only sfx / music / muted / difficulty', s && Object.keys(s).sort().join() === 'difficulty,music,muted,sfx', s);
  // test flags in the URL never reach storage
  const before = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  await p.goto(GAME + '?mute=1&diff=hard&speed=4&bot=1&autostart=1&autorestart=1&seed=3&level=2&debug=1'); await instrument(p);
  await sleep(2500);
  await p.evaluate(() => { AC.Game.setSetting('sfx', true); });   // any save while test flags are on
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('kac:settings')));
  check('storage: with ?mute=1&diff=hard&… a settings save keeps muted/difficulty as the player chose', after.muted === s.muted && after.difficulty === 'normal', { before: s, after });
  const flagKeys = await p.evaluate(() => Object.keys(localStorage).filter(k => /speed|bot|autostart|autorestart|seed|level|debug|urlMute|urlDiff/i.test(k)));
  check('storage: no test-flag keys stored', flagKeys.length === 0, flagKeys);
  // corrupt settings JSON → boots with defaults, no errors
  await p.evaluate(() => { localStorage.setItem('kac:settings', '{not json'); localStorage.setItem('kac:best_easy', 'abc'); });
  await p.goto(GAME + '?mute=1&seed=2'); await instrument(p);
  const d = await p.evaluate(() => ({ s: AC.Game.settings, best: AC.Game.best('easy'), title: document.getElementById('bestTitle').textContent }));
  check('storage: a corrupt settings value / best score boots with defaults (no NaN)', d.s.difficulty === 'easy' && d.best === 0 && d.title === '0', d);
  check('storage: no console errors', errs.length === 0, errs.slice(0, 3));
  void before;
  await ctx.close();
}

// ======================================================================= safe area (notch / home indicator) + rotate behaviour
function hudPanelsJS() {
  // drawHud's layout in logical units → CSS px rects
  const R = AC.Game.renderer, w = AC.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW;
  const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
  const K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, ptop = I.top + 12, pw = 190 * Math.min(K, 1.1), hb = R._hudBtn;
  const right = hb ? hb.l - 10 : R.VW - 110; let cx, cy, cw; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, R.VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = ptop; }
  else { cw = Math.min(R.VW - I.left - I.right - 24, 420); cx = R.VW / 2; cy = ptop + 108; }
  const S = 1.55 * L.unit, sw = [L.cx - L.swingA, L.cx + L.swingA].map(x => css(x - S * 0.45, w.saucer.y - w.cam.y - S * 0.5, S * 0.9, S));
  const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom }; });
  return { VW: R.VW, panels: { score: css(x0, ptop, pw, 98), zone: css(cx - cw / 2, cy, cw, 78) }, swing: sw, btns, vw: innerWidth, vh: innerHeight, ins: R.ins, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom } };
}
const AC_VW = g => g.VW;
async function sSafeArea() {
  const cases = [
    ['iphone_port_390x844@3', { width: 390, height: 844 }, 3, { top: 47, right: 0, bottom: 34, left: 0 }],
    ['iphone_land_844x390@3', { width: 844, height: 390 }, 3, { top: 0, right: 47, bottom: 21, left: 47 }],
    ['ipad_1024x768@2', { width: 1024, height: 768 }, 2, { top: 24, right: 0, bottom: 20, left: 0 }],
    ['ipad_pro_1366x1024@2', { width: 1366, height: 1024 }, 2, { top: 24, right: 0, bottom: 20, left: 0 }]
  ];
  for (const [tag, vp, dpr, sa] of cases) {
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: true, isMobile: true }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.95&diff=normal&speed=2');
    await waitMode(p, 'playing');
    await p.addStyleTag({ content: `#safeProbe{padding:${sa.top}px ${sa.right}px ${sa.bottom}px ${sa.left}px !important}` });
    await p.evaluate(() => AC.Game.relayout()); await sleep(500);
    const g = await p.evaluate(hudPanelsJS);
    const expIns = ['top', 'right', 'bottom', 'left'].every(k => Math.abs(g.ins[k] * (g.canvas.r - g.canvas.l) / AC_VW(g) - Math.max(0, sa[k] - (k === 'top' || k === 'bottom' ? g.canvas.t : g.canvas.l))) < 2);
    check(`safe area ${tag}: the probe's insets reach the renderer (R.ins)`, expIns, { ins: Object.fromEntries(Object.entries(g.ins).map(([k, v]) => [k, +v.toFixed(1)])), sa });
    const inSafe = r => r.l >= sa.left - 1 && r.t >= sa.top - 1 && r.r <= g.vw - sa.right + 1 && r.b <= g.vh - sa.bottom + 1;
    const badP = Object.entries(g.panels).filter(([, r]) => !inSafe(r)).map(([n, r]) => n + ':' + [r.l, r.t, r.r, r.b].map(Math.round));
    check(`safe area ${tag}: HUD panels (score, time of day) inside the safe area`, badP.length === 0, badP.length ? { badP, sa } : undefined);
    const badB = g.btns.filter(b => !inSafe(b)).map(b => b.id + ':' + [b.l, b.t, b.r, b.b].map(Math.round));
    check(`safe area ${tag}: pause / sound buttons inside the safe area`, badB.length === 0, badB.length ? { badB, sa } : undefined);
    const badS = g.swing.filter(r => r.l < sa.left - 1 || r.r > g.vw - sa.right + 1).map(r => [r.l, r.r].map(Math.round));
    check(`safe area ${tag}: Ziggy's whole swing stays clear of the notch sides`, badS.length === 0, badS.length ? { badS, sa } : undefined);
    const rot = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 40 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && /rotate|turn your|landscape|portrait/i.test(e.textContent || '') && !e.closest('.hidden'); }).map(e => e.id || e.className));
    check(`safe area ${tag}: no rotate prompt blocks play (both orientations are supported)`, rot.length === 0 && await mode(p) === 'playing', rot);
    await p.screenshot({ path: OUT + `/func_safe_${tag.replace('@', '_')}.png` });
    check(`safe area ${tag}: no console errors`, errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // rotate portrait → landscape mid-drop, then back; held crate / saucer on screen, nothing lost
  const { page: p, errs, ctx } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, '?mute=1&seed=9&diff=normal');
  await startPlaying(p);
  for (let i = 0; i < 4; i++) await armDrop(p, 'perfect');
  const before = await p.evaluate(() => ({ placed: AC.debug.world.placed, score: AC.debug.world.score, n: AC.debug.world.tower.list.length }));
  await p.evaluate(() => AC.debug.drop()); await sleep(60);   // a crate in the air during the rotation
  await p.setViewportSize({ width: 844, height: 390 }); await sleep(900);
  await holding(p);
  const g1 = await p.evaluate(() => { const w = AC.debug.world, L = w.layout, R = AC.Game.renderer; return { portrait: L.portrait, VW: R.VW, VH: R.VH, lw: L.width, n: w.tower.list.length, off: w.tower.list.filter(c => c.x - c.w / 2 < 0 || c.x + c.w / 2 > L.width).length, sx: w.saucer.x, sy: w.saucer.y - w.cam.y, topS: w.tower.topY - w.cam.y, hearts: w.hearts, score: w.score }; });
  check('rotation: portrait → landscape with a crate in the air: landscape layout, tower intact, saucer + top on screen', !g1.portrait && g1.lw === g1.VW && g1.n >= before.n && g1.off === 0 && g1.sx > 0 && g1.sx < g1.VW && g1.sy > 0 && g1.topS > 0 && g1.topS < g1.VH && g1.score >= before.score, Object.assign({ before }, g1));
  await p.evaluate(() => AC.Game.pause());
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(900);
  const g2 = await p.evaluate(() => ({ mode: AC.Game.mode, ui: AC.UI.current, portrait: AC.debug.world.layout.portrait }));
  check('rotation: rotating while paused keeps the Pause screen and re-lays out', g2.mode === 'paused' && g2.ui === 'scrPause' && g2.portrait, g2);
  await p.evaluate(() => AC.Game.resume()); await sleep(400);
  check('rotation: no console errors', errs.length === 0 && await p.evaluate(() => AC.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  await startServer();
  console.log('serving game/ at ' + GAME);
  process.on('exit', stopServer);
  const only = process.argv[2];
  const sections = { sStatic, sBoot, sMenus, sExtras, sInput, sPointer, sTouch, sRules, sRules2, sZones, sHearts, sPause, sSettings, sStorage, sBest, sPictures, sLight, sLayout, sSafeArea, sLongRun };
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
