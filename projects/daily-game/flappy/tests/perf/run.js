// Family Flappy — performance harness (load + gameplay), Playwright/Chromium + CDP.
//   node tests/perf/run.js [baseUrl] [--label name] [--quick] [--only load,play,season,resize,micro,profile,trace]
//                         [--configs 1280x720@1,1920x1080@2 ...] [--cpu 1,4] [--seconds N]
// Without baseUrl it serves ../../game with tests/perf/server.js (GitHub-Pages-like: gzip, max-age=600, HTTP/1.1).
// Results → tests/perf/results/<label>.json (+ a summary on stdout).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./server');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const QUICK = argv.includes('--quick');
const LABEL = opt('label', 'baseline');
const ONLY = (opt('only', 'load,play,season,resize,micro,profile,trace')).split(',');
const SECONDS = +opt('seconds', QUICK ? 4 : 10);           // steady-state seconds per season
const OUTDIR = path.join(__dirname, 'results');
fs.mkdirSync(OUTDIR, { recursive: true });

const NET = {
  wifi: { name: 'Home Wi-Fi 30 Mbps / 40 ms', latency: 40, down: 30e6 / 8, up: 10e6 / 8 },
  fast4g: { name: 'Fast 4G 9 Mbps / 170 ms', latency: 170, down: 9e6 / 8, up: 1.5e6 / 8 },
  slow4g: { name: 'Slow 4G 1.6 Mbps / 300 ms', latency: 300, down: 1.6e6 / 8, up: 0.75e6 / 8 }
};
const parseCfg = s => { const m = /^(\d+)x(\d+)@([\d.]+)$/.exec(s); return { w: +m[1], h: +m[2], dsf: +m[3], name: s }; };
const PLAY_CONFIGS = (opt('configs', QUICK ? '1280x720@1,1920x1080@2' : '1280x720@1,1920x1080@1,1920x1080@1.5,1920x1080@2,2560x1440@1')).split(',').map(parseCfg);
const CPU = (opt('cpu', QUICK ? '1,4' : '1,4,6')).split(',').map(Number);

