// Bao's Arctic Reel: environment art generator (4 depth zones + shared hole rim + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg   960x200 opaque, tiles in x.
//  - levels/<zone>/far.svg   960x200 transparent, tiles in x, horizon bottom ≈ y165.
//  - levels/<zone>/ice.svg   960x80  transparent above y4, snow top at y10 (= SURFACE_Y), slab to ≈ y50, icicles to ≈ y65.
//  - levels/<zone>/water.svg 960x400 opaque, soft only (stretched).
//  - levels/<zone>/reef.svg  960x320 transparent, seabed top ≈ y286 (= FLOOR_Y), x 340–620 kept ≤ 60 px tall.
//  - hole_rim.svg 96x80 (gap x 16..80, svg y10 = SURFACE_Y), particles/*.svg 32x32.
// Tileability: every edge-crossing shape is emitted again at ±960; every horizon / snow / seabed profile is a sum of
// sines with whole periods over 960 px, so the first and last sample are identical.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.42) => mix(c, '#14213a', t);   // outline / shade: a dark blue tone of the fill, never black
const lite = (c, t = 0.35) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, k = 0.22) => { // 4-point concave sparkle
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, nx = cx + Math.cos(b) * R, ny = cy + Math.sin(b) * R;
    const m = a + Math.PI / 4, qx = cx + Math.cos(m) * R * k, qy = cy + Math.sin(m) * R * k;
    d += (i ? '' : `M${f(x)} ${f(y)}`) + `Q${f(qx)} ${f(qy)} ${f(nx)} ${f(ny)}`;
  }
  return d + 'Z';
};
// emit fn(X) for every horizontal copy (x, x±960) whose [X-rr, X+rr] touches the tile
const wrap = (x, rr, fn) => [-W, 0, W].map(dx => x + dx).filter(X => X + rr > 0 && X - rr < W).map(fn).join('');
// periodic profile: base + Σ a·sin(2π k x / 960 + p)  (k integer => seamless)
const prof = (base, terms) => x => base + terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const profPath = (fy, yBottom, step = 6, x0 = 0, x1 = W) => { let d = `M${x0} ${yBottom}`; for (let x = x0; x <= x1 + 0.01; x += step) d += `L${f(x)} ${f(fy(x))}`; return d + `L${x1} ${yBottom}Z`; };
const profLine = (fy, step = 6, x0 = 0, x1 = W) => { let d = ''; for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + f(x) + ' ' + f(fy(x)); return d; };
// closed smooth blob through points (quadratic through midpoints)
const blob = pts => { const n = pts.length, mid = i => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2]; let [mx, my] = mid(n - 1); let d = `M${f(mx)} ${f(my)}`; for (let i = 0; i < n; i++) { const [qx, qy] = mid(i); d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(qx)} ${f(qy)}`; } return d + 'Z'; };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// =====================================================================================
// PALETTES
// =====================================================================================
const PAL = {
  shallows: { // bright morning
    sky: [['0', '#4aa3e3'], ['0.55', '#a6daf4'], ['1', '#e6f7fd']],
    sun: '#fff6cf', cloud: '#ffffff', cloudSh: '#cfe6f6',
    hill: '#e9f4fb', hillSh: '#bcdcef', berg: '#f6fbff', bergSh: '#a9d3ec',
    snow: '#fbfdff', snowSh: '#d6e9f6', iceT: '#d4eff9', iceB: '#8fcde6', crack: '#ffffff',
    water: ['#7fd6e8', '#2d8fb8'], rays: 0.22,
    sand: '#eadfba', sandSh: '#cdbd92', rock: '#8aa3b4', rockSh: '#6c869a',
  },
  kelp: { // golden afternoon
    sky: [['0', '#5f9fd4'], ['0.5', '#e9d9ac'], ['0.82', '#ffd59a'], ['1', '#ffe7bf']],
    sun: '#fff0b8', cloud: '#fff4e2', cloudSh: '#f1cfa2',
    hill: '#f6ecd8', hillSh: '#d9c7a6', berg: '#fff8ec', bergSh: '#c9c5c0',
    snow: '#fffaf0', snowSh: '#ecdcc2', iceT: '#d6efe8', iceB: '#86c7bf', crack: '#fffdf6',
    water: ['#5cc2b0', '#1f6f78'], rays: 0.18,
    sand: '#d9cfa6', sandSh: '#b2a67c', rock: '#7d9a8e', rockSh: '#5d7b70',
  },
  twilight: { // pink-purple dusk
    sky: [['0', '#2b2d68'], ['0.38', '#5d4f9c'], ['0.72', '#d98aae'], ['1', '#ffc3a6']],
    sun: '#fbe9ff', cloud: '#e7a7c6', cloudSh: '#a77bb3',
    hill: '#c9b4d6', hillSh: '#8f80b2', berg: '#e8d9ec', bergSh: '#9b8fc4',
    snow: '#f4eefb', snowSh: '#c9bfe2', iceT: '#bcd3ef', iceB: '#6f93c9', crack: '#f4f2ff',
    water: ['#3c6fb0', '#182f63'], rays: 0,
    sand: '#8b97b8', sandSh: '#69769a', rock: '#4d5d86', rockSh: '#38466c',
  },
  aurora: { // deep night with aurora
    sky: [['0', '#040a21'], ['0.6', '#0d1c46'], ['1', '#173464']],
    sun: '#eaf6ff', cloud: '#1b2c58', cloudSh: '#13214a',
    hill: '#33507f', hillSh: '#253d68', berg: '#5d82ad', bergSh: '#3b5d8c',
    snow: '#cfe3f4', snowSh: '#8eabcc', iceT: '#7fb3d6', iceB: '#3a6b9e', crack: '#d8fff0',
    water: ['#1d3a6b', '#0a1530'], rays: 0,
    sand: '#3d4f7c', sandSh: '#2c3a62', rock: '#2a3a63', rockSh: '#1d2a4c',
  },
};
const ZONES = Object.keys(PAL);

// =====================================================================================
// SKY 960x200 (opaque, tileable)
// =====================================================================================
function cloud(x, y, s, P, r) {
  // puffy cumulus: flat-ish bottom, 4-6 lobes; one-step shade underneath
  const lobes = [[-1.0, 0.1, 0.55], [-0.45, -0.32, 0.75], [0.2, -0.45, 0.85], [0.8, -0.15, 0.62], [1.15, 0.12, 0.45]];
  let body = '', shade = '';
  for (const [dx, dy, rr] of lobes) body += circ(x + dx * s, y + dy * s, rr * s, P.cloud);
  body += rect(x - 1.15 * s, y - 0.05 * s, 2.5 * s, 0.5 * s, P.cloud, ` rx="${f(0.25 * s)}"`);
  shade = ell(x + 0.08 * s, y + 0.32 * s, 1.25 * s, 0.17 * s, P.cloudSh, ' opacity="0.9"');
  const hl = ell(x + 0.05 * s, y - 0.7 * s, 0.35 * s, 0.14 * s, '#ffffff', ' opacity="0.55"');
  return `<g>${body}${shade}${hl}</g>`;
}
function streak(x, y, len, col, a) { // thin dusk cloud streak
  return `<g opacity="${a}">${ell(x, y, len / 2, 3.5, col)}${ell(x - len * 0.05, y - 4, len * 0.3, 3, col)}</g>`;
}
function sky(z) {
  const P = PAL[z], r = rng(11 + ZONES.indexOf(z) * 97);
  let defs = lin('sk', P.sky), b = rect(0, 0, W, 200, 'url(#sk)');
  if (z === 'shallows') {
    defs += rad('sg', [['0', '#fffbe6', 0.95], ['0.35', '#fff3c4', 0.5], ['1', '#fff3c4', 0]]);
    b += wrap(720, 90, X => circ(X, 58, 90, 'url(#sg)') + circ(X, 58, 26, P.sun) + circ(X - 7, 51, 9, '#ffffff', ' opacity="0.6"'));
    for (const [x, y, s] of [[110, 62, 26], [330, 108, 18], [520, 42, 22], [880, 98, 24], [640, 132, 14]]) b += wrap(x, s * 1.6, X => cloud(X, y, s, P, r));
  } else if (z === 'kelp') {
    defs += rad('sg', [['0', '#fff6d0', 1], ['0.3', '#ffe2a0', 0.55], ['1', '#ffd38a', 0]]);
    b += wrap(250, 120, X => circ(X, 118, 120, 'url(#sg)') + circ(X, 118, 30, P.sun) + circ(X - 8, 110, 10, '#ffffff', ' opacity="0.5"'));
    for (const [x, y, s] of [[60, 70, 22], [470, 52, 26], [700, 96, 18], [860, 44, 20], [380, 132, 12]]) b += wrap(x, s * 1.6, X => cloud(X, y, s, P, r));
  } else if (z === 'twilight') {
    // first stars in the dark top band
    for (let i = 0; i < 46; i++) { const x = r() * W, y = 4 + r() * 70, s = 0.6 + r() * 1.2; b += wrap(x, 4, X => circ(X, y, s, '#fff6ff', ` opacity="${f(0.45 + r() * 0.5)}"`)); }
    for (const [x, y] of [[150, 22], [610, 40], [830, 16]]) b += wrap(x, 8, X => pth(twinkle(X, y, 6), '#fff4fb', ' opacity="0.9"'));
    // crescent moon
    defs += rad('mg', [['0', '#ffffff', 0.55], ['1', '#ffffff', 0]]);
    b += wrap(420, 50, X => circ(X, 46, 50, 'url(#mg)') + pth(`M${X} 30A16 16 0 1 0 ${X} 62A20 20 0 0 1 ${X} 30Z`, P.sun));
    for (const [x, y, l] of [[90, 120, 170], [330, 140, 120], [560, 112, 200], [800, 134, 150], [960 - 20, 104, 90]]) b += wrap(x, l / 2 + 2, X => streak(X, y, l, P.cloud, 0.75));
    for (const [x, y, l] of [[230, 96, 110], [700, 90, 130]]) b += wrap(x, l / 2 + 2, X => streak(X, y, l, P.cloudSh, 0.45));
  } else { // aurora
    for (let i = 0; i < 110; i++) { const x = r() * W, y = 3 + r() * 175, s = 0.5 + r() * 1.3; b += wrap(x, 4, X => circ(X, y, s, '#eef6ff', ` opacity="${f(0.35 + r() * 0.6)}"`)); }
    for (const [x, y, s] of [[70, 30, 7], [300, 18, 6], [540, 64, 5], [770, 26, 8], [900, 140, 5], [180, 150, 4]]) b += wrap(x, s + 2, X => pth(twinkle(X, y, s), '#ffffff', ' opacity="0.95"'));
    // aurora ribbons: soft curtains following a periodic bottom curve. Glow = stacked strokes; rays = thin gradient rects.
    defs += lin('ar', [['0', '#ff9fd6', 0], ['0.35', '#7ff0c8', 0.22], ['0.85', '#5dffb0', 0.55], ['1', '#c6ffe6', 0.8]]);
    defs += lin('ar2', [['0', '#7fd8ff', 0], ['0.5', '#5ce6d9', 0.18], ['1', '#a8fff0', 0.6]]);
    const ribbons = [
      { yb: prof(118, [[22, 1, 0.4], [10, 2, 1.7], [5, 5, 0.3]]), h: prof(70, [[22, 2, 2.1], [10, 3, 0.2]]), g: 'ar', glow: '#62ffb4' },
      { yb: prof(78, [[14, 1, 2.6], [9, 3, 0.9], [4, 6, 1.1]]), h: prof(46, [[14, 1, 0.5], [8, 4, 1.4]]), g: 'ar2', glow: '#6fe8ff' },
    ];
    for (const R of ribbons) {
      let g = '';
      for (let x = 0; x < W; x += 6) { const yb = R.yb(x + 3), hh = Math.max(16, R.h(x + 3)); g += rect(x - 0.3, yb - hh, 6.6, hh + 1, `url(#${R.g})`); }
      // soft vertical rays (periodic spacing 960/48 = 20 px so the tile stays seamless)
      for (let i = 0; i < 48; i++) { const x = i * 20 + 7 * Math.sin(i * 1.7), yb = R.yb(x), hh = Math.max(16, R.h(x)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.3))); g += rect(x, yb - hh, 2.4, hh, '#bfffe4', ` opacity="${f(0.05 + 0.07 * Math.abs(Math.sin(i * 1.3)))}"`); }
      // soft glow along the lower edge
      for (const [w, a] of [[16, 0.08], [9, 0.14], [3, 0.5]]) g += stk(profLine(R.yb, 6), R.glow, w, ` opacity="${a}"`);
      b += `<g>${g}</g>`;
    }
  }
  return svg(W, 200, b, defs);
}

