// Environment art generator for Zippy's Jungle Boop (DESIGN.md §2–§4 "Environment").
// Writes game/assets/default/levels/<biome>/{sky,far,floor,near,burrow_back,burrow_front}.svg,
// levels/palette.json and particles/*.svg. 100% original, deterministic (seeded RNG).
// Usage: node tools/art-environment/gen.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../game/assets/default');
const LV = path.join(ROOT, 'levels');
const PT = path.join(ROOT, 'particles');
const W = 1920; // width of the tileable layers

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
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units = '') =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units ? ` gradientUnits="${units}"` : ''}>` +
  stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
  stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';

// periodic (tileable) line: y = base + sum a*sin(2πkx/W + p), k integer
function wave(base, terms, step = 20, width = W) {
  const pts = [];
  for (let x = 0; x <= width; x += step) {
    let y = base;
    for (const [a, k, p] of terms) y += a * Math.sin((2 * Math.PI * k * x) / width + p);
    pts.push([x, y]);
  }
  return pts;
}
// closed shape: a wave on top, filled down to `bottom`; extended 2px past each edge so tiles overlap cleanly
function ridge(pts, bottom, attrs) {
  let d = `M${-2},${f(bottom)}L${-2},${f(pts[0][1])}`;
  for (const [x, y] of pts) d += `L${f(x)},${f(y)}`;
  d += `L${W + 2},${f(pts[pts.length - 1][1])}L${W + 2},${f(bottom)}Z`;
  return `<path d="${d}" ${attrs}/>`;
}
// draw something near a tile edge twice so the tile wraps
// (fn is called once; the copy is the identical markup shifted by ±W, so random values inside fn stay in sync)
function tile(x, r, fn) {
  const one = fn(x);
  let s = one;
  if (x - r < 0) s += `<g transform="translate(${W},0)">${one}</g>`;
  if (x + r > W) s += `<g transform="translate(${-W},0)">${one}</g>`;
  return s;
}
// a leaf pointing "up" from the origin, length L, width w
function leafD(L, w) {
  return `M0,0C${f(-w)},${f(-L * 0.3)} ${f(-w * 0.7)},${f(-L * 0.8)} 0,${f(-L)}C${f(w * 0.7)},${f(-L * 0.8)} ${f(w)},${f(-L * 0.3)} 0,0Z`;
}
function leaf(x, y, rot, L, w, fill, stroke, vein = true) {
  return `<g transform="translate(${f(x)},${f(y)}) rotate(${f(rot)})"><path d="${leafD(L, w)}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>` +
    (vein ? `<path d="M0,${f(-L * 0.08)}Q${f(w * 0.12)},${f(-L * 0.5)} 0,${f(-L * 0.88)}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity=".55"/>` : '') + '</g>';
}
// grass tuft (a few blades) at (x,y), height h
function tuft(x, y, h, col, op, sw = 2.2) {
  const b = [[-0.5, -0.35], [0, 0], [0.45, 0.3], [-0.2, -0.1]];
  let d = '';
  for (const [dx, lean] of b) d += `M${f(x + dx * h * 0.4)},${f(y)}q${f(lean * h * 0.3)},${f(-h * 0.5)} ${f(lean * h * 0.7)},${f(-h * (0.75 + Math.abs(dx) * 0.2))}`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
}
function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  return s.length;
}

// ---------- palette ----------
const PAL = {
  riverbank: { sky: '#bfe6ee', ground: '#9fc27a', accent: '#5f9a54', banner: '#2f5d3a' },
  bamboo: { sky: '#eef1c6', ground: '#b7b680', accent: '#7f9a3c', banner: '#4a5a1e' },
  canopy: { sky: '#a9dcf0', ground: '#9cb67c', accent: '#4f8f5a', banner: '#24513c' },
  ruins: { sky: '#6a557f', ground: '#8f9582', accent: '#e9a46f', banner: '#3a2f4e' },
};

// ---------- floor detail shared ----------
// calm ground texture: big faint patches, small tufts and pebbles. Avoids nothing (texture is low-contrast everywhere).
function groundTexture(rng, top, o) {
  let s = '';
  for (let i = 0; i < o.patches; i++) {
    const x = rng.range(0, W), y = rng.range(top + 30, 520), rx = rng.range(90, 220) * (0.6 + (y - top) / 400), ry = rx * rng.range(0.16, 0.24);
    const c = rng.next() < 0.5 ? o.patchLight : o.patchDark;
    s += tile(x, rx, X => `<ellipse cx="${f(X)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${c}" opacity="${o.patchOp}"/>`);
  }
  for (let i = 0; i < o.tufts; i++) {
    const x = rng.range(0, W), y = rng.range(top + 18, 525), k = 0.55 + (y - top) / 360, h = rng.range(9, 15) * k;
    s += tile(x, 12, X => tuft(X, y, h, o.tuft, o.tuftOp, 2 * k));
  }
  for (let i = 0; i < o.pebbles; i++) {
    const x = rng.range(0, W), y = rng.range(top + 25, 520), k = 0.6 + (y - top) / 380, r = rng.range(3, 6) * k;
    s += tile(x, r + 2, X => `<ellipse cx="${f(X)}" cy="${f(y)}" rx="${f(r * 1.4)}" ry="${f(r * 0.8)}" fill="${o.pebble}" opacity="${o.pebbleOp}"/>`);
  }
  return s;
}

