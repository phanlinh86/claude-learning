// Functional QA suite for Tofu's Volcano Melody (report-only: never edits game/).
// Covers boot, every menu, every input method, the scoring/combo/pinch/mango/season rules, pause on blur,
// settings + best-score persistence, Change Pictures, layout on desktop/iPhone/iPad, and a long fast bot run.
// Usage: node tests/e2e/functional.js [outDir] [--only=group,group] [--bot-seconds=60]
// Prints PASS/FAIL per check, exits 1 on any failure. Serves game/ itself on a free port.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'game');
const args = process.argv.slice(2);
const OUT = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'out', 'functional');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const BOT_SECONDS = +((args.find(a => a.startsWith('--bot-seconds=')) || '').slice(14)) || 60;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});

let pass = 0, fails = 0;
const failed = [];
const check = (ok, name, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (ok) pass++; else { fails++; failed.push(name + (extra ? '  ' + extra : '')); }
  return ok;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// In-page helpers (installed before the game scripts run; they only read PVM lazily).
const HELPERS = () => {
  window.__qa = {
    w: () => PVM.debug.world,
    // put a resting note on the ground at (x, y) (default: on Tofu's feet → caught next sub-step)
    note(dx = 0, dy = 0, kind = 0) {
      const w = PVM.debug.world, T = w.tofu, x = T.x + dx, y = T.y + dy;
      const n = { id: ++w._nid, kind, x, y, z: 0, vx: 0, vy: 0, vz: 0, prevX: x, prevY: y, prevZ: 0, state: 'ground', age: 0, life: 30, src: 'pop' };
      w.notes.push(n); return n.id;
    },
    // a chasing crab right on top of Tofu → pinch on the next sub-step
    crabOnTofu(w) {
      w = w || PVM.debug.world;
      const k = w._spawnCrab(); w._crabsLeft++;
      k.state = 'chase'; k.stateT = 0; k._modeT = 99; k.x = k.prevX = w.tofu.x + 2; k.y = k.prevY = w.tofu.y; k.vx = k.vy = 0;
      return k;
    },
    calm(w) {   // no spawns, no crabs, no Coco: a quiet world for rule checks
      w = w || PVM.debug.world;
      w.crabs = []; w._crabsLeft = 0; w._popTimer = 1e9; w.volcano.next = 1e9; w.volcano.rumbleT = 0; w._mangoT = 1e9; w.notes = []; w.coco = null;
    },
    forceOver() {
      const w = PVM.debug.world; w.hearts = 1; w.invulnT = 0; if (w.tofu.state === 'hurt') w.tofu.state = 'idle';
      __qa.crabOnTofu(w);
    },
    visibleScreens() { return [...document.querySelectorAll('.screen')].filter(s => !s.classList.contains('hidden') && getComputedStyle(s).display !== 'none').map(s => s.id); },
    wrapStart() {
      const G = PVM.Game; if (G.__wrapped) { G.__starts = 0; return; }
      const o = G.startGame; G.__starts = 0; G.__wrapped = true;
      G.startGame = function () { G.__starts++; return o.apply(this, arguments); };
    }
  };
};

async function openPage(browser, opts, query, label) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
  await ctx.addInitScript(HELPERS);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push((label || '') + ' console: ' + m.text()); });
  p.on('pageerror', e => errs.push((label || '') + ' pageerror: ' + e));
  p.on('requestfailed', r => errs.push((label || '') + ' request failed ' + r.url()));
  p.on('response', r => { if (r.status() >= 400) errs.push((label || '') + ' HTTP ' + r.status() + ' ' + r.url()); });
  p.errs = errs; p.ctxRef = ctx;
  if (query != null) await gotoGame(p, query);
  return p;
}
let BASE = '';
async function gotoGame(p, query, mode) {
  await p.goto(BASE + (query || ''));
  await p.waitForFunction(m => window.PVM && PVM.debug && PVM.debug.mode === m, mode || (/autostart=1/.test(query || '') ? 'playing' : 'title'), { timeout: 15000 });
}
const waitPhase = (p, ph, t) => p.waitForFunction(x => PVM.debug.world && PVM.debug.world.phase === x, ph, { timeout: t || 15000 });
const waitMode = (p, m, t) => p.waitForFunction(x => PVM.debug.mode === x, m, { timeout: t || 15000 });
const ev = (p, fn, a) => p.evaluate(fn, a);
// wait for N seconds of GAME time (robust on a loaded machine where real-time sleeps drift)
async function holdGame(p, secs) {
  const t0 = await ev(p, () => PVM.debug.world.t);
  await p.waitForFunction(a => PVM.debug.world.t >= a, t0 + secs, { timeout: 15000, polling: 'raf' });
}
async function toScreen(p, lx, ly) {
  const box = await p.locator('#game').boundingBox();
  const R = await ev(p, () => ({ s: PVM.Game.renderer.cssScale, ox: PVM.Game.renderer.ox, oy: PVM.Game.renderer.oy }));
  return [box.x + (lx + R.ox) * R.s, box.y + (ly + R.oy) * R.s];
}
async function startManual(p) {
  await p.click('#btnPlay');
  await waitPhase(p, 'playing');
  await ev(p, () => __qa.calm());
}
async function closePage(p) { await p.ctxRef.close(); }
const want = g => !ONLY.length || ONLY.includes(g);
const allErrors = [];

// ============================================================================================
async function testBootAndMenus(b) {
  const p = await openPage(b, null, '?mute=1&seed=7', 'boot');
  await sleep(2500);
  await p.screenshot({ path: path.join(OUT, 'boot_title.png') });
  check(await p.isVisible('#scrTitle'), 'boot: title screen visible');
  check((await ev(p, () => __qa.visibleScreens())).join() === 'scrTitle', 'boot: exactly one screen visible on the title');
  check(await ev(p, () => PVM.debug.world.t > 1 && !!PVM.debug.world.tofu), 'boot: attract demo runs behind the title');
  check(await ev(p, () => PVM.debug.stats.errors.length === 0), 'boot: no frame errors');
  check(p.errs.length === 0, 'boot: zero console errors / failed requests', p.errs.slice(0, 3).join(' | '));

  // title sub-menus: open with click, close with the back button and with Escape
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.click(btn); await sleep(300);
    check((await ev(p, () => __qa.visibleScreens())).join() === scr, 'menu: ' + btn + ' opens only #' + scr);
    await p.click('#' + scr + ' .btn-back'); await sleep(250);
    check(await p.isVisible('#scrTitle') && !(await p.isVisible('#' + scr)), 'menu: #' + scr + ' back button returns to title');
    await p.click(btn); await sleep(300);
    await p.keyboard.press('Escape'); await sleep(250);
    check(await p.isVisible('#scrTitle'), 'menu: Escape closes #' + scr);
  }

  // pause menu
  await startManual(p);
  check(await ev(p, () => PVM.debug.mode === 'playing' && !document.getElementById('hud').classList.contains('hidden')), 'menu: Play starts a game with the HUD shown');
  await p.click('#btnPause'); await sleep(250);
  check(await ev(p, () => PVM.debug.mode === 'paused') && await p.isVisible('#scrPause'), 'pause: HUD pause button opens the pause screen');
  const t0 = await ev(p, () => PVM.debug.world.t); await sleep(400);
  check(await ev(p, () => PVM.debug.world.t) === t0, 'pause: the world is frozen while paused');
  await p.click('#btnResume'); await sleep(250);
  check(await ev(p, () => PVM.debug.mode === 'playing') && !(await p.isVisible('#scrPause')), 'pause: Resume continues');
  await sleep(200);
  check(await ev(p, () => PVM.debug.world.t) > t0, 'pause: world runs again after Resume');
  await p.keyboard.press('Escape'); await sleep(200);
  check(await ev(p, () => PVM.debug.mode === 'paused'), 'pause: Esc pauses');
  await p.keyboard.press('Escape'); await sleep(200);
  check(await ev(p, () => PVM.debug.mode === 'playing'), 'pause: Esc on the pause screen resumes');
  await p.keyboard.press('KeyP'); await sleep(200);
  check(await ev(p, () => PVM.debug.mode === 'paused'), 'pause: P pauses');
  // Restart
  await ev(p, () => { PVM.debug.world.score = 777; });
  await p.click('#btnRestart'); await sleep(300);
  check(await ev(p, () => PVM.debug.mode === 'playing' && PVM.debug.world.score === 0 && PVM.debug.world.t < 1.5), 'pause: Restart starts a fresh run');
  // Settings from pause → back returns to pause
  await waitPhase(p, 'playing');
  await p.click('#btnPause'); await sleep(250);
  await p.click('#btnPauseSettings'); await sleep(250);
  check((await ev(p, () => __qa.visibleScreens())).join() === 'scrSettings', 'pause: Settings opens from pause');
  await p.click('#scrSettings .btn-back'); await sleep(250);
  check(await p.isVisible('#scrPause') && await ev(p, () => PVM.debug.mode === 'paused'), 'pause: Settings Done returns to the pause screen (still paused)');
  await p.keyboard.press('Escape'); await sleep(200);
  check(await ev(p, () => PVM.debug.mode === 'playing'), 'pause: Esc resumes after visiting Settings');
  await p.keyboard.press('Escape'); await sleep(200);
  await p.click('#btnPauseMenu'); await sleep(300);
  check(await ev(p, () => PVM.debug.mode === 'title') && await p.isVisible('#scrTitle') && await ev(p, () => document.getElementById('hud').classList.contains('hidden')), 'pause: Main Menu returns to the title, HUD hidden');

  // game over: Play Again / Menu, and the 0.7 s restart lock
  await startManual(p);
  // click Play Again and press Enter right after game over (in-page, synchronously after Game.gameOver): inside the lock
  await ev(p, () => {
    const G = PVM.Game, o = G.gameOver; window.__lock = null;
    G.gameOver = function () {
      const r = o.apply(this, arguments); G.gameOver = o;
      setTimeout(() => {
        const dt = performance.now() - G.overAt;
        document.getElementById('btnAgain').click(); const m1 = G.mode;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); const m2 = G.mode;
        window.__lock = { dt, m1, m2 };
      }, 100);
      return r;
    };
    __qa.forceOver();
  });
  await p.waitForFunction(() => window.__lock, null, { timeout: 15000 });
  const lk = await ev(p, () => window.__lock);
  check(lk.m1 === 'over', 'over: Play Again is ignored during the 0.7 s lock', 'clicked ' + lk.dt.toFixed(0) + ' ms after game over');
  check(lk.m2 === 'over', 'over: Enter is ignored during the 0.7 s lock');
  await p.screenshot({ path: path.join(OUT, 'over.png') });
  check((await ev(p, () => __qa.visibleScreens())).join() === 'scrOver', 'over: only the game-over screen is visible');
  check(await ev(p, () => document.getElementById('hud').classList.contains('hidden')), 'over: HUD buttons hidden on game over');
  await sleep(800);
  await p.click('#btnAgain'); await sleep(300);
  check(await ev(p, () => PVM.debug.mode === 'playing' && PVM.debug.world.score === 0), 'over: Play Again starts a new run after the lock');
  await waitPhase(p, 'playing'); await ev(p, () => __qa.calm());
  await ev(p, () => __qa.forceOver());
  await waitMode(p, 'over');
  await sleep(800);
  await p.click('#btnOverMenu'); await sleep(300);
  check(await ev(p, () => PVM.debug.mode === 'title') && await p.isVisible('#scrTitle'), 'over: Menu returns to the title');
  check(await ev(p, () => PVM.debug.stats.errors.length === 0), 'menus: no frame errors');
  allErrors.push(...p.errs);
  await closePage(p);
}

