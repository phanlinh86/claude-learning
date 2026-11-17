// Dottie's Reef Parade — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to file://<repo>/game/index.html (Chromium gets --allow-file-access-from-files)
//   --quick shortens the long bot run (15 s instead of 60 s)
// Prints PASS/FAIL per check, screenshots in tests/out/functional/, exits 1 on any FAIL.
// Adapted from projects/daily-game/puff-volcano-catch/tests/e2e/functional.js + mobile_qa.js.
// Rule: tuning numbers are read from the live config (RP.debug.world.cfg / RP.DIFFICULTY), never hard-coded.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || 'file://' + path.resolve(__dirname, '../../game/index.html');
const QUICK = args.includes('--quick');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LONG_RUN_S = QUICK ? 15 : 60;
const OUT = path.join(__dirname, '..', 'out', 'functional');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function info(msg) { console.log('     ' + msg); }
const url = (q, mute = true) => BASE + '?' + [mute ? 'mute=1' : '', q || ''].filter(Boolean).join('&');
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* In-page helpers (window.T), installed before the game scripts run. They only touch RP at call time. */
const HELPERS = `
window.T = {
  G() { return RP.Game; },
  W() { return RP.Game.world; },
  wrap(a) { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; },
  step(sec, h) { const G = RP.Game; h = h || 1 / 60; const n = Math.max(1, Math.round(sec / h)); for (let i = 0; i < n; i++) G.step(h); G.renderer.update(sec); },
  toPlaying() { const G = RP.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; return i / 60; },
  resetInput() { const G = RP.Game; G.keys = {}; G.renderer.pointer = null; G.pointerDown = false; G._mouseFollow = false; G._steerId = null; if (G._touches) G._touches.clear(); G.world.setDir(0, 0); G.world.setTarget(null); },
  /* park Dottie at (x, y) heading h with a straight path of 'len' points behind him (clamped inside the arena) */
  place(x, y, h, len) {
    const w = this.W(), c = w.cfg, s = w.hero, A = w.arena, r = c.heroR;
    if (x == null) x = (A.x0 + A.x1) / 2; if (y == null) y = (A.y0 + A.y1) / 2; h = h || 0; len = len || 140;
    s.x = s._px = x; s.y = s._py = y; s.heading = h; s.turn = 0; s.lean = 0; s.jump = 0; s.z = 0; s.invuln = 0; s.dizzy = 0; s.lock = 0; s.flip = 1; s.happy = 0;
    w._pathHead = -1; w._pathLen = 0;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    for (let k = len; k >= 1; k--) w._pushPath(cl(x - Math.cos(h) * k * c.pathStep, A.x0 + r, A.x1 - r), cl(y - Math.sin(h) * k * c.pathStep, A.y0 + r, A.y1 - r));
    w._pushPath(x, y);
  },
  /* nothing on the field but Dottie; no golden star for a long time; no auto-spawned stars (unless notes given) */
  isolate(o) {
    o = o || {};
    const w = this.W(), c = w.cfg;
    c.notesOnField = o.notes != null ? o.notes : 0;
    w.notes.length = 0; w.trail.length = 0; w.song = 0; w._goldNext = 1e9;
    this.resetInput();
    this.place(o.x, o.y, o.h, o.len);
  },
  addTrail(n) {
    const w = this.W(), c = w.cfg, s = w.hero;
    for (let i = 0; i < n; i++) { const L = w.trail.length; w.trail.push({ x: s.x, y: s.y, kind: L % 4, gold: false, worth: 1, z: 0, phase: L * c.bouncePhase, pop: 0, join: 1, _jx: s.x, _jy: s.y, _px: s.x, _py: s.y }); }
    w.song = w.trail.length; w._layoutTrail(0); for (const t of w.trail) { t._px = t.x; t._py = t.y; }   // frozen world: no interpolation smear
  },
  addNote(x, y, o) {
    o = o || {}; const w = this.W();
    const n = { id: w._nextId++, x, y, kind: o.kind || 0, gold: !!o.gold, t: o.t != null ? o.t : 1, state: o.state || 'idle', life: o.life || 4, vx: 0, vy: 0, z: 0, vz: 0, _px: x, _py: y };
    w.notes.push(n); return n.id;
  },
  /* path = a circle that ends at Dottie, so trail note K = safeNeck + 2 sits right on him → bonk on the next step */
  loopBonk() {
    const w = this.W(), c = w.cfg, s = w.hero;
    s.invuln = 0; w._graceT = 0; s.jump = 0; s.z = 0; s.heading = 0; s.turn = 0;
    const K = c.safeNeck + 2, C = (K + 1) * c.trailSpacing, R = C / (2 * Math.PI), N = Math.ceil(C / 2);
    const cx = s.x, cy = s.y - R;
    w.trail.length = 0;
    w._pathHead = -1; w._pathLen = 0;
    for (let k = 0; k <= N; k++) { const th = Math.PI / 2 + 2 * Math.PI * (1 - k / N); w._pushPath(cx + R * Math.cos(th), cy + R * Math.sin(th)); }
    this.addTrail(K + 1);
    const t = w.trail[K]; return { K, d: Math.hypot(t.x - s.x, t.y - s.y) };
  },
  hookEvents() {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = RP.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  },
  log(t) { return (window._evLog || []).filter(e => !t || e.type === t); },
  clearLog() { if (window._evLog) window._evLog.length = 0; },
  countStarts() { window._starts = 0; const G = RP.Game; if (!G._wrapped) { const o = G.startGame.bind(G); G.startGame = function () { window._starts++; return o(); }; G._wrapped = true; } },
  /* lose the last heart by a real bonk, then step (sim time) until the game-over screen */
  killToOver(score, level) {
    const G = RP.Game; const w = G.world;
    if (level != null) w.startLevel(level);
    this.toPlaying(); this.isolate();
    if (score != null) w.score = score;
    w.hearts = 1; this.loopBonk();
    let i = 0; while (G.mode === 'playing' && i++ < 600) G.step(1 / 60);
    return G.mode;
  },
  rectOf(id) { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; },
  toClient(x, y) { const R = RP.Game.renderer, r = R.canvas.getBoundingClientRect(); return { x: r.left + x / R.VW * r.width, y: r.top + y / R.VH * r.height }; },
  toLog(cx, cy) { return RP.Game.renderer.toLogical(cx, cy); },
  logRect(id) { const R = RP.Game.renderer, c = R.canvas.getBoundingClientRect(), e = document.getElementById(id).getBoundingClientRect(), k = R.VW / c.width;
    return { x0: (e.left - c.left) * k, y0: (e.top - c.top) * k, x1: (e.right - c.left) * k, y1: (e.bottom - c.top) * k }; },
  /* count canvas pixels in a logical rect that match pred(r,g,b) */
  probe(x, y, w, h, pred) {
    const R = RP.Game.renderer, c = R.canvas, g = c.getContext('2d'), k = c.width / R.VW;
    const X = Math.max(0, Math.round(x * k)), Y = Math.max(0, Math.round(y * k)), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    const d = g.getImageData(X, Y, W, H).data, f = new Function('r', 'g', 'b', 'return ' + pred);
    let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
    return n / (k * k);
  },
  /* record the HUD text boxes of one drawn frame (logical px) */
  hudTexts() {
    const R = RP.Game.renderer, rec = [], orig = R.text;
    R.texts.length = 0; R.banner = null;
    R.text = function (g, s, x, y, size, color, align, stroke) { orig.call(this, g, s, x, y, size, color, align, stroke); const w = g.measureText(s).width, pad = Math.max(3, size * 0.16) / 2;
      const x0 = (align || 'center') === 'left' ? x : (align === 'right' ? x - w : x - w / 2); rec.push({ s, x0: x0 - pad, x1: x0 + w + pad, y0: y - size / 2 - pad, y1: y + size / 2 + pad }); };
    try { R.draw(RP.Game.mode); } finally { R.text = orig; }
    return rec;
  }
};`;

let browser;
async function newPage(opts = {}, ctxIn) {
  const ctx = ctxIn || await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dsf || 1,
    hasTouch: !!opts.touch, isMobile: !!opts.mobile
  });
  if (!ctx._helpers) { await ctx.addInitScript(HELPERS); ctx._helpers = true; }
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console.error: ' + m.text()); });
  page._ctx = ctx;
  return page;
}
async function boot(page, q, mute = true) {
  await page.goto(url(q, mute));
  await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode && RP.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(200);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => RP.debug.mode);
const ui = page => ev(page, () => RP.UI.current);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}
const errorsOk = (page, label) => check(label + ': no console errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));
const close = page => page._ctx.close();
const freeze = page => ev(page, () => RP.debug.setSpeed(0));
const simStep = (page, sec, h) => ev(page, ([s, h]) => T.step(s, h), [sec, h]);
const toPlaying = page => ev(page, () => T.toPlaying());
const isolate = (page, o) => ev(page, o => T.isolate(o), o || {});
const hero = page => ev(page, () => { const s = RP.debug.world.hero; return { x: s.x, y: s.y, h: s.heading, jump: s.jump, z: s.z, flip: s.flip, dizzy: s.dizzy, invuln: s.invuln }; });
const flips = page => ev(page, () => RP.debug.world.flips);
const starts = page => ev(page, () => window._starts);
const toastText = page => ev(page, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });
async function startFrozen(page) {
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  return ev(page, () => RP.debug.world.cfg);
}
async function touch(page, type, points) {
  if (!page._cdp) page._cdp = await page._ctx.newCDPSession(page);
  await page._cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) });
}
async function tapEl(page, id) { const r = await ev(page, id => T.rectOf(id), id); await page.touchscreen.tap(r.cx, r.cy); }

/* Image files generated inside the page: canvas → Blob → bytes. */
async function makeImage(page, w, h, kind, fmt = 'image/png') {
  const arr = await ev(page, async ({ w, h, kind, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (kind === 'photo') { g.fillStyle = '#0000ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2020c0'; g.fillRect(w * .3, h * .3, w * .4, h * .4); }
    else if (kind === 'bg') { g.fillStyle = '#5a3a8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#6a3a9a'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 61) % h, w / 20, h / 20); }
    else {                                                   // transparent cut-out ellipse
      const col = { note: '#00ffff', hero: '#ff00ff' }[kind] || '#ff00ff';
      g.clearRect(0, 0, w, h);
      g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.92));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }, { w, h, kind, fmt });
  return Buffer.from(arr, 'base64');
}
async function pickFile(page, slotId, file) {
  const idx = await ev(page, id => RP.Assets.SLOTS.findIndex(s => s.id === id), slotId);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const storedSize = (page, key) => ev(page, k => new Promise(res => { const d = RP.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight, d.length]); i.onerror = () => res(null); i.src = d; }), key);
