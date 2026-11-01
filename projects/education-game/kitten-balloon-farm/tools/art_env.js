// Kitten's Balloon Farm: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground,sun,moon,cloud1..3}.svg and particles/*.svg.
// Preview scenes + seam proof: node tools/env_scenes.js (after this script).
// Usage: node tools/art_env.js
// Tiling: every ridge/rail/path edge is a sum of sines with INTEGER periods over W (so f(0) = f(W)), and every object
// near an edge is drawn again at x±W (wrap()), so the left and right edges of each layer match exactly.
// Colour rule (DESIGN §3): everything here is calmer, lighter and less saturated than the balloon answer colours.
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

// ---------------- palette (calm; lighter + less saturated than the answer palette) ----------------
const C = {
  // far: hazy blue-sage hills, tiny farm buildings
  farBack: '#D3E4CF', farBackSh: '#C6DBC3', farFront: '#C2DAB2', farFrontSh: '#B4D0A4', farRow: '#CFE3BF', mist: '#F1F6EC',
  barn: '#C98B7A', barnSh: '#B67B6C', barnRoof: '#A9877E', barnRoofSh: '#977870', trim: '#F4EDE2',
  silo: '#DCD6CC', siloSh: '#C9C2B7', siloDome: '#B9B4AE',
  mill: '#E9E0D0', millSh: '#D6CBB8', millCap: '#B89E8A', sail: '#F6F1E8', sailFrame: '#B8A894',
  farTree: '#A9CC95', farTreeSh: '#9BC088', farTrunk: '#B3A089',
  // mid: rolling green hills, round trees, hay, fence
  hillBack: '#BBDAA2', hillBackSh: '#ACD094', hillBackHi: '#CDE5B6',
  hillFront: '#A8CF8E', hillFrontSh: '#99C480', hillFrontHi: '#BDDDA4',
  tree: '#97C783', treeSh: '#88B974', treeHi: '#B0D79C', trunk: '#A98A6C', trunkSh: '#937658',
  hay: '#E9D18A', haySh: '#D9BD72', hayLine: '#C9AA62', hayFace: '#F0DC9E',
  fence: '#E2C597', fenceSh: '#CDAD7F', fenceLine: '#B3926A',
  // ground: grass, path, flowers
  grassTop: '#BCE09B', grass: '#B5DB93', grassLow: '#9CCB7C', rim: '#93C274', lipHi: '#CBE8B0', tuft: '#93C373', tuftHi: '#C4E3A6',
  path: '#E8D7B0', pathSh: '#D8C294', pathEdge: '#CBB283', pebble: '#D6C29A', pebbleHi: '#F2E6CA',
  fl1: '#FFFFFF', fl2: '#ECE3F7', fl3: '#FBE4EC', fl4: '#FFF5D8', flC: '#F4DE98', flStem: '#86B96A',
};

