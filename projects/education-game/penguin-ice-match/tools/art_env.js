// Dee's Forest Memory: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground}_{spring,summer,autumn,winter}.svg, sun.svg, cloud1..3.svg and
// particles/*.svg.   Usage: node tools/art_env.js      Preview scenes + seam proof: node tools/env_scenes.js
// Tiling: every ridge / bank / pond edge is a sum of sines with INTEGER periods over W (so f(0) = f(W)), and every object
// near an edge is drawn again at x±W (wrap()), so the left and right edges of each layer match exactly.
// Seasons share ONE layout (same seeds, same shapes); only the palette and the seasonal details change.
// Colour rule (DESIGN §3): everything is calmer, lighter and less saturated than the answer colours (red #E84A4A,
// orange #FF9A2E, yellow #FFD23F, green #4CC26B ...). Autumn canopies are dusty apricot / rose / straw, never vivid.
//
// Branch tips where lanterns can hang (mid_* svg coordinates, 0 0 1200 360) are exported as BRANCHES at the bottom
// of this file and printed when it runs.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
let PREC = 10;
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wave = terms => x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const cpath = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;   // circle as a path piece (batched fills)
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); return line(pts); }
function between(top, bot, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, top(x)]); for (let x = W; x >= 0; x -= step) pts.push([x, bot(x)]); return poly(pts); }
const lg = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';

// ---------------- palettes (per season; calm, lighter + less saturated than the answer palette) ----------------
const BASE = {
  trunk: '#A88B6E', trunkSh: '#8F7459', trunkLine: '#7C6450',
  shroomStem: '#F3E7D0', shroomStemSh: '#E0D0B2', shroomDoor: '#B48C6A', shroomWin: '#F6E7B8', shroomLine: '#A88566', shroomDot: '#FFF8EC',
};
const SEASONS = {
  spring: {
    farBack: '#CFE2D6', farBackSh: '#C2D9CC', farFront: '#BFDAC0', farFrontSh: '#B1CFB2', farTree: '#AFCFB0', farTreeSh: '#A0C3A2', farTree2: '#BCD7BB', mist: '#F3F8F2', farCap: null, farBlossom: '#F2D3DD',
    hillBack: '#B9D9A8', hillBackSh: '#AACD98', hillBackHi: '#CCE5BB', bank: '#A9D193', bankSh: '#9AC584', bankHi: '#C1E0AA',
    tree: ['#A3D08E', '#97C681', '#BCDDA8'], tree2: ['#B1D79C', '#A2CC8D', '#C6E3B4'], blossom: ['#F7D3DF', '#FBE4EB', '#EDBACB'], blossomN: 1,
    fern: '#94C47E', fernSh: '#80B36C', bush: '#A9D396', bushSh: '#97C584',
    cap: '#E3A39A', capSh: '#CF8D85', capHi: '#F0BEB6', snow: null,
    water: '#BFE0E6', waterSh: '#A9D3DB', waterHi: '#E4F4F5', shore: '#C7B996', pad: '#9FCB86', padSh: '#88B872', padFlower: '#FBE1EA', ice: false,
    grassTop: '#C3E3A6', grass: '#B6DB97', grassLow: '#A3CF84', rim: '#97C477', lipHi: '#D3EBBC', tuft: '#9BC97B', tuftHi: '#CBE7B0', moss: '#ADD58E',
    fl: ['#FFFFFF', '#FBE4EC', '#FFF5D8', '#ECE3F7'], flC: '#F2DB9A', flStem: '#88BA6C', litter: ['#F7D3DF', '#FBE4EB'], litterN: 26, fill: '#A3CF84',
  },
  summer: {
    farBack: '#C7DDCF', farBackSh: '#B9D3C3', farFront: '#B3D2B3', farFrontSh: '#A4C7A5', farTree: '#9CC39F', farTreeSh: '#8DB792', farTree2: '#AACDAB', mist: '#F1F7F1', farCap: null, farBlossom: null,
    hillBack: '#A9CF96', hillBackSh: '#9AC386', hillBackHi: '#BEDDA9', bank: '#9BC883', bankSh: '#8CBB74', bankHi: '#B4D99B',
    tree: ['#8FC07A', '#7FB26B', '#A9D293'], tree2: ['#9DCA87', '#8DBC77', '#B6DAA0'], blossom: null,
    fern: '#86B870', fernSh: '#73A65E', bush: '#98C885', bushSh: '#86B873',
    cap: '#DE9C92', capSh: '#C9867D', capHi: '#ECB8AF', snow: null,
    water: '#B4DBE2', waterSh: '#9CCDD6', waterHi: '#DFF2F4', shore: '#C4B48F', pad: '#93C47A', padSh: '#7CB165', padFlower: '#FFF6F0', ice: false,
    grassTop: '#B7DD98', grass: '#A9D488', grassLow: '#96C677', rim: '#8ABA6B', lipHi: '#C9E6AF', tuft: '#8EC06F', tuftHi: '#C1E1A3', moss: '#A0CD82',
    fl: ['#FFFFFF', '#ECE3F7', '#FFF5D8', '#DCEBFA'], flC: '#F2DB9A', flStem: '#7FB062', litter: null, litterN: 0, fill: '#96C677',
  },
  autumn: {
    farBack: '#DCD9C8', farBackSh: '#D0CCB9', farFront: '#D3CFAE', farFrontSh: '#C7C29F', farTree: '#D7C49E', farTreeSh: '#CBB490', farTree2: '#C9C8A3', mist: '#F8F4EA', farCap: null, farBlossom: null,
    hillBack: '#CFCC9C', hillBackSh: '#C3BE8E', hillBackHi: '#DED9B1', bank: '#C3C48F', bankSh: '#B5B681', bankHi: '#D5D5A6',
    tree: ['#E6BC8E', '#D8A97C', '#F1D1AA'], tree2: ['#E5C88C', '#D6B67C', '#F0DBAA'], treeAlt: ['#DDA597', '#CC9285', '#EBC0B5'], blossom: null,
    fern: '#C5AD7C', fernSh: '#B39A6A', bush: '#D3B98A', bushSh: '#C2A779',
    cap: '#D99A8A', capSh: '#C58676', capHi: '#E9B8AC', snow: null,
    water: '#C3DCDD', waterSh: '#AFCFD1', waterHi: '#E6F2F1', shore: '#C8B48E', pad: '#B9C483', padSh: '#A4B070', padFlower: null, ice: false,
    grassTop: '#D1D7A2', grass: '#C6CD95', grassLow: '#B5BE85', rim: '#AAB27A', lipHi: '#E0E4BA', tuft: '#B2BA7D', tuftHi: '#DCE0B0', moss: '#BBC48B',
    fl: ['#FFFFFF', '#FFF2DC', '#F5E6F0', '#FFF5D8'], flC: '#E8CF96', flStem: '#A2AE6E', litter: ['#E6BC8E', '#DDA597', '#E5C88C', '#D6AE86'], litterN: 70, fill: '#B5BE85',
  },
  winter: {
    farBack: '#DCE6EE', farBackSh: '#CFDCE6', farFront: '#E6EEF4', farFrontSh: '#D6E2EC', farTree: '#B5C8C9', farTreeSh: '#A6BBBD', farTree2: '#C3D3D5', mist: '#F6F9FC', farCap: '#F7FAFC', farBlossom: null,
    hillBack: '#E3ECF2', hillBackSh: '#D3E0EA', hillBackHi: '#F4F8FB', bank: '#EDF3F7', bankSh: '#DCE7EF', bankHi: '#FAFCFD',
    tree: ['#AFC5BD', '#9DB6AE', '#C2D4CD'], tree2: ['#BACDC6', '#A8BEB7', '#CCDCD6'], blossom: null, bare: true,
    fern: '#A9BFB5', fernSh: '#97AFA4', bush: '#B9CCC5', bushSh: '#A7BDB5',
    cap: '#D59A90', capSh: '#C1867D', capHi: '#E6B7AF', snow: '#FBFDFF', snowSh: '#DDE8F1',
    water: '#DCEEF5', waterSh: '#C6E1EC', waterHi: '#F6FBFD', shore: '#D7E2EA', pad: '#C9D9D2', padSh: '#B6C9C1', padFlower: null, ice: true,
    grassTop: '#F6F9FC', grass: '#EDF3F8', grassLow: '#DFE9F1', rim: '#CBDAE6', lipHi: '#FFFFFF', tuft: '#B5C7B4', tuftHi: '#D4E0D2', moss: '#E3ECF3',
    fl: ['#FFFFFF'], flC: '#E8EEF4', flStem: '#A9BBA8', litter: null, litterN: 0, fill: '#DFE9F1',
  },
};
for (const k in SEASONS) SEASONS[k] = Object.assign({}, BASE, SEASONS[k]);

