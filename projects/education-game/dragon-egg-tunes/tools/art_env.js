// Rio's Dragon Egg Tunes: DINOSAUR VALLEY environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, env/{sun,moon,cloud_a,cloud_b,rainbow}.svg
// and game/assets/default/particles/{mist,mote,sparkle,star,ember,firefly,leaf,butterfly,confetti_a,confetti_b,dot,dust,note}.svg;
// any other (old) env / particle file is deleted.                                                   (DESIGN §3, §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Ridges are sums of cosines with whole periods over 1200 (seamless by construction),
// props that cross x = 0 / 1200 are drawn twice (x and x ∓ 1200) — both edges match pixel for pixel (docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm, muted, a little yellower than the answer colours; every green is a desaturated sage /
// olive so the answer green #4CC26B (and the island moss #8DBF6A) stand out. Mood = the noon palette pushed towards a mood
// cast (morning pink-peach, sunset apricot, night deep blue) + depth haze towards the horizon colour (far layers more).
// Night is deep blue-green (not black): the layers carry the darkness, the eggs stay untinted.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths — unchanged camp/drum geometry):
//   far    0 0 1200 720 : transparent sky; the calm volcano (centre x 600, crater y ≈ 262, thin plume drifting up-left to
//                         y ≈ 90), the misty back range (tops ≈ 400…470, dips in front of the volcano), the sandstone cliffs
//                         with a waterfall (x 880…1170, top ≈ 360), far hills with tree-fern silhouettes (tops ≈ 470…505)
//                         and the front valley hills with cycads (tops ≈ 520…550). Content below ≈ 575 is behind the mid layer.
//                         render's ENV.LAKE = HORIZON {y0 540, y1 700} (the sky gradient ends at y0, behind the hills).
//   mid    0 0 1200 300 : transparent top; a rolling back hill (tops ≈ 150…185), tree ferns (tops ≈ 50…80), cycads, mossy
//                         boulders, fern clumps, big round leaves; a front lump strip (≈ 235…260). MID_BASE 298 → campY.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (grass tips poke up to ≈ 24); the meadow (gradient MEADOW[m] →
//                         GROUND_BOTTOM[m]); y 40…135 stays calm (eggs on islands / Rio / the volcano prop stand there in
//                         landscape); small ferns, flowers, pebbles and grass tufts only below y ≈ 140.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const MID_BASE = 298, GROUND_LINE = 40, FAR_BOTTOM = 720;
const HORIZON = { y0: 540, y1: 700 };   // valley-floor strip in far-tile coordinates (render: ENV.LAKE; sky gradient ends at y0)
const LAKE = HORIZON;
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
const VU = (y0, y1) => ` gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0)}" x2="0" y2="${f(y1)}"`;
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
const arc = (cx, cy, r, a0, a1) => { const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return T`M${x0} ${y0}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; };
const D2R = Math.PI / 180;
function star5(cx, cy, r, ri = 0.48, rot = -90) { const pts = []; for (let k = 0; k < 10; k++) { const a = (rot + k * 36) * D2R, rr = k % 2 ? r * ri : r; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return poly(pts); }
function rngOf(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------------- palettes ----------------
// sky gradient per mood (DESIGN §4.3 = weather.js MOODS top / mid / bottom); render paints it from y 0 to L.skyY1
const SKY = {
  morning: [[0, '#FAD6E0'], [1, '#FFF1E4']],
  noon: [[0, '#8FD0F4'], [1, '#E2F5FD']],
  sunset: [[0, '#C98BC0'], [0.45, '#FFC9A0'], [1, '#FFE7C2']],
  night: [[0, '#1F2550'], [1, '#44508A']],
};
// the noon base palette — muted, yellowish, desaturated greens (every value well away from the answer colours)
const BASE = {
  volc: '#A89A9B', volcS: '#8E8087', volcL: '#C2B5B1', crater: '#76686E', plume: '#F3F0EA',
  range: '#9FB8AE', rangeS: '#8DA79E',
  cliff: '#C9B898', cliffS: '#AD9C7F', cliffL: '#DFD2B6', cliffMoss: '#A9BC86',
  water: '#E9F4F2', waterS: '#C3DDDE',
  hill1: '#A3BB8E', hill1S: '#90A97D', hill2: '#A9C08C', hill2S: '#96AE7C', tree: '#87A174', treeS: '#738D63',
  midB: '#A2B983', midBS: '#8EA672', midF: '#AFC48D', midFS: '#9AB07B',
  fern: '#93AF73', fernD: '#6F8B57', fernL: '#B5CA95', trunk: '#9C8A73', trunkD: '#77664F',
  rock: '#B1A89C', rockS: '#958C82', rockL: '#CBC3B7', rockD: '#7F776F', moss: '#A6BB79', mossL: '#BFD096',
  leaf: '#97B479', leafS: '#7D9B63', leafD: '#66824F', vein: '#BCD19E',
  meadow: '#CBD49F', meadowB: '#AFBA85', grass: '#B5C387', grassD: '#9AAC71', grassL: '#D8E0B2',
  flowers: [['#F7EDCB', '#CDB98A'], ['#F3D3BC', '#C99F84'], ['#DDD2E6', '#A898BC']], pebble: '#D1C8B8', pebbleD: '#A99F8F',
};
// mood cast [colour, amount] + horizon haze colour (far layers get more of it)
const CAST = { morning: ['#F6C4BC', 0.2], noon: ['#FFFFFF', 0], sunset: ['#E8987A', 0.24], night: ['#163848', 0.64] };
const HZ = { morning: '#FBE5E2', noon: '#DCEEF3', sunset: '#F8D3BC', night: '#46568A' };
const RIM = { morning: '#FFF1E6', noon: '#F4F8E8', sunset: '#FFD9A0', night: '#A9BCE8' };   // ridge rim light (night = moonlight)
function col(m, c, haze = 0) {
  let o = CAST[m][1] ? mix(c, CAST[m][0], CAST[m][1]) : c;
  if (m === 'morning') o = mix(o, '#FFFFFF', 0.06);
  return haze ? mix(o, HZ[m], m === 'night' ? haze * 0.6 : haze) : o;
}
const pal = (m, haze = 0) => new Proxy({}, { get: (_, k) => k === 'flowers' ? BASE.flowers.map(p => p.map(c => col(m, c, haze))) : col(m, BASE[k], haze) });
const MEADOW = {}, GROUND_BOTTOM = {}, FLOOR = MEADOW, HAZE = {};
for (const m of MOODS) { MEADOW[m] = col(m, m === 'night' ? mix(BASE.meadow, '#FFFFFF', 0.12) : BASE.meadow); GROUND_BOTTOM[m] = col(m, BASE.meadowB); HAZE[m] = SKY[m][SKY[m].length - 1][1]; }
const lt = (c, t = 0.3) => mix(c, '#FFFFFF', t), dk = (c, t = 0.3) => mix(c, '#2A2C2A', t);

// =====================================================================================================
// shared shapes
// =====================================================================================================
/** periodic ridge: y(x) = base + Σ a·cos(2πkx/W + φ) */
const ridgeY = (x, base, terms) => terms.reduce((y, [a, k, ph]) => y + a * Math.cos(2 * Math.PI * k * x / W + ph), base);
function ridge(base, terms, y0, fill, opt = {}) {
  const pts = []; for (let x = 0; x <= W; x += 6) pts.push([x, ridgeY(x, base, terms)]);
  let o = P(poly([[0, y0], ...pts, [W, y0]]), fill, opt.extra || '');
  if (opt.rim) o += S(line(pts), opt.rim, opt.rimW || 3, ` opacity="${opt.rimA || 0.6}"`);
  return o;
}
/** a fern frond: a tapered, serrated lens along a quadratic curve (leaflets = the zig-zag edge) */
function frond(bx, by, ang, len, droop, wid, fill, rib, n = 8, ribW) {
  const dx = Math.cos(ang * D2R), dy = Math.sin(ang * D2R);
  const cx = bx + dx * len * 0.55, cy = by + dy * len * 0.55 - Math.abs(dx) * droop * 0.2;
  const tx = bx + dx * len, ty = by + dy * len + droop;
  const q = t => [(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy + t * t * ty];
  const L = [], Rr = [], N = n * 2;
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = q(t), [x2, y2] = q(Math.min(1, t + 0.01)), [x1, y1] = q(Math.max(0, t - 0.01));
    let nx = -(y2 - y1), ny = x2 - x1; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = wid * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75) * 1.02)) * (i % 2 ? 1 : 0.55) * (t < 0.12 ? t / 0.12 : 1);
    L.push([x + nx * w, y + ny * w]); Rr.push([x - nx * w, y - ny * w]);
  }
  let o = P(poly([...L, ...Rr.reverse()]), fill);
  if (rib) o += S(T`M${bx} ${by}Q${cx} ${cy} ${tx} ${ty}`, rib, ribW || Math.max(0.8, wid * 0.16));
  return o;
}
function treeFern(x, yb, h, p, opt = {}) {
  const lean = (opt.lean || 0) * h, cx = x + lean, cy = yb - h;
  let o = '';
  if (!opt.flat) o += E(x, yb, h * 0.16, h * 0.035, p.fernD, ' opacity="0.22"');
  const tw = Math.max(2, h * 0.075);
  const tr = T`M${x} ${yb}Q${x + lean * 0.2} ${yb - h * 0.5} ${cx} ${cy + h * 0.04}`;
  if (opt.flat) o += S(tr, opt.flat, tw);
  else { o += S(tr, p.trunkD, tw + 2.4) + S(tr, p.trunk, tw);
    for (let k = 1; k < 6; k++) { const t = k / 6, yy = yb - h * t * 0.92, xx = x + lean * t * t * 0.8; o += S(T`M${xx - tw * 0.45} ${yy + 1.5}L${xx + tw * 0.4} ${yy - 1.5}`, p.trunkD, Math.max(1, tw * 0.18), ' opacity="0.7"'); } }
  const fl = h * (opt.crown || 0.6), back = opt.flat || p.fernD, front = opt.flat || p.fern, rib = opt.flat ? null : p.fernD;
  for (const a of [-150, -105, -70, -28]) o += frond(cx, cy, a, fl * 0.9, fl * 0.42, fl * 0.12, back, null, 7);
  for (const [a, k, d] of [[-178, 1, 0.55], [-128, 0.95, 0.4], [-90, 0.62, 0.12], [-52, 0.95, 0.4], [-2, 1, 0.55]]) o += frond(cx, cy, a, fl * k, fl * d, fl * 0.13, front, rib, 8);
  if (!opt.flat) o += C(cx, cy + 1, h * 0.05, p.trunkD) + C(cx - h * 0.012, cy, h * 0.035, p.fernL);
  return o;
}
function cycad(x, yb, h, p, opt = {}) {
  const tw = h * 0.3, th = h * 0.42, top = yb - th;
  let o = '';
  const fl = h * 0.62, back = opt.flat || p.fernD, front = opt.flat || p.fern;
  for (const a of [-160, -125, -90, -55, -20]) o += frond(x, top + 2, a, fl, fl * 0.12, fl * 0.12, back, null, 7);
  for (const a of [-175, -142, -108, -72, -38, -5]) o += frond(x, top + 2, a, fl * 0.92, fl * 0.2, fl * 0.12, front, opt.flat ? null : p.fernD, 7);
  if (opt.flat) return o + R(x - tw / 2, top, tw, th, opt.flat, ` rx="${f(tw * 0.35)}"`);
  o += R(x - tw / 2, top, tw, th, p.trunk, ` rx="${f(tw * 0.35)}"${OL(p.trunkD, 2)}`);
  o += R(x + tw * 0.08, top + 2, tw * 0.38, th - 4, p.trunkD, ` rx="${f(tw * 0.18)}" opacity="0.35"`);
  // diamond scales
  let d = ''; for (let k = 0; k <= 2; k++) { const y0 = top + 3 + k * th * 0.22; d += T`M${x - tw / 2 + 2} ${y0 + th * 0.3}L${x + tw / 2 - 2} ${y0}M${x - tw / 2 + 2} ${y0}L${x + tw / 2 - 2} ${y0 + th * 0.3}`; }
  o += S(d, p.trunkD, 1.4, ' opacity="0.45"');
  return o;
}
function fernClump(x, yb, s, p, opt = {}) {
  const back = opt.back || p.fernD, front = opt.front || p.fern, rib = opt.rib === undefined ? p.fernD : opt.rib;
  let o = '';
  for (const a of [-150, -112, -68, -30]) o += frond(x, yb, a, s * 0.95, s * 0.45, s * 0.13, back, null, 6);
  for (const [a, k] of [[-172, 0.9], [-135, 1], [-95, 0.8], [-50, 1], [-10, 0.9]]) o += frond(x, yb, a, s * k, s * 0.5 * k, s * 0.14, front, rib, 7);
  return o;
}
function boulder(x, yb, w, h, p, opt = {}) {
  let o = E(x + w * 0.05, yb, w * 0.56, h * 0.08, p.rockD, ' opacity="0.25"');
  const body = T`M${x - w / 2} ${yb}C${x - w / 2} ${yb - h * 0.72} ${x - w * 0.28} ${yb - h} ${x} ${yb - h}C${x + w * 0.34} ${yb - h} ${x + w / 2} ${yb - h * 0.62} ${x + w / 2} ${yb}Z`;
  o += P(body, p.rock, OL(p.rockD, opt.ow || 2.6));
  o += P(T`M${x + w * 0.08} ${yb - 1}C${x + w * 0.32} ${yb - h * 0.3} ${x + w * 0.3} ${yb - h * 0.78} ${x + w * 0.06} ${yb - h * 0.97}C${x + w * 0.36} ${yb - h * 0.94} ${x + w / 2 - 1} ${yb - h * 0.58} ${x + w / 2 - 1.3} ${yb - 1}Z`, p.rockS);
  o += E(x - w * 0.2, yb - h * 0.55, w * 0.1, h * 0.14, p.rockL, ` opacity="0.8" transform="rotate(-25 ${f(x - w * 0.2)} ${f(yb - h * 0.55)})"`);
  if (opt.moss !== false) {
    o += P(T`M${x - w * 0.43} ${yb - h * 0.6}C${x - w * 0.35} ${yb - h * 1.04} ${x + w * 0.3} ${yb - h * 1.1} ${x + w * 0.41} ${yb - h * 0.7}Q${x + w * 0.28} ${yb - h * 0.62} ${x + w * 0.2} ${yb - h * 0.72}Q${x + w * 0.1} ${yb - h * 0.6} ${x - w * 0.04} ${yb - h * 0.7}Q${x - w * 0.2} ${yb - h * 0.56} ${x - w * 0.3} ${yb - h * 0.68}Q${x - w * 0.38} ${yb - h * 0.55} ${x - w * 0.43} ${yb - h * 0.6}Z`, p.moss, OL(dk(p.moss, 0.25), 1.6));
    o += E(x - w * 0.12, yb - h * 0.9, w * 0.14, h * 0.05, p.mossL, ' opacity="0.8"');
  }
  return o;
}
function bigLeaf(x, yb, s, ang, p) {
  const sx = x + Math.sin(ang * D2R) * s * 0.5, sy = yb - s * 0.45;
  let o = S(T`M${x} ${yb}Q${x} ${yb - s * 0.3} ${sx} ${sy}`, p.leafD, Math.max(2, s * 0.06));
  const leaf = T`M0 0C${s * 0.55} ${-s * 0.04} ${s * 0.62} ${-s * 0.7} 0 ${-s}C${-s * 0.62} ${-s * 0.7} ${-s * 0.55} ${-s * 0.04} 0 0Z`;
  const half = T`M0 0C${s * 0.55} ${-s * 0.04} ${s * 0.62} ${-s * 0.7} 0 ${-s}Q${s * 0.08} ${-s * 0.5} 0 0Z`;
  let veins = ''; for (let k = 1; k <= 3; k++) { const yy = -s * (0.2 + k * 0.18); veins += T`M0 ${yy + s * 0.04}Q${s * 0.16} ${yy - s * 0.02} ${s * 0.3} ${yy - s * 0.1}M0 ${yy + s * 0.04}Q${-s * 0.16} ${yy - s * 0.02} ${-s * 0.3} ${yy - s * 0.1}`; }
  o += `<g transform="translate(${f(sx)} ${f(sy)}) rotate(${f(ang)})">` + P(leaf, p.leaf, OL(p.leafD, 2.2)) + P(half, p.leafS, ' opacity="0.75"') +
    S(T`M0 ${-s * 0.04}L0 ${-s * 0.9}`, p.vein, Math.max(1.4, s * 0.03)) + S(veins, p.vein, Math.max(1, s * 0.02), ' opacity="0.8"') +
    E(-s * 0.22, -s * 0.62, s * 0.07, s * 0.14, lt(p.leaf, 0.35), ' opacity="0.7" transform="rotate(-20)"') + '</g>';
  return o;
}

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
function volcano(m, defs) {
  const p = pal(m, 0.36), night = m === 'night';
  let o = '';
  // glow behind the crater (sunset: soft apricot; night: faint warm)
  if (m === 'sunset' || night) {
    defs.push(rg('vglow', [[0, night ? '#FFB27A' : '#FFC489', night ? 0.42 : 0.5], [0.5, night ? '#FF9F70' : '#FFB680', night ? 0.14 : 0.18], [1, '#FFB680', 0]]));
    o += E(600, 266, 150, 90, 'url(#vglow)');
  }
  // plume: a thin chain of soft puffs drifting up-left (behind the cone top)
  const pl = [[604, 248, 15, 0.95], [596, 222, 18, 0.88], [580, 194, 21, 0.78], [560, 166, 23, 0.66], [534, 140, 24, 0.52], [504, 116, 24, 0.4], [472, 96, 22, 0.28]];
  const plc = night ? mix('#E6E8F2', '#8C97C2', 0.3) : m === 'sunset' ? mix(p.plume, '#FFD6B0', 0.35) : p.plume;
  for (const [x, y, r, a0] of pl) { const a = night ? a0 * 0.55 : a0; o += C(x, y, r, plc, ` opacity="${a}"`) + C(x - r * 0.25, y - r * 0.25, r * 0.6, lt(plc, 0.4), ` opacity="${a * 0.7}"`); }
  if (night || m === 'sunset') for (const [x, y, r, a] of pl.slice(0, 3)) o += C(x + r * 0.25, y + r * 0.3, r * 0.55, night ? '#E8A27C' : '#FFC79A', ` opacity="${a * (night ? 0.35 : 0.45)}"`);
  // the cone: chunky, concave flanks, flat crater top, rounded shoulders
  const cone = 'M220 640C380 600 470 470 536 330Q552 272 584 266L616 266Q648 272 664 330C730 470 820 600 980 640Z';
  o += P(cone, p.volc, OL(p.volcS, 3));
  // cel shade: right flank
  o += P('M612 268Q644 274 660 330C724 470 812 596 976 638L700 640C690 520 640 380 612 268Z', p.volcS, ' opacity="0.8"');
  // soft ridge grooves + highlight on the lit flank
  o += S('M572 300Q540 420 470 560M594 290Q586 400 560 560M640 300Q668 420 740 560', p.volcS, 3.5, ' opacity="0.55"');
  o += S('M560 300Q520 400 452 520', p.volcL, 6, ' opacity="0.7"');
  // crater lip
  o += E(600, 268, 30, 6.5, night || m === 'sunset' ? mix(p.crater, '#FFB27A', night ? 0.3 : 0.25) : p.crater);
  o += S('M572 266Q600 260 628 266', p.volcL, 2.4, ' opacity="0.8"');
  if (m === 'sunset') o += S('M616 268Q648 274 664 332C730 470 820 600 978 640', RIM.sunset, 4, ' opacity="0.75"');
  if (m === 'sunset' || night) o += P('M584 268L616 268Q626 290 620 300Q600 292 580 300Q574 290 584 268Z', night ? '#E89A74' : '#FFC08A', ` opacity="${night ? 0.35 : 0.5}"`);
  return o;
}
function cliffs(m, defs) {
  const p = pal(m, 0.26), night = m === 'night';
  let o = '';
  // two stacked sandstone buttes (right one taller) — rounded tops, near-vertical sides
  const back = 'M1080 620L1092 446Q1096 412 1124 410L1160 408Q1184 410 1186 444L1190 620Z';
  o += P(back, mix(p.cliff, HZ[m], 0.25), OL(mix(p.cliffS, HZ[m], 0.25), 2.4));
  const main = 'M872 620L884 420Q890 366 936 362L1098 356Q1146 358 1154 404L1166 620Z';
  o += P(main, p.cliff, OL(p.cliffS, 3));
  // shade columns (right side of each column) + strata
  o += P('M1090 360Q1146 360 1154 404L1166 620L1110 620Q1108 480 1090 360Z', p.cliffS, ' opacity="0.75"');
  o += P('M930 366L942 620L900 620L906 420Q910 380 930 366Z', p.cliffS, ' opacity="0.35"');
  for (const [y, a] of [[408, 0.7], [452, 0.6], [500, 0.55], [548, 0.5]]) o += S(T`M${884 - (y - 400) * 0.02} ${y}Q930 ${y - 5} 975 ${y + 1}M1030 ${y + 2}Q1090 ${y - 4} ${1156 + (y - 400) * 0.03} ${y}`, p.cliffL, 3, ` opacity="${a}"`);
  for (const [y, a] of [[430, 0.45], [476, 0.4], [524, 0.35]]) o += S(T`M890 ${y}Q940 ${y + 4} 972 ${y}M1036 ${y}Q1100 ${y + 4} 1150 ${y - 1}`, p.cliffS, 2.2, ` opacity="${a}"`);
  // grassy moss cap with tufts
  o += P('M888 404Q892 364 936 360L1098 354Q1150 356 1156 402Q1140 384 1120 392Q1100 378 1080 388Q1060 376 1036 384L1020 380Q1000 380 980 386Q958 378 940 390Q912 382 888 404Z', p.cliffMoss, OL(dk(p.cliffMoss, 0.22), 2));
  o += P('M1092 444Q1096 412 1124 410L1160 408Q1184 410 1186 444Q1174 430 1158 436Q1140 426 1122 434Q1108 428 1092 444Z', mix(p.cliffMoss, HZ[m], 0.25));
  // little tree ferns on the cliff top
  o += treeFern(920, 368, 58, pal(m, 0.3), { lean: -0.05, crown: 0.55 }) + treeFern(1132, 366, 74, pal(m, 0.3), { lean: 0.06, crown: 0.55 }) + cycad(1164, 414, 30, pal(m, 0.4));
  // the waterfall: lip notch + falling sheet + streaks + foam at the foot
  const wc = night ? mix(p.water, '#AFC2EA', 0.35) : p.water, ws = night ? mix(p.waterS, '#7F92C4', 0.3) : p.waterS;
  o += P('M982 372Q1003 364 1026 372L1034 620L976 620Z', ws);
  o += P('M985 372Q1003 366 1023 372Q1026 470 1030 620L980 620Q982 470 985 372Z', wc);
  o += S('M994 382L991 600M1006 380L1006 610M1016 382L1020 600', ws, 2.4, ' opacity="0.8"');
  o += S('M999 390L997 560M1012 392L1014 540', '#FFFFFF', 1.8, ` opacity="${night ? 0.45 : 0.8}"`);
  o += S('M984 374Q1003 366 1024 374', '#FFFFFF', 3, ` opacity="${night ? 0.4 : 0.85}"`);
  for (const [x, y, r] of [[966, 520, 22], [992, 510, 26], [1020, 512, 26], [1046, 522, 22], [1004, 530, 30]]) o += C(x, y, r, night ? mix('#FFFFFF', '#8E9BCB', 0.6) : lt(HZ[m], 0.5), ' opacity="0.75"');
  return o;
}
function far(m) {
  const night = m === 'night', defs = [];
  let o = '';
  // ---- distant hazy peaks (behind the volcano; give the tall-portrait sky a horizon)
  const pd0 = pal(m, 0.6);
  o += ridge(352, [[34, 2, 0.5], [22, 3, 2.0], [14, 5, 1.1], [7, 9, 0.3]], 720, pd0.range, { rim: RIM[m], rimA: night ? 0.3 : 0.5, rimW: 2.2 });
  o += volcano(m, defs);
  // ---- misty back range: dips in front of the volcano (x 600), higher at the edges
  const pr = pal(m, 0.5);
  const rangeT = [[34, 1, -Math.PI], [10, 3, 0.6], [6, 5, 1.9], [3, 9, 0.3]];
  defs.push(lg('rg', [[0, pr.range], [1, pr.rangeS]], VU(400, 600)));
  o += ridge(436, rangeT, 720, 'url(#rg)', { rim: RIM[m], rimA: night ? 0.35 : 0.55, rimW: 2.6 });
  // a soft mist band in front of the range (stronger in the morning)
  const mistA = { morning: 0.7, noon: 0.35, sunset: 0.45, night: 0.28 }[m], mc = night ? '#7584B6' : lt(HZ[m], 0.4);
  defs.push(lg('mb', [[0, mc, 0], [0.55, mc, mistA], [1, mc, 0]], V));
  o += R(0, 430, W, 70, 'url(#mb)');
  // ---- cliffs + waterfall (right)
  o += cliffs(m, defs);
  // ---- far hills with tree-fern silhouettes
  const p1 = pal(m, 0.3);
  const h1T = [[12, 2, 0.4], [9, 3, 2.2], [6, 7, 1.1], [3, 11, 0.2]];
  defs.push(lg('h1', [[0, p1.hill1], [1, p1.hill1S]], VU(460, 620)));
  const sil = mix(p1.tree, HZ[m], night ? 0.08 : 0.12);
  for (const [x, h, k] of [[60, 58, 0], [128, 44, 1], [300, 66, 0], [356, 40, 2], [470, 52, 1], [720, 48, 0], [790, 62, 1], [1060, 40, 2], [1160, 54, 0]]) {
    o += both(xx => { const yb = ridgeY(((xx % W) + W) % W, 488, h1T) + 6; return k === 2 ? cycad(xx, yb, h * 1.1, p1, { flat: sil }) : treeFern(xx, yb, h, p1, { flat: sil, lean: k ? 0.08 : -0.06, crown: 0.55 }); }, x, h * 0.7);
  }
  o += ridge(488, h1T, 720, 'url(#h1)', { rim: RIM[m], rimA: night ? 0.35 : 0.5 });
  // ---- second mist wisp
  defs.push(lg('mb2', [[0, mc, 0], [0.5, mc, mistA * 0.7], [1, mc, 0]], V));
  o += R(0, 500, W, 46, 'url(#mb2)');
  // ---- front valley hills with cycads and rounded bushes
  const p2 = pal(m, 0.16);
  const h2T = [[8, 2, 2.6], [7, 4, 0.9], [4, 6, 2.1], [2.5, 13, 0.7]];
  defs.push(lg('h2', [[0, p2.hill2], [1, p2.hill2S]], VU(520, 640)));
  o += ridge(536, h2T, 720, 'url(#h2)', { rim: RIM[m], rimA: night ? 0.3 : 0.55 });
  for (const [x, h, k] of [[150, 46, 0], [420, 38, 1], [560, 30, 2], [860, 42, 0], [1110, 34, 1]]) {
    o += both(xx => { const yb = ridgeY(((xx % W) + W) % W, 536, h2T) + 10; return k === 2 ? fernClump(xx, yb, h, p2) : k ? cycad(xx, yb, h, p2) : treeFern(xx, yb, h * 1.3, p2, { crown: 0.55 }); }, x, h);
  }
  // ---- horizon haze (no blur)
  const hz = { morning: ['#FFFFFF', 0.45], noon: ['#FFFFFF', 0.22], sunset: ['#FFE3C0', 0.35], night: ['#6A78B0', 0.2] }[m];
  defs.push(lg('hz', [[0, hz[0], 0], [0.6, hz[0], hz[1]], [1, hz[0], 0]], V));
  o += R(0, 540, W, 60, 'url(#hz)');
  return svg(1200, 720, o, defs.join(''), `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): back hill, tree ferns, cycads, mossy boulders, fern clumps, big leaves, front lumps