// =====================================================================================
// FAR 960x200 (transparent, tileable): ridge + icebergs + snow plain; bottom ≈ 165 (filled to 200 — hidden by ice/water)
// =====================================================================================
function iceberg(x, base, w, h, P, r, flip = false) {
  // flat-topped tabular / peaked berg with a lit left face and shaded right face
  const s = flip ? -1 : 1, pk = x + s * w * (0.05 + r() * 0.2);
  const top = base - h;
  const pts = [[x - w / 2, base], [x - w * 0.42, base - h * 0.55], [x - w * 0.25, top + h * 0.12], [pk, top], [x + w * 0.22, top + h * 0.18], [x + w * 0.4, base - h * 0.5], [x + w / 2, base]];
  const d = 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  const shadeD = `M${f(pk)} ${f(top)}L${f(x + w * 0.22)} ${f(top + h * 0.18)}L${f(x + w * 0.4)} ${f(base - h * 0.5)}L${f(x + w / 2)} ${f(base)}L${f(x + w * 0.05)} ${f(base)}L${f(x + w * 0.08)} ${f(base - h * 0.5)}Z`;
  return `<g>${pth(d, P.berg, OL(dark(P.bergSh, 0.25), 2))}${pth(shadeD, P.bergSh, ' opacity="0.75"')}${stk(`M${f(x - w * 0.3)} ${f(top + h * 0.3)}L${f(x - w * 0.18)} ${f(top + h * 0.2)}`, '#ffffff', 2.5, ' opacity="0.8"')}</g>`;
}
function igloo(x, y, s, P, lit) {
  const c = P.berg, d = `M${f(x - 10 * s)} ${f(y)}A${f(10 * s)} ${f(9 * s)} 0 0 1 ${f(x + 10 * s)} ${f(y)}Z`;
  let o = pth(d, c, OL(dark(c, 0.3), 1.5));
  o += stk(`M${f(x - 8 * s)} ${f(y - 4 * s)}H${f(x + 8 * s)}M${f(x - 3 * s)} ${f(y - 8.5 * s)}V${f(y - 4 * s)}M${f(x + 4 * s)} ${f(y - 4 * s)}V${f(y)}`, dark(c, 0.2), 1, ' opacity="0.7"');
  const door = lit ? '#ffd27a' : dark(c, 0.45);
  o += pth(`M${f(x + 6 * s)} ${f(y)}V${f(y - 4 * s)}A${f(3 * s)} ${f(3 * s)} 0 0 1 ${f(x + 12 * s)} ${f(y - 4 * s)}V${f(y)}Z`, door, OL(dark(c, 0.3), 1.2));
  if (lit) o += circ(x + 9 * s, y - 3 * s, 9 * s, '#ffd27a', ' opacity="0.18"');
  return o;
}
function seal(x, y, s, P, flip) { // tiny distant seal silhouette lying on the ice
  const c = dark(P.hillSh, 0.35), k = flip ? -1 : 1;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k * s} ${s})">${pth('M-9 0Q-10 -5 -4 -6Q2 -7 6 -9Q10 -10 10 -6Q10 -3 7 -2Q8 0 4 0Z', c)}${pth('M-9 0L-13 -3L-12 1Z', c)}${circ(8.2, -7, 0.7, lite(c, 0.6))}</g>`;
}
function far(z) {
  const P = PAL[z], r = rng(201 + ZONES.indexOf(z) * 31);
  const zi = ZONES.indexOf(z);
  let b = '';
  // distant snowy ridge (faint, atmospheric)
  const ridge = prof(116, [[10, 1, zi], [7, 3, 1.3 + zi], [4, 7, 0.2 * zi]]);
  b += pth(profPath(ridge, 200), P.hill, ' opacity="0.85"');
  b += pth(profPath(prof(124, [[6, 2, 2.2 + zi], [3, 5, 1]]), 200), P.hillSh, ' opacity="0.45"');
  // icebergs (wrap)
  const bergs = [[90, 136, 70, 40], [300, 138, 46, 26], [470, 140, 90, 24], [640, 137, 58, 44], [860, 139, 80, 30], [955, 140, 40, 22]];
  for (const [x, base, w, h] of bergs) { const st = r(); b += wrap(x, w / 2 + 3, X => { const rr = rng(Math.floor(st * 1e6)); return iceberg(X, base, w, h, P, rr, x > 500); }); }
  // near snow plain (horizon line ≈ 140, fills down; hidden behind the ice slab from y 150)
  const plain = prof(141, [[1.5, 2, 0.5], [1, 5, 1.1]]);
  b += pth(profPath(plain, 200), lite(P.hill, 0.25));
  b += stk(profLine(plain), '#ffffff', 1.5, ' opacity="0.6"');
  // little props
  if (z === 'shallows') b += wrap(210, 16, X => igloo(X, 141, 1.1, P, false));
  if (z === 'kelp') b += wrap(735, 30, X => seal(X, 141, 1.1, P, false) + seal(X + 20, 141.5, 0.7, P, true) + seal(X + 32, 141, 0.9, P, true));
  if (z === 'twilight') b += wrap(210, 16, X => igloo(X, 141, 1.1, P, true));
  if (z === 'aurora') b += wrap(210, 22, X => igloo(X, 141, 1.1, P, true)) + wrap(735, 30, X => seal(X, 141, 1, P, false) + seal(X + 18, 141.5, 0.65, P, true));
  return svg(W, 200, b);
}

