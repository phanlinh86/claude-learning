// Functional QA suite for Pebble's Oasis Run.
// Run:  NODE_PATH=$(npm root -g) node tests/e2e/functional.js        (optional: --only=input,scoring  to run some groups)
// Prints PASS / FAIL / WARN per check and exits non-zero when any check FAILs.
// Screenshots go to tests/out/functional/ (gitignored).
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const results = [];
function check(group, name, ok, detail) {
  const st = ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  results.push({ group, name, st, detail });
  console.log(`${st}  [${group}] ${name}${detail !== undefined && st !== 'PASS' ? '  -- ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function open(query, ctxOpts = {}, ctx) {
  const context = ctx || await browser.newContext({ viewport: { width: 1280, height: 720 }, ...ctxOpts });
  const page = await context.newPage();
  page.errs = [];
  page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
  page.on('pageerror', e => page.errs.push(String(e)));
  await page.goto(GAME + (query || ''));
  await page.waitForFunction(() => window.PO && PO.debug && PO.debug.mode && PO.debug.mode !== 'boot', null, { timeout: 20000 });
  return { page, context };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const st = p => p.evaluate(() => PO.debug.getState());
const mode = p => p.evaluate(() => PO.debug.mode);
const ui = p => p.evaluate(() => PO.UI.current);
async function allErrors(p) { const e = await p.evaluate(() => PO.debug.stats.errors.slice()).catch(() => []); return p.errs.concat(e); }

// Record every world event that reaches the game controller (the controller drains the world each step).
async function spyEvents(p) {
  await p.evaluate(() => {
    if (window._spy) return; window._spy = true; window._ev = [];
    const G = PO.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) {
      for (const e of evts) { const c = {}; for (const k in e) if (k !== 'o') c[k] = e[k]; if (e.o) c.kind = c.kind || e.o.kind; window._ev.push(c); }
      return orig(evts);
    };
  });
}
const events = (p, type) => p.evaluate(t => window._ev.filter(e => !t || e.type === t), type);
const clearEvents = p => p.evaluate(() => { window._ev = []; });

// Keep the track empty (except objects tagged {test:true}) and keep Fizz away, so input tests are not disturbed.
async function sandbox(p, keepBoss) {
  await p.evaluate(kb => {
    clearInterval(window._sbx);
    const f = () => { const w = PO.debug.world; if (!w || PO.debug.mode === 'title') return; w.objects = w.objects.filter(o => o.test || (o.kind === 'pillow' && kb)); if (!kb) w.boss.nextT = 999; };
    f(); window._sbx = setInterval(f, 30);
  }, !!keepBoss);
}
const unsandbox = p => p.evaluate(() => clearInterval(window._sbx));
const setLane = (p, l) => p.evaluate(l => PO.debug.world.setLane(l), l);

async function forceGameOver(p) {
  await p.evaluate(() => {
    const w = PO.debug.world; w.hearts = 1; w.hero.invuln = 0;
    w.spawn('pots', w.hero.lane, 0.3, { test: true });
  });
  await p.waitForFunction(() => PO.debug.mode === 'over', null, { timeout: 8000 });
}
async function canvasBox(p) { return p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }
async function btnCenter(p, sel) { return p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); }

async function cdpSwipe(cdp, x0, y0, x1, y1, steps = 5, stepMs = 16) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, id: 1 }] });
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mouseSwipe(p, x0, y0, x1, y1, steps = 5) { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps }); await p.mouse.up(); }

// images generated in the page (so no image library is needed in Node)
async function makeImages(p) {
  return p.evaluate(async () => {
    const mk = (w, h, draw, type, q) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, q).split(',')[1]; };
    return {
      photoRed: mk(640, 480, (g, w, h) => { g.fillStyle = '#e02020'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd400'; g.beginPath(); g.arc(w / 2, h / 2, 120, 0, 7); g.fill(); }, 'image/png'),
      photoBlue: mk(400, 400, (g, w, h) => { g.fillStyle = '#1040e0'; g.fillRect(0, 0, w, h); }, 'image/png'),
      transparent: mk(300, 300, (g) => { g.fillStyle = '#20c020'; g.beginPath(); g.arc(150, 150, 120, 0, 7); g.fill(); }, 'image/png'),
      huge: mk(4000, 3000, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff7f50'); gr.addColorStop(1, '#4060ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${i * 6},70%,60%)`; g.fillRect((i * 263) % w, (i * 151) % h, 200, 200); } }, 'image/jpeg', 0.9)
    };
  });
}
async function pickFile(p, slot, file) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slot}) [data-act=pick]`)]);
  await fc.setFiles(file);
}
const toastText = p => p.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });
async function waitToast(p, re, ms = 6000) {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < ms) { last = await toastText(p); if (re.test(last)) return last; await sleep(60); }
  return 'NO MATCH, last toast: ' + last;
}

// ============================================================================================ groups
const groups = {};

groups.boot = async () => {
  const G = 'boot';
  const { page: p, context } = await open('?seed=7');
  check(G, 'boots into the title screen', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
  const d0 = (await st(p)).dist; await sleep(2500);
  const s1 = await st(p);
  const bot = await ev(p, () => !!PO.Game.bot);
  check(G, 'title demo is running with the bot', bot && s1.dist > d0 + 5, { d0, d1: s1.dist, bot });
  check(G, 'title demo: Pebble changes lanes by himself', s1.stats.lanes > 0 || s1.stats.jumps > 0, s1.stats);
  check(G, 'HUD hidden on title', await ev(p, () => document.getElementById('hud').classList.contains('hidden')));
  check(G, 'Play button focused (Enter/Space ready)', await ev(p, () => document.activeElement && document.activeElement.id === 'btnPlay'));
  await p.screenshot({ path: OUT + '/boot_title.png' });
  const e = await allErrors(p);
  check(G, 'zero console errors on boot', e.length === 0, e);
  await context.close();
};

groups.menus = async () => {
  const G = 'menus';
  const { page: p, context } = await open('?mute=1&seed=7');
  for (const [btn, scr] of [['#btnHow', 'scrHow'], ['#btnSettings', 'scrSettings'], ['#btnCustomize', 'scrCustom']]) {
    await p.click(btn); await sleep(150);
    check(G, `${btn} opens ${scr}`, (await ui(p)) === scr && await ev(p, s => !document.getElementById(s).classList.contains('hidden'), scr));
    await p.screenshot({ path: OUT + `/menu_${scr}.png` });
    await p.keyboard.press('Escape'); await sleep(150);
    check(G, `Esc on ${scr} returns to title`, (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');
    await p.click(btn); await sleep(150);
    await p.click(`#${scr} .btn-back`); await sleep(150);
    check(G, `back button on ${scr} returns to title`, (await ui(p)) === 'scrTitle');
  }
  await p.keyboard.press('Escape'); await sleep(100);
  check(G, 'Esc on title does nothing', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');

  await p.click('#btnPlay'); await sleep(300);
  check(G, 'Play starts a game, HUD shown', (await mode(p)) === 'playing' && await ev(p, () => !document.getElementById('hud').classList.contains('hidden')) && (await ui(p)) === null);
  await sandbox(p);
  await p.keyboard.press('Escape'); await sleep(120);
  check(G, 'Esc pauses', (await mode(p)) === 'paused' && (await ui(p)) === 'scrPause');
  const dP = (await st(p)).dist; await sleep(400);
  check(G, 'world frozen while paused', Math.abs((await st(p)).dist - dP) < 1e-6);
  await p.screenshot({ path: OUT + '/menu_pause.png' });
  await p.keyboard.press('Escape'); await sleep(120);
  check(G, 'Esc resumes', (await mode(p)) === 'playing');
  await p.keyboard.press('KeyP'); await sleep(120);
  check(G, 'P pauses', (await mode(p)) === 'paused');
  await p.click('#btnResume'); await sleep(150);
  check(G, 'Resume button resumes', (await mode(p)) === 'playing');
  await p.click('#btnPause'); await sleep(150);
  check(G, 'HUD pause button pauses', (await mode(p)) === 'paused');
  await p.click('#btnPauseSettings'); await sleep(150);
  check(G, 'Pause → Settings', (await ui(p)) === 'scrSettings' && (await mode(p)) === 'paused');
  await p.keyboard.press('Escape'); await sleep(150);
  check(G, 'Esc in pause-Settings returns to the pause menu (not title, not resume)', (await ui(p)) === 'scrPause' && (await mode(p)) === 'paused');
  await p.click('#btnPauseSettings'); await sleep(150); await p.click('#scrSettings .btn-back'); await sleep(150);
  check(G, 'Done in pause-Settings returns to the pause menu', (await ui(p)) === 'scrPause');
  await ev(p, () => { PO.debug.world.score = 77; });
  await p.click('#btnRestart'); await sleep(200);
  const sr = await st(p);
  check(G, 'Restart starts a fresh run', (await mode(p)) === 'playing' && sr.score === 0 && sr.dist < 10, sr.score);
  await p.click('#btnPause'); await sleep(120);
  const musicBefore = await ev(p, () => PO.Audio._musicPlaying);
  await p.click('#btnPauseMenu'); await sleep(200);
  check(G, 'Main Menu returns to title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
  check(G, 'music stops on return to title', musicBefore === true && (await ev(p, () => PO.Audio._musicPlaying)) === false, { musicBefore });

  await p.click('#btnPlay'); await sleep(300); await sandbox(p);
  await forceGameOver(p);
  check(G, 'game over screen shows', (await ui(p)) === 'scrOver');
  check(G, 'music stopped on game over', (await ev(p, () => PO.Audio._musicPlaying)) === false);
  await p.screenshot({ path: OUT + '/menu_over.png' });
  await p.keyboard.press('Escape'); await sleep(100);
  check(G, 'Esc on game over does nothing harmful', (await mode(p)) === 'over');
  await sleep(800);
  await p.click('#btnAgain'); await sleep(250);
  check(G, 'Play Again starts a new game', (await mode(p)) === 'playing' && (await st(p)).hearts > 0);
  await sandbox(p);
  await forceGameOver(p); await sleep(800);
  await p.click('#btnOverMenu'); await sleep(250);
  check(G, 'Game over → Menu returns to title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
  const e = await allErrors(p); check(G, 'no console errors in menus', e.length === 0, e);
  await context.close();
};

async function inputChecks(G, p, kind, cdp) {
  const box = await canvasBox(p);
  const Y = box.y + box.h * 0.62, X = f => box.x + box.w * f;
  const lane = async () => (await st(p)).hero.lane;
  const tap = async (x, y) => kind === 'touch' ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  const swipe = async (x0, y0, x1, y1) => kind === 'touch' ? cdpSwipe(cdp, x0, y0, x1, y1) : mouseSwipe(p, x0, y0, x1, y1);
  await setLane(p, 0); await sleep(200);
  await tap(X(0.15), Y); await sleep(350);
  check(G, `${kind} tap left third → left lane`, (await lane()) === -1);
  await tap(X(0.85), Y); await sleep(350);
  check(G, `${kind} tap right third → right lane`, (await lane()) === 0);
  await sleep(300);
  await tap(X(0.5), Y); await sleep(120);
  const jy = (await st(p)).hero.y;
  check(G, `${kind} tap middle third → jump`, jy > 0.15 && (await lane()) === 0, { y: jy });
  await sleep(800);
  await setLane(p, 0); await sleep(100);
  await swipe(X(0.5), Y, X(0.5) + 90, Y + 4); await sleep(350);
  check(G, `${kind} swipe right → lane +1`, (await lane()) === 1);
  await swipe(X(0.5), Y, X(0.5) - 90, Y + 4); await sleep(350);
  check(G, `${kind} swipe left → lane 0`, (await lane()) === 0);
  await swipe(X(0.5), Y, X(0.5) + 4, Y - 90); await sleep(120);
  const sy = (await st(p)).hero.y;
  check(G, `${kind} swipe up → jump`, sy > 0.15 && (await lane()) === 0, { y: sy });
  await sleep(800);
  // swipe that starts in the left third must not ALSO count as a tap
  await setLane(p, 0); await sleep(100);
  await swipe(X(0.1), Y, X(0.1) + 90, Y); await sleep(350);
  check(G, `${kind} swipe starting in a tap zone is only a swipe`, (await lane()) === 1);
  // quick double swipe queues two lanes
  await setLane(p, -1); await sleep(150);
  await swipe(X(0.5), Y, X(0.5) + 80, Y); await swipe(X(0.5), Y, X(0.5) + 80, Y); await sleep(500);
  const s2 = await st(p);
  check(G, `${kind} quick double swipe right → two lanes`, s2.hero.lane === 1 && Math.abs(s2.hero.x - 1) < 0.1, { lane: s2.hero.lane, x: s2.hero.x });
  // quick double tap (left then right zone in < 300 ms)
  await setLane(p, 1); await sleep(150);
  await tap(X(0.12), Y); await sleep(90); await tap(X(0.12), Y); await sleep(500);
  check(G, `${kind} quick double tap left → two lanes`, (await lane()) === -1, await lane());
  // HUD buttons must not move/jump Pebble
  await setLane(p, 0); await sleep(300);
  const before = await st(p);
  const mb = await btnCenter(p, '#btnMuteHud');
  const m0 = await ev(p, () => PO.Game.settings.muted || PO.Game.urlMute);
  await tap(mb.x, mb.y); await sleep(250);
  const after = await st(p);
  const m1 = await ev(p, () => PO.Game.settings.muted || PO.Game.urlMute);
  check(G, `${kind} tap mute HUD button toggles sound`, m0 !== m1, { m0, m1 });
  check(G, `${kind} tap mute HUD button does not move or jump Pebble`, after.hero.lane === before.hero.lane && after.stats.jumps === before.stats.jumps && after.stats.lanes === before.stats.lanes, { before: before.stats, after: after.stats });
  await tap(mb.x, mb.y); await sleep(250);   // toggle back
  const pb = await btnCenter(p, '#btnPause');
  const b2 = await st(p);
  await tap(pb.x, pb.y); await sleep(250);
  check(G, `${kind} tap pause HUD button pauses without moving Pebble`, (await mode(p)) === 'paused' && (await st(p)).stats.lanes === b2.stats.lanes && (await st(p)).stats.jumps === b2.stats.jumps);
  await sleep(700);   // past the ghost-click window
  const rb = await btnCenter(p, '#btnResume');
  await tap(rb.x, rb.y); await sleep(250);
  check(G, `${kind} tap Resume resumes`, (await mode(p)) === 'playing');
  const b3 = await st(p); await sleep(300);
  check(G, `${kind} Resume tap does not leak into a lane change/jump`, (await st(p)).stats.lanes === b3.stats.lanes && (await st(p)).stats.jumps === b3.stats.jumps);
}

groups.input = async () => {
  const G = 'input';
  const { page: p, context } = await open('?mute=1&seed=7&autostart=1&diff=easy');
  await sandbox(p); await sleep(300);
  const lane = async () => (await st(p)).hero.lane;
  await setLane(p, 0);
  for (const [k, exp] of [['ArrowLeft', -1], ['ArrowRight', 0], ['KeyD', 1], ['KeyA', 0], ['ArrowRight', 1], ['ArrowRight', 1]]) {
    await p.keyboard.press(k); await sleep(300);
    check(G, `key ${k} → lane ${exp}`, (await lane()) === exp, await lane());
  }
  for (const k of ['ArrowUp', 'KeyW', 'Space']) {
    await p.keyboard.press(k); await sleep(130);
    const y = (await st(p)).hero.y;
    check(G, `key ${k} jumps`, y > 0.15, y); await sleep(800);
  }
  // key repeat must not spam lanes
  await setLane(p, 1); await sleep(100);
  const l0 = (await st(p)).stats.lanes;
  await p.keyboard.down('ArrowLeft'); for (let i = 0; i < 6; i++) { await sleep(40); await p.keyboard.down('ArrowLeft'); } await p.keyboard.up('ArrowLeft');
  await sleep(350);
  const s = await st(p);
  check(G, 'held arrow (auto-repeat) changes only one lane', s.hero.lane === 0 && s.stats.lanes - l0 === 1, { lane: s.hero.lane, lanes: s.stats.lanes - l0 });
  await sleep(300);
  const j0 = (await st(p)).stats.jumps;
  await p.keyboard.down('Space'); for (let i = 0; i < 20; i++) { await sleep(40); await p.keyboard.down('Space'); } await p.keyboard.up('Space');
  await sleep(900);
  check(G, 'held Space (auto-repeat) jumps only once', (await st(p)).stats.jumps - j0 === 1, (await st(p)).stats.jumps - j0);
  // a jump pressed shortly before landing is buffered
  await p.keyboard.press('Space'); await sleep(520); const jb = (await st(p)).stats.jumps; await p.keyboard.press('Space'); await sleep(400);
  check(G, 'jump pressed just before landing is buffered (fires on landing)', (await st(p)).stats.jumps === jb + 1);
  await sleep(800);
  // keys do nothing while paused
  await p.keyboard.press('Escape'); await sleep(100);
  const lp = await lane(); await p.keyboard.press('ArrowLeft'); await sleep(200);
  check(G, 'arrow keys ignored while paused', (await lane()) === lp && (await mode(p)) === 'paused');
  await p.keyboard.press('Escape'); await sleep(100);
  await inputChecks(G, p, 'mouse');
  // a slow drag: DESIGN §8 says a swipe is ≥ 24 px within 350 ms
  await setLane(p, 0); await sleep(150);
  const box = await canvasBox(p); const Y = box.y + box.h * 0.62, X0 = box.x + box.w * 0.5;
  await p.mouse.move(X0, Y); await p.mouse.down(); await p.mouse.move(X0 + 10, Y); await sleep(450); await p.mouse.move(X0 + 40, Y, { steps: 2 }); await p.mouse.up(); await sleep(300);
  const slow = await lane();
  check(G, 'slow drag (30 px after 450 ms) is not a swipe (DESIGN: within 350 ms)', slow === 0 ? true : 'warn', 'lane became ' + slow + ' (main.js uses a 600 ms window)');
  const e = await allErrors(p); check(G, 'no console errors (desktop input)', e.length === 0, e);
  await context.close();

  // touch device
  const t = await open('?mute=1&seed=7&autostart=1&diff=easy', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const cdp = await t.context.newCDPSession(t.page);
  await sandbox(t.page); await sleep(300);
  check('input-touch', 'touch device detected (body.touch)', await ev(t.page, () => document.body.classList.contains('touch')));
  await inputChecks('input-touch', t.page, 'touch', cdp);
  // a two-finger moment: second finger taps pause while the first is down (iOS sends no click for it)
  await setLane(t.page, 0); await sleep(150);
  const pb = await btnCenter(t.page, '#btnPause');
  const bx = await canvasBox(t.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx.x + bx.w * 0.5, y: bx.y + bx.h * 0.7, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx.x + bx.w * 0.5, y: bx.y + bx.h * 0.7, id: 1 }, { x: pb.x, y: pb.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: bx.x + bx.w * 0.5, y: bx.y + bx.h * 0.7, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  check('input-touch', 'second-finger tap on Pause pauses', (await mode(t.page)) === 'paused', await mode(t.page));
  await t.page.screenshot({ path: OUT + '/input_touch_pause.png' });
  const e2 = await allErrors(t.page); check('input-touch', 'no console errors (touch input)', e2.length === 0, e2);
  await t.context.close();
};

groups.scoring = async () => {
  const G = 'scoring';
  const { page: p, context } = await open('?mute=1&seed=7&autostart=1&diff=normal');
  await spyEvents(p); await sandbox(p); await sleep(300); await setLane(p, 0);
  let s0 = await st(p);
  check(G, 'Normal has 3 hearts', s0.hearts === 3 && s0.maxHearts === 3, s0.hearts);
  await ev(p, () => PO.debug.world.spawn('shell', 0, 3, { test: true }));
  await p.waitForFunction(() => PO.debug.world.shells >= 1, null, { timeout: 4000 }).catch(() => {});
  let s1 = await st(p);
  check(G, 'shell gives +10', s1.shells === 1 && s1.score - s0.score === 10, { score: s1.score - s0.score });
  await clearEvents(p);
  await ev(p, () => { const w = PO.debug.world, grp = { n: 10, taken: 0 }; for (let i = 0; i < 10; i++) w.spawn('shell', 0, 3 + i * 1.2, { test: true, grp }); });
  await p.waitForFunction(() => PO.debug.world.shells >= 11, null, { timeout: 6000 }).catch(() => {});
  const combos = await events(p, 'combo');
  check(G, 'combo event at 10 shells in a row', combos.length === 1 && combos[0].combo === 10, combos);
  await sleep(200);
  // bump
  s0 = await st(p); await clearEvents(p);
  await ev(p, () => PO.debug.world.spawn('pots', 0, 2.5, { test: true }));
  await p.waitForFunction(() => PO.debug.world.hearts < 3, null, { timeout: 4000 }).catch(() => {});
  s1 = await st(p);
  check(G, 'bump costs one heart', s1.hearts === s0.hearts - 1, { h0: s0.hearts, h1: s1.hearts });
  check(G, 'bump gives invulnerability + stumble + resets combo', s1.hero.invuln > 0.5 && s1.combo === 0 && (await events(p, 'bump')).length === 1, s1.hero);
  await ev(p, () => PO.debug.world.spawn('pots', 0, 1.5, { test: true }));
  await sleep(500);
  check(G, 'no second heart lost while invulnerable', (await st(p)).hearts === s1.hearts);
  await sleep(1500);
  await p.screenshot({ path: OUT + '/scoring_after_bump.png' });
  // chapter change at the goal
  await clearEvents(p);
  s0 = await st(p);
  await ev(p, () => { const w = PO.debug.world; w.levelDist = w.goal - 1.5; });
  await p.waitForFunction(() => PO.debug.world.level >= 1, null, { timeout: 4000 }).catch(() => {});
  await sleep(150);
  s1 = await st(p);
  const lu = await events(p, 'levelUp');
  check(G, 'chapter changes at the goal', s1.level === 1 && s1.zone === 1, s1.level);
  check(G, 'chapter gives a heart back', s1.hearts === Math.min(s0.maxHearts, s0.hearts + 1), { h0: s0.hearts, h1: s1.hearts });
  check(G, 'chapter bonus 100 × chapter', lu.length === 1 && lu[0].bonus === 100 && s1.score - s0.score >= 100, lu);
  const banner = await ev(p, () => PO.Game.renderer.banner && PO.Game.renderer.banner.s);
  check(G, 'chapter banner shown', banner === 1, banner);
  await sleep(500); await p.screenshot({ path: OUT + '/scoring_chapter2_banner.png' });
  // Fizz visit with no hits → perfect bonus
  await unsandbox(p); await sandbox(p, true); await clearEvents(p);
  s0 = await st(p);
  await ev(p, () => { PO.debug.world.hero.invuln = 999; PO.debug.summonBoss(); });
  await p.waitForFunction(() => PO.debug.world.objects.some(o => o.kind === 'pillow' && o.state === 'fly'), null, { timeout: 10000 }).catch(() => {});
  await sleep(200); await p.screenshot({ path: OUT + '/scoring_fizz_throw.png' });
  const thr = await events(p, 'throw');
  check(G, 'Fizz visit throws pillows', thr.length >= 1, thr.length);
  await ev(p, () => PO.debug.setSpeed(3));
  await p.waitForFunction(() => window._ev.some(e => e.type === 'bossLeave'), null, { timeout: 20000 }).catch(() => {});
  await ev(p, () => PO.debug.setSpeed(1));
  const bl = await events(p, 'bossLeave'); s1 = await st(p);
  check(G, 'Fizz throws all pillows (Normal: 4)', (await events(p, 'throw')).length === 4, (await events(p, 'throw')).length);
  check(G, 'perfect dodge → bonus 50 × chapter', bl.length === 1 && bl[0].perfect && bl[0].bonus === 50 * (s1.level + 1) && s1.stats.bossPerfect === 1, bl);
  await ev(p, () => { PO.debug.world.hero.invuln = 0; });
  // Fizz visit with a hit → no bonus
  await sleep(1500); await clearEvents(p);
  await ev(p, () => { PO.debug.world.hearts = 99; PO.debug.summonBoss(); });   // 99: several pillow hits must not end the run
  await p.waitForFunction(() => window._ev.some(e => e.type === 'bossLeave'), null, { timeout: 25000 }).catch(() => {});
  const bl2 = await events(p, 'bossLeave'), bumps2 = (await events(p, 'bump')).filter(e => e.kind === 'pillow');
  check(G, 'standing still in a lane gets hit by a pillow → no perfect bonus', bl2.length === 1 && bumps2.length >= 1 && !bl2[0].perfect && bl2[0].bonus === 0, { bl2, bumps: bumps2.length });
  await ev(p, () => { PO.debug.world.hearts = 3; });
  // game over at 0 hearts
  await unsandbox(p); await sandbox(p);
  await clearEvents(p);
  await ev(p, () => { const w = PO.debug.world; w.hearts = 1; w.hero.invuln = 0; w.spawn('log', w.hero.lane, 2.5, { test: true }); });
  await p.waitForFunction(() => PO.debug.world.phase === 'over', null, { timeout: 5000 }).catch(() => {});
  const go = await events(p, 'gameOver');
  { const sg = await st(p); check(G, 'game over at 0 hearts', go.length === 1 && sg.hearts === 0, { go: go.length, hearts: sg.hearts, phase: sg.phase, mode: await mode(p), y: sg.hero.y, inv: sg.hero.invuln }); }
  await p.waitForFunction(() => PO.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {});
  check(G, 'game over screen after the stop', (await mode(p)) === 'over');
  const e = await allErrors(p); check(G, 'no console errors (scoring)', e.length === 0, e);
  await context.close();

  // Easy → 5 hearts
  const q = await open('?mute=1&seed=7&autostart=1&diff=easy');
  const se = await st(q.page);
  check(G, 'Easy has 5 hearts', se.hearts === 5 && se.maxHearts === 5, se.hearts);
  await q.context.close();
  // Easy via the Settings screen (not the URL flag)
  const r = await open('?mute=1&seed=7');
  await r.page.click('#btnSettings'); await r.page.click('#setDifficulty [data-v=hard]'); await r.page.click('#scrSettings .btn-back');
  await r.page.click('#btnPlay'); await sleep(200);
  check(G, 'difficulty chosen in Settings is used (Hard: 3 hearts, faster)', (await st(r.page)).difficulty === 'hard');
  await r.context.close();
  // natural chapter change with the speed flag
  const n = await open('?mute=1&seed=7&autostart=1&diff=normal&bot=1&skill=1&speed=12');
  await spyEvents(n.page);
  await n.page.waitForFunction(() => PO.debug.world.level >= 1, null, { timeout: 30000 }).catch(() => {});
  const ln = await events(n.page, 'levelUp');
  check(G, 'chapter reached by running to the goal (bot, speed 12)', ln.length >= 1 && ln[0].bonus === 100, ln);
  await n.context.close();
};

groups.best = async () => {
  const G = 'best';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?mute=1&seed=7&autostart=1&diff=normal', {}, context);
  await sandbox(p); await sleep(200);
  await ev(p, () => { PO.debug.world.score = 1234; });
  await forceGameOver(p);
  const nb = await ev(p, () => ({ hidden: document.getElementById('newBest').classList.contains('hidden'), best: document.getElementById('overBest').textContent, score: document.getElementById('overScore').textContent }));
  check(G, 'NEW! badge on a new best', !nb.hidden && nb.best === '1234', nb);
  await p.screenshot({ path: OUT + '/best_new.png' });
  await p.reload(); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'playing');
  const stored = await ev(p, () => localStorage.getItem('por:best_normal'));
  check(G, 'best score persists across reload (por:best_normal)', stored === '1234', stored);
  await sandbox(p); await sleep(200);
  await ev(p, () => { PO.debug.world.score = 500; });
  await forceGameOver(p);
  const nb2 = await ev(p, () => ({ hidden: document.getElementById('newBest').classList.contains('hidden'), best: document.getElementById('overBest').textContent }));
  check(G, 'no NEW! badge when below best; best still shown', nb2.hidden && nb2.best === '1234', nb2);
  const p2 = await context.newPage(); p2.errs = [];
  await p2.goto(GAME + '?mute=1&seed=7&diff=easy'); await p2.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  check(G, 'best is per difficulty (Easy best still 0 on title)', (await ev(p2, () => document.getElementById('bestTitle').textContent)) === '0');
  await p2.goto(GAME + '?mute=1&seed=7&diff=normal'); await p2.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  check(G, 'title shows Normal best 1234', (await ev(p2, () => document.getElementById('bestTitle').textContent)) === '1234');
  // score 0 → never "NEW!"
  await p2.goto(GAME + '?mute=1&seed=7&diff=hard&autostart=1'); await p2.waitForFunction(() => PO.debug && PO.debug.mode === 'playing');
  await sandbox(p2); await ev(p2, () => { PO.debug.world.score = 0; }); await forceGameOver(p2);
  check(G, 'score 0 is never a NEW! best', await ev(p2, () => document.getElementById('newBest').classList.contains('hidden')));
  // reset best needs two taps
  await p2.goto(GAME + '?mute=1&seed=7&diff=normal'); await p2.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  await p2.click('#btnSettings'); await p2.click('#btnResetBest'); await sleep(100);
  const after1 = await ev(p2, () => localStorage.getItem('por:best_normal'));
  await p2.click('#btnResetBest'); await sleep(100);
  const after2 = await ev(p2, () => localStorage.getItem('por:best_normal'));
  check(G, 'Reset best needs two taps', after1 === '1234' && after2 === null, { after1, after2 });
  await context.close();
};

groups.lifecycle = async () => {
  const G = 'lifecycle';
  const { page: p, context } = await open('?mute=1&seed=7&autostart=1&diff=normal');
  await sandbox(p); await sleep(300);
  await ev(p, () => window.dispatchEvent(new Event('blur'))); await sleep(100);
  check(G, 'window blur pauses', (await mode(p)) === 'paused');
  await p.keyboard.press('Escape'); await sleep(100);
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check(G, 'visibilitychange (hidden) pauses + suspends audio', (await mode(p)) === 'paused' && await ev(p, () => PO.Audio._hidden === true));
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check(G, 'visible again: stays paused until the player resumes', (await mode(p)) === 'paused' && await ev(p, () => PO.Audio._hidden === false));
  await p.keyboard.press('Escape'); await sleep(100);
  // death frame: blur right after the last heart is lost
  await ev(p, () => {
    window._modes = [];
    const w = PO.debug.world; w.hearts = 1; w.hero.invuln = 0; w.spawn('pots', w.hero.lane, 0.2, { test: true });
    const iv = setInterval(() => { window._modes.push(PO.debug.mode); if (PO.debug.world.phase === 'over' && !window._blurred) { window._blurred = true; window.dispatchEvent(new Event('blur')); } if (PO.debug.mode === 'over') clearInterval(iv); }, 10);
  });
  await p.waitForFunction(() => PO.debug.mode === 'over', null, { timeout: 6000 }).catch(() => {});
  const modes = await ev(p, () => window._modes);
  check(G, 'no pause on the death frame (blur while dying)', !modes.includes('paused') && (await mode(p)) === 'over', [...new Set(modes)]);
  // 0.7 s restart lock
  const g0 = await ev(p, () => PO.debug.stats.games);
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnAgain', null, { timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Enter'); await sleep(60); }
  check(G, 'Enter spam within 0.7 s does not restart', (await mode(p)) === 'over');
  await sleep(700);
  await ev(p, () => { window._starts = 0; const o = PO.Game.startGame.bind(PO.Game); PO.Game.startGame = function () { window._starts++; return o(); }; });
  await p.keyboard.press('Enter'); await sleep(300);
  check(G, 'Enter after 0.7 s restarts exactly once (no double trigger via the focused button)', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1, await ev(p, () => window._starts));
  // Space on game over
  await sandbox(p); await forceGameOver(p); await sleep(800);
  await ev(p, () => { window._starts = 0; });
  await p.keyboard.press('Space'); await sleep(300);
  check(G, 'Space on game over restarts exactly once', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1, await ev(p, () => window._starts));
  // game over → Menu → music off; title demo running
  await sandbox(p); await forceGameOver(p); await sleep(800);
  await p.click('#btnOverMenu'); await sleep(300);
  check(G, 'music off on title after game over', (await ev(p, () => PO.Audio._musicPlaying)) === false && (await mode(p)) === 'title');
  // autorestart flag
  const a = await open('?mute=1&seed=7&autostart=1&autorestart=1&diff=normal');
  await sandbox(a.page); await forceGameOver(a.page);
  await a.page.waitForFunction(() => PO.debug.mode === 'playing', null, { timeout: 3000 }).catch(() => {});
  check(G, 'autorestart starts a new game after game over', (await mode(a.page)) === 'playing' && (await ev(a.page, () => PO.debug.stats.games)) === 1);
  await a.context.close();
  const e = await allErrors(p); check(G, 'no console errors (lifecycle)', e.length === 0, e);
  await context.close();
};

groups.focus = async () => {
  const G = 'focus';
  const { page: p, context } = await open('?mute=1&seed=7');
  await ev(p, () => { window._starts = 0; const o = PO.Game.startGame.bind(PO.Game); PO.Game.startGame = function () { window._starts++; return o(); }; });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnPlay');
  await p.keyboard.press('Space'); await sleep(300);
  const s = await st(p);
  check(G, 'Space on focused Play starts once, no jump', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1 && s.stats.jumps === 0, { starts: await ev(p, () => window._starts), jumps: s.stats.jumps });
  await sandbox(p);
  check(G, 'focus left the buttons during play', await ev(p, () => !document.activeElement || document.activeElement === document.body || document.activeElement.tagName !== 'BUTTON'), await ev(p, () => document.activeElement && document.activeElement.id));
  // mouse click on the HUD mute button, then Space must jump (not toggle mute again)
  const m0 = await ev(p, () => !!(PO.Game.settings.muted || PO.Game.urlMute));
  await p.click('#btnMuteHud'); await sleep(150);
  const m1 = await ev(p, () => !!(PO.Game.settings.muted || PO.Game.urlMute));
  const j0 = (await st(p)).stats.jumps;
  await p.keyboard.press('Space'); await sleep(200);
  const m2 = await ev(p, () => !!(PO.Game.settings.muted || PO.Game.urlMute));
  check(G, 'after clicking the HUD mute button, Space jumps and does not re-press the button', m0 !== m1 && m2 === m1 && (await st(p)).stats.jumps === j0 + 1, { m0, m1, m2, jumps: (await st(p)).stats.jumps - j0 });
  await sleep(700);
  await p.keyboard.press('Enter'); await sleep(200);
  check(G, 'Enter after clicking the HUD mute button does not toggle mute / pause', (await ev(p, () => !!(PO.Game.settings.muted || PO.Game.urlMute))) === m1 && (await mode(p)) === 'playing');
  // mouse click Pause, Space on focused Resume → resume once, no jump
  await p.click('#btnPause'); await sleep(200);
  const j1 = (await st(p)).stats.jumps;
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnResume', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Space'); await sleep(250);
  check(G, 'Space on focused Resume resumes without a jump', (await mode(p)) === 'playing' && (await st(p)).stats.jumps === j1, { mode: await mode(p), jumps: (await st(p)).stats.jumps - j1 });
  await p.keyboard.press('Escape'); await sleep(150);
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnResume', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Enter'); await sleep(250);
  check(G, 'Enter on focused Resume resumes without a jump', (await mode(p)) === 'playing' && (await st(p)).stats.jumps === j1);
  // Tab to Settings on the title and press Space → opens Settings, not the game
  await p.click('#btnPause'); await p.click('#btnPauseMenu'); await sleep(200);
  await ev(p, () => { window._starts = 0; document.getElementById('btnSettings').focus(); });
  await p.keyboard.press('Space'); await sleep(250);
  check(G, 'Space on a focused Settings button opens Settings (not the game)', (await ui(p)) === 'scrSettings' && (await ev(p, () => window._starts)) === 0, { ui: await ui(p), starts: await ev(p, () => window._starts) });
  // Space on a Settings toggle row must not start the game / leave the screen
  await ev(p, () => document.querySelector('#setDifficulty [data-v=normal]').focus());
  await p.keyboard.press('Space'); await sleep(200);
  check(G, 'Space on a focused difficulty button selects it', (await ui(p)) === 'scrSettings' && (await ev(p, () => PO.Game.settings.difficulty)) === 'normal');
  await p.keyboard.press('Escape'); await sleep(150);
  // Enter on title: the focused Play button
  await ev(p, () => { window._starts = 0; });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnPlay', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Enter'); await sleep(250);
  check(G, 'Enter on title starts once', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1);
  const e = await allErrors(p); check(G, 'no console errors (focus)', e.length === 0, e);
  await context.close();
};

