// Puff's Volcano Catch: environment art generator (4 island zones + particles).
// Writes original, hand-authored, procedurally-laid-out SVGs (seeded, deterministic).
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3. Same helper approach as
// projects/daily-game/penguin-candy-dash/tools/art-environment/gen.js, but for a static SIDE view:
// opaque sky, tileable cloud strip, one shared volcano cone (crater mouth (480,210), ~90 px wide),
// ground strip with top edge ~y 492. The play band y 280–480 is kept calm and mid-toned so a WHITE
// cloud (Puff), gold/silver/copper coins and dark plum rocks with orange glow all read at a glance.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const W = 960, H = 540;
const CX = 480, CY = 210, CRX = 46, CRY = 12; // crater mouth (DESIGN §2)
const GROUND = 492;
let PREC = 10;
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function svg(body, defs = '', w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rad = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
function smooth(pts, closed = true) {
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const n = pts.length;
  if (closed) {
    let s = m(pts[n - 1], pts[0]); let d = `M${f(s[0])} ${f(s[1])}`;
    for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); d += `Q${f(p[0])} ${f(p[1])} ${f(q[0])} ${f(q[1])}`; }
    return d + 'Z';
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < n - 1; i++) { const q = m(pts[i], pts[i + 1]); d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(q[0])} ${f(q[1])}`; }
  return d + `L${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`;
}
function blob(cx, cy, rx, ry, seed, n = 12, jit = 0.08) {
  const r = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n, k = 1 + (r() - 0.5) * 2 * jit; pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]); }
  return smooth(pts);
}
// open ridge line y = fn(x) sampled, closed down to yBottom (a filled silhouette band)
function ridge(fn, yBottom = H, x0 = -10, x1 = W + 10, step = 16) {
  const pts = []; for (let x = x0; x <= x1 + 0.1; x += step) pts.push([x, fn(x)]);
  return smooth(pts, false) + `L${f(x1)} ${yBottom}L${f(x0)} ${yBottom}Z`;
}
const wave = (seed, amps) => { const r = rng(seed); const ph = amps.map(() => r() * 6.283); return x => amps.reduce((s, [a, wl], i) => s + a * Math.sin(x / wl * 6.283 + ph[i]), 0); };
const starShape = (x, y, R, r0 = 0.42, n = 5, rot = -90) => { let d = ''; for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? R * r0 : R, a = (rot + i * 180 / n) * Math.PI / 180; d += (i ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(y + Math.sin(a) * rr); } return d + 'Z'; };
const twinkle = (x, y, R, k = 0.16) => `M${f(x)} ${f(y - R)}Q${f(x + R * k)} ${f(y - R * k)} ${f(x + R)} ${f(y)}Q${f(x + R * k)} ${f(y + R * k)} ${f(x)} ${f(y + R)}Q${f(x - R * k)} ${f(y + R * k)} ${f(x - R)} ${f(y)}Q${f(x - R * k)} ${f(y - R * k)} ${f(x)} ${f(y - R)}Z`;

// =====================================================================================
// PALETTES
// =====================================================================================
const PAL = {
  beach: {
    sky: ['#5fb6ec', '#8fd0f2', '#c7ecf4'], sun: '#fff3c4', far: '#7cc4c4', farD: '#5ea9ae',
    sea: ['#5fd0d2', '#3db7c4', '#2a9fb6'], seaHi: '#9ae7e2',
    cloud: '#ffffff', cloudSh: '#bfe0f2', cloudA: 0.42,
    vol: { top: '#b98e66', mid: '#9c7a58', grass: '#6fb15a', grassD: '#4f9246', out: '#5e4632', shade: '#6e5440', hi: '#d8b88e' },
    lava: ['#ffe39a', '#ffad5a', '#ff7f5c'],
    ground: { top: '#f1d6a2', bot: '#e3bc82', out: '#c4975e', wet: '#d9b47e', foam: '#e9fbf7' },
  },
  jungle: {
    sky: ['#4fb4ea', '#86d4f0', '#c9f1e6'], sun: '#fff8d8', far: '#8ccdb7', farD: '#6fb8a8',
    canopy: ['#5fae92', '#4a9a80', '#3d8670'],
    cloud: '#ffffff', cloudSh: '#c2e6e6', cloudA: 0.45,
    vol: { top: '#8fbd5a', mid: '#6caf4e', grass: '#58a046', grassD: '#3f8a3e', out: '#2f6234', shade: '#468c3e', hi: '#b6dc7a' },
    lava: ['#ffe39a', '#ffad5a', '#ff7f5c'],
    ground: { top: '#5a9a44', bot: '#3f7a3a', out: '#2c5a2e', soil: '#7a5a3c', fern: '#4f9a4a', fernD: '#2f6e36' },
  },
  ash: {
    sky: ['#6a5ca4', '#a874ac', '#e88a92', '#f6a787'], sun: '#ffd0a8', far: '#b49ab8', farD: '#a08cb0',
    dune: ['#a99dc2', '#9b8eb6', '#8f82aa'],
    cloud: '#ffd2c4', cloudSh: '#b88ab0', cloudA: 0.5,
    vol: { top: '#6f6080', mid: '#857492', grass: '#93819c', grassD: '#7a6888', out: '#4a3c5c', shade: '#665676', hi: '#f0b8a8' },
    lava: ['#ffe0a8', '#ffa070', '#ff7a6a'],
    ground: { top: '#8f7fa2', bot: '#77688c', out: '#56486c', rip: '#a597b6' },
  },
  crater: {
    sky: ['#0e1434', '#1c2758', '#2f3f7c'], moon: '#fff4cc', far: '#26356c', farD: '#1f2c5e',
    sea: ['#253568', '#1e2c5c', '#1a2652'], seaHi: '#6e86c8',
    cloud: '#56659e', cloudSh: '#2c3a72', cloudA: 0.55,
    vol: { top: '#4e5590', mid: '#5c64a2', grass: '#5a61a0', grassD: '#474e88', out: '#2a2e5e', shade: '#454c86', hi: '#8a92cc' },
    lava: ['#fff0a8', '#ffb060', '#ff6f7a'],
    ground: { top: '#3a3f74', bot: '#2a2e5c', out: '#1c1f44', glow: '#ff9a6a' },
  },
};

// =====================================================================================
// SKY (opaque 960x540)
// =====================================================================================
function skyBeach() {
  const c = PAL.beach; const r = rng(11);
  let defs = lin('s', [[0, c.sky[0]], [0.4, c.sky[1]], [0.56, c.sky[2]]]) + lin('sea', [[0, c.sea[0]], [0.45, c.sea[1]], [1, c.sea[2]]]) +
    rad('sun', [[0, '#fffbe6', 1], [0.35, c.sun, 0.9], [1, c.sun, 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  o += circ(150, 140, 120, 'url(#sun)') + circ(150, 140, 36, '#fff8d8') + circ(150, 140, 30, '#fffdf0');
  // far islands on the horizon
  o += pth(`M-10 300C40 262 90 258 150 280C190 268 220 276 250 300Z`, c.far) + pth(`M60 300C90 284 120 282 150 290C170 286 190 290 210 300Z`, c.farD);
  o += pth(`M700 300C740 284 780 270 830 276C880 262 930 270 970 290V300Z`, c.far) + pth(`M800 300C830 292 870 288 900 294C930 290 950 294 970 300Z`, c.farD);
  // sea
  o += `<rect y="298" width="${W}" height="${H - 298}" fill="url(#sea)"/>`;
  o += `<rect y="298" width="${W}" height="3" fill="${c.seaHi}" opacity="0.8"/>`;
  // soft horizontal glints (low contrast)
  let g = '';
  for (let i = 0; i < 46; i++) { const y = 306 + Math.pow(r(), 1.3) * 180, x = r() * W, L = 14 + r() * 40 * (y - 290) / 120; g += `M${f(x)} ${f(y)}h${f(L)}`; }
  o += strokeP(g, c.seaHi, 2, ' opacity="0.45"');
  // sun reflection path
  let s = ''; for (let i = 0; i < 7; i++) { const y = 308 + i * 12 + r() * 4, w = 16 + i * 5 + r() * 10; s += `M${f(150 - w / 2 + (r() - 0.5) * 18)} ${f(y)}h${f(w)}`; }
  o += strokeP(s, '#fff6d8', 2, ' opacity="0.4"');
  return svg(o, defs);
}
function skyJungle() {
  const c = PAL.jungle; const r = rng(21);
  let defs = lin('s', [[0, c.sky[0]], [0.42, c.sky[1]], [0.62, c.sky[2]]]) + rad('sun', [[0, '#ffffff', 1], [0.3, c.sun, 0.85], [1, c.sun, 0]]) +
    lin('cn', [[0, c.canopy[0]], [0.5, c.canopy[1]], [1, c.canopy[2]]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  o += circ(800, 120, 110, 'url(#sun)') + circ(800, 120, 30, '#fffdf0');
  // misty far mountains (aerial perspective)
  { const w22 = wave(22, [[26, 420], [12, 170]]); o += pth(ridge(x => 250 + w22(x)), mix(c.far, c.sky[2], 0.45)); }
  o += pth(ridge(x => 290 + wave(23, [[18, 300], [8, 110]])(x)), c.far);
  // rainforest canopy: rows of rounded tree crowns
  const rows = [[322, c.farD, 34, 24], [356, c.canopy[0], 42, 28], [400, c.canopy[1], 50, 30]];
  for (const [y0, col, R, step] of rows) {
    let d = `M-20 ${H}`; let x = -20;
    while (x < W + 40) { const rr = R * (0.7 + r() * 0.5); const yy = y0 + (r() - 0.5) * 14; d += `L${f(x)} ${f(yy)}A${f(rr * 0.6)} ${f(rr * 0.55)} 0 0 1 ${f(x + rr)} ${f(yy)}`; x += rr; }
    d += `L${W + 40} ${H}Z`;
    o += pth(d, col);
    // crown highlights
    let hl = ''; for (let i = 0; i < 18; i++) { const hx = r() * W, hy = y0 + 4 + r() * 10; hl += `M${f(hx - 8)} ${f(hy)}q8 -6 16 0`; }
    o += strokeP(hl, mix(col, '#ffffff', 0.18), 2.4, ' opacity="0.7"');
  }
  o += `<rect y="440" width="${W}" height="100" fill="${c.canopy[2]}"/>`;
  return svg(o, defs);
}
function skyAsh() {
  const c = PAL.ash; const r = rng(31);
  let defs = lin('s', [[0, c.sky[0]], [0.24, c.sky[1]], [0.44, c.sky[2]], [0.56, c.sky[3]]]) + rad('sun', [[0, '#fff0d8', 1], [0.35, c.sun, 0.75], [1, '#ff9a8a', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  // big low sunset sun behind the far dunes (pinkish, not gold)
  o += circ(790, 262, 140, 'url(#sun)') + circ(790, 262, 48, '#ffc9a6') + circ(790, 262, 40, '#ffdcc0');
  // thin sunset streaks
  let st = ''; for (let i = 0; i < 7; i++) { const y = 150 + i * 18 + r() * 8, x = r() * 700; st += `M${f(x)} ${f(y)}h${f(120 + r() * 160)}`; }
  o += strokeP(st, '#ffc4b0', 3, ' opacity="0.35"');
  // ash dunes: far → near, lilac greys
  o += pth(ridge(x => 292 + wave(32, [[14, 380], [6, 130]])(x)), mix(c.far, c.sky[3], 0.25));
  o += pth(ridge(x => 330 + wave(33, [[18, 460], [8, 170]])(x)), c.dune[0]);
  o += pth(ridge(x => 380 + wave(34, [[20, 520], [9, 200]])(x)), c.dune[1]);
  o += pth(ridge(x => 430 + wave(35, [[16, 420], [7, 150]])(x)), c.dune[2]);
  // dune rim highlights (sunlit crests, soft)
  for (const [y0, sd, col] of [[330, 33, c.dune[0]], [380, 34, c.dune[1]]]) {
    const fn = x => y0 + wave(sd, [[y0 === 330 ? 18 : 20, y0 === 330 ? 460 : 520], [y0 === 330 ? 8 : 9, y0 === 330 ? 170 : 200]])(x);
    const pts = []; for (let x = -10; x <= 970; x += 16) pts.push([x, fn(x) + 1.5]);
    o += strokeP(smooth(pts, false), mix(col, '#ffd8c8', 0.35), 3, ' opacity="0.8"');
  }
  return svg(o, defs);
}
function skyCrater() {
  const c = PAL.crater; const r = rng(41);
  let defs = lin('s', [[0, c.sky[0]], [0.35, c.sky[1]], [0.56, c.sky[2]]]) + lin('sea', [[0, c.sea[0]], [1, c.sea[2]]]) +
    rad('moon', [[0, '#fff6d8', 0.7], [0.4, '#c8d0ff', 0.25], [1, '#c8d0ff', 0]]) + rad('hz', [[0, '#ff9a7a', 0.35], [1, '#ff9a7a', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  // stars (y < 270)
  let dots = '';
  for (let i = 0; i < 120; i++) { const x = r() * W, y = Math.pow(r(), 1.2) * 268, R = 0.6 + r() * 1.3; dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" opacity="${f(0.45 + r() * 0.5)}"/>`; }
  o += `<g fill="#f2f0ff">${dots}</g>`;
  let tw = ''; for (const [x, y, R] of [[300, 70, 6], [640, 90, 7], [880, 170, 5], [60, 230, 5], [560, 40, 4], [380, 150, 4], [720, 220, 4]]) tw += twinkle(x, y, R);
  o += pth(tw, '#fff8dc', ' opacity="0.9"');
  // moon
  o += circ(170, 130, 90, 'url(#moon)');
  o += `<path d="M170 96A34 34 0 1 0 204 136A27 27 0 1 1 170 96Z" fill="${c.moon}"/>`;
  o += circ(150, 150, 3.5, '#efe2b0') + circ(160, 120, 2.5, '#efe2b0');
  // warm volcano glow on the horizon
  o += ell(480, 300, 360, 70, 'url(#hz)');
  // far islands + night sea
  o += pth(`M-10 304C40 280 100 276 160 292C200 284 230 290 260 304Z`, c.far) + pth(`M720 304C760 288 820 280 870 286C910 278 940 284 970 296V304Z`, c.far);
  o += `<rect y="302" width="${W}" height="${H - 302}" fill="url(#sea)"/>`;
  o += `<rect y="302" width="${W}" height="2" fill="${c.seaHi}" opacity="0.5"/>`;
  // moon reflection + soft glints
  let s = ''; for (let i = 0; i < 7; i++) { const y = 312 + i * 13 + r() * 4, w = 10 + i * 4 + r() * 8; s += `M${f(170 - w / 2 + (r() - 0.5) * 18)} ${f(y)}h${f(w)}`; }
  o += strokeP(s, '#fff1c0', 1.8, ' opacity="0.3"');
  let g = ''; for (let i = 0; i < 30; i++) { const y = 312 + r() * 170, x = r() * W; g += `M${f(x)} ${f(y)}h${f(12 + r() * 30)}`; }
  o += strokeP(g, c.seaHi, 1.6, ' opacity="0.3"');
  return svg(o, defs);
}

