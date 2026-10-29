// Foxy's Reef Memory — functional end-to-end suite (Chromium via Playwright).
// usage: node tests/e2e/functional.js [baseUrl] [--quick] [--only=name1,name2]
//   baseUrl defaults to http://127.0.0.1:8791/index.html  (serve game/ with: python3 -m http.server 8791)
//   --quick shortens the long bot run (20 s instead of 150 s)
// Prints PASS/FAIL per check, writes screenshots to tests/out/functional/, exits 1 on any FAIL.
// Structure and helpers are reused from projects/flappy/tests/e2e/functional.js.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8791/index.html';
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
  await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode && RF.debug.mode !== 'boot', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const mode = page => ev(page, () => RF.debug.mode);
const wstate = page => ev(page, () => RF.debug.world.state);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function visible(page, sel) {
  return ev(page, s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('.hidden') && r.width > 0 && r.height > 0; }, sel);
}

/* Freeze sim time (speed 0) so tests can set things up deterministically; advance with simStep(). */
const freeze = page => ev(page, () => RF.debug.setSpeed(0));
const unfreeze = (page, s = 1) => ev(page, s => RF.debug.setSpeed(s), s);
/* Advance the whole game (bot, world, events, weather, game-over check) by `sec` of sim time in 1/60 s steps. */
const simStep = (page, sec) => ev(page, sec => { const G = RF.Game; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) G.step(1 / 60); G.renderer.update(sec); }, sec);
/* Run the intro (banner + deal [+ peek]) until the world is 'playing'. Returns sim seconds it took. */
const toPlaying = page => ev(page, () => { const G = RF.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.update(1 / 60); return i / 60; });
/* Step until a predicate on the world is true (max sec). */
const stepUntil = (page, src, max = 10) => ev(page, ({ src, max }) => { const G = RF.Game; const f = new Function('w', 'G', 'return (' + src + ')'); let i = 0; while (!f(G.world, G) && i++ < max * 60) G.step(1 / 60); G.renderer.update(1 / 60); return i / 60; }, { src, max });

/* Log the events the world emits (wrap handleEvents). */
async function hookEvents(page) {
  await ev(page, () => {
    if (window._evHooked) { window._evLog.length = 0; return; }
    window._evLog = []; window._evHooked = true;
    const G = RF.Game;
    const orig = G.handleEvents.bind(G);
    G.handleEvents = function (evts) { for (const e of evts) window._evLog.push(Object.assign({}, e, { _mode: G.mode })); return orig(evts); };
  });
}
const evLog = (page, type) => ev(page, t => window._evLog.filter(e => !t || e.type === t), type);
const clearLog = page => ev(page, () => { if (window._evLog) window._evLog.length = 0; });

/* Log every World.select() call made by the game (id + result) — attached to the current world. */
async function hookSelect(page) {
  await ev(page, () => {
    const w = RF.debug.world;
    window._sel = [];
    if (w._selHooked) return;
    w._selHooked = true;
    const o = w.select.bind(w);
    w.select = id => { const r = o(id); window._sel.push({ id, r }); return r; };
  });
}

/* Screen (client) coords of a card centre, from its logical x,y and the canvas bounding rect. */
async function cardXY(page, id, dx = 0, dy = 0) {
  return ev(page, ({ id, dx, dy }) => {
    const c = RF.debug.world.card(id), r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (c.x + dx) / 960 * r.width, y: r.top + (c.y + dy) / 540 * r.height };
  }, { id, dx, dy });
}
async function clickCard(page, id, dx, dy) { const p = await cardXY(page, id, dx, dy); await page.mouse.click(p.x, p.y); return p; }
async function clickLogical(page, x, y) {
  const p = await ev(page, ({ x, y }) => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + x / 960 * r.width, y: r.top + y / 540 * r.height }; }, { x, y });
  await page.mouse.click(p.x, p.y);
}
/* face → [ids] of face-down live cards */
const facesDown = page => ev(page, () => { const by = {}; RF.debug.world.cards.filter(c => c.state === 'down').forEach(c => (by[c.face] = by[c.face] || []).push(c.id)); return by; });
const cardInfo = (page, id) => ev(page, id => { const c = RF.debug.world.card(id); return c && { id: c.id, face: c.face, col: c.col, row: c.row, x: c.x, y: c.y, state: c.state, moving: c.moving, flip: c.flip }; }, id);
const toastText = page => ev(page, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });

/* Create an image file inside the page: canvas → Blob → bytes. */
async function makeImage(page, w, h, kind, fmt = 'image/png') {
  const arr = await ev(page, async ({ w, h, kind, fmt }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (kind === 'noise') {
      const d = g.createImageData(w, h);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    } else if (kind === 'green' || kind === 'blue') {          // solid opaque card back
      g.fillStyle = kind === 'green' ? '#00ff00' : '#0000ff'; g.fillRect(0, 0, w, h);
    } else if (kind === 'bg') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe600'); gr.addColorStop(1, '#ff8800');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1133aa'; for (let i = 0; i < 12; i++) g.fillRect(i * w / 12, h * 0.6, w / 24, h * 0.4);
    } else {                                                   // transparent cut-out: coloured ellipse with an eye
      const col = { hero: '#ff2bd6', treat: '#00e5ff' }[kind] || '#888';
      g.clearRect(0, 0, w, h);
      g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.62, h * 0.4, Math.min(w, h) * 0.1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(w * 0.64, h * 0.4, Math.min(w, h) * 0.05, 0, Math.PI * 2); g.fill();
    }
    const blob = await new Promise(r => c.toBlob(r, fmt, 0.95));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { w, h, kind, fmt });
  return Buffer.from(arr);
}

/* Use the real UI path: click "Choose…" on a slot, answer the file chooser (hidden #filePick). */
async function pickFile(page, slotIndex, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('#slotGrid .slot').nth(slotIndex).locator('[data-act=pick]').click()
  ]);
  await chooser.setFiles(file);
}
const SLOT_IDS = ['hero', 'treat', 'cardback', 'bg_spring', 'bg_summer', 'bg_autumn', 'bg_winter'];
const slotIdx = id => SLOT_IDS.indexOf(id);

/* All visible buttons of the current screen fully inside the viewport and not scrolled away. */
async function layoutReport(page) {
  return ev(page, () => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const scr = RF.UI.current && document.getElementById(RF.UI.current);
    if (!scr) return { bad: ['no screen'], overflow: false, hidden: [] };
    const btns = [...scr.querySelectorAll('button, .set, .slot')].filter(b => b.offsetParent !== null);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5)
        bad.push((b.id || b.className || b.tagName) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    const panel = scr.querySelector('.panel');
    let overflow = false; const hidden = [];
    if (panel) {
      overflow = panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1;
      const pr = panel.getBoundingClientRect();
      for (const b of btns) { const r = b.getBoundingClientRect(); if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) hidden.push(b.id || b.textContent.trim().slice(0, 20)); }
    }
    return { bad, overflow, hidden };
  });
}

/* Count pixels in a logical-rect of the canvas matching a colour predicate (as source string). Also returns the centroid. */
const probe = (page, x, y, w, h, pred) => ev(page, ({ x, y, w, h, pred }) => {
  const c = document.getElementById('game'), g = c.getContext('2d'), k = c.width / 960;
  const X = Math.max(0, Math.round(x * k)), Y = Math.max(0, Math.round(y * k)), W = Math.round(w * k), H = Math.round(h * k);
  const d = g.getImageData(X, Y, W, H).data, f = new Function('r', 'g', 'b', 'return ' + pred);
  let n = 0, sx = 0, sy = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) if (f(d[i], d[i + 1], d[i + 2])) { n++; sx += p % W; sy += Math.floor(p / W); }
  return { n, cx: n ? x + sx / n / k : null, cy: n ? y + sy / n / k : null };
}, { x, y, w, h, pred });

/* Kill the current round (air → 0) and wait for the game-over panel (needs speed > 0). */
async function dieAndWaitOver(page) {
  await ev(page, () => { const G = RF.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.world.air = 0.001; });
  await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 8000 });
}

/* =============================== TESTS =============================== */

