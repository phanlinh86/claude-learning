// Functional QA for Finn's Island Fling. PASS/FAIL per check; exits non-zero if any check fails.
//   node tests/e2e/functional.js            (all sections, ~3 min)
//   node tests/e2e/functional.js --quick    (bot soak 15 s instead of 60 s)
// Drives game/index.html over file:// with Chromium. Uses FIF.debug (DESIGN §6) only to read state and to set up
// scoring scenarios; inputs (mouse, touch, keyboard, file picker) go through the real browser events.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const SOAK_S = QUICK ? 15 : 60;

const results = [];
function check(section, name, ok, detail) {
  curSection = section;
  results.push({ section, name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + section + ' — ' + name + (detail != null && detail !== '' ? '  [' + detail + ']' : ''));
}
const notes = [];
function note(s) { notes.push(s); console.log('NOTE ' + s); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
const live = [];
let curSection = '?';
async function sec(fn) {
  const n = results.length;
  try { await fn(); }
  catch (e) { check(curSection, 'section crashed: ' + String(e && e.message || e).split('\n')[0], false); }
  while (live.length) { try { await live.pop().close(); } catch (_) {} }
}
async function open(query, opts = {}, label = 'page') {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  live.push(ctx);
  const p = await ctx.newPage();
  p._errs = []; p._warns = [];
  p.on('console', m => { if (m.type() === 'error') p._errs.push(label + ': ' + m.text()); if (m.type() === 'warning') p._warns.push(label + ': ' + m.text()); });
  p.on('pageerror', e => p._errs.push(label + ' pageerror: ' + e));
  await p.goto(GAME + (query || ''));
  await p.waitForFunction(() => window.FIF && FIF.debug && FIF.debug.mode && FIF.debug.mode !== 'boot', null, { timeout: 20000 });
  return { ctx, p };
}
const mode = p => p.evaluate(() => FIF.debug.mode);
const ui = p => p.evaluate(() => FIF.UI.current);
const W = (p, fn, arg) => p.evaluate(fn, arg);
async function waitMode(p, m, t = 8000) { try { await p.waitForFunction(m => FIF.debug.mode === m, m, { timeout: t }); return true; } catch (_) { return false; } }
async function waitPhase(p, ph, t = 8000) { try { await p.waitForFunction(ph => FIF.debug.world && FIF.debug.world.phase === ph, ph, { timeout: t }); return true; } catch (_) { return false; } }
async function center(p, sel) { const b = await p.locator(sel).boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
async function pageErrs(p, section) {
  const st = await p.evaluate(() => FIF.debug.stats.errors.slice()).catch(() => []);
  const all = p._errs.concat(st);
  check(section, 'no console / page / frame errors', all.length === 0, all.slice(0, 3).join(' | '));
}

// in-page helpers (installed per page): run world sub-steps synchronously so frames cannot interleave
const HELPERS = () => {
  const G = FIF.Game, C = FIF.World.CONFIG;
  window._h = {
    freeze() { FIF.debug.setSpeed(0); },
    run(sec) { const w = G.world, ev = []; const n = Math.round(sec / C.STEP); for (let i = 0; i < n; i++) { w.update(C.STEP); ev.push(...w.drainEvents()); } G.handleEvents(ev); return ev; },
    runUntil(pred, maxSec) { const w = G.world, ev = []; const n = Math.round((maxSec || 5) / C.STEP); for (let i = 0; i < n; i++) { w.update(C.STEP); ev.push(...w.drainEvents()); if (pred(w)) break; } G.handleEvents(ev); return ev; },
    toAim() { return this.runUntil(w => w.phase === 'aim', 5); },
    // fox falling just above the deck at offset `off` from the raft centre
    forceLand(off) {
      const w = G.world, f = w.fox; this.toAim(); w.leaves = []; w.gulls = [];
      w.phase = 'fly'; w.phaseT = 0; w.fluttered = false;
      Object.assign(f, { x: w.raft.x + off, y: w.raft.top + C.FOOT + 0.015, vx: 0, vy: -2, state: 'fly', flightT: 0, bonkT: 0, flutT: 0, spin: 0 });
      return this.runUntil(w => w.phase !== 'fly', 1);
    },
    forceSplash() {
      const w = G.world, f = w.fox; this.toAim(); w.leaves = []; w.gulls = [];
      w.phase = 'fly'; w.phaseT = 0;
      Object.assign(f, { x: w.raft.x - w.raft.hw - 1.5, y: C.FOOT + 0.015, vx: 0, vy: -2, state: 'fly', flightT: 0, bonkT: 0, flutT: 0, spin: 0 });
      return this.runUntil(w => w.phase !== 'fly', 1);
    },
    // a leaf right on the flying fox; returns the events of one step
    grabLeaf(kind) {
      const w = G.world, f = w.fox; this.toAim(); w.gulls = [];
      w.phase = 'fly'; w.phaseT = 0;
      Object.assign(f, { x: 8, y: 5, vx: 1, vy: 0, state: 'fly', flightT: 0, bonkT: 0, flutT: 0, spin: 0 });
      const value = kind === 'moon' ? C.POINTS.moon : C.POINTS.leaf;
      w.leaves = [{ id: 99999, x: 8, y: 5, y0: 5, px: 8, py: 5, kind, value, taken: false, t: 0, ph: 0 }];
      const ev = this.run(C.STEP);
      w.phase = 'aim'; w._newShot(false); G.handleEvents(w.drainEvents());
      return ev;
    }
  };
};

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const T0 = Date.now();

  // ───────────────────────────── 1. boot ─────────────────────────────
  await sec(async () => {
    const S = 'boot';
    const { ctx, p } = await open('?mute=1&seed=7', {}, 'boot');
    check(S, 'reaches the title screen', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    await sleep(2500);
    const st = await W(p, () => ({ t: FIF.debug.world.time, hud: document.getElementById('hud').classList.contains('hidden') }));
    check(S, 'title bot demo is running behind the menu', st.t > 1, 't=' + st.t.toFixed(2));
    check(S, 'HUD hidden on the title', st.hud);
    const missing = p._warns.filter(w => /missing image/.test(w));
    check(S, 'no missing images', missing.length === 0, missing.join(' | '));
    const focus = await W(p, () => document.activeElement && document.activeElement.id);
    check(S, 'Play button has keyboard focus', focus === 'btnPlay', focus);
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 2. menus + Esc/back ─────────────────────────────
  await sec(async () => {
    const S = 'menus';
    const { ctx, p } = await open('?mute=1&seed=7', {}, 'menus');
    await sleep(300);
    await p.click('#btnHow'); check(S, 'How to Play opens', (await ui(p)) === 'scrHow');
    await p.keyboard.press('Escape'); check(S, 'Esc on How to Play → title', (await ui(p)) === 'scrTitle');
    await p.click('#btnHow'); await p.click('#scrHow .btn-back'); check(S, '"OK, let\'s play!" → title (back)', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');
    await p.click('#btnSettings'); check(S, 'Settings opens', (await ui(p)) === 'scrSettings');
    await p.keyboard.press('Escape'); check(S, 'Esc on Settings → title', (await ui(p)) === 'scrTitle');
    await p.click('#btnSettings'); await p.click('#scrSettings .btn-back'); check(S, 'Settings Done → title', (await ui(p)) === 'scrTitle');
    await p.click('#btnCustomize'); check(S, 'Change Pictures opens', (await ui(p)) === 'scrCustom');
    const slots = await p.locator('#slotGrid .slot').count(); check(S, 'Change Pictures shows 6 picture cards', slots === 6, slots);
    await p.keyboard.press('Escape'); check(S, 'Esc on Change Pictures → title', (await ui(p)) === 'scrTitle');
    await p.click('#btnCustomize'); await p.click('#scrCustom .btn-back'); check(S, 'Change Pictures Done → title', (await ui(p)) === 'scrTitle');
    await p.keyboard.press('Escape'); check(S, 'Esc on title does nothing', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');
    // play + pause screen
    await p.click('#btnPlay'); check(S, 'Play starts a run', (await mode(p)) === 'playing' && (await ui(p)) === null);
    const hudVis = await p.isVisible('#btnPause'); check(S, 'HUD visible while playing', hudVis);
    await sleep(400);
    await p.keyboard.press('Escape'); check(S, 'Esc while playing → Pause', (await mode(p)) === 'paused' && (await ui(p)) === 'scrPause');
    check(S, 'HUD hidden on the pause screen', !(await p.isVisible('#btnPause')));
    await p.keyboard.press('Escape'); check(S, 'Esc on Pause → resume', (await mode(p)) === 'playing');
    await p.keyboard.press('KeyP'); check(S, 'P → Pause', (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); check(S, 'Pause → Settings', (await ui(p)) === 'scrSettings' && (await mode(p)) === 'paused');
    await p.keyboard.press('Escape'); check(S, 'Esc on Settings (from pause) → back to Pause, still paused', (await ui(p)) === 'scrPause' && (await mode(p)) === 'paused');
    await p.click('#btnResume'); check(S, 'Resume button → playing', (await mode(p)) === 'playing');
    await p.click('#btnPause'); await p.click('#btnRestart');
    const rs = await W(p, () => ({ m: FIF.debug.mode, shots: FIF.debug.world.shots, t: FIF.debug.world.time }));
    check(S, 'Pause → Restart starts a fresh run', rs.m === 'playing' && rs.shots === 0 && rs.t < 1, JSON.stringify(rs));
    await p.click('#btnPause'); await p.click('#btnPauseMenu'); check(S, 'Pause → Main Menu → title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    // game over screen + its buttons
    await p.click('#btnPlay'); await p.evaluate(HELPERS);
    await W(p, () => { _h.freeze(); FIF.debug.world.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); });
    const over = await waitMode(p, 'over', 5000);
    check(S, 'last heart lost → Game Over screen', over && (await ui(p)) === 'scrOver');
    await sleep(800);
    await p.click('#btnOverMenu'); check(S, 'Game Over → Menu → title', (await mode(p)) === 'title');
    await p.click('#btnPlay');
    await W(p, () => { _h.freeze(); FIF.debug.world.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000); await sleep(800);
    await p.click('#btnAgain'); check(S, 'Game Over → Play Again → new run', (await mode(p)) === 'playing' && (await W(p, () => FIF.debug.world.shots)) === 0);
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 3. mouse + keyboard input ─────────────────────────────
  await sec(async () => {
    const S = 'input-desktop';
    const { ctx, p } = await open('?mute=1&seed=7&autostart=1&diff=easy', {}, 'input');
    await p.evaluate(HELPERS);
    const REFILL = () => { window._refill = setInterval(() => { const w = FIF.debug.world; if (w && w.phase !== 'over' && FIF.Game.deadT < 0 && !window._noRefill) w.hearts = w.maxHearts; }, 30); };
    await p.evaluate(REFILL);
    await sleep(1200);
    // a real mouse drag back and release
    await p.mouse.move(640, 300); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(640 - i * 9, 300 + i * 8); await sleep(16); }
    const pull = await W(p, () => FIF.debug.world.pull);
    check(S, 'mouse drag back pulls the band (down-left)', pull && pull.x < -0.5 && pull.y < -0.5, JSON.stringify(pull));
    const pc = await W(p, () => FIF.debug.world.previewCount());
    check(S, 'dotted preview shown while aiming', pc > 0, pc);
    await p.mouse.up();
    check(S, 'mouse release flings', (await W(p, () => FIF.debug.world.phase)) === 'fly');
    await sleep(120); await p.waitForFunction(() => FIF.debug.world.phase !== 'fly' || FIF.debug.world.fox.vy < 3, null, { timeout: 6000 }).catch(() => {}); 
    await p.mouse.click(640, 300); await sleep(80); await p.mouse.click(640, 300); await sleep(80); await p.mouse.click(400, 200);
    const fl = await W(p, () => ({ f: FIF.debug.world.fluttered, n: FIF.debug.world.stats.flutters }));
    check(S, 'tap in flight flutters, three taps → exactly one flutter', fl.f && fl.n === 1, JSON.stringify(fl));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // tiny drag (3 px): no pull, no fling
    const shots0 = await W(p, () => FIF.debug.world.shots);
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(637, 302); await p.mouse.up();
    let s = await W(p, () => ({ ph: FIF.debug.world.phase, pull: FIF.debug.world.pull, shots: FIF.debug.world.shots }));
    check(S, 'tiny 3 px drag cancels (no fling)', s.ph === 'aim' && !s.pull && s.shots === shots0, JSON.stringify(s));
    // short drag (below PULL_MIN): pull shown but release cancels
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(630, 308, { steps: 3 }); await p.mouse.up();
    s = await W(p, () => ({ ph: FIF.debug.world.phase, pull: FIF.debug.world.pull, shots: FIF.debug.world.shots }));
    check(S, 'short drag under PULL_MIN cancels on release', s.ph === 'aim' && !s.pull && s.shots === shots0, JSON.stringify(s));
    // drag, then pull back to the start: cancel
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(560, 370, { steps: 5 }); await p.mouse.move(641, 300, { steps: 5 }); await p.mouse.up();
    s = await W(p, () => ({ ph: FIF.debug.world.phase, shots: FIF.debug.world.shots }));
    check(S, 'drag out and back to the start cancels', s.ph === 'aim' && s.shots === shots0, JSON.stringify(s));
    // right-click never fires
    await p.mouse.move(640, 300); await p.mouse.down({ button: 'right' }); await p.mouse.move(560, 370, { steps: 5 }); await p.mouse.up({ button: 'right' });
    s = await W(p, () => ({ ph: FIF.debug.world.phase, shots: FIF.debug.world.shots }));
    check(S, 'right-button drag does not fling', s.ph === 'aim' && s.shots === shots0, JSON.stringify(s));
    // keyboard: arrows aim, Space flings, Space again flutters once
    await p.keyboard.down('ArrowUp'); await sleep(300); await p.keyboard.up('ArrowUp');
    const k1 = await W(p, () => ({ pull: FIF.debug.world.pull, ang: FIF.Game.kb.ang, pow: FIF.Game.kb.pow }));
    check(S, 'ArrowUp aims (pull set, angle up)', k1.pull && k1.ang > 45, JSON.stringify(k1));
    await p.keyboard.down('ArrowRight'); await sleep(250); await p.keyboard.up('ArrowRight');
    const k2 = await W(p, () => FIF.Game.kb.pow);
    check(S, 'ArrowRight adds power', k2 > k1.pow, k1.pow.toFixed(2) + '→' + k2.toFixed(2));
    await p.keyboard.down('ArrowDown'); await sleep(200); await p.keyboard.up('ArrowDown');
    const k3 = await W(p, () => FIF.Game.kb.ang);
    check(S, 'ArrowDown lowers the angle', k3 < k1.ang, k3.toFixed(1));
    await p.keyboard.press('Space');
    check(S, 'Space flings', (await W(p, () => FIF.debug.world.phase)) === 'fly');
    await sleep(100); await p.waitForFunction(() => FIF.debug.world.phase !== 'fly' || FIF.debug.world.fox.vy < 3, null, { timeout: 6000 }).catch(() => {}); 
    await p.keyboard.press('Space'); await sleep(50); await p.keyboard.press('Space');
    const kf = await W(p, () => FIF.debug.world.stats.flutters);
    check(S, 'Space in flight flutters exactly once', kf === 2, 'total flutters ' + kf);
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // held Space (auto-repeat) does not fling + flutter in one press
    await p.keyboard.down('Space'); await sleep(40);
    for (let i = 0; i < 4; i++) await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true })));
    await p.keyboard.up('Space');
    const hs = await W(p, () => ({ ph: FIF.debug.world.phase, fl: FIF.debug.world.fluttered }));
    check(S, 'held Space (auto-repeat) = fling only, no instant flutter', hs.ph === 'fly' && !hs.fl, JSON.stringify(hs));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // HUD buttons must not fling / flutter
    const shotsA = await W(p, () => FIF.debug.world.shots);
    const muted0 = await W(p, () => FIF.Game.settings.muted || FIF.Game.urlMute);
    await p.click('#btnMuteHud');
    const m1 = await W(p, () => ({ muted: FIF.Game.settings.muted || FIF.Game.urlMute, ph: FIF.debug.world.phase, pull: FIF.debug.world.pull, shots: FIF.debug.world.shots }));
    check(S, 'mouse click on mute toggles sound and does not aim/fling', m1.muted !== muted0 && m1.ph === 'aim' && !m1.pull && m1.shots === shotsA, JSON.stringify(m1));
    // focused HUD button + Space / Enter: must fling once, not also re-toggle mute
    const foc = await W(p, () => document.activeElement && document.activeElement.id);
    await p.keyboard.press('Space');
    const m2 = await W(p, () => ({ muted: FIF.Game.settings.muted || FIF.Game.urlMute, ph: FIF.debug.world.phase, shots: FIF.debug.world.shots }));
    check(S, 'focused mute button + Space → one fling, mute not toggled again', m2.muted === m1.muted && m2.ph === 'fly' && m2.shots === shotsA + 1, 'focus=' + foc + ' ' + JSON.stringify(m2));
    await p.waitForFunction(() => FIF.debug.world.phase !== 'fly' || FIF.debug.world.fox.vy < 3, null, { timeout: 6000 }).catch(() => {});
    await p.keyboard.press('Enter');
    const m3 = await W(p, () => ({ muted: FIF.Game.settings.muted || FIF.Game.urlMute, fl: FIF.debug.world.fluttered }));
    check(S, 'focused mute button + Enter in flight → flutter, mute not toggled', m3.muted === m1.muted && m3.fl, JSON.stringify(m3));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    await p.click('#btnMuteHud');   // sound back as it was
    // pause button during flight: no flutter
    await p.keyboard.press('Space'); await sleep(80);
    const f0 = await W(p, () => FIF.debug.world.stats.flutters);
    await p.click('#btnPause');
    const pz = await W(p, () => ({ m: FIF.debug.mode, f: FIF.debug.world.stats.flutters, fl: FIF.debug.world.fluttered }));
    check(S, 'mouse click on Pause during flight pauses without a flutter', pz.m === 'paused' && pz.f === f0 && !pz.fl, JSON.stringify(pz));
    // resume with Space on the focused Resume button: resumes once, no fling/flutter
    await sleep(100);
    const fr = await W(p, () => document.activeElement && document.activeElement.id);
    await p.keyboard.press('Space');
    const rz = await W(p, () => ({ m: FIF.debug.mode, fl: FIF.debug.world.fluttered, focus: document.activeElement && document.activeElement.id }));
    check(S, 'Space on focused Resume → playing, no flutter, focus left the button', rz.m === 'playing' && !rz.fl && !rz.focus, 'focused=' + fr + ' ' + JSON.stringify(rz));
    // pause while dragging cancels the aim
    await waitPhase(p, 'aim', 8000); await sleep(200);
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(560, 370, { steps: 5 });
    await p.keyboard.press('Escape');
    await p.mouse.up();
    const pd = await W(p, () => ({ m: FIF.debug.mode, ph: FIF.debug.world.phase, pull: FIF.debug.world.pull }));
    check(S, 'Esc during a drag pauses and cancels the pull (release does not fire)', pd.m === 'paused' && pd.ph === 'aim' && !pd.pull, JSON.stringify(pd));
    await p.click('#btnResume');
    // M key toggles sound; restores
    const mk0 = await W(p, () => FIF.Game.settings.muted || FIF.Game.urlMute);
    await p.keyboard.press('KeyM');
    const mk1 = await W(p, () => FIF.Game.settings.muted || FIF.Game.urlMute);
    check(S, 'M toggles sound', mk1 !== mk0);
    await p.keyboard.press('KeyM');
    // title: focused "How to Play" + Enter opens only How (no game start)
    await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(100);
    await p.focus('#btnHow'); await p.keyboard.press('Enter');
    const th = await W(p, () => ({ m: FIF.debug.mode, ui: FIF.UI.current }));
    check(S, 'title: focused How to Play + Enter opens How only', th.m === 'title' && th.ui === 'scrHow', JSON.stringify(th));
    await sleep(80); await p.keyboard.press('Enter');
    check(S, 'Enter on How ("OK") → title', (await ui(p)) === 'scrTitle');
    await sleep(80);
    await p.keyboard.press('Space');
    const ts = await W(p, () => ({ m: FIF.debug.mode, shots: FIF.debug.world.shots, ph: FIF.debug.world.phase }));
    check(S, 'title: Space on focused Play starts the game once (no instant fling)', ts.m === 'playing' && ts.shots === 0 && ts.ph === 'aim', JSON.stringify(ts));
    await sleep(100);
    await p.keyboard.press('Enter');   // this one IS a fling (playing): the kb aim fires
    check(S, 'Enter while playing flings (keyboard aim)', (await W(p, () => FIF.debug.world.shots)) === 1);
    // restart lock after game over
    await p.evaluate(() => { window._noRefill = true; });
    await W(p, () => { _h.freeze(); FIF.debug.world.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000);
    await p.keyboard.press('Enter'); await p.keyboard.press('Space');
    await p.mouse.click(10, 10);
    const lk = await mode(p);
    check(S, 'restart lock: Enter/Space/click right after Game Over do nothing', lk === 'over', lk);
    try { await p.locator('#btnAgain').click({ timeout: 300, force: true }); } catch (_) {}
    check(S, 'restart lock: Play Again click within 0.7 s ignored', (await mode(p)) === 'over');
    await sleep(800);
    await p.keyboard.press('Enter');
    const ag = await W(p, () => ({ m: FIF.debug.mode, games: FIF.debug.stats.games, shots: FIF.debug.world.shots }));
    check(S, 'Enter after the lock → exactly one new run (no fling carried over)', ag.m === 'playing' && ag.shots === 0, JSON.stringify(ag));
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 4. touch input ─────────────────────────────
  await sec(async () => {
    const S = 'input-touch';
    const { ctx, p } = await open('?mute=1&seed=7&autostart=1&diff=easy', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'touch');
    await p.evaluate(() => { setInterval(() => { const w = FIF.debug.world; if (w && w.phase !== 'over' && FIF.Game.deadT < 0) w.hearts = w.maxHearts; }, 30); });
    const cdp = await ctx.newCDPSession(p);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const drag = async (x0, y0, x1, y1, n = 8) => { await touch('touchStart', x0, y0); for (let i = 1; i <= n; i++) { await touch('touchMove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await sleep(16); } };
    const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(30); await touch('touchEnd', x, y); };
    await sleep(1200);
    check(S, 'touch device detected (body.touch)', await W(p, () => document.body.classList.contains('touch') && FIF.Game.isTouch));
    await drag(420, 180, 360, 230);
    const tp = await W(p, () => FIF.debug.world.pull);
    check(S, 'touch drag pulls the band', tp && tp.x < -0.5 && tp.y < -0.5, JSON.stringify(tp));
    await touch('touchEnd', 360, 230);
    check(S, 'touch release flings', (await W(p, () => FIF.debug.world.phase)) === 'fly');
    await sleep(100); await p.waitForFunction(() => FIF.debug.world.phase !== 'fly' || FIF.debug.world.fox.vy < 3, null, { timeout: 6000 }).catch(() => {}); 
    await tapAt(500, 150); await sleep(60); await tapAt(500, 150);
    const tf = await W(p, () => FIF.debug.world.stats.flutters);
    check(S, 'touch taps in flight → exactly one flutter', tf === 1, tf);
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // tiny touch wiggle: no fling
    const sh0 = await W(p, () => FIF.debug.world.shots);
    await drag(420, 180, 422, 181, 2); await touch('touchEnd', 422, 181);
    check(S, 'tiny touch wiggle does not fling', (await W(p, () => FIF.debug.world.shots)) === sh0 && (await W(p, () => FIF.debug.world.phase)) === 'aim');
    // HUD by touch: mute does not aim; pause during flight does not flutter
    const mc = await center(p, '#btnMuteHud');
    const mu0 = await W(p, () => FIF.Game.settings.muted || FIF.Game.urlMute);
    await tapAt(mc.x, mc.y); await sleep(100);
    const mu1 = await W(p, () => ({ m: FIF.Game.settings.muted || FIF.Game.urlMute, pull: FIF.debug.world.pull, shots: FIF.debug.world.shots }));
    check(S, 'touch on mute toggles sound once, no pull', mu1.m !== mu0 && !mu1.pull && mu1.shots === sh0, JSON.stringify(mu1));
    await sleep(700); await tapAt(mc.x, mc.y); await sleep(700);   // back (and past the ghost-click window)
    await drag(420, 180, 360, 230); await touch('touchEnd', 360, 230); await sleep(60);
    const pc = await center(p, '#btnPause');
    await tapAt(pc.x, pc.y); await sleep(100);
    const tz = await W(p, () => ({ m: FIF.debug.mode, fl: FIF.debug.world.fluttered }));
    check(S, 'touch on Pause during flight → paused, no flutter', tz.m === 'paused' && !tz.fl, JSON.stringify(tz));
    const rc = await center(p, '#btnResume');
    await sleep(650);
    await tapAt(rc.x, rc.y); await sleep(100);
    check(S, 'touch on Resume → playing', (await mode(p)) === 'playing');
    // second finger tapping Pause while the first finger drags (iOS sends no click for it)
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // synthetic touch pointer events (CDP cannot lift one finger of two): finger A drags, finger B taps Pause and lifts first
    await p.evaluate(([px, py]) => {
      const fire = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      const cv = document.getElementById('game'), stage = document.getElementById('stage'), bp = document.getElementById('btnPause');
      fire(cv, 'pointerdown', 21, 420, 180);
      for (let i = 1; i <= 6; i++) fire(cv, 'pointermove', 21, 420 - i * 9, 180 + i * 7);
      window._twoPull = FIF.debug.world.pull && { x: FIF.debug.world.pull.x, y: FIF.debug.world.pull.y };
      fire(bp, 'pointerdown', 22, px, py);
      fire(bp, 'pointerup', 22, px, py);
      fire(stage, 'pointerup', 21, 366, 222);
    }, [pc.x, pc.y]);
    await sleep(100);
    const two = await W(p, () => ({ m: FIF.debug.mode, ph: FIF.debug.world.phase, pull: FIF.debug.world.pull, pulledFirst: !!window._twoPull }));
    check(S, 'second-finger tap on Pause while dragging → paused, aim cancelled, no fling', two.pulledFirst && two.m === 'paused' && two.ph === 'aim' && !two.pull, JSON.stringify(two));
    const scroll = await W(p, () => ({ x: scrollX, y: scrollY, sc: visualViewport ? visualViewport.scale : 1 }));
    check(S, 'page never scrolls or zooms during touch play', scroll.x === 0 && scroll.y === 0 && scroll.sc === 1, JSON.stringify(scroll));
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 5. scoring rules, hearts, levels, day/night ─────────────────────────────
  await sec(async () => {
    const S = 'rules';
    const { ctx, p } = await open('?mute=1&seed=11&autostart=1&diff=easy', {}, 'rules');
    await p.evaluate(HELPERS);
    await sleep(500);
    const r = await W(p, () => {
      _h.freeze();
      const w = FIF.debug.world, out = {};
      // a real fling with the level's solution arc lands on the raft and gets leaves
      _h.toAim(); _h.run(1.0);
      const sol = w.solution, n0 = w.leaves.length, sc0 = w.score;
      w.aim(sol.pull.x, sol.pull.y); w.release();
      const ev0 = _h.runUntil(w => w.phase !== 'fly', 6);
      out.solution = { phase: w.phase, leaves: ev0.filter(e => e.type === 'leaf').length, onArc: n0, dScore: w.score - sc0 };
      // reset the run counters for exact rule checks
      w.score = 0; w.streak = 0; w.leafCount = 0;
      // leaf +1
      let s = w.score; _h.grabLeaf('leaf'); out.leaf = w.score - s;
      // landing off the X: +2 (streak 1)
      w.streak = 0;
      s = w.score; let ev = _h.forceLand(w.raft.hw * 0.8); let land = ev.find(e => e.type === 'land');
      out.land1 = { d: w.score - s, bull: land && land.bull, streak: w.streak, pts: land && land.points };
      // bullseye, streak 2: 2 + 3 + 1
      s = w.score; ev = _h.forceLand(0); land = ev.find(e => e.type === 'land');
      out.bull2 = { d: w.score - s, bull: land && land.bull, streak: w.streak };
      // streak growth: landings 3..7 off the X → 2+2, 2+3, 2+4, 2+4 (cap), 2+4
      out.streak = [];
      for (let i = 0; i < 5; i++) { s = w.score; _h.forceLand(w.raft.hw * 0.8); out.streak.push(w.score - s); }
      // splash: −1 heart, streak reset, no points
      _h.toAim();
      const h0 = w.hearts; s = w.score; ev = _h.forceSplash();
      out.splash = { dh: w.hearts - h0, d: w.score - s, streak: w.streak, ev: ev.filter(e => e.type === 'splash' || e.type === 'heartLost').length };
      s = w.score; _h.run(1.3); _h.forceLand(w.raft.hw * 0.8); out.afterSplash = w.score - s;
      // heart back at the 20th leaf
      const HE = w.D.heartEvery || FIF.World.CONFIG.HEART_EVERY;   // easy 12, normal 20, hard 25
      _h.toAim(); w.hearts = w.maxHearts - 1; w.leafCount = HE - 1;
      ev = _h.grabLeaf('leaf'); out.heart20 = { hearts: w.hearts, max: w.maxHearts, ev: ev.some(e => e.type === 'heartGain') };
      w.leafCount = 2 * HE - 1; ev = _h.grabLeaf('leaf'); out.heartCap = { hearts: w.hearts, max: w.maxHearts };
      w.leafCount = 2 * HE; w.hearts = w.maxHearts - 2; ev = _h.grabLeaf('leaf'); out.heart41 = w.hearts === w.maxHearts - 2;
      return out;
    });
    check(S, 'solution-arc fling lands on the raft', r.solution.phase === 'land', JSON.stringify(r.solution));
    check(S, 'solution-arc fling collects on-arc leaves', r.solution.leaves >= Math.min(1, r.solution.onArc), JSON.stringify(r.solution));
    check(S, 'leaf = +1', r.leaf === 1, r.leaf);
    check(S, 'landing off the X = +2', r.land1.d === 2 && !r.land1.bull && r.land1.streak === 1, JSON.stringify(r.land1));
    check(S, 'bullseye = +2 +3 (+1 streak) = 6', r.bull2.d === 6 && r.bull2.bull && r.bull2.streak === 2, JSON.stringify(r.bull2));
    check(S, 'streak bonus +1 per step, capped at +4', JSON.stringify(r.streak) === JSON.stringify([4, 5, 6, 6, 6]), JSON.stringify(r.streak));
    check(S, 'splash costs exactly one heart, no points, resets streak', r.splash.dh === -1 && r.splash.d === 0 && r.splash.streak === 0 && r.splash.ev === 2, JSON.stringify(r.splash));
    check(S, 'first landing after a splash has no streak bonus (+2)', r.afterSplash === 2, r.afterSplash);
    check(S, 'every heartEvery leaves gives a heart back', r.heart20.hearts === r.heart20.max && r.heart20.ev, JSON.stringify(r.heart20));
    check(S, 'heart bonus never exceeds max hearts', r.heartCap.hearts === r.heartCap.max, JSON.stringify(r.heartCap));
    check(S, 'leaf 41 (not a multiple of 20) gives no heart', r.heart41);

    // levels: 5 landings → next island
    const lv = await W(p, () => {
      const w = FIF.debug.world; _h.toAim();
      w.gotoLevel(0); FIF.Game.handleEvents(w.drainEvents()); _h.toAim();
      const res = { start: w.level, ups: [] };
      for (let i = 0; i < 5; i++) {
        _h.forceLand(0);
        const ev = _h.run(1.05);
        res.ups.push(ev.filter(e => e.type === 'levelUp').length);
        res['after' + (i + 1)] = { level: w.level, ll: w.levelLandings };
      }
      res.zone = w.zone; res.name = w.P.name; res.vis = FIF.Game.renderer.vis && FIF.Game.renderer.vis.cur;
      // four islands then loop
      for (let i = 0; i < 15; i++) { _h.forceLand(0); _h.run(1.05); }
      res.loopLevel = w.level; res.loop = w.loop; res.loopZone = w.zone;
      return res;
    });
    check(S, '4 landings stay on Sunny Cove', lv.after4.level === 0 && lv.after4.ll === 4, JSON.stringify(lv.after4));
    check(S, '5th landing → next island (Jungle Isle), one levelUp event', lv.after5.level === 1 && lv.zone === 1 && lv.name === 'Jungle Isle' && lv.ups[4] === 1 && lv.after5.ll === 0, JSON.stringify(lv));
    check(S, 'after 4 islands the run loops back to Sunny Cove, round 2', lv.loopLevel === 4 && lv.loop === 1 && lv.loopZone === 0, JSON.stringify({ l: lv.loopLevel, loop: lv.loop, z: lv.loopZone }));

    // day → night → day
    const dn = await W(p, () => {
      const w = FIF.debug.world, out = {};
      w.gotoLevel(0); FIF.Game.handleEvents(w.drainEvents()); _h.toAim();
      w.aim(-1.2, -1.0); out.dayPreview = w.previewCount(); w.cancelAim();
      FIF.debug.setDay(0.85); const ev1 = w.drainEvents(); FIF.Game.handleEvents(ev1);
      out.night = { isNight: w.isNight, light: w.light, ev: ev1.map(e => e.type) };
      w.aim(-1.2, -1.0); out.nightPreview = w.previewCount(); w.cancelAim();
      _h.forceLand(0); _h.run(1.05);
      out.moonKinds = w.leaves.map(l => l.kind + ':' + l.value);
      w.score = 0; _h.grabLeaf('moon'); out.moonScore = w.score;
      FIF.debug.setDay(0.3); const ev2 = w.drainEvents(); FIF.Game.handleEvents(ev2);
      out.day = { isNight: w.isNight, light: w.light, ev: ev2.map(e => e.type) };
      _h.forceLand(0); _h.run(1.05);
      out.dayKinds = w.leaves.map(l => l.kind);
      // the natural cycle: from dusk, about 0.15·150 s ≈ 22 s of sim time to night
      FIF.debug.setDay(0.55); w.drainEvents();
      const ev3 = _h.run(30); out.naturalNight = ev3.some(e => e.type === 'night');
      FIF.debug.setSpeed(1);
      return out;
    });
    check(S, 'setDay(0.85) → night (light ≤ 0.35, one "night" event)', dn.night.isNight && dn.night.light <= 0.35 && dn.night.ev.filter(e => e === 'night').length === 1, JSON.stringify(dn.night));
    check(S, 'aiming preview is shorter at night', dn.nightPreview < dn.dayPreview, dn.dayPreview + '→' + dn.nightPreview);
    check(S, 'leaves spawned at night are moon leaves worth 2', dn.moonKinds.length > 0 && dn.moonKinds.every(k => k === 'moon:2'), dn.moonKinds.join(','));
    check(S, 'moon leaf = +2', dn.moonScore === 2, dn.moonScore);
    check(S, 'setDay(0.3) → day again ("dawn" event)', !dn.day.isNight && dn.day.light === 1 && dn.day.ev.includes('dawn'), JSON.stringify(dn.day));
    check(S, 'daytime leaves are normal leaves again', dn.dayKinds.length > 0 && dn.dayKinds.every(k => k === 'leaf'), dn.dayKinds.join(','));
    check(S, 'day cycle reaches night by itself', dn.naturalNight);
    await sleep(1500);
    await p.screenshot({ path: OUT + '/func_night.png' });

    // pause / resume keeps state; auto-pause on blur and on hidden tab
    await W(p, () => { FIF.debug.setDay(0.3); FIF.debug.world.drainEvents(); });
    await waitPhase(p, 'aim', 5000);
    await p.keyboard.press('Escape');
    const a = await W(p, () => JSON.stringify(FIF.debug.world.getState()));
    await sleep(1200);
    const b = await W(p, () => JSON.stringify(FIF.debug.world.getState()));
    check(S, 'paused: world state is frozen', a === b);
    await p.keyboard.press('Escape'); await sleep(400);
    const t2 = await W(p, () => FIF.debug.world.time);
    check(S, 'resume continues the same run (time advances from where it was)', t2 > JSON.parse(a).time && JSON.parse(a).score === (await W(p, () => FIF.debug.world.score)), t2.toFixed(2));
    const jump = t2 - JSON.parse(a).time;
    check(S, 'no time jump on resume (sim advanced < 1 s in 0.4 s)', jump < 1, jump.toFixed(2));
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    check(S, 'window blur → auto-pause', (await mode(p)) === 'paused');
    await p.click('#btnResume');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'tab hidden → auto-pause', (await mode(p)) === 'paused');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'tab visible again stays paused (child resumes on purpose)', (await mode(p)) === 'paused');
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 6. settings persistence + URL flags + best scores ─────────────────────────────
  await sec(async () => {
    const S = 'persist';
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); live.push(ctx);
    const p = await ctx.newPage(); p._errs = [];
    p.on('pageerror', e => p._errs.push('persist: ' + e)); p.on('console', m => { if (m.type() === 'error') p._errs.push('persist: ' + m.text()); });
    const go = async q => { await p.goto(GAME + q); await p.waitForFunction(() => window.FIF && FIF.debug && ['title', 'playing'].includes(FIF.debug.mode), null, { timeout: 20000 }); await sleep(200); };
    await go('?seed=3');
    const def = await W(p, () => FIF.Game.settings);
    check(S, 'first run defaults: Easy, sound + music on', def.difficulty === 'easy' && def.sfx && def.music && !def.muted, JSON.stringify(def));
    await p.click('#btnSettings');
    await p.click('label.set:has(#setSfx)'); await p.click('label.set:has(#setMusic)');
    await p.click('#setDifficulty button[data-v="hard"]');
    await p.click('#scrSettings .btn-back');
    await go('?seed=3');
    const s1 = await W(p, () => ({ s: FIF.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v }));
    check(S, 'sound, music and difficulty persist across reload', !s1.s.sfx && !s1.s.music && s1.s.difficulty === 'hard', JSON.stringify(s1.s));
    check(S, 'settings controls reflect the saved values', !s1.sfx && !s1.music && s1.on === 'hard', JSON.stringify(s1));
    // restore sfx/music, difficulty normal, then test URL flags
    await p.click('#btnSettings'); await p.click('label.set:has(#setSfx)'); await p.click('label.set:has(#setMusic)'); await p.click('#setDifficulty button[data-v="normal"]'); await p.click('#scrSettings .btn-back');
    await go('?seed=3&mute=1&diff=easy');
    const u1 = await W(p, () => ({ urlMute: FIF.Game.urlMute, diff: FIF.Game.difficulty(), saved: localStorage.getItem('fif:settings') }));
    check(S, '?mute=1 mutes this session', u1.urlMute === true);
    check(S, '?diff=easy is used for this session', u1.diff === 'easy');
    // any save (toggle music twice) must not write muted:true or the URL difficulty
    await p.click('#btnSettings'); await p.click('label.set:has(#setMusic)'); await p.click('label.set:has(#setMusic)'); await p.click('#scrSettings .btn-back');
    const u2 = JSON.parse(await W(p, () => localStorage.getItem('fif:settings')));
    check(S, '?mute=1 / ?diff never written to saved settings', u2.muted === false && u2.difficulty === 'normal', JSON.stringify(u2));
    // M while URL-muted → sound on for this session only, nothing saved as muted
    await p.keyboard.press('KeyM');
    const u3 = await W(p, () => ({ urlMute: FIF.Game.urlMute, saved: JSON.parse(localStorage.getItem('fif:settings')).muted }));
    check(S, 'M with ?mute=1 un-mutes without saving a muted flag', u3.urlMute === false && u3.saved === false, JSON.stringify(u3));
    await go('?seed=3');
    const u4 = await W(p, () => ({ muted: FIF.Game.settings.muted || FIF.Game.urlMute, diff: FIF.Game.difficulty() }));
    check(S, 'plain reload after a ?mute=1 session: not muted, saved difficulty', !u4.muted && u4.diff === 'normal', JSON.stringify(u4));
    // best score per difficulty
    await p.evaluate(HELPERS);
    const playTo = async (score) => {
      await p.click('#btnPlay'); await p.evaluate(HELPERS);
      await W(p, sc => { _h.freeze(); const w = FIF.debug.world; w.score = sc; w.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); }, score);
      await waitMode(p, 'over', 5000); await sleep(800);
      const r = await W(p, () => ({ over: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
      await p.click('#btnOverMenu'); await sleep(100);
      return r;
    };
    const g1 = await playTo(9);
    check(S, 'Game Over shows score and NEW! best', g1.over === '9' && g1.best === '9' && g1.nb, JSON.stringify(g1));
    const g2 = await playTo(4);
    check(S, 'lower score keeps best, no NEW!', g2.over === '4' && g2.best === '9' && !g2.nb, JSON.stringify(g2));
    check(S, 'title shows the best for the current difficulty', (await p.textContent('#bestTitle')) === '9');
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v="hard"]'); await p.click('#scrSettings .btn-back');
    check(S, 'switching to Hard shows Hard\'s best (0)', (await p.textContent('#bestTitle')) === '0', await p.textContent('#bestTitle'));
    const g3 = await playTo(3);
    const bests = await W(p, () => ({ n: localStorage.getItem('fif:best_normal'), h: localStorage.getItem('fif:best_hard'), e: localStorage.getItem('fif:best_easy') }));
    check(S, 'best is stored per difficulty', bests.n === '9' && bests.h === '3' && bests.e == null && g3.best === '3', JSON.stringify(bests));
    // difficulty changed in Pause → Settings during a run: the run's best goes to the difficulty it started with
    await p.click('#btnPlay'); await p.evaluate(HELPERS); await p.keyboard.press('Escape'); await p.click('#btnPauseSettings'); await p.click('#setDifficulty button[data-v="easy"]'); await p.keyboard.press('Escape'); await p.click('#btnResume');
    await W(p, () => { _h.freeze(); const w = FIF.debug.world; w.score = 5; w.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000); await sleep(800); await p.click('#btnOverMenu');
    const b2 = await W(p, () => ({ h: localStorage.getItem('fif:best_hard'), e: localStorage.getItem('fif:best_easy') }));
    check(S, 'mid-run difficulty change: score is saved for the run\'s own difficulty', b2.h === '5' && b2.e == null, JSON.stringify(b2));
    // reset best needs two taps
    await p.click('#btnSettings'); await p.click('#btnResetBest');
    check(S, 'Reset best: first tap only arms ("Sure?")', (await p.textContent('#btnResetBest')) === 'Sure?' && (await W(p, () => localStorage.getItem('fif:best_normal'))) === '9');
    await p.click('#btnResetBest');
    check(S, 'Reset best: second tap clears all bests', (await W(p, () => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('fif:best_' + d) == null))));
    await p.click('#scrSettings .btn-back');
    // bot runs never save a best
    await go('?seed=3&bot=1&speed=8&autostart=1&diff=normal');
    await p.evaluate(HELPERS);
    await W(p, () => { _h.freeze(); const w = FIF.debug.world; w.score = 50; w.hearts = 1; _h.forceSplash(); _h.run(1.3); FIF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000);
    const bb = await W(p, () => ({ saved: localStorage.getItem('fif:best_normal'), shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
    check(S, '?bot=1 run does not save a best score', bb.saved == null, JSON.stringify(bb));
    if (bb.nb) note('bot run Game Over still shows "NEW!" best ' + bb.shown + ' although nothing is saved (cosmetic, test-only)');
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 7. Change Pictures ─────────────────────────────
  await sec(async () => {
    const S = 'pictures';
    const { ctx, p } = await open('?mute=1&seed=7', {}, 'pictures');
    const mk = async (w, h, kind) => Buffer.from(await p.evaluate(([w, h, kind]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (kind === 'photo') { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#fc4'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#c33'; g.fillRect(w * .3, h * .3, w * .4, h * .4); }
      else if (kind === 'cutout') { g.fillStyle = '#e60'; g.beginPath(); g.arc(w / 2, h / 2, w * .35, 0, 7); g.fill(); }
      else { g.fillStyle = '#58c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let i = 0; i < 20; i++) g.fillRect(i * w / 20, h / 2, w / 40, h / 4); }
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h, kind]), 'base64');
    const photo = await mk(800, 600, 'photo'), cut = await mk(300, 300, 'cutout');
    const huge = await mk(6000, 4000, 'bg');
    await p.click('#btnCustomize');
    const choose = async (slotIdx, file) => {
      await p.evaluate(() => document.getElementById('toast').classList.add('hidden'));
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.locator('#slotGrid .slot').nth(slotIdx).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
    };
    const toast = async (re, t = 8000) => { try { await p.waitForFunction(re => !document.getElementById('toast').classList.contains('hidden') && new RegExp(re).test(document.getElementById('toast').textContent), re, { timeout: t }); return true; } catch (_) { return false; } };
    await choose(0, { name: 'family.png', mimeType: 'image/png', buffer: photo });
    check(S, 'photo PNG on Finn → "Picture saved" toast', await toast('saved'));
    const h1 = await W(p, () => ({ custom: FIF.Assets.hasCustom('hero'), shape: FIF.Storage.get('shape_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent }));
    check(S, 'opaque photo becomes a round sticker, card says "Your picture"', h1.custom && h1.shape === 'circle' && /Your picture/.test(h1.tag), JSON.stringify(h1));
    await choose(1, { name: 'cutout.png', mimeType: 'image/png', buffer: cut });
    await toast('saved');
    const l1 = await W(p, () => ({ custom: FIF.Assets.hasCustom('leaf'), shape: FIF.Storage.get('shape_leaf') }));
    check(S, 'transparent PNG on Leaf stays "whole picture" (fit)', l1.custom && l1.shape === 'fit', JSON.stringify(l1));
    // "Round" / "Whole picture" shape buttons
    await p.locator('#slotGrid .slot').nth(1).locator('[data-shape=circle]').click();
    check(S, 'shape button "Round" switches the leaf to a circle', (await W(p, () => FIF.Storage.get('shape_leaf'))) === 'circle');
    await p.locator('#slotGrid .slot').nth(1).locator('[data-shape=fit]').click();
    await sleep(2300);
    await choose(2, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
    check(S, 'non-image file → friendly error toast', await toast('Please choose a picture'));
    check(S, 'non-image file does not change the slot', !(await W(p, () => FIF.Assets.hasCustom('bg_cove'))));
    await sleep(500);
    await choose(2, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png at all') });
    check(S, 'corrupt "PNG" → friendly error toast', await toast('could not be opened'));
    await sleep(500);
    const tHuge = Date.now();
    await choose(2, { name: 'huge.png', mimeType: 'image/png', buffer: huge });
    const okHuge = await toast('saved', 20000);
    const hs = await W(p, async () => {
      const d = FIF.Storage.get('img_bg_cove'); if (!d) return null;
      const im = new Image(); im.src = d; await im.decode();
      return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')) };
    });
    check(S, 'huge 6000×4000 background is accepted', okHuge, (Date.now() - tHuge) + ' ms');
    check(S, 'huge background downscaled (long edge ≤ 1600) and stored small', hs && Math.max(hs.w, hs.h) <= 1600 && hs.kb < 1500, JSON.stringify(hs));
    const heroDim = await W(p, async () => { const im = new Image(); im.src = FIF.Storage.get('img_hero'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
    check(S, 'character pictures stored ≤ 512 px', Math.max(...heroDim) <= 512, heroDim.join('×'));
    await p.click('#scrCustom .btn-back');
    // play with custom pictures (hero, leaf, cove background) without errors
    await p.click('#btnPlay'); await sleep(1500);
    await p.screenshot({ path: OUT + '/func_custom_play.png' });
    check(S, 'game runs with custom pictures', (await mode(p)) === 'playing');
    // persisted across reload
    await p.reload(); await p.waitForFunction(() => FIF.debug && FIF.debug.mode === 'title');
    const pr = await W(p, () => ['hero', 'leaf', 'bg_cove'].map(s => FIF.Assets.hasCustom(s)));
    check(S, 'custom pictures persist across reload', pr.every(Boolean), pr.join(','));
    await p.click('#btnCustomize');
    await p.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click();
    const rs = await W(p, () => ({ c: FIF.Assets.hasCustom('hero'), s: FIF.Storage.get('img_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent }));
    check(S, 'Reset on one card restores the original', !rs.c && rs.s == null && /Original/.test(rs.tag), JSON.stringify(rs));
    await p.click('#btnResetAll');
    const ra = await W(p, () => FIF.Assets.SLOTS.some(s => FIF.Assets.hasCustom(s.id)) || Object.keys(localStorage).some(k => k.startsWith('fif:img_')));
    check(S, 'Reset all removes every custom picture', !ra);
    await p.click('#scrCustom .btn-back');
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 8. layout ─────────────────────────────
  const VIEWS = [
    { name: 'desktop 1280×720', o: { viewport: { width: 1280, height: 720 } } },
    { name: 'desktop 1920×1080', o: { viewport: { width: 1920, height: 1080 } } },
    { name: 'iPad 1024×768', o: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'phone portrait 390×844', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'phone landscape 844×390', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }
  ];
  for (const v of VIEWS) await sec(async () => {
    const S = 'layout ' + v.name;
    const tag = v.name.replace(/[^a-z0-9]+/gi, '_');
    const { ctx, p } = await open('?mute=1&seed=7', v.o, tag);
    await sleep(600);
    const measure = id => p.evaluate(id => {
      const scr = document.getElementById(id), vw = innerWidth, vh = innerHeight;
      const box = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
      const r = box.getBoundingClientRect();
      const bad = [];
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('box ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      if (box.scrollWidth > box.clientWidth + 2) bad.push('h-overflow ' + box.scrollWidth + '>' + box.clientWidth);
      // every visible button/control inside the box horizontally
      for (const el of box.querySelectorAll('button, .slot, .set, h2, h1')) {
        const b = el.getBoundingClientRect(); if (!b.width) continue;
        if (b.left < r.left - 1 || b.right > r.right + 1) bad.push((el.id || el.className || el.tagName) + ' sticks out ' + Math.round(b.left) + '..' + Math.round(b.right));
        if (/BUTTON/.test(el.tagName) && el.scrollWidth > el.clientWidth + 2) bad.push((el.id || el.textContent.trim().slice(0, 14)) + ' text clipped');
      }
      const scrolls = box.scrollHeight > box.clientHeight + 2;
      return { bad: bad.slice(0, 4), scrolls, docW: document.documentElement.scrollWidth, vw };
    }, id);
    const titleM = await measure('scrTitle');
    check(S, 'title fits', titleM.bad.length === 0 && !titleM.scrolls, titleM.bad.join('; '));
    check(S, 'no horizontal page scroll', titleM.docW <= titleM.vw, titleM.docW + ' > ' + titleM.vw);
    await p.screenshot({ path: OUT + '/func_' + tag + '_title.png' });
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await W(p, id => FIF.UI.open(id, 'scrTitle'), id); await sleep(320);
      const m = await measure(id);
      check(S, id + ' panel fits on screen, nothing sticks out', m.bad.length === 0, m.bad.join('; '));
      if (m.scrolls) note(v.name + ': ' + id + ' needs scrolling inside its panel');
      await p.screenshot({ path: OUT + '/func_' + tag + '_' + id + '.png' });
    }
    await W(p, () => FIF.UI.back());
    await W(p, () => FIF.debug.startGame()); await sleep(900);
    const hud = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, cv = document.getElementById('game').getBoundingClientRect();
      return ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, ok: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh && r.left >= cv.left - 1 && r.right <= cv.right + 1 && r.top >= cv.top - 1, size: Math.round(Math.min(r.width, r.height)) }; })
        .concat([{ id: 'canvas', ok: cv.left >= -1 && cv.top >= -1 && cv.right <= vw + 1 && cv.bottom <= vh + 1, size: Math.round(cv.width) + 'x' + Math.round(cv.height) }]);
    });
    check(S, 'HUD buttons and canvas on screen', hud.every(h => h.ok), JSON.stringify(hud));
    if (v.o.hasTouch) check(S, 'HUD buttons ≥ 44 px for fingers', hud.slice(0, 2).every(h => h.size >= 44), hud.slice(0, 2).map(h => h.size).join(','));
    await p.screenshot({ path: OUT + '/func_' + tag + '_play.png' });
    await W(p, () => FIF.Game.pause()); await sleep(300);
    const pm = await measure('scrPause'); check(S, 'pause panel fits', pm.bad.length === 0 && !pm.scrolls, pm.bad.join('; ') + (pm.scrolls ? ' scrolls' : ''));
    await W(p, () => { FIF.Game.resume(); FIF.Game.mode = 'over'; FIF.Game.overAt = performance.now(); FIF.UI.setHud(false); FIF.UI.showGameOver({ score: 128, best: 245, newBest: true, cleared: 3, leaves: 64, moon: 12, landings: 21, bulls: 7, shots: 30, streak: 9, bumps: 3, flutters: 11, reached: 'Lantern Bay (round 2)' }); });
    await sleep(350);
    const om = await measure('scrOver'); check(S, 'game over panel fits (long stats)', om.bad.length === 0 && !om.scrolls, om.bad.join('; ') + (om.scrolls ? ' scrolls' : ''));
    await p.screenshot({ path: OUT + '/func_' + tag + '_over.png' });
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 9. frame time at speed 1 ─────────────────────────────
  await sec(async () => {
    const S = 'perf';
    const { ctx, p } = await open('?mute=1&seed=5&autostart=1&bot=1&diff=normal', {}, 'perf');
    await sleep(1500);
    const r = await p.evaluate(async () => {
      const G = FIF.Game, of = G.frame, work = [], gaps = []; let last = 0;
      G.frame = function (ts) { const t = performance.now(); if (last) gaps.push(t - last); last = t; of.call(this, ts); work.push(performance.now() - t); };
      FIF.debug.setDay(0.85);   // night: darkness overlay is the costliest pass
      await new Promise(r => setTimeout(r, 2500));
      FIF.debug.setDay(0.3);
      await new Promise(r => setTimeout(r, 2500));
      G.frame = of;
      const q = (a, k) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };
      return { n: work.length, p50: q(work, 0.5), p95: q(work, 0.95), max: Math.max(...work), gap95: q(gaps, 0.95) };
    });
    check(S, 'frame work p95 < 20 ms (headless)', r.p95 < 20, `n=${r.n} p50=${r.p50.toFixed(2)} p95=${r.p95.toFixed(2)} max=${r.max.toFixed(1)} ms, frame gap p95=${r.gap95.toFixed(1)} ms`);
    note(`frame work at speed 1: p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, max ${r.max.toFixed(1)} ms over ${r.n} frames`);
    await pageErrs(p, S);
    await ctx.close();
  });

  // ───────────────────────────── 10. long bot soak at ×16 ─────────────────────────────
  await sec(async () => {
    const S = 'soak';
    const { ctx, p } = await open('?mute=1&seed=9&speed=16&bot=1&skill=0.55&autorestart=1&autostart=1&diff=normal', {}, 'soak');
    let maxP = 0, maxFx = 0, maxLeaves = 0, samples = 0, stuck = 0, lastT = -1;
    const t0 = Date.now();
    while (Date.now() - t0 < SOAK_S * 1000) {
      await sleep(500);
      const s = await W(p, () => { const s = FIF.debug.getState(); return { p: s.particles, fx: s.fx, t: s.time, l: s.leaves.length, m: s.mode, ph: s.phase }; });
      samples++; maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxLeaves = Math.max(maxLeaves, s.l);
      if (s.m === 'playing' && s.ph !== 'over' && s.t === lastT) stuck++; lastT = s.t;
    }
    const st = await W(p, () => ({ games: FIF.debug.stats.games, scores: FIF.debug.stats.scores, levels: FIF.debug.stats.levels, shots: FIF.debug.stats.shots, landings: FIF.debug.stats.landings, best: Object.keys(localStorage).filter(k => k.startsWith('fif:best_')) }));
    check(S, SOAK_S + ' s bot run: games finished and auto-restarted', st.games >= 1, JSON.stringify({ games: st.games, shots: st.shots, landings: st.landings, maxLevel: Math.max(0, ...st.levels) }));
    check(S, 'particles always ≤ 160', maxP <= 160, 'max ' + maxP + ' over ' + samples + ' samples');
    check(S, 'renderer fx lists bounded (≤ 40)', maxFx <= 40, 'max ' + maxFx);
    check(S, 'simulation never stalls while playing', stuck === 0, stuck + ' stalled samples');
    check(S, 'bot soak saved no best score', st.best.length === 0, st.best.join(','));
    note(`soak: ${st.games} games, ${st.shots} shots, ${st.landings} landings, scores ${st.scores.slice(0, 8).join('/')}${st.scores.length > 8 ? '…' : ''}`);
    await pageErrs(p, S);
    await ctx.close();
  });

  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' checks passed in ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  fs.writeFileSync(OUT + '/functional.json', JSON.stringify({ results, notes }, null, 1));
  if (fail.length) { console.log('FAILED:\n' + fail.map(f => ' - ' + f.section + ' — ' + f.name + ' [' + f.detail + ']').join('\n')); process.exit(1); }
  console.log('PASS functional');
})().catch(async e => { console.error('CRASH', e); try { await browser.close(); } catch (_) {} process.exit(2); });
