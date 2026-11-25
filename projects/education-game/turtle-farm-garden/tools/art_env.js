// Tumi's Flower Farm: outdoor farm environment + particle art generator (100 % original flat-cartoon SVG).
// Writes game/assets/default/env/{sky,far,mid,ground}_{spring,summer,autumn,winter}.svg, env/light.svg and
// game/assets/default/particles/{petal,leaf_a,leaf_b,snow,sparkle,star,seed,pollen,drop,straw,confetti_a,confetti_b,
// butterfly_s}.svg; removes the old bakery particles (flour, steam, crumb, sprinkle_a, sprinkle_b).      (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: far tiles are 1600 wide, mid / ground 1200 wide. Hill outlines are sums of sines whose periods divide the tile
// width; scattered details are placed in cells that never cross x = 0 / W, and props that cross an edge are drawn twice
// (at x and x ∓ W), so the left and right edges match pixel for pixel. The sky is NOT tiled (one cover rect).
// Colour rule (DESIGN §3): calm, sunny, slightly desaturated; answer colours never appear saturated in a large area
// (seasonal props use dusty versions); the meadow (where the bed and the seed packets sit) stays quiet.
//
// Layer anchors (see env_scenes.js envLayout() for the screen maths):
//   sky    0 0 800 720  : opaque gradient; the sun sits at SUN (470, 625); clouds in vb y 540–705; the last rows are
//                         exactly AMBIENT.skyBottom, so render can fill below the sky rect with skyBottom seamlessly.
//   far    0 0 1600 360 : transparent above the hills; ridge ≈ FAR_HZ (170); the farm (barn) at x FARM_X (420) on the
//                         middle hill (base ≈ y 225–245); opaque meadow colour from y 340 down.
//   mid    0 0 1200 300 : hedges, a tree, hay bales, a scarecrow, a pond, a seasonal touch; bases on MID_BASE (270);
//                         opaque meadow strip y 270–300.
//   ground 0 0 1200 260 : meadow; grass tips above GROUND_LINE (12), opaque from 12 down; last rows = AMBIENT.floor.
//   light  0 0 600 720  : soft sun rays, white + transparent, from the top-right corner.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const MOODS = ['spring', 'summer', 'autumn', 'winter'];
const FW = 1600, W = 1200;
const FAR_HZ = 170, FARM_X = 420, FOCUS_X = 500, MID_BASE = 270, GROUND_LINE = 12, SUN = [470, 625];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w = 3) => ` stroke="${col}" stroke-width="${w}" stroke-linejoin="round"`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = ' x1="0" y1="0" x2="0" y2="1"') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) once, plus a wrapped copy if it crosses an edge (half = half width of the thing)
const both = (fn, x, half, period) => fn(x) + (x + half > period ? fn(x - period) : '') + (x - half < 0 ? fn(x + period) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dk = (c, t = 0.3) => mix(c, '#3A4A30', t), lt = (c, t = 0.35) => mix(c, '#FFFFFF', t);
// a tileable ridge: y(x) = base + Σ a·sin(2π n x / period + p)
function ridge(base, comps, period) { return x => comps.reduce((y, [a, n, p]) => y + a * Math.sin(2 * Math.PI * n * x / period + p), base); }
function ridgePath(y, period, bottom, step = 10) { let d = `M0 ${f(y(0))}`; for (let x = step; x <= period; x += step) d += `L${x} ${f(y(x))}`; return d + `L${period} ${bottom}L0 ${bottom}Z`; }

// ---------------- palettes (DESIGN §3) ----------------
const SKY = { spring: ['#BFE3F2', '#EAF6F4'], summer: ['#A3D6F0', '#E8F6F0'], autumn: ['#C2D8E0', '#F5E2C4'], winter: ['#C6D8E8', '#EEF3F6'] };
const HAZE = { spring: '#D3E7C6', summer: '#CBE3BC', autumn: '#E6DDB8', winter: '#DCE6EE' };     // farthest ridge
const BACK = { spring: '#B9D7A0', summer: '#B0D293', autumn: '#D6C98F', winter: '#EDF2F4' };
const MIDH = { spring: '#A9CC8E', summer: '#A1C783', autumn: '#C4BE82', winter: '#DDE7E7' };
const FRONT = { spring: '#93BA7A', summer: '#8DB670', autumn: '#ABB074', winter: '#CCDDD6' };
const MEADOW = { spring: '#9CC77A', summer: '#97C474', autumn: '#AEBF7B', winter: '#DDE8E4' };
const FLOOR = { spring: '#8EBB6D', summer: '#89B767', autumn: '#A2B56F', winter: '#D2E0D8' };
const HEDGE = { spring: '#7FAF68', summer: '#76A85E', autumn: '#9DA45E', winter: '#86A98A' };
// ambient suggestions for weather.js / render.js (mechanics engineer):
//   spring { skyTop '#BFE3F2', skyBottom '#EAF6F4', floor '#8EBB6D' }   summer { '#A3D6F0', '#E8F6F0', '#89B767' }
//   autumn { skyTop '#C2D8E0', skyBottom '#F5E2C4', floor '#A2B56F' }   winter { '#C6D8E8', '#EEF3F6', '#D2E0D8' }
//   (+ light = sun-ray alpha, tint = optional whole-screen wash; wall = skyBottom for legacy callers)
const AMBIENT = {
  spring: { skyTop: SKY.spring[0], skyBottom: SKY.spring[1], wall: SKY.spring[1], meadow: MEADOW.spring, floor: FLOOR.spring, light: 0.35, tint: null },
  summer: { skyTop: SKY.summer[0], skyBottom: SKY.summer[1], wall: SKY.summer[1], meadow: MEADOW.summer, floor: FLOOR.summer, light: 0.8, tint: 'rgba(255,240,200,0.05)' },
  autumn: { skyTop: SKY.autumn[0], skyBottom: SKY.autumn[1], wall: SKY.autumn[1], meadow: MEADOW.autumn, floor: FLOOR.autumn, light: 0.4, tint: 'rgba(240,180,100,0.06)' },
  winter: { skyTop: SKY.winter[0], skyBottom: SKY.winter[1], wall: SKY.winter[1], meadow: MEADOW.winter, floor: FLOOR.winter, light: 0.15, tint: null },
};
const BARN = '#C98A7A', BARN_D = '#A26A5E', BARN_L = '#DDA899', ROOF = '#8F6A62', CREAM = '#F5EEDD', CREAM_D = '#CFC4AE';
const TRUNK = '#8C6E58', TRUNK_D = '#6E5444';

// =====================================================================================================
// SKY (0 0 800 720)
// =====================================================================================================
function cloud(x, y, s, col, op = 0.9) {
  return `<g opacity="${op}">` + E(x, y + 6 * s, 62 * s, 14 * s, col) + C(x - 30 * s, y, 20 * s, col) + C(x, y - 10 * s, 28 * s, col) + C(x + 30 * s, y - 2 * s, 20 * s, col) + `</g>`;
}
function sky(m) {
  const [top, bot] = SKY[m];
  let defs = lg('sg', [[0, top], [0.6, top], [0.82, mix(top, bot, 0.55)], [0.975, bot], [1, bot]]);
  const [sx, sy] = SUN;
  const sunCol = { spring: '#FFF4C8', summer: '#FFF2B8', autumn: '#FFE0A8', winter: '#FFF8E6' }[m];
  const halo = { spring: 0.5, summer: 0.75, autumn: 0.6, winter: 0.35 }[m];
  defs += rg('halo', [[0, sunCol, halo], [0.4, sunCol, halo * 0.45], [1, sunCol, 0]]);
  let o = R(0, 0, 800, 720, 'url(#sg)');
  const sr = { spring: 25, summer: 29, autumn: 26, winter: 23 }[m];
  o += C(sx, sy, sr * 3, 'url(#halo)');
  o += C(sx, sy, sr, sunCol) + C(sx, sy, sr * 0.78, lt(sunCol, 0.45)) + C(sx - sr * 0.28, sy - sr * 0.28, sr * 0.28, '#FFFFFF', ' opacity="0.55"');
  const cw = m === 'winter' ? '#F7F9FB' : '#FFFFFF';
  if (m === 'winter') {      // soft snow clouds, a pale sun half behind one
    o += cloud(sx + 40, sy + 30, 1.25, '#E6EDF3', 0.95) + cloud(170, 600, 1.4, '#E9EFF4', 0.9) + cloud(680, 570, 1.0, cw, 0.85) + cloud(330, 690, 1.6, '#E3EAF0', 0.8);
  } else {
    o += cloud(160, 590, 1.1, cw, 0.85) + cloud(690, 560, 0.85, cw, 0.8) + cloud(310, 680, 1.3, cw, 0.7);
    if (m !== 'summer') o += cloud(sx + 70, sy + 34, 0.8, cw, 0.75);
    if (m === 'autumn') o += R(0, 640, 800, 80, '#FFD9A0', ' opacity="0.18"');
  }
  return svg(800, 720, o, defs, `sun ${sx} ${sy}; bottom rows = ${bot}`);
}

// =====================================================================================================
// FAR: rolling hills + a little farm far away (0 0 1600 360)
// =====================================================================================================
function farTree(m, x, y, s, r) {   // a small round tree standing at (x, y)
  let o = R(x - 2.5 * s, y - 18 * s, 5 * s, 18 * s, TRUNK);
  if (m === 'winter') {
    if (r > 0.5) {   // a snowy pine
      o = R(x - 2 * s, y - 8 * s, 4 * s, 8 * s, TRUNK) + P(`M${f(x)} ${f(y - 40 * s)}L${f(x + 15 * s)} ${f(y - 6 * s)}H${f(x - 15 * s)}Z`, '#8FAE9C') + P(`M${f(x)} ${f(y - 40 * s)}L${f(x + 7 * s)} ${f(y - 24 * s)}Q${f(x)} ${f(y - 20 * s)} ${f(x - 7 * s)} ${f(y - 24 * s)}Z`, '#FBFDFE');
      return o;
    }
    return o + S(`M${f(x)} ${f(y - 16 * s)}L${f(x - 9 * s)} ${f(y - 30 * s)}M${f(x)} ${f(y - 18 * s)}L${f(x + 8 * s)} ${f(y - 32 * s)}M${f(x)} ${f(y - 18 * s)}V${f(y - 34 * s)}`, TRUNK, 2.2 * s) + E(x, y - 30 * s, 12 * s, 5 * s, '#FBFDFE', ' opacity="0.9"');
  }
  const col = { spring: r > 0.45 ? '#F1D2D8' : '#A9CE90', summer: r > 0.5 ? '#86B46E' : '#79A964', autumn: ['#E3A064', '#D9B35E', '#C98256'][Math.floor(r * 3)], }[m];
  const sh = mix(col, '#55624A', 0.18);
  o += C(x, y - 26 * s, 15 * s, sh) + C(x - 9 * s, y - 20 * s, 10 * s, sh) + C(x + 9 * s, y - 21 * s, 10 * s, sh);
  o += C(x - 2 * s, y - 28 * s, 12.5 * s, col) + C(x - 9 * s, y - 22 * s, 7.5 * s, col) + C(x + 7 * s, y - 24 * s, 8 * s, col) + C(x - 5 * s, y - 32 * s, 5 * s, lt(col, 0.3), ' opacity="0.8"');
  return o;
}
function barn(m, x, y) {   // centre x, base y — a dusty-rose barn (≈ 76 × 64)
  let o = '';
  o += P(`M${x - 34} ${y}V${y - 38}L${x - 24} ${y - 56}H${x + 24}L${x + 34} ${y - 38}V${y}Z`, BARN, OL(BARN_D, 2));
  o += P(`M${x - 38} ${y - 36}L${x - 26} ${y - 60}H${x + 26}L${x + 38} ${y - 36}L${x + 33} ${y - 34}L${x + 23} ${y - 54}H${x - 23}L${x - 33} ${y - 34}Z`, m === 'winter' ? '#F8FAFB' : ROOF);
  if (m === 'winter') o += P(`M${x - 38} ${y - 36}L${x - 26} ${y - 62}H${x + 26}L${x + 38} ${y - 36}Q${x} ${y - 46} ${x - 38} ${y - 36}Z`, '#FFFFFF');
  o += R(x - 12, y - 28, 24, 28, BARN_D) + S(`M${x - 12} ${y - 28}L${x + 12} ${y}M${x + 12} ${y - 28}L${x - 12} ${y}`, CREAM, 2.2) + R(x - 12, y - 28, 24, 28, 'none', OL(CREAM, 2.2));
  o += R(x - 6, y - 50, 12, 10, CREAM, OL(BARN_D, 1.5)) + R(x - 30, y - 34, 4, 30, BARN_L, ' opacity="0.6"');
  return o;
}
function farmhouse(m, x, y) {   // cream house with a dusty roof and a chimney (≈ 56 × 54)
  let o = R(x + 10, y - 58, 8, 16, '#B49A8A');
  o += R(x - 26, y - 34, 52, 34, CREAM, OL(CREAM_D, 2));
  o += P(`M${x - 32} ${y - 32}L${x} ${y - 56}L${x + 32} ${y - 32}Z`, m === 'winter' ? '#FFFFFF' : '#B88276', OL(m === 'winter' ? '#D8E2E8' : '#966459', 2));
  o += R(x - 18, y - 26, 10, 10, '#A9C3CF') + R(x + 8, y - 26, 10, 10, '#A9C3CF') + R(x - 5, y - 18, 10, 18, '#A88270');
  if (m === 'winter') o += E(x, y - 1, 34, 3, '#FFFFFF');
  return o;
}
function silo(m, x, y) {
  let o = R(x - 11, y - 66, 22, 66, '#D9D6CC', OL('#AAA597', 2)) + R(x - 7, y - 62, 4, 58, '#FFFFFF', ' opacity="0.45"');
  o += P(`M${x - 11} ${y - 66}Q${x} ${y - 84} ${x + 11} ${y - 66}Z`, m === 'winter' ? '#FFFFFF' : '#B8B2A4', OL('#AAA597', 2));
  for (const yy of [y - 46, y - 26]) o += R(x - 11, yy, 22, 2, '#AAA597', ' opacity="0.6"');
  return o;
}
function windmill(m, x, y) {   // cream tower + 4 blades (≈ 26 wide, 72 tall + blades r 34)
  const hub = [x, y - 64];
  let o = P(`M${x - 13} ${y}L${x - 8} ${y - 62}H${x + 8}L${x + 13} ${y}Z`, CREAM, OL(CREAM_D, 2)) + R(x - 4, y - 16, 8, 16, '#B49A8A');
  o += P(`M${x - 10} ${y - 60}Q${x} ${y - 76} ${x + 10} ${y - 60}Z`, m === 'winter' ? '#FFFFFF' : '#B88276', OL(m === 'winter' ? '#D8E2E8' : '#966459', 1.5));
  let bl = '';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.35, c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    const p1 = [hub[0] + c * 6, hub[1] + s * 6], p2 = [hub[0] + c * 36, hub[1] + s * 36];
    bl += P(poly([[p1[0], p1[1]], [p2[0], p2[1]], [p2[0] + px * 9, p2[1] + py * 9], [p1[0] + c * 8 + px * 7, p1[1] + s * 8 + py * 7]]), '#FBF7EE', OL('#BFB6A2', 1.5));
    bl += S(`M${f(hub[0])} ${f(hub[1])}L${f(p2[0])} ${f(p2[1])}`, '#A89A86', 2);
  }
  return o + bl + C(hub[0], hub[1], 4, '#A89A86');
}
function farSnowman(x, y) {
  return C(x, y - 9, 9, '#FFFFFF', OL('#C7D4DE', 1.5)) + C(x, y - 24, 6.5, '#FFFFFF', OL('#C7D4DE', 1.5)) + P(`M${x} ${y - 24}l7 1.5l-7 1.5z`, '#E7A36A') + R(x - 5, y - 32, 10, 3, '#8A7E86') + R(x - 3.5, y - 38, 7, 6, '#8A7E86');
}
function far(m) {
  const r = rng(11 + MOODS.indexOf(m) * 7);
  const yHaze = ridge(132, [[12, 2, 2.1], [6, 5, 0.4], [3, 11, 1.3]], FW);
  const yBack = ridge(160, [[16, 1, 0.3], [10, 3, 1.2], [5, 7, 2.0]], FW);
  const yMid = ridge(232, [[16, 2, 1.0], [10, 3, 2.5], [5, 6, 0.1]], FW);
  const yFront = ridge(296, [[10, 2, 2.9], [6, 4, 0.7], [3, 9, 1.5]], FW);
  let defs = lg('mfade', [[0, MEADOW[m], 0], [0.5, MEADOW[m], 0.85], [1, MEADOW[m]]]);
  defs += lg('hl', [[0, '#FFFFFF', 0.22], [1, '#FFFFFF', 0]]);
  let o = '';
  o += P(ridgePath(yHaze, FW, 360), HAZE[m]);
  o += P(ridgePath(yBack, FW, 360), BACK[m]);
  // trees on the back ridge (small, far)
  for (let c = 0; c < 10; c++) { const x = 60 + c * 160 + r() * 60; if (Math.abs(x - 940) < 50) continue; for (let k = 0; k < 2 + Math.floor(r() * 2); k++) { const xx = x + k * 11; o += farTree(m, xx, yBack(xx) + 6, 0.55, r()); } }
  // windmill on the back ridge
  o += windmill(m, 940, yBack(940) + 8);
  o += P(ridgePath(yMid, FW, 360), MIDH[m]);
  o += P(ridgePath(x => yMid(x) + 3, FW, 360), 'url(#hl)', ' opacity="0.6"');
  // soft patchwork field bands on the middle hill (low contrast), each fully inside the tile
  const band = mix(MIDH[m], m === 'autumn' ? '#E2C27A' : m === 'winter' ? '#FFFFFF' : '#C9DD9A', 0.35);
  for (const [x0, x1] of [[560, 760], [1180, 1420]]) {
    let d = `M${x0} ${f(yMid(x0) + 6)}`; for (let x = x0; x <= x1; x += 10) d += `L${x} ${f(yMid(x) + 6)}`;
    d += `L${x1 - 20} ${f(yMid(x1) + 40)}L${x0 + 20} ${f(yMid(x0) + 40)}Z`;
    o += P(d, band, ' opacity="0.8"');
    for (let k = 1; k < 4; k++) { const t = k / 4; o += S(`M${x0 + 20 * t} ${f(yMid(x0) + 6 + 34 * t)}L${x1 - 20 * t} ${f(yMid(x1) + 6 + 34 * t)}`, mix(band, '#6E7A50', 0.15), 1.5, ' opacity="0.5"'); }
  }
  // the farm (barn = FARM_X)
  const by = x => yMid(x) + 12;
  o += farTree(m, FARM_X - 150, by(FARM_X - 150) + 2, 0.9, 0.2) + farTree(m, FARM_X - 132, by(FARM_X - 132) + 4, 0.75, 0.8);
  o += farmhouse(m, FARM_X - 84, by(FARM_X - 84));
  o += silo(m, FARM_X + 50, by(FARM_X + 50));
  o += barn(m, FARM_X, by(FARM_X));
  o += farTree(m, FARM_X + 90, by(FARM_X + 90) + 3, 0.85, 0.6) + farTree(m, FARM_X + 106, by(FARM_X + 106) + 5, 0.7, 0.3);
  // a far fence line in front of the farm
  let fence = ''; for (let x = FARM_X - 120; x <= FARM_X + 130; x += 12) fence += `M${x} ${f(by(x) + 10)}v-7`;
  o += S(fence, '#D7C3A6', 1.6) + S(`M${FARM_X - 120} ${f(by(FARM_X - 120) + 6)}` + Array.from({ length: 26 }, (_, i) => { const x = FARM_X - 120 + (i + 1) * 10; return `L${x} ${f(by(x) + 6)}`; }).join(''), '#D7C3A6', 1.4);
  // tree clusters on the middle hill
  for (const [x, n] of [[180, 3], [820, 2], [960, 3], [1500, 2]]) for (let k = 0; k < n; k++) { const xx = x + k * 15; o += farTree(m, xx, yMid(xx) + 8 + (k % 2) * 3, 0.85 - (k % 2) * 0.12, r()); }
  if (m === 'winter') o += farSnowman(FARM_X + 150, by(FARM_X + 150) + 10);
  o += P(ridgePath(yFront, FW, 360), FRONT[m]);
  // a few far details on the front hill (each in its own cell)
  for (let c = 0; c < 16; c++) {
    const x = 30 + c * 100 + r() * 40, y = yFront(x) + 10 + r() * 14;
    if (m === 'summer' && c % 3 === 0) { for (let k = 0; k < 7; k++) o += C(x + k * 6, y + (k % 2) * 3, 2.4, '#E7CB62') + C(x + k * 6, y + (k % 2) * 3, 0.9, '#8E7A4E'); }
    else if (m === 'spring' && c % 3 === 0) { for (let k = 0; k < 6; k++) o += C(x + k * 6, y + (k % 2) * 3, 2, k % 2 ? '#F3D9DF' : '#FAF4E6'); }
    else if (m === 'autumn' && c % 4 === 1) o += E(x, y, 9, 6, '#E2C27A', OL('#C29E58', 1.2)) + E(x + 18, y + 2, 8, 5.5, '#E2C27A', OL('#C29E58', 1.2));
    else if (c % 2 === 0) o += farTree(m, x, y - 2, 0.6, r());
  }
  if (m === 'winter') for (let c = 0; c < 8; c++) { const x = 80 + c * 200 + r() * 40; o += S(`M${f(x - 18)} ${f(yFront(x) + 18)}Q${f(x)} ${f(yFront(x) + 22)} ${f(x + 18)} ${f(yFront(x) + 18)}`, '#AFC8BC', 2, ' opacity="0.6"'); }
  o += R(0, 300, FW, 60, 'url(#mfade)');
  o += R(0, 340, FW, 20, MEADOW[m]);
  return svg(FW, 360, o, defs, `ridge ~${FAR_HZ}; barn x ${FARM_X}; meadow ${MEADOW[m]} from y 340`);
}

