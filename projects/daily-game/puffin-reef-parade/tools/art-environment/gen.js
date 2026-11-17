// Dottie's Reef Parade: environment art generator (4 reef seasons + particles).
// Writes original, hand-authored, procedurally-laid-out SVGs (seeded, deterministic).
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - ground.svg  512x512 opaque, seamless in x AND y (every element that crosses an edge is
//    re-emitted at ±512 on the opposite side; ripple bands use periodic waves). Calm, low-contrast
//    mid-tone sand so the sea stars (pink/blue/mint/lavender/gold) and Dottie (navy/white/orange) pop.
//  - edge.svg    512x72 transparent, seamless in x (periodic waves use wavelengths 512/k; props
//    near the ends are wrapped). y=0 = outside, y≈56–72 = the inner edge facing the play area.
//    Drawn top-down so it reads when rotated for the 4 sides; the renderer stacks 3 rows 52 px apart
//    outward, so the top part (y 0–46) is a solid reef mass.
//  - decor_N.svg 128x128 upright 3/4 props, base at y≈112.
//  - particles   32x32 centred (ray: 64x256).
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
const grad = (tag, id, stops, attrs = '') => `<${tag} id="${id}"${attrs}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</${tag}>`;
const rad = (id, stops, attrs = '') => grad('radialGradient', id, stops, attrs);
const lin = (id, stops, x2 = 0, y2 = 1) => grad('linearGradient', id, stops, ` x1="0" y1="0" x2="${x2}" y2="${y2}"`);
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
const pwave = (seed, amps, P = T) => { const r = rng(seed); const ph = amps.map(() => r() * 6.283); return x => amps.reduce((s, [a, k], i) => s + a * Math.sin(x / P * k * 6.283 + ph[i]), 0); };
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
  while (pts.length < n && tries++ < n * 80) {
    const p = [r() * T, r() * T];
    if (pts.every(q => wd(p, q) >= minD) && avoid.every(([ax, ay, ar]) => wd(p, [ax, ay]) >= ar)) pts.push(p);
  }
  return pts;
}

// =====================================================================================
// PALETTES (sand: calm mid-tones; reef: saturated but kept away from the 5 star hues)
// =====================================================================================
const PAL = {
  spring: { base: '#e9cf9f', blobs: ['#e4c595', '#eed6aa', '#e8c69c', '#f0d3a8'], peach: '#eebf9c', rip: '#cfae7c', ripHi: '#f6e2bd', pebble: '#c9a679', pebbleD: '#a9875c', pebbleHi: '#f2ddb6', shell: '#f7e9d2', shellD: '#c49a72',
    dark: '#7a3f3a' },
  summer: { base: '#dcefe6', blobs: ['#d3e9df', '#e5f4ec', '#d6ece4', '#e9f6ef'], peach: '#e9efdc', rip: '#b4d3c8', ripHi: '#f6fcf8', pebble: '#b8cfc6', pebbleD: '#93b0a6', pebbleHi: '#f2faf6', shell: '#fbf6ea', shellD: '#b8a88e',
    dark: '#2f6a6a' },
  autumn: { base: '#cf9f62', blobs: ['#c8975a', '#d6a96d', '#cb9a5e', '#d9ad74'], peach: '#c99358', rip: '#ad7c44', ripHi: '#e3bb84', pebble: '#a9784a', pebbleD: '#86592f', pebbleHi: '#e1b680', shell: '#efd8b4', shellD: '#9a6a3c',
    dark: '#5a3a22' },
  winter: { base: '#bac6d1', blobs: ['#b2bfcb', '#c3ced8', '#b6c1cf', '#c6d0db'], peach: '#c2c8d6', rip: '#98a8b8', ripHi: '#dde6ee', pebble: '#9aa8b8', pebbleD: '#7a8898', pebbleHi: '#e2eaf2', shell: '#eef2f6', shellD: '#8a98aa',
    dark: '#34485e' },
};

