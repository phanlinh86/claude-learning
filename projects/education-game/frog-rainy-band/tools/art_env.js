// Bop's Rainy Band: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground}_{spring,summer,autumn,winter}.svg, stage, pot, sun, rainbow,
// cloud_a..c  and  game/assets/default/particles/{drop, splash, petal, leaf_a, leaf_b, snow, sparkle, star, puff,
// note_a, note_b, confetti_a, confetti_b}.svg                                                       (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that crosses the left/right edge of a tileable file is drawn again at x±1200 (wrap()); ridge
// curves are sums of sines with whole-number periods over 1200 px, picket spacing divides 1200, so the left and right
// edges match exactly. The four seasons share ONE layout per layer (same seed); only colours + season dressing change
// (spring blossoms, summer lush, autumn muted orange/brown, winter snow caps everywhere).
// Colour rule (DESIGN §3): soft, calm garden colours so the answer colours (red, blue, yellow, green, orange, purple)
// pop. Far = hazed towards the sky's bottom colour; the mid layer's front band = GROUND[season] exactly, so mid → ground
// has no visible seam and the renderer can fill any gap between them with GROUND[season].
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const TAU = Math.PI * 2;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
const ep = (x, y, rx, ry) => `M${f(x - rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 1 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 1 ${f(-2 * rx)} 0Z`;
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x, 0); if (x + half > W) o += fn(x - W, 1); if (x - half < 0) o += fn(x + W, 2); return o; }
const wrapCs = (cs, pad = 8) => { const all = []; for (const c of cs) { all.push(c); if (c[0] + c[2] + pad > W) all.push([c[0] - W, c[1], c[2]]); if (c[0] - c[2] - pad < 0) all.push([c[0] + W, c[1], c[2]]); } return all; };
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lgr = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
// periodic ridge: base + Σ a·sin(2π k x / W + p), k whole numbers
const ridge = (x, base, comps) => comps.reduce((y, [a, k, p]) => y + a * Math.sin(TAU * k * x / W + p), base);

// puff cluster: shade copy (offset down-right), body, small highlights upper-left
function puffCluster(cs, col, sh, hi, shOff = [5, 7]) {
  let o = P(cs.map(([x, y, r]) => cp(x + shOff[0], y + shOff[1], r)).join(''), sh);
  o += P(cs.map(([x, y, r]) => cp(x, y, r)).join(''), col);
  if (hi) o += P(cs.filter((c, i) => i % 2 === 0).map(([x, y, r]) => cp(x - r * 0.3, y - r * 0.36, r * 0.4)).join(''), hi, ' opacity="0.5"');
  return o;
}
// snow cap on top of a circle: the top arc + a scalloped lower edge
function capPath(x, y, r, depth = 0.45) {
  const th = Math.acos(1 - depth) ; // angle from the top where the cap ends
  const a0 = -Math.PI / 2 - th, a1 = -Math.PI / 2 + th;
  const lx = x + r * Math.cos(a0), ly = y + r * Math.sin(a0), rx = x + r * Math.cos(a1), ry = y + r * Math.sin(a1);
  const span = rx - lx, n = 3; let d = `M${f(lx)} ${f(ly)}A${f(r)} ${f(r)} 0 0 1 ${f(rx)} ${f(ry)}`;
  for (let i = 1; i <= n; i++) { const x1 = rx - span * i / n, xm = rx - span * (i - 0.5) / n; d += `Q${f(xm)} ${f(ly + r * 0.22)} ${f(x1)} ${f(ly + (i === n ? 0 : r * 0.04))}`; }
  return d + 'Z';
}
const caps = (cs, depth, minY = -1e9) => cs.filter(c => c[1] - c[2] > minY).map(([x, y, r]) => capPath(x, y - 1, r, depth)).join('');
// band under a ridge line with a scalloped lower edge (snow on a hill / mound)
function ridgeBand(yAt, depth, scal = 60) {
  const top = [], bot = []; for (let x = 0; x <= W; x += 10) top.push([x, yAt(x) - 0.5]);
  for (let x = W; x >= 0; x -= 10) bot.push([x, yAt(x) + depth + depth * 0.35 * Math.sin(TAU * x / scal)]);
  return line(top) + 'L' + bot.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
}
function flower5(x, y, s, petal, centre, sh) {
  let q = ''; for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; q += cp(x + Math.cos(a) * 4.4 * s, y + Math.sin(a) * 4.4 * s, 3.5 * s); }
  return (sh ? P(q, sh, ` transform="translate(1 1.4)"`) : '') + P(q, petal) + circ(x, y, 2.3 * s, centre);
}
function leafShape(x, y, L, a, w, col, sh) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">${P(`M0 0Q${f(L * 0.32)} ${f(-w * 1.25)} ${f(L)} 0Q${f(L * 0.32)} ${f(w * 1.25)} 0 0Z`, col)}${P(`M0 0Q${f(L * 0.4)} ${f(w * 0.2)} ${f(L)} 0Q${f(L * 0.32)} ${f(w * 1.25)} 0 0Z`, sh)}</g>`;
}

