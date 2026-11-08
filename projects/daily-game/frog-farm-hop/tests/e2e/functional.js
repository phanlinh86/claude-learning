#!/usr/bin/env node
// Clover's Farm Hop — functional QA suite (Playwright, chromium, file://).
// Run from projects/daily-game/frog-farm-hop:   node tests/e2e/functional.js [group ...]
// Prints PASS / FAIL / WARN per check; exits 1 on any FAIL. Groups: boot menus keys pointer rules levels wind
// settings custom focus native layout soak (default: all). Screenshots + fixtures go to tests/out/functional/.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(OUT, 'fixtures'); fs.mkdirSync(FIX, { recursive: true });
const ONLY = process.argv.slice(2);
const R = { pass: 0, fail: 0, warn: 0, fails: [], warns: [] };
let GROUP = '';
function ok(name, cond, detail) {
  const d = detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  if (cond) { R.pass++; console.log('  PASS ' + name); }
  else { R.fail++; R.fails.push(GROUP + ': ' + name + d); console.log('  FAIL ' + name + d); }
  return !!cond;
}
function warn(name, cond, detail) {
  const d = detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  if (cond) { R.pass++; console.log('  PASS ' + name); }
  else { R.warn++; R.warns.push(GROUP + ': ' + name + d); console.log('  WARN ' + name + d); }
  return !!cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- in-page helpers (serialised into the page) ----------------
const STATE = () => {
  const G = FH.Game, w = G.world, h = w.hero;
  return { mode: G.mode, ui: FH.UI.current, phase: w.phase, dir: h.dir, x: h.x, vx: h.vx, y: h.y, vy: h.vy, hearts: w.hearts,
    maxHearts: w.maxHearts, score: w.score, ff: w.fireflyCount, lantern: w.lantern, level: w.level, zone: w.zone, loop: w.loop,
    camY: w.camY, maxY: w.maxY, wind: w.wind.state, wdir: w.wind.dir, time: w.time, muted: !!(G.settings.muted || G.urlMute),
    hud: !document.getElementById('hud').classList.contains('hidden') };
};
const HOOKS = () => {
  if (window.__hooked) return; window.__hooked = true;
  const G = FH.Game; window._ev = []; window._drawn = {}; window._starts = 0;
  const he = G.handleEvents;
  G.handleEvents = function (evts) {
    const r = he.call(this, evts), w = this.world, Rn = this.renderer;
    for (const e of evts) if (e.type !== 'meter') window._ev.push({ type: e.type, kind: e.kind, spring: e.spring, dir: e.dir, zone: e.zone,
      level: e.level, bonus: e.bonus, pid: e.p && e.p.id, py: e.p && e.p.y, hy: w.hero.y, hvy: w.hero.vy, hearts: w.hearts,
      vis: Rn.vis.cur, banner: Rn.banner && { s: Rn.banner.s, level: Rn.banner.level, loop: Rn.banner.loop }, az: FH.Audio.zone,
      aloop: FH.Audio.loop, wz: this.weather.zone, wloop: w.loop, t: w.time, mode: this.mode });
    if (window._ev.length > 6000) window._ev.splice(0, 2000);
    return r;
  };
  const sg = G.startGame; G.startGame = function () { window._starts++; return sg.apply(this, arguments); };
  const Rn = G.renderer, ds = Rn.drawSpr;
  Rn.drawSpr = function (g, key) { window._drawn[key] = (window._drawn[key] || 0) + 1; return ds.apply(this, arguments); };
};
const CALM = () => { const W = FH.Game.world.wind; W.state = 'calm'; W.next = 1e9; W.strength = 0; W.t = 0; };
const FORCE_FALL = (hearts) => {
  const w = FH.Game.world, h = w.hero;
  if (hearts != null) w.hearts = hearts;
  h.started = true; h.rescueT = 0; h.y = h.prevY = w.camY - 3; h.vy = -5;
};
const visible = id => !document.getElementById(id).classList.contains('hidden');

let browser;
async function open(q, opt) {
  opt = opt || {};
  const ctx = opt.ctx || await browser.newContext({ viewport: { width: opt.w || 1280, height: opt.h || 720 }, deviceScaleFactor: opt.dpr || 1,
    hasTouch: !!opt.touch, isMobile: !!opt.touch });
  if (opt.init) await ctx.addInitScript(opt.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(GAME + (q ? '?' + q : ''));
  await page.waitForFunction(() => window.FH && FH.debug && FH.Game && (FH.Game.mode === 'title' || FH.Game.mode === 'playing'), null, { timeout: 20000 });
  await page.evaluate(HOOKS);
  return { ctx, page, errors };
}
const st = p => p.evaluate(STATE);
const waitFor = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 5000 }).then(() => true, () => false);
const frames = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 3);
async function canvasRect(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }
async function toOver(p) {
  await p.evaluate(FORCE_FALL, 1);
  return waitFor(p, () => FH.Game.mode === 'over', null, 6000);
}
async function afterLock(p) { await p.waitForFunction(() => FH.Game.canRestart() && FH.UI.current === 'scrOver', null, { timeout: 3000 }); await sleep(60); }

// ======================================================================================= groups
const groups = {};

groups.boot = async () => {
  const { ctx, page, errors } = await open('seed=7');
  await sleep(3000);
  const s = await st(page);
  ok('boots to the title screen (mode title, #scrTitle shown, HUD hidden)', s.mode === 'title' && s.ui === 'scrTitle' && !s.hud, s);
  ok('title demo (bot) is running behind the menu', s.time > 1.5, 'world.time ' + s.time.toFixed(2));
  ok('zero console errors / page errors during boot + 3 s of title', errors.length === 0, errors.slice(0, 3));
  const assets = await page.evaluate(() => Object.keys(FH.Assets.files).filter(k => !FH.Assets.img[k]));
  await sleep(500);
  const missing = await page.evaluate(() => Object.keys(FH.Assets.files).filter(k => !FH.Assets.img[k]));
  ok('every default asset loaded (after streaming)', missing.length === 0, missing);
  const gs = await page.evaluate(() => { try { const s = FH.debug.getState(); return { ok: true, keys: Object.keys(s).length, particles: s.particles }; } catch (e) { return { ok: false, err: e.message }; } });
  ok('FH.debug.getState() works (DESIGN §5.4 test hook)', gs.ok, gs);
  const hooks = await page.evaluate(() => ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'steer', 'gust'].filter(k => !(k in FH.debug)));
  ok('all FH.debug hooks exist', hooks.length === 0, hooks);
  ok('best score shown on title', await page.evaluate(() => document.getElementById('bestTitle').textContent === '0'));
  await ctx.close();
  // URL flags
  const b = await open('seed=7&autostart=1&diff=hard&level=2&speed=3&mute=1');
  const s2 = await st(b.page);
  ok('?autostart=1 → playing; ?diff=hard; ?level=2 → zone 2', s2.mode === 'playing' && s2.zone === 2 && (await b.page.evaluate(() => FH.Game.world.difficulty)) === 'hard', s2);
  ok('?speed=3 sets Game.speed', (await b.page.evaluate(() => FH.Game.speed)) === 3);
  ok('?mute=1 mutes audio', (await b.page.evaluate(() => FH.Audio.muted)) === true);
  await b.ctx.close();
};

