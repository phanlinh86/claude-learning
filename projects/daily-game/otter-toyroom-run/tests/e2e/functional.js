// Functional QA suite for Otto's Playroom Dash (lane runner, gravity per biome).
// Run:  node tests/e2e/functional.js [--quick] [--only=boot,menus,input,scoring,gravity,best,lifecycle,focus,settings,storage,pictures,layout,soak]
//   --quick: shorter soak runs (≈ 20 s instead of 75 s) and fewer layout sizes.
// Prints PASS / FAIL / WARN per check and exits non-zero when any check FAILs.
// Screenshots + results.json go to tests/out/functional/ (gitignored).
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/functional'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const QUICK = process.argv.includes('--quick');

const results = [];
function check(group, name, ok, detail) {
  const st = ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  results.push({ group, name, st, detail });
  console.log(`${st}  [${group}] ${name}${detail !== undefined && st !== 'PASS' ? '  -- ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`);
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
  await page.waitForFunction(() => window.OD && OD.debug && OD.debug.mode && OD.debug.mode !== 'boot', null, { timeout: 20000 });
  return { page, context };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const st = p => p.evaluate(() => OD.debug.getState());
const mode = p => p.evaluate(() => OD.debug.mode);
const ui = p => p.evaluate(() => OD.UI.current);
async function allErrors(p) { const e = await p.evaluate(() => OD.debug.stats.errors.slice()).catch(() => []); return p.errs.concat(e); }
const waitMode = (p, m, ms = 5000) => p.waitForFunction(m => OD.debug.mode === m, m, { timeout: ms }).catch(() => {});

// Record every world event that reaches the game controller (the controller drains the world each step).
async function spyEvents(p) {
  await p.evaluate(() => {
    if (window._spy) return; window._spy = true; window._ev = [];
    const G = OD.Game, orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) {
      for (const e of evts) {
        const c = { t: OD.debug.world ? OD.debug.world.time : 0 }; for (const k in e) if (k !== 'o') c[k] = e[k];
        if (e.o) c.kind = c.kind || e.o.kind;
        if (e.type === 'land') { const h = OD.debug.world.hero; c.airT = h.airT; c.apexY = h.apexY; }
        window._ev.push(c);
      }
      if (window._ev.length > 6000) window._ev = window._ev.filter(x => !['acorn', 'lane', 'jump', 'land', 'ballBounce'].includes(x.type));
      return orig(evts);
    };
  });
}
const events = (p, type) => p.evaluate(t => window._ev.filter(e => !t || e.type === t), type);
const clearEvents = p => p.evaluate(() => { window._ev = []; });

// Keep the track empty except objects tagged {test:true}, so input tests are not disturbed.
async function sandbox(p) {
  await p.evaluate(() => {
    clearInterval(window._sbx);
    const f = () => { const w = OD.debug.world; if (!w || OD.debug.mode === 'title') return; w.objects = w.objects.filter(o => o.test); };
    f(); window._sbx = setInterval(f, 30);
  });
}
const unsandbox = p => p.evaluate(() => clearInterval(window._sbx));
const setLane = (p, l) => p.evaluate(l => OD.debug.world.setLane(l), l);
const ground = p => p.waitForFunction(() => OD.debug.world.hero.onGround, null, { timeout: 4000 }).catch(() => {});

async function forceGameOver(p) {
  await p.evaluate(() => {
    const w = OD.debug.world; w.hearts = 1; w.hero.invuln = 0;
    w.spawn('tower', w.hero.lane, 0.6, { test: true });
  });
  await p.waitForFunction(() => OD.debug.mode === 'over', null, { timeout: 8000 });
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
      portrait: mk(900, 1600, (g, w, h) => { g.fillStyle = '#8040c0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 3, h / 3, w / 3, h / 3); }, 'image/jpeg', 0.85),
      huge: mk(6000, 4000, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff7f50'); gr.addColorStop(1, '#4060ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { g.fillStyle = `hsl(${i * 6},70%,60%)`; g.fillRect((i * 263) % w, (i * 151) % h, 300, 300); } }, 'image/jpeg', 0.92)
    };
  });
}
async function pickFile(p, slot, file) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click(`#slotGrid .slot:nth-child(${slot}) [data-act=pick]`)]);
  await fc.setFiles(file);
}
// the same, but straight into the hidden input with setInputFiles (what the task asks for, no chooser dialog)
async function setInput(p, slotId, file) {
  await p.evaluate(s => { OD.UI._pickSlot = s; }, slotId);
  await p.setInputFiles('#filePick', file);
}
const toastText = p => p.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });
async function waitToast(p, re, ms = 6000) {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < ms) { last = await toastText(p); if (re.test(last)) return last; await sleep(60); }
  return 'NO MATCH, last toast: ' + last;
}

// DESIGN / MECHANICS §1 targets (apex u, airtime s) per biome
const GRAV = [
  { gk: 1.0, apex: 1.01, air: 0.66, name: 'The Felt Meadow' },
  { gk: 0.7, apex: 1.13, air: 0.85, name: 'Pillow Mountains' },
  { gk: 1.25, apex: 0.95, air: 0.57, name: 'The Crayon Jungle' },
  { gk: 0.5, apex: 1.25, air: 1.06, name: 'The Glow-Star Galaxy' }
];

// ============================================================================================ groups
const groups = {};

