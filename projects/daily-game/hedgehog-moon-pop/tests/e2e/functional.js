// Bristle's Moon Pop — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to a local static HTTP server on the game/ folder (started by this script)
//   --quick shortens the long bot run (15 s instead of 60 s)
// Prints PASS/FAIL per check, screenshots in tests/out/functional/, exits 1 on any FAIL.
// Rule: tuning numbers are read from the live config (MP.debug.world.cfg / MP.DIFFICULTY), never hard-coded.
// World contract: docs/DESIGN.md §5.1 (w.hog, items cupcake/magnet/pebble, box/boxTarget, magnet, vents, events).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LONG_RUN_S = QUICK ? 15 : 62;
const OUT = path.join(__dirname, '..', 'out', 'functional');
const ROOT = path.resolve(__dirname, '../../game');
fs.mkdirSync(OUT, { recursive: true });
let BASE = args.find(a => !a.startsWith('--')) || null;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''));
}
function info(msg) { console.log('     ' + msg); }
const url = (q, mute = true) => BASE + '?' + [mute ? 'mute=1' : '', q || ''].filter(Boolean).join('&');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* tiny static server (same origin for every test: localStorage persists inside one context) */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
      fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

let browser;
async function newPage(opts = {}, ctxIn) {
  const ctx = ctxIn || await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dsf || 1,
    hasTouch: !!opts.touch, isMobile: !!opts.mobile
  });
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console.error: ' + m.text()); });
  page._ctx = ctx;
  return page;
}
async function boot(page, q, mute = true) {
  await page.goto(url(q, mute));
  await page.waitForFunction(() => window.MP && MP.debug && MP.debug.mode && MP.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const reboot = async page => { await page.reload(); await page.waitForFunction(() => window.MP && MP.debug && MP.debug.mode === 'title', null, { timeout: 15000 }); await page.waitForTimeout(100); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => MP.debug.mode);
const ui = page => ev(page, () => MP.UI.current);
const st = page => ev(page, () => MP.debug.getState());
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}
const center = (page, sel) => ev(page, s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const errorsOk = (page, label) => check(label + ': no console errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));
const close = page => page._ctx.close();

/* Freeze sim time (speed 0); advance deterministically with simStep(). Real rAF frames still run applyMove + draw. */
const freeze = page => ev(page, () => MP.debug.setSpeed(0));
const simStep = (page, sec) => ev(page, sec => { const G = MP.Game; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) G.step(1 / 60); G.renderer.update(sec); }, sec);
const toPlaying = page => ev(page, () => { const G = MP.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; return i / 60; });

/* Stop bubble / pebble / magnet schedulers, clear items, park Bristle on the floor at x, ready to jump. */
const isolate = (page, x) => ev(page, x => {
  const w = MP.debug.world, c = w.cfg; w.items.length = 0; w._nextSpawn = 1e9; w._nextPebble = 1e9; w._magnetAt = 1e9;
  w.magnet.t = 0; w.chain = 0;
  const s = w.hog; s.x = s._px = x; s.vx = 0; s.vy = 0; s.air = false; s.y = s._py = c.hogRestY; s.lift = 0; s.invuln = 0; s.bonkT = 0; s.curl = 0;
  s.board.x = s.board._px = x; w._landT = 1; w._jumpBuf = 0; w._coyote = 0;
  w.setTarget(null); w.setMove(0); const G = MP.Game; G.keys = {}; G.renderer.pointer = null; G.pointerDown = false; G._mouseFollow = false; G._steerId = null; if (G._touches) G._touches.clear();
}, x);
/* A still bubble (no buoyancy) of kind 'cupcake' | 'magnet' at (x, y), already full size. rise = terminal rise px/s. */
const bubble = (page, kind, x, y, rise = 0, vy = 0) => ev(page, ({ kind, x, y, rise, vy }) => {
  const w = MP.debug.world, c = w.cfg;
  const it = { id: w._nextId++, kind, color: 0, x, y, vx: 0, vy, r: c.bubbleR, wob: 0, squish: 0, rot: 0, spin: 0, vent: -1, state: 'rise', t: 1, alpha: 1,
    _px: x, _py: y, _R: c.bubbleR, _sw: 0, _evx: 0, _puff: c.puffTime, _k: c.bubbleDrag, _vR: rise };
  w.items.push(it); return it.id;
}, { kind, x, y, rise, vy });
/* A pebble falling straight down at x from y. */
const pebble = (page, x, y, vy = 190) => ev(page, ({ x, y, vy }) => {
  const w = MP.debug.world, it = w._newPebble(x);
  it._A = 0; it._bx = it.x = it._px = x; it.y = it._py = y; it.vy = vy; w._predictLand(it); w.items.push(it); return it.id;
}, { x, y, vy });
const hog = page => ev(page, () => { const s = MP.debug.world.hog; return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, air: s.air, frame: s.frame, lift: s.lift }; });
const jumps = page => ev(page, () => MP.debug.world.jumps);
/* scene (logical) → client px through the renderer (works for every mobile layout: SX/SY offsets) */
const toClient = (page, x, y) => ev(page, ({ x, y }) => { const R = MP.Game.renderer, r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + (x + R.SX) / R.VW * r.width, y: r.top + (y + R.SY) / R.VH * r.height }; }, { x, y });

/* Log every event the world emits (wraps handleEvents). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = MP.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);
const clearLog = page => ev(page, () => { if (window._evLog) window._evLog.length = 0; });
const countStarts = page => ev(page, () => { window._starts = 0; if (!MP.Game._wrapped) { const o = MP.Game.startGame.bind(MP.Game); MP.Game.startGame = function () { window._starts++; return o(); }; MP.Game._wrapped = true; } });
const starts = page => ev(page, () => window._starts);

/* Lose the last heart (pebble onto Bristle) and step until the game-over panel (sim time). */
const killToOver = (page, score) => ev(page, score => {
  const G = MP.Game, w = G.world; let i = 0;
  while (w.state !== 'playing' && i++ < 3000) G.step(1 / 60);
  if (score != null) w.score = score;
  w.items.length = 0; w._nextSpawn = 1e9; w._nextPebble = 1e9;
  w.hearts = 1; w.hog.invuln = 0;
  const it = w._newPebble(w.hog.x); it._A = 0; it._bx = it.x = it._px = w.hog.x; it.y = it._py = w.hog.y - 50; it.vy = 190; w.items.push(it);
  i = 0; while (G.mode === 'playing' && i++ < 600) G.step(1 / 60);
  return G.mode;
}, score);
const toastText = page => ev(page, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });

/* Create an image file inside the page: canvas → Blob → bytes. */
async function makeImage(page, w, h, kind, fmt = 'image/png') {
  const arr = await ev(page, async ({ w, h, kind, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (kind === 'photo') { g.fillStyle = '#0000ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2020c0'; g.fillRect(w * .3, h * .3, w * .4, h * .4); }
    else if (kind === 'photoRed') { g.fillStyle = '#ff0000'; g.fillRect(0, 0, w, h); }
    else if (kind === 'big' || kind === 'bg') { g.fillStyle = '#5a3a8a'; g.fillRect(0, 0, w, h); }
    else {                                                   // transparent cut-out: cyan / magenta ellipse
      const col = { cupcake: '#00ffff', pebble: '#ff00ff' }[kind] || '#ff00ff';
      g.clearRect(0, 0, w, h);
      g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.92));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }, { w, h, kind, fmt });
  return Buffer.from(arr, 'base64');
}
/* Real UI path: "Choose…" on a slot → the hidden #filePick gets the file via setInputFiles. */
async function pickFile(page, slotId, file) {
  const idx = await ev(page, id => MP.Assets.SLOTS.findIndex(s => s.id === id), slotId);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const storedSize = (page, key) => ev(page, k => new Promise(res => { const d = MP.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight, d.length]); i.onerror = () => res(null); i.src = d; }), key);
async function waitToast(page, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await toastText(page); if (re.test(t)) return t; await page.waitForTimeout(100); }
  return await toastText(page);
}

/* Buttons of the current screen inside the viewport and inside the (non-scrolled) panel. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = MP.UI.current && document.getElementById(MP.UI.current);
    if (!scr) return { bad: ['no screen'], hidden: [] };
    const btns = [...scr.querySelectorAll('button, .set, .slot')].filter(b => b.offsetParent !== null && !b.closest('.hidden'));
    const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
    const pr = panel ? panel.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };
    if (pr.top < -0.5 || pr.bottom > vh + 0.5 || pr.left < -0.5 || pr.right > vw + 0.5) bad.push('panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(','));
    const hidden = [];
    for (const b of btns) {
      const r = b.getBoundingClientRect(), n = b.id || (b.className + ':' + b.textContent.trim().slice(0, 14));
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) bad.push(n + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      else if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) hidden.push(n);
    }
    const wide = panel ? panel.scrollWidth > panel.clientWidth + 1 : false;
    // the main (back / Done / OK / Resume / Play Again) button must be reachable without scrolling: a child won't scroll
    const main = scr.querySelector('.btn-back, .btn-big');
    let mainOk = true;
    if (main) { const r = main.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = document.elementFromPoint(cx, cy); mainOk = !!hit && main.contains(hit); }
    return { bad, hidden, wide, mainOk, scrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : false };
  });
}
/* Count canvas pixels in a SCENE rect matching a colour predicate (source string over r,g,b). */
const probe = (page, x, y, w, h, pred) => ev(page, ({ x, y, w, h, pred }) => {
  const R = MP.Game.renderer, c = document.getElementById('game'), g = c.getContext('2d'), k = c.width / R.VW;
  const X = Math.max(0, Math.round((x + R.SX) * k)), Y = Math.max(0, Math.round((y + R.SY) * k)), W = Math.round(w * k), H = Math.round(h * k);
  const d = g.getImageData(X, Y, W, H).data, f = new Function('r', 'g', 'b', 'return ' + pred);
  let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
  return n;
}, { x, y, w, h, pred });
async function startFrozen(page) {
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  return ev(page, () => MP.debug.world.cfg);
}
/* CDP touch helpers (Playwright's touchscreen only taps). points: [{x,y,id}] in client px. */
async function touch(page, type, points) {
  if (!page._cdp) page._cdp = await page._ctx.newCDPSession(page);
  await page._cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) });
}

