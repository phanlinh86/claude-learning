// Environment art generator for Pip's Oasis Glow (DESIGN.md §2–§4 "Environment", "Particles").
// Writes game/assets/default/levels/<chapter>/{sky,far,floor,near,burrow_back,burrow_front}.svg,
// levels/palette.json and particles/*.svg. 100% original, deterministic (seeded RNG).
// Chapters: spring (morning), palms (noon), dunes (sunset), night (starlit).
// Usage: node tools/art-environment/gen.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../game/assets/default');
const LV = path.join(ROOT, 'levels');
const PT = path.join(ROOT, 'particles');
const W = 1920; // width of the tileable layers (stage x 480 = file x 960)

// ---------- helpers ----------
function RNG(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()), pick: arr => arr[Math.floor(next() * arr.length)] };
}
const f = n => (Math.round(n * 10) / 10).toString();
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + '</svg>\n';
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units = '') =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units ? ` gradientUnits="${units}"` : ''}>${stops(s)}</linearGradient>`;
const rad = (id, s, cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// periodic (tileable) line: y = base + sum a*sin(2πkx/W + p), k integer
function wave(base, terms, step = 16, width = W) {
  const pts = [];
  for (let x = 0; x <= width; x += step) {
    let y = base;
    for (const [a, k, p] of terms) y += a * Math.sin((2 * Math.PI * k * x) / width + p);
    pts.push([x, y]);
  }
  return pts;
}
// closed shape: a line on top, filled down to `bottom`; extended 2px past each edge so tiles overlap cleanly
function ridge(pts, bottom, attrs) {
  let d = `M-2,${f(bottom)}L-2,${f(pts[0][1])}`;
  for (const [x, y] of pts) d += `L${f(x)},${f(y)}`;
  d += `L${W + 2},${f(pts[pts.length - 1][1])}L${W + 2},${f(bottom)}Z`;
  return `<path d="${d}" ${attrs}/>`;
}
// draw something near a tile edge twice so the tile wraps (fn called once, copy shifted by ±W)
function tile(x, r, fn) {
  const one = fn(x);
  let s = one;
  if (x - r < 0) s += `<g transform="translate(${W},0)">${one}</g>`;
  if (x + r > W) s += `<g transform="translate(${-W},0)">${one}</g>`;
  return s;
}
function leafD(L, w) {
  return `M0,0C${f(-w)},${f(-L * 0.3)} ${f(-w * 0.7)},${f(-L * 0.8)} 0,${f(-L)}C${f(w * 0.7)},${f(-L * 0.8)} ${f(w)},${f(-L * 0.3)} 0,0Z`;
}
function leaf(x, y, rot, L, w, fill, stroke, vein = true) {
  return `<g transform="translate(${f(x)},${f(y)}) rotate(${f(rot)})"><path d="${leafD(L, w)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="3" stroke-linejoin="round"` : ''}/>` +
    (vein && stroke ? `<path d="M0,${f(-L * 0.08)}Q${f(w * 0.12)},${f(-L * 0.5)} 0,${f(-L * 0.88)}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity=".55"/>` : '') + '</g>';
}
function tuft(x, y, h, col, op, sw = 2.2) {
  const b = [[-0.5, -0.35], [0, 0], [0.45, 0.3], [-0.2, -0.1]];
  let d = '';
  for (const [dx, lean] of b) d += `M${f(x + dx * h * 0.4)},${f(y)}q${f(lean * h * 0.3)},${f(-h * 0.5)} ${f(lean * h * 0.7)},${f(-h * (0.75 + Math.abs(dx) * 0.2))}`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(sw)}" stroke-linecap="round" opacity="${op}"/>`;
}
function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  return s.length;
}

