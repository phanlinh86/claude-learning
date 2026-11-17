// Dottie's Reef Parade — mobile / QA extension suite (Chromium via Playwright, http.server).
// usage: node tests/e2e/mobile.js [--quick] [--only=layout,input,custom,lock,storage,long,loud]
//   Serves game/ with `python3 -m http.server` on a free port (real http origin, like GitHub Pages).
//   --quick: long bot run 30 s instead of 180 s, loudness 15 s instead of 40 s.
// Covers what tests/e2e/functional.js does not: iPhone/iPad layouts with simulated safe-area insets and DPR 2–3
// (every panel incl. Pause / Game Over / Score Card fits or scrolls, HUD inside the safe area, Flip button vs HUD),
// HUD pointerdown never steering / flipping, the 0.7 s restart lock measured in page time, double start, real
// setInputFiles uploads (PNG, JPEG, 6000×4000, corrupt, non-image, reset), prp: storage, a multi-minute 16× bot run
// and a loudness measurement (AnalyserNode tapped after RP.Audio's output gain).
// Exits 1 on any FAIL.
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LONG_S = QUICK ? 30 : 180;
const LOUD_S = QUICK ? 15 : 40;
const GAME = path.resolve(__dirname, '../../game');
const OUT = path.join(__dirname, '..', 'out', 'mobile');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
const info = m => console.log('     ' + m);

const HELPERS = `
window.T = {
  toPlaying() { const G = RP.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); G.renderer.banner = null; },
  isolate() { const w = RP.Game.world; w.cfg.notesOnField = 0; w.notes.length = 0; w.trail.length = 0; w.song = 0; w._goldNext = 1e9;
    const G = RP.Game; G.keys = {}; G.renderer.pointer = null; G.pointerDown = false; G._mouseFollow = false; G._steerId = null; if (G._touches) G._touches.clear(); w.setDir(0, 0); w.setTarget(null); },
  die() { const G = RP.Game, w = G.world; this.toPlaying(); w._die(); let i = 0; while (G.mode === 'playing' && i++ < 600) G.step(1 / 60); return G.mode; },
  countStarts() { window._starts = 0; const G = RP.Game; if (!G._wrapped) { const o = G.startGame.bind(G); G.startGame = function () { window._starts++; return o(); }; G._wrapped = true; } },
  rect(el) { if (typeof el === 'string') el = document.querySelector(el); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; },
  /* HUD text boxes of one drawn frame, in CSS px */
  hudCss() {
    const R = RP.Game.renderer, rec = [], orig = R.text, c = R.canvas.getBoundingClientRect(), k = c.width / R.VW;
    R.texts.length = 0; R.banner = null;
    R.text = function (g, s, x, y, size, color, align, stroke) { orig.call(this, g, s, x, y, size, color, align, stroke); const w = g.measureText(s).width;
      const x0 = (align || 'center') === 'left' ? x : (align === 'right' ? x - w : x - w / 2); rec.push({ s, l: c.left + x0 * k, r: c.left + (x0 + w) * k, t: c.top + (y - size / 2) * k, b: c.top + (y + size / 2) * k }); };
    try { R.draw(RP.Game.mode); } finally { R.text = orig; }
    return rec;
  }
};`;

/* ---------------- server ---------------- */
function freePort() { return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
let server, BASE;
async function startServer() {
  const port = await freePort();
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '-d', GAME], { stdio: 'ignore' });
  BASE = `http://127.0.0.1:${port}/index.html`;
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise(r => { const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); }); c.on('error', () => r(false)); });
    if (ok) return; await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('http.server did not start');
}