// ---------- in-page instrumentation (installed before any game script runs) ----------
const INIT = () => {
  // ?fakehz=N[&fakejit=ms]: drive requestAnimationFrame from a synthetic N Hz vsync clock (timestamps coarsened
  // to 0.1 ms like Chrome's) to check motion smoothness on 75/120/144 Hz monitors with the real game code.
  const fh = /[?&]fakehz=([\d.]+)/.exec(location.search);
  if (fh) {
    const hz = +fh[1], jm = /[?&]fakejit=([\d.]+)/.exec(location.search), jit = jm ? +jm[1] : 0;
    let q = [], k = 0; const t0 = performance.now();
    const g = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    const tick = () => {
      const now = performance.now();
      const next = t0 + (k + 1) * 1000 / hz;
      if (now >= next) {
        k = Math.floor((now - t0) * hz / 1000);   // skip missed vsyncs like a real compositor
        const ts = Math.round((t0 + k * 1000 / hz + g() * jit) * 10) / 10;
        const cbs = q; q = []; for (const cb of cbs) cb(ts);
      }
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }
  const P = window.__perf = { t0: performance.now(), marks: {}, longtasks: [], draws: [], misses: [], rec: false, frames: [], frameJs: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.longtasks.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  function hook() {
    const G = window.FF && FF.Game, A = window.FF && FF.Assets;
    if (A && !A.__hooked) {
      A.__hooked = true;
      const sp = A.sprite;
      A.sprite = function (key, w, h) {
        const ck = key + '|' + Math.round(w * 4) + '|' + Math.round(h * 4);
        if (this._cache.has(ck)) return sp.call(this, key, w, h);
        const t = performance.now(); const r = sp.call(this, key, w, h); const d = performance.now() - t;
        if (r) P.misses.push([+t.toFixed(1), key, r.width + 'x' + r.height, +d.toFixed(2)]);
        return r;
      };
    }
    if (G && G.renderer && !G.renderer.__hooked) {
      const R = G.renderer; R.__hooked = true;
      const dr = R.draw;
      R.draw = function (mode) {
        const t = performance.now(); dr.call(this, mode); const d = performance.now() - t;
        if (!P.marks.firstDrawEnd) { P.marks.firstDrawEnd = performance.now(); P.marks.firstDrawDur = d; }
        if (P.rec) {
          const w = G.world;
          P.draws.push([+(G.last || t).toFixed(2), +d.toFixed(2),   // time base = the rAF timestamp the game itself uses
             w ? (R._rs != null ? R._rs : w.scroll) : 0, w ? w.scrollSpeed : 0, G.speed, w && w.state === 'playing' ? 1 : 0]);
        }
      };
      const fr = G.frame;
      G.frame = function (ts) {
        const t = performance.now(); fr.call(this, ts);
        if (P.rec) P.frameJs.push([+ts.toFixed(1), +(performance.now() - t).toFixed(2)]);
      };
    }
    if (G && G.mode === 'title' && !P.marks.title) P.marks.title = performance.now();
    if (P.rec) P.frames.push(performance.now());
    requestAnimationFrame(hook);
  }
  requestAnimationFrame(hook);
  // titles may be reached between rAFs; poll faster with a microtask-ish interval too
  const iv = setInterval(() => { if (window.FF && FF.Game && FF.Game.mode === 'title' && !P.marks.title) P.marks.title = performance.now(); if (P.marks.title) clearInterval(iv); }, 2);
};

// ---------- helpers ----------
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r1 = x => Math.round(x * 10) / 10;
function frameStats(draws, refresh = 1000 / 60) {
  const iv = []; for (let i = 1; i < draws.length; i++) iv.push(draws[i][0] - draws[i - 1][0]);
  const dur = draws.map(d => d[1]);
  const dropped = iv.reduce((a, x) => a + Math.max(0, Math.round(x / refresh) - 1), 0);
  // motion smoothness: rendered scroll delta vs what the scroll speed says it should be for that frame interval
  const ratios = [];
  for (let i = 1; i < draws.length; i++) {
    if (!draws[i][5] || !draws[i - 1][5]) continue;
    const exp = draws[i][3] * draws[i][4] * (draws[i][0] - draws[i - 1][0]) / 1000;
    if (exp > 0.5) ratios.push((draws[i][2] - draws[i - 1][2]) / exp);
  }
  const rm = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const span = draws.length > 1 ? (draws[draws.length - 1][0] - draws[0][0]) / 1000 : 1;
  return { frames: draws.length, fps: r1((draws.length - 1) / span), p50: r1(pct(iv, 50)), p95: r1(pct(iv, 95)), p99: r1(pct(iv, 99)), max: r1(Math.max(0, ...iv)),
    over20ms: r1(100 * iv.filter(x => x > 20).length / (iv.length || 1)), dropped,
    drawP50: r1(pct(dur, 50)), drawP95: r1(pct(dur, 95)), drawMax: r1(Math.max(0, ...dur)),
    unevenScrollPct: r1(100 * ratios.filter(r => Math.abs(r - 1) > 0.25).length / (ratios.length || 1)),
    scrollRatioSD: +Math.sqrt(ratios.reduce((a, b) => a + (b - rm) ** 2, 0) / (ratios.length || 1)).toFixed(3) };
}

let browser;
async function newPage(cfg, cpu) {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dsf });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (cpu && cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  return { ctx, page, cdp };
}
const EXTRA_Q = opt('q', '');   // extra URL params, e.g. --q "maxpx=4&adaptive=0" to switch individual fixes off
const U = (base, q) => base + (base.includes('?') ? '&' : '?') + q + (EXTRA_Q ? '&' + EXTRA_Q : '');
async function bootTitle(page, base, q = 'mute=1&seed=42') {
  await page.goto(U(base, q));
  await page.waitForFunction(() => window.__perf && __perf.marks.title && __perf.marks.firstDrawEnd, null, { timeout: 120000 });
}
// start a bot game; season changes only when WE trigger them (pointsPerSeason made huge)
const START = () => {
  FF.debug.setAutoRestart(true);
  FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap();
  FF.debug.world.cfg.pointsPerSeason = 1e9;
  if (!window.__keep) window.__keep = setInterval(() => { const w = FF.debug.world; if (w && w.cfg.pointsPerSeason < 1e8) { w.cfg.pointsPerSeason = 1e9; if (FF.Game.bot == null) FF.debug.setBot(true, 1); } }, 50);
};
const JUMP = s => { const w = FF.debug.world; w.score = s * 10; w.seasonIndex = s; w.season = s % 4; w._emit({ type: 'season', season: s % 4, seasonIndex: s }); };
async function record(page, ms) {
  await page.evaluate(() => { __perf.draws = []; __perf.frames = []; __perf.frameJs = []; __perf.lt0 = __perf.longtasks.length; __perf.m0 = __perf.misses.length; __perf.g0 = FF.debug.stats.games; __perf.rec = true; });
  await page.waitForTimeout(ms);
  return page.evaluate(() => { __perf.rec = false; return { draws: __perf.draws, frameJs: __perf.frameJs, longtasks: __perf.longtasks.slice(__perf.lt0), misses: __perf.misses.slice(__perf.m0), gamesDuring: FF.debug.stats.games - __perf.g0, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; });
}
function summarize(rec) {
  const fs_ = frameStats(rec.draws);
  const js = rec.frameJs.map(x => x[1]);
  return Object.assign(fs_, { frameJsP50: r1(pct(js, 50)), frameJsP95: r1(pct(js, 95)), longTasks: rec.longtasks.length, longTaskMs: r1(rec.longtasks.reduce((a, l) => a + l[1], 0)),
    rasterMisses: rec.misses.length, rasterMs: r1(rec.misses.reduce((a, m) => a + m[3], 0)), restarts: rec.gamesDuring, heapMB: r1(rec.heap / 1048576) });
}

// ---------- 1. LOAD ----------
async function loadTests(base, expiredBase) {
  const out = [];
  const runs = [];
  for (const net of ['wifi', 'fast4g', 'slow4g']) runs.push({ net, cpu: 1, cfg: parseCfg('1920x1080@1') });
  runs.push({ net: 'wifi', cpu: 4, cfg: parseCfg('1920x1080@1') });
  runs.push({ net: 'wifi', cpu: 1, cfg: parseCfg('1920x1080@2') });
  if (QUICK) runs.splice(2, 1);
  for (const r of runs) {
    const { ctx, page, cdp } = await newPage(r.cfg, r.cpu);
    await cdp.send('Network.enable');
    const n = NET[r.net];
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.latency, downloadThroughput: n.down, uploadThroughput: n.up });
    for (const phase of ['cold', 'warm', 'expired']) {
      if (phase === 'expired' && !expiredBase) continue;
      const reqs = new Map();
      const onReq = e => reqs.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, ''), start: e.timestamp, type: e.type });
      const onResp = e => { const q = reqs.get(e.requestId); if (q) { q.status = e.response.status; q.cache = e.response.fromDiskCache || e.response.fromMemoryCache || false; q.ttfb = e.timestamp; } };
      const onFin = e => { const q = reqs.get(e.requestId); if (q) { q.end = e.timestamp; q.bytes = e.encodedDataLength; } };
      const onCached = e => { const q = reqs.get(e.requestId); if (q) q.cache = 'memory'; };
      cdp.on('Network.requestWillBeSent', onReq); cdp.on('Network.responseReceived', onResp); cdp.on('Network.loadingFinished', onFin); cdp.on('Network.requestServedFromCache', onCached);
      const b = phase === 'expired' ? expiredBase : base;
      if (phase === 'expired') { // prime the max-age=0 origin once, then measure the revalidating visit
        await page.goto(U(b, 'mute=1&seed=42')); await page.waitForFunction(() => window.__perf && __perf.marks.firstDrawEnd, null, { timeout: 120000 }); reqs.clear();
      }
      const tNav = Date.now();
      await bootTitle(page, b);
      await page.waitForTimeout(1500);   // let the first frames + attract demo settle; collect first-frame data
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, +p.startTime.toFixed(0)]));
        const first = __perf.misses.filter(x => x[0] <= __perf.marks.firstDrawEnd);
        return { dcl: +nav.domContentLoadedEventEnd.toFixed(0), load: +nav.loadEventEnd.toFixed(0), fp: paint['first-paint'], fcp: paint['first-contentful-paint'],
          title: +__perf.marks.title.toFixed(0), firstGameFrame: +__perf.marks.firstDrawEnd.toFixed(0), firstDrawMs: +__perf.marks.firstDrawDur.toFixed(1),
          firstFrameRasters: first.length, firstFrameRasterMs: +first.reduce((a, x) => a + x[3], 0).toFixed(1),
          longtasks: __perf.longtasks.filter(l => l[0] < __perf.marks.firstDrawEnd + 100) };
      });
      cdp.off('Network.requestWillBeSent', onReq); cdp.off('Network.responseReceived', onResp); cdp.off('Network.loadingFinished', onFin); cdp.off('Network.requestServedFromCache', onCached);
      const list = [...reqs.values()].filter(q => !q.url.startsWith('data:'));
      const t0 = Math.min(...list.map(q => q.start));
      const network = list.filter(q => !q.cache);
      const wf = list.map(q => ({ url: q.url, status: q.status, cache: q.cache, startMs: Math.round((q.start - t0) * 1000), endMs: q.end ? Math.round((q.end - t0) * 1000) : null, bytes: q.bytes }));
      // "waves": how many sequential dependency rounds the page needs (HTML → css/js/imgs → SVG art)
      const svgArt = wf.filter(q => /assets\/default\/(seasons|particles|bird|turtle|drop|heart)/.test(q.url));
      const res = { net: r.net, netName: n.name, cpu: r.cpu, viewport: r.cfg.name, phase, requests: list.length, networkRequests: network.length,
        status304: list.filter(q => q.status === 304).length, transferKB: r1(list.reduce((a, q) => a + (q.bytes || 0), 0) / 1024), ...m,
        artFirstReqMs: svgArt.length ? Math.min(...svgArt.map(q => q.startMs)) : null, artLastEndMs: svgArt.length ? Math.max(...svgArt.map(q => q.endMs || 0)) : null,
        wallMs: Date.now() - tNav, waterfall: wf };
      out.push(res);
      console.log(`LOAD ${r.net.padEnd(6)} cpu${r.cpu} ${r.cfg.name.padEnd(12)} ${phase.padEnd(7)} req=${res.requests} net=${res.networkRequests} 304=${res.status304} ${res.transferKB}KB fcp=${res.fcp} dcl=${res.dcl} title=${res.title} firstFrame=${res.firstGameFrame} (draw ${res.firstDrawMs}ms, ${res.firstFrameRasters} rasters ${res.firstFrameRasterMs}ms) art ${res.artFirstReqMs}..${res.artLastEndMs}ms`);
    }
    await ctx.close();
  }
  return out;
}