// =====================================================================================================
function mid(m) {
  const night = m === 'night', p = pal(m, 0.14), pb = pal(m, 0.24), defs = [];
  let o = '';
  const bT = [[12, 2, 1.3], [9, 3, 0.2], [6, 5, 2.4], [3, 8, 1.0]];
  defs.push(lg('mb', [[0, pb.midB], [1, pb.midBS]], VU(140, 300)));
  // tree ferns behind the back hill crest
  for (const [x, h, l] of [[95, 118, -0.05], [700, 128, 0.05], [1035, 112, 0.04]]) o += both(xx => treeFern(xx, ridgeY(((xx % W) + W) % W, 172, bT) + 30, h, pb, { lean: l }), x, h * 0.75);
  o += ridge(172, bT, 300, 'url(#mb)', { rim: RIM[m], rimA: night ? 0.35 : 0.6 });
  // mid props on the back hill
  o += cycad(262, 214, 70, p) + cycad(880, 210, 62, p);
  o += both(xx => fernClump(xx, 226, 50, p), 1150, 60) + fernClump(470, 222, 44, p) + fernClump(610, 226, 40, p);
  o += boulder(180, 240, 96, 62, p) + boulder(540, 244, 76, 46, p) + boulder(975, 238, 110, 66, p) + boulder(1020, 246, 52, 30, p, { moss: false });
  const leaves = (x, k) => bigLeaf(x - 14 * k, 292, 66 * k, -42, p) + bigLeaf(x + 16 * k, 294, 60 * k, 38, p) + bigLeaf(x, 290, 76 * k, -6, p);
  // front lump strip (hides the prop bases) + little ferns
  const fT = [[5, 6, 0.4], [4, 10, 1.7], [2, 15, 0.9]];
  defs.push(lg('mf', [[0, p.midF], [1, p.midFS]], VU(240, 300)));
  o += ridge(258, fT, 300, 'url(#mf)', { rim: RIM[m], rimA: night ? 0.3 : 0.6 });
  o += both(xx => leaves(xx, 1), 40, 90) + leaves(650, 0.85) + leaves(1120 - 290, 0.75);
  for (const x of [130, 410, 720, 1090]) o += both(xx => fernClump(xx, 270, 30, p), x, 36);
  o += R(0, 294, W, 6, p.midFS);
  return svg(1200, 300, o, defs.join(''));
}

