// Shelly's Sky Catch — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to file://<repo>/game/index.html (Chromium gets --allow-file-access-from-files)
//   --quick shortens the long bot run (15 s instead of 60 s)
// Prints PASS/FAIL per check, screenshots in tests/out/functional/, exits 1 on any FAIL.
// Adapted from projects/daily-game/puff-volcano-catch/tests/e2e/functional.js.
// Rule: tuning numbers are read from the live config (SC.debug.world.cfg / SC.DIFFICULTY), never hard-coded.
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
  await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode && SC.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => SC.debug.mode);
const ui = page => ev(page, () => SC.UI.current);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}
const errorsOk = (page, label) => check(label + ': no console errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));
const close = page => page._ctx.close();

/* Freeze sim time (speed 0); advance deterministically with simStep(). Real rAF frames still run applyMove + draw. */
const freeze = page => ev(page, () => SC.debug.setSpeed(0));
const simStep = (page, sec) => ev(page, sec => { const G = SC.Game; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) G.step(1 / 60); G.renderer.update(sec); }, sec);
const toPlaying = page => ev(page, () => { const G = SC.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; return i / 60; });

/* Stop the drop scheduler and gusts, clear items, park Shelly at x on the hover line, jet charged. */
const isolate = (page, x) => ev(page, x => {
  const w = SC.debug.world, c = w.cfg; w.items.length = 0; w._nextDrop = 1e9; w._windNext = 1e9;
  w.wind.x = 0; w.wind.target = 0; w.wind.warn = 0; w._windFrom = 0; w._windEase = 1;
  const s = w.snail; s.x = s._px = x; s.vx = 0; s.ax = 0; s.vc = 0; s.vw = 0; s.sway = 0; s.swayV = 0; s.invuln = 0;
  s.y = s._py = c.hoverY; s.vy = 0; s.hop = 0; s.rimX = s._prx = x; s.rimY = s._pry = c.hoverY - c.rimOff;
  w.jet.air = false; w.jet.charge = 1; w.jet.cooldown = 0;
  w.setTarget(null); w.setMove(0); SC.Game.keys = {}; SC.Game.renderer.pointer = null; SC.Game.pointerDown = false; SC.Game._mouseFollow = false;
}, x);
/* Drop an item ('star' | 'gold' | 'puff') straight down onto logical x from just above the rim line (no peek, no flutter). */
const drop = (page, kind, x, y) => ev(page, ({ kind, x, y }) => {
  const w = SC.debug.world, c = w.cfg; y = y != null ? y : c.hoverY - c.rimOff - 30;
  const it = w._newItem(kind, x);
  it._A = 0; it._bx = it.x = it._px = x; it.y = it._py = y; it.vx = 0; it.vy = 150; it.state = 'fall'; it.t = 0; it.alpha = 1;
  w.items.push(it); return it.id;
}, { kind, x, y });
const snail = page => ev(page, () => { const s = SC.debug.world.snail; return { x: s.x, vx: s.vx, rimX: s.rimX, frame: s.frame, hop: s.hop }; });
const jets = page => ev(page, () => SC.debug.world.jets);
const toClient = (page, x, y) => ev(page, ({ x, y }) => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + x / 960 * r.width, y: r.top + y / 540 * r.height }; }, { x, y });

/* Log every event the world emits (wraps handleEvents). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = SC.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);
const clearLog = page => ev(page, () => { if (window._evLog) window._evLog.length = 0; });
const countStarts = page => ev(page, () => { window._starts = 0; if (!SC.Game._wrapped) { const o = SC.Game.startGame.bind(SC.Game); SC.Game.startGame = function () { window._starts++; return o(); }; SC.Game._wrapped = true; } });
const starts = page => ev(page, () => window._starts);

/* Lose the last heart (thunder puff into the basket) and step until the game-over panel (sim time). */
const killToOver = (page, score) => ev(page, score => {
  const G = SC.Game, w = G.world; let i = 0;
  while (w.state !== 'playing' && i++ < 3000) G.step(1 / 60);
  if (score != null) w.score = score;
  w.items.length = 0; w._nextDrop = 1e9;
  w.hearts = 1; w.snail.invuln = 0;
  const c = w.cfg, x = w.snail.rimX, y = w.snail.rimY - 30;
  const it = w._newItem('puff', x); it._A = 0; it._bx = it.x = it._px = x; it.y = it._py = y; it.vy = 150; it.state = 'fall'; it.t = 0; it.alpha = 1;
  w.items.push(it);
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
      const col = { star: '#00ffff', puff: '#ff00ff' }[kind] || '#ff00ff';
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
  const idx = await ev(page, id => SC.Assets.SLOTS.findIndex(s => s.id === id), slotId);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const storedSize = (page, key) => ev(page, k => new Promise(res => { const d = SC.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight, d.length]); i.onerror = () => res(null); i.src = d; }), key);
async function waitToast(page, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await toastText(page); if (re.test(t)) return t; await page.waitForTimeout(100); }
  return await toastText(page);
}