// ---------- date palm pieces ----------
// A frond in local space pointing +x, drooping toward +y: a feathery tapered blade with saw-tooth leaflet edges.
function frondD(len, width, droop, teeth = 9) {
  const P = t => { // quadratic bezier (0,0) (0.5len,-0.22len) (len, droop*len)
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [b * len * 0.5 + c * len, b * -len * 0.22 + c * droop * len];
  };
  const N = teeth * 2;
  const up = [], dn = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = P(t), [x2, y2] = P(Math.min(1, t + 0.01));
    let nx = -(y2 - y), ny = x2 - x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) * (1 - 0.35 * t) * (i % 2 ? 0.55 : 1);
    // leaflets sweep toward the tip: offset the tooth forward a little
    const fw = i % 2 ? 0 : width * 0.35;
    const [tx, ty] = [(x2 - x) / 0.01 / len, (y2 - y) / 0.01 / len];
    up.push([x + nx * w + tx * fw, y + ny * w + ty * fw]);
    dn.push([x - nx * w + tx * fw, y - ny * w + ty * fw]);
  }
  let d = 'M0,0';
  for (const [x, y] of up) d += `L${f(x)},${f(y)}`;
  for (let i = dn.length - 1; i >= 0; i--) d += `L${f(dn[i][0])},${f(dn[i][1])}`;
  return d + 'Z';
}
function rachisD(len, droop) {
  return `M0,0Q${f(len * 0.5)},${f(-len * 0.22)} ${f(len)},${f(droop * len)}`;
}
// frond at (x,y): side ±1 (mirror), dir degrees (0 = horizontal outward, negative = up)
function frond(x, y, side, dir, len, width, droop, fill, o = {}) {
  let s = `<g transform="translate(${f(x)},${f(y)}) scale(${side},1) rotate(${f(dir)})">`;
  s += `<path d="${frondD(len, width, droop, o.teeth || 9)}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 3}" stroke-linejoin="round"` : ''}/>`;
  if (o.hi) s += `<path d="${frondD(len * 0.92, width * 0.42, droop, o.teeth || 9)}" fill="${o.hi}" opacity=".55" transform="translate(${f(len * 0.03)},${f(-width * 0.25)})"/>`;
  if (o.rib) s += `<path d="${rachisD(len * 0.97, droop)}" fill="none" stroke="${o.rib}" stroke-width="${o.ribW || 3}" stroke-linecap="round"/>`;
  return s + '</g>';
}
// a whole date palm: trunk from (x, y) up to (x+lean, y-h), crown of fronds
function palm(x, y, h, lean, k, c, o = {}) {
  const tx = x + lean, ty = y - h, cx = x + lean * 0.35, cy = y - h * 0.55;
  const w0 = 9 * k, w1 = 5.5 * k;
  let s = '';
  // trunk (tapered, slight curve)
  s += `<path d="M${f(x - w0)},${f(y)}Q${f(cx - w0 * 0.9)},${f(cy)} ${f(tx - w1)},${f(ty)}L${f(tx + w1)},${f(ty)}Q${f(cx + w0 * 0.9)},${f(cy)} ${f(x + w0)},${f(y)}Z" fill="${c.trunk}"${c.trunkLine ? ` stroke="${c.trunkLine}" stroke-width="${f(2.5)}" stroke-linejoin="round"` : ''}/>`;
  if (c.band) {
    let d = '';
    for (let t = 0.08; t < 0.95; t += 0.085) {
      const bx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx, by = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ty;
      const ww = w0 + (w1 - w0) * t;
      d += `M${f(bx - ww * 0.9)},${f(by - 2 * k)}q${f(ww * 0.9)},${f(4 * k)} ${f(ww * 1.8)},0`;
    }
    s += `<path d="${d}" fill="none" stroke="${c.band}" stroke-width="${f(2 * k)}" stroke-linecap="round" opacity=".8"/>`;
  }
  // dates
  if (c.dates) for (const [dx, dy] of [[-6, 6], [5, 7], [0, 11], [-9, 12], [8, 13], [-3, 16], [4, 17]]) s += `<circle cx="${f(tx + dx * k)}" cy="${f(ty + dy * k)}" r="${f(2.8 * k)}" fill="${c.dates}"/>`;
  // fronds (back ones darker)
  const F = o.fronds || [[-1, 10, 1.0], [1, 6, 1.0], [-1, -25, 0.85], [1, -30, 0.9], [-1, 40, 0.8], [1, 42, 0.8], [1, -62, 0.6], [-1, -66, 0.6]];
  const len = 58 * k, wid = 9 * k;
  F.forEach(([side, dir, l], i) => {
    const col = i >= 6 ? c.frondBack || c.frond : i % 2 ? c.frond : c.frond2 || c.frond;
    s += frond(tx, ty, side, dir, len * l, wid * (0.7 + l * 0.3), 0.32, col, o.detail ? { rib: c.rib, ribW: 2 * k, hi: c.hi, teeth: 8 } : { teeth: 8 });
  });
  s += `<circle cx="${f(tx)}" cy="${f(ty)}" r="${f(5 * k)}" fill="${c.frond2 || c.frond}"/>`;
  return s;
}

// ======================================================================
// CHAPTER DEFINITIONS
// ======================================================================
const CH = {
  spring: {
    pal: { sky: '#d5e6ec', ground: '#ebddb9', accent: '#7fb7b9', banner: '#5a4632' },
    sky: [[0, '#a6cfe6'], [0.42, '#d5e6ec'], [0.72, '#f8dccc'], [1, '#f6c6b6']],
    sun: { x: 300, y: 128, r: 34, core: '#fff6ea', halo: '#ffe8d6' },
    clouds: '#ffffff',
    far: {
      dunes: [['#d7d2e6', 150, [[14, 2, 0.4], [9, 5, 1.7], [4, 11, 0.2]]], ['#e2d3d6', 172, [[10, 3, 1.1], [6, 7, 0.4], [3, 13, 2.0]]]],
      palms: { trunk: '#b9bfd0', frond: '#aeb9c9', frond2: '#b6c0cf' }, palmBase: 182, palmN: 7, palmK: 0.7,
      haze: '#f6ead8',
    },
    floor: {
      horizon: 196, back: '#cdbf98', sand: [[0, '#eee2c2'], [0.45, '#e9dab6'], [1, '#dfcda4']],
      hillTop: '#b6c99a', hillGrass: '#97ae78', hillShade: '#d6c69c',
      wet: '#c8b48a', water: [[0, '#b7e0df'], [1, '#8cc8cc']], shimmer: '#eefaf6', waterLine: '#7aa9a8',
      patch: ['#f5ecd2', '#d6c49a'], ripple: '#d3c197', tuft: '#a3ad7c', pebble: '#cfc0a0', fd: '#a99a74',
      palm: { trunk: '#b08d62', trunkLine: '#8a6c48', band: '#93744f', frond: '#8fa86f', frond2: '#9cb37b', frondBack: '#7f9862', dates: '#b07a45', rib: '#6f8752', hi: '#b9c996' },
      reeds: '#8ea36c', reedHead: '#9b7c58', lotus: '#f2b4c4',
    },
    near: { frond: '#7f9b62', frond2: '#8ea96f', stroke: '#62794b', rib: '#5d7446', hi: '#a9be88', rock: '#c9b08a', rockSh: '#a88f6b', rockLine: '#86704f', reed: '#7e9660', reedHead: '#8f7050', lotus: '#f0aec0' },
  },
  palms: {
    pal: { sky: '#a6d8f0', ground: '#edd59f', accent: '#5f9f8c', banner: '#4c3e26' },
    sky: [[0, '#66b7e6'], [0.55, '#a6d8f0'], [1, '#e8f4ee']],
    sun: { x: 210, y: 70, r: 28, core: '#fffdf2', halo: '#fffbe6' },
    clouds: '#ffffff',
    far: {
      dunes: [['#e6d6b4', 178, [[8, 2, 0.9], [5, 6, 0.2]]]],
      grove: true,
      palms: { trunk: '#95a99a', frond: '#8db3a2', frond2: '#9cbcad' },
      palms2: { trunk: '#7f9a8a', frond: '#7aa592', frond2: '#86ae9c' },
      haze: '#eef6ea',
    },
    floor: {
      horizon: 198, back: '#d7bd88', sand: [[0, '#f1dcaa'], [0.45, '#ecd19b'], [1, '#e4c48b']],
      hillTop: '#b2c18e', hillGrass: '#97ad78', hillShade: '#dcc18e',
      wet: '#c9b084', water: [[0, '#a5e2da'], [1, '#76c6c4']], shimmer: '#f2fff9', waterLine: '#6aa7a3',
      patch: ['#f6e6bf', '#dcbf88'], ripple: '#d9bc85', tuft: '#a4a46f', pebble: '#d2bd92', fd: '#b39868',
      shade: '#c9ac78',
      palm: { trunk: '#a8855a', trunkLine: '#836641', band: '#8c6d47', frond: '#7f9e68', frond2: '#8ead75', frondBack: '#71905c', dates: '#a8693a', rib: '#627d4b', hi: '#adc48f' },
      reeds: '#8ba068', reedHead: '#9b7c58', lotus: '#f2b4c4',
    },
    near: { frond: '#6f9460', frond2: '#7fa36c', stroke: '#557548', rib: '#4f6d42', hi: '#9fbe88', rock: '#cfb489', rockSh: '#ad936a', rockLine: '#8a724f', trunk: '#a8855a', trunkLine: '#7f6240', band: '#8a6b45' },
  },
  dunes: {
    pal: { sky: '#eea58e', ground: '#ecb68f', accent: '#c26f80', banner: '#5a2c44' },
    sky: [[0, '#6f5d9c'], [0.32, '#b875a0'], [0.62, '#ee9c88'], [0.85, '#f8c495'], [1, '#fbd5a6']],
    sun: { x: 800, y: 160, r: 44, core: '#ffe4bf', halo: '#ffd0a2' },
    clouds: '#f6b39a', strips: true,
    far: {
      dunes: [['#c98aa0', 120, [[22, 2, 0.4], [10, 3, 2.1], [6, 7, 0.9]]], ['#dc9a98', 150, [[18, 2, 2.4], [9, 5, 0.6], [4, 9, 1.4]]], ['#e8ae98', 180, [[12, 3, 0.2], [7, 7, 2.2]]]],
      mesas: '#b77d97', sharp: true,
      palms: { trunk: '#b97f8f', frond: '#b07a8e', frond2: '#ba8696' }, palmBase: 186, palmN: 3, palmK: 0.6,
      haze: '#f7c6a4',
    },
    floor: {
      horizon: 200, back: '#dc9f86', sand: [[0, '#f2c39c'], [0.45, '#edb690'], [1, '#e3a684']],
      hillTop: '#efc49e', hillGrass: '#b9a27f', hillShade: '#e0a888', crest: '#f8d6b4',
      wet: '#cf977e', water: [[0, '#e8b7bf'], [1, '#c99bbd']], shimmer: '#fff0e6', waterLine: '#a87a98',
      patch: ['#f7d2b0', '#d99a80'], ripple: '#d89a7f', tuft: '#b49a76', pebble: '#d7a88f', fd: '#b9766e',
      windRipples: true,
      palm: { trunk: '#9e6d5c', trunkLine: '#7a4f45', band: '#835a4c', frond: '#8f8a66', frond2: '#9d9872', frondBack: '#7f7a5c', dates: '#9a5a3e', rib: '#6f6a4e', hi: '#bdb48d' },
      reeds: '#a09272', reedHead: '#8f6450', lotus: '#f4b2bf',
    },
    near: { frond: '#8c8460', frond2: '#9b9269', stroke: '#6c6448', rib: '#655d43', hi: '#b8ad86', rock: '#d49a80', rockSh: '#b47c69', rockLine: '#8f5e52', agave: '#93a08a', agaveSh: '#72806d' },
  },
  night: {
    pal: { sky: '#2f3570', ground: '#5d5f98', accent: '#a8b4ec', banner: '#f2efff' },
    sky: [[0, '#1f2452'], [0.45, '#2e3570'], [0.8, '#44488a'], [1, '#56569a']],
    moon: { x: 612, y: 84 },
    far: {
      dunes: [['#3c4180', 150, [[16, 2, 0.4], [9, 5, 1.7], [4, 11, 0.2]]], ['#464b8c', 178, [[10, 3, 1.1], [6, 7, 0.4], [3, 13, 2.0]]]],
      palms: { trunk: '#353a76', frond: '#343a78', frond2: '#3a407e' }, palmBase: 186, palmN: 6, palmK: 0.72,
      huts: true,
      haze: '#5d5ea0',
    },
    floor: {
      horizon: 198, back: '#4f5290', sand: [[0, '#6b6ca8'], [0.45, '#6366a0'], [1, '#585c96']],
      hillTop: '#55688e', hillGrass: '#4c5f86', hillShade: '#5e619c',
      wet: '#4b4e8a', water: [[0, '#3d4682'], [1, '#2f3672']], shimmer: '#c9d0f4', waterLine: '#2a3066',
      patch: ['#7576b0', '#55588f'], ripple: '#5a5d98', tuft: '#5d6a94', pebble: '#7c7cb2', fd: '#41457e',
      moonPath: true,
      palm: { trunk: '#5a4f78', trunkLine: '#3f3860', band: '#4a4268', frond: '#3f5a78', frond2: '#4a6684', frondBack: '#36506e', dates: '#6a4f6e', rib: '#2f4762', hi: '#6782a0' },
      reeds: '#4d6283', reedHead: '#5a4e74', lotus: '#d9a6c8',
    },
    near: { frond: '#33506c', frond2: '#3d5b78', stroke: '#283f58', rib: '#25394f', hi: '#58779a', rock: '#5b5c92', rockSh: '#4a4b80', rockLine: '#36376a', reed: '#3f5675', reedHead: '#4c4468', lotus: '#d9a6c8' },
  },
};

// ======================================================================
// SKY (960×540, opaque)
// ======================================================================
function sky(c, seed) {
  const rng = RNG(seed);
  let defs = lin('g', c.sky);
  let b = `<rect width="960" height="540" fill="url(#g)"/>`;
  if (c.sun) {
    const S = c.sun;
    defs += rad('sun', [[0, S.halo, 0.85], [0.3, S.halo, 0.45], [1, S.halo, 0]]);
    b += `<circle cx="${S.x}" cy="${S.y}" r="${S.r * 6}" fill="url(#sun)"/><circle cx="${S.x}" cy="${S.y}" r="${S.r}" fill="${S.core}" opacity=".95"/>`;
  }
  if (c.moon) {
    const M = c.moon;
    defs += rad('mh', [[0, '#cfd2ff', 0.4], [1, '#cfd2ff', 0]]);
    // a faint milky band
    b += `<path d="M-20,250 Q300,60 980,20 L980,90 Q340,130 -20,330Z" fill="#6a6db0" opacity=".18"/>`;
    for (let i = 0; i < 120; i++) {
      const x = rng.range(0, 960), y = rng.range(4, 330), r = rng.range(0.7, 1.9) * (y < 200 ? 1 : 0.8);
      b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${rng.next() < 0.3 ? '#dfe3ff' : '#f6f3ea'}" opacity="${f(rng.range(0.35, 0.9) * (1 - y / 520))}"/>`;
    }
    // a few soft 4-point stars (not 5-point: no clash with gameplay sparkles)
    for (const [x, y, r] of [[120, 60, 7], [330, 130, 5], [560, 50, 6], [880, 210, 5], [60, 230, 4], [650, 170, 4]])
      b += `<path d="M${x},${y - r}Q${x + r * 0.18},${y - r * 0.18} ${x + r},${y}Q${x + r * 0.18},${y + r * 0.18} ${x},${y + r}Q${x - r * 0.18},${y + r * 0.18} ${x - r},${y}Q${x - r * 0.18},${y - r * 0.18} ${x},${y - r}Z" fill="#f4f1ff" opacity=".85"/>`;
    b += `<circle cx="${M.x}" cy="${M.y}" r="130" fill="url(#mh)"/>`;
    // crescent: outer arc r 34, inner arc r 28 (a shape, not a sky-coloured disc, so it works on any gradient)
    b += `<path d="M${M.x + 8},${M.y - 33} A34 34 0 1 0 ${M.x + 8},${M.y + 33} A28 28 0 1 1 ${M.x + 8},${M.y - 33}Z" fill="#f1ecd8"/>`;
    b += `<circle cx="${M.x - 20}" cy="${M.y + 2}" r="3.5" fill="#ddd6bf"/><circle cx="${M.x - 12}" cy="${M.y + 18}" r="2.5" fill="#ddd6bf"/>`;
    // thin night clouds
    for (const [x, y, w] of [[90, 300, 220], [560, 260, 260], [760, 330, 170]]) b += `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#5b5c9e" opacity=".55"/><rect x="${x + 36}" y="${y + 14}" width="${f(w * 0.55)}" height="7" rx="3.5" fill="#5b5c9e" opacity=".4"/>`;
  }
  if (c.clouds && !c.strips) {
    const cloud = (x, y, k, op) => `<g opacity="${op}" fill="${c.clouds}"><ellipse cx="${x}" cy="${y}" rx="${70 * k}" ry="${17 * k}"/><circle cx="${x - 30 * k}" cy="${y - 9 * k}" r="${19 * k}"/><circle cx="${x + 6 * k}" cy="${y - 18 * k}" r="${26 * k}"/><circle cx="${x + 40 * k}" cy="${y - 6 * k}" r="${16 * k}"/></g>`;
    b += cloud(170, 120, 1.1, 0.72) + cloud(470, 80, 0.8, 0.55) + cloud(870, 230, 0.9, 0.5) + cloud(90, 290, 0.7, 0.4) + cloud(620, 300, 0.6, 0.35);
  }
  if (c.strips) for (const [x, y, w] of [[90, 120, 240], [610, 95, 300], [760, 230, 170], [300, 250, 200], [40, 300, 160]])
    b += `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="${c.clouds}" opacity=".6"/><rect x="${x + 40}" y="${y + 14}" width="${f(w * 0.6)}" height="7" rx="3.5" fill="${c.clouds}" opacity=".45"/>`;
  return svg(960, 540, b, defs);
}