// =====================================================================================================
// GROUND (0 0 1200 260): the grassy meadow
// =====================================================================================================
function grassTuft(x, yb, s, c, d) {
  let o = ''; const bl = [[-0.5, -0.2, 0.75], [-0.2, -0.05, 1], [0.15, 0.08, 0.9], [0.45, 0.25, 0.7]];
  for (const [dx, lean, k] of bl) o += P(T`M${x + dx * s * 0.6 - s * 0.09} ${yb}Q${x + dx * s * 0.6 + lean * s * 0.3} ${yb - s * k * 0.6} ${x + dx * s * 0.6 + lean * s} ${yb - s * k}Q${x + dx * s * 0.6 + lean * s * 0.2} ${yb - s * k * 0.5} ${x + dx * s * 0.6 + s * 0.09} ${yb}Z`, k === 1 ? d : c);
  return o;
}
function ground(m) {
  const night = m === 'night', p = pal(m), defs = [];
  const top = MEADOW[m], bot = GROUND_BOTTOM[m];
  let o = '';
  defs.push(lg('gr', [[0, top], [0.3, mix(top, bot, 0.25)], [1, bot]], VU(40, 260)));
  // grass edge: blades poking up to ≈ 24 (periodic), then the body
  const rnd = rngOf(911 + MOODS.indexOf(m));
  const blade = (x, h, lean, c) => P(T`M${x - 6} 47Q${x + lean * 0.5} ${44 - h * 0.6} ${x + lean} ${44 - h}Q${x + lean * 0.3 + 1} ${44 - h * 0.5} ${x + 7} 47Z`, c);
  for (let i = 0; i < 80; i++) {   // 80 × 15 = 1200: back (dark) and front (light) blades, periodic
    const x = i * 15, h = 12 + rnd() * 7 + (i % 3) * 2, lean = (i % 4 - 1.5) * 1.8, h2 = 9 + rnd() * 6;
    o += both(xx => blade(xx, h, lean, p.grassD), x, 12) + both(xx => blade(xx, h2, -lean, p.grass), x + 7.5, 12);
  }
  o += R(0, 44, W, 216, 'url(#gr)');
  o += S(line([[0, 45], [W, 45]]), lt(top, night ? 0.08 : 0.25), 2.4, ' opacity="0.8"');
  // very soft low-contrast mounds in the calm band (y 50…135) — light only, no props
  for (const [x, y, rx, ry] of [[150, 92, 190, 16], [560, 104, 220, 18], [930, 88, 200, 15], [360, 128, 170, 12], [780, 132, 180, 12], [1130, 124, 170, 12]]) {
    o += both(xx => E(xx, y, rx, ry, lt(top, night ? 0.06 : 0.18), ' opacity="0.55"') + S(T`M${xx - rx * 0.6} ${y - ry * 0.3}Q${xx} ${y - ry * 1.1} ${xx + rx * 0.6} ${y - ry * 0.3}`, lt(top, night ? 0.1 : 0.35), 2.2, ' opacity="0.5"'), x, rx);
  }
  // lower meadow: grass tufts, little ferns, flowers, pebbles (y ≥ 140)
  const r2 = rngOf(4242 + MOODS.indexOf(m));
  for (let i = 0; i < 16; i++) { const x = (i + 0.5) * W / 16 + (r2() - 0.5) * 40, y = 150 + r2() * 100, s = 12 + (y - 140) * 0.1; o += both(xx => grassTuft(xx, y, s, p.grass, p.grassD), x, s); }
  for (const [x, y, s] of [[80, 196, 34], [430, 236, 40], [705, 182, 30], [1000, 226, 38]]) o += both(xx => fernClump(xx, y, s, p), x, s * 1.1);
  const FL = p.flowers;
  for (let i = 0; i < 12; i++) {
    const x = (i + 0.5) * W / 12 + (r2() - 0.5) * 50, y = 150 + r2() * 96, n = 1 + Math.floor(r2() * 3), sc = 0.8 + (y - 140) / 110 * 0.4, ci = i % FL.length;
    o += both(xx => {
      let s = '';
      for (let k = 0; k < n; k++) {
        const fx = xx + (k - (n - 1) / 2) * 13 * sc, fy = y - (k % 2) * 6 * sc, r = 4.4 * sc, [c0, d0] = FL[(ci + k) % FL.length];
        s += S(T`M${fx} ${fy}L${fx + 1} ${fy + 8 * sc}`, p.grassD, 1.4);
        for (let q = 0; q < 5; q++) { const a = (q * 72 - 90 + k * 15) * D2R; s += C(fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, r * 0.5, c0, OL(d0, 0.9)); }
        s += C(fx, fy, r * 0.32, night ? '#C9C79A' : '#EED69A');
      }
      return s;
    }, x, 30);
  }
  for (let i = 0; i < 10; i++) {
    const x = 40 + r2() * (W - 80), y = 150 + r2() * 100, s = 4 + r2() * 4;
    o += both(xx => E(xx, y + s * 0.3, s * 1.25, s * 0.4, p.pebbleD, ' opacity="0.35"') + E(xx, y, s * 1.15, s * 0.75, p.pebble, OL(p.pebbleD, 1.1)) + E(xx - s * 0.35, y - s * 0.25, s * 0.35, s * 0.2, lt(p.pebble, 0.5)) +
      E(xx + s * 1.6, y + s * 0.2, s * 0.6, s * 0.42, p.pebble, OL(p.pebbleD, 1)), x, s * 2.5);
  }
  return svg(1200, 260, o, defs.join(''));
}

