// Mầm's Treasure Reef: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground,sun,moon,cloud1..3}.svg and particles/*.svg.
// Preview scenes + seam proof: node tools/env_scenes.js (after this script).
// Usage: node tools/art_env.js
//
// Research brief (toddler-app underwater backgrounds, written from reference reading, no art copied):
// - Water reads "calm" when it is a 2-stop vertical gradient, lighter at the surface, with at most 10–15 % value
//   difference between the background shapes and the water behind them. Day water: turquoise/aqua, greener and
//   lighter than any "blue" answer colour. Morning: peach-pink surface over mint-turquoise. Sunset: coral-orange
//   surface over violet-blue depth. Night: navy over deep indigo, bioluminescent dots instead of light shafts.
// - Light shafts: 3–6 soft white wedges from the surface, tilted 6–12°, alpha 0.08–0.16, fading out at ~60 % of
//   the screen height; warm-tinted at morning/sunset, cool white-cyan at noon, pale moon-blue (and fewer) at night.
// - Shapes: brain coral = dome with wavy lines, staghorn = rounded fingers (never pointy), fan coral = flat lobed
//   fan, tube coral = bundles of rounded cylinders, kelp = long ribbon with round leaves, rocks = smooth boulders.
//   No outlines on far/mid layers (outlines belong to foreground items), one-step cel shade only.
// - To let foreground items pop: desaturate and lighten everything behind the play band, keep the band just above
//   the sand nearly empty (only kelp tips), push the detail to the sand line where chests stand, and keep the
//   far layer semi-transparent so it inherits the water colour of each time of day.
//
// Tiling technique (same as the sister games): every band is a sum of sines with integer periods over W, and every
// object near an edge is drawn again at x±W, so the left and right edges match exactly.
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
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); return line(pts); }
const lg = (id, x1, y1, x2, y2, stops, units = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
// smooth closed blob through points (Catmull-Rom → cubic), used for rocks / domes / lobes
function blob(pts, tension = 0.5) {
  const n = pts.length; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3];
    const c2 = [p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// ---------------- palette (calm, far from the answer palette) ----------------
const C = {
  // far: pale blue-teal silhouettes (semi-transparent so they take the water colour of the time of day)
  farBack: '#7FBFCF', farFront: '#5FA7BD', farShip: '#5A9FB5', farHaze: '#CFEFF2',
  // mid: muted coral, kelp, rocks, a distant sand shelf
  shelf: '#D6CBA8', shelfSh: '#C6B994', shelfHi: '#E6DDBE',
  pink: '#E9A3B8', pinkSh: '#D48CA4', pinkHi: '#F4C3D1', pinkLine: '#C97E97',
  lilac: '#C9A9E0', lilacSh: '#B08FCB', lilacHi: '#DDC6EC', lilacLine: '#A182BB',
  kelp: '#7FA66B', kelpSh: '#6B9159', kelpHi: '#99BD86',
  rock: '#B9B2A0', rockSh: '#9F978A', rockHi: '#D0CABB',
  anem: '#E8B9A0', anemSh: '#D3A088', tent: '#D9A8C9', tentSh: '#C692B5', face: '#8A6A62',
  peach: '#EFC9A8', peachSh: '#D9AE8C',
  // ground: sand
  sandTop: '#F2DFB3', sandLow: '#E3C98E', sandRim: '#FAEDCB', sandSh: '#D9C18A', sandDeep: '#CDB27A', shell: '#FBF3E2', shellSh: '#E7D2B8', shellPink: '#F5D2CF',
};

// ---------------- far.svg (0 0 1200 420) ----------------
// A soft reef skyline in two tiers plus a friendly sunken ship; everything semi-transparent, no outlines.
function reefBumps(x0, base, items, col, op) {
  // items: [dx, w, h, kind] kind 0 dome, 1 fingers, 2 fan
  let o = '';
  items.forEach(([dx, w, h, kind]) => {
    const x = x0 + dx;
    if (kind === 0) o += P(blob([[x - w / 2, base], [x - w * 0.42, base - h * 0.6], [x - w * 0.15, base - h], [x + w * 0.2, base - h * 0.95], [x + w * 0.45, base - h * 0.55], [x + w / 2, base]]), col, ` opacity="${op}"`);
    else if (kind === 1) {
      let d = '';
      const n = 3 + (w > 50 ? 1 : 0);
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n * 2 - 1; const hx = x + u * w * 0.4, top = base - h * (0.75 + 0.25 * Math.cos(u * 1.6)); d += `M${f(x + u * w * 0.15)} ${f(base)}Q${f(hx)} ${f(base - h * 0.45)} ${f(hx + u * 6)} ${f(top)}`; }
      o += strokeP(d, col, w * 0.22, ` opacity="${op}"`);
    } else o += P(`M${f(x - w * 0.12)} ${f(base)}L${f(x - w * 0.5)} ${f(base - h * 0.55)}Q${f(x - w * 0.45)} ${f(base - h * 0.95)} ${f(x - w * 0.15)} ${f(base - h * 0.85)}Q${f(x)} ${f(base - h * 1.05)} ${f(x + w * 0.15)} ${f(base - h * 0.85)}Q${f(x + w * 0.45)} ${f(base - h * 0.95)} ${f(x + w * 0.5)} ${f(base - h * 0.55)}L${f(x + w * 0.12)} ${f(base)}Z`, col, ` opacity="${op}"`);
  });
  return o;
}
function farKelp(x, base, h, col, op, ph) {
  // single soft ribbon silhouette with a few round leaves, two sine bends
  const pt = t => [x + Math.sin(t * 4 + ph) * h * 0.08 * t, base - h * t];
  const pts = []; for (let i = 0; i <= 10; i++) pts.push(pt(i / 10));
  let o = strokeP(line(pts), col, 7, ` opacity="${op}"`);
  for (let i = 1; i <= 3; i++) { const p = pt(i / 3.4), side = i % 2 ? -1 : 1; o += ell(p[0] + side * 9, p[1] - 4, 9, 5.5, col, ` opacity="${op}" transform="rotate(${side * 30} ${f(p[0])} ${f(p[1])})"`); }
  return o;
}
function ship(x, base, op) {
  // friendly rounded hull tilted a little, a stubby mast with a drooping flag shape, round portholes (lighter), no detail lines
  const col = C.farShip;
  let o = `<g transform="rotate(-7 ${f(x)} ${f(base)})" opacity="${op}">`;
  o += P(`M${f(x - 150)} ${f(base - 70)}Q${f(x - 140)} ${f(base - 10)} ${f(x - 90)} ${f(base)}L${f(x + 110)} ${f(base)}Q${f(x + 160)} ${f(base - 20)} ${f(x + 170)} ${f(base - 78)}Q${f(x + 60)} ${f(base - 60)} ${f(x - 150)} ${f(base - 70)}Z`, col);
  // bow swoosh (lighter)
  o += P(`M${f(x - 150)} ${f(base - 70)}Q${f(x - 60)} ${f(base - 56)} ${f(x + 170)} ${f(base - 78)}Q${f(x + 60)} ${f(base - 50)} ${f(x - 150)} ${f(base - 70)}Z`, C.farHaze, ' opacity="0.35"');
  // cabin + mast
  o += `<rect x="${f(x + 30)}" y="${f(base - 118)}" width="72" height="56" rx="12" fill="${col}"/>`;
  o += `<rect x="${f(x - 30)}" y="${f(base - 215)}" width="12" height="150" rx="6" fill="${col}"/>`;
  o += P(`M${f(x - 18)} ${f(base - 204)}Q${f(x + 60)} ${f(base - 200)} ${f(x + 84)} ${f(base - 166)}Q${f(x + 70)} ${f(base - 150)} ${f(x + 40)} ${f(base - 152)}Q${f(x + 10)} ${f(base - 150)} ${f(x - 18)} ${f(base - 142)}Z`, col, ' opacity="0.9"');
  o += circ(x - 30, base - 222, 8, col);
  // portholes (haze colour, soft)
  [-100, -60, -20].forEach(dx => { o += circ(x + dx, base - 32, 7, C.farHaze, ' opacity="0.5"'); });
  o += circ(x + 66, base - 92, 7, C.farHaze, ' opacity="0.5"');
  return o + '</g>';
}
function genFar() {
  const defs = lg('haze', 0, 0, 0, 1, [[0, C.farHaze, 0], [0.5, C.farHaze, 0.18], [1, C.farHaze, 0.38]]);
  let o = '';
  // back tier: a gentle rolling reef silhouette with soft domes and fingers (period sines → tileable)
  const backY = x => 322 + wave([[20, 1, 0.5], [13, 3, 1.9], [6, 6, 0.2], [3, 11, 1.4]])(x);
  o += P(bandD(backY, 420), C.farBack, ' opacity="0.42"');
  const backItems = [[60, [[0, 70, 40, 0], [52, 36, 48, 1], [-50, 44, 30, 2]]], [250, [[0, 56, 34, 0], [40, 40, 44, 2]]], [430, [[0, 48, 56, 1], [-44, 64, 36, 0]]],
    [640, [[0, 80, 44, 0], [60, 40, 52, 1]]], [910, [[0, 60, 36, 0], [-50, 44, 46, 2], [52, 40, 40, 1]]], [1100, [[0, 66, 42, 0], [56, 34, 50, 1]]]];
  backItems.forEach(([x, items]) => { o += wrap(x, 100, xx => reefBumps(xx, backY(xx) + 4, items, C.farBack, 0.42)); });
  [[150, 150, 0.4], [360, 120, 1.2], [560, 170, 2.2], [1010, 140, 0.8], [1190, 130, 3.0]].forEach(([x, h, ph]) => { o += wrap(x, 30, xx => farKelp(xx, backY(xx) + 6, h, C.farBack, 0.38, ph)); });
  // the sunken ship rests on the back tier, right of centre
  o += wrap(780, 200, xx => ship(xx, backY(xx) + 26, 0.42));
  o += `<rect x="0" y="200" width="${W}" height="220" fill="url(#haze)"/>`;
  // front tier: slightly deeper teal, lower
  const frontY = x => 374 + wave([[12, 2, 2.4], [8, 4, 0.9], [4, 9, 1.6]])(x);
  o += P(bandD(frontY, 420), C.farFront, ' opacity="0.45"');
  const frontItems = [[140, [[0, 60, 30, 0], [48, 30, 36, 1]]], [380, [[0, 44, 38, 2], [-40, 50, 26, 0]]], [600, [[0, 70, 36, 0]]], [820, [[0, 40, 40, 1], [44, 54, 28, 0]]], [1040, [[0, 56, 32, 2], [52, 36, 34, 1]]]];
  frontItems.forEach(([x, items]) => { o += wrap(x, 80, xx => reefBumps(xx, frontY(xx) + 4, items, C.farFront, 0.45)); });
  [[260, 110, 1.1], [700, 130, 2.6], [950, 100, 0.3]].forEach(([x, h, ph]) => { o += wrap(x, 30, xx => farKelp(xx, frontY(xx) + 6, h, C.farFront, 0.42, ph)); });
  return svg(1200, 420, o, defs);
}

// ---------------- mid.svg (0 0 1200 360) ----------------
function rock(x, y, w, h, seed) {
  const r = rng(seed);
  const pts = [[-0.5, 0], [-0.52, -0.45], [-0.3, -0.9], [0.1, -1], [0.45, -0.75], [0.54, -0.3], [0.5, 0]].map(([u, v]) => [x + u * w + (r() - 0.5) * w * 0.05, y + v * h]);
  let o = ell(x + w * 0.05, y + 2, w * 0.6, h * 0.1, C.shelfSh, ' opacity="0.6"');
  o += P(blob(pts, 0.7), C.rock);
  // one-step shade on the right-bottom: offset copy clipped by drawing a lighter blob over the top-left
  o += P(blob(pts.map(([px, py]) => [px, py]), 0.7), C.rockSh);
  o += P(blob(pts.map(([px, py]) => [px - w * 0.06, py - h * 0.1]), 0.7), C.rock);
  o += ell(x - w * 0.18, y - h * 0.68, w * 0.14, h * 0.09, C.rockHi, ` opacity="0.85" transform="rotate(-25 ${f(x - w * 0.18)} ${f(y - h * 0.68)})"`);
  return o;
}
function brainCoral(x, y, w, h, col, sh, hi, lineCol) {
  const pts = [[x - w / 2, y], [x - w * 0.46, y - h * 0.55], [x - w * 0.22, y - h * 0.95], [x + w * 0.1, y - h], [x + w * 0.4, y - h * 0.7], [x + w / 2, y]];
  let o = ell(x, y + 2, w * 0.55, h * 0.1, C.shelfSh, ' opacity="0.6"');
  o += P(blob(pts, 0.6), sh);
  o += P(blob(pts.map(([px, py]) => [px - w * 0.05, py - h * 0.08]), 0.6), col);
  // wavy brain lines: three short wiggles
  let d = '';
  [[-0.28, -0.55, 0.26], [-0.05, -0.75, 0.22], [0.12, -0.45, 0.24], [-0.2, -0.25, 0.2]].forEach(([u, v, len]) => {
    const sx = x + u * w, sy = y + v * h, l = len * w;
    d += `M${f(sx)} ${f(sy)}q${f(l * 0.25)} ${f(-h * 0.08)} ${f(l * 0.5)} 0t${f(l * 0.5)} 0`;
  });
  o += strokeP(d, lineCol, 3, ' opacity="0.7"');
  o += ell(x - w * 0.22, y - h * 0.78, w * 0.1, h * 0.07, hi, ` opacity="0.9" transform="rotate(-20 ${f(x - w * 0.22)} ${f(y - h * 0.78)})"`);
  return o;
}
function fingerCoral(x, y, h, col, sh, hi, seed) {
  // staghorn: a short trunk and 4–5 rounded fingers (thick round-capped strokes), tips lighter
  const r = rng(seed); const n = 4 + (r() > 0.5 ? 1 : 0);
  let d = '', tips = '';
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, top = y - h * (0.72 + 0.28 * Math.cos(u * 1.5) + (r() - 0.5) * 0.1);
    const mx = x + u * h * 0.32, tx = mx + u * h * 0.1;
    d += `M${f(x + u * h * 0.08)} ${f(y - h * 0.12)}Q${f(mx)} ${f(y - h * 0.45)} ${f(tx)} ${f(top)}`;
    tips += circ(tx, top, h * 0.045, hi);
  }
  let o = ell(x, y + 2, h * 0.4, h * 0.06, C.shelfSh, ' opacity="0.6"');
  o += strokeP(`M${f(x)} ${f(y)}L${f(x)} ${f(y - h * 0.2)}`, sh, h * 0.2);
  o += strokeP(d, sh, h * 0.15) + strokeP(d, col, h * 0.11, ` transform="translate(${f(-h * 0.015)} ${f(-h * 0.02)})"`);
  return o + tips;
}
function fanCoral(x, y, w, h, col, sh, lineCol) {
  // flat sea fan: a lobed half-disc on a short stalk, veins radiating, a few round holes in the shelf colour
  const lobes = 5; let d = `M${f(x - w * 0.08)} ${f(y)}L${f(x - w * 0.5)} ${f(y - h * 0.45)}`;
  for (let i = 0; i < lobes; i++) { const a0 = Math.PI + (i / lobes) * Math.PI, a1 = Math.PI + ((i + 0.5) / lobes) * Math.PI, a2 = Math.PI + ((i + 1) / lobes) * Math.PI; d += `Q${f(x + Math.cos(a1) * w * 0.62)} ${f(y - h * 0.45 + Math.sin(a1) * h * 0.72)} ${f(x + Math.cos(a2) * w * 0.5)} ${f(y - h * 0.45 + Math.sin(a2) * h * 0.55)}`; void a0; }
  d += `L${f(x + w * 0.08)} ${f(y)}Z`;
  let o = ell(x, y + 2, w * 0.4, h * 0.08, C.shelfSh, ' opacity="0.6"');
  o += P(d, sh) + P(d, col, ` transform="translate(${f(-w * 0.04)} ${f(-h * 0.05)})"`);
  let v = ''; for (let i = 1; i < 6; i++) { const a = Math.PI + i / 6 * Math.PI; v += `M${f(x)} ${f(y - h * 0.1)}L${f(x + Math.cos(a) * w * 0.4)} ${f(y - h * 0.45 + Math.sin(a) * h * 0.48)}`; }
  o += strokeP(v, lineCol, 2.2, ' opacity="0.55"');
  [[-0.2, -0.6], [0.14, -0.72], [0.26, -0.4]].forEach(([u, vv]) => { o += circ(x + u * w, y + vv * h, w * 0.045, C.shelf, ' opacity="0.9"'); });
  return o;
}
function tubeCoral(x, y, s, col, sh, hi) {
  // bundle of 3–4 rounded tubes of different heights
  const tubes = [[-16, 34, 9], [-2, 46, 10], [13, 30, 8], [24, 40, 8]];
  let o = ell(x + 4 * s, y + 2, 34 * s, 5 * s, C.shelfSh, ' opacity="0.6"');
  tubes.forEach(([dx, h, r]) => {
    const cx = x + dx * s, rr = r * s, hh = h * s;
    o += `<rect x="${f(cx - rr)}" y="${f(y - hh)}" width="${f(rr * 2)}" height="${f(hh)}" rx="${f(rr)}" fill="${sh}"/>`;
    o += `<rect x="${f(cx - rr)}" y="${f(y - hh)}" width="${f(rr * 1.5)}" height="${f(hh)}" rx="${f(rr * 0.75)}" fill="${col}"/>`;
    o += ell(cx, y - hh + rr * 0.6, rr * 0.75, rr * 0.45, hi);
    o += ell(cx, y - hh + rr * 0.6, rr * 0.4, rr * 0.22, sh, ' opacity="0.8"');
  });
  return o;
}
function kelp(x, baseY, h, seed, op = 1) {
  const r = rng(seed); const ph = r() * 6, amp = h * (0.06 + r() * 0.04);
  const pt = t => [x + Math.sin(t * 3.2 + ph) * amp * t + Math.sin(t * 7 + ph) * amp * 0.25 * t, baseY - h * t];
  const pts = []; for (let i = 0; i <= 16; i++) pts.push(pt(i / 16));
  let o = strokeP(line(pts), C.kelpSh, 6, ` opacity="${op}"`);
  // round leaves alternating sides along the stem (fewer at the base so the sand line stays clean)
  const leaves = Math.round(h / 34);
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 0.6), p = pt(t), side = i % 2 ? -1 : 1, lw = h * 0.065 * (1 - t * 0.35), lh = h * 0.12 * (1 - t * 0.3);
    const ang = side * (28 + 20 * Math.sin(t * 5 + ph));
    o += ell(p[0] + side * lw * 0.9, p[1] - lh * 0.3, lw, lh, i % 3 === 0 ? C.kelpHi : C.kelp, ` opacity="${op}" transform="rotate(${f(ang)} ${f(p[0])} ${f(p[1])})"`);
  }
  o += strokeP(line(pts), C.kelp, 3.5, ` opacity="${op}"`);
  o += circ(pts[16][0], pts[16][1], 4, C.kelpHi, ` opacity="${op}"`);
  return o;
}
function anemone(x, y, s) {
  // sleepy anemone: a soft peach base, drooping lilac-pink tentacles with round tips, closed happy eyes
  let o = ell(x, y + 2, 46 * s, 7 * s, C.shelfSh, ' opacity="0.6"');
  const tents = [[-34, -36, -46, -4], [-24, -50, -40, -14], [-10, -58, -30, -8], [6, -60, -8, -6], [20, -54, 24, -4], [32, -42, 42, -2], [-4, -52, 10, -10]];
  tents.forEach(([x1, y1, x2, y2], i) => {
    const d = `M${f(x + x1 * 0.4 * s)} ${f(y - 22 * s)}Q${f(x + x1 * s)} ${f(y + y1 * s)} ${f(x + x2 * s)} ${f(y + y2 * s)}`;
    o += strokeP(d, i % 2 ? C.tentSh : C.tent, 9 * s) + circ(x + x2 * s, y + y2 * s, 6 * s, i % 2 ? C.tent : C.pinkHi);
  });
  o += P(`M${f(x - 40 * s)} ${f(y)}Q${f(x - 42 * s)} ${f(y - 40 * s)} ${f(x)} ${f(y - 40 * s)}Q${f(x + 42 * s)} ${f(y - 40 * s)} ${f(x + 40 * s)} ${f(y)}Z`, C.anemSh);
  o += P(`M${f(x - 40 * s)} ${f(y)}Q${f(x - 42 * s)} ${f(y - 40 * s)} ${f(x)} ${f(y - 40 * s)}Q${f(x + 30 * s)} ${f(y - 40 * s)} ${f(x + 28 * s)} ${f(y)}Z`, C.anem);
  o += ell(x - 18 * s, y - 28 * s, 7 * s, 4 * s, '#FFFFFF', ' opacity="0.6"');
  // closed eyes (happy arcs), rosy cheeks, tiny smile
  o += strokeP(`M${f(x - 16 * s)} ${f(y - 14 * s)}q${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0M${f(x + 6 * s)} ${f(y - 14 * s)}q${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0`, C.face, 2.6 * s);
  o += strokeP(`M${f(x - 4 * s)} ${f(y - 8 * s)}q${f(4 * s)} ${f(4 * s)} ${f(8 * s)} 0`, C.face, 2.2 * s);
  o += circ(x - 20 * s, y - 7 * s, 4 * s, '#F7B6C2', ' opacity="0.7"') + circ(x + 20 * s, y - 7 * s, 4 * s, '#F7B6C2', ' opacity="0.7"');
  return o;
}
function genMid() {
  PREC = 1;
  const shelfY = x => 244 + wave([[6, 1, 1.1], [4, 3, 0.4], [2, 7, 2.5]])(x);
  let o = '';
  // kelp forest first (behind everything); tall ones rise into the play band but stay thin and soft
  const kb = [[40, 150, 0.7], [96, 115, 0.8], [330, 165, 0.7], [372, 125, 0.8], [640, 175, 0.65], [690, 130, 0.75], [920, 160, 0.7], [965, 115, 0.8], [1150, 145, 0.75]];
  kb.forEach(([x, h, op], i) => { o += wrap(x, 40, xx => kelp(xx, shelfY(xx) + 10, h, 500 + i, op)); });
  // distant sand shelf: fills the gap between the far layer and the ground
  o += P(bandD(shelfY, 360), C.shelf);
  o += P(bandD(x => shelfY(x) + 40 + wave([[6, 2, 0.9], [3, 5, 2.0]])(x), 360), C.shelfSh, ' opacity="0.45"');
  o += strokeP(edgeD(x => shelfY(x) + 2.5), C.shelfHi, 5, ' opacity="0.9"');
  // rocks (back), then coral clusters sitting on the shelf; the sand line (y ≥ 300 is hidden by ground.svg)
  [[180, 110, 52], [470, 80, 40], [760, 120, 58], [1010, 90, 44], [1195, 70, 36]].forEach(([x, w, h], i) => { o += wrap(x, w, xx => rock(xx, shelfY(xx) + 24, w, h, 300 + i)); });
  // cluster A (left): brain coral + fingers + tubes
  o += wrap(120, 90, xx => brainCoral(xx, shelfY(xx) + 30, 96, 58, C.pink, C.pinkSh, C.pinkHi, C.pinkLine) + fingerCoral(xx + 70, shelfY(xx) + 32, 86, C.lilac, C.lilacSh, C.lilacHi, 41) + tubeCoral(xx - 62, shelfY(xx) + 34, 0.8, C.pink, C.pinkSh, C.pinkHi));
  // cluster B: fan + brain (lilac) + the sleepy anemone
  o += wrap(400, 120, xx => fanCoral(xx - 60, shelfY(xx) + 30, 90, 80, C.lilac, C.lilacSh, C.lilacLine) + brainCoral(xx + 30, shelfY(xx) + 32, 80, 48, C.lilac, C.lilacSh, C.lilacHi, C.lilacLine) + anemone(xx + 110, shelfY(xx) + 34, 0.95));
  // cluster C: fingers (pink) + tubes (lilac) + small brain
  o += wrap(660, 110, xx => fingerCoral(xx - 50, shelfY(xx) + 32, 100, C.pink, C.pinkSh, C.pinkHi, 42) + tubeCoral(xx + 30, shelfY(xx) + 34, 1, C.lilac, C.lilacSh, C.lilacHi) + brainCoral(xx + 100, shelfY(xx) + 32, 64, 40, C.pink, C.pinkSh, C.pinkHi, C.pinkLine));
  // cluster D: fan (pink) + fingers (lilac) + a peach dome
  o += wrap(900, 110, xx => brainCoral(xx - 70, shelfY(xx) + 32, 70, 42, C.peach, C.peachSh, '#F8E0C8', '#D3A182') + fanCoral(xx + 10, shelfY(xx) + 30, 84, 76, C.pink, C.pinkSh, C.pinkLine) + fingerCoral(xx + 84, shelfY(xx) + 32, 80, C.lilac, C.lilacSh, C.lilacHi, 43));
  // a tiny lone tube cluster near the wrap seam so the seam itself has content to prove tiling
  o += wrap(1180, 40, xx => tubeCoral(xx, shelfY(xx) + 34, 0.7, C.lilac, C.lilacSh, C.lilacHi));
  PREC = 10;
  return svg(1200, 360, o);
}

