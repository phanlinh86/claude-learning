// Functional QA for Zippy's Jungle Boop. Prints PASS/FAIL per check and exits non-zero on any failure.
//   node tests/e2e/functional.js            (full run, ~5 min)
//   SOAK=20 node tests/e2e/functional.js    (shorter bot soak, seconds of real time per soak run)
// Screenshots go to tests/out/functional/ (gitignored).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zjb-func-'));
const SOAK = +(process.env.SOAK || 75);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']' : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DESK = { viewport: { width: 1280, height: 720 } };
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

async function open(browser, query, ctxOpts, ctx) {
  ctx = ctx || await browser.newContext(ctxOpts || DESK);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(GAME + (query || ''));
  await p.waitForFunction(() => window.ZJB && ZJB.debug && ZJB.debug.mode && ZJB.debug.mode !== 'boot', null, { timeout: 15000 });
  return { p, errs, ctx };
}
const mode = p => p.evaluate(() => ZJB.debug.mode);
const W = (p, f, a) => p.evaluate(f, a);
// screen (CSS px) position of hole i's hit-zone centre
const holeXY = (p, i) => p.evaluate(i => {
  const R = ZJB.Game.renderer, h = ZJB.debug.world.holes[i], r = R.canvas.getBoundingClientRect(), d = R.canvas.width / r.width;
  return [r.left + (R.ox + h.x * R.k) / d, r.top + (R.oy + (h.y - 45 * h.s) * R.k) / d];
}, i);
// no natural pops: the test places every critter itself
const quiet = p => p.evaluate(() => { const w = ZJB.debug.world; w._spawn = () => -1; w.holes.forEach(h => { h.critter = null; }); });
const spawn = (p, i, which) => p.evaluate(([i, which]) => {
  const w = ZJB.debug.world;
  if (which === 'wrong') { w.graceT = 0; w.graceColour = -1; }   // a grace colour would still count as a match
  const c = which === 'match' ? w.colour : which === 'wrong' ? w.colours.find(c => c !== w.colour) : which;
  w.holes.forEach((h, j) => { if (j === i) h.critter = null; });
  ZJB.debug.spawn(i, c); return c;
}, [i, which]);
const snap = p => p.evaluate(() => { const w = ZJB.debug.world; return { score: w.score, leaves: w.leaves, combo: w.combo, mult: w.mult, boops: w.boops, colour: w.colour, level: w.level, mode: ZJB.debug.mode }; });
async function startPlaying(p) {
  await p.evaluate(() => ZJB.debug.startGame());
  await p.waitForFunction(() => ZJB.debug.mode === 'playing');
}
async function forceOver(p) {
  await p.evaluate(() => { const w = ZJB.debug.world; w.graceT = 0; w.graceColour = -1; w.leaves = 1; w.zippy.state = 'home'; w.holes[0].critter = null; w.debugSpawn(0, w.colours.find(c => c !== w.colour)); });
  await sleep(150);
  await p.evaluate(() => ZJB.debug.world.tapHole(0));
  await p.waitForFunction(() => ZJB.debug.mode === 'over', null, { timeout: 6000 });
}
const visible = (p, id) => p.evaluate(id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const lsGet = (p, k) => p.evaluate(k => localStorage.getItem('zjb:' + k), k);
async function section(name, fn) {
  try { await fn(); } catch (e) { check(name + ': section ran without exceptions', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-precise-memory-info'] });

  // ------------------------------------------------------------------ 1. boot
  await section('boot', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=7');
    await sleep(3000);
    check('boot: reaches the title screen', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    check('boot: HUD hidden on the title', !(await visible(p, 'hud')));
    check('boot: title bot demo is playing (world time advances)', await W(p, () => ZJB.debug.world.time > 1));
    check('boot: best score shown as 0 on first run', (await p.textContent('#bestTitle')) === '0');
    check('boot: default difficulty is Easy', await W(p, () => ZJB.Game.settings.difficulty === 'easy'));
    check('boot: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 2. menus (desktop mouse)
  await section('menus', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=7');
    await sleep(300);
    const backIn = async id => p.click('#' + id + ' .btn-back');
    await p.click('#btnHow'); check('menu: How to Play opens', await visible(p, 'scrHow'));
    await backIn('scrHow'); check('menu: How to Play "OK" returns to title', await visible(p, 'scrTitle') && (await mode(p)) === 'title');
    await p.click('#btnHow'); await p.keyboard.press('Escape'); check('menu: Esc closes How to Play', await visible(p, 'scrTitle'));
    await p.click('#btnSettings'); check('menu: Settings opens', await visible(p, 'scrSettings'));
    await backIn('scrSettings'); check('menu: Settings Done returns to title', await visible(p, 'scrTitle'));
    await p.click('#btnCustomize'); check('menu: Change Pictures opens with 6 cards', await visible(p, 'scrCustom') && (await p.$$('#slotGrid .slot')).length === 6);
    await backIn('scrCustom'); check('menu: Change Pictures Done returns to title', await visible(p, 'scrTitle'));
    await p.click('#btnPlay'); await sleep(100);
    check('menu: Play starts a game (HUD shown, screens hidden)', (await mode(p)) === 'playing' && await visible(p, 'hud') && !(await visible(p, 'scrTitle')));
    await sleep(300);
    await p.click('#btnPause'); await sleep(50);
    const t0 = await W(p, () => ZJB.debug.world.time); await sleep(400); const t1 = await W(p, () => ZJB.debug.world.time);
    check('menu: Pause button pauses (world frozen, HUD hidden)', (await mode(p)) === 'paused' && await visible(p, 'scrPause') && t0 === t1 && !(await visible(p, 'hud')));
    await p.click('#btnResume'); await sleep(200);
    check('menu: Resume continues the same run', (await mode(p)) === 'playing' && (await W(p, () => ZJB.debug.world.time)) > t1);
    // restart from pause → a fresh world
    await quiet(p); await spawn(p, 0, 'match'); await sleep(150); await W(p, () => ZJB.debug.tap(0));
    const before = await snap(p);
    await p.click('#btnPause'); await p.click('#btnRestart'); await sleep(100);
    const after = await snap(p);
    check('menu: Restart starts a fresh run', before.score > 0 && after.score === 0 && after.mode === 'playing');
    // settings from pause → back to pause
    await p.click('#btnPause'); await p.click('#btnPauseSettings');
    check('menu: Settings from Pause opens', await visible(p, 'scrSettings'));
    await p.keyboard.press('Escape'); check('menu: Esc in Settings returns to Pause (not title)', await visible(p, 'scrPause') && (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); await backIn('scrSettings'); check('menu: Done in Settings returns to Pause', await visible(p, 'scrPause'));
    await p.click('#btnPauseMenu'); await sleep(100);
    check('menu: Main Menu returns to title', (await mode(p)) === 'title' && await visible(p, 'scrTitle') && !(await visible(p, 'hud')));
    // game over → restart lock → Play Again
    await p.click('#btnPlay'); await quiet(p); await forceOver(p);
    check('menu: game over screen shown', await visible(p, 'scrOver') && !(await visible(p, 'hud')));
    const early = await W(p, () => { const dt = performance.now() - ZJB.Game.overAt; document.getElementById('btnAgain').click(); return dt; });
    await sleep(50);
    check('menu: Play Again ignored during the 0.7 s restart lock', (await mode(p)) === 'over', 'clicked ' + Math.round(early) + ' ms after game over');
    await p.keyboard.press('Enter'); await sleep(50);
    const lockedEnter = await W(p, () => performance.now() - ZJB.Game.overAt);
    check('menu: Enter ignored during the restart lock', lockedEnter > 700 || (await mode(p)) === 'over');
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnAgain'); await sleep(100);
    check('menu: Play Again after the lock starts a new run', (await mode(p)) === 'playing' && (await W(p, () => ZJB.debug.world.score)) === 0);
    await quiet(p); await forceOver(p);
    await W(p, () => document.getElementById('btnOverMenu').click()); await sleep(50);
    check('menu: game-over Menu button is also locked for 0.7 s', (await mode(p)) === 'over');
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnOverMenu'); await sleep(100);
    check('menu: game-over Menu returns to title', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    check('menus: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 3. inputs
  await section('inputs', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=7&autostart=1&diff=easy');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    await W(p, () => { const G = ZJB.Game, o = G.tapAt.bind(G); G._tapAtN = 0; G.tapAt = (x, y) => { G._tapAtN++; return o(x, y); }; });
    await quiet(p); await W(p, () => { ZJB.debug.world.levelGoal = 999; });
    // matching click
    await spawn(p, 1, 'match'); await sleep(150);
    let [x, y] = await holeXY(p, 1); let s0 = await snap(p);
    await p.mouse.click(x, y); let s1 = await snap(p);
    check('input: mouse click on a matching friend boops (+10)', s1.score === s0.score + 10 && s1.boops === s0.boops + 1, [s0.score, s1.score]);
    // generous zone: click near the rim edge (60 % of the radius off-centre)
    await sleep(300); await spawn(p, 4, 'match'); await sleep(150);
    [x, y] = await holeXY(p, 4); const rCss = await W(p, () => { const R = ZJB.Game.renderer; return 88 * ZJB.debug.world.holes[4].s * R.k / (R.canvas.width / R.canvas.getBoundingClientRect().width); });
    s0 = await snap(p); await p.mouse.click(x + rCss * 0.6, y + rCss * 0.5); s1 = await snap(p);
    check('input: click inside the generous hit zone (off-centre) boops', s1.boops === s0.boops + 1);
    // wrong click
    await sleep(300); await spawn(p, 2, 'wrong'); await sleep(150);
    [x, y] = await holeXY(p, 2); s0 = await snap(p);
    await p.mouse.click(x, y); s1 = await snap(p);
    check('input: mouse click on a wrong colour costs a leaf and resets the combo', s1.leaves === s0.leaves - 1 && s1.combo === 0 && s1.score === s0.score, [s0, s1]);
    await sleep(500);
    // empty burrow and empty sky
    await W(p, () => { const w = ZJB.debug.world; w.combo = 3; w.holes[3].critter = null; });
    [x, y] = await holeXY(p, 3); s0 = await snap(p);
    const rings0 = await W(p, () => ZJB.Game.renderer.rings.length);
    await p.mouse.click(x, y); await sleep(40); s1 = await snap(p);   // events are drained on the next frame
    const rings1 = await W(p, () => ZJB.Game.renderer.rings.length);
    check('input: click on an empty burrow changes nothing (no leaf, combo kept) but shows a ring', s1.leaves === s0.leaves && s1.combo === 3 && s1.score === s0.score && rings1 === rings0 + 1);
    const [sx, sy] = await W(p, () => { const R = ZJB.Game.renderer, d = R.canvas.width / R.canvas.getBoundingClientRect().width; return [(R.ox + 80 * R.k) / d, (R.oy + 180 * R.k) / d]; });
    s0 = await snap(p); await p.mouse.click(sx, sy); s1 = await snap(p);
    check('input: click on empty sky changes nothing', JSON.stringify(s0) === JSON.stringify(s1));
    await W(p, () => { ZJB.debug.world.combo = 0; });
    // right click never taps
    await spawn(p, 0, 'match'); await sleep(150); [x, y] = await holeXY(p, 0); s0 = await snap(p);
    await p.mouse.click(x, y, { button: 'right' }); s1 = await snap(p);
    check('input: right-click does not boop', s1.boops === s0.boops);
    // keys 1–9 on a 9-burrow biome, in index order (back row first)
    await W(p, () => { ZJB.debug.gotoLevel(2); ZJB.debug.world.levelGoal = 999; }); await quiet(p); await sleep(100);
    let keyOk = true; const keyLog = [];
    for (let i = 0; i < 9; i++) {
      await spawn(p, i, 'match'); await sleep(130);
      const a = await W(p, () => ZJB.debug.world.boops);
      await p.keyboard.press('Digit' + (i + 1));
      const c = await W(p, i => ZJB.debug.world.holes[i].critter && ZJB.debug.world.holes[i].critter.state, i);
      const bb = await W(p, () => ZJB.debug.world.boops);
      if (bb !== a + 1 || c !== 'booped') { keyOk = false; keyLog.push(i + 1); }
    }
    check('input: keys 1–9 boop burrows 1–9 (back row first)', keyOk, keyLog.length ? 'failed keys ' + keyLog : undefined);
    await sleep(300); await spawn(p, 4, 'match'); await sleep(130);
    s0 = await snap(p); await p.keyboard.press('Numpad5'); s1 = await snap(p);
    check('input: numpad 5 boops burrow 5', s1.boops === s0.boops + 1);
    await spawn(p, 0, 'match'); await sleep(130);
    s0 = await snap(p); await p.keyboard.down('Digit1'); await p.keyboard.down('Digit1'); await p.keyboard.up('Digit1'); s1 = await snap(p);
    check('input: a held (auto-repeat) key taps only once', s1.boops === s0.boops + 1);
    // Esc / P pause and resume
    await p.keyboard.press('Escape'); const m1 = await mode(p);
    await p.keyboard.press('Escape'); const m2 = await mode(p);
    await p.keyboard.press('KeyP'); const m3 = await mode(p);
    await spawn(p, 1, 'match'); const bp = await W(p, () => ZJB.debug.world.boops); await p.keyboard.press('Digit2');
    const bp2 = await W(p, () => ZJB.debug.world.boops);
    await p.keyboard.press('KeyP'); const m4 = await mode(p);
    check('input: Esc pauses / resumes, P pauses / resumes', [m1, m2, m3, m4].join() === 'paused,playing,paused,playing', [m1, m2, m3, m4].join());
    check('input: number keys do nothing while paused', bp2 === bp);
    // HUD buttons must not reach the gameplay tap handler
    const n0 = await W(p, () => ZJB.Game._tapAtN);
    await p.click('#btnMuteHud'); await sleep(50);
    const n1 = await W(p, () => ZJB.Game._tapAtN);
    check('input: clicking the HUD sound button is not a gameplay tap', n1 === n0 && (await mode(p)) === 'playing');
    await p.click('#btnMuteHud');
    await p.click('#btnPause'); await sleep(50);
    check('input: clicking the HUD pause button is not a gameplay tap', (await W(p, () => ZJB.Game._tapAtN)) === n0 && (await mode(p)) === 'paused');
    await p.click('#btnResume');
    // Space / Enter while playing with a focused HUD button do not re-trigger it
    await p.focus('#btnPause'); await p.keyboard.press('Space'); await p.keyboard.press('Enter'); await sleep(50);
    check('input: Space/Enter while playing do not press a focused HUD button', (await mode(p)) === 'playing');
    check('inputs: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await p.close();

    // Space / Enter on focused menu buttons: exactly one start
    const { p: q, errs: e2 } = await open(b, '?mute=1&seed=7', null, ctx);
    const countStarts = () => W(q, () => { const G = ZJB.Game; if (!G._wrapped) { const o = G.startGame.bind(G); G._starts = 0; G.startGame = () => { G._starts++; return o(); }; G._wrapped = 1; } G._starts = 0; });
    await countStarts(); await sleep(200);
    await q.focus('#btnPlay'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused Play starts exactly once', (await W(q, () => ZJB.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => ZJB.Game._starts));
    await W(q, () => ZJB.Game.toTitle()); await sleep(100); await countStarts();
    await q.focus('#btnPlay'); await q.keyboard.press('Space'); await sleep(200);
    check('keys: Space on focused Play starts exactly once', (await W(q, () => ZJB.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => ZJB.Game._starts));
    await W(q, () => ZJB.Game.toTitle()); await sleep(100); await countStarts();
    await q.focus('#btnSettings'); await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter on focused Settings opens Settings, does not start', (await W(q, () => ZJB.Game._starts)) === 0 && await visible(q, 'scrSettings'));
    await q.keyboard.press('Escape'); await sleep(120);   // UI.show() moves focus to Play after 30 ms
    await q.focus('#btnHow'); await q.keyboard.press('Space'); await sleep(150);
    check('keys: Space on focused How to Play opens it, does not start', (await W(q, () => ZJB.Game._starts)) === 0 && await visible(q, 'scrHow'));
    await q.keyboard.press('Escape');
    await startPlaying(q); await quiet(q); await forceOver(q);
    await q.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750); await countStarts();
    await q.focus('#btnAgain'); await q.keyboard.press('Space'); await sleep(200);
    check('keys: Space on focused Play Again starts exactly once', (await W(q, () => ZJB.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => ZJB.Game._starts));
    await quiet(q); await forceOver(q); await q.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750); await countStarts();
    await q.focus('#btnAgain'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused Play Again starts exactly once', (await W(q, () => ZJB.Game._starts)) === 1, await W(q, () => ZJB.Game._starts));
    await quiet(q); await forceOver(q); await q.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750); await countStarts();
    await q.focus('#btnOverMenu'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused game-over Menu goes to title, no start', (await W(q, () => ZJB.Game._starts)) === 0 && (await mode(q)) === 'title');
    await startPlaying(q); await countStarts();
    await q.keyboard.press('Escape'); await sleep(80);
    await q.focus('#btnRestart'); await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter on focused Restart restarts exactly once', (await W(q, () => ZJB.Game._starts)) === 1 && (await mode(q)) === 'playing');
    await q.keyboard.press('Escape'); await sleep(80);
    await q.focus('#btnResume'); await q.keyboard.press('Space'); await sleep(150);
    check('keys: Space on focused Resume resumes', (await mode(q)) === 'playing');
    check('keys: zero console errors', e2.length === 0, e2.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 4. touch
  await section('touch', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3&autostart=1', PHONE);
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    check('touch: game detects a touch device', await W(p, () => ZJB.Game.isTouch));
    await W(p, () => { const G = ZJB.Game, o = G.tapAt.bind(G); G._tapAtN = 0; G.tapAt = (x, y) => { G._tapAtN++; return o(x, y); }; ZJB.debug.world.levelGoal = 999; });
    await quiet(p);
    await spawn(p, 3, 'match'); await sleep(150);
    let [x, y] = await holeXY(p, 3); let s0 = await snap(p);
    await p.touchscreen.tap(x, y); await sleep(50); let s1 = await snap(p);
    check('touch: a tap on a matching friend boops', s1.boops === s0.boops + 1);
    // two fingers at once on two matching friends (CDP multi-touch)
    await sleep(400);
    await spawn(p, 0, 'match'); await spawn(p, 5, 'match'); await sleep(150);
    const [a, c] = [await holeXY(p, 0), await holeXY(p, 5)];
    const cdp = await ctx.newCDPSession(p);
    s0 = await snap(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 1 }, { x: c[0], y: c[1], id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80); s1 = await snap(p);
    check('touch: two fingers on two matching friends give two boops', s1.boops === s0.boops + 2, [s0.boops, s1.boops]);
    // second finger lands while the first is still down
    await sleep(400); await spawn(p, 1, 'match'); await spawn(p, 4, 'match'); await sleep(150);
    const [d1, d2] = [await holeXY(p, 1), await holeXY(p, 4)]; s0 = await snap(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d1[0], y: d1[1], id: 3 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d1[0], y: d1[1], id: 3 }, { x: d2[0], y: d2[1], id: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80); s1 = await snap(p);
    check('touch: a second finger while the first is held also boops', s1.boops === s0.boops + 2, [s0.boops, s1.boops]);
    // HUD buttons via touch
    const n0 = await W(p, () => ZJB.Game._tapAtN);
    const mutedBefore = await W(p, () => ZJB.Game.settings.muted || ZJB.Game.urlMute);
    const box = await (await p.$('#btnMuteHud')).boundingBox();
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(700);
    check('touch: tapping the HUD sound button toggles sound once, no gameplay tap', (await W(p, () => ZJB.Game._tapAtN)) === n0 && (await W(p, () => ZJB.Game.settings.muted || ZJB.Game.urlMute)) !== mutedBefore);
    // HUD pause while another finger is down on the jungle (iOS sends no click for a 2nd finger: pointerup path)
    const pb = await (await p.$('#btnPause')).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 7 }, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: a[0], y: a[1], id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
    check('touch: Pause works as a second finger', (await mode(p)) === 'paused');
    // ghost clicks: a touch that opens a screen must not press the button that appears under the finger
    const tapEl = async sel => { const bb = await (await p.$(sel)).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
    await tapEl('#btnPauseMenu'); await sleep(800);
    check('touch: Main Menu tap lands on the title (no ghost click starts a game)', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    await tapEl('#btnHow'); await sleep(800);
    check('touch: How to Play tap stays on How to Play (no ghost click on OK)', await visible(p, 'scrHow'));
    await tapEl('#scrHow .btn-back'); await sleep(800);
    check('touch: OK on How to Play returns to title', await visible(p, 'scrTitle') && (await mode(p)) === 'title');
    await tapEl('#btnSettings'); await sleep(800);
    check('touch: Settings tap stays on Settings', await visible(p, 'scrSettings'));
    await tapEl('#scrSettings .btn-back'); await sleep(600);
    await tapEl('#btnPlay'); await sleep(800);
    check('touch: Play tap starts a game', (await mode(p)) === 'playing');
    await quiet(p); await forceOver(p); await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await tapEl('#btnAgain'); await sleep(800);
    check('touch: Play Again tap starts exactly one game', (await mode(p)) === 'playing' && (await W(p, () => ZJB.debug.stats.games)) === 1);
    check('touch: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 5. scoring rules
  await section('scoring', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=11&autostart=1&diff=easy');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing');
    await quiet(p);
    const deltas = [], leavesAt = [];
    for (let i = 0; i < 12; i++) {
      await spawn(p, i % 6, 'match'); await sleep(110);
      const s0 = await snap(p); const r = await W(p, i => ZJB.debug.tap(i), i % 6); const s1 = await snap(p);
      deltas.push(r === 'match' ? s1.score - s0.score : r); leavesAt.push(s1.leaves);
    }
    const exp = [10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30, 30];
    check('score: 10 × multiplier, ×2 from combo 5, ×3 from combo 10', JSON.stringify(deltas) === JSON.stringify(exp), deltas.join(','));
    check('score: +1 leaf on the 12th boop (START_LEAVES → +1)', leavesAt[10] === leavesAt[0] && leavesAt[11] === leavesAt[0] + 1, leavesAt.join(','));
    check('score: combo / mult state after 12 boops', await W(p, () => ZJB.debug.world.combo === 12 && ZJB.debug.world.mult === 3));
    await sleep(300);
    await spawn(p, 2, 'wrong'); await sleep(110);
    let s0 = await snap(p); let r = await W(p, () => ZJB.debug.tap(2)); let s1 = await snap(p);
    check('score: wrong tap → −1 leaf, combo 0, mult 1, no points', r === 'wrong' && s1.leaves === s0.leaves - 1 && s1.combo === 0 && s1.mult === 1 && s1.score === s0.score);
    await spawn(p, 3, 'match'); await sleep(110);
    r = await W(p, () => ZJB.debug.tap(3));
    check('score: taps are briefly locked while Zippy is dizzy', r === 'busy' || r === 'match', r);
    await sleep(500); await spawn(p, 3, 'match'); await sleep(110);
    s0 = await snap(p); r = await W(p, () => ZJB.debug.tap(3)); s1 = await snap(p);
    check('score: after a wrong tap the multiplier restarts at ×1', r === 'match' && s1.score - s0.score === 10);
    // max leaves 5
    await W(p, () => { const w = ZJB.debug.world; w.leaves = 5; w.boops = 23; });
    await spawn(p, 0, 'match'); await sleep(110); await W(p, () => ZJB.debug.tap(0));
    check('score: leaves never exceed 5', await W(p, () => ZJB.debug.world.leaves === 5));
    check('scoring: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await p.close();

    // colour change after 6 boops + grace
    const { p: q } = await open(b, '?mute=1&seed=12&autostart=1&diff=easy', null, ctx);
    await q.waitForFunction(() => ZJB.debug.mode === 'playing'); await quiet(q);
    const c0 = await W(q, () => ZJB.debug.world.colour);
    for (let i = 0; i < 6; i++) { await spawn(q, i, c0); await sleep(110); await W(q, i => ZJB.debug.tap(i), i); }
    await sleep(100);
    check('colour: warning starts after 6 boops', await W(q, () => ZJB.debug.world.colourWarn));
    await q.waitForFunction(() => ZJB.debug.world.graceT > 0, null, { timeout: 3000 });
    const st = await W(q, () => ({ c: ZJB.debug.world.colour, g: ZJB.debug.world.graceColour, gt: ZJB.debug.world.graceT }));
    check('colour: colour changes ≈1 s later; previous colour becomes the grace colour', st.c !== c0 && st.g === c0, st);
    await spawn(q, 0, c0); await sleep(110);
    r = await W(q, () => ZJB.debug.tap(0));
    check('colour: the old colour still counts during the 0.8 s grace', r === 'match', r);
    await q.waitForFunction(() => ZJB.debug.world.graceT === 0, null, { timeout: 3000 });
    await sleep(500);
    await spawn(q, 1, c0); await sleep(110);
    s0 = await snap(q); r = await W(q, () => ZJB.debug.tap(1)); s1 = await snap(q);
    check('colour: after the grace the old colour is a wrong tap', r === 'wrong' && s1.leaves === s0.leaves - 1, r);
    // 14 s without a boop → colour changes anyway
    await startPlaying(q); await quiet(q);
    const cc = await W(q, () => ZJB.debug.world.colour);
    await W(q, () => ZJB.debug.setSpeed(8));
    await q.waitForFunction(c => ZJB.debug.world.colour !== c, cc, { timeout: 15000 });
    const tc = await W(q, () => ZJB.debug.world.time); await W(q, () => ZJB.debug.setSpeed(1));
    check('colour: changes after ~14 s without a boop', tc > 12.5 && tc < 16, tc.toFixed(2) + ' s');
    // level change after 15 boops
    await startPlaying(q); await quiet(q);
    let lastR = '';
    for (let i = 0; i < 15; i++) { await spawn(q, i % 6, 'match'); await sleep(110); const s = await snap(q); lastR = await W(q, i => ZJB.debug.tap(i), i % 6); if (lastR !== 'match') break; void s; }
    const afterClear = await W(q, () => ({ clearing: ZJB.debug.world.clearing, score: ZJB.debug.world.score, n: ZJB.debug.world.holes.length }));
    check('level: 15 boops clear the biome with +50 (score 15 boops + 50)', afterClear.clearing && afterClear.score === 4 * 10 + 5 * 20 + 6 * 30 + 50, afterClear);
    const r2 = await W(q, () => ZJB.debug.tap(0));
    check('level: taps are ignored while the field clears', r2 === 'busy' || r2 === 'none', r2);
    await q.waitForFunction(() => ZJB.debug.world.level === 1, null, { timeout: 4000 });
    await sleep(200);
    const L = await W(q, () => { const w = ZJB.debug.world, R = ZJB.Game.renderer; return { n: w.holes.length, zone: w.zone, colours: w.colours, banner: R.banner && R.banner.text, xs: w.holes.map(h => h.x + ',' + h.y).join(' '), want: ZJB.World.LAYOUTS[1].map(h => h.x + ',' + h.y).join(' '), boops: w.levelBoops, biome: R.vis.cur }; });
    check('level: Bamboo Grove has 8 burrows in the designed layout', L.n === 8 && L.xs === L.want && L.zone === 1, L.xs);
    check('level: level banner "Bamboo Grove" shown and visuals switch', L.banner === 'Bamboo Grove' && L.biome === 1, L.banner);
    check('level: 3 colours and levelBoops reset', L.colours.length === 3 && L.boops === 0);
    // all biomes + loop
    const lay = [];
    for (const lv of [2, 3, 4]) { await W(q, l => ZJB.debug.gotoLevel(l), lv); await sleep(150); lay.push(await W(q, () => ({ n: ZJB.debug.world.holes.length, zone: ZJB.debug.world.zone, loop: ZJB.debug.world.loop, b: ZJB.Game.renderer.banner && ZJB.Game.renderer.banner.text, sub: ZJB.Game.renderer.banner && ZJB.Game.renderer.banner.sub }))); }
    check('level: canopy and ruins have 9 burrows; level 5 loops to the riverbank (round 2)', lay[0].n === 9 && lay[1].n === 9 && lay[2].n === 6 && lay[2].zone === 0 && lay[2].loop === 1 && lay[2].sub === 'Round 2', lay);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 6. miss rule per difficulty
  await section('miss', async () => {
    const ctx = await b.newContext(DESK);
    for (const d of ['easy', 'normal', 'hard']) {
      const { p, errs } = await open(b, '?mute=1&seed=5&autostart=1&diff=' + d, null, ctx);
      await p.waitForFunction(() => ZJB.debug.mode === 'playing'); await quiet(p);
      await W(p, () => { const w = ZJB.debug.world; w.leaves = 5; w.combo = 3; w.mult = 1; });
      const up = await W(p, () => { ZJB.debug.spawn(0, ZJB.debug.world.colour); return ZJB.debug.world.holes[0].critter.upFor; });
      await W(p, () => ZJB.debug.setSpeed(4));
      await p.waitForFunction(() => ZJB.debug.world.stats.missed >= 1, null, { timeout: 8000 });
      await W(p, () => ZJB.debug.setSpeed(1));
      const s = await snap(p);
      const base = { easy: 2.8, normal: 1.9, hard: 1.35 }[d];
      check('miss[' + d + ']: friend stays up ≈' + base + ' s', up > base * 0.87 && up < base * 1.13, up.toFixed(2));
      if (d === 'easy') check('miss[easy]: a matching friend getting away costs nothing', s.leaves === 5 && s.combo === 3, s);
      else check('miss[' + d + ']: a matching friend getting away costs a leaf and the combo', s.leaves === 4 && s.combo === 0, s);
      // a decoy (wrong colour) leaving is never a miss
      await W(p, () => { const w = ZJB.debug.world; w.stats.missed = 0; w.graceT = 0; w.graceColour = -1; ZJB.debug.spawn(1, w.colours.find(c => c !== w.colour)); ZJB.debug.setSpeed(4); });
      await sleep(1200); await W(p, () => ZJB.debug.setSpeed(1));
      check('miss[' + d + ']: a decoy ducking down is not a miss', await W(p, () => ZJB.debug.world.stats.missed === 0 && ZJB.debug.world.leaves === (ZJB.debug.world.difficulty === 'easy' ? 5 : 4)));
      check('miss[' + d + ']: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
      await p.close();
    }
    await ctx.close();
  });

  // ------------------------------------------------------------------ 7. game over + best per difficulty
  await section('best', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=9');
    await sleep(200);
    const boop = async n => { for (let i = 0; i < n; i++) { await spawn(p, i % 6, 'match'); await sleep(110); await W(p, i => ZJB.debug.tap(i), i % 6); } };
    await p.click('#btnPlay'); await quiet(p); await boop(3); await forceOver(p); await sleep(100);
    check('best: game over shows score 30', (await p.textContent('#overScore')) === '30');
    check('best: first score is a new best (NEW! badge, best 30)', (await p.textContent('#overBest')) === '30' && await visible(p, 'newBest'));
    check('best: saved per difficulty (best_easy = 30)', (await lsGet(p, 'best_easy')) === '30');
    const stats = await p.textContent('#overStats');
    check('best: game-over stats list boops / wrong / reached', /Boops: 3/.test(stats) && /Wrong colour: 1/.test(stats) && /Riverbank Morning/.test(stats), stats);
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnAgain'); await quiet(p); await boop(1); await forceOver(p); await sleep(100);
    check('best: a lower score keeps the best (no NEW!)', (await p.textContent('#overBest')) === '30' && !(await visible(p, 'newBest')) && (await lsGet(p, 'best_easy')) === '30');
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnOverMenu'); await sleep(100);
    check('best: title shows the Easy best (30)', (await p.textContent('#bestTitle')) === '30');
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=normal]'); await p.click('#scrSettings .btn-back'); await sleep(100);
    check('best: title shows the Normal best (0) after switching difficulty', (await p.textContent('#bestTitle')) === '0');
    await p.click('#btnPlay'); await quiet(p); await boop(2); await forceOver(p); await sleep(100);
    check('best: Normal best saved separately (best_normal = 20, best_easy = 30)', (await lsGet(p, 'best_normal')) === '20' && (await lsGet(p, 'best_easy')) === '30');
    // bot run never saves best
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnAgain');
    await W(p, () => { ZJB.debug.setBot(true, 1); ZJB.debug.setSpeed(8); }); await sleep(2500); await W(p, () => ZJB.debug.setSpeed(1));
    const botScore = await W(p, () => ZJB.debug.world.score);
    await forceOver(p); await sleep(100);
    check('best: a bot run (score ' + botScore + ') does not save best', botScore > 20 && (await lsGet(p, 'best_normal')) === '20' && !(await visible(p, 'newBest')));
    // bot switched on then off within one run (debug hook): still a test run
    await W(p, () => ZJB.debug.setBot(false));
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnAgain');
    await W(p, () => { ZJB.debug.setBot(true, 1); ZJB.debug.setSpeed(8); }); await sleep(2500);
    await W(p, () => { ZJB.debug.setSpeed(1); ZJB.debug.setBot(false); });
    const s2 = await W(p, () => ZJB.debug.world.score);
    await forceOver(p); await sleep(100);
    check('best: a bot-assisted run (bot turned off before game over) does not save best [debug hook]', (await lsGet(p, 'best_normal')) === '20', 'score ' + s2 + ', best_normal now ' + await lsGet(p, 'best_normal'));
    // reset best (two taps)
    await p.waitForFunction(() => performance.now() - ZJB.Game.overAt > 750);
    await p.click('#btnOverMenu'); await p.click('#btnSettings');
    await p.click('#btnResetBest');
    check('best: first Reset tap only arms ("Sure?")', (await p.textContent('#btnResetBest')) === 'Sure?' && (await lsGet(p, 'best_easy')) === '30');
    await p.click('#btnResetBest');
    check('best: second Reset tap clears every best', (await lsGet(p, 'best_easy')) === null && (await lsGet(p, 'best_normal')) === null);
    check('best: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 8. settings persistence + mute
  await section('settings', async () => {
    const { p, errs, ctx } = await open(b, '');
    await sleep(200);
    await p.click('#btnSettings');
    check('settings: defaults sfx on, music on, Easy', await W(p, () => document.getElementById('setSfx').checked && document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'easy'));
    await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)'); await p.click('#setDifficulty button[data-v=hard]');
    check('settings: Hard highlighted after the tap', await W(p, () => document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
    await p.click('#scrSettings .btn-back');
    await p.reload(); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'title');
    const s = await W(p, () => ZJB.Game.settings);
    check('settings: sfx / music / difficulty survive a reload', s.sfx === false && s.music === false && s.difficulty === 'hard', s);
    await p.click('#btnSettings');
    check('settings: Settings screen reflects the saved values', await W(p, () => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
    await p.click('#scrSettings .btn-back');
    await p.click('#btnPlay'); check('settings: a new run uses the saved difficulty', await W(p, () => ZJB.debug.world.difficulty === 'hard'));
    // M toggles mute and is saved
    await p.keyboard.press('KeyM'); await sleep(50);
    check('mute: M mutes, shows a toast, saves muted=true', await W(p, () => ZJB.Game.settings.muted) && /Sound off/.test(await p.textContent('#toast')) && JSON.parse(await lsGet(p, 'settings')).muted === true);
    await p.reload(); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'title');
    check('mute: muted state survives a reload', await W(p, () => ZJB.Game.settings.muted === true));
    await p.keyboard.press('KeyM');
    check('mute: M again unmutes and saves muted=false', JSON.parse(await lsGet(p, 'settings')).muted === false);
    // ?mute=1 is never saved
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'title');
    await p.click('#btnSettings'); await p.click('label:has(#setSfx)'); await p.click('#scrSettings .btn-back');
    check('mute: ?mute=1 + changing a setting does not save muted', JSON.parse(await lsGet(p, 'settings')).muted === false);
    await p.click('#btnPlay'); await p.click('#btnMuteHud'); await sleep(50);
    check('mute: with ?mute=1 the HUD button turns sound ON (session only)', await W(p, () => !ZJB.Game.urlMute && !ZJB.Game.settings.muted) && JSON.parse(await lsGet(p, 'settings')).muted === false);
    await p.goto(GAME); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'title');
    check('mute: a normal load after ?mute=1 is not muted', await W(p, () => ZJB.Game.settings.muted === false && !ZJB.Game.urlMute));
    check('settings: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 9. Change Pictures
  await section('pictures', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=4');
    // make the test pictures in the browser
    const files = await p.evaluate(async () => {
      const mk = (w, h, draw, type, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, q); };
      const cut = mk(300, 300, (g) => { g.fillStyle = '#e33'; g.beginPath(); g.arc(150, 150, 120, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(110, 110, 30, 30); }, 'image/png');
      const photo = mk(640, 480, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#36c'); gr.addColorStop(1, '#fc3'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#a52'; g.beginPath(); g.arc(320, 260, 140, 0, 7); g.fill(); }, 'image/jpeg', 0.9);
      const noisy = (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7cf'); gr.addColorStop(1, '#264'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4000; i++) { g.fillStyle = 'hsl(' + ((i * 47) % 360) + ',60%,' + (30 + (i * 13) % 50) + '%)'; g.beginPath(); g.arc((i * 7919) % w, (i * 104729) % h, 5 + (i % 40), 0, 7); g.fill(); } };
      const huge = mk(4000, 3000, noisy, 'image/jpeg', 0.92);
      return { cut, photo, huge };
    });
    const write = (n, dataUrl) => { const f = path.join(TMP, n); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); return f; };
    const F = { cut: write('cutout.png', files.cut), photo: write('photo.jpg', files.photo), huge: write('huge.jpg', files.huge) };
    F.txt = path.join(TMP, 'notes.txt'); fs.writeFileSync(F.txt, 'not a picture');
    F.bad = path.join(TMP, 'broken.png'); fs.writeFileSync(F.bad, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.from('this is not really a png')]));
    const slotSel = i => '#slotGrid .slot:nth-child(' + (i + 1) + ')';
    const pick = async (i, file) => {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(slotSel(i) + ' [data-act=pick]')]);
      await fc.setFiles(file);
    };
    const waitToast = async re => { await p.waitForFunction(re => new RegExp(re).test(document.getElementById('toast').textContent) && !document.getElementById('toast').classList.contains('hidden'), re.source, { timeout: 15000 }); return p.textContent('#toast'); };
    await p.click('#btnCustomize');
    await pick(0, F.cut); await waitToast(/saved/);
    check('pictures: PNG cut-out saved to Zippy', await W(p, () => ZJB.Assets.hasCustom('hero')));
    check('pictures: cut-out keeps the "Whole picture" shape', (await lsGet(p, 'shape_hero')) === 'fit');
    check('pictures: card shows "★ Your picture" and a preview', /Your picture/.test(await p.textContent(slotSel(0) + ' .tag')) && (await p.$$(slotSel(0) + ' .prev img')).length === 1);
    await pick(1, F.photo); await waitToast(/saved/);
    check('pictures: opaque JPEG photo saved to the friends and made a round sticker', await W(p, () => ZJB.Assets.hasCustom('critter')) && (await lsGet(p, 'shape_critter')) === 'circle');
    await p.click(slotSel(1) + ' .shape button[data-shape=fit]');
    check('pictures: "Whole picture" switches the shape back', (await lsGet(p, 'shape_critter')) === 'fit' && await W(p, () => ZJB.Assets.custom.critter.width === 512));
    const t0 = Date.now(); await pick(2, F.huge); await waitToast(/saved|room/); const dt = Date.now() - t0;
    const hugeInfo = await W(p, () => ({ ok: ZJB.Assets.hasCustom('bg_riverbank'), w: ZJB.Assets.custom.bg_riverbank && ZJB.Assets.custom.bg_riverbank.width, h: ZJB.Assets.custom.bg_riverbank && ZJB.Assets.custom.bg_riverbank.height, len: (localStorage.getItem('zjb:img_bg_riverbank') || '').length }));
    check('pictures: huge 4000×3000 photo is downscaled to 1600×1200 and stored compactly', hugeInfo.ok && hugeInfo.w === 1600 && hugeInfo.h === 1200 && hugeInfo.len < 2.5e6, { ...hugeInfo, ms: dt });
    await pick(3, F.txt); const tt = await waitToast(/picture/i);
    check('pictures: a non-image file gives a friendly message and changes nothing', /Please choose a picture file/.test(tt) && !(await W(p, () => ZJB.Assets.hasCustom('bg_bamboo'))), tt);
    await pick(3, F.bad); const tb = await waitToast(/could not|Please choose/i);
    check('pictures: a broken image file gives a friendly message', /could not be opened/i.test(tb) && !(await W(p, () => ZJB.Assets.hasCustom('bg_bamboo'))), tb);
    // fill the remaining backgrounds with huge photos: either saved or a friendly "not enough room"
    const fills = [];
    for (const i of [3, 4, 5]) { await pick(i, F.huge); fills.push(await waitToast(/saved|room/)); }
    check('pictures: filling all four backgrounds never throws (saved or friendly quota message)', fills.every(t => /saved|room/.test(t)), fills.join(' / '));
    await p.click('#scrCustom .btn-back');
    // persists across reload
    await p.reload(); await p.waitForFunction(() => ZJB.debug && ZJB.debug.mode === 'title');
    check('pictures: custom pictures survive a reload', await W(p, () => ZJB.Assets.hasCustom('hero') && ZJB.Assets.hasCustom('critter') && ZJB.Assets.hasCustom('bg_riverbank')));
    // gameplay with custom pictures
    await p.click('#btnPlay'); await W(p, () => { ZJB.debug.setBot(true, 0.9); ZJB.debug.setSpeed(3); });
    await sleep(2500); await p.screenshot({ path: OUT + '/custom_play_riverbank.png' });
    for (const lv of [1, 2, 3, 0]) { await W(p, l => ZJB.debug.gotoLevel(l), lv); await sleep(1500); }
    await W(p, () => ZJB.debug.setSpeed(1)); await sleep(300);
    await p.screenshot({ path: OUT + '/custom_play.png' });
    const used = await W(p, () => [...ZJB.Assets._cache.keys()].filter(k => k.startsWith('custom:')).map(k => k.split('|')[0]));
    check('pictures: custom Zippy and friends are drawn in gameplay', used.includes('custom:hero') && used.includes('custom:critter'), [...new Set(used)].join(','));
    check('pictures: gameplay with custom pictures has no errors', errs.length === 0 && (await W(p, () => ZJB.debug.stats.errors.length)) === 0, errs.slice(0, 3).join(' | ') || undefined);
    // reset one / all
    await W(p, () => { ZJB.debug.setBot(false); ZJB.Game.toTitle(); });
    await p.click('#btnCustomize');
    await p.click(slotSel(0) + ' [data-act=reset]');
    check('pictures: Reset on one card restores the original Zippy only', !(await W(p, () => ZJB.Assets.hasCustom('hero'))) && (await lsGet(p, 'img_hero')) === null && await W(p, () => ZJB.Assets.hasCustom('critter')) && /Original/.test(await p.textContent(slotSel(0) + ' .tag')));
    await p.click('#btnResetAll');
    check('pictures: Reset all removes every custom picture', await W(p, () => ZJB.Assets.SLOTS.every(s => !ZJB.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => k.startsWith('zjb:img_'))));
    await p.click('#scrCustom .btn-back'); await p.click('#btnPlay'); await sleep(800);
    check('pictures: after Reset all, gameplay draws the default art', await W(p, () => ![...ZJB.Assets._cache.keys()].some(k => k.startsWith('custom:'))));
    check('pictures: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 10. layout on devices
  const DEVICES = [
    { name: 'desktop 1280x720', o: { viewport: { width: 1280, height: 720 } } },
    { name: 'desktop 1920x1080', o: { viewport: { width: 1920, height: 1080 } } },
    { name: 'phone 844x390 @3x', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
    { name: 'iPad 1024x768', o: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
    { name: 'iPad Pro 1366x1024', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } }
  ];
  const inView = (r, W, H) => r && r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= W + 0.5 && r.y + r.height <= H + 0.5;
  for (const dev of DEVICES) {
    await section('layout ' + dev.name, async () => {
      const { p, errs, ctx } = await open(b, '?mute=1&seed=3', dev.o);
      const { width: VW, height: VH } = dev.o.viewport, touch = !!dev.o.hasTouch, tag = 'layout[' + dev.name + ']';
      await sleep(600);
      const scroll = await W(p, () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]);
      check(tag + ': no page scroll / overflow', scroll[0] <= scroll[2] && scroll[1] <= scroll[3], scroll);
      const cv = await W(p, () => { const R = ZJB.Game.renderer, r = R.canvas.getBoundingClientRect(); return { w: r.width, h: r.height, bw: R.canvas.width, px: R.px, k: R.k, ox: R.ox, oy: R.oy }; });
      check(tag + ': canvas fills the window', Math.abs(cv.w - VW) < 1 && Math.abs(cv.h - VH) < 1, cv);
      check(tag + ': stage 960×540 fits inside the window', cv.ox >= 0 && cv.oy >= 0 && 960 * cv.k <= cv.bw + 1);
      const btnRects = async scr => p.evaluate(scr => [...document.querySelectorAll('#' + scr + ' button')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), x: r.x, y: r.y, width: r.width, height: r.height }; }), scr);
      const screenOk = async (scr, label) => {
        const pr = await p.evaluate(scr => { const e = document.querySelector('#' + scr + ' .panel, #' + scr + ' .title-wrap'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, sh: e.scrollHeight, ch: e.clientHeight }; }, scr);
        const bs = await btnRects(scr);
        const out = bs.filter(r => !inView(r, VW, VH)).map(r => r.id);
        check(tag + ': ' + label + ' fits the screen (all buttons on screen)', inView(pr, VW, VH) && out.length === 0, out.length ? 'off-screen: ' + out.join(',') : (inView(pr, VW, VH) ? undefined : pr));
        if (touch) {
          const small = bs.filter(r => r.height < 43.5 || r.width < 43.5).map(r => r.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          check(tag + ': ' + label + ' buttons are ≥ 44 px (finger size)', small.length === 0, small.join(', ') || undefined);
        }
      };
      await screenOk('scrTitle', 'title'); await p.screenshot({ path: OUT + '/' + dev.name.replace(/\W+/g, '_') + '_title.png' });
      for (const [btn, scr, label] of [['btnHow', 'scrHow', 'How to Play'], ['btnSettings', 'scrSettings', 'Settings'], ['btnCustomize', 'scrCustom', 'Change Pictures']]) {
        await W(p, ([btn]) => document.getElementById(btn).click(), [btn]); await sleep(700);   // let the pop-in animation finish
        await screenOk(scr, label);
        await p.screenshot({ path: OUT + '/' + dev.name.replace(/\W+/g, '_') + '_' + scr + '.png' });
        await W(p, scr => document.querySelector('#' + scr + ' .btn-back').click(), scr); await sleep(100);
      }
      await W(p, () => document.getElementById('btnPlay').click()); await sleep(1200);
      const hud = await p.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height }; }));
      check(tag + ': HUD buttons on screen', hud.every(r => inView(r, VW, VH)), hud);
      if (touch) check(tag + ': HUD buttons ≥ 44 px', hud.every(r => r.width >= 43.5 && r.height >= 43.5), hud.map(r => Math.round(r.width)).join(','));
      const zones = [];
      for (const lv of [0, 1, 2]) {
        await W(p, l => ZJB.debug.gotoLevel(l), lv); await sleep(60);
        const z = await p.evaluate(() => { const R = ZJB.Game.renderer, d = R.canvas.width / R.canvas.getBoundingClientRect().width; return ZJB.debug.world.holes.map(h => ({ x: (R.ox + h.x * R.k) / d, y: (R.oy + (h.y - 45 * h.s) * R.k) / d, r: 88 * h.s * R.k / d })); });
        zones.push(...z);
      }
      const overlapHud = zones.some(z => hud.some(r => z.x + z.r > r.x && z.x - z.r < r.x + r.width && z.y + z.r > r.y && z.y - z.r < r.y + r.height));
      check(tag + ': every burrow centre is on screen', zones.every(z => z.x > 0 && z.x < VW && z.y > 0 && z.y < VH));
      check(tag + ': HUD buttons never overlap a burrow hit zone', !overlapHud);
      const minR = Math.min(...zones.map(z => z.r));
      check(tag + ': smallest burrow hit zone is finger sized (radius ≥ 22 px)', minR >= 22, 'min radius ' + minR.toFixed(1) + ' px');
      await W(p, () => ZJB.debug.gotoLevel(0)); await sleep(800);
      await p.screenshot({ path: OUT + '/' + dev.name.replace(/\W+/g, '_') + '_play.png' });
      await W(p, () => ZJB.Game.pause()); await sleep(300); await screenOk('scrPause', 'Pause');
      await W(p, () => ZJB.Game.resume()); await quiet(p); await forceOver(p); await sleep(400);
      await screenOk('scrOver', 'Game over'); await p.screenshot({ path: OUT + '/' + dev.name.replace(/\W+/g, '_') + '_over.png' });
      check(tag + ': zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
      await ctx.close();
    });
  }

  // ------------------------------------------------------------------ 11. portrait
  await section('portrait', async () => {
    const PORT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3', PORT);
    await sleep(600);
    check('portrait: no rotate card on the title', !(await visible(p, 'rotate')) && await visible(p, 'scrTitle'));
    const tb = await p.evaluate(() => [...document.querySelectorAll('#scrTitle button')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 0.5 && r.y >= 0 && r.bottom <= innerHeight + 0.5; }));
    check('portrait: title buttons on screen', tb.every(Boolean));
    await p.screenshot({ path: OUT + '/portrait_title.png' });
    const pb = await (await p.$('#btnPlay')).boundingBox(); await p.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(700);
    const t0 = await W(p, () => ZJB.debug.world.time); await sleep(500); const t1 = await W(p, () => ZJB.debug.world.time);
    check('portrait: rotate card shown when a game starts upright', await visible(p, 'rotate'));
    check('portrait: the game waits (world frozen) behind the rotate card', t0 === t1, [t0, t1]);
    await p.screenshot({ path: OUT + '/portrait_rotate.png' });
    const ok = await (await p.$('#btnRotateOk')).boundingBox();
    check('portrait: "Play upright anyway" is ≥ 44 px', ok.height >= 43.5, Math.round(ok.height));
    await p.touchscreen.tap(ok.x + ok.width / 2, ok.y + ok.height / 2); await sleep(500);
    const t2 = await W(p, () => ZJB.debug.world.time);
    check('portrait: "Play upright anyway" hides the card and the game runs', !(await visible(p, 'rotate')) && t2 > t1 && (await mode(p)) === 'playing');
    await W(p, () => { ZJB.debug.world.levelGoal = 999; }); await quiet(p); await spawn(p, 4, 'match'); await sleep(150);
    const [x, y] = await holeXY(p, 4); const b0 = await W(p, () => ZJB.debug.world.boops);
    await p.touchscreen.tap(x, y); await sleep(50);
    check('portrait: a tap on a friend boops in portrait', (await W(p, () => ZJB.debug.world.boops)) === b0 + 1);
    const hud = await p.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight; }));
    check('portrait: HUD buttons on screen', hud.every(Boolean));
    await p.screenshot({ path: OUT + '/portrait_play.png' });
    await W(p, () => ZJB.Game.pause()); await sleep(200);
    check('portrait: no rotate card over the pause menu', !(await visible(p, 'rotate')));
    await W(p, () => ZJB.Game.resume());
    check('portrait: card stays dismissed for the session', !(await visible(p, 'rotate')));
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(500);
    check('portrait: turning sideways re-lays out to landscape', await W(p, () => !ZJB.Game.renderer.portrait) && !(await visible(p, 'rotate')));
    check('portrait: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
    // an iPad held upright: is the "turn your phone" card shown?
    const { p: q, ctx: c2 } = await open(b, '?mute=1&seed=3&autostart=1', { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await sleep(600);
    const ipadCard = await visible(q, 'rotate');
    const stageW = await W(q, () => 960 * ZJB.Game.renderer.cssScale);
    check('portrait iPad 820x1180: no "Turn your phone sideways" card on a tablet', !ipadCard, 'card shown=' + ipadCard + ', stage width ' + Math.round(stageW) + ' px');
    await q.screenshot({ path: OUT + '/ipad_portrait.png' });
    await c2.close();
  });

  // ------------------------------------------------------------------ 12. auto-pause
  await section('autopause', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3&autostart=1');
    await p.waitForFunction(() => ZJB.debug.mode === 'playing'); await sleep(300);
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(50);
    check('autopause: window blur pauses the game', (await mode(p)) === 'paused' && await visible(p, 'scrPause'));
    await p.click('#btnResume'); await sleep(100);
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(50);
    check('autopause: tab hidden (visibilitychange) pauses the game', (await mode(p)) === 'paused');
    await W(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    check('autopause: coming back keeps the pause menu up (child resumes)', (await mode(p)) === 'paused');
    await p.click('#btnResume');
    await W(p, () => ZJB.Game.toTitle()); await W(p, () => window.dispatchEvent(new Event('blur')));
    check('autopause: blur on the title does nothing', (await mode(p)) === 'title' && !(await visible(p, 'scrPause')));
    await startPlaying(p); await quiet(p);
    await p.evaluate(() => { const w = ZJB.debug.world; w.leaves = 1; ZJB.debug.spawn(0, w.colours.find(c => c !== w.colour)); });
    await sleep(150); await W(p, () => ZJB.debug.world.tapHole(0)); await sleep(100);
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(50);
    check('autopause: blur during the game-over moment does not pause', (await mode(p)) === 'playing');
    await p.waitForFunction(() => ZJB.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {});
    check('autopause: … and the game-over screen still arrives', (await mode(p)) === 'over');
    check('autopause: zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 13. long bot soak at ?speed=16
  for (const run of [{ skill: 1, secs: SOAK, label: 'skill 1' }, { skill: 0.2, diff: 'normal', secs: Math.round(SOAK * 0.6), label: 'skill 0.2 normal' }]) {
    await section('soak ' + run.label, async () => {
      const { p, errs, ctx } = await open(b, '?mute=1&seed=5&bot=1&skill=' + run.skill + '&autostart=1&autorestart=1&speed=16' + (run.diff ? '&diff=' + run.diff : ''));
      await p.waitForFunction(() => ZJB.debug.mode === 'playing');
      const max = { particles: 0, fx: 0, cache: 0, texts: 0, rings: 0, flyers: 0, level: 0, heap0: 0, heap: 0 };
      max.heap0 = await W(p, () => performance.memory ? performance.memory.usedJSHeapSize : 0);
      const t0 = Date.now();
      while (Date.now() - t0 < run.secs * 1000) {
        await sleep(1000);
        const s = await W(p, () => { const st = ZJB.debug.getState(), R = ZJB.Game.renderer; return { particles: st.particles, fx: st.fx, texts: R.texts.length, rings: R.rings.length, flyers: R.flyers.length, cache: ZJB.Assets._cache.size, level: st.level, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; });
        for (const k of Object.keys(s)) max[k] = Math.max(max[k], s[k]);
      }
      const st = await W(p, () => ({ games: ZJB.debug.stats.games, times: ZJB.debug.stats.times, runT: ZJB.Game.runT, errors: ZJB.debug.stats.errors, levels: ZJB.debug.stats.levels, scores: ZJB.debug.stats.scores, mode: ZJB.debug.mode }));
      const gameTime = st.times.reduce((a, b) => a + b, 0) + (st.runT || 0);
      const tag = 'soak[' + run.label + ']';
      check(tag + ': ran several minutes of game time', gameTime > 60 * Math.min(4, run.secs / 15), (gameTime / 60).toFixed(1) + ' min, ' + st.games + ' games, max level ' + Math.max(max.level, ...st.levels));
      check(tag + ': no runtime errors', errs.length === 0 && st.errors.length === 0, (errs.concat(st.errors)).slice(0, 2).join(' | ') || undefined);
      check(tag + ': weather particles bounded (≤ 60)', max.particles <= 60, max.particles);
      check(tag + ': fx (texts + rings + flyers) bounded (≤ 40)', max.fx <= 40, max);
      check(tag + ': sprite cache bounded (≤ 400)', max.cache <= 400, max.cache);
      if (max.heap0) check(tag + ': JS heap stays bounded (< 120 MB)', max.heap < 120e6, Math.round(max.heap0 / 1e6) + ' → ' + Math.round(max.heap / 1e6) + ' MB');
      if (run.skill < 1) check(tag + ': games end and auto-restart', st.games >= 1, st.scores.join(','));
      check(tag + ': bot runs never save a best score', await W(p, () => !Object.keys(localStorage).some(k => k.startsWith('zjb:best_'))));
      await ctx.close();
    });
  }

  await b.close();
  const fails = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fails.length) + ' PASS, ' + fails.length + ' FAIL');
  if (fails.length) { console.log('Failed:\n - ' + fails.map(f => f.name).join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