groups.boot = async () => {
  const G = 'boot';
  const { page: p, context } = await open('?seed=7');
  check(G, 'boots into the title screen', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
  check(G, 'namespace window.OD with debug hooks', await ev(p, () => ['world', 'weather', 'mode', 'stats', 'getState', 'setSpeed', 'startGame', 'setBot', 'setAutoRestart', 'gotoLevel', 'move', 'jump'].every(k => k in OD.debug)));
  const d0 = (await st(p)).dist; await sleep(2500);
  const s1 = await st(p);
  const bot = await ev(p, () => !!OD.Game.bot);
  check(G, 'title demo is running with the bot', bot && s1.dist > d0 + 5, { d0, d1: s1.dist, bot });
  check(G, 'title demo: Otto changes lanes / jumps by himself', s1.stats.lanes > 0 || s1.stats.jumps > 0, s1.stats);
  check(G, 'HUD hidden on title', await ev(p, () => document.getElementById('hud').classList.contains('hidden')));
  check(G, 'Play button focused (Enter/Space ready)', await ev(p, () => document.activeElement && document.activeElement.id === 'btnPlay'));
  check(G, 'title starts in the Felt Meadow with gravity 1.0', s1.zone === 0 && Math.abs(s1.gk - 1) < 1e-9, { zone: s1.zone, gk: s1.gk });
  check(G, 'title demo is silent (no sfx in title mode)', await ev(p, () => OD.Game.mode === 'title' && !OD.Audio._musicPlaying));
  const imgs = await ev(p, () => Object.keys(OD.Assets.files).filter(k => !/^(pillows|crayon|stars)_/.test(k) && !OD.Assets.img[k]));
  check(G, 'all first-screen art loaded', imgs.length === 0, imgs);
  await p.waitForFunction(() => OD.Assets.restDone, null, { timeout: 10000 }).catch(() => {});
  const later = await ev(p, () => Object.keys(OD.Assets.files).filter(k => !OD.Assets.img[k]));
  check(G, 'deeper biome art streams in after the title', later.length === 0, later);
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
  const how = await ev(p, () => document.getElementById('scrHow').textContent);
  check(G, 'How to Play explains lanes, acorns, jump and gravity (no boss/pillow leftovers)', /lane/i.test(how) && /acorn/i.test(how) && /jump/i.test(how) && /gravity/i.test(how) && !/Fizz|pillow(?! Mountains)|shell|Pebble/i.test(how), how.slice(0, 120));
  check(G, 'Quit button hidden in the browser', await ev(p, () => document.getElementById('btnQuit').classList.contains('hidden')));
  await p.keyboard.press('Escape'); await sleep(100);
  check(G, 'Esc on title does nothing', (await ui(p)) === 'scrTitle' && (await mode(p)) === 'title');

  await p.click('#btnPlay'); await sleep(300);
  check(G, 'Play starts a game, HUD shown', (await mode(p)) === 'playing' && await ev(p, () => !document.getElementById('hud').classList.contains('hidden')) && (await ui(p)) === null);
  check(G, 'a played run has no bot', await ev(p, () => !OD.Game.bot));
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
  await ev(p, () => { OD.debug.world.score = 77; });
  await p.click('#btnRestart'); await sleep(200);
  const sr = await st(p);
  check(G, 'Restart starts a fresh run', (await mode(p)) === 'playing' && sr.score === 0 && sr.dist < 10, sr.score);
  await p.click('#btnPause'); await sleep(120);
  const musicBefore = await ev(p, () => OD.Audio._musicPlaying);
  await p.click('#btnPauseMenu'); await sleep(200);
  check(G, 'Main Menu returns to title', (await mode(p)) === 'title' && (await ui(p)) === 'scrTitle');
  check(G, 'music stops on return to title', musicBefore === true && (await ev(p, () => OD.Audio._musicPlaying)) === false, { musicBefore });

  await p.click('#btnPlay'); await sleep(300); await sandbox(p);
  await forceGameOver(p);
  check(G, 'game over screen shows ("Sleepy time")', (await ui(p)) === 'scrOver' && /Sleepy time/.test(await ev(p, () => document.querySelector('#scrOver h2').textContent)));
  check(G, 'music stopped on game over', (await ev(p, () => OD.Audio._musicPlaying)) === false);
  const stats = await ev(p, () => document.getElementById('overStats').textContent);
  check(G, 'game over stats: acorns, streak, jumps, longest jump, reached biome', /Acorns/.test(stats) && /streak/.test(stats) && /Longest jump/.test(stats) && /Reached: The Felt Meadow/.test(stats), stats);
  check(G, 'Score Card button added by extras.js', await ev(p, () => !!document.getElementById('btnScoreCard')));
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
  // Change Pictures from title has 6 slots
  await p.click('#btnCustomize'); await sleep(150);
  check(G, 'Change Pictures shows 6 slots (Otto, Acorn, 4 biomes)', await ev(p, () => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent).join('|')) === 'Otto|Acorn|Felt Meadow|Pillow Mountains|Crayon Jungle|Glow-Star Galaxy');
  await p.keyboard.press('Escape');
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
  check(G, `${kind} tap right third → back to middle`, (await lane()) === 0);
  await sleep(300); await ground(p);
  await tap(X(0.5), Y); await sleep(120);
  const jy = (await st(p)).hero.y;
  check(G, `${kind} tap middle third → jump`, jy > 0.15 && (await lane()) === 0, { y: jy });
  await sleep(900); await ground(p);
  await setLane(p, 0); await sleep(100);
  await swipe(X(0.5), Y, X(0.5) + 90, Y + 4); await sleep(350);
  check(G, `${kind} swipe right → lane +1`, (await lane()) === 1);
  await swipe(X(0.5), Y, X(0.5) - 90, Y + 4); await sleep(350);
  check(G, `${kind} swipe left → lane 0`, (await lane()) === 0);
  await ground(p);
  await swipe(X(0.5), Y, X(0.5) + 4, Y - 90); await sleep(120);
  const sy = (await st(p)).hero.y;
  check(G, `${kind} swipe up → jump`, sy > 0.15 && (await lane()) === 0, { y: sy });
  await sleep(900); await ground(p);
  const j0 = (await st(p)).stats.jumps, l0 = (await st(p)).stats.lanes;
  await swipe(X(0.5), Y - 60, X(0.5) + 4, Y + 40); await sleep(250);
  check(G, `${kind} swipe down does nothing (no roll in this game)`, (await st(p)).stats.jumps === j0 && (await st(p)).stats.lanes === l0);
  // swipe that starts in the left third must not ALSO count as a tap
  await setLane(p, 0); await sleep(100);
  await swipe(X(0.1), Y, X(0.1) + 90, Y); await sleep(350);
  check(G, `${kind} swipe starting in a tap zone is only a swipe`, (await lane()) === 1);
  // quick double swipe queues two lanes
  await setLane(p, -1); await sleep(150);
  await swipe(X(0.5), Y, X(0.5) + 80, Y); await swipe(X(0.5), Y, X(0.5) + 80, Y); await sleep(500);
  const s2 = await st(p);
  check(G, `${kind} quick double swipe right → two lanes`, s2.hero.lane === 1 && Math.abs(s2.hero.x - 1) < 0.1, { lane: s2.hero.lane, x: s2.hero.x });
  // quick double tap
  await setLane(p, 1); await sleep(150);
  await tap(X(0.12), Y); await sleep(90); await tap(X(0.12), Y); await sleep(500);
  check(G, `${kind} quick double tap left → two lanes`, (await lane()) === -1, await lane());
  // HUD buttons must not move/jump Otto
  await setLane(p, 0); await sleep(300); await ground(p);
  const before = await st(p);
  const mb = await btnCenter(p, '#btnMuteHud');
  const m0 = await ev(p, () => OD.Game.settings.muted || OD.Game.urlMute);
  await tap(mb.x, mb.y); await sleep(250);
  const after = await st(p);
  const m1 = await ev(p, () => OD.Game.settings.muted || OD.Game.urlMute);
  check(G, `${kind} tap mute HUD button toggles sound`, m0 !== m1, { m0, m1 });
  check(G, `${kind} tap mute HUD button does not move or jump Otto`, after.hero.lane === before.hero.lane && after.stats.jumps === before.stats.jumps && after.stats.lanes === before.stats.lanes, { before: before.stats, after: after.stats });
  await sleep(700);
  await tap(mb.x, mb.y); await sleep(250);   // toggle back
  const pb = await btnCenter(p, '#btnPause');
  const b2 = await st(p);
  await tap(pb.x, pb.y); await sleep(250);
  check(G, `${kind} tap pause HUD button pauses without moving Otto`, (await mode(p)) === 'paused' && (await st(p)).stats.lanes === b2.stats.lanes && (await st(p)).stats.jumps === b2.stats.jumps);
  await sleep(700);   // past the ghost-click window
  const rb = await btnCenter(p, '#btnResume');
  await tap(rb.x, rb.y); await sleep(250);
  check(G, `${kind} tap Resume resumes`, (await mode(p)) === 'playing');
  const b3 = await st(p); await sleep(300);
  check(G, `${kind} Resume tap does not leak into a lane change/jump`, (await st(p)).stats.lanes === b3.stats.lanes && (await st(p)).stats.jumps === b3.stats.jumps);
  // a long hold (> 450 ms) is not a tap
  const b4 = await st(p);
  if (kind === 'touch') {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X(0.15), y: Y, id: 4 }] }); await sleep(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await p.mouse.move(X(0.15), Y); await p.mouse.down(); await sleep(600); await p.mouse.up(); }
  await sleep(200);
  check(G, `${kind} long hold (600 ms) is not a tap`, (await st(p)).stats.lanes === b4.stats.lanes);
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
  check(G, 'lane change ≈ 0.15 s, no overshoot past the edge lane', await ev(p, () => Math.abs(OD.debug.world.hero.x - 1) < 0.01));
  for (const k of ['ArrowUp', 'KeyW', 'Space']) {
    await ground(p);
    await p.keyboard.press(k); await sleep(130);
    const y = (await st(p)).hero.y;
    check(G, `key ${k} jumps`, y > 0.15, y); await sleep(800);
  }
  for (const k of ['ArrowDown', 'KeyS', 'Enter']) {
    const s0 = await st(p); await p.keyboard.press(k); await sleep(150); const s1 = await st(p);
    check(G, `key ${k} does nothing in play`, s1.stats.jumps === s0.stats.jumps && s1.stats.lanes === s0.stats.lanes && (await mode(p)) === 'playing');
  }
  // key repeat must not spam lanes
  await setLane(p, 1); await sleep(100);
  const l0 = (await st(p)).stats.lanes;
  await p.keyboard.down('ArrowLeft'); for (let i = 0; i < 6; i++) { await sleep(40); await p.keyboard.down('ArrowLeft'); } await p.keyboard.up('ArrowLeft');
  await sleep(350);
  const s = await st(p);
  check(G, 'held arrow (auto-repeat) changes only one lane', s.hero.lane === 0 && s.stats.lanes - l0 === 1, { lane: s.hero.lane, lanes: s.stats.lanes - l0 });
  await sleep(300); await ground(p);
  const j0 = (await st(p)).stats.jumps;
  await p.keyboard.down('Space'); for (let i = 0; i < 20; i++) { await sleep(40); await p.keyboard.down('Space'); } await p.keyboard.up('Space');
  await sleep(900);
  check(G, 'held Space (auto-repeat) jumps only once', (await st(p)).stats.jumps - j0 === 1, (await st(p)).stats.jumps - j0);
  // a jump pressed shortly before landing is buffered (airtime 0.66 s at gk 1 → press at ≈ 0.56 s)
  await ground(p);
  await p.keyboard.press('Space'); await p.waitForFunction(() => OD.debug.world.hero.airT > 0.55 && !OD.debug.world.hero.onGround, null, { timeout: 2000 }).catch(() => {});
  const jb = (await st(p)).stats.jumps; await p.keyboard.press('Space'); await sleep(400);
  check(G, 'jump pressed just before landing is buffered (fires on landing)', (await st(p)).stats.jumps === jb + 1, (await st(p)).stats.jumps - jb);
  await sleep(900);
  // keys do nothing while paused
  await p.keyboard.press('Escape'); await sleep(100);
  const lp = await lane(), jp = (await st(p)).stats.jumps; await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); await sleep(200);
  check(G, 'arrow keys ignored while paused', (await lane()) === lp && (await st(p)).stats.jumps === jp && (await mode(p)) === 'paused');
  await p.keyboard.press('Escape'); await sleep(100);
  await inputChecks(G, p, 'mouse');
  // a slow drag: DESIGN §8 says a swipe is ≥ 24 px within 350 ms
  await setLane(p, 0); await sleep(150);
  const box = await canvasBox(p); const Y = box.y + box.h * 0.62, X0 = box.x + box.w * 0.5;
  await p.mouse.move(X0, Y); await p.mouse.down(); await p.mouse.move(X0 + 10, Y); await sleep(450); await p.mouse.move(X0 + 40, Y, { steps: 2 }); await p.mouse.up(); await sleep(300);
  check(G, 'slow drag (30 px after 450 ms) is not a swipe and not a tap', (await lane()) === 0, await lane());
  // right-click does nothing
  const r0 = await st(p); await p.mouse.click(box.x + box.w * 0.15, Y, { button: 'right' }); await sleep(200);
  check(G, 'right-click does not change lanes', (await st(p)).stats.lanes === r0.stats.lanes);
  // bot runs ignore player input
  await ev(p, () => OD.debug.setBot(true, 1)); const bl = (await st(p)).stats.lanes;
  await ev(p, () => { OD.Game.act(-1); OD.Game.act(-1); }); await sleep(50);
  check(G, 'player input is ignored while the bot drives', await ev(p, () => !OD.Game.playerCanAct()));
  await ev(p, () => OD.debug.setBot(false));
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
  await ev(p, () => OD.debug.world.spawn('acorn', 0, 3, { test: true }));
  await p.waitForFunction(() => OD.debug.world.acorns >= 1, null, { timeout: 4000 }).catch(() => {});
  let s1 = await st(p);
  check(G, 'acorn gives +10', s1.acorns === 1 && s1.score - s0.score === 10, { score: s1.score - s0.score, acorns: s1.acorns });
  const a1 = await events(p, 'acorn');
  check(G, 'acorn event carries points 10 + combo 1', a1.length === 1 && a1[0].points === 10 && a1[0].combo === 1, a1);
  // every acorn variant scores the same
  await clearEvents(p);
  await ev(p, () => { const w = OD.debug.world; [0, 1, 2].forEach((v, i) => w.spawn('acorn', 0, 3 + i * 1.2, { test: true, variant: v })); });
  await p.waitForFunction(() => OD.debug.world.acorns >= 4, null, { timeout: 4000 }).catch(() => {});
  check(G, 'all 3 acorn kinds worth 10', (await events(p, 'acorn')).map(e => e.points + ':' + e.variant).join(',') === '10:0,10:1,10:2', await events(p, 'acorn'));
  await ev(p, () => { OD.debug.world.combo = 0; });
  await clearEvents(p);
  await ev(p, () => { const w = OD.debug.world, grp = { n: 10, taken: 0 }; for (let i = 0; i < 10; i++) w.spawn('acorn', 0, 3 + i * 1.2, { test: true, grp }); });
  await p.waitForFunction(() => OD.debug.world.acorns >= 14, null, { timeout: 6000 }).catch(() => {});
  const combos = await events(p, 'combo');
  check(G, 'combo event at 10 acorns in a row', combos.length === 1 && combos[0].combo === 10, combos);
  check(G, 'maxCombo tracked', (await st(p)).maxCombo >= 10, (await st(p)).maxCombo);
  // combo resets when an acorn of a row you took one from gets past
  await ev(p, () => { const w = OD.debug.world, grp = { n: 2, taken: 0 }; w.spawn('acorn', 0, 2, { test: true, grp }); w.spawn('acorn', 1, 4, { test: true, grp }); });
  await sleep(1500);
  check(G, 'missing an acorn of a row you started resets the combo', (await st(p)).combo === 0, (await st(p)).combo);
  // skipping a whole row keeps the combo
  await ev(p, () => { const w = OD.debug.world; w.combo = 5; w.spawn('acorn', 1, 3, { test: true, grp: { n: 1, taken: 0 } }); });
  await sleep(1200);
  check(G, 'skipping a whole row does not reset the combo', (await st(p)).combo === 5, (await st(p)).combo);
  // jumping over a ground acorn misses it
  await ground(p);
  const ac0 = (await st(p)).acorns;
  await ev(p, () => { const w = OD.debug.world; w.spawn('acorn', 0, w.speed * 0.33, { test: true }); OD.Game.act('jump'); });
  await sleep(1000);
  check(G, 'jumping over a resting acorn misses it (|y − hero.y − 0.35| ≥ 0.6)', (await st(p)).acorns === ac0, (await st(p)).acorns - ac0);
  // ... and an acorn up in the air needs the jump
  await ground(p);
  await ev(p, () => { const w = OD.debug.world; w.spawn('acorn', 0, w.speed * 0.33, { test: true, y: 1.2 }); OD.Game.act('jump'); });
  await sleep(1000);
  check(G, 'a high (arc) acorn is collected with a jump', (await st(p)).acorns === ac0 + 1, (await st(p)).acorns - ac0);
  // bump on foam blocks
  await ground(p);
  s0 = await st(p); await clearEvents(p);
  await ev(p, () => OD.debug.world.spawn('blocks', 0, 2.5, { test: true }));
  await p.waitForFunction(() => OD.debug.world.hearts < 3, null, { timeout: 4000 }).catch(() => {});
  s1 = await st(p);
  check(G, 'bump on foam blocks costs one heart', s1.hearts === s0.hearts - 1, { h0: s0.hearts, h1: s1.hearts });
  check(G, 'bump gives invulnerability + stumble + resets combo + ouch mood', s1.hero.invuln > 0.5 && s1.hero.stumbleT > 0 && s1.combo === 0 && s1.hero.mood === 'ouch' && (await events(p, 'bump')).length === 1, s1.hero);
  await ev(p, () => OD.debug.world.spawn('tower', 0, 1.5, { test: true }));
  await sleep(500);
  check(G, 'no second heart lost while invulnerable', (await st(p)).hearts === s1.hearts);
  await sleep(1600);
  // jump over foam blocks clears them
  await ground(p);
  const h2 = (await st(p)).hearts;
  await ev(p, () => { const w = OD.debug.world; w.hero.invuln = 0; w.spawn('blocks', 0, w.speed * 0.3, { test: true }); OD.Game.act('jump'); });
  await sleep(900);
  check(G, 'jumping over foam blocks avoids the bump', (await st(p)).hearts === h2, { h2, now: (await st(p)).hearts });
  // a tower cannot be jumped
  await ground(p);
  await ev(p, () => { const w = OD.debug.world; w.hero.invuln = 0; w.hearts = 3; w.spawn('tower', 0, w.speed * 0.3, { test: true }); OD.Game.act('jump'); });
  await sleep(900);
  check(G, 'towers cannot be jumped (h 1.6 > apex)', (await st(p)).hearts === 2, (await st(p)).hearts);
  await sleep(1700);
  // a ball rolling across
  await ground(p); await clearEvents(p);
  await ev(p, () => { const w = OD.debug.world; w.hero.invuln = 0; w.spawn('ball', 0, 2.2, { test: true, vx: 0.01, vy: 0, y: 0 }); });
  await sleep(800);
  check(G, 'a low ball in Otto\'s lane bumps him', (await events(p, 'bump')).some(e => e.kind === 'ball'), (await events(p, 'bump')));
  await sleep(1700);
  await p.screenshot({ path: OUT + '/scoring_after_bump.png' });
  // biome change at the goal
  await ev(p, () => { OD.debug.world.hearts = 2; });
  await clearEvents(p);
  s0 = await st(p);
  await ev(p, () => { const w = OD.debug.world; w.levelDist = w.goal - 0.5; });
  await p.waitForFunction(() => OD.debug.world.level >= 1, null, { timeout: 4000 }).catch(() => {});
  await sleep(150);
  s1 = await st(p);
  const lu = await events(p, 'levelUp');
  check(G, 'biome changes at the goal (Felt Meadow → Pillow Mountains)', s1.level === 1 && s1.zone === 1, s1.level);
  check(G, 'biome gives a heart back (heartGain event)', s1.hearts === Math.min(s0.maxHearts, s0.hearts + 1) && (await events(p, 'heartGain')).length === 1, { h0: s0.hearts, h1: s1.hearts });
  check(G, 'biome bonus 100 × biome × round (biome 1 → +100)', lu.length === 1 && lu[0].bonus === 100 && s1.score - s0.score >= 100, lu);
  check(G, 'happy mood on a new biome', s1.hero.mood === 'happy', s1.hero.mood);
  const banner = await ev(p, () => OD.Game.renderer.banner && OD.Game.renderer.banner.s);
  check(G, 'biome banner shown', banner === 1, banner);
  await sleep(500); await p.screenshot({ path: OUT + '/scoring_biome2_banner.png' });
  // second biome: full hearts → no heart gain, bonus 200
  await clearEvents(p); s0 = await st(p);
  await ev(p, () => { const w = OD.debug.world; w.hearts = w.maxHearts; w.levelDist = w.goal - 0.5; });
  await p.waitForFunction(() => OD.debug.world.level >= 2, null, { timeout: 4000 }).catch(() => {});
  await sleep(150);
  const lu2 = await events(p, 'levelUp'); s1 = await st(p);
  check(G, 'biome 2 bonus is 200', lu2.length === 1 && lu2[0].bonus === 200, lu2);
  check(G, 'full hearts: no heart gained beyond max', s1.hearts === s1.maxHearts && (await events(p, 'heartGain')).length === 0, s1.hearts);
  // loop: biome 4 → round 2 (bonus 400, goal × 1.1)
  await ev(p, () => OD.debug.gotoLevel(3)); await sleep(200); await clearEvents(p);
  const g3 = (await st(p)).goal;
  await ev(p, () => { const w = OD.debug.world; w.levelDist = w.goal - 0.5; });
  await p.waitForFunction(() => OD.debug.world.level >= 4, null, { timeout: 4000 }).catch(() => {});
  await sleep(150);
  const lu3 = await events(p, 'levelUp'); s1 = await st(p);
  check(G, 'after biome 4 the room loops (level 4 = zone 0, round 2, bonus 400)', s1.zone === 0 && s1.loop === 1 && lu3.length === 1 && lu3[0].bonus === 400, { lu3, zone: s1.zone, loop: s1.loop });
  check(G, 'round 2 goal × 1.1 and a bit faster', Math.abs(s1.goal - g3 * 1.1) < 0.01, { g3, g: s1.goal });
  check(G, 'round 2 banner says "round 2"', await ev(p, () => OD.Game.renderer.banner && OD.Game.renderer.banner.loop === 1));
  await sleep(500); await p.screenshot({ path: OUT + '/scoring_round2_banner.png' });
  // game over at 0 hearts
  await clearEvents(p);
  await ev(p, () => { const w = OD.debug.world; w.hearts = 1; w.hero.invuln = 0; w.spawn('blocks', w.hero.lane, 2.5, { test: true }); });
  await p.waitForFunction(() => OD.debug.world.phase === 'over', null, { timeout: 5000 }).catch(() => {});
  const go = await events(p, 'gameOver');
  { const sg = await st(p); check(G, 'game over at 0 hearts', go.length === 1 && sg.hearts === 0, { go: go.length, hearts: sg.hearts, phase: sg.phase }); }
  await ev(p, () => OD.debug.move(1)); await sleep(50);
  check(G, 'no input after the last heart (dying)', await ev(p, () => !OD.Game.playerCanAct()));
  await p.waitForFunction(() => OD.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {});
  check(G, 'game over screen after the stop (≈ 1.6 s)', (await mode(p)) === 'over');
  check(G, 'game over shows "round 2" in Reached', /round 2/.test(await ev(p, () => document.getElementById('overStats').textContent)));
  check(G, 'medal for 4+ biomes = platinum', await ev(p, () => document.getElementById('medal').classList.contains('platinum')));
  const e = await allErrors(p); check(G, 'no console errors (scoring)', e.length === 0, e);
  await context.close();

  const q = await open('?mute=1&seed=7&autostart=1&diff=easy');
  const se = await st(q.page);
  check(G, 'Easy has 5 hearts and starts slow (run-up 45 %)', se.hearts === 5 && se.maxHearts === 5 && se.speed < 5.5, { hearts: se.hearts, speed: se.speed });
  await q.context.close();
  const r = await open('?mute=1&seed=7');
  await r.page.click('#btnSettings'); await r.page.click('#setDifficulty [data-v=hard]'); await r.page.click('#scrSettings .btn-back');
  await r.page.click('#btnPlay'); await sleep(200);
  check(G, 'difficulty chosen in Settings is used (Hard)', (await st(r.page)).difficulty === 'hard');
  await r.context.close();
  // natural biome change with the speed flag
  const n = await open('?mute=1&seed=7&autostart=1&diff=normal&bot=1&skill=1&speed=12');
  await spyEvents(n.page);
  await n.page.waitForFunction(() => OD.debug.world.level >= 1, null, { timeout: 30000 }).catch(() => {});
  const ln = await events(n.page, 'levelUp');
  check(G, 'biome reached by running to the goal (bot, speed 12)', ln.length >= 1 && ln[0].bonus === 100, ln);
  await n.context.close();
};

