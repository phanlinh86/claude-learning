// Family Flappy — overdraw counter: device pixels written per frame by drawImage/fillRect (GPU-independent).
// On a GPU-accelerated canvas the per-frame cost is dominated by fill/blend bandwidth, so
// "megapixels blended per frame × 60" vs the GPU's fill rate is the number that matters there.
//   node tests/perf/overdraw.js [label=dir ...]      e.g. baseline=game fix=/tmp/claude-0/perf/game_fix
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

const pairs = process.argv.slice(2).length ? process.argv.slice(2) : ['baseline=' + path.join(__dirname, '..', '..', 'game')];
const CFGS = [[1280, 720, 1], [1920, 1080, 1], [1920, 1080, 2], [2560, 1440, 1]];

(async () => {
  const browser = await chromium.launch();
  const out = {};
  let port = 8800;
  for (const pr of pairs) {
    const [label, dir] = pr.split('=');
    const srv = await start(path.resolve(dir), ++port);
    out[label] = [];
    for (const [w, h, dsf] of CFGS) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
      await page.goto(`http://127.0.0.1:${port}/index.html?mute=1&seed=42&adaptive=0`);
      await page.waitForFunction(() => FF.debug && FF.debug.mode === 'title');
      const r = await page.evaluate(() => {
        const G = FF.Game, R = G.renderer;
        FF.debug.setSpeed(0); FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap();
        let px = 0, calls = 0;
        const P = CanvasRenderingContext2D.prototype;
        const det = g => { const m = g.getTransform(); return Math.abs(m.a * m.d - m.b * m.c); };
        const di = P.drawImage, fr = P.fillRect;
        P.drawImage = function (img, ...a) {
          if (this.canvas === R.canvas || this.canvas === R._off) {
            let dw, dh; if (a.length === 2) { dw = img.width; dh = img.height; } else if (a.length === 4) { dw = a[2]; dh = a[3]; } else { dw = a[6]; dh = a[7]; }
            px += Math.abs(dw * dh) * det(this); calls++;
          }
          return di.call(this, img, ...a);
        };
        P.fillRect = function (x, y, w, h) { if (this.canvas === R.canvas || this.canvas === R._off) { px += Math.abs(w * h) * det(this); calls++; } return fr.call(this, x, y, w, h); };
        const res = { backing: R.canvas.width + 'x' + R.canvas.height, backingMP: +(R.canvas.width * R.canvas.height / 1e6).toFixed(2), seasons: {} };
        const names = ['spring', 'summer', 'autumn', 'winter'];
        for (let s = 0; s < 4; s++) {
          const w = G.world;
          if (s) { w.score = s * 10; w.seasonIndex = s; w.season = s; G.weather.setSeason(s, { instant: true }); R.setSeason(s, true); }
          for (let i = 0; i < 200; i++) { G.step(1 / 60); R.update(1 / 60); }
          px = 0; calls = 0; R.draw(G.mode);
          res.seasons[names[s]] = { MPperFrame: +(px / 1e6).toFixed(1), overdraw: +(px / (R.canvas.width * R.canvas.height)).toFixed(2), calls };
        }
        // a crossfade frame (winter → spring)
        R.setSeason(0); R.vis.t = 0.5; px = 0; calls = 0; R.draw(G.mode);
        res.crossfade = { MPperFrame: +(px / 1e6).toFixed(1), overdraw: +(px / (R.canvas.width * R.canvas.height)).toFixed(2), calls };
        P.drawImage = di; P.fillRect = fr;
        return res;
      });
      r.viewport = `${w}x${h}@${dsf}`;
      out[label].push(r);
      console.log(label.padEnd(9), r.viewport.padEnd(13), r.backing.padEnd(10), Object.entries(r.seasons).map(([k, v]) => `${k} ${v.MPperFrame}MP (${v.overdraw}x)`).join('  '), ` crossfade ${r.crossfade.MPperFrame}MP (${r.crossfade.overdraw}x)`);
      await page.close();
    }
    srv.close();
  }
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'results', 'overdraw.json'), JSON.stringify(out, null, 1));
  await browser.close();
})();