// ================= far_<s>.svg (0 0 1200 420): misty hills + distant tall trees =================
function tallTree(x, base, s, C, kind) {
  // distant tall tree: kind 0 = rounded column (poplar-like), 1 = soft spire (fir-like). Flat, two tones.
  let o = rect(x - 1.8 * s, base - 10 * s, 3.6 * s, 10 * s, '#B3A496', 1);
  if (kind === 0) {
    o += P(`M${f(x - 10 * s)} ${f(base - 8 * s)}C${f(x - 13 * s)} ${f(base - 40 * s)} ${f(x - 7 * s)} ${f(base - 66 * s)} ${f(x)} ${f(base - 74 * s)}C${f(x + 7 * s)} ${f(base - 66 * s)} ${f(x + 13 * s)} ${f(base - 40 * s)} ${f(x + 10 * s)} ${f(base - 8 * s)}Z`, C.farTree);
    o += P(`M${f(x + 1 * s)} ${f(base - 8 * s)}C${f(x + 4 * s)} ${f(base - 40 * s)} ${f(x + 3 * s)} ${f(base - 62 * s)} ${f(x)} ${f(base - 74 * s)}C${f(x + 7 * s)} ${f(base - 66 * s)} ${f(x + 13 * s)} ${f(base - 40 * s)} ${f(x + 10 * s)} ${f(base - 8 * s)}Z`, C.farTreeSh);
    if (C.farCap) o += P(`M${f(x - 6.5 * s)} ${f(base - 58 * s)}C${f(x - 4 * s)} ${f(base - 68 * s)} ${f(x - 1 * s)} ${f(base - 73 * s)} ${f(x)} ${f(base - 74 * s)}C${f(x + 3 * s)} ${f(base - 71 * s)} ${f(x + 6 * s)} ${f(base - 66 * s)} ${f(x + 7.5 * s)} ${f(base - 58 * s)}Q${f(x)} ${f(base - 62 * s)} ${f(x - 6.5 * s)} ${f(base - 58 * s)}Z`, C.farCap);
    if (C.farBlossom) for (const [u, v] of [[-4, 30], [3, 46], [-2, 58], [5, 22]]) o += circ(x + u * s, base - v * s, 2.4 * s, C.farBlossom, ' opacity="0.9"');
  } else {
    const pts = []; const tiers = 4;
    for (let i = 0; i < tiers; i++) { const yb = base - 8 * s - i * 15 * s, w = (12 - i * 2.4) * s; pts.push([x - w, yb], [x - w * 0.45, yb - 8 * s]); }
    pts.push([x, base - 76 * s]);
    for (let i = tiers - 1; i >= 0; i--) { const yb = base - 8 * s - i * 15 * s, w = (12 - i * 2.4) * s; pts.push([x + w * 0.45, yb - 8 * s], [x + w, yb]); }
    o += P(poly(pts), C.farTree2);
    o += P(poly([[x, base - 76 * s], [x + 2 * s, base - 8 * s], [x + 12 * s, base - 8 * s], [x + 5 * s, base - 30 * s], [x + 8 * s, base - 32 * s]]), C.farTreeSh, ' opacity="0.55"');
    if (C.farCap) for (let i = 0; i < tiers; i++) { const yb = base - 8 * s - i * 15 * s, w = (12 - i * 2.4) * s; o += P(`M${f(x - w)} ${f(yb)}Q${f(x - w * 0.6)} ${f(yb - 4 * s)} ${f(x - w * 0.45)} ${f(yb - 8 * s)}L${f(x - w * 0.1)} ${f(yb - 5 * s)}Q${f(x - w * 0.5)} ${f(yb - 1 * s)} ${f(x - w)} ${f(yb)}Z`, C.farCap); }
  }
  return o;
}
function genFar(C) {
  PREC = 1;
  const backY = x => 250 + wave([[26, 1, 0.5], [14, 2, 2.2], [7, 3, 4.0], [3, 7, 1.0]])(x);
  const frontY = x => 318 + wave([[16, 1, 3.4], [10, 2, 0.9], [5, 5, 2.1]])(x);
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.55, C.mist, 0.45], [1, C.mist, 0.9]]);
  let o = '';
  // back ridge + a row of distant tall trees on it
  o += P(bandD(backY, 420), C.farBack);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = (i + 0.15 + r() * 0.7) * W / 26, s = 0.62 + r() * 0.4, kind = r() < 0.55 ? 0 : 1;
    o += wrap(x, 14 * s, xx => tallTree(xx, backY(xx) + 10, s, C, kind));
  }
  o += P(bandD(x => backY(x) + 24 + wave([[6, 4, 0.7]])(x), 420), C.farBackSh, ' opacity="0.75"');
  o += `<rect x="0" y="200" width="${W}" height="220" fill="url(#mist)" opacity="0.65"/>`;
  // front far hill with taller trees in clumps
  for (const [cx, n] of [[160, 4], [520, 3], [880, 5], [1110, 2]]) for (let k = 0; k < n; k++) {
    const x = cx + (k - n / 2) * 22 + r() * 8, s = 0.95 + r() * 0.45, kind = (k + n) % 3 === 0 ? 1 : 0;
    o += wrap(x, 16 * s, xx => tallTree(xx, frontY(xx) + 12, s, C, kind));
  }
  o += P(bandD(frontY, 420), C.farFront);
  o += P(bandD(x => frontY(x) + 28 + wave([[5, 6, 2.2]])(x), 420), C.farFrontSh, ' opacity="0.6"');
  if (C.farCap) o += strokeP(edgeD(x => frontY(x) + 3), '#FFFFFF', 5, ' opacity="0.8"');
  o += `<rect x="0" y="300" width="${W}" height="120" fill="url(#mist)" opacity="0.85"/>`;
  PREC = 10;
  return svg(1200, 420, o, defs);
}