// ---------------- far.svg (0 0 1200 420) ----------------
function farTree(x, base, s) {
  return rect(x - 1.6 * s, base - 9 * s, 3.2 * s, 9 * s, C.farTrunk, 1) + circ(x, base - 14 * s, 8 * s, C.farTree) + circ(x + 2.6 * s, base - 12 * s, 5.6 * s, C.farTreeSh, ' opacity="0.8"');
}
function barn(x, base, s) {
  // small red-brick barn with a gambrel roof, white trim and a cross door; seen from the front, slightly 3/4 (side wall on the right)
  const w = 60 * s, h = 36 * s, side = 26 * s; let o = '';
  const x0 = x - w / 2, x1 = x + w / 2, eave = base - h, ridge = eave - 30 * s;
  // side wall + side roof (right, shaded)
  o += P(poly([[x1, base], [x1 + side, base - 3 * s], [x1 + side, eave - 3 * s], [x1, eave]]), C.barnSh);
  o += P(poly([[x, ridge], [x + side, ridge - 3 * s], [x1 + side + 4 * s, eave - 4 * s], [x1 + 4 * s, eave + 1]]), C.barnRoofSh);
  // front gable wall
  const gab = [[x0, base], [x0, eave], [x0 + 8 * s, eave - 16 * s], [x, ridge], [x1 - 8 * s, eave - 16 * s], [x1, eave], [x1, base]];
  o += P(poly(gab), C.barn);
  o += strokeP(line([[x0 - 3 * s, eave + 2 * s], [x0 + 8 * s, eave - 16 * s], [x, ridge - 2 * s], [x1 - 8 * s, eave - 16 * s], [x1 + 3 * s, eave + 2 * s]]), C.barnRoof, 5 * s);
  // loft window + door with a white X
  o += rect(x - 6 * s, eave - 14 * s, 12 * s, 10 * s, C.trim, 1.5 * s);
  o += rect(x - 4.4 * s, eave - 12.4 * s, 8.8 * s, 6.8 * s, C.barnRoofSh, 1);
  const dw = 22 * s, dh = 24 * s, dx = x - dw / 2, dy = base - dh;
  o += rect(dx, dy, dw, dh, C.barnSh);
  o += strokeP(`M${f(dx)} ${f(dy)}L${f(dx + dw)} ${f(base)}M${f(dx + dw)} ${f(dy)}L${f(dx)} ${f(base)}`, C.trim, 2.4 * s);
  o += strokeP(`M${f(dx)} ${f(dy)}H${f(dx + dw)}V${f(base)}H${f(dx)}Z`, C.trim, 2.6 * s);
  o += strokeP(`M${f(x0)} ${f(eave)}V${f(base)}M${f(x1)} ${f(eave)}V${f(base)}`, C.trim, 2.4 * s, ' opacity="0.9"');
  return o;
}
function silo(x, base, s) {
  const w = 22 * s, h = 62 * s; let o = '';
  o += rect(x - w / 2, base - h, w, h, C.silo);
  o += rect(x + w * 0.12, base - h, w * 0.38, h, C.siloSh);
  o += P(`M${f(x - w / 2)} ${f(base - h)}A${f(w / 2)} ${f(w * 0.55)} 0 0 1 ${f(x + w / 2)} ${f(base - h)}Z`, C.siloDome);
  let rings = ''; for (let i = 1; i < 5; i++) rings += `M${f(x - w / 2)} ${f(base - h * i / 5)}H${f(x + w / 2)}`;
  o += strokeP(rings, C.siloSh, 1.4 * s, ' opacity="0.9"');
  return o;
}
function windmill(x, base, s, ang) {
  // tapered tower, cap, four lattice sails (static; slight tilt so it reads as turning)
  const h = 92 * s, bw = 30 * s, tw = 16 * s; let o = '';
  o += P(poly([[x - bw / 2, base], [x - tw / 2, base - h], [x + tw / 2, base - h], [x + bw / 2, base]]), C.mill);
  o += P(poly([[x + 2 * s, base], [x + 1 * s, base - h], [x + tw / 2, base - h], [x + bw / 2, base]]), C.millSh);
  o += P(`M${f(x - 7 * s)} ${f(base)}V${f(base - 14 * s)}A${f(7 * s)} ${f(7 * s)} 0 0 1 ${f(x + 7 * s)} ${f(base - 14 * s)}V${f(base)}Z`, C.millCap);
  o += rect(x - 4 * s, base - h * 0.6, 8 * s, 9 * s, C.millCap, 2 * s);
  const cy = base - h - 6 * s;
  o += P(`M${f(x - tw * 0.75)} ${f(base - h + 2 * s)}Q${f(x)} ${f(cy - 16 * s)} ${f(x + tw * 0.75)} ${f(base - h + 2 * s)}Z`, C.millCap);
  for (let i = 0; i < 4; i++) {
    const a = ang + i * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), T = (u, v) => [x + c * u - sn * v, cy + sn * u + c * v];
    const L = 58 * s, w0 = 4 * s, w1 = 14 * s;
    o += P(poly([T(10 * s, w0 * 0.2), T(L, w0 * 0.2), T(L, w1), T(16 * s, w1)]), C.sail);
    o += strokeP(line([T(2 * s, 0), T(L + 2 * s, 0)]), C.sailFrame, 2.6 * s);
    let lat = ''; for (let k = 1; k <= 4; k++) { const u = 16 * s + (L - 16 * s) * k / 4.4; const a1 = T(u, 0), a2 = T(u, w1); lat += `M${f(a1[0])} ${f(a1[1])}L${f(a2[0])} ${f(a2[1])}`; }
    const e1 = T(16 * s, w1), e2 = T(L, w1); lat += `M${f(e1[0])} ${f(e1[1])}L${f(e2[0])} ${f(e2[1])}`;
    o += strokeP(lat, C.sailFrame, 1.3 * s, ' opacity="0.85"');
  }
  o += circ(x, cy, 4.2 * s, C.millCap);
  return o;
}
function farmhouse(x, base, s) {
  // tiny cream farmhouse with a muted grey-blue roof and a chimney (far, low contrast)
  const w = 40 * s, h = 24 * s; let o = '';
  o += rect(x + w * 0.28, base - h - 22 * s, 6 * s, 12 * s, '#B7A89A');
  o += rect(x - w / 2, base - h, w, h, '#F1E8D8') + rect(x + w * 0.1, base - h, w * 0.4, h, '#E2D7C4');
  o += P(poly([[x - w / 2 - 5 * s, base - h + 1], [x - w * 0.18, base - h - 16 * s], [x + w * 0.38, base - h - 16 * s], [x + w / 2 + 5 * s, base - h + 1]]), '#AEB7C4');
  o += rect(x - w * 0.32, base - h * 0.62, 8 * s, 7 * s, '#C9D3DE', 1) + rect(x + w * 0.12, base - h * 0.62, 8 * s, 7 * s, '#C9D3DE', 1);
  o += rect(x - 4 * s, base - 12 * s, 8 * s, 12 * s, '#C2A48C', 1);
  return o;
}
function genFar() {
  const backY = x => 296 + wave([[22, 1, 0.9], [14, 2, 2.6], [8, 3, 0.2], [4, 7, 1.1]])(x);
  const frontY = x => 344 + wave([[14, 1, 3.9], [12, 3, 1.4], [5, 5, 0.6]])(x);
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.6, C.mist, 0.4], [1, C.mist, 0.85]])
    + `<clipPath id="fh"><path d="${bandD(frontY, 420)}"/></clipPath>`;
  let o = '';
  o += P(bandD(backY, 420), C.farBack);
  o += P(bandD(x => backY(x) + 22 + wave([[6, 4, 0.7]])(x), 420), C.farBackSh, ' opacity="0.7"');
  // windmill on the back ridge
  o += windmill(860, backY(860) + 8, 0.9, 0.38);
  o += farmhouse(1010, backY(1010) + 7, 0.95);
  // little trees along the back ridge
  [[90, 1.0], [118, 0.8], [420, 0.9], [452, 1.1], [640, 0.8], [668, 1.0], [968, 0.9], [1044, 0.8], [1150, 1.0]].forEach(([x, s]) => { o += wrap(x, 12, xx => farTree(xx, backY(xx) + 6, s)); });
  o += `<rect x="0" y="260" width="${W}" height="160" fill="url(#mist)" opacity="0.55"/>`;
  // front far hill with faint crop rows (clipped to the hill)
  o += P(bandD(frontY, 420), C.farFront);
  let rows = '';
  for (const [cx, w] of [[220, 260], [740, 300]]) for (let i = -6; i <= 6; i++) { const xx = cx + i * w / 12; rows += `M${f(xx - 30)} 420L${f(xx + 10)} ${f(frontY(xx) + 6)}`; }
  o += `<g clip-path="url(#fh)">${strokeP(rows, C.farRow, 5, ' opacity="0.7"')}${P(bandD(x => frontY(x) + 26 + wave([[5, 6, 2.2]])(x), 420), C.farFrontSh, ' opacity="0.6"')}</g>`;
  // barn + silo on the front far hill
  o += silo(372, frontY(372) + 6, 1);
  o += barn(318, frontY(318) + 8, 1);
  [[200, 1.1], [228, 0.85], [560, 1.0], [1040, 1.2], [1068, 0.9], [1196, 0.8]].forEach(([x, s]) => { o += wrap(x, 14, xx => farTree(xx, frontY(xx) + 8, s)); });
  o += `<rect x="0" y="330" width="${W}" height="90" fill="url(#mist)" opacity="0.8"/>`;
  return svg(1200, 420, o, defs);
}

