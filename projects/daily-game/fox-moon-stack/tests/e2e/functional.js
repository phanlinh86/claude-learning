// Functional QA suite for Juno's Moon Stack.
// Run: node tests/e2e/functional.js [sectionFilter]      (LONG_RUN_S=60 by default)
// Prints PASS/FAIL per check, screenshots in tests/out/func_*.png, exits 1 on any FAIL.
// Sections: static (Go wrapper + iOS) · boot · menus · input · touch · rules · hearts · pause · settings ·
// best · pictures · layout (6 sizes / DPRs) · long bot run at ?speed=16.
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
// counters + event log + an "arm" that makes the player drop at a chosen moment (inside the game loop, exact)
async function instrument(page) {
  await page.waitForFunction(() => window.MS && MS.debug && MS.Game && MS.Game.mode !== 'boot', null, { timeout: 20000 });
  await page.evaluate(() => {
    const G = MS.Game; G._starts = 0; const o = G.startGame;
    G.startGame = function () { this._starts++; window._ev = []; return o.apply(this, arguments); };
    window._ev = [];
    const h = G.handleEvents;
    G.handleEvents = function (evts) {
      for (const e of evts) window._ev.push({ type: e.type, combo: e.combo, bonus: e.bonus, total: e.total, hearts: e.hearts, grow: e.grow, level: e.level, zone: e.zone, perfect: e.perfect, count: e.count, score: this.world.score });
      if (window._ev.length > 4000) window._ev.splice(0, 2000);
      return h.apply(this, arguments);
    };
    // window._arm: 'miss' | 'perfect' | 'edge' | 'coin' → the player drops when the predicted landing matches
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
          else if (a === 'coin') {
            const c = w.coinList.find(c => c.state === 'float');
            if (c && pl.perfect && Math.abs(pl.dx) < pl.tol * 0.5) { c.x = (w.held.x + pl.x) / 2; go = true; }
          }
        }
        if (go) { window._arm = null; window._armed = (window._armed || 0) + 1; this.drop(); }
      }
      return r;
    };
  });
}
const mode = p => p.evaluate(() => MS.Game.mode);
const ui = p => p.evaluate(() => MS.UI.current);
const starts = p => p.evaluate(() => MS.Game._starts);
const drops = p => p.evaluate(() => MS.debug.world.stats.drops);
const waitMode = (p, m, t) => p.waitForFunction(m => MS.Game.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const waitUi = (p, u, t) => p.waitForFunction(u => MS.UI.current === u, u, { timeout: t || 4000 }).then(() => true, () => false);
const holding = (p, t) => p.waitForFunction(() => { const w = MS.debug.world; return MS.Game.mode === 'playing' && w.phase === 'swing' && !!w.held; }, null, { timeout: t || 8000 }).then(() => true, () => false);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const evs = (p, type) => p.evaluate(t => window._ev.filter(e => e.type === t), type);
async function stageXY(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.82]; }); }
async function startPlaying(p, keepHearts) {
  await p.evaluate(() => MS.Game.startGame());
  await waitMode(p, 'playing');
  await holding(p);
  if (!keepHearts) await p.evaluate(() => { MS.debug.world.hearts = 99; });
}
// arm a drop and wait until it has happened and the world is holding again (or over)
async function armDrop(p, kind, t) {
  const before = await p.evaluate(() => window._armed || 0);
  await p.evaluate(k => { window._arm = k; }, kind);
  const ok = await p.waitForFunction(b => (window._armed || 0) > b, before, { timeout: t || 15000 }).then(() => true, () => false);
  await p.waitForFunction(() => { const w = MS.debug.world; return (w.phase === 'swing' && w.held) || w.phase === 'over' || w.phase === 'goal' || MS.Game.mode !== 'playing'; }, null, { timeout: 15000 }).catch(() => {});
  if (!ok) await p.evaluate(() => { window._arm = null; });
  return ok;
}
// game over now: one heart, then a sure miss
async function killNow(p, score) {
  await holding(p);
  await p.evaluate(s => { const w = MS.debug.world; w.hearts = 1; if (s != null) w.score = s; MS.debug.setSpeed(3); }, score);
  await armDrop(p, 'miss');
  const ok = await waitMode(p, 'over', 15000);
  await p.evaluate(() => MS.debug.setSpeed(1));
  return ok;
}

