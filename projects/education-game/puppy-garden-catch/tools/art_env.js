// Puppy Garden Catch: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Theme: a calm (often rainy) backyard garden. Writes game/assets/default/env/*.svg and particles/*.svg.
// Preview / QA renders live in tools/env_scenes.js (run it after this script).
// Usage: node tools/art_env.js
// Seamless tiling: every ridge is a sum of sines with whole-number periods over W, regular rows (fence pickets,
// hedge bumps) use a spacing that divides W, and every object near an edge is drawn again at x±W.
// Palette rule (DESIGN §3): the garden stays soft sage/olive and pastel so the saturated answer colours
// (#E84A4A #3C8DE8 #4CC26B #FFD23F #FF9A2E #9B6BE0) and caramel Pip pop out. No <text>, no filters.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
let PREC = 10; // 0.1 px
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wave = terms => x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn at x and its wrapped copies so objects crossing an edge tile seamlessly
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); return line(pts); }
const lg = (id, x1, y1, x2, y2, stops, units = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
// a rounded "blob" made of circles: shadow copy offset down-right, then the body, then a highlight
function blob(cs, x, y, s, body, shadow, hi, sh = 4) {
  let o = cs.map(([dx, dy, r]) => circ(x + dx * s + sh * 0.6, y + dy * s + sh, r * s, shadow)).join('');
  o += cs.map(([dx, dy, r]) => circ(x + dx * s, y + dy * s, r * s, body)).join('');
  if (hi) { const [dx, dy, r] = cs.reduce((a, b) => (b[1] - b[2] < a[1] - a[2] ? b : a)); o += ell(x + (dx - r * 0.3) * s, y + (dy - r * 0.45) * s, r * 0.42 * s, r * 0.24 * s, hi, ' opacity="0.85"'); }
  return o;
}

// ---------------- palette (calm, yellow-leaning sage; pastel accents only in small areas) ----------------
const C = {
  // far: misty blue-green
  farBack: '#D3E6DC', farBackHi: '#E2EFE8', farMid: '#C3DCCD', farFront: '#B3D3BC', farFrontSh: '#A6C9AF',
  farTree: '#A4C8AE', farTreeSh: '#94BCA0', farTreeHi: '#BCD9C3', farTrunk: '#B3A893', mist: '#EEF6F1',
  shedWall: '#E9DFCF', shedWallSh: '#D6CAB6', shedRoof: '#C9A9A1', shedRoofSh: '#B69690', shedDoor: '#B7A48A', glass: '#E3F1EE', glassLine: '#C3D8D3',
  // mid
  lawnBack: '#C4DB98', lawnBackHi: '#D2E5AA',
  hedge: '#9CC27A', hedgeSh: '#88B068', hedgeHi: '#B4D492', hedgeDeep: '#7FA562',
  tree: '#A9CB82', treeSh: '#93B970', treeHi: '#C2DD9E', trunk: '#BFA27E', trunkSh: '#A3875F',
  fence: '#EFE2C8', fenceSh: '#D9C6A3', fenceLine: '#BCA37C', rail: '#E3D2B2',
  stem: '#8DB566', leaf: '#99C06E', leafSh: '#83AA5A',
  sunPetal: '#F6E39E', sunPetalSh: '#ECD382', sunCore: '#B98F60', sunCoreSh: '#9C7550',
  holly: [['#F6CBD5', '#E9B3C0'], ['#DCD0F0', '#C9BAE6'], ['#F8DCC0', '#EDC6A3']],
  bush: '#A3C67C', bushSh: '#8DB26A', bushHi: '#BCD99A',
  bird: '#E6CBA0', birdSh: '#D1B184', birdRoof: '#C89A86', birdRoofSh: '#B38572', birdHole: '#7D6148', post: '#C9AE88', postSh: '#AE9268',
  // ground
  grassTop: '#CBE3A0', grass: '#BAD789', grassLow: '#B0D07D', grassBot: '#B5CF78', blade: '#A3C670', bladeHi: '#D6EAB1', clover: '#A9CB78',
  stone: '#DAD5C8', stoneSh: '#BEB6A5', stoneHi: '#ECE9E0',
  puddle: '#C9DADF', puddleRim: '#B1C5CA', puddleHi: '#EAF3F4', puddleDeep: '#BCD0D6',
  mushCap: ['#EBB3A6', '#E7CDA9'], mushCapSh: ['#D69A8C', '#D3B48D'], mushDot: '#FFF6EA', mushStem: '#F5EAD6', mushStemSh: '#DFD0B6',
  flowers: [['#FFFFFF', '#F3D77E'], ['#FADCE4', '#F2CD7A'], ['#E6DEF7', '#F3D77E'], ['#FFF0C4', '#E9C27A']],
};

// ---------------- far.svg (0 0 1200 420) ----------------
function roundTreeFar(x, y, s) { // lollipop tree; (x,y) = trunk base
  let o = rect(x - 3 * s, y - 26 * s, 6 * s, 26 * s, C.farTrunk, ` rx="${f(2 * s)}"`);
  o += blob([[0, -48, 24], [-14, -38, 16], [14, -36, 17]], x, y, s, C.farTree, C.farTreeSh, C.farTreeHi, 3 * s);
  return o;
}
function shed(x, y) { // tiny garden shed, (x,y) = bottom centre
  const w = 46, h = 30;
  let o = rect(x - w / 2, y - h, w, h, C.shedWall) + rect(x + 4, y - h, w / 2 - 4, h, C.shedWallSh);
  o += P(`M${x - w / 2 - 6} ${y - h + 2}L${x} ${y - h - 22}L${x + w / 2 + 6} ${y - h + 2}Z`, C.shedRoof);
  o += P(`M${x} ${y - h - 22}L${x + w / 2 + 6} ${y - h + 2}L${x + 4} ${y - h + 2}Z`, C.shedRoofSh);
  o += rect(x - 9, y - 20, 13, 20, C.shedDoor, ' rx="2"') + rect(x + 10, y - 22, 9, 8, C.glass, ' rx="1.5"');
  return o;
}
function greenhouse(x, y) { // little glass arch house
  const w = 54, h = 26;
  let o = P(`M${x - w / 2} ${y}L${x - w / 2} ${y - h * 0.4}Q${x - w / 2} ${y - h} ${x} ${y - h}Q${x + w / 2} ${y - h} ${x + w / 2} ${y - h * 0.4}L${x + w / 2} ${y}Z`, C.glass);
  o += strokeP(`M${x - w / 2} ${y - h * 0.4}Q${x - w / 2} ${y - h} ${x} ${y - h}Q${x + w / 2} ${y - h} ${x + w / 2} ${y - h * 0.4}M${x - 13} ${y}L${x - 13} ${y - h + 3}M${x} ${y}L${x} ${y - h}M${x + 13} ${y}L${x + 13} ${y - h + 3}M${x - w / 2} ${y - 9}L${x + w / 2} ${y - 9}`, C.glassLine, 2.2);
  o += ell(x - 14, y - h + 8, 7, 3, '#FFFFFF', ' opacity="0.8"');
  return o;
}
function genFar() {
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.5, C.mist, 0.4], [1, C.mist, 0.85]]);
  const backY = x => 238 + wave([[26, 1, 0.9], [16, 2, 2.4], [7, 5, 0.3]])(x);
  const midY = x => 292 + wave([[18, 1, 3.6], [11, 3, 1.1], [5, 7, 2.2]])(x);
  const frontY = x => 340 + wave([[14, 2, 0.5], [8, 4, 2.9], [4, 9, 1.6]])(x);
  // a soft distant tree line: runs of overlapping domes drawn BEFORE the back hill, centred below the ridge,
  // so only their caps show and they sit on the ridge (round floating discs would read as bubbles)
  let o = '';
  const r = rng(5);
  [[90, 7], [470, 9], [610, 5], [880, 8], [1110, 6]].forEach(([cx, n]) => {
    const rs = []; for (let j = 0; j < n; j++) rs.push(8 + 5 * Math.sin(Math.PI * (j + 0.5) / n) + r() * 3); // taller in the middle
    o += wrap(cx, n * 7 + 16, xx => { let run = ''; for (let j = 0; j < n; j++) { const x = xx + (j - (n - 1) / 2) * 12; run += circ(x, backY(x) + rs[j] * 0.35 + 2, rs[j], C.farMid); } return run; });
  });
  o += P(bandD(backY, 420), C.farBack);
  o += strokeP(edgeD(x => backY(x) + 4), C.farBackHi, 6, ' opacity="0.9"');
  // shed + greenhouse on the back ridge (left part), round trees around them
  const sx = 300; o += shed(sx, backY(sx) + 10); o += greenhouse(sx + 64, backY(sx + 64) + 10);
  [[sx - 52, 0.95], [sx + 116, 0.8], [sx + 140, 0.65]].forEach(([x, s]) => { o += roundTreeFar(x, backY(x) + 12, s); });
  o += P(bandD(midY, 420), C.farMid);
  [[640, 1.05], [676, 0.8], [960, 0.95], [1180, 1.1], [80, 0.75]].forEach(([x, s]) => { o += wrap(x, 30 * s, xx => roundTreeFar(xx, midY(xx) + 10, s)); });
  o += `<rect x="0" y="250" width="${W}" height="170" fill="url(#mist)" opacity="0.6"/>`;
  o += P(bandD(frontY, 420), C.farFront);
  [[470, 0.9], [520, 0.7], [820, 0.85], [1090, 0.7]].forEach(([x, s]) => { o += wrap(x, 30 * s, xx => roundTreeFar(xx, frontY(xx) + 10, s)); });
  o += P(bandD(x => frontY(x) + 26 + wave([[4, 3, 1]])(x), 420), C.farFrontSh, ' opacity="0.6"');
  o += `<rect x="0" y="330" width="${W}" height="90" fill="url(#mist)" opacity="0.8"/>`;
  return svg(1200, 420, o, defs);
}