// ---------- 2. GAMEPLAY steady state per season ----------
async function playTests(base) {
  const out = [];
  const combos = [];
  for (const cfg of PLAY_CONFIGS) combos.push({ cfg, cpu: 1 });
  for (const cpu of CPU.filter(c => c > 1)) combos.push({ cfg: parseCfg('1920x1080@1'), cpu });
  if (!QUICK) combos.push({ cfg: parseCfg('1920x1080@2'), cpu: 4 });
  for (const { cfg, cpu } of combos) {
    const { ctx, page } = await newPage(cfg, cpu);
    await bootTitle(page, base, 'mute=1&seed=42');
    // title screen (attract demo + DOM menu on top)
    const title = summarize(await record(page, QUICK ? 2000 : 4000));
    await page.evaluate(START);
    const seasons = [];
    for (let s = 0; s < 4; s++) {
      if (s > 0) { await page.evaluate(JUMP, s); }
      await page.waitForTimeout(2500);   // let crossfade (1.6 s) + weather ramp finish
      const st = summarize(await record(page, SECONDS * 1000));
      seasons.push(Object.assign({ season: ['spring', 'summer', 'autumn', 'winter'][s] }, st));
    }
    const res = { viewport: cfg.name, cpu, backing: await page.evaluate(() => [FF.Game.renderer.canvas.width, FF.Game.renderer.canvas.height]), title, seasons, errors: page._errors };
    out.push(res);
    console.log(`PLAY ${cfg.name.padEnd(12)} cpu${cpu} backing ${res.backing.join('x')}  title fps=${title.fps} p95=${title.p95}`);
    for (const s of seasons) console.log(`     ${s.season.padEnd(7)} fps=${String(s.fps).padEnd(5)} p50=${s.p50} p95=${s.p95} p99=${s.p99} max=${s.max} >20ms=${s.over20ms}% dropped=${s.dropped} draw p50/p95=${s.drawP50}/${s.drawP95} js p50=${s.frameJsP50} LT=${s.longTasks} uneven=${s.unevenScrollPct}% sd=${s.scrollRatioSD} rasters=${s.rasterMisses} restarts=${s.restarts}`);
    await ctx.close();
  }
  return out;
}