// ======================================================================
// RIVERBANK MORNING
// ======================================================================
function riverbank() {
  const out = {};
  // sky: fresh pale morning
  {
    const defs = lin('g', [[0, '#9fd6ec'], [0.55, '#d4eef0'], [1, '#fdf0d6']]) +
      rad('sun', [[0, '#fffbe8', 0.95], [0.25, '#fff4cf', 0.6], [1, '#fff4cf', 0]]);
    let b = `<rect width="960" height="540" fill="url(#g)"/><circle cx="730" cy="170" r="210" fill="url(#sun)"/><circle cx="730" cy="170" r="34" fill="#fffbea" opacity=".9"/>`;
    const cloud = (x, y, k, op) => `<g opacity="${op}" fill="#ffffff"><ellipse cx="${x}" cy="${y}" rx="${70 * k}" ry="${18 * k}"/><circle cx="${x - 28 * k}" cy="${y - 10 * k}" r="${20 * k}"/><circle cx="${x + 8 * k}" cy="${y - 18 * k}" r="${26 * k}"/><circle cx="${x + 40 * k}" cy="${y - 6 * k}" r="${17 * k}"/></g>`;
    b += cloud(190, 150, 1.1, 0.75) + cloud(470, 95, 0.8, 0.6) + cloud(880, 240, 0.9, 0.55) + cloud(90, 280, 0.7, 0.45);
    out.sky = svg(960, 540, b, defs);
  }
  // far: misty hills + a soft tree line
  {
    const rng = RNG(11);
    let b = ridge(wave(205, [[22, 2, 0.4], [12, 5, 1.7], [6, 11, 0.2]]), 320, 'fill="#c3dfcf"');
    // tree line (puffy crowns)
    let crowns = '';
    for (let i = 0; i < 46; i++) {
      const x = i * (W / 46) + rng.range(-12, 12), r = rng.range(26, 44), y = 236 + rng.range(-10, 8) - r * 0.5;
      crowns += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(y)}" r="${f(r)}"/>`);
    }
    b += `<g fill="#a9cfb3">${crowns}</g>` + `<rect x="-2" y="234" width="${W + 4}" height="90" fill="#a9cfb3"/>`;
    // a few taller palms
    let palms = '';
    for (const px of [130, 610, 1010, 1470, 1800]) {
      palms += tile(px, 90, X => {
        let s = `<path d="M${X},250 Q${X + 10},180 ${X + 4},120" fill="none" stroke="#93bfa0" stroke-width="7" stroke-linecap="round"/>`;
        for (const a of [-150, -115, -70, -30, 10, 50]) s += `<g transform="translate(${X + 4},120) rotate(${a + 90})"><path d="M0,0 Q32,-16 70,6 Q34,-4 0,0Z" fill="#93bfa0"/></g>`;
        return s;
      });
    }
    b = palms + b;
    // nearer bushes band
    let bush = '';
    for (let i = 0; i < 30; i++) {
      const x = i * (W / 30) + rng.range(-20, 20), r = rng.range(22, 34);
      bush += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(262 - r * 0.3)}" r="${f(r)}"/>`);
    }
    b += `<g fill="#94c19c">${bush}</g><rect x="-2" y="258" width="${W + 4}" height="60" fill="#94c19c"/>`;
    // morning haze
    b += `<rect x="-2" y="150" width="${W + 4}" height="170" fill="url(#hz)"/>`;
    out.far = svg(W, 540, b, lin('hz', [[0, '#eef7f2', 0], [1, '#eef7f2', 0.45]]));
  }
  // floor: a calm river at the back, a reedy bank, then soft meadow ground
  {
    const rng = RNG(21);
    const defs = lin('w', [[0, '#cfeae4'], [1, '#aed6cf']]) + lin('gr', [[0, '#b2cf86'], [0.45, '#a2c47b'], [1, '#8db46c']]);
    let b = ridge(wave(232, [[2, 3, 0.3], [1.5, 7, 1]]), 300, 'fill="url(#w)"');
    // water shimmer
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, W), y = rng.range(238, 258), l = rng.range(18, 50);
      b += tile(x, l, X => `<path d="M${f(X)},${f(y)}h${f(l)}" stroke="#f4fbf8" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`);
    }
    // sandy-mud bank lip
    b += ridge(wave(262, [[3, 4, 0.9], [2, 9, 2.1], [1.2, 17, 0.4]]), 540, 'fill="#c8bf92"');
    b += ridge(wave(270, [[3, 4, 1.2], [2, 11, 0.4], [1.2, 19, 2]]), 540, 'fill="url(#gr)"');
    b += groundTexture(rng, 270, { patches: 26, patchLight: '#c2db98', patchDark: '#86ab64', patchOp: 0.35, tufts: 120, tuft: '#7aa25c', tuftOp: 0.55, pebbles: 26, pebble: '#d9d6b2', pebbleOp: 0.6 });
    // reeds clumps on the bank (gaps between the L0 back-row critters: stage x 350-410 / 550-610 → file 830-890 / 1030-1090, plus off-centre)
    const reeds = (x, k) => {
      let s = '';
      const blades = [[-10, 62, -6], [-4, 80, -2], [3, 70, 4], [9, 54, 8], [-1, 92, 1]];
      for (const [dx, h, lean] of blades) s += `<path d="M${f(x + dx * k)},${f(272)}q${f(lean * k * 0.5)},${f(-h * k * 0.55)} ${f(lean * k)},${f(-h * k)}" fill="none" stroke="#6f9c55" stroke-width="${f(3.2 * k)}" stroke-linecap="round"/>`;
      s += `<rect x="${f(x - 4 * k - 2.5 * k)}" y="${f(272 - 80 * k - 4)}" width="${f(5 * k)}" height="${f(16 * k)}" rx="${f(2.5 * k)}" fill="#9a7f5c" transform="rotate(-2 ${f(x)} 272)"/>`;
      s += `<rect x="${f(x + 8 * k - 2.5 * k)}" y="${f(272 - 54 * k - 2)}" width="${f(5 * k)}" height="${f(13 * k)}" rx="${f(2.5 * k)}" fill="#9a7f5c"/>`;
      return s;
    };
    for (const [x, k] of [[160, 0.9], [420, 1.0], [600, 0.75], [860, 0.8], [1060, 0.8], [1330, 0.75], [1520, 1.0], [1760, 0.85]]) b += tile(x, 30, X => reeds(X, k));
    // a couple of lily pads
    for (const [x, y, r] of [[300, 247, 12], [700, 252, 9], [1250, 245, 11], [1650, 251, 10]]) b += tile(x, r, X => `<path d="M${X},${y} l${r},-2 a${r} ${r * 0.4} 0 1 1 -2,-4Z" fill="#8cbc84" stroke="#6f9c6a" stroke-width="2"/>`);
    // front darkening so the bottom edge doesn't glare
    b += `<rect x="-2" y="470" width="${W + 4}" height="70" fill="url(#fd)"/>`;
    out.floor = svg(W, 540, b, defs + lin('fd', [[0, '#6f965a', 0], [1, '#6f965a', 0.35]]));
  }
  // near: big leaves at the corners, reeds at the bottom edges
  {
    let b = '';
    const L = [['#6aa55a', '#4b7f40'], ['#7bb466', '#55894a'], ['#5d9750', '#41733a']];
    // top-left
    b += leaf(-10, 30, 120, 150, 40, L[0][0], L[0][1]) + leaf(10, -10, 150, 120, 34, L[1][0], L[1][1]) + leaf(-20, 120, 95, 120, 32, L[2][0], L[2][1]);
    // top-right
    b += leaf(970, 20, -120, 150, 40, L[1][0], L[1][1]) + leaf(950, -10, -150, 120, 34, L[0][0], L[0][1]) + leaf(985, 130, -95, 110, 30, L[2][0], L[2][1]);
    // bottom-left reeds + leaves
    const edgeReeds = (x0, dir) => {
      let s = '';
      for (let i = 0; i < 6; i++) { const x = x0 + dir * i * 14, h = 120 + (i % 3) * 40; s += `<path d="M${x},560 q${dir * 10},${-h * 0.6} ${dir * (18 + i * 3)},${-h}" fill="none" stroke="${i % 2 ? '#5f9a54' : '#4f8a48'}" stroke-width="7" stroke-linecap="round"/>`; }
      return s;
    };
    b += edgeReeds(-5, 1) + edgeReeds(965, -1);
    b += leaf(-10, 560, 55, 130, 36, L[0][0], L[0][1]) + leaf(30, 570, 25, 100, 30, L[2][0], L[2][1]);
    b += leaf(970, 560, -55, 130, 36, L[1][0], L[1][1]) + leaf(930, 570, -25, 100, 30, L[0][0], L[0][1]);
    out.near = svg(960, 540, b);
  }
  // burrows: mud mound with reeds
  out.burrow = burrowSet({
    rim: '#b09670', rimHi: '#cfb98f', rimSh: '#8c7352', line: '#5f4c34', hole: '#2e2a22', inner: '#5a4a36',
    lumps: true,
    tuft: (side) => {
      const x = side > 0 ? 140 : 30;
      let s = '';
      for (const [dx, h, lean] of [[-6, 44, -8], [0, 58, 2], [6, 40, 10]]) s += `<path d="M${x + dx},66 q${lean * 0.4},${-h * 0.55} ${lean},${-h}" fill="none" stroke="#5c934e" stroke-width="4" stroke-linecap="round"/>`;
      s += `<rect x="${x - 1}" y="${66 - 58 - 2}" width="6" height="15" rx="3" fill="#9a7f5c" stroke="#6f5b40" stroke-width="1.5"/>`;
      s += leaf(x - 12, 70, -50, 24, 8, '#79ad62', '#4f8445', false) + leaf(x + 12, 70, 55, 22, 7, '#6aa55a', '#4b7f40', false);
      return s;
    },
  });
  return out;
}