// ---------------- mid.svg (0 0 1200 360) ----------------
// Layout (mid y): lawn band top ≤ 250 (hides the far layer's bottom), hedge top ≈ 175–215, fence pickets 258–345,
// rails at 282 / 322, posts every 150, sunflowers to ≈ 140, bird house roof ≈ 112. Bottom 20 px are under the ground lip.
const FENCE_TOP = 258, FENCE_BASE = 352, PICKET = 30;
function hedge() {
  const top = x => 200 + wave([[10, 2, 0.4], [6, 5, 2.1], [3, 11, 0.9]])(x);
  let o = P(bandD(x => top(x) + 14, 360), C.hedgeSh);
  // bumpy top: circles every 24 px (divides 1200)
  let bumpsSh = '', bumps = '', his = '';
  for (let i = 0; i < 50; i++) {
    const x = i * 24 + 12, rr = 17 + 5 * Math.sin(i * 2.3) * Math.sin(i * 0.7);
    bumpsSh += wrap(x, rr + 2, xx => circ(xx + 2, top(xx) + 16, rr, C.hedgeSh));
    bumps += wrap(x, rr + 2, xx => circ(xx, top(xx) + 12, rr, C.hedge));
    if (i % 3 === 0) his += wrap(x, rr, xx => ell(xx - 5, top(xx) + 2, 7, 3.5, C.hedgeHi, ' opacity="0.9"'));
  }
  o += bumpsSh + P(bandD(x => top(x) + 14, 360), C.hedge) + bumps + his;
  // a darker band low down for depth
  o += P(bandD(x => 300 + wave([[4, 3, 0.2]])(x), 360), C.hedgeDeep, ' opacity="0.55"');
  // tiny leaf texture dashes
  const r = rng(21); let tex = '';
  for (let i = 0; i < 70; i++) { const x = r() * W, y = top(x) + 34 + r() * 50; tex += wrap(x, 6, xx => `M${f(xx - 3)} ${f(y)}q3 -4 6 0`); }
  o += strokeP(tex, C.hedgeSh, 2, ' opacity="0.8"');
  return o;
}
function midTree(x, y, s) { // round garden tree poking above the hedge
  let o = P(`M${f(x - 7 * s)} ${f(y)}L${f(x - 5 * s)} ${f(y - 70 * s)}L${f(x + 5 * s)} ${f(y - 70 * s)}L${f(x + 7 * s)} ${f(y)}Z`, C.trunk) + rect(x + 1 * s, y - 70 * s, 5 * s, 70 * s, C.trunkSh, ' opacity="0.7"');
  o += blob([[0, -112, 40], [-34, -90, 28], [32, -88, 30], [-12, -80, 26], [14, -138, 26]], x, y, s, C.tree, C.treeSh, C.treeHi, 6 * s);
  return o;
}
function fence() {
  let o = '';
  // rails (behind pickets, in front of hedge)
  o += rect(0, 282, W, 9, C.fenceSh) + rect(0, 280, W, 7, C.rail) + rect(0, 322, W, 9, C.fenceSh) + rect(0, 320, W, 7, C.rail);
  // pickets every 30 px (40 over the tile → tiles by construction)
  let body = '', sh = '', ol = '';
  for (let i = 0; i < W / PICKET; i++) {
    const x = i * PICKET + 15, hw = 9, t = FENCE_TOP + ((i % 5 === 0) ? -8 : 0); // every 5th is a post (taller)
    const d = `M${x - hw} ${FENCE_BASE}L${x - hw} ${t + 10}Q${x - hw} ${t + 3} ${x} ${t - 3}Q${x + hw} ${t + 3} ${x + hw} ${t + 10}L${x + hw} ${FENCE_BASE}Z`;
    ol += P(d, C.fenceLine, ` transform="translate(1.5 1.5)"`);
    body += `M${x - hw} ${FENCE_BASE}L${x - hw} ${t + 10}Q${x - hw} ${t + 3} ${x} ${t - 3}Q${x + hw} ${t + 3} ${x + hw} ${t + 10}L${x + hw} ${FENCE_BASE}Z`;
    sh += `M${x + 2} ${FENCE_BASE}L${x + 2} ${t + 3}Q${x + hw} ${t + 5} ${x + hw} ${t + 10}L${x + hw} ${FENCE_BASE}Z`;
  }
  o += ol + P(body, C.fence) + P(sh, C.fenceSh, ' opacity="0.75"');
  // soft wood grain on a few pickets
  let g = ''; for (let i = 1; i < 40; i += 3) { const x = i * PICKET + 12; g += `M${x - 3} 300l0 14M${x - 4} 334l0 8`; }
  o += strokeP(g, C.fenceSh, 1.4, ' opacity="0.7"');
  return o;
}
function leafPair(x, y, s, flip) {
  const d = flip ? -1 : 1;
  return P(`M${f(x)} ${f(y)}Q${f(x + d * 14 * s)} ${f(y - 14 * s)} ${f(x + d * 26 * s)} ${f(y - 6 * s)}Q${f(x + d * 14 * s)} ${f(y + 4 * s)} ${f(x)} ${f(y)}Z`, C.leaf) +
    P(`M${f(x)} ${f(y)}Q${f(x + d * 14 * s)} ${f(y + 4 * s)} ${f(x + d * 26 * s)} ${f(y - 6 * s)}Q${f(x + d * 13 * s)} ${f(y - 2 * s)} ${f(x)} ${f(y)}Z`, C.leafSh);
}
function sunflower(x, top, s) { // stem from FENCE_BASE to head centre (x, top)
  let o = strokeP(`M${f(x)} ${FENCE_BASE}Q${f(x - 6 * s)} ${f((FENCE_BASE + top) / 2)} ${f(x)} ${f(top)}`, C.stem, 5 * s);
  o += leafPair(x - 2, top + 70 * s, s, false) + leafPair(x - 3, top + 110 * s, s, true);
  let pet = '', petS = '';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, cx = x + Math.cos(a) * 15 * s, cy = top + Math.sin(a) * 15 * s;
    const e = `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(9 * s)}" ry="${f(5 * s)}" transform="rotate(${f(a * 180 / Math.PI)} ${f(cx)} ${f(cy)})"/>`;
    if (i % 2) petS += e; else pet += e;
  }
  o += `<g fill="${C.sunPetalSh}">${petS}</g><g fill="${C.sunPetal}">${pet}</g>`;
  o += circ(x + 1, top + 1.5, 10.5 * s, C.sunCoreSh) + circ(x, top, 10 * s, C.sunCore) + circ(x - 3 * s, top - 3 * s, 3 * s, '#CFAA7C', ' opacity="0.8"');
  return o;
}
function hollyhock(x, top, s, cols) { // tall spike of small pastel blossoms
  let o = strokeP(`M${f(x)} ${FENCE_BASE}L${f(x)} ${f(top)}`, C.stem, 4 * s);
  o += leafPair(x, FENCE_BASE - 30, s * 0.9, false) + leafPair(x, FENCE_BASE - 46, s * 0.8, true);
  const n = 9; // buds at the tip, open blossoms lower down, alternating sides, overlapping
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = top + t * (FENCE_BASE - 70 - top) * 0.85, rr = (3.5 + 6 * Math.min(1, t * 1.6)) * s, dx = (i % 2 ? 1 : -1) * (2 + 5 * t) * s;
    o += circ(x + dx + 1.2, y + 1.8, rr, cols[1]) + circ(x + dx, y, rr, cols[0]);
    if (t > 0.25) o += circ(x + dx, y, rr * 0.32, '#FFF3C8') + ell(x + dx - rr * 0.4, y - rr * 0.45, rr * 0.3, rr * 0.16, '#FFFFFF', ' opacity="0.6"');
  }
  return o;
}
function birdHouse(x) { // on a post; house roof apex ≈ 112
  const by = 150; let o = '';
  o += rect(x - 5, by, 10, FENCE_BASE - by, C.post) + rect(x + 1, by, 4, FENCE_BASE - by, C.postSh);
  o += rect(x - 20, by - 36, 40, 40, C.birdSh, ' rx="4"') + rect(x - 20, by - 38, 37, 40, C.bird, ' rx="4"');
  o += P(`M${x - 28} ${by - 32}L${x} ${by - 58}L${x + 28} ${by - 32}L${x + 24} ${by - 28}L${x} ${by - 50}L${x - 24} ${by - 28}Z`, C.birdRoof);
  o += P(`M${x} ${by - 58}L${x + 28} ${by - 32}L${x + 24} ${by - 28}L${x} ${by - 50}Z`, C.birdRoofSh);
  o += circ(x, by - 18, 7, C.birdHole) + rect(x - 1.5, by - 6, 3, 2, C.birdHole) + strokeP(`M${x} ${by - 6}l0 6`, C.birdRoofSh, 3);
  o += ell(x - 11, by - 28, 4, 2.2, '#F4E3C4', ' opacity="0.9"');
  return o;
}
function bushMid(x, s, seed) {
  const r = rng(seed); const cs = [[-36, -16, 22], [-14, -30, 26], [12, -32, 24], [34, -16, 21], [0, -12, 24]];
  let o = blob(cs, x, FENCE_BASE - 4, s, C.bush, C.bushSh, C.bushHi, 4);
  for (let i = 0; i < 4; i++) o += circ(x + (r() - 0.5) * 60 * s, FENCE_BASE - 14 - r() * 30 * s, 3, C.holly[i % 3][0]);
  return o;
}
function genMid() {
  const lawnY = x => 240 + wave([[6, 1, 1.3], [3, 4, 0.2]])(x); // ≤ 249 everywhere
  let o = P(bandD(lawnY, 360), C.lawnBack) + strokeP(edgeD(x => lawnY(x) + 3), C.lawnBackHi, 5);
  // trees behind the hedge
  [[160, 0.95], [700, 1.1], [1010, 0.85]].forEach(([x, s]) => { o += wrap(x, 75 * s, xx => midTree(xx, 260, s)); });
  o += hedge();
  // things behind the fence (stems pass behind the rails/pickets)
  o += wrap(560, 40, xx => birdHouse(xx));
  [[90, 150, 1.0], [128, 172, 0.85], [835, 142, 1.05], [872, 166, 0.85], [1140, 160, 0.9]].forEach(([x, t, s]) => { o += wrap(x, 30, xx => sunflower(xx, t, s)); });
  [[330, 196, 1, 0], [352, 214, 0.9, 1], [640, 206, 1, 2], [970, 200, 1, 1], [992, 218, 0.85, 0]].forEach(([x, t, s, c]) => { o += wrap(x, 14, xx => hollyhock(xx, t, s, C.holly[c])); });
  o += fence();
  // bushes in front of the fence base
  [[250, 1.0, 3], [470, 0.85, 4], [760, 1.1, 5], [1060, 0.9, 6], [10, 0.8, 7]].forEach(([x, s, sd]) => { o += wrap(x, 64 * s, xx => bushMid(xx, s, sd)); });
  return svg(1200, 360, o);
}