// ---------- 3. SEASON CHANGE + restart hitches ----------
async function seasonTests(base) {
  const out = [];
  const combos = PLAY_CONFIGS.map(cfg => ({ cfg, cpu: 1 })).concat(CPU.filter(c => c > 1).map(cpu => ({ cfg: parseCfg('1920x1080@1'), cpu })));
  for (const { cfg, cpu } of combos) {
    const { ctx, page } = await newPage(cfg, cpu);
    await bootTitle(page, base);
    await page.evaluate(START);
    await page.waitForTimeout(1500);
    const changes = [];
    for (const s of [1, 2, 3, 4]) {
      await page.evaluate(() => { __perf.draws = []; __perf.frameJs = []; __perf.lt0 = __perf.longtasks.length; __perf.m0 = __perf.misses.length; __perf.rec = true; });
      await page.evaluate(JUMP, s);
      await page.waitForTimeout(2500);
      const rec = await page.evaluate(() => { __perf.rec = false; return { draws: __perf.draws, frameJs: __perf.frameJs, longtasks: __perf.longtasks.slice(__perf.lt0), misses: __perf.misses.slice(__perf.m0), gamesDuring: 0, heap: 0 }; });
      const st = summarize(rec);
      const worst = rec.draws.reduce((a, d) => d[1] > a ? d[1] : a, 0);
      changes.push({ to: ['spring', 'summer', 'autumn', 'winter'][s % 4] + (s >= 4 ? ' (lap 2)' : ''), worstFrameMs: r1(Math.max(st.max, worst)), worstDrawMs: r1(worst), rasterMisses: st.rasterMisses, rasterMs: st.rasterMs,
        crossfadeFps: st.fps, crossfadeP95: st.p95, dropped: st.dropped, longTasks: st.longTasks });
    }
    // game over in winter → Play Again (crossfade back to spring) : measure the restart hitch
    await page.evaluate(JUMP, 7);
    await page.waitForTimeout(2500);
    await page.evaluate(() => { __perf.draws = []; __perf.lt0 = __perf.longtasks.length; __perf.m0 = __perf.misses.length; __perf.rec = true; FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap(); FF.debug.world.cfg.pointsPerSeason = 1e9; });
    await page.waitForTimeout(2500);
    const rr = await page.evaluate(() => { __perf.rec = false; return { draws: __perf.draws, frameJs: [], longtasks: __perf.longtasks.slice(__perf.lt0), misses: __perf.misses.slice(__perf.m0), gamesDuring: 0, heap: 0 }; });
    const rs = summarize(rr);
    const restart = { worstFrameMs: r1(Math.max(rs.max, rs.drawMax)), rasterMisses: rs.rasterMisses, rasterMs: rs.rasterMs, dropped: rs.dropped };
    out.push({ viewport: cfg.name, cpu, changes, restartFromWinter: restart });
    console.log(`SEASON ${cfg.name.padEnd(12)} cpu${cpu} ` + changes.map(c => `${c.to}: worst ${c.worstFrameMs}ms (${c.rasterMisses} rasters ${c.rasterMs}ms, dropped ${c.dropped})`).join(' | ') + ` | restart→spring: worst ${restart.worstFrameMs}ms (${restart.rasterMisses} rasters)`);
    await ctx.close();
  }
  return out;
}