// =====================================================================================================
// SUN, MOON, CLOUDS, RAINBOW
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF4D6', 0.85], [0.45, '#FFEFC8', 0.38], [1, '#FFEFC8', 0]]);
  let rays = ''; for (let k = 0; k < 12; k++) { const a = k * 30 * D2R; rays += E(100 + Math.cos(a) * 62, 100 + Math.sin(a) * 62, 9, 4.6, '#FFEBB8', ` opacity="0.85" transform="rotate(${k * 30} ${f(100 + Math.cos(a) * 62)} ${f(100 + Math.sin(a) * 62)})"`); }
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + rays + C(100, 100, 47, '#FFE9B4', OL('#EFD093', 4)) + C(100, 100, 39, '#FFF5DA') +
    S(arc(100, 100, 31, 200 * D2R, 250 * D2R), '#FFFFFF', 5, ' opacity="0.8"') + C(124, 120, 6, '#FFEBC0', ' opacity="0.8"'), d);
}
function moon() {
  // a fat crescent facing right-down (no face): disc r 46 minus a disc r 40 at (122, 82); pale glow; a few soft craters
  const d = rg('g', [[0, '#E6EAFF', 0.5], [0.5, '#D6DCFF', 0.16], [1, '#D6DCFF', 0]]);
  const cres = 'M85.2 56.4A46 46 0 1 0 145.3 106.3A40 40 0 0 1 85.2 56.4Z';
  return svg(200, 200, C(100, 100, 98, 'url(#g)') + P(cres, '#F8F1DA', OL('#D6CAA8', 3.5)) +
    S('M74 72Q58 92 62 116', '#FFFFFF', 4, ' opacity="0.7"') + C(76, 124, 5, '#E8DDBC') + C(98, 138, 3.4, '#E8DDBC') + C(66, 100, 2.8, '#E8DDBC') + C(120, 140, 2.4, '#E8DDBC'), d);
}
function cloud(type) {
  // flat-bottomed, three-tier cumulus (white art; render tints it per mood)
  const blobs = type === 'a' ? [[60, 94, 30], [104, 72, 40], [156, 56, 46], [206, 74, 38], [246, 94, 26]] : [[52, 98, 22], [90, 82, 32], [140, 70, 40], [190, 82, 32], [232, 98, 22]];
  const sh = '#E3E4EE', ol = '#D3D4E4';
  const base = 'M30 112Q30 126 48 126L254 126Q274 126 272 110L266 98L36 98Z';
  let o = P(base, sh, OL(ol, 3));
  for (const [x, y, r] of blobs) o += C(x, y, r, sh, OL(ol, 3));
  o += P(base, sh);
  for (const [x, y, r] of blobs) o += C(x, y, r, sh);
  for (const [x, y, r] of blobs) o += C(x - r * 0.12, y - r * 0.14, r * 0.84, '#FFFFFF');
  o += P('M38 108Q42 118 56 118L250 118Q264 118 264 108L260 100L40 100Z', '#FFFFFF');
  o += S('M50 120L250 120', sh, 3, ' opacity="0.7"');
  o += S(arc(type === 'a' ? 150 : 134, type === 'a' ? 52 : 66, 32, 205 * D2R, 255 * D2R), '#FFFFFF', 3.4) + E(type === 'a' ? 96 : 84, type === 'a' ? 54 : 66, 13, 6, '#FFFFFF');
  return svg(300, 140, o);
}
function rainbow() {
  // the celebration rainbow: soft pastel bands with a cream edge; mossy rocks with a fern sprig at both feet (0 0 600 300)
  const bands = ['#F2AAB0', '#F6C8A0', '#F4E1A4', '#C6DEB0', '#AACDE6', '#C8B9E6'];
  const cx = 300, cy = 286, r0 = 262, bw = 18;
  let o = S(arc(cx, cy, r0 + 2, Math.PI, 2 * Math.PI), '#FFF8EA', 6, ' opacity="0.85"');
  bands.forEach((c, i) => { o += S(arc(cx, cy, r0 - bw * (i + 0.5), Math.PI, 2 * Math.PI), c, bw + 0.8); });
  o += S(arc(cx, cy, r0 - bw * 6 - 2, Math.PI, 2 * Math.PI), '#FFF8EA', 4, ' opacity="0.75"');
  o += S(arc(cx, cy, r0 - bw * 1.5, 205 * D2R, 250 * D2R), '#FFFFFF', 4, ' opacity="0.55"');
  const p = pal('noon');
  const foot = (fx, flip) => fernClump(fx + (flip ? 40 : -40), 270, 46, p) + boulder(fx, 296, 120, 62, p, { ow: 2.6 }) + boulder(fx + (flip ? -58 : 58), 296, 60, 34, p) + fernClump(fx + (flip ? 62 : -62), 296, 34, p);
  o += foot(cx - (r0 - bw * 3), false) + foot(cx + (r0 - bw * 3), true);
  return svg(600, 300, o);
}