groups.gravity = async () => {
  const G = 'gravity';
  // jump apex / airtime measured in the browser, per biome (?level=N snaps the gravity)
  for (let z = 0; z < 4; z++) {
    const T = GRAV[z];
    const { page: p, context } = await open(`?mute=1&seed=7&autostart=1&diff=normal&level=${z}`);
    await spyEvents(p); await sandbox(p); await sleep(400);
    const s = await st(p);
    check(G, `biome ${z + 1} (${T.name}): gk = ${T.gk}, g = 19·gk, jumpV = 6.2·gk^0.35`, Math.abs(s.gk - T.gk) < 1e-9 && Math.abs(s.g - 19 * T.gk) < 1e-6 && Math.abs(s.jumpV - 6.2 * Math.pow(T.gk, 0.35)) < 1e-6, { gk: s.gk, g: s.g, jumpV: s.jumpV });
    const meas = [];
    for (let i = 0; i < 3; i++) {
      await ground(p); await clearEvents(p);
      await p.keyboard.press('Space');
      await p.waitForFunction(() => window._ev.some(e => e.type === 'land'), null, { timeout: 4000 }).catch(() => {});
      const l = (await events(p, 'land'))[0]; if (l) meas.push([l.apexY, l.airT]);
      await sleep(150);
    }
    const apex = meas.reduce((a, m) => a + m[0], 0) / Math.max(1, meas.length), air = meas.reduce((a, m) => a + m[1], 0) / Math.max(1, meas.length);
    console.log(`   biome ${z + 1}: apex ${apex.toFixed(3)} u, airtime ${air.toFixed(3)} s (target ${T.apex} / ${T.air})`);
    check(G, `biome ${z + 1}: measured apex ${apex.toFixed(2)} u ≈ ${T.apex} (±0.04)`, meas.length === 3 && Math.abs(apex - T.apex) < 0.04, meas);
    check(G, `biome ${z + 1}: measured airtime ${air.toFixed(2)} s ≈ ${T.air} (±0.03)`, meas.length === 3 && Math.abs(air - T.air) < 0.03, meas);
    check(G, `biome ${z + 1}: apex clears the foam blocks (0.42 u) by > 0.5 u`, apex > 0.92, apex);
    check(G, `biome ${z + 1}: weather gravity set to ${T.gk}`, await ev(p, () => OD.debug.weather.gk) === T.gk, await ev(p, () => OD.debug.weather.gk));
    check(G, `biome ${z + 1}: renderer, banner and music on this biome`, await ev(p, z => OD.Game.renderer.vis.cur === z && OD.Audio.zone === z, z));
    // Otto's head at the apex stays on screen and below the HUD pills
    const top = await ev(p, a => { const R = OD.Game.renderer, pr = R.proj(0, a, 0, 0); return { top: pr.sy - 0.95 * pr.u * 120 / 128, hud: R.ins.top + (R.portrait ? 10 : 52), VH: R.VH }; }, apex);   // centre lane: only the centred biome pill (landscape) sits above Otto
    check(G, `biome ${z + 1}: Otto at the apex stays on screen (top ${Math.round(top.top)} px)`, top.top > 0 ? (top.top > top.hud ? true : 'warn') : false, top);
    // a ball bounces under the same gravity: steady hop ≈ ballV² / 2g
    await ev(p, () => { const w = OD.debug.world; w.hero.invuln = 99; window._by = 0; window._bb = 0; const o = w.spawn('ball', -1, 25, { test: true, vx: 0.0001 }); o.bounces = 3; window._ball = o; });
    await p.evaluate(() => new Promise(res => { let n = 0; const f = () => { const o = window._ball; if (o.vy > 0 && o.y < 0.05) window._bb++; if (window._bb >= 2) window._by = Math.max(window._by, o.y); if (++n < 140) requestAnimationFrame(f); else res(); }; f(); }));
    const hop = await ev(p, () => window._by), exp = 3.4 * 3.4 / (2 * 19 * T.gk);
    check(G, `biome ${z + 1}: ball steady hop ≈ ballV²/2g = ${exp.toFixed(2)} u`, Math.abs(hop - exp) < 0.12 ? true : 'warn', { hop, exp });
    await p.screenshot({ path: OUT + `/gravity_biome${z + 1}.png` });
    const e = await allErrors(p); check(G, `biome ${z + 1}: no console errors`, e.length === 0, e);
    await context.close();
  }
  // gk eases over ≈ 1.2 s after a natural biome change, never a jolt; a jump in flight keeps its take-off gravity
  const { page: p, context } = await open('?mute=1&seed=7&autostart=1&diff=normal');
  await spyEvents(p); await sandbox(p); await sleep(400); await ground(p);
  await ev(p, () => {
    window._gk = []; const w0 = OD.debug.world;
    const f = () => { const w = OD.debug.world; if (w !== w0) return; window._gk.push([w.time, w.gk, w.zone, w.hero.onGround ? 0 : w.hero.jg, w.g]); if (window._gk.length < 600) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    w0.levelDist = w0.goal - 0.3;
  });
  await p.waitForFunction(() => OD.debug.world.level >= 1, null, { timeout: 3000 }).catch(() => {});
  await ev(p, () => OD.Game.act('jump'));   // jump right at the start of the ease
  await sleep(2200);
  const gev = await events(p, 'gravity');
  check(G, 'levelUp fires a gravity event 1.0 → 0.7', gev.length === 1 && gev[0].from === 1 && gev[0].to === 0.7, gev);
  const rec = await ev(p, () => window._gk);
  const tL = (gev[0] || {}).t || 0;
  const at = dt => { let best = null; for (const r of rec) if (r[0] >= tL + dt) { best = r; break; } return best; };
  const r1 = at(0.05), rMid = at(0.6), rEnd = at(1.3);
  check(G, 'gk eases: still ≈ 1.0 at +0.05 s (no jolt)', r1 && Math.abs(r1[1] - 1) < 0.02, r1);
  check(G, 'gk eases: ≈ halfway (0.85) at +0.6 s', rMid && Math.abs(rMid[1] - 0.85) < 0.03, rMid);
  check(G, 'gk eased to 0.7 by +1.3 s', rEnd && Math.abs(rEnd[1] - 0.7) < 1e-6, rEnd);
  let mono = true, maxStep = 0; for (let i = 1; i < rec.length; i++) { if (rec[i][1] > rec[i - 1][1] + 1e-9) mono = false; const dt = rec[i][0] - rec[i - 1][0]; if (dt > 0) maxStep = Math.max(maxStep, Math.abs(rec[i][1] - rec[i - 1][1]) / dt); }
  check(G, 'gk ease is monotonic with a peak rate ≤ 1.5·Δgk/1.2 s (smoothstep)', mono && maxStep <= 1.5 * 0.3 / 1.2 + 0.02, { mono, maxStep });
  const jgs = [...new Set(rec.filter(r => r[3] && r[0] > tL).map(r => r[3].toFixed(4)))];
  const gs = [...new Set(rec.filter(r => r[3] && r[0] > tL).map(r => r[4].toFixed(3)))];
  check(G, 'a jump taken during the ease keeps one take-off gravity while world.g changes', jgs.length === 1 && gs.length > 3, { jgs, gs: gs.length });
  check(G, 'gravity label message shown in the HUD', await ev(p, () => OD.Game.renderer.gravPulse >= 0) && rec.length > 50);
  await ev(p, () => { window._wfk = []; });
  check(G, 'weather fall speed eases toward gk^0.75', Math.abs(await ev(p, () => OD.debug.weather.fk) - Math.pow(0.7, 0.75)) < 0.08, await ev(p, () => OD.debug.weather.fk));
  // gotoLevel snaps
  await clearEvents(p);
  await ev(p, () => OD.debug.gotoLevel(3)); await sleep(100);
  const g2 = await events(p, 'gravity');
  check(G, 'gotoLevel(3) snaps gk to 0.5 and fires gravity', (await st(p)).gk === 0.5 && g2.length === 1 && g2[0].to === 0.5, g2);
  // a high moon bounce: Otto can run under a ball (real vertical overlap)
  await ground(p);
  await ev(p, () => { const w = OD.debug.world; w.hero.invuln = 0; w.hearts = 3; const o = w.spawn('ball', 0, 1.6, { test: true, vx: 0.0001, y: 1.0, vy: 0.5 }); });
  await sleep(800);
  check(G, 'a ball bouncing above Otto (bottom > heroH) passes over him', (await st(p)).hearts === 3, (await st(p)).hearts);
  const e = await allErrors(p); check(G, 'no console errors (gravity ease)', e.length === 0, e);
  await context.close();
  // natural progression with the bot: the gravity sequence 1 → 0.7 → 1.25 → 0.5 → 1 (round 2)
  const n = await open('?mute=1&seed=3&autostart=1&diff=easy&bot=1&skill=1&speed=16');
  await spyEvents(n.page);
  await n.page.waitForFunction(() => OD.debug.world.level >= 4 || OD.debug.mode === 'over', null, { timeout: 60000 }).catch(() => {});
  await sleep(300);
  const seq = (await events(n.page, 'gravity')).map(g => g.to);
  const ns = await st(n.page);
  check(G, 'bot run at ×16 reaches round 2 with the gravity sequence 0.7 → 1.25 → 0.5 → 1', seq.slice(0, 4).join(',') === '0.7,1.25,0.5,1', { seq, level: ns.level, mode: await mode(n.page) });
  check(G, 'longest airtime ≈ moon jump (stats.maxAir ≈ 1.06 s, maxApex ≈ 1.25 u)', Math.abs(ns.stats.maxAir - 1.06) < 0.05 && Math.abs(ns.stats.maxApex - 1.25) < 0.05, { maxAir: ns.stats.maxAir, maxApex: ns.stats.maxApex });
  const en = await allErrors(n.page); check(G, 'no console errors (×16 gravity run)', en.length === 0, en);
  await n.context.close();
};

groups.best = async () => {
  const G = 'best';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?mute=1&seed=7&autostart=1&diff=normal', {}, context);
  await sandbox(p); await sleep(200);
  await ev(p, () => { OD.debug.world.score = 1234; });
  await forceGameOver(p);
  const nb = await ev(p, () => ({ hidden: document.getElementById('newBest').classList.contains('hidden'), best: document.getElementById('overBest').textContent, score: document.getElementById('overScore').textContent }));
  check(G, 'NEW! badge on a new best', !nb.hidden && nb.best === '1234', nb);
  await p.screenshot({ path: OUT + '/best_new.png' });
  await p.reload(); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'playing');
  const stored = await ev(p, () => localStorage.getItem('otr:best_normal'));
  check(G, 'best score persists across reload (otr:best_normal)', stored === '1234', stored);
  check(G, 'no keys of other games / un-prefixed keys written', await ev(p, () => Object.keys(localStorage).every(k => k.startsWith('otr:'))), await ev(p, () => Object.keys(localStorage)));
  await sandbox(p); await sleep(200);
  await ev(p, () => { OD.debug.world.score = 500; });
  await forceGameOver(p);
  const nb2 = await ev(p, () => ({ hidden: document.getElementById('newBest').classList.contains('hidden'), best: document.getElementById('overBest').textContent }));
  check(G, 'no NEW! badge when below best; best still shown', nb2.hidden && nb2.best === '1234', nb2);
  const p2 = await context.newPage(); p2.errs = [];
  await p2.goto(GAME + '?mute=1&seed=7&diff=easy'); await p2.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, 'best is per difficulty (Easy best still 0 on title)', (await ev(p2, () => document.getElementById('bestTitle').textContent)) === '0');
  await p2.goto(GAME + '?mute=1&seed=7&diff=normal'); await p2.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, 'title shows Normal best 1234', (await ev(p2, () => document.getElementById('bestTitle').textContent)) === '1234');
  // a run started on Normal, difficulty changed in pause → still saved as Normal
  await p2.goto(GAME + '?mute=1&seed=7&autostart=1'); await p2.waitForFunction(() => OD.debug && OD.debug.mode === 'playing');
  await sandbox(p2);
  const d0 = await ev(p2, () => OD.Game.runDifficulty);
  await ev(p2, () => { OD.Game.pause(); OD.Game.setSetting('difficulty', OD.Game.runDifficulty === 'hard' ? 'easy' : 'hard'); OD.Game.resume(); OD.debug.world.score = 4321; });
  await forceGameOver(p2);
  check(G, 'best is saved for the difficulty the run was played on', (await ev(p2, d => localStorage.getItem('otr:best_' + d), d0)) === '4321', d0);
  // score 0 → never "NEW!"
  await p2.goto(GAME + '?mute=1&seed=7&diff=hard&autostart=1'); await p2.waitForFunction(() => OD.debug && OD.debug.mode === 'playing');
  await sandbox(p2); await ev(p2, () => { OD.debug.world.score = 0; }); await forceGameOver(p2);
  check(G, 'score 0 is never a NEW! best', await ev(p2, () => document.getElementById('newBest').classList.contains('hidden')));
  // reset best needs two taps
  await p2.goto(GAME + '?mute=1&seed=7&diff=normal'); await p2.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  await p2.click('#btnSettings'); await p2.click('#btnResetBest'); await sleep(100);
  const after1 = await ev(p2, () => localStorage.getItem('otr:best_normal'));
  const armed = await ev(p2, () => document.getElementById('btnResetBest').textContent);
  await p2.click('#btnResetBest'); await sleep(100);
  const after2 = await ev(p2, () => localStorage.getItem('otr:best_normal'));
  check(G, 'Reset best needs two taps ("Sure?")', after1 === '1234' && armed === 'Sure?' && after2 === null, { after1, armed, after2 });
  check(G, 'Reset clears every difficulty', await ev(p2, () => ['easy', 'normal', 'hard'].every(d => localStorage.getItem('otr:best_' + d) === null)));
  await p2.click('#btnResetBest'); await sleep(3200);
  check(G, 'Reset un-arms itself after 3 s', (await ev(p2, () => document.getElementById('btnResetBest').textContent)) === 'Reset');
  await p2.click('#scrSettings .btn-back'); await sleep(150);
  check(G, 'title best updates to 0 after reset', (await ev(p2, () => document.getElementById('bestTitle').textContent)) === '0');
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
  check(G, 'visibilitychange (hidden) pauses + suspends audio', (await mode(p)) === 'paused' && await ev(p, () => OD.Audio._hidden === true));
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(100);
  check(G, 'visible again: stays paused until the player resumes', (await mode(p)) === 'paused' && await ev(p, () => OD.Audio._hidden === false));
  await p.keyboard.press('Escape'); await sleep(100);
  // blur on the title / in menus never "pauses" anything
  // death frame: blur right after the last heart is lost
  await ev(p, () => {
    window._modes = [];
    const w = OD.debug.world; w.hearts = 1; w.hero.invuln = 0; w.spawn('tower', w.hero.lane, 0.4, { test: true });
    const iv = setInterval(() => { window._modes.push(OD.debug.mode); if (OD.debug.world.phase === 'over' && !window._blurred) { window._blurred = true; window.dispatchEvent(new Event('blur')); } if (OD.debug.mode === 'over') clearInterval(iv); }, 10);
  });
  await p.waitForFunction(() => OD.debug.mode === 'over', null, { timeout: 6000 }).catch(() => {});
  const modes = await ev(p, () => window._modes);
  check(G, 'no pause on the death frame (blur while dying)', !modes.includes('paused') && (await mode(p)) === 'over', [...new Set(modes)]);
  // 0.7 s restart lock
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnAgain', null, { timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Enter'); await sleep(60); }
  check(G, 'Enter spam within 0.7 s does not restart', (await mode(p)) === 'over');
  await ev(p, () => document.getElementById('btnAgain').click());
  check(G, 'Play Again click within 0.7 s is ignored', (await mode(p)) === 'over');
  await sleep(700);
  await ev(p, () => { window._starts = 0; const o = OD.Game.startGame.bind(OD.Game); OD.Game.startGame = function () { window._starts++; return o(); }; });
  await p.keyboard.press('Enter'); await sleep(300);
  check(G, 'Enter after 0.7 s restarts exactly once (no double trigger via the focused button)', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1, await ev(p, () => window._starts));
  await sandbox(p); await forceGameOver(p); await sleep(800);
  await ev(p, () => { window._starts = 0; });
  await p.keyboard.press('Space'); await sleep(300);
  check(G, 'Space on game over (Play Again focused) restarts exactly once', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1, await ev(p, () => window._starts));
  check(G, 'the Space that restarted did not also jump', (await st(p)).stats.jumps === 0, (await st(p)).stats.jumps);
  // Space on game over with Menu focused → Menu, not restart
  await sandbox(p); await forceGameOver(p); await sleep(800);
  await ev(p, () => { window._starts = 0; document.getElementById('btnOverMenu').focus(); });
  await p.keyboard.press('Space'); await sleep(300);
  check(G, 'Space with Menu focused on game over goes to the menu (no restart)', (await mode(p)) === 'title' && (await ev(p, () => window._starts)) === 0, { mode: await mode(p), starts: await ev(p, () => window._starts) });
  check(G, 'music off on title after game over', (await ev(p, () => OD.Audio._musicPlaying)) === false);
  // the title demo restarts its world after a biome / death
  const w0 = await ev(p, () => { window._tw = OD.debug.world; const w = OD.debug.world; w.levelDist = w.goal - 0.2; return 1; });
  await sleep(500);
  check(G, 'title demo restarts in the Felt Meadow after reaching biome 2', await ev(p, () => OD.debug.world !== window._tw && OD.debug.world.zone === 0));
  // autorestart flag
  const a = await open('?mute=1&seed=7&autostart=1&autorestart=1&diff=normal');
  await sandbox(a.page); await forceGameOver(a.page);
  await a.page.waitForFunction(() => OD.debug.mode === 'playing', null, { timeout: 3000 }).catch(() => {});
  check(G, 'autorestart starts a new game after game over', (await mode(a.page)) === 'playing' && (await ev(a.page, () => OD.debug.stats.games)) === 1);
  await a.context.close();
  const e = await allErrors(p); check(G, 'no console errors (lifecycle)', e.length === 0, e);
  await context.close();
};