/* =============================== TESTS =============================== */

async function testBootAndScreens() {
  const page = await newPage();
  await boot(page, 'seed=42');
  check('boot: reaches title mode with zero console errors', (await mode(page)) === 'title' && page._errors.length === 0, page._errors.slice(0, 3));
  for (const [id, label] of [['btnPlay', 'Play'], ['btnCustomize', 'Change Pictures'], ['btnHow', 'How to Play'], ['btnSettings', 'Settings']]) {
    const txt = await ev(page, id => document.getElementById(id).textContent, id);
    check(`title: "${label}" button visible`, (await visible(page, '#' + id)) && txt.includes(label), txt.trim());
  }
  check('title: Quit hidden in browser mode', !(await visible(page, '#btnQuit')));
  check('title: HUD + jump button hidden on title', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  check('title: best score line shown', /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: MP.debug.world.time, x: MP.debug.world.hog.x }));
  await page.waitForTimeout(2500);
  const t1 = await ev(page, () => ({ t: MP.debug.world.time, x: MP.debug.world.hog.x, p: MP.debug.weather.particles.length }));
  check('title: demo (bot Bristle + weather) animates behind the menu', t1.t > t0.t + 1 && t1.p > 2, { t0, t1 });
  await shot(page, '01_title');
  for (const [btn, scr, n] of [['#btnHow', 'scrHow', '02_how'], ['#btnSettings', 'scrSettings', '03_settings'], ['#btnCustomize', 'scrCustom', '04_custom']]) {
    await page.click(btn); await page.waitForTimeout(300);
    check(`menu: ${btn} opens ${scr}`, (await ui(page)) === scr);
    await shot(page, n);
    await page.click(`#${scr} .btn-back`); await page.waitForTimeout(150);
    check(`menu: ${scr} back button returns to title`, (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title');
    await page.click(btn); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(`menu: Esc closes ${scr} back to title`, (await ui(page)) === 'scrTitle');
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('menu: Esc on title does nothing harmful', (await ui(page)) === 'scrTitle' && (await mode(page)) === 'title');
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  check('play: Play starts a game (mode playing, HUD visible, no menu)', (await mode(page)) === 'playing' && (await visible(page, '#btnPause')) && (await ui(page)) === null);
  check('play: jump button hidden on a non-touch device', !(await visible(page, '#btnAction')));
  check('play: focus left the menu button (no stray focus)', await ev(page, () => !document.activeElement || document.activeElement === document.body));
  const s = await st(page);
  check('play: new run = dawn, level 0, score 0, full hearts, empty box', s.zone === 0 && s.level === 0 && s.score === 0 && s.hearts === s.heartsMax && s.box === 0 && s.boxTarget > 0, s);
  await page.waitForTimeout(1800);
  const s2 = await st(page);
  check('play: world reaches "playing" after the intro and vents exist', s2.state === 'playing' && s2.vents.length >= 3, { state: s2.state, vents: s2.vents });
  await shot(page, '05_banner');
  errorsOk(page, 'boot+screens');
  await close(page);
}

async function testKeyboard() {
  const page = await newPage();
  await boot(page, 'seed=5');
  const cfg = await startFrozen(page);
  for (const [key, dir] of [['ArrowRight', 1], ['ArrowLeft', -1], ['KeyD', 1], ['KeyA', -1]]) {
    await isolate(page, 480);
    await page.keyboard.down(key); await page.waitForTimeout(50);
    await simStep(page, 0.5);
    const p = await hog(page);
    await page.keyboard.up(key); await page.waitForTimeout(50);
    check(`keys: ${key} skates Bristle ${dir > 0 ? 'right' : 'left'} at ≤ maxSpeed`, (p.x - 480) * dir > 100 && Math.abs(p.vx) <= cfg.maxSpeed + 1, { x: Math.round(p.x), vx: Math.round(p.vx) });
    const x1 = p.x;
    await simStep(page, 0.5);
    const q = await hog(page);
    check(`keys: Bristle coasts a little then stops after releasing ${key}`, Math.abs(q.vx) < 1 && (q.x - x1) * dir > 5 && (q.x - x1) * dir < 120, { glide: Math.round(q.x - x1), vx: q.vx });
  }
  await isolate(page, 480);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(30);
  await simStep(page, 4);
  const L = await hog(page);
  await page.keyboard.up('ArrowLeft');
  check('keys: Bristle clamped at xMin', near(L.x, cfg.xMin, 0.5), L.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(30);
  await simStep(page, 5);
  const R = await hog(page);
  await page.keyboard.up('ArrowRight');
  check('keys: Bristle clamped at xMax', near(R.x, cfg.xMax, 0.5), R.x);
  check('keys: getState reports hog x', near((await st(page)).hog.x, R.x, 1));
  errorsOk(page, 'keyboard');
  await close(page);
}

async function testJump() {
  const page = await newPage();
  await boot(page, 'seed=5');
  const cfg = await startFrozen(page);
  const land = () => ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while ((w.hog.air || w._landT < w.cfg.landLag + 0.02) && i++ < 600) G.step(1 / 60); });
  for (const k of ['Space', 'ArrowUp', 'KeyW', 'Enter', 'ShiftLeft']) {
    await isolate(page, 480);
    const j0 = await jumps(page);
    await page.keyboard.press(k); await page.waitForTimeout(50);
    const s = await st(page);
    check(`jump: ${k} jumps (getState hog.air)`, (await jumps(page)) === j0 + 1 && s.hog.air, { jumps: (await jumps(page)) - j0, air: s.hog.air });
    await land();
  }
  // arc: apex ≈ 200 px, air time ≈ 1.4 s, land event
  await isolate(page, 480); await hookEvents(page); await clearLog(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(30);
  const arc = await ev(page, () => { const G = MP.Game, w = G.world; let apex = 0, t = 0; for (let i = 0; i < 240; i++) { G.step(1 / 120); apex = Math.max(apex, w.hog.lift); if (w.hog.air) t += 1 / 120; } return { apex, t, air: w.hog.air }; });
  const H = cfg.jumpV * cfg.jumpV / (2 * cfg.gravity), T = 2 * cfg.jumpV / cfg.gravity;
  check(`jump: apex ≈ ${Math.round(H)} px (±10 %)`, near(arc.apex, H, H * 0.1), arc);
  check(`jump: air time ≈ ${T.toFixed(2)} s (±0.1)`, !arc.air && near(arc.t, T, 0.1), arc);
  check('jump: jump + land events', (await evLog(page, 'jump')).length === 1 && (await evLog(page, 'land')).length === 1);
  // no double jump: Space in mid-air (well before landing) does nothing
  await land(); await isolate(page, 480);
  let j0 = await jumps(page);
  await page.keyboard.press('Space'); await simStep(page, 0.4);
  await page.keyboard.press('Space'); await page.keyboard.press('KeyW'); await page.waitForTimeout(40);
  await land();
  check('jump: pressing again in mid-air never double-jumps', (await jumps(page)) === j0 + 1, (await jumps(page)) - j0);
  // buffered: a press just before landing jumps right after the touch-down
  await isolate(page, 480);
  j0 = await jumps(page);
  await page.keyboard.press('Space');
  await simStep(page, T - 0.06);
  await page.keyboard.press('Space'); await page.waitForTimeout(30);
  await simStep(page, 0.3);
  check('jump: a press ≤ jumpBuffer before landing is buffered into the next jump', (await jumps(page)) === j0 + 2, (await jumps(page)) - j0);
  await land();
  // held Space = one jump (auto-repeat ignored)
  await isolate(page, 480);
  j0 = await jumps(page);
  await page.keyboard.down('Space'); await page.waitForTimeout(500); await simStep(page, T + 0.4); await page.keyboard.up('Space');
  check('jump: holding Space jumps once (key repeat ignored)', (await jumps(page)) === j0 + 1, (await jumps(page)) - j0);
  await land();
  // right-click jumps
  await isolate(page, 480);
  j0 = await jumps(page);
  const m = await toClient(page, 480, 300);
  await page.mouse.click(m.x, m.y, { button: 'right' }); await page.waitForTimeout(60);
  check('jump: right-click jumps', (await jumps(page)) === j0 + 1);
  await land();
  // a left click (quick, still) is a tap-jump; a long press is not
  await isolate(page, 480);
  j0 = await jumps(page);
  await page.mouse.move(m.x, m.y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(40);
  check('jump: a quick left click on the playfield jumps', (await jumps(page)) === j0 + 1);
  await land(); await isolate(page, 480);
  j0 = await jumps(page);
  await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(40);
  check('jump: a long left press (> 0.2 s) does not jump', (await jumps(page)) === j0);
  // the player can still jump while paused? no
  await isolate(page, 480);
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  j0 = await jumps(page);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('KeyW'); await page.waitForTimeout(80);
  check('jump: ↑ / W while paused do not jump', (await jumps(page)) === j0 && (await mode(page)) === 'paused', { j: (await jumps(page)) - j0, mode: await mode(page), ui: await ui(page), focus: await ev(page, () => document.activeElement && document.activeElement.id) });
  errorsOk(page, 'jump');
  await close(page);
}

async function testPointer() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await startFrozen(page);
  await isolate(page, 480);
  const a = await toClient(page, 200, 300);
  await page.mouse.move(a.x + 20, a.y); await page.mouse.move(a.x, a.y, { steps: 4 }); await page.waitForTimeout(80);
  await simStep(page, 2);
  let p = await hog(page);
  check('mouse: moving the mouse makes Bristle skate to the cursor x', near(p.x, 200, 5), Math.round(p.x));
  const b = await toClient(page, 760, 120);
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.waitForTimeout(80);
  await simStep(page, 2);
  p = await hog(page);
  check('mouse: follows x only (cursor y irrelevant, Bristle stays on the floor)', near(p.x, 760, 5) && !p.air, { x: Math.round(p.x), air: p.air });
  await isolate(page, 200);
  const c = await toClient(page, 700, 400);
  await page.mouse.move(c.x - 5, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.waitForTimeout(80);
  const maxX = await ev(page, () => { const G = MP.Game; let m = 0; for (let i = 0; i < 180; i++) { G.step(1 / 60); m = Math.max(m, G.world.hog.x); } return m; });
  check('mouse: pointer-follow overshoot < 6 px', maxX - 700 < 6, Math.round(maxX - 700));
  // hovering the HUD must not drag Bristle to the corner
  await isolate(page, 300);
  const pb = await center(page, '#btnPause');
  await page.mouse.move(pb.x, pb.y, { steps: 3 }); await page.waitForTimeout(80);
  await ev(page, () => { MP.Game.renderer.pointer = null; });
  await page.mouse.move(pb.x + 1, pb.y + 1); await page.waitForTimeout(60);
  await simStep(page, 1.5);
  p = await hog(page);
  check('mouse: hovering the HUD pause button does not drag Bristle to the corner', Math.abs(p.x - 300) < 30, Math.round(p.x));
  // HUD click pauses and never moves / jumps
  await isolate(page, 300);
  let j0 = await jumps(page);
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  check('mouse: click HUD pause → paused', (await mode(page)) === 'paused');
  const px = (await hog(page)).x;
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('mouse: Esc resumes from pause', (await mode(page)) === 'playing');
  check('mouse: the HUD click did not move or jump Bristle', near(px, 300, 1) && (await jumps(page)) === j0, { px, jumps: (await jumps(page)) - j0 });
  // mute HUD button
  await isolate(page, 300);
  const mb = await center(page, '#btnMuteHud');
  const mu0 = await ev(page, () => MP.Game.isMuted());
  j0 = await jumps(page);
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  const mu1 = await ev(page, () => MP.Game.isMuted());
  check('mouse: HUD mute button toggles sound, keeps playing, no jump', mu1 === !mu0 && (await mode(page)) === 'playing' && (await jumps(page)) === j0);
  // focus bug: after clicking the HUD mute button, Space must jump, not click mute again
  await isolate(page, 300);
  j0 = await jumps(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  const mu2 = await ev(page, () => MP.Game.isMuted());
  check('focus: Space after a HUD mute click jumps and does not toggle mute again', (await jumps(page)) === j0 + 1 && mu2 === mu1, { jumps: (await jumps(page)) - j0, mu1, mu2 });
  await ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while (w.hog.air && i++ < 600) G.step(1 / 60); });
  await isolate(page, 300);
  j0 = await jumps(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  check('focus: Enter after a HUD click jumps and does not re-click the HUD button', (await jumps(page)) === j0 + 1 && (await ev(page, () => MP.Game.isMuted())) === mu1 && (await mode(page)) === 'playing');
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  // right-click on the HUD pause button: no jump, no pause
  await ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while (w.hog.air && i++ < 600) G.step(1 / 60); });
  await isolate(page, 480);
  j0 = await jumps(page);
  await page.mouse.click(pb.x, pb.y, { button: 'right' }); await page.waitForTimeout(100);
  check('mouse: right-click on the HUD does not jump or pause', (await jumps(page)) === j0 && (await mode(page)) === 'playing');
  // keys override mouse-follow; after release a still cursor does not pull him back
  await isolate(page, 480);
  const k = await toClient(page, 800, 300);
  await page.mouse.move(k.x - 5, k.y); await page.mouse.move(k.x, k.y, { steps: 3 }); await page.waitForTimeout(60);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(40); await simStep(page, 0.6); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(40);
  await simStep(page, 1.0);
  p = await hog(page);
  check('mouse: keys override mouse-follow; Bristle does not snap back to a still cursor', p.x < 470, Math.round(p.x));
  // cursor leaving the window: stays inside his range, no NaN
  await isolate(page, 480);
  await page.mouse.move(k.x - 10, k.y); await page.mouse.move(-50, k.y); await page.waitForTimeout(60);
  await simStep(page, 2);
  const s = await hog(page), cfg = await ev(page, () => MP.debug.world.cfg);
  check('mouse: cursor leaving the window keeps Bristle inside his range (no NaN)', isFinite(s.x) && s.x >= cfg.xMin - 0.5 && s.x <= cfg.xMax + 0.5, Math.round(s.x));
  errorsOk(page, 'pointer');
  await close(page);
}

async function testTouch() {
  const page = await newPage({ viewport: { width: 1024, height: 768 }, dsf: 2, touch: true, mobile: true });
  await boot(page, 'seed=5');
  check('touch: isTouch detected', await ev(page, () => MP.Game.isTouch));
  const cfg = await startFrozen(page);
  check('touch: jump button visible during play', await visible(page, '#btnAction'));
  const land = () => ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while ((w.hog.air || w._landT < w.cfg.landLag + 0.02) && i++ < 600) G.step(1 / 60); });
  await isolate(page, 480);
  const a = await toClient(page, 220, 330);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]); await page.waitForTimeout(260);   // a hold, not a tap
  await simStep(page, 1.5);
  let p = await hog(page);
  check('touch: holding a finger makes Bristle skate to it', near(p.x, 220, 5), Math.round(p.x));
  const b = await toClient(page, 650, 330);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(80);
  await simStep(page, 1.5);
  p = await hog(page);
  check('touch: dragging the finger keeps following', near(p.x, 650, 5), Math.round(p.x));
  // second finger = jump
  let j0 = await jumps(page);
  const s = await toClient(page, 300, 200);
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 1 }, { x: s.x, y: s.y, id: 2 }]); await page.waitForTimeout(80);
  check('touch: second finger jumps', (await jumps(page)) === j0 + 1);
  const s2 = await toClient(page, 310, 205);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }, { x: s2.x, y: s2.y, id: 2 }]); await page.waitForTimeout(80);
  await simStep(page, 1.0);
  p = await hog(page);
  check('touch: moving the 2nd (jump) finger does not steer Bristle away from finger 1', near(p.x, 650, 10), Math.round(p.x));
  await touch(page, 'touchEnd', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.5);
  check('touch: lifting all fingers stops following', await ev(page, () => MP.Game.pointerDown === false && MP.debug.world._target === null));
  check('touch: the long hold + release did not jump', (await jumps(page)) === j0 + 1, (await jumps(page)) - j0);
  await land();
  // quick tap = jump
  await isolate(page, 480);
  j0 = await jumps(page);
  const q = await toClient(page, 480, 300);
  await touch(page, 'touchStart', [{ x: q.x, y: q.y, id: 5 }]); await page.waitForTimeout(50); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  check('touch: a quick tap on the play area jumps', (await jumps(page)) === j0 + 1, (await jumps(page)) - j0);
  await land();
  // a tap that slides > 12 px is a steer, not a jump
  await isolate(page, 480);
  j0 = await jumps(page);
  await touch(page, 'touchStart', [{ x: q.x, y: q.y, id: 6 }]); await touch(page, 'touchMove', [{ x: q.x + 40, y: q.y, id: 6 }]); await page.waitForTimeout(40); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  check('touch: a quick swipe (> 12 px) does not jump', (await jumps(page)) === j0);
  // jump button: a jump, never moves Bristle sideways; ignored while airborne
  await isolate(page, 400);
  const ab = await center(page, '#btnAction');
  j0 = await jumps(page);
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 3 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  check('touch: jump button jumps', (await jumps(page)) === j0 + 1);
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 4 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  check('touch: jump button in mid-air does not double-jump', (await jumps(page)) === j0 + 1);
  await simStep(page, 0.3);
  check('touch: jump-button taps did not move Bristle sideways', near((await hog(page)).x, 400, 2), (await hog(page)).x);
  await land();
  // a finger on the jump button is never the steering finger: the next finger steers
  await isolate(page, 480);
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 7 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', []); await land(); await isolate(page, 480);
  j0 = await jumps(page);
  const f = await toClient(page, 250, 330);
  await touch(page, 'touchStart', [{ x: f.x, y: f.y, id: 8 }]); await page.waitForTimeout(260);
  await simStep(page, 1.5);
  const stt = { j: (await jumps(page)) - j0, x: Math.round((await hog(page)).x) };
  await touch(page, 'touchEnd', []);
  check('touch: after a jump-button tap, one finger steers (not taken as a second finger)', stt.j === 0 && Math.abs(stt.x - 250) < 12, stt);
  // HUD pause by touch: pauses, never steers or jumps
  await isolate(page, 400);
  j0 = await jumps(page);
  const pb = await center(page, '#btnPause');
  await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(200);
  check('touch: tapping HUD pause pauses', (await mode(page)) === 'paused');
  const ph = await ev(page, () => ({ x: MP.debug.world.hog.x, jumps: MP.debug.world.jumps, down: MP.Game.pointerDown }));
  check('touch: HUD tap did not move Bristle / jump', near(ph.x, 400, 1) && ph.jumps === j0 && !ph.down, ph);
  // tapping the dimmed pause screen background does nothing in the game
  const bg = await toClient(page, 300, 300);
  await page.touchscreen.tap(bg.x, bg.y); await page.waitForTimeout(120);
  check('touch: a tap on the pause screen background does not jump or resume', (await mode(page)) === 'paused' && (await jumps(page)) === j0);
  const rb = await center(page, '#btnResume');
  await page.touchscreen.tap(rb.x, rb.y); await page.waitForTimeout(150);
  check('touch: Resume button resumes, and its tap did not jump', (await mode(page)) === 'playing' && (await jumps(page)) === j0);
  await shot(page, '06_touch_ipad');
  errorsOk(page, 'touch');
  await close(page);
}