// =====================================================================================
// CLOUDS (960x220, transparent, horizontally tileable: every cloud is also drawn at x±960)
// =====================================================================================
function cloudShape(x, y, w, h, seed) {
  // flat-bottomed wispy cloud: a soft base + 3-5 round puffs; no outline
  const r = rng(seed); let o = ell(x, y, w / 2, h * 0.16);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const px = x - w / 2 + w * (0.1 + t * 0.8), pr = h * (0.24 + r() * 0.2) * (1 - Math.abs(t - 0.5) * 0.9); o += ell(px, y - pr * 0.35, pr * 2.1, pr * 0.8); }
  // wispy streaks trailing off the ends
  o += ell(x - w * 0.42, y + h * 0.05, w * 0.3, h * 0.07) + ell(x + w * 0.38, y - h * 0.02, w * 0.34, h * 0.06);
  return o;
}
function clouds(zone, seed, extra) {
  const c = PAL[zone]; const r = rng(seed); let top = '', sh = '';
  const items = [];
  for (let i = 0; i < 7; i++) {
    const x = i * 137 + r() * 60, y = 40 + r() * 100 * (i % 2 ? 1 : 0.6), w = 120 + r() * 150, h = 34 + r() * 26;
    items.push([x, y, w, h, Math.floor(r() * 9999)]);
  }
  for (const [x, y, w, h, s] of items) for (const dx of [-W, 0, W]) {
    if (x + dx + w < -20 || x + dx - w > W + 20) continue;
    sh += cloudShape(x + dx, y + 4, w, h, s); top += cloudShape(x + dx, y, w * 0.94, h * 0.9, s);
  }
  let o = `<g fill="${c.cloudSh}" opacity="${c.cloudA}">${sh}</g><g fill="${c.cloud}" opacity="${c.cloudA}">${top}</g>`;
  if (extra) o += extra(r);
  return svg(o, '', W, 220);
}
// beach: little seagull-shaped wisps (cloud gulls)
const gullClouds = r => {
  let d = '';
  for (const [x, y, s] of [[220, 150, 1], [262, 136, 0.7], [610, 92, 0.9], [880, 170, 0.75]]) for (const dx of [-W, 0, W]) {
    const X = x + dx; if (X < -40 || X > W + 40) continue;
    d += `M${f(X - 22 * s)} ${f(y)}Q${f(X - 11 * s)} ${f(y - 12 * s)} ${f(X)} ${f(y)}Q${f(X + 11 * s)} ${f(y - 12 * s)} ${f(X + 22 * s)} ${f(y)}`;
  }
  return strokeP(d, '#ffffff', 5, ' opacity="0.7"');
};