groups.settings = async () => {
  const G = 'settings';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?seed=7', {}, context);
  await p.click('#btnSettings'); await sleep(150);
  check(G, 'Full screen toggle exists', await ev(p, () => !!document.getElementById('setFull') && !document.getElementById('rowFull').classList.contains('hidden')));
  check(G, 'defaults: sfx on, music on, Easy', await ev(p, () => document.getElementById('setSfx').checked && document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'easy'));
  await p.click('#setSfx + .tog'); await p.click('#setMusic + .tog'); await p.click('#setDifficulty [data-v=hard]');
  await sleep(100);
  const saved = await ev(p, () => JSON.parse(localStorage.getItem('por:settings') || '{}'));
  check(G, 'settings saved', saved.sfx === false && saved.music === false && saved.difficulty === 'hard', saved);
  check(G, 'audio options applied', await ev(p, () => PO.Audio.sfxOn === false && PO.Audio.musicOn === false));
  await p.click('#setFull + .tog').catch(() => {}); await sleep(300);
  await p.reload(); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  await p.click('#btnSettings'); await sleep(150);
  check(G, 'settings persist across reload', await ev(p, () => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'hard'));
  check(G, 'full screen is not persisted as a setting', await ev(p, () => !('fullscreen' in JSON.parse(localStorage.getItem('por:settings') || '{}'))));
  await p.screenshot({ path: OUT + '/settings.png' });
  // ?mute=1 never saved
  await ev(p, () => localStorage.clear());
  await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  check(G, '?mute=1 mutes audio', await ev(p, () => PO.Audio.muted === true));
  await p.click('#btnSettings'); await p.click('#setSfx + .tog'); await sleep(100);
  const s2 = await ev(p, () => JSON.parse(localStorage.getItem('por:settings') || '{}'));
  check(G, '?mute=1 is not written into saved settings', s2.muted !== true, s2);
  await p.keyboard.press('Escape');
  await p.keyboard.press('KeyM'); await sleep(100);
  const s3 = await ev(p, () => JSON.parse(localStorage.getItem('por:settings') || '{}'));
  check(G, 'M with ?mute=1 un-mutes for this session only (nothing saved as muted)', s3.muted !== true && await ev(p, () => PO.Audio.muted === false), s3);
  await p.goto(GAME + '?seed=7'); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  check(G, 'next normal load is not muted', await ev(p, () => PO.Audio.muted === false));
  await p.keyboard.press('KeyM'); await sleep(100);
  check(G, 'M mute is saved (user choice)', await ev(p, () => JSON.parse(localStorage.getItem('por:settings')).muted === true));
  await p.keyboard.press('KeyM');
  // ?diff=... is a test flag: choosing a difficulty in Settings must still highlight the choice
  await p.goto(GAME + '?mute=1&seed=7&diff=normal'); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  await p.click('#btnSettings'); await p.click('#setDifficulty [data-v=easy]'); await sleep(100);
  const hl = await ev(p, () => document.querySelector('#setDifficulty .on').dataset.v);
  check(G, 'with ?diff= flag, clicking a difficulty highlights it', hl === 'easy' ? true : 'warn', 'highlight stays on the URL difficulty "' + hl + '" (test-flag only)');
  const e = await allErrors(p); check(G, 'no console errors (settings)', e.length === 0, e);
  await context.close();
};