// ---------- 4. RESIZE / fullscreen ----------
async function resizeTests(base) {
  const out = [];
  for (const cpu of QUICK ? [1] : [1, 4]) {
    const { ctx, page } = await newPage(parseCfg('1280x720@1'), cpu);
    await bootTitle(page, base);
    await page.evaluate(START);
    await page.waitForTimeout(1500);
    const steps = [];
    for (const [w, h] of [[1920, 1080], [1280, 720], [1366, 768], [2560, 1440]]) {
      await page.evaluate(() => { __perf.draws = []; __perf.lt0 = __perf.longtasks.length; __perf.m0 = __perf.misses.length; __perf.rec = true; });
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(1500);
      const rec = await page.evaluate(() => { __perf.rec = false; return { draws: __perf.draws, frameJs: [], longtasks: __perf.longtasks.slice(__perf.lt0), misses: __perf.misses.slice(__perf.m0), gamesDuring: 0, heap: 0 }; });
      const st = summarize(rec);
      steps.push({ to: w + 'x' + h, worstFrameMs: r1(Math.max(st.max, st.drawMax)), rasterMisses: st.rasterMisses, rasterMs: st.rasterMs, dropped: st.dropped });
    }
    out.push({ cpu, steps });
    console.log(`RESIZE cpu${cpu} ` + steps.map(s => `→${s.to}: worst ${s.worstFrameMs}ms (${s.rasterMisses} rasters ${s.rasterMs}ms)`).join(' | '));
    await ctx.close();
  }
  return out;
}