// =====================================================================================
// ICE 960x80 (transparent above y4, tileable). Snow top ≈ y10, slab to ≈ y50, icicles to ≈ y65.
// =====================================================================================
function ice(z) {
  const P = PAL[z], zi = ZONES.indexOf(z), r = rng(301 + zi * 13);
  let defs = lin('ib', [['0', P.iceT], ['1', P.iceB]]) + lin('sn', [['0', P.snow], ['1', P.snowSh]]);
  let b = '';
  // ice slab with a gently wavy underside
  const top = prof(16, [[0.8, 3, zi]]), under = prof(49, [[1.6, 2, 1 + zi], [1.1, 5, 2], [0.6, 11, 0.3]]);
  let d = `M0 ${f(top(0))}`; for (let x = 0; x <= W; x += 8) d += `L${x} ${f(top(x))}`; for (let x = W; x >= 0; x -= 8) d += `L${x} ${f(under(x))}`; d += 'Z';
  b += pth(d, 'url(#ib)');
  b += stk(profLine(under, 8), dark(P.iceB, 0.3), 3);
  // icicles (rounded), skipping the hole area x 430..530 (render cuts 448..512 anyway)
  const icis = [];
  for (let x = 14; x < W; x += 26 + r() * 34) { if (x > 426 && x < 534) continue; icis.push([x, 7 + r() * 10, 4 + r() * 2.6]); }
  for (const [x, len, w] of icis) b += wrap(x, w + 3, X => {
    const y0 = under(x) - 3, y1 = Math.min(65, y0 + 3 + len);
    return pth(`M${f(X - w)} ${f(y0)}Q${f(X - w * 0.6)} ${f(y1 - 2)} ${f(X)} ${f(y1)}Q${f(X + w * 0.6)} ${f(y1 - 2)} ${f(X + w)} ${f(y0)}Z`, P.iceB, OL(dark(P.iceB, 0.3), 2)) + stk(`M${f(X - w * 0.35)} ${f(y0 + 2)}L${f(X - w * 0.2)} ${f(y1 - 3)}`, '#ffffff', 1.2, ' opacity="0.6"');
  });
  // cracks and shine streaks inside the slab
  for (let i = 0; i < 9; i++) { const x = 40 + i * 107 + r() * 30, y = 26 + r() * 14; b += wrap(x, 20, X => stk(`M${f(X)} ${f(y)}l${f(6 + r() * 5)} ${f(-4 - r() * 3)}l${f(5 + r() * 4)} ${f(3 + r() * 3)}l${f(6)} ${f(-2)}`, P.crack, 1.4, ' opacity="0.55"')); }
  for (let i = 0; i < 7; i++) { const x = 70 + i * 137 + r() * 20; b += wrap(x, 14, X => stk(`M${f(X)} ${f(30)}L${f(X + 10)} ${f(22)}M${f(X + 7)} ${f(33)}L${f(X + 13)} ${f(28)}`, '#ffffff', 2.2, ' opacity="0.5"')); }
  // snow blanket: lumpy top edge (y ≈ 5..11), thick enough to overlap slab top
  const snowTop = prof(9, [[1.6, 4, 0.3 + zi], [1.3, 9, 1.2], [0.7, 17, 2.1]]);
  const snowBot = prof(20, [[1.4, 3, 0.4], [1, 8, 2.4 + zi], [0.6, 15, 0.1]]);
  let sd = `M0 ${f(snowTop(0))}`; for (let x = 0; x <= W; x += 6) sd += `L${x} ${f(Math.max(4.5, snowTop(x)))}`; for (let x = W; x >= 0; x -= 6) sd += `L${x} ${f(snowBot(x))}`; sd += 'Z';
  b += pth(sd, 'url(#sn)', OL(dark(P.snowSh, 0.25), 2.5));
  // snow lumps (soft mounds on top)
  for (let i = 0; i < 11; i++) { const x = 30 + i * 88 + r() * 30, w = 14 + r() * 16; if (x > 430 && x < 530) continue; b += wrap(x, w + 3, X => pth(`M${f(X - w)} ${f(snowTop(x) + 2)}Q${f(X - w * 0.5)} ${f(snowTop(x) - 4.5)} ${f(X)} ${f(snowTop(x) - 4.5)}Q${f(X + w * 0.6)} ${f(snowTop(x) - 4)} ${f(X + w)} ${f(snowTop(x) + 2)}Z`, P.snow, OL(dark(P.snowSh, 0.25), 2.2))); }
  // sparkle highlights on the snow
  b += stk(profLine(x => snowTop(x) + 2, 6), '#ffffff', 1.4, ' opacity="0.8"');
  for (let i = 0; i < 16; i++) { const x = r() * W, y = 12 + r() * 5; b += wrap(x, 3, X => circ(X, y, 0.9 + r() * 0.8, '#ffffff', ' opacity="0.9"')); }
  if (z === 'aurora') b += stk(profLine(x => Math.max(4.5, snowTop(x)) + 0.5, 6), '#8affcf', 1.2, ' opacity="0.5"'); // aurora rim light
  if (z === 'kelp') b += stk(profLine(x => Math.max(4.5, snowTop(x)) + 0.5, 6), '#ffe6b0', 1.2, ' opacity="0.6"');   // warm sun rim
  if (z === 'twilight') b += stk(profLine(x => Math.max(4.5, snowTop(x)) + 0.5, 6), '#ffc4dc', 1.2, ' opacity="0.6"');
  return svg(W, 80, b, defs);
}