// =====================================================================================================
// MID: hedges, tree, hay, scarecrow, pond, seasonal (0 0 1200 300), bases on MID_BASE
// =====================================================================================================
const Y = MID_BASE;
const shadow = (x, w) => E(x, Y - 1, w, 5, '#3E5A30', ' opacity="0.14"');
function hedge(m, x, w) {   // a rounded hedge row centred at x, width w (≈ 52 tall)
  const c = HEDGE[m], cd = mix(c, '#3E5A30', 0.28), cl = lt(c, 0.25);
  const n = Math.max(3, Math.round(w / 34));
  let back = '', front = '', hi = '', snow = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), cx = x - w / 2 + 20 + t * (w - 40), h = 34 + ((i * 7) % 3) * 6;
    back += C(cx, Y - h + 6, 24, cd);
    front += C(cx, Y - h + 10, 22, c);
    hi += C(cx - 7, Y - h + 2, 8, cl, ' opacity="0.7"');
    if (m === 'winter') snow += E(cx, Y - h - 8, 18, 8, '#FBFDFE');
    if (m === 'spring' && i % 2 === 0) hi += C(cx + 6, Y - h + 4, 3.5, '#F6E8EC') + C(cx - 10, Y - h + 14, 3, '#FBF4E6');
    if (m === 'autumn' && i % 2 === 1) hi += C(cx + 4, Y - h + 6, 4, '#D9A25E', ' opacity="0.8"');
  }
  return shadow(x, w / 2 + 6) + back + R(x - w / 2 + 4, Y - 24, w - 8, 24, cd, ' rx="10"') + front + R(x - w / 2 + 6, Y - 22, w - 12, 22, c, ' rx="10"') + hi + snow;
}
function tree(m, x) {   // the big tree (≈ 230 tall), trunk at x
  let o = shadow(x, 70);
  o += P(`M${x - 13} ${Y}Q${x - 9} ${Y - 60} ${x - 8} ${Y - 120}H${x + 8}Q${x + 9} ${Y - 60} ${x + 15} ${Y}Z`, TRUNK, OL(TRUNK_D, 2.5));
  o += S(`M${x - 4} ${Y - 110}Q${x - 30} ${Y - 140} ${x - 46} ${Y - 150}M${x + 4} ${Y - 112}Q${x + 26} ${Y - 146} ${x + 50} ${Y - 156}M${x} ${Y - 116}V${Y - 186}`, TRUNK, 7);
  if (m === 'winter') {
    o += S(`M${x - 30} ${Y - 140}L${x - 40} ${Y - 172}M${x + 30} ${Y - 146}L${x + 36} ${Y - 182}M${x} ${Y - 170}L${x - 14} ${Y - 200}M${x} ${Y - 176}L${x + 16} ${Y - 206}`, TRUNK, 4);
    o += S(`M${x - 44} ${Y - 153}Q${x - 30} ${Y - 146} ${x - 6} ${Y - 116}M${x + 48} ${Y - 159}Q${x + 28} ${Y - 150} ${x + 6} ${Y - 118}`, '#FFFFFF', 3.5) + E(x, Y - 188, 7, 3, '#FFFFFF') + E(x - 40, Y - 174, 5, 2.5, '#FFFFFF') + E(x + 36, Y - 184, 5, 2.5, '#FFFFFF');
    o += E(x, Y - 2, 40, 5, '#FFFFFF', ' opacity="0.9"');
    return o;
  }
  const col = { spring: '#F0CFD7', summer: '#84B46C', autumn: '#E2A062' }[m];
  const cd = mix(col, '#5A5040', 0.2), cl = lt(col, 0.3);
  const blobs = [[0, -190, 50], [-52, -162, 40], [52, -166, 42], [-26, -214, 36], [28, -212, 36], [-70, -128, 28], [72, -132, 30], [0, -150, 40]];
  for (const [dx, dy, rr] of blobs) o += C(x + dx, Y + dy + 6, rr + 3, cd);
  for (const [dx, dy, rr] of blobs) o += C(x + dx, Y + dy, rr, col);
  for (const [dx, dy, rr] of blobs.slice(0, 5)) o += C(x + dx - rr * 0.3, Y + dy - rr * 0.3, rr * 0.4, cl, ' opacity="0.65"');
  if (m === 'spring') { const rr = rng(5); for (let i = 0; i < 26; i++) { const a = rr() * 6.28, d = rr() * 70; o += C(x + Math.cos(a) * d * 1.2, Y - 172 + Math.sin(a) * d * 0.8, 3.2, i % 3 ? '#FAF1F3' : '#E5B3C0'); } for (const [dx, dy] of [[-60, -150], [64, -158], [-20, -232], [40, -120]]) o += E(x + dx, Y + dy, 9, 5, '#A9CE90', ` transform="rotate(${dx > 0 ? 30 : -30} ${x + dx} ${Y + dy})"`); }
  if (m === 'summer') for (const [dx, dy] of [[-30, -200], [36, -180], [-56, -150], [10, -150], [58, -140]]) o += C(x + dx, Y + dy, 5, '#E9B06A', OL('#C08A4E', 1.2));   // a few apricots
  if (m === 'autumn') { o += E(x - 40, Y - 3, 14, 4, '#D99A58') + E(x + 30, Y - 2, 18, 4, '#E2B266') + E(x + 60, Y - 4, 10, 3, '#C98256'); }
  return o;
}
function hay(m, x) {   // two round hay bales side by side (side view)
  const c = '#E6C77E', cd = '#C9A45A', cl = '#F2DCA2';
  const bale = (bx, rr) => C(bx, Y - rr, rr, c, OL(cd, 3)) + S(`M${bx} ${Y - rr}m-${f(rr * 0.15)} 0a${f(rr * 0.15)} ${f(rr * 0.15)} 0 1 1 ${f(rr * 0.3)} 0a${f(rr * 0.35)} ${f(rr * 0.35)} 0 1 1 -${f(rr * 0.6)} 0a${f(rr * 0.6)} ${f(rr * 0.6)} 0 1 1 ${f(rr * 1.05)} 0`, cd, 2.2, ' opacity="0.7"') + P(`M${f(bx - rr * 0.7)} ${f(Y - rr * 1.4)}Q${f(bx - rr * 0.2)} ${f(Y - rr * 1.9)} ${f(bx + rr * 0.3)} ${f(Y - rr * 1.85)}`, 'none', OL(cl, 4) + ' stroke-linecap="round" opacity="0.8"') + (m === 'winter' ? P(`M${f(bx - rr * 0.8)} ${f(Y - rr * 1.55)}Q${f(bx)} ${f(Y - rr * 2.25)} ${f(bx + rr * 0.8)} ${f(Y - rr * 1.55)}Q${f(bx)} ${f(Y - rr * 1.8)} ${f(bx - rr * 0.8)} ${f(Y - rr * 1.55)}Z`, '#FBFDFE') : '');
  let o = shadow(x + 10, 80) + bale(x - 34, 36) + bale(x + 36, 30);
  for (let i = 0; i < 5; i++) o += S(`M${x - 70 + i * 30} ${Y}l${3 + i} -8`, cd, 1.6);
  return o;
}
function scarecrow(m, x) {   // a friendly scarecrow (≈ 150 tall): pole, crossbar, sack head, straw hat, shirt
  const shirt = m === 'winter' ? '#B9A3B5' : '#9DB0BF', sd = mix(shirt, '#3A4A50', 0.28);
  let o = shadow(x, 26);
  o += R(x - 4, Y - 150, 8, 150, TRUNK, OL(TRUNK_D, 2));
  o += R(x - 52, Y - 112, 104, 7, TRUNK, OL(TRUNK_D, 2) + ' rx="3"');
  o += P(`M${x - 46} ${Y - 114}L${x + 46} ${Y - 114}L${x + 40} ${Y - 96}L${x + 22} ${Y - 98}L${x + 24} ${Y - 54}L${x - 24} ${Y - 54}L${x - 22} ${Y - 98}L${x - 40} ${Y - 96}Z`, shirt, OL(sd, 2.5));
  o += R(x + 4, Y - 84, 14, 14, '#E0C9A4', OL(sd, 1.5) + ' rx="2"') + S(`M${x + 6} ${Y - 82}l10 10M${x + 16} ${Y - 82}l-10 10`, sd, 1.2);
  for (const [sx, d] of [[-46, -1], [46, 1]]) o += S(`M${x + sx} ${Y - 112}l${d * 8} -2M${x + sx} ${Y - 106}l${d * 9} 1M${x + sx} ${Y - 100}l${d * 7} 4`, '#D6B46E', 2.4);
  o += S(`M${x - 14} ${Y - 54}l-4 10M${x} ${Y - 54}v11M${x + 14} ${Y - 54}l4 10`, '#D6B46E', 2.6);
  o += C(x, Y - 132, 18, '#E7D3AE', OL('#B99D72', 2.5)) + C(x - 6, Y - 134, 2.6, '#6E5444') + C(x + 6, Y - 134, 2.6, '#6E5444') + S(`M${x - 7} ${Y - 125}Q${x} ${Y - 120} ${x + 7} ${Y - 125}`, '#6E5444', 2) + C(x - 11, Y - 127, 3.2, '#E9AFA0', ' opacity="0.7"') + C(x + 11, Y - 127, 3.2, '#E9AFA0', ' opacity="0.7"');
  o += E(x, Y - 145, 30, 6, '#E6C77E', OL('#C9A45A', 2)) + P(`M${x - 15} ${Y - 146}Q${x - 14} ${Y - 166} ${x} ${Y - 166}Q${x + 14} ${Y - 166} ${x + 15} ${Y - 146}Z`, '#E6C77E', OL('#C9A45A', 2)) + R(x - 15, Y - 152, 30, 5, '#C98A7A');
  if (m === 'winter') o += E(x, Y - 166, 12, 4, '#FFFFFF') + E(x - 22, Y - 149, 8, 3, '#FFFFFF') + R(x - 16, Y - 118, 32, 7, '#CFA2A2', ' rx="3"');   // snow on the hat + a scarf
  if (m === 'autumn') o += E(x + 4, Y - 6, 10, 3.5, '#D99A58');
  return o;
}
function pond(m, x) {   // a small pond lying on the meadow (flat ellipse) with reeds
  const water = m === 'winter' ? '#C9DCE6' : m === 'autumn' ? '#A9C6CC' : '#9FCBD8';
  let o = E(x, Y - 10, 96, 15, mix(MEADOW[m], '#3E5A30', 0.18)) + E(x, Y - 11, 90, 12.5, water) + E(x - 20, Y - 14, 40, 4, lt(water, 0.45), ' opacity="0.8"');
  if (m === 'winter') o += S(`M${x - 40} ${Y - 8}l26 -6M${x + 10} ${Y - 10}l30 -4`, '#FFFFFF', 1.6, ' opacity="0.8"');
  else o += E(x + 36, Y - 8, 11, 3.6, '#8DBA74') + E(x + 50, Y - 12, 8, 2.8, '#8DBA74');
  const reed = m === 'winter' ? '#A99A82' : m === 'autumn' ? '#B9A56A' : '#6E9E58';
  o += S(`M${x - 90} ${Y - 8}q-2 -26 -8 -40M${x - 82} ${Y - 8}q1 -30 4 -46M${x - 74} ${Y - 9}q4 -22 12 -32M${x + 84} ${Y - 8}q2 -24 8 -36M${x + 92} ${Y - 9}q-1 -20 -4 -30`, reed, 3);
  o += R(x - 81, Y - 62, 6, 16, '#9C7458', ' rx="3"') + R(x + 89, Y - 50, 5, 13, '#9C7458', ' rx="2.5"');
  return o;
}
function seasonal(m, x) {
  let o = '';
  if (m === 'spring') {           // tulip clumps (dusty pastel)
    const cols = ['#EDB3C0', '#F2D78E', '#E9B0A0', '#D8C2E4', '#F4EFE4'];
    for (let i = 0; i < 9; i++) {
      const tx = x - 60 + i * 15, ty = Y - 40 - ((i * 13) % 4) * 6, c = cols[i % 5];
      o += S(`M${tx} ${Y}Q${tx + 2} ${ty + 18} ${tx} ${ty}`, '#6E9E58', 3) + E(tx - 5, Y - 12, 4, 12, '#86B06E', ` transform="rotate(-18 ${tx - 5} ${Y - 12})"`);
      o += P(`M${tx - 7} ${ty - 9}Q${tx - 8} ${ty + 4} ${tx} ${ty + 5}Q${tx + 8} ${ty + 4} ${tx + 7} ${ty - 9}L${tx + 3} ${ty - 4}L${tx} ${ty - 12}L${tx - 3} ${ty - 4}Z`, c, OL(mix(c, '#5A4A40', 0.25), 1.8));
    }
  } else if (m === 'summer') {    // sunflowers (dusty yellow, brown centres)
    for (let i = 0; i < 4; i++) {
      const sx = x - 48 + i * 32, sy = Y - 108 - (i % 2) * 26;
      o += S(`M${sx} ${Y}Q${sx - 4} ${sy + 50} ${sx} ${sy}`, '#6E9E58', 4.5) + E(sx - 10, sy + 50, 10, 5, '#7FAE66', ` transform="rotate(-25 ${sx - 10} ${sy + 50})"`) + E(sx + 10, sy + 70, 10, 5, '#7FAE66', ` transform="rotate(25 ${sx + 10} ${sy + 70})"`);
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; o += E(sx + Math.cos(a) * 14, sy + Math.sin(a) * 14, 8, 4, k % 2 ? '#EBCB62' : '#E3BE52', ` transform="rotate(${f(a * 57.3)} ${f(sx + Math.cos(a) * 14)} ${f(sy + Math.sin(a) * 14)})"`); }
      o += C(sx, sy, 9.5, '#8E6A48', OL('#6E5038', 1.5)) + C(sx - 3, sy - 3, 3, '#A88462');
    }
  } else if (m === 'autumn') {    // a little pumpkin patch
    const pc = '#E1A469', pd = '#B97A44';
    const pum = (px, s) => E(px - 12 * s, Y - 16 * s, 14 * s, 16 * s, mix(pc, pd, 0.25), OL(pd, 2.5)) + E(px + 12 * s, Y - 16 * s, 14 * s, 16 * s, mix(pc, pd, 0.25), OL(pd, 2.5)) + E(px, Y - 17 * s, 14 * s, 17 * s, pc, OL(pd, 2.5)) + E(px - 4 * s, Y - 24 * s, 3.5 * s, 7 * s, lt(pc, 0.35), ' opacity="0.7"') + S(`M${px} ${f(Y - 33 * s)}q2 -8 8 -10`, '#7E8F5E', 4 * s);
    o += shadow(x, 70) + pum(x - 40, 1) + pum(x + 10, 1.35) + pum(x + 56, 0.85);
    o += S(`M${x - 70} ${Y - 4}Q${x - 40} ${Y - 14} ${x - 10} ${Y - 4}Q${x + 30} ${Y + 2} ${x + 80} ${Y - 6}`, '#8FA06A', 2.5) + E(x - 26, Y - 8, 9, 5, '#9CAE72') + E(x + 74, Y - 8, 8, 4.5, '#9CAE72');
  } else {                        // a snowman (≈ 120 tall)
    o += shadow(x, 40);
    o += C(x, Y - 32, 34, '#FBFDFE', OL('#C3D3DE', 3)) + C(x, Y - 86, 25, '#FBFDFE', OL('#C3D3DE', 3)) + C(x, Y - 126, 19, '#FBFDFE', OL('#C3D3DE', 3));
    o += E(x - 10, Y - 40, 14, 22, '#E6EEF3', ' opacity="0.7"');
    o += C(x - 6, Y - 130, 2.8, '#5E5660') + C(x + 7, Y - 130, 2.8, '#5E5660') + P(`M${x} ${Y - 124}l16 4l-16 3z`, '#E7A36A') + S(`M${x - 7} ${Y - 116}Q${x} ${Y - 112} ${x + 7} ${Y - 116}`, '#5E5660', 2);
    o += C(x, Y - 92, 3, '#5E5660') + C(x, Y - 80, 3, '#5E5660');
    o += R(x - 22, Y - 109, 44, 9, '#CFA2A2', ' rx="4.5"') + R(x + 8, Y - 106, 9, 26, '#CFA2A2', ' rx="4"');
    o += R(x - 16, Y - 160, 32, 22, '#8A7E86', ' rx="3"') + R(x - 23, Y - 142, 46, 6, '#8A7E86', ' rx="3"');
    o += S(`M${x - 24} ${Y - 88}L${x - 54} ${Y - 108}M${x - 44} ${Y - 101}l-4 -12M${x + 24} ${Y - 88}L${x + 52} ${Y - 112}M${x + 44} ${Y - 105}l6 -10`, TRUNK, 3.5);
  }
  return o;
}
function mid(m) {
  let o = R(0, Y, W, 300 - Y, MEADOW[m]);
  // FOCUS_X (500) lands under the far farm on screen: only LOW things there (hay or tulips / pumpkins), tall ones beside it
  const tall = m === 'summer' || m === 'winter';
  o += both(x => hedge(m, x, 200), 80, 110, W);
  o += tall ? seasonal(m, 330) : hay(m, 320);
  o += tall ? hay(m, 500) : seasonal(m, 500);
  o += scarecrow(m, 645);
  o += pond(m, 830);
  o += both(x => tree(m, x), 1110, 115, W);
  return svg(W, 300, o, '', 'props stand on y ' + MID_BASE + '; meadow ' + MEADOW[m] + ' below');
}

