// Bo's Farm Parade: sunny-farm environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, env/barn_{mood}.svg, env/barn_door_{l,r}.svg,
// env/vane.svg, env/{sun,moon,cloud_a,cloud_b}.svg and game/assets/default/particles/{mist,mote,sparkle,star,firefly,petal,
// butterfly,leaf,confetti_a,confetti_b,dot,dust,feather}.svg; any other (old) env / particle file is deleted.  (DESIGN §3, §4.4)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Look (deliberately NOT the Kitten's Balloon Farm look: no white Dutch windmill, no round bales, no picket fence): a quilt of
// patchwork fields with hedgerows and crop rows over two rolling hills, a lattice-tower WIND PUMP, a domed SILO + farmhouse,
// rows of columnar poplars; mid = a post-and-rail fence, beehive HAYSTACKS with a pole, a reed POND with cattails and lily
// pads, one big oak; ground = a clover meadow. Barn = a gambrel barn in muted terracotta with cream trim.
//
// Tiling: every layer is 1200 wide. Ridges / field boundaries are periodic functions of x (integer harmonics over 1200),
// props that cross x = 0 / 1200 are drawn twice (x and x ∓ 1200), rows use spacings that divide 1200 — both edges match
// pixel for pixel (docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm, desaturated, slightly yellow-green; no answer hue (red / blue / yellow / green / orange /
// purple / pink) in a saturated form — the answer colours must pop. Night is dark blue, not black; far + ground carry it.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far    0 0 1200 720 : transparent sky; farthest soft range (ridge ≈ y 380…430), back hills (ridge ≈ y 440…500), hill A with patchwork (ridge ≈ 490…560, wind
//                         pump + silo/farmhouse on it), hill B patchwork (ridge ≈ 585…640). Bottom 720 sits behind the mid bank.
//   mid    0 0 1200 300 : transparent top; meadow bank (≈ 236…300), big oak (x 330), pond (x 560), haystacks (x 800 / 880),
//                         post-and-rail fence all along (top rail top FENCE_TOP = 214: the rooster stands there). MID_BASE = 296.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (tufts poke up to ≈ 30); rows 80…200 stay calm (the path band
//                         is drawn by code there, centred on PATH_ROW = 140); flowers / clover / pebbles above and below;
//                         the bottom fades to GROUND_BOTTOM[m] (render fills below the tile with it).
//   barn   0 0 300 320  : base anchor (150, 316); DOORWAY = x 80…220, y 166…316 (dark, doors NOT painted); vane pivot
//                         (150, 12) on the ridge post; loft window centre (150, 104).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const MID_BASE = 296, GROUND_LINE = 40, FAR_BOTTOM = 720, FENCE_TOP = 214, PATH_ROW = 140;
const CALM = [80, 200];                                   // ground rows that stay plain (path band)
const BARN = { w: 300, h: 320, base: [150, 316], door: { x0: 80, x1: 220, y0: 166, y1: 316 }, vane: [150, 12], loft: [150, 104], lamp: [56, 176] };
const DOOR = { w: 70, h: 150 };
const VANE = { w: 80, h: 80, pivot: [40, 64] };
const f = n => (Math.round(n * 10) / 10).toString();
const T = (s, ...v) => s.reduce((a, str, i) => a + str + (i < v.length ? (typeof v[i] === 'number' ? f(v[i]) : v[i]) : ''), '');

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w) => ` stroke="${col}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) and its wrapped copies when the prop (half width `half`) crosses an edge
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
// draw fn(dx) for every 1200-shift that makes [xmin, xmax] + dx intersect [0, W]
const wrapSpan = (xmin, xmax, fn) => { let s = ''; for (const dx of [-W, 0, W]) if (xmax + dx > 0 && xmin + dx < W) s += fn(dx); return s; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);   // periodic
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------- palettes ----------------
// sky gradient per mood (DESIGN §3, exact); render paints it from y 0 to L.skyY1 and the last stop below
const SKY = {
  morning: [[0, '#F8DCC6'], [1, '#FDF4E3']],
  noon: [[0, '#7CC4EE'], [1, '#D6F0FB']],
  sunset: [[0, '#F29B6B'], [1, '#FBD7A5']],
  night: [[0, '#1E2A4A'], [1, '#3B4C78']],
};
// mood grading: base (noon) colour → mixed toward TINT[m] by t, then hazed toward HAZE[m] by distance
const TINT = { morning: ['#F6D9C6', 0.14], noon: ['#FFFFFF', 0.0], sunset: ['#B07A78', 0.30], night: ['#1A2650', 0.72] };
const HAZE = { morning: '#F8E8DA', noon: '#D4ECF4', sunset: '#F6C29C', night: '#3A4C7C' };
const RIM = { morning: '#FFF1DE', noon: '#FFFFFF', sunset: '#FFD6A0', night: '#FFD38A' };   // warm rim light on members
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#2E3440', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
// meadow colours (top of the near ground) and the fill below the ground tile
const MEADOW = { morning: '#B4C08F', noon: '#AFC189', sunset: '#B6AE7C', night: '#34495A' };
const GROUND_BOTTOM = { morning: '#9FAE7C', noon: '#9AAF77', sunset: '#A09468', night: '#2A3B4C' };
// the parade path band (drawn by code, env_scenes.js RECIPE.drawPath): fill / edge / darker ruts / lighter middle / pebbles / grass
const PATH = {
  morning: { fill: '#DCC4A0', edge: '#C2A57E', dark: '#B39470', light: '#E8D6B8', peb: '#BDB2A2', grass: '#95A774' },
  noon: { fill: '#D8BE95', edge: '#BFA27A', dark: '#AE8F68', light: '#E6D2B0', peb: '#B8AE9E', grass: '#8EA36E' },
  sunset: { fill: '#D9B790', edge: '#B8936E', dark: '#A88262', light: '#E7CBA8', peb: '#B7A08E', grass: '#929266' },
  night: { fill: '#646C86', edge: '#485070', dark: '#525A76', light: '#737B96', peb: '#7E86A0', grass: '#2C4252' },
};
// base colours (noon), all calm / desaturated
const FIELDS = ['#C9CF92', '#B2C48A', '#DCCB8E', '#A3B57C', '#D4C9A0', '#BCC79A', '#C8B98C', '#AFBF95'];  // wheat / sage / straw / olive / oat / ploughed
const HEDGE = '#7E9466', TREE = { c: '#8FA670', s: '#748B5A', l: '#AFC48E', o: '#5D7148' }, TRUNK = '#8C7258';
const WOOD = '#B39A7C', HAYC = '#D7BF88', POND = '#9DC3C2', REED = '#8A9C62', CATTAIL = '#8A6A4C', STONE = '#B8B4AA';
const BARN_C = { wall: '#B5735E', dark: '#7E4A3C', trim: '#F1E6CF', roof: '#6C4A46', stone: '#B2ADA2' };

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
const RIDGE_FAR = x => 404 + wave(x, [[1, 10, 2.2], [2, 12, 0.4], [5, 5, 1.3], [9, 2, 0.7]]);
const RIDGE_BACK = x => 470 + wave(x, [[2, 14, 0.3], [3, 10, 1.7], [7, 4, 0.5]]);
const RIDGE_A = x => 528 + wave(x, [[1, 22, 0.9], [2, 14, 2.6], [5, 5, 0.2]]);
const RIDGE_B = x => 612 + wave(x, [[1, 16, 2.4], [3, 11, 0.8], [4, 5, 1.9]]);
// a patchwork quilt on a hill: columns `cols` (periodic, last = first + 1200) skewed by `skew` per 100 px depth; rows `rows`
// (depths below the ridge). Returns svg.
function patchwork(m, ridge, cols, skew, rows, haze, seed, opt = {}) {
  const n = cols.length - 1, nr = rows.length - 1;
  const xl = (i, d) => cols[i] + skew[i % n] * d / 100 + (i === n ? 0 : 0);
  const xb = (i, d) => (i === n ? cols[0] + W + skew[0] * d / 100 : xl(i, d));
  // colour grid: neighbours differ (left, up, and wrap-around)
  const grid = [];
  for (let j = 0; j < nr; j++) {
    grid.push([]);
    for (let i = 0; i < n; i++) {
      let k = Math.floor(hsh(i + seed, j * 7 + seed) * FIELDS.length), tries = 0;
      while (tries++ < 10 && ((i > 0 && grid[j][i - 1] === k) || (j > 0 && grid[j - 1][i] === k) || (i === n - 1 && grid[j][0] === k))) k = (k + 3) % FIELDS.length;
      grid[j].push(k);
    }
  }
  let cells = '', stripes = '', hedges = '', dots = '';
  const sampleRow = (x0, x1, d) => { const pts = []; const st = Math.max(1, Math.ceil((x1 - x0) / 8)); for (let q = 0; q <= st; q++) { const x = x0 + (x1 - x0) * q / st; pts.push([x, ridge(x) + d]); } return pts; };
  for (let j = 0; j < nr; j++) for (let i = 0; i < n; i++) {
    const d0 = rows[j], d1 = rows[j + 1];
    const a0 = xb(i, d0), b0 = xb(i + 1, d0), a1 = xb(i, d1), b1 = xb(i + 1, d1);
    const base = FIELDS[grid[j][i]], col = tone(m, base, haze + (opt.depthHaze || 0) * (1 - j / nr));
    const lo = Math.min(a0, a1), hi = Math.max(b0, b1);
    const top = sampleRow(a0, b0, d0), bot = sampleRow(a1, b1, d1).reverse();
    cells += wrapSpan(lo, hi, dx => P(poly([...top, ...bot].map(p => [p[0] + dx, p[1]])), col));
    // crop rows: type by hash — 0 none, 1 rows along the contour, 2 converging furrows
    const ty = Math.floor(hsh(i * 3 + seed, j + 11) * 3);
    const sc = dk(col, 0.1);
    if (ty === 1 && d1 - d0 > 14) {
      const sp = 4 + d0 / 26;
      for (let d = d0 + sp; d < d1 - 2; d += sp) {
        const t = (d - d0) / (d1 - d0), x0 = a0 + (a1 - a0) * t + 2, x1 = b0 + (b1 - b0) * t - 2;
        const pts = sampleRow(x0, x1, d); stripes += wrapSpan(x0, x1, dx => S(line(pts.map(p => [p[0] + dx, p[1]])), sc, 1.3 + d0 / 140, ' opacity="0.55"'));
      }
    } else if (ty === 2 && d1 - d0 > 10) {
      const nn = Math.max(3, Math.round((b0 - a0) / (9 - d0 / 40)));
      for (let q = 1; q < nn; q++) {
        const u = q / nn, xt = a0 + (b0 - a0) * u, xbm = a1 + (b1 - a1) * u;
        stripes += wrapSpan(Math.min(xt, xbm), Math.max(xt, xbm), dx => S(T`M${xt + dx} ${ridge(xt) + d0 + 1}L${xbm + dx} ${ridge(xbm) + d1 - 1}`, sc, 1.2 + d0 / 160, ' opacity="0.5"'));
      }
    }
  }
  // hedgerows: along inner row boundaries (full width) and the column boundaries
  const hc = tone(m, HEDGE, haze), hw = opt.hedgeW || 2.4;
  for (let j = 1; j < nr; j++) {
    const pts = []; for (let x = 0; x <= W; x += 6) pts.push([x, ridge(x) + rows[j]]);
    hedges += S(line(pts), hc, hw + rows[j] / 120);
    // bumpy hedge: little round bushes, spacing divides 1200
    const sp = 24, r0 = 1.6 + rows[j] / 60;
    for (let x = (j * 7) % sp; x < W; x += sp) if (hsh(x, j + seed) < 0.55) dots += both(xx => C(xx, ridge(xx) + rows[j] - r0 * 0.5, r0, hc), x, r0);
  }
  for (let i = 0; i < n; i++) {
    const d0 = rows[0], d1 = rows[nr];
    const pts = []; for (let q = 0; q <= 10; q++) { const d = d0 + (d1 - d0) * q / 10, x = xb(i, d); pts.push([x, ridge(x) + d]); }
    const lo = Math.min(...pts.map(p => p[0])), hi = Math.max(...pts.map(p => p[0]));
    hedges += wrapSpan(lo, hi, dx => S(line(pts.map(p => [p[0] + dx, p[1]])), hc, hw));
  }
  // top-of-hill rim highlight
  const rim = []; for (let x = 0; x <= W; x += 6) rim.push([x, ridge(x) + 1.5]);
  return cells + `<g>${stripes}</g>` + hedges + dots + S(line(rim), lt(tone(m, FIELDS[0], haze), 0.35), 2.4, ' opacity="0.7"');
}
function hillFill(ridge, col) { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 6) pts.push([x, ridge(x)]); pts.push([W, 720]); return P(poly(pts), col); }
function tinyTree(x, yb, r, col, colS) { return C(x, yb - r * 1.2, r, col) + C(x + r * 0.35, yb - r * 1.0, r * 0.7, colS) + R(x - r * 0.15, yb - r * 0.4, r * 0.3, r * 0.5, colS); }
function poplar(x, yb, h, col, colS) { const w = h * 0.2; return P(T`M${x} ${yb - h}Q${x + w} ${yb - h * 0.6} ${x + w * 0.8} ${yb - h * 0.12}Q${x} ${yb + 2} ${x - w * 0.8} ${yb - h * 0.12}Q${x - w} ${yb - h * 0.6} ${x} ${yb - h}Z`, col) + P(T`M${x} ${yb - h}Q${x + w} ${yb - h * 0.6} ${x + w * 0.8} ${yb - h * 0.12}Q${x + w * 0.3} ${yb} ${x + w * 0.1} ${yb - h * 0.1}Q${x + w * 0.35} ${yb - h * 0.6} ${x} ${yb - h}Z`, colS); }
// the lattice-tower wind pump: base (x, yb), tower height h, wheel radius rw (the far landmark; silhouetted at sunset)
function windPump(m, x, yb, h, rw) {
  const sil = m === 'sunset' ? '#6E5664' : m === 'night' ? '#26324F' : null;
  const met = sil || tone(m, '#8F969A', 0.12), md = sil ? dk(sil, 0.2) : dk(met, 0.3), blade = sil || tone(m, '#D8D3C4', 0.1), bladeS = sil ? lt(sil, 0.06) : dk(blade, 0.12);
  let s = '';
  const top = yb - h, bw = h * 0.16, tw = h * 0.035;
  // legs + braces
  s += S(T`M${x - bw} ${yb}L${x - tw} ${top}M${x + bw} ${yb}L${x + tw} ${top}`, md, 3.2);
  let br = '';
  const lv = [0, 0.22, 0.45, 0.68, 0.86];
  for (let k = 0; k < lv.length - 1; k++) {
    const y0 = yb - h * lv[k], y1 = yb - h * lv[k + 1], w0 = bw + (tw - bw) * lv[k], w1 = bw + (tw - bw) * lv[k + 1];
    br += T`M${x - w0} ${y0}L${x + w1} ${y1}M${x + w0} ${y0}L${x - w1} ${y1}M${x - w1} ${y1}L${x + w1} ${y1}`;
  }
  s += S(br, met, 1.6);
  s += R(x - 9, top - 3, 18, 5, md);                                         // platform
  // tail vane (to the right) + rod
  const cy = top - 6;
  s += S(T`M${x} ${cy}L${x + rw * 1.9} ${cy - 2}`, md, 2.6);
  s += P(T`M${x + rw * 1.3} ${cy - 3}L${x + rw * 2.25} ${cy - rw * 0.62}L${x + rw * 2.25} ${cy + rw * 0.36}L${x + rw * 1.3} ${cy + 1}Z`, sil || tone(m, '#C9C2B0', 0.1), OL(md, 1.6));
  // the many-bladed wheel
  let bl = '';
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2, a1 = a + 0.13, r0 = rw * 0.32;
    bl += P(T`M${x + Math.cos(a) * r0} ${cy + Math.sin(a) * r0}L${x + Math.cos(a) * rw} ${cy + Math.sin(a) * rw}L${x + Math.cos(a1) * rw} ${cy + Math.sin(a1) * rw}L${x + Math.cos(a1) * r0 * 1.1} ${cy + Math.sin(a1) * r0 * 1.1}Z`, k % 2 ? blade : bladeS);
  }
  s += C(x, cy, rw + 0.5, 'none', OL(md, 2.2)) + bl + C(x, cy, rw * 0.62, 'none', OL(md, 1.4)) + C(x, cy, rw * 0.2, md);
  return s;
}
// silo (domed) + a small farmhouse to its right
function silo(m, x, yb, h, sil) {
  const body = sil || tone(m, '#CFC9B8', 0.12), bodyS = sil ? dk(sil, 0.1) : dk(body, 0.12), dome = sil || tone(m, '#8C979C', 0.12), ol = sil ? dk(sil, 0.25) : dk(body, 0.35);
  const w = h * 0.26;
  let s = R(x - w / 2, yb - h, w, h, body, OL(ol, 1.8)) + R(x + w * 0.12, yb - h, w * 0.38, h, bodyS, ' opacity="0.8"');
  for (let k = 1; k < 6; k++) s += S(T`M${x - w / 2} ${yb - h + k * h / 6}L${x + w / 2} ${yb - h + k * h / 6}`, ol, 1, ' opacity="0.45"');
  s += P(T`M${x - w / 2 - 1} ${yb - h}A${w / 2 + 1} ${w / 2 + 1} 0 0 1 ${x + w / 2 + 1} ${yb - h}Z`, dome, OL(ol, 1.8));
  s += E(x - w * 0.18, yb - h - w * 0.26, w * 0.12, w * 0.07, lt(dome, 0.4), ' opacity="0.8"');
  return s;
}
function farmhouse(m, x, yb, w, sil) {
  const wall = sil || tone(m, '#E7DDC6', 0.12), roof = sil ? dk(sil, 0.1) : tone(m, '#9A7E72', 0.1), ol = sil ? dk(sil, 0.25) : dk(wall, 0.4), win = sil ? (m === 'night' ? '#F6D28A' : dk(sil, 0.15)) : tone(m, '#8FA0A8', 0.1);
  const h = w * 0.55;
  let s = R(x - w / 2, yb - h, w, h, wall, OL(ol, 1.6));
  s += P(T`M${x - w / 2 - 4} ${yb - h + 1}L${x} ${yb - h - w * 0.36}L${x + w / 2 + 4} ${yb - h + 1}Z`, roof, OL(dk(roof, 0.3), 1.6));
  s += R(x + w * 0.2, yb - h - w * 0.36, w * 0.09, w * 0.22, roof);   // chimney
  s += R(x - w * 0.32, yb - h * 0.72, w * 0.16, h * 0.32, win) + R(x + w * 0.14, yb - h * 0.72, w * 0.16, h * 0.32, win) + R(x - w * 0.07, yb - h * 0.5, w * 0.14, h * 0.5, sil ? dk(sil, 0.2) : tone(m, '#8C6E5C', 0.1));
  return s;
}
function far(m) {
  const night = m === 'night', sunset = m === 'sunset';
  let o = '', defs = '';
  // ---- 0 the farthest soft range (almost sky-coloured) — lifts the horizon on tall portrait screens
  const fc = mix(tone(m, '#B9C8A6', night ? 0.5 : 0.72), SKY[m][1][1], night ? 0.35 : 0.25);
  o += hillFill(RIDGE_FAR, fc);
  let ft = ''; for (let k = 0; k < 30; k++) { const x = k * 40 + 17, r = 2.6 + (k * 5) % 3; if (hsh(k, 9) < 0.45) ft += both(xx => tinyTree(xx, RIDGE_FAR(xx) + 3, r, dk(fc, 0.05), dk(fc, 0.08)), x, r + 2); }
  o += ft;
  // ---- 1 back hills (very hazy) with faint distant tree dots
  const bc = tone(m, '#B5C49A', night ? 0.36 : 0.52);
  o += hillFill(RIDGE_BACK, bc);
  let td = ''; for (let k = 0; k < 40; k++) { const x = k * 30 + 9, r = 3 + (k * 7) % 4; if (hsh(k, 3) < 0.5) td += both(xx => tinyTree(xx, RIDGE_BACK(xx) + 3, r, dk(bc, 0.07), dk(bc, 0.11)), x, r + 2); }
  o += td;
  // faint quilt lines on the back hill
  let bq = ''; for (let k = 0; k < 8; k++) { const x0 = k * 150 + 40; bq += both(xx => T`M${xx} ${RIDGE_BACK(xx) + 4}L${xx - 30} 720`, x0, 40); }
  o += S(bq, dk(bc, 0.08), 1.6, ' opacity="0.5"');
  for (let j = 1; j < 4; j++) { const pts = []; for (let x = 0; x <= W; x += 8) pts.push([x, RIDGE_BACK(x) + j * 16]); o += S(line(pts), dk(bc, 0.07), 1.4, ' opacity="0.45"'); }
  // ---- 2 hill A (patchwork quilt) + farmstead (silo + house) + wind pump + poplars
  const hazeA = night ? 0.14 : 0.26;
  const silA = sunset ? '#866C78' : night ? '#273551' : null;    // silhouette colour of the landmarks
  // landmarks stand BEHIND the hill crest (drawn before the hill so it occludes their feet)
  o += windPump(m, 840, RIDGE_A(840) + 20, 120, 24);
  const pc = tone(m, '#7E9864', hazeA), pcs = dk(pc, 0.12);
  o += hillFill(RIDGE_A, tone(m, FIELDS[1], hazeA));
  o += patchwork(m, RIDGE_A, [0, 120, 250, 380, 470, 610, 740, 860, 1000, 1090, 1200], [-20, -14, -8, -3, 2, 6, 11, 16, 20, 24], [0, 18, 44, 80, 130, 200], hazeA, 3, { hedgeW: 2 });
  // the farmstead stands ON the quilt (in front of the first field row): poplars, silos, house
  for (const x of [962, 976, 1120, 1134]) o += poplar(x, RIDGE_A(x) + 40, 52 + (x % 3) * 6, pc, pcs);
  o += silo(m, 1000, RIDGE_A(1000) + 44, 92, silA) + silo(m, 1026, RIDGE_A(1026) + 44, 70, silA) + farmhouse(m, 1078, RIDGE_A(1078) + 44, 54, silA);
  // poplar row along the first hedgerow on the right, little round trees on hedges
  for (let k = 0; k < 9; k++) { const x = 600 + k * 14; o += poplar(x, RIDGE_A(x) + 46, 34 + (k % 3) * 5, pc, pcs); }
  for (const [x, d, r] of [[150, 20, 7], [180, 22, 6], [700, 46, 8], [320, 20, 7], [346, 22, 6], [520, 82, 9], [960, 82, 9]]) o += both(xx => tinyTree(xx, RIDGE_A(xx) + d, r, pc, pcs), x, r + 2);
  // ---- 3 hill B (nearer quilt)
  const hazeB = night ? 0.06 : 0.1;
  o += hillFill(RIDGE_B, tone(m, FIELDS[3], hazeB));
  o += patchwork(m, RIDGE_B, [60, 200, 330, 500, 640, 760, 900, 1050, 1260], [-16, -10, -4, 2, 6, 10, 15, 20], [0, 24, 56, 108], hazeB, 9, { hedgeW: 2.6 });
  const tc = tone(m, TREE.c, hazeB), tcs = dk(tc, 0.14);
  for (const [x, r] of [[130, 12], [150, 9], [560, 11], [1110, 12], [1132, 9], [770, 10]]) o += both(xx => tinyTree(xx, RIDGE_B(xx) + 4, r, tc, tcs), x, r + 2);
  // ---- 4 mood atmosphere
  if (m === 'morning') {   // mist bands lying in the valleys between the hills
    defs += lg('ms', [[0, '#FFFFFF', 0], [0.5, '#FFFFFF', 0.8], [1, '#FFFFFF', 0]], V);
    o += R(0, 508, W, 50, 'url(#ms)', ' opacity="0.5"') + R(0, 596, W, 40, 'url(#ms)', ' opacity="0.6"') + R(0, 440, W, 50, 'url(#ms)', ' opacity="0.4"');
    for (let k = 0; k < 6; k++) { const x = k * 200 + 70 + (k * 37) % 50, y = 600 + (k % 3) * 18; o += both(xx => E(xx, y, 120, 7, '#FFFFFF', ' opacity="0.3"'), x, 122); }
  } else if (m === 'noon') {
    defs += lg('hz', [[0, HAZE[m], 0], [1, HAZE[m], 0.35]], V);
    o += R(0, 440, W, 110, 'url(#hz)');
  } else if (m === 'sunset') {   // long warm light from the right: gold haze on the crests
    defs += lg('hz', [[0, '#FFD0A0', 0], [1, '#FFD0A0', 0.45]], V);
    o += R(0, 440, W, 120, 'url(#hz)');
  } else {   // night: cool haze in the valleys, a few warm farmhouse windows already in the house drawing
    defs += lg('hz', [[0, '#5A6B9A', 0], [1, '#5A6B9A', 0.3]], V);
    o += R(0, 460, W, 110, 'url(#hz)');
  }
  return svg(1200, 720, o, defs, `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): meadow bank, oak, bushes, haystacks, post-and-rail fence, reed pond