// ======================================================================
// BAMBOO GROVE
// ======================================================================
function bambooStalk(x, top, bottom, w, fill, node, op = 1) {
  let s = `<g opacity="${op}"><rect x="${f(x - w / 2)}" y="${f(top)}" width="${f(w)}" height="${f(bottom - top)}" fill="${fill}"/>`;
  for (let y = bottom - 70; y > top + 10; y -= 70 + ((x * 7) % 23)) s += `<rect x="${f(x - w / 2 - 1)}" y="${f(y)}" width="${f(w + 2)}" height="${f(Math.max(2, w * 0.16))}" rx="1" fill="${node}"/>`;
  return s + '</g>';
}
function bamboo() {
  const out = {};
  {
    const defs = lin('g', [[0, '#d9ebbd'], [0.6, '#eef0c6'], [1, '#f7e7b4']]);
    let b = `<rect width="960" height="540" fill="url(#g)"/>`;
    // soft light shafts
    for (const [x, w] of [[180, 70], [420, 110], [690, 80], [860, 50]]) b += `<path d="M${x},0 h${w} l${-w * 1.6},540 h${-w}Z" fill="#fffbe2" opacity=".28"/>`;
    out.sky = svg(960, 540, b, defs);
  }
  {
    const rng = RNG(33);
    let b = '';
    // far layer of misty stalks
    let s1 = '';
    for (let i = 0; i < 40; i++) { const x = i * 48 + rng.range(-14, 14), w = rng.range(10, 16); s1 += tile(x, w, X => bambooStalk(X, -10, 320, w, '#c8d79f', '#b4c68a')); }
    b += s1;
    // leaf sprays on far stalks
    let lv = '';
    for (let i = 0; i < 70; i++) { const x = rng.range(0, W), y = rng.range(20, 200), r = rng.range(-60, 60) + (rng.next() < 0.5 ? 180 : 0); lv += tile(x, 40, X => `<g transform="translate(${f(X)},${f(y)}) rotate(${f(r)})"><path d="${leafD(38, 7)}" fill="#bccf8e"/></g>`); }
    b += lv;
    b += `<rect x="-2" y="0" width="${W + 4}" height="330" fill="#f2f0cc" opacity=".35"/>`;
    // nearer stalks
    let s2 = '';
    for (let i = 0; i < 18; i++) { const x = i * (W / 18) + rng.range(-25, 25), w = rng.range(18, 26); s2 += tile(x, w, X => bambooStalk(X, -10, 320, w, '#a9c27a', '#8fa964')); }
    b += s2;
    let lv2 = '';
    for (let i = 0; i < 46; i++) { const x = rng.range(0, W), y = rng.range(10, 170), r = rng.range(-70, 70) + (rng.next() < 0.5 ? 180 : 0); lv2 += tile(x, 50, X => `<g transform="translate(${f(X)},${f(y)}) rotate(${f(r)})"><path d="${leafD(50, 9)}" fill="#9fbb6c"/></g>`); }
    b += lv2;
    // low shrubs at base
    let sh = '';
    for (let i = 0; i < 34; i++) { const x = i * (W / 34) + rng.range(-15, 15), r = rng.range(20, 30); sh += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(258 - r * 0.35)}" r="${f(r)}"/>`); }
    b += `<g fill="#a7bd76">${sh}</g><rect x="-2" y="252" width="${W + 4}" height="70" fill="#a7bd76"/>`;
    b += `<rect x="-2" y="120" width="${W + 4}" height="200" fill="url(#hz)"/>`;
    out.far = svg(W, 540, b, lin('hz', [[0, '#f6f1cf', 0], [1, '#f6f1cf', 0.5]]));
  }
  {
    const rng = RNG(44);
    const defs = lin('gr', [[0, '#cbc795'], [0.4, '#bdb985'], [1, '#a5a572']]);
    let b = ridge(wave(242, [[3, 3, 0.2], [2, 8, 1.4], [1, 15, 0.7]]), 540, 'fill="#a9b774"');
    b += ridge(wave(250, [[3, 3, 0.5], [2, 7, 2.2], [1.2, 13, 0.1]]), 540, 'fill="url(#gr)"');
    // back edge grass
    for (let i = 0; i < 90; i++) { const x = rng.range(0, W); b += tile(x, 10, X => tuft(X, 252 + rng.range(-2, 3), rng.range(10, 16), '#98a862', 0.8, 2.4)); }
    b += groundTexture(rng, 255, { patches: 26, patchLight: '#d6d59e', patchDark: '#9ba868', patchOp: 0.35, tufts: 90, tuft: '#97a560', tuftOp: 0.5, pebbles: 0 });
    // fallen bamboo leaves (low contrast)
    for (let i = 0; i < 60; i++) {
      const x = rng.range(0, W), y = rng.range(270, 520), k = 0.6 + (y - 255) / 380, r = rng.range(0, 360);
      b += tile(x, 20, X => `<g transform="translate(${f(X)},${f(y)}) rotate(${f(r)}) scale(${f(k)},${f(k * 0.55)})"><path d="${leafD(22, 4.5)}" fill="${rng.next() < 0.5 ? '#c9bf7f' : '#a7b26c'}" opacity=".75"/></g>`);
    }
    // a few short stalk bases at the very back edge (between the L1 back-row critters)
    b += `<rect x="-2" y="470" width="${W + 4}" height="70" fill="url(#fd)"/>`;
    out.floor = svg(W, 540, b, defs + lin('fd', [[0, '#8e9a5c', 0], [1, '#8e9a5c', 0.35]]));
  }
  {
    // near: a bamboo stalk at each edge with leaf sprays at the top corners
    let b = '';
    b += bambooStalk(26, -10, 560, 36, '#8fae5a', '#6e8c40') + `<rect x="10" y="-10" width="7" height="570" fill="#b2cc7a" opacity=".7"/>`;
    b += bambooStalk(70, -10, 560, 22, '#9cb866', '#7a9748', 0.95);
    b += bambooStalk(936, -10, 560, 36, '#8fae5a', '#6e8c40') + `<rect x="921" y="-10" width="7" height="570" fill="#b2cc7a" opacity=".7"/>`;
    b += bambooStalk(893, -10, 560, 20, '#9cb866', '#7a9748', 0.95);
    const spray = (x, y, base, n) => { let s = ''; for (let i = 0; i < n; i++) s += leaf(x, y, base + i * 18, 95 - i * 6, 13, i % 2 ? '#8fb35a' : '#7ca24c', '#5b7d34'); return s; };
    b += spray(40, 40, 70, 5) + spray(60, 150, 100, 3);
    b += spray(920, 40, -70 - 72, 5) + spray(900, 150, -100 - 36, 3);
    b += spray(30, 540, 30, 3) + spray(930, 540, -66, 3);
    out.near = svg(960, 540, b);
  }
  out.burrow = burrowSet({
    rim: '#b9d67c', rimHi: '#d6eaa0', rimSh: '#93b456', line: '#4e6a26', hole: '#2a321c', inner: '#6f8a3e',
    pot: { wall: '#93bb52', wallHi: '#b2d470', wallSh: '#769e3e', node: '#5e8430', depth: 30 },
    tuft: (side) => {
      const x = side > 0 ? 146 : 24;
      return leaf(x, 74, side * 35, 38, 9, '#8fb35a', '#5b7d34') + leaf(x - side * 4, 76, side * 70, 30, 8, '#7ca24c', '#5b7d34') + leaf(x + side * 2, 74, side * 5, 26, 7, '#9fc066', '#5b7d34');
    },
  });
  return out;
}