// ======================================================================
// FAR (1920×540, transparent, tileable)
// ======================================================================
function far(c, seed) {
  const F = c.far, rng = RNG(seed);
  let b = '';
  // mesas / buttes (dunes chapter)
  if (F.mesas) for (const [x, w, top] of [[300, 160, 104], [1120, 220, 96], [1560, 110, 118]])
    b += tile(x, w, X => `<path d="M${X - w / 2 - 30},300 L${X - w / 2},${top + 8} Q${X - w / 2 + 4},${top} ${X - w / 2 + 14},${top} L${X + w / 2 - 14},${top} Q${X + w / 2 - 4},${top} ${X + w / 2},${top + 8} L${X + w / 2 + 34},300Z" fill="${F.mesas}"/>` +
      `<path d="M${X - w / 2 + 6},${top + 16} H${X + w / 2 - 4}" stroke="#c991a6" stroke-width="3" opacity=".6"/>`);
  // dune layers back → front
  F.dunes.forEach(([col, base, terms], i) => {
    b += ridge(wave(base, terms), 320, `fill="${col}"`);
    if (F.sharp) {
      // lit/shadow split on sunset dunes: a lighter crest band on the sun side
      const pts = wave(base, terms);
      let d = '';
      for (let j = 1; j < pts.length; j++) if (pts[j][1] < pts[j - 1][1] - 0.4) d += `M${f(pts[j - 1][0])},${f(pts[j - 1][1] + 1.5)}L${f(pts[j][0])},${f(pts[j][1] + 1.5)}`;
      b += `<path d="${d}" stroke="#f8c9b4" stroke-width="3" stroke-linecap="round" opacity=".55" fill="none"/>`;
    }
    if (i === 0 && F.palms && !F.grove) {
      // little palm groups on the first ridge
      for (let k = 0; k < F.palmN; k++) {
        const x = (k + 0.5) * (W / F.palmN) + rng.range(-80, 80), n = rng.int(1, 3);
        for (let m = 0; m < n; m++) {
          const px = x + m * 26 * F.palmK + rng.range(-6, 6), h = rng.range(48, 70) * F.palmK * 1.4, lean = rng.range(-12, 12);
          b += tile(px, 70, X => palm(X, F.palmBase - 10 + m * 3, h, lean, F.palmK, F.palms));
        }
      }
    }
  });
  // palm grove (palms chapter): two rows of silhouettes
  if (F.grove) {
    for (let k = 0; k < 22; k++) {
      const x = k * (W / 22) + rng.range(-25, 25), h = rng.range(70, 110), lean = rng.range(-14, 14);
      b += tile(x, 80, X => palm(X, 200, h, lean, 0.85, F.palms));
    }
    b += ridge(wave(192, [[4, 3, 0.4], [3, 8, 1.2]]), 320, `fill="#c9d3b8"`);
    for (let k = 0; k < 14; k++) {
      const x = k * (W / 14) + rng.range(-30, 30), h = rng.range(60, 92), lean = rng.range(-16, 16);
      b += tile(x, 90, X => palm(X, 210, h, lean, 1.0, F.palms2));
    }
    // low bushes at the base of the grove
    let bush = '';
    for (let k = 0; k < 40; k++) { const x = k * (W / 40) + rng.range(-12, 12), r = rng.range(12, 20); bush += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(206 - r * 0.2)}" r="${f(r)}"/>`); }
    b += `<g fill="#a9bf9c">${bush}</g><rect x="-2" y="204" width="${W + 4}" height="116" fill="#a9bf9c"/>`;
  }
  // night: a few small adobe huts with dim warm windows
  if (F.huts) for (const [x, w, h] of [[420, 46, 30], [470, 30, 22], [1380, 52, 32]])
    b += tile(x, w, X => `<path d="M${X - w / 2},182 V${182 - h + 6} Q${X - w / 2},${182 - h} ${X - w / 2 + 6},${182 - h} H${X + w / 2 - 6} Q${X + w / 2},${182 - h} ${X + w / 2},${182 - h + 6} V182Z" fill="#3a3f7e"/>` +
      `<rect x="${X - 5}" y="${182 - h * 0.62}" width="9" height="9" rx="2" fill="#e8b48c" opacity=".85"/>`);
  // atmospheric haze toward the horizon
  b += `<rect x="-2" y="100" width="${W + 4}" height="220" fill="url(#hz)"/>`;
  return svg(W, 540, b, lin('hz', [[0, F.haze, 0], [1, F.haze, 0.5]]));
}

