// Perf harness for Tofu's Volcano Melody.
// Usage: node tests/perf/measure.js [--root game/] [--out tests/perf/out/name.json] [--suite all|load|frames|quick|cache|hitch|adaptive]
//   --root lets the same harness measure a patched scratch copy of game/ (before/after).
// Frame suite: per season, bot playing at speed 1 (adaptive=0 so quality is fixed), 4 viewports × DPR 1/2,
// CPU throttled 4× (a phone-ish main thread). Every frame is flushed (1-px readback) so canvas raster cost
// is inside the measured callback time.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { serve, INIT, summary } = require('./lib');

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.join(__dirname, '..', '..', 'game')));
const OUT = arg('out', path.join(__dirname, 'out', 'perf.json'));
const SUITE = arg('suite', 'all');
const THROTTLE = +arg('throttle', 4);
const MEASURE_MS = +arg('ms', 5000);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const VIEWPORTS = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const Q = 'autostart=1&bot=1&mute=1&seed=3&diff=easy';

async function newPage(b, w, h, dpr, extra) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }, extra || {}));
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  return { ctx, p, cdp, errors };
}
const record = async (p, ms, flush) => {
  await p.evaluate(f => { __perf.frames = []; __perf.flush = f; __perf.rec = true; }, !!flush);
  await p.waitForTimeout(ms);
  return p.evaluate(() => { __perf.rec = false; return __perf.frames; });
};
const ready = p => p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'playing' && PVM.debug.world.phase !== 'intro', null, { timeout: 20000 });

async function loadSuite(b, base) {
  const res = [];
  for (const [w, h, dpr, thr] of [[1280, 720, 1, 1], [1280, 720, 1, 4], [1024, 768, 2, 4]]) {
    const { ctx, p, cdp } = await newPage(b, w, h, dpr);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
    const reqs = {}; let bytes = 0, n = 0;
    cdp.on('Network.requestWillBeSent', e => { reqs[e.requestId] = { url: e.request.url.replace(base, ''), t0: e.timestamp }; });
    cdp.on('Network.loadingFinished', e => { const r = reqs[e.requestId]; if (r) { r.bytes = e.encodedDataLength; r.t1 = e.timestamp; bytes += e.encodedDataLength; n++; } });
    const t0 = Date.now();
    await p.goto(base + '?mute=1&seed=7');
    const tDom = Date.now() - t0;
    await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'title', null, { timeout: 30000, polling: 10 });
    const tTitle = Date.now() - t0;
    const bytesAtTitle = bytes, nAtTitle = n;
    await p.waitForFunction(() => PVM.Assets.restDone, null, { timeout: 30000, polling: 20 });
    const tRest = Date.now() - t0;
    await p.waitForTimeout(1500);
    // first 2 s of title frames (warm-up jank)
    const fr = await record(p, 2000, true);
    const all = Object.values(reqs).filter(r => r.bytes != null).sort((a, b2) => a.t0 - b2.t0);
    const start = all.length ? all[0].t0 : 0;
    res.push({ w, h, dpr, throttle: thr, tDomMs: tDom, tTitleMs: tTitle, tAllArtMs: tRest, requestsAtTitle: nAtTitle, bytesAtTitle, requestsTotal: n, bytesTotal: bytes,
      titleFrames: summary(fr),
      waterfall: thr === 1 ? all.map(r => ({ url: r.url, kb: +(r.bytes / 1024).toFixed(1), startMs: Math.round((r.t0 - start) * 1000), endMs: Math.round((r.t1 - start) * 1000) })) : undefined });
    console.log('load', w + 'x' + h, 'dpr' + dpr, 'cpu' + thr + 'x', 'title', tTitle, 'ms', (bytesAtTitle / 1024).toFixed(0), 'KB at title,', (bytes / 1024).toFixed(0), 'KB total', n, 'req');
    await ctx.close();
  }
  return res;
}