let browser;
async function newPage(o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 720 }, deviceScaleFactor: o.dsf || 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  await ctx.addInitScript(HELPERS);
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console.error: ' + m.text()); });
  page._ctx = ctx;
  return page;
}
async function boot(page, q, mute = true) {
  await page.goto(BASE + '?' + [mute ? 'mute=1' : '', q || ''].filter(Boolean).join('&'));
  await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode && RP.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(250);
}
const ev = (page, fn, a) => page.evaluate(fn, a);
const errorsOk = (page, label) => check(label + ': no console errors', page._errors.length === 0, page._errors.slice(0, 4).join(' | '));
const inter = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/* ================= 1. layout matrix (touch, DPR 2–3, simulated safe areas) ================= */
const VPS = [
  { tag: 'iPhone landscape 844x390@3', w: 844, h: 390, dsf: 3, ins: { top: 0, right: 47, bottom: 21, left: 47 } },
  { tag: 'iPhone portrait 390x844@3', w: 390, h: 844, dsf: 3, ins: { top: 47, right: 0, bottom: 34, left: 0 } },
  { tag: 'iPad landscape 1024x768@2', w: 1024, h: 768, dsf: 2, ins: { top: 24, right: 0, bottom: 20, left: 0 } },
  { tag: 'iPad Pro landscape 1366x1024@2', w: 1366, h: 1024, dsf: 2, ins: { top: 24, right: 0, bottom: 20, left: 0 } }
];
async function setInsets(page, ins) {
  await ev(page, ins => {
    let s = document.getElementById('qaInsets'); if (!s) { s = document.createElement('style'); s.id = 'qaInsets'; document.head.appendChild(s); }
    const p = `${ins.top}px ${ins.right}px ${ins.bottom}px ${ins.left}px`;
    s.textContent = `#safeProbe{padding:${p} !important} .screen{padding:${p} !important}`;
    RP.Game.relayout();
  }, ins);
  await page.waitForTimeout(200);
}
async function panelReport(page, ins) {
  return ev(page, ins => {
    const vw = innerWidth, vh = innerHeight, scr = document.getElementById(RP.UI.current) || document.querySelector('#scCard:not(.hidden), .sc-wrap:not(.hidden)');
    if (!scr) return { err: 'no screen' };
    const panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap') || scr;
    const pr = panel.getBoundingClientRect(), cs = getComputedStyle(panel);
    const scrolls = panel.scrollHeight > panel.clientHeight + 1;
    const scrollable = /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflow);
    const safe = { l: ins.left, t: ins.top, r: vw - ins.right, b: vh - ins.bottom };
    const panelIn = pr.left >= safe.l - 0.5 && pr.top >= -0.5 && pr.right <= safe.r + 0.5 && pr.bottom <= vh + 0.5;
    // every visible button must be reachable: inside the viewport now, or after scrolling the panel
    const bad = [];
    for (const b of [...scr.querySelectorAll('button')].filter(b => b.offsetParent !== null)) {
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) bad.push((b.id || b.textContent.trim().slice(0, 14)) + '@' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
      if (r.height > 0 && r.height < 30) bad.push('small:' + (b.id || b.textContent.trim().slice(0, 14)) + ' h=' + Math.round(r.height));
    }
    panel.scrollTop = 0;
    return { panelIn, scrolls, scrollable, bad, pr: [pr.left, pr.top, pr.right, pr.bottom].map(Math.round) };
  }, ins);
}
async function testLayout() {
  for (const vp of VPS) {
    const page = await newPage({ viewport: { width: vp.w, height: vp.h }, dsf: vp.dsf, touch: true });
    await boot(page, 'seed=5');
    await setInsets(page, vp.ins);
    const t = vp.tag;
    const base = await ev(page, () => ({ touch: RP.Game.isTouch, dpr: devicePixelRatio, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, vw: innerWidth, vh: innerHeight, rotate: !!document.getElementById('rotate') }));
    check(`${t}: touch + DPR emulated`, base.touch && base.dpr === vp.dsf, base);
    check(`${t}: no page scroll (scrollWidth/Height ≤ viewport)`, base.sw <= base.vw + 1 && base.sh <= base.vh + 1, base);
    check(`${t}: no #rotate overlay — the game supports both orientations`, !base.rotate, base.rotate);
    // menus
    for (const scr of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      await ev(page, s => RP.UI.show(s), scr); await page.waitForTimeout(300);
      const r = await panelReport(page, vp.ins);
      check(`${t}: ${scr} fits (or scrolls) and every button is reachable`, !r.err && r.bad.length === 0 && (!r.scrolls || r.scrollable), r);
      await page.screenshot({ path: path.join(OUT, `lay_${vp.w}x${vp.h}_${scr}.png`) });
    }
    // play: HUD inside safe area, Flip button vs HUD
    await ev(page, () => { RP.UI.show('scrTitle'); RP.debug.startGame(); RP.debug.setSpeed(0); T.toPlaying(); });
    await page.waitForTimeout(250);
    const hud = await ev(page, () => ({ pause: T.rect('#btnPause'), mute: T.rect('#btnMuteHud'), act: T.rect('#btnAction'), actVis: !document.getElementById('btnAction').classList.contains('hidden'), texts: T.hudCss(), cv: T.rect('#game') }));
    const safe = { l: vp.ins.left, t: vp.ins.top, r: vp.w - vp.ins.right, b: vp.h - vp.ins.bottom };
    const inSafe = r => r && r.l >= safe.l - 0.5 && r.t >= safe.t - 0.5 && r.r <= safe.r + 0.5 && r.b <= safe.b + 0.5;
    check(`${t}: HUD Pause + Sound buttons inside the safe area, ≥ 44 css px`, inSafe(hud.pause) && inSafe(hud.mute) && hud.pause.w >= 44 && hud.mute.w >= 44, { pause: hud.pause, mute: hud.mute, safe });
    const outTexts = hud.texts.filter(x => !inSafe(x));
    check(`${t}: HUD score / hearts / song text inside the safe area`, outTexts.length === 0, outTexts.slice(0, 3));
    check(`${t}: Flip button visible, inside the safe area, ≥ 66 css px`, hud.actVis && inSafe(hud.act) && hud.act.w >= 66, { act: hud.act, safe });
    const hit = [hud.pause, hud.mute, ...hud.texts].filter(r => inter(r, hud.act));
    check(`${t}: Flip button does not overlap the HUD buttons or HUD text`, hit.length === 0, hit.slice(0, 3));
    const btnHit = hud.texts.filter(x => inter(x, hud.pause) || inter(x, hud.mute));
    check(`${t}: HUD text does not overlap the Pause / Sound buttons`, btnHit.length === 0, btnHit.slice(0, 3));
    await page.screenshot({ path: path.join(OUT, `lay_${vp.w}x${vp.h}_play.png`) });
    // Pause panel
    await ev(page, () => RP.Game.pause()); await page.waitForTimeout(300);
    let r = await panelReport(page, vp.ins);
    check(`${t}: Pause panel fits (or scrolls), every button reachable`, !r.err && r.bad.length === 0 && (!r.scrolls || r.scrollable), r);
    await page.screenshot({ path: path.join(OUT, `lay_${vp.w}x${vp.h}_pause.png`) });
    await ev(page, () => RP.Game.resume());
    // Game Over panel + Score Card
    await ev(page, () => { RP.Game.world.score = 4321; return T.die(); }); await page.waitForTimeout(350);
    r = await panelReport(page, vp.ins);
    check(`${t}: Game Over panel fits (or scrolls), every button reachable (incl. Score Card)`, !r.err && r.bad.length === 0 && (!r.scrolls || r.scrollable), r);
    const sc = await ev(page, () => { const b = [...document.querySelectorAll('#scrOver button')].find(b => /score card/i.test(b.textContent)); return b ? T.rect(b) : null; });
    check(`${t}: Score Card button present on Game Over`, !!sc && sc.w > 0, sc);
    await page.screenshot({ path: path.join(OUT, `lay_${vp.w}x${vp.h}_over.png`) });
    // rotate the device mid-game: everything re-lays out, Flip still clear of the HUD
    await page.setViewportSize({ width: vp.h, height: vp.w }); await page.waitForTimeout(400);
    await setInsets(page, vp.w > vp.h ? { top: 47, right: 0, bottom: 34, left: 0 } : { top: 0, right: 47, bottom: 21, left: 47 });
    await ev(page, () => { RP.debug.startGame(); RP.debug.setSpeed(0); T.toPlaying(); }); await page.waitForTimeout(250);
    const rot = await ev(page, () => ({ pause: T.rect('#btnPause'), act: T.rect('#btnAction'), cv: T.rect('#game'), vw: innerWidth, vh: innerHeight, A: RP.Game.world.arena, L: RP.Game.renderer.layout.arena }));
    check(`${t}: after rotation canvas fills, arena synced, Flip clear of Pause`, Math.abs(rot.cv.w - rot.vw) < 2 && Math.abs(rot.cv.h - rot.vh) < 2 && JSON.stringify(rot.A) === JSON.stringify(rot.L) && !inter(rot.act, rot.pause), rot);
    errorsOk(page, t);
    await page._ctx.close();
  }
}