// ============================================================================================
async function testInput(b) {
  const p = await openPage(b, null, '?mute=1&seed=11', 'input');
  await startManual(p);
  const tofu = () => ev(p, () => ({ x: PVM.debug.world.tofu.x, y: PVM.debug.world.tofu.y, vx: PVM.debug.world.tofu.vx, vy: PVM.debug.world.tofu.vy, target: PVM.debug.world.target, axis: PVM.debug.world.axis }));
  // mouse hold
  let s = await tofu();
  let [mx, my] = await toScreen(p, s.x + 280, s.y - 20);
  await p.mouse.move(mx, my); await p.mouse.down();
  await sleep(100);
  let a = await tofu();
  check(a.target && Math.abs(a.target.x - (s.x + 280)) < 3, 'input: mouse down sets the walk target', a.target && a.target.x.toFixed(1));
  await holdGame(p, 0.6);
  a = await tofu();
  check(a.x > s.x + 80, 'input: holding the mouse walks Tofu towards it', s.x.toFixed(0) + ' -> ' + a.x.toFixed(0));
  // drag: move left while held → target follows
  [mx, my] = await toScreen(p, a.x - 250, a.y - 60);
  await p.mouse.move(mx, my, { steps: 4 }); await sleep(80);
  const d = await tofu();
  check(d.target && d.target.x < a.x - 200, 'input: dragging the mouse updates the target', d.target && d.target.x.toFixed(0));
  await holdGame(p, 0.5);
  const d2 = await tofu();
  check(d2.x < d.x - 40, 'input: Tofu turns and follows the dragged target', d.x.toFixed(0) + ' -> ' + d2.x.toFixed(0));
  await p.mouse.up(); await sleep(50);
  const u = await tofu();
  check(u.target === null, 'input: mouse release clears the target');
  await holdGame(p, 0.35);
  const u2 = await tofu(); await holdGame(p, 0.2); const u3 = await tofu();
  check(Math.hypot(u3.x - u2.x, u3.y - u2.y) < 1 && Math.hypot(u3.vx, u3.vy) < 1, 'input: Tofu stops after release', 'moved ' + Math.hypot(u3.x - u2.x, u3.y - u2.y).toFixed(2));
  // arrow keys + WASD
  for (const [key, ax, ay] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['KeyD', 1, 0], ['KeyA', -1, 0], ['KeyW', 0, -1], ['KeyS', 0, 1]]) {
    await ev(p, () => { const w = PVM.debug.world; w.tofu.x = w.tofu.prevX = 600; w.tofu.y = w.tofu.prevY = 440; w.tofu.vx = w.tofu.vy = 0; });
    await p.keyboard.down(key); await holdGame(p, 0.26);
    const k = await tofu();
    await p.keyboard.up(key); await sleep(30);
    const k2 = await tofu();
    const moved = (k.x - 600) * ax + (k.y - 440) * ay;
    check(k.axis.x === ax && k.axis.y === ay && moved > 25 && k2.axis.x === 0 && k2.axis.y === 0, 'input: key ' + key + ' walks Tofu and stops on release', 'moved ' + moved.toFixed(0));
  }
  // diagonal
  await ev(p, () => { const w = PVM.debug.world; w.tofu.x = w.tofu.prevX = 400; w.tofu.y = w.tofu.prevY = 460; w.tofu.vx = w.tofu.vy = 0; });
  await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowRight'); await holdGame(p, 0.35);
  const dg = await tofu();
  const sp = Math.hypot(dg.vx, dg.vy), max = await ev(p, () => PVM.debug.world.diff.speed);
  check(Math.abs(dg.axis.x - Math.SQRT1_2) < 1e-3 && Math.abs(dg.axis.y + Math.SQRT1_2) < 1e-3, 'input: diagonal keys give a normalised axis', JSON.stringify(dg.axis));
  check(dg.x > 420 && dg.y < 440 && sp <= max + 1, 'input: diagonal walks up-right, not faster than straight', 'speed ' + sp.toFixed(0) + ' / ' + max);
  // keys released on blur: window blur clears keys and pauses
  await ev(p, () => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  const bl = await ev(p, () => ({ mode: PVM.debug.mode, axis: PVM.debug.world.axis }));
  check(bl.mode === 'paused', 'input: window blur pauses the game');
  check(bl.axis.x === 0 && bl.axis.y === 0, 'input: window blur releases held keys');
  await p.click('#btnResume'); await sleep(300);
  const afterRes = await tofu(); await holdGame(p, 0.25); const afterRes2 = await tofu();
  check(Math.hypot(afterRes2.x - afterRes.x, afterRes2.y - afterRes.y) < 1, 'input: no "stuck key" walking after blur + resume');
  await p.keyboard.up('ArrowUp'); await p.keyboard.up('ArrowRight');
  // visibilitychange
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check(await ev(p, () => PVM.debug.mode === 'paused'), 'input: visibilitychange (hidden) pauses the game');
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check(await ev(p, () => PVM.debug.mode === 'paused'), 'input: becoming visible again stays paused (child resumes)');
  await p.click('#btnResume'); await sleep(200);
  // HUD buttons never move Tofu (mouse)
  await ev(p, () => PVM.debug.world.clearTarget());
  const pb = await p.locator('#btnPause').boundingBox();
  await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await p.mouse.down(); await sleep(80);
  check(await ev(p, () => PVM.debug.world.target === null), 'input: pointerdown on #btnPause does not set a walk target (mouse)');
  await p.mouse.up(); await sleep(200);
  check(await ev(p, () => PVM.debug.mode === 'paused'), 'input: clicking #btnPause pauses');
  await p.click('#btnResume'); await sleep(200);
  const mb = await p.locator('#btnMuteHud').boundingBox();
  await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await p.mouse.down(); await sleep(80);
  check(await ev(p, () => PVM.debug.world.target === null), 'input: pointerdown on #btnMuteHud does not set a walk target');
  await p.mouse.up(); await sleep(100);
  check(await ev(p, () => !PVM.Game.urlMute && !PVM.Game.settings.muted), 'input: mute button on a ?mute=1 run un-mutes for this session');
  await p.click('#btnMuteHud'); await sleep(100);
  // Enter / Space during play do nothing
  await ev(p, () => __qa.wrapStart());
  await p.keyboard.press('Enter'); await p.keyboard.press('Space'); await sleep(200);
  check(await ev(p, () => PVM.Game.__starts === 0 && PVM.debug.mode === 'playing'), 'input: Enter/Space during play do not restart or pause');
  // Space / Enter on a focused title button: exactly one start
  for (const key of ['Enter', 'Space']) {
    await ev(p, () => PVM.Game.toTitle()); await sleep(200);
    await ev(p, () => __qa.wrapStart());
    await p.focus('#btnPlay');
    await p.keyboard.press(key); await sleep(400);
    check(await ev(p, () => PVM.Game.__starts === 1 && PVM.debug.mode === 'playing'), 'input: ' + key + ' on focused Play starts exactly once', 'starts=' + await ev(p, () => PVM.Game.__starts));
  }
  // Space on a focused secondary title button opens that menu only (no game start)
  await ev(p, () => PVM.Game.toTitle()); await sleep(200);
  await ev(p, () => __qa.wrapStart());
  await p.focus('#btnHow'); await p.keyboard.press('Space'); await sleep(300);
  check(await ev(p, () => PVM.Game.__starts === 0 && PVM.UI.current === 'scrHow'), 'input: Space on focused How to Play opens it, no start');
  await p.keyboard.press('Escape'); await sleep(200);
  // over screen: Enter / Space on the auto-focused Play Again → exactly one start
  for (const key of ['Enter', 'Space']) {
    await ev(p, () => PVM.Game.startGame()); await waitPhase(p, 'playing'); await ev(p, () => __qa.calm());
    await ev(p, () => __qa.forceOver()); await waitMode(p, 'over'); await sleep(800);
    await ev(p, () => __qa.wrapStart());
    const foc = await ev(p, () => document.activeElement && document.activeElement.id);
    await p.keyboard.press(key); await sleep(400);
    check(await ev(p, () => PVM.Game.__starts === 1 && PVM.debug.mode === 'playing'), 'input: ' + key + ' on game over (focus ' + foc + ') restarts exactly once', 'starts=' + await ev(p, () => PVM.Game.__starts));
  }
  // over screen: Enter on focused Menu goes to the menu, does not restart
  await waitPhase(p, 'playing'); await ev(p, () => __qa.calm());
  await ev(p, () => __qa.forceOver()); await waitMode(p, 'over'); await sleep(800);
  await ev(p, () => __qa.wrapStart());
  await p.focus('#btnOverMenu'); await p.keyboard.press('Enter'); await sleep(300);
  check(await ev(p, () => PVM.Game.__starts === 0 && PVM.debug.mode === 'title'), 'input: Enter on focused Menu (game over) goes to the title only');
  check(await ev(p, () => PVM.debug.stats.errors.length === 0), 'input: no frame errors');
  allErrors.push(...p.errs);
  await closePage(p);

  // ---- touch (iPad-like, hasTouch) ----
  const t = await openPage(b, { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?mute=1&seed=12', 'touch');
  check(await ev(t, () => PVM.Game.isTouch), 'touch: game detects a touch device');
  await t.tap('#btnPlay');
  await waitPhase(t, 'playing'); await ev(t, () => __qa.calm());
  const cdp = await t.ctxRef.newCDPSession(t);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const s0 = await ev(t, () => ({ x: PVM.debug.world.tofu.x, y: PVM.debug.world.tofu.y }));
  let [tx, ty] = await toScreen(t, s0.x + 260, s0.y - 30);
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }]); await sleep(100);
  let tt = await ev(t, () => PVM.debug.world.target);
  check(tt && Math.abs(tt.x - (s0.x + 260)) < 3 && Math.abs(tt.y - (s0.y - 30 - 10)) < 3, 'touch: finger down sets a target just above the finger', tt && (tt.x.toFixed(0) + ',' + tt.y.toFixed(0)));
  await holdGame(t, 0.6);
  const s1 = await ev(t, () => ({ x: PVM.debug.world.tofu.x, y: PVM.debug.world.tofu.y }));
  check(s1.x > s0.x + 80, 'touch: holding a finger walks Tofu', s0.x.toFixed(0) + ' -> ' + s1.x.toFixed(0));
  [tx, ty] = await toScreen(t, s1.x - 250, s1.y - 40);
  for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: tx + (4 - i) * 30, y: ty, id: 1 }]);
  await sleep(80);
  tt = await ev(t, () => PVM.debug.world.target);
  check(tt && tt.x < s1.x - 200, 'touch: dragging the finger updates the target', tt && tt.x.toFixed(0));
  await touch('touchEnd', []); await sleep(60);
  check(await ev(t, () => PVM.debug.world.target === null), 'touch: lifting the finger clears the target');
  // a second finger tapping Pause while the first steers
  [tx, ty] = await toScreen(t, 600, 420);
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }]); await sleep(80);
  const pbt = await t.locator('#btnPause').boundingBox();
  const px = pbt.x + pbt.width / 2, py = pbt.y + pbt.height / 2;
  const tgtBefore = await ev(t, () => PVM.debug.world.target);
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }, { x: px, y: py, id: 2 }]); await sleep(60);
  const tgtDuring = await ev(t, () => PVM.debug.world.target);
  check(tgtDuring && tgtBefore && Math.abs(tgtDuring.x - tgtBefore.x) < 1, 'touch: a 2nd finger on #btnPause does not retarget Tofu');
  // CDP cannot lift one finger of two on its own; lifting both sends finger 1's pointerup, then finger 2's (on the button)
  await touch('touchEnd', []); await sleep(100);
  check(await ev(t, () => PVM.debug.mode === 'paused'), 'touch: 2nd-finger tap on #btnPause pauses while steering');
  check(await ev(t, () => PVM.debug.world.target === null), 'touch: pause clears the walk target');
  await t.tap('#btnResume'); await sleep(250);
  check(await ev(t, () => PVM.debug.mode === 'playing'), 'touch: tap Resume');
  // single finger on the pause button: never a target
  await touch('touchStart', [{ x: px, y: py, id: 3 }]); await sleep(60);
  check(await ev(t, () => PVM.debug.world.target === null), 'touch: finger down on #btnPause does not set a target');
  await touch('touchEnd', []); await sleep(250);
  check(await ev(t, () => PVM.debug.mode === 'paused'), 'touch: tapping #btnPause pauses');
  // ghost click: the tap that opened Pause must not hit a button underneath on the next screen
  await sleep(700);
  check(await ev(t, () => PVM.debug.mode === 'paused' && PVM.UI.current === 'scrPause'), 'touch: no ghost click after tapping Pause');
  check(await ev(t, () => PVM.debug.stats.errors.length === 0), 'touch: no frame errors');
  allErrors.push(...t.errs);
  await closePage(t);
}

