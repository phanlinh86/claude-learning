#!/usr/bin/env node
// Character & item art generator for Ollie's Lighthouse Flip.
// 100% original hand-written SVG (no text, fonts, scripts, images or external refs).
// Ollie's frames are built from the SAME body / head / muzzle / scarf-band / headlamp parts, so the
// body geometry is identical across frames: only legs, tail, scarf ends, eyes and mouth change.
// Fixed anchors (docs/DESIGN.md §4.1): feet line y 120, body centre (64,74), headlamp lens (92,44) r 6.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Ollie
  fur: '#8a5a3c', furShade: '#6b4329', furLine: '#3b2417', cream: '#f3dfc1', creamShade: '#dcc09a',
  nose: '#3a2418', paw: '#4a2e1f', earIn: '#b98366', eye: '#2a1810', mouth: '#7a2e2a', tongue: '#ff8f8f', cheek: '#f29a86',
  scarf: '#2ec4b6', scarfShade: '#1f8f86', scarfLine: '#145c56',
  brass: '#e0ac45', brassShade: '#b07f22', brassLine: '#6a4810', lens: '#fff2a8', strap: '#4e3426',
  sweat: '#cfeeff', sweatLine: '#4f86b8',
  // leaves [fill, shade, line, rib]
  leaf: [['#5fd35a', '#3faa3e', '#1f6326', '#e2fbc8'], ['#ffc53d', '#e8991c', '#8a5700', '#fff4c8'], ['#ff6b3d', '#d9471f', '#86280e', '#ffd8c4']],
  // obstacles
  snow: '#f6f9ff', snowShade: '#c9d8ee', snowLine: '#4b5d80', twig: '#7a5236', twigLine: '#3e2818',
  wood: '#c08a58', woodShade: '#9a6a3e', woodLine: '#4e3220', woodDark: '#7c5432',
  boot: '#4f78b0', bootShade: '#3a5c8c', bootLine: '#1f3354', fluff: '#f3ece0',
  cord: '#d9c7a4', cordLine: '#6e5a3a',
  mitA: '#e86a7a', mitAShade: '#c24e60', mitALine: '#6e2232', mitB: '#7fa6e0', mitBShade: '#5b84c2', mitBLine: '#26406e',
  knitW: '#f6f1e6', knitStripe: '#4f78b0',
  basket: '#c49456', basketShade: '#9c7038', basketLine: '#553a1a', plant: '#7fb08a', plantShade: '#5d8f6a', plantLine: '#2e523a',
  bloom: '#f3a3c0', bloomLine: '#8a3a5a',
  // Pip the puffin
  pBlack: '#2b2f45', pBlackShade: '#1d2033', pLine: '#121426', pWhite: '#f7f5ef', pWhiteShade: '#d9d6ce',
  beakR: '#ff6a3a', beakY: '#ffc845', beakG: '#6f7d96', beakLine: '#7a2a10', feet: '#ff8a3a', feetLine: '#8a3a10',
  rope: '#e0c99a', ropeLine: '#6e5634', ring: '#c9d1e0', ringLine: '#4a5470',
  // finish
  doorWood: '#a8703f', doorShade: '#835428', doorLine: '#4a2c14', stone: '#c3c8d4', stoneShade: '#9aa1b2', stoneLine: '#4f566a',
  warm0: '#fff6d6', warm1: '#ffd47a', warm2: '#f0a24a', step: '#e8b46a', stepShade: '#c98d48', iron: '#3c3f52',
  flags: ['#ff6b6b', '#ffc53d', '#2ec4b6', '#8f7fe0'],
  // hearts
  heart: '#ff5a6e', heartShade: '#e03a52', heartLine: '#8a1f33', heartEmpty: '#a7a3c4',
  // icon
  navy: '#22306a', navy2: '#0b1230', badge: '#2ec4b6', tower: '#101838', aurora: '#5ff0a8', aurora2: '#9a7cf0',
  beam: '#9a6a42', beamShade: '#7a5030', beamLine: '#3e2614',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +(+n).toFixed(2);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