// ======================================================================
// FLOOR (1920×540, tileable; centre hill with the spring pool at (960,146))
// ======================================================================
const PX = 960, PY = 146, PRX = 168, PRY = 32;
function hillY(x, base) {
  const u = Math.abs(x - PX);
  const t = 1 - smooth((u - 185) / 175);
  return base - (base - 98) * t;
}
function floor(c, seed) {
  const F = c.floor, rng = RNG(seed);
  const H = F.horizon;
  const edge = wave(H, [[2, 3, 0.3], [1.5, 7, 1], [1, 13, 0.4]]).map(([x, y]) => [x, Math.min(y, hillY(x, y))]);
  let defs = lin('sand', F.sand) + lin('w', F.water) + lin('fd', [[0, F.fd, 0], [1, F.fd, 0.32]]) +
    lin('hl', [[0, F.hillTop, 1], [1, F.hillTop, 0]]);
  // back lip, then the main ground
  let b = ridge(edge, 540, `fill="${F.back}"`);
  b += ridge(edge.map(([x, y]) => [x, y + 5]), 540, 'fill="url(#sand)"');
  // hill: grassy/crest cap that fades down the slope, plus side shading
  b += `<path d="M${PX - 370},${H + 5} ${edge.filter(([x]) => x >= PX - 370 && x <= PX + 370).map(([x, y]) => `L${f(x)},${f(y + 5)}`).join('')} L${PX + 370},${H + 5} Q${PX},${H - 20} ${PX - 370},${H + 5}Z" fill="url(#hl)" opacity=".9"/>`;
  b += `<path d="M${PX + 205},112 Q${PX + 290},140 ${PX + 362},${H + 4} Q${PX + 270},${H - 2} ${PX + 190},172Z" fill="${F.hillShade}" opacity=".7"/>`;
  b += `<path d="M${PX - 205},112 Q${PX - 290},140 ${PX - 362},${H + 4} Q${PX - 270},${H - 2} ${PX - 190},172Z" fill="${F.hillShade}" opacity=".35"/>`;
  if (F.crest) b += `<path d="${edge.filter(([x]) => x >= PX - 350 && x <= PX + 350).map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y + 6)}`).join('')}" fill="none" stroke="${F.crest}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  // grass fringe along the hill top edge
  for (let i = 0; i < 70; i++) {
    const x = PX - 340 + rng.range(0, 680), y = hillY(x, H) + 7 + rng.range(0, 6);
    b += tuft(x, y, rng.range(8, 14), F.hillGrass, 0.85, 2.4);
  }
  // play band texture: wide faint patches, wind ripples, pebbles, dry tufts (all low contrast)
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, W), y = rng.range(H + 40, 520), rx = rng.range(100, 230) * (0.6 + (y - H) / 420), ry = rx * rng.range(0.14, 0.2);
    const col = rng.next() < 0.5 ? F.patch[0] : F.patch[1];
    b += tile(x, rx, X => `<ellipse cx="${f(X)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${col}" opacity=".32"/>`);
  }
  if (F.shade) // dappled palm shade (palms chapter): soft blobs, very low contrast
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, W), y = rng.range(H + 20, 500), k = 0.6 + (y - H) / 380, rx = rng.range(60, 120) * k;
      b += tile(x, rx + 30, X => `<g fill="${F.shade}" opacity=".3"><ellipse cx="${f(X)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.2)}"/><ellipse cx="${f(X + rx * 0.7)}" cy="${f(y + rx * 0.06)}" rx="${f(rx * 0.45)}" ry="${f(rx * 0.12)}"/><ellipse cx="${f(X - rx * 0.75)}" cy="${f(y - rx * 0.04)}" rx="${f(rx * 0.4)}" ry="${f(rx * 0.1)}"/></g>`);
    }
  const nRip = F.windRipples ? 70 : 34;
  for (let i = 0; i < nRip; i++) {
    const y = rng.range(H + 24, 520), x = rng.range(0, W), k = 0.6 + (y - H) / 380, l = rng.range(70, 180) * k, a = rng.range(2, 5) * k;
    b += tile(x, l, X => `<path d="M${f(X)},${f(y)}q${f(l * 0.25)},${f(-a)} ${f(l * 0.5)},0t${f(l * 0.5)},0" fill="none" stroke="${F.ripple}" stroke-width="${f(1.6 + k)}" stroke-linecap="round" opacity="${F.windRipples ? '.55' : '.45'}"/>`);
  }
  for (let i = 0; i < 30; i++) {
    const x = rng.range(0, W), y = rng.range(H + 26, 520), k = 0.6 + (y - H) / 380, r = rng.range(2.5, 5) * k;
    b += tile(x, r * 2, X => `<ellipse cx="${f(X)}" cy="${f(y)}" rx="${f(r * 1.4)}" ry="${f(r * 0.8)}" fill="${F.pebble}" opacity=".7"/>`);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, W), y = rng.range(H + 20, 522), k = 0.55 + (y - H) / 360;
    b += tile(x, 12, X => tuft(X, y, rng.range(8, 13) * k, F.tuft, 0.5, 2 * k));
  }
  // ---- the spring pool
  b += `<ellipse cx="${PX}" cy="${PY + 4}" rx="${PRX + 16}" ry="${PRY + 9}" fill="${F.wet}"/>`;
  b += `<ellipse cx="${PX}" cy="${PY}" rx="${PRX}" ry="${PRY}" fill="url(#w)" stroke="${F.waterLine}" stroke-width="3"/>`;
  // inner back-bank shadow (water darker under the far bank)
  b += `<path d="M${PX - PRX + 6},${PY - 4} A${PRX - 6} ${PRY - 4} 0 0 1 ${PX + PRX - 6},${PY - 4} A${PRX - 10} ${PRY - 14} 0 0 0 ${PX - PRX + 6},${PY - 4}Z" fill="${F.waterLine}" opacity=".35"/>`;
  if (F.moonPath) for (let i = 0; i < 6; i++) b += `<rect x="${PX + 60 - i * 3}" y="${PY - 18 + i * 7}" width="${40 - i * 4}" height="3" rx="1.5" fill="${F.shimmer}" opacity="${f(0.7 - i * 0.08)}"/>`;
  for (const [dx, dy, l] of [[-140, 6, 34], [-118, 16, 24], [110, 10, 30], [96, 20, 20], [-60, 24, 28], [40, 26, 22]]) b += `<path d="M${PX + dx},${PY + dy}h${l}" stroke="${F.shimmer}" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>`;
  // small lily pads on the water (not the home pad: render draws that)
  for (const [dx, dy, r] of [[-132, 8, 11], [134, 4, 10], [-104, 22, 8]]) b += `<path d="M${PX + dx},${PY + dy} l${r},-2 a${r} ${r * 0.42} 0 1 1 -2,-4Z" fill="${F.reeds}" stroke="${F.waterLine}" stroke-width="1.5"/>`;
  b += `<circle cx="${PX + 140}" cy="${PY - 1}" r="4" fill="${F.lotus}"/>`;
  // reeds at both ends of the pool
  const reeds = (x, y, k, dir) => {
    let s = '';
    for (const [dx, h, lean] of [[-8, 44, -7], [-2, 58, -2], [4, 50, 4], [10, 36, 8], [0, 66, 1]]) s += `<path d="M${f(x + dx * k * dir)},${y}q${f(lean * k * 0.5 * dir)},${f(-h * k * 0.55)} ${f(lean * k * dir)},${f(-h * k)}" fill="none" stroke="${F.reeds}" stroke-width="${f(3 * k)}" stroke-linecap="round"/>`;
    s += `<rect x="${f(x - 3 * k)}" y="${f(y - 66 * k - 2)}" width="${f(5 * k)}" height="${f(14 * k)}" rx="${f(2.5 * k)}" fill="${F.reedHead}"/>`;
    s += `<rect x="${f(x - 2 * k + 4 * k * dir)}" y="${f(y - 50 * k)}" width="${f(4.5 * k)}" height="${f(11 * k)}" rx="2" fill="${F.reedHead}"/>`;
    return s;
  };
  b += reeds(PX - PRX - 6, PY + 14, 0.9, -1) + reeds(PX + PRX + 4, PY + 12, 0.85, 1);
  // two date palms leaning out from the pool's back corners
  b += palm(PX - 236, 150, 92, -26, 0.92, F.palm, { detail: true }) + palm(PX + 236, 150, 82, 24, 0.85, F.palm, { detail: true });
  // front darkening so the bottom edge doesn't glare
  b += `<rect x="-2" y="470" width="${W + 4}" height="70" fill="url(#fd)"/>`;
  return svg(W, 540, b, defs);
}