groups.focus = async () => {
  const G = 'focus';
  const { page: p, context } = await open('?mute=1&seed=7');
  await ev(p, () => { window._starts = 0; const o = OD.Game.startGame.bind(OD.Game); OD.Game.startGame = function () { window._starts++; return o(); }; });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnPlay');
  await p.keyboard.press('Space'); await sleep(300);
  const s = await st(p);
  check(G, 'Space on focused Play starts once, no jump', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1 && s.stats.jumps === 0, { starts: await ev(p, () => window._starts), jumps: s.stats.jumps });
  await sandbox(p);
  check(G, 'focus left the buttons during play', await ev(p, () => !document.activeElement || document.activeElement === document.body || document.activeElement.tagName !== 'BUTTON'), await ev(p, () => document.activeElement && document.activeElement.id));
  const m0 = await ev(p, () => !!(OD.Game.settings.muted || OD.Game.urlMute));
  await p.click('#btnMuteHud'); await sleep(150);
  const m1 = await ev(p, () => !!(OD.Game.settings.muted || OD.Game.urlMute));
  await ground(p);
  const j0 = (await st(p)).stats.jumps;
  await p.keyboard.press('Space'); await sleep(200);
  const m2 = await ev(p, () => !!(OD.Game.settings.muted || OD.Game.urlMute));
  check(G, 'after clicking the HUD mute button, Space jumps and does not re-press the button', m0 !== m1 && m2 === m1 && (await st(p)).stats.jumps === j0 + 1, { m0, m1, m2, jumps: (await st(p)).stats.jumps - j0 });
  await sleep(700);
  await p.keyboard.press('Enter'); await sleep(200);
  check(G, 'Enter after clicking the HUD mute button does not toggle mute / pause', (await ev(p, () => !!(OD.Game.settings.muted || OD.Game.urlMute))) === m1 && (await mode(p)) === 'playing');
  // arrow keys after a HUD click still steer
  await setLane(p, 0); await p.keyboard.press('ArrowLeft'); await sleep(250);
  check(G, 'arrow keys steer after a HUD click', (await st(p)).hero.lane === -1);
  await p.click('#btnPause'); await sleep(200);
  const j1 = (await st(p)).stats.jumps;
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnResume', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Space'); await sleep(250);
  check(G, 'Space on focused Resume resumes without a jump', (await mode(p)) === 'playing' && (await st(p)).stats.jumps === j1, { mode: await mode(p), jumps: (await st(p)).stats.jumps - j1 });
  await p.keyboard.press('Escape'); await sleep(150);
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnResume', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Enter'); await sleep(250);
  check(G, 'Enter on focused Resume resumes without a jump', (await mode(p)) === 'playing' && (await st(p)).stats.jumps === j1);
  // Space on focused Restart (pause menu) → restarts once
  await p.keyboard.press('Escape'); await sleep(150);
  await ev(p, () => { window._starts = 0; document.getElementById('btnRestart').focus(); });
  await p.keyboard.press('Space'); await sleep(250);
  check(G, 'Space on focused Restart restarts once, no jump', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1 && (await st(p)).stats.jumps === 0, { starts: await ev(p, () => window._starts) });
  await sandbox(p);
  await p.click('#btnPause'); await p.click('#btnPauseMenu'); await sleep(200);
  await ev(p, () => { window._starts = 0; document.getElementById('btnSettings').focus(); });
  await p.keyboard.press('Space'); await sleep(250);
  check(G, 'Space on a focused Settings button opens Settings (not the game)', (await ui(p)) === 'scrSettings' && (await ev(p, () => window._starts)) === 0, { ui: await ui(p), starts: await ev(p, () => window._starts) });
  await ev(p, () => document.querySelector('#setDifficulty [data-v=normal]').focus());
  await p.keyboard.press('Space'); await sleep(200);
  check(G, 'Space on a focused difficulty button selects it', (await ui(p)) === 'scrSettings' && (await ev(p, () => OD.Game.settings.difficulty)) === 'normal');
  await ev(p, () => document.getElementById('setSfx').focus());
  await p.keyboard.press('Space'); await sleep(200);
  check(G, 'Space on the focused Sound toggle flips it (stays in Settings)', (await ui(p)) === 'scrSettings' && (await ev(p, () => OD.Game.settings.sfx)) === false);
  await p.keyboard.press('Space'); await sleep(100);
  await p.keyboard.press('Escape'); await sleep(150);
  await ev(p, () => { window._starts = 0; });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'btnPlay', null, { timeout: 1000 }).catch(() => {});
  await p.keyboard.press('Enter'); await sleep(250);
  check(G, 'Enter on title starts once', (await mode(p)) === 'playing' && (await ev(p, () => window._starts)) === 1);
  // Score Card modal on the game over screen: keys inside it must not restart the game underneath
  await sandbox(p); await forceGameOver(p); await sleep(800);
  await p.click('#btnScoreCard');
  await p.waitForFunction(() => { const m = document.getElementById('scScreen'); return m && !m.classList.contains('hidden'); }, null, { timeout: 8000 }).catch(() => {});
  await sleep(150);
  const foc = await ev(p, () => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  await ev(p, () => { window._starts = 0; });
  await p.keyboard.press('Enter'); await sleep(300);
  const sc = await ev(p, () => ({ mode: OD.debug.mode, starts: window._starts, modal: !document.getElementById('scScreen').classList.contains('hidden') }));
  check(G, `Enter on the focused Score Card button (${foc}) does not restart the game under the modal`, sc.starts === 0 && sc.mode === 'over', { foc, ...sc });
  if (sc.mode === 'playing') { await ev(p, () => document.getElementById('scClose').click()); await sandbox(p); await forceGameOver(p); await sleep(800); await p.click('#btnScoreCard'); await sleep(800); }
  await ev(p, () => { window._starts = 0; document.getElementById('scSave').focus(); });
  await p.keyboard.press('Space'); await sleep(300);
  const sc2 = await ev(p, () => ({ mode: OD.debug.mode, starts: window._starts, modal: !document.getElementById('scScreen').classList.contains('hidden') }));
  check(G, 'Space on the focused "Save picture" link does not restart the game under the modal', sc2.starts === 0, sc2);
  if (sc2.mode === 'playing') { await ev(p, () => document.getElementById('scClose').click()); await sandbox(p); await forceGameOver(p); await sleep(800); await p.click('#btnScoreCard'); await sleep(800); }
  await p.keyboard.press('Escape'); await sleep(200);
  check(G, 'Esc closes the Score Card and focus returns to its button', await ev(p, () => document.getElementById('scScreen').classList.contains('hidden') && OD.debug.mode === 'over'));
  const e = await allErrors(p); check(G, 'no console errors (focus)', e.length === 0, e);
  await context.close();
};

