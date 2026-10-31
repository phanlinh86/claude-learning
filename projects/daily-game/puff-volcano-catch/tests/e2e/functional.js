// Puff's Volcano Catch — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to file://<repo>/game/index.html (Chromium gets --allow-file-access-from-files)
//   --quick shortens the long bot run (15 s instead of 60 s)
// Prints PASS/FAIL per check, screenshots in tests/out/functional/, exits 1 on any FAIL.
// Adapted from projects/daily-game/penguin-candy-dash/tests/e2e/functional.js.
// Rule: tuning numbers are read from the live config (VC.debug.world.cfg / VC.DIFFICULTY), never hard-coded.
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
  await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode && VC.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => VC.debug.mode);
const ui = page => ev(page, () => VC.UI.current);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}
const errorsOk = (page, label) => check(label + ': no console errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));
const close = page => page._ctx.close();

/* Freeze sim time (speed 0); advance deterministically with simStep(). Real rAF frames still run applyMove + draw. */
const freeze = page => ev(page, () => VC.debug.setSpeed(0));
const simStep = (page, sec) => ev(page, sec => { const G = VC.Game; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) G.step(1 / 60); G.renderer.update(sec); }, sec);
const toPlaying = page => ev(page, () => { const G = VC.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; return i / 60; });

/* Stop eruptions, clear items, park Puff at x at rest. */
const isolate = (page, x) => ev(page, x => {
  const w = VC.debug.world; w.items.length = 0; w._nextLaunch = 1e9; w._rumbling = false; w._plan = null;
  const p = w.puff; p.x = p._px = x; p.vx = 0; p.ax = 0; p.swing = 0; p.swingV = 0; p.rimX = x; p.invuln = 0;
  w.setTarget(null); w.setMove(0); VC.Game.keys = {}; VC.Game.renderer.pointer = null; VC.Game.pointerDown = false; VC.Game._mouseFollow = false;
}, x);
/* Drop an item straight down onto logical x from just above the rim line (no eruption). */
const drop = (page, kind, metal, x) => ev(page, ({ kind, metal, x }) => {
  const w = VC.debug.world, c = w.cfg, y = c.rimY - 30;
  const it = { id: w._nextId++, kind, metal: kind === 'coin' ? metal : null, value: kind === 'coin' ? c.coinValue[metal] : 0,
    x, y, vx: 0, vy: 150, _px: x, _py: y, rot: 0, spin: 0, r: kind === 'coin' ? c.coinR[metal] : c.rockR, state: 'fly', t: 0, alpha: 1,
    tx: x, tCross: w.time + 0.2, apexY: y, fair: true, variant: 0, _w: 6, _bounces: 0, _off: 0 };
  w.items.push(it); return it.id;
}, { kind, metal, x });
const puff = page => ev(page, () => { const p = VC.debug.world.puff; return { x: p.x, vx: p.vx, rimX: p.rimX, frame: p.frame }; });
const toClient = (page, x, y) => ev(page, ({ x, y }) => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + x / 960 * r.width, y: r.top + y / 540 * r.height }; }, { x, y });

/* Log every event the world emits (wraps handleEvents). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = VC.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);
const clearLog = page => ev(page, () => { if (window._evLog) window._evLog.length = 0; });
const countStarts = page => ev(page, () => { window._starts = 0; if (!VC.Game._wrapped) { const o = VC.Game.startGame.bind(VC.Game); VC.Game.startGame = function () { window._starts++; return o(); }; VC.Game._wrapped = true; } });
const starts = page => ev(page, () => window._starts);

/* Lose the last heart (rock on the rim) and step until the game-over panel (sim time). */
const killToOver = (page, score) => ev(page, score => {
  const G = VC.Game, w = G.world; let i = 0;
  while (w.state !== 'playing' && i++ < 3000) G.step(1 / 60);
  if (score != null) w.score = score;
  w.items.length = 0; w._nextLaunch = 1e9; w._rumbling = false;
  w.hearts = 1; w.puff.invuln = 0;
  const c = w.cfg, x = w.puff.rimX, y = c.rimY - 30;
  w.items.push({ id: w._nextId++, kind: 'rock', metal: null, value: 0, x, y, vx: 0, vy: 150, _px: x, _py: y, rot: 0, spin: 0, r: c.rockR, state: 'fly', t: 0, alpha: 1, tx: x, tCross: w.time + .2, apexY: y, fair: true, variant: 0, _w: 3, _bounces: 0, _off: 0 });
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
    else if (kind === 'big') { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5a3a8a'); gr.addColorStop(1, '#5a3a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    else if (kind === 'bg') { g.fillStyle = '#5a3a8a'; g.fillRect(0, 0, w, h); }
    else {                                                   // transparent cut-out: magenta / cyan ellipse
      const col = { coin: '#00ffff', rock: '#ff00ff' }[kind] || '#ff00ff';
      g.clearRect(0, 0, w, h);
      g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.92));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }, { w, h, kind, fmt });
  return Buffer.from(arr, 'base64');
}
/* Real UI path: click "Choose…" on a slot, answer the file chooser (hidden #filePick). */
async function pickFile(page, slotId, file) {
  const idx = await ev(page, id => VC.Assets.SLOTS.findIndex(s => s.id === id), slotId);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const storedSize = (page, key) => ev(page, k => new Promise(res => { const d = VC.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight, d.length]); i.onerror = () => res(null); i.src = d; }), key);
async function waitToast(page, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await toastText(page); if (re.test(t)) return t; await page.waitForTimeout(100); }
  return await toastText(page);
}

