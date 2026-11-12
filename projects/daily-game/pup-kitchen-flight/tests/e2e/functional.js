// Functional QA suite for Biscuit's Kitchen Flight (Playwright + Chromium, file:// URL).
// Run from the project folder:  node tests/e2e/functional.js        (≈ 3–4 min; prints PASS/FAIL per check)
// Optional: node tests/e2e/functional.js --only=inputs,scoring      (run some sections)
//           --soak=60                                               (seconds of the high-speed bot run)
// Exit code 1 when any check fails. The suite never changes the game; it drives it through the
// test hooks of docs/DESIGN.md §6 (URL params + window.BKF.debug) and real input events.
'use strict';
const { chromium, devices } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const ONLY = ARGS.only ? ARGS.only.split(',') : null;
const SOAK_S = +(ARGS.soak || 60);

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failures.push(name + (detail !== undefined ? ' — ' + fmt(detail) : '')); console.log('FAIL ' + name + (detail !== undefined ? ' — ' + fmt(detail) : '')); }
  return ok;
}
const fmt = d => typeof d === 'string' ? d : JSON.stringify(d);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function open(ctxOpts, query) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, ctxOpts || {}));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  p.on('pageerror', e => p.errs.push(String(e)));
  if (query !== undefined) await load(p, query);
  return p;
}
async function load(p, query) {
  await p.goto(GAME + (query ? '?' + query : ''));
  await p.waitForFunction(() => window.BKF && BKF.debug && BKF.debug.mode && BKF.debug.mode !== 'boot', null, { timeout: 15000 });
  await instrument(p);
}
// count calls of Game.flap / Game.startGame: the world's 50 ms flap cooldown would hide double inputs
async function instrument(p) {
  await p.evaluate(() => {
    const G = BKF.Game; if (G._qa) return; G._qa = true;
    G._flapCalls = 0; G._startCalls = 0;
    const f = G.flap, s = G.startGame;
    G.flap = function () { G._flapCalls++; return f.apply(this, arguments); };
    G.startGame = function () { G._startCalls++; return s.apply(this, arguments); };
  });
}
const mode = p => p.evaluate(() => BKF.debug.mode);
const waitMode = (p, m, t) => p.waitForFunction(m => BKF.debug.mode === m, m, { timeout: t || 8000 }).then(() => true, () => false);
const counts = p => p.evaluate(() => ({ calls: BKF.Game._flapCalls, flaps: BKF.debug.world.stats.flaps, starts: BKF.Game._startCalls, mode: BKF.debug.mode, phase: BKF.debug.world.phase }));
const current = p => p.evaluate(() => BKF.UI.current);
// keep Biscuit floating still in an empty kitchen (no gravity, no obstacles)
const calm = p => p.evaluate(() => {
  const w = BKF.debug.world; w.noSpawn = true; w.obstacles.length = 0; w.leaves.length = 0;
  w.cfg.gravity = 0; w.pup.vy = 0; w.pup.y = 250; w.pup.prevY = 250; w.pup.hurtT = 0; w.batteries = 3;
});
const repose = p => p.evaluate(() => { const w = BKF.debug.world; w.pup.vy = 0; w.pup.y = 250; w.batteries = 3; w.pup.hurtT = 0; });
async function startPlaying(p, query) {
  await load(p, 'mute=1&seed=7&autostart=1' + (query ? '&' + query : ''));
  await waitMode(p, 'ready');
  await p.evaluate(() => BKF.debug.flap());
  await waitMode(p, 'playing');
  await calm(p);
}
// the real path to game over: last battery lost on the counter → down → over
async function forceOver(p) {
  await p.evaluate(() => {
    const w = BKF.debug.world; w.cfg.gravity = 1250; w.noSpawn = true; w.obstacles.length = 0;
    w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 470 - 28 - 1; w.pup.vy = 400;
  });
  return waitMode(p, 'over', 15000);
}
async function section(name, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  console.log('\n== ' + name);
  const t0 = Date.now();
  try { await fn(); } catch (e) { check(name + ': section ran without a test crash', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  console.log('   (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ------------------------------------------------------------------ boot + menus
  await section('menus', async () => {
    const p = await open({}, 'mute=1&seed=7');
    check('boot: mode is title', await mode(p) === 'title');
    check('boot: title screen shown', await current(p) === 'scrTitle');
    await sleep(3000);
    const demo = await p.evaluate(() => ({ phase: BKF.debug.world.phase, bot: !!BKF.Game.bot, t: BKF.debug.world.t }));
    check('title: bot demo is flying', demo.phase === 'playing' && demo.bot && demo.t > 0.5, demo);
    // Assets.loadAll() calls renderer.prewarm(1) when the late zone art arrives; that can run before the first resize()
    const early = await p.evaluate(() => { try { const R = new BKF.Renderer(document.createElement('canvas')); R._layer('room_wall', 1200, 540); return 'ok'; } catch (e) { return String(e); } });
    check('renderer: prewarm/_layer safe before the first resize (boot race)', early === 'ok', early);
    check('title: HUD hidden', await p.evaluate(() => document.getElementById('hud').classList.contains('hidden')));

    for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
      await p.click(btn); await sleep(150);
      check(`title → ${scr} opens`, await current(p) === scr && await p.isVisible('#' + scr));
      await p.click(`#${scr} .btn-back`); await sleep(150);
      check(`${scr} → Back returns to title`, await current(p) === 'scrTitle' && !(await p.isVisible('#' + scr)));
      await p.click(btn); await sleep(150);
      await p.keyboard.press('Escape'); await sleep(150);
      check(`${scr}: Esc closes it`, await current(p) === 'scrTitle');
    }
    check('menus: title bot demo still running', await mode(p) === 'title');

    // Play → ready; pause from ready
    await p.click('#btnPlay'); await sleep(200);
    check('Play button → ready (Get Ready hover)', await mode(p) === 'ready' && await p.evaluate(() => BKF.debug.world.phase) === 'ready');
    check('Play: HUD visible', await p.isVisible('#btnPause') && await p.isVisible('#btnMuteHud'));
    await p.keyboard.press('Escape'); await sleep(150);
    check('Esc in ready → paused', await mode(p) === 'paused' && await current(p) === 'scrPause');
    await p.keyboard.press('Escape'); await sleep(150);
    check('Esc in pause → back to ready', await mode(p) === 'ready' && await current(p) === null);

    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    check('Space → playing', await mode(p) === 'playing');
    await p.keyboard.press('Escape'); await sleep(150);
    const t1 = await p.evaluate(() => BKF.debug.world.t);
    await sleep(500);
    const t2 = await p.evaluate(() => BKF.debug.world.t);
    check('Esc → paused, world frozen', await mode(p) === 'paused' && t1 === t2, { t1, t2 });
    check('pause: HUD hidden while the menu is up', await p.evaluate(() => document.getElementById('hud').classList.contains('hidden')));
    await p.keyboard.press('Escape'); await sleep(150);
    check('Esc again → resumed (playing)', await mode(p) === 'playing');
    await p.keyboard.press('KeyP'); await sleep(150);
    check('P → paused', await mode(p) === 'paused');
    await p.keyboard.press('KeyP'); await sleep(150);
    check('P again → resumed', await mode(p) === 'playing');
    await p.click('#btnPause'); await sleep(150);
    check('HUD pause button → paused', await mode(p) === 'paused');
    await p.click('#btnResume'); await sleep(150);
    check('Resume button → playing', await mode(p) === 'playing');

    await p.click('#btnPause'); await sleep(100);
    await p.click('#btnPauseSettings'); await sleep(150);
    check('pause → Settings opens', await current(p) === 'scrSettings' && await mode(p) === 'paused');
    await p.keyboard.press('Escape'); await sleep(150);
    check('Settings (from pause) Esc → back to pause menu', await current(p) === 'scrPause' && await mode(p) === 'paused');
    await p.click('#btnPauseSettings'); await sleep(150);
    await p.click('#scrSettings .btn-back'); await sleep(150);
    check('Settings (from pause) Done → back to pause menu', await current(p) === 'scrPause');
    const id0 = await p.evaluate(() => BKF.debug.world.seed + ':' + BKF.debug.world.t.toFixed(3));
    await p.click('#btnRestart'); await sleep(150);
    check('pause → Restart → fresh run in ready', await mode(p) === 'ready' && await p.evaluate(() => BKF.debug.world.t) === 0, id0);
    await p.keyboard.press('Escape'); await sleep(100);
    await p.click('#btnPauseMenu'); await sleep(200);
    check('pause → Main Menu → title', await mode(p) === 'title' && await current(p) === 'scrTitle');

    // game over screen
    await p.click('#btnPlay'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    check('game over reached', await forceOver(p));
    check('game over screen shown', await current(p) === 'scrOver' && await p.isVisible('#scrOver'));
    await sleep(800);
    await p.click('#btnOverMenu'); await sleep(200);
    check('game over → Menu → title', await mode(p) === 'title');
    await p.click('#btnPlay'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await forceOver(p); await sleep(800);
    await p.click('#btnAgain'); await sleep(200);
    check('game over → Play Again → ready', await mode(p) === 'ready');
    check('menus: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();
  });

  // ------------------------------------------------------------------ keyboard focus / restart lock
  await section('focus', async () => {
    const p = await open({}, 'mute=1&seed=7');
    await sleep(300);
    check('title: Play button has keyboard focus', await p.evaluate(() => document.activeElement && document.activeElement.id) === 'btnPlay');
    await p.keyboard.press('Space'); await sleep(250);
    let c = await counts(p);
    check('Space on focused Play: starts exactly once, no puff', c.starts === 1 && c.mode === 'ready' && c.phase === 'ready' && c.flaps === 0, c);
    check('after start the focus left the menu button', await p.evaluate(() => !document.activeElement || document.activeElement === document.body));
    await p.keyboard.press('Escape'); await sleep(100); await p.click('#btnPauseMenu'); await sleep(300);
    await p.evaluate(() => { BKF.Game._startCalls = 0; });
    await p.keyboard.press('Enter'); await sleep(250);
    c = await counts(p);
    check('Enter on focused Play: starts exactly once, no puff', c.starts === 1 && c.mode === 'ready' && c.phase === 'ready' && c.flaps === 0, c);
    await p.keyboard.press('Escape'); await sleep(100); await p.click('#btnPauseMenu'); await sleep(300);
    await p.focus('#btnHow');
    await p.evaluate(() => { BKF.Game._startCalls = 0; });
    await p.keyboard.press('Enter'); await sleep(200);
    check('Enter on focused How to Play opens it (no game start)', await current(p) === 'scrHow' && (await counts(p)).starts === 0);
    await p.keyboard.press('Escape'); await sleep(100);
    await p.focus('#btnSettings');
    await p.keyboard.press('Space'); await sleep(200);
    check('Space on focused Settings opens it (no game start)', await current(p) === 'scrSettings' && (await counts(p)).starts === 0);
    await p.keyboard.press('Escape'); await sleep(100);

    // restart lock on game over
    await p.keyboard.press('Enter'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await p.evaluate(() => BKF.debug.setSpeed(1));
    await p.evaluate(() => {
      const w = BKF.debug.world; w.cfg.gravity = 1250; w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 441; w.pup.vy = 400;
      // react the instant the Game Over screen appears
      window._overSeen = 0; const id = setInterval(() => { if (BKF.debug.mode === 'over') { window._overSeen = performance.now(); clearInterval(id); } }, 1);
    });
    await waitMode(p, 'over', 15000);
    await p.evaluate(() => { BKF.Game._startCalls = 0; });
    for (const k of ['Enter', 'Space', 'Enter', 'Space']) { await p.keyboard.press(k); await sleep(40); }
    await p.click('#btnAgain');
    const lock = await p.evaluate(() => ({ m: BKF.debug.mode, s: BKF.Game._startCalls, dt: performance.now() - window._overSeen }));
    check('restart lock: Enter/Space/click within 0.7 s do not restart', lock.m === 'over' && lock.s === 0 && lock.dt < 700, lock);
    await sleep(600);
    check('game over: Play Again has focus', await p.evaluate(() => document.activeElement && document.activeElement.id) === 'btnAgain');
    await p.keyboard.press('Space'); await sleep(250);
    c = await counts(p);
    check('Space on focused Play Again after 0.7 s: restarts exactly once, no puff', c.starts === 1 && c.mode === 'ready' && c.phase === 'ready' && c.flaps === 0, c);
    // Enter path
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await forceOver(p); await sleep(800);
    await p.evaluate(() => { BKF.Game._startCalls = 0; });
    await p.keyboard.press('Enter'); await sleep(250);
    c = await counts(p);
    check('Enter on focused Play Again: restarts exactly once, no puff', c.starts === 1 && c.mode === 'ready' && c.flaps === 0, c);
    // Menu button focused on game over: Enter activates Menu (not Play Again)
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await forceOver(p); await sleep(800);
    await p.focus('#btnOverMenu');
    await p.evaluate(() => { BKF.Game._startCalls = 0; });
    await p.keyboard.press('Enter'); await sleep(250);
    check('Enter on focused Menu (game over) → title, no restart', await mode(p) === 'title' && (await counts(p)).starts === 0);
    // HUD button focused by a mouse click must not eat or double Space
    await p.keyboard.press('Enter'); await sleep(100);
    await p.keyboard.press('Space'); await sleep(100); await calm(p);
    const m0 = await p.evaluate(() => BKF.Audio.muted);
    await p.click('#btnMuteHud'); await sleep(100);
    const m1 = await p.evaluate(() => BKF.Audio.muted);
    let c0 = await counts(p);
    await p.keyboard.press('Space'); await sleep(150);
    let c1 = await counts(p);
    const m2 = await p.evaluate(() => BKF.Audio.muted);
    check('HUD mute focused by click, then Space: one puff, mute not toggled again', m1 !== m0 && m2 === m1 && c1.calls - c0.calls === 1 && c1.flaps - c0.flaps === 1, { m0, m1, m2, c0, c1 });
    await p.click('#btnMuteHud');
    check('focus: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();
  });

  // ------------------------------------------------------------------ every input puffs exactly once
  await section('inputs', async () => {
    const p = await open({}, undefined);
    await load(p, 'mute=1&seed=7&autostart=1');
    await waitMode(p, 'ready');
    await p.keyboard.press('Space'); await sleep(120);
    let c = await counts(p);
    check('desktop: first Space starts and puffs once', c.mode === 'playing' && c.calls === 1 && c.flaps === 1, c);
    await calm(p);
    const one = async (name, act) => {
      await repose(p); await sleep(250);
      const a = await counts(p); await act(); await sleep(120); const b = await counts(p);
      check(`desktop: ${name} puffs exactly once`, b.calls - a.calls === 1 && b.flaps - a.flaps === 1, { calls: b.calls - a.calls, flaps: b.flaps - a.flaps });
    };
    await one('Space', () => p.keyboard.press('Space'));
    await one('ArrowUp', () => p.keyboard.press('ArrowUp'));
    await one('W', () => p.keyboard.press('KeyW'));
    await one('Enter', () => p.keyboard.press('Enter'));
    await one('mouse click', () => p.mouse.click(640, 420));
    await one('mouse click (upper screen)', () => p.mouse.click(300, 150));
    await repose(p); await sleep(250);
    let a = await counts(p);
    await p.keyboard.down('Space'); for (let i = 0; i < 6; i++) { await sleep(60); await p.keyboard.down('Space'); } await p.keyboard.up('Space');
    await sleep(100); let b = await counts(p);
    check('desktop: holding Space (auto-repeat) puffs once', b.calls - a.calls === 1 && b.flaps - a.flaps === 1, { calls: b.calls - a.calls });
    await repose(p); await sleep(250);
    a = await counts(p);
    await p.keyboard.down('ArrowUp'); for (let i = 0; i < 6; i++) { await sleep(60); await p.keyboard.down('ArrowUp'); } await p.keyboard.up('ArrowUp');
    await sleep(100); b = await counts(p);
    check('desktop: holding ArrowUp puffs once', b.calls - a.calls === 1, { calls: b.calls - a.calls });
    await repose(p); await sleep(250);
    a = await counts(p); await p.mouse.click(640, 420, { button: 'right' }); await sleep(120); b = await counts(p);
    check('desktop: right click does not puff', b.flaps === a.flaps);
    a = await counts(p); await p.click('#btnMuteHud'); await sleep(120); b = await counts(p);
    check('desktop: clicking HUD mute does not puff', b.calls === a.calls && b.flaps === a.flaps, { a, b });
    await p.click('#btnMuteHud'); await sleep(100);
    a = await counts(p); await p.click('#btnPause'); await sleep(120); b = await counts(p);
    check('desktop: clicking HUD pause does not puff', b.calls === a.calls && b.mode === 'paused', { a, b });
    await p.click('#btnResume'); await sleep(150);
    a = await counts(p); await p.keyboard.press('KeyM'); await sleep(100); b = await counts(p);
    check('desktop: M does not puff', b.calls === a.calls);
    await p.keyboard.press('KeyM');
    check('inputs desktop: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();

    for (const dev of ['iPhone 13 landscape', 'iPad Pro 11 landscape']) {
      const t = await open({ ...devices[dev] }, undefined);
      await load(t, 'mute=1&seed=3&autostart=1');
      await waitMode(t, 'ready');
      check(`${dev}: touch device detected`, await t.evaluate(() => BKF.Game.isTouch && document.body.classList.contains('touch')));
      const vp = t.viewportSize();
      await t.touchscreen.tap(vp.width * 0.5, vp.height * 0.6); await sleep(150);
      c = await counts(t);
      check(`${dev}: first tap starts and puffs once`, c.mode === 'playing' && c.calls === 1 && c.flaps === 1, c);
      await calm(t);
      for (const [x, y] of [[0.3, 0.5], [0.8, 0.8], [0.5, 0.2]]) {
        await repose(t); await sleep(250);
        a = await counts(t); await t.touchscreen.tap(vp.width * x, vp.height * y); await sleep(150); b = await counts(t);
        check(`${dev}: tap at (${x},${y}) puffs exactly once`, b.calls - a.calls === 1 && b.flaps - a.flaps === 1, { calls: b.calls - a.calls, flaps: b.flaps - a.flaps });
      }
      const center = async sel => { const r = await t.locator(sel).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
      await repose(t); await sleep(250);
      a = await counts(t); const mu0 = await t.evaluate(() => BKF.Audio.muted);
      await t.touchscreen.tap(...await center('#btnMuteHud')); await sleep(200);
      b = await counts(t); const mu1 = await t.evaluate(() => BKF.Audio.muted);
      check(`${dev}: tapping HUD mute toggles once, never puffs`, b.calls === a.calls && mu1 !== mu0, { a, b, mu0, mu1 });
      await sleep(700);
      await t.touchscreen.tap(...await center('#btnMuteHud')); await sleep(700);
      check(`${dev}: second mute tap toggles back`, await t.evaluate(() => BKF.Audio.muted) === mu0);
      a = await counts(t); await t.touchscreen.tap(...await center('#btnPause')); await sleep(250); b = await counts(t);
      check(`${dev}: tapping HUD pause pauses, never puffs`, b.calls === a.calls && b.mode === 'paused', { a, b });
      await sleep(700);
      check(`${dev}: pause menu stays open after the tap (no ghost click)`, await mode(t) === 'paused' && await current(t) === 'scrPause');
      await t.touchscreen.tap(...await center('#btnResume')); await sleep(250);
      check(`${dev}: tap Resume → playing`, await mode(t) === 'playing');
      check(`${dev}: zero console errors`, t.errs.length === 0, t.errs);
      await t.context().close();
    }
  });

  // ------------------------------------------------------------------ scoring rules
  await section('scoring', async () => {
    const p = await open({}, undefined);
    await startPlaying(p);
    let r = await p.evaluate(() => {
      const w = BKF.debug.world, s0 = w.score, l0 = w.leafCount;
      w.addLeaf(w.pup.x + 4, w.pup.y, 'basil'); w.update(1 / 120);
      return { ds: w.score - s0, dl: w.leafCount - l0, left: w.leaves.length };
    });
    check('leaf: +1 score, +1 leaf, leaf removed', r.ds === 1 && r.dl === 1 && r.left === 0, r);
    r = await p.evaluate(() => {
      const w = BKF.debug.world, s0 = w.score, p0 = w.passed;
      w.spawn('stack', { x: w.pup.x - 200, pieces: ['pot'] }); w.update(1 / 120);
      const a = { ds: w.score - s0, dp: w.passed - p0 };
      w.update(1 / 120); a.ds2 = w.score - s0;
      w.obstacles.length = 0; return a;
    });
    check('pass: +1 score once per obstacle', r.ds === 1 && r.dp === 1 && r.ds2 === 1, r);
    r = await p.evaluate(() => {
      const w = BKF.debug.world; w.pup.y = 184; w.pup.vy = 0;
      const b0 = w.batteries, s0 = w.score;
      w.spawn('hang', { x: w.pup.x + 30, len: 0, still: true, sprite: 'pan' });
      w.update(1 / 120);
      const evs = w.events.filter(e => e.type === 'bump');
      const out = { lost: b0 - w.batteries, hurtT: w.pup.hurtT, H: w.cfg.hurtTime, state: w.pup.state, bumps: evs.length, ds: w.score - s0 };
      // stay inside the obstacle for a whole second: still only one battery
      for (let i = 0; i < 120; i++) { w.pup.y = 184; w.pup.x = 260; w.obstacles[0].x = 290; w.update(1 / 120); }
      out.lostAfter1s = b0 - w.batteries;
      w.obstacles.length = 0; w.pup.vy = 0; w.pup.y = 250;
      let n = 0; while (w.pup.hurtT > 0 && n < 1000) { w.pup.y = 250; w.update(1 / 120); n++; }
      out.blink = 1 + (n / 120);   // 1 s already elapsed above
      out.stateAfter = w.pup.state;
      return out;
    });
    check('bump: costs exactly one battery', r.lost === 1 && r.bumps === 1, r);
    check('bump: safe blink of cfg.hurtTime (1.5 s; 2.5 s on Easy), state hurt', Math.abs(r.hurtT - r.H) < 0.02 && r.state === 'hurt', r);
    check('bump: overlapping during the blink never costs again', r.lostAfter1s === 1, r);
    check('bump: blink ends ≈hurtTime after the bump', r.blink > r.H - 0.05 && r.blink < r.H + 0.1 && r.stateAfter === 'fly', r);
    check('bump: no score change', r.ds === 0, r);
    r = await p.evaluate(() => {
      const w = BKF.debug.world; w.batteries = 3; w.pup.hurtT = 0;
      w.pup.y = 470 - 28 + 2; w.pup.vy = 300; w.update(1 / 120);
      const ev = w.events.filter(e => e.type === 'counter');
      const out = { lost: 3 - w.batteries, vy: w.pup.vy, cost: ev.length && ev[ev.length - 1].cost, y: w.pup.y };
      w.pup.y = 470 - 28 + 2; w.pup.vy = 300; w.update(1 / 120);
      out.lostDuringBlink = 3 - w.batteries; out.bounce2 = w.pup.vy < 0;
      w.pup.y = 250; w.pup.vy = 0;
      return out;
    });
    check('counter bump: one battery, bounce up', r.lost === 1 && r.cost === true && r.vy < 0, r);
    check('counter during blink: bounce, no cost', r.lostDuringBlink === 1 && r.bounce2, r);
    r = await p.evaluate(() => {
      const w = BKF.debug.world, N = w.cfg.leavesPerBattery, M = w.maxBatteries; w.batteries = M - 1; w.leafCount = N - 1; w.pup.hurtT = 0;
      w.addLeaf(w.pup.x, w.pup.y); w.update(1 / 120);
      const a = { N, M, b15: w.batteries - (M - 3), ev: w.events.some(e => e.type === 'battery') };
      w.leafCount = 2 * N - 1; w.addLeaf(w.pup.x, w.pup.y); w.update(1 / 120); a.full30 = w.batteries - (M - 3);
      w.batteries = 1; w.leafCount = N; w.addLeaf(w.pup.x, w.pup.y); w.update(1 / 120); a.b16 = w.batteries;
      w.batteries = 3; return a;
    });
    check('battery back on every cfg.leavesPerBattery-th leaf', r.b15 === 3 && r.ev, r);
    check('battery stays at max (full)', r.full30 === 3, r);
    check('no battery on a non-multiple', r.b16 === 1, r);
    await sleep(300);
    const hudLeft = await p.evaluate(() => BKF.debug.world.batteries);
    check('battery count restored for the next checks', hudLeft === 3);

    // level change
    const lv = await p.evaluate(() => { const w = BKF.debug.world; w.levelBumps = 0; const s = w.score; w.levelT = w.levelLen - 0.05; return s; });
    await sleep(500);
    r = await p.evaluate(() => { const w = BKF.debug.world, R = BKF.Game.renderer; return { level: w.level, zone: w.zone, score: w.score, banner: R.banner && R.banner.text, vis: R.vis.cur, wx: BKF.debug.weather.zone, len: w.levelLen }; });
    check('level change after levelLen (60 s)', r.level === 1 && r.zone === 1 && r.len === 60, r);
    check('clean level: +5 bonus', r.score === lv + 5, { before: lv, after: r.score });
    check('level change: banner "Rainy Noon"', r.banner === 'Rainy Noon', r);
    check('level change: renderer + weather switch to rainy', r.vis === 1 && r.wx === 1, r);
    const lv2 = await p.evaluate(() => { const w = BKF.debug.world; w.levelBumps = 1; const s = w.score; w.levelT = w.levelLen - 0.05; return s; });
    await sleep(400);
    r = await p.evaluate(() => ({ level: BKF.debug.world.level, score: BKF.debug.world.score, banner: BKF.Game.renderer.banner && BKF.Game.renderer.banner.text }));
    check('level with a bump: no bonus, banner "Windy Sunset"', r.level === 2 && r.score === lv2 && r.banner === 'Windy Sunset', { lv2, r });
    await p.evaluate(() => BKF.debug.gotoLevel(3));
    await sleep(1200);
    r = await p.evaluate(() => { const w = BKF.debug.world; return { zone: w.zone, dark: w.darkness, vis: BKF.Game.renderer.vis.cur, wx: BKF.debug.weather.zone, banner: BKF.Game.renderer.banner && BKF.Game.renderer.banner.text }; });
    check('gotoLevel(3): Snowy Night, darkness > 0.5', r.zone === 3 && r.dark > 0.5 && r.vis === 3 && r.wx === 3 && r.banner === 'Snowy Night', r);
    await p.evaluate(() => { BKF.debug.world.levelT = 40; });
    await sleep(200);
    r = await p.evaluate(() => BKF.debug.world.darkness);
    check('deep night: darkness ≈ 0.62', Math.abs(r - 0.62) < 0.01, r);
    await p.evaluate(() => BKF.debug.gotoLevel(4));
    await sleep(300);
    r = await p.evaluate(() => ({ zone: BKF.debug.world.zone, loop: BKF.debug.world.loop, dark: BKF.debug.world.darkness, banner: BKF.Game.renderer.banner }));
    check('after the night: round 2 sunny, light again, "Day 2" banner', r.zone === 0 && r.loop === 1 && r.dark < 0.05 && r.banner && r.banner.sub === 'Day 2', r);

    // 0 batteries → down → over
    await p.evaluate(() => BKF.debug.gotoLevel(0));
    await calm(p);
    r = await p.evaluate(() => {
      const w = BKF.debug.world; w.cfg.gravity = 1250; w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 184; w.score = 57;
      w.spawn('hang', { x: w.pup.x + 30, len: 0, still: true }); w.update(1 / 120);
      return { phase: w.phase, b: w.batteries, ev: w.events.map(e => e.type) };
    });
    check('last battery → phase down', r.phase === 'down' && r.b === 0 && r.ev.includes('down'), r);
    await sleep(150);
    const flapDown = await p.evaluate(() => { const a = BKF.debug.world.stats.flaps; BKF.debug.flap(); return BKF.debug.world.stats.flaps - a; });
    check('no puffing while powered down', flapDown === 0);
    check('down → game over screen', await waitMode(p, 'over', 10000) && await current(p) === 'scrOver');
    r = await p.evaluate(() => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, medal: document.getElementById('medal').className, name: document.getElementById('medalName').textContent, stats: document.getElementById('overStats').textContent }));
    check('game over shows score, best, silver medal for 57', r.score === '57' && /^\d+$/.test(r.best) && r.medal.includes('silver') && /Silver/.test(r.name) && /Reached/.test(r.stats), r);
    check('scoring: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();

    // medal thresholds
    const q = await open({}, 'mute=1&seed=1');
    const med = await q.evaluate(() => [0, 19, 20, 49, 50, 99, 100, 179, 180].map(s => { BKF.UI.showGameOver({ score: s, best: s, newBest: false, leaves: 0, passed: 0, bumps: 0, clean: 0, reached: 'x' }); return document.getElementById('medal').className.replace('medal ', ''); }));
    check('medals: none<20, bronze 20, silver 50, gold 100, platinum 180', JSON.stringify(med) === JSON.stringify(['none', 'none', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum']), med);
    await q.context().close();
  });

  // ------------------------------------------------------------------ settings + best score persistence
  await section('settings', async () => {
    const p = await open({}, 'seed=7');
    const ls = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('bkf:')).map(k => [k, localStorage.getItem(k)])));
    check('first run: Easy, sound + music on', JSON.stringify(await p.evaluate(() => BKF.Game.settings)) === JSON.stringify({ sfx: true, music: true, muted: false, difficulty: 'easy' }));
    await p.click('#btnSettings'); await sleep(200);
    await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)');
    await p.click('#setDifficulty button[data-v=hard]'); await sleep(100);
    check('settings UI: hard is highlighted', await p.evaluate(() => document.querySelector('#setDifficulty .on').dataset.v) === 'hard');
    await p.reload(); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    let s = await p.evaluate(() => BKF.Game.settings);
    check('settings persist across reload (sfx off, music off, hard)', s.sfx === false && s.music === false && s.difficulty === 'hard', s);
    await p.click('#btnSettings'); await sleep(200);
    check('settings UI reflects saved values after reload', await p.evaluate(() => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
    await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)'); await p.click('#setDifficulty button[data-v=easy]');
    await p.keyboard.press('Escape');
    await p.keyboard.press('KeyM'); await sleep(100);
    check('M mutes and saves', await p.evaluate(() => BKF.Game.settings.muted && BKF.Audio.muted) && JSON.parse((await ls())['bkf:settings']).muted === true);
    await p.reload(); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    check('mute persists across reload', await p.evaluate(() => BKF.Game.settings.muted && BKF.Audio.muted));
    await p.keyboard.press('KeyM'); await sleep(100);
    check('M again unmutes and saves', await p.evaluate(() => !BKF.Game.settings.muted && !BKF.Audio.muted) && JSON.parse((await ls())['bkf:settings']).muted === false);
    // ?mute=1 never written
    await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    check('?mute=1 mutes audio', await p.evaluate(() => BKF.Audio.muted && BKF.Game.urlMute));
    await p.click('#btnSettings'); await sleep(150); await p.click('#setDifficulty button[data-v=normal]'); await p.click('#setDifficulty button[data-v=easy]'); await p.keyboard.press('Escape');
    check('?mute=1 is not saved into settings', JSON.parse((await ls())['bkf:settings']).muted === false);
    await p.keyboard.press('KeyM'); await sleep(100);
    check('?mute=1 then M: sound on, nothing muted saved', await p.evaluate(() => !BKF.Audio.muted) && JSON.parse((await ls())['bkf:settings']).muted === false);
    await p.goto(GAME + '?seed=7'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    check('after a ?mute=1 visit a normal load is not muted', await p.evaluate(() => !BKF.Audio.muted));

    // best score per difficulty (an untouched run: no test flags)
    await p.evaluate(() => { localStorage.removeItem('bkf:best_easy'); localStorage.removeItem('bkf:best_normal'); localStorage.removeItem('bkf:best_hard'); });
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    const play = async score => {
      await p.click('#btnPlay'); await sleep(100); await p.keyboard.press('Space'); await sleep(100);
      await p.evaluate(sc => { const w = BKF.debug.world; w.noSpawn = true; w.obstacles.length = 0; w.score = sc; }, score);
      await forceOver(p); await sleep(300);
      return p.evaluate(() => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
    };
    let o = await play(7);
    check('real run on Easy: best saved (7) + NEW!', (await ls())['bkf:best_easy'] === '7' && o.best === '7' && o.nb, { o, ls: await ls() });
    await sleep(600); await p.click('#btnOverMenu'); await sleep(200);
    o = await play(4);
    check('lower score keeps best 7, no NEW!', (await ls())['bkf:best_easy'] === '7' && o.best === '7' && !o.nb, o);
    await sleep(600); await p.click('#btnOverMenu'); await sleep(200);
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=normal]'); await p.keyboard.press('Escape'); await sleep(100);
    check('title best follows difficulty (Normal → 0)', await p.textContent('#bestTitle') === '0');
    o = await play(3);
    let L = await ls();
    check('best saved per difficulty (normal 3, easy 7)', L['bkf:best_normal'] === '3' && L['bkf:best_easy'] === '7', L);
    await sleep(600); await p.click('#btnOverMenu'); await sleep(200);
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=easy]'); await p.keyboard.press('Escape'); await sleep(100);
    check('title best shows Easy best 7', await p.textContent('#bestTitle') === '7');
    // tainted runs
    for (const qy of ['bot=1&skill=0', 'speed=2', 'level=1', 'diff=easy']) {
      await p.goto(GAME + '?mute=1&autostart=1&' + qy); await p.waitForFunction(() => BKF.debug && (BKF.debug.mode === 'ready' || BKF.debug.mode === 'playing'));
      if (!qy.startsWith('bot')) { await p.evaluate(() => BKF.debug.flap()); }
      await waitMode(p, 'playing');
      await p.evaluate(() => { const w = BKF.debug.world; w.noSpawn = true; w.obstacles.length = 0; w.score = 99; BKF.debug.setBot(false); });
      await forceOver(p); await sleep(300);
      L = await ls();
      const shown = await p.evaluate(() => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
      check(`?${qy} run never saves a best (easy stays 7)`, L['bkf:best_easy'] === '7' && !L['bkf:best_hard'] && shown.best !== '99' && !shown.nb, { L, shown });
    }
    await p.goto(GAME + '?mute=1&autostart=1'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'ready');
    await p.evaluate(() => BKF.debug.flap()); await waitMode(p, 'playing');
    await p.evaluate(() => { const w = BKF.debug.world; w.noSpawn = true; w.obstacles.length = 0; w.score = 99; BKF.debug.setSpeed(2); BKF.debug.setSpeed(1); });
    await forceOver(p); await sleep(200);
    check('debug.setSpeed during a run taints it', (await ls())['bkf:best_easy'] === '7');
    // reset best: two taps
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    await p.click('#btnSettings'); await sleep(150);
    await p.click('#btnResetBest'); await sleep(100);
    L = await ls();
    check('reset best: first tap only arms ("Sure?")', L['bkf:best_easy'] === '7' && await p.textContent('#btnResetBest') === 'Sure?');
    await sleep(3300);
    check('reset best: disarms after 3 s', await p.textContent('#btnResetBest') === 'Reset');
    await p.click('#btnResetBest'); await sleep(100);
    check('reset best: a single tap after disarm does not clear', (await ls())['bkf:best_easy'] === '7');
    await p.click('#btnResetBest'); await sleep(150);
    L = await ls();
    check('reset best: second tap clears every difficulty', !L['bkf:best_easy'] && !L['bkf:best_normal'] && !L['bkf:best_hard'], L);
    await p.keyboard.press('Escape'); await sleep(100);
    check('title best shows 0 after reset', await p.textContent('#bestTitle') === '0');
    check('settings: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();
  });

  // ------------------------------------------------------------------ Change Pictures
  await section('pictures', async () => {
    const p = await open({}, 'mute=1&seed=7');
    const makeImg = (w, h, type, transparent) => p.evaluate(([w, h, type, transparent]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (!transparent) { g.fillStyle = '#4a8f6a'; g.fillRect(0, 0, w, h); }
      g.fillStyle = '#e33'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, 7); g.fill();
      return c.toDataURL(type, 0.85).split(',')[1];
    }, [w, h, type, transparent]).then(b => Buffer.from(b, 'base64'));
    const png = await makeImg(300, 300, 'image/png', true);
    const jpg = await makeImg(640, 480, 'image/jpeg', false);
    const huge = await makeImg(5000, 4000, 'image/jpeg', false);
    const hugePng = await makeImg(5000, 4000, 'image/png', true);
    const toastAfter = async () => {
      await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t.classList.contains('hidden') && !/Saving/.test(t.textContent); }, null, { timeout: 15000 });
      return p.textContent('#toast');
    };
    const pick = async (slot, file) => {
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slot + 1}) [data-act=pick]`)]);
      await fc.setFiles(file);
      return toastAfter();
    };
    await p.click('#btnCustomize'); await sleep(200);
    check('Change Pictures: 3 slots (Biscuit, Leaves, Kitchen wall)', await p.evaluate(() => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent).join('|')) === 'Biscuit|Leaves|Kitchen wall');
    let t = await pick(0, { name: 'pup.png', mimeType: 'image/png', buffer: png });
    let r = await p.evaluate(() => ({ has: !!BKF.Assets.custom.pup, shape: BKF.Storage.get('shape_pup'), w: BKF.Assets.custom.pup && BKF.Assets.custom.pup.width, tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent }));
    check('transparent PNG → Biscuit custom, kept whole (fit)', r.has && r.shape === 'fit' && r.w === 300 && /Your picture/.test(r.tag) && /saved/.test(t), { r, t });
    t = await pick(1, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpg });
    r = await p.evaluate(() => ({ has: !!BKF.Assets.custom.leaf, shape: BKF.Storage.get('shape_leaf'), w: BKF.Assets.custom.leaf && BKF.Assets.custom.leaf.width, h: BKF.Assets.custom.leaf && BKF.Assets.custom.leaf.height }));
    check('opaque JPEG photo → Leaves custom, round sticker (circle 512)', r.has && r.shape === 'circle' && r.w === 512 && r.h === 512, { r, t });
    const t0 = Date.now();
    t = await pick(2, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
    r = await p.evaluate(() => ({ has: !!BKF.Assets.custom.wall, w: BKF.Assets.custom.wall && BKF.Assets.custom.wall.width, h: BKF.Assets.custom.wall && BKF.Assets.custom.wall.height, len: (localStorage.getItem('bkf:img_wall') || '').length }));
    check('huge 5000×4000 JPEG → wall downscaled to 1600×1280, stored small', r.has && r.w === 1600 && r.h === 1280 && r.len < 1.5e6 && /saved/.test(t), { r, t, ms: Date.now() - t0 });
    t = await pick(0, { name: 'huge.png', mimeType: 'image/png', buffer: hugePng });
    r = await p.evaluate(() => ({ w: BKF.Assets.custom.pup.width, h: BKF.Assets.custom.pup.height, len: (localStorage.getItem('bkf:img_pup') || '').length }));
    check('huge 5000×4000 PNG → Biscuit ≤ 512 px', r.w === 512 && r.h === 410 && r.len < 1e6 && /saved/.test(t), { r, t });
    t = await pick(0, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
    r = await p.evaluate(() => ({ w: BKF.Assets.custom.pup && BKF.Assets.custom.pup.width }));
    check('non-image file → error toast, picture unchanged', /picture file/i.test(t) && r.w === 512, { t, r });
    t = await pick(1, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000garbage-garbage-garbage', 'utf8') });
    r = await p.evaluate(() => ({ has: !!BKF.Assets.custom.leaf, shape: BKF.Storage.get('shape_leaf') }));
    check('corrupt image → error toast, previous picture kept', /could not be opened/i.test(t) && r.has && r.shape === 'circle', { t, r });
    // shape buttons
    await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=circle]'); await sleep(100);
    r = await p.evaluate(() => ({ shape: BKF.Storage.get('shape_pup'), w: BKF.Assets.custom.pup.width, h: BKF.Assets.custom.pup.height }));
    check('shape "Round" makes a 512 round sticker', r.shape === 'circle' && r.w === 512 && r.h === 512, r);
    await p.click('#slotGrid .slot:nth-child(1) .shape button[data-shape=fit]'); await sleep(100);
    check('shape "Whole picture" back to fit', await p.evaluate(() => BKF.Storage.get('shape_pup') === 'fit' && BKF.Assets.custom.pup.height === 410));
    // the game draws them
    await p.click('#scrCustom .btn-back'); await sleep(100);
    await p.click('#btnPlay'); await sleep(100); await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await p.evaluate(() => {
      const w = BKF.debug.world; w.addLeaf(560, 250, 'mint'); w.addLeaf(700, 300, 'bay');
      window._keys = new Set(); const A = BKF.Assets, s = A.sprite.bind(A); A.sprite = (k, a, b) => { window._keys.add(k); return s(k, a, b); };
    });
    await sleep(500);
    r = await p.evaluate(() => ({ keys: [...window._keys], cw: Object.keys(BKF.Game.renderer._bgCache).some(k => k.startsWith('cw@')), defPup: [...window._keys].some(k => /^pup_/.test(k)), defLeaf: [...window._keys].some(k => /^leaf_/.test(k)) }));
    check('game draws custom Biscuit (not the default pup)', r.keys.includes('custom:pup') && !r.defPup, r.keys);
    check('game draws custom leaves (not the default leaf art)', r.keys.includes('custom:leaf') && !r.defLeaf, r.keys);
    check('game draws the custom kitchen wall', r.cw, r);
    // persistence
    await p.reload(); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'title');
    check('custom pictures survive a reload', await p.evaluate(() => !!(BKF.Assets.custom.pup && BKF.Assets.custom.leaf && BKF.Assets.custom.wall)));
    // reset one / reset all
    await p.click('#btnCustomize'); await sleep(200);
    await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]'); await sleep(150);
    r = await p.evaluate(() => ({ pup: !!BKF.Assets.custom.pup, leaf: !!BKF.Assets.custom.leaf, ls: localStorage.getItem('bkf:img_pup'), tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent }));
    check('Reset (Biscuit) restores the default only for that slot', !r.pup && r.leaf && r.ls === null && r.tag === 'Original', r);
    await p.click('#btnResetAll'); await sleep(150);
    r = await p.evaluate(() => ({ any: Object.keys(BKF.Assets.custom).length, ls: Object.keys(localStorage).filter(k => /^bkf:(img|shape)_/.test(k)) }));
    check('Reset all restores every default and clears storage', r.any === 0 && r.ls.length === 0, r);
    await p.click('#scrCustom .btn-back'); await sleep(100);
    await p.click('#btnPlay'); await sleep(100); await p.keyboard.press('Space'); await sleep(100); await calm(p);
    await p.evaluate(() => { BKF.debug.world.addLeaf(560, 250, 'mint'); window._keys = new Set(); const A = BKF.Assets, s = A.sprite.bind(A); A.sprite = (k, a, b) => { window._keys.add(k); return s(k, a, b); }; });
    await sleep(400);
    r = await p.evaluate(() => [...window._keys]);
    check('after Reset all the default art is drawn again', r.some(k => /^pup_/.test(k)) && r.some(k => /^leaf_/.test(k)) && !r.some(k => k.startsWith('custom:')), r);
    check('pictures: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();
  });

  // ------------------------------------------------------------------ layout
  await section('layout', async () => {
    const configs = [
      ['1280×720@1', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }],
      ['1920×1080@2', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }],
      ['2560×1440@1', { viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 }],
      ['800×600', { viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }],
      ['iPhone 13 landscape', devices['iPhone 13 landscape']],
      ['iPhone SE landscape', devices['iPhone SE landscape']],
      ['iPad Pro 11 landscape', devices['iPad Pro 11 landscape']],
      ['iPad Pro 11 portrait', devices['iPad Pro 11']]
    ];
    const measure = p => p.evaluate(() => {
      const W = innerWidth, H = innerHeight, scr = document.querySelector('.screen:not(.hidden)');
      const box = scr && (scr.querySelector('.panel') || scr.querySelector('.title-wrap'));
      const r = box.getBoundingClientRect();
      const bad = [...box.querySelectorAll('button, .slot')].filter(b => b.offsetParent !== null).map(b => {
        const q = b.getBoundingClientRect();
        return { id: b.id || b.className.split(' ')[0] + ':' + b.textContent.trim().slice(0, 14), ok: q.left >= -1 && q.top >= -1 && q.right <= W + 1 && q.bottom <= H + 1 && q.bottom <= r.bottom + 1 && q.right <= r.right + 1 && q.left >= r.left - 1 };
      }).filter(b => !b.ok).map(b => b.id);
      const c = document.getElementById('game').getBoundingClientRect();
      return { id: scr.id, W, H, box: [r.left, r.top, r.right, r.bottom].map(Math.round), inside: r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1,
        vscroll: box.scrollHeight - box.clientHeight, hscrollBox: box.scrollWidth - box.clientWidth, bad, hscroll: document.documentElement.scrollWidth - W,
        canvas: Math.abs(c.left) < 1 && Math.abs(c.top) < 1 && Math.abs(c.width - W) < 1.5 && Math.abs(c.height - H) < 1.5 };
    });
    for (const [name, opts] of configs) {
      const p = await open(opts, 'mute=1&seed=1');
      await sleep(1200);   // let the title's pop-in animation (scale 0.85 → 1.03 → 1) finish before measuring
      const screens = [['title', () => {}], ['How to Play', () => BKF.UI.open('scrHow', 'scrTitle')], ['Settings', () => BKF.UI.open('scrSettings', 'scrTitle')],
        ['Change Pictures', () => BKF.UI.open('scrCustom', 'scrTitle')], ['Pause', () => { BKF.Game.startGame(); BKF.Game.pause(); }],
        ['Pause→Settings', () => BKF.UI.open('scrSettings', 'scrPause')],
        ['Game Over', () => { BKF.Game.startGame(); BKF.Game.world.score = 188; BKF.Game.gameOver(); BKF.UI.showGameOver({ score: 188, best: 1888, newBest: true, leaves: 120, passed: 60, bumps: 12, clean: 3, reached: 'Snowy Night (day 2)' }); }]];
      const issues = [];
      for (const [sn, fn] of screens) {
        await p.evaluate(fn); await sleep(450);
        const m = await measure(p);
        if (!m.inside) issues.push(`${sn}: panel outside viewport ${JSON.stringify(m.box)} in ${m.W}×${m.H}`);
        if (m.vscroll > 2) issues.push(`${sn}: panel needs scrolling (${m.vscroll}px)`);
        if (m.hscrollBox > 2) issues.push(`${sn}: panel scrolls sideways (${m.hscrollBox}px)`);
        if (m.bad.length) issues.push(`${sn}: controls cut off ${m.bad.join(',')}`);
        if (m.hscroll > 0) issues.push(`${sn}: page scrolls horizontally`);
        if (!m.canvas) issues.push(`${sn}: canvas does not cover the viewport`);
        if (sn === 'Change Pictures' || sn === 'Settings') await p.evaluate(() => BKF.UI.back());
      }
      check(`layout ${name}: every menu fits (title, how, settings, pictures, pause, over)`, issues.length === 0, issues);
      await p.evaluate(() => BKF.Game.startGame()); await sleep(400);
      const hud = await p.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        return ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, ok: r.width >= 24 && r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H, w: Math.round(r.width) }; });
      });
      check(`layout ${name}: HUD buttons inside the screen`, hud.every(h => h.ok), hud);
      if (opts.hasTouch) check(`layout ${name}: HUD buttons ≥ 44 px for fingers`, hud.every(h => h.w >= 44), hud);
      const back = await p.evaluate(() => { const c = document.getElementById('game'); return { w: c.width, h: c.height, dpr: devicePixelRatio, px: BKF.Game.renderer.px }; });
      check(`layout ${name}: canvas backing store capped (≤ ~1920×1080 device px)`, back.w * back.h <= 1920 * 1080 * 1.05, back);
      check(`layout ${name}: rotate card not shown`, !(await p.isVisible('#rotate')));
      check(`layout ${name}: zero console errors`, p.errs.length === 0, p.errs);
      await p.context().close();
    }
    // iPhone held upright
    const ph = await open({ ...devices['iPhone 13'] }, 'mute=1&seed=1');
    await sleep(400);
    check('iPhone portrait: title has no rotate card', !(await ph.isVisible('#rotate')));
    await ph.evaluate(() => BKF.UI.open('scrSettings', 'scrTitle')); await sleep(400);
    let m = await measure(ph);
    check('iPhone portrait: Settings fits', m.inside && m.vscroll <= 2 && !m.bad.length && m.hscroll <= 0, m);
    await ph.evaluate(() => BKF.UI.back());
    const pl = ph.locator('#btnPlay').boundingBox ? await ph.locator('#btnPlay').boundingBox() : null;
    await ph.touchscreen.tap(pl.x + pl.width / 2, pl.y + pl.height / 2); await sleep(400);
    check('iPhone portrait: Play shows the "turn sideways" card', await ph.isVisible('#rotate') && await mode(ph) === 'ready');
    const t1 = await ph.evaluate(() => BKF.debug.world.readyT); await sleep(400);
    check('iPhone portrait: game frozen behind the rotate card', await ph.evaluate(() => BKF.debug.world.readyT) === t1);
    const ok = await ph.locator('#btnRotateOk').boundingBox();
    const f0 = await counts(ph);
    await ph.touchscreen.tap(ok.x + ok.width / 2, ok.y + ok.height / 2); await sleep(400);
    const f1 = await counts(ph);
    check('iPhone portrait: "Play upright anyway" hides the card without puffing', !(await ph.isVisible('#rotate')) && f1.calls === f0.calls && f1.phase === 'ready', { f0, f1 });
    await ph.touchscreen.tap(190, 500); await sleep(200);
    check('iPhone portrait: tap then plays upright', await mode(ph) === 'playing');
    const hud = await ph.evaluate(() => ['btnPause', 'btnMuteHud'].every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    check('iPhone portrait: HUD buttons inside the screen', hud);
    check('iPhone portrait: zero console errors', ph.errs.length === 0, ph.errs);
    await ph.context().close();
  });

  // ------------------------------------------------------------------ blur / visibility auto-pause
  await section('autopause', async () => {
    const p = await open({}, undefined);
    await startPlaying(p);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);
    check('window blur while playing → paused', await mode(p) === 'paused' && await current(p) === 'scrPause');
    await p.click('#btnResume'); await sleep(100);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(100);
    check('tab hidden (visibilitychange) → paused', await mode(p) === 'paused');
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(100);
    check('tab visible again: stays paused until the player resumes', await mode(p) === 'paused');
    await p.click('#btnResume'); await sleep(100);
    // ready: blur does nothing harmful
    await p.click('#btnPause'); await p.click('#btnRestart'); await sleep(150);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);
    check('blur in Get Ready: no pause menu, still ready', await mode(p) === 'ready');
    await p.evaluate(() => BKF.debug.flap()); await sleep(100); await calm(p);
    // powered-down float: neither blur nor Esc may pause
    await p.evaluate(() => { const w = BKF.debug.world; w.cfg.gravity = 1250; w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 120; w.pup.vy = 0; w.spawn('hang', { x: w.pup.x + 30, len: 0, still: true }); w.pup.y = 184; });
    await p.waitForFunction(() => BKF.debug.world.phase === 'down', null, { timeout: 3000 });
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(50);
    const downBlur = await p.evaluate(() => ({ mode: BKF.debug.mode, phase: BKF.debug.world.phase, ui: BKF.UI.current }));
    if (downBlur.mode === 'paused') { await p.click('#btnResume'); await sleep(50); }
    await p.keyboard.press('Escape'); await sleep(50);
    const downEsc = await p.evaluate(() => ({ mode: BKF.debug.mode, phase: BKF.debug.world.phase, ui: BKF.UI.current }));
    if (downEsc.mode === 'paused') { await p.click('#btnResume'); await sleep(50); }
    check('powered down (phase "down"): blur does not pause', downBlur.mode !== 'paused', downBlur);
    check('powered down (phase "down"): Esc does not pause', downEsc.mode !== 'paused', downEsc);
    // the 0.5 s between "gameOver" and the Game Over screen
    await p.waitForFunction(() => BKF.debug.world.phase === 'over', null, { timeout: 8000 });
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    const r1 = await p.evaluate(() => BKF.debug.mode);
    await p.keyboard.press('Escape');
    const r2 = await p.evaluate(() => BKF.debug.mode);
    check('over frames (before the screen): blur/Esc do not pause', r1 !== 'paused' && r2 !== 'paused', { r1, r2 });
    check('game over screen still arrives', await waitMode(p, 'over', 5000) && await current(p) === 'scrOver');
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.keyboard.press('Escape'); await sleep(100);
    check('game over screen: blur/Esc keep it', await mode(p) === 'over' && await current(p) === 'scrOver');
    // title: blur must not do anything
    await sleep(700); await p.click('#btnOverMenu'); await sleep(100);
    await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);
    check('title: blur keeps the title', await mode(p) === 'title' && await current(p) === 'scrTitle');
    check('autopause: zero console errors', p.errs.length === 0, p.errs);
    await p.context().close();
  });

  // ------------------------------------------------------------------ long high-speed bot run
  await section('soak', async () => {
    const p = await open({}, undefined);
    await load(p, 'speed=16&bot=1&skill=0.3&autorestart=1&autostart=1&mute=1&seed=5&diff=normal');   // Easy is tuned so a skill-0.3 bot rarely dies   // without autostart the bot only plays the title demo; skill 1 never dies in 16 game-minutes
    await sleep(500);
    let maxP = 0, maxFx = 0, modes = new Set(), bad = [];
    const t0 = Date.now();
    while (Date.now() - t0 < SOAK_S * 1000) {
      await sleep(1000);
      const s = await p.evaluate(() => { const s = BKF.debug.getState(); return { p: s.particles, fx: s.fx, mode: s.mode, score: s.score, b: s.batteries, y: s.pup.y, obs: s.obstacles.length, leaves: s.leaves.length }; });
      maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); modes.add(s.mode);
      if (!(s.y > 0 && s.y < 540) || s.obs > 40 || s.leaves > 80 || s.b < 0 || s.b > 4) bad.push(s);
    }
    const st = await p.evaluate(() => JSON.parse(JSON.stringify(BKF.debug.stats)));
    const ls = await p.evaluate(() => Object.keys(localStorage).filter(k => /^bkf:best_/.test(k)));
    console.log('   soak stats: games ' + st.games + ', scores ' + JSON.stringify(st.scores.slice(0, 12)) + ', levels ' + JSON.stringify(st.levels.slice(0, 12)) + ', max particles ' + maxP + ', max fx ' + maxFx);
    check('soak: several games completed (≥ 3)', st.games >= 3, { games: st.games, modes: [...modes] });
    check('soak: zero console errors', p.errs.length === 0 && st.errors.length === 0, { errs: p.errs.slice(0, 3), stats: st.errors.slice(0, 3) });
    check('soak: particles ≤ 260', maxP <= 260, maxP);
    check('soak: juice effects bounded (≤ 120)', maxFx <= 120, maxFx);
    check('soak: world state sane (pup on screen, batteries 0..3, entity counts bounded)', bad.length === 0, bad.slice(0, 3));
    check('soak: stats sane (scores/times/levels per game)', st.scores.length === st.games && st.scores.every(x => Number.isInteger(x) && x >= 0) && st.times.every(x => x > 0) && st.levels.every(x => Number.isInteger(x) && x >= 0) && st.flaps > 0, { scores: st.scores.slice(0, 8), times: st.times.slice(0, 8) });
    check('soak: bot runs never save a best score', ls.length === 0, ls);
    await p.context().close();
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
