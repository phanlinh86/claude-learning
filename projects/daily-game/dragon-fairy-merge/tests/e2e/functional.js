// Functional QA for Mossy's Egg Grove. PASS/FAIL per check; exits non-zero if any check fails.
//   node tests/e2e/functional.js            (all sections, 60 s bot soak at ×16)
//   node tests/e2e/functional.js --quick    (15 s soak, fewer layouts)
// Serves game/ over a tiny local http server and drives it with Chromium. MEG.debug (DESIGN §6) is used to read state
// and to set up rule scenarios; inputs (mouse, touch, keyboard, file picker) go through real browser events.
const { chromium } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const SOAK_S = QUICK ? 15 : 60;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
let BASE = '';

const results = [], notes = [];
let curSection = '?';
function check(section, name, ok, detail) {
  results.push({ section, name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + section + ' — ' + name + (detail != null && detail !== '' ? '  [' + detail + ']' : ''));
}
function note(s) { notes.push(s); console.log('NOTE ' + s); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
const live = [];
async function sec(name, fn) {
  curSection = name;
  try { await fn(); }
  catch (e) { check(curSection, 'section crashed: ' + String(e && e.message || e).split('\n')[0], false); }
  while (live.length) { try { await live.pop().close(); } catch (_) {} }
}
async function newCtx(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  live.push(ctx); return ctx;
}
async function openIn(ctx, query, label = 'page') {
  const p = await ctx.newPage();
  p._errs = []; p._warns = [];
  p.on('console', m => { if (m.type() === 'error') p._errs.push(label + ': ' + m.text()); if (m.type() === 'warning') p._warns.push(label + ': ' + m.text()); });
  p.on('pageerror', e => p._errs.push(label + ' pageerror: ' + e));
  p.on('requestfailed', r => p._errs.push(label + ' requestfailed: ' + r.url()));
  await p.goto(BASE + (query || ''));
  await ready(p);
  await p.evaluate(HELPERS);
  return p;
}
const ready = p => p.waitForFunction(() => window.MEG && MEG.debug && MEG.debug.mode && MEG.debug.mode !== 'boot', null, { timeout: 20000 });
async function open(query, opts = {}, label = 'page') { const ctx = await newCtx(opts); const p = await openIn(ctx, query, label); return { ctx, p }; }
async function reload(p) { await p.reload(); await ready(p); await p.evaluate(HELPERS); }
const mode = p => p.evaluate(() => MEG.debug.mode);
const ui = p => p.evaluate(() => MEG.UI.current);
const W = (p, fn, arg) => p.evaluate(fn, arg);
async function waitMode(p, m, t = 8000) { try { await p.waitForFunction(m => MEG.debug.mode === m, m, { timeout: t }); return true; } catch (_) { return false; } }
async function pageErrs(p, section) {
  const st = await p.evaluate(() => MEG.debug.stats.errors.slice()).catch(() => []);
  const all = p._errs.concat(st);
  check(section, 'no console / page / frame errors', all.length === 0, all.slice(0, 3).join(' | '));
}
// css px of a world point (u) on the current layout
const cssAt = (p, x, y) => p.evaluate(([x, y]) => {
  const R = MEG.Game.renderer, r = R.canvas.getBoundingClientRect();
  return { x: r.left + R.sx(x) / R.VW * r.width, y: r.top + R.sy(y) / R.VH * r.height };
}, [x, y]);

// in-page helpers: freeze the frame loop and run world sub-steps synchronously so frames cannot interleave
const HELPERS = () => {
  const G = MEG.Game, C = MEG.World.CONFIG;
  window._h = {
    freeze() { MEG.debug.setSpeed(0); },
    run(sec, each) { const w = G.world, ev = []; const n = Math.round(sec / C.STEP); for (let i = 0; i < n; i++) { if (each) each(w); w.update(C.STEP); ev.push(...w.drainEvents()); } G.handleEvents(ev); return ev; },
    // fresh frozen game with an empty nest and calm wind
    fresh() { G.startGame(); this.freeze(); const w = G.world; w.eggs = []; w.setWind(0, null, 999); w.drainEvents(); return w; },
    types(ev) { return ev.map(e => e.type); },
    // an egg held above the vine (a pile that will not come down) until something happens
    pin(w, e) { return () => { if (!w.eggs.includes(e)) return; e.x = 4.5; e.y = 10.4; e.vx = e.vy = 0; e.falling = false; e.age = Math.max(e.age, 2); }; },
    // end the run quickly through the real path (world gameOver event → 1.6 s → Game.gameOver)
    forceOver(score) { const w = G.world; w.score = score; w.phase = 'over'; w.canDrop = false; w._emit('gameOver', { score }); }
  };
};

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  browser = await chromium.launch();
  const T0 = Date.now();

  // ───────────────────────────── 1. boot ─────────────────────────────
  await sec('boot', async () => {
    const S = 'boot';
    const { p } = await open('?mute=1&seed=7', {}, 'boot');
    check(S, 'reaches the title screen', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    await sleep(2000);
    const st = await W(p, () => ({ t: MEG.debug.world.time, hud: document.getElementById('hud').classList.contains('hidden'), title: document.title }));
    check(S, 'title bot demo runs behind the menu', st.t > 1, 't=' + st.t.toFixed(2));
    check(S, 'HUD hidden on the title', st.hud);
    check(S, 'page title is "Mossy\'s Egg Grove"', st.title === "Mossy's Egg Grove", st.title);
    const missing = p._warns.filter(w => /missing|failed/i.test(w));
    check(S, 'no missing-asset warnings', missing.length === 0, missing.join(' | '));
    const imgs = await W(p, () => Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')));
    check(S, 'all menu <img> load', imgs.length === 0, imgs.join(','));
    check(S, 'Play button has keyboard focus', (await W(p, () => document.activeElement && document.activeElement.id)) === 'btnPlay');
    const gs = await W(p, () => { const s = MEG.debug.getState(); return { eggs: Array.isArray(s.eggs), m: !!s.mossy, wind: !!s.wind, keys: ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'moveTo', 'drop', 'spawnEgg', 'setWind'].filter(k => !(k in MEG.debug)) }; });
    check(S, 'MEG.debug exposes every DESIGN §6 hook; getState has eggs/mossy/wind', gs.eggs && gs.m && gs.wind && gs.keys.length === 0, JSON.stringify(gs));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 2. menus + Esc/back ─────────────────────────────
  await sec('menus', async () => {
    const S = 'menus';
    const { p } = await open('?mute=1&seed=7', {}, 'menus');
    await sleep(300);
    for (const [btn, scr, back] of [['#btnHow', 'scrHow', 'OK'], ['#btnSettings', 'scrSettings', 'Done'], ['#btnCustomize', 'scrCustom', 'Done']]) {
      await p.click(btn); check(S, scr + ' opens', (await ui(p)) === scr);
      await p.keyboard.press('Escape'); check(S, 'Esc on ' + scr + ' → title', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');
      await p.click(btn); await p.click('#' + scr + ' .btn-back'); check(S, scr + ' "' + back + '" → title', (await ui(p)) === 'scrTitle');
    }
    await p.click('#btnPlay'); check(S, 'Play starts a game, HUD shown', (await mode(p)) === 'playing' && !(await W(p, () => document.getElementById('hud').classList.contains('hidden'))));
    await p.keyboard.press('Escape'); check(S, 'Esc while playing → Pause', (await mode(p)) === 'paused' && (await ui(p)) === 'scrPause');
    await p.keyboard.press('Escape'); check(S, 'Esc on Pause → resume', (await mode(p)) === 'playing' && (await ui(p)) === null);
    await p.keyboard.press('KeyP'); check(S, 'P pauses', (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); check(S, 'Pause → Settings', (await ui(p)) === 'scrSettings');
    await p.keyboard.press('Escape'); check(S, 'Esc on Settings → back to Pause (not resume)', (await ui(p)) === 'scrPause' && (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); await p.click('#scrSettings .btn-back'); check(S, 'Settings Done → Pause', (await ui(p)) === 'scrPause');
    await p.click('#btnResume'); check(S, 'Resume button resumes', (await mode(p)) === 'playing');
    await p.click('#btnPause'); check(S, 'HUD pause button pauses', (await mode(p)) === 'paused');
    await p.click('#btnRestart'); check(S, 'Restart starts a fresh game', (await mode(p)) === 'playing' && (await W(p, () => MEG.debug.world.drops)) === 0);
    await p.click('#btnPause'); await p.click('#btnPauseMenu'); check(S, 'Main Menu → title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    // game over panel
    await p.click('#btnPlay'); await W(p, () => _h.forceOver(12));
    check(S, 'game over screen appears after the world ends', await waitMode(p, 'over', 5000) && (await ui(p)) === 'scrOver');
    const ov = await W(p, () => ({ s: document.getElementById('overScore').textContent, st: document.getElementById('overStats').textContent }));
    check(S, 'game over shows score and stats', ov.s === '12' && /Biggest egg/.test(ov.st), JSON.stringify(ov));
    await sleep(800);
    await p.click('#btnOverMenu'); check(S, 'Game over → Menu → title', (await mode(p)) === 'title');
    await p.click('#btnPlay'); await W(p, () => _h.forceOver(5)); await waitMode(p, 'over'); await sleep(800);
    await p.click('#btnAgain'); check(S, 'Play Again starts a new game', (await mode(p)) === 'playing');
    await pageErrs(p, S);
  });

  // ───────────────────────────── 3. desktop inputs ─────────────────────────────
  await sec('input-desktop', async () => {
    const S = 'input-desktop';
    const { p } = await open('?mute=1&seed=7&autostart=1&diff=normal', { viewport: { width: 960, height: 540 } }, 'desk');
    await sleep(700);
    await W(p, () => { MEG.debug.world.setWind(0, null, 999); });
    const a = await cssAt(p, 2, 13), b = await cssAt(p, 7, 13);
    await p.mouse.move(a.x, a.y); await sleep(700);
    const m1 = await W(p, () => ({ tx: MEG.debug.world.mossy.tx, x: MEG.debug.world.mossy.x, d: MEG.debug.world.drops }));
    check(S, 'mouse hover moves Mossy (no button pressed)', Math.abs(m1.tx - 2) < 0.6 && Math.abs(m1.x - 2) < 0.8 && m1.d === 0, JSON.stringify(m1));
    await p.mouse.move(b.x, b.y); await sleep(600);
    await p.mouse.click(b.x, b.y); await sleep(150);   // the drop fires once Mossy has arrived (playtest R4: pendingDrop)
    const m2 = await W(p, () => { const w = MEG.debug.world, e = w.eggs[w.eggs.length - 1]; return { d: w.drops, x: e && e.x }; });
    check(S, 'mouse click drops one egg where Mossy is', m2.d === 1 && Math.abs(m2.x - 7) < 1, JSON.stringify(m2));
    await p.mouse.click(b.x, b.y); await sleep(150);
    check(S, 'a second click during the cooldown does not drop', (await W(p, () => MEG.debug.world.drops)) === 1);
    await sleep(800);
    // HUD buttons do not drop
    await p.click('#btnPause');
    check(S, 'clicking Pause pauses without dropping', (await mode(p)) === 'paused' && (await W(p, () => MEG.debug.world.drops)) === 1);
    await p.click('#btnResume'); await sleep(200);
    const pb = await center(p, '#btnPause');
    await W(p, () => { window._pd = 0; document.getElementById('btnPause').addEventListener('pointerdown', () => window._pd++); });
    await p.mouse.move(pb.x, pb.y); await p.mouse.down(); await sleep(100);
    const pd = await W(p, () => ({ d: MEG.debug.world.drops, drag: !!MEG.Game.drag, pd: window._pd }));
    await p.mouse.up(); await sleep(100);
    check(S, 'pointerdown on the pause button: no drag, no drop', pd.pd === 1 && !pd.drag && pd.d === 1, JSON.stringify(pd));
    if ((await mode(p)) === 'paused') await p.click('#btnResume');
    await sleep(300);
    const mb = await center(p, '#btnMuteHud');
    await p.mouse.click(mb.x, mb.y);
    check(S, 'clicking the sound button does not drop', (await W(p, () => MEG.debug.world.drops)) === 1 && (await mode(p)) === 'playing');
    await p.mouse.click(mb.x, mb.y);
    // keyboard
    await sleep(700);
    // Mossy eases after his target (critically damped), so judge the target tx that the keys move
    await W(p, () => MEG.debug.moveTo(4.5)); await sleep(600);
    const x0 = await W(p, () => MEG.debug.world.mossy.tx);
    await p.keyboard.down('ArrowLeft'); await sleep(350); await p.keyboard.up('ArrowLeft');
    const x1 = await W(p, () => MEG.debug.world.mossy.tx);
    check(S, '← moves Mossy left', x1 < x0 - 0.5, x0.toFixed(2) + ' → ' + x1.toFixed(2));
    await p.keyboard.down('ArrowRight'); await sleep(350); await p.keyboard.up('ArrowRight');
    const x2 = await W(p, () => MEG.debug.world.mossy.tx);
    await sleep(700);
    const xm = await W(p, () => MEG.debug.world.mossy);
    check(S, 'Mossy follows his target after the key is released', Math.abs(xm.x - xm.tx) < 0.1, JSON.stringify({ x: xm.x, tx: xm.tx }));
    check(S, '→ moves Mossy right', x2 > x1 + 0.5, x1.toFixed(2) + ' → ' + x2.toFixed(2));
    let n = await W(p, () => MEG.debug.world.drops);
    for (const k of ['Space', 'ArrowDown', 'Enter']) {
      await p.waitForFunction(() => MEG.debug.world.canDrop, null, { timeout: 3000 });
      await p.keyboard.press(k);
      const d = await W(p, () => MEG.debug.world.drops);
      check(S, k + ' drops an egg', d === n + 1, n + ' → ' + d); n = d;
    }
    // held key repeat does not machine-gun
    await p.waitForFunction(() => MEG.debug.world.canDrop, null, { timeout: 3000 });
    await p.keyboard.down('Space'); await sleep(1500); await p.keyboard.up('Space');
    const dr = await W(p, () => MEG.debug.world.drops);
    check(S, 'holding Space drops only once (no auto-repeat)', dr === n + 1, n + ' → ' + dr);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 4. start / restart guards ─────────────────────────────
  await sec('start-guards', async () => {
    const S = 'start-guards';
    const { p } = await open('?mute=1&seed=7&diff=hard', {}, 'guards');
    await sleep(400);
    await W(p, () => { const G = MEG.Game, o = G.startGame; window._starts = 0; G.startGame = function () { window._starts++; return o.apply(this, arguments); }; });
    check(S, 'Play is focused on the title', (await W(p, () => document.activeElement.id)) === 'btnPlay');
    await p.keyboard.press('Space'); await sleep(400);
    check(S, 'focused Play + Space starts exactly one game', (await W(p, () => window._starts)) === 1 && (await mode(p)) === 'playing', 'starts=' + (await W(p, () => window._starts)));
    check(S, 'no egg dropped by that Space', (await W(p, () => MEG.debug.world.drops)) === 0);
    await p.keyboard.press('Escape'); await sleep(100);
    await W(p, () => MEG.UI.back && null);
    await p.keyboard.press('Escape');
    await W(p, () => { window._starts = 0; MEG.Game.toTitle(); }); await sleep(200);
    await p.focus('#btnPlay'); await p.keyboard.press('Enter'); await sleep(400);
    check(S, 'focused Play + Enter starts exactly one game', (await W(p, () => window._starts)) === 1, 'starts=' + (await W(p, () => window._starts)));
    // focused Settings + Space opens settings, not a game
    await W(p, () => { window._starts = 0; MEG.Game.toTitle(); }); await sleep(200);
    await p.focus('#btnSettings'); await p.keyboard.press('Space'); await sleep(300);
    check(S, 'focused Settings + Space opens Settings, no game', (await ui(p)) === 'scrSettings' && (await W(p, () => window._starts)) === 0);
    await p.keyboard.press('Escape');
    // restart lock after game over
    await W(p, () => { window._starts = 0; MEG.Game.startGame(); window._starts = 0; });
    await W(p, () => _h.forceOver(3));
    await waitMode(p, 'over', 5000);
    await p.keyboard.press('Enter');
    const early = await W(p, () => ({ m: MEG.debug.mode, s: window._starts, dt: performance.now() - MEG.Game.overAt }));
    check(S, 'Enter within 0.7 s of game over is ignored', early.m === 'over' && early.s === 0, JSON.stringify(early));
    await p.click('#btnAgain', { force: true });
    const early2 = await W(p, () => ({ m: MEG.debug.mode, dt: performance.now() - MEG.Game.overAt }));
    check(S, 'Play Again click within 0.7 s is ignored', early2.m === 'over' || early2.dt > 700, JSON.stringify(early2));
    await sleep(800);
    if ((await mode(p)) === 'over') { await p.keyboard.press('Enter'); await sleep(200); }
    check(S, 'Enter after 0.7 s plays again (one start)', (await mode(p)) === 'playing' && (await W(p, () => window._starts)) === 1, 'starts=' + (await W(p, () => window._starts)));
    // focused Menu button + Enter on game over goes to the menu, not play again
    await W(p, () => _h.forceOver(3)); await waitMode(p, 'over'); await sleep(800);
    await W(p, () => { window._starts = 0; });
    await p.focus('#btnOverMenu'); await p.keyboard.press('Enter'); await sleep(200);
    check(S, 'focused Menu + Enter on game over → title, no restart', (await mode(p)) === 'title' && (await W(p, () => window._starts)) === 0);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 5. touch input ─────────────────────────────
  await sec('input-touch', async () => {
    const S = 'input-touch';
    const ctx = await newCtx({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await openIn(ctx, '?mute=1&seed=7&autostart=1&diff=normal', 'touch');
    await sleep(700);
    check(S, 'touch device detected (pointer:coarse)', await W(p, () => MEG.Game.isTouch && document.body.classList.contains('touch')));
    await W(p, () => MEG.debug.world.setWind(0, null, 999));
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const a = await cssAt(p, 2, 6), b = await cssAt(p, 7, 6);
    await touch('touchStart', a.x, a.y); await sleep(200);
    const s1 = await W(p, () => ({ tx: MEG.debug.world.mossy.tx, d: MEG.debug.world.drops }));
    check(S, 'touch press moves Mossy there, no drop yet', Math.abs(s1.tx - 2) < 0.6 && s1.d === 0, JSON.stringify(s1));
    for (let i = 1; i <= 10; i++) { await touch('touchMove', a.x + (b.x - a.x) * i / 10, a.y); await sleep(30); }
    const s2 = await W(p, () => ({ tx: MEG.debug.world.mossy.tx, d: MEG.debug.world.drops }));
    check(S, 'touch slide moves Mossy, still no drop', Math.abs(s2.tx - 7) < 0.6 && s2.d === 0, JSON.stringify(s2));
    await sleep(500);
    await touch('touchEnd', b.x, b.y); await sleep(100);
    const s3 = await W(p, () => { const w = MEG.debug.world, e = w.eggs[w.eggs.length - 1]; return { d: w.drops, x: e && e.x }; });
    check(S, 'release drops the egg under the finger', s3.d === 1 && Math.abs(s3.x - 7) < 1.2, JSON.stringify(s3));
    await sleep(900);
    // tap on the pause button: pause, no drop
    const pb = await center(p, '#btnPause');
    await touch('touchStart', pb.x, pb.y); await sleep(60); await touch('touchEnd', pb.x, pb.y); await sleep(300);
    check(S, 'tapping Pause pauses, no drop', (await mode(p)) === 'paused' && (await W(p, () => MEG.debug.world.drops)) === 1);
    const rb = await center(p, '#btnResume');
    await touch('touchStart', rb.x, rb.y); await sleep(60); await touch('touchEnd', rb.x, rb.y); await sleep(700);
    check(S, 'tapping Resume resumes without a ghost drop', (await mode(p)) === 'playing' && (await W(p, () => MEG.debug.world.drops)) === 1);
    // a second finger on Pause while steering with one thumb
    await sleep(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    await sleep(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }, { x: pb.x, y: pb.y, id: 2 }] });
    await sleep(60);
    // lift the Pause finger (id 2) first (Chromium's CDP releases the points listed in a touchEnd)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: pb.x, y: pb.y, id: 2 }] });
    await sleep(200);
    const two = await W(p, () => ({ m: MEG.debug.mode, d: MEG.debug.world.drops }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
    const two2 = await W(p, () => ({ m: MEG.debug.mode, d: MEG.debug.world.drops }));
    check(S, 'second finger on Pause while steering pauses; the steering finger does not drop after pause', two.m === 'paused' && two2.d === 1, JSON.stringify([two, two2]));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 6. rules via MEG.debug ─────────────────────────────
  await sec('rules', async () => {
    const S = 'rules';
    const { p } = await open('?mute=1&seed=7&diff=normal', {}, 'rules');
    // merge
    const mg = await W(p, () => {
      const w = _h.fresh(), s0 = w.score;
      w.spawnEgg(1, 4, 0.5); w.spawnEgg(1, 5, 0.5);
      const ev = _h.run(0.3);
      return { ds: w.score - s0, kinds: w.eggs.map(e => e.kind), ev: _h.types(ev).filter(t => t === 'merge').length };
    });
    check(S, 'two touching Dewdrop eggs merge into one Sky egg', mg.ev === 1 && JSON.stringify(mg.kinds) === '[2]', JSON.stringify(mg));
    check(S, 'merge scores +3', mg.ds === 3, 'Δ=' + mg.ds);
    const ch = await W(p, () => {
      const w = _h.fresh(), s0 = w.score;
      w.spawnEgg(1, 1, 0.5); w.spawnEgg(1, 2, 0.5);
      const ev = _h.run(0.1); const m = w.eggs[0];
      w.spawnEgg(2, m.x + m.r + 0.66, 0.66);
      ev.push(..._h.run(1));
      return { ds: w.score - s0, kinds: w.eggs.map(e => e.kind), combo: ev.filter(e => e.type === 'combo').map(e => e.n), merges: ev.filter(e => e.type === 'merge').length };
    });
    check(S, 'chain merge 1+1 → 2, 2+2 → 3 gives combo (3 + 6 + 1)', ch.merges === 2 && ch.ds === 10 && JSON.stringify(ch.kinds) === '[3]', JSON.stringify(ch));
    // hatch
    const ht = await W(p, () => {
      const w = _h.fresh(), s0 = w.score;
      w.spawnEgg(8, 2.1, 2.1); w.spawnEgg(8, 6.3, 2.1);
      const ev = _h.run(0.3);
      return { ds: w.score - s0, n: w.eggs.length, hatch: ev.filter(e => e.type === 'hatch').length, h: w.stats.hatches };
    });
    check(S, 'two Golden Dragon eggs hatch: +100, both removed', ht.hatch === 1 && ht.ds === 100 && ht.n === 0 && ht.h === 1, JSON.stringify(ht));
    // different kinds do not merge
    const nm = await W(p, () => { const w = _h.fresh(); w.spawnEgg(1, 4, 0.5); w.spawnEgg(2, 5.16, 0.66); _h.run(1); return w.eggs.map(e => e.kind).sort().join(); });
    check(S, 'different kinds never merge', nm === '1,2', nm);
    // wind: falling egg path bends, resting eggs stay
    const wd = await W(p, () => {
      const fall = dir => { const w = _h.fresh(); w.setWind(dir, 5, 99); const e = w.spawnEgg(3, 4.5, 10, { falling: true }); _h.run(0.45); return { x: e.x, y: e.y, f: e.falling }; };
      const calm = fall(0), right = fall(1), left = fall(-1);
      const w = _h.fresh(); const r1 = w.spawnEgg(4, 1.04, 1.04), r2 = w.spawnEgg(5, 6, 1.26); _h.run(1.5); const xa = [r1.x, r2.x];
      w.setWind(1, 8, 99); _h.run(3);
      return { calm, right, left, rest: [r1.x - xa[0], r2.x - xa[1]], f: [r1.falling, r2.falling] };
    });
    check(S, 'gust → falling egg drifts with the wind (right/left), calm stays straight', wd.right.x > wd.calm.x + 0.2 && wd.left.x < wd.calm.x - 0.2 && Math.abs(wd.calm.x - 4.5) < 0.02, JSON.stringify({ calm: wd.calm.x, r: wd.right.x, l: wd.left.x }));
    check(S, 'gust does not move resting eggs', wd.rest.every(d => Math.abs(d) < 0.02) && wd.f.every(f => !f), JSON.stringify(wd.rest));
    const guide = await W(p, () => { const w = _h.fresh(); w.held = w.held || 2; w.canDrop = true; w.mossy.x = 4.5; w.setWind(0, null, 99); const a = w.predictDrop(4.5).landX; w.setWind(1, 5, 99); const b = w.predictDrop(4.5).landX; return { a, b }; });
    check(S, 'predictDrop (guide) bends with the wind', guide.b > guide.a + 0.2, JSON.stringify(guide));
    // danger → rescue → game over per difficulty
    for (const [d, n] of [['easy', 2], ['normal', 1], ['hard', 0]]) {
      const r = await W(p, d => {
        MEG.Game.urlDiff = d;
        const w = _h.fresh(); const out = { max: w.maxRescues, rescues: 0, over: false, warn: false };
        for (let k = 0; k < 4 && !out.over; k++) {
          const e = w.spawnEgg(4, 4.5, 10.4); e.age = 2;
          const ev = _h.run(3.2, _h.pin(w, e));
          out.rescues += ev.filter(x => x.type === 'rescue').length;
          out.over = out.over || ev.some(x => x.type === 'gameOver');
          out.warn = out.warn || ev.some(x => x.type === 'warnOn');
        }
        out.phase = w.phase; out.left = w.rescues;
        return out;
      }, d);
      check(S, d + ': ' + n + ' fairy rescue(s) then game over', r.max === n && r.rescues === n && r.over && r.phase === 'over' && r.warn, JSON.stringify(r));
    }
    await W(p, () => { MEG.Game.urlDiff = 'normal'; });
    const dg = await W(p, () => { const w = _h.fresh(); const e = w.spawnEgg(4, 4.5, 10.4); e.age = 2; _h.run(1.25, _h.pin(w, e)); const d1 = w.danger; e.x = 4.5; e.y = 1.04; _h.run(2); return { d1, d2: w.danger, ph: w.phase }; });
    check(S, 'danger rises while above the vine and decays after it comes down', dg.d1 > 0.4 && dg.d1 < 0.6 && dg.d2 < 0.05 && dg.ph === 'play', JSON.stringify(dg));
    // a real pile-over (no rescues left) → Game Over screen
    await W(p, () => { const w = _h.fresh(); w.rescues = 0; const e = w.spawnEgg(4, 4.5, 10.4); e.age = 2; _h.run(3, _h.pin(w, e)); MEG.debug.setSpeed(1); });
    check(S, 'pile-over with no rescues → Game Over screen after the 1.6 s beat', await waitMode(p, 'over', 4000) && (await ui(p)) === 'scrOver');
    // seasons
    const lv = await W(p, () => {
      const w = _h.fresh(); const G = MEG.Game, R = G.renderer;
      w.spawnEgg(3, 2, 0.84); w.spawnEgg(5, 6, 1.26); _h.run(0.5); const n0 = w.eggs.length;
      MEG.debug.gotoLevel(2); G.handleEvents(w.drainEvents());
      const a = { zone: w.zone, vis: R.vis.cur, banner: R.banner && R.banner.s, n: w.eggs.length, n0, wx: G.weather.zone != null ? G.weather.zone : null, str: w._windStrength() };
      MEG.debug.gotoLevel(5); G.handleEvents(w.drainEvents());
      a.z5 = w.zone; a.loop = w.loop; a.str5 = w._windStrength();
      // natural level up by score keeps eggs
      const w2 = _h.fresh(); w2.spawnEgg(2, 2, 0.66); w2.spawnEgg(6, 6, 1.5); _h.run(0.3);
      w2.eggs = []; w2.spawnEgg(4, 1.04, 1.04); w2.spawnEgg(6, 7.5, 1.5); _h.run(0.3);
      w2.score = w2.levelGoal - 1; w2.spawnEgg(1, 3.6, 0.5); w2.spawnEgg(1, 4.6, 0.5);
      const ev = _h.run(0.5);
      a.up = ev.filter(e => e.type === 'levelUp').map(e => e.zone); a.kept = w2.eggs.map(e => e.kind).sort().join(); a.lvl = w2.level; a.vis2 = R.vis.cur;
      return a;
    });
    check(S, 'gotoLevel(2) → autumn zone, renderer visuals + banner follow', lv.zone === 2 && lv.vis === 2 && lv.banner === 2, JSON.stringify(lv));
    check(S, 'gotoLevel keeps the eggs in the nest', lv.n === lv.n0 && lv.n0 === 2, lv.n0 + ' → ' + lv.n);
    check(S, 'level 5 = winter loop 2, windier', lv.z5 === 3 && lv.loop === 2 && lv.str5 > lv.str, JSON.stringify({ z: lv.z5, loop: lv.loop, s: lv.str, s5: lv.str5 }));
    check(S, 'reaching the goal by a merge levels up and keeps the eggs', lv.up.length === 1 && lv.up[0] === 1 && lv.lvl === 1 && lv.kept === '2,4,6' && lv.vis2 === 1, JSON.stringify({ up: lv.up, kept: lv.kept }));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 7. pause / auto-pause ─────────────────────────────
  await sec('pause', async () => {
    const S = 'pause';
    const { p } = await open('?mute=1&seed=7&autostart=1', {}, 'pause');
    await sleep(500);
    await W(p, () => MEG.Game.pause());
    const t0 = await W(p, () => MEG.debug.world.time); await sleep(600);
    const t1 = await W(p, () => MEG.debug.world.time);
    check(S, 'world time frozen while paused', t1 === t0, t0 + ' → ' + t1);
    await W(p, () => MEG.Game.resume()); await sleep(400);
    const t2 = await W(p, () => MEG.debug.world.time);
    check(S, 'resumes without a time jump', t2 > t1 && t2 - t1 < 0.8, (t2 - t1).toFixed(3));
    await W(p, () => window.dispatchEvent(new Event('blur')));
    check(S, 'window blur auto-pauses', (await mode(p)) === 'paused' && (await ui(p)) === 'scrPause');
    await W(p, () => MEG.Game.resume());
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'visibilitychange (hidden) auto-pauses', (await mode(p)) === 'paused');
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'coming back stays paused until the child taps Resume', (await mode(p)) === 'paused');
    // held key cleared by blur
    await W(p, () => MEG.Game.resume());
    await p.keyboard.down('ArrowLeft'); await sleep(100);
    await W(p, () => window.dispatchEvent(new Event('blur')));
    await W(p, () => MEG.Game.resume()); await sleep(300);
    const nud = await W(p, () => MEG.debug.world._nudge);
    await p.keyboard.up('ArrowLeft');
    check(S, 'blur clears a held arrow key', !nud, 'nudge=' + nud);
    // blur on the title / game over does not pause
    await W(p, () => MEG.Game.toTitle());
    await W(p, () => window.dispatchEvent(new Event('blur')));
    check(S, 'blur on the title does nothing', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    await pageErrs(p, S);
  });

  // ───────────────────────────── 8. settings persistence, URL flags, best scores ─────────────────────────────
  await sec('persist', async () => {
    const S = 'persist';
    const ctx = await newCtx();
    let p = await openIn(ctx, '?seed=7', 'persist');
    const d0 = await W(p, () => ({ ...MEG.Game.settings }));
    check(S, 'first run defaults: sound + music on, Easy', d0.sfx && d0.music && d0.difficulty === 'easy', JSON.stringify(d0));
    await p.click('#btnSettings');
    await p.click('#scrSettings label.set:has(#setSfx)'); await p.click('#scrSettings label.set:has(#setMusic)');
    await p.click('#setDifficulty button[data-v=hard]');
    await p.click('#scrSettings .btn-back');
    await reload(p);
    const s1 = await W(p, () => ({ ...MEG.Game.settings, ui: [document.getElementById('setSfx').checked, document.getElementById('setMusic').checked, document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v] }));
    check(S, 'sound off / music off / Hard survive a reload (and the UI shows them)', !s1.sfx && !s1.music && s1.difficulty === 'hard' && !s1.ui[0] && !s1.ui[1] && s1.ui[2] === 'hard', JSON.stringify(s1));
    // M toggle persists
    await p.keyboard.press('KeyM'); await reload(p);
    check(S, 'M (mute) persists across reload', await W(p, () => MEG.Game.settings.muted === true));
    await p.keyboard.press('KeyM'); await sleep(100);
    // URL flags never saved
    await p.goto(BASE + '?mute=1&diff=easy&seed=7'); await ready(p); await p.evaluate(HELPERS);
    const f = await W(p, () => ({ diff: MEG.Game.difficulty(), muted: MEG.Audio && MEG.Game.urlMute, saved: JSON.parse(localStorage.getItem('meg:settings')) }));
    check(S, '?diff=easy&mute=1 apply for this visit', f.diff === 'easy' && f.muted, JSON.stringify(f));
    check(S, '…and are not written to storage', f.saved.difficulty === 'hard' && !f.saved.muted, JSON.stringify(f.saved));
    await p.click('#btnSettings'); await p.click('#scrSettings label.set:has(#setSfx)'); await p.click('#scrSettings .btn-back');
    const f2 = JSON.parse(await W(p, () => localStorage.getItem('meg:settings')));
    check(S, 'changing another setting while ?diff/?mute are active still does not save them', f2.difficulty === 'hard' && !f2.muted && f2.sfx === true, JSON.stringify(f2));
    const shown = await W(p, () => { MEG.UI.open('scrSettings', 'scrTitle'); return document.querySelector('#setDifficulty .on').dataset.v; });
    if (shown !== 'easy') note('with ?diff=easy the Settings screen highlights "' + shown + '" while the game plays easy');
    await W(p, () => MEG.UI.back());
    // best per difficulty
    await p.goto(BASE + '?mute=1&diff=normal&seed=7'); await ready(p); await p.evaluate(HELPERS);
    await W(p, () => { MEG.Game.startGame(); _h.forceOver(77); }); await waitMode(p, 'over');
    const b1 = await W(p, () => ({ n: localStorage.getItem('meg:best_normal'), e: localStorage.getItem('meg:best_easy'), nb: !document.getElementById('newBest').classList.contains('hidden'), shown: document.getElementById('overBest').textContent }));
    check(S, 'a human Normal game saves best_normal only, shows NEW!', b1.n === '77' && b1.e == null && b1.nb && b1.shown === '77', JSON.stringify(b1));
    await sleep(800);
    await W(p, () => { MEG.Game.startGame(); _h.forceOver(40); }); await waitMode(p, 'over');
    const b2 = await W(p, () => ({ n: localStorage.getItem('meg:best_normal'), nb: !document.getElementById('newBest').classList.contains('hidden'), shown: document.getElementById('overBest').textContent }));
    check(S, 'lower score keeps the best, no NEW!', b2.n === '77' && !b2.nb && b2.shown === '77', JSON.stringify(b2));
    await p.goto(BASE + '?mute=1&diff=easy&seed=7'); await ready(p); await p.evaluate(HELPERS);
    check(S, 'title shows the best of the active difficulty (easy = 0)', (await W(p, () => document.getElementById('bestTitle').textContent)) === '0');
    await W(p, () => { MEG.Game.startGame(); _h.forceOver(15); }); await waitMode(p, 'over');
    check(S, 'Easy best is separate', (await W(p, () => [localStorage.getItem('meg:best_easy'), localStorage.getItem('meg:best_normal')].join())) === '15,77');
    // bot never overwrites
    await p.goto(BASE + '?mute=1&diff=normal&seed=7&bot=1&autostart=1'); await ready(p); await p.evaluate(HELPERS);
    await W(p, () => _h.forceOver(999)); await waitMode(p, 'over');
    const bb = await W(p, () => ({ n: localStorage.getItem('meg:best_normal'), nb: !document.getElementById('newBest').classList.contains('hidden') }));
    check(S, '?bot=1 game with a higher score does not save best, no NEW!', bb.n === '77' && !bb.nb, JSON.stringify(bb));
    await p.goto(BASE + '?mute=1&diff=normal&seed=7'); await ready(p); await p.evaluate(HELPERS);
    await W(p, () => { MEG.Game.startGame(); MEG.debug.setBot(true, 1); _h.forceOver(500); }); await waitMode(p, 'over');
    check(S, 'MEG.debug.setBot(true) game does not save best', (await W(p, () => localStorage.getItem('meg:best_normal'))) === '77');
    await W(p, () => MEG.debug.setBot(false));
    // reset best needs two taps
    await W(p, () => MEG.Game.toTitle()); await p.click('#btnSettings');
    await p.click('#btnResetBest');
    check(S, 'Reset best: first tap only arms ("Sure?")', (await W(p, () => localStorage.getItem('meg:best_normal'))) === '77' && /Sure/.test(await p.textContent('#btnResetBest')));
    await p.click('#btnResetBest');
    check(S, 'second tap clears all bests', (await W(p, () => Object.keys(localStorage).filter(k => k.startsWith('meg:best_')).length)) === 0);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 9. Change Pictures ─────────────────────────────
  await sec('pictures', async () => {
    const S = 'pictures';
    const { p } = await open('?mute=1&seed=7', {}, 'pictures');
    const mk = async (w, h, kind) => Buffer.from(await p.evaluate(([w, h, kind]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (kind === 'photo') { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#fc4'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#c33'; g.fillRect(w * .3, h * .3, w * .4, h * .4); }
      else if (kind === 'cutout') { g.fillStyle = '#e60'; g.beginPath(); g.arc(w / 2, h / 2, w * .35, 0, 7); g.fill(); }
      else { g.fillStyle = '#58c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let i = 0; i < 20; i++) g.fillRect(i * w / 20, h / 2, w / 40, h / 4); }
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h, kind]), 'base64');
    const photo = await mk(800, 600, 'photo'), cut = await mk(300, 300, 'cutout'), bg = await mk(1200, 800, 'bg'), huge = await mk(4000, 3000, 'photo');
    const slotIds = await W(p, () => MEG.Assets.SLOTS.map(s => s.id));
    check(S, 'slots: hero, egg and four season backgrounds', JSON.stringify(slotIds) === JSON.stringify(['hero', 'egg', 'bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter']), slotIds.join(','));
    await p.click('#btnCustomize');
    const slot = id => slotIds.indexOf(id);
    const choose = async (id, file) => {
      await p.evaluate(() => document.getElementById('toast').classList.add('hidden'));
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.locator('#slotGrid .slot').nth(slot(id)).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
    };
    const toast = async (re, t = 10000) => { try { await p.waitForFunction(re => !document.getElementById('toast').classList.contains('hidden') && new RegExp(re, 'i').test(document.getElementById('toast').textContent), re, { timeout: t }); return true; } catch (_) { return false; } };
    await choose('hero', { name: 'family.png', mimeType: 'image/png', buffer: photo });
    check(S, 'photo on Mossy → "Picture saved"', await toast('saved'));
    const h1 = await W(p, () => ({ c: MEG.Assets.hasCustom('hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent, ls: !!localStorage.getItem('meg:img_hero') }));
    check(S, 'hero card says "Your picture", stored as meg:img_hero', h1.c && /Your picture/.test(h1.tag) && h1.ls, JSON.stringify(h1));
    await choose('egg', { name: 'cutout.png', mimeType: 'image/png', buffer: cut });
    check(S, 'cut-out PNG on the egg slot saved', await toast('saved') && await W(p, () => MEG.Assets.hasCustom('egg')));
    await p.locator('#slotGrid .slot').nth(slot('egg')).locator('[data-shape=circle]').click();
    check(S, '"Round" shape button works on the egg slot', (await W(p, () => MEG.Storage.get('shape_egg'))) === 'circle');
    for (const id of ['bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter']) await choose(id, { name: id + '.png', mimeType: 'image/png', buffer: bg }), await toast('saved');
    check(S, 'all four season backgrounds accept a picture', await W(p, () => ['bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter'].every(s => MEG.Assets.hasCustom(s))));
    await sleep(300);
    await W(p, () => MEG.Assets.clearCustom('bg_winter'));
    await choose('bg_winter', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('hello, I am a text file renamed .png') });
    check(S, 'text file renamed .png → friendly error toast', await toast('could not be opened|choose a picture'));
    check(S, 'bad file does not change the slot', !(await W(p, () => MEG.Assets.hasCustom('bg_winter'))));
    await choose('bg_winter', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') });
    check(S, 'a .txt file → "Please choose a picture"', await toast('choose a picture'));
    const tHuge = Date.now();
    await choose('bg_winter', { name: 'huge.png', mimeType: 'image/png', buffer: huge });
    const okHuge = await toast('saved', 20000);
    const hs = await W(p, async () => { const d = MEG.Storage.get('img_bg_winter'); if (!d) return null; const im = new Image(); im.src = d; await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024) }; });
    check(S, 'huge 4000×3000 picture accepted', okHuge, (Date.now() - tHuge) + ' ms');
    check(S, 'huge picture downscaled (long edge ≤ 1600) and stored small', hs && Math.max(hs.w, hs.h) <= 1600 && hs.kb < 2500, JSON.stringify(hs));
    await choose('hero', { name: 'huge.png', mimeType: 'image/png', buffer: huge }); await toast('saved', 20000);
    const hd = await W(p, async () => { const im = new Image(); im.src = MEG.Storage.get('img_hero'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
    check(S, 'huge hero picture stored ≤ 512 px', Math.max(...hd) <= 512, hd.join('×'));
    await p.click('#scrCustom .btn-back');
    // play with custom pictures (merges, hatch, every season)
    await p.click('#btnPlay'); await sleep(400);
    await W(p, () => { const w = MEG.debug.world; w.spawnEgg(8, 2.1, 2.1); w.spawnEgg(8, 6.3, 2.1); w.spawnEgg(3, 4.5, 6); });
    for (let z = 0; z < 4; z++) { await W(p, z => MEG.debug.gotoLevel(z), z); await sleep(500); }
    await p.screenshot({ path: OUT + '/func_custom_play.png' });
    check(S, 'game still runs with custom pictures (all seasons, hatch)', (await mode(p)) === 'playing' && (await W(p, () => MEG.debug.world.time)) > 1.5);
    await reload(p);
    const pr = await W(p, () => MEG.Assets.SLOTS.map(s => MEG.Assets.hasCustom(s.id)));
    check(S, 'custom pictures persist across reload', pr.every(Boolean), pr.join(','));
    await p.click('#btnCustomize');
    await p.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click();
    const rs = await W(p, () => ({ c: MEG.Assets.hasCustom('hero'), s: MEG.Storage.get('img_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent }));
    check(S, 'Reset on one card restores the original', !rs.c && rs.s == null && /Original/.test(rs.tag), JSON.stringify(rs));
    await p.click('#btnResetAll');
    const ra = await W(p, () => MEG.Assets.SLOTS.some(s => MEG.Assets.hasCustom(s.id)) || Object.keys(localStorage).some(k => k.startsWith('meg:img_')));
    check(S, 'Reset all removes every custom picture', !ra);
    await p.click('#scrCustom .btn-back');
    await p.click('#btnPlay'); await sleep(600);
    check(S, 'game runs with the originals again', (await mode(p)) === 'playing');
    await pageErrs(p, S);
  });

  // ───────────────────────────── 10. layout ─────────────────────────────
  const VIEWS = [
    { name: 'desktop 960×540', o: { viewport: { width: 960, height: 540 } } },
    { name: 'desktop 1366×768', o: { viewport: { width: 1366, height: 768 } } },
    { name: 'desktop 1920×1080', o: { viewport: { width: 1920, height: 1080 } } },
    { name: 'phone landscape 844×390', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ins: { top: 0, right: 47, bottom: 21, left: 47 } },
    { name: 'phone portrait 390×844', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ins: { top: 47, right: 0, bottom: 34, left: 0 } },
    { name: 'iPad 1024×768', o: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ins: { top: 24, right: 0, bottom: 20, left: 0 } },
    { name: 'iPad Pro 1366×1024', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ins: { top: 24, right: 0, bottom: 20, left: 0 } }
  ];
  const views = QUICK ? VIEWS.filter((v, i) => [0, 3, 4, 5].includes(i)) : VIEWS;
  for (const v of views) await sec('layout ' + v.name, async () => {
    const S = 'layout ' + v.name;
    const tag = v.name.replace(/[^a-z0-9]+/gi, '_');
    const { ctx, p } = await open('?mute=1&seed=7', v.o, tag);
    await sleep(500);
    const measure = id => p.evaluate(async id => {
      await Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      const scr = document.getElementById(id), vw = innerWidth, vh = innerHeight;
      const box = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
      const r = box.getBoundingClientRect(), bad = [];
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('box ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      if (box.scrollWidth > box.clientWidth + 2) bad.push('h-overflow ' + box.scrollWidth + '>' + box.clientWidth);
      for (const el of box.querySelectorAll('button, .slot, .set, h2, h1')) {
        const b = el.getBoundingClientRect(); if (!b.width) continue;
        if (b.left < r.left - 1 || b.right > r.right + 1) bad.push((el.id || el.className || el.tagName) + ' sticks out ' + Math.round(b.left) + '..' + Math.round(b.right));
        if (b.left < -1 || b.right > vw + 1) bad.push((el.id || el.tagName) + ' off-screen x');
      }
      // every button reachable: inside the viewport now, or inside a scrollable panel
      const scrolls = box.scrollHeight > box.clientHeight + 2, canScroll = /auto|scroll/.test(getComputedStyle(box).overflowY);
      const unreachable = [...box.querySelectorAll('button')].filter(b => { const q = b.getBoundingClientRect(); return q.width && (q.bottom > vh + 1 || q.top < -1) && !(scrolls && canScroll); }).map(b => b.id || b.textContent.trim().slice(0, 12));
      return { bad: bad.slice(0, 4), scrolls, canScroll, unreachable, docW: document.documentElement.scrollWidth, vw };
    }, id);
    const tm = await measure('scrTitle');
    check(S, 'title fits', tm.bad.length === 0 && tm.unreachable.length === 0, tm.bad.concat(tm.unreachable).join('; '));
    check(S, 'no horizontal page scroll', tm.docW <= tm.vw, tm.docW + ' > ' + tm.vw);
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await W(p, id => MEG.UI.open(id, 'scrTitle'), id); await sleep(300);
      const m = await measure(id);
      check(S, id + ' panel on screen, every button reachable', m.bad.length === 0 && m.unreachable.length === 0, m.bad.concat(m.unreachable).join('; '));
      if (m.scrolls) note(v.name + ': ' + id + ' scrolls inside its panel');
      await p.screenshot({ path: OUT + '/func_' + tag + '_' + id + '.png' });
    }
    await W(p, () => MEG.UI.back());
    await W(p, () => MEG.debug.startGame()); await sleep(700);
    const geo = async () => p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, R = MEG.Game.renderer, cv = R.canvas.getBoundingClientRect();
      const X = lx => cv.left + lx / R.VW * cv.width, Y = ly => cv.top + ly / R.VH * cv.height;
      // playable frame: walls, Mossy's head (y 14) down to the floor lip (y −0.3); the decorative nest base (to −1.3) may crop
      const nest = { l: X(R.sx(-0.7)), r: X(R.sx(9.7)), t: Y(R.sy(14.0)), b: Y(R.sy(-0.3)) }, baseB = Y(R.sy(-0.9));
      const hud = ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, size: Math.round(Math.min(r.width, r.height)), ok: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh }; });
      const nestOk = nest.l >= -1 && nest.t >= -1 && nest.r <= vw + 1 && nest.b <= vh + 1 && nest.l >= cv.left - 1 && nest.r <= cv.right + 1 && nest.t >= cv.top - 1 && nest.b <= cv.bottom + 1;
      // HUD buttons must not cover the area Mossy flies in (x over the nest, y above the walls)
      const overlap = hud.filter(h => h.r > nest.l && h.l < nest.r && h.b > nest.t && h.t < nest.b).map(h => h.id);
      return { nest, nestOk, hud, overlap, baseB, cv: [cv.left, cv.top, cv.right, cv.bottom].map(Math.round), vw, vh };
    });
    let g = await geo();
    check(S, 'nest + Mossy frame fully visible', g.nestOk, JSON.stringify({ nest: Object.values(g.nest).map(Math.round), cv: g.cv }));
    check(S, 'HUD buttons inside the viewport', g.hud.every(h => h.ok), JSON.stringify(g.hud.map(h => [h.id, Math.round(h.l), Math.round(h.t), Math.round(h.r), Math.round(h.b)])));
    if (g.baseB > g.vh - (v.ins ? v.ins.bottom : 0) + 1) note(v.name + ': DESIGN frame bottom (y −0.9 u) is below the visible area at ' + Math.round(g.baseB) + ' px (nest base cropped)');
    if (g.overlap.length) note(v.name + ': HUD ' + g.overlap.join(',') + ' overlaps the nest/Mossy frame');
    if (v.o.hasTouch) check(S, 'HUD buttons ≥ 44 px for fingers', g.hud.every(h => h.size >= 44), g.hud.map(h => h.size).join(','));
    if (v.ins) {
      await W(p, ins => { const s = document.getElementById('safeProbe').style; s.padding = ins.top + 'px ' + ins.right + 'px ' + ins.bottom + 'px ' + ins.left + 'px'; MEG.Game.relayout(); }, v.ins);
      await sleep(200);
      g = await geo();
      const inSafe = g.hud.every(h => h.t >= v.ins.top - 0.5 && h.r <= g.vw - v.ins.right + 0.5 && h.l >= v.ins.left - 0.5);
      check(S, 'HUD inside the safe area ' + JSON.stringify(v.ins), inSafe, JSON.stringify(g.hud.map(h => [h.id, Math.round(h.t), Math.round(h.r)])));
      const n = g.nest, nestSafe = n.l >= v.ins.left - 1 && n.r <= g.vw - v.ins.right + 1 && n.b <= g.vh - v.ins.bottom + 1 && n.t >= v.ins.top - 1;
      check(S, 'nest + Mossy inside the safe area', nestSafe, JSON.stringify(Object.values(n).map(Math.round)));
      await p.screenshot({ path: OUT + '/func_' + tag + '_play_safe.png' });
    }
    if (v.o.hasTouch) {
      const cdp = await ctx.newCDPSession(p);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await p.waitForFunction(() => MEG.debug.world.canDrop, null, { timeout: 4000 }).catch(() => {});
      const a = await cssAt(p, 2.5, 5), b = await cssAt(p, 6.5, 5);
      await touch('touchStart', a.x, a.y); for (let i = 1; i <= 6; i++) { await touch('touchMove', a.x + (b.x - a.x) * i / 6, a.y); await sleep(20); }
      await sleep(300); await touch('touchEnd', b.x, b.y); await sleep(100);
      const d = await W(p, () => ({ d: MEG.debug.world.drops, tx: MEG.debug.world.mossy.tx }));
      check(S, 'touch slide + release drops on this layout', d.d === 1 && Math.abs(d.tx - 6.5) < 0.8, JSON.stringify(d));
    }
    await p.screenshot({ path: OUT + '/func_' + tag + '_play.png' });
    await W(p, () => MEG.Game.pause()); await sleep(300);
    const pm = await measure('scrPause'); check(S, 'pause panel fits', pm.bad.length === 0 && pm.unreachable.length === 0, pm.bad.concat(pm.unreachable).join('; '));
    await W(p, () => { MEG.Game.resume(); MEG.Game.mode = 'over'; MEG.Game.overAt = performance.now(); MEG.UI.setHud(false); MEG.UI.showGameOver({ score: 12840, best: 24500, newBest: true, cleared: 5, maxKind: 8, merges: 312, combo: 7, hatches: 4, drops: 420, rescues: 2, reached: 'Frost Hollow (round 3)' }); });
    await sleep(350);
    const om = await measure('scrOver'); check(S, 'game over panel fits (long stats)', om.bad.length === 0 && om.unreachable.length === 0, om.bad.concat(om.unreachable).join('; '));
    await p.screenshot({ path: OUT + '/func_' + tag + '_over.png' });
    await pageErrs(p, S);
  });

  // ───────────────────────────── 11. long bot soak at ×16 ─────────────────────────────
  await sec('soak', async () => {
    const S = 'soak';
    const { p } = await open('?mute=1&seed=9&speed=16&bot=1&autostart=1&autorestart=1', {}, 'soak');
    let maxP = 0, maxFx = 0, maxEggs = 0, samples = 0, stuck = 0, lastT = -1, badNum = 0, escaped = 0, minW = 9, maxScore = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < SOAK_S * 1000) {
      await sleep(500);
      const s = await W(p, () => {
        const s = MEG.debug.getState(), w = MEG.debug.world, C = MEG.World.CONFIG;
        let bad = 0, out = 0;
        for (const e of w.eggs) { if (![e.x, e.y, e.vx, e.vy, e.rot].every(Number.isFinite)) bad++; if (e.x < e.r - 0.15 || e.x > C.NEST_W - e.r + 0.15 || e.y < e.r - 0.15) out++; }
        return { p: s.particles, fx: s.fx, t: w.time, n: w.eggs.length, m: s.mode, ph: w.phase, sc: w.score, bad, out };
      });
      samples++; maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxEggs = Math.max(maxEggs, s.n); maxScore = Math.max(maxScore, s.sc);
      badNum += s.bad + (Number.isFinite(s.sc) ? 0 : 1); escaped += s.out;
      if (s.m === 'playing' && s.ph !== 'over' && s.t === lastT) stuck++; lastT = s.t;
    }
    const st = await W(p, () => { const s = MEG.debug.stats, w = MEG.debug.world; return { ...s, drops: s.drops + w.drops, merges: s.merges + w.merges, maxKind: Math.max(s.maxKind, w.maxKind), best: Object.keys(localStorage).filter(k => k.startsWith('meg:best_')) }; });
    // one bot game lasts ~300 s game time (~19 s real at ×16): the 15 s quick soak may not finish one
    check(S, SOAK_S + ' s at ×16: ' + (QUICK ? 'bot plays' : 'several games finished and auto-restarted'), QUICK ? st.drops > 20 : st.games >= 2, JSON.stringify({ games: st.games, drops: st.drops, merges: st.merges, maxKind: st.maxKind, levels: st.levels }));
    check(S, 'stats sane (drops > 0, merges ≤ drops, maxKind 1..8, scores ≥ 0)', st.drops > 0 && st.merges <= st.drops && st.maxKind >= 1 && st.maxKind <= 8 && st.scores.every(x => x >= 0 && Number.isFinite(x)), JSON.stringify({ drops: st.drops, merges: st.merges, maxKind: st.maxKind }));
    check(S, 'particles ≤ 160', maxP <= 160, 'max ' + maxP);
    check(S, 'renderer fx lists bounded (≤ 60)', maxFx <= 60, 'max ' + maxFx);
    check(S, 'egg numbers always finite', badNum === 0, badNum + ' bad');
    check(S, 'no egg ever outside the nest (tunnelling)', escaped === 0, escaped + ' egg-samples outside');
    check(S, 'simulation never stalls while playing', stuck === 0, stuck + ' stalled samples');
    check(S, 'bot soak saved no best score', st.best.length === 0, st.best.join(','));
    note(`soak: ${st.games} games in ${SOAK_S} s, scores ${st.scores.slice(0, 10).join('/')}${st.scores.length > 10 ? '…' : ''}, levels ${st.levels.slice(0, 10).join('/')}, drops ${st.drops}, merges ${st.merges}, hatches ${st.hatches}, rescues ${st.rescues}, maxKind ${st.maxKind}, max eggs ${maxEggs}, max particles ${maxP}, max fx ${maxFx}`);
    await pageErrs(p, S);
  });

  await browser.close(); srv.close();
  const fail = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' checks passed in ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  fs.writeFileSync(OUT + '/functional.json', JSON.stringify({ results, notes }, null, 1));
  if (fail.length) { console.log('FAILED:\n' + fail.map(f => ' - ' + f.section + ' — ' + f.name + ' [' + f.detail + ']').join('\n')); process.exit(1); }
  console.log('PASS functional');
})().catch(async e => { console.error('CRASH', e); try { await browser.close(); } catch (_) {} process.exit(2); });

async function center(p, sel) { const b = await p.locator(sel).boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