// =====================================================================================================
// GROUND: meadow foreground (0 0 1200 260)
// =====================================================================================================
function ground(m) {
  const r = rng(101 + MOODS.indexOf(m) * 13);
  const top = MEADOW[m], bot = FLOOR[m];
  let defs = lg('gg', [[0, top], [0.75, mix(top, bot, 0.85)], [0.96, bot], [1, bot]]);
  let o = '';
  // grass tips along the top edge (each tip inside its own cell → seamless)
  const n = 150, cell = W / n, tipCol = m === 'winter' ? '#CFDFD8' : top;
  let d = `M0 ${GROUND_LINE + 2}`;
  for (let i = 0; i < n; i++) { const x0 = i * cell, h = 4 + r() * 7; d += `L${f(x0 + cell * 0.5)} ${f(GROUND_LINE - h)}L${f(x0 + cell)} ${f(GROUND_LINE + 2)}`; }
  o += P(d + `V20H0Z`, tipCol);
  o += R(0, GROUND_LINE, W, 260 - GROUND_LINE, 'url(#gg)');
  // big soft patches (very low contrast), period-safe through both()
  for (let i = 0; i < 6; i++) {
    const x = 100 + i * 200 + r() * 60, y = 50 + r() * 150, rx = 120 + r() * 80, ry = 16 + r() * 14, c = i % 2 ? lt(top, 0.18) : mix(top, '#4E7A3A', 0.08);
    o += both(xx => E(xx, y, rx, ry, m === 'winter' ? (i % 2 ? '#F3F7F6' : '#BCD4B6') : c, ` opacity="${m === 'winter' ? 0.55 : 0.5}"`), x, rx, W);
  }
  // tufts + tiny flowers / leaves / snow, sparse, bigger towards the bottom (perspective)
  const tuft = (x, y, s, c) => S(`M${f(x - 5 * s)} ${f(y)}q1 -6 -3 -10M${f(x)} ${f(y)}q0 -8 1 -13M${f(x + 5 * s)} ${f(y)}q-1 -6 4 -10`, c, 1.8 * s);
  const tc = m === 'winter' ? '#93B88A' : mix(top, '#3E6A2E', 0.3);
  for (let i = 0; i < 40; i++) {
    const x = (i + 0.35 + r() * 0.3) * (W / 40), y = 30 + r() * 220, s = 0.8 + (y / 260) * 1.2;
    o += tuft(x, y, s, tc);
  }
  const daisy = (x, y, s, pc, cc) => { let p = ''; for (let k = 0; k < 5; k++) { const a = k * 1.2566; p += C(x + Math.cos(a) * 3.2 * s, y + Math.sin(a) * 2.2 * s, 2.3 * s, pc); } return p + C(x, y, 1.6 * s, cc); };
  for (let i = 0; i < 26; i++) {
    const x = (i + 0.3 + r() * 0.4) * (W / 26), y = 30 + r() * 215, s = 0.8 + (y / 260) * 1.0, q = r();
    if (m === 'spring') o += q < 0.6 ? daisy(x, y, s, '#FBF8EF', '#F0D27A') : daisy(x, y, s, q < 0.8 ? '#F1CFD8' : '#DCCDEB', '#F3E4B0');
    else if (m === 'summer') o += q < 0.65 ? daisy(x, y, s, '#FBF8EF', '#EBC75E') : C(x, y, 2.6 * s, '#EED477', OL('#C9AA4E', 0.8));
    else if (m === 'autumn') { const lc = ['#D99A58', '#C98256', '#D9B266'][Math.floor(q * 3)]; o += E(x, y, 6 * s, 3 * s, lc, ` transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})" opacity="0.85"`); }
    else o += q < 0.6 ? E(x, y, 10 * s, 3.5 * s, '#FAFCFC', ' opacity="0.9"') : tuft(x, y, s, '#8DB27E');
  }
  // clover leaves (spring / summer)
  if (m === 'spring' || m === 'summer') for (let i = 0; i < 12; i++) {
    const x = (i + 0.3 + r() * 0.4) * (W / 12), y = 60 + r() * 180, s = 0.9 + y / 260;
    const cc = mix(top, '#3E6A2E', 0.2);
    o += C(x - 3 * s, y, 3 * s, cc) + C(x + 3 * s, y, 3 * s, cc) + C(x, y - 4 * s, 3 * s, cc);
  }
  return svg(W, 260, o, defs, `meadow from y ${GROUND_LINE}; fill below with ${bot}`);
}