// =====================================================================================
// GROUND TILES (512 x 512, opaque, seamless)
// =====================================================================================
function softBlobs(c, seed, n, rmin, rmax, op, cols = c.blobs) {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) {
    const x = r() * T, y = r() * T, rx = rmin + r() * (rmax - rmin), ry = rx * (0.55 + r() * 0.35), col = cols[i % cols.length], s = seed * 100 + i;
    o += wrap(x, y, rx * 1.2, (X, Y) => pth(blob(X, Y, rx, ry, s, 10, 0.14), col, ` opacity="${op}"`));
  }
  return o;
}
// sand ripples: short gently curved dashes, roughly parallel (current direction ang), each a dark
// groove + a pale crest 2 px above it. Wrapped so they cross tile edges cleanly.
function ripples(c, seed, n, minD, ang, op = 0.42) {
  const r = rng(seed); let d = '', dh = '';
  for (const [x, y] of scatter(seed, n, minD)) {
    const L = 50 + r() * 60, a = ang + (r() - 0.5) * 0.3, b1 = 4 + r() * 5, b2 = -(2 + r() * 4);
    const ca = Math.cos(a), sa = Math.sin(a);
    wrap(x, y, L / 2 + 10, (X, Y) => {
      const p = (s, k) => [X + ca * s * L / 2 - sa * k, Y + sa * s * L / 2 + ca * k];
      // gentle S-shaped crest: a dark groove and a pale crest just "up-current" of it
      const cv = o => { const [ax, ay] = p(-1, o), [c1x, c1y] = p(-0.35, b1 + o), [c2x, c2y] = p(0.35, b2 + o), [bx, by] = p(1, o); return `M${f(ax)} ${f(ay)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(bx)} ${f(by)}`; };
      d += cv(0); dh += cv(-2.6);
      return '';
    });
  }
  return stk(dh, c.ripHi, 3, ` opacity="${op}"`) + stk(d, c.rip, 3, ` opacity="${op}"`);
}
function pebbles(c, seed, n, minD, smin = 2.5, smax = 5.5, avoid = []) {
  const r = rng(seed * 7 + 1); let o = '';
  for (const [x, y] of scatter(seed, n, minD, avoid)) {
    const s = smin + r() * (smax - smin), a = r() * 180;
    o += wrap(x, y, s * 1.6, (X, Y) => `<g transform="rotate(${f(a)} ${f(X)} ${f(Y)})">` + ell(X, Y + 1.3, s * 1.25, s * 0.85, c.pebbleD, ' opacity="0.45"') + ell(X, Y, s * 1.2, s * 0.8, c.pebble) + ell(X - s * 0.35, Y - s * 0.3, s * 0.45, s * 0.28, c.pebbleHi, ' opacity="0.85"') + '</g>');
  }
  return o;
}
// tiny pale shells: scallop fan / spiral snail / little cockle
function shells(c, seed, n, minD, avoid = []) {
  const r = rng(seed * 3 + 5); let o = '';
  scatter(seed, n, minD, avoid).forEach(([x, y], i) => {
    const s = 0.8 + r() * 0.35, a = (r() - 0.5) * 70, kind = i % 3;
    o += wrap(x, y, 12, (X, Y) => {
      let g = `<g transform="translate(${f(X)} ${f(Y)}) rotate(${f(a)}) scale(${f(s)})">`;
      if (kind === 0) g += pth('M0 5L-7 -1C-7 -6 -3 -8 0 -8C3 -8 7 -6 7 -1Z', c.shell, OL(c.shellD, 1.4)) + stk('M0 5V-7M0 5L-4 -6M0 5L4 -6', c.shellD, 1, ' opacity="0.8"') + pth('M-2 5H2L1 7H-1Z', c.shellD);
      else if (kind === 1) g += ell(0, 0, 6, 4.6, c.shell, OL(c.shellD, 1.4)) + stk('M1.5 0.5a1.6 1.6 0 1 1 -1.8 -2.2a3.4 3.4 0 1 1 -2.6 4.6', c.shellD, 1.1);
      else g += ell(0, 0, 5, 3.8, c.shell, OL(c.shellD, 1.3)) + stk('M-3 -1.5q3 2 6 0', c.shellD, 1, ' opacity="0.8"');
      return g + '</g>';
    });
  });
  return o;
}
function groundSpring() {
  const c = PAL.spring;
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 11, 12, 60, 120, 0.75) + softBlobs(c, 12, 6, 50, 90, 0.35, [c.peach]) + softBlobs(c, 13, 16, 24, 48, 0.55);
  o += ripples(c, 14, 34, 66, -0.18);
  o += pebbles(c, 15, 22, 56) + shells(c, 16, 7, 120);
  return svg(T, T, o);
}
function groundSummer() {
  const c = PAL.summer;
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 21, 12, 60, 120, 0.8) + softBlobs(c, 22, 5, 50, 90, 0.4, [c.peach]) + softBlobs(c, 23, 16, 24, 48, 0.6);
  o += ripples(c, 24, 36, 64, 0.12, 0.5);
  o += pebbles(c, 25, 18, 60) + shells(c, 26, 9, 110);
  // little sea-grass sprouts (soft, desaturated green)
  let d = '';
  for (const [x, y] of scatter(27, 12, 110)) wrap(x, y, 10, (X, Y) => { d += `M${f(X - 3)} ${f(Y + 4)}Q${f(X - 5)} ${f(Y - 2)} ${f(X - 7)} ${f(Y - 6)}M${f(X)} ${f(Y + 4)}Q${f(X + 1)} ${f(Y - 3)} ${f(X)} ${f(Y - 9)}M${f(X + 3)} ${f(Y + 4)}Q${f(X + 5)} ${f(Y - 1)} ${f(X + 7)} ${f(Y - 5)}`; return ''; });
  o += stk(d, '#8fbfa0', 2.4, ' opacity="0.75"');
  return svg(T, T, o);
}
function groundAutumn() {
  const c = PAL.autumn;
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 31, 12, 60, 130, 0.8) + softBlobs(c, 32, 16, 24, 50, 0.6);
  o += ripples(c, 33, 32, 68, -0.35, 0.4);
  o += pebbles(c, 34, 26, 50, 2.5, 6) + shells(c, 35, 6, 130);
  // a few fallen kelp bits (muted olive-brown, small)
  const r = rng(36);
  for (const [x, y] of scatter(37, 4, 200)) {
    const a = r() * 180;
    o += wrap(x, y, 16, (X, Y) => `<g transform="rotate(${f(a)} ${f(X)} ${f(Y)})">` + pth(`M${f(X - 12)} ${f(Y)}Q${f(X)} ${f(Y - 6)} ${f(X + 12)} ${f(Y)}Q${f(X)} ${f(Y + 6)} ${f(X - 12)} ${f(Y)}Z`, '#a8884a', OL('#86663a', 1.4) + ' opacity="0.6"') + stk(`M${f(X - 10)} ${f(Y)}H${f(X + 10)}`, '#7a5a2a', 1, ' opacity="0.7"') + '</g>');
  }
  return svg(T, T, o);
}
function groundWinter() {
  const c = PAL.winter;
  let o = `<rect width="${T}" height="${T}" fill="${c.base}"/>`;
  o += softBlobs(c, 41, 12, 60, 130, 0.8) + softBlobs(c, 42, 5, 50, 90, 0.35, [c.peach]) + softBlobs(c, 43, 14, 24, 50, 0.6);
  o += ripples(c, 44, 32, 68, 0.25, 0.36);
  o += pebbles(c, 45, 22, 56) + shells(c, 46, 6, 130);
  // frost-white specks (marine snow settled on the sand)
  for (const [x, y] of scatter(47, 40, 44)) o += wrap(x, y, 4, (X, Y) => circ(X, Y, 1.7, '#f4f8fb', ' opacity="0.85"'));
  return svg(T, T, o);
}