// ======================================================================= static review
async function sStatic() {
  const go = fs.readFileSync(path.join(ROOT, 'app/main.go'), 'utf8');
  check('static/app: fixed loopback port 127.0.0.1:47621 with free-port fallback', /127\.0\.0\.1:47621/.test(go) && /127\.0\.0\.1:0"/.test(go));
  check('static/app: storage in %APPDATA%\\JunosMoonStack\\data', /filepath\.Join\(appData, "JunosMoonStack"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go));
  check('static/app: binds ffStoreAll/Set/Del, ffFullscreen, ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  check('static/app: atomic write (tmp + rename) and key filter', /\.tmp"/.test(go) && /os\.Rename/.test(go) && /\^\[a-zA-Z0-9_\\-\]\{1,64\}\$/.test(go));
  const keys = ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_crate', 'shape_crate', 'img_coin', 'img_bg_moon', 'img_bg_comet'];
  check('static/app: every storage key the game writes passes the Go key filter', keys.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k)));
  check('static/app: single-instance mutex + WebView2-missing browser fallback', go.includes('SingleInstance') && go.includes('FileProtocolHandler'));
  const fallbackUrlHasApp = /url := .*\?app=1/.test(go) && /FileProtocolHandler", url\)/.test(go);
  check('static/app: browser fallback does not pass ?app=1 (Quit button would not work in a tab)', !fallbackUrlHasApp);
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  check('static/iOS: viewport no zoom + viewport-fit=cover', /user-scalable=no/.test(html) && /maximum-scale=1/.test(html) && /viewport-fit=cover/.test(html));
  check('static/iOS: apple-mobile-web-app-capable, touch icon and manifest', /apple-mobile-web-app-capable/.test(html) && /apple-touch-icon/.test(html) && /manifest\.webmanifest/.test(html));
  check('static/iOS: home-screen PNG icons exist', ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].every(f => fs.existsSync(path.join(ROOT, 'game/assets/icons', f))));
  const assets = fs.readFileSync(path.join(ROOT, 'game/js/assets.js'), 'utf8');
  const listed = [];
  assets.replace(/D \+ '([^']+)'/g, (m, f) => listed.push(f));
  const missing = [];
  for (const k of ['idle', 'drop', 'happy', 'oops']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/juno_' + k + '.svg'))) missing.push('juno_' + k);
  for (const z of ['moon', 'dunes', 'rings', 'comet']) for (const l of ['sky', 'far', 'ground']) if (!fs.existsSync(path.join(ROOT, `game/assets/default/levels/${z}/${l}.svg`))) missing.push(z + '/' + l);
  for (const pn of ['star', 'sparkle', 'puff', 'dust', 'ice', 'snow', 'heart', 'spark', 'coinbit', 'petal']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/particles/' + pn + '.svg'))) missing.push('p_' + pn);
  for (const f of ['rocket.svg', 'flame.svg', 'beam.svg', 'base.svg', 'flag.svg', 'heart.svg', 'heart_empty.svg', 'icon.svg']) if (!fs.existsSync(path.join(ROOT, 'game/assets/default/' + f))) missing.push(f);
  check('static: every default asset file exists', missing.length === 0, missing.length ? missing : undefined);
}

// ======================================================================= boot
async function sBoot() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=7');
  check('boot: reaches the title screen', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  await sleep(3000);
  const st = await p.evaluate(() => ({ drops: MS.debug.world.stats.drops, hud: !document.getElementById('hud').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id }));
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
  check('menus: Pause → Restart starts a fresh game', await waitMode(p, 'playing') && await starts(p) === s0 + 1 && await p.evaluate(() => MS.debug.world.stats.drops === 0));
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
  const muted0 = await p.evaluate(() => MS.Game.settings.muted || MS.Game.urlMute);
  await p.click('#btnMuteHud');
  await sleep(200);
  check('input: clicking the mute button toggles sound and does not drop', await drops(p) === d0 && (await p.evaluate(() => MS.Game.settings.muted || MS.Game.urlMute)) !== muted0);
  await p.click('#btnMuteHud');
  await p.click('#btnPause');
  check('input: clicking the pause button pauses and does not drop', await mode(p) === 'paused' && await drops(p) === d0);
  await p.mouse.click(sx, sy);   // on the dim pause overlay
  await p.keyboard.press('Space');
  check('input: clicks / Space on the pause screen never drop', await drops(p) === d0);
  await p.click('#btnResume'); await waitMode(p, 'playing'); await sleep(200);
  check('input: the click on Resume does not drop', await drops(p) === d0);
  // title: focused Play + Space / Enter start exactly once
  await p.evaluate(() => MS.Game.toTitle());
  await sleep(200);
  let s0 = await starts(p);
  await p.keyboard.press('Space');
  await sleep(300);
  check('input: Space on the title (Play focused) starts exactly once, no drop', await starts(p) === s0 + 1 && await drops(p) === 0, { starts: (await starts(p)) - s0 });
  await p.evaluate(() => MS.Game.toTitle()); await sleep(200);
  s0 = await starts(p);
  await p.keyboard.press('Enter');
  await sleep(300);
  check('input: Enter on the title (Play focused) starts exactly once, no drop', await starts(p) === s0 + 1 && await drops(p) === 0, { starts: (await starts(p)) - s0 });
  await p.evaluate(() => MS.Game.toTitle()); await sleep(200);
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
  await holding(p); await p.evaluate(() => { MS.debug.world.hearts = 99; });
  await sleep(300);
  check('touch: the tap on Play did not also drop a crate', await drops(p) === 0);
  const [sx, sy] = await stageXY(p);
  await p.touchscreen.tap(sx, sy); await sleep(150);
  check('touch: a tap on the stage drops exactly one crate', await drops(p) === 1);
  await holding(p);
  const d0 = await drops(p), m0 = await p.evaluate(() => MS.Game.settings.muted || MS.Game.urlMute);
  await p.tap('#btnMuteHud'); await sleep(700);
  check('touch: tap the mute button toggles once and does not drop', await drops(p) === d0 && (await p.evaluate(() => MS.Game.settings.muted || MS.Game.urlMute)) !== m0);
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
  let sc0 = await p.evaluate(() => MS.debug.world.score);
  check('rules: perfect drop armed', await armDrop(p, 'perfect'));
  let st = await p.evaluate(() => ({ score: MS.debug.world.score, combo: MS.debug.world.combo, coins: window._ev.filter(e => e.type === 'coin').length, perf: window._ev.filter(e => e.type === 'perfect').map(e => e.combo) }));
  check('rules: first perfect = +10 placed + 10×1 bonus (+5 per coin)', st.score - sc0 === 20 + 5 * st.coins && st.combo === 1, Object.assign({ delta: st.score - sc0 }, st));
  sc0 = st.score; let c0 = st.coins;
  await armDrop(p, 'perfect');
  st = await p.evaluate(() => ({ score: MS.debug.world.score, combo: MS.debug.world.combo, coins: window._ev.filter(e => e.type === 'coin').length }));
  check('rules: second perfect in a row = +10 + 10×2', st.score - sc0 === 30 + 5 * (st.coins - c0) && st.combo === 2, { delta: st.score - sc0, combo: st.combo });
  sc0 = st.score; c0 = st.coins;
  await armDrop(p, 'edge');
  st = await p.evaluate(() => ({ score: MS.debug.world.score, combo: MS.debug.world.combo, coins: window._ev.filter(e => e.type === 'coin').length, edge: window._ev.filter(e => e.type === 'edge').length, br: window._ev.filter(e => e.type === 'comboBreak').length, topple: window._ev.filter(e => e.type === 'topple').length }));
  check('rules: off-centre landing = +10 only, combo resets', st.edge === 1 && st.score - sc0 === 10 + 5 * (st.coins - c0) && st.combo === 0 && st.br >= 1, Object.assign({ delta: st.score - sc0 }, st));
  // coin: steer a floating coin into the fall path
  await p.waitForFunction(() => MS.debug.world.coinList.some(c => c.state === 'float'), null, { timeout: 2000 }).catch(() => {});
  let tries = 0, got = false;
  while (tries++ < 8 && !got) {
    const hasCoin = await p.evaluate(() => MS.debug.world.coinList.some(c => c.state === 'float'));
    const b = await p.evaluate(() => ({ s: MS.debug.world.score, c: MS.debug.world.coins, combo: MS.debug.world.combo }));
    await armDrop(p, hasCoin ? 'coin' : 'perfect');
    const a = await p.evaluate(() => ({ s: MS.debug.world.score, c: MS.debug.world.coins, combo: MS.debug.world.combo, perfect: window._ev.length && window._ev.filter(e => e.type === 'perfect').slice(-1)[0] }));
    if (a.c > b.c) {
      got = true;
      const exp = 10 + (a.combo > 0 ? 10 * Math.min(a.combo, 5) : 0) + 5 * (a.c - b.c);
      check('rules: a star-coin caught by the falling crate = +5 (and counted)', a.s - b.s === exp, { delta: a.s - b.s, exp, coins: a.c - b.c });
    }
  }
  if (!got) check('rules: a star-coin caught by the falling crate = +5 (and counted)', false, 'no coin collected in 8 drops');
  // run to the goal with a perfect bot and check the whole ledger
  await p.evaluate(() => { MS.debug.setBot(true, 1); MS.debug.setSpeed(4); });
  const goal = await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 60000 }).then(() => true, () => false);
  await p.evaluate(() => MS.debug.setSpeed(1));
  check('rules: reaching the crate goal → levelUp', goal);
  const L = await p.evaluate(() => {
    const ev = window._ev, w = MS.debug.world;
    let exp = 0;
    for (const e of ev) {
      if (e.type === 'land') exp += 10;
      if (e.type === 'perfect') exp += 10 * Math.min(e.combo, 5);
      if (e.type === 'coin') exp += 5;
      if (e.type === 'goal') exp += e.bonus;
    }
    const g = ev.find(e => e.type === 'goal'), lu = ev.find(e => e.type === 'levelUp'), maxCombo = Math.max(0, ...ev.filter(e => e.type === 'perfect').map(e => e.combo));
    return { exp, score: w.score, goalBonus: g && g.bonus, lu: lu && { level: lu.level, zone: lu.zone }, level: w.level, zone: w.zone, vis: MS.Game.renderer.vis.cur, rocket: ev.some(e => e.type === 'rocket'), maxCombo, placed: w.placed, goal: w.goal, hearts: w.hearts, maxHearts: w.maxHearts };
  });
  check('rules: score ledger matches (10/placed + 10×min(combo,5)/perfect + 5/coin + goal bonus)', L.exp === L.score, { exp: L.exp, score: L.score });
  check('rules: goal bonus on planet 1 = 100 × (zone+1) × (loop+1) = 100', L.goalBonus === 100, L.goalBonus);
  check('rules: a rocket lands before the planet changes', L.rocket);
  check('rules: level 2 is Rusty Dunes (zone 1), fresh tower, renderer switches planet', L.lu && L.lu.level === 1 && L.lu.zone === 1 && L.level === 1 && L.vis === 1 && L.placed <= 1 && L.goal === 12, L);
  check('rules: combo is capped at ×5 for points (ledger uses min) and grows past 2', L.maxCombo >= 3, L.maxCombo);
  // goal bonus on zone 3 loop 1: 100×3×2
  await p.evaluate(() => { MS.debug.gotoLevel(6); window._ev = []; MS.debug.setSpeed(6); });
  const g2 = await p.waitForFunction(() => window._ev.some(e => e.type === 'goal'), null, { timeout: 90000 }).then(() => true, () => false);
  await p.evaluate(() => MS.debug.setSpeed(1));
  const gb = await p.evaluate(() => (window._ev.find(e => e.type === 'goal') || {}).bonus);
  check('rules: goal bonus on level 7 (Ring World, round 2) = 100×3×2 = 600', g2 && gb === 600, gb);
  // hearts reward on a new planet
  await p.evaluate(() => { MS.debug.setBot(false); });
  await holding(p, 20000);
  // gotoLevel is a jump (no reward); the +1 heart belongs to goal → travel → levelUp: make the next crate the goal
  await p.evaluate(() => { MS.debug.gotoLevel(2); });
  await holding(p);
  await p.evaluate(() => { const w = MS.debug.world; w.hearts = 1; w.goal = w.tower.list.length + 1; MS.debug.setBot(true, 1); MS.debug.setSpeed(4); window._ev = []; });
  await p.waitForFunction(() => window._ev.some(e => e.type === 'levelUp'), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => MS.debug.setSpeed(1));
  const hr = await p.evaluate(() => MS.debug.world.hearts);
  check('rules: +1 heart back on reaching a new planet', hr === 2, hr);
  check('rules: no console errors', errs.length === 0 && await p.evaluate(() => MS.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= hearts / game over
async function sHearts() {
  const { page: p, errs, ctx } = await open({}, '?mute=1&seed=3&diff=normal');
  await startPlaying(p, true);
  check('hearts: Normal starts with 3 hearts', await p.evaluate(() => MS.debug.world.hearts === 3 && MS.debug.world.maxHearts === 3));
  await p.evaluate(() => { const w = MS.debug.world; w.grow = 2; });
  await armDrop(p, 'miss');
  await sleep(300);
  const s = await p.evaluate(() => ({ hearts: MS.debug.world.hearts, grow: MS.debug.world.grow, miss: window._ev.filter(e => e.type === 'miss').length, hl: window._ev.filter(e => e.type === 'heartLost').length, mode: MS.Game.mode }));
  check('hearts: a miss costs exactly one heart and shrinks Juno one step', s.hearts === 2 && s.grow === 1 && s.miss === 1 && s.hl === 1, s);
  // topple: build an offset tower so the COM leaves the support → one heart for miss+topple
  await holding(p);
  await armDrop(p, 'miss');
  await sleep(200);
  check('hearts: second miss → 1 heart left', await p.evaluate(() => MS.debug.world.hearts === 1));
  await armDrop(p, 'miss');
  check('hearts: last heart lost → game over screen', await waitMode(p, 'over', 8000) && await ui(p) === 'scrOver');
  const ov = await p.evaluate(() => ({ phase: MS.debug.world.phase, hud: document.getElementById('hud').classList.contains('hidden'), games: MS.debug.stats.games }));
  check('hearts: world phase over, HUD hidden, game counted', ov.phase === 'over' && ov.hud && ov.games === 1, ov);
  // pause is not possible during the death delay
  await startPlaying(p, true);
  await p.evaluate(() => { MS.debug.world.hearts = 1; });
  await armDrop(p, 'miss');
  await p.waitForFunction(() => MS.Game.deadT >= 0, null, { timeout: 8000 }).catch(() => {});
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
  const t0 = await p.evaluate(() => MS.debug.world.time);
  await sleep(700);
  check('pause: the world is frozen while paused', await p.evaluate(() => MS.debug.world.time) === t0);
  await p.keyboard.press('Escape');
  check('pause: Esc again resumes', await mode(p) === 'playing');
  await sleep(300);
  const t1 = await p.evaluate(() => MS.debug.world.time);
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
  await p.evaluate(() => MS.Game.toTitle());
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('pause: blur on the title does nothing', await mode(p) === 'title' && await ui(p) === 'scrTitle');
  check('pause: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= settings
async function sSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: p, errs } = await open(null, '?seed=2', ctx);
  const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem('jms:settings') || 'null'));
  check('settings: first run defaults (sfx on, music on, Easy, not muted)', await p.evaluate(() => { const s = MS.Game.settings; return s.sfx && s.music && !s.muted && s.difficulty === 'easy'; }));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('label.set:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  await p.keyboard.press('KeyM');
  let s = await ls();
  check('settings: sfx/music off, Hard and mute saved to localStorage', s && s.sfx === false && s.music === false && s.difficulty === 'hard' && s.muted === true, s);
  await p.reload(); await instrument(p);
  const r = await p.evaluate(() => ({ s: MS.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, diff: MS.Game.difficulty() }));
  check('settings: survive a reload (state + controls)', !r.s.sfx && !r.s.music && r.s.muted && r.s.difficulty === 'hard' && !r.sfx && !r.music && r.on === 'hard' && r.diff === 'hard', r);
  await p.evaluate(() => MS.Game.startGame()); await waitMode(p, 'playing');
  check('settings: a new game uses the saved difficulty (Hard → 3 hearts, hard preset)', await p.evaluate(() => MS.debug.world.difficulty === 'hard'));
  await p.evaluate(() => MS.Game.toTitle());
  // test flags never saved
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(GAME + '?mute=1&diff=normal&seed=2'); await instrument(p);
  check('settings: ?mute=1 mutes audio without touching saved settings', await p.evaluate(() => MS.Game.urlMute && !MS.Game.settings.muted));
  check('settings: ?diff=normal is used for play', await p.evaluate(() => MS.Game.difficulty() === 'normal'));
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('label.set:has(#setSfx)');
  await p.click('#scrSettings .btn-back'); await waitUi(p, 'scrTitle');
  s = await ls();
  check('settings: saving another setting under ?mute=1&diff=normal stores muted:false, difficulty:easy', s && s.muted === false && s.difficulty === 'easy' && s.sfx === false, s);
  const segOn = await p.evaluate(() => { MS.UI.show('scrSettings'); const b = document.querySelector('#setDifficulty .on'); return b && b.dataset.v; });
  check('settings: with ?diff=normal the Settings screen shows the difficulty actually played', segOn === 'normal', segOn);
  await p.evaluate(() => MS.UI.show('scrTitle'));
  await p.keyboard.press('KeyM');   // clears the URL mute only (sound on), nothing saved as muted
  s = await ls();
  check('settings: M under ?mute=1 unmutes for this session without saving "muted"', await p.evaluate(() => !MS.Game.urlMute) && s.muted === false, s);
  await p.goto(GAME + '?seed=2'); await instrument(p);
  check('settings: after leaving the test URL the saved difficulty is still Easy, not muted', await p.evaluate(() => MS.Game.difficulty() === 'easy' && !MS.Game.settings.muted));
  check('settings: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= best score per difficulty
async function sBest() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p, errs } = await open(null, '?mute=1&seed=4', ctx);
  await p.evaluate(() => { localStorage.clear(); MS.Storage.cache = {}; });
  for (const [d, sc] of [['easy', 120], ['normal', 340], ['hard', 560]]) {
    await p.evaluate(d => MS.Game.setSetting('difficulty', d), d);
    await startPlaying(p, true);
    await killNow(p, sc);
  }
  const b = await p.evaluate(() => ['easy', 'normal', 'hard'].map(d => localStorage.getItem('jms:best_' + d)));
  check('best: saved separately per difficulty', b[0] === '120' && b[1] === '340' && b[2] === '560', b);
  check('best: game over shows NEW! for a new best', await p.evaluate(() => !document.getElementById('newBest').classList.contains('hidden')));
  await p.evaluate(() => MS.Game.setSetting('difficulty', 'normal'));
  await startPlaying(p, true); await killNow(p, 100);
  check('best: a lower score keeps the old best and shows no NEW!', await p.evaluate(() => localStorage.getItem('jms:best_normal') === '340' && document.getElementById('overBest').textContent === '340' && document.getElementById('newBest').classList.contains('hidden')));
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  const titles = [];
  for (const d of ['easy', 'normal', 'hard']) { await p.evaluate(d => { MS.Game.setSetting('difficulty', d); MS.UI.show('scrTitle'); }, d); titles.push(await p.textContent('#bestTitle')); }
  check('best: the title shows the best of the chosen difficulty', titles.join() === '120,340,560', titles);
  // a mid-run difficulty change: the run still counts for the difficulty it started on
  await p.evaluate(() => MS.Game.setSetting('difficulty', 'easy'));
  await startPlaying(p, true);
  await p.evaluate(() => { MS.Game.setSetting('difficulty', 'hard'); MS.debug.world.score = 200; });
  await sleep(200);
  const hudBest = await p.evaluate(() => MS.Game.best(MS.Game.runDifficulty));   // what drawHud shows
  await killNow(p, 200);
  check('best: a run started on Easy saves to best_easy even if Settings changed mid-run', await p.evaluate(() => localStorage.getItem('jms:best_easy') === '200' && localStorage.getItem('jms:best_hard') === '560'));
  check('best: the in-game HUD "Best" belongs to the run\'s difficulty (not the one changed mid-run)', hudBest === 120, { hudBest, expected: 120 });
  await sleep(800);
  await p.click('#btnOverMenu'); await waitUi(p, 'scrTitle');
  await p.click('#btnSettings'); await waitUi(p, 'scrSettings');
  await p.click('#btnResetBest');
  check('best: one tap on Reset only arms it ("Sure?")', await p.evaluate(() => localStorage.getItem('jms:best_hard') === '560' && document.getElementById('btnResetBest').textContent === 'Sure?'));
  await p.click('#btnResetBest');
  check('best: a second tap clears every best', await p.evaluate(() => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('jms:best_' + d) === null)));
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
  const slotIndex = { hero: 0, crate: 1, coin: 2, bg_moon: 3, bg_dunes: 4, bg_rings: 5, bg_comet: 6 };
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  check('pictures: 7 slots (Juno, crate, coin, 4 planets)', await p.evaluate(() => document.querySelectorAll('#slotGrid .slot').length) === 7);
  async function pick(slot, file) {
    await p.evaluate(() => { const t = document.getElementById('toast'); t.classList.add('hidden'); t.textContent = ''; });
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slotIndex[slot] + 1}) [data-act=pick]`)]);
    await fc.setFiles(file);
    await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && t.textContent && !/Saving/.test(t.textContent); }, null, { timeout: 20000 }).catch(() => {});
    return p.evaluate(() => document.getElementById('toast').textContent);
  }
  const stored = slot => p.evaluate(async slot => {
    const d = localStorage.getItem('jms:img_' + slot); if (!d) return null;
    const im = new Image(); im.src = d; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')), shape: localStorage.getItem('jms:shape_' + slot) };
  }, slot);
  let toast = await pick('hero', files.png), s = await stored('hero');
  check('pictures: PNG with transparency → Juno, kept whole ("fit")', /saved/i.test(toast) && s && s.shape === 'fit' && await p.evaluate(() => MS.Assets.hasCustom('hero')), { toast, s });
  toast = await pick('crate', files.opaque); s = await stored('crate');
  check('pictures: opaque picture → crate saved (whole picture: crates are boxes, never round by default)', /saved/i.test(toast) && s && s.shape !== 'circle', { toast, s });
  toast = await pick('coin', files.png); s = await stored('coin');
  check('pictures: star-coin picture saved', /saved/i.test(toast) && s, { toast, s });
  const tag = await p.textContent('#slotGrid .slot:nth-child(1) .tag');
  check('pictures: the card shows "Your picture"', /Your picture/.test(tag), tag);
  toast = await pick('bg_dunes', files.txt); s = await stored('bg_dunes');
  check('pictures: a text file → friendly error toast, nothing stored', /picture file/i.test(toast) && s === null, toast);
  toast = await pick('bg_dunes', files.broken); s = await stored('bg_dunes');
  check('pictures: a broken "PNG" → friendly error toast, nothing stored', /could not be opened/i.test(toast) && s === null, toast);
  toast = await pick('bg_moon', files.huge); s = await stored('bg_moon');
  check('pictures: 4000×3000 picture → Moon Base background downscaled to 1600×1200 JPEG', /saved/i.test(toast) && s && s.w === 1600 && s.h === 1200 && s.type === 'image/jpeg', { toast, s });
  toast = await pick('crate', files.huge); s = await stored('crate');
  check('pictures: 4000×3000 picture → crate downscaled to ≤ 512 px', /saved/i.test(toast) && s && Math.max(s.w, s.h) <= 512, { toast, s });
  await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=circle]');
  check('pictures: shape button switches Juno to Round', await p.evaluate(() => localStorage.getItem('jms:shape_hero') === 'circle' && MS.Assets.custom.hero.width === 512));
  await p.screenshot({ path: OUT + '/func_pictures.png' });
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => { MS.Game.startGame(); MS.debug.setBot(true, 0.9); MS.debug.setSpeed(3); });
  await p.waitForFunction(() => MS.debug.world.placed >= 4, null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => MS.debug.setSpeed(1)); await sleep(500);
  const play = await p.evaluate(() => { const R = MS.Game.renderer, w = MS.debug.world; return { custom: !!R.background(0).custom, zone: R.vis.cur, placed: w.placed, errors: MS.debug.stats.errors.length }; });
  await p.screenshot({ path: OUT + '/func_custom_play.png' });
  const px = await p.evaluate(() => { const c = MS.Game.renderer.canvas, g = c.getContext('2d'); const d = g.getImageData(0, Math.round(c.height * 0.3), c.width, 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  check('pictures: the game plays with custom Juno / crate / coin / Moon background (no errors)', play.custom && play.placed >= 4 && play.errors === 0, play);
  check('pictures: the frame is actually drawn (not blank)', px > 30, Math.round(px));
  await p.evaluate(() => MS.debug.gotoLevel(1)); await sleep(1500);
  check('pictures: planets without a custom picture still use the default scene', await p.evaluate(() => !MS.Game.renderer.background(1).custom));
  await p.reload(); await instrument(p);
  check('pictures: custom pictures survive a reload', await p.evaluate(() => ['hero', 'crate', 'coin', 'bg_moon'].every(s => MS.Assets.hasCustom(s))));
  await p.click('#btnCustomize'); await waitUi(p, 'scrCustom');
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]');
  const r1 = await p.evaluate(() => ({ hero: MS.Assets.hasCustom('hero'), k: localStorage.getItem('jms:img_hero'), shape: localStorage.getItem('jms:shape_hero'), crate: MS.Assets.hasCustom('crate') }));
  check('pictures: Reset on one card clears only that picture', !r1.hero && r1.k === null && r1.shape === null && r1.crate, r1);
  await p.click('#btnResetAll');
  const r2 = await p.evaluate(() => ({ any: MS.Assets.SLOTS.some(s => MS.Assets.hasCustom(s.id)), keys: Object.keys(localStorage).filter(k => /^jms:(img|shape)_/.test(k)) }));
  check('pictures: Reset all clears every picture and its stored data', !r2.any && r2.keys.length === 0, r2);
  await p.click('#scrCustom .btn-back'); await waitUi(p, 'scrTitle');
  await p.evaluate(() => MS.Game.startGame()); await sleep(800);
  check('pictures: after Reset all the default scene is drawn again', await p.evaluate(() => !MS.Game.renderer.background(0).custom));
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
    ['ipad_land_1180x820', { width: 1180, height: 820 }, 2, true]
  ];
  for (const [name, vp, dpr, mobile] of sizes) {
    const tag = `${name}@${dpr}x`;
    const { page: p, errs, ctx } = await open({ viewport: vp, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.95&diff=normal&speed=3');
    await waitMode(p, 'playing');
    await p.waitForFunction(() => MS.debug.world.placed >= 9 || MS.debug.world.level > 0, null, { timeout: 40000 }).catch(() => {});
    await p.evaluate(() => MS.debug.setSpeed(1)); await sleep(600);
    await p.screenshot({ path: OUT + `/func_${name}_play.png` });
    const geo = await p.evaluate(() => {
      const R = MS.Game.renderer, w = MS.debug.world, L = w.layout, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW, camY = w.cam.y;
      const css = (x, y, ww, hh) => ({ l: c.left + x * k, t: c.top + y * k, r: c.left + (x + ww) * k, b: c.top + (y + hh) * k });
      const hud = document.getElementById('hud').getBoundingClientRect();
      // Juno's visible sprite bounds (alpha scan of the idle frame; body centre at (80,78) of the 160 viewBox)
      const im = MS.Assets.img.juno_idle, sc = document.createElement('canvas'); sc.width = sc.height = 160;
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
      const panels = [['score', css(x0, ptop, pw, 98)], ['planet', css(cx - cw / 2, cy, cw, 78)]];
      const btns = ['btnPause', 'btnMuteHud'].map(id => { const q = document.getElementById(id).getBoundingClientRect(); return { id, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; });
      return { vw: innerWidth, vh: innerHeight, VW: R.VW, VH: R.VH, portrait: L.portrait, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, saucer, swing, tower, held, panels, placed: w.placed,
        hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btns, px: R.px, canvasPx: R.canvas.width, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, errors: MS.debug.stats.errors.length };
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
    // by design (visual QA P1-2) a panel FADES while Juno flies under it: check the renderer's fade for each overlap
    const fades = hit.length ? await p.evaluate(hits => {
      const R = MS.Game.renderer, w = MS.debug.world, L = w.layout, K = Math.min(R._hudK, 1.25), I = R.ins, x0 = I.left + 12, ptop = I.top + 12, pw = 190 * Math.min(K, 1.1), hb = R._hudBtn;
      const right = hb ? hb.l - 10 : R.VW - 110; let cx, cy, cw; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, R.VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = ptop; }
      else { cw = Math.min(R.VW - I.left - I.right - 24, 420); cx = R.VW / 2; cy = ptop + 108; }
      const P = { score: [x0, ptop, pw, 98], planet: [cx - cw / 2, cy, cw, 78] };
      return hits.map(([n, i]) => { const sx = L.cx + [-1, 0, 1][i] * L.swingA, s = Object.assign({}, w.saucer, { x: sx, prevX: sx, prevY: w.saucer.y });
        return R._fadeFor({ phase: 'swing', saucer: s, layout: L, alpha: 0 }, ...P[n]); });
    }, hit) : [];
    check(`layout ${tag}: HUD panels fade (≤ 0.35) whenever Juno flies under them`, fades.every(a => a <= 0.35), hit.length ? { hit, fades } : undefined);
    const hh = geo.panels.filter(([n, r]) => ov(r, geo.held)).map(([n]) => n);
    check(`layout ${tag}: HUD panels do not cover the held crate`, hh.length === 0, hh.length ? hh : undefined);
    check(`layout ${tag}: canvas backing store sharp for the DPR (within the pixel cap)`, geo.canvasPx >= Math.min(geo.vw * dpr, Math.sqrt((mobile ? 3.2e6 : 1920 * 1080) * geo.VW / geo.VH)) * 0.6, { px: +geo.px.toFixed(2), canvasPx: geo.canvasPx });
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom', 'scrPause', 'scrOver']) {
      await p.evaluate(s => {
        if (s === 'scrPause') { MS.Game.mode = 'playing'; MS.Game.deadT = -1; MS.Game.pause(); }
        else if (s === 'scrOver') MS.UI.showGameOver({ score: 12345, best: 67890, newBest: true, cleared: 4, placed: 140, perfect: 90, combo: 12, coins: 66, tallest: '18 crates', reached: 'Comet Garden (round 2)' });
        else MS.UI.show(s);
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
      if (scr === 'scrPause') await p.evaluate(() => MS.Game.resume());
    }
    await p.evaluate(() => { MS.UI.hideAll(); MS.Game.mode = 'playing'; MS.UI.setHud(true); });
    check(`layout ${tag}: no console errors`, errs.length === 0 && geo.errors === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // rotation while playing
  const { page: p, errs, ctx } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=9&autostart=1&bot=1&skill=0.95&speed=3');
  await waitMode(p, 'playing');
  await p.waitForFunction(() => MS.debug.world.placed >= 6, null, { timeout: 30000 }).catch(() => {});
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(900);
  const rz = await p.evaluate(() => { const w = MS.debug.world, L = w.layout, R = MS.Game.renderer, t = w.tower.list;
    const off = t.filter(c => c.x < 0 || c.x > L.width).length, topS = w.tower.topY - w.cam.y;
    return { VW: R.VW, VH: R.VH, lw: L.width, lh: L.height, portrait: L.portrait, off, baseOk: Math.abs(w.base.x - L.cx) < 1, topS: Math.round(topS), sx: Math.round(w.saucer.x) }; });
  check('layout: rotating landscape → portrait re-lays out the tower (crates on screen, base centred, top visible)', rz.portrait && rz.lw === rz.VW && rz.lh === rz.VH && rz.off === 0 && rz.baseOk && rz.topS > 0 && rz.topS < rz.VH, rz);
  await sleep(1500);
  check('layout: no errors after rotation', errs.length === 0 && await p.evaluate(() => MS.debug.stats.errors.length === 0), errs.slice(0, 3));
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
    const s = await p.evaluate(() => { const st = MS.debug.getState(); return { p: st.particles, fx: st.fx, level: st.level, crates: st.crates.length, time: st.time, drops: st.stats.drops, mode: st.mode, phase: st.phase, fl: MS.Game.renderer.flyers.length + MS.Game.renderer.texts.length }; });
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx + s.fl); maxLevel = Math.max(maxLevel, s.level); maxCrates = Math.max(maxCrates, s.crates);
    if (s.drops === lastDrops && s.mode === 'playing' && s.phase === 'swing') { stuckFor += 0.5; stuck = Math.max(stuck, stuckFor); } else stuckFor = 0;
    if (s.mode === 'over') { overRun++; notOver = Math.max(notOver, overRun); } else overRun = 0;   // a 50 ms over-screen can be sampled; two samples in a row (≥0.5 s) means stuck
    if (lastT >= 0 && s.time < lastT) simT += lastT;
    lastDrops = s.drops; lastT = s.time;
  }
  simT += Math.max(0, lastT);
  const stats = await p.evaluate(() => ({ games: MS.debug.stats.games, levels: MS.debug.stats.levels, scores: MS.debug.stats.scores, times: MS.debug.stats.times, errors: MS.debug.stats.errors }));
  await p.screenshot({ path: OUT + '/func_longrun.png' });
  console.log('      long run:', JSON.stringify({ realS: LONG_RUN_S, simMin: +(simT / 60).toFixed(1), maxParticles: maxP, maxFx, maxCrates, maxLevel, stuckS: stuck, stats }));
  check('long run: ≥ 3 games completed and auto-restarted', stats.games >= 3, stats.games);
  check('long run: every finished game has a score and a sane length (> 15 s)', stats.scores.every(s => s > 0) && stats.times.every(t => t > 15), { scores: stats.scores, times: stats.times });
  check('long run: never stuck in swing (a drop at least every 3 s real time at ×16)', stuck < 3, stuck);
  check('long run: autorestart never leaves the game-over screen up', notOver <= 1, notOver);
  check('long run: weather particles bounded (< 140)', maxP < 140, maxP);
  check('long run: renderer fx / texts / flyers bounded (< 120)', maxFx < 120, maxFx);
  check('long run: crate objects bounded (< 60, gone crates are removed)', maxCrates < 60, maxCrates);
  check('long run: MS.debug.stats.errors empty', stats.errors.length === 0, stats.errors.slice(0, 2));
  check('long run: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[2];
  const sections = { sStatic, sBoot, sMenus, sInput, sTouch, sRules, sHearts, sPause, sSettings, sBest, sPictures, sLayout, sLongRun };
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
