#!/usr/bin/env node
// Dottie's Reef Parade — real-browser sanity run of the high-speed bot (?bot=1&speed=16&autostart=1).
//   node tests/sim/browser.js [seconds=40]     (needs `playwright` installed; serves game/ on a local port)
// Checks: no page errors, levels advance, frame time, particle/fx counts stay bounded, on desktop + phone + iPad viewports.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});

(async () => {
  const secs = +process.argv[2] || 40;
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  const views = [
    { name: 'desktop 1280×720', viewport: { width: 1280, height: 720 } },
    { name: 'iPhone landscape 844×390 (touch)', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { name: 'iPad portrait 820×1180 (touch)', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  ];
  const rows = [];
  for (const v of views) {
    const ctx = await browser.newContext(v);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://localhost:${port}/index.html?bot=1&speed=16&autostart=1`);
    await page.waitForFunction(() => window.RP && RP.debug && RP.debug.getState() && RP.debug.mode === 'playing', null, { timeout: 20000 });
    let maxP = 0, maxFx = 0, maxLevel = 0, last = null;
    const t0 = Date.now();
    const frames0 = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    while (Date.now() - t0 < secs * 1000) {
      await page.waitForTimeout(1000);
      last = await page.evaluate(() => RP.debug.getState());
      maxP = Math.max(maxP, last.particles); maxFx = Math.max(maxFx, last.fx); maxLevel = Math.max(maxLevel, last.level);
    }
    const errors = await page.evaluate(() => RP.debug.stats.errors || []);
    rows.push({ view: v.name, fps: frames0, maxLevel, simMin: (last.time / 60).toFixed(1), score: last.score, hearts: last.hearts, state: last.state,
      bonks: last.bonks, golds: last.golds, goldMissed: last.goldMissed, maxParticles: maxP, maxFx, errors: errs.concat(errors).slice(0, 5) });
    await ctx.close();
  }
  await browser.close(); server.close();
  let md = `# Browser bot run — ?bot=1&speed=16&autostart=1, ${secs} s real per viewport (headless Chromium)\n\n| Viewport | rAF fps | Sim min | Max level | Score | Hearts | Bonks | Gold | Max particles | Max fx | Errors |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.view} | ${r.fps} | ${r.simMin} | ${r.maxLevel} | ${r.score} | ${r.hearts} | ${r.bonks} | ${r.golds}/${r.golds + r.goldMissed} | ${r.maxParticles} | ${r.maxFx} | ${r.errors.length ? r.errors.join('<br>') : 'none'} |\n`;
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'results', 'browser.md'), md);
  console.log(md);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