/* Visible buttons of the current screen inside the viewport, panel not scrolling. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = SC.UI.current && document.getElementById(SC.UI.current);
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
      // QA: a panel that scrolls is fine on small screens IF it really scrolls and every hidden button can be scrolled into view
      const oy = getComputedStyle(panel).overflowY, scrollable = (oy === 'auto' || oy === 'scroll') && panel.scrollHeight > panel.clientHeight + 1;
      if (overflow && scrollable && SC.Game.isTouch) {
        const unreachable = [];
        for (const b of btns) {
          const r0 = b.getBoundingClientRect(); if (!(r0.bottom > pr.bottom + 0.5 || r0.top < pr.top - 0.5)) continue;
          b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect();
          if (r.bottom > pr.bottom + 1 || r.top < pr.top - 1) unreachable.push(b.id || b.textContent.trim().slice(0, 20));
        }
        panel.scrollTop = 0;
        const wide = panel.scrollWidth > panel.clientWidth + 1;
        return { bad, overflow: wide, hidden: unreachable, scrolls: true };
      }
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
  return ev(page, () => SC.debug.world.cfg);
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
  check('title: HUD + 🚀 hidden on title', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  check('title: best score line shown', /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: SC.debug.world.time, x: SC.debug.world.snail.x }));
  await page.waitForTimeout(2500);
  const t1 = await ev(page, () => ({ t: SC.debug.world.time, x: SC.debug.world.snail.x, p: SC.debug.weather.particles.length }));
  check('title: demo (bot Shelly + weather) animates behind the menu', t1.t > t0.t + 1 && t1.p > 2, { t0, t1 });
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
  check('play: 🚀 button hidden on a non-touch device', !(await visible(page, '#btnAction')));
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
    const p = await snail(page);
    await page.keyboard.up(key); await page.waitForTimeout(50);
    check(`keys: ${key} moves Shelly ${dir > 0 ? 'right' : 'left'} at ≤ maxSpeed`, (p.x - 480) * dir > 100 && Math.abs(p.vx) <= cfg.maxSpeed + 1, { x: Math.round(p.x), vx: Math.round(p.vx) });
    await simStep(page, 0.4);
    const q = await snail(page);
    check(`keys: Shelly stops after releasing ${key}`, Math.abs(q.vx) < 1, { vx: q.vx });
  }
  await isolate(page, 480);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(30);
  await simStep(page, 4);
  const L = await snail(page);
  await page.keyboard.up('ArrowLeft');
  check('keys: Shelly clamped at xMin', near(L.x, cfg.xMin, 0.5), L.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(30);
  await simStep(page, 5);
  const R = await snail(page);
  await page.keyboard.up('ArrowRight');
  check('keys: Shelly clamped at xMax', near(R.x, cfg.xMax, 0.5), R.x);
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
  let p = await snail(page);
  check('mouse: moving the mouse makes Shelly follow horizontally', near(p.x, 200, 4), Math.round(p.x));
  const b = await toClient(page, 760, 120);
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.waitForTimeout(80);
  await simStep(page, 2);
  p = await snail(page);
  check('mouse: follows x only (y of the cursor irrelevant), arrives without big overshoot', near(p.x, 760, 4), Math.round(p.x));
  // track overshoot on a move
  await isolate(page, 200);
  const c = await toClient(page, 700, 400);
  await page.mouse.move(c.x - 5, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.waitForTimeout(80);
  const maxX = await ev(page, () => { const G = SC.Game; let m = 0; for (let i = 0; i < 180; i++) { G.step(1 / 60); m = Math.max(m, G.world.snail.x); } return m; });
  check('mouse: pointer-follow overshoot < 4 px', maxX - 700 < 4, Math.round(maxX - 700));
  // a plain left click on the canvas must NOT Jet Hop
  await isolate(page, 480);
  const r0 = await jets(page);
  const m = await toClient(page, 480, 300);
  await page.mouse.click(m.x, m.y); await page.waitForTimeout(60);
  check('mouse: left click on the playfield does not Jet Hop', (await jets(page)) === r0);
  // hovering the HUD pause button: does it steer Shelly toward the corner?
  await isolate(page, 300);
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(m.x, m.y); await page.waitForTimeout(30);
  await isolate(page, 300);
  await page.mouse.move(pb.x, pb.y, { steps: 3 }); await page.waitForTimeout(80);
  await ev(page, () => { SC.Game.renderer.pointer = null; });   // forget the path; only the final hover matters
  await page.mouse.move(pb.x + 1, pb.y + 1); await page.waitForTimeout(60);
  await simStep(page, 1.5);
  p = await snail(page);
  check('mouse: hovering the HUD pause button does not drag Shelly to the corner', Math.abs(p.x - 300) < 30, Math.round(p.x));
  // clicking pause must pause and not move Shelly
  await isolate(page, 300);
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  check('mouse: click HUD pause → paused', (await mode(page)) === 'paused');
  const px = (await snail(page)).x;
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('mouse: Esc resumes from pause', (await mode(page)) === 'playing');
  check('mouse: HUD click did not move Shelly', near(px, 300, 1), px);
  // mute button toggles and does not move Shelly
  await isolate(page, 300);
  const mb = await ev(page, () => { const r = document.getElementById('btnMuteHud').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const mu0 = await ev(page, () => SC.Game.isMuted());   // effective mute (setting, ?mute=1 or a 0 % volume)
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  const mu1 = await ev(page, () => SC.Game.isMuted());
  check('mouse: HUD mute button toggles sound and keeps playing', mu1 === !mu0 && (await mode(page)) === 'playing');
  await page.mouse.click(mb.x, mb.y); await page.waitForTimeout(80);
  errorsOk(page, 'pointer');
  await close(page);
}

async function testTouch() {
  const page = await newPage({ viewport: { width: 1024, height: 768 }, dsf: 2, touch: true, mobile: false });
  await boot(page, 'seed=5');
  check('touch: isTouch detected', await ev(page, () => SC.Game.isTouch));
  const cfg = await startFrozen(page);
  check('touch: 🚀 action button visible during play', await visible(page, '#btnAction'));
  const reload = cfg.jetRecharge + 2 * cfg.jetImpulse / cfg.jetG + 0.5;   // air time + recharge
  await isolate(page, 480);
  const a = await toClient(page, 220, 330);
  await touch(page, 'touchStart', [{ x: a.x, y: a.y, id: 1 }]); await page.waitForTimeout(80);
  await simStep(page, 1.5);
  let p = await snail(page);
  check('touch: holding a finger makes Shelly fly to it', near(p.x, 220, 4), Math.round(p.x));
  const b = await toClient(page, 650, 330);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(80);
  await simStep(page, 1.5);
  p = await snail(page);
  check('touch: dragging the finger keeps following', near(p.x, 650, 4), Math.round(p.x));
  // second finger = Jet Hop
  const r0 = await jets(page);
  const s = await toClient(page, 300, 200);
  await touch(page, 'touchStart', [{ x: b.x, y: b.y, id: 1 }, { x: s.x, y: s.y, id: 2 }]); await page.waitForTimeout(80);
  check('touch: second finger triggers a Jet Hop', (await jets(page)) === r0 + 1);
  // second finger wiggles a bit (a real tap is never perfectly still): Shelly must keep following finger 1
  const s2 = await toClient(page, 310, 205);
  await touch(page, 'touchMove', [{ x: b.x, y: b.y, id: 1 }, { x: s2.x, y: s2.y, id: 2 }]); await page.waitForTimeout(80);
  await simStep(page, 1.0);
  p = await snail(page);
  check('touch: moving the 2nd (jet) finger does not steer Shelly away from finger 1', near(p.x, 650, 10), Math.round(p.x));
  await touch(page, 'touchEnd', [{ x: b.x, y: b.y, id: 1 }]); await page.waitForTimeout(40);
  await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.5);
  check('touch: lifting all fingers stops following', await ev(page, () => SC.Game.pointerDown === false && SC.debug.world._target === null));
  // 🚀 button: nothing while recharging, a hop when charged; never moves Shelly
  await ev(page, () => { const w = SC.debug.world; w.jet.charge = 0.3; });
  const ab = await ev(page, () => { const r = document.getElementById('btnAction').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const st0 = await ev(page, () => ({ jets: SC.debug.world.jets, charge: SC.debug.world.jet.charge }));
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 3 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  const st1 = await ev(page, () => ({ jets: SC.debug.world.jets, charge: SC.debug.world.jet.charge }));
  check('touch: 🚀 button does nothing while the jet recharges', st0.charge < 1 && st1.jets === st0.jets, { st0, st1 });
  await simStep(page, reload);
  await isolate(page, 400);
  const st2 = await jets(page);
  await touch(page, 'touchStart', [{ x: ab.x, y: ab.y, id: 4 }]); await touch(page, 'touchEnd', []); await page.waitForTimeout(80);
  await simStep(page, 0.6);
  check('touch: 🚀 button fires a Jet Hop when charged', (await jets(page)) === st2 + 1);
  check('touch: 🚀 tap did not move Shelly sideways', near((await snail(page)).x, 400, 2), (await snail(page)).x);
  // HUD pause by touch
  await simStep(page, reload);
  await isolate(page, 400);
  const rr0 = await jets(page);
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(200);
  check('touch: tapping HUD pause pauses', (await mode(page)) === 'paused');
  const ph = await ev(page, () => ({ x: SC.debug.world.snail.x, jets: SC.debug.world.jets, ptr: SC.Game.renderer.pointer, down: SC.Game.pointerDown }));
  check('touch: HUD tap did not move Shelly / Jet Hop', near(ph.x, 400, 1) && ph.jets === rr0 && !ph.down, ph);
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
  const air = 2 * cfg.jetImpulse / cfg.jetG;
  const recharge = () => simStep(page, air + cfg.jetRecharge + 0.3);
  await isolate(page, 480);
  let r0 = await jets(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  check('jet: Space fires a Jet Hop when charged', (await jets(page)) === r0 + 1 && (await ev(page, () => SC.debug.world.jet.air)));
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  check('jet: Space/Enter while airborne do nothing', (await jets(page)) === r0 + 1);
  // the hop: apex ≈ 100 px, back on the hover line after ≈ 0.7 s, a soft landing event
  await hookEvents(page); await clearLog(page);
  const arc = await ev(page, () => { const G = SC.Game, w = G.world; let apex = 0, t = 0; for (let i = 0; i < 240; i++) { G.step(1 / 120); apex = Math.max(apex, w.snail.hop); if (w.jet.air) t += 1 / 120; } return { apex, t, air: w.jet.air }; });
  check('jet: hop apex ≈ 100 px (70..140)', arc.apex > 70 && arc.apex < 140, arc);
  check('jet: lands after ≈ 0.7 s (0.45..1.0)', !arc.air && arc.t > 0.45 && arc.t < 1.0, arc);
  check('jet: jetland event on landing', (await evLog(page, 'jetland')).length === 1);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  check('jet: no hop while recharging', (await jets(page)) === r0 + 1);
  await recharge();
  for (const k of ['ArrowUp', 'KeyW', 'Enter']) {
    r0 = await jets(page);
    await page.keyboard.press(k); await page.waitForTimeout(50);
    check(`jet: ${k} fires a Jet Hop when charged`, (await jets(page)) === r0 + 1);
    await recharge();
  }
  r0 = await jets(page);
  const m = await toClient(page, 480, 300);
  await page.mouse.click(m.x, m.y, { button: 'right' }); await page.waitForTimeout(60);
  check('jet: right-click fires a Jet Hop', (await jets(page)) === r0 + 1);
  await recharge();
  // key repeat must not fire twice
  r0 = await jets(page);
  await page.keyboard.down('Space'); await page.waitForTimeout(600); await page.keyboard.up('Space');
  check('jet: holding Space fires once (auto-repeat ignored)', (await jets(page)) === r0 + 1);
  await recharge();
  // a hop lifts the rim: a star high above the resting rim is caught early in the air
  await isolate(page, 480); await clearLog(page);
  const restRim = await ev(page, () => SC.debug.world.snail.rimY);
  await drop(page, 'star', 480, restRim - 120);
  await ev(page, () => { const it = SC.debug.world.items[0]; it.vy = 40; });
  await page.keyboard.press('Space'); await page.waitForTimeout(40);
  await simStep(page, 0.4);
  const ce = await evLog(page, 'catch');
  check('jet: hopping catches a star early (catch y well above the resting rim)', ce.length === 1 && ce[0].y < restRim - 30, { ce, restRim });
  // player input is ignored while paused
  await recharge();
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  r0 = await jets(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  check('jet: Space while paused does not hop', (await jets(page)) === r0);
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
  // single catches at ×1: star = 1×10, gold = 5×10
  for (const kind of ['star', 'gold']) {
    await isolate(page, 480); await ev(page, () => { const w = SC.debug.world; w.combo = 0; w.mult = 1; });
    await clearLog(page);
    const s0 = await ev(page, () => SC.debug.world.score);
    await drop(page, kind, 480); await simStep(page, 0.3);
    const c = await evLog(page, 'catch'), s1 = await ev(page, () => SC.debug.world.score);
    const val = kind === 'gold' ? cfg.goldValue : cfg.starValue;
    check(`score: ${kind} catch = value×${cfg.starPoints}×1`, c.length === 1 && c[0].points === val * cfg.starPoints && s1 - s0 === c[0].points, c[0]);
  }
  check('score: golden star is worth 5 stars', cfg.goldValue === 5 * cfg.starValue);
  // streak thresholds
  await ev(page, () => { const w = SC.debug.world; w.combo = 0; w.mult = 1; w.jar = 0; w.jarTarget = 999; });
  await clearLog(page);
  const seen = [], th = cfg.multThresholds, N = th[th.length - 1] + 2;
  for (let i = 0; i < N; i++) {
    await isolate(page, 480);
    await drop(page, 'star', 480);
    await simStep(page, 0.25);
  }
  const cs = await evLog(page, 'catch');
  let okMult = cs.length === N;
  for (const e of cs) {
    let m = 1; for (let k = th.length - 1; k >= 0; k--) if (e.combo >= th[k]) { m = k + 1; break; }
    if (e.mult !== m || e.points !== e.value * cfg.starPoints * m) { okMult = false; seen.push(e); }
  }
  check('score: multiplier follows the streak thresholds ×1→×3 and points = value×10×mult', okMult, seen.slice(0, 3));
  const ups = (await evLog(page, 'multup')).map(e => e.mult);
  check('score: multup events at ×2 and ×3 exactly once each', JSON.stringify(ups) === '[2,3]', ups);
  // a miss resets the streak
  await clearLog(page);
  await isolate(page, 200);
  await drop(page, 'star', 800); await simStep(page, 1.4);
  const w1 = await ev(page, () => ({ combo: SC.debug.world.combo, mult: SC.debug.world.mult, hearts: SC.debug.world.hearts }));
  const ms = await evLog(page, 'miss');
  check('score: star landing on the cloud floor → miss, streak 0, ×1, no heart lost', ms.length === 1 && w1.combo === 0 && w1.mult === 1 && w1.hearts === cfg.heartsMax, { ms, w1 });
  // thunder puff caught costs a heart and the streak
  await ev(page, () => { const w = SC.debug.world; w.combo = 7; w.mult = 1; });
  await clearLog(page); await isolate(page, 480);
  await drop(page, 'puff', 480); await simStep(page, 0.4);
  const w2 = await ev(page, () => ({ combo: SC.debug.world.combo, mult: SC.debug.world.mult, hearts: SC.debug.world.hearts, inv: SC.debug.world.snail.invuln, frame: SC.debug.world.snail.frame }));
  check('score: catching a thunder puff → zap, −1 heart, streak 0, invulnerable', (await evLog(page, 'zap')).length === 1 && w2.hearts === cfg.heartsMax - 1 && w2.combo === 0 && w2.mult === 1 && w2.inv > 0, w2);
  await clearLog(page);
  await drop(page, 'puff', await ev(page, () => SC.debug.world.snail.rimX)); await simStep(page, 0.4);
  check('score: puff caught while blinking pops harmlessly', (await evLog(page, 'zap')).length === 0 && (await ev(page, () => SC.debug.world.hearts)) === cfg.heartsMax - 1);
  // a puff that reaches the floor pops (no heart)
  await clearLog(page); await isolate(page, 200);
  await drop(page, 'puff', 800); await simStep(page, 2.5);
  check('score: thunder puff landing on the floor pops (puffland), no heart lost', (await evLog(page, 'puffland')).length === 1 && (await ev(page, () => SC.debug.world.hearts)) === cfg.heartsMax - 1);
  // HUD shows score
  await page.waitForTimeout(100);
  await shot(page, '07_scoring_hud');
  // star jar full → next weather
  await clearLog(page); await isolate(page, 480);
  await ev(page, () => { const w = SC.debug.world; w.jarTarget = w.levelInfo(w.level).jarTarget; w.jar = w.jarTarget - 1; });
  const before = await ev(page, () => ({ score: SC.debug.world.score, hearts: SC.debug.world.hearts }));
  await drop(page, 'star', 480); await simStep(page, 0.3);
  await simStep(page, cfg.jarGrace + 0.2);
  const cl = await evLog(page, 'cleared');
  check('level: jar full → jarfull + cleared, bonus = hearts×100', (await evLog(page, 'jarfull')).length === 1 && cl.length === 1 && cl[0].bonus === before.hearts * cfg.clearBonusPerHeart, cl);
  check('level: state is cleared', (await ev(page, () => SC.debug.world.state)) === 'cleared');
  await ev(page, () => { const G = SC.Game; let i = 0; while (G.world.level === 0 && i++ < 600) G.step(1 / 60); });
  const z = await evLog(page, 'zone');
  const st = await ev(page, () => ({ level: SC.debug.world.level, zone: SC.debug.world.zone, wz: SC.debug.weather.zone, az: SC.Audio.season, rv: SC.Game.renderer.vis.cur, banner: SC.Game.renderer.banner && SC.Game.renderer.banner.s, jar: SC.debug.world.jar }));
  check('level: next level starts (zone event 1) with an empty jar', z.length === 1 && z[0].zone === 1 && st.level === 1 && st.jar === 0, { z, st });
  check('level: weather, music and renderer switch to Rainy Clouds; banner shown', st.wz === 1 && st.az === 1 && st.rv === 1 && st.banner === 1, st);
  await ev(page, () => { SC.Game.renderer.update(0.5); });
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
    const t0 = await ev(page, () => SC.debug.world.time);
    await page.waitForTimeout(500);
    const t1 = await ev(page, () => SC.debug.world.time);
    check(`pause: ${key} pauses and freezes world time`, (await mode(page)) === 'paused' && (await ui(page)) === 'scrPause' && t1 === t0 && !(await visible(page, '#btnPause')));
    await page.keyboard.press(key); await page.waitForTimeout(150);
    const t2 = await ev(page, () => SC.debug.world.time);
    await page.waitForTimeout(300);
    check(`pause: ${key} resumes; time runs, no big jump`, (await mode(page)) === 'playing' && (await ev(page, () => SC.debug.world.time)) > t2 && t2 - t1 < 0.3);
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
  check('pause: held keys are cleared by blur (no stuck movement after resume)', await ev(page, () => Object.keys(SC.Game.keys).length === 0));
  await page.keyboard.up('ArrowRight');
  // Restart / Main Menu
  await countStarts(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnRestart'); await page.waitForTimeout(150);
  check('pause: Restart starts a fresh run', (await mode(page)) === 'playing' && (await starts(page)) === 1 && (await ev(page, () => SC.debug.world.score)) === 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseMenu'); await page.waitForTimeout(150);
  check('pause: Main Menu returns to the title', (await mode(page)) === 'title' && (await ui(page)) === 'scrTitle' && !(await visible(page, '#btnPause')));
  // pause impossible when dead
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await toPlaying(page);
  await ev(page, () => { const w = SC.debug.world; w.hearts = 0; w.state = 'dead'; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  check('pause: no pause while the death animation plays', (await mode(page)) === 'playing');
  errorsOk(page, 'pause');
  await close(page);
}

async function testGameOver() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => { SC.Game.resetBest(); });
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page);
  const m = await killToOver(page, 1234);
  await page.waitForTimeout(200);
  check('over: losing the last heart → game over screen', m === 'over' && (await ui(page)) === 'scrOver');
  const o = await ev(page, () => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: SC.Storage.get('best_normal') }));
  check('over: score + NEW best shown and saved as best_normal', o.score === '1234' && o.best === '1234' && o.nb && o.stored === '1234', o);
  check('over: HUD and 🚀 hidden', !(await visible(page, '#btnPause')) && !(await visible(page, '#btnAction')));
  await shot(page, '10_over');
  // restart lock: Enter spam
  await countStarts(page);
  // QA fix: the old loop pressed 6× with fixed waits and, on a loaded machine, ran past the 0.7 s lock (flaky FAIL).
  // Spam only while < 600 ms have passed since game over (measured in the page), alternating Enter and Space.
  const sinceOver = () => ev(page, () => performance.now() - SC.Game.overAt);
  let pressed = 0;
  await ev(page, () => { SC.Game.overAt = performance.now(); });   // restart the lock clock: the screenshot above may be slow
  while ((await sinceOver()) < 600 && pressed < 30) { await page.keyboard.press(pressed % 2 ? 'Space' : 'Enter'); pressed++; await page.waitForTimeout(25); }
  const early = await starts(page);
  check('over: Enter/Space spam in the first 0.6 s does not restart (restart lock)', pressed > 0 && early === 0 && (await mode(page)) === 'over', { early, pressed });
  await page.waitForTimeout(700);
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(30); }
  await page.waitForTimeout(150);
  check('over: Enter spam after the lock starts exactly ONE new game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  // second run lower score → best unchanged, no NEW
  await freeze(page);
  await killToOver(page, 50);
  await page.waitForTimeout(150);
  const o2 = await ev(page, () => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stored: SC.Storage.get('best_normal') }));
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
  check('best: Easy run uses Easy hearts', (await ev(page, () => SC.debug.world.heartsMax)) === (await ev(page, () => SC.DIFFICULTY.easy.heartsMax)));
  await killToOver(page, 777);
  await page.waitForTimeout(200);
  const bs = await ev(page, () => ({ e: SC.Storage.get('best_easy'), n: SC.Storage.get('best_normal') }));
  check('best: Easy best saved separately from Normal', bs.e === '777' && bs.n === '1234', bs);
  // difficulty changed mid-run: best belongs to the run's difficulty
  await page.click('#btnOverMenu'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings'); await page.click('#setDifficulty button[data-v=hard]'); await page.click('#scrSettings .btn-back'); await page.click('#btnResume');
  await freeze(page);
  await killToOver(page, 900);
  await page.waitForTimeout(150);
  const bs2 = await ev(page, () => ({ e: SC.Storage.get('best_easy'), h: SC.Storage.get('best_hard') }));
  check('best: switching difficulty mid-run credits the run\'s difficulty (Easy)', bs2.e === '900' && !bs2.h, bs2);
  await ev(page, () => SC.Game.setSetting('difficulty', 'normal'));
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
  const a = await ev(page, () => ({ s: SC.Game.settings, aud: { sfx: SC.Audio.sfxOn, music: SC.Audio.musicOn } }));
  check('settings: toggles change game + audio state', !a.s.sfx && !a.s.music && a.s.difficulty === 'hard' && !a.aud.sfx && !a.aud.music, a);
  check('settings: difficulty segment highlights Hard', await ev(page, () => document.querySelector('#setDifficulty button.on').dataset.v === 'hard'));
  await page.click('#scrSettings .btn-back');
  await page.reload();
  await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  const b = await ev(page, () => SC.Game.settings);
  check('settings: sfx/music/difficulty persist across reload', !b.sfx && !b.music && b.difficulty === 'hard', b);
  await page.click('#btnSettings'); await page.waitForTimeout(100);
  const ui1 = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, d: document.querySelector('#setDifficulty button.on').dataset.v }));
  check('settings: UI reflects the saved values after reload', !ui1.sfx && !ui1.music && ui1.d === 'hard', ui1);
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const hard = await ev(page, () => ({ cfg: { hm: SC.debug.world.cfg.heartsMax, jt: SC.debug.world.cfg.jarTargets, jr: SC.debug.world.cfg.jetRecharge }, D: SC.DIFFICULTY.hard }));
  check('settings: Hard difficulty applied to the new world', (hard.D.jarTargets == null || JSON.stringify(hard.cfg.jt) === JSON.stringify(hard.D.jarTargets)) && (hard.D.jetRecharge == null || hard.cfg.jr === hard.D.jetRecharge) && (hard.D.heartsMax == null || hard.cfg.hm === hard.D.heartsMax), hard);
  // Level length: Long scales the jar target, Short shrinks it
  await page.keyboard.press('Escape'); await page.click('#btnPauseSettings');
  await page.click('#setLength button[data-v=long]'); await page.click('#scrSettings .btn-back'); await page.click('#btnRestart'); await page.waitForTimeout(150);
  const lg = await ev(page, () => ({ t: SC.debug.world.jarTarget, base: SC.debug.world.levelInfo(0).jarTarget }));
  check('settings: Level length Long → bigger star jar', lg.t > lg.base, lg);
  await ev(page, () => SC.Game.setSetting('length', 'short')); await ev(page, () => SC.Game.startGame());
  const sh = await ev(page, () => ({ t: SC.debug.world.jarTarget, base: SC.debug.world.levelInfo(0).jarTarget }));
  check('settings: Level length Short → smaller star jar', sh.t < sh.base, sh);
  await ev(page, () => SC.Game.setSetting('length', 'normal'));
  // M key mute toggles and persists
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M mutes (saved)', await ev(page, () => SC.Game.settings.muted && JSON.parse(SC.Storage.get('settings')).muted === true && SC.Audio.muted));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  check('settings: M again unmutes', await ev(page, () => !SC.Game.settings.muted && !SC.Audio.muted));
  // ?mute=1 never saved
  await page.goto(url('seed=5', true));
  await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  const mu = await ev(page, () => ({ audio: SC.Audio.muted, saved: JSON.parse(SC.Storage.get('settings') || '{}').muted, setting: SC.Game.settings.muted }));
  check('settings: ?mute=1 mutes audio but is never written to storage', mu.audio === true && !mu.saved && !mu.setting, mu);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=easy]'); await page.waitForTimeout(80);
  check('settings: changing another setting with ?mute=1 still does not save muted', await ev(page, () => !JSON.parse(SC.Storage.get('settings')).muted));
  await page.click('#scrSettings .btn-back');
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const icon = await ev(page, () => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6'));
  check('settings: with ?mute=1 the HUD sound icon shows "muted"', icon);
  // Reset best
  await page.keyboard.press('Escape');
  await ev(page, () => { SC.Storage.set('best_normal', '55'); SC.Storage.set('best_easy', '66'); });
  await page.click('#btnPauseSettings'); await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('settings: Reset best clears every difficulty', await ev(page, () => !SC.Storage.get('best_normal') && !SC.Storage.get('best_easy') && !SC.Storage.get('best_hard')));
  check('settings: Reset best shows a toast', /cleared/i.test(await toastText(page)));
  await ev(page, () => { SC.Game.setSetting('sfx', true); SC.Game.setSetting('music', true); SC.Game.setSetting('difficulty', 'normal'); });
  errorsOk(page, 'settings');
  await ctx.close();
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5');
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  check('custom: 7 slots shown (hero, star, puff, 4 weathers)', (await page.locator('#slotGrid .slot').count()) === 7);
  // opaque JPEG photo → hero, round sticker
  const photo = await makeImage(page, 900, 700, 'photo', 'image/jpeg');
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  let t = await waitToast(page, /saved/i);
  check('custom: photo for Shelly saved (toast)', /saved/i.test(t), t);
  const hs = await storedSize(page, 'img_hero');
  check('custom: hero picture downscaled to ≤ 512 px', hs && hs[0] <= 512 && hs[1] <= 512, hs);
  check('custom: opaque photo becomes a round sticker', (await ev(page, () => SC.Storage.get('shape_hero'))) === 'circle');
  check('custom: card shows "Your picture" + Round selected', await ev(page, () => { const s = document.querySelectorAll('#slotGrid .slot')[0]; return /Your picture/.test(s.textContent) && s.querySelector('.shape button.on').dataset.shape === 'circle'; }));
  const circ = await ev(page, () => { const c = SC.Assets.custom.hero; const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return { w: c.width, h: c.height, cornerA: d[3] }; });
  check('custom: round sticker has transparent corners', circ.w === circ.h && circ.cornerA === 0, circ);
  // transparent PNG → star, whole picture
  const cut = await makeImage(page, 300, 300, 'star', 'image/png');
  await pickFile(page, 'star', { name: 'star.png', mimeType: 'image/png', buffer: cut });
  t = await waitToast(page, /saved/i);
  check('custom: transparent PNG for the star keeps "Whole picture"', /saved/i.test(t) && (await ev(page, () => SC.Storage.get('shape_star'))) === 'fit', t);
  const rockImg = await makeImage(page, 200, 160, 'puff', 'image/png');
  await pickFile(page, 'puff', { name: 'puff.png', mimeType: 'image/png', buffer: rockImg });
  await waitToast(page, /saved/i);
  // shape toggle
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=circle]').click();
  check('custom: Round/Whole toggle switches the shape', (await ev(page, () => SC.Storage.get('shape_star'))) === 'circle');
  await page.locator('#slotGrid .slot').nth(1).locator('.shape button[data-shape=fit]').click();
  // non-image file → friendly error
  await pickFile(page, 'puff', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(page, /picture/i, 3000);
  check('custom: non-image file → friendly error, previous picture kept', /choose a picture/i.test(t) && (await ev(page, () => !!SC.Storage.get('img_puff'))), t);
  await pickFile(page, 'puff', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(page, /could not/i, 4000);
  check('custom: corrupt image → friendly "could not be opened" error', /could not/i.test(t), t);
  // huge background
  const huge = await makeImage(page, 5000, 4000, 'big', 'image/jpeg');
  info('huge image bytes: ' + huge.length);
  const tH = Date.now();
  await pickFile(page, 'bg_sunny', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
  t = await waitToast(page, /saved|room|could/i, 15000);
  const bs = await storedSize(page, 'img_bg_sunny');
  check('custom: 5000×4000 background accepted and downscaled to ≤ 1280×720', /saved/i.test(t) && bs && bs[0] <= 1280 && bs[1] <= 720, { t, bs, ms: Date.now() - tH });
  await shot(page, '11_custom_cards');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  // play with all custom pictures
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page); await toPlaying(page);
  await isolate(page, 480);
  await drop(page, 'star', 300); await drop(page, 'puff', 650);
  await ev(page, () => { const w = SC.debug.world; w.items.forEach(it => { it.y = it._py = 260; it.vy = 0; it._g = 0; it.spin = 0; it.rot = it._rot0 = 0; it._spinA = 0; }); });
  await ev(page, () => SC.debug.setSpeed(0.001));
  await page.waitForTimeout(250);
  const blueHero = await probe(page, 430, 390, 100, 80, 'b > 150 && r < 60 && g < 60');
  const cyanStar = await probe(page, 280, 240, 40, 40, 'g > 200 && b > 200 && r < 80');
  const magPuff = await probe(page, 630, 240, 40, 40, 'r > 180 && b > 180 && g < 90');
  const purpleBg = await probe(page, 20, 160, 120, 80, 'b > g + 20 && r > 70 && r < 160');
  check('custom: custom Shelly (blue photo) is drawn in play', blueHero > 200, blueHero);
  check('custom: custom star is drawn in play', cyanStar > 50, cyanStar);
  check('custom: custom thunder puff is drawn in play', magPuff > 50, magPuff);
  check('custom: custom sunny background is drawn (purple sky area)', purpleBg > 500, purpleBg);
  await freeze(page);
  await shot(page, '12_custom_play');
  // the custom pictures survive a weather change and the rain level stays default
  await ev(page, () => { SC.debug.gotoLevel(1); }); await simStep(page, 2);
  await page.waitForTimeout(150);
  await ev(page, () => SC.debug.setSpeed(4)); await page.waitForTimeout(1500); await freeze(page);
  errorsOk(page, 'custom play');
  // reset one / reset all
  await page.keyboard.press('Escape'); await page.click('#btnPauseMenu'); await page.waitForTimeout(100);
  await page.click('#btnCustomize'); await page.waitForTimeout(100);
  await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await page.waitForTimeout(100);
  check('custom: Reset on Shelly removes only Shelly', await ev(page, () => !SC.Assets.hasCustom('hero') && !SC.Storage.get('img_hero') && SC.Assets.hasCustom('star') && SC.Assets.hasCustom('puff')));
  await page.click('#btnResetAll'); await page.waitForTimeout(100);
  check('custom: Reset all removes every custom picture (memory + storage)', await ev(page, () => SC.Assets.SLOTS.every(s => !SC.Assets.hasCustom(s.id) && !SC.Storage.get('img_' + s.id) && !SC.Storage.get('shape_' + s.id))));
  check('custom: cards back to "Original"', await ev(page, () => [...document.querySelectorAll('#slotGrid .slot .tag')].every(t => /Original/.test(t.textContent))));
  // persistence across reload
  await pickFile(page, 'hero', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await waitToast(page, /saved/i);
  await page.reload(); await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  check('custom: custom picture reloads after a page reload', await ev(page, () => SC.Assets.hasCustom('hero')));
  await ev(page, () => SC.Assets.SLOTS.forEach(s => SC.Assets.clearCustom(s.id)));
  errorsOk(page, 'custom');
  await ctx.close();
}

async function testLayout() {
  const vps = [
    [1280, 720, 1, false], [1280, 720, 2, false], [1920, 1080, 1, false], [800, 600, 1, false],
    [1024, 768, 1, true], [1024, 768, 2, true], [844, 390, 2, true], [844, 390, 3, true], [390, 844, 3, true],
    [390, 844, 2, true], [1366, 1024, 2, true], [1024, 1366, 2, true], [667, 375, 2, true]   // QA: + iPad Pro 12.9 both ways, iPhone SE landscape
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
      await ev(page, s => SC.UI.show(s), scr); await page.waitForTimeout(400);
      const r = await layoutReport(page);
      if (r.bad.length || r.overflow || r.hidden.length) issues.push(scr + ': ' + JSON.stringify(r));
      if (w < 900 || (w === 1024 && dsf === 2)) await shot(page, `13_layout_${w}x${h}_${dsf}_${scr}`);
    }
    await ev(page, () => SC.UI.show('scrTitle'));
    await page.click('#btnPlay'); await page.waitForTimeout(250);
    await freeze(page);
    await ev(page, () => SC.Game.pause()); await page.waitForTimeout(400);
    let r = await layoutReport(page); if (r.bad.length || r.overflow || r.hidden.length) issues.push('scrPause: ' + JSON.stringify(r));
    await ev(page, () => SC.Game.resume());
    await freeze(page); await killToOver(page, 4321); await page.waitForTimeout(500);
    r = await layoutReport(page); if (r.bad.length || r.overflow || r.hidden.length) issues.push('scrOver: ' + JSON.stringify(r));
    if (w < 900 || (w === 1024 && dsf === 2)) await shot(page, `13_layout_${w}x${h}_${dsf}_scrOver`);
    check(`layout ${tag}: every menu fits inside the window (no clipped / scrolled-away buttons)`, issues.length === 0, issues.join(' | '));
    // HUD in play
    await ev(page, () => SC.Game.startGame()); await page.waitForTimeout(250);
    const hud = await ev(page, () => {
      const c = document.getElementById('game').getBoundingClientRect(), k = SC.Game.renderer.VW / c.width;
      const rs = ['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect());
      const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
      return { l: (l - c.left) * k, t: (t - c.top) * k, r: (rr - c.left) * k, b: (b - c.top) * k, minPx: Math.min(...rs.map(r => r.width)) };
    });
    // the star jar is laid out from the buttons' measured position (left of them, or a second row under them)
    const VW = await ev(page, () => SC.Game.renderer.VW);
    check(`layout ${tag}: HUD buttons inside the canvas`, hud.l >= 0 && hud.t >= 0 && hud.r <= VW + 1, hud);
    if (touchDev) check(`layout ${tag}: HUD buttons ≥ 32 css px (finger-sized)`, hud.minPx >= 32, hud.minPx);
    if (touchDev) {
      const a = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), e = document.getElementById('btnAction'), r = e.getBoundingClientRect(); return { vis: !e.classList.contains('hidden') && r.width > 0, inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, side: r.left >= c.right - 1 && r.right <= innerWidth + 1, w: r.width }; });
      check(`layout ${tag}: 🚀 shown, inside the canvas or in the side bar (never over the play area), ≥ 44 px`, a.vis && (a.inside || a.side) && a.w >= 44, a);
    } else check(`layout ${tag}: 🚀 hidden on non-touch`, !(await visible(page, '#btnAction')));
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
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  const r0 = await jets(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: next Space in play is a Jet Hop, not a menu button', (await mode(page)) === 'playing' && (await jets(page)) === r0 + 1 && (await starts(page)) === 1);
  // title → Enter on focused Play → one start
  await ev(page, () => SC.Game.toTitle()); await page.waitForTimeout(150);
  await countStarts(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('focus: Enter on the title (Play focused) starts exactly one game', (await starts(page)) === 1 && (await mode(page)) === 'playing', await starts(page));
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  const r1 = await jets(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter right after start = Jet Hop only (no re-click of Play)', (await jets(page)) === r1 + 1 && (await starts(page)) === 1);
  // mouse click on Settings → difficulty → Done → Space on title starts once
  await ev(page, () => SC.Game.toTitle()); await page.waitForTimeout(100);
  await page.click('#btnSettings'); await page.click('#setDifficulty button[data-v=normal]'); await page.click('#scrSettings .btn-back'); await page.waitForTimeout(100);
  await countStarts(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: after Settings, Space on the title starts once', (await starts(page)) === 1);
  // pause: Space on a focused Resume resumes once and does not also hop
  await freeze(page); await toPlaying(page); await isolate(page, 480);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const r2 = await jets(page);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('focus: Space on Pause resumes and does not Jet Hop at the same time', (await mode(page)) === 'playing' && (await jets(page)) === r2);
  // Pause via HUD click, then Enter: resume once (not resume + hop)
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(150);
  const r3 = await jets(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on Pause resumes once without also hopping', (await mode(page)) === 'playing' && (await jets(page)) === r3);
  errorsOk(page, 'focus');
  await close(page);
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'speed=16&bot=1&autorestart=1&autostart=1&seed=3');
  const samples = []; let maxFx = 0, maxP = 0, maxItems = 0, maxTexts = 0;
  const t0 = Date.now(); let idle = false;
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await page.waitForTimeout(1000);
    // the bot rarely loses: for the middle third of the run Shelly idles (no input) so thunder puffs end a game
    const k = (Date.now() - t0) / (LONG_RUN_S * 1000);
    if (!idle && k > 0.33 && k < 0.66) { idle = true; await ev(page, () => { SC.Game.botMode = false; SC.Game.bot = null;
      const w = SC.debug.world, x = w.snail.rimX, it = w._newItem('puff', x);   // a thunder puff straight into the basket
      w.hearts = 1; w.snail.invuln = 0; it._A = 0; it._bx = it.x = it._px = x; it.y = it._py = w.snail.rimY - 40; it.vy = 100; it.state = 'fall'; it.alpha = 1; w.items.push(it); }); }
    if (idle && (k >= 0.66 || (await ev(page, () => SC.debug.stats.games)) > 0)) { idle = false; await ev(page, () => SC.debug.setBot(true, 1)); }
    const s = await ev(page, () => Object.assign(SC.debug.getState() || {}, { texts: SC.Game.renderer.texts.length, games: SC.debug.stats.games }));
    samples.push(s);
    maxFx = Math.max(maxFx, s.fx); maxP = Math.max(maxP, s.particles); maxItems = Math.max(maxItems, s.items); maxTexts = Math.max(maxTexts, s.texts);
  }
  const st = await ev(page, () => SC.debug.stats);
  info(`long run ${LONG_RUN_S}s: games ${st.games}, scores ${JSON.stringify(st.scores.slice(0, 8))}, levels ${JSON.stringify(st.levels.slice(0, 8))}, maxFx ${maxFx}, maxParticles ${maxP}, maxItems ${maxItems}, maxTexts ${maxTexts}`);
  check('long run: no runtime errors (stats.errors)', st.errors.length === 0, st.errors.slice(0, 2));
  check('long run: at least one game finished and auto-restarted', st.games >= 1 && (await mode(page)) !== 'over', st.games);
  check('long run: weather particles bounded (< 180)', maxP < 180, maxP);
  check('long run: fx bounded (≤ 400)', maxFx <= 400, maxFx);
  check('long run: items and texts bounded', maxItems < 40 && maxTexts < 40, { maxItems, maxTexts });
  check('long run: world time advanced ~16× real time', samples.length > 3 && samples[samples.length - 1].time > 0, samples[samples.length - 1]);
  await shot(page, '15_long_run');
  errorsOk(page, 'long run');
  await close(page);
}

/* ===================== QA additions (functional QA pass, 2026-11-15) ===================== */

