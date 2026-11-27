// Functional QA for Pip's Oasis Glow (firefly / golden firefly / napping friends).
// Prints PASS/FAIL per check and exits non-zero on any failure.
//   node tests/e2e/functional.js            (full run, ~7 min)
//   SOAK=20 node tests/e2e/functional.js    (shorter bot soak: seconds of real time per soak run)
//   ONLY=scoring,best node tests/e2e/functional.js   (run some sections only)
// Screenshots go to tests/out/functional/ (gitignored).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pog-func-'));
const SOAK = +(process.env.SOAK || 75);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']' : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DESK = { viewport: { width: 1280, height: 720 } };
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

async function open(browser, query, ctxOpts, ctx, insets) {
  ctx = ctx || await browser.newContext(ctxOpts || DESK);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  if (insets) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setSafeAreaInsetsOverride', { insets }); }
  await p.goto(GAME + (query || ''));
  await p.waitForFunction(() => window.POG && POG.debug && POG.debug.mode && POG.debug.mode !== 'boot', null, { timeout: 15000 });
  return { p, errs, ctx };
}
const mode = p => p.evaluate(() => POG.debug.mode);
const W = (p, f, a) => p.evaluate(f, a);
// screen (CSS px) position of hole i's hit-zone centre
const holeXY = (p, i) => p.evaluate(i => {
  const R = POG.Game.renderer, h = POG.debug.world.holes[i], r = R.canvas.getBoundingClientRect(), d = R.canvas.width / r.width;
  return [r.left + (R.ox + h.x * R.k) / d, r.top + (R.oy + (h.y - 45 * h.s) * R.k) / d];
}, i);
// no natural pops: the test places every friend itself
const quiet = p => p.evaluate(() => { const w = POG.debug.world; w._spawn = () => -1; w.holes.forEach(h => { h.critter = null; }); });
// put a friend of `type` ('firefly' | 'gold' | 'sleepy') into burrow i; Pip is made ready (not dizzy / napping)
const spawn = (p, i, type) => p.evaluate(([i, type]) => { POG.debug.spawn(i, type); return type; }, [i, type]);
const ready = p => p.evaluate(() => { const w = POG.debug.world; w.napT = 0; if (w.pip.state === 'dizzy') w.pip.t = 9; w._empties.length = 0; });
const snap = p => p.evaluate(() => { const w = POG.debug.world; return { score: w.score, leaves: w.leaves, combo: w.combo, mult: w.mult, boops: w.boops, golds: w.golds, level: w.level, mode: POG.debug.mode }; });
// log every world event the controller sees
const hookEvents = p => p.evaluate(() => {
  const G = POG.Game; window._evlog = [];
  if (G._evHooked) return; G._evHooked = 1;
  const o = G.handleEvents.bind(G);
  G.handleEvents = evts => { for (const e of evts) window._evlog.push({ type: e.type, n: e.n, critterType: e.critterType, gold: e.gold, points: e.points, mult: e.mult, zone: e.zone, bonus: e.bonus }); return o(evts); };
});
// debug.gotoLevel, but only once Pip is not mid-hop (a hop in flight into a smaller chapter crashes: see the dedicated check)
const safeGoto = (p, l) => p.waitForFunction(l => { const w = POG.debug.world; if (w._fl && w._fl.kind === 'hop') return false; POG.debug.gotoLevel(l); return true; }, l, { timeout: 5000 });
const evlog = p => p.evaluate(() => window._evlog || []);
async function startPlaying(p) {
  await p.evaluate(() => POG.debug.startGame());
  await p.waitForFunction(() => POG.debug.mode === 'playing');
}
async function forceOver(p) {
  await p.evaluate(() => { const w = POG.debug.world; w.clearing = false; w.napT = 0; w.leaves = 1; w.pip.state = 'home'; w.pip.t = 0; w._empties.length = 0; w.holes[0].critter = null; w.debugSpawn(0, 'sleepy'); });
  await sleep(150);
  const r = await p.evaluate(() => POG.debug.world.tapHole(0));
  if (r !== 'wrong') throw new Error('forceOver: tap on a napper answered ' + r);
  await p.waitForFunction(() => POG.debug.mode === 'over', null, { timeout: 6000 });
}
const visible = (p, id) => p.evaluate(id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const lsGet = (p, k) => p.evaluate(k => localStorage.getItem('pog:' + k), k);
const waitLock = p => p.waitForFunction(() => performance.now() - POG.Game.overAt > 750);
async function section(name, fn) {
  if (ONLY && !ONLY.some(o => name.startsWith(o))) return;
  try { await fn(); } catch (e) { check(name + ': section ran without exceptions', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}
const noErr = (tag, errs) => check(tag + ': zero console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || undefined);

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--enable-precise-memory-info'] });

  // ------------------------------------------------------------------ 1. boot
  await section('boot', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=7');
    await sleep(3000);
    check('boot: reaches the title screen', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    check('boot: HUD hidden on the title', !(await visible(p, 'hud')));
    check('boot: title bot demo is playing (world time advances)', await W(p, () => POG.debug.world.time > 1));
    check('boot: best score shown as 0 on first run', (await p.textContent('#bestTitle')) === '0');
    check('boot: default difficulty is Easy', await W(p, () => POG.Game.settings.difficulty === 'easy'));
    check('boot: debug hooks exist (DESIGN §6)', await W(p, () => ['getState', 'setSpeed', 'startGame', 'tap', 'tapAt', 'setBot', 'setAutoRestart', 'gotoLevel', 'spawn'].every(k => typeof POG.debug[k] === 'function') && !!POG.debug.world && !!POG.debug.weather && !!POG.debug.stats));
    check('boot: 4 chapters named in the world', await W(p, () => JSON.stringify(POG.World.BIOMES) === '["spring","palms","dunes","night"]' && POG.World.BIOME_NAMES[3] === 'The Starlit Oasis'));
    check('boot: number keys do nothing on the title (bot demo)', await W(p, () => POG.Game.tapHole(0) === 'none'));
    const art = await W(p, () => Object.keys(POG.Assets.files).filter(k => !/^(palms|dunes|night)_/.test(k) && !POG.Assets.img[k]));
    check('boot: every first-screen art file loaded', art.length === 0, art.join(',') || undefined);
    await p.waitForFunction(() => POG.Assets.restDone, null, { timeout: 15000 }).catch(() => {});
    const art2 = await W(p, () => Object.keys(POG.Assets.files).filter(k => !POG.Assets.img[k]));
    check('boot: later chapters\' art streams in (all files loaded)', art2.length === 0, art2.join(',') || undefined);
    noErr('boot', errs);
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
    await p.click('#btnSettings'); await p.keyboard.press('Escape'); check('menu: Esc closes Settings', await visible(p, 'scrTitle'));
    await p.click('#btnCustomize'); check('menu: Change Pictures opens with 6 cards', await visible(p, 'scrCustom') && (await p.$$('#slotGrid .slot')).length === 6);
    const names = await p.$$eval('#slotGrid .slot h3', hs => hs.map(h => h.textContent));
    check('menu: picture cards are Pip, friends and the 4 chapters', names.join('|') === 'Pip|Desert friends|The Morning Spring|The Palm Grove|The Sunset Dunes|The Starlit Oasis', names.join('|'));
    await backIn('scrCustom'); check('menu: Change Pictures Done returns to title', await visible(p, 'scrTitle'));
    await p.click('#btnCustomize'); await p.keyboard.press('Escape'); check('menu: Esc closes Change Pictures', await visible(p, 'scrTitle'));
    check('menu: Quit hidden in the browser', !(await visible(p, 'btnQuit')));
    await p.click('#btnPlay'); await sleep(100);
    check('menu: Play starts a game (HUD shown, screens hidden)', (await mode(p)) === 'playing' && await visible(p, 'hud') && !(await visible(p, 'scrTitle')));
    await sleep(300);
    await p.click('#btnPause'); await sleep(50);
    const t0 = await W(p, () => POG.debug.world.time); await sleep(400); const t1 = await W(p, () => POG.debug.world.time);
    check('menu: Pause button pauses (world frozen, HUD hidden)', (await mode(p)) === 'paused' && await visible(p, 'scrPause') && t0 === t1 && !(await visible(p, 'hud')));
    await p.click('#btnResume'); await sleep(200);
    check('menu: Resume continues the same run', (await mode(p)) === 'playing' && (await W(p, () => POG.debug.world.time)) > t1);
    await quiet(p); await spawn(p, 0, 'firefly'); await sleep(150); await W(p, () => POG.debug.tap(0));
    const before = await snap(p);
    await p.click('#btnPause'); await p.click('#btnRestart'); await sleep(100);
    const after = await snap(p);
    check('menu: Restart starts a fresh run', before.score > 0 && after.score === 0 && after.leaves === 5 && after.mode === 'playing');
    await p.click('#btnPause'); await p.click('#btnPauseSettings');
    check('menu: Settings from Pause opens', await visible(p, 'scrSettings'));
    await p.keyboard.press('Escape'); check('menu: Esc in Settings returns to Pause (not title)', await visible(p, 'scrPause') && (await mode(p)) === 'paused');
    await p.click('#btnPauseSettings'); await backIn('scrSettings'); check('menu: Done in Settings returns to Pause', await visible(p, 'scrPause'));
    await p.click('#btnPauseMenu'); await sleep(100);
    check('menu: Main Menu returns to title', (await mode(p)) === 'title' && await visible(p, 'scrTitle') && !(await visible(p, 'hud')));
    await p.click('#btnPlay'); await quiet(p); await forceOver(p);
    check('menu: game over screen shown, HUD hidden', await visible(p, 'scrOver') && !(await visible(p, 'hud')));
    check('menu: game over offers a Score Card (extras.js)', await visible(p, 'btnScoreCard'));
    const early = await W(p, () => { const dt = performance.now() - POG.Game.overAt; document.getElementById('btnAgain').click(); return dt; });
    await sleep(50);
    check('menu: Play Again ignored during the 0.7 s restart lock', (await mode(p)) === 'over', 'clicked ' + Math.round(early) + ' ms after game over');
    await p.keyboard.press('Enter'); await sleep(50);
    const lockedEnter = await W(p, () => performance.now() - POG.Game.overAt);
    check('menu: Enter ignored during the restart lock', lockedEnter > 700 || (await mode(p)) === 'over');
    await waitLock(p);
    await p.click('#btnAgain'); await sleep(100);
    check('menu: Play Again after the lock starts a new run', (await mode(p)) === 'playing' && (await W(p, () => POG.debug.world.score)) === 0);
    await quiet(p); await forceOver(p);
    await W(p, () => document.getElementById('btnOverMenu').click()); await sleep(50);
    check('menu: game-over Menu button is also locked for 0.7 s', (await mode(p)) === 'over');
    await waitLock(p);
    await p.click('#btnOverMenu'); await sleep(100);
    check('menu: game-over Menu returns to title', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    noErr('menus', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 3. inputs
  await section('inputs', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=7&autostart=1&diff=easy');
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    await W(p, () => { const G = POG.Game, o = G.tapAt.bind(G); G._tapAtN = 0; G.tapAt = (x, y) => { G._tapAtN++; return o(x, y); }; });
    await quiet(p); await W(p, () => { POG.debug.world.levelGoal = 999; });
    await spawn(p, 1, 'firefly'); await sleep(150);
    let [x, y] = await holeXY(p, 1); let s0 = await snap(p);
    await p.mouse.click(x, y); let s1 = await snap(p);
    check('input: mouse click on a firefly holder boops (+10)', s1.score === s0.score + 10 && s1.boops === s0.boops + 1, [s0.score, s1.score]);
    check('input: Pip launches toward the friend (state hop)', await W(p, () => POG.debug.world.pip.state === 'hop'));
    // taps are never blocked by his flight: two holders tapped 0 ms apart both count
    await sleep(500); await spawn(p, 0, 'firefly'); await spawn(p, 5, 'firefly'); await sleep(150);
    const rr = await W(p, () => [POG.debug.tap(0), POG.debug.tap(5)]);
    check('input: a second tap during Pip\'s hop also boops (re-aim, not blocked)', rr.join() === 'match,match', rr.join());
    await sleep(300); await spawn(p, 4, 'firefly'); await sleep(150);
    [x, y] = await holeXY(p, 4); const rCss = await W(p, () => { const R = POG.Game.renderer; return 88 * POG.debug.world.holes[4].s * R.k / (R.canvas.width / R.canvas.getBoundingClientRect().width); });
    s0 = await snap(p); await p.mouse.click(x + rCss * 0.6, y + rCss * 0.5); s1 = await snap(p);
    check('input: click inside the generous hit zone (off-centre) boops', s1.boops === s0.boops + 1);
    await sleep(300); await spawn(p, 2, 'sleepy'); await sleep(150);
    [x, y] = await holeXY(p, 2); s0 = await snap(p);
    await p.mouse.click(x, y); s1 = await snap(p);
    check('input: mouse click on a napping friend costs a heart and resets the combo', s1.leaves === s0.leaves - 1 && s1.combo === 0 && s1.score === s0.score, [s0, s1]);
    check('input: … the napper wakes ("wow") and Pip is dizzy', await W(p, () => POG.debug.world.holes[2].critter.state === 'wow' && POG.debug.world.pip.state === 'dizzy'));
    await sleep(700);
    await W(p, () => { const w = POG.debug.world; w.combo = 3; w.holes[3].critter = null; });
    [x, y] = await holeXY(p, 3); s0 = await snap(p);
    const rings0 = await W(p, () => POG.Game.renderer.rings.length);
    await p.mouse.click(x, y); await sleep(40); s1 = await snap(p);
    const rings1 = await W(p, () => POG.Game.renderer.rings.length);
    check('input: click on an empty hidey-hole changes nothing (no heart, combo kept) but shows a ring', s1.leaves === s0.leaves && s1.combo === 3 && s1.score === s0.score && rings1 === rings0 + 1);
    const [sx, sy] = await W(p, () => { const R = POG.Game.renderer, d = R.canvas.width / R.canvas.getBoundingClientRect().width; return [(R.ox + 80 * R.k) / d, (R.oy + 180 * R.k) / d]; });
    s0 = await snap(p); await p.mouse.click(sx, sy); s1 = await snap(p);
    check('input: click on empty sky changes nothing', JSON.stringify(s0) === JSON.stringify(s1));
    await W(p, () => { POG.debug.world.combo = 0; }); await ready(p);
    await spawn(p, 0, 'firefly'); await sleep(150); [x, y] = await holeXY(p, 0); s0 = await snap(p);
    await p.mouse.click(x, y, { button: 'right' }); s1 = await snap(p);
    check('input: right-click does not boop', s1.boops === s0.boops);
    // mash guard: 3 empty taps within 1 s → Pip naps 1.5 s (taps busy, combo reset, no heart lost)
    await sleep(300); await quiet(p); await ready(p); await W(p, () => { POG.debug.world.combo = 4; });
    s0 = await snap(p);
    const mash = await W(p, () => [POG.debug.tap(1), POG.debug.tap(2), POG.debug.tap(3)]);
    await spawn(p, 4, 'firefly'); await sleep(150);
    const during = await W(p, () => POG.debug.tap(4)); s1 = await snap(p);
    check('input: mashing 3 empty holes → nap: next tap is busy, combo 0, no heart lost', mash.join() === 'empty,empty,empty' && during === 'busy' && s1.combo === 0 && s1.leaves === s0.leaves, { mash, during, s1 });
    await sleep(1600); await spawn(p, 4, 'firefly'); await sleep(150);
    check('input: after the nap taps work again', (await W(p, () => POG.debug.tap(4))) === 'match');
    // keys 1–9 on a 9-hole chapter, in index order (back row first)
    await safeGoto(p, 2); await W(p, () => { POG.debug.world.levelGoal = 999; }); await quiet(p); await sleep(100); await ready(p);
    let keyOk = true; const keyLog = [];
    for (let i = 0; i < 9; i++) {
      await spawn(p, i, 'firefly'); await sleep(130);
      const a = await W(p, () => POG.debug.world.boops);
      await p.keyboard.press('Digit' + (i + 1));
      const c = await W(p, i => POG.debug.world.holes[i].critter && POG.debug.world.holes[i].critter.state, i);
      const bb = await W(p, () => POG.debug.world.boops);
      if (bb !== a + 1 || c !== 'booped') { keyOk = false; keyLog.push(i + 1); }
    }
    check('input: keys 1–9 boop holes 1–9 (back row first)', keyOk, keyLog.length ? 'failed keys ' + keyLog : undefined);
    const order = await W(p, () => POG.debug.world.holes.map(h => h.y + ':' + h.x).join(' '));
    check('input: hole index order = back row left→right, then the next row', order === '280:330 280:480 280:630 375:250 375:480 375:710 480:190 480:480 480:770', order);
    await sleep(300); await spawn(p, 4, 'firefly'); await sleep(130);
    s0 = await snap(p); await p.keyboard.press('Numpad5'); s1 = await snap(p);
    check('input: numpad 5 boops hole 5', s1.boops === s0.boops + 1);
    await spawn(p, 0, 'firefly'); await sleep(130);
    s0 = await snap(p); await p.keyboard.down('Digit1'); await p.keyboard.down('Digit1'); await p.keyboard.up('Digit1'); s1 = await snap(p);
    check('input: a held (auto-repeat) key taps only once', s1.boops === s0.boops + 1);
    await safeGoto(p, 0); await W(p, () => { POG.debug.world.levelGoal = 999; }); await quiet(p); await sleep(100);
    check('input: key 7 on a 6-hole chapter does nothing', (await W(p, () => POG.debug.tap(6))) === 'none');
    await p.keyboard.press('Escape'); const m1 = await mode(p);
    await p.keyboard.press('Escape'); const m2 = await mode(p);
    await p.keyboard.press('KeyP'); const m3 = await mode(p);
    await spawn(p, 1, 'firefly'); const bp = await W(p, () => POG.debug.world.boops); await p.keyboard.press('Digit2');
    const bp2 = await W(p, () => POG.debug.world.boops);
    await p.keyboard.press('KeyP'); const m4 = await mode(p);
    check('input: Esc pauses / resumes, P pauses / resumes', [m1, m2, m3, m4].join() === 'paused,playing,paused,playing', [m1, m2, m3, m4].join());
    check('input: number keys do nothing while paused', bp2 === bp);
    const mu0 = await W(p, () => POG.Game.settings.muted || POG.Game.urlMute);
    await p.keyboard.press('KeyM'); const mu1 = await W(p, () => POG.Game.settings.muted || POG.Game.urlMute);
    await p.keyboard.press('KeyM'); const mu2 = await W(p, () => POG.Game.settings.muted || POG.Game.urlMute);
    check('input: M toggles sound (and back)', mu1 !== mu0 && mu2 !== mu1, [mu0, mu1, mu2]);
    // HUD buttons must not reach the gameplay tap handler (pointerdown on the button)
    const n0 = await W(p, () => POG.Game._tapAtN);
    await p.click('#btnMuteHud'); await sleep(50);
    const n1 = await W(p, () => POG.Game._tapAtN);
    check('input: clicking the HUD sound button is not a gameplay tap', n1 === n0 && (await mode(p)) === 'playing');
    await p.click('#btnMuteHud');
    await p.click('#btnPause'); await sleep(50);
    check('input: clicking the HUD pause button is not a gameplay tap', (await W(p, () => POG.Game._tapAtN)) === n0 && (await mode(p)) === 'paused');
    await p.click('#btnResume');
    await p.focus('#btnPause'); await p.keyboard.press('Space'); await p.keyboard.press('Enter'); await sleep(50);
    check('input: Space/Enter while playing do not press a focused HUD button', (await mode(p)) === 'playing');
    check('input: canvas tap after Resume is a gameplay tap again', await (async () => { await spawn(p, 2, 'firefly'); await sleep(150); const [a, c] = await holeXY(p, 2); const q0 = await W(p, () => POG.debug.world.boops); await p.mouse.click(a, c); return (await W(p, () => POG.debug.world.boops)) === q0 + 1; })());
    noErr('inputs', errs);
    await p.close();

    // Space / Enter on focused menu buttons: exactly one start
    const { p: q, errs: e2 } = await open(b, '?mute=1&seed=7', null, ctx);
    const countStarts = () => W(q, () => { const G = POG.Game; if (!G._wrapped) { const o = G.startGame.bind(G); G._starts = 0; G.startGame = () => { G._starts++; return o(); }; G._wrapped = 1; } G._starts = 0; });
    await countStarts(); await sleep(200);
    await q.focus('#btnPlay'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused Play starts exactly once', (await W(q, () => POG.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => POG.Game._starts));
    await W(q, () => POG.Game.toTitle()); await sleep(100); await countStarts();
    await q.focus('#btnPlay'); await q.keyboard.press('Space'); await sleep(200);
    check('keys: Space on focused Play starts exactly once', (await W(q, () => POG.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => POG.Game._starts));
    await W(q, () => POG.Game.toTitle()); await sleep(100); await countStarts();
    await W(q, () => document.activeElement && document.activeElement.blur()); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on the title with nothing focused starts once', (await W(q, () => POG.Game._starts)) === 1);
    await W(q, () => POG.Game.toTitle()); await sleep(100); await countStarts();
    await q.focus('#btnSettings'); await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter on focused Settings opens Settings, does not start', (await W(q, () => POG.Game._starts)) === 0 && await visible(q, 'scrSettings'));
    await q.keyboard.press('Escape'); await sleep(120);
    await q.focus('#btnHow'); await q.keyboard.press('Space'); await sleep(150);
    check('keys: Space on focused How to Play opens it, does not start', (await W(q, () => POG.Game._starts)) === 0 && await visible(q, 'scrHow'));
    await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter in How to Play presses its focused OK (back to title), no start', (await W(q, () => POG.Game._starts)) === 0 && await visible(q, 'scrTitle'));
    await q.focus('#btnCustomize'); await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter on focused Change Pictures opens it, no start, no file dialog', (await W(q, () => POG.Game._starts)) === 0 && await visible(q, 'scrCustom'));
    await q.keyboard.press('Escape'); await sleep(100);
    await startPlaying(q); await quiet(q); await forceOver(q);
    await waitLock(q); await countStarts();
    await q.focus('#btnAgain'); await q.keyboard.press('Space'); await sleep(200);
    check('keys: Space on focused Play Again starts exactly once', (await W(q, () => POG.Game._starts)) === 1 && (await mode(q)) === 'playing', await W(q, () => POG.Game._starts));
    await quiet(q); await forceOver(q); await waitLock(q); await countStarts();
    await q.focus('#btnAgain'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused Play Again starts exactly once', (await W(q, () => POG.Game._starts)) === 1, await W(q, () => POG.Game._starts));
    await quiet(q); await forceOver(q); await sleep(100); await countStarts();
    await q.keyboard.down('Enter'); await sleep(80); await q.keyboard.up('Enter');
    await waitLock(q); await q.keyboard.down('Enter'); await q.keyboard.down('Enter'); await q.keyboard.up('Enter'); await sleep(150);
    check('keys: Enter during the lock does nothing; after it, a held Enter starts once', (await W(q, () => POG.Game._starts)) === 1, await W(q, () => POG.Game._starts));
    await quiet(q); await forceOver(q); await waitLock(q); await countStarts();
    await q.focus('#btnOverMenu'); await q.keyboard.press('Enter'); await sleep(200);
    check('keys: Enter on focused game-over Menu goes to title, no start', (await W(q, () => POG.Game._starts)) === 0 && (await mode(q)) === 'title');
    await startPlaying(q); await countStarts();
    await q.keyboard.press('Escape'); await sleep(80);
    await q.focus('#btnRestart'); await q.keyboard.press('Enter'); await sleep(150);
    check('keys: Enter on focused Restart restarts exactly once', (await W(q, () => POG.Game._starts)) === 1 && (await mode(q)) === 'playing');
    await q.keyboard.press('Escape'); await sleep(80);
    await q.focus('#btnResume'); await q.keyboard.press('Space'); await sleep(150);
    check('keys: Space on focused Resume resumes', (await mode(q)) === 'playing');
    await q.keyboard.press('Escape'); await sleep(100);
    const fz = await W(q, () => document.activeElement && document.activeElement.id);
    check('keys: Pause menu focuses Resume (Enter resumes)', fz === 'btnResume', fz);
    noErr('keys', e2);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 4. touch
  await section('touch', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3&autostart=1', PHONE);
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    check('touch: game detects a touch device', await W(p, () => POG.Game.isTouch && document.body.classList.contains('touch')));
    await W(p, () => { const G = POG.Game, o = G.tapAt.bind(G); G._tapAtN = 0; G.tapAt = (x, y) => { G._tapAtN++; return o(x, y); }; POG.debug.world.levelGoal = 999; });
    await quiet(p);
    await spawn(p, 3, 'firefly'); await sleep(150);
    let [x, y] = await holeXY(p, 3); let s0 = await snap(p);
    await p.touchscreen.tap(x, y); await sleep(50); let s1 = await snap(p);
    check('touch: a tap on a firefly holder boops', s1.boops === s0.boops + 1);
    await sleep(400); await spawn(p, 2, 'gold'); await sleep(150);
    [x, y] = await holeXY(p, 2); s0 = await snap(p);
    await p.touchscreen.tap(x, y); await sleep(50); s1 = await snap(p);
    check('touch: a tap on a golden firefly holder scores ×5', s1.golds === s0.golds + 1 && s1.score - s0.score === 50 * s1.mult, [s0.score, s1.score]);
    await sleep(400); await spawn(p, 4, 'sleepy'); await sleep(150);
    [x, y] = await holeXY(p, 4); s0 = await snap(p);
    await p.touchscreen.tap(x, y); await sleep(50); s1 = await snap(p);
    check('touch: a tap on a napper costs a heart', s1.leaves === s0.leaves - 1);
    await sleep(700); await ready(p);
    await spawn(p, 0, 'firefly'); await spawn(p, 5, 'firefly'); await sleep(150);
    const [a, c] = [await holeXY(p, 0), await holeXY(p, 5)];
    const cdp = await ctx.newCDPSession(p);
    s0 = await snap(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 1 }, { x: c[0], y: c[1], id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80); s1 = await snap(p);
    check('touch: two fingers on two firefly holders give two boops', s1.boops === s0.boops + 2, [s0.boops, s1.boops]);
    await sleep(400); await spawn(p, 1, 'firefly'); await spawn(p, 4, 'firefly'); await sleep(150);
    const [d1, d2] = [await holeXY(p, 1), await holeXY(p, 4)]; s0 = await snap(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d1[0], y: d1[1], id: 3 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d1[0], y: d1[1], id: 3 }, { x: d2[0], y: d2[1], id: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80); s1 = await snap(p);
    check('touch: a second finger while the first is held also boops', s1.boops === s0.boops + 2, [s0.boops, s1.boops]);
    const n0 = await W(p, () => POG.Game._tapAtN);
    const mutedBefore = await W(p, () => POG.Game.settings.muted || POG.Game.urlMute);
    const box = await (await p.$('#btnMuteHud')).boundingBox();
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(700);
    check('touch: tapping the HUD sound button toggles sound once, no gameplay tap', (await W(p, () => POG.Game._tapAtN)) === n0 && (await W(p, () => POG.Game.settings.muted || POG.Game.urlMute)) !== mutedBefore);
    const pb = await (await p.$('#btnPause')).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 7 }, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: a[0], y: a[1], id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
    check('touch: Pause works as a second finger', (await mode(p)) === 'paused');
    const tapEl = async sel => { const bb = await (await p.$(sel)).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
    await tapEl('#btnResume'); await sleep(500);
    check('touch: Resume tap resumes (no ghost tap on a friend)', (await mode(p)) === 'playing' && (await W(p, () => POG.Game._tapAtN)) === n0 + 1, 'tapAt calls ' + (await W(p, () => POG.Game._tapAtN)) + ' (1 = the finger held on the field above)');
    await W(p, () => POG.Game.pause()); await sleep(200);
    await tapEl('#btnPauseMenu'); await sleep(800);
    check('touch: Main Menu tap lands on the title (no ghost click starts a game)', (await mode(p)) === 'title' && await visible(p, 'scrTitle'));
    await tapEl('#btnHow'); await sleep(800);
    check('touch: How to Play tap stays on How to Play (no ghost click on OK)', await visible(p, 'scrHow'));
    await tapEl('#scrHow .btn-back'); await sleep(800);
    check('touch: OK on How to Play returns to title', await visible(p, 'scrTitle') && (await mode(p)) === 'title');
    await tapEl('#btnSettings'); await sleep(800);
    check('touch: Settings tap stays on Settings', await visible(p, 'scrSettings'));
    await tapEl('#setDifficulty button[data-v=normal]'); await sleep(200);
    check('touch: difficulty segment answers a tap', await W(p, () => POG.Game.settings.difficulty === 'normal'));
    await tapEl('#setDifficulty button[data-v=easy]'); await sleep(200);
    await tapEl('#scrSettings .btn-back'); await sleep(600);
    await tapEl('#btnCustomize'); await sleep(800);
    check('touch: Change Pictures tap stays on Change Pictures', await visible(p, 'scrCustom'));
    await tapEl('#scrCustom .btn-back'); await sleep(600);
    await tapEl('#btnPlay'); await sleep(800);
    check('touch: Play tap starts a game', (await mode(p)) === 'playing');
    await quiet(p); await forceOver(p); await waitLock(p);
    const g0 = await W(p, () => POG.debug.stats.games);
    await tapEl('#btnAgain'); await sleep(800);
    check('touch: Play Again tap starts exactly one game', (await mode(p)) === 'playing' && (await W(p, () => POG.debug.stats.games)) === g0);
    noErr('touch', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 5. scoring rules
  await section('scoring', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=11&autostart=1&diff=easy');
    await p.waitForFunction(() => POG.debug.mode === 'playing');
    await quiet(p); await hookEvents(p);
    check('score: a run starts with 5 hearts (max 5), score 0', await W(p, () => { const w = POG.debug.world; return w.leaves === 5 && w.maxLeaves === 5 && w.score === 0 && w.levelGoal === 15; }));
    await W(p, () => { POG.debug.world.leaves = 4; });   // test the +1 heart from 4
    const deltas = [], leavesAt = [];
    for (let i = 0; i < 12; i++) {
      await spawn(p, i % 6, 'firefly'); await sleep(110);
      const s0 = await snap(p); const r = await W(p, i => POG.debug.tap(i), i % 6); const s1 = await snap(p);
      deltas.push(r === 'match' ? s1.score - s0.score : r); leavesAt.push(s1.leaves);
    }
    const exp = [10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30, 30];
    check('score: firefly = 10 × multiplier, ×2 from combo 5, ×3 from combo 10', JSON.stringify(deltas) === JSON.stringify(exp), deltas.join(','));
    check('score: +1 heart on the 12th firefly (4 → 5)', leavesAt[10] === 4 && leavesAt[11] === 5, leavesAt.join(','));
    check('score: combo / mult state after 12 fireflies', await W(p, () => POG.debug.world.combo === 12 && POG.debug.world.mult === 3));
    await sleep(100);
    const ev = await evlog(p);
    const combos = ev.filter(e => e.type === 'combo').map(e => e.n);
    check('score: combo events at 5 and 10', combos.join() === '5,10', combos.join());
    check('score: leafGained event once', ev.filter(e => e.type === 'leafGained').length === 1);
    check('score: HUD shows ×3 (render reads world.mult)', await W(p, () => POG.Game.renderer.world.mult === 3));
    await sleep(300);
    await spawn(p, 2, 'sleepy'); await sleep(110);
    let s0 = await snap(p); let r = await W(p, () => POG.debug.tap(2)); let s1 = await snap(p);
    check('score: napper tap → −1 heart, combo 0, mult 1, no points', r === 'wrong' && s1.leaves === s0.leaves - 1 && s1.combo === 0 && s1.mult === 1 && s1.score === s0.score);
    await spawn(p, 3, 'firefly'); await sleep(110);
    r = await W(p, () => POG.debug.tap(3));
    check('score: taps are briefly locked while Pip is dizzy (busy)', r === 'busy', r);
    await sleep(500); await spawn(p, 3, 'firefly'); await sleep(110);
    s0 = await snap(p); r = await W(p, () => POG.debug.tap(3)); s1 = await snap(p);
    check('score: after a napper the multiplier restarts at ×1', r === 'match' && s1.score - s0.score === 10);
    await W(p, () => { const w = POG.debug.world; w.leaves = 5; w.boops = 23; });
    await spawn(p, 0, 'firefly'); await sleep(110); await W(p, () => POG.debug.tap(0));
    check('score: hearts never exceed 5', await W(p, () => POG.debug.world.leaves === 5));
    // tapping a friend already booped / sinking is 'empty'
    r = await W(p, () => POG.debug.tap(0));
    check('score: tapping the same friend again is "empty" (no double score)', r === 'empty', r);
    noErr('scoring', errs);
    await p.close();

    // golden firefly ×5 at ×1 and ×3
    const { p: g } = await open(b, '?mute=1&seed=13&autostart=1&diff=easy', null, ctx);
    await g.waitForFunction(() => POG.debug.mode === 'playing'); await quiet(g); await W(g, () => { POG.debug.world.levelGoal = 999; });
    const seq = ['gold', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'gold'];
    const gd = [];
    for (let i = 0; i < seq.length; i++) { await spawn(g, i % 6, seq[i]); await sleep(110); const a = await snap(g); await W(g, i => POG.debug.tap(i), i % 6); const z = await snap(g); gd.push(z.score - a.score); }
    check('score: golden firefly = 50 × mult (50 at ×1, 150 at ×3)', gd[0] === 50 && gd[10] === 150, gd.join(','));
    check('score: a gold counts 1 firefly and 1 golden', await W(g, () => POG.debug.world.boops === 11 && POG.debug.world.golds === 2 && POG.debug.world.stats.golds === 2 && POG.debug.world.levelBoops === 11));
    check('score: gold is in the combo chain (combo 11)', await W(g, () => POG.debug.world.combo === 11));
    await g.close();

    // chapter change after 15 fireflies
    const { p: q } = await open(b, '?mute=1&seed=12&autostart=1&diff=easy', null, ctx);
    await q.waitForFunction(() => POG.debug.mode === 'playing'); await quiet(q); await hookEvents(q);
    let lastR = '';
    for (let i = 0; i < 15; i++) { await spawn(q, i % 6, 'firefly'); await sleep(110); lastR = await W(q, i => POG.debug.tap(i), i % 6); if (lastR !== 'match') break; }
    const afterClear = await W(q, () => ({ clearing: POG.debug.world.clearing, score: POG.debug.world.score, level: POG.debug.world.level }));
    check('chapter: 15 fireflies finish the chapter with +50 (score 320 + 50)', afterClear.clearing && afterClear.score === 4 * 10 + 5 * 20 + 6 * 30 + 50 && afterClear.level === 0, afterClear);
    const r2 = await W(q, () => POG.debug.tap(0));
    check('chapter: taps are busy while the page turns', r2 === 'busy', r2);
    await W(q, () => { delete POG.debug.world._spawn; });   // natural pops again for the next chapter
    await q.waitForFunction(() => POG.debug.world.level === 1, null, { timeout: 4000 });
    await sleep(200);
    const L = await W(q, () => { const w = POG.debug.world, R = POG.Game.renderer; return { n: w.holes.length, zone: w.zone, banner: R.banner && R.banner.text, sub: R.banner && R.banner.sub, xs: w.holes.map(h => h.x + ',' + h.y).join(' '), want: POG.World.LAYOUTS[1].map(h => h.x + ',' + h.y).join(' '), boops: w.levelBoops, vis: R.vis.cur, wz: POG.debug.weather.zone }; });
    check('chapter: The Palm Grove has 8 hidey-holes in the designed layout', L.n === 8 && L.xs === L.want && L.zone === 1, L.xs);
    check('chapter: banner "Chapter 2 · The Palm Grove" and visuals/weather switch', L.banner === 'The Palm Grove' && L.sub === 'Chapter 2' && L.vis === 1 && L.wz === 1, L);
    check('chapter: levelBoops reset to 0, levelClear bonus event 50', L.boops === 0 && (await evlog(q)).some(e => e.type === 'levelClear' && e.bonus === 50));
    await q.waitForFunction(() => (window._evlog || []).some(e => e.type === 'pop'), null, { timeout: 5000 }).catch(() => {});
    const firstPop = (await evlog(q)).find(e => e.type === 'pop');
    check('chapter: first pop of the new chapter holds a plain firefly', firstPop && firstPop.critterType === 'firefly', firstPop);
    const lay = [];
    for (const lv of [2, 3, 4]) { await safeGoto(q, lv); await sleep(150); lay.push(await W(q, () => ({ n: POG.debug.world.holes.length, zone: POG.debug.world.zone, loop: POG.debug.world.loop, b: POG.Game.renderer.banner && POG.Game.renderer.banner.text, sub: POG.Game.renderer.banner && POG.Game.renderer.banner.sub }))); }
    check('chapter: dunes and night have 9 holes; chapter 5 loops to the spring (Book 2)', lay[0].n === 9 && lay[1].n === 9 && lay[1].b === 'The Starlit Oasis' && lay[2].n === 6 && lay[2].zone === 0 && lay[2].loop === 1 && lay[2].sub === 'Chapter 1 · Book 2', lay);
    check('chapter: the next book is faster (speed > 1)', await W(q, () => POG.debug.world.speed() > 1.1));
    // a hop still in flight to hole 7–9 when the chapter changes to a 6-hole chapter (debug.gotoLevel)
    await safeGoto(q, 3); await quiet(q); await W(q, () => { POG.debug.world.levelGoal = 999; POG.debug.stats.errors.length = 0; }); await ready(q);
    await spawn(q, 8, 'firefly'); await sleep(150);
    const jump = await W(q, () => { const r = POG.debug.tap(8); POG.debug.gotoLevel(4); return r; });
    await sleep(2200);
    const after = await W(q, () => ({ errors: POG.debug.stats.errors.slice(0, 1).map(e => e.split('\n')[0]), pip: POG.debug.world.pip.state, x: Math.round(POG.debug.world.pip.x), y: Math.round(POG.debug.world.pip.y), holes: POG.debug.world.holes.length }));
    check('chapter: changing to a 6-hole chapter while Pip hops to hole 9 → no error, Pip goes home', jump === 'match' && after.errors.length === 0 && after.pip === 'home' && after.x === 480 && after.y === 132, after);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 6. miss rule per difficulty
  await section('miss', async () => {
    const ctx = await b.newContext(DESK);
    for (const d of ['easy', 'normal', 'hard']) {
      const { p, errs } = await open(b, '?mute=1&seed=5&autostart=1&diff=' + d, null, ctx);
      await p.waitForFunction(() => POG.debug.mode === 'playing'); await quiet(p);
      await W(p, () => { const w = POG.debug.world; w.leaves = 5; w.combo = 3; w.mult = 1; });
      const up = await W(p, () => { POG.debug.spawn(0, 'firefly'); return POG.debug.world.holes[0].critter.upFor; });
      await W(p, () => POG.debug.setSpeed(4));
      await p.waitForFunction(() => POG.debug.world.stats.missed >= 1, null, { timeout: 8000 });
      await W(p, () => POG.debug.setSpeed(1));
      const s = await snap(p);
      const base = { easy: 2.8, normal: 1.9, hard: 1.35 }[d];
      check('miss[' + d + ']: a friend stays up ≈' + base + ' s', up > base * 0.87 && up < base * 1.13, up.toFixed(2));
      if (d === 'easy') check('miss[easy]: a firefly getting away costs nothing', s.leaves === 5 && s.combo === 3, s);
      else check('miss[' + d + ']: a firefly getting away costs a heart and the combo', s.leaves === 4 && s.combo === 0, s);
      await W(p, () => { const w = POG.debug.world; w.stats.missed = 0; POG.debug.spawn(1, 'sleepy'); POG.debug.setSpeed(4); });
      await sleep(1500); await W(p, () => POG.debug.setSpeed(1));
      check('miss[' + d + ']: a napper ducking down is not a miss', await W(p, () => POG.debug.world.stats.missed === 0 && POG.debug.world.leaves === (POG.debug.world.difficulty === 'easy' ? 5 : 4)));
      const gu = await W(p, () => { POG.debug.spawn(2, 'gold'); return POG.debug.world.holes[2].critter.upFor; });
      check('miss[' + d + ']: a golden firefly stays up ¾ as long', gu > base * 0.75 * 0.87 && gu < base * 0.75 * 1.13, gu.toFixed(2));
      noErr('miss[' + d + ']', errs);
      await p.close();
    }
    await ctx.close();
  });

  // ------------------------------------------------------------------ 7. game over + best per difficulty
  await section('best', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=9');
    await sleep(200);
    const boop = async n => { for (let i = 0; i < n; i++) { await spawn(p, i % 6, 'firefly'); await sleep(110); await W(p, i => POG.debug.tap(i), i % 6); } };
    await p.click('#btnPlay'); await quiet(p); await boop(3);
    await W(p, () => { POG.debug.world.leaves = 1; });
    await spawn(p, 4, 'sleepy'); await sleep(150);
    check('over: waking a napper on the last heart ends the story', (await W(p, () => POG.debug.tap(4))) === 'wrong' && (await W(p, () => POG.debug.world.phase)) === 'over');
    const t0 = Date.now(); await p.waitForFunction(() => POG.debug.mode === 'over', null, { timeout: 6000 }); const dt = Date.now() - t0;
    check('over: game-over screen arrives after a short pause (~1.6 s)', dt > 900 && dt < 3500, dt + ' ms');
    await sleep(100);
    check('best: game over shows score 30', (await p.textContent('#overScore')) === '30');
    check('best: first score is a new best (NEW! badge, best 30)', (await p.textContent('#overBest')) === '30' && await visible(p, 'newBest'));
    check('best: saved per difficulty (best_easy = 30)', (await lsGet(p, 'best_easy')) === '30');
    const stats = await p.textContent('#overStats');
    check('best: game-over stats list fireflies / golden / nappers / chapter', /Fireflies: 3/.test(stats) && /Golden: 0/.test(stats) && /Woke a napper: 1/.test(stats) && /The Morning Spring/.test(stats), stats);
    check('best: no medal before finishing chapter 1', /Finish Chapter 1/.test(await p.textContent('#medalName')));
    await waitLock(p);
    await p.click('#btnAgain'); await quiet(p); await boop(1); await forceOver(p); await sleep(100);
    check('best: a lower score keeps the best (no NEW!)', (await p.textContent('#overBest')) === '30' && !(await visible(p, 'newBest')) && (await lsGet(p, 'best_easy')) === '30');
    await waitLock(p);
    await p.click('#btnOverMenu'); await sleep(100);
    check('best: title shows the Easy best (30)', (await p.textContent('#bestTitle')) === '30');
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=normal]'); await p.click('#scrSettings .btn-back'); await sleep(100);
    check('best: title shows the Normal best (0) after switching difficulty', (await p.textContent('#bestTitle')) === '0');
    await p.click('#btnPlay'); await quiet(p); await boop(2); await forceOver(p); await sleep(100);
    check('best: Normal best saved separately (best_normal = 20, best_easy = 30)', (await lsGet(p, 'best_normal')) === '20' && (await lsGet(p, 'best_easy')) === '30');
    // a medal after a chapter
    await waitLock(p); await p.click('#btnAgain'); await quiet(p); await boop(15);
    await p.waitForFunction(() => POG.debug.world.level === 1, null, { timeout: 4000 }); await quiet(p); await forceOver(p); await sleep(100);
    check('best: finishing chapter 1 earns the bronze medal, "Reached: The Palm Grove"', /Bronze/.test(await p.textContent('#medalName')) && /The Palm Grove/.test(await p.textContent('#overStats')), await p.textContent('#medalName'));
    const bestN = await lsGet(p, 'best_normal');
    // bot run never saves best
    await waitLock(p);
    await p.click('#btnAgain');
    await W(p, () => { POG.debug.setBot(true, 1); POG.debug.setSpeed(8); }); await sleep(2500); await W(p, () => POG.debug.setSpeed(1));
    const botScore = await W(p, () => POG.debug.world.score);
    await W(p, () => POG.debug.setBot(false));
    await quiet(p); await W(p, () => { POG.debug.world.score = 99999; }); await forceOver(p); await sleep(100);
    check('best: a bot run does not save best (bot turned off before game over)', botScore > 0 && (await lsGet(p, 'best_normal')) === bestN && !(await visible(p, 'newBest')), 'bot score ' + botScore + ', best_normal ' + await lsGet(p, 'best_normal'));
    // the debug speed hook taints a run, but a new run started while the speed is still up is clean again
    await waitLock(p);
    await W(p, () => { POG.debug.setSpeed(4); POG.debug.startGame(); });
    await quiet(p); await W(p, () => { POG.debug.world.score = 88888; }); await forceOver(p); await sleep(100);
    const sped = await lsGet(p, 'best_normal');
    await W(p, () => POG.debug.setSpeed(1));
    check('best: a run started while debug.setSpeed(4) is active does not save best [debug hook]', sped === bestN, 'best_normal after a speed-4 run: ' + sped);
    if (sped !== bestN) await W(p, v => localStorage.setItem('pog:best_normal', v), bestN);
    // test URL flags never save best
    for (const q of ['?mute=1&speed=2', '?mute=1&level=1', '?mute=1&diff=normal']) {
      await p.goto(GAME + q); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
      await p.evaluate(() => POG.Game.startGame()); await quiet(p); await W(p, () => { POG.debug.world.score = 77777; }); await forceOver(p); await sleep(100);
      const bb = await W(p, () => Object.keys(localStorage).filter(k => k.startsWith('pog:best_')).map(k => localStorage.getItem(k)));
      check('best: a run with ' + q.replace('?mute=1&', '') + ' never saves best', !bb.includes('77777'), bb.join(','));
    }
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    await p.click('#btnSettings');
    await p.click('#btnResetBest');
    check('best: first Reset tap only arms ("Sure?")', (await p.textContent('#btnResetBest')) === 'Sure?' && (await lsGet(p, 'best_easy')) === '30');
    await p.click('#btnResetBest');
    check('best: second Reset tap clears every best', (await lsGet(p, 'best_easy')) === null && (await lsGet(p, 'best_normal')) === null);
    await p.click('#scrSettings .btn-back');
    check('best: title shows 0 after reset', (await p.textContent('#bestTitle')) === '0');
    noErr('best', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 8. settings persistence + mute
  await section('settings', async () => {
    const { p, errs, ctx } = await open(b, '');
    await sleep(200);
    await p.click('#btnSettings');
    check('settings: defaults sfx on, music on, Easy, volume 100 %', await W(p, () => document.getElementById('setSfx').checked && document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'easy' && document.getElementById('setVolume').value === '100'));
    await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)'); await p.click('#setDifficulty button[data-v=hard]');
    await p.click('.vol-step[data-d="-1"]');
    check('settings: Hard highlighted after the tap', await W(p, () => document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
    await p.click('#scrSettings .btn-back');
    await p.reload(); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    const s = await W(p, () => POG.Game.settings);
    check('settings: sfx / music / difficulty survive a reload', s.sfx === false && s.music === false && s.difficulty === 'hard', s);
    await p.click('#btnSettings');
    check('settings: Settings screen reflects the saved values (volume 90 %)', await W(p, () => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'hard' && document.getElementById('setVolume').value === '90'));
    await p.click('#scrSettings .btn-back');
    await p.click('#btnPlay'); check('settings: a new run uses the saved difficulty', await W(p, () => POG.debug.world.difficulty === 'hard'));
    await p.keyboard.press('KeyM'); await sleep(50);
    check('mute: M mutes, shows a toast, saves muted=true', await W(p, () => POG.Game.settings.muted) && /Sound off/.test(await p.textContent('#toast')) && JSON.parse(await lsGet(p, 'settings')).muted === true);
    await p.reload(); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('mute: muted state survives a reload', await W(p, () => POG.Game.settings.muted === true));
    await p.keyboard.press('KeyM');
    check('mute: M again unmutes and saves muted=false', JSON.parse(await lsGet(p, 'settings')).muted === false);
    await p.goto(GAME + '?mute=1'); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('mute: ?mute=1 mutes the session (HUD icon shows muted)', await W(p, () => POG.Game.urlMute && !POG.Game.settings.muted));
    await p.click('#btnSettings'); await p.click('label:has(#setSfx)'); await p.click('#scrSettings .btn-back');
    check('mute: ?mute=1 + changing a setting does not save muted', JSON.parse(await lsGet(p, 'settings')).muted === false);
    await p.click('#btnPlay'); await p.click('#btnMuteHud'); await sleep(50);
    check('mute: with ?mute=1 the HUD button turns sound ON (session only)', await W(p, () => !POG.Game.urlMute && !POG.Game.settings.muted) && JSON.parse(await lsGet(p, 'settings')).muted === false);
    await p.goto(GAME); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('mute: a normal load after ?mute=1 is not muted', await W(p, () => POG.Game.settings.muted === false && !POG.Game.urlMute));
    await p.goto(GAME + '?mute=1&diff=normal'); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    await p.click('#btnSettings'); await p.click('label:has(#setMusic)'); await p.click('#scrSettings .btn-back');
    check('settings: ?diff=normal is never saved as the difficulty', JSON.parse(await lsGet(p, 'settings')).difficulty === 'hard');
    await W(p, () => localStorage.setItem('pog:settings', '{broken'));
    await p.reload(); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('settings: a corrupt settings value falls back to the defaults', await W(p, () => POG.Game.settings.difficulty === 'easy' && POG.Game.settings.sfx === true));
    await W(p, () => localStorage.setItem('pog:settings', '{"difficulty":"insane"}'));
    await p.reload(); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('settings: an unknown difficulty falls back to Easy', await W(p, () => POG.Game.settings.difficulty === 'easy'));
    noErr('settings', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 9. Change Pictures
  await section('pictures', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=4');
    const files = await p.evaluate(async () => {
      const mk = (w, h, draw, type, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, q); };
      const cut = mk(300, 300, (g) => { g.fillStyle = '#3c6'; g.beginPath(); g.arc(150, 150, 120, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(110, 110, 30, 30); }, 'image/png');
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
    check('pictures: shape buttons disabled until a picture is chosen', await W(p, () => [...document.querySelectorAll('#slotGrid .slot:nth-child(1) .shape button')].every(b => b.disabled)));
    await pick(0, F.cut); await waitToast(/saved/);
    check('pictures: PNG cut-out saved to Pip', await W(p, () => POG.Assets.hasCustom('hero')));
    check('pictures: cut-out keeps the "Whole picture" shape', (await lsGet(p, 'shape_hero')) === 'fit');
    check('pictures: card shows "★ Your picture" and a preview', /Your picture/.test(await p.textContent(slotSel(0) + ' .tag')) && (await p.$$(slotSel(0) + ' .prev img')).length === 1);
    check('pictures: still on Change Pictures after a pick (no blur pause / screen change)', await visible(p, 'scrCustom') && (await mode(p)) === 'title');
    await pick(1, F.photo); await waitToast(/saved/);
    check('pictures: opaque JPEG photo saved to the friends and made a round sticker', await W(p, () => POG.Assets.hasCustom('critter')) && (await lsGet(p, 'shape_critter')) === 'circle');
    await p.click(slotSel(1) + ' .shape button[data-shape=fit]');
    check('pictures: "Whole picture" switches the shape back', (await lsGet(p, 'shape_critter')) === 'fit' && await W(p, () => POG.Assets.custom.critter.width === 512));
    await p.click(slotSel(1) + ' .shape button[data-shape=circle]');
    check('pictures: "Round" makes a 512 px round sticker again', (await lsGet(p, 'shape_critter')) === 'circle' && await W(p, () => POG.Assets.custom.critter.width === 512 && POG.Assets.custom.critter.height === 512));
    const t0 = Date.now(); await pick(2, F.huge); await waitToast(/saved|room/); const dt = Date.now() - t0;
    const hugeInfo = await W(p, () => ({ ok: POG.Assets.hasCustom('bg_spring'), w: POG.Assets.custom.bg_spring && POG.Assets.custom.bg_spring.width, h: POG.Assets.custom.bg_spring && POG.Assets.custom.bg_spring.height, len: (localStorage.getItem('pog:img_bg_spring') || '').length }));
    check('pictures: huge 4000×3000 photo is downscaled to 1600×1200 and stored compactly', hugeInfo.ok && hugeInfo.w === 1600 && hugeInfo.h === 1200 && hugeInfo.len < 2.5e6, { ...hugeInfo, ms: dt });
    await pick(3, F.txt); const tt = await waitToast(/picture/i);
    check('pictures: a non-image file gives a friendly message and changes nothing', /Please choose a picture file/.test(tt) && !(await W(p, () => POG.Assets.hasCustom('bg_palms'))), tt);
    await pick(3, F.bad); const tb = await waitToast(/could not|Please choose/i);
    check('pictures: a broken image file gives a friendly message', /could not be opened/i.test(tb) && !(await W(p, () => POG.Assets.hasCustom('bg_palms'))), tb);
    const fills = [];
    for (const i of [3, 4, 5]) { await pick(i, F.huge); fills.push(await waitToast(/saved|room/)); }
    check('pictures: filling all four backgrounds never throws (saved or friendly quota message)', fills.every(t => /saved|room/.test(t)), fills.join(' / '));
    const stored = await W(p, () => POG.Assets.SLOTS.filter(s => POG.Assets.hasCustom(s.id)).map(s => s.id));
    const lsKeys = await W(p, () => Object.keys(localStorage).filter(k => k.startsWith('pog:img_')).map(k => k.slice(8)));
    check('pictures: what the cards show matches what is stored (no phantom pictures)', stored.slice().sort().join() === lsKeys.slice().sort().join(), stored.join() + ' vs ' + lsKeys.join());
    await p.click('#scrCustom .btn-back');
    await p.reload(); await p.waitForFunction(() => POG.debug && POG.debug.mode === 'title');
    check('pictures: custom pictures survive a reload', await W(p, () => POG.Assets.hasCustom('hero') && POG.Assets.hasCustom('critter') && POG.Assets.hasCustom('bg_spring')));
    check('pictures: shapes survive a reload (critter round)', await W(p, () => POG.Assets.custom.critter.width === 512 && POG.Assets.custom.critter.height === 512));
    await p.click('#btnPlay'); await W(p, () => { POG.debug.setBot(true, 0.9); POG.debug.setSpeed(3); });
    await sleep(2500); await p.screenshot({ path: OUT + '/custom_play_spring.png' });
    for (const lv of [1, 2, 3, 0]) { await safeGoto(p, lv); await sleep(1500); }
    await W(p, () => { POG.debug.spawn(0, 'sleepy'); POG.debug.spawn(1, 'gold'); POG.debug.setSpeed(1); }); await sleep(400);
    await p.screenshot({ path: OUT + '/custom_play.png' });
    const used = await W(p, () => [...POG.Assets._cache.keys()].filter(k => k.startsWith('custom:')).map(k => k.split('|')[0]));
    check('pictures: custom Pip and friends are drawn in gameplay', used.includes('custom:hero') && used.includes('custom:critter'), [...new Set(used)].join(','));
    check('pictures: gameplay with custom pictures has no errors', errs.length === 0 && (await W(p, () => POG.debug.stats.errors.length)) === 0, errs.slice(0, 3).join(' | ') || undefined);
    await W(p, () => { POG.debug.setBot(false); POG.Game.toTitle(); });
    await p.click('#btnCustomize');
    await p.click(slotSel(0) + ' [data-act=reset]');
    check('pictures: Reset on one card restores the original Pip only', !(await W(p, () => POG.Assets.hasCustom('hero'))) && (await lsGet(p, 'img_hero')) === null && (await lsGet(p, 'shape_hero')) === null && await W(p, () => POG.Assets.hasCustom('critter')) && /Original/.test(await p.textContent(slotSel(0) + ' .tag')));
    await p.click('#btnResetAll');
    check('pictures: Reset all removes every custom picture', await W(p, () => POG.Assets.SLOTS.every(s => !POG.Assets.hasCustom(s.id)) && !Object.keys(localStorage).some(k => k.startsWith('pog:img_'))));
    await p.click('#scrCustom .btn-back'); await p.click('#btnPlay'); await sleep(800);
    check('pictures: after Reset all, gameplay draws the default art', await W(p, () => ![...POG.Assets._cache.keys()].some(k => k.startsWith('custom:'))));
    noErr('pictures', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 10. layout on devices
  const DEVICES = [
    { name: 'desktop 1280x720', o: { viewport: { width: 1280, height: 720 } } },
    { name: 'desktop 1920x1080', o: { viewport: { width: 1920, height: 1080 } } },
    { name: 'phone 844x390 @3x', o: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, insets: { top: 0, left: 47, right: 47, bottom: 21 } },
    { name: 'phone 390x844 @3x', o: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, insets: { top: 47, left: 0, right: 0, bottom: 34 } },
    { name: 'iPad 1024x768 @2x', o: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, insets: { top: 24, left: 0, right: 0, bottom: 20 } },
    { name: 'iPad Pro 1366x1024 @2x', o: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, insets: { top: 24, left: 0, right: 0, bottom: 20 } }
  ];
  for (const dev of DEVICES) {
    await section('layout ' + dev.name, async () => {
      const { p, errs, ctx } = await open(b, '?mute=1&seed=3', dev.o, null, dev.insets);
      const { width: VW, height: VH } = dev.o.viewport, touch = !!dev.o.hasTouch, tag = 'layout[' + dev.name + ']';
      const S = Object.assign({ top: 0, left: 0, right: 0, bottom: 0 }, dev.insets || {});
      const inSafe = r => r && r.x >= S.left - 0.5 && r.y >= S.top - 0.5 && r.x + r.width <= VW - S.right + 0.5 && r.y + r.height <= VH - S.bottom + 0.5;
      const inView = r => r && r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= VW + 0.5 && r.y + r.height <= VH + 0.5;
      await sleep(600);
      check(tag + ': safe-area probe reads the insets', await W(p, () => POG.Game.readInsets()).then(i => i.top === S.top && i.left === S.left && i.bottom === S.bottom), await W(p, () => POG.Game.readInsets()));
      const scroll = await W(p, () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]);
      check(tag + ': no page scroll / horizontal overflow', scroll[0] <= scroll[2] && scroll[1] <= scroll[3], scroll);
      const cv = await W(p, () => { const R = POG.Game.renderer, r = R.canvas.getBoundingClientRect(); return { w: r.width, h: r.height, bw: R.canvas.width, bh: R.canvas.height, px: R.px, k: R.k, ox: R.ox, oy: R.oy }; });
      check(tag + ': canvas fills the window', Math.abs(cv.w - VW) < 1 && Math.abs(cv.h - VH) < 1, cv);
      check(tag + ': stage 960×540 fits inside the window', cv.ox >= 0 && cv.oy >= 0 && 960 * cv.k <= cv.bw + 1 && 540 * cv.k + cv.oy <= cv.bh + 1, cv);
      const screenOk = async (scr, label) => {
        const pr = await p.evaluate(scr => { const e = document.querySelector('#' + scr + ' .panel, #' + scr + ' .title-wrap'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; }, scr);
        const bs = await p.evaluate(scr => [...document.querySelectorAll('#' + scr + ' button')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), x: r.x, y: r.y, width: r.width, height: r.height }; }), scr);
        const scrolls = pr.sh > pr.ch + 1;
        const out = bs.filter(r => !inView(r)).map(r => r.id);
        check(tag + ': ' + label + ' fits the screen or scrolls (panel in view' + (scrolls ? ', scrolls' : '') + ')', inView(pr) && (out.length === 0 || scrolls), out.length ? 'off-screen: ' + out.join(',') : (inView(pr) ? undefined : pr));
        check(tag + ': ' + label + ' panel inside the safe area', inSafe(pr), pr);
        check(tag + ': ' + label + ' no sideways overflow inside the panel', pr.sw <= pr.cw + 1, [pr.sw, pr.cw]);
        if (touch) {
          const small = bs.filter(r => r.height < 43.5 || r.width < 43.5).map(r => r.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          check(tag + ': ' + label + ' buttons are ≥ 44 px (finger size)', small.length === 0, small.join(', ') || undefined);
        }
      };
      const shot = n => p.screenshot({ path: OUT + '/' + dev.name.replace(/\W+/g, '_') + '_' + n + '.png' });
      await screenOk('scrTitle', 'title'); await shot('title');
      for (const [btn, scr, label] of [['btnHow', 'scrHow', 'How to Play'], ['btnSettings', 'scrSettings', 'Settings'], ['btnCustomize', 'scrCustom', 'Change Pictures']]) {
        await W(p, ([btn]) => document.getElementById(btn).click(), [btn]); await sleep(700);
        await screenOk(scr, label);
        await shot(scr);
        if (scr !== 'scrTitle') {
          const done = await W(p, scr => { const b = document.querySelector('#' + scr + ' .btn-back'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, scr);
          check(tag + ': ' + label + ' Done/OK reachable', inView(done), done);
        }
        await W(p, scr => document.querySelector('#' + scr + ' .btn-back').click(), scr); await sleep(100);
      }
      await W(p, () => document.getElementById('btnPlay').click()); await sleep(1200);
      if (await visible(p, 'rotate')) {
        check(tag + ': rotate card is on screen with its button', await W(p, () => { const r = document.getElementById('btnRotateOk').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }));
        await W(p, () => document.getElementById('btnRotateOk').click()); await sleep(200);
      }
      const hud = await p.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height }; }));
      check(tag + ': HUD buttons inside the safe area', hud.every(inSafe), hud);
      if (touch) check(tag + ': HUD buttons ≥ 44 px', hud.every(r => r.width >= 43.5 && r.height >= 43.5), hud.map(r => Math.round(r.width)).join(','));
      // canvas HUD (score pill 14..186 × 12..60, hearts to x 362, jar at 480±33) in CSS px
      const chud = await W(p, () => {
        const R = POG.Game.renderer, d = R.canvas.width / R.canvas.getBoundingClientRect().width, dy = R.hudDy();
        const rc = (x0, y0, x1, y1) => ({ x: (R.ox + x0 * R.k) / d, y: (R.oy + (y0 + dy) * R.k) / d, width: (x1 - x0) * R.k / d, height: (y1 - y0) * R.k / d });
        return { score: rc(14, 12, 186, 60), hearts: rc(185, 21, 362, 51), jar: rc(447, 5, 513, 71) };
      });
      check(tag + ': canvas HUD (score, hearts, jar) inside the safe area', inSafe(chud.score) && inSafe(chud.hearts) && inSafe(chud.jar), chud);
      const ov = (a, c) => a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
      check(tag + ': DOM HUD buttons do not cover the score, hearts or jar', !hud.some(r => ov(r, chud.score) || ov(r, chud.hearts) || ov(r, chud.jar)), { hud, chud });
      const zones = [];
      for (const lv of [0, 1, 2]) {
        await safeGoto(p, lv); await sleep(60);
        const z = await p.evaluate(() => { const R = POG.Game.renderer, d = R.canvas.width / R.canvas.getBoundingClientRect().width; return POG.debug.world.holes.map(h => ({ x: (R.ox + h.x * R.k) / d, y: (R.oy + (h.y - 45 * h.s) * R.k) / d, r: 88 * h.s * R.k / d })); });
        zones.push(...z);
      }
      const overlapHud = zones.some(z => hud.some(r => z.x + z.r > r.x && z.x - z.r < r.x + r.width && z.y + z.r > r.y && z.y - z.r < r.y + r.height));
      check(tag + ': every hole centre is on screen', zones.every(z => z.x > 0 && z.x < VW && z.y > 0 && z.y < VH));
      check(tag + ': HUD buttons never overlap a hole hit zone', !overlapHud);
      const minR = Math.min(...zones.map(z => z.r));
      check(tag + ': smallest hole hit zone is finger sized (radius ≥ 22 px)', minR >= 22, 'min radius ' + minR.toFixed(1) + ' px');
      // a real tap / click at a hole lands on that hole
      await safeGoto(p, 2); await quiet(p); await W(p, () => { POG.debug.world.levelGoal = 999; });
      let hits = 0;
      for (const i of [0, 4, 8]) {
        await ready(p); await spawn(p, i, 'firefly'); await sleep(150);
        const [x, y] = await holeXY(p, i); const b0 = await W(p, () => POG.debug.world.boops);
        if (touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
        await sleep(40);
        if ((await W(p, () => POG.debug.world.boops)) === b0 + 1) hits++;
        await sleep(300);
      }
      check(tag + ': ' + (touch ? 'taps' : 'clicks') + ' on holes 1, 5, 9 boop', hits === 3, hits + '/3');
      await safeGoto(p, 0); await sleep(800);
      await shot('play');
      await W(p, () => POG.Game.pause()); await sleep(300); await screenOk('scrPause', 'Pause');
      await W(p, () => POG.Game.resume()); await quiet(p); await forceOver(p); await sleep(400);
      await screenOk('scrOver', 'Game over'); await shot('over');
      noErr(tag, errs);
      await ctx.close();
    });
  }

  // ------------------------------------------------------------------ 11. portrait
  await section('portrait', async () => {
    const PORT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3', PORT);
    await sleep(600);
    check('portrait: no rotate card on the title', !(await visible(p, 'rotate')) && await visible(p, 'scrTitle'));
    const pb = await (await p.$('#btnPlay')).boundingBox(); await p.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(700);
    const t0 = await W(p, () => POG.debug.world.time); await sleep(500); const t1 = await W(p, () => POG.debug.world.time);
    check('portrait: rotate card shown when a game starts upright', await visible(p, 'rotate'));
    check('portrait: the game waits (world frozen) behind the rotate card', t0 === t1, [t0, t1]);
    await p.screenshot({ path: OUT + '/portrait_rotate.png' });
    const ok = await (await p.$('#btnRotateOk')).boundingBox();
    check('portrait: "Play upright anyway" is ≥ 44 px', ok.height >= 43.5, Math.round(ok.height));
    await p.touchscreen.tap(ok.x + ok.width / 2, ok.y + ok.height / 2); await sleep(500);
    const t2 = await W(p, () => POG.debug.world.time);
    check('portrait: "Play upright anyway" hides the card and the game runs', !(await visible(p, 'rotate')) && t2 > t1 && (await mode(p)) === 'playing');
    check('portrait: dismissing the card did not tap a friend or lose a heart', await W(p, () => POG.debug.world.leaves === POG.World.CONFIG.START_LEAVES && POG.debug.world.stats.wrong === 0));
    await W(p, () => { POG.debug.world.levelGoal = 999; }); await quiet(p); await spawn(p, 4, 'firefly'); await sleep(150);
    const [x, y] = await holeXY(p, 4); const b0 = await W(p, () => POG.debug.world.boops);
    await p.touchscreen.tap(x, y); await sleep(50);
    check('portrait: a tap on a friend boops in portrait', (await W(p, () => POG.debug.world.boops)) === b0 + 1);
    await p.screenshot({ path: OUT + '/portrait_play.png' });
    await W(p, () => POG.Game.pause()); await sleep(200);
    check('portrait: no rotate card over the pause menu', !(await visible(p, 'rotate')));
    await W(p, () => POG.Game.resume());
    check('portrait: card stays dismissed for the session', !(await visible(p, 'rotate')));
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(500);
    check('portrait: turning sideways re-lays out to landscape', await W(p, () => !POG.Game.renderer.portrait && Math.abs(POG.Game.renderer.W - 844) < 1) && !(await visible(p, 'rotate')));
    noErr('portrait', errs);
    await ctx.close();
    const { p: q, ctx: c2 } = await open(b, '?mute=1&seed=3&autostart=1', { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await sleep(600);
    check('portrait iPad 820x1180: no "Turn your phone sideways" card on a tablet', !(await visible(q, 'rotate')));
    await q.screenshot({ path: OUT + '/ipad_portrait.png' });
    await c2.close();
  });

  // ------------------------------------------------------------------ 12. auto-pause
  await section('autopause', async () => {
    const { p, errs, ctx } = await open(b, '?mute=1&seed=3&autostart=1');
    await p.waitForFunction(() => POG.debug.mode === 'playing'); await sleep(300);
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
    await W(p, () => POG.Game.toTitle()); await W(p, () => window.dispatchEvent(new Event('blur')));
    check('autopause: blur on the title does nothing', (await mode(p)) === 'title' && !(await visible(p, 'scrPause')));
    await startPlaying(p); await quiet(p);
    await p.evaluate(() => { const w = POG.debug.world; w.leaves = 1; POG.debug.spawn(0, 'sleepy'); });
    await sleep(150); await W(p, () => POG.debug.world.tapHole(0)); await sleep(100);
    await W(p, () => window.dispatchEvent(new Event('blur'))); await sleep(50);
    check('autopause: blur during the game-over moment does not pause', (await mode(p)) === 'playing');
    await p.waitForFunction(() => POG.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {});
    check('autopause: … and the game-over screen still arrives', (await mode(p)) === 'over');
    noErr('autopause', errs);
    await ctx.close();
  });

  // ------------------------------------------------------------------ 13. long bot soak at ?speed=16
  for (const run of [{ skill: 1, secs: SOAK, label: 'skill 1 easy' }, { skill: 0.2, diff: 'normal', secs: Math.round(SOAK * 0.6), label: 'skill 0.2 normal' }]) {
    await section('soak ' + run.label, async () => {
      const { p, errs, ctx } = await open(b, '?mute=1&seed=5&bot=1&skill=' + run.skill + '&autostart=1&autorestart=1&speed=16' + (run.diff ? '&diff=' + run.diff : ''));
      await p.waitForFunction(() => POG.debug.mode === 'playing');
      await hookEvents(p);
      const max = { particles: 0, ripples: 0, fx: 0, cache: 0, texts: 0, rings: 0, flyers: 0, level: 0, heap0: 0, heap: 0, bg: 0 };
      max.heap0 = await W(p, () => performance.memory ? performance.memory.usedJSHeapSize : 0);
      let nan = false;
      const t0 = Date.now();
      while (Date.now() - t0 < run.secs * 1000) {
        await sleep(1000);
        const s = await W(p, () => { const st = POG.debug.getState(), R = POG.Game.renderer, wx = POG.debug.weather; const bad = !isFinite(st.pip.x) || !isFinite(st.pip.y) || !isFinite(st.score) || wx.particles.some(q => !isFinite(q.x) || !isFinite(q.y)); return { particles: st.particles, ripples: wx.ripples.length, fx: st.fx, texts: R.texts.length, rings: R.rings.length, flyers: R.flyers.length, cache: POG.Assets._cache.size, level: st.level, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, bg: R._bg.size, bad }; });
        if (s.bad) nan = true; delete s.bad;
        for (const k of Object.keys(s)) max[k] = Math.max(max[k], s[k]);
        await W(p, () => { if (window._evlog.length > 5000) window._evlog.splice(0, window._evlog.length - 2000); });
      }
      const st = await W(p, () => ({ games: POG.debug.stats.games, times: POG.debug.stats.times, runT: POG.Game.runT, errors: POG.debug.stats.errors, levels: POG.debug.stats.levels, scores: POG.debug.stats.scores, mode: POG.debug.mode }));
      const gameTime = st.times.reduce((a, b) => a + b, 0) + (st.runT || 0);
      const tag = 'soak[' + run.label + ']';
      check(tag + ': ran several minutes of game time', gameTime > 60 * Math.min(4, run.secs / 15), (gameTime / 60).toFixed(1) + ' min, ' + st.games + ' games, max level ' + Math.max(max.level, ...st.levels));
      check(tag + ': no runtime errors', errs.length === 0 && st.errors.length === 0, (errs.concat(st.errors)).slice(0, 2).join(' | ') || undefined);
      check(tag + ': no NaN in Pip / score / particles', !nan);
      check(tag + ': weather particles bounded (≤ 60), ripples ≤ 12', max.particles <= 60 && max.ripples <= 12, [max.particles, max.ripples]);
      check(tag + ': fx (texts + rings + flyers) bounded (≤ 40)', max.fx <= 40, max);
      check(tag + ': sprite cache bounded (≤ 400), ≤ 3 pre-rendered chapters', max.cache <= 400 && max.bg <= 3, [max.cache, max.bg]);
      if (max.heap0) check(tag + ': JS heap stays bounded (< 120 MB)', max.heap < 120e6, Math.round(max.heap0 / 1e6) + ' → ' + Math.round(max.heap / 1e6) + ' MB');
      if (run.skill >= 1) check(tag + ': a perfect bot gets through several chapters', Math.max(max.level, ...st.levels) >= 3, Math.max(max.level, ...st.levels));
      if (run.skill < 1) check(tag + ': games end and auto-restart', st.games >= 1, st.scores.join(','));
      check(tag + ': bot runs never save a best score', await W(p, () => !Object.keys(localStorage).some(k => k.startsWith('pog:best_'))));
      await ctx.close();
    });
  }

  await b.close();
  const fails = results.filter(r => !r.ok);
  console.log('\n' + (results.length - fails.length) + ' PASS, ' + fails.length + ' FAIL');
  if (fails.length) { console.log('Failed:\n - ' + fails.map(f => f.name).join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