// =====================================================================================
// WATER 960x400 (opaque, stretched once). Soft only: gradient, under-ice glow, light rays, soft glows.
// =====================================================================================
function water(z) {
  const P = PAL[z], [t, bt] = P.water, zi = ZONES.indexOf(z);
  let defs = lin('wg', [['0', lite(t, 0.12)], ['0.06', t], ['0.55', mix(t, bt, 0.62)], ['1', bt]]);
  let b = rect(0, 0, W, 400, 'url(#wg)');
  // under-ice brightness band (light coming through the ice)
  defs += lin('ui', [['0', '#ffffff', z === 'aurora' ? 0.08 : 0.22], ['1', '#ffffff', 0]]);
  b += rect(0, 0, W, 60, 'url(#ui)');
  if (P.rays) {
    defs += lin('ry', [['0', '#ffffff', P.rays], ['0.7', '#ffffff', P.rays * 0.25], ['1', '#ffffff', 0]]);
    const rays = z === 'shallows' ? [[60, 70, 120], [250, 40, 90], [430, 100, 110], [640, 50, 130], [820, 80, 100]] : [[120, 60, 140], [360, 40, 110], [700, 70, 130], [880, 45, 90]];
    for (const [x, w, sl] of rays) b += pth(`M${x} 0L${x + w} 0L${x + w + sl * 1.25} ${z === 'kelp' ? 300 : 340}L${x + sl * 0.95} ${z === 'kelp' ? 300 : 340}Z`, 'url(#ry)');
    if (z === 'kelp') { defs += rad('kg', [['0', '#d8ffb0', 0.12], ['1', '#d8ffb0', 0]]); b += ell(480, 40, 520, 120, 'url(#kg)'); }
  }
  if (z === 'twilight') {
    defs += rad('tg', [['0', '#9fd8ff', 0.16], ['1', '#9fd8ff', 0]]);
    b += ell(480, 0, 560, 140, 'url(#tg)');
    defs += rad('td', [['0', '#5ab0e0', 0.1], ['1', '#5ab0e0', 0]]);
    b += ell(160, 260, 220, 120, 'url(#td)') + ell(800, 220, 200, 110, 'url(#td)');
  }
  if (z === 'aurora') {
    defs += rad('ag', [['0', '#5dffb4', 0.13], ['1', '#5dffb4', 0]]);
    b += ell(480, -10, 600, 130, 'url(#ag)');
    defs += rad('ad', [['0', '#3ad0e0', 0.09], ['1', '#3ad0e0', 0]]);
    b += ell(130, 300, 220, 130, 'url(#ad)') + ell(840, 250, 220, 120, 'url(#ad)');
  }
  // gentle floor fade (slightly darker at the very bottom)
  defs += lin('fd', [['0', bt, 0], ['1', dark(bt, 0.25), 0.6]]);
  b += rect(0, 320, W, 80, 'url(#fd)');
  return svg(W, 400, b, defs);
}