/* Visible buttons of the current screen inside the viewport, panel not scrolling. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = VC.UI.current && document.getElementById(VC.UI.current);
    if (!scr) return { bad: ['no screen'], overflow: false, hidden: [] };
    const btns = [...scr.querySelectorAll('button, .set, .slot')].filter(b => b.offsetParent !== null);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5)
        bad.push((b.id || b.className || b.tagName) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
    let overflow = false; const hidden = [];
    if (panel) {
      overflow = panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1;
      const pr = panel.getBoundingClientRect();
      if (pr.top < -0.5 || pr.bottom > vh + 0.5 || pr.left < -0.5 || pr.right > vw + 0.5) bad.push('panel ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round).join(','));
      for (const b of btns) { const r = b.getBoundingClientRect(); if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) hidden.push(b.id || b.textContent.trim().slice(0, 20)); }
    }
    return { bad, overflow, hidden };
  });
}
/* Count canvas pixels in a logical rect matching a colour predicate (source string over r,g,b). */
const probe = (page, x, y, w, h, pred) => ev(page, ({ x, y, w, h, pred }) => {
  const c = document.getElementById('game'), g = c.getContext('2d'), k = c.width / 960;
  const X = Math.max(0, Math.round(x * k)), Y = Math.max(0, Math.round(y * k)), W = Math.round(w * k), H = Math.round(h * k);
  const d = g.getImageData(X, Y, W, H).data, f = new Function('r', 'g', 'b', 'return ' + pred);
  let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
  return n;
}, { x, y, w, h, pred });
async function startFrozen(page) {
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  return ev(page, () => VC.debug.world.cfg);
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
  check('boot: reaches title mode', (await mode(page)) === 'title');
  for (const [id, label] of [['btnPlay', 'Play'], ['btnCustomize', 'Change Pictures'], ['btnHow', 'How to Play'], ['btnSettings', 'Settings']]) {
    const txt = await ev(page, id => document.getElementById(id).textContent, id);
    check(`title: "${label}" button visible`, (await visible(page, '#' + id)) && txt.includes(label), txt.trim());
  }
  check('title: Quit hidden in browser mode', !(await visible(page, '#btnQuit')));
  check('title: HUD + 💧 hidden on title', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  check('title: best score line shown', /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: VC.debug.world.time, x: VC.debug.world.puff.x }));
  await page.waitForTimeout(2500);
  const t1 = await ev(page, () => ({ t: VC.debug.world.time, x: VC.debug.world.puff.x, p: VC.debug.weather.particles.length }));
  check('title: demo (bot Puff + weather) animates behind the menu', t1.t > t0.t + 1 && t1.p > 5, { t0, t1 });
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
  check('play: Play button starts a game (mode playing, HUD visible, no menu)', (await mode(page)) === 'playing' && (await visible(page, '#btnPause')) && (await ui(page)) === null);
  check('play: 💧 button hidden on a non-touch device', !(await visible(page, '#btnAction')));
  check('play: focus left the menu button (no stray focus)', await ev(page, () => !document.activeElement || document.activeElement === document.body));
  await page.waitForTimeout(800);
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
    const p = await puff(page);
    await page.keyboard.up(key); await page.waitForTimeout(50);
    check(`keys: ${key} moves Puff ${dir > 0 ? 'right' : 'left'} at ≤ maxSpeed`, (p.x - 480) * dir > 100 && Math.abs(p.vx) <= cfg.maxSpeed + 1, { x: Math.round(p.x), vx: Math.round(p.vx) });
    await simStep(page, 0.4);
    const q = await puff(page);
    check(`keys: Puff stops after releasing ${key}`, Math.abs(q.vx) < 1, { vx: q.vx });
  }
  await isolate(page, 480);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(30);
  await simStep(page, 4);
  const L = await puff(page);
  await page.keyboard.up('ArrowLeft');
  check('keys: Puff clamped at xMin', near(L.x, cfg.xMin, 0.5), L.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(30);
  await simStep(page, 5);
  const R = await puff(page);
  await page.keyboard.up('ArrowRight');
  check('keys: Puff clamped at xMax', near(R.x, cfg.xMax, 0.5), R.x);
  errorsOk(page, 'keyboard');
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
  let p = await puff(page);
  check('mouse: moving the mouse makes Puff follow horizontally', near(p.x, 200, 4), Math.round(p.x));
  const b = await toClient(page, 760, 120);
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.waitForTimeout(80);
  await simStep(page, 2);
  p = await puff(page);
  check('mouse: follows x only (y of the cursor irrelevant), arrives without big overshoot', near(p.x, 760, 4), Math.round(p.x));
  // track overshoot on a move
  await isolate(page, 200);
  const c = await toClient(page, 700, 400);
  await page.mouse.move(c.x - 5, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.waitForTimeout(80);
  const maxX = await ev(page, () => { const G = VC.Game; let m = 0; for (let i = 0; i < 180; i++) { G.step(1 / 60); m = Math.max(m, G.world.puff.x); } return m; });
  check('mouse: pointer-follow overshoot < 4 px', maxX - 700 < 4, Math.round(maxX - 700));
  // a plain left click on the canvas must NOT trigger rain
  await isolate(page, 480);
  const r0 = await ev(page, () => VC.debug.world.rains);
  const m = await toClient(page, 480, 300);
  await page.mouse.click(m.x, m.y); await page.waitForTimeout(60);
  check('mouse: left click on the playfield does not trigger Cool Rain', (await ev(page, () => VC.debug.world.rains)) === r0);
  // hovering the HUD pause button: does it steer Puff toward the corner?
  await isolate(page, 300);
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(m.x, m.y); await page.waitForTimeout(30);
  await isolate(page, 300);
  await page.mouse.move(pb.x, pb.y, { steps: 3 }); await page.waitForTimeout(80);
  await ev(page, () => { VC.Game.renderer.pointer = null; });   // forget the path; only the final hover matters
  await page.mouse.move(pb.x + 1, pb.y + 1); await page.waitForTimeout(60);
  await simStep(page, 1.5);
  p = await puff(page);
  check('mouse: hovering the HUD pause button does not drag Puff to the corner', Math.abs(p.x - 300) < 30, Math.round(p.x));
  // clicking pause must pause and not move Puff
  await isolate(page, 300);
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  check('mouse: click HUD pause → paused', (await mode(page)) === 'paused');
  const px = (await puff(page)).x;
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('mouse: Esc resumes from pause', (await mode(page)) === 'playing');
  check('mouse: HUD click did not move Puff', near(px, 300, 1), px);
  // mute button toggles and does not move Puff
  await isolate(page, 300);
  const mb = await ev(page, () => { const r = document.getElementById('btnMuteHud').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const mu0 = await ev(page, () => VC.Game.settings.muted);
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  const mu1 = await ev(page, () => VC.Game.settings.muted);
  check('mouse: HUD mute button toggles sound and keeps playing', mu1 === !mu0 && (await mode(page)) === 'playing');
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  errorsOk(page, 'pointer');
  await close(page);
}

async function testTouch() {
  const page = await newPage({ viewport: { width: 1024, height: 768 }, dsf: 2, touch: true, mobile: false });
  await boot(page, 'seed=5');
  check('touch: isTouch detected', await ev(page, () => VC.Game.isTouch));
  const cfg = await startFrozen(page);
  check('touch: 💧 action button visible during play', await visible(page, '#btnAction'));
  await isolate(page, 480);
  const a = await toClient(page, 220, 330);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]); await page.waitForTimeout(80);
  await simStep(page, 1.5);
  let p = await puff(page);
  check('touch: holding a finger makes Puff float to it', near(p.x, 220, 4), Math.round(p.x));
  const b = await toClient(page, 650, 330);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(80);
  await simStep(page, 1.5);
  p = await puff(page);
  check('touch: dragging the finger keeps following', near(p.x, 650, 4), Math.round(p.x));
  // second finger = Cool Rain
  const r0 = await ev(page, () => VC.debug.world.rains);
  const s = await toClient(page, 300, 200);
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 1 }, { x: s.x, y: s.y, id: 2 }]); await page.waitForTimeout(80);
  check('touch: second finger triggers Cool Rain', (await ev(page, () => VC.debug.world.rains)) === r0 + 1);
  // second finger wiggles a bit (a real tap is never perfectly still): Puff must keep following finger 1
  const s2 = await toClient(page, 310, 205);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }, { x: s2.x, y: s2.y, id: 2 }]); await page.waitForTimeout(80);
  await simStep(page, 1.0);
  p = await puff(page);
  check('touch: moving the 2nd (rain) finger does not steer Puff away from finger 1', near(p.x, 650, 10), Math.round(p.x));
  await touch(page, 'touchEnd', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.5);
  check('touch: lifting all fingers stops following', await ev(page, () => VC.Game.pointerDown === false && VC.debug.world._target === null));
  // 💧 button: no rain while not charged, rain when charged; never moves Puff
  await isolate(page, 400);
  const ab = await ev(page, () => { const r = document.getElementById('btnAction').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const st0 = await ev(page, () => ({ rains: VC.debug.world.rains, charge: VC.debug.world.rain.charge }));
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 3 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  const st1 = await ev(page, () => ({ rains: VC.debug.world.rains, charge: VC.debug.world.rain.charge }));
  check('touch: 💧 button does nothing while rain is recharging', st0.charge < 1 && st1.rains === st0.rains, { st0, st1 });
  await simStep(page, cfg.rainRecharge + cfg.rainTime + 0.5);
  await isolate(page, 400);
  const st2 = await ev(page, () => VC.debug.world.rains);
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 4 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.6);
  check('touch: 💧 button triggers Cool Rain when charged', (await ev(page, () => VC.debug.world.rains)) === st2 + 1);
  check('touch: 💧 tap did not move Puff', near((await puff(page)).x, 400, 2), (await puff(page)).x);
  // HUD pause by touch
  await simStep(page, cfg.rainRecharge + cfg.rainTime + 0.5);
  await isolate(page, 400);
  const rr0 = await ev(page, () => VC.debug.world.rains);
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(200);
  check('touch: tapping HUD pause pauses', (await mode(page)) === 'paused');
  const ph = await ev(page, () => ({ x: VC.debug.world.puff.x, rains: VC.debug.world.rains, ptr: VC.Game.renderer.pointer, down: VC.Game.pointerDown }));
  check('touch: HUD tap did not move Puff / trigger rain', near(ph.x, 400, 1) && ph.rains === rr0 && !ph.down, ph);
  await page.touchscreen.tap(...Object.values(await ev(page, () => { const r = document.getElementById('btnResume').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })));
  await page.waitForTimeout(150);
  check('touch: Resume button resumes', (await mode(page)) === 'playing');
  await shot(page, '06_touch_ipad');
  errorsOk(page, 'touch');
  await close(page);
}