// ============================================================================================
async function testRules(b) {
  const p = await openPage(b, null, '?mute=1&seed=21', 'rules');
  // headless World inside the page (same code the game runs), quiet so only our notes/crabs matter
  const r = await ev(p, () => {
    const out = {}, step = 1 / 120;
    const adv = (w, t) => { while (t > 1e-9) { const d = Math.min(0.1, t); w.update(d); t -= d; } };   // update() caps dt at maxDt
    const W = (diff) => { const w = new PVM.World({ seed: 9, difficulty: diff || 'normal', level: 0 }); adv(w, 1.3); w.drainEvents(); __qa.calm(w); return w; };
    const put = (w, dx = 0, dy = 0) => { const T = w.tofu; w.notes.push({ id: ++w._nid, kind: 1, x: T.x + dx, y: T.y + dy, z: 0, vx: 0, vy: 0, vz: 0, prevX: T.x + dx, prevY: T.y + dy, prevZ: 0, state: 'ground', age: 0, life: 30, src: 'pop' }); };
    let w = W(); out.phase = w.phase; w.goal = 999;
    const vals = [], combos = [];
    let ev = [];
    for (let i = 0; i < 13; i++) { put(w); w.update(step); const e = w.drainEvents(); ev = ev.concat(e); const n = e.find(x => x.type === 'note'); vals.push(n ? n.score : null); combos.push(w.combo); if (i === 4) { out.cocoAt5 = !!w.coco; out.helperInAt5 = e.some(x => x.type === 'helperIn'); } if (i === 3) out.cocoAt4 = !!w.coco; w.coco = null; }
    out.vals = vals; out.combos = combos; out.score = w.score;
    out.noteEvt = ev.find(x => x.type === 'note');
    // combo window: within the window continues, after it restarts at 1
    w = W(); w.goal = 999; const cw = w.comboWindow;
    put(w); w.update(step); adv(w, cw - 0.1); put(w); w.update(step); out.within = w.combo;
    adv(w, cw + 0.05); const ce = w.drainEvents(); out.afterWindow = w.combo; out.comboEndEvt = ce.find(x => x.type === 'comboEnd');
    put(w); w.update(step); out.restart = w.combo; out.restartVal = w.drainEvents().find(x => x.type === 'note').score;
    // pinch
    w = W(); w.goal = 999; put(w); w.update(step); put(w); w.update(step); const h0 = w.hearts; w.drainEvents();
    __qa.crabOnTofu(w); w.update(step); let pe = w.drainEvents();
    out.pinch = { h0, h1: w.hearts, inv: w.invulnT, invCfg: PVM.CONFIG.invulnTime, state: w.tofu.state, combo: w.combo, evt: pe.find(x => x.type === 'pinch'), comboEnd: pe.some(x => x.type === 'comboEnd'), crabState: w.crabs[w.crabs.length - 1].state };
    // a second crab during invulnerability: no heart lost
    adv(w, 0.5); __qa.crabOnTofu(w); w.update(step); out.pinch.duringInv = w.hearts; w.crabs = [];
    for (let i = 0; i < 20; i++) adv(w, 0.1);   // 2 s more: invulnerability over
    out.pinch.invAfter = w.invulnT;
    w.crabs = []; __qa.crabOnTofu(w); w.update(step); out.pinch.afterInv = w.hearts;
    // knock-back: Tofu pushed away from the crab
    // last heart → over
    w.invulnT = 0; w.hearts = 1; w.crabs = []; w.tofu.state = 'idle'; __qa.crabOnTofu(w); w.update(step); pe = w.drainEvents();
    out.over = { phase: w.phase, hearts: w.hearts, gameOver: pe.some(x => x.type === 'gameOver'), tofu: w.tofu.state };
    w.setTarget(900, 200); adv(w, 1); out.over.frozen = Math.hypot(w.tofu.vx, w.tofu.vy) < 1;
    // mango
    w = W(); w.hearts = w.maxHearts - 1; const T = w.tofu;
    w.mango = { x: T.x, y: T.y, z: 0, vz: 0, prevX: T.x, prevY: T.y, prevZ: 0, age: 0, life: 9 }; w.update(step);
    out.mango = { hearts: w.hearts, max: w.maxHearts, gone: w.mango === null, evt: w.drainEvents().find(x => x.type === 'mango') };
    w.mango = { x: T.x, y: T.y, z: 0, vz: 0, prevX: T.x, prevY: T.y, prevZ: 0, age: 0, life: 9 }; w.update(step);
    out.mango.capped = w.hearts;
    // mango never spawns at full hearts
    w = W(); w._mangoT = 0.01; adv(w, 0.1); out.mango.spawnFull = w.mango;
    // season clear (perfect) → next season
    w = W(); w.got = w.goal - 1; const s0 = w.score; put(w); w.update(step); let le = w.drainEvents();
    const nv = le.find(x => x.type === 'note');
    out.clear = { phase: w.phase, bonus: w.score - s0 - nv.score, evt: le.find(x => x.type === 'levelClear') };
    adv(w, 2.7); le = w.drainEvents();
    out.clear.after = { level: w.level, season: w.season, phase: w.phase, got: w.got, levelUp: le.find(x => x.type === 'levelUp'), intro: le.find(x => x.type === 'intro') };
    // non-perfect clear
    w = W(); w.goal = 3; __qa.crabOnTofu(w); w.update(step); w.crabs = []; adv(w, 2.2); w.drainEvents(); w.got = w.goal - 1; const s1 = w.score; put(w); w.update(step);
    const le2 = w.drainEvents(); out.clear.imperfectBonus = w.score - s1 - le2.find(x => x.type === 'note').score;
    // pickR edge: a note just outside pickR is not caught, just inside is
    w = W(); w.goal = 999; put(w, PVM.CONFIG.pickR + 2, 0); w.update(step); out.pickOut = w.got; w.notes = []; put(w, PVM.CONFIG.pickR - 2, 0); w.update(step); out.pickIn = w.got;
    // high note (z ≥ catchZ) is not caught
    w = W(); w.goal = 999; put(w); w.notes[0].z = 60; w.notes[0].state = 'fly'; w.notes[0].vz = 300; w.update(step); out.highNote = w.got;
    // loop scaling
    w = new PVM.World({ seed: 1, difficulty: 'normal', level: 4 }); out.loop = { loop: w.loop, goal: w.goal, base: PVM.DIFFICULTY.normal.goal[0], crab: w.crabSpeed, crab0: PVM.DIFFICULTY.normal.crabSpeed[0] };
    out.easyHearts = new PVM.World({ difficulty: 'easy' }).hearts; out.normalHearts = new PVM.World({ difficulty: 'normal' }).hearts;
    return out;
  });
  const expect = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 30, 30, 30];
  check(r.phase === 'playing', 'rules: intro → playing after 1.2 s');
  check(JSON.stringify(r.vals) === JSON.stringify(expect), 'rules: note value = 10 + 2·min(10, combo)', JSON.stringify(r.vals));
  check(r.combos.join() === '1,2,3,4,5,6,7,8,9,10,11,12,13', 'rules: combo grows by one per chained note');
  check(r.score === expect.reduce((a, b) => a + b, 0), 'rules: score sums note values', r.score);
  check(r.noteEvt && r.noteEvt.idx === 0 && r.noteEvt.combo === 1 && r.noteEvt.byCoco === false, 'rules: note event carries idx/combo/byCoco');
  check(!r.cocoAt4 && r.cocoAt5 && r.helperInAt5, 'rules: Coco arrives exactly at combo 5 (helperIn)');
  check(r.within === 2, 'rules: a catch within the combo window continues the chain', 'combo=' + r.within);
  check(r.afterWindow === 0 && r.comboEndEvt && r.comboEndEvt.n === 2, 'rules: the chain ends after the window (comboEnd n=2)');
  check(r.restart === 1 && r.restartVal === 12, 'rules: next note after the window restarts at combo 1 (12 pts)');
  const P = r.pinch;
  check(P.h1 === P.h0 - 1 && P.evt && P.evt.hearts === P.h1, 'rules: a pinch costs one heart (pinch event)', P.h0 + ' -> ' + P.h1);
  check(Math.abs(P.inv - P.invCfg) < 0.02 && P.state === 'hurt' && P.crabState === 'dizzy', 'rules: pinch → CONFIG.invulnTime invulnerability, Tofu hurt, crab dizzy', 'inv=' + P.inv.toFixed(3));
  check(P.combo === 0 && P.comboEnd, 'rules: a pinch ends the combo');
  check(P.duringInv === P.h1, 'rules: no heart lost during invulnerability');
  check(P.invAfter === 0 && P.afterInv === P.h1 - 1, 'rules: after invulnerability a pinch hurts again', JSON.stringify(P));
  check(r.over.phase === 'over' && r.over.hearts === 0 && r.over.gameOver && r.over.tofu === 'sleep', 'rules: last heart → over, gameOver event, Tofu naps');
  check(r.over.frozen, 'rules: no movement input after game over');
  check(r.mango.hearts === r.mango.max && r.mango.gone && r.mango.evt, 'rules: mango restores a heart');
  check(r.mango.capped === r.mango.max, 'rules: mango never exceeds max hearts');
  check(r.mango.spawnFull === null, 'rules: no mango spawns at full hearts');
  check(r.clear.phase === 'clear' && r.clear.bonus === 100 && r.clear.evt && r.clear.evt.perfect, 'rules: perfect season clear = +50 +50', 'bonus=' + r.clear.bonus);
  check(r.clear.imperfectBonus === 50, 'rules: season clear after losing a heart = +50', 'bonus=' + r.clear.imperfectBonus);
  const A = r.clear.after;
  check(A.level === 1 && A.season === 1 && A.phase === 'intro' && A.got === 0 && A.levelUp && A.intro, 'rules: after the 2.6 s clear the next season starts (levelUp + intro)', JSON.stringify({ l: A.level, ph: A.phase }));
  check(r.pickOut === 0 && r.pickIn === 1, 'rules: pick-up radius = CONFIG.pickR');
  check(r.highNote === 0, 'rules: a note high in the air is not caught');
  check(r.loop.loop === 1 && r.loop.goal === r.loop.base + 2 && Math.abs(r.loop.crab - r.loop.crab0 * 1.1) < 0.01, 'rules: year 2 → goal +2, crabs ×1.1', JSON.stringify(r.loop));
  check(r.easyHearts === 5 && r.normalHearts === 3, 'rules: 5 hearts on Easy, 3 on Normal');

  // ---- the same rules in the running game (renderer + HUD + season visuals) ----
  await startManual(p);
  await ev(p, () => { const w = PVM.debug.world; w.goal = 999; });
  for (let i = 0; i < 5; i++) { await ev(p, () => __qa.note()); await sleep(60); }
  const g1 = await ev(p, () => ({ score: PVM.debug.world.score, combo: PVM.debug.world.combo, coco: !!PVM.debug.world.coco, texts: PVM.Game.renderer.texts.map(t => t.text) }));
  check(g1.score === 12 + 14 + 16 + 18 + 20 && g1.combo === 5, 'game: five chained notes in-game score 80', 'score=' + g1.score);
  check(g1.coco, 'game: Coco flies in at combo 5 in-game');
  check(g1.texts.some(t => /Combo ×5/.test(t)) && g1.texts.some(t => t === '+20'), 'game: "+20" and "Combo ×5!" popups shown', JSON.stringify(g1.texts));
  await sleep(1500);
  await p.screenshot({ path: path.join(OUT, 'rules_coco.png') });
  // pinch in game
  await ev(p, () => { PVM.debug.world.coco = null; __qa.calm(); __qa.crabOnTofu(); });
  await sleep(150);
  const g2 = await ev(p, () => ({ hearts: PVM.debug.world.hearts, max: PVM.debug.world.maxHearts, inv: PVM.debug.world.invulnT, texts: PVM.Game.renderer.texts.map(t => t.text) }));
  check(g2.hearts === g2.max - 1 && g2.inv > 1.5 && g2.texts.includes('Ouch!'), 'game: pinch in-game → heart lost, invulnerable, "Ouch!"');
  // mango in game
  await ev(p, () => { const w = PVM.debug.world, T = w.tofu; w.crabs = []; w.mango = { x: T.x, y: T.y, z: 0, vz: 0, prevX: T.x, prevY: T.y, prevZ: 0, age: 0, life: 9 }; });
  await sleep(150);
  check(await ev(p, () => PVM.debug.world.hearts === PVM.debug.world.maxHearts), 'game: mango in-game restores the heart');
  // season clear → summer visuals
  await ev(p, () => { const w = PVM.debug.world; w.goal = w.got + 1; __qa.note(); });
  await p.waitForFunction(() => PVM.debug.world.level === 1, null, { timeout: 8000 });
  await sleep(1400);
  const g3 = await ev(p, () => ({ vis: PVM.Game.renderer.vis.cur, wx: PVM.debug.weather.season, phase: PVM.debug.world.phase, ambient: PVM.debug.weather.particles.filter(q => q.ambient && !q.fading).map(q => q.sprite) }));
  check(g3.vis === 1 && g3.wx === 1, 'game: season clear switches renderer + weather to summer', JSON.stringify({ vis: g3.vis, wx: g3.wx }));
  check(g3.ambient.length > 0 && !g3.ambient.includes('blossom'), 'game: summer ambience replaces spring petals', [...new Set(g3.ambient)].join(','));
  await p.screenshot({ path: path.join(OUT, 'rules_summer.png') });
  // gotoLevel 3 → winter volcano
  await ev(p, () => { PVM.debug.gotoLevel(3); });
  await sleep(1600);
  const g4 = await ev(p, () => ({ vis: PVM.Game.renderer.vis.cur, wx: PVM.debug.weather.season, sprites: [...new Set(PVM.debug.weather.particles.map(q => q.sprite))] }));
  check(g4.vis === 3 && g4.wx === 3 && g4.sprites.includes('snowflake'), 'game: gotoLevel(3) shows winter with snow', JSON.stringify(g4));
  await p.screenshot({ path: path.join(OUT, 'rules_winter.png') });
  // game over after the last heart → over screen, 0.7 s lock
  await ev(p, () => __qa.calm());
  await waitPhase(p, 'playing');
  await ev(p, () => __qa.forceOver());
  await p.waitForFunction(() => PVM.debug.world.phase === 'over', null, { timeout: 5000 });
  check(await ev(p, () => PVM.debug.mode === 'playing'), 'game: the nap is shown before the game-over screen');
  await waitMode(p, 'over', 6000);
  // click Play Again every frame from inside the page; record when the first click is accepted
  await ev(p, () => { __qa.wrapStart(); window.__acc = -1; const f = () => { if (PVM.Game.__starts > 0) return; document.getElementById('btnAgain').click(); if (PVM.Game.__starts > 0) { window.__acc = performance.now() - PVM.Game.overAt; return; } requestAnimationFrame(f); }; f(); });
  await p.waitForFunction(() => window.__acc >= 0, null, { timeout: 10000 }).catch(() => {});
  const started = await ev(p, () => window.__acc);
  check(started >= 700 && started < 1000, 'game: restart lock ≈0.7 s after game over', 'first accepted click ' + started.toFixed(0) + ' ms after game over');
  check(await ev(p, () => PVM.debug.stats.errors.length === 0), 'rules: no frame errors');
  allErrors.push(...p.errs);
  await closePage(p);
}