// ---------------- seasons ----------------
const SKY = { spring: ['#CFE6F0', '#F3F1E2'], summer: ['#8FD0F2', '#E3F4FB'], autumn: ['#E9C9A0', '#F6E6CB'], winter: ['#C9D6E6', '#EEF2F7'] };
const SNOW = { s: '#F6F9FC', sh: '#D9E3EE', hi: '#FFFFFF' };
// one palette per season; far colours are hazed towards the sky bottom afterwards
const PAL = {
  spring: {
    far: { hillB: '#B5D3A6', hillBSh: '#A6C798', hillF: '#9DC68C', hillFSh: '#8FB980', tree: '#8DBE84', treeSh: '#7CAF76', treeHi: '#A6CF98', bloom: '#EFCFD6', trunk: '#9A8270', wall: '#D8C3A3', wallSh: '#C2AC8D', roof: '#B08378', roofSh: '#9A6F66', door: '#8E6E5A', win: '#E8EEF0' },
    mid: { crown: '#79B276', crownSh: '#659F66', crownHi: '#92C68A', bloom: '#F2C6D1', bloomSh: '#DFA8B8', bloomHi: '#FBE3E8', trunk: '#8C6E58', trunkSh: '#755B48', hedge: '#629F6B', hedgeSh: '#548E5E', hedgeHi: '#78B47E', fence: '#ECE6D6', fenceSh: '#D3CAB6', fenceLn: '#B9AE97', soil: '#9A7B62', soilSh: '#856A54', fl: ['#F3C3CF', '#FFF0D2', '#E7D3F0'], flC: '#E8C46E', leaf: '#6FA86D' },
    ground: { base: '#8CC47A', hi: '#9DCF8A', low: '#7DB86E', rim: '#6FAE66', tuft: '#79B66B', stone: '#C5C1B3', stoneSh: '#A9A597', stoneHi: '#DEDBD0', pud: '#B9D5DE', pudSh: '#93B6C3', pudHi: '#E6F2F5', fl: ['#F6C9D3', '#FFF3DA'], flC: '#EAC36A', stem: '#5E9C5E', leafy: null },
  },
  summer: {
    far: { hillB: '#A8CF98', hillBSh: '#98C28A', hillF: '#8CC07C', hillFSh: '#7EB370', tree: '#77B072', treeSh: '#66A064', treeHi: '#92C487', bloom: null, trunk: '#94796A', wall: '#DBC5A2', wallSh: '#C4AE8B', roof: '#B5806F', roofSh: '#9C6B5D', door: '#8E6E5A', win: '#EAF4F8' },
    mid: { crown: '#5E9E62', crownSh: '#4D8B54', crownHi: '#78B474', bloom: null, trunk: '#86684F', trunkSh: '#6F5641', hedge: '#5E9E6A', hedgeSh: '#4F8C5B', hedgeHi: '#74B27C', fence: '#EFEADB', fenceSh: '#D6CEBA', fenceLn: '#BCB29B', soil: '#977760', soilSh: '#816651', fl: ['#C9D2F2', '#F7EFD9', '#F2C9D8'], flC: '#EBCB72', leaf: '#5E9C61' },
    ground: { base: '#8CC47A', hi: '#9DCF8A', low: '#7BB86C', rim: '#6FAE66', tuft: '#78B56A', stone: '#C8C3B3', stoneSh: '#ABA697', stoneHi: '#E0DDD1', pud: '#B5DBEA', pudSh: '#8DBACB', pudHi: '#EAF6FA', fl: ['#F7F1DC', '#D9DDF5'], flC: '#EAC36A', stem: '#5E9C5E', leafy: null },
  },
  autumn: {
    far: { hillB: '#C9C292', hillBSh: '#BBB385', hillF: '#B3B47C', hillFSh: '#A4A570', tree: '#D2A06A', treeSh: '#BD8C5B', treeHi: '#E0B784', bloom: null, trunk: '#93766A', wall: '#D6BE9C', wallSh: '#BFA786', roof: '#A97A6C', roofSh: '#92665A', door: '#866656', win: '#F1EADC' },
    mid: { crown: '#CF9A5E', crownSh: '#B98450', crownHi: '#E0B47C', crown2: '#B88E5A', crown2Sh: '#A27A4C', trunk: '#80634F', trunkSh: '#6A513F', hedge: '#86A366', hedgeSh: '#76925A', hedgeHi: '#9CB679', fence: '#E9E0CC', fenceSh: '#CFC3AA', fenceLn: '#B6A88C', soil: '#937259', soilSh: '#7E604A', fl: ['#E9B98C', '#F3E2BE', '#D9A9A0'], flC: '#C9934F', leaf: '#8C9C5E' },
    ground: { base: '#A6BC7C', hi: '#B4C78B', low: '#97AF6F', rim: '#8AA466', tuft: '#93AD6C', stone: '#C6BEAD', stoneSh: '#AAA291', stoneHi: '#DDD7CA', pud: '#C9D2CF', pudSh: '#A3B1AE', pudHi: '#F0F2EC', fl: ['#EFCB9A', '#F4E6C6'], flC: '#C9934F', stem: '#7E9658', leafy: ['#D69A5C', '#C4864F', '#B98F5E'] },
  },
  winter: {
    far: { hillB: '#DCE5EF', hillBSh: '#CBD7E4', hillF: '#E6EDF4', hillFSh: '#D2DDE9', tree: '#8FAE9E', treeSh: '#7E9E8F', treeHi: '#A2BFAF', bloom: null, trunk: '#8E7D74', wall: '#CDB8A0', wallSh: '#B5A089', roof: '#A57F78', roofSh: '#8F6C66', door: '#806558', win: '#F3E7C2' },
    mid: { crown: '#7C9D8C', crownSh: '#6B8C7C', crownHi: '#8FB09E', bloom: null, trunk: '#7E6656', trunkSh: '#68533F', hedge: '#6E9878', hedgeSh: '#5F886A', hedgeHi: '#82AA8A', fence: '#E7E3DA', fenceSh: '#CCC5B8', fenceLn: '#B2AA9B', soil: '#8E7666', soilSh: '#7A6456', fl: [], flC: '#E8C46E', leaf: '#6E9878' },
    ground: { base: '#EEF3F8', hi: '#F8FAFD', low: '#DFE8F1', rim: '#CCD9E6', tuft: '#D3DEEA', stone: '#BBB8B0', stoneSh: '#A19E96', stoneHi: '#D6D3CC', pud: '#CFE3F0', pudSh: '#A9C6DA', pudHi: '#F4FAFE', fl: ['#FFFFFF'], flC: '#E7EBC0', stem: '#7FA48B', leafy: null },
  },
};
const HAZE = { spring: 0.34, summer: 0.26, autumn: 0.30, winter: 0.30 };
function pal(s, layer) {
  const o = { ...PAL[s][layer] };
  if (layer === 'far') for (const k of Object.keys(o)) if (typeof o[k] === 'string') o[k] = mix(o[k], SKY[s][1], HAZE[s]);
  return o;
}
const GROUND = Object.fromEntries(SEASONS.map(s => [s, PAL[s].ground.base]));
// colour of the far layer's bottom row (front hill under the mist) — safety fill below the far tile
const FARFILL = Object.fromEntries(SEASONS.map(s => { const c = pal(s, 'far'); return [s, mix(c.hillF, SKY[s][1], 0.3)]; }));