// ---------- 5. micro-benchmarks: what one frame's pieces cost at a given backing size ----------
async function microTests(base) {
  const out = [];
  for (const cfg of [parseCfg('1280x720@1'), parseCfg('1920x1080@1'), parseCfg('2560x1440@1')]) {
    const { ctx, page } = await newPage(cfg, 1);
    await bootTitle(page, base);
    await page.evaluate(START);
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      FF.debug.setSpeed(0);
      const R = FF.Game.renderer, A = FF.Assets, g = R.ctx, W = 960, H = 540;
      const flush = () => g.getImageData(0, 0, 1, 1);
      const bench = (fn, n = 20) => { flush(); const t = performance.now(); for (let i = 0; i < n; i++) fn(i); flush(); return +((performance.now() - t) / n).toFixed(3); };
      const res = { backing: R.canvas.width + 'x' + R.canvas.height };
      g.setTransform(R.px, 0, 0, R.px, 0, 0);
      const sky = A.sprite('spring_sky', W, H), mid = A.sprite('spring_mid', W, H);
      res.flushOnly = bench(() => {});
      g.imageSmoothingQuality = 'high';
      res.fullLayer_scaledHigh = bench(i => g.drawImage(mid, -(i % 7), 0, W + 1 / R.px, H));   // what tile() does today
      res.fullLayer_opaqueSky = bench(() => g.drawImage(sky, 0, 0, W, H));
      g.imageSmoothingQuality = 'low';
      res.fullLayer_scaledLow = bench(i => g.drawImage(mid, -(i % 7), 0, W + 1 / R.px, H));
      g.setTransform(1, 0, 0, 1, 0, 0);
      res.fullLayer_1to1Device = bench(i => g.drawImage(mid, -(i % 7), 0));
      g.setTransform(R.px, 0, 0, R.px, 0, 0); g.imageSmoothingQuality = 'high';
      res.backdrop4Layers = bench(() => R.backdrop(0, 1));
      res.fullRectTint = bench(() => { g.fillStyle = 'rgba(255,214,232,0.05)'; g.fillRect(0, 0, W, H); });
      res.sunRays6Gradients = bench(() => R.ambient({ tint: null, sunRays: 0.85, fog: 0 }));
      res.fogGradient = bench(() => { const grd = g.createLinearGradient(0, 260, 0, 540); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(240,246,255,0.12)'); g.fillStyle = grd; g.fillRect(0, 260, W, 280); });
      res.fadeLayer = bench(() => R.fadeLayer(() => R.backdrop(1, 1), 0.5), 10);
      res.hudText = bench(() => R.hud('playing'));
      FF.Game.weather.setSeason(3, { instant: true });
      res.particlesWinter = bench(() => { R.particles('back'); R.particles('front'); });
      FF.Game.weather.setSeason(0, { instant: true });
      res.particlesSpring = bench(() => { R.particles('back'); R.particles('front'); });
      res.trimSeasons = bench(() => A.trimSeasons([0, 0]), 200);
      res.fullDraw = bench(() => R.draw('playing'));
      // raster cost of each season layer at this scale (what a lazy miss costs during play)
      res.raster = {};
      for (const l of ['sky', 'clouds', 'far', 'mid', 'ground']) {
        const ck = [...A._cache.keys()].filter(k => k.startsWith('autumn_' + l + '|')); ck.forEach(k => A._cache.delete(k));
        res.raster['autumn_' + l] = bench(() => { const c = A.sprite('autumn_' + l, W, l === 'ground' ? 80 : H); g.drawImage(c, 0, 0, 1, 1); for (const k of [...A._cache.keys()]) if (k.startsWith('autumn_' + l + '|')) A._cache.delete(k); }, 3);
      }
      FF.debug.setSpeed(1);
      return res;
    });
    out.push(Object.assign({ viewport: cfg.name }, r));
    console.log('MICRO ' + cfg.name + ' ' + JSON.stringify(r));
    await ctx.close();
  }
  return out;
}

