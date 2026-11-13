// Performance harness for Comet's Gem Factory.
// Usage: node tests/perf/perf.js [--root <game dir>] [--out <json>] [--only load,frames,resize,memory] [--quick]
//   Serves the game with `python3 -m http.server` on a free port, drives it with headless Chromium (Playwright)
//   and prints/saves: load waterfall + SVG decode/raster cost, time to title, frame-time percentiles (rAF interval
//   AND the game's own simulate+draw work) per season at several viewports, with 4x CDP CPU throttling as a
//   phone proxy, hitches on season change / deal / resize, and memory + cache growth over a speed-8 bot run.
// Note: headless Chromium rasterizes canvas on the CPU, so absolute numbers are pessimistic vs. a real
// iPhone/iPad GPU; compare runs (before/after a fix) on the same machine.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net'), fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', path.join(__dirname, '..', '..', 'game')));
const OUT = opt('out', path.join(__dirname, '..', 'out', 'perf', 'perf.json'));
const ONLY = (opt('only', 'load,frames,resize,memory')).split(',');
const QUICK = args.includes('--quick');
const MEM_SECONDS = +opt('memsec', QUICK ? 40 : 180);
const SEASON_SEC = +opt('seasonsec', QUICK ? 3 : 5);
const FLUSH = args.includes('--flush');   // time the real raster cost inside each frame (A/B comparisons)
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const stats = a => ({ n: a.length, p50: r2(pct(a, 50)), p95: r2(pct(a, 95)), p99: r2(pct(a, 99)), max: r2(a.length ? Math.max(...a) : 0) });

// Injected before the game boots: wraps Game.frame and counts synchronous rasterizations inside frames.
const INSTRUMENT = () => {
  window.__perf = { rec: false, frames: [], rasters: 0, layers: 0, marks: [] };
  const P = window.__perf;
  const hook = () => {
    const G = window.CGF && CGF.Game, A = window.CGF && CGF.Assets, R = window.CGF && CGF.Renderer;
    if (!G || !A || !R || !G.frame || G.__wrapped) return false;
    G.__wrapped = true;
    const orig = G.frame;
    // ?perfflush=1: read one pixel back after draw so the deferred canvas raster is paid INSIDE the timed frame
    if (/[?&]perfflush=1/.test(location.search)) {
      const od = R.prototype.draw;
      R.prototype.draw = function (m) { od.call(this, m); try { this.g.getImageData(0, 0, 1, 1); } catch (e) { /* ignore */ } };
    }
    let lastTs = 0;
    G.frame = function (ts) {
      const t0 = performance.now();
      const r0 = P.rasters, l0 = P.layers;
      orig.call(this, ts);
      const work = performance.now() - t0;
      if (P.rec) {
        const w = this.world;
        P.frames.push({ ts, iv: lastTs ? ts - lastTs : 0, work, ras: P.rasters - r0, lay: P.layers - l0,
          season: w ? w.season : -1, k: this.renderer.vis.k, px: this.renderer.px, mark: P.pending || null });
        P.pending = null;
      }
      lastTs = ts;
    };
    const oras = A._raster;
    A._raster = function () { P.rasters++; return oras.apply(this, arguments); };
    const olay = R.prototype._layer;
    R.prototype._layer = function (key, w, h) {
      const ck = key + '@' + this.px.toFixed(4);
      if (!this._bgCache[ck] && CGF.Assets.img[key]) P.layers++;
      return olay.apply(this, arguments);
    };
    return true;
  };
  P.long = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* unsupported */ }
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 0);
  document.addEventListener('DOMContentLoaded', hook);
};

async function withServer(fn) {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { // wait until it answers
    const ok = await new Promise(r => { const s = net.connect(port, '127.0.0.1', () => { s.end(); r(true); }); s.on('error', () => r(false)); });
    if (ok) break; await sleep(100);
  }
  try { return await fn('http://127.0.0.1:' + port + '/'); } finally { srv.kill(); }
}

async function newPage(b, vp, extra) {
  const ctx = await b.newContext(Object.assign({ viewport: vp }, extra || {}));
  await ctx.addInitScript(INSTRUMENT);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  return { ctx, p, cdp, errors };
}