// ---------------- mid.svg (0 0 1200 360) ----------------
function roundTree(x, base, h, seed) {
  const r = rng(seed); const cr = h * 0.33, cy = base - h + cr * 1.05; let o = '';
  o += ell(x + h * 0.04, base, h * 0.3, h * 0.05, C.hillFrontSh, ' opacity="0.8"');
  o += P(`M${f(x - h * 0.05)} ${f(base)}L${f(x - h * 0.035)} ${f(cy + cr * 0.4)}L${f(x + h * 0.035)} ${f(cy + cr * 0.4)}L${f(x + h * 0.05)} ${f(base)}Z`, C.trunk);
  o += P(`M${f(x + h * 0.005)} ${f(base)}L${f(x + h * 0.005)} ${f(cy + cr * 0.4)}L${f(x + h * 0.035)} ${f(cy + cr * 0.4)}L${f(x + h * 0.05)} ${f(base)}Z`, C.trunkSh);
  const puffs = [[0, 0, 1], [-0.62, 0.32, 0.66], [0.62, 0.3, 0.7], [-0.25, -0.42, 0.62], [0.32, -0.38, 0.6]].map(([u, v, k]) => [x + u * cr * (0.95 + r() * 0.1), cy + v * cr, cr * k]);
  o += puffs.map(([px, py, pr]) => circ(px, py, pr, C.tree)).join('');
  // one-step shade on the lower right
  o += `<g opacity="0.95">${puffs.map(([px, py, pr]) => circ(px + pr * 0.28, py + pr * 0.3, pr * 0.78, C.treeSh)).filter((_, i) => i === 0 || i === 2).join('')}</g>`;
  o += puffs.slice(3).map(([px, py, pr]) => circ(px, py, pr * 0.9, C.tree)).join('');
  o += ell(x - cr * 0.42, cy - cr * 0.5, cr * 0.32, cr * 0.2, C.treeHi, ` opacity="0.9" transform="rotate(-25 ${f(x - cr * 0.42)} ${f(cy - cr * 0.5)})"`);
  return o;
}
function hayBale(x, base, s) {
  // round bale lying on its side: body to the right, round face at the left with a spiral
  const r = 21 * s, L = 30 * s; let o = '';
  o += ell(x + L * 0.5, base + 1, L * 0.5 + r * 1.1, 5 * s, C.hillFrontSh, ' opacity="0.9"');
  o += rect(x, base - 2 * r, L, 2 * r, C.hay, 0);
  o += P(`M${f(x + L)} ${f(base - 2 * r)}A${f(r * 0.5)} ${f(r)} 0 0 1 ${f(x + L)} ${f(base)}Z`, C.hay);
  o += rect(x, base - 2 * r * 0.42, L, 2 * r * 0.42, C.haySh);
  o += P(`M${f(x + L)} ${f(base - 2 * r * 0.42)}A${f(r * 0.5)} ${f(r)} 0 0 1 ${f(x + L)} ${f(base)}Z`, C.haySh);
  o += strokeP(`M${f(x + 4 * s)} ${f(base - 1.3 * r)}H${f(x + L + 6 * s)}M${f(x + 4 * s)} ${f(base - 0.7 * r)}H${f(x + L + 6 * s)}`, C.hayLine, 1.4 * s, ' opacity="0.7"');
  o += circ(x, base - r, r, C.hayFace);
  const spi = []; for (let t = 0; t <= 1; t += 1 / 60) { const a = t * Math.PI * 2 * 3.2, rr = 2 + t * r * 0.78; spi.push([x + Math.cos(a) * rr, base - r + Math.sin(a) * rr]); }
  o += strokeP(line(spi), C.hayLine, 1.8 * s);
  o += ell(x - r * 0.35, base - r * 1.45, r * 0.3, r * 0.16, '#FFF4CE', ' opacity="0.8"');
  return o;
}
function genMid() {
  PREC = 1;
  const backY = x => 222 + wave([[18, 1, 0.3], [12, 2, 2.0], [6, 5, 4.1]])(x);
  const frontY = x => 266 + wave([[14, 1, 2.6], [10, 3, 0.8], [3.5, 7, 1.7]])(x);
  let o = '';
  o += P(bandD(backY, 360), C.hillBack);
  o += P(bandD(x => backY(x) + 28 + wave([[8, 3, 1.0]])(x), 360), C.hillBackSh, ' opacity="0.65"');
  o += strokeP(edgeD(x => backY(x) + 3), C.hillBackHi, 5);
  // trees on the back hill
  [[70, 82, 1], [120, 64, 2], [380, 92, 3], [612, 70, 4], [650, 88, 5], [1010, 76, 6], [1156, 90, 7]].forEach(([x, h, sd]) => { o += wrap(x, h * 0.4, xx => roundTree(xx, backY(xx) + 14, h, sd)); });
  // hay bales on the back hill (small, far)
  [[250, 0.7], [292, 0.6], [880, 0.7]].forEach(([x, s]) => { o += wrap(x, 40, xx => hayBale(xx, backY(xx) + 20, s)); });
  o += P(bandD(frontY, 360), C.hillFront);
  o += P(bandD(x => frontY(x) + 30 + wave([[6, 4, 2.0]])(x), 360), C.hillFrontSh, ' opacity="0.55"');
  o += strokeP(edgeD(x => frontY(x) + 3), C.hillFrontHi, 6);
  // bigger trees + hay bales on the front hill
  [[200, 128, 11], [258, 100, 12], [740, 140, 13], [1080, 118, 14]].forEach(([x, h, sd]) => { o += wrap(x, h * 0.42, xx => roundTree(xx, frontY(xx) + 22, h, sd)); });
  [[455, 1.45], [528, 1.2], [905, 1.35]].forEach(([x, s]) => { o += wrap(x, 80, xx => hayBale(xx, frontY(xx) + 30, s)); });
  // long wooden fence near the bottom: 2 rails + posts every 50 px (24 per tile → tiles exactly)
  const railY = x => 300 + wave([[3, 1, 0.5], [2, 2, 1.7]])(x);
  const rail = (dy, h) => between(x => railY(x) + dy, x => railY(x) + dy + h, 12);
  o += P(rail(-1, 9), C.fenceSh);
  o += P(rail(-3, 8), C.fence);
  o += P(rail(19, 9), C.fenceSh);
  o += P(rail(17, 8), C.fence);
  o += strokeP(edgeD(x => railY(x) + 6.5, 12) + edgeD(x => railY(x) + 26.5, 12), C.fenceLine, 1.4, ' opacity="0.7"');
  for (let i = 0; i < 24; i++) {
    const x = 25 + i * 50, top = railY(x) - 20, bot = 352;
    o += wrap(x, 8, xx => P(`M${f(xx - 6)} ${f(bot)}V${f(top + 5)}Q${f(xx)} ${f(top - 3)} ${f(xx + 6)} ${f(top + 5)}V${f(bot)}Z`, C.fence)
      + P(`M${f(xx + 1.5)} ${f(bot)}V${f(top + 1.5)}Q${f(xx + 4)} ${f(top + 2)} ${f(xx + 6)} ${f(top + 5)}V${f(bot)}Z`, C.fenceSh)
      + strokeP(`M${f(xx - 6)} ${f(bot)}V${f(top + 5)}Q${f(xx)} ${f(top - 3)} ${f(xx + 6)} ${f(top + 5)}V${f(bot)}`, C.fenceLine, 1.6, ' opacity="0.8"')
      + circ(xx - 1.5, top + 13, 1.2, C.fenceLine, ' opacity="0.8"') + circ(xx - 1.5, top + 33, 1.2, C.fenceLine, ' opacity="0.8"'));
  }
  PREC = 10;
  return svg(1200, 360, o);
}

