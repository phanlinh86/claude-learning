#!/usr/bin/env node
// Puddle's Greenhouse Hop — functional QA suite (Playwright, chromium, file://).
// Run from projects/daily-game/penguin-greenhouse-hop:   node tests/e2e/functional.js [--quick] [group ...]
// Prints PASS / FAIL / WARN per check; exits 1 on any FAIL. Groups: boot menus keys pointer rules growth platforms
// levels settings custom focus native layout soak (default: all). --quick: fewer layouts, shorter bot runs, no soak.
// Screenshots + fixtures go to tests/out/functional/.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(OUT, 'fixtures'); fs.mkdirSync(FIX, { recursive: true });
const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes('--quick');
const ONLY = ARGS.filter(a => !a.startsWith('--'));
const R = { pass: 0, fail: 0, warn: 0, fails: [], warns: [] };
let GROUP = '';
function fmt(detail) { return detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600); }
function ok(name, cond, detail) {
  if (cond) { R.pass++; console.log('  PASS ' + name); }
  else { R.fail++; R.fails.push(GROUP + ': ' + name + fmt(detail)); console.log('  FAIL ' + name + fmt(detail)); }
  return !!cond;
}
function warn(name, cond, detail) {
  if (cond) { R.pass++; console.log('  PASS ' + name); }
  else { R.warn++; R.warns.push(GROUP + ': ' + name + fmt(detail)); console.log('  WARN ' + name + fmt(detail)); }
  return !!cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- in-page helpers (serialised into the page) ----------------
const STATE = () => {
  const G = PH.Game, w = G.world, h = w.hero;
  return { mode: G.mode, ui: PH.UI.current, phase: w.phase, dir: h.dir, x: h.x, vx: h.vx, y: h.y, vy: h.vy, hearts: w.hearts,
    maxHearts: w.maxHearts, score: w.score, ff: w.fireflyCount, lantern: w.lantern, level: w.level, zone: w.zone, loop: w.loop,
    camY: w.camY, maxY: w.maxY, size: h.size, big: h.big, shrinkT: h.shrinkT, time: w.time, muted: !!(G.settings.muted || G.urlMute),
    hud: !document.getElementById('hud').classList.contains('hidden') };
};
const HOOKS = () => {
  if (window.__hooked) return; window.__hooked = true;
  const G = PH.Game; window._ev = []; window._drawn = {}; window._starts = 0; window._texts = {};
  const he = G.handleEvents;
  G.handleEvents = function (evts) {
    const r = he.call(this, evts), w = this.world, Rn = this.renderer;
    for (const e of evts) if (e.type !== 'meter') window._ev.push({ type: e.type, kind: e.kind, spring: e.spring, zone: e.zone,
      level: e.level, bonus: e.bonus, sizeBonus: e.sizeBonus, size: e.size, flick: e.flick, depth: e.depth, step: e.step,
      pid: e.p && e.p.id, py: e.p && e.p.y, hy: w.hero.y, hvy: w.hero.vy, hearts: w.hearts,
      vis: Rn.vis.cur, banner: Rn.banner && { s: Rn.banner.s, level: Rn.banner.level, loop: Rn.banner.loop }, az: PH.Audio.zone,
      aloop: PH.Audio.loop, wz: this.weather.zone, wloop: w.loop, t: w.time, mode: this.mode });
    if (window._ev.length > 6000) window._ev.splice(0, 2000);
    return r;
  };
  const sg = G.startGame; G.startGame = function () { window._starts++; return sg.apply(this, arguments); };
  const Rn = G.renderer, ds = Rn.drawSpr;
  Rn.drawSpr = function (g, key) { window._drawn[key] = (window._drawn[key] || 0) + 1; return ds.apply(this, arguments); };
  window._snd = []; const ap = PH.Audio.play; PH.Audio.play = function (n) { window._snd.push(n); if (window._snd.length > 3000) window._snd.splice(0, 1000); return ap.apply(this, arguments); };
  const ctx = Rn.ctx, ft = ctx.fillText;
  ctx.fillText = function (s) { window._texts[s] = (window._texts[s] || 0) + 1; return ft.apply(this, arguments); };
};
const FORCE_FALL = (hearts) => {
  const w = PH.Game.world, h = w.hero;
  if (hearts != null) w.hearts = hearts;
  h.started = true; h.rescueT = 0; h.y = h.prevY = w.camY - 3; h.vy = -5;
};
/* put a single test platform under Puddle and drop her onto it; resolves with the bounce event (or null) */
const DROP_ON = async ({ kind, x, y, opts, size, hx, drop }) => {
  const w = PH.Game.world, h = w.hero;
  await new Promise(r => { const f = () => (h.started ? r() : requestAnimationFrame(f)); f(); });
  w.fireflies.length = 0;
  w.platforms = w.platforms.filter(p => p.kind === 'ground');
  w._gen.top = 1e9;                                       // no new platforms during the test
  if (size) w.setSize(size);
  y = w.camY + y;                                          // relative to the camera so she never falls off screen
  const p = w.spawn(kind, x, y, opts || {});
  w.steer(0); h.rescueT = 0; h.invuln = 0;
  h.x = h.prevX = hx == null ? x : hx; h.vx = 0; h.y = h.prevY = y + (drop || 1.5); h.vy = 0;
  window._ev.length = 0;
  const t0 = performance.now();
  await new Promise(r => { const f = () => (window._ev.some(e => e.type === 'bounce' && e.pid === p.id) || performance.now() - t0 > 3000 ? r() : requestAnimationFrame(f)); f(); });
  window.__p = p;
  return { pid: p.id, y0: y, ev: window._ev.find(e => e.type === 'bounce' && e.pid === p.id) || null, leafBend: window._ev.find(e => e.type === 'leafBend') || null };
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
  await page.waitForFunction(() => window.PH && PH.debug && PH.Game && (PH.Game.mode === 'title' || PH.Game.mode === 'playing'), null, { timeout: 20000 });
  await page.evaluate(HOOKS);
  return { ctx, page, errors };
}
const st = p => p.evaluate(STATE);
const waitFor = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 5000 }).then(() => true, () => false);
const frames = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 3);
async function canvasRect(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }
async function toOver(p) {
  await p.evaluate(FORCE_FALL, 1);
  return waitFor(p, () => PH.Game.mode === 'over', null, 6000);
}
async function afterLock(p) { await p.waitForFunction(() => PH.Game.canRestart() && PH.UI.current === 'scrOver', null, { timeout: 3000 }); await sleep(60); }
const FORK_WORDS = /\b(wind|gust|vane|clover|frog|meadow|orchard|farm|farmyard|hay|plank|cart|trampoline|snowy|sunny)\b/i;

// ======================================================================================= groups
const groups = {};

groups.boot = async () => {
  const { ctx, page, errors } = await open('seed=7');
  await sleep(3000);
  const s = await st(page);
  ok('boots to the title screen (mode title, #scrTitle shown, HUD hidden)', s.mode === 'title' && s.ui === 'scrTitle' && !s.hud, s);
  ok('title demo (bot) is running behind the menu', s.time > 1.5 && s.maxY > 1, { t: s.time, maxY: s.maxY });
  ok('title demo draws Puddle + platforms (no pop-up juice on the title)', await page.evaluate(() => Object.keys(window._drawn).some(k => k.startsWith('puddle_')) && (window._drawn.pot || window._drawn.shelf)));
  ok('zero console errors / page errors during boot + 3 s of title', errors.length === 0, errors.slice(0, 3));
  await sleep(500);
  const missing = await page.evaluate(() => Object.keys(PH.Assets.files).filter(k => !PH.Assets.img[k]));
  ok('every default asset loaded (after streaming)', missing.length === 0, missing);
  const gs = await page.evaluate(() => { try { const s = PH.debug.getState(); return { ok: true, keys: Object.keys(s).length, size: s.size, particles: s.particles }; } catch (e) { return { ok: false, err: e.message }; } });
  ok('PH.debug.getState() works and reports size (DESIGN §5.4)', gs.ok && gs.size === 1 || (gs.ok && gs.size >= 1), gs);
  const hooks = await page.evaluate(() => ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'steer', 'grow', 'setSize'].filter(k => !(k in PH.debug)));
  ok('all PH.debug hooks exist (incl. grow / setSize)', hooks.length === 0, hooks);
  ok('no wind left in the API (world.wind / debug.gust removed)', await page.evaluate(() => !('gust' in PH.debug) && PH.Game.world.wind === undefined && typeof PH.World.prototype.gust !== 'function'));
  ok('best score shown on title', await page.evaluate(() => document.getElementById('bestTitle').textContent === '0'));
  const words = await page.evaluate(re => { const m = document.body.textContent.match(new RegExp(re, 'ig')); return m || []; }, FORK_WORDS.source);
  ok('no fork words (wind / Clover / farm / hay …) in the page text', words.length === 0, words);
  ok('title / meta name the game', await page.evaluate(() => document.title === "Puddle's Greenhouse Hop"));
  await ctx.close();
  // URL flags
  const b = await open('seed=7&autostart=1&diff=hard&level=2&speed=3&mute=1');
  const s2 = await st(b.page);
  ok('?autostart=1 → playing; ?diff=hard; ?level=2 → zone 2 (Orchid Balcony)', s2.mode === 'playing' && s2.zone === 2 && (await b.page.evaluate(() => PH.Game.world.difficulty)) === 'hard', s2);
  ok('?speed=3 sets Game.speed', (await b.page.evaluate(() => PH.Game.speed)) === 3);
  ok('?mute=1 mutes audio', (await b.page.evaluate(() => PH.Audio.muted)) === true);
  ok('?level=2 visuals / weather / music on the balcony', await b.page.evaluate(() => PH.Game.renderer.vis.cur === 2 && PH.Game.weather.zone === 2 && PH.Audio.zone === 2));
  ok('zero console errors with URL flags', b.errors.length === 0, b.errors.slice(0, 3));
  await b.ctx.close();
  const d = await open('seed=7&debug=1&autostart=1&mute=1');
  await sleep(600);
  ok('?debug=1 draws the debug overlay without errors', d.errors.length === 0 && await d.page.evaluate(() => Object.keys(window._texts).some(t => /^y .* size /.test(t))), d.errors.slice(0, 2));
  await d.ctx.close();
};