const rrect = (x, y, w, h, r) =>
  `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
let _id = 0, PFX = 'a';
const uid = () => `${PFX}${++_id}`;

// Union of paths with a one-step cel shade (fill shifted up-left so the shade sits lower-right),
// optional inner art (clipped) + highlight; the outline is drawn UNDER the fill as a fat stroke, so
// unions of several paths get one clean silhouette outline (no seams between parts).
function shape(ds, fill, shade, lineC, opt = {}) {
  if (!Array.isArray(ds)) ds = [ds];
  const sw = opt.sw ?? 3;
  const [ox, oy] = opt.off ?? [-4, -4];
  const id = uid();
  let s = '';
  if (sw) s += ds.map((d) => `<path d="${d}" fill="${lineC}" stroke="${lineC}" stroke-width="${sw * 2}" stroke-linejoin="round"/>`).join('');
  s += `<clipPath id="${id}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath><g clip-path="url(#${id})">`;
  s += ds.map((d) => `<path d="${d}" fill="${shade || fill}"/>`).join('');
  if (shade) s += `<g transform="translate(${ox} ${oy})">${ds.map((d) => `<path d="${d}" fill="${fill}"/>`).join('')}</g>`;
  if (opt.inner) s += opt.inner;
  if (opt.hi) {
    const [hx, hy, hrx, hry, r = 0] = opt.hi;
    s += `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" transform="rotate(${r} ${hx} ${hy})" fill="#fff" opacity="${opt.hiOp ?? 0.6}"/>`;
  }
  return s + `</g>`;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
// a "tube": dark outline stroke + lighter core stroke
const tube = (d, core, lineC, w, sw = 3) => line(d, lineC, w + sw * 2) + line(d, core, w);
function radial(cx, cy, r, stops) {
  const id = uid();
  return [`url(#${id})`, `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">` +
    stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + `</radialGradient>`];
}
function linear(x1, y1, x2, y2, stops) {
  const id = uid();
  return [`url(#${id})`, `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">` +
    stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + `</linearGradient>`];
}
function glow(cx, cy, r, col, a0 = 0.6, a1 = 0.25) {
  const [u, def] = radial(cx, cy, r, [[0, col, a0], [0.5, col, a1], [1, col, 0]]);
  return def + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${u}"/>`;
}
function softPoly(pts, k = 0.2) {
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const a = mid(p, prev, k), b = mid(p, next, k);
    d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(b[0]) + ' ' + f(b[1]);
  });
  return d + 'Z';
}
// a tapered ribbon along a quadratic-ish polyline of points [x, y], width w0 -> w1 (closed path)
function ribbon(pts, w0, w1) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const all = L.concat(R.reverse());
  return softPoly(all, 0.35);
}
// sample a cubic bezier into n points
function bez(p0, p1, p2, p3, n = 9) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
  }
  return out;
}
const heartPath = (cx, cy, r) => {
  const s = r * 1.02, oy = 0.04;
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + (y + oy) * s)}`;
  return `M${p(0, 0.92)}C${p(-0.38, 0.66)} ${p(-1, 0.24)} ${p(-1, -0.3)}C${p(-1, -0.74)} ${p(-0.64, -0.98)} ${p(-0.32, -0.98)}` +
    `C${p(-0.14, -0.98)} ${p(0, -0.86)} ${p(0, -0.62)}C${p(0, -0.86)} ${p(0.14, -0.98)} ${p(0.32, -0.98)}` +
    `C${p(0.64, -0.98)} ${p(1, -0.74)} ${p(1, -0.3)}C${p(1, 0.24)} ${p(0.38, 0.66)} ${p(0, 0.92)}Z`;
};
const dropPath = (cx, cy, r) => {
  const s = r, oy = -0.05;
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + (y + oy) * s)}`;
  return `M${p(0, -1.15)}C${p(0.3, -0.7)} ${p(0.86, -0.18)} ${p(0.86, 0.32)}A${f(0.86 * s)} ${f(0.86 * s)} 0 0 1 ${p(-0.86, 0.32)}` +
    `C${p(-0.86, -0.18)} ${p(-0.3, -0.7)} ${p(0, -1.15)}Z`;
};
// tiny 6-arm snowflake (for the scarf pattern)
function flake(cx, cy, r, col, w = 1.1) {
  let d = '';
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 2;
    d += `M${f(cx - r * Math.cos(a))} ${f(cy - r * Math.sin(a))}L${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return line(d, col, w);
}

// ================================================================= OLLIE (128 x 128, facing right)
const BODY = ell(64, 74, 34, 23);         // chubby body, centre (64,74), x 30..98, y 51..97
const HEAD = circ(82, 50, 27);            // big round head, x 55..109, y 23..77
const MUZZLE = ell(104, 65, 13.5, 10.5);   // cream muzzle pushes out to x 117.5
const HIP = { back: [44, 88], front: [80, 88] };
const FAR_DX = 7;
const GROUND = 112.5; // paw centre y when standing: paw ry 4.5 + 3 px outline -> bottom exactly on y 120
const LENS = [92, 44];

function earShape(cx, cy, r, far) {
  if (far) return shape(circ(cx, cy, r), P.furShade, null, P.furLine);
  return shape(circ(cx, cy, r), P.fur, P.furShade, P.furLine, { off: [-1.5, -1.5],
    inner: `<circle cx="${cx + 0.8}" cy="${cy + 0.8}" r="${r * 0.5}" fill="${P.earIn}"/>` });
}
function tail(rot) {
  // thick tapered otter tail from the rump (hinge (36,82)), pointing back and a little down
  const d = 'M40 70C26 70 12 76 4 86C2 89 4 91 7 90C18 88 30 90 42 92Z';
  return `<g transform="rotate(${rot} 38 82)">` + shape(d, P.fur, P.furShade, P.furLine, { off: [0, -3], hi: [20, 79, 8, 1.8, -14], hiOp: 0.35 }) + `</g>`;
}
function leg(hip, px, py, tilt, far) {
  const [hx, hy] = hip;
  let s = tube(`M${hx} ${hy}L${f(px)} ${f(py - 2)}`, far ? P.furShade : P.fur, P.furLine, 12, 3);
  s += `<g transform="rotate(${tilt} ${f(px)} ${f(py)})">` +
    shape(ell(px + 1.5, py, 8, 4.5), far ? '#3a2418' : P.paw, null, P.furLine) +
    (far ? '' : `<ellipse cx="${f(px - 0.5)}" cy="${f(py - 1.6)}" rx="3.4" ry="1.2" fill="#fff" opacity="0.18"/>`) + `</g>`;
  return s;
}
// paw offsets per pose: [dx, lift, tilt]
function runLegs(frame) {
  // a bouncy little bound: both front paws reach together, both back paws push together (far paws a bit
  // out of phase so it reads as four legs)
  const C = [
    { nf: [12, 4, -14], ff: [8, 1, -8], nb: [-12, 0, 6], fb: [-8, 2, 4] },   // 0: front reach, back push
    { nf: [6, 0, -4], ff: [10, 3, -10], nb: [-4, 6, 14], fb: [-10, 1, 6] },  // 1: front lands, back lifts
    { nf: [-6, 0, 6], ff: [-2, 0, 2], nb: [8, 5, 10], fb: [4, 7, 12] },      // 2: gathered, back comes forward
    { nf: [2, 7, -16], ff: [-4, 2, 4], nb: [4, 0, -4], fb: [8, 3, 6] },      // 3: back lands, front lifts
  ];
  const c = C[frame];
  return { nearFront: c.nf, farFront: c.ff, nearBack: c.nb, farBack: c.fb };
}
function legs(pose, layer) {
  let L;
  if (pose === 'air') L = { nearFront: [8, 14, -40], farFront: [10, 13, -40], nearBack: [-6, 13, 36], farBack: [-4, 12, 36] };
  else if (pose === 'bump') L = { nearFront: [4, 0, 0], farFront: [-2, 2, -6], nearBack: [-4, 0, 0], farBack: [2, 2, 6] };
  else if (pose === 'happy') L = { nearFront: [8, 0, -4], farFront: [2, 0, 0], nearBack: [-6, 0, 0], farBack: [0, 0, 0] };
  else L = runLegs(pose);
  const one = (key, hip, far) => {
    const [dx, lift, tilt] = L[key];
    const hx = hip[0] + (far ? FAR_DX : 0);
    return leg([hx, hip[1]], hx + dx, GROUND - lift, tilt, far);
  };
  if (layer === 'far') return one('farBack', HIP.back, true) + one('farFront', HIP.front, true);
  return one('nearBack', HIP.back, false) + one('nearFront', HIP.front, false);
}
// scarf ends trailing behind from the knot (58,64); wave = 0..3 phase, lift = how much they float up
function scarfEnds(wave, lift) {
  const ph = (wave * Math.PI) / 2;
  const A = 4.5 * Math.sin(ph), B = 4.5 * Math.sin(ph + Math.PI * 0.8);
  const e1 = bez([58, 62], [44, 48 - lift * 0.5 + A], [32, 66 - lift * 0.8 - A], [14, 52 - lift + A * 0.8], 12);
  const e2 = bez([58, 66], [46, 58 - lift * 0.4 + B], [36, 76 - lift * 0.6 - B], [22, 68 - lift * 0.8 + B * 0.8], 12);
  const dots = (pts) => [0.35, 0.62, 0.88].map((t) => pts[Math.round(t * (pts.length - 1))]);
  let s = '';
  // far end first (darker), then near end
  s += shape(ribbon(e2, 9, 7), P.scarfShade, null, P.scarfLine, { sw: 2.5 });
  for (const [x, y] of dots(e2)) s += `<circle cx="${f(x)}" cy="${f(y)}" r="1.4" fill="#fff" opacity="0.8"/>`;
  s += shape(ribbon(e1, 10, 8), P.scarf, P.scarfShade, P.scarfLine, { sw: 2.5, off: [0, -2.5] });
  for (const [x, y] of dots(e1)) s += flake(x, y, 2.4, '#fff', 1.1);
  // fringe tips
  const t1 = e1[e1.length - 1], t2 = e2[e2.length - 1];
  for (const [t, c] of [[t1, P.scarf], [t2, P.scarfShade]]) {
    for (const dy of [-2.6, 0, 2.6]) s += line(`M${f(t[0] + 1)} ${f(t[1] + dy)}l-4.5 ${f(dy * 0.4)}`, P.scarfLine, 3.4) + line(`M${f(t[0] + 1)} ${f(t[1] + dy)}l-4.5 ${f(dy * 0.4)}`, c, 1.4);
  }
  return s;
}
function scarfBand() {
  // the wrap around the neck, following the back-lower edge of the head
  const d = 'M56 56C58 68 66 78 80 82';
  let s = tube(d, P.scarf, P.scarfLine, 11, 2.5);
  s += line('M58.5 58C61 67 67 74.5 78 78', P.scarfShade, 3, ' opacity="0.6"');
  for (const [x, y] of [[59.5, 64], [67, 75], [76.5, 80]]) s += flake(x, y, 2.6, '#fff', 1.2);
  // knot
  s += shape(ell(58, 64, 6.5, 6), P.scarf, P.scarfShade, P.scarfLine, { sw: 2.5, off: [-1.5, -1.5] });
  return s;
}
function headlamp() {
  let s = '';
  // strap over the head (clipped to the head silhouette)
  const cid = uid();
  s += `<clipPath id="${cid}"><path d="${HEAD}"/></clipPath><g clip-path="url(#${cid})">`;
  s += line('M54 50Q70 34 92 40', P.furLine, 7.5) + line('M54 50Q70 34 92 40', P.strap, 4.5);
  s += `</g>`;
  // brass housing + lens (lens centre (92,44) r 6)
  s += shape(circ(90.5, 43, 8.6), P.brass, P.brassShade, P.brassLine, { sw: 2.4, off: [-1.6, -1.6] });
  s += `<circle cx="${LENS[0]}" cy="${LENS[1]}" r="6" fill="${P.lens}" stroke="${P.brassLine}" stroke-width="1.4"/>`;
  s += `<circle cx="${LENS[0] - 2}" cy="${LENS[1] - 2}" r="2" fill="#fff" opacity="0.95"/>`;
  return s;
}
function face(expr) {
  let s = '';
  // cream face mask (cheeks + chin), clipped to the head + muzzle
  const cid = uid();
  s += `<clipPath id="${cid}"><path d="${HEAD}"/><path d="${MUZZLE}"/></clipPath><g clip-path="url(#${cid})">`;
  s += `<path d="${ell(98, 64, 19, 14.5)}" fill="${P.cream}"/>`;
  s += `<path d="${ell(102, 74.5, 16, 5)}" fill="${P.creamShade}" opacity="0.7"/>`;
  s += `</g>`;
  // eyes: near (89,58), far (104.5,56.5)
  if (expr === 'open' || expr === 'air') {
    s += `<ellipse cx="89" cy="58" rx="5.4" ry="6.6" fill="${P.eye}"/><ellipse cx="104.5" cy="56.5" rx="4" ry="5.6" fill="${P.eye}"/>`;
    s += `<circle cx="87.4" cy="55.6" r="2.3" fill="#fff"/><circle cx="103.4" cy="54.4" r="1.7" fill="#fff"/>`;
    s += `<circle cx="90.6" cy="61" r="1" fill="#fff" opacity="0.85"/><circle cx="105.6" cy="59" r="0.8" fill="#fff" opacity="0.85"/>`;
  } else if (expr === 'bump') {
    s += line('M85 53.5L92 58L85 62.5', P.eye, 2.8) + line('M107.5 52.5L102 56.5L107.5 60.5', P.eye, 2.6);
  } else if (expr === 'happy') {
    s += line('M84 60Q89 51.5 94 60', P.eye, 3) + line('M100.5 58.5Q104.5 51.5 108.5 58.5', P.eye, 2.7);
  }
  // cheek blush
  s += `<ellipse cx="92" cy="67" rx="4.4" ry="2.6" fill="${P.cheek}" opacity="0.55"/>`;
  // whisker pads + whiskers
  s += line('M111 68L124 65M111.5 70.5L125 71M111 73L123 76.5', P.furLine, 1.1, ' opacity="0.75"');
  s += `<circle cx="108" cy="68.5" r="0.9" fill="${P.furShade}"/><circle cx="111" cy="70" r="0.9" fill="${P.furShade}"/><circle cx="107.5" cy="71.5" r="0.9" fill="${P.furShade}"/>`;
  // nose
  s += `<path d="M110 60.5Q114.5 58 118.5 60.5Q118 64.5 114.5 65.5Q110.5 64.5 110 60.5Z" fill="${P.nose}" stroke="${P.furLine}" stroke-width="1"/>`;
  s += `<ellipse cx="113" cy="60.6" rx="1.8" ry="0.9" fill="#fff" opacity="0.7"/>`;
  // mouth
  if (expr === 'open') s += line('M114.5 65.5V68M108.5 69Q111.5 71.5 114.5 68Q116.5 70.5 118.5 69', P.furLine, 1.6);
  else if (expr === 'air') s += line('M114.5 65.5V67', P.furLine, 1.6) + `<ellipse cx="112.5" cy="71" rx="3" ry="3.4" fill="${P.mouth}" stroke="${P.furLine}" stroke-width="1.6"/>`;
  else if (expr === 'bump') s += line('M106 71q1.6 -1.8 3.2 0t3.2 0t3.2 0t3.2 0', P.furLine, 1.7);
  else if (expr === 'happy') {
    const m = 'M105.5 67.5Q112 79 118.5 67.5Q112 69.5 105.5 67.5Z';
    const id = uid();
    s += `<clipPath id="${id}"><path d="${m}"/></clipPath><path d="${m}" fill="${P.mouth}"/>` +
      `<g clip-path="url(#${id})"><ellipse cx="112" cy="75.5" rx="4.6" ry="3.4" fill="${P.tongue}"/></g>` +
      `<path d="${m}" fill="none" stroke="${P.furLine}" stroke-width="1.7" stroke-linejoin="round"/>`;
  }
  return s;
}
// pose: 0..3 (run frames), 'air', 'bump', 'happy', 'icon'
function ollie(pose, prefix) {
  PFX = prefix; _id = 0;
  const run = typeof pose === 'number';
  let tailA, wave, lift, expr;
  if (run) { tailA = [4, -2, -6, 0][pose]; wave = pose; lift = [0, 2, 0, -1][pose]; expr = 'open'; }
  else if (pose === 'air') { tailA = -12; wave = 1; lift = 9; expr = 'air'; }
  else if (pose === 'bump') { tailA = 10; wave = 3; lift = -3; expr = 'bump'; }
  else if (pose === 'icon') { tailA = -4; wave = 0; lift = 3; expr = 'open'; }
  else { tailA = -10; wave = 2; lift = 4; expr = 'happy'; }
  const lp = pose === 'icon' ? 'happy' : pose;
  let s = '';
  s += earShape(77, 26, 4.4, true);            // far ear peeks behind the head top
  s += tail(tailA);
  s += legs(lp, 'far');
  s += shape(BODY, P.fur, P.furShade, P.furLine, { off: [-4, -6], hi: [52, 58, 10, 3, -8], hiOp: 0.3,
    inner: `<path d="${ell(70, 95, 26, 10)}" fill="${P.cream}" opacity="0.9"/>` });
  s += legs(lp, 'near');
  s += scarfEnds(wave, lift);
  s += shape([HEAD, MUZZLE], P.fur, P.furShade, P.furLine, { off: [-4, -5], hi: [70, 33, 7, 3, -38], hiOp: 0.35 });
  s += earShape(64.5, 30.5, 5, false);            // near ear on the back-top of the head
  s += face(expr);
  s += scarfBand();
  s += headlamp();
  if (pose === 'bump') s += shape(dropPath(66, 44, 4.4), P.sweat, null, P.sweatLine, { sw: 1.4 }) + `<ellipse cx="65" cy="44.5" rx="1" ry="1.6" fill="#fff"/>`;
  if (pose === 'bump') s += line('M114 40l4 -4M118 46l5 -1M110 36l1 -5', '#ffffff', 2.2, ' opacity="0.9"') + line('M114 40l4 -4M118 46l5 -1M110 36l1 -5', P.furLine, 0.8, ' opacity="0.6"');
  return s;
}

// ================================================================= LEAVES (64 x 64, centred (32,32), stem down-left)
function leafSvg(kind, prefix) {
  PFX = prefix; _id = 0;
  const [fill, shade, lineC, rib] = P.leaf[kind];
  let s = '';
  if (kind === 2) {
    // maple: drawn upright (stem down), then rotated 45° so the stem points down-left
    const pts = [[0, -24], [5, -13], [12, -17], [11, -6], [22, -10], [18, 1], [23, 7], [11, 8], [12, 16], [3, 11], [0, 13],
      [-3, 11], [-12, 16], [-11, 8], [-23, 7], [-18, 1], [-22, -10], [-11, -6], [-12, -17], [-5, -13]];
    const d = softPoly(pts, 0.28);
    let g = tube('M0 10Q1 18 -1 25', P.leaf[2][2], lineC, 2.4, 1.6).replace(P.leaf[2][2], '#a5532e');
    g = tube('M0 10Q1 18 -1 25', '#c06a3a', lineC, 2.4, 1.6);
    g += shape(d, fill, shade, lineC, { sw: 2.4, off: [-3, -2.5],
      inner: `<path d="M0 0H30V30H0Z" fill="${shade}" opacity="0.55"/>` +
        line('M0 11V-19M0 3L16 -6M0 3L-16 -6M0 8L9 12M0 8L-9 12', rib, 1.5, ' opacity="0.9"'),
      hi: [-7, -9, 4, 1.6, -40], hiOp: 0.45 });
    s += `<g transform="translate(32 32) rotate(45) translate(0 -1)">${g}</g>`;
  } else {
    // oval leaf along +x (tip), stem towards -x; rotated -45° so the stem points down-left
    const d = kind === 0
      ? 'M-20 0C-14 -13 8 -15 24 -1C9 13 -13 12 -20 0Z'
      : 'M-19 0C-19 -17 12 -19 24 -1C11 18 -18 16 -19 0Z';
    const veins = kind === 0
      ? 'M-18 0Q2 -1.5 21 -1M-8 -0.5L-1 -8M2 -1L9 -9M-8 -0.5L-2 6M2 -1L8 7'
      : 'M-17 0Q2 -1.5 21 -1M-9 -0.5L-3 -10M1 -1L7 -11M-9 -0.5L-3 9M1 -1L7 10';
    let g = tube('M-20 0Q-25 -1 -28 2.5', kind === 0 ? '#3f8a3a' : '#b0771a', lineC, 2.4, 1.6);
    // curl: the lower half is turned a bit (shade) and its edge rolls (a thin light edge line)
    g += shape(d, fill, shade, lineC, { sw: 2.4, off: [-2, -3],
      inner: `<path d="M-30 0.5Q2 -1.5 30 -1V30H-30Z" fill="${shade}" opacity="0.5"/>` + line(veins, rib, 1.5, ' opacity="0.9"'),
      hi: [-2, -7, 7, 1.8, -8], hiOp: 0.5 });
    s += `<g transform="translate(32.5 31.5) rotate(-45) translate(-1 0)">${g}</g>`;
  }
  return s;
}

// ================================================================= OBSTACLES
function vent0() { // pile of three big snowballs 160 x 124, bottom = 124
  PFX = 'v0'; _id = 0;
  let s = '';
  // little snow drift at the base
  s += shape('M6 124C10 112 30 110 46 114C70 108 94 108 114 114C130 110 150 112 154 124Z', P.snowShade, null, P.snowLine, { sw: 2.5 });
  const ball = (cx, cy, r) => shape(circ(cx, cy, r), P.snow, P.snowShade, P.snowLine, { off: [-r * 0.16, -r * 0.18],
    hi: [cx - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.12, -35], hiOp: 0.95,
    inner: `<circle cx="${f(cx + r * 0.3)}" cy="${f(cy + r * 0.25)}" r="${f(r * 0.08)}" fill="${P.snowShade}"/><circle cx="${f(cx - r * 0.2)}" cy="${f(cy + r * 0.5)}" r="${f(r * 0.06)}" fill="${P.snowShade}"/>` });
  s += ball(48, 86, 36) + ball(114, 88, 33);
  // twig "hair" on the top ball
  s += tube('M84 22Q80 10 72 6M80 13L88 8', P.twig, P.twigLine, 3, 1.8);
  s += ball(82, 46, 28);
  // a few snow crumbs
  for (const [x, y, r] of [[18, 118, 3], [146, 118, 2.6], [92, 116, 2.4]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.snow}" stroke="${P.snowLine}" stroke-width="1.4"/>`;
  return s;
}
function crate(x, y, w, h) {
  let s = shape(rrect(x, y, w, h, 4), P.wood, P.woodShade, P.woodLine, { off: [-3, -3] });
  // planks + frame
  for (let i = 1; i < 3; i++) s += line(`M${x + 6} ${f(y + (h * i) / 3)}H${x + w - 6}`, P.woodShade, 2);
  s += `<path d="${rrect(x + 4, y + 4, w - 8, h - 8, 2)}" fill="none" stroke="${P.woodDark}" stroke-width="3"/>`;
  s += line(`M${x + 7} ${y + 7}L${x + w - 7} ${y + h - 7}`, P.woodDark, 4) + line(`M${x + 7} ${y + 7}L${x + w - 7} ${y + h - 7}`, '#d8a774', 1.4, ' opacity="0.7"');
  for (const [cx, cy] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) s += `<circle cx="${cx}" cy="${cy}" r="1.8" fill="${P.woodLine}"/>`;
  return s;
}
function boot(x, flip) {
  // a snow boot standing on the crate (toe to the right), x = heel x, sole at y 54
  const d = `M${x} 54V24Q${x} 18 ${x + 6} 18H${x + 16}Q${x + 20} 18 ${x + 20} 24V38Q${x + 22} 42 ${x + 30} 44Q${x + 36} 46 ${x + 36} 51V54Z`;
  let s = shape(d, P.boot, P.bootShade, P.bootLine, { sw: 2.5, off: [-2, -2] });
  s += shape(rrect(x - 3, 13, 26, 10, 5), P.fluff, '#d8cfbf', '#6e6250', { sw: 2.2, off: [-1, -1.5] });
  s += `<rect x="${x - 1}" y="50" width="${38}" height="4" rx="2" fill="${P.bootLine}"/>`;
  void flip;
  return s;
}
function vent1() { // stack of two wooden crates with a pair of snow boots on top, 100 x 156, bottom = 156
  PFX = 'v1'; _id = 0;
  let s = '';
  s += boot(22, false) + boot(44, true);
  s += crate(14, 54, 72, 46);
  s += crate(6, 100, 88, 53);
  return s;
}
function mitten(cx, top, col, shade, lineC, rot, mir = false) {
  const d = `M${cx - 11} ${top + 10}V${top + 34}Q${cx - 11} ${top + 46} ${cx} ${top + 46}Q${cx + 12} ${top + 46} ${cx + 12} ${top + 34}V${top + 10}Z`;
  const thumb = ell(cx + 13, top + 24, 5, 8);
  let g = shape([d, thumb], col, shade, lineC, { sw: 2.5, off: [-2, -2],
    inner: line(`M${cx - 11} ${top + 18}H${cx + 18}M${cx - 11} ${top + 30}H${cx + 18}`, '#ffffff', 2.4, ' opacity="0.55"') });
  g += shape(rrect(cx - 13, top + 2, 26, 10, 4), P.knitW, '#d9d2c4', '#6e6250', { sw: 2.2, off: [-1, -1.5] });
  // clothes peg
  g += `<rect x="${cx - 3}" y="${top - 6}" width="6" height="12" rx="2" fill="#d8b27a" stroke="${P.woodLine}" stroke-width="1.5"/>`;
  const m = mir ? ` translate(${2 * cx} 0) scale(-1 1)` : '';
  return `<g transform="rotate(${rot} ${cx} ${top})${m}">${g}</g>`;
}
function sign0() { // mittens + scarf drying on a line between two short cords, 160 x 132, bottom = 132
  PFX = 's0'; _id = 0;
  let s = '';
  // cords from the ceiling (top y 0) and the sagging line
  s += tube('M14 0V26M146 0V26', P.cord, P.cordLine, 2.4, 1.5);
  s += tube('M14 26Q80 42 146 26', P.cord, P.cordLine, 2.4, 1.5);
  // knitted scarf hanging over the line (white with blue stripes), ends down to y 130
  const sx = 80, sy = 33.5;
  const scarfD = `M${sx - 10} ${sy}Q${sx} ${sy - 3} ${sx + 10} ${sy}L${sx + 11} 120L${sx + 2} 122L${sx + 0.5} ${sy + 12}L${sx - 1} 112L${sx - 10} 110Z`;
  let stripes = '';
  for (const y of [60, 72, 96]) stripes += `<rect x="${sx - 20}" y="${y}" width="40" height="5" fill="${P.knitStripe}"/>`;
  s += shape(scarfD, P.knitW, '#d9d2c4', '#5a5446', { sw: 2.5, off: [-2, -2], inner: stripes });
  for (const [x0, y0] of [[sx - 10, 110], [sx + 2, 122]]) for (let i = 0; i < 3; i++) s += line(`M${x0 + 1 + i * 3.2} ${y0 + 0.5}v7`, '#5a5446', 2.4) + line(`M${x0 + 1 + i * 3.2} ${y0 + 0.5}v6.5`, P.knitW, 1);
  // mittens on both sides
  s += mitten(30, 29.5, P.mitA, P.mitAShade, P.mitALine, 5, true) + mitten(55, 33.5, P.mitA, P.mitAShade, P.mitALine, 2, true);
  s += mitten(105, 33.5, P.mitB, P.mitBShade, P.mitBLine, -2) + mitten(130, 29.5, P.mitB, P.mitBShade, P.mitBLine, -5);
  return s;
}
function sign1() { // hanging basket of round greenhouse plants on three cords, 110 x 140, bottom = 140
  PFX = 's1'; _id = 0;
  let s = '';
  // hook ring at the top + three cords
  s += `<circle cx="55" cy="5" r="4" fill="none" stroke="${P.cordLine}" stroke-width="4"/><circle cx="55" cy="5" r="4" fill="none" stroke="${P.cord}" stroke-width="1.8"/>`;
  s += tube('M55 8L14 72M55 8L96 72M55 8L58 70', P.cord, P.cordLine, 2.2, 1.5);
  // trailing vines (behind the basket), down to y ~138
  const vine = (d) => tube(d, P.plantShade, P.plantLine, 2.6, 1.6);
  s += vine('M24 94Q16 110 22 128') + vine('M86 94Q96 112 88 132') + vine('M60 100Q58 118 64 134');
  for (const [x, y, r] of [[18, 110, 5], [23, 128, 5.5], [93, 112, 5], [88, 131, 5.5], [58, 118, 4.6], [64, 133, 5]])
    s += shape(ell(x, y, r, r * 0.75), P.plant, P.plantShade, P.plantLine, { sw: 2, off: [-1, -1] });
  // round bushy plant above the rim
  s += shape([circ(32, 60, 16), circ(55, 52, 19), circ(78, 60, 16), circ(46, 68, 14), circ(66, 68, 14)], P.plant, P.plantShade, P.plantLine,
    { sw: 2.5, off: [-3, -3], hi: [46, 42, 6, 2.6, -20], hiOp: 0.35 });
  // little pink blooms
  for (const [x, y] of [[40, 50], [64, 44], [76, 58], [30, 64]]) s += `<circle cx="${x}" cy="${y}" r="3.6" fill="${P.bloom}" stroke="${P.bloomLine}" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="1.2" fill="#ffe08a"/>`;
  // woven basket
  const bd = 'M8 72H102Q100 102 80 108H30Q10 102 8 72Z';
  let weave = '';
  for (let y = 80; y < 108; y += 8) weave += line(`M6 ${y}H104`, P.basketShade, 2.2);
  for (let x = 14; x < 100; x += 10) weave += line(`M${x} 72V110`, P.basketShade, 1.6, ' opacity="0.6"');
  s += shape(bd, P.basket, P.basketShade, P.basketLine, { off: [-3, -3], inner: weave });
  s += shape(rrect(4, 68, 102, 9, 4.5), P.basket, P.basketShade, P.basketLine, { sw: 2.5, off: [-1, -2], hi: [30, 70.5, 16, 1.4], hiOp: 0.4 });
  return s;
}