// =====================================================================================
// EDGE STRIPS (512 x 72, transparent, tileable in x). Bottom (y≈56–72) faces the arena.
// =====================================================================================
const EW = 512, EH = 72;
const ewrap = (x, rr, fn) => wrap(x, 0, rr, (X) => fn(X), EW, EH, false);
const wallBand = (fn, col, extra = '') => { const pts = []; for (let x = -16; x <= EW + 16; x += 16) pts.push([x, fn(x)]); return pth(smooth(pts, false) + `L${EW + 16} -4L-16 -4Z`, col, extra); };
const shadowBand = (y, seed, col) => wallBand(x => y + pwave(seed, [[2.5, 3], [1.5, 8]])(x), col, ' opacity="0.22"') + wallBand(x => y - 4 + pwave(seed, [[2.5, 3], [1.5, 8]])(x), col, ' opacity="0.18"');
// evenly spread items along the strip (period 512, so the pattern tiles exactly)
const along = (n, seed, fn) => { const r = rng(seed); let o = ''; for (let i = 0; i < n; i++) o += fn(i * EW / n + (r() - 0.5) * (EW / n) * 0.35, r, i); return o; };
// a round reef lump: outlined blob + highlight + a shade dot
const lump = (X, y, R, s, col, hi, sh, out, sq = 0.8) => pth(blob(X, y, R, R * sq, s, 10, 0.12), col, OL(out)) + pth(blob(X - R * 0.15, y - R * 0.22, R * 0.62, R * sq * 0.5, s + 7, 9, 0.12), hi, ' opacity="0.85"') + circ(X + R * 0.4, y + R * 0.35, R * 0.16, sh, ' opacity="0.7"');
// anemone seen from above: ring of fat tentacle tips around a pale mouth
const anemone = (X, y, R, col, tip, out) => {
  let o = circ(X, y, R, col, OL(out, 2.4));
  for (let k = 0; k < 10; k++) { const a = k * 0.6283; o += circ(X + Math.cos(a) * R * 0.78, y + Math.sin(a) * R * 0.78, R * 0.3, tip, OL(out, 1.4)); }
  return o + circ(X, y, R * 0.34, '#fff1e6', OL(out, 1.4));
};
function edgeSpring() {
  const out = '#8a3f44', rock = '#c87a74', rockHi = '#e8a294';
  let o = shadowBand(68, 51, '#6a3a2a');
  o += wallBand(x => 46 + pwave(52, [[4, 3], [3, 7]])(x), '#b4645f', OL(out));
  // back row of darker rock lumps (outer)
  o += along(10, 53, (x, r, i) => { const R = 15 + r() * 5, y = 14 + r() * 8; return ewrap(x, R + 4, X => lump(X, y, R, 5300 + i, '#a85a58', '#c47a70', '#7a3a3c', out)); });
  // peach branching coral: thick rounded forks seen from above
  o += along(5, 54, (x, r, i) => {
    const y = 30 + r() * 6, a0 = -Math.PI / 2 + (r() - 0.5) * 0.4;
    return ewrap(x, 34, X => {
      let d = '';
      const br = (px, py, a, L, lev) => { const ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L; d += `M${f(px)} ${f(py)}L${f(ex)} ${f(ey)}`; if (lev) { br(ex, ey, a - 0.55, L * 0.72, lev - 1); br(ex, ey, a + 0.55, L * 0.72, lev - 1); } };
      for (const da of [-1.9, -0.6, 0.6, 1.9]) br(X, y, a0 + da, 10, 2);
      return stk(d, out, 11) + stk(d, '#f4a07e', 7) + stk(d, '#ffc6a2', 2.6, ' opacity="0.8"');
    });
  });
  // inner row: coral bush lumps + anemones along the edge
  o += along(9, 55, (x, r, i) => { const R = 14 + r() * 4, y = 48 + r() * 4; return ewrap(x, R + 4, X => lump(X, y, R, 5500 + i, rock, rockHi, '#9a5052', out)); });
  o += along(5, 56, (x, r, i) => { const R = 9 + r() * 2.5, y = 48 + r() * 5; return ewrap(x + 28, R * 1.4, X => anemone(X, y, R, i % 2 ? '#e88a6c' : '#d98aa4', i % 2 ? '#ffc29a' : '#f5c2d2', out)); });
  // tiny cream polyp dots
  o += along(14, 57, (x, r) => { const y = 26 + r() * 26; return ewrap(x, 4, X => circ(X, y, 2, '#ffe8d2', ' opacity="0.9"')); });
  return svg(EW, EH, o);
}
function edgeSummer() {
  const out = '#2f6a66', rock = '#7fb7ae';
  let o = shadowBand(68, 61, '#2a5a5a');
  o += wallBand(x => 46 + pwave(62, [[4, 4], [2, 9]])(x), '#5e9f98', OL(out));
  // sea grass meadow on the outside (blades fanning outward / up)
  o += along(9, 63, (x, r, i) => {
    const y = 34 + r() * 4, rr = rng(6300 + i);
    return ewrap(x, 30, X => { let b = ''; for (let k = 0; k < 5; k++) { const a = -Math.PI * (0.25 + 0.5 * k / 4) + (rr() - 0.5) * 0.2, L = 22 + rr() * 10; b += `M${f(X)} ${f(y)}Q${f(X + Math.cos(a) * L * 0.5 + 4)} ${f(y + Math.sin(a) * L * 0.5)} ${f(X + Math.cos(a) * L)} ${f(y + Math.sin(a) * L)}`; } return stk(b, '#2f6a4a', 6) + stk(b, '#62b07a', 3.4); });
  });
  // fan corals (coral-red/orange fans pointing outward), kept small
  o += along(4, 64, (x, r, i) => {
    const y = 40, w = 18 + r() * 5;
    return ewrap(x + 30, w + 6, X => {
      const fan = `M${f(X)} ${f(y)}L${f(X - w)} ${f(y - w * 0.9)}Q${f(X)} ${f(y - w * 1.5)} ${f(X + w)} ${f(y - w * 0.9)}Z`;
      let v = ''; for (let k = -2; k <= 2; k++) v += `M${f(X)} ${f(y)}L${f(X + k * w * 0.42)} ${f(y - w * 1.1 + Math.abs(k) * 3)}`;
      return pth(fan, i % 2 ? '#f0866a' : '#e8706e', OL('#8a3a34', 2.6)) + stk(v, '#ffc0a0', 1.6, ' opacity="0.9"');
    });
  });
  // brain coral domes along the inner edge (cream-tan with wiggly grooves)
  o += along(8, 65, (x, r, i) => {
    const R = 15 + r() * 4, y = 50 + r() * 3, s = 6500 + i;
    return ewrap(x, R + 4, X => {
      let g = pth(blob(X, y, R, R * 0.78, s, 10, 0.08), '#e2d2a6', OL('#7a6a44'));
      const rr = rng(s); let d = '';
      for (let k = -2; k <= 2; k++) { const yy = y + k * R * 0.28; const hw = Math.sqrt(Math.max(0, 1 - (k * 0.32) ** 2)) * R * 0.78; d += `M${f(X - hw)} ${f(yy)}`; for (let j = 1; j <= 4; j++) d += `q${f(hw / 4)} ${f((j % 2 ? -1 : 1) * (2.5 + rr()))} ${f(hw / 2)} 0`; }
      return g + stk(d, '#b4a070', 1.6) + ell(X - R * 0.3, y - R * 0.35, R * 0.35, R * 0.18, '#fff6dc', ' opacity="0.8"');
    });
  });
  o += along(8, 66, (x, r, i) => { const R = 9 + r() * 3, y = 54 + r() * 3; return ewrap(x + 32, R + 4, X => lump(X, y, R, 6600 + i, rock, '#b4e0d4', '#4f8a84', out)); });
  return svg(EW, EH, o);
}
function edgeAutumn() {
  const out = '#4e3220', rock = '#8f6a4c';
  let o = shadowBand(68, 71, '#3a2414');
  o += wallBand(x => 46 + pwave(72, [[4, 2], [3, 5]])(x), '#6e4c34', OL(out));
  // kelp blades streaming outward from holdfasts
  o += along(6, 73, (x, r, i) => {
    const y = 40, rr = rng(7300 + i);
    return ewrap(x, 40, X => {
      let g = '';
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.55 + (rr() - 0.5) * 0.2, L = 34 + rr() * 6, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
        const ex = X + ca * L, ey = y + sa * L, mx = X + ca * L * 0.5, my = y + sa * L * 0.5;
        g += pth(`M${f(X)} ${f(y)}Q${f(mx + nx * 9)} ${f(my + ny * 9)} ${f(ex)} ${f(ey)}Q${f(mx - nx * 9)} ${f(my - ny * 9)} ${f(X)} ${f(y)}Z`, k === 1 ? '#a8843c' : '#94742e', OL('#5a4418', 2.2)) + stk(`M${f(X)} ${f(y)}L${f(ex)} ${f(ey)}`, '#c8a458', 1.4, ' opacity="0.8"');
      }
      return g + pth(blob(X, y + 2, 9, 6, 7350 + i, 8, 0.15), '#6a5422', OL('#3e3010', 2));
    });
  });
  // brown rocks
  o += along(9, 74, (x, r, i) => { const R = 15 + r() * 5, y = 46 + r() * 5; return ewrap(x, R + 4, X => lump(X, y, R, 7400 + i, rock, '#b48e6a', '#5e402a', out)); });
  // orange sponges (tubes seen from above: ring with a dark hole)
  o += along(5, 75, (x, r, i) => {
    const y = 50 + r() * 4, R = 8 + r() * 2;
    return ewrap(x + 26, R * 2.4, X => [[0, 0, R], [R * 1.1, -R * 0.5, R * 0.75], [-R * 1.0, -R * 0.4, R * 0.7]].map(([dx, dy, rr]) => circ(X + dx, y + dy, rr, i % 2 ? '#e8843a' : '#ee9a46', OL('#8a4418', 2.4)) + circ(X + dx, y + dy, rr * 0.45, '#9a4a1c') + circ(X + dx - rr * 0.4, y + dy - rr * 0.45, rr * 0.2, '#ffc890', ' opacity="0.9"')).join(''));
  });
  return svg(EW, EH, o);
}
function edgeWinter() {
  const out = '#3e5a7a', rock = '#8fb0cc';
  let o = shadowBand(68, 81, '#2a3a5a');
  o += wallBand(x => 46 + pwave(82, [[5, 4], [3, 9]])(x), '#6f90b0', OL(out));
  // back icy rocks
  o += along(10, 83, (x, r, i) => { const R = 15 + r() * 5, y = 16 + r() * 8; return ewrap(x, R + 4, X => lump(X, y, R, 8300 + i, '#7f9fbe', '#a6c2dc', '#5a7898', out)); });
  // pale blue soft coral puffs (clusters of soft lobes)
  o += along(6, 84, (x, r, i) => {
    const y = 34 + r() * 5;
    return ewrap(x + 20, 26, X => [[-9, 2, 9], [8, 0, 10], [0, -9, 9], [0, 4, 8]].map(([dx, dy, R]) => circ(X + dx, y + dy, R, '#cfe4f4', OL('#6a8aac', 2.2))).join('') + [[-9, 2], [8, 0], [0, -9], [0, 4]].map(([dx, dy]) => circ(X + dx - 2, y + dy - 3, 2.6, '#ffffff', ' opacity="0.9"')).join(''));
  });
  // inner icy rocks with frost caps
  o += along(9, 85, (x, r, i) => {
    const R = 15 + r() * 4, y = 50 + r() * 3, s = 8500 + i;
    return ewrap(x, R + 4, X => lump(X, y, R, s, rock, '#c0d6ea', '#5a7898', out) + pth(blob(X - R * 0.1, y - R * 0.35, R * 0.62, R * 0.28, s + 3, 9, 0.15), '#f4f9fd', OL('#b4c8dc', 1.2)));
  });
  // frost sparkles
  o += along(12, 86, (x, r) => { const y = 22 + r() * 30; return ewrap(x, 4, X => circ(X, y, 1.8, '#ffffff')); });
  return svg(EW, EH, o);
}