// =====================================================================================
// VOLCANO (960x540, transparent). Shared cone silhouette; crater mouth (480,210) rx 46.
// =====================================================================================
const L0 = [434, 212], R0 = [526, 212];
const CONE = `M168 500L170 486C262 476 326 424 358 346C384 284 414 246 ${L0[0]} ${L0[1]}A${CRX} 13 0 0 1 ${R0[0]} ${R0[1]}C546 246 576 284 602 346C634 424 698 476 790 486L792 500Z`;
// x of the left/right flank at height y (approx, for decoration placement)
function flankX(y, side) { const t = (y - 212) / (486 - 212); const half = 46 + (310 - 46) * Math.pow(Math.max(0, t), 1.45); return side < 0 ? 480 - half : 480 + half; }
function palm(x, y, s, lean, c, seed) {
  const r = rng(seed); const top = [x + lean * 30 * s, y - 110 * s];
  let o = ell(x + 6, y + 2, 22 * s, 4 * s, c.out, ' opacity="0.25"');
  const trunk = `M${f(x - 7 * s)} ${f(y)}Q${f(x + lean * 4 * s)} ${f(y - 60 * s)} ${f(top[0] - 4 * s)} ${f(top[1])}L${f(top[0] + 4 * s)} ${f(top[1])}Q${f(x + lean * 14 * s)} ${f(y - 60 * s)} ${f(x + 7 * s)} ${f(y)}Z`;
  o += pth(trunk, '#b5895a', ` stroke="#7a5634" stroke-width="${f(2.6 * s)}" stroke-linejoin="round"`);
  let rings = ''; for (let k = 1; k < 9; k++) { const t = k / 9; const px = x + (top[0] - x) * t * t * 0.8 + lean * 4 * s * t, py = y + (top[1] - y) * t; rings += `M${f(px - 6 * s)} ${f(py)}q${f(6 * s)} ${f(3 * s)} ${f(12 * s)} 0`; }
  o += strokeP(rings, '#8a6440', 1.6 * s, ' opacity="0.7"');
  // fronds
  const angs = [-160, -125, -90, -55, -20, 15, 195];
  for (const a0 of angs) {
    const a = (a0 + (r() - 0.5) * 12) * Math.PI / 180, L = (46 + r() * 14) * s;
    const ex = top[0] + Math.cos(a) * L, ey = top[1] + Math.sin(a) * L * 0.6 + L * 0.35;
    const mx = top[0] + Math.cos(a) * L * 0.55, my = top[1] + Math.sin(a) * L * 0.5 - 8 * s;
    const nx = -Math.sin(a) * 9 * s, ny = Math.cos(a) * 6 * s;
    const d = `M${f(top[0])} ${f(top[1])}Q${f(mx + nx)} ${f(my + ny - 4 * s)} ${f(ex)} ${f(ey)}Q${f(mx - nx)} ${f(my - ny + 4 * s)} ${f(top[0])} ${f(top[1])}Z`;
    o += pth(d, '#5aa850', ` stroke="#2f6a34" stroke-width="${f(2.2 * s)}" stroke-linejoin="round"`);
    o += strokeP(`M${f(top[0])} ${f(top[1])}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`, '#86c86a', 1.4 * s, ' opacity="0.8"');
  }
  o += circ(top[0] - 5 * s, top[1] + 6 * s, 5 * s, '#7a5a3a', ` stroke="#5a3e26" stroke-width="${f(1.4 * s)}"`) + circ(top[0] + 5 * s, top[1] + 7 * s, 5 * s, '#86643f', ` stroke="#5a3e26" stroke-width="${f(1.4 * s)}"`);
  return o;
}
function bush(x, y, s, base, dark, lite, seed) {
  const d = blob(x, y - 12 * s, 26 * s, 16 * s, seed, 11, 0.12);
  return pth(d, base, ` stroke="${dark}" stroke-width="${f(2.4 * s)}"`) + pth(blob(x - 7 * s, y - 18 * s, 12 * s, 6 * s, seed + 1, 9, 0.1), lite, ' opacity="0.7"');
}
function flower(x, y, s, col, seed) {
  let o = ''; const dark = mix(col, '#3a1840', 0.4);
  for (let i = 0; i < 5; i++) { const a = (i * 72 - 90 + seed * 13) * Math.PI / 180; o += ell(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s, 4.4 * s, 3.2 * s, col, ` stroke="${dark}" stroke-width="${f(1.1 * s)}" transform="rotate(${f(a * 180 / Math.PI)} ${f(x + Math.cos(a) * 5 * s)} ${f(y + Math.sin(a) * 5 * s)})"`); }
  return o + circ(x, y, 2.8 * s, '#fff1d0', ` stroke="${dark}" stroke-width="${f(0.9 * s)}"`);
}
function bigLeaf(x, y, s, ang, base, dark, vein) {
  const d = `M0 0C${f(10 * s)} ${f(-22 * s)} ${f(44 * s)} ${f(-30 * s)} ${f(70 * s)} ${f(-8 * s)}C${f(46 * s)} ${f(10 * s)} ${f(14 * s)} ${f(14 * s)} 0 0Z`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})">${pth(d, base, ` stroke="${dark}" stroke-width="${f(2.4 * s)}" stroke-linejoin="round"`)}${strokeP(`M${f(4 * s)} ${f(-1 * s)}Q${f(34 * s)} ${f(-14 * s)} ${f(64 * s)} ${f(-8 * s)}`, vein, 1.8 * s)}${strokeP(`M${f(20 * s)} ${f(-7 * s)}l${f(6 * s)} ${f(-9 * s)}M${f(36 * s)} ${f(-11 * s)}l${f(6 * s)} ${f(-8 * s)}M${f(22 * s)} ${f(-6 * s)}l${f(8 * s)} ${f(7 * s)}M${f(40 * s)} ${f(-10 * s)}l${f(8 * s)} ${f(6 * s)}`, vein, 1.2 * s, ' opacity="0.7"')}</g>`;
}
function volcano(zone) {
  const c = PAL[zone], v = c.vol; const r = rng(zone.length * 97 + 5);
  let defs = `<clipPath id="cone"><path d="${CONE}"/></clipPath>` +
    lin('vg', [[0, v.top], [0.45, v.mid], [1, v.grass]]) +
    lin('sh', [[0, v.shade, 0], [1, v.shade, 0.9]], 1, 0) +
    rad('lv', [[0, c.lava[0]], [0.55, c.lava[1]], [1, c.lava[2]]], ' cx="0.5" cy="0.62" r="0.62"') +
    rad('glow', [[0, c.lava[1], zone === 'crater' ? 0.55 : 0.4], [1, c.lava[1], 0]]);
  let o = '';
  // soft warm glow above the crater (behind the cone)
  o += ell(CX, CY - 4, 120, 70, 'url(#glow)');
  o += pth(CONE, 'url(#vg)');
  let inner = '';
  // right-hand shade band (light from upper-left)
  inner += pth(`M480 196C520 330 600 440 800 492L800 200Z`, 'url(#sh)', ' opacity="0.85"');
  inner += pth(`M520 214C548 330 640 450 800 488L800 500L640 500C600 440 548 340 520 214Z`, v.shade, ' opacity="0.35"');
  // gullies / ridges running down from the rim
  let gul = '';
  for (const [x0, bend, len] of [[446, -40, 220], [462, -14, 170], [500, 18, 180], [516, 50, 240], [438, -90, 260]]) {
    gul += `M${x0} 226Q${x0 + bend * 0.3} ${226 + len * 0.5} ${x0 + bend} ${226 + len}`;
  }
  inner += strokeP(gul, v.shade, 5, ' opacity="0.55"');
  inner += strokeP(`M440 226Q420 300 372 360M452 228Q444 280 420 316`, v.hi, 3.5, ' opacity="0.6"');
  // zone decoration on the lower slopes
  if (zone === 'beach' || zone === 'jungle') {
    // grassy skirt: wavy upper edge
    const gy = zone === 'beach' ? 360 : 300;
    const skirt = ridge(x => gy + Math.abs(x - 480) * (zone === 'beach' ? 0.18 : 0.12) + wave(zone.length + 50, [[10, 90], [5, 37]])(x), 520, 150, 810, 12);
    inner += pth(skirt, v.grass) + pth(ridge(x => gy + 40 + Math.abs(x - 480) * 0.1 + wave(zone.length + 51, [[8, 70]])(x), 520, 150, 810, 12), v.grassD, ' opacity="0.55"');
    // grass tick marks
    let t = ''; for (let i = 0; i < 40; i++) { const y = gy + 20 + r() * 110, x = 200 + r() * 560; t += `M${f(x)} ${f(y)}l${f(-2)} -6M${f(x + 4)} ${f(y)}l1 -7`; }
    inner += strokeP(t, v.grassD, 1.8, ' opacity="0.6"');
  }
  if (zone === 'ash') {
    // ash drifts: pale lilac streaks along the slopes
    let s = ''; for (let i = 0; i < 26; i++) { const y = 250 + r() * 220; const xl = flankX(y, -1), xr = flankX(y, 1); const x = xl + 20 + r() * (xr - xl - 40); s += `M${f(x)} ${f(y)}q${f(14 + r() * 10)} -4 ${f(30 + r() * 20)} 2`; }
    inner += strokeP(s, v.hi, 2.6, ' opacity="0.5"');
    inner += pth(ridge(x => 400 + Math.abs(x - 480) * 0.12 + wave(77, [[9, 110], [4, 40]])(x), 520, 150, 810, 12), v.grassD, ' opacity="0.5"');
    inner += strokeP(`M526 214C546 246 576 284 602 346C634 424 698 476 790 486`, '#ffb89a', 7, ' opacity="0.45"');
  }
  if (zone === 'crater') {
    // glowy jelly lava ribbons down the upper slopes (mostly above the play band)
    for (const [x0, bend, len, w] of [[448, -44, 92, 7], [512, 40, 98, 6], [480, 0, 40, 5]]) {
      const ex = x0 + bend, ey = 220 + len, mx = x0 + bend * 0.25, my = 220 + len * 0.55;
      // tapered jelly ribbon (filled shape narrowing to a rounded tip)
      const rib = k => `M${f(x0 - w * k)} 218Q${f(mx - w * k * 0.8)} ${f(my)} ${f(ex)} ${f(ey)}Q${f(mx + w * k * 0.8)} ${f(my)} ${f(x0 + w * k)} 218Z`;
      inner += pth(rib(1.6), c.lava[2], ' opacity="0.22"') + pth(rib(0.7), c.lava[1]) + pth(rib(0.25), c.lava[0], ' opacity="0.9"');
    }
    // moonlit rocky texture lower down
    let s = ''; for (let i = 0; i < 18; i++) { const y = 320 + r() * 150; const xl = flankX(y, -1), xr = flankX(y, 1); const x = xl + 20 + r() * (xr - xl - 40); s += `M${f(x)} ${f(y)}q${f(10)} -5 ${f(22 + r() * 12)} 0`; }
    inner += strokeP(s, v.hi, 2.2, ' opacity="0.35"');
  }
  // friendly sleepy face made of rocks (closed eyes, rosy cheeks, tiny smile)
  const fc = mix(v.out, v.shade, 0.25);
  inner += strokeP(`M434 284Q448 294 462 284M498 284Q512 294 526 284`, fc, 4.2);
  inner += strokeP(`M436 282l-5 -4M524 282l5 -4`, fc, 2.6);
  inner += ell(426, 302, 11, 5.5, '#ff9aa8', ' opacity="0.3"') + ell(534, 302, 11, 5.5, '#ff9aa8', ' opacity="0.3"');
  inner += strokeP(`M470 306Q480 314 490 306`, fc, 3.4);
  o += `<g clip-path="url(#cone)">${inner}</g>`;
  // outline
  o += pth(CONE, 'none', ` stroke="${v.out}" stroke-width="3" stroke-linejoin="round"`);
  // crater: inner back wall, glowy jelly lava, front lip
  o += ell(CX, CY, CRX, CRY + 1, mix(v.out, v.top, 0.3));
  o += ell(CX, CY + 2, CRX - 6, CRY - 3, 'url(#lv)');
  o += ell(CX - 10, CY + 1, 12, 2.4, '#fff6d0', ' opacity="0.8"');
  o += strokeP(`M${CX - CRX} ${CY}A${CRX} ${CRY + 1} 0 0 0 ${CX + CRX} ${CY}`, mix(v.top, '#ffffff', 0.15), 5);
  o += strokeP(`M${CX - CRX} ${CY}A${CRX} ${CRY + 1} 0 0 0 ${CX + CRX} ${CY}`, v.out, 1.6, ' opacity="0.7"');
  o += strokeP(`M${CX - 34} ${CY + 10}Q${CX - 20} ${CY + 14} ${CX - 4} ${CY + 14}`, v.hi, 2.4, ' opacity="0.9"');
  // foot decorations
  if (zone === 'beach') {
    o += bush(236, 488, 0.9, '#5aa850', '#2f6a34', '#86c86a', 3) + bush(724, 488, 1.0, '#5aa850', '#2f6a34', '#86c86a', 4);
    o += palm(206, 488, 1.0, -0.6, v, 7) + palm(760, 490, 0.9, 0.7, v, 8) + palm(268, 490, 0.72, 0.4, v, 9);
  }
  if (zone === 'jungle') {
    o += bigLeaf(196, 480, 1.0, -150, '#3f9a4a', '#25602e', '#7cc46a') + bigLeaf(204, 486, 0.9, -110, '#4aa852', '#25602e', '#8ad078');
    o += bigLeaf(764, 484, 1.0, -30, '#3f9a4a', '#25602e', '#7cc46a') + bigLeaf(756, 488, 0.85, -70, '#4aa852', '#25602e', '#8ad078');
    for (const [x, y, col] of [[262, 452, '#ff7fb0'], [300, 430, '#c58aff'], [690, 440, '#ff7fb0'], [650, 420, '#c58aff'], [352, 400, '#ff9ac0'], [606, 398, '#b08cff']]) o += flower(x, y, 0.9, col, x);
  }
  if (zone === 'ash') {
    for (const [x, y, s] of [[240, 482, 1], [720, 484, 0.9], [300, 472, 0.6]]) o += pth(blob(x, y - 8 * s, 22 * s, 12 * s, x, 10, 0.12), '#7a6c90', ` stroke="${v.out}" stroke-width="2.2"`) + ell(x - 6 * s, y - 13 * s, 8 * s, 3 * s, v.hi, ' opacity="0.7"');
  }
  if (zone === 'crater') {
    for (const [x, y] of [[250, 480], [712, 482]]) o += ell(x, y, 34, 9, c.lava[1], ' opacity="0.25"') + ell(x, y, 20, 5, c.lava[1], ' opacity="0.65"') + ell(x - 4, y - 1, 8, 2, c.lava[0], ' opacity="0.9"');
  }
  return svg(o, defs);
}