async function testAction() {
  const page = await newPage();
  await boot(page, 'seed=5');
  const cfg = await startFrozen(page);
  const rains = () => ev(page, () => VC.debug.world.rains);
  const recharge = () => simStep(page, cfg.rainRecharge + cfg.rainTime + 0.3);
  await isolate(page, 480);
  let r0 = await rains();
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  check('rain: Space triggers Cool Rain when charged', (await rains()) === r0 + 1 && (await ev(page, () => VC.debug.world.rain.active > 0)));
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  check('rain: Space/Enter while raining/recharging do nothing', (await rains()) === r0 + 1);
  await simStep(page, cfg.rainTime + 1);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  check('rain: no rain while recharging', (await rains()) === r0 + 1);
  await recharge();
  for (const k of ['Enter', 'ShiftLeft']) {
    r0 = await rains();
    await page.keyboard.press(k); await page.waitForTimeout(50);
    check(`rain: ${k} triggers Cool Rain when charged`, (await rains()) === r0 + 1);
    await recharge();
  }
  r0 = await rains();
  const m = await toClient(page, 480, 300);
  await page.mouse.click(m.x, m.y, { button: 'right' }); await page.waitForTimeout(60);
  check('rain: right-click triggers Cool Rain', (await rains()) === r0 + 1);
  await recharge();
  // key repeat must not fire twice
  r0 = await rains();
  await page.keyboard.down('Space'); await page.waitForTimeout(600); await page.keyboard.up('Space');
  check('rain: holding Space fires once (auto-repeat ignored)', (await rains()) === r0 + 1);
  await recharge();
  // rain steams rocks above Puff
  await isolate(page, 480);
  await hookEvents(page); await clearLog(page);
  await ev(page, () => { const w = VC.debug.world, c = w.cfg; const y = 150, x = 480; w.items.push({ id: w._nextId++, kind: 'rock', metal: null, value: 0, x, y, vx: 0, vy: 0, _px: x, _py: y, rot: 0, spin: 0, r: c.rockR, state: 'fly', t: 0, alpha: 1, tx: x, tCross: w.time + 1, apexY: y, fair: true, variant: 0, _w: 3, _bounces: 0, _off: 0 }); });
  const sc0 = await ev(page, () => VC.debug.world.score);
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  await simStep(page, 0.1);
  const st = await evLog(page, 'steam');
  check('rain: rock above Puff turns to steam (+steamPoints)', st.length === 1 && st[0].points === cfg.steamPoints && (await ev(page, () => VC.debug.world.score)) === sc0 + cfg.steamPoints, st);
  // player input is ignored while paused / on title
  await recharge();
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  r0 = await rains();
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  check('rain: Space while paused does not trigger rain', (await rains()) === r0);
  if ((await mode(page)) === 'paused') await page.keyboard.press('Escape');
  errorsOk(page, 'action');
  await close(page);
}

