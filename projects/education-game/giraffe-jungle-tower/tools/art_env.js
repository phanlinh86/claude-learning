// Lulu's Jungle Tower: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, stump, branch, vine, sun, moon,
// cloud_a..c  and  game/assets/default/particles/{leaf_a, leaf_b, petal, firefly, pollen, sparkle, star, puff, dust,
// confetti_a, confetti_b}.svg                                                                     (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that crosses the left/right edge of a tileable file is drawn again at x±1200 (wrap()); ridge
// curves are sums of sines with whole-number periods over 1200 px, so the left and right edges match exactly. The vine
// tiles vertically the same way (period 600). The four moods share ONE layout per layer (same seed); only colours change.
// Colour rule (DESIGN §3): calm, desaturated jungle greens so the answer colours (red #E84A4A, blue #3C8DE8, yellow #FFD23F,
// green #4CC26B, orange #FF9A2E, purple #9B6BE0) pop. Far = light misty blue-green, mid = deeper blue-green (darker than the
// answer green), ground = light sage (lighter than the answer green). Each mood = the noon colours mixed towards a mood
// tint, the far layer also hazed towards the sky's bottom colour. The mid layer's front band = GROUND[mood] exactly, so
// mid → ground has no visible seam and the renderer can fill any gap between them with GROUND[mood].
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const TAU = Math.PI * 2;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x, 0); if (x + half > W) o += fn(x - W, 1); if (x - half < 0) o += fn(x + W, 2); return o; }
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lgr = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
// periodic ridge: base + Σ a·sin(2π k x / W + p), k whole numbers
const ridge = (x, base, comps) => comps.reduce((y, [a, k, p]) => y + a * Math.sin(TAU * k * x / W + p), base);

// ---------------- moods ----------------
const SKY = { morning: ['#BFE6F2', '#F4EFD6'], noon: ['#7FC8F0', '#DDF1FB'], sunset: ['#F5A878', '#FBE0A8'], night: ['#1C2650', '#3B4A7A'] };
const MOOD = {
  morning: { tint: '#E2F1EA', amt: { far: 0.26, mid: 0.10, ground: 0.05 }, haze: 0.30 },
  noon: { tint: '#FFFFFF', amt: { far: 0, mid: 0, ground: 0 }, haze: 0.24 },
  sunset: { tint: '#E39A6E', amt: { far: 0.24, mid: 0.16, ground: 0.13 }, haze: 0.22 },
  night: { tint: '#1B3352', tintL: { ground: '#1D4E5C', mid: '#173E52' }, amt: { far: 0.50, mid: 0.56, ground: 0.44 }, haze: 0.18 },
};
const BASE = {
  far: { back: '#86B39C', backSh: '#78A68F', tree: '#7DAA94', treeSh: '#6F9C87', midB: '#6E9F86', midSh: '#618F78', midHi: '#82B298', front: '#5E9178', frontSh: '#51836B', frontHi: '#71A487', mist: '#EAF4F0' },
  mid: { crown: '#4C8662', crownSh: '#3D7456', crownHi: '#62A078', trunk: '#7A6352', trunkSh: '#624E41', trunkHi: '#917A66', liana: '#5E7D4A', lianaSh: '#4B6A3B', leaf: '#5A9868', leafSh: '#478458', vein: '#3D7350', bush: '#548F64', bushSh: '#457D56', bushHi: '#69A578', fern: '#68A270', fernSh: '#558F62' },
  ground: { base: '#A6C788', hi: '#B8D59B', rim: '#8CB273', tuft: '#95B97B', low: '#9ABD7F', stone: '#B4B2A4', stoneSh: '#9A988C', stoneHi: '#CFCDC0', moss: '#93B776', fern: '#77AD75', fernSh: '#629965', petalA: '#E8AE9C', petalB: '#F3E5C6', centre: '#E2C47E' },
};
function pal(m, layer) {
  const M = MOOD[m], o = {};
  for (const [k, v] of Object.entries(BASE[layer])) {
    let c = mix(v, (M.tintL && M.tintL[layer]) || M.tint, M.amt[layer]);
    if (layer === 'far') c = mix(c, SKY[m][1], M.haze);
    o[k] = c;
  }
  // night: flowers stay a touch brighter so the clearing still feels friendly
  if (m === 'night' && layer === 'ground') { o.petalA = mix(BASE.ground.petalA, M.tint, 0.32); o.petalB = mix(BASE.ground.petalB, M.tint, 0.3); }
  return o;
}
const GROUND = Object.fromEntries(MOODS.map(m => [m, pal(m, 'ground').base]));
// colour of the far layer's bottom row (front canopy under the mist) — safety fill below the far tile
const FARFILL = Object.fromEntries(MOODS.map(m => { const c = pal(m, 'far'); return [m, mix(c.front, c.mist, m === 'night' ? 0.1 : 0.4)]; }));

