// Family Flappy — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick]
//   baseUrl defaults to http://127.0.0.1:8771/index.html  (serve game/ with: python3 -m http.server 8771)
//   --quick shortens the long bot run (20 s instead of 150 s)
// Prints PASS/FAIL per check, writes screenshots to tests/out/functional/, exits 1 on any FAIL.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8771/index.html';
const QUICK = args.includes('--quick');
const LONG_RUN_S = QUICK ? 20 : 150;
const OUT = path.join(__dirname, '..', 'out', 'functional');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
function info(msg) { console.log('     ' + msg); }
const url = q => BASE + (BASE.includes('?') ? '&' : '?') + 'mute=1' + (q ? '&' + q : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;

async function newPage(opts = {}, ctxIn) {
  const ctx = ctxIn || await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dsf || 1 });
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errors.push('console.error: ' + m.text()); });
  page._ctx = ctx;
  return page;
}
async function boot(page, q) {
  await page.goto(url(q));
  await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode && FF.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => FF.debug.mode);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}

/* Freeze sim time (speed 0) so tests can set things up deterministically. */
const freeze = page => ev(page, () => FF.debug.setSpeed(0));
const unfreeze = (page, s = 1) => ev(page, s => FF.debug.setSpeed(s), s);

/* Arrange: in 'playing', one paused turtle placed so that a drop released NOW lands on it.
 * Returns predicted info. Bird is moved to y (default 150) with vy 0. */
async function arrangeHit(page, birdY = 150) {
  return ev(page, birdY => {
    const w = FF.debug.world;
    w.bird.y = birdY; w.bird.vy = 0;
    w.drops.length = 0;
    let t = w.turtles[0];
    w.turtles.length = 0; w.turtles.push(t);
    t.paused = true; t.pauseTimer = 50; t._nextPause = 50; t.happyTimer = 0; t.hitCooldown = 0; t.speed = 0;
    w._turtleGap = 1e9; w._emptyTime = -1e9;   // no new turtles during the test
    let best = null;
    for (let x = 0; x <= 900; x += 2) {
      t.x = x;
      const p = w.predictDrop(w.bird.vy, 3);
      if (p.hitId === t.id && (!best || p.margin > best.margin)) best = { x, margin: p.margin, t: p.t };
    }
    if (best) t.x = best.x;
    return best;
  }, birdY);
}