// ---------------- ground.svg (0 0 1200 260) ----------------
// Pip's feet land at ground y ≈ 76 (groundY + 6). Visible strip is y 35..~145 (+ safe-area inset);
// details stay small and low-contrast so the play area reads clean.
function flower(x, y, s, cols) {
  let o = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; o += circ(x + Math.cos(a) * 4.2 * s, y + Math.sin(a) * 4.2 * s, 3.4 * s, cols[0]); }
  return strokeP(`M${f(x)} ${f(y + 4 * s)}l0 ${f(7 * s)}`, C.blade, 1.8 * s) + o + circ(x, y, 2.4 * s, cols[1]);
}
function stone(x, y, rx, ry, rot) {
  const t = ` transform="rotate(${rot} ${f(x)} ${f(y)})"`;
  return ell(x + 1.5, y + 3, rx, ry, C.stoneSh, t) + ell(x, y, rx, ry, C.stone, t) + ell(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25, C.stoneHi, t + ' opacity="0.9"');
}
function puddle(x, y, rx, ry) {
  const d = (k, dy = 0) => `M${f(x - rx * k)} ${f(y + dy)}C${f(x - rx * k)} ${f(y - ry * k + dy)} ${f(x - rx * 0.4 * k)} ${f(y - ry * 1.1 * k + dy)} ${f(x + rx * 0.1)} ${f(y - ry * k + dy)}C${f(x + rx * 0.7 * k)} ${f(y - ry * 0.95 * k + dy)} ${f(x + rx * k)} ${f(y - ry * 0.4 * k + dy)} ${f(x + rx * k)} ${f(y + dy)}C${f(x + rx * k)} ${f(y + ry * 0.8 * k + dy)} ${f(x + rx * 0.2 * k)} ${f(y + ry * k + dy)} ${f(x - rx * 0.3 * k)} ${f(y + ry * 0.9 * k + dy)}C${f(x - rx * 0.8 * k)} ${f(y + ry * 0.85 * k + dy)} ${f(x - rx * k)} ${f(y + ry * 0.5 * k + dy)} ${f(x - rx * k)} ${f(y + dy)}Z`;
  let o = P(d(1.08, 1.5), C.puddleRim) + P(d(1), C.puddle) + P(d(0.62, ry * 0.25), C.puddleDeep, ' opacity="0.6"');
  o += strokeP(`M${f(x - rx * 0.55)} ${f(y - ry * 0.35)}q${f(rx * 0.25)} ${f(-ry * 0.25)} ${f(rx * 0.5)} ${f(-ry * 0.2)}`, C.puddleHi, 3);
  o += strokeP(`M${f(x + rx * 0.25)} ${f(y + ry * 0.3)}l${f(rx * 0.2)} 0`, C.puddleHi, 2.4, ' opacity="0.8"');
  return o;
}
function mushroom(x, y, s, k) {
  let o = ell(x + 1, y + 1, 7 * s, 2.5 * s, C.grassLow);
  o += P(`M${f(x - 4 * s)} ${f(y)}L${f(x - 3.4 * s)} ${f(y - 11 * s)}L${f(x + 3.4 * s)} ${f(y - 11 * s)}L${f(x + 4 * s)} ${f(y)}Z`, C.mushStem) + rect(x + 0.5 * s, y - 11 * s, 3 * s, 11 * s, C.mushStemSh, ' opacity="0.7"');
  const cap = `M${f(x - 12 * s)} ${f(y - 10 * s)}Q${f(x - 11 * s)} ${f(y - 24 * s)} ${f(x)} ${f(y - 24 * s)}Q${f(x + 11 * s)} ${f(y - 24 * s)} ${f(x + 12 * s)} ${f(y - 10 * s)}Q${f(x)} ${f(y - 7 * s)} ${f(x - 12 * s)} ${f(y - 10 * s)}Z`;
  o += P(cap, C.mushCapSh[k], ` transform="translate(${f(1.2 * s)} ${f(1.2 * s)})"`) + P(cap, C.mushCap[k]);
  o += circ(x - 5 * s, y - 17 * s, 2.2 * s, C.mushDot) + circ(x + 4 * s, y - 19 * s, 1.8 * s, C.mushDot) + circ(x + 7 * s, y - 13 * s, 1.5 * s, C.mushDot);
  return o;
}
function tuft(x, y, s) { return `M${f(x - 6 * s)} ${f(y - 9 * s)}Q${f(x - 3 * s)} ${f(y - 2 * s)} ${f(x - 1 * s)} ${f(y)}M${f(x)} ${f(y - 12 * s)}L${f(x)} ${f(y)}M${f(x + 6 * s)} ${f(y - 8 * s)}Q${f(x + 3 * s)} ${f(y - 2 * s)} ${f(x + 1 * s)} ${f(y)}`; }
function clover(x, y, s) { return [0, 2.1, 4.2].map(a => circ(x + Math.cos(a - 1.57) * 3 * s, y + Math.sin(a - 1.57) * 3 * s, 3 * s, C.clover)).join(''); }
function genGround() {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.grass], [0.35, C.grassLow], [1, C.grassBot]]);
  // scalloped grass lip (40 scallops over W), top edge ≈ y 40
  const lip = x => 40 + wave([[2.5, 2, 0.7], [1.5, 5, 2.2]])(x) - 5 * Math.abs(Math.cos(Math.PI * 40 * x / W)) + 2.5;
  let o = P(bandD(lip, 260, 2), 'url(#gfill)');
  const rimBottom = x => 56 + wave([[3, 3, 1.1], [2, 7, 0.2]])(x);
  const rim = [[0, lip(0)]]; for (let x = 0; x <= W; x += 2) rim.push([x, lip(x)]); for (let x = W; x >= 0; x -= 6) rim.push([x, rimBottom(x)]);
  o += P(poly(rim), C.grassTop);
  const r = rng(7);
  // lighter mown stripes (very subtle)
  o += P(bandD(x => 98 + wave([[3, 2, 0.4]])(x), 112), C.grassTop, ' opacity="0.35"');
  // puddles (pale blue-grey, shallow)
  [[420, 104, 66, 11], [1010, 126, 50, 9]].forEach(([x, y, rx, ry]) => { o += wrap(x, rx * 1.1, xx => puddle(xx, y, rx, ry)); });
  // stepping stone path wandering across
  [[150, 92, 26, 9, -6], [205, 106, 22, 8, 8], [262, 118, 27, 9, -4], [640, 96, 24, 8, 5], [700, 110, 28, 9, -7], [760, 124, 23, 8, 4], [1160, 100, 24, 8, -5]].forEach(([x, y, rx, ry, rot]) => { o += wrap(x, rx + 4, xx => stone(xx, y, rx, ry, rot)); });
  // clover patches + grass tufts
  for (let i = 0; i < 26; i++) { const x = (i + 0.5) * W / 26 + (r() - 0.5) * 20, y = 70 + r() * 160; o += wrap(x, 8, xx => clover(xx, y, 0.9 + r() * 0.3)); }
  let tufts = ''; for (let i = 0; i < 48; i++) { const x = (i + 0.5) * W / 48 + (r() - 0.5) * 16, y = 78 + r() * 170, s = 0.8 + r() * 0.6; tufts += wrap(x, 10, xx => tuft(xx, y, s)); }
  o += strokeP(tufts, C.blade, 2.4);
  let up = ''; for (let i = 0; i < 40; i++) { const x = (i + 0.3) * W / 40 + (r() - 0.5) * 10; up += wrap(x, 8, xx => `M${f(xx - 3)} ${f(lip(xx) + 4)}L${f(xx - 5)} ${f(lip(xx) - 6)}M${f(xx + 2)} ${f(lip(xx) + 4)}L${f(xx + 4)} ${f(lip(xx) - 4)}`); }
  o += strokeP(up, C.grass, 2.6);
  // mushrooms (two small groups)
  o += wrap(560, 20, xx => mushroom(xx, 70, 1, 0) + mushroom(xx + 16, 74, 0.7, 0));
  o += wrap(1095, 20, xx => mushroom(xx, 80, 0.9, 1));
  // small pastel flowers
  const fl = [[70, 96], [320, 82], [355, 132], [520, 120], [880, 100], [905, 140], [1120, 76], [240, 150], [590, 132], [1080, 150], [820, 82], [20, 140], [470, 160], [960, 180], [700, 190], [130, 200]];
  fl.forEach(([x, y], i) => { o += wrap(x, 10, xx => flower(xx, y, 0.9 + (i % 3) * 0.15, C.flowers[i % 4])); });
  return svg(1200, 260, o, defs);
}