// ================= mid_<s>.svg (0 0 1200 360): big round trees with low branches, mushroom houses, ferns, pond =================
// Ground lip covers mid y > ~340 (mid bottom gy-10, ground lip gy-30), so all detail lives above y 340.
const BRANCHES = [];   // [{x, y}] lantern hang points (branch tips / under-branch), mid svg coordinates
const BIG_TREES = [   // x, base, height, seed, canopy palette ('tree' | 'tree2' | 'treeAlt'), branch spans [left, right]
  [150, 300, 292, 11, 'tree', [96, 104]],
  [560, 292, 270, 12, 'treeAlt', [92, 100]],
  [960, 302, 300, 13, 'tree2', [102, 96]],
];
const SMALL_TREES = [[350, 282, 168, 21, 'tree2'], [760, 280, 150, 22, 'tree'], [1110, 286, 160, 23, 'treeAlt']];
function canopyPal(C, key) { return C[key] || C.tree; }
function bigTree(x, base, h, seed, key, spans, C, record) {
  const r = rng(seed); const cr = h * 0.31, cy = base - h + cr * 1.02;
  const [cf, cs, ch] = canopyPal(C, key);
  let o = '';
  o += ell(x + h * 0.03, base + 2, h * 0.3, h * 0.035, C.bankSh, ' opacity="0.9"');
  // trunk with flared roots
  const tw = h * 0.065, tTop = cy + cr * 0.2;
  o += P(`M${f(x - tw * 1.9)} ${f(base + 2)}Q${f(x - tw)} ${f(base - 8)} ${f(x - tw)} ${f(base - h * 0.12)}L${f(x - tw * 0.8)} ${f(tTop)}L${f(x + tw * 0.8)} ${f(tTop)}L${f(x + tw)} ${f(base - h * 0.12)}Q${f(x + tw)} ${f(base - 8)} ${f(x + tw * 2)} ${f(base + 2)}Z`, C.trunk);
  o += P(`M${f(x + tw * 0.15)} ${f(base + 2)}L${f(x + tw * 0.15)} ${f(tTop)}L${f(x + tw * 0.8)} ${f(tTop)}L${f(x + tw)} ${f(base - h * 0.12)}Q${f(x + tw)} ${f(base - 8)} ${f(x + tw * 2)} ${f(base + 2)}Z`, C.trunkSh);
  o += strokeP(`M${f(x - tw * 0.4)} ${f(base - h * 0.08)}q${f(-2)} ${f(-14)} ${f(1)} ${f(-26)}M${f(x - tw * 0.2)} ${f(base - h * 0.2)}q${f(3)} ${f(-8)} ${f(0)} ${f(-14)}`, C.trunkLine, 1.6, ' opacity="0.55"');
  // a tiny arched fairy door at the root (with a knob) — a fairy-forest hint, small enough to stay background
  const dx = x - tw * 0.55, dw = tw * 0.78, dh = tw * 1.25;
  o += P(`M${f(dx - dw / 2)} ${f(base - 1)}V${f(base - dh + dw / 2)}A${f(dw / 2)} ${f(dw / 2)} 0 0 1 ${f(dx + dw / 2)} ${f(base - dh + dw / 2)}V${f(base - 1)}Z`, C.trunkLine, ' opacity="0.75"');
  o += P(`M${f(dx - dw / 2 + 3)} ${f(base - 1)}V${f(base - dh + dw / 2)}A${f(dw / 2 - 3)} ${f(dw / 2 - 3)} 0 0 1 ${f(dx + dw / 2 - 3)} ${f(base - dh + dw / 2)}V${f(base - 1)}Z`, C.shroomDoor);
  o += circ(dx + dw * 0.22, base - dh * 0.42, 1.6, C.shroomWin);
  // LOW BRANCHES: one on each side, leaving the trunk below the canopy and reaching out past it, nearly level
  const by = cy + cr * 0.86;   // where branches leave the trunk (just under the canopy)
  const sides = [[-1, spans[0]], [1, spans[1]]];
  let branchSvg = '', leafSvg = '';
  sides.forEach(([sd, span], i) => {
    const y0 = by + (i ? 6 : 0), tipX = x + sd * (cr + span * 0.28 + tw), tipY = y0 - 10;
    const midX = x + sd * (cr * 0.55), midY = y0 + 8;
    const thick = tw * 0.72;
    // tapered limb as a filled shape
    branchSvg += P(`M${f(x + sd * tw * 0.6)} ${f(y0 - thick)}Q${f(midX)} ${f(midY - thick * 0.9)} ${f(tipX)} ${f(tipY - 2.5)}Q${f(tipX + sd * 4)} ${f(tipY)} ${f(tipX)} ${f(tipY + 2.5)}Q${f(midX)} ${f(midY + thick * 0.6)} ${f(x + sd * tw * 0.6)} ${f(y0 + thick)}Z`, C.trunk);
    branchSvg += strokeP(`M${f(x + sd * tw)} ${f(y0 + thick * 0.55)}Q${f(midX)} ${f(midY + thick * 0.35)} ${f(tipX - sd * 6)} ${f(tipY + 1.5)}`, C.trunkSh, 2.4, ' opacity="0.9"');
    // a short twig up near the tip
    branchSvg += strokeP(`M${f(tipX - sd * 26)} ${f(tipY + 0)}q${f(sd * 4)} ${f(-10)} ${f(sd * 12)} ${f(-16)}`, C.trunk, 3.2);
    // leaf tuft on the tip (spring/summer/autumn); winter: snow line on top
    if (!C.bare) leafSvg += circ(tipX - sd * 14, tipY - 18, 11, cf) + circ(tipX - sd * 4, tipY - 12, 8, cf) + circ(tipX - sd * 8, tipY - 13, 6, cs, ' opacity="0.8"');
    else leafSvg += strokeP(`M${f(x + sd * cr * 0.6)} ${f(y0 - thick * 0.75 + 3)}Q${f(midX + sd * 10)} ${f(midY - thick * 0.9)} ${f(tipX - sd * 3)} ${f(tipY - 2.5)}`, C.snow, 3.6);
    // lantern hang points: the tip (hook just under it) and a second spot half-way along the limb
    if (record) {
      BRANCHES.push({ x: Math.round(tipX - sd * 10), y: Math.round(tipY + 4), tree: seed, side: sd < 0 ? 'L' : 'R' });
      BRANCHES.push({ x: Math.round(x + sd * (cr * 0.55 + 18)), y: Math.round(midY + 2), tree: seed, side: sd < 0 ? 'L' : 'R' });
    }
  });
  o += branchSvg;
  // canopy
  const puffs = [[0, 0, 1], [-0.66, 0.3, 0.64], [0.66, 0.28, 0.68], [-0.3, -0.46, 0.6], [0.34, -0.42, 0.6], [0, 0.48, 0.58]]
    .map(([u, v, k]) => [x + u * cr * (0.95 + r() * 0.1), cy + v * cr, cr * k]);
  if (C.bare) {
    // winter: thinner, airy canopy (smaller puffs) with visible bare twigs in front
    o += puffs.map(([px, py, pr]) => circ(px, py, pr * 0.86, cf)).join('');
    o += puffs.filter((_, i) => i === 0 || i === 2 || i === 5).map(([px, py, pr]) => circ(px + pr * 0.25, py + pr * 0.28, pr * 0.62, cs, ' opacity="0.9"')).join('');
    let tw2 = '';
    for (const [ax, ay, bx, bY] of [[0, 0.7, -0.42, -0.1], [0, 0.6, 0.48, -0.05], [0, 0.4, 0.05, -0.55], [-0.2, 0.2, -0.62, 0.22], [0.2, 0.15, 0.6, 0.3]]) tw2 += `M${f(x + ax * cr)} ${f(cy + ay * cr)}Q${f(x + (ax + bx) * 0.5 * cr)} ${f(cy + (ay + bY) * 0.5 * cr - 8)} ${f(x + bx * cr)} ${f(cy + bY * cr)}`;
    o += strokeP(tw2, C.trunk, 4) + strokeP(tw2, C.trunkSh, 1.4, ' opacity="0.6"');
    // snow caps on the upper puffs
    for (const [px, py, pr] of [puffs[3], puffs[4], puffs[0], puffs[1], puffs[2]]) {
      const rr = pr * 0.86;
      o += P(`M${f(px - rr * 0.92)} ${f(py - rr * 0.32)}A${f(rr)} ${f(rr)} 0 0 1 ${f(px + rr * 0.92)} ${f(py - rr * 0.32)}Q${f(px + rr * 0.45)} ${f(py - rr * 0.48)} ${f(px + rr * 0.1)} ${f(py - rr * 0.36)}Q${f(px - rr * 0.35)} ${f(py - rr * 0.5)} ${f(px - rr * 0.92)} ${f(py - rr * 0.32)}Z`, C.snow);
    }
  } else {
    o += puffs.map(([px, py, pr]) => circ(px, py, pr, cf)).join('');
    o += `<g>${puffs.filter((_, i) => i === 0 || i === 2 || i === 5).map(([px, py, pr]) => circ(px + pr * 0.28, py + pr * 0.3, pr * 0.74, cs)).join('')}</g>`;
    o += puffs.slice(3, 5).map(([px, py, pr]) => circ(px, py, pr * 0.9, cf)).join('');
    o += ell(x - cr * 0.45, cy - cr * 0.52, cr * 0.32, cr * 0.18, ch, ` opacity="0.95" transform="rotate(-25 ${f(x - cr * 0.45)} ${f(cy - cr * 0.52)})"`);
    o += ell(x - cr * 0.95, cy + cr * 0.02, cr * 0.16, cr * 0.1, ch, ` opacity="0.8" transform="rotate(-35 ${f(x - cr * 0.95)} ${f(cy)})"`);
    // a few leaf curls for texture
    let curls = '';
    for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2, d = cr * (0.25 + r() * 0.6), px = x + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9; if (i < 4) curls += `M${f(px - 8)} ${f(py + 3)}q${f(8)} ${f(5)} ${f(16)} 0`; }
    o += strokeP(curls, cs, 2.2, ' opacity="0.55"');
    if (C.blossom) { // spring: pink blossom clusters on the canopy
      const bd = ['', '', ''], cd = [];
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2, d = cr * Math.sqrt(r()) * 1.05, px = x + Math.cos(a) * d * 1.15, py = cy + Math.sin(a) * d * 0.95 - 4;
        const s = 3.4 + r() * 2.4;
        for (let k = 0; k < 5; k++) { const b = k * 1.2566 + r() * 0.2; bd[i % 3] += cpath(px + Math.cos(b) * s * 0.9, py + Math.sin(b) * s * 0.9, s * 0.62); }
        cd.push(cpath(px, py, s * 0.36));
      }
      o += bd.map((d, i) => P(d, C.blossom[i])).join('') + P(cd.join(''), '#FFF4D6');
    }
  }
  o += leafSvg;
  return o;
}
function smallTree(x, base, h, seed, key, C) {
  const r = rng(seed); const cr = h * 0.33, cy = base - h + cr * 1.05; const [cf, cs, ch] = canopyPal(C, key);
  let o = ell(x + h * 0.04, base + 1, h * 0.26, h * 0.04, C.hillBackSh, ' opacity="0.8"');
  o += P(`M${f(x - h * 0.045)} ${f(base)}L${f(x - h * 0.03)} ${f(cy + cr * 0.4)}L${f(x + h * 0.03)} ${f(cy + cr * 0.4)}L${f(x + h * 0.045)} ${f(base)}Z`, C.trunk);
  const puffs = [[0, 0, 1], [-0.62, 0.32, 0.66], [0.62, 0.3, 0.7], [-0.25, -0.42, 0.62], [0.32, -0.38, 0.6]].map(([u, v, k]) => [x + u * cr * (0.95 + r() * 0.1), cy + v * cr, cr * k * (C.bare ? 0.86 : 1)]);
  o += puffs.map(([px, py, pr]) => circ(px, py, pr, cf)).join('');
  o += puffs.filter((_, i) => i === 0 || i === 2).map(([px, py, pr]) => circ(px + pr * 0.28, py + pr * 0.3, pr * 0.76, cs)).join('');
  o += puffs.slice(3).map(([px, py, pr]) => circ(px, py, pr * 0.9, cf)).join('');
  if (C.bare) for (const [px, py, pr] of puffs.slice(3).concat([puffs[0]])) o += P(`M${f(px - pr * 0.85)} ${f(py - pr * 0.25)}A${f(pr * 0.9)} ${f(pr * 0.9)} 0 0 1 ${f(px + pr * 0.85)} ${f(py - pr * 0.25)}Q${f(px)} ${f(py - pr * 0.5)} ${f(px - pr * 0.85)} ${f(py - pr * 0.25)}Z`, C.snow);
  else o += ell(x - cr * 0.42, cy - cr * 0.5, cr * 0.3, cr * 0.18, ch, ` opacity="0.9" transform="rotate(-25 ${f(x - cr * 0.42)} ${f(cy - cr * 0.5)})"`);
  if (C.blossom) for (let i = 0; i < 8; i++) { const a = r() * 6.28, d = cr * Math.sqrt(r()), px = x + Math.cos(a) * d * 1.1, py = cy + Math.sin(a) * d * 0.9; o += circ(px, py, 3.2, C.blossom[i % 3]) + circ(px + 3, py + 2, 2.4, C.blossom[(i + 1) % 3]); }
  return o;
}
function mushroomHouse(x, base, s, C) {
  // cream stem house with a round door + window, dome cap with pale dots; winter: snow on the cap
  let o = ell(x + 4 * s, base + 2, 34 * s, 5 * s, C.bankSh, ' opacity="0.9"');
  const sw0 = 22 * s, sw1 = 17 * s, sh = 44 * s;
  o += P(`M${f(x - sw0)} ${f(base)}Q${f(x - sw0 - 2 * s)} ${f(base - sh * 0.5)} ${f(x - sw1)} ${f(base - sh)}L${f(x + sw1)} ${f(base - sh)}Q${f(x + sw0 + 2 * s)} ${f(base - sh * 0.5)} ${f(x + sw0)} ${f(base)}Z`, C.shroomStem);
  o += P(`M${f(x + 6 * s)} ${f(base)}L${f(x + 6 * s)} ${f(base - sh)}L${f(x + sw1)} ${f(base - sh)}Q${f(x + sw0 + 2 * s)} ${f(base - sh * 0.5)} ${f(x + sw0)} ${f(base)}Z`, C.shroomStemSh);
  // door
  o += P(`M${f(x - 9 * s)} ${f(base)}V${f(base - 16 * s)}A${f(8 * s)} ${f(8 * s)} 0 0 1 ${f(x + 7 * s)} ${f(base - 16 * s)}V${f(base)}Z`, C.shroomDoor);
  o += strokeP(`M${f(x - 1 * s)} ${f(base - 22 * s)}V${f(base)}`, C.shroomLine, 1.2 * s, ' opacity="0.6"');
  o += circ(x + 3.5 * s, base - 10 * s, 1.3 * s, C.shroomWin);
  // round window
  o += circ(x + 13 * s, base - 30 * s, 4.6 * s, C.shroomLine) + circ(x + 13 * s, base - 30 * s, 3.4 * s, C.shroomWin);
  // step stones
  o += ell(x - 1 * s, base + 2 * s, 9 * s, 2.6 * s, '#D9CDB4');
  // cap
  const cw = 40 * s, ch = 34 * s, cb = base - sh + 6 * s;
  o += P(`M${f(x - cw)} ${f(cb)}C${f(x - cw)} ${f(cb - ch * 1.25)} ${f(x + cw)} ${f(cb - ch * 1.25)} ${f(x + cw)} ${f(cb)}Q${f(x)} ${f(cb + 8 * s)} ${f(x - cw)} ${f(cb)}Z`, C.cap);
  o += P(`M${f(x + 6 * s)} ${f(cb + 5 * s)}C${f(x + 26 * s)} ${f(cb - 4 * s)} ${f(x + 30 * s)} ${f(cb - ch * 0.7)} ${f(x + 14 * s)} ${f(cb - ch * 0.92)}C${f(x + cw)} ${f(cb - ch * 0.75)} ${f(x + cw)} ${f(cb - 4 * s)} ${f(x + cw)} ${f(cb)}Q${f(x + 24 * s)} ${f(cb + 6 * s)} ${f(x + 6 * s)} ${f(cb + 5 * s)}Z`, C.capSh);
  o += strokeP(`M${f(x - cw + 2)} ${f(cb + 1)}Q${f(x)} ${f(cb + 8 * s)} ${f(x + cw - 2)} ${f(cb + 1)}`, C.capSh, 2.4 * s);
  for (const [u, v, rr] of [[-22, -12, 5.5], [-4, -24, 6.5], [16, -14, 5], [-28, -2, 3.2], [28, -2, 3], [4, -8, 3.4]]) o += circ(x + u * s, cb + v * s, rr * s, C.shroomDot, ' opacity="0.95"');
  o += ell(x - 18 * s, cb - 22 * s, 9 * s, 4.5 * s, C.capHi, ` opacity="0.9" transform="rotate(-28 ${f(x - 18 * s)} ${f(cb - 22 * s)})"`);
  if (C.snow) o += P(`M${f(x - cw * 0.86)} ${f(cb - ch * 0.42)}C${f(x - cw * 0.7)} ${f(cb - ch * 1.08)} ${f(x + cw * 0.7)} ${f(cb - ch * 1.08)} ${f(x + cw * 0.88)} ${f(cb - ch * 0.4)}Q${f(x + cw * 0.6)} ${f(cb - ch * 0.62)} ${f(x + cw * 0.36)} ${f(cb - ch * 0.5)}Q${f(x + 2 * s)} ${f(cb - ch * 0.72)} ${f(x - cw * 0.3)} ${f(cb - ch * 0.52)}Q${f(x - cw * 0.6)} ${f(cb - ch * 0.6)} ${f(x - cw * 0.86)} ${f(cb - ch * 0.42)}Z`, C.snow);
  // chimney-ish tiny lamp by the door (soft, not an answer colour)
  o += rect(x - 20 * s, base - 14 * s, 2 * s, 14 * s, C.shroomLine) + circ(x - 19 * s, base - 16 * s, 3.4 * s, '#FFF1C9');
  return o;
}
function fern(x, base, s, flip, C) {
  // a fan of 5 curved fronds with little leaflets
  let o = '';
  const angs = [-1.25, -0.75, -0.3, 0.2, 0.7];
  angs.forEach((a0, i) => {
    const a = (flip ? -1 : 1) * a0, L = (26 + (i % 2 ? 6 : 12)) * s;
    const tx = x + Math.sin(a) * L, ty = base - Math.cos(a) * L;
    const mx = x + Math.sin(a) * L * 0.5 + (flip ? -1 : 1) * 3 * s, my = base - Math.cos(a) * L * 0.6;
    const col = i % 2 ? C.fernSh : C.fern;
    o += strokeP(`M${f(x)} ${f(base)}Q${f(mx)} ${f(my)} ${f(tx)} ${f(ty)}`, col, 2.2 * s);
    let lf = '';   // leaflets: short round-capped strokes on both sides of the frond, one path per frond
    for (let k = 1; k <= 4; k++) {
      const t = k / 5, px = x + (tx - x) * t, py = base + (ty - base) * t, lw = (1 - t * 0.6) * 6.5 * s;
      for (const da of [1.22, -1.22]) { const b = -Math.PI / 2 + a + da * 0.85; lf += `M${f(px)} ${f(py)}l${f(Math.cos(b) * lw)} ${f(Math.sin(b) * lw)}`; }
    }
    o += strokeP(lf, col, 4 * s);
  });
  if (C.snow) o += ell(x, base - 2, 16 * s, 5 * s, C.snow);
  return o;
}
function bush(x, base, s, C) {
  let o = circ(x - 12 * s, base - 9 * s, 12 * s, C.bush) + circ(x + 2 * s, base - 15 * s, 15 * s, C.bush) + circ(x + 16 * s, base - 8 * s, 11 * s, C.bush);
  o += circ(x + 8 * s, base - 8 * s, 10 * s, C.bushSh, ' opacity="0.9"');
  o += rect(x - 24 * s, base - 9 * s, 50 * s, 9 * s, C.bush, 4 * s);
  if (C.snow) o += P(`M${f(x - 22 * s)} ${f(base - 14 * s)}Q${f(x - 12 * s)} ${f(base - 26 * s)} ${f(x)} ${f(base - 28 * s)}Q${f(x + 14 * s)} ${f(base - 28 * s)} ${f(x + 26 * s)} ${f(base - 12 * s)}Q${f(x + 10 * s)} ${f(base - 20 * s)} ${f(x - 22 * s)} ${f(base - 14 * s)}Z`, C.snow);
  else if (C.blossom) o += circ(x - 6 * s, base - 16 * s, 2.6 * s, C.blossom[1]) + circ(x + 10 * s, base - 20 * s, 2.6 * s, C.blossom[0]) + circ(x + 18 * s, base - 10 * s, 2.4 * s, C.blossom[1]);
  return o;
}
function lilyPad(x, y, s, C, flower) {
  // seen at a low angle: flattened disc with a notch
  const rx = 16 * s, ry = 5.4 * s;
  let o = ell(x + 1, y + 1.6 * s, rx, ry, C.waterSh, ' opacity="0.9"');
  o += P(`M${f(x)} ${f(y)}L${f(x + rx * 0.95)} ${f(y - ry * 0.3)}A${f(rx)} ${f(ry)} 0 1 1 ${f(x + rx * 0.7)} ${f(y - ry * 0.75)}Z`, C.pad);
  o += P(`M${f(x - rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 0 0 ${f(x + rx)} ${f(y)}A${f(rx)} ${f(ry * 0.5)} 0 0 1 ${f(x - rx)} ${f(y)}Z`, C.padSh, ' opacity="0.7"');
  if (C.ice) o += ell(x - 2 * s, y - 1.4 * s, rx * 0.72, ry * 0.55, C.snow, ' opacity="0.95"');
  if (flower && C.padFlower) {
    for (let k = 0; k < 6; k++) { const a = -Math.PI + k * Math.PI / 5; o += ell(x - 3 * s + Math.cos(a) * 4 * s, y - 4 * s + Math.sin(a) * 2.6 * s, 3 * s, 1.8 * s, C.padFlower, ` transform="rotate(${f(a * 57.3)} ${f(x - 3 * s + Math.cos(a) * 4 * s)} ${f(y - 4 * s + Math.sin(a) * 2.6 * s)})"`); }
    o += circ(x - 3 * s, y - 5 * s, 2 * s, '#F3DDA0');
  }
  return o;
}
function genMid(C, record) {
  PREC = 1;
  const backY = x => 214 + wave([[16, 1, 0.3], [10, 2, 2.0], [5, 5, 4.1]])(x);
  const bankY = x => 288 + wave([[7, 1, 2.6], [5, 3, 0.8], [2, 7, 1.7]])(x);
  // pond: a long shallow band at the bottom, its top edge dips and rises (integer periods), with two shallow bays
  const pondTop = x => 308 + wave([[7, 1, 0.9], [6, 2, 3.3], [3, 5, 0.2]])(x);
  let o = '';
  const defs = lg('wat', 0, 0, 0, 1, [[0, C.waterSh], [0.5, C.water], [1, C.water]]);
  // back hill with bushes + small trees
  o += P(bandD(backY, 360), C.hillBack);
  o += P(bandD(x => backY(x) + 24 + wave([[7, 3, 1.0]])(x), 360), C.hillBackSh, ' opacity="0.6"');
  o += strokeP(edgeD(x => backY(x) + 3), C.hillBackHi, 5);
  SMALL_TREES.forEach(([x, , h, sd, key]) => { o += wrap(x, h * 0.4, xx => smallTree(xx, backY(xx) + 16 + (h > 160 ? 6 : 0), h, sd, key, C)); });
  [[260, 0.9], [470, 1.0], [690, 0.85], [870, 0.95], [1040, 0.8]].forEach(([x, s]) => { o += wrap(x, 30 * s, xx => bush(xx, backY(xx) + 18, s, C)); });
  // the bank (front) the big trees stand on
  o += P(bandD(bankY, 360), C.bank);
  o += P(bandD(x => bankY(x) + 14 + wave([[3, 4, 2.0]])(x), 360), C.bankSh, ' opacity="0.55"');
  o += strokeP(edgeD(x => bankY(x) + 3), C.bankHi, 5);
  // big trees
  BIG_TREES.forEach(([x, base, h, sd, key, spans]) => { o += wrap(x, h * 0.55, xx => bigTree(xx, base, h, sd, key, spans, C, record && xx === x)); });
  // mushroom houses + ferns
  [[355, 300, 1.0], [800, 296, 0.85], [1100, 302, 0.7]].forEach(([x, b, s]) => { o += wrap(x, 50 * s, xx => mushroomHouse(xx, b, s, C)); });
  [[60, 312, 1.0, 0], [262, 310, 1.1, 1], [452, 306, 0.9, 0], [672, 308, 1.0, 1], [880, 312, 0.95, 0], [1050, 314, 0.85, 1], [1178, 310, 1.0, 0]].forEach(([x, b, s, fl]) => { o += wrap(x, 46 * s, xx => fern(xx, b, s, fl, C)); });
  // pond
  o += P(between(x => pondTop(x) - 4, () => 362), C.shore);
  o += P(bandD(pondTop, 362), 'url(#wat)');
  o += strokeP(edgeD(x => pondTop(x) + 1.5), C.waterSh, 3, ' opacity="0.9"');
  const r = rng(77);
  if (C.ice) {
    // frozen: pale sheen streaks, a few soft crack lines, snow drifts on the edge
    for (let i = 0; i < 9; i++) { const x = (i + r()) * W / 9, y = 326 + r() * 14; o += wrap(x, 50, xx => strokeP(`M${f(xx - 34)} ${f(y)}L${f(xx + 30)} ${f(y - 3)}`, C.waterHi, 4, ' opacity="0.9"')); }
    for (let i = 0; i < 5; i++) { const x = (i + 0.3 + r() * 0.4) * W / 5, y = 330 + r() * 8; o += wrap(x, 40, xx => strokeP(`M${f(xx - 26)} ${f(y + 3)}L${f(xx - 8)} ${f(y)}L${f(xx + 4)} ${f(y + 4)}L${f(xx + 22)} ${f(y + 1)}M${f(xx - 8)} ${f(y)}L${f(xx - 4)} ${f(y - 5)}`, '#B7D3E0', 1.2, ' opacity="0.8"')); }
    o += P(between(x => pondTop(x) - 6 + wave([[2, 9, 0.4]])(x), x => pondTop(x) + 4 + wave([[3, 6, 1.4], [2, 13, 0.3]])(x)), C.snow);
  } else {
    // ripples + reflections
    for (let i = 0; i < 12; i++) { const x = (i + r()) * W / 12, y = 326 + r() * 14, l = 18 + r() * 22; o += wrap(x, l, xx => strokeP(`M${f(xx - l)} ${f(y)}Q${f(xx)} ${f(y - 2)} ${f(xx + l)} ${f(y)}`, C.waterHi, 2.4, ' opacity="0.85"')); }
  }
  // lily pads (also perch spots: tops reported as lily perches)
  [[210, 330, 1.0, 1], [252, 336, 0.75, 0], [520, 328, 1.1, 0], [640, 334, 0.9, 1], [930, 330, 1.05, 1], [978, 337, 0.7, 0], [1150, 331, 0.9, 0]].forEach(([x, y, s, fl]) => { o += wrap(x, 18 * s, xx => lilyPad(xx, y, s, C, fl)); });
  // reeds at the pond edge
  const reed = C.ice ? '#BFCBB8' : C.fernSh;
  [[96, 318], [420, 316], [742, 320], [1016, 318]].forEach(([x, y]) => {
    o += wrap(x, 14, xx => strokeP(`M${f(xx)} ${f(y)}q-2 -22 -6 -36M${f(xx + 5)} ${f(y)}q1 -26 4 -42M${f(xx + 10)} ${f(y)}q3 -16 8 -26`, reed, 2.6) + rect(xx + 3.2, y - 46, 4.4, 12, C.trunkSh, 2.2) + rect(xx - 9, y - 40, 4, 10, C.trunkSh, 2));
  });
  PREC = 10;
  return svg(1200, 360, o, defs);
}