async function testScoring() {
  const page = await newPage();
  await boot(page, 'seed=9');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  await isolate(page, 480);
  // single catches of each metal at ×1
  for (const metal of ['copper', 'silver', 'gold']) {
    await isolate(page, 480); await ev(page, () => { const w = VC.debug.world; w.combo = 0; w.mult = 1; });
    await clearLog(page);
    const s0 = await ev(page, () => VC.debug.world.score);
    await drop(page, 'coin', metal, 480); await simStep(page, 0.3);
    const c = await evLog(page, 'catch'), s1 = await ev(page, () => VC.debug.world.score);
    check(`score: ${metal} catch = value×10×1`, c.length === 1 && c[0].points === cfg.coinValue[metal] * cfg.coinPoints && s1 - s0 === c[0].points, c[0]);
  }
  // combo thresholds
  await ev(page, () => { const w = VC.debug.world; w.combo = 0; w.mult = 1; w.pouch = 0; w.pouchTarget = 999; });
  await clearLog(page);
  const seen = [];
  for (let i = 0; i < cfg.multThresholds[cfg.multThresholds.length - 1] + 2; i++) {
    await isolate(page, 480);
    await drop(page, 'coin', 'copper', 480);
    await simStep(page, 0.25);
  }
  const cs = await evLog(page, 'catch');
  let okMult = cs.length === cfg.multThresholds[cfg.multThresholds.length - 1] + 2;
  for (const e of cs) {
    let m = 1; for (let k = cfg.multThresholds.length - 1; k >= 0; k--) if (e.combo >= cfg.multThresholds[k]) { m = k + 1; break; }
    if (e.mult !== m || e.points !== e.value * cfg.coinPoints * m) { okMult = false; seen.push(e); }
  }
  check('score: multiplier follows combo thresholds ×1→×5 and points = value×10×mult', okMult, seen.slice(0, 3));
  const ups = (await evLog(page, 'multup')).map(e => e.mult);
  check('score: multup events at ×2..×5 exactly once each', JSON.stringify(ups) === '[2,3,4,5]', ups);
  // a miss resets the combo
  await clearLog(page);
  await isolate(page, 200);
  await drop(page, 'coin', 'silver', 800); await simStep(page, 1.2);
  const w1 = await ev(page, () => ({ combo: VC.debug.world.combo, mult: VC.debug.world.mult, hearts: VC.debug.world.hearts }));
  const ms = await evLog(page, 'miss');
  check('score: coin landing on the sand → miss, combo 0, ×1, no heart lost', ms.length === 1 && w1.combo === 0 && w1.mult === 1 && w1.hearts === cfg.heartsMax, { ms, w1 });
  // rock caught costs a heart and the combo
  await ev(page, () => { const w = VC.debug.world; w.combo = 7; w.mult = 2; });
  await clearLog(page); await isolate(page, 480);
  await drop(page, 'rock', null, 480); await simStep(page, 0.3);
  const w2 = await ev(page, () => ({ combo: VC.debug.world.combo, mult: VC.debug.world.mult, hearts: VC.debug.world.hearts, inv: VC.debug.world.puff.invuln }));
  check('score: catching a rock → −1 heart, combo 0, invulnerable', (await evLog(page, 'ouch')).length === 1 && w2.hearts === cfg.heartsMax - 1 && w2.combo === 0 && w2.mult === 1 && w2.inv > 0, w2);
  await clearLog(page);
  await drop(page, 'rock', null, await ev(page, () => VC.debug.world.puff.rimX)); await simStep(page, 0.3);
  check('score: rock caught while blinking fizzles harmlessly', (await evLog(page, 'ouch')).length === 0 && (await ev(page, () => VC.debug.world.hearts)) === cfg.heartsMax - 1);
  // HUD shows score
  await page.waitForTimeout(100);
  await shot(page, '07_scoring_hud');
  // pouch full → zone change
  await clearLog(page); await isolate(page, 480);
  await ev(page, () => { const w = VC.debug.world; w.pouchTarget = w.levelInfo(w.level).pouchTarget; w.pouch = w.pouchTarget - 1; });
  const before = await ev(page, () => ({ score: VC.debug.world.score, hearts: VC.debug.world.hearts }));
  await drop(page, 'coin', 'copper', 480); await simStep(page, 0.3);
  const cl = await evLog(page, 'cleared');
  check('zone: pouch full → pouchfull + cleared, bonus = hearts×100', (await evLog(page, 'pouchfull')).length === 1 && cl.length === 1 && cl[0].bonus === before.hearts * cfg.clearBonusPerHeart, cl);
  check('zone: state is cleared', (await ev(page, () => VC.debug.world.state)) === 'cleared');
  await ev(page, () => { const G = VC.Game; let i = 0; while (G.world.level === 0 && i++ < 600) G.step(1 / 60); });
  const z = await evLog(page, 'zone');
  const st = await ev(page, () => ({ level: VC.debug.world.level, zone: VC.debug.world.zone, wz: VC.debug.weather.zone, az: VC.Audio.season, rv: VC.Game.renderer.vis.cur, banner: VC.Game.renderer.banner && VC.Game.renderer.banner.s, pouch: VC.debug.world.pouch }));
  check('zone: next level starts (zone event 1) with an empty pouch', z.length === 1 && z[0].zone === 1 && st.level === 1 && st.pouch === 0, { z, st });
  check('zone: weather, music and renderer switch to the new zone; banner shown', st.wz === 1 && st.az === 1 && st.rv === 1 && st.banner === 1, st);
  await ev(page, () => { VC.Game.renderer.update(0.5); });
  await page.waitForTimeout(150);
  await shot(page, '08_zone_banner');
  errorsOk(page, 'scoring');
  await close(page);
}

