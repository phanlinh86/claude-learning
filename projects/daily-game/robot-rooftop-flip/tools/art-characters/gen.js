#!/usr/bin/env node
// Character & item art generator for Bolt's Rooftop Flip.
// 100% original hand-written SVG (no text, fonts, scripts, images or external refs).
// Bolt's frames are built from the SAME head / torso / collar / screen parts, so the body
// geometry is identical across frames: only legs, ears, tail, eyes and mouth change.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Bolt
  body: '#eef2f8', shade: '#b8c4d8', line: '#2a3350', tang: '#ff8a3d', tangShade: '#e06a22', tangLine: '#8a3a12',
  screen: '#1d2440', visor: '#1d2440', visorHi: '#5a6a9a', eye: '#ffffff', pupil: '#141a33',
  nose: '#2a3350', mouth: '#5a2232', tongue: '#ff8a8a', cheek: '#ff9e80', sweat: '#cfeeff', sweatLine: '#5a8ab8',
  // fireflies [fill, line]
  ffBody: '#3b2a4a', ffShade: '#2b1e38', ffLine: '#1f1530', ffHi: '#7a5f94',
  pink: ['#ff5fa2', '#a8235f'], yellow: ['#ffd23f', '#a87a00'], cyan: ['#39e1ff', '#0f7f9e'],
  // gates / posts
  post: '#d6dce8', postShade: '#a3aec4', postLine: '#36405e',
  // obstacles
  ac: '#a9b5a6', acShade: '#859282', acLine: '#3c4a42', acDark: '#5e6b62',
  brick: '#a8705a', brickShade: '#8a5646', brickLine: '#4d2e26', mortar: '#c99a84', cap: '#9a9690', capShade: '#77736e', capLine: '#3f3c3a',
  smoke: '#e8eaf0', smokeShade: '#c4c8d4', smokeLine: '#8a90a4',
  wood: '#b0845a', woodShade: '#8e6640', woodLine: '#4e3420', panel: '#efe2c4', panelShade: '#d8c59e', paw: '#6a4a30',
  chain: '#8d94a8', chainLine: '#3d4358',
  basket: '#b98a52', basketShade: '#956a38', basketLine: '#53381c', leaf: '#6fa463', leafShade: '#4f8446', leafLine: '#2c4f28',
  fl1: '#f4f1ff', fl2: '#b9a3e0', fl3: '#ec8c6c', flLine: '#6a4a6a', flMid: '#f2c75a',
  // drone
  dr: '#f4f1ea', drShade: '#cdc6b6', drLine: '#3a3f58', drBand: '#ef7a5a', drBandShade: '#cf5a3c', drLight: '#5ef0a0',
  rope: '#d9c49a', ropeLine: '#6e5a34', hook: '#9aa3b8',
  // finish
  bulb: '#fff3c4', bulbLine: '#a08a3a', b1: '#ef7a5a', b2: '#7ad7a8', b3: '#a98ae6', b4: '#f5c04a', wire: '#3a4466',
  starW: '#fff2a8', starLine: '#b07c00',
  // battery
  bat: '#46d68c', batShade: '#2fb06d', batLine: '#1c6b45', batEmpty: '#a7a3c4',
  // icon
  night: '#24306a', night2: '#0e1638', badge: '#7d8fe0', city: '#18204a', win: '#ffd98a', rail: '#9aa5c4', railShade: '#6c7899', railLine: '#2a3350',
};
const SYM = ['heart', 'star', 'drop'];
const COLS = ['pink', 'yellow', 'cyan'];

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
// optional inner art + highlight; outline drawn UNDER the fill as a fat stroke, so unions of
// several paths get one clean silhouette outline (no seams between parts).
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
    s += `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" transform="rotate(${r} ${hx} ${hy})" fill="#fff" opacity="${opt.hiOp ?? 0.7}"/>`;
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
function glow(cx, cy, r, col, a0 = 0.6, a1 = 0.25) {
  const [u, def] = radial(cx, cy, r, [[0, col, a0], [0.5, col, a1], [1, col, 0]]);
  return def + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${u}"/>`;
}
function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
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
// --- the three symbols, all "radius" r (fit roughly in a 2r box), centred at (cx, cy)
const heartPath = (cx, cy, r) => {
  const s = r * 1.02, oy = 0.04;
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + (y + oy) * s)}`;
  return `M${p(0, 0.92)}C${p(-0.38, 0.66)} ${p(-1, 0.24)} ${p(-1, -0.3)}C${p(-1, -0.74)} ${p(-0.64, -0.98)} ${p(-0.32, -0.98)}` +
    `C${p(-0.14, -0.98)} ${p(0, -0.86)} ${p(0, -0.62)}C${p(0, -0.86)} ${p(0.14, -0.98)} ${p(0.32, -0.98)}` +
    `C${p(0.64, -0.98)} ${p(1, -0.74)} ${p(1, -0.3)}C${p(1, 0.24)} ${p(0.38, 0.66)} ${p(0, 0.92)}Z`;
};
const starPath = (cx, cy, r) => softPoly(starPts(cx, cy + r * 0.08, r * 1.12, r * 0.5), 0.2);
const dropPath = (cx, cy, r) => {
  const s = r, oy = -0.05;
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + (y + oy) * s)}`;
  return `M${p(0, -1.15)}C${p(0.3, -0.7)} ${p(0.86, -0.18)} ${p(0.86, 0.32)}A${f(0.86 * s)} ${f(0.86 * s)} 0 0 1 ${p(-0.86, 0.32)}` +
    `C${p(-0.86, -0.18)} ${p(-0.3, -0.7)} ${p(0, -1.15)}Z`;
};
const symPath = (i, cx, cy, r) => [heartPath, starPath, dropPath][i](cx, cy, r);

