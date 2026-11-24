// Functional QA for Nubi's Farm Fling. PASS/FAIL per check; exits non-zero if any check fails.
//   node tests/e2e/functional.js            (all sections, bot soak 60 s)
//   node tests/e2e/functional.js --quick    (bot soak 15 s, fewer layouts)
// Drives game/index.html over file:// with Chromium. Uses CFF.debug (DESIGN §6) only to read state and to set up
// scoring / growth scenarios; inputs (mouse, touch, keyboard, file picker) go through the real browser events.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const SOAK_S = QUICK ? 15 : 60;

const results = [];
let curSection = '?';
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
async function sec(name, fn) {
  curSection = name;
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
  await p.waitForFunction(() => window.CFF && CFF.debug && CFF.debug.mode && CFF.debug.mode !== 'boot', null, { timeout: 20000 });
  return { ctx, p };
}
const mode = p => p.evaluate(() => CFF.debug.mode);
const ui = p => p.evaluate(() => CFF.UI.current);
const W = (p, fn, arg) => p.evaluate(fn, arg);
async function waitMode(p, m, t = 8000) { try { await p.waitForFunction(m => CFF.debug.mode === m, m, { timeout: t }); return true; } catch (_) { return false; } }
async function waitPhase(p, ph, t = 8000) { try { await p.waitForFunction(ph => CFF.debug.world && CFF.debug.world.phase === ph, ph, { timeout: t }); return true; } catch (_) { return false; } }
const waitPuffable = p => p.waitForFunction(() => CFF.debug.world.phase !== 'fly' || CFF.debug.world.nubi.vy < 3, null, { timeout: 6000 }).catch(() => {});
async function center(p, sel) { const b = await p.locator(sel).boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
async function pageErrs(p, section) {
  const st = await p.evaluate(() => CFF.debug.stats.errors.slice()).catch(() => []);
  const all = p._errs.concat(st);
  check(section, 'no console / page / frame errors', all.length === 0, all.slice(0, 3).join(' | '));
}

// in-page helpers (installed per page): run world sub-steps synchronously so frames cannot interleave
const HELPERS = () => {
  const G = CFF.Game, C = CFF.World.CONFIG;
  window._h = {
    freeze() { CFF.debug.setSpeed(0); },
    run(sec) { const w = G.world, ev = []; const n = Math.round(sec / C.STEP); for (let i = 0; i < n; i++) { w.update(C.STEP); ev.push(...w.drainEvents()); } G.handleEvents(ev); return ev; },
    runUntil(pred, maxSec) { const w = G.world, ev = []; const n = Math.round((maxSec || 5) / C.STEP); for (let i = 0; i < n; i++) { w.update(C.STEP); ev.push(...w.drainEvents()); if (pred(w)) break; } G.handleEvents(ev); return ev; },
    toAim() { return this.runUntil(w => w.phase === 'aim', 5); },
    // put Nubi into flight with the given props (nothing else in the sky unless kept)
    fly(props, keep) {
      const w = G.world, n = w.nubi;
      if (!keep) { w.flies = []; w.crows = []; }
      w.phase = 'fly'; w.phaseT = 0; w.pull = null; w.puffed = w.fluttered = false;
      Object.assign(n, { vx: 0, vy: -2, state: 'fly', flightT: 0, bonkT: 0, puffT: 0, spin: 0, rot: 0 }, props);
      n.px = n.x; n.py = n.y;
    },
    // Nubi falling just above the wagon soil at offset `off` from its centre (optionally at a given size)
    forceLand(off, size) {
      const w = G.world; this.toAim(); if (size) w.setSize(size);
      const s = w.nubi.size;
      this.fly({ x: w.wagon.x + off, y: w.wagon.top + C.FOOT * s + 0.015 });
      return this.runUntil(w => w.phase !== 'fly', 1);
    },
    forcePlop(size) {
      const w = G.world; this.toAim(); if (size) w.setSize(size);
      const s = w.nubi.size, x = Math.max(C.BALE_X + 0.3, w.wagon.x - w.wagon.hw - CFF.World.padAt(s) - 1.2);
      this.fly({ x, y: C.FOOT * s + 0.015 });
      return this.runUntil(w => w.phase !== 'fly', 1);
    },
    forceFlop() {
      const w = G.world; this.toAim();
      const s = w.nubi.size;
      this.fly({ x: 3.2, y: C.BALE_TOP + C.FOOT * s + 0.015 });
      return this.runUntil(w => w.phase !== 'fly', 1);
    },
    // a firefly right on the flying Nubi; returns the events of one step; then back to a fresh aim
    grabFly(kind) {
      const w = G.world; this.toAim(); w.crows = [];
      this.fly({ x: 8, y: 5, vx: 1, vy: 0 });
      const value = kind === 'gold' ? C.POINTS.gold : C.POINTS.fly;
      w.flies = [{ id: 99999, x: 8, y: 5, y0: 5, px: 8, py: 5, kind, value, taken: false, t: 0, ph: 0 }];
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
  await sec('boot', async () => {
    const S = 'boot';
    const { ctx, p } = await open('?mute=1&seed=7', {}, 'boot');
    check(S, 'reaches the title screen', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    await sleep(2500);
    const st = await W(p, () => ({ t: CFF.debug.world.time, hud: document.getElementById('hud').classList.contains('hidden'), title: document.title, ns: !!window.FIF }));
    check(S, 'title bot demo is running behind the menu', st.t > 1, 't=' + st.t.toFixed(2));
    check(S, 'HUD hidden on the title', st.hud);
    check(S, 'page title is "Nubi\'s Farm Fling", no FIF namespace left', st.title === "Nubi's Farm Fling" && !st.ns, st.title);
    const missing = p._warns.filter(w => /missing image/.test(w));
    check(S, 'no missing images', missing.length === 0, missing.join(' | '));
    const imgs = await W(p, () => Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')));
    check(S, 'all <img> in the menus load', imgs.length === 0, imgs.join(','));
    const focus = await W(p, () => document.activeElement && document.activeElement.id);
    check(S, 'Play button has keyboard focus', focus === 'btnPlay', focus);
    const ws = await W(p, () => { const s = CFF.debug.getState(); return { n: s.nubi && s.nubi.size, w: !!s.wagon, flies: s.flies.length, phase: s.phase }; });
    check(S, 'getState() exposes nubi / wagon / flies', ws.n >= 1 && ws.w && ws.flies >= 0, JSON.stringify(ws));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 2. menus + Esc/back ─────────────────────────────
  await sec('menus', async () => {
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
    const slots = await W(p, () => Array.from(document.querySelectorAll('#slotGrid .slot')).map(s => s.querySelector('b, h3, .name') ? s.querySelector('b, h3, .name').textContent.trim() : s.textContent.trim().slice(0, 20)));
    check(S, 'Change Pictures shows 6 picture cards', slots.length === 6, slots.join(' | '));
    await p.keyboard.press('Escape'); check(S, 'Esc on Change Pictures → title', (await ui(p)) === 'scrTitle');
    await p.click('#btnCustomize'); await p.click('#scrCustom .btn-back'); check(S, 'Change Pictures Done → title', (await ui(p)) === 'scrTitle');
    await p.keyboard.press('Escape'); check(S, 'Esc on title does nothing', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');
    // play + pause screen
    await p.click('#btnPlay'); check(S, 'Play starts a run', (await mode(p)) === 'playing' && (await ui(p)) === null);
    check(S, 'HUD visible while playing', await p.isVisible('#btnPause'));
    await sleep(400);
    await p.keyboard.press('Escape'); check(S, 'Esc while playing → Pause', (await mode(p)) === 'paused' && (await ui(p)) === 'scrPause');
    check(S, 'HUD hidden on the pause screen', !(await p.isVisible('#btnPause')));
    await p.keyboard.press('Escape'); check(S, 'Esc on Pause → resume', (await mode(p)) === 'playing');
    await p.keyboard.press('KeyP'); check(S, 'P → Pause', (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); check(S, 'Pause → Settings', (await ui(p)) === 'scrSettings' && (await mode(p)) === 'paused');
    await p.keyboard.press('Escape'); check(S, 'Esc on Settings (from pause) → back to Pause, still paused', (await ui(p)) === 'scrPause' && (await mode(p)) === 'paused');
    await p.click('#btnResume'); check(S, 'Resume button → playing', (await mode(p)) === 'playing');
    await p.click('#btnPause'); await p.click('#btnRestart');
    const rs = await W(p, () => ({ m: CFF.debug.mode, shots: CFF.debug.world.shots, t: CFF.debug.world.time }));
    check(S, 'Pause → Restart starts a fresh run', rs.m === 'playing' && rs.shots === 0 && rs.t < 1, JSON.stringify(rs));
    await p.click('#btnPause'); await p.click('#btnPauseMenu'); check(S, 'Pause → Main Menu → title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
    // game over screen + its buttons
    await p.click('#btnPlay'); await p.evaluate(HELPERS);
    await W(p, () => { _h.freeze(); CFF.debug.world.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); });
    const over = await waitMode(p, 'over', 5000);
    check(S, 'last heart lost → Game Over screen', over && (await ui(p)) === 'scrOver');
    const ot = await p.textContent('#scrOver .over-title');
    if (/voyage/i.test(ot)) note('Game Over title still says "' + ot + '" (fox-game leftover)');
    const os = await p.textContent('#overStats');
    check(S, 'Game Over stats talk about fireflies / waterings / Biggest Nubi', /Fireflies/.test(os) && /Waterings/.test(os) && /Biggest Nubi/.test(os), os.slice(0, 90));
    await sleep(800);
    await p.click('#btnOverMenu'); check(S, 'Game Over → Menu → title', (await mode(p)) === 'title');
    await p.click('#btnPlay');
    await W(p, () => { _h.freeze(); CFF.debug.world.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000); await sleep(800);
    await p.click('#btnAgain'); check(S, 'Game Over → Play Again → new run', (await mode(p)) === 'playing' && (await W(p, () => CFF.debug.world.shots)) === 0);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 3. mouse + keyboard input ─────────────────────────────
  await sec('input-desktop', async () => {
    const S = 'input-desktop';
    const { ctx, p } = await open('?mute=1&seed=7&autostart=1&diff=easy', {}, 'input');
    await p.evaluate(HELPERS);
    await p.evaluate(() => { window._refill = setInterval(() => { const w = CFF.debug.world; if (w && w.phase !== 'over' && CFF.Game.deadT < 0 && !window._noRefill) w.hearts = w.maxHearts; }, 30); });
    await sleep(1200);
    // a real mouse drag back and release
    await p.mouse.move(640, 300); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(640 - i * 9, 300 + i * 8); await sleep(16); }
    const pull = await W(p, () => CFF.debug.world.pull);
    check(S, 'mouse drag back pulls the band (down-left)', pull && pull.x < -0.5 && pull.y < -0.5, JSON.stringify(pull));
    const pv = await W(p, () => ({ c: CFF.debug.world.previewCount(), n: CFF.debug.world.preview().length, st: CFF.debug.world.nubi.state }));
    check(S, 'dotted preview shown while aiming, Nubi in "pull" pose', pv.c > 0 && pv.n > 0 && pv.st === 'pull', JSON.stringify(pv));
    await p.mouse.up();
    check(S, 'mouse release flings', (await W(p, () => CFF.debug.world.phase)) === 'fly');
    await sleep(120); await waitPuffable(p);
    await p.mouse.click(640, 300); await sleep(80); await p.mouse.click(640, 300); await sleep(80); await p.mouse.click(400, 200);
    const fl = await W(p, () => ({ f: CFF.debug.world.puffed, n: CFF.debug.world.stats.puffs }));
    check(S, 'tap in flight puffs, three taps → exactly one puff', fl.f && fl.n === 1, JSON.stringify(fl));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // tap while still shooting up: ignored and NOT used up
    await W(p, () => { CFF.debug.aim(-1.3, -1.2); CFF.debug.release(); });
    await p.mouse.click(640, 300);
    const up = await W(p, () => ({ puffed: CFF.debug.world.puffed, vy: CFF.debug.world.nubi.vy }));
    check(S, 'tap while Nubi still rises fast does not use the puff', !up.puffed && up.vy > 3.2, JSON.stringify(up));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // tiny drag (3 px): no pull, no fling
    const shots0 = await W(p, () => CFF.debug.world.shots);
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(637, 302); await p.mouse.up();
    let s = await W(p, () => ({ ph: CFF.debug.world.phase, pull: CFF.debug.world.pull, shots: CFF.debug.world.shots }));
    check(S, 'tiny 3 px drag cancels (no fling)', s.ph === 'aim' && !s.pull && s.shots === shots0, JSON.stringify(s));
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(630, 308, { steps: 3 }); await p.mouse.up();
    s = await W(p, () => ({ ph: CFF.debug.world.phase, pull: CFF.debug.world.pull, shots: CFF.debug.world.shots }));
    check(S, 'short drag under PULL_MIN cancels on release', s.ph === 'aim' && !s.pull && s.shots === shots0, JSON.stringify(s));
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(560, 370, { steps: 5 }); await p.mouse.move(641, 300, { steps: 5 }); await p.mouse.up();
    s = await W(p, () => ({ ph: CFF.debug.world.phase, shots: CFF.debug.world.shots }));
    check(S, 'drag out and back to the start cancels', s.ph === 'aim' && s.shots === shots0, JSON.stringify(s));
    await p.mouse.move(640, 300); await p.mouse.down({ button: 'right' }); await p.mouse.move(560, 370, { steps: 5 }); await p.mouse.up({ button: 'right' });
    s = await W(p, () => ({ ph: CFF.debug.world.phase, shots: CFF.debug.world.shots }));
    check(S, 'right-button drag does not fling', s.ph === 'aim' && s.shots === shots0, JSON.stringify(s));
    // keyboard: arrows aim, Space flings, Space again puffs once
    await p.keyboard.down('ArrowUp'); await sleep(300); await p.keyboard.up('ArrowUp');
    const k1 = await W(p, () => ({ pull: CFF.debug.world.pull, ang: CFF.Game.kb.ang, pow: CFF.Game.kb.pow }));
    check(S, 'ArrowUp aims (pull set, angle up)', k1.pull && k1.ang > 45, JSON.stringify(k1));
    await p.keyboard.down('ArrowRight'); await sleep(250); await p.keyboard.up('ArrowRight');
    const k2 = await W(p, () => CFF.Game.kb.pow);
    check(S, 'ArrowRight adds power', k2 > k1.pow, k1.pow.toFixed(2) + '→' + k2.toFixed(2));
    await p.keyboard.down('ArrowDown'); await sleep(200); await p.keyboard.up('ArrowDown');
    const k3 = await W(p, () => CFF.Game.kb.ang);
    check(S, 'ArrowDown lowers the angle', k3 < k1.ang, k3.toFixed(1));
    await p.keyboard.down('ArrowLeft'); await sleep(200); await p.keyboard.up('ArrowLeft');
    const k4 = await W(p, () => CFF.Game.kb.pow);
    check(S, 'ArrowLeft lowers the power', k4 < k2, k4.toFixed(2));
    const p0 = await W(p, () => CFF.debug.world.stats.puffs);
    await p.keyboard.press('Space');
    check(S, 'Space flings', (await W(p, () => CFF.debug.world.phase)) === 'fly');
    await sleep(100); await waitPuffable(p);
    await p.keyboard.press('Space'); await sleep(50); await p.keyboard.press('Space');
    const kf = await W(p, () => CFF.debug.world.stats.puffs);
    check(S, 'Space in flight puffs exactly once', kf === p0 + 1, 'puffs ' + p0 + '→' + kf);
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // held Space (auto-repeat) does not fling + puff in one press
    await p.keyboard.down('Space'); await sleep(40);
    for (let i = 0; i < 4; i++) await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true })));
    await p.keyboard.up('Space');
    const hs = await W(p, () => ({ ph: CFF.debug.world.phase, fl: CFF.debug.world.puffed }));
    check(S, 'held Space (auto-repeat) = fling only, no instant puff', hs.ph === 'fly' && !hs.fl, JSON.stringify(hs));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    // keyboard aim then a plain mouse tap: must not fling
    await p.keyboard.down('ArrowUp'); await sleep(150); await p.keyboard.up('ArrowUp');
    const sk = await W(p, () => CFF.debug.world.shots);
    await p.mouse.click(640, 300);
    s = await W(p, () => ({ ph: CFF.debug.world.phase, shots: CFF.debug.world.shots }));
    check(S, 'keyboard aim + plain tap does not fling', s.ph === 'aim' && s.shots === sk, JSON.stringify(s));
    // HUD buttons must not fling / puff
    const shotsA = await W(p, () => CFF.debug.world.shots);
    const muted0 = await W(p, () => CFF.Game.settings.muted || CFF.Game.urlMute);
    await p.click('#btnMuteHud');
    const m1 = await W(p, () => ({ muted: CFF.Game.settings.muted || CFF.Game.urlMute, ph: CFF.debug.world.phase, pull: CFF.debug.world.pull, shots: CFF.debug.world.shots }));
    check(S, 'mouse click on mute toggles sound and does not aim/fling', m1.muted !== muted0 && m1.ph === 'aim' && !m1.pull && m1.shots === shotsA, JSON.stringify(m1));
    const foc = await W(p, () => document.activeElement && document.activeElement.id);
    await p.keyboard.press('Space');
    const m2 = await W(p, () => ({ muted: CFF.Game.settings.muted || CFF.Game.urlMute, ph: CFF.debug.world.phase, shots: CFF.debug.world.shots }));
    check(S, 'focused mute button + Space → one fling, mute not toggled again', m2.muted === m1.muted && m2.ph === 'fly' && m2.shots === shotsA + 1, 'focus=' + foc + ' ' + JSON.stringify(m2));
    await waitPuffable(p);
    await p.keyboard.press('Enter');
    const m3 = await W(p, () => ({ muted: CFF.Game.settings.muted || CFF.Game.urlMute, fl: CFF.debug.world.puffed }));
    check(S, 'focused mute button + Enter in flight → puff, mute not toggled', m3.muted === m1.muted && m3.fl, JSON.stringify(m3));
    await waitPhase(p, 'aim', 8000); await sleep(200);
    await p.click('#btnMuteHud');
    // pause button during flight: no puff
    await p.keyboard.press('Space'); await sleep(80);
    const f0 = await W(p, () => CFF.debug.world.stats.puffs);
    await p.click('#btnPause');
    const pz = await W(p, () => ({ m: CFF.debug.mode, f: CFF.debug.world.stats.puffs, fl: CFF.debug.world.puffed }));
    check(S, 'mouse click on Pause during flight pauses without a puff', pz.m === 'paused' && pz.f === f0 && !pz.fl, JSON.stringify(pz));
    await sleep(100);
    const fr = await W(p, () => document.activeElement && document.activeElement.id);
    await p.keyboard.press('Space');
    const rz = await W(p, () => ({ m: CFF.debug.mode, fl: CFF.debug.world.puffed, focus: document.activeElement && document.activeElement.id }));
    check(S, 'Space on focused Resume → playing, no puff, focus left the button', rz.m === 'playing' && !rz.fl && !rz.focus, 'focused=' + fr + ' ' + JSON.stringify(rz));
    // pause while dragging cancels the aim
    await waitPhase(p, 'aim', 8000); await sleep(200);
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(560, 370, { steps: 5 });
    await p.keyboard.press('Escape');
    await p.mouse.up();
    const pd = await W(p, () => ({ m: CFF.debug.mode, ph: CFF.debug.world.phase, pull: CFF.debug.world.pull }));
    check(S, 'Esc during a drag pauses and cancels the pull (release does not fire)', pd.m === 'paused' && pd.ph === 'aim' && !pd.pull, JSON.stringify(pd));
    await p.click('#btnResume');
    const mk0 = await W(p, () => CFF.Game.settings.muted || CFF.Game.urlMute);
    await p.keyboard.press('KeyM');
    check(S, 'M toggles sound', (await W(p, () => CFF.Game.settings.muted || CFF.Game.urlMute)) !== mk0);
    await p.keyboard.press('KeyM');
    // title: focused "How to Play" + Enter opens only How (no game start)
    await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(100);
    await p.focus('#btnHow'); await p.keyboard.press('Enter');
    const th = await W(p, () => ({ m: CFF.debug.mode, ui: CFF.UI.current }));
    check(S, 'title: focused How to Play + Enter opens How only', th.m === 'title' && th.ui === 'scrHow', JSON.stringify(th));
    await sleep(80); await p.keyboard.press('Enter');
    check(S, 'Enter on How ("OK") → title', (await ui(p)) === 'scrTitle');
    await sleep(80);
    await p.focus('#btnPlay');
    const g0 = await W(p, () => CFF.debug.stats.games);
    await p.keyboard.press('Space');
    const ts = await W(p, () => ({ m: CFF.debug.mode, shots: CFF.debug.world.shots, ph: CFF.debug.world.phase, t: CFF.debug.world.time }));
    check(S, 'title: Space on focused Play starts the game once (no instant fling, no double start)', ts.m === 'playing' && ts.shots === 0 && ts.ph === 'aim' && ts.t < 0.5, JSON.stringify(ts));
    await sleep(100);
    await p.keyboard.press('Enter');
    check(S, 'Enter while playing flings (keyboard aim)', (await W(p, () => CFF.debug.world.shots)) === 1);
    // restart lock after game over
    await p.evaluate(() => { window._noRefill = true; });
    await W(p, () => { _h.freeze(); CFF.debug.world.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000);
    await p.keyboard.press('Enter'); await p.keyboard.press('Space');
    await p.mouse.click(10, 10);
    const lk = await mode(p);
    check(S, 'restart lock: Enter/Space/click right after Game Over do nothing', lk === 'over', lk);
    try { await p.locator('#btnAgain').click({ timeout: 300, force: true }); } catch (_) {}
    check(S, 'restart lock: Play Again click within 0.7 s ignored', (await mode(p)) === 'over');
    await sleep(800);
    await p.keyboard.press('Enter');
    const ag = await W(p, () => ({ m: CFF.debug.mode, shots: CFF.debug.world.shots }));
    check(S, 'Enter after the lock → exactly one new run (no fling carried over)', ag.m === 'playing' && ag.shots === 0, JSON.stringify(ag));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 4. touch input ─────────────────────────────
  await sec('input-touch', async () => {
    const S = 'input-touch';
    const { ctx, p } = await open('?mute=1&seed=7&autostart=1&diff=easy', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'touch');
    await p.evaluate(() => { setInterval(() => { const w = CFF.debug.world; if (w && w.phase !== 'over' && CFF.Game.deadT < 0) w.hearts = w.maxHearts; }, 30); });
    const cdp = await ctx.newCDPSession(p);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const drag = async (x0, y0, x1, y1, n = 8) => { await touch('touchStart', x0, y0); for (let i = 1; i <= n; i++) { await touch('touchMove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await sleep(16); } };
    const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(30); await touch('touchEnd', x, y); };
    await sleep(1200);
    check(S, 'touch device detected (body.touch)', await W(p, () => document.body.classList.contains('touch') && CFF.Game.isTouch));
    await drag(420, 180, 360, 230);
    const tp = await W(p, () => CFF.debug.world.pull);
    check(S, 'touch drag pulls the band', tp && tp.x < -0.5 && tp.y < -0.5, JSON.stringify(tp));
    await touch('touchEnd', 360, 230);
    check(S, 'touch release flings', (await W(p, () => CFF.debug.world.phase)) === 'fly');
    await sleep(100); await waitPuffable(p);
    await tapAt(500, 150); await sleep(60); await tapAt(500, 150);
    const tf = await W(p, () => CFF.debug.world.stats.puffs);
    check(S, 'touch taps in flight → exactly one puff', tf === 1, tf);
    await waitPhase(p, 'aim', 8000); await sleep(200);
    const sh0 = await W(p, () => CFF.debug.world.shots);
    await drag(420, 180, 422, 181, 2); await touch('touchEnd', 422, 181);
    check(S, 'tiny touch wiggle does not fling', (await W(p, () => CFF.debug.world.shots)) === sh0 && (await W(p, () => CFF.debug.world.phase)) === 'aim');
    const mc = await center(p, '#btnMuteHud');
    const mu0 = await W(p, () => CFF.Game.settings.muted || CFF.Game.urlMute);
    await tapAt(mc.x, mc.y); await sleep(100);
    const mu1 = await W(p, () => ({ m: CFF.Game.settings.muted || CFF.Game.urlMute, pull: CFF.debug.world.pull, shots: CFF.debug.world.shots }));
    check(S, 'touch on mute toggles sound once, no pull', mu1.m !== mu0 && !mu1.pull && mu1.shots === sh0, JSON.stringify(mu1));
    await sleep(700); await tapAt(mc.x, mc.y); await sleep(700);
    await drag(420, 180, 360, 230); await touch('touchEnd', 360, 230); await sleep(60);
    const pc = await center(p, '#btnPause');
    await tapAt(pc.x, pc.y); await sleep(100);
    const tz = await W(p, () => ({ m: CFF.debug.mode, fl: CFF.debug.world.puffed }));
    check(S, 'touch on Pause during flight → paused, no puff', tz.m === 'paused' && !tz.fl, JSON.stringify(tz));
    const rc = await center(p, '#btnResume');
    await sleep(650);
    await tapAt(rc.x, rc.y); await sleep(100);
    check(S, 'touch on Resume → playing', (await mode(p)) === 'playing');
    await waitPhase(p, 'aim', 8000); await sleep(200);
    await p.evaluate(([px, py]) => {
      const fire = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      const cv = document.getElementById('game'), stage = document.getElementById('stage'), bp = document.getElementById('btnPause');
      fire(cv, 'pointerdown', 21, 420, 180);
      for (let i = 1; i <= 6; i++) fire(cv, 'pointermove', 21, 420 - i * 9, 180 + i * 7);
      window._twoPull = CFF.debug.world.pull && { x: CFF.debug.world.pull.x, y: CFF.debug.world.pull.y };
      fire(bp, 'pointerdown', 22, px, py);
      fire(bp, 'pointerup', 22, px, py);
      fire(stage, 'pointerup', 21, 366, 222);
    }, [pc.x, pc.y]);
    await sleep(100);
    const two = await W(p, () => ({ m: CFF.debug.mode, ph: CFF.debug.world.phase, pull: CFF.debug.world.pull, pulledFirst: !!window._twoPull }));
    check(S, 'second-finger tap on Pause while dragging → paused, aim cancelled, no fling', two.pulledFirst && two.m === 'paused' && two.ph === 'aim' && !two.pull, JSON.stringify(two));
    const scroll = await W(p, () => ({ x: scrollX, y: scrollY, sc: visualViewport ? visualViewport.scale : 1 }));
    check(S, 'page never scrolls or zooms during touch play', scroll.x === 0 && scroll.y === 0 && scroll.sc === 1, JSON.stringify(scroll));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 5. scoring rules, hearts, levels ─────────────────────────────
  await sec('rules', async () => {
    const S = 'rules';
    const { ctx, p } = await open('?mute=1&seed=11&autostart=1&diff=easy', {}, 'rules');
    await p.evaluate(HELPERS);
    await sleep(500);
    const r = await W(p, () => {
      _h.freeze();
      const w = CFF.debug.world, C = CFF.World.CONFIG, out = {};
      // a real fling with the level's solution arc lands on the wagon and gets fireflies
      _h.toAim(); w.setSize(1);
      _h.run(w.solution ? w.solution.wait : 1.0);
      const sol = w.solution, n0 = w.flies.filter(f => !f.bonus).length, sc0 = w.score;
      w.aim(sol.pull.x, sol.pull.y); w.release();
      const ev0 = _h.runUntil(w => w.phase !== 'fly', 8);
      out.solution = { phase: w.phase, flies: ev0.filter(e => e.type === 'fly').length, onArc: n0, dScore: w.score - sc0 };
      w.score = 0; w.streak = 0; w.flyCount = 0;
      _h.toAim(); w.setSize(1);
      let s = w.score; let ev = _h.grabFly('fly'); out.fly = { d: w.score - s, ev: ev.filter(e => e.type === 'fly').map(e => e.value + ':' + e.kind) };
      s = w.score; ev = _h.grabFly('gold'); out.gold = { d: w.score - s, ev: ev.filter(e => e.type === 'fly').map(e => e.value + ':' + e.kind), goldStat: w.stats.goldFlies };
      w.streak = 0;
      s = w.score; ev = _h.forceLand(w.wagon.hw * 0.8, 1); let land = ev.find(e => e.type === 'land');
      out.land1 = { d: w.score - s, bull: land && land.bull, big: land && land.big, streak: w.streak, pts: land && land.points };
      s = w.score; ev = _h.forceLand(0, 1); land = ev.find(e => e.type === 'land');
      out.bull2 = { d: w.score - s, bull: land && land.bull, streak: w.streak };
      out.streak = [];
      for (let i = 0; i < 5; i++) { s = w.score; _h.forceLand(w.wagon.hw * 0.8, 1); out.streak.push(w.score - s); }
      // plop: −1 heart, streak reset, no points
      const h0 = w.hearts; s = w.score; ev = _h.forcePlop(1);
      out.plop = { dh: w.hearts - h0, d: w.score - s, streak: w.streak, ev: ev.filter(e => e.type === 'plop' || e.type === 'heartLost').length, phase: w.phase };
      _h.run(1.3);
      // big shower: size ≥ BIG_AT on landing → +2 (first landing after the plop: no streak bonus)
      s = w.score; const bs0 = w.stats.bigShowers; ev = _h.forceLand(w.wagon.hw * 0.8, 1.5); land = ev.find(e => e.type === 'land');
      out.big = { d: w.score - s, big: land && land.big, bull: land && land.bull, stat: w.stats.bigShowers - bs0, size: land && +land.size.toFixed(3), shrinkTo: land && +land.shrinkTo.toFixed(3) };
      // bull + big + streak 2 = 2 + 3 + 2 + 1
      s = w.score; ev = _h.forceLand(0, 1.6); out.bullBig = w.score - s;
      // just under BIG_AT: not big
      w.streak = 0; s = w.score; ev = _h.forceLand(w.wagon.hw * 0.8, 1.38); land = ev.find(e => e.type === 'land'); out.notBig = { d: w.score - s, big: land && land.big };
      // flop on the hay bale: no heart lost, same shot retried
      _h.toAim(); const fh = w.hearts, fs = w.shots, fsc = w.score, wx = w.wagon.x;
      ev = _h.forceFlop(); const flopEv = ev.find(e => e.type === 'flop');
      const ev2 = _h.runUntil(w => w.phase === 'aim', 3);
      const ns = ev2.find(e => e.type === 'newShot');
      out.flop = { flop: !!flopEv, hearts: w.hearts - fh, shots: w.shots - fs, score: w.score - fsc, retry: ns && ns.retry, phase: w.phase };
      // heart back at every heartEvery fireflies
      const HE = w.D.heartEvery || C.HEART_EVERY;
      _h.toAim(); w.hearts = w.maxHearts - 1; w.flyCount = HE - 1;
      ev = _h.grabFly('fly'); out.heartN = { hearts: w.hearts, max: w.maxHearts, ev: ev.some(e => e.type === 'heartGain'), HE };
      w.flyCount = 2 * HE - 1; _h.grabFly('fly'); out.heartCap = { hearts: w.hearts, max: w.maxHearts };
      w.flyCount = 2 * HE; w.hearts = w.maxHearts - 2; _h.grabFly('fly'); out.heartOff = w.hearts === w.maxHearts - 2;
      return out;
    });
    check(S, 'solution-arc fling lands on the wagon', r.solution.phase === 'land', JSON.stringify(r.solution));
    check(S, 'solution-arc fling gulps the on-arc fireflies', r.solution.flies >= Math.min(1, r.solution.onArc), JSON.stringify(r.solution));
    check(S, 'firefly = +1 (fly event value 1)', r.fly.d === 1 && r.fly.ev[0] === '1:fly', JSON.stringify(r.fly));
    check(S, 'golden firefly = +3 (and counted as golden)', r.gold.d === 3 && r.gold.ev[0] === '3:gold' && r.gold.goldStat >= 1, JSON.stringify(r.gold));
    check(S, 'watering off the patch = +2', r.land1.d === 2 && !r.land1.bull && !r.land1.big && r.land1.streak === 1, JSON.stringify(r.land1));
    check(S, 'bullseye = +2 +3 (+1 streak) = 6', r.bull2.d === 6 && r.bull2.bull && r.bull2.streak === 2, JSON.stringify(r.bull2));
    check(S, 'streak bonus +1 per step, capped at +4', JSON.stringify(r.streak) === JSON.stringify([4, 5, 6, 6, 6]), JSON.stringify(r.streak));
    check(S, 'plop costs exactly one heart, no points, resets streak', r.plop.dh === -1 && r.plop.d === 0 && r.plop.streak === 0 && r.plop.ev === 2 && r.plop.phase === 'plop', JSON.stringify(r.plop));
    check(S, 'Big Shower (size 1.5) = +2 +2, first landing after a plop has no streak bonus', r.big.d === 4 && r.big.big && !r.big.bull && r.big.stat === 1, JSON.stringify(r.big));
    check(S, 'bull + big + streak 2 = 2+3+2+1 = 8', r.bullBig === 8, r.bullBig);
    check(S, 'size 1.38 (< BIG_AT 1.4) is not a Big Shower', r.notBig.d === 2 && !r.notBig.big, JSON.stringify(r.notBig));
    check(S, 'flop on the hay bale: no heart, no points, same shot retried', r.flop.flop && r.flop.hearts === 0 && r.flop.score === 0 && r.flop.shots === 0 && r.flop.retry === true && r.flop.phase === 'aim', JSON.stringify(r.flop));
    check(S, 'every heartEvery fireflies gives a heart back', r.heartN.hearts === r.heartN.max && r.heartN.ev && r.heartN.HE === 12, JSON.stringify(r.heartN));
    check(S, 'heart bonus never exceeds max hearts', r.heartCap.hearts === r.heartCap.max, JSON.stringify(r.heartCap));
    check(S, 'a firefly count that is not a multiple gives no heart', r.heartOff);

    // ── growth twist ──
    const g = await W(p, () => {
      const w = CFF.debug.world, C = CFF.World.CONFIG, out = {};
      _h.toAim();
      // slow growth while aiming
      w.setSize(1); const ev0 = _h.run(10); out.aim10 = +w.nubi.size.toFixed(4);
      out.grow0 = ev0.filter(e => e.type === 'grow').map(e => e.size);
      // per firefly: goal +GROW_FLY, eased (no pop)
      w.setSize(1.2); let g0 = w.nubi.goal; _h.grabFly('fly'); out.dFly = +(w.nubi.goal - g0).toFixed(4); out.noPop = w.nubi.size < w.nubi.goal;
      w.setSize(1.2); g0 = w.nubi.goal; _h.grabFly('gold'); out.dGold = +(w.nubi.goal - g0).toFixed(4);
      _h.run(1.5); out.eased = Math.abs(w.nubi.size - w.nubi.goal) < 0.01;
      // cap
      w.setSize(1.68); _h.grabFly('gold'); _h.grabFly('gold'); _h.run(2); out.cap = { goal: w.nubi.goal, size: w.nubi.size };
      w.setSize(9); out.setClamp = w.nubi.size; w.setSize(0.2); out.setClampLo = w.nubi.size;
      // grow + big events
      w.setSize(1.15); let ev = _h.grabFly('gold').concat(_h.run(1.5)); out.growEv = ev.filter(e => e.type === 'grow').map(e => e.size);
      w.setSize(1.36); ev = _h.grabFly('gold').concat(_h.run(1.5)); out.bigEv = ev.filter(e => e.type === 'big').length;
      // pickup radius grows with size
      const reach = s => { _h.toAim(); w.setSize(s); _h.fly({ x: 8, y: 5, vx: 0.001, vy: 0 });
        const d = C.R_NUBI * 1.4 + C.R_FLY;   // between the radius at size 1 and size 1.7
        w.flies = [{ id: 88888, x: 8 + d, y: 5, y0: 5, px: 8 + d, py: 5, kind: 'fly', value: 1, taken: false, t: 0, ph: -Math.PI / 2 * 0 }];
        w.flies[0].ph = 0; const e = _h.run(C.STEP); const got = e.some(x => x.type === 'fly'); w.phase = 'aim'; w._newShot(false); w.drainEvents(); return got; };
      out.reach1 = reach(1); out.reach17 = reach(1.7);
      // landing uses up water: size → 1 + (s−1)·RAIN_KEEP, eased over the rain phase
      let e2 = _h.forceLand(w.wagon.hw * 0.5, 1.6); let land = e2.find(e => e.type === 'land');
      out.shrinkTo = land && +land.shrinkTo.toFixed(3); out.landSize = land && +land.size.toFixed(3);
      const mid = []; for (let i = 0; i < 4; i++) { _h.run(0.25); mid.push(+w.nubi.size.toFixed(3)); }
      out.shrinkPath = mid;
      _h.toAim(); out.afterLand = +w.nubi.size.toFixed(3);
      // plop squeezes PLOP_LOSS out, never below 1
      _h.forcePlop(1.5); out.plopGoal = +w.nubi.goal.toFixed(3); _h.run(1.3);
      w.hearts = w.maxHearts; _h.forcePlop(1.1); out.plopGoalLo = +w.nubi.goal.toFixed(3); _h.run(1.3);
      w.hearts = w.maxHearts;
      // the twist: the same pull flies shorter when big; the preview matches the real flight
      _h.toAim(); w.crows = [];
      const shot = s => { w.setSize(s); w.flies = []; return w.predictShot({ x: -1.3, y: -1.0 }, 0); };
      const a = shot(1), b = shot(1.7); out.short = { x1: +a.x.toFixed(2), x17: +b.x.toFixed(2), t1: a.type, t17: b.type };
      w.setSize(1.5); w.aim(-1.25, -1.05);
      const pv = w.preview(2000, C.STEP); const last = pv[pv.length - 1];
      w.release(); _h.runUntil(w => w.phase !== 'fly', 10);
      out.previewVsReal = { px: +last.x.toFixed(3), rx: +w.nubi.x.toFixed(3), ps: +last.size.toFixed(3) };
      _h.run(1.5); w.hearts = w.maxHearts; _h.toAim();
      // size kept on a new level
      w.setSize(1.5); w.gotoLevel(1); CFF.Game.handleEvents(w.drainEvents()); out.keepLevel = +w.nubi.size.toFixed(3);
      w.gotoLevel(0); CFF.Game.handleEvents(w.drainEvents());
      return out;
    });
    const C = await W(p, () => CFF.World.CONFIG);
    check(S, 'Nubi grows slowly by himself while aiming (≈ GROW_RATE·t)', Math.abs(g.aim10 - (1 + C.GROW_RATE * 10)) < 0.01, g.aim10 + ' after 10 s; grow events ' + JSON.stringify(g.grow0));
    check(S, 'a firefly raises the size goal by GROW_FLY, golden by GROW_GOLD', Math.abs(g.dFly - C.GROW_FLY) < 0.002 && Math.abs(g.dGold - C.GROW_GOLD) < 0.002, JSON.stringify({ dFly: g.dFly, dGold: g.dGold }));
    check(S, 'growth is eased (no pop), and reaches the goal', g.noPop && g.eased);
    check(S, 'size capped at SIZE_MAX 1.7', g.cap.goal <= C.SIZE_MAX + 1e-9 && g.cap.size <= C.SIZE_MAX + 1e-9 && g.cap.size > 1.69, JSON.stringify(g.cap));
    check(S, 'setSize clamps to [1, 1.7]', g.setClamp === C.SIZE_MAX && g.setClampLo === 1, g.setClamp + ' / ' + g.setClampLo);
    check(S, '"grow" event at each 0.1 step (1.2 after 1.15 + gold)', g.growEv.includes(1.2), JSON.stringify(g.growEv));
    check(S, '"big" event once when crossing BIG_AT', g.bigEv === 1, g.bigEv);
    check(S, 'pickup radius grows with size (far firefly missed at 1×, gulped at 1.7×)', !g.reach1 && g.reach17, JSON.stringify({ r1: g.reach1, r17: g.reach17 }));
    check(S, 'watering shrinks Nubi to 1 + (s−1)·RAIN_KEEP', Math.abs(g.shrinkTo - (1 + (g.landSize - 1) * C.RAIN_KEEP)) < 0.01, JSON.stringify({ size: g.landSize, shrinkTo: g.shrinkTo, after: g.afterLand }));
    const sp = g.shrinkPath;
    check(S, 'the shrink is eased over the rain phase (monotone, ends near the target)', sp[0] > sp[1] && sp[1] > sp[2] && sp[0] < g.landSize && Math.abs(g.afterLand - g.shrinkTo) < 0.04, JSON.stringify(sp) + ' → ' + g.afterLand);
    check(S, 'plop squeezes PLOP_LOSS out (1.5 → 1.35), never below 1', Math.abs(g.plopGoal - (1.5 - C.PLOP_LOSS)) < 0.01 && g.plopGoalLo === 1, g.plopGoal + ' / ' + g.plopGoalLo);
    check(S, 'twist: the same pull flies shorter when Nubi is big', g.short.x17 < g.short.x1 - 0.3, JSON.stringify(g.short));
    check(S, 'preview (size-aware) ends where the real flight ends', Math.abs(g.previewVsReal.px - g.previewVsReal.rx) < 0.1 && g.previewVsReal.ps > 1.45, JSON.stringify(g.previewVsReal));
    check(S, 'size is kept on a new level', Math.abs(g.keepLevel - 1.5) < 0.01, g.keepLevel);

    // levels: DIFF.landings waterings (easy 6) → next season
    const lv = await W(p, () => {
      const w = CFF.debug.world; _h.toAim();
      w.gotoLevel(0); CFF.Game.handleEvents(w.drainEvents()); _h.toAim();
      const N = w.D.landings || 5, res = { start: w.level, ups: [], N };
      for (let i = 0; i < N; i++) {
        _h.forceLand(0, 1);
        const ev = _h.run(1.3);
        res.ups.push(ev.filter(e => e.type === 'levelUp').length);
        res['after' + (i + 1)] = { level: w.level, ll: w.levelLandings };
      }
      res.zone = w.zone; res.name = w.P.name; res.vis = CFF.Game.renderer.vis && CFF.Game.renderer.vis.cur;
      res.crows1 = w.crows.length;
      for (let i = 0; i < 3 * N; i++) { _h.forceLand(0, 1); _h.run(1.3); }
      res.loopLevel = w.level; res.loop = w.loop; res.loopZone = w.zone;
      w.gotoLevel(2); CFF.Game.handleEvents(w.drainEvents()); res.autumnCrows = w.crows.length; res.autumn = w.P.name;
      w.gotoLevel(3); CFF.Game.handleEvents(w.drainEvents()); res.winterCrows = w.crows.length; res.winter = w.P.name;
      return res;
    });
    check(S, (lv.N - 1) + ' waterings stay in Spring Sprouts', lv['after' + (lv.N - 1)].level === 0 && lv['after' + (lv.N - 1)].ll === lv.N - 1, JSON.stringify(lv['after' + (lv.N - 1)]));
    check(S, 'watering ' + lv.N + ' → Sunflower Summer, one levelUp event', lv['after' + lv.N].level === 1 && lv.zone === 1 && lv.name === 'Sunflower Summer' && lv.ups[lv.N - 1] === 1 && lv['after' + lv.N].ll === 0, JSON.stringify({ a: lv['after' + lv.N], name: lv.name, ups: lv.ups }));
    check(S, 'renderer switched to the summer scene', lv.vis === 1, lv.vis);
    check(S, 'after 4 seasons the run loops back to Spring, round 2', lv.loopLevel === 4 && lv.loop === 1 && lv.loopZone === 0, JSON.stringify({ l: lv.loopLevel, loop: lv.loop, z: lv.loopZone }));
    check(S, 'Autumn has 1 crow, Winter 2 (easy)', lv.autumnCrows === 1 && lv.winterCrows === 2 && lv.autumn === 'Pumpkin Autumn' && lv.winter === 'Snowy Winter', JSON.stringify(lv));
    // crow bump: Nubi bounces, a bump event, no heart lost
    const cb = await W(p, () => {
      const w = CFF.debug.world, C = CFF.World.CONFIG; _h.toAim();
      const g = w.crows[0]; const h0 = w.hearts;
      _h.fly({ x: g.x - (C.R_NUBI * w.nubi.size + g.r) + 0.05, y: g.y, vx: 6, vy: 0 }, true);
      w.flies = []; const vx0 = w.nubi.vx;
      const ev = _h.run(C.STEP * 2);
      const out = { bump: ev.some(e => e.type === 'bump'), vx: w.nubi.vx, vx0, state: w.nubi.state, hearts: w.hearts - h0 };
      _h.runUntil(w => w.phase !== 'fly', 10); _h.run(1.5); w.hearts = w.maxHearts;
      w.gotoLevel(0); CFF.Game.handleEvents(w.drainEvents()); _h.toAim(); CFF.debug.setSpeed(1);
      return out;
    });
    check(S, 'crow bump: bounce back, "bonk" pose, bump event, no heart lost', cb.bump && cb.vx < 0 && cb.state === 'bonk' && cb.hearts === 0, JSON.stringify(cb));

    // pause / resume keeps state; auto-pause on blur and on hidden tab
    await waitPhase(p, 'aim', 5000);
    await p.keyboard.press('Escape');
    const a = await W(p, () => JSON.stringify(CFF.debug.world.getState()));
    await sleep(1200);
    const b = await W(p, () => JSON.stringify(CFF.debug.world.getState()));
    check(S, 'paused: world state is frozen (size too)', a === b);
    await p.keyboard.press('Escape'); await sleep(400);
    const t2 = await W(p, () => CFF.debug.world.time);
    check(S, 'resume continues the same run', t2 > JSON.parse(a).time && JSON.parse(a).score === (await W(p, () => CFF.debug.world.score)), t2.toFixed(2));
    const jump = t2 - JSON.parse(a).time;
    check(S, 'no time jump on resume (sim advanced < 1 s in 0.4 s)', jump < 1, jump.toFixed(2));
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    check(S, 'window blur → auto-pause', (await mode(p)) === 'paused');
    await p.click('#btnResume');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'tab hidden → auto-pause', (await mode(p)) === 'paused');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    check(S, 'tab visible again stays paused (child resumes on purpose)', (await mode(p)) === 'paused');
    // blur on the title / game-over must not break anything
    await pageErrs(p, S);
  });

  // ───────────────────────────── 6. URL flags: ?size= / ?level= / debug.setSize ─────────────────────────────
  await sec('flags', async () => {
    const S = 'flags';
    let { p } = await open('?mute=1&seed=4&size=1.5', {}, 'size-title');
    const t = await W(p, () => CFF.debug.world.nubi.size);
    check(S, '?size= does not change the title demo', t < 1.1, t.toFixed(3));
    await p.click('#btnPlay');
    const s1 = await W(p, () => ({ s: CFF.debug.world.nubi.size, max: CFF.debug.world.stats.maxSize }));
    check(S, '?size=1.5 → the run starts with Nubi at 1.5×', Math.abs(s1.s - 1.5) < 0.02, JSON.stringify(s1));
    const keys = await W(p, () => Object.keys(localStorage).filter(k => k.startsWith('cff:')).map(k => k + '=' + localStorage.getItem(k)).join(' '));
    check(S, '?size= / ?mute= never saved', !/size|1\.5/.test(keys) && !/"muted":true/.test(keys), keys);
    const sz = await W(p, () => { const ids0 = CFF.debug.world.flies.map(f => f.id).join(); CFF.debug.setSize(1.3); return { s: CFF.debug.world.nubi.size, g: CFF.debug.world.nubi.goal, relaid: CFF.debug.world.flies.map(f => f.id).join() !== ids0 }; });
    check(S, 'CFF.debug.setSize(1.3): size + goal set at once, fireflies re-laid', sz.s === 1.3 && sz.g === 1.3 && sz.relaid, JSON.stringify(sz));
    await pageErrs(p, S);
    while (live.length) await live.pop().close();
    ({ p } = await open('?mute=1&seed=4&size=9&autostart=1&level=2&diff=hard', {}, 'size-clamp'));
    const s2 = await W(p, () => ({ s: CFF.debug.world.nubi.size, lv: CFF.debug.world.level, name: CFF.debug.world.P.name, d: CFF.debug.world.difficulty, h: CFF.debug.world.hearts, vis: CFF.Game.renderer.vis.cur }));
    check(S, '?size=9 clamps to 1.7', Math.abs(s2.s - 1.7) < 1e-6, s2.s);
    check(S, '?level=2&diff=hard → Pumpkin Autumn on Hard (3 hearts), autumn scene', s2.lv === 2 && s2.name === 'Pumpkin Autumn' && s2.d === 'hard' && s2.h === 3 && s2.vis === 2, JSON.stringify(s2));
    await sleep(800);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 7. settings persistence + URL flags + best scores ─────────────────────────────
  await sec('persist', async () => {
    const S = 'persist';
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); live.push(ctx);
    const p = await ctx.newPage(); p._errs = [];
    p.on('pageerror', e => p._errs.push('persist: ' + e)); p.on('console', m => { if (m.type() === 'error') p._errs.push('persist: ' + m.text()); });
    const go = async q => { await p.goto(GAME + q); await p.waitForFunction(() => window.CFF && CFF.debug && ['title', 'playing'].includes(CFF.debug.mode), null, { timeout: 20000 }); await sleep(200); };
    await go('?seed=3');
    const def = await W(p, () => CFF.Game.settings);
    check(S, 'first run defaults: Easy, sound + music on', def.difficulty === 'easy' && def.sfx && def.music && !def.muted, JSON.stringify(def));
    await p.click('#btnSettings');
    await p.click('label.set:has(#setSfx)'); await p.click('label.set:has(#setMusic)');
    await p.click('#setDifficulty button[data-v="hard"]');
    await p.click('#scrSettings .btn-back');
    const keys = await W(p, () => Object.keys(localStorage));
    check(S, 'every stored key uses the cff: prefix', keys.length > 0 && keys.every(k => k.startsWith('cff:')), keys.join(','));
    await go('?seed=3');
    const s1 = await W(p, () => ({ s: CFF.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, on: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v }));
    check(S, 'sound, music and difficulty persist across reload', !s1.s.sfx && !s1.s.music && s1.s.difficulty === 'hard', JSON.stringify(s1.s));
    check(S, 'settings controls reflect the saved values', !s1.sfx && !s1.music && s1.on === 'hard', JSON.stringify(s1));
    await p.click('#btnSettings'); await p.click('label.set:has(#setSfx)'); await p.click('label.set:has(#setMusic)'); await p.click('#setDifficulty button[data-v="normal"]'); await p.click('#scrSettings .btn-back');
    await go('?seed=3&mute=1&diff=easy&size=1.4&speed=2');
    const u1 = await W(p, () => ({ urlMute: CFF.Game.urlMute, diff: CFF.Game.difficulty() }));
    check(S, '?mute=1 mutes this session', u1.urlMute === true);
    check(S, '?diff=easy is used for this session', u1.diff === 'easy');
    await p.click('#btnSettings'); await p.click('label.set:has(#setMusic)'); await p.click('label.set:has(#setMusic)'); await p.click('#scrSettings .btn-back');
    const u2raw = await W(p, () => localStorage.getItem('cff:settings')); const u2 = JSON.parse(u2raw);
    check(S, '?mute / ?diff / ?size / ?speed never written to saved settings', u2.muted === false && u2.difficulty === 'normal' && !/size|speed/.test(u2raw), u2raw);
    await p.keyboard.press('KeyM');
    const u3 = await W(p, () => ({ urlMute: CFF.Game.urlMute, saved: JSON.parse(localStorage.getItem('cff:settings')).muted }));
    check(S, 'M with ?mute=1 un-mutes without saving a muted flag', u3.urlMute === false && u3.saved === false, JSON.stringify(u3));
    await go('?seed=3');
    const u4 = await W(p, () => ({ muted: CFF.Game.settings.muted || CFF.Game.urlMute, diff: CFF.Game.difficulty() }));
    check(S, 'plain reload after a ?mute=1 session: not muted, saved difficulty', !u4.muted && u4.diff === 'normal', JSON.stringify(u4));
    // best score per difficulty
    const playTo = async (score) => {
      await p.click('#btnPlay'); await p.evaluate(HELPERS);
      await W(p, sc => { _h.freeze(); const w = CFF.debug.world; w.score = sc; w.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); }, score);
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
    const bests = await W(p, () => ({ n: localStorage.getItem('cff:best_normal'), h: localStorage.getItem('cff:best_hard'), e: localStorage.getItem('cff:best_easy') }));
    check(S, 'best is stored per difficulty (cff:best_*)', bests.n === '9' && bests.h === '3' && bests.e == null && g3.best === '3', JSON.stringify(bests));
    await p.click('#btnPlay'); await p.evaluate(HELPERS); await p.keyboard.press('Escape'); await p.click('#btnPauseSettings'); await p.click('#setDifficulty button[data-v="easy"]'); await p.keyboard.press('Escape'); await p.click('#btnResume');
    await W(p, () => { _h.freeze(); const w = CFF.debug.world; w.score = 5; w.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000); await sleep(800); await p.click('#btnOverMenu');
    const b2 = await W(p, () => ({ h: localStorage.getItem('cff:best_hard'), e: localStorage.getItem('cff:best_easy') }));
    check(S, 'mid-run difficulty change: score is saved for the run\'s own difficulty', b2.h === '5' && b2.e == null, JSON.stringify(b2));
    await p.click('#btnSettings'); await p.click('#btnResetBest');
    check(S, 'Reset best: first tap only arms ("Sure?")', (await p.textContent('#btnResetBest')) === 'Sure?' && (await W(p, () => localStorage.getItem('cff:best_normal'))) === '9');
    await p.click('#btnResetBest');
    check(S, 'Reset best: second tap clears all bests', (await W(p, () => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('cff:best_' + d) == null))));
    await p.click('#scrSettings .btn-back');
    // bot runs never save a best
    await go('?seed=3&bot=1&speed=8&autostart=1&diff=normal');
    await p.evaluate(HELPERS);
    await W(p, () => { _h.freeze(); const w = CFF.debug.world; w.score = 50; w.hearts = 1; _h.forcePlop(); _h.run(1.3); CFF.debug.setSpeed(1); });
    await waitMode(p, 'over', 5000);
    const bb = await W(p, () => ({ saved: localStorage.getItem('cff:best_normal'), shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
    check(S, '?bot=1 run does not save a best score', bb.saved == null, JSON.stringify(bb));
    check(S, '?bot=1 Game Over shows no "NEW!"', !bb.nb, JSON.stringify(bb));
    await pageErrs(p, S);
  });

  // ───────────────────────────── 8. Change Pictures ─────────────────────────────
  await sec('pictures', async () => {
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
    const slotIds = await W(p, () => CFF.Assets.SLOTS.map(s => s.id));
    check(S, 'picture slots: Nubi, Firefly and the four seasons', JSON.stringify(slotIds) === JSON.stringify(['hero', 'fly', 'bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter']), slotIds.join(','));
    await p.click('#btnCustomize');
    const choose = async (slotIdx, file) => {
      await p.evaluate(() => document.getElementById('toast').classList.add('hidden'));
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.locator('#slotGrid .slot').nth(slotIdx).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
    };
    const toast = async (re, t = 8000) => { try { await p.waitForFunction(re => !document.getElementById('toast').classList.contains('hidden') && new RegExp(re).test(document.getElementById('toast').textContent), re, { timeout: t }); return true; } catch (_) { return false; } };
    await choose(0, { name: 'family.png', mimeType: 'image/png', buffer: photo });
    check(S, 'photo PNG on Nubi → "Picture saved" toast', await toast('saved'));
    const h1 = await W(p, () => ({ custom: CFF.Assets.hasCustom('hero'), shape: CFF.Storage.get('shape_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent, ls: !!localStorage.getItem('cff:img_hero') }));
    check(S, 'opaque photo becomes a round sticker, card says "Your picture", saved as cff:img_hero', h1.custom && h1.shape === 'circle' && /Your picture/.test(h1.tag) && h1.ls, JSON.stringify(h1));
    await choose(1, { name: 'cutout.png', mimeType: 'image/png', buffer: cut });
    await toast('saved');
    const l1 = await W(p, () => ({ custom: CFF.Assets.hasCustom('fly'), shape: CFF.Storage.get('shape_fly') }));
    check(S, 'transparent PNG on Firefly stays "whole picture" (fit)', l1.custom && l1.shape === 'fit', JSON.stringify(l1));
    await p.locator('#slotGrid .slot').nth(1).locator('[data-shape=circle]').click();
    check(S, 'shape button "Round" switches the firefly to a circle', (await W(p, () => CFF.Storage.get('shape_fly'))) === 'circle');
    await p.locator('#slotGrid .slot').nth(1).locator('[data-shape=fit]').click();
    await sleep(2300);
    await choose(2, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
    check(S, 'non-image file → friendly error toast', await toast('Please choose a picture'));
    check(S, 'non-image file does not change the slot', !(await W(p, () => CFF.Assets.hasCustom('bg_spring'))));
    await sleep(500);
    await choose(2, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png at all') });
    check(S, 'corrupt "PNG" → friendly error toast', await toast('could not be opened'));
    check(S, 'corrupt file does not change the slot', !(await W(p, () => CFF.Assets.hasCustom('bg_spring'))));
    await sleep(500);
    const tHuge = Date.now();
    await choose(2, { name: 'huge.png', mimeType: 'image/png', buffer: huge });
    const okHuge = await toast('saved', 20000);
    const hs = await W(p, async () => {
      const d = CFF.Storage.get('img_bg_spring'); if (!d) return null;
      const im = new Image(); im.src = d; await im.decode();
      return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), type: d.slice(5, d.indexOf(';')) };
    });
    check(S, 'huge 6000×4000 Spring background is accepted', okHuge, (Date.now() - tHuge) + ' ms');
    check(S, 'huge background downscaled (long edge ≤ 1600) and stored small', hs && Math.max(hs.w, hs.h) <= 1600 && hs.kb < 1500, JSON.stringify(hs));
    const heroDim = await W(p, async () => { const im = new Image(); im.src = CFF.Storage.get('img_hero'); await im.decode(); return [im.naturalWidth, im.naturalHeight]; });
    check(S, 'character pictures stored ≤ 512 px', Math.max(...heroDim) <= 512, heroDim.join('×'));
    await p.click('#scrCustom .btn-back');
    await p.click('#btnPlay'); await sleep(1500);
    // grow Nubi with the custom picture, and land (rain drawn under a photo)
    await W(p, () => { CFF.debug.setSize(1.7); });
    await sleep(500);
    await p.screenshot({ path: OUT + '/func_custom_play.png' });
    check(S, 'game runs with custom pictures (big Nubi too)', (await mode(p)) === 'playing');
    await p.reload(); await p.waitForFunction(() => CFF.debug && CFF.debug.mode === 'title');
    const pr = await W(p, () => ['hero', 'fly', 'bg_spring'].map(s => CFF.Assets.hasCustom(s)));
    check(S, 'custom pictures persist across reload', pr.every(Boolean), pr.join(','));
    await p.click('#btnCustomize');
    await p.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click();
    const rs = await W(p, () => ({ c: CFF.Assets.hasCustom('hero'), s: CFF.Storage.get('img_hero'), tag: document.querySelectorAll('#slotGrid .slot')[0].querySelector('.tag').textContent }));
    check(S, 'Reset on one card restores the original', !rs.c && rs.s == null && /Original/.test(rs.tag), JSON.stringify(rs));
    await p.click('#btnResetAll');
    const ra = await W(p, () => CFF.Assets.SLOTS.some(s => CFF.Assets.hasCustom(s.id)) || Object.keys(localStorage).some(k => k.startsWith('cff:img_')));
    check(S, 'Reset all removes every custom picture', !ra);
    await p.click('#scrCustom .btn-back');
    await pageErrs(p, S);
  });

  // ───────────────────────────── 9. layout ─────────────────────────────
  const VIEWS = [
    { name: 'desktop 1280×720', o: { viewport: { width: 1280, height: 720 } } },
    { name: 'phone landscape 844×390', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ins: { top: 0, right: 47, bottom: 21, left: 47 } },
    { name: 'small phone landscape 667×375', o: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'phone portrait 390×844', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ins: { top: 47, right: 0, bottom: 34, left: 0 } },
    { name: 'iPad 1024×768', o: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ins: { top: 24, right: 0, bottom: 20, left: 0 } },
    { name: 'iPad Pro 1366×1024', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ins: { top: 24, right: 0, bottom: 20, left: 0 } }
  ];
  if (!QUICK) VIEWS.push({ name: 'desktop 1920×1080', o: { viewport: { width: 1920, height: 1080 } } });
  for (const v of VIEWS) await sec('layout ' + v.name, async () => {
    const S = 'layout ' + v.name;
    const tag = v.name.replace(/[^a-z0-9]+/gi, '_');
    const { ctx, p } = await open('?mute=1&seed=7', v.o, tag);
    await sleep(600);
    const measure = id => p.evaluate(async id => {
      // let the pop-in animation (scale overshoot 1.03) finish before measuring
      await Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      const scr = document.getElementById(id), vw = innerWidth, vh = innerHeight;
      const box = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
      const r = box.getBoundingClientRect();
      const bad = [];
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('box ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      if (box.scrollWidth > box.clientWidth + 2) bad.push('h-overflow ' + box.scrollWidth + '>' + box.clientWidth);
      for (const el of box.querySelectorAll('button, .slot, .set, h2, h1')) {
        const b = el.getBoundingClientRect(); if (!b.width) continue;
        if (b.left < r.left - 1 || b.right > r.right + 1) bad.push((el.id || el.className || el.tagName) + ' sticks out ' + Math.round(b.left) + '..' + Math.round(b.right));
        if (/BUTTON/.test(el.tagName) && el.scrollWidth > el.clientWidth + 2) bad.push((el.id || el.textContent.trim().slice(0, 14)) + ' text clipped');
      }
      const scrolls = box.scrollHeight > box.clientHeight + 2;
      const cs = getComputedStyle(box); const canScroll = /auto|scroll/.test(cs.overflowY);
      return { bad: bad.slice(0, 4), scrolls, canScroll, docW: document.documentElement.scrollWidth, vw };
    }, id);
    const titleM = await measure('scrTitle');
    check(S, 'title fits', titleM.bad.length === 0 && !titleM.scrolls, titleM.bad.join('; '));
    check(S, 'no horizontal page scroll', titleM.docW <= titleM.vw, titleM.docW + ' > ' + titleM.vw);
    await p.screenshot({ path: OUT + '/func_' + tag + '_title.png' });
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await W(p, id => CFF.UI.open(id, 'scrTitle'), id); await sleep(320);
      const m = await measure(id);
      check(S, id + ' panel fits on screen, nothing sticks out', m.bad.length === 0, m.bad.join('; '));
      if (m.scrolls) { check(S, id + ' overflows → panel scrolls inside', m.canScroll); note(v.name + ': ' + id + ' needs scrolling inside its panel'); }
      await p.screenshot({ path: OUT + '/func_' + tag + '_' + id + '.png' });
    }
    await W(p, () => CFF.UI.back());
    await W(p, () => CFF.debug.startGame()); await sleep(900);
    const port = v.o.viewport.height > v.o.viewport.width;
    if (v.o.hasTouch && port) {
      const rot = await W(p, () => ({ vis: !document.getElementById('rotate').classList.contains('hidden'), t: CFF.debug.world.time }));
      await sleep(500);
      const t2 = await W(p, () => CFF.debug.world.time);
      check(S, 'phone upright: "turn sideways" card shown, game held', rot.vis && Math.abs(t2 - rot.t) < 1e-6, JSON.stringify(rot) + ' → ' + t2);
      await p.screenshot({ path: OUT + '/func_' + tag + '_rotate.png' });
      await p.tap('#btnRotateOk'); await sleep(400);
      const r2 = await W(p, () => ({ vis: !document.getElementById('rotate').classList.contains('hidden'), m: CFF.debug.mode, t: CFF.debug.world.time, shots: CFF.debug.world.shots }));
      check(S, '"Play upright anyway" hides the card, game runs, no fling', !r2.vis && r2.m === 'playing' && r2.t > t2 && r2.shots === 0, JSON.stringify(r2));
    } else if (v.o.hasTouch) {
      const vis = await W(p, () => !document.getElementById('rotate').classList.contains('hidden'));
      check(S, 'landscape: no rotate card', !vis);
    }
    const hudBox = () => p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, cv = document.getElementById('game').getBoundingClientRect();
      return ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, ok: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh && r.left >= cv.left - 1 && r.right <= cv.right + 1 && r.top >= cv.top - 1, size: Math.round(Math.min(r.width, r.height)) }; })
        .concat([{ id: 'canvas', ok: cv.left >= -1 && cv.top >= -1 && cv.right <= vw + 1 && cv.bottom <= vh + 1, size: Math.round(cv.width) + 'x' + Math.round(cv.height) }]);
    });
    const hud = await hudBox();
    check(S, 'HUD buttons and canvas on screen', hud.every(h => h.ok), JSON.stringify(hud.map(h => [h.id, h.ok, h.size])));
    if (v.o.hasTouch) check(S, 'HUD buttons ≥ 44 px for fingers', hud.slice(0, 2).every(h => h.size >= 44), hud.slice(0, 2).map(h => h.size).join(','));
    if (v.ins) {
      // fake the notch / home-bar insets on the probe (env() is always 0 in Chromium) and re-layout
      await W(p, ins => { const s = document.getElementById('safeProbe').style; s.padding = ins.top + 'px ' + ins.right + 'px ' + ins.bottom + 'px ' + ins.left + 'px'; CFF.Game.relayout(); }, v.ins);
      await sleep(200);
      const h2 = await hudBox(); const vw = v.o.viewport.width;
      const inSafe = h2.slice(0, 2).every(h => h.t >= v.ins.top - 0.5 && h.r <= vw - v.ins.right + 0.5);
      check(S, 'HUD stays inside the safe area (insets ' + JSON.stringify(v.ins) + ')', inSafe, JSON.stringify(h2.slice(0, 2).map(h => [h.id, Math.round(h.t), Math.round(h.r)])));
      await p.screenshot({ path: OUT + '/func_' + tag + '_play_safe.png' });
    }
    // a real touch drag on this layout pulls and flings
    if (v.o.hasTouch) {
      const cv = await p.locator('#game').boundingBox();
      const x0 = cv.x + cv.width * 0.5, y0 = cv.y + cv.height * 0.4;
      const cdp = await ctx.newCDPSession(p);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await waitPhase(p, 'aim', 5000);
      await touch('touchStart', x0, y0); for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 - i * 7, y0 + i * 6); await sleep(16); }
      const pl = await W(p, () => CFF.debug.world.pull);
      await touch('touchEnd', x0 - 56, y0 + 48);
      const ph = await W(p, () => CFF.debug.world.phase);
      check(S, 'touch drag + release flings on this layout', pl && pl.x < -0.3 && ph === 'fly', JSON.stringify({ pl, ph }));
    }
    await p.screenshot({ path: OUT + '/func_' + tag + '_play.png' });
    await W(p, () => CFF.Game.pause()); await sleep(300);
    const pm = await measure('scrPause'); check(S, 'pause panel fits', pm.bad.length === 0 && !pm.scrolls, pm.bad.join('; ') + (pm.scrolls ? ' scrolls' : ''));
    await W(p, () => { CFF.Game.resume(); CFF.Game.mode = 'over'; CFF.Game.overAt = performance.now(); CFF.UI.setHud(false); CFF.UI.showGameOver({ score: 128, best: 245, newBest: true, cleared: 3, flies: 64, gold: 12, big: 7, maxSize: 1.7, landings: 21, bulls: 7, shots: 30, streak: 9, bumps: 3, puffs: 11, reached: 'Snowy Winter (round 2)' }); });
    await sleep(350);
    const om = await measure('scrOver'); check(S, 'game over panel fits (long stats)', om.bad.length === 0 && (!om.scrolls || om.canScroll), om.bad.join('; ') + (om.scrolls ? ' scrolls' : ''));
    await p.screenshot({ path: OUT + '/func_' + tag + '_over.png' });
    await pageErrs(p, S);
  });

  // ───────────────────────────── 10. frame time at speed 1 ─────────────────────────────
  await sec('perf', async () => {
    const S = 'perf';
    const { ctx, p } = await open('?mute=1&seed=5&autostart=1&bot=1&diff=normal&level=3&size=1.7', {}, 'perf');
    await sleep(1500);
    const r = await p.evaluate(async () => {
      const G = CFF.Game, of = G.frame, work = [], gaps = []; let last = 0;
      G.frame = function (ts) { const t = performance.now(); if (last) gaps.push(t - last); last = t; of.call(this, ts); work.push(performance.now() - t); };
      await new Promise(r => setTimeout(r, 4000));
      G.frame = of;
      const q = (a, k) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };
      return { n: work.length, p50: q(work, 0.5), p95: q(work, 0.95), max: Math.max(...work), gap95: q(gaps, 0.95) };
    });
    check(S, 'frame work p95 < 20 ms (headless, winter snow, big Nubi)', r.p95 < 20, `n=${r.n} p50=${r.p50.toFixed(2)} p95=${r.p95.toFixed(2)} max=${r.max.toFixed(1)} ms, frame gap p95=${r.gap95.toFixed(1)} ms`);
    note(`frame work at speed 1: p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, max ${r.max.toFixed(1)} ms over ${r.n} frames`);
    await pageErrs(p, S);
  });

  // ───────────────────────────── 11. long bot soak at ×16 ─────────────────────────────
  await sec('soak', async () => {
    const S = 'soak';
    const { ctx, p } = await open('?mute=1&seed=9&speed=16&bot=1&skill=0.55&autorestart=1&autostart=1&diff=normal', {}, 'soak');
    let maxP = 0, maxFx = 0, maxFlies = 0, samples = 0, stuck = 0, lastT = -1, minS = 9, maxS = 0, badNum = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < SOAK_S * 1000) {
      await sleep(500);
      const s = await W(p, () => { const s = CFF.debug.getState(); return { p: s.particles, fx: s.fx, t: s.time, l: s.flies.length, m: s.mode, ph: s.phase, sz: s.nubi.size, x: s.nubi.x, y: s.nubi.y, sc: s.score }; });
      samples++; maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxFlies = Math.max(maxFlies, s.l);
      minS = Math.min(minS, s.sz); maxS = Math.max(maxS, s.sz);
      if (![s.sz, s.x, s.y, s.sc].every(Number.isFinite)) badNum++;
      if (s.m === 'playing' && s.ph !== 'over' && s.t === lastT) stuck++; lastT = s.t;
    }
    const st = await W(p, () => ({ games: CFF.debug.stats.games, scores: CFF.debug.stats.scores, levels: CFF.debug.stats.levels, shots: CFF.debug.stats.shots, landings: CFF.debug.stats.landings, flies: CFF.debug.stats.flies, best: Object.keys(localStorage).filter(k => k.startsWith('cff:best_')) }));
    check(S, SOAK_S + ' s bot run at ×16: games finished and auto-restarted', st.games >= 1, JSON.stringify({ games: st.games, shots: st.shots, landings: st.landings, maxLevel: Math.max(0, ...st.levels) }));
    check(S, 'particles always ≤ 160', maxP <= 160, 'max ' + maxP + ' over ' + samples + ' samples');
    check(S, 'renderer fx lists bounded (≤ 40)', maxFx <= 40, 'max ' + maxFx);
    check(S, 'fireflies per shot bounded (≤ 8)', maxFlies <= 8, 'max ' + maxFlies);
    check(S, 'Nubi size always within [1, 1.7], numbers finite', minS >= 1 && maxS <= 1.7 + 1e-9 && badNum === 0, `size ${minS.toFixed(3)}..${maxS.toFixed(3)}, bad ${badNum}`);
    check(S, 'simulation never stalls while playing', stuck === 0, stuck + ' stalled samples');
    check(S, 'bot soak saved no best score', st.best.length === 0, st.best.join(','));
    note(`soak: ${st.games} games, ${st.shots} shots, ${st.landings} landings, ${st.flies} fireflies, size ${minS.toFixed(2)}–${maxS.toFixed(2)}, scores ${st.scores.slice(0, 8).join('/')}${st.scores.length > 8 ? '…' : ''}`);
    await pageErrs(p, S);
  });

  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fail.length) + '/' + results.length + ' checks passed in ' + ((Date.now() - T0) / 1000).toFixed(0) + ' s');
  fs.writeFileSync(OUT + '/functional.json', JSON.stringify({ results, notes }, null, 1));
  if (fail.length) { console.log('FAILED:\n' + fail.map(f => ' - ' + f.section + ' — ' + f.name + ' [' + f.detail + ']').join('\n')); process.exit(1); }
  console.log('PASS functional');
})().catch(async e => { console.error('CRASH', e); try { await browser.close(); } catch (_) {} process.exit(2); });
