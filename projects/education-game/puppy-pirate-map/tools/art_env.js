// Mit's Treasure Map: pirate-island-cove environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground,palm}_{sunny,breezy,rain,rainbow}.svg,
// env/{sun,cloud_a,cloud_b,cloud_rain,rainbow}.svg and game/assets/default/particles/{sparkle,mote,leaf_a,leaf_b,sand,rain,
// splash,droplet,star,confetti_a,confetti_b,dot,dust,coin}.svg.                                 (DESIGN §0.1, §0.4, §0.5, §3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Periodic things use periods that divide 1200, and every prop that crosses x = 0 / 1200
// is drawn twice (x and x ∓ 1200), so both edges match pixel for pixel (see docs/art/env_seams.png).
// Colour rule: calm, light, slightly desaturated cove; no saturated answer hue (red/blue/yellow/green/orange/purple/pink)
// anywhere in the scenery — the bright puzzle pieces must pop in front of it.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far    0 0 1200 720 : transparent sky; HORIZON = 560 (render: → L.horizonY); 560…720 = the sea band (SEA[m].deep at the
//                         horizon → SEA[m].mid at the bottom; the render continues it with a fill SEA.mid → SEA.near down to
//                         the beach). Above the horizon: lighthouse island (x 200), the anchored ship (x 610), a small palm
//                         island (x 930), a rock islet (x 1150).
//   mid    0 0 1200 300 : transparent above; the waterline WL ≈ 236 (foam), wet → dry sand 240…300 (bottom = SAND[m], it runs
//                         on into the ground tile); props stand on PY = 284: rocks, the beach hut (x 250), barrels, a crate,
//                         a rope fence, a beached rowboat (x 665), a wooden pier (x 780…1090), an anchor, grass tufts.
//                         MID_BASE = 298 → L.shoreY.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (= L.shoreY); warm sand SAND[m] → SAND_BOTTOM[m] with shells,
//                         paw-print trail, ripples, tufts (rain: darker wet sand + puddles). The render fills below with
//                         SAND_BOTTOM[m].
//   palm   0 0 260 420  : a curved palm (crown leans LEFT, x ≈ 92), base anchor PALM = (130, 416); the render rotates it
//                         about the base by wind and mirrors it with flip.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const MID_BASE = 298, GROUND_LINE = 40, FAR_BOTTOM = 720, HORIZON = 560, WL = 236, PY = 284;
const PALM = { w: 260, h: 420, ax: 130, ay: 416 };
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
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const g = (inner, extra) => `<g${extra}>${inner}</g>`;

// ---------------- palettes ----------------
const SKY = {                                  // DESIGN §0.1 — render paints it from y 0 to L.skyY1 (= horizon)
  sunny: [[0, '#7CC8F0'], [1, '#D8F1FB']],
  breezy: [[0, '#93CBEA'], [1, '#E4F3F8']],
  rain: [[0, '#8FA3B8'], [1, '#CBD6DE']],
  rainbow: [[0, '#86C9EE'], [1, '#FBE9D6']],
};
// sea: deep (at the horizon) → mid (far-tile bottom = start of the render's sea fill) → near (at the beach)
const SEA = {
  sunny: { deep: '#5CC3D6', mid: '#7FD0DA', near: '#A4DFDC' },
  breezy: { deep: '#63BDD0', mid: '#84CCD8', near: '#A9DDDB' },
  rain: { deep: '#8BA8B5', mid: '#9DB6BE', near: '#B0C6C5' },
  rainbow: { deep: '#5AC6DB', mid: '#80D3DE', near: '#A8E3DF' },
};
const SAND = { sunny: '#F1DDB0', breezy: '#F1DDB0', rain: '#D8C39C', rainbow: '#F3E0B4' };
const SAND_SHADE = { sunny: '#DEC28C', breezy: '#DEC28C', rain: '#C3AA80', rainbow: '#E0C590' };
const SAND_BOTTOM = { sunny: '#EAD3A2', breezy: '#EAD3A2', rain: '#CFB990', rainbow: '#ECD6A6' };
const TINT = { sunny: ['#FFFFFF', 0], breezy: ['#F4FAFC', 0.05], rain: ['#9CA9BC', 0.2], rainbow: ['#FFF4E6', 0.05] };
const HAZE = { sunny: '#CFEAF3', breezy: '#DCEEF4', rain: '#C4CED7', rainbow: '#E8EEEA' };
const RIM = { sunny: '#FFFFFF', breezy: '#FFFFFF', rain: '#E6ECF2', rainbow: '#FFF6EA' };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#3C3842', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
const WOOD = '#C9A47C', WOOD_L = '#E3C9A0', WOOD_D = '#9C7754', STONE = '#BEB6AC', IRON = '#8E8C94', ROPE = '#DCC7A2';
const LEAF = { c: '#86B88F', s: '#6A9C78', l: '#AAD1A6' };   // muted sage-teal palm green (NOT answer green #4CC26B)
const GLOW = '#FFE0A0';