/* HUD / menu pointerdown must never trigger gameplay (title demo, pause, settings over a running game). */
async function testMenuPointer() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await startFrozen(page); await isolate(page, 480);
  const j0 = await jumps(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  await page.click('#btnPauseSettings'); await page.waitForTimeout(100);
  await page.click('#setDifficulty button[data-v=normal]'); await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setSfx)');
  const vb = await center(page, '#setVolume'); await page.mouse.click(vb.x, vb.y);
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(80);
  await page.click('#btnResume'); await page.waitForTimeout(100);
  const s = await st(page);
  check('menus: clicks in Pause / Settings never jump or steer Bristle', s.mode === 'playing' && (await jumps(page)) === j0 && near(s.hog.x, 480, 1) && !(await ev(page, () => MP.Game.pointerDown)), { jumps: (await jumps(page)) - j0, x: s.hog.x });
  check('menus: settings were really changed by those clicks (sanity)', await ev(page, () => MP.Game.settings.sfx === true));
  errorsOk(page, 'menu pointer');
  await close(page);
}

async function testScoring() {
  const page = await newPage();
  await boot(page, 'seed=9');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  const reset = () => ev(page, () => { const w = MP.debug.world; w.combo = 0; w.mult = 1; w.chain = 0; });
  // tier 1: a low bubble on the floor (ground pop)
  await isolate(page, 480); await reset(); await clearLog(page);
  let s0 = (await st(page)).score;
  await bubble(page, 'cupcake', 480, 420); await simStep(page, 0.05);
  let pe = await evLog(page, 'pop'), s1 = await st(page);
  check('score: ground pop (y > tierY[0]) → tier 1, 10 × 1 × 1 points', pe.length === 1 && pe[0].tier === 1 && pe[0].points === cfg.basePoints && !pe[0].air && s1.score - s0 === pe[0].points, pe[0]);
  check('score: popped cupcake goes in the box, run counter + streak +1', s1.box === 1 && s1.combo === 1 && s1.run.cupcakes === 1 && s1.run.pops === 1, { box: s1.box, combo: s1.combo, run: s1.run });
  // tier 2 + chain: Bristle in the air at y 300
  await isolate(page, 480); await reset(); await clearLog(page);
  await ev(page, () => { const s = MP.debug.world.hog; s.air = true; s.y = s._py = 300; s.vy = 0; s.airT = 0.3; });
  await bubble(page, 'cupcake', 480, 300); await simStep(page, 0.02);
  await bubble(page, 'cupcake', 480, (await hog(page)).y); await simStep(page, 0.02);
  pe = await evLog(page, 'pop');
  const ch = await evLog(page, 'chain');
  check('score: high pop (220 < y ≤ 360) in the air → tier 2, 20 points, chain 1', pe[0] && pe[0].tier === 2 && pe[0].air && pe[0].chain === 1 && pe[0].points === 2 * cfg.basePoints, pe[0]);
  check('score: 2nd air pop in the same jump → chain 2, +chainPoints, chain event n=2', pe[1] && pe[1].chain === 2 && pe[1].points === 2 * cfg.basePoints + cfg.chainPoints && ch.length === 1 && ch[0].n === 2, { p: pe[1], ch });
  check('score: an air pop bounces Bristle up (vy ≤ −popBounce)', (await hog(page)).vy <= -cfg.popBounce + cfg.gravity * 0.05, (await hog(page)).vy);
  await ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while (w.hog.air && i++ < 900) G.step(1 / 60); });
  check('score: landing resets the chain', (await st(page)).chain === 0);
  // tier 3 (sky)
  await isolate(page, 480); await reset(); await clearLog(page);
  await ev(page, () => { const s = MP.debug.world.hog; s.air = true; s.y = s._py = 200; s.vy = 0; s.airT = 0.5; });
  await bubble(page, 'cupcake', 480, 200); await simStep(page, 0.02);
  pe = await evLog(page, 'pop');
  check('score: sky pop (y ≤ tierY[1]) → tier 3, 30 points, run.skyPops +1', pe.length === 1 && pe[0].tier === 3 && pe[0].points === 3 * cfg.basePoints && (await st(page)).run.skyPops >= 1, pe[0]);
  await ev(page, () => { const G = MP.Game, w = G.world; let i = 0; while (w.hog.air && i++ < 900) G.step(1 / 60); });
  // streak multiplier
  await isolate(page, 480); await reset(); await clearLog(page);
  await ev(page, () => { MP.debug.world.boxTarget = 999; });
  const th = cfg.multThresholds, N = th[th.length - 1] + 2, bad = [];
  for (let i = 0; i < N; i++) { await bubble(page, 'cupcake', 480, 420); await simStep(page, 0.05); }
  pe = await evLog(page, 'pop');
  for (const e of pe) {
    let m = 1; for (let k = th.length - 1; k >= 0; k--) if (e.combo >= th[k]) { m = k + 1; break; }
    if (e.mult !== m || e.points !== cfg.basePoints * e.tier * m) bad.push(e);
  }
  check(`score: ${N} ground pops: mult follows thresholds ${JSON.stringify(th)} and points = 10 × tier × mult`, pe.length === N && bad.length === 0, bad.slice(0, 2));
  const ups = (await evLog(page, 'multup')).map(e => e.mult);
  check('score: multup events at ×2 and ×3 exactly once each', JSON.stringify(ups) === '[2,3]', ups);
  // escape resets the streak (no heart lost)
  await clearLog(page); await isolate(page, 200);
  const hearts0 = (await st(page)).hearts;
  await bubble(page, 'cupcake', 800, 80, 80, -80); await simStep(page, 0.8);
  let s2 = await st(page);
  const es = await evLog(page, 'escape');
  check('score: an escaped cupcake bubble → escape event, streak 0, ×1, no heart lost', es.length === 1 && s2.combo === 0 && s2.mult === 1 && s2.hearts === hearts0 && s2.escaped >= 1, { es, combo: s2.combo, mult: s2.mult });
  // an escaped magnet does not reset
  await ev(page, () => { const w = MP.debug.world; w.combo = 5; w.mult = 1; }); await clearLog(page);
  await bubble(page, 'magnet', 800, 80, 80, -80); await simStep(page, 0.8);
  s2 = await st(page);
  check('score: an escaped magnet bubble keeps the streak', (await evLog(page, 'escape')).length === 1 && s2.combo === 5, s2.combo);
  // magnet: pop → magnet event, magnet.t = magnetDur, box unchanged, nearby bubbles pulled in
  await isolate(page, 480); await reset(); await clearLog(page);
  const box0 = (await st(page)).box;
  await bubble(page, 'magnet', 480, 420); await simStep(page, 0.05);
  s2 = await st(page);
  check('magnet: popping the magnet bubble → magnet event, timer = magnetDur, box unchanged', (await evLog(page, 'magnet')).length === 1 && near(s2.magnet.t, cfg.magnetDur, 0.1) && s2.box === box0 && s2.run.magnets === 1, { m: s2.magnet, box: s2.box });
  const idNear = await bubble(page, 'cupcake', 680, 300, 30);
  const idFar = await bubble(page, 'cupcake', 480 + cfg.magnetR + 120, 430, 0);
  const farX0 = await ev(page, id => MP.debug.world.items.find(i => i.id === id).x, idFar);
  let popped = false, maxV = 0;
  for (let i = 0; i < 40 && !popped; i++) {
    await simStep(page, 0.1);
    const r = await ev(page, id => { const it = MP.debug.world.items.find(i => i.id === id); return it ? { st: it.state, v: Math.hypot(it.vx, it.vy) } : { st: 'gone', v: 0 }; }, idNear);
    maxV = Math.max(maxV, r.st === 'rise' ? r.v : 0); popped = r.st !== 'rise';
  }
  const farX1 = await ev(page, id => { const it = MP.debug.world.items.find(i => i.id === id); return it ? it.x : null; }, idFar);
  check('magnet: a bubble 200 px away is pulled to Bristle and popped within 4 s (speed ≤ cap)', popped && maxV <= cfg.magnetMaxV + 1, { popped, maxV: Math.round(maxV) });
  check('magnet: a bubble outside magnetR is not pulled in (stays outside the field, not popped)', farX1 != null && farX1 - 480 > cfg.magnetR, { farX0, farX1 });
  await simStep(page, cfg.magnetDur);
  check('magnet: magnetend after magnetDur, timer 0', (await evLog(page, 'magnetend')).length === 1 && (await st(page)).magnet.t === 0);
  // pebble bonk: −1 heart, streak 0, invulnerable; a 2nd pebble while blinking does nothing
  await isolate(page, 480); await clearLog(page);
  await ev(page, () => { const w = MP.debug.world; w.combo = 7; w.mult = 1; });
  const h0 = (await st(page)).hearts;
  await pebble(page, 480, 330); await simStep(page, 0.6);
  let bs = await ev(page, () => { const w = MP.debug.world; return { hearts: w.hearts, combo: w.combo, mult: w.mult, inv: w.hog.invuln, frame: w.hog.frame }; });
  check('pebble: a pebble on Bristle → bonk, −1 heart, streak 0, invulnerable, bonk frame', (await evLog(page, 'bonk')).length === 1 && bs.hearts === h0 - 1 && bs.combo === 0 && bs.inv > 0 && bs.frame === 'bonk', bs);
  await clearLog(page);
  await pebble(page, await ev(page, () => MP.debug.world.hog.x), 340); await simStep(page, 0.5);
  check('pebble: a 2nd pebble while blinking does not bonk', (await evLog(page, 'bonk')).length === 0 && (await st(page)).hearts === h0 - 1);
  await clearLog(page); await isolate(page, 200);
  await pebble(page, 800, 300); await simStep(page, 1.5);
  check('pebble: a pebble that misses lands (pebbleland), no heart lost', (await evLog(page, 'pebbleland')).length === 1 && (await st(page)).hearts === h0 - 1);
  await clearLog(page); await isolate(page, 480);
  const bid = await bubble(page, 'cupcake', 700, 430); await pebble(page, 700, 330); await simStep(page, 0.8);
  check('pebble: pebbles never pop bubbles', (await evLog(page, 'pop')).length === 0 && await ev(page, id => !!MP.debug.world.items.find(i => i.id === id && i.state === 'rise'), bid));
  await page.waitForTimeout(100);
  await shot(page, '07_scoring_hud');
  errorsOk(page, 'scoring');
  await close(page);
}

