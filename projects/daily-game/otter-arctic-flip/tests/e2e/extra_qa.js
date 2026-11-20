// Extra functional QA checks (2026-11-20 QA pass) — things the main suite (functional.js) does not cover.
// Run: node tests/e2e/extra_qa.js          Exits 1 on any FAIL. Serves game/ over a local http server (like GitHub Pages).
// Sections: scorecard (extras.js modal vs keyboard restart) · volume · flags (test URLs vs saved data) · rescue
// (resize / rotate while Pip carries Ollie) · speed16 (floor changes at ×16, ?level start, darkness bounds) ·
// mobile (small iPhone settings, iPad Pro, simulated safe-area insets) · fairness (portrait lead time) · pictures (SVG, full storage).
// See docs/reports/functional.md for the issues behind the FAIL lines.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const ROOT = path.resolve(__dirname, '../..');

let nPass = 0, nFail = 0; const fails = [];
function check(name, ok, info) {
  ok = !!ok; if (ok) nPass++; else { nFail++; fails.push(name); }
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info !== undefined ? '  (' + (typeof info === 'string' ? info : JSON.stringify(info)) + ')' : ''));
  return ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let browser, BASE, BASE_LOOP, server;
async function open(ctxOpts, query) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, ctxOpts || {}));
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE + (query || '?mute=1'));
  await p.waitForFunction(() => window.OF && OF.Game && OF.Game.mode !== 'boot', null, { timeout: 20000 });
  return { ctx, p, errs };
}
const mode = p => p.evaluate(() => OF.Game.mode);
const modalOpen = p => p.evaluate(() => { const m = document.getElementById('scScreen'); return !!m && !m.classList.contains('hidden'); });
async function killNow(p) {
  await p.evaluate(() => { if (OF.Game.mode !== 'playing') OF.Game.startGame(); });
  await p.evaluate(() => { const w = OF.debug.world; w.hearts = 1; w.hero.invuln = 0; w.setTrack({ obstacles: [{ kind: 'vent', x: 1.2 }, { kind: 'sign', x: 1.2 }] }); OF.debug.setSpeed(3); });
  const ok = await p.waitForFunction(() => OF.Game.mode === 'over', null, { timeout: 10000 }).then(() => true, () => false);
  await p.evaluate(() => OF.debug.setSpeed(1));
  await sleep(800);   // past the 0.7 s restart lock
  return ok;
}
async function openCard(p) {
  await p.evaluate(() => { window.__scoreCard = null; document.getElementById('btnScoreCard').click(); });
  await p.waitForFunction(() => { const m = document.getElementById('scScreen'); return window.__scoreCard && !!m && !m.classList.contains('hidden'); }, null, { timeout: 8000 });
  await sleep(150);   // the modal focuses its first button after 30 ms
}