async function framesSuite(b, base, quick) {
  const res = [];
  const vps = quick ? [[1280, 720], [1920, 1080]] : VIEWPORTS;
  for (const [w, h] of vps) for (const dpr of (quick ? [1, 2] : [1, 2])) {
    const { ctx, p, cdp, errors } = await newPage(b, w, h, dpr);
    for (let s = 0; s < 4; s++) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await p.goto(base + '?' + Q + '&adaptive=0&level=' + s);
      await ready(p);
      await p.waitForTimeout(1500);   // idle warm-up of the season's sprites
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      await cdp.send('Performance.enable');
      const m0 = (await cdp.send('Performance.getMetrics')).metrics;
      const fr = await record(p, MEASURE_MS, true);
      const m1 = (await cdp.send('Performance.getMetrics')).metrics;
      await cdp.send('Performance.disable');
      const mv = (m, k) => (m.find(x => x.name === k) || {}).value || 0;
      const info = await p.evaluate(() => ({ cw: PVM.Game.renderer.c.width, ch: PVM.Game.renderer.c.height, px: +PVM.Game.renderer.px.toFixed(3), cache: PVM.Assets._cache.size, parts: PVM.debug.weather.particles.length }));
      const sm = summary(fr);
      const secs = MEASURE_MS / 1000;
      sm.scriptPerSec = +((mv(m1, 'ScriptDuration') - mv(m0, 'ScriptDuration')) / secs * 1000).toFixed(1);
      sm.taskPerSec = +((mv(m1, 'TaskDuration') - mv(m0, 'TaskDuration')) / secs * 1000).toFixed(1);
      res.push(Object.assign({ w, h, dpr, season: SEASONS[s], throttle: THROTTLE }, info, sm));
      console.log(`${w}x${h}@${dpr} ${SEASONS[s].padEnd(6)} canvas ${info.cw}x${info.ch} cb p50/95/99 ${sm.cb50}/${sm.cb95}/${sm.cb99}  iv p50/95/99 ${sm.iv50}/${sm.iv95}/${sm.iv99}  >33ms ${sm.over33}/${sm.n}  task ${sm.taskPerSec}ms/s  cache ${info.cache}`);
    }
    if (errors.length) console.log('ERRORS', errors.slice(0, 3));
    await ctx.close();
  }
  return res;
}

// Long bot run at speed 8 with autorestart: does the sprite cache stay bounded?
async function cacheSuite(b, base) {
  const { ctx, p } = await newPage(b, 1280, 720, 1);
  await p.goto(base + '?' + Q.replace('diff=easy', 'diff=normal') + '&speed=8&autorestart=1');
  await ready(p);
  const samples = [];
  for (let i = 0; i <= 24; i++) {
    const s = await p.evaluate(() => {
      const keys = [...PVM.Assets._cache.keys()];
      const byKey = {}; keys.forEach(k => { const b = k.split('|')[0]; byKey[b] = (byKey[b] || 0) + 1; });
      let px = 0; for (const c of PVM.Assets._cache.values()) px += c.width * c.height;
      return { t: +PVM.debug.world.t.toFixed(0), level: PVM.debug.world.level, games: PVM.debug.stats.games, size: keys.length, mpx: +(px / 1e6).toFixed(2), byKey, bg: Object.keys(PVM.Game.renderer._bgCache).length };
    });
    samples.push(s);
    if (i % 4 === 0) console.log('cache t+' + (i * 5) + 's', 'size', s.size, 'Mpx', s.mpx, 'level', s.level, 'games', s.games);
    await p.waitForTimeout(5000);
  }
  await ctx.close();
  return samples;
}