groups.pictures = async () => {
  const G = 'pictures';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?mute=1&seed=7', {}, context);
  const img = await makeImages(p);
  const F = (name, mimeType, b64) => ({ name, mimeType, buffer: Buffer.from(b64, 'base64') });
  await p.click('#btnCustomize'); await sleep(200);
  const nSlots = await ev(p, () => document.querySelectorAll('#slotGrid .slot').length);
  check(G, '6 picture slots (Pebble, Seashell, 4 chapters)', nSlots === 6, nSlots);
  // 1 photo → Pebble
  await pickFile(p, 1, F('red.png', 'image/png', img.photoRed));
  let t = await waitToast(p, /saved/i);
  check(G, 'PNG photo for Pebble saved', /saved/i.test(t), t);
  let info = await ev(p, () => ({ has: PO.Assets.hasCustom('hero'), shape: localStorage.getItem('por:shape_hero'), tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent }));
  check(G, 'photo becomes a Round sticker by default, card says "Your picture"', info.has && info.shape === 'circle' && /Your picture/.test(info.tag), info);
  // shape toggle
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=fit]'); await sleep(150);
  check(G, 'Whole picture toggle saved', (await ev(p, () => localStorage.getItem('por:shape_hero'))) === 'fit' && await ev(p, () => document.querySelector('#slotGrid .slot:nth-child(1) [data-shape=fit]').classList.contains('on')));
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=circle]'); await sleep(150);
  check(G, 'Round toggle saved', (await ev(p, () => localStorage.getItem('por:shape_hero'))) === 'circle');
  // 2 transparent → Seashell stays whole
  await pickFile(p, 2, F('cutout.png', 'image/png', img.transparent));
  t = await waitToast(p, /saved/i);
  info = await ev(p, () => ({ has: PO.Assets.hasCustom('shell'), shape: localStorage.getItem('por:shape_shell') }));
  check(G, 'transparent PNG for Seashell saved as Whole picture', /saved/i.test(t) && info.has && info.shape === 'fit', { t, info });
  // 3 huge JPEG → Palm Grove background
  const t0 = Date.now();
  await pickFile(p, 3, F('huge.jpg', 'image/jpeg', img.huge));
  t = await waitToast(p, /saved/i, 15000);
  const dims = await ev(p, () => { const i = PO.Assets.customSrc.bg_grove; return i ? [i.naturalWidth, i.naturalHeight, (localStorage.getItem('por:img_bg_grove') || '').length] : null; });
  check(G, 'huge 4000×3000 JPEG background saved and downscaled (long edge ≤ 1600)', /saved/i.test(t) && dims && Math.max(dims[0], dims[1]) <= 1600 && dims[2] < 2.5e6, { t, dims, ms: Date.now() - t0 });
  // huge JPEG on Pebble (char slot) too
  await pickFile(p, 1, F('huge.jpg', 'image/jpeg', img.huge));
  t = await waitToast(p, /saved/i, 15000);
  const hd = await ev(p, () => { const i = PO.Assets.customSrc.hero; return [i.naturalWidth, i.naturalHeight]; });
  check(G, 'huge JPEG for Pebble downscaled to ≤ 512', /saved/i.test(t) && Math.max(...hd) <= 512, hd);
  // non-image file
  await pickFile(p, 4, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(p, /picture file/i);
  check(G, 'non-image file → friendly error toast', /Please choose a picture file/.test(t) && !(await ev(p, () => PO.Assets.hasCustom('bg_dunes'))), t);
  // a file that claims to be an image but is broken
  await pickFile(p, 4, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(p, /could not be opened/i);
  check(G, 'broken image file → friendly error toast', /could not be opened/i.test(t), t);
  await p.screenshot({ path: OUT + '/pictures_screen.png' });
  // background for night too, then play with custom hero / shell / bg
  await pickFile(p, 6, F('blue.png', 'image/png', img.photoBlue)); await waitToast(p, /saved/i);
  await pickFile(p, 1, F('red.png', 'image/png', img.photoRed)); await waitToast(p, /saved/i);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await ev(p, () => {
    window._drawn = {}; const R = PO.Game.renderer, o = R.drawSpr.bind(R), ob = R.background.bind(R);
    R.drawSpr = function (g, key, ...a) { const r = o(g, key, ...a); if (r) window._drawn[key] = (window._drawn[key] || 0) + 1; return r; };
    R.background = function (b) { const r = ob(b); if (r && r.custom) window._drawn['bg_custom_' + b] = 1; return r; };
  });
  await p.click('#btnPlay'); await sleep(300); await sandbox(p);
  await ev(p, () => { const w = PO.debug.world; for (let i = 0; i < 8; i++) w.spawn('shell', i % 3 - 1, 4 + i * 1.5, { test: true, variant: i % 3 }); });
  await sleep(1200);
  await p.screenshot({ path: OUT + '/pictures_play_grove.png' });
  let drawn = await ev(p, () => window._drawn);
  check(G, 'custom Pebble drawn during play', (drawn['custom:hero'] || 0) > 10, drawn['custom:hero']);
  check(G, 'custom Seashell drawn during play', (drawn['custom:shell'] || 0) > 5, drawn['custom:shell']);
  check(G, 'custom Palm Grove background drawn', !!drawn.bg_custom_0, Object.keys(drawn).filter(k => k.startsWith('bg')));
  await ev(p, () => PO.debug.gotoLevel(3)); await sleep(2500);
  await p.screenshot({ path: OUT + '/pictures_play_night.png' });
  drawn = await ev(p, () => window._drawn);
  check(G, 'custom Starry Oasis background drawn', !!drawn.bg_custom_3);
  // the sprite the renderer draws must follow a later picture change (renderer keeps its own sprite cache)
  const pixel = () => ev(p, () => {
    const R = PO.Game.renderer; let c = null;
    for (const [k, v] of R._spr) if (k.startsWith('custom:hero|')) c = v;
    if (!c) return null;
    const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [d[0], d[1], d[2]];
  });
  const px1 = await pixel();
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(150);
  await pickFile(p, 1, F('blue.png', 'image/png', img.photoBlue)); await waitToast(p, /saved/i);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await p.click('#btnPlay'); await sleep(300); await sandbox(p); await sleep(600);
  const px2 = await pixel();
  await p.screenshot({ path: OUT + '/pictures_play_after_change.png' });
  check(G, 'changing Pebble\'s picture again shows the NEW picture in play (no stale sprite)', px2 && px2[2] > 150 && px2[0] < 100, { before: px1, after: px2 });
  // shape change only
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await ev(p, () => { PO.Game.renderer._spr.forEach((v, k) => {}); });
  await p.click('#btnCustomize'); await sleep(150);
  const sprBefore = await ev(p, () => { let c = null; for (const [k, v] of PO.Game.renderer._spr) if (k.startsWith('custom:hero|')) c = k; return c; });
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=fit]'); await sleep(150);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await p.click('#btnPlay'); await sleep(300); await sandbox(p); await sleep(500);
  const corner = await ev(p, () => {   // a Round sticker has a transparent corner; a Whole square photo has an opaque blue corner
    const R = PO.Game.renderer; let c = null;
    for (const [k, v] of R._spr) if (k.startsWith('custom:hero|')) c = v;
    const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  });
  check(G, 'Round → Whole picture change shows in play', corner[3] > 200, { corner, sprBefore });
  // reset one
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(150);
  await p.click('#slotGrid .slot:nth-child(2) [data-act=reset]'); await sleep(150);
  check(G, 'Reset one slot', !(await ev(p, () => PO.Assets.hasCustom('shell'))) && (await ev(p, () => localStorage.getItem('por:img_shell'))) === null && await ev(p, () => PO.Assets.hasCustom('hero')));
  await p.click('#btnResetAll'); await sleep(150);
  check(G, 'Reset all', await ev(p, () => PO.Assets.SLOTS.every(s => !PO.Assets.hasCustom(s.id)) && Object.keys(localStorage).filter(k => k.startsWith('por:img_')).length === 0));
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await ev(p, () => { window._drawn = {}; });
  await p.click('#btnPlay'); await sleep(1000);
  drawn = await ev(p, () => window._drawn);
  check(G, 'after Reset all, the original art is drawn again', !drawn['custom:hero'] && !drawn.bg_custom_0 && Object.keys(drawn).some(k => k.startsWith('pebble_')), Object.keys(drawn).slice(0, 8));
  // persistence of a picture across reload
  await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  await p.click('#btnCustomize'); await pickFile(p, 1, F('red.png', 'image/png', img.photoRed)); await waitToast(p, /saved/i);
  await p.reload(); await p.waitForFunction(() => PO.debug && PO.debug.mode === 'title');
  check(G, 'custom picture persists across reload', await ev(p, () => PO.Assets.hasCustom('hero')));
  const e = await allErrors(p); check(G, 'no console errors (pictures)', e.length === 0, e);
  await context.close();
};