// ======================================================================= score card modal (extras.js) vs the keyboard
async function sScoreCard() {
  const { p, errs, ctx } = await open({}, '?mute=1&seed=4&diff=normal');
  await killNow(p);
  await p.focus('#btnScoreCard'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => { const m = document.getElementById('scScreen'); return !!m && !m.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => {});
  check('scorecard: Enter on the focused Score Card button opens the card and does not restart', await modalOpen(p) && await mode(p) === 'over');
  await p.keyboard.press('Escape'); await sleep(150);
  check('scorecard: Esc closes the card (no pause, no restart)', !(await modalOpen(p)) && await mode(p) === 'over');

  await openCard(p);
  const foc = await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  await p.keyboard.press('Enter'); await sleep(300);
  const r1 = { focused: foc, mode: await mode(p), modal: await modalOpen(p) };
  check('scorecard: Enter on the focused "Save picture" link does not start a new game behind the card', r1.mode === 'over', r1);
  if (r1.mode !== 'over') { await p.evaluate(() => document.getElementById('scClose').click()); await killNow(p); }
  else await p.keyboard.press('Escape');

  await openCard(p);
  await p.click('#scImg'); await p.keyboard.press('Space'); await sleep(300);
  const r2 = { mode: await mode(p), modal: await modalOpen(p), active: await p.evaluate(() => document.activeElement.tagName) };
  check('scorecard: Space after tapping the card picture does not start a new game', r2.mode === 'over', r2);

  // whatever starts a game must take the card away (else it covers the run and swallows every tap)
  await p.evaluate(() => { const m = document.getElementById('scScreen'); if (m) m.classList.remove('hidden'); OF.Game.startGame(); });
  await sleep(200);
  check('scorecard: starting a game hides the Score Card modal', !(await modalOpen(p)));
  check('scorecard: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= volume slider persistence
async function sVolume() {
  const { p, errs, ctx } = await open({}, '?mute=1&seed=2');
  await p.evaluate(() => localStorage.removeItem('olf:volume'));
  await p.click('#btnSettings'); await sleep(200);
  check('volume: default 100 %', await p.evaluate(() => document.getElementById('setVolume').value === '100' && document.getElementById('setVolumeVal').textContent === '100%'));
  await p.evaluate(() => { const r = document.getElementById('setVolume'); r.value = 40; r.dispatchEvent(new Event('input')); });
  check('volume: slider 40 → saved as olf:volume 0.40 and applied to the audio', await p.evaluate(() => localStorage.getItem('olf:volume') === '0.40' && Math.abs(OF.Audio.volume - 0.4) < 1e-9));
  await p.click('.vol-step[data-d="1"]');
  check('volume: "+" adds 10 %', await p.evaluate(() => localStorage.getItem('olf:volume') === '0.50'));
  check('volume: changing the volume under ?mute=1 does not save "muted"', await p.evaluate(() => !(JSON.parse(localStorage.getItem('olf:settings') || '{}').muted)));
  await p.reload(); await p.waitForFunction(() => OF.Game && OF.Game.mode === 'title');
  await p.click('#btnSettings'); await sleep(200);
  check('volume: survives a reload (slider + audio)', await p.evaluate(() => document.getElementById('setVolume').value === '50' && Math.abs(OF.Audio.volume - 0.5) < 1e-9));
  const h = await p.evaluate(() => [...document.querySelectorAll('.vol-step')].map(b => Math.round(b.getBoundingClientRect().height)));
  check('volume: the − / + buttons are finger-sized (≥ 40 px like the other Settings controls)', h.every(x => x >= 40), h);
  check('volume: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= test flags never touch saved data
async function sFlags() {
  const { p, errs, ctx } = await open({}, '?mute=1&seed=2');
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '?mute=1&seed=4&autostart=1&bot=1&skill=0&speed=8&diff=normal');
  await p.waitForFunction(() => OF.Game && OF.Game.mode === 'over', null, { timeout: 90000 }).catch(() => {});
  const r = await p.evaluate(() => ({ mode: OF.Game.mode, score: OF.debug.stats.scores[0], best: localStorage.getItem('olf:best_normal') }));
  check('flags: a ?bot=1 (test) run does not write the player\'s best score', r.best === null, r);
  check('flags: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= resize / rotate while Pip carries Ollie
async function sRescue() {
  const { p, errs, ctx } = await open({}, '?mute=1&seed=4&diff=normal');
  for (const [phaseWait, vp] of [[80, { width: 390, height: 844 }], [450, { width: 390, height: 844 }], [450, { width: 1366, height: 1024 }], [900, { width: 844, height: 390 }]]) {
    await p.setViewportSize({ width: 1280, height: 720 }); await sleep(400);
    await p.evaluate(() => OF.Game.startGame());
    await p.waitForFunction(() => OF.debug.world.hero.grounded);
    await p.evaluate(() => { const w = OF.debug.world; w.hearts = 5; w.hero.invuln = 0; w.setTrack({ roofs: [[-50, 1.0], [4.0, 5000]] }); });
    const inRescue = await p.waitForFunction(() => OF.debug.world.hero.state === 'rescue', null, { timeout: 8000 }).then(() => true, () => false);
    await sleep(phaseWait);
    const mid = await p.evaluate(() => { const d = OF.debug.world.drone || {}; return d.phase || d.state; });
    await p.setViewportSize(vp); await sleep(250);
    const back = await p.waitForFunction(() => { const w = OF.debug.world; return w.hero.state === 'run' && w.hero.grounded; }, null, { timeout: 8000 }).then(() => true, () => false);
    await sleep(1200);
    const r = await p.evaluate(() => { const w = OF.debug.world, h = w.hero; return { side: h.side, y: +h.y.toFixed(1), stand: +w.standY(h.side).toFixed(1), falls: w.stats.falls, bumps: w.stats.bumps, hearts: w.hearts, mode: OF.Game.mode }; });
    check(`rescue: resize to ${vp.width}×${vp.height} while Pip is "${mid}" → Ollie set down on a surface, one fall only, keeps running`, inRescue && back && r.falls === 1 && Math.abs(r.y - r.stand) < 0.6 && r.hearts === 4 && r.mode === 'playing', r);
  }
  check('rescue: no console errors', errs.length === 0 && await p.evaluate(() => OF.debug.stats.errors.length === 0), errs.slice(0, 3));
  await ctx.close();
}

// ======================================================================= floor changes at ×16, ?level, darkness bounds
async function sSpeed16() {
  const { p, errs, ctx } = await open({}, '?mute=1&seed=8&autostart=1&bot=1&skill=1&speed=16&diff=normal');
  await p.waitForFunction(() => OF.Game.mode === 'playing');
  await p.evaluate(() => {
    OF.debug.world.hearts = 99; window._lv = []; window._dark = 0;
    const h = OF.Game.handleEvents; OF.Game.handleEvents = function (ev) { for (const e of ev) if (['levelUp', 'lampsOn'].includes(e.type)) window._lv.push(e.type + ':' + e.level); return h.apply(this, arguments); };
    const d = OF.Game.renderer.draw.bind(OF.Game.renderer); OF.Game.renderer.draw = function (m) { window._dark = Math.max(window._dark, this.darkAlpha()); return d(m); };
  });
  await p.waitForFunction(() => OF.debug.world.level >= 4 || OF.Game.mode !== 'playing', null, { timeout: 150000 }).catch(() => {});
  const r = await p.evaluate(() => ({ lv: OF.debug.world.level, ev: window._lv, falls: OF.debug.world.stats.falls, bumps: OF.debug.world.stats.bumps, dark: +window._dark.toFixed(3), errors: OF.debug.stats.errors.length }));
  check('speed16: a skill-1 bot climbs 4 floors at ×16 with no fall / bump', r.lv >= 4 && r.falls === 0 && r.bumps === 0, r);
  check('speed16: levelUp 1,2,3,4 in order and lampsOn exactly once (entering Sunset)', r.ev.filter(e => e.startsWith('levelUp')).slice(0, 4).join() === 'levelUp:1,levelUp:2,levelUp:3,levelUp:4' && r.ev.filter(e => e.startsWith('lampsOn')).join() === 'lampsOn:2', r.ev);
  check('speed16: darkness never above 0.7 alpha (≥ 30 % light) during the whole climb', r.dark <= 0.7 && r.dark > 0.5, r.dark);
  await p.evaluate(() => OF.debug.gotoLevel(7)); await sleep(1500);
  const g = await p.evaluate(() => ({ z: OF.debug.world.zone, vis: OF.Game.renderer.vis.cur, lampsOn: OF.debug.world.lampsOn, lampK: OF.Game.renderer.lampK, beam: OF.debug.world.beamUnits(), want: Math.min(Math.max(OF.debug.world.seeAheadUnits(), 3.2), OF.debug.world.screenReachUnits()) }));
  check('speed16: gotoLevel(7) at ×16 → Night round 2, lamps on, beam = min(max(seeAhead, 3.2), reach)', g.z === 3 && g.vis === 3 && g.lampsOn && g.lampK === 1 && Math.abs(g.beam - g.want) < 1e-6, g);
  check('speed16: no console errors', errs.length === 0 && r.errors === 0, errs.slice(0, 3));
  await ctx.close();
  for (const lv of [2, 3]) {
    const o = await open({}, '?mute=1&autostart=1&diff=normal&seed=3&level=' + lv);
    await o.p.waitForFunction(() => OF.Game.mode === 'playing'); await sleep(300);
    const s = await o.p.evaluate(() => ({ lampsOn: OF.debug.world.lampsOn, lampK: OF.Game.renderer.lampK, vis: OF.Game.renderer.vis.cur, dark: OF.Game.renderer.darkAlpha() }));
    check(`speed16: a run started with ?level=${lv} has its lamps lit from the first frame`, s.lampsOn && s.lampK === 1 && s.vis === lv && s.dark > 0.2, s);
    await o.ctx.close();
  }
}

// ======================================================================= mobile layouts not in the main suite
async function sMobile() {
  // small iPhones (SE 2nd/3rd gen, 8) in landscape: 667×375
  for (const [W, H] of [[667, 375], [568, 320]]) {
    const { p, errs, ctx } = await open({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, '?mute=1');
    await p.evaluate(() => OF.UI.open('scrSettings', 'scrTitle')); await sleep(250);
    const r = await p.evaluate(() => {
      const pn = document.querySelector('#scrSettings .panel').getBoundingClientRect();
      const vis = [...document.querySelectorAll('#scrSettings button, #scrSettings input[type=range]')].filter(b => b.offsetParent).map(b => { const q = b.getBoundingClientRect(); return { id: b.id || b.textContent.trim(), ok: q.left >= Math.max(0, pn.left) - 1 && q.right <= Math.min(innerWidth, pn.right) + 1 && q.top >= 0 && q.bottom <= innerHeight + 1 }; });
      return { vw: innerWidth, cut: vis.filter(v => !v.ok).map(v => v.id) };
    });
    await p.screenshot({ path: path.join(ROOT, `tests/out/extra_settings_${W}x${H}.png`) }).catch(() => {});
    check(`mobile ${W}×${H}: every Settings control (Difficulty, Reset, Volume) is inside the panel and the screen`, r.cut.length === 0, r);
    check(`mobile ${W}×${H}: no console errors`, errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  // simulated notch / home-indicator insets (Chromium cannot emulate env(safe-area-inset-*), so the probe is overridden)
  const cases = [['iPhone landscape 844×390', 844, 390, 3, [0, 47, 21, 47]], ['iPhone portrait 390×844', 390, 844, 3, [47, 0, 34, 0]], ['iPad Pro 1366×1024', 1366, 1024, 2, [24, 0, 20, 0]], ['iPad Pro portrait 1024×1366', 1024, 1366, 2, [24, 0, 20, 0]]];
  for (const [name, W, H, dpr, ins] of cases) {
    const { p, errs, ctx } = await open({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true }, '?mute=1&seed=4&diff=normal');
    await p.addStyleTag({ content: `#safeProbe{padding:${ins.map(v => v + 'px').join(' ')}!important}.screen{padding:${ins.map(v => v + 'px').join(' ')}!important}` });
    await p.evaluate(() => { OF.Game.relayout(); OF.Game.startGame(); }); await sleep(500);
    const r = await p.evaluate(ins => {
      const [T, R, B, L] = ins, ok = q => q.left >= L - 1 && q.top >= T - 1 && q.right <= innerWidth - R + 1 && q.bottom <= innerHeight - B + 1;
      const R0 = OF.Game.renderer, c = R0.canvas.getBoundingClientRect(), k = c.width / R0.VW, H = R0.hudLayout(OF.debug.world);
      const css = a => ({ left: c.left + a[0] * k, top: c.top + a[1] * k, right: c.left + (a[0] + a[2]) * k, bottom: c.top + (a[1] + a[3]) * k });
      const btns = ['btnPause', 'btnMuteHud'].map(id => document.getElementById(id).getBoundingClientRect());
      return { btns: btns.every(ok), score: ok(css(H.score)), zone: ok(css(H.zone)), big: btns.every(b => b.height >= 43.5) };
    }, ins);
    check(`mobile ${name}@${dpr}x (simulated insets): HUD buttons + score / floor panels inside the safe area, buttons ≥ 44 px`, r.btns && r.score && r.zone && r.big, r);
    await killNow(p);
    await openCard(p);
    const fit = await p.evaluate(ins => { const [T, , B] = ins; return [...document.querySelectorAll('#scScreen .btn')].filter(b => b.offsetParent).every(b => { const q = b.getBoundingClientRect(); return q.top >= T - 1 && q.bottom <= innerHeight - B + 1 && q.left >= 0 && q.right <= innerWidth; }); }, ins);
    check(`mobile ${name}@${dpr}x: Score Card modal buttons on screen`, fit);
    check(`mobile ${name}@${dpr}x: no console errors`, errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
}

// ======================================================================= portrait fairness: time between a hazard appearing and the flight
async function sFairness() {
  const { p, ctx } = await open({}, '?mute=1');
  const rows = await p.evaluate(() => {
    const out = [];
    for (const [W, H, tag] of [[1280, 540, 'phone landscape'], [960, 720, 'iPad landscape'], [560, 1213, 'phone portrait'], [720, 960, 'iPad portrait']]) for (const d of ['easy', 'normal']) {
      const w = new OF.World({ seed: 1, difficulty: d, width: W, height: H, level: 0 }), u = w.layout.unit, pl = w.plans[w.planIdx];
      const S = pl ? w._capFor(pl, w.hero.x) : w.levelBase(0);
      out.push({ tag, d, lead: +((w.screenReachUnits() * u) / S - w.flightTime()).toFixed(2), reaction: w.D.reaction });
    }
    return out;
  });
  for (const r of rows) check(`fairness: ${r.tag} ${r.d} Floor 1: a hazard is on screen ≥ the reaction time before Ollie must flip (${r.lead} s vs ${r.reaction} s)`, r.lead >= r.reaction - 0.01, r);
  await ctx.close();
}

// ======================================================================= pictures: SVG + full storage + share link
async function sPictures() {
  const { p, errs, ctx } = await open({}, '?mute=1');
  const svg = await p.evaluate(async () => {
    const f = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>'], 'a.svg', { type: 'image/svg+xml' });
    try { await OF.Assets.setCustom('hero', f); return { ok: OF.Assets.hasCustom('hero') }; } catch (e) { return { err: e.message }; } finally { OF.Assets.clearCustom('hero'); }
  });
  check('pictures: an SVG drawing without width/height works as Ollie', svg.ok, svg);
  const full = await p.evaluate(async () => {
    const S = OF.Storage, o = S.set; S.set = function (k, v) { return k.startsWith('img_') ? Promise.resolve(false) : o.call(this, k, v); };
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').fillRect(0, 0, 64, 64);
    const f = await new Promise(r => c.toBlob(b => r(new File([b], 'x.png', { type: 'image/png' })), 'image/png'));
    await OF.UI.applyFile('bg_dawn', f); S.set = o;
    return { toast: document.getElementById('toast').textContent, has: OF.Assets.hasCustom('bg_dawn') };
  });
  check('pictures: when storage is full the player gets a friendly message and nothing changes', /room/i.test(full.toast) && !full.has, full);
  check('pictures: no console errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
  // the Windows app serves the game from http://127.0.0.1:47628 — the shared score card must not carry that link
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE_LOOP + '?mute=1&app=1&seed=4&diff=normal');
  await p2.waitForFunction(() => window.OF && OF.Game && OF.Game.mode === 'title');
  await killNow(p2); await openCard(p2);
  const text = await p2.evaluate(() => window.__scoreCard.text);
  check('pictures/app: the Score Card share text from the app never links to a loopback address', !/127\.0\.0\.1|localhost/.test(text), text);
  await ctx2.close();
}

(async () => {
  const T0 = Date.now();
  const port = await freePort();
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: path.join(ROOT, 'game'), stdio: 'ignore' });
  BASE = `http://localhost:${port}/index.html`; BASE_LOOP = `http://127.0.0.1:${port}/index.html`;
  for (let i = 0; i < 50; i++) { const ok = await new Promise(r => { const s = net.connect(port, '127.0.0.1', () => { s.end(); r(true); }); s.on('error', () => r(false)); }); if (ok) break; await sleep(100); }
  browser = await chromium.launch();
  const only = process.argv[2];
  const sections = { sScoreCard, sVolume, sFlags, sRescue, sSpeed16, sMobile, sFairness, sPictures };
  try {
    for (const [name, fn] of Object.entries(sections)) {
      if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
      console.log('\n== ' + name); const t = Date.now();
      try { await fn(); } catch (e) { check(name + ': section ran to the end', false, String(e && e.message || e).split('\n')[0]); }
      console.log(`   (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    }
  } finally { await browser.close(); server.kill(); }
  console.log(`\nRESULT: ${nPass} passed, ${nFail} failed  (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
  if (nFail) console.log('FAILED:\n  ' + fails.join('\n  '));
  process.exit(nFail ? 1 : 0);
})();