// =====================================================================================
// GROUND (960x540, transparent above the shore). Top edge ~ y 470–500, avg 492.
// =====================================================================================
const edgeFn = seed => { const w = wave(seed, [[5, 330], [3, 120], [1.5, 47]]); return x => GROUND + w(x); };
function groundBase(c, seed, defsId = 'gg') {
  const fn = edgeFn(seed);
  const defs = lin(defsId, [[0, c.top], [1, c.bot]]);
  const d = ridge(fn, 541, -10, 970, 12);
  const pts = []; for (let x = -10; x <= 970; x += 12) pts.push([x, fn(x)]);
  return { fn, defs, body: pth(d, `url(#${defsId})`) + strokeP(smooth(pts, false), c.out, 3) };
}
function shell(x, y, s, col) {
  const dark = mix(col, '#5a2a30', 0.4);
  let o = pth(`M${f(x - 9 * s)} ${f(y)}Q${f(x)} ${f(y - 16 * s)} ${f(x + 9 * s)} ${f(y)}Q${f(x)} ${f(y + 3 * s)} ${f(x - 9 * s)} ${f(y)}Z`, col, ` stroke="${dark}" stroke-width="${f(1.6 * s)}"`);
  return o + strokeP(`M${f(x)} ${f(y + 1)}V${f(y - 10 * s)}M${f(x)} ${f(y + 1)}L${f(x - 5 * s)} ${f(y - 8 * s)}M${f(x)} ${f(y + 1)}L${f(x + 5 * s)} ${f(y - 8 * s)}`, dark, 1.1 * s, ' opacity="0.6"');
}
function starfish(x, y, s, rot) { return `<g transform="rotate(${rot} ${x} ${y})">${pth(starShape(x, y, 10 * s, 0.45), '#ff9a86', ` stroke="#c45a50" stroke-width="${f(1.6 * s)}" stroke-linejoin="round"`)}${circ(x, y, 1.6 * s, '#fff0e0')}</g>`; }
function groundBeach() {
  const c = PAL.beach.ground; const r = rng(51);
  const { fn, defs, body } = groundBase(c, 52); let o = '';
  // foam + wet sand along the waterline (above the edge)
  const pts = []; for (let x = -10; x <= 970; x += 12) pts.push([x, fn(x) - 3]);
  o += strokeP(smooth(pts, false), '#7fdcd8', 7, ' opacity="0.55"');
  o += body;
  const wp = []; for (let x = -10; x <= 970; x += 12) wp.push([x, fn(x) + 7]);
  o += strokeP(smooth(wp, false), c.wet, 6, ' opacity="0.55"');
  let foam = ''; for (let x = 10; x < W; x += 46 + r() * 30) foam += `M${f(x)} ${f(fn(x) - 4)}q8 -4 16 0t16 0`;
  o += strokeP(foam, c.foam, 2.4, ' opacity="0.85"');
  // sand speckles (sparse, low contrast)
  let sp = ''; for (let i = 0; i < 70; i++) { const x = r() * W, y = fn(x) + 14 + r() * 40; sp += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 1.3)}"/>`; }
  o += `<g fill="${c.out}" opacity="0.35">${sp}</g>`;
  // shells / starfish near the bottom, mostly towards the sides
  o += shell(120, 524, 1, '#ffd2c4') + shell(842, 528, 0.9, '#f7c8e0') + shell(560, 532, 0.7, '#ffe0c8') + starfish(40, 520, 1, 20) + starfish(910, 518, 1.1, -10) + starfish(330, 530, 0.65, 40);
  // beach grass at the outer edges (Puff never goes past x 70 / 890)
  let gr = ''; for (const [x0, dir] of [[18, 1], [942, -1]]) for (let k = 0; k < 7; k++) { const x = x0 + dir * k * 6, h = 24 + r() * 26; gr += `M${f(x)} ${f(fn(x) + 4)}q${f(dir * 6)} ${f(-h * 0.6)} ${f(dir * (8 + r() * 6))} ${f(-h)}`; }
  o += strokeP(gr, '#6aa84e', 3, '') + strokeP(gr, '#9ccf6c', 1.2, ' opacity="0.8"');
  return svg(o, defs);
}
function fern(x, y, s, dir, c) {
  let o = ''; const L = 70 * s;
  for (let k = 0; k < 3; k++) {
    const a = (dir < 0 ? -120 + k * 22 : -60 - k * 22) * Math.PI / 180;
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    const mx = x + Math.cos(a) * L * 0.5 + dir * 10 * s, my = y + Math.sin(a) * L * 0.5 - 12 * s;
    o += strokeP(`M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`, c.fernD, 3 * s);
    let lv = '';
    for (let i = 1; i < 9; i++) { const t = i / 9, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex, py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey; const ll = 13 * s * (1 - t * 0.7); lv += ell(px, py, ll, 3.6 * s * (1 - t * 0.5), c.fern, ` transform="rotate(${f(a * 180 / Math.PI + 70)} ${f(px)} ${f(py)})"`) + ell(px, py, ll, 3.6 * s * (1 - t * 0.5), c.fern, ` transform="rotate(${f(a * 180 / Math.PI - 70)} ${f(px)} ${f(py)})"`); }
    o += `<g stroke="${c.fernD}" stroke-width="${f(1.2 * s)}">${lv}</g>`;
  }
  return o;
}
function mushroom(x, y, s) {
  return `<rect x="${f(x - 3 * s)}" y="${f(y - 10 * s)}" width="${f(6 * s)}" height="${f(10 * s)}" rx="${f(3 * s)}" fill="#fff0dc" stroke="#9a7a5a" stroke-width="${f(1.4 * s)}"/>` +
    pth(`M${f(x - 10 * s)} ${f(y - 9 * s)}Q${f(x)} ${f(y - 24 * s)} ${f(x + 10 * s)} ${f(y - 9 * s)}Z`, '#ff8a9a', ` stroke="#b04a5a" stroke-width="${f(1.6 * s)}" stroke-linejoin="round"`) + circ(x - 3 * s, y - 15 * s, 1.8 * s, '#fff6ee') + circ(x + 4 * s, y - 12 * s, 1.3 * s, '#fff6ee');
}
function groundJungle() {
  const c = PAL.jungle.ground; const r = rng(61);
  const { fn, defs, body } = groundBase(c, 62); let o = body;
  // soil band lower down
  o += pth(ridge(x => 516 + wave(63, [[4, 140], [2, 50]])(x), 541, -10, 970, 12), c.soil);
  o += strokeP(smooth(Array.from({ length: 83 }, (_, i) => [i * 12 - 10, 516 + wave(63, [[4, 140], [2, 50]])(i * 12 - 10)]), false), mix(c.soil, '#2a1a10', 0.3), 2.4);
  // moss tufts along the top edge (tiny, low contrast)
  let t = ''; for (let x = 6; x < W; x += 18 + r() * 16) { const y = fn(x) + 1; t += `M${f(x)} ${f(y)}l-2 -5M${f(x + 3)} ${f(y)}l1 -6M${f(x + 6)} ${f(y)}l3 -4`; }
  o += strokeP(t, '#77b85a', 2, ' opacity="0.9"');
  let pb = ''; for (let i = 0; i < 18; i++) { const x = r() * W, y = 522 + r() * 14; pb += ell(x, y, 4 + r() * 4, 2.4 + r() * 1.5, '#9a7a5a', ' opacity="0.8"'); }
  o += pb;
  // ferns + mushrooms at the outer edges, a few small flowers
  o += fern(18, 500, 1.1, 1, c) + fern(944, 502, 1.1, -1, c);
  o += mushroom(150, 512, 1) + mushroom(166, 514, 0.7) + mushroom(810, 512, 0.9);
  for (const [x, col] of [[300, '#ff7fb0'], [520, '#c58aff'], [690, '#ff9ac0']]) o += flower(x, fn(x) + 14, 0.7, col, x);
  return svg(o, defs);
}
function groundAsh() {
  const c = PAL.ash.ground; const r = rng(71);
  const { fn, defs, body } = groundBase(c, 72); let o = body;
  // wind ripples on the ash
  let rp = ''; for (let i = 0; i < 26; i++) { const x = r() * W, y = fn(x) + 12 + r() * 34; rp += `M${f(x)} ${f(y)}q12 -5 24 0t24 0`; }
  o += strokeP(rp, c.rip, 2, ' opacity="0.65"');
  // smooth round pebbles (lilac-grey, clearly not plum rocks: light + no glow)
  for (const [x, y, s] of [[60, 516, 1.2], [110, 528, 0.8], [860, 520, 1.1], [906, 530, 0.8], [430, 530, 0.6], [640, 526, 0.7]]) {
    o += pth(blob(x, y, 14 * s, 8 * s, x, 9, 0.1), '#a99bbc', ` stroke="${c.out}" stroke-width="${f(2 * s)}"`) + ell(x - 4 * s, y - 3 * s, 5 * s, 2 * s, '#d4c8de', ' opacity="0.8"');
  }
  // little steam vents (soft white wisps) at the sides
  for (const x of [30, 932]) o += ell(x, fn(x) + 6, 10, 3, c.out) + strokeP(`M${x} ${f(fn(x) + 2)}q-6 -10 0 -18t0 -18`, '#efe6f4', 3, ' opacity="0.55"');
  // dry grass tufts at the outer edges
  let gr = ''; for (const [x0, dir] of [[10, 1], [950, -1]]) for (let k = 0; k < 6; k++) { const x = x0 + dir * k * 7, h = 18 + r() * 20; gr += `M${f(x)} ${f(fn(x) + 4)}q${f(dir * 5)} ${f(-h * 0.6)} ${f(dir * (6 + r() * 6))} ${f(-h)}`; }
  o += strokeP(gr, '#b8a27a', 2.6);
  return svg(o, defs);
}
function groundCrater() {
  const c = PAL.crater.ground; const r = rng(81);
  let { fn, defs, body } = groundBase(c, 82);
  defs += rad('pool', [[0, '#ffe0a0', 1], [0.5, '#ffa060', 0.9], [1, '#ff7a7a', 0]]);
  let o = body;
  // moonlit rock slabs: lighter tops, crack lines
  let cr = ''; for (let i = 0; i < 16; i++) { const x = r() * W, y = fn(x) + 16 + r() * 30; cr += `M${f(x)} ${f(y)}l${f(8 + r() * 8)} ${f(3 - r() * 6)}l${f(6 + r() * 6)} ${f(4)}`; }
  o += strokeP(cr, c.out, 2, ' opacity="0.8"');
  const hp = []; for (let x = -10; x <= 970; x += 12) hp.push([x, fn(x) + 4]);
  o += strokeP(smooth(hp, false), '#6a72b0', 2.4, ' opacity="0.6"');
  // glowy jelly lava pools near the outer edges (soft, friendly)
  for (const [x, y, s] of [[70, 522, 1.1], [890, 524, 1.2], [470, 532, 0.55]]) {
    o += ell(x, y, 46 * s, 14 * s, 'url(#pool)', ' opacity="0.6"');
    o += ell(x, y, 26 * s, 7 * s, '#ff9a6a', ` stroke="${c.out}" stroke-width="2"`) + ell(x, y + 0.5, 18 * s, 4 * s, '#ffc27a') + ell(x - 7 * s, y - 1.5 * s, 6 * s, 1.5 * s, '#fff1c0', ' opacity="0.9"');
  }
  // small blue crystals at the edges (night sparkle, not gold)
  for (const [x, s] of [[24, 1], [36, 0.7], [938, 0.9], [924, 0.6]]) { const y = fn(x) + 6; o += pth(`M${f(x - 5 * s)} ${f(y)}L${f(x - 3 * s)} ${f(y - 20 * s)}L${f(x + 1 * s)} ${f(y - 26 * s)}L${f(x + 5 * s)} ${f(y - 18 * s)}L${f(x + 5 * s)} ${f(y)}Z`, '#8ab0ff', ` stroke="#3a4a9a" stroke-width="1.6" stroke-linejoin="round"`) + strokeP(`M${f(x - 1 * s)} ${f(y - 4)}L${f(x)} ${f(y - 20 * s)}`, '#e0ecff', 1.4, ' opacity="0.8"'); }
  return svg(o, defs);
}