/* ================= 2. input on a phone: HUD pointerdown, touch steer / flip, double start ================= */
async function testInput() {
  const page = await newPage({ viewport: { width: 844, height: 390 }, dsf: 3, touch: true });
  await boot(page, 'seed=7');
  await ev(page, () => T.countStarts());
  // double start: focused Play + Space, then a fast tap
  await page.focus('#btnPlay'); await page.keyboard.press('Space'); await page.waitForTimeout(60); await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('input: focused Play + Space (twice) starts exactly one game, 2nd Space is not a restart', await ev(page, () => window._starts) === 1 && await ev(page, () => RP.debug.mode) === 'playing');
  await ev(page, () => { RP.debug.setSpeed(0); T.toPlaying(); T.isolate(); });
  // HUD Sound button pointerdown: toggles mute, no flip, no steering
  const before = await ev(page, () => ({ f: RP.Game.world.flips, m: RP.Game.settings.muted }));
  const mb = await ev(page, () => T.rect('#btnMuteHud'));
  await page.touchscreen.tap(mb.cx, mb.cy); await page.waitForTimeout(120);
  const after = await ev(page, () => ({ f: RP.Game.world.flips, m: RP.Game.settings.muted, ptr: RP.Game.renderer.pointer, down: RP.Game.pointerDown, tgt: RP.Game.world._target || null, mode: RP.debug.mode }));
  check('input: tapping the HUD Sound button toggles sound, never flips or steers', after.m !== before.m && after.f === before.f && !after.ptr && !after.down && after.mode === 'playing', { before, after });
  await page.touchscreen.tap(mb.cx, mb.cy); await page.waitForTimeout(120);   // back to the ?mute=1 state
  // HUD Pause pointerdown
  const pb = await ev(page, () => T.rect('#btnPause'));
  await page.touchscreen.tap(pb.cx, pb.cy); await page.waitForTimeout(150);
  const p = await ev(page, () => ({ mode: RP.debug.mode, f: RP.Game.world.flips, ptr: RP.Game.renderer.pointer, down: RP.Game.pointerDown }));
  check('input: tapping HUD Pause pauses, never flips or steers', p.mode === 'paused' && p.f === before.f && !p.ptr && !p.down, p);
  await ev(page, () => RP.Game.resume());
  // touch steering on the field: pointer set while down
  const fld = await ev(page, () => { const R = RP.Game.renderer, c = R.canvas.getBoundingClientRect(), A = RP.Game.world.arena; return { x: c.left + (A.x0 + 120) / R.VW * c.width, y: c.top + (A.y1 - 60) / R.VH * c.height }; });
  const cdp = await page._ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fld.x, y: fld.y, id: 1 }] }); await page.waitForTimeout(60);
  const st = await ev(page, () => ({ down: RP.Game.pointerDown, ptr: RP.Game.renderer.pointer }));
  check('input: a finger on the field steers (pointer captured)', st.down && !!st.ptr, st);
  const f0 = await ev(page, () => { const s = RP.Game.world.hero; s.jump = 0; s.z = 0; s.flip = 1; return RP.Game.world.flips; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fld.x, y: fld.y, id: 1 }, { x: fld.x + 200, y: fld.y - 60, id: 2 }] }); await page.waitForTimeout(60);
  check('input: a second finger flips', await ev(page, () => RP.Game.world.flips) === f0 + 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(60);
  // Flip button
  await ev(page, () => { const s = RP.Game.world.hero; s.jump = 0; s.z = 0; s.flip = 1; });
  const ab = await ev(page, () => T.rect('#btnAction'));
  await page.touchscreen.tap(ab.cx, ab.cy); await page.waitForTimeout(80);
  const fb = await ev(page, () => ({ f: RP.Game.world.flips, ptr: RP.Game.renderer.pointer, down: RP.Game.pointerDown }));
  check('input: Flip button flips without steering', fb.f === f0 + 2 && !fb.ptr && !fb.down, fb);
  errorsOk(page, 'input');
  await page._ctx.close();
}