// =====================================================================================================
const BANK = x => 240 + wave(x, [[2, 5, 0.9], [5, 3, 2.2], [12, 1.5, 0.4]]);
function lobes(list, col, colS, colL, ol, olw) {
  // a cloud-of-circles canopy: outline pass, shade pass, base pass (offset up-left), highlight pass
  let s = '';
  for (const [x, y, r] of list) s += C(x, y, r + olw / 2, ol);
  for (const [x, y, r] of list) s += C(x, y, r, colS);
  for (const [x, y, r] of list) s += C(x - r * 0.14, y - r * 0.18, r * 0.84, col);
  for (const [x, y, r] of list) if (r > 14) s += E(x - r * 0.36, y - r * 0.42, r * 0.34, r * 0.22, colL, ` opacity="0.75" transform="rotate(-30 ${f(x - r * 0.36)} ${f(y - r * 0.42)})"`);
  return s;
}
function treeCol(m) {
  if (m === 'night') return { c: '#2C4560', s: '#22384F', l: '#3A5674', o: '#18283C', t: '#3A3A50' };
  if (m === 'sunset') return { c: '#8E8C66', s: '#77704F', l: '#B9A878', o: '#5A5240', t: '#6E5A4C' };
  return { c: tone(m, TREE.c), s: tone(m, TREE.s), l: tone(m, TREE.l), o: tone(m, TREE.o), t: tone(m, TRUNK) };
}
function oak(m, x, yb, k = 1) {
  const tc = treeCol(m);
  let s = E(x, yb + 2, 74 * k, 7 * k, '#000000', ' opacity="0.12"');
  // trunk with two branches
  s += P(T`M${x - 13 * k} ${yb}Q${x - 8 * k} ${yb - 50 * k} ${x - 10 * k} ${yb - 92 * k}L${x - 34 * k} ${yb - 120 * k}L${x - 26 * k} ${yb - 124 * k}L${x - 2 * k} ${yb - 102 * k}L${x + 6 * k} ${yb - 128 * k}L${x + 14 * k} ${yb - 124 * k}L${x + 10 * k} ${yb - 92 * k}Q${x + 9 * k} ${yb - 46 * k} ${x + 16 * k} ${yb}Z`, tc.t, OL(dk(tc.t, 0.35), 2.6));
  s += S(T`M${x + 6 * k} ${yb - 10 * k}Q${x + 4 * k} ${yb - 50 * k} ${x + 6 * k} ${yb - 86 * k}`, dk(tc.t, 0.2), 2.4, ' opacity="0.6"');
  const L = [[0, -150, 58], [-50, -128, 44], [50, -126, 46], [-28, -182, 40], [32, -180, 42], [2, -204, 34], [-78, -104, 28], [80, -102, 30], [-18, -112, 36], [24, -110, 36]];
  s += lobes(L.map(([dx, dy, r]) => [x + dx * k, yb + dy * k, r * k]), tc.c, tc.s, tc.l, tc.o, 5);
  return s;
}
function bush(m, x, yb, k = 1) {
  const tc = treeCol(m);
  return E(x, yb + 1, 40 * k, 4 * k, '#000000', ' opacity="0.1"') + lobes([[x - 22 * k, yb - 14 * k, 16 * k], [x, yb - 22 * k, 22 * k], [x + 22 * k, yb - 14 * k, 17 * k]], tc.c, tc.s, tc.l, tc.o, 4);
}
function haystack(m, x, yb, w, h) {
  const c = m === 'night' ? '#5E6075' : m === 'sunset' ? mix(tone(m, HAYC), '#C9906A', 0.2) : tone(m, HAYC);
  const cd = dk(c, 0.2), cl = lt(c, 0.25), ol = dk(c, 0.42);
  let s = E(x, yb + 2, w * 0.62, 6, '#000000', ' opacity="0.14"');
  // pole sticking out of the top
  const pole = m === 'night' ? '#3D3A4C' : tone(m, '#8C7258');
  s += S(T`M${x} ${yb - h - 16}L${x} ${yb - h + 10}`, pole, 4.4);
  const body = T`M${x - w / 2} ${yb}C${x - w * 0.56} ${yb - h * 0.55} ${x - w * 0.3} ${yb - h} ${x} ${yb - h}C${x + w * 0.3} ${yb - h} ${x + w * 0.56} ${yb - h * 0.55} ${x + w / 2} ${yb}Q${x} ${yb + 6} ${x - w / 2} ${yb}Z`;
  s += P(body, c, OL(ol, 3));
  // right-side shade
  s += P(T`M${x + w * 0.08} ${yb - h + 2}C${x + w * 0.32} ${yb - h} ${x + w * 0.54} ${yb - h * 0.55} ${x + w / 2 - 1.5} ${yb - 1}Q${x + w * 0.3} ${yb + 2} ${x + w * 0.16} ${yb + 2}C${x + w * 0.28} ${yb - h * 0.4} ${x + w * 0.24} ${yb - h * 0.75} ${x + w * 0.08} ${yb - h + 2}Z`, cd, ' opacity="0.7"');
  // rope band + straw strokes + highlight
  s += S(T`M${x - w * 0.47} ${yb - h * 0.42}Q${x} ${yb - h * 0.34} ${x + w * 0.47} ${yb - h * 0.42}`, ol, 2.4, ' opacity="0.75"');
  let st = '';
  for (let k = 0; k < 14; k++) { const u = (k + 0.5) / 14 - 0.5, sx = x + u * w * 0.8, sy = yb - h * (0.12 + ((k * 7) % 5) * 0.12); st += T`M${sx} ${sy}l${u * 6} ${-12}`; }
  s += S(st, cd, 1.6, ' opacity="0.7"');
  s += S(T`M${x - w * 0.3} ${yb - h * 0.62}Q${x - w * 0.24} ${yb - h * 0.86} ${x - w * 0.04} ${yb - h * 0.94}`, cl, 4, ' opacity="0.8"');
  s += S(T`M${x - w / 2 + 3} ${yb - 3}l-6 3M${x - w * 0.3} ${yb}l-3 5M${x + w * 0.2} ${yb}l3 5M${x + w / 2 - 3} ${yb - 3}l6 3`, cd, 2);
  return s;
}
function fence(m) {
  const night = m === 'night';
  const w = night ? '#4C5068' : m === 'sunset' ? mix(tone(m, WOOD), '#8A6A6A', 0.2) : tone(m, WOOD), wd = dk(w, 0.4), wl = lt(w, 0.3);
  let posts = '', rails = '';
  const yb = 288, top = FENCE_TOP - 8;
  for (let k = 0; k < 20; k++) {   // posts every 60 (20 per tile)
    const x = k * 60 + 26;
    posts += both(xx => R(xx - 6, top, 12, yb - top, w, ` rx="3"${OL(wd, 2.2)}`) + R(xx - 6, top, 4, yb - top, wl, ' opacity="0.5"') + E(xx, yb, 10, 3, '#000000', ' opacity="0.12"'), x, 8);
  }
  // two rails (continuous → seamless) + a nail on each post
  for (const [y, h] of [[FENCE_TOP, 9], [FENCE_TOP + 30, 9]]) {
    rails += R(-2, y, W + 4, h, w, OL(wd, 2)) + R(-2, y + 1.5, W + 4, 2.4, wl, ' opacity="0.6"');
  }
  // the rails are long planks: a joint every 240
  let jt = ''; for (let k = 0; k < 5; k++) { const x = k * 240 + 26; jt += T`M${x + 7} ${FENCE_TOP}L${x + 7} ${FENCE_TOP + 9}M${x + 7} ${FENCE_TOP + 30}L${x + 7} ${FENCE_TOP + 39}`; }
  let nails = ''; for (let k = 0; k < 20; k++) { const x = k * 60 + 26; nails += C(x, FENCE_TOP + 4.5, 1.6, wd) + C(x, FENCE_TOP + 34.5, 1.6, wd); }
  return posts + rails + S(jt, wd, 1.6) + nails;
}
function pond(m, x, y, rx, ry) {
  const night = m === 'night', sunset = m === 'sunset';
  const water = night ? '#2E4568' : sunset ? '#D7B49A' : tone(m, POND), wTop = night ? '#40598A' : sunset ? '#F0CDAA' : lt(water, 0.18);
  const bank = night ? '#2A3E4A' : sunset ? '#8E8862' : tone(m, '#8DA270');
  let s = '', defs = lg('pw', [[0, wTop], [1, dk(water, 0.08)]], V);
  s += E(x, y + 2, rx + 10, ry + 6, bank) + E(x, y, rx, ry, 'url(#pw)') + E(x, y - ry * 0.5, rx * 0.86, ry * 0.36, dk(bank, 0.1), ' opacity="0.22"');
  // shine lines
  const sh = night ? '#9FB4E0' : sunset ? '#FFE6C8' : '#FFFFFF';
  s += S(T`M${x - rx * 0.5} ${y - 2}L${x - rx * 0.2} ${y - 2}M${x + rx * 0.05} ${y + 4}L${x + rx * 0.4} ${y + 4}M${x - rx * 0.15} ${y + ry * 0.6}L${x + rx * 0.1} ${y + ry * 0.6}`, sh, 2.4, ' opacity="0.7"');
  // lily pads (muted green) with a notch, one cream blossom
  const lp = night ? '#2E5050' : tone(m, '#8FAE7E'), lpd = dk(lp, 0.25);
  for (const [dx, dy, r] of [[-rx * 0.62, 3, 9], [-rx * 0.48, -4, 6], [rx * 0.52, 2, 8], [rx * 0.3, 7, 6]]) {
    const cx = x + dx, cy = y + dy;
    s += P(T`M${cx} ${cy}L${cx + r} ${cy - r * 0.18}A${r} ${r * 0.45} 0 1 1 ${cx + r * 0.9} ${cy + r * 0.25}Z`, lp, OL(lpd, 1.2));
  }
  s += C(x - rx * 0.6, y, 3.2, night ? '#B8BCD4' : '#F5EEDD', OL(night ? '#7E84A4' : '#D9CDB8', 1));
  return { s, defs };
}
function reeds(m, x, yb, k, seed) {
  const night = m === 'night', sunset = m === 'sunset';
  const c = night ? '#2E4A52' : sunset ? '#7E7E58' : tone(m, REED), cd = dk(c, 0.22), ct = night ? '#3A3448' : sunset ? '#5E4840' : tone(m, CATTAIL);
  let leaves = '', tails = '';
  for (let i = 0; i < 9; i++) {
    const u = (i - 4) / 4, h = (46 + hsh(i, seed) * 40) * k, bx = x + u * 16 * k, lean = u * 14 * k + (hsh(seed, i) - 0.5) * 10 * k, ww = 3.2 * k;
    leaves += P(T`M${bx - ww} ${yb}Q${bx - ww * 0.4 + lean * 0.3} ${yb - h * 0.6} ${bx + lean} ${yb - h}Q${bx + ww * 0.6 + lean * 0.3} ${yb - h * 0.6} ${bx + ww} ${yb}Z`, i % 2 ? c : cd);
    if (i % 3 === 1) {   // cattail on a straight stem
      const th = h * 1.1, tx = bx + lean * 0.4;
      tails += S(T`M${bx} ${yb}L${tx} ${yb - th}`, cd, 1.6 * k) + R(tx - 3.2 * k, yb - th + 4 * k, 6.4 * k, 15 * k, ct, ` rx="${f(3.2 * k)}"${OL(dk(ct, 0.3), 1)}`) + S(T`M${tx} ${yb - th + 4 * k}L${tx} ${yb - th - 3 * k}`, cd, 1.4 * k);
    }
  }
  return tails + leaves;
}
function mid(m) {
  const night = m === 'night';
  let o = '', defs = '';
  const tc = treeCol(m);
  // ---- distant hedge line just behind the bank (soft, low)
  const hedgeC = night ? '#22344A' : m === 'sunset' ? '#88845E' : tone(m, mix(TREE.c, HAZE[m], 0.25));
  { const hy = x => BANK(x) - 10 + wave(x, [[20, 3, 0.3], [37, 2, 1.2], [50, 1.5, 2.1]]); const pts = [[0, 300]]; for (let x = 0; x <= W; x += 4) pts.push([x, hy(x)]); pts.push([W, 300]); o += P(poly(pts), hedgeC); }
  // ---- the meadow bank (covers the far layer's bottom)
  const bk = night ? '#30465A' : m === 'sunset' ? '#A6A274' : tone(m, mix(MEADOW.noon, '#C8D6A4', 0.2));
  { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 6) pts.push([x, BANK(x)]); pts.push([W, 300]); o += P(poly(pts), bk); }
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, BANK(i * 6) + 0.5])), lt(bk, 0.25), 2, ' opacity="0.7"');
  // ---- oak (x 330) and bushes, haystacks behind the fence
  o += both(xx => oak(m, xx, 262, 1.0), 330, 120);
  for (const [x, k] of [[150, 0.9], [204, 0.7], [470, 0.75], [700, 0.8], [1010, 0.95], [1068, 0.7]]) o += both(xx => bush(m, xx, BANK(((xx % W) + W) % W) + 14, k), x, 50 * k);
  o += haystack(m, 820, 270, 92, 118) + haystack(m, 904, 274, 68, 86);
  // ---- fence (continuous)
  o += fence(m);
  // ---- pond in front of the fence (x 560), reeds on both ends
  const pd = pond(m, 570, 280, 116, 13); o += pd.s; defs += pd.defs;
  o += reeds(m, 448, 286, 1.0, 1) + reeds(m, 690, 286, 0.85, 2);
  // ---- small stones + grass blades along the bottom
  const st = night ? '#4C5672' : tone(m, STONE);
  for (const [x, s0] of [[500, 0.7], [646, 0.6], [760, 0.8], [960, 0.6], [110, 0.7]]) o += E(x, 290, 9 * s0, 5 * s0, st, OL(dk(st, 0.3), 1.4)) + E(x - 3 * s0, 288, 3 * s0, 1.6 * s0, lt(st, 0.4));
  let gb = ''; for (let k = 0; k < 100; k++) { const x = k * 12 + 3, y = 292 + (k % 3) * 2, h = 6 + (k * 7) % 6; gb += both(xx => T`M${xx} ${y}l${-2} ${-h}M${xx + 3} ${y}l${2} ${-h + 1}`, x, 6); }
  o += S(gb, dk(bk, 0.14), 1.6, ' opacity="0.6"');
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): clover meadow; rows 80…200 calm (the code draws the path band there)
// =====================================================================================================
function ground(m) {
  const night = m === 'night', r = rng(201 + MOODS.indexOf(m));
  const top = MEADOW[m], bot = GROUND_BOTTOM[m];
  let o = '', defs = '';
  const edge = x => GROUND_LINE - 3 + wave(x, [[6, 1.2, 0.3], [25, 1, 1.1]]);   // never below 40
  defs += lg('gr', [[0, lt(top, 0.06)], [0.3, top], [0.75, mix(top, bot, 0.6)], [1, bot]], V);
  { const pts = [[0, 260]]; for (let x = 0; x <= W; x += 6) pts.push([x, edge(x)]); pts.push([W, 260]); o += P(poly(pts), 'url(#gr)'); }
  let tf = ''; for (let k = 0; k < 75; k++) { const x = k * 16 + 5 + (k * 5) % 7; tf += both(xx => T`M${xx - 5} ${edge(x) + 2}Q${xx - 4} ${edge(x) - 4} ${xx - 2} ${edge(x) - 8}Q${xx} ${edge(x) - 2} ${xx + 1} ${edge(x) - 9}Q${xx + 3} ${edge(x) - 3} ${xx + 6} ${edge(x) - 6}L${xx + 6} ${edge(x) + 2}Z`, x, 7); }
  o += P(tf, lt(top, 0.06));
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, edge(i * 6) + 1])), lt(top, 0.22), 2, ' opacity="0.6"');
  // soft mottles everywhere (very low contrast inside the calm rows)
  for (let i = 0; i < 22; i++) { const x = r() * W, y = 50 + r() * 200, rx = 40 + r() * 60, calm = y > CALM[0] && y < CALM[1]; const ry = 6 + r() * 6; o += both(xx => E(xx, y, rx, ry, dk(top, 0.1), ` opacity="${calm ? 0.16 : 0.32}"`), x, rx); }
  // clover patches (three-leaf clusters) outside the calm rows
  const cl = night ? '#2E4656' : tone(m, '#93AE78'), cld = dk(cl, 0.18);
  const clover = (x, y, s0) => { let s = ''; for (let a = 0; a < 3; a++) { const an = -Math.PI / 2 + a * 2.094, cx = x + Math.cos(an) * 3.2 * s0, cy = y + Math.sin(an) * 2.6 * s0; s += C(cx, cy, 3 * s0, a === 1 ? cld : cl); } return s; };
  const okY = y => y < CALM[0] - 6 || y > CALM[1] + 6;
  for (let i = 0; i < 46; i++) { const x = r() * W, y = 46 + r() * 210; if (!okY(y)) continue; o += both(xx => clover(xx, y, 1 + r() * 0.5) + clover(xx + 9, y + 3, 0.9), x, 16); }
  // flowers (muted: cream, pale lilac-grey, pale butter) in little clusters
  const fl = night ? ['#9AA4C4', '#8790B4', '#A9AFC8'] : m === 'sunset' ? ['#F2DCC4', '#D8BFC6', '#EAD6A8'] : ['#F4EEDF', '#D6CCDD', '#EFE3BC'];
  const stem = night ? '#2E4452' : tone(m, '#86A174');
  for (let i = 0; i < 30; i++) {
    const x = r() * W, y = 50 + r() * 206; if (!okY(y)) continue;
    const col = fl[i % 3], n = 2 + (i % 3);
    o += both(xx => { let s = ''; for (let k = 0; k < n; k++) { const fx = xx + (k - n / 2) * 7 + (k % 2) * 2, fy = y - (k % 2) * 5; s += S(T`M${fx} ${fy + 8}L${fx} ${fy}`, stem, 1.6); for (let p = 0; p < 5; p++) { const a = p * 1.2566; s += C(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 1.8, col); } s += C(fx, fy, 1.3, night ? '#C9CCD8' : '#E2CC8E'); } return s; }, x, 20);
  }
  // grass strokes (sparser in the calm rows)
  let gs = ''; for (let i = 0; i < 90; i++) { const x = r() * W, y = 50 + r() * 205, h = 5 + r() * 6; if (!okY(y) && r() < 0.75) continue; gs += both(xx => T`M${xx} ${y}l-2 ${-h}M${xx + 2} ${y}l1 ${-h * 0.9}M${xx + 4} ${y}l3 ${-h * 0.7}`, x, 6); }
  o += S(gs, dk(top, 0.18), 1.4, ' opacity="0.5"');
  // pebbles near the bottom
  const peb = night ? '#56607A' : tone(m, '#C1BCB2'), pebd = dk(peb, 0.28);
  for (let k = 0; k < 20; k++) { const x = k * 60 + 20 + (k * 13) % 23, y = 214 + (k * 17) % 34, s0 = 2.6 + (k * 7) % 3; o += both(xx => E(xx, y, s0 * 1.4, s0, peb, OL(pebd, 1.2)) + E(xx - s0 * 0.4, y - s0 * 0.3, s0 * 0.5, s0 * 0.3, lt(peb, 0.4)), x, 6); }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// BARN (0 0 300 320, base anchor (150, 316)) per mood, doors, vane