async function testPause() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t0 = await ev(page, () => VC.debug.world.time);
    await page.waitForTimeout(500);
    const t1 = await ev(page, () => VC.debug.world.time);
    check(`pause: ${key} pauses and freezes world time`, (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause' && t1 === t0 && !(await visible(page, '#btnPause')));
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t2 = await ev(page, () => VC.debug.world.time);
    await page.waitForTimeout(300);
    check(`pause: ${key} resumes; time runs, no big jump`, (await mode(page)) === 'playing' && (await ev(page, () => VC.debug.world.time)) > t2 && t2 - t1 < 0.3);
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
  // auto-pause on blur
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur auto-pauses', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  check('pause: tab hidden auto-pauses', (await mode(page)) === 'paused');
  await ev(page, () => { delete document.hidden; });
  // blur while keys are held must clear them
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(50);
  await ev(page, () => window.dispatchEvent(new Event('blur')));
  await page.click('#btnResume'); await page.waitForTimeout(100);
  check('pause: held keys are cleared by blur (no stuck movement after resume)', await ev(page, () => Object.keys(VC.Game.keys).length === 0));
  await page.keyboard.up('ArrowRight');
  // Restart / Main Menu
  await countStarts(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnRestart'); await page.waitForTimeout(150);
  check('pause: Restart starts a fresh run', (await mode(page)) === 'playing' && (await starts(page)) === 1 && (await ev(page, () => VC.debug.world.score)) === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseMenu'); await page.waitForTimeout(150);
  check('pause: Main Menu returns to the title', (await mode(page)) === 'title' && (await ui(page)) === 'scrTitle' && !(await visible(page, '#btnPause')));
  // pause impossible when dead
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { const w = VC.debug.world; w.hearts = 0; w.state = 'dead'; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  check('pause: no pause while the death animation plays', (await mode(page)) === 'playing');
  errorsOk(page, 'pause');
  await close(page);
}

async function testGameOver() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => { VC.Game.resetBest(); });
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page);
  const m = await killToOver(page, 1234);
  await page.waitForTimeout(200);
  check('over: losing the last heart → game over screen', m === 'over' && (await ui(page)) === 'scrOver');
  const o = await ev(page, () => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: VC.Storage.get('best_normal') }));
  check('over: score + NEW best shown and saved as best_normal', o.score === '1234' && o.best === '1234' && o.nb && o.stored === '1234', o);
  check('over: HUD and 💧 hidden', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  await shot(page, '10_over');
  // restart lock: Enter spam
  await countStarts(page);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(40); }
  const early = await starts(page);
  check('over: Enter spam in the first 0.7 s does not restart', early === 0 && (await mode(page)) === 'over', early);
  await page.waitForTimeout(700);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  check('over: Enter spam after the lock starts exactly ONE new game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  // second run lower score → best unchanged, no NEW
  await freeze(page);
  await killToOver(page, 50);
  await page.waitForTimeout(150);
  const o2 = await ev(page, () => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: VC.Storage.get('best_normal') }));
  check('over: lower score keeps the best, no NEW badge', o2.best === '1234' && !o2.nb && o2.stored === '1234', o2);
  // Space restart & click spam
  await countStarts(page);
  await page.waitForTimeout(750);
  await page.click('#btnAgain', { clickCount: 1 }); await page.click('#btnAgain', { force: true }).catch(() => {});
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
  await page.waitForTimeout(200);
  await page.click('#btnOverMenu'); await page.waitForTimeout(200);
  check('over: Menu returns to title with best 1234', (await ui(page)) === 'scrTitle' && (await ev(page, () => document.getElementById('bestTitle').textContent)) === '1234');
  // best per difficulty
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('best: title shows the Easy best (0) after switching to Easy', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '0');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page);
  check('best: Easy run uses Easy hearts', (await ev(page, () => VC.debug.world.heartsMax)) === (await ev(page, () => VC.DIFFICULTY.easy.heartsMax)));
  await killToOver(page, 777);
  await page.waitForTimeout(200);
  const bs = await ev(page, () => ({ e: VC.Storage.get('best_easy'), n: VC.Storage.get('best_normal') }));
  check('best: Easy best saved separately from Normal', bs.e === '777' && bs.n === '1234', bs);
  // difficulty changed mid-run: best belongs to the run's difficulty
  await page.click('#btnOverMenu'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings'); await page.click('#setDifficulty button[data-v=hard]'); await page.click('#scrSettings .btn-back'); await page.click('#btnResume');
  await freeze(page);
  await killToOver(page, 900);
  await page.waitForTimeout(150);
  const bs2 = await ev(page, () => ({ e: VC.Storage.get('best_easy'), h: VC.Storage.get('best_hard') }));
  check('best: switching difficulty mid-run credits the run\'s difficulty (Easy)', bs2.e === '900' && !bs2.h, bs2);
  await ev(page, () => VC.Game.setSetting('difficulty', 'normal'));
  errorsOk(page, 'game over');
  await close(page);
}