/* Read the events the world emits by wrapping drainEvents (keeps a log). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = FF.Game;
    const orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);

/* Create an image file inside the page: canvas → Blob → bytes. */
async function makeImage(page, w, h, kind, fmt = 'image/png') {
  const arr = await ev(page, async ({ w, h, kind, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (kind === 'noise') {
      const d = g.createImageData(w, h);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    } else {
      const col = { bird: '#ff2bd6', drop: '#00e5ff', turtle: '#7a00ff', bg: '#ff8800' }[kind] || '#888';
      if (kind === 'bg') {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe600'); gr.addColorStop(1, col);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1133aa'; for (let i = 0; i < 12; i++) g.fillRect(i * w / 12, h * 0.6, w / 24, h * 0.4);
      } else {
        g.clearRect(0, 0, w, h);
        g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.62, h * 0.4, Math.min(w, h) * 0.1, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(w * 0.64, h * 0.4, Math.min(w, h) * 0.05, 0, Math.PI * 2); g.fill();
      }
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.95));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { w, h, kind, fmt });
  return Buffer.from(arr);
}

/* Use the real UI path: click "Choose…" on a slot, answer the file chooser. */
async function pickFile(page, slotIndex, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(slotIndex).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const slotIdx = id => ['bird', 'drop', 'turtle', 'bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter'].indexOf(id);
const toastText = page => ev(page, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });

/* All visible buttons of the current screen fully inside the viewport and not inside a scrolled-away area. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = FF.UI.current && document.getElementById(FF.UI.current);
    if (!scr) return { bad: ['no screen'], overflow: false };
    const btns = [...scr.querySelectorAll('button, .set, .slot')].filter(b => b.offsetParent !== null);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5)
        bad.push((b.id || b.className || b.tagName) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    const panel = scr.querySelector('.panel');
    let overflow = false, hidden = [];
    if (panel) {
      overflow = panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1;
      const pr = panel.getBoundingClientRect();
      for (const b of btns) { const r = b.getBoundingClientRect(); if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) hidden.push(b.id || b.textContent.trim().slice(0, 20)); }
    }
    return { bad, overflow, hidden };
  });
}

/* =============================== TESTS =============================== */

async function testBootAndTitle() {
  const page = await newPage();
  await boot(page, 'seed=42');
  check('boot: reaches title mode', (await mode(page)) === 'title');
  for (const [id, label] of [['btnPlay', 'Play'], ['btnCustomize', 'Change Pictures'], ['btnHow', 'How to Play'], ['btnSettings', 'Settings']]) {
    const txt = await ev(page, id => document.getElementById(id).textContent, id);
    check(`title: "${label}" button visible`, (await visible(page, '#' + id)) && txt.includes(label), txt.trim());
  }
  check('title: Quit hidden in browser mode', !(await visible(page, '#btnQuit')));
  check('title: best score line shown', (await visible(page, '#bestTitle')) && /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  await page.waitForTimeout(1500);
  const st = await ev(page, () => FF.debug.getState());
  check('title: attract demo runs behind menu (bot flying)', st.state === 'playing' || st.state === 'dead', st.state);
  await shot(page, '01_title');
  // How to play
  await page.click('#btnHow'); await page.waitForTimeout(350);
  check('How to Play opens', await ev(page, () => FF.UI.current === 'scrHow'));
  await shot(page, '02_how');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('How to Play: Esc goes back to title', await ev(page, () => FF.UI.current === 'scrTitle'));
  check('boot: zero console errors / page errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testReadyFlapDeath() {
  const page = await newPage();
  await boot(page, 'seed=7');
  await hookEvents(page);
  await page.click('#btnPlay'); await page.waitForTimeout(400);
  let s = await ev(page, () => FF.debug.getState());
  check('Play → READY mode', s.mode === 'ready' && s.state === 'ready', s.mode + '/' + s.state);
  const ys = [];
  for (let i = 0; i < 8; i++) { ys.push(await ev(page, () => FF.debug.world.bird.y)); await page.waitForTimeout(120); }
  const spread = Math.max(...ys) - Math.min(...ys);
  check('READY: bird hovers (bobs, no gravity)', spread > 2 && Math.max(...ys) < 250 && Math.min(...ys) > 210, ys.map(v => v.toFixed(1)).join(','));
  check('READY: HUD (pause/mute buttons) visible', await visible(page, '#btnPause'));
  await shot(page, '03_ready');
  check('READY: no drops before first flap', s.drops === 0);

  // each start key
  for (const key of ['Space', 'ArrowUp', 'KeyW', 'click']) {
    await ev(page, () => FF.Game.startGame()); await page.waitForTimeout(150);
    const y0 = await ev(page, () => FF.debug.world.bird.y);
    if (key === 'click') await page.mouse.click(700, 300); else await page.keyboard.press(key);
    await page.waitForTimeout(90);
    const s2 = await ev(page, () => ({ m: FF.debug.mode, st: FF.debug.world.state, y: FF.debug.world.bird.y, d: FF.debug.world.drops.length, f: FF.debug.world.flaps }));
    check(`READY: ${key} starts play and raises the bird`, s2.m === 'playing' && s2.st === 'playing' && s2.y < y0 - 5, `y ${y0.toFixed(1)}→${s2.y.toFixed(1)}`);
    check(`READY: starting flap (${key}) does not drop a treat`, s2.d === 0, 'drops=' + s2.d);
  }
  // flap raises bird during play
  await page.waitForTimeout(250);
  const ya = await ev(page, () => FF.debug.world.bird.y);
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  const yb = await ev(page, () => FF.debug.world.bird.y);
  check('PLAYING: flap raises the bird', yb < ya, `${ya.toFixed(1)}→${yb.toFixed(1)}`);

  // no input → falls → game over ~1 s after hitting the ground
  await ev(page, () => { window._evLog.length = 0; });
  const t0 = Date.now();
  await page.waitForFunction(() => FF.debug.world.state === 'dead', null, { timeout: 5000 });
  const tDead = Date.now();
  check('no input: bird falls and hits the ground', true, ((tDead - t0) / 1000).toFixed(2) + ' s');
  check('dead: mode still playing during the death beat', (await mode(page)) === 'playing');
  await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 4000 });
  const tOver = Date.now();
  const gap = (tOver - tDead) / 1000;
  check('game over panel appears ~1 s after hitting ground', gap > 0.6 && gap < 1.6, gap.toFixed(2) + ' s');
  check('game over panel visible with Play Again / Menu', (await visible(page, '#btnAgain')) && (await visible(page, '#btnOverMenu')));
  check('HUD hidden on game over', !(await visible(page, '#btnPause')));
  await shot(page, '04_game_over');

  // Play again: Space within the lock must NOT restart, after lock it must.
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('game over: Space within 0.7 s lock is ignored', (await mode(page)) === 'over');
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  check('game over: Space after lock → Play Again (READY)', (await mode(page)) === 'ready');

  // Enter path
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 6000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('game over: Enter after lock → Play Again', (await mode(page)) === 'ready');

  // Enter within lock (Play Again button has keyboard focus → native activation bypasses the lock)
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 6000 });
  await page.waitForTimeout(100);
  const focused = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  check('game over: Enter within 0.7 s lock is ignored', (await mode(page)) === 'over', 'focused=' + focused + ', mode=' + await mode(page));

  // Mouse click on Play Again
  if ((await mode(page)) !== 'over') { await page.keyboard.press('Space'); await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 6000 }); }
  await page.waitForTimeout(800);
  await page.click('#btnAgain'); await page.waitForTimeout(150);
  check('game over: Play Again button → READY', (await mode(page)) === 'ready');
  // Space held while dying (key repeat) must not restart
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 6000 });
  await page.waitForTimeout(800);
  await page.click('#btnOverMenu'); await page.waitForTimeout(200);
  check('game over: Menu → title', (await mode(page)) === 'title' && await ev(page, () => FF.UI.current === 'scrTitle'));
  check('ready/flap/death: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testDropsScoring() {
  const page = await newPage();
  await boot(page, 'seed=3&autostart=1');
  await hookEvents(page);
  check('autostart → READY', (await mode(page)) === 'ready');
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  await freeze(page);
  await ev(page, () => { const w = FF.debug.world; w.bird.y = 200; w.bird.vy = 0; window._evLog.length = 0; });
  // cooldown: two flaps at the same sim time → one drop
  await ev(page, () => { FF.debug.flap(); FF.debug.flap(); FF.debug.flap(); });
  let n = await ev(page, () => FF.debug.world.drops.length);
  check('drop: each flap makes a drop, cooldown blocks rapid repeats', n === 1, 'drops after 3 instant flaps = ' + n);
  // advance past cooldown
  await ev(page, () => { FF.debug.world.update(FF.debug.world.cfg.dropCooldown + 0.02); FF.debug.world.bird.y = 200; FF.debug.flap(); });
  n = await ev(page, () => FF.debug.world.drops.length);
  check('drop: flap after cooldown makes another drop', n === 2, 'drops=' + n);
  // maxDrops
  const mx = await ev(page, () => {
    const w = FF.debug.world; let max = 0;
    for (let i = 0; i < 20; i++) { w.update(w.cfg.dropCooldown + 0.001); w.bird.y = 150; w.bird.vy = 0; FF.debug.flap(); max = Math.max(max, w.drops.filter(d => !d.landed).length); }
    return { max, cfg: w.cfg.maxDrops };
  });
  check('drop: airborne drops never exceed maxDrops', mx.max <= mx.cfg, mx);
  await ev(page, () => { const w = FF.debug.world; w.drops.length = 0; w.update(0.5); window._evLog.length = 0; });

  // deterministic hit
  const scoreBefore = await ev(page, () => FF.debug.world.score);
  const plan = await arrangeHit(page);
  check('hit setup: a turtle position exists where a drop lands on the shell', !!plan, plan);
  await ev(page, () => { FF.debug.world._lastDropAt = -1e9; FF.debug.flap(); });
  await unfreeze(page);
  await page.waitForFunction(() => window._evLog.some(e => e.type === 'hit' || e.type === 'miss'), null, { timeout: 4000 }).catch(() => {});
  await freeze(page);
  let hits = await evLog(page, 'hit');
  let sc = await ev(page, () => FF.debug.world.score);
  check('drop landing on a turtle shell increases the score', hits.length === 1 && sc === scoreBefore + 1, { hits: hits.length, score: sc });
  await page.waitForTimeout(50);
  await ev(page, () => FF.Game.renderer.draw('playing'));
  await shot(page, '05_hit_feedback');
  check('hit: turtle shows happy frame', await ev(page, () => FF.debug.world.turtles[0].frame === 'happy' || FF.debug.world.turtles[0].happyTimer > 0));

  // miss: no turtle in reach
  await ev(page, () => { const w = FF.debug.world; window._evLog.length = 0; w.turtles.forEach(t => t.x = 900); w.bird.y = 150; w.bird.vy = 0; w._lastDropAt = -1e9; FF.debug.flap(); });
  await ev(page, () => { const w = FF.debug.world; for (let i = 0; i < 150; i++) { w.update(1 / 120); if (w.bird.y > 300) { w.bird.y = 150; w.bird.vy = 0; } } FF.Game.handleEvents(w.drainEvents()); });
  const misses = await evLog(page, 'miss');
  const st = await ev(page, () => ({ state: FF.debug.world.state, combo: FF.debug.world.combo }));
  check('miss: drop on the ground emits miss, game continues, combo reset', misses.length >= 1 && st.state === 'playing' && st.combo === 0, { misses: misses.length, ...st });

  // combo: 3 consecutive hits → third gives bonus
  await ev(page, () => { window._evLog.length = 0; });
  const pts = [];
  for (let k = 0; k < 3; k++) {
    await ev(page, () => { const w = FF.debug.world; w.turtles.forEach(t => { t.hitCooldown = 0; t.happyTimer = 0; }); });
    const pl = await arrangeHit(page);
    if (!pl) { pts.push('noplan'); continue; }
    await ev(page, () => {
      const w = FF.debug.world; w._lastDropAt = -1e9; FF.debug.flap();
      for (let i = 0; i < 400 && !w._events.some(e => e.type === 'hit' || e.type === 'miss'); i++) { w.update(1 / 120); if (w.bird.y > 380) { w.bird.y = 150; w.bird.vy = 0; } }
      FF.Game.handleEvents(w.drainEvents());
    });
  }
  hits = await evLog(page, 'hit');
  check('combo: three consecutive hits → combo 3 and +2 on the third', hits.length === 3 && hits[2].combo === 3 && hits[2].points === 2, hits.map(h => ({ c: h.combo, p: h.points })));
  await ev(page, () => FF.Game.renderer.draw('playing'));
  await shot(page, '06_combo');

  // ceiling doesn't kill
  await ev(page, () => { const w = FF.debug.world; window._evLog.length = 0; w.bird.y = 25; w.bird.vy = -300; FF.debug.flap();
    for (let i = 0; i < 30; i++) w.update(1 / 120); FF.Game.handleEvents(w.drainEvents()); });
  const ceil = await evLog(page, 'ceiling');
  const cst = await ev(page, () => ({ s: FF.debug.world.state, y: FF.debug.world.bird.y, vy: FF.debug.world.bird.vy }));
  check('ceiling: soft bounce, does not end the round', ceil.length >= 1 && cst.s === 'playing' && cst.vy > 0, cst);
  check('drops/scoring: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testSeasons() {
  const page = await newPage();
  await boot(page, 'seed=9');
  // Settings → 5 points per season
  await page.click('#btnSettings'); await page.waitForTimeout(300);
  await page.click('#setSeasonPts button[data-v="5"]');
  check('settings: points-per-season 5 highlighted', await ev(page, () => document.querySelector('#setSeasonPts button[data-v="5"]').classList.contains('on')));
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(200);
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await hookEvents(page);
  const pps = await ev(page, () => FF.debug.world.cfg.pointsPerSeason);
  check('settings: new world uses pointsPerSeason = 5', pps === 5, pps);
  check('renderer progress bar uses 5', await ev(page, () => FF.Game.renderer.pointsPerSeason === 5));
  await page.keyboard.press('Space'); await page.waitForTimeout(30);
  await freeze(page);

  const names = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const expectSprites = [['petal', 'blossom'], ['butterfly_a', 'butterfly_b', 'seed'], ['leaf_red', 'leaf_orange', 'leaf_yellow'], ['snowflake']];
  const forbidden = [['leaf_red', 'snowflake', 'butterfly_a'], ['petal', 'leaf_red', 'snowflake'], ['petal', 'snowflake', 'butterfly_a'], ['petal', 'leaf_red', 'butterfly_a']];
  // spring check
  let ws = await ev(page, () => FF.debug.weather.stats().bySprite);
  check('season 0 (Spring): weather has petals/blossoms', !!(ws.petal || ws.blossom), ws);
  for (let s = 1; s <= 4; s++) {
    // set score to one below the boundary and land a hit
    await ev(page, s => { const w = FF.debug.world; w.score = s * w.cfg.pointsPerSeason - 1; w.combo = 0; window._evLog.length = 0; w.turtles.forEach(t => { t.hitCooldown = 0; t.happyTimer = 0; }); }, s);
    const pl = await arrangeHit(page);
    await ev(page, () => {
      const w = FF.debug.world; w._lastDropAt = -1e9; FF.debug.flap();
      for (let i = 0; i < 400 && !w._events.some(e => e.type === 'hit' || e.type === 'miss'); i++) { w.update(1 / 120); if (w.bird.y > 380) { w.bird.y = 150; w.bird.vy = 0; } }
      FF.Game.handleEvents(w.drainEvents());
    });
    const se = await evLog(page, 'season');
    const exp = s % 4;
    const wst = await ev(page, () => ({ season: FF.debug.world.season, idx: FF.debug.world.seasonIndex, score: FF.debug.world.score }));
    check(`season advance at ${s * 5} points → ${names[exp]}`, !!pl && se.length === 1 && wst.season === exp && se[0].season === exp, wst);
    // let the weather hand over (run sim 5 s while keeping the bird alive)
    await ev(page, () => { const G = FF.Game, w = G.world; for (let i = 0; i < 300; i++) { w.bird.y = 150; w.bird.vy = 0; G.step(1 / 60); G.renderer.update(1 / 60); } });
    ws = await ev(page, () => FF.debug.weather.stats().bySprite);
    const hasExp = expectSprites[exp].some(k => ws[k] > 0);
    const hasForb = forbidden[exp].filter(k => ws[k] > 0);
    check(`weather particles switch to ${names[exp]} set`, hasExp && hasForb.length === 0, ws);
    const vis = await ev(page, () => ({ cur: FF.Game.renderer.vis.cur, name: FF.Renderer.SEASON_INFO[FF.debug.world.season].name, music: FF.Audio.season }));
    check(`HUD season name/backdrop = ${names[exp]}`, vis.cur === exp && vis.name === names[exp] && vis.music === exp, vis);
    await ev(page, () => { FF.Game.renderer.banner = null; FF.Game.renderer.draw('playing'); });
    await shot(page, `07_season_${s}_${names[exp].toLowerCase()}`);
  }
  // reset to Spring on new game
  await unfreeze(page);
  await ev(page, () => FF.Game.startGame()); await page.waitForTimeout(300);
  check('new game starts back in Spring', await ev(page, () => FF.debug.world.season === 0 && FF.Game.renderer.vis.cur === 0));
  // restore default
  await ev(page, () => FF.Game.setSetting('seasonPts', 10));
  check('seasons: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testPause() {
  const page = await newPage();
  await boot(page, 'seed=11');
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await ev(page, () => FF.debug.setBot(true, 1));     // keep the bird alive while we test pause
  await page.waitForTimeout(600);
  check('bot flying (precondition)', (await mode(page)) === 'playing');
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} pauses`, (await mode(page)) === 'paused' && await visible(page, '#btnResume'));
    const a = await ev(page, () => ({ t: FF.debug.world.time, y: FF.debug.world.bird.y, p: FF.debug.weather.particles.slice(0, 5).map(p => p.x + p.y), sc: FF.debug.world.scroll, fx: FF.Game.renderer.time }));
    await page.waitForTimeout(500);
    const b = await ev(page, () => ({ t: FF.debug.world.time, y: FF.debug.world.bird.y, p: FF.debug.weather.particles.slice(0, 5).map(p => p.x + p.y), sc: FF.debug.world.scroll, fx: FF.Game.renderer.time }));
    check(`pause (${key}): nothing moves (world, bird, weather, effects)`, a.t === b.t && a.y === b.y && a.sc === b.sc && JSON.stringify(a.p) === JSON.stringify(b.p) && a.fx === b.fx);
    // Space while paused should not flap
    const f0 = await ev(page, () => FF.debug.world.flaps);
    await page.mouse.click(100, 650); await page.waitForTimeout(50);
    check(`pause (${key}): clicking the dim background does not flap`, f0 === await ev(page, () => FF.debug.world.flaps));
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} resumes`, (await mode(page)) === 'playing');
  }
  {
    await page.waitForTimeout(150);
    if (await mode(page) !== 'playing') await ev(page, () => FF.Game.resume());
    await shot(page, '08_playing');
    await page.click('#btnPause'); await page.waitForTimeout(150);
    check('pause: HUD pause button pauses', (await mode(page)) === 'paused');
    await shot(page, '09_paused');
    await page.click('#btnResume'); await page.waitForTimeout(150);
    check('pause: Resume button resumes', (await mode(page)) === 'playing');
  }
  // pause button click must not also flap / drop
  await ev(page, () => FF.debug.setBot(false));
  await ev(page, () => { FF.debug.world.bird.y = 150; FF.debug.world.bird.vy = 0; });
  const fl = await ev(page, () => ({ f: FF.debug.world.flaps, d: FF.debug.world.drops_made }));
  await page.click('#btnPause'); await page.waitForTimeout(80);
  const fl2 = await ev(page, () => ({ f: FF.debug.world.flaps, d: FF.debug.world.drops_made }));
  check('pause button click does not flap the bird / drop a treat', fl2.f === fl.f, { before: fl, after: fl2 });
  await page.click('#btnResume');
  await ev(page, () => { FF.debug.world.bird.y = 150; FF.debug.world.bird.vy = 0; });   // HUD clicks no longer flap: keep the bird airborne
  await page.waitForTimeout(80);
  const fm = await ev(page, () => FF.debug.world.flaps);
  await page.click('#btnMuteHud'); await page.waitForTimeout(80);
  check('mute HUD button click does not flap the bird', fm === await ev(page, () => FF.debug.world.flaps), { before: fm, after: await ev(page, () => FF.debug.world.flaps) });
  await page.click('#btnMuteHud');
  await ev(page, () => { FF.debug.world.bird.y = 150; FF.debug.world.bird.vy = 0; FF.debug.setBot(true, 1); });
  // window blur
  await page.waitForTimeout(200);
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur auto-pauses', (await mode(page)) === 'paused', await ev(page, () => ({ mode: FF.debug.mode, state: FF.debug.world.state, y: FF.debug.world.bird.y, ui: FF.UI.current })));
  await page.click('#btnResume'); await page.waitForTimeout(100);
  // visibilitychange
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(80);
  check('pause: tab hidden auto-pauses', (await mode(page)) === 'paused');
  await ev(page, () => { delete document.hidden; });
  // Restart from pause (autopilot off, otherwise the bot starts the new round by itself)
  await ev(page, () => { FF.debug.setBot(false); FF.debug.world.score = 4; });
  await page.click('#btnRestart'); await page.waitForTimeout(200);
  check('pause → Restart: fresh round in READY with score 0', await ev(page, () => FF.debug.mode === 'ready' && FF.debug.world.score === 0));
  // pause in READY and resume back to READY
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const pr = await mode(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('pause from READY resumes into READY', pr === 'paused' && (await mode(page)) === 'ready', pr + '→' + await mode(page));
  // Settings from pause, then back to pause
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  check('pause → Settings opens', await ev(page, () => FF.UI.current === 'scrSettings' && FF.debug.mode === 'paused'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  check('Settings (from pause) → Esc returns to pause screen', await ev(page, () => FF.UI.current === 'scrPause' && FF.debug.mode === 'paused'));
  await page.click('#btnPauseMenu'); await page.waitForTimeout(200);
  check('pause → Main Menu → title', (await mode(page)) === 'title' && await ev(page, () => FF.UI.current === 'scrTitle'));
  const music = await ev(page, () => FF.Audio._musicPlaying);
  check('music stops when returning to the title menu', !music, '_musicPlaying=' + music);
  check('pause: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await newPage({}, ctx);
  await boot(page, 'seed=2');
  // difficulty CONFIG differences
  const cfgs = {};
  for (const d of ['easy', 'normal', 'hard']) {
    await ev(page, d => FF.Game.setSetting('difficulty', d), d);
    await ev(page, () => FF.Game.startGame());
    cfgs[d] = await ev(page, () => { const c = FF.debug.world.cfg; return { g: c.gravity, imp: c.flapImpulse, ss: c.scrollSpeedStart, smax: c.scrollSpeedMax, tmax: c.turtleSpeedMax, forgive: c.shellForgive, wind: c.windDifficulty, cd: c.dropCooldown }; });
  }
  info('difficulty cfgs ' + JSON.stringify(cfgs));
  const diffKeys = ['g', 'ss', 'smax', 'tmax', 'forgive', 'wind'];
  check('difficulty: easy differs from normal in gravity/speed/turtles/shell/wind', diffKeys.every(k => cfgs.easy[k] !== cfgs.normal[k]));
  check('difficulty: hard differs from normal in gravity/speed/turtles/shell/wind', diffKeys.every(k => cfgs.hard[k] !== cfgs.normal[k]));
  check('difficulty: easy is gentler (lower gravity, slower scroll, bigger shell)', cfgs.easy.g < cfgs.normal.g && cfgs.easy.ss < cfgs.normal.ss && cfgs.easy.forgive > cfgs.normal.forgive);
  check('difficulty: hard is harder (higher gravity, faster scroll, smaller shell)', cfgs.hard.g > cfgs.normal.g && cfgs.hard.ss > cfgs.normal.ss && cfgs.hard.forgive < cfgs.normal.forgive);
  await ev(page, () => FF.Game.toTitle());
  await page.waitForTimeout(100);

  // through the UI
  await page.click('#btnSettings'); await page.waitForTimeout(300);
  await shot(page, '10_settings');
  const sfx0 = await page.isChecked('#setSfx');
  await page.click('label.set:has(#setSfx)');
  await page.click('label.set:has(#setMusic)');
  await page.click('#setDifficulty button[data-v="hard"]');
  await page.click('#setSeasonPts button[data-v="15"]');
  const s1 = await ev(page, () => Object.assign({}, FF.Game.settings));
  check('settings UI: sound toggle changes setting', s1.sfx === !sfx0, s1);
  check('settings UI: music toggle off', s1.music === false);
  check('settings UI: difficulty + points per season set', s1.difficulty === 'hard' && s1.seasonPts === 15);
  check('settings UI: Audio options follow toggles', await ev(page, () => FF.Audio.sfxOn === FF.Game.settings.sfx && FF.Audio.musicOn === FF.Game.settings.music));
  // persistence across reload
  await page.reload();
  await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  const s2 = await ev(page, () => Object.assign({}, FF.Game.settings));
  check('settings persist across reload (localStorage)', s2.sfx === s1.sfx && s2.music === s1.music && s2.difficulty === 'hard' && s2.seasonPts === 15, s2);
  await page.click('#btnSettings'); await page.waitForTimeout(250);
  const ui = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked,
    diff: document.querySelector('#setDifficulty .on') && document.querySelector('#setDifficulty .on').dataset.v,
    pts: document.querySelector('#setSeasonPts .on') && document.querySelector('#setSeasonPts .on').dataset.v }));
  check('settings UI reflects persisted values after reload', ui.sfx === s1.sfx && ui.music === s1.music && ui.diff === 'hard' && ui.pts === '15', ui);
  check('?mute=1 does not get persisted as a setting', !(await ev(page, () => JSON.parse(localStorage.getItem('ff:settings')).muted)), await ev(page, () => localStorage.getItem('ff:settings')));
  // Reset best
  await ev(page, () => { FF.Storage.set('best_normal', '17'); FF.Storage.set('best_hard', '9'); });
  await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('Reset best clears every difficulty', await ev(page, () => FF.Storage.get('best_normal') == null && FF.Storage.get('best_hard') == null && !localStorage.getItem('ff:best_hard')));
  check('Reset best shows a toast', /cleared/i.test(await toastText(page)));
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('title best score refreshed after reset', await ev(page, () => document.getElementById('bestTitle').textContent === '0'));
  // M key mute + HUD icon
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const icon0 = await ev(page, () => document.getElementById('btnMuteHud').innerHTML);
  const m0 = await ev(page, () => FF.Game.settings.muted);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const icon1 = await ev(page, () => document.getElementById('btnMuteHud').innerHTML);
  const m1 = await ev(page, () => FF.Game.settings.muted);
  check('M toggles mute', m1 === !m0, { m0, m1 });
  check('M updates the HUD mute icon', icon0 !== icon1);
  check('M shows a toast', /Sound (on|off)/.test(await toastText(page)));
  check('Audio master follows mute', await ev(page, () => FF.Audio.muted === FF.Game.settings.muted));
  await page.keyboard.press('KeyM');
  // fullscreen in browser mode
  await ev(page, () => FF.Game.toTitle()); await page.click('#btnSettings'); await page.waitForTimeout(200);
  await page.click('label.set:has(#setFull)'); await page.waitForTimeout(400);
  const fsOn = await ev(page, () => ({ flag: FF.Game.fullscreen, el: !!document.fullscreenElement, box: document.getElementById('setFull').checked }));
  info('fullscreen after toggle on: ' + JSON.stringify(fsOn));
  await ev(page, () => document.fullscreenElement && document.exitFullscreen()); await page.waitForTimeout(400);
  const fsOff = await ev(page, () => ({ flag: FF.Game.fullscreen, el: !!document.fullscreenElement, box: document.getElementById('setFull').checked }));
  check('fullscreen (browser): leaving fullscreen outside the game (Esc) unticks the Settings checkbox', fsOff.flag === false && fsOff.box === false, fsOff);
  // F11 toggles twice in a row
  await page.keyboard.press('F11'); await page.waitForTimeout(300);
  await page.keyboard.press('F11'); await page.waitForTimeout(300);
  const fs2 = await ev(page, () => ({ flag: FF.Game.fullscreen, el: !!document.fullscreenElement }));
  check('fullscreen (browser): F11 twice returns to windowed and flags agree', fs2.flag === fs2.el && !fs2.el, fs2);
  check('settings: no errors', page._errors.length === 0, page._errors.join(' | '));
  // restore defaults for later tests in this context
  await ev(page, () => { localStorage.clear(); });
  await ctx.close();
}