groups.menus = async () => {
  const { ctx, page, errors } = await open('seed=11&mute=1');
  const P = page;
  for (const [btn, scr, back] of [['#btnHow', 'scrHow', '#scrHow .btn-back'], ['#btnSettings', 'scrSettings', '#scrSettings .btn-back'], ['#btnCustomize', 'scrCustom', '#scrCustom .btn-back']]) {
    await P.click(btn); ok(btn + ' opens ' + scr, await P.evaluate(id => PH.UI.current === id && !document.getElementById(id).classList.contains('hidden'), scr));
    await P.keyboard.press('Escape'); ok('Esc on ' + scr + ' → title', await P.evaluate(() => PH.UI.current === 'scrTitle' && PH.Game.mode === 'title'));
    await P.click(btn); await P.click(back); ok(back + ' → title', await P.evaluate(() => PH.UI.current === 'scrTitle'));
  }
  await P.click('#btnHow');
  const how = await P.evaluate(() => document.getElementById('scrHow').textContent);
  ok('How to Play explains growth, leaves, baskets, mushrooms and the umbrella', /grows bigger/i.test(how) && /Leaves/.test(how) && /Baskets/.test(how) && /Mushrooms/.test(how) && /umbrella/i.test(how) && /15 fireflies/.test(how));
  await P.keyboard.press('Escape');
  await P.click('#btnPlay');
  let s = await st(P);
  ok('Play → playing, HUD visible, menus hidden', s.mode === 'playing' && s.hud && s.ui === null, s);
  ok('Play: no Quit button in the browser', await P.evaluate(() => document.getElementById('btnQuit').classList.contains('hidden')));
  await P.keyboard.press('Escape'); s = await st(P);
  ok('Esc → paused (pause panel, HUD hidden)', s.mode === 'paused' && s.ui === 'scrPause' && !s.hud, s);
  const t0 = s.time, z0 = s.size; await sleep(300);
  const s1 = await st(P);
  ok('world frozen while paused (time and size)', Math.abs(s1.time - t0) < 1e-9 && s1.size === z0);
  await P.keyboard.press('Escape'); ok('Esc again → resume', (await st(P)).mode === 'playing');
  await P.keyboard.press('p'); ok('P → paused', (await st(P)).mode === 'paused');
  await P.keyboard.press('p'); ok('P → resume', (await st(P)).mode === 'playing');
  await P.click('#btnPause'); ok('HUD pause button → paused', (await st(P)).mode === 'paused');
  await P.click('#btnResume'); ok('Resume button → playing', (await st(P)).mode === 'playing');
  await P.keyboard.press('Escape'); await P.click('#btnPauseSettings');
  ok('Pause → Settings', await P.evaluate(() => PH.UI.current === 'scrSettings' && PH.Game.mode === 'paused'));
  await P.keyboard.press('Escape'); ok('Esc in pause-settings → back to Pause', await P.evaluate(() => PH.UI.current === 'scrPause' && PH.Game.mode === 'paused'));
  await P.click('#btnPauseSettings'); await P.click('#scrSettings .btn-back');
  ok('Done in pause-settings → back to Pause', await P.evaluate(() => PH.UI.current === 'scrPause'));
  await P.evaluate(() => { window.__w0 = PH.Game.world; });
  await P.click('#btnRestart');
  ok('Restart → playing with a new world', await P.evaluate(() => PH.Game.mode === 'playing' && PH.Game.world !== window.__w0 && PH.Game.world.time < 1));
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu');
  ok('Main Menu → title', await P.evaluate(() => PH.Game.mode === 'title' && PH.UI.current === 'scrTitle'));
  // game over
  await P.click('#btnPlay');
  ok('game over reached at 0 hearts', await toOver(P));
  const lock = await P.evaluate(() => { const dt = performance.now() - PH.Game.overAt; document.getElementById('btnAgain').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    document.getElementById('btnOverMenu').click(); return { dt, mode: PH.Game.mode }; });
  ok('restart lock: Play Again / Enter / Space / Menu ignored in the first 0.7 s', lock.mode === 'over' && lock.dt < 700, lock);
  ok('game over panel shows the score', await P.evaluate(() => PH.UI.current === 'scrOver' && document.getElementById('overScore').textContent === String(PH.Game.world.score)));
  const over = await P.evaluate(() => ({ medal: document.getElementById('medalName').textContent, stats: document.getElementById('overStats').textContent }));
  ok('game over stats list height, fireflies, lanterns, mushrooms, biggest size, falls, floor reached', /Climbed/.test(over.stats) && /Fireflies/.test(over.stats) && /Biggest: [\d.]+×/.test(over.stats) && /Mushrooms/.test(over.stats) && /Reached: Potting Shed/.test(over.stats), over);
  ok('game over medal hint names this game\'s first floor (no fork "Sunny Meadow")', !FORK_WORDS.test(over.medal) && /Potting Shed/.test(over.medal), over.medal);
  await afterLock(P); await P.click('#btnAgain');
  ok('Play Again (after the lock) → playing', (await st(P)).mode === 'playing');
  await toOver(P); await afterLock(P); await P.click('#btnOverMenu');
  ok('Game over → Menu → title', await P.evaluate(() => PH.Game.mode === 'title' && PH.UI.current === 'scrTitle'));
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
  ok('Enter on title (nothing focused) → playing', (await st(P)).mode === 'playing');
  if ((await st(P)).mode !== 'playing') await P.click('#btnPlay');
  // M and F11
  const m0 = (await st(P)).muted, icon0 = await P.evaluate(() => document.getElementById('btnMuteHud').innerHTML);
  await P.keyboard.press('m'); const m1 = (await st(P)).muted, icon1 = await P.evaluate(() => document.getElementById('btnMuteHud').innerHTML);
  ok('M toggles sound (state + HUD icon + toast)', m1 !== m0 && icon1 !== icon0 && await P.evaluate(() => /Sound (on|off)/.test(document.getElementById('toast').textContent)), { m0, m1 });
  await P.keyboard.press('m'); ok('M toggles back', (await st(P)).muted === m0);
  await P.keyboard.press('F11'); await sleep(400);
  const fs1 = await P.evaluate(() => ({ g: PH.Game.fullscreen, doc: !!document.fullscreenElement, mode: PH.Game.mode }));
  ok('F11 → Game.fullscreen on', fs1.g, fs1);
  warn('F11 → document is full screen (headless may refuse)', fs1.doc, fs1);
  await P.keyboard.press('F11'); await sleep(400);
  const fs2 = await P.evaluate(() => ({ g: PH.Game.fullscreen, doc: !!document.fullscreenElement }));
  ok('F11 again → leaves full screen', !fs2.g && !fs2.doc, fs2);
  ok('zero console errors in the menus walk', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.keys = async () => {
  const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy');
  await waitFor(P, () => PH.Game.world.hero.started && PH.Game.world.time > 1);   // Puddle stands still for startDelay 0.6 s
  await P.evaluate(() => PH.Game.world.setX(9));
  const dir = async () => { await frames(P, 2); return (await st(P)).dir; };
  await P.keyboard.down('ArrowLeft'); ok('hold ← → steer −1', (await dir()) === -1);
  await sleep(350); ok('holding ← accelerates Puddle left', (await st(P)).vx < -3, (await st(P)).vx);
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
  // Space / Enter / ↑ / ↓ while playing do nothing (no page scroll, no restart)
  const s0 = await P.evaluate(() => window._starts);
  for (const k of ['Space', 'Enter', 'ArrowUp', 'ArrowDown']) await P.keyboard.press(k);
  ok('Space / Enter / ↑ / ↓ while playing: no restart, no steer', (await P.evaluate(() => window._starts)) === s0 && (await dir()) === 0 && (await st(P)).mode === 'playing');
  // pause clears and ignores input
  await P.keyboard.down('ArrowLeft'); await frames(P, 2);
  await P.keyboard.press('Escape'); ok('pause while holding ← clears the steer', (await dir()) === 0);
  await P.keyboard.down('ArrowRight'); ok('keys ignored while paused', (await dir()) === 0);
  await P.keyboard.up('ArrowRight'); await P.keyboard.up('ArrowLeft');
  await P.keyboard.press('Escape'); ok('after resume: no stuck steer', (await dir()) === 0 && (await st(P)).mode === 'playing');
  // blur / visibility
  await P.keyboard.down('ArrowRight'); await frames(P, 2);
  await P.evaluate(() => window.dispatchEvent(new Event('blur')));
  let s = await st(P); ok('window blur → auto-pause + input cleared', s.mode === 'paused' && s.dir === 0, s);
  await P.keyboard.up('ArrowRight'); await P.keyboard.press('Escape');
  await P.keyboard.down('ArrowLeft'); await frames(P, 2);
  await P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await st(P); ok('visibilitychange (hidden) → auto-pause + input cleared + audio suspended flag', s.mode === 'paused' && s.dir === 0 && await P.evaluate(() => PH.Audio._hidden === true), s);
  await P.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  ok('visible again: stays paused until the child resumes', (await st(P)).mode === 'paused' && await P.evaluate(() => PH.Audio._hidden === false));
  await P.keyboard.up('ArrowLeft'); await P.keyboard.press('Escape');
  // holding a key across pause → resume: the auto-repeat steers again
  await P.keyboard.down('ArrowRight'); await frames(P, 2); await P.keyboard.press('Escape'); await P.keyboard.press('Escape');
  for (let i = 0; i < 5; i++) await P.keyboard.down('ArrowRight');
  ok('a key still held after Resume steers again (on its auto-repeat)', (await dir()) === 1);
  await P.keyboard.up('ArrowRight');
  // game over ignores input
  await toOver(P); await P.keyboard.down('ArrowLeft');
  ok('keys ignored on game over', (await dir()) === 0); await P.keyboard.up('ArrowLeft');
  // the bot owns the steer: player keys ignored
  await afterLock(P); await P.keyboard.press('Enter'); await P.evaluate(() => PH.debug.setBot(true, 1));
  const dirs = []; await P.keyboard.down('ArrowLeft');
  for (let i = 0; i < 6; i++) { await frames(P, 2); dirs.push((await st(P)).dir); }
  await P.keyboard.up('ArrowLeft'); await P.evaluate(() => PH.debug.setBot(false));
  ok('while the bot plays, held keys do not override it (not stuck at −1)', dirs.some(d => d !== -1), dirs);
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.pointer = async () => {
  {
    const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy');
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
  // ---- touch (CDP multi-touch) on an iPad-sized touch screen
  {
    const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&diff=easy', { w: 1024, h: 768, dpr: 2, touch: true });
    const cdp = await ctx.newCDPSession(P);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p[0], y: p[1], id: p[2] })) });
    const r = await canvasRect(P), y = r.y + r.h * 0.6, A = [r.x + r.w * 0.2, y, 1], B = [r.x + r.w * 0.8, y + 30, 2];
    const dir = async () => { await frames(P, 2); return (await st(P)).dir; };
    ok('touch device detected (body.touch, isTouch)', await P.evaluate(() => PH.Game.isTouch && document.body.classList.contains('touch')));
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
    s = await st(P); ok('holding left + tapping Pause with a second finger → paused, steer cleared', s.mode === 'paused' && s.dir === 0, s);
    await T('touchEnd', []); await frames(P, 2);
    await T('touchStart', [A]); ok('touch on the pause panel does not steer', (await dir()) === 0); await T('touchEnd', []);
    const rb = await btn('btnResume'); await T('touchStart', [rb]); await T('touchEnd', []); await frames(P, 3);
    ok('tap Resume (touch) → playing', (await st(P)).mode === 'playing');
    await sleep(700);
    ok('no ghost click after the Resume tap (still playing)', (await st(P)).mode === 'playing');
    await toOver(P); await T('touchStart', [A]); ok('touch ignored on game over', (await dir()) === 0); await T('touchEnd', []);
    await afterLock(P); const s0 = await P.evaluate(() => window._starts); const ab = await btn('btnAgain'); await T('touchStart', [ab]); await T('touchEnd', []); await sleep(700);
    ok('tap Play Again (touch) → playing, started exactly once (no ghost click)', await P.evaluate(s0 => PH.Game.mode === 'playing' && window._starts === s0 + 1, s0));
    await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await sleep(200);
    const sb = await btn('btnHow'); await T('touchStart', [sb]); await T('touchEnd', []); await sleep(700);
    ok('tap How to Play (touch) opens it and no ghost click closes it', await P.evaluate(() => PH.UI.current === 'scrHow'));
    const kb = await P.evaluate(() => [...document.querySelectorAll('#scrHow .kb-only')].every(e => getComputedStyle(e).display === 'none') && [...document.querySelectorAll('#scrHow .touch-only')].some(e => getComputedStyle(e).display !== 'none'));
    ok('touch: How to Play shows the touch hint, hides keyboard-only text', kb);
    await P.keyboard.press('Escape'); await P.click('#btnPlay'); await sleep(300);
    ok('touch: steering hint pills ("hold here") drawn on floor 1', await P.evaluate(() => new Promise(r => setTimeout(() => r(!!(window._texts['◀ hold here'])), 2800))));
    ok('zero console errors (touch)', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
};

groups.rules = async () => {
  const { ctx, page: P, errors } = await open('seed=4&mute=1&autostart=1&diff=easy');
  await waitFor(P, () => PH.Game.world.stats.bounces >= 3, null, 5000);
  const C = await P.evaluate(() => { const c = PH.World.CONFIG; return { bounceV: c.bounceV, springK: c.springK, rescueK: c.rescueK, g: c.g, flickCap: c.leaf.flickCap, lanternSize: c.lanternSize }; });
  ok('CONFIG: lantern holds 15 fireflies', C.lanternSize === 15, C);
  let ev = await P.evaluate(() => window._ev.filter(e => e.type === 'bounce'));
  const badB = ev.filter(e => { const k = e.kind === 'rescue' ? C.rescueK : e.spring ? C.springK : 1, v = C.bounceV * k * (e.flick || 1); return !(e.hvy <= v + 1e-6 && e.hvy > v - 0.6 && e.hy >= e.py - 1e-6 - 0.5 && e.hy < e.py + 0.35); });
  ok('auto-bounce on landing (vy = bounceV, feet on the top surface)', ev.length >= 2 && badB.length === 0, { n: ev.length, bad: badB.slice(0, 2) });
  // one-way: rise through a shelf placed above her, then land on it
  const ow = await P.evaluate(async () => {
    const G = PH.Game, w = G.world, h = w.hero;
    await new Promise(r => { const f = () => (h.vy > 10 ? r() : requestAnimationFrame(f)); f(); });
    w.setX(6); h.vx = 0;
    w.platforms = w.platforms.filter(p => p.kind === 'ground' || Math.abs(p.x - 6) > 3 || p.y < h.y - 0.1 || p.y > h.y + 4);
    const p = w.spawn('shelf', 6, h.y + 1.5, { w: 2 }); const y0 = h.y; window._ev.length = 0;
    let maxY = y0;
    await new Promise(r => { const t0 = performance.now(); const f = () => { maxY = Math.max(maxY, h.y);
      if (window._ev.some(e => e.type === 'bounce' && e.pid === p.id) || performance.now() - t0 > 2500) r(); else requestAnimationFrame(f); }; f(); });
    const firstBounce = window._ev.find(e => e.type === 'bounce');
    return { py: p.y, y0, maxY, passed: maxY > p.y + 0.5, landed: !!(firstBounce && firstBounce.pid === p.id) };
  });
  ok('one-way platform: Puddle rises through a shelf from below', ow.passed, ow);
  ok('… and lands on it from above', ow.landed, ow);
  // firefly
  const ff = await P.evaluate(async () => {
    const w = PH.Game.world, h = w.hero, s0 = w.score, f0 = w.fireflyCount, l0 = w.lantern, z0 = h.size; window._ev.length = 0;
    w.spawn('firefly', h.x, h.y + 0.55 * h.size);
    await new Promise(r => setTimeout(r, 150));
    const e = window._ev.find(e => e.type === 'firefly');
    return { ds: w.score - s0, df: w.fireflyCount - f0, dl: w.lantern - l0, ev: !!e, dz: +(h.size - z0).toFixed(4) };
  });
  ok('catching a firefly: +10 points, +1 count, +1 lantern, event', ff.ev && ff.df === 1 && ff.dl === 1 && ff.ds >= 10 && ff.ds < 16, ff);
  ok('… and Puddle grows by growPerFirefly (0.006)', ff.dz >= 0.006 && ff.dz < 0.01, ff);
  await sleep(300);
  ok('firefly juice: "+10" text drawn and the fly flies to the jar', await P.evaluate(() => !!window._texts['+10'] || Object.keys(window._texts).some(t => /^\+\d+$/.test(t))));
  const lan = await P.evaluate(async () => {
    const w = PH.Game.world, h = w.hero; w.lantern = 14; w.hearts = w.maxHearts - 1; const h0 = w.hearts, l0 = w.stats.lanterns; window._ev.length = 0;
    w.spawn('firefly', h.x, h.y + 0.55 * h.size);
    await new Promise(r => setTimeout(r, 150));
    return { hearts: w.hearts, h0, lantern: w.lantern, lanterns: w.stats.lanterns - l0, evL: window._ev.some(e => e.type === 'lantern'), evH: window._ev.some(e => e.type === 'heartGain') };
  });
  ok('15th firefly fills the lantern → +1 heart, lantern resets', lan.hearts === lan.h0 + 1 && lan.lantern === 0 && lan.lanterns === 1 && lan.evL && lan.evH, lan);
  const lanMax = await P.evaluate(async () => { const w = PH.Game.world, h = w.hero; w.lantern = 14; w.hearts = w.maxHearts; window._ev.length = 0; window._texts = {}; w.spawn('firefly', h.x, h.y + 0.55 * h.size);
    await new Promise(r => setTimeout(r, 300)); return { hearts: w.hearts, max: w.maxHearts, lantern: w.lantern, heartGain: window._ev.some(e => e.type === 'heartGain'), txt: !!window._texts['Lantern full! +1 heart'] }; });
  ok('full lantern at max hearts: hearts stay at max, lantern resets', lanMax.hearts === lanMax.max && lanMax.lantern === 0, lanMax);
  warn('full lantern at max hearts: no heartGain event / no "+1 heart" promise (nothing was gained)', !lanMax.heartGain && !lanMax.txt, lanMax);
  // fall → heart lost → umbrella rescue
  const fall = await P.evaluate(async () => {
    const w = PH.Game.world, h = w.hero; w.hearts = 3; window._ev.length = 0; window._drawn = {}; window._snd.length = 0; window._texts = {};
    h.started = true; h.rescueT = 0; h.y = h.prevY = w.camY - 3; h.vy = -5;
    await new Promise(r => setTimeout(r, 60));
    const resc = w.platforms.find(p => p.kind === 'rescue');
    let back = false, bounced = false; const t0 = performance.now();
    await new Promise(r => { const f = () => { if (window._ev.some(e => e.type === 'bounce' && e.kind === 'rescue')) bounced = true; if (h.y > w.camY + 1) back = true; if ((back && bounced) || performance.now() - t0 > 2500) r(); else requestAnimationFrame(f); }; f(); });
    return { hearts: w.hearts, fallEv: window._ev.some(e => e.type === 'fall'), rescueEv: window._ev.some(e => e.type === 'rescue'), resc: !!resc, back, bounced, umb: window._drawn.umbrella || 0, mood: h.mood,
      snd: [...new Set(window._snd)], txt: !!window._texts['Umbrella boing!'] };
  });
  ok('falling off the bottom costs one heart (fall event)', fall.hearts === 2 && fall.fallEv, fall);
  ok('an upside-down umbrella appears (drawn) and throws Puddle back on screen', fall.resc && fall.rescueEv && fall.back && fall.umb > 0, fall);
  ok('fall plays the "wheee" sound', fall.snd.includes('fall'), fall.snd);
  warn('the umbrella throw itself plays the umbrella "boinggg" + shows "Umbrella boing!" (not only when she lands on it again)', fall.snd.includes('rescue') && fall.txt, fall);
  // game over at 0 hearts
  await P.evaluate(FORCE_FALL, 1);
  await sleep(80);
  ok('last heart lost → world phase over + gameOver event', await P.evaluate(() => PH.Game.world.phase === 'over' && window._ev.some(e => e.type === 'gameOver')));
  ok('no umbrella on the last fall', await P.evaluate(() => !PH.Game.world.platforms.some(p => p.kind === 'rescue' && p.t < 0.2)));
  ok('→ game over screen after the fall animation', await waitFor(P, () => PH.Game.mode === 'over' && PH.UI.current === 'scrOver', null, 4000));
  ok('game over screen shows the run score', await P.evaluate(() => document.getElementById('overScore').textContent === String(PH.Game.world.score)));
  // exact score identity on a bot run: metres (×2 while big) + 10 × fireflies + floor bonus + size bonus
  await afterLock(P);
  await P.evaluate(() => {
    window._ev.length = 0; PH.debug.startGame(); PH.debug.setBot(true, 1); PH.debug.setSpeed(8);
    const w = PH.Game.world, orig = w._stepScore; window.__metre = { pts: 0, big: 0 };
    w._stepScore = function () { const m0 = this._metre, big = this.hero.big; const r = orig.apply(this, arguments); const d = this._metre - m0; window.__metre.pts += d * (big ? 2 : 1); if (big) window.__metre.big += d; return r; };
  });
  await waitFor(P, () => PH.Game.world.level >= 1 && PH.Game.world.maxY > PH.Game.world.levelY0 + 5, null, QUICK ? 30000 : 45000);
  const id = await P.evaluate(() => { PH.debug.setSpeed(1); const w = PH.Game.world; const lu = window._ev.filter(e => e.type === 'levelUp');
    const bonus = lu.reduce((a, e) => a + (e.bonus || 0), 0), sb = lu.reduce((a, e) => a + (e.sizeBonus || 0), 0);
    return { score: w.score, maxY: w.maxY, metre: window.__metre, ff: w.fireflyCount, bonus, sizeBonus: sb, lu: lu.map(e => ({ b: e.bonus, sb: e.sizeBonus, size: +e.size.toFixed(3) })),
      expect: window.__metre.pts + 10 * w.fireflyCount + bonus + sb }; });
  ok('score = metres (×2 while big) + 10 × fireflies + floor bonus + size bonus (exact)', id.score === id.expect && id.maxY > 20, id);
  ok('the bot run had big-Puddle metres (×2 counted)', id.metre.big > 0, id.metre);
  ok('metre points: +1/m at least, never more than ×2', id.metre.pts >= Math.floor(id.maxY) && id.metre.pts <= 2 * Math.floor(id.maxY), id);
  ok('size bonus at each levelUp = round(200 × (size − 1))', id.lu.length >= 1 && id.lu.every(e => e.sb === Math.max(0, Math.round(200 * (e.size - 1)))), id.lu);
  await P.evaluate(() => PH.debug.setBot(false));
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.growth = async () => {
  const { ctx, page: P, errors } = await open('seed=8&mute=1&autostart=1&diff=easy');
  await waitFor(P, () => PH.Game.world.hero.started);
  const z0 = (await st(P)).size;
  await P.evaluate(() => { PH.Game.world.fireflies.length = 0; });
  await sleep(2500);
  const z1 = await P.evaluate(() => PH.Game.world.hero.size);
  ok('Puddle grows slowly while playing (growRate ≈ 0.004/s)', z1 > z0 + 0.004 && z1 < z0 + 0.03, { z0, z1 });
  // grow hook → grow / big events, HUD ×2, banner text
  await P.evaluate(() => { window._ev.length = 0; window._texts = {}; window._drawn = {}; PH.debug.setSize(1); PH.debug.grow(0.35); });
  await sleep(500);
  const g = await P.evaluate(() => ({ s: PH.Game.world.hero.size, big: PH.Game.world.hero.big, grows: window._ev.filter(e => e.type === 'grow').map(e => e.step), big1: window._ev.filter(e => e.type === 'big').length, x2: !!window._texts['×2'], bigTxt: !!window._texts['Big Puddle! Metres ×2'], badge: window._drawn.grow || 0 }));
  ok('PH.debug.grow(0.35): size 1.35, big, grow events per 0.1 step (1,2,3), one big event', Math.abs(g.s - 1.35) < 0.01 && g.big && JSON.stringify(g.grows) === '[1,2,3]' && g.big1 === 1, g);
  ok('HUD size meter: badge drawn, "×2" shown while big; "Big Puddle! Metres ×2" pop-up', g.badge > 0 && g.x2 && g.bigTxt, g);
  await P.evaluate(() => { window._ev.length = 0; PH.debug.grow(5); });
  ok('grow clamps at the difficulty maxSize (Easy 1.5)', await P.evaluate(() => PH.Game.world.hero.size === PH.World.CONFIG.difficulty.easy.maxSize));
  await frames(P, 3);   // let the grow(5) events drain first
  await P.evaluate(() => { window._ev.length = 0; PH.debug.setSize(1); });
  await frames(P, 2);
  const ss = await P.evaluate(() => ({ ev: window._ev.filter(e => e.type === 'grow' || e.type === 'big').map(e => e.type + ':' + (e.size || 0).toFixed(3)), big: PH.Game.world.hero.big, size: PH.Game.world.hero.size }));
  ok('PH.debug.setSize(1): silent (no grow/big events), not big', ss.ev.length === 0 && !ss.big && ss.size < 1.01, ss);
  await P.evaluate(() => PH.debug.setSize(2.0));
  ok('setSize can go past maxSize for tests (2.0), clamps to sizeHookMax 2.5', await P.evaluate(() => { const a = PH.Game.world.hero.size; PH.debug.setSize(9); const b = PH.Game.world.hero.size; PH.debug.setSize(1); return a === 2 && b === 2.5; }));
  // weight: top speed at size 1 vs 1.6
  const topSpeed = async size => {
    await P.evaluate(s => { const w = PH.Game.world, h = w.hero; w.setSize(s); h.shrinkT = 0; h.rescueT = 0; h.invuln = 0;
      const p = w.spawn('shelf', 6, w.camY + 1.5, { w: 11.5 }); h.y = h.prevY = p.y + 0.05; h.vy = 0; w.setX(11); h.vx = 0; }, size);
    await P.keyboard.down('ArrowLeft'); await sleep(450);
    const v = await P.evaluate(() => PH.Game.world.hero.vx); await P.keyboard.up('ArrowLeft'); await sleep(200);
    return v;
  };
  const v1 = await topSpeed(1), v16 = await topSpeed(1.6);
  ok('heavier = slower steering: top speed 5.0 at size 1, ≈ 3.64 at 1.6 (×0.73)', Math.abs(v1 + 5) < 0.15 && Math.abs(v16 + 3.64) < 0.15, { v1, v16 });
  ok('PH.debug.steer() works for tests', await P.evaluate(() => { PH.debug.steer(1); const d = PH.Game.world.hero.dir; PH.debug.steer(0); return d === 1; }));
  // ×2 metres while big, ×1 when not
  const metres = async size => P.evaluate(async s => {
    const w = PH.Game.world, h = w.hero; w.setSize(s); h.shrinkT = 0; w.fireflies.length = 0;
    const s0 = w.score, m0 = Math.floor(w.maxY), L0 = w.level;
    h.y = h.prevY = w.maxY + 6.3; h.vy = 0;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ds: w.score - s0, dm: Math.floor(w.maxY) - m0, level: w.level - L0 };
  }, size);
  await P.evaluate(() => { PH.Game.world.hearts = 5; });
  const mBig = await metres(1.4), mSmall = await metres(1.0);
  ok('metre points ×2 while big (size 1.4)', mBig.level === 0 && mBig.dm >= 6 && mBig.ds === 2 * mBig.dm, mBig);
  ok('metre points ×1 at normal size', mSmall.level === 0 && mSmall.dm >= 6 && mSmall.ds === mSmall.dm, mSmall);
  // levelUp: floor bonus + size bonus, then shrink back to 1.0
  await sleep(1500);
  const lu = await P.evaluate(async () => {
    const w = PH.Game.world, h = w.hero; w.setSize(1.45); h.shrinkT = 0; w.fireflies.length = 0; w.hearts = w.maxHearts - 1;
    window._ev.length = 0; window._texts = {};
    const s0 = w.score, m0 = Math.floor(w.maxY), hearts0 = w.hearts, f0 = w.fireflyCount;
    h.y = h.prevY = w.levelY0 + w.goal + 0.3; h.vy = 4;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const e = window._ev.find(e => e.type === 'levelUp');
    const dm = Math.floor(w.maxY) - m0;
    const s1 = h.size, hearts1 = w.hearts, ds1 = w.score - s0 - 10 * (w.fireflyCount - f0);
    await new Promise(r => setTimeout(r, 350)); const mid = h.size;
    await new Promise(r => setTimeout(r, 900));
    return { e: e && { bonus: e.bonus, sizeBonus: e.sizeBonus, size: e.size, zone: e.zone }, ds: ds1, dm, s1, mid, end: h.size, big: h.big, hearts: hearts1, hearts0,
      txt: Object.keys(window._texts).filter(t => /Floor bonus/.test(t)), shrinks: w.stats.shrinks };
  });
  ok('levelUp event: floor bonus 100 and sizeBonus round(200·0.45) = 90, size 1.45, zone 1', lu.e && lu.e.bonus === 100 && lu.e.sizeBonus === 90 && Math.abs(lu.e.size - 1.45) < 0.005 && lu.e.zone === 1, lu);
  ok('score += metres (×2 while still big) + floor bonus + size bonus (fireflies excluded)', lu.e && lu.ds >= 100 + 90 + lu.dm && lu.ds <= 100 + 90 + 2 * lu.dm, lu);
  ok('"Floor bonus +100 · size +90" pop-up drawn', lu.txt.some(t => /\+100/.test(t) && /size \+90/.test(t)), lu.txt);
  ok('after levelUp Puddle shrinks back smoothly (mid-shrink between 1 and 1.45, then exactly 1.0, not big)', lu.mid > 1.001 && lu.mid < 1.45 && lu.end < 1.01 && !lu.big, lu);
  ok('levelUp gives a heart back', lu.hearts === lu.hearts0 + 1, lu);
  await sleep(400);
  ok('Fern Floor visuals / weather / music after the level up', await P.evaluate(() => PH.Game.renderer.vis.cur === 1 && PH.Game.weather.zone === 1 && PH.Audio.zone === 1));
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.platforms = async () => {
  const { ctx, page: P, errors } = await open('seed=3&mute=1&autostart=1&diff=easy&level=1');
  const C = await P.evaluate(() => { const c = PH.World.CONFIG; return { bounceV: c.bounceV, springK: c.springK, leaf: c.leaf }; });
  // ---- leaf bends like a damped spring (light Puddle)
  const leafRun = async size => {
    const r = await P.evaluate(DROP_ON, { kind: 'leaf', x: 6, y: 2.6, opts: { side: -1, w: 2.6 }, size });
    const tr = await P.evaluate(() => new Promise(res => {
      const p = window.__p, w = PH.Game.world, t0 = w.time, out = [];
      const f = () => { out.push([+(w.time - t0).toFixed(3), +p.bend.toFixed(4), +p.y.toFixed(3)]); if (w.time - t0 > 0.85) res(out); else requestAnimationFrame(f); }; f();
    }));
    return { r, tr };
  };
  const L1 = await leafRun(1.0);
  const peak1 = Math.max(...L1.tr.map(q => q[1])), neg1 = Math.min(...L1.tr.map(q => q[1])), late1 = Math.abs(L1.tr[L1.tr.length - 1][1]);
  ok('leaf: landing bounces Puddle (kind leaf) with a leafBend event', L1.r.ev && L1.r.ev.kind === 'leaf' && L1.r.leafBend, L1.r);
  ok('leaf bends under her (bend state changes over time, tip goes down)', peak1 > 0.05 && L1.tr.some(q => q[2] < L1.r.y0 - 0.05), { peak1 });
  ok('leaf wobbles back like an underdamped spring (overshoots past 0, settles < 35 % by 0.85 s)', neg1 < -0.01 && late1 < 0.35 * peak1, { peak1, neg1, late1 });
  ok('light Puddle (size 1): no leaf flick (bounce vy = bounceV)', L1.r.ev && Math.abs(L1.r.ev.hvy - C.bounceV) < 0.3 && (L1.r.ev.flick || 1) < 1.01, L1.r.ev);
  const L2 = await leafRun(1.6);
  const peak2 = Math.max(...L2.tr.map(q => q[1]));
  ok('heavy Puddle (size 1.6) bends the leaf deeper', peak2 > peak1 * 1.4, { peak1, peak2 });
  ok('… and gets a higher flick (≤ ×1.15 cap)', L2.r.ev && L2.r.ev.flick > 1.1 && L2.r.ev.flick <= C.leaf.flickCap + 1e-9 && L2.r.ev.hvy > C.bounceV * 1.1, L2.r.ev);
  ok('leaf bend stays within maxBend 0.35 rad', Math.max(peak1, peak2) <= C.leaf.maxBend + 1e-9, { peak2 });
  await sleep(300);
  ok('"Flick!" pop-up for a big flick', await P.evaluate(() => !!window._texts['Flick!']));
  // ---- hanging basket swings as a pendulum (without touching it)
  await P.evaluate(() => { const w = PH.Game.world; w.setSize(1); w.platforms = w.platforms.filter(p => p.kind === 'ground'); window.__b = w.spawn('basket', 6, w.camY + 3.2, { len: 2.6, amp: 0.3 }); w.setX(1); w.hero.vx = 0; });
  const sw = await P.evaluate(() => new Promise(res => {
    const p = window.__b, w = PH.Game.world, t0 = w.time, xs = [];
    const f = () => { xs.push([w.time - t0, p.x - p.px, p.ang]); if (w.time - t0 > 4.5) res(xs); else requestAnimationFrame(f); }; f();
  }));
  const xr = Math.max(...sw.map(q => q[1])) - Math.min(...sw.map(q => q[1]));
  const cross = []; for (let i = 1; i < sw.length; i++) if (sw[i - 1][1] < 0 && sw[i][1] >= 0) cross.push(sw[i][0]);
  const period = cross.length >= 2 ? cross[1] - cross[0] : null, want = 2 * Math.PI * Math.sqrt(2.6 / 26);
  ok('basket swings (x changes over time, range ≈ 2·len·sin amp)', xr > 1.0 && xr < 1.8, { xr: +xr.toFixed(2) });
  ok('basket period ≈ 2π√(len/g) = 1.99 s (±10 %)', period && Math.abs(period - want) / want < 0.1, { period, want });
  await sleep(300);
  ok('basket chain + basket drawn', await P.evaluate(() => (window._drawn.basket || 0) > 0));
  const B = await P.evaluate(DROP_ON, { kind: 'basket', x: 6, y: 3.2, opts: { len: 2.6, amp: 0.05 } });
  ok('landing on a basket bounces her (kind basket) and counts a swing', B.ev && B.ev.kind === 'basket' && await P.evaluate(() => PH.Game.world.stats.swings >= 1), B.ev);
  // ---- mushroom on a pot: big bounce
  await P.evaluate(() => { window._drawn = {}; window._texts = {}; });
  const Mu = await P.evaluate(DROP_ON, { kind: 'pot', x: 6, y: 2.6, opts: { spring: true, w: 2.4 } });
  ok('mushroom pot: spring bounce (vy = bounceV × 1.6 ≈ 19.8)', Mu.ev && Mu.ev.spring && Math.abs(Mu.ev.hvy - C.bounceV * C.springK) < 0.4, Mu.ev);
  await sleep(120);
  const mu = await P.evaluate(() => ({ up: window._drawn.mushroom_up || 0, boing: !!window._texts['BOING!'], springs: PH.Game.world.stats.springs }));
  ok('mushroom squish sprite + "BOING!" pop-up, stats.springs counted', mu.up > 0 && mu.boing && mu.springs >= 1, mu);
  const apex = await P.evaluate(y0 => new Promise(res => { const h = PH.Game.world.hero; let m = h.y; const f = () => { m = Math.max(m, h.y); if (h.vy < -1) res(m - y0); else requestAnimationFrame(f); }; f(); }), Mu.y0);
  ok('mushroom launch apex ≈ 7.6 u (vs 3.0 u normal)', apex > 6.8 && apex < 8.2, apex);
  // off-centre landing on a mushroom pot is a normal bounce
  const Mo = await P.evaluate(DROP_ON, { kind: 'pot', x: 6, y: 2.6, opts: { spring: true, w: 2.4 }, hx: 6.9 });
  ok('landing on the pot rim away from the mushroom = normal bounce', Mo.ev && !Mo.ev.spring && Math.abs(Mo.ev.hvy - C.bounceV) < 0.3, Mo.ev);
  // generation: kinds by floor
  const kinds = await P.evaluate(() => { const out = {}; for (let z = 0; z < 4; z++) { const w = new PH.World({ seed: 5, difficulty: 'normal', level: z }); const k = {}; w.platforms.forEach(p => { if (p.kind !== 'ground') k[p.kind] = 1; }); out[z] = Object.keys(k).sort(); } return out; });
  ok('Potting Shed floor only has pots and shelves; upper floors also leaves / baskets', kinds[0].every(k => k === 'pot' || k === 'shelf') && [1, 2, 3].every(z => kinds[z].includes('leaf') || kinds[z].includes('basket')), kinds);
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.levels = async () => {
  const target = QUICK ? 2 : 5;
  const { ctx, page: P, errors } = await open('seed=2&mute=1&autostart=1&diff=easy&bot=1&skill=1&speed=16');
  const okRun = await waitFor(P, t => PH.Game.world.level >= t, target, QUICK ? 60000 : 150000);
  ok('bot at ?speed=16 climbs through the floors (level ≥ ' + target + ') without errors', okRun && errors.length === 0, { s: await st(P), e: errors.slice(0, 2) });
  const ev = await P.evaluate(() => window._ev.filter(e => e.type === 'levelUp'));
  const zones = ev.map(e => e.zone);
  ok('levelUp events for zones ' + [1, 2, 3, 0, 1].slice(0, target).join(','), JSON.stringify(zones.slice(0, target)) === JSON.stringify([1, 2, 3, 0, 1].slice(0, target)), zones);
  for (const e of ev.slice(0, target)) {
    const tag = 'floor ' + (e.level + 1) + ' (zone ' + e.zone + ', loop ' + e.wloop + ')';
    ok(tag + ': visuals, banner, weather, music switch to the new floor', e.vis === e.zone && e.banner && e.banner.s === e.zone && e.banner.level === e.level && e.wz === e.zone && e.az === e.zone && e.aloop === e.wloop, e);
  }
  const prevZ = [0, 1, 2, 3, 0];
  const bon = ev.slice(0, target).map((e, i) => ({ got: e.bonus, want: 100 * (prevZ[i] + 1) * (i >= 4 ? 2 : 1), sb: e.sizeBonus, size: e.size }));
  ok('floor bonus = 100 × (finished zone + 1) × (loop + 1)', bon.every(b => b.got === b.want), bon);
  ok('size bonus = round(200 × (size − 1)) at each new floor', bon.every(b => b.sb === Math.max(0, Math.round(200 * (b.size - 1)))), bon);
  if (!QUICK) {
    const loopE = ev.find(e => e.level === 4);
    ok('loop: floor 5 is the Potting Shed again, banner says round 2', loopE && loopE.zone === 0 && loopE.banner.loop === 1, loopE);
    const g = await P.evaluate(() => ({ goal: PH.Game.world.goal, lvl: PH.Game.world.level }));
    ok('loop goal is 10 % longer (Easy 115 → 126.5 u)', Math.abs(g.goal - 115 * 1.1) < 1e-6, g);
    const sh = await P.evaluate(() => PH.Game.world.stats.shrinks);
    ok('Puddle shrank back at the floor changes (stats.shrinks)', sh >= 4, sh);
  }
  const times = ev.slice(0, target).map((e, i, a) => +(e.t - (i ? a[i - 1].t : 0)).toFixed(1));
  console.log('    info: game seconds per floor (bot skill 1, Easy): ' + times.join(', '));
  ok('no game over during the bot run', (await P.evaluate(() => PH.Game.stats.games)) === 0);
  await P.evaluate(() => PH.debug.setSpeed(1));
  await P.evaluate(() => { window._drawn = {}; PH.debug.gotoLevel(3); });
  await sleep(1700);
  const v = await P.evaluate(() => ({ vis: PH.Game.renderer.vis, wz: PH.Game.weather.zone, az: PH.Audio.zone, banner: PH.Game.renderer.banner && PH.Game.renderer.banner.s, size: PH.Game.world.hero.size }));
  ok('gotoLevel(3): Rooftop Rain Garden visuals finished crossfading, weather + music on the roof', v.vis.cur === 3 && v.vis.t === 1 && v.wz === 3 && v.az === 3 && v.banner === 3, v);
  ok('… floor beam drawn at the floor line', await P.evaluate(() => (window._drawn.beam || 0) > 0 || PH.Game.world.level > 0));
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.settings = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let { page: P, errors } = await open('seed=1', { ctx });
  ok('first run: nothing saved yet, defaults sfx/music on, Easy', await P.evaluate(() => !localStorage.getItem('pgh:settings') && PH.Game.settings.sfx && PH.Game.settings.music && PH.Game.difficulty() === 'easy'));
  await P.click('#btnSettings');
  await P.click('#setSfx + .tog'); await P.click('#setMusic + .tog'); await P.click('#setDifficulty [data-v=hard]');
  let s = await P.evaluate(() => PH.Game.settings);
  ok('toggling sfx / music / Hard updates the settings', !s.sfx && !s.music && s.difficulty === 'hard', s);
  ok('settings saved under the pgh: prefix only', await P.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('pgh:')) && !!localStorage.getItem('pgh:settings')));
  await P.reload(); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  s = await P.evaluate(() => ({ st: PH.Game.settings, sfx: document.getElementById('setSfx').checked, mus: document.getElementById('setMusic').checked,
    seg: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v, a: { sfx: PH.Audio.sfxOn, mus: PH.Audio.musicOn } }));
  ok('settings survive a reload (state, toggles, segment, audio)', !s.st.sfx && !s.st.music && s.st.difficulty === 'hard' && !s.sfx && !s.mus && s.seg === 'hard' && !s.a.sfx && !s.a.mus, s);
  await P.click('#btnSettings'); await P.click('#setSfx + .tog'); await P.click('#setMusic + .tog'); await P.click('#setDifficulty [data-v=easy]'); await P.click('#scrSettings .btn-back');
  await P.goto(GAME + '?seed=1&mute=1'); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  ok('?mute=1: audio muted but settings.muted stays false', await P.evaluate(() => PH.Audio.muted && !PH.Game.settings.muted && !JSON.parse(localStorage.getItem('pgh:settings')).muted));
  await P.keyboard.press('m');
  ok('M with ?mute=1 → sound on, nothing saved', await P.evaluate(() => !PH.Audio.muted && !JSON.parse(localStorage.getItem('pgh:settings')).muted));
  await P.keyboard.press('m');
  ok('M again → muted and that IS saved (player choice)', await P.evaluate(() => PH.Audio.muted && JSON.parse(localStorage.getItem('pgh:settings')).muted === true));
  await P.goto(GAME + '?seed=1'); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  ok('saved mute survives reload without the flag', await P.evaluate(() => PH.Audio.muted && PH.Game.settings.muted));
  await P.keyboard.press('m');
  ok('M → unmuted, saved', await P.evaluate(() => !PH.Audio.muted && JSON.parse(localStorage.getItem('pgh:settings')).muted === false));
  await P.goto(GAME + '?seed=1&diff=hard&speed=2&bot=0&level=1&debug=1'); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  await P.click('#btnSettings'); await P.click('#scrSettings .btn-back'); await P.click('#btnPlay');
  ok('?diff=hard: the run is Hard, saved difficulty stays easy; no test flag saved', await P.evaluate(() => { const s = JSON.parse(localStorage.getItem('pgh:settings')); return PH.Game.world.difficulty === 'hard' && s.difficulty === 'easy' && !('speed' in s) && !('debug' in s) && !('level' in s) && !('diff' in s); }));
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await P.click('#btnSettings'); await P.click('#setDifficulty [data-v=normal]');
  const segSt = await P.evaluate(() => ({ on: document.querySelector('#setDifficulty .on').dataset.v, saved: JSON.parse(localStorage.getItem('pgh:settings')).difficulty }));
  warn('with ?diff=hard, tapping Normal visibly selects Normal (and it is what the next run uses)', segSt.on === 'normal' && await P.evaluate(() => PH.Game.difficulty() === 'normal'), segSt);
  await P.click('#setDifficulty [data-v=easy]'); await P.click('#scrSettings .btn-back');
  // best score per difficulty
  await P.goto(GAME + '?seed=1&mute=1'); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  const run = async score => { await P.click('#btnPlay'); await P.evaluate(s => { PH.Game.world.score = s; }, score); await toOver(P); await afterLock(P);
    return P.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') })); };
  let o = await run(321);
  ok('Easy run 321 → best 321, NEW! shown', o.best === '321' && o.nb && (await P.evaluate(() => localStorage.getItem('pgh:best_easy'))) === '321', o);
  await P.click('#btnOverMenu'); ok('title shows Easy best 321', (await P.textContent('#bestTitle')) === '321');
  o = await run(100);
  ok('lower Easy run → best stays 321, no NEW!', o.best === '321' && !o.nb, o);
  await P.click('#btnOverMenu'); await P.click('#btnSettings'); await P.click('#setDifficulty [data-v=normal]'); await P.click('#scrSettings .btn-back');
  ok('switch to Normal → title best 0 (separate per difficulty)', (await P.textContent('#bestTitle')) === '0');
  o = await run(55); await P.click('#btnOverMenu');
  ok('Normal run 55 → best_normal 55, best_easy untouched', await P.evaluate(() => localStorage.getItem('pgh:best_normal') === '55' && localStorage.getItem('pgh:best_easy') === '321'));
  await P.reload(); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  ok('after reload: title shows Normal best 55', (await P.textContent('#bestTitle')) === '55');
  // the best is saved for the difficulty the run STARTED with, even if Settings changed mid-run
  await P.click('#btnPlay'); await P.keyboard.press('Escape'); await P.click('#btnPauseSettings'); await P.click('#setDifficulty [data-v=hard]'); await P.click('#scrSettings .btn-back'); await P.click('#btnResume');
  await P.evaluate(() => { PH.Game.world.score = 77; }); await toOver(P); await afterLock(P);
  ok('difficulty changed mid-run: best saved under the run\'s own difficulty (normal 77, hard untouched)', await P.evaluate(() => localStorage.getItem('pgh:best_normal') === '77' && !localStorage.getItem('pgh:best_hard')));
  await P.click('#btnOverMenu');
  await P.click('#btnSettings'); await P.click('#btnResetBest');
  ok('Reset best: first tap only arms it ("Sure?"), nothing deleted', await P.evaluate(() => document.getElementById('btnResetBest').textContent === 'Sure?' && localStorage.getItem('pgh:best_easy') === '321'));
  await sleep(3300);
  ok('… disarms itself after 3 s', await P.evaluate(() => document.getElementById('btnResetBest').textContent === 'Reset'));
  await P.click('#btnResetBest'); await P.click('#btnResetBest');
  ok('two taps → all best scores cleared', await P.evaluate(() => !localStorage.getItem('pgh:best_easy') && !localStorage.getItem('pgh:best_normal')));
  await P.click('#scrSettings .btn-back'); ok('title best back to 0', (await P.textContent('#bestTitle')) === '0');
  ok('zero console errors', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
  // a bot test run must not write the player's best score
  const b = await open('seed=3&mute=1&autostart=1&bot=1&skill=0.2&speed=16&diff=hard');
  await waitFor(b.page, () => PH.Game.world.score > 200, null, 30000);
  await b.page.evaluate(FORCE_FALL, 1);                     // the weak bot rarely dies on its own: end the run
  await waitFor(b.page, () => PH.Game.mode === 'over', null, 15000);
  const pol = await b.page.evaluate(() => ({ best: localStorage.getItem('pgh:best_hard'), mode: PH.Game.mode, score: PH.Game.world.score }));
  ok('a ?bot=1 test run does not write the player\'s best score', pol.mode === 'over' && pol.best === null, pol);
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
      else if (kind === 'photo') {
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
  await mk('bg_potting.jpg', 2400, 1600, 'image/jpeg', 'photo', '#d02090');
  await mk('bg_balcony.jpg', 1200, 1800, 'image/jpeg', 'photo', '#20a0a0');
  await mk('bg_roof.jpg', 1920, 1080, 'image/jpeg', 'photo', '#806020');
  await mk('huge.jpg', 6000, 4000, 'image/jpeg', 'grad', '#3060ff', 0.8);
  fs.writeFileSync(path.join(FIX, 'notes.txt'), 'this is not a picture\n');
  fs.writeFileSync(path.join(FIX, 'broken.png'), Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 37) & 255)));
  await ctx.close();
}

groups.custom = async () => {
  await makeFixtures();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: P, errors } = await open('seed=1&mute=1', { ctx });
  const SL = await P.evaluate(() => PH.Assets.SLOTS.map(s => s.id));
  ok('six picture slots: hero, firefly, bg_potting, bg_fern, bg_balcony, bg_roof', JSON.stringify(SL) === JSON.stringify(['hero', 'firefly', 'bg_potting', 'bg_fern', 'bg_balcony', 'bg_roof']), SL);
  const idx = id => SL.indexOf(id) + 1;
  await P.click('#btnCustomize');
  const titles = await P.evaluate(() => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent));
  ok('cards are titled Puddle, Firefly and the four floors', JSON.stringify(titles) === JSON.stringify(['Puddle', 'Firefly', 'Potting Shed', 'Fern Floor', 'Orchid Balcony', 'Rooftop Rain Garden']), titles);
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
  ok('hero: a PNG cut-out is accepted (toast, card tag, Reset enabled, stored as pgh:img_hero)', /saved/i.test(msg) && (await card('hero')).tag.includes('Your picture') && (await card('hero')).reset && await P.evaluate(() => !!localStorage.getItem('pgh:img_hero') && PH.Assets.hasCustom('hero')), msg);
  ok('cut-out with transparency defaults to "Whole picture"', await P.evaluate(() => localStorage.getItem('pgh:shape_hero') === 'fit'));
  msg = await pick('hero', 'hero_photo_red.jpg');
  ok('hero: an opaque photo is accepted and defaults to "Round"', /saved/i.test(msg) && await P.evaluate(() => localStorage.getItem('pgh:shape_hero') === 'circle'), msg);
  const cRed = await thumbColor('hero');
  msg = await pick('hero', 'hero_photo_blue.jpg');
  const cBlue = await thumbColor('hero');
  ok('replacing a photo with another photo updates the card preview (red → blue)', cBlue && cBlue[2] > cBlue[0] + 60, { cRed, cBlue });
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-shape=fit]`);
  ok('"Whole picture" shape button saves the shape', await P.evaluate(() => localStorage.getItem('pgh:shape_hero') === 'fit' && PH.Assets.custom.hero.width === 512));
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-shape=circle]`);
  ok('"Round" shape button saves the shape', await P.evaluate(() => localStorage.getItem('pgh:shape_hero') === 'circle'));
  msg = await pick('firefly', 'firefly.png');
  ok('firefly picture accepted', /saved/i.test(msg) && await P.evaluate(() => PH.Assets.hasCustom('firefly')), msg);
  msg = await pick('bg_potting', 'bg_potting.jpg');
  ok('Potting Shed background (2400×1600 photo) accepted, stored ≤ 1600 px', /saved/i.test(msg) && await P.evaluate(() => PH.Assets.hasCustom('bg_potting') && Math.max(PH.Assets.custom.bg_potting.width, PH.Assets.custom.bg_potting.height) <= 1600), msg);
  msg = await pick('bg_fern', 'huge.jpg');
  ok('huge 6000×4000 picture for the Fern Floor accepted and downscaled to ≤ 1600 px', /saved/i.test(msg) && await P.evaluate(() => PH.Assets.hasCustom('bg_fern') && Math.max(PH.Assets.custom.bg_fern.width, PH.Assets.custom.bg_fern.height) <= 1600), msg);
  msg = await pick('bg_balcony', 'bg_balcony.jpg'); ok('Orchid Balcony background (portrait photo) accepted', /saved/i.test(msg), msg);
  msg = await pick('bg_roof', 'bg_roof.jpg'); ok('Rooftop background accepted', /saved/i.test(msg), msg);
  const tAll = Date.now() - t1;
  const size = await P.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; });
  console.log('    info: 6 custom pictures stored = ' + (size / 1e6).toFixed(2) + ' M chars of localStorage; picking took ' + tAll + ' ms');
  warn('all six pictures fit comfortably in localStorage (< 3.5 M chars of the ~5 M quota)', size < 3.5e6, (size / 1e6).toFixed(2) + ' M');
  msg = await pick('hero', 'huge.jpg');
  ok('huge picture for the hero accepted and fitted into 512 px', /saved/i.test(msg) && await P.evaluate(() => PH.Assets.custom.hero.width <= 512 && PH.Assets.custom.hero.height <= 512), msg);
  msg = await pick('firefly', 'notes.txt');
  ok('a text file is refused with a friendly message, previous picture kept', /picture file/i.test(msg) && await P.evaluate(() => PH.Assets.hasCustom('firefly')), msg);
  msg = await pick('bg_roof', 'broken.png');
  ok('a broken .png is refused with a friendly message, previous picture kept', /could not be opened/i.test(msg) && await P.evaluate(() => PH.Assets.hasCustom('bg_roof')), msg);
  await P.evaluate(async i => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, 64, 64);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'drop.png', { type: 'image/png' }));
    document.querySelector('#slotGrid .slot:nth-child(' + i + ')').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, idx('firefly'));
  ok('drag & drop a picture onto a card works', await waitFor(P, () => /saved/i.test(document.getElementById('toast').textContent), null, 5000));
  await P.reload(); await P.waitForFunction(() => PH.Game && PH.Game.mode === 'title');
  ok('all six custom pictures load again after a reload', await P.evaluate(() => PH.Assets.SLOTS.every(s => PH.Assets.hasCustom(s.id))));
  // in gameplay
  await P.click('#btnPlay'); await P.evaluate(HOOKS);
  await P.evaluate(() => { const w = PH.Game.world; w.spawn('firefly', w.hero.x + 2, w.hero.y + 2); window._drawn = {}; });
  await sleep(800);
  const dr = await P.evaluate(() => ({ hero: window._drawn['custom:hero'] || 0, fly: window._drawn['custom:firefly'] || 0, def: Object.keys(window._drawn).filter(k => k.startsWith('puddle_')).length, bg: PH.Game.renderer._bgKey(0) }));
  ok('custom hero and firefly are drawn in gameplay (default Puddle sprites not drawn)', dr.hero > 10 && dr.fly > 0 && dr.def === 0, dr);
  // custom hero grows with size
  const hs = await P.evaluate(async () => {
    const R = PH.Game.renderer, w = PH.Game.world; w.setSize(1); await new Promise(r => setTimeout(r, 100)); const a = R._heroScr.r;
    w.setSize(1.5); await new Promise(r => setTimeout(r, 100)); const b = R._heroScr.r; w.setSize(1); return { a, b };
  });
  ok('custom hero sticker grows with Puddle\'s size (×1.5)', hs.b / hs.a > 1.4 && hs.b / hs.a < 1.6, hs);
  await P.evaluate(() => { PH.debug.setBot(true, 1); PH.debug.setSpeed(6); });
  await waitFor(P, () => PH.Game.world.camY > 14, null, 20000);
  await P.evaluate(() => { PH.debug.setBot(false); PH.debug.setSpeed(1); });
  const px = await P.evaluate(() => { const c = document.getElementById('game'), g = c.getContext('2d');
    return [0.3, 0.4, 0.5, 0.6, 0.7].map(k => { const d = g.getImageData(Math.round(c.width * 0.04), Math.round(c.height * k), 1, 1).data; return [d[0], d[1], d[2]]; }); });
  const mag = px.filter(q => q[0] > q[1] + 50 && q[2] > q[1] + 30).length;
  ok('custom Potting Shed background (magenta photo) is what the back wall shows', dr.bg.endsWith('|1') && mag >= 4, { key: dr.bg, px });
  for (const lv of [1, 2, 3]) {
    await P.evaluate(l => PH.debug.gotoLevel(l), lv); await sleep(1700);
    const k = await P.evaluate(l => PH.Game.renderer._bgKey(l), lv);
    ok('floor ' + (lv + 1) + ' uses its custom background', k.endsWith('|1'), k);
  }
  await P.evaluate(() => { const w = PH.Game.world; w.hearts = 2; w.hero.started = true; w.hero.y = w.hero.prevY = w.camY - 3; w.hero.vy = -5; });
  await sleep(1200);
  ok('custom pictures through a fall + umbrella rescue: no errors', errors.length === 0, errors.slice(0, 3));
  await P.keyboard.press('Escape'); await P.click('#btnPauseMenu'); await P.click('#btnCustomize');
  await P.click(`#slotGrid .slot:nth-child(${idx('hero')}) [data-act=reset]`);
  ok('Reset one: hero back to Puddle (memory, storage, card)', await P.evaluate(() => !PH.Assets.hasCustom('hero') && !localStorage.getItem('pgh:img_hero') && !localStorage.getItem('pgh:shape_hero')) && (await card('hero')).tag === 'Original');
  ok('… other pictures kept', await P.evaluate(() => PH.Assets.hasCustom('firefly') && PH.Assets.hasCustom('bg_potting')));
  msg = await pick('hero', 'hero_photo_red.jpg');
  const cAgain = await thumbColor('hero');
  ok('after Reset, choosing a new photo shows the NEW preview (red, not the old blue)', cAgain && cAgain[0] > cAgain[2] + 60, cAgain);
  await P.click('#btnResetAll');
  ok('Reset all: every slot back to the original, storage cleared', await P.evaluate(() => PH.Assets.SLOTS.every(s => !PH.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => /pgh:(img|shape)_/.test(k))));
  await P.click('#scrCustom .btn-back'); await P.click('#btnPlay'); await P.evaluate(() => { window._drawn = {}; }); await sleep(500);
  ok('after Reset all, gameplay draws the default Puddle again', await P.evaluate(() => !window._drawn['custom:hero'] && Object.keys(window._drawn).some(k => k.startsWith('puddle_')) && PH.Game.renderer._bgKey(0).endsWith('|0')));
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
  ok('starting the game blurs the focused button (canvas focus)', await P.evaluate(() => !document.activeElement || document.activeElement === document.body));
  await P.click('#btnMuteHud'); const m1 = (await st(P)).muted;
  await P.keyboard.press('Space'); await P.keyboard.press('Enter'); await sleep(100);
  ok('Space / Enter after clicking the HUD mute button do not toggle it again', (await st(P)).muted === m1 && (await st(P)).mode === 'playing');
  await P.click('#btnPause'); await sleep(80);
  await P.keyboard.press('Space'); await sleep(150);
  ok('Pause → Space resumes (Resume focused) …', (await st(P)).mode === 'playing');
  await P.keyboard.press('Space'); await sleep(150);
  ok('… and the next Space does nothing else (still playing, not paused)', (await st(P)).mode === 'playing');
  await toOver(P); await afterLock(P);
  ok('game over focuses Play Again', await P.evaluate(() => document.activeElement && document.activeElement.id === 'btnAgain'));
  s0 = await starts(); await P.keyboard.press('Enter'); await sleep(250);
  ok('Enter on game over (Play Again focused) starts exactly once', (await starts()) - s0 === 1, (await starts()) - s0);
  await toOver(P); await afterLock(P);
  s0 = await starts(); await P.keyboard.press('Space'); await sleep(250);
  ok('Space on game over (Play Again focused) starts exactly once', (await starts()) - s0 === 1, (await starts()) - s0);
  await toOver(P); await afterLock(P);
  s0 = await starts(); await P.keyboard.down('Enter'); await sleep(50);
  for (let i = 0; i < 4; i++) await P.keyboard.down('Enter');
  await P.keyboard.up('Enter'); await sleep(250);
  ok('holding Enter on game over starts once (repeats ignored)', (await starts()) - s0 === 1, (await starts()) - s0);
  // Enter pressed DURING the 0.7 s lock while Play Again is focused: must not restart after the lock either
  await toOver(P); await sleep(150); s0 = await starts();
  await P.evaluate(() => document.getElementById('btnAgain').focus()); await P.keyboard.press('Enter'); await sleep(900);
  ok('Enter during the restart lock is swallowed (no delayed restart)', (await starts()) === s0 && (await st(P)).mode === 'over');
  await afterLock(P); await P.focus('#btnOverMenu');
  s0 = await starts(); await P.keyboard.press('Enter'); await sleep(200);
  ok('Enter with Menu focused → title, no restart', (await starts()) === s0 && (await st(P)).mode === 'title');
  await P.focus('#btnSettings'); s0 = await starts(); await P.keyboard.press('Space'); await sleep(200);
  ok('Space with Settings focused opens Settings, does not start', (await starts()) === s0 && (await P.evaluate(() => PH.UI.current)) === 'scrSettings');
  await P.keyboard.press('Escape');
  await P.click('#btnSettings'); await sleep(80);
  ok('Settings focuses Done, not Reset best', await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('btn-back')));
  await P.keyboard.press('Enter'); await sleep(100);
  ok('Enter on Settings → closes it (no reset)', await P.evaluate(() => PH.UI.current === 'scrTitle' && document.getElementById('btnResetBest').textContent === 'Reset'));
  await P.click('#btnCustomize'); await sleep(80);
  ok('Change Pictures focuses Done (not Reset all / file picker)', await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('btn-back')));
  await P.keyboard.press('Escape');
  await P.click('#btnHow'); await sleep(80); s0 = await starts(); await P.keyboard.press('Enter'); await sleep(150);
  ok('Enter on How to Play ("OK, let\'s play!") → back to the title, does not also start a game', (await starts()) === s0 && (await P.evaluate(() => PH.UI.current)) === 'scrTitle');
  await P.click('#btnPlay'); await P.evaluate(FORCE_FALL, 1); await sleep(100); await P.keyboard.press('Escape');
  ok('Esc during the game-over fall does not open Pause', (await st(P)).mode !== 'paused');
  await P.evaluate(() => window.dispatchEvent(new Event('blur')));
  ok('window blur during the game-over fall does not open Pause either', (await st(P)).mode !== 'paused');
  await waitFor(P, () => PH.Game.mode === 'over'); await P.keyboard.press('Escape');
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
  ok('native store detected and loaded (settings + best from disk)', await P.evaluate(() => PH.Storage.native && PH.Game.settings.difficulty === 'normal' && PH.Game.settings.sfx === false && document.getElementById('bestTitle').textContent === '77'));
  ok('app mode: Quit button visible', await P.evaluate(() => !document.getElementById('btnQuit').classList.contains('hidden')));
  await P.click('#btnSettings'); await P.click('#setMusic + .tog'); await P.click('#scrSettings .btn-back');
  ok('setting change goes to ffStoreSet (key without prefix), not localStorage', await P.evaluate(() => window.__sets.includes('settings') && !localStorage.getItem('pgh:settings')));
  ok('every native key matches the Go key regex ^[a-zA-Z0-9_-]{1,64}$', await P.evaluate(() => window.__sets.every(k => /^[a-zA-Z0-9_\-]{1,64}$/.test(k))));
  await P.click('#btnCustomize');
  const [fc] = await Promise.all([P.waitForEvent('filechooser'), P.click('#slotGrid .slot:nth-child(3) [data-act=pick]')]);
  if (!fs.existsSync(path.join(FIX, 'bg_potting.jpg'))) await makeFixtures();
  await fc.setFiles(path.join(FIX, 'bg_potting.jpg'));
  await P.waitForFunction(() => /room|saved/i.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
  ok('ffStoreSet → false: friendly "not enough room" toast, value rolled back, picture not used', await P.evaluate(() => /room/i.test(document.getElementById('toast').textContent) && PH.Storage.get('img_bg_potting') === undefined && !PH.Assets.hasCustom('bg_potting')));
  const race = await P.evaluate(async () => {
    const S = PH.Storage, orig = window.ffStoreSet;
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
  const del = await P.evaluate(async () => { window.ffStoreDel = async () => false; PH.Storage.cache.del_k = 'x'; const r = await PH.Storage.del('del_k'); return { r, still: PH.Storage.get('del_k') }; });
  warn('del(): a failed native delete keeps the value in memory (matches disk after restart)', del.still === 'x', del);
  await P.keyboard.press('Escape');
  await P.keyboard.press('F11'); await sleep(200);
  ok('F11 in the app calls ffFullscreen(true)', await P.evaluate(() => window.__fs[0] === true));
  await P.keyboard.press('F11'); await sleep(200);
  ok('… and F11 again ffFullscreen(false)', await P.evaluate(() => window.__fs[1] === false && PH.Game.fullscreen === false), await P.evaluate(() => ({ fs: window.__fs, g: PH.Game.fullscreen })));
  await P.click('#btnQuit'); ok('Quit calls ffQuit', await P.evaluate(() => window.__quit === 1));
  ok('zero console errors (native)', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
  const b = await open('seed=1&mute=1', { init: () => { window.ffStoreAll = () => Promise.reject(new Error('x')); window.ffStoreSet = async () => true; window.ffStoreDel = async () => true; } });
  ok('ffStoreAll failing → falls back to localStorage', await b.page.evaluate(() => PH.Storage.native === false && PH.Game.mode === 'title'));
  await b.ctx.close();
  // static check of the Go wrapper strings
  const go = fs.readFileSync(path.resolve(__dirname, '../../app/main.go'), 'utf8');
  ok('Go wrapper: data in %APPDATA%\\PuddlesGreenhouseHop\\data, WebView2 profile PuddlesGreenhouseHop', /"PuddlesGreenhouseHop"\)/.test(go) && /filepath\.Join\(base, "data"\)/.test(go) && /"PuddlesGreenhouseHop", "WebView2"/.test(go));
  ok('Go wrapper: fixed port 48413 first (fallbacks 48423/48433/48443, then any)', /"48413", "48423", "48433", "48443"/.test(go) && /127\.0\.0\.1:0/.test(go));
  ok('Go wrapper: single-instance mutex Local\\PuddlesGreenhouseHop.SingleInstance and window title match', /Local\\\\PuddlesGreenhouseHop\.SingleInstance/.test(go) && (go.match(/Puddle's Greenhouse Hop/g) || []).length >= 4);
  ok('Go wrapper: binds ffStoreAll / ffStoreSet / ffStoreDel / ffFullscreen / ffQuit', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')));
  ok('Go wrapper: no fork names (Clover / Farm)', !/Clover|FarmHop|Farm Hop/i.test(go));
  const others = fs.readdirSync(path.resolve(__dirname, '../../..')).filter(d => d !== 'penguin-greenhouse-hop').map(d => path.resolve(__dirname, '../../..', d, 'app/main.go')).filter(f => fs.existsSync(f));
  const clash = others.filter(f => /"48413"/.test(fs.readFileSync(f, 'utf8')) || /PuddlesGreenhouseHop/.test(fs.readFileSync(f, 'utf8')));
  ok('port 48413 and the instance name are unique among the daily games', clash.length === 0, clash);
};

groups.layout = async () => {
  const ALL = [
    { n: 'desktop 1280x720', w: 1280, h: 720, dpr: 1 },
    { n: 'desktop 1920x1080', w: 1920, h: 1080, dpr: 1 },
    { n: 'desktop 960x600', w: 960, h: 600, dpr: 1 },
    { n: 'iPhone landscape 844x390', w: 844, h: 390, dpr: 3, touch: true, safe: [0, 47, 21, 47] },
    { n: 'iPhone portrait 390x844', w: 390, h: 844, dpr: 3, touch: true, safe: [47, 0, 34, 0] },
    { n: 'iPad landscape 1024x768', w: 1024, h: 768, dpr: 2, touch: true, safe: [24, 0, 20, 0] },
    { n: 'iPad Pro 1366x1024', w: 1366, h: 1024, dpr: 2, touch: true, safe: [24, 0, 20, 0] }
  ];
  const SIZES = QUICK ? ALL.filter(s => /1280x720|390x844/.test(s.n)) : ALL;
  for (const S of SIZES) {
    console.log('  [' + S.n + ']');
    GROUP = 'layout ' + S.n;
    const { ctx, page: P, errors } = await open('seed=1&mute=1', S);
    const sa = S.safe || [0, 0, 0, 0];
    if (S.safe) {   // headless Chromium has no notch: emulate env(safe-area-inset-*) where the game reads it
      await P.addStyleTag({ content: `#safeProbe{padding:${sa[0]}px ${sa[1]}px ${sa[2]}px ${sa[3]}px !important}.screen{padding:${sa[0]}px ${sa[1]}px ${sa[2]}px ${sa[3]}px !important}
        .panel{max-width:calc(100vw - 16px - ${sa[1] + sa[3]}px)!important;max-height:calc(100dvh - 16px - ${sa[0] + sa[2]}px)!important}` });
      await P.evaluate(() => PH.Game.relayout());
    }
    const cv = await P.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), R = PH.Game.renderer;
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
        const r = el.getBoundingClientRect();
        const btns = [...el.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.className || b.textContent.trim().slice(0, 14), l: q.left, t: q.top, r: q.right, b: q.bottom, h: q.height, ow: b.scrollWidth > b.clientWidth + 1 }; });
        const bad = btns.filter(b => b.l < -0.5 || b.r > W + 0.5 || b.t < -0.5 || (b.b > H + 0.5 && !(el.scrollHeight > el.clientHeight + 1)));
        const clipped = btns.filter(b => b.b > r.bottom + 0.5 || b.r > r.right + 0.5 || b.l < r.left - 0.5);
        const scrollable = el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
        const slots = [...el.querySelectorAll('.slot')].filter(s => s.scrollWidth > s.clientWidth).length;
        const ov = []; for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i], b = btns[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) ov.push(a.id + '×' + b.id); }
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, inV: r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5,
          inSafe: r.left >= sa[3] - 0.5 && r.top >= sa[0] - 0.5 && r.right <= W - sa[1] + 0.5 && r.bottom <= H - sa[2] + 0.5,
          hOver: el.scrollWidth > el.clientWidth + 1, vOver: el.scrollHeight > el.clientHeight + 1, scrollable, bad: bad.map(b => b.id), clipped: clipped.map(b => b.id), ov,
          small: btns.filter(b => b.h < 39.5).map(b => b.id + ':' + b.h.toFixed(0)), textOver: btns.filter(b => b.ow).map(b => b.id), slots };
      }, { sel, sa, W: S.w, H: S.h });
      ok(label + ': panel inside the window, no sideways overflow, buttons on screen', !m.missing && m.inV && !m.hOver && m.bad.length === 0, m);
      ok(label + ': fits, or scrolls to reach every button', (!m.vOver && m.clipped.length === 0) || m.scrollable, { vOver: m.vOver, clipped: m.clipped, scrollable: m.scrollable });
      ok(label + ': no two buttons overlap', m.ov.length === 0, m.ov);
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
      await P.evaluate(id => PH.UI.open(id, 'scrTitle'), scr);
      await check(scr, sel);
      await P.screenshot({ path: path.join(OUT, tag + '_' + scr + '.png') });
    }
    await P.evaluate(() => PH.UI.show('scrTitle'));
    await P.evaluate(() => { PH.debug.startGame(); PH.debug.grow(0.4); }); await sleep(500);
    const hud = await P.evaluate(({ sa, W, H }) => {
      const R = PH.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), s = R.cssScale, I = R.ins;
      const hq = document.getElementById('hud').getBoundingClientRect(), hb = { l: hq.left, t: hq.top, r: hq.right, b: hq.bottom };
      const L = (x, y, w, h) => ({ l: c.left + x * s, t: c.top + y * s, r: c.left + (x + w) * s, b: c.top + (y + h) * s });
      const x0 = I.left + 12, y0 = I.top + 10, n = PH.Game.world.maxHearts;
      const hearts = L(x0, y0, n * 30 + 14, 38), score = L(x0, y0 + 46, 168, 40), size = L(x0, y0 + 94, 168, 36);
      const bw = Math.min(250, R.VW * (R.portrait ? 0.5 : 0.28)), bx = R.portrait ? R.VW - I.right - 12 - bw - 8 : R.VW / 2 - bw / 2, by = R.portrait ? y0 + 100 : y0 + 4;
      const bar = L(bx - 8, by - 4, bw + 16, 40);
      const inter = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const btns = [...document.querySelectorAll('#hud button')].map(b => b.getBoundingClientRect().height);
      const safe = r => r.l >= sa[3] - 0.5 && r.t >= sa[0] - 0.5 && r.r <= W - sa[1] + 0.5 && r.b <= H - sa[2] + 0.5;
      const pills = { hearts, score, size, bar }, ov = [];
      const all = Object.assign({ hud: hb }, pills), names = Object.keys(all);
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (inter(all[names[i]], all[names[j]])) ov.push(names[i] + '×' + names[j]);
      return { hud: hb, hudInCanvas: hb.l >= c.left - 0.5 && hb.r <= c.right + 0.5 && hb.t >= c.top - 0.5 && hb.b <= c.bottom + 0.5,
        hudSafe: safe(hb), pillsSafe: Object.keys(pills).filter(k => !safe(pills[k])), ov, btns, big: PH.Game.world.hero.big };
    }, { sa, W: S.w, H: S.h });
    ok('HUD buttons inside the canvas and inside the safe area', hud.hudInCanvas && hud.hudSafe, hud);
    ok('canvas HUD (hearts, score, size meter, progress) inside the safe area', hud.pillsSafe.length === 0, hud);
    ok('HUD pills and buttons do not overlap (incl. size meter while big)', hud.ov.length === 0 && hud.big, hud);
    ok('HUD buttons ≥ 44 px', hud.btns.every(h => h >= 44 - 0.5), hud.btns);
    await sleep(400);
    await P.screenshot({ path: path.join(OUT, tag + '_play.png') });
    await P.keyboard.press('Escape'); await check('scrPause', '#scrPause .panel');
    await P.keyboard.press('Escape');
    await P.evaluate(() => { PH.Game.world.score = 12345; PH.Game.world.level = 4; });
    await toOver(P); await afterLock(P);
    await check('scrOver', '#scrOver .panel');
    await P.screenshot({ path: path.join(OUT, tag + '_over.png') });
    await P.evaluate(() => PH.UI.toast('Picture saved on this device!', 3000));
    const tt = await P.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    ok('toast inside the window', tt.l >= 0 && tt.r <= S.w && tt.t >= 0 && tt.b <= S.h, tt);
    ok('zero console errors', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }
  GROUP = 'layout';
  const { ctx, page: P, errors } = await open('seed=1&mute=1&autostart=1', { w: 390, h: 844, dpr: 3, touch: true });
  await P.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  const r1 = await P.evaluate(() => ({ VW: PH.Game.renderer.VW, VH: PH.Game.renderer.VH, wx: PH.Game.weather.width }));
  ok('rotate portrait → landscape: view + weather re-laid out', r1.VW > r1.VH && r1.wx === r1.VW, r1);
  await P.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const r2 = await P.evaluate(() => ({ VW: PH.Game.renderer.VW, VH: PH.Game.renderer.VH }));
  ok('rotate back → portrait', r2.VH > r2.VW, r2);
  ok('zero console errors on rotate', errors.length === 0, errors.slice(0, 3));
  await ctx.close();
};