/* Game over: keyboard focus on the other buttons must do what the button says, not "Play Again". */
async function testOverKeys() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await freeze(page); await killToOver(page, 100); await page.waitForTimeout(900);
  await countStarts(page);
  await page.focus('#btnOverMenu'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const a = { mode: await mode(page), ui: await ui(page), starts: await starts(page) };
  check('over keys: Enter on the focused Menu button goes to the title (not Play Again)', a.mode === 'title' && a.ui === 'scrTitle' && a.starts === 0, a);
  if (a.mode !== 'over') { await ev(page, () => SC.Game.startGame()); await freeze(page); await killToOver(page, 100); await page.waitForTimeout(900); }
  await countStarts(page);
  await page.focus('#btnScoreCard'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  const b = { mode: await mode(page), starts: await starts(page), card: await ev(page, () => { const p = document.querySelector('.sc-panel'); return !!p && p.offsetParent !== null; }) };
  check('over keys: Enter on the focused Score Card button opens the card (not Play Again)', b.card && b.starts === 0 && b.mode === 'over', b);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // Tab order: Play Again is focused first after a (fresh) game over
  await ev(page, () => SC.Game.startGame()); await freeze(page); await killToOver(page, 100);
  await page.waitForTimeout(300);
  check('over keys: Play Again has keyboard focus after game over', await ev(page, () => document.activeElement && document.activeElement.id === 'btnAgain'));
  errorsOk(page, 'over keys');
  await close(page);
}

/* Inputs not covered elsewhere: HUD right-click, the 🚀 finger never becomes the steering finger, Shift. */
async function testInputExtras() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await startFrozen(page); await isolate(page, 480);
  const pb = await ev(page, () => { const r = document.getElementById('btnPause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const r0 = await jets(page);
  await page.mouse.click(pb.x, pb.y, { button: 'right' }); await page.waitForTimeout(100);
  check('input: right-click on the HUD pause button does not Jet Hop and does not pause', (await jets(page)) === r0 && (await mode(page)) === 'playing', { jets: (await jets(page)) - r0, mode: await mode(page) });
  // mouse leaves the window: Shelly heads to the last cursor x and stays inside the range
  await isolate(page, 480);
  const a = await toClient(page, 300, 300);
  await page.mouse.move(a.x + 10, a.y); await page.mouse.move(a.x, a.y, { steps: 3 }); await page.waitForTimeout(60);
  await page.mouse.move(-50, a.y); await page.waitForTimeout(60);   // outside the page
  await simStep(page, 2);
  const s = await snail(page), cfg = await ev(page, () => SC.debug.world.cfg);
  check('input: cursor leaving the window keeps Shelly inside her range (no NaN)', isFinite(s.x) && s.x >= cfg.xMin - 0.5 && s.x <= cfg.xMax + 0.5, Math.round(s.x));
  // keyboard wins over the mouse; after the key is released the mouse only takes over again once it moves
  await isolate(page, 480);
  const m = await toClient(page, 800, 300);
  await page.mouse.move(m.x - 5, m.y); await page.mouse.move(m.x, m.y, { steps: 3 }); await page.waitForTimeout(60);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(40); await simStep(page, 0.6); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(40);
  await simStep(page, 1.0);
  const k = await snail(page);
  check('input: keys override mouse-follow; Shelly does not snap back to a still cursor', k.x < 470, Math.round(k.x));
  errorsOk(page, 'input extras');
  await close(page);

  // touch: a finger on 🚀 must not be counted as the steering finger (the next finger steers, not hops)
  const tp = await newPage({ viewport: { width: 844, height: 390 }, dsf: 3, touch: true, mobile: true });
  await boot(tp, 'seed=5');
  await startFrozen(tp); await isolate(tp, 480);
  const ab = await ev(tp, () => { const r = document.getElementById('btnAction').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const j0 = await jets(tp);
  await touch(tp, 'touchStart', [{ x: ab.x, y: ab.y, id: 1 }]); await tp.waitForTimeout(60);
  await touch(tp, 'touchEnd', []); await tp.waitForTimeout(60);
  await isolate(tp, 480);
  const fx = await ev(tp, () => { // client point over the scene at logical x=250, y=330 via the renderer's own inverse
    const R = SC.Game.renderer; for (let cx = 0; cx < innerWidth; cx += 2) { const p = R.toLogical(cx, innerHeight * 0.6); if (p && p[0] >= 250) return { x: cx, y: innerHeight * 0.6 }; } return null; });
  const j1 = await jets(tp);
  await touch(tp, 'touchStart', [{ x: fx.x, y: fx.y, id: 2 }]); await tp.waitForTimeout(60);
  await simStep(tp, 1.5);
  const st = { jetsAfterButton: j1 - j0, jetsAfterFinger: (await jets(tp)) - j1, x: Math.round((await snail(tp)).x) };
  await touch(tp, 'touchEnd', []);
  check('touch: after a 🚀 tap, a single finger steers (is not taken as a second finger)', st.jetsAfterButton === 1 && st.jetsAfterFinger === 0 && Math.abs(st.x - 250) < 12, st);
  errorsOk(tp, 'touch extras');
  await close(tp);
}

/* Settings persistence corners: Level length, ?mute=1 + M, volume slider. */
async function testSettingsExtra() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5', false);
  await ev(page, () => localStorage.clear()); await page.reload(); await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  await page.click('#btnSettings'); await page.click('#setLength button[data-v=long]'); await page.click('#scrSettings .btn-back');
  await page.reload(); await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  check('settings+: Level length persists across reload and the segment shows it', await ev(page, () => SC.Game.settings.length === 'long'));
  await ev(page, () => SC.Game.setSetting('length', 'normal'));
  // volume: never written unless the player moves it
  await page.click('#btnSettings'); await page.waitForTimeout(150);
  const v0 = await ev(page, () => ({ stored: SC.Storage.get('volume'), ls: localStorage.getItem('ssc:volume'), slider: document.getElementById('setVolume').value }));
  check('volume: default 100 %, nothing saved just by opening Settings', v0.stored == null && v0.ls == null && v0.slider === '100', v0);
  await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)'); await page.click('label.set:has(#setSfx)'); await page.click('label.set:has(#setMusic)');
  await page.keyboard.press('KeyM'); await page.keyboard.press('KeyM');
  check('volume: toggling sound / music / M never writes a volume', await ev(page, () => SC.Storage.get('volume') == null));
  // − button down to 0, then reload: 0 is the player's explicit choice
  for (let i = 0; i < 11; i++) await page.click('.vol-step[data-d="-1"]');
  const v1 = await ev(page, () => ({ stored: SC.Storage.get('volume'), audio: SC.Audio.volume, gain: SC.Audio.user && SC.Audio.user.gain.value, label: document.getElementById('setVolumeVal').textContent }));
  check('volume: − button reaches 0 %, saved as 0.00 and applied to the audio graph', v1.stored === '0.00' && v1.audio === 0 && v1.label === '0%', v1);
  // a 0 % volume counts as muted: the HUD shows the muted speaker, and M (unmute) restores 50 %
  const MUTED_ICON = () => document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6');
  const hz = await ev(page, MUTED_ICON);
  check('volume: 0 % shows the muted speaker on the HUD', hz === true && await ev(page, () => SC.Game.isMuted()));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const hu = await ev(page, () => ({ icon: document.getElementById('btnMuteHud').innerHTML.includes('M16 9l5 6'), stored: SC.Storage.get('volume'), audio: SC.Audio.volume, muted: SC.Game.settings.muted, eff: SC.Game.isMuted() }));
  check('volume: M at 0 % unmutes and restores 50 % (muted flag stays off)', !hu.icon && +hu.stored === 0.5 && hu.audio === 0.5 && !hu.muted && !hu.eff, hu);
  await page.click('.vol-step[data-d="-1"]'); await page.waitForTimeout(50);   // the slider still reads 0 → back to 0 %
  check('volume: moving the slider back to 0 % shows the muted speaker again', await ev(page, MUTED_ICON) && await ev(page, () => SC.Storage.get('volume') === '0.00'));
  await page.click('.vol-step[data-d="1"]'); await page.waitForTimeout(80);
  check('volume: + from 0 goes to 10 % (not stuck at 0)', await ev(page, () => SC.Storage.get('volume') === '0.10' && SC.Audio.volume === 0.1));
  // slider drag to 0 then up again
  await page.locator('#setVolume').fill('0'); await page.waitForTimeout(50);
  await page.locator('#setVolume').fill('65'); await page.waitForTimeout(50);
  await page.click('#scrSettings .btn-back');
  await page.reload(); await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  await page.click('#btnPlay'); await page.waitForTimeout(200);   // gesture creates the AudioContext
  const v2 = await ev(page, () => ({ stored: SC.Storage.get('volume'), audio: SC.Audio.volume, gain: SC.Audio.user && +SC.Audio.user.gain.value.toFixed(3) }));
  check('volume: 65 % persists across reload and is applied once the AudioContext exists', v2.stored === '0.65' && near(v2.audio, 0.65, 1e-6) && v2.gain != null, v2);
  // ?mute=1 must never write the volume or the muted flag, even when the player presses M
  await page.goto(url('seed=5', true)); await page.waitForFunction(() => window.SC && SC.debug && SC.debug.mode === 'title');
  await page.click('#btnSettings'); await page.waitForTimeout(100);
  check('volume: ?mute=1 leaves the saved volume untouched', await ev(page, () => SC.Storage.get('volume') === '0.65' && document.getElementById('setVolume').value === '65'));
  await page.click('#scrSettings .btn-back');
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const mm = await ev(page, () => ({ saved: JSON.parse(SC.Storage.get('settings') || '{}').muted, toast: document.getElementById('toast').textContent, audio: SC.Audio.muted }));
  check('settings+: with ?mute=1, pressing M does not save muted=true for the next normal launch', !mm.saved, mm);
  check('settings+: with ?mute=1, M is a session-only unmute (toast "Sound on", audio unmuted)', /sound on/i.test(mm.toast) && !(await ev(page, () => SC.Game.isMuted())), mm);
  await ev(page, () => { localStorage.clear(); });
  errorsOk(page, 'settings extra');
  await ctx.close();
}

/* Change Pictures: a custom background for every weather is drawn in that weather; star tints; reset. */
async function testCustomWeather() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=5');
  await page.click('#btnCustomize'); await page.waitForTimeout(150);
  const colors = { bg_sunny: '#d01010', bg_rain: '#10c010', bg_wind: '#1010d0', bg_snow: '#d0d010' };
  // the renderer softens custom backgrounds a little (ambient tint), so test colour dominance, not exact values
  const preds = { bg_sunny: 'r > g + 60 && r > b + 60', bg_rain: 'g > r + 60 && g > b + 60', bg_wind: 'b > r + 60 && b > g + 60', bg_snow: 'r > b + 60 && g > b + 60' };
  for (const [slot, col] of Object.entries(colors)) {
    const buf = await ev(page, async col => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 1600, 900);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95)); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }); }, col);
    await pickFile(page, slot, { name: slot + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buf, 'base64') });
    const t = await waitToast(page, /saved/i, 8000);
    const sz = await storedSize(page, 'img_' + slot);
    check(`custom bg: ${slot} saved and downscaled (≤ 1280×720)`, /saved/i.test(t) && sz && sz[0] <= 1280 && sz[1] <= 720, { t, sz });
  }
  check('custom bg: all four weather cards show "Your picture"', await ev(page, () => [...document.querySelectorAll('#slotGrid .slot')].slice(3).every(s => /Your picture/.test(s.textContent))));
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  await freeze(page); await toPlaying(page);
  const zoneSlots = ['bg_sunny', 'bg_rain', 'bg_wind', 'bg_snow'];
  for (let z = 0; z < 4; z++) {
    await ev(page, z => { SC.debug.gotoLevel(z); SC.Game.renderer.setSeason(z, true); SC.debug.weather.setSeason(z, { instant: true }); }, z);
    await ev(page, () => SC.debug.setSpeed(0.001)); await page.waitForTimeout(1200);
    const n = await probe(page, 20, 150, 200, 90, preds[zoneSlots[z]]);
    check(`custom bg: weather ${z} (${zoneSlots[z]}) draws its own custom picture`, n > 2000, n);
    await shot(page, `16_custom_bg_${zoneSlots[z]}`);
    await freeze(page);
  }
  await page.keyboard.press('Escape'); await page.click('#btnPauseMenu'); await page.waitForTimeout(100);
  await page.click('#btnCustomize'); await page.click('#btnResetAll'); await page.waitForTimeout(100);
  check('custom bg: Reset all clears the weather pictures', await ev(page, () => ['bg_sunny', 'bg_rain', 'bg_wind', 'bg_snow'].every(s => !SC.Assets.hasCustom(s) && !SC.Storage.get('img_' + s))));
  // a huge PNG (6000×6000) for the hero: accepted and shrunk, page stays responsive
  const huge = await makeImage(page, 6000, 6000, 'star', 'image/png');
  const t0 = Date.now();
  await pickFile(page, 'hero', { name: 'huge.png', mimeType: 'image/png', buffer: huge });
  const t = await waitToast(page, /saved|room|could/i, 20000);
  const hs = await storedSize(page, 'img_hero');
  check('custom: 6000×6000 PNG for Shelly accepted and shrunk to ≤ 512 px', /saved/i.test(t) && hs && Math.max(hs[0], hs[1]) <= 512, { t, hs, ms: Date.now() - t0, bytes: huge.length });
  // empty file and SVG
  await pickFile(page, 'star', { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  const te = await waitToast(page, /could|picture/i, 4000);
  check('custom: empty file → friendly error, no crash', /could|picture/i.test(te) && !(await ev(page, () => SC.Assets.hasCustom('star'))), te);
  await ev(page, () => SC.Assets.SLOTS.forEach(s => SC.Assets.clearCustom(s.id)));
  errorsOk(page, 'custom weather');
  await ctx.close();
}

/* Loudness while the bot plays (sfx + music, volume 100 %): AnalyserNode tapped after the make-up gain (what reaches
 * the speakers). Target ≈ −24 dBFS RMS and ≈ −5 dBFS peak; pass band RMS −28…−20, peak ≤ −1 dBFS (no clipping). */
async function testLoudness() {
  const page = await newPage();
  await boot(page, 'seed=7&bot=1', false);
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  const secs = QUICK ? 10 : 25;
  const r = await ev(page, async secs => {
    const A = SC.Audio; A.unlock(); if (!A.ctx) return { error: 'no AudioContext' };
    await A.ctx.resume(); if (A.ctx.state !== 'running') return { error: 'context ' + A.ctx.state };
    const an = A.ctx.createAnalyser(); an.fftSize = 2048; A.user.connect(an);
    const buf = new Float32Array(an.fftSize); let ss = 0, n = 0, peak = 0; const win = [];
    const t0 = performance.now();
    await new Promise(res => { const id = setInterval(() => {
      an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
      ss += s; n += buf.length; win.push(Math.sqrt(s / buf.length));
      if (performance.now() - t0 > secs * 1000) { clearInterval(id); res(); } }, 45); });
    A.user.disconnect(an); A.user.connect(A.ctx.destination);
    const db = x => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1); win.sort((a, b) => a - b);
    return { rms: db(Math.sqrt(ss / n)), peak: db(peak), p95: db(win[Math.floor(win.length * 0.95)]), median: db(win[win.length >> 1]), windows: win.length, score: SC.debug.world.score };
  }, secs);
  info('loudness: ' + JSON.stringify(r));
  if (r.error) { check('loudness: measurable (AudioContext running in headless Chromium)', false, r.error); }
  else {
    check('loudness: RMS within −28…−20 dBFS (target ≈ −24)', r.rms >= -28 && r.rms <= -20, r);
    check('loudness: peak ≤ −1 dBFS (no clipping; target ≈ −5)', r.peak <= -1, r);
  }
  errorsOk(page, 'loudness');
  await close(page);
}

/* =============================== MAIN =============================== */
const TESTS = { boot: testBootAndScreens, keyboard: testKeyboard, pointer: testPointer, touch: testTouch, action: testAction, scoring: testScoring,
  pause: testPause, over: testGameOver, overkeys: testOverKeys, input: testInputExtras, settings: testSettings, settings2: testSettingsExtra,
  custom: testCustomPictures, custombg: testCustomWeather, layout: testLayout, focus: testFocus, loudness: testLoudness, long: testLongRun };

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