// =====================================================================================
// PARTICLES (32x32 centred)
// =====================================================================================
const P = {};
const ps = (body, defs = '') => svg(body, defs, 32, 32);
P.smoke = ps(`<g fill="#b4adc4" opacity="0.85"><circle cx="10.5" cy="19.5" r="6.5"/><circle cx="17.5" cy="14.5" r="7.5"/><circle cx="22.5" cy="20" r="6"/><circle cx="16" cy="22.5" r="5.5"/></g><g fill="#dcd7e6" opacity="0.9"><circle cx="11" cy="18.5" r="5.4"/><circle cx="17" cy="13.5" r="6.4"/><circle cx="21.5" cy="18.8" r="5"/><circle cx="16" cy="20.5" r="4.6"/></g><circle cx="14.5" cy="11" r="2.2" fill="#f4f2f8" opacity="0.8"/>`);
P.ember = ps(`<circle cx="16" cy="16" r="14" fill="url(#g)"/><circle cx="16" cy="16" r="5.5" fill="#ff9a4a"/><circle cx="16" cy="16" r="3.4" fill="#ffd27a"/><circle cx="15" cy="15" r="1.4" fill="#fff6d8"/>`,
  `<radialGradient id="g"><stop offset="0" stop-color="#ffb060" stop-opacity="0.85"/><stop offset="0.5" stop-color="#ff7a50" stop-opacity="0.35"/><stop offset="1" stop-color="#ff7a50" stop-opacity="0"/></radialGradient>`);