// ---------------- sun, clouds, rainbow ----------------
function genSun() {
  const defs = rg('glow', [[0, '#FFF6C2', 0.9], [0.45, '#FFEFA6', 0.45], [1, '#FFEFA6', 0]]) + rg('disc', [[0, '#FFF6B8'], [0.7, '#FFE57A'], [1, '#FCD664']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, a1 = a - 0.13, a2 = a + 0.13, r0 = 58, r1 = i % 2 ? 84 : 94; rays += `M${f(100 + Math.cos(a1) * r0)} ${f(100 + Math.sin(a1) * r0)}Q${f(100 + Math.cos(a) * (r1 + 8))} ${f(100 + Math.sin(a) * (r1 + 8))} ${f(100 + Math.cos(a2) * r0)} ${f(100 + Math.sin(a2) * r0)}Z`; }
  o += P(rays, '#FFE88E', ' opacity="0.8"');
  o += circ(100, 100, 54, '#F5CE5A') + circ(100, 100, 50, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFCE6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genClouds() {
  // 300×160, flat-ish bottom at `bottom`; big fluffy puffs (bubbles float out of these)
  const mk = (puffs, base, sh, hi, bottom, belly) => {
    const x0 = Math.min(...puffs.map(p => p[0] - p[2] * 0.6)), x1 = Math.max(...puffs.map(p => p[0] + p[2] * 0.6)), hb = 34;
    let o = rect(x0, bottom - hb + 6, x1 - x0, hb, sh, ` rx="${hb / 2}"`);
    o += puffs.map(([x, y, r]) => circ(x + 2, y + 7, r, sh)).join('');
    // scalloped underside: small bumps along the bottom (shadow copy first) so the base is fluffy, not a shelf
    const nb = Math.max(4, Math.round((x1 - x0) / 30)), bumps = []; for (let i = 0; i < nb; i++) bumps.push([x0 + 14 + i * (x1 - x0 - 28) / (nb - 1), bottom - 12, 15 + (i % 2) * 3]);
    o += bumps.map(([x, y, r]) => circ(x + 1, y + 6, r, sh)).join('');
    o += rect(x0, bottom - hb, x1 - x0, hb - 8, base, ` rx="${hb / 2}"`);
    o += bumps.map(([x, y, r]) => circ(x, y, r, base)).join('');
    o += puffs.map(([x, y, r]) => circ(x, y, r, base)).join('');
    o += puffs.filter(p => p[1] - p[2] < bottom - 70).slice(0, 3).map(([x, y, r]) => ell(x - r * 0.28, y - r * 0.45, r * 0.4, r * 0.2, hi, ' opacity="0.95"')).join('');
    return svg(300, 160, o);
  };
  return {
    cloud1: mk([[62, 108, 32], [104, 82, 42], [158, 64, 54], [212, 84, 42], [250, 108, 30], [140, 108, 36]], '#FFFFFF', '#DCE8F2', '#FFFFFF', 136, '#EEF4F9'),
    cloud2: mk([[56, 112, 28], [96, 92, 38], [146, 84, 44], [196, 96, 36], [240, 112, 26]], '#FFFFFF', '#DFEAF3', '#FFFFFF', 136, '#EFF5FA'),
    cloud3: mk([[70, 104, 36], [124, 70, 52], [182, 62, 48], [228, 92, 36], [150, 104, 40], [256, 116, 22]], '#FFFFFF', '#D9E5F0', '#FFFFFF', 138, '#EDF3F8'),
    cloud_rain: mk([[60, 104, 34], [108, 78, 46], [166, 66, 52], [222, 88, 42], [256, 112, 24], [146, 106, 38]], '#B4C0CF', '#97A5B8', '#CCD5E0', 136, '#A6B3C4'),
  };
}
function genRainbow() {
  const cols = ['#FFAFAF', '#FFCB98', '#FFE89E', '#B5E3A3', '#A8D3F4', '#C9B6EE'];
  const cx = 400, cy = 420, bw = 26, r0 = 378;
  let defs = lg('rbfade', 0, 0, 0, 420, [[0, '#FFFFFF', 1], [0.55, '#FFFFFF', 0.95], [1, '#FFFFFF', 0]], ' gradientUnits="userSpaceOnUse"');
  defs += `<mask id="rbm" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="420"><rect width="800" height="420" fill="url(#rbfade)"/></mask>`;
  const arc = (r, col, w, extra = '') => `<path d="M${f(cx - r)} ${cy}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${cy}" fill="none" stroke="${col}" stroke-width="${w}"${extra}/>`;
  let arcs = cols.map((c, i) => arc(r0 - bw / 2 - i * bw, c, bw + 1)).join('');
  arcs += arc(r0 - 3, '#FFFFFF', 4, ' opacity="0.5"');
  return svg(800, 420, `<g mask="url(#rbm)" opacity="0.85">${arcs}</g>`, defs);
}

// ---------------- particles (0 0 32 32, centred) ----------------
function genParticles() {
  const p = {};
  const S = body => svg(32, 32, body);
  p.leaf1 = S(`<g transform="rotate(-30 16 16)">${P('M16 3C24 8 25 20 16 29C7 20 8 8 16 3Z', '#9CCB62')}${P('M16 3C24 8 25 20 16 29C19 20 20 10 16 3Z', '#86B552')}${strokeP('M16 6L16 27M16 13l4 -3M16 19l-4 -3M16 22l4 -3', '#6E9A40', 1.3)}</g>`);
  p.leaf2 = S(`<g transform="rotate(25 16 16)">${P('M6 22C6 10 16 4 27 5C27 16 20 25 6 22Z', '#C9D86A')}${P('M6 22C15 22 23 16 27 5C27 16 20 25 6 22Z', '#AFC055')}${strokeP('M7 21Q16 15 25 7M13 17l0 -5M18 13l1 4', '#8C9C3E', 1.3)}</g>`);
  p.petal = S(`<g transform="rotate(-20 16 16)">${P('M16 4C23 8 24 18 16 28C8 18 9 8 16 4Z', '#FFC6D8')}${P('M16 4C23 8 24 18 16 28C19 18 19 9 16 4Z', '#F7A9C2')}${ell(13.5, 11, 2, 4, '#FFE3EC', ' opacity="0.9"')}</g>`);
  p.pollen = svg(32, 32, circ(16, 16, 15, 'url(#pg)') + circ(16, 16, 4.5, '#FFF3B0') + circ(14.8, 14.8, 1.6, '#FFFFFF'), rg('pg', [[0, '#FFF6C4', 0.9], [0.4, '#FFE68A', 0.45], [1, '#FFE68A', 0]]));
  const bBody = `${ell(16, 17, 2.4, 8, '#7A6A9E')}${circ(16, 9.2, 2.8, '#7A6A9E')}${strokeP('M15 7Q13 3 11 2.5M17 7Q19 3 21 2.5', '#7A6A9E', 1.2)}${circ(11, 2.5, 1.2, '#7A6A9E')}${circ(21, 2.5, 1.2, '#7A6A9E')}`;
  const wingL = 'M15 14C10 4 2 5 2.5 11C3 15 8 16 15 16Z', wingLB = 'M15 17C9 17 4 21 6.5 25.5C9 28.5 14 24 15 19Z';
  const mirror = d => d.replace(/([MCLQ ]|^)(\d+\.?\d*) (\d+\.?\d*)/g, (m, c, x, y) => `${c}${f(32 - parseFloat(x))} ${y}`);
  p.butterfly1 = S(`${P(wingL, '#FFB7D2')}${P(mirror(wingL), '#FFB7D2')}${P(wingLB, '#C7B4F2')}${P(mirror(wingLB), '#C7B4F2')}${circ(7, 10, 2.2, '#FFE3EE')}${circ(25, 10, 2.2, '#FFE3EE')}${circ(9.5, 22.5, 1.6, '#EDE5FF')}${circ(22.5, 22.5, 1.6, '#EDE5FF')}${bBody}`);
  const wC = 'M15 15C12.5 7 9 4 8 7C7.5 11 10 15 15 16.5Z', wCB = 'M15 17C12 18 10.5 21 11.5 23.5C13 25 14.5 22 15 19Z';
  p.butterfly2 = S(`${P(wC, '#F5A3C3')}${P(mirror(wC), '#FFB7D2')}${P(wCB, '#B9A4EC')}${P(mirror(wCB), '#C7B4F2')}${bBody}`);
  // raindrop: a soft streak with a faint blue edge so it still reads on the pale rain sky
  p.raindrop = svg(32, 32, P('M15 1Q16 0 17 1L17.8 26Q16 31.5 14.2 26Z', 'url(#rd)') + strokeP('M17.4 8L17.6 25', '#A9C6E0', 1, ' opacity="0.6"'), lg('rd', 0, 0, 0, 1, [[0, '#E8F4FF', 0], [0.5, '#D3E8FB', 0.75], [1, '#F4FAFF', 1]]));
  // splash: a little water crown — flat ripple ring + 5 tapered spikes with round drop tips (thin blue edge so it reads on grass and sky)
  { const SP = [[-9, 15], [-4.5, 11], [0, 9.5], [4.5, 11], [9, 15]];
    const spikes = SP.map(([dx, ty]) => { const bx = 16 + dx * 0.5, tx = 16 + dx * 1.2;
      return `M${f(bx - 1.6)} 24Q${f((bx + tx) / 2 - 1.4)} ${f((24 + ty) / 2)} ${f(tx)} ${f(ty + 2.5)}Q${f((bx + tx) / 2 + 1.4)} ${f((24 + ty) / 2)} ${f(bx + 1.6)} 24Z`; }).join('');
    const tips = SP.map(([dx, ty], i) => circ(16 + dx * 1.6, ty - 6 + Math.abs(dx) * 0.2, i === 2 ? 2 : 1.6, '#EAF6FF', ' stroke="#9CC3E2" stroke-width="0.8"')).join(''); // drops flying free
    p.splash = S(`${ell(16, 25.5, 11, 3, 'none', ' stroke="#A9CBE6" stroke-width="1.6" opacity="0.9"')}${ell(16, 25.5, 7, 1.8, '#D9ECFB', ' opacity="0.8"')}${P(spikes, '#EAF6FF', ' stroke="#9CC3E2" stroke-width="0.8"')}${tips}`); }
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#FFF2A8')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  p.puff = svg(32, 32, `${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2EFF8', 0.8], [1, '#E6E2F0', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="9" y="12" width="14" height="8" rx="2" fill="#FF8FB1"/><rect x="9" y="16" width="14" height="4" rx="1.5" fill="#E8739A"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#7FD6E8', 4)}${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#B8EEF7', 1.4, ' opacity="0.8"')}`);
  // NEW pop: bubble-pop burst — a faint broken ring + 8 little droplets flying outward (white / pale cyan)
  let pop = '';
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.2, r1 = 9.5, r2 = 13.5, x = 16 + Math.cos(a) * r2, y = 16 + Math.sin(a) * r2;
    pop += strokeP(`M${f(16 + Math.cos(a) * 6.5)} ${f(16 + Math.sin(a) * 6.5)}L${f(16 + Math.cos(a) * r1)} ${f(16 + Math.sin(a) * r1)}`, '#DDF6FF', 1.6, ' opacity="0.85"');
    const rr = i % 2 ? 1.7 : 2.3;
    pop += circ(x, y, rr + 0.6, '#9FD9EE', ' opacity="0.7"') + circ(x, y, rr, i % 3 ? '#FFFFFF' : '#E3F8FF');
  }
  const arcs = [0, 1, 2, 3].map(q => { const a0 = q * Math.PI / 2 + 0.45, a1 = a0 + 0.9; return `M${f(16 + Math.cos(a0) * 8)} ${f(16 + Math.sin(a0) * 8)}A8 8 0 0 1 ${f(16 + Math.cos(a1) * 8)} ${f(16 + Math.sin(a1) * 8)}`; }).join('');
  p.pop = S(strokeP(arcs, '#FFFFFF', 1.6, ' opacity="0.9"') + strokeP(arcs, '#BDEBFA', 0.8, ' opacity="0.8"') + pop);
  // NEW droplet: small round water drop (teardrop, pointed up) with a highlight
  p.droplet = S(P('M16 4Q22.5 13 22.5 19A6.5 6.5 0 0 1 9.5 19Q9.5 13 16 4Z', '#8FC6E2') + P('M16 5.6Q21.3 13.4 21.3 19A5.3 5.3 0 0 1 10.7 19Q10.7 13.4 16 5.6Z', '#CFEFFC') +
    P('M16 12Q21.3 15 21.3 19A5.3 5.3 0 0 1 10.7 19Z', '#B3E1F5', ' opacity="0.8"') + ell(13.4, 17, 1.6, 2.8, '#FFFFFF', ' opacity="0.95"') + circ(17.8, 21.6, 0.9, '#FFFFFF', ' opacity="0.8"'));
  return p;
}

// ---------------- write ----------------
function writeAll() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const files = { far: genFar(), mid: genMid(), ground: genGround(), sun: genSun(), rainbow: genRainbow(), ...genClouds() };
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
  const parts = genParticles();
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
  const report = [...Object.keys(files).map(k => ['env/' + k, files[k]]), ...Object.keys(parts).map(k => ['particles/' + k, parts[k]])];
  for (const [k, v] of report) {
    const kb = Buffer.byteLength(v) / 1024, blurs = (v.match(/feGaussianBlur/g) || []).length;
    console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 80 ? '  TOO BIG' : ''}${/<text|<script|href=/.test(v) || blurs > 1 ? '  FORBIDDEN' : ''}`);
  }
}
writeAll();
