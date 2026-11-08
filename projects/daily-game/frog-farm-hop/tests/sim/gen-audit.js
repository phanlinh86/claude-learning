// Clover's Farm Hop — generator fairness audit (read-only use of FH.World internals).
//   node tests/sim/gen-audit.js [--patch tests/sim/patch.json]
// Climbs the generator to ~2000 u (levels 0–15, loops 0–3) for 20 seeds × 3 difficulties and checks every pair of
// consecutive PATH platforms with a numeric hop (same integrator rules as World._stepHero: accel to maxVx, wind as an
// acceleration, windOverK cap) for:
//   edge  — from the near edge of A's landing window to B's window, cart ranges at their worst
//   centre — from the centre of A (what a kid does: bounce in the middle) to B's window
// under: no wind, and the strongest gust of that zone blowing AGAINST the hop for the whole flight.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const args = process.argv.slice(2);
const pi = args.indexOf('--patch');
const patch = pi >= 0 ? JSON.parse(fs.readFileSync(args[pi + 1], 'utf8')) : {};

function reachNum(C, dy, against) {             // horizontal distance by the time the feet come down through dy
  const dt = 1 / 240; let x = 0, vx = 0, y = 0, vy = C.bounceV;
  for (let t = 0; t < 3; t += dt) {
    if (vx < C.maxVx) { vx += C.accel * dt; if (vx > C.maxVx && vx - C.accel * dt <= C.maxVx) vx = C.maxVx; }
    vx -= against * dt;
    const vy0 = vy; vy = Math.max(-C.maxFall, vy - C.g * dt); const y0 = y; y += 0.5 * (vy0 + vy) * dt;
    x += vx * dt;
    if (vy < 0 && y0 >= dy && y <= dy) return x;
    if (vy < 0 && y < dy) return x;              // never got that high (only for dy > apex)
  }
  return x;
}

const out = {};
for (const d of ['easy', 'normal', 'hard']) {
  const FH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {})), C = FH.World.CONFIG;
  const res = { pairs: 0, maxDy: 0, edgeNeg: 0, edgeNegWind: 0, centreNeg: 0, centreNegWind: 0, minEdgeMarginWind: 9, centreNeed: [], worst: [] };
  for (let seed = 1; seed <= 20; seed++) {
    const w = new FH.World({ seed, difficulty: d });
    const seen = new Map();
    for (let y = 0; y < 2000; y += 0.5) {
      w.camY = y; w.hero.y = y + 4; w._stepScore(); w._generate();
      for (const p of w.platforms) if (p.path && !seen.has(p.id)) seen.set(p.id, p);
      w._cleanup();
    }
    const path = [...seen.values()].sort((a, b) => a.y - b.y);
    for (let i = 1; i < path.length; i++) {
      const A = path[i - 1], B = path[i], dy = B.y - A.y;
      const zone = B.lvl % 4, loop = Math.floor(B.lvl / 4);
      const ax = C.zones[zone].wind.ax * w.D.windK * (1 + 0.1 * loop);
      const dx = Math.abs(A.xm - B.xm) + A.hr + B.hr;
      const winA = A.w / 2 + C.landPad, winB = B.w / 2 + C.landPad;
      const needEdge = Math.max(0, dx - winA - winB), needCentre = Math.max(0, dx - winB);
      const r0 = reachNum(C, dy, 0), rw = reachNum(C, dy, ax);
      res.pairs++; res.maxDy = Math.max(res.maxDy, dy);
      if (needEdge > r0) res.edgeNeg++;
      if (needEdge > rw) { res.edgeNegWind++; if (res.worst.length < 5) res.worst.push({ seed, y: +B.y.toFixed(1), dy: +dy.toFixed(2), needEdge: +needEdge.toFixed(2), reachWind: +rw.toFixed(2), zone, kinds: A.kind + '>' + B.kind }); }
      if (needCentre > r0) res.centreNeg++;
      if (needCentre > rw) res.centreNegWind++;
      res.minEdgeMarginWind = Math.min(res.minEdgeMarginWind, rw - needEdge);
      if (B.lvl === 0) res.centreNeed.push(needCentre);
    }
  }
  const cn = res.centreNeed;
  out[d] = { pairs: res.pairs, maxDy: +res.maxDy.toFixed(2), impossibleNoWind: res.edgeNeg, impossibleWorstGust: res.edgeNegWind,
    minMarginWorstGust: +res.minEdgeMarginWind.toFixed(2), fromCentreNoWind: res.centreNeg, fromCentreWorstGust: res.centreNegWind,
    level1CentreNeed: { med: +L.quant(cn, 0.5).toFixed(2), p90: +L.quant(cn, 0.9).toFixed(2), max: +Math.max(...cn).toFixed(2), zeroShare: +(cn.filter(x => x === 0).length / cn.length).toFixed(2) },
    worst: res.worst };
  console.log(d, JSON.stringify(out[d]));
}
if (args.includes('--json')) console.log(JSON.stringify(out));