async function waitToast(page, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await toastText(page); if (re.test(t)) return t; await page.waitForTimeout(100); }
  return await toastText(page);
}
/* Buttons of the current screen inside the viewport; panel overflow (needs scrolling) reported separately. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = RP.UI.current && document.getElementById(RP.UI.current);
    if (!scr) return { bad: ['no screen'], overflow: false };
    const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
    const pr = panel.getBoundingClientRect();
    if (pr.top < -0.5 || pr.bottom > vh + 0.5 || pr.left < -0.5 || pr.right > vw + 0.5) bad.push('panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(','));
    // primary buttons must be reachable without scrolling
    const prim = [...scr.querySelectorAll('.btn-big, .btn-back, #btnAgain, #btnOverMenu, #btnResume')].filter(b => b.offsetParent !== null);
    for (const b of prim) { const r = b.getBoundingClientRect(); if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.bottom > pr.bottom + 0.5) bad.push((b.id || b.textContent.trim().slice(0, 16)) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',')); }
    const overflow = panel.scrollHeight > panel.clientHeight + 1;
    return { bad, overflow };
  });
}
const inter = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/* =============================== TESTS =============================== */

async function testBootAndScreens() {
  const page = await newPage();
  await boot(page, 'seed=42');
  check('boot: reaches title mode', (await mode(page)) === 'title');
  check('boot: window.RP.debug exposes every hook of DESIGN §5.4', await ev(page, () => ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'goldNow'].every(k => k in RP.debug)));
  for (const [id, label] of [['btnPlay', 'Play'], ['btnCustomize', 'Change Pictures'], ['btnHow', 'How to Play'], ['btnSettings', 'Settings']]) {
    const txt = await ev(page, id => document.getElementById(id).textContent, id);
    check(`title: "${label}" button visible`, (await visible(page, '#' + id)) && txt.includes(label), txt.trim());
  }
  check('title: Quit hidden in browser mode', !(await visible(page, '#btnQuit')));
  check('title: HUD + Flip button hidden on the title', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  check('title: best score line shown', /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: RP.debug.world.time, x: RP.debug.world.hero.x, y: RP.debug.world.hero.y }));
  await page.waitForTimeout(3000);
  const t1 = await ev(page, () => ({ t: RP.debug.world.time, x: RP.debug.world.hero.x, y: RP.debug.world.hero.y, p: RP.debug.weather.particles.length, bot: !!RP.Game.bot, notes: RP.debug.world.notesTotal }));
  check('title: bot demo runs behind the menu (Dottie moves, weather particles)', t1.t > t0.t + 2 && Math.hypot(t1.x - t0.x, t1.y - t0.y) > 20 && t1.p > 3 && t1.bot, { t0, t1 });
  check('title: demo is silent-safe (sound flag off in title mode)', await ev(page, () => RP.Game.mode === 'title'));
  await shot(page, '01_title');
  for (const [btn, scr, n] of [['#btnHow', 'scrHow', '02_how'], ['#btnSettings', 'scrSettings', '03_settings'], ['#btnCustomize', 'scrCustom', '04_custom']]) {
    await page.click(btn); await page.waitForTimeout(300);
    check(`menu: ${btn} opens ${scr}`, (await ui(page)) === scr);
    await shot(page, n);
    await page.click(`#${scr} .btn-back`); await page.waitForTimeout(150);
    check(`menu: ${scr} back button returns to the title`, (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title');
    await page.click(btn); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(`menu: Esc closes ${scr} back to the title`, (await ui(page)) === 'scrTitle');
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('menu: Esc on the title does nothing harmful', (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title');
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  check('play: Play starts a game (mode playing, HUD visible, no menu)', (await mode(page)) === 'playing' && (await visible(page, '#btnPause')) && (await ui(page)) === null);
  check('play: Flip button hidden on a non-touch device', !(await visible(page, '#btnAction')));
  check('play: focus left the menu button', await ev(page, () => !document.activeElement || document.activeElement === document.body));
  check('play: world starts in ready → playing with the biome banner', await ev(page, () => ['ready', 'playing'].includes(RP.debug.world.state) && RP.debug.world.level === 0));
  await page.waitForTimeout(800);
  await shot(page, '05_banner');
  // Pause screen + Game Over screen + their back navigation
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('menu: Pause screen opens (Esc)', (await ui(page)) === 'scrPause' && (await mode(page)) === 'paused');
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  check('menu: Settings from Pause', (await ui(page)) === 'scrSettings' && (await mode(page)) === 'paused');
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('menu: Done in Settings returns to Pause (not the title)', (await ui(page)) === 'scrPause' && (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(150);
  await freeze(page);
  const m = await ev(page, () => T.killToOver(250, 1));
  await page.waitForTimeout(300);
  check('menu: Game Over screen opens after the last heart', m === 'over' && (await ui(page)) === 'scrOver');
  await shot(page, '06_over');
  await page.click('#btnOverMenu'); await page.waitForTimeout(200);
  check('menu: Game Over → Menu returns to the title (bot demo again)', (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title' && !(await visible(page, '#btnPause')));
  errorsOk(page, 'boot+screens');
  await close(page);
}

async function testKeyboard() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await startFrozen(page);
  const DIRS = [['ArrowRight', 0], ['ArrowDown', Math.PI / 2], ['ArrowLeft', Math.PI], ['ArrowUp', -Math.PI / 2],
    ['KeyD', 0], ['KeyS', Math.PI / 2], ['KeyA', Math.PI], ['KeyW', -Math.PI / 2]];
  for (const [key, target] of DIRS) {
    await isolate(page, { h: target + Math.PI / 2 });
    await page.keyboard.down(key); await page.waitForTimeout(40);
    await simStep(page, 1.0);
    const s = await hero(page);
    await page.keyboard.up(key); await page.waitForTimeout(40);
    const err = Math.abs(await ev(page, ([a, b]) => T.wrap(a - b), [s.h, target]));
    check(`keys: ${key} turns Dottie to ${Math.round(target * 180 / Math.PI)}° smoothly`, err < 0.12, { heading: +s.h.toFixed(3), err: +err.toFixed(3) });
  }
  // smooth, not instant: after 1/30 s the heading moved but is far from the target
  await isolate(page, { h: 0 });
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(30);
  await simStep(page, 1 / 30);
  const s1 = await hero(page);
  await page.keyboard.up('ArrowUp');
  check('keys: turning is eased (no snap to the key direction)', s1.h < -0.002 && s1.h > -0.5, s1.h);
  // diagonal
  await isolate(page, { h: Math.PI / 2 });
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(40);
  await simStep(page, 1.0);
  const sd = await hero(page);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
  check('keys: Up+Right → diagonal heading −45°', near(sd.h, -Math.PI / 4, 0.12), sd.h);
  // release: heading kept (Dottie never stops, no drift)
  await page.waitForTimeout(40);
  await simStep(page, 0.4);
  const a = await hero(page); await simStep(page, 0.5); const b = await hero(page);
  check('keys: after release Dottie keeps his heading and keeps rolling', Math.abs(a.h - b.h) < 0.02 && Math.hypot(b.x - a.x, b.y - a.y) > 30, { a: a.h, b: b.h });
  // Space / Enter Flip, auto-repeat ignored, no flip while recharging
  await isolate(page);
  let f0 = await flips(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  const sj = await hero(page);
  check('keys: Space flips (jump started, charge spent)', (await flips(page)) === f0 + 1 && sj.jump > 0 && sj.flip === 0, sj);
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  check('keys: Space/Enter while airborne / recharging do nothing', (await flips(page)) === f0 + 1);
  const cfg = await ev(page, () => RP.debug.world.cfg);
  await simStep(page, cfg.jumpTime * 0.5);
  const apex = await hero(page);
  check('keys: Flip hop height ≈ jumpHeight at mid-air', near(apex.z, cfg.jumpHeight, 2), apex.z);
  await simStep(page, cfg.flipRecharge);
  await isolate(page);
  f0 = await flips(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  check('keys: Enter flips when charged', (await flips(page)) === f0 + 1);
  await isolate(page);
  f0 = await flips(page);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  check('keys: holding Space fires one Flip (auto-repeat ignored)', (await flips(page)) === f0 + 1);
  // Esc / P pause
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(150);
    check(`keys: ${key} pauses`, (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause');
    await page.keyboard.press(key); await page.waitForTimeout(150);
    check(`keys: ${key} resumes`, (await mode(page)) === 'playing' && (await ui(page)) === null);
  }
  // M mute
  const mu0 = await ev(page, () => RP.Game.settings.muted);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const mu1 = await ev(page, () => ({ m: RP.Game.settings.muted, saved: JSON.parse(RP.Storage.get('settings') || '{}').muted, mode: RP.Game.mode, toast: document.getElementById('toast').textContent }));
  check('keys: M toggles mute (saved, toast, keeps playing)', mu1.m === !mu0 && mu1.saved === mu1.m && mu1.mode === 'playing' && /sound/i.test(mu1.toast), mu1);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  // keys in pause do nothing to Dottie
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  f0 = await flips(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  check('keys: Space while paused does not Flip (it activates the focused Resume)', (await flips(page)) === f0, { mode: await mode(page) });
  if ((await mode(page)) === 'paused') await page.keyboard.press('Escape');
  // Enter restart after game over with the 0.7 s lock
  await freeze(page);
  await ev(page, () => T.killToOver(100));
  await ev(page, () => T.countStarts());
  // QA: presses are timed in page time (performance.now() - overAt), so a slow machine can't push them past the lock
  const early = [];
  for (let i = 0; i < 6; i++) {
    const dt = await ev(page, () => performance.now() - RP.Game.overAt);
    if (dt > 620) break;
    await page.keyboard.press('Enter'); early.push(Math.round(dt)); await page.waitForTimeout(40);
  }
  check('keys: Enter spam in the first 0.7 s after game over does not restart', early.length > 0 && (await starts(page)) === 0 && (await mode(page)) === 'over', { starts: await starts(page), early });
  await page.waitForTimeout(750);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  check('keys: Enter spam after the lock starts exactly ONE new game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page);
  await ev(page, () => T.killToOver(10));
  await page.waitForTimeout(800);
  await ev(page, () => T.countStarts());
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('keys: Space on Game Over (after the lock) restarts once', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  errorsOk(page, 'keyboard');
  await close(page);
}

async function testMouse() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await startFrozen(page);
  await isolate(page, { h: 0 });
  // mouse follow: Dottie skates toward the cursor
  const tgt = await ev(page, () => { const A = RP.debug.world.arena; return { x: A.x0 + 160, y: A.y1 - 90 }; });
  const a = await ev(page, t => T.toClient(t.x, t.y), tgt);
  await page.mouse.move(a.x + 20, a.y - 10); await page.mouse.move(a.x, a.y, { steps: 4 }); await page.waitForTimeout(80);
  const md = await ev(page, t => { const G = RP.Game, w = G.world; let m = 1e9; for (let i = 0; i < 300; i++) { G.step(1 / 60); m = Math.min(m, Math.hypot(w.hero.x - t.x, w.hero.y - t.y)); } return { m, ptr: G.renderer.pointer, follow: G._mouseFollow }; }, tgt);
  check('mouse: moving the mouse makes Dottie swim to the cursor', md.m < 30 && md.follow, md);
  const orbit = await ev(page, t => { const G = RP.Game, w = G.world; let mx = 0; for (let i = 0; i < 240; i++) { G.step(1 / 60); mx = Math.max(mx, Math.hypot(w.hero.x - t.x, w.hero.y - t.y)); } return mx; }, tgt);
  check('mouse: with the cursor still, Dottie carves around it (stays within ~3 turn radii)', orbit < 160, Math.round(orbit));
  // left click on the playfield: no Flip
  await isolate(page);
  let f0 = await flips(page);
  const m = await ev(page, () => { const A = RP.debug.world.arena; return T.toClient((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2 + 60); });
  await page.mouse.click(m.x, m.y); await page.waitForTimeout(60);
  check('mouse: left click on the playfield does not Flip', (await flips(page)) === f0);
  // right click = Flip, no context menu
  await isolate(page);
  f0 = await flips(page);
  await page.mouse.click(m.x, m.y, { button: 'right' }); await page.waitForTimeout(60);
  check('mouse: right-click flips', (await flips(page)) === f0 + 1);
  // hovering the HUD: no pull to the corner
  await isolate(page, { h: Math.PI });
  const pb = await ev(page, () => T.rectOf('btnPause'));
  await page.mouse.move(pb.cx, pb.cy, { steps: 4 }); await page.waitForTimeout(80);
  await page.mouse.move(pb.cx + 2, pb.cy + 2); await page.waitForTimeout(60);
  const h0 = (await hero(page)).h;
  await simStep(page, 0.6);
  const sh = await hero(page);
  check('mouse: hovering the HUD pause button does not steer Dottie to it', Math.abs(await ev(page, ([a, b]) => T.wrap(a - b), [sh.h, h0])) < 0.05, { h0, h: sh.h });
  // click HUD pause / mute
  await isolate(page);
  await page.mouse.click(pb.cx, pb.cy); await page.waitForTimeout(150);
  check('mouse: click HUD pause → paused', (await mode(page)) === 'paused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('mouse: Esc resumes from pause', (await mode(page)) === 'playing');
  const mb = await ev(page, () => T.rectOf('btnMuteHud'));
  const mu0 = await ev(page, () => RP.Game.settings.muted);
  await page.mouse.click(mb.cx, mb.cy); await page.waitForTimeout(80);
  check('mouse: HUD sound button toggles mute and keeps playing', (await ev(page, () => RP.Game.settings.muted)) === !mu0 && (await mode(page)) === 'playing');
  // after clicking the HUD sound button, Space must Flip and NOT toggle sound again (focused button)
  await isolate(page);
  f0 = await flips(page);
  const mu1 = await ev(page, () => RP.Game.settings.muted);
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  const after = await ev(page, () => ({ m: RP.Game.settings.muted, mode: RP.Game.mode, f: RP.debug.world.flips, focus: document.activeElement && document.activeElement.id }));
  check('focus: Space/Enter after clicking the HUD sound button = Flip only (no second mute toggle)', after.m === mu1 && after.f === f0 + 1 && after.mode === 'playing', after);
  await ev(page, () => { if (RP.Game.settings.muted) RP.Game.toggleMute(); });
  errorsOk(page, 'mouse');
  await close(page);
}

async function testTouch() {
  const page = await newPage({ viewport: { width: 1180, height: 820 }, dsf: 2, touch: true, mobile: true });
  await boot(page, 'seed=5');
  check('touch: isTouch detected (coarse pointer)', await ev(page, () => RP.Game.isTouch && document.body.classList.contains('touch')));
  await tapEl(page, 'btnPlay'); await page.waitForTimeout(250);
  check('touch: tapping Play starts the game', (await mode(page)) === 'playing');
  await freeze(page); await toPlaying(page);
  const cfg = await ev(page, () => RP.debug.world.cfg);
  check('touch: Flip button visible during play', await visible(page, '#btnAction'));
  await isolate(page, { h: 0 });
  // one finger steers toward the finger
  const tgt = await ev(page, () => { const A = RP.debug.world.arena; return { x: A.x0 + 150, y: A.y0 + 110 }; });
  const a = await ev(page, t => T.toClient(t.x, t.y), tgt);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]); await page.waitForTimeout(80);
  const md = await ev(page, t => { const G = RP.Game, w = G.world; let m = 1e9; for (let i = 0; i < 300; i++) { G.step(1 / 60); m = Math.min(m, Math.hypot(w.hero.x - t.x, w.hero.y - t.y)); } return { m, down: G.pointerDown }; }, tgt);
  check('touch: holding one finger makes Dottie swim to it', md.m < 30 && md.down, md);
  // drag the finger
  const tgt2 = await ev(page, () => { const A = RP.debug.world.arena; return { x: A.x1 - 160, y: A.y1 - 110 }; });
  const b = await ev(page, t => T.toClient(t.x, t.y), tgt2);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(80);
  const md2 = await ev(page, t => { const G = RP.Game, w = G.world; let m = 1e9; for (let i = 0; i < 360; i++) { G.step(1 / 60); m = Math.min(m, Math.hypot(w.hero.x - t.x, w.hero.y - t.y)); } return m; }, tgt2);
  check('touch: dragging the finger keeps steering', md2 < 30, md2);
  // second finger = Flip, and it never steers
  await ev(page, () => { const s = RP.debug.world.hero; s.flip = 1; s.jump = 0; s.z = 0; });
  let f0 = await flips(page);
  const s2 = await ev(page, () => { const A = RP.debug.world.arena; return T.toClient(A.x0 + 200, A.y1 - 60); });
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 1 }, { x: s2.x, y: s2.y, id: 2 }]); await page.waitForTimeout(80);
  check('touch: a second finger flips', (await flips(page)) === f0 + 1);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }, { x: s2.x + 40, y: s2.y - 30, id: 2 }]); await page.waitForTimeout(80);
  const ptr = await ev(page, () => RP.Game.renderer.pointer);
  check('touch: moving the 2nd finger does not move the steering target', ptr && near(ptr[0], tgt2.x, 2) && near(ptr[1], tgt2.y, 2), { ptr, tgt2 });
  await touch(page, 'touchEnd', [{ x: s2.x + 40, y: s2.y - 30, id: 2 }]); await page.waitForTimeout(40);   // CDP: touchEnd lists the fingers that lift
  check('touch: lifting the Flip finger keeps the steering finger active', await ev(page, () => RP.Game.pointerDown === true));
  await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.2);
  check('touch: lifting all fingers stops steering (Dottie keeps his heading)', await ev(page, () => RP.Game.pointerDown === false && RP.debug.world._target === null && RP.Game.renderer.pointer === null));
  // on-screen Flip button
  await simStep(page, cfg.flipRecharge + 0.2);
  await isolate(page, { h: 0 });
  const ab = await ev(page, () => T.rectOf('btnAction'));
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: ab.cx, y: ab.cy, id: 3 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  const afterBtn = await ev(page, () => ({ f: RP.debug.world.flips, down: RP.Game.pointerDown, ptr: RP.Game.renderer.pointer, tgt: RP.debug.world._target }));
  check('touch: Flip button flips', afterBtn.f === f0 + 1, afterBtn);
  check('touch: Flip button never steers Dottie', !afterBtn.down && !afterBtn.ptr && !afterBtn.tgt, afterBtn);
  await touch(page, 'touchStart', [{ x: ab.cx, y: ab.cy, id: 4 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  check('touch: Flip button does nothing while recharging', (await flips(page)) === f0 + 1);
  check('touch: Flip button shows the charge (not ready right after a flip)', await ev(page, () => !document.getElementById('btnAction').classList.contains('ready')));
  // steering finger + Flip button with a second finger
  await simStep(page, cfg.flipRecharge + 0.2);
  await isolate(page, { h: 0 });
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 5 }]); await page.waitForTimeout(40);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 5 }, { x: ab.cx, y: ab.cy, id: 6 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', [{ x: ab.cx, y: ab.cy, id: 6 }]); await page.waitForTimeout(60);
  check('touch: steering finger + Flip button = exactly one Flip, still steering', (await flips(page)) === f0 + 1 && (await ev(page, () => RP.Game.pointerDown)), await flips(page) - f0);
  // HUD pause works while a finger steers
  const pb = await ev(page, () => T.rectOf('btnPause'));
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 5 }, { x: pb.cx, y: pb.cy, id: 7 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', [{ x: pb.cx, y: pb.cy, id: 7 }]); await page.waitForTimeout(200);
  check('touch: tapping HUD pause with a second finger while steering pauses', (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause');
  check('touch: that pause tap was not also a Flip', (await flips(page)) === f0, (await flips(page)) - f0);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(100);
  await tapEl(page, 'btnResume'); await page.waitForTimeout(250);
  check('touch: Resume (tap) resumes', (await mode(page)) === 'playing');
  await freeze(page);
  // first finger after pause steers (not counted as a 2nd finger)
  await isolate(page, { h: 0 });
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 8 }]); await page.waitForTimeout(80);
  check('touch: first finger after pause/resume steers (not a Flip)', (await ev(page, () => RP.Game.pointerDown)) && (await flips(page)) === f0);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(60);
  // finger held while pausing (with the HUD), lifted while paused, resume: no stale finger
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 9 }]); await page.waitForTimeout(40);
  await ev(page, () => RP.Game.pause()); await page.waitForTimeout(80);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(60);
  await ev(page, () => RP.Game.resume()); await freeze(page);
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 10 }]); await page.waitForTimeout(60);
  check('touch: finger lifted during pause leaves no stale finger (next finger steers)', (await ev(page, () => RP.Game.pointerDown)) && (await flips(page)) === f0);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(60);
  // finger HELD through pause + resume (the other hand taps Pause / Resume): the held finger should either keep
  // steering after Resume, or a fresh finger must steer — it must not silently turn every new touch into a Flip
  await simStep(page, cfg.flipRecharge + 0.2);
  await isolate(page, { h: 0 });
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 11 }]); await page.waitForTimeout(40);
  await ev(page, () => RP.Game.pause()); await page.waitForTimeout(80);
  await ev(page, () => RP.Game.resume()); await freeze(page);
  await touch(page, 'touchMove', [{ x: a.x, y: a.y, id: 11 }]); await page.waitForTimeout(60);
  const held = await ev(page, () => ({ down: RP.Game.pointerDown, ptr: RP.Game.renderer.pointer, touches: RP.Game._touches ? RP.Game._touches.size : 0 }));
  f0 = await flips(page);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 11 }, { x: b.x, y: b.y, id: 12 }]); await page.waitForTimeout(60);
  const nf = await ev(page, () => ({ down: RP.Game.pointerDown, flips: RP.debug.world.flips }));
  check('touch: a finger held through Pause→Resume keeps steering, or the next finger steers (not a Flip)', held.down || (nf.down && nf.flips === f0), { held, next: nf, f0 });
  await touch(page, 'touchEnd', []); await page.waitForTimeout(60);
  await shot(page, '07_touch_ipad');
  errorsOk(page, 'touch');
  await close(page);
}