async function testLevels() {
  const page = await newPage();
  await boot(page, 'seed=11');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  const names = ['dawn', 'noon', 'sunset', 'night'];
  for (let z = 0; z < 4; z++) {
    await toPlaying(page); await isolate(page, 480); await clearLog(page);
    const before = await ev(page, () => { const w = MP.debug.world; w.boxTarget = w.box + 1; return { score: w.score, hearts: w.hearts, level: w.level }; });
    await bubble(page, 'cupcake', 480, 420); await simStep(page, 0.05);
    await simStep(page, cfg.boxGrace + 0.1);
    const cl = await evLog(page, 'cleared');
    check(`level ${names[z]}: box full → boxfull + cleared, bonus = hearts × ${cfg.clearBonusPerHeart}`, (await evLog(page, 'boxfull')).length === 1 && cl.length === 1 && cl[0].bonus === before.hearts * cfg.clearBonusPerHeart, cl);
    await ev(page, () => { const G = MP.Game, L = G.world.level; let i = 0; while (G.world.level === L && i++ < 600) G.step(1 / 60); });
    const zn = await evLog(page, 'zone');
    const s = await ev(page, () => ({ level: MP.debug.world.level, zone: MP.debug.world.zone, lap: MP.debug.world.lap, wz: MP.debug.weather.zone, az: MP.Audio.season, rv: MP.Game.renderer.vis.cur, banner: MP.Game.renderer.banner && MP.Game.renderer.banner.s, box: MP.debug.world.box, bt: MP.debug.world.boxTarget, info: MP.debug.world.levelInfo(MP.debug.world.level).boxTarget, vents: MP.debug.world.vents.length }));
    const nz = (z + 1) % 4;
    check(`level ${names[z]} → ${names[nz]}: zone event, empty box, weather + music + renderer + banner switch`, zn.length === 1 && zn[0].zone === nz && s.zone === nz && s.box === 0 && s.wz === nz && s.az === nz && s.rv === nz && s.banner === nz, s);
    check(`level ${names[nz]}: box target from levelInfo and ${cfg.vents[nz]} vents`, s.bt === s.info && s.vents === cfg.vents[nz], s);
    await ev(page, () => MP.Game.renderer.update(0.6)); await page.waitForTimeout(150);
    await shot(page, `08_level_${s.level}_${names[nz]}`);
  }
  check('level: after night the loop restarts at dawn, lap 2', await ev(page, () => MP.debug.world.zone === 0 && MP.debug.world.lap === 1 && MP.debug.world.level === 4));
  // gotoLevel hook
  for (let i = 0; i < 4; i++) {
    await ev(page, i => MP.debug.gotoLevel(i), i); await simStep(page, 0.1);
    const s = await st(page);
    check(`gotoLevel(${i}) → zone ${i} (${names[i]})`, s.level === i && s.zone === i && s.box === 0, { level: s.level, zone: s.zone });
  }
  // score & hearts are kept across levels
  await ev(page, () => { MP.debug.world.score = 555; MP.debug.world.hearts = 2; MP.debug.gotoLevel(2); });
  const k = await st(page);
  check('level: startLevel keeps score and hearts', k.score === 555 && k.hearts === 2, k);
  errorsOk(page, 'levels');
  await close(page);
}