// =====================================================================================================
// LIGHT: soft sun rays (0 0 600 720)
// =====================================================================================================
function light() {
  const defs = lg('lb', [[0, '#FFFFFF', 0.55], [0.5, '#FFFFFF', 0.2], [1, '#FFFFFF', 0]], ' x1="1" y1="0" x2="0.3" y2="1"');
  let o = '';
  const ox = 560, oy = -40;
  for (const [a0, a1] of [[100, 106], [113, 121], [128, 133], [140, 149], [156, 160]]) {
    const r = 900, p = a => [ox + Math.cos(a * Math.PI / 180) * r, oy + Math.sin(a * Math.PI / 180) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    o += P(`M${ox} ${oy}L${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}Z`, 'url(#lb)');
  }
  return svg(600, 720, o, defs, 'rays from the top-right corner');
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.petal = svg(32, 32, `<g transform="rotate(-20 16 16)">` + P('M16 29Q5 23 6 13Q7 5 12.5 3.5L16 8L19.5 3.5Q25 5 26 13Q27 23 16 29Z', '#F6C8D4', ' stroke="#DC9AAE" stroke-width="1.8" stroke-linejoin="round"') +
    P('M16 26Q9.5 21.5 10.5 14Q11.5 9 14 8L16 10.5Z', '#FFE6EC', ' opacity="0.9"') + S('M16 12V24', '#E7A9BB', 1.3) + `</g>`);
  out.leaf_a = svg(32, 32, `<g transform="rotate(-14 16 16)">` +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Q13 25 12.5 21Q8.5 22.5 4 21Q5 17.5 8.5 15.5Q5.5 13 4.5 8.5Q9 7 12.5 9.5Q13 6 16 2.5Z', '#E8A462', ' stroke="#B06A34" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Z', '#D88E50', ' opacity="0.55"') +
    S('M16 9V31M16 17L9 11M16 17L23 11M16 20L9 19M16 20L23 19', '#B06A34', 1.3) + `</g>`);
  out.leaf_b = svg(32, 32, `<g transform="rotate(28 16 16)">` + P('M16 2Q26 9 25 18Q24 26 16 29Q8 26 7 18Q6 9 16 2Z', '#E0B456', ' stroke="#A27A2A" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2Q26 9 25 18Q24 26 16 29Z', '#CFA046', ' opacity="0.55"') + S('M16 6V31M16 13L11 9M16 13L21 9M16 19L10 15M16 19L22 15M16 24L12 21M16 24L20 21', '#A27A2A', 1.3) + `</g>`);
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 11)} ${f(16 + s * 11)}`; const bx = 16 + c * 7, by = 16 + s * 7; for (const d of [-1, 1]) { const b = a + d * 0.8; arms += `M${f(bx)} ${f(by)}L${f(bx + Math.cos(b) * 3.6)} ${f(by + Math.sin(b) * 3.6)}`; } }
  out.snow = svg(32, 32, C(16, 16, 15.5, 'url(#sg)') + S(arms, '#C9DDF0', 4) + S(arms, '#FFFFFF', 2.2) + C(16, 16, 3, '#FFFFFF'),
    rg('sg', [[0, '#FFFFFF', 0.7], [0.5, '#F2F7FC', 0.3], [1, '#F2F7FC', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#kg)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF8E6') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('kg', [[0, '#FFF6DC', 0.6], [1, '#FFF6DC', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? ri : ro; p.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, P(poly(starPts(16, 16.8, 14, 6.4)), '#EDEDED', ' stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"') + P(poly(starPts(15.4, 16, 8, 3.7)), '#FFFFFF'));
  // seed: dandelion fluff — a white umbrella of filaments on a thin stalk with a tiny brown seed
  let fil = ''; for (let i = 0; i < 9; i++) { const a = Math.PI * (1.08 + i * 0.105), x = 16 + Math.cos(a) * 11, y = 13 + Math.sin(a) * 11; fil += `M16 13L${f(x)} ${f(y)}`; }
  let tips = ''; for (let i = 0; i < 9; i++) { const a = Math.PI * (1.08 + i * 0.105); tips += C(16 + Math.cos(a) * 11, 13 + Math.sin(a) * 11, 1.6, '#FFFFFF', ' opacity="0.95"'); }
  out.seed = svg(32, 32, C(16, 9, 12, 'url(#dg)') + S(fil, '#E4E8E6', 2) + S(fil, '#FFFFFF', 1) + tips + S('M16 13V24', '#D8D2C2', 1.2) + E(16, 26, 1.6, 3, '#A89272'),
    rg('dg', [[0, '#FFFFFF', 0.45], [1, '#FFFFFF', 0]]));
  // pollen: a soft warm dot
  out.pollen = svg(32, 32, C(16, 16, 15, 'url(#pg)') + C(16, 16, 4.5, '#FFF7D2') + C(15, 15, 1.8, '#FFFFFF'),
    rg('pg', [[0, '#FFF3C0', 0.9], [0.35, '#FFF3C0', 0.5], [1, '#FFF3C0', 0]]));
  // drop: a water drop, white (tinted by code), light grey rim + highlight
  out.drop = svg(32, 32, P('M16 3Q24 14 24.5 19.5Q24.5 28 16 28.5Q7.5 28 7.5 19.5Q8 14 16 3Z', '#FFFFFF', ' stroke="#D0D8DC" stroke-width="1.6" stroke-linejoin="round"') + E(12.5, 19, 2, 4, '#E8EEF0') + C(19, 22, 1.6, '#E8EEF0'));
  // straw: a bent straw strand (not tinted)
  out.straw = svg(32, 32, S('M5 24Q14 20 18 13L27 6', '#C9A45A', 4) + S('M5 24Q14 20 18 13L27 6', '#EED7A0', 2) + S('M18 13l3 4', '#C9A45A', 1.8));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)">` + `<rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/>` + `</g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // butterfly_s: a tiny butterfly facing up/right, white (tinted by code), light grey edges, a dark-ish body
  out.butterfly_s = svg(32, 32, P('M16 15Q9 3 4.5 6.5Q2 10 7 15Q3 19 6 23.5Q10 26 16 18Z', '#FFFFFF', ' stroke="#CBCFD3" stroke-width="1.5" stroke-linejoin="round"') +
    P('M16 15Q23 3 27.5 6.5Q30 10 25 15Q29 19 26 23.5Q22 26 16 18Z', '#FFFFFF', ' stroke="#CBCFD3" stroke-width="1.5" stroke-linejoin="round"') +
    C(9, 10, 1.8, '#E6E9EC') + C(23, 10, 1.8, '#E6E9EC') + E(16, 17, 1.8, 7, '#8A8488') + S('M15.4 10.5Q13.5 6 11.5 5M16.6 10.5Q18.5 6 20.5 5', '#8A8488', 1));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => { fs.writeFileSync(path.join(dir, n + '.svg'), s); return s.length; };
  const sizes = [];
  for (const m of MOODS) { for (const [l, fn] of [['sky', sky], ['far', far], ['mid', mid], ['ground', ground]]) sizes.push(`${l}_${m} ${(wr(env, l + '_' + m, fn(m)) / 1024).toFixed(1)}KB`); }
  sizes.push('light ' + (wr(env, 'light', light()) / 1024).toFixed(1) + 'KB');
  const ps = particles(); for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  const gone = [];
  for (const n of ['particles/flour', 'particles/steam', 'particles/crumb', 'particles/sprinkle_a', 'particles/sprinkle_b', 'env/rays', 'env/caustic']) {
    const p = path.join(A, n + '.svg'); if (fs.existsSync(p)) { fs.unlinkSync(p); gone.push(n); }
  }
  console.log(sizes.join('  '));
  console.log('particles: ' + Object.keys(ps).join(', ') + (gone.length ? '\nremoved: ' + gone.join(', ') : ''));
}
module.exports = { MOODS, AMBIENT, MEADOW, FOCUS_X, FLOOR, FAR_HZ, FARM_X, MID_BASE, GROUND_LINE, SUN, PARTICLES: ['petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'seed', 'pollen', 'drop', 'straw', 'confetti_a', 'confetti_b', 'butterfly_s'] };
if (require.main === module) main();