// =====================================================================================
// DECOR (128 x 128, upright 3/4, base at y≈112)
// =====================================================================================
const D = 128;
const base = (rx = 34, col = '#000', op = 0.2) => ell(64, 113, rx, 7, col, ` opacity="${op}"`);
const blush = (x, y, col = '#ff9aa8') => ell(x, y, 4.5, 2.8, col, ' opacity="0.6"');
const eye = (x, y, r = 4.2, out = '#1f2a44') => circ(x, y, r, out) + circ(x - r * 0.35, y - r * 0.4, r * 0.38, '#ffffff') + circ(x + r * 0.3, y + r * 0.35, r * 0.16, '#ffffff');
const smile = (x, y, w, col, sw = 2.2) => stk(`M${f(x - w)} ${f(y)}q${f(w)} ${f(w * 0.8)} ${f(w * 2)} 0`, col, sw);
const sandMound = (col, out, hi) => pth('M10 116C12 104 30 98 64 98C98 98 116 104 118 116Z', col, OL(out, 2.6)) + pth('M30 104C42 100 56 100 66 101C52 103 40 105 32 108Z', hi, ' opacity="0.8"');
// --- spring ---
function anemoneFish() {
  const out = '#8a3f44';
  let o = base(36, '#6a3a2a');
  // tentacles (rounded, swaying)
  const tent = [[-1.2, 34], [-0.85, 40], [-0.5, 44], [-0.15, 46], [0.2, 46], [0.55, 44], [0.9, 40], [1.25, 34]];
  let d = ''; for (const [a, L] of tent) d += `M${f(64 + Math.sin(a) * 14)} 96Q${f(64 + Math.sin(a) * L * 0.9 - 6)} ${f(96 - L * 0.6)} ${f(64 + Math.sin(a) * L)} ${f(96 - Math.cos(a) * L)}`;
  o += stk(d, out, 12) + stk(d, '#d98aa4', 8.4) + stk(d, '#f5c2d2', 3, ' opacity="0.8"');
  for (const [a, L] of tent) o += circ(64 + Math.sin(a) * L, 96 - Math.cos(a) * L, 5.2, '#f7d2de', OL(out, 2));
  // column
  o += pth('M40 112C40 100 46 94 64 94C82 94 88 100 88 112Z', '#e88a6c', OL(out));
  o += stk('M48 104q16 6 32 0', '#ffc29a', 2.4);
  // little original fish (peach-orange with cream bands) peeking out, facing right
  const fx = 70, fy = 58;
  o += pth(`M${fx - 16} ${fy}L${fx - 26} ${fy - 8}L${fx - 25} ${fy + 8}Z`, '#f49a5a', OL('#8a4a24', 2.2));
  o += ell(fx, fy, 17, 11, '#f7a25e', OL('#8a4a24', 2.6));
  o += stk(`M${fx - 6} ${fy - 10}q-3 10 0 20M${fx + 6} ${fy - 10}q3 10 0 20`, '#fff4e4', 3.6);
  o += pth(`M${fx - 2} ${fy - 11}Q${fx + 2} ${fy - 18} ${fx + 8} ${fy - 10}Z`, '#f49a5a', OL('#8a4a24', 1.8));
  o += eye(fx + 9, fy - 2, 3.4) + smile(fx + 11, fy + 4, 2.4, '#8a4a24', 1.8) + blush(fx + 4, fy + 5, '#ff8a7a');
  return svg(D, D, o);
}
function coralBush() {
  const out = '#8a3f44';
  let o = base(36, '#6a3a2a');
  let d = '';
  const br = (px, py, a, L, lev) => { const ex = px + Math.sin(a) * L, ey = py - Math.cos(a) * L; d += `M${f(px)} ${f(py)}L${f(ex)} ${f(ey)}`; if (lev) { br(ex, ey, a - 0.5, L * 0.74, lev - 1); br(ex, ey, a + 0.45, L * 0.74, lev - 1); } };
  br(64, 112, 0, 26, 3); br(58, 112, -0.7, 20, 2); br(70, 112, 0.75, 20, 2);
  o += stk(d, out, 15) + stk(d, '#f4a07e', 10.5) + stk(d, '#ffc6a2', 3.4, ' opacity="0.75"');
  // polyp dots
  const r = rng(91); for (let i = 0; i < 14; i++) o += circ(30 + r() * 68, 30 + r() * 70, 1.8, '#fff0e2', ' opacity="0.9"');
  o += pth(blob(64, 112, 26, 6, 92, 9, 0.1), '#b4645f', OL(out, 2.4));
  return svg(D, D, o);
}
function clamPearl() {
  const out = '#6a4a6a';
  let o = base(40, '#5a3a3a');
  // top shell (open, tilted back)
  o += pth('M22 88C20 62 40 44 64 44C88 44 108 62 106 88Z', '#e8bfd0', OL(out));
  o += stk('M64 88V48M64 88L44 52M64 88L84 52M64 88L30 66M64 88L98 66', '#c48aa6', 2.2, ' opacity="0.8"');
  o += pth('M34 70C38 58 50 50 60 50C50 56 42 64 38 74Z', '#fbe6ee', ' opacity="0.85"');
  // inside + pearl
  o += pth('M24 90C30 98 98 98 104 90C98 102 30 102 24 90Z', '#f7e4ec', OL(out, 2.4));
  o += circ(64, 90, 10, '#fbf8ff', OL('#9a8ab8', 2.4)) + circ(60, 86, 3.4, '#ffffff') + ell(68, 94, 3, 1.6, '#d8d0f0', ' opacity="0.8"');
  // bottom shell
  o += pth('M20 94C24 108 44 114 64 114C84 114 104 108 108 94C96 102 32 102 20 94Z', '#dca8c0', OL(out));
  o += stk('M40 106l2 5M54 108l1 5M74 108l-1 5M88 106l-2 5', '#b4809c', 2);
  // happy closed eyes on the shell
  o += stk('M50 66q4 -4 8 0M70 66q4 -4 8 0', out, 2.4) + blush(46, 74) + blush(82, 74) + smile(60, 74, 4, out, 2);
  return svg(D, D, o);
}
function seahorse() {
  const sk = '#f0b27a', out = '#8a4a2a', hi = '#ffd6a8';
  let o = base(24, '#6a3a2a');
  o += sandMound('#e4c08e', '#a9875c', '#f6e2bd');
  // tail curl
  o += stk('M62 92C66 100 60 108 52 106C46 104 46 96 52 96', out, 11) + stk('M62 92C66 100 60 108 52 106C46 104 46 96 52 96', sk, 7);
  // body
  o += pth('M58 34C72 30 82 42 78 56C76 66 72 76 66 92C60 92 54 88 54 80C54 70 50 62 52 52C50 44 52 38 58 34Z', sk, OL(out));
  o += pth('M58 56C62 66 62 78 60 88C56 84 56 72 56 62Z', hi, ' opacity="0.8"');
  o += stk('M56 64h7M56 72h7M57 80h6', '#d88a52', 2, ' opacity="0.8"');
  // back fin
  o += pth('M78 58C88 56 92 66 84 72C82 66 80 62 76 62Z', '#ffc890', OL(out, 2));
  // head + snout
  o += pth('M50 32C54 22 70 20 76 30C80 38 74 44 66 42L48 46C42 46 40 40 44 38Z', sk, OL(out));
  o += pth('M58 22l3 -7 4 6 4 -5 2 8Z', '#ffc890', OL(out, 2));
  o += eye(64, 32, 3.8) + blush(70, 39);
  // bubble
  o += circ(38, 30, 4, '#ffffff', OL('#9ac8e0', 1.6) + ' fill-opacity="0.4"') + circ(32, 18, 2.6, '#ffffff', OL('#9ac8e0', 1.4) + ' fill-opacity="0.4"');
  return svg(D, D, o);
}
// --- summer ---
function turtlePeek() {
  const out = '#2f5a3a', sk = '#9ed08a', shell = '#5fa070', shellD = '#3f7a50';
  let o = base(42, '#2a5a5a');
  // shell dome peeking from behind a rock
  o += pth('M18 92C18 62 40 46 66 46C92 46 108 62 108 92Z', shell, OL(out));
  [[46, 66], [66, 58], [86, 66], [56, 80], [78, 80]].forEach(([x, y]) => { o += pth(blob(x, y, 9, 7, x * 3 + y, 6, 0.05), '#7cbc84', OL(shellD, 2)); });
  o += pth('M34 60C42 52 54 50 62 50C52 54 44 58 38 66Z', '#a8dca0', ' opacity="0.7"');
  // head popping out on the right, flipper waving
  o += pth('M100 70C106 56 122 56 124 70C126 82 114 88 104 84Z', sk, OL(out));
  o += eye(114, 68, 3.8) + smile(114, 76, 3.4, out) + blush(108, 78);
  o += pth('M96 86C104 82 116 86 118 94C110 96 100 94 96 90Z', sk, OL(out, 2.6));
  // rock in front
  o += pth('M6 116C4 100 16 90 34 92C46 84 70 86 80 96C94 90 114 94 120 106C122 112 120 116 116 117Z', '#8fbcb4', OL('#3f6a66'));
  o += pth('M18 102C26 96 36 96 42 98C34 100 28 102 22 106Z', '#c4e6de', ' opacity="0.85"');
  return svg(D, D, o);
}
function fanCoral() {
  const out = '#8a3a34';
  let o = base(34, '#2a5a5a');
  o += pth('M64 110L20 56Q24 18 64 14Q104 18 108 56Z', '#ee7a68', OL(out));
  // lattice
  let d = ''; for (let k = -4; k <= 4; k++) d += `M64 108Q${f(64 + k * 6)} 70 ${f(64 + k * 10)} ${f(22 + Math.abs(k) * 4)}`;
  for (let j = 1; j < 5; j++) d += `M${f(64 - j * 10)} ${f(110 - j * 20)}Q64 ${f(100 - j * 22)} ${f(64 + j * 10)} ${f(110 - j * 20)}`;
  o += stk(d, '#ffc2a8', 1.8, ' opacity="0.9"');
  o += pth('M34 50Q40 28 60 22Q46 34 42 54Z', '#ffb4a0', ' opacity="0.7"');
  o += pth('M50 116C50 108 56 104 64 104C72 104 78 108 78 116Z', '#8fbcb4', OL('#3f6a66', 2.6));
  return svg(D, D, o);
}
function seaGrass() {
  let o = base(30, '#2a5a5a');
  const bl = [[40, 30, -14], [52, 18, -6], [64, 12, 2], [76, 20, 10], [88, 32, 16], [46, 50, -20], [82, 46, 22]];
  for (const [x, top, lean] of bl) {
    const d = `M${x + (64 - x) * 0.6 - 2} 112Q${x - lean * 0.2} ${(112 + top) / 2} ${x + lean} ${top}Q${x + lean * 0.2 + 6} ${(112 + top) / 2} ${x + (64 - x) * 0.6 + 4} 112Z`;
    o += pth(d, '#62b07a', OL('#2f6a4a', 2.6));
    o += stk(`M${x + (64 - x) * 0.6 + 1} 108Q${x + 2} ${(112 + top) / 2} ${x + lean * 0.95} ${top + 4}`, '#a4dca8', 1.6, ' opacity="0.8"');
  }
  o += pth(blob(64, 112, 28, 6, 1401, 9, 0.1), '#e2efe4', OL('#93b0a6', 2.2));
  return svg(D, D, o);
}
function castleRock() {
  const out = '#5f6a5a', rk = '#d8d2b8', rkD = '#b4ad92';
  let o = base(44, '#2a5a5a');
  // a sandcastle-shaped rock: three rounded towers
  o += pth('M22 112L24 70Q24 64 30 64L36 64Q42 64 42 70L42 80L52 80L52 50Q52 42 60 42L68 42Q76 42 76 50L76 80L86 80L86 66Q86 60 92 60L98 60Q104 60 104 66L106 112Z', rk, OL(out));
  o += [[33, 64], [64, 42], [95, 60]].map(([x, y]) => pth(`M${x - 9} ${y}q0 -6 4 -6q1 4 5 4q4 0 5 -4q4 0 4 6Z`, rk, OL(out, 2.4))).join('');
  o += pth('M58 112L58 98Q64 90 70 98L70 112Z', '#7a8a7a', OL(out, 2.4));
  o += circ(64, 62, 4, '#7a8a7a', OL(out, 2)) + circ(33, 82, 3, '#7a8a7a', OL(out, 1.8)) + circ(95, 78, 3, '#7a8a7a', OL(out, 1.8));
  o += pth('M56 46L58 86L54 86L54 52Z', '#f6f2e0', ' opacity="0.8"') + pth('M98 66L100 108L104 108L102 66Z', rkD, ' opacity="0.7"');
  o += stk('M28 96q8 -4 14 0M78 100q8 -4 16 0', rkD, 2);
  // a tiny barnacle/shell
  o += pth('M86 106l-5 -1c0 -5 3 -7 5 -7s5 2 5 7Z', '#fbf6ea', OL('#b8a88e', 1.4));
  return svg(D, D, o);
}
// --- autumn ---
function kelpClump() {
  let o = base(30, '#3a2414');
  const bl = [[44, 16, -10], [60, 6, -2], [76, 12, 8], [90, 28, 14], [34, 36, -16]];
  bl.forEach(([x, top, lean], i) => {
    const sway = i % 2 ? 6 : -6, bx = 60 + (x - 64) * 0.3;
    const L = `M${bx} 112C${bx + sway} 84 ${x + lean - sway} ${(top + 60) / 2} ${x + lean} ${top}`;
    o += stk(L, '#5a4418', 9) + stk(L, i % 2 ? '#a8843c' : '#94742e', 6);
    // leaf blades along the stipe
    for (let k = 1; k <= 3; k++) { const t = k / 4, px = bx + (x + lean - bx) * t, py = 112 + (top - 112) * t, s = k % 2 ? 1 : -1; o += pth(`M${f(px)} ${f(py)}q${f(s * 10)} ${f(-2)} ${f(s * 14)} ${f(-12)}q${f(-s * 10)} ${f(2)} ${f(-s * 14)} ${f(12)}Z`, '#b89448', OL('#5a4418', 1.8)); }
    o += circ(x + lean, top + 2, 4.2, '#c8a458', OL('#5a4418', 1.8));
  });
  o += pth(blob(62, 112, 22, 7, 3101, 9, 0.15), '#6a5422', OL('#3e3010', 2.4));
  return svg(D, D, o);
}
function orangeSponge() {
  const out = '#8a4418', col = '#ee9a46', colD = '#d6782e';
  let o = base(38, '#3a2414');
  const tube = (x, w, top) => pth(`M${x - w} 112L${x - w + 2} ${top + 6}Q${x} ${top - 4} ${x + w - 2} ${top + 6}L${x + w} 112Z`, col, OL(out)) + ell(x, top + 6, w - 2, 5, '#9a4a1c', OL(out, 2.4)) + pth(`M${x - w + 5} ${top + 14}L${x - w + 6} 106L${x - w + 10} 106L${x - w + 9} ${top + 14}Z`, '#ffc890', ' opacity="0.6"');
  o += tube(42, 14, 62) + tube(86, 13, 54) + tube(64, 16, 34);
  const r = rng(3201); for (let i = 0; i < 16; i++) o += circ(30 + r() * 68, 50 + r() * 58, 1.6 + r(), colD, ' opacity="0.8"');
  o += pth(blob(64, 113, 44, 6, 3202, 9, 0.1), '#8f6a4c', OL('#4e3220', 2.4));
  return svg(D, D, o);
}
function hermitCrab() {
  const out = '#6a2e1a', sk = '#f08a5a';
  let o = base(36, '#3a2414');
  // spiral shell (cream-tan)
  o += pth('M44 100C30 96 26 76 36 64C46 50 70 50 78 64C84 76 78 92 64 96Z', '#efd8b4', OL('#7a5a34'));
  o += stk('M56 80a7 7 0 1 1 8 -8a13 13 0 1 1 -18 14a19 19 0 0 1 4 -28', '#b48a5a', 2.4);
  o += pth('M40 70C44 60 54 56 62 56C54 60 46 66 44 74Z', '#fff4e0', ' opacity="0.8"');
  // crab peeking out at the front-right
  o += pth('M66 98C66 86 74 80 84 80C96 80 102 88 102 98Z', sk, OL(out));
  o += stk('M80 82L78 68M90 82L92 68', out, 2.4) + eye(78, 66, 4.2) + eye(93, 66, 4.2);
  o += smile(84, 90, 4, out) + blush(74, 92, '#ff6a5a') + blush(96, 92, '#ff6a5a');
  // claws
  o += pth('M100 92C108 86 118 88 118 96C118 102 110 104 104 100Z', sk, OL(out, 2.6)) + stk('M110 92l6 -3', out, 2);
  o += pth('M68 96C60 92 54 96 56 102C58 106 64 106 68 102Z', sk, OL(out, 2.6));
  // legs
  o += stk('M72 100l-4 10M80 100l-2 11M90 100l2 11M98 100l4 10', out, 3.4);
  return svg(D, D, o);
}
function octopusPeek() {
  const out = '#7a3a5a', sk = '#e89aa0', skD = '#d07a86';
  let o = base(42, '#3a2414');
  // head peeking above a rock, two arms waving
  o += pth('M30 92C26 56 44 34 66 34C88 34 104 56 100 92Z', sk, OL(out));
  o += ell(54, 50, 12, 7, '#fbd2d0', ' opacity="0.8"');
  o += [[44, 70], [84, 64], [76, 84], [50, 84]].map(([x, y]) => circ(x, y, 3, skD)).join('');
  o += eye(54, 70, 5) + eye(78, 70, 5) + blush(46, 80) + blush(86, 80) + smile(60, 80, 6, out);
  o += stk('M28 88C16 84 12 72 18 64C22 60 26 64 24 68', out, 10) + stk('M28 88C16 84 12 72 18 64C22 60 26 64 24 68', sk, 6.4);
  o += stk('M102 86C114 80 118 68 112 60C108 56 104 60 106 64', out, 10) + stk('M102 86C114 80 118 68 112 60C108 56 104 60 106 64', sk, 6.4);
  o += circ(22, 74, 1.6, '#fff0f0') + circ(112, 72, 1.6, '#fff0f0');
  // brown rock in front
  o += pth('M8 116C6 100 18 90 34 92C44 86 62 88 70 96C82 88 108 90 118 104C122 110 120 116 116 117Z', '#8f6a4c', OL('#4e3220'));
  o += pth('M20 102C28 96 38 96 44 98C36 100 30 102 24 106Z', '#b48e6a', ' opacity="0.85"');
  return svg(D, D, o);
}
// --- winter ---
function icyRocks() {
  const out = '#3e5a7a';
  let o = base(42, '#2a3a5a');
  const st = (x, y, rx, ry, col) => ell(x, y, rx, ry, col, OL(out)) + pth(`M${x - rx * 0.8} ${y - ry * 0.25}C${x - rx * 0.6} ${y - ry * 1.15} ${x + rx * 0.6} ${y - ry * 1.15} ${x + rx * 0.85} ${y - ry * 0.2}C${x + rx * 0.4} ${y - ry * 0.55} ${x - rx * 0.4} ${y - ry * 0.55} ${x - rx * 0.8} ${y - ry * 0.25}Z`, '#f4f9fd', OL('#b4c8dc', 1.4)) + ell(x + rx * 0.45, y + ry * 0.35, rx * 0.18, ry * 0.15, '#5a7898', ' opacity="0.6"');
  o += st(60, 98, 38, 16, '#8fb0cc') + st(90, 92, 18, 12, '#9ab8d2') + st(58, 72, 24, 13, '#a6c2dc') + st(62, 50, 14, 10, '#b4cce2');
  o += pth('M100 30l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z', '#ffffff', OL('#8ab4e8', 1.2));
  return svg(D, D, o);
}
function glowCoral() {
  const out = '#4a6a9a';
  let o = base(32, '#2a3a5a');
  o += circ(64, 64, 52, 'url(#glow)');
  const stalks = [[40, 52], [52, 36], [66, 28], [80, 40], [90, 58]];
  let d = ''; for (const [x, y] of stalks) d += `M64 110Q${f((x + 64) / 2)} ${f((y + 110) / 2 + 6)} ${x} ${y}`;
  o += stk(d, out, 9) + stk(d, '#cfe4f4', 5.4);
  for (const [x, y] of stalks) {
    o += circ(x, y, 9, '#e6f2ff', OL(out, 2.4));
    for (let k = 0; k < 6; k++) { const a = k * 1.047; o += circ(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 2.2, '#b4d8ff'); }
    o += circ(x, y, 3, '#ffffff');
  }
  o += pth(blob(64, 112, 22, 6, 4101, 9, 0.1), '#8fb0cc', OL('#3e5a7a', 2.4));
  return svg(D, D, o, rad('glow', [[0, '#e6f4ff', 0.75], [0.55, '#bcdcff', 0.3], [1, '#bcdcff', 0]]));
}
function sealPup() {
  const out = '#4a5a72', fur = '#e6ecf4', furD = '#c4cedc';
  let o = base(40, '#2a3a5a');
  // round pup peeking over an icy rock
  o += pth('M28 96C24 62 42 40 64 40C86 40 104 62 100 96Z', fur, OL(out));
  o += pth('M40 60C44 50 54 46 62 46C52 50 46 56 44 64Z', '#ffffff', ' opacity="0.9"');
  o += [[80, 56], [88, 70], [44, 76]].map(([x, y]) => circ(x, y, 2.6, furD)).join('');
  o += eye(52, 66, 5.4) + eye(76, 66, 5.4);
  o += ell(64, 76, 9, 6, '#ffffff', OL(furD, 1.6)) + ell(64, 73, 3.6, 2.6, '#4a5a72');
  o += stk('M60 79q4 4 8 0', out, 2) + stk('M54 76h-10M54 79l-9 3M74 76h10M74 79l9 3', furD, 1.4);
  o += blush(44, 76) + blush(84, 76);
  // flipper waving
  o += pth('M96 88C104 78 116 76 120 82C118 90 106 94 96 94Z', furD, OL(out, 2.6)) + pth('M30 92C24 86 16 88 14 94C20 98 28 98 32 96Z', furD, OL(out, 2.6));
  // icy rock in front with a frost cap
  o += pth('M8 116C6 100 18 90 34 92C44 86 62 88 70 96C82 88 108 90 118 104C122 110 120 116 116 117Z', '#8fb0cc', OL('#3e5a7a'));
  o += pth('M18 98C26 90 40 90 50 94C60 88 72 90 76 96C66 96 56 98 50 100C40 96 28 96 18 102Z', '#f4f9fd', OL('#b4c8dc', 1.4));
  return svg(D, D, o);
}
function shellCluster() {
  let o = base(40, '#2a3a5a');
  o += sandMound('#c3ced8', '#7a8898', '#e2eaf2');
  // conch (pale lilac-grey, desaturated)
  o += pth('M30 104C22 90 30 72 46 66L60 60C64 70 62 84 56 96C50 104 40 108 30 104Z', '#e6e0ee', OL('#6a6a8a'));
  o += stk('M48 70l-4 8M54 66l-2 8M40 76l-2 8', '#a8a0c0', 2);
  o += pth('M38 96C44 92 50 86 52 78C54 88 48 98 38 100Z', '#c8b8d8', ' opacity="0.8"');
  // scallop (cream-white)
  o += pth('M86 104L64 86C62 72 72 62 86 62C100 62 110 72 108 86Z', '#f4f0e6', OL('#7a7a8a'));
  o += stk('M86 104V66M86 104L74 70M86 104L98 70M86 104L66 80M86 104L106 80', '#c4bca8', 1.8);
  o += pth('M80 106h12l-2 6h-8Z', '#d8d0bc', OL('#7a7a8a', 2));
  // small spiral
  o += circ(56, 106, 7, '#dfe8f2', OL('#5a6a82', 2.2)) + stk('M57 106a2.5 2.5 0 1 1 -2.6 -2.4a5 5 0 1 1 -3 4', '#7a8aa2', 1.4);
  return svg(D, D, o);
}
const DECOR = {
  spring: [anemoneFish, coralBush, clamPearl, seahorse],
  summer: [turtlePeek, fanCoral, seaGrass, castleRock],
  autumn: [kelpClump, orangeSponge, hermitCrab, octopusPeek],
  winter: [icyRocks, glowCoral, sealPup, shellCluster],
};