// ======================================================================
// TREETOP CANOPY
// ======================================================================
function canopy() {
  const out = {};
  {
    const defs = lin('g', [[0, '#86c9ea'], [0.6, '#bfe6f3'], [1, '#e6f5ee']]);
    let b = `<rect width="960" height="540" fill="url(#g)"/>`;
    const cloud = (x, y, k, op) => `<g opacity="${op}" fill="#ffffff"><ellipse cx="${x}" cy="${y}" rx="${90 * k}" ry="${22 * k}"/><circle cx="${x - 40 * k}" cy="${y - 12 * k}" r="${26 * k}"/><circle cx="${x + 5 * k}" cy="${y - 26 * k}" r="${36 * k}"/><circle cx="${x + 50 * k}" cy="${y - 8 * k}" r="${24 * k}"/></g>`;
    b += cloud(220, 200, 1.2, 0.85) + cloud(640, 130, 1.0, 0.8) + cloud(860, 300, 0.8, 0.6) + cloud(80, 330, 0.7, 0.55) + cloud(470, 290, 0.6, 0.5);
    out.sky = svg(960, 540, b, defs);
  }
  {
    // far: distant tree crowns *below* us (we are high up) plus distant trunks and hanging vines
    const rng = RNG(55);
    let b = '';
    // distant giant trees with crowns
    for (const [x, top, r] of [[200, 90, 110], [700, 60, 130], [1150, 100, 100], [1600, 70, 120]]) {
      b += tile(x, r * 1.6, X => {
        let s = `<path d="M${X - 16},540 L${X - 10},${top + 60} L${X + 10},${top + 60} L${X + 16},540Z" fill="#a7cdc6"/>`;
        s += `<g fill="#b4d8cc">`;
        for (const [dx, dy, k] of [[0, 0, 1], [-r * 0.8, 30, 0.7], [r * 0.8, 26, 0.72], [-r * 0.35, -30, 0.7], [r * 0.4, -24, 0.66]]) s += `<circle cx="${f(X + dx)}" cy="${f(top + 40 + dy)}" r="${f(r * k * 0.7)}"/>`;
        return s + '</g>';
      });
    }
    // sea of crowns below
    let cr = '';
    for (let i = 0; i < 40; i++) { const x = i * 48 + rng.range(-10, 10), r = rng.range(34, 52); cr += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(262 - r * 0.2 + rng.range(-8, 8))}" r="${f(r)}"/>`); }
    b += `<g fill="#9fcab5">${cr}</g><rect x="-2" y="262" width="${W + 4}" height="60" fill="#9fcab5"/>`;
    let cr2 = '';
    for (let i = 0; i < 30; i++) { const x = i * 64 + rng.range(-10, 10), r = rng.range(30, 44); cr2 += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(292 - r * 0.1)}" r="${f(r)}"/>`); }
    b += `<g fill="#8dbfa4">${cr2}</g><rect x="-2" y="292" width="${W + 4}" height="40" fill="#8dbfa4"/>`;
    // hanging vines from above
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, W), len = rng.range(80, 190);
      b += tile(x, 20, X => {
        let s = `<path d="M${f(X)},-5 q${f(rng.range(-14, 14))},${f(len * 0.5)} ${f(rng.range(-6, 6))},${f(len)}" fill="none" stroke="#98c4ad" stroke-width="3"/>`;
        for (let y = 20; y < len; y += 26) s += `<g transform="translate(${f(X)},${f(y)}) rotate(${y % 52 ? 140 : -140})"><path d="${leafD(16, 5)}" fill="#98c4ad"/></g>`;
        return s;
      });
    }
    b += `<rect x="-2" y="150" width="${W + 4}" height="190" fill="url(#hz)"/>`;
    out.far = svg(W, 540, b, lin('hz', [[0, '#eaf6f4', 0], [1, '#eaf6f4', 0.5]]));
  }
  {
    // floor: the top of a huge mossy branch, bark lip at the back, bark side at the bottom
    const rng = RNG(66);
    const defs = lin('moss', [[0, '#adc488'], [0.5, '#9fb97c'], [1, '#90ad70']]) + lin('bark', [[0, '#a59a85'], [1, '#8a7f6c']]);
    let b = ridge(wave(232, [[4, 2, 0.6], [2, 5, 1.1], [1, 13, 2]]), 540, 'fill="url(#bark)"');
    b += ridge(wave(234, [[4, 2, 0.6], [2, 5, 1.1], [1, 13, 2]]), 241, 'fill="#bcb19b"');
    // bark grain on the back lip
    for (let i = 0; i < 30; i++) { const x = rng.range(0, W), l = rng.range(40, 120); b += tile(x, l, X => `<path d="M${f(X)},${f(244 + rng.range(-2, 2))}q${f(l / 2)},${f(rng.range(-3, 3))} ${f(l)},0" fill="none" stroke="#7d7261" stroke-width="2" stroke-linecap="round" opacity=".6"/>`); }
    // moss top
    b += ridge(wave(252, [[4, 2, 0.9], [2.5, 6, 0.3], [1.2, 15, 1.4]]), 540, 'fill="url(#moss)"');
    // long faint grain grooves through the moss (shows it's a branch)
    for (let i = 0; i < 16; i++) {
      const y = 280 + i * 15 + rng.range(-4, 4), x = rng.range(0, W), l = rng.range(160, 420);
      b += tile(x, l, X => `<path d="M${f(X)},${f(y)}q${f(l / 2)},${f(rng.range(-6, 6))} ${f(l)},${f(rng.range(-3, 3))}" fill="none" stroke="#86a066" stroke-width="${f(2 + i * 0.12)}" stroke-linecap="round" opacity=".55"/>`);
    }
    // exposed bark streaks along the grain (tapered, low contrast) – makes the floor read as a branch
    for (let i = 0; i < 44; i++) {
      const y = rng.range(268, 505), x = rng.range(0, W), k = 0.6 + (y - 256) / 300, l = rng.range(120, 300) * k, t = rng.range(5, 9) * k;
      b += tile(x, l, X => `<path d="M${f(X)},${f(y)}Q${f(X + l * 0.5)},${f(y - t)} ${f(X + l)},${f(y + 1)}Q${f(X + l * 0.5)},${f(y + t * 0.6)} ${f(X)},${f(y)}Z" fill="#a89e87" opacity=".7"/>`);
    }
    b += groundTexture(rng, 256, { patches: 22, patchLight: '#bccf96', patchDark: '#88a466', patchOp: 0.35, tufts: 70, tuft: '#7f9c5f', tuftOp: 0.5, pebbles: 0 });
    // mossy edge tufts at the back lip
    for (let i = 0; i < 70; i++) { const x = rng.range(0, W); b += tile(x, 10, X => tuft(X, 254, rng.range(7, 12), '#8fab6c', 0.9, 2.4)); }
    // a few tiny mushrooms + leaf sprigs at the back lip (between L2 back-row critters: stage 405/555 ± → file 860-900, 1010-1050)
    for (const x of [260, 640, 880, 1030, 1330, 1700]) b += tile(x, 20, X => `<path d="M${X - 3},256 v-9 h6 v9Z" fill="#efe6d3"/><path d="M${X - 9},248 q9,-11 18,0Z" fill="#e2d2b4" stroke="#b9a684" stroke-width="1.5"/>`);
    // bark side at the bottom (under y 510 – below the play area)
    b += `<rect x="-2" y="440" width="${W + 4}" height="80" fill="url(#rd)"/>`;
    b += ridge(wave(512, [[3, 2, 0.1], [2, 7, 1.7]]), 540, 'fill="#93876f"');
    for (let i = 0; i < 18; i++) { const x = rng.range(0, W), l = rng.range(60, 160); b += tile(x, l, X => `<path d="M${f(X)},${f(rng.range(520, 534))}h${f(l)}" stroke="#7a6f5b" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`); }
    b += ridge(wave(512, [[3, 2, 0.1], [2, 7, 1.7]]).map(([x, y]) => [x, y - 4]), 517, 'fill="#86a066" opacity=".9"');
    out.floor = svg(W, 540, b, defs + lin('rd', [[0, '#6f8a58', 0], [1, '#6f8a58', 0.4]]));
  }
  {
    // near: leafy branches poking in at the top corners, vines down the sides
    let b = '';
    const LC = [['#5f9e5c', '#437a44'], ['#73b06a', '#518a4c'], ['#4f8f52', '#3a6e3e']];
    b += `<path d="M-20,58 Q90,40 200,0" fill="none" stroke="#8a7f6c" stroke-width="16" stroke-linecap="round"/>`;
    b += `<path d="M980,70 Q860,44 760,-6" fill="none" stroke="#8a7f6c" stroke-width="16" stroke-linecap="round"/>`;
    const cluster = (x, y, base, dir) => { let s = ''; for (let i = 0; i < 5; i++) { const c = LC[i % 3]; s += leaf(x + dir * i * 22, y - i * 8, base + dir * (i * 22 - 40), 70, 26, c[0], c[1]); } return s; };
    b += cluster(10, 70, 160, 1) + cluster(120, 30, 190, 1);
    b += cluster(950, 80, -160, -1) + cluster(840, 36, -190, -1);
    const vine = (x, len, dir) => {
      let s = `<path d="M${x},-5 q${dir * 30},${len * 0.5} ${dir * 6},${len}" fill="none" stroke="#5a8a4a" stroke-width="4"/>`;
      for (let y = 40; y < len; y += 34) s += leaf(x + dir * Math.sin(y / len * Math.PI) * 14, y, (y / 34) % 2 ? 140 : -140, 26, 10, '#6aa860', '#467f44', false);
      return s;
    };
    b += vine(36, 360, 1) + vine(92, 220, 1) + vine(926, 380, -1) + vine(866, 230, -1);
    b += leaf(-10, 560, 50, 110, 34, LC[0][0], LC[0][1]) + leaf(970, 560, -50, 110, 34, LC[1][0], LC[1][1]);
    out.near = svg(960, 540, b);
  }
  out.burrow = burrowSet({
    rim: '#b8a283', rimHi: '#d3c1a1', rimSh: '#957f62', line: '#5f4c38', hole: '#26201a', inner: '#6b5640',
    rings: '#987f60', lumps: false, knot: true,
    tuft: (side) => {
      const x = side > 0 ? 142 : 28;
      let s = `<path d="M${x - 18},72 q8,-14 18,-12 q12,-2 20,12Z" fill="#8fb06b" stroke="#647f48" stroke-width="2.5"/>`;
      s += leaf(x, 64, side * 25, 30, 10, '#6aa860', '#467f44') + leaf(x + side * 8, 66, side * 70, 24, 8, '#7fb870', '#467f44', false);
      return s;
    },
  });
  return out;
}