/* ================= 3. restart lock measured in page time ================= */
async function testLock() {
  const page = await newPage();
  await boot(page, 'seed=4');
  await ev(page, () => { RP.debug.startGame(); RP.debug.setSpeed(0); T.die(); T.countStarts(); });
  // press Enter repeatedly; record page-time since game over at each press
  const early = [];
  for (let i = 0; i < 6; i++) {
    const dt = await ev(page, () => performance.now() - RP.Game.overAt);
    if (dt > 650) break;
    await page.keyboard.press('Enter'); early.push(Math.round(dt));
    await page.waitForTimeout(30);
  }
  const s1 = await ev(page, () => ({ starts: window._starts, mode: RP.debug.mode, dt: performance.now() - RP.Game.overAt }));
  check('lock: Enter/Space presses within 0.65 s of game over never restart (page-time measured)', early.length > 0 && s1.starts === 0 && s1.mode === 'over', { early, s1 });
  // tap Play Again early too
  // Play Again clicked inside the lock (dispatched in the page so the click time is exact)
  const again = await ev(page, () => { const dt = performance.now() - RP.Game.overAt; if (dt < 650) document.getElementById('btnAgain').click(); return dt; });
  if (again < 650) check('lock: Play Again click within the lock is ignored', await ev(page, () => window._starts) === 0, Math.round(again));
  await ev(page, () => new Promise(r => { const w = () => (performance.now() - RP.Game.overAt > 720 ? r() : setTimeout(w, 20)); w(); }));
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(20); }
  await page.waitForTimeout(150);
  check('lock: Enter spam after 0.7 s starts exactly one new game', await ev(page, () => window._starts) === 1 && await ev(page, () => RP.debug.mode) === 'playing');
  errorsOk(page, 'lock');
  await page._ctx.close();
}