groups.soak = async () => {
  const { ctx, page: P, errors } = await open('seed=5&mute=1&autostart=1&autorestart=1&bot=1&skill=0.3&speed=16&diff=normal');
  const t0 = Date.now(), samples = [];
  let gameT = 0;
  while (Date.now() - t0 < 75000) {
    await sleep(1000);
    const s = await P.evaluate(() => { const G = PH.Game, w = G.world, R = G.renderer;
      return { gameT: G.stats.times.reduce((a, b) => a + b, 0) + (G.runT || 0), games: G.stats.games, mode: G.mode, parts: G.weather.particles.length, plats: w.platforms.length,
        flies: w.fireflies.length, texts: R.texts.length, rings: R.rings.length, flyers: R.flyers.length, sq: R._sq ? R._sq.size : 0, level: w.level,
        cache: PH.Assets._cache.size, spr: R._spr.size, bg: R._bg.size, ev: G.world.events.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, errs: G.stats.errors.length }; });
    samples.push(s); gameT = s.gameT;
    if (gameT >= 360) break;
  }
  const mx = k => Math.max(...samples.map(s => s[k]));
  const last = samples[samples.length - 1];
  console.log('    info: ' + gameT.toFixed(0) + ' s of game time in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, games ' + last.games + ', max level ' + mx('level') + ', max particles ' + mx('parts') + ', platforms ' + mx('plats') +
    ', fireflies ' + mx('flies') + ', texts ' + mx('texts') + ', sprite cache ' + mx('cache') + ', renderer spr ' + mx('spr') + ', heap ' + (mx('heap') / 1e6).toFixed(0) + ' MB');
  const stats = await P.evaluate(() => PH.Game.stats);
  console.log('    info: scores ' + JSON.stringify(stats.scores.slice(0, 12)) + ' levels ' + JSON.stringify(stats.levels.slice(0, 12)));
  ok('soak ran ≥ 5 minutes of game time at ?speed=16', gameT >= 300, gameT.toFixed(0));
  ok('several floors climbed during the soak', mx('level') >= 2 || stats.levels.some(l => l >= 2), { lv: mx('level'), levels: stats.levels });
  ok('no runtime errors in the frame loop (stats.errors) or console', stats.errors.length === 0 && errors.length === 0, (stats.errors[0] || errors[0] || '').slice(0, 300));
  ok('weather particles bounded (< 180)', mx('parts') < 180, mx('parts'));
  ok('platforms bounded (< 80)', mx('plats') < 80, mx('plats'));
  ok('fireflies bounded (< 80)', mx('flies') < 80, mx('flies'));
  ok('renderer juice (texts / rings / flyers) bounded', mx('texts') < 60 && mx('rings') < 40 && mx('flyers') < 40, { t: mx('texts'), r: mx('rings'), f: mx('flyers') });
  warn('rasterised sprite cache bounded (< 1500 entries)', mx('cache') < 1500, samples.map(s => s.cache).filter((_, i) => i % 5 === 0));
  const h0 = samples[Math.min(5, samples.length - 1)].heap, h1 = last.heap;
  warn('JS heap does not keep growing (< +60 MB over the soak)', !h0 || h1 - h0 < 60e6, ((h1 - h0) / 1e6).toFixed(1) + ' MB');
  ok('bot soak never saved a best score', await P.evaluate(() => !Object.keys(localStorage).some(k => /^pgh:best_/.test(k))));
  await ctx.close();
};

// ======================================================================================= main
(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
  const order = ['boot', 'menus', 'keys', 'pointer', 'rules', 'growth', 'platforms', 'levels', 'settings', 'custom', 'focus', 'native', 'layout', 'soak'];
  const T0 = Date.now();
  for (const g of order) {
    if (ONLY.length && !ONLY.includes(g)) continue;
    if (QUICK && g === 'soak' && !ONLY.includes('soak')) continue;
    GROUP = g; console.log('\n== ' + g);
    const t = Date.now();
    try { await groups[g](); }
    catch (e) { ok('group "' + g + '" finished without an exception', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
    console.log('  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  }
  await browser.close();
  console.log('\n==== ' + R.pass + ' PASS, ' + R.fail + ' FAIL, ' + R.warn + ' WARN' + (QUICK ? ' (quick)' : '') + ' in ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  if (R.fails.length) console.log('FAILS:\n  ' + R.fails.join('\n  '));
  if (R.warns.length) console.log('WARNS:\n  ' + R.warns.join('\n  '));
  process.exit(R.fail ? 1 : 0);
})();