// ================================================================= BOLT
// Fixed anchors (DESIGN §4.1): feet line y 120, body centre (64,74), chest screen (60,82) r 10.
const HEAD = circ(80, 42, 27);
const SNOUT = ell(104, 56, 14, 9.5);
const TORSO = ell(62, 81, 30, 20.5);
const HIP = { back: [45, 94], front: [78, 94] };
const FAR_DX = 6; // far legs sit a little to the right (perspective) and are drawn darker, behind the torso

// floppy ear, hinge at (0,0), hanging down (+y) at rotation 0
const EAR = 'M-6 -3C-14 3 -17 18 -13 30C-11 37 -3 38 1 32C6 24 8 10 6 0C4 -5 -2 -6 -6 -3Z';
const EAR_IN = 'M-6 4C-11 10 -12 20 -10 27C-8 32 -4 32 -2 28C2 21 3 12 2 5C0 1 -4 1 -6 4Z';
function ear(hx, hy, rot, far) {
  const g = `<g transform="translate(${hx} ${hy}) rotate(${rot})">`;
  if (far) return g + shape(EAR, P.shade, null, P.line) + `</g>`;
  return g + shape(EAR, P.body, P.shade, P.line, { off: [-3, -2] }) +
    shape(EAR_IN, P.tang, P.tangShade, P.tang, { sw: 0, off: [-2, -2] }) + `</g>`;
}
function tail(rot) {
  // a short coil spring from the rump with a tangerine ball tip
  const d = 'M0 0L-5 -7L-9 -1L-13 -9L-17 -3L-20 -11';
  return `<g transform="translate(34 76) rotate(${rot})">` + tube(d, P.shade, P.line, 4.5, 2.5) +
    shape(circ(-23, -15, 6.5), P.tang, P.tangShade, P.tangLine, { off: [-2, -2], hi: [-25, -17.5, 2, 1.5] }) + `</g>`;
}
// one leg: hip -> paw centre (px, py); paw tilt in degrees
function leg(hip, px, py, tilt, far) {
  const [hx, hy] = hip;
  const core = far ? P.shade : P.body;
  let s = tube(`M${hx} ${hy}L${f(px)} ${f(py - 3)}`, core, P.line, 10, 3);
  // magnet paw: rounded pad with a tangerine stripe on the sole
  const pad = rrect(px - 9, py - 5, 18, 10, 5);
  const id = uid();
  s += `<g transform="rotate(${tilt} ${f(px)} ${f(py)})">` +
    shape(pad, far ? P.shade : P.body, far ? null : P.shade, P.line, { off: [-2, -2],
      inner: `<rect x="${f(px - 10)}" y="${f(py + 1.2)}" width="20" height="4" fill="${far ? P.tangShade : P.tang}"/>` }) + `</g>`;
  void id;
  return s;
}
// paw positions per pose: [nearBack, farBack, nearFront, farFront] as [dx, lift, tilt]
const GROUND = 115; // paw centre y when standing (pad bottom 120 -> outline reaches the feet line 120)
function runLegs(frame) {
  // trot: near-front + far-back move together, the other diagonal half a cycle later.
  const L = (p) => {
    p = ((p % 1) + 1) % 1;
    if (p < 0.5) { const t = p / 0.5; return [11 - 22 * t, 0, -6 + 12 * t]; } // stance: paw slides back
    const t = (p - 0.5) / 0.5; // swing: paw lifts and comes forward
    return [-11 + 22 * t, 10 * Math.sin(Math.PI * t), 18 - 30 * t];
  };
  const p = frame / 4 + 0.125;
  return { nearFront: L(p), farBack: L(p), nearBack: L(p + 0.5), farFront: L(p + 0.5) };
}
function legs(pose, layer) {
  // layer 'far' = behind torso, 'near' = in front
  let L;
  if (pose === 'air') L = { nearFront: [8, 12, -30], farFront: [9, 13, -30], nearBack: [-8, 12, 30], farBack: [-7, 13, 30] };
  else if (pose === 'bump') L = { nearFront: [6, 0, 0], farFront: [-2, 3, -8], nearBack: [-6, 0, 0], farBack: [2, 3, 8] };
  else if (pose === 'happy') L = { nearFront: [9, 6, -18], farFront: [3, 0, 0], nearBack: [-4, 0, 0], farBack: [2, 0, 0] };
  else L = runLegs(pose);
  const one = (key, hip, far) => {
    const [dx, lift, tilt] = L[key];
    const hx = hip[0] + (far ? FAR_DX : 0);
    return leg([hx, hip[1]], hx + dx, GROUND - lift, tilt, far);
  };
  if (layer === 'far') return one('farBack', HIP.back, true) + one('farFront', HIP.front, true);
  return one('nearBack', HIP.back, false) + one('nearFront', HIP.front, false);
}
// eyes + mouth per expression
function face(expr) {
  let s = '';
  // dark glass face plate, clipped to the head silhouette
  const cid = uid();
  s += `<clipPath id="${cid}"><path d="${HEAD}"/><path d="${SNOUT}"/></clipPath><g clip-path="url(#${cid})">`;
  s += `<path d="${ell(94, 37, 17.5, 13.5)}" fill="${P.visor}" stroke="${P.line}" stroke-width="2"/>`;
  s += line('M80 30Q85 25 93 24', P.visorHi, 2.2, ' opacity="0.9"');
  if (expr === 'open' || expr === 'air') {
    s += `<ellipse cx="88" cy="38" rx="6.6" ry="8.2" fill="${P.eye}"/><ellipse cx="102" cy="37" rx="5" ry="7.2" fill="${P.eye}"/>`;
    s += `<ellipse cx="89.6" cy="39" rx="4.3" ry="5.8" fill="${P.pupil}"/><ellipse cx="103.2" cy="38" rx="3.3" ry="5" fill="${P.pupil}"/>`;
    s += `<circle cx="87.6" cy="35.6" r="2.1" fill="#fff"/><circle cx="101.6" cy="34.8" r="1.6" fill="#fff"/>`;
    s += `<circle cx="91" cy="41.6" r="0.9" fill="#fff" opacity="0.8"/>`;
  } else if (expr === 'bump') {
    s += line('M84 32L91.5 37.5L84 43', P.eye, 3.2) + line('M105 31.5L99 37L105 42.5', P.eye, 3);
  } else if (expr === 'happy') {
    s += line('M82.5 41Q88 32 93.5 41', P.eye, 3.4) + line('M97.5 40Q102 32.5 106.5 40', P.eye, 3);
  }
  s += `</g>`;
  // cheek
  s += `<ellipse cx="90.5" cy="57.5" rx="4.2" ry="2.6" fill="${P.cheek}" opacity="0.55"/>`;
  // nose on the snout tip
  s += `<ellipse cx="116" cy="51" rx="4.6" ry="3.6" fill="${P.nose}"/><ellipse cx="114.8" cy="49.8" rx="1.5" ry="1" fill="#fff" opacity="0.8"/>`;
  // mouth
  if (expr === 'open') s += line('M103 59.5Q108 63.5 113.5 59.5', P.line, 2.4);
  else if (expr === 'air') s += `<ellipse cx="108.5" cy="60.3" rx="3.4" ry="3.6" fill="${P.mouth}" stroke="${P.line}" stroke-width="1.8"/>`;
  else if (expr === 'bump') s += line('M101.5 60.5q2 -2.2 4 0t4 0t4 0', P.line, 2.2);
  else if (expr === 'happy') {
    const m = 'M101.5 57.5Q108.5 69 115.5 57.5Z';
    const id = uid();
    s += `<clipPath id="${id}"><path d="${m}"/></clipPath><path d="${m}" fill="${P.mouth}"/>` +
      `<g clip-path="url(#${id})"><ellipse cx="108.5" cy="65" rx="5" ry="3.6" fill="${P.tongue}"/></g>` +
      `<path d="${m}" fill="none" stroke="${P.line}" stroke-width="2.2" stroke-linejoin="round"/>`;
  }
  return s;
}
// pose: 0..3 (run frames), 'air', 'bump', 'happy'
function bolt(pose, prefix) {
  PFX = prefix; _id = 0;
  const run = typeof pose === 'number';
  // ear + tail angles: run bob is tiny (±4° ears, ±6° tail)
  let earA, tailA, expr;
  if (run) { earA = [11, 6, 4, 9][pose]; tailA = [6, 0, -6, 0][pose]; expr = 'open'; }
  else if (pose === 'air') { earA = 62; tailA = -18; expr = 'air'; }
  else if (pose === 'bump') { earA = 100; tailA = 14; expr = 'bump'; }
  else if (pose === 'icon') { earA = 10; tailA = 0; expr = 'open'; }
  else { earA = 24; tailA = -10; expr = 'happy'; }
  let s = '';
  // antenna (behind head)
  s += tube('M75 18Q72 10 71 6', P.shade, P.line, 3.2, 2.5);
  s += shape(circ(71, 6, 4.6), P.tang, P.tangShade, P.tangLine, { sw: 2.5, off: [-1.5, -1.5], hi: [69.6, 4.6, 1.5, 1.2] });
  // far ear peeks behind the head
  s += ear(83, 19, pose === 'air' ? 40 : pose === 'bump' ? 24 : earA + 14, true);
  s += tail(tailA);
  s += legs(pose === 'icon' ? 'happy' : pose, 'far');
  s += shape(TORSO, P.body, P.shade, P.line, { off: [-5, -6], hi: [50, 68, 9, 3.5, -12], hiOp: 0.8 });
  s += legs(pose === 'icon' ? 'happy' : pose, 'near');
  // collar (tangerine band at the neck) - under the head
  s += tube('M55 61Q64 71 80 70.5', P.tang, P.tangLine, 6.5, 2.5);
  // head + snout as one silhouette
  s += shape([HEAD, SNOUT], P.body, P.shade, P.line, { off: [-5, -5], hi: [66, 26, 7, 3.5, -35], hiOp: 0.85 });
  s += face(expr);
  // near ear in front of the head
  s += ear(65, 24, earA, false);
  // chest screen: bezel + dark glass + highlight (the renderer draws the colour symbol on it)
  s += `<circle cx="60" cy="82" r="12.6" fill="${P.shade}" stroke="${P.line}" stroke-width="2.4"/>`;
  s += `<circle cx="60" cy="82" r="10" fill="${P.screen}"/>`;
  s += line('M53.5 77.5Q55.5 74.6 58.8 74', '#ffffff', 1.8, ' opacity="0.55"');
  if (pose === 'bump') {
    // little sweat drop near the forehead
    s += shape(dropPath(112, 18, 4.6), P.sweat, null, P.sweatLine, { sw: 1.6 });
  }
  return s;
}