// =====================================================================================================
function barnCol(m) {
  const g = c => m === 'night' ? mix(c, '#1C2850', 0.42) : m === 'sunset' ? mix(c, '#C2806E', 0.14) : m === 'morning' ? mix(c, '#F6D9C6', 0.08) : c;
  return { wall: g(BARN_C.wall), dark: g(BARN_C.dark), trim: g(BARN_C.trim), roof: g(BARN_C.roof), stone: g(BARN_C.stone) };
}
function barn(m) {
  const night = m === 'night', c = barnCol(m);
  const D = BARN.door;
  let o = '', defs = '';
  const ol = dk(c.dark, 0.3);
  o += E(150, 314, 150, 6, '#000000', ' opacity="0.18"');
  // wall (gambrel front gable)
  const wall = poly([[40, 316], [40, 150], [68, 96], [150, 54], [232, 96], [260, 150], [260, 316]]);
  o += P(wall, c.wall, OL(ol, 4));
  // vertical boards
  let pl = ''; for (let x = 54; x < 260; x += 14) pl += T`M${x} ${x < 68 || x > 232 ? 150 : x < 150 ? 96 - (x - 68) * 0.51 + 4 : 54 + (x - 150) * 0.51 + 4}L${x} 300`;
  o += S(pl, c.dark, 1.6, ' opacity="0.35"');
  // right-side cel shade + shadow under the roof
  o += P(poly([[206, 300], [206, 112], [232, 98], [258, 150], [258, 300]]), c.dark, ' opacity="0.16"');
  o += P(poly([[42, 152], [70, 98], [150, 58], [230, 98], [258, 152], [258, 162], [226, 106], [150, 68], [74, 106], [42, 162]]), c.dark, ' opacity="0.3"');
  // foundation stones
  o += R(40, 300, 220, 16, c.stone, OL(dk(c.stone, 0.4), 2.4));
  let sj = ''; for (let k = 0; k < 9; k++) sj += T`M${52 + k * 25} 300L${52 + k * 25} 316`;
  o += S(sj + 'M40 308L260 308', dk(c.stone, 0.3), 1.4, ' opacity="0.5"');
  // cream corner boards + eave beam
  o += R(40, 150, 10, 150, c.trim, OL(dk(c.trim, 0.35), 1.6)) + R(250, 150, 10, 150, c.trim, OL(dk(c.trim, 0.35), 1.6));
  o += R(40, 146, 220, 8, c.trim, OL(dk(c.trim, 0.35), 1.6));
  // roof band (gambrel fascia) with cream inner trim
  o += P(poly([[20, 154], [54, 84], [150, 30], [246, 84], [280, 154], [262, 154], [234, 98], [150, 50], [66, 98], [38, 154]]), c.roof, OL(dk(c.roof, 0.35), 3.4));
  o += S('M36 150L64 95L150 48L236 95L264 150', c.trim, 3.2);
  o += S('M26 148L57 86L150 35', lt(c.roof, 0.22), 2.4, ' opacity="0.7"');
  // hay-loft hoist beam under the peak
  o += R(143, 56, 14, 10, dk(c.dark, 0.1), OL(ol, 1.6)) + S('M150 66L150 74', '#4B4F5A', 2) + S('M147 74Q150 80 153 74', '#4B4F5A', 2);
  // loft window (arched): glowing at night
  const [lx, ly] = BARN.loft, lw = 46, lh = 40;
  const loftD = T`M${lx - lw / 2} ${ly + lh / 2}L${lx - lw / 2} ${ly - lh / 2 + 12}Q${lx - lw / 2} ${ly - lh / 2} ${lx} ${ly - lh / 2 - 2}Q${lx + lw / 2} ${ly - lh / 2} ${lx + lw / 2} ${ly - lh / 2 + 12}L${lx + lw / 2} ${ly + lh / 2}Z`;
  if (night) {
    defs += rg('lg', [[0, '#FFD98F', 0.7], [0.45, '#FFD08A', 0.25], [1, '#FFD08A', 0]]);
    o += C(lx, ly, 70, 'url(#lg)');
    o += P(loftD, '#FFD98A', OL(c.trim, 7)) + E(lx, ly + 8, lw * 0.36, lh * 0.32, '#FFF0C4');
  } else {
    o += P(loftD, '#3E2A25', OL(c.trim, 7));
    o += P(T`M${lx - lw / 2 + 3} ${ly + lh / 2 - 2}Q${lx - 10} ${ly + 4} ${lx + 2} ${ly + 8}Q${lx + 14} ${ly + 2} ${lx + lw / 2 - 3} ${ly + lh / 2 - 2}Z`, mix(HAYC, c.wall, 0.15));   // hay inside
  }
  o += S(T`M${lx} ${ly - lh / 2 - 1}L${lx} ${ly + lh / 2}M${lx - lw / 2} ${ly + 2}L${lx + lw / 2} ${ly + 2}`, c.trim, 3.4);
  // the DARK doorway (doors are separate) + cream frame
  defs += lg('dw', [[0, night ? '#1A1424' : '#2E1F1C'], [1, night ? '#2A2030' : '#3E2B25']], V);
  o += R(D.x0 - 7, D.y0 - 8, D.x1 - D.x0 + 14, D.y1 - D.y0 + 8, c.trim, OL(dk(c.trim, 0.35), 1.6));
  o += R(D.x0, D.y0, D.x1 - D.x0, D.y1 - D.y0, 'url(#dw)');
  let inner = ''; for (let x = D.x0 + 18; x < D.x1; x += 18) inner += T`M${x} ${D.y0 + 4}L${x} ${D.y1 - 24}`;
  o += S(inner, '#5A3E36', 1.4, ` opacity="${night ? 0.25 : 0.35}"`);
  // inside: a beam and the hay floor
  o += R(D.x0, D.y0 + 30, D.x1 - D.x0, 6, '#4A332C', ' opacity="0.6"');
  if (night) {   // a lantern inside: warm pool of light on the floor (doorway stays dark)
    defs += rg('ll', [[0, '#FFCF86', 0.42], [1, '#FFCF86', 0]]);
    o += E(150, D.y1 - 10, 62, 24, 'url(#ll)');
  }
  const hay = night ? '#6A5A4A' : '#8C7650';
  o += P(T`M${D.x0} ${D.y1}L${D.x0} ${D.y1 - 10}Q${D.x0 + 30} ${D.y1 - 20} ${150} ${D.y1 - 14}Q${D.x1 - 30} ${D.y1 - 22} ${D.x1} ${D.y1 - 10}L${D.x1} ${D.y1}Z`, hay);
  o += S(T`M${D.x0 + 14} ${D.y1 - 8}l6 -6M${D.x0 + 50} ${D.y1 - 10}l-5 -6M${D.x0 + 90} ${D.y1 - 9}l6 -7M${D.x0 + 120} ${D.y1 - 11}l-4 -6`, lt(hay, 0.2), 1.6);
  // threshold
  o += R(D.x0 - 4, D.y1 - 4, D.x1 - D.x0 + 8, 5, dk(c.trim, 0.25));
  // wall lamp left of the door (lit at night / dusk)
  const [ax, ay] = BARN.lamp, lit = night || m === 'sunset';
  if (lit) { defs += rg('al', [[0, '#FFD98F', night ? 0.6 : 0.35], [1, '#FFD98F', 0]]); o += C(ax, ay + 4, 30, 'url(#al)'); }
  o += S(T`M${ax - 8} ${ay - 12}L${ax} ${ay - 12}L${ax} ${ay - 6}`, '#4B4F5A', 2.4);
  o += P(T`M${ax - 6} ${ay - 6}L${ax + 6} ${ay - 6}L${ax + 5} ${ay + 10}L${ax - 5} ${ay + 10}Z`, lit ? '#FFE3A0' : '#E9E2CC', OL('#4B4F5A', 2));
  o += R(ax - 7, ay + 9, 14, 3, '#4B4F5A');
  // ridge post for the weathervane (the vane itself is env/vane.svg, pivot = BARN.vane)
  const [vx, vy] = BARN.vane;
  o += R(vx - 2.6, vy, 5.2, 34 - vy, '#4B4F5A', OL('#33363F', 1.2)) + C(vx, vy + 10, 4, '#5E636E', OL('#33363F', 1.2));
  // warm rim light on the left edge at sunset, cool moon rim at night
  if (m === 'sunset') o += S('M41 300L41 152L67 98', '#FFD6A0', 3, ' opacity="0.55"');
  return svg(300, 320, o, defs, `barn ${m}: base (150,316) doorway x80-220 y166-316 vane pivot (150,12)`);
}
function door(side) {
  // left door: hinge on x = 0 (outer edge); the right door is its mirror (hinge x = 70)
  const c = BARN_C, ol = dk(c.dark, 0.25);
  let o = R(1.5, 1.5, 67, 147, c.wall, OL(ol, 3));
  let pl = ''; for (let x = 15; x < 68; x += 13) pl += T`M${x} 8L${x} 142`;
  o += S(pl, c.dark, 1.4, ' opacity="0.4"');
  o += R(46, 3, 21, 144, c.dark, ' opacity="0.14"');               // inner-edge shade
  // cream frame + X brace
  o += R(6, 6, 58, 138, 'none', OL(c.trim, 7)) + S('M9 9L61 141M61 9L9 141', c.trim, 6);
  o += R(6, 6, 58, 138, 'none', OL(dk(c.trim, 0.3), 1) + ' opacity="0.6"');
  // hinge straps (outer side) + a handle near the inner edge
  for (const y of [24, 124]) o += R(0, y - 4, 24, 8, '#4B4F5A', ` rx="2"${OL('#33363F', 1.2)}`) + C(18, y, 1.6, '#8A909C');
  o += S('M58 70L58 82', '#4B4F5A', 3) + C(58, 76, 4.2, 'none', OL('#4B4F5A', 2));
  o += S('M5 5L5 144', lt(c.wall, 0.3), 2, ' opacity="0.6"');
  return svg(70, 150, side === 'r' ? `<g transform="translate(70 0) scale(-1 1)">${o}</g>` : o, '', `barn door ${side}: hinge x=${side === 'r' ? 70 : 0}, bottom anchor`);
}
function vane() {
  // rooster weathervane, dark metal; pivot (40, 64) = bottom of the rod (sits on the barn ridge post)
  const m = '#3F434E', ml = '#7A808C';
  let o = S('M40 64L40 30', m, 3.2);
  o += S('M24 52L56 52', m, 2.4) + C(22, 52, 2.6, m) + C(58, 52, 2.6, m) + C(40, 52, 3.2, m);
  // arrow
  o += S('M10 30L66 30', m, 3) + P('M64 24L76 30L64 36Z', m) + P('M6 24L16 24L20 30L16 36L6 36L10 30Z', m);
  // rooster silhouette standing on the arrow (facing right): sickle tail (left), round body, neck + head, comb, wattle, legs
  o += P('M36 26Q28 26 26 20Q20 18 16 10Q14 4 18 2Q18 8 24 12Q22 6 26 3Q26 10 30 14Q30 9 33 7Q33 14 38 17Q44 14 48 14Q47 9 50 6Q55 4 58 7L62 8.5L58.5 10Q58 15 54 17Q52 24 46 26Z', m);
  o += P('M50 6Q50 2 52.5 3.5Q53.5 0.8 55.5 2.6Q57.6 1.8 57.4 5Q55 4.2 50 6Z', m) + P('M57 10Q58.6 13 56.6 14.4Q55.2 12.4 57 10Z', m);
  o += S('M37 26L36 30M44 26L45 30', m, 2.2) + C(54.3, 7.6, 1.2, ml);
  o += S('M33 18Q38 15 44 17', ml, 1.2, ' opacity="0.8"') + S('M12 29L60 29', ml, 1, ' opacity="0.6"');
  return svg(80, 80, o, '', 'vane: pivot (40,64)');
}