// ============================================================================================
async function testPersistence(b) {
  const p = await openPage(b, null, '?seed=31', 'persist');
  const ls = () => ev(p, () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  check(await ev(p, () => PVM.Game.settings.difficulty === 'easy'), 'settings: first run defaults to Easy');
  await p.click('#btnSettings'); await sleep(250);
  await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]'); await sleep(150);
  check(await ev(p, () => document.querySelector('#setDifficulty button[data-v=hard]').classList.contains('on')), 'settings: difficulty button highlights');
  await p.reload(); await waitMode(p, 'title');
  const s = await ev(p, () => PVM.Game.settings);
  check(s.sfx === false && s.music === false && s.difficulty === 'hard', 'settings: sfx, music, difficulty persist across reload', JSON.stringify(s));
  await p.click('#btnSettings'); await sleep(250);
  check(await ev(p, () => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked), 'settings: toggles show the saved values after reload');
  await p.click('label:has(#setSfx)'); await p.click('label:has(#setMusic)'); await p.click('#setDifficulty button[data-v=normal]'); await sleep(100);
  await p.click('#scrSettings .btn-back');
  // ?mute=1 is never saved, even when another setting is changed during that run
  await gotoGame(p, '?mute=1&seed=31');
  check(await ev(p, () => PVM.Game.urlMute === true), 'settings: ?mute=1 mutes this session');
  await p.click('#btnSettings'); await sleep(250);
  await p.click('#setDifficulty button[data-v=easy]'); await sleep(100);
  await p.click('#scrSettings .btn-back');
  let st = JSON.parse((await ls())['pvm:settings'] || '{}');
  check(st.muted === false && !('urlMute' in st), 'settings: ?mute=1 is not written to storage', JSON.stringify(st));
  await gotoGame(p, '?seed=31');
  check(await ev(p, () => !PVM.Game.settings.muted && !PVM.Game.urlMute && PVM.Game.settings.difficulty === 'easy'), 'settings: next normal load is not muted');
  // M toggles mute and that one IS saved (a deliberate player choice)
  await p.keyboard.press('KeyM'); await sleep(100);
  await p.reload(); await waitMode(p, 'title');
  check(await ev(p, () => PVM.Game.settings.muted === true), 'settings: M (mute) persists');
  await p.keyboard.press('KeyM'); await sleep(100);
  check(await ev(p, () => PVM.Game.settings.muted === false), 'settings: M again un-mutes');

  // ---- best score per difficulty ----
  const playTo = async (score, query) => {
    if (query != null) await gotoGame(p, query, /autostart/.test(query) ? 'playing' : 'title');
    if (await ev(p, () => PVM.debug.mode) === 'title') await p.click('#btnPlay');
    await waitPhase(p, 'playing');
    await ev(p, sc => { __qa.calm(); PVM.debug.world.score = sc; __qa.forceOver(); }, score);
    await waitMode(p, 'over');
    await sleep(800);
    return ev(p, () => ({ best: document.getElementById('overBest').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
  };
  let o = await playTo(345);
  let L = await ls();
  check(L['pvm:best_easy'] === '345', 'best: a normal Easy run saves best_easy', L['pvm:best_easy']);
  check(o.best === '345' && o.nb, 'best: game over shows Best 345 and NEW!');
  await p.click('#btnOverMenu'); await sleep(300);
  check(await ev(p, () => document.getElementById('bestTitle').textContent) === '345', 'best: title shows the best score');
  o = await playTo(100);
  L = await ls();
  check(L['pvm:best_easy'] === '345' && o.best === '345' && !o.nb, 'best: a lower score does not overwrite the best');
  await p.click('#btnOverMenu'); await sleep(300);
  await p.click('#btnSettings'); await sleep(250); await p.click('#setDifficulty button[data-v=normal]'); await p.click('#scrSettings .btn-back'); await sleep(200);
  check(await ev(p, () => document.getElementById('bestTitle').textContent) === '0', 'best: title shows the Normal best (0) after switching difficulty');
  await playTo(222);
  L = await ls();
  check(L['pvm:best_normal'] === '222' && L['pvm:best_easy'] === '345', 'best: best scores are kept per difficulty');
  // tainted runs: bot, speed, level, diff, and debug setBot / setSpeed during a normal run
  for (const q of ['?autostart=1&bot=1&mute=1', '?autostart=1&speed=2&mute=1', '?autostart=1&level=2&mute=1', '?autostart=1&diff=normal&mute=1']) {
    o = await playTo(9999, q);
    L = await ls();
    check(L['pvm:best_normal'] === '222' && L['pvm:best_easy'] === '345' && L['pvm:best_hard'] === undefined && !o.nb, 'best: not saved for a ' + q + ' run', JSON.stringify({ e: L['pvm:best_easy'], n: L['pvm:best_normal'], shown: o.best }));
  }
  await gotoGame(p, '?mute=1');
  await p.click('#btnPlay'); await waitPhase(p, 'playing');
  await ev(p, () => { PVM.debug.setSpeed(2); PVM.debug.setSpeed(1); });
  o = await playTo(8888);
  L = await ls();
  check(L['pvm:best_normal'] === '222', 'best: not saved after debug.setSpeed() during a run');
  // Reset best (needs two taps)
  await p.click('#btnOverMenu'); await sleep(300);
  await p.click('#btnSettings'); await sleep(250);
  await p.click('#btnResetBest'); await sleep(100);
  L = await ls();
  check(L['pvm:best_normal'] === '222', 'best: one tap on Reset does not wipe (asks "Sure?")');
  await p.click('#btnResetBest'); await sleep(100);
  L = await ls();
  check(!L['pvm:best_normal'] && !L['pvm:best_easy'], 'best: second tap clears the best scores');
  // corrupted settings never break boot
  await ev(p, () => localStorage.setItem('pvm:settings', '{"sfx":"yes","difficulty":"insane","music":7'));
  await p.reload(); await waitMode(p, 'title');
  check(await ev(p, () => PVM.Game.settings.difficulty === 'easy' && PVM.Game.settings.sfx === true), 'settings: corrupted saved settings fall back to defaults');
  allErrors.push(...p.errs);
  await closePage(p);
}

// ============================================================================================
async function makeImages(b) {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.setContent('<html><body></body></html>');
  const out = await p.evaluate(async () => {
    const mk = (w, h, draw, type, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, q); };
    const png = mk(300, 300, (g) => { g.fillStyle = '#ff8800'; g.beginPath(); g.arc(150, 150, 120, 0, Math.PI * 2); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(110, 120, 15, 0, 7); g.arc(190, 120, 15, 0, 7); g.fill(); }, 'image/png');
    const photo = mk(800, 600, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a7'); gr.addColorStop(1, '#fd4'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#c33'; g.fillRect(250, 150, 300, 300); }, 'image/jpeg', 0.9);
    const big = mk(4000, 3000, (g, w, h) => { for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},60%,${40 + i % 3 * 10}%)`; g.fillRect(i * 100, 0, 100, h); } g.fillStyle = '#fff'; g.fillRect(1800, 1300, 400, 400); }, 'image/jpeg', 0.85);
    return { png, photo, big };
  });
  await ctx.close();
  const buf = d => Buffer.from(d.split(',')[1], 'base64');
  return { png: buf(out.png), photo: buf(out.photo), big: buf(out.big) };
}

async function testPictures(b) {
  const imgs = await makeImages(b);
  const p = await openPage(b, null, '?mute=1&seed=41', 'pictures');
  await p.click('#btnCustomize'); await sleep(300);
  check(await ev(p, () => document.querySelectorAll('#slotGrid .slot').length === 3), 'pictures: three picture slots (Tofu, note, meadow)');
  const pick = async (idx, file) => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${idx}) [data-act=pick]`)]);
    await fc.setFiles(file);
  };
  const toastIs = (re, t) => p.waitForFunction(r => new RegExp(r).test(document.getElementById('toast').textContent) && !document.getElementById('toast').classList.contains('hidden'), re, { timeout: t || 10000 }).then(() => true, () => false);
  // Tofu ← transparent PNG
  await pick(1, { name: 'cat.png', mimeType: 'image/png', buffer: imgs.png });
  check(await toastIs('Picture saved'), 'pictures: transparent PNG for Tofu → "Picture saved"');
  let st = await ev(p, () => ({ has: PVM.Assets.hasCustom('hero'), shape: localStorage.getItem('pvm:shape_hero'), tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent, thumb: !!document.querySelector('#slotGrid .slot:nth-child(1) .prev img[src^="data:"]') }));
  check(st.has && st.shape === 'fit' && /Your picture/.test(st.tag) && st.thumb, 'pictures: Tofu PNG stays a whole cut-out (shape fit), card shows it', JSON.stringify(st));
  // note ← JPEG photo → round sticker
  await pick(2, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: imgs.photo });
  check(await toastIs('Picture saved'), 'pictures: JPEG photo for the note → saved');
  st = await ev(p, () => { const c = PVM.Assets.custom.note; const g = c.getContext('2d'); return { shape: localStorage.getItem('pvm:shape_note'), w: c.width, h: c.height, corner: g.getImageData(2, 2, 1, 1).data[3], centre: g.getImageData(256, 256, 1, 1).data[3] }; });
  check(st.shape === 'circle' && st.w === st.h && st.corner === 0 && st.centre === 255, 'pictures: note photo becomes a round sticker (transparent corners)', JSON.stringify(st));
  // meadow ← 4000×3000
  await pick(3, { name: 'big.jpg', mimeType: 'image/jpeg', buffer: imgs.big });
  check(await toastIs('Picture saved', 20000), 'pictures: 4000×3000 meadow → saved');
  st = await ev(p, async () => { const d = localStorage.getItem('pvm:img_ground'); const im = new Image(); im.src = d; await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(d.length / 1024), jpeg: d.startsWith('data:image/jpeg') }; });
  check(st.w <= 1600 && st.h <= 1600 && st.jpeg && st.kb < 1500, 'pictures: big meadow is downscaled to ≤1600 px JPEG', JSON.stringify(st));
  // non-image
  await pick(1, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  check(await toastIs('Please choose a picture'), 'pictures: non-image file → friendly error toast');
  check(await ev(p, () => PVM.Assets.hasCustom('hero') && localStorage.getItem('pvm:shape_hero') === 'fit'), 'pictures: a failed pick keeps the previous picture');
  // a file pretending to be an image
  await pick(1, { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  check(await toastIs('could not be opened'), 'pictures: broken image file → friendly error toast');
  // shape buttons
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=circle]'); await sleep(150);
  check(await ev(p, () => localStorage.getItem('pvm:shape_hero') === 'circle' && PVM.Assets.custom.hero.width === 512), 'pictures: "Round" turns Tofu into a sticker');
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=fit]'); await sleep(150);
  check(await ev(p, () => localStorage.getItem('pvm:shape_hero') === 'fit'), 'pictures: "Whole picture" turns it back');
  await p.screenshot({ path: path.join(OUT, 'pictures_cards.png') });
  // persisted across reload
  await p.reload(); await waitMode(p, 'title');
  check(await ev(p, () => ['hero', 'note', 'ground'].every(s => PVM.Assets.hasCustom(s))), 'pictures: custom pictures survive a reload');
  // render in game
  await p.click('#btnPlay'); await waitPhase(p, 'playing');
  await ev(p, () => { __qa.calm(); __qa.note(120, -60); __qa.note(-140, -80, 2); const w = PVM.debug.world; w.setTarget(w.tofu.x + 60, w.tofu.y - 10); });
  await sleep(1200);
  const keys = await ev(p, () => ({ cache: [...PVM.Assets._cache.keys()].filter(k => k.startsWith('custom:')), bg: Object.keys(PVM.Game.renderer._bgCache).filter(k => k.startsWith('cg')), errs: PVM.debug.stats.errors }));
  check(keys.cache.some(k => k.startsWith('custom:hero')) && keys.cache.some(k => k.startsWith('custom:note')), 'pictures: custom Tofu and note are drawn in game', keys.cache.join(','));
  check(keys.bg.length > 0, 'pictures: custom meadow is drawn in game');
  check(keys.errs.length === 0, 'pictures: no frame errors while drawing custom pictures', keys.errs[0]);
  await p.screenshot({ path: path.join(OUT, 'pictures_ingame.png') });
  // pinch + walk + season change with custom pictures
  await ev(p, () => { __qa.crabOnTofu(); });
  await sleep(300);
  await ev(p, () => { const w = PVM.debug.world; w.crabs = []; w.goal = w.got + 1; __qa.note(); });
  await p.waitForFunction(() => PVM.debug.world.level === 1, null, { timeout: 8000 });
  await sleep(1500);
  check(await ev(p, () => PVM.debug.stats.errors.length === 0 && Object.keys(PVM.Game.renderer._bgCache).some(k => k.startsWith('cg1'))), 'pictures: custom meadow also covers the next season, no errors');
  // reset one, reset all
  await p.keyboard.press('Escape'); await sleep(200);
  await p.click('#btnPauseMenu'); await sleep(300);
  await p.click('#btnCustomize'); await sleep(300);
  await p.click('#slotGrid .slot:nth-child(1) [data-act=reset]'); await sleep(200);
  st = await ev(p, () => ({ hero: PVM.Assets.hasCustom('hero'), note: PVM.Assets.hasCustom('note'), ls: localStorage.getItem('pvm:img_hero'), shape: localStorage.getItem('pvm:shape_hero'), tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent }));
  check(!st.hero && st.note && st.ls === null && st.shape === null && /Original/.test(st.tag), 'pictures: Reset on Tofu restores the original only', JSON.stringify(st));
  await p.click('#btnResetAll'); await sleep(200);
  st = await ev(p, () => ({ any: ['hero', 'note', 'ground'].some(s => PVM.Assets.hasCustom(s)), ls: Object.keys(localStorage).filter(k => /pvm:(img|shape)_/.test(k)) }));
  check(!st.any && st.ls.length === 0, 'pictures: Reset all removes every picture', JSON.stringify(st.ls));
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await p.click('#btnPlay'); await waitPhase(p, 'playing'); await sleep(800);
  check(await ev(p, () => [...PVM.Assets._cache.keys()].every(k => !k.startsWith('custom:')) && Object.keys(PVM.Game.renderer._bgCache).every(k => !k.startsWith('cg')) && PVM.debug.stats.errors.length === 0), 'pictures: after Reset all the game draws the original art');
  allErrors.push(...p.errs);
  await closePage(p);
}