// =====================================================================================
// REEF 960x320 (transparent, tileable). Seabed top ≈ y286. Centre x 340–620 ≤ 60 px tall (y ≥ 260).
// =====================================================================================
const CALM0 = 330, CALM1 = 630; // a little margin around 340–620
function rock(x, base, w, h, c, r) {
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI; const k = 0.85 + r() * 0.25; pts.push([x + Math.cos(a) * w / 2 * k, base + Math.sin(a) * h * k]); }
  pts.push([x + w / 2, base + 6], [x - w / 2, base + 6]);
  const d = blob(pts);
  return pth(d, c, OL(dark(c, 0.35), 3)) + ell(x - w * 0.15, base - h * 0.62, w * 0.18, h * 0.12, lite(c, 0.3), ' opacity="0.8"') + pth(`M${f(x + w * 0.1)} ${f(base - h * 0.1)}Q${f(x + w * 0.35)} ${f(base - h * 0.45)} ${f(x + w * 0.42)} ${f(base - 2)}Z`, dark(c, 0.18), ' opacity="0.6"');
}
function seaStar(x, y, s, c, rot) {
  return pth(star5(x, y, 11 * s, 5 * s, rot), c, OL(dark(c, 0.35), 2.2)) + circ(x, y, 2 * s, lite(c, 0.4)) + [0, 1, 2, 3, 4].map(i => { const a = (rot + i * 72) * Math.PI / 180; return circ(x + Math.cos(a) * 6.5 * s, y + Math.sin(a) * 6.5 * s, 0.9 * s, lite(c, 0.5)); }).join('');
}
function anemone(x, base, s, c, tip, n = 7) {
  let o = '';
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32; const L = 20 * s * (0.8 + 0.2 * Math.cos(i)); const ex = x + Math.cos(a) * L, ey = base - 10 * s + Math.sin(a) * L; const td = `M${f(x + (i - (n - 1) / 2) * 1.8 * s)} ${f(base - 9 * s)}Q${f(x + Math.cos(a) * L * 0.4 + 3 * s)} ${f(base - 10 * s - L * 0.55)} ${f(ex)} ${f(ey)}`; o += stk(td, dark(c, 0.35), 6.4 * s) + stk(td, c, 4.2 * s) + circ(ex, ey, 2.4 * s, tip); }
  o = `<g>${o}</g>`;
  o += pth(`M${f(x - 8 * s)} ${f(base)}Q${f(x - 9 * s)} ${f(base - 12 * s)} ${f(x)} ${f(base - 12 * s)}Q${f(x + 9 * s)} ${f(base - 12 * s)} ${f(x + 8 * s)} ${f(base)}Z`, dark(c, 0.15), OL(dark(c, 0.4), 2.2));
  return o;
}
function seaGrass(x, base, h, c, n, r) {
  let o = '';
  for (let i = 0; i < n; i++) { const dx = (i - (n - 1) / 2) * 4, lean = (r() - 0.5) * 14, hh = h * (0.6 + r() * 0.4); o += stk(`M${f(x + dx)} ${f(base)}Q${f(x + dx + lean * 0.3)} ${f(base - hh * 0.6)} ${f(x + dx + lean)} ${f(base - hh)}`, c, 3.2); }
  return o;
}
function shell(x, y, s, c) {
  return pth(`M${f(x - 7 * s)} ${f(y)}Q${f(x - 7 * s)} ${f(y - 9 * s)} ${f(x)} ${f(y - 9 * s)}Q${f(x + 7 * s)} ${f(y - 9 * s)} ${f(x + 7 * s)} ${f(y)}Z`, c, OL(dark(c, 0.35), 1.8)) + stk(`M${f(x)} ${f(y)}V${f(y - 8 * s)}M${f(x - 3.5 * s)} ${f(y)}L${f(x - 2 * s)} ${f(y - 7.5 * s)}M${f(x + 3.5 * s)} ${f(y)}L${f(x + 2 * s)} ${f(y - 7.5 * s)}`, dark(c, 0.25), 1);
}
function kelpPlant(x, base, h, P, r) {
  const stem = '#5f8f3e', blade = '#86b84e', bladeSh = '#5d8f3a';
  const ph = r() * 6, amp = 8 + r() * 6;
  const pts = []; for (let y = 0; y <= h; y += 8) pts.push([x + Math.sin(y / 38 + ph) * amp * (y / h), base - y]);
  let o = stk('M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L'), dark(stem, 0.3), 7) + stk('M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L'), stem, 4);
  let side = r() < 0.5 ? 1 : -1;
  for (let i = 2; i < pts.length; i += 2) {
    const [px, py] = pts[i]; side = -side; const L = 22 + r() * 10, ang = side * (40 + r() * 20);
    const g = `<g transform="translate(${f(px)} ${f(py)}) rotate(${f(ang - 90)})">${pth(`M0 0Q${f(L * 0.45)} ${-6} ${f(L)} 0Q${f(L * 0.45)} ${6} 0 0Z`, side > 0 ? blade : bladeSh, OL(dark(blade, 0.4), 1.8))}${stk(`M2 0L${f(L * 0.8)} 0`, lite(blade, 0.3), 1, ' opacity="0.7"')}</g>`;
    o += g + circ(px, py, 3, '#b4c25a', OL(dark('#b4c25a', 0.4), 1.4)); // little float bulb
  }
  const [tx, ty] = pts[pts.length - 1];
  o += `<g transform="translate(${f(tx)} ${f(ty)}) rotate(${f(-80 + r() * 20)})">${pth('M0 0Q14 -7 30 0Q14 7 0 0Z', blade, OL(dark(blade, 0.4), 1.8))}</g>`;
  return o;
}
function tubeSponge(x, base, h, c, glow) {
  let o = '';
  for (const [dx, k] of [[-7, 0.75], [0, 1], [7, 0.6]]) {
    const hh = h * k;
    o += pth(`M${f(x + dx - 4)} ${f(base)}L${f(x + dx - 3.5)} ${f(base - hh)}Q${f(x + dx)} ${f(base - hh - 3)} ${f(x + dx + 3.5)} ${f(base - hh)}L${f(x + dx + 4)} ${f(base)}Z`, c, OL(dark(c, 0.35), 2));
    o += ell(x + dx, base - hh, 3.2, 1.6, glow) + circ(x + dx, base - hh, 6, glow, ' opacity="0.22"');
  }
  return o;
}
function seaPen(x, base, h, c, glow) { // feather-like glowing sea pen
  let o = stk(`M${f(x)} ${f(base)}L${f(x)} ${f(base - h)}`, dark(c, 0.3), 3);
  for (let y = 10; y < h; y += 6) { const w = 7 * Math.sin(Math.PI * y / h) + 2; o += stk(`M${f(x)} ${f(base - y)}Q${f(x - w)} ${f(base - y - 3)} ${f(x - w - 1)} ${f(base - y - 7)}M${f(x)} ${f(base - y)}Q${f(x + w)} ${f(base - y - 3)} ${f(x + w + 1)} ${f(base - y - 7)}`, c, 2); }
  o += circ(x, base - h, 3, glow) + circ(x, base - h, 9, glow, ' opacity="0.2"');
  return o;
}
function reef(z) {
  const P = PAL[z], zi = ZONES.indexOf(z), r = rng(401 + zi * 53);
  let defs = lin('sd', [['0', P.sand], ['1', P.sandSh]]);
  let back = '', mid = '', front = '';
  const bed = prof(286, [[2.2, 2, zi], [1.4, 5, 1.7], [0.6, 13, 0.4]]);
  const isCalm = x => { const m = ((x % W) + W) % W; return m > CALM0 && m < CALM1; };
  // tall props (only outside the calm column)
  if (z === 'kelp') {
    for (const [x, h] of [[30, 250], [78, 190], [140, 266], [205, 150], [258, 170], [290, 120], [678, 130], [708, 182], [758, 160], [822, 268], [880, 200], [935, 240]]) { const st = r(); back += wrap(x, 40, X => kelpPlant(X, bed(x) + 4, h, P, rng(Math.floor(st * 1e6)))); }
  }
  // rocks
  const rocks = { shallows: [[60, 70, 44], [250, 54, 30], [700, 66, 40], [905, 90, 52]], kelp: [[105, 80, 40], [280, 48, 24], [690, 60, 30], [960 - 10, 70, 36]], twilight: [[90, 96, 58], [270, 60, 34], [720, 70, 46], [900, 80, 40]], aurora: [[60, 84, 50], [255, 56, 30], [705, 74, 52], [890, 96, 62]] }[z];
  for (const [x, w, h] of rocks) { const st = r(), c = r() < 0.5 ? P.rock : mix(P.rock, P.rockSh, 0.5); mid += wrap(x, w / 2 + 4, X => rock(X, bed(x) + 2, w, h, c, rng(Math.floor(st * 1e6)))); }
  // zone props (edge areas)
  if (z === 'shallows') {
    mid += anemone(150, bed(150) + 2, 1.1, '#7fd8c4', '#e6fff6') + anemone(800, bed(800) + 2, 1.25, '#8fe0d6', '#ffffff') + anemone(300, bed(300) + 2, 0.8, '#a6e6c8', '#f2fff8');
    front += seaStar(225, bed(225) - 4, 1, '#f3b9a4', -80) + seaStar(860, bed(860) - 3, 0.85, '#f6c9b5', -100) + seaStar(660, bed(660) - 2, 0.7, '#f3b9a4', -60);
    front += seaGrass(30, bed(30) + 3, 34, '#7cc58e', 5, r) + seaGrass(760, bed(760) + 3, 40, '#6fb98a', 6, r);
  } else if (z === 'kelp') {
    mid += anemone(250, bed(250) + 2, 0.9, '#9bd7a8', '#f0fff2') + anemone(720, bed(720) + 2, 1, '#86cfb5', '#effff8');
    front += seaGrass(320, bed(320) + 3, 26, '#79b86a', 4, r) + seaGrass(650, bed(650) + 3, 28, '#6faa62', 4, r) + seaGrass(180, bed(180) + 3, 44, '#79b86a', 6, r);
    front += seaStar(860, bed(860) - 3, 0.8, '#efc8ae', -90);
  } else if (z === 'twilight') {
    mid += tubeSponge(170, bed(170) + 3, 54, '#3f7a96', '#a6f3ff') + tubeSponge(800, bed(800) + 3, 64, '#3b6f92', '#9ff0ff') + tubeSponge(305, bed(305) + 3, 34, '#3d7491', '#b8f6ff') + tubeSponge(690, bed(690) + 3, 48, '#3b6f92', '#a6f3ff');
    mid += anemone(660, bed(660) + 2, 0.9, '#5fb1c2', '#d6fbff') + anemone(30, bed(30) + 2, 1.1, '#5aa7bf', '#e4fdff');
    front += seaGrass(860, bed(860) + 3, 36, '#4f8a9a', 5, r);
  } else {
    mid += seaPen(160, bed(160) + 3, 70, '#5fd6b0', '#b6ffe2') + seaPen(185, bed(185) + 3, 50, '#58c9b8', '#b6fff4') + seaPen(800, bed(800) + 3, 80, '#5fd6b0', '#b6ffe2') + seaPen(830, bed(830) + 3, 56, '#62c8d8', '#c0f6ff')
      + seaPen(268, bed(268) + 3, 62, '#5fd6b0', '#b6ffe2') + seaPen(690, bed(690) + 3, 74, '#58c9b8', '#b6fff4') + seaPen(712, bed(712) + 3, 48, '#62c8d8', '#c0f6ff');
    mid += anemone(310, bed(310) + 2, 0.85, '#3fa0b0', '#a8fff2') + anemone(655, bed(655) + 2, 0.85, '#3a95b3', '#b0f4ff');
    for (const [x, y] of [[40, 270], [120, 262], [235, 274], [705, 268], [745, 256], [880, 270], [935, 248]]) back += wrap(x, 10, X => circ(X, y, 7, '#7affd4', ' opacity="0.18"') + circ(X, y, 2.2, '#c8fff0'));
  }
  // calm centre: only pebbles, shells and very short sea grass
  for (let i = 0; i < 4; i++) { const x = CALM0 + 30 + i * 70 + r() * 30; front += shell(x, bed(x) + 1, 0.8 + r() * 0.3, lite(P.sand, 0.35)); }
  const grassCol = { shallows: '#8ccf9a', kelp: '#86c06e', twilight: '#5d98a6', aurora: '#4fae9e' }[z];
  for (const x of [372, 455, 548, 600]) front += seaGrass(x, bed(x) + 3, 16 + r() * 8, grassCol, 3, r);
  // seabed
  let sand = pth(profPath(bed, 320, 6), 'url(#sd)') + stk(profLine(bed, 6), dark(P.sand, 0.3), 3);
  sand += stk(profLine(x => bed(x) + 3, 6), lite(P.sand, 0.35), 1.6, ' opacity="0.7"');
  for (let i = 0; i < 70; i++) { const x = r() * W, y = bed(x) + 8 + r() * 24, s = 1.4 + r() * 3.2, c = r() < 0.5 ? P.sandSh : mix(P.rock, P.sand, 0.4); sand += wrap(x, s + 2, X => ell(X, y, s * 1.3, s, c, ' opacity="0.85"')); }
  for (let i = 0; i < 14; i++) { const x = r() * W, y = bed(x) + 14 + r() * 16; sand += wrap(x, 14, X => stk(`M${f(X - 9)} ${f(y)}Q${f(X)} ${f(y - 3)} ${f(X + 9)} ${f(y)}`, dark(P.sand, 0.15), 1.4, ' opacity="0.6"')); }
  return svg(W, 320, back + mid + sand + front, defs);
}