async function testSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await newPage({}, ctx);
  await boot(page, 'seed=5', false);
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  const s0 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked }));
  check('settings: defaults sfx + music on', s0.sfx && s0.music, s0);
  await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)');
  await page.click('#setDifficulty button[data-v=hard]');
  await page.waitForTimeout(100);
  const a = await ev(page, () => ({ s: VC.Game.settings, aud: { sfx: VC.Audio.sfxOn, music: VC.Audio.musicOn } }));
  check('settings: toggles change game + audio state', !a.s.sfx && !a.s.music && a.s.difficulty === 'hard' && !a.aud.sfx && !a.aud.music, a);
  check('settings: difficulty segment highlights Hard', await ev(page, () => document.querySelector('#setDifficulty button.on').dataset.v === 'hard'));
  await page.click('#scrSettings .btn-back');
  await page.reload();
  await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode === 'title');
  const b = await ev(page, () => VC.Game.settings);
  check('settings: sfx/music/difficulty persist across reload', !b.sfx && !b.music && b.difficulty === 'hard', b);
  await page.click('#btnSettings'); await page.waitForTimeout(100);
  const ui1 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, d: document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: UI reflects the saved values after reload', !ui1.sfx && !ui1.music && ui1.d === 'hard', ui1);
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const hard = await ev(page, () => ({ cfg: { hm: VC.debug.world.cfg.heartsMax, rr: VC.debug.world.cfg.rainRecharge }, D: VC.DIFFICULTY.hard }));
  check('settings: Hard difficulty applied to the new world', hard.cfg.rr === (hard.D.rainRecharge != null ? hard.D.rainRecharge : hard.cfg.rr) && (hard.D.heartsMax == null || hard.cfg.hm === hard.D.heartsMax), hard);
  // M key mute toggles and persists
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M mutes (saved)', await ev(page, () => VC.Game.settings.muted && JSON.parse(VC.Storage.get('settings')).muted === true && VC.Audio.muted));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M again unmutes', await ev(page, () => !VC.Game.settings.muted && !VC.Audio.muted));
  // ?mute=1 never saved
  await page.goto(url('seed=5', true));
  await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode === 'title');
  const mu = await ev(page, () => ({ audio: VC.Audio.muted, saved: JSON.parse(VC.Storage.get('settings') || '{}').muted, setting: VC.Game.settings.muted }));
  check('settings: ?mute=1 mutes audio but is never written to storage', mu.audio === true && !mu.saved && !mu.setting, mu);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.waitForTimeout(80);
  check('settings: changing another setting with ?mute=1 still does not save muted', await ev(page, () => !JSON.parse(VC.Storage.get('settings')).muted));
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const icon = await ev(page, () => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6'));
  check('settings: with ?mute=1 the HUD sound icon shows "muted"', icon);
  // Reset best
  await page.keyboard.press('Escape');
  await ev(page, () => { VC.Storage.set('best_normal', '55'); VC.Storage.set('best_easy', '66'); });
  await page.click('#btnPauseSettings'); await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('settings: Reset best clears every difficulty', await ev(page, () => !VC.Storage.get('best_normal') && !VC.Storage.get('best_easy') && !VC.Storage.get('best_hard')));
  check('settings: Reset best shows a toast', /cleared/i.test(await toastText(page)));
  await ev(page, () => { VC.Game.setSetting('sfx', true); VC.Game.setSetting('music', true); VC.Game.setSetting('difficulty', 'normal'); });
  errorsOk(page, 'settings');
  await ctx.close();
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5');
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  check('custom: 7 slots shown (hero, coin, rock, 4 zones)', (await page.locator('#slotGrid .slot').count()) === 7);
  // opaque JPEG photo → hero, round sticker
  const photo = await makeImage(page, 900, 700, 'photo', 'image/jpeg');
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  let t = await waitToast(page, /saved/i);
  check('custom: photo for Puff saved (toast)', /saved/i.test(t), t);
  const hs = await storedSize(page, 'img_hero');
  check('custom: hero picture downscaled to ≤ 512 px', hs && hs[0] <= 512 && hs[1] <= 512, hs);
  check('custom: opaque photo becomes a round sticker', (await ev(page, () => VC.Storage.get('shape_hero'))) === 'circle');
  check('custom: card shows "Your picture" + Round selected', await ev(page, () => { const s = document.querySelectorAll('#slotGrid .slot')[0]; return /Your picture/.test(s.textContent) && s.querySelector('.shape button.on').dataset.shape === 'circle'; }));
  const circ = await ev(page, () => { const c = VC.Assets.custom.hero; const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return { w: c.width, h: c.height, cornerA: d[3] }; });
  check('custom: round sticker has transparent corners', circ.w === circ.h && circ.cornerA === 0, circ);
  // transparent PNG → coin, whole picture
  const cut = await makeImage(page, 300, 300, 'coin', 'image/png');
  await pickFile(page, 'coin', { name: 'coin.png', mimeType: 'image/png', buffer: cut });
  t = await waitToast(page, /saved/i);
  check('custom: transparent PNG for the coin keeps "Whole picture"', /saved/i.test(t) && (await ev(page, () => VC.Storage.get('shape_coin'))) === 'fit', t);
  const rockImg = await makeImage(page, 200, 160, 'rock', 'image/png');
  await pickFile(page, 'rock', { name: 'rock.png', mimeType: 'image/png', buffer: rockImg });
  await waitToast(page, /saved/i);
  // shape toggle
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=circle]').click();
  check('custom: Round/Whole toggle switches the shape', (await ev(page, () => VC.Storage.get('shape_coin'))) === 'circle');
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=fit]').click();
  // non-image file → friendly error
  await pickFile(page, 'rock', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(page, /picture/i, 3000);
  check('custom: non-image file → friendly error, previous picture kept', /choose a picture/i.test(t) && (await ev(page, () => !!VC.Storage.get('img_rock'))), t);
  await pickFile(page, 'rock', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(page, /could not/i, 4000);
  check('custom: corrupt image → friendly "could not be opened" error', /could not/i.test(t), t);
  // huge background
  const huge = await makeImage(page, 5000, 4000, 'big', 'image/jpeg');
  info('huge image bytes: ' + huge.length);
  const tH = Date.now();
  await pickFile(page, 'bg_beach', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
  t = await waitToast(page, /saved|room|could/i, 15000);
  const bs = await storedSize(page, 'img_bg_beach');
  check('custom: 5000×4000 background accepted and downscaled to ≤ 1280×720', /saved/i.test(t) && bs && bs[0] <= 1280 && bs[1] <= 720, { t, bs, ms: Date.now() - tH });
  await shot(page, '11_custom_cards');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  // play with all custom pictures
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page); await toPlaying(page);
  await isolate(page, 480);
  await drop(page, 'coin', 'gold', 300); await drop(page, 'rock', null, 650);
  await ev(page, () => { for (const it of VC.debug.world.items) { it.y = it._py = 300; it.vy = 0; } });
  await page.waitForTimeout(250);
  const blueHero = await probe(page, 430, 350, 100, 90, 'b > 150 && r < 60 && g < 60');
  const cyanCoin = await probe(page, 280, 280, 40, 40, 'g > 200 && b > 200 && r < 80');
  const magRock = await probe(page, 630, 280, 40, 40, 'r > 180 && b > 180 && g < 90');
  const purpleBg = await probe(page, 20, 80, 120, 80, 'Math.abs(r - 0x5a * 0.75 - 255*0.25*0.98) < 30 && b > g + 20');
  check('custom: custom Puff (blue photo) is drawn in play', blueHero > 200, blueHero);
  check('custom: custom coin is drawn in play', cyanCoin > 50, cyanCoin);
  check('custom: custom rock is drawn in play', magRock > 50, magRock);
  check('custom: custom beach background is drawn (purple sky area)', purpleBg > 500, purpleBg);
  await shot(page, '12_custom_play');
  // the custom pictures survive a zone change and the jungle stays default
  await ev(page, () => { VC.debug.gotoLevel(1); }); await simStep(page, 2);
  await page.waitForTimeout(150);
  await ev(page, () => VC.debug.setSpeed(4)); await page.waitForTimeout(1500); await freeze(page);
  errorsOk(page, 'custom play');
  // reset one / reset all
  await page.keyboard.press('Escape'); await page.click('#btnPauseMenu'); await page.waitForTimeout(100);
  await page.click('#btnCustomize'); await page.waitForTimeout(100);
  await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await page.waitForTimeout(100);
  check('custom: Reset on Puff removes only Puff', await ev(page, () => !VC.Assets.hasCustom('hero') && !VC.Storage.get('img_hero') && VC.Assets.hasCustom('coin') && VC.Assets.hasCustom('rock')));
  await page.click('#btnResetAll'); await page.waitForTimeout(100);
  check('custom: Reset all removes every custom picture (memory + storage)', await ev(page, () => VC.Assets.SLOTS.every(s => !VC.Assets.hasCustom(s.id) && !VC.Storage.get('img_' + s.id) && !VC.Storage.get('shape_' + s.id))));
  check('custom: cards back to "Original"', await ev(page, () => [...document.querySelectorAll('#slotGrid .slot .tag')].every(t => /Original/.test(t.textContent))));
  // persistence across reload
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await waitToast(page, /saved/i);
  await page.reload(); await page.waitForFunction(() => window.VC && VC.debug && VC.debug.mode === 'title');
  check('custom: custom picture reloads after a page reload', await ev(page, () => VC.Assets.hasCustom('hero')));
  await ev(page, () => VC.Assets.SLOTS.forEach(s => VC.Assets.clearCustom(s.id)));
  errorsOk(page, 'custom');
  await ctx.close();
}

async function testLayout() {
  const vps = [
    [1280, 720, 1, false], [1280, 720, 2, false], [1920, 1080, 1, false], [800, 600, 1, false],
    [1024, 768, 1, true], [1024, 768, 2, true], [844, 390, 2, true], [844, 390, 3, true], [390, 844, 3, true]
  ];
  for (const [w, h, dsf, touchDev] of vps) {
    const page = await newPage({ viewport: { width: w, height: h }, dsf, touch: touchDev, mobile: touchDev });
    await boot(page, 'seed=5');
    const tag = `${w}x${h}@${dsf}${touchDev ? ' touch' : ''}`;
    const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, bw: c.width, bh: c.height, vw: innerWidth, vh: innerHeight }; });
    // mobile layout: inside the aspect clamps the canvas fills the whole window (no bars), centred otherwise
    const fills = near(cv.w, cv.vw, 2) && near(cv.h, cv.vh, 2);
    const centered = near(cv.l, (cv.vw - cv.w) / 2, 1.5) && near(cv.t, (cv.vh - cv.h) / 2, 1.5);
    check(`layout ${tag}: canvas fills the window`, fills && centered, cv);
    const capPx = touchDev ? 3.3e6 : 1920 * 1080 + 4000;
    check(`layout ${tag}: backing store within the pixel cap (touch 3.2 MP, desktop 1920×1080)`, cv.bw * cv.bh <= capPx, [cv.bw, cv.bh]);
    const issues = [];
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      await ev(page, s => VC.UI.show(s), scr); await page.waitForTimeout(400);
      const r = await layoutReport(page);
      if (r.bad.length || r.overflow || r.hidden.length) issues.push(scr + ': ' + JSON.stringify(r));
      if (w < 900 || (w === 1024 && dsf === 2)) await shot(page, `13_layout_${w}x${h}_${dsf}_${scr}`);
    }
    await ev(page, () => VC.UI.show('scrTitle'));
    await page.click('#btnPlay'); await page.waitForTimeout(250);
    await freeze(page);
    await ev(page, () => VC.Game.pause()); await page.waitForTimeout(400);
    let r = await layoutReport(page); if (r.bad.length || r.overflow || r.hidden.length) issues.push('scrPause: ' + JSON.stringify(r));
    await ev(page, () => VC.Game.resume());
    await freeze(page); await killToOver(page, 4321); await page.waitForTimeout(500);
    r = await layoutReport(page); if (r.bad.length || r.overflow || r.hidden.length) issues.push('scrOver: ' + JSON.stringify(r));
    if (w < 900 || (w === 1024 && dsf === 2)) await shot(page, `13_layout_${w}x${h}_${dsf}_scrOver`);
    check(`layout ${tag}: every menu fits inside the window (no clipped / scrolled-away buttons)`, issues.length === 0, issues.join(' | '));
    // HUD in play
    await ev(page, () => VC.Game.startGame()); await page.waitForTimeout(250);
    const hud = await ev(page, () => {
      const c = document.getElementById('game').getBoundingClientRect(), k = VC.Game.renderer.VW / c.width;
      const rs = ['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect());
      const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
      return { l: (l - c.left) * k, t: (t - c.top) * k, r: (rr - c.left) * k, b: (b - c.top) * k, minPx: Math.min(...rs.map(r => r.width)) };
    });
    // the pouch is laid out from the buttons' measured position (left of them, or a second row under them)
    const VW = await ev(page, () => VC.Game.renderer.VW);
    check(`layout ${tag}: HUD buttons inside the canvas`, hud.l >= 0 && hud.t >= 0 && hud.r <= VW + 1, hud);
    if (touchDev) check(`layout ${tag}: HUD buttons ≥ 32 css px (finger-sized)`, hud.minPx >= 32, hud.minPx);
    if (touchDev) {
      const a = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), e = document.getElementById('btnAction'), r = e.getBoundingClientRect(); return { vis: !e.classList.contains('hidden') && r.width > 0, inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, side: r.left >= c.right - 1 && r.right <= innerWidth + 1, w: r.width }; });
      check(`layout ${tag}: 💧 shown, inside the canvas or in the side bar (never over the play area), ≥ 44 px`, a.vis && (a.inside || a.side) && a.w >= 44, a);
    } else check(`layout ${tag}: 💧 hidden on non-touch`, !(await visible(page, '#btnAction')));
    if (w < 900 || w === 1920) { await page.waitForTimeout(1500); await shot(page, `14_layout_${w}x${h}_${dsf}_game`); }
    check(`layout ${tag}: no horizontal/vertical page scroll`, await ev(page, () => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
    errorsOk(page, `layout ${tag}`);
    await close(page);
  }
  // live resize
  const page = await newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(400);
  const cv = await ev(page, () => { const r = document.getElementById('game').getBoundingClientRect(); const h = document.getElementById('btnPause').getBoundingClientRect(); return { w: r.width, h: r.height, t: r.top, hudR: h.right, cR: r.right, hudT: h.top }; });
  check('layout: live resize re-letterboxes and re-anchors the HUD to the canvas', near(cv.w, 900, 2) && cv.hudR <= cv.cR + 1 && cv.hudT >= cv.t - 1, cv);
  errorsOk(page, 'resize');
  await close(page);
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await countStarts(page);
  await page.click('#btnHow'); await page.click('#scrHow .btn-back'); await page.waitForTimeout(120);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on the title starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  const r0 = await ev(page, () => VC.debug.world.rains);
  await freeze(page); await toPlaying(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: next Space in play is Cool Rain, not a menu button', (await mode(page)) === 'playing' && (await ev(page, () => VC.debug.world.rains)) === r0 + 1 && (await starts(page)) === 1);
  // title → Enter on focused Play → one start
  await ev(page, () => VC.Game.toTitle()); await page.waitForTimeout(150);
  await countStarts(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('focus: Enter on the title (Play focused) starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page);
  const r1 = await ev(page, () => VC.debug.world.rains);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter right after start = Cool Rain only (no re-click of Play)', (await ev(page, () => VC.debug.world.rains)) === r1 + 1 && (await starts(page)) === 1);
  // mouse click on Settings → difficulty → Done → Space on title starts once
  await ev(page, () => VC.Game.toTitle()); await page.waitForTimeout(100);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=normal]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(100);
  await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: after Settings, Space on the title starts once', (await starts(page)) === 1);
  // pause: Space on a focused Resume resumes once and does not also fire rain
  await freeze(page); await toPlaying(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const r2 = await ev(page, () => VC.debug.world.rains);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: Space on Pause resumes and does not trigger rain at the same time', (await mode(page)) === 'playing' && (await ev(page, () => VC.debug.world.rains)) === r2);
  // Pause via HUD click, then Enter: resume once (not resume + rain)
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  const r3 = await ev(page, () => VC.debug.world.rains);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on Pause resumes once without also raining', (await mode(page)) === 'playing' && (await ev(page, () => VC.debug.world.rains)) === r3);
  errorsOk(page, 'focus');
  await close(page);
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'speed=16&bot=1&autorestart=1&autostart=1&seed=3');
  const samples = []; let maxFx = 0, maxP = 0, maxItems = 0, maxTexts = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await page.waitForTimeout(1000);
    const s = await ev(page, () => Object.assign(VC.debug.getState() || {}, { texts: VC.Game.renderer.texts.length, games: VC.debug.stats.games }));
    samples.push(s);
    maxFx = Math.max(maxFx, s.fx); maxP = Math.max(maxP, s.particles); maxItems = Math.max(maxItems, s.items); maxTexts = Math.max(maxTexts, s.texts);
  }
  const st = await ev(page, () => VC.debug.stats);
  info(`long run ${LONG_RUN_S}s: games ${st.games}, scores ${JSON.stringify(st.scores.slice(0, 8))}, levels ${JSON.stringify(st.levels.slice(0, 8))}, maxFx ${maxFx}, maxParticles ${maxP}, maxItems ${maxItems}, maxTexts ${maxTexts}`);
  check('long run: no runtime errors (stats.errors)', st.errors.length === 0, st.errors.slice(0, 2));
  check('long run: at least one game finished and auto-restarted', st.games >= 1 && (await mode(page)) !== 'over', st.games);
  check('long run: weather particles bounded (< 160)', maxP < 160, maxP);
  check('long run: fx bounded (≤ 400)', maxFx <= 400, maxFx);
  check('long run: items and texts bounded', maxItems < 40 && maxTexts < 40, { maxItems, maxTexts });
  check('long run: world time advanced ~16× real time', samples.length > 3 && samples[samples.length - 1].time > 0, samples[samples.length - 1]);
  await shot(page, '15_long_run');
  errorsOk(page, 'long run');
  await close(page);
}

/* =============================== MAIN =============================== */
const TESTS = { boot: testBootAndScreens, keyboard: testKeyboard, pointer: testPointer, touch: testTouch, action: testAction, scoring: testScoring,
  pause: testPause, over: testGameOver, settings: testSettings, custom: testCustomPictures, layout: testLayout, focus: testFocus, long: testLongRun };

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
  if (fail.length) { console.log('FAILED:'); fail.forEach(f => console.log(' - ' + f.name)); }
  process.exit(fail.length ? 1 : 0);
})();
