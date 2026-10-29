// High-speed in-browser play-test: the real game (renderer, weather, audio muted, UI) driven by the bot.
//   (cd game && python3 -m http.server 8773) &
//   node tests/e2e/playtest.js [baseUrl] [minutes=3]
// 1) speed=16 bot + autorestart for N minutes: collects FF.debug.stats, page errors, screenshots.
// 2) perf: 1920×1080 @ DPR 2, speed 1, bot playing in WINTER (heaviest weather): rAF frame intervals.
// Writes tests/sim/results/browser_playtest.json and screenshots to tests/out/playtest_*.png
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = process.argv[2] || 'http://127.0.0.1:8773/index.html';
const minutes = parseFloat(process.argv[3] || '3');
const OUT = path.join(__dirname, '..', 'out');
const RES = path.join(__dirname, '..', 'sim', 'results');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RES, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function stat(arr) {
  const s = arr.slice().sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
}

(async () => {
  const report = { base, minutes, highSpeed: null, perf: [], errors: [] };
  const browser = await chromium.launch();

  /* ---------------- 1) high-speed bot marathon ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => report.errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push('console: ' + m.text()); });
    await page.goto(base + '?mute=1&bot=1&autostart=1&autorestart=1&speed=16&seed=7');
    await page.waitForFunction(() => window.FF && FF.debug && FF.debug.world, null, { timeout: 20000 });
    const t0 = Date.now(), samples = [];
    let shot = 0;
    const seenSeasons = new Set();
    while (Date.now() - t0 < minutes * 60000) {
      await sleep(2000);
      const s = await page.evaluate(() => ({ st: FF.debug.getState(), stats: FF.debug.stats }));
      samples.push({ t: (Date.now() - t0) / 1000, score: s.st && s.st.score, season: s.st && s.st.season, games: s.stats.games });
      // one screenshot per season seen, plus one game-over
      if (s.st && s.st.mode === 'playing' && !seenSeasons.has(s.st.season)) {
        seenSeasons.add(s.st.season);
        await page.screenshot({ path: path.join(OUT, `playtest_season${s.st.season}.png`) }); shot++;
      }
    }
    // the bot at skill 1 rarely dies; force a few varied rounds with a weaker bot for the game-over path
    await page.evaluate(() => { FF.debug.setBot(true, 0.3); });
    await sleep(15000);
    await page.screenshot({ path: path.join(OUT, 'playtest_late.png') });
    const stats = await page.evaluate(() => FF.debug.stats);
    report.highSpeed = {
      wallSeconds: (Date.now() - t0) / 1000, approxGameSeconds: (Date.now() - t0) / 1000 * 16,
      games: stats.games, scores: stats.scores, times: stats.times, hits: stats.hits, drops: stats.drops,
      seasonsReached: stats.seasonsReached, gameErrors: stats.errors, samples, screenshots: shot
    };
    await page.close();
  }

  /* ---------------- 2) perf at speed 1, winter, 1920×1080 DPR 2 (and DPR 1 for reference) ---------------- */
  for (const dpr of [2, 1]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push('perf pageerror: ' + e.message));
    await page.goto(base + '?mute=1&bot=1&autostart=1&autorestart=1&speed=16&seed=3');
    await page.waitForFunction(() => window.FF && FF.debug && FF.debug.world, null, { timeout: 20000 });
    // fast-forward until winter
    await page.waitForFunction(() => FF.debug.world && FF.debug.world.season === 3 && FF.debug.mode === 'playing', null, { timeout: 120000, polling: 200 })
      .catch(() => page.evaluate(() => { FF.debug.weather.setSeason(3, { instant: true }); }));
    await page.evaluate(() => FF.debug.setSpeed(1));
    await sleep(3000);  // let winter particles ramp to full count
    const r = await page.evaluate(() => new Promise(resolve => {
      const iv = [], work = []; let last = performance.now(); const t0 = last;
      // wrap the game's frame to measure JS work per frame
      const G = FF.Game, orig = G.frame.bind(G);
      G.frame = function (ts) { const a = performance.now(); orig(ts); work.push(performance.now() - a); };
      function tick(ts) {
        iv.push(ts - last); last = ts;
        if (ts - t0 < 10000) requestAnimationFrame(tick);
        else { G.frame = orig; resolve({ iv: iv.slice(5), work: work.slice(5), particles: FF.debug.weather.particles.length, season: FF.debug.world.season, mode: FF.debug.mode }); }
      }
      requestAnimationFrame(tick);
    }));
    await page.screenshot({ path: path.join(OUT, `playtest_winter_dpr${dpr}.png`) });
    report.perf.push({ viewport: '1920x1080', dpr, season: r.season, mode: r.mode, particles: r.particles,
      frameIntervalMs: stat(r.iv), fps: +(1000 / stat(r.iv).mean).toFixed(1), jsWorkMs: stat(r.work),
      longFramesOver20ms: r.iv.filter(x => x > 20).length, note: 'headless Chromium (software GL); real GPU should be faster' });
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(RES, 'browser_playtest.json'), JSON.stringify(report, null, 1));
  const hs = report.highSpeed;
  console.log(`high-speed: ${hs.games} games in ~${(hs.approxGameSeconds / 60).toFixed(0)} game-min; hits ${hs.hits}/${hs.drops} drops; scores ${JSON.stringify(hs.scores.slice(0, 20))}`);
  console.log('seasonsReached', JSON.stringify(hs.seasonsReached.slice(0, 20)));
  for (const p of report.perf) console.log(`perf dpr${p.dpr}: season ${p.season} particles ${p.particles} fps ${p.fps} interval ${JSON.stringify(p.frameIntervalMs)} js ${JSON.stringify(p.jsWorkMs)} >20ms:${p.longFramesOver20ms}`);
  console.log('errors', JSON.stringify(report.errors.concat(hs.gameErrors)));
  process.exit(report.errors.length || hs.gameErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