// =====================================================================================
// PARTICLES (32 x 32 centred; ray 64 x 256)
// =====================================================================================
const P = {
  bubble: () => svg(32, 32, circ(16, 16, 13, 'url(#b)', OL('#bfe6f4', 1.6)) + stk('M8.5 13A8 8 0 0 1 14 7.6', '#ffffff', 2.4) + circ(21.5, 21, 1.6, '#ffffff', ' opacity="0.8"'),
    rad('b', [[0, '#ffffff', 0.05], [0.7, '#e6f8ff', 0.25], [1, '#ffffff', 0.6]])),
  spawn: () => svg(32, 32, circ(16, 16, 15, 'url(#g)') + circ(16, 16, 4.2, '#ffd0dc') + circ(15, 15, 1.6, '#ffffff', ' opacity="0.9"'),
    rad('g', [[0, '#ffc2d2', 0.9], [0.35, '#ffb0c4', 0.45], [1, '#ffb0c4', 0]])),
  fish: () => svg(32, 32, pth('M7 16L1 10L2 22Z', '#ffc93a', OL('#a8741a', 1.4)) + ell(15, 16, 10, 6.4, '#ffd84a', OL('#a8741a', 1.6)) + pth('M12 10Q15 6 19 10Z', '#ffc93a', OL('#a8741a', 1.2)) +
    ell(13, 18.5, 6, 2.2, '#fff4c0', ' opacity="0.9"') + circ(20, 14.6, 2.1, '#1f2a44') + circ(19.4, 14, 0.7, '#ffffff')),
  ray: () => svg(64, 256, pth('M20 0L44 0L60 256L4 256Z', 'url(#r)', ' opacity="0.5"') + pth('M26 0L38 0L48 256L16 256Z', 'url(#r)', ' opacity="0.6"') + pth('M30 0L34 0L38 256L26 256Z', 'url(#r)', ' opacity="0.5"'),
    lin('r', [[0, '#ffffff', 0.9], [0.55, '#ffffff', 0.35], [1, '#ffffff', 0]])),
  kelp: () => svg(32, 32, pth('M4 26C8 14 18 6 28 4C26 14 18 24 6 28Z', '#8f9a3a', OL('#4a4a14', 1.8)) + stk('M5 27L26 6', '#5a5a1e', 1.4) + pth('M10 20C14 14 18 10 24 8C18 12 14 16 11 21Z', '#c8d070', ' opacity="0.8"')),
  snow: () => svg(32, 32, circ(16, 16, 12, 'url(#s)') + pth(blob(16, 16, 4.2, 3.4, 77, 7, 0.25), '#ffffff', ' opacity="0.95"'),
    rad('s', [[0, '#ffffff', 0.8], [0.45, '#f0f6ff', 0.35], [1, '#ffffff', 0]])),
  jelly: () => svg(32, 32, circ(16, 14, 15, 'url(#j)') + stk('M10 17q-2 5 0 10M14 18q2 5 -1 10M18 18q-2 5 1 10M22 17q2 5 0 10', '#d8b4f0', 1.6, ' opacity="0.9"') +
    pth('M5 17C5 9 10 5 16 5C22 5 27 9 27 17C24 19 8 19 5 17Z', '#f6c8e6', OL('#b07ab8', 1.4) + ' fill-opacity="0.92"') + ell(12, 9.5, 4, 2, '#ffffff', ' opacity="0.8"') +
    circ(13, 13, 1.3, '#6a3a7a') + circ(19, 13, 1.3, '#6a3a7a') + stk('M14.6 15.4q1.4 1.2 2.8 0', '#6a3a7a', 1),
    rad('j', [[0, '#ffd8f4', 0.6], [0.6, '#e8c0ff', 0.2], [1, '#e8c0ff', 0]])),
  sparkle: () => svg(32, 32, pth('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#f2fbff', OL('#8fd8f0', 1.4)) + pth('M16 8Q16.8 15.2 24 16Q16.8 16.8 16 24Q15.2 16.8 8 16Q15.2 15.2 16 8Z', '#ffffff')),
  sand: () => svg(32, 32, circ(16, 17, 15, 'url(#d)') + circ(11, 18, 6, '#fff3dc', ' opacity="0.75"') + circ(18, 13, 6.5, '#fff8ea', ' opacity="0.8"') + circ(22, 19, 5.2, '#f8e8c8', ' opacity="0.75"') +
    circ(7, 10, 1.5, '#a8875a') + circ(26, 10, 1.3, '#a8875a') + circ(25, 26, 1.4, '#a8875a') + circ(8, 25, 1.2, '#a8875a') + circ(16, 4, 1.1, '#a8875a'),
    rad('d', [[0, '#fff6e4', 0.75], [0.6, '#fbecd0', 0.35], [1, '#fbecd0', 0]])),
};

// =====================================================================================
const GROUND = { spring: groundSpring, summer: groundSummer, autumn: groundAutumn, winter: groundWinter };
const EDGE = { spring: edgeSpring, summer: edgeSummer, autumn: edgeAutumn, winter: edgeWinter };
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return s.length; };
const sizes = [];
for (const b of Object.keys(GROUND)) {
  sizes.push([`${b}/ground`, write(path.join(OUT, 'biomes', b, 'ground.svg'), GROUND[b]())]);
  sizes.push([`${b}/edge`, write(path.join(OUT, 'biomes', b, 'edge.svg'), EDGE[b]())]);
  DECOR[b].forEach((fn, i) => sizes.push([`${b}/decor_${i}`, write(path.join(OUT, 'biomes', b, `decor_${i}.svg`), fn())]));
}
for (const [n, fn] of Object.entries(P)) sizes.push([`particles/${n}`, write(path.join(OUT, 'particles', n + '.svg'), fn())]);
console.log(sizes.map(([n, s]) => `${n} ${(s / 1024).toFixed(1)}KB`).join('\n'));