async function testGhostClicks() {
  const page = await newPage({ viewport: { width: 390, height: 844 }, dsf: 3, touch: true, mobile: true });
  await boot(page, 'seed=5');
  await ev(page, () => { window._picks = 0; const fp = document.getElementById('filePick'); const o = fp.click.bind(fp); fp.click = () => { window._picks++; }; });
  const set0 = await ev(page, () => JSON.stringify(RP.Game.settings));
  for (const [btn, scr] of [['btnHow', 'scrHow'], ['btnSettings', 'scrSettings'], ['btnCustomize', 'scrCustom']]) {
    await tapEl(page, btn); await page.waitForTimeout(700);
    check(`ghost: tapping ${btn} opens ${scr} and the delayed click does not hit the new screen`, (await ui(page)) === scr, await ui(page));
    // tap the back button: the title's button under the finger must not fire
    await ev(page, () => T.countStarts());
    const back = await ev(page, s => { const b = document.querySelector('#' + s + ' .btn-back'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, scr);
    await page.touchscreen.tap(back.x, back.y); await page.waitForTimeout(700);
    check(`ghost: tapping back on ${scr} lands on the title only (nothing under the finger fires)`, (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title' && (await starts(page)) === 0, { ui: await ui(page), starts: await starts(page) });
  }
  check('ghost: no settings changed and no file picker opened by ghost clicks', (await ev(page, () => JSON.stringify(RP.Game.settings))) === set0 && (await ev(page, () => window._picks)) === 0, await ev(page, () => window._picks));
  await tapEl(page, 'btnPlay'); await page.waitForTimeout(500);
  check('ghost: tapping Play starts one game', (await mode(page)) === 'playing');
  await tapEl(page, 'btnPause'); await page.waitForTimeout(700);
  check('ghost: tapping HUD pause opens Pause and stays there', (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause');
  await tapEl(page, 'btnPauseSettings'); await page.waitForTimeout(700);
  check('ghost: Pause → Settings by tap stays on Settings', (await ui(page)) === 'scrSettings');
  const back = await ev(page, () => { const b = document.querySelector('#scrSettings .btn-back'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(back.x, back.y); await page.waitForTimeout(700);
  check('ghost: Settings Done → back on Pause (no ghost Resume/Restart/Menu)', (await ui(page)) === 'scrPause' && (await mode(page)) === 'paused', { ui: await ui(page), mode: await mode(page) });
  await tapEl(page, 'btnResume'); await page.waitForTimeout(500);
  check('ghost: Resume by tap → playing', (await mode(page)) === 'playing');
  await freeze(page);
  await ev(page, () => T.killToOver(30));
  await page.waitForTimeout(900);
  await ev(page, () => T.countStarts());
  await tapEl(page, 'btnOverMenu'); await page.waitForTimeout(700);
  check('ghost: Game Over → Menu by tap lands on the title (no ghost Play)', (await ui(page)) === 'scrTitle' && (await starts(page)) === 0);
  errorsOk(page, 'ghost clicks');
  await close(page);
}

async function testScoring() {
  const page = await newPage();
  await boot(page, 'seed=9');
  const cfg = await startFrozen(page);
  await ev(page, () => T.hookEvents());
  // plain note, empty trail
  await isolate(page);
  await ev(page, () => { const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y); });
  let s0 = await ev(page, () => RP.debug.world.score);
  await simStep(page, 1 / 60);
  let n = await ev(page, () => T.log('note'));
  check('score: note with an empty trail = notePoints (10)', n.length === 1 && n[0].points === cfg.notePoints && (await ev(page, () => RP.debug.world.score)) - s0 === cfg.notePoints, n);
  check('score: picked note joins the trail (trail 1, song 1)', await ev(page, () => RP.debug.world.trail.length === 1 && RP.debug.world.song === 1));
  // note with a trail of 5 → 10 + 2×5
  await ev(page, () => T.clearLog()); await isolate(page);
  await ev(page, () => { T.addTrail(5); const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y); });
  s0 = await ev(page, () => RP.debug.world.score);
  await simStep(page, 1 / 60);
  n = await ev(page, () => T.log('note'));
  const exp5 = cfg.notePoints + cfg.notePerTrail * 5;
  check('score: note with trail 5 = 10 + 2×5', n.length === 1 && n[0].points === exp5 && (await ev(page, () => RP.debug.world.score)) - s0 === exp5, { got: n[0] && n[0].points, exp5 });
  // gold ×3
  await ev(page, () => T.clearLog()); await isolate(page);
  await ev(page, () => { T.addTrail(3); const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y, { gold: true }); });
  await simStep(page, 1 / 60);
  n = await ev(page, () => T.log('note'));
  const expG = (cfg.notePoints + cfg.notePerTrail * 3) * cfg.goldMul;
  check('score: golden note = (10 + 2×trail) × goldMul (5)', n.length === 1 && n[0].points === expG && n[0].gold, { got: n[0] && n[0].points, expG });
  // regrab (loose note) = 5
  await ev(page, () => T.clearLog()); await isolate(page);
  await ev(page, () => { T.addTrail(2); const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y, { state: 'loose', t: 1, life: 3 }); });
  s0 = await ev(page, () => RP.debug.world.score);
  await simStep(page, 1 / 60);
  const rg = await ev(page, () => ({ r: T.log('regrab').length, n: T.log('note'), score: RP.debug.world.score }));
  check('score: re-grabbing a loose note = regrabPoints (5) and a regrab event', rg.r === 1 && rg.n.length === 1 && rg.n[0].points === cfg.regrabPoints && rg.score - s0 === cfg.regrabPoints, rg);
  // loose note still flying (age < looseMinAge) cannot be grabbed
  await ev(page, () => T.clearLog()); await isolate(page);
  await ev(page, () => { const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y, { state: 'loose', t: 0, life: 3 }); });
  await simStep(page, 1 / 60);
  check('score: a loose note that just scattered is not instantly re-grabbed', (await ev(page, () => T.log('note').length)) === 0);
  // notes during 'ready' are not collected
  await ev(page, () => { RP.debug.gotoLevel(0); T.clearLog(); const w = RP.debug.world; w.cfg.notesOnField = 0; w.notes.length = 0; const s = w.hero; T.addNote(s.x + 4, s.y); });
  await simStep(page, 0.2);
  check('score: no pickups during the ready banner', (await ev(page, () => T.log('note').length)) === 0 && (await ev(page, () => RP.debug.world.state)) === 'ready');
  await toPlaying(page);
  // bonk costs a heart and cuts the trail
  await ev(page, () => T.clearLog()); await isolate(page);
  const lb = await ev(page, () => T.loopBonk());
  const h0 = await ev(page, () => RP.debug.world.hearts);
  await simStep(page, 1 / 60);
  const bk = await ev(page, () => ({ b: T.log('bonk'), hearts: RP.debug.world.hearts, trail: RP.debug.world.trail.length, loose: RP.debug.world.notes.filter(n => n.state === 'loose').length, inv: RP.debug.world.hero.invuln, dizzy: RP.debug.world.hero.dizzy }));
  check('bonk: swimming into your own parade (index ≥ safeNeck) costs one heart', bk.b.length === 1 && bk.hearts === h0 - 1, { lb, bk });
  check('bonk: trail is cut at the hit note; cut notes become loose (re-collectable)', bk.trail === lb.K && bk.loose === 1 && bk.b[0] && bk.b[0].lost === 1, bk);
  check('bonk: Dottie gets invulnerability + dizziness', bk.inv > 0 && bk.dizzy > 0, bk);
  // invulnerable → no second bonk
  await ev(page, () => { T.clearLog(); const s = RP.debug.world.hero, inv = s.invuln; T.place(null, null, 0); s.invuln = inv; T.loopBonk(); s.invuln = 1; });
  await simStep(page, 1 / 60);
  check('bonk: no bonk while blinking (invuln)', (await ev(page, () => T.log('bonk').length)) === 0);
  // airborne → no bonk
  await ev(page, () => { T.clearLog(); T.isolate(); T.loopBonk(); const s = RP.debug.world.hero; s.jump = 0.3; s.z = 20; });
  await simStep(page, 1 / 120, 1 / 120);
  check('bonk: flipping over the tail never bonks', (await ev(page, () => T.log('bonk').length)) === 0);
  // safe neck: notes < safeNeck never bonk
  await ev(page, () => {
    T.clearLog(); T.isolate(); const w = RP.debug.world, c = w.cfg, s = w.hero;
    const K = c.safeNeck - 1, C = (K + 1) * c.trailSpacing, R = C / (2 * Math.PI), N = Math.ceil(C / 2), cx = s.x, cy = s.y - R;
    w._pathHead = -1; w._pathLen = 0; for (let k = 0; k <= N; k++) { const th = Math.PI / 2 + 2 * Math.PI * (1 - k / N); w._pushPath(cx + R * Math.cos(th), cy + R * Math.sin(th)); }
    T.addTrail(K + 1);
  });
  await simStep(page, 1 / 120, 1 / 120);
  check('bonk: the first safeNeck notes never bonk', (await ev(page, () => T.log('bonk').length)) === 0);
  // golden sea star: goldNow() pops one out of the sand, away from Dottie
  await ev(page, () => { T.clearLog(); T.isolate(); RP.debug.goldNow(); T.step(1 / 60); });
  const gs = await ev(page, () => { const w = RP.debug.world, g = w.notes.find(n => n.gold), s = w.hero; return { ev: T.log('goldspawn').length, n: w.notes.filter(n => n.gold).length, state: g && g.state, d: g ? Math.hypot(g.x - s.x, g.y - s.y) : 0, min: w.cfg.goldMinDist || 160, text: RP.Game.renderer.texts.some(t => /Golden star/.test(t.text)) }; });
  check('gold: goldNow() → one golden star pops out (goldspawn), far from Dottie, "Golden star!" shown', gs.ev === 1 && gs.n === 1 && /spawn|flee/.test(gs.state) && gs.d >= gs.min - 1 && gs.text, gs);
  await ev(page, () => T.step(1));
  const gf = await ev(page, () => { const w = RP.debug.world, g = w.notes.find(n => n.gold), s = w.hero; return { state: g && g.state, d: g ? Math.hypot(g.x - s.x, g.y - s.y) : 0 }; });
  check('gold: it scoots ("flee") after the spawn pop', gf.state === 'flee', gf);
  // catch it: worth 5 on the song, points × goldMul, a golden star joins the parade, golden popup + flash
  const gc0 = await ev(page, () => ({ score: RP.debug.world.score, song: RP.debug.world.song, golds: RP.debug.world.golds, run: RP.Game.run.golds }));
  await ev(page, () => { T.clearLog(); const w = RP.debug.world, g = w.notes.find(n => n.gold), s = w.hero; g.x = g._px = s.x + 4; g.y = g._py = s.y; T.step(1 / 60); });
  const gc = await ev(page, () => { const w = RP.debug.world, R = RP.Game.renderer; return { note: T.log('note').filter(e => e.gold), gold: T.log('gold'), score: w.score, song: w.song, golds: w.golds, run: RP.Game.run.golds, trailGold: w.trail.filter(t => t.gold).length, left: w.notes.filter(n => n.gold).length, flash: R.goldFlash, plus5: R.texts.some(t => t.text === '+5!') }; });
  check('gold: catching it → note{gold} + gold events, song +5, golds +1 (world and run stats)', gc.note.length === 1 && gc.gold.length === 1 && gc.song - gc0.song === Math.min(cfg.goldWorth || 5, 99) && gc.golds === gc0.golds + 1 && gc.run === gc0.run + 1 && gc.left === 0, { gc, gc0 });
  check('gold: points = star points × goldMul, a golden star joins the parade', gc.score - gc0.score === gc.note[0].points && gc.note[0].points === (cfg.notePoints + cfg.notePerTrail * 0) * cfg.goldMul && gc.trailGold === 1, { gc, gc0 });
  check('gold: big "+5!" popup and a golden flash', gc.plus5 && gc.flash > 0.5, gc);
  await page.waitForTimeout(80); await shot(page, '07b_gold_caught');
  // miss it: after its life it burrows (goldhide) and is gone after goldHideTime
  await ev(page, () => { T.clearLog(); T.isolate(); RP.debug.goldNow(); T.step(0.6); const g = RP.debug.world.notes.find(n => n.gold); g.life = 0.05; T.step(0.1); });
  const gh = await ev(page, () => ({ hide: T.log('goldhide').length, state: (RP.debug.world.notes.find(n => n.gold) || {}).state, missed: RP.debug.world.goldMissed }));
  await ev(page, () => T.step((RP.debug.world.cfg.goldHideTime || 0.5) + 0.1));
  const gh2 = await ev(page, () => RP.debug.world.notes.filter(n => n.gold).length);
  check('gold: missed → it hides (goldhide), then disappears', gh.hide === 1 && gh.state === 'hide' && gh.missed >= 1 && gh2 === 0, { gh, gh2 });
  // song complete → cleared → next biome
  await ev(page, () => { T.clearLog(); T.isolate(); const w = RP.debug.world; w.hearts = w.heartsMax - 1; T.addTrail(w.songTarget - 1); w.hero.invuln = 5; const s = w.hero; T.addNote(s.x + 4, s.y); });
  const before = await ev(page, () => ({ score: RP.debug.world.score, hearts: RP.debug.world.hearts, target: RP.debug.world.songTarget, trail: RP.debug.world.trail.length }));
  await simStep(page, 1 / 60);
  const cl = await ev(page, () => ({ sd: T.log('songdone').length, c: T.log('cleared'), n: T.log('note'), state: RP.debug.world.state, score: RP.debug.world.score, hearts: RP.debug.world.hearts, notes: RP.debug.world.notes.length }));
  const expBonus = before.hearts * cfg.clearBonusPerHeart;
  check('song: last note of the song → songdone + cleared, state cleared', cl.sd === 1 && cl.c.length === 1 && cl.state === 'cleared', cl);
  check('song: bonus = hearts × 100 and +1 heart', cl.c[0] && cl.c[0].bonus === expBonus && cl.score - before.score === cl.n[0].points + expBonus && cl.hearts === Math.min(cfg.heartsMax, before.hearts + cfg.healOnClear), { cl, before, expBonus });
  check('song: field cleared during the celebration', cl.notes === 0, cl);
  await page.waitForTimeout(100);
  await shot(page, '08_song_complete');
  await ev(page, () => { const G = RP.Game; let i = 0; while (G.world.level === 0 && i++ < 600) G.step(1 / 60); });
  const nx = await ev(page, () => ({ biome: T.log('biome'), level: RP.debug.world.level, b: RP.debug.world.biome, state: RP.debug.world.state, trail: RP.debug.world.trail.length, song: RP.debug.world.song, target: RP.debug.world.songTarget, wb: RP.debug.weather.biome, ab: RP.Audio.season, rv: RP.Game.renderer.vis.cur, banner: RP.Game.renderer.banner && RP.Game.renderer.banner.s }));
  const exp1 = await ev(page, () => RP.debug.world.levelInfo(1).songTarget);
  check('level: after the celebration the next biome starts (level 1, Summer Shallows), trail empty', nx.level === 1 && nx.b === 1 && nx.state === 'ready' && nx.trail === 0 && nx.song === 0 && nx.target === exp1 && nx.biome.length === 1 && nx.biome[0].biome === 1, nx);
  check('level: weather, music and background switch to the new biome; banner shown', nx.wb === 1 && nx.ab === 1 && nx.rv === 1 && nx.banner === 1, nx);
  // gotoLevel through all biomes + lap
  for (const L of [2, 3, 4, 5]) {
    await ev(page, L => { T.clearLog(); RP.debug.gotoLevel(L); T.step(0.05); }, L);
    const g = await ev(page, () => ({ level: RP.debug.world.level, biome: RP.debug.world.biome, lap: RP.debug.world.lap, wb: RP.debug.weather.biome, rv: RP.Game.renderer.vis.cur, target: RP.debug.world.songTarget }));
    const ex = await ev(page, L => RP.debug.world.levelInfo(L), L);
    check(`level: gotoLevel(${L}) → biome ${L % 4}, lap ${Math.floor(L / 4)}, song ${ex.songTarget}; visuals follow`, g.level === L && g.biome === L % 4 && g.lap === Math.floor(L / 4) && g.wb === L % 4 && g.rv === L % 4 && g.target === ex.songTarget, g);
  }
  const sp = await ev(page, () => [0, 1, 2, 3, 4].map(i => RP.debug.world.levelInfo(i).speed));
  check('level: speed grows per biome and per lap', sp[1] > sp[0] && sp[3] > sp[2] && sp[4] > sp[0], sp);
  await page.waitForTimeout(200);
  await shot(page, '09_level_lap');
  errorsOk(page, 'scoring');
  await close(page);
}

async function testPauseAndOver() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t0 = await ev(page, () => RP.debug.world.time);
    await page.waitForTimeout(400);
    const t1 = await ev(page, () => RP.debug.world.time);
    check(`pause: ${key} pauses and freezes world time; HUD hidden`, (await mode(page)) === 'paused' && t1 === t0 && !(await visible(page, '#btnPause')));
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t2 = await ev(page, () => RP.debug.world.time);
    await page.waitForTimeout(300);
    check(`pause: ${key} resumes without a time jump`, (await mode(page)) === 'playing' && (await ev(page, () => RP.debug.world.time)) > t2 && t2 - t1 < 0.3);
  }
  // blur / visibilitychange
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur auto-pauses', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  check('pause: tab hidden (visibilitychange) auto-pauses', (await mode(page)) === 'paused');
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  check('pause: coming back to the tab stays paused (child resumes on purpose)', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(50);
  await ev(page, () => window.dispatchEvent(new Event('blur')));
  await page.click('#btnResume'); await page.waitForTimeout(100);
  check('pause: held keys are cleared by blur', await ev(page, () => Object.keys(RP.Game.keys).length === 0));
  await page.keyboard.up('ArrowRight');
  // Restart / Main Menu
  await ev(page, () => T.countStarts());
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnRestart'); await page.waitForTimeout(150);
  check('pause: Restart starts a fresh run', (await mode(page)) === 'playing' && (await starts(page)) === 1 && (await ev(page, () => RP.debug.world.score)) === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseMenu'); await page.waitForTimeout(150);
  check('pause: Main Menu returns to the title', (await mode(page)) === 'title' && (await ui(page)) === 'scrTitle' && !(await visible(page, '#btnPause')));
  // no pause on the death frame
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { T.isolate(); RP.debug.world.hearts = 1; T.loopBonk(); T.step(1 / 60); });
  check('death: last bonk → world state dead', (await ev(page, () => RP.debug.world.state)) === 'dead');
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  check('death: Esc during the death animation does not pause', (await mode(page)) === 'playing');
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(60);
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  check('death: blur / tab-hidden during the death animation do not pause', (await mode(page)) === 'playing');
  const f0 = await flips(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('death: no Flip while dead', (await flips(page)) === f0);
  await simStep(page, 1.6);
  await page.waitForTimeout(150);
  check('death: game over screen ~1.4 s later', (await mode(page)) === 'over' && (await ui(page)) === 'scrOver');
  // Game Over contents
  await ev(page, () => RP.Game.toTitle());
  await ev(page, () => RP.Game.resetBest());
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { T.isolate(); const s = RP.debug.world.hero; T.addNote(s.x + 4, s.y); T.step(1 / 60); T.addNote(s.x + 4, s.y); T.step(1 / 60); });
  const notesRun = await ev(page, () => RP.Game.run.notes);
  await ev(page, () => T.killToOver(1234, 2));
  await page.waitForTimeout(250);
  const o = await ev(page, () => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: RP.Storage.get('best_normal'), medal: document.getElementById('medal').className, medalName: document.getElementById('medalName').textContent, stats: document.getElementById('overStats').textContent }));
  check('over: score + NEW best shown and saved as best_normal', o.score === '1234' && o.best === '1234' && o.nb && o.stored === '1234', o);
  check('over: medal by biomes cleared (2 → silver)', /silver/.test(o.medal) && /Silver/.test(o.medalName), o);
  check('over: stats show sea stars, golden stars, longest parade, bonks and the season reached', /Sea stars:\s*2/.test(o.stats) && /Golden stars:\s*0/.test(o.stats) && /Longest parade/.test(o.stats) && /Bonks:\s*1/.test(o.stats) && /Autumn Kelp/.test(o.stats), { notesRun, stats: o.stats });
  check('over: HUD and Flip button hidden', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  await shot(page, '10_over');
  await ev(page, () => T.countStarts());
  await page.waitForTimeout(750);
  await page.click('#btnAgain'); await page.click('#btnAgain', { force: true, timeout: 500 }).catch(() => {});
  await page.waitForTimeout(150);
  check('over: double-clicking Play Again starts exactly one game', (await starts(page)) === 1, await starts(page));
  await freeze(page);
  await ev(page, () => T.killToOver(50));
  await page.waitForTimeout(150);
  const o2 = await ev(page, () => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: RP.Storage.get('best_normal'), medal: document.getElementById('medal').className }));
  check('over: lower score keeps the best, no NEW badge, no medal', o2.best === '1234' && !o2.nb && o2.stored === '1234' && /none/.test(o2.medal), o2);
  await page.click('#btnOverMenu'); await page.waitForTimeout(200);
  check('over: title shows best 1234', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '1234');
  // best per difficulty
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('best: title shows the Easy best (0) after switching to Easy', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '0');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page);
  const easy = await ev(page, () => ({ hm: RP.debug.world.heartsMax, h: RP.debug.world.hearts, sp: RP.debug.world.cfg.speed0, E: RP.DIFFICULTY.easy }));
  check('best: Easy run uses Easy hearts and speed', easy.hm === easy.E.heartsMax && easy.h === easy.E.heartsMax && easy.sp === easy.E.speed0, easy);
  await ev(page, () => T.killToOver(777));
  await page.waitForTimeout(200);
  const bs = await ev(page, () => ({ e: RP.Storage.get('best_easy'), n: RP.Storage.get('best_normal') }));
  check('best: Easy best saved separately from Normal', bs.e === '777' && bs.n === '1234', bs);
  await page.click('#btnOverMenu'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings'); await page.click('#setDifficulty button[data-v=hard]'); await page.click('#scrSettings .btn-back'); await page.click('#btnResume');
  await freeze(page);
  await ev(page, () => T.killToOver(900));
  await page.waitForTimeout(150);
  const bs2 = await ev(page, () => ({ e: RP.Storage.get('best_easy'), h: RP.Storage.get('best_hard') }));
  check('best: switching difficulty mid-run credits the run\'s difficulty (Easy)', bs2.e === '900' && !bs2.h, bs2);
  await ev(page, () => RP.Game.setSetting('difficulty', 'normal'));
  errorsOk(page, 'pause+over');
  await close(page);
}