async function testBootAndScreens() {
  const page = await newPage();
  await boot(page, 'seed=42');
  check('boot: reaches title mode', (await mode(page)) === 'title');
  for (const [id, label] of [['btnPlay', 'Play'], ['btnCustomize', 'Change Pictures'], ['btnHow', 'How to Play'], ['btnSettings', 'Settings']]) {
    const txt = await ev(page, id => document.getElementById(id).textContent, id);
    check(`title: "${label}" button visible`, (await visible(page, '#' + id)) && txt.includes(label), txt.trim());
  }
  check('title: Quit hidden in browser mode', !(await visible(page, '#btnQuit')));
  check('title: HUD hidden on title', !(await visible(page, '#btnPause')));
  check('title: best score line shown', (await visible(page, '#bestTitle')) && /^\d+$/.test(await ev(page, () => document.getElementById('bestTitle').textContent)));
  const t0 = await ev(page, () => ({ t: RF.debug.world.time, fx: RF.debug.world.fox.x }));
  await page.waitForTimeout(1500);
  const t1 = await ev(page, () => ({ t: RF.debug.world.time, fx: RF.debug.world.fox.x, p: RF.debug.weather.particles.length }));
  check('title: reef + Foxy animate behind the menu', t1.t > t0.t + 1 && t1.fx !== t0.fx && t1.p > 20, { t0, t1 });
  await shot(page, '01_title');
  // How to play
  await page.click('#btnHow'); await page.waitForTimeout(350);
  check('How to Play opens', await ev(page, () => RF.UI.current === 'scrHow'));
  await shot(page, '02_how');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('How to Play: Esc goes back to title', await ev(page, () => RF.UI.current === 'scrTitle'));
  await page.click('#btnHow'); await page.waitForTimeout(250);
  await page.click('#scrHow .btn-back'); await page.waitForTimeout(150);
  check('How to Play: "OK, let\'s dive!" goes back to title', await ev(page, () => RF.UI.current === 'scrTitle'));
  // Settings
  await page.click('#btnSettings'); await page.waitForTimeout(300);
  check('Settings opens with sound/music/difficulty/peek/fullscreen/reset', await ev(page, () => RF.UI.current === 'scrSettings' &&
    ['setSfx', 'setMusic', 'setDifficulty', 'setPeek', 'setFull', 'btnResetBest'].every(id => document.getElementById(id))));
  await shot(page, '03_settings');
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('Settings: Done goes back to title', await ev(page, () => RF.UI.current === 'scrTitle'));
  // Customise
  await page.click('#btnCustomize'); await page.waitForTimeout(300);
  const slots = await ev(page, () => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent));
  check('Change Pictures: 7 slots (hero, treat, card back, 4 seasons)', slots.length === 7, slots);
  await shot(page, '04_pictures');
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  check('Change Pictures: Esc goes back to title', await ev(page, () => RF.UI.current === 'scrTitle'));
  check('boot/screens: zero console errors / page errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testPlayIntro() {
  const page = await newPage();
  await boot(page, 'seed=7');
  const defPeek = await ev(page, () => RF.Game.settings.peek);
  info('default Peek setting = ' + defPeek + ' s');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await hookEvents(page);
  await page.click('#btnPlay'); await freeze(page);
  let s = await ev(page, () => ({ mode: RF.debug.mode, state: RF.debug.world.state, phase: RF.debug.world.phase, banner: !!RF.Game.renderer.banner,
    alpha: Math.max(...RF.debug.world.cards.map(c => c.alpha)), n: RF.debug.world.cards.length, season: RF.debug.world.season }));
  check('Play → mode playing, world ready/deal, Spring 12 cards', s.mode === 'playing' && s.state === 'ready' && s.phase === 'deal' && s.n === 12 && s.season === 0, s);
  check('Play → season intro banner showing, cards not yet dealt', s.banner && s.alpha === 0, s);
  check('Play → HUD (pause/mute) visible', await visible(page, '#btnPause') && await visible(page, '#btnMuteHud'));
  await shot(page, '05_intro_banner');
  // clicking cards' cell positions during the deal does nothing
  await simStep(page, 1.45);
  await ev(page, () => RF.Game.renderer.draw('playing'));
  await shot(page, '06_deal');
  await hookSelect(page);
  const firstId = await ev(page, () => RF.debug.world.cards[0].id);
  const cell = await ev(page, () => RF.debug.world.cellPos(0, 0));
  await clickLogical(page, cell.x, cell.y);
  const stDeal = await ev(page, () => ({ state: RF.debug.world.state, up: RF.debug.world.cards.filter(c => c.state !== 'down').length }));
  check('deal: clicking a card during the intro/deal does not flip it', stDeal.up === 0, stDeal);
  const dt = 1.45 + await toPlaying(page);
  check('intro (~1.2 s) + deal (~0.9 s) → playing after ≈2.1 s of game time (peek off)', dt > 1.95 && dt < 2.3, dt.toFixed(2) + ' s');
  await unfreeze(page);
  const lay = await ev(page, () => RF.debug.world.cards.every(c => { const p = RF.debug.world.cellPos(c.col, c.row); return Math.abs(c.x - p.x) < 0.01 && Math.abs(c.y - p.y) < 0.01 && c.alpha === 1 && c.flip === 0; }));
  check('deal: every card landed face-down on its cell', lay);
  const evs = (await evLog(page)).map(e => e.type);
  check('events: season + deal + play emitted', ['season', 'deal', 'play'].every(t => evs.includes(t)), evs);
  await page.waitForTimeout(300);
  await shot(page, '07_playing');
  check('intro: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testMouseCards() {
  const page = await newPage();
  await boot(page, 'seed=3');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await page.click('#btnPlay');
  await freeze(page);
  await toPlaying(page);
  await hookEvents(page); await hookSelect(page);
  let by = await facesDown(page);
  const faces = Object.keys(by);
  const [a, b] = by[faces[0]];
  // flip with real mouse clicks
  await clickCard(page, a);
  let ca = await cardInfo(page, a);
  check('mouse: clicking a card flips it (state up)', ca.state === 'up', ca);
  await simStep(page, 0.1);
  await clickCard(page, a);
  check('mouse: clicking the same open card again does nothing', (await ev(page, () => RF.debug.world.open.length)) === 1);
  await clickLogical(page, 120, 300);   // water / Foxy area
  check('mouse: clicking empty water does not flip anything', (await ev(page, () => RF.debug.world.open.length)) === 1);
  await simStep(page, 0.2);
  ca = await cardInfo(page, a);
  check('flip: 0.18 s flip animation finished (flip=1)', ca.flip === 1, ca.flip);
  // match
  await ev(page, () => { const w = RF.debug.world; w.air = w.airMax - 10; });
  const s0 = await ev(page, () => ({ score: RF.debug.world.score, air: RF.debug.world.air }));
  await clickCard(page, b);
  // a click between the 2nd flip and the judgement is ignored
  const c3 = by[faces[1]][0];
  await simStep(page, 0.05);
  await clickCard(page, c3);
  check('3rd click while the pair is still flipping is ignored', (await cardInfo(page, c3)).state === 'down');
  await simStep(page, 0.2);
  let m = await evLog(page, 'match');
  const s1 = await ev(page, () => ({ score: RF.debug.world.score, combo: RF.debug.world.combo, air: RF.debug.world.air, matches: RF.debug.world.matches }));
  check('match: event fired with +10, combo 1', m.length === 1 && m[0].points === 10 && m[0].combo === 1, m);
  check('match: score +10 and combo 1', s1.score === s0.score + 10 && s1.combo === 1, { s0, s1 });
  check('match: air refilled by airPerMatch (3 s)', Math.abs(s1.air - (s0.air + 3 - 0.25)) < 0.1, { before: s0.air, after: s1.air });
  await simStep(page, 0.05);
  await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, '08_match_glow');
  await simStep(page, 0.7);
  const gone = await ev(page, ids => ids.map(id => RF.debug.world.card(id).state), [a, b]);
  const cup = await ev(page, () => RF.debug.world.cupcakes.filter(c => c.alive).length);
  check('match: both cards pop and become gone', gone.every(x => x === 'gone'), gone);
  check('match: a cupcake is released', cup === 1 && (await evLog(page, 'cupcake')).length === 1, cup);
  await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, '09_cupcake');
  const fx0 = await ev(page, () => ({ x: RF.debug.world.fox.x, y: RF.debug.world.fox.y }));
  const tEat = await stepUntil(page, 'w.cupcakesEaten >= 1', 12);
  const eat = await ev(page, () => ({ eaten: RF.debug.world.cupcakesEaten, frame: RF.debug.world.fox.frame, x: RF.debug.world.fox.x, y: RF.debug.world.fox.y }));
  check('cupcake: Foxy swims to it and eats it (counter +1, eat frame)', eat.eaten === 1 && eat.frame === 'eat', Object.assign({ t: tEat.toFixed(2) }, eat));
  check('cupcake: Foxy moved to fetch (no teleport, eaten after 1–6 s)', tEat > 0.8 && tEat < 6 && Math.hypot(eat.x - fx0.x, eat.y - fx0.y) > 20, { from: fx0, tEat });
  // second consecutive match → combo 2, +20
  by = await facesDown(page);
  const p2 = Object.values(by)[0];
  await clickCard(page, p2[0]); await simStep(page, 0.05); await clickCard(page, p2[1]); await simStep(page, 0.25);
  m = await evLog(page, 'match');
  check('combo: second match in a row → combo 2, +20', m.length === 2 && m[1].combo === 2 && m[1].points === 20, m.map(x => [x.combo, x.points]));
  await simStep(page, 1.5);
  // mismatch
  by = await facesDown(page);
  let fs_ = Object.keys(by);
  const [c, d] = [by[fs_[0]][0], by[fs_[1]][0]];
  await clickCard(page, c); await simStep(page, 0.05); await clickCard(page, d); await simStep(page, 0.25);
  const mm = await evLog(page, 'mismatch');
  const st = await ev(page, () => ({ combo: RF.debug.world.combo, mistakes: RF.debug.world.mistakes, fox: RF.debug.world.fox.frame }));
  check('mismatch: event, combo reset to 0, mistakes 1', mm.length === 1 && st.combo === 0 && st.mistakes === 1, st);
  check('mismatch: Foxy shows the "oops" frame', st.fox === 'oops', st.fox);
  await simStep(page, 0.1);
  await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, '10_mismatch');
  await simStep(page, 0.9);
  let cs = await ev(page, ids => ids.map(id => RF.debug.world.card(id).state), [c, d]);
  check('mismatch: both cards flip back after ~0.8 s', cs.every(x => x === 'down') && (await evLog(page, 'unflip')).length === 1, cs);
  // third click during the mismatch display closes early
  await clickCard(page, c); await simStep(page, 0.05); await clickCard(page, d); await simStep(page, 0.25);
  const e = by[fs_[2]][0];
  await clickCard(page, e);
  cs = await ev(page, ids => ids.map(id => RF.debug.world.card(id).state), [c, d, e]);
  check('3rd click during mismatch: pair closes at once and the new card flips', cs[0] === 'down' && cs[1] === 'down' && cs[2] === 'up', cs);
  // tapping a shown mismatched card only closes the pair
  await simStep(page, 0.2);
  const f = by[fs_[3]][0];
  await clickCard(page, f); await simStep(page, 0.25);   // e + f → mismatch (different faces)
  check('precondition: e/f mismatch showing', !!(await ev(page, () => RF.debug.world._mismatch)));
  await clickCard(page, e);
  cs = await ev(page, ids => ids.map(id => RF.debug.world.card(id).state), [e, f]);
  check('tapping one of the shown mismatched cards just closes the pair (no re-flip)', cs.every(x => x === 'down') && (await ev(page, () => RF.debug.world.open.length)) === 0, cs);
  // HUD shows pairs left
  check('mouse/cards: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testGravity() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  const names = ['spring', 'summer', 'autumn', 'winter'];
  for (let lv = 0; lv < 4; lv++) {
    await ev(page, () => RF.Game.startGame());
    await freeze(page);
    if (lv) await ev(page, lv => RF.debug.gotoLevel(lv), lv);
    await toPlaying(page);
    await hookEvents(page); await hookSelect(page);
    const g = await ev(page, () => Object.assign({ cols: RF.debug.world.cols, rows: RF.debug.world.rows }, RF.debug.world.gravity));
    // pick a card A on the gravity side so its line has to slide; its partner B anywhere
    const pick = await ev(page, g => {
      const w = RF.debug.world;
      const want = c => g.y < 0 ? c.row === 0 : g.y > 0 ? c.row === w.rows - 1 : g.x > 0 ? c.col === w.cols - 1 : g.x < 0 ? c.col === 0 : true;
      const A = w.cards.find(c => want(c) && (g.y ? c.col : c.row) === 1) || w.cards.find(want);
      const B = w.cards.find(c => c.face === A.face && c.id !== A.id);
      return { a: A.id, b: B.id, aCell: [A.col, A.row], bCell: [B.col, B.row] };
    }, g);
    const before = await ev(page, () => RF.debug.world.cards.map(c => [c.id, c.col, c.row]));
    await clickCard(page, pick.a); await simStep(page, 0.05); await clickCard(page, pick.b);
    await stepUntil(page, 'w.cards.filter(c => c.state === "gone").length >= 2', 3);
    const slides = await evLog(page, 'slide');
    const moves = slides.flatMap(s => s.moves);
    const label = `${names[lv]} (gravity ${g.x},${g.y})`;
    if (lv === 1) {
      await simStep(page, 1.5);
      const after = await ev(page, () => RF.debug.world.cards.filter(c => c.state !== 'gone').map(c => [c.id, c.col, c.row]));
      const same = after.every(([id, col, row]) => before.some(b => b[0] === id && b[1] === col && b[2] === row));
      check(`gravity ${label}: still water — no slide, no card changes cell`, slides.length === 0 && same, { slides: slides.length });
      continue;
    }
    const dirOk = moves.length > 0 && moves.every(mv => g.y
      ? (mv.col === mv.fromCol && Math.sign(mv.row - mv.fromRow) === Math.sign(g.y))
      : (mv.row === mv.fromRow && Math.sign(mv.col - mv.fromCol) === Math.sign(g.x)));
    check(`gravity ${label}: cards slide into the gap in the season's direction`, dirOk, moves);
    // mid-slide: real click at a moving card's animated position hits that card (and is refused while moving)
    await simStep(page, 0.15);
    const mv = await ev(page, () => { const k = RF.debug.world.cards.find(c => c.moving); return k && { id: k.id, x: k.x, y: k.y, col: k.col, row: k.row }; });
    if (!mv) { check(`gravity ${label}: a card is visibly moving 0.15 s into the slide`, false); continue; }
    const cell = await ev(page, mv => RF.debug.world.cellPos(mv.col, mv.row), mv);
    check(`gravity ${label}: card is between cells mid-slide (animated, not snapped)`, Math.hypot(mv.x - cell.x, mv.y - cell.y) > 10, { pos: [mv.x, mv.y], target: cell });
    await ev(page, () => { window._sel.length = 0; });
    const hit = await ev(page, mv => RF.debug.world.cardAt(mv.x, mv.y), mv);
    await clickCard(page, mv.id);
    const sel = await ev(page, () => window._sel.slice());
    check(`gravity ${label}: click at the animated position targets the moving card (refused while moving)`, hit === mv.id && sel.length === 1 && sel[0].id === mv.id && sel[0].r === false, { hit, sel });
    await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, `11_slide_${names[lv]}`);
    const tSettle = await stepUntil(page, '!w.cards.some(c => c.moving || c.settling)', 4);
    const snapped = await ev(page, () => RF.debug.world.cards.filter(c => c.state !== 'gone').every(c => { const p = RF.debug.world.cellPos(c.col, c.row); return Math.abs(c.x - p.x) < 0.01 && Math.abs(c.y - p.y) < 0.01; }));
    check(`gravity ${label}: slide settles on the new cells within ~1.3 s`, snapped && tSettle < 1.6, tSettle.toFixed(2) + ' s');
    await clickCard(page, mv.id);
    check(`gravity ${label}: after settling, clicking its NEW position flips it`, (await cardInfo(page, mv.id)).state === 'up');
  }
  check('gravity: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testKeyboard() {
  const page = await newPage();
  await boot(page, 'seed=8');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  check('keyboard: cursor hidden at start', !(await ev(page, () => RF.Game.renderer.showCursor)));
  await page.keyboard.press('ArrowRight');
  let k = await ev(page, () => ({ show: RF.Game.renderer.showCursor, cur: Object.assign({}, RF.debug.world.cursor) }));
  check('keyboard: ArrowRight shows the cursor and moves it right', k.show && k.cur.col === 1 && k.cur.row === 0, k);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  k = await ev(page, () => Object.assign({}, RF.debug.world.cursor));
  check('keyboard: Down/Left move, Left clamps at the edge (no wrap)', k.col === 0 && k.row === 1, k);
  await page.keyboard.press('KeyD'); await page.keyboard.press('KeyW');
  k = await ev(page, () => Object.assign({}, RF.debug.world.cursor));
  check('keyboard: WASD also moves the cursor', k.col === 1 && k.row === 0, k);
  await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, '12_keyboard_cursor');
  await page.keyboard.press('Space');
  const flipped = await ev(page, () => { const w = RF.debug.world; const c = w.cards.find(c => c.col === 1 && c.row === 0); return c.state; });
  check('keyboard: Space flips the card under the cursor', flipped === 'up');
  await simStep(page, 0.3);
  // mouse click hides cursor; next Space only shows it again
  const other = await ev(page, () => RF.debug.world.cards.find(c => c.state === 'down' && c.row === 2).id);
  await clickCard(page, other); await simStep(page, 0.3);
  await simStep(page, 1.2);   // let a mismatch (if any) close
  const open0 = await ev(page, () => RF.debug.world.cards.filter(c => c.state === 'up').length);
  check('keyboard: mouse click hides the cursor', !(await ev(page, () => RF.Game.renderer.showCursor)));
  await page.keyboard.press('Space');
  const r = await ev(page, () => ({ show: RF.Game.renderer.showCursor, up: RF.debug.world.cards.filter(c => c.state === 'up').length }));
  check('keyboard: first Space after a mouse click only shows the cursor (no flip)', r.show && r.up === open0, { open0, r });
  await ev(page, () => { const w = RF.debug.world; const c = w.cards.find(c => c.state === 'down'); w.cursor.col = c.col; w.cursor.row = c.row; });
  await page.keyboard.press('Enter');
  const r2 = await ev(page, () => RF.debug.world.cards.filter(c => c.state === 'up').length);
  check('keyboard: Enter flips the card under the cursor', r2 === open0 + 1, { open0, r2 });
  // held Space (auto-repeat) is ignored
  await simStep(page, 1.5);
  const before = await ev(page, () => RF.debug.world.cards.filter(c => c.state === 'up').length);
  await ev(page, () => { const w = RF.debug.world; const c = w.cards.find(c => c.state === 'down'); w.cursor.col = c.col; w.cursor.row = c.row; });
  await ev(page, () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true })));
  check('keyboard: auto-repeat Space is ignored', before === await ev(page, () => RF.debug.world.cards.filter(c => c.state === 'up').length));
  // cursor skips gone cards
  await ev(page, () => { const w = RF.debug.world; w.cards.filter(c => c.state === 'up').forEach(c => { c.state = 'down'; c._ft = 0; }); w.open = []; w._mismatch = null; });
  const pair = await ev(page, () => { const w = RF.debug.world; const a = w.cards.find(c => c.col === 1 && c.row === 1 && c.state === 'down'); const b = w.cards.find(c => c.face === a.face && c.id !== a.id); return [a.id, b.id]; });
  await ev(page, p => { RF.debug.select(p[0]); RF.debug.select(p[1]); }, pair);
  await stepUntil(page, 'w.cards.filter(c => c.state === "gone").length >= 2 && !w.cards.some(c => c.moving || c.settling)', 4);
  await ev(page, () => { const w = RF.debug.world; w.cursor.col = 0; w.cursor.row = 1; });
  await page.keyboard.press('ArrowRight');
  const sk = await ev(page, () => { const w = RF.debug.world; const c = w.cards.find(c => c.col === w.cursor.col && c.row === w.cursor.row && c.state !== 'gone'); return { cur: Object.assign({}, w.cursor), live: !!c }; });
  check('keyboard: cursor never lands on an empty cell', sk.live, sk);
  check('keyboard: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testAirAndGameOver() {
  const page = await newPage();
  await boot(page, 'seed=12');
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  await hookEvents(page);
  const a0 = await ev(page, () => RF.debug.world.air);
  await simStep(page, 2);
  const a1 = await ev(page, () => RF.debug.world.air);
  check('air: drains 1 s per second while playing', Math.abs((a0 - a1) - 2) < 0.05, { a0, a1 });
  await ev(page, () => { const w = RF.debug.world; w.air = w.airMax * 0.26; });
  await simStep(page, 1);
  const low = await evLog(page, 'airlow');
  const mood = await ev(page, () => RF.debug.world.fox.mood);
  check('air: low-air warning fires below 25 %', low.length === 1, low.length);
  check('air: Foxy looks worried when air is low', mood === 'worried', mood);
  await ev(page, () => RF.Game.renderer.draw('playing')); await shot(page, '13_air_low');
  await ev(page, () => { RF.debug.world.air = 0.3; });
  await unfreeze(page, 1);
  await page.waitForFunction(() => RF.debug.world.state === 'dead', null, { timeout: 3000 });
  const tDead = Date.now();
  const fy0 = await ev(page, () => RF.debug.world.fox.y);
  check('air 0 → world dead, mode still playing during the beat', (await mode(page)) === 'playing');
  await ev(page, () => { window._starts = 0; const o = RF.Game.startGame.bind(RF.Game); RF.Game.startGame = function () { window._starts++; return o(); }; });
  await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 4000 });
  const gap = (Date.now() - tDead) / 1000;
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('game over: Space within the 0.7 s lock is ignored', (await mode(page)) === 'over', 'ms since over=' + await ev(page, () => Math.round(performance.now() - RF.Game.overAt)));
  check('game over panel ~1.2 s after running out of air', gap > 0.9 && gap < 1.9, gap.toFixed(2) + ' s');
  const fy1 = await ev(page, () => RF.debug.world.fox.y);
  check('dead: Foxy floats up to the surface', fy1 < fy0, { fy0, fy1 });
  check('game over panel: Play Again + Menu visible, HUD hidden', (await visible(page, '#btnAgain')) && (await visible(page, '#btnOverMenu')) && !(await visible(page, '#btnPause')));
  const txt = await ev(page, () => document.getElementById('overStats').textContent);
  check('game over panel: stats include pairs, cupcakes, reached season', /Pairs found/.test(txt) && /Cupcakes/.test(txt) && /Spring/.test(txt), txt);
  await shot(page, '14_game_over');
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('game over: Space after lock → Play Again (exactly one start)', (await mode(page)) === 'playing' && await ev(page, () => window._starts) === 1, await ev(page, () => window._starts));
  // Enter
  await dieAndWaitOver(page);
  await page.waitForTimeout(800);
  await ev(page, () => { window._starts = 0; });
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('game over: Enter after lock → Play Again (exactly one start)', (await mode(page)) === 'playing' && await ev(page, () => window._starts) === 1, await ev(page, () => window._starts));
  // Enter within lock with the button focused
  await dieAndWaitOver(page);
  await page.waitForTimeout(100);
  const focused = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  check('game over: Enter within lock ignored (even with Play Again focused)', (await mode(page)) === 'over', 'focused=' + focused);
  await page.waitForTimeout(800);
  await ev(page, () => { window._starts = 0; });
  await page.click('#btnAgain'); await page.waitForTimeout(200);
  check('game over: Play Again button → new round (one start, score 0, Spring)', (await mode(page)) === 'playing' && await ev(page, () => window._starts === 1 && RF.debug.world.score === 0 && RF.debug.world.level === 0));
  // click Play Again within lock
  await dieAndWaitOver(page);
  { const bb = await page.locator('#btnAgain').boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await page.waitForTimeout(60);
  check('game over: Play Again click within lock ignored', (await mode(page)) === 'over');
  await page.waitForTimeout(800);
  await page.click('#btnOverMenu'); await page.waitForTimeout(200);
  check('game over: Menu → title', (await mode(page)) === 'title' && await ev(page, () => RF.UI.current === 'scrTitle'));
  check('air/game over: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testPause() {
  const page = await newPage();
  await boot(page, 'seed=11');
  await page.click('#btnPlay');
  await ev(page, () => RF.debug.setBot(true, 1));
  await page.waitForFunction(() => RF.debug.world.state === 'playing', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  const snap = () => ev(page, () => ({ t: RF.debug.world.time, air: RF.debug.world.air, fx: RF.debug.world.fox.x, fy: RF.debug.world.fox.y,
    p: RF.debug.weather.particles.slice(0, 6).map(p => +(p.x + p.y).toFixed(3)), rt: RF.Game.renderer.time, cards: RF.debug.world.cards.map(c => c.flip + c.x + c.y).join() }));
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} pauses (panel shown, HUD hidden)`, (await mode(page)) === 'paused' && await visible(page, '#btnResume') && !(await visible(page, '#btnPause')));
    const a = await snap(); await page.waitForTimeout(600); const b = await snap();
    check(`pause (${key}): nothing moves (world, air, Foxy, cards, weather, effects)`, JSON.stringify(a) === JSON.stringify(b), { a: a.t, b: b.t });
    await page.keyboard.press(key); await page.waitForTimeout(120);
    check(`pause: ${key} resumes`, (await mode(page)) === 'playing');
  }
  await page.click('#btnPause'); await page.waitForTimeout(150);
  check('pause: HUD pause button pauses', (await mode(page)) === 'paused');
  await shot(page, '15_paused');
  // keys / clicks during pause don't touch the board
  await ev(page, () => RF.debug.setBot(false));
  await hookSelect(page);
  await page.keyboard.press('ArrowRight'); await page.mouse.click(20, 700);
  check('pause: arrows / clicks while paused do not reach the board', (await ev(page, () => window._sel.length)) === 0 && (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(150);
  check('pause: Resume button resumes', (await mode(page)) === 'playing');
  // HUD buttons never flip cards
  await freeze(page);
  await ev(page, () => { window._taps = 0; const o = RF.Game.tapAt.bind(RF.Game); RF.Game.tapAt = (x, y) => { window._taps++; return o(x, y); }; window._sel.length = 0; });
  const m0 = await ev(page, () => RF.Game.settings.muted);
  await page.click('#btnMuteHud'); await page.waitForTimeout(80);
  check('HUD mute button: toggles mute, does not tap the board', (await ev(page, () => RF.Game.settings.muted)) === !m0 && (await ev(page, () => window._taps)) === 0);
  // Space while the mute button still has focus must not also toggle mute via the button
  const focusId = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  check('HUD mute button keeps no hidden focus side-effect: Space does not toggle mute again', (await ev(page, () => RF.Game.settings.muted)) === !m0, 'focused=' + focusId);
  await page.click('#btnMuteHud'); await page.waitForTimeout(50);
  await ev(page, () => { const h = document.getElementById('hud'); h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: h.getBoundingClientRect().left + 5, clientY: h.getBoundingClientRect().top + 5, button: 0 })); });
  check('pointerdown on #hud never reaches tapAt', (await ev(page, () => window._taps)) === 0);
  await page.click('#btnPause'); await page.waitForTimeout(80);
  check('HUD pause button: no card tap', (await ev(page, () => window._taps)) === 0 && (await ev(page, () => window._sel.length)) === 0);
  await page.click('#btnResume'); await unfreeze(page);
  // window blur / tab hidden
  await page.waitForTimeout(100);
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(100);
  check('pause: window blur auto-pauses', (await mode(page)) === 'paused');
  await page.click('#btnResume'); await page.waitForTimeout(100);
  await ev(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(80);
  check('pause: tab hidden auto-pauses', (await mode(page)) === 'paused');
  await ev(page, () => { delete document.hidden; });
  // Settings from pause, back to pause
  await page.click('#btnPauseSettings'); await page.waitForTimeout(150);
  check('pause → Settings opens (still paused)', await ev(page, () => RF.UI.current === 'scrSettings' && RF.debug.mode === 'paused'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  check('Settings (from pause) → Esc returns to the pause screen', await ev(page, () => RF.UI.current === 'scrPause' && RF.debug.mode === 'paused'));
  // Restart
  await ev(page, () => { RF.debug.world.score = 40; });
  await page.click('#btnRestart'); await page.waitForTimeout(200);
  check('pause → Restart: fresh round, score 0, intro again', await ev(page, () => RF.debug.mode === 'playing' && RF.debug.world.score === 0 && RF.debug.world.state === 'ready'));
  // pause during the intro resumes into the intro
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const pr = await ev(page, () => RF.debug.mode + '/' + RF.debug.world.state);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('pause during the intro resumes into the intro', pr === 'paused/ready' && (await mode(page)) === 'playing', pr);
  // pause disabled after death
  await page.waitForFunction(() => RF.debug.world.state === 'playing', null, { timeout: 5000 });
  await ev(page, () => { RF.debug.world.air = 0.001; });
  await page.waitForFunction(() => RF.debug.world.state === 'dead', null, { timeout: 3000 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  const m1 = await mode(page);
  await ev(page, () => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(50);
  const m2 = await mode(page);
  check('pause disabled after death (Esc / blur)', m1 === 'playing' && m2 === 'playing', { m1, m2 });
  await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 4000 }).catch(() => {});
  check('after death the game-over panel still appears', (await mode(page)) === 'over');
  await page.waitForTimeout(800);
  await page.click('#btnAgain'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('#btnPauseMenu'); await page.waitForTimeout(200);
  check('pause → Main Menu → title, music stopped', (await mode(page)) === 'title' && await ev(page, () => RF.UI.current === 'scrTitle' && !RF.Audio._musicPlaying));
  check('pause: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testSettings() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=2');
  await ev(page, () => { localStorage.clear(); });
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  // defaults
  const def = await ev(page, () => Object.assign({}, RF.Game.settings));
  info('default settings ' + JSON.stringify(def));
  // difficulty → RF.DIFFICULTY values applied
  for (const d of ['easy', 'normal', 'hard']) {
    await ev(page, d => RF.Game.setSetting('difficulty', d), d);
    await ev(page, () => RF.Game.startGame());
    const r = await ev(page, d => { const c = RF.debug.world.cfg, D = RF.DIFFICULTY[d], C = RF.CONFIG;
      const keys = ['airMax', 'airPerMatch', 'mismatchShow', 'lapAirMul', 'lapAirMin'];
      const bad = keys.filter(k => JSON.stringify(c[k]) !== JSON.stringify(k in D ? D[k] : C[k]));
      return { bad, airMax: RF.debug.world.airMax, cfgAir: c.airMax[0], peek: c.peekTime }; }, d);
    check(`difficulty ${d}: RF.DIFFICULTY.${d} overrides applied to the new world`, r.bad.length === 0 && r.airMax === r.cfgAir, r);
  }
  // Easy gives the 2-second peek promised in REQUIREMENT.md with the default "Peek at start" setting
  await ev(page, () => { RF.Game.setSetting('difficulty', 'easy'); });   // Peek setting untouched = default
  await ev(page, () => RF.Game.startGame());
  const easyPeek = await ev(page, () => RF.debug.world.cfg.peekTime);
  check('REQUIREMENT: Easy mode starts with a 2-second peek (default settings)', easyPeek >= 2, 'peekTime=' + easyPeek + ' (default Peek setting ' + def.peek + ' s always overrides RF.DIFFICULTY.easy.peekTime=2)');
  // Peek 0–3 respected (incl. Easy), measured in sim time
  for (const diff of ['easy', 'normal']) {
    for (const p of [0, 1, 2, 3]) {
      await ev(page, ({ diff, p }) => { RF.Game.setSetting('difficulty', diff); RF.Game.setSetting('peek', p); RF.Game.startGame(); RF.debug.setSpeed(0); }, { diff, p });
      const r = await ev(page, () => { const G = RF.Game, w = G.world; let peekT = 0, faceUp = 0, i = 0;
        while (w.state !== 'playing' && i++ < 3000) { G.step(1 / 60); if (w.phase === 'peek') peekT += 1 / 60; if (w.cards.every(c => c.flip >= 0.5)) faceUp++; }
        return { peekT: +peekT.toFixed(2), faceUpFrames: faceUp, cfg: w.cfg.peekTime, allDown: w.cards.every(c => c.flip === 0) }; });
      const exp = p === 0 ? r.peekT === 0 && r.faceUpFrames === 0 : Math.abs(r.peekT - (p + 0.18)) < 0.1 && r.faceUpFrames > p * 50;
      check(`peek ${p} s on ${diff}: all cards shown for ${p} s, then face-down before play`, r.cfg === p && exp && r.allDown, r);
      await unfreeze(page);
    }
  }
  await ev(page, () => { RF.Game.setSetting('difficulty', 'normal'); RF.Game.setSetting('peek', 1); RF.Game.toTitle(); });
  // during peek, clicks do nothing
  await ev(page, () => { RF.Game.setSetting('peek', 3); RF.Game.startGame(); RF.debug.setSpeed(0); const G = RF.Game; let i = 0; while (G.world.phase !== 'peek' && i++ < 600) G.step(1 / 60); });
  const pid = await ev(page, () => RF.debug.world.cards[0].id);
  await clickCard(page, pid);
  check('peek: clicking during the peek does not flip / select', await ev(page, () => RF.debug.world.open.length === 0 && RF.debug.world.cards.every(c => c.state === 'down')));
  await ev(page, () => { RF.Game.renderer.draw('playing'); }); await shot(page, '16_peek');
  await unfreeze(page);
  await ev(page, () => { RF.Game.setSetting('peek', 1); RF.Game.toTitle(); });
  await page.waitForTimeout(100);
  // UI path + persistence
  await page.click('#btnSettings'); await page.waitForTimeout(300);
  const sfx0 = await page.isChecked('#setSfx');
  await page.click('label.set:has(#setSfx)');
  await page.click('label.set:has(#setMusic)');
  await page.click('#setDifficulty button[data-v="hard"]');
  await page.click('#setPeek button[data-v="3"]');
  const s1 = await ev(page, () => Object.assign({}, RF.Game.settings));
  check('settings UI: sound / music toggles', s1.sfx === !sfx0 && s1.music === false, s1);
  check('settings UI: difficulty hard + peek 3 highlighted', s1.difficulty === 'hard' && s1.peek === 3 &&
    await ev(page, () => document.querySelector('#setDifficulty .on').dataset.v === 'hard' && document.querySelector('#setPeek .on').dataset.v === '3'));
  check('settings UI: Audio options follow toggles', await ev(page, () => RF.Audio.sfxOn === RF.Game.settings.sfx && RF.Audio.musicOn === RF.Game.settings.music));
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  const s2 = await ev(page, () => Object.assign({}, RF.Game.settings));
  check('settings persist across reload', s2.sfx === s1.sfx && s2.music === s1.music && s2.difficulty === 'hard' && s2.peek === 3, s2);
  await page.click('#btnSettings'); await page.waitForTimeout(250);
  const ui = await ev(page, () => ({ sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked,
    diff: (document.querySelector('#setDifficulty .on') || {}).dataset, peek: (document.querySelector('#setPeek .on') || {}).dataset }));
  check('settings UI reflects persisted values after reload', ui.sfx === s1.sfx && ui.music === s1.music && ui.diff && ui.diff.v === 'hard' && ui.peek && ui.peek.v === '3', ui);
  check('?mute=1 is not persisted as a setting', !(await ev(page, () => JSON.parse(localStorage.getItem('rf:settings')).muted)));
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(100);
  check('settings applied to the next game (hard airMax, peek 3)', await ev(page, () => RF.debug.world.cfg.peekTime === 3 && RF.debug.world.airMax === RF.DIFFICULTY.hard.airMax[0]));
  // Reset best
  await ev(page, () => RF.Game.toTitle());
  await ev(page, () => { RF.Storage.set('best_normal', '17'); RF.Storage.set('best_hard', '9'); RF.Storage.set('best_easy', '4'); });
  await page.click('#btnSettings'); await page.waitForTimeout(200);
  await page.click('#btnResetBest'); await page.waitForTimeout(100);
  check('Reset best clears every difficulty', await ev(page, () => ['easy', 'normal', 'hard'].every(d => RF.Storage.get('best_' + d) == null && !localStorage.getItem('rf:best_' + d))));
  check('Reset best shows a toast', /cleared/i.test(await toastText(page)));
  await page.click('#scrSettings .btn-back'); await page.waitForTimeout(150);
  check('title best refreshed after reset', await ev(page, () => document.getElementById('bestTitle').textContent === '0'));
  // M mute
  await page.click('#btnPlay'); await page.waitForTimeout(150);
  const icon0 = await ev(page, () => document.getElementById('btnMuteHud').innerHTML);
  const m0 = await ev(page, () => RF.Game.settings.muted);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(80);
  const m1 = await ev(page, () => RF.Game.settings.muted);
  check('M toggles mute', m1 === !m0, { m0, m1 });
  check('M updates the HUD mute icon', icon0 !== await ev(page, () => document.getElementById('btnMuteHud').innerHTML));
  check('M shows a toast', /Sound (on|off)/.test(await toastText(page)));
  check('Audio master follows mute', await ev(page, () => RF.Audio.muted === RF.Game.settings.muted));
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  check('mute persists across reload', await ev(page, m1 => RF.Game.settings.muted === m1, m1));
  await page.keyboard.press('KeyM');
  check('settings: no errors', page._errors.length === 0, page._errors.join(' | '));
  await ev(page, () => localStorage.clear());
  await ctx.close();
}

async function testBestScores() {
  const page = await newPage();
  await boot(page, 'seed=4');
  await ev(page, () => { localStorage.clear(); RF.Storage.cache = {}; });
  async function playTo(score, diff) {
    await ev(page, d => RF.Game.setSetting('difficulty', d), diff);
    await ev(page, () => RF.Game.startGame());
    await ev(page, () => { const G = RF.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); });
    await ev(page, s => { RF.debug.world.score = s; RF.debug.world.air = 0.001; }, score);
    await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 6000 });
    await page.waitForTimeout(100);
    return ev(page, () => ({ best: document.getElementById('overBest').textContent, score: document.getElementById('overScore').textContent, isNew: !document.getElementById('newBest').classList.contains('hidden') }));
  }
  let r = await playTo(30, 'easy');
  check('best: first score on easy → NEW! badge', r.isNew && r.best === '30' && r.score === '30', r);
  await shot(page, '17_new_best');
  r = await playTo(20, 'easy');
  check('best: lower score → no badge, best stays', !r.isNew && r.best === '30', r);
  r = await playTo(10, 'normal');
  check('best: saved per difficulty (normal independent of easy)', r.isNew && r.best === '10', r);
  r = await playTo(0, 'hard');
  check('best: score 0 never shows NEW!', !r.isNew, r);
  const stored = await ev(page, () => ({ e: localStorage.getItem('rf:best_easy'), n: localStorage.getItem('rf:best_normal') }));
  check('best: persisted in storage', stored.e === '30' && stored.n === '10', stored);
  await ev(page, () => RF.Game.setSetting('difficulty', 'easy'));
  await page.waitForTimeout(700);
  await page.click('#btnOverMenu'); await page.waitForTimeout(150);
  check('title shows best for the current difficulty', await ev(page, () => document.getElementById('bestTitle').textContent) === '30');
  await ev(page, () => localStorage.clear());
  await page._ctx.close();
}

async function testCustomPictures() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage({}, ctx);
  await boot(page, 'seed=21');
  await ev(page, () => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  await page.click('#btnCustomize'); await page.waitForTimeout(300);
  check('Change Pictures: 7 slots', await ev(page, () => document.querySelectorAll('#slotGrid .slot').length) === 7);
  const files = {
    hero: { name: 'hero.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 240, 'hero') },
    treat: { name: 'treat.png', mimeType: 'image/png', buffer: await makeImage(page, 128, 128, 'treat') },
    cardback: { name: 'back.png', mimeType: 'image/png', buffer: await makeImage(page, 168, 196, 'green') },
    bg_spring: { name: 'spring.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 1600, 900, 'bg', 'image/jpeg') }
  };
  for (const id of Object.keys(files)) {
    await pickFile(page, slotIdx(id), files[id]);
    await page.waitForFunction(id => RF.Assets.hasCustom(id), id, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
    const tag = await ev(page, i => document.querySelectorAll('#slotGrid .slot')[i].querySelector('.tag').textContent, slotIdx(id));
    const thumb = await ev(page, i => { const im = document.querySelectorAll('#slotGrid .slot')[i].querySelector('.prev img'); return !!im && im.src.startsWith('data:'); }, slotIdx(id));
    check(`picture ${id}: stored, preview updated`, (await ev(page, id => RF.Assets.hasCustom(id), id)) && thumb && (id.startsWith('bg_') || /Your picture/.test(tag)), tag);
  }
  check('picture: toast "Picture saved"', /saved/i.test(await toastText(page)));
  check('cut-out hero (transparent corners) keeps the whole picture', await ev(page, () => RF.Storage.get('shape_hero') === 'fit'));
  // Round shape for hero
  await page.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click();
  await page.waitForTimeout(100);
  check('picture: Round shape stored for hero (square sticker)', await ev(page, () => RF.Storage.get('shape_hero') === 'circle' && RF.Assets.custom.hero.width === RF.Assets.custom.hero.height));
  await shot(page, '18_pictures_custom');
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(150);
  // play with custom pictures
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await page.click('#btnPlay');
  await freeze(page); await toPlaying(page);
  // match one pair so a custom treat is drawn
  const pr = await ev(page, () => { const w = RF.debug.world; const a = w.cards[0]; return [a.id, w.cards.find(c => c.face === a.face && c.id !== a.id).id]; });
  await ev(page, p => { RF.debug.select(p[0]); RF.debug.select(p[1]); }, pr);
  await simStep(page, 1.0);
  await ev(page, () => { RF.Game.renderer.banner = null; RF.Game.renderer.draw('playing'); });
  const keys = await ev(page, () => [...new Set([...RF.Assets._cache.keys()].filter(k => k.startsWith('custom:')).map(k => k.split('|')[0]))]);
  check('render: custom hero / treat / spring background drawn', ['custom:hero', 'custom:treat', 'custom:bg_spring'].every(k => keys.includes(k)), keys);
  const down = await ev(page, () => { const c = RF.debug.world.cards.find(c => c.state === 'down'); return { x: c.x, y: c.y }; });
  const green = await probe(page, down.x - 25, down.y - 30, 50, 60, 'r < 70 && g > 200 && b < 70');
  check('render: custom card back visible on face-down cards', green.n > 400, green);
  const pink = 'r > 200 && g < 90 && b > 170';
  const fox0 = await ev(page, () => ({ x: RF.debug.world.fox.x, y: RF.debug.world.fox.y }));
  const h0 = await probe(page, fox0.x - 70, fox0.y - 70, 140, 140, pink);
  check('render: custom hero pixels drawn where Foxy is', h0.n > 300, h0);
  await shot(page, '19_play_custom');
  await simStep(page, 2.5);
  await ev(page, () => RF.Game.renderer.draw('playing'));
  const fox1 = await ev(page, () => ({ x: RF.debug.world.fox.x, y: RF.debug.world.fox.y }));
  const h1 = await probe(page, fox1.x - 70, fox1.y - 70, 140, 140, pink);
  check('custom hero animates: swims (moves) and is redrawn at the new spot', h1.n > 300 && Math.hypot(h1.cx - h0.cx, h1.cy - h0.cy) > 3 && Math.abs((h1.cx - h0.cx) - (fox1.x - fox0.x)) < 12, { h0, h1, fox0, fox1 });
  const sq = await ev(page, () => { const w = RF.debug.world; w.fox._act = 'eat'; w.fox._actT = 0.3; RF.Game.step(1 / 60); return w.fox.frame; });
  await ev(page, () => RF.Game.renderer.draw('playing'));
  const fe = await ev(page, () => ({ x: RF.debug.world.fox.x, y: RF.debug.world.fox.y }));
  const h2 = await probe(page, fe.x - 70, fe.y - 70, 140, 140, pink);
  check('custom hero animates: eat frame squashes the sticker', sq === 'eat' && h2.n > 0, { h2: h2.n, h1: h1.n });
  await unfreeze(page);
  await ev(page, () => RF.Game.toTitle());
  // Persistence after reload
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  const persisted = await ev(page, () => ['hero', 'treat', 'cardback', 'bg_spring'].map(id => RF.Assets.hasCustom(id)));
  check('pictures persist after reload', persisted.every(Boolean), persisted);
  check('Round shape persists after reload', await ev(page, () => RF.Assets.custom.hero.width === RF.Assets.custom.hero.height && RF.Storage.get('shape_hero') === 'circle'));
  // changing the card back to another picture of the same size is picked up
  await page.click('#btnCustomize'); await page.waitForTimeout(250);
  await pickFile(page, slotIdx('cardback'), { name: 'blue.png', mimeType: 'image/png', buffer: await makeImage(page, 168, 196, 'blue') });
  await page.waitForTimeout(500);
  await page.click('#scrCustom .btn-back'); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await freeze(page); await toPlaying(page);
  await ev(page, () => { RF.Game.renderer.banner = null; RF.Game.renderer.draw('playing'); });
  const c0 = await ev(page, () => { const c = RF.debug.world.cards[0]; return { x: c.x, y: c.y }; });
  const blue = await probe(page, c0.x - 25, c0.y - 30, 50, 60, 'r < 70 && g < 70 && b > 200');
  check('replacing the card back with a same-size picture updates the cards', blue.n > 400, blue);
  await unfreeze(page); await ev(page, () => RF.Game.toTitle());
  // Opaque photo → round sticker automatically
  await page.click('#btnCustomize'); await page.waitForTimeout(250);
  await pickFile(page, slotIdx('treat'), { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 400, 300, 'noise', 'image/jpeg') });
  await page.waitForFunction(() => RF.Storage.get('shape_treat') === 'circle', null, { timeout: 5000 }).catch(() => {});
  check('opaque photo for a character slot → Round sticker by default', await ev(page, () => RF.Storage.get('shape_treat') === 'circle' && RF.Assets.custom.treat.width === RF.Assets.custom.treat.height));
  // Per-slot reset
  await page.locator('#slotGrid .slot').nth(slotIdx('treat')).locator('[data-act=reset]').click();
  await page.waitForTimeout(100);
  check('per-slot Reset: treat back to original, others kept', await ev(page, () => !RF.Assets.hasCustom('treat') && RF.Assets.hasCustom('hero') && !localStorage.getItem('rf:img_treat')));
  // bad files
  await pickFile(page, slotIdx('hero'), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') });
  await page.waitForTimeout(250);
  const t1 = await toastText(page);
  check('non-image file: friendly toast, existing picture kept', /picture file/i.test(t1) && await ev(page, () => RF.Assets.hasCustom('hero')), t1);
  await pickFile(page, slotIdx('treat'), { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  await page.waitForTimeout(400);
  const t2 = await toastText(page);
  check('corrupt image: friendly toast, nothing breaks', /could not be opened/i.test(t2) && !(await ev(page, () => RF.Assets.hasCustom('treat'))), t2);
  // huge images downscaled
  await pickFile(page, slotIdx('hero'), { name: 'huge.png', mimeType: 'image/png', buffer: await makeImage(page, 4000, 3000, 'hero') });
  await page.waitForFunction(() => RF.Assets.customSrc.hero && RF.Assets.customSrc.hero.naturalWidth >= 480, null, { timeout: 15000 }).catch(() => {});
  const dim = await ev(page, () => ({ w: RF.Assets.customSrc.hero.naturalWidth, h: RF.Assets.customSrc.hero.naturalHeight, len: (localStorage.getItem('rf:img_hero') || '').length }));
  check('4000×3000 character picture downscaled to ≤512 px and stored', dim.w <= 512 && dim.h <= 512 && dim.w >= 480 && dim.len > 1000, dim);
  await pickFile(page, slotIdx('bg_winter'), { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page, 4000, 3000, 'bg', 'image/jpeg') });
  await page.waitForFunction(() => RF.Assets.customSrc.bg_winter, null, { timeout: 15000 }).catch(() => {});
  const dimBg = await ev(page, () => ({ w: RF.Assets.customSrc.bg_winter.naturalWidth, h: RF.Assets.customSrc.bg_winter.naturalHeight }));
  check('4000×3000 background downscaled to ≤1280×720', dimBg.w <= 1280 && dimBg.h <= 720, dimBg);
  // Reset all
  await page.click('#btnResetAll'); await page.waitForTimeout(150);
  check('Reset all: every slot original + storage cleared', await ev(page, () => RF.Assets.SLOTS.every(s => !RF.Assets.hasCustom(s.id)) && Object.keys(localStorage).filter(k => k.startsWith('rf:img_')).length === 0));
  check('Reset all: tags say Original', await ev(page, () => [...document.querySelectorAll('#slotGrid .tag')].slice(0, 3).every(t => /Original/.test(t.textContent))));
  await page.click('#scrCustom .btn-back'); await page.click('#btnPlay'); await freeze(page); await toPlaying(page);
  await ev(page, () => { RF.Game.renderer.banner = null; RF.Game.renderer.draw('playing'); });
  const c1 = await ev(page, () => { const c = RF.debug.world.cards[0]; return { x: c.x, y: c.y }; });
  const blue2 = await probe(page, c1.x - 25, c1.y - 30, 50, 60, 'r < 70 && g < 70 && b > 200');
  check('after Reset all the default card back is drawn again', blue2.n < 50, blue2);
  check('pictures: no errors', page._errors.length === 0, page._errors.join(' | '));
  await ev(page, () => localStorage.clear());
  await ctx.close();
}

async function testLap2() {
  const page = await newPage();
  await boot(page, 'seed=31');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await page.click('#btnPlay'); await freeze(page);
  const info0 = {};
  for (const lv of [2, 4, 6, 7, 9, 40]) {
    await ev(page, lv => RF.debug.gotoLevel(lv), lv);
    await toPlaying(page);
    info0[lv] = await ev(page, () => { const w = RF.debug.world; return { season: w.season, lap: w.lap, airMax: +w.airMax.toFixed(2), air: +w.air.toFixed(2), apm: +w.airPerMatch.toFixed(2), gx: w.gravity.x, gy: w.gravity.y, cols: w.cols, rows: w.rows, n: w.cards.length, vis: RF.Game.renderer.vis.cur, wx: RF.debug.weather.season }; });
  }
  info('levels ' + JSON.stringify(info0));
  const L4 = info0[4];
  check('level 5 = Spring lap 2: 12 cards, gravity up, air ×0.8 (48 s)', L4.season === 0 && L4.lap === 1 && L4.n === 12 && L4.gy === -1 && Math.abs(L4.airMax - 48) < 0.01 && L4.air === L4.airMax, L4);
  check('lap 2 refill per match ×0.8', Math.abs(L4.apm - 2.4) < 0.01, L4.apm);
  check('level 7 = Autumn lap 2: current flips direction vs lap 1', info0[6].season === 2 && info0[6].gx === -info0[2].gx && info0[6].gx !== 0, { l3: info0[2].gx, l7: info0[6].gx });
  check('level 8 = Winter lap 2: 6×4, gravity down', info0[7].cols === 6 && info0[7].rows === 4 && info0[7].gy === 1, info0[7]);
  check('level 41 (lap 11): air never below lapAirMin 0.3 (Spring 60×0.3 = 18 s)', Math.abs(info0[40].airMax - 18) < 0.01, info0[40]);
  check('seasons beyond lap 1 switch backdrop + weather', Object.values(info0).every(x => x.vis === x.season && x.wx === x.season), Object.values(info0).map(x => [x.season, x.vis, x.wx]));
  // HUD text "Lap 2"
  await ev(page, () => RF.debug.gotoLevel(4));
  await ev(page, () => { RF.Game.renderer.banner = null; RF.Game.renderer.draw('playing'); });
  await shot(page, '20_lap2_hud');
  // banner gravity arrow must match the actual autumn current direction (it flips with seed + lap)
  // the banner hint (and arrow, drawn from the same vector) must match the real current, which flips with seed + lap
  const arrows = await ev(page, () => { const R = RF.Game.renderer, out = [];
    for (const lv of [2, 6]) { RF.debug.gotoLevel(lv); const said = []; const o = R.text; R.text = function (str) { said.push(str); return o.apply(this, arguments); };
      R.banner = { s: 2, t: 0.8 }; R.draw('playing'); R.text = o; out.push({ lv, gx: RF.debug.world.gravity.x, hint: said.find(t => /current/i.test(t)) }); }
    return out; });
  check('Autumn banner says the way the current really pushes (both laps)', arrows.every(a => a.hint && (a.gx < 0 ? /LEFT/ : /RIGHT/).test(a.hint)), arrows);
  await ev(page, () => { RF.debug.gotoLevel(6); RF.Game.renderer.banner = { s: 2, t: 0.8 }; RF.Game.renderer.draw('playing'); });
  await shot(page, '21_autumn_banner_lap2');
  // natural progression winter → lap 2 spring via the bot
  await unfreeze(page);
  await page.goto(url('seed=33&level=3&bot=1&skill=1&autostart=1&speed=8'));
  await page.waitForFunction(() => window.RF && RF.debug && RF.debug.world, null, { timeout: 15000 });
  await hookEvents(page);
  await page.waitForFunction(() => RF.debug.world.level >= 4 && RF.debug.world.state === 'playing', null, { timeout: 20000 }).catch(() => {});
  const st = await ev(page, () => ({ level: RF.debug.world.level, season: RF.debug.world.season, lap: RF.debug.world.lap, vis: RF.Game.renderer.vis.cur, wx: RF.debug.weather.season, score: RF.debug.world.score, music: RF.Audio.season }));
  const cl = await evLog(page, 'cleared');
  check('clearing Winter goes on to Spring lap 2 (score kept, backdrop/weather/music switch)', st.level === 4 && st.season === 0 && st.lap === 1 && st.vis === 0 && st.wx === 0 && st.music === 0 && st.score > 0 && cl.length >= 1, st);
  check('level clear: air bonus = round(air)×2 added', cl.length >= 1 && cl[0].bonus === Math.round(cl[0].air) * 2, cl[0]);
  await ev(page, () => RF.debug.setSpeed(1)); await page.waitForTimeout(300);
  await shot(page, '22_lap2_play');
  await ev(page, () => { RF.debug.setBot(false); RF.debug.world.air = 0.001; });
  await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 6000 }).catch(() => {});
  const txt = await ev(page, () => document.getElementById('overStats').textContent + ' | ' + document.getElementById('medalName').textContent);
  check('game over after lap 2 shows "lap 2" and a platinum medal (4 seasons cleared)', /lap 2/.test(txt) && /Platinum/i.test(txt), txt);
  check('lap 2: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testLayout() {
  const vps = [[800, 600, 1], [1280, 720, 1], [1366, 768, 1.5], [1920, 1080, 1], [2560, 1440, 1.5]];
  for (const [w, h, dsf] of vps) {
    const page = await newPage({ viewport: { width: w, height: h }, dsf });
    await boot(page, 'seed=1');
    const tag = `${w}x${h}@${dsf}`;
    const cv = await ev(page, () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top, bw: c.width, bh: c.height }; });
    const aspect = cv.w / cv.h;
    const fits = cv.w <= w + 1 && cv.h <= h + 1 && (Math.abs(cv.w - w) < 2 || Math.abs(cv.h - h) < 2);
    const centered = Math.abs(cv.l - (w - cv.w) / 2) < 2 && Math.abs(cv.t - (h - cv.h) / 2) < 2;
    check(`layout ${tag}: canvas letterboxed 16:9, fills one axis, centred`, Math.abs(aspect - 16 / 9) < 0.01 && fits && centered, cv);
    { const k = Math.min(1, 1920 / (cv.w * dsf));
      check(`layout ${tag}: backing store = css × dpr, capped at 1920×1080`, Math.abs(cv.bw - cv.w * dsf * k) < 2 && Math.abs(cv.bh - cv.h * dsf * k) < 2 && cv.bw <= 1920 && cv.bh <= 1080, [cv.bw, cv.bh]); }
    const issues = [];
    for (const scr of ['scrTitle', 'scrSettings', 'scrCustom', 'scrHow', 'scrPause', 'scrOver']) {
      await ev(page, s => {
        if (s === 'scrPause') { RF.Game.startGame(); RF.Game.pause(); }
        else if (s === 'scrOver') { RF.Game.startGame(); RF.debug.setSpeed(8); const G = RF.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.world.air = 0.001; }
        else { RF.Game.toTitle(); if (s !== 'scrTitle') RF.UI.open(s, 'scrTitle'); }
      }, scr);
      if (scr === 'scrOver') { await page.waitForFunction(() => RF.debug.mode === 'over', null, { timeout: 5000 }).catch(() => {}); await ev(page, () => RF.debug.setSpeed(1)); }
      await page.waitForTimeout(400);
      const r = await layoutReport(page);
      if (r.bad.length || (r.hidden && r.hidden.length)) issues.push(scr + ': ' + r.bad.concat(r.hidden.map(x => 'below-fold:' + x)).join('; ') + (r.overflow ? ' (panel scrolls)' : ''));
      if (w === 800 || w === 2560) await shot(page, `23_layout_${w}x${h}_${scr}`);
    }
    check(`layout ${tag}: every menu fits inside the window (no clipped / scrolled-away buttons)`, issues.length === 0, issues.join(' | '));
    // in-game HUD inside the canvas, above the canvas-drawn air meter, and Winter board inside the canvas
    await ev(page, () => { RF.Game.startGame(); RF.debug.gotoLevel(3); RF.debug.setSpeed(0); const G = RF.Game; let i = 0; while (G.world.state !== 'playing' && i++ < 3000) G.step(1 / 60); G.renderer.banner = null; });
    await page.waitForTimeout(250);
    const hud = await ev(page, () => { const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('hud').getBoundingClientRect();
      const toL = (x, y) => [(x - c.left) / c.width * 960, (y - c.top) / c.height * 540];
      const [l, t] = toL(b.left, b.top), [r, bt] = toL(b.right, b.bottom);
      const tr = RF.debug.world.tray;
      return { l: +l.toFixed(1), t: +t.toFixed(1), r: +r.toFixed(1), b: +bt.toFixed(1), trayTop: tr.y, trayBottom: tr.y + tr.h, trayRight: tr.x + tr.w }; });
    check(`layout ${tag}: HUD buttons inside the canvas, above the air meter (y<78) and the board`, hud.l >= 0 && hud.t >= 0 && hud.r <= 960 && hud.b < 78 && hud.b < hud.trayTop, hud);
    check(`layout ${tag}: Winter board fits in the canvas above the seabed edge`, hud.trayBottom <= 540 && hud.trayRight <= 960, hud);
    if (w === 800 || w === 2560 || w === 1366) await shot(page, `24_layout_${w}x${h}_winter`);
    check(`layout ${tag}: no errors`, page._errors.length === 0, page._errors.join(' | '));
    await page._ctx.close();
  }
  // live resize while playing + click accuracy after resize
  const page = await newPage({ viewport: { width: 1280, height: 720 } });
  await boot(page, 'seed=1');
  await ev(page, () => RF.Game.setSetting('peek', 0));
  await page.click('#btnPlay'); await freeze(page); await toPlaying(page);
  for (const [w, h] of [[800, 600], [1920, 1080], [500, 900], [1100, 700]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250); }
  const cv = await ev(page, () => { const r = document.getElementById('game').getBoundingClientRect(); return [r.width, r.height]; });
  check('live resize keeps a 16:9 canvas', Math.abs(cv[0] / cv[1] - 16 / 9) < 0.01, cv);
  const id = await ev(page, () => RF.debug.world.cards[5].id);
  await clickCard(page, id, 30, 35);   // near the corner of the card
  check('after resize, a click near a card corner still flips that card', (await cardInfo(page, id)).state === 'up');
  check('live resize: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testFocus() {
  const page = await newPage();
  await boot(page, 'seed=5');
  await ev(page, () => { window._starts = 0; const o = RF.Game.startGame.bind(RF.Game); RF.Game.startGame = function () { window._starts++; return o(); }; });
  await page.waitForTimeout(100);
  const f = await ev(page, () => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  check('focus: Space on title (Play focused) starts exactly once', await ev(page, () => window._starts) === 1 && (await mode(page)) === 'playing', 'focused=' + f + ' starts=' + await ev(page, () => window._starts));
  await ev(page, () => { RF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('focus: Enter on focused Play starts exactly once', await ev(page, () => window._starts) === 1);
  await ev(page, () => { RF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.focus('#btnSettings');
  await page.keyboard.press('Space'); await page.waitForTimeout(200);
  const r = await ev(page, () => ({ starts: window._starts, ui: RF.UI.current }));
  check('focus: Space on a focused title button activates THAT button (not Play)', r.starts === 0 && r.ui === 'scrSettings', r);
  await page.focus('#setSfx');
  const sfx0 = await ev(page, () => RF.Game.settings.sfx);
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  check('focus: Space on a settings toggle toggles it, no game start', await ev(page, () => window._starts) === 0 && (await ev(page, () => RF.Game.settings.sfx)) === !sfx0);
  await ev(page, s => RF.Game.setSetting('sfx', s), sfx0);
  await ev(page, () => { RF.Game.toTitle(); window._starts = 0; }); await page.waitForTimeout(100);
  await page.click('#btnPlay'); await page.waitForTimeout(100);
  const act = await ev(page, () => document.activeElement && document.activeElement.tagName);
  check('focus: after clicking Play nothing keeps keyboard focus (body)', act === 'BODY', act);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const pa = await ev(page, () => RF.debug.mode + '/' + (document.activeElement && document.activeElement.id));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('focus: Enter on the pause screen activates focused Resume', (await mode(page)) === 'playing', pa + ' → ' + await mode(page));
  check('focus: no errors', page._errors.length === 0, page._errors.join(' | '));
  await page._ctx.close();
}

async function testNativeBridge() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const disk = JSON.parse(sessionStorage.getItem('fakeDisk') || '{}');
    window._native = { calls: [], fs: [], quit: 0 };
    const save = () => sessionStorage.setItem('fakeDisk', JSON.stringify(disk));
    window.ffStoreAll = async () => Object.assign({}, disk);
    window.ffStoreSet = async (k, v) => { window._native.calls.push(['set', k, v.length]); if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(k) || v.length > 12 << 20) return false; disk[k] = v; save(); return true; };
    window.ffStoreDel = async k => { window._native.calls.push(['del', k]); delete disk[k]; save(); return true; };
    window.ffFullscreen = async on => { window._native.fs.push(on); return on; };
    window.ffQuit = async () => { window._native.quit++; };
  });
  const page = await newPage({}, ctx);
  await boot(page, 'app=1&seed=3');
  check('app mode: native store detected', await ev(page, () => RF.Storage.native === true));
  check('app mode: Quit button visible', await visible(page, '#btnQuit'));
  await ev(page, () => RF.Game.setSetting('difficulty', 'easy'));
  check('app mode: settings written through ffStoreSet, not localStorage', await ev(page, () => window._native.calls.some(c => c[0] === 'set' && c[1] === 'settings') && !localStorage.getItem('rf:settings')));
  await page.click('#btnCustomize'); await page.waitForTimeout(200);
  await pickFile(page, slotIdx('hero'), { name: 'b.png', mimeType: 'image/png', buffer: await makeImage(page, 300, 300, 'hero') });
  await page.waitForFunction(() => RF.Assets.hasCustom('hero'), null, { timeout: 5000 }).catch(() => {});
  const keysOk = await ev(page, () => window._native.calls.filter(c => c[0] === 'set').every(c => /^[a-zA-Z0-9_\-]{1,64}$/.test(c[1])));
  check('app mode: every storage key matches the Go store key regex', keysOk);
  await page.reload(); await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  check('app mode: picture + settings reload from the native store', await ev(page, () => RF.Assets.hasCustom('hero') && RF.Game.settings.difficulty === 'easy'));
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  await page.keyboard.press('F11'); await page.waitForTimeout(250);
  const fsr = await ev(page, () => ({ calls: window._native.fs, flag: RF.Game.fullscreen }));
  check('app mode: F11 toggles native fullscreen on/off', JSON.stringify(fsr.calls) === '[true,false]' && fsr.flag === false, fsr);
  await page.click('#btnQuit'); await page.waitForTimeout(100);
  check('app mode: Quit calls ffQuit', await ev(page, () => window._native.quit === 1));
  check('app mode: no errors', page._errors.length === 0, page._errors.join(' | '));
  await ctx.close();
}

async function testLongRun() {
  const page = await newPage();
  await boot(page, 'seed=77&speed=16&bot=1&skill=0.3&autostart=1&autorestart=1');
  const samples = [];
  const t0 = Date.now();
  let maxLevel = 0;
  while (Date.now() - t0 < LONG_RUN_S * 1000) {
    await sleep(Math.min(10000, LONG_RUN_S * 1000 / 6));
    samples.push(await ev(page, () => {
      const G = RF.Game, w = G.world;
      return { mode: G.mode, games: G.stats.games, score: w.score, level: w.level, lap: w.lap, state: w.state,
        cards: w.cards.length, cupcakes: w.cupcakes.length, particles: G.weather.particles.length, fx: G.renderer.fx.length, texts: G.renderer.texts.length,
        cache: RF.Assets._cache.size, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, errors: G.stats.errors.length };
    }));
    maxLevel = Math.max(maxLevel, samples[samples.length - 1].level);
    // a strong bot rarely runs out of air: every other sample, end the round to exercise game over → auto-restart
    if (samples.length % 2 === 0) await ev(page, () => { const w = RF.debug.world; if (w.state === 'playing') w.air = 0.001; });
    info('long run ' + JSON.stringify(samples[samples.length - 1]));
  }
  const st = await ev(page, () => RF.Game.stats);
  maxLevel = Math.max(maxLevel, ...st.levels);
  const maxOf = k => Math.max(...samples.map(s => s[k]));
  info(`long run: ${st.games} games, scores ${JSON.stringify(st.scores.slice(0, 20))}, levels ${JSON.stringify(st.levels.slice(0, 20))}`);
  check('long run: no errors (page / console / frame loop)', page._errors.length === 0 && st.errors.length === 0, page._errors.concat(st.errors).slice(0, 5).join(' | '));
  check('long run: entities bounded (cards ≤ 24, cupcakes ≤ 10, particles ≤ 150)', maxOf('cards') <= 24 && maxOf('cupcakes') <= 10 && maxOf('particles') <= 150, { cards: maxOf('cards'), cupcakes: maxOf('cupcakes'), particles: maxOf('particles') });
  check('long run: renderer effects bounded (fx ≤ 400, texts ≤ 30)', maxOf('fx') <= 400 && maxOf('texts') <= 30, { fx: maxOf('fx'), texts: maxOf('texts') });
  check('long run: sprite cache bounded (≤ 200 entries)', maxOf('cache') <= 200, maxOf('cache'));
  if (samples[0].heapMB != null && samples.length > 2) {
    const h1 = samples[1].heapMB, hN = samples[samples.length - 1].heapMB;
    check('long run: JS heap does not keep growing (< +40 MB)', hN - h1 < 40, { from: h1, to: hN });
  }
  if (!QUICK) {
    check('long run: game over → auto-restart works repeatedly (≥ 3 games)', st.games >= 3, { games: st.games, levels: st.levels });
    check('long run: reached lap 2 (level ≥ 5)', maxLevel >= 4, { maxLevel });
  }
  await ev(page, () => RF.debug.setSpeed(1)); await page.waitForTimeout(300);
  await shot(page, '25_long_run_end');
  await page._ctx.close();
}

(async () => {
  browser = await chromium.launch();
  const suites = [testBootAndScreens, testPlayIntro, testMouseCards, testGravity, testKeyboard, testAirAndGameOver, testPause, testSettings, testBestScores, testCustomPictures, testLap2, testNativeBridge, testFocus, testLayout, testLongRun];
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