// ============================================================================================
const VIEWPORTS = [
  { name: 'desktop_1280x720', w: 1280, h: 720, dpr: 1, touch: false },
  { name: 'desktop_1920x1080', w: 1920, h: 1080, dpr: 1, touch: false },
  { name: 'iphone_land_844x390', w: 844, h: 390, dpr: 3, touch: true },
  { name: 'iphone_port_390x844', w: 390, h: 844, dpr: 3, touch: true },
  { name: 'ipad_1024x768', w: 1024, h: 768, dpr: 2, touch: true },
  { name: 'ipadpro_1366x1024', w: 1366, h: 1024, dpr: 2, touch: true }
];
async function testLayout(b) {
  for (const v of VIEWPORTS) {
    const p = await openPage(b, { viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.touch }, '?mute=1&seed=51', v.name);
    const n = v.name;
    const geo = () => ev(p, () => {
      const R = PVM.Game.renderer, W = innerWidth, H = innerHeight, s = R.cssScale, sf = R.safe || { l: 0, r: 0, t: 0 };
      const top = Math.max(-R.oy + sf.t, -64) + 8, left = Math.max(12, -R.ox + sf.l + 12);
      const right = Math.min(960 + R.ox - sf.r - 12, R.hudRight != null ? R.hudRight : 850);
      const nh = PVM.debug.world.maxHearts, hx0 = right - nh * 28 - 14, mx0 = left + 186, mx1 = hx0 - 22;
      const rect = (x, y, w, h) => ({ l: (x + R.ox) * s, t: (y + R.oy) * s, r: (x + w + R.ox) * s, b: (y + h + R.oy) * s });
      const hud = document.getElementById('hud').getBoundingClientRect();
      const c = document.getElementById('game').getBoundingClientRect();
      // arena corners on screen
      const A = PVM.ARENA;
      return { W, H, score: rect(left, top, 168, 42), hearts: rect(hx0 - 4, top, nh * 28 + 22, 42), meter: rect(mx0, top, Math.max(120, mx1 - mx0), 42), meterW: mx1 - mx0,
        hud: { l: hud.left, t: hud.top, r: hud.right, b: hud.bottom, w: hud.width }, btn: document.getElementById('btnPause').getBoundingClientRect().width,
        canvas: { w: c.width, h: c.height }, arena: rect(A.x, A.y, A.w, A.h), cssScale: s, backing: [R.c.width, R.c.height] };
    });
    const inside = (r, W, H) => r.l >= -0.5 && r.t >= -0.5 && r.r <= W + 0.5 && r.b <= H + 0.5;
    await sleep(1500);
    await p.screenshot({ path: path.join(OUT, 'layout_' + n + '_title.png') });
    const tw = await ev(p, () => { const r = document.querySelector('#scrTitle .title-wrap').getBoundingClientRect(); const pb = document.getElementById('btnPlay').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, play: { l: pb.left, t: pb.top, r: pb.right, b: pb.bottom, h: pb.height } }; });
    check(inside(tw.play, v.w, v.h) && tw.play.h >= 30, n + ': title Play button fully on screen and ≥30 px tall', JSON.stringify(tw.play));
    check(inside(tw, v.w, v.h), n + ': title block fits the screen', JSON.stringify({ t: tw.t | 0, b: tw.b | 0 }));
    // every menu screen: one at a time, panel fits, its buttons reachable
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await ev(p, i => PVM.UI.open(i, 'scrTitle'), id); await sleep(350);
      const r = await ev(p, i => {
        const pn = document.querySelector('#' + i + ' .panel'), pr = pn.getBoundingClientRect();
        const btns = [...pn.querySelectorAll('button')].filter(x => x.offsetParent);
        const lastB = btns[btns.length - 1].getBoundingClientRect();
        return { vis: __qa.visibleScreens(), l: pr.left, t: pr.top, r: pr.right, b: pr.bottom, scroll: pn.scrollHeight > pn.clientHeight + 2, sw: pn.scrollWidth > pn.clientWidth + 2, lastVisible: lastB.bottom <= pr.bottom + 1, minBtn: Math.min(...btns.map(x => x.getBoundingClientRect().height)) };
      }, id);
      await p.screenshot({ path: path.join(OUT, 'layout_' + n + '_' + id + '.png') });
      check(r.vis.join() === id, n + ': #' + id + ' is the only visible screen', r.vis.join());
      check(inside(r, v.w, v.h) && !r.sw, n + ': #' + id + ' panel fits the screen (no sideways scroll)', JSON.stringify({ t: r.t | 0, b: r.b | 0, l: r.l | 0, r: r.r | 0, scroll: r.scroll }));
      check(r.lastVisible || r.scroll, n + ': #' + id + ' Done/OK button visible or reachable by scrolling', JSON.stringify({ lastVisible: r.lastVisible, scroll: r.scroll }));
      if (v.touch) check(r.minBtn >= 24, n + ': #' + id + ' smallest button ≥24 px tall (touch)', 'min=' + r.minBtn.toFixed(1));
      await ev(p, () => PVM.UI.back()); await sleep(200);
    }
    // in game
    await ev(p, () => PVM.Game.startGame());
    const portraitPhone = v.w < v.h && v.touch;
    if (!portraitPhone) { await waitPhase(p, 'playing'); await ev(p, () => __qa.calm()); } else await sleep(400);
    if (portraitPhone) {
      check(await p.isVisible('#rotate'), n + ': portrait phone shows the "turn sideways" prompt');
      const t1 = await ev(p, () => PVM.debug.world.t); await sleep(300);
      check(await ev(p, () => PVM.debug.world.t) === t1, n + ': game waits while the rotate prompt is up');
      await p.screenshot({ path: path.join(OUT, 'layout_' + n + '_rotate.png') });
      await p.tap('#btnRotateOk'); await sleep(300);
      check(!(await p.isVisible('#rotate')) && await ev(p, () => PVM.debug.mode === 'playing'), n + ': "Play upright anyway" dismisses it');
      await sleep(300);
      check(await ev(p, () => PVM.debug.world.t) > t1, n + ': game runs upright after dismissing');
      await waitPhase(p, 'playing'); await ev(p, () => __qa.calm());
    } else {
      check(!(await p.isVisible('#rotate')), n + ': no rotate prompt');
    }
    await sleep(500);
    const gm = await geo();
    await p.screenshot({ path: path.join(OUT, 'layout_' + n + '_game.png') });
    check(Math.abs(gm.canvas.w - v.w) < 1 && Math.abs(gm.canvas.h - v.h) < 1, n + ': canvas fills the viewport', JSON.stringify(gm.canvas));
    check(gm.backing[0] * gm.backing[1] <= 1920 * 1080 * 1.05, n + ': canvas backing store ≤ ~1920×1080', gm.backing.join('×'));
    check(inside(gm.hud, v.w, v.h), n + ': HTML HUD buttons inside the screen', JSON.stringify(gm.hud));
    check(gm.btn >= 44 || !v.touch, n + ': HUD buttons ≥ 44 px on touch', 'w=' + gm.btn.toFixed(1));
    check(inside(gm.score, v.w, v.h) && inside(gm.hearts, v.w, v.h) && inside(gm.meter, v.w, v.h), n + ': score, meter and hearts pills inside the screen', JSON.stringify({ s: gm.score, h: gm.hearts }));
    check(gm.hearts.r <= gm.hud.l + 0.5 || gm.hearts.b <= gm.hud.t || gm.hearts.t >= gm.hud.b, n + ': hearts do not overlap the pause/sound buttons', 'hearts.r=' + gm.hearts.r.toFixed(0) + ' hud.l=' + gm.hud.l.toFixed(0));
    check(gm.meterW >= 120 && gm.meter.r <= gm.hearts.l + 0.5 && gm.score.r <= gm.meter.l + 0.5, n + ': meter sits between score and hearts without overlap', 'meterW=' + gm.meterW.toFixed(0));
    check(inside(gm.arena, v.w, v.h), n + ': the whole play arena is on screen', JSON.stringify(gm.arena));
    check(gm.hud.b <= gm.arena.t + 2 || gm.hud.l >= gm.arena.r - 2, n + ': HTML HUD buttons do not cover the play arena', JSON.stringify({ hudB: gm.hud.b | 0, arenaT: gm.arena.t | 0 }));
    // tap/click on the playfield walks Tofu here too
    const [cx, cy] = await toScreen(p, 700, 420);
    const x0 = await ev(p, () => PVM.debug.world.tofu.x);
    if (v.touch) {
      const cdp = await p.ctxRef.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }); await holdGame(p, 0.5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await p.mouse.move(cx, cy); await p.mouse.down(); await holdGame(p, 0.5); await p.mouse.up(); }
    check(await ev(p, () => PVM.debug.world.tofu.x) > x0 + 60, n + ': holding on the field walks Tofu');
    // pause and over screens
    await ev(p, () => PVM.Game.pause()); await sleep(300);
    let r = await ev(p, () => { const pr = document.querySelector('#scrPause .panel').getBoundingClientRect(); return { vis: __qa.visibleScreens(), l: pr.left, t: pr.top, r: pr.right, b: pr.bottom }; });
    check(r.vis.join() === 'scrPause' && inside(r, v.w, v.h), n + ': pause panel alone and on screen', JSON.stringify(r));
    await ev(p, () => PVM.Game.resume()); await waitPhase(p, 'playing');
    await ev(p, () => __qa.forceOver()); await waitMode(p, 'over'); await sleep(400);
    r = await ev(p, () => { const pn = document.querySelector('#scrOver .panel'), pr = pn.getBoundingClientRect(), a = document.getElementById('btnAgain').getBoundingClientRect(); return { vis: __qa.visibleScreens(), l: pr.left, t: pr.top, r: pr.right, b: pr.bottom, again: { l: a.left, t: a.top, r: a.right, b: a.bottom } }; });
    await p.screenshot({ path: path.join(OUT, 'layout_' + n + '_over.png') });
    check(r.vis.join() === 'scrOver' && inside(r, v.w, v.h) && inside(r.again, v.w, v.h), n + ': game-over panel and Play Again on screen', JSON.stringify({ t: r.t | 0, b: r.b | 0 }));
    // orientation change mid-game (phones): resize keeps the HUD inside
    if (v.touch) {
      await p.setViewportSize({ width: v.h, height: v.w }); await sleep(500);
      const r2 = await ev(p, () => ({ W: innerWidth, H: innerHeight, c: document.getElementById('game').getBoundingClientRect().width, s: PVM.Game.renderer.cssScale }));
      check(Math.abs(r2.c - r2.W) < 1, n + ': rotating the device re-fits the canvas', JSON.stringify(r2));
    }
    check(await ev(p, () => PVM.debug.stats.errors.length === 0), n + ': no frame errors');
    check(p.errs.length === 0, n + ': zero console errors', p.errs.slice(0, 2).join(' | '));
    await closePage(p);
  }
}