// ---------------- ground.svg (0 0 1200 260) ----------------
function shellSmall(x, y, s, col, sh) {
  // tiny scallop: fan of 5 ribs, point down
  let d = `M${f(x)} ${f(y + 6 * s)}`;
  for (let i = 0; i <= 5; i++) { const a = Math.PI + i / 5 * Math.PI; const px = x + Math.cos(a) * 7 * s, py = y - 1 * s + Math.sin(a) * 6 * s; d += i === 0 ? `L${f(px)} ${f(py)}` : `Q${f(x + Math.cos(a - Math.PI / 10) * 8.2 * s)} ${f(y - 1 * s + Math.sin(a - Math.PI / 10) * 7.6 * s)} ${f(px)} ${f(py)}`; }
  d += 'Z';
  let o = P(d, sh) + P(d, col, ` transform="translate(${f(-0.8 * s)} ${f(-0.8 * s)})"`);
  let v = ''; for (let i = 1; i < 5; i++) { const a = Math.PI + i / 5 * Math.PI; v += `M${f(x)} ${f(y + 4 * s)}L${f(x + Math.cos(a) * 5.5 * s)} ${f(y - 1 * s + Math.sin(a) * 5 * s)}`; }
  return o + strokeP(v, sh, 1.2 * s, ' opacity="0.8"');
}
function genGround() {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.sandTop], [0.4, '#EBD4A2'], [1, C.sandLow]]);
  const lip = x => 40 + wave([[2.5, 2, 0.7], [1.5, 5, 2.2], [1, 11, 0.4]])(x);
  let o = '';
  o += P(bandD(lip, 260, 4), 'url(#gfill)');
  // soft shade just under the lip (depth against the mid shelf), then a bright rim
  const sh = [[0, lip(0)]]; for (let x = 0; x <= W; x += 6) sh.push([x, lip(x)]); for (let x = W; x >= 0; x -= 6) sh.push([x, lip(x) + 8 + wave([[3, 4, 1.2], [2, 9, 0.3]])(x)]);
  o += P(poly(sh), C.sandSh, ' opacity="0.5"');
  o += strokeP(edgeD(x => lip(x) + 1.2, 6), C.sandRim, 3);
  // sand ripples: calm crescents, shadow below a light crest, laid in loose rows
  const r = rng(7);
  const rows = [[92, 9], [140, 11], [186, 12], [232, 12]];
  rows.forEach(([y0, ry], ri) => {
    const n = 5 + ri; for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (ri % 2) * 0.5) * W / n + (r() - 0.5) * 40, y = y0 + (r() - 0.5) * 18, rx = 44 + r() * 40;
      o += wrap(x, rx + 6, xx => P(`M${f(xx - rx)} ${f(y)}Q${f(xx)} ${f(y - ry * 1.6)} ${f(xx + rx)} ${f(y)}Q${f(xx + rx * 0.15)} ${f(y - ry * 0.55)} ${f(xx - rx)} ${f(y)}Z`, C.sandSh, ' opacity="0.55"')
        + strokeP(`M${f(xx - rx * 0.75)} ${f(y - ry * 0.45)}Q${f(xx - rx * 0.1)} ${f(y - ry * 1.25)} ${f(xx + rx * 0.55)} ${f(y - ry * 0.65)}`, C.sandRim, 2.6, ' opacity="0.9"'));
    }
  });
  // tiny shells + pebbles, few and low (never in the first 50 px where chests stand)
  const shells = [[70, 150, 1, C.shell, C.shellSh], [300, 118, 0.9, C.shellPink, '#E3B9B6'], [520, 200, 1.1, C.shell, C.shellSh], [760, 128, 0.9, C.shell, C.shellSh], [980, 180, 1, C.shellPink, '#E3B9B6'], [1160, 150, 0.9, C.shell, C.shellSh]];
  shells.forEach(([x, y, s, col, shd]) => { o += wrap(x, 12, xx => shellSmall(xx, y, s, col, shd)); });
  [[180, 212, 7, 4.5], [430, 96, 5, 3.5], [660, 236, 6, 4], [880, 104, 5.5, 3.5], [1070, 224, 7, 4.5]].forEach(([x, y, rx, ry]) => { o += wrap(x, 10, xx => ell(xx, y, rx, ry, C.sandDeep, ' opacity="0.55"') + ell(xx - 1, y - 1, rx * 0.8, ry * 0.7, '#E8D4A6')); });
  // a few bright sand grains
  for (let i = 0; i < 16; i++) { const x = (i + 0.5) * W / 16 + (r() - 0.5) * 40, y = 70 + r() * 180; o += wrap(x, 3, xx => circ(xx, y, 1.6, '#FFF8E4', ' opacity="0.8"')); }
  return svg(1200, 260, o, defs);
}

