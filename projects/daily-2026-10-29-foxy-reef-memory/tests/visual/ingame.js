// Visual QA: deterministic in-game captures. The game clock is frozen (speed 0) and advanced by hand
// in 1/120 s sub-steps, so each frame of a contact sheet is exactly `dt` apart in game time.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/../out/visual/';
const BASE = process.argv[2] || 'http://127.0.0.1:8792/index.html';
const ONLY = process.argv[3] || '';
const log = {};

async function open(browser, q, vp = [1280, 720]) {
  const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(BASE + '?mute=1&seed=42' + (q || ''));
  await page.waitForFunction(() => window.RF && RF.debug && RF.debug.mode === 'title');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__adv = s => { const G = RF.Game, h = 1 / 120; const n = Math.round(s / h); for (let i = 0; i < n; i++) { G.step(h); G.renderer.update(h); } };
    window.__raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  return page;
}
async function start(page, opts = {}) {
  await page.evaluate(o => {
    if (o.easy) { RF.Game.settings.difficulty = 'easy'; RF.Game.settings.peek = 2; }
    else { RF.Game.settings.difficulty = 'normal'; RF.Game.settings.peek = o.peek || 0; }
    RF.debug.startGame(); RF.debug.setSpeed(0);
  }, opts);
}
const adv = (page, s) => page.evaluate(s => { __adv(s); return __raf(); }, s);
const S = 1280 / 960;
async function shot(page, name, clip) {
  const o = { path: OUT + name + '.png' };
  if (clip) o.clip = { x: clip[0] * S, y: clip[1] * S, width: clip[2] * S, height: clip[3] * S };
  await page.screenshot(o);
  return o.path;
}
async function seq(page, prefix, n, dt, clip, perFrame) {
  const files = [];
  for (let i = 0; i < n; i++) {
    files.push(await shot(page, prefix + '_' + String(i).padStart(2, '0'), clip));
    if (perFrame) await perFrame(i);
    await adv(page, dt);
  }
  return files;
}
const toPlay = page => page.evaluate(() => { for (let i = 0; i < 2000 && RF.debug.world.state !== 'playing'; i++) __adv(1 / 120); return __raf(); });
const cardsInfo = page => page.evaluate(() => RF.debug.world.cards.filter(c => c.state !== 'gone').map(c => ({ id: c.id, face: c.face, col: c.col, row: c.row, x: +c.x.toFixed(2), y: +c.y.toFixed(2), state: c.state })));

/* pick the pair whose removal makes the most cards slide (for this level's gravity) */
function bestPair(cards, g, cols, rows) {
  const byFace = {};
  cards.filter(c => c.state === 'down').forEach(c => (byFace[c.face] = byFace[c.face] || []).push(c));
  let best = null, bs = -1;
  for (const f in byFace) {
    const [a, b] = byFace[f]; if (!b) continue;
    let s = 0;
    for (const k of [a, b]) for (const o of cards) {
      if (o === a || o === b) continue;
      if (g.y && o.col === k.col && (g.y < 0 ? o.row > k.row : o.row < k.row)) s++;
      if (g.x && o.row === k.row && (g.x < 0 ? o.col > k.col : o.col < k.col)) s++;
    }
    if (a.row !== b.row && a.col !== b.col) s += 0.5; // prefer slides in two lines
    if (s > bs) { bs = s; best = [a.id, b.id]; }
  }
  return best;
}