// ======================================================================
// WATERFALL RUINS AT DUSK
// ======================================================================
function ruins() {
  const out = {};
  {
    const defs = lin('g', [[0, '#4d4577'], [0.4, '#86628c'], [0.75, '#e2907b'], [1, '#f6c08c']]) +
      rad('sun', [[0, '#ffe2b0', 0.9], [0.3, '#ffcf9a', 0.45], [1, '#ffcf9a', 0]]);
    let b = `<rect width="960" height="540" fill="url(#g)"/><circle cx="300" cy="330" r="240" fill="url(#sun)"/><circle cx="300" cy="300" r="44" fill="#ffe0b2" opacity=".85"/>`;
    const rng = RNG(77);
    for (let i = 0; i < 26; i++) b += `<circle cx="${f(rng.range(0, 960))}" cy="${f(rng.range(8, 150))}" r="${f(rng.range(1, 2.2))}" fill="#fff6e8" opacity="${f(rng.range(0.4, 0.9))}"/>`;
    // thin dusk clouds
    for (const [x, y, w] of [[140, 200, 220], [620, 170, 300], [820, 250, 180], [420, 240, 160]]) b += `<rect x="${x}" y="${y}" width="${w}" height="9" rx="4.5" fill="#f3b38f" opacity=".55"/><rect x="${x + 40}" y="${y + 13}" width="${w * 0.6}" height="6" rx="3" fill="#f3b38f" opacity=".4"/>`;
    // crescent moon (no star shapes: stars are gameplay items)
    b += `<path d="M820,70 a26,26 0 1 0 22,40 a20,20 0 1 1 -22,-40Z" fill="#fbeedd" opacity=".85"/>`;
    out.sky = svg(960, 540, b, defs);
  }
  {
    // far: cliff with a waterfall, ruined temple silhouettes, jungle silhouettes
    const rng = RNG(88);
    const defs = lin('fall', [[0, '#e9e1f0'], [1, '#c9c3dc']]) + lin('hz', [[0, '#f0b48e', 0], [1, '#e8b494', 0.45]]);
    let b = '';
    // distant hills
    b += ridge(wave(210, [[20, 2, 0.1], [10, 5, 2.2], [5, 9, 1]]), 330, 'fill="#8a6f8e"');
    // two cliffs with waterfalls (one per 960 so it always shows)
    for (const cx of [560, 1520]) {
      b += tile(cx, 180, X => {
        let s = `<path d="M${X - 170},330 L${X - 150},120 Q${X - 120},92 ${X - 60},96 L${X + 60},96 Q${X + 120},90 ${X + 150},124 L${X + 175},330Z" fill="#6f5f80"/>`;
        s += `<path d="M${X - 150},120 Q${X - 120},92 ${X - 60},96 L${X + 60},96 Q${X + 120},90 ${X + 150},124 L${X + 140},140 Q${X},112 ${X - 140},140Z" fill="#7d8f6e"/>`;
        s += `<path d="M${X - 34},100 L${X + 34},100 L${X + 42},300 L${X - 42},300Z" fill="url(#fall)"/>`;
        for (let i = 0; i < 7; i++) { const dx = -28 + i * 9.5; s += `<path d="M${X + dx},${110 + (i % 3) * 14} L${X + dx * 1.15},${280 - (i % 2) * 20}" stroke="#ffffff" stroke-width="2.5" opacity=".55" stroke-linecap="round"/>`; }
        s += `<ellipse cx="${X}" cy="300" rx="70" ry="18" fill="#efe9f4" opacity=".8"/>`;
        for (const [dx, dy, r] of [[-40, 292, 16], [-12, 286, 20], [20, 290, 18], [46, 296, 14]]) s += `<circle cx="${X + dx}" cy="${dy}" r="${r}" fill="#f6f1f8" opacity=".75"/>`;
        return s;
      });
    }
    // ruined temple silhouettes
    const temple = X => {
      let s = '<g fill="#5c5170">';
      s += `<rect x="${X - 80}" y="210" width="160" height="120"/><rect x="${X - 60}" y="180" width="120" height="34"/><rect x="${X - 38}" y="156" width="76" height="28"/><rect x="${X - 18}" y="136" width="36" height="24"/>`;
      s += `</g><rect x="${X - 14}" y="250" width="28" height="80" rx="14" fill="#463e58"/>`;
      return s;
    };
    for (const x of [180, 980, 1200]) b += tile(x, 90, temple);
    for (const x of [330, 380, 820, 1360, 1410, 1820]) { const h = rng.range(60, 110); b += tile(x, 14, X => `<rect x="${X - 11}" y="${f(330 - h - 120)}" width="22" height="${f(h + 120)}" fill="#5c5170"/><rect x="${X - 15}" y="${f(330 - h - 128)}" width="30" height="10" fill="#5c5170"/>`); }
    // jungle silhouettes in front
    let cr = '';
    for (let i = 0; i < 36; i++) { const x = i * (W / 36) + rng.range(-15, 15), r = rng.range(22, 36); cr += tile(x, r, X => `<circle cx="${f(X)}" cy="${f(262 - r * 0.3)}" r="${f(r)}"/>`); }
    b += `<g fill="#4f5a5e">${cr}</g><rect x="-2" y="258" width="${W + 4}" height="70" fill="#4f5a5e"/>`;
    b += `<rect x="-2" y="160" width="${W + 4}" height="170" fill="url(#hz)"/>`;
    out.far = svg(W, 540, b, defs);
  }
  {
    // floor: old mossy flagstones, warm dusk light at the back
    const rng = RNG(99);
    const defs = lin('st', [[0, '#a59f92'], [0.5, '#949689'], [1, '#858b7d']]) + lin('glow', [[0, '#f2b88e', 0.32], [1, '#f2b88e', 0]]);
    // low back wall
    let b = ridge(wave(228, [[2, 4, 0.3]], 20), 540, 'fill="#7c7a78"');
    for (let x = 0; x < W; x += 64) b += `<rect x="${x + 2}" y="232" width="60" height="13" rx="3" fill="#8b8784"/><rect x="${x + 34}" y="246" width="60" height="10" rx="3" fill="#85817e"/>`;
    b += ridge(wave(256, [[2, 3, 0.8], [1.5, 9, 0.3]]), 540, 'fill="url(#st)"');
    // flagstone joints (perspective rows), very faint
    let joints = '';
    let y = 256, rowH = 26;
    while (y < 540) {
      joints += `<path d="M-2,${f(y)}H${W + 2}" />`;
      const off = rng.range(0, 60), cw = rowH * 3.4;
      for (let x = off; x < W; x += cw + rng.range(-10, 10)) joints += `<path d="M${f(x)},${f(y)}l${f((x - 960) * 0.02)},${f(rowH)}"/>`;
      y += rowH; rowH *= 1.14;
    }
    b += `<g stroke="#767c70" stroke-width="2" opacity=".45" fill="none">${joints}</g>`;
    // moss patches
    for (let i = 0; i < 34; i++) {
      const x = rng.range(0, W), yy = rng.range(270, 520), k = 0.6 + (yy - 256) / 380, rx = rng.range(30, 70) * k;
      b += tile(x, rx, X => `<ellipse cx="${f(X)}" cy="${f(yy)}" rx="${f(rx)}" ry="${f(rx * 0.25)}" fill="#7f9364" opacity=".45"/>`);
    }
    b += groundTexture(rng, 262, { patches: 14, patchLight: '#b5ad9c', patchDark: '#7c8172', patchOp: 0.3, tufts: 60, tuft: '#6f8659', tuftOp: 0.6, pebbles: 20, pebble: '#b1aa9b', pebbleOp: 0.6 });
    b += `<rect x="-2" y="256" width="${W + 4}" height="90" fill="url(#glow)"/>`;
    b += `<rect x="-2" y="470" width="${W + 4}" height="70" fill="url(#fd)"/>`;
    // fern tufts along the wall (between L3 back-row critters)
    for (const x of [140, 650, 880, 1040, 1270, 1760]) b += tile(x, 30, X => leaf(X, 258, -60, 28, 7, '#6f8c5c', '#566f47', false) + leaf(X, 258, -15, 34, 7, '#7c9a66', '#566f47', false) + leaf(X, 258, 35, 30, 7, '#6f8c5c', '#566f47', false));
    out.floor = svg(W, 540, b, defs + lin('fd', [[0, '#4f5149', 0], [1, '#4f5149', 0.35]]));
  }
  {
    // near: a broken pillar on the left, dusky vines and leaves at the corners
    let b = '';
    const LC = [['#4f7a5c', '#36573f'], ['#5d8a64', '#3f6346'], ['#466e52', '#30503a']];
    b += `<path d="M-10,560 L-10,190 L18,172 L40,196 L66,180 L74,560Z" fill="#8a8380" stroke="#5f5957" stroke-width="3"/>`;
    for (const yy of [250, 330, 410, 490]) b += `<path d="M-10,${yy}H74" stroke="#6e6866" stroke-width="3"/>`;
    b += `<path d="M10,200 q20,60 4,140 q-6,40 20,90" fill="none" stroke="#5f8a52" stroke-width="5"/>`;
    b += leaf(14, 280, 60, 30, 11, '#6f9a5c', '#4b6f40', false) + leaf(26, 380, -50, 28, 10, '#6f9a5c', '#4b6f40', false);
    b += leaf(-10, 30, 120, 140, 38, LC[0][0], LC[0][1]) + leaf(20, -10, 150, 110, 32, LC[1][0], LC[1][1]);
    b += leaf(970, 20, -120, 150, 40, LC[1][0], LC[1][1]) + leaf(950, -10, -150, 110, 32, LC[2][0], LC[2][1]) + leaf(985, 140, -95, 110, 30, LC[0][0], LC[0][1]);
    const vine = (x, len) => { let s = `<path d="M${x},-5 q-26,${len * 0.5} -4,${len}" fill="none" stroke="#4d7346" stroke-width="4"/>`; for (let yy = 40; yy < len; yy += 34) s += leaf(x - Math.sin(yy / len * Math.PI) * 12, yy, (yy / 34) % 2 ? 140 : -140, 26, 10, '#5d8a5a', '#3f6346', false); return s; };
    b += vine(918, 330) + vine(868, 200);
    b += leaf(970, 560, -50, 120, 34, LC[0][0], LC[0][1]) + leaf(930, 570, -20, 90, 28, LC[2][0], LC[2][1]);
    out.near = svg(960, 540, b);
  }
  out.burrow = burrowSet({
    rim: '#a8aa9f', rimHi: '#c6c7bb', rimSh: '#888b80', line: '#62655c', hole: '#25262a', inner: '#5d5f5a',
    pot: { wall: '#999c90', wallHi: '#b4b6aa', wallSh: '#7e8176', node: null, blocks: '#74776d', depth: 28 },
    moss: '#7f9a5a',
    tuft: (side) => {
      const x = side > 0 ? 144 : 26;
      return `<path d="M${x - 16},74 q4,-12 16,-12 q12,0 16,12Z" fill="#7f9a5a" stroke="#5b733f" stroke-width="2.5"/>` +
        leaf(x, 66, side * 20, 30, 8, '#7c9a66', '#566f47') + leaf(x - side * 6, 68, side * 65, 24, 7, '#6f8c5c', '#566f47', false) + leaf(x + side * 6, 68, -side * 25, 22, 7, '#86a46e', '#566f47', false);
    },
  });
  return out;
}