const frameSummary = fr => {
  const iv = fr.map(f => f.iv).filter(v => v > 0), wk = fr.map(f => f.work);
  return { raf: stats(iv), work: stats(wk), fps: r1(iv.length / (iv.reduce((a, b) => a + b, 0) / 1000 || 1)),
    over33: iv.filter(v => v > 33.4).length, over50: iv.filter(v => v > 50).length,
    rasters: fr.reduce((a, f) => a + f.ras, 0), layers: fr.reduce((a, f) => a + f.lay, 0) };
};

async function testLoad(b, base) {
  const { ctx, p, cdp, errors } = await newPage(b, { width: 1280, height: 720 });
  await cdp.send('Network.enable');
  const reqs = {};
  cdp.on('Network.responseReceived', e => { reqs[e.requestId] = Object.assign(reqs[e.requestId] || {}, { url: e.response.url, type: e.type, t0: e.response.timing ? e.response.timing.requestTime : 0 }); });
  cdp.on('Network.loadingFinished', e => { if (reqs[e.requestId]) { reqs[e.requestId].bytes = e.encodedDataLength; reqs[e.requestId].tEnd = e.timestamp; } });
  const t0 = Date.now();
  await p.goto(base + '?mute=1&seed=7');
  await p.waitForFunction(() => window.CGF && CGF.debug && CGF.debug.mode === 'title' && window.__perf, null, { timeout: 15000 });
  const tTitle = Date.now() - t0;
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fp = performance.getEntriesByType('paint'); return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, paints: fp.map(x => [x.name, Math.round(x.startTime)]), titleAt: performance.now() }; });
  await p.waitForFunction(() => CGF.Assets.restDone, null, { timeout: 15000 });
  await sleep(500);
  const list = Object.values(reqs).filter(r => r.bytes != null).map(r => ({ url: r.url.replace(base, ''), bytes: r.bytes, ms: r.tEnd && r.t0 ? Math.round((r.tEnd - r.t0) * 1000) : null }));
  list.sort((a, b2) => b2.bytes - a.bytes);
  // SVG decode + raster cost (the outside layers are the big ones)
  const svg = await p.evaluate(async () => {
    const out = [];
    const keys = ['outside_spring', 'outside_summer', 'outside_autumn', 'outside_winter', 'room_wall', 'room_floor', 'gizmo_idle', 'kitten_0', 'gem_star'];
    for (const k of keys) {
      const src = CGF.Assets.files[k] + '?nocache=' + Math.random();
      const img = new Image(); img.src = src;
      const t0 = performance.now(); await img.decode(); const dec = performance.now() - t0;
      const res = {};
      for (const [W, H] of [[960, 540], [1920, 1080]]) {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        const t1 = performance.now(); g.drawImage(img, 0, 0, W, H); g.getImageData(0, 0, 1, 1); res[W + 'x' + H] = Math.round((performance.now() - t1) * 10) / 10;
        // second draw (Chromium caches the decoded SVG raster per size)
        const t2 = performance.now(); g.drawImage(img, 0, 0, W, H); g.getImageData(0, 0, 1, 1); res[W + 'x' + H + '_again'] = Math.round((performance.now() - t2) * 10) / 10;
      }
      out.push({ key: k, decodeMs: Math.round(dec * 10) / 10, raster: res });
    }
    return out;
  });
  await ctx.close();
  return { timeToTitleMs: tTitle, nav, totalBytes: list.reduce((a, r) => a + r.bytes, 0), requests: list.length, largest: list.slice(0, 10), svg, errors };
}

async function waitPlaying(p) {
  await p.waitForFunction(() => window.CGF && CGF.debug && CGF.debug.mode === 'playing' && CGF.Game.__wrapped, null, { timeout: 20000 });
}