/* ================= 4. Change Pictures with real files (setInputFiles) ================= */
async function genImage(page, w, h, fmt, file) {
  const b64 = await ev(page, async ({ w, h, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff00ff'); gr.addColorStop(1, '#2040ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffff00'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, 7); g.fill();
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.9));
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  }, { w, h, fmt });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}
async function upload(page, slot, file) {
  await ev(page, () => { document.getElementById('toast').textContent = ''; });
  await ev(page, s => { RP.UI._pickSlot = s; }, slot);
  const t0 = Date.now();
  await page.setInputFiles('#filePick', file);
  let txt = '';
  while (Date.now() - t0 < 15000) { txt = await ev(page, () => document.getElementById('toast').textContent); if (txt && !/Saving/.test(txt)) break; await page.waitForTimeout(100); }
  return { txt, ms: Date.now() - t0 };
}
const stored = (page, key) => ev(page, k => new Promise(res => { const d = RP.Storage.get(k); if (!d) return res(null); const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight, len: d.length, ls: (localStorage.getItem('prp:' + k) || '').length }); i.onerror = () => res(null); i.src = d; }), key);
async function testCustom() {
  const FX = path.join(OUT, 'fixtures'); fs.mkdirSync(FX, { recursive: true });
  const page = await newPage({ viewport: { width: 1024, height: 768 }, dsf: 2, touch: true });
  await boot(page, 'seed=2');
  const png = await genImage(page, 400, 300, 'image/png', path.join(FX, 'hero.png'));
  const jpg = await genImage(page, 800, 600, 'image/jpeg', path.join(FX, 'star.jpg'));
  const huge = await genImage(page, 6000, 4000, 'image/jpeg', path.join(FX, 'huge_6000x4000.jpg'));
  const bad = path.join(FX, 'corrupt.png'); fs.writeFileSync(bad, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('this is not really a png'.repeat(20))]));
  const txt = path.join(FX, 'notes.txt'); fs.writeFileSync(txt, 'hello');
  info(`fixtures: huge ${Math.round(fs.statSync(huge).size / 1024)} KB`);
  await ev(page, () => RP.UI.show('scrCustom')); await page.waitForTimeout(300);
  let r = await upload(page, 'hero', png);
  let s = await stored(page, 'img_hero');
  check('custom: PNG for Dottie saved (toast) and downscaled ≤ 512', /saved/i.test(r.txt) && s && Math.max(s.w, s.h) <= 512 && s.ls > 0, { r, s });
  r = await upload(page, 'note', jpg); s = await stored(page, 'img_note');
  check('custom: JPEG for the sea star saved, ≤ 512', /saved/i.test(r.txt) && s && Math.max(s.w, s.h) <= 512, { r, s });
  r = await upload(page, 'bg_winter', huge); s = await stored(page, 'img_bg_winter');
  check('custom: 6000×4000 JPEG background accepted, downscaled ≤ 1280×720, < 6 s', /saved/i.test(r.txt) && s && s.w <= 1280 && s.h <= 720 && r.ms < 6000, { r, s });
  const prevHero = await ev(page, () => RP.Storage.get('img_hero').length);
  r = await upload(page, 'hero', bad);
  check('custom: corrupt PNG → friendly error, previous Dottie kept', /could not|choose/i.test(r.txt) && await ev(page, () => RP.Storage.get('img_hero').length) === prevHero, r);
  r = await upload(page, 'hero', txt);
  check('custom: text file → friendly "choose a picture" error', /picture/i.test(r.txt) && !/saved/i.test(r.txt), r);
  const cards = await ev(page, () => [...document.querySelectorAll('#slotGrid .tag')].map(t => t.textContent));
  check('custom: three cards show "Your picture"', cards.filter(c => /Your picture/.test(c)).length === 3, cards);
  // play winter with the custom pictures: no errors
  await ev(page, () => { RP.UI.back(); RP.debug.startGame(); RP.debug.gotoLevel(3); RP.debug.setSpeed(1); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'custom_winter.png') });
  // reload keeps them, Reset all clears them
  await page.reload(); await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode === 'title');
  check('custom: pictures survive a reload', await ev(page, () => ['hero', 'note', 'bg_winter'].every(id => RP.Assets.hasCustom(id))));
  await ev(page, () => RP.UI.show('scrCustom')); await page.waitForTimeout(300);
  await page.click('#btnResetAll'); await page.waitForTimeout(200);
  check('custom: Reset all clears memory + prp:img_* storage', await ev(page, () => RP.Assets.SLOTS.every(s => !RP.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => /^prp:img_/.test(k))));
  errorsOk(page, 'custom');
  await page._ctx.close();
}