// ======================================================================
// BURROWS (170×90, anchor = rim centre (85,45))
// rim ellipse rx 72 ry 24 → x 13..157, y 21..69. Opening rx 56 ry 15 → y 30..60.
// back  = ground shadow + full rim + dark opening + lit inner far wall.
// front = lower half of the rim (lip) + a "throat" fade that hides the critter clip line (by+4s) + tuft.
// ======================================================================
function burrowSet(o) {
  const CX = 85, CY = 45, RX = 72, RY = 24, OX = 56, OY = 15;
  const sideBy = o.tuftSide || 1;
  const defs = lin('th', [[0, o.hole, 0], [1, o.hole, 1]], 0, CY - 3, 0, CY + 5, 'userSpaceOnUse');
  // ---- back
  let back = `<ellipse cx="${CX}" cy="${CY + 8}" rx="${RX + 8}" ry="${RY + 6}" fill="#1e2a14" opacity=".26"/>`;
  if (o.pot) back += `<ellipse cx="${CX}" cy="${CY + o.pot.depth + 6}" rx="${RX + 6}" ry="${RY - 4}" fill="#1e2a14" opacity=".2"/>`;
  back += `<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="${o.rim}" stroke="${o.line}" stroke-width="3"/>`;
  // highlight on the far (upper) rim
  back += `<path d="M${CX - RX + 12},${CY - 8} Q${CX},${CY - RY - 6} ${CX + RX - 12},${CY - 8} Q${CX},${CY - RY + 4} ${CX - RX + 12},${CY - 8}Z" fill="${o.rimHi}"/>`;
  if (o.rings) back += `<ellipse cx="${CX}" cy="${CY}" rx="${OX + 8}" ry="${OY + 4.5}" fill="none" stroke="${o.rings}" stroke-width="2"/>`;
  if (o.lumps) for (const [dx, dy, r] of [[-50, -10, 9], [-18, -19, 8], [22, -19, 9], [52, -9, 8]]) back += `<ellipse cx="${CX + dx}" cy="${CY + dy}" rx="${r * 1.4}" ry="${r * 0.7}" fill="${o.rimHi}" opacity=".7"/>`;
  if (o.moss) back += `<path d="M${CX - 40},${CY - 17} q12,-9 26,-4 q8,-5 16,1 l-2,4 q-20,-2 -40,3Z" fill="${o.moss}"/>`;
  // dark opening + lit far inner wall (crescent)
  back += `<ellipse cx="${CX}" cy="${CY}" rx="${OX}" ry="${OY}" fill="${o.hole}" stroke="${o.line}" stroke-width="3"/>`;
  back += `<path d="M${CX - OX + 4},${CY - 3} A${OX - 4} ${OY - 2} 0 0 1 ${CX + OX - 4},${CY - 3} A${OX - 4} ${OY - 7} 0 0 0 ${CX - OX + 4},${CY - 3}Z" fill="${o.inner}" opacity=".9"/>`;
  // ---- front
  let front = '';
  // throat: lower half of opening fading in to hide the critter's clip line
  front += `<path d="M${CX - OX},${CY} A${OX} ${OY} 0 0 0 ${CX + OX},${CY}Z" fill="url(#th)"/>`;
  if (o.pot) {
    const P = o.pot, D = P.depth;
    // cylinder front wall
    front += `<path d="M${CX - RX},${CY} L${CX - RX + 2},${CY + D} A${RX - 2} ${RY - 4} 0 0 0 ${CX + RX - 2},${CY + D} L${CX + RX},${CY} A${RX} ${RY} 0 0 1 ${CX - RX},${CY}Z" fill="${P.wall}" stroke="${o.line}" stroke-width="3" stroke-linejoin="round"/>`;
    // shade on the right, highlight band on the left
    front += `<path d="M${CX + 30},${CY + RY - 2} L${CX + 30},${CY + D + RY - 6} A${RX - 2} ${RY - 4} 0 0 0 ${CX + RX - 3},${CY + D} L${CX + RX - 1},${CY + 2} A${RX} ${RY} 0 0 1 ${CX + 30},${CY + RY - 2}Z" fill="${P.wallSh}"/>`;
    front += `<path d="M${CX - 52},${CY + 17} L${CX - 52},${CY + D + 14} L${CX - 40},${CY + D + 17} L${CX - 40},${CY + 20}Z" fill="${P.wallHi}"/>`;
    if (P.node) front += `<path d="M${CX - RX + 1},${CY + D * 0.55} A${RX - 1} ${RY - 2} 0 0 0 ${CX + RX - 1},${CY + D * 0.55}" fill="none" stroke="${P.node}" stroke-width="4"/>`;
    if (P.blocks) {
      front += `<path d="M${CX - RX + 1},${CY + D * 0.5} A${RX - 1} ${RY - 2} 0 0 0 ${CX + RX - 1},${CY + D * 0.5}" fill="none" stroke="${P.blocks}" stroke-width="2.5"/>`;
      for (const [x, y1, y2] of [[CX - 38, 62, 76], [CX + 2, 66, 82], [CX + 40, 62, 77], [CX - 18, 79, 93], [CX + 22, 80, 93]]) front += `<path d="M${x},${y1} L${x},${Math.min(y2, 88)}" stroke="${P.blocks}" stroke-width="2.5"/>`;
    }
    // re-stroke bottom outline
    front += `<path d="M${CX - RX + 2},${CY + D} A${RX - 2} ${RY - 4} 0 0 0 ${CX + RX - 2},${CY + D}" fill="none" stroke="${o.line}" stroke-width="3"/>`;
  }
  // lip = lower half of rim ring
  front += `<path d="M${CX - RX},${CY} A${RX} ${RY} 0 0 0 ${CX + RX},${CY} L${CX + OX},${CY} A${OX} ${OY} 0 0 1 ${CX - OX},${CY}Z" fill="${o.rim}"/>`;
  // flat darker step along the outer bottom of the lip
  front += `<path d="M${CX - RX + 6},${CY + 10} A${RX - 3} ${RY - 3} 0 0 0 ${CX + RX - 6},${CY + 10} A${RX} ${RY} 0 0 1 ${CX - RX + 6},${CY + 10}Z" fill="${o.rimSh}"/>`;
  if (o.lumps) for (const [dx, dy, r] of [[-46, 13, 8], [-14, 20, 9], [20, 20, 8], [50, 12, 8]]) front += `<ellipse cx="${CX + dx}" cy="${CY + dy - 2}" rx="${r * 1.4}" ry="${r * 0.6}" fill="${o.rimHi}" opacity=".55"/>`;
  if (o.rings) front += `<path d="M${CX - OX - 8},${CY} A${OX + 8} ${OY + 4.5} 0 0 0 ${CX + OX + 8},${CY}" fill="none" stroke="${o.rings}" stroke-width="2"/>`;
  // outlines: outer lower arc + inner lower arc (only if no pot wall below)
  if (!o.pot) front += `<path d="M${CX - RX},${CY} A${RX} ${RY} 0 0 0 ${CX + RX},${CY}" fill="none" stroke="${o.line}" stroke-width="3"/>`;
  front += `<path d="M${CX - OX},${CY} A${OX} ${OY} 0 0 0 ${CX + OX},${CY}" fill="none" stroke="${o.line}" stroke-width="3"/>`;
  if (o.moss) front += `<path d="M${CX + 10},${CY + 22} q14,-6 30,-2 q10,-1 16,-6 l3,5 q-20,12 -48,8Z" fill="${o.moss}"/>`;
  front += o.tuft(sideBy);
  return { back: svg(170, 90, back), front: svg(170, 90, front, defs) };
}