// ================================================================= PIP THE PUFFIN (128 x 96)
// body centre (64,36); rope ring hook point (64,92) (ring centre (64,87.5) r 4.5, its inner bottom at y 92)
function drone() {
  PFX = 'dr'; _id = 0;
  let s = '';
  // rope + ring (behind the feet)
  s += tube('M64 56Q61 66 64 76Q66 80 64 83', P.rope, P.ropeLine, 3, 1.6);
  s += `<circle cx="64" cy="87.5" r="4.5" fill="none" stroke="${P.ringLine}" stroke-width="5"/><circle cx="64" cy="87.5" r="4.5" fill="none" stroke="${P.ring}" stroke-width="2.4"/>`;
  // wings spread (far wing up-left behind body, near wing out right)
  const wingL = 'M54 30C40 16 20 10 2 14C10 20 14 24 18 26C12 28 8 32 6 36C20 38 38 38 54 38Z';
  const wingR = 'M54 32C56 18 52 6 40 0C40 6 38 10 34 12C30 8 24 6 18 8C26 16 34 30 48 42C56 44 62 40 64 34Z';
  s += shape(wingL, P.pBlackShade, null, P.pLine, { sw: 2.5,
    inner: line('M22 22Q34 24 46 32M14 32Q30 33 46 37', '#4a5070', 1.6, ' opacity="0.9"') });
  // feet holding the rope
  s += tube('M58 50L60 56M70 50L68 56', P.feet, P.feetLine, 3.6, 1.6);
  s += shape([ell(60, 57.5, 5, 3), ell(68, 57.5, 5, 3)], P.feet, null, P.feetLine, { sw: 1.6 });
  // body: black back, white belly
  const body = ell(64, 36, 21, 17);
  s += shape(body, P.pBlack, P.pBlackShade, P.pLine, { off: [-3, -3],
    inner: `<path d="${ell(68, 42, 15, 12)}" fill="${P.pWhite}"/><path d="${ell(70, 46, 13, 6)}" fill="${P.pWhiteShade}" opacity="0.8"/>` });
  // head: black cap, big white face
  const head = circ(74, 20, 13.5);
  s += shape(head, P.pBlack, P.pBlackShade, P.pLine, { off: [-2, -2],
    inner: `<path d="${ell(78, 22, 10.5, 10)}" fill="${P.pWhite}"/>` });
  // beak: big rounded triangle, grey base band, red-orange with a yellow stripe
  const beak = 'M85 14Q98 15 103 22Q99 29 85 29Q83 21.5 85 14Z';
  s += shape(beak, P.beakR, '#e04a22', P.beakLine, { sw: 2.2, off: [-1, -1.5],
    inner: `<rect x="80" y="10" width="7.5" height="24" fill="${P.beakG}"/>` + line('M90 15.5Q93 21.5 90 28', P.beakY, 2.4) + line('M86 21.6Q95 21.6 102.5 22', P.beakLine, 1.2) });
  // eye with the little grey eye-marking + shine, rosy cheek
  s += line('M73 15L77 17', P.beakG, 1.6);
  s += `<circle cx="80" cy="19" r="3.6" fill="#1a1a2a"/><circle cx="78.9" cy="17.8" r="1.4" fill="#fff"/><circle cx="81" cy="20.5" r="0.6" fill="#fff"/>`;
  s += line('M76.5 15.4L79 13.8', P.pLine, 1.6);
  s += `<circle cx="82" cy="26" r="2.6" fill="#ff9e9e" opacity="0.6"/>`;
  // near wing over the body
  s += shape(wingR, P.pBlack, P.pBlackShade, P.pLine, { sw: 2.5, off: [-2, -2],
    inner: line('M50 32Q44 18 40 6M42 36Q34 22 24 12', '#5a6080', 1.6, ' opacity="0.9"'), hi: [46, 18, 7, 1.6, 60], hiOp: 0.25 });
  // tail tip
  s += `<path d="M44 38L37 41L44 44Z" fill="${P.pBlack}" stroke="${P.pLine}" stroke-width="2" stroke-linejoin="round"/>`;
  return s;
}

