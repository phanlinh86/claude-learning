// Spike's Dino Jam: environment art generator (4 biomes + particles).
// Writes original, hand-authored, procedurally-laid-out SVGs (seeded, deterministic).
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - ground.svg  512x512 opaque, seamless in x AND y (every element that crosses an edge is
//    re-emitted at ±512 on the opposite side). Calm, low-contrast mid-tones so the notes
//    (pink/blue/mint/orange/gold), Spike (brown/cream) and the trail pop.
//  - edge.svg    512x72 transparent, seamless in x (periodic waves use wavelengths 512/k; props
//    near the ends are wrapped). y=0 = outside, y≈56–72 = the inner edge facing the play area.
//    Drawn as top-down blobs so it still reads correctly when rotated for the 4 sides.
//  - decor_N.svg 128x128 upright 3/4 props, base at y≈112.
//  - particles   32x32 centred.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const T = 512; // ground tile size
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const rad = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
function smooth(pts, closed = true) {
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const n = pts.length;
  if (closed) {
    const s = m(pts[n - 1], pts[0]); let d = `M${f(s[0])} ${f(s[1])}`;
    for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); d += `Q${f(p[0])} ${f(p[1])} ${f(q[0])} ${f(q[1])}`; }
    return d + 'Z';
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < n - 1; i++) { const q = m(pts[i], pts[i + 1]); d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(q[0])} ${f(q[1])}`; }
  return d + `L${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`;
}
function blob(cx, cy, rx, ry, seed, n = 10, jit = 0.12) {
  const r = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n, k = 1 + (r() - 0.5) * 2 * jit; pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]); }
  return smooth(pts);
}
// periodic wave over 512 px: amps = [[amp, k]] with integer k → exactly tileable
const pwave = (seed, amps) => { const r = rng(seed); const ph = amps.map(() => r() * 6.283); return x => amps.reduce((s, [a, k], i) => s + a * Math.sin(x / T * k * 6.283 + ph[i]), 0); };
// emit fn(x, y) for each wrapped copy whose bounding circle (radius rr) touches the tile [0,W]x[0,H]
function wrap(x, y, rr, fn, W = T, H = T, wrapY = true) {
  let o = '';
  for (const dx of [-W, 0, W]) for (const dy of (wrapY ? [-H, 0, H] : [0])) {
    const X = x + dx, Y = y + dy;
    if (X + rr < 0 || X - rr > W || Y + rr < 0 || Y - rr > H) continue;
    o += fn(X, Y);
  }
  return o;
}
// rejection-sampled points with wrapped min distance
function scatter(seed, n, minD, avoid = []) {
  const r = rng(seed); const pts = []; let tries = 0;
  const wd = (a, b) => { let dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]); dx = Math.min(dx, T - dx); dy = Math.min(dy, T - dy); return Math.hypot(dx, dy); };
  while (pts.length < n && tries++ < n * 60) {
    const p = [r() * T, r() * T];
    if (pts.every(q => wd(p, q) >= minD) && avoid.every(([ax, ay, ar]) => wd(p, [ax, ay]) >= ar)) pts.push(p);
  }
  return pts;
}

// =====================================================================================
// PALETTES
// =====================================================================================
const PAL = {
  meadow: { base: '#8dbf5f', blobs: ['#86b858', '#95c667', '#81b254', '#99c96c'], tuft: '#72a249', tuftHi: '#a6d27a', dot: ['#fff6d6', '#ffe37e'],
    edge: { back: '#3c7a38', bush: '#5aa046', bushHi: '#7fbf58', bushD: '#4a8c3c', out: '#2e5f2c', shadow: '#2a4a1e', flower: ['#ffe066', '#fff8e0'] } },
  swamp: { base: '#5f9a8b', blobs: ['#589283', '#67a394', '#5c9787', '#6fa995'], moss: '#79ae8c', puddle: '#467f88', rim: '#7fb5ae', hi: '#a4d2cc', tuft: '#4f8673',
    edge: { water: '#2f6b74', waterHi: '#4e8f96', lily: '#62ad6a', lilyD: '#3f7f4a', lilyHi: '#8ccc84', reed: '#4f8a58', reedD: '#33663f', tail: '#8a5f3a', out: '#22505a', shadow: '#1c3c40' } },
  canyon: { base: '#d6a677', blobs: ['#cf9d6e', '#dcb084', '#d29f70', '#e0b78c'], crack: '#b47e54', pebble: '#c38a5e', pebbleHi: '#e7c49a', pebbleD: '#a26e48',
    edge: { rock: '#c5653f', rockHi: '#e08d5f', rockD: '#a04c30', out: '#6e3222', back: '#8e4029', shadow: '#5a2a18' } },
  snow: { base: '#e3ebf5', blobs: ['#d9e3f1', '#ebf1f9', '#e0ddf1', '#dce6f3'], shadow: '#c9d6ec', lilac: '#d3cdea', sparkle: '#ffffff',
    edge: { drift: '#f7faff', driftSh: '#c8d5ee', driftD: '#a9b8dc', out: '#7f8fbf', pine: '#3e7a6c', pineHi: '#5a9a86', pineD: '#2a5a50', cap: '#ffffff', shadow: '#5a6a9a' } },
};

// =====================================================================================
// GROUND TILES (512 x 512, opaque, seamless)
// =====================================================================================
function softBlobs(c, seed, n, rmin, rmax, op) {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) {
    const x = r() * T, y = r() * T, rx = rmin + r() * (rmax - rmin), ry = rx * (0.6 + r() * 0.35), col = c.blobs[i % c.blobs.length], s = seed * 100 + i;
    o += wrap(x, y, rx * 1.2, (X, Y) => pth(blob(X, Y, rx, ry, s, 10, 0.14), col, ` opacity="${op}"`));
  }
  return o;
}
function groundMeadow() {
  const c = PAL.meadow; const r = rng(101);
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 11, 12, 60, 120, 0.7) + softBlobs(c, 12, 16, 26, 52, 0.55);
  // grass tufts: small 3-blade "v" marks
  let d = '', dh = '';
  for (const [x, y] of scatter(13, 70, 34)) {
    const s = 0.8 + r() * 0.6;
    wrap(x, y, 10, (X, Y) => { d += `M${f(X - 5 * s)} ${f(Y - 4 * s)}L${f(X - 1.5 * s)} ${f(Y + 3 * s)}M${f(X)} ${f(Y - 7 * s)}L${f(X)} ${f(Y + 3 * s)}M${f(X + 5 * s)} ${f(Y - 4 * s)}L${f(X + 1.5 * s)} ${f(Y + 3 * s)}`; return ''; });
  }
  o += stk(d, c.tuft, 2.4, ' opacity="0.75"');
  for (const [x, y] of scatter(14, 40, 50)) wrap(x, y, 8, (X, Y) => { dh += `M${f(X - 3)} ${f(Y - 2)}L${f(X - 1)} ${f(Y + 2)}M${f(X + 2)} ${f(Y - 3)}L${f(X + 1)} ${f(Y + 2)}`; return ''; });
  o += stk(dh, c.tuftHi, 2, ' opacity="0.6"');
  // a few tiny clover / daisy dots (small and pale: never compete with notes)
  for (const [x, y] of scatter(15, 14, 90)) {
    const col = c.dot[Math.floor(r() * 2)];
    o += wrap(x, y, 8, (X, Y) => circ(X - 2.5, Y, 2.2, col, ' opacity="0.8"') + circ(X + 2.5, Y - 1, 2.2, col, ' opacity="0.8"') + circ(X, Y + 2.5, 2.2, col, ' opacity="0.8"'));
  }
  return svg(T, T, o);
}
function groundSwamp() {
  const c = PAL.swamp; const r = rng(201);
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 21, 12, 60, 120, 0.7) + softBlobs(c, 22, 14, 24, 50, 0.6);
  // puddles: 4 calm water blobs with a pale rim and one glint
  const pud = scatter(23, 4, 200);
  pud.forEach(([x, y], i) => {
    const rx = 30 + r() * 18, ry = rx * (0.55 + r() * 0.2), s = 2300 + i;
    o += wrap(x, y, rx + 8, (X, Y) => pth(blob(X, Y, rx + 4, ry + 4, s, 10, 0.1), c.rim, ' opacity="0.7"') + pth(blob(X, Y, rx, ry, s, 10, 0.1), c.puddle, ' opacity="0.85"') +
      stk(`M${f(X - rx * 0.5)} ${f(Y - ry * 0.35)}Q${f(X - rx * 0.1)} ${f(Y - ry * 0.6)} ${f(X + rx * 0.3)} ${f(Y - ry * 0.45)}`, c.hi, 2.5, ' opacity="0.6"'));
  });
  // moss clumps (rounded dot clusters)
  for (const [x, y] of scatter(24, 26, 60, pud.map(([a, b]) => [a, b, 70]))) {
    o += wrap(x, y, 12, (X, Y) => circ(X, Y, 5, c.moss, ' opacity="0.6"') + circ(X + 6, Y + 2, 4, c.moss, ' opacity="0.6"') + circ(X - 5, Y + 3, 3.5, c.moss, ' opacity="0.6"'));
  }
  // little sprouts
  let d = '';
  for (const [x, y] of scatter(25, 50, 40, pud.map(([a, b]) => [a, b, 60]))) wrap(x, y, 8, (X, Y) => { d += `M${f(X - 3)} ${f(Y - 4)}L${f(X)} ${f(Y + 2)}L${f(X + 3)} ${f(Y - 5)}`; return ''; });
  o += stk(d, c.tuft, 2.2, ' opacity="0.7"');
  return svg(T, T, o);
}
function groundCanyon() {
  const c = PAL.canyon; const r = rng(301);
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 31, 12, 60, 130, 0.85) + softBlobs(c, 32, 14, 24, 50, 0.65);
  // soft sandstone strata swirls (wide, low contrast)
  for (let i = 0; i < 4; i++) {
    const y0 = 60 + i * 128 + r() * 30, w = pwave(330 + i, [[10, 1], [5, 3]]);
    const pts = []; for (let x = -16; x <= T + 16; x += 32) pts.push([x, y0 + w(x)]);
    o += stk(smooth(pts, false), c.blobs[3], 7, ' opacity="0.5"');
  }
  // cracks: short branching polylines
  let d = '';
  for (const [x, y] of scatter(33, 9, 140)) {
    const a = r() * 6.28; const L = 20 + r() * 16;
    wrap(x, y, L + 14, (X, Y) => {
      let px = X, py = Y; d += `M${f(px)} ${f(py)}`;
      const rr = rng(Math.round(x * 7 + y));
      for (let k = 0; k < 4; k++) { px += Math.cos(a + (rr() - 0.5) * 1.2) * L / 4; py += Math.sin(a + (rr() - 0.5) * 1.2) * L / 4; d += `L${f(px)} ${f(py)}`; }
      d += `M${f(X + Math.cos(a) * L * 0.5)} ${f(Y + Math.sin(a) * L * 0.5)}l${f(Math.cos(a + 1.1) * 9)} ${f(Math.sin(a + 1.1) * 9)}`;
      return '';
    });
  }
  o += stk(d, c.crack, 2.2, ' opacity="0.7"');
  // pebbles
  for (const [x, y] of scatter(34, 34, 48)) {
    const s = 2.5 + r() * 3.5;
    o += wrap(x, y, s + 3, (X, Y) => ell(X, Y + 1.2, s * 1.25, s * 0.85, c.pebbleD, ' opacity="0.55"') + ell(X, Y, s * 1.2, s * 0.8, c.pebble) + ell(X - s * 0.35, Y - s * 0.3, s * 0.45, s * 0.28, c.pebbleHi, ' opacity="0.8"'));
  }
  return svg(T, T, o);
}
function groundSnow() {
  const c = PAL.snow; const r = rng(401);
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 41, 12, 60, 130, 0.75) + softBlobs(c, 42, 12, 26, 52, 0.65);
  // soft blue drift shadows: crescents (lit blob over shadow blob)
  scatter(43, 10, 120).forEach(([x, y], i) => {
    const rx = 26 + r() * 22, ry = rx * 0.45, s = 4300 + i, col = i % 3 ? c.shadow : c.lilac;
    o += wrap(x, y, rx + 8, (X, Y) => pth(blob(X, Y + 4, rx, ry, s, 10, 0.1), col, ' opacity="0.65"') + pth(blob(X, Y, rx * 0.96, ry * 0.9, s, 10, 0.1), c.blobs[1]));
  });
  // sparkle glints
  for (const [x, y] of scatter(44, 30, 60)) {
    const s = 2 + r() * 2.5;
    o += wrap(x, y, 6, (X, Y) => circ(X, Y, s, c.sparkle, ' opacity="0.9"'));
  }
  // tiny blue specks
  for (const [x, y] of scatter(45, 30, 54)) o += wrap(x, y, 4, (X, Y) => circ(X, Y, 1.8, c.shadow));
  return svg(T, T, o);
}

// =====================================================================================
// EDGE STRIPS (512 x 72, transparent, tileable in x). Bottom (y≈56–72) faces the arena.
// =====================================================================================
const EW = 512, EH = 72;
const ewrap = (x, rr, fn) => wrap(x, 0, rr, (X) => fn(X), EW, EH, false);
const wallBand = (fn, col, extra = '') => { const pts = []; for (let x = -16; x <= EW + 16; x += 16) pts.push([x, fn(x)]); return pth(smooth(pts, false) + `L${EW + 16} -2L-16 -2Z`, col, extra); };
function edgeMeadow() {
  const c = PAL.meadow.edge; const r = rng(501);
  let o = '';
  // soft contact shadow on the ground under the wall
  o += wallBand(x => 62 + pwave(51, [[3, 4], [2, 9]])(x), c.shadow, ' opacity="0.22"');
  // back hedge mass (fills the outside)
  o += wallBand(x => 40 + pwave(52, [[4, 3], [3, 7]])(x), c.back);
  // row of round bushes along the inner edge
  const n = 11; const bushes = [];
  for (let i = 0; i < n; i++) bushes.push([i * EW / n + (r() - 0.5) * 14, 36 + r() * 6, 20 + r() * 6, 1000 + i]);
  for (const [x, y, R, s] of bushes) o += ewrap(x, R + 4, X => pth(blob(X, y, R, R * 0.82, s, 10, 0.1), c.bush, OL(c.out)));
  for (const [x, y, R, s] of bushes) o += ewrap(x, R + 4, X => pth(blob(X - R * 0.12, y - R * 0.18, R * 0.7, R * 0.52, s + 7, 9, 0.12), c.bushHi, ' opacity="0.85"') + circ(X + R * 0.35, y + R * 0.4, R * 0.18, c.bushD, ' opacity="0.7"'));
  // small leaf ticks + a few yellow/white flowers on the bushes
  let d = '';
  for (const [x, y, R] of bushes) ewrap(x, R, X => { d += `M${f(X - R * 0.5)} ${f(y + R * 0.15)}q4 -3 7 0M${f(X + R * 0.1)} ${f(y - R * 0.35)}q4 -3 7 0`; return ''; });
  o += stk(d, c.out, 1.8, ' opacity="0.5"');
  for (let i = 0; i < 6; i++) {
    const x = (i + 0.4) * EW / 6 + (r() - 0.5) * 20, y = 30 + r() * 14, col = c.flower[i % 2];
    o += ewrap(x, 8, X => [0, 1, 2, 3, 4].map(k => circ(X + Math.cos(k * 1.256) * 3.3, y + Math.sin(k * 1.256) * 3.3, 2.6, col, OL('#b98a2a', 1))).join('') + circ(X, y, 2, '#f39a2a'));
  }
  return svg(EW, EH, o);
}
function edgeSwamp() {
  const c = PAL.swamp.edge; const r = rng(601);
  let o = '';
  o += wallBand(x => 66 + pwave(61, [[3, 3], [2, 8]])(x), c.shadow, ' opacity="0.25"');
  // dark still water fills the outside
  o += wallBand(x => 44 + pwave(62, [[4, 4], [2, 9]])(x), c.water, OL(c.out));
  let d = '';
  for (let i = 0; i < 7; i++) { const x = (i + 0.5) * EW / 7 + (r() - 0.5) * 20, y = 10 + r() * 14; ewrap(x, 14, X => { d += `M${f(X - 10)} ${f(y)}q10 -4 20 0`; return ''; }); }
  o += stk(d, c.waterHi, 2, ' opacity="0.8"');
  // lily pads floating on the water
  for (let i = 0; i < 6; i++) {
    const x = (i + 0.15) * EW / 6 + (r() - 0.5) * 18, y = 18 + r() * 10, R = 9 + r() * 4, a = r() * 6.28;
    const lp = (X) => { const a1 = a - 0.32, a2 = a + 0.32; return `M${f(X)} ${f(y)}L${f(X + Math.cos(a1) * R)} ${f(y + Math.sin(a1) * R * 0.75)}A${f(R)} ${f(R * 0.75)} 0 1 1 ${f(X + Math.cos(a2) * R)} ${f(y + Math.sin(a2) * R * 0.75)}Z`; };
    o += ewrap(x, R + 3, X => pth(lp(X), c.lily, OL(c.lilyD, 2.2)) + ell(X - R * 0.3, y - R * 0.25, R * 0.3, R * 0.16, c.lilyHi, ' opacity="0.8"') + (i % 3 === 1 ? circ(X + 2, y - 1, 3.2, '#fff4f8', OL('#c87a9c', 1.2)) : ''));
  }
  // mossy reed-bank tussocks along the inner edge (the soft "wall")
  const n = 12, tus = [];
  for (let i = 0; i < n; i++) tus.push([i * EW / n + (r() - 0.5) * 10, 50 + r() * 4, 16 + r() * 5, 6400 + i]);
  for (const [x, y, R, s] of tus) o += ewrap(x, R + 4, X => pth(blob(X, y, R, R * 0.72, s, 10, 0.1), c.reed, OL(c.out)));
  for (const [x, y, R, s] of tus) o += ewrap(x, R + 4, X => pth(blob(X - R * 0.15, y - R * 0.2, R * 0.65, R * 0.4, s + 5, 9, 0.12), '#7fb878', ' opacity="0.85"'));
  // reed blades fanning outward (up) from every other tussock + cattail heads
  tus.forEach(([x, y, R], i) => {
    if (i % 2) return; const rr = rng(6500 + i);
    o += ewrap(x, 30, X => {
      let b = '';
      for (let k = 0; k < 5; k++) { const ang = -Math.PI * (0.2 + 0.6 * k / 4) + (rr() - 0.5) * 0.2, L = 18 + rr() * 8; b += `M${f(X)} ${f(y - 4)}Q${f(X + Math.cos(ang) * L * 0.5)} ${f(y - 4 + Math.sin(ang) * L * 0.4)} ${f(X + Math.cos(ang) * L)} ${f(y - 4 + Math.sin(ang) * L)}`; }
      return stk(b, c.reedD, 4.6) + stk(b, '#6aa86a', 2.6) + ell(X - 6, y - 22, 2.8, 5.5, c.tail, OL('#5e3e24', 1.2)) + ell(X + 7, y - 20, 2.8, 5.5, c.tail, OL('#5e3e24', 1.2));
    });
  });
  return svg(EW, EH, o);
}
function edgeCanyon() {
  const c = PAL.canyon.edge; const r = rng(701);
  let o = '';
  o += wallBand(x => 64 + pwave(71, [[3, 3], [2, 7]])(x), c.shadow, ' opacity="0.22"');
  o += wallBand(x => 34 + pwave(72, [[4, 2], [3, 5]])(x), c.back);
  // boulders: two rows, back smaller and darker
  const row = (n, y0, R0, seed, col) => {
    let s = ''; const rr = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = i * EW / n + (rr() - 0.5) * 16, y = y0 + rr() * 6, R = R0 + rr() * 6, k = seed * 10 + i;
      s += ewrap(x, R + 4, X => pth(blob(X, y, R * 1.1, R * 0.8, k, 9, 0.14), col, OL(c.out)) +
        pth(blob(X - R * 0.25, y - R * 0.22, R * 0.6, R * 0.38, k + 3, 8, 0.15), c.rockHi, ' opacity="0.85"') +
        stk(`M${f(X + R * 0.2)} ${f(y + R * 0.1)}l${f(R * 0.25)} ${f(R * 0.3)}l${f(-R * 0.1)} ${f(R * 0.25)}`, c.out, 1.8, ' opacity="0.55"'));
    }
    return s;
  };
  o += row(10, 22, 14, 73, c.rockD) + row(8, 42, 18, 74, c.rock);
  // small sandy pebbles at the foot
  for (let i = 0; i < 9; i++) { const x = r() * EW, y = 62 + r() * 4, s = 2 + r() * 2; o += ewrap(x, s + 2, X => ell(X, y, s * 1.3, s, '#c98a5e', OL(c.out, 1))); }
  return svg(EW, EH, o);
}
function edgeSnow() {
  const c = PAL.snow.edge; const r = rng(801);
  let o = '';
  o += wallBand(x => 64 + pwave(81, [[3, 3], [2, 8]])(x), c.shadow, ' opacity="0.3"');
  // snowdrift mass in front
  o += wallBand(x => 50 + pwave(82, [[5, 4], [3, 9]])(x), c.driftSh, OL(c.out));
  o += wallBand(x => 44 + pwave(82, [[5, 4], [3, 9]])(x), c.drift);
  // small pines at the back (top-down stacked stars with snow caps)
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * EW / n + (r() - 0.5) * 20, y = 16 + r() * 6, R = 16 + r() * 4;
    const star = (X, Y, Rr, k) => { const pts = []; for (let j = 0; j < 14; j++) { const a = j * Math.PI / 7 + k; const rr = j % 2 ? Rr * 0.68 : Rr; pts.push([X + Math.cos(a) * rr, Y + Math.sin(a) * rr]); } return smooth(pts); };
    o += ewrap(x, R + 4, X => pth(star(X, y, R, i), c.pine, OL(c.pineD)) + pth(star(X - 1, y - 2, R * 0.66, i + 0.2), c.pineHi) + pth(star(X - 1.5, y - 3, R * 0.36, i + 0.4), c.cap, OL(c.driftSh, 1.5)));
  }
  // drift lumps along the edge
  for (let i = 0; i < 12; i++) {
    const x = i * EW / 12 + (r() - 0.5) * 12, y = 46 + r() * 4, R = 12 + r() * 5, s = 8300 + i;
    o += ewrap(x, R + 4, X => pth(blob(X, y + 3, R, R * 0.6, s, 9, 0.12), c.driftSh, OL(c.out, 2.5)) + pth(blob(X - 1, y, R * 0.92, R * 0.5, s, 9, 0.12), c.drift));
  }
  // sparkles
  for (let i = 0; i < 10; i++) { const x = r() * EW, y = 26 + r() * 22; o += ewrap(x, 3, X => circ(X, y, 1.6, '#ffffff') ); }
  return svg(EW, EH, o);
}

// =====================================================================================
// DECOR (128 x 128, upright 3/4, base at y≈112)
// =====================================================================================
const D = 128;
const base = (rx = 34, col = '#000', op = 0.18) => ell(64, 113, rx, 7, col, ` opacity="${op}"`);
const sleepyEye = (x, y, col) => stk(`M${f(x - 5)} ${f(y)}q5 4.5 10 0`, col, 2.6) + stk(`M${f(x - 4)} ${f(y + 3)}l-1.5 2M${f(x)} ${f(y + 4)}v2.3M${f(x + 4)} ${f(y + 3)}l1.5 2`, col, 1.5);
const blush = (x, y) => ell(x, y, 5, 3, '#ff9aa8', ' opacity="0.6"');
// a soft "zz" made of paths (no text)
const zz = (x, y, col) => stk(`M${f(x)} ${f(y)}h7l-7 8h7M${f(x + 10)} ${f(y - 10)}h5l-5 6h5`, col, 2.2, ' opacity="0.85"');
function fern(c) {
  let o = base(36, c.out);
  const fronds = [[-1.15, 46], [-0.75, 54], [-0.3, 58], [0.25, 58], [0.7, 54], [1.1, 46]];
  for (const [a, L] of fronds) {
    const ex = 64 + Math.sin(a) * L, ey = 110 - Math.cos(a) * L;
    const mx = 64 + Math.sin(a) * L * 0.5 - Math.cos(a) * 6, my = 110 - Math.cos(a) * L * 0.55;
    // leaf body
    const nx = Math.cos(a), ny = Math.sin(a);
    const leaf = `M64 110Q${f(mx - nx * 12)} ${f(my - ny * 12)} ${f(ex)} ${f(ey)}Q${f(mx + nx * 12)} ${f(my + ny * 12)} 64 110Z`;
    o += pth(leaf, c.bush, OL(c.out, 2.6));
    let ticks = '';
    for (let k = 1; k < 6; k++) { const t = k / 6, px = 64 + (ex - 64) * t, py = 110 + (ey - 110) * t, w = 9 * (1 - t * 0.7); ticks += `M${f(px)} ${f(py)}l${f(-nx * w + Math.sin(a) * 3)} ${f(-ny * w - Math.cos(a) * 3)}M${f(px)} ${f(py)}l${f(nx * w + Math.sin(a) * 3)} ${f(ny * w - Math.cos(a) * 3)}`; }
    o += stk(ticks, c.bushHi, 2) + stk(`M64 110L${f(ex)} ${f(ey)}`, c.out, 1.8, ' opacity="0.7"');
  }
  return svg(D, D, o);
}
function flowerPatch(c) {
  let o = base(38, c.out);
  o += pth(blob(64, 100, 40, 14, 91, 10, 0.12), c.bush, OL(c.out));
  o += pth(blob(58, 96, 26, 7, 92, 9, 0.12), c.bushHi, ' opacity="0.8"');
  const fl = [[38, 76, '#fff4d6'], [58, 64, '#ffe066'], [80, 72, '#c8b6ff'], [94, 88, '#fff4d6'], [48, 90, '#ffe066'], [72, 88, '#fff4d6']];
  for (const [x, y, col] of fl) {
    o += stk(`M${x} ${y + 6}Q${x + 2} ${y + 16} ${x} ${100}`, c.out, 2.4);
    o += [0, 1, 2, 3, 4].map(k => circ(x + Math.cos(k * 1.256 - 1.57) * 5.5, y + Math.sin(k * 1.256 - 1.57) * 5.5, 4.6, col, OL('#9a7a3a', 1.6))).join('') + circ(x, y, 3.4, '#f39a2a', OL('#b8661a', 1.2));
  }
  return svg(D, D, o);
}
function rock(c, mossy) {
  let o = base(40, c.out);
  o += pth('M24 110C18 92 26 66 52 58C72 50 98 60 106 82C112 96 108 110 100 112Z', c.rock, OL(c.out));
  o += pth('M34 88C36 72 48 64 62 62C52 70 46 80 46 94Z', c.rockHi, ' opacity="0.8"');
  o += pth('M86 70C98 78 104 94 100 110L88 110C94 96 92 82 86 70Z', c.rockD, ' opacity="0.6"');
  if (mossy) o += pth('M40 64C50 52 74 48 92 60C98 66 94 72 86 68C78 74 70 66 62 72C54 66 46 74 40 64Z', c.moss, OL(c.mossD, 2.4)) + circ(56, 60, 3, c.mossHi) + circ(76, 58, 2.5, c.mossHi);
  else o += stk('M70 78l6 10l-4 10M54 98l8 -6', c.out, 2, ' opacity="0.6"');
  return svg(D, D, o);
}
// friendly peeking dinos
function longNeckDino() {
  const sk = '#f6c47e', skD = '#e39a52', out = '#8a5226', belly = '#fff0d0';
  let o = base(30, out);
  o += pth('M30 116C30 90 44 70 58 56C66 48 70 40 70 34L88 38C86 50 80 60 72 70C62 84 56 98 58 116Z', sk, OL(out));
  o += pth('M44 112C46 94 54 80 64 70C58 84 54 98 54 112Z', belly, ' opacity="0.8"');
  o += circ(50, 92, 3.5, skD) + circ(56, 80, 3, skD) + circ(44, 104, 3, skD);
  // head
  o += pth(blob(84, 32, 22, 16, 1201, 10, 0.05), sk, OL(out));
  o += ell(80, 24, 10, 5, '#ffe2b0', ' opacity="0.9"');
  o += sleepyEye(80, 30, out) + blush(92, 38) + circ(100, 30, 1.6, out) + stk('M88 42q6 3 11 -1', out, 2.2);
  o += zz(100, 12, '#ffffff');
  // fern tuft in front of the neck base
  o += pth('M14 116C16 100 24 96 30 102C32 92 42 90 46 100C52 92 62 96 62 106C68 102 74 106 72 116Z', '#5aa046', OL('#2e5f2c'));
  o += stk('M24 106l4 -4M40 100l2 -5M56 104l3 -4', '#7fbf58', 2);
  return svg(D, D, o);
}
function swampDino() {
  const sk = '#b8d86a', out = '#4a6a24', plate = '#f2a86a';
  let o = '';
  // water ripple pool it peeks from
  o += ell(64, 106, 46, 13, '#3d7f88', OL('#24525a'));
  o += stk('M28 106q12 -5 24 0M76 104q12 -5 24 0', '#7fb5ae', 2);
  // rounded back plates
  o += [[84, 60], [95, 68], [102, 80]].map(([x, y]) => pth(blob(x, y, 7, 8, x, 8, 0.05), plate, OL('#a8742e', 2.4))).join('');
  // body + head
  o += pth('M34 104C30 80 44 60 66 60C88 60 102 76 100 104Z', sk, OL(out));
  o += ell(66, 98, 22, 6, '#eef6c8', ' opacity="0.8"');
  o += ell(56, 68, 10, 5, '#e2f2a8', ' opacity="0.9"');
  o += sleepyEye(54, 80, out) + sleepyEye(78, 80, out) + blush(46, 90) + blush(86, 90) + stk('M60 92q6 4 12 0', out, 2.2);
  o += circ(40, 74, 2.5, '#8ab04a') + circ(90, 70, 2.5, '#8ab04a');
  // lily pad with a tiny flower on its head
  o += pth('M50 62L62 52A14 7 0 1 1 52 60Z', '#62ad6a', OL('#3f7f4a', 2.2)) + circ(62, 54, 3.5, '#fff4f8', OL('#d896b0', 1.2));
  o += zz(92, 40, '#ffffff');
  return svg(D, D, o);
}
function hornedDino() {
  const sk = '#e8a86a', out = '#7a4428', frill = '#d6844e';
  let o = '';
  // frill
  o += pth('M22 86C22 50 44 32 64 32C84 32 106 50 106 86Z', frill, OL(out));
  o += [30, 46, 64, 82, 98].map((x, i) => circ(x, i % 4 === 0 ? 62 : 44, 4, '#f2c47a', OL(out, 1.6))).join('');
  // head
  o += pth(blob(64, 78, 30, 24, 1301, 10, 0.04), sk, OL(out));
  // soft rounded horns
  o += pth('M44 58C40 48 42 40 46 38C50 42 52 50 52 58Z', '#fff2d6', OL(out, 2.5));
  o += pth('M84 58C88 48 86 40 82 38C78 42 76 50 76 58Z', '#fff2d6', OL(out, 2.5));
  o += pth('M60 76C60 70 62 66 64 64C66 66 68 70 68 76Z', '#fff2d6', OL(out, 2.2));
  o += sleepyEye(50, 72, out) + sleepyEye(78, 72, out) + blush(44, 84) + blush(84, 84) + stk('M56 90q8 5 16 0', out, 2.4);
  // sandstone rock in front
  o += pth('M14 116C12 102 22 94 36 96C46 88 62 92 66 100C76 94 98 94 108 104C114 110 112 116 108 117Z', '#c5653f', OL('#6e3222'));
  o += pth('M24 104C30 98 38 98 44 101C36 102 30 104 26 108Z', '#e08d5f', ' opacity="0.85"');
  o += zz(100, 22, '#fff8e8');
  return svg(D, D, o);
}
function fluffyDino() {
  const fur = '#f4eefc', furD = '#cfc6ea', out = '#7a6ea8';
  const fluff = (cx, cy, R, n) => { let d = ''; for (let i = 0; i <= n; i++) { const a = i / n * 6.283; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.9; if (!i) d = `M${f(x)} ${f(y)}`; else { const am = (i - 0.5) / n * 6.283; d += `Q${f(cx + Math.cos(am) * R * 1.16)} ${f(cy + Math.sin(am) * R * 1.05)} ${f(x)} ${f(y)}`; } } return d + 'Z'; };
  let o = base(36, out);
  // little horns
  o += pth('M40 46C36 34 40 26 46 26C48 32 50 40 50 46Z', '#e8d2a8', OL('#8a6a3a', 2.5)) + pth('M88 46C92 34 88 26 82 26C80 32 78 40 78 46Z', '#e8d2a8', OL('#8a6a3a', 2.5));
  o += pth(fluff(64, 76, 38, 14), fur, OL(out));
  o += pth(fluff(60, 68, 22, 10), '#ffffff', ' opacity="0.8"');
  // face patch
  o += ell(64, 82, 22, 16, '#c9b8e8', OL(out, 2.2));
  o += sleepyEye(55, 78, out) + sleepyEye(73, 78, out) + blush(48, 88) + blush(80, 88) + stk('M60 90q4 3 8 0', out, 2.2);
  // scarf
  o += pth('M30 104C46 112 82 112 98 104L98 112C82 118 46 118 30 112Z', '#6fb0e8', OL('#2f6a9a', 2.5));
  o += stk('M44 109v6M58 111v6M72 111v6M86 109v5', '#d8ecff', 2.4);
  o += pth('M86 108L94 124L102 120L96 106Z', '#6fb0e8', OL('#2f6a9a', 2.5));
  o += zz(98, 30, '#9a8ed0');
  return svg(D, D, o);
}
function lilyCluster() {
  const out = '#24525a';
  let o = ell(64, 100, 50, 16, '#3d7f88', OL(out)) + stk('M24 102q10 -4 20 0M86 98q10 -4 20 0', '#7fb5ae', 2);
  const pad = (x, y, R, a) => { const a1 = a - 0.35, a2 = a + 0.35; return pth(`M${x} ${y}L${f(x + Math.cos(a1) * R)} ${f(y + Math.sin(a1) * R * 0.5)}A${R} ${R * 0.5} 0 1 1 ${f(x + Math.cos(a2) * R)} ${f(y + Math.sin(a2) * R * 0.5)}Z`, '#62ad6a', OL('#3f7f4a', 2.4)) + ell(x - R * 0.3, y - R * 0.15, R * 0.3, R * 0.1, '#8ccc84'); };
  o += pad(44, 98, 18, -0.6) + pad(82, 102, 16, 2.4) + pad(70, 90, 12, 0.9);
  // water lily flower
  o += [-1, -0.5, 0, 0.5, 1].map(k => pth(`M66 86Q${f(66 + k * 12)} ${f(76 - (1 - Math.abs(k)) * 6)} ${f(66 + k * 4)} 70Q${f(66 + k * 2)} 80 66 86Z`, '#fff4f8', OL('#c87a9c', 1.8))).join('') + circ(66, 82, 3.5, '#ffd84a', OL('#c8901a', 1.2));
  return svg(D, D, o);
}
function cattails() {
  const out = '#33663f';
  let o = base(30, '#1c3c40');
  const st = [[44, 34, -6], [58, 22, -2], [72, 30, 4], [86, 40, 8]];
  for (const [x, top, lean] of st) {
    o += stk(`M${x - lean * 0.3} 112Q${x} ${(112 + top) / 2} ${x + lean} ${top}`, '#4f8a58', 4) + stk(`M${x - lean * 0.3} 112Q${x} ${(112 + top) / 2} ${x + lean} ${top}`, out, 1.2, ' opacity="0.5"');
    o += pth(`M${f(x + lean * 0.95 - 4.5)} ${top + 8}a4.5 11 0 1 1 9 0a4.5 11 0 1 1 -9 0Z`, '#8a5f3a', OL('#5e3e24', 2.2)) + stk(`M${f(x + lean * 0.95 - 1.5)} ${top + 2}v8`, '#b88a5e', 1.6);
  }
  o += stk('M30 112Q34 86 26 70M38 112Q46 90 50 76M96 112Q92 88 102 72M80 112Q78 96 66 84', '#62a06a', 3.4);
  o += pth(blob(64, 110, 40, 8, 1401, 9, 0.1), '#4f8a58', OL(out, 2.4));
  return svg(D, D, o);
}
function mushroomStump() {
  const out = '#5a3a24';
  let o = base(36, out);
  o += pth('M34 112C36 96 34 80 38 66L90 66C94 80 92 96 94 112Z', '#a07650', OL(out));
  o += ell(64, 66, 26, 9, '#d8b48a', OL(out)) + stk('M64 66m-16 0a16 5 0 1 0 32 0a16 5 0 1 0 -32 0M64 66m-7 0a7 2.2 0 1 0 14 0', '#a07650', 1.6);
  o += stk('M46 76v28M58 80v26M80 76v30', '#7e5838', 2, ' opacity="0.6"');
  o += pth(blob(56, 62, 14, 7, 1501, 9, 0.08), '#79ae8c', ' opacity="0.9"');
  // mushrooms (teal-cream, not red)
  const mush = (x, y, R) => stk(`M${x} ${y}v${R * 1.1}`, '#f4ead8', R * 0.55) + pth(`M${x - R} ${y}C${x - R} ${y - R * 1.1} ${x + R} ${y - R * 1.1} ${x + R} ${y}Z`, '#8fd0c4', OL('#2e6a64', 2.2)) + circ(x - R * 0.3, y - R * 0.45, R * 0.18, '#ffffff') + circ(x + R * 0.35, y - R * 0.3, R * 0.14, '#ffffff');
  o += mush(28, 100, 11) + mush(100, 104, 9) + mush(86, 58, 8);
  return svg(D, D, o);
}
function cactus() {
  const sk = '#7cb86a', out = '#2f5a2e';
  let o = base(30, '#5a2a18');
  o += pth('M54 112L54 40C54 28 74 28 74 40L74 112Z', sk, OL(out));
  o += pth('M54 78L42 78C34 78 32 72 32 66L32 52C32 44 44 44 44 52L44 66L54 66Z', sk, OL(out));
  o += pth('M74 70L86 70C94 70 96 64 96 58L96 46C96 38 84 38 84 46L84 58L74 58Z', sk, OL(out));
  o += stk('M64 38V108M38 52V70M90 46V62', '#5a9a52', 2.2, ' opacity="0.8"');
  o += stk('M59 46v50', '#a6d88a', 3, ' opacity="0.7"');
  o += [0, 1, 2].map(k => circ(64 + (k - 1) * 5, 30, 4, '#ffb0c8', OL('#c86a8a', 1.4))).join('');
  o += pth('M40 116C40 108 50 106 56 110C62 104 76 104 80 110C86 106 94 110 92 116Z', '#c5653f', OL('#6e3222', 2.5));
  return svg(D, D, o);
}
function sandstone() {
  const out = '#6e3222';
  let o = base(44, '#5a2a18');
  o += pth('M18 112C16 98 20 86 30 82L36 52C40 42 56 40 66 44L88 48C100 52 104 62 102 74L110 90C114 100 112 110 108 112Z', '#d97a4a', OL(out));
  o += stk('M24 98Q64 92 108 100M30 76Q64 70 104 80M36 58Q60 52 94 58', '#b85a34', 3, ' opacity="0.7"');
  o += pth('M40 52C46 46 58 46 66 48L62 54C54 52 46 54 40 58Z', '#f2a878', ' opacity="0.9"');
  o += pth('M96 76L106 92C108 100 106 108 104 110L94 110C100 98 100 86 96 76Z', '#a04c30', ' opacity="0.6"');
  return svg(D, D, o);
}
function eggNest() {
  const out = '#6e4426';
  let o = base(42, '#5a2a18');
  o += ell(64, 100, 44, 14, '#b88a52', OL(out));
  o += [['#f6efd8', 48, 82, 12, 16], ['#d8ecc8', 78, 80, 11, 15], ['#f8dcc0', 64, 88, 12, 15]].map(([col, x, y, rx, ry]) =>
    ell(x, y, rx, ry, col, OL('#8a6a4a', 2.6)) + ell(x - rx * 0.35, y - ry * 0.4, rx * 0.28, ry * 0.2, '#ffffff', ' opacity="0.9"') + circ(x + rx * 0.3, y + ry * 0.2, 2, '#c8a882') + circ(x - rx * 0.1, y + ry * 0.45, 1.6, '#c8a882')).join('');
  // twig ring in front
  o += pth('M20 100C24 112 104 112 108 100C108 110 98 116 64 116C30 116 20 110 20 100Z', '#a0703e', OL(out, 2.6));
  o += stk('M28 106l12 4M48 110l14 1M70 111l14 -1M90 108l12 -4', '#d0a066', 2);
  return svg(D, D, o);
}
function pine() {
  const out = '#2a5a50';
  let o = base(30, '#5a6a9a');
  o += pth('M58 112v-14h12v14Z', '#8a6040', OL('#5a3a24', 2.5));
  const tier = (y, w, h) => pth(`M64 ${y - h}L${64 + w} ${y}Q64 ${y + 6} ${64 - w} ${y}Z`, '#3e7a6c', OL(out)) + pth(`M64 ${y - h + 2}L${64 + w * 0.55} ${y - h * 0.45}Q64 ${y - h * 0.3} ${64 - w * 0.6} ${y - h * 0.5}Z`, '#ffffff', OL('#c8d5ee', 1.5));
  o += tier(100, 36, 34) + tier(76, 28, 30) + tier(54, 20, 28);
  o += circ(64, 24, 4, '#ffffff', OL('#c8d5ee', 1.5));
  return svg(D, D, o);
}
function rockPile() {
  const out = '#5a6a9a';
  let o = base(40, out);
  const st = (x, y, rx, ry, col) => ell(x, y, rx, ry, col, OL(out)) + pth(`M${x - rx * 0.8} ${y - ry * 0.25}C${x - rx * 0.6} ${y - ry * 1.15} ${x + rx * 0.6} ${y - ry * 1.15} ${x + rx * 0.85} ${y - ry * 0.2}C${x + rx * 0.4} ${y - ry * 0.55} ${x - rx * 0.4} ${y - ry * 0.55} ${x - rx * 0.8} ${y - ry * 0.25}Z`, '#ffffff', OL('#c8d5ee', 1.4));
  o += st(64, 98, 38, 16, '#9aa6c8') + st(62, 72, 26, 13, '#a8b2d2') + st(66, 50, 16, 10, '#b4bcda');
  return svg(D, D, o);
}
function iceCrystal() {
  const out = '#4f7ab8';
  let o = base(30, out);
  const shard = (x, w, h, a, col) => `<g transform="rotate(${a} ${x} 110)">` + pth(`M${x - w} 110L${x - w} ${110 - h + w}L${x} ${110 - h}L${x + w} ${110 - h + w}L${x + w} 110Z`, col, OL(out, 2.6)) + pth(`M${x - w * 0.5} 106L${x - w * 0.5} ${110 - h + w * 1.3}L${x} ${110 - h + 4}Z`, '#ffffff', ' opacity="0.75"') + '</g>';
  o += shard(46, 9, 46, -22, '#bfe0ff') + shard(84, 9, 50, 20, '#bfe0ff') + shard(64, 12, 76, 0, '#d8eeff');
  o += ell(64, 112, 34, 6, '#f7faff', OL('#c8d5ee', 2));
  o += pth('M96 30l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z', '#ffffff', OL('#8ab4e8', 1.2));
  return svg(D, D, o);
}
const DECOR = {
  meadow: [() => fern({ bush: '#5aa046', bushHi: '#8fcc64', out: '#2e5f2c' }), () => flowerPatch({ bush: '#5aa046', bushHi: '#7fbf58', out: '#2e5f2c' }),
    () => rock({ rock: '#a8a89a', rockHi: '#cfcfc0', rockD: '#7e7e72', out: '#4e5048', moss: '#6eb050', mossD: '#3c7a34', mossHi: '#a6d878' }, true), longNeckDino],
  swamp: [lilyCluster, cattails, mushroomStump, swampDino],
  canyon: [cactus, sandstone, eggNest, hornedDino],
  snow: [pine, rockPile, iceCrystal, fluffyDino],
};

// =====================================================================================
// PARTICLES (32 x 32, centred)
// =====================================================================================
const P = {
  leaf: () => svg(32, 32, pth('M5 24C6 12 14 5 27 5C27 17 20 26 7 26Z', '#7cc456', OL('#3c7a34', 2)) + stk('M7 25L21 11M13 19l-1 -5M17 15l4 1', '#3c7a34', 1.4) + pth('M10 18C12 12 17 9 22 8C17 11 13 14 10 18Z', '#b0e080', ' opacity="0.8"')),
  butterfly: () => svg(32, 32, pth('M16 15C12 5 3 4 4 11C5 16 10 17 16 16Z', '#ffe066', OL('#b07a20', 1.6)) + pth('M16 15C20 5 29 4 28 11C27 16 22 17 16 16Z', '#ffe066', OL('#b07a20', 1.6)) +
    pth('M16 17C12 18 6 21 8 25C10 28 14 23 16 18Z', '#c8b6ff', OL('#6a58a8', 1.6)) + pth('M16 17C20 18 26 21 24 25C22 28 18 23 16 18Z', '#c8b6ff', OL('#6a58a8', 1.6)) +
    circ(8.5, 10, 1.8, '#fff8e0') + circ(23.5, 10, 1.8, '#fff8e0') + ell(16, 16.5, 1.6, 6, '#5a4030') + stk('M15 11Q13 7 11 6M17 11Q19 7 21 6', '#5a4030', 1)),
  firefly: () => svg(32, 32, circ(16, 16, 15, 'url(#g)') + circ(16, 16, 4.5, '#f8ff9a') + circ(16, 16, 2.4, '#ffffff'), rad('g', [[0, '#eaff7a', 0.9], [0.35, '#c8f060', 0.45], [1, '#a8e050', 0]])),
  mist: () => svg(32, 32, circ(16, 16, 16, 'url(#g)'), rad('g', [[0, '#ffffff', 0.85], [0.5, '#f4fbff', 0.5], [1, '#ffffff', 0]])),
  dust: () => svg(32, 32, stk('M3 18Q10 10 18 14T30 10', '#e8c49a', 3.4, ' opacity="0.75"') + stk('M6 24Q13 18 20 21T28 18', '#f2d6b0', 2.4, ' opacity="0.6"') + circ(10, 9, 1.6, '#e8c49a', ' opacity="0.7"') + circ(24, 25, 1.3, '#e8c49a', ' opacity="0.7"')),
  snow: () => { let d = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, cx = Math.cos(a), sy = Math.sin(a); d += `M16 16L${f(16 + cx * 12)} ${f(16 + sy * 12)}M${f(16 + cx * 7)} ${f(16 + sy * 7)}l${f(Math.cos(a + 0.8) * 4)} ${f(Math.sin(a + 0.8) * 4)}M${f(16 + cx * 7)} ${f(16 + sy * 7)}l${f(Math.cos(a - 0.8) * 4)} ${f(Math.sin(a - 0.8) * 4)}`; }
    return svg(32, 32, stk(d, '#9ab8e8', 4.4) + stk(d, '#ffffff', 2.4) + circ(16, 16, 3, '#ffffff', OL('#9ab8e8', 1))); },
  sparkle: () => svg(32, 32, pth('M16 1Q18 14 31 16Q18 18 16 31Q14 18 1 16Q14 14 16 1Z', '#fff6c8', OL('#f2c440', 1.4)) + pth('M16 8Q17 15 24 16Q17 17 16 24Q15 17 8 16Q15 15 16 8Z', '#ffffff')),
  feather: () => svg(32, 32, pth('M26 5C30 10 24 22 12 27C8 28 5 28 4 27C4 24 6 20 9 17C14 10 20 4 26 5Z', '#ffffff', OL('#b8b0d8', 1.6)) + stk('M4 28L24 7', '#c8c0e0', 1.4) + stk('M10 16l4 3M14 12l4 3M18 9l3 3', '#d8d2ec', 1.2)),
  petal: () => svg(32, 32, pth('M16 4C24 8 26 18 22 25C20 28 12 28 10 25C6 18 8 8 16 4Z', '#ffb6d0', OL('#d9709a', 1.6)) + pth('M14 9C11 13 11 19 13 23C11 19 11 13 14 9Z', '#ffe6ef', OL('#ffe6ef', 2)) + stk('M16 27v-6', '#d9709a', 1.2)),
};

// =====================================================================================
const GROUND = { meadow: groundMeadow, swamp: groundSwamp, canyon: groundCanyon, snow: groundSnow };
const EDGE = { meadow: edgeMeadow, swamp: edgeSwamp, canyon: edgeCanyon, snow: edgeSnow };
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return s.length; };
const sizes = [];
for (const b of Object.keys(GROUND)) {
  sizes.push([`${b}/ground`, write(path.join(OUT, 'biomes', b, 'ground.svg'), GROUND[b]())]);
  sizes.push([`${b}/edge`, write(path.join(OUT, 'biomes', b, 'edge.svg'), EDGE[b]())]);
  DECOR[b].forEach((fn, i) => sizes.push([`${b}/decor_${i}`, write(path.join(OUT, 'biomes', b, `decor_${i}.svg`), fn())]));
}
for (const [n, fn] of Object.entries(P)) sizes.push([`particles/${n}`, write(path.join(OUT, 'particles', n + '.svg'), fn())]);
console.log(sizes.map(([n, s]) => `${n} ${(s / 1024).toFixed(1)}KB`).join('\n'));