P.ash = ps(`<g transform="rotate(-20 16 16)"><path d="M5 16Q9 11 15 12.5Q21 10 27 14Q24 18 18 18.5Q12 21 5 16Z" fill="#b0a6bc" stroke="#7a7090" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 15Q13 13.2 17 14" fill="none" stroke="#e2dcea" stroke-width="1.3" stroke-linecap="round"/><circle cx="21" cy="15.5" r="0.9" fill="#857b98"/></g>`);
P.leaf = ps(`<path d="M5 26C6 15 14 6 27 5C27 18 18 26 5 26Z" fill="#5ab44e" stroke="#2f6e34" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 24.5Q15 16 25 7" fill="none" stroke="#2f6e34" stroke-width="1.2" stroke-linecap="round"/><path d="M12 18.5l-1 -5M16 14.5l-0.5 -5M15 18l5 0.5M19 14l5 0" fill="none" stroke="#2f6e34" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/><path d="M9 20Q11 12 20 8" fill="none" stroke="#9ad87a" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`);
P.sparkle = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><path d="${twinkle(16, 16, 14, 0.13)}" fill="#ffffff" stroke="#9ae7e2" stroke-width="1"/><path d="${twinkle(16, 16, 7, 0.2)}" fill="#ffffff"/>`,
  `<radialGradient id="g"><stop offset="0" stop-color="#e8fffb" stop-opacity="0.9"/><stop offset="1" stop-color="#bff4ee" stop-opacity="0"/></radialGradient>`);
P.rain = ps(`<path d="M16 3C18.5 10 22.5 15.5 22.5 21A6.5 6.5 0 0 1 9.5 21C9.5 15.5 13.5 10 16 3Z" fill="#7cc8f4" stroke="#3a86c4" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 20.5Q12.6 16.5 14.6 13" fill="none" stroke="#e6f6ff" stroke-width="1.8" stroke-linecap="round"/>`);
P.steam = ps(`<path d="M11 28C5 24 13 20 10 15C7 10 14 6 13 3" fill="none" stroke="#c6cee0" stroke-width="5" stroke-linecap="round" opacity="0.7"/><path d="M11 28C5 24 13 20 10 15C7 10 14 6 13 3" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><path d="M21 27C17 23 24 20 21 15C19 12 23 9 22 7" fill="none" stroke="#c6cee0" stroke-width="4" stroke-linecap="round" opacity="0.6"/><path d="M21 27C17 23 24 20 21 15C19 12 23 9 22 7" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`);
P.firefly = ps(`<circle cx="16" cy="16" r="14" fill="url(#g)"/><ellipse cx="12" cy="13" rx="4" ry="2.6" fill="#e8f6ff" opacity="0.7" transform="rotate(-25 12 13)"/><ellipse cx="20" cy="13" rx="4" ry="2.6" fill="#e8f6ff" opacity="0.7" transform="rotate(25 20 13)"/><circle cx="16" cy="17" r="4.2" fill="#e8ff7a"/><circle cx="16" cy="17" r="2.2" fill="#fbffd8"/>`,
  `<radialGradient id="g"><stop offset="0" stop-color="#e4ff6a" stop-opacity="0.8"/><stop offset="0.45" stop-color="#b8f05a" stop-opacity="0.3"/><stop offset="1" stop-color="#b8f05a" stop-opacity="0"/></radialGradient>`);