// ================================================================= FINISH: stairway door (160 x 300)
function finish() {
  PFX = 'fi'; _id = 0;
  let s = '';
  // top beam joining the ceiling (y 0..30)
  s += shape('M0 0H160V28H0Z', P.doorWood, P.doorShade, P.doorLine, { off: [0, -4], inner: line('M0 9H160M0 19H160', P.doorShade, 1.6, ' opacity="0.7"') });
  // stone arch frame
  const archO = 'M18 290V122A62 62 0 0 1 142 122V290Z';
  const archI = 'M32 290V124A48 48 0 0 1 128 124V290Z';
  let stones = '';
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i * Math.PI) / 8;
    stones += line(`M${f(80 + 48 * Math.cos(a))} ${f(124 + 48 * Math.sin(a))}L${f(80 + 62 * Math.cos(a))} ${f(122 + 62 * Math.sin(a))}`, P.stoneLine, 1.8);
  }
  for (let y = 150; y < 290; y += 28) stones += line(`M18 ${y}H32M128 ${y}H142`, P.stoneLine, 1.8);
  s += shape(archO, P.stone, P.stoneShade, P.stoneLine, { off: [-3, -3], inner: stones });
  // warm light inside with steps going up to the right
  const [wu, wdef] = linear(0, 300, 0, 80, [[0, P.warm2], [0.45, P.warm1], [1, P.warm0]]);
  let steps = '';
  for (let i = 0; i < 7; i++) {
    const y = 278 - i * 22, x = 40 + i * 13;
    steps += `<path d="M${x} ${y}H140V${y + 22}H${x}Z" fill="${i % 2 ? P.step : '#eec07a'}"/>` + `<path d="M${x} ${y}H140" stroke="${P.stepShade}" stroke-width="3"/>`;
  }
  s += wdef + shape(archI, '#ffe7a8', null, P.stoneLine, { sw: 2, inner: `<path d="${archI}" fill="${wu}"/>` + steps +
    // banister
    line('M44 236L126 130', '#a86a3a', 3.4) + line('M58 274V218M84 236V184M110 198V150', '#a86a3a', 2.2) +
    `<path d="M32 124A48 48 0 0 1 128 124V160Q80 120 32 170Z" fill="#fff8e0" opacity="0.5"/>` });
  // the door leaf swung open (seen edge-on-ish against the left side of the frame)
  const leaf = 'M32 290V128Q32 96 54 82V270Z';
  s += shape(leaf, P.doorWood, P.doorShade, P.doorLine, { off: [3, 0], inner: line('M40 118V284M47 100V276', P.doorShade, 1.8) +
    `<circle cx="49" cy="190" r="3" fill="${P.brass}" stroke="${P.brassLine}" stroke-width="1.4"/>` +
    line('M33 140H53M33 250H53', P.iron, 3) });
  // doorstep on the floor (y 270..300)
  s += shape(rrect(8, 284, 144, 16, 4), P.stone, P.stoneShade, P.stoneLine, { off: [0, -4], hi: [50, 288, 30, 1.6], hiOp: 0.5 });
  // bunting garland across the beam (two swags, triangular flags, no letters)
  const swag = (x0, x1, sag, k0) => {
    let g = line(`M${x0} 32Q${(x0 + x1) / 2} ${32 + sag * 2} ${x1} 32`, P.cordLine, 1.6);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1;
      const y = 32 + 2 * (1 - t) * t * sag * 2;
      const c = P.flags[(i + k0) % 4];
      g += `<path d="M${f(x - 5.5)} ${f(y)}L${f(x + 5.5)} ${f(y)}L${f(x)} ${f(y + 12)}Z" fill="${c}" stroke="${P.doorLine}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    return g;
  };
  s += swag(2, 64, 8, 0) + swag(96, 158, 8, 2);
  // lantern above the door, glowing lamp at (80,60)
  s += glow(80, 60, 30, '#ffd47a', 0.55, 0.22);
  s += tube('M80 28V42', P.iron, '#1f2130', 2.4, 1.4);
  s += shape('M71 46H89L86 42H74Z', P.iron, null, '#1f2130', { sw: 1.8 });
  s += shape(rrect(71.5, 46, 17, 24, 3), '#fff2a8', null, '#1f2130', { sw: 2.2,
    inner: glow(80, 59, 12, '#ffffff', 0.95, 0.6) + line('M80 46V70', P.iron, 1.6) });
  s += shape('M70 70H90L87 75H73Z', P.iron, null, '#1f2130', { sw: 1.8 });
  return s;
}

// ================================================================= HEARTS (48 x 48)
function battery(full) {
  PFX = full ? 'hf' : 'he'; _id = 0;
  const d = heartPath(24, 25, 19);
  if (!full) return `<path d="${d}" fill="${P.heartEmpty}" fill-opacity="0.18" stroke="${P.heartEmpty}" stroke-opacity="0.5" stroke-width="3.4" stroke-linejoin="round"/>`;
  return shape(d, P.heart, P.heartShade, P.heartLine, { sw: 2.4, off: [-2.5, -3],
    hi: [15.5, 15.5, 4.6, 2.8, -35], hiOp: 0.85 }) + `<circle cx="22.5" cy="13.5" r="1.6" fill="#fff" opacity="0.8"/>`;
}

// ================================================================= ICON (256 x 256)
function icon() {
  let s = '';
  PFX = 'ic'; _id = 0;
  const [u, def] = radial(128, 90, 160, [[0, P.navy, 1], [1, P.navy2, 1]]);
  s += def + `<circle cx="128" cy="128" r="122" fill="${u}"/>`;
  const cid = uid();
  s += `<clipPath id="${cid}"><circle cx="128" cy="128" r="122"/></clipPath><g clip-path="url(#${cid})">`;
  // aurora streak
  const [au, adef] = linear(20, 150, 240, 90, [[0, P.aurora, 0], [0.3, P.aurora, 0.75], [0.7, P.aurora, 0.55], [1, P.aurora2, 0]]);
  s += adef + `<path d="M0 150C60 110 120 140 180 104C210 88 236 86 256 90V112C232 108 210 112 184 128C124 162 64 136 0 176Z" fill="${au}"/>`;
  for (const [x, y, r] of [[30, 120, 1.6], [214, 150, 1.4], [44, 200, 1.2], [232, 196, 1.6], [196, 82, 1.2], [150, 218, 1.1]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#e6ecff" opacity="0.85"/>`;
  // snowy hill + lighthouse silhouette (lower left)
  s += `<path d="M0 232Q60 206 130 226Q190 242 256 222V256H0Z" fill="#1a2650"/>`;
  s += glow(218, 182, 26, '#ffe08a', 0.55, 0.18);
  s += `<path d="M204 238L209 192H227L232 238Z" fill="${P.tower}"/><rect x="207" y="180" width="22" height="12" rx="2" fill="${P.tower}"/>`;
  s += `<path d="M205 180L218 168L231 180Z" fill="${P.tower}"/><rect x="211" y="182" width="14" height="7" rx="1.5" fill="#ffe08a"/>`;
  s += line('M210 208H226M209 224H227', '#2a3768', 3);
  s += `</g>`;
  // Ollie hanging upside-down below the beam: his paws grip the beam (body tucked behind it), big head in the middle
  PFX = 'ic'; _id = 100;
  const k = 2.0, tx = 126 - 82 * k, ty = 250;
  s += `<clipPath id="ic2"><circle cx="128" cy="128" r="122"/></clipPath><g clip-path="url(#ic2)">`;
  s += `<g transform="translate(${f(tx)} ${ty}) scale(${k} ${-k})">${ollie('icon', 'icb')}</g>`;
  // ceiling beam at the top (in front of the paws, so he grips it)
  PFX = 'ic'; _id = 200;
  s += shape(rrect(-10, 22, 276, 40, 4), P.beam, P.beamShade, P.beamLine, { off: [0, -5],
    inner: line('M-10 36H266', P.beamShade, 2, ' opacity="0.7"') + [30, 96, 162, 228].map((x) => `<circle cx="${x}" cy="46" r="2.6" fill="${P.beamLine}"/>`).join('') });
  s += `</g>`;
  // gold leaf beside him (lower left)
  s += glow(58, 186, 36, P.leaf[1][0], 0.5, 0.2);
  s += `<g transform="translate(58 186) scale(1.3) rotate(-15) translate(-32 -32)">${leafSvg(1, 'icl')}</g>`;
  PFX = 'ic'; _id = 300;
  s += `<circle cx="128" cy="128" r="122" fill="none" stroke="${P.badge}" stroke-width="7"/>`;
  return s;
}