/* ================= 5. storage: prefix, ?mute=1 never saved, best per difficulty, volume ================= */
async function testStorage() {
  const page = await newPage();
  await boot(page, 'seed=9');   // ?mute=1
  await ev(page, () => { RP.Game.setSetting('difficulty', 'easy'); RP.debug.startGame(); RP.debug.setSpeed(0); RP.Game.world.score = 321; T.die(); });
  await ev(page, () => { RP.Game.setSetting('difficulty', 'hard'); RP.debug.startGame(); RP.debug.setSpeed(0); RP.Game.world.score = 654; T.die(); });
  await ev(page, () => RP.UI.show('scrSettings'));
  const vol = await page.$('#scrSettings input[type=range]');
  check('storage: Volume slider present in Settings', !!vol);
  if (vol) await ev(page, () => { const v = document.querySelector('#scrSettings input[type=range]'); v.value = v.max ? String(v.max * 0.4) : '40'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  const ls = await ev(page, () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k).slice(0, 80); } return o; });
  check('storage: every key uses the prp: prefix', Object.keys(ls).length > 0 && Object.keys(ls).every(k => k.startsWith('prp:')), Object.keys(ls));
  check('storage: best saved per difficulty (easy 321, hard 654, normal untouched)', ls['prp:best_easy'] === '321' && ls['prp:best_hard'] === '654' && !ls['prp:best_normal'], ls);
  check('storage: ?mute=1 never written (settings.muted false)', !JSON.parse(ls['prp:settings'] || '{}').muted, ls['prp:settings']);
  check('storage: volume saved under prp:', !vol || ls['prp:volume'] != null, ls['prp:volume']);
  await page.goto(BASE + '?seed=9'); await page.waitForFunction(() => window.RP && RP.debug && RP.debug.mode === 'title');
  const rl = await ev(page, () => ({ d: RP.Game.settings.difficulty, muted: RP.Audio.muted, best: document.getElementById('bestTitle').textContent }));
  check('storage: after reload without ?mute: Hard kept, sound NOT muted, title best = Hard best', rl.d === 'hard' && !rl.muted && rl.best === '654', rl);
  errorsOk(page, 'storage');
  await page._ctx.close();
}

/* ================= 6. long bot run ================= */
async function testLong() {
  const page = await newPage({ viewport: { width: 844, height: 390 }, dsf: 3, touch: true });
  await boot(page, 'bot=1&speed=16&autorestart=1&autostart=1&seed=21');
  const t0 = Date.now(); let maxLevel = 0, maxP = 0, maxFx = 0, seasons = new Set(), modes = new Set();
  while (Date.now() - t0 < LONG_S * 1000) {
    await page.waitForTimeout(2000);
    const s = await ev(page, () => { const st = RP.debug.getState(); return { level: st.level, biome: st.biome, p: st.particles, fx: st.fx, mode: st.mode, lap: st.lap }; });
    maxLevel = Math.max(maxLevel, s.level); maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); seasons.add(s.biome); modes.add(s.mode);
  }
  const st = await ev(page, () => ({ games: RP.debug.stats.games, errors: RP.debug.stats.errors, scores: RP.debug.stats.scores.slice(0, 5), t: RP.debug.world.time }));
  info(`long ${LONG_S}s @16x: maxLevel ${maxLevel}, seasons ${[...seasons]}, games ${st.games}, world time ${Math.round(st.t)}s, maxParticles ${maxP}, maxFx ${maxFx}`);
  check(`long: ${LONG_S} s at 16× on iPhone landscape — zero runtime errors`, st.errors.length === 0, st.errors.slice(0, 2));
  check('long: the bot went through all 4 seasons and into lap 2 (level ≥ 4)', seasons.size === 4 && maxLevel >= 4, { maxLevel, seasons: [...seasons] });
  check('long: particles < 160, fx ≤ 400', maxP < 160 && maxFx <= 400, { maxP, maxFx });
  errorsOk(page, 'long');
  await page._ctx.close();
}

