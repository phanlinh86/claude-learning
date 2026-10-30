// Pip's Candy Dash — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to http://127.0.0.1:8801/index.html  (serve game/ with: python3 -m http.server 8801)
//   --quick shortens the long bot run (20 s instead of 120 s)
// Prints PASS/FAIL per check, writes screenshots to tests/out/functional/, exits 1 on any FAIL.
// Structure and helpers reused from projects/daily-game/foxy-reef-memory/tests/e2e/functional.js.
// Rule: every tuning number is read from the live config (CD.debug.world.cfg / CD.DIFFICULTY), never hard-coded.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8801/index.html';
const QUICK = args.includes('--quick');
const LONG_RUN_S = QUICK ? 20 : 120;
const OUT = path.join(__dirname, '..', 'out', 'functional');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function info(msg) { console.log('     ' + msg); }
const url = q => BASE + (BASE.includes('?') ? '&' : '?') + 'mute=1' + (q ? '&' + q : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

let browser;

async function newPage(opts = {}, ctxIn) {
  const ctx = ctxIn || await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dsf || 1, hasTouch: !!opts.touch });
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console.error: ' + m.text()); });
  page._ctx = ctx;
  return page;
}
async function boot(page, q) {
  await page.goto(url(q));
  await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode && CD.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => CD.debug.mode);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}
const errorsOk = (page, label) => check(label + ': no errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));

/* Freeze sim time (speed 0); advance deterministically with simStep(). Real rAF frames still run applyMove + draw. */
const freeze = page => ev(page, () => CD.debug.setSpeed(0));
const unfreeze = (page, s = 1) => ev(page, s => CD.debug.setSpeed(s), s);
const simStep = (page, sec) => ev(page, sec => { const G = CD.Game; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) G.step(1 / 60); G.renderer.update(sec); }, sec);
const toPlaying = page => ev(page, () => { const G = CD.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; return i / 60; });
const stepUntil = (page, src, max = 10) => ev(page, ({ src, max }) => { const G = CD.Game; const f = new Function('w', 'G', 'return (' + src + ')'); let i = 0; while (!f(G.world, G) && i++ < max * 60) G.step(1 / 60); G.renderer.update(1 / 60); return i / 60; }, { src, max });

/* Remove bears + gems, stop gem spawns, park Pip at (x,y) at rest. */
const isolate = (page, x, y) => ev(page, ({ x, y }) => {
  const w = CD.debug.world; w.bears.length = 0; w.gems.length = 0; w.gemsWanted = 0;
  const p = w.pip; p.x = p._px = x; p.y = p._py = y; p.vx = p.vy = 0; p.invuln = 0; p.dashT = 0; p.dashCd = 0; p.sliding = false; p.hurt = 0; p.z = 0; p._vz = 0;
  w.setTarget(null); w.setMove(0, 0); CD.Game.keys = {};
}, { x, y });
const placeBear = (page, kind, x, y) => ev(page, ({ kind, x, y }) => {
  const w = CD.debug.world, b = w._spawnBear(kind, 0);
  b.x = b._px = x; b.y = b._py = y; b.spawnT = 1; b.stun = 0; b.rest = 0; b.vx = b.vy = 0; b._kb = 0; return b.id;
}, { kind, x, y });
const placeGem = (page, x, y) => ev(page, ({ x, y }) => {
  const w = CD.debug.world, g = w._spawnGem(); g.x = g._px = x; g.y = g._py = y; g.appear = 1; g.life = 99; return g.id;
}, { x, y });
const pipInfo = page => ev(page, () => { const p = CD.debug.world.pip; return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, sp: Math.hypot(p.vx, p.vy), frame: p.frame, onIce: p.onIce, inSlow: p.inSlow, inPuff: p.inPuff, z: p.z, invuln: p.invuln }; });
/* Logical → client coords. */
const toClient = (page, x, y) => ev(page, ({ x, y }) => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + x / 960 * r.width, y: r.top + y / 540 * r.height }; }, { x, y });

/* Log every event the world emits (wraps handleEvents). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = CD.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);
const clearLog = page => ev(page, () => { if (window._evLog) window._evLog.length = 0; });
const countStarts = page => ev(page, () => { window._starts = 0; if (!CD.Game._wrapped) { const o = CD.Game.startGame.bind(CD.Game); CD.Game.startGame = function () { window._starts++; return o(); }; CD.Game._wrapped = true; } });

/* Lose the last heart (bear on Pip) and step until the game-over panel (sim time). Returns mode. */
const killToOver = (page, score) => ev(page, score => {
  const G = CD.Game, w = G.world; let i = 0;
  while (w.state !== 'playing' && i++ < 3000) G.step(1 / 60);
  if (score != null) w.score = score;
  w.hearts = 1; w.pip.invuln = 0; w.pip.dashT = 0;
  const b = w.bears[0] || w._spawnBear('red', 0);
  b.x = b._px = w.pip.x + 3; b.y = b._py = w.pip.y; b.spawnT = 1; b.stun = 0; b.rest = 0;
  i = 0; while (G.mode === 'playing' && i++ < 600) G.step(1 / 60);
  return G.mode;
}, score);
const toastText = page => ev(page, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });

/* Create an image file inside the page: canvas → Blob → bytes. */
async function makeImage(page, w, h, kind, fmt = 'image/png') {
  const arr = await ev(page, async ({ w, h, kind, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (kind === 'noise') {
      const d = g.createImageData(w, h);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    } else if (kind === 'photo') {                           // big opaque "photo" that still compresses well
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#20c040'); gr.addColorStop(1, '#e02020'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else if (kind === 'blue') { g.fillStyle = '#0000ff'; g.fillRect(0, 0, w, h); }       // opaque "photo"
    else if (kind === 'bg') { g.fillStyle = '#5a3a8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2a6a'; for (let i = 0; i < 12; i++) g.fillRect(i * w / 12, h * 0.6, w / 24, h * 0.4); }
    else {                                                   // transparent cut-out: coloured ellipse with an eye
      const col = { hero: '#ff00ff', gem: '#00ffff' }[kind] || '#888';
      g.clearRect(0, 0, w, h);
      g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.62, h * 0.4, Math.min(w, h) * 0.1, 0, Math.PI * 2); g.fill();
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.95));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }, { w, h, kind, fmt });
  return Buffer.from(arr, 'base64');
}
/* Real UI path: click "Choose…" on a slot, answer the file chooser (hidden #filePick). */
async function pickFile(page, slotId, file) {
  const idx = await ev(page, id => CD.Assets.SLOTS.findIndex(s => s.id === id), slotId);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
/* Natural size of a stored data URL. */
const storedSize = (page, key) => ev(page, k => new Promise(res => { const d = CD.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight, d.length]); i.onerror = () => res(null); i.src = d; }), key);

/* All visible buttons of the current screen inside the viewport and not scrolled away. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = CD.UI.current && document.getElementById(CD.UI.current);
    if (!scr) return { bad: ['no screen'], overflow: false, hidden: [] };
    const btns = [...scr.querySelectorAll('button, .set, .slot')].filter(b => b.offsetParent !== null);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5)
        bad.push((b.id || b.className || b.tagName) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    const panel = scr.querySelector('.panel');
    let overflow = false; const hidden = [];
    if (panel) {
      overflow = panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1;
      const pr = panel.getBoundingClientRect();
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
/* Start a game (frozen), skip the intro, return cfg. */
async function startFrozen(page) {
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  return ev(page, () => CD.debug.world.cfg);
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
  check('title: HUD + ★ hidden on title', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  check('title: best score line shown', /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: CD.debug.world.time, x: CD.debug.world.pip.x }));
  await page.waitForTimeout(1500);
  const t1 = await ev(page, () => ({ t: CD.debug.world.time, x: CD.debug.world.pip.x, p: CD.debug.weather.particles.length }));
  check('title: demo (bot Pip + weather) animates behind the menu', t1.t > t0.t + 1 && t1.x !== t0.x && t1.p > 20, { t0, t1 });
  check('title: demo plays silently (no score pop-ups drawn on title)', await ev(page, () => CD.debug.mode === 'title'));
  await shot(page, '01_title');
  for (const [btn, scr, n] of [['#btnHow', 'scrHow', '02_how'], ['#btnSettings', 'scrSettings', '03_settings'], ['#btnCustomize', 'scrCustom', '04_customise']]) {
    await page.click(btn); await page.waitForTimeout(300);
    check(`menu: ${btn} opens ${scr}`, (await ev(page, () => CD.UI.current)) === scr);
    await shot(page, n);
    await page.click(`#${scr} .btn-back`); await page.waitForTimeout(150);
    check(`menu: ${scr} back button returns to title`, (await ev(page, () => CD.UI.current)) === 'scrTitle');
    await page.click(btn); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(`menu: Esc closes ${scr}`, (await ev(page, () => CD.UI.current)) === 'scrTitle');
  }
  check('menu: Change Pictures lists hero, gem, bear + 4 biome grounds', await ev(page, () => document.querySelectorAll('#slotGrid .slot').length === CD.Assets.SLOTS.length && ['hero', 'gem', 'bear', 'bg_meadow', 'bg_river', 'bg_clouds', 'bg_glacier'].every(id => CD.Assets.SLOTS.some(s => s.id === id))));
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  check('play: Play button starts (mode playing, world ready→intro, HUD shown)', (await mode(page)) === 'playing' && (await visible(page, '#btnPause')) && (await ev(page, () => CD.debug.world.state)) === 'ready');
  check('play: ★ action button hidden on a non-touch device', !(await visible(page, '#btnAction')));
  check('play: focus left the menu (body)', await ev(page, () => !document.activeElement || document.activeElement === document.body));
  await page.waitForTimeout(600); await shot(page, '05_banner');
  const intro = await ev(page, () => CD.debug.world.cfg.introDelay);
  await page.waitForFunction(() => CD.debug.world.state === 'playing', null, { timeout: 5000 }).catch(() => {});
  check(`play: intro (${intro} s) then 'playing'`, (await ev(page, () => CD.debug.world.state)) === 'playing');
  await shot(page, '06_meadow');
  errorsOk(page, 'boot+screens');
  await page._ctx.close();
}