// ================================================================= FIREFLY
const WING = (rot, k) => `<ellipse cx="0" cy="-8" rx="${f(6.5 * k)}" ry="${f(12 * k)}" transform="rotate(${rot})" fill="#ffffff" fill-opacity="0.55" stroke="#ffffff" stroke-opacity="0.95" stroke-width="1.6"/>` +
  `<path d="M0 -2L0 ${f(-16 * k)}" transform="rotate(${rot})" stroke="#c9c2e6" stroke-width="1" opacity="0.8"/>`;
function firefly(ci, frame, prefix) {
  PFX = prefix; _id = 0;
  const [col, lineC] = P[COLS[ci]];
  let s = '';
  // wings (hinge on the back, (30, 22)): frame 0 raised, frame 1 lowered
  const back = frame === 0 ? [28, 12] : [70, 100];
  s += `<g transform="translate(31 23)">${WING(back[1], 1.0)}</g>`;
  // antennae
  s += line('M15 18Q11 9 6 7', P.ffLine, 1.8) + `<circle cx="6" cy="7" r="2" fill="${P.ffHi}"/>`;
  s += line('M19 17Q19 9 16 4', P.ffLine, 1.8) + `<circle cx="16" cy="4" r="2" fill="${P.ffHi}"/>`;
  // tiny legs
  s += line('M24 36L21 41', P.ffLine, 1.8) + line('M29 37L27 43', P.ffLine, 1.8);
  // thorax + head (thin lilac rim outside the dark outline so it reads on the night sky)
  for (const d of [ell(28, 29, 11, 9), circ(16, 25, 9.5)]) s += `<path d="${d}" fill="none" stroke="#9c84c4" stroke-width="7.2" opacity="0.65"/>`;
  s += shape([ell(28, 29, 11, 9), circ(16, 25, 9.5)], P.ffBody, P.ffShade, P.ffLine, { sw: 2, off: [-2, -2], hi: [13, 20, 3.2, 1.8, -30], hiOp: 0.45 });
  // eyes
  s += `<circle cx="10.6" cy="25.6" r="3.2" fill="#fff"/><circle cx="9.9" cy="26.1" r="1.9" fill="#1a1024"/><circle cx="10.6" cy="25" r="0.8" fill="#fff"/>`;
  s += `<circle cx="17.6" cy="23.6" r="2.7" fill="#fff"/><circle cx="17" cy="24.1" r="1.6" fill="#1a1024"/><circle cx="17.6" cy="23.1" r="0.7" fill="#fff"/>`;
  s += line('M10 31.5Q12.5 33.5 15 31.5', '#c9a6d9', 1.3);
  // front wing over the body
  const fr = frame === 0 ? [-8, 1.08] : [78, 1.08];
  s += `<g transform="translate(28 22)">${WING(fr[0], fr[1])}</g>`;
  // glowing tail lantern = the symbol, centred (34, 40) r ~14
  const d = symPath(ci, 34, 40, 14);
  const [u, def] = radial(33, 38, 15, [[0, '#ffffff', 1], [0.35, '#ffffff', 0.9], [0.7, col, 1], [1, col, 1]]);
  s += def + `<path d="${d}" fill="${lineC}" stroke="${lineC}" stroke-width="5" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="${col}"/>`;
  const id = uid();
  s += `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})"><path d="${symPath(ci, 33, 38.5, 9.5)}" fill="${u}"/></g>`;
  s += `<ellipse cx="28.5" cy="33" rx="2.8" ry="1.8" transform="rotate(-30 28.5 33)" fill="#fff" opacity="0.9"/>`;
  return s;
}