async function testFrames(b, base, cfg) {
  const { ctx, p, cdp, errors } = await newPage(b, cfg.vp, cfg.ctx);
  await p.goto(base + '?bot=1&mute=1&autostart=1&seed=7' + (cfg.q || '') + (FLUSH ? '&perfflush=1' : '') + (args.includes('--noadapt') ? '&adaptive=0' : ''));
  await p.evaluate(() => { __perf.long = []; }).catch(() => {});
  await waitPlaying(p);
  await p.waitForFunction(() => CGF.Assets.restDone, null, { timeout: 15000 });
  await sleep(1500);
  if (cfg.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.throttle });
  await sleep(1000);
  const res = { name: cfg.name, vp: cfg.vp, throttle: cfg.throttle, seasons: [] };
  for (let s = 0; s < 4; s++) {
    await p.evaluate(s2 => { __perf.frames = []; __perf.rec = true; __perf.pending = 'goto'; CGF.debug.gotoLevel(s2); }, s);
    await sleep(SEASON_SEC * 1000);
    const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
    const lt = await p.evaluate(() => { const l = __perf.long; __perf.long = []; return l; });
    // transition window = first 1.6 s (crossfade 1.4 s + deal slide)
    const tStart = fr.length ? fr[0].ts : 0;
    const trans = fr.filter(f => f.ts - tStart < 1600), steady = fr.filter(f => f.ts - tStart >= 1600);
    const first = fr.slice(0, 3).map(f => ({ iv: r1(f.iv), work: r1(f.work), ras: f.ras, lay: f.lay }));
    const ltT = lt.filter(e => e[0] >= tStart && e[0] < tStart + 1600), ltS = lt.filter(e => e[0] >= tStart + 1600);
    const ltSum = a => ({ n: a.length, ms: Math.round(a.reduce((x, e) => x + e[1], 0)), max: Math.round(Math.max(0, ...a.map(e => e[1]))) });
    res.seasons.push({ season: s, steady: frameSummary(steady), transition: frameSummary(trans), firstFrames: first, px: r2(fr.length ? fr[fr.length - 1].px : 0), longTasks: { transition: ltSum(ltT), steady: ltSum(ltS) } });
  }
  res.canvas = await p.evaluate(() => [CGF.Game.renderer.c.width, CGF.Game.renderer.c.height, CGF.Game.renderer.px, CGF.Game.renderer.maxPx]);
  res.errors = errors;
  await ctx.close();
  return res;
}

async function testResize(b, base) {
  const out = [];
  for (const thr of [1, 4]) {
    const { ctx, p, cdp } = await newPage(b, { width: 1280, height: 720 });
    await p.goto(base + '?bot=1&mute=1&autostart=1&seed=7');
    await waitPlaying(p); await p.waitForFunction(() => CGF.Assets.restDone); await sleep(1500);
    if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
    await sleep(800);
    for (const [w, h, label] of [[1920, 1080, 'grow to 1920x1080'], [1080, 1920, 'rotate to portrait 1080x1920'], [1920, 1080, 'rotate back to landscape'], [1280, 720, 'shrink to 1280x720']]) {
      await p.evaluate(() => { __perf.frames = []; __perf.rec = true; });
      await p.setViewportSize({ width: w, height: h });
      await sleep(1500);
      const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
      const iv = fr.map(f => f.iv).filter(Boolean);
      const worst = fr.slice().sort((a, b2) => b2.iv - a.iv)[0] || {};
      out.push({ throttle: thr, label, maxIntervalMs: r1(Math.max(0, ...iv)), maxWorkMs: r1(Math.max(0, ...fr.map(f => f.work))), over33: iv.filter(v => v > 33.4).length, rasters: fr.reduce((a, f) => a + f.ras, 0), layers: fr.reduce((a, f) => a + f.lay, 0), worstFrame: { iv: r1(worst.iv || 0), work: r1(worst.work || 0), ras: worst.ras, lay: worst.lay } });
    }
    await ctx.close();
  }
  return out;
}