async function testKeyboard() {
  const page = await newPage();
  await boot(page, 'seed=3');
  const cfg = await startFrozen(page);
  const vmax = await ev(page, () => CD.debug.world.pipMaxSpeed(1));
  const cases = [[['ArrowRight'], 1, 0], [['KeyD'], 1, 0], [['ArrowLeft'], -1, 0], [['KeyA'], -1, 0], [['ArrowUp'], 0, -1], [['KeyW'], 0, -1], [['ArrowDown'], 0, 1], [['KeyS'], 0, 1],
    [['ArrowRight', 'ArrowDown'], 1, 1], [['KeyW', 'KeyA'], -1, -1], [['ArrowUp', 'KeyD'], 1, -1]];
  for (const [keys, ex, ey] of cases) {
    await isolate(page, 480, 300);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(40);
    await simStep(page, 0.3);
    const p = await pipInfo(page);
    for (const k of keys) await page.keyboard.up(k);
    const el = Math.hypot(ex, ey), dx = p.x - 480, dy = p.y - 300, dl = Math.hypot(dx, dy);
    const dirOk = dl > 30 && (dx / dl) * (ex / el) + (dy / dl) * (ey / el) > 0.99;
    check(`keys ${keys.join('+')}: Pip moves ${ex},${ey} at max speed${keys.length > 1 ? ' (diagonal normalised, not √2×)' : ''}`, dirOk && near(p.sp, vmax, vmax * 0.02), { sp: +p.sp.toFixed(1), vmax, dx: +dx.toFixed(1), dy: +dy.toFixed(1) });
  }
  // release → small drift then stop
  await isolate(page, 300, 300);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(40); await simStep(page, 0.4);
  const a = await pipInfo(page); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(40); await simStep(page, 1);
  const b = await pipInfo(page);
  const drift = b.x - a.x, expect = vmax * vmax / (2 * cfg.brakeSmall);
  check('keys: release → a little ice-slide drift, then Pip stops', b.sp < 1 && drift > 2 && drift < expect * 1.6 + 4, { drift: +drift.toFixed(1), expect: +expect.toFixed(1) });
  check('keys: Pip shows walk frames while moving / idle at rest', a.frame.startsWith('walk') && b.frame === 'idle', [a.frame, b.frame]);
  // walls clamp
  await isolate(page, 480, 300);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(40); await simStep(page, 4); await page.keyboard.up('ArrowLeft');
  const wl = await ev(page, () => { const w = CD.debug.world; return { x: w.pip.x, min: w.arena.x + w.pip.radius }; });
  check('keys: arena wall stops Pip (soft clamp)', near(wl.x, wl.min, 0.5), wl);
  errorsOk(page, 'keyboard');
  await page._ctx.close();
}

async function testPointer() {
  const page = await newPage();
  await boot(page, 'seed=4');
  const cfg = await startFrozen(page);
  await isolate(page, 200, 300);
  const T = [620, 240], c = await toClient(page, ...T);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(60);
  const tgt = await ev(page, () => CD.debug.world._target);
  check('mouse: holding the button sets the follow target at the cursor (logical coords)', tgt && near(tgt.x, T[0], 2) && near(tgt.y, T[1], 2), tgt);
  // step a little at a time so the real frames keep applying the target
  let maxOver = 0;
  for (let i = 0; i < 30; i++) { await simStep(page, 0.1); const p = await pipInfo(page); maxOver = Math.max(maxOver, p.x - T[0]); }
  const p = await pipInfo(page), d = Math.hypot(p.x - T[0], p.y - T[1]);
  check(`mouse: Pip waddles to the cursor and stops (≤ arriveStop ${cfg.arriveStop}+2 px, at rest)`, d <= cfg.arriveStop + 2 && p.sp < 5, { d: +d.toFixed(1), sp: +p.sp.toFixed(1) });
  check('mouse: arrive never overshoots by more than 4 px', maxOver <= 4, { maxOver: +maxOver.toFixed(2) });
  // drag while held → follows to the new point
  const T2 = [300, 420], c2 = await toClient(page, ...T2);
  await page.mouse.move(c2.x, c2.y, { steps: 4 }); await page.waitForTimeout(60);
  for (let i = 0; i < 30; i++) await simStep(page, 0.1);
  const p2 = await pipInfo(page);
  check('mouse: dragging the held mouse re-targets Pip', Math.hypot(p2.x - T2[0], p2.y - T2[1]) <= cfg.arriveStop + 2, { x: +p2.x.toFixed(1), y: +p2.y.toFixed(1) });
  await page.mouse.up(); await page.waitForTimeout(60);
  const c3 = await toClient(page, 800, 200);
  await page.mouse.move(c3.x, c3.y); await page.waitForTimeout(60);
  const p3a = await pipInfo(page); await simStep(page, 1); const p3 = await pipInfo(page);
  check('mouse: after release, moving the mouse does not move Pip', Math.hypot(p3.x - p3a.x, p3.y - p3a.y) < 1 && (await ev(page, () => CD.debug.world._target)) === null);
  const hover = await ev(page, () => ({ pointer: CD.Game.renderer.pointer, down: CD.Game.pointerDown }));
  info('note: hover pointer marker while mouse NOT held: ' + JSON.stringify(hover) + ' (renderer draws the target ring whenever renderer.pointer is set)');
  // keys override the pointer
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(40);
  await isolate(page, 480, 300);
  await page.mouse.move(c.x, c.y); await page.waitForTimeout(40);
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(40); await simStep(page, 0.3);
  const pk = await pipInfo(page); await page.keyboard.up('ArrowDown'); await page.mouse.up();
  check('mouse+keys: arrow keys win over a held mouse', pk.y - 300 > 30 && Math.abs(pk.x - 480) < 5, { x: +pk.x.toFixed(1), y: +pk.y.toFixed(1) });
  errorsOk(page, 'pointer');
  await page._ctx.close();
}

