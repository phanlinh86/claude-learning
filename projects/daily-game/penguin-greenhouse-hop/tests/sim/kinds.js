// Puddle's Greenhouse Hop — leaf and basket feel probe (report-only).
//   node tests/sim/kinds.js [nSeeds=20] [--patch file.json]
// Casual player, unlimited hearts, 300 s per seed, all difficulties. Per size band:
//  leaf   — share of leaf landings whose bend hits the maxBend clamp (the leaf "slams" and its velocity is zeroed),
//           median predicted peak depth, how far the stem side of the next landing is (sag at the next touch);
//  basket — the swing amplitude / ampMax at landing, share at the cap, |basket vx| at landing (how much it moves
//           under her feet), falls in the hop after a basket take-off.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const args = process.argv.slice(2);
const N = +(args.find(a => /^\d+$/.test(a)) || 20);
const pi = args.indexOf('--patch');
const patch = pi >= 0 ? JSON.parse(fs.readFileSync(args[pi + 1], 'utf8')) : {};
const f = (x, n = 2) => (x === undefined || Number.isNaN(x)) ? '–' : (+x).toFixed(n);
const band = s => s < 1.15 ? '1.0–1.15' : s < 1.3 ? '1.15–1.3' : s < 1.45 ? '1.3–1.45' : '1.45+';
const BANDS = ['1.0–1.15', '1.15–1.3', '1.3–1.45', '1.45+'];

console.log('| diff | size band | leaf landings | hit maxBend clamp | med peak depth | landed on an already-bent leaf (|bend| > 0.05) | basket landings | amp/ampMax med | at cap | med |vx| basket u/s |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const d of ['easy', 'normal', 'hard']) {
  const PH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
  const C = PH.World.CONFIG;
  const B = {}; for (const b of BANDS) B[b] = { leaf: 0, clamp: 0, depth: [], bent: 0, bas: 0, amp: [], cap: 0, vx: [] };
  for (let s = 0; s < N; s++) {
    const w = new PH.World({ seed: 8100 + s, difficulty: d }); w.hearts = 1e6;
    const pl = L.PLAYERS.casual(PH, w, 8100 + s);
    let pendingBent = null;
    while (w.time < 300) {
      // bend state of every leaf just before the step (to see if she lands on a leaf still moving)
      const bendBefore = new Map(); for (const p of w.platforms) if (p.kind === 'leaf') bendBefore.set(p.id, p.bend);
      pl.step(1 / 60); w.update(1 / 60);
      for (const e of w.drainEvents()) {
        const b = B[band(w.hero.size)];
        if (e.type === 'leafBend') { b.leaf++; b.depth.push(e.depth); if (e.depth >= 0.999) b.clamp++; if (Math.abs(bendBefore.get(e.p.id) || 0) > 0.05) b.bent++; }
        if (e.type === 'bounce' && e.kind === 'basket') {
          b.bas++; const A = PH.World.basketAmp(e.p); b.amp.push(A / e.p.ampMax); if (A >= e.p.ampMax - 1e-3) b.cap++; b.vx.push(Math.abs(e.p.vx));
        }
        if (e.type === 'fall') w.hearts = 1e6;
      }
    }
  }
  for (const k of BANDS) {
    const b = B[k];
    console.log(`| ${d} | ${k} | ${b.leaf} | ${f(100 * b.clamp / Math.max(1, b.leaf), 0)} % | ${f(L.quant(b.depth, 0.5))} | ${f(100 * b.bent / Math.max(1, b.leaf), 0)} % | ${b.bas} | ${f(L.quant(b.amp, 0.5))} | ${f(100 * b.cap / Math.max(1, b.bas), 0)} % | ${f(L.quant(b.vx, 0.5))} |`);
  }
}