// ======================================================================
// NEAR (960×540 edge frame; keep x120–840, y70–540 clear)
// ======================================================================
function near(c, name) {
  const N = c.near;
  const o = { stroke: N.stroke, sw: 3, rib: N.rib, ribW: 3, hi: N.hi, teeth: 11 };
  let b = '';
  // top-corner fronds hanging in from off-screen crowns
  const corner = (x, y, side) => {
    let s = '';
    s += frond(x, y, side, 18, 190, 26, 0.38, N.frond, o);
    s += frond(x, y, side, -8, 200, 28, 0.25, N.frond2, o);
    s += frond(x, y, side, 52, 150, 24, 0.3, N.frond, o);
    return s;
  };
  // palms chapter: a full trunk at the left edge
  if (N.trunk) {
    b += `<path d="M-30,560 Q10,300 30,40 L66,46 Q48,300 40,560Z" fill="${N.trunk}" stroke="${N.trunkLine}" stroke-width="3"/>`;
    let d = '';
    for (let y = 70; y < 540; y += 26) { const x = 30 + (y - 40) * -0.06 + 4; d += `M${f(x - 18 + (y / 540) * -10)},${y}q${f(20)},8 ${f(40)},-2`; }
    b += `<path d="${d}" fill="none" stroke="${N.band}" stroke-width="3" stroke-linecap="round"/>`;
  }
  b += corner(-40, -20, 1) + corner(1000, -20, -1);
  b += frond(-30, 120, 1, 40, 120, 20, 0.3, N.frond2, o) + frond(990, 130, -1, 40, 120, 20, 0.3, N.frond2, o);
  // bottom corners: rocks + chapter plant
  const rock = (x, y, rx, ry) => `<path d="M${x - rx},${y} Q${x - rx},${y - ry * 1.2} ${x - rx * 0.2},${y - ry} Q${x + rx * 0.6},${y - ry * 1.15} ${x + rx},${y - ry * 0.2} L${x + rx},${y}Z" fill="${N.rock}" stroke="${N.rockLine}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M${x + rx * 0.2},${y - ry * 0.95} Q${x + rx * 0.75},${y - ry * 0.95} ${x + rx * 0.95},${y - ry * 0.2} L${x + rx * 0.95},${y - 2} L${x + rx * 0.25},${y - 2}Z" fill="${N.rockSh}"/>` +
    `<path d="M${x - rx * 0.7},${y - ry * 0.7} Q${x - rx * 0.4},${y - ry * 0.98} ${x - rx * 0.05},${y - ry * 0.92}" fill="none" stroke="#fff6e6" stroke-width="3" stroke-linecap="round" opacity=".35"/>`;
  b += rock(28, 548, 70, 46) + rock(92, 552, 38, 26) + rock(936, 548, 66, 48) + rock(872, 554, 34, 24);
  if (N.reed) {
    const reeds = (x0, dir) => {
      let s = '';
      for (let i = 0; i < 6; i++) { const x = x0 + dir * i * 13, h = 120 + (i % 3) * 38; s += `<path d="M${x},560 q${dir * 8},${-h * 0.6} ${dir * (14 + i * 3)},${-h}" fill="none" stroke="${N.reed}" stroke-width="6" stroke-linecap="round"/>`; if (i % 2 === 0) s += `<rect x="${x + dir * (14 + i * 3) - 4}" y="${560 - h - 4}" width="8" height="22" rx="4" fill="${N.reedHead}"/>`; }
      return s;
    };
    b = reeds(-8, 1) + reeds(968, -1) + b;
    // a lotus at the bottom left
    b += `<g transform="translate(70,520)"><path d="M-22,6 Q0,14 22,6 Q0,0 -22,6Z" fill="${N.frond}"/>` +
      [-50, -25, 0, 25, 50].map(a => `<path d="M0,4 C-7,-6 -6,-18 0,-24 C6,-18 7,-6 0,4Z" fill="${N.lotus}" stroke="#c98aa0" stroke-width="1.5" transform="rotate(${a})"/>`).join('') + '</g>';
  }
  if (N.agave) {
    const agave = (x, y, k) => [-70, -45, -20, 0, 20, 45, 70].map((a, i) => `<g transform="translate(${x},${y}) rotate(${a}) scale(${k})"><path d="M-7,0 Q-6,-40 0,-58 Q6,-40 7,0Z" fill="${i % 2 ? N.agave : N.agaveSh}" stroke="#5f6b5b" stroke-width="2.5" stroke-linejoin="round"/></g>`).join('');
    b += agave(56, 512, 1.0) + agave(912, 514, 0.95);
  }
  return svg(960, 540, b);
}