P.butterfly = ps(`<g stroke="#7a3a8a" stroke-width="1.4" stroke-linejoin="round"><path d="M16 15C12 6 4 5 4 11C4 15 9 17 16 16Z" fill="#ff8ac8"/><path d="M16 15C20 6 28 5 28 11C28 15 23 17 16 16Z" fill="#ff8ac8"/><path d="M16 17C11 18 7 21 9 25C11 28 15 23 16 18Z" fill="#c08aff"/><path d="M16 17C21 18 25 21 23 25C21 28 17 23 16 18Z" fill="#c08aff"/></g><circle cx="9" cy="11" r="2" fill="#fff0f8"/><circle cx="23" cy="11" r="2" fill="#fff0f8"/><rect x="15" y="11" width="2" height="12" rx="1" fill="#5a2a6a"/><path d="M15.5 11.5Q14 8 12 7M16.5 11.5Q18 8 20 7" fill="none" stroke="#5a2a6a" stroke-width="1" stroke-linecap="round"/>`);
P.star = ps(`<circle cx="16" cy="16" r="10" fill="url(#g)"/><path d="${starShape(16, 16.5, 11, 0.45)}" fill="#fff6c8" stroke="#e8c86a" stroke-width="1.2" stroke-linejoin="round"/><circle cx="14" cy="14" r="1.8" fill="#ffffff"/>`,
  `<radialGradient id="g"><stop offset="0" stop-color="#fff8d8" stop-opacity="0.8"/><stop offset="1" stop-color="#fff8d8" stop-opacity="0"/></radialGradient>`);

