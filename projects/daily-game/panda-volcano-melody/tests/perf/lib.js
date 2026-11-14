// Shared helpers for the perf harness: a static server for any game root, and an init script that
// records every rAF frame (interval between frames + time spent inside the callback).
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
      fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(d);
      });
    });
    server.listen(0, () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port + '/' }));
  });
}

// Runs in the page before any game script. window.__perf.frames = [[ts, intervalMs, callbackMs], ...]
// When __perf.flush is on, every frame ends with a 1-pixel readback of the game canvas: this forces the
// recorded canvas 2D work to rasterize inside the callback, so callbackMs then includes the raster cost
// (headless Chromium otherwise rasterizes off the measured path).
const INIT = `(() => {
  const P = window.__perf = { frames: [], rec: false, flush: false, last: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => {
    const t0 = performance.now();
    cb(ts);
    if (P.flush) { const c = document.getElementById('game'); if (c && c.width) { try { c.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) {} } }
    const t1 = performance.now();
    if (P.rec) P.frames.push([ts, P.last ? ts - P.last : 0, t1 - t0]);
    P.last = ts;
  });
})();`;

function pct(a, q) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
function summary(frames) {
  const iv = frames.map(f => f[1]).filter(x => x > 0), cb = frames.map(f => f[2]);
  const r = x => +x.toFixed(2);
  return {
    n: frames.length,
    cb50: r(pct(cb, 0.5)), cb95: r(pct(cb, 0.95)), cb99: r(pct(cb, 0.99)), cbMax: r(Math.max(0, ...cb)),
    iv50: r(pct(iv, 0.5)), iv95: r(pct(iv, 0.95)), iv99: r(pct(iv, 0.99)), ivMax: r(Math.max(0, ...iv)),
    over33: iv.filter(x => x > 33.4).length
  };
}
module.exports = { serve, INIT, summary, pct };