async function testTouch() {
  const page = await newPage({ touch: true });
  await boot(page, 'seed=5');
  check('touch: ★ hidden on the title screen', !(await visible(page, '#btnAction')));
  const cfg = await startFrozen(page);
  await hookEvents(page);
  check('touch: ★ action button shown in-game on a touch device', await visible(page, '#btnAction'));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await isolate(page, 200, 300);
  const A = await toClient(page, 260, 300), B = await toClient(page, 640, 380);
  await touch('touchStart', [{ x: A.x, y: A.y, id: 1 }]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: A.x + (B.x - A.x) * i / 5, y: A.y + (B.y - A.y) * i / 5, id: 1 }]);
  await page.waitForTimeout(60);
  for (let i = 0; i < 30; i++) await simStep(page, 0.1);
  const p = await pipInfo(page);
  check('touch: dragging a finger makes Pip follow it and stop', Math.hypot(p.x - 640, p.y - 380) <= cfg.arriveStop + 2 && p.sp < 5, { x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  await clearLog(page);
  const F2 = await toClient(page, 800, 150);
  await touch('touchStart', [{ x: B.x, y: B.y, id: 1 }, { x: F2.x, y: F2.y, id: 2 }]);
  await page.waitForTimeout(60);
  check('touch: a second finger = action (dash)', (await evLog(page, 'dash')).length === 1, (await evLog(page)).map(e => e.type));
  const tgt = await ev(page, () => CD.debug.world._target);
  check('touch: second finger does not steal the follow target', tgt && near(tgt.x, 640, 3) && near(tgt.y, 380, 3), tgt);
  await touch('touchEnd', []); await page.waitForTimeout(60);
  check('touch: lifting all fingers stops following', (await ev(page, () => CD.Game.pointerDown)) === false);
  await simStep(page, cfg.dashCooldown + 0.1); await clearLog(page);
  const box = await page.locator('#btnAction').boundingBox();
  const p0 = await pipInfo(page);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(80);
  await simStep(page, 0.05);
  const p1 = await pipInfo(page);
  check('touch: tapping ★ dashes', (await evLog(page, 'dash')).length === 1);
  check('touch: tapping ★ does not set a follow target', (await ev(page, () => CD.debug.world._target)) === null && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 40, { tgt: await ev(page, () => CD.debug.world._target) });
  await ev(page, () => CD.Game.pause()); await page.waitForTimeout(80);
  check('touch: ★ hidden while paused', !(await visible(page, '#btnAction')));
  await ev(page, () => CD.Game.resume()); await page.waitForTimeout(80);
  check('touch: ★ back after resume', await visible(page, '#btnAction'));
  await shot(page, '07_touch');
  errorsOk(page, 'touch');
  await page._ctx.close();
}

async function testAction() {
  const page = await newPage();
  await boot(page, 'seed=6');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  await isolate(page, 300, 300);
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  check('action: Space dashes; a second press inside the cooldown does nothing', (await evLog(page, 'dash')).length === 1, (await evLog(page, 'dash')).length);
  await simStep(page, 0.1);
  const d = await pipInfo(page);
  const dashSp = await ev(page, () => CD.debug.world.pipMaxSpeed(1) * CD.debug.world.cfg.dashMul);
  check('action: dash = burst at dashMul × speed, slide frame, facing direction', d.frame === 'slide' && near(d.sp, dashSp, dashSp * 0.05) && d.vx > 0, { sp: +d.sp.toFixed(1), dashSp, frame: d.frame });
  await simStep(page, cfg.dashCooldown - 0.2); await page.keyboard.press('Space'); await page.waitForTimeout(40);
  check('action: still on cooldown just before dashCooldown', (await evLog(page, 'dash')).length === 1);
  await simStep(page, 0.15);
  for (const [label, act] of [['Shift', () => page.keyboard.press('ShiftLeft')], ['right-click', async () => { const c = await toClient(page, 600, 300); await page.mouse.click(c.x, c.y, { button: 'right' }); }]]) {
    await isolate(page, 300, 300); await clearLog(page);
    await act(); await page.waitForTimeout(60);
    check(`action: ${label} dashes`, (await evLog(page, 'dash')).length === 1, (await evLog(page)).map(e => e.type));
    await simStep(page, cfg.dashCooldown + 0.05);
  }
  check('action: right-click does not set a follow target', (await ev(page, () => CD.debug.world._target)) === null);
  // Pop! at max size
  await isolate(page, 480, 300); await clearLog(page);
  await ev(page, () => { const w = CD.debug.world; w.size = w.sizeMax; w.pip.radius = w.pipRadiusFor(w.size); w.pip.invuln = 99; });
  const R = cfg.popRadius;
  await placeBear(page, 'red', 480 + R * 0.5, 300); await placeBear(page, 'green', 480, 300 + R * 0.7); await placeBear(page, 'orange', 480 - R - 40, 300);
  const s0 = await ev(page, () => CD.debug.world.score);
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  const pop = await ev(page, () => { const w = CD.debug.world; return { size: w.size, score: w.score, stun: w.bears.map(b => +b.stun.toFixed(2)), dash: window._evLog.filter(e => e.type === 'dash').length, pop: window._evLog.filter(e => e.type === 'pop') }; });
  check('pop: Space at max size = Pop! (not a dash), size → 1', pop.pop.length === 1 && pop.dash === 0 && pop.size === 1, pop);
  check(`pop: bears within popRadius ${R} stunned for stunTime ${cfg.stunTime}, far bear not`, near(pop.stun[0], cfg.stunTime, 0.02) && near(pop.stun[1], cfg.stunTime, 0.02) && pop.stun[2] === 0, pop.stun);
  check('pop: points = popBase + popPerBear × stunned', pop.score - s0 === cfg.popBase + cfg.popPerBear * 2 && pop.pop[0].stunned === 2, { got: pop.score - s0, want: cfg.popBase + cfg.popPerBear * 2 });
  await ev(page, () => { const w = CD.debug.world; w.pip.invuln = 0; const b = w.bears[0]; b.x = b._px = w.pip.x + 2; b.y = b._py = w.pip.y; });
  const h0 = await ev(page, () => CD.debug.world.hearts); await simStep(page, 0.2);
  check('pop: a stunned bear does not hurt Pip', (await ev(page, () => CD.debug.world.hearts)) === h0);
  await shot(page, '08_pop');
  errorsOk(page, 'action');
  await page._ctx.close();
}

async function testGemsBumps() {
  const page = await newPage();
  await boot(page, 'seed=7');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  await isolate(page, 400, 300);
  for (const size of [1, 4, 5]) {
    await ev(page, s => { const w = CD.debug.world; w.size = s; w.pip.radius = w.pipRadiusFor(s); }, size);
    const b = await ev(page, () => { const w = CD.debug.world; return { score: w.score, jar: w.jar, size: w.size }; });
    await placeGem(page, 405, 300); await simStep(page, 1 / 60);
    const a = await ev(page, () => { const w = CD.debug.world; return { score: w.score, jar: w.jar, size: w.size, gems: w.gems.length }; });
    check(`gem: pickup at size ${size} → +${cfg.gemPointsPerSize}×${size}, jar +1, grow (cap ${cfg.sizeMax})`, a.score - b.score === cfg.gemPointsPerSize * size && a.jar === b.jar + 1 && a.size === Math.min(cfg.sizeMax, size + 1) && a.gems === 0, { b, a });
  }
  check('gem: pickup emits gem + grow events, and maxsize at the cap', (await evLog(page, 'gem')).length === 3 && (await evLog(page, 'grow')).length === 2 && (await evLog(page, 'maxsize')).length === 1);
  const grownR = await ev(page, () => CD.debug.world.pip.radius);
  check('gem: collision radius follows size (pipRadius × (1 + scalePerSize·(size−1)))', near(grownR, cfg.pipRadius * (1 + cfg.scalePerSize * (cfg.sizeMax - 1)), 1e-6), grownR);
  // gem still telegraphing is not collectable
  await placeGem(page, 402, 300); await ev(page, () => { const g = CD.debug.world.gems[CD.debug.world.gems.length - 1]; g.appear = 0.5; });
  const j0 = await ev(page, () => CD.debug.world.jar); await simStep(page, 1 / 60);
  check('gem: a gem in its sparkle telegraph cannot be grabbed yet', (await ev(page, () => CD.debug.world.jar)) === j0);
  // bump
  await isolate(page, 400, 300); await clearLog(page);
  await ev(page, () => { const w = CD.debug.world; w.size = 3; w.pip.radius = w.pipRadiusFor(3); w.jar = 5; w.hearts = w.heartsMax; });
  await placeBear(page, 'red', 405, 300); await simStep(page, 1 / 60);
  const bp = await ev(page, () => { const w = CD.debug.world; return { hearts: w.hearts, max: w.heartsMax, size: w.size, jar: w.jar, loose: w.gems.filter(g => g.loose).length, invuln: w.pip.invuln, hurt: w.pip.hurt, frame: w.pip.frame }; });
  check('bump: −1 heart, shrink one size', bp.hearts === bp.max - 1 && bp.size === 2, bp);
  check(`bump: drops ${cfg.dropGems} loose gems taken out of the jar`, bp.loose === cfg.dropGems && bp.jar === 5 - cfg.dropGems, bp);
  check(`bump: invulnerability ≈ invulnTime ${cfg.invulnTime} s + hurt pose`, near(bp.invuln, cfg.invulnTime, 0.05) && bp.hurt > 0 && bp.frame === 'hurt', bp);
  const b1 = await pipInfo(page);
  check('bump: knock-back pushes Pip away from the bear', b1.vx < 0, { vx: b1.vx });
  await placeBear(page, 'green', b1.x, b1.y); await simStep(page, 0.4);
  check('bump: no second hit while blinking', (await ev(page, () => CD.debug.world.hearts)) === bp.hearts);
  await shot(page, '09_bump');
  // loose gems can be grabbed back
  await simStep(page, cfg.invulnTime);
  await ev(page, () => { const w = CD.debug.world; w.bears.length = 0; const g = w.gems.find(g => g.loose); if (g) { g.x = g._px = w.pip.x; g.y = g._py = w.pip.y; g.appear = 1; g.vx = g.vy = 0; } });
  const jb = await ev(page, () => CD.debug.world.jar); await simStep(page, 1 / 60);
  check('bump: a dropped gem picked back up returns to the jar', (await ev(page, () => CD.debug.world.jar)) === jb + 1);
  await simStep(page, cfg.looseLife + 0.2);
  check(`bump: uncollected loose gems vanish after looseLife ${cfg.looseLife} s`, (await ev(page, () => CD.debug.world.gems.filter(g => g.loose).length)) === 0);
  errorsOk(page, 'gems+bumps');
  await page._ctx.close();
}

async function testJarGateBiome() {
  const page = await newPage();
  await boot(page, 'seed=8');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  await isolate(page, 500, 300);
  await ev(page, () => { const w = CD.debug.world; w.gemsWanted = w._info.gems; w.jar = w.jarTarget - 1; w.hearts = w.heartsMax - 1; });
  await placeGem(page, 505, 300); await simStep(page, 1 / 60);
  const g = await ev(page, () => { const w = CD.debug.world; return { open: w.gate.open, jar: w.jar, t: w.jarTarget }; });
  check('jar: last gem fills the jar → jarfull + gateopen, gate open', g.open && g.jar === g.t && (await evLog(page, 'jarfull')).length === 1 && (await evLog(page, 'gateopen')).length === 1, g);
  await simStep(page, 2);
  const after = await ev(page, () => CD.debug.world.gems.filter(g => !g.loose).length);
  check('jar: no new gems spawn once the gate is open', after === 0, after);
  await shot(page, '10_gate_open');
  const s0 = await ev(page, () => ({ score: CD.debug.world.score, hearts: CD.debug.world.hearts }));
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(40);
  const tClear = await stepUntil(page, "w.state === 'cleared'", 6);
  await page.keyboard.up('ArrowRight');
  const cl = await evLog(page, 'cleared');
  check('gate: walking into the open gate clears the biome', cl.length === 1 && tClear < 6, { tClear });
  check('gate: clear bonus = hearts × clearBonusPerHeart (before heal), then heal', cl[0] && cl[0].bonus === s0.hearts * cfg.clearBonusPerHeart && (await ev(page, () => CD.debug.world.hearts)) === Math.min(s0.hearts + cfg.healOnClear, (s0.hearts + 1)), { bonus: cl[0] && cl[0].bonus, hearts: await ev(page, () => CD.debug.world.hearts) });
  await simStep(page, 0.5); await shot(page, '11_cleared');
  const tNext = await stepUntil(page, 'w.level === 1', cfg.clearTime + 1);
  const nx = await ev(page, () => { const G = CD.Game, w = G.world; return { level: w.level, biome: w.biome, state: w.state, wx: G.weather.biome, vis: G.renderer.vis.cur, banner: G.renderer.banner && G.renderer.banner.s, audio: CD.Audio.season, jar: w.jar, size: w.size, zones: w.zones.length }; });
  check(`biome: next biome after ~clearTime ${cfg.clearTime} s`, nx.level === 1 && near(tNext + 0.5, cfg.clearTime, 0.2), { tNext: tNext + 0.5 });
  check('biome: Chocolate River — banner, weather, backdrop and music all switch', nx.biome === 1 && nx.wx === 1 && nx.vis === 1 && nx.banner === 1 && nx.audio === 1 && nx.state === 'ready', nx);
  check('biome: jar reset, size reset to 1, river zones present', nx.jar === 0 && nx.size === 1 && nx.zones > 0, nx);
  check('biome: season sound played for level > 0 (biome event level 1)', (await evLog(page, 'biome')).some(e => e.level === 1));
  await simStep(page, 0.6); await shot(page, '12_river_banner');
  await simStep(page, 2.5);
  const wxs = await ev(page, () => CD.debug.weather.particles.filter(p => p.sprite === 'ripple').length);
  check('biome: river weather has chocolate ripples', wxs > 0, wxs);
  errorsOk(page, 'jar+gate');
  await page._ctx.close();
}

async function testZones() {
  const page = await newPage();
  await boot(page, 'seed=9&debug=1');
  const cfg = await startFrozen(page);
  await hookEvents(page);
  const run = async (x, y, keys, sec) => {
    await isolate(page, x, y);
    await ev(page, k => { CD.Game.keys = {}; k.forEach(c => CD.Game.keys[c] = true); }, keys);
    await simStep(page, sec);
    const p = await pipInfo(page);
    await ev(page, () => { CD.Game.keys = {}; });
    return p;
  };
  // river
  await ev(page, () => CD.debug.gotoLevel(1)); await toPlaying(page);
  const vmax = await ev(page, () => CD.debug.world.pipMaxSpeed(1));
  const zs = await ev(page, () => ({ z: CD.debug.world.zones, b: CD.debug.world.bridges }));
  const slow = zs.z[0], br = zs.b[0], land = zs.b[zs.b.length - 1];
  const pSlow = await run(slow.x + 60, slow.y + 6, ['ArrowDown'], 0.2);
  check(`zones river: chocolate is slow (× slowMul ${cfg.slowMul})`, pSlow.inSlow && near(pSlow.sp, vmax * cfg.slowMul, vmax * 0.03), { sp: +pSlow.sp.toFixed(1), want: vmax * cfg.slowMul });
  const pBr = await run(br.x + br.w / 2, br.y + 6, ['ArrowDown'], 0.2);
  check('zones river: wafer bridge is NOT slow', !pBr.inSlow && near(pBr.sp, vmax, vmax * 0.02), { sp: +pBr.sp.toFixed(1), at: [br.x + br.w / 2] });
  const pLand = await run(land.x + land.w / 2, land.y + 6, ['ArrowDown'], 0.2);
  check('zones river: gate landing is NOT slow', !pLand.inSlow && near(pLand.sp, vmax, vmax * 0.02), { sp: +pLand.sp.toFixed(1) });
  const pBank = await run(200, 150, ['ArrowDown'], 0.2);
  check('zones river: riverbank is normal speed', !pBank.inSlow && near(pBank.sp, vmax, vmax * 0.02));
  await ev(page, () => { CD.Game.renderer.banner = null; }); await page.waitForTimeout(100); await shot(page, '13_river_debug');
  // clouds
  await ev(page, () => CD.debug.gotoLevel(2)); await toPlaying(page);
  const z = await ev(page, () => CD.debug.world.zones[0]);
  await isolate(page, z.x - z.r - 40, z.y); await clearLog(page);
  const tr = await ev(page, () => { const G = CD.Game, w = G.world; G.keys = { ArrowRight: true }; let maxZ = 0, minVx = 1e9, entered = false, minD = 1e9;
    for (let i = 0; i < 60; i++) { G.step(1 / 60); const p = w.pip; maxZ = Math.max(maxZ, p.z); if (p.inPuff) { entered = true; minVx = Math.min(minVx, p.vx); } minD = Math.min(minD, Math.hypot(p.x - w.zones[0].x, p.y - w.zones[0].y)); }
    G.keys = {}; return { maxZ, minVx, entered, minD }; });
  const bnc = (await evLog(page, 'bounce')).filter(e => e.who === 'pip');
  check('zones clouds: running into a puff → boing (bounce event, hop z > 0, outward kick)', bnc.length >= 1 && tr.entered && tr.maxZ > 0 && tr.minVx < vmax * 0.7, { bounces: bnc.length, ...tr });
  await isolate(page, z.x - z.r * 0.4, z.y);
  const d0 = await ev(page, () => { const w = CD.debug.world, z = w.zones[0]; return Math.hypot(w.pip.x - z.x, w.pip.y - z.y); });
  await simStep(page, 0.5);
  const d1 = await ev(page, () => { const w = CD.debug.world, z = w.zones[0]; return Math.hypot(w.pip.x - z.x, w.pip.y - z.y); });
  check('zones clouds: standing in a puff drifts Pip outward', d1 - d0 > 10, { d0: +d0.toFixed(1), d1: +d1.toFixed(1) });
  // glacier
  await ev(page, () => CD.debug.gotoLevel(3)); await toPlaying(page);
  const ice = await ev(page, () => CD.debug.world.zones[0]);
  const drift = async (x, y) => {
    await run(x, y, ['ArrowRight'], 0.8);   // ice also lowers acceleration: give Pip time to reach full speed
    const a = await pipInfo(page);
    let coast = null;
    for (let i = 0; i < 18; i++) { await simStep(page, 0.1); const p = await pipInfo(page); if (i === 1) coast = p; }
    const b = await pipInfo(page);
    return { d: b.x - a.x, onIce: a.onIce, coastFrame: coast.frame, end: b.sp };
  };
  const dIce = await drift(ice.x + 15, ice.y + ice.h / 2);
  const offY = await ev(page, () => { const w = CD.debug.world; for (let y = 500; y > 100; y -= 10) if (!w.terrainAt(60, y).ice && !w.terrainAt(400, y).ice) return y; return 500; });
  const dGround = await drift(60, offY);
  const ratio = dIce.d / Math.max(1, dGround.d);
  check(`zones glacier: ice keeps momentum (stop drift ≈ 1/iceMul = ${(1 / cfg.iceMul).toFixed(1)}× ground)`, dIce.onIce && !dGround.onIce && ratio > 0.6 / cfg.iceMul && ratio < 1.4 / cfg.iceMul, { ice: +dIce.d.toFixed(1), ground: +dGround.d.toFixed(1), ratio: +ratio.toFixed(2) });
  check('zones glacier: Pip shows the slide frame while coasting on ice', dIce.coastFrame === 'slide', dIce.coastFrame);
  check('zones glacier: Pip still comes to a stop on ice', dIce.end < 1, dIce.end);
  errorsOk(page, 'zones');
  await page._ctx.close();
}

async function testGameOver() {
  const page = await newPage();
  await boot(page, 'seed=10');
  await startFrozen(page);
  await hookEvents(page); await countStarts(page);
  const t = await ev(page, () => { const G = CD.Game, w = G.world; w.hearts = 1; w.pip.invuln = 0; const b = w.bears[0]; b.x = b._px = w.pip.x + 3; b.y = b._py = w.pip.y; b.spawnT = 1; b.stun = 0; b.rest = 0; G.step(1 / 60); return { state: w.state, mode: G.mode }; });
  check('over: last heart lost → world dead, still on the board (no instant panel)', t.state === 'dead' && t.mode === 'playing', t);
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  check('over: pause disabled after death (Esc)', (await mode(page)) === 'playing');
  await page.click('#btnPause').catch(() => {}); await page.waitForTimeout(60);
  check('over: pause disabled after death (HUD button)', (await mode(page)) === 'playing');
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(60);
  check('over: pause disabled after death (window blur)', (await mode(page)) === 'playing');
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  check('over: action keys ignored while dead', (await evLog(page, 'dash')).length === 0 && (await evLog(page, 'pop')).length === 0);
  const tOver = await stepUntil(page, "G.mode === 'over'", 5);
  check('over: game-over panel after ~1.4 s', near(tOver, 1.4, 0.1) && await visible(page, '#btnAgain'), { tOver });
  const panel = await ev(page, () => ({ score: +document.getElementById('overScore').textContent, w: CD.debug.world.score, hud: !document.getElementById('hud').classList.contains('hidden') }));
  check('over: panel shows the score, HUD hidden', panel.score === panel.w && !panel.hud, panel);
  await shot(page, '14_game_over');
  await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  check('over: Enter/Space ignored during the 0.7 s lock', (await mode(page)) === 'over' && await ev(page, () => window._starts) === 0);
  await page.waitForTimeout(750);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('over: Enter after the lock → Play Again exactly once', (await mode(page)) === 'playing' && await ev(page, () => window._starts) === 1, await ev(page, () => window._starts));
  check('over: new run has full hearts, score 0, level 0', await ev(page, () => { const w = CD.debug.world; return w.hearts === w.heartsMax && w.score === 0 && w.level === 0; }));
  await killToOver(page); await page.waitForTimeout(800); await ev(page, () => { window._starts = 0; });
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('over: Space after the lock → Play Again exactly once', (await mode(page)) === 'playing' && await ev(page, () => window._starts) === 1, await ev(page, () => window._starts));
  await killToOver(page); await ev(page, () => { window._starts = 0; });
  await page.click('#btnAgain'); await page.waitForTimeout(80);
  check('over: Play Again button ignored during the lock', (await mode(page)) === 'over');
  await page.waitForTimeout(700); await page.click('#btnAgain'); await page.waitForTimeout(100);
  check('over: Play Again button works after the lock', (await mode(page)) === 'playing' && await ev(page, () => window._starts) === 1);
  await killToOver(page); await page.click('#btnOverMenu'); await page.waitForTimeout(150);
  check('over: Menu button → title', (await mode(page)) === 'title' && (await ev(page, () => CD.UI.current)) === 'scrTitle');
  errorsOk(page, 'game over');
  await page._ctx.close();
}

async function testPause() {
  const page = await newPage();
  await boot(page, 'seed=11');
  await page.click('#btnPlay');
  await ev(page, () => CD.debug.setBot(true, 1));
  await page.waitForFunction(() => CD.debug.world.state === 'playing', null, { timeout: 5000 });
  await page.waitForTimeout(400);
  const snap = () => ev(page, () => { const G = CD.Game, w = G.world; return { t: w.time, px: w.pip.x, py: w.pip.y, b: w.bears.map(b => b.x + b.y).join(), g: w.gems.map(g => g.appear + g.x).join(), wx: G.weather.particles.slice(0, 6).map(p => +(p.x + p.y).toFixed(3)), rt: G.renderer.time, fx: G.renderer.fx.length }; });
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} pauses (panel shown, HUD hidden)`, (await mode(page)) === 'paused' && await visible(page, '#btnResume') && !(await visible(page, '#btnPause')));
    const a = await snap(); await page.waitForTimeout(600); const b = await snap();
    check(`pause (${key}): nothing moves (world, Pip, bears, gems, weather, effects)`, JSON.stringify(a) === JSON.stringify(b), { a: a.t, b: b.t });
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} resumes`, (await mode(page)) === 'playing');
  }
  await page.click('#btnPause'); await page.waitForTimeout(150);
  check('pause: HUD pause button pauses', (await mode(page)) === 'paused');
  await shot(page, '15_paused');
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  check('pause: Settings from pause', (await ev(page, () => CD.UI.current)) === 'scrSettings' && (await mode(page)) === 'paused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('pause: Esc in settings returns to the pause panel (still paused)', (await ev(page, () => CD.UI.current)) === 'scrPause' && (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(150);
  check('pause: Resume button resumes', (await mode(page)) === 'playing');
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur pauses', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  // keys released on blur: hold → blur (keyup never arrives) → resume → Pip must not keep walking
  await ev(page, () => CD.debug.setBot(false)); await freeze(page); await isolate(page, 300, 300);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(40); await simStep(page, 0.2);
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(60);
  await page.click('#btnResume'); await page.waitForTimeout(60);
  const r0 = await pipInfo(page); await simStep(page, 1); const r1 = await pipInfo(page);
  check('pause: keys released on blur (no stuck walking after resume)', r1.x - r0.x < 25 && r1.sp < 1, { moved: +(r1.x - r0.x).toFixed(1) });
  await page.keyboard.up('ArrowRight');
  // mouse held → Esc → resume → not following
  const c = await toClient(page, 700, 300);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(40);
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  await page.mouse.up(); await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  const m0 = await pipInfo(page); await simStep(page, 1); const m1 = await pipInfo(page);
  check('pause: a held mouse is released by pausing', Math.hypot(m1.x - m0.x, m1.y - m0.y) < 25 && (await ev(page, () => CD.debug.world._target)) === null);
  // clicks / keys while paused don't reach the board
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  await page.mouse.click(c.x, c.y); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ShiftLeft');
  check('pause: clicks / keys while paused do nothing', (await ev(page, () => ({ d: CD.Game.pointerDown, t: CD.debug.world._target, k: Object.keys(CD.Game.keys).length, cd: CD.debug.world.pip.dashCd }))).cd === 0 && (await mode(page)) === 'paused' && (await ev(page, () => CD.Game.pointerDown)) === false);
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  // HUD clicks never move Pip
  await isolate(page, 300, 300);
  await page.click('#btnMuteHud'); await page.waitForTimeout(60); await simStep(page, 0.5);
  const hm = await ev(page, () => ({ d: CD.Game.pointerDown, t: CD.debug.world._target, x: CD.debug.world.pip.x, y: CD.debug.world.pip.y, muted: CD.Game.settings.muted }));
  check('HUD: clicking the sound button never moves Pip', !hm.d && hm.t === null && hm.x === 300 && hm.y === 300, hm);
  check('HUD: sound button toggles mute', hm.muted === true);
  await page.click('#btnMuteHud'); await page.waitForTimeout(60);
  const pb = await page.locator('#btnPause').boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(80);
  await page.click('#btnResume'); await page.waitForTimeout(80); await simStep(page, 0.5);
  check('HUD: clicking pause → Resume never moves Pip', await ev(page, () => CD.debug.world._target === null && CD.debug.world.pip.x === 300 && !CD.Game.pointerDown));
  errorsOk(page, 'pause');
  await page._ctx.close();
}