async function testSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await newPage({}, ctx);
  await boot(page, 'seed=5', false);
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  const s0 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, d: document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: defaults sfx + music on, Normal', s0.sfx && s0.music && s0.d === 'normal', s0);
  await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)');
  await page.click('#setDifficulty button[data-v=hard]');
  await page.waitForTimeout(100);
  const a = await ev(page, () => ({ s: RP.Game.settings, aud: { sfx: RP.Audio.sfxOn, music: RP.Audio.musicOn } }));
  check('settings: toggles change game + audio state', !a.s.sfx && !a.s.music && a.s.difficulty === 'hard' && !a.aud.sfx && !a.aud.music, a);
  check('settings: difficulty segment highlights Hard', await ev(page, () => document.querySelector('#setDifficulty button.on').dataset.v === 'hard'));
  await page.click('#scrSettings .btn-back');
  await page.reload();
  await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode === 'title');
  const b = await ev(page, () => RP.Game.settings);
  check('settings: sound, music and difficulty persist across reload', !b.sfx && !b.music && b.difficulty === 'hard', b);
  await page.click('#btnSettings'); await page.waitForTimeout(100);
  const ui1 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, d: document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: UI reflects the saved values after reload', !ui1.sfx && !ui1.music && ui1.d === 'hard', ui1);
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const hard = await ev(page, () => ({ cfg: RP.debug.world.cfg, D: RP.DIFFICULTY.hard }));
  check('settings: Hard difficulty applied to the new world', Object.keys(hard.D).every(k => JSON.stringify(hard.cfg[k]) === JSON.stringify(hard.D[k])), Object.keys(hard.D).filter(k => JSON.stringify(hard.cfg[k]) !== JSON.stringify(hard.D[k])));
  check('settings: music off → no music during play', await ev(page, () => !RP.Audio._musicPlaying || !RP.Audio.musicOn));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M mutes (saved)', await ev(page, () => RP.Game.settings.muted && JSON.parse(RP.Storage.get('settings')).muted === true && RP.Audio.muted));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M again unmutes', await ev(page, () => !RP.Game.settings.muted && !RP.Audio.muted));
  // ?mute=1 never saved
  await page.goto(url('seed=5', true));
  await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode === 'title');
  const mu = await ev(page, () => ({ audio: RP.Audio.muted, saved: JSON.parse(RP.Storage.get('settings') || '{}').muted, setting: RP.Game.settings.muted }));
  check('settings: ?mute=1 mutes audio but is never written to storage', mu.audio === true && !mu.saved && !mu.setting, mu);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.click('label.set:has(#setSfx)'); await page.waitForTimeout(80);
  check('settings: changing other settings with ?mute=1 still does not save muted', await ev(page, () => !JSON.parse(RP.Storage.get('settings')).muted && JSON.parse(RP.Storage.get('settings')).difficulty === 'easy'));
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  check('settings: with ?mute=1 the HUD sound icon shows "muted"', await ev(page, () => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6')));
  // M twice under ?mute=1: toast should not claim "Sound on" while audio stays muted
  await page.keyboard.press('KeyM'); await page.waitForTimeout(60); await page.keyboard.press('KeyM'); await page.waitForTimeout(60);
  const mt = await ev(page, () => ({ toast: document.getElementById('toast').textContent, audio: RP.Audio.muted }));
  check('settings: with ?mute=1, M toast matches the real (muted) audio state', !(mt.audio && /sound on/i.test(mt.toast)), mt);
  // storage keys use the prp: prefix
  const keys = await ev(page, () => { const out = []; for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); return out; });
  check('storage: every localStorage key uses the prp: prefix', keys.length > 0 && keys.every(k => k.startsWith('prp:')), keys);
  // Reset best
  await page.keyboard.press('Escape');
  await ev(page, () => { RP.Storage.set('best_normal', '55'); RP.Storage.set('best_easy', '66'); RP.Storage.set('best_hard', '77'); });
  await page.click('#btnPauseSettings'); await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('settings: Reset best clears every difficulty (memory + localStorage)', await ev(page, () => !RP.Storage.get('best_normal') && !RP.Storage.get('best_easy') && !RP.Storage.get('best_hard') && !localStorage.getItem('prp:best_normal')));
  check('settings: Reset best shows a toast', /cleared/i.test(await toastText(page)));
  errorsOk(page, 'settings');
  await ctx.close();
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5');
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  check('custom: 6 slots (Dottie, sea star, 4 seasons)', (await page.locator('#slotGrid .slot').count()) === 6 && (await ev(page, () => RP.Assets.SLOTS.map(s => s.id).join(','))) === 'hero,note,bg_spring,bg_summer,bg_autumn,bg_winter' && /Sea star/.test(await ev(page, () => document.querySelectorAll('#slotGrid .slot h3')[1].textContent)));
  // opaque JPEG photo → Dottie, round sticker
  const photo = await makeImage(page, 900, 700, 'photo', 'image/jpeg');
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  let t = await waitToast(page, /saved/i);
  check('custom: photo for Dottie saved (toast)', /saved/i.test(t), t);
  const hs = await storedSize(page, 'img_hero');
  check('custom: hero picture downscaled to ≤ 512 px', hs && hs[0] <= 512 && hs[1] <= 512, hs);
  check('custom: opaque photo becomes a round sticker', (await ev(page, () => RP.Storage.get('shape_hero'))) === 'circle');
  check('custom: card shows "Your picture" + Round selected', await ev(page, () => { const s = document.querySelectorAll('#slotGrid .slot')[0]; return /Your picture/.test(s.textContent) && s.querySelector('.shape button.on').dataset.shape === 'circle'; }));
  const circ = await ev(page, () => { const c = RP.Assets.custom.hero; const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return { w: c.width, h: c.height, cornerA: d[3] }; });
  check('custom: round sticker has transparent corners', circ.w === circ.h && circ.cornerA === 0, circ);
  // transparent PNG → note, whole picture
  const cut = await makeImage(page, 300, 300, 'note', 'image/png');
  await pickFile(page, 'note', { name: 'note.png', mimeType: 'image/png', buffer: cut });
  t = await waitToast(page, /saved/i);
  check('custom: transparent PNG for the note keeps "Whole picture" with transparency', /saved/i.test(t) && (await ev(page, () => RP.Storage.get('shape_note'))) === 'fit' && (await ev(page, () => RP.Assets.custom.note.getContext('2d').getImageData(1, 1, 1, 1).data[3])) === 0, t);
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=circle]').click();
  check('custom: Round/Whole toggle switches the shape', (await ev(page, () => RP.Storage.get('shape_note'))) === 'circle');
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=fit]').click();
  // bad files
  await pickFile(page, 'note', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(page, /picture/i, 3000);
  check('custom: non-image file → friendly error, previous picture kept', /choose a picture/i.test(t) && (await ev(page, () => !!RP.Storage.get('img_note') && RP.Assets.hasCustom('note'))), t);
  await pickFile(page, 'note', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(page, /could not/i, 4000);
  check('custom: corrupt "image" → friendly "could not be opened" error', /could not/i.test(t), t);
  // huge background
  const huge = await makeImage(page, 4000, 3000, 'bg', 'image/jpeg');
  info('huge image bytes: ' + huge.length);
  const tH = Date.now();
  await pickFile(page, 'bg_spring', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
  t = await waitToast(page, /saved|room|could/i, 15000);
  const bs = await storedSize(page, 'img_bg_spring');
  check('custom: 4000×3000 background accepted and downscaled to ≤ 1280×720', /saved/i.test(t) && bs && bs[0] <= 1280 && bs[1] <= 720, { t, bs, ms: Date.now() - tH });
  await shot(page, '11_custom_cards');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  // play with all custom pictures
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  const pos = await ev(page, () => {
    T.isolate(); const w = RP.debug.world, A = w.arena, s = w.hero;
    const note = { x: A.x0 + 200, y: A.y0 + 150 };
    T.addNote(note.x, note.y);
    RP.Game.renderer.texts.length = 0; RP.Game.renderer.banner = null;
    return { s: { x: s.x, y: s.y }, note, bg: { x: A.x0 + 40, y: A.y1 - 140 } };
  });
  await page.waitForTimeout(300);
  const blueHero = await ev(page, p => T.probe(p.s.x - 25, p.s.y - 37, 50, 50, 'b > 150 && r < 70 && g < 70'), pos);
  const cyanNote = await ev(page, p => T.probe(p.note.x - 16, p.note.y - 18, 32, 32, 'g > 180 && b > 180 && r < 100'), pos);
  const purpleBg = await ev(page, p => T.probe(p.bg.x, p.bg.y, 160, 100, 'b > g + 30 && r > g + 5'), pos);
  check('custom: custom Dottie (blue photo) is drawn in play', blueHero > 300, Math.round(blueHero));
  check('custom: custom sea star is drawn in play', cyanNote > 60, Math.round(cyanNote));
  check('custom: custom Spring Bloom background is drawn', purpleBg > 8000, Math.round(purpleBg));
  await shot(page, '12_custom_play');
  // parade stars use the custom sea star too
  await ev(page, () => { T.isolate(); T.addTrail(4); RP.Game.renderer.texts.length = 0; });
  await page.waitForTimeout(200);
  const tr = await ev(page, () => { const t = RP.debug.world.trail[2]; return T.probe(t.x - 16, t.y - 19, 32, 32, 'g > 180 && b > 180 && r < 100'); });
  check('custom: parade stars use the custom sea star picture', tr > 60, Math.round(tr));
  // summer still default (no purple)
  await ev(page, () => { RP.debug.gotoLevel(1); T.step(1.5); T.isolate(); });
  await page.waitForTimeout(250);
  const purple2 = await ev(page, p => T.probe(p.bg.x, p.bg.y, 160, 100, 'b > g + 30 && r > g + 5'), pos);
  check('custom: Summer Shallows keeps its original sand', purple2 < 2000, Math.round(purple2));
  errorsOk(page, 'custom play');
  // reset one / reset all
  await ev(page, () => RP.debug.setSpeed(1));
  await page.keyboard.press('Escape'); await page.click('#btnPauseMenu'); await page.waitForTimeout(100);
  await page.click('#btnCustomize'); await page.waitForTimeout(100);
  await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await page.waitForTimeout(100);
  check('custom: Reset on Dottie removes only Dottie', await ev(page, () => !RP.Assets.hasCustom('hero') && !RP.Storage.get('img_hero') && !RP.Storage.get('shape_hero') && RP.Assets.hasCustom('note') && RP.Assets.hasCustom('bg_spring')));
  await page.click('#btnResetAll'); await page.waitForTimeout(100);
  check('custom: Reset all removes every custom picture (memory + storage)', await ev(page, () => RP.Assets.SLOTS.every(s => !RP.Assets.hasCustom(s.id) && !RP.Storage.get('img_' + s.id) && !RP.Storage.get('shape_' + s.id) && !localStorage.getItem('prp:img_' + s.id))));
  check('custom: cards back to "Original"', await ev(page, () => [...document.querySelectorAll('#slotGrid .slot .tag')].every(t => /Original/.test(t.textContent))));
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { T.isolate(); RP.Game.renderer.texts.length = 0; });
  await page.waitForTimeout(250);
  const back = await ev(page, p => T.probe(p.bg.x, p.bg.y, 160, 100, 'b > g + 30 && r > g + 5'), pos);
  check('custom: after Reset all the original Spring Bloom sand is drawn again (bg cache invalidated)', back < 2000, Math.round(back));
  // persistence across reload
  await page.keyboard.press('Escape'); await page.click('#btnPauseMenu'); await page.waitForTimeout(100);
  await page.click('#btnCustomize'); await page.waitForTimeout(100);
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await waitToast(page, /saved/i);
  await page.reload(); await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode === 'title');
  check('custom: custom picture reloads after a page reload (prp:img_hero)', await ev(page, () => RP.Assets.hasCustom('hero') && !!localStorage.getItem('prp:img_hero')));
  await ev(page, () => RP.Assets.SLOTS.forEach(s => RP.Assets.clearCustom(s.id)));
  errorsOk(page, 'custom');
  await ctx.close();
}