// ---------------- shared plant shapes ----------------
// lens leaf from (x,y) pointing at angle a (deg), length L, half-width w; lower half shaded, midrib
function leaf(x, y, L, a, w, col, sh, vein) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">${P(`M0 0Q${f(L * 0.32)} ${f(-w * 1.25)} ${f(L)} 0Q${f(L * 0.32)} ${f(w * 1.25)} 0 0Z`, col)}${P(`M0 0Q${f(L * 0.4)} ${f(w * 0.2)} ${f(L)} 0Q${f(L * 0.32)} ${f(w * 1.25)} 0 0Z`, sh)}${vein ? strokeP(`M${f(L * 0.04)} 0Q${f(L * 0.5)} ${f(-w * 0.12)} ${f(L * 0.9)} 0`, vein, Math.max(1.2, w * 0.12)) : ''}</g>`;
}
// fern frond: from base (x,y), angle a (deg, 0 = right), length L, curl c (bend), leaflets both sides shrinking to the tip
function frond(x, y, L, a, c, col, sh) {
  let o = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">`;
  const pt = t => [L * t, c * L * t * t];
  o += strokeP(`M0 0Q${f(L * 0.5)} 0 ${f(L)} ${f(c * L)}`, sh, Math.max(1.6, L * 0.035));
  const n = Math.max(5, Math.round(L / 11));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), [px, py] = pt(t), s = (1 - t * 0.7) * L * 0.27, ang = Math.atan2(2 * c * L * t, L) * 180 / Math.PI;
    for (const side of [-1, 1]) {
      const la = ang + side * 58;
      o += `<g transform="translate(${f(px)} ${f(py)}) rotate(${f(la)})">${P(`M0 0Q${f(s * 0.4)} ${f(-s * 0.4)} ${f(s)} 0Q${f(s * 0.4)} ${f(s * 0.4)} 0 0Z`, side < 0 ? col : sh)}</g>`;
    }
  }
  return o + '</g>';
}
function puffCluster(cs, col, sh, hi, shOff = [5, 7]) {
  // cs: [[x,y,r]...]  shade copy (offset down-right), body, small highlights on upper-left
  let o = P(cs.map(([x, y, r]) => cp(x + shOff[0], y + shOff[1], r)).join(''), sh);
  o += P(cs.map(([x, y, r]) => cp(x, y, r)).join(''), col);
  if (hi) o += P(cs.filter((c, i) => i % 2 === 0).map(([x, y, r]) => cp(x - r * 0.3, y - r * 0.34, r * 0.42)).join(''), hi, ' opacity="0.55"');
  return o;
}