// ================================================================= GATE (96 x 300)
function lampPost(y0, up, col, lineC) {
  // a short rounded housing across the gate, its lamp lens facing the curtain
  let s = shape(rrect(6, y0, 84, 24, 11), P.post, P.postShade, P.postLine, { off: [-3, -3], hi: [26, y0 + 6, 12, 2.5] });
  const ly = up ? y0 + 21 : y0 + 3;
  s += `<path d="${rrect(16, ly - 3, 64, 6, 3)}" fill="${col}" stroke="${lineC}" stroke-width="2"/>`;
  s += `<rect x="22" y="${ly - 1}" width="52" height="2" rx="1" fill="#fff" opacity="0.8"/>`;
  for (const x of [20, 76]) s += `<circle cx="${x}" cy="${y0 + 12}" r="2.4" fill="${P.postShade}" stroke="${P.postLine}" stroke-width="1.4"/>`;
  return s;
}
function gate(ci, prefix) {
  PFX = prefix; _id = 0;
  const [col, lineC] = P[COLS[ci]];
  let s = '';
  // curtain: soft horizontal fade, soft vertical stripes (alpha <= 0.45)
  const gid = uid();
  s += `<linearGradient id="${gid}" x1="14" y1="0" x2="82" y2="0" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${col}" stop-opacity="0.05"/><stop offset="0.3" stop-color="${col}" stop-opacity="0.34"/>` +
    `<stop offset="0.5" stop-color="${col}" stop-opacity="0.42"/><stop offset="0.7" stop-color="${col}" stop-opacity="0.34"/>` +
    `<stop offset="1" stop-color="${col}" stop-opacity="0.05"/></linearGradient>`;
  s += `<rect x="12" y="22" width="72" height="256" fill="url(#${gid})"/>`;
  for (const [x, w, a] of [[24, 4, 0.22], [36, 6, 0.18], [52, 5, 0.2], [66, 4, 0.2]]) s += `<rect x="${x}" y="22" width="${w}" height="256" rx="2" fill="#ffffff" opacity="${a}"/>`;
  // little light sparkles drifting in the curtain
  for (const [x, y, r] of [[30, 110, 1.6], [64, 120, 1.3], [40, 190, 1.4], [60, 260, 1.2], [34, 40, 1.2], [62, 44, 1.5], [28, 160, 1.1], [68, 182, 1.2]])
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.75"/>`;
  // symbols: dark rim, white outline, colour fill
  const sym = (cy, r, w) => {
    const d = symPath(ci, 48, cy, r);
    return `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${w + 4}" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="${col}" stroke="#ffffff" stroke-width="${w}" stroke-linejoin="round"/>` +
      `<path d="${symPath(ci, 45, cy - r * 0.18, r * 0.36)}" fill="#fff" opacity="0.55"/>`;
  };
  s += glow(48, 150, 36, col, 0.55, 0.22);
  s += sym(70, 10, 2.4) + sym(230, 10, 2.4) + sym(150, 22, 3.4);
  s += lampPost(2, true, col, lineC) + lampPost(274, false, col, lineC);
  // hanger stub to the rail (top) and feet on the roof (bottom)
  return s;
}

