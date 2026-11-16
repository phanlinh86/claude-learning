// Momo's Dino Drums — functional QA suite (Playwright, Chromium).
// Run from projects/daily-game/panda-dino-drums:   node tests/e2e/functional.js [--only=name1,name2]
// Prints PASS/FAIL per check, a summary, and exits 1 if anything failed. Screens are written to tests/out/qa_*.png.
// Uses the test hooks of DESIGN §5.4 (window.DD.debug and URL flags). Never runs `playwright install`.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const FLOORS = ['Riverbank', 'Fern Canopy', 'Nest Ledge', 'Sky Roof'];
const BG = ['bg_river', 'bg_ferns', 'bg_nests', 'bg_sky'];

let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('FAIL ' + name + (detail ? '  — ' + detail : '')); }
  return ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function newPage(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  return { ctx, page, errs };
}
async function boot(page, q, mode) {
  await page.goto(GAME + (q || '?mute=1&seed=7'));
  await page.waitForFunction(m => window.DD && DD.debug && (m ? DD.debug.mode === m : (DD.debug.mode === 'title' || DD.debug.mode === 'playing')), mode || null, { timeout: 20000 });
  await installHelpers(page);
}
async function installHelpers(page) {
  await page.evaluate(() => {
    window.__qa = {
      // advance the (frozen) world by dt seconds of game time in ≤0.4 s chunks (world.update clamps at 0.5)
      adv(dt) { const w = DD.debug.world; while (dt > 1e-12) { const h = Math.min(dt, 0.4); w.update(h); dt -= h; } },
      // advance so that songTime + _acc == t (the moment a tap is judged with speed 0)
      goto(t) { const w = DD.debug.world; this.adv(t - (w.songTime + w._acc)); },
      nextLive(after) { const w = DD.debug.world; return w.notes.find(n => n.state === 'live' && n.time > (after == null ? w.songTime + w._acc + w.cfg.goodWin : after)); },
      note(id) { return DD.debug.world.notes.find(n => n.id === id); },
      clientOfLane(l) { const R = DD.Game.renderer, r = R.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + R.layout.coinY[l] / R.VH * r.height }; },
      frames(n) { return new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
      // Pip off for good (judging tests that must not be rescued)
      noPip() { const w = DD.debug.world, h = w.helper; h.state = 'away'; h.t = 0; h.cool = 1e9; h.x01 = h._px01 = 2.3; h.y01 = h._py01 = -1.4; }
    };
  });
}
const frames = (page, n = 3) => page.evaluate(n => __qa.frames(n), n);
const st = page => page.evaluate(() => DD.debug.getState());
const mode = page => page.evaluate(() => DD.debug.mode);
const ui = page => page.evaluate(() => DD.UI.current);
// freeze the game clock (speed 0) and wait until the world is 'playing' (past the count-in)
async function freezePlaying(page) {
  await page.evaluate(() => { DD.debug.setSpeed(0); const w = DD.debug.world; if (w.state === 'ready') __qa.adv(-w.songTime + 0.01); });
  await frames(page, 2);
}
async function noErrors(errs, name) { check(name + ': zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ')); }
async function clickSel(page, sel) { await page.locator(sel).first().click(); }