// ======================================================================
// BURROWS (170×90, anchor = rim centre (85,45))
// rim ellipse rx 72 ry 24 → x 13..157, y 21..69. Opening rx 56 ry 15 → y 30..60.
// back  = ground shadow + full rim + dark opening + inner far wall (+ things standing behind).
// front = lower half of the rim (lip) + a "throat" fade hiding the clip line (by+4s) + tuft.
// ======================================================================
const CX = 85, CY = 45, RX = 72, RY = 24, OX = 56, OY = 15;
const lipD = `M${CX - RX},${CY} A${RX} ${RY} 0 0 0 ${CX + RX},${CY} L${CX + OX},${CY} A${OX} ${OY} 0 0 1 ${CX - OX},${CY}Z`;
function burrowBase(o) {
  let back = `<ellipse cx="${CX}" cy="${CY + 9}" rx="${RX + 8}" ry="${RY + 6}" fill="${o.shadow}" opacity=".28"/>`;
  back += o.behind || '';
  back += `<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="${o.rim}" stroke="${o.line}" stroke-width="3"/>`;
  back += `<path d="M${CX - RX + 12},${CY - 8} Q${CX},${CY - RY - 6} ${CX + RX - 12},${CY - 8} Q${CX},${CY - RY + 4} ${CX - RX + 12},${CY - 8}Z" fill="${o.rimHi}"/>`;
  back += o.backDeco || '';
  back += `<ellipse cx="${CX}" cy="${CY}" rx="${OX}" ry="${OY}" fill="${o.hole}" stroke="${o.line}" stroke-width="3"/>`;
  back += `<path d="M${CX - OX + 4},${CY - 3} A${OX - 4} ${OY - 2} 0 0 1 ${CX + OX - 4},${CY - 3} A${OX - 4} ${OY - 7} 0 0 0 ${CX - OX + 4},${CY - 3}Z" fill="${o.inner}" opacity=".9"/>`;
  let front = `<path d="M${CX - OX},${CY} A${OX} ${OY} 0 0 0 ${CX + OX},${CY}Z" fill="url(#th)"/>`;
  front += o.wall || '';
  front += `<path d="${lipD}" fill="${o.rim}"/>`;
  front += `<path d="M${CX - RX + 6},${CY + 10} A${RX - 3} ${RY - 3} 0 0 0 ${CX + RX - 6},${CY + 10} A${RX} ${RY} 0 0 1 ${CX - RX + 6},${CY + 10}Z" fill="${o.rimSh}"/>`;
  front += o.lipDeco || '';
  if (!o.wall) front += `<path d="M${CX - RX},${CY} A${RX} ${RY} 0 0 0 ${CX + RX},${CY}" fill="none" stroke="${o.line}" stroke-width="3"/>`;
  front += `<path d="M${CX - OX},${CY} A${OX} ${OY} 0 0 0 ${CX + OX},${CY}" fill="none" stroke="${o.line}" stroke-width="3"/>`;
  front += o.tuft || '';
  const defs = lin('th', [[0, o.hole, 0], [1, o.hole, 1]], 0, CY - 3, 0, CY + 5, 'userSpaceOnUse') + (o.defs || '');
  return { back: svg(170, 90, back), front: svg(170, 90, front, defs) };
}
// a points-on-ellipse helper
const onE = (a, rx, ry) => [CX + Math.cos(a) * rx, CY + Math.sin(a) * ry];