// ================================================================= OBSTACLES
function vent0() { // rooftop AC unit 160 x 124, bottom = 124
  PFX = 'v0'; _id = 0;
  let s = '';
  // feet
  for (const x of [22, 118]) s += shape(rrect(x, 106, 20, 15, 4), P.acDark, null, P.acLine, { sw: 2.5 });
  // top pipe
  s += tube('M40 20V8H62', P.acShade, P.acLine, 7, 2.5);
  s += shape(rrect(8, 16, 144, 94, 16), P.ac, P.acShade, P.acLine, { off: [-6, -6], hi: [44, 26, 26, 4], hiOp: 0.5 });
  // louvre slats (left)
  for (let i = 0; i < 5; i++) s += line(`M22 ${36 + i * 13}H58`, P.acLine, 3.2) + line(`M23 ${38.5 + i * 13}H57`, '#c9d2c6', 1.4);
  // fan grille (right)
  s += `<circle cx="106" cy="62" r="34" fill="${P.acDark}" stroke="${P.acLine}" stroke-width="3"/>`;
  s += `<circle cx="106" cy="62" r="28" fill="#4c5750"/>`;
  for (let i = 0; i < 4; i++) {
    const a = i * 90;
    s += `<path d="M106 62C112 52 124 50 128 56C126 64 116 66 106 62Z" transform="rotate(${a} 106 62)" fill="#8a988a" stroke="${P.acLine}" stroke-width="1.8"/>`;
  }
  for (const r of [12, 21, 30]) s += `<circle cx="106" cy="62" r="${r}" fill="none" stroke="#b9c4b6" stroke-width="1.6" opacity="0.85"/>`;
  s += line('M76 62H136M106 32V92', '#b9c4b6', 1.6, ' opacity="0.85"');
  s += `<circle cx="106" cy="62" r="5" fill="#c9d2c6" stroke="${P.acLine}" stroke-width="2"/>`;
  // corner screws
  for (const [x, y] of [[18, 24], [142, 24], [18, 102], [142, 102]]) s += `<circle cx="${x}" cy="${y}" r="2.2" fill="${P.acShade}" stroke="${P.acLine}" stroke-width="1.2"/>`;
  return s;
}
function vent1() { // brick chimney 100 x 156 with a smoke puff, bottom = 156
  PFX = 'v1'; _id = 0;
  let s = '';
  // smoke puff (soft, inside the box)
  s += `<g opacity="0.9">` + shape([circ(46, 46, 12), circ(60, 36, 13), circ(42, 26, 10), circ(58, 16, 9), circ(70, 50, 9)], P.smoke, P.smokeShade, P.smokeLine, { sw: 2, off: [-3, -3] }) + `</g>`;
  const bricks = (() => {
    let b = '';
    for (let r = 0; r < 6; r++) {
      const y = 82 + r * 13;
      b += `<path d="M18 ${y}H82" stroke="${P.mortar}" stroke-width="2"/>`;
      for (let x = (r % 2 ? 28 : 38); x < 82; x += 22) b += `<path d="M${x} ${y}V${y + 13}" stroke="${P.mortar}" stroke-width="2"/>`;
    }
    return b;
  })();
  s += shape(rrect(20, 72, 60, 86, 5), P.brick, P.brickShade, P.brickLine, { off: [-6, 0], inner: bricks });
  s += shape(rrect(12, 60, 76, 18, 7), P.cap, P.capShade, P.capLine, { off: [-3, -3], hi: [32, 64, 12, 2] });
  s += `<path d="${rrect(28, 60, 44, 5, 2.5)}" fill="#3a3632"/>`;
  return s;
}
function chain(x, y0, y1) {
  let s = '';
  for (let y = y0; y < y1 - 4; y += 8) {
    const vert = ((y - y0) / 8) % 2 === 0;
    s += vert ? `<rect x="${x - 3}" y="${y}" width="6" height="10" rx="3" fill="none" stroke="${P.chainLine}" stroke-width="4"/><rect x="${x - 3}" y="${y}" width="6" height="10" rx="3" fill="none" stroke="${P.chain}" stroke-width="1.8"/>`
      : `<rect x="${x - 1.5}" y="${y}" width="3" height="10" rx="1.5" fill="${P.chain}" stroke="${P.chainLine}" stroke-width="1.6"/>`;
  }
  return s;
}
function sign0() { // hanging shop sign 160 x 132, chains top y 0, board bottom y 132
  PFX = 's0'; _id = 0;
  let s = '';
  s += shape(rrect(30, 0, 100, 8, 4), P.chain, P.shade, P.chainLine, { sw: 2.5, off: [0, -2] });
  s += chain(42, 6, 42) + chain(118, 6, 42);
  // board
  s += shape(rrect(10, 38, 140, 91, 18), P.wood, P.woodShade, P.woodLine, { off: [-5, -5], hi: [40, 46, 20, 3] });
  for (const x of [42, 118]) s += `<circle cx="${x}" cy="45" r="3" fill="${P.woodShade}" stroke="${P.woodLine}" stroke-width="1.8"/>`;
  s += shape(rrect(24, 52, 112, 64, 12), P.panel, P.panelShade, P.woodLine, { sw: 2.5, off: [-3, -3] });
  // paw-print pictogram
  s += `<g fill="${P.paw}">` + `<path d="${ell(80, 92, 13, 10.5)}"/>` +
    [[63, 77, 5.4, 6.4, -20], [74, 69, 5.4, 6.8, -6], [86, 69, 5.4, 6.8, 6], [97, 77, 5.4, 6.4, 20]]
      .map(([x, y, rx, ry, r]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})"/>`).join('') + `</g>`;
  return s;
}
function flower(cx, cy, r, col, rot = 0) {
  let s = `<g transform="rotate(${rot} ${cx} ${cy})">`;
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    petals.push(circ(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.48));
  }
  s += shape(petals, col, null, P.flLine, { sw: 1.6 });
  s += `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.34)}" fill="${P.flMid}" stroke="${P.flLine}" stroke-width="1.4"/>`;
  return s + `</g>`;
}
function sign1() { // hanging flower basket 110 x 140, cords top y 0, bottom y 140
  PFX = 's1'; _id = 0;
  let s = '';
  s += shape(circ(55, 5, 4.5), P.chain, null, P.chainLine, { sw: 2 });
  for (const x of [14, 55, 96]) s += line(`M55 7L${x} 96`, P.basketLine, 3.4) + line(`M55 7L${x} 96`, P.rope, 1.6);
  // leaves spilling over
  s += shape([ell(22, 92, 14, 7), ell(88, 92, 14, 7), ell(40, 84, 13, 8), ell(70, 84, 13, 8), ell(14, 104, 7, 10), ell(98, 106, 7, 11)], P.leaf, P.leafShade, P.leafLine, { sw: 2, off: [-2, -2] });
  s += flower(30, 78, 15, P.fl1, 10) + flower(80, 77, 15, P.fl2, -12) + flower(55, 70, 17, P.fl3, 0) + flower(16, 92, 10, P.fl2, 20) + flower(95, 93, 10, P.fl1, -20);
  // basket (woven)
  const weave = (() => {
    let w = '';
    for (let y = 104; y < 140; y += 8) w += `<path d="M10 ${y}H100" stroke="${P.basketShade}" stroke-width="2"/>`;
    for (let x = 18; x < 100; x += 10) w += `<path d="M${x} 96V140" stroke="${P.basketShade}" stroke-width="1.4" opacity="0.7"/>`;
    return w;
  })();
  s += shape('M12 96H98Q96 128 78 136Q55 141 32 136Q14 128 12 96Z', P.basket, P.basketShade, P.basketLine, { off: [-4, -4], inner: weave });
  s += shape(rrect(8, 92, 94, 9, 4.5), P.basket, P.basketShade, P.basketLine, { sw: 2.6, off: [-2, -2], hi: [34, 94.5, 14, 1.4] });
  return s;
}