// ============================================================================================
const SECTIONS = {
  // ---------------- boot, attract demo, menus ----------------
  async menus() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1&seed=7');
    await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title', null, { timeout: 20000 });
    await installHelpers(page);
    check('boot: reaches title', true);
    check('boot: title screen visible', await ui(page) === 'scrTitle');
    check('boot: document title is the game name', await page.title() === "Momo's Dino Drums");
    check('boot: all default art loaded (no missing images)', await page.evaluate(async () => { await DD.Assets.restLoaded; return Object.keys(DD.Assets.files).every(k => DD.Assets.img[k]); }),
      await page.evaluate(() => Object.keys(DD.Assets.files).filter(k => !DD.Assets.img[k]).join(',')));
    const t0 = await page.evaluate(() => ({ s: DD.debug.world.songTime, taps: DD.debug.world.stats.taps }));
    await sleep(6000);
    const t1 = await page.evaluate(() => ({ s: DD.debug.world.songTime, taps: DD.debug.world.stats.taps, bot: !!DD.Game.bot }));
    check('title: attract demo runs (song time advances)', t1.s > t0.s + 4, `songTime ${t0.s.toFixed(2)} → ${t1.s.toFixed(2)}`);
    check('title: demo bot taps', t1.bot && t1.taps > 0, 'bot taps ' + t1.taps);
    check('title: HUD hidden', await page.evaluate(() => document.getElementById('hud').classList.contains('hidden')));
    check('title: a key press on the title does not tap the demo', await page.evaluate(() => { const b = DD.debug.world.stats.taps; DD.Game.tap(0); return DD.debug.world.stats.taps === b; }));

    for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
      await clickSel(page, btn); await sleep(80);
      check(`menu ${scr}: opens from title`, await ui(page) === scr);
      await clickSel(page, `#${scr} .btn-back`); await sleep(80);
      check(`menu ${scr}: Back/Done returns to title`, await ui(page) === 'scrTitle');
      await clickSel(page, btn); await sleep(80);
      await page.keyboard.press('Escape'); await sleep(80);
      check(`menu ${scr}: Esc returns to title`, await ui(page) === 'scrTitle');
    }
    // How to Play mentions Pip and the gems (not Kit's boss)
    const how = await page.evaluate(() => document.getElementById('scrHow').textContent);
    check('How to Play text is about Pip and gems (no Kit / pillow left-overs)', /Pip/.test(how) && /gem/i.test(how) && !/pillow|Baron|Kit\b|coin/i.test(how));
    await page.keyboard.press('Escape'); await sleep(80);
    check('title: Esc on title does nothing', await ui(page) === 'scrTitle' && await mode(page) === 'title');

    // pause menu
    await clickSel(page, '#btnPlay'); await sleep(200);
    check('play: Play button starts the game', await mode(page) === 'playing' && await ui(page) === null);
    check('play: HUD visible', await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden')));
    check('play: starts on Floor 1 Riverbank, 84 BPM, 4-beat count-in', await page.evaluate(() => { const w = DD.debug.world; return w.level === 0 && w.tod === 0 && w.bpm === 84 && w.state === 'ready' && DD.Game.renderer.banner && DD.Game.renderer.banner.s === 0; }));
    await page.keyboard.press('Escape'); await sleep(80);
    check('pause: Esc pauses', await mode(page) === 'paused' && await ui(page) === 'scrPause');
    await page.keyboard.press('Escape'); await sleep(80);
    check('pause: Esc again resumes', await mode(page) === 'playing');
    await page.keyboard.press('KeyP'); await sleep(80);
    check('pause: P pauses', await mode(page) === 'paused');
    await clickSel(page, '#btnPauseSettings'); await sleep(80);
    check('pause → settings opens', await ui(page) === 'scrSettings' && await mode(page) === 'paused');
    await clickSel(page, '#scrSettings .btn-back'); await sleep(80);
    check('pause → settings → Done returns to Pause', await ui(page) === 'scrPause');
    await clickSel(page, '#btnPauseSettings'); await sleep(80);
    await page.keyboard.press('Escape'); await sleep(80);
    check('pause → settings → Esc returns to Pause (still paused)', await ui(page) === 'scrPause' && await mode(page) === 'paused');
    await clickSel(page, '#btnResume'); await sleep(80);
    check('pause: Resume button resumes', await mode(page) === 'playing' && await ui(page) === null);
    await clickSel(page, '#btnPause'); await sleep(80);
    check('pause: HUD pause button pauses', await mode(page) === 'paused');
    await clickSel(page, '#btnRestart'); await sleep(120);
    check('pause: Restart starts a fresh run', await mode(page) === 'playing' && (await st(page)).score === 0);
    await clickSel(page, '#btnPause'); await sleep(80);
    await clickSel(page, '#btnPauseMenu'); await sleep(120);
    check('pause: Main Menu returns to title', await mode(page) === 'title' && await ui(page) === 'scrTitle');
    check('title: music stopped after Main Menu', await page.evaluate(() => !DD.Audio._musicPlaying));

    // game over screen
    await clickSel(page, '#btnPlay'); await sleep(150);
    await page.evaluate(() => DD.debug.world._die());
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    check('game over: screen shown', await ui(page) === 'scrOver');
    check('game over: music stopped', await page.evaluate(() => !DD.Audio._musicPlaying));
    const ov = await page.evaluate(() => ({ st: document.getElementById('overStats').textContent, medal: document.getElementById('medalName').textContent }));
    check('game over: stats list Pip visits/saves and the floor reached', /Pip came/.test(ov.st) && /Pip saves/.test(ov.st) && /Floor 1 · Riverbank/.test(ov.st), ov.st);
    check('game over: "finish a song" hint when no floor cleared', /Finish a song/.test(ov.medal), ov.medal);
    check('game over: Score Card button added (extras.js)', await page.locator('#btnScoreCard').isVisible());
    await page.keyboard.press('Escape'); await sleep(80);
    check('game over: Esc keeps the game-over screen', await ui(page) === 'scrOver');
    await sleep(800);
    await clickSel(page, '#btnOverMenu'); await sleep(120);
    check('game over: Menu returns to title', await mode(page) === 'title' && await ui(page) === 'scrTitle');
    await page.screenshot({ path: OUT + '/qa_title.png' });
    await noErrors(errs, 'menus');
    await ctx.close();
  },

  // ---------------- keyboard / mouse / touch input ----------------
  async input() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await freezePlaying(page);
    // alternate so each key really moves Momo
    for (const [key, lane] of [['ArrowDown', 1], ['ArrowUp', 0], ['KeyS', 1], ['KeyW', 0], ['KeyJ', 1], ['KeyF', 0]]) {
      const before = await page.evaluate(() => DD.debug.world.stats.taps);
      await page.keyboard.press(key); await frames(page, 1);
      const r = await page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
      check(`key ${key} → lane ${lane}`, r.lane === lane && r.taps === before + 1, `kit.lane=${r.lane} taps ${before}→${r.taps}`);
    }
    // Space / Enter on normal: tap Momo's current lane
    await page.keyboard.press('ArrowDown');
    let b = await page.evaluate(() => DD.debug.world.stats.taps);
    await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await frames(page, 1);
    let r = await page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
    check('normal: Space/Enter tap the current lane', r.taps === b + 2 && r.lane === 1, JSON.stringify(r));
    // key repeat ignored
    b = r.taps;
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowUp');
    r = await page.evaluate(() => ({ taps: DD.debug.world.stats.taps }));
    check('held key (auto-repeat) counts as one tap', r.taps === b + 1, `taps +${r.taps - b}`);
    // M during play toggles sound, never taps
    b = r.taps;
    await page.keyboard.press('KeyM'); await page.keyboard.press('KeyM');
    check('M during play is not a tap', await page.evaluate(() => DD.debug.world.stats.taps) === b);

    // mouse: upper / lower half of the play area
    for (const lane of [1, 0, 1]) {
      const p = await page.evaluate(l => __qa.clientOfLane(l), lane);
      b = await page.evaluate(() => DD.debug.world.stats.taps);
      await page.mouse.click(p.x, p.y); await frames(page, 1);
      r = await page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
      check(`mouse click on lane ${lane} → lane ${lane}`, r.lane === lane && r.taps === b + 1, JSON.stringify(r));
    }
    // very top / very bottom of the screen still pick the right lane
    for (const [fy, lane] of [[0.3, 0], [0.97, 1]]) {
      const p = await page.evaluate(f => { const r = DD.Game.renderer.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * f }; }, fy);
      await page.mouse.click(p.x, p.y); await frames(page, 1);
      check(`mouse click at ${Math.round(fy * 100)} % height → lane ${lane}`, await page.evaluate(() => DD.debug.world.kit.lane) === lane);
    }
    // right click is ignored
    b = await page.evaluate(() => DD.debug.world.stats.taps);
    { const p = await page.evaluate(() => __qa.clientOfLane(0)); await page.mouse.click(p.x, p.y, { button: 'right' }); }
    check('right click is not a tap', await page.evaluate(() => DD.debug.world.stats.taps) === b);
    // HUD buttons are not game taps
    b = await page.evaluate(() => DD.debug.world.stats.taps);
    await clickSel(page, '#btnMuteHud'); await frames(page, 1);
    check('click on HUD sound button is not a game tap', await page.evaluate(() => DD.debug.world.stats.taps) === b && await mode(page) === 'playing');
    // the mouse click left focus on the sound button: Space must be a drum tap, not a second sound toggle
    {
      const m0 = await page.evaluate(() => ({ m: DD.Game.settings.muted || DD.Game.urlMute, f: document.activeElement && document.activeElement.id }));
      await page.keyboard.press('Space'); await frames(page, 1);
      const m1 = await page.evaluate(() => ({ m: DD.Game.settings.muted || DD.Game.urlMute, taps: DD.debug.world.stats.taps }));
      check('Space after clicking the HUD sound button taps (does not toggle sound again)', m1.m === m0.m && m1.taps === b + 1, `focus ${m0.f}, muted ${m0.m}→${m1.m}, taps +${m1.taps - b}`);
      b = m1.taps;
    }
    await clickSel(page, '#btnMuteHud');
    await clickSel(page, '#btnPause'); await frames(page, 1);
    check('click on HUD pause button pauses without tapping', await page.evaluate(() => DD.debug.world.stats.taps) === b && await mode(page) === 'paused');
    await clickSel(page, '#btnResume'); await frames(page, 2);
    check('Resume click is not a game tap', await page.evaluate(() => DD.debug.world.stats.taps) === b);
    await clickSel(page, '#btnPause');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown');
    check('lane keys ignored while paused', await page.evaluate(() => DD.debug.world.stats.taps) === b);
    await page.keyboard.press('Escape');
    // Pip present: taps still go through (Pip is not a button)
    await noErrors(errs, 'input(desktop)');
    await ctx.close();

    // ---- touch (iPhone landscape) ----
    const T = await newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await boot(T.page, '?mute=1&seed=7&autostart=1', 'playing');
    await freezePlaying(T.page);
    check('touch: game detects a touch device', await T.page.evaluate(() => DD.Game.isTouch));
    for (const lane of [1, 0, 1, 0]) {
      const p = await T.page.evaluate(l => __qa.clientOfLane(l), lane);
      b = await T.page.evaluate(() => DD.debug.world.stats.taps);
      await T.page.touchscreen.tap(p.x, p.y); await frames(T.page, 1);
      r = await T.page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
      check(`touch on lane ${lane} → lane ${lane}`, r.lane === lane && r.taps === b + 1, JSON.stringify(r));
    }
    // synthetic pointer events (pointerType touch) are handled the same way
    {
      const p = await T.page.evaluate(() => __qa.clientOfLane(1));
      b = await T.page.evaluate(() => DD.debug.world.stats.taps);
      await T.page.evaluate(p => { const c = document.getElementById('game'); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0 })); }, p);
      r = await T.page.evaluate(() => ({ lane: DD.debug.world.kit.lane, taps: DD.debug.world.stats.taps }));
      check('pointerdown (pointerType touch) on the lower lane taps lane 1', r.lane === 1 && r.taps === b + 1, JSON.stringify(r));
    }
    // multi-touch: two new pointers are two taps (CDP)
    {
      const cdp = await T.ctx.newCDPSession(T.page);
      const p0 = await T.page.evaluate(() => __qa.clientOfLane(0)), p1 = await T.page.evaluate(() => __qa.clientOfLane(1));
      b = await T.page.evaluate(() => DD.debug.world.stats.taps);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 1 }, { x: p1.x, y: p1.y, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frames(T.page, 2);
      const n = await T.page.evaluate(() => DD.debug.world.stats.taps);
      check('touch: second finger is a second tap (multi-touch)', n === b + 2, `taps +${n - b}`);
    }
    // HUD button taps on touch
    b = await T.page.evaluate(() => DD.debug.world.stats.taps);
    {
      const mb = await T.page.locator('#btnMuteHud').boundingBox();
      const m0 = await T.page.evaluate(() => DD.Game.settings.muted || DD.Game.urlMute);
      await T.page.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(700);
      const m1 = await T.page.evaluate(() => DD.Game.settings.muted || DD.Game.urlMute);
      check('touch: HUD sound tap toggles once (ghost click swallowed) and is not a game tap', m1 !== m0 && await T.page.evaluate(() => DD.debug.world.stats.taps) === b, `muted ${m0}→${m1}`);
      await T.page.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(700);
      const bb = await T.page.locator('#btnPause').boundingBox();
      await T.page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(150);
      check('touch: HUD pause tap pauses and is not a game tap', await mode(T.page) === 'paused' && await T.page.evaluate(() => DD.debug.world.stats.taps) === b);
      const rb = await T.page.locator('#btnResume').boundingBox();
      await T.page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2); await sleep(700);
      check('touch: Resume tap resumes, ghost click swallowed, no game tap', await mode(T.page) === 'playing' && await T.page.evaluate(() => DD.debug.world.stats.taps) === b);
    }
    await noErrors(T.errs, 'input(touch)');
    await T.ctx.close();

    // ---- double start / restart lock ----
    const D = await newPage();
    await boot(D.page, '?mute=1&seed=7', 'title');
    await D.page.evaluate(() => { const G = DD.Game, o = G.startGame; G._starts = 0; G.startGame = function () { this._starts++; return o.apply(this, arguments); }; });
    await sleep(150);
    check('title: Play button has focus', await D.page.evaluate(() => document.activeElement && document.activeElement.id) === 'btnPlay');
    await D.page.keyboard.press('Space'); await sleep(150);
    check('focused Play + Space starts exactly once', await D.page.evaluate(() => DD.Game._starts) === 1 && await mode(D.page) === 'playing');
    await D.page.evaluate(() => { DD.Game.toTitle(); DD.Game._starts = 0; }); await sleep(150);
    await D.page.keyboard.press('Enter'); await sleep(150);
    check('focused Play + Enter starts exactly once', await D.page.evaluate(() => DD.Game._starts) === 1 && await mode(D.page) === 'playing');
    check('Enter that started the game is not also a drum tap', await D.page.evaluate(() => DD.debug.world.stats.taps) === 0);
    // game over → restart lock
    await D.page.evaluate(() => { DD.debug.world._die(); });
    await D.page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    await D.page.evaluate(() => { DD.Game._starts = 0; });
    await D.page.keyboard.press('Enter');
    await clickSel(D.page, '#btnAgain');
    await sleep(50);
    check('game over: Enter / Play Again within 0.7 s are ignored', await mode(D.page) === 'over' && await D.page.evaluate(() => DD.Game._starts) === 0);
    await sleep(800);
    await D.page.evaluate(() => document.getElementById('btnAgain').focus());
    await D.page.keyboard.press('Enter'); await sleep(150);
    check('game over: Enter after 0.7 s restarts exactly once (focused Play Again)', await mode(D.page) === 'playing' && await D.page.evaluate(() => DD.Game._starts) === 1);
    await D.page.evaluate(() => { DD.debug.world._die(); });
    await D.page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    await D.page.evaluate(() => { DD.Game._starts = 0; });
    await sleep(800);
    await D.page.keyboard.press('Space'); await sleep(150);
    check('game over: Space after 0.7 s restarts exactly once', await mode(D.page) === 'playing' && await D.page.evaluate(() => DD.Game._starts) === 1);
    // Score Card modal on game over: Enter/Space on its buttons must not restart the game behind it
    await D.page.evaluate(() => { DD.debug.world._die(); });
    await D.page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    await sleep(800);
    await clickSel(D.page, '#btnScoreCard');
    await D.page.waitForFunction(() => { const m = document.getElementById('scScreen'); return m && !m.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => {});
    await sleep(100);
    await D.page.evaluate(() => { DD.Game._starts = 0; });
    await D.page.keyboard.press('Enter'); await sleep(200);
    const sc = await D.page.evaluate(() => ({ mode: DD.debug.mode, starts: DD.Game._starts, modal: !document.getElementById('scScreen').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id }));
    check('score card open: Enter on its focused button does not restart the game underneath', sc.starts === 0 && sc.mode === 'over', JSON.stringify(sc));
    check('score card never stays on screen over a running game', !(sc.mode === 'playing' && sc.modal), JSON.stringify(sc));
    await D.page.evaluate(() => { const m = document.getElementById('scScreen'); if (m) m.classList.add('hidden'); if (DD.debug.mode !== 'playing') DD.Game.startGame(); });
    await sleep(100);
    // pause screen: focused Resume + Space resumes once and makes no tap
    await D.page.evaluate(() => { DD.debug.setSpeed(0); });
    await D.page.keyboard.press('Escape'); await sleep(100);
    const tb = await D.page.evaluate(() => DD.debug.world.stats.taps);
    await D.page.keyboard.press('Space'); await sleep(100);
    check('pause: focused Resume + Space resumes without a game tap', await mode(D.page) === 'playing' && await D.page.evaluate(() => DD.debug.world.stats.taps) === tb);
    await noErrors(D.errs, 'input(start/restart)');
    await D.ctx.close();
  },

  // ---------------- judging end to end ----------------
  async judging() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await freezePlaying(page);
    const keyOf = l => (l === 0 ? 'ArrowUp' : 'ArrowDown');
    const cfg = await page.evaluate(() => DD.debug.world.cfg);
    // 1) exact taps: perfect / score / combo / multiplier (Pip arrives on the 5th and doubles from the 6th)
    let expected = 0, mult = 1, combo = 0, allPerfect = true, lastDetail = '', pipAt = -1;
    for (let i = 0; i < 12; i++) {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); if (!n) return null; __qa.goto(n.time); return Object.assign({ pip: ['enter', 'with'].includes(DD.debug.world.helper.state) }, n); });
      if (!n) break;
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const after = await page.evaluate(id => ({ n: __qa.note(id), s: DD.debug.getState() }), n.id);
      const pts = cfg.perfectPts * mult * (n.kind === 'gold' ? cfg.goldMul : 1) * (n.pip ? cfg.helperMult : 1);
      expected += pts; combo++; if (combo % cfg.comboStep === 0 && mult < cfg.multMax) mult++;
      if (pipAt < 0 && after.s.helper === 'enter') pipAt = combo;
      if (!(after.n.judge === 'perfect' && after.n.state === 'hit' && after.s.score === expected && after.s.combo === combo && after.s.mult === mult)) {
        allPerfect = false; lastDetail = `note ${n.id} ${n.kind}: state=${after.n.state} judge=${after.n.judge} score=${after.s.score}/${expected} combo=${after.s.combo}/${combo} mult=${after.s.mult}/${mult}`;
        break;
      }
    }
    check('tap exactly at note time → perfect, right score (incl. gold ×3, Pip ×2) and combo (12 notes)', allPerfect, lastDetail || `score ${expected}`);
    check('Pip flies in on the 5th catch in a row (REQUIREMENT twist)', pipAt === cfg.helperCombo, 'Pip came at combo ' + pipAt);
    check('10 catches in a row → ×2 multiplier', (await st(page)).mult === 2, 'mult ' + (await st(page)).mult);
    // the rest of the rules without Pip
    await page.evaluate(() => __qa.noPip());
    // 2) good: tap 0.1 s late (normal perfect 0.075, good 0.17)
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + 0.1); return n; });
      const s0 = await st(page);
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => ({ n: __qa.note(id), s: DD.debug.getState() }), n.id);
      check('tap 100 ms late → good, 50 × mult points', a.n.judge === 'good' && a.s.score - s0.score === cfg.goodPts * s0.mult * (n.kind === 'gold' ? cfg.goldMul : 1), `judge=${a.n.judge} +${a.s.score - s0.score}`);
      check('good adds goodGain to the groove', Math.abs(a.s.groove - Math.min(1, s0.groove + cfg.goodGain)) < 1e-6, `${s0.groove.toFixed(3)} → ${a.s.groove.toFixed(3)}`);
    }
    // 2b) just outside the good window → not a hit
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + DD.debug.world.cfg.goodWin + 0.02); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => __qa.note(id), n.id);
      check('tap 20 ms after the good window → no catch', a.state !== 'hit', 'state ' + a.state);
    }
    // 3) wrong lane at the right time → wrongLaneMiss: miss now; groove drops, combo resets
    {
      const g0 = (await st(page)).groove;
      await page.evaluate(() => { DD.debug.world.combo = 7; DD.debug.world.mult = 1; });
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      await page.keyboard.press(keyOf(1 - n.lane)); await frames(page, 1);
      const a1 = await page.evaluate(id => ({ n: __qa.note(id), s: DD.debug.getState() }), n.id);
      check('wrong-lane tap does not catch the gem (wrongLaneMiss → miss now)', a1.n.state === (cfg.wrongLaneMiss ? 'miss' : 'live'), 'state ' + a1.n.state);
      const cost = cfg.missCost * cfg.firstLevelCostMul;
      check('miss reduces groove by missCost × first-floor factor', Math.abs((g0 - a1.s.groove) - cost) < 1e-6, `groove ${g0.toFixed(3)} → ${a1.s.groove.toFixed(3)}`);
      check('miss resets combo and multiplier', a1.s.combo === 0 && a1.s.mult === 1);
    }
    // 3b) untapped note → miss
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + DD.debug.world.cfg.goodWin + 0.05); return n; });
      const a = await page.evaluate(id => __qa.note(id), n.id);
      check('untapped gem → miss after the good window', a.state === 'miss', 'state ' + a.state);
    }
    // 4) early tap (anti-spam): 0.25 s before → early miss
    {
      const e0 = await page.evaluate(() => DD.debug.world.stats.early);
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time - 0.25); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => ({ n: __qa.note(id), early: DD.debug.world.stats.early }), n.id);
      check('tap 250 ms early → missed early (anti-spam)', a.n.state === 'miss' && a.early === e0 + 1, `state=${a.n.state} early=${a.early}`);
    }
    // 4b) a tap with nothing near → empty, no groove change
    {
      const s0 = await st(page);
      const n = await page.evaluate(() => __qa.nextLive());
      const gap = await page.evaluate(id => { const w = DD.debug.world, n = __qa.note(id); return n.time - (w.songTime + w._acc); }, n.id);
      if (gap > 0.6) {
        await page.keyboard.press('ArrowUp'); await frames(page, 1);
        const s1 = await st(page);
        // Normal floor 1 charges a tiny empty-tap cost (playtest §7 anti-metronome); never a miss
        const cfg = await page.evaluate(() => { const w = DD.debug.world; return { ec: w.level === 0 ? (w.cfg.emptyCost || 0) * w.cfg.firstLevelCostMul : 0 }; });
        check('tap with no gem nearby → no miss, groove − emptyCost on floor 1 only', Math.abs((s0.groove - s1.groove) - cfg.ec) < 1e-3 && s1.stats.miss === s0.stats.miss, `groove ${s0.groove} → ${s1.groove}, expected cost ${cfg.ec}`);
      } else check('tap with no gem nearby → nothing lost', true, 'skipped: next gem too close');
    }
    // 5) timing offset shifts judging: +100 ms offset, tap 100 ms late → perfect
    {
      await page.evaluate(() => DD.Game.setSetting('offset', 100));
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + 0.1); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => __qa.note(id), n.id);
      check('timing offset +100 ms: tap 100 ms late → perfect', a.judge === 'perfect', `judge=${a.judge} err=${a.err && a.err.toFixed(3)}`);
      await page.evaluate(() => DD.Game.setSetting('offset', -100));
      const m = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time - 0.1); return n; });
      await page.keyboard.press(keyOf(m.lane)); await frames(page, 1);
      const a2 = await page.evaluate(id => __qa.note(id), m.id);
      check('timing offset −100 ms: tap 100 ms early → perfect', a2.judge === 'perfect', `judge=${a2.judge}`);
      await page.evaluate(() => DD.Game.setSetting('offset', 0));
    }
    // 6) gold gem ×3
    {
      const g = await page.evaluate(() => { const w = DD.debug.world, t = w.songTime + w._acc + w.cfg.goodWin; return w.notes.find(n => n.state === 'live' && n.kind === 'gold' && n.time > t); });
      if (g) {
        const s0 = await page.evaluate(id => { __qa.noPip(); __qa.goto(__qa.note(id).time); return DD.debug.getState(); }, g.id);
        await page.keyboard.press(keyOf(g.lane)); await frames(page, 1);
        const s1 = await st(page);
        check('rainbow gem caught perfect = 100 × mult × 3', s1.score - s0.score === cfg.perfectPts * s0.mult * cfg.goldMul, `+${s1.score - s0.score} (mult ${s0.mult})`);
      } else check('rainbow gem caught perfect = 100 × mult × 3', false, 'no gold gem left on floor 1 for seed 7');
    }
    await noErrors(errs, 'judging');
    await ctx.close();

    // ---- easy: one-button ----
    const E = await newPage();
    await boot(E.page, '?mute=1&seed=7&autostart=1&diff=easy', 'playing');
    await freezePlaying(E.page);
    check('easy (?diff=easy): oneButton config, Pip at combo 4', await E.page.evaluate(() => DD.debug.world.cfg.oneButton === true && DD.debug.world.cfg.helperCombo === 4));
    let ok = true, det = '';
    for (const key of ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyJ']) {
      const n = await E.page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      await E.page.keyboard.press(key); await frames(E.page, 1);
      const a = await E.page.evaluate(id => __qa.note(id), n.id);
      if (a.state !== 'hit') { ok = false; det += `${key} on lane ${n.lane}: ${a.state}; `; }
    }
    check('easy: Space/Enter/any lane key catches the next gem in either lane', ok, det);
    // REQUIREMENT: "Easy: any key or tap catches whichever gem is next"
    {
      await E.page.evaluate(() => __qa.noPip());
      const res = [];
      for (const key of ['KeyA', 'KeyL', 'KeyQ', 'Digit1']) {
        const n = await E.page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
        await E.page.keyboard.press(key); await frames(E.page, 1);
        res.push(key + ':' + (await E.page.evaluate(id => __qa.note(id).state, n.id)));
      }
      check('easy: ANY letter/digit key catches too (REQUIREMENT "any key")', res.every(s => /:hit$/.test(s)), res.join(' '));
    }
    // mouse anywhere on Easy: catches the next gem even when the click is on the "wrong" half
    {
      const n = await E.page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      const p = await E.page.evaluate(l => __qa.clientOfLane(l), 1 - n.lane);
      await E.page.mouse.click(p.x, p.y); await frames(E.page, 1);
      check('easy: a click on the other half still catches the next gem', await E.page.evaluate(id => __qa.note(id).state, n.id) === 'hit');
    }
    // easy level 1 cannot be lost
    await E.page.evaluate(() => { DD.debug.setSpeed(16); });
    await E.page.waitForFunction(() => DD.debug.world.level >= 1 || DD.debug.mode !== 'playing', null, { timeout: 60000 });
    check('easy: floor 1 with no taps cannot be lost (clears)', await E.page.evaluate(() => DD.debug.world.level >= 1 && DD.debug.mode === 'playing'), JSON.stringify(await st(E.page)).slice(0, 120));
    await noErrors(E.errs, 'judging(easy)');
    await E.ctx.close();
  },

  // ---------------- Pip the helper (the twist) ----------------
  async helper() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await page.evaluate(() => { window.__hev = []; const H = DD.Game.handleEvents; DD.Game.handleEvents = function (ev) { ev.forEach(e => /^helper/.test(e.type) && __hev.push(e.type)); return H.call(this, ev); }; });
    check('helperNow() refused during the count-in', await page.evaluate(() => DD.debug.world.state === 'ready' && DD.debug.helperNow() === false && DD.debug.world.helper.state === 'away'));
    await freezePlaying(page);
    const cfg = await page.evaluate(() => DD.debug.world.cfg);
    const keyOf = l => (l === 0 ? 'ArrowUp' : 'ArrowDown');
    // catch one gem first, so no gem is inside its window when Pip comes (it would be saved while we advance)
    await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); DD.debug.tap(n.lane); });
    const ok = await page.evaluate(() => DD.debug.helperNow());
    const h0 = await page.evaluate(() => ({ st: DD.debug.world.helper.state, n: DD.debug.world.stats.helpers, ev: __hev.slice() }));
    check('helperNow() calls Pip (state enter, stats.helpers 1)', ok === true && h0.st === 'enter' && h0.n === 1, JSON.stringify(h0));
    check('helperNow() twice does nothing the second time', await page.evaluate(() => DD.debug.helperNow()) === false);
    await frames(page, 2);
    check('helperin event reaches the game (sound + "Pip is here!" text)', await page.evaluate(() => __hev.includes('helperin') && DD.Game.renderer.texts.some(t => /Pip is here/.test(t.text))));
    // ×2 while entering / perched
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      const s0 = await st(page);
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const s1 = await st(page);
      const exp = cfg.perfectPts * s0.mult * (n.kind === 'gold' ? cfg.goldMul : 1) * cfg.helperMult;
      check('catch with Pip there scores ×2', s1.score - s0.score === exp, `+${s1.score - s0.score}, expected ${exp} (helper ${s0.helper})`);
      check('"+points ×2" text shown', await page.evaluate(() => DD.Game.renderer.texts.some(t => /×2/.test(t.text))));
    }
    // perched after helperEnter
    await page.evaluate(s => __qa.adv(s), cfg.helperEnter + 0.05).catch(() => {});
    // (advancing may pass gems untapped → the first one is saved; use that as the save test)
    let h1 = await page.evaluate(() => ({ st: DD.debug.world.helper.state, saved: DD.debug.world.stats.saved }));
    if (h1.saved === 0) {
      check('Pip perches after the fly-in (state with, frame cheer)', await page.evaluate(() => DD.debug.world.helper.state === 'with' && DD.debug.world.helper.frame === 'cheer'), h1.st);
    } else check('Pip perches after the fly-in (state with, frame cheer)', true, 'a gem passed during the fly-in and was saved');
    // the save: let a gem pass untapped
    {
      const s0 = await page.evaluate(() => { DD.debug.world.combo = Math.max(DD.debug.world.combo, 3); return DD.debug.getState(); });
      const alreadySaved = s0.stats.saved;
      if (alreadySaved === 0) {
        const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + DD.debug.world.cfg.goodWin + 0.02); return n; });
        const a = await page.evaluate(id => ({ n: __qa.note(id), s: DD.debug.getState(), h: DD.debug.world.helper }), n.id);
        check('Pip saves the first missed gem (state saved, no miss counted)', a.n.state === 'saved' && a.s.stats.saved === 1 && a.s.stats.miss === s0.stats.miss, `note ${a.n.state}, saved ${a.s.stats.saved}`);
        check('save: no groove loss, combo kept (not increased)', a.s.groove === s0.groove && a.s.combo === s0.combo, `groove ${s0.groove}→${a.s.groove} combo ${s0.combo}→${a.s.combo}`);
        check('save: Pip swoops to that lane (state save, saveLane)', a.h.state === 'save' && a.h.saveLane === n.lane, JSON.stringify({ st: a.h.state, lane: a.h.saveLane }));
      } else {
        check('Pip saves the first missed gem (state saved, no miss counted)', alreadySaved === 1);
        check('save: no groove loss, combo kept (not increased)', true, 'covered by the fly-in pass');
        check('save: Pip swoops to that lane (state save, saveLane)', ['save', 'leave', 'away'].includes(h1.st));
      }
    }
    await frames(page, 2);
    check('helpersave event + "Pip caught it!" text', await page.evaluate(() => __hev.includes('helpersave') && DD.Game.renderer.texts.some(t => /Pip caught it/.test(t.text))));
    // only ONE save per visit: next missed gem is a normal miss
    {
      await page.evaluate(() => __qa.adv(0.1));
      const s0 = await st(page);
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + DD.debug.world.cfg.goodWin + 0.02); return n; });
      const a = await page.evaluate(id => ({ n: __qa.note(id), s: DD.debug.getState() }), n.id);
      check('second missed gem in the same visit is a normal miss', a.n.state === 'miss' && a.s.stats.saved === s0.stats.saved && a.s.groove < s0.groove, `state ${a.n.state}`);
    }
    // Pip leaves → away with cooldown
    await page.evaluate(s => __qa.adv(s), cfg.helperSaveTime + cfg.helperLeave + 0.1);
    await frames(page, 2);   // let the game drain the world's events
    {
      const h = await page.evaluate(() => ({ st: DD.debug.world.helper.state, cool: DD.debug.world.helper.cool, ev: __hev.slice() }));
      check('Pip flies home after the save (away, cooldown set, helperout)', h.st === 'away' && h.cool > 0 && h.ev.includes('helperout'), JSON.stringify(h));
      const s0 = await st(page);
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const s1 = await st(page);
      check('after Pip left, catches score normally (no ×2)', s1.score - s0.score === cfg.perfectPts * s0.mult * (n.kind === 'gold' ? cfg.goldMul : 1));
    }
    // natural visit length: helperStay
    {
      await page.evaluate(() => { DD.debug.world.helper.cool = 0; DD.debug.helperNow(); });
      // step in 20 ms slices, catching every gem exactly on time, until Pip takes off
      const r = await page.evaluate(() => {
        const w = DD.debug.world, t0 = w.songTime + w._acc; let guard = 0;
        while (w.helper.state !== 'leave' && w.helper.state !== 'away' && guard++ < 5000) {
          const now = w.songTime + w._acc, n = w.notes.find(n => n.state === 'live' && n.time >= now - 1e-6);
          if (n && n.time - now <= 0.02) { __qa.goto(n.time); DD.debug.tap(n.lane); } else __qa.adv(0.02);
        }
        return { t0, left: w.songTime + w._acc, saved: w.stats.saved };
      });
      const t0 = r.t0, left = r.left;
      const stay = left - t0;
      check(`Pip stays about helperStay (${cfg.helperStay} s) when nothing is missed`, left != null && Math.abs(stay - (cfg.helperEnter + cfg.helperStay)) < 1.0, 'stayed ' + (left != null ? stay.toFixed(2) : '?') + ' s');
    }
    // renderer draws Pip (default sprites) while present
    await page.evaluate(() => { const A = DD.Assets, o = A.sprite; window.__spr = {}; A.sprite = function (k) { __spr[k] = 1; return o.apply(this, arguments); }; });
    await page.evaluate(() => { const w = DD.debug.world; w.helper.cool = 0; DD.debug.helperNow(); });
    await page.evaluate(() => __qa.adv(1.2)); await frames(page, 3);
    check('renderer draws a Pip sprite while Pip is there', await page.evaluate(() => Object.keys(__spr).some(k => /^pip_/.test(k))), await page.evaluate(() => Object.keys(__spr).filter(k => /pip/.test(k)).join(',')));
    // death while Pip is there → Pip leaves, no crash
    await page.evaluate(() => DD.debug.world._die());
    check('death sends Pip away (leave)', await page.evaluate(() => ['leave', 'away'].includes(DD.debug.world.helper.state)));
    await page.evaluate(() => DD.debug.setSpeed(1));
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    check('game over shows Pip came / saves counts', await page.evaluate(() => /Pip came: \d+× · Pip saves: 1/.test(document.getElementById('overStats').textContent)), await page.evaluate(() => document.getElementById('overStats').textContent));
    // natural arrival with the bot at speed (no helperNow)
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=8', 'playing');
    await page.waitForFunction(() => DD.debug.world.stats.helpers >= 1, null, { timeout: 30000 }).catch(() => {});
    check('perfect bot calls Pip on its own during floor 1', await page.evaluate(() => DD.debug.world.stats.helpers >= 1));
    await noErrors(errs, 'helper');
    await ctx.close();
  },

  // ---------------- floors, game over, best score ----------------
  async progression() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1');
    await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=16', 'playing');
    await page.evaluate(() => { const R = DD.Game.renderer, o = R.showBanner; window.__banners = []; R.showBanner = function (t) { __banners.push(t); return o.apply(this, arguments); }; window.__ev = []; const H = DD.Game.handleEvents; DD.Game.handleEvents = function (ev) { ev.forEach(e => (e.type === 'cleared' || e.type === 'level' || e.type === 'songdone') && __ev.push(e)); return H.call(this, ev); }; });
    await page.waitForFunction(() => DD.debug.world.level >= 1, null, { timeout: 60000 });
    await frames(page, 3);
    const s = await page.evaluate(() => ({ st: DD.debug.getState(), ban: __banners, ev: __ev, vis: DD.Game.renderer.vis.cur, atod: DD.Audio.tod }));
    check('floor clear: songdone + cleared events', s.ev.some(e => e.type === 'songdone') && s.ev.some(e => e.type === 'cleared'), JSON.stringify(s.ev));
    check('floor clear: rides up to Fern Canopy (level 1, tod 1)', s.st.level === 1 && s.st.tod === 1 && s.st.levelsCleared === 1);
    check('floor clear: banner shown for Fern Canopy', s.ban.includes(1), 'banners ' + JSON.stringify(s.ban));
    check('floor clear: renderer + music switch to Fern Canopy', s.vis === 1 && s.atod === 1, `vis ${s.vis} audio ${s.atod}`);
    const cleared = s.ev.find(e => e.type === 'cleared');
    check('floor clear: bonus = round(groove×1000)', cleared && cleared.bonus > 0 && cleared.bonus <= 1000, cleared && 'bonus ' + cleared.bonus);
    // let it die on purpose → game over, best saved
    const score = await page.evaluate(() => { DD.debug.setBot(false); return DD.debug.world.score; });
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 60000 });
    const o = await page.evaluate(() => ({ score: DD.debug.world.score, groove: DD.debug.world.groove, best: localStorage.getItem('pdd:best_normal'), shown: document.getElementById('overBest').textContent, sc: document.getElementById('overScore').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stats: document.getElementById('overStats').textContent, medal: document.getElementById('medal').className }));
    check('game over when groove empties (no taps)', o.groove === 0, 'groove ' + o.groove);
    check('game over: score shown', +o.sc === o.score && o.score >= score);
    check('best saved per difficulty (pdd:best_normal)', +o.best === o.score, `stored ${o.best} score ${o.score}`);
    check('game over: NEW! best shown', o.nb && +o.shown === o.score);
    // medals (playtest §5): bronze = finish floor 1, silver / gold / platinum by score per difficulty
    const want = await page.evaluate(sc => DD.UI.medalFor('normal', sc, 1), o.score);
    check('game over: medal after clearing one floor follows the Normal score thresholds', o.medal.includes(want) && want !== 'none', o.medal + ' want ' + want + ' score ' + o.score);
    check('medal thresholds per difficulty (bronze = floor 1, then score)', await page.evaluate(() => {
      const f = DD.UI.medalFor;
      return f('normal', 99999, 0) === 'none' && f('normal', 19999, 1) === 'bronze' && f('normal', 20000, 1) === 'silver' && f('normal', 75000, 2) === 'gold' && f('normal', 250000, 4) === 'platinum' &&
        f('easy', 4999, 1) === 'bronze' && f('easy', 5000, 1) === 'silver' && f('easy', 50000, 1) === 'gold' && f('easy', 100000, 1) === 'platinum' &&
        f('hard', 49999, 3) === 'bronze' && f('hard', 50000, 1) === 'silver' && f('hard', 150000, 1) === 'gold' && f('hard', 450000, 1) === 'platinum';
    }));
    check('game over: "Reached: Floor 2 · Fern Canopy"', /Floor 2 · Fern Canopy/.test(o.stats), o.stats);
    await page.screenshot({ path: OUT + '/qa_over.png' });
    // second, worse run → no NEW, best kept
    await sleep(800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => DD.debug.mode === 'playing');
    await page.evaluate(() => { DD.debug.setSpeed(1); DD.debug.world._die(); });
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    const o2 = await page.evaluate(() => ({ shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), best: localStorage.getItem('pdd:best_normal') }));
    check('worse run: best kept, no NEW!', !o2.nb && +o2.shown === o.score && +o2.best === o.score, JSON.stringify(o2));
    await sleep(800);
    await clickSel(page, '#btnOverMenu'); await sleep(100);
    check('title shows best for current difficulty', +(await page.evaluate(() => document.getElementById('bestTitle').textContent)) === o.score);
    await clickSel(page, '#btnSettings');
    await clickSel(page, '#setDifficulty [data-v=easy]');
    await clickSel(page, '#scrSettings .btn-back'); await sleep(100);
    check('title best follows difficulty (easy → 0)', +(await page.evaluate(() => document.getElementById('bestTitle').textContent)) === 0);
    // changing difficulty mid-run: best goes to the difficulty the run STARTED on
    await clickSel(page, '#btnPlay'); await sleep(100);
    await page.evaluate(() => { DD.Game.setSetting('difficulty', 'hard'); DD.debug.world.score = 4321; DD.debug.world._die(); });
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    check('difficulty changed mid-run: best saved under the starting difficulty (easy)', await page.evaluate(() => localStorage.getItem('pdd:best_easy') === '4321' && !localStorage.getItem('pdd:best_hard')));
    await page.evaluate(() => DD.Game.setSetting('difficulty', 'normal'));
    await sleep(800); await clickSel(page, '#btnOverMenu');
    // ?diff=hard run saves to best_hard and the title shows the hard best while that flag is on
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=8&diff=hard', 'playing');
    await page.waitForFunction(() => DD.debug.world.score > 0, null, { timeout: 30000 });
    await page.evaluate(() => { DD.debug.setBot(false); DD.debug.world._die(); });
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    const h = await page.evaluate(() => ({ hard: localStorage.getItem('pdd:best_hard'), score: DD.debug.world.score, normal: localStorage.getItem('pdd:best_normal') }));
    check('?diff=hard run saves best_hard (not best_normal)', +h.hard === h.score && +h.normal === o.score, JSON.stringify(h));
    await sleep(800); await clickSel(page, '#btnOverMenu'); await sleep(100);
    const bt = +(await page.evaluate(() => document.getElementById('bestTitle').textContent));
    check('title best line matches the difficulty being played (?diff=hard)', bt === h.score, `title shows ${bt}, hard best ${h.score}, normal best ${o.score}`);
    // reset best
    await clickSel(page, '#btnSettings'); await clickSel(page, '#btnResetBest');
    check('Reset best asks first (no reset on the first tap)', await page.evaluate(() => !!localStorage.getItem('pdd:best_normal')));
    await clickSel(page, '#btnResetBest');
    check('Settings → Reset best clears all bests', await page.evaluate(() => !localStorage.getItem('pdd:best_normal') && !localStorage.getItem('pdd:best_hard') && !localStorage.getItem('pdd:best_easy')));
    await noErrors(errs, 'progression');
    await ctx.close();

    // ---- all four floors + the lap (gotoLevel) ----
    const F = await newPage();
    await boot(F.page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=2', 'playing');
    const lv = [];
    for (const i of [0, 1, 2, 3, 4, 7]) {
      await F.page.evaluate(i => DD.debug.gotoLevel(i), i);
      await F.page.waitForFunction(() => DD.debug.world.songTime > 2, null, { timeout: 20000 });
      const r = await F.page.evaluate(() => ({ level: DD.debug.world.level, tod: DD.debug.world.tod, lap: DD.debug.world.lap, bpm: DD.debug.world.bpm, vis: DD.Game.renderer.vis.cur, audio: DD.Audio.tod, banner: DD.Game.renderer.banner && DD.Game.renderer.banner.s, notes: DD.debug.world.notes.length, part: DD.debug.weather.particles.length }));
      lv.push(r);
      await F.page.screenshot({ path: OUT + `/qa_floor_${i}.png` });
    }
    const BPM = [84, 96, 104, 112];
    lv.forEach((r, k) => {
      const i = [0, 1, 2, 3, 4, 7][k], tod = i % 4, lap = Math.floor(i / 4);
      check(`level ${i}: ${FLOORS[tod]} (tod ${tod}, lap ${lap}, ${BPM[tod] + 8 * lap} BPM), visuals + music follow, gems + weather present`,
        r.level === i && r.tod === tod && r.lap === lap && r.bpm === BPM[tod] + 8 * lap && r.vis === tod && r.audio === tod && r.notes > 10 && r.part > 0, JSON.stringify(r));
    });
    // natural Sky Roof → lap: clear floor 4 with the bot, land on Riverbank lap 2
    await F.page.evaluate(() => { DD.debug.gotoLevel(3); DD.debug.setSpeed(16); });
    await F.page.waitForFunction(() => DD.debug.world.level >= 4, null, { timeout: 60000 }).catch(() => {});
    const lap = await F.page.evaluate(() => ({ level: DD.debug.world.level, tod: DD.debug.world.tod, lap: DD.debug.world.lap, bpm: DD.debug.world.bpm, mode: DD.debug.mode }));
    check('clearing the Sky Roof starts lap 2 on the Riverbank, 8 BPM faster', lap.level === 4 && lap.tod === 0 && lap.lap === 1 && lap.bpm === 92 && lap.mode === 'playing', JSON.stringify(lap));
    await noErrors(F.errs, 'progression(floors)');
    await F.ctx.close();
  },

  // ---------------- settings persistence + URL flags ----------------
  async settings() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1'); await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7', 'title');
    await clickSel(page, '#btnSettings'); await sleep(60);
    const s0 = await page.evaluate(() => Object.assign({}, DD.Game.settings));
    check('settings defaults: sfx on, music on, normal, 0 ms', s0.sfx && s0.music && s0.difficulty === 'normal' && !s0.offset);
    await page.locator('label:has(#setSfx)').click();
    await page.locator('label:has(#setMusic)').click();
    await clickSel(page, '#setDifficulty [data-v=hard]');
    await page.evaluate(() => { const o = document.getElementById('setOffset'); o.value = 40; o.dispatchEvent(new Event('input')); o.dispatchEvent(new Event('change')); });
    check('offset label updates', await page.evaluate(() => document.getElementById('offsetVal').textContent) === '+40 ms');
    check('difficulty segment highlights Hard', await page.evaluate(() => document.querySelector('#setDifficulty .on').dataset.v) === 'hard');
    // volume row (extras.js)
    await page.locator('#scrSettings .vol-step[data-d="-1"]').click(); await sleep(50);
    check('Volume − step saves pdd:volume 0.90', await page.evaluate(() => localStorage.getItem('pdd:volume')) === '0.90');
    // fullscreen toggle: no crash
    const fullVisible = await page.locator('#rowFull').isVisible();
    if (fullVisible) { await page.locator('label:has(#setFull)').click(); await sleep(300); await page.locator('label:has(#setFull)').click(); await sleep(300); }
    await page.keyboard.press('F11'); await sleep(250); await page.keyboard.press('F11'); await sleep(250);
    check('fullscreen toggle (checkbox + F11) does not crash', errs.length === 0, fullVisible ? 'checkbox visible' : 'row hidden');
    await clickSel(page, '#scrSettings .btn-back');
    check('all settings saved under the pdd: prefix only', await page.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('pdd:'))), await page.evaluate(() => Object.keys(localStorage).join(',')));
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    const s1 = await page.evaluate(() => DD.Game.settings);
    check('settings persist across reload (sfx off, music off, hard, +40 ms)', s1.sfx === false && s1.music === false && s1.difficulty === 'hard' && s1.offset === 40, JSON.stringify(s1));
    check('?mute=1 is not saved into settings', s1.muted === false && !/"muted":true/.test(await page.evaluate(() => localStorage.getItem('pdd:settings'))));
    check('settings UI reflects saved values (incl. volume 90 %)', await page.evaluate(() => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.getElementById('setOffset').value === '40' && document.getElementById('setVolumeVal').textContent === '90%'));
    check('saved offset applies to judging config of the next run', await page.evaluate(() => { DD.Game.startGame(); const ok = DD.Game.settings.offset === 40 && DD.debug.world.cfg.perfectWin === DD.DIFFICULTY.hard.perfectWin; DD.Game.toTitle(); return ok; }));
    // other games' keys on the shared GitHub Pages origin are not read or wiped
    await page.evaluate(() => { localStorage.setItem('ktb:best_normal', '999'); localStorage.setItem('ktb:settings', '{"difficulty":"easy"}'); });
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    check('another game\'s keys (ktb:) are ignored', await page.evaluate(() => DD.Game.settings.difficulty === 'hard' && DD.Game.best() === 0));
    await clickSel(page, '#btnSettings'); await clickSel(page, '#btnResetBest'); await clickSel(page, '#btnResetBest'); await clickSel(page, '#scrSettings .btn-back');
    check('Reset best leaves the other game\'s best alone', await page.evaluate(() => localStorage.getItem('ktb:best_normal') === '999'));
    await page.evaluate(() => { localStorage.removeItem('ktb:best_normal'); localStorage.removeItem('ktb:settings'); });
    // ?diff=easy flag is used for play but never saved
    await boot(page, '?mute=1&seed=7&diff=easy&autostart=1', 'playing');
    check('?diff=easy plays Easy', await page.evaluate(() => DD.debug.world.cfg.oneButton === true));
    await page.evaluate(() => DD.Game.setSetting('sfx', true));
    check('?diff=easy is not saved into settings', JSON.parse(await page.evaluate(() => localStorage.getItem('pdd:settings'))).difficulty === 'hard');
    // ?mute=1 then press M → the test flag must not end up saved as muted:true
    await boot(page, '?mute=1&seed=7', 'title');
    check('?mute=1 mutes the audio', await page.evaluate(() => DD.Audio.muted === true));
    await page.keyboard.press('KeyM'); await sleep(50);
    const m = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('pdd:settings')).muted, audio: DD.Audio.muted, toast: document.getElementById('toast').textContent }));
    check('?mute=1 + M: un-mutes and saves nothing muted', m.saved === false && m.audio === false, JSON.stringify(m));
    await boot(page, '?mute=1&seed=7', 'title');
    await page.evaluate(() => DD.Game.setSetting('sfx', false));   // any other save during a ?mute=1 session
    check('?mute=1 + saving another setting still never stores muted:true', JSON.parse(await page.evaluate(() => localStorage.getItem('pdd:settings'))).muted === false);
    // M toggles mute and persists
    await boot(page, '?seed=7', 'title');
    await page.evaluate(() => DD.Game.setSetting('muted', false));
    await page.keyboard.press('KeyM'); await sleep(50);
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    check('M mute persists across reload', await page.evaluate(() => DD.Game.settings.muted === true && DD.Audio.muted === true));
    await page.keyboard.press('KeyM');
    // corrupted settings JSON → defaults, no crash
    await page.evaluate(() => localStorage.setItem('pdd:settings', '{not json'));
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    check('corrupted settings JSON falls back to defaults', await page.evaluate(() => DD.Game.settings.difficulty === 'normal'));
    await page.evaluate(() => localStorage.setItem('pdd:settings', '{"difficulty":"impossible","offset":"abc"}'));
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    const bad = await page.evaluate(() => { DD.Game.startGame(); const w = DD.debug.world; return { d: DD.Game.settings.difficulty, off: DD.Game.settings.offset, ok: isFinite(w.cfg.goodWin) }; });
    check('invalid saved difficulty falls back to normal', bad.d === 'normal', JSON.stringify(bad));
    await noErrors(errs, 'settings');
    await ctx.close();
  },

  // ---------------- pause / blur / visibility / clock ----------------
  async pause() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await page.waitForFunction(() => DD.debug.world.songTime > 1.5, null, { timeout: 15000 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('window blur auto-pauses', await mode(page) === 'paused');
    const t0 = await page.evaluate(() => DD.debug.world.songTime);
    await sleep(1500);
    const t1 = await page.evaluate(() => DD.debug.world.songTime);
    check('song time frozen while paused', t1 === t0, `${t0} → ${t1}`);
    await clickSel(page, '#btnResume');
    const t2 = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(DD.debug.world.songTime)))));
    check('resume continues where it was (no jump)', t2 >= t0 && t2 - t0 < 0.25, `${t0.toFixed(3)} → ${t2.toFixed(3)}`);
    // Pip timers frozen while paused too
    await page.evaluate(() => { DD.debug.helperNow(); });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const hp0 = await page.evaluate(() => ({ t: DD.debug.world.helper.t, st: DD.debug.world.helper.state }));
    await sleep(600);
    const hp1 = await page.evaluate(() => ({ t: DD.debug.world.helper.t, st: DD.debug.world.helper.state }));
    check('Pip frozen while paused', hp0.t === hp1.t && hp0.st === hp1.st, JSON.stringify([hp0, hp1]));
    await page.keyboard.press('Escape');
    // visibilitychange
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check('visibilitychange (hidden) auto-pauses', await mode(page) === 'paused');
    const t3 = await page.evaluate(() => DD.debug.world.songTime);
    await sleep(800);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    check('coming back stays paused (child resumes)', await mode(page) === 'paused' && await page.evaluate(() => DD.debug.world.songTime) === t3);
    await page.keyboard.press('Escape');
    const t4 = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(DD.debug.world.songTime)))));
    check('resume after hide continues (no jump)', t4 - t3 < 0.25 && t4 >= t3, `${t3.toFixed(3)} → ${t4.toFixed(3)}`);
    // blur during the count-in / cleared moment also pauses
    await page.evaluate(() => DD.debug.gotoLevel(1));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('blur during the count-in pauses', await mode(page) === 'paused' && await page.evaluate(() => DD.debug.world.state === 'ready'));
    await page.keyboard.press('Escape');
    // death frame: no pausing
    await page.evaluate(() => DD.debug.world._die());
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); DD.Game.pause(); });
    check('no pausing on the death frame (blur / P after dying)', await mode(page) === 'playing');
    await page.keyboard.press('Escape');
    check('Esc after dying does not pause', await mode(page) === 'playing');
    await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 });
    check('…and game over follows', await mode(page) === 'over');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('blur on game over keeps game over', await mode(page) === 'over');
    // music stops on return to title from pause
    await sleep(800); await page.keyboard.press('Enter');
    await page.waitForFunction(() => DD.debug.mode === 'playing');
    await page.evaluate(() => DD.Game.setSetting('music', true));
    const mp = await page.evaluate(() => DD.Audio._musicPlaying);
    await page.keyboard.press('Escape'); await clickSel(page, '#btnPauseMenu'); await sleep(100);
    check('music playing in game, stopped on return to title', mp === true && await page.evaluate(() => DD.Audio._musicPlaying) === false, 'in game ' + mp);
    await noErrors(errs, 'pause');
    await ctx.close();
  },

  // ---------------- customisation ----------------
  async custom() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1'); await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7', 'title');
    const slotIds = await page.evaluate(() => DD.Assets.SLOTS.map(s => s.id));
    check('slots are hero, coin (gem), helper (Pip) and the 4 floors', slotIds.join(',') === 'hero,coin,helper,bg_river,bg_ferns,bg_nests,bg_sky', slotIds.join(','));
    // generate test pictures in the browser
    const imgs = await page.evaluate(() => {
      function mk(w, h, opaque, kind) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        if (opaque) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#c84'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
        g.fillStyle = kind === 'b' ? '#24f' : '#f42'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.35, 0, 7); g.fill();
        for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37},70%,60%)`; g.fillRect((i * 97) % w, (i * 53) % h, w / 20, h / 20); }
        return c.toDataURL('image/png').split(',')[1];
      }
      return { photo: mk(800, 600, true), cut: mk(300, 300, false, 'b'), huge: mk(4000, 3000, true), wide: mk(1600, 900, true), cutBg: mk(640, 360, false) };
    });
    const buf = b => Buffer.from(b, 'base64');
    const FILES = {
      hero: { name: 'photo.png', mimeType: 'image/png', buffer: buf(imgs.photo) },
      coin: { name: 'cutout.png', mimeType: 'image/png', buffer: buf(imgs.cut) },
      helper: { name: 'huge.png', mimeType: 'image/png', buffer: buf(imgs.huge) },
      bg_river: { name: 'wide.png', mimeType: 'image/png', buffer: buf(imgs.wide) },
      bg_ferns: { name: 'huge.png', mimeType: 'image/png', buffer: buf(imgs.huge) },
      bg_nests: { name: 'transparent.png', mimeType: 'image/png', buffer: buf(imgs.cutBg) }
    };
    await clickSel(page, '#btnCustomize'); await sleep(100);
    const names = await page.evaluate(() => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent).join(','));
    check('Change Pictures cards: Momo, Gem, Pip, Riverbank, Fern Canopy, Nest Ledge, Sky Roof', names === 'Momo,Gem,Pip,Riverbank,Fern Canopy,Nest Ledge,Sky Roof', names);
    const pick = async (slot, file) => {
      const i = slotIds.indexOf(slot);
      const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
    };
    for (const [slot, f] of Object.entries(FILES)) {
      await pick(slot, f);
      await page.waitForFunction(s => DD.Assets.hasCustom(s) && /saved/.test(document.getElementById('toast').textContent), slot, { timeout: 15000 }).catch(() => {});
      const r = await page.evaluate(s => ({ has: DD.Assets.hasCustom(s), len: (localStorage.getItem('pdd:img_' + s) || '').length, w: DD.Assets.custom[s] && DD.Assets.custom[s].width, h: DD.Assets.custom[s] && DD.Assets.custom[s].height, tag: document.querySelectorAll('#slotGrid .slot')[DD.Assets.SLOTS.findIndex(x => x.id === s)].querySelector('.tag').textContent }), slot);
      check(`custom ${slot} ← ${f.name}: stored and shown`, r.has && r.len > 100 && /Your picture/.test(r.tag), `${(r.len / 1024).toFixed(0)} KB, ${r.w}×${r.h}`);
    }
    // setInputFiles directly on the hidden input (drag-free path)
    {
      await page.evaluate(() => { DD.UI._pickSlot = 'bg_sky'; });
      await page.setInputFiles('#filePick', { name: 'sky.png', mimeType: 'image/png', buffer: buf(imgs.wide) });
      await page.waitForFunction(() => DD.Assets.hasCustom('bg_sky'), null, { timeout: 15000 }).catch(() => {});
      check('setInputFiles on #filePick stores bg_sky', await page.evaluate(() => DD.Assets.hasCustom('bg_sky') && !!localStorage.getItem('pdd:img_bg_sky')));
      await page.locator('#slotGrid .slot').nth(6).locator('[data-act=reset]').click(); await sleep(100);
    }
    const shapes = await page.evaluate(() => ({ hero: localStorage.getItem('pdd:shape_hero'), coin: localStorage.getItem('pdd:shape_coin') }));
    check('opaque photo → round sticker; transparent cut-out → whole picture', shapes.hero === 'circle' && shapes.coin === 'fit', JSON.stringify(shapes));
    const big = await page.evaluate(() => ({ p: DD.Assets.customSrc.helper.naturalWidth, n: DD.Assets.customSrc.bg_ferns.naturalWidth, nh: DD.Assets.customSrc.bg_ferns.naturalHeight }));
    check('4000×3000 picture is downscaled (char ≤512, bg long edge ≤1600)', big.p <= 512 && Math.max(big.n, big.nh) <= 1600, JSON.stringify(big));
    // corrupted and non-image files
    await pick('bg_sky', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png at all') });
    await page.waitForFunction(() => /could not be opened|picture/i.test(document.getElementById('toast').textContent) && !/Saving/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    let t = await page.evaluate(() => document.getElementById('toast').textContent);
    check('corrupted PNG → friendly message, slot unchanged', /could not be opened/i.test(t) && !(await page.evaluate(() => DD.Assets.hasCustom('bg_sky'))), t);
    await pick('bg_sky', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await sleep(300);
    t = await page.evaluate(() => document.getElementById('toast').textContent);
    check('non-image file → "choose a picture" message', /choose a picture/i.test(t), t);
    // shape toggle
    await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=fit]').click(); await sleep(100);
    check('shape buttons switch Momo to whole picture', await page.evaluate(() => localStorage.getItem('pdd:shape_hero')) === 'fit');
    await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click(); await sleep(100);
    await clickSel(page, '#scrCustom .btn-back');
    // reload → persists
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    const after = await page.evaluate(() => DD.Assets.SLOTS.map(s => s.id + ':' + DD.Assets.hasCustom(s.id)).join(' '));
    check('custom pictures persist after reload', after === 'hero:true coin:true helper:true bg_river:true bg_ferns:true bg_nests:true bg_sky:false', after);
    // gameplay with the custom pictures: all 4 floors + a Pip visit
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=2', 'playing');
    await page.evaluate(() => { const A = DD.Assets, o = A.sprite; window.__spr = {}; A.sprite = function (k, w, h) { if (k.startsWith('custom:')) __spr[k] = 1; return o.apply(this, arguments); }; });
    await page.evaluate(() => { const R = DD.Game.renderer, o = R._bgKey; window.__bgk = new Set(); R._bgKey = function (b) { const k = o.apply(this, arguments); __bgk.add(k); return k; }; });
    for (const lv of [0, 1, 2, 3]) {
      await page.evaluate(l => DD.debug.gotoLevel(l), lv);
      await page.waitForFunction(() => DD.debug.world.songTime > 3, null, { timeout: 20000 });
      if (lv === 1) { await page.evaluate(() => DD.debug.helperNow()); await sleep(1200); }
      await page.screenshot({ path: OUT + `/qa_custom_floor${lv}.png` });
    }
    const spr = await page.evaluate(() => Object.keys(__spr).sort().join(','));
    check('gameplay draws the custom Momo / gem / Pip', /custom:coin/.test(spr) && /custom:hero/.test(spr) && /custom:helper/.test(spr), spr);
    const bgk = await page.evaluate(() => [...__bgk].map(k => k.split('|')[0] + ':' + k.split('|')[4]).filter((v, i, a) => a.indexOf(v) === i).sort().join(' '));
    check('floor backgrounds use the custom wall for river/ferns/nests, default for sky', /0:1/.test(bgk) && /1:1/.test(bgk) && /2:1/.test(bgk) && /3:0/.test(bgk), bgk);
    check('gameplay with custom pictures: no frame errors', (await page.evaluate(() => DD.debug.stats.errors.length)) === 0);
    // reset one / reset all
    await boot(page, '?mute=1&seed=7', 'title');
    await clickSel(page, '#btnCustomize'); await sleep(100);
    await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await sleep(100);
    check('Reset one: Momo back to original (memory + storage)', await page.evaluate(() => !DD.Assets.hasCustom('hero') && !localStorage.getItem('pdd:img_hero') && !localStorage.getItem('pdd:shape_hero') && DD.Assets.hasCustom('coin')));
    await clickSel(page, '#btnResetAll'); await sleep(100);
    check('Reset all: every slot original', await page.evaluate(() => DD.Assets.SLOTS.every(s => !DD.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => k.startsWith('pdd:img_'))));
    await page.reload(); await page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title');
    check('Reset all persists after reload', await page.evaluate(() => DD.Assets.SLOTS.every(s => !DD.Assets.hasCustom(s.id))));
    // capacity: photo-like pictures (smooth gradients + grain, like a phone photo) in all 7 slots.
    const photo = await page.evaluate(() => {
      const w = 3024, h = 4032, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      for (let i = 0; i < 60; i++) { const gr = g.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 400 + Math.random() * 1600); gr.addColorStop(0, `hsla(${Math.random() * 360},60%,${30 + Math.random() * 50}%,.8)`); gr.addColorStop(1, 'hsla(0,0%,50%,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      const id = g.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] = 255; } g.putImageData(id, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    await clickSel(page, '#btnCustomize'); await sleep(100);
    const results = [];
    for (const slot of slotIds) {
      await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await pick(slot, { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: buf(photo) });
      await page.waitForFunction(() => /saved|room|could not/i.test(document.getElementById('toast').textContent), null, { timeout: 20000 }).catch(() => {});
      results.push(await page.evaluate(s => ({ s, toast: document.getElementById('toast').textContent, has: DD.Assets.hasCustom(s), stored: !!localStorage.getItem('pdd:img_' + s), kb: ((localStorage.getItem('pdd:img_' + s) || '').length / 1024) | 0 }), slot));
    }
    const total = await page.evaluate(() => Object.keys(localStorage).reduce((a, k) => a + localStorage.getItem(k).length, 0));
    console.log('  photo capacity: ' + results.map(r => `${r.s}:${r.has ? r.kb + 'KB' : 'refused'}`).join(' ') + ` total ${(total / 1048576).toFixed(2)} MB`);
    check('7 phone photos: each saved or refused with a friendly message', results.every(r => (r.has && /saved/.test(r.toast)) || (!r.has && /room/i.test(r.toast))), results.filter(r => !r.has).map(r => r.s + ': ' + r.toast).join('; '));
    check('7 phone photos: memory always matches storage (rollback)', results.every(r => r.has === r.stored));
    check('7 phone photos: all 7 fit in browser storage', results.every(r => r.has), `${results.filter(r => r.has).length}/7 saved, ${(total / 1048576).toFixed(2)} MB`);
    await clickSel(page, '#btnResetAll'); await clickSel(page, '#scrCustom .btn-back');
    await noErrors(errs, 'custom');
    await ctx.close();
  },

  // ---------------- storage.js contract ----------------
  async storage() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7', 'title');
    const r = await page.evaluate(async () => {
      const S = DD.Storage, out = {};
      const p = S.set('qa_a', 'x'); out.isPromise = p instanceof Promise; out.ok = await p;
      out.prefixed = localStorage.getItem('pdd:qa_a') === 'x';
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
      out.failRet = await S.set('qa_a', 'y'); out.afterFail = S.get('qa_a');
      out.failNew = await S.set('qa_new', 'z'); out.newGone = S.get('qa_new') === undefined;
      Storage.prototype.setItem = orig;
      S.native = true;
      window.ffStoreSet = () => Promise.resolve(false); out.nFalse = await S.set('qa_a', 'n1'); out.nFalseVal = S.get('qa_a');
      window.ffStoreSet = () => Promise.reject(new Error('io')); out.nRej = await S.set('qa_a', 'n2'); out.nRejVal = S.get('qa_a');
      window.ffStoreSet = () => Promise.resolve(true); out.nOk = await S.set('qa_a', 'n3'); out.nOkVal = S.get('qa_a');
      let k = 0; window.ffStoreSet = () => (++k === 1 ? new Promise(res => setTimeout(() => res(false), 80)) : Promise.resolve(true));
      const a = S.set('qa_race', 'first'), b = S.set('qa_race', 'second'); await Promise.all([a, b]); out.race = S.get('qa_race');
      window.ffStoreDel = () => Promise.resolve(true);
      out.setJSONret = S.setJSON('qa_j', { a: 1 }); out.setJSONisPromise = out.setJSONret instanceof Promise;
      // Go wrapper key rule ^[a-zA-Z0-9_\-]{1,64}$: every key the game writes must pass it
      const re = /^[a-zA-Z0-9_\-]{1,64}$/;
      out.keysOk = ['settings', 'volume', 'best_easy', 'best_normal', 'best_hard'].concat(DD.Assets.SLOTS.flatMap(s => ['img_' + s.id, 'shape_' + s.id])).every(k => re.test(k));
      delete window.ffStoreSet; delete window.ffStoreDel; S.native = false; S.del('qa_a'); S.del('qa_race'); S.del('qa_j');
      return out;
    });
    check('storage.set returns Promise<true> on success, key stored as pdd:<key>', r.isPromise && r.ok === true && r.prefixed);
    check('storage.set: localStorage quota error → false and value rolled back', r.failRet === false && r.afterFail === 'x' && r.failNew === false && r.newGone, JSON.stringify({ failRet: r.failRet, afterFail: r.afterFail }));
    check('storage.set (native): ffStoreSet false → false + rollback', r.nFalse === false && r.nFalseVal === 'x');
    check('storage.set (native): ffStoreSet rejects → false + rollback', r.nRej === false && r.nRejVal === 'x');
    check('storage.set (native): ok → true', r.nOk === true && r.nOkVal === 'n3');
    check('storage.set: a late failure does not roll back a newer successful write', r.race === 'second', 'value after race: ' + r.race);
    check('storage.setJSON returns the Promise<boolean>', r.setJSONisPromise);
    check('every storage key passes the Windows wrapper key rule', r.keysOk);
    await noErrors(errs, 'storage');
    await ctx.close();
  },

  // ---------------- layout on many viewports ----------------
  async layout() {
    const VPS = [
      { n: 'desktop 1280x720', o: { viewport: { width: 1280, height: 720 } } },
      { n: 'desktop 1920x1080 DPR2', o: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 } },
      { n: 'desktop 800x600', o: { viewport: { width: 800, height: 600 } } },
      { n: 'desktop 1024x600 DPR1.5', o: { viewport: { width: 1024, height: 600 }, deviceScaleFactor: 1.5 } },
      { n: 'iPhone SE 667x375 DPR2', o: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
      { n: 'iPhone portrait 390x844 DPR3', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
      { n: 'iPhone landscape 844x390 DPR3', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
      { n: 'iPad portrait 1024x1366 DPR2', o: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
      { n: 'iPad landscape 1366x1024 DPR2', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } }
    ];
    for (const vp of VPS) {
      const { ctx, page, errs } = await newPage(vp.o);
      await boot(page, '?mute=1&seed=7', 'title');
      const measure = () => page.evaluate(() => {
        const iw = innerWidth, ih = innerHeight, bad = [];
        const de = document.documentElement;
        if (de.scrollWidth > iw + 1 || de.scrollHeight > ih + 1) bad.push(`page scroll ${de.scrollWidth}×${de.scrollHeight}`);
        const scr = DD.UI.current ? document.getElementById(DD.UI.current) : null;
        const root = scr || document.getElementById('hud');
        const panel = scr && scr.querySelector('.panel');
        let scrolls = false;
        if (panel) {
          if (panel.scrollWidth > panel.clientWidth + 1) bad.push(`panel horizontal overflow ${panel.scrollWidth}>${panel.clientWidth}`);
          scrolls = panel.scrollHeight > panel.clientHeight + 1;
          const pr = panel.getBoundingClientRect();
          if (pr.left < -0.5 || pr.top < -0.5 || pr.right > iw + 0.5 || pr.bottom > ih + 0.5) bad.push('panel outside viewport');
        }
        root.querySelectorAll('button, .slot, .set, h1, h2, p').forEach(el => {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
          if (r.left < -0.5 || r.right > iw + 0.5) bad.push(`${el.id || el.className || el.tagName} x out [${r.left | 0},${r.right | 0}]`);
          if (!scrolls && (r.top < -0.5 || r.bottom > ih + 0.5)) bad.push(`${el.id || el.className || el.tagName} y out [${r.top | 0},${r.bottom | 0}]`);
          if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 2) bad.push(`${el.id || el.textContent.trim().slice(0, 12)} text overflows button`);
          if (el.tagName === 'BUTTON' && r.height < 28 && document.body.classList.contains('touch')) bad.push(`${el.id || el.textContent.trim().slice(0, 12)} small touch target ${r.height | 0}px`);
        });
        if (panel && scrolls) {
          panel.querySelectorAll('.slot, .menu, .scores').forEach(el => { const r = el.getBoundingClientRect(), pr = panel.getBoundingClientRect(); if (r.right > pr.right + 1 || r.left < pr.left - 1) bad.push(el.className + ' wider than panel'); });
        }
        const c = document.getElementById('game').getBoundingClientRect(), R = DD.Game.renderer;
        const fills = Math.abs(c.width - iw) < 2 || Math.abs(c.height - ih) < 2;
        const canvasOk = fills && c.left >= -1 && c.top >= -1 && c.right <= iw + 1 && c.bottom <= ih + 1 && R.canvas.width === Math.round(R.VW * R.px);
        if (!canvasOk) bad.push(`canvas ${c.width | 0}×${c.height | 0} at ${c.left | 0},${c.top | 0}`);
        return { bad, scrolls, cover: (c.width * c.height) / (iw * ih) };
      });
      const screens = [
        ['title', async () => {}],
        ['how', async () => page.evaluate(() => DD.UI.open('scrHow', 'scrTitle'))],
        ['settings', async () => page.evaluate(() => DD.UI.open('scrSettings', 'scrTitle'))],
        ['custom', async () => page.evaluate(() => DD.UI.open('scrCustom', 'scrTitle'))],
        ['play', async () => { await page.evaluate(() => DD.Game.startGame()); }],
        ['pause', async () => page.evaluate(() => DD.Game.pause())],
        ['over', async () => { await page.evaluate(() => { DD.Game.resume(); DD.debug.world._die(); }); await page.waitForFunction(() => DD.debug.mode === 'over', null, { timeout: 10000 }); }]
      ];
      const summary = [];
      for (const [name, go] of screens) {
        await go(); await sleep(1000);
        const m = await measure();
        if (m.scrolls) summary.push(name + ' panel scrolls');
        check(`layout ${vp.n} / ${name}: nothing overflows`, m.bad.length === 0, m.bad.slice(0, 4).join('; '));
        if (name !== 'play') await page.screenshot({ path: OUT + `/qa_layout_${vp.n.replace(/\W+/g, '_')}_${name}.png` });
      }
      if (summary.length) console.log('  info ' + vp.n + ': ' + summary.join(', '));
      // gameplay geometry: lanes ordered, drums and Momo on screen, Pip's perch + away point
      await page.evaluate(() => { DD.Game.toTitle(); DD.Game.startGame(); DD.debug.setBot(true, 1); });
      await sleep(600);
      const geo = await page.evaluate(() => {
        const R = DD.Game.renderer, L = R.layout, H = DD.World.HELPER, VW = R.VW, VH = R.VH;
        const px = x01 => L.ringX + x01 * 0.5 * (VW - L.ringX), py = y01 => L.coinY[0] + (y01 - 0.5) * 2 * (L.coinY[1] - L.coinY[0]);
        const hud = document.getElementById('hud').getBoundingClientRect(), c = R.canvas.getBoundingClientRect();
        return { VW, VH, ringX: L.ringX, kitX: L.kitX, c0: L.coinY[0], c1: L.coinY[1], split: L.split, perch: [px(H.perch[0]), py(H.perch[1])], away: [px(H.away[0]), py(H.away[1])],
          hudBottom: (hud.bottom - c.top) / c.height * VH, hudLeft: (hud.left - c.left) / c.width * VW };
      });
      check(`layout ${vp.n}: lanes ordered, drums + Momo on screen`, geo.c0 < geo.split && geo.split < geo.c1 && geo.c1 < geo.VH - 20 && geo.kitX > 20 && geo.ringX < geo.VW * 0.45, JSON.stringify(geo));
      check(`layout ${vp.n}: Pip's perch on screen, below the HUD; away point off screen`, geo.perch[0] > 0 && geo.perch[0] < geo.VW && geo.perch[1] > 0 && geo.perch[1] > geo.hudBottom - 10 && (geo.away[0] > geo.VW + 30 || geo.away[1] < -30), JSON.stringify({ perch: geo.perch, away: geo.away, hudBottom: geo.hudBottom }));
      // rotation / resize during play
      const v0 = vp.o.viewport;
      await page.setViewportSize({ width: v0.height, height: v0.width }); await sleep(450);
      const rot = await page.evaluate(() => { const R = DD.Game.renderer, c = R.canvas.getBoundingClientRect(), L = R.layout; return { mode: DD.debug.mode, VW: R.VW, VH: R.VH, cw: c.width, ch: c.height, iw: innerWidth, ih: innerHeight, split: L.split, c0: L.coinY[0], c1: L.coinY[1], bw: R.canvas.width, px: R.px, hud: document.getElementById('hud').getBoundingClientRect() }; });
      const portrait = !(v0.height > v0.width);
      check(`rotate ${vp.n} during play: relayout`, (rot.VW < rot.VH) === portrait && (Math.abs(rot.cw - rot.iw) < 2 || Math.abs(rot.ch - rot.ih) < 2) && rot.bw === Math.round(rot.VW * rot.px), JSON.stringify({ VW: rot.VW, VH: rot.VH, cw: rot.cw | 0, ch: rot.ch | 0, iw: rot.iw, ih: rot.ih }));
      check(`rotate ${vp.n}: still playing, lanes ordered, HUD in view`, rot.mode === 'playing' && rot.c0 < rot.split && rot.split < rot.c1 && rot.c1 < rot.VH && rot.hud.right <= rot.iw + 1 && rot.hud.top >= 0);
      await sleep(400);
      await page.setViewportSize(v0); await sleep(450);
      check(`rotate ${vp.n} back: no errors`, (await page.evaluate(() => DD.debug.stats.errors.length)) === 0 && errs.length === 0, errs.slice(0, 2).join(' | '));
      await noErrors(errs, 'layout ' + vp.n);
      await ctx.close();
    }
  },

  // ---------------- long high-speed bot run (?speed=16) ----------------
  async soak() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=5&autostart=1&bot=1&skill=0.8&speed=16', 'playing');
    await page.evaluate(() => {
      const G = DD.Game, f = G.frame; window.__ft = [];
      G.frame = function (ts) { const a = performance.now(); f.call(this, ts); __ft.push(performance.now() - a); };
      window.__lv = []; const H = G.handleEvents; G.handleEvents = function (ev) { ev.forEach(e => e.type === 'level' && __lv.push({ level: e.level, name: e.name, bpm: e.bpm, lap: e.lap })); return H.call(this, ev); };
    });
    const tods = new Set(); let maxP = 0, maxFx = 0, maxTexts = 0, heap0 = null, heapMax = 0, last = null, pipSeen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 180000) {
      const s = await page.evaluate(() => ({ st: DD.debug.getState(), heap: performance.memory ? performance.memory.usedJSHeapSize : 0, texts: DD.Game.renderer.texts.length, fly: DD.Game.renderer.fly.length }));
      last = s.st; tods.add(s.st.tod); pipSeen.add(s.st.helper);
      maxP = Math.max(maxP, s.st.particles); maxFx = Math.max(maxFx, s.st.fx); maxTexts = Math.max(maxTexts, s.texts + s.fly);
      if (s.st.level >= 1 && heap0 == null && s.heap) heap0 = s.heap;
      heapMax = Math.max(heapMax, s.heap);
      if (s.st.mode !== 'playing' || s.st.level >= 6) break;
      await sleep(300);
    }
    const ft = await page.evaluate(() => { const a = __ft.slice(30).sort((x, y) => x - y); return { n: a.length, p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; });
    const bot = await page.evaluate(() => DD.Game.bot && DD.Game.bot.stats);
    const lvs = await page.evaluate(() => __lv);
    console.log('  soak: ' + JSON.stringify({ level: last.level, lap: last.lap, score: last.score, groove: last.groove && +last.groove.toFixed(2), tods: [...tods], pip: [...pipSeen], maxP, maxFx, maxTexts, heap0MB: heap0 && +(heap0 / 1e6).toFixed(1), heapMaxMB: +(heapMax / 1e6).toFixed(1), ft, bot, secs: (Date.now() - t0) / 1000 }));
    check('soak: bot (skill 0.8) still playing after 6 floors', last.mode === 'playing' && last.level >= 6, `mode ${last.mode} level ${last.level}`);
    check('soak: visited all 4 floors and a second lap', tods.size === 4 && last.lap >= 1, [...tods].join(','));
    check('soak: level events name the floors in order with rising BPM', lvs.slice(0, 5).map(l => l.name).join(',') === 'Fern Canopy,Nest Ledge,Sky Roof,Riverbank,Fern Canopy' && lvs[3] && lvs[3].bpm === 92 && lvs[3].lap === 1 && lvs[4].bpm === 104, JSON.stringify(lvs.slice(0, 7)));
    check('soak: Pip visited and saved gems for the bot', last.stats.helpers >= 3 && last.stats.saved >= 1, `helpers ${last.stats.helpers} saved ${last.stats.saved}`);
    check('soak: weather particles bounded (< 140)', maxP < 140, 'max ' + maxP);
    check('soak: renderer fx bounded (≤ 400) and texts bounded', maxFx <= 400 && maxTexts < 200, `fx ${maxFx} texts ${maxTexts}`);
    check('soak: frame time p95 < 25 ms at 16× (headless, software GL)', ft.p95 < 25, `p50 ${ft.p50 && ft.p50.toFixed(1)} p95 ${ft.p95 && ft.p95.toFixed(1)} max ${ft.max && ft.max.toFixed(1)} ms`);
    check('soak: JS heap does not grow wildly', !heap0 || heapMax < heap0 * 2 + 30e6, `${(heap0 / 1e6).toFixed(1)} → max ${(heapMax / 1e6).toFixed(1)} MB`);
    check('soak: no frame errors', (await page.evaluate(() => DD.debug.stats.errors.length)) === 0);
    // autorestart loop keeps going after a game over
    await page.evaluate(() => { DD.debug.setAutoRestart(true); DD.debug.setBot(false); DD.debug.world._die(); });
    await page.waitForFunction(() => DD.debug.stats.games >= 1 && DD.debug.mode === 'playing', null, { timeout: 15000 }).catch(() => {});
    check('soak: ?autorestart restarts after a game over', await page.evaluate(() => DD.debug.stats.games >= 1 && DD.debug.mode === 'playing' && DD.debug.world.score === 0));
    await noErrors(errs, 'soak');
    await ctx.close();
  }
};

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, fn] of Object.entries(SECTIONS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log('\n=== ' + name + ' ===');
    const t = Date.now();
    try { await fn(); }
    catch (e) { check(`${name}: section ran to the end`, false, String(e && e.message || e).split('\n')[0]); }
    console.log(`  (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})();