function burrowSpring() {
  // reed-clump ring around a dark water-edge hole
  const reed = (x, y, h, lean, col, w = 3.5) => `<path d="M${f(x)},${f(y)}q${f(lean * 0.4)},${f(-h * 0.55)} ${f(lean)},${f(-h)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  let behind = '';
  // reeds standing behind the back rim at both sides (outside the friend's 140-wide column centre)
  for (const [x, h, lean] of [[22, 46, -8], [30, 60, -3], [38, 40, 4], [140, 52, 6], [148, 40, 10], [132, 38, -2]]) behind += reed(x, CY - 8, h, lean, '#7f9663');
  behind += `<rect x="27" y="${CY - 8 - 60 - 2}" width="6" height="15" rx="3" fill="#9b7c58"/><rect x="143" y="${CY - 8 - 52 + 1}" width="6" height="13" rx="3" fill="#9b7c58"/>`;
  let backDeco = '';
  for (const [dx, dy, r] of [[-52, -9, 8], [-20, -18, 7], [24, -18, 8], [54, -8, 7]]) backDeco += `<ellipse cx="${CX + dx}" cy="${CY + dy}" rx="${r * 1.5}" ry="${r * 0.6}" fill="#c2c79a" opacity=".75"/>`;
  let lipDeco = '';
  for (const [dx, dy, r] of [[-46, 13, 8], [-12, 20, 8], [22, 20, 8], [50, 12, 7]]) lipDeco += `<ellipse cx="${CX + dx}" cy="${CY + dy - 2}" rx="${r * 1.5}" ry="${r * 0.55}" fill="#b4bd8c" opacity=".7"/>`;
  // water glint at the inner edge of the lip
  lipDeco += `<path d="M${CX - 30},${CY + 14} q30,5 60,0" fill="none" stroke="#cfeae6" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
  let tuft = '';
  for (const [x, h, lean] of [[18, 34, -9], [25, 44, -3], [31, 30, 5], [148, 36, 7], [154, 26, 11]]) tuft += reed(x, 76, h, lean, '#86a068', 4);
  tuft += `<rect x="22" y="${76 - 44 - 4}" width="6" height="14" rx="3" fill="#9b7c58" stroke="#76603f" stroke-width="1.2"/>`;
  tuft += leaf(40, 78, 60, 22, 7, '#97ad76', '#6b8250', false) + `<circle cx="140" cy="72" r="5" fill="#f2b4c4" stroke="#c98aa0" stroke-width="1.5"/>`;
  return burrowBase({ shadow: '#5a4a2e', rim: '#a8a074', rimHi: '#c6c294', rimSh: '#8c845d', line: '#5f5a3c', hole: '#262a26', inner: '#46524a', behind, backDeco, lipDeco, tuft });
}
function burrowPalms() {
  // woven basket: thick braided rim + woven wall below the lip
  const D = 22;
  const wallD = `M${CX - RX},${CY} L${CX - RX + 3},${CY + D} A${RX - 3} ${RY - 4} 0 0 0 ${CX + RX - 3},${CY + D} L${CX + RX},${CY} A${RX} ${RY} 0 0 1 ${CX - RX},${CY}Z`;
  const defs = `<clipPath id="wc"><path d="${wallD}"/></clipPath>`;
  let wall = `<path d="${wallD}" fill="#c49a5e" stroke="#7a5a32" stroke-width="3" stroke-linejoin="round"/>`;
  let weave = '';
  // horizontal strands (arcs) and vertical stakes, with alternating darker cells
  for (let r = 0; r < 4; r++) weave += `<path d="M${CX - RX},${CY + 6 + r * 7} A${RX} ${RY - 1} 0 0 0 ${CX + RX},${CY + 6 + r * 7}" fill="none" stroke="#a57c46" stroke-width="2.2"/>`;
  for (let i = -6; i <= 6; i++) {
    const x = CX + i * 11, yA = CY + (RY - 1) * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2));
    weave += `<path d="M${x},${f(yA - 4)}v${D + 8}" stroke="#a57c46" stroke-width="2"/>`;
    for (let r = 0; r < 4; r++) if ((i + r) % 2 === 0) weave += `<rect x="${x + 1}" y="${f(yA - 1 + r * 7)}" width="9" height="6" rx="2" fill="#d8b47a" opacity=".85"/>`;
  }
  wall += `<g clip-path="url(#wc)">${weave}<path d="M${CX + 34},${CY + 10} h60 v40 h-60Z" fill="#8a6538" opacity=".25"/></g>`;
  wall += `<path d="M${CX - RX + 3},${CY + D} A${RX - 3} ${RY - 4} 0 0 0 ${CX + RX - 3},${CY + D}" fill="none" stroke="#7a5a32" stroke-width="3"/>`;
  // braided rim: overlapping lumps along the rim ellipse
  const braid = (a0, a1) => { let s = ''; for (let a = a0; a <= a1 + 1e-6; a += Math.PI / 14) { const [x, y] = onE(a, (RX + OX) / 2, (RY + OY) / 2); s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="5" fill="#d9b67c" stroke="#9c7642" stroke-width="1.6" transform="rotate(${f((a * 180) / Math.PI + 90 + 30)} ${f(x)} ${f(y)})"/>`; } return s; };
  const tuft = frond(150, 70, -1, -40, 40, 8, 0.25, '#7f9e68', { stroke: '#557548', sw: 2, teeth: 6 }) + frond(152, 72, -1, 10, 34, 7, 0.3, '#8ead75', { stroke: '#557548', sw: 2, teeth: 6 });
  return burrowBase({ shadow: '#5a4528', rim: '#c9a46a', rimHi: '#ddbd85', rimSh: '#ad864f', line: '#7a5a32', hole: '#2a2118', inner: '#5c4428', wall, backDeco: braid(Math.PI, 2 * Math.PI), lipDeco: braid(0, Math.PI), tuft, defs });
}
function burrowDunes() {
  // sand burrow ringed with pebbles
  const P = ['#c8b3a8', '#b49f9e', '#d8c4b0', '#a99aa6'];
  const peb = (a, k, i) => { const [x, y] = onE(a, RX - 6, RY - 2), r = 6.5 + ((i * 7) % 4); return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 1.25)}" ry="${f(r * 0.8)}" fill="${P[i % 4]}" stroke="#8a6f6f" stroke-width="2"/><ellipse cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" rx="${f(r * 0.45)}" ry="${f(r * 0.25)}" fill="#f2e4da" opacity=".7"/>`; };
  let backDeco = '', lipDeco = '';
  let i = 0;
  for (let a = Math.PI + 0.1; a < 2 * Math.PI - 0.05; a += Math.PI / 7) backDeco += peb(a, 1, i++);
  for (let a = 0.12; a < Math.PI; a += Math.PI / 6.5) lipDeco += peb(a, 1, i++);
  // sand spill lines on the lip
  lipDeco = `<path d="M${CX - 40},${CY + 18} q20,4 40,0 M${CX + 6},${CY + 21} q18,3 34,-2" fill="none" stroke="#f6d2b0" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>` + lipDeco;
  const tuft = [-50, -20, 10, 40].map((a, j) => `<g transform="translate(150,74) rotate(${a})"><path d="M-4,0 Q-3,-18 0,-26 Q3,-18 4,0Z" fill="${j % 2 ? '#93a08a' : '#7f8f7a'}" stroke="#5f6b5b" stroke-width="2"/></g>`).join('') +
    `<ellipse cx="22" cy="76" rx="9" ry="6" fill="#c8b3a8" stroke="#8a6f6f" stroke-width="2"/><ellipse cx="33" cy="80" rx="6" ry="4" fill="#d8c4b0" stroke="#8a6f6f" stroke-width="2"/>`;
  return burrowBase({ shadow: '#6a3a3a', rim: '#e5ae8c', rimHi: '#f4caa6', rimSh: '#cc9273', line: '#8a5a4c', hole: '#2e1e22', inner: '#6a4038', backDeco, lipDeco, tuft });
}
function burrowNight() {
  // big clay jar mouth with a painted band (jar body bulges below the lip)
  const D = 16;
  const wallD = `M${CX - RX},${CY} C${CX - RX - 8},${CY + 14} ${CX - RX - 4},${CY + D + 8} ${CX - RX + 10},${CY + D + 10} A${RX - 10} ${RY - 8} 0 0 0 ${CX + RX - 10},${CY + D + 10} C${CX + RX + 4},${CY + D + 8} ${CX + RX + 8},${CY + 14} ${CX + RX},${CY} A${RX} ${RY} 0 0 1 ${CX - RX},${CY}Z`;
  const defs = `<clipPath id="jc"><path d="${wallD}"/></clipPath>`;
  let wall = `<path d="${wallD}" fill="#a86f66" stroke="#5e3a44" stroke-width="3" stroke-linejoin="round"/>`;
  let band = `<path d="M${CX - RX - 10},${CY + 12} A${RX + 6} ${RY} 0 0 0 ${CX + RX + 10},${CY + 12} L${CX + RX + 10},${CY + 23} A${RX + 6} ${RY} 0 0 1 ${CX - RX - 10},${CY + 23}Z" fill="#6f8fb0"/>`;
  // zigzag + dots on the band, following the jar curve
  let z = '';
  for (let k = 0; k <= 16; k++) {
    const x = CX - RX - 4 + k * ((2 * RX + 8) / 16), yb = CY + 12 + RY * Math.sqrt(Math.max(0, 1 - ((x - CX) / (RX + 6)) ** 2));
    z += `${k ? 'L' : 'M'}${f(x)},${f(yb + (k % 2 ? 9 : 2))}`;
  }
  band += `<path d="${z}" fill="none" stroke="#efe1c2" stroke-width="2.4" stroke-linejoin="round"/>`;
  wall += `<g clip-path="url(#jc)">${band}<path d="M${CX + 36},${CY + 6} h60 v50 h-60Z" fill="#5e3a44" opacity=".22"/><path d="M${CX - 58},${CY + 18} q-2,10 4,20" fill="none" stroke="#d29a8c" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>`;
  // thick rolled rim
  const backDeco = `<ellipse cx="${CX}" cy="${CY}" rx="${OX + 8}" ry="${OY + 5}" fill="none" stroke="#c48a7c" stroke-width="5" opacity=".9"/>`;
  const lipDeco = `<path d="M${CX - OX - 8},${CY} A${OX + 8} ${OY + 5} 0 0 0 ${CX + OX + 8},${CY}" fill="none" stroke="#9a6058" stroke-width="2"/>`;
  const tuft = [-60, -30, 0, 30, 60].map((a, j) => `<g transform="translate(152,78) rotate(${a})"><path d="M-4,0 Q-3,-15 0,-22 Q3,-15 4,0Z" fill="${j % 2 ? '#6d8fa0' : '#5a7d8f'}" stroke="#3c566a" stroke-width="2"/></g>`).join('');
  return burrowBase({ shadow: '#141838', rim: '#b87a6e', rimHi: '#d39a8a', rimSh: '#9a6058', line: '#5e3a44', hole: '#1a1424', inner: '#4a2e3a', wall, backDeco, lipDeco, tuft, defs });
}

