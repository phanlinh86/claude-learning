#!/usr/bin/env node
// QA: the REAL game in Playwright at ?speed=8&bot=1&autostart=1&autorestart=1&mute=1 for --secs wall seconds per viewport
// (report-only). Collects PB.debug.stats, console / page errors, rAF frame times (in page), event-order sanity from the world's
// own event stream (round → ask → right… → roundDone → rainbowDone → whoosh; 4 levels per session; stars only go up).
//   node tests/sim/qa_browser.js [--secs 90] [--vp iphone-portrait,ipad-landscape] [--age 4]
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SECS = +get('secs', 90), AGE = +get('age', 4);
const ALL = { 'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 3 }, 'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 2 },
  'iphone-landscape': { viewport: { width: 852, height: 393 }, dpr: 3 }, 'ipad-portrait': { viewport: { width: 820, height: 1180 }, dpr: 2 } };
const VPS = get('vp', 'iphone-portrait,ipad-landscape').split(',');

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const name of VPS) {
    const vp = ALL[name];
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [], warns = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warns.push(m.text()); });
    await page.addInitScript(() => {
      window.__ft = [];
      let last = 0;
      const tick = ts => { if (last) window.__ft.push(ts - last); last = ts; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.goto(`${srv.url}?speed=8&bot=1&autostart=1&autorestart=1&mute=1&age=${AGE}&lang=${name.includes('ipad') ? 'vi' : 'en'}`);
    await page.waitForFunction(() => window.PB && PB.debug && PB.debug.world, null, { timeout: 20000 });
    await page.evaluate(() => {
      const w = PB.debug.world, emit = w._emit.bind(w);
      window.__ev = [];
      w._emit = e => { window.__ev.push({ type: e.type, t: +w.time.toFixed(3), stars: e.stars, level: e.level, k: e.k, left: e.left, mode: e.mode, starsNow: w.stars }); return emit(e); };
    });
    const t0 = Date.now();
    const samples = [];
    while (Date.now() - t0 < SECS * 1000) {
      await page.waitForTimeout(10000);
      samples.push(await page.evaluate(() => ({ mode: PB.debug.mode, wt: PB.debug.world.time, stats: Object.assign({}, PB.debug.stats) })));
    }
    const r = await page.evaluate(() => {
      const ev = window.__ev, bad = [];
      let state = 'idle', lastStars = 0, levels = 0, sessions = 0, rights = 0, k = 0, rounds = 0;
      for (const e of ev) {
        if (e.starsNow < lastStars && e.type !== 'session') bad.push('stars went down at ' + e.t);
        lastStars = e.starsNow;
        switch (e.type) {
          case 'session': if (sessions && levels % 4) bad.push('session with ' + levels + ' levels'); sessions++; levels = 0; lastStars = 0; break;
          case 'level': levels++; break;
          case 'round': if (state !== 'idle' && state !== 'whoosh' && state !== 'talk') bad.push('round after ' + state + ' at ' + e.t); state = 'round'; k = e.k; rights = 0; rounds++; break;
          case 'ask': if (state !== 'round') bad.push('ask in ' + state); state = 'play'; break;
          case 'right': case 'assist': if (e.type === 'right') rights++; break;
          case 'roundDone': if (state !== 'play') bad.push('roundDone in ' + state); if (rights !== k) bad.push('roundDone with ' + rights + '/' + k + ' rights'); state = 'done'; break;
          case 'rainbowDone': if (state !== 'done') bad.push('rainbowDone in ' + state); state = 'rainbow'; break;
          case 'whoosh': if (state !== 'rainbow') bad.push('whoosh in ' + state); state = 'whoosh'; break;
          case 'talk': state = 'talk'; break;
          case 'levelDone': state = 'idle'; break;
        }
      }
      const ft = window.__ft.slice(60).sort((a, b) => a - b), q = p => ft[Math.min(ft.length - 1, Math.floor(p * ft.length))];
      return { events: ev.length, rounds, sessions, bad: bad.slice(0, 8), nBad: bad.length, frames: ft.length, ft50: q(0.5), ft95: q(0.95), ft99: q(0.99), ftMax: ft[ft.length - 1],
        over33: ft.filter(x => x > 33.4).length, stats: PB.debug.stats, worldTime: PB.debug.world.time, mode: PB.debug.mode,
        counts: ev.reduce((o, e) => (o[e.type] = (o[e.type] || 0) + 1, o), {}) };
    });
    r.vp = name; r.wall = (Date.now() - t0) / 1000; r.errors = errors.slice(0, 5); r.nErrors = errors.length; r.warns = warns.slice(0, 3); r.samples = samples.map(s => s.mode + '@' + s.wt.toFixed(0));
    res.push(r); console.log(JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'qa_browser.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