// ================= ground_<s>.svg (0 0 1200 260): moss/grass, tiny flowers, leaves or snow; top edge ≈ y 40 =================
function flower(x, y, s, petal, C) {
  let o = strokeP(`M${f(x)} ${f(y + 2 * s)}q${f(-1 * s)} ${f(5 * s)} ${f(0.5 * s)} ${f(9 * s)}`, C.flStem, 1.6 * s);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; o += circ(x + Math.cos(a) * 3.4 * s, y + Math.sin(a) * 3.4 * s, 2.9 * s, petal); }
  return o + circ(x, y, 2.1 * s, C.flC);
}
function tuft(x, y, s, C) {
  const d = `M${f(x - 7 * s)} ${f(y)}Q${f(x - 7 * s)} ${f(y - 7 * s)} ${f(x - 10 * s)} ${f(y - 12 * s)}Q${f(x - 3 * s)} ${f(y - 8 * s)} ${f(x - 2 * s)} ${f(y - 3 * s)}Q${f(x - 1 * s)} ${f(y - 11 * s)} ${f(x + 1 * s)} ${f(y - 16 * s)}Q${f(x + 4 * s)} ${f(y - 9 * s)} ${f(x + 3 * s)} ${f(y - 3 * s)}Q${f(x + 6 * s)} ${f(y - 9 * s)} ${f(x + 11 * s)} ${f(y - 11 * s)}Q${f(x + 8 * s)} ${f(y - 5 * s)} ${f(x + 8 * s)} ${f(y)}Z`;
  return P(d, C.tuft) + strokeP(`M${f(x - 1.5 * s)} ${f(y - 4 * s)}Q${f(x - 0.5 * s)} ${f(y - 10 * s)} ${f(x + 1 * s)} ${f(y - 14 * s)}`, C.tuftHi, 1.3 * s, ' opacity="0.8"');
}
function fallenLeaf(x, y, s, rot, col) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)} ${f(s * 0.55)})">${P('M0 -7C5 -4 5 4 0 7C-5 4 -5 -4 0 -7Z', col)}${strokeP('M0 -6L0 6', '#00000022', 0.9)}</g>`;
}
function petalBit(x, y, s, rot, col) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)} ${f(s * 0.6)})">${P('M0 -4C3 -2 3 2 0 4C-3 2 -3 -2 0 -4Z', col)}</g>`;
}
function genGround(C) {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.grassTop], [0.3, C.grass], [1, C.grassLow]]);
  const lip = x => 40 + wave([[3, 2, 0.7], [2, 5, 2.2], [1, 11, 0.4]])(x);
  let o = '';
  o += P(bandD(lip, 260, 4), 'url(#gfill)');
  o += P(between(lip, x => lip(x) + 10 + wave([[3, 4, 1.2], [2, 9, 0.3]])(x)), C.grassLow, ' opacity="0.4"');
  o += strokeP(edgeD(x => lip(x) + 1, 6), C.rim, 3);
  o += strokeP(edgeD(x => lip(x) + 5, 6), C.lipHi, 2.5, ' opacity="0.9"');
  const r = rng(21);
  // soft moss patches (rounded, slightly darker / lighter) to break up the flat fill
  for (const [x, y, rx, k] of [[150, 196, 130, 0], [520, 226, 160, 1], [860, 190, 120, 0], [1120, 232, 130, 1], [340, 92, 100, 1], [980, 96, 110, 0], [690, 132, 90, 0], [40, 120, 80, 1]]) {
    o += wrap(x, rx, xx => ell(xx, y, rx, rx * 0.17, k ? C.lipHi : C.moss, ` opacity="${k ? 0.5 : 0.55}"`));
  }
  if (C.ice) {
    // snow: blue-grey shadow dips + sparkle dots, a few grass blades and twigs poking out
    for (let i = 0; i < 10; i++) { const x = (i + r()) * W / 10, y = 80 + r() * 160, rx = 50 + r() * 60; o += wrap(x, rx, xx => P(`M${f(xx - rx)} ${f(y)}Q${f(xx)} ${f(y - 12)} ${f(xx + rx)} ${f(y)}Q${f(xx)} ${f(y + 6)} ${f(xx - rx)} ${f(y)}Z`, C.rim, ' opacity="0.45"')); }
    for (let i = 0; i < 22; i++) { const x = (i + 0.2 + r() * 0.6) * W / 22, y = 60 + r() * 190, s = 0.6 + r() * 0.5; o += wrap(x, 12, xx => tuft(xx, y, s, C) + ell(xx, y, 9 * s, 2.5 * s, C.grassTop)); }
    for (let i = 0; i < 50; i++) { const x = r() * W, y = 50 + r() * 205; o += wrap(x, 3, xx => circ(xx, y, 1.2 + r(), '#FFFFFF', ' opacity="0.95"')); }
    for (let i = 0; i < 6; i++) { const x = (i + r()) * W / 6, y = 110 + r() * 120; o += wrap(x, 22, xx => strokeP(`M${f(xx - 16)} ${f(y)}L${f(xx + 14)} ${f(y - 4)}M${f(xx + 2)} ${f(y - 2)}l6 -7`, '#B59F86', 2.2)); }
  } else {
    for (let i = 0; i < 36; i++) { const x = (i + 0.2 + r() * 0.6) * W / 36, y = 62 + r() * 190, s = 0.7 + r() * 0.6; o += wrap(x, 16 * s, xx => tuft(xx, y, s, C)); }
    // tiny flowers in clusters (pale only)
    const nCl = C.litter && C.litterN > 40 ? 8 : 18;
    for (let i = 0; i < nCl; i++) {
      const cx = (i + 0.5) * W / nCl + (r() - 0.5) * 30, cy = 66 + r() * 180, n = 1 + Math.floor(r() * 3), col = C.fl[i % C.fl.length];
      for (let k = 0; k < n; k++) { const x = cx + (k - 1) * 12 + r() * 4, y = cy + (k % 2) * 6, s = 0.85 + r() * 0.35; o += wrap(x, 8, xx => flower(xx, y, s, col, C)); }
    }
    // clover dots
    for (let i = 0; i < 40; i++) { const x = r() * W, y = 70 + r() * 185; o += wrap(x, 4, xx => circ(xx, y, 1.6 + r(), C.tuftHi, ' opacity="0.7"')); }
    // little round stones
    for (let i = 0; i < 7; i++) { const x = (i + r()) * W / 7, y = 90 + r() * 150, s = 4 + r() * 4; o += wrap(x, 10, xx => ell(xx, y, s * 1.4, s, '#D7CFBE') + ell(xx - s * 0.4, y - s * 0.4, s * 0.6, s * 0.3, '#F1EBDD')); }
    // seasonal litter: petals (spring) / fallen leaves (autumn)
    if (C.litter) for (let i = 0; i < C.litterN; i++) {
      const x = r() * W, y = 52 + r() * 200, rot = r() * 360, col = C.litter[i % C.litter.length], s = C.litterN > 40 ? 1.1 + r() * 0.7 : 1 + r() * 0.6;
      o += wrap(x, 10, xx => (C.litterN > 40 ? fallenLeaf : petalBit)(xx, y, s, rot, col));
    }
  }
  return svg(1200, 260, o, defs);
}