// ---------------- ground.svg (0 0 1200 260) ----------------
function flower(x, y, s, petal) {
  let o = strokeP(`M${f(x)} ${f(y + 2 * s)}q${f(-1 * s)} ${f(5 * s)} ${f(0.5 * s)} ${f(9 * s)}`, C.flStem, 1.6 * s);
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; o += circ(x + Math.cos(a) * 3.4 * s, y + Math.sin(a) * 3.4 * s, 2.9 * s, petal); }
  return o + circ(x, y, 2.1 * s, C.flC);
}
function tuft(x, y, s) {
  const d = `M${f(x - 7 * s)} ${f(y)}Q${f(x - 7 * s)} ${f(y - 7 * s)} ${f(x - 10 * s)} ${f(y - 12 * s)}Q${f(x - 3 * s)} ${f(y - 8 * s)} ${f(x - 2 * s)} ${f(y - 3 * s)}Q${f(x - 1 * s)} ${f(y - 11 * s)} ${f(x + 1 * s)} ${f(y - 16 * s)}Q${f(x + 4 * s)} ${f(y - 9 * s)} ${f(x + 3 * s)} ${f(y - 3 * s)}Q${f(x + 6 * s)} ${f(y - 9 * s)} ${f(x + 11 * s)} ${f(y - 11 * s)}Q${f(x + 8 * s)} ${f(y - 5 * s)} ${f(x + 8 * s)} ${f(y)}Z`;
  return P(d, C.tuft) + strokeP(`M${f(x - 1.5 * s)} ${f(y - 4 * s)}Q${f(x - 0.5 * s)} ${f(y - 10 * s)} ${f(x + 1 * s)} ${f(y - 14 * s)}`, C.tuftHi, 1.3 * s, ' opacity="0.8"');
}
function genGround() {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.grassTop], [0.3, C.grass], [1, C.grassLow]]) + lg('pfill', 0, 0, 0, 1, [[0, C.path], [1, C.pathSh]]);
  const lip = x => 40 + wave([[3, 2, 0.7], [2, 5, 2.2], [1, 11, 0.4]])(x);
  // dirt path: a wavy band crossing the whole tile (integer periods → it tiles). Centre ≈ y 128 (visible on every device)
  const pc = x => 130 + wave([[8, 1, 0.4], [4, 2, 2.4], [2, 4, 1.1]])(x);
  const ph = x => 17 + wave([[3, 2, 1.9], [2, 5, 0.3]])(x);
  let o = '';
  o += P(bandD(lip, 260, 4), 'url(#gfill)');
  // soft darker band just under the lip (depth against the fence / hills)
  o += P(between(lip, x => lip(x) + 10 + wave([[3, 4, 1.2], [2, 9, 0.3]])(x)), C.grassLow, ' opacity="0.45"');
  o += strokeP(edgeD(x => lip(x) + 1, 6), C.rim, 3);
  o += strokeP(edgeD(x => lip(x) + 5, 6), C.lipHi, 2.5, ' opacity="0.9"');
  // path
  o += P(between(x => pc(x) - ph(x) + 3, x => pc(x) + ph(x) + 3), C.grassLow, ' opacity="0.55"');
  o += P(between(x => pc(x) - ph(x), x => pc(x) + ph(x)), C.path);
  o += P(between(x => pc(x) + ph(x) * 0.25, x => pc(x) + ph(x)), C.pathSh, ' opacity="0.7"');
  o += strokeP(edgeD(x => pc(x) - ph(x)), C.pathEdge, 2, ' opacity="0.65"');
  const r = rng(21);
  for (let i = 0; i < 30; i++) {
    const x = (i + r()) * W / 30, y = pc(x) + (r() - 0.5) * ph(x) * 1.3, s = 1.6 + r() * 1.8;
    o += wrap(x, 6, xx => ell(xx, y, s * 1.3, s, C.pebble) + ell(xx - s * 0.3, y - s * 0.35, s * 0.55, s * 0.35, C.pebbleHi, ' opacity="0.9"'));
  }
  // soft lighter grass patches (break up the flat fill on tall screens)
  for (const [x, y, rx] of [[150, 200, 120], [520, 228, 150], [860, 196, 110], [1120, 236, 130], [360, 78, 90], [980, 84, 100]]) o += wrap(x, rx, xx => ell(xx, y, rx, rx * 0.16, C.lipHi, ' opacity="0.45"'));
  // grass tufts (avoid the path)
  for (let i = 0; i < 34; i++) {
    const x = (i + 0.2 + r() * 0.6) * W / 34; let y = 62 + r() * 190; const s = 0.7 + r() * 0.6;
    if (Math.abs(y - pc(x)) < ph(x) + 12) y = pc(x) - ph(x) - 14 - r() * 20;
    o += wrap(x, 16 * s, xx => tuft(xx, y, s));
  }
  // pale flowers in small clusters (white / lilac / blush / cream — never answer colours)
  const pet = [C.fl1, C.fl2, C.fl3, C.fl4];
  for (let i = 0; i < 16; i++) {
    const cx = (i + 0.5) * W / 16 + (r() - 0.5) * 30; let cy = 66 + r() * 180; if (Math.abs(cy - pc(cx)) < ph(cx) + 14) cy = pc(cx) + ph(cx) + 24 + r() * 50;
    const n = 1 + Math.floor(r() * 3), col = pet[i % 4];
    for (let k = 0; k < n; k++) { const x = cx + (k - 1) * 12 + r() * 4, y = cy + (k % 2) * 6, s = 0.9 + r() * 0.35; o += wrap(x, 8, xx => flower(xx, y, s, col)); }
  }
  // tiny clover dots
  for (let i = 0; i < 40; i++) { const x = r() * W, y = 70 + r() * 185; if (Math.abs(y - pc(x)) < ph(x) + 4) continue; o += wrap(x, 4, xx => circ(xx, y, 1.6 + r(), C.tuftHi, ' opacity="0.7"')); }
  return svg(1200, 260, o, defs);
}