// ======================================================================
// PARTICLES
// ======================================================================
function particles() {
  const p = {};
  p.dragonfly = svg(48, 32,
    `<g fill="#eef8fb" stroke="#9dc3d2" stroke-width="1.3" opacity=".88"><ellipse cx="21" cy="7" rx="11" ry="3.4" transform="rotate(-24 27 14)"/><ellipse cx="32" cy="7" rx="10" ry="3.2" transform="rotate(26 27 14)"/><ellipse cx="21" cy="22" rx="10" ry="3.2" transform="rotate(22 27 15)"/><ellipse cx="32" cy="22" rx="9" ry="3" transform="rotate(-24 27 15)"/></g>` +
    `<path d="M5,15 L24,15" stroke="#4f86b0" stroke-width="4" stroke-linecap="round"/><path d="M9,13.3v3.4M13,13.3v3.4M17,13.3v3.4" stroke="#3b6a90" stroke-width="1.2"/><ellipse cx="27" cy="15" rx="5" ry="3.6" fill="#5f9fc8" stroke="#3b6a90" stroke-width="1.5"/><circle cx="34" cy="15" r="4" fill="#78b5d8" stroke="#3b6a90" stroke-width="1.5"/><circle cx="35.5" cy="13.5" r="1.3" fill="#ffffff"/>`);
  const bfly = open => {
    const sx = open ? 1 : 0.4;
    return svg(40, 36,
      `<g transform="translate(20,18) scale(${sx},1)"><path d="M0,-2 C-6,-16 -20,-18 -18,-6 C-17,0 -8,2 0,0Z" fill="#ef9db8" stroke="#b0607e" stroke-width="2"/><path d="M0,1 C-8,4 -16,12 -10,15 C-5,17 -1,9 0,3Z" fill="#c9a6e6" stroke="#8a64a8" stroke-width="2"/>` +
      `<path d="M0,-2 C6,-16 20,-18 18,-6 C17,0 8,2 0,0Z" fill="#ef9db8" stroke="#b0607e" stroke-width="2"/><path d="M0,1 C8,4 16,12 10,15 C5,17 1,9 0,3Z" fill="#c9a6e6" stroke="#8a64a8" stroke-width="2"/>` +
      `<circle cx="-11" cy="-8" r="2.4" fill="#fff4f6"/><circle cx="11" cy="-8" r="2.4" fill="#fff4f6"/></g>` +
      `<rect x="18.5" y="9" width="3" height="18" rx="1.5" fill="#5e4060"/><path d="M19,10 q-3,-6 -6,-7 M21,10 q3,-6 6,-7" fill="none" stroke="#5e4060" stroke-width="1.3" stroke-linecap="round"/>`);
  };
  p.butterfly_0 = bfly(true);
  p.butterfly_1 = bfly(false);
  p.petal = svg(32, 32, `<g transform="translate(16,29) rotate(14)"><path d="M0,0 C-10,-6 -9,-20 0,-27 C9,-20 10,-6 0,0Z" fill="#f6b3c6" stroke="#cf8098" stroke-width="2" stroke-linejoin="round"/><path d="M0,-4 C-4,-10 -4,-18 0,-23 C3,-18 3,-10 0,-4Z" fill="#fde0e8"/></g>`);
  p.sandwisp = svg(256, 96,
    `<ellipse cx="128" cy="52" rx="126" ry="22" fill="url(#sw)"/><ellipse cx="96" cy="44" rx="80" ry="12" fill="url(#sw)"/><ellipse cx="170" cy="60" rx="70" ry="10" fill="url(#sw)"/>` +
    `<path d="M30,50 Q120,36 228,48" fill="none" stroke="#fff3e2" stroke-width="2.5" stroke-linecap="round" opacity=".45"/><path d="M60,62 Q140,54 210,62" fill="none" stroke="#fff3e2" stroke-width="2" stroke-linecap="round" opacity=".35"/>`,
    rad('sw', [[0, '#fbe6cf', 0.55], [0.6, '#fbe6cf', 0.22], [1, '#fbe6cf', 0]]));
  {
    // tumbleweed: round tangle (rotation-symmetric enough to spin)
    const rng = RNG(404);
    let d = '';
    for (let i = 0; i < 26; i++) {
      const a0 = rng.range(0, 6.283), a1 = a0 + rng.range(1.6, 3), r0 = rng.range(10, 20), r1 = rng.range(10, 20);
      const cx = 24 + Math.cos((a0 + a1) / 2) * rng.range(-6, 6), cy = 24 + Math.sin((a0 + a1) / 2) * rng.range(-6, 6);
      d += `M${f(24 + Math.cos(a0) * r0)},${f(24 + Math.sin(a0) * r0)}Q${f(cx)},${f(cy)} ${f(24 + Math.cos(a1) * r1)},${f(24 + Math.sin(a1) * r1)}`;
    }
    p.tumbleweed = svg(48, 48, `<circle cx="24" cy="24" r="20" fill="#c9a274" opacity=".28"/><path d="${d}" fill="none" stroke="#8f6a45" stroke-width="2.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#d7b487" stroke-width="1" stroke-linecap="round" transform="rotate(40 24 24)"/><circle cx="24" cy="24" r="19" fill="none" stroke="#9c7650" stroke-width="2.2" opacity=".55"/><path d="M8,30 Q20,14 40,20 M12,14 Q28,30 36,40" fill="none" stroke="#7d5a3a" stroke-width="2.4" stroke-linecap="round"/>`);
  }
  p.glow = svg(24, 24, `<circle cx="12" cy="12" r="12" fill="url(#gl)"/><circle cx="12" cy="12" r="3.2" fill="#fbffe0"/>`,
    rad('gl', [[0, '#f6ffc2', 0.95], [0.3, '#eaf7a0', 0.55], [1, '#e0f090', 0]]));
  p.sparkle = svg(32, 32, `<path d="M16,1 Q18,14 31,16 Q18,18 16,31 Q14,18 1,16 Q14,14 16,1Z" fill="#fffbea" stroke="#efd9a8" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16" cy="16" r="3" fill="#ffffff"/>`);
  p.star_tw = svg(24, 24, `<circle cx="12" cy="12" r="7" fill="url(#st)"/><path d="M12,1 Q13.2,10.8 23,12 Q13.2,13.2 12,23 Q10.8,13.2 1,12 Q10.8,10.8 12,1Z" fill="#f2f0ff"/><circle cx="12" cy="12" r="2" fill="#ffffff"/>`,
    rad('st', [[0, '#dfe4ff', 0.8], [1, '#dfe4ff', 0]]));
  return p;
}

// ---------- main ----------
const BURROWS = { spring: burrowSpring, palms: burrowPalms, dunes: burrowDunes, night: burrowNight };
const sizes = [];
const PAL = {};
Object.entries(CH).forEach(([name, c], i) => {
  PAL[name] = c.pal;
  const out = { sky: sky(c, 100 + i), far: far(c, 200 + i), floor: floor(c, 300 + i), near: near(c, name) };
  const bw = BURROWS[name]();
  out.burrow_back = bw.back; out.burrow_front = bw.front;
  for (const [k, s] of Object.entries(out)) sizes.push([`${name}/${k}.svg`, write(path.join(LV, name, `${k}.svg`), s)]);
});
write(path.join(LV, 'palette.json'), JSON.stringify(PAL, null, 2) + '\n');
for (const [k, s] of Object.entries(particles())) sizes.push([`particles/${k}.svg`, write(path.join(PT, `${k}.svg`), s)]);
for (const [n, b] of sizes) if (b > 150 * 1024) console.warn('TOO BIG', n, b);
console.log(sizes.map(([n, b]) => `${n} ${(b / 1024).toFixed(1)}KB`).join('\n'));