// ================= sun, clouds =================
function genSun() {
  // pale buttery disc (much lighter than the yellow answer #FFD23F) + soft rounded rays, no face
  const defs = rg('glow', [[0, '#FFF8DE', 0.9], [0.45, '#FFF0C2', 0.45], [1, '#FFF0C2', 0]]) + rg('disc', [[0, '#FFFBE4'], [0.7, '#FFF1BC'], [1, '#FCE8A6']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 88; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEDB4', 9, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F6E1A0') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genClouds() {
  const out = {};
  const mk = (puffs, base, sh, hi, bottom) => {
    const x0 = puffs[0][0] - puffs[0][2] * 0.7, x1 = puffs[puffs.length - 1][0] + puffs[puffs.length - 1][2] * 0.7, hb = 30;
    let o = `<rect x="${f(x0)}" y="${bottom - hb + 6}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${sh}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y + 7, r, sh)).join('');
    o += `<rect x="${f(x0)}" y="${bottom - hb}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${base}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y, r, base)).join('');
    o += puffs.slice(0, 3).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.45, r * 0.4, r * 0.2, hi, ' opacity="0.95"')).join('');
    return svg(300, 160, o);
  };
  out.cloud1 = mk([[66, 106, 32], [116, 84, 44], [174, 74, 50], [228, 98, 38], [150, 110, 34]], '#FFFFFF', '#E1E9EE', '#FFFFFF', 132);
  out.cloud2 = mk([[58, 112, 26], [102, 94, 36], [152, 98, 34], [200, 106, 28], [244, 116, 22]], '#FFFFFF', '#E3EAEF', '#FFFFFF', 134);
  out.cloud3 = mk([[76, 100, 38], [136, 70, 52], [194, 84, 42], [236, 110, 28], [128, 112, 34]], '#FFFFFF', '#DEE6EC', '#FFFFFF', 136);
  return out;
}

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#FFF3D0')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#FFEBAE" stroke="#FFEBAE" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFCEA"/>`);
  p.firefly = S(circ(16, 16, 16, 'url(#ff)') + circ(16, 16, 4.2, '#F4FFB8') + circ(15, 15, 2, '#FFFFF0'), rg('ff', [[0, '#EFFF9A', 0.95], [0.3, '#D8F57A', 0.55], [1, '#C8F06A', 0]]));
  // blossom petal (spring): blush pink, a notch at the tip
  p.petal = S(`<g transform="rotate(-20 16 16)">${P('M16 4C22 7 24 17 16 28C8 17 10 7 16 4Z', '#FBDCE6')}${P('M16 4C22 7 24 17 16 28C19 18 19 9 16 4Z', '#F2C5D4')}${P('M13.6 4.6L16 8L18.4 4.6Q16 3 13.6 4.6Z', '#FFFFFF', ' opacity="0.9"')}${ell(13.5, 12, 2, 4, '#FFF3F7', ' opacity="0.9"')}</g>`);
  // autumn leaves: dusty apricot (a) and soft rose-brown (b) — muted, never answer orange/red
  const leaf = (c1, c2, vein, rot) => S(`<g transform="rotate(${rot} 16 16)">${P('M16 3C24 8 25 20 16 29C7 20 8 8 16 3Z', c1)}${P('M16 3C24 8 25 20 16 29C19 20 20 10 16 3Z', c2)}${strokeP('M16 6L16 30M16 13l4 -3M16 19l-4 -3M16 22l4 -3', vein, 1.3)}</g>`);
  p.leaf_a = leaf('#E8BC8A', '#D9A776', '#C08E61', -30);
  // leaf_b: a rounded maple-ish 5-lobe leaf
  const lobes = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; lobes.push([16 + Math.cos(a) * 12, 15 + Math.sin(a) * 12]); }
  p.leaf_b = S(`<g transform="rotate(18 16 16)">${lobes.map(([x, y]) => circ(x, y, 5.2, '#D9A193')).join('')}${circ(16, 16, 8.5, '#D9A193')}${circ(18, 18, 6, '#C98D80', ' opacity="0.8"')}${strokeP('M16 30L16 16M16 16L9 9M16 16L23 9M16 16L16 5', '#B47A6E', 1.3)}</g>`);
  // snowflakes: snow1 = soft round flake, snow2 = little six-arm crystal
  p.snow1 = S(circ(16, 16, 11, 'url(#sn)') + circ(16, 16, 6.5, '#FFFFFF') + circ(14, 14, 2.2, '#FFFFFF'), rg('sn', [[0, '#FFFFFF', 0.9], [0.6, '#F1F7FC', 0.6], [1, '#E6F0F8', 0]]));
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 12)} ${f(16 + s * 12)}M${f(16 + c * 7)} ${f(16 + s * 7)}L${f(16 + c * 7 + Math.cos(a + 0.8) * 4)} ${f(16 + s * 7 + Math.sin(a + 0.8) * 4)}M${f(16 + c * 7)} ${f(16 + s * 7)}L${f(16 + c * 7 + Math.cos(a - 0.8) * 4)} ${f(16 + s * 7 + Math.sin(a - 0.8) * 4)}`; }
  p.snow2 = S(strokeP(arms, '#DCE9F4', 3.6) + strokeP(arms, '#FFFFFF', 2) + circ(16, 16, 2.6, '#FFFFFF'));
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFDF6', 0.95], [0.7, '#EEF0E6', 0.8], [1, '#E0E4D6', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  return p;
}

// ---------------- write ----------------
if (require.main === module) {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const files = { sun: genSun(), ...genClouds() };
  let first = true;
  for (const s of Object.keys(SEASONS)) {
    const C = SEASONS[s];
    files['far_' + s] = genFar(C); files['mid_' + s] = genMid(C, first); files['ground_' + s] = genGround(C); first = false;
  }
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
  const parts = genParticles();
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
  for (const [k, v] of [...Object.entries(files).map(([k, v]) => ['env/' + k, v]), ...Object.entries(parts).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024;
    const blur = (v.match(/feGaussianBlur/g) || []).length;
    const m = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    const okBox = m && m[1] === m[3] && m[2] === m[4];
    console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 90 ? '  TOO BIG' : ''}${/<text|<script|href=|@import|font|NaN/.test(v) || blur > 1 ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
  }
  console.log('BRANCHES (mid svg coords, lantern hang points):', JSON.stringify(BRANCHES.map(b => [b.x, b.y])));
}
function branches() { if (!BRANCHES.length) genMid(SEASONS.spring, true); return BRANCHES; }
module.exports = { SEASONS, branches, BIG_TREES };