// =====================================================================================================
// FAR (0 0 1200 720): sea horizon, islands, lighthouse, anchored ship
// =====================================================================================================
function lighthouse(m, x, by, hz) {
  const body = tone(m, '#F4ECDF', hz), band = tone(m, '#D6B2A8', hz), cap = tone(m, '#A99A9C', hz), glass = m === 'rain' ? '#FFE6A8' : tone(m, '#FFF3CF', hz);
  const ol = dk(body, 0.28);
  let s = '';
  const top = by - 96, bw = 16, tw = 11;
  const xAt = (y, side) => x + side * (bw + (tw - bw) * (by - y) / (by - top));
  s += P(T`M${x - bw} ${by}L${x - tw} ${top}L${x + tw} ${top}L${x + bw} ${by}Z`, body, OL(ol, 2));
  for (const [y0, y1] of [[by - 26, by - 44], [by - 62, by - 80]]) s += P(T`M${xAt(y0, -1)} ${y0}L${xAt(y1, -1)} ${y1}L${xAt(y1, 1)} ${y1}L${xAt(y0, 1)} ${y0}Z`, band);
  s += P(T`M${x + 4} ${by}L${x + 6} ${top}L${x + tw} ${top}L${x + bw} ${by}Z`, dk(body, 0.08), ' opacity="0.55"');
  s += R(x - 3.5, by - 22, 7, 12, dk(body, 0.3), ' rx="3.5"');                          // door
  s += R(x - tw - 5, top - 4, 2 * tw + 10, 5, cap, ' rx="2"');                           // gallery
  s += R(x - 9, top - 20, 18, 16, glass, OL(cap, 2));                                     // lamp room
  s += P(T`M${x - 12} ${top - 20}L${x} ${top - 36}L${x + 12} ${top - 20}Z`, cap, OL(dk(cap, 0.2), 1.6)) + C(x, top - 38, 2.6, cap);
  return { s, lamp: [x, top - 12] };
}
function shipFar(m, x, wl, hz) {
  const hull = tone(m, '#A9876B', hz), hd = dk(hull, 0.3), cream = tone(m, '#F6EEDC', hz * 0.8), sh = tone(m, '#E2D4BA', hz * 0.8), mast = tone(m, '#8D7260', hz);
  let s = '';
  // masts + rigging
  s += S(T`M${x + 4} ${wl - 30}L${x + 4} ${wl - 176}M${x + 46} ${wl - 32}L${x + 46} ${wl - 138}M${x - 46} ${wl - 30}L${x - 46} ${wl - 122}`, mast, 3.4);
  s += S(T`M${x + 4} ${wl - 176}L${x + 104} ${wl - 38}M${x + 4} ${wl - 176}L${x - 76} ${wl - 40}M${x + 46} ${wl - 138}L${x + 104} ${wl - 38}`, mast, 1, ' opacity="0.7"');
  // sails (bellied, cream)
  const sail = (cx, yt, yb, w) => {
    const l = cx - w / 2, r = cx + w / 2, b = (yb - yt) * 0.22;
    return P(T`M${l} ${yt}L${r} ${yt}Q${r + 5} ${(yt + yb) / 2} ${r - 2} ${yb}Q${cx} ${yb + b} ${l + 2} ${yb}Q${l - 5} ${(yt + yb) / 2} ${l} ${yt}Z`, cream, OL(sh, 1.6)) +
      P(T`M${cx + w * 0.18} ${yt + 2}L${r - 1} ${yt + 2}Q${r + 3} ${(yt + yb) / 2} ${r - 3} ${yb - 1}Q${cx + w * 0.3} ${yb + b * 0.8} ${cx + w * 0.16} ${yb}Z`, sh, ' opacity="0.7"') +
      S(T`M${l - 3} ${yt}L${r + 3} ${yt}`, mast, 2.4);
  };
  s += sail(x + 4, wl - 166, wl - 132, 54) + sail(x + 4, wl - 126, wl - 76, 74);
  s += sail(x + 46, wl - 128, wl - 102, 42) + sail(x + 46, wl - 96, wl - 58, 54);
  s += sail(x - 46, wl - 114, wl - 66, 46);
  s += P(T`M${x + 50} ${wl - 132}L${x + 100} ${wl - 42}L${x + 54} ${wl - 44}Z`, cream, OL(sh, 1.4));                  // jib
  s += P(T`M${x + 4} ${wl - 178}L${x + 22} ${wl - 173}L${x + 4} ${wl - 168}Z`, cream);                                   // plain cream pennant
  // hull
  s += P(T`M${x - 84} ${wl - 30}L${x - 84} ${wl - 44}L${x - 48} ${wl - 44}L${x - 46} ${wl - 32}L${x + 78} ${wl - 36}L${x + 104} ${wl - 40}L${x + 80} ${wl - 30}Q${x + 72} ${wl - 4} ${x + 52} ${wl}L${x - 60} ${wl}Q${x - 78} ${wl - 10} ${x - 84} ${wl - 30}Z`, hull, OL(hd, 2.2));
  s += S(T`M${x - 82} ${wl - 25}L${x + 76} ${wl - 29}`, cream, 3.4);
  s += S(T`M${x - 74} ${wl - 12}Q${x} ${wl - 6} ${x + 66} ${wl - 14}`, dk(hull, 0.15), 3, ' opacity="0.7"');
  for (let k = 0; k < 5; k++) s += C(x - 50 + k * 26, wl - 18, 3, dk(hull, 0.35));
  s += R(x - 82, wl - 48, 32, 5, dk(hull, 0.1), ' rx="2"');
  // anchor rope to the water + reflection
  s += S(T`M${x + 74} ${wl - 26}Q${x + 84} ${wl - 10} ${x + 86} ${wl + 6}`, mast, 1.4, ' opacity="0.8"');
  return s;
}
function far(m) {
  const r = rng(17 + MOODS.indexOf(m)), sea = SEA[m], hz = m === 'rain' ? 0.42 : 0.3;
  let o = '', defs = '';
  const H0 = HORIZON;
  // haze just above the horizon (islands melt into it)
  defs += lg('hz', [[0, HAZE[m], 0], [1, HAZE[m], m === 'rain' ? 0.75 : 0.55]], V);
  o += R(0, H0 - 70, W, 72, 'url(#hz)');
  // ---- islands (behind the sea band edge) ----
  // lighthouse island (x 200)
  const isl = (x0, x1, top, green, fn) => {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    let s = P(T`M${x0} ${H0 + 3}Q${x0 + w * 0.12} ${H0 - top * 0.55} ${x0 + w * 0.32} ${H0 - top * 0.8}Q${cx} ${H0 - top * 1.12} ${x1 - w * 0.3} ${H0 - top * 0.86}Q${x1 - w * 0.1} ${H0 - top * 0.6} ${x1} ${H0 + 3}Z`, green);
    s += P(T`M${cx + w * 0.06} ${H0 - top * 0.98}Q${x1 - w * 0.26} ${H0 - top * 0.82} ${x1 - w * 0.12} ${H0 - top * 0.5}Q${x1 - w * 0.04} ${H0 - top * 0.2} ${x1} ${H0 + 3}L${cx + w * 0.2} ${H0 + 3}Q${cx + w * 0.22} ${H0 - top * 0.5} ${cx + w * 0.06} ${H0 - top * 0.98}Z`, dk(green, 0.1), ' opacity="0.6"');
    s += P(T`M${x0 - 8} ${H0 + 4}Q${cx} ${H0 - 16} ${x1 + 8} ${H0 + 4}Z`, tone(m, '#EDDCB5', hz));       // sandy rim
    return s + (fn ? fn(cx) : '');
  };
  const gA = tone(m, '#9CC3A2', hz), gB = tone(m, '#A3C6A6', hz + 0.12);
  let lamp = null;
  o += isl(80, 340, 64, gA, cx => {
    let s = '';
    for (const [dx, dy, rr] of [[-78, -30, 15], [-60, -40, 17], [62, -38, 15], [82, -26, 13]]) s += C(cx + dx, H0 + dy, rr, tone(m, '#8DB996', hz));
    const lh = lighthouse(m, cx + 26, H0 - 64, hz); lamp = lh.lamp;
    s += R(cx - 22, H0 - 64, 26, 18, tone(m, '#E9DCC6', hz), OL(tone(m, '#BFAE98', hz), 1.6)) + P(T`M${cx - 26} ${H0 - 64}L${cx - 9} ${H0 - 76}L${cx + 8} ${H0 - 64}Z`, tone(m, '#B89E94', hz));   // keeper's cottage
    return s + lh.s;
  });
  if (m === 'rain' && lamp) { defs += rg('lh', [[0, GLOW, 0.85], [0.3, GLOW, 0.35], [1, GLOW, 0]]); o += C(lamp[0], lamp[1], 34, 'url(#lh)'); }
  // small palm island (x 930)
  o += isl(860, 1010, 32, gB, cx => {
    let s = '';
    for (const [dx, h, lean] of [[-18, 54, -10], [16, 44, 9]]) {
      const bx = cx + dx, by = H0 - 22, tx = bx + lean, ty = by - h, tr = tone(m, '#B59A7C', hz + 0.12), lf = tone(m, '#86B190', hz + 0.12);
      s += S(T`M${bx} ${by}Q${bx + lean * 0.2} ${by - h * 0.5} ${tx} ${ty}`, tr, 3.2);
      for (const a of [-160, -125, -55, -20, 20, 160]) { const rad = a * Math.PI / 180; s += S(T`M${tx} ${ty}Q${tx + Math.cos(rad) * 12} ${ty + Math.sin(rad) * 12 - 5} ${tx + Math.cos(rad) * 22} ${ty + Math.sin(rad) * 18 + 6}`, lf, 3.6); }
    }
    return s;
  });
  // rock islet across the seam (x 1150)
  o += both(xx => P(T`M${xx - 46} ${H0 + 3}Q${xx - 40} ${H0 - 14} ${xx - 24} ${H0 - 18}Q${xx - 14} ${H0 - 34} ${xx + 2} ${H0 - 28}Q${xx + 22} ${H0 - 24} ${xx + 30} ${H0 - 10}Q${xx + 42} ${H0 - 8} ${xx + 48} ${H0 + 3}Z`, tone(m, '#B7B4B2', hz + 0.08)) +
    P(T`M${xx + 2} ${H0 - 28}Q${xx + 22} ${H0 - 24} ${xx + 30} ${H0 - 10}Q${xx + 42} ${H0 - 8} ${xx + 48} ${H0 + 3}L${xx + 8} ${H0 + 3}Z`, tone(m, '#A6A2A2', hz + 0.08), ' opacity="0.7"'), 1150, 50);
  // ---- the sea band ----
  defs += lg('sea', [[0, sea.deep], [1, sea.mid]], V);
  o += R(0, H0, W, FAR_BOTTOM - H0, 'url(#sea)');
  o += R(0, H0, W, 2.4, lt(sea.deep, 0.35), ' opacity="0.8"');
  // ship at anchor, sitting a little in front of the horizon (x 610)
  const wl = H0 + 16;
  o += shipFar(m, 610, wl, m === 'rain' ? 0.36 : 0.22);
  o += S(T`M${548} ${wl + 5}L${598} ${wl + 5}M${612} ${wl + 9}L${660} ${wl + 9}M${570} ${wl + 13}L${606} ${wl + 13}`, dk(sea.deep, 0.12), 2.4, ' opacity="0.45"');
  // sea glints / white caps / mist
  const glints = { sunny: 26, breezy: 14, rain: 8, rainbow: 30 }[m];
  let gl = '';
  for (let i = 0; i < glints; i++) {
    const y = H0 + 14 + r() * 140, d = (y - H0) / 160, len = 8 + d * 26 + r() * 10, x = r() * W;
    if (Math.abs(x - 610) < 100 && y < H0 + 30) continue;
    gl += both(xx => S(T`M${xx - len / 2} ${y}L${xx + len / 2} ${y}`, '#FFFFFF', 1.6 + d * 2), x, len / 2 + 3);
  }
  o += g(gl, ` opacity="${m === 'rain' ? 0.25 : 0.5}"`);
  if (m === 'breezy') {   // little white caps all over the sea band, bigger nearer
    let wc = '';
    for (let i = 0; i < 48; i++) {
      const y = H0 + 10 + r() * 146, d = (y - H0) / 160, s = 5 + d * 10, x = r() * W;
      if (Math.abs(x - 610) < 96 && y < H0 + 26) continue;
      wc += both(xx => P(T`M${xx - s * 1.4} ${y}Q${xx - s * 0.3} ${y - s * 0.9} ${xx + s} ${y - s * 0.2}Q${xx + s * 0.2} ${y - s * 0.2} ${xx - s * 1.4} ${y}Z`, '#FFFFFF'), x, s * 1.5);
    }
    o += g(wc, ' opacity="0.85"');
  }
  if (m === 'rainbow') {   // a few bright twinkles on the water
    let tw = '';
    for (let i = 0; i < 9; i++) { const x = r() * W, y = H0 + 20 + r() * 120, s = 3 + r() * 3; tw += both(xx => P(T`M${xx} ${y - s * 2}Q${xx + s * 0.3} ${y - s * 0.3} ${xx + s * 2} ${y}Q${xx + s * 0.3} ${y + s * 0.3} ${xx} ${y + s * 2}Q${xx - s * 0.3} ${y + s * 0.3} ${xx - s * 2} ${y}Q${xx - s * 0.3} ${y - s * 0.3} ${xx} ${y - s * 2}Z`, '#FFFFFF'), x, s * 2 + 1); }
    o += g(tw, ' opacity="0.9"');
  }
  if (m === 'rain') {   // soft mist band over the horizon + a greyer veil on the sea
    defs += lg('mist', [[0, '#E4EAEF', 0], [0.55, '#E4EAEF', 0.6], [1, '#E4EAEF', 0]], V);
    o += R(0, H0 - 60, W, 110, 'url(#mist)');
  }
  return svg(1200, 720, o, defs, `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): waterline foam + beach sand strip + props
// =====================================================================================================
const yw = x => WL + 3 * Math.sin(2 * Math.PI * x / 150) + 2.2 * Math.sin(2 * Math.PI * x / 400 + 1);
function rocks(m, x, sc = 1, seed = 1) {
  const r = rng(seed), st = tone(m, STONE), sd = dk(st, 0.18), so = dk(st, 0.36);
  let s = E(x, PY + 2, 56 * sc, 7 * sc, dk(SAND[m], 0.2), ' opacity="0.45"');
  const blobs = [[-30, -18, 26, 20], [10, -30, 34, 30], [42, -14, 20, 15], [-8, -8, 22, 12]];
  for (const [dx, dy, rx, ry] of blobs) {
    const cx = x + dx * sc, cy = PY + dy * sc, rx2 = rx * sc, ry2 = ry * sc;
    const d = T`M${cx - rx2} ${cy + ry2 * 0.7}Q${cx - rx2 * 1.05} ${cy - ry2 * 0.4} ${cx - rx2 * 0.4} ${cy - ry2 * 0.9}Q${cx + rx2 * 0.1} ${cy - ry2 * 1.15} ${cx + rx2 * 0.6} ${cy - ry2 * 0.75}Q${cx + rx2 * 1.05} ${cy - ry2 * 0.3} ${cx + rx2} ${cy + ry2 * 0.7}Z`;
    s += P(d, st, OL(so, 2.4));
    s += P(T`M${cx + rx2 * 0.2} ${cy - ry2 * 1.0}Q${cx + rx2 * 0.95} ${cy - ry2 * 0.5} ${cx + rx2} ${cy + ry2 * 0.7}L${cx + rx2 * 0.1} ${cy + ry2 * 0.7}Q${cx + rx2 * 0.5} ${cy - ry2 * 0.1} ${cx + rx2 * 0.2} ${cy - ry2 * 1.0}Z`, sd, ' opacity="0.7"');
    s += E(cx - rx2 * 0.4, cy - ry2 * 0.45, rx2 * 0.28, ry2 * 0.16, lt(st, 0.45), ` opacity="0.8" transform="rotate(-20 ${f(cx - rx2 * 0.4)} ${f(cy - ry2 * 0.45)})"`);
    void r;
  }
  return s;
}
function tuft(m, x, y, sc = 1) {
  const c = tone(m, '#A9C094'), d = dk(c, 0.25);
  let s = '';
  for (const [a, l] of [[-0.9, 16], [-0.45, 22], [0, 26], [0.4, 21], [0.85, 15]]) s += S(T`M${x + a * 3 * sc} ${y}Q${x + a * 10 * sc} ${y - l * 0.6 * sc} ${x + a * 16 * sc} ${y - l * sc}`, a === 0 ? c : d, 2.6 * sc);
  return s;
}
function hut(m, x) {
  const rain = m === 'rain', wall = tone(m, WOOD_L), wd = dk(wall, 0.3), roof = tone(m, '#D0B37E'), rd = dk(roof, 0.28), door = tone(m, WOOD_D);
  const base = PY - 2, top = 204;
  let s = E(x + 6, PY + 2, 86, 8, dk(SAND[m], 0.2), ' opacity="0.5"');
  // stilts + porch
  s += R(x - 70, base - 8, 140, 8, tone(m, WOOD), OL(dk(tone(m, WOOD), 0.3), 2));
  // walls with planks
  s += R(x - 60, top, 120, base - 8 - top, wall, OL(wd, 2.6));
  let pl = ''; for (let k = 1; k < 8; k++) pl += T`M${x - 60 + k * 15} ${top + 4}L${x - 60 + k * 15} ${base - 10}`;
  s += S(pl, dk(wall, 0.14), 1.4, ' opacity="0.7"');
  s += R(x + 40, top, 20, base - 8 - top, dk(wall, 0.08), ' opacity="0.6"');
  // round window
  const wx = x - 26, wy = top + 32;
  if (rain) s += C(wx, wy, 34, 'url(#hglow)');
  s += C(wx, wy, 15, tone(m, WOOD), OL(dk(tone(m, WOOD), 0.35), 2.2)) + C(wx, wy, 11, rain ? '#FFDF9E' : tone(m, '#D4E6EA'));
  s += S(T`M${wx - 11} ${wy}L${wx + 11} ${wy}M${wx} ${wy - 11}L${wx} ${wy + 11}`, tone(m, WOOD), 2.2);
  if (!rain) s += P(T`M${wx - 7} ${wy + 5}L${wx + 1} ${wy - 8}L${wx + 5} ${wy - 6}L${wx - 3} ${wy + 7}Z`, '#FFFFFF', ' opacity="0.5"');
  // door
  s += P(T`M${x + 12} ${base - 8}L${x + 12} ${top + 30}Q${x + 26} ${top + 16} ${x + 40} ${top + 30}L${x + 40} ${base - 8}Z`, door, OL(dk(door, 0.3), 2));
  s += C(x + 34, top + 54, 2.4, tone(m, '#E2CC94'));
  // thatched roof with a fringe
  let fr = '';
  for (let k = 12; k >= 0; k--) fr += T`L${x - 84 + k * 14} ${top + 8 + (k % 2 ? 9 : 0)}`;
  s += P(T`M${x - 84} ${top + 8}L${x - 12} ${top - 66}Q${x} ${top - 74} ${x + 12} ${top - 66}L${x + 84} ${top + 8}` + fr + 'Z', roof, OL(rd, 2.6));
  let th = ''; for (let k = -4; k <= 4; k++) th += T`M${x + k * 6} ${top - 62}L${x + k * 19} ${top + 4}`;
  s += S(th, rd, 1.4, ' opacity="0.55"');
  s += P(T`M${x + 10} ${top - 66}L${x + 84} ${top + 8}L${x + 60} ${top + 8}Z`, rd, ' opacity="0.25"');
  // lantern by the door (lit in the rain)
  const lx = x + 54, ly = top + 18;
  if (rain) s += C(lx, ly + 10, 28, 'url(#hglow)');
  s += S(T`M${lx} ${top + 6}L${lx} ${ly}`, tone(m, IRON), 1.6) + R(lx - 6, ly, 12, 16, rain ? '#FFE3A6' : tone(m, '#F2E6C4'), ` rx="3"${OL(tone(m, IRON), 1.8)}`) + R(lx - 7, ly - 2, 14, 4, tone(m, IRON), ' rx="2"');
  return s;
}
function barrel(m, x, y = PY, sc = 1) {
  const c = tone(m, '#BE9469'), d = dk(c, 0.3), band = tone(m, '#8C7E72');
  const w = 30 * sc, h = 38 * sc;
  let s = E(x, y + 1, w * 0.62, 4, dk(SAND[m], 0.22), ' opacity="0.5"');
  s += P(T`M${x - w / 2} ${y}Q${x - w * 0.62} ${y - h / 2} ${x - w / 2} ${y - h}L${x + w / 2} ${y - h}Q${x + w * 0.62} ${y - h / 2} ${x + w / 2} ${y}Z`, c, OL(d, 2.2));
  s += S(T`M${x - w * 0.18} ${y - h + 2}Q${x - w * 0.24} ${y - h / 2} ${x - w * 0.18} ${y - 2}M${x + w * 0.18} ${y - h + 2}Q${x + w * 0.24} ${y - h / 2} ${x + w * 0.18} ${y - 2}`, dk(c, 0.15), 1.4);
  s += S(T`M${x - w * 0.56} ${y - h * 0.28}L${x + w * 0.56} ${y - h * 0.28}M${x - w * 0.56} ${y - h * 0.72}L${x + w * 0.56} ${y - h * 0.72}`, band, 3);
  s += E(x, y - h, w / 2, 3.5 * sc, lt(c, 0.12), OL(d, 1.6));
  return s;
}
function crate(m, x, sz = 30) {
  const c = tone(m, '#CDAB82'), d = dk(c, 0.3);
  return E(x, PY + 1, sz * 0.62, 4, dk(SAND[m], 0.22), ' opacity="0.5"') + R(x - sz / 2, PY - sz, sz, sz, c, ` rx="3"${OL(d, 2.2)}`) +
    S(T`M${x - sz / 2 + 4} ${PY - sz + 4}L${x + sz / 2 - 4} ${PY - 4}M${x - sz / 2 + 2} ${PY - sz / 2}L${x + sz / 2 - 2} ${PY - sz / 2}`, d, 1.6, ' opacity="0.7"');
}
function fence(m, x0, n, step) {
  const post = tone(m, '#AE8F70'), pd = dk(post, 0.3), rope = tone(m, ROPE);
  let s = '', rp = '';
  for (let k = 0; k < n; k++) {
    const x = x0 + k * step;
    s += E(x, PY + 1, 8, 2.6, dk(SAND[m], 0.22), ' opacity="0.5"') + R(x - 4.5, PY - 40, 9, 40, post, ` rx="3"${OL(pd, 2)}`) + E(x, PY - 40, 4.5, 2, lt(post, 0.2));
    if (k < n - 1) rp += T`M${x} ${PY - 32}Q${x + step / 2} ${PY - 20} ${x + step} ${PY - 32}M${x} ${PY - 16}Q${x + step / 2} ${PY - 6} ${x + step} ${PY - 16}`;
  }
  return s + S(rp, dk(rope, 0.3), 3.6) + S(rp, rope, 2);
}
function rowboat(m, x) {
  const hull = tone(m, '#D3B28C'), hd = dk(hull, 0.32), stripe = tone(m, '#A9C4BE'), inner = dk(hull, 0.18), oar = tone(m, '#B89A78');
  let s = E(x, PY + 2, 70, 7, dk(SAND[m], 0.22), ' opacity="0.5"');
  let b = '';
  b += S(T`M-40 -40L36 -6M-30 -46L40 -14`, dk(oar, 0.3), 5) + S(T`M-40 -40L36 -6M-30 -46L40 -14`, oar, 3);
  b += E(30, -8, 9, 4, oar, ' transform="rotate(25 30 -8)"');
  b += P('M-64 -26Q0 -36 62 -30L58 -24Q0 -30 -60 -20Z', inner);
  b += P('M-64 -26Q0 -34 62 -30Q58 -4 36 2L-38 2Q-58 -4 -64 -26Z', hull, OL(hd, 2.4));
  b += S('M-60 -21Q0 -28 59 -24', stripe, 5);
  b += S('M-50 -10Q0 -14 48 -10', dk(hull, 0.12), 1.6, ' opacity="0.7"');
  b += S('M-4 -31L-4 -16', hd, 2.4) + C(50, -18, 2.6, tone(m, IRON));
  s += g(b, ` transform="translate(${f(x)} ${PY}) rotate(-5)"`);
  // a rope from the bow to a stake
  s += S(T`M${x + 52} ${PY - 22}Q${x + 70} ${PY - 6} ${x + 84} ${PY - 10}`, tone(m, ROPE), 2) + R(x + 82, PY - 22, 5, 22, tone(m, '#AE8F70'), ' rx="2"');
  return s;
}
function pier(m, x0, x1) {
  const wd = tone(m, WOOD), wdd = dk(wd, 0.3), deck = 200, post = tone(m, '#A98A6C');
  let s = '';
  // posts (they stand in the foam at the waterline)
  for (let x = x0 + 14; x <= x1 - 6; x += 52) {
    s += R(x - 6, deck + 6, 12, yw(x) + 8 - deck - 6, post, ` rx="3"${OL(dk(post, 0.3), 2)}`);
    s += E(x, yw(x) + 7, 13, 3.6, '#FFFFFF', ' opacity="0.85"');
  }
  s += S(T`M${x0 + 14} ${deck + 26}L${x1 - 30} ${deck + 26}`, dk(post, 0.12), 3, ' opacity="0.8"');   // a cross beam
  // deck
  s += R(x0, deck - 2, x1 - x0, 12, wd, ` rx="3"${OL(wdd, 2.2)}`) + R(x0 + 2, deck - 2, x1 - x0 - 4, 3, lt(wd, 0.3), ' opacity="0.7"');
  let pl = ''; for (let x = x0 + 16; x < x1 - 4; x += 16) pl += T`M${x} ${deck - 1}L${x} ${deck + 9}`;
  s += S(pl, wdd, 1.2, ' opacity="0.6"');
  // steps down to the sand at the start
  for (let k = 0; k < 3; k++) s += R(x0 - 18 - k * 12, deck + 22 + k * 22, 28, 8, wd, ` rx="2"${OL(wdd, 1.8)}`);
  s += S(T`M${x0 - 4} ${deck + 6}L${x0 - 40} ${PY - 2}`, post, 5);
  // a lantern post at the end, a bollard with coiled rope
  const lx = x1 - 14;
  s += R(lx - 3.5, deck - 70, 7, 70, post, OL(dk(post, 0.3), 1.8));
  if (m === 'rain') s += C(lx, deck - 64, 30, 'url(#hglow)');
  s += S(T`M${lx} ${deck - 70}L${lx - 14} ${deck - 70}L${lx - 14} ${deck - 64}`, tone(m, IRON), 2) + R(lx - 21, deck - 64, 14, 16, m === 'rain' ? '#FFE3A6' : tone(m, '#F2E6C4'), ` rx="3"${OL(tone(m, IRON), 1.8)}`);
  const bx = x0 + 120;
  s += R(bx - 7, deck - 16, 14, 16, tone(m, IRON), ` rx="5"${OL(dk(tone(m, IRON), 0.3), 1.8)}`);
  s += E(bx + 28, deck - 4, 15, 5, tone(m, ROPE), OL(dk(tone(m, ROPE), 0.3), 1.6)) + E(bx + 28, deck - 7, 10, 3.4, 'none', OL(dk(tone(m, ROPE), 0.3), 1.4));
  return s;
}
function anchor(m, x) {
  const c = tone(m, IRON), d = dk(c, 0.3);
  const a = T`M${x} ${PY - 52}L${x} ${PY - 6}M${x - 12} ${PY - 40}L${x + 12} ${PY - 40}M${x - 20} ${PY - 18}Q${x - 16} ${PY - 4} ${x} ${PY - 4}Q${x + 16} ${PY - 4} ${x + 20} ${PY - 18}`;
  return E(x, PY + 1, 22, 4, dk(SAND[m], 0.22), ' opacity="0.5"') + g(S(a, d, 7.5) + S(a, c, 4.5) + C(x, PY - 56, 5, 'none', OL(d, 3)), ` transform="rotate(12 ${f(x)} ${PY})"`);
}
function mid(m) {
  let o = '', defs = '';
  const sand = SAND[m], wet = mix(sand, '#A88A62', m === 'rain' ? 0.3 : 0.22);
  defs += rg('hglow', [[0, GLOW, 0.9], [0.35, GLOW, 0.4], [1, GLOW, 0]]);
  // a faint second foam line out in the shallows (behind everything)
  let f2 = ''; for (let k = 0; k < 10; k++) { const x = k * 120 + 30; f2 += both(xx => S(T`M${xx} ${yw(xx) - 12}Q${xx + 26} ${yw(xx) - 16} ${xx + 52} ${yw(xx) - 12}`, '#FFFFFF', 2.4), x, 60); }
  o += g(f2, ' opacity="0.55"');
  // sand body (wet near the water → dry), top edge follows the waterline
  defs += lg('ms', [[0, wet], [0.3, mix(wet, sand, 0.5)], [0.62, sand], [1, sand]], V);
  let top = ''; for (let x = 0; x <= W; x += 6) top += (x ? 'L' : 'M') + f(x) + ' ' + f(yw(x) + 2);
  o += P(top + T`L${W} 300L0 300Z`, 'url(#ms)');
  // foam band along the waterline (scalloped lower edge)
  let fo = ''; for (let x = 0; x <= W; x += 6) fo += (x ? 'L' : 'M') + f(x) + ' ' + f(yw(x) - 4);
  for (let x = W; x >= 0; x -= 6) fo += T`L${x} ${yw(x) + 4 + 2.2 * Math.abs(Math.sin(Math.PI * x / 25))}`;
  o += P(fo + 'Z', '#FFFFFF', ` opacity="${m === 'rain' ? 0.7 : 0.9}"`);
  // props, back to front
  const props = [
    [1170, 70, xx => rocks(m, xx, 1.0, 3)],
    [250, 90, xx => hut(m, xx)],
    [560, 210, xx => pier(m, xx - 150, xx + 160)],
    [372, 24, xx => anchor(m, xx)],
    [830, 90, xx => rowboat(m, xx)],
    [952, 20, xx => barrel(m, xx)], [984, 20, xx => barrel(m, xx, PY, 0.9)], [966, 18, xx => barrel(m, xx, PY - 36, 0.82)], [1016, 20, xx => crate(m, xx, 28)],
    [1050, 100, xx => fence(m, xx, 3, 34)],
    [732, 50, xx => rocks(m, xx, 0.55, 5)],
  ];
  for (const [px, half, fn] of props) o += both(fn, px, half);
  const tufts = [[140, PY + 2, 1], [400, PY + 4, 0.8], [760, PY + 2, 0.9], [1120, PY + 6, 1.05], [40, PY + 6, 0.8]];
  for (const [x, y, sc] of tufts) o += both(xx => tuft(m, xx, y, sc), x, 20);
  // small shells on the beach strip
  const r = rng(91 + MOODS.indexOf(m));
  for (let i = 0; i < 8; i++) { const x = r() * W, y = 262 + r() * 30; o += both(xx => E(xx, y, 3.2, 2.2, i % 2 ? '#F6EBDD' : tone(m, '#EAD3C0'), OL(dk(sand, 0.25), 0.9)), x, 5); }
  if (m === 'rain') { let pd = ''; for (const [x, w] of [[120, 34], [560, 26], [1010, 40]]) pd += both(xx => E(xx, 290, w, 4.5, '#C2CFD6', ' opacity="0.8"') + E(xx - w * 0.3, 289, w * 0.3, 1.4, '#FFFFFF', ' opacity="0.6"'), x, w + 2); o += pd; }
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): warm sand, shells, paw prints, ripples, tufts; rain = wet sand + puddles
// =====================================================================================================
function shell(m, x, y, a, kind, sc = 1) {
  const sand = SAND[m];
  if (kind === 0) {   // scallop
    const c = tone(m, '#F5E2D4'), d = dk(c, 0.32);
    let s = P('M0 -9Q-11 -8 -11 1Q-10 5 -5 6L-2 9L2 9L5 6Q10 5 11 1Q11 -8 0 -9Z', c, OL(d, 1.4));
    s += S('M0 -8L0 6M-5 -7L-3 6M5 -7L3 6M-9 -3L-6 5M9 -3L6 5', d, 0.9, ' opacity="0.7"');
    return g(s, ` transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${f(sc)})"`);
  }
  if (kind === 1) {   // spiral
    const c = tone(m, '#EDD9BE'), d = dk(c, 0.32);
    return g(P('M-8 3Q-10 -6 -1 -8Q8 -8 9 0Q9 6 2 7L-6 7Q-9 6 -8 3Z', c, OL(d, 1.4)) + S('M-1 -1Q3 -3 4 1Q4 4 0 4Q-4 3 -3 -1Q-1 -6 5 -5', d, 1.1), ` transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${f(sc)})"`);
  }
  // little starfish (muted sand-apricot, not answer orange)
  const c = tone(m, '#E9C7A2'), d = dk(c, 0.3); const pts = [];
  for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 4 : 10; pts.push([Math.cos(an) * rr, Math.sin(an) * rr]); }
  return g(P(poly(pts), c, OL(d, 1.4)) + C(0, 0, 1.6, lt(c, 0.4)), ` transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${f(sc)})"`);
}
function ground(m) {
  const r = rng(201 + MOODS.indexOf(m)), rain = m === 'rain';
  const sand = SAND[m], shade = SAND_SHADE[m], bot = SAND_BOTTOM[m];
  let o = '', defs = '';
  defs += lg('sd', [[0, sand], [0.5, mix(sand, bot, 0.5)], [1, bot]], V);
  o += R(0, GROUND_LINE, W, 260 - GROUND_LINE, 'url(#sd)');
  // wind ripples (soft lighter / darker arcs, period 1200)
  let rp = '', rl = '';
  for (let row = 0; row < 5; row++) {
    const y = 70 + row * 38, n = 6 + row;
    for (let k = 0; k < n; k++) {
      const x = (k + (row % 2) * 0.5) * W / n + 20, len = 40 + row * 10;
      rp += both(xx => T`M${xx - len / 2} ${y}Q${xx} ${y - 6} ${xx + len / 2} ${y}`, x, len / 2 + 2);
      rl += both(xx => T`M${xx - len / 2} ${y + 2}Q${xx} ${y - 4} ${xx + len / 2} ${y + 2}`, x, len / 2 + 2);
    }
  }
  o += S(rp, shade, 2, ` opacity="${rain ? 0.35 : 0.45}"`) + S(rl, '#FFFFFF', 1.6, ` opacity="${rain ? 0.15 : 0.35}"`);
  // grains
  let gr = ''; for (let i = 0; i < 90; i++) { const x = r() * W, y = 48 + r() * 205, s = 0.8 + r() * 1.3, c = i % 3 ? shade : '#FFFFFF'; gr += both(xx => C(xx, y, s, c), x, s + 1); }
  o += g(gr, ' opacity="0.55"');
  // puppy paw-print trail (period 600 wave)
  let pw = '';
  for (let k = 0; k < 30; k++) {
    const x = k * 40 + 14, y = 150 + 34 * Math.sin(2 * Math.PI * x / 600) + (k % 2 ? 9 : -9), a = 90 + 34 * Math.cos(2 * Math.PI * x / 600) * 0.9;
    pw += both(xx => g(E(0, 2, 5, 4, dk(shade, 0.12)) + C(-5, -4, 1.9, dk(shade, 0.12)) + C(0, -6, 1.9, dk(shade, 0.12)) + C(5, -4, 1.9, dk(shade, 0.12)), ` transform="translate(${f(xx)} ${f(y)}) rotate(${f(a)})"`), x, 9);
  }
  o += g(pw, ` opacity="${rain ? 0.45 : 0.4}"`);
  // shells and starfish
  for (let i = 0; i < 14; i++) { const x = r() * W, y = 60 + r() * 185, a = r() * 360, k = i % 5 === 4 ? 2 : i % 2, sc = 0.9 + r() * 0.5; o += both(xx => shell(m, xx, y, a, k, sc), x, 14 * sc); }
  // pebbles
  for (let i = 0; i < 10; i++) { const x = r() * W, y = 60 + r() * 185, s = 2.5 + r() * 2.5; o += both(xx => E(xx, y, s * 1.3, s, tone(m, '#CFC5B8'), OL(tone(m, '#AFA597'), 0.9)), x, s * 1.5); }
  // beach grass tufts + a piece of driftwood
  for (const [x, y, sc] of [[90, 58, 1.1], [480, 64, 0.9], [770, 56, 1.0], [1110, 66, 0.85]]) o += both(xx => tuft(m, xx, y, sc), x, 20);
  o += both(xx => { const c = tone(m, '#C9B49A'); return g(R(-34, -4, 68, 8, c, ` rx="4"${OL(dk(c, 0.3), 1.6)}`) + S('M10 -3L22 -12', dk(c, 0.1), 3.4) + S('M-24 0L20 0', dk(c, 0.18), 1, ' opacity="0.6"'), ` transform="translate(${f(xx)} 230) rotate(-6)"`); }, 650, 40);
  if (rain) {   // puddles reflecting the grey sky, with ripple rings
    for (const [x, y, w] of [[180, 96, 62], [620, 176, 78], [980, 120, 54], [380, 224, 46]]) {
      o += both(xx => E(xx, y, w, w * 0.24, '#B5C3CB', OL('#9FAEB8', 1.6)) + E(xx - w * 0.35, y - w * 0.07, w * 0.3, w * 0.05, '#E6EDF1', ' opacity="0.8"') +
        E(xx + w * 0.2, y + 1, w * 0.28, w * 0.08, 'none', OL('#E6EDF1', 1.3) + ' opacity="0.7"') + E(xx - w * 0.1, y + 3, w * 0.14, w * 0.04, 'none', OL('#E6EDF1', 1.1) + ' opacity="0.6"'), x, w + 2);
    }
  }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// PALM (0 0 260 420, base (130, 416)): curved trunk leaning left, crown of fronds, coconuts
// =====================================================================================================
function palm(m) {
  const breezy = m === 'breezy', rain = m === 'rain';
  const tc = tone(m, rain ? '#B8916C' : '#CBA57E'), td = dk(tc, 0.32), ring = dk(tc, 0.18);
  const L0 = rain ? { c: '#6FA07E', s: '#58876A', l: '#93BE98' } : LEAF;
  const lc = tone(m, L0.c), ls = tone(m, L0.s), ll = tone(m, L0.l), lo = dk(ls, 0.3);
  const cx = 94, cy = 104;   // crown centre
  let s = '';
  // ground shadow
  s += E(130, 414, 44, 6, '#7A6A50', ' opacity="0.18"');
  // trunk: cubic from the base (130, 416) up to the crown
  const B0 = [130, 416], B1 = [150, 300], B2 = [84, 200], B3 = [cx + 2, cy + 8];
  const bez = t => { const u = 1 - t; return [0, 1].map(i => u * u * u * B0[i] + 3 * u * u * t * B1[i] + 3 * u * t * t * B2[i] + t * t * t * B3[i]); };
  const der = t => { const u = 1 - t; return [0, 1].map(i => 3 * u * u * (B1[i] - B0[i]) + 6 * u * t * (B2[i] - B1[i]) + 3 * t * t * (B3[i] - B2[i])); };
  const L = [], Rr = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, p = bez(t), d = der(t), n = Math.hypot(d[0], d[1]), nx = -d[1] / n, ny = d[0] / n, w = 15 - 7 * t; L.push([p[0] + nx * w, p[1] + ny * w]); Rr.push([p[0] - nx * w, p[1] - ny * w]); }
  s += P(poly([...L, ...Rr.reverse()]), tc, OL(td, 3));
  Rr.reverse();
  // shaded right side + ring segments
  const half = []; for (let i = 0; i <= 24; i++) { const t = i / 24, p = bez(t); half.push([(p[0] + Rr[i][0]) / 2 + 2, (p[1] + Rr[i][1]) / 2]); }
  s += P(poly([...half, ...Rr.slice().reverse()]), dk(tc, 0.1), ' opacity="0.6"');
  let rg2 = ''; for (let i = 2; i < 24; i += 2) { const a = L[i], b = Rr[i], mdl = bez(i / 24); rg2 += T`M${a[0]} ${a[1]}Q${mdl[0]} ${mdl[1] + 5} ${b[0]} ${b[1]}`; }
  s += S(rg2, ring, 2, ' opacity="0.8"');
  s += S(T`M${L[3][0] + 3} ${L[3][1]}Q${L[10][0] + 4} ${L[10][1]} ${L[18][0] + 3} ${L[18][1]}`, lt(tc, 0.4), 3, ' opacity="0.6"');
  // fronds
  const frond = (ang, len, wid, col, dark, droop) => {
    const a = breezy ? ang + (-6 - ang) * 0.32 : ang;   // breezy: every frond swept towards the right (downwind)
    const rad = a * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
    const dr = droop * (breezy ? 0.75 : 1);
    const p2 = [cx + ux * len, cy + uy * len + dr * len], p1 = [cx + ux * len * 0.55, cy + uy * len * 0.55 - len * 0.18];
    const nx = -uy, ny = ux, w = wid;
    const d = T`M${cx} ${cy}Q${p1[0] + nx * w} ${p1[1] + ny * w} ${p2[0]} ${p2[1]}Q${p1[0] - nx * w * 0.6} ${p1[1] - ny * w * 0.6} ${cx} ${cy}Z`;
    let o = P(d, col, OL(dark, 2.2));
    // leaflet cuts: short lines across the frond in the outline colour
    let cut = '';
    for (let k = 1; k <= 5; k++) {
      const t = k / 6.4, u = 1 - t;
      const mx = u * u * cx + 2 * u * t * p1[0] + t * t * p2[0], my = u * u * cy + 2 * u * t * p1[1] + t * t * p2[1];
      const ww = w * 0.9 * (1 - t * 0.6);
      cut += T`M${mx} ${my}L${mx + nx * ww + ux * 6} ${my + ny * ww + uy * 6}`;
    }
    o += S(cut, dark, 1.6, ' opacity="0.75"');
    o += S(T`M${cx} ${cy}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`, lt(col, 0.25), 1.8, ' opacity="0.8"');
    return o;
  };
  // back fronds (darker)
  for (const [a, l, w, dr] of [[-150, 92, 22, 0.42], [-112, 84, 20, 0.2], [-62, 90, 20, 0.22], [-22, 96, 22, 0.42]]) s += frond(a, l, w, ls, lo, dr);
  // coconuts
  const co = tone(m, '#8F6C4C'), cod = dk(co, 0.3);
  for (const [dx, dy] of [[-10, 14], [8, 16], [-1, 24]]) s += C(cx + dx, cy + dy, 9, co, OL(cod, 2)) + C(cx + dx - 3, cy + dy - 3, 2.6, lt(co, 0.35), ' opacity="0.8"');
  // front fronds (lighter)
  for (const [a, l, w, dr] of [[-176, 104, 24, 0.56], [-132, 100, 24, 0.3], [-88, 82, 20, 0.12], [-42, 104, 24, 0.3], [4, 108, 24, 0.56]]) s += frond(a, l, w, lc, lo, dr);
  s += C(cx, cy, 10, ll) + C(cx - 3, cy - 3, 4, lt(ll, 0.4), ' opacity="0.8"');
  if (rain) for (const [x, y] of [[40, 160], [150, 150], [70, 120], [128, 190]]) s += P(T`M${x} ${y - 5}Q${x + 3} ${y} ${x} ${y + 2}Q${x - 3} ${y} ${x} ${y - 5}Z`, '#E8F1F6', ' opacity="0.85"');
  return svg(260, 420, s);
}

