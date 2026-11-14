// A/B frame-time comparison: the original game/ (A) and a patched copy (B), interleaved A B A B per
// configuration so background load on the machine hits both equally. Bot plays, adaptive=0, every frame
// flushed (raster cost inside the measured callback), CPU throttled.
// Usage: node tests/perf/ab.js --b /path/to/patched/game [--a game/] [--throttle 4] [--ms 3000] [--reps 2] [--out file.json]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { serve, INIT, summary, pct } = require('./lib');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const A = path.resolve(arg('a', path.join(__dirname, '..', '..', 'game'))), B = path.resolve(arg('b', ''));
const THR = +arg('throttle', 4), MS = +arg('ms', 3000), REPS = +arg('reps', 2);
const OUT = arg('out', path.join(__dirname, 'out', 'ab.json'));
const VPS = (arg('vps', '1280x720@1,1280x720@2,1920x1080@1,1920x1080@2,2560x1440@1,2560x1440@2,3840x2160@1,3840x2160@2')).split(',').map(s => { const m = /(\d+)x(\d+)@(\d+)/.exec(s); return [+m[1], +m[2], +m[3]]; });
const SEASONS = (arg('seasons', '0,1,2,3')).split(',').map(Number);
const NAMES = ['spring', 'summer', 'autumn', 'winter'];

(async () => {
  const sa = await serve(A), sb = await serve(B);
  const br = await chromium.launch();
  const rows = [];
  for (const [w, h, dpr] of VPS) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await ctx.addInitScript(INIT);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    for (const s of SEASONS) {
      const acc = { A: [], B: [] };
      for (let r = 0; r < REPS; r++) for (const which of ['A', 'B']) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await p.goto((which === 'A' ? sa.base : sb.base) + '?autostart=1&bot=1&mute=1&seed=3&diff=easy&adaptive=0&level=' + s);
        await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'playing' && PVM.debug.world.phase !== 'intro', null, { timeout: 20000 });
        await p.waitForTimeout(1200);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
        await p.evaluate(() => { __perf.frames = []; __perf.flush = true; __perf.rec = true; });
        await p.waitForTimeout(MS);
        const fr = await p.evaluate(() => { __perf.rec = false; return __perf.frames; });
        acc[which].push(...fr);
      }
      const a = summary(acc.A), b = summary(acc.B);
      rows.push({ w, h, dpr, season: NAMES[s], A: a, B: b });
      console.log(`${w}x${h}@${dpr} ${NAMES[s].padEnd(6)} cb p50 ${a.cb50} → ${b.cb50}   p95 ${a.cb95} → ${b.cb95}   p99 ${a.cb99} → ${b.cb99}   frames ${a.n} → ${b.n}`);
    }
    await ctx.close();
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ A, B, throttle: THR, ms: MS, reps: REPS, rows }, null, 1));
  console.log('wrote', OUT);
  await br.close(); sa.server.close(); sb.server.close();
})();