// ================= far_<m>.svg (0 0 1200 420): misty canopy + distant emergent trees =================
function farLayout() {
  const r = rng(101);
  const emerg = [], back = [], mid = [], front = [];
  for (let i = 0; i < 6; i++) emerg.push({ x: i * 200 + 50 + r() * 100, top: 92 + r() * 50, cw: 56 + r() * 30, tw: 7 + r() * 4 });
  const R1 = [[16, 2, 0.4], [10, 3, 2.1], [6, 7, 1.0]], R2 = [[14, 2, 2.6], [9, 5, 0.3], [5, 9, 1.7]], R3 = [[10, 3, 1.2], [7, 4, 2.9], [4, 11, 0.6]];
  for (let x = 0; x < W; x += 30) back.push([x + (r() - 0.5) * 10, 0, 30 + r() * 20]);
  for (let x = 12; x < W; x += 34) mid.push([x + (r() - 0.5) * 12, 0, 32 + r() * 22]);
  for (let x = 6; x < W; x += 38) front.push([x + (r() - 0.5) * 14, 0, 34 + r() * 22]);
  back.forEach(c => { c[1] = ridge(c[0], 196, R1) + c[2] * 0.55; });
  mid.forEach(c => { c[1] = ridge(c[0], 262, R2) + c[2] * 0.55; });
  front.forEach(c => { c[1] = ridge(c[0], 326, R3) + c[2] * 0.6; });
  return { emerg, back, mid, front, R1, R2, R3 };
}
const FAR = farLayout();
function canopyBand(cs, fillTop, col, sh, hi, h) {
  let o = P(`M0 ${fillTop}H${W}V${h}H0Z`, col);
  // wrapped clumps
  const all = []; for (const c of cs) { all.push(c); if (c[0] + c[2] + 8 > W) all.push([c[0] - W, c[1], c[2]]); if (c[0] - c[2] - 8 < 0) all.push([c[0] + W, c[1], c[2]]); }
  return puffCluster(all, col, sh, hi, [4, 6]) + o;
}
function genFar(m) {
  const C = pal(m, 'far'), L = FAR;
  let o = '', defs = '';
  // emergent trees (behind everything): thin trunk + flat umbrella crown
  for (const t of L.emerg) {
    o += wrap(t.x, t.cw + 10, x => {
      let s = P(`M${f(x - t.tw)} 330L${f(x - t.tw * 0.5)} ${f(t.top + 30)}H${f(x + t.tw * 0.5)}L${f(x + t.tw)} 330Z`, C.treeSh);
      const cw = t.cw, cs = [[x - cw * 0.5, t.top + 30, cw * 0.32], [x + cw * 0.5, t.top + 32, cw * 0.3], [x - cw * 0.18, t.top + 8, cw * 0.38], [x + cw * 0.22, t.top + 12, cw * 0.36], [x, t.top + 36, cw * 0.36]];
      s += puffCluster(cs, C.tree, C.treeSh, null, [3, 5]);
      return s;
    });
  }
  o += canopyBand(L.back, 230, C.back, C.backSh, null, 420);
  defs += lgr('m1', [[0, C.mist, 0], [1, C.mist, m === 'night' ? 0.10 : 0.38]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="215" width="${W}" height="80" fill="url(#m1)"/>`;
  o += canopyBand(L.mid, 296, C.midB, C.midSh, C.midHi, 420);
  o += `<rect x="0" y="285" width="${W}" height="70" fill="url(#m1)"/>`;
  o += canopyBand(L.front, 362, C.front, C.frontSh, C.frontHi, 420);
  // soft mist at the foot (the mid layer covers the bottom anyway)
  defs += lgr('m2', [[0, C.mist, 0], [1, C.mist, m === 'night' ? 0.12 : 0.45]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="350" width="${W}" height="70" fill="url(#m2)"/>`;
  return svg(1200, 420, o, defs);
}

// ================= mid_<m>.svg (0 0 1200 380): big trees, lianas, banana plants, ferns, bushes =================
function midLayout() {
  const r = rng(202);
  const trees = [{ x: 120, w: 44, top: 46, cw: 150 }, { x: 545, w: 54, top: 26, cw: 175 }, { x: 930, w: 40, top: 60, cw: 140 }];
  for (const t of trees) {
    t.crown = [];
    for (let j = 0; j < 16; j++) { const a = r() * TAU, d = Math.sqrt(r()); t.crown.push([t.x + Math.cos(a) * d * t.cw * 0.78, t.top + 62 + Math.sin(a) * d * 46, 28 + r() * 22]); }
    t.crown.sort((a, b) => a[1] - b[1]);
  }
  const vines = [];
  for (const t of trees) for (let k = 0; k < 2; k++) vines.push({ x: t.x + (k ? 1 : -1) * t.cw * (0.35 + r() * 0.3), y0: t.top + 90, len: 90 + r() * 110, sway: (r() - 0.5) * 22 });
  const bush = []; for (let x = 0; x < W; x += 40) bush.push([x + (r() - 0.5) * 16, 0, 30 + r() * 18]);
  const BR = [[10, 3, 0.9], [7, 5, 2.4], [4, 8, 0.2]];
  bush.forEach(c => { c[1] = ridge(c[0], 318, BR) + c[2] * 0.5; });
  const bananas = [{ x: 330, s: 1.0 }, { x: 760, s: 0.86 }, { x: 1110, s: 0.92 }];
  const ferns = []; for (let i = 0; i < 9; i++) ferns.push({ x: i * 133 + 40 + r() * 60, s: 0.75 + r() * 0.4, flip: r() < 0.5 });
  return { trees, vines, bush, BR, bananas, ferns };
}
const MID = midLayout();
const frontEdge = x => ridge(x, 352, [[4, 2, 1.3], [3, 5, 0.4], [1.5, 9, 2.0]]);
function genMid(m) {
  const C = pal(m, 'mid'), G = pal(m, 'ground'), L = MID;
  let o = '';
  // lianas draped between neighbouring crowns (drawn first: behind the crowns)
  for (let i = 0; i < L.trees.length; i++) {
    const a = L.trees[i], b = L.trees[(i + 1) % L.trees.length], bx = b.x + (i === L.trees.length - 1 ? W : 0);
    const x0 = a.x + a.cw * 0.45, y0 = a.top + 96, x1 = bx - b.cw * 0.45, y1 = b.top + 96, mx = (x0 + x1) / 2, sag = 70 + (i * 23) % 40;
    const span = x1 - x0;
    o += wrap(x0 + span / 2, span / 2 + 20, dx => {
      const sx = dx - (x0 + span / 2);
      let s = strokeP(`M${f(x0 + sx)} ${f(y0)}Q${f(mx + sx)} ${f((y0 + y1) / 2 + sag * 2)} ${f(x1 + sx)} ${f(y1)}`, C.lianaSh, 7);
      s += strokeP(`M${f(x0 + sx)} ${f(y0 - 1.5)}Q${f(mx + sx)} ${f((y0 + y1) / 2 + sag * 2 - 1.5)} ${f(x1 + sx)} ${f(y1 - 1.5)}`, C.liana, 4);
      s += strokeP(`M${f(x0 + sx + 20)} ${f(y0 + 8)}Q${f(mx + sx - 10)} ${f((y0 + y1) / 2 + sag * 1.4)} ${f(x1 + sx - 30)} ${f(y1 + 14)}`, C.lianaSh, 4, ' opacity="0.8"');
      for (let k = 1; k < 6; k++) { const t = k / 6, px = (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * mx + t * t * x1 + sx, py = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * ((y0 + y1) / 2 + sag * 2) + t * t * y1; s += leaf(px, py, 18, 70 + k * 37 % 60, 6, C.leaf, C.leafSh, null); }
      return s;
    });
  }
  // trees: trunk with buttress flare, a couple of limbs, crown clumps
  for (const t of L.trees) {
    o += wrap(t.x, t.cw + 60, x => {
      const w = t.w, ty = t.top + 70;
      let s = P(`M${f(x - w * 1.5)} 380Q${f(x - w * 0.55)} 350 ${f(x - w * 0.5)} 300L${f(x - w * 0.36)} ${f(ty)}H${f(x + w * 0.36)}L${f(x + w * 0.5)} 300Q${f(x + w * 0.55)} 350 ${f(x + w * 1.5)} 380Z`, C.trunk);
      s += P(`M${f(x + w * 0.08)} 380Q${f(x + w * 0.18)} 330 ${f(x + w * 0.12)} 300L${f(x + w * 0.1)} ${f(ty)}H${f(x + w * 0.36)}L${f(x + w * 0.5)} 300Q${f(x + w * 0.55)} 350 ${f(x + w * 1.5)} 380Z`, C.trunkSh);
      s += strokeP(`M${f(x - w * 0.2)} ${f(ty + 30)}Q${f(x - w * 0.26)} ${f(ty + 110)} ${f(x - w * 0.16)} 300M${f(x - w * 0.02)} ${f(ty + 60)}L${f(x)} ${f(ty + 150)}`, C.trunkHi, 2.4, ' opacity="0.7"');
      s += strokeP(`M${f(x - w * 0.2)} ${f(ty + 10)}Q${f(x - t.cw * 0.3)} ${f(ty - 10)} ${f(x - t.cw * 0.55)} ${f(ty - 30)}M${f(x + w * 0.2)} ${f(ty + 4)}Q${f(x + t.cw * 0.3)} ${f(ty - 14)} ${f(x + t.cw * 0.5)} ${f(ty - 36)}`, C.trunk, w * 0.32);
      const dx = x - t.x;
      s += puffCluster(t.crown.map(([a, b, rr]) => [a + dx, b, rr]), C.crown, C.crownSh, C.crownHi, [6, 9]);
      return s;
    });
  }
  // hanging vines from crowns
  for (const v of L.vines) o += wrap(v.x, 30, x => {
    let s = strokeP(`M${f(x)} ${f(v.y0)}Q${f(x + v.sway)} ${f(v.y0 + v.len * 0.6)} ${f(x + v.sway * 0.4)} ${f(v.y0 + v.len)}`, C.liana, 3.2);
    for (let k = 1; k <= 4; k++) { const t = k / 5; s += leaf(x + v.sway * t * 0.9, v.y0 + v.len * t, 15, k % 2 ? 40 : 140, 5.5, C.leaf, C.leafSh, null); }
    return s;
  });
  // banana plants (tall stalk + 5 big drooping leaves)
  for (const b of L.bananas) o += wrap(b.x, 140 * b.s, x => {
    const s = b.s, top = 210 - 30 * s;
    let q = P(`M${f(x - 8 * s)} 360Q${f(x - 6 * s)} ${f(top + 60)} ${f(x - 3 * s)} ${f(top)}H${f(x + 3 * s)}Q${f(x + 6 * s)} ${f(top + 60)} ${f(x + 8 * s)} 360Z`, C.fernSh);
    for (const [a, L2, w2] of [[-160, 120, 22], [-128, 110, 21], [-62, 116, 22], [-22, 122, 21], [-95, 92, 19]]) q += leaf(x, top + 8, L2 * s, a, w2 * s, C.leaf, C.leafSh, C.vein);
    return q;
  });
  // bush band
  const all = []; for (const c of L.bush) { all.push(c); if (c[0] + c[2] + 8 > W) all.push([c[0] - W, c[1], c[2]]); if (c[0] - c[2] - 8 < 0) all.push([c[0] + W, c[1], c[2]]); }
  o += puffCluster(all, C.bush, C.bushSh, C.bushHi, [4, 6]) + P(`M0 330H${W}V380H0Z`, C.bush);
  // ferns poking up from the bush band
  for (const fe of L.ferns) o += wrap(fe.x, 70 * fe.s, x => {
    let q = '';
    for (const [a, L2, c] of [[-150, 58, -0.25], [-118, 66, -0.18], [-62, 66, 0.18], [-30, 58, 0.25], [-90, 54, 0.05]]) q += frond(x, 350, L2 * fe.s, fe.flip ? -180 - a : a, fe.flip ? -c : c, C.fern, C.fernSh);
    return q;
  });
  // front band = the ground colour (seamless into ground_<m>)
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, frontEdge(x)]);
  o += P(line(pts) + `L${W} 380L0 380Z`, G.base) + strokeP(line(pts), G.rim, 2.5, ' opacity="0.8"');
  return svg(1200, 380, o);
}

// ================= ground_<m>.svg (0 0 1200 260): the clearing =================
const edgeY = x => ridge(x, 40, [[6, 2, 0.7], [4, 3, 1.9], [2, 7, 0.3]]);
function groundLayout() {
  const r = rng(303);
  const fringe = []; for (let x = 4; x < W; x += 13) fringe.push({ x: x + (r() - 0.5) * 6, h: 6 + r() * 7, l: r() < 0.5 });
  const ferns = [{ x: 70, s: 0.9 }, { x: 430, s: 0.75 }, { x: 760, s: 0.95 }, { x: 1050, s: 0.7 }];
  const stones = [{ x: 250, rx: 22, ry: 11 }, { x: 590, rx: 15, ry: 8 }, { x: 905, rx: 26, ry: 12 }];
  const flowers = [];
  for (const fx of [140, 330, 515, 690, 850, 990, 1150]) flowers.push({ x: fx + (r() - 0.5) * 40, v: r() * 14, c: Math.floor(r() * 2), s: 0.85 + r() * 0.35 });
  for (const fx of [60, 380, 640, 980]) flowers.push({ x: fx + (r() - 0.5) * 60, v: 186 + r() * 40, c: Math.floor(r() * 2), s: 0.8 + r() * 0.3, low: true });
  const tufts = []; for (let i = 0; i < 26; i++) tufts.push({ x: r() * W, y: 70 + r() * 175, s: 0.7 + r() * 0.5 });
  return { fringe, ferns, stones, flowers, tufts };
}
const GRD = groundLayout();
function tuft(x, y, s, col) {
  return strokeP(`M${f(x - 7 * s)} ${f(y - 7 * s)}Q${f(x - 3 * s)} ${f(y - 2 * s)} ${f(x - 1 * s)} ${f(y)}M${f(x)} ${f(y - 11 * s)}L${f(x)} ${f(y)}M${f(x + 7 * s)} ${f(y - 8 * s)}Q${f(x + 3 * s)} ${f(y - 2 * s)} ${f(x + 1 * s)} ${f(y)}`, col, 2.4 * s);
}
function flower(x, y, s, petal, centre, sh) {
  let q = ''; for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; q += cp(x + Math.cos(a) * 4.4 * s, y + Math.sin(a) * 4.4 * s, 3.6 * s); }
  return P(q, sh, ` transform="translate(1 1.5)"`) + P(q, petal) + circ(x, y, 2.4 * s, centre);
}
function genGround(m) {
  const C = pal(m, 'ground'), M = pal(m, 'mid'), L = GRD;
  let o = '', defs = '';
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, edgeY(x)]);
  o += P(line(pts) + `L${W} 260L0 260Z`, C.base);
  // soft light band under the edge
  o += P(poly([...pts.map(([x, y]) => [x, y + 4]), ...pts.map(([x, y]) => [x, y + 30]).reverse()]), C.hi, ' opacity="0.6"');
  // a very gentle darker band at the very front (depth), calm in the middle where blocks rest
  defs += lgr('gd', [[0, C.low, 0], [1, C.low, 0.9]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="200" width="${W}" height="60" fill="url(#gd)"/>`;
  for (const [px, py, rx, ry, k] of [[160, 120, 150, 26, 'hi'], [520, 170, 190, 30, 'low'], [860, 110, 170, 22, 'hi'], [1080, 200, 160, 26, 'low'], [330, 225, 140, 18, 'hi']])
    o += wrap(px, rx, x => ell(x, py, rx, ry, C[k], ' opacity="0.45"'));
  // ferns behind the edge (they poke up above the grass line)
  for (const fe of L.ferns) o += wrap(fe.x, 60, x => {
    const y = edgeY(x) + 6; let q = '';
    for (const [a, L2, c] of [[-158, 44, -0.25], [-125, 50, -0.2], [-58, 50, 0.2], [-24, 44, 0.25], [-92, 40, 0.04]]) q += frond(x, y, L2 * fe.s, a, c, C.fern, C.fernSh);
    return q;
  });
  // grass fringe + rim
  let fr = '';
  for (const b of L.fringe) { const y = edgeY(b.x) + 2; fr += wrap(b.x, 6, xx => `M${f(xx - 4)} ${f(y)}Q${f(xx + (b.l ? -2 : 2))} ${f(y - b.h * 0.6)} ${f(xx + (b.l ? -3 : 3))} ${f(y - b.h)}Q${f(xx + (b.l ? 1 : -1))} ${f(y - b.h * 0.4)} ${f(xx + 4)} ${f(y)}Z`); }
  o += P(fr, C.base) + strokeP(line(pts), C.rim, 2.5, ' opacity="0.7"');
  // mossy stones near the edge
  for (const s of L.stones) o += wrap(s.x, s.rx + 4, x => {
    const y = edgeY(x) + 20;
    return ell(x, y + s.ry * 0.6, s.rx * 1.1, s.ry * 0.35, C.rim, ' opacity="0.5"') + ell(x, y, s.rx, s.ry, C.stone) + P(`M${f(x - s.rx * 0.95)} ${f(y + 1)}Q${f(x)} ${f(y + s.ry * 1.3)} ${f(x + s.rx * 0.95)} ${f(y + 1)}Q${f(x)} ${f(y + s.ry * 0.6)} ${f(x - s.rx * 0.95)} ${f(y + 1)}Z`, C.stoneSh) +
      ell(x - s.rx * 0.35, y - s.ry * 0.4, s.rx * 0.32, s.ry * 0.22, C.stoneHi, ' opacity="0.8"') + P(`M${f(x - s.rx * 0.2)} ${f(y - s.ry * 0.85)}Q${f(x + s.rx * 0.3)} ${f(y - s.ry * 1.25)} ${f(x + s.rx * 0.8)} ${f(y - s.ry * 0.5)}Q${f(x + s.rx * 0.3)} ${f(y - s.ry * 0.6)} ${f(x - s.rx * 0.2)} ${f(y - s.ry * 0.85)}Z`, C.moss);
  });
  // low-contrast tufts (sparse in the middle band where blocks rest)
  for (const t of L.tufts) { const y = Math.max(edgeY(t.x) + 34, t.y); o += wrap(t.x, 10, xx => tuft(xx, y, t.s, C.tuft)); }
  // a few soft flowers along the edge and the front
  for (const fl of L.flowers) o += wrap(fl.x, 12, x => {
    const y = fl.low ? fl.v : edgeY(x) + 8 + fl.v;
    return strokeP(`M${f(x)} ${f(y)}l0 ${f(8 * fl.s)}`, C.fernSh, 1.8) + flower(x, y, fl.s, fl.c ? C.petalB : C.petalA, C.centre, C.rim);
  });
  void M;
  return svg(1200, 260, o, defs);
}

// ================= stump.svg (0 0 240 120, anchor bottom-centre (120,116), cut top at y = 18, x 30–210) =================
function genStump() {
  const c = { bark: '#8B5E3C', barkSh: '#734A2D', barkHi: '#A2724C', ln: '#5E3D25', top: '#D9B27C', topSh: '#C89D66', ring: '#B88A57', root: '#7D5334', moss: '#8DB06A', mossSh: '#729A55', mossHi: '#A6C682' };
  let o = ell(120, 114, 108, 6, '#000000', ' opacity="0.12"');
  // roots
  const roots = 'M44 92Q26 104 8 114Q30 117 56 112ZM196 92Q214 104 232 114Q210 117 184 112ZM78 104Q70 112 62 117H94ZM160 104Q170 112 180 117H146Z';
  o += P(roots, c.root, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  // body (slightly wider at the bottom)
  const body = 'M30 18L33 70Q34 96 40 110Q120 120 200 110Q206 96 207 70L210 18Z';
  o += P(body, c.bark, ` stroke="${c.ln}" stroke-width="4" stroke-linejoin="round"`);
  o += P('M160 26L176 26Q186 60 200 70Q201 96 196 108Q178 112 160 113Q166 70 160 26Z', c.barkSh);
  o += P('M44 30Q42 60 48 100L56 100Q50 64 54 30Z', c.barkHi, ' opacity="0.7"');
  o += strokeP('M72 34Q70 64 74 100M104 36Q102 70 106 108M138 34Q140 66 136 106M182 40Q186 70 182 102', c.barkSh, 2.6);
  o += strokeP('M88 50L92 62M122 72L119 84', c.ln, 2, ' opacity="0.6"');
  // flat cut top + rings
  o += ell(120, 18, 90, 11, c.top, ` stroke="${c.ln}" stroke-width="3.5"`);
  o += P('M32 20Q120 38 208 20Q206 26 200 27Q120 36 40 27Q34 26 32 20Z', c.topSh, ' opacity="0.9"');
  for (const [rx, ry] of [[70, 8.2], [50, 5.8], [30, 3.6]]) o += ell(121, 17.6, rx, ry, 'none', ` stroke="${c.ring}" stroke-width="2"`);
  o += ell(122, 17.5, 8, 1.8, c.ring) + strokeP('M122 18L150 13', c.ring, 1.6);
  // moss on the rim and roots
  o += P('M30 17Q36 8 48 10Q56 6 64 10Q58 14 52 13Q44 18 38 22Q32 22 30 17Z', c.moss, ` stroke="${c.mossSh}" stroke-width="2" stroke-linejoin="round"`);
  o += P('M36 32Q34 44 38 52Q42 44 46 34Z', c.mossSh);
  o += P('M186 12Q196 8 208 15Q210 21 204 23Q198 18 190 17Z', c.moss, ` stroke="${c.mossSh}" stroke-width="2" stroke-linejoin="round"`);
  o += P('M10 113Q18 106 28 108Q34 104 42 109Q30 114 10 113ZM198 108Q210 104 222 110Q228 112 232 114Q212 115 198 108Z', c.moss);
  o += circ(44, 10, 2.6, c.mossHi) + circ(200, 14, 2.2, c.mossHi);
  return svg(240, 120, o);
}

// ================= branch.svg (0 0 600 160): leafy branch from the right edge, banana stem at (110,140) =================
function genBranch() {
  const c = { bark: '#866043', barkSh: '#6C4C34', barkHi: '#A07A58', ln: '#5A3B26', leaf: '#5E9C6A', leafSh: '#4A8658', leafHi: '#77B07E', vein: '#3D7350', leaf2: '#6BA872', leaf2Sh: '#56936A', moss: '#8DB06A' };
  let o = '';
  const r = rng(404);
  // back leaves (behind the branch), only right of x 180 or above y 70 near the stem so the bananas hang free
  for (let i = 0; i < 12; i++) {
    const x = 200 + i * 34 + r() * 16, y = 70 - (x - 200) * 0.06 + r() * 10, a = -150 + r() * 120;
    o += leaf(x, y, 46 + r() * 22, a, 14, c.leaf2, c.leaf2Sh, null);
  }
  // main branch
  o += P('M600 30C470 36 300 66 170 94Q100 108 52 104Q38 104 36 110Q38 118 54 118Q110 124 170 118C310 104 470 96 600 94Z', c.bark, ` stroke="${c.ln}" stroke-width="4" stroke-linejoin="round"`);
  o += P('M600 74C470 80 320 96 170 110Q110 117 56 116Q110 124 170 118C310 104 470 96 600 94Z', c.barkSh);
  o += strokeP('M560 42C460 50 330 72 220 92', c.barkHi, 3, ' opacity="0.7"');
  o += strokeP('M520 62Q480 66 450 70M380 80Q350 84 320 88M260 96Q240 99 222 101', c.barkSh, 2.4);
  // a side twig going up-left
  o += strokeP('M300 78Q262 46 236 24', c.bark, 9) + strokeP('M300 78Q262 46 236 24', c.ln, 2, ' opacity="0.5"');
  // the banana stem: a little knot + twig down to (110,140)
  o += P('M98 116Q110 112 122 116L116 124H104Z', c.bark, ` stroke="${c.ln}" stroke-width="3" stroke-linejoin="round"`);
  o += strokeP('M110 118L110 140', c.ln, 9) + strokeP('M110 118L110 139', c.bark, 5);
  // moss patches on the branch
  o += P('M400 50Q420 40 446 46Q440 54 418 54Z', c.moss) + P('M150 98Q166 90 184 94Q176 101 160 102Z', c.moss);
  // front leaves: clusters on top and drooping below the branch (right part)
  const front = [[236, 24, -120, 54], [236, 24, -60, 50], [236, 24, -165, 44], [330, 70, -100, 58], [420, 58, -70, 52], [500, 48, -115, 56], [560, 40, -60, 50],
    [360, 92, 110, 50], [450, 88, 70, 54], [530, 86, 120, 48], [580, 84, 80, 44], [270, 100, 100, 42], [150, 104, -130, 40], [92, 106, -150, 36], [170, 98, -70, 38]];
  for (const [x, y, a, L] of front) o += leaf(x, y, L, a, L * 0.3, c.leaf, c.leafSh, c.vein);
  // highlights on a few top leaves
  for (const [x, y, a] of [[236, 24, -120], [420, 58, -70], [500, 48, -115]]) o += `<g transform="translate(${x} ${y}) rotate(${a})">${ell(26, -4, 10, 3, c.leafHi, ' opacity="0.7"')}</g>`;
  // a small curling tendril
  o += strokeP('M64 106Q46 96 50 84Q56 76 62 84Q64 90 58 90', c.leafSh, 2.6);
  return svg(600, 160, o);
}

// ================= vine.svg (0 0 40 600): hanging liana, vertically tileable =================
function genVine() {
  const c = { stem: '#5E7D4A', stemSh: '#4B6A3B', stemHi: '#7A9A62', leaf: '#5E9C6A', leafSh: '#4A8658', vein: '#3D7350' };
  const xAt = y => 20 + 5 * Math.sin(TAU * 2 * y / 600 + 0.6) + 2 * Math.sin(TAU * 5 * y / 600);
  const pts = []; for (let y = -10; y <= 610; y += 10) pts.push([xAt(y), y]);
  let o = strokeP(line(pts), c.stemSh, 7) + strokeP(line(pts.map(([x, y]) => [x - 1.2, y])), c.stem, 4.4) + strokeP(line(pts.map(([x, y]) => [x - 2, y])), c.stemHi, 1.4, ' opacity="0.8"');
  for (let i = 0; i < 8; i++) {
    const y = 40 + i * 72, x = xAt(y), side = i % 2 ? 1 : -1;
    o += leaf(x, y, 15, side > 0 ? 30 : 150, 5.5, c.leaf, c.leafSh, c.vein);
  }
  // little spiral wraps around the stem
  for (let i = 0; i < 4; i++) { const y = 76 + i * 150, x = xAt(y); o += strokeP(`M${f(x - 4)} ${f(y - 3)}Q${f(x)} ${f(y + 3)} ${f(x + 4)} ${f(y - 1)}`, c.stemSh, 1.8); }
  return svg(40, 600, o);
}

// ================= sun, moon, clouds =================
function genSun() {
  const defs = rg('glow', [[0, '#FFF6D4', 0.9], [0.45, '#FFEFC0', 0.42], [1, '#FFEFC0', 0]]) + rg('disc', [[0, '#FFFBE6'], [0.7, '#FFF0BC'], [1, '#FBE19C']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 90; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEDB8', 10, ' opacity="0.85"');
  o += circ(100, 100, 55, '#F4DC9C') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genMoon() {
  const defs = rg('mg', [[0, '#E9EEFF', 0.55], [0.5, '#C9D4F5', 0.22], [1, '#C9D4F5', 0]]) + rg('md', [[0, '#FFFCEB'], [0.75, '#F3EDCF'], [1, '#E4DCB6']], ' cx="0.42" cy="0.4" r="0.65"');
  let o = circ(100, 100, 100, 'url(#mg)');
  o += circ(100, 100, 50, '#DCD3AC') + circ(100, 100, 47, 'url(#md)');
  o += circ(118, 86, 9, '#E6DDB9') + circ(86, 118, 7, '#E6DDB9') + circ(120, 122, 5, '#E6DDB9') + circ(80, 92, 4, '#E9E1C0');
  o += ell(84, 78, 13, 8, '#FFFFFF', ' opacity="0.6" transform="rotate(-30 84 78)"');
  return svg(200, 200, o, defs);
}
const CL = { base: '#FFFFFF', sh: '#EEF2F6', sh2: '#E1E8EF' };
function genCloud(puffs, bottom, x0, x1) {
  const hb = 34, d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.sh2}" opacity="0.92"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.sh}" transform="translate(0 -7)"/><path d="${d}" fill="${CL.base}" transform="translate(-3 -15)"/></g>`;
  return svg(320, 170, o);
}
const genClouds = () => ({
  cloud_a: genCloud([[70, 110, 32], [124, 86, 44], [186, 78, 50], [242, 104, 36], [160, 116, 34]], 150, 30, 290),
  cloud_b: genCloud([[56, 120, 24], [98, 104, 34], [150, 100, 38], [204, 106, 30], [254, 120, 22]], 146, 30, 290),
  cloud_c: genCloud([[84, 106, 36], [142, 74, 52], [204, 88, 42], [248, 114, 28], [130, 118, 32]], 152, 40, 286),
});

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.leaf_a = S(`<g transform="rotate(-25 16 16)">${P('M16 2Q27 9 26 18Q24 27 16 30Q8 27 6 18Q5 9 16 2Z', '#7DB86E', ' stroke="#4E8A50" stroke-width="1.8"')}${P('M16 4Q25 10 24 18Q22 26 16 29Z', '#69A65E')}${strokeP('M16 5V30M16 13L11 9M16 13L21 9M16 20L10 16M16 20L22 16', '#4E8A50', 1.3)}</g>`);
  // a rounded heart-shaped jungle leaf with a little stem
  p.leaf_b = S(`<g transform="rotate(18 16 16)">${P('M16 28Q5 22 4 13Q4 5 11 5Q14 5 16 9Q18 5 21 5Q28 5 28 13Q27 22 16 28Z', '#5FA06A', ' stroke="#3E7A4C" stroke-width="1.8" stroke-linejoin="round"')}${P('M16 9Q18 5 21 5Q28 5 28 13Q27 22 16 28Z', '#4F8F5B')}${strokeP('M16 9V31M16 16L10 12M16 16L22 12M16 22L11 19M16 22L21 19', '#3E7A4C', 1.2)}${ell(10, 10, 3, 1.6, '#8BC48F', ' opacity="0.8" transform="rotate(-35 10 10)"')}</g>`);
  p.petal = S(P('M16 3Q26 9 25 19Q23 28 16 29Q9 28 7 19Q6 9 16 3Z', '#F2B3A0', ' stroke="#D88E7C" stroke-width="1.6"') + P('M16 8Q21 12 20 19Q19 24 16 25Q13 24 12 19Q11 12 16 8Z', '#FBE4D3') + P('M16 3Q14 7 16 9Q18 7 16 3Z', '#D88E7C'));
  p.firefly = S(circ(16, 16, 15.5, 'url(#ff)') + circ(16, 16, 5, '#F6FFC4') + circ(16, 16, 2.6, '#FFFFFF'), rg('ff', [[0, '#F3FFAE', 0.95], [0.3, '#D9F28A', 0.55], [0.65, '#B8E07A', 0.18], [1, '#B8E07A', 0]]));
  p.pollen = S(circ(16, 16, 12, 'url(#pl)') + circ(16, 16, 3.4, '#FFF9E2') + circ(15, 15, 1.4, '#FFFFFF'), rg('pl', [[0, '#FFF3C4', 0.85], [0.45, '#FFF0BE', 0.35], [1, '#FFF0BE', 0]]));
  // tinted-by-code particles (neutral white/grey)
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F2F2F2')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2F2F4', 0.8], [1, '#E4E4EA', 0]]));
  p.dust = S(circ(16, 16, 9, 'url(#ds)') + circ(16, 16, 3.2, '#FFFFFF'), rg('ds', [[0, '#FFFFFF', 0.9], [0.45, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  return p;
}

// ---------------- write ----------------
function build() {
  const env = { ...genClouds(), sun: genSun(), moon: genMoon(), stump: genStump(), branch: genBranch(), vine: genVine() };
  for (const m of MOODS) { env['far_' + m] = genFar(m); env['mid_' + m] = genMid(m); env['ground_' + m] = genGround(m); }
  return { env, particles: genParticles() };
}
if (require.main === module) {
  const { env, particles } = build();
  const envD = path.join(A, 'env'), parD = path.join(A, 'particles');
  fs.mkdirSync(envD, { recursive: true }); fs.mkdirSync(parD, { recursive: true });
  for (const old of ['seed.svg', 'snow.svg']) { try { fs.unlinkSync(path.join(parD, old)); } catch (e) { /* gone */ } }
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
module.exports = { SKY, MOOD, GROUND, FARFILL, MOODS, pal, build };