groups.settings = async () => {
  const G = 'settings';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?seed=7', {}, context);
  await p.click('#btnSettings'); await sleep(150);
  check(G, 'Full screen toggle exists', await ev(p, () => !!document.getElementById('setFull') && !document.getElementById('rowFull').classList.contains('hidden')));
  check(G, 'defaults: sfx on, music on, Easy, volume 100 %', await ev(p, () => document.getElementById('setSfx').checked && document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'easy' && document.getElementById('setVolume').value === '100'));
  await p.click('#setSfx + .tog'); await p.click('#setMusic + .tog'); await p.click('#setDifficulty [data-v=hard]');
  await p.click('.vol-step[data-d="-1"]'); await p.click('.vol-step[data-d="-1"]');
  await sleep(100);
  const saved = await ev(p, () => JSON.parse(localStorage.getItem('otr:settings') || '{}'));
  check(G, 'settings saved under otr:settings', saved.sfx === false && saved.music === false && saved.difficulty === 'hard', saved);
  check(G, 'volume saved under otr:volume (0.80)', (await ev(p, () => localStorage.getItem('otr:volume'))) === '0.80', await ev(p, () => localStorage.getItem('otr:volume')));
  check(G, 'audio options applied', await ev(p, () => OD.Audio.sfxOn === false && OD.Audio.musicOn === false));
  await p.click('#setFull + .tog').catch(() => {}); await sleep(300);
  await p.reload(); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  await p.click('#btnSettings'); await sleep(150);
  check(G, 'settings persist across reload', await ev(p, () => !document.getElementById('setSfx').checked && !document.getElementById('setMusic').checked && document.querySelector('#setDifficulty .on').dataset.v === 'hard' && document.getElementById('setVolume').value === '80'));
  check(G, 'full screen is not persisted as a setting', await ev(p, () => !('fullscreen' in JSON.parse(localStorage.getItem('otr:settings') || '{}'))));
  await p.screenshot({ path: OUT + '/settings.png' });
  // corrupt saved settings → defaults, no crash
  await ev(p, () => { localStorage.setItem('otr:settings', '{bad json'); localStorage.setItem('otr:best_easy', 'abc'); });
  await p.reload(); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title').catch(() => {});
  check(G, 'corrupt otr:settings / best → defaults, game still boots', (await mode(p)) === 'title' && (await ev(p, () => OD.Game.settings.difficulty)) === 'easy' && (await ev(p, () => document.getElementById('bestTitle').textContent)) === '0');
  await ev(p, () => { localStorage.setItem('otr:settings', JSON.stringify({ difficulty: 'insane' })); });
  await p.reload(); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, 'unknown saved difficulty falls back to Easy', (await ev(p, () => OD.Game.settings.difficulty)) === 'easy');
  // ?mute=1 never saved
  await ev(p, () => localStorage.clear());
  await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, '?mute=1 mutes audio', await ev(p, () => OD.Audio.muted === true));
  await p.click('#btnSettings'); await p.click('#setSfx + .tog'); await sleep(100);
  const s2 = await ev(p, () => JSON.parse(localStorage.getItem('otr:settings') || '{}'));
  check(G, '?mute=1 is not written into saved settings', s2.muted !== true, s2);
  await p.keyboard.press('Escape');
  await p.keyboard.press('KeyM'); await sleep(100);
  const s3 = await ev(p, () => JSON.parse(localStorage.getItem('otr:settings') || '{}'));
  check(G, 'M with ?mute=1 un-mutes for this session only (nothing saved as muted)', s3.muted !== true && await ev(p, () => OD.Audio.muted === false), s3);
  await p.goto(GAME + '?seed=7'); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, 'next normal load is not muted', await ev(p, () => OD.Audio.muted === false));
  await p.keyboard.press('KeyM'); await sleep(100);
  check(G, 'M mute is saved (user choice)', await ev(p, () => JSON.parse(localStorage.getItem('otr:settings')).muted === true));
  check(G, 'HUD mute icon shows muted state', await ev(p, () => /M16 9l5 6/.test(document.getElementById('btnMuteHud').innerHTML)));
  await p.keyboard.press('KeyM');
  // ?diff=... is a test flag
  await p.goto(GAME + '?mute=1&seed=7&diff=normal'); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  await p.click('#btnSettings'); await p.click('#setDifficulty [data-v=easy]'); await sleep(100);
  const hl = await ev(p, () => document.querySelector('#setDifficulty .on').dataset.v);
  check(G, 'with ?diff= flag, clicking a difficulty highlights it', hl === 'easy' ? true : 'warn', 'highlight stays on the URL difficulty "' + hl + '" (test flag only)');
  check(G, '?diff= flag is never saved', (await ev(p, () => JSON.parse(localStorage.getItem('otr:settings') || '{}').difficulty)) === 'easy');
  // music toggled on while paused restarts the loop
  await p.goto(GAME + '?seed=7&autostart=1'); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'playing');
  await ev(p, () => OD.Game.pause()); await p.click('#btnPauseSettings'); await sleep(100);
  await p.click('#setMusic + .tog'); await sleep(50); await p.click('#setMusic + .tog'); await sleep(100);
  check(G, 'Music off → on while paused keeps the music loop', await ev(p, () => OD.Audio._musicPlaying && OD.Audio.musicOn));
  const e = await allErrors(p); check(G, 'no console errors (settings)', e.length === 0, e);
  await context.close();
};