(async () => {
  const browser = await chromium.launch();
  const want = k => !ONLY || ONLY.split(',').includes(k);

  // ---------- 1. intro banner + deal + peek (Easy, 2 s) ----------
  if (want('intro')) {
    const p = await open(browser);
    await start(p, { easy: true });
    await seq(p, 'intro', 24, 0.15);   // 0 .. 3.45 s: banner, deal, peek start
    await adv(p, 0.6); await shot(p, 'intro_peek_mid');
    await p.close();
  }

  // ---------- 2. season boards mid-game ----------
  if (want('seasons')) {
    for (let L = 0; L < 4; L++) {
      const p = await open(browser, '&level=' + L);
      await start(p);
      await toPlay(p);
      await p.evaluate(() => RF.debug.setBot(true, 0.7));
      await adv(p, 9);
      await shot(p, 'season_' + L + '_mid');
      await p.evaluate(() => RF.debug.setBot(false));
      log['season_' + L] = await p.evaluate(() => ({ gravity: RF.debug.world.gravity, st: RF.debug.getState() }));
      await p.close();
    }
  }

  // ---------- 3. flip / match / mismatch / gravity slides ----------
  if (want('cards')) {
    for (const L of [0, 2, 3]) {
      const p = await open(browser, '&level=' + L);
      await start(p);
      await toPlay(p);
      const info = await p.evaluate(() => ({ g: RF.debug.world.gravity, cols: RF.debug.world.cols, rows: RF.debug.world.rows, tray: RF.debug.world.tray }));
      const cards = await cardsInfo(p);
      const t = info.tray, clip = [t.x - 30, t.y - 30, t.w + 60, t.h + 60];
      log['level' + L] = info;
      if (L === 0) {
        // flip
        const a = cards[0];
        await p.evaluate(id => RF.debug.select(id), a.id);
        await seq(p, 'flip', 7, 0.04, [a.x - 60, a.y - 64, 120, 128]);
        // mismatch
        const b = cards.find(c => c.face !== a.face && c.id !== a.id);
        await p.evaluate(id => RF.debug.select(id), b.id);
        await adv(p, 0.2);
        await seq(p, 'mismatch', 16, 0.06, clip);
        await adv(p, 1.0);
      }
      // match → gravity slide
      const pair = bestPair(cards, info.g, info.cols, info.rows);
      for (const id of pair) await p.evaluate(id => RF.debug.select(id), id);
      const track = [];
      await adv(p, 0.18);
      await seq(p, 'slide_L' + L, 36, 0.04, clip, async () => track.push(await cardsInfo(p)));
      // movement analysis: per-frame displacement, overlaps
      let maxStep = 0, overlaps = 0, maxOver = 0, moving = new Set();
      for (let f = 1; f < track.length; f++) {
        for (const c of track[f]) {
          const prev = track[f - 1].find(o => o.id === c.id); if (!prev) continue;
          const d = Math.hypot(c.x - prev.x, c.y - prev.y);
          if (d > 0.05) moving.add(c.id);
          maxStep = Math.max(maxStep, d);
        }
        const cs = track[f].filter(c => c.state === 'down');
        for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
          const ox = 76 - Math.abs(cs[i].x - cs[j].x), oy = 88 - Math.abs(cs[i].y - cs[j].y);
          if (ox > 0 && oy > 0) { overlaps++; maxOver = Math.max(maxOver, Math.min(ox, oy)); }
        }
      }
      log['slide_L' + L] = { pair, maxStepPer40ms: +maxStep.toFixed(1), maxSpeedPxS: +(maxStep / 0.04).toFixed(0), overlapFrames: overlaps, maxOverlapPx: +maxOver.toFixed(1), moved: moving.size };
      if (L === 0) {
        // Foxy fetches the cupcake (full frame, 0.15 s apart)
        await seq(p, 'fox', 30, 0.15);
      }
      await p.close();
    }
  }

  // ---------- 4. level clear ----------
  if (want('clear')) {
    const p = await open(browser);
    await start(p); await toPlay(p);
    await p.evaluate(() => {
      const w = RF.debug.world;
      for (let guard = 0; guard < 40; guard++) {
        const down = w.cards.filter(c => c.state === 'down');
        if (!down.length) break;
        const a = down[0], b = down.find(c => c !== a && c.face === a.face);
        w.select(a.id); w.select(b.id);
        for (let i = 0; i < 60 * 2 && w.state === 'playing'; i++) { __adv(1 / 120); if (!w.cards.some(c => c.moving || c.state === 'matched' || c.state === 'up')) break; }
        if (w.cards.filter(c => c.state !== 'gone').length <= 2) break;
      }
      return __raf();
    });
    // last pair
    await p.evaluate(() => { const w = RF.debug.world; const d = w.cards.filter(c => c.state === 'down'); if (d.length === 2) { w.select(d[0].id); w.select(d[1].id); } return __raf(); });
    await seq(p, 'clear', 26, 0.2);
    await p.close();
  }

  // ---------- 5. air low + game over ----------
  if (want('over')) {
    const p = await open(browser, '&level=2');
    await start(p); await toPlay(p);
    await p.evaluate(() => { const w = RF.debug.world; w.air = w.airMax * 0.255; });
    await seq(p, 'airlow', 8, 0.2);
    await p.evaluate(() => { RF.debug.world.air = 0.1; });
    await seq(p, 'dead', 10, 0.2);
    await p.evaluate(() => RF.debug.setSpeed(1));
    await p.waitForTimeout(1200);
    await shot(p, 'dead_overscreen');
    await p.close();
  }

  // ---------- 6. readability: all faces up at in-game size ----------
  if (want('read')) {
    for (const vp of [[1280, 720], [800, 600]]) {
      const p = await open(browser, '&level=3', vp);
      await start(p, { easy: true });
      await p.evaluate(() => { const w = RF.debug.world; for (let i = 0; i < 2000 && w.phase !== 'peek'; i++) __adv(1 / 120); __adv(0.4); return __raf(); });
      await p.screenshot({ path: OUT + 'faces_peek_' + vp.join('x') + '.png' });
      await p.close();
    }
  }

  // ---------- 7. custom pictures ----------
  if (want('custom')) {
    const p = await open(browser);
    await p.click('#btnCustomize'); await p.waitForTimeout(300);
    for (const [slot, file] of [['hero', 'custom_photo.jpg'], ['cardback', 'custom_back.jpg'], ['bg_spring', 'custom_bg.jpg'], ['treat', 'custom_treat.png']]) {
      await p.evaluate(s => { RF.UI._pickSlot = s; }, slot);
      await p.setInputFiles('#filePick', OUT + 'src/' + file);
      await p.waitForTimeout(1200);
    }
    await shot(p, 'custom_menu_after');
    await p.click('#scrCustom .btn-back'); await p.waitForTimeout(300);
    await shot(p, 'custom_title');
    await start(p); await toPlay(p);
    await shot(p, 'custom_ingame');
    const cards = await cardsInfo(p);
    const a = cards[0], b = cards.find(c => c.face === a.face && c.id !== a.id);
    await p.evaluate(([x, y]) => { RF.debug.select(x); RF.debug.select(y); return __raf(); }, [a.id, b.id]);
    await seq(p, 'custom_fox', 12, 0.25);
    // round vs whole-picture
    await p.evaluate(() => { RF.Assets.setShape('hero', 'fit'); return __raf(); });
    await adv(p, 0.5); await shot(p, 'custom_fit');
    await p.close();
  }

  fs.writeFileSync(OUT + 'ingame_log.json', JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log, null, 1));
  await browser.close();
})();