// ================================================================= DRONE (128 x 96)
function drone() {
  PFX = 'dr'; _id = 0;
  let s = '';
  // rope + hook (hook grab point at (64, 92))
  s += line('M64 54Q61 66 64 78', P.ropeLine, 5) + line('M64 54Q61 66 64 78', P.rope, 2.4);
  s += tube('M64 78V84Q64 92 70 92Q76 92 76 86', P.hook, P.drLine, 3.4, 2.2);
  s += `<circle cx="64" cy="78" r="3.2" fill="${P.hook}" stroke="${P.drLine}" stroke-width="2"/>`;
  // arms
  for (const sx of [-1, 1]) {
    s += tube(`M${64 + sx * 18} 32L${64 + sx * 42} 20`, P.drShade, P.drLine, 6, 2.5);
    s += shape(rrect(64 + sx * 42 - 5, 12, 10, 12, 4), P.drShade, null, P.drLine, { sw: 2.4 });
    // propeller as a blurred disc
    const [u, def] = radial(64 + sx * 42, 11, 22, [[0, '#ffffff', 0.85], [0.6, '#dfe6f4', 0.55], [1, '#dfe6f4', 0.15]]);
    s += def + `<ellipse cx="${64 + sx * 42}" cy="11" rx="22" ry="5.5" fill="${u}" stroke="${P.drLine}" stroke-width="1.4" stroke-opacity="0.45"/>`;
    s += `<path d="M${64 + sx * 42 - 15} 10.4Q${64 + sx * 42} 7.4 ${64 + sx * 42 + 15} 10.4" fill="none" stroke="#9aa3c0" stroke-width="1.6" opacity="0.6"/>`;
    s += `<circle cx="${64 + sx * 42}" cy="12" r="2.6" fill="${P.drLine}"/>`;
  }
  // body
  s += shape(ell(64, 36, 25, 19), P.dr, P.drShade, P.drLine, { off: [-4, -4], hi: [53, 24, 8, 3, -20],
    inner: `<path d="M36 40Q64 50 92 40V48Q64 60 36 48Z" fill="${P.drBand}"/>` });
  // friendly eyes on a small window
  s += `<path d="${rrect(50, 24, 28, 14, 7)}" fill="${P.visor}" stroke="${P.drLine}" stroke-width="2"/>`;
  s += `<ellipse cx="58" cy="31" rx="3" ry="3.6" fill="#fff"/><ellipse cx="70" cy="31" rx="3" ry="3.6" fill="#fff"/>`;
  s += `<circle cx="58.7" cy="31.6" r="1.6" fill="${P.pupil}"/><circle cx="70.7" cy="31.6" r="1.6" fill="${P.pupil}"/>`;
  // little top light
  s += `<rect x="61" y="13.5" width="6" height="5" rx="1.5" fill="${P.drShade}" stroke="${P.drLine}" stroke-width="1.6"/>`;
  s += glow(64, 13, 9, P.drLight, 0.7, 0.25) + `<circle cx="64" cy="13" r="3.4" fill="${P.drLight}" stroke="#1f7a4c" stroke-width="1.4"/><circle cx="63" cy="12" r="1" fill="#fff"/>`;
  return s;
}