// OD.Storage rollback (browser localStorage + the Windows app's native store contract)
groups.storage = async () => {
  const G = 'storage';
  const { page: p, context } = await open('?mute=1&seed=7');
  // localStorage throws (quota): value not kept in memory either
  const r1 = await ev(p, async () => {
    const S = OD.Storage, o = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    S.cache.k1 = 'old';
    const ok = await S.set('k1', 'new');
    Storage.prototype.setItem = o;
    return { ok, v: S.get('k1') };
  });
  check(G, 'localStorage quota error → set() resolves false and rolls back to the old value', r1.ok === false && r1.v === 'old', r1);
  // native store contract (ffStoreSet / ffStoreDel promises like WebView2 bindings)
  const r2 = await ev(p, async () => {
    const S = OD.Storage, wait = ms => new Promise(r => setTimeout(r, ms));
    S.native = true; S.cache = { a: '0', b: '0', c: '0', d: '0' }; S._seq = {};
    const plan = {};   // key|value → [delay, result]
    window.ffStoreSet = (k, v) => new Promise(res => { const [d, r] = plan[k + '|' + v] || [0, true]; setTimeout(() => res(r), d); });
    window.ffStoreDel = k => Promise.resolve(false);
    const out = {};
    plan['a|1'] = [5, false]; out.a = [await S.set('a', '1'), S.get('a')];                                     // plain failure
    plan['b|1'] = [60, false]; plan['b|2'] = [5, true]; const pb1 = S.set('b', '1'), pb2 = S.set('b', '2');   // old fails after new succeeded
    await Promise.all([pb1, pb2]); out.b = S.get('b');
    plan['c|1'] = [60, false]; plan['c|2'] = [5, false]; await Promise.all([S.set('c', '1'), S.set('c', '2')]); out.c = S.get('c');   // both fail, out of order
    plan['d|1'] = [5, true]; await S.set('d', '1'); out.dOk = S.get('d');
    window.ffStoreSet = () => Promise.reject(new Error('host gone')); out.e = [await S.set('d', '9'), S.get('d')];
    out.del = [await S.del('d'), S.get('d')];
    S.native = false; delete window.ffStoreSet; delete window.ffStoreDel;
    return out;
  });
  check(G, 'native: a failed write rolls back (value never shown as saved)', r2.a[0] === false && r2.a[1] === '0', r2.a);
  check(G, 'native: an older write failing late does not wipe a newer successful one', r2.b === '2', r2.b);
  check(G, 'native: two failed writes finishing out of order end on the last SAVED value', r2.c === '0' ? true : 'warn', { cache: r2.c, expected: '0' });
  check(G, 'native: a rejected binding (host gone) rolls back', r2.e[0] === false && r2.e[1] === '1', r2.e);
  check(G, 'native: a failed delete keeps the value in memory (matches disk after restart)', r2.del[0] === false && r2.del[1] === '1' ? true : 'warn', { del: r2.del });
  // native store boots from ffStoreAll and is used by settings/best
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.addInitScript(() => {
    const disk = { settings: JSON.stringify({ difficulty: 'hard', sfx: false }), best_hard: '777' };
    window.__disk = disk;
    window.ffStoreAll = () => Promise.resolve(Object.assign({}, disk));
    window.ffStoreSet = (k, v) => { disk[k] = v; return Promise.resolve(true); };
    window.ffStoreDel = k => { delete disk[k]; return Promise.resolve(true); };
  });
  const q = await open('?mute=1&seed=7', {}, ctx2);
  check(G, 'app mode: settings + best loaded from the native store', (await ev(q.page, () => OD.Game.settings.difficulty)) === 'hard' && (await ev(q.page, () => document.getElementById('bestTitle').textContent)) === '777');
  check(G, 'app mode: Quit button shown, nothing written to localStorage', await ev(q.page, () => !document.getElementById('btnQuit').classList.contains('hidden') && Object.keys(localStorage).length === 0));
  await ev(q.page, () => OD.Game.setSetting('music', false)); await sleep(50);
  check(G, 'app mode: settings written through ffStoreSet (key without prefix)', await ev(q.page, () => JSON.parse(window.__disk.settings).music === false));
  await q.page.click('#btnSettings'); await sleep(100); await q.page.click('.vol-step[data-d="-1"]'); await sleep(50);
  check(G, 'app mode: extras volume goes to the native store too', await ev(q.page, () => window.__disk.volume === '0.90'), await ev(q.page, () => window.__disk));
  await ctx2.close();
  // ffStoreAll throws → falls back to localStorage
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx3.addInitScript(() => { window.ffStoreAll = () => Promise.reject(new Error('x')); window.ffStoreSet = () => Promise.resolve(true); });
  const r = await open('?mute=1&seed=7', {}, ctx3);
  check(G, 'native store failure at boot → localStorage fallback, still boots', (await mode(r.page)) === 'title' && (await ev(r.page, () => OD.Storage.native)) === false);
  await ctx3.close();
  const e = await allErrors(p); check(G, 'no console errors (storage)', e.length === 0, e);
  await context.close();
};