// =====================================================================================================
// SUN, MOON, CLOUDS
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.42], [1, '#FFF2CF', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF2CC', OL('#F2DCA6', 4)) + C(100, 100, 38, '#FFF8E2') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function moon() {
  // a friendly crescent (no face): outer disc r 46 at (100,100) minus a disc r 40 at (124, 86); soft cool glow; faint craters
  const d = rg('g', [[0, '#E9EEFF', 0.5], [0.5, '#DDE5FF', 0.18], [1, '#DDE5FF', 0]]);
  const cres = 'M100 54A46 46 0 1 0 140 122.6A40 40 0 0 1 100 54Z';
  return svg(200, 200, C(100, 100, 98, 'url(#g)') + P(cres, '#F6F1DC', OL('#D9D1B2', 3.5)) +
    P('M88 63Q67 76 65 100Q65 117 74 130', 'none', OL('#FFFFFF', 4) + ' opacity="0.65"') + C(78, 112, 4, '#E4DCBE') + C(92, 136, 3, '#E4DCBE') + C(70, 90, 2.6, '#E4DCBE'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  const shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#E3E9F0', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
}

// =====================================================================================================
// PARTICLES (0 0 32 32; mist 0 0 64 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.mist = svg(64, 32, E(32, 17, 31, 12, 'url(#m)') + E(22, 15, 16, 8, 'url(#m)') + E(44, 18, 16, 8, 'url(#m)'),
    rg('m', [[0, '#FFFFFF', 0.7], [0.6, '#FFFFFF', 0.3], [1, '#FFFFFF', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P('M16 3Q17.2 14.8 29 16Q17.2 17.2 16 29Q14.8 17.2 3 16Q14.8 14.8 16 3Z', '#FFF4D2') + C(16, 16, 3.2, '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.5], [1, '#FFF6DA', 0]]));
  // firefly: warm yellow-green glow (#E9F59A, not answer green) with a tiny body
  out.firefly = svg(32, 32, C(16, 16, 15, 'url(#f)') + C(16, 16, 4.6, '#F2FAC0') + C(16, 16, 2.4, '#FFFFF0'),
    rg('f', [[0, '#E9F59A', 0.85], [0.35, '#E9F59A', 0.35], [1, '#E9F59A', 0]]));
  // petal: soft blush-cream apple-blossom petal (much paler than answer pink)
  out.petal = svg(32, 32, `<g transform="rotate(-25 16 16)">` + P('M16 4Q25 8 24 17Q22 26 16 28Q10 26 8 17Q7 8 16 4Z', '#FAEAE2', OL('#DDBDB0', 1.4)) +
    P('M16 28Q22 26 24 17Q23 24 16 28Z', '#EBD2C8') + S('M16 26Q15.4 18 16 9', '#E3C5B9', 1.1) + E(12.6, 11.5, 2.2, 3.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // leaf: a small muted olive leaf (breeze / sunset)
  out.leaf = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 28Q12 26 9 20Q6 10 16 3Z', '#B4B67E', OL('#7C7E52', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 28Q20 16 16 3Z', '#9EA06A', ' opacity="0.8"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#7C7E52', 1.1) +
    E(12.5, 11, 2, 3.4, '#D6D6AE', ' opacity="0.8"') + `</g>`);
  // butterfly: tiny pale cream wings with soft lilac-grey edges, body brown
  out.butterfly = svg(32, 32, P('M15.5 15Q8 4 3.5 8Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#F6EEDC', OL('#B9AFC4', 1.4)) +
    P('M16.5 15Q24 4 28.5 8Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#ECE2D0', OL('#B9AFC4', 1.4)) +
    C(7.5, 11, 2, '#DCD2E2') + C(24.5, 11, 2, '#DCD2E2') + R(15, 10, 2, 13, '#7E6656', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#7E6656', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // dust: soft warm-grey round puff (path dust, landing)
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#F1E8D8', 0.9], [0.6, '#E3D6C0', 0.45], [1, '#E3D6C0', 0]]));
  // feather: small cream feather with a tan shaft (rooster / chick bursts)
  out.feather = svg(32, 32, `<g transform="rotate(35 16 16)">` + P('M16 2Q23 8 22 17Q21 24 16.6 28L15.4 28Q11 24 10 17Q9 8 16 2Z', '#F5EFE4', OL('#CDBFA6', 1.3)) +
    S('M13 10L11 8.5M12.4 15L10.2 13.6M19 10L21 8.5M19.6 15L21.8 13.6', '#DCD0BA', 1.1) + S('M16 4L16 30', '#C2A882', 1.4) + E(13.6, 11, 1.6, 3.4, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); wr(env, 'barn_' + m, barn(m)); }
  wr(env, 'barn_door_l', door('l')); wr(env, 'barn_door_r', door('r')); wr(env, 'vane', vane());
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no external refs, ≤ 1 blur
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|href=|url\((?!#)|feGaussianBlur[\s\S]*feGaussianBlur/.test(s)) throw new Error('SVG rule broken in ' + fn);
  }
  console.log('wrote env (' + MOODS.length * 4 + ' layers/barns + doors, vane, sun, moon, clouds) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, MEADOW, GROUND_BOTTOM, PATH, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, FENCE_TOP, PATH_ROW, CALM, BARN, DOOR, VANE, RIDGE_BACK };
if (require.main === module) main();