const VPS = [
  { w: 1280, h: 720, dsf: 1, touch: false, tag: 'desktop 1280x720' },
  { w: 1920, h: 1080, dsf: 1, touch: false, tag: 'desktop 1920x1080' },
  { w: 1366, h: 768, dsf: 1, touch: false, tag: 'desktop 1366x768' },
  { w: 800, h: 600, dsf: 1, touch: false, tag: 'desktop 800x600' },
  { w: 390, h: 844, dsf: 3, touch: true, tag: 'iPhone portrait 390x844@3' },
  { w: 844, h: 390, dsf: 3, touch: true, tag: 'iPhone landscape 844x390@3' },
  { w: 820, h: 1180, dsf: 2, touch: true, tag: 'iPad portrait 820x1180@2' },
  { w: 1180, h: 820, dsf: 2, touch: true, tag: 'iPad landscape 1180x820@2' }
];

/* wrap Game.step: after every sim step, check arena sync + Dottie/stars (golden too)/parade inside the arena + no idle star under the Flip button */
const installWatch = page => ev(page, () => {
  const G = RP.Game; window._viol = { arena: 0, hero: 0, notes: 0, trail: 0, avoid: 0, looseAvoid: 0, steps: 0, ex: [] };
  if (G._watched) return; G._watched = true;
  const o = G.step.bind(G);
  G.step = function (h) {
    o(h); const V = window._viol, w = G.world, A = w.arena, L = G.renderer.layout.arena, r = w.cfg.heroR, e = 0.01; V.steps++;
    if (A.x0 !== L.x0 || A.y0 !== L.y0 || A.x1 !== L.x1 || A.y1 !== L.y1) { V.arena++; if (V.ex.length < 5) V.ex.push({ A, L }); }
    const s = w.hero;
    if (s.x < A.x0 + r - e || s.x > A.x1 - r + e || s.y < A.y0 + r - e || s.y > A.y1 - r + e) { V.hero++; if (V.ex.length < 5) V.ex.push({ s: [s.x, s.y], A }); }
    for (const n of w.notes) {
      if (n.x < A.x0 || n.x > A.x1 || n.y < A.y0 || n.y > A.y1) { V.notes++; if (V.ex.length < 5) V.ex.push({ n: [n.x, n.y, n.state], A }); }
      for (const a of w.avoid) if (Math.hypot(n.x - a.x, n.y - a.y) < a.r) { if (n.state === 'loose') V.looseAvoid++; else { V.avoid++; if (V.ex.length < 5) V.ex.push({ under: [n.x, n.y, n.state], a }); } }
    }
    for (const t of w.trail) if (t.x < A.x0 - 1 || t.x > A.x1 + 1 || t.y < A.y0 - 1 || t.y > A.y1 + 1) V.trail++;
  };
});