// =====================================================================================
// HOLE RIM 96x80 (shared). Gap x 16..80; svg y10 = SURFACE_Y; ice slab bottom ≈ y50.
// =====================================================================================
function holeRim() {
  // Each side: the ice cut seen edge-on (a narrow face from the snow down to the slab bottom, a bit darker than the
  // slab so the hole reads as a cut) + a rounded snow lip that continues the snow blanket and curls over the edge.
  // The outer (x 0..10) part fades out through a mask so it blends into whatever zone-coloured ice is underneath.
  // Neutral white snow (shared by all zones; the zone tint overlay takes care of the rest).
  const snow = '#f6fafe', snowSh = '#d3e4f2', face = '#a6d6ea', faceD = '#4f97bd', ol = '#4d7f9e';
  const defs = lin('hf', [['0', face], ['0.7', mix(face, faceD, 0.6)], ['1', faceD]]) + lin('hs', [['0', snow], ['1', snowSh]])
    + lin('fade', [['0', '#ffffff', 0], ['1', '#ffffff', 1]], 0, 0, 1, 0, ' gradientUnits="userSpaceOnUse" x1="0" x2="11"').replace(/ x1="0" y1="0" x2="1" y2="0"/, ' y1="0" y2="0"')
    + '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="80">' + rect(0, 0, 96, 80, 'url(#fade)') + '</mask>';
  const side = mirror => `<g${mirror ? ' transform="translate(96 0) scale(-1 1)"' : ''}>`
    + `<g mask="url(#m)">`
    + pth('M0 17L17.5 17Q19.5 27 18.6 38Q18 46 19 51Q15 53.5 9 52.5L0 52Z', 'url(#hf)')            // cut face (to slab bottom ≈ y51)
    + rect(0, 17, 18, 4, '#2f6c93', ' opacity="0.3"')                                                // shadow under the lip
    + pth('M0 6.5Q8 5 14 6Q20.5 7 21.5 12.5Q22 18 16 19.5Q8 20.5 0 20Z', 'url(#hs)')                 // snow lip
    + '</g>'
    + stk('M17.5 19Q19.5 28 18.6 38Q18 46 19 51Q15 53.5 10 52.5', ol, 2.2)                          // outline: hole side only
    + stk('M12 5.7Q15 5.9 17 6.6Q21 8 21.6 12.5Q22 18 16 19.5Q13 20 11 20', '#9db8cf', 2.2)           // lip outline (top + end)
    + stk('M16.4 23Q17.4 30 16.6 40', '#e8fbff', 1.6, ' opacity="0.75"')                            // edge shine
    + stk('M11 31L13.5 28.5M10.5 42L13 39.5', '#ffffff', 1.2, ' opacity="0.45"')                     // tiny cracks
    + pth('M15 52Q16 58.5 14.5 61Q13 58.5 12.5 52.5Z', faceD, OL(ol, 1.4))                           // little icicle at the cut
    + ell(11, 8.6, 4.5, 1.4, '#ffffff', ' opacity="0.95"') + circ(18, 10, 0.9, '#ffffff')
    + '</g>';
  return svg(96, 80, side(false) + side(true), defs);
}