// ======================================================================
// PARTICLES
// ======================================================================
function particles() {
  const p = {};
  p.dragonfly = svg(48, 32,
    `<g fill="#eef9f8" stroke="#9cc6c8" stroke-width="1.3" opacity=".9"><ellipse cx="21" cy="7" rx="11" ry="3.4" transform="rotate(-24 27 14)"/><ellipse cx="32" cy="7" rx="10" ry="3.2" transform="rotate(26 27 14)"/><ellipse cx="21" cy="22" rx="10" ry="3.2" transform="rotate(22 27 15)"/><ellipse cx="32" cy="22" rx="9" ry="3" transform="rotate(-24 27 15)"/></g>` +
    `<path d="M6,15 L24,15" stroke="#4f9a7d" stroke-width="4" stroke-linecap="round"/><ellipse cx="27" cy="15" rx="5" ry="3.6" fill="#5fb08e" stroke="#3f7d64" stroke-width="1.5"/><circle cx="34" cy="15" r="4" fill="#6cc09c" stroke="#3f7d64" stroke-width="1.5"/><circle cx="35.5" cy="13.5" r="1.3" fill="#ffffff"/>`);
  p.leaf = svg(32, 32, `<g transform="translate(16,29) rotate(18)"><path d="${leafD(26, 9)}" fill="#86b85e" stroke="#5c8a3e" stroke-width="2"/><path d="M0,-2 Q1,-13 0,-23" fill="none" stroke="#5c8a3e" stroke-width="1.5"/></g>`);
  const bfly = (open) => {
    const sx = open ? 1 : 0.45;
    return svg(40, 36,
      `<g transform="translate(20,18) scale(${sx},1)"><path d="M0,-2 C-6,-16 -20,-18 -18,-6 C-17,0 -8,2 0,0Z" fill="#f2a65e" stroke="#b46a30" stroke-width="2"/><path d="M0,1 C-8,4 -16,12 -10,15 C-5,17 -1,9 0,3Z" fill="#f7c48a" stroke="#b46a30" stroke-width="2"/>` +
      `<path d="M0,-2 C6,-16 20,-18 18,-6 C17,0 8,2 0,0Z" fill="#f2a65e" stroke="#b46a30" stroke-width="2"/><path d="M0,1 C8,4 16,12 10,15 C5,17 1,9 0,3Z" fill="#f7c48a" stroke="#b46a30" stroke-width="2"/>` +
      `<circle cx="-11" cy="-8" r="2.4" fill="#fff4e4"/><circle cx="11" cy="-8" r="2.4" fill="#fff4e4"/></g>` +
      `<rect x="18.5" y="9" width="3" height="18" rx="1.5" fill="#6b4a32"/><path d="M19,10 q-3,-6 -6,-7 M21,10 q3,-6 6,-7" fill="none" stroke="#6b4a32" stroke-width="1.3" stroke-linecap="round"/>`);
  };
  p.butterfly_0 = bfly(true);
  p.butterfly_1 = bfly(false);
  p.firefly = svg(24, 24, `<circle cx="12" cy="12" r="12" fill="url(#ff)"/><circle cx="12" cy="12" r="3.5" fill="#fbffd8"/>`,
    rad('ff', [[0, '#f4ffb0', 0.95], [0.3, '#e2f78a', 0.6], [1, '#d6f070', 0]]));
  p.mist = svg(256, 96, `<ellipse cx="128" cy="52" rx="128" ry="44" fill="url(#m)"/><ellipse cx="90" cy="46" rx="70" ry="28" fill="url(#m)"/><ellipse cx="170" cy="56" rx="70" ry="26" fill="url(#m)"/>`,
    rad('m', [[0, '#f4eef6', 0.55], [0.6, '#f4eef6', 0.25], [1, '#f4eef6', 0]]));
  p.sparkle = svg(32, 32, `<path d="M16,1 Q18,14 31,16 Q18,18 16,31 Q14,18 1,16 Q14,14 16,1Z" fill="#fffbea" stroke="#f1dca0" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16" cy="16" r="3" fill="#ffffff"/>`);
  p.drop = svg(16, 24, `<path d="M8,1 C12,9 15,13 15,16.5 A7,7 0 0 1 1,16.5 C1,13 4,9 8,1Z" fill="#e3f1f6" stroke="#a9c9d6" stroke-width="1.5"/><ellipse cx="5.5" cy="16" rx="1.6" ry="2.6" fill="#ffffff"/>`);
  return p;
}

// ---------- main ----------
const BIOMES = { riverbank, bamboo, canopy, ruins };
const sizes = [];
for (const [name, fn] of Object.entries(BIOMES)) {
  const o = fn();
  for (const k of ['sky', 'far', 'floor', 'near']) sizes.push([`${name}/${k}.svg`, write(path.join(LV, name, `${k}.svg`), o[k])]);
  sizes.push([`${name}/burrow_back.svg`, write(path.join(LV, name, 'burrow_back.svg'), o.burrow.back)]);
  sizes.push([`${name}/burrow_front.svg`, write(path.join(LV, name, 'burrow_front.svg'), o.burrow.front)]);
}
write(path.join(LV, 'palette.json'), JSON.stringify(PAL, null, 2) + '\n');
for (const [k, s] of Object.entries(particles())) sizes.push([`particles/${k}.svg`, write(path.join(PT, `${k}.svg`), s)]);
for (const [n, b] of sizes) { if (b > 120 * 1024) console.warn('TOO BIG', n, b); }
console.log(sizes.map(([n, b]) => `${n} ${(b / 1024).toFixed(1)}KB`).join('\n'));