// ================================================================= FINISH (160 x 300)
function finish() {
  PFX = 'fn'; _id = 0;
  let s = '';
  // poles (thin) between the top and bottom posts
  for (const x of [16, 144]) s += tube(`M${x} 26V274`, P.post, P.postLine, 6, 2.5);
  // glow + star
  s += glow(80, 150, 60, '#fff2a8', 0.6, 0.25);
  // light-bulb strings
  const swag = (y, dy) => `M16 ${y}Q80 ${y + dy} 144 ${y}`;
  for (const [y, dy] of [[40, 34], [226, 34]]) {
    s += line(swag(y, dy), P.wire, 2);
    for (let i = 1; i < 8; i++) {
      const t = i / 8, x = 16 + 128 * t, yy = (1 - t) * (1 - t) * y + 2 * t * (1 - t) * (y + dy) + t * t * y;
      s += glow(f(x), f(yy + 5), 9, '#fff3c4', 0.6, 0.2);
      s += `<rect x="${f(x - 2.5)}" y="${f(yy - 1)}" width="5" height="4" rx="1" fill="${P.wire}"/>`;
      s += `<circle cx="${f(x)}" cy="${f(yy + 6)}" r="4.6" fill="${P.bulb}" stroke="${P.bulbLine}" stroke-width="1.6"/><circle cx="${f(x - 1.4)}" cy="${f(yy + 4.6)}" r="1.4" fill="#fff"/>`;
    }
  }
  // bunting banners above and below the star
  const cols = [P.b1, P.b2, P.b3, P.b4];
  for (const [y, dy] of [[86, 20], [192, 20]]) {
    s += line(swag(y, dy), P.wire, 2.2);
    for (let i = 0; i < 7; i++) {
      const t0 = (i + 0.15) / 7, t1 = (i + 0.85) / 7, tm = (i + 0.5) / 7;
      const pt = (t) => [16 + 128 * t, (1 - t) * (1 - t) * y + 2 * t * (1 - t) * (y + dy) + t * t * y];
      const a = pt(t0), b = pt(t1), m = pt(tm);
      const c = cols[i % 4];
      s += `<path d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}L${f(m[0])} ${f(m[1] + 18)}Z" fill="${c}" stroke="${P.wire}" stroke-width="1.8" stroke-linejoin="round"/>`;
      s += `<path d="M${f(a[0] + 2)} ${f(a[1] + 2)}L${f(m[0])} ${f(m[1] + 3)}L${f(m[0] - 1)} ${f(m[1] + 10)}Z" fill="#fff" opacity="0.35"/>`;
    }
  }
  const st = starPath(80, 150, 26);
  s += `<path d="${st}" fill="${P.starW}" stroke="${P.starLine}" stroke-width="6" stroke-linejoin="round"/>`;
  s += `<path d="${st}" fill="${P.starW}"/>`;
  const [u, def] = radial(80, 150, 26, [[0, '#ffffff', 1], [0.6, '#fff6c8', 1], [1, '#ffd96a', 1]]);
  s += def + `<path d="${starPath(80, 150, 22)}" fill="${u}"/>`;
  s += `<ellipse cx="72" cy="140" rx="5" ry="3" transform="rotate(-30 72 140)" fill="#fff" opacity="0.9"/>`;
  // top & bottom posts
  for (const [y0, h] of [[0, 30], [270, 30]]) {
    for (const x of [16, 144]) {
      s += shape(rrect(x - 13, y0 + 1, 26, h - 2, 9), P.post, P.postShade, P.postLine, { off: [-3, -3], hi: [x - 5, y0 + 8, 3, 6] });
      s += `<circle cx="${x}" cy="${y0 + (y0 ? 9 : h - 9)}" r="4.4" fill="${P.b4}" stroke="${P.starLine}" stroke-width="1.6"/>`;
    }
  }
  return s;
}