// ================= far_<s>.svg (0 0 1200 420): soft hills, rounded trees, a far shed =================
const RB_ = [[18, 1, 0.6], [12, 2, 2.2], [6, 5, 1.1]], RF_ = [[11, 2, 3.0], [8, 3, 0.5], [3, 7, 1.9]];
const backY = x => ridge(x, 262, RB_), frontY = x => ridge(x, 322, RF_);
function farLayout() {
  const r = rng(101);
  const trees = [];
  // back hill trees (small) and front hill trees (bigger); a gap around the shed (x ≈ 840)
  for (const [x0, back] of [[60, 1], [190, 1], [330, 1], [470, 1], [610, 1], [1010, 1], [1130, 1], [120, 0], [400, 0], [700, 0], [930, 0]]) {
    const x = x0 + (r() - 0.5) * 40, s = back ? 0.7 + r() * 0.3 : 1 + r() * 0.35;
    const baseY = (back ? backY(x) : frontY(x)) + 8;
    const R = 20 * s, h = 26 * s;
    const cs = [[x, baseY - h - R * 0.9, R], [x - R * 0.7, baseY - h - R * 0.3, R * 0.72], [x + R * 0.72, baseY - h - R * 0.35, R * 0.7]];
    trees.push({ x, baseY, R, h, cs, back, round: r() < 0.7 });
  }
  return { trees, shed: { x: 845, y: backY(845) + 6 } };
}
const FAR = farLayout();
function farTree(t, dx, C, s) {
  const cs = t.cs.map(([a, b, rr]) => [a + dx, b, rr]), x = t.x + dx;
  let o = P(`M${f(x - 3.2)} ${f(t.baseY)}L${f(x - 2)} ${f(t.baseY - t.h - 4)}H${f(x + 2)}L${f(x + 3.2)} ${f(t.baseY)}Z`, C.trunk);
  if (s === 'winter') {
    o += puffCluster(cs, C.tree, C.treeSh, null, [2, 3]);
    o += P(caps(cs, 0.75), SNOW.s) ;
  } else {
    o += puffCluster(cs, C.tree, C.treeSh, C.treeHi, [2, 3]);
    if (C.bloom && t.round) o += P(cs.flatMap(([a, b, rr], i) => [cp(a - rr * 0.35, b - rr * 0.2, rr * 0.18), cp(a + rr * 0.3, b + rr * 0.1, rr * 0.15), cp(a + (i - 1) * rr * 0.2, b - rr * 0.55, rr * 0.13)]).join(''), C.bloom);
  }
  return o;
}
function genFar(s) {
  const C = pal(s, 'far'), L = FAR, hz = SKY[s][1];
  let o = '', defs = '';
  // back hills
  const bp = []; for (let x = 0; x <= W; x += 10) bp.push([x, backY(x)]);
  o += P(line(bp) + `L${W} 420L0 420Z`, C.hillB);
  if (s === 'winter') o += P(ridgeBand(backY, 10, 75), mix(SNOW.hi, hz, 0.25));
  // a gentle shade band on the back hills
  o += P(line(bp.map(([x, y]) => [x, y + 26])) + `L${W} 420L0 420Z`, C.hillBSh, ' opacity="0.5"');
  // the far shed on the back hill
  { const { x, y } = L.shed, w = 58, h = 36;
    o += rect(x - w / 2, y - h, w, h, C.wall) + rect(x + w * 0.18, y - h, w * 0.32, h, C.wallSh);
    o += P(`M${f(x - w / 2 - 7)} ${f(y - h + 2)}L${f(x)} ${f(y - h - 24)}L${f(x + w / 2 + 7)} ${f(y - h + 2)}Z`, C.roof);
    o += P(`M${f(x)} ${f(y - h - 24)}L${f(x + w / 2 + 7)} ${f(y - h + 2)}H${f(x + 4)}Z`, C.roofSh);
    if (s === 'winter') o += P(`M${f(x - w / 2 - 8)} ${f(y - h + 1)}L${f(x)} ${f(y - h - 26)}L${f(x + w / 2 + 8)} ${f(y - h + 1)}Q${f(x + 18)} ${f(y - h - 6)} ${f(x + 10)} ${f(y - h - 10)}Q${f(x)} ${f(y - h - 6)} ${f(x - 12)} ${f(y - h - 8)}Q${f(x - 24)} ${f(y - h - 2)} ${f(x - w / 2 - 8)} ${f(y - h + 1)}Z`, mix(SNOW.hi, hz, 0.15));
    o += rect(x - 18, y - 22, 13, 22, C.door) + rect(x + 4, y - 26, 14, 11, C.win) + strokeP(`M${f(x + 11)} ${f(y - 26)}V${f(y - 15)}`, C.wallSh, 1.6);
  }
  for (const t of L.trees.filter(t => t.back)) o += wrap(t.x, t.R * 2, x => farTree(t, x - t.x, C, s));
  // soft haze between the hills
  defs += lgr('hz', [[0, hz, 0], [1, hz, 0.55]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="250" width="${W}" height="90" fill="url(#hz)"/>`;
  // front hills
  const fp = []; for (let x = 0; x <= W; x += 10) fp.push([x, frontY(x)]);
  o += P(line(fp) + `L${W} 420L0 420Z`, C.hillF);
  if (s === 'winter') o += P(ridgeBand(frontY, 12, 60), mix(SNOW.hi, hz, 0.1));
  o += P(line(fp.map(([x, y]) => [x, y + 30])) + `L${W} 420L0 420Z`, C.hillFSh, ' opacity="0.45"');
  for (const t of L.trees.filter(t => !t.back)) o += wrap(t.x, t.R * 2, x => farTree(t, x - t.x, C, s));
  // mist at the foot
  o += `<rect x="0" y="330" width="${W}" height="90" fill="url(#hz)"/>`;
  return svg(1200, 420, o, defs);
}

// ================= mid_<s>.svg (0 0 1200 380): garden trees, hedge, picket fence, flower beds =================
const HEDGE_Y = 236, FENCE_TOP = 250, FENCE_BOT = 326, PICKET = 48, FRONT_Y = 346;
const hedgeEdge = [[6, 3, 0.9], [4, 5, 2.4], [2, 8, 0.2]];
const frontEdge = x => ridge(x, FRONT_Y, [[3, 2, 1.3], [2, 5, 0.4], [1, 9, 2.0]]);
function midLayout() {
  const r = rng(202);
  const trees = [{ x: 170, top: 40, cw: 120, tw: 22, kind: 0 }, { x: 620, top: 92, cw: 82, tw: 16, kind: 1 }, { x: 1000, top: 58, cw: 108, tw: 20, kind: 0 }];
  for (const t of trees) {
    t.crown = [];
    const n = t.kind ? 9 : 14;
    for (let j = 0; j < n; j++) { const a = r() * TAU, d = Math.sqrt(r()); t.crown.push([t.x + Math.cos(a) * d * t.cw * 0.62, t.top + t.cw * 0.55 + Math.sin(a) * d * t.cw * 0.36, t.cw * (0.24 + r() * 0.14)]); }
    t.crown.sort((a, b) => a[1] - b[1]);
  }
  const hedge = []; for (let x = 0; x < W; x += 36) hedge.push([x + (r() - 0.5) * 12, 0, 24 + r() * 12]);
  hedge.forEach(c => { c[1] = ridge(c[0], HEDGE_Y, hedgeEdge) + c[2] * 0.75; });
  // flower beds in front of the fence (gaps keep the band calm)
  const beds = [{ x: 90, w: 150 }, { x: 420, w: 120 }, { x: 800, w: 170 }, { x: 1120, w: 110 }];
  for (const b of beds) { b.fl = []; const n = Math.round(b.w / 16); for (let i = 0; i < n; i++) b.fl.push({ dx: (i / (n - 1) - 0.5) * b.w * 0.86 + (r() - 0.5) * 6, dy: -8 - r() * 14, c: Math.floor(r() * 3), s: 0.9 + r() * 0.35 }); }
  return { trees, hedge, beds };
}
const MID = midLayout();
function picketPath(x) {
  const w = 22, h0 = FENCE_TOP, b = FENCE_BOT;
  return `M${f(x - w / 2)} ${f(b)}V${f(h0 + 12)}Q${f(x - w / 2)} ${f(h0 + 2)} ${f(x)} ${f(h0 - 6)}Q${f(x + w / 2)} ${f(h0 + 2)} ${f(x + w / 2)} ${f(h0 + 12)}V${f(b)}Z`;
}
function genMid(s) {
  const C = pal(s, 'mid'), G = PAL[s].ground, L = MID, winter = s === 'winter';
  // calm the fence: pull its tones towards the hedge so the pickets don't compete with the band
  C.fence = mix(C.fence, C.hedge, 0.2); C.fenceSh = mix(C.fenceSh, C.hedge, 0.25); C.fenceLn = mix(C.fenceLn, C.hedgeSh, 0.3);
  let o = '';
  // garden trees
  for (const t of L.trees) o += wrap(t.x, t.cw + 30, x => {
    const dx = x - t.x, w = t.tw, ty = t.top + t.cw * 0.55;
    let q = P(`M${f(x - w * 0.62)} ${HEDGE_Y + 30}Q${f(x - w * 0.5)} ${f(ty + 60)} ${f(x - w * 0.36)} ${f(ty)}H${f(x + w * 0.36)}Q${f(x + w * 0.5)} ${f(ty + 60)} ${f(x + w * 0.62)} ${HEDGE_Y + 30}Z`, C.trunk);
    q += P(`M${f(x + w * 0.08)} ${HEDGE_Y + 30}Q${f(x + w * 0.16)} ${f(ty + 60)} ${f(x + w * 0.1)} ${f(ty)}H${f(x + w * 0.36)}Q${f(x + w * 0.5)} ${f(ty + 60)} ${f(x + w * 0.62)} ${HEDGE_Y + 30}Z`, C.trunkSh);
    const cs = t.crown.map(([a, b, rr]) => [a + dx, b, rr]);
    if (winter) {
      // bare branches with snow along them
      const br = [[-0.55, -0.55], [0.5, -0.6], [-0.15, -0.95], [0.25, -0.85], [-0.8, -0.2], [0.8, -0.25]];
      let d = '', sd = '';
      for (const [bx, by] of br) { const ex = x + bx * t.cw * 0.7, ey = ty + by * t.cw * 0.6, mx = x + bx * t.cw * 0.25, my = ty + by * t.cw * 0.15 + 10; d += `M${f(x)} ${f(ty + 16)}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`; sd += `M${f(x + bx * 6)} ${f(ty + 10)}Q${f(mx)} ${f(my - 4)} ${f(ex)} ${f(ey - 3)}`; }
      // twigs off each branch tip
      let tw = '', tips = [];
      for (const [bx, by] of br) { const ex = x + bx * t.cw * 0.7, ey = ty + by * t.cw * 0.6; for (const da of [-0.5, 0.45]) { const a = Math.atan2(by, bx) + da, L2 = t.cw * 0.16; tw += `M${f(ex)} ${f(ey)}l${f(Math.cos(a) * L2)} ${f(Math.sin(a) * L2)}`; } tips.push([ex, ey]); }
      q += strokeP(d, C.trunk, w * 0.32) + strokeP(tw, C.trunk, w * 0.14) + strokeP(sd, SNOW.s, w * 0.16);
      // small snow pillows sitting on the branch tips
      q += P(tips.map(([ex, ey]) => ep(ex, ey - 3, t.cw * 0.09, t.cw * 0.05)).join(''), SNOW.s) + P(tips.map(([ex, ey]) => ep(ex + 1, ey - 1, t.cw * 0.07, t.cw * 0.025)).join(''), SNOW.sh);
    } else if (s === 'autumn') {
      q += puffCluster(cs, t.kind ? C.crown2 : C.crown, t.kind ? C.crown2Sh : C.crownSh, C.crownHi, [5, 8]);
    } else if (s === 'spring' && t.kind === 0 && t.x < 500) {
      q += puffCluster(cs, C.bloom, C.bloomSh, C.bloomHi, [5, 8]); // the cherry tree
    } else {
      q += puffCluster(cs, C.crown, C.crownSh, C.crownHi, [5, 8]);
      if (C.bloom) q += P(cs.flatMap(([a, b, rr]) => [cp(a - rr * 0.3, b - rr * 0.3, rr * 0.15), cp(a + rr * 0.35, b + rr * 0.05, rr * 0.13)]).join(''), C.bloom);
    }
    return q;
  });
  // hedge band
  const hc = wrapCs(L.hedge);
  o += puffCluster(hc, C.hedge, C.hedgeSh, C.hedgeHi, [3, 5]) + rect(0, HEDGE_Y + 22, W, 380 - HEDGE_Y - 22, C.hedge);
  if (winter) o += P(caps(hc, 0.6), SNOW.s);
  // hedge lower shade (calm, darker at the foot)
  o += rect(0, 300, W, 80, C.hedgeSh, ' opacity="0.55"');
  // picket fence: 25 pickets (period 48 divides 1200), two rails
  let pk = '', pkSh = '';
  for (let i = 0; i < W / PICKET; i++) { const x = PICKET / 2 + i * PICKET; pk += picketPath(x); pkSh += `M${f(x + 3)} ${f(FENCE_TOP + 6)}Q${f(x + 11)} ${f(FENCE_TOP + 4)} ${f(x + 11)} ${f(FENCE_TOP + 12)}V${FENCE_BOT}H${f(x + 3)}Z`; }
  o += rect(0, FENCE_TOP + 22, W, 11, C.fenceSh) + rect(0, FENCE_TOP + 52, W, 11, C.fenceSh);
  o += P(pk, C.fence, ` stroke="${C.fenceLn}" stroke-width="2.5" stroke-linejoin="round"`) + P(pkSh, C.fenceSh, ' opacity="0.8"');
  o += rect(0, FENCE_TOP + 22, W, 3, C.fenceLn, ' opacity="0.5"') + rect(0, FENCE_TOP + 52, W, 3, C.fenceLn, ' opacity="0.5"');
  if (winter) {
    let sc = ''; for (let i = 0; i < W / PICKET; i++) { const x = PICKET / 2 + i * PICKET; sc += `M${f(x - 13)} ${f(FENCE_TOP + 6)}Q${f(x - 12)} ${f(FENCE_TOP - 2)} ${f(x)} ${f(FENCE_TOP - 10)}Q${f(x + 12)} ${f(FENCE_TOP - 2)} ${f(x + 13)} ${f(FENCE_TOP + 6)}Q${f(x + 5)} ${f(FENCE_TOP + 3)} ${f(x)} ${f(FENCE_TOP + 7)}Q${f(x - 6)} ${f(FENCE_TOP + 2)} ${f(x - 13)} ${f(FENCE_TOP + 6)}Z`; }
    o += P(sc, SNOW.hi);
  }
  // flower beds: soil mound + flower clumps (soft muted colours)
  for (const b of L.beds) o += wrap(b.x, b.w / 2 + 20, x => {
    const y = FENCE_BOT + 12;
    let q = P(`M${f(x - b.w / 2 - 12)} ${f(y + 6)}Q${f(x - b.w / 2)} ${f(y - 12)} ${f(x)} ${f(y - 14)}Q${f(x + b.w / 2)} ${f(y - 12)} ${f(x + b.w / 2 + 12)} ${f(y + 6)}Z`, winter ? SNOW.sh : C.soil);
    if (winter) { q += P(`M${f(x - b.w / 2 - 10)} ${f(y + 4)}Q${f(x - b.w / 2)} ${f(y - 22)} ${f(x)} ${f(y - 24)}Q${f(x + b.w / 2)} ${f(y - 22)} ${f(x + b.w / 2 + 10)} ${f(y + 4)}Z`, SNOW.s); return q; }
    q += P(`M${f(x - b.w / 2 - 12)} ${f(y + 6)}Q${f(x)} ${f(y - 4)} ${f(x + b.w / 2 + 12)} ${f(y + 6)}Z`, C.soilSh);
    // leafy clump
    const lc = []; for (let i = 0; i < 6; i++) lc.push([x + (i / 5 - 0.5) * b.w * 0.8, y - 14, 13]);
    q += puffCluster(lc, C.leaf, mix(C.leaf, '#000000', 0.12), null, [2, 3]);
    for (const fl of b.fl) q += flower5(x + fl.dx, y + fl.dy, fl.s, C.fl[fl.c % C.fl.length], C.flC, mix(C.fl[fl.c % C.fl.length], '#6A5A50', 0.25));
    return q;
  });
  // front band = the ground colour (seamless into ground_<s>)
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, frontEdge(x)]);
  o += P(line(pts) + `L${W} 380L0 380Z`, G.base) + strokeP(line(pts), G.rim, 2.5, ' opacity="0.7"');
  return svg(1200, 380, o);
}

// ================= ground_<s>.svg (0 0 1200 260): lawn, stepping stones, puddles, a few flowers =================
const EDGE = 36;
const edgeY = x => ridge(x, EDGE, [[4, 2, 0.7], [3, 3, 1.9], [1.5, 7, 0.3]]);
function groundLayout() {
  const r = rng(303);
  const fringe = []; for (let x = 4; x < W; x += 13) fringe.push({ x: x + (r() - 0.5) * 6, h: 5 + r() * 6, l: r() < 0.5 });
  // stepping stones: a curving path near the front + a couple near the edge (middle band y 70–190 kept calm)
  const stones = [{ x: 140, y: 226, rx: 30, ry: 11 }, { x: 222, y: 240, rx: 26, ry: 10 }, { x: 700, y: 232, rx: 32, ry: 11 }, { x: 790, y: 244, rx: 24, ry: 9 }, { x: 1090, y: 228, rx: 28, ry: 10 }, { x: 470, y: 58, rx: 18, ry: 6 }, { x: 960, y: 60, rx: 15, ry: 5 }];
  const puddles = [{ x: 330, y: 70, rx: 46, ry: 9 }, { x: 880, y: 210, rx: 52, ry: 11 }, { x: 1150, y: 76, rx: 34, ry: 7 }, { x: 560, y: 242, rx: 40, ry: 8 }];
  const flowers = [];
  for (const fx of [60, 255, 420, 640, 790, 1040]) flowers.push({ x: fx + (r() - 0.5) * 30, v: 6 + r() * 10, c: Math.floor(r() * 2), s: 0.85 + r() * 0.3 });
  for (const fx of [40, 400, 990]) flowers.push({ x: fx + (r() - 0.5) * 40, v: 208 + r() * 30, c: Math.floor(r() * 2), s: 0.8 + r() * 0.25, low: true });
  const tufts = []; for (let i = 0; i < 22; i++) tufts.push({ x: r() * W, y: 60 + r() * 190, s: 0.7 + r() * 0.45 });
  const leaves = []; for (let i = 0; i < 16; i++) leaves.push({ x: r() * W, y: 56 + r() * 196, a: r() * 360, c: Math.floor(r() * 3), s: 0.8 + r() * 0.5 });
  return { fringe, stones, puddles, flowers, tufts, leaves };
}
const GRD = groundLayout();
function tuft(x, y, s, col) {
  return strokeP(`M${f(x - 6 * s)} ${f(y - 6 * s)}Q${f(x - 3 * s)} ${f(y - 2 * s)} ${f(x - 1 * s)} ${f(y)}M${f(x)} ${f(y - 9 * s)}L${f(x)} ${f(y)}M${f(x + 6 * s)} ${f(y - 7 * s)}Q${f(x + 3 * s)} ${f(y - 2 * s)} ${f(x + 1 * s)} ${f(y)}`, col, 2.2 * s);
}
function genGround(s) {
  const C = PAL[s].ground, L = GRD, winter = s === 'winter';
  let o = '', defs = '';
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, edgeY(x)]);
  o += P(line(pts) + `L${W} 260L0 260Z`, C.base);
  o += P(poly([...pts.map(([x, y]) => [x, y + 4]), ...pts.map(([x, y]) => [x, y + 26]).reverse()]), C.hi, ' opacity="0.6"');
  defs += lgr('gd', [[0, C.low, 0], [1, C.low, 0.95]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="196" width="${W}" height="64" fill="url(#gd)"/>`;
  // big soft mowing stripes / patches (very low contrast)
  for (const [px, py, rx, ry, k] of [[160, 118, 160, 22, 'hi'], [540, 160, 200, 26, 'low'], [880, 104, 170, 20, 'hi'], [1090, 176, 150, 22, 'low']])
    o += wrap(px, rx, x => ell(x, py, rx, ry, C[k], ' opacity="0.4"'));
  // grass fringe + rim
  let fr = '';
  for (const b of L.fringe) { const y = edgeY(b.x) + 2; fr += wrap(b.x, 6, xx => `M${f(xx - 4)} ${f(y)}Q${f(xx + (b.l ? -2 : 2))} ${f(y - b.h * 0.6)} ${f(xx + (b.l ? -3 : 3))} ${f(y - b.h)}Q${f(xx + (b.l ? 1 : -1))} ${f(y - b.h * 0.4)} ${f(xx + 4)} ${f(y)}Z`); }
  o += (winter ? '' : P(fr, C.base)) + strokeP(line(pts), C.rim, 2.5, ' opacity="0.7"');
  if (winter) { // soft drift bumps on the edge instead of grass blades
    const dr = []; for (let x = 0; x < W; x += 40) dr.push([x + 20, edgeY(x + 20) + 6, 16]);
    o += P(wrapCs(dr).map(([x, y, r]) => ep(x, y, r * 1.6, r * 0.55)).join(''), C.hi);
  }
  // puddles (rainy day): darker rim, sky reflection, a little highlight; winter = ice
  for (const p of L.puddles) o += wrap(p.x, p.rx + 6, x => ell(x, p.y + 2, p.rx + 4, p.ry + 2.5, C.rim, ' opacity="0.55"') + ell(x, p.y, p.rx, p.ry, C.pudSh) + ell(x - 2, p.y - 1.4, p.rx * 0.92, p.ry * 0.72, C.pud) +
    strokeP(`M${f(x - p.rx * 0.5)} ${f(p.y - p.ry * 0.25)}Q${f(x - p.rx * 0.2)} ${f(p.y - p.ry * 0.55)} ${f(x + p.rx * 0.1)} ${f(p.y - p.ry * 0.35)}`, C.pudHi, 2.4) + (winter ? strokeP(`M${f(x + p.rx * 0.25)} ${f(p.y + p.ry * 0.1)}l${f(p.rx * 0.25)} ${f(-p.ry * 0.3)}`, C.pudHi, 1.8) : ''));
  // stepping stones
  for (const st of L.stones) o += wrap(st.x, st.rx + 4, x => {
    const y = st.y;
    let q = ell(x + 2, y + st.ry * 0.45, st.rx * 1.05, st.ry * 0.7, C.rim, ' opacity="0.5"') + ell(x, y, st.rx, st.ry, C.stone) +
      P(`M${f(x - st.rx * 0.96)} ${f(y + 1)}Q${f(x)} ${f(y + st.ry * 1.3)} ${f(x + st.rx * 0.96)} ${f(y + 1)}Q${f(x)} ${f(y + st.ry * 0.55)} ${f(x - st.rx * 0.96)} ${f(y + 1)}Z`, C.stoneSh) +
      ell(x - st.rx * 0.3, y - st.ry * 0.35, st.rx * 0.36, st.ry * 0.25, C.stoneHi, ' opacity="0.8"');
    if (winter) q += P(`M${f(x - st.rx * 0.85)} ${f(y - st.ry * 0.1)}Q${f(x - st.rx * 0.5)} ${f(y - st.ry * 1.1)} ${f(x + st.rx * 0.2)} ${f(y - st.ry * 0.95)}Q${f(x + st.rx * 0.8)} ${f(y - st.ry * 0.8)} ${f(x + st.rx * 0.82)} ${f(y - st.ry * 0.05)}Q${f(x + st.rx * 0.3)} ${f(y - st.ry * 0.35)} ${f(x)} ${f(y - st.ry * 0.15)}Q${f(x - st.rx * 0.4)} ${f(y - st.ry * 0.4)} ${f(x - st.rx * 0.85)} ${f(y - st.ry * 0.1)}Z`, SNOW.hi);
    return q;
  });
  // low-contrast tufts
  for (const t of L.tufts) { const y = Math.max(edgeY(t.x) + 30, t.y); o += wrap(t.x, 10, xx => tuft(xx, y, t.s, C.tuft)); }
  // autumn: a few fallen leaves on the lawn
  if (C.leafy) for (const lf of L.leaves) o += wrap(lf.x, 10, x => leafShape(x - 6 * lf.s, lf.y, 13 * lf.s, lf.a, 4.2 * lf.s, C.leafy[lf.c], mix(C.leafy[lf.c], '#5A3A22', 0.2)));
  // a few soft flowers along the edge and the front (winter: tiny snowdrops)
  for (const fl of L.flowers) o += wrap(fl.x, 12, x => {
    const y = fl.low ? fl.v : edgeY(x) + 8 + fl.v;
    if (winter) return strokeP(`M${f(x)} ${f(y - 6)}q2 -4 4 -2`, C.stem, 1.6) + ell(x + 4, y - 3, 2.4, 3.4, '#FFFFFF') + ell(x + 4, y - 0.4, 2.6, 1.2, '#D9E7DD');
    return strokeP(`M${f(x)} ${f(y)}l0 ${f(8 * fl.s)}`, C.stem, 1.8) + flower5(x, y, fl.s, C.fl[fl.c], C.flC, C.rim);
  });
  return svg(1200, 260, o, defs);
}

// ================= stage.svg (0 0 800 140): wooden plank + short legs; pot.svg (0 0 120 120) =================
// plank top surface at y = 20 (middle of the light top face 12–26), front face 26–50, legs 50–140 (plain poles,
// stretch them vertically). Left cap x 0–60 / right cap 740–800 hold the rounded ends, nails and legs (centred x 31 /
// 769); the middle 60–740 has only horizontal features, so it can be stretched or tiled horizontally.
const STAGE = { top: 20, plankBottom: 50, legX: [31, 769], legW: 22, caps: [60, 740] };
function genStage() {
  const c = { top: '#D9A86C', topHi: '#E8C18C', face: '#B9834F', faceSh: '#A47141', ln: '#7E5430', grain: '#9E6B3D', leg: '#9C6A3E', legSh: '#83582F', nail: '#6E4A2C' };
  let o = '';
  // legs (behind the plank)
  for (const lx of STAGE.legX) o += rect(lx - 11, 44, 22, 96, c.leg) + rect(lx + 3, 44, 8, 96, c.legSh) + `<path d="M${lx - 11} 140V44M${lx + 11} 44V140" stroke="${c.ln}" stroke-width="3" fill="none"/>`;
  // front face with rounded ends
  o += P('M8 26H792Q797 26 797 31V45Q797 50 792 50H8Q3 50 3 45V31Q3 26 8 26Z', c.face, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += rect(5, 41, 790, 7, c.faceSh) ;
  o += strokeP('M60 34H740M70 40H560M600 40H740', c.grain, 1.6, ' opacity="0.55"') + strokeP('M14 34H60M740 34H786M18 40H60M740 40H782', c.grain, 1.6, ' opacity="0.55"');
  // top face
  o += P('M12 12H788Q796 12 797 20V26H3V20Q4 12 12 12Z', c.top, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += rect(8, 15, 784, 3, c.topHi, ' opacity="0.9"');
  // end grain + nails in the caps
  for (const [x, s] of [[12, 1], [788, -1]]) o += strokeP(`M${x + s * 4} 30Q${x + s * 10} 38 ${x + s * 4} 46`, c.ln, 1.6, ' opacity="0.6"');
  for (const lx of STAGE.legX) o += circ(lx, 38, 3.2, c.nail) + circ(lx - 1, 37, 1, c.topHi);
  return svg(800, 140, o);
}
// terracotta pot (squat, so it still reads at 50 px tall under the landscape stage): anchor bottom-centre (60, 118);
// rim 50–66, body 66–118 (visible height 68); a few leaves peek out over the rim up to y ≈ 28
const POT = { anchor: [60, 118], rimTop: 50, h: 68 };
function genPot() {
  const c = { rim: '#D9825A', rimSh: '#C26F4A', body: '#C9714A', bodySh: '#B05E3B', hi: '#E59B74', ln: '#8E4A2E', leaf: '#6FA86D', leafSh: '#5A9259' };
  let o = ell(60, 117, 52, 4, '#3A2A1A', ' opacity="0.15"');
  o += leafShape(50, 56, 28, -128, 8, c.leaf, c.leafSh) + leafShape(70, 56, 30, -55, 8, c.leaf, c.leafSh) + leafShape(60, 58, 26, -92, 7, c.leaf, c.leafSh);
  o += P('M14 64L24 113Q25 118 31 118H89Q95 118 96 113L106 64Z', c.body, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += P('M76 66H104L95 113Q94 117 89 117H74Q80 92 76 66Z', c.bodySh);
  o += P('M27 70L34 108H41L35 70Z', c.hi, ' opacity="0.7"');
  o += P('M6 54Q6 50 10 50H110Q114 50 114 54V62Q114 66 110 66H10Q6 66 6 62Z', c.rim, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += rect(8, 61, 104, 4, c.rimSh) + rect(12, 53, 64, 2.6, c.hi, ' opacity="0.8"');
  return svg(120, 120, o);
}

// ================= sun, rain clouds, rainbow =================
function genSun() {
  const defs = rg('glow', [[0, '#FFF6D4', 0.9], [0.45, '#FFEFC0', 0.42], [1, '#FFEFC0', 0]]) + rg('disc', [[0, '#FFFBE6'], [0.7, '#FFF0BC'], [1, '#FBE19C']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 90; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEDB8', 10, ' opacity="0.85"');
  o += circ(100, 100, 55, '#F4DC9C') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
const CL = { top: '#FBFCFE', mid: '#E4EAF1', belly: '#B7C5D5', bellySh: '#A3B3C6' };
function genCloud(puffs, bottom, x0, x1) {
  const hb = 36, d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.bellySh}"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.belly}" transform="translate(0 -6)"/><path d="${d}" fill="${CL.mid}" transform="translate(-2 -26)"/><path d="${d}" fill="${CL.top}" transform="translate(-5 -40)"/></g>`;
  return svg(320, 170, o);
}
const genClouds = () => ({
  cloud_a: genCloud([[70, 110, 32], [124, 86, 44], [186, 78, 50], [242, 104, 36], [160, 116, 34]], 150, 30, 290),
  cloud_b: genCloud([[56, 120, 24], [98, 104, 34], [150, 100, 38], [204, 106, 30], [254, 120, 22]], 146, 30, 290),
  cloud_c: genCloud([[84, 106, 36], [142, 74, 52], [204, 88, 42], [248, 114, 28], [130, 118, 32]], 152, 40, 286),
});
function genRainbow() {
  const bands = ['#F4A9A6', '#F8CC9E', '#F6E7A2', '#B9E0AE', '#A9CBEE', '#C9B5E6'];
  const defs = lgr('rf', [[0, '#FFFFFF'], [0.55, '#FFFFFF'], [1, '#FFFFFF', 0]], ' x1="0" y1="0" x2="0" y2="1"') + `<mask id="rm"><rect x="0" y="0" width="800" height="400" fill="url(#rf)"/></mask>`;
  let o = '<g mask="url(#rm)" opacity="0.9">';
  const bw = 18; let r = 380;
  for (const b of bands) { o += `<path d="M${f(400 - r + bw / 2)} 400A${f(r - bw / 2)} ${f(r - bw / 2)} 0 0 1 ${f(400 + r - bw / 2)} 400" fill="none" stroke="${b}" stroke-width="${bw + 0.8}"/>`; r -= bw; }
  o += `<path d="M${f(400 - r + 6)} 400A${f(r - 6)} ${f(r - 6)} 0 0 1 ${f(400 + r - 6)} 400" fill="none" stroke="#FFFFFF" stroke-width="12" opacity="0.35"/>`;
  return svg(800, 400, o + '</g>', defs);
}

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.drop = S(P('M16 3Q22 13 23.5 18.5Q25 26 16 29Q7 26 8.5 18.5Q10 13 16 3Z', '#CFE6FA', ' stroke="#8DB8E0" stroke-width="1.8" stroke-linejoin="round"') + P('M16 6Q12 14 11.5 19Q11.5 24 15 26Q9 25 10 18.6Q11.4 13 16 6Z', '#B3D4F2') + ell(19.5, 19, 2, 3.4, '#FFFFFF', ' opacity="0.9" transform="rotate(-20 19.5 19)"'));
  p.splash = S(ell(16, 23, 12, 4.6, 'none', ' stroke="#DCEEFF" stroke-width="2.6"') + ell(16, 23, 6.5, 2.2, '#DCEEFF', ' opacity="0.5"') + circ(7, 13, 2, '#E6F3FF') + circ(16, 8, 2.3, '#E6F3FF') + circ(25, 12, 1.8, '#E6F3FF') + strokeP('M10 18L8.5 15.5M22 18L23.6 15.4M16 17V13', '#DCEEFF', 1.8));
  // cherry-blossom petal: notched tip
  p.petal = S(`<g transform="rotate(-15 16 16)">${P('M16 29Q6 24 7 14Q8 6 13 4L16 8L19 4Q24 6 25 14Q26 24 16 29Z', '#F7C9D4', ' stroke="#E2A1B3" stroke-width="1.6" stroke-linejoin="round"')}${P('M16 26Q10 22 11 15Q12 10 14.5 9L16 11Z', '#FFEFF2', ' opacity="0.9"')}${strokeP('M16 12V24', '#EBB2C1', 1.2)}</g>`);
  // autumn leaves, muted: a rounded maple-ish leaf and an oval beech leaf
  const mp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 13; mp.push([16 + Math.cos(a) * r, 15 + Math.sin(a) * r]); }
  p.leaf_a = S(`<g transform="rotate(-18 16 16)"><path d="${poly(mp)}" fill="#D9934F" stroke="#A8662F" stroke-width="2.2" stroke-linejoin="round"/>${P(poly(mp.slice(0, 1).concat(mp.slice(1, 6))), '#C98142', ' opacity="0.55"')}${strokeP('M16 15V30M16 15L9 9M16 15L23 9M16 18L8 20M16 18L24 20', '#A8662F', 1.2)}</g>`);
  p.leaf_b = S(`<g transform="rotate(28 16 16)">${P('M16 2Q26 9 25 18Q23 27 16 29Q9 27 7 18Q6 9 16 2Z', '#BE8D58', ' stroke="#86602F" stroke-width="1.8"')}${P('M16 4Q24 10 23 18Q21 26 16 28Z', '#AE7E4C')}${strokeP('M16 5V31M16 12L11 9M16 12L21 9M16 18L10 15M16 18L22 15M16 23L12 21M16 23L20 21', '#86602F', 1.2)}</g>`);
  // snowflake: soft glow + rounded 6-arm crystal
  let arms = '', twigs = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 11)} ${f(16 + s * 11)}`; const bx = 16 + c * 7, by = 16 + s * 7; for (const d of [-0.7, 0.7]) twigs += `M${f(bx)} ${f(by)}L${f(bx + Math.cos(a + d) * 3.5)} ${f(by + Math.sin(a + d) * 3.5)}`; }
  p.snow = S(circ(16, 16, 15.5, 'url(#sg)') + strokeP(arms + twigs, '#CFE0F2', 4) + strokeP(arms + twigs, '#FFFFFF', 2.2) + circ(16, 16, 3, '#FFFFFF'), rg('sg', [[0, '#FFFFFF', 0.7], [0.5, '#F2F7FC', 0.3], [1, '#F2F7FC', 0]]));
  // tinted-by-code particles (neutral white/grey)
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F2F2F2')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2F2F4', 0.8], [1, '#E4E4EA', 0]]));
  // music notes (white, light grey shade/outline so a tint keeps the form)
  p.note_a = S(`${strokeP('M19.5 23V4.5Q22 9 27 10.5Q29 12 27.5 16', '#D6D6D6', 4.2)}${strokeP('M19.5 23V4.5Q22 9 27 10.5Q29 12 27.5 16', '#FFFFFF', 2.6)}${ell(13.5, 24, 7, 5.2, '#FFFFFF', ' stroke="#D6D6D6" stroke-width="1.6" transform="rotate(-22 13.5 24)"')}${ell(11.6, 22.4, 2.4, 1.3, '#EDEDED', ' transform="rotate(-22 11.6 22.4)"')}`);
  p.note_b = S(`${P('M10.6 8.2L28.4 4V9.4L10.6 13.6Z', '#FFFFFF', ' stroke="#D6D6D6" stroke-width="1.4" stroke-linejoin="round"')}${strokeP('M10.6 24V9M27.4 21V5', '#D6D6D6', 4)}${strokeP('M10.6 24V9M27.4 21V5', '#FFFFFF', 2.4)}${ell(6.6, 24.6, 5.4, 4.2, '#FFFFFF', ' stroke="#D6D6D6" stroke-width="1.5" transform="rotate(-22 6.6 24.6)"')}${ell(23.4, 21.6, 5.4, 4.2, '#FFFFFF', ' stroke="#D6D6D6" stroke-width="1.5" transform="rotate(-22 23.4 21.6)"')}`);
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  return p;
}

// ---------------- write ----------------
function build() {
  const env = { ...genClouds(), sun: genSun(), rainbow: genRainbow(), stage: genStage(), pot: genPot() };
  for (const s of SEASONS) { env['far_' + s] = genFar(s); env['mid_' + s] = genMid(s); env['ground_' + s] = genGround(s); }
  return { env, particles: genParticles() };
}
if (require.main === module) {
  const { env, particles } = build();
  const envD = path.join(A, 'env'), parD = path.join(A, 'particles');
  fs.mkdirSync(envD, { recursive: true }); fs.mkdirSync(parD, { recursive: true });
  for (const old of ['firefly.svg', 'pollen.svg', 'dust.svg']) { try { fs.unlinkSync(path.join(parD, old)); } catch (e) { /* gone */ } }
  for (const [k, v] of Object.entries(env)) fs.writeFileSync(path.join(envD, k + '.svg'), v);
  for (const [k, v] of Object.entries(particles)) fs.writeFileSync(path.join(parD, k + '.svg'), v);
  let bad = 0;
  for (const [k, v] of [...Object.entries(env).map(([k, v]) => ['env/' + k, v]), ...Object.entries(particles).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024, blur = (v.match(/feGaussianBlur/g) || []).length;
    const mm = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/), okBox = mm && mm[1] === mm[3] && mm[2] === mm[4];
    const forb = /<text|<script|href=|@import|font|NaN|undefined/.test(v) || blur > 1;
    if (forb || !okBox || kb > 150) bad++;
    console.log(`${k.padEnd(24)} ${kb.toFixed(1)} KB${kb > 150 ? '  TOO BIG' : ''}${forb ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
  }
  if (bad) { console.error(bad, 'file(s) failed checks'); process.exit(1); }
}
module.exports = { SKY, GROUND, FARFILL, SEASONS, STAGE, POT, pal, build };
