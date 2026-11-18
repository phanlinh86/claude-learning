#!/usr/bin/env node
// Taffy's Candy Reel — does the real browser game match the headless sim? (playtest, report-only)
// Plays ?speed=8&bot=1 in Chromium (landscape 960×540 and an iPhone-like portrait 390×844 touch viewport) for REAL_S
// real seconds, then runs the same difficulty / bot skill headless for the same simulated time and prints both.
//   node tests/sim/browser-check.js [realSeconds=30] [diff=easy] [skill=0.75]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const { load } = require('../unit/load');

const ROOT = path.resolve(__dirname, '../../game');
const REAL_S = +process.argv[2] || 30, DIFF = process.argv[3] || 'easy', SKILL = +(process.argv[4] || 0.75);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, path.normalize(u));
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); rsp.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { rsp.writeHead(404); rsp.end(); return; } rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rsp.end(d); });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function headless(W, H, simS, seed) {
  const PR = load(['rng.js', 'world.js', 'bot.js']);
  const out = [];
  for (let s = 0; s < 20; s++) {
    const w = new PR.World({ seed: seed + s, difficulty: DIFF, width: W, height: H });
    const b = new PR.Bot(w, { skill: SKILL, seed: 11 });
    let t = 0; while (t < simS && w.phase !== 'over') { b.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60; }
    out.push({ t, level: w.level, flakes: w.totalFlakes, score: w.score, snaps: w.stats.snaps, escapes: w.stats.escapes, gusts: w.stats.gusts, zoneTimes: w.stats.zoneTimes });
  }
  const m = k => out.reduce((a, r) => a + r[k], 0) / out.length;
  const zt = [].concat(...out.map(r => r.zoneTimes));
  return { simS, flakesPerMin: m('flakes') / (m('t') / 60), levels: m('level'), snaps: m('snaps'), escapes: m('escapes'), gustsPerMin: m('gusts') / (m('t') / 60), levelS: zt.reduce((a, b) => a + b, 0) / Math.max(1, zt.length) };
}

(async () => {
  const srv = await serve(), port = srv.address().port;
  const browser = await chromium.launch();
  const rows = [];
  for (const [name, ctxOpts] of [['landscape 960×540', { viewport: { width: 960, height: 540 } }],
    ['portrait 390×844 touch', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?speed=8&bot=1&skill=${SKILL}&diff=${DIFF}&seed=5&mute=1`);
    await page.waitForFunction(() => window.PR && PR.Game && PR.Game.mode !== 'boot', null, { timeout: 20000 });
    await page.evaluate(() => { PR.Game.startGame(); window.__f = 0; (function tick() { window.__f++; requestAnimationFrame(tick); })(); });
    await page.waitForFunction(() => PR.Game.mode === 'playing', null, { timeout: 8000 });
    const t0 = await page.evaluate(() => PR.debug.world.time);
    await page.waitForTimeout(REAL_S * 1000);
    const r = await page.evaluate(() => {
      const w = PR.debug.world;
      return { time: w.time, W: w.layout.width, H: w.layout.height, level: w.level, flakes: w.totalFlakes, score: w.score, snaps: w.stats.snaps, escapes: w.stats.escapes,
        gusts: w.stats.gusts, zoneTimes: w.stats.zoneTimes, phase: w.phase, mode: PR.Game.mode, frames: window.__f };
    });
    await page.screenshot({ path: path.join(__dirname, 'results', 'browser-' + (name.startsWith('land') ? 'landscape' : 'portrait') + '.png') });
    const simS = r.time - t0;
    const br = { simS, flakesPerMin: r.flakes / (simS / 60), levels: r.level, snaps: r.snaps, escapes: r.escapes, gustsPerMin: r.gusts / (simS / 60),
      levelS: r.zoneTimes.reduce((a, b) => a + b, 0) / Math.max(1, r.zoneTimes.length), fps: r.frames / REAL_S, mode: r.mode, errors: errs.length };
    rows.push({ name, logical: r.W + '×' + r.H, browser: br, headless: headless(r.W, r.H, simS, 5) });
    await ctx.close();
  }
  await browser.close(); srv.close();
  const f = (v, d = 1) => typeof v === 'number' ? v.toFixed(d) : v;
  for (const r of rows) {
    console.log(`\n${r.name} (logical ${r.logical}), ${f(r.browser.simS, 0)} s simulated in ${REAL_S} s real, ${f(r.browser.fps, 0)} fps, mode ${r.browser.mode}, console errors ${r.browser.errors}`);
    console.log('               browser   headless (mean of 20 seeds)');
    for (const k of ['flakesPerMin', 'levels', 'levelS', 'snaps', 'escapes', 'gustsPerMin']) console.log(k.padEnd(14), String(f(r.browser[k])).padStart(8), String(f(r.headless[k])).padStart(10));
  }
  fs.writeFileSync(path.join(__dirname, 'results', 'browser-check.json'), JSON.stringify(rows, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
