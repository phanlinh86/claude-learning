// Nimbus's Bubble Garden: environment art generator (4 times of day + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3, §4.4.
//  - levels/<zone>/sky.svg     960x540, transparent except soft sky décor (clouds, sun/moon, rainbow, stars), mostly above y 300.
//  - levels/<zone>/far.svg     960x540, transparent above ~y 220, distant garden, opaque below y 470.
//  - levels/<zone>/mid.svg     960x540, transparent above ~y 290, fence + flowers + trellis + watering can, opaque below y 490.
//  - levels/<zone>/ground.svg  960x200, grass blades y 0..40, lawn line y 40, opaque lawn below, puddles at x 120/360/600/840, y 58.
//  - particles/*.svg           32x32 (streak 8x48, mist 64x32), centred, transparent edges.
// Tileability: every shape that crosses x 0 or x 960 is emitted again shifted by ±960 (wrapG); bands are periodic
// (sine sums with integer periods, or scallops with an integer count over 960), so left edge = right edge.
// Play-area rule: muted, less saturated than the gems (#ff4d6d #3d8bff #2fd07a #ffc531 #b26bff) and the white hero.
// Also writes palette.json beside this file ({zone: {skyTop, skyBottom, lawn, ...}}) for sheet.js / the integrator.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960, H = 540, GH = 200, LAWN = 40;
const PUDDLES = [120, 360, 600, 840], PUDDLE_Y = 58;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.3) => mix(c, '#1c2238', t);
const lite = (c, t = 0.3) => mix(c, '#ffffff', t);
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const SO = (c, w) => ` stroke="${c}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const linU = (id, s, x1, y1, x2, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const glowGrad = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.4', col, a * 0.5], ['1', col, 0]]);
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, k = 0.22) => {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, nx = cx + Math.cos(b) * R, ny = cy + Math.sin(b) * R;
    const m = a + Math.PI / 4, qx = cx + Math.cos(m) * R * k, qy = cy + Math.sin(m) * R * k;
    d += (i ? '' : `M${f(x)} ${f(y)}`) + `Q${f(qx)} ${f(qy)} ${f(nx)} ${f(ny)}`;
  }
  return d + 'Z';
};
// emit a group (absolute coords) again shifted by ±W when it crosses an edge of the tile
const wrapG = (x0, x1, body) => body + (x0 < 0 ? `<g transform="translate(${W} 0)">${body}</g>` : '') + (x1 > W ? `<g transform="translate(${-W} 0)">${body}</g>` : '');
// periodic wave band: y(x) = y0 + Σ a·sin(2π k x / W + p), filled down to yb
const wave = (y0, terms, yb) => {
  let d = '';
  for (let x = 0; x <= W; x += 8) {
    let y = y0; for (const [k, a, p] of terms) y += a * Math.sin(2 * Math.PI * k * x / W + p);
    d += (x ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d + `L${W} ${yb}L0 ${yb}Z`;
};
// periodic scallop band (rounded bumps), n bumps over W, heights from a seeded rng (bump n = bump 0), filled to yb
const scallop = (y0, n, hMin, hMax, seed, yb, jitter = 0) => {
  const r = rng(seed), hs = [], ys = [];
  for (let i = 0; i < n; i++) { hs.push(hMin + r() * (hMax - hMin)); ys.push(y0 + (r() - 0.5) * jitter); }
  ys.push(ys[0]);
  const s = W / n; let d = `M0 ${f(ys[0])}`;
  for (let i = 0; i < n; i++) {
    const x0 = i * s, x1 = x0 + s, h = hs[i];
    d += `C${f(x0 + s * 0.05)} ${f(ys[i] - h * 1.33)} ${f(x1 - s * 0.05)} ${f(ys[i + 1] - h * 1.33)} ${f(x1)} ${f(ys[i + 1])}`;
  }
  return d + `L${W} ${yb}L0 ${yb}Z`;
};
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// ---------- palettes (muted; horizons tuned to the §4.4 gradient) ----------
const Z = {
  dawn: {
    skyTop: '#c9b4e6', skyBottom: '#ffd3c4', haze: '#e9cbdc',
    cloud: '#f1e6f4', cloudShade: '#ddcdea', cloudOut: '#cbb8df', cloudOp: 0.78,
    sun: '#fff0e4', sunGlow: '#ffe6d6',
    hill: '#cdb8d6', hill2: '#bfb0cf', tree: '#8eab92', trunk: '#9d8a98', hedge: '#86a389',
    wall: '#e8d6dc', roof: '#bf9aa8', window: '#cfc0db', lit: null, glass: '#efe3f0', frame: '#c2b2c9',
    green: '#7f9d84', fence: '#ece2ea', bank: '#86a284',
    flowers: ['#e7a3b7', '#eab597', '#c9a9dd', '#efc3cf'], center: '#f3dca8',
    can: '#a9bccb',
    lawn: '#87a37f', lawnLite: '#9bb68f', lawnDark: '#6f8b6c', blade: ['#7d9a76', '#93ae88', '#a5bd98', '#6c8869'],
    water: '#e6daf0', waterDeep: '#cbbde0', pebble: '#c5bccb', tiny: '#f6eef4', tinyC: '#ead6a6'
  },
  noon: {
    skyTop: '#8fc9ef', skyBottom: '#dff1f7', haze: '#cfe8f1',
    cloud: '#f7fbfd', cloudShade: '#dce9f2', cloudOut: '#c4d7e6', cloudOp: 0.82,
    sun: '#fffbea', sunGlow: '#fff4cc',
    hill: '#b5d7d3', hill2: '#a6cdc4', tree: '#84b391', trunk: '#a99583', hedge: '#77a784',
    wall: '#f2ece0', roof: '#c9a090', window: '#b9d6e2', lit: null, glass: '#e6f4f6', frame: '#b8cbc9',
    green: '#6ea276', fence: '#f3f2ea', bank: '#77aa72',
    flowers: ['#e3c467', '#dcb65c', '#e8cd7c'], center: '#8f6f50',
    can: '#8fb8c7',
    lawn: '#7eac6c', lawnLite: '#94c07f', lawnDark: '#669359', blade: ['#74a364', '#8cbb77', '#a0c98a', '#62905a'],
    water: '#d6edf6', waterDeep: '#b5d8ea', pebble: '#c8cbc2', tiny: '#fbfaf2', tinyC: '#ecd27e'
  },
  sunset: {
    skyTop: '#7a5aa8', skyBottom: '#ffb07a', haze: '#eba08a',
    cloud: '#b892c0', cloudShade: '#9c7cb3', cloudOut: '#86669f', cloudOp: 0.7,
    streak: ['#f2b49a', '#e09aa2', '#cf8fb0'],
    sun: '#ffd0a0', sunGlow: '#ffc08c',
    hill: '#c88b8e', hill2: '#b07d8c', tree: '#8d7a6e', trunk: '#7c5f5d', hedge: '#7f7d5c',
    wall: '#e9c2ad', roof: '#a8706f', window: '#f2c79a', lit: null, glass: '#f4cfb8', frame: '#b98d86',
    green: '#7d8757', fence: '#e8c3ae', bank: '#7f8a54',
    flowers: ['#e19db3', '#cf90bf', '#a898cf', '#eab0b9'], center: '#ecc47e',
    can: '#b99a8f',
    lawn: '#7e8853', lawnLite: '#959c62', lawnDark: '#656d44', blade: ['#76804e', '#8e9660', '#a2a56f', '#62693f'],
    water: '#f3c6ad', waterDeep: '#d9a3a0', pebble: '#c6aea4', tiny: '#f8e6dc', tinyC: '#e9b86e'
  },
  night: {
    skyTop: '#141c46', skyBottom: '#34407a', haze: '#3b4884',
    cloud: '#2e3a73', cloudShade: '#252f62', cloudOut: '#1e2752', cloudOp: 0.9, cloudRim: '#52609c',
    moon: '#f3ecce', moonGlow: '#c9cdf0', starCol: '#efeacf',
    hill: '#2b3569', hill2: '#26305f', tree: '#28375f', trunk: '#25294f', hedge: '#24385a',
    wall: '#3a4475', roof: '#2a2f5e', window: '#3b4a7e', lit: '#ffd58c', glass: '#4a5890', frame: '#5a669c',
    green: '#2f4a5f', fence: '#46538a', bank: '#2b4658',
    flowers: ['#e9b878', '#e3a86e', '#ecc285'], center: '#ffe9b6', flowerGlow: '#ffd99a',
    can: '#4d5c8e',
    lawn: '#2a4558', lawnLite: '#355769', lawnDark: '#213847', blade: ['#2d4b5d', '#365a6b', '#41677a', '#253f50'],
    water: '#4b5a96', waterDeep: '#36447e', pebble: '#4d5a7e', tiny: '#a9b4d9', tinyC: '#e6d49c', worm: '#d6ff9e'
  }
};
const ZONES = Object.keys(Z);

// ---------- shared building blocks ----------
// cel-shaded blob cluster: outline union (stroked copies behind), shade fill, lighter fill shifted up-left, one highlight
function blob(circles, base, opts = {}) {
  const ow = opts.ow ?? 3, out = opts.out ?? dark(base, 0.28), shade = opts.shade ?? dark(base, 0.12), light = opts.light ?? lite(base, 0.12);
  let s = '';
  if (ow > 0) s += `<g fill="${out}"${SO(out, ow * 2)}>${circles.map(([x, y, r]) => circ(x, y, r, out)).join('')}</g>`;
  s += `<g>${circles.map(([x, y, r]) => circ(x, y, r, shade)).join('')}</g>`;
  s += `<g>${circles.map(([x, y, r]) => circ(x - r * 0.1, y - r * 0.16, r * 0.84, light)).join('')}</g>`;
  if (opts.hi) { const [x, y, r] = circles[0]; s += ell(x - r * 0.35, y - r * 0.45, r * 0.28, r * 0.16, opts.hi, op(opts.hiOp ?? 0.5)); }
  return s;
}
// flat-bottomed rain cloud
function cloud(cx, cy, w, h, seed, c) {
  const r = rng(seed), n = Math.max(3, Math.round(w / (h * 0.85))), cs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), x = cx - w / 2 + h * 0.45 + t * (w - h * 0.9);
    const bell = Math.sin(Math.PI * (0.15 + t * 0.7));
    cs.push([x + (r() - 0.5) * h * 0.2, cy - bell * h * 0.25 + (r() - 0.5) * h * 0.1, h * (0.42 + bell * 0.32 + r() * 0.1)]);
  }
  const base = [cx - w / 2, cy, w, h * 0.46, h * 0.23];
  const shape = (fill, dy = 0, k = 1) => cs.map(([x, y, rr]) => circ(x, y + dy, rr * k, fill)).join('') + rrect(base[0] + (1 - k) * h * 0.2, base[1] + dy, base[2] - (1 - k) * h * 0.4, base[3], base[4], fill);
  let s = `<g${op(c.op)}>`;
  s += `<g${SO(c.out, 4)}>${shape(c.out)}</g>`;
  s += shape(c.shade);
  s += `<g>${shape(c.light, -h * 0.1, 0.9)}</g>`;
  if (c.rim) s += `<g fill="none"${SO(c.rim, 2)}${op(0.55)}>${cs.slice(0, Math.ceil(n / 2) + 1).map(([x, y, rr]) => `<path d="M${f(x - rr * 0.7)} ${f(y - rr * 0.7)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr * 0.5)} ${f(y - rr * 0.86)}"/>`).join('')}</g>`;
  return wrapG(cx - w / 2 - 6, cx + w / 2 + 6, s + '</g>');
}
// round tree: trunk + cel-shaded canopy cluster
function tree(x, base, size, seed, c, hazeT) {
  const r = rng(seed), col = mix(c.tree, c.haze, hazeT), trunk = mix(c.trunk, c.haze, hazeT);
  const ch = size * 1.5, cy = base - size * 0.55 - ch * 0.5, cs = [];
  cs.push([x, cy - size * 0.25, size * 0.62]);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.95 + 1.1 * i / (n - 1)) + (r() - 0.5) * 0.2;
    cs.push([x + Math.cos(a) * size * 0.62, cy + Math.sin(a) * size * 0.4 + size * 0.18, size * (0.36 + r() * 0.14)]);
  }
  cs.push([x, cy + size * 0.28, size * 0.5]);
  let s = pth(`M${f(x - size * 0.09)} ${f(base)}L${f(x - size * 0.06)} ${f(cy + size * 0.2)}L${f(x + size * 0.06)} ${f(cy + size * 0.2)}L${f(x + size * 0.09)} ${f(base)}Z`, trunk, SO(dark(trunk, 0.2), 2));
  s += blob(cs, col, { ow: 1.5, out: dark(col, 0.18), shade: dark(col, 0.08), light: lite(col, 0.08) });
  return wrapG(x - size * 1.2, x + size * 1.2, s);
}

// ---------- SKY ----------
function sky(z) {
  const c = Z[z], r = rng(11 + ZONES.indexOf(z) * 101);
  let defs = '', s = '';
  const cc = { out: c.cloudOut, shade: c.cloudShade, light: c.cloud, op: c.cloudOp, rim: c.cloudRim };
  if (z === 'dawn') {
    defs += glowGrad('sg', c.sunGlow, 0.75);
    s += circ(640, 215, 230, 'url(#sg)');
    s += circ(640, 215, 54, c.sun, op(0.75));
    s += circ(640, 215, 40, '#fff8f2', op(0.5));
    // soft lilac rain clouds near the top + one low wisp across the sun
    s += cloud(150, 40, 360, 92, 1, cc) + cloud(520, 18, 300, 80, 2, cc) + cloud(850, 52, 330, 88, 3, cc);
    s += cloud(700, 176, 300, 44, 4, Object.assign({}, cc, { op: 0.55 }));
    s += cloud(300, 150, 220, 40, 5, Object.assign({}, cc, { op: 0.45 }));
  } else if (z === 'noon') {
    defs += glowGrad('sg', c.sunGlow, 0.8);
    // faint rainbow, fading out towards its feet
    defs += linU('rbf', [['0', '#fff', 1], ['0.55', '#fff', 0.85], ['1', '#fff', 0]], 0, 170, 0, 420);
    defs += `<mask id="rbm" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${rect(0, 0, W, H, 'url(#rbf)')}</mask>`;
    const RB = ['#f3aeb0', '#f5c9a0', '#f2e2a6', '#bfe1b6', '#acd0ea', '#c7b8e4'];
    s += `<g mask="url(#rbm)"${op(0.32)}>` + RB.map((col, i) => { const rr = 330 - i * 9; return stk(`M${430 - rr} 520A${rr} ${rr} 0 0 1 ${430 + rr} 520`, col, 9.5); }).join('') + '</g>';
    // sun patch peeking out top-right with gentle rays
    s += wrapG(560, 1000, circ(780, 70, 220, 'url(#sg)'));
    let rays = '';
    for (let i = 0; i < 9; i++) { const a = (0.35 + i * 0.13) * Math.PI, a2 = a + 0.045 * Math.PI; rays += pth(`M780 70L${f(780 + Math.cos(a) * 330)} ${f(70 + Math.sin(a) * 330)}L${f(780 + Math.cos(a2) * 330)} ${f(70 + Math.sin(a2) * 330)}Z`, '#fffbe8'); }
    defs += rad('rayf', [['0', '#fff', 0.9], ['1', '#fff', 0]], ' gradientUnits="userSpaceOnUse" cx="780" cy="70" r="330"');
    defs += `<mask id="raym" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${rect(0, 0, W, H, 'url(#rayf)')}</mask>`;
    s += wrapG(450, 1110, `<g mask="url(#raym)"${op(0.22)}>${rays}</g>`);
    s += circ(780, 70, 50, c.sun, op(0.85));
    s += circ(780, 70, 38, '#ffffff', op(0.45));
    s += cloud(120, 30, 340, 86, 6, cc) + cloud(470, 14, 320, 76, 7, cc) + cloud(880, 118, 250, 62, 8, cc);
    s += cloud(660, 170, 200, 38, 9, Object.assign({}, cc, { op: 0.5 }));
  } else if (z === 'sunset') {
    defs += glowGrad('sg', c.sunGlow, 0.7);
    s += circ(520, 285, 260, 'url(#sg)');
    s += circ(520, 285, 92, c.sun, op(0.7));
    s += circ(520, 285, 72, '#ffe2bf', op(0.35));
    // long streaky clouds across the sun
    const streaks = [[300, 214, 300, 14, 0], [640, 244, 360, 12, 1], [180, 270, 260, 10, 2], [760, 296, 280, 11, 0], [470, 318, 320, 9, 1], [60, 236, 220, 10, 1], [900, 200, 240, 10, 2]];
    for (const [x, y, w, h, k] of streaks) {
      const col = c.streak[k];
      s += wrapG(x - w / 2, x + w / 2, rrect(x - w / 2, y, w, h, h / 2, col, op(0.6)) + rrect(x - w / 2 + w * 0.12, y - h * 0.55, w * 0.5, h * 0.7, h * 0.35, lite(col, 0.18), op(0.45)));
    }
    s += cloud(170, 34, 380, 96, 10, cc) + cloud(560, 10, 340, 84, 11, cc) + cloud(880, 46, 300, 86, 12, cc);
  } else {
    // night: crescent moon behind rain clouds, a few small stars
    defs += glowGrad('mg', c.moonGlow, 0.35);
    defs += `<mask id="mm" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${circ(690, 120, 36, '#fff')}${circ(707, 108, 31, '#000')}</mask>`;
    s += circ(690, 120, 150, 'url(#mg)');
    const stars = [];
    for (let i = 0; i < 20; i++) {
      let x, y, ok;
      do { x = r() * W; y = 16 + r() * 150; ok = Math.hypot(x - 690, y - 120) > 70; } while (!ok);
      stars.push([x, y, 1.6 + r() * 2.2, 0.35 + r() * 0.45]);
    }
    for (const [x, y, R, a] of stars) s += wrapG(x - R * 2, x + R * 2, R > 3 ? pth(twinkle(x, y, R * 1.6), c.starCol, op(a)) : circ(x, y, R * 0.6, c.starCol, op(a)));
    s += `<g mask="url(#mm)">${circ(690, 120, 36, c.moon)}${circ(682, 128, 30, lite(c.moon, 0.4), op(0.5))}</g>`;
    s += cloud(150, 40, 380, 96, 13, cc) + cloud(470, 20, 300, 80, 14, cc) + cloud(770, 168, 260, 52, 15, cc) + cloud(900, 28, 260, 76, 16, cc);
  }
  return svg(W, H, s, defs);
}

// ---------- FAR ----------
function cottage(x, base, c) {
  const w = 104, h = 58, wall = c.wall, roof = c.roof;
  let s = '';
  // chimney
  s += rect(x + 22, base - h - 46, 14, 30, dark(roof, 0.05), SO(dark(roof, 0.25), 1.5));
  s += rect(x - w / 2, base - h, w, h, wall, SO(dark(wall, 0.2), 1.5));
  s += rect(x - w / 2, base - h, w, 10, dark(wall, 0.08));
  s += pth(`M${x - w / 2 - 12} ${base - h + 2}L${x} ${base - h - 50}L${x + w / 2 + 12} ${base - h + 2}Z`, roof, SO(dark(roof, 0.25), 1.5));
  s += pth(`M${x - w / 2 - 12} ${base - h + 2}L${x} ${base - h - 50}L${x - 6} ${base - h + 2}Z`, lite(roof, 0.1));
  const win = (wx, wy) => {
    let t = '';
    if (c.lit) t += circ(wx + 8, wy + 9, 26, 'url(#lw)');
    t += rrect(wx, wy, 16, 18, 2, c.lit || c.window, SO(dark(wall, 0.3), 1.5));
    t += stk(`M${wx + 8} ${wy}V${wy + 18}M${wx} ${wy + 9}H${wx + 16}`, dark(wall, 0.25), 1.2);
    return t;
  };
  s += win(x - 38, base - h + 18) + win(x + 20, base - h + 18);
  s += rrect(x - 9, base - 30, 18, 30, 8, dark(roof, 0.05), SO(dark(roof, 0.3), 1.5));
  s += circ(x, base - h - 18, 6, c.lit || c.window, SO(dark(wall, 0.3), 1.2));
  return wrapG(x - w, x + w, s);
}
function greenhouse(x, base, c) {
  const w = 150, h = 54, peak = 38;
  const fr = c.frame;
  let s = '';
  s += rect(x - w / 2, base - 10, w, 10, dark(c.wall, 0.12), SO(dark(c.wall, 0.3), 1.5));
  s += pth(`M${x - w / 2} ${base - 10}V${base - h}L${x} ${base - h - peak}L${x + w / 2} ${base - h}V${base - 10}Z`, c.glass, op(0.75));
  // panes + glints
  let lines = `M${x - w / 2} ${base - h}H${x + w / 2}`;
  for (let i = 1; i < 6; i++) { const px = x - w / 2 + i * w / 6; lines += `M${f(px)} ${base - 10}V${base - h}`; }
  for (let i = 1; i < 4; i++) { const px = x - w / 2 + i * w / 4; const py = base - h - peak * (1 - Math.abs(px - x) / (w / 2)); lines += `M${f(px)} ${base - h}L${f(px)} ${f(py)}`; }
  s += stk(lines, fr, 2);
  s += stk(`M${x - w / 2} ${base - 10}V${base - h}L${x} ${base - h - peak}L${x + w / 2} ${base - h}V${base - 10}`, dark(fr, 0.2), 2.5);
  for (const gx of [x - 52, x - 2, x + 48]) s += pth(`M${gx} ${base - 16}l8 0l-14 -30l-8 0Z`, '#ffffff', op(c.lit ? 0.12 : 0.35));
  // little potted plants inside
  for (const px of [x - 50, x - 20, x + 15, x + 46]) s += circ(px, base - 18, 9, mix(c.green, c.glass, 0.35), op(0.8));
  if (c.lit) s += circ(x + 15, base - 30, 40, 'url(#lw)', op(0.6));
  return wrapG(x - w, x + w, s);
}
function far(z) {
  const c = Z[z], seed = 200 + ZONES.indexOf(z) * 37;
  let defs = '', s = '';
  if (c.lit) defs += glowGrad('lw', c.lit, 0.45);
  // distant rolling hills
  s += pth(wave(352, [[1, 12, 0.4], [2, 9, 2.1], [5, 4, 1.0]], H), mix(c.hill, c.haze, 0.25));
  s += pth(wave(388, [[1, 10, 2.7], [3, 7, 0.3], [7, 3, 4.0]], H), mix(c.hill2, c.haze, 0.15));
  // back tree row (hazier, small)
  const back = [[30, 30], [110, 36], [300, 28], [395, 34], [505, 30], [735, 38], [800, 28], [905, 34]];
  back.forEach(([x, sz], i) => { s += tree(x, 420, sz, seed + i, c, 0.45); });
  s += cottage(228, 446, c);
  s += greenhouse(600, 448, c);
  // nearer tree canopies
  const front = [[70, 62], [395, 54], [470, 44], [790, 66], [930, 46]];
  front.forEach(([x, sz], i) => { s += tree(x, 452, sz, seed + 50 + i, c, 0.22); });
  // hedge line
  const hedge = mix(c.hedge, c.haze, 0.1);
  s += pth(scallop(452, 24, 9, 17, seed + 9, H, 6), dark(hedge, 0.2));
  s += pth(scallop(454, 24, 8, 15, seed + 9, H, 6), hedge);
  s += pth(scallop(458, 24, 6, 12, seed + 9, H, 6), lite(hedge, 0.08));
  s += rect(0, 476, W, H - 476, dark(hedge, 0.06));
  if (z === 'dawn') {
    // morning mist hanging over the hedge
    defs += rad('mi', [['0', '#ffffff', 0.55], ['1', '#ffffff', 0]]);
    for (const [x, y, w] of [[90, 438, 200], [330, 446, 240], [560, 432, 220], [800, 444, 260], [960, 438, 200]]) s += wrapG(x - w / 2, x + w / 2, ell(x, y, w / 2, 26, 'url(#mi)'));
  }
  return svg(W, H, s, defs);
}

// ---------- MID ----------
function leafPath(x, y, len, ang, wid = 0.32) {
  const a = ang * Math.PI / 180, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a) * len * wid, ny = Math.cos(a) * len * wid;
  const mx = (x + ex) / 2, my = (y + ey) / 2;
  return `M${f(x)} ${f(y)}Q${f(mx + nx)} ${f(my + ny)} ${f(ex)} ${f(ey)}Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)}Z`;
}
function flower(z, x, base, top, col, r, scale = 1) {
  col = String(col);
  const c = Z['_' + z] || Z[z], g = c.green, gOut = dark(g, 0.3);
  const bend = (r() - 0.5) * 22 * scale;
  const hx = x + bend, hy = top;
  let s = '';
  // stem + leaves
  s += stk(`M${f(x)} ${f(base)}Q${f(x + bend * 0.1)} ${f((base + top) / 2)} ${f(hx)} ${f(hy)}`, gOut, 6 * scale);
  s += stk(`M${f(x)} ${f(base)}Q${f(x + bend * 0.1)} ${f((base + top) / 2)} ${f(hx)} ${f(hy)}`, g, 3.4 * scale);
  const ly = base - (base - top) * (0.25 + r() * 0.2);
  const lg = z === 'night' ? lite(g, 0.05) : lite(g, 0.08);
  s += pth(leafPath(x + bend * 0.05, ly, 30 * scale, -40 - r() * 20), lg, SO(gOut, 1.6));
  s += pth(leafPath(x + bend * 0.08, ly + 12 * scale, 26 * scale, -140 + r() * 20), lg, SO(gOut, 1.6));
  const out = dark(col, 0.32), sh = dark(col, 0.1), li = lite(col, 0.18);
  const k = scale;
  if (z === 'dawn') {
    // tulip cup (closed, sleepy), slightly nodding
    const t = (r() - 0.5) * 16;
    s += `<g transform="rotate(${f(t)} ${f(hx)} ${f(hy)})">`;
    s += pth(`M${f(hx - 13 * k)} ${f(hy - 20 * k)}Q${f(hx - 16 * k)} ${f(hy + 2 * k)} ${f(hx)} ${f(hy + 4 * k)}Q${f(hx + 16 * k)} ${f(hy + 2 * k)} ${f(hx + 13 * k)} ${f(hy - 20 * k)}L${f(hx + 6 * k)} ${f(hy - 12 * k)}L${f(hx)} ${f(hy - 24 * k)}L${f(hx - 6 * k)} ${f(hy - 12 * k)}Z`, sh, SO(out, 2.2));
    s += pth(`M${f(hx - 7 * k)} ${f(hy - 13 * k)}L${f(hx)} ${f(hy - 24 * k)}L${f(hx + 7 * k)} ${f(hy - 13 * k)}Q${f(hx + 8 * k)} ${f(hy)} ${f(hx)} ${f(hy + 3 * k)}Q${f(hx - 8 * k)} ${f(hy)} ${f(hx - 7 * k)} ${f(hy - 13 * k)}Z`, li);
    s += ell(hx - 3 * k, hy - 12 * k, 1.6 * k, 5 * k, '#ffffff', op(0.45));
    s += '</g>';
  } else if (z === 'noon') {
    // sunflower: ring of soft petals + seed centre (muted, many petals; not a star)
    const R = 17 * k, n = 16;
    for (let i = 0; i < n; i++) { const a = i * 360 / n; s += ell(hx, hy - R * 0.62, 4.6 * k, R * 0.5, i % 2 ? sh : col, ` transform="rotate(${f(a)} ${f(hx)} ${f(hy)})"` + SO(out, 1.4)); }
    s += circ(hx, hy, R * 0.48, c.center, SO(dark(c.center, 0.3), 2));
    s += circ(hx - R * 0.12, hy - R * 0.12, R * 0.28, lite(c.center, 0.15));
    for (let i = 0; i < 5; i++) s += circ(hx + (r() - 0.5) * R * 0.5, hy + (r() - 0.5) * R * 0.5, 1.2 * k, dark(c.center, 0.35));
  } else if (z === 'sunset') {
    // cosmos (8 broad petals) or aster (many thin petals)
    const aster = col === c.flowers[2];
    const R = (aster ? 13 : 15) * k, n = aster ? 18 : 8, t0 = r() * 40;
    for (let i = 0; i < n; i++) {
      const a = t0 + i * 360 / n;
      s += ell(hx, hy - R * 0.55, aster ? 2.4 * k : 6.4 * k, R * 0.5, i % 2 && aster ? sh : col, ` transform="rotate(${f(a)} ${f(hx)} ${f(hy)})"` + SO(out, aster ? 1 : 1.5));
    }
    s += circ(hx, hy, R * 0.24, c.center, SO(dark(c.center, 0.3), 1.4));
  } else {
    // glowing lantern-flower: a drooping paper-lantern bloom with a soft warm halo
    const hy2 = hy + 10 * k;
    s += stk(`M${f(hx)} ${f(hy)}Q${f(hx + 8 * k)} ${f(hy - 6 * k)} ${f(hx + 10 * k)} ${f(hy2 - 10 * k)}`, g, 2.4 * k);
    const lx = hx + 10 * k, lit = r() < 0.55;
    if (!lit) { col = mix(col, c.green, 0.55); }
    else s += circ(lx, hy2 + 3 * k, 24 * k, 'url(#fg)');
    s += pth(`M${f(lx)} ${f(hy2 - 10 * k)}C${f(lx - 15 * k)} ${f(hy2 - 6 * k)} ${f(lx - 13 * k)} ${f(hy2 + 12 * k)} ${f(lx)} ${f(hy2 + 16 * k)}C${f(lx + 13 * k)} ${f(hy2 + 12 * k)} ${f(lx + 15 * k)} ${f(hy2 - 6 * k)} ${f(lx)} ${f(hy2 - 10 * k)}Z`, col, SO(dark(col, 0.42), 1.8));
    s += stk(`M${f(lx)} ${f(hy2 - 9 * k)}Q${f(lx - 6 * k)} ${f(hy2 + 3 * k)} ${f(lx)} ${f(hy2 + 15 * k)}M${f(lx)} ${f(hy2 - 9 * k)}Q${f(lx + 6 * k)} ${f(hy2 + 3 * k)} ${f(lx)} ${f(hy2 + 15 * k)}`, dark(col, 0.18), 1.2);
    if (lit) s += ell(lx - 4 * k, hy2, 2.4 * k, 4.6 * k, c.center, op(0.7));
    s += pth(`M${f(lx - 4 * k)} ${f(hy2 - 10 * k)}L${f(lx + 4 * k)} ${f(hy2 - 10 * k)}L${f(lx)} ${f(hy2 - 14 * k)}Z`, g);
  }
  return wrapG(Math.min(x, hx) - 40 * k, Math.max(x, hx) + 40 * k, s);
}
function fence(c) {
  const col = c.fence, sh = dark(col, 0.1), out = dark(col, 0.32);
  let s = '';
  // two rails
  s += rect(0, 424, W, 9, sh, SO(out, 1.5)) + rect(0, 462, W, 9, sh, SO(out, 1.5));
  for (let i = 0; i < 24; i++) {
    const x = i * 40 + 20, top = 404 + (i % 3 === 1 ? 4 : 0);
    const d = `M${x - 11} 505V${top + 10}L${x} ${top}L${x + 11} ${top + 10}V505Z`;
    s += wrapG(x - 14, x + 14, pth(d, col, SO(out, 2)) + rect(x + 4, top + 10, 6, 505 - top - 10, sh, op(0.8)) + circ(x, top + 18, 1.6, out));
  }
  return s;
}
function trellis(x, c) {
  const w = 112, top = 334, base = 500, col = mix(c.fence, c.trunk, 0.35), out = dark(col, 0.3);
  let s = '';
  const arch = `M${x - w / 2} ${base}V${top + 50}A${w / 2} ${w / 2 - 6} 0 0 1 ${x + w / 2} ${top + 50}V${base}`;
  s += stk(arch, out, 9) + stk(arch, col, 5.5);
  const inner = `M${x - w / 2 + 14} ${base}V${top + 56}A${w / 2 - 14} ${w / 2 - 20} 0 0 1 ${x + w / 2 - 14} ${top + 56}V${base}`;
  s += stk(inner, col, 3, op(0.9));
  let lat = '';
  for (let y = top + 70; y < base; y += 26) lat += `M${x - w / 2} ${y}H${x - w / 2 + 14}M${x + w / 2 - 14} ${y}H${x + w / 2}`;
  s += stk(lat, col, 2.6);
  // climbing vine with small leaves and a few buds
  const r = rng(77);
  let vine = `M${x - w / 2} ${base - 10}`;
  for (let y = base - 10; y > top + 72; y -= 22) vine += `Q${x - w / 2 + (y % 44 ? 10 : -10)} ${y - 11} ${x - w / 2} ${y - 22}`;
  vine += `A${w / 2} ${w / 2 - 6} 0 0 1 ${x + 10} ${top + 4}`;
  s += stk(vine, dark(c.green, 0.15), 2.2);
  const leaves = [];
  for (let i = 0; i < 6; i++) leaves.push([x - w / 2 + (r() - 0.5) * 10, base - 20 - i * 20, i % 2 ? -20 : 200]);
  for (let i = 0; i < 6; i++) { const a = Math.PI * (1 - i / 9); leaves.push([x + Math.cos(a) * (w / 2) * 0.98, top + 50 - Math.sin(a) * (w / 2 - 6), -90 + i * 28]); }
  for (const [lx, ly, a] of leaves) s += pth(leafPath(lx, ly, 14, a), lite(c.green, 0.06), SO(dark(c.green, 0.3), 1.2));
  for (const i of [1, 4, 7, 10]) { const [lx, ly] = leaves[i]; const bc = c.lit ? mix(c.flowers[0], c.green, 0.6) : c.flowers[i % c.flowers.length]; s += circ(lx + 4, ly - 2, 3.6, bc, SO(dark(bc, 0.3), 1.2)); }
  return wrapG(x - w, x + w, s);
}
function wateringCan(x, base, c) {
  const col = c.can, out = dark(col, 0.32), sh = dark(col, 0.12), li = lite(col, 0.2);
  let s = '';
  s += stk(`M${x + 22} ${base - 26}L${x + 56} ${base - 52}`, out, 9) + stk(`M${x + 22} ${base - 26}L${x + 56} ${base - 52}`, col, 5);
  s += pth(`M${x + 50} ${base - 58}l12 -4l6 10l-12 4Z`, sh, SO(out, 2));
  s += stk(`M${x - 18} ${base - 40}C${x - 18} ${base - 72} ${x + 18} ${base - 72} ${x + 18} ${base - 40}`, out, 8) + stk(`M${x - 18} ${base - 40}C${x - 18} ${base - 72} ${x + 18} ${base - 72} ${x + 18} ${base - 40}`, col, 4.5);
  s += rrect(x - 28, base - 46, 56, 46, 10, sh, SO(out, 2.4));
  s += rrect(x - 28, base - 46, 40, 46, 10, col);
  s += rrect(x - 22, base - 40, 8, 26, 4, li, op(0.7));
  s += rect(x - 28, base - 34, 56, 5, dark(col, 0.06), op(0.7));
  return wrapG(x - 40, x + 80, s);
}
function mid(z) {
  const c0 = Z[z], r = rng(500 + ZONES.indexOf(z) * 53);
  // mid layer sits behind the play area: pull everything a little toward the horizon haze
  const c = Object.assign({}, c0, {
    green: mix(c0.green, c0.haze, 0.18), fence: mix(c0.fence, c0.haze, z === 'night' ? 0.15 : 0.32),
    flowers: c0.flowers.map(x => mix(x, c0.haze, z === 'night' ? 0.12 : 0.24)), center: mix(c0.center, c0.haze, 0.15),
    can: mix(c0.can, c0.haze, 0.2), bank: mix(c0.bank, c0.haze, 0.08)
  });
  Z['_' + z] = c;
  let defs = '', s = '';
  if (z === 'night') defs += glowGrad('fg', c.flowerGlow, 0.42);
  const cols = c.flowers;
  // low back bushes behind the fence
  s += pth(scallop(452, 16, 14, 26, 900 + ZONES.indexOf(z), H, 10), mix(c.green, c.haze, 0.25));
  // back flowers peeking over the fence (smaller)
  for (let i = 0; i < 8; i++) { const x = 60 + i * 120 + (r() - 0.5) * 30; s += flower(z, x, 470, 386 + r() * 14, cols[i % cols.length], r, 0.7); }
  s += fence(c);
  s += trellis(700, c);
  // front clumps of tall flowers
  const clumps = [[70, 3], [300, 2], [470, 2], [585, 2], [860, 3]];
  clumps.forEach(([cx, n], j) => {
    for (let i = 0; i < n; i++) { const x = cx + (i - (n - 1) / 2) * 24 + (r() - 0.5) * 8; s += flower(z, x, 496, 342 + r() * 34, cols[(i + j) % cols.length], r, 0.92); }
  });
  s += wateringCan(180, 494, c);
  // front bank of soft grass leading into the lawn tile
  s += pth(wave(482, [[3, 3, 0.5], [8, 2, 1.7]], H), dark(c.bank, 0.12));
  s += pth(wave(486, [[3, 3, 0.9], [8, 2, 2.3]], H), c.bank);
  return svg(W, H, s, defs);
}

// ---------- GROUND ----------
function ground(z) {
  const c = Z[z], r = rng(700 + ZONES.indexOf(z) * 61);
  let defs = '', s = '';
  if (c.worm) defs += glowGrad('gw', c.worm, 0.55);
  defs += linU('lawnG', [['0', c.lawnLite], ['0.14', c.lawn], ['1', c.lawn]], 0, LAWN, 0, GH);
  // dark grass silhouettes behind the blades (backing so the lawn line reads)
  s += pth(scallop(LAWN + 2, 48, 3, 7, 40 + ZONES.indexOf(z), GH, 2), c.lawnDark);
  // opaque lawn band from the lawn line down
  s += rect(0, LAWN, W, GH - LAWN, 'url(#lawnG)');
  // tufts texture (periodic, avoiding puddles)
  const nearPuddle = (x, y, m = 0) => PUDDLES.some(px => ((x - px) / (62 + m)) ** 2 + ((y - PUDDLE_Y) / (16 + m * 0.3)) ** 2 < 1 || ((x - W - px) / (62 + m)) ** 2 + ((y - PUDDLE_Y) / (16 + m * 0.3)) ** 2 < 1 || ((x + W - px) / (62 + m)) ** 2 + ((y - PUDDLE_Y) / (16 + m * 0.3)) ** 2 < 1);
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = 52 + r() * 140;
    if (nearPuddle(x, y, 8)) continue;
    const h = 4 + r() * 5;
    s += wrapG(x - 8, x + 8, stk(`M${f(x - 4)} ${f(y)}L${f(x - 2)} ${f(y - h)}M${f(x)} ${f(y)}L${f(x + 1)} ${f(y - h * 1.2)}M${f(x + 4)} ${f(y)}L${f(x + 4)} ${f(y - h)}`, i % 3 ? c.lawnDark : c.lawnLite, 1.6, op(0.55)));
  }
  // clover patches
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = 70 + r() * 110;
    if (nearPuddle(x, y, 14)) continue;
    const cl = lite(c.lawnDark, 0.08), o = dark(c.lawnDark, 0.2);
    let t = '';
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2.1; t += circ(x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4, 3.4, cl, SO(o, 0.8)); }
    s += wrapG(x - 8, x + 8, t);
  }
  // pebbles
  for (let i = 0; i < 18; i++) {
    const x = r() * W, y = 66 + r() * 120;
    if (nearPuddle(x, y, 12)) continue;
    const rx = 3 + r() * 5, ry = rx * (0.55 + r() * 0.2);
    s += wrapG(x - rx - 2, x + rx + 2, ell(x, y, rx, ry, c.pebble, SO(dark(c.pebble, 0.3), 1.2)) + ell(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, lite(c.pebble, 0.4), op(0.7)));
  }
  // the 4 puddles: flat ellipses ≈110x22 centred at x 120/360/600/840, y 58
  defs += linU('pw', [['0', c.waterDeep], ['0.55', c.water], ['1', lite(c.water, 0.25)]], 0, PUDDLE_Y - 11, 0, PUDDLE_Y + 11);
  for (const px of PUDDLES) {
    let p = '';
    p += ell(px, PUDDLE_Y + 1.5, 58, 13, dark(c.lawnDark, 0.15));            // soft muddy rim
    p += ell(px, PUDDLE_Y, 55, 11, 'url(#pw)');
    p += ell(px + 6, PUDDLE_Y + 3, 34, 4.5, lite(c.water, 0.35), op(0.5));    // sky reflection
    p += stk(`M${px - 38} ${PUDDLE_Y - 4}Q${px - 20} ${PUDDLE_Y - 8} ${px - 2} ${PUDDLE_Y - 7}`, '#ffffff', 2, op(z === 'night' ? 0.35 : 0.6));
    p += stk(`M${px + 26} ${PUDDLE_Y + 5}L${px + 38} ${PUDDLE_Y + 3}`, '#ffffff', 1.6, op(0.4));
    s += p;
  }
  // grass blades and small flowers poking up from y 0..40 (bases just below the lawn line)
  const blades = [];
  for (let x = 0; x < W; x += 5) {
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) blades.push([x + r() * 5, 10 + r() * 24 + (r() < 0.12 ? 8 : 0), (r() - 0.5) * 12, Math.floor(r() * c.blade.length)]);
  }
  blades.sort((a, b) => a[3] - b[3]);
  for (const [x, h, lean, ci] of blades) {
    const tipY = Math.max(1, LAWN - h), w = 2.2 + (h / 40) * 1.6;
    const d = `M${f(x - w)} ${LAWN + 4}Q${f(x - w * 0.4 + lean * 0.3)} ${f(LAWN - h * 0.5)} ${f(x + lean)} ${f(tipY)}Q${f(x + w * 0.5 + lean * 0.3)} ${f(LAWN - h * 0.5)} ${f(x + w)} ${f(LAWN + 4)}Z`;
    s += wrapG(x - w - Math.abs(lean), x + w + Math.abs(lean), pth(d, c.blade[ci]));
  }
  // tiny daisies / buttercups in the grass
  for (let i = 0; i < 16; i++) {
    const x = 20 + i * 60 + (r() - 0.5) * 30, y = 14 + r() * 18;
    let t = stk(`M${f(x)} ${LAWN + 2}L${f(x + 1)} ${f(y)}`, c.blade[3], 1.6);
    if (z === 'night') t += circ(x + 1, y, 3, c.tiny, op(0.7));
    else { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; t += circ(x + 1 + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.1, c.tiny); } t += circ(x + 1, y, 1.8, c.tinyC); }
    s += wrapG(x - 6, x + 6, t);
  }
  // night: glow-worm dots in the grass
  if (c.worm) {
    for (let i = 0; i < 12; i++) {
      const x = 40 + i * 80 + (r() - 0.5) * 40, y = 12 + r() * 26;
      s += wrapG(x - 14, x + 14, circ(x, y, 13, 'url(#gw)') + circ(x, y, 2.2, c.worm) + circ(x - 0.6, y - 0.6, 0.9, '#ffffff', op(0.8)));
    }
  }
  return svg(W, GH, s, defs);
}

// ---------- PARTICLES (32x32 unless noted, centred) ----------
function particles() {
  const P = {};
  P.drop = svg(32, 32, pth('M16 4C19 10 23 15 23 20A7 7 0 0 1 9 20C9 15 13 10 16 4Z', '#cfe3f6', SO('#8eaed0', 1.6)) + pth('M13 17Q13 13 15.5 10', 'none', SO('#ffffff', 1.8)) + circ(19, 22, 1.4, '#ffffff', op(0.7)));
  P.streak = svg(8, 48, `<defs>${linU('st', [['0', '#e4f0fb', 0], ['0.6', '#e4f0fb', 0.7], ['1', '#ffffff', 0.95]], 0, 2, 0, 46)}</defs>` + rrect(2.8, 2, 2.4, 44, 1.2, 'url(#st)'));
  P.ripple = svg(32, 32, ell(16, 16, 13, 5, 'none', SO('#e8f2fb', 1.8) + op(0.85)) + ell(16, 16, 8, 3, 'none', SO('#ffffff', 1.2) + op(0.6)));
  let sp = '';
  for (let i = 0; i < 5; i++) { const a = Math.PI * (1.1 + i * 0.2); const x = 16 + Math.cos(a) * 10, y = 22 + Math.sin(a) * 12; sp += pth(`M${f(x)} ${f(y - 3)}C${f(x + 2)} ${f(y)} ${f(x + 2)} ${f(y + 2)} ${f(x)} ${f(y + 2.4)}C${f(x - 2)} ${f(y + 2)} ${f(x - 2)} ${f(y)} ${f(x)} ${f(y - 3)}Z`, '#e2eefa', SO('#9fbcd9', 1)); }
  P.splash = svg(32, 32, ell(16, 25, 10, 2.6, '#d8e8f6', op(0.8)) + stk('M8 24Q10 18 12 23M24 24Q22 18 20 23', '#cfe3f6', 1.6) + sp);
  P.shard = svg(32, 32, `<defs>${linU('sh', [['0', '#ffc8de'], ['0.5', '#c6f5e2'], ['1', '#bfe0ff']], 6, 8, 26, 24)}</defs>` + pth('M7 12Q16 4 26 10Q22 18 25 25Q14 22 8 26Q11 18 7 12Z', 'url(#sh)', SO('#ffffff', 1.4) + op(0.85)) + stk('M11 13Q16 10 21 12', '#ffffff', 1.6, op(0.9)));
  P.sparkle = svg(32, 32, pth(twinkle(16, 16, 14, 0.2), '#ffffff', SO('#fff6d8', 0.8)) + circ(16, 16, 3, '#ffffff'));
  P.petal = svg(32, 32, pth('M6 18C9 8 21 5 27 10C25 18 15 26 6 18Z', '#f2b3c6', SO('#c97d97', 1.6)) + pth('M9 17C13 13 19 11 24 11', 'none', SO('#fbd9e3', 1.6)));
  P.leaf = svg(32, 32, pth(leafPath(5, 26, 26, -45, 0.36), '#d9964e', SO('#8e6a3a', 1.6)) + pth('M8 23L20 11', 'none', SO('#a8b86a', 1.4)) + pth(leafPath(9, 22, 9, -45, 0.4), '#b9b25e', op(0.7)));
  P.mist = svg(64, 32, `<defs>${rad('ms', [['0', '#ffffff', 0.7], ['0.6', '#ffffff', 0.3], ['1', '#ffffff', 0]])}</defs>` + ell(32, 16, 31, 14, 'url(#ms)') + ell(20, 14, 16, 9, 'url(#ms)', op(0.8)) + ell(44, 18, 16, 8, 'url(#ms)', op(0.7)));
  P.glow = svg(32, 32, `<defs>${rad('gl', [['0', '#e6ff9e', 1], ['0.25', '#c9f57a', 0.75], ['0.6', '#a8e86a', 0.25], ['1', '#a8e86a', 0]])}</defs>` + circ(16, 16, 15, 'url(#gl)') + circ(16, 16, 3, '#f4ffd0'));
  P.star = svg(32, 32, pth(star5(16, 16.8, 13, 5.6), '#fff6cf', SO('#e8d79a', 1.4)) + circ(13.5, 13, 2, '#ffffff', op(0.9)));
  P.puff = svg(32, 32, `<g fill="#cfe3f7">${circ(11, 18, 8)}${circ(20, 18, 9)}${circ(16, 12, 8)}</g><g fill="#ffffff">${circ(11, 17, 6.6)}${circ(20, 16.6, 7.4)}${circ(15.6, 11, 6.6)}</g>` + ell(13, 9, 3, 1.8, '#ffffff'));
  // trim the puff's outer edge softly so it never touches the viewBox edge
  return P;
}

// ---------- write everything ----------
const pal = {};
for (const z of ZONES) {
  write(`levels/${z}/sky.svg`, sky(z));
  write(`levels/${z}/far.svg`, far(z));
  write(`levels/${z}/mid.svg`, mid(z));
  write(`levels/${z}/ground.svg`, ground(z));
  const c = Z[z];
  pal[z] = { skyTop: c.skyTop, skyBottom: c.skyBottom, lawn: c.lawn, lawnDark: c.lawnDark, haze: c.haze };
}
const P = particles();
for (const [k, v] of Object.entries(P)) write(`particles/${k}.svg`, v);
fs.writeFileSync(path.join(__dirname, 'palette.json'), JSON.stringify(pal, null, 2) + '\n');
console.log(`wrote ${ZONES.length * 4} level layers + ${Object.keys(P).length} particles to ${OUT}`);