// ---------------- sun, moon, clouds (seen through water: soft, no faces) ----------------
function wobblyRing(cx, cy, r0, r1, n, ph) {
  // closed wobbly disc edge: radius alternates between r0 and r1 smoothly (sum of a cosine)
  const pts = []; for (let i = 0; i < n * 8; i++) { const a = i / (n * 8) * Math.PI * 2, rr = r0 + (r1 - r0) * 0.5 * (1 + Math.cos(a * n + ph)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return blob(pts, 0.5);
}
function genSun() {
  const defs = rg('glow', [[0, '#FFF9DC', 0.85], [0.4, '#FFF0B8', 0.4], [1, '#FFF0B8', 0]]) + rg('disc', [[0, '#FFFBE6'], [0.6, '#FFF1B4'], [1, '#FFE38F']], ' cx="0.42" cy="0.4" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  // wobbly rays = two soft wavy rings (water refraction), no hard spikes
  o += P(wobblyRing(100, 100, 66, 84, 9, 0), '#FFF0B8', ' opacity="0.45"');
  o += P(wobblyRing(100, 100, 58, 70, 7, 1.3), '#FFF4C8', ' opacity="0.6"');
  o += circ(100, 100, 52, '#FFE9A4') + circ(100, 100, 48, 'url(#disc)');
  o += ell(86, 84, 14, 9, '#FFFFFF', ' opacity="0.7" transform="rotate(-30 86 84)"');
  return svg(200, 200, o, defs);
}
function genMoon() {
  const defs = rg('mglow', [[0, '#DCEAFF', 0.5], [0.45, '#BBD0F5', 0.2], [1, '#BBD0F5', 0]]);
  let o = circ(100, 100, 100, 'url(#mglow)');
  o += P(wobblyRing(100, 100, 60, 70, 8, 0.4), '#DCE8F8', ' opacity="0.35"');
  o += circ(100, 100, 50, '#E6E0C8') + circ(98, 98, 48, '#F6F2E2');
  // soft craters, one-step shade on the lower-right
  o += P('M58 70A48 48 0 1 0 136 128A44 44 0 0 1 58 70Z', '#E6E0C8', ' opacity="0.8"');
  o += circ(82, 86, 9, '#E6E0C8') + circ(110, 112, 6, '#E6E0C8') + circ(90, 118, 4.5, '#E6E0C8') + circ(116, 80, 4, '#E6E0C8');
  o += ell(80, 72, 10, 5, '#FFFFFF', ' opacity="0.7" transform="rotate(-35 80 72)"');
  return svg(200, 200, o, defs);
}
function genClouds() {
  // drifting surface-light blobs / plankton clouds: overlapping radial-gradient ellipses, white-cyan, very soft
  const out = {};
  const mk = (id, puffs) => {
    const defs = rg('c' + id, [[0, '#FFFFFF', 0.55], [0.45, '#E6FBFF', 0.28], [1, '#CDF3FA', 0]]);
    let o = puffs.map(([x, y, rx, ry]) => ell(x, y, rx, ry, `url(#c${id})`)).join('');
    o += puffs.slice(0, 2).map(([x, y, rx, ry]) => ell(x - rx * 0.1, y - ry * 0.1, rx * 0.45, ry * 0.4, '#FFFFFF', ' opacity="0.35"')).join('');
    return svg(300, 160, o, defs);
  };
  out.cloud1 = mk(1, [[150, 82, 110, 48], [90, 92, 70, 36], [210, 70, 72, 40]]);
  out.cloud2 = mk(2, [[140, 80, 96, 40], [200, 90, 80, 34], [80, 76, 64, 30]]);
  out.cloud3 = mk(3, [[160, 84, 120, 52], [70, 90, 56, 30], [230, 76, 60, 36]]);
  return out;
}

// ---------------- particles (0 0 32 32, centred) ----------------
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  // bubble1: round bubble, soft blue-white rim, highlight upper-left
  p.bubble1 = S(circ(16, 16, 12, '#FFFFFF', ' opacity="0.16"') + `<circle cx="16" cy="16" r="11" fill="none" stroke="#FFFFFF" stroke-width="2.6" opacity="0.85"/>` + `<circle cx="16" cy="16" r="11" fill="none" stroke="#BDEBF4" stroke-width="1.2" opacity="0.9"/>` + ell(11.5, 11, 3.2, 2, '#FFFFFF', ' transform="rotate(-40 11.5 11)"') + circ(20.5, 20.5, 1.4, '#FFFFFF', ' opacity="0.8"'));
  // bubble2: a big and a small bubble together
  p.bubble2 = S(circ(13, 18, 9, '#FFFFFF', ' opacity="0.14"') + `<circle cx="13" cy="18" r="8.2" fill="none" stroke="#FFFFFF" stroke-width="2.2" opacity="0.85"/>` + ell(9.8, 14.6, 2.4, 1.5, '#FFFFFF', ' transform="rotate(-40 9.8 14.6)"') + circ(24, 9, 4.5, '#FFFFFF', ' opacity="0.14"') + `<circle cx="24" cy="9" r="4" fill="none" stroke="#FFFFFF" stroke-width="1.8" opacity="0.85"/>` + circ(22.6, 7.6, 1, '#FFFFFF'));
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#DFF7FF')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  // star: chubby rounded 5-point twinkle star, pale gold
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#FFE9A0" stroke="#FFE9A0" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFBE6"/>`);
  // plankton: glowing mint-cyan dot
  p.plankton = S(circ(16, 16, 15, 'url(#pk)') + circ(16, 16, 4.2, '#D8FFF4') + circ(16, 16, 2.2, '#FFFFFF'), rg('pk', [[0, '#8FF5DC', 0.75], [0.45, '#6FE8D0', 0.3], [1, '#6FE8D0', 0]]));
  // sand: a sandy puff (three soft blobs)
  p.sand = S(`${circ(11, 18, 8, 'url(#sd)')}${circ(19, 14, 10, 'url(#sd)')}${circ(21, 21, 7, 'url(#sd)')}` + circ(14, 16, 2, '#F6E4BC', ' opacity="0.9"') + circ(21, 13, 1.6, '#F6E4BC', ' opacity="0.9"'), rg('sd', [[0, '#F2DFB3', 0.95], [0.6, '#E8D2A0', 0.75], [1, '#DCC48E', 0]]));
  // fishlet: tiny round fish silhouette facing right, blue-grey (far from the answer blue), white eye dot
  p.fishlet = S(P('M4 16Q10 6 20 9Q26 11 28 16Q26 21 20 23Q10 26 4 16Z', '#8FB4CF') + P('M6 16L1 10Q4 16 1 22Z', '#8FB4CF') + P('M4 16Q10 6 20 9Q24 11 26 16Q18 14 4 16Z', '#A9C8DE') + circ(21.5, 14.5, 1.8, '#FFFFFF') + circ(22, 14.8, 0.9, '#3A4A5A'));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="9" y="12" width="14" height="8" rx="2" fill="#FF9FBE"/><rect x="9" y="16" width="14" height="4" rx="1.5" fill="#EC80A6"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#7FD8E6', 4)}${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#C2F0F7', 1.4, ' opacity="0.85"')}`);
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
  console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 45 ? '  TOO BIG' : ''}${/<text|<script|href=|@import|font/.test(v) || blur > 1 ? '  FORBIDDEN' : ''}`);
}
