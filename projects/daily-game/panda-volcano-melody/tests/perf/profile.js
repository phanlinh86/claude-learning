// Cost breakdown by ablation: the same bot scene measured with one draw stage switched off at a time.
// Also counts sprite rasterizations that happen inside a frame (cache misses on the hot path).
// Usage: node tests/perf/profile.js [--root game/] [--w 1920 --h 1080 --dpr 1 --throttle 1 --season 0]
const { chromium } = require('playwright');
const path = require('path');
const { serve, INIT, summary } = require('./lib');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.join(__dirname, '..', '..', 'game')));
const W = +arg('w', 1920), H = +arg('h', 1080), DPR = +arg('dpr', 1), THR = +arg('throttle', 1), SEASON = +arg('season', 0), MS = +arg('ms', 4000);

const ABL = {
  baseline: '', baseline2: '',
  noSea: `R._sea = () => null;`,
  noGround: `R._ground = () => null;`,
  noParticles: `R._particles = () => {};`,
  noHud: `R._hud = () => {};`,
  noJuice: `R._juice = () => {};`,
  noShadows: `R._shadows = () => {};`,
  noSprites: `R._sorted = () => {}; R._coco = () => {};`,
  baseline3: '',
  onlyClear: `R.draw = function () { this.g.setTransform(1,0,0,1,0,0); this.g.fillStyle = '#4cb8c4'; this.g.fillRect(0,0,this.c.width,this.c.height); };`
};

(async () => {
  const { server, base } = await serve(ROOT);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(INIT);
  await ctx.addInitScript(`(() => { window.__miss = { n: 0, ms: 0, keys: {} };
    const hook = () => { if (!window.PVM || !PVM.Assets || PVM.Assets.__h) return setTimeout(hook, 5); PVM.Assets.__h = 1;
      const A = PVM.Assets, orig = A.sprite;
      A.sprite = function (k, w, h) { const ck = k + '|' + Math.round(w * 4) + '|' + Math.round(h * 4); if (this._cache.has(ck)) return this._cache.get(ck);
        const t = performance.now(); const r = orig.call(this, k, w, h); if (__perf.rec) { __miss.n++; __miss.ms += performance.now() - t; __miss.keys[ck] = 1; } return r; }; };
    hook(); })();`);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  console.log(`profile ${W}x${H}@${DPR} cpu${THR}x season ${SEASON}`);
  for (const [name, code] of Object.entries(ABL)) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p.goto(base + '?autostart=1&bot=1&mute=1&seed=3&diff=easy&adaptive=0&level=' + SEASON);
    await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'playing' && PVM.debug.world.phase !== 'intro', null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.evaluate(c => { const R = PVM.Game.renderer; eval(c); __miss.n = 0; __miss.ms = 0; __miss.keys = {}; }, code);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
    await p.evaluate(() => { __perf.frames = []; __perf.flush = true; __perf.rec = true; });
    await p.waitForTimeout(MS);
    const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
    const m = await p.evaluate(() => ({ n: __miss.n, ms: +__miss.ms.toFixed(1), keys: Object.keys(__miss.keys).length }));
    const s = summary(fr);
    console.log(name.padEnd(12), 'cb p50', String(s.cb50).padStart(6), 'p95', String(s.cb95).padStart(6), 'p99', String(s.cb99).padStart(6), ' frames', s.n, ' in-frame rasters', m.n, '(' + m.keys + ' keys, ' + m.ms + ' ms)');
  }
  await b.close(); server.close();
})();
