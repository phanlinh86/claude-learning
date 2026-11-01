// Kit's Toybox Beat — functional QA suite (Playwright, Chromium).
// Run from projects/daily-game/kit-toybox-beat:   node tests/e2e/functional.js [--only=name1,name2]
// Prints PASS/FAIL per check, a summary, and exits 1 if anything failed. Screens are written to tests/out/qa_*.png.
// Uses the test hooks of DESIGN §5.4 (window.KB.debug and URL flags). Never runs `playwright install`.
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

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
  await page.waitForFunction(m => window.KB && KB.debug && (m ? KB.debug.mode === m : (KB.debug.mode === 'title' || KB.debug.mode === 'playing')), mode || null, { timeout: 20000 });
  await installHelpers(page);
}
async function installHelpers(page) {
  await page.evaluate(() => {
    window.__qa = {
      // advance the (frozen) world by dt seconds of game time in ≤0.4 s chunks (world.update clamps at 0.5)
      adv(dt) { const w = KB.debug.world; while (dt > 1e-12) { const h = Math.min(dt, 0.4); w.update(h); dt -= h; } },
      // advance so that songTime + _acc == t (the moment a tap is judged with speed 0)
      goto(t) { const w = KB.debug.world; this.adv(t - (w.songTime + w._acc)); },
      nextLive(after) { const w = KB.debug.world; return w.notes.find(n => n.state === 'live' && n.time > (after == null ? w.songTime + w._acc + w.cfg.goodWin : after)); },
      note(id) { return KB.debug.world.notes.find(n => n.id === id); },
      clientOfLane(l) { const R = KB.Game.renderer, r = R.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + R.layout.coinY[l] / R.VH * r.height }; },
      frames(n) { return new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }); }
    };
  });
}
const frames = (page, n = 3) => page.evaluate(n => __qa.frames(n), n);
const st = page => page.evaluate(() => KB.debug.getState());
const mode = page => page.evaluate(() => KB.debug.mode);
const ui = page => page.evaluate(() => KB.UI.current);
// freeze the game clock (speed 0) and wait until the world is 'playing' (past the count-in)
async function freezePlaying(page) {
  await page.evaluate(() => { KB.debug.setSpeed(0); const w = KB.debug.world; if (w.state === 'ready') __qa.adv(-w.songTime + 0.01); });
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
    await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title', null, { timeout: 20000 });
    await installHelpers(page);
    check('boot: reaches title', true);
    check('boot: title screen visible', await ui(page) === 'scrTitle');
    const t0 = await page.evaluate(() => ({ s: KB.debug.world.songTime, taps: KB.debug.world.stats.taps }));
    await sleep(6000);
    const t1 = await page.evaluate(() => ({ s: KB.debug.world.songTime, taps: KB.debug.world.stats.taps, bot: !!KB.Game.bot }));
    check('title: attract demo runs (song time advances)', t1.s > t0.s + 4, `songTime ${t0.s.toFixed(2)} → ${t1.s.toFixed(2)}`);
    check('title: demo bot taps', t1.bot && t1.taps > 0, 'bot taps ' + t1.taps);
    check('title: HUD hidden', await page.evaluate(() => document.getElementById('hud').classList.contains('hidden')));

    for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
      await clickSel(page, btn); await sleep(80);
      check(`menu ${scr}: opens from title`, await ui(page) === scr);
      await clickSel(page, `#${scr} .btn-back`); await sleep(80);
      check(`menu ${scr}: Back/Done returns to title`, await ui(page) === 'scrTitle');
      await clickSel(page, btn); await sleep(80);
      await page.keyboard.press('Escape'); await sleep(80);
      check(`menu ${scr}: Esc returns to title`, await ui(page) === 'scrTitle');
    }
    await page.keyboard.press('Escape'); await sleep(80);
    check('title: Esc on title does nothing', await ui(page) === 'scrTitle' && await mode(page) === 'title');

    // pause menu
    await clickSel(page, '#btnPlay'); await sleep(200);
    check('play: Play button starts the game', await mode(page) === 'playing' && await ui(page) === null);
    check('play: HUD visible', await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden')));
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
    check('title: music stopped after Main Menu', await page.evaluate(() => !KB.Audio._musicPlaying));

    // game over screen
    await clickSel(page, '#btnPlay'); await sleep(150);
    await page.evaluate(() => KB.debug.world._die());
    await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    check('game over: screen shown', await ui(page) === 'scrOver');
    check('game over: music stopped', await page.evaluate(() => !KB.Audio._musicPlaying));
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
    const lanes = [['ArrowUp', 0], ['KeyW', 0], ['KeyF', 0], ['ArrowDown', 1], ['KeyS', 1], ['KeyJ', 1]];
    // alternate so each key really moves Kit
    for (const [key, lane] of [['ArrowDown', 1], ['ArrowUp', 0], ['KeyS', 1], ['KeyW', 0], ['KeyJ', 1], ['KeyF', 0]]) {
      const before = await page.evaluate(() => KB.debug.world.stats.taps);
      await page.keyboard.press(key); await frames(page, 1);
      const r = await page.evaluate(() => ({ lane: KB.debug.world.kit.lane, taps: KB.debug.world.stats.taps }));
      check(`key ${key} → lane ${lane}`, r.lane === lane && r.taps === before + 1, `kit.lane=${r.lane} taps ${before}→${r.taps}`);
    }
    void lanes;
    // Space / Enter on normal: tap Kit's current lane
    await page.keyboard.press('ArrowDown');
    let b = await page.evaluate(() => KB.debug.world.stats.taps);
    await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await frames(page, 1);
    let r = await page.evaluate(() => ({ lane: KB.debug.world.kit.lane, taps: KB.debug.world.stats.taps }));
    check('normal: Space/Enter tap the current lane', r.taps === b + 2 && r.lane === 1, JSON.stringify(r));
    // key repeat ignored
    b = r.taps;
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowUp');
    r = await page.evaluate(() => ({ taps: KB.debug.world.stats.taps }));
    check('held key (auto-repeat) counts as one tap', r.taps === b + 1, `taps +${r.taps - b}`);

    // mouse: upper / lower half of the play area
    for (const lane of [1, 0, 1]) {
      const p = await page.evaluate(l => __qa.clientOfLane(l), lane);
      b = await page.evaluate(() => KB.debug.world.stats.taps);
      await page.mouse.click(p.x, p.y); await frames(page, 1);
      r = await page.evaluate(() => ({ lane: KB.debug.world.kit.lane, taps: KB.debug.world.stats.taps }));
      check(`mouse click on lane ${lane} → lane ${lane}`, r.lane === lane && r.taps === b + 1, JSON.stringify(r));
    }
    // right click is ignored
    b = await page.evaluate(() => KB.debug.world.stats.taps);
    { const p = await page.evaluate(() => __qa.clientOfLane(0)); await page.mouse.click(p.x, p.y, { button: 'right' }); }
    check('right click is not a tap', await page.evaluate(() => KB.debug.world.stats.taps) === b);
    // HUD buttons are not game taps
    b = await page.evaluate(() => KB.debug.world.stats.taps);
    await clickSel(page, '#btnMuteHud'); await frames(page, 1);
    check('click on HUD sound button is not a game tap', await page.evaluate(() => KB.debug.world.stats.taps) === b && await mode(page) === 'playing');
    await clickSel(page, '#btnMuteHud');
    await clickSel(page, '#btnPause'); await frames(page, 1);
    check('click on HUD pause button pauses without tapping', await page.evaluate(() => KB.debug.world.stats.taps) === b && await mode(page) === 'paused');
    // clicks on the pause panel are not taps after resume
    await clickSel(page, '#btnResume'); await frames(page, 2);
    check('Resume click is not a game tap', await page.evaluate(() => KB.debug.world.stats.taps) === b);
    // keys while paused do nothing
    await clickSel(page, '#btnPause');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown');
    check('lane keys ignored while paused', await page.evaluate(() => KB.debug.world.stats.taps) === b);
    await page.keyboard.press('Escape');
    await noErrors(errs, 'input(desktop)');
    await ctx.close();

    // ---- touch (iPhone landscape) ----
    const T = await newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await boot(T.page, '?mute=1&seed=7&autostart=1', 'playing');
    await freezePlaying(T.page);
    check('touch: game detects a touch device', await T.page.evaluate(() => KB.Game.isTouch));
    for (const lane of [1, 0, 1, 0]) {
      const p = await T.page.evaluate(l => __qa.clientOfLane(l), lane);
      b = await T.page.evaluate(() => KB.debug.world.stats.taps);
      await T.page.touchscreen.tap(p.x, p.y); await frames(T.page, 1);
      r = await T.page.evaluate(() => ({ lane: KB.debug.world.kit.lane, taps: KB.debug.world.stats.taps }));
      check(`touch on lane ${lane} → lane ${lane}`, r.lane === lane && r.taps === b + 1, JSON.stringify(r));
    }
    // multi-touch: two new pointers are two taps (CDP)
    {
      const cdp = await T.ctx.newCDPSession(T.page);
      const p0 = await T.page.evaluate(() => __qa.clientOfLane(0)), p1 = await T.page.evaluate(() => __qa.clientOfLane(1));
      b = await T.page.evaluate(() => KB.debug.world.stats.taps);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 1 }, { x: p1.x, y: p1.y, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frames(T.page, 2);
      const n = await T.page.evaluate(() => KB.debug.world.stats.taps);
      check('touch: second finger is a second tap (multi-touch)', n === b + 2, `taps +${n - b}`);
    }
    // HUD button taps on touch
    b = await T.page.evaluate(() => KB.debug.world.stats.taps);
    {
      const bb = await T.page.locator('#btnPause').boundingBox();
      await T.page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(150);
      check('touch: HUD pause tap pauses and is not a game tap', await mode(T.page) === 'paused' && await T.page.evaluate(() => KB.debug.world.stats.taps) === b);
      const rb = await T.page.locator('#btnResume').boundingBox();
      await T.page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2); await sleep(700);
      check('touch: Resume tap resumes, ghost click swallowed, no game tap', await mode(T.page) === 'playing' && await T.page.evaluate(() => KB.debug.world.stats.taps) === b);
    }
    await noErrors(T.errs, 'input(touch)');
    await T.ctx.close();

    // ---- double start / restart lock ----
    const D = await newPage();
    await boot(D.page, '?mute=1&seed=7', 'title');
    await D.page.evaluate(() => { const G = KB.Game, o = G.startGame; G._starts = 0; G.startGame = function () { this._starts++; return o.apply(this, arguments); }; });
    await sleep(150);
    check('title: Play button has focus', await D.page.evaluate(() => document.activeElement && document.activeElement.id) === 'btnPlay');
    await D.page.keyboard.press('Space'); await sleep(150);
    check('focused Play + Space starts exactly once', await D.page.evaluate(() => KB.Game._starts) === 1 && await mode(D.page) === 'playing');
    await D.page.evaluate(() => { KB.Game.toTitle(); KB.Game._starts = 0; }); await sleep(150);
    await D.page.keyboard.press('Enter'); await sleep(150);
    check('focused Play + Enter starts exactly once', await D.page.evaluate(() => KB.Game._starts) === 1 && await mode(D.page) === 'playing');
    // game over → restart lock
    await D.page.evaluate(() => { KB.debug.world._die(); });
    await D.page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    await D.page.evaluate(() => { KB.Game._starts = 0; });
    await D.page.keyboard.press('Enter');
    await clickSel(D.page, '#btnAgain');
    await sleep(50);
    check('game over: Enter / Play Again within 0.7 s are ignored', await mode(D.page) === 'over' && await D.page.evaluate(() => KB.Game._starts) === 0);
    await sleep(800);
    await D.page.evaluate(() => document.getElementById('btnAgain').focus());
    await D.page.keyboard.press('Enter'); await sleep(150);
    check('game over: Enter after 0.7 s restarts exactly once (focused Play Again)', await mode(D.page) === 'playing' && await D.page.evaluate(() => KB.Game._starts) === 1);
    await D.page.evaluate(() => { KB.debug.world._die(); });
    await D.page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    await D.page.evaluate(() => { KB.Game._starts = 0; });
    await sleep(800);
    await D.page.keyboard.press('Space'); await sleep(150);
    check('game over: Space after 0.7 s restarts exactly once', await mode(D.page) === 'playing' && await D.page.evaluate(() => KB.Game._starts) === 1);
    // pause screen: focused Resume + Space resumes once and makes no tap
    await D.page.evaluate(() => { KB.debug.setSpeed(0); });
    await D.page.keyboard.press('Escape'); await sleep(100);
    const tb = await D.page.evaluate(() => KB.debug.world.stats.taps);
    await D.page.keyboard.press('Space'); await sleep(100);
    check('pause: focused Resume + Space resumes without a game tap', await mode(D.page) === 'playing' && await D.page.evaluate(() => KB.debug.world.stats.taps) === tb);
    await noErrors(D.errs, 'input(start/restart)');
    await D.ctx.close();
  },

  // ---------------- judging end to end ----------------
  async judging() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await freezePlaying(page);
    const keyOf = l => (l === 0 ? 'ArrowUp' : 'ArrowDown');
    const cfg = await page.evaluate(() => KB.debug.world.cfg);
    // 1) exact taps: perfect / score / combo / multiplier
    let expected = 0, mult = 1, combo = 0, allPerfect = true, lastDetail = '';
    for (let i = 0; i < 12; i++) {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); if (!n) return null; __qa.goto(n.time); return n; });
      if (!n) break;
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const after = await page.evaluate(id => ({ n: __qa.note(id), s: KB.debug.getState() }), n.id);
      const pts = n.kind === 'pillow' ? cfg.bouncePts * mult : cfg.perfectPts * mult * (n.kind === 'gold' ? cfg.goldMul : 1);
      expected += pts; combo++; if (combo % cfg.comboStep === 0 && mult < cfg.multMax) mult++;
      if (!(after.n.judge === 'perfect' && (after.n.state === 'hit' || after.n.state === 'bounced') && after.s.score === expected && after.s.combo === combo && after.s.mult === mult)) {
        allPerfect = false; lastDetail = `note ${n.id} ${n.kind}: state=${after.n.state} judge=${after.n.judge} score=${after.s.score}/${expected} combo=${after.s.combo}/${combo} mult=${after.s.mult}/${mult}`;
        break;
      }
    }
    check('tap exactly at note time → perfect, right score and combo (12 notes)', allPerfect, lastDetail || `score ${expected}`);
    check('10 catches in a row → ×2 multiplier', (await st(page)).mult === 2, 'mult ' + (await st(page)).mult);
    await page.evaluate(() => KB.Game.renderer.fx.length);
    // 2) good: tap 0.1 s late (normal perfect 0.075, good 0.15)
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + 0.1); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => __qa.note(id), n.id);
      check('tap 100 ms late → good', a.judge === 'good', `judge=${a.judge} err=${a.err}`);
    }
    // 3) wrong lane at the right time → empty (no hit), then the note is missed → groove drops, combo resets
    {
      const g0 = (await st(page)).groove;
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      await page.keyboard.press(keyOf(1 - n.lane)); await frames(page, 1);
      const a1 = await page.evaluate(id => __qa.note(id), n.id);
      check('wrong-lane tap does not catch the coin (wrongLaneMiss → miss now)', a1.state === (cfg.wrongLaneMiss ? 'miss' : 'live'), 'state ' + a1.state);
      await page.evaluate(() => __qa.adv(0.2)); await frames(page, 1);
      const a2 = await page.evaluate(id => ({ n: __qa.note(id), s: KB.debug.getState() }), n.id);
      const cost = cfg.missCost * cfg.firstLevelCostMul;
      check('untapped note → miss', a2.n.state === 'miss' || a2.n.state === 'poof', 'state ' + a2.n.state);
      check('miss reduces groove by missCost (×first-level factor)', Math.abs((g0 - a2.s.groove) - (a2.n.kind === 'pillow' ? cfg.poofCost * cfg.firstLevelCostMul : cost)) < 1e-6, `groove ${g0.toFixed(3)} → ${a2.s.groove.toFixed(3)}`);
      check('miss resets combo and multiplier', a2.s.combo === 0 && a2.s.mult === 1);
    }
    // 4) early tap (anti-spam): 0.2 s before → early miss
    {
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time - 0.2); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => ({ n: __qa.note(id), early: KB.debug.world.stats.early }), n.id);
      check('tap 200 ms early → missed early (anti-spam)', a.n.state === 'miss' || a.n.state === 'poof', `state=${a.n.state} early=${a.early}`);
    }
    // 5) timing offset shifts judging: +100 ms offset, tap 100 ms late → perfect
    {
      await page.evaluate(() => KB.Game.setSetting('offset', 100));
      const n = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time + 0.1); return n; });
      await page.keyboard.press(keyOf(n.lane)); await frames(page, 1);
      const a = await page.evaluate(id => __qa.note(id), n.id);
      check('timing offset +100 ms: tap 100 ms late → perfect', a.judge === 'perfect', `judge=${a.judge} err=${a.err && a.err.toFixed(3)}`);
      await page.evaluate(() => KB.Game.setSetting('offset', -100));
      const m = await page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time - 0.1); return n; });
      await page.keyboard.press(keyOf(m.lane)); await frames(page, 1);
      const a2 = await page.evaluate(id => __qa.note(id), m.id);
      check('timing offset −100 ms: tap 100 ms early → perfect', a2.judge === 'perfect', `judge=${a2.judge}`);
      await page.evaluate(() => KB.Game.setSetting('offset', 0));
    }
    // 6) pillows: bounce (bot) and poof (no taps)
    {
      await page.evaluate(() => { KB.debug.setBot(true, 1); KB.debug.setSpeed(4); });
      await page.waitForFunction(() => KB.debug.world.songTime > 14 && KB.debug.world.boss.state === 'away', null, { timeout: 30000 });
      const b0 = await page.evaluate(() => KB.debug.world.stats.bounced);
      const ok = await page.evaluate(() => KB.debug.world.bossNow());
      check('bossNow() starts a Baron Fluff visit', ok !== false);
      await page.waitForFunction(b => KB.debug.world.stats.bounced >= b + 3, b0, { timeout: 30000 }).catch(() => {});
      const s1 = await page.evaluate(() => ({ bounced: KB.debug.world.stats.bounced, boss: KB.debug.world.boss.state }));
      check('bot bops all 3 pillows back (bounce)', s1.bounced >= b0 + 3, `bounced ${b0} → ${s1.bounced}`);
      await page.waitForFunction(() => KB.debug.world.boss.state === 'away', null, { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => { KB.debug.setBot(false); });
      const p0 = await page.evaluate(() => ({ poofed: KB.debug.world.stats.poofed, songTime: KB.debug.world.songTime, songLen: KB.debug.world.songLen }));
      await page.evaluate(() => { KB.debug.world.groove = 1; KB.debug.world.bossNow(); });
      let sawDizzy = false;
      for (let i = 0; i < 80; i++) {
        const s = await page.evaluate(() => ({ p: KB.debug.world.stats.poofed, d: KB.debug.world.kit.frame }));
        if (s.d === 'dizzy') sawDizzy = true;
        if (s.p >= p0.poofed + 1 && sawDizzy) break;
        await sleep(50);
      }
      const p1 = await page.evaluate(() => KB.debug.world.stats.poofed);
      check('untapped pillow poofs on Kit', p1 >= p0.poofed + 1, `poofed ${p0.poofed} → ${p1}`);
      check('poof makes Kit dizzy', sawDizzy);
    }
    await noErrors(errs, 'judging');
    await ctx.close();

    // ---- easy: one-button ----
    const E = await newPage();
    await boot(E.page, '?mute=1&seed=7&autostart=1&diff=easy', 'playing');
    await freezePlaying(E.page);
    check('easy (?diff=easy): oneButton config', await E.page.evaluate(() => KB.debug.world.cfg.oneButton === true));
    let ok = true, det = '';
    for (const key of ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyW']) {
      const n = await E.page.evaluate(() => { const n = __qa.nextLive(); __qa.goto(n.time); return n; });
      await E.page.keyboard.press(key); await frames(E.page, 1);
      const a = await E.page.evaluate(id => __qa.note(id), n.id);
      if (a.state !== 'hit' && a.state !== 'bounced') { ok = false; det += `${key} on lane ${n.lane}: ${a.state}; `; }
    }
    check('easy: Space/Enter/any lane key catches the next coin in either lane', ok, det);
    // easy level 1 cannot be lost
    await E.page.evaluate(() => { KB.debug.setSpeed(16); });
    await E.page.waitForFunction(() => KB.debug.world.level >= 1 || KB.debug.mode !== 'playing', null, { timeout: 60000 });
    check('easy: level 1 with no taps cannot be lost (clears)', await E.page.evaluate(() => KB.debug.world.level >= 1 && KB.debug.mode === 'playing'), JSON.stringify(await st(E.page)).slice(0, 120));
    await noErrors(E.errs, 'judging(easy)');
    await E.ctx.close();
  },

  // ---------------- levels, game over, best score ----------------
  async progression() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1');
    await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=16', 'playing');
    await page.evaluate(() => { const R = KB.Game.renderer, o = R.showBanner; window.__banners = []; R.showBanner = function (t) { __banners.push(t); return o.apply(this, arguments); }; window.__ev = []; const H = KB.Game.handleEvents; KB.Game.handleEvents = function (ev) { ev.forEach(e => (e.type === 'cleared' || e.type === 'level' || e.type === 'songdone') && __ev.push(e)); return H.call(this, ev); }; });
    await page.waitForFunction(() => KB.debug.world.level >= 1, null, { timeout: 60000 });
    await frames(page, 3);
    const s = await page.evaluate(() => ({ st: KB.debug.getState(), ban: __banners, ev: __ev, vis: KB.Game.renderer.vis.cur, atod: KB.Audio.tod }));
    check('level clear: songdone + cleared events', s.ev.some(e => e.type === 'songdone') && s.ev.some(e => e.type === 'cleared'), JSON.stringify(s.ev));
    check('level clear: advances to Noon (tod 1)', s.st.level === 1 && s.st.tod === 1 && s.st.levelsCleared === 1);
    check('level clear: level banner shown for Noon', s.ban.includes(1), 'banners ' + JSON.stringify(s.ban));
    check('level clear: renderer + music switch to Noon', s.vis === 1 && s.atod === 1, `vis ${s.vis} audio ${s.atod}`);
    const cleared = s.ev.find(e => e.type === 'cleared');
    check('level clear: bonus = round(groove×1000)', cleared && cleared.bonus > 0 && cleared.bonus <= 1000, cleared && 'bonus ' + cleared.bonus);
    // let it die on purpose → game over, best saved
    const score = await page.evaluate(() => { KB.debug.setBot(false); return KB.debug.world.score; });
    await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 60000 });
    const o = await page.evaluate(() => ({ score: KB.debug.world.score, groove: KB.debug.world.groove, best: localStorage.getItem('ktb:best_normal'), shown: document.getElementById('overBest').textContent, sc: document.getElementById('overScore').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), stats: document.getElementById('overStats').textContent, medal: document.getElementById('medal').className }));
    check('game over when groove empties (no taps)', o.groove === 0, 'groove ' + o.groove);
    check('game over: score shown', +o.sc === o.score && o.score >= score);
    check('best saved per difficulty (best_normal)', +o.best === o.score, `stored ${o.best} score ${o.score}`);
    check('game over: NEW! best shown', o.nb && +o.shown === o.score);
    check('game over: bronze medal after clearing one level', /bronze/.test(o.medal), o.medal);
    await page.screenshot({ path: OUT + '/qa_over.png' });
    // second, worse run → no NEW, best kept
    await sleep(800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => KB.debug.mode === 'playing');
    await page.evaluate(() => { KB.debug.setSpeed(1); KB.debug.world._die(); });
    await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    const o2 = await page.evaluate(() => ({ shown: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden'), best: localStorage.getItem('ktb:best_normal') }));
    check('worse run: best kept, no NEW!', !o2.nb && +o2.shown === o.score && +o2.best === o.score, JSON.stringify(o2));
    await sleep(800);
    await clickSel(page, '#btnOverMenu'); await sleep(100);
    check('title shows best for current difficulty', +(await page.evaluate(() => document.getElementById('bestTitle').textContent)) === o.score);
    await clickSel(page, '#btnSettings');
    await clickSel(page, '#setDifficulty [data-v=easy]');
    await clickSel(page, '#scrSettings .btn-back'); await sleep(100);
    check('title best follows difficulty (easy → 0)', +(await page.evaluate(() => document.getElementById('bestTitle').textContent)) === 0);
    await clickSel(page, '#btnSettings'); await clickSel(page, '#setDifficulty [data-v=normal]'); await clickSel(page, '#scrSettings .btn-back');
    // ?diff=hard run saves to best_hard and the title shows the hard best while that flag is on
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=8&diff=hard', 'playing');
    await page.waitForFunction(() => KB.debug.world.score > 0, null, { timeout: 30000 });
    await page.evaluate(() => { KB.debug.setBot(false); KB.debug.world._die(); });
    await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    const h = await page.evaluate(() => ({ hard: localStorage.getItem('ktb:best_hard'), score: KB.debug.world.score, normal: localStorage.getItem('ktb:best_normal') }));
    check('?diff=hard run saves best_hard (not best_normal)', +h.hard === h.score && +h.normal === o.score, JSON.stringify(h));
    await sleep(800); await clickSel(page, '#btnOverMenu'); await sleep(100);
    const bt = +(await page.evaluate(() => document.getElementById('bestTitle').textContent));
    check('title best line matches the difficulty being played (?diff=hard)', bt === h.score, `title shows ${bt}, hard best ${h.score}, normal best ${o.score}`);
    // reset best
    await clickSel(page, '#btnSettings'); await clickSel(page, '#btnResetBest');
    check('Reset best asks first (no reset on the first tap)', await page.evaluate(() => !!localStorage.getItem('ktb:best_normal')));
    await clickSel(page, '#btnResetBest');
    check('Settings → Reset best clears all bests', await page.evaluate(() => !localStorage.getItem('ktb:best_normal') && !localStorage.getItem('ktb:best_hard')));
    await noErrors(errs, 'progression');
    await ctx.close();
  },

  // ---------------- settings persistence + URL flags ----------------
  async settings() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1'); await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7', 'title');
    await clickSel(page, '#btnSettings'); await sleep(60);
    const s0 = await page.evaluate(() => Object.assign({}, KB.Game.settings));
    check('settings defaults: sfx on, music on, normal, 0 ms', s0.sfx && s0.music && s0.difficulty === 'normal' && !s0.offset);
    await page.locator('label:has(#setSfx)').click();
    await page.locator('label:has(#setMusic)').click();
    await clickSel(page, '#setDifficulty [data-v=hard]');
    await page.evaluate(() => { const o = document.getElementById('setOffset'); o.value = 40; o.dispatchEvent(new Event('input')); o.dispatchEvent(new Event('change')); });
    check('offset label updates', await page.evaluate(() => document.getElementById('offsetVal').textContent) === '+40 ms');
    check('difficulty segment highlights Hard', await page.evaluate(() => document.querySelector('#setDifficulty .on').dataset.v) === 'hard');
    // fullscreen toggle: no crash
    const fullVisible = await page.locator('#rowFull').isVisible();
    if (fullVisible) { await page.locator('label:has(#setFull)').click(); await sleep(300); await page.locator('label:has(#setFull)').click(); await sleep(300); }
    await page.keyboard.press('F11'); await sleep(250); await page.keyboard.press('F11'); await sleep(250);
    check('fullscreen toggle (checkbox + F11) does not crash', errs.length === 0, fullVisible ? 'checkbox visible' : 'row hidden');
    await clickSel(page, '#scrSettings .btn-back');
    await page.reload(); await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    const s1 = await page.evaluate(() => KB.Game.settings);
    check('settings persist across reload (sfx off, music off, hard, +40 ms)', s1.sfx === false && s1.music === false && s1.difficulty === 'hard' && s1.offset === 40, JSON.stringify(s1));
    check('?mute=1 is not saved into settings', s1.muted === false && !/"muted":true/.test(await page.evaluate(() => localStorage.getItem('ktb:settings'))));
    check('settings UI reflects saved values', await page.evaluate(() => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.getElementById('setOffset').value === '40'));
    // ?diff=easy flag is used for play but never saved
    await boot(page, '?mute=1&seed=7&diff=easy&autostart=1', 'playing');
    check('?diff=easy plays Easy', await page.evaluate(() => KB.debug.world.cfg.oneButton === true));
    await page.evaluate(() => KB.Game.setSetting('sfx', true));
    check('?diff=easy is not saved into settings', JSON.parse(await page.evaluate(() => localStorage.getItem('ktb:settings'))).difficulty === 'hard');
    // ?mute=1 then press M → the test flag must not end up saved as muted:true
    await boot(page, '?mute=1&seed=7', 'title');
    await page.keyboard.press('KeyM'); await sleep(50);
    const m = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('ktb:settings')).muted, audio: KB.Audio.muted, toast: document.getElementById('toast').textContent }));
    check('?mute=1 + M: un-mutes (M toggles what the player hears) and saves nothing muted', m.saved === false && m.audio === false, JSON.stringify(m));
    // M toggles mute and persists
    await boot(page, '?seed=7', 'title');
    await page.evaluate(() => KB.Game.setSetting('muted', false));
    await page.keyboard.press('KeyM'); await sleep(50);
    await page.reload(); await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    check('M mute persists across reload', await page.evaluate(() => KB.Game.settings.muted === true && KB.Audio.muted === true));
    await page.keyboard.press('KeyM');
    // corrupted settings JSON → defaults, no crash
    await page.evaluate(() => localStorage.setItem('ktb:settings', '{not json'));
    await page.reload(); await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    check('corrupted settings JSON falls back to defaults', await page.evaluate(() => KB.Game.settings.difficulty === 'normal'));
    await noErrors(errs, 'settings');
    await ctx.close();
  },

  // ---------------- pause / blur / visibility / clock ----------------
  async pause() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=7&autostart=1', 'playing');
    await page.waitForFunction(() => KB.debug.world.songTime > 1.5, null, { timeout: 15000 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('window blur auto-pauses', await mode(page) === 'paused');
    const t0 = await page.evaluate(() => KB.debug.world.songTime);
    await sleep(1500);
    const t1 = await page.evaluate(() => KB.debug.world.songTime);
    check('song time frozen while paused', t1 === t0, `${t0} → ${t1}`);
    await clickSel(page, '#btnResume');
    const t2 = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(KB.debug.world.songTime)))));
    check('resume continues where it was (no jump)', t2 >= t0 && t2 - t0 < 0.25, `${t0.toFixed(3)} → ${t2.toFixed(3)}`);
    // visibilitychange
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check('visibilitychange (hidden) auto-pauses', await mode(page) === 'paused');
    const t3 = await page.evaluate(() => KB.debug.world.songTime);
    await sleep(800);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    check('coming back stays paused (child resumes)', await mode(page) === 'paused' && await page.evaluate(() => KB.debug.world.songTime) === t3);
    await page.keyboard.press('Escape');
    const t4 = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(KB.debug.world.songTime)))));
    check('resume after hide continues (no jump)', t4 - t3 < 0.25 && t4 >= t3, `${t3.toFixed(3)} → ${t4.toFixed(3)}`);
    // death frame: no pausing
    await page.evaluate(() => KB.debug.world._die());
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); KB.Game.pause(); });
    check('no pausing on the death frame (blur / P after dying)', await mode(page) === 'playing');
    await page.keyboard.press('Escape');
    check('Esc after dying does not pause', await mode(page) === 'playing');
    await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 });
    check('…and game over follows', await mode(page) === 'over');
    // blur on title / over does not change mode
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    check('blur on game over keeps game over', await mode(page) === 'over');
    // music stops on return to title from pause (audio context exists)
    await sleep(800); await page.keyboard.press('Enter');
    await page.waitForFunction(() => KB.debug.mode === 'playing');
    await page.evaluate(() => KB.Game.setSetting('music', true));
    const mp = await page.evaluate(() => KB.Audio._musicPlaying);
    await page.keyboard.press('Escape'); await clickSel(page, '#btnPauseMenu'); await sleep(100);
    check('music playing in game, stopped on return to title', mp === true && await page.evaluate(() => KB.Audio._musicPlaying) === false, 'in game ' + mp);
    await noErrors(errs, 'pause');
    await ctx.close();
  },

  // ---------------- customisation ----------------
  async custom() {
    const { ctx, page, errs } = await newPage();
    await page.goto(GAME + '?mute=1'); await page.evaluate(() => localStorage.clear());
    await boot(page, '?mute=1&seed=7', 'title');
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
      pillow: { name: 'huge.png', mimeType: 'image/png', buffer: buf(imgs.huge) },
      bg_dawn: { name: 'wide.png', mimeType: 'image/png', buffer: buf(imgs.wide) },
      bg_noon: { name: 'huge.png', mimeType: 'image/png', buffer: buf(imgs.huge) },
      bg_sunset: { name: 'transparent.png', mimeType: 'image/png', buffer: buf(imgs.cutBg) }
    };
    await clickSel(page, '#btnCustomize'); await sleep(100);
    const slotIds = await page.evaluate(() => KB.Assets.SLOTS.map(s => s.id));
    const pick = async (slot, file) => {
      const i = slotIds.indexOf(slot);
      const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]').click()]);
      await fc.setFiles(file);
    };
    for (const [slot, f] of Object.entries(FILES)) {
      await pick(slot, f);
      await page.waitForFunction(s => KB.Assets.hasCustom(s) && /saved/.test(document.getElementById('toast').textContent), slot, { timeout: 15000 }).catch(() => {});
      const r = await page.evaluate(s => ({ has: KB.Assets.hasCustom(s), len: (localStorage.getItem('ktb:img_' + s) || '').length, w: KB.Assets.custom[s] && KB.Assets.custom[s].width, h: KB.Assets.custom[s] && KB.Assets.custom[s].height, tag: document.querySelectorAll('#slotGrid .slot')[KB.Assets.SLOTS.findIndex(x => x.id === s)].querySelector('.tag').textContent }), slot);
      check(`custom ${slot} ← ${f.name}: stored and shown`, r.has && r.len > 100 && /Your picture/.test(r.tag), `${(r.len / 1024).toFixed(0)} KB, ${r.w}×${r.h}`);
    }
    const shapes = await page.evaluate(() => ({ hero: localStorage.getItem('ktb:shape_hero'), coin: localStorage.getItem('ktb:shape_coin') }));
    check('opaque photo → round sticker; transparent cut-out → whole picture', shapes.hero === 'circle' && shapes.coin === 'fit', JSON.stringify(shapes));
    const big = await page.evaluate(() => ({ p: KB.Assets.customSrc.pillow.naturalWidth, n: KB.Assets.customSrc.bg_noon.naturalWidth, nh: KB.Assets.customSrc.bg_noon.naturalHeight, tot: Object.keys(localStorage).reduce((a, k) => a + localStorage.getItem(k).length, 0) }));
    check('4000×3000 picture is downscaled (char ≤512, bg long edge ≤1600)', big.p <= 512 && Math.max(big.n, big.nh) <= 1600, JSON.stringify(big));
    // corrupted and non-image files
    await pick('bg_night', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png at all') });
    await page.waitForFunction(() => /could not be opened|picture/i.test(document.getElementById('toast').textContent) && !/Saving/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).catch(() => {});
    let t = await page.evaluate(() => document.getElementById('toast').textContent);
    check('corrupted PNG → friendly message, slot unchanged', /could not be opened/i.test(t) && !(await page.evaluate(() => KB.Assets.hasCustom('bg_night'))), t);
    await pick('bg_night', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await sleep(300);
    t = await page.evaluate(() => document.getElementById('toast').textContent);
    check('non-image file → "choose a picture" message', /choose a picture/i.test(t), t);
    // shape toggle
    await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=fit]').click(); await sleep(100);
    check('shape buttons switch the hero to whole picture', await page.evaluate(() => localStorage.getItem('ktb:shape_hero')) === 'fit');
    await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click(); await sleep(100);
    await clickSel(page, '#scrCustom .btn-back');
    // reload → persists
    await page.reload(); await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    const after = await page.evaluate(() => KB.Assets.SLOTS.map(s => s.id + ':' + KB.Assets.hasCustom(s.id)).join(' '));
    check('custom pictures persist after reload', /hero:true coin:true pillow:true bg_dawn:true bg_noon:true bg_sunset:true bg_night:false/.test(after), after);
    // gameplay with the custom pictures: all 4 times of day + a pillow visit
    await boot(page, '?mute=1&seed=7&autostart=1&bot=1&skill=1&speed=2', 'playing');
    await page.evaluate(() => { const A = KB.Assets, o = A.sprite; window.__spr = {}; A.sprite = function (k, w, h) { if (k.startsWith('custom:')) __spr[k] = 1; return o.apply(this, arguments); }; });
    for (const lv of [0, 1, 2, 3]) {
      await page.evaluate(l => KB.debug.gotoLevel(l), lv);
      await page.waitForFunction(() => KB.debug.world.songTime > 6, null, { timeout: 20000 });
      if (lv === 1) { await page.evaluate(() => KB.debug.bossNow()); await page.waitForFunction(() => KB.debug.world.notes.some(n => n.kind === 'pillow' && n.tThrow != null && n.tThrow < KB.debug.world.songTime && n.state === 'live'), null, { timeout: 20000 }).catch(() => {}); }
      await page.screenshot({ path: OUT + `/qa_custom_tod${lv}.png` });
    }
    const spr = await page.evaluate(() => Object.keys(__spr).sort().join(','));
    check('gameplay draws the custom hero / coin / pillow', /custom:coin/.test(spr) && /custom:hero/.test(spr) && /custom:pillow/.test(spr), spr);
    check('gameplay with custom pictures: no frame errors', (await page.evaluate(() => KB.debug.stats.errors.length)) === 0);
    // reset one / reset all
    await boot(page, '?mute=1&seed=7', 'title');
    await clickSel(page, '#btnCustomize'); await sleep(100);
    await page.locator('#slotGrid .slot').nth(0).locator('[data-act=reset]').click(); await sleep(100);
    check('Reset one: hero back to original (memory + storage)', await page.evaluate(() => !KB.Assets.hasCustom('hero') && !localStorage.getItem('ktb:img_hero') && !localStorage.getItem('ktb:shape_hero') && KB.Assets.hasCustom('coin')));
    await clickSel(page, '#btnResetAll'); await sleep(100);
    check('Reset all: every slot original', await page.evaluate(() => KB.Assets.SLOTS.every(s => !KB.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => k.startsWith('ktb:img_'))));
    await page.reload(); await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title');
    check('Reset all persists after reload', await page.evaluate(() => KB.Assets.SLOTS.every(s => !KB.Assets.hasCustom(s.id))));
    // capacity: photo-like pictures (smooth gradients + grain, like a phone photo) in all 7 slots.
    // Each must either be saved, or be refused with the friendly "Not enough room" message; memory must match storage.
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
      results.push(await page.evaluate(s => ({ s, toast: document.getElementById('toast').textContent, has: KB.Assets.hasCustom(s), stored: !!localStorage.getItem('ktb:img_' + s), kb: ((localStorage.getItem('ktb:img_' + s) || '').length / 1024) | 0 }), slot));
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
      const S = KB.Storage, out = {};
      // localStorage path: success returns Promise<true>
      const p = S.set('qa_a', 'x'); out.isPromise = p instanceof Promise; out.ok = await p;
      // quota failure → false + rollback
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
      out.failRet = await S.set('qa_a', 'y'); out.afterFail = S.get('qa_a');
      out.failNew = await S.set('qa_new', 'z'); out.newGone = S.get('qa_new') === undefined;
      Storage.prototype.setItem = orig;
      // native path: false / reject → rollback
      S.native = true;
      window.ffStoreSet = () => Promise.resolve(false); out.nFalse = await S.set('qa_a', 'n1'); out.nFalseVal = S.get('qa_a');
      window.ffStoreSet = () => Promise.reject(new Error('io')); out.nRej = await S.set('qa_a', 'n2'); out.nRejVal = S.get('qa_a');
      window.ffStoreSet = () => Promise.resolve(true); out.nOk = await S.set('qa_a', 'n3'); out.nOkVal = S.get('qa_a');
      // two writes in flight, the first fails late, the second succeeds → the second value must survive
      let k = 0; window.ffStoreSet = () => (++k === 1 ? new Promise(res => setTimeout(() => res(false), 80)) : Promise.resolve(true));
      const a = S.set('qa_race', 'first'), b = S.set('qa_race', 'second'); await Promise.all([a, b]); out.race = S.get('qa_race');
      window.ffStoreDel = () => Promise.resolve(true);
      out.setJSONret = S.setJSON('qa_j', { a: 1 }); out.setJSONisPromise = out.setJSONret instanceof Promise;
      delete window.ffStoreSet; delete window.ffStoreDel; S.native = false; S.del('qa_a'); S.del('qa_race'); S.del('qa_j');
      return out;
    });
    check('storage.set returns Promise<true> on success', r.isPromise && r.ok === true);
    check('storage.set: localStorage quota error → false and value rolled back', r.failRet === false && r.afterFail === 'x' && r.failNew === false && r.newGone, JSON.stringify({ failRet: r.failRet, afterFail: r.afterFail }));
    check('storage.set (native): ffStoreSet false → false + rollback', r.nFalse === false && r.nFalseVal === 'x');
    check('storage.set (native): ffStoreSet rejects → false + rollback', r.nRej === false && r.nRejVal === 'x');
    check('storage.set (native): ok → true', r.nOk === true && r.nOkVal === 'n3');
    check('storage.set: a late failure does not roll back a newer successful write', r.race === 'second', 'value after race: ' + r.race);
    check('storage.setJSON returns the Promise<boolean> (callers can see a failed settings save)', r.setJSONisPromise);
    await noErrors(errs, 'storage');
    await ctx.close();
  },

  // ---------------- layout on many viewports ----------------
  async layout() {
    const VPS = [
      { n: 'desktop 1280x720', o: { viewport: { width: 1280, height: 720 } } },
      { n: 'desktop 1920x1080', o: { viewport: { width: 1920, height: 1080 } } },
      { n: 'desktop 1920x1080 DPR2', o: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 } },
      { n: 'desktop 800x600', o: { viewport: { width: 800, height: 600 } } },
      { n: 'iPhone portrait 390x844', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
      { n: 'iPhone landscape 844x390', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
      { n: 'iPad portrait 1024x1366', o: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
      { n: 'iPad landscape 1366x1024', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } }
    ];
    for (const vp of VPS) {
      const { ctx, page, errs } = await newPage(vp.o);
      await boot(page, '?mute=1&seed=7', 'title');
      const measure = () => page.evaluate(() => {
        const iw = innerWidth, ih = innerHeight, bad = [];
        const de = document.documentElement;
        if (de.scrollWidth > iw + 1 || de.scrollHeight > ih + 1) bad.push(`page scroll ${de.scrollWidth}×${de.scrollHeight}`);
        const scr = KB.UI.current ? document.getElementById(KB.UI.current) : null;
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
        const c = document.getElementById('game').getBoundingClientRect(), R = KB.Game.renderer;
        const fills = Math.abs(c.width - iw) < 2 || Math.abs(c.height - ih) < 2;
        const canvasOk = fills && c.left >= -1 && c.top >= -1 && c.right <= iw + 1 && c.bottom <= ih + 1 && R.canvas.width === Math.round(R.VW * R.px);
        if (!canvasOk) bad.push(`canvas ${c.width | 0}×${c.height | 0} at ${c.left | 0},${c.top | 0}`);
        return { bad, scrolls, cover: (c.width * c.height) / (iw * ih) };
      });
      const screens = [
        ['title', async () => {}],
        ['how', async () => page.evaluate(() => KB.UI.open('scrHow', 'scrTitle'))],
        ['settings', async () => page.evaluate(() => KB.UI.open('scrSettings', 'scrTitle'))],
        ['custom', async () => page.evaluate(() => KB.UI.open('scrCustom', 'scrTitle'))],
        ['play', async () => { await page.evaluate(() => KB.Game.startGame()); }],
        ['pause', async () => page.evaluate(() => KB.Game.pause())],
        ['over', async () => { await page.evaluate(() => { KB.Game.resume(); KB.debug.world._die(); }); await page.waitForFunction(() => KB.debug.mode === 'over', null, { timeout: 10000 }); }]
      ];
      const summary = [];
      for (const [name, go] of screens) {
        await go(); await sleep(1000);   // let the pop-in animations (≤ 0.9 s, scale overshoot 1.03) finish
        const m = await measure();
        if (m.scrolls) summary.push(name + ' panel scrolls');
        check(`layout ${vp.n} / ${name}: nothing overflows`, m.bad.length === 0, m.bad.slice(0, 4).join('; '));
        if (name !== 'play') await page.screenshot({ path: OUT + `/qa_layout_${vp.n.replace(/\W+/g, '_')}_${name}.png` });
      }
      if (summary.length) console.log('  info ' + vp.n + ': ' + summary.join(', '));
      // rotation / resize during play
      await page.evaluate(() => { KB.Game.toTitle(); KB.Game.startGame(); KB.debug.setBot(true, 1); });
      await sleep(600);
      const v0 = vp.o.viewport;
      await page.setViewportSize({ width: v0.height, height: v0.width }); await sleep(450);
      const rot = await page.evaluate(() => { const R = KB.Game.renderer, c = R.canvas.getBoundingClientRect(), L = R.layout; return { mode: KB.debug.mode, VW: R.VW, VH: R.VH, cw: c.width, ch: c.height, iw: innerWidth, ih: innerHeight, split: L.split, c0: L.coinY[0], c1: L.coinY[1], bw: R.canvas.width, px: R.px, hud: document.getElementById('hud').getBoundingClientRect() }; });
      const portrait = v0.height > v0.width ? false : true;   // after rotation
      check(`rotate ${vp.n} during play: relayout`, (rot.VW < rot.VH) === portrait && (Math.abs(rot.cw - rot.iw) < 2 || Math.abs(rot.ch - rot.ih) < 2) && rot.bw === Math.round(rot.VW * rot.px), JSON.stringify({ VW: rot.VW, VH: rot.VH, cw: rot.cw | 0, ch: rot.ch | 0, iw: rot.iw, ih: rot.ih }));
      check(`rotate ${vp.n}: still playing, lanes ordered, HUD in view`, rot.mode === 'playing' && rot.c0 < rot.split && rot.split < rot.c1 && rot.c1 < rot.VH && rot.hud.right <= rot.iw + 1 && rot.hud.top >= 0);
      await sleep(400);
      await page.setViewportSize(v0); await sleep(450);
      check(`rotate ${vp.n} back: no errors`, (await page.evaluate(() => KB.debug.stats.errors.length)) === 0 && errs.length === 0, errs.slice(0, 2).join(' | '));
      await noErrors(errs, 'layout ' + vp.n);
      await ctx.close();
    }
  },

  // ---------------- long high-speed bot run ----------------
  async soak() {
    const { ctx, page, errs } = await newPage();
    await boot(page, '?mute=1&seed=5&autostart=1&bot=1&skill=0.8&speed=16', 'playing');
    await page.evaluate(() => {
      const G = KB.Game, f = G.frame; window.__ft = [];
      G.frame = function (ts) { const a = performance.now(); f.call(this, ts); __ft.push(performance.now() - a); };
    });
    const tods = new Set(); let maxP = 0, maxFx = 0, maxTexts = 0, heap0 = null, heapMax = 0, last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const s = await page.evaluate(() => ({ st: KB.debug.getState(), heap: performance.memory ? performance.memory.usedJSHeapSize : 0, texts: KB.Game.renderer.texts.length, fly: KB.Game.renderer.fly.length }));
      last = s.st; tods.add(s.st.tod);
      maxP = Math.max(maxP, s.st.particles); maxFx = Math.max(maxFx, s.st.fx); maxTexts = Math.max(maxTexts, s.texts + s.fly);
      if (s.st.level >= 1 && heap0 == null && s.heap) heap0 = s.heap;
      heapMax = Math.max(heapMax, s.heap);
      if (s.st.mode !== 'playing' || s.st.level >= 6) break;
      await sleep(400);
    }
    const ft = await page.evaluate(() => { const a = __ft.slice(30).sort((x, y) => x - y); return { n: a.length, p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; });
    const bot = await page.evaluate(() => KB.Game.bot && KB.Game.bot.stats);
    console.log('  soak: ' + JSON.stringify({ level: last.level, lap: last.lap, score: last.score, groove: last.groove && +last.groove.toFixed(2), tods: [...tods], maxP, maxFx, maxTexts, heap0MB: heap0 && +(heap0 / 1e6).toFixed(1), heapMaxMB: +(heapMax / 1e6).toFixed(1), ft, bot, secs: (Date.now() - t0) / 1000 }));
    check('soak: bot (skill 0.8) still playing after 6 levels', last.mode === 'playing' && last.level >= 6, `mode ${last.mode} level ${last.level}`);
    check('soak: visited all 4 times of day and a second lap', tods.size === 4 && last.lap >= 1, [...tods].join(','));
    check('soak: weather particles bounded (< 140)', maxP < 140, 'max ' + maxP);
    check('soak: renderer fx bounded (≤ 400) and texts bounded', maxFx <= 400 && maxTexts < 200, `fx ${maxFx} texts ${maxTexts}`);
    check('soak: frame time p95 < 25 ms at 16× (headless, software GL)', ft.p95 < 25, `p50 ${ft.p50 && ft.p50.toFixed(1)} p95 ${ft.p95 && ft.p95.toFixed(1)} max ${ft.max && ft.max.toFixed(1)} ms`);
    check('soak: JS heap does not grow wildly', !heap0 || heapMax < heap0 * 2 + 30e6, `${(heap0 / 1e6).toFixed(1)} → max ${(heapMax / 1e6).toFixed(1)} MB`);
    check('soak: no frame errors', (await page.evaluate(() => KB.debug.stats.errors.length)) === 0);
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