// ---------- 5b. motion smoothness on other refresh rates (synthetic vsync clock, real game code) ----------
async function judderTests(base) {
  const out = [];
  for (const hz of [60, 75, 120, 144]) for (const jit of [0, 0.25]) {
    const { ctx, page } = await newPage(parseCfg('1280x720@1'), 1);
    await bootTitle(page, base, `mute=1&seed=42&fakehz=${hz}&fakejit=${jit}`);
    await page.evaluate(START);
    await page.waitForTimeout(1500);
    const rec = await record(page, QUICK ? 3000 : 6000);
    const st = frameStats(rec.draws, 1000 / hz);
    out.push({ hz, jitterMs: jit, fps: st.fps, unevenScrollPct: st.unevenScrollPct, scrollRatioSD: st.scrollRatioSD, p95: st.p95 });
    console.log(`JUDDER ${hz}Hz jitter ${jit}ms: fps=${st.fps} uneven=${st.unevenScrollPct}% sd=${st.scrollRatioSD}`);
    await ctx.close();
  }
  return out;
}

// ---------- 6. CPU profile (top self time) ----------
async function profileTest(base, cfgName = '1920x1080@1', cpu = 4, season = 1) {
  const { ctx, page, cdp } = await newPage(parseCfg(cfgName), cpu);
  await bootTitle(page, base);
  await page.evaluate(START);
  if (season) await page.evaluate(JUMP, season);
  await page.waitForTimeout(3000);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(QUICK ? 4000 : 10000);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = {}; const byId = new Map(profile.nodes.map(n => [n.id, n]));
  for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
  const self = {}; let total = 0;
  for (const [id, us] of Object.entries(dt)) {
    const n = byId.get(+id); const cf = n.callFrame;
    const k = (cf.functionName || '(anonymous)') + ' ' + (cf.url ? cf.url.split('/').slice(-1)[0] + ':' + (cf.lineNumber + 1) : '');
    self[k] = (self[k] || 0) + us; total += us;
  }
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => ({ fn: k.trim(), ms: r1(us / 1000), pct: r1(100 * us / total) }));
  await ctx.close();
  console.log(`PROFILE ${cfgName} cpu${cpu} season ${season}: ` + top.slice(0, 12).map(t => `${t.fn} ${t.pct}%`).join(' | '));
  return { viewport: cfgName, cpu, season, totalMs: r1(total / 1000), top };
}