// ---------------- sun, moon, clouds ----------------
function genSun() {
  // pale buttery disc (lighter than the yellow balloon #FFD23F) + soft rounded rays, no face
  const defs = rg('glow', [[0, '#FFF7D6', 0.9], [0.45, '#FFEDB0', 0.45], [1, '#FFEDB0', 0]]) + rg('disc', [[0, '#FFF8CE'], [0.7, '#FFEA9C'], [1, '#FFE184']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 88; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFE590', 9, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F8D677') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFDF0', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genMoon() {
  const defs = rg('mglow', [[0, '#DCE6FF', 0.35], [0.5, '#B9C8FF', 0.16], [1, '#B9C8FF', 0]], ' cx="0.44" cy="0.56" r="0.5"');
  let o = circ(100, 100, 98, 'url(#mglow)');
  const cres = 'M93.6 48.4A52 52 0 1 0 149.3 116.5A44 44 0 0 1 93.6 48.4Z';
  o += P(cres, '#E8CF86', ' transform="translate(2 3)" opacity="0.5"');
  o += P(cres, '#FFF7D6');
  o += P('M81.1 51.6A52 52 0 1 0 148.4 118.9A50 50 0 1 1 81.1 51.6Z', '#F6E3A6', ' opacity="0.9"');
  o += circ(74, 112, 6, '#F4E3AE', ' opacity="0.8"') + circ(88, 136, 4, '#F4E3AE', ' opacity="0.8"') + circ(66, 88, 3.5, '#F4E3AE', ' opacity="0.7"');
  o += ell(76, 70, 9, 5, '#FFFBEA', ' opacity="0.9" transform="rotate(-40 76 70)"');
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
  out.cloud1 = mk([[70, 104, 34], [120, 80, 46], [180, 72, 52], [232, 98, 38], [150, 108, 34]], '#FFFFFF', '#E6E1F5', '#FFFFFF', 132);
  out.cloud2 = mk([[60, 110, 28], [104, 92, 38], [156, 96, 36], [204, 104, 30], [244, 114, 22]], '#FFFFFF', '#E8E4F6', '#FFFFFF', 134);
  out.cloud3 = mk([[78, 98, 40], [138, 66, 54], [196, 82, 44], [236, 108, 30], [130, 110, 36]], '#FFFFFF', '#E2DEF3', '#FFFFFF', 136);
  return out;
}

// ---------------- particles (0 0 32 32, centred) ----------------
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#FFF3D0')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#FFE9A0" stroke="#FFE9A0" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFBE6"/>`);
  // firefly: soft yellow-green glow with a bright core (no body detail — reads as a light at night)
  p.firefly = S(circ(16, 16, 16, 'url(#ff)') + circ(16, 16, 4.2, '#F4FFB8') + circ(15, 15, 2, '#FFFFF0'), rg('ff', [[0, '#EFFF9A', 0.95], [0.3, '#D8F57A', 0.55], [1, '#C8F06A', 0]]));
  // butterfly: pale lemon wings with lilac tips, wings open, seen from above (flap = scaleX by code)
  const wing = (sx) => `<g transform="translate(16 16) scale(${sx} 1)">${P('M0 -1C4 -12 14 -14 14 -6C14 -1 8 1 1 1Z', '#FFF2B8')}${P('M0 1C6 1 12 4 10 10C8 14 2 10 0 3Z', '#FFF7D4')}${P('M14 -6C14 -3 12 -1 9 0C10 -4 11 -8 13.5 -9Z', '#E3D3F4')}${circ(8, -6, 1.6, '#E3D3F4')}${strokeP('M0 -1C4 -12 14 -14 14 -6C14 -1 8 1 1 1M0 1C6 1 12 4 10 10C8 14 2 10 0 3', '#C9B48A', 1, ' opacity="0.8"')}</g>`;
  p.butterfly = S(wing(1) + wing(-1) + ell(16, 16.5, 1.5, 6.5, '#9C8466') + strokeP('M15.5 10Q13 6 11.5 5M16.5 10Q19 6 20.5 5', '#9C8466', 1));
  p.petal = S(`<g transform="rotate(-20 16 16)">${P('M16 4C23 8 24 18 16 28C8 18 9 8 16 4Z', '#FFE2EA')}${P('M16 4C23 8 24 18 16 28C19 18 19 9 16 4Z', '#F8CCDA')}${ell(13.5, 11, 2, 4, '#FFF2F6', ' opacity="0.9"')}</g>`);
  p.leaf = S(`<g transform="rotate(-30 16 16)">${P('M16 3C24 8 25 20 16 29C7 20 8 8 16 3Z', '#A6D28F')}${P('M16 3C24 8 25 20 16 29C19 20 20 10 16 3Z', '#90C27B')}${strokeP('M16 6L16 27M16 13l4 -3M16 19l-4 -3M16 22l4 -3', '#77AC64', 1.3)}</g>`);
  // puff: warm dust cloud (path / landing dust)
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFBF2', 0.95], [0.7, '#F1E6D2', 0.8], [1, '#E4D6BC', 0]]));
  // confetti: white/neutral shapes so code can tint them with the balloon colour (multiply / source-atop)
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  // seed: dandelion fluff (pappus) — thin stalk, little seed, a fan of fine filaments with dot tips
  let fil = '', tips = '';
  for (let i = 0; i < 11; i++) { const a = -Math.PI / 2 + (i - 5) * 0.27, x = 16 + Math.cos(a) * 11, y = 13 + Math.sin(a) * 9; fil += `M16 13L${f(x)} ${f(y)}`; tips += circ(x, y, 1.1, '#FFFFFF'); }
  p.seed = S(strokeP(fil, '#FFFFFF', 1, ' opacity="0.95"') + strokeP(fil, '#D8D2C4', 0.5, ' opacity="0.5"') + tips + strokeP('M16 13L16 25', '#D8CDB5', 1.1) + ell(16, 26.5, 1.4, 2.6, '#BCA98A'));
  return p;
}

// ---------------- write ----------------
const env = path.join(A, 'env'), par = path.join(A, 'particles');
fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
const files = { far: genFar(), mid: genMid(), ground: genGround(), sun: genSun(), moon: genMoon(), ...genClouds() };
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
const parts = genParticles();
for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
for (const [k, v] of [...Object.entries(files).map(([k, v]) => ['env/' + k, v]), ...Object.entries(parts).map(([k, v]) => ['particles/' + k, v])]) {
  const kb = Buffer.byteLength(v) / 1024;
  const blur = (v.match(/feGaussianBlur/g) || []).length;
  const m = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
  const okBox = m && m[1] === m[3] && m[2] === m[4];
  console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 60 ? '  TOO BIG' : ''}${/<text|<script|href=|@import|font|NaN/.test(v) || blur > 1 ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
}
