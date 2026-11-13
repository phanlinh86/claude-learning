// Micro-benchmarks for the renderer's caching rules (deterministic: single page, forced raster, median of N).
// Usage: node tests/perf/micro.js [--root <game dir>] [--throttle 4]
//  1. SVG layer: cost of the first frame that uses a freshly built layer, with and without forcing the raster
//     at build time (canvas 2D defers the SVG draw until the canvas is first read or drawn).
//  2. Flyer gem: cost of one gem SVG rasterization at 56 px (paid per flyer per frame when the size changes).
//  3. Bench: drawing the bench paths every frame vs blitting a cached plate.
// Prints medians in ms. Serves the game with python3 -m http.server on a free port.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net'), path = require('path');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', path.join(__dirname, '..', '..', 'game')));
const THR = +opt('throttle', 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  await sleep(700);
  const b = await chromium.launch();
  try {
    for (const vp of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
      await p.goto(`http://127.0.0.1:${port}/?mute=1&seed=7&adaptive=0`);
      await p.waitForFunction(() => window.CGF && CGF.debug && CGF.debug.mode === 'title' && CGF.Assets.restDone, null, { timeout: 20000 });
      await sleep(1000);
      if (THR > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
      const r = await p.evaluate(() => {
        const R = CGF.Game.renderer, A = CGF.Assets, px = R.px, main = R.g;
        const med = a => { const s = a.slice().sort((x, y) => x - y); return Math.round(s[s.length >> 1] * 100) / 100; };
        const flush = g => g.getImageData(0, 0, 1, 1);
        const build = (key, w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w * px); c.height = Math.round(h * px); c.getContext('2d').drawImage(A.img[key], 0, 0, c.width, c.height); return c; };
        const out = { px: Math.round(px * 1000) / 1000, canvas: R.c.width + 'x' + R.c.height };
        // 1. layer: unforced build → first use in frame; forced build → first use in frame
        const keys = ['outside_spring', 'outside_summer', 'outside_autumn', 'outside_winter'];
        const lazy = [], lazyBuild = [], forced = [], forcedBuild = [];
        for (let i = 0; i < 3; i++) for (const k of keys) {
          flush(main);
          let t = performance.now(); const c1 = build(k, 960, 540); lazyBuild.push(performance.now() - t);
          t = performance.now(); main.drawImage(c1, 0, 0); flush(main); lazy.push(performance.now() - t);
          t = performance.now(); const c2 = build(k, 960, 540); flush(c2.getContext('2d')); forcedBuild.push(performance.now() - t);
          t = performance.now(); main.drawImage(c2, 0, 0); flush(main); forced.push(performance.now() - t);
        }
        out.layer = { unforced_build: med(lazyBuild), unforced_firstFrameUse: med(lazy), forced_build_idle: med(forcedBuild), forced_firstFrameUse: med(forced) };
        // 2. flyer gem raster at ~56 px (a new size every frame in the original renderer)
        const gem = [];
        for (let i = 0; i < 40; i++) { const s = 56 - i * 0.6; const t = performance.now(); const c = document.createElement('canvas'); c.width = Math.ceil(s * px); c.height = Math.ceil(s * px); const g = c.getContext('2d'); g.drawImage(A.img['gem_' + A.GEM_KINDS[i % 12]], 0, 0, c.width, c.height); flush(g); gem.push(performance.now() - t); }
        const blit = [], spr = A.sprite('gem_star', 56, 56);
        for (let i = 0; i < 40; i++) { const t = performance.now(); main.setTransform(px * 0.8, 0, 0, px * 0.8, 100, 100); main.drawImage(spr, 0, 0, 56, 56); flush(main); blit.push(performance.now() - t); }
        main.setTransform(1, 0, 0, 1, 0, 0);
        out.flyerGem = { rasterNewSize: med(gem), blitCached: med(blit) };
        // 3. bench: paths vs cached plate (fix only; skipped when the renderer has no _benchPlate)
        const bp = [], bc = [];
        R._logical();
        const W = CGF.Game.world;
        for (let i = 0; i < 30; i++) { const t = performance.now(); R._bench(W); flush(main); bp.push(performance.now() - t); }
        out.bench_current = med(bp);
        if (R._benchDraw) {
          const B = CGF.Renderer.BOARD;
          for (let i = 0; i < 30; i++) { const t = performance.now(); R._benchDraw(main, R.vis.cur, B.x - 12, B.y - 10, B.w + 24, B.h + 18); flush(main); bc.push(performance.now() - t); }
          out.bench_paths = med(bc);
        }
        // 4. 20 resting card plates: logical-space blit (sub-pixel, resampled) vs whole-device-pixel 1:1 blit
        const cw = 120, ch = 110, pl = R._plate('back', cw, ch), cs = [], ca = [];
        for (let i = 0; i < 30; i++) {
          let t = performance.now(); R._logical();
          for (let j = 0; j < 20; j++) main.drawImage(pl, 200 + (j % 5) * 133.3 - 2, 90 + ((j / 5) | 0) * 97.7 - 2, cw + 4, ch + 4);
          flush(main); cs.push(performance.now() - t);
          t = performance.now(); main.setTransform(1, 0, 0, 1, 0, 0);
          for (let j = 0; j < 20; j++) main.drawImage(pl, Math.round((R.ox + 200 + (j % 5) * 133.3 - 2) * px), Math.round((R.oy + 90 + ((j / 5) | 0) * 97.7 - 2) * px));
          flush(main); ca.push(performance.now() - t);
        }
        out.cards20 = { subpixel: med(cs), aligned: med(ca) };
        main.setTransform(1, 0, 0, 1, 0, 0);
        return out;
      });
      console.log(vp.width + 'x' + vp.height + ' cpu' + THR, JSON.stringify(r));
      await ctx.close();
    }
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