// ---------- 7. Trace: GC + paint/raster/GPU split on the main thread ----------
async function traceTest(base, cfgName = '1920x1080@1', cpu = 1) {
  const { ctx, page, cdp } = await newPage(parseCfg(cfgName), cpu);
  await bootTitle(page, base);
  await page.evaluate(START);
  await page.evaluate(JUMP, 3);
  await page.waitForTimeout(3000);
  const events = [];
  cdp.on('Tracing.dataCollected', e => { for (const ev of e.value) events.push(ev); });
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'blink', 'cc', 'gpu', 'disabled-by-default-devtools.timeline'] } });
  await page.waitForTimeout(QUICK ? 3000 : 8000);
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  // main renderer thread = thread with most FunctionCall/FireAnimationFrame
  const counts = {}; for (const e of events) if (e.name === 'FireAnimationFrame') counts[e.pid + ':' + e.tid] = (counts[e.pid + ':' + e.tid] || 0) + 1;
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const [pid, tid] = main ? main[0].split(':').map(Number) : [0, 0];
  const agg = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    const onMain = e.pid === pid && e.tid === tid;
    const k = (onMain ? 'main:' : 'other:') + e.name;
    if (!agg[k]) agg[k] = { n: 0, ms: 0, max: 0 };
    agg[k].n++; agg[k].ms += e.dur / 1000; agg[k].max = Math.max(agg[k].max, e.dur / 1000);
  }
  const pick = Object.entries(agg).filter(([k]) => /GC|Scavenge|MarkCompact|FireAnimationFrame|Paint|Raster|Composite|Canvas|UpdateLayer|Layout|RunTask|ThreadControllerImpl::RunTask|ProxyMain|Commit|DrawFrame|Gpu|SwapBuffers/.test(k))
    .sort((a, b) => b[1].ms - a[1].ms).slice(0, 30).map(([k, v]) => ({ event: k, n: v.n, totalMs: r1(v.ms), maxMs: r1(v.max) }));
  await ctx.close();
  console.log(`TRACE ${cfgName} cpu${cpu}: ` + pick.slice(0, 12).map(p => `${p.event} n=${p.n} ${p.totalMs}ms max ${p.maxMs}`).join(' | '));
  return { viewport: cfgName, cpu, seconds: QUICK ? 3 : 8, events: pick };
}

(async () => {
  // PERF_ROOT = folder to serve (default ../../game); a scratch copy with fixes can be measured the same way
  const ROOT = process.env.PERF_ROOT || path.join(__dirname, '..', '..', 'game');
  let srv, srv2, base = argv.find(a => /^https?:/.test(a)), expiredBase = null;
  if (!base) { srv = await start(ROOT, 8780); base = 'http://127.0.0.1:8780/index.html'; }
  // second origin with max-age=0 = a visit more than 10 min later on GitHub Pages (every file revalidated → 304s)
  if (!argv.find(a => /^https?:/.test(a)) || process.env.PERF_ROOT) { srv2 = await start(ROOT, 8790, { maxAge: 0 }); expiredBase = 'http://127.0.0.1:8790/index.html'; }
  browser = await chromium.launch();
  const res = { label: LABEL, base, date: new Date().toISOString(), chromium: browser.version(), quick: QUICK };
  try {
    if (ONLY.includes('load')) res.load = await loadTests(base, expiredBase);
    if (ONLY.includes('judder')) res.judder = await judderTests(base);
    if (ONLY.includes('micro')) res.micro = await microTests(base);
    if (ONLY.includes('play')) res.play = await playTests(base);
    if (ONLY.includes('season')) res.season = await seasonTests(base);
    if (ONLY.includes('resize')) res.resize = await resizeTests(base);
    if (ONLY.includes('profile')) res.profile = [await profileTest(base, '1920x1080@1', 4, 1), await profileTest(base, '1920x1080@2', 1, 3)];
    if (ONLY.includes('trace')) res.trace = await traceTest(base);
  } finally {
    const f = path.join(OUTDIR, LABEL + '.json');
    fs.writeFileSync(f, JSON.stringify(res, null, 1));
    console.log('results → ' + f);
    await browser.close();
    if (srv) srv.close(); if (srv2) srv2.close();
  }
})();