// ---------- write ----------
const files = {
  'zones/beach/sky.svg': skyBeach(), 'zones/beach/clouds.svg': clouds('beach', 101, gullClouds), 'zones/beach/volcano.svg': volcano('beach'), 'zones/beach/ground.svg': groundBeach(),
  'zones/jungle/sky.svg': skyJungle(), 'zones/jungle/clouds.svg': clouds('jungle', 202), 'zones/jungle/volcano.svg': volcano('jungle'), 'zones/jungle/ground.svg': groundJungle(),
  'zones/ash/sky.svg': skyAsh(), 'zones/ash/clouds.svg': clouds('ash', 303), 'zones/ash/volcano.svg': volcano('ash'), 'zones/ash/ground.svg': groundAsh(),
  'zones/crater/sky.svg': skyCrater(), 'zones/crater/clouds.svg': clouds('crater', 404), 'zones/crater/volcano.svg': volcano('crater'), 'zones/crater/ground.svg': groundCrater(),
};
for (const k of Object.keys(P)) files['particles/' + k + '.svg'] = P[k];
for (const [rel, data] of Object.entries(files)) {
  if (/<text|<script|href=|@import|url\((?!#)/.test(data)) throw new Error('forbidden content in ' + rel);
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  const kb = Buffer.byteLength(data) / 1024; console.log(rel.padEnd(30), kb.toFixed(1) + ' KB', kb >= 60 ? 'TOO BIG' : '');
}
module.exports = { PAL };