// =====================================================================================
// PARTICLES 32x32
// =====================================================================================
const particles = {
  snowflake: () => {
    let o = '';
    for (let i = 0; i < 6; i++) { const a = i * 60; o += `<g transform="rotate(${a} 16 16)">${stk('M16 16V4', '#ffffff', 2.4)}${stk('M16 8L12.5 5.5M16 8L19.5 5.5M16 12L13.5 10M16 12L18.5 10', '#ffffff', 1.6)}</g>`; }
    return svg(32, 32, `<g stroke-opacity="1">${o.replace(/#ffffff/g, '#b9dcf2').replace(/stroke-width="2.4"/g, 'stroke-width="4"').replace(/stroke-width="1.6"/g, 'stroke-width="3"')}${o}</g>` + circ(16, 16, 2.6, '#ffffff', OL('#b9dcf2', 1)));
  },
  bubble_s: () => svg(32, 32, circ(16, 16, 11, '#d8f6ff', ' fill-opacity="0.18"' + OL('#d6f7ff', 2)) + pth('M9.5 13A7.5 7.5 0 0 1 15 8.5', 'none', OL('#ffffff', 2.4)) + circ(20.5, 20.5, 1.4, '#ffffff', ' opacity="0.7"')),
  kelp_bit: () => svg(32, 32, `<g transform="rotate(-30 16 16)">${pth('M4 16Q14 6 28 16Q14 26 4 16Z', '#86b84e', OL('#4d7a2e', 2))}${stk('M7 16L24 16', '#b8dc8a', 1.4)}${circ(5, 16, 2.4, '#b4c25a', OL('#6f7a2a', 1.2))}</g>`),
  jelly: () => {
    const defs = rad('jg', [['0', '#ffd6f4', 0.55], ['1', '#f3a8e6', 0]]);
    const tent = [9, 13, 17, 21].map((x, i) => stk(`M${x + 1} 17Q${x - 1} 21 ${x + 1} 24Q${x + 3} 27 ${x + 1} 30`, i % 2 ? '#e7b6f0' : '#f6c3e2', 1.6)).join('');
    return svg(32, 32, circ(16, 15, 15, 'url(#jg)') + tent + pth('M6 17Q6 5 16 5Q26 5 26 17Q21 15.5 16 17Q11 15.5 6 17Z', '#f6c6ec', OL('#b67fc4', 1.8)) + ell(12.5, 10, 3, 2, '#ffffff', ' opacity="0.8"') + circ(13, 13.5, 0.9, '#7a4a8a') + circ(19, 13.5, 0.9, '#7a4a8a') + stk('M14.6 15Q16 16.2 17.4 15', '#7a4a8a', 0.9), defs);
  },
  sparkle: () => svg(32, 32, pth(twinkle(16, 16, 14, 0.2), '#fffbe0', OL('#ffd86b', 1.4)) + circ(16, 16, 3, '#ffffff')),
  drop: () => svg(32, 32, pth('M16 3Q24 14 24 20A8 8 0 0 1 8 20Q8 14 16 3Z', '#bfe9fb', OL('#5aa8d0', 2)) + ell(12.8, 19, 1.8, 3.2, '#ffffff', ' opacity="0.85"')),
  star: () => svg(32, 32, pth(star5(16, 17, 14, 6.4), '#ffe36e', OL('#d39a1e', 2)) + pth(star5(16, 17, 7, 3.2), '#fff6bf') + circ(12.5, 12.5, 1.6, '#ffffff')),
};
particles.plankton = () => svg(32, 32, circ(16, 16, 15, 'url(#g)'), rad('g', [['0', '#ffffff', 1], ['0.2', '#bff9ff', 0.95], ['0.5', '#5fe3f5', 0.45], ['1', '#5fe3f5', 0]]));
particles.puff = () => svg(32, 32, ell(16, 22, 12, 6, '#b8cde2', ' opacity="0.35"') + circ(11, 19, 8, 'url(#pg)') + circ(21, 19, 8.5, 'url(#pg)') + circ(16, 12.5, 9, 'url(#pg)'), rad('pg', [['0', '#ffffff', 0.95], ['0.6', '#f2f8ff', 0.8], ['1', '#e6f2ff', 0]]));

// =====================================================================================
for (const z of ZONES) {
  write(`levels/${z}/sky.svg`, sky(z));
  write(`levels/${z}/far.svg`, far(z));
  write(`levels/${z}/ice.svg`, ice(z));
  write(`levels/${z}/water.svg`, water(z));
  write(`levels/${z}/reef.svg`, reef(z));
}
write('hole_rim.svg', holeRim());
for (const [k, fn] of Object.entries(particles)) write(`particles/${k}.svg`, fn());
// sanity: forbidden content
for (const dir of [OUT]) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const p of walk(dir).filter(p => p.endsWith('.svg') && (p.includes('/levels/') || p.includes('/particles/') || p.endsWith('hole_rim.svg')))) {
    const s = fs.readFileSync(p, 'utf8');
    if (/<text|<script|<image|href=|@import|font-family/i.test(s)) throw new Error('forbidden content in ' + p);
  }
}
console.log('environment art written to', OUT);