/* ================= 7. loudness ================= */
async function testLoud() {
  const page = await newPage();
  await boot(page, 'bot=1&seed=13', false);
  await page.click('#btnPlay');   // user gesture → AudioContext running
  await page.waitForTimeout(300);
  const ok = await ev(page, () => {
    const A = RP.Audio; if (!A.ctx || !A.user) return { err: 'no audio graph' };
    const c = A.ctx, an = c.createAnalyser(); an.fftSize = 2048;
    const tap = A.out || A.limiter || A.user;   // measure the real output: after the limiter (and its trim) when there is one
    tap.disconnect(); tap.connect(an); an.connect(c.destination);
    const buf = new Float32Array(an.fftSize);
    window._loud = { sum: 0, n: 0, peak: 0, over: 0, win: [] };
    window._loudT = setInterval(() => {
      an.getFloatTimeDomainData(buf); let s = 0, p = 0;
      for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > p) p = a; if (a > 1) window._loud.over++; }
      const L = window._loud; L.sum += s; L.n += buf.length; L.peak = Math.max(L.peak, p); L.win.push(s / buf.length);
    }, 43);
    return { state: c.state, vol: A.volume, gain: A.user.gain.value };
  });
  check('loud: audio graph tapped (context running)', !ok.err && ok.state === 'running', ok);
  await page.waitForTimeout(LOUD_S * 1000);
  const L = await ev(page, () => { clearInterval(window._loudT); const L = window._loud, db = x => 10 * Math.log10(Math.max(1e-12, x));
    const act = L.win.filter(x => x > 1e-6), srt = act.slice().sort((a, b) => a - b);
    return { rms: db(L.sum / L.n), rmsActive: db(act.reduce((a, b) => a + b, 0) / Math.max(1, act.length)), p95: db(srt[Math.floor(srt.length * 0.95)] || 0), peak: 20 * Math.log10(Math.max(1e-9, L.peak)), over: L.over, wins: L.win.length, notes: RP.debug.stats.notes + RP.Game.run.notes };
  });
  const r1 = x => Math.round(x * 10) / 10;
  info(`loudness over ${LOUD_S}s of bot play: RMS ${r1(L.rms)} dBFS (active ${r1(L.rmsActive)}, 95th pct window ${r1(L.p95)}), peak ${r1(L.peak)} dBFS, samples > 0 dBFS: ${L.over}`);
  fs.writeFileSync(path.join(OUT, 'loudness.json'), JSON.stringify(L, null, 1));
  check('loud: RMS within ±4 dB of −24 dBFS', Math.abs(L.rms + 24) <= 4, r1(L.rms));
  check('loud: peak ≤ −3 dBFS (target ≈ −5, no clipping)', L.peak <= -3 && L.over === 0, { peak: r1(L.peak), over: L.over });
  errorsOk(page, 'loud');
  await page._ctx.close();
}

const TESTS = { layout: testLayout, input: testInput, lock: testLock, custom: testCustom, storage: testStorage, long: testLong, loud: testLoud };
(async () => {
  await startServer();
  browser = await chromium.launch();
  try {
    for (const [name, fn] of Object.entries(TESTS)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      console.log('\n== ' + name + ' ==');
      try { await fn(); } catch (e) { check(name + ': test crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
    }
  } finally { await browser.close(); server.kill(); }
  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length} passed, ${fail.length} failed`);
  if (fail.length) { console.log('FAILED:'); for (const f of fail) console.log('  - ' + f.name); }
  process.exit(fail.length ? 1 : 0);
})();
