// High-speed in-browser playtest: bot + autorestart at ?speed=16 for a few minutes, then frame times
// at speed 1 with the bot on the Ice-Cream Glacier (level 3) at 1920×1080.
//   (cd game && python3 -m http.server 8803 &)   node tests/e2e/playtest.js [baseUrl] [minutes]
// Writes tests/sim/results/browser_playtest.json.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8803/index.html';
  const minutes = parseFloat(process.argv[3] || '3');
  const out = path.join(__dirname, '..', 'sim', 'results');
  fs.mkdirSync(out, { recursive: true });
  const shots = path.join(__dirname, '..', 'out'); fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const result = { highSpeed: {}, frames: [] };

  // ---------- 1. high-speed autoplay ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(base + '?mute=1&bot=1&autostart=1&autorestart=1&speed=16');
    const t0 = Date.now(), samples = [];
    let maxLevel = 0, maxParticles = 0, maxFx = 0;
    while (Date.now() - t0 < minutes * 60000) {
      await page.waitForTimeout(5000);
      const s = await page.evaluate(() => CD.debug.getState());
      if (s) { maxLevel = Math.max(maxLevel, s.level); maxParticles = Math.max(maxParticles, s.particles); maxFx = Math.max(maxFx, s.fx); samples.push(s); }
    }
    await page.screenshot({ path: path.join(shots, 'playtest_speed16.png') });
    const stats = await page.evaluate(() => CD.debug.stats);
    result.highSpeed = { minutes, stats, maxLevel, maxParticles, maxFx, errors, last: samples[samples.length - 1], gameSecondsSimulated: samples.length ? null : 0 };
    console.log('high speed:', JSON.stringify({ games: stats.games, scores: stats.scores, levels: stats.levels, times: stats.times, maxLevel, maxParticles, maxFx, errors: errors.length, gameErrors: stats.errors.length }));
    await page.close();
  }

  // ---------- 2. frame times at speed 1, bot on the glacier, 1920×1080 ----------
  for (const adaptive of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(base + '?mute=1&bot=1&autostart=1&autorestart=1&level=3&seed=7' + (adaptive ? '' : '&adaptive=0'));
    await page.waitForTimeout(4000);   // intro + adaptive settle
    const fr = await page.evaluate(() => new Promise(res => {
      const d = []; let last = performance.now(); const t0 = last;
      function f(t) { d.push(t - last); last = t; if (t - t0 < 10000) requestAnimationFrame(f); else res(d); }
      requestAnimationFrame(f);
    }));
    const st = await page.evaluate(() => ({ s: CD.debug.getState(), px: CD.Game.renderer.px, maxPx: CD.Game.renderer.maxPx }));
    const a = fr.slice().sort((x, y) => x - y), q = p => a[Math.floor((a.length - 1) * p)];
    const r = { adaptive, frames: fr.length, fps: +(1000 * fr.length / fr.reduce((s, x) => s + x, 0)).toFixed(1), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +a[a.length - 1].toFixed(1),
      renderScale: st.px, biome: st.s.biome, particles: st.s.particles, errors };
    result.frames.push(r);
    console.log('frames:', JSON.stringify(r));
    await page.screenshot({ path: path.join(shots, 'playtest_glacier_1080' + (adaptive ? '' : '_noadapt') + '.png') });
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'browser_playtest.json'), JSON.stringify(result, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
