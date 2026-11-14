// Load-independent work counters (A = game/, B = patched copy): what the renderer does per frame,
// counted rather than timed, so other processes on the machine cannot blur the comparison.
//  - pattern px/frame: device pixels filled with the sea pattern
//  - blit px/frame: device pixels of full-layer drawImage (ground)
//  - in-frame rasters: SVG→canvas rasterizations that happened inside a frame (sprite cache misses), and
//    full ground-layer rasterizations inside a frame — during steady play, after a resize, after a season change.
// Usage: node tests/perf/work.js --b /path/to/patched/game [--a game/]
const { chromium } = require('playwright');
const path = require('path');
const { serve, INIT, summary } = require('./lib');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const A = path.resolve(arg('a', path.join(__dirname, '..', '..', 'game'))), B = path.resolve(arg('b', ''));

const HOOK = `(() => {
  const W = window.__work = { patPx: 0, blitPx: 0, raster: 0, rasterMs: 0, layer: 0, layerMs: 0, frames: 0, inFrame: false };
  const P = CanvasRenderingContext2D.prototype, fr = P.fillRect, di = P.drawImage;
  P.fillRect = function (x, y, w, h) {
    if (W.inFrame && this.canvas.id === 'game' && this.fillStyle instanceof CanvasPattern) {
      const t = this.getTransform(), c = this.canvas;   // visible part of the rect, in device px
      const x0 = Math.max(0, x * t.a + t.e), y0 = Math.max(0, y * t.d + t.f), x1 = Math.min(c.width, (x + w) * t.a + t.e), y1 = Math.min(c.height, (y + h) * t.d + t.f);
      W.patPx += Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    }
    return fr.apply(this, arguments);
  };
  P.drawImage = function (img) {
    if (W.inFrame && this.canvas.id === 'game' && img && img.width >= 400) W.blitPx += img.width * img.height;
    return di.apply(this, arguments);
  };
  const hook = () => {
    if (!window.PVM || !PVM.Assets || !PVM.Renderer) return setTimeout(hook, 5);
    const As = PVM.Assets, r0 = As._raster;
    As._raster = function () { const t = performance.now(), v = r0.apply(this, arguments); if (W.inFrame) { W.raster++; W.rasterMs += performance.now() - t; } return v; };
    const RP = PVM.Renderer.prototype, l0 = RP._layer, d0 = RP.draw, g0 = RP._ground;
    RP._layer = function (key) { const had = Object.keys(this._bgCache).length, t = performance.now(), v = l0.apply(this, arguments);
      if (W.inFrame && Object.keys(this._bgCache).length > had) { W.layer++; W.layerMs += performance.now() - t; } return v; };
    RP.draw = function () { W.inFrame = true; W.frames++; try { return d0.apply(this, arguments); } finally { W.inFrame = false; } };
  };
  hook();
})();`;

async function run(br, base, label) {
  const out = {};
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(INIT); await ctx.addInitScript(HOOK);
  const p = await ctx.newPage();
  const reset = () => p.evaluate(() => { Object.assign(__work, { patPx: 0, blitPx: 0, raster: 0, rasterMs: 0, layer: 0, layerMs: 0, frames: 0 }); __perf.frames = []; __perf.flush = true; __perf.rec = true; });
  const take = async () => { const r = await p.evaluate(() => { __perf.rec = false; return { w: Object.assign({}, __work), f: __perf.frames }; }); const s = summary(r.f);
    return { frames: r.w.frames, patternPxPerFrame: Math.round(r.w.patPx / r.w.frames), blitPxPerFrame: Math.round(r.w.blitPx / r.w.frames), inFrameRasters: r.w.raster, rasterMs: +r.w.rasterMs.toFixed(1), inFrameLayers: r.w.layer, layerMs: +r.w.layerMs.toFixed(1), cbMax: s.cbMax, cb50: s.cb50 }; };
  await p.goto(base + '?autostart=1&bot=1&mute=1&seed=3&diff=easy&adaptive=0');
  await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'playing' && PVM.debug.world.phase !== 'intro', null, { timeout: 20000 });
  await p.waitForTimeout(2500);
  // steady play, 16:9 (no letterbox)
  await reset(); await p.waitForTimeout(10000); out.steady16x9 = await take();
  // resize to a 4:3 window (letterbox) and measure the next 1.5 s
  await reset(); await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(1500); out.resizeTo4x3 = await take();
  await reset(); await p.waitForTimeout(6000); out.steady4x3 = await take();
  await reset(); await p.setViewportSize({ width: 1280, height: 720 }); await p.waitForTimeout(1500); out.resizeBack = await take();
  // season changes (each 4 s apart, so the idle prewarm had time)
  await p.waitForTimeout(2000);
  await reset();
  for (const lv of [1, 2, 3, 4]) { await p.evaluate(l => PVM.debug.gotoLevel(l), lv); await p.waitForTimeout(4000); }
  out.seasonChanges = await take();
  out.bgLayersHeld = await p.evaluate(() => Object.keys(PVM.Game.renderer._bgCache).length);
  // adaptive-quality step: what one maxPx change costs inside a frame
  await reset(); await p.evaluate(() => { const R = PVM.Game.renderer; R.maxPx = R.px * 0.8; R.resize(); }); await p.waitForTimeout(1500); out.qualityStep = await take();
  await ctx.close();
  console.log(label, JSON.stringify(out));
  return out;
}

(async () => {
  const sa = await serve(A), sb = await serve(B);
  const br = await chromium.launch();
  const res = { A: await run(br, sa.base, 'A'), B: await run(br, sb.base, 'B') };
  require('fs').writeFileSync(arg('out', path.join(__dirname, 'out', 'work.json')), JSON.stringify(res, null, 1));
  for (const k of Object.keys(res.A)) console.log(k.padEnd(14), JSON.stringify(res.A[k]), '\n' + ' '.repeat(14), JSON.stringify(res.B[k]));
  await br.close(); sa.server.close(); sb.server.close();
})();