// =====================================================================================================
// SUN, CLOUDS, RAINBOW
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.42], [1, '#FFF2CF', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF2CC', OL('#F2DCA6', 4)) + C(100, 100, 38, '#FFF8E2') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function cloud(type) {
  const blobs = type === 'a' || type === 'rain' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  const shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  if (type === 'rain') {   // grey-lilac rain cloud: darker belly, soft lighter top
    return svg(300, 140, P(body, '#BDBCCE') + P('M20 100Q24 128 46 128L260 128Q282 128 282 104Q270 112 250 110Q200 116 150 110Q100 116 60 110Q34 112 20 100Z', '#A4A3BA') +
      E(112, 52, 30, 10, '#D2D1E0', ' opacity="0.9"') + E(176, 46, 22, 8, '#D2D1E0', ' opacity="0.8"'));
  }
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#E6ECF3', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
}
function rainbow() {
  // a soft semi-transparent arc centred at (600, 600), bands outer → inner, legs fade out towards the bottom
  const bands = ['#F2B3AE', '#F5CDA4', '#F4E3A8', '#C4E2B6', '#B2D6EC', '#C8BEE6'];
  const R0 = 560, bw = 17;
  let arcs = '';
  bands.forEach((c, i) => { const rr = R0 - bw * (i + 0.5); arcs += `<path d="${T`M${600 - rr} 600A${rr} ${rr} 0 0 1 ${600 + rr} 600`}" fill="none" stroke="${c}" stroke-width="${bw + 1}"/>`; });
  const defs = `<filter id="b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
    `<linearGradient id="fd" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="600">${stops([[0, '#FFFFFF'], [0.62, '#FFFFFF'], [1, '#FFFFFF', 0]])}</linearGradient>` +
    `<mask id="mk" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="600"><rect x="0" y="0" width="1200" height="600" fill="url(#fd)"/></mask>`;
  return svg(1200, 600, g(g(arcs, ' filter="url(#b)"'), ' opacity="0.55" mask="url(#mk)"'), defs);
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P(poly(starPts(16, 16.8, 11.5, 5.4)), '#FFF3CF', OL('#FFF3CF', 2.4)) + P(poly(starPts(15.6, 16.2, 6.5, 3)), '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.45], [1, '#FFF6DA', 0]]));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // tropical leaf bits (muted sage palm-frond pieces)
  out.leaf_a = svg(32, 32, `<g transform="rotate(8 16 16)">` + P('M4 22Q10 6 29 5Q24 20 4 22Z', LEAF.c, OL('#4F7F5E', 1.6)) +
    S('M5 21Q16 13 28 6', '#4F7F5E', 1.1) + S('M10 17L9 12M14 14.5L14 9M18 12L19 7.5M22 9.5L24 6M11 18L15 20M15 15.5L20 17M19 13L24 13.5', '#4F7F5E', 1, ' opacity="0.7"') + `</g>`);
  out.leaf_b = svg(32, 32, `<g transform="rotate(24 16 16)">` + P('M16 2Q24 10 22 22Q20 28 16 30Q12 28 10 22Q8 10 16 2Z', LEAF.l, OL('#5E8F6C', 1.6)) +
    P('M16 2Q24 10 22 22Q20 28 16 30Q20 16 16 2Z', LEAF.c, ' opacity="0.7"') + S('M16 30L16 5M16 11L12.5 8.5M16 16L11.5 13M16 21L12 18.5M16 11L19.5 8.5M16 16L20.5 13M16 21L20 18.5', '#5E8F6C', 1.1) + `</g>`);
  // sand: a tiny cluster of warm grains
  out.sand = svg(32, 32, C(12, 15, 4.2, '#E6CC98', OL('#C9AA72', 1)) + C(20, 12, 3.2, '#F1DDB0', OL('#C9AA72', 1)) + C(19, 21, 3.6, '#DEC28C', OL('#C0A06A', 1)) + C(10, 23, 2.2, '#F1DDB0') + C(24, 18, 1.8, '#E6CC98'));
  // rain: a slanted soft streak (white-blue, fades at the tail)
  out.rain = svg(32, 32, S('M22 2L10 30', 'url(#r)', 3.2), `<linearGradient id="r" gradientUnits="userSpaceOnUse" x1="22" y1="2" x2="10" y2="30">${stops([[0, '#FFFFFF', 0], [0.5, '#EEF4F8', 0.7], [1, '#FFFFFF', 0.95]])}</linearGradient>`);
  // splash: a flat ring with two tiny hops
  out.splash = svg(32, 32, E(16, 22, 13, 5, 'none', OL('#FFFFFF', 2.2) + ' opacity="0.9"') + E(16, 22, 7, 2.6, 'none', OL('#FFFFFF', 1.4) + ' opacity="0.6"') + C(8, 13, 1.8, '#FFFFFF') + C(24, 12, 1.6, '#FFFFFF') + C(16, 9, 1.4, '#FFFFFF', ' opacity="0.8"'));
  // droplet: a teardrop with a highlight
  out.droplet = svg(32, 32, P('M16 3Q24 15 24 20Q24 28 16 28Q8 28 8 20Q8 15 16 3Z', '#DDEEF6', OL('#A8C9DA', 1.6)) + E(12.5, 19, 2, 3.6, '#FFFFFF', ' opacity="0.9"'));
  // dust: soft warm sand puff
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#FBF1DC', 0.9], [0.6, '#F1DDB0', 0.45], [1, '#F1DDB0', 0]]));
  // coin: small gold coin with a star stamp (DESIGN §0.2 coin colours)
  out.coin = svg(32, 32, C(16, 16, 13, '#F2C14E', OL('#B8862A', 2)) + C(16, 16, 9.5, 'none', OL('#D9A73E', 1.4)) + P(poly(starPts(16, 16.6, 6, 2.7)), '#FFE6A0', OL('#C99A3A', 0.8)) +
    P('M7 11Q10 5 17 4.5', 'none', OL('#FFF3CC', 2) + ' opacity="0.9"'));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); wr(env, 'palm_' + m, palm(m)); }
  wr(env, 'sun', sun()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b')); wr(env, 'cloud_rain', cloud('rain')); wr(env, 'rainbow', rainbow());
  const ps = particles();
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 4 + ' layers + sun, clouds, rainbow) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, SEA, SAND, SAND_SHADE, SAND_BOTTOM, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, HORIZON, WL, PALM };
if (require.main === module) main();