async function testBestScores() {
  const page = await newPage();
  await boot(page, 'seed=4');
  await ev(page, () => { localStorage.clear(); FF.Storage.cache = {}; });
  async function playTo(score, diff) {
    await ev(page, d => FF.Game.setSetting('difficulty', d), diff);
    await ev(page, () => FF.Game.startGame());
    await page.keyboard.press('Space'); await page.waitForTimeout(30);
    await ev(page, s => { FF.debug.world.score = s; }, score);
    await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 6000 });
    await page.waitForTimeout(100);
    return ev(page, () => ({ best: document.getElementById('overBest').textContent, score: document.getElementById('overScore').textContent, isNew: !document.getElementById('newBest').classList.contains('hidden') }));
  }
  let r = await playTo(3, 'easy');
  check('best: first score on easy → NEW! badge', r.isNew && r.best === '3' && r.score === '3', r);
  await shot(page, '11_new_best');
  r = await playTo(2, 'easy');
  check('best: lower score → no badge, best stays', !r.isNew && r.best === '3', r);
  r = await playTo(1, 'normal');
  check('best: saved per difficulty (normal independent of easy)', r.isNew && r.best === '1', r);
  r = await playTo(0, 'hard');
  check('best: score 0 never shows NEW!', !r.isNew, r);
  const stored = await ev(page, () => ({ e: localStorage.getItem('ff:best_easy'), n: localStorage.getItem('ff:best_normal') }));
  check('best: persisted in storage', stored.e === '3' && stored.n === '1', stored);
  await ev(page, () => FF.Game.setSetting('difficulty', 'easy'));
  await page.click('#btnOverMenu'); await page.waitForTimeout(150);
  check('title shows best for the current difficulty', await ev(page, () => document.getElementById('bestTitle').textContent) === '3');
  await ev(page, () => localStorage.clear());
  await page._ctx.close();
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await newPage({}, ctx);
  await boot(page, 'seed=21');
  await ev(page, () => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  await page.click('#btnCustomize'); await page.waitForTimeout(300);
  check('Change Pictures: 7 slots', await ev(page, () => document.querySelectorAll('#slotGrid .slot').length) === 7);
  await shot(page, '12_pictures_empty');
  const files = {
    bird: { name: 'bird.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 240, 'bird') },
    drop: { name: 'drop.png', mimeType: 'image/png', buffer: await makeImage(page, 128, 128, 'drop') },
    turtle: { name: 'turtle.png', mimeType: 'image/png', buffer: await makeImage(page, 400, 240, 'turtle') },
    bg_spring: { name: 'spring.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 1600, 900, 'bg', 'image/jpeg') }
  };
  for (const id of Object.keys(files)) {
    await pickFile(page, slotIdx(id), files[id]);
    await page.waitForFunction(id => FF.Assets.hasCustom(id), id, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
    const tag = await ev(page, i => document.querySelectorAll('#slotGrid .slot')[i].querySelector('.tag').textContent, slotIdx(id));
    check(`picture ${id}: stored, slot shows "Your picture"`, (await ev(page, id => FF.Assets.hasCustom(id), id)) && /Your picture/.test(tag), tag);
  }
  check('picture: toast "Picture saved!"', /saved/i.test(await toastText(page)));
  // Round shape for bird
  await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click();
  await page.waitForTimeout(100);
  check('picture: Round shape stored for bird', await ev(page, () => FF.Storage.get('shape_bird') === 'circle' && FF.Assets.custom.bird.width === FF.Assets.custom.bird.height));
  await shot(page, '13_pictures_custom');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(150);
  // play with custom pictures
  await page.click('#btnPlay'); await page.waitForTimeout(200);
  await ev(page, () => FF.debug.setBot(true, 1));
  await page.waitForTimeout(2500);
  // verify the renderer actually draws custom sprites (cache keys)
  const keys = await ev(page, () => [...FF.Assets._cache.keys()].filter(k => k.startsWith('custom:')).map(k => k.split('|')[0]));
  check('render: custom bird / drop / turtle / spring background drawn', ['custom:bird', 'custom:drop', 'custom:turtle', 'custom:bg_spring'].every(k => keys.includes(k)), [...new Set(keys)]);
  // pixel probe: bird area must contain the magenta custom colour (bird is round sticker)
  const px = await ev(page, () => {
    const c = document.getElementById('game'), g = c.getContext('2d'), b = FF.debug.world.bird, k = FF.Game.renderer.px;
    const d = g.getImageData(Math.round((b.x - 40) * k), Math.round((b.y - 40) * k), Math.round(80 * k), Math.round(80 * k)).data;
    let m = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 170) m++;
    return m;
  });
  check('render: custom bird pixels visible on canvas', px > 50, 'magenta px=' + px);
  await shot(page, '14_play_custom_round');
  // Persistence after reload
  await page.reload(); await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  const persisted = await ev(page, () => ['bird', 'drop', 'turtle', 'bg_spring'].map(id => FF.Assets.hasCustom(id)));
  check('pictures persist after reload', persisted.every(Boolean), persisted);
  check('shape persists after reload (Round bird)', await ev(page, () => FF.Assets.custom.bird.width === FF.Assets.custom.bird.height && FF.Storage.get('shape_bird') === 'circle'));
  // Per-slot reset
  await page.click('#btnCustomize'); await page.waitForTimeout(250);
  await page.locator('#slotGrid .slot').nth(1).locator('[data-act=reset]').click();
  await page.waitForTimeout(100);
  check('per-slot Reset: drop back to original, others kept', await ev(page, () => !FF.Assets.hasCustom('drop') && FF.Assets.hasCustom('bird') && !localStorage.getItem('ff:img_drop')));
  // non-image file
  await pickFile(page, slotIdx('turtle'), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  await page.waitForTimeout(250);
  const t1 = await toastText(page);
  check('non-image file: friendly toast, existing picture kept', /picture file/i.test(t1) && await ev(page, () => FF.Assets.hasCustom('turtle')), t1);
  // corrupt "image"
  await pickFile(page, slotIdx('drop'), { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  await page.waitForTimeout(400);
  const t2 = await toastText(page);
  check('corrupt image: friendly toast, nothing breaks', /could not be opened/i.test(t2) && !(await ev(page, () => FF.Assets.hasCustom('drop'))), t2);
  // SVG without width/height
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#0c0"/></svg>');
  await pickFile(page, slotIdx('drop'), { name: 'drop.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.waitForTimeout(500);
  const svgDim = await ev(page, () => FF.Assets.custom.drop ? [FF.Assets.custom.drop.width, FF.Assets.custom.drop.height] : null);
  check('SVG picture without width/height is accepted at a usable size', svgDim && svgDim[0] >= 64 && svgDim[1] >= 64, svgDim);
  // very large image → downscaled
  const big = await makeImage(page, 4000, 3000, 'bird');
  await pickFile(page, slotIdx('bird'), { name: 'huge.png', mimeType: 'image/png', buffer: big });
  await page.waitForFunction(() => FF.Assets.customSrc.bird && FF.Assets.customSrc.bird.naturalWidth <= 512, null, { timeout: 15000 }).catch(() => {});
  const dim = await ev(page, () => ({ w: FF.Assets.customSrc.bird.naturalWidth, h: FF.Assets.customSrc.bird.naturalHeight, len: (localStorage.getItem('ff:img_bird') || '').length }));
  check('4000×3000 character picture downscaled to ≤512 px and stored', dim.w <= 512 && dim.h <= 512 && dim.w >= 480 && dim.len > 1000, dim);
  const bigBg = await makeImage(page, 4000, 3000, 'bg', 'image/jpeg');
  await pickFile(page, slotIdx('bg_winter'), { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: bigBg });
  await page.waitForFunction(() => FF.Assets.customSrc.bg_winter, null, { timeout: 15000 }).catch(() => {});
  const dimBg = await ev(page, () => ({ w: FF.Assets.customSrc.bg_winter.naturalWidth, h: FF.Assets.customSrc.bg_winter.naturalHeight, len: (localStorage.getItem('ff:img_bg_winter') || '').length }));
  check('4000×3000 background downscaled to ≤1280×720 and stored', dimBg.w <= 1280 && dimBg.h <= 720 && dimBg.len > 1000, dimBg);
  // Reset all
  await page.click('#btnResetAll'); await page.waitForTimeout(150);
  check('Reset all: every slot back to original + storage cleared', await ev(page, () => FF.Assets.SLOTS.every(s => !FF.Assets.hasCustom(s.id)) && Object.keys(localStorage).filter(k => k.startsWith('ff:img_')).length === 0));
  check('Reset all: tags say Original', await ev(page, () => [...document.querySelectorAll('#slotGrid .tag')].every(t => /Original/.test(t.textContent))));

  // storage quota: four big photo-like (noisy) backgrounds + three characters
  for (const id of ['bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter']) {
    await pickFile(page, slotIdx(id), { name: id + '.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 1920, 1080, 'noise', 'image/jpeg') });
    await page.waitForFunction(id => FF.Assets.hasCustom(id), id, { timeout: 15000 }).catch(() => {});
  }
  for (const id of ['bird', 'drop', 'turtle']) {
    await pickFile(page, slotIdx(id), { name: id + '.png', mimeType: 'image/png', buffer: await makeImage(page, 640, 640, 'noise') });
    await page.waitForFunction(id => FF.Assets.hasCustom(id), id, { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
  const before = await ev(page, () => FF.Assets.SLOTS.map(s => FF.Assets.hasCustom(s.id)));
  const sizes = await ev(page, () => FF.Assets.SLOTS.map(s => (FF.Storage.get('img_' + s.id) || '').length));
  const lastToast = await toastText(page);
  info('7 photo-like pictures, data URL lengths: ' + sizes.join(', ') + ' (total ' + sizes.reduce((a, b) => a + b, 0) + ' chars), last toast "' + lastToast + '"');
  await page.reload(); await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  const after = await ev(page, () => FF.Assets.SLOTS.map(s => FF.Assets.hasCustom(s.id)));
  check('7 large photo pictures all survive reload (no silent loss when browser storage is full)', after.every(Boolean), { before, after });
  check('pictures: no errors', page._errors.length === 0, page._errors.join(' | '));
  await ev(page, () => localStorage.clear());
  await ctx.close();
}

async function testLayout() {
  const vps = [[800, 600], [1920, 1080], [1366, 768], [2560, 1440], [1280, 720], [1024, 768]];
  for (const dsf of [1, 1.5]) {
    for (const [w, h] of vps) {
      const page = await newPage({ viewport: { width: w, height: h }, dsf });
      await boot(page, 'seed=1');
      const tag = `${w}x${h}@${dsf}`;
      const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top, bw: c.width, bh: c.height }; });
      const aspect = cv.w / cv.h;
      const fits = cv.w <= w + 1 && cv.h <= h + 1 && (Math.abs(cv.w - w) < 2 || Math.abs(cv.h - h) < 2);
      const centered = Math.abs(cv.l - (w - cv.w) / 2) < 2 && Math.abs(cv.t - (h - cv.h) / 2) < 2;
      check(`layout ${tag}: canvas letterboxed 16:9, fills one axis, centred`, Math.abs(aspect - 16 / 9) < 0.01 && fits && centered, cv);
      check(`layout ${tag}: backing store = css size × dpr`, Math.abs(cv.bw - cv.w * dsf) < 2 && Math.abs(cv.bh - cv.h * dsf) < 2, [cv.bw, cv.bh]);
      const issues = [];
      for (const scr of ['scrTitle', 'scrSettings', 'scrCustom', 'scrHow', 'scrPause', 'scrOver']) {
        await ev(page, s => {
          if (s === 'scrPause') { FF.Game.startGame(); FF.Game.pause(); }
          else if (s === 'scrOver') { FF.Game.startGame(); FF.Game.flapInput(); FF.debug.world.bird.y = 460; FF.debug.setSpeed(8); }
          else { FF.Game.mode = 'title'; FF.UI.show(s); }
        }, scr);
        if (scr === 'scrOver') { await page.waitForFunction(() => FF.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {}); await ev(page, () => FF.debug.setSpeed(1)); }
        await page.waitForTimeout(400);
        const r = await layoutReport(page);
        if (r.bad.length || (r.hidden && r.hidden.length)) issues.push(scr + ': ' + r.bad.concat(r.hidden.map(x => 'below-fold:' + x)).join('; ') + (r.overflow ? ' (panel scrolls)' : ''));
        if ((w === 800 || w === 2560) && dsf === 1) await shot(page, `15_layout_${w}x${h}_${scr}`);
      }
      check(`layout ${tag}: every menu fits inside the window (no clipped / scrolled-away buttons)`, issues.length === 0, issues.join(' | '));
      check(`layout ${tag}: no errors`, page._errors.length === 0, page._errors.join(' | '));
      await page._ctx.close();
    }
  }
  // live resize while playing
  const page = await newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, 'seed=1&autostart=1&bot=1');
  for (const [w, h] of [[800, 600], [1920, 1080], [500, 900], [1280, 720]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250); }
  const cv = await ev(page, () => { const r = document.getElementById('game').getBoundingClientRect(); return [r.width, r.height]; });
  check('live resize while playing keeps 16:9 canvas and no errors', Math.abs(cv[0] / cv[1] - 16 / 9) < 0.01 && page._errors.length === 0, { cv, errors: page._errors });
  await page._ctx.close();
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => { window._starts = 0; const o = FF.Game.startGame.bind(FF.Game); FF.Game.startGame = function () { window._starts++; return o(); }; });
  await page.waitForTimeout(100);
  const f = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on title with Play focused starts exactly once', await ev(page, () => window._starts) === 1 && (await mode(page)) === 'ready', 'focused=' + f);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('focus: the next Space is a flap (ready→playing), not a restart', await ev(page, () => window._starts) === 1 && (await mode(page)) === 'playing');
  // Enter on focused Play
  await ev(page, () => { FF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on focused Play starts exactly once', await ev(page, () => window._starts) === 1);
  // Space while Settings button has focus
  await ev(page, () => { FF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.focus('#btnSettings');
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  const r = await ev(page, () => ({ starts: window._starts, ui: FF.UI.current, mode: FF.debug.mode }));
  check('focus: Space on a focused title button activates THAT button (not Play)', r.starts === 0 && r.ui === 'scrSettings', r);
  // Space in Settings toggles focused control without starting a game
  await ev(page, () => { FF.Game.toTitle(); FF.UI.open('scrSettings', 'scrTitle'); window._starts = 0; }); await page.waitForTimeout(100);
  await page.focus('#setSfx');
  const sfx0 = await ev(page, () => FF.Game.settings.sfx);
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  check('focus: Space on a settings toggle toggles it, no game start', await ev(page, () => window._starts) === 0 && (await ev(page, () => FF.Game.settings.sfx)) === !sfx0);
  await ev(page, s => FF.Game.setSetting('sfx', s), sfx0);
  // Play by mouse then Space → must flap, Play button must not keep focus
  await ev(page, () => { FF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(100);
  const act = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('focus: after clicking Play, Space flaps (no second start)', await ev(page, () => window._starts) === 1 && (await mode(page)) === 'playing', 'activeElement=' + act);
  // Restart from pause via keyboard: Enter on focused Resume
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const pa = await ev(page, () => FF.debug.mode + '/' + (document.activeElement && document.activeElement.id));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter on pause screen activates focused Resume', (await mode(page)) === 'playing', pa + ' → ' + await mode(page));
  check('focus: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'seed=77&speed=16&bot=1&skill=0.5&autostart=1&autorestart=1');
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(Math.min(10000, LONG_RUN_S * 1000 / 6));
    samples.push(await ev(page, () => {
      const G = FF.Game, w = G.world;
      return { t: Math.round((performance.now()) / 1000), mode: G.mode, games: G.stats.games, score: w.score, season: w.seasonIndex,
        drops: w.drops.length, turtles: w.turtles.length, particles: G.weather.particles.length, fx: G.renderer.fx.length, texts: G.renderer.texts.length,
        cache: FF.Assets._cache.size, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, errors: G.stats.errors.length };
    }));
    info('long run ' + JSON.stringify(samples[samples.length - 1]));
  }
  const st = await ev(page, () => FF.Game.stats);
  const lastSeason = await ev(page, () => FF.debug.world.seasonIndex);
  const maxOf = k => Math.max(...samples.map(s => s[k]));
  info(`long run: ${st.games} games, scores ${JSON.stringify(st.scores.slice(0, 30))}, max season idx ${Math.max(0, ...st.seasonsReached)}`);
  check('long run: no errors (page / console / frame loop)', page._errors.length === 0 && st.errors.length === 0, page._errors.concat(st.errors).slice(0, 5).join(' | '));
  check('long run: entities bounded (drops ≤ 12, turtles ≤ 6, particles ≤ 200)', maxOf('drops') <= 12 && maxOf('turtles') <= 6 && maxOf('particles') <= 200, { drops: maxOf('drops'), turtles: maxOf('turtles'), particles: maxOf('particles') });
  check('long run: renderer effects bounded (fx ≤ 300, texts ≤ 30)', maxOf('fx') <= 300 && maxOf('texts') <= 30, { fx: maxOf('fx'), texts: maxOf('texts') });
  check('long run: sprite cache bounded (≤ 200 entries)', maxOf('cache') <= 200, maxOf('cache'));
  if (samples[0].heapMB != null && samples.length > 2) {
    const h1 = samples[1].heapMB, hN = samples[samples.length - 1].heapMB;
    check('long run: JS heap does not keep growing (< +40 MB)', hN - h1 < 40, { from: h1, to: hN });
  }
  check('long run: bot played and restarted games', st.games >= 1 || samples.some(s => s.score > 10), { games: st.games });
  check('long run: at least one season change reached', st.seasonsReached.some(x => x > 0) || samples.some(s => s.season > 0) || lastSeason > 0, { seasonsReached: st.seasonsReached });
  await ev(page, () => FF.debug.setSpeed(1)); await page.waitForTimeout(300);
  await shot(page, '16_long_run_end');
  await page._ctx.close();
}

/* Emulate the Go host bindings (ffStoreAll / ffStoreSet / ffStoreDel / ffFullscreen / ffQuit) to test app mode. */
async function testNativeBridge() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const disk = JSON.parse(sessionStorage.getItem('fakeDisk') || '{}');
    window._native = { calls: [], fs: [], quit: 0 };
    const save = () => sessionStorage.setItem('fakeDisk', JSON.stringify(disk));
    window.ffStoreAll = async () => Object.assign({}, disk);
    window.ffStoreSet = async (k, v) => { window._native.calls.push(['set', k, v.length]); if (v.length > 12 << 20) return false; disk[k] = v; save(); return true; };
    window.ffStoreDel = async k => { window._native.calls.push(['del', k]); delete disk[k]; save(); return true; };
    window.ffFullscreen = async on => { window._native.fs.push(on); return on; };
    window.ffQuit = async () => { window._native.quit++; };
  });
  const page = await newPage({}, ctx);
  await boot(page, 'app=1&seed=3');
  check('app mode: native store detected', await ev(page, () => FF.Storage.native === true));
  check('app mode: Quit button visible', await visible(page, '#btnQuit'));
  await ev(page, () => FF.Game.setSetting('difficulty', 'easy'));
  check('app mode: settings written through ffStoreSet, not localStorage', await ev(page, () => window._native.calls.some(c => c[0] === 'set' && c[1] === 'settings') && !localStorage.getItem('ff:settings')));
  await page.click('#btnCustomize'); await page.waitForTimeout(200);
  await pickFile(page, slotIdx('bird'), { name: 'b.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 300, 'bird') });
  await page.waitForFunction(() => FF.Assets.hasCustom('bird'), null, { timeout: 5000 }).catch(() => {});
  await page.reload(); await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  check('app mode: picture + settings reload from the native store', await ev(page, () => FF.Assets.hasCustom('bird') && FF.Game.settings.difficulty === 'easy'));
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  const fsr = await ev(page, () => ({ calls: window._native.fs, flag: FF.Game.fullscreen }));
  check('app mode: F11 toggles native fullscreen on/off', JSON.stringify(fsr.calls) === '[true,false]' && fsr.flag === false, fsr);
  await page.click('#btnQuit'); await page.waitForTimeout(100);
  check('app mode: Quit calls ffQuit', await ev(page, () => window._native.quit === 1));
  check('app mode: no errors', page._errors.length === 0, page._errors.join(' | '));
  await ctx.close();
}

(async () => {
  browser = await chromium.launch();
  const suites = [testBootAndTitle, testReadyFlapDeath, testDropsScoring, testSeasons, testPause, testSettings, testBestScores, testCustomPictures, testNativeBridge, testFocus, testLayout, testLongRun];
  const only = args.find(a => a.startsWith('--only='));
  for (const s of suites) {
    if (only && !only.slice(7).split(',').some(n => s.name.toLowerCase().includes(n.toLowerCase()))) continue;
    console.log('\n== ' + s.name);
    try { await s(); } catch (e) { check(s.name + ' crashed', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' ')); }
  }
  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed, ${fails.length} failed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