// ============================================================================================
async function testLongBot(b) {
  // A: skill-1 bot on Normal (goes deep into later years); B: weak bot on Hard (dies often → autorestart path)
  await botRun(b, 'botA', '?autostart=1&bot=1&speed=16&autorestart=1&mute=1&seed=61&diff=normal', BOT_SECONDS, false);
  await botRun(b, 'botB', '?autostart=1&bot=1&speed=16&autorestart=1&mute=1&seed=62&diff=hard&skill=0.15', 30, true);
}
async function botRun(b, tag, query, secs, expectDeaths) {
  const p = await openPage(b, null, query, tag);
  // per-frame peaks (a 1 s poll would miss short bursts)
  await ev(p, () => { window.__peak = { p: 0, fx: 0 }; const f = () => { const R = PVM.Game.renderer, W = PVM.debug.weather; __peak.p = Math.max(__peak.p, W ? W.particles.length : 0); __peak.fx = Math.max(__peak.fx, R.texts.length + R.rings.length); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const samples = [];
  let maxP = 0, maxFx = 0, maxCache = 0, maxBg = 0, maxNotes = 0, maxCrabs = 0;
  const t0 = Date.now();
  let heap0 = null, heapMax = 0;
  while (Date.now() - t0 < secs * 1000) {
    await sleep(1000);
    const s = await ev(p, () => {
      const st = PVM.debug.getState(), R = PVM.Game.renderer;
      return { p: st.particles, fx: st.fx, texts: R.texts.length, rings: R.rings.length, level: st.level, mode: st.mode, games: PVM.debug.stats.games, errs: PVM.debug.stats.errors.length,
        cache: PVM.Assets._cache.size, bg: Object.keys(R._bgCache).length, notes: st.notes.length, crabs: st.crabs.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
        events: PVM.debug.world._events.length, scores: PVM.debug.stats.scores.slice(-3) };
    });
    samples.push(s);
    maxP = Math.max(maxP, s.p); maxFx = Math.max(maxFx, s.fx); maxCache = Math.max(maxCache, s.cache); maxBg = Math.max(maxBg, s.bg);
    maxNotes = Math.max(maxNotes, s.notes); maxCrabs = Math.max(maxCrabs, s.crabs);
    if (Date.now() - t0 > 10000 && heap0 == null) heap0 = s.heap;
    heapMax = Math.max(heapMax, s.heap);
  }
  await p.screenshot({ path: path.join(OUT, 'bot_end.png') });
  const last = samples[samples.length - 1];
  const peak = await ev(p, () => __peak); maxP = Math.max(maxP, peak.p); maxFx = Math.max(maxFx, peak.fx);
  const st = await ev(p, () => ({ stats: PVM.debug.stats, fr: PVM.Game.renderer.px }));
  console.log('     bot: level now=' + last.level + ' mode=' + last.mode + ' max level=' + Math.max(...samples.map(x => x.level)));
  console.log('     bot: games=' + st.stats.games + ' scores=' + JSON.stringify(st.stats.scores.slice(0, 12)) + ' levels=' + JSON.stringify(st.stats.levels.slice(0, 12)));
  console.log('     bot: maxParticles=' + maxP + ' maxFx=' + maxFx + ' maxSpriteCache=' + maxCache + ' maxBgCache=' + maxBg + ' maxNotes=' + maxNotes + ' maxCrabs=' + maxCrabs + ' heap0=' + (heap0 / 1e6).toFixed(1) + 'MB heapMax=' + (heapMax / 1e6).toFixed(1) + 'MB');
  check(st.stats.errors.length === 0, tag + ': no frame errors in ' + secs + ' s at speed 16', st.stats.errors[0]);
  if (expectDeaths) {
    check(st.stats.games >= 2 && samples.some(x => x.mode === 'playing'), tag + ': autorestart starts new games after game over', 'games=' + st.stats.games);
    check(st.stats.scores.length === st.stats.games && st.stats.times.every(x => x > 0), tag + ': every finished game is recorded');
  } else {
    check(Math.max(...samples.map(x => x.level)) >= 4, tag + ': the skill-1 bot clears a whole year (4 seasons)', 'max level=' + Math.max(...samples.map(x => x.level)));
  }
  check(maxP <= 260, tag + ': particles ≤ 260', 'max=' + maxP);
  check(maxFx <= 120, tag + ': renderer texts + rings stay bounded (≤120)', 'max=' + maxFx);
  check(maxCache <= 400 && maxBg <= 16, tag + ': sprite / background caches stay bounded', 'sprites=' + maxCache + ' bg=' + maxBg);
  check(maxNotes <= 30 && maxCrabs <= 6, tag + ': entity counts bounded', 'notes=' + maxNotes + ' crabs=' + maxCrabs);
  // a new world (autorestart / startGame from a timer) queues its 'intro' event until the next frame drains it
  check(samples.every(s => s.events <= 2), tag + ': world event queue is drained every frame', 'max queued=' + Math.max(...samples.map(s => s.events)));
  check(!heap0 || heapMax < heap0 * 1.8 + 30e6, tag + ': JS heap does not grow without bound', (heap0 / 1e6).toFixed(1) + ' → max ' + (heapMax / 1e6).toFixed(1) + ' MB');
  check(p.errs.length === 0, tag + ': zero console errors', p.errs.slice(0, 2).join(' | '));
  // best score never written by bot runs
  check(await ev(p, () => Object.keys(localStorage).every(k => !k.startsWith('pvm:best_'))), tag + ': bot games never write a best score');
  await closePage(p);
}

// ============================================================================================
server.listen(0, async () => {
  BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch();
  const groups = [['boot', testBootAndMenus], ['input', testInput], ['rules', testRules], ['persist', testPersistence], ['pictures', testPictures], ['layout', testLayout], ['bot', testLongBot]];
  for (const [g, fn] of groups) {
    if (!want(g)) continue;
    console.log('--- ' + g);
    try { await fn(b); } catch (e) { check(false, g + ': exception', String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  }
  check(allErrors.length === 0, 'all: zero console errors across the suite', allErrors.slice(0, 5).join(' | '));
  await b.close(); server.close();
  console.log(`\n${pass} passed, ${fails} failed`);
  if (fails) { console.log('FAILED:\n  ' + failed.join('\n  ')); }
  console.log(fails ? 'FUNCTIONAL FAILED' : 'FUNCTIONAL PASSED');
  process.exit(fails ? 1 : 0);
});
