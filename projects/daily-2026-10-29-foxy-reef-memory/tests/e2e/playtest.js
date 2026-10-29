// High-speed in-browser playtest + frame-time measurement.
//   node tests/e2e/playtest.js [minutes=3] [port=8793]
// Starts `python3 -m http.server <port>` in game/ unless something already answers on that port.
// 1) bot + autorestart at speed 16 for <minutes>: samples RF.debug.getState(), RF.debug.stats, errors,
//    and checks for leaks (renderer fx, particles) and impossible states.
// 2) speed 1, bot on Winter (level=3), 1920×1080: rAF intervals + CPU time spent in step/draw per frame,
//    with adaptive quality on (shipped) and off (?adaptive=0).
// Writes tests/out/playtest.json and screenshots tests/out/playtest_*.png.
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const minutes = parseFloat(process.argv[2] || '3');
const port = parseInt(process.argv[3] || '8793', 10);
const base = `http://127.0.0.1:${port}/index.html`;
const OUT = path.join(__dirname, '..', 'out');
fs.mkdirSync(OUT, { recursive: true });

const up = () => new Promise(res => http.get(base, r => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function measureFrames(browser, query, seconds, shot) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + query);
  await page.waitForFunction(() => window.RF && RF.debug && RF.debug.world && RF.debug.world.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => {
    const G = RF.Game, R = G.renderer;
    window.__pt = { raf: [], draw: [], step: [] };
    const d0 = R.draw.bind(R);
    R.draw = function (m) { const t = performance.now(); d0(m); window.__pt.draw.push(performance.now() - t); };
    const s0 = G.step.bind(G);
    let acc = 0;
    G.step = function (h) { const t = performance.now(); s0(h); acc += performance.now() - t; };
    let last = performance.now();
    (function loop(ts) { window.__pt.raf.push(ts - last); window.__pt.step.push(acc); acc = 0; last = ts; requestAnimationFrame(loop); })(performance.now());
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__pt.raf = []; window.__pt.draw = []; window.__pt.step = []; });
  await page.waitForTimeout(seconds * 1000);
  const r = await page.evaluate(() => {
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const m = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    const P = window.__pt, R = RF.Game.renderer, st = RF.debug.getState();
    return {
      frames: P.raf.length, fps: 1000 / m(P.raf), rafMedian: q(P.raf, 0.5), rafP95: q(P.raf, 0.95), rafMax: Math.max(...P.raf),
      over33ms: P.raf.filter(x => x > 33.4).length,
      drawMean: m(P.draw), drawP95: q(P.draw, 0.95), stepMean: m(P.step), stepP95: q(P.step, 0.95),
      renderScale: R.px, canvas: [R.canvas ? R.canvas.width : null, R.canvas ? R.canvas.height : null],
      state: st
    };
  });
  if (shot) await page.screenshot({ path: path.join(OUT, shot) });
  r.errors = errors;
  await page.close();
  return r;
}

(async () => {
  let server = null;
  if (!(await up())) {
    server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: path.join(__dirname, '..', '..', 'game'), stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await sleep(200);
  }
  const browser = await chromium.launch();
  const result = { when: new Date().toISOString(), minutes };

  // ---------- 1) high-speed soak ----------
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '?mute=1&bot=1&autostart=1&autorestart=1&speed=16');
  const samples = [], anomalies = [];
  const t0 = Date.now();
  let shots = 0;
  while (Date.now() - t0 < minutes * 60000) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const st = RF.debug.getState(), w = RF.debug.world;
      return Object.assign(st, {
        cupList: w.cupcakes.length, open: w.open.length,
        badCards: w.cards.filter(c => c.state !== 'gone' && (isNaN(c.x) || isNaN(c.y) || c.alpha < 0 || c.alpha > 1)).length,
        dupCells: (() => { const seen = {}; let d = 0; for (const c of w.cards) if (c.state !== 'gone') { const k = c.col + ',' + c.row; if (seen[k]) d++; seen[k] = 1; } return d; })(),
        foxOk: isFinite(w.fox.x) && isFinite(w.fox.y) && w.fox.x >= 0 && w.fox.x <= 960 && w.fox.y >= 0 && w.fox.y <= 540,
        games: RF.debug.stats.games
      });
    });
    s.t = Math.round((Date.now() - t0) / 1000);
    samples.push(s);
    if (s.badCards || s.dupCells || !s.foxOk || s.air < 0 || s.air > s.airMax + 1e-6 || s.fx > 400 || s.particles > 150 || s.cupList > 20) anomalies.push(s);
    if (shots < 4 && s.mode === 'playing' && s.season === shots) { await page.evaluate(() => RF.debug.setSpeed(1)); await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `playtest_season${shots}.png`) }); await page.evaluate(() => RF.debug.setSpeed(16)); shots++; }
  }
  result.soak = {
    stats: await page.evaluate(() => RF.debug.stats),
    maxLevelSeen: Math.max(...samples.map(s => s.level || 0)),
    seasonsSeen: [...new Set(samples.map(s => s.season))],
    maxFx: Math.max(...samples.map(s => s.fx)), maxParticles: Math.max(...samples.map(s => s.particles)), maxCupcakeList: Math.max(...samples.map(s => s.cupList)),
    samples: samples.length, anomalies, errors
  };
  await page.screenshot({ path: path.join(OUT, 'playtest_soak_end.png') });
  await page.close();
  console.log('soak', JSON.stringify(Object.assign({}, result.soak, { stats: Object.assign({}, result.soak.stats, { scores: undefined, times: undefined, levels: undefined }) })));
  console.log('soak levels per game', JSON.stringify(result.soak.stats.levels), 'scores', JSON.stringify(result.soak.stats.scores));

  // ---------- 2) frame times on Winter at 1920×1080 ----------
  result.frames = {
    winterAdaptive: await measureFrames(browser, '?mute=1&bot=1&autostart=1&level=3&seed=7&speed=1', 12, 'playtest_winter_1080.png'),
    winterNoAdaptive: await measureFrames(browser, '?mute=1&bot=1&autostart=1&level=3&seed=7&speed=1&adaptive=0', 12, null),
    springNoAdaptive: await measureFrames(browser, '?mute=1&bot=1&autostart=1&level=0&seed=7&speed=1&adaptive=0', 8, null)
  };
  for (const [k, v] of Object.entries(result.frames)) console.log('frames', k, JSON.stringify(Object.assign({}, v, { state: undefined })));

  await browser.close();
  if (server) server.kill();
  fs.writeFileSync(path.join(OUT, 'playtest.json'), JSON.stringify(result, null, 1));
  // tests/out is gitignored: keep a committed copy next to the sim results
  const keep = path.join(__dirname, '..', 'sim', 'results');
  fs.mkdirSync(keep, { recursive: true });
  fs.writeFileSync(path.join(keep, 'e2e_playtest.json'), JSON.stringify(result, null, 1));
  const bad = result.soak.errors.length + result.soak.anomalies.length + Object.values(result.frames).reduce((s, f) => s + f.errors.length, 0);
  console.log(bad ? `PROBLEMS: ${bad}` : 'OK: no errors, no anomalies');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