const SIZES = [
  { name: '1280x720', viewport: { width: 1280, height: 720 } },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 } },
  { name: '960x600', viewport: { width: 960, height: 600 } },
  { name: '800x1280-portrait', viewport: { width: 800, height: 1280 }, hasTouch: true },
  { name: 'iPhone-390x844', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { name: 'iPhone-844x390', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { name: 'iPad-1024x768', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: 'iPad-768x1024', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
];
async function screenFit(p, id) {
  return p.evaluate(id => {
    const vw = innerWidth, vh = innerHeight, out = { overflowX: document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, bad: [], scroll: false };
    const scr = document.getElementById(id), panel = scr.querySelector('.panel') || scr.querySelector('.title-wrap');
    if (panel) {
      const r = panel.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.bad.push('panel ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      out.scroll = panel.scrollHeight > panel.clientHeight + 2 || panel.scrollWidth > panel.clientWidth + 2;
      if (panel.scrollWidth > panel.clientWidth + 2) out.bad.push('panel scrolls sideways ' + panel.scrollWidth + '>' + panel.clientWidth);
    }
    scr.querySelectorAll('button').forEach(b => {
      if (b.offsetParent === null || b.closest('.hidden')) return;
      const r = b.getBoundingClientRect(); if (r.width === 0) return;
      if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.bad.push((b.id || b.textContent.trim().slice(0, 18)) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      else {   // clickable: the element at its centre is the button (or inside it)
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!h || !b.contains(h)) out.bad.push((b.id || b.textContent.trim().slice(0, 18)) + ' covered by ' + (h && (h.id || h.className)));
      }
      if (r.width < 30 || r.height < 28) out.small = (out.small || []).concat((b.id || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return out;
  }, id);
}
groups.layout = async () => {
  const G = 'layout';
  for (const S of SIZES) {
    const { page: p, context } = await open('?mute=1&seed=7', S);
    await sleep(600);
    for (const id of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      if (id !== 'scrTitle') await ev(p, id => PO.UI.open(id, 'scrTitle'), id);
      await sleep(700);   // let the 'pop' entrance animation (scale overshoot 1.03) finish before measuring
      const f = await screenFit(p, id);
      // a panel that has to scroll to reach a button is OK only if the button can be reached; report it as a WARN
      const offButtons = f.bad.filter(b => !b.startsWith('panel') && !/covered/.test(b));
      const ok = !f.overflowX && !f.bad.some(b => b.startsWith('panel') || /covered/.test(b)) && (offButtons.length === 0 || (f.scroll ? 'warn' : false));
      check(G, `${S.name} ${id} fits (no sideways overflow, buttons inside the viewport)`, offButtons.length && f.scroll && !f.overflowX && !f.bad.some(b => b.startsWith('panel') || /covered/.test(b)) ? 'warn' : ok, f);
      if (f.small && S.hasTouch) check(G, `${S.name} ${id} touch targets ≥ 30×28 px`, 'warn', f.small);
      await p.screenshot({ path: OUT + `/layout_${S.name}_${id}.png` });
      if (id !== 'scrTitle') await ev(p, () => PO.UI.back());
    }
    await ev(p, () => PO.debug.startGame()); await sleep(800);
    const hud = await p.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => {
      const b = document.getElementById(id), r = b.getBoundingClientRect(), c = document.getElementById('game').getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, onCanvas: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1, clickable: !!h && b.contains(h), w: Math.round(r.width) };
    }));
    check(G, `${S.name} HUD buttons visible and clickable`, hud.every(h => h.inView && h.clickable && h.w >= 30), hud);
    await p.screenshot({ path: OUT + `/layout_${S.name}_play.png` });
    await ev(p, () => PO.Game.pause()); await sleep(700);
    let f = await screenFit(p, 'scrPause');
    check(G, `${S.name} pause screen fits`, !f.overflowX && f.bad.length === 0 ? true : (f.scroll && !f.overflowX ? 'warn' : false), f);
    await p.screenshot({ path: OUT + `/layout_${S.name}_pause.png` });
    await ev(p, () => PO.Game.resume());
    await sandbox(p); await forceGameOver(p); await sleep(1000);
    f = await screenFit(p, 'scrOver');
    check(G, `${S.name} game over screen fits`, !f.overflowX && f.bad.length === 0 ? true : (f.scroll && !f.overflowX ? 'warn' : false), f);
    await p.screenshot({ path: OUT + `/layout_${S.name}_over.png` });
    const e = await allErrors(p); check(G, `${S.name} no console errors`, e.length === 0, e);
    await context.close();
  }
  // live resize / rotation without reload
  const { page: p, context } = await open('?mute=1&seed=7&autostart=1', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await sandbox(p); await sleep(300);
  await p.setViewportSize({ width: 844, height: 390 }); await sleep(500);
  const r = await ev(p, () => { const R = PO.Game.renderer, c = document.getElementById('game').getBoundingClientRect(); return { VW: R.VW, VH: R.VH, cw: c.width, ch: c.height, iw: innerWidth, ih: innerHeight }; });
  check(G, 'rotate portrait → landscape relayouts the canvas', r.VW > r.VH && Math.abs(r.cw - r.iw) < 2 || Math.abs(r.ch - r.ih) < 2, r);
  const box = await canvasBox(p); await setLane(p, 0);
  await p.touchscreen.tap(box.x + box.w * 0.9, box.y + box.h * 0.6); await sleep(300);
  check(G, 'after rotation, tap zones follow the new size', (await st(p)).hero.lane === 1);
  await p.screenshot({ path: OUT + '/layout_rotated.png' });
  await context.close();
};

groups.soak = async () => {
  const G = 'soak';
  const { page: p, context } = await open('?mute=1&seed=5&autostart=1&autorestart=1&bot=1&skill=0.8&diff=normal&speed=16');
  await spyEvents(p);
  await ev(p, () => {   // keep the event log small
    const o = PO.Game.handleEvents; PO.Game.handleEvents = function (e) { const r = o.call(this, e); if (window._ev.length > 5000) window._ev = window._ev.filter(x => x.type !== 'shell' && x.type !== 'lane' && x.type !== 'jump' && x.type !== 'land'); return r; };
  });
  let maxObj = 0, maxPart = 0, maxFx = 0, maxLevel = 0, maxTexts = 0, maxFly = 0, frames0 = 0;
  const t0 = Date.now(), DUR = 75000;
  let shot = 0;
  while (Date.now() - t0 < DUR) {
    await sleep(1000);
    const s = await ev(p, () => { const s = PO.debug.getState(), R = PO.Game.renderer; s.texts = R.texts.length; s.flyers = R.flyers.length; s.cache = PO.Assets._cache.size; s.spr = R._spr.size; s.bg = R._bg.size; return s; });
    maxObj = Math.max(maxObj, s.objects); maxPart = Math.max(maxPart, s.particles); maxFx = Math.max(maxFx, s.fx); maxTexts = Math.max(maxTexts, s.texts); maxFly = Math.max(maxFly, s.flyers);
    maxLevel = Math.max(maxLevel, s.level);
    if (Date.now() - t0 > shot * 15000) { await p.screenshot({ path: OUT + `/soak_${shot}.png` }); shot++; }
    p._last = s;
  }
  const stats = await ev(p, () => PO.debug.stats);
  const lv = await events(p, 'levelUp'), bosses = await events(p, 'bossEnter');
  const s = p._last;
  console.log('   soak:', JSON.stringify({ games: stats.games, scores: stats.scores, levels: stats.levels, maxLevel, levelUps: lv.length, bossVisits: bosses.length, maxObj, maxPart, maxFx, maxTexts, maxFly, cache: s.cache, spr: s.spr, bg: s.bg }));
  check(G, 'several chapters reached', lv.length >= 3, { levelUps: lv.length, maxLevel });
  check(G, 'Fizz visited several times', bosses.length >= 3, bosses.length);
  check(G, 'objects bounded (< 200)', maxObj < 200, maxObj);
  check(G, 'weather particles bounded (< 160)', maxPart < 160, maxPart);
  check(G, 'renderer fx/texts/flyers bounded', maxFx < 400 && maxTexts < 60 && maxFly < 60, { maxFx, maxTexts, maxFly });
  check(G, 'sprite / background caches bounded', s.cache < 600 && s.spr < 600 && s.bg < 12, { cache: s.cache, spr: s.spr, bg: s.bg });
  check(G, 'autorestart works (≥ 1 game over → new game)', stats.games >= 1 ? true : 'warn', stats.games === 0 ? 'bot never died in 75 s (skill 0.8) — autorestart not exercised here (covered in lifecycle)' : stats.games);
  check(G, 'still playing at the end', ['playing', 'over'].includes(await mode(p)));
  const e = await allErrors(p); check(G, 'no errors during the long bot run', e.length === 0 && stats.errors.length === 0, e);
  await context.close();
  // a hard / skill 0.5 soak to exercise deaths + autorestart
  const q = await open('?mute=1&seed=9&autostart=1&autorestart=1&bot=1&skill=0.4&diff=hard&speed=16');
  await sleep(30000);
  const qs = await ev(q.page, () => PO.debug.stats);
  check(G, 'autorestart (Hard, skill 0.4, speed 16): several games, no errors', qs.games >= 2 && qs.errors.length === 0 && q.page.errs.length === 0, { games: qs.games, scores: qs.scores, errors: qs.errors.concat(q.page.errs) });
  await q.context.close();
};

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, fn] of Object.entries(groups)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(`\n=== ${name} ===`);
    const t0 = Date.now();
    try { await fn(); } catch (err) { check(name, 'group ran to the end', false, String(err && err.stack || err).split('\n').slice(0, 4).join(' | ')); }
    console.log(`   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  const n = k => results.filter(r => r.st === k).length;
  console.log(`\nSUMMARY: ${n('PASS')} PASS, ${n('FAIL')} FAIL, ${n('WARN')} WARN`);
  const byGroup = {};
  for (const r of results) { const g = r.group.replace(/-touch$/, ''); byGroup[g] = byGroup[g] || { PASS: 0, FAIL: 0, WARN: 0 }; byGroup[g][r.st]++; }
  console.log(JSON.stringify(byGroup));
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1));
  process.exit(n('FAIL') ? 1 : 0);
})();