// ================================================================= BATTERY (48 x 48)
function battery(full) {
  PFX = full ? 'bf' : 'be'; _id = 0;
  const bodyD = rrect(4, 12, 36, 24, 7), nub = rrect(39, 18.5, 6, 11, 2.5);
  const bolt = 'M25 15L14 26H21L18 33L30 21H23L25 15Z';
  if (!full) {
    return `<g opacity="0.5" fill="none" stroke="${P.batEmpty}" stroke-linejoin="round"><path d="${bodyD}" stroke-width="3.2"/><path d="${nub}" stroke-width="2.6"/>` +
      `<path d="${bolt}" stroke-width="1.8"/></g>`;
  }
  let s = shape(nub, P.batShade, null, P.batLine, { sw: 2.4 });
  s += shape(bodyD, P.bat, P.batShade, P.batLine, { off: [-2, -3], hi: [14, 16, 7, 1.8] });
  s += `<path d="${bolt}" fill="#ffffff" stroke="${P.batLine}" stroke-width="1.6" stroke-linejoin="round"/>`;
  return s;
}

// ================================================================= ICON (256 x 256)
function icon() {
  let s = '';
  PFX = 'ic'; _id = 0;
  const [u, def] = radial(128, 100, 150, [[0, P.night, 1], [1, P.night2, 1]]);
  s += def + `<circle cx="128" cy="128" r="122" fill="${u}"/>`;
  const cid = uid();
  s += `<clipPath id="${cid}"><circle cx="128" cy="128" r="122"/></clipPath><g clip-path="url(#${cid})">`;
  for (const [x, y, r] of [[60, 110, 1.6], [204, 96, 1.4], [40, 150, 1.2], [224, 156, 1.6], [180, 70, 1.1], [96, 92, 1.1]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe4ff" opacity="0.8"/>`;
  // buildings
  const B = [[0, 196, 46], [42, 214, 34], [74, 186, 30], [102, 206, 40], [140, 192, 30], [168, 210, 38], [204, 188, 52]];
  for (const [x, y, w] of B) {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${256 - y}" fill="${P.city}"/>`;
    for (let wy = y + 10; wy < 250; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 11) if ((wx * 7 + wy * 3) % 5 < 2) s += `<rect x="${wx}" y="${wy}" width="4" height="5" fill="${P.win}" opacity="0.85"/>`;
  }
  // rail girder at the top
  s += shape(rrect(-10, 36, 276, 30, 6), P.rail, P.railShade, P.railLine, { off: [0, -5] });
  for (let x = 6; x < 256; x += 26) s += line(`M${x} 41L${x + 13} 61L${x + 26} 41`, P.railShade, 2.6);
  s += `<rect x="-10" y="62" width="276" height="3" fill="#ffe7b0" opacity="0.6"/>`;
  // yellow star firefly beside him
  s += glow(210, 116, 44, P.yellow[0], 0.65, 0.25);
  s += `</g>`;
  s += `<g transform="translate(166 64) scale(1.3)">${firefly(1, 0, 'icf')}</g>`;
  PFX = 'ic'; _id = 100;
  // Bolt hanging upside-down from the rail: feet line (y 120) on the rail underside (y 66)
  const k = 1.6;
  s += `<g clip-path="url(#ic2)"><g transform="translate(${f(140 - 80 * k)} ${f(66 + 120 * k)}) scale(${k} ${-k})">${bolt('icon', 'icb')}` +
    `<path d="${starPath(60, 82, 7)}" fill="${P.yellow[0]}"/></g></g>`;
  s = s.replace('<g clip-path="url(#ic2)">', `<clipPath id="ic2"><circle cx="128" cy="128" r="122"/></clipPath><g clip-path="url(#ic2)">`);
  s += `<circle cx="128" cy="128" r="122" fill="none" stroke="${P.badge}" stroke-width="7"/>`;
  return s;
}

// ================================================================= write
function write(name, w, h, body) {
  fs.writeFileSync(path.join(OUT, name), svg(w, h, body));
  console.log('wrote', name);
}
fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 4; i++) write(`bolt_run_${i}.svg`, 128, 128, bolt(i, 'r' + i));
write('bolt_air.svg', 128, 128, bolt('air', 'ba'));
write('bolt_bump.svg', 128, 128, bolt('bump', 'bb'));
write('bolt_happy.svg', 128, 128, bolt('happy', 'bh'));
COLS.forEach((c, i) => {
  for (const fr of [0, 1]) write(`firefly_${c}_${fr}.svg`, 64, 64, firefly(i, fr, `f${c[0]}${fr}`));
  write(`gate_${c}.svg`, 96, 300, gate(i, 'g' + c[0]));
});
write('vent_0.svg', 160, 124, vent0());
write('vent_1.svg', 100, 156, vent1());
write('sign_0.svg', 160, 132, sign0());
write('sign_1.svg', 110, 140, sign1());
write('drone.svg', 128, 96, drone());
write('finish.svg', 160, 300, finish());
write('battery.svg', 48, 48, battery(true));
write('battery_empty.svg', 48, 48, battery(false));
write('icon.svg', 256, 256, icon());