groups.pictures = async () => {
  const G = 'pictures';
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: p } = await open('?mute=1&seed=7', {}, context);
  const img = await makeImages(p);
  const F = (name, mimeType, b64) => ({ name, mimeType, buffer: Buffer.from(b64, 'base64') });
  await p.click('#btnCustomize'); await sleep(200);
  check(G, '6 picture slots', (await ev(p, () => document.querySelectorAll('#slotGrid .slot').length)) === 6);
  // 1 photo → Otto (via the chooser)
  await pickFile(p, 1, F('red.png', 'image/png', img.photoRed));
  let t = await waitToast(p, /saved/i);
  check(G, 'PNG photo for Otto saved', /saved/i.test(t), t);
  let info = await ev(p, () => ({ has: OD.Assets.hasCustom('hero'), shape: localStorage.getItem('otr:shape_hero'), tag: document.querySelector('#slotGrid .slot:nth-child(1) .tag').textContent }));
  check(G, 'photo becomes a Round sticker by default, card says "Your picture"', info.has && info.shape === 'circle' && /Your picture/.test(info.tag), info);
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=fit]'); await sleep(150);
  check(G, 'Whole picture toggle saved', (await ev(p, () => localStorage.getItem('otr:shape_hero'))) === 'fit' && await ev(p, () => document.querySelector('#slotGrid .slot:nth-child(1) [data-shape=fit]').classList.contains('on')));
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=circle]'); await sleep(150);
  check(G, 'Round toggle saved', (await ev(p, () => localStorage.getItem('otr:shape_hero'))) === 'circle');
  // 2 transparent → Acorn stays whole (setInputFiles straight into #filePick)
  await setInput(p, 'acorn', F('cutout.png', 'image/png', img.transparent));
  t = await waitToast(p, /saved/i);
  info = await ev(p, () => ({ has: OD.Assets.hasCustom('acorn'), shape: localStorage.getItem('otr:shape_acorn') }));
  check(G, 'transparent PNG for the Acorn saved as Whole picture (setInputFiles)', /saved/i.test(t) && info.has && info.shape === 'fit', { t, info });
  check(G, 'file input cleared after a pick (same file can be picked again)', (await ev(p, () => document.getElementById('filePick').value)) === '');
  // 3 huge JPEG → Felt Meadow background
  const t0 = Date.now();
  await setInput(p, 'bg_meadow', F('huge.jpg', 'image/jpeg', img.huge));
  t = await waitToast(p, /saved/i, 20000);
  const dims = await ev(p, () => { const i = OD.Assets.customSrc.bg_meadow; return i ? [i.naturalWidth, i.naturalHeight, (localStorage.getItem('otr:img_bg_meadow') || '').length] : null; });
  check(G, 'huge 6000×4000 JPEG background saved and downscaled (long edge ≤ 1600, < 2.5 MB)', /saved/i.test(t) && dims && Math.max(dims[0], dims[1]) <= 1600 && dims[2] < 2.5e6, { t, dims, ms: Date.now() - t0 });
  check(G, 'huge picture processed in < 8 s', Date.now() - t0 < 8000, Date.now() - t0);
  check(G, 'backgrounds are not given a shape', (await ev(p, () => localStorage.getItem('otr:shape_bg_meadow'))) === null);
  await setInput(p, 'hero', F('huge.jpg', 'image/jpeg', img.huge));
  t = await waitToast(p, /saved/i, 20000);
  const hd = await ev(p, () => { const i = OD.Assets.customSrc.hero; return [i.naturalWidth, i.naturalHeight]; });
  check(G, 'huge JPEG for Otto downscaled to ≤ 512', /saved/i.test(t) && Math.max(...hd) <= 512, hd);
  await setInput(p, 'bg_pillows', F('tall.jpg', 'image/jpeg', img.portrait));
  t = await waitToast(p, /saved/i, 10000);
  check(G, 'portrait photo (900×1600) background kept at full size', /saved/i.test(t) && (await ev(p, () => OD.Assets.customSrc.bg_pillows.naturalHeight)) === 1600);
  // bad files
  await setInput(p, 'bg_crayon', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  t = await waitToast(p, /picture file/i);
  check(G, 'non-image file → friendly error toast, slot unchanged', /Please choose a picture file/.test(t) && !(await ev(p, () => OD.Assets.hasCustom('bg_crayon'))), t);
  await setInput(p, 'bg_crayon', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  t = await waitToast(p, /could not be opened/i);
  check(G, 'broken image file → friendly error toast', /could not be opened/i.test(t) && !(await ev(p, () => OD.Assets.hasCustom('bg_crayon'))), t);
  await setInput(p, 'bg_crayon', { name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) });
  t = await waitToast(p, /could not be opened/i);
  check(G, '0-byte image file → friendly error toast', /could not be opened/i.test(t), t);
  await setInput(p, 'acorn', { name: 'star.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#f80"/></svg>') });
  t = await waitToast(p, /saved on|could not|Please choose|Not enough/i);
  const svgDims = await ev(p, () => { const i = OD.Assets.customSrc.acorn; return i ? [i.naturalWidth, i.naturalHeight] : null; });
  check(G, 'SVG without width/height (viewBox only) gives a usable picture (not 1×1)', /saved/i.test(t) && svgDims && svgDims[0] >= 32 ? true : 'warn', { t, svgDims });
  await setInput(p, 'acorn', F('cutout.png', 'image/png', img.transparent)); await waitToast(p, /saved/i);
  // storage full while saving a picture
  await ev(p, () => { window._oset = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/img_/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return window._oset.call(this, k, v); }; });
  await setInput(p, 'bg_crayon', F('blue.png', 'image/png', img.photoBlue));
  t = await waitToast(p, /Not enough room/i);
  check(G, 'storage full → "Not enough room" toast, slot stays Original', /Not enough room/.test(t) && !(await ev(p, () => OD.Assets.hasCustom('bg_crayon') || 'img_bg_crayon' in OD.Storage.cache)), t);
  await ev(p, () => { Storage.prototype.setItem = window._oset; });
  await p.screenshot({ path: OUT + '/pictures_screen.png' });
  // background for stars too, then play with custom hero / acorn / bg
  await setInput(p, 'bg_stars', F('blue.png', 'image/png', img.photoBlue)); await waitToast(p, /saved/i);
  await setInput(p, 'hero', F('red.png', 'image/png', img.photoRed)); await waitToast(p, /saved/i);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await ev(p, () => {
    window._drawn = {}; const R = OD.Game.renderer, o = R.drawSpr.bind(R), ob = R.background.bind(R);
    R.drawSpr = function (g, key, ...a) { const r = o(g, key, ...a); window._drawn[key] = (window._drawn[key] || 0) + 1; return r; };
    R.background = function (b) { const r = ob(b); if (r && r.custom) window._drawn['bg_custom_' + b] = 1; return r; };
  });
  await p.click('#btnPlay'); await sleep(300); await sandbox(p);
  await ev(p, () => { const w = OD.debug.world; for (let i = 0; i < 8; i++) w.spawn('acorn', i % 3 - 1, 4 + i * 1.5, { test: true, variant: i % 3 }); });
  await sleep(1200);
  await p.screenshot({ path: OUT + '/pictures_play_meadow.png' });
  let drawn = await ev(p, () => window._drawn);
  check(G, 'custom Otto drawn during play', (drawn['custom:hero'] || 0) > 10, drawn['custom:hero']);
  check(G, 'custom Acorn drawn during play (and in the HUD)', (drawn['custom:acorn'] || 0) > 5 && !drawn.acorn_0, { c: drawn['custom:acorn'], def: drawn.acorn_0 });
  check(G, 'custom Felt Meadow background drawn', !!drawn.bg_custom_0, Object.keys(drawn).filter(k => k.startsWith('bg')));
  await ev(p, () => OD.debug.gotoLevel(3)); await sleep(2500);
  await p.screenshot({ path: OUT + '/pictures_play_stars.png' });
  drawn = await ev(p, () => window._drawn);
  check(G, 'custom Glow-Star Galaxy background drawn', !!drawn.bg_custom_3);
  const pixel = () => ev(p, () => {
    const R = OD.Game.renderer; let c = null;
    for (const [k, v] of R._spr) if (k.startsWith('custom:hero|')) c = v;
    if (!c) return null;
    const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [d[0], d[1], d[2]];
  });
  const px1 = await pixel();
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(150);
  await setInput(p, 'hero', F('blue.png', 'image/png', img.photoBlue)); await waitToast(p, /saved/i);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await p.click('#btnPlay'); await sleep(300); await sandbox(p); await sleep(600);
  const px2 = await pixel();
  await p.screenshot({ path: OUT + '/pictures_play_after_change.png' });
  check(G, 'changing Otto\'s picture again shows the NEW picture in play (no stale sprite)', px2 && px2[2] > 150 && px2[0] < 100, { before: px1, after: px2 });
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(150);
  await p.click('#slotGrid .slot:nth-child(1) [data-shape=fit]'); await sleep(150);
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await p.click('#btnPlay'); await sleep(300); await sandbox(p); await sleep(500);
  const corner = await ev(p, () => {
    const R = OD.Game.renderer; let c = null;
    for (const [k, v] of R._spr) if (k.startsWith('custom:hero|')) c = v;
    const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  });
  check(G, 'Round → Whole picture change shows in play', corner[3] > 200, { corner });
  check(G, 'title / score-card icon unaffected by custom pictures', (await ev(p, () => document.getElementById('titleIcon').getAttribute('src'))) === 'assets/default/icon.svg');
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(150);
  await p.click('#slotGrid .slot:nth-child(2) [data-act=reset]'); await sleep(150);
  check(G, 'Reset one slot', !(await ev(p, () => OD.Assets.hasCustom('acorn'))) && (await ev(p, () => localStorage.getItem('otr:img_acorn'))) === null && await ev(p, () => OD.Assets.hasCustom('hero')));
  await p.click('#btnResetAll'); await sleep(150);
  check(G, 'Reset all', await ev(p, () => OD.Assets.SLOTS.every(s => !OD.Assets.hasCustom(s.id)) && Object.keys(localStorage).filter(k => k.startsWith('otr:img_') || k.startsWith('otr:shape_')).length === 0));
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await ev(p, () => { window._drawn = {}; });
  await p.click('#btnPlay'); await sleep(1000);
  drawn = await ev(p, () => window._drawn);
  check(G, 'after Reset all, the original art is drawn again', !drawn['custom:hero'] && !drawn['custom:acorn'] && !drawn.bg_custom_0 && Object.keys(drawn).some(k => k.startsWith('otto_')), Object.keys(drawn).slice(0, 8));
  await p.goto(GAME + '?mute=1&seed=7'); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  await p.click('#btnCustomize'); await setInput(p, 'hero', F('red.png', 'image/png', img.photoRed)); await waitToast(p, /saved/i);
  await p.reload(); await p.waitForFunction(() => OD.debug && OD.debug.mode === 'title');
  check(G, 'custom picture persists across reload (otr:img_hero)', await ev(p, () => OD.Assets.hasCustom('hero') && !!localStorage.getItem('otr:img_hero')));
  // touch: tapping the preview opens the chooser
  const e = await allErrors(p); check(G, 'no console errors (pictures)', e.filter(x => !/missing image|Failed to load resource/.test(x)).length === 0, e);
  await context.close();
};