// =====================================================================================================
// PARTICLES (0 0 32 32; mist 0 0 64 32). Tintable sprites (dot, confetti, mote, dust, sparkle, star, note, mist) stay
// white / light grey so render's source-atop tint works; ember, firefly, leaf, butterfly carry their own colours.
// =====================================================================================================
function particles() {
  const out = {};
  out.mist = svg(64, 32, E(32, 18, 31, 11, 'url(#m)') + E(20, 15, 16, 8, 'url(#m)') + E(44, 16, 17, 8, 'url(#m)'),
    rg('m', [[0, '#FFFFFF', 0.72], [0.6, '#FFFFFF', 0.28], [1, '#FFFFFF', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3.2, '#FFFDF4', ' opacity="0.95"'), rg('m', [[0, '#FFF8E8', 0.8], [0.4, '#FFF4DE', 0.3], [1, '#FFF4DE', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1.5Q17.6 14.4 30.5 16Q17.6 17.6 16 30.5Q14.4 17.6 1.5 16Q14.4 14.4 16 1.5Z', '#FFF7E2') +
    P('M16 8Q16.8 15.2 24 16Q16.8 16.8 16 24Q15.2 16.8 8 16Q15.2 15.2 16 8Z', '#FFFFFF') + P('M8.5 8.5L16 14.5L23.5 8.5L17.5 16L23.5 23.5L16 17.5L8.5 23.5L14.5 16Z', '#FFFFFF', ' opacity="0.45"'),
    rg('k', [[0, '#FFF8E4', 0.6], [1, '#FFF8E4', 0]]));
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P('M16 3.5Q17.3 14.7 28.5 16Q17.3 17.3 16 28.5Q14.7 17.3 3.5 16Q14.7 14.7 16 3.5Z', '#FFF6DC') + C(16, 16, 3, '#FFFFFF'),
    rg('t', [[0, '#FFF7E0', 0.5], [1, '#FFF7E0', 0]]));
  // ember: a tiny warm ash-ember (sunset / volcano), amber core in a soft glow
  out.ember = svg(32, 32, C(16, 16, 15, 'url(#e)') + P('M16 9.5Q21.5 11 22 16.2Q21.6 21.8 16 22.5Q10.6 21.8 10 16.4Q10.6 10.8 16 9.5Z', '#F4A867', OL('#D58550', 1)) +
    P('M15.6 11.8Q19.4 12.8 19.6 16.4Q19 19.6 15.8 19.8Q12.6 19.4 12.4 16.2Q12.8 12.6 15.6 11.8Z', '#FFCF8E') + C(14.6, 14.6, 1.8, '#FFF2D0'),
    rg('e', [[0, '#FFC285', 0.65], [0.45, '#FFB070', 0.22], [1, '#FFB070', 0]]));
  // firefly: a yellow-green glow with a tiny round body and two wing glints
  out.firefly = svg(32, 32, C(16, 16, 15, 'url(#f)') + C(16, 16, 6.5, '#E9F5A0', ' opacity="0.9"') + C(16, 17, 3.6, '#FBFFD8') +
    E(12.4, 12.4, 3, 1.8, '#FFFFFF', ' opacity="0.55" transform="rotate(-35 12.4 12.4)"') + E(19.6, 12.4, 3, 1.8, '#FFFFFF', ' opacity="0.55" transform="rotate(35 19.6 12.4)"'),
    rg('f', [[0, '#E6F48E', 0.8], [0.4, '#D9EE7E', 0.32], [1, '#D9EE7E', 0]]));
  // leaf: a small fern leaf (muted sage) for the noon breeze
  let lf = ''; for (let k = 0; k < 6; k++) { const t = k / 6, y = 26 - t * 20, s = 5.2 * (1 - t * 0.7); lf += E(16 - s * 0.6, y, s * 0.62, s * 0.3, '#A2BD7E', ' transform="rotate(25 ' + f(16 - s * 0.6) + ' ' + f(y) + ')"') + E(16 + s * 0.6, y - 1, s * 0.62, s * 0.3, '#93B071', ' transform="rotate(-25 ' + f(16 + s * 0.6) + ' ' + f(y - 1) + ')"'); }
  out.leaf = svg(32, 32, `<g transform="rotate(-24 16 16)">` + lf + E(16, 5.5, 1.6, 2.2, '#A2BD7E') + S('M16 30L16 5', '#6F8B57', 1.4) + `</g>`);
  // butterfly: pale apricot + cream wings, mauve-brown body (no answer colour)
  out.butterfly = svg(32, 32, P('M15.5 15Q8 3.5 3.5 7.5Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#F6D9BC', OL('#C9A086', 1.4)) +
    P('M16.5 15Q24 3.5 28.5 7.5Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#F0CFAF', OL('#C9A086', 1.4)) +
    C(7.6, 10.8, 2.2, '#FFF5E2') + C(24.4, 10.8, 2.2, '#FFF5E2') + C(8, 21, 1.6, '#E8D6EE') + C(24, 21, 1.6, '#E8D6EE') + R(15, 10, 2, 13, '#86706A', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#86706A', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // dust: a soft round dust puff (light, tintable)
  out.dust = svg(32, 32, C(11, 19, 7.5, '#E9E6DF') + C(17, 14, 9, '#E9E6DF') + C(23, 19.5, 6.5, '#E9E6DF') + R(5, 19, 23, 7.5, '#E9E6DF', ' rx="3.7"') +
    C(10.2, 18, 6, '#F9F8F4') + C(16.2, 12.8, 7.4, '#F9F8F4') + C(22.4, 18.5, 5, '#F9F8F4') + E(14, 10.5, 2.6, 1.5, '#FFFFFF'));
  out.note = svg(32, 32, C(16, 16, 15, 'url(#n)') +
    P('M19 5L19 21.5', 'none', OL('#DCDCDC', 4.2)) + P('M19 5L19 21.5', 'none', OL('#FFFFFF', 2.4)) +
    P('M19 4.5Q25.5 6.5 26 12.5Q23.5 9.5 19.5 9.5Z', '#FFFFFF', OL('#DCDCDC', 1.2)) +
    E(14.5, 22.5, 5.6, 4.2, '#FFFFFF', OL('#DCDCDC', 1.4) + ' transform="rotate(-22 14.5 22.5)"') + E(13, 21.2, 2, 1.1, '#FFFFFF', ' transform="rotate(-22 13 21.2)"'),
    rg('n', [[0, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b')); wr(env, 'rainbow', rainbow());
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, clouds, rainbow) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, MEADOW, FLOOR, GROUND_BOTTOM, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, HORIZON, LAKE };
if (require.main === module) main();