async function testPause() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t0 = await ev(page, () => MP.debug.world.time);
    await page.waitForTimeout(500);
    const t1 = await ev(page, () => MP.debug.world.time);
    check(`pause: ${key} pauses and freezes world time; HUD hidden`, (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause' && t1 === t0 && !(await visible(page, '#btnPause')));
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t2 = await ev(page, () => MP.debug.world.time);
    await page.waitForTimeout(300);
    check(`pause: ${key} resumes; time runs, no big jump`, (await mode(page)) === 'playing' && (await ev(page, () => MP.debug.world.time)) > t2 && t2 - t1 < 0.3);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await shot(page, '09_pause');
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  check('pause: Settings opens from pause', (await ui(page)) === 'scrSettings' && (await mode(page)) === 'paused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('pause: Esc from Settings goes back to Pause (still paused)', (await ui(page)) === 'scrPause' && (await mode(page)) === 'paused');
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('pause: Done in Settings goes back to Pause', (await ui(page)) === 'scrPause');
  await page.click('#btnResume'); await page.waitForTimeout(150);
  check('pause: Resume button resumes', (await mode(page)) === 'playing');
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur auto-pauses', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  check('pause: visibilitychange (tab hidden) auto-pauses and suspends audio', (await mode(page)) === 'paused' && await ev(page, () => MP.Audio._hidden === true));
  await ev(page, () => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(80);
  check('pause: tab visible again → audio un-suspended, game stays paused', (await mode(page)) === 'paused' && await ev(page, () => MP.Audio._hidden === false));
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(50);
  await ev(page, () => window.dispatchEvent(new Event('blur')));
  await page.click('#btnResume'); await page.waitForTimeout(100);
  check('pause: held keys are cleared by blur (no stuck skating after resume)', await ev(page, () => Object.keys(MP.Game.keys).length === 0));
  await page.keyboard.up('ArrowRight');
  await countStarts(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnRestart'); await page.waitForTimeout(150);
  check('pause: Restart starts a fresh run', (await mode(page)) === 'playing' && (await starts(page)) === 1 && (await ev(page, () => MP.debug.world.score)) === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseMenu'); await page.waitForTimeout(150);
  check('pause: Main Menu returns to the title', (await mode(page)) === 'title' && (await ui(page)) === 'scrTitle' && !(await visible(page, '#btnPause')));
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { const w = MP.debug.world; w.hearts = 0; w.state = 'dead'; });
  await page.keyboard.press('Escape'); await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(80);
  check('pause: no pause (key or blur) while the out-of-hearts animation plays', (await mode(page)) === 'playing');
  errorsOk(page, 'pause');
  await close(page);
}

async function testGameOver() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  // test-URL runs (seed) must NOT save a best score
  await boot(page, 'seed=5');
  await ev(page, () => MP.Game.resetBest());
  await page.click('#btnPlay'); await page.waitForTimeout(150); await freeze(page);
  await killToOver(page, 4321); await page.waitForTimeout(150);
  check('best: a ?seed= test run does not save a best score (testRun)', await ev(page, () => MP.Game.testRun === true && MP.Storage.get('best_normal') == null));
  // ?savebest=1 opts back in
  await boot(page, 'seed=5&savebest=1');
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page);
  const m = await killToOver(page, 1234);
  await page.waitForTimeout(200);
  check('over: losing the last heart → game over screen', m === 'over' && (await ui(page)) === 'scrOver');
  const o = await ev(page, () => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: MP.Storage.get('best_normal'), stats: document.getElementById('overStats').textContent }));
  check('over: score + NEW best shown and saved as best_normal (savebest=1)', o.score === '1234' && o.best === '1234' && o.nb && o.stored === '1234', o);
  check('over: stats list cupcakes, sky pops, chain, streak, zone', /Cupcakes saved/.test(o.stats) && /Sky pops/.test(o.stats) && /Best chain/.test(o.stats) && /Dawn/.test(o.stats), o.stats);
  check('over: HUD and jump button hidden', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  await shot(page, '10_over');
  await countStarts(page);
  const sinceOver = () => ev(page, () => performance.now() - MP.Game.overAt);
  let pressed = 0;
  await ev(page, () => { MP.Game.overAt = performance.now(); });
  while ((await sinceOver()) < 600 && pressed < 30) { await page.keyboard.press(pressed % 2 ? 'Space' : 'Enter'); pressed++; await page.waitForTimeout(25); }
  const early = await starts(page);
  check('over: Enter/Space spam in the first 0.6 s does not restart (0.7 s restart lock)', pressed > 0 && early === 0 && (await mode(page)) === 'over', { early, pressed });
  await ev(page, () => { MP.Game.overAt = performance.now(); });
  await page.click('#btnAgain'); await page.waitForTimeout(60);
  check('over: clicking Play Again inside the lock does nothing', (await starts(page)) === 0);
  await page.waitForTimeout(750);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  check('over: Enter spam after the lock starts exactly ONE new game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page);
  await killToOver(page, 50);
  await page.waitForTimeout(150);
  const o2 = await ev(page, () => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: MP.Storage.get('best_normal') }));
  check('over: lower score keeps the best, no NEW badge', o2.best === '1234' && !o2.nb && o2.stored === '1234', o2);
  await countStarts(page);
  await page.waitForTimeout(750);
  await page.click('#btnAgain'); await page.click('#btnAgain', { force: true, timeout: 500 }).catch(() => {});
  await page.waitForTimeout(150);
  check('over: double-clicking Play Again starts exactly one game', (await starts(page)) === 1, await starts(page));
  await freeze(page);
  await killToOver(page, 10);
  await page.waitForTimeout(800);
  await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('over: Space restarts once', (await starts(page)) === 1 && (await mode(page)) === 'playing');
  await freeze(page);
  await killToOver(page, 10);
  await page.waitForTimeout(900);
  await countStarts(page);
  await page.focus('#btnOverMenu'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  check('over: Enter on the focused Menu button goes to the title (not Play Again)', (await mode(page)) === 'title' && (await starts(page)) === 0);
  check('over: title shows best 1234', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '1234');
  // best per difficulty
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('best: title shows the Easy best (0) after switching to Easy', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '0');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page);
  check('best: Easy run uses Easy hearts', (await ev(page, () => MP.debug.world.heartsMax)) === (await ev(page, () => MP.DIFFICULTY.easy.heartsMax)));
  await killToOver(page, 777);
  await page.waitForTimeout(200);
  const bs = await ev(page, () => ({ e: MP.Storage.get('best_easy'), n: MP.Storage.get('best_normal') }));
  check('best: Easy best saved separately from Normal', bs.e === '777' && bs.n === '1234', bs);
  await page.click('#btnOverMenu'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings'); await page.click('#setDifficulty button[data-v=hard]'); await page.click('#scrSettings .btn-back'); await page.click('#btnResume');
  await freeze(page);
  await killToOver(page, 900);
  await page.waitForTimeout(150);
  const bs2 = await ev(page, () => ({ e: MP.Storage.get('best_easy'), h: MP.Storage.get('best_hard') }));
  check('best: switching difficulty mid-run credits the run\'s difficulty (Easy)', bs2.e === '900' && !bs2.h, bs2);
  // persistence of best across reload
  await reboot(page);
  check('best: best scores survive a reload', await ev(page, () => MP.Storage.get('best_easy') === '900' && MP.Storage.get('best_normal') === '1234'));
  await ev(page, () => { localStorage.clear(); });
  errorsOk(page, 'game over');
  await ctx.close();
}

async function testSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5', false);
  await ev(page, () => localStorage.clear()); await reboot(page);
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  const s0 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, vol: document.getElementById('setVolume').value }));
  check('settings: defaults sfx + music on, volume 100 %', s0.sfx && s0.music && s0.vol === '100', s0);
  check('volume: nothing saved just by opening Settings', await ev(page, () => MP.Storage.get('volume') == null));
  await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)');
  await page.click('#setDifficulty button[data-v=hard]'); await page.click('#setLength button[data-v=long]');
  await page.locator('#setVolume').fill('65'); await page.waitForTimeout(100);
  const a = await ev(page, () => ({ s: MP.Game.settings, aud: { sfx: MP.Audio.sfxOn, music: MP.Audio.musicOn, vol: MP.Audio.volume } }));
  check('settings: toggles change game + audio state', !a.s.sfx && !a.s.music && a.s.difficulty === 'hard' && a.s.length === 'long' && !a.aud.sfx && !a.aud.music && near(a.aud.vol, 0.65, 1e-6), a);
  check('settings: segments highlight Hard and Long', await ev(page, () => document.querySelector('#setDifficulty button.on').dataset.v === 'hard' && document.querySelector('#setLength button.on').dataset.v === 'long'));
  await page.click('#scrSettings .btn-back');
  await reboot(page);
  const b = await ev(page, () => ({ s: MP.Game.settings, vol: MP.Storage.get('volume'), avol: MP.Audio.volume }));
  check('settings: sound, music, volume, difficulty, length persist across reload', !b.s.sfx && !b.s.music && b.s.difficulty === 'hard' && b.s.length === 'long' && b.vol === '0.65' && near(b.avol, 0.65, 1e-6), b);
  await page.click('#btnSettings'); await page.waitForTimeout(100);
  const ui1 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, d: document.querySelector('#setDifficulty button.on').dataset.v, l: document.querySelector('#setLength button.on').dataset.v, v: document.getElementById('setVolume').value }));
  check('settings: the Settings screen shows the saved values after reload', !ui1.sfx && !ui1.music && ui1.d === 'hard' && ui1.l === 'long' && ui1.v === '65', ui1);
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const hard = await ev(page, () => { const w = MP.debug.world, D = MP.DIFFICULTY.hard; return { cfgBox: w.cfg.boxTargets, D: D.boxTargets, inv: w.cfg.invulnTime, Dinv: D.invulnTime, bt: w.boxTarget }; });
  check('settings: Hard difficulty applied to the new world', JSON.stringify(hard.cfgBox) === JSON.stringify(hard.D) && hard.inv === hard.Dinv, hard);
  check('settings: Level length Long → box target = round(hard dawn target × 1.4)', hard.bt === Math.max(6, Math.round(hard.D[0] * 1.4)), hard);
  await ev(page, () => { MP.Game.setSetting('length', 'short'); MP.Game.startGame(); });
  const sh = await ev(page, () => ({ t: MP.debug.world.boxTarget, base: MP.debug.world.levelInfo(0).boxTarget }));
  check('settings: Level length Short → smaller box', sh.t < sh.base, sh);
  await ev(page, () => { MP.debug.gotoLevel(1); });
  const sh1 = await ev(page, () => ({ t: MP.debug.world.boxTarget, base: MP.debug.world.levelInfo(1).boxTarget }));
  check('settings: Level length also scales later levels (exactly once)', sh1.t === Math.max(6, Math.round(sh1.base * 0.7)), sh1);
  await ev(page, () => MP.Game.setSetting('length', 'normal'));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M mutes (saved)', await ev(page, () => MP.Game.settings.muted && JSON.parse(MP.Storage.get('settings')).muted === true && MP.Audio.muted));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M again unmutes', await ev(page, () => !MP.Game.settings.muted && !MP.Audio.muted));
  // volume 0 → muted icon; M restores 50 %
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings');
  for (let i = 0; i < 8; i++) await page.click('.vol-step[data-d="-1"]');
  const MUTED_ICON = () => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6');
  check('volume: − to 0 % saves 0.00 and shows the muted speaker', await ev(page, () => MP.Storage.get('volume') === '0.00' && MP.Audio.volume === 0) && await ev(page, MUTED_ICON));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('volume: M at 0 % unmutes and restores 50 %', await ev(page, () => +MP.Storage.get('volume') === 0.5 && !MP.Game.isMuted()));
  await page.click('#scrSettings .btn-back'); await page.click('#btnResume');
  // ?mute=1 never saved
  await page.goto(url('seed=5', true));
  await page.waitForFunction(() => window.MP && MP.debug && MP.debug.mode === 'title');
  const mu = await ev(page, () => ({ audio: MP.Audio.muted, saved: JSON.parse(MP.Storage.get('settings') || '{}').muted, setting: MP.Game.settings.muted, vol: MP.Storage.get('volume') }));
  check('settings: ?mute=1 mutes audio but is never written to storage (volume untouched)', mu.audio === true && !mu.saved && !mu.setting && +mu.vol === 0.5, mu);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.click('label.set:has(#setSfx)'); await page.waitForTimeout(80);
  check('settings: changing other settings with ?mute=1 still does not save muted', await ev(page, () => !JSON.parse(MP.Storage.get('settings')).muted));
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  check('settings: with ?mute=1 the HUD sound icon shows "muted"', await ev(page, MUTED_ICON));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: with ?mute=1, M is a session-only unmute (nothing saved)', await ev(page, () => !MP.Game.isMuted() && !JSON.parse(MP.Storage.get('settings')).muted));
  await page.goto(url('', false)); await page.waitForFunction(() => window.MP && MP.debug && MP.debug.mode === 'title');
  check('settings: the next normal launch is not muted', await ev(page, () => !MP.Audio.muted && !MP.Game.isMuted()));
  // Reset best
  await ev(page, () => { MP.Storage.set('best_normal', '55'); MP.Storage.set('best_easy', '66'); });
  await page.click('#btnSettings'); await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('settings: Reset best clears every difficulty + toast', await ev(page, () => !MP.Storage.get('best_normal') && !MP.Storage.get('best_easy') && !MP.Storage.get('best_hard')) && /cleared/i.test(await toastText(page)));
  await ev(page, () => localStorage.clear());
  errorsOk(page, 'settings');
  await ctx.close();
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await countStarts(page);
  await page.click('#btnHow'); await page.click('#scrHow .btn-back'); await page.waitForTimeout(120);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on the title starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  let j = await jumps(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: next Space in play is a jump, not a menu button', (await mode(page)) === 'playing' && (await jumps(page)) === j + 1 && (await starts(page)) === 1);
  await ev(page, () => MP.Game.toTitle()); await page.waitForTimeout(150);
  await countStarts(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('focus: Enter on the title (Play focused) starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  j = await jumps(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter right after start = jump only (no re-click of Play)', (await jumps(page)) === j + 1 && (await starts(page)) === 1);
  // focused Play + Space → one start (no click on keyup as well)
  await ev(page, () => MP.Game.toTitle()); await page.waitForTimeout(150);
  await page.focus('#btnPlay'); await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);
  check('focus: focused Play button + Space starts exactly one game', (await starts(page)) === 1, await starts(page));
  // focused How button + Space opens How (not Play)
  await ev(page, () => MP.Game.toTitle()); await page.waitForTimeout(150);
  await page.focus('#btnHow'); await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: focused How to Play + Space opens How to Play (does not start)', (await ui(page)) === 'scrHow' && (await starts(page)) === 0);
  await page.keyboard.press('Escape');
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=normal]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(100);
  await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: after Settings, Space on the title starts once', (await starts(page)) === 1);
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  j = await jumps(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: Space on Pause resumes and does not jump at the same time', (await mode(page)) === 'playing' && (await jumps(page)) === j);
  const pb = await center(page, '#btnPause');
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  j = await jumps(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on Pause resumes once without also jumping', (await mode(page)) === 'playing' && (await jumps(page)) === j);
  errorsOk(page, 'focus');
  await close(page);
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5');
  await ev(page, () => MP.Assets.SLOTS.forEach(s => MP.Assets.clearCustom(s.id)));
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  const slots = await ev(page, () => MP.Assets.SLOTS.map(s => s.id));
  check('custom: 7 slots (hero, cupcake, pebble, 4 times of day)', slots.length === 7 && (await page.locator('#slotGrid .slot').count()) === 7 && ['hero', 'cupcake', 'pebble', 'bg_dawn', 'bg_noon', 'bg_sunset', 'bg_night'].every(s => slots.includes(s)), slots);
  const photo = await makeImage(page, 900, 700, 'photo', 'image/jpeg');
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  let t = await waitToast(page, /saved/i);
  check('custom: photo for Bristle saved (toast)', /saved/i.test(t), t);
  const hs = await storedSize(page, 'img_hero');
  check('custom: hero picture downscaled to ≤ 512 px', hs && hs[0] <= 512 && hs[1] <= 512, hs);
  check('custom: opaque photo becomes a round sticker with transparent corners', (await ev(page, () => MP.Storage.get('shape_hero'))) === 'circle' && await ev(page, () => { const c = MP.Assets.custom.hero; return c.width === c.height && c.getContext('2d').getImageData(2, 2, 1, 1).data[3] === 0; }));
  check('custom: card shows "Your picture" + Round selected', await ev(page, () => { const s = document.querySelectorAll('#slotGrid .slot')[0]; return /Your picture/.test(s.textContent) && s.querySelector('.shape button.on').dataset.shape === 'circle'; }));
  const thumbBlue = await ev(page, () => document.querySelector('#slotGrid .slot .prev img').src);
  // replacing the photo with another photo must refresh the card preview
  const red = await makeImage(page, 700, 700, 'photoRed', 'image/jpeg');
  await pickFile(page, 'hero', { name: 'red.jpg', mimeType: 'image/jpeg', buffer: red });
  await waitToast(page, /saved/i); await page.waitForTimeout(150);
  const prevCol = await ev(page, () => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(im.width >> 1, im.height >> 1, 1, 1).data; res([d[0], d[1], d[2]]); }; im.src = document.querySelector('#slotGrid .slot .prev img').src; }));
  const thumbRed = await ev(page, () => document.querySelector('#slotGrid .slot .prev img').src);
  check('custom: replacing a round photo with another photo refreshes the card preview', thumbRed !== thumbBlue && prevCol[0] > 180 && prevCol[2] < 80, { prevCol, same: thumbRed === thumbBlue });
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo }); await waitToast(page, /saved/i);
  const cut = await makeImage(page, 300, 300, 'cupcake', 'image/png');
  await pickFile(page, 'cupcake', { name: 'cupcake.png', mimeType: 'image/png', buffer: cut });
  t = await waitToast(page, /saved/i);
  check('custom: transparent PNG for the cupcake keeps "Whole picture"', /saved/i.test(t) && (await ev(page, () => MP.Storage.get('shape_cupcake'))) === 'fit', t);
  const peb = await makeImage(page, 200, 160, 'pebble', 'image/png');
  await pickFile(page, 'pebble', { name: 'pebble.png', mimeType: 'image/png', buffer: peb });
  t = await waitToast(page, /saved/i);
  check('custom: pebble picture saved', /saved/i.test(t) && await ev(page, () => MP.Assets.hasCustom('pebble')), t);
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=circle]').click();
  check('custom: Round / Whole toggle switches the shape', (await ev(page, () => MP.Storage.get('shape_cupcake'))) === 'circle');
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=fit]').click();
  await pickFile(page, 'pebble', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(page, /picture/i, 3000);
  check('custom: non-image file → friendly error, previous picture kept', /choose a picture/i.test(t) && (await ev(page, () => !!MP.Storage.get('img_pebble'))), t);
  await pickFile(page, 'pebble', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(page, /could not/i, 4000);
  check('custom: corrupt image → friendly "could not be opened" error', /could not/i.test(t), t);
  await pickFile(page, 'cupcake', { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  t = await waitToast(page, /could|picture/i, 4000);
  check('custom: empty file → friendly error, previous picture kept', /could|picture/i.test(t) && await ev(page, () => MP.Assets.hasCustom('cupcake')), t);
  // background + a huge 6000×4000 image
  const huge = await makeImage(page, 6000, 4000, 'big', 'image/jpeg');
  info('huge image bytes: ' + huge.length);
  const tH = Date.now();
  await pickFile(page, 'bg_dawn', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
  t = await waitToast(page, /saved|room|could/i, 20000);
  const bs = await storedSize(page, 'img_bg_dawn');
  check('custom: 6000×4000 background accepted and downscaled to ≤ 1280×720', /saved/i.test(t) && bs && bs[0] <= 1280 && bs[1] <= 720, { t, bs, ms: Date.now() - tH });
  const hugeHero = await makeImage(page, 6000, 4000, 'pebble', 'image/png');
  await pickFile(page, 'pebble', { name: 'hugep.png', mimeType: 'image/png', buffer: hugeHero });
  t = await waitToast(page, /saved|room|could/i, 20000);
  const ps = await storedSize(page, 'img_pebble');
  check('custom: 6000×4000 PNG for the pebble shrunk to ≤ 512 px', /saved/i.test(t) && ps && Math.max(ps[0], ps[1]) <= 512, { t, ps });
  await shot(page, '11_custom_cards');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  // play with the custom pictures
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page); await toPlaying(page);
  await isolate(page, 480);
  await bubble(page, 'cupcake', 250, 250);
  await pebble(page, 700, 250, 0);
  await ev(page, () => { const w = MP.debug.world; w.items.forEach(it => { it._k = it.kind === 'pebble' ? 1e-6 : it._k; it._vT = 0; it.vy = 0; it.spin = 0; it.rot = 0; it._A = 0; }); });
  await ev(page, () => MP.debug.setSpeed(0.001));
  await page.waitForTimeout(300);
  const blueHero = await probe(page, 430, 400, 100, 90, 'b > 150 && r < 60 && g < 60');
  const cyanCup = await probe(page, 230, 230, 40, 40, 'g > 180 && b > 180 && r < 100');
  const magPeb = await probe(page, 680, 230, 40, 40, 'r > 170 && b > 170 && g < 100');
  const purpleBg = await probe(page, 20, 150, 200, 80, 'b > g + 20 && r > 60 && r < 160');
  check('custom: custom Bristle (blue photo) is drawn in play', blueHero > 200, blueHero);
  check('custom: custom cupcake is drawn inside the bubble', cyanCup > 30, cyanCup);
  check('custom: custom pebble is drawn', magPeb > 30, magPeb);
  check('custom: custom dawn background is drawn (purple sky)', purpleBg > 500, purpleBg);
  await freeze(page);
  await shot(page, '12_custom_play');
  await ev(page, () => MP.debug.gotoLevel(1)); await simStep(page, 2);
  await ev(page, () => MP.debug.setSpeed(4)); await page.waitForTimeout(1200); await freeze(page);
  const noonPurple = await probe(page, 20, 150, 200, 80, 'b > g + 20 && r > 60 && r < 160 && Math.abs(r - 0x5a) < 25 && Math.abs(g - 0x3a) < 25');
  check('custom: noon (no custom picture) keeps its original sky', noonPurple < 500, noonPurple);
  errorsOk(page, 'custom play');
  // reload persistence, reset one / reset all
  await reboot(page);
  check('custom: custom pictures reload after a page reload', await ev(page, () => ['hero', 'cupcake', 'pebble', 'bg_dawn'].every(s => MP.Assets.hasCustom(s))));
  await page.click('#btnCustomize'); await page.waitForTimeout(100);
  await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await page.waitForTimeout(100);
  check('custom: Reset on Bristle removes only Bristle', await ev(page, () => !MP.Assets.hasCustom('hero') && !MP.Storage.get('img_hero') && MP.Assets.hasCustom('cupcake') && MP.Assets.hasCustom('pebble')));
  await page.click('#btnResetAll'); await page.waitForTimeout(100);
  check('custom: Reset all removes every custom picture (memory + storage)', await ev(page, () => MP.Assets.SLOTS.every(s => !MP.Assets.hasCustom(s.id) && !MP.Storage.get('img_' + s.id) && !MP.Storage.get('shape_' + s.id))));
  check('custom: cards back to "Original"', await ev(page, () => [...document.querySelectorAll('#slotGrid .slot .tag')].every(t => /Original/.test(t.textContent))));
  errorsOk(page, 'custom');
  await ctx.close();
}

async function testLayout() {
  const vps = [
    [960, 540, 1, false], [1280, 720, 1, false], [1920, 1080, 1, false],
    [844, 390, 3, true], [390, 844, 3, true], [1024, 768, 2, true], [1366, 1024, 2, true], [844, 390, 2, true]
  ];
  const fakeInsets = { '844x390': { top: 0, right: 47, bottom: 21, left: 47 }, '390x844': { top: 47, right: 0, bottom: 34, left: 0 } };
  for (const [w, h, dsf, touchDev] of vps) {
    const page = await newPage({ viewport: { width: w, height: h }, dsf, touch: touchDev, mobile: touchDev });
    await boot(page, 'seed=5');
    const tag = `${w}x${h}@${dsf}${touchDev ? ' touch' : ''}`;
    const ins = touchDev && fakeInsets[w + 'x' + h];
    if (ins) await ev(page, i => { document.getElementById('safeProbe').style.padding = `${i.top}px ${i.right}px ${i.bottom}px ${i.left}px`; MP.Game.relayout(); }, ins);
    const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, bw: c.width, bh: c.height, vw: innerWidth, vh: innerHeight }; });
    const centered = near(cv.l, (cv.vw - cv.w) / 2, 1.5) && near(cv.t, (cv.vh - cv.h) / 2, 1.5);
    check(`layout ${tag}: canvas centred inside the window (fills it ${near(cv.w, cv.vw, 2) && near(cv.h, cv.vh, 2) ? 'yes' : 'letter-boxed'})`, centered && cv.w <= cv.vw + 1 && cv.h <= cv.vh + 1, cv);
    const capPx = touchDev ? 3.3e6 : 1920 * 1080 + 4000;
    check(`layout ${tag}: backing store within the pixel cap`, cv.bw * cv.bh <= capPx, [cv.bw, cv.bh]);
    const issues = [], scrollers = [];
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      await ev(page, s => MP.UI.show(s), scr); await page.waitForTimeout(350);
      const r = await layoutReport(page);
      if (r.bad.length || r.wide) issues.push(scr + ': ' + JSON.stringify(r));
      if (!r.mainOk || r.hidden.length) scrollers.push(scr + (r.mainOk ? '' : ' (main button below the fold)') + ': ' + r.hidden.slice(0, 4).join(','));
      if (touchDev || w === 960) await shot(page, `13_layout_${w}x${h}_${dsf}_${scr}`);
    }
    await ev(page, () => MP.UI.show('scrTitle'));
    await page.click('#btnPlay'); await page.waitForTimeout(250);
    await freeze(page);
    await ev(page, () => MP.Game.pause()); await page.waitForTimeout(350);
    let r = await layoutReport(page); if (r.bad.length || r.wide) issues.push('scrPause: ' + JSON.stringify(r)); if (!r.mainOk || r.hidden.length) scrollers.push('scrPause: ' + r.hidden.join(','));
    await ev(page, () => MP.Game.resume());
    await freeze(page); await killToOver(page, 4321); await page.waitForTimeout(500);
    r = await layoutReport(page); if (r.bad.length || r.wide) issues.push('scrOver: ' + JSON.stringify(r)); if (!r.mainOk || r.hidden.length) scrollers.push('scrOver: ' + r.hidden.join(','));
    if (touchDev || w === 960) await shot(page, `13_layout_${w}x${h}_${dsf}_scrOver`);
    check(`layout ${tag}: no menu panel or button outside the window`, issues.length === 0, issues.join(' | '));
    check(`layout ${tag}: every menu's buttons visible without scrolling (OK / Done / Play reachable for a child)`, scrollers.length === 0, scrollers.join(' | '));
    // HUD in play: inside the safe area, nothing overlapping
    await ev(page, () => MP.Game.startGame()); await freeze(page); await toPlaying(page);
    await ev(page, () => { const w = MP.debug.world; w.magnet.t = 3; w.magnet.dur = 7; w.combo = 9; w.mult = 2; w.score = 123456; }); await page.waitForTimeout(150);
    const hud = await ev(page, () => {
      const R = MP.Game.renderer, I = R.ins, VW = R.VW, VH = R.VH, c = document.getElementById('game').getBoundingClientRect(), k = VW / c.width;
      const rs = ['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect());
      const btn = { l: (Math.min(...rs.map(r => r.left)) - c.left) * k, t: (Math.min(...rs.map(r => r.top)) - c.top) * k, r: (Math.max(...rs.map(r => r.right)) - c.left) * k, b: (Math.max(...rs.map(r => r.bottom)) - c.top) * k, css: Math.min(...rs.map(r => r.width)) };
      const hm = MP.debug.world.heartsMax, hearts = { l: I.left + 14, r: I.left + 14 + 24 + 30 * hm + 10 + 58, t: I.top + 12, b: I.top + 58 };
      const bx = R._boxPos[0] + R.SX - 16, by = R._boxPos[1] + R.SY - 27, box = { l: bx - 8, r: bx + 128, t: by + 4, b: by + 50 };
      const cx = (I.left + VW - I.right) / 2, sdy = hearts.r > cx - 86 ? 60 : 0, score = { l: cx - 90, r: cx + 90, t: I.top + sdy + 10, b: I.top + sdy + 85 };
      return { I, VW, VH, btn, hearts, box, score };
    });
    const inside = b => b.l >= hud.I.left - 0.5 && b.r <= hud.VW - hud.I.right + 0.5 && b.t >= hud.I.top - 0.5;
    const ov = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    check(`layout ${tag}: HUD (hearts+magnet, score, box, buttons) inside the safe area`, inside(hud.btn) && inside(hud.hearts) && inside(hud.box) && inside(hud.score), hud);
    check(`layout ${tag}: HUD pieces do not overlap each other`, !ov(hud.hearts, hud.score) && !ov(hud.score, hud.box) && !ov(hud.box, hud.btn) && !ov(hud.hearts, hud.box), hud);
    if (touchDev) check(`layout ${tag}: HUD buttons ≥ 44 css px (finger-sized)`, hud.btn.css >= 44, hud.btn.css);
    if (touchDev) {
      const a = await ev(page, () => {
        const R = MP.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), e = document.getElementById('btnAction'), r = e.getBoundingClientRect(), L = R.layout, k = c.width / R.VW;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        // Bristle's sprite at the edge of the play range (scene x = playMax) must not be under the button
        const hogR = { l: c.left + (L.playMax + R.SX - 48) * k, r: c.left + (L.playMax + R.SX + 48) * k, t: c.top + (446 - 54 + R.SY) * k, b: c.top + (492 + R.SY) * k };
        const ov = !(r.right <= hogR.l || hogR.r <= r.left || r.bottom <= hogR.t || hogR.b <= r.top);
        const insL = R.ins.left * (1 / k) * 0, sa = R.ins;
        return { vis: !e.classList.contains('hidden') && r.width > 0 && hit && e.contains(hit), inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1,
          safe: (r.right - c.left) / k <= R.VW - sa.right + 0.5 && (r.bottom - c.top) / k <= R.VH - sa.bottom + 0.5, w: r.width, place: L.act.place, overHog: ov };
      });
      check(`layout ${tag}: jump button visible, tappable, inside the canvas + safe area, ≥ 66 css px`, a.vis && a.inside && a.safe && a.w >= 65.5, a);
      check(`layout ${tag}: jump button never covers Bristle at the edge of his range`, !a.overHog, a);
    } else check(`layout ${tag}: jump button hidden on non-touch`, !(await visible(page, '#btnAction')));
    await ev(page, () => MP.debug.setSpeed(1)); await page.waitForTimeout(900);
    await shot(page, `14_layout_${w}x${h}_${dsf}_game`);
    check(`layout ${tag}: no horizontal/vertical page scroll`, await ev(page, () => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
    // vents stay inside the play range
    const vr = await ev(page, () => { const w = MP.debug.world; return { v: w.vents.map(v => v.x), lo: w.cfg.xMin, hi: w.cfg.xMax }; });
    check(`layout ${tag}: vents inside Bristle's play range`, vr.v.every(x => x >= vr.lo && x <= vr.hi), vr);
    errorsOk(page, `layout ${tag}`);
    await close(page);
  }
  // live resize (desktop) and a small height change on a phone (Safari toolbar): vents should not jump around
  const page = await newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(400);
  const cv = await ev(page, () => { const r = document.getElementById('game').getBoundingClientRect(); const h = document.getElementById('btnPause').getBoundingClientRect(); return { w: r.width, h: r.height, t: r.top, hudR: h.right, cR: r.right, hudT: h.top }; });
  check('layout: live resize re-fits the canvas and re-anchors the HUD', near(cv.w, 900, 2) && cv.hudR <= cv.cR + 1 && cv.hudT >= cv.t - 1, cv);
  errorsOk(page, 'resize');
  await close(page);
  const ph = await newPage({ viewport: { width: 844, height: 390 }, dsf: 3, touch: true, mobile: true });
  await boot(ph, 'seed=5');
  await ph.touchscreen.tap(...Object.values(await center(ph, '#btnPlay'))); await ph.waitForTimeout(300);
  await freeze(ph); await toPlaying(ph);
  const v0 = await ev(ph, () => MP.debug.world.vents.map(v => Math.round(v.x)));
  await ph.setViewportSize({ width: 844, height: 340 }); await ph.waitForTimeout(400);
  await ph.setViewportSize({ width: 844, height: 390 }); await ph.waitForTimeout(400);
  const v1 = await ev(ph, () => MP.debug.world.vents.map(v => Math.round(v.x)));
  check('layout: a Safari toolbar-sized height change does not re-shuffle the vents mid-level', JSON.stringify(v0) === JSON.stringify(v1), { v0, v1 });
  errorsOk(ph, 'phone resize');
  await close(ph);
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'speed=16&bot=1&autorestart=1&autostart=1&seed=3');
  const samples = []; let maxFx = 0, maxP = 0, maxItems = 0, maxTexts = 0, insane = [];
  const t0 = Date.now(); let idle = false, killed = false;
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await page.waitForTimeout(1000);
    const k = (Date.now() - t0) / (LONG_RUN_S * 1000);
    // the bot rarely loses: in the middle of the run it stops and a pebble ends the game (auto-restart must kick in)
    if (!killed && k > 0.4) { killed = true; idle = true; await ev(page, () => { MP.Game.botMode = false; MP.Game.bot = null; const w = MP.debug.world; w.hearts = 1; w.hog.invuln = 0;
      const it = w._newPebble(w.hog.x); it._A = 0; it._bx = it.x = it._px = w.hog.x; it.y = it._py = w.hog.y - 60; it.vy = 190; w.items.push(it); }); }
    if (idle && (await ev(page, () => MP.debug.stats.games)) > 0) { idle = false; await ev(page, () => MP.debug.setBot(true, 1)); }
    const s = await ev(page, () => Object.assign(MP.debug.getState() || {}, { texts: MP.Game.renderer.texts.length, games: MP.debug.stats.games }));
    samples.push(s);
    if (!isFinite(s.score) || !isFinite(s.hog.x) || !isFinite(s.hog.y) || s.hog.x < 0 || s.hog.x > 960 || s.hearts < 0 || s.hearts > s.heartsMax || s.box > s.boxTarget) insane.push(s);
    maxFx = Math.max(maxFx, s.fx); maxP = Math.max(maxP, s.particles); maxItems = Math.max(maxItems, s.items); maxTexts = Math.max(maxTexts, s.texts);
  }
  const stt = await ev(page, () => MP.debug.stats);
  info(`long run ${LONG_RUN_S}s: games ${stt.games}, scores ${JSON.stringify(stt.scores.slice(0, 8))}, levels ${JSON.stringify(stt.levels.slice(0, 8))}, maxFx ${maxFx}, maxParticles ${maxP}, maxItems ${maxItems}, maxTexts ${maxTexts}, last level ${samples[samples.length - 1].level}`);
  check('long run: no runtime errors (stats.errors)', stt.errors.length === 0, stt.errors.slice(0, 2));
  check('long run: a game finished and auto-restarted', stt.games >= 1 && (await mode(page)) !== 'over', stt.games);
  const firstHalf = samples.filter((s, i) => i < samples.length * 0.38);
  check('long run: score increases while the bot plays', firstHalf.length > 3 && firstHalf[firstHalf.length - 1].score > firstHalf[1].score, firstHalf.map(s => s.score));
  check('long run: the bot clears levels (time of day changes)', samples.some(s => s.level >= 1), samples.map(s => s.level));
  check('long run: weather particles bounded (< 180)', maxP < 180, maxP);
  check('long run: fx bounded (≤ 400)', maxFx <= 400, maxFx);
  check('long run: items and texts bounded (< 40)', maxItems < 40 && maxTexts < 40, { maxItems, maxTexts });
  check('long run: state always sane (finite, hog in range, hearts / box within limits)', insane.length === 0, insane.slice(0, 2));
  check('long run: the ?speed/bot run is a testRun (no best saved)', await ev(page, () => MP.Game.testRun === true && MP.Storage.get('best_normal') == null));
  await shot(page, '15_long_run');
  errorsOk(page, 'long run');
  await close(page);
}

/* =============================== MAIN =============================== */
const TESTS = { boot: testBootAndScreens, keyboard: testKeyboard, jump: testJump, pointer: testPointer, touch: testTouch, menupointer: testMenuPointer,
  scoring: testScoring, levels: testLevels, pause: testPause, over: testGameOver, settings: testSettings, focus: testFocus,
  custom: testCustomPictures, layout: testLayout, long: testLongRun };

(async () => {
  let srv = null;
  if (!BASE) { srv = await serve(); BASE = 'http://127.0.0.1:' + srv.address().port + '/index.html'; }
  info('base ' + BASE);
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [name, fn] of Object.entries(TESTS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log('\n== ' + name + ' ==');
    try { await fn(); } catch (e) { check(name + ': test crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  }
  await browser.close();
  if (srv) srv.close();
  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length} passed, ${fail.length} failed`);
  if (fail.length) { console.log('FAILED:'); fail.forEach(f => console.log(' - ' + f.name)); }
  process.exit(fail.length ? 1 : 0);
})();