// ================================================================= write
function write(name, w, h, body) {
  fs.writeFileSync(path.join(OUT, name), svg(w, h, body));
  console.log('wrote', name);
}
fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 4; i++) write(`ollie_run_${i}.svg`, 128, 128, ollie(i, 'r' + i));
write('ollie_air.svg', 128, 128, ollie('air', 'oa'));
write('ollie_bump.svg', 128, 128, ollie('bump', 'ob'));
write('ollie_happy.svg', 128, 128, ollie('happy', 'oh'));
for (let i = 0; i < 3; i++) write(`leaf_${i}.svg`, 64, 64, leafSvg(i, 'l' + i));
write('vent_0.svg', 160, 124, vent0());
write('vent_1.svg', 100, 156, vent1());
write('sign_0.svg', 160, 132, sign0());
write('sign_1.svg', 110, 140, sign1());
write('drone.svg', 128, 96, drone());
write('finish.svg', 160, 300, finish());
write('battery.svg', 48, 48, battery(true));
write('battery_empty.svg', 48, 48, battery(false));
write('icon.svg', 256, 256, icon());
// remove the old Rooftop Flip robot-pup art if it is still around
for (const old of fs.readdirSync(OUT)) if (/^(bolt_|firefly_|gate_)/.test(old)) { fs.unlinkSync(path.join(OUT, old)); console.log('removed', old); }