const SIZES_ALL = [
  { name: '1280x720', viewport: { width: 1280, height: 720 } },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 } },
  { name: '960x600', viewport: { width: 960, height: 600 } },
  { name: '2560x1080-ultrawide', viewport: { width: 2560, height: 1080 } },
  { name: '800x1280-portrait', viewport: { width: 800, height: 1280 }, hasTouch: true },
  { name: 'iPhone-390x844@3', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { name: 'iPhone-844x390@3', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { name: 'iPhoneSE-667x375@2', viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: 'iPad-1024x768@2', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: 'iPad-768x1024@2', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: 'iPadPro-1366x1024@2', viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
];
const SIZES = QUICK ? SIZES_ALL.filter(s => /1280x720|390x844|844x390|1024x768/.test(s.name)) : SIZES_ALL;
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
      else {
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
    const cv = await ev(p, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), R = OD.Game.renderer; return { cw: r.width, ch: r.height, iw: innerWidth, ih: innerHeight, VW: R.VW, VH: R.VH, bs: c.width * c.height, px: R.px }; });
    const fills = Math.abs(cv.cw - cv.iw) < 2 && Math.abs(cv.ch - cv.ih) < 2;
    check(G, `${S.name} canvas fills the screen (no letterbox bars)`, fills ? true : (cv.iw / cv.ih > 1280 / 540 + 0.01 ? 'warn' : false), cv);
    check(G, `${S.name} backing store within the cap (${(cv.bs / 1e6).toFixed(2)} MP)`, cv.bs <= (S.hasTouch ? 3.3e6 : 2.1e6), cv);
    for (const id of ['scrTitle', 'scrHow', 'scrSettings', 'scrCustom']) {
      if (id !== 'scrTitle') await ev(p, id => OD.UI.open(id, 'scrTitle'), id);
      await sleep(700);
      const f = await screenFit(p, id);
      const offButtons = f.bad.filter(b => !b.startsWith('panel') && !/covered/.test(b));
      const hard = f.overflowX || f.bad.some(b => b.startsWith('panel') || /covered/.test(b));
      check(G, `${S.name} ${id} fits (no sideways overflow, buttons inside the viewport)`, hard ? false : offButtons.length ? (f.scroll ? 'warn' : false) : true, f);
      if (f.small && S.hasTouch) check(G, `${S.name} ${id} touch targets ≥ 30×28 px`, 'warn', f.small);
      await p.screenshot({ path: OUT + `/layout_${S.name}_${id}.png` });
      if (id !== 'scrTitle') await ev(p, () => OD.UI.back());
    }
    await ev(p, () => OD.debug.startGame()); await sleep(800);
    const hud = await p.evaluate(() => ['btnPause', 'btnMuteHud'].map(id => {
      const b = document.getElementById(id), r = b.getBoundingClientRect(), c = document.getElementById('game').getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, onCanvas: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1, clickable: !!h && b.contains(h), w: Math.round(r.width) };
    }));
    check(G, `${S.name} HUD buttons visible, on the canvas and clickable`, hud.every(h => h.inView && h.onCanvas && h.clickable && h.w >= 30), hud);
    // canvas HUD pills (hearts, acorns, biome bar) must not sit under the DOM buttons
    const ov = await ev(p, () => {
      const R = OD.Game.renderer, c = document.getElementById('game').getBoundingClientRect(), I = R.ins, w = OD.debug.world;
      const toL = r => ({ x0: (r.left - c.left) / c.width * R.VW, y0: (r.top - c.top) / c.height * R.VH, x1: (r.right - c.left) / c.width * R.VW, y1: (r.bottom - c.top) / c.height * R.VH });
      const btns = ['btnPause', 'btnMuteHud'].map(id => toL(document.getElementById(id).getBoundingClientRect()));
      const x0 = I.left + 12, y0 = I.top + 10, bw = Math.min(250, R.VW * (R.portrait ? 0.5 : 0.3));
      const bx = R.portrait ? R.VW - I.right - 12 - bw - 8 : R.VW / 2 - bw / 2, by = R._biomePill ? R._biomePill.y0 + 4 : (R.portrait ? y0 + 64 : y0 + 4);   // the renderer's real pill (it moves under the button row)
      const pills = [{ n: 'hearts', x0, y0, x1: x0 + (w.maxHearts) * 30 + 14, y1: y0 + 38 }, { n: 'acorns', x0, y0: y0 + 46, x1: x0 + 156, y1: y0 + 84 }, { n: 'biome', x0: bx - 8, y0: by - 4, x1: bx + bw + 8, y1: by + 34 }];
      const hits = [];
      for (const pl of pills) for (const b of btns) if (pl.x0 < b.x1 && pl.x1 > b.x0 && pl.y0 < b.y1 && pl.y1 > b.y0) hits.push(pl.n + ' ∩ button (' + Math.round(Math.min(pl.y1, b.y1) - Math.max(pl.y0, b.y0)) + ' px)');
      for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) { const a = pills[i], b = pills[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) hits.push(a.n + ' ∩ ' + b.n); }
      return { hits, btns: btns.map(b => [Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1)]), pills };
    });
    check(G, `${S.name} canvas HUD pills do not overlap each other or the Pause/Sound buttons`, ov.hits.length === 0, ov.hits.concat([JSON.stringify(ov.btns)]));
    await p.screenshot({ path: OUT + `/layout_${S.name}_play.png` });
    // Otto at a moon-jump apex stays on screen
    await ev(p, () => OD.debug.gotoLevel(3)); await sleep(300);
    const ap = await ev(p, () => { const R = OD.Game.renderer, pr = R.proj(1, 1.25, 0, 0.35); return { top: pr.sy - 0.95 * pr.u * 120 / 128, left: pr.sx - 0.5 * 0.95 * pr.u, right: pr.sx + 0.5 * 0.95 * pr.u, VW: R.VW }; });
    check(G, `${S.name} Otto at the moon apex in the edge lane stays on screen`, ap.top > 0 && ap.left > 0 && ap.right < ap.VW, ap);
    await ev(p, () => OD.Game.pause()); await sleep(700);
    let f = await screenFit(p, 'scrPause');
    check(G, `${S.name} pause screen fits`, !f.overflowX && f.bad.length === 0 ? true : (f.scroll && !f.overflowX ? 'warn' : false), f);
    await p.screenshot({ path: OUT + `/layout_${S.name}_pause.png` });
    await ev(p, () => OD.Game.resume());
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
  const r = await ev(p, () => { const R = OD.Game.renderer, c = document.getElementById('game').getBoundingClientRect(); return { VW: R.VW, VH: R.VH, cw: c.width, ch: c.height, iw: innerWidth, ih: innerHeight }; });
  check(G, 'rotate portrait → landscape relayouts the canvas', r.VW > r.VH && Math.abs(r.cw - r.iw) < 2 && Math.abs(r.ch - r.ih) < 2, r);
  const box = await canvasBox(p); await setLane(p, 0);
  await p.touchscreen.tap(box.x + box.w * 0.9, box.y + box.h * 0.6); await sleep(300);
  check(G, 'after rotation, tap zones follow the new size', (await st(p)).hero.lane === 1);
  check(G, 'rotation keeps the run going (no pause / reset)', (await mode(p)) === 'playing' && (await st(p)).dist > 5);
  await p.screenshot({ path: OUT + '/layout_rotated.png' });
  await context.close();
};

groups.soak = async () => {
  const G = 'soak';
  const { page: p, context } = await open('?mute=1&seed=5&autostart=1&autorestart=1&bot=1&skill=0.8&diff=normal&speed=16');
  await spyEvents(p);
  let maxObj = 0, maxPart = 0, maxFx = 0, maxLevel = 0, maxTexts = 0, maxFly = 0;
  const t0 = Date.now(), DUR = QUICK ? 20000 : 75000;
  let shot = 0;
  while (Date.now() - t0 < DUR) {
    await sleep(1000);
    const s = await ev(p, () => { const s = OD.debug.getState(), R = OD.Game.renderer; s.texts = R.texts.length; s.flyers = R.flyers.length; s.cache = OD.Assets._cache.size; s.spr = R._spr.size; s.bg = R._bg.size; return s; });
    maxObj = Math.max(maxObj, s.objects); maxPart = Math.max(maxPart, s.particles); maxFx = Math.max(maxFx, s.fx); maxTexts = Math.max(maxTexts, s.texts); maxFly = Math.max(maxFly, s.flyers);
    maxLevel = Math.max(maxLevel, s.level);
    if (Date.now() - t0 > shot * 15000) { await p.screenshot({ path: OUT + `/soak_${shot}.png` }); shot++; }
    p._last = s;
  }
  const stats = await ev(p, () => OD.debug.stats);
  const lv = await events(p, 'levelUp'), grav = await events(p, 'gravity');
  const s = p._last;
  console.log('   soak:', JSON.stringify({ games: stats.games, scores: stats.scores, levels: stats.levels, maxLevel, levelUps: lv.length, gravity: grav.length, maxObj, maxPart, maxFx, maxTexts, maxFly, cache: s.cache, spr: s.spr, bg: s.bg }));
  check(G, 'several biomes reached', lv.length >= (QUICK ? 2 : 6), { levelUps: lv.length, maxLevel });
  check(G, 'every biome change eased the gravity to that biome\'s gk', lv.every(l => Math.abs(l.gk - GRAV[l.zone].gk) < 1e-9) && grav.length >= lv.length - stats.games, { lv: lv.slice(0, 6).map(l => [l.zone, l.gk]) });
  check(G, 'objects bounded (≤ 40)', maxObj <= 40, maxObj);
  check(G, 'weather particles bounded (< 160)', maxPart < 160, maxPart);
  check(G, 'renderer fx/texts/flyers bounded', maxFx < 400 && maxTexts < 60 && maxFly < 60, { maxFx, maxTexts, maxFly });
  check(G, 'sprite / background caches bounded', s.cache < 600 && s.spr < 600 && s.bg < 12, { cache: s.cache, spr: s.spr, bg: s.bg });
  check(G, 'autorestart exercised (≥ 1 game over → new game)', stats.games >= 1 ? true : 'warn', stats.games === 0 ? 'bot never died (skill 0.8) — covered by the Hard run below' : stats.games);
  check(G, 'still playing at the end', ['playing', 'over'].includes(await mode(p)));
  const e = await allErrors(p); check(G, 'no errors during the long bot run (×16)', e.length === 0 && stats.errors.length === 0, e);
  await context.close();
  const q = await open('?mute=1&seed=9&autostart=1&autorestart=1&bot=1&skill=0.1&diff=hard&speed=16');
  await sleep(QUICK ? 12000 : 30000);
  const qs = await ev(q.page, () => OD.debug.stats);
  check(G, 'autorestart (Hard, skill 0.1, speed 16): several games, no errors', qs.games >= 2 && qs.errors.length === 0 && q.page.errs.length === 0, { games: qs.games, scores: qs.scores, errors: qs.errors.concat(q.page.errs) });
  const best = await ev(q.page, () => localStorage.getItem('otr:best_hard'));
  check(G, 'best_hard saved from the bot games = max score', best === String(Math.max(...qs.scores, 0)), { best, scores: qs.scores });
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