// Hitches: a season change (crossfade) and a window resize, measured frame by frame (4× CPU).
async function hitchSuite(b, base) {
  const res = {};
  for (const [w, h, dpr] of [[1280, 720, 1], [1920, 1080, 2]]) {
    const { ctx, p, cdp } = await newPage(b, w, h, dpr);
    await p.goto(base + '?' + Q + '&adaptive=0');
    await ready(p);
    await p.waitForTimeout(2500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const key = w + 'x' + h + '@' + dpr;
    res[key] = { seasonChange: [], resize: [] };
    for (let s = 1; s <= 4; s++) {
      await p.evaluate(() => { __perf.frames = []; __perf.flush = true; __perf.rec = true; });
      await p.waitForTimeout(300);
      await p.evaluate(lv => PVM.debug.gotoLevel(lv), s);
      await p.waitForTimeout(1800);
      const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
      const sm = summary(fr);
      res[key].seasonChange.push({ to: SEASONS[s % 4], cb50: sm.cb50, maxCb: sm.cbMax, top3: fr.map(f => +f[2].toFixed(1)).sort((a, b) => b - a).slice(0, 3), maxIv: sm.ivMax, over33: sm.over33, n: sm.n, p95: sm.iv95 });
      console.log(key, 'season →', SEASONS[s % 4], 'cb p50', sm.cb50, 'max cb', sm.cbMax, 'max iv', sm.ivMax, '>33ms', sm.over33);
      await p.waitForTimeout(1500);
    }
    for (const [rw, rh] of [[Math.round(w * 0.75), Math.round(h * 0.75)], [w, h], [Math.round(h * 0.6), w]]) {
      await p.evaluate(() => { __perf.frames = []; __perf.flush = true; __perf.rec = true; });
      await p.waitForTimeout(300);
      await p.setViewportSize({ width: rw, height: rh });
      await p.waitForTimeout(1500);
      const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
      const sm = summary(fr);
      res[key].resize.push({ to: rw + 'x' + rh, cb50: sm.cb50, maxCb: sm.cbMax, top3: fr.map(f => +f[2].toFixed(1)).sort((a, b) => b - a).slice(0, 3), maxIv: sm.ivMax, over33: sm.over33, n: sm.n });
      console.log(key, 'resize →', rw + 'x' + rh, 'cb p50', sm.cb50, 'max cb', sm.cbMax, 'max iv', sm.ivMax, '>33ms', sm.over33);
      await p.waitForTimeout(800);
    }
    await ctx.close();
  }
  return res;
}

// Adaptive quality: speed 1, adaptive on, 6× CPU at 1920×1080 DPR 2 (touch, like an iPad): what px does it settle on?
async function adaptiveSuite(b, base) {
  const out = [];
  for (const [w, h, dpr, touch, thr] of [[1920, 1080, 2, false, 6], [1180, 820, 2, true, 6], [844, 390, 3, true, 6]]) {
    const { ctx, p, cdp } = await newPage(b, w, h, dpr, touch ? { hasTouch: true, isMobile: true } : {});
    await p.goto(base + '?' + Q);
    await ready(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
    const trace = [];
    for (let i = 0; i < 12; i++) {
      const fr = await record(p, 2000, false);
      const sm = summary(fr);
      const st = await p.evaluate(() => ({ px: +PVM.Game.renderer.px.toFixed(3), maxPx: +(PVM.Game.renderer.maxPx || 0).toFixed(3), cw: PVM.Game.renderer.c.width }));
      trace.push(Object.assign({ s: (i + 1) * 2, iv50: sm.iv50, iv95: sm.iv95 }, st));
    }
    console.log('adaptive', w + 'x' + h + '@' + dpr, touch ? 'touch' : 'mouse', 'cpu' + thr + 'x', trace.map(t => t.px + '(' + t.iv50 + ')').join(' '));
    out.push({ w, h, dpr, touch, throttle: thr, trace });
    await ctx.close();
  }
  return out;
}

(async () => {
  const { server, base } = await serve(ROOT);
  const b = await chromium.launch();
  const result = { root: ROOT, date: new Date().toISOString(), throttle: THROTTLE, measureMs: MEASURE_MS };
  try {
    if (SUITE === 'all' || SUITE === 'load') result.load = await loadSuite(b, base);
    if (SUITE === 'all' || SUITE === 'frames' || SUITE === 'quick') result.frames = await framesSuite(b, base, SUITE === 'quick');
    if (SUITE === 'all' || SUITE === 'hitch') result.hitch = await hitchSuite(b, base);
    if (SUITE === 'all' || SUITE === 'cache') result.cache = await cacheSuite(b, base);
    if (SUITE === 'all' || SUITE === 'adaptive') result.adaptive = await adaptiveSuite(b, base);
  } catch (e) { console.error(e); result.error = String(e); }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log('wrote', OUT);
  await b.close(); server.close();
})();