groups.menus = async () => {
  const { ctx, page, errors } = await open('seed=11&mute=1');
  const P = page;
  // title sub-screens: Esc and the button both go back
  for (const [btn, scr, back] of [['#btnHow', 'scrHow', '#scrHow .btn-back'], ['#btnSettings', 'scrSettings', '#scrSettings .btn-back'], ['#btnCustomize', 'scrCustom', '#scrCustom .btn-back']]) {
    await P.click(btn); ok(btn + ' opens ' + scr, await P.evaluate(id => FH.UI.current === id && !document.getElementById(id).classList.contains('hidden'), scr));
    await P.keyboard.press('Escape'); ok('Esc on ' + scr + ' → title', await P.evaluate(() => FH.UI.current === 'scrTitle' && FH.Game.mode === 'title'));
    await P.click(btn); await P.click(back); ok(back + ' → title', await P.evaluate(() => FH.UI.current === 'scrTitle'));
  }
  await P.click('#btnPlay');
  let s = await st(P);
  ok('Play → playing, HUD visible, menus hidden', s.mode === 'playing' && s.hud && s.ui === null, s);
  ok('Play: no Quit button in the browser', await P.evaluate(() => document.getElementById('btnQuit').classList.contains('hidden')));
  await P.keyboard.press('Escape'); s = await st(P);
  ok('Esc → paused (pause panel, HUD hidden)', s.mode === 'paused' && s.ui === 'scrPause' && !s.hud, s);
  const t0 = s.time; await sleep(300);
  ok('world frozen while paused', Math.abs((await st(P)).time - t0) < 1e-9);
  await P.keyboard.press('Escape'); ok('Esc again → resume', (await st(P)).mode === 'playing');
  await P.keyboard.press('p'); ok('P → paused', (await st(P)).mode === 'paused');
  await P.keyboard.press('p'); ok('P → resume', (await st(P)).mode === 'playing');
  await P.click('#btnPause'); ok('HUD pause button → paused', (await st(P)).mode === 'paused');
  await P.click('#btnResume'); ok('Resume button → playing', (await st(P)).mode === 'playing');
  await P.keyboard.press('Escape'); await P.click('#btnPauseSettings');
  ok('Pause → Settings', await P.evaluate(() => FH.UI.current === 'scrSettings' && FH.Game.mode === 'paused'));
  await P.keyboard.press('Escape'); ok('Esc in pause-settings → back to Pause', await P.evaluate(() => FH.UI.current === 'scrPause' && FH.Game.mode === 'paused'));
  await P.click('#btnPauseSettings'); await P.click('#scrSettings .btn-back');
  ok('Done in pause-settings → back to Pause', await P.evaluate(() => FH.UI.current === 'scrPause'));
  const w0 = await P.evaluate(() => { window.__w0 = FH.Game.world; return FH.Game.world.time; });
  await P.click('#btnRestart');
  ok('Restart → playing with a new world', await P.evaluate(() => FH.Game.mode === 'playing' && FH.Game.world !== window.__w0 && FH.Game.world.time < 1), w0);
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu');
  ok('Main Menu → title', await P.evaluate(() => FH.Game.mode === 'title' && FH.UI.current === 'scrTitle'));
  // game over
  await P.click('#btnPlay');
  ok('game over reached at 0 hearts', await toOver(P));
  const lock = await P.evaluate(() => { const dt = performance.now() - FH.Game.overAt; document.getElementById('btnAgain').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    document.getElementById('btnOverMenu').click(); return { dt, mode: FH.Game.mode }; });
  ok('restart lock: Play Again / Enter / Space / Menu ignored in the first 0.7 s', lock.mode === 'over' && lock.dt < 700, lock);
  ok('game over panel shows the score', await P.evaluate(() => FH.UI.current === 'scrOver' && document.getElementById('overScore').textContent === String(FH.Game.world.score)));
  await afterLock(P); await P.click('#btnAgain');
  ok('Play Again (after the lock) → playing', (await st(P)).mode === 'playing');
  await toOver(P); await afterLock(P); await P.click('#btnOverMenu');
  ok('Game over → Menu → title', await P.evaluate(() => FH.Game.mode === 'title' && FH.UI.current === 'scrTitle'));
  await P.click('#btnPlay'); await toOver(P); await afterLock(P);
  await P.keyboard.press('Enter'); ok('Enter on game over → plays again', (await st(P)).mode === 'playing');
  await toOver(P); await afterLock(P); await P.evaluate(() => document.activeElement && document.activeElement.blur());
  await P.keyboard.press('Space'); ok('Space on game over (nothing focused) → plays again', (await st(P)).mode === 'playing');
  // title keys
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await sleep(80);
  await P.evaluate(() => document.activeElement && document.activeElement.blur());
  await P.keyboard.press('Space'); ok('Space on title (nothing focused) → playing', (await st(P)).mode === 'playing');
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await sleep(80);
  await P.evaluate(() => document.activeElement && document.activeElement.blur());
  await P.keyboard.press('Enter'); await frames(P, 2);
  warn('Enter on title (nothing focused, e.g. after clicking the background) → playing', (await st(P)).mode === 'playing');
  if ((await st(P)).mode !== 'playing') await P.click('#btnPlay');
  // M and F11
  const m0 = (await st(P)).muted, icon0 = await P.evaluate(() => document.getElementById('btnMuteHud').innerHTML);
  await P.keyboard.press('m'); const m1 = (await st(P)).muted, icon1 = await P.evaluate(() => document.getElementById('btnMuteHud').innerHTML);
  ok('M toggles sound (state + HUD icon)', m1 !== m0 && icon1 !== icon0, { m0, m1 });
  await P.keyboard.press('m'); ok('M toggles back', (await st(P)).muted === m0);
  await P.keyboard.press('F11'); await sleep(400);
  const fs1 = await P.evaluate(() => ({ g: FH.Game.fullscreen, doc: !!document.fullscreenElement, mode: FH.Game.mode }));
  ok('F11 → Game.fullscreen on', fs1.g, fs1);
  warn('F11 → document is full screen', fs1.doc, fs1);
  await P.keyboard.press('F11'); await sleep(400);
  const fs2 = await P.evaluate(() => ({ g: FH.Game.fullscreen, doc: !!document.fullscreenElement }));
  ok('F11 again → leaves full screen', !fs2.g && !fs2.doc, fs2);
  ok('zero console errors in the menus walk', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.keys = async () => {
  const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy');
  await P.evaluate(CALM);
  await waitFor(P, () => FH.Game.world.hero.started && FH.Game.world.time > 1);   // Clover sits still for startDelay 0.6 s
  await P.evaluate(() => FH.Game.world.setX(9));
  const dir = async () => { await frames(P, 2); return (await st(P)).dir; };
  await P.keyboard.down('ArrowLeft'); ok('hold ← → steer −1', (await dir()) === -1);
  await sleep(350); ok('holding ← accelerates Clover left', (await st(P)).vx < -3, (await st(P)).vx);
  await P.keyboard.up('ArrowLeft'); ok('release ← → 0', (await dir()) === 0);
  await P.keyboard.down('ArrowRight'); ok('hold → → +1', (await dir()) === 1); await P.keyboard.up('ArrowRight'); ok('release → → 0', (await dir()) === 0);
  await P.keyboard.down('a'); ok('hold A → −1', (await dir()) === -1); await P.keyboard.up('a'); ok('release A → 0', (await dir()) === 0);
  await P.keyboard.down('d'); ok('hold D → +1', (await dir()) === 1); await P.keyboard.up('d'); ok('release D → 0', (await dir()) === 0);
  await P.keyboard.down('ArrowLeft'); await P.keyboard.down('ArrowRight');
  ok('hold ← then → : latest (→) wins', (await dir()) === 1);
  await P.keyboard.up('ArrowRight'); ok('release → while ← still held → falls back to −1', (await dir()) === -1);
  await P.keyboard.up('ArrowLeft'); ok('release both → 0', (await dir()) === 0);
  await P.keyboard.down('ArrowRight'); await P.keyboard.down('d'); await P.keyboard.up('ArrowRight');
  ok('→ and D held, release → → still +1', (await dir()) === 1); await P.keyboard.up('d'); ok('… release D → 0', (await dir()) === 0);
  await P.keyboard.down('a'); await P.keyboard.down('ArrowRight'); await P.keyboard.up('a');
  ok('A then →, release A → +1', (await dir()) === 1); await P.keyboard.up('ArrowRight');
  // pause clears and ignores input
  await P.keyboard.down('ArrowLeft'); await frames(P, 2);
  await P.keyboard.press('Escape'); ok('pause while holding ← clears the steer', (await dir()) === 0);
  await P.keyboard.down('ArrowRight'); ok('keys ignored while paused', (await dir()) === 0);
  await P.keyboard.up('ArrowRight'); await P.keyboard.up('ArrowLeft');
  await P.keyboard.press('Escape'); ok('after resume: no stuck steer', (await dir()) === 0 && (await st(P)).mode === 'playing');
  // blur / visibility
  await P.keyboard.down('ArrowRight'); await frames(P, 2);
  await P.evaluate(() => window.dispatchEvent(new Event('blur')));
  let s = await st(P); ok('window blur → pause + input cleared', s.mode === 'paused' && s.dir === 0, s);
  await P.keyboard.up('ArrowRight'); await P.keyboard.press('Escape');
  await P.keyboard.down('ArrowLeft'); await frames(P, 2);
  await P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await st(P); ok('tab hidden → pause + input cleared', s.mode === 'paused' && s.dir === 0, s);
  await P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await P.keyboard.up('ArrowLeft'); await P.keyboard.press('Escape');
  // holding a key across pause → resume: does the held key steer again?
  await P.keyboard.down('ArrowRight'); await frames(P, 2); await P.keyboard.press('Escape'); await P.keyboard.press('Escape');
  for (let i = 0; i < 5; i++) await P.keyboard.down('ArrowRight');  // auto-repeat keydowns (repeat: true) while still held
  warn('a key still held after Resume steers again (auto-repeat keydowns are ignored → kid must re-press)', (await dir()) === 1);
  await P.keyboard.up('ArrowRight');
  // game over ignores input
  await toOver(P); await P.keyboard.down('ArrowLeft');
  ok('keys ignored on game over', (await dir()) === 0); await P.keyboard.up('ArrowLeft');
  // the bot owns the steer: player keys ignored
  await afterLock(P); await P.keyboard.press('Enter'); await P.evaluate(() => FH.debug.setBot(true, 1));
  const dirs = []; await P.keyboard.down('ArrowLeft');
  for (let i = 0; i < 6; i++) { await frames(P, 2); dirs.push((await st(P)).dir); }
  await P.keyboard.up('ArrowLeft'); await P.evaluate(() => FH.debug.setBot(false));
  ok('while the bot plays, held keys do not override it (not stuck at −1)', dirs.some(d => d !== -1), dirs);
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.pointer = async () => {
  // ---- mouse
  {
    const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy');
    await P.evaluate(CALM);
    const r = await canvasRect(P), y = r.y + r.h * 0.6, L = r.x + r.w * 0.25, Rx = r.x + r.w * 0.75;
    const dir = async () => { await frames(P, 2); return (await st(P)).dir; };
    await P.mouse.move(L, y); await P.mouse.down(); ok('mouse hold left half → −1', (await dir()) === -1);
    await P.mouse.move(r.x + r.w * 0.55, y, { steps: 4 }); ok('slide across the middle → +1', (await dir()) === 1);
    await P.mouse.move(r.x + r.w * 0.4, y, { steps: 4 }); ok('slide back → −1', (await dir()) === -1);
    await P.mouse.up(); ok('mouse up → 0', (await dir()) === 0);
    await P.mouse.move(Rx, y); await P.mouse.down(); ok('mouse hold right half → +1', (await dir()) === 1);
    await P.mouse.up(); ok('release → 0', (await dir()) === 0);
    await P.mouse.down({ button: 'right' }); ok('right button does not steer', (await dir()) === 0); await P.mouse.up({ button: 'right' });
    await P.keyboard.down('ArrowLeft'); await P.mouse.move(Rx, y); await P.mouse.down();
    ok('key ← held + mouse on the right: latest (mouse) wins', (await dir()) === 1);
    await P.mouse.up(); ok('mouse released → falls back to held ←', (await dir()) === -1); await P.keyboard.up('ArrowLeft');
    const mb = await P.evaluate(() => { const b = document.getElementById('btnMuteHud').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    const m0 = (await st(P)).muted;
    await P.mouse.move(mb.x, mb.y); await P.mouse.down(); const dd = await dir(); await P.mouse.up();
    let s = await st(P); ok('HUD mute button (mouse): no steer, still playing, toggles sound', dd === 0 && s.dir === 0 && s.mode === 'playing' && s.muted !== m0, { dd, s });
    const pb = await P.evaluate(() => { const b = document.getElementById('btnPause').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await P.mouse.move(pb.x, pb.y); await P.mouse.down(); const dp = await dir(); await P.mouse.up(); s = await st(P);
    ok('HUD pause button (mouse): no steer → paused', dp === 0 && s.mode === 'paused' && s.dir === 0, { dp, s });
    await P.mouse.move(L, y); await P.mouse.down(); ok('pointer on the pause panel does not steer', (await dir()) === 0); await P.mouse.up();
    await P.keyboard.press('Escape');
    await toOver(P); await P.mouse.move(r.x + r.w * 0.1, r.y + r.h * 0.1); await P.mouse.down();
    ok('pointer ignored on game over', (await dir()) === 0); await P.mouse.up();
    ok('zero console errors (mouse)', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
  // ---- touch (CDP multi-touch)
  {
    const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy', { w: 820, h: 1180, dpr: 2, touch: true });
    const cdp = await ctx.newCDPSession(P);
    await P.evaluate(CALM);
    // CDP: touchStart/touchMove list every finger that is down; touchEnd lists the fingers being LIFTED ([] = all)
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p[0], y: p[1], id: p[2] })) });
    const r = await canvasRect(P), y = r.y + r.h * 0.6, A = [r.x + r.w * 0.2, y, 1], B = [r.x + r.w * 0.8, y + 30, 2];
    const dir = async () => { await frames(P, 2); return (await st(P)).dir; };
    ok('touch device detected (body.touch, isTouch)', await P.evaluate(() => FH.Game.isTouch && document.body.classList.contains('touch')));
    await T('touchStart', [A]); ok('touch hold left → −1', (await dir()) === -1);
    await T('touchStart', [A, B]); ok('second finger on the right → latest wins (+1)', (await dir()) === 1);
    await T('touchEnd', [B]); ok('lift the right finger → falls back to the left one (−1)', (await dir()) === -1);
    await T('touchEnd', []); ok('lift all → 0', (await dir()) === 0);
    await T('touchStart', [A]); await T('touchStart', [A, B]); await T('touchEnd', [A]);
    ok('lift the OLDER (left) finger → right one stays (+1)', (await dir()) === 1);
    await T('touchEnd', []); ok('… then 0', (await dir()) === 0);
    await T('touchStart', [A]); await T('touchMove', [[r.x + r.w * 0.45, y, 1]]); await T('touchMove', [[r.x + r.w * 0.7, y, 1]]);
    ok('slide a finger across the middle → +1', (await dir()) === 1);
    await T('touchMove', [[r.x + r.w * 0.3, y, 1]]); ok('slide back → −1', (await dir()) === -1);
    await T('touchEnd', []); ok('lift → 0', (await dir()) === 0);
    const btn = id => P.evaluate(id => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, 3]; }, id);
    const mb = await btn('btnMuteHud'), m0 = (await st(P)).muted;
    await T('touchStart', [A]); await frames(P, 2); await T('touchStart', [A, mb]); const dm = await dir(); await T('touchEnd', [mb]); await frames(P, 3);
    let s = await st(P);
    ok('holding left + tapping Mute with another finger: steer stays −1, sound toggles, still playing', dm === -1 && s.dir === -1 && s.muted !== m0 && s.mode === 'playing', { dm, s });
    await T('touchEnd', []); await frames(P, 2);
    const pb = await btn('btnPause');
    await T('touchStart', [A]); await frames(P, 2); await T('touchStart', [A, pb]); await T('touchEnd', [pb]); await frames(P, 3);
    s = await st(P); ok('holding left + tapping Pause with another finger → paused, steer cleared', s.mode === 'paused' && s.dir === 0, s);
    await T('touchEnd', []); await frames(P, 2);
    await T('touchStart', [A]); ok('touch on the pause panel does not steer', (await dir()) === 0); await T('touchEnd', []);
    const rb = await btn('btnResume'); await T('touchStart', [rb]); await T('touchEnd', []); await frames(P, 3);
    ok('tap Resume (touch) → playing', (await st(P)).mode === 'playing');
    await sleep(700);
    ok('no ghost click after the Resume tap (still playing)', (await st(P)).mode === 'playing');
    await toOver(P); await T('touchStart', [A]); ok('touch ignored on game over', (await dir()) === 0); await T('touchEnd', []);
    await afterLock(P); const ab = await btn('btnAgain'); await T('touchStart', [ab]); await T('touchEnd', []); await frames(P, 3);
    ok('tap Play Again (touch) → playing, started once', await P.evaluate(() => FH.Game.mode === 'playing'));
    // ghost-click: tapping Settings on the title must not also hit what is under the finger on the new screen
    await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await sleep(200);
    const sb = await btn('btnHow'); await T('touchStart', [sb]); await T('touchEnd', []); await sleep(700);
    ok('tap How to Play (touch) opens it and no ghost click closes it', await P.evaluate(() => FH.UI.current === 'scrHow'));
    ok('zero console errors (touch)', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
};

groups.rules = async () => {
  const { ctx, page: P, errors } = await open('seed=4&mute=1&autostart=1&diff=easy');
  await P.evaluate(CALM);
  await waitFor(P, () => FH.Game.world.stats.bounces >= 3, null, 5000);
  const C = await P.evaluate(() => { const c = FH.World.CONFIG; return { bounceV: c.bounceV, springK: c.springK, rescueK: c.rescueK, g: c.g }; });
  let ev = await P.evaluate(() => window._ev.filter(e => e.type === 'bounce'));
  const badB = ev.filter(e => { const k = e.kind === 'rescue' ? C.rescueK : e.spring ? C.springK : 1, v = C.bounceV * k; return !(e.hvy <= v + 1e-6 && e.hvy > v - 0.6 && e.hy >= e.py - 1e-6 && e.hy < e.py + 0.35); });
  ok('bounce happens on landing (vy = bounceV, feet on the top surface)', ev.length >= 2 && badB.length === 0, { n: ev.length, bad: badB.slice(0, 2) });
  // one-way: rise through a plank placed above her, then land on it
  const ow = await P.evaluate(async () => {
    const G = FH.Game, w = G.world, h = w.hero;
    await new Promise(r => { const f = () => (h.vy > 10 ? r() : requestAnimationFrame(f)); f(); });
    w.setX(6); h.vx = 0;
    w.platforms = w.platforms.filter(p => p.kind === 'ground' || Math.abs(p.x - 6) > 3 || p.y < h.y - 0.1 || p.y > h.y + 4);
    const p = w.spawn('plank', 6, h.y + 1.5, { w: 2 }); const y0 = h.y; window._ev.length = 0;
    let maxY = y0, belowWhileRising = false;
    await new Promise(r => { const t0 = performance.now(); const f = () => { maxY = Math.max(maxY, h.y); if (h.vy > 0 && h.y > p.y + 0.05 && maxY < p.y + 2) belowWhileRising = true;
      if (window._ev.some(e => e.type === 'bounce' && e.pid === p.id) || performance.now() - t0 > 2500) r(); else requestAnimationFrame(f); }; f(); });
    const firstBounce = window._ev.find(e => e.type === 'bounce');
    return { py: p.y, y0, maxY, passed: maxY > p.y + 0.5, landed: !!(firstBounce && firstBounce.pid === p.id) };
  });
  ok('one-way platform: Clover rises through it from below', ow.passed, ow);
  ok('… and lands on it from above', ow.landed, ow);
  // firefly
  const ff = await P.evaluate(async () => {
    const w = FH.Game.world, h = w.hero, s0 = w.score, f0 = w.fireflyCount, l0 = w.lantern; window._ev.length = 0;
    w.spawn('firefly', h.x, h.y + 0.55);
    await new Promise(r => setTimeout(r, 150));
    const e = window._ev.find(e => e.type === 'firefly');
    return { ds: w.score - s0, df: w.fireflyCount - f0, dl: w.lantern - l0, ev: !!e };
  });
  ok('catching a firefly: +10 points, +1 count, +1 lantern, event', ff.ev && ff.df === 1 && ff.dl === 1 && ff.ds >= 10 && ff.ds < 14, ff);
  const lan = await P.evaluate(async () => {
    const w = FH.Game.world, h = w.hero; w.lantern = 19; w.hearts = w.maxHearts - 1; const h0 = w.hearts, l0 = w.stats.lanterns; window._ev.length = 0;
    w.spawn('firefly', h.x, h.y + 0.55);
    await new Promise(r => setTimeout(r, 150));
    return { hearts: w.hearts, h0, lantern: w.lantern, lanterns: w.stats.lanterns - l0, evL: window._ev.some(e => e.type === 'lantern'), evH: window._ev.some(e => e.type === 'heartGain') };
  });
  ok('20th firefly fills the lantern → +1 heart, lantern resets', lan.hearts === lan.h0 + 1 && lan.lantern === 0 && lan.lanterns === 1 && lan.evL && lan.evH, lan);
  const lanMax = await P.evaluate(async () => { const w = FH.Game.world, h = w.hero; w.lantern = 19; w.hearts = w.maxHearts; w.spawn('firefly', h.x, h.y + 0.55);
    await new Promise(r => setTimeout(r, 150)); return { hearts: w.hearts, max: w.maxHearts, lantern: w.lantern }; });
  ok('full lantern at max hearts: hearts stay at max', lanMax.hearts === lanMax.max && lanMax.lantern === 0, lanMax);
  // fall → heart lost → trampoline rescue
  await P.evaluate(CALM);
  const fall = await P.evaluate(async () => {
    const w = FH.Game.world, h = w.hero; w.hearts = 3; window._ev.length = 0;
    h.started = true; h.rescueT = 0; h.y = h.prevY = w.camY - 3; h.vy = -5;
    await new Promise(r => setTimeout(r, 60));
    const resc = w.platforms.find(p => p.kind === 'rescue'), camAt = w.camY;
    let back = false; const t0 = performance.now();
    await new Promise(r => { const f = () => { if (h.y > w.camY + 1) back = true; if (back || performance.now() - t0 > 2000) r(); else requestAnimationFrame(f); }; f(); });
    return { hearts: w.hearts, fallEv: window._ev.some(e => e.type === 'fall'), rescueEv: window._ev.some(e => e.type === 'rescue'), resc: !!resc, back, camAt };
  });
  ok('falling off the bottom costs one heart (fall event)', fall.hearts === 2 && fall.fallEv, fall);
  ok('a trampoline appears and throws Clover back on screen', fall.resc && fall.rescueEv && fall.back, fall);
  // game over at 0 hearts
  const sc = await P.evaluate(() => FH.Game.world.score);
  await P.evaluate(FORCE_FALL, 1);
  await sleep(80);
  ok('last heart lost → world phase over + gameOver event', await P.evaluate(() => FH.Game.world.phase === 'over' && window._ev.some(e => e.type === 'gameOver')));
  ok('→ game over screen after the fall animation', await waitFor(P, () => FH.Game.mode === 'over' && FH.UI.current === 'scrOver', null, 4000));
  ok('game over screen shows the run score', await P.evaluate(() => document.getElementById('overScore').textContent === String(FH.Game.world.score)), sc);
  // height score identity with the bot
  await afterLock(P);
  await P.evaluate(() => { window._ev.length = 0; FH.debug.startGame(); FH.debug.setBot(true, 1); FH.debug.setSpeed(8); });
  await sleep(6000);
  const id = await P.evaluate(() => { FH.debug.setSpeed(1); const w = FH.Game.world; const bonus = window._ev.filter(e => e.type === 'levelUp').reduce((a, e) => a + (e.bonus || 0), 0);
    return { score: w.score, maxY: w.maxY, ff: w.fireflyCount, bonus, expect: Math.floor(w.maxY) + 10 * w.fireflyCount + bonus }; });
  ok('score = metres climbed + 10 × fireflies + level bonuses', id.score === id.expect && id.maxY > 20, id);
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.levels = async () => {
  const { ctx, page: P, errors } = await open('seed=2&mute=1&autostart=1&diff=easy&bot=1&skill=1&speed=16');
  const okRun = await waitFor(P, () => FH.Game.world.level >= 5, null, 120000);
  ok('bot climbs through all 4 weather levels and into the loop (level ≥ 5)', okRun, await st(P));
  const ev = await P.evaluate(() => window._ev.filter(e => e.type === 'levelUp'));
  const zones = ev.map(e => e.zone);
  ok('levelUp events for zones 1,2,3,0(loop),1', JSON.stringify(zones.slice(0, 5)) === '[1,2,3,0,1]', zones);
  for (const e of ev.slice(0, 5)) {
    const tag = 'level ' + (e.level + 1) + ' (zone ' + e.zone + ', loop ' + e.wloop + ')';
    ok(tag + ': visuals, banner, weather, music switch to the new level', e.vis === e.zone && e.banner && e.banner.s === e.zone && e.banner.level === e.level && e.wz === e.zone && e.az === e.zone && e.aloop === e.wloop, e);
  }
  const prevZ = [0, 1, 2, 3, 0];
  const bon = ev.slice(0, 5).map((e, i) => ({ got: e.bonus, want: 100 * (prevZ[i] + 1) * (i >= 4 ? 2 : 1) }));
  ok('level bonus = 100 × (finished zone + 1) × (loop + 1)', bon.every(b => b.got === b.want), bon);
  const loopE = ev.find(e => e.level === 4);
  ok('loop: level 5 is Sunny again, banner says round 2', loopE && loopE.zone === 0 && loopE.banner.loop === 1, loopE);
  const g = await P.evaluate(() => ({ goal: FH.Game.world.goal, lvl: FH.Game.world.level }));
  ok('loop goal is 10 % longer (115 → 126.5 u)', Math.abs(g.goal - 115 * 1.1) < 1e-6, g);
  const times = ev.slice(0, 5).map((e, i, a) => +(e.t - (i ? a[i - 1].t : 0)).toFixed(1));
  console.log('    info: game seconds per level (bot skill 1, Easy): ' + times.join(', '));
  ok('no game over during the bot run', (await P.evaluate(() => FH.Game.stats.games)) === 0);
  // the crossfade completes and the banner appears in 'playing'
  await P.evaluate(() => FH.debug.setSpeed(1));
  await P.evaluate(() => { window._drawn = {}; FH.debug.gotoLevel(3); });
  await sleep(1700);
  const v = await P.evaluate(() => ({ vis: FH.Game.renderer.vis, wz: FH.Game.weather.zone, az: FH.Audio.zone, banner: FH.Game.renderer.banner }));
  ok('gotoLevel(3): Snowy Rooftops visuals finished crossfading, weather + music on snow', v.vis.cur === 3 && v.vis.t === 1 && v.wz === 3 && v.az === 3, v);
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.wind = async () => {
  const { ctx, page: P, errors } = await open('seed=9&mute=1&autostart=1&diff=normal&level=2');
  // keep Clover hopping on the farmyard ground (full width) so the wind is the only sideways force
  await P.evaluate(() => { const w = FH.Game.world; w._gen.top = 1e12; w.platforms = w.platforms.filter(p => p.kind === 'ground'); w.fireflies.length = 0; w.setX(6); w.hero.vx = 0; });
  await P.evaluate(CALM);
  await sleep(300);
  await P.evaluate(() => { window._drawn = {}; });
  await sleep(300);
  ok('calm: no weather vane in the HUD', !(await P.evaluate(() => window._drawn.vane)));
  for (const d of [1, -1]) {
    await P.evaluate(() => { FH.Game.world.setX(6); FH.Game.world.hero.vx = 0; window._ev.length = 0; window._drawn = {}; });
    await P.evaluate(d => FH.debug.gust(d), d);
    let s = await st(P);
    ok('gust(' + d + '): warning starts with that direction', s.wind === 'warn' && s.wdir === d, s);
    await sleep(500);
    ok('warning: vane shown in the HUD, hero not pushed yet', await P.evaluate(() => window._drawn.vane > 5 && Math.abs(FH.Game.world.hero.x - 6) < 0.05), await P.evaluate(() => ({ v: window._drawn.vane, x: FH.Game.world.hero.x })));
    const blew = await waitFor(P, () => FH.Game.world.wind.state === 'blow', null, 3000);
    ok('warn → blow after warnT', blew);
    const x0 = (await st(P)).x;
    await sleep(1200);
    s = await st(P);
    const wx = await P.evaluate(() => ({ dir: FH.Game.weather.windDir, str: FH.Game.weather.windStr }));
    ok('blow pushes Clover in the wind direction (no input)', (s.x - x0) * d > 0.4 && s.dir === 0, { x0, x: s.x, d });
    ok('weather particles get the wind (dir + strength)', wx.dir === d && wx.str > 0.3, wx);
    ok('vane still shown while blowing', await P.evaluate(() => window._drawn.vane > 20));
    const calm = await waitFor(P, () => FH.Game.world.wind.state === 'calm', null, 6000);
    const evs = await P.evaluate(() => window._ev.map(e => e.type).filter(t => /^wind/.test(t)));
    ok('blow → calm, events windWarn → windStart → windEnd', calm && evs.join() === 'windWarn,windStart,windEnd', evs);
    await P.evaluate(() => { window._drawn = {}; }); await sleep(300);
    ok('vane hidden again when calm', !(await P.evaluate(() => window._drawn.vane)));
  }
  // natural cycle with the Windy Hill timings
  await P.evaluate(() => { const W = FH.Game.world.wind; W.next = 0.3; window._ev.length = 0; });
  ok('natural gust cycle runs (warn → blow → calm) and schedules the next one', await waitFor(P, () => window._ev.filter(e => e.type === 'windEnd').length >= 1 && FH.Game.world.wind.next > 4, null, 9000));
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.settings = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: P, errors } = await open('seed=1', { ctx });
  const ls = () => P.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  ok('first run: nothing saved yet, defaults sfx/music on, Easy', await P.evaluate(() => !localStorage.getItem('cfh:settings') && FH.Game.settings.sfx && FH.Game.settings.music && FH.Game.difficulty() === 'easy'));
  await P.click('#btnSettings');
  await P.click('#setSfx + .tog'); await P.click('#setMusic + .tog'); await P.click('#setDifficulty [data-v=hard]');
  let s = await P.evaluate(() => FH.Game.settings);
  ok('toggling sfx / music / Hard updates the settings', !s.sfx && !s.music && s.difficulty === 'hard', s);
  await P.reload(); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  s = await P.evaluate(() => ({ st: FH.Game.settings, sfx: document.getElementById('setSfx').checked, mus: document.getElementById('setMusic').checked,
    seg: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, a: { sfx: FH.Audio.sfxOn, mus: FH.Audio.musicOn } }));
  ok('settings survive a reload (state, toggles, segment, audio)', !s.st.sfx && !s.st.music && s.st.difficulty === 'hard' && !s.sfx && !s.mus && s.seg === 'hard' && !s.a.sfx && !s.a.mus, s);
  await P.click('#btnSettings'); await P.click('#setSfx + .tog'); await P.click('#setMusic + .tog'); await P.click('#setDifficulty [data-v=easy]'); await P.click('#scrSettings .btn-back');
  // ?mute=1 never saved
  await P.goto(GAME + '?seed=1&mute=1'); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  ok('?mute=1: audio muted but settings.muted stays false', await P.evaluate(() => FH.Audio.muted && !FH.Game.settings.muted && !JSON.parse(localStorage.getItem('cfh:settings')).muted));
  await P.keyboard.press('m');
  ok('M with ?mute=1 → sound on, nothing saved', await P.evaluate(() => !FH.Audio.muted && !JSON.parse(localStorage.getItem('cfh:settings')).muted));
  await P.keyboard.press('m');
  ok('M again → muted and that IS saved (player choice)', await P.evaluate(() => FH.Audio.muted && JSON.parse(localStorage.getItem('cfh:settings')).muted === true));
  await P.goto(GAME + '?seed=1'); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  ok('saved mute survives reload without the flag', await P.evaluate(() => FH.Audio.muted && FH.Game.settings.muted));
  await P.keyboard.press('m');
  ok('M → unmuted, saved', await P.evaluate(() => !FH.Audio.muted && JSON.parse(localStorage.getItem('cfh:settings')).muted === false));
  // ?diff never saved
  await P.goto(GAME + '?seed=1&diff=hard'); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  await P.click('#btnSettings'); await P.click('#scrSettings .btn-back'); await P.click('#btnPlay');
  ok('?diff=hard: the run is Hard, saved difficulty stays easy', await P.evaluate(() => FH.Game.world.difficulty === 'hard' && JSON.parse(localStorage.getItem('cfh:settings')).difficulty === 'easy'));
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await P.click('#btnSettings'); await P.click('#setDifficulty [data-v=normal]');
  const segSt = await P.evaluate(() => ({ on: document.querySelector('#setDifficulty .on').dataset.v, saved: JSON.parse(localStorage.getItem('cfh:settings')).difficulty }));
  warn('with ?diff=hard, tapping Normal visibly selects Normal', segSt.on === 'normal', segSt);
  await P.click('#setDifficulty [data-v=easy]'); await P.click('#scrSettings .btn-back');
  // best score per difficulty
  await P.goto(GAME + '?seed=1&mute=1'); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  const run = async score => { await P.click('#btnPlay'); await P.evaluate(s => { FH.Game.world.score = s; }, score); await toOver(P); await afterLock(P);
    return P.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') })); };
  let o = await run(321);
  ok('Easy run 321 → best 321, NEW! shown', o.best === '321' && o.nb && (await P.evaluate(() => localStorage.getItem('cfh:best_easy'))) === '321', o);
  await P.click('#btnOverMenu'); ok('title shows Easy best 321', (await P.textContent('#bestTitle')) === '321');
  o = await run(100);
  ok('lower Easy run → best stays 321, no NEW!', o.best === '321' && !o.nb, o);
  await P.click('#btnOverMenu'); await P.click('#btnSettings'); await P.click('#setDifficulty [data-v=normal]'); await P.click('#scrSettings .btn-back');
  ok('switch to Normal → title best 0 (separate per difficulty)', (await P.textContent('#bestTitle')) === '0');
  o = await run(55); await P.click('#btnOverMenu');
  ok('Normal run 55 → best_normal 55, best_easy untouched', await P.evaluate(() => localStorage.getItem('cfh:best_normal') === '55' && localStorage.getItem('cfh:best_easy') === '321'));
  await P.reload(); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  ok('after reload: title shows Normal best 55', (await P.textContent('#bestTitle')) === '55');
  // reset best: needs two taps
  await P.click('#btnSettings'); await P.click('#btnResetBest');
  ok('Reset best: first tap only arms it ("Sure?"), nothing deleted', await P.evaluate(() => document.getElementById('btnResetBest').textContent === 'Sure?' && localStorage.getItem('cfh:best_easy') === '321'));
  await sleep(3300);
  ok('… disarms itself after 3 s', await P.evaluate(() => document.getElementById('btnResetBest').textContent === 'Reset'));
  await P.click('#btnResetBest'); await P.click('#btnResetBest');
  ok('two taps → all best scores cleared', await P.evaluate(() => !localStorage.getItem('cfh:best_easy') && !localStorage.getItem('cfh:best_normal')));
  await P.click('#scrSettings .btn-back'); ok('title best back to 0', (await P.textContent('#bestTitle')) === '0');
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
  // bot / autostart flags write the player's best score?
  const b = await open('seed=3&mute=1&autostart=1&bot=1&skill=0.2&speed=16&diff=hard');
  await waitFor(b.page, () => FH.Game.mode === 'over', null, 60000);
  const pol = await b.page.evaluate(() => localStorage.getItem('cfh:best_hard'));
  warn('a ?bot=1 test run does not write the player\'s best score', pol === null, 'best_hard=' + pol);
  await b.ctx.close();
};

// ---------------- customisation ----------------
async function makeFixtures() {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.setContent('<canvas id=c></canvas>');
  const mk = async (name, w, h, type, kind, col, q) => {
    const b64 = await p.evaluate(async ({ w, h, type, kind, col, q }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (kind === 'cutout') { g.clearRect(0, 0, w, h); g.fillStyle = col; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(w * 0.4, h * 0.35, w * 0.08, w * 0.08); }
      else if (kind === 'photo') {   // a photo-like picture: solid colour + noisy texture (JPEG-unfriendly, like a real photo)
        g.fillStyle = col; g.fillRect(0, 0, w, h);
        const id = g.getImageData(0, 0, w, h), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 50; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(id, 0, 0);
      } else { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, col); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      const blob = await new Promise(r => c.toBlob(r, type, q || 0.9));
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, { w, h, type, kind, col, q });
    fs.writeFileSync(path.join(FIX, name), Buffer.from(b64, 'base64'));
  };
  await mk('hero_cutout.png', 600, 600, 'image/png', 'cutout', '#e0342b');
  await mk('hero_photo_red.jpg', 900, 900, 'image/jpeg', 'photo', '#e0342b');
  await mk('hero_photo_blue.jpg', 900, 900, 'image/jpeg', 'photo', '#2b55e0');
  await mk('firefly.png', 256, 256, 'image/png', 'cutout', '#20c040');
  await mk('bg_sunny.jpg', 2400, 1600, 'image/jpeg', 'photo', '#d02090');
  await mk('bg_wind.jpg', 1200, 1800, 'image/jpeg', 'photo', '#20a0a0');
  await mk('bg_snow.jpg', 1920, 1080, 'image/jpeg', 'photo', '#806020');
  await mk('huge.jpg', 6000, 4000, 'image/jpeg', 'grad', '#3060ff', 0.8);
  fs.writeFileSync(path.join(FIX, 'notes.txt'), 'this is not a picture\n');
  fs.writeFileSync(path.join(FIX, 'broken.png'), Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 37) & 255)));
  await ctx.close();
}

groups.custom = async () => {
  await makeFixtures();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: P, errors } = await open('seed=1&mute=1', { ctx });
  const SL = await P.evaluate(() => FH.Assets.SLOTS.map(s => s.id));
  const idx = id => SL.indexOf(id) + 1;
  await P.click('#btnCustomize');
  const pick = async (slot, file) => {
    await P.evaluate(() => { document.getElementById('toast').textContent = ''; });
    const [fc] = await Promise.all([P.waitForEvent('filechooser', { timeout: 5000 }), P.click(`#slotGrid .slot:nth-child(${idx(slot)}) [data-act=pick]`)]);
    await fc.setFiles(path.join(FIX, file));
    await P.waitForFunction(() => { const t = document.getElementById('toast').textContent; return t && !/Saving/.test(t); }, null, { timeout: 15000 });
    return P.evaluate(() => document.getElementById('toast').textContent);
  };
  const card = slot => P.evaluate(i => { const el = document.querySelector('#slotGrid .slot:nth-child(' + i + ')'); return { tag: el.querySelector('.tag').textContent, reset: !el.querySelector('[data-act=reset]').disabled }; }, idx(slot));
  const thumbColor = slot => P.evaluate(async i => {
    const im = document.querySelector('#slotGrid .slot:nth-child(' + i + ') .prev img'); if (!im) return null;
    if (!im.complete) await new Promise(r => { im.onload = r; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [d[0], d[1], d[2]];
  }, idx(slot));
  const t1 = Date.now();
  let msg = await pick('hero', 'hero_cutout.png');
  ok('hero: a PNG cut-out is accepted (toast, card tag, Reset enabled, stored)', /saved/i.test(msg) && (await card('hero')).tag.includes('Your picture') && (await card('hero')).reset && await P.evaluate(() => !!localStorage.getItem('cfh:img_hero') && FH.Assets.hasCustom('hero')), msg);
  ok('cut-out with transparency defaults to "Whole picture"', await P.evaluate(() => localStorage.getItem('cfh:shape_hero') === 'fit'));
  msg = await pick('hero', 'hero_photo_red.jpg');
  ok('hero: an opaque photo is accepted and defaults to "Round"', /saved/i.test(msg) && await P.evaluate(() => localStorage.getItem('cfh:shape_hero') === 'circle'), msg);
  const cRed = await thumbColor('hero');
  msg = await pick('hero', 'hero_photo_blue.jpg');
  const cBlue = await thumbColor('hero');
  ok('replacing a photo with another photo updates the card preview (red → blue)', cBlue && cBlue[2] > cBlue[0] + 60, { cRed, cBlue });
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-shape=fit]`);
  ok('"Whole picture" shape button saves the shape', await P.evaluate(() => localStorage.getItem('cfh:shape_hero') === 'fit' && FH.Assets.custom.hero.width === 512));
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-shape=circle]`);
  ok('"Round" shape button saves the shape', await P.evaluate(() => localStorage.getItem('cfh:shape_hero') === 'circle'));
  msg = await pick('firefly', 'firefly.png');
  ok('firefly picture accepted', /saved/i.test(msg) && await P.evaluate(() => FH.Assets.hasCustom('firefly')), msg);
  msg = await pick('bg_sunny', 'bg_sunny.jpg');
  ok('Sunny background (2400×1600 photo) accepted, stored ≤ 1600 px', /saved/i.test(msg) && await P.evaluate(() => FH.Assets.hasCustom('bg_sunny') && Math.max(FH.Assets.custom.bg_sunny.width, FH.Assets.custom.bg_sunny.height) <= 1600), msg);
  msg = await pick('bg_rain', 'huge.jpg');
  ok('huge 6000×4000 picture for Rainy accepted and downscaled to ≤ 1600 px', /saved/i.test(msg) && await P.evaluate(() => FH.Assets.hasCustom('bg_rain') && Math.max(FH.Assets.custom.bg_rain.width, FH.Assets.custom.bg_rain.height) <= 1600), msg);
  msg = await pick('bg_wind', 'bg_wind.jpg'); ok('Windy background (portrait photo) accepted', /saved/i.test(msg), msg);
  msg = await pick('bg_snow', 'bg_snow.jpg'); ok('Snowy background accepted', /saved/i.test(msg), msg);
  const tAll = Date.now() - t1;
  const size = await P.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; });
  console.log('    info: 6 custom pictures stored = ' + (size / 1e6).toFixed(2) + ' M chars of localStorage; picking took ' + tAll + ' ms');
  warn('all six pictures fit comfortably in localStorage (< 3.5 M chars of the ~5 M quota)', size < 3.5e6, (size / 1e6).toFixed(2) + ' M');
  msg = await pick('hero', 'huge.jpg');
  ok('huge picture for the hero accepted and fitted into 512 px', /saved/i.test(msg) && await P.evaluate(() => FH.Assets.custom.hero.width <= 512 && FH.Assets.custom.hero.height <= 512), msg);
  msg = await pick('firefly', 'notes.txt');
  ok('a text file is refused with a friendly message, previous picture kept', /picture file/i.test(msg) && await P.evaluate(() => FH.Assets.hasCustom('firefly')), msg);
  msg = await pick('bg_snow', 'broken.png');
  ok('a broken .png is refused with a friendly message', /could not be opened/i.test(msg), msg);
  // drag & drop
  await P.evaluate(async i => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, 64, 64);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'drop.png', { type: 'image/png' }));
    document.querySelector('#slotGrid .slot:nth-child(' + i + ')').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, idx('firefly'));
  ok('drag & drop a picture onto a card works', await waitFor(P, () => /saved/i.test(document.getElementById('toast').textContent), null, 5000));
  // persistence across reload
  await P.reload(); await P.waitForFunction(() => FH.Game && FH.Game.mode === 'title');
  ok('all six custom pictures load again after a reload', await P.evaluate(() => FH.Assets.SLOTS.every(s => FH.Assets.hasCustom(s.id))));
  // in gameplay
  await P.click('#btnPlay'); await P.evaluate(HOOKS);
  await P.evaluate(() => { const w = FH.Game.world; w.spawn('firefly', w.hero.x + 2, w.hero.y + 2); window._drawn = {}; });
  await sleep(800);
  const dr = await P.evaluate(() => ({ hero: window._drawn['custom:hero'] || 0, fly: window._drawn['custom:firefly'] || 0, clover: Object.keys(window._drawn).filter(k => k.startsWith('clover_')).length, bg: FH.Game.renderer._bgKey(0) }));
  ok('custom hero and firefly are drawn in gameplay (default Clover not drawn)', dr.hero > 10 && dr.fly > 0 && dr.clover === 0, dr);
  // climb above the farmyard, then sample the side strip (outside the column) at several heights
  await P.evaluate(() => { FH.debug.setBot(true, 1); FH.debug.setSpeed(6); });
  await waitFor(P, () => FH.Game.world.camY > 14, null, 20000);
  await P.evaluate(() => { FH.debug.setBot(false); FH.debug.setSpeed(1); });
  const px = await P.evaluate(() => { const c = document.getElementById('game'), g = c.getContext('2d');
    return [0.3, 0.4, 0.5, 0.6, 0.7].map(k => { const d = g.getImageData(Math.round(c.width * 0.04), Math.round(c.height * k), 1, 1).data; return [d[0], d[1], d[2]]; }); });
  const mag = px.filter(q => q[0] > q[1] + 50 && q[2] > q[1] + 30).length;
  ok('custom Sunny background (magenta photo) is what the sky shows', dr.bg.endsWith('|1') && mag >= 4, { key: dr.bg, px });
  for (const lv of [1, 2, 3]) {
    await P.evaluate(l => FH.debug.gotoLevel(l), lv); await sleep(1700);
    const k = await P.evaluate(l => FH.Game.renderer._bgKey(l), lv);
    ok('level ' + lv + ' uses its custom background', k.endsWith('|1'), k);
  }
  await P.evaluate(() => { const w = FH.Game.world; w.hearts = 2; w.hero.started = true; w.hero.y = w.hero.prevY = w.camY - 3; w.hero.vy = -5; });
  await sleep(1200);
  ok('custom hero through a fall + rescue: no errors', errors.length === 0, errors.slice(0, 3));
  // reset one / all
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await P.click('#btnCustomize');
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-act=reset]`);
  ok('Reset one: hero back to Clover (memory, storage, card)', await P.evaluate(() => !FH.Assets.hasCustom('hero') && !localStorage.getItem('cfh:img_hero') && !localStorage.getItem('cfh:shape_hero')) && (await card('hero')).tag === 'Original');
  ok('… other pictures kept', await P.evaluate(() => FH.Assets.hasCustom('firefly') && FH.Assets.hasCustom('bg_sunny')));
  msg = await pick('hero', 'hero_photo_red.jpg');
  const cAgain = await thumbColor('hero');
  ok('after Reset, choosing a new photo shows the NEW preview (red, not the old blue)', cAgain && cAgain[0] > cAgain[2] + 60, cAgain);
  await P.click('#btnResetAll');
  ok('Reset all: every slot back to the original, storage cleared', await P.evaluate(() => FH.Assets.SLOTS.every(s => !FH.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => /cfh:(img|shape)_/.test(k))));
  await P.click('#scrCustom .btn-back'); await P.click('#btnPlay'); await P.evaluate(() => { window._drawn = {}; }); await sleep(500);
  ok('after Reset all, gameplay draws the default Clover again', await P.evaluate(() => !window._drawn['custom:hero'] && Object.keys(window._drawn).some(k => k.startsWith('clover_')) && FH.Game.renderer._bgKey(0).endsWith('|0')));
  ok('zero console errors in customisation', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.focus = async () => {
  const { ctx, page: P, errors } = await open('seed=21&mute=1');
  const starts = () => P.evaluate(() => window._starts);
  await sleep(100);
  ok('title focuses Play', await P.evaluate(() => document.activeElement && document.activeElement.id === 'btnPlay'));
  let s0 = await starts(); await P.keyboard.press('Space'); await sleep(250);
  ok('Space with Play focused starts exactly once', (await starts()) - s0 === 1 && (await st(P)).mode === 'playing', (await starts()) - s0);
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await sleep(100);
  s0 = await starts(); await P.keyboard.press('Enter'); await sleep(250);
  ok('Enter with Play focused starts exactly once', (await starts()) - s0 === 1 && (await st(P)).mode === 'playing', (await starts()) - s0);
  // mouse-clicked HUD mute keeps focus; Space / Enter while playing must not toggle it again
  await P.click('#btnMuteHud'); const m1 = (await st(P)).muted;
  await P.keyboard.press('Space'); await P.keyboard.press('Enter'); await sleep(100);
  ok('Space / Enter after clicking the HUD mute button do not toggle it again', (await st(P)).muted === m1 && (await st(P)).mode === 'playing');
  await P.click('#btnPause'); await sleep(80);
  await P.keyboard.press('Space'); await sleep(150);
  ok('Pause → Space resumes (Resume focused) …', (await st(P)).mode === 'playing');
  await P.keyboard.press('Space'); await sleep(150);
  ok('… and the next Space does nothing else (still playing, not paused)', (await st(P)).mode === 'playing');
  // game over: Enter / Space once
  await toOver(P); await afterLock(P);
  ok('game over focuses Play Again', await P.evaluate(() => document.activeElement && document.activeElement.id === 'btnAgain'));
  s0 = await starts(); await P.keyboard.press('Enter'); await sleep(250);
  ok('Enter on game over (Play Again focused) starts exactly once', (await starts()) - s0 === 1, (await starts()) - s0);
  await toOver(P); await afterLock(P);
  s0 = await starts(); await P.keyboard.press('Space'); await sleep(250);
  ok('Space on game over (Play Again focused) starts exactly once', (await starts()) - s0 === 1, (await starts()) - s0);
  await toOver(P); await afterLock(P);
  s0 = await starts(); await P.keyboard.down('Enter'); await sleep(50);
  for (let i = 0; i < 4; i++) await P.keyboard.down('Enter');   // auto-repeat while held
  await P.keyboard.up('Enter'); await sleep(250);
  ok('holding Enter on game over starts once (repeats ignored)', (await starts()) - s0 === 1, (await starts()) - s0);
  // Tab to Menu on game over: Enter goes to the menu, does not restart
  await toOver(P); await afterLock(P); await P.focus('#btnOverMenu');
  s0 = await starts(); await P.keyboard.press('Enter'); await sleep(200);
  ok('Enter with Menu focused → title, no restart', (await starts()) === s0 && (await st(P)).mode === 'title');
  // title: Space with Settings focused opens Settings only
  await P.focus('#btnSettings'); s0 = await starts(); await P.keyboard.press('Space'); await sleep(200);
  ok('Space with Settings focused opens Settings, does not start', (await starts()) === s0 && (await P.evaluate(() => FH.UI.current)) === 'scrSettings');
  await P.keyboard.press('Escape');
  // destructive buttons never get the default focus
  await P.click('#btnSettings'); await sleep(80);
  ok('Settings focuses Done, not Reset best', await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('btn-back')));
  await P.keyboard.press('Enter'); await sleep(100);
  ok('Enter on Settings → closes it (no reset)', await P.evaluate(() => FH.UI.current === 'scrTitle' && document.getElementById('btnResetBest').textContent === 'Reset'));
  await P.click('#btnCustomize'); await sleep(80);
  ok('Change Pictures focuses Done (not Reset all / file picker)', await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('btn-back')));
  await P.keyboard.press('Escape');
  // pause during the death animation is refused; Esc can't pause a finished run
  await P.click('#btnPlay'); await P.evaluate(FORCE_FALL, 1); await sleep(100); await P.keyboard.press('Escape');
  ok('Esc during the game-over fall does not open Pause', (await st(P)).mode !== 'paused');
  await waitFor(P, () => FH.Game.mode === 'over'); await P.keyboard.press('Escape');
  ok('Esc on game over does nothing', (await st(P)).mode === 'over');
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.native = async () => {
  const init = () => {
    window.__sets = []; window.__dels = []; window.__fs = []; window.__quit = 0;
    window.__disk = { settings: JSON.stringify({ sfx: false, music: true, muted: false, difficulty: 'normal' }), best_normal: '77' };
    window.ffStoreAll = async () => Object.assign({}, window.__disk);
    window.ffStoreSet = async (k, v) => { window.__sets.push(k); if (/^img_bg/.test(k)) return false; window.__disk[k] = v; return true; };
    window.ffStoreDel = async k => { window.__dels.push(k); delete window.__disk[k]; return true; };
    window.ffFullscreen = async on => { window.__fs.push(on); return on; };
    window.ffQuit = () => { window.__quit++; };
  };
  const { ctx, page: P, errors } = await open('seed=1&mute=1&app=1', { init });
  ok('native store detected and loaded (settings + best from disk)', await P.evaluate(() => FH.Storage.native && FH.Game.settings.difficulty === 'normal' && FH.Game.settings.sfx === false && document.getElementById('bestTitle').textContent === '77'));
  ok('app mode: Quit button visible', await P.evaluate(() => !document.getElementById('btnQuit').classList.contains('hidden')));
  await P.click('#btnSettings'); await P.click('#setMusic + .tog'); await P.click('#scrSettings .btn-back');
  ok('setting change goes to ffStoreSet, not localStorage', await P.evaluate(() => window.__sets.includes('settings') && !localStorage.getItem('cfh:settings')));
  await P.click('#btnCustomize');
  const [fc] = await Promise.all([P.waitForEvent('filechooser'), P.click('#slotGrid .slot:nth-child(3) [data-act=pick]')]);
  if (!fs.existsSync(path.join(FIX, 'bg_sunny.jpg'))) await makeFixtures();
  await fc.setFiles(path.join(FIX, 'bg_sunny.jpg'));
  await P.waitForFunction(() => /room|saved/i.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  ok('ffStoreSet → false: friendly "not enough room" toast, value rolled back, picture not used', await P.evaluate(() => /room/i.test(document.getElementById('toast').textContent) && FH.Storage.get('img_bg_sunny') === undefined && !FH.Assets.hasCustom('bg_sunny')));
  const race = await P.evaluate(async () => {
    const S = FH.Storage, orig = window.ffStoreSet;
    window.ffStoreSet = (k, v) => new Promise(r => setTimeout(() => r(v !== 'old'), v === 'old' ? 120 : 10));
    S.set('race_k', 'base'); await new Promise(r => setTimeout(r, 30));
    const a = S.set('race_k', 'old'), b = S.set('race_k', 'new'); await Promise.all([a, b]);
    const v1 = S.get('race_k');
    window.ffStoreSet = () => Promise.reject(new Error('io'));
    const r2 = await S.set('race_k', 'boom'); const v2 = S.get('race_k');
    window.ffStoreSet = orig; return { v1, r2, v2 };
  });
  ok('set(): an older write failing late does not undo a newer one', race.v1 === 'new', race);
  ok('set(): a rejected bridge call rolls back and resolves false', race.r2 === false && race.v2 === 'new', race);
  const del = await P.evaluate(async () => { window.ffStoreDel = async () => false; FH.Storage.cache.del_k = 'x'; const r = await FH.Storage.del('del_k'); return { r, still: FH.Storage.get('del_k') }; });
  warn('del(): a failed native delete keeps the value in memory (matches disk after restart)', del.still === 'x', del);
  await P.keyboard.press('Escape');
  await P.keyboard.press('F11'); await sleep(200);
  ok('F11 in the app calls ffFullscreen(true)', await P.evaluate(() => window.__fs[0] === true));
  await P.keyboard.press('F11'); await sleep(200);
  ok('… and F11 again ffFullscreen(false)', await P.evaluate(() => window.__fs[1] === false && FH.Game.fullscreen === false), await P.evaluate(() => ({ fs: window.__fs, g: FH.Game.fullscreen })));
  await P.click('#btnQuit'); ok('Quit calls ffQuit', await P.evaluate(() => window.__quit === 1));
  ok('zero console errors (native)', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
  const b = await open('seed=1&mute=1', { init: () => { window.ffStoreAll = () => Promise.reject(new Error('x')); window.ffStoreSet = async () => true; window.ffStoreDel = async () => true; } });
  ok('ffStoreAll failing → falls back to localStorage', await b.page.evaluate(() => FH.Storage.native === false && FH.Game.mode === 'title'));
  await b.ctx.close();
};

groups.layout = async () => {
  const SIZES = [
    { n: 'desktop 1280x720', w: 1280, h: 720, dpr: 1 },
    { n: 'desktop 1920x1080', w: 1920, h: 1080, dpr: 1 },
    { n: 'desktop 1024x768', w: 1024, h: 768, dpr: 1 },
    { n: 'iPad portrait 820x1180', w: 820, h: 1180, dpr: 2, touch: true, safe: [24, 0, 20, 0] },
    { n: 'iPad landscape 1180x820', w: 1180, h: 820, dpr: 2, touch: true, safe: [24, 0, 20, 0] },
    { n: 'iPhone portrait 390x844', w: 390, h: 844, dpr: 3, touch: true, safe: [47, 0, 34, 0] },
    { n: 'iPhone landscape 844x390', w: 844, h: 390, dpr: 3, touch: true, safe: [0, 47, 21, 47] }
  ];
  for (const S of SIZES) {
    console.log('  [' + S.n + ']');
    const { ctx, page: P, errors } = await open('seed=1&mute=1', S);
    const sa = S.safe || [0, 0, 0, 0];
    if (S.safe) {   // headless Chromium has no notch: emulate env(safe-area-inset-*) where the game reads it
      await P.addStyleTag({ content: `#safeProbe{padding:${sa[0]}px ${sa[1]}px ${sa[2]}px ${sa[3]}px !important}.screen{padding:${sa[0]}px ${sa[1]}px ${sa[2]}px ${sa[3]}px !important}
        .panel{max-width:calc(100vw - 16px - ${sa[1] + sa[3]}px)!important;max-height:calc(100dvh - 16px - ${sa[0] + sa[2]}px)!important}` });
      await P.evaluate(() => FH.Game.relayout());
    }
    const cv = await P.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), R = FH.Game.renderer;
      return { x: r.left, y: r.top, w: r.width, h: r.height, VW: R.VW, VH: R.VH, bw: c.width, bh: c.height, px: R.px, s: R.cssScale, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
    const inV = cv.x >= -0.5 && cv.y >= -0.5 && cv.x + cv.w <= S.w + 0.5 && cv.y + cv.h <= S.h + 0.5;
    const centred = Math.abs(cv.x - (S.w - cv.x - cv.w)) <= 1 && Math.abs(cv.y - (S.h - cv.y - cv.h)) <= 1;
    const fills = Math.abs(cv.w - S.w) <= 1 || Math.abs(cv.h - S.h) <= 1;
    ok('canvas letterboxed: inside the window, centred, fills one side, keeps VW:VH', inV && centred && fills && Math.abs(cv.w / cv.h - cv.VW / cv.VH) < 0.01, cv);
    ok('canvas backing store = VW×VH × render scale', cv.bw === Math.round(cv.VW * cv.px) && cv.bh === Math.round(cv.VH * cv.px), cv);
    warn('canvas fills the whole window (no bars)', Math.abs(cv.w - S.w) <= 1 && Math.abs(cv.h - S.h) <= 1, `${cv.w.toFixed(0)}x${cv.h.toFixed(0)} in ${S.w}x${S.h}`);
    ok('no page scroll', cv.sw <= S.w && cv.sh <= S.h, cv);
    const check = async (label, sel) => {
      await sleep(450);
      const m = await P.evaluate(({ sel, sa, W, H }) => {
        const el = document.querySelector(sel); if (!el) return { missing: true };
        const r = el.getBoundingClientRect(), out = [];
        const btns = [...el.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.className || b.textContent.trim().slice(0, 14), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height, ow: b.scrollWidth > b.clientWidth + 1 }; });
        const bad = btns.filter(b => b.l < -0.5 || b.r > W + 0.5 || b.t < -0.5 || b.b > H + 0.5);
        const clipped = btns.filter(b => b.b > r.bottom + 0.5 || b.r > r.right + 0.5 || b.l < r.left - 0.5);
        const slots = [...el.querySelectorAll('.slot')].filter(s => s.scrollWidth > s.clientWidth).length;
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, inV: r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5,
          inSafe: r.left >= sa[3] - 0.5 && r.top >= sa[0] - 0.5 && r.right <= W - sa[1] + 0.5 && r.bottom <= H - sa[2] + 0.5,
          hOver: el.scrollWidth > el.clientWidth + 1, vOver: el.scrollHeight > el.clientHeight + 1, bad: bad.map(b => b.id), clipped: clipped.map(b => b.id),
          small: btns.filter(b => b.h < 39.5).map(b => b.id + ':' + b.h.toFixed(0)), textOver: btns.filter(b => b.ow).map(b => b.id), slots };
      }, { sel, sa, W: S.w, H: S.h });
      ok(label + ': panel inside the window, no sideways overflow, buttons on screen', !m.missing && m.inV && !m.hOver && m.bad.length === 0, m);
      if (m.slots !== undefined && sel.includes('scrCustom')) warn(label + ': picture cards hold their buttons (no card content wider than the card)', !m.slots, m.slots + ' card(s) overflow');
      warn(label + ': panel clear of the notch / home bar', m.inSafe, m);
      warn(label + ': fits without scrolling (every button visible)', !m.vOver && m.clipped.length === 0, { vOver: m.vOver, clipped: m.clipped });
      warn(label + ': button labels fit', m.textOver.length === 0, m.textOver);
      if (S.touch) warn(label + ': touch targets ≥ 40 px tall', m.small.length === 0, m.small);
      return m;
    };
    await check('title', '#scrTitle .title-wrap');
    const tag = S.n.replace(/\W+/g, '_');
    await P.screenshot({ path: path.join(OUT, tag + '_title.png') });
    for (const [scr, sel] of [['scrHow', '#scrHow .panel'], ['scrSettings', '#scrSettings .panel'], ['scrCustom', '#scrCustom .panel']]) {
      await P.evaluate(id => FH.UI.open(id, 'scrTitle'), scr);
      await check(scr, sel);
      await P.screenshot({ path: path.join(OUT, tag + '_' + scr + '.png') });
    }
    await P.evaluate(() => FH.UI.show('scrTitle'));
    await P.evaluate(() => FH.debug.startGame()); await sleep(400);
    const hud = await P.evaluate(({ sa, W, H }) => {
      const R = FH.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), s = R.cssScale, I = R.ins;
      const hq = document.getElementById('hud').getBoundingClientRect(), hb = { l: hq.left, t: hq.top, r: hq.right, b: hq.bottom };
      const L = (x, y, w, h) => ({ l: c.left + x * s, t: c.top + y * s, r: c.left + (x + w) * s, b: c.top + (y + h) * s });
      const x0 = I.left + 12, y0 = I.top + 10, n = FH.Game.world.maxHearts;
      const hearts = L(x0, y0, n * 30 + 14, 38), score = L(x0, y0 + 46, 168, 40);
      const bw = Math.min(250, R.VW * (R.portrait ? 0.5 : 0.28)), bx = R.portrait ? R.VW - I.right - 12 - bw - 8 : R.VW / 2 - bw / 2, by = R.portrait ? y0 + 100 : y0 + 4;
      const bar = L(bx - 8, by - 4, bw + 16, 40);
      const inter = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const btns = [...document.querySelectorAll('#hud button')].map(b => b.getBoundingClientRect().height);
      const safe = r => r.l >= sa[3] - 0.5 && r.t >= sa[0] - 0.5 && r.r <= W - sa[1] + 0.5 && r.b <= H - sa[2] + 0.5;
      return { hud: hb, hudInCanvas: hb.l >= c.left - 0.5 && hb.r <= c.right + 0.5 && hb.t >= c.top - 0.5 && hb.b <= c.bottom + 0.5,
        hudSafe: safe(hb), heartsSafe: safe(hearts), scoreSafe: safe(score), barSafe: safe(bar), overlap: inter(hb, bar) || inter(hb, hearts) || inter(hb, score) || inter(bar, hearts) || inter(bar, score), btns, bar, hearts };
    }, { sa, W: S.w, H: S.h });
    ok('HUD buttons inside the canvas and inside the safe area', hud.hudInCanvas && hud.hudSafe, hud);
    ok('canvas HUD (hearts, score, progress) inside the safe area', hud.heartsSafe && hud.scoreSafe && hud.barSafe, hud);
    ok('HUD pills and buttons do not overlap', !hud.overlap, hud);
    ok('HUD buttons ≥ 44 px', hud.btns.every(h => h >= 44 - 0.5), hud.btns);
    await P.evaluate(() => FH.debug.gust(1)); await sleep(600);
    await P.screenshot({ path: path.join(OUT, tag + '_play.png') });
    await P.keyboard.press('Escape'); await check('scrPause', '#scrPause .panel');
    await P.keyboard.press('Escape');
    await P.evaluate(() => { FH.Game.world.score = 12345; FH.Game.world.level = 4; });
    await toOver(P); await afterLock(P);
    await check('scrOver', '#scrOver .panel');
    await P.screenshot({ path: path.join(OUT, tag + '_over.png') });
    await P.evaluate(() => FH.UI.toast('Picture saved on this device!', 3000));
    const tt = await P.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    ok('toast inside the window', tt.l >= 0 && tt.r <= S.w && tt.t >= 0 && tt.b <= S.h, tt);
    ok('zero console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
  // live resize / rotation during play keeps the hero mapping sane
  const { ctx, page: P, errors } = await open('seed=1&mute=1&autostart=1', { w: 390, h: 844, dpr: 3, touch: true });
  await P.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  const r1 = await P.evaluate(() => ({ VW: FH.Game.renderer.VW, VH: FH.Game.renderer.VH, wx: FH.Game.weather.width }));
  ok('rotate portrait → landscape: view + weather re-laid out', r1.VW > r1.VH && r1.wx === r1.VW, r1);
  await P.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const r2 = await P.evaluate(() => ({ VW: FH.Game.renderer.VW, VH: FH.Game.renderer.VH }));
  ok('rotate back → portrait', r2.VH > r2.VW, r2);
  ok('zero console errors on rotate', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.soak = async () => {
  const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&autorestart=1&bot=1&skill=0.05&speed=16&diff=hard');
  const t0 = Date.now(), samples = [];
  let gameT = 0;
  while (Date.now() - t0 < 75000) {
    await sleep(1000);
    const s = await P.evaluate(() => { const G = FH.Game, w = G.world, R = G.renderer;
      return { gameT: G.stats.times.reduce((a, b) => a + b, 0) + (G.runT || 0), games: G.stats.games, mode: G.mode, parts: G.weather.particles.length, plats: w.platforms.length,
        flies: w.fireflies.length, texts: R.texts.length, rings: R.rings.length, flyers: R.flyers.length, regrow: w._regrow.length, sq: R._sq ? R._sq.size : 0,
        cache: FH.Assets._cache.size, spr: R._spr.size, bg: R._bg.size, ev: G.world.events.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, errs: G.stats.errors.length }; });
    samples.push(s); gameT = s.gameT;
    if (gameT >= 360) break;
  }
  const mx = k => Math.max(...samples.map(s => s[k]));
  const last = samples[samples.length - 1];
  console.log('    info: ' + gameT.toFixed(0) + ' s of game time in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, games ' + last.games + ', max particles ' + mx('parts') + ', platforms ' + mx('plats') +
    ', fireflies ' + mx('flies') + ', texts ' + mx('texts') + ', sprite cache ' + mx('cache') + ', renderer spr ' + mx('spr') + ', heap ' + (mx('heap') / 1e6).toFixed(0) + ' MB');
  const stats = await P.evaluate(() => FH.Game.stats);
  console.log('    info: scores ' + JSON.stringify(stats.scores.slice(0, 12)) + ' levels ' + JSON.stringify(stats.levels.slice(0, 12)));
  ok('soak ran ≥ 5 minutes of game time at ?speed=16', gameT >= 300, gameT.toFixed(0));
  ok('several games finished and auto-restarted', last.games >= 2 && (last.mode === 'playing' || last.mode === 'over'), { games: last.games, mode: last.mode });
  ok('no runtime errors in the frame loop (stats.errors) or console', stats.errors.length === 0 && errors.length === 0, (stats.errors[0] || errors[0] || '').slice(0, 300));
  ok('weather particles bounded (< 180)', mx('parts') < 180, mx('parts'));
  ok('platforms bounded (< 80)', mx('plats') < 80, mx('plats'));
  ok('fireflies bounded (< 80)', mx('flies') < 80, mx('flies'));
  ok('renderer juice (texts / rings / flyers) bounded', mx('texts') < 60 && mx('rings') < 40 && mx('flyers') < 40, { t: mx('texts'), r: mx('rings'), f: mx('flyers') });
  ok('puff regrow queue bounded', mx('regrow') < 30, mx('regrow'));
  warn('rasterised sprite cache bounded (< 1500 entries)', mx('cache') < 1500, samples.map(s => s.cache).filter((_, i) => i % 5 === 0));
  const h0 = samples[Math.min(5, samples.length - 1)].heap, h1 = last.heap;
  warn('JS heap does not keep growing (< +60 MB over the soak)', !h0 || h1 - h0 < 60e6, ((h1 - h0) / 1e6).toFixed(1) + ' MB');
  await ctx.close();
};

// ======================================================================================= main
(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
  const order = ['boot', 'menus', 'keys', 'pointer', 'rules', 'levels', 'wind', 'settings', 'custom', 'focus', 'native', 'layout', 'soak'];
  for (const g of order) {
    if (ONLY.length && !ONLY.includes(g)) continue;
    GROUP = g; console.log('\n== ' + g);
    const t = Date.now();
    try { await groups[g](); }
    catch (e) { ok('group "' + g + '" finished without an exception', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
    console.log('  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  }
  await browser.close();
  console.log('\n==== ' + R.pass + ' PASS, ' + R.fail + ' FAIL, ' + R.warn + ' WARN');
  if (R.fails.length) console.log('FAILS:\n  ' + R.fails.join('\n  '));
  if (R.warns.length) console.log('WARNS:\n  ' + R.warns.join('\n  '));
  process.exit(R.fail ? 1 : 0);
})();