async function testMemory(b, base) {
  const { ctx, p, cdp, errors } = await newPage(b, { width: 1280, height: 720 });
  await cdp.send('Performance.enable');
  await p.goto(base + '?bot=1&mute=1&autostart=1&autorestart=1&speed=8&seed=7');
  await waitPlaying(p); await p.waitForFunction(() => CGF.Assets.restDone); await sleep(1000);
  const samples = [];
  const sample = async t => {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const m = (await cdp.send('Performance.getMetrics')).metrics.reduce((o, x) => (o[x.name] = x.value, o), {});
    const s = await p.evaluate(() => {
      const A = CGF.Assets, R = CGF.Game.renderer, w = CGF.Game.world;
      let spriteBytes = 0; for (const c of A._cache.values()) spriteBytes += c.width * c.height * 4;
      let bgBytes = 0; for (const k in R._bgCache) bgBytes += R._bgCache[k].width * R._bgCache[k].height * 4;
      let plateBytes = 0; const pk = Object.keys(R._plates); for (const k of pk) plateBytes += R._plates[k].width * R._plates[k].height * 4;
      return { sprites: A._cache.size, spriteMB: +(spriteBytes / 1048576).toFixed(2), bgLayers: Object.keys(R._bgCache).length, bgMB: +(bgBytes / 1048576).toFixed(2),
        plates: pk.length, plateMB: +(plateBytes / 1048576).toFixed(2), particles: CGF.Game.weather.particles.length, fx: R.texts.length + R.rings.length,
        flyers: w.flyers.length, games: CGF.Game.stats.games, level: w.level, rasters: __perf.rasters, errors: CGF.Game.stats.errors.length };
    });
    samples.push(Object.assign({ t, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, docs: m.Documents }, s));
  };
  const t0 = Date.now();
  await sample(0);
  while ((Date.now() - t0) / 1000 < MEM_SECONDS) { await sleep(Math.min(15000, MEM_SECONDS * 1000 / 6)); await sample(Math.round((Date.now() - t0) / 1000)); }
  await ctx.close();
  return { seconds: MEM_SECONDS, samples, errors };
}

(async () => {
  const result = { root: ROOT, date: new Date().toISOString() };
  await withServer(async base => {
    const b = await chromium.launch();
    try {
      if (ONLY.includes('load')) { result.load = await testLoad(b, base); console.log('load', JSON.stringify({ tt: result.load.timeToTitleMs, bytes: result.load.totalBytes })); }
      if (ONLY.includes('frames')) {
        const cfgs = [
          { name: '1280x720', vp: { width: 1280, height: 720 }, throttle: 1 },
          { name: '1920x1080', vp: { width: 1920, height: 1080 }, throttle: 1 },
          { name: '2560x1440', vp: { width: 2560, height: 1440 }, throttle: 1 },
          { name: '3840x2160', vp: { width: 3840, height: 2160 }, throttle: 1 },
          { name: '1280x720 cpu4x', vp: { width: 1280, height: 720 }, throttle: 4 },
          { name: '1920x1080 cpu4x', vp: { width: 1920, height: 1080 }, throttle: 4 },
          { name: 'iPhone 844x390@3 cpu4x', vp: { width: 844, height: 390 }, throttle: 4, ctx: { deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
          { name: 'iPad 1180x820@2 cpu4x', vp: { width: 1180, height: 820 }, throttle: 4, ctx: { deviceScaleFactor: 2, isMobile: true, hasTouch: true } }
        ];
        const pick = opt('cfg', null);
        result.frames = [];
        for (const c of cfgs) {
          if (pick && !pick.split('|').includes(c.name)) continue;
          if (QUICK && !/^(1280x720|3840x2160|1280x720 cpu4x|iPhone.*)$/.test(c.name)) continue;
          const r = await testFrames(b, base, c); result.frames.push(r);
          console.log(c.name, r.seasons.map(s => `S${s.season} LT trans ${s.longTasks.transition.n}/${s.longTasks.transition.max}ms steady ${s.longTasks.steady.n}/${s.longTasks.steady.max}ms raf p50/95/99 ${s.steady.raf.p50}/${s.steady.raf.p95}/${s.steady.raf.p99} work ${s.steady.work.p50}/${s.steady.work.p95}/${s.steady.work.p99} | trans max ${s.transition.raf.max} work ${s.transition.work.max} ras ${s.transition.rasters}/${s.steady.rasters}`).join('\n   '), 'canvas', r.canvas.join('x'));
        }
      }
      if (ONLY.includes('resize')) { result.resize = await testResize(b, base); result.resize.forEach(r => console.log('resize', JSON.stringify(r))); }
      if (ONLY.includes('memory')) { result.memory = await testMemory(b, base); result.memory.samples.forEach(s => console.log('mem', JSON.stringify(s))); }
    } finally { await b.close(); }
  });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log('wrote', OUT);
})().catch(e => { console.error(e); process.exit(1); });