async function testSettings() {
  const page = await newPage();
  await boot(page, 'seed=12');
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)'); await page.waitForTimeout(80);
  const s1 = await ev(page, () => ({ s: CD.Game.settings, a: { sfx: CD.Audio.sfxOn, music: CD.Audio.musicOn } }));
  check('settings: sound + music toggles change the settings and the audio engine', s1.s.sfx === false && s1.s.music === false && s1.a.sfx === false && s1.a.music === false, s1);
  for (const d of ['easy', 'hard', 'normal']) {
    await page.click(`#setDifficulty button[data-v=${d}]`); await page.waitForTimeout(40);
    check(`settings: difficulty "${d}" highlighted`, await ev(page, d => CD.Game.settings.difficulty === d && document.querySelector(`#setDifficulty button[data-v=${d}]`).classList.contains('on') && document.querySelectorAll('#setDifficulty button.on').length === 1, d));
  }
  await page.click('#setDifficulty button[data-v=easy]');
  await page.reload(); await page.waitForFunction(() => CD.debug && CD.debug.mode === 'title');
  const s2 = await ev(page, () => CD.Game.settings);
  check('settings: persist across reload', s2.sfx === false && s2.music === false && s2.difficulty === 'easy', s2);
  // difficulty values applied (read from CD.DIFFICULTY)
  for (const d of ['easy', 'normal', 'hard']) {
    await ev(page, d => { CD.Game.setSetting('difficulty', d); CD.Game.toTitle(); CD.Game.startGame(); }, d);
    const r = await ev(page, d => {
      const w = CD.debug.world, D = Object.assign({}, CD.CONFIG, CD.DIFFICULTY[d]), keys = Object.keys(CD.DIFFICULTY[d]);
      const bad = keys.filter(k => JSON.stringify(w.cfg[k]) !== JSON.stringify(CD.DIFFICULTY[d][k]));
      return { bad, hearts: w.hearts, hm: D.heartsMax, jar: w.jarTarget, jt: D.jarTargets[0], bears: w.bears.length, bc: Math.min(D.bearMax, D.bearCounts[0]), mul: w._info.bearMul, wantMul: D.bearSpeedMul * D.bearBiomeMul[0] };
    }, d);
    check(`difficulty ${d}: CD.DIFFICULTY.${d} applied to the new world (hearts ${r.hm}, jar ${r.jt}, bears ${r.bc})`, r.bad.length === 0 && r.hearts === r.hm && r.jar === r.jt && r.bears === r.bc && near(r.mul, r.wantMul, 1e-9), r);
  }
  check('difficulty: title demo world always uses Normal', await ev(page, () => { CD.Game.setSetting('difficulty', 'easy'); CD.Game.toTitle(); return CD.debug.world.cfg.heartsMax === CD.CONFIG.heartsMax; }));
  // M mute
  await ev(page, () => { CD.Game.setSetting('difficulty', 'normal'); CD.Game.setSetting('sfx', true); CD.Game.setSetting('music', true); CD.Game.setSetting('muted', false); });
  const ic0 = await ev(page, () => document.getElementById('btnMuteHud').innerHTML);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const m1 = await ev(page, () => ({ muted: CD.Game.settings.muted, a: CD.Audio.muted, icon: document.getElementById('btnMuteHud').innerHTML }));
  check('settings: M mutes (setting, audio engine, HUD icon, toast)', m1.muted === true && m1.a === true && m1.icon !== ic0 && /Sound off/.test(await toastText(page)), { muted: m1.muted, a: m1.a });
  await page.reload(); await page.waitForFunction(() => CD.debug && CD.debug.mode === 'title');
  check('settings: mute persists across reload', await ev(page, () => CD.Game.settings.muted === true));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M again unmutes (URL ?mute=1 still keeps the test page silent)', await ev(page, () => CD.Game.settings.muted === false && CD.Audio.muted === true));
  // best per difficulty
  await ev(page, () => { CD.Game.resetBest(); CD.Game.setSetting('difficulty', 'normal'); CD.Game.startGame(); CD.debug.setSpeed(0); });
  await killToOver(page, 420);
  const b1 = await ev(page, () => ({ n: CD.Storage.get('best_normal'), shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
  check('best: game over stores best_normal and shows NEW!', b1.n === '420' && b1.shown === '420' && b1.nb, b1);
  await ev(page, () => { CD.Game.setSetting('difficulty', 'easy'); CD.Game.startGame(); CD.debug.setSpeed(0); });
  await killToOver(page, 90);
  const b2 = await ev(page, () => ({ e: CD.Storage.get('best_easy'), n: CD.Storage.get('best_normal'), shown: document.getElementById('overBest').textContent }));
  check('best: kept per difficulty (easy 90, normal still 420)', b2.e === '90' && b2.n === '420' && b2.shown === '90', b2);
  await ev(page, () => { CD.Game.setSetting('difficulty', 'normal'); CD.Game.startGame(); CD.debug.setSpeed(0); });
  await killToOver(page, 100);
  check('best: a lower score does not overwrite the best, no NEW!', await ev(page, () => CD.Storage.get('best_normal') === '420' && document.getElementById('newBest').classList.contains('hidden')));
  await ev(page, () => CD.Game.toTitle()); await page.waitForTimeout(80);
  check('best: title shows the best for the current difficulty', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '420');
  // difficulty changed mid-run from the pause menu
  await ev(page, () => { CD.Game.resetBest(); CD.Game.setSetting('difficulty', 'normal'); CD.Game.startGame(); CD.debug.setSpeed(0); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  await page.click('#btnPauseSettings'); await page.waitForTimeout(80);
  await page.click('#setDifficulty button[data-v=hard]'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  await killToOver(page, 555);
  const mid = await ev(page, () => ({ normal: CD.Storage.get('best_normal'), hard: CD.Storage.get('best_hard'), worldHearts: CD.debug.world.cfg.heartsMax }));
  check('best: a run started on Normal saves to best_normal even if difficulty was changed mid-run', mid.normal === '555' && mid.hard == null, mid);
  // reset best
  await ev(page, () => { CD.Storage.set('best_easy', '5'); CD.Storage.set('best_normal', '6'); CD.Storage.set('best_hard', '7'); CD.Game.setSetting('difficulty', 'normal'); CD.Game.toTitle(); });
  await page.click('#btnSettings'); await page.click('#btnResetBest'); await page.waitForTimeout(60);
  const rb = await ev(page, () => ['easy', 'normal', 'hard'].map(d => CD.Storage.get('best_' + d)));
  check('settings: Reset best clears every difficulty + toast', rb.every(v => v == null) && /cleared/i.test(await toastText(page)), rb);
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(80);
  check('settings: title best shows 0 after reset', (await ev(page, () => document.getElementById('bestTitle').textContent)) === '0');
  await page.reload(); await page.waitForFunction(() => CD.debug && CD.debug.mode === 'title');
  check('settings: reset best persists across reload', await ev(page, () => ['easy', 'normal', 'hard'].every(d => CD.Storage.get('best_' + d) == null)));
  errorsOk(page, 'settings');
  await page._ctx.close();
}

async function testCustomPictures() {
  const page = await newPage();
  await boot(page, 'seed=13');
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  await pickFile(page, 'hero', { name: 'hero.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 300, 'hero') });
  await page.waitForFunction(() => CD.Assets.hasCustom('hero'), null, { timeout: 5000 }).catch(() => {});
  check('custom hero: cut-out picture saved, shape "fit" (transparent corners)', await ev(page, () => CD.Assets.hasCustom('hero') && CD.Storage.get('shape_hero') === 'fit'));
  check('custom hero: card shows the thumbnail + "Your picture" tag + success toast', await ev(page, () => { const s = document.querySelectorAll('#slotGrid .slot')[0]; return s.querySelector('.prev img').src.startsWith('data:') && /Your picture/.test(s.querySelector('.tag').textContent); }) && /saved/i.test(await toastText(page)));
  await pickFile(page, 'gem', { name: 'gem.png', mimeType: 'image/png', buffer: await makeImage(page, 200, 200, 'gem') });
  await pickFile(page, 'bear', { name: 'bear.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 400, 300, 'blue', 'image/jpeg') });
  await page.waitForFunction(() => CD.Assets.hasCustom('gem') && CD.Assets.hasCustom('bear'), null, { timeout: 5000 }).catch(() => {});
  const bear = await ev(page, () => { const c = CD.Assets.custom.bear, g = c.getContext('2d'); return { shape: CD.Storage.get('shape_bear'), w: c.width, h: c.height, corner: g.getImageData(2, 2, 1, 1).data[3], mid: g.getImageData(c.width / 2, c.height / 2, 1, 1).data[3] }; });
  check('custom bear: opaque photo → round sticker (corners transparent, centre opaque)', bear.shape === 'circle' && bear.w === bear.h && bear.corner === 0 && bear.mid === 255, bear);
  await pickFile(page, 'bg_meadow', { name: 'bg.png', mimeType: 'image/png', buffer: await makeImage(page, 4000, 3000, 'bg') });
  await page.waitForFunction(() => CD.Assets.hasCustom('bg_meadow'), null, { timeout: 8000 }).catch(() => {});
  const bgs = await storedSize(page, 'img_bg_meadow');
  check('custom bg: huge 4000×3000 picture downscaled to ≤ 1280×720 before saving', bgs && bgs[0] <= 1280 && bgs[1] <= 720, bgs);
  await pickFile(page, 'hero', { name: 'big.png', mimeType: 'image/png', buffer: await makeImage(page, 3000, 2000, 'photo') });
  await page.waitForFunction(() => CD.Storage.get('shape_hero') === 'circle', null, { timeout: 8000 }).catch(() => {});
  const hs = await storedSize(page, 'img_hero');
  check('custom hero: huge 3000×2000 photo downscaled to ≤ 512 px, becomes round', hs && Math.max(hs[0], hs[1]) <= 512 && (await ev(page, () => CD.Storage.get('shape_hero'))) === 'circle', hs);
  await shot(page, '16_custom_cards');
  // shape buttons
  await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=fit]').click(); await page.waitForTimeout(80);
  check('custom: "Whole picture" switches a photo back to fit', await ev(page, () => CD.Storage.get('shape_hero') === 'fit' && CD.Assets.custom.hero.width !== CD.Assets.custom.hero.height));
  await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click(); await page.waitForTimeout(80);
  // bad files
  await pickFile(page, 'gem', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(250);
  check('custom: a non-picture file → friendly toast, old picture kept', /picture file/i.test(await toastText(page)) && await ev(page, () => CD.Assets.hasCustom('gem')), await toastText(page));
  await pickFile(page, 'gem', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png at all') });
  await page.waitForTimeout(400);
  check('custom: a broken image file → friendly toast, no crash', /could not be opened/i.test(await toastText(page)), await toastText(page));
  // in game
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(80);
  await startFrozen(page); await isolate(page, 300, 300);
  await placeGem(page, 600, 300);
  const kinds = ['red', 'green', 'orange'];
  for (let i = 0; i < 3; i++) await placeBear(page, kinds[i], 300 + i * 200, 470);
  await ev(page, () => { CD.debug.world.pip.invuln = 0; CD.Game.renderer.banner = null; CD.Game.renderer.texts.length = 0; CD.Game.renderer.fx.length = 0; });
  await page.waitForTimeout(150);
  await shot(page, '17_custom_ingame');
  const heroPx = await probe(page, 255, 215, 90, 90, '(g > 110 && r < 130 && b < 100) || (r > 170 && g < 90 && b < 90)');   // green→red gradient photo
  check('custom hero renders in game (photo pixels where Pip stands)', heroPx > 200, heroPx);
  const gemPx = await probe(page, 580, 260, 40, 40, 'r < 120 && g > 200 && b > 200');
  check('custom gem renders in game (cyan picture + colour ring)', gemPx > 20, gemPx);
  const rings = { red: 'r > 230 && g > 70 && g < 110 && b > 90 && b < 130', green: 'r > 60 && r < 100 && g > 190 && b > 105 && b < 140', orange: 'r > 235 && g > 135 && g < 170 && b > 40 && b < 80' };
  const bearPx = [];
  for (let i = 0; i < 3; i++) {
    const bx = 300 + i * 200;
    const blue = await probe(page, bx - 30, 410, 60, 60, 'b > 200 && r < 60 && g < 60');
    const ring = await probe(page, bx - 32, 462, 64, 18, rings[kinds[i]]);
    bearPx.push({ kind: kinds[i], blue, ring });
  }
  check('custom bear renders in game with a ring in each bear\'s colour', bearPx.every(b => b.blue > 50 && b.ring > 8), bearPx);
  const bgPx = await probe(page, 380, 120, 80, 40, 'r > 90 && r < 160 && g > 70 && g < 130 && b > 140 && b < 200');
  check('custom meadow ground renders in game', bgPx > 500, bgPx);
  // persistence
  await page.reload(); await page.waitForFunction(() => CD.debug && CD.debug.mode === 'title');
  check('custom: pictures + shapes persist across reload', await ev(page, () => ['hero', 'gem', 'bear', 'bg_meadow'].every(s => CD.Assets.hasCustom(s)) && CD.Storage.get('shape_hero') === 'circle' && CD.Storage.get('shape_bear') === 'circle'));
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await page.waitForTimeout(80);
  check('custom: Reset on one card → original Pip, storage cleared', await ev(page, () => !CD.Assets.hasCustom('hero') && CD.Storage.get('img_hero') == null && CD.Storage.get('shape_hero') == null && CD.Assets.hasCustom('gem')));
  await page.click('#btnResetAll'); await page.waitForTimeout(80);
  check('custom: Reset all → every slot original', await ev(page, () => CD.Assets.SLOTS.every(s => !CD.Assets.hasCustom(s.id) && CD.Storage.get('img_' + s.id) == null)));
  await page.reload(); await page.waitForFunction(() => CD.debug && CD.debug.mode === 'title');
  check('custom: reset persists across reload', await ev(page, () => CD.Assets.SLOTS.every(s => !CD.Assets.hasCustom(s.id))));
  errorsOk(page, 'custom pictures');
  await page._ctx.close();
}

async function testLap2() {
  const page = await newPage();
  await boot(page, 'seed=14');
  await page.click('#btnPlay'); await freeze(page);
  await ev(page, () => CD.debug.gotoLevel(4)); await toPlaying(page);
  const r = await ev(page, () => { const w = CD.debug.world, c = w.cfg; return { level: w.level, biome: w.biome, lap: w.lap, bears: w.bears.length, wantBears: Math.min(c.bearMax, c.bearCounts[0] + c.bearsPerLap), jar: w.jarTarget, wantJar: Math.round(c.jarTargets[0] * (1 + c.jarLapMul)), gw: w.gemsWanted, wantG: Math.min(c.gemCountMax, c.gemCount[0] + 1), wx: CD.debug.weather.biome }; });
  check('lap 2: gotoLevel(4) → Meadow lap 2 with +bears, bigger jar, +1 gem (from cfg)', r.level === 4 && r.biome === 0 && r.lap === 1 && r.bears === r.wantBears && r.jar === r.wantJar && r.gw === r.wantG && r.wx === 0, r);
  await ev(page, () => CD.debug.setBot(true, 1)); await unfreeze(page, 4);
  const t0 = Date.now(); let maxBear = 0, cap = 0;
  while (Date.now() - t0 < 6000) { await sleep(300); const s = await ev(page, () => { const w = CD.debug.world; return { m: Math.max(0, ...w.bears.filter(b => !(b._kb > 0)).map(b => Math.hypot(b.vx, b.vy))), cap: w.bearCap() * 1.0001, pipMin: w.pipMaxSpeed(w.sizeMax) }; }); maxBear = Math.max(maxBear, s.m); cap = s.pipMin; }
  check('lap 2: bears never faster than Pip at his slowest', maxBear < cap, { maxBear: +maxBear.toFixed(1), pipSlowest: cap });
  await unfreeze(page, 1); await page.waitForTimeout(200);
  await shot(page, '18_lap2');
  await ev(page, () => { CD.debug.setSpeed(0); CD.debug.gotoLevel(7); }); await toPlaying(page);
  check('lap 2: Glacier lap 2 (level 7) runs', await ev(page, () => CD.debug.world.biome === 3 && CD.debug.world.lap === 1 && CD.debug.weather.biome === 3));
  errorsOk(page, 'lap 2');
  await page._ctx.close();
}

async function testLayout() {
  const vps = [[800, 600, 1], [1280, 720, 1], [1366, 768, 1.5], [1920, 1080, 1], [2560, 1440, 1.5]];
  for (const [w, h, dsf] of vps) {
    const page = await newPage({ viewport: { width: w, height: h }, dsf });
    await boot(page, 'seed=1');
    const tag = `${w}x${h}@${dsf}`;
    const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top, bw: c.width, bh: c.height }; });
    const fits = cv.w <= w + 1 && cv.h <= h + 1 && (Math.abs(cv.w - w) < 2 || Math.abs(cv.h - h) < 2);
    const centered = Math.abs(cv.l - (w - cv.w) / 2) < 2 && Math.abs(cv.t - (h - cv.h) / 2) < 2;
    check(`layout ${tag}: canvas letterboxed 16:9, fills one axis, centred`, Math.abs(cv.w / cv.h - 16 / 9) < 0.01 && fits && centered, cv);
    { const k = Math.min(1, 1920 / (cv.w * dsf));
      check(`layout ${tag}: backing store = css × dpr, capped at 1920×1080`, Math.abs(cv.bw - cv.w * dsf * k) < 3 && Math.abs(cv.bh - cv.h * dsf * k) < 3 && cv.bw <= 1920 && cv.bh <= 1080, [cv.bw, cv.bh]); }
    const issues = [];
    for (const scr of ['scrTitle', 'scrSettings', 'scrCustom', 'scrHow', 'scrPause', 'scrOver']) {
      await ev(page, s => {
        const G = CD.Game;
        if (s === 'scrPause') { G.startGame(); G.world.state = 'playing'; G.pause(); }
        else if (s !== 'scrOver') { G.toTitle(); if (s !== 'scrTitle') CD.UI.open(s, 'scrTitle'); }
      }, scr);
      if (scr === 'scrOver') { await ev(page, () => { CD.Game.startGame(); CD.debug.setSpeed(0); }); await killToOver(page, 12345); await ev(page, () => CD.debug.setSpeed(1)); }
      await page.waitForTimeout(400);
      const r = await layoutReport(page);
      if (r.bad.length || r.hidden.length || r.overflow) issues.push(scr + ': ' + r.bad.concat(r.hidden.map(x => 'below-fold:' + x)).join('; ') + (r.overflow ? ' (panel scrolls)' : ''));
      if (w === 800 || w === 2560) await shot(page, `19_layout_${w}x${h}_${scr}`);
    }
    check(`layout ${tag}: every menu fits inside the window (no clipped / scrolled-away buttons)`, issues.length === 0, issues.join(' | '));
    await ev(page, () => { CD.Game.startGame(); CD.debug.setSpeed(0); const G = CD.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.banner = null; });
    await page.waitForTimeout(250);
    const hud = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('hud').getBoundingClientRect();
      const toL = (x, y) => [(x - c.left) / c.width * 960, (y - c.top) / c.height * 540];
      const [l, t] = toL(b.left, b.top), [r, bt] = toL(b.right, b.bottom), jar = CD.debug.world.cfg.hudAvoid[1];
      return { l: +l.toFixed(1), t: +t.toFixed(1), r: +r.toFixed(1), b: +bt.toFixed(1), jarTop: jar.y }; });
    check(`layout ${tag}: HUD buttons inside the canvas, above the gem jar`, hud.l >= 0 && hud.t >= 0 && hud.r <= 960 && hud.b <= hud.jarTop, hud);
    check(`layout ${tag}: ★ hidden on non-touch`, !(await visible(page, '#btnAction')));
    if (w === 800 || w === 2560 || w === 1366) await shot(page, `20_layout_${w}x${h}_game`);
    errorsOk(page, `layout ${tag}`);
    await page._ctx.close();
  }
  // touch device: ★ visible + inside the canvas, not over the HUD
  for (const [w, h] of [[1280, 720], [800, 600]]) {
    const page = await newPage({ viewport: { width: w, height: h }, touch: true });
    await boot(page, 'seed=1');
    await startFrozen(page);
    const a = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('btnAction').getBoundingClientRect(); return { vis: !document.getElementById('btnAction').classList.contains('hidden') && b.width > 20, inside: b.left >= c.left && b.right <= c.right + 0.5 && b.top >= c.top && b.bottom <= c.bottom + 0.5, b: [b.left, b.top, b.right, b.bottom].map(Math.round) }; });
    check(`layout touch ${w}x${h}: ★ shown, inside the canvas`, a.vis && a.inside, a);
    await shot(page, `21_touch_${w}x${h}`);
    await page._ctx.close();
  }
  // live resize while playing + pointer accuracy after resize
  const page = await newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, 'seed=1');
  await startFrozen(page); await isolate(page, 200, 300);
  for (const [w, h] of [[800, 600], [1920, 1080], [500, 900], [1100, 700]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250); }
  const cv = await ev(page, () => { const r = document.getElementById('game').getBoundingClientRect(); return [r.width, r.height]; });
  check('live resize keeps a 16:9 canvas', Math.abs(cv[0] / cv[1] - 16 / 9) < 0.01, cv);
  const c = await toClient(page, 700, 400);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(60);
  const tg = await ev(page, () => CD.debug.world._target); await page.mouse.up();
  check('after resize, a held mouse targets the right logical point', tg && near(tg.x, 700, 2) && near(tg.y, 400, 2), tg);
  const hud = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('hud').getBoundingClientRect(); return b.right <= c.right + 1 && b.top >= c.top - 1; });
  check('after resize, HUD buttons still hug the canvas', hud);
  errorsOk(page, 'live resize');
  await page._ctx.close();
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await countStarts(page); await page.waitForTimeout(100);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on title starts exactly once', await ev(page, () => window._starts) === 1 && (await mode(page)) === 'playing', await ev(page, () => window._starts));
  await ev(page, () => { CD.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on focused Play starts exactly once', await ev(page, () => window._starts) === 1);
  await ev(page, () => { CD.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.focus('#btnSettings'); await page.keyboard.press('Space'); await page.waitForTimeout(200);
  const r = await ev(page, () => ({ starts: window._starts, ui: CD.UI.current }));
  check('focus: Space on a focused title button activates THAT button (not Play)', r.starts === 0 && r.ui === 'scrSettings', r);
  await page.focus('#setSfx');
  const sfx0 = await ev(page, () => CD.Game.settings.sfx);
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  check('focus: Space on a settings toggle toggles it, no game start', await ev(page, () => window._starts) === 0 && (await ev(page, () => CD.Game.settings.sfx)) === !sfx0);
  await ev(page, s => CD.Game.setSetting('sfx', s), sfx0);
  await ev(page, () => { CD.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter on the pause screen activates focused Resume', (await mode(page)) === 'playing');
  await page.waitForFunction(() => CD.debug.world.state === 'playing', null, { timeout: 4000 }).catch(() => {});
  await freeze(page); await hookEvents(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  check('focus: Enter in-game = action (dash), never re-clicks a hidden menu button', (await evLog(page, 'dash')).length === 1 && await ev(page, () => window._starts) === 1);
  errorsOk(page, 'focus');
  await page._ctx.close();
}

async function testNativeBridge() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const disk = JSON.parse(sessionStorage.getItem('fakeDisk') || '{}');
    window._native = { calls: [], fs: [], quit: 0 };
    const save = () => sessionStorage.setItem('fakeDisk', JSON.stringify(disk));
    // mirror app/main.go: keyRe ^[a-zA-Z0-9_\-]{1,64}$, value ≤ 12 MiB, returns bool
    window.ffStoreAll = async () => Object.assign({}, disk);
    window.ffStoreSet = async (k, v) => { window._native.calls.push(['set', k, v.length]); if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(k) || v.length > 12 << 20) return false; disk[k] = v; save(); return true; };
    window.ffStoreDel = async k => { window._native.calls.push(['del', k]); delete disk[k]; save(); return true; };
    window.ffFullscreen = async on => { window._native.fs.push(on); return on; };
    window.ffQuit = async () => { window._native.quit++; };
  });
  const page = await newPage({}, ctx);
  await boot(page, 'app=1&seed=3');
  check('app mode: native store detected', await ev(page, () => CD.Storage.native === true));
  check('app mode: Quit button visible', await visible(page, '#btnQuit'));
  await ev(page, () => CD.Game.setSetting('difficulty', 'easy'));
  check('app mode: settings written through ffStoreSet, not localStorage', await ev(page, () => window._native.calls.some(c => c[0] === 'set' && c[1] === 'settings') && !localStorage.getItem('cd:settings')));
  await page.click('#btnCustomize'); await page.waitForTimeout(200);
  await pickFile(page, 'hero', { name: 'b.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 300, 'hero') });
  await pickFile(page, 'bg_glacier', { name: 'g.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 1920, 1080, 'photo', 'image/jpeg') });
  await page.waitForFunction(() => CD.Assets.hasCustom('hero') && CD.Assets.hasCustom('bg_glacier'), null, { timeout: 8000 }).catch(() => {});
  await page.click('#scrCustom .btn-back');
  await ev(page, () => { CD.Game.startGame(); CD.debug.setSpeed(0); }); await killToOver(page, 77);
  const calls = await ev(page, () => window._native.calls.filter(c => c[0] === 'set'));
  check('app mode: every storage key matches the Go store key regex', calls.length > 0 && calls.every(c => /^[a-zA-Z0-9_\-]{1,64}$/.test(c[1])), [...new Set(calls.map(c => c[1]))]);
  check('app mode: stored pictures well under the 12 MiB Go limit', calls.every(c => c[2] < 12 << 20), Math.max(...calls.map(c => c[2])));
  await page.reload(); await page.waitForFunction(() => window.CD && CD.debug && CD.debug.mode === 'title');
  check('app mode: pictures, settings and best reload from the native store', await ev(page, () => CD.Assets.hasCustom('hero') && CD.Assets.hasCustom('bg_glacier') && CD.Game.settings.difficulty === 'easy' && CD.Storage.get('best_easy') === '77'));
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  const fsr = await ev(page, () => ({ calls: window._native.fs, flag: CD.Game.fullscreen }));
  check('app mode: F11 toggles native fullscreen on/off', JSON.stringify(fsr.calls) === '[true,false]' && fsr.flag === false, fsr);
  await page.click('#btnQuit'); await page.waitForTimeout(100);
  check('app mode: Quit calls ffQuit', await ev(page, () => window._native.quit === 1));
  errorsOk(page, 'app mode');
  await ctx.close();
  // Go source review (static)
  const go = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.go'), 'utf8');
  check('main.go: fixed port 47615 with free-port fallback', /127\.0\.0\.1:47615/.test(go) && /127\.0\.0\.1:0/.test(go));
  check('main.go: game-specific names (PipsCandyDash data dir, window title)', /"PipsCandyDash"/.test(go) && /Title:\s*"Pip's Candy Dash"/.test(go) && !/Foxy|Reef|Flappy|foxy/i.test(go));
  check('main.go: binds every function the page calls (ffStoreAll/Set/Del, ffFullscreen, ffQuit) and loads ?app=1', ['ffStoreAll', 'ffStoreSet', 'ffStoreDel', 'ffFullscreen', 'ffQuit'].every(n => go.includes('"' + n + '"')) && go.includes('index.html?app=1'));
  const keyRe = /keyRe = regexp\.MustCompile\(`([^`]+)`\)/.exec(go);
  check('main.go: store key regex accepts every key the game uses', keyRe && ['settings', 'best_easy', 'best_normal', 'best_hard', 'img_hero', 'shape_hero', 'img_bg_meadow', 'img_bg_glacier'].every(k => new RegExp(keyRe[1]).test(k)), keyRe && keyRe[1]);
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'seed=77&speed=16&bot=1&skill=0.5&autostart=1&autorestart=1');
  const lim = await ev(page, () => ({ bearMax: CD.CONFIG.bearMax, gemMax: CD.CONFIG.gemCountMax + 3 * CD.CONFIG.dropGems }));
  const samples = []; const t0 = Date.now(); let maxLevel = 0, n = 0;
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(Math.min(5000, LONG_RUN_S * 1000 / 8));
    samples.push(await ev(page, () => {
      const G = CD.Game, w = G.world;
      return { mode: G.mode, games: G.stats.games, score: w.score, level: w.level, state: w.state, bears: w.bears.length, gems: w.gems.length, particles: G.weather.particles.length, fx: G.renderer.fx.length, texts: G.renderer.texts.length,
        cache: CD.Assets._cache.size, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, errors: G.stats.errors.length };
    }));
    maxLevel = Math.max(maxLevel, samples[samples.length - 1].level);
    if (++n % 3 === 0) await ev(page, () => { const w = CD.debug.world; if (w.state === 'playing') { w.hearts = 1; w.pip.invuln = 0; const b = w.bears[0]; if (b) { b.x = b._px = w.pip.x; b.y = b._py = w.pip.y; b.spawnT = 1; b.stun = 0; b.rest = 0; } } });
    info('long run ' + JSON.stringify(samples[samples.length - 1]));
  }
  const st = await ev(page, () => CD.Game.stats);
  maxLevel = Math.max(maxLevel, ...st.levels);
  const maxOf = k => Math.max(...samples.map(s => s[k]));
  info(`long run: ${st.games} games, scores ${JSON.stringify(st.scores.slice(0, 20))}, levels ${JSON.stringify(st.levels.slice(0, 20))}`);
  check('long run: no errors (page / console / frame loop)', page._errors.length === 0 && st.errors.length === 0, page._errors.concat(st.errors).slice(0, 5).join(' | '));
  check(`long run: entities bounded (bears ≤ ${lim.bearMax}, gems ≤ ${lim.gemMax}, weather particles ≤ 160)`, maxOf('bears') <= lim.bearMax && maxOf('gems') <= lim.gemMax && maxOf('particles') <= 160, { bears: maxOf('bears'), gems: maxOf('gems'), particles: maxOf('particles') });
  check('long run: renderer effects bounded (fx ≤ 400, texts ≤ 30)', maxOf('fx') <= 400 && maxOf('texts') <= 30, { fx: maxOf('fx'), texts: maxOf('texts') });
  check('long run: sprite cache bounded (≤ 200 entries)', maxOf('cache') <= 200, maxOf('cache'));
  if (samples[0].heapMB != null && samples.length > 2) {
    const h1 = samples[1].heapMB, hN = samples[samples.length - 1].heapMB;
    check('long run: JS heap does not keep growing (< +40 MB)', hN - h1 < 40, { from: h1, to: hN });
  }
  if (!QUICK) {
    check('long run: game over → auto-restart works repeatedly (≥ 3 games)', st.games >= 3, { games: st.games, levels: st.levels });
    check('long run: bot reaches lap 2 (level ≥ 4)', maxLevel >= 4, { maxLevel });
  }
  await ev(page, () => CD.debug.setSpeed(1)); await page.waitForTimeout(300);
  await shot(page, '22_long_run_end');
  await page._ctx.close();
}

(async () => {
  browser = await chromium.launch();
  const suites = [testBootAndScreens, testKeyboard, testPointer, testTouch, testAction, testGemsBumps, testJarGateBiome, testZones, testGameOver, testPause, testSettings, testCustomPictures, testLap2, testFocus, testNativeBridge, testLayout, testLongRun];
  const only = args.find(a => a.startsWith('--only='));
  for (const s of suites) {
    if (only && !only.slice(7).split(',').some(n => s.name.toLowerCase().includes(n.toLowerCase()))) continue;
    console.log('\n== ' + s.name);
    try { await s(); } catch (e) { check(s.name + ' crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' ')); }
  }
  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed, ${fails.length} failed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