async function testLayout() {
  for (const vp of VPS) {
    const page = await newPage({ viewport: { width: vp.w, height: vp.h }, dsf: vp.dsf, touch: vp.touch, mobile: vp.touch });
    await boot(page, 'seed=5');
    const tag = vp.tag;
    const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, bw: c.width, bh: c.height, vw: innerWidth, vh: innerHeight, VW: RP.Game.renderer.VW, VH: RP.Game.renderer.VH, touch: RP.Game.isTouch }; });
    check(`layout ${tag}: touch detection matches the device`, cv.touch === vp.touch, cv.touch);
    check(`layout ${tag}: canvas fills the window (inside the aspect clamps)`, near(cv.w, cv.vw, 2) && near(cv.h, cv.vh, 2), cv);
    const capPx = vp.touch ? 3.2e6 + 5000 : 1920 * 1080 + 5000;
    check(`layout ${tag}: backing store within the pixel cap`, cv.bw * cv.bh <= capPx, [cv.bw, cv.bh, cv.VW, cv.VH]);
    // menus
    const issues = [], scrolls = [];
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      await ev(page, s => RP.UI.show(s), scr); await page.waitForTimeout(350);
      const r = await layoutReport(page);
      if (r.bad.length) issues.push(scr + ': ' + r.bad.join(';'));
      if (r.overflow) scrolls.push(scr);
      if (vp.touch) await shot(page, `13_${vp.w}x${vp.h}_${scr}`);
    }
    await ev(page, () => RP.UI.show('scrTitle'));
    await ev(page, () => RP.debug.startGame()); await page.waitForTimeout(250);
    await freeze(page); await toPlaying(page);
    await ev(page, () => RP.Game.pause()); await page.waitForTimeout(300);
    let r = await layoutReport(page); if (r.bad.length) issues.push('scrPause: ' + r.bad.join(';')); if (r.overflow) scrolls.push('scrPause');
    await ev(page, () => RP.Game.resume()); await freeze(page);
    await ev(page, () => T.killToOver(4321, 1)); await page.waitForTimeout(400);
    r = await layoutReport(page); if (r.bad.length) issues.push('scrOver: ' + r.bad.join(';')); if (r.overflow) scrolls.push('scrOver');
    if (vp.touch) await shot(page, `13_${vp.w}x${vp.h}_scrOver`);
    check(`layout ${tag}: every menu panel + its main buttons fit inside the window`, issues.length === 0, issues.join(' | '));
    if (scrolls.length) info(`${tag}: panels that need scrolling: ${scrolls.join(', ')}`);
    // in play
    await ev(page, () => RP.Game.startGame()); await page.waitForTimeout(250);
    await freeze(page); await toPlaying(page);
    const ar = await ev(page, () => ({ L: RP.Game.renderer.layout.arena, A: RP.debug.world.arena, VW: RP.Game.renderer.VW, VH: RP.Game.renderer.VH }));
    check(`layout ${tag}: renderer arena == world.arena`, JSON.stringify(ar.L) === JSON.stringify(ar.A), ar);
    check(`layout ${tag}: arena inside the canvas, below the HUD band`, ar.A.x0 >= 0 && ar.A.y0 >= 64 && ar.A.x1 <= ar.VW && ar.A.y1 <= ar.VH && ar.A.x1 - ar.A.x0 > 300 && ar.A.y1 - ar.A.y0 > 250, ar);
    // HUD text vs HUD buttons (worst case: 5-digit score, 5 hearts, long song count)
    const hud = await ev(page, () => {
      const w = RP.debug.world; w.score = 88888; w.heartsMax = 5; w.hearts = 5; w.songTarget = 24; w.song = 23;
      const R = RP.Game.renderer, texts = T.hudTexts();
      const btns = ['btnPause', 'btnMuteHud'].map(id => T.logRect(id));
      const b = { x0: Math.min(...btns.map(r => r.x0)), y0: Math.min(...btns.map(r => r.y0)), x1: Math.max(...btns.map(r => r.x1)), y1: Math.max(...btns.map(r => r.y1)) };
      const I = R.ins, x0 = I.left + 16, y0 = I.top + 14, narrow = R.VW < 700, hs = narrow ? 24 : 28;
      const hearts = { x0, y0, x1: x0 + 5 * (hs + 3), y1: y0 + hs };
      const sc = texts.find(t => t.s === '88888'), song = texts.find(t => t.s === '23/24');
      const cx = sc ? (sc.x0 + sc.x1) / 2 : 0;
      const cssMin = Math.min(...['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect().width));
      return { sc, song, b, hearts, hudBtn: R._hudBtn, VW: R.VW, cssMin };
    });
    const ovs = [];
    if (!hud.sc || !hud.song) ovs.push('HUD texts not found');
    else {
      if (inter(hud.sc, hud.b)) ovs.push('score overlaps the pause/sound buttons');
      if (inter(hud.song, hud.b)) ovs.push('song count overlaps the buttons');
      if (inter(hud.sc, hud.song) || inter(hud.sc, hud.hearts)) ovs.push('score overlaps hearts / song bar');
    }
    check(`layout ${tag}: HUD score / song text never overlaps the pause & sound buttons or the hearts`, ovs.length === 0, ovs.length ? Object.assign({ ovs }, hud) : undefined);
    check(`layout ${tag}: HUD buttons inside the canvas and ≥ 44 css px`, hud.b.x0 >= 0 && hud.b.y0 >= 0 && hud.b.x1 <= hud.VW + 1 && hud.cssMin >= 44 - 0.5, { b: hud.b, css: hud.cssMin });
    await ev(page, () => { const w = RP.debug.world; w.score = 0; w.heartsMax = w.cfg.heartsMax; w.hearts = w.heartsMax; w.songTarget = w.levelInfo(w.level).songTarget; w.song = w.trail.length; });
    if (vp.touch) {
      const a = await ev(page, () => {
        const c = document.getElementById('game').getBoundingClientRect(), e = document.getElementById('btnAction'), r = e.getBoundingClientRect(), L = RP.Game.renderer.layout, av = L.avoid[0];
        const lr = T.logRect('btnAction'), corners = [[lr.x0, lr.y0], [lr.x1, lr.y0], [lr.x0, lr.y1], [lr.x1, lr.y1]];
        return { vis: !e.classList.contains('hidden') && r.width > 0, inScreen: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
          inCanvas: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, css: r.width,
          avoidCovers: !!av && corners.every(([x, y]) => Math.hypot(x - av.x, y - av.y) <= av.r), worldAvoid: RP.debug.world.avoid.length };
      });
      check(`layout ${tag}: Flip button visible, inside the screen/canvas, ≥ 66 css px`, a.vis && a.inScreen && a.inCanvas && a.css >= 66 - 0.5, a);
      check(`layout ${tag}: the no-spawn circle covers the whole Flip button and the world knows it`, a.avoidCovers && a.worldAvoid === 1, a);
      const spots = await ev(page, () => { const w = RP.debug.world, a = w.avoid[0], A = w.arena; let bad = 0, out = 0; const lr = T.logRect('btnAction');
        for (let i = 0; i < 3000; i++) { const p = w._findSpot(); if (p.x + 15 > lr.x0 && p.x - 15 < lr.x1 && p.y + 15 > lr.y0 && p.y - 15 < lr.y1) bad++; if (p.x < A.x0 || p.x > A.x1 || p.y < A.y0 || p.y > A.y1) out++; } return { bad, out }; });
      check(`layout ${tag}: 3000 note spawn spots, none under the Flip button or outside the arena`, spots.bad === 0 && spots.out === 0, spots);
    } else check(`layout ${tag}: Flip button hidden on non-touch`, !(await visible(page, '#btnAction')));
    // bot run: everything stays inside the arena
    await installWatch(page);
    await ev(page, () => { RP.debug.setBot(true, 1); RP.debug.setSpeed(6); });
    await page.waitForTimeout(3000);
    await shot(page, `14_${vp.w}x${vp.h}_${vp.dsf}_game`);
    let V = await ev(page, () => window._viol);
    check(`layout ${tag}: bot run — arena synced, Dottie/stars/parade always inside the arena`, V.steps > 100 && !V.arena && !V.hero && !V.notes && !V.trail, V);
    if (vp.touch) check(`layout ${tag}: bot run — no idle note ever under the Flip button`, V.avoid === 0, V);
    if (V.looseAvoid) info(`${tag}: loose (scattered) notes were under the Flip button on ${V.looseAvoid} steps`);
    // rotation / resize mid-game
    if (vp.touch) {
      await ev(page, () => { window._viol.ex = []; for (const k of ['arena', 'hero', 'notes', 'trail', 'avoid']) window._viol[k] = 0; });
      await ev(page, () => { const w = RP.debug.world; if (w.state === 'playing' && w.trail.length < 6) { w.hero.invuln = 3; T.addTrail(6); } RP.debug.goldNow(); });
      await page.waitForTimeout(1200);
      // a steering finger is down when the device rotates
      await ev(page, () => RP.debug.setBot(false));
      const fc = await ev(page, () => { const A = RP.debug.world.arena; return T.toClient(A.x0 + 120, A.y0 + 100); });
      await touch(page, 'touchStart', [{ x: fc.x, y: fc.y, id: 1 }]); await page.waitForTimeout(80);
      await page.setViewportSize({ width: vp.h, height: vp.w });
      await ev(page, () => window.dispatchEvent(new Event('orientationchange')));
      await page.waitForTimeout(600);
      const rot = await ev(page, () => { const G = RP.Game, w = G.world, A = w.arena, L = G.renderer.layout.arena, s = w.hero, r = w.cfg.heroR;
        const c = document.getElementById('game').getBoundingClientRect(), ab = document.getElementById('btnAction').getBoundingClientRect();
        return { same: JSON.stringify(A) === JSON.stringify(L), A, s: [s.x, s.y], sIn: s.x >= A.x0 + r - 0.01 && s.x <= A.x1 - r + 0.01 && s.y >= A.y0 + r - 0.01 && s.y <= A.y1 - r + 0.01,
          notesIn: w.notes.every(n => n.x >= A.x0 && n.x <= A.x1 && n.y >= A.y0 && n.y <= A.y1), trailIn: w.trail.every(t => t.x >= A.x0 - 1 && t.x <= A.x1 + 1 && t.y >= A.y0 - 1 && t.y <= A.y1 + 1),
          down: G.pointerDown, ptr: G.renderer.pointer,
          fill: Math.abs(c.width - innerWidth) < 2 && Math.abs(c.height - innerHeight) < 2, btnIn: ab.right <= innerWidth + 0.5 && ab.bottom <= innerHeight + 0.5 && ab.left >= 0,
          idleUnder: w.notes.filter(n => n.state !== 'loose' && w.avoid.some(a => Math.hypot(n.x - a.x, n.y - a.y) < a.r)).length }; });
      check(`layout ${tag}: rotation mid-game — arena re-synced, Dottie/stars/parade inside, canvas fills`, rot.same && rot.sIn && rot.notesIn && rot.trailIn && rot.fill, rot);
      check(`layout ${tag}: rotation releases the steering finger`, !rot.down && !rot.ptr, rot);
      check(`layout ${tag}: rotation — Flip button re-anchored on screen, no idle note under it`, rot.btnIn && rot.idleUnder === 0, rot);
      await touch(page, 'touchEnd', []); await page.waitForTimeout(60);
      await ev(page, () => { RP.debug.setBot(true, 1); RP.debug.setSpeed(6); });
      await page.waitForTimeout(2000);
      V = await ev(page, () => window._viol);
      check(`layout ${tag}: after rotation the bot run stays inside the new arena`, !V.arena && !V.hero && !V.notes && !V.trail && !V.avoid, V);
      await shot(page, `15_${vp.w}x${vp.h}_rotated`);
    } else {
      await page.setViewportSize({ width: Math.round(vp.w * 0.7), height: vp.h }); await page.waitForTimeout(500);
      const rz = await ev(page, () => { const G = RP.Game, A = G.world.arena, L = G.renderer.layout.arena, s = G.world.hero; return { same: JSON.stringify(A) === JSON.stringify(L), sIn: s.x >= A.x0 && s.x <= A.x1 && s.y >= A.y0 && s.y <= A.y1 }; });
      check(`layout ${tag}: live window resize keeps the arena synced and Dottie inside`, rz.same && rz.sIn, rz);
    }
    check(`layout ${tag}: no page scroll`, await ev(page, () => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
    errorsOk(page, `layout ${tag}`);
    await close(page);
  }
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => T.countStarts());
  await page.click('#btnHow'); await page.click('#scrHow .btn-back'); await page.waitForTimeout(120);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on the title starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page); await isolate(page);
  let f0 = await flips(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: next Space in play is a Flip, not a menu button', (await mode(page)) === 'playing' && (await flips(page)) === f0 + 1 && (await starts(page)) === 1);
  await ev(page, () => RP.Game.toTitle()); await page.waitForTimeout(150);
  await ev(page, () => T.countStarts());
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('focus: Enter on the title (Play focused) starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page); await isolate(page);
  f0 = await flips(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter right after start = Flip only (no re-click of Play)', (await flips(page)) === f0 + 1 && (await starts(page)) === 1);
  // Settings: what is focused, and does Enter/Space there do something destructive?
  await ev(page, () => RP.Game.toTitle()); await page.waitForTimeout(100);
  await ev(page, () => { RP.Storage.set('best_normal', '55'); RP.Storage.set('best_easy', '66'); });
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  const foc = await ev(page, () => document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim()));
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const afterEnter = await ev(page, () => ({ n: RP.Storage.get('best_normal'), e: RP.Storage.get('best_easy'), ui: RP.UI.current }));
  check('focus: opening Settings does not focus "Reset best" (Enter must not wipe best scores)', afterEnter.n === '55' && afterEnter.e === '66', { focused: foc, afterEnter });
  await ev(page, () => { RP.UI.show('scrTitle'); });
  await page.waitForTimeout(100);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=normal]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(100);
  await ev(page, () => T.countStarts());
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: after Settings, Space on the title starts once', (await starts(page)) === 1);
  // Pause: Space / Enter on a focused Resume resumes once, no Flip
  await freeze(page); await toPlaying(page); await isolate(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  f0 = await flips(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: Space on Pause resumes and does not Flip', (await mode(page)) === 'playing' && (await flips(page)) === f0, { mode: await mode(page), d: (await flips(page)) - f0 });
  const pb = await ev(page, () => T.rectOf('btnPause'));
  await page.mouse.click(pb.cx, pb.cy); await page.waitForTimeout(150);
  f0 = await flips(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on Pause resumes once without Flip', (await mode(page)) === 'playing' && (await flips(page)) === f0, { mode: await mode(page), d: (await flips(page)) - f0 });
  // Game over: focused Play Again + Enter after the lock = exactly one start
  await freeze(page);
  await ev(page, () => T.killToOver(20));
  await page.waitForTimeout(800);
  const fo = await ev(page, () => document.activeElement && document.activeElement.id);
  await ev(page, () => T.countStarts());
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('focus: Game Over (Play Again focused) + Enter = exactly one start', (await starts(page)) === 1 && (await mode(page)) === 'playing', { focused: fo, starts: await starts(page) });
  errorsOk(page, 'focus');
  await close(page);
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'bot=1&speed=16&autorestart=1&autostart=1&seed=3');
  const samples = []; let maxFx = 0, maxP = 0, maxNotes = 0, maxTexts = 0, maxTrail = 0, overSeen = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await page.waitForTimeout(1000);
    const s = await ev(page, () => Object.assign(RP.debug.getState() || {}, { texts: RP.Game.renderer.texts.length, games: RP.debug.stats.games }));
    samples.push(s);
    if (s.mode === 'over') overSeen++;
    maxFx = Math.max(maxFx, s.fx); maxP = Math.max(maxP, s.particles); maxNotes = Math.max(maxNotes, s.notes); maxTexts = Math.max(maxTexts, s.texts); maxTrail = Math.max(maxTrail, s.trail);
  }
  const st = await ev(page, () => RP.debug.stats);
  const songMax = await ev(page, () => RP.debug.world.cfg.songMax);
  info(`long run ${LONG_RUN_S}s @16x: games ${st.games}, scores ${JSON.stringify(st.scores.slice(0, 10))}, levels ${JSON.stringify(st.levels.slice(0, 10))}, maxFx ${maxFx}, maxParticles ${maxP}, maxNotes ${maxNotes}, maxTexts ${maxTexts}, maxTrail ${maxTrail}, last time ${samples.length ? samples[samples.length - 1].time.toFixed(0) : '-'}s`);
  check('long run: no runtime errors (stats.errors)', st.errors.length === 0, st.errors.slice(0, 2));
  check('long run: world time advanced ≈ 16× real time', samples.length > 3 && samples.some(s => s.time > 40), samples.slice(-1)[0] && samples.slice(-1)[0].time);
  check('long run: weather particles bounded (< 160)', maxP < 160, maxP);
  check('long run: fx bounded (≤ 400)', maxFx <= 400, maxFx);
  check('long run: stars / texts / parade bounded', maxNotes < 40 && maxTexts < 40 && maxTrail <= songMax, { maxNotes, maxTexts, maxTrail });
  if (st.games >= 1) check('long run: auto-restart works (never stuck on Game Over)', overSeen <= 1 && (await mode(page)) !== 'over', { games: st.games, overSeen });
  else {
    info('long run: the bot never lost a game in this run → forcing a death to exercise auto-restart');
    await ev(page, () => RP.debug.world._die());
    await page.waitForTimeout(1500);
    const ar = await ev(page, () => ({ games: RP.debug.stats.games, mode: RP.debug.mode, level: RP.debug.world.level, score: RP.debug.world.score, time: RP.debug.world.time }));
    check('long run: forced death at 16x → game over recorded and a new game auto-starts', ar.games === 1 && ar.mode === 'playing' && ar.time < 30, ar);
  }
  check('long run: the bot clears biomes (song completion works under 16x)', st.levels.some(l => l > 0) || samples.some(s => s.level > 0), { levels: st.levels, lastLevel: samples.slice(-1)[0] && samples.slice(-1)[0].level });
  await shot(page, '16_long_run');
  errorsOk(page, 'long run');
  await close(page);
}

/* =============================== MAIN =============================== */
const TESTS = { boot: testBootAndScreens, keyboard: testKeyboard, mouse: testMouse, touch: testTouch, ghost: testGhostClicks, scoring: testScoring,
  pause: testPauseAndOver, settings: testSettings, custom: testCustomPictures, layout: testLayout, focus: testFocus, long: testLongRun };

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, fn] of Object.entries(TESTS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log('\n== ' + name + ' ==');
    try { await fn(); } catch (e) { check(name + ': test crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  }
  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length} passed, ${fail.length} failed`);
  if (fail.length) { console.log('FAILED:'); for (const f of fail) console.log('  - ' + f.name); }
  process.exit(fail.length ? 1 : 0);
})();
