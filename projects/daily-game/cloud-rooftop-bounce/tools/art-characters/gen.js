#!/usr/bin/env node
// Character & item art generator for Wisp's Rooftop Bounce.
// 100% original hand-written SVG (no text, fonts, images, scripts or external refs).
//
// Wisp (viewBox 0 0 240 100) IS the paddle. All six frames are built from the same
// cloud body: a top row of five r=34 puffs whose tops all touch art y = 14 (the bounce
// line), spanning art x 6…234; a bottom row of scallop puffs reaching y ≈ 92; face centre
// (120, 56). Only the lower puffs may lean ±3 px in the left/right frames, so swapping
// frames never moves the bounce line or the face.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  ink: '#2c2f5a', // character outlines + features (deep night indigo)
  // Wisp
  cloud: '#f7f5ff', cloudShade: '#d9cff6', cloudShade2: '#c2b4ee', cloudHi: '#ffffff', cloudCrease: '#b3a5e2',
  glow: '#cbbcff', blush: '#ff9cc4', mouthIn: '#7a2e5a', tongue: '#ff7fa8', eyeHi: '#ffffff',
  // pearl
  pearl: '#f4f7ff', pearlShade: '#cdd6f0', pearlLine: '#5d6aa3', pearlGlow: '#9fd2ff', pearlSheen: '#ffe8f6',
  // gems [base, shade, light, line]
  gems: [
    { base: '#2fd6c6', shade: '#16a3a0', light: '#a6fff1', line: '#0c4f5a' }, // teal
    { base: '#ff7bb8', shade: '#dc4b8e', light: '#ffd3e8', line: '#6e1a45' }, // pink
    { base: '#a77dff', shade: '#7650dc', light: '#e2d4ff', line: '#33206f' }, // violet
  ],
  // magnet
  red: '#ef3f4d', redShade: '#b82332', redHi: '#ff9aa1', redLine: '#5a1420',
  tip: '#dfe7f4', tipShade: '#a9b7cf', tipBlue: '#3f7fe6', tipLine: '#2f3d66',
  bubble: '#bfe8ff', bubbleLine: '#8fd0ff',
  // hearts
  heart: '#ff5d7d', heartShade: '#de3a62', heartLine: '#6e1838',
  // particles
  spark: '#fffbe6', sparkWarm: '#ffe59a', sparkLine: '#d9a63a',
  // icon
  night0: '#0f1438', night1: '#25307a', night2: '#3b4bb0', skyline: '#121840', win: '#ffcf7a',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +(+n).toFixed(2);
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
  (defs ? `<defs>${defs}</defs>\n` : '') + `${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
let _id = 0;
let PFX = 'a';
const nid = () => `${PFX}${++_id}`;
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const dot = (cx, cy, r, c, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${c}"${extra}/>`;
// filled shape + clipped one-step shade + highlight, outline on top
function shape(d, fill, lineC, opt = {}) {
  const sw = opt.sw ?? 3;
  let s = '';
  if (opt.shade || opt.hi || opt.inner) {
    const id = nid();
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    s += `<path d="${d}" fill="${fill}"/>`;
    s += `<g clip-path="url(#${id})">`;
    if (opt.shade) s += `<path d="${opt.shade}" fill="${opt.shadeFill}"/>`;
    if (opt.inner) s += opt.inner;
    if (opt.hi) s += `<path d="${opt.hi}" fill="${opt.hiFill ?? '#fff'}" opacity="${opt.hiOp ?? 0.6}"/>`;
    s += `</g>`;
  } else s += `<path d="${d}" fill="${fill}"/>`;
  if (sw) s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  return opt.tr ? `<g transform="${opt.tr}">${s}</g>` : s;
}
// thick round stroke with an outline (arms, magnet)
function limb(d, w, fill, lineC, sw = 3) {
  return `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${w + sw * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
// 4-point twinkle
function sparkle(cx, cy, r, fill = '#fff', stroke = null, sw = 1.5, k = 0.22) {
  const q = r * k;
  const d = `M${f(cx)} ${f(cy - r)}Q${f(cx + q)} ${f(cy - q)} ${f(cx + r)} ${f(cy)}Q${f(cx + q)} ${f(cy + q)} ${f(cx)} ${f(cy + r)}Q${f(cx - q)} ${f(cy + q)} ${f(cx - r)} ${f(cy)}Q${f(cx - q)} ${f(cy - q)} ${f(cx)} ${f(cy - r)}Z`;
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
}
// union of circles drawn as one outlined blob: outline pass (wide ink strokes) then fill pass
function blob(circles, fill, lineC, sw, opt = {}) {
  const id = nid();
  const cs = circles.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`).join('');
  let s = `<clipPath id="${id}">${cs}</clipPath>`;
  s += `<g fill="${lineC}" stroke="${lineC}" stroke-width="${sw * 2}">${cs}</g>`;
  s += `<g fill="${fill}">${cs}</g>`;
  if (opt.inner) s += `<g clip-path="url(#${id})">${opt.inner}</g>`;
  return s;
}
const heartPath = (cx, cy, s) => // heart of width ~2s, point at cy + 0.95s
  `M${f(cx)} ${f(cy + 0.95 * s)}C${f(cx - 0.35 * s)} ${f(cy + 0.62 * s)} ${f(cx - s)} ${f(cy + 0.22 * s)} ${f(cx - s)} ${f(cy - 0.32 * s)}` +
  `C${f(cx - s)} ${f(cy - 0.78 * s)} ${f(cx - 0.6 * s)} ${f(cy - 1.0 * s)} ${f(cx - 0.42 * s)} ${f(cy - 1.0 * s)}` +
  `C${f(cx - 0.2 * s)} ${f(cy - 1.0 * s)} ${f(cx - 0.04 * s)} ${f(cy - 0.84 * s)} ${f(cx)} ${f(cy - 0.6 * s)}` +
  `C${f(cx + 0.04 * s)} ${f(cy - 0.84 * s)} ${f(cx + 0.2 * s)} ${f(cy - 1.0 * s)} ${f(cx + 0.42 * s)} ${f(cy - 1.0 * s)}` +
  `C${f(cx + 0.6 * s)} ${f(cy - 1.0 * s)} ${f(cx + s)} ${f(cy - 0.78 * s)} ${f(cx + s)} ${f(cy - 0.32 * s)}` +
  `C${f(cx + s)} ${f(cy + 0.22 * s)} ${f(cx + 0.35 * s)} ${f(cy + 0.62 * s)} ${f(cx)} ${f(cy + 0.95 * s)}Z`;

// ================================================================= WISP
// Bounce line: the OUTER edge of the ink outline on the top puffs touches y = 14, and the
// outline's outer edge spans x 6…234 (so the pearl's outline visibly kisses Wisp's outline).
const BOUNCE_Y = 14;
const SW = 4.4; // body outline (≈ 3.5 px on screen at w = 3.0 u)
const TOP_R = 30;
const TOP = [0, 1, 2, 3, 4].map((i) => [6 + SW + TOP_R + i * (228 - 2 * (SW + TOP_R)) / 4, BOUNCE_Y + SW + TOP_R, TOP_R]);
const BOTTOM_Y = 92; // outer edge of the belly outline
const FACE = [120, 56];
function bottomPuffs(lean) {
  // the scalloped belly; leans ±3 px with movement (bounce line unaffected)
  return [[46, 23], [85, 21], [120, 22], [155, 21], [194, 23]].map(([x, r]) => [x + lean, BOTTOM_Y - SW - r, r]);
}
function wispBody(lean) {
  const circles = [...TOP, ...bottomPuffs(lean), [120 + lean * 0.5, 56, 0]].filter((c) => c[2] > 0);
  // core ellipse fills any gap between the rows
  const core = `<ellipse cx="${120 + lean * 0.5}" cy="62" rx="100" ry="24"/>`;
  const id = nid();
  const cs = circles.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`).join('') + core;
  let s = '';
  // soft lilac night glow so Wisp pops on deep blue skies
  s += `<g fill="${P.glow}" opacity="0.45" filter="url(#${PFX}glow)">${cs}</g>`;
  s += `<clipPath id="${id}">${cs}</clipPath>`;
  s += `<g fill="${P.ink}" stroke="${P.ink}" stroke-width="${SW * 2}" stroke-linejoin="round">${cs}</g>`;
  s += `<g fill="${P.cloud}">${cs}</g>`;
  s += `<g clip-path="url(#${id})">`;
  // one-step lilac shade on the belly + a deeper rim at the very bottom
  s += `<path d="M0 62Q60 76 120 74Q180 76 240 62L240 100L0 100Z" fill="${P.cloudShade}"/>`;
  s += `<path d="M0 84Q120 96 240 84L240 100L0 100Z" fill="${P.cloudShade2}" opacity="0.7"/>`;
  // puff creases (subtle, show the fluff)
  s += line(`M${f(22 + lean)} 70Q${f(34 + lean)} 62 ${f(48 + lean)} 64`, P.cloudCrease, 2.6, ' opacity="0.8"');
  s += line(`M${f(192 + lean)} 64Q${f(206 + lean)} 62 ${f(218 + lean)} 70`, P.cloudCrease, 2.6, ' opacity="0.8"');
  // highlights on the top puffs (one big, a few small)
  s += `<path d="${ell(46, 28, 13, 6)}" fill="${P.cloudHi}" transform="rotate(-14 46 28)"/>`;
  s += `<path d="${ell(84, 24, 8, 3.6)}" fill="${P.cloudHi}" transform="rotate(-8 84 24)"/>`;
  s += `<path d="${ell(164, 24, 7, 3.2)}" fill="${P.cloudHi}" opacity="0.9"/>`;
  s += `</g>`;
  return s;
}
function wispArm(side, raised = false, lean = 0) {
  // tiny cloud arms: a two-puff nub on each side, slightly in front of the body edge
  const x = side < 0 ? 15.5 + lean * 0.6 : 224.5 + lean * 0.6;
  if (!raised) {
    return blob([[x, 67, 8.2], [x + side * 6, 72.5, 5.2]], P.cloud, P.ink, 3.4, {
      inner: `<path d="M0 71L240 71L240 100L0 100Z" fill="${P.cloudShade}"/>` + `<path d="${ell(x - 1, 63.5, 3.2, 1.8)}" fill="#fff"/>`,
    });
  }
  return '';
}
function eyes(kind, look = 0) {
  const [cx, cy] = FACE;
  const ex = [cx - 22, cx + 22], ey = cy - 4;
  let s = '';
  if (kind === 'happy') { // ^ ^
    for (const x of ex) s += line(`M${x - 10} ${ey + 4}Q${x} ${ey - 10} ${x + 10} ${ey + 4}`, P.ink, 5.2);
    return s;
  }
  if (kind === 'round') { // surprised: white eyes, small pupils
    for (const x of ex) {
      s += `<circle cx="${x}" cy="${ey}" r="11.5" fill="#ffffff" stroke="${P.ink}" stroke-width="3.6"/>`;
      s += dot(x, ey + 1, 5.2, P.ink) + dot(x + 1.8, ey - 1.2, 1.8, P.eyeHi);
    }
    // raised brows
    s += line(`M${ex[0] - 9} ${ey - 19}Q${ex[0]} ${ey - 24} ${ex[0] + 8} ${ey - 20}`, P.ink, 3);
    s += line(`M${ex[1] - 8} ${ey - 20}Q${ex[1]} ${ey - 24} ${ex[1] + 9} ${ey - 19}`, P.ink, 3);
    return s;
  }
  // big glossy kawaii eyes
  for (const x0 of ex) {
    const x = x0 + look * 4.5;
    s += `<path d="${ell(x, ey, 9.6, 12.4)}" fill="${P.ink}"/>`;
    const hy = kind === 'determined' ? -1.5 : 0; // gaze lifted toward the magnet
    s += dot(x + 3 + look * 1.5, ey - 4.6 + hy, 4, P.eyeHi);
    s += dot(x - 3 + look * 1.5, ey + 4.8 + hy, 1.9, P.eyeHi, ' opacity="0.9"');
  }
  if (kind === 'determined') { // short, raised, slightly slanted brows: eager, not grumpy
    s += line(`M${ex[0] - 8} ${ey - 18}Q${ex[0]} ${ey - 22.5} ${ex[0] + 8} ${ey - 19.5}`, P.ink, 3.4);
    s += line(`M${ex[1] - 8} ${ey - 19.5}Q${ex[1]} ${ey - 22.5} ${ex[1] + 8} ${ey - 18}`, P.ink, 3.4);
  }
  return s;
}
function cheeks(look = 0) {
  const [cx, cy] = FACE;
  return `<path d="${ell(cx - 40 + look * 2, cy + 9, 10, 6)}" fill="${P.blush}" opacity="0.8"/>` +
    `<path d="${ell(cx + 40 + look * 2, cy + 9, 10, 6)}" fill="${P.blush}" opacity="0.8"/>`;
}
function mouth(kind, look = 0) {
  const [cx0, cy] = FACE; const cx = cx0 + look * 3;
  if (kind === 'smile') return line(`M${cx - 8} ${cy + 7}Q${cx} ${cy + 15} ${cx + 8} ${cy + 7}`, P.ink, 3.6);
  if (kind === 'open') {
    const d = `M${cx - 11} ${cy + 5}Q${cx} ${cy + 7} ${cx + 11} ${cy + 5}Q${cx + 10} ${cy + 22} ${cx} ${cy + 22}Q${cx - 10} ${cy + 22} ${cx - 11} ${cy + 5}Z`;
    return shape(d, P.mouthIn, P.ink, { sw: 3, shade: ell(cx, cy + 22, 8, 6), shadeFill: P.tongue });
  }
  if (kind === 'o') return `<path d="${ell(cx, cy + 13, 5.6, 7)}" fill="${P.mouthIn}" stroke="${P.ink}" stroke-width="3"/>`;
  if (kind === 'grin') { // big confident D-smile with teeth line
    const d = `M${cx - 10} ${cy + 6}Q${cx} ${cy + 8} ${cx + 10} ${cy + 6}Q${cx + 8} ${cy + 17} ${cx} ${cy + 17}Q${cx - 8} ${cy + 17} ${cx - 10} ${cy + 6}Z`;
    return shape(d, P.mouthIn, P.ink, { sw: 3, shade: ell(cx, cy + 18, 6.5, 4.5), shadeFill: P.tongue });
  }
  return '';
}
function trail(side) {
  // trailing mini-puffs on the far side of the motion (side = which edge they sit at)
  const x = side > 0 ? 226 : 14;
  let s = '';
  for (const [dx, y, r, o] of [[0, 84, 9, 0.95], [side * 7, 80, 5, 0.8], [side * 5, 56, 5.5, 0.7]]) {
    s += `<circle cx="${f(x + dx)}" cy="${y}" r="${r}" fill="${P.cloudShade}" stroke="${P.ink}" stroke-width="2.6" opacity="${o}"/>`;
  }
  // one airy speed tick
  s += line(`M${f(x + side * 9)} 68L${f(x + side * 13)} 68`, P.cloudCrease, 2.4);
  return s;
}
function miniMagnet(cx, cy, scale, rot) {
  // tiny red horseshoe with silver/blue tips (opening up), held over the head
  const d = 'M-8 -6L-8 2A8 8 0 0 0 8 2L8 -6';
  let s = `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${scale})">`;
  s += limb(d, 6.4, P.red, P.ink, 2.6);
  s += line('M-6.6 3.8A6 6 0 0 0 4 7.6', P.redHi, 1.6, ' opacity="0.9"');
  for (const x of [-8, 8]) {
    s += `<rect x="${x - 5.8}" y="-13.4" width="11.6" height="7.6" rx="1.6" fill="${P.tip}" stroke="${P.ink}" stroke-width="2.6"/>`;
    s += `<rect x="${x - 4.5}" y="-8.6" width="9" height="2.6" fill="${P.tipBlue}"/>`;
  }
  s += `</g>`;
  return s;
}
function wisp(frame) {
  PFX = 'w' + frame[0] + frame[1]; _id = 0;
  const lean = frame === 'left' ? -3 : frame === 'right' ? 3 : 0;
  const look = frame === 'left' ? -1 : frame === 'right' ? 1 : 0;
  const defs = `<filter id="${PFX}glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>`;
  let s = '';
  if (frame === 'left') s += trail(1);
  if (frame === 'right') s += trail(-1);
  s += wispBody(lean);
  s += wispArm(-1, false, lean);
  if (frame === 'magnet') {
    // right arm raised in front of the body, holding the magnet up
    // right arm: from the side nub, raised up and in front, holding the magnet high
    s += limb('M224 68Q224 56 213 47', 9, P.cloud, P.ink, 3.2);
    s += miniMagnet(205, 37, 1.0, -10);
    s += blob([[210.5, 46.5, 7]], P.cloud, P.ink, 3.2);
    // little "zap" ticks
    s += line('M186 26L190 29M220 22L217 27', '#6fb8ff', 2.6);
  } else s += wispArm(1, false, lean);
  // face
  if (frame === 'cheer') s += eyes('happy') + cheeks() + mouth('open');
  else if (frame === 'oops') s += eyes('round') + cheeks() + mouth('o') +
    `<path d="M168 34Q172 42 168 46Q164 42 168 34Z" fill="#a6dcff" stroke="#3d6aa8" stroke-width="2"/>`;
  else if (frame === 'magnet') s += eyes('determined') + cheeks() + mouth('grin');
  else s += eyes('normal', look) + cheeks(look) + mouth('smile', look);
  if (frame === 'cheer') s += sparkle(30, 12, 8, P.spark, P.sparkLine, 1.6) + sparkle(212, 10, 6, P.spark, P.sparkLine, 1.4);
  return svg(240, 100, s, defs);
}

// ================================================================= BALL (moon-pearl)
function ball() {
  PFX = 'b'; _id = 0;
  const defs =
    `<radialGradient id="bglow" cx="32" cy="32" r="31.5" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0.66" stop-color="${P.pearlGlow}" stop-opacity="0.85"/><stop offset="0.82" stop-color="${P.pearlGlow}" stop-opacity="0.35"/>` +
    `<stop offset="1" stop-color="${P.pearlGlow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="bcore" cx="26" cy="24" r="30" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="${P.pearl}"/><stop offset="1" stop-color="#dfe6fa"/></radialGradient>`;
  let s = `<circle cx="32" cy="32" r="31.5" fill="url(#bglow)"/>`;
  const d = circ(32, 32, 21.5);
  s += shape(d, 'url(#bcore)', P.pearlLine, {
    sw: 3.4,
    shade: 'M8 40Q30 52 56 30L64 64L0 64Z', shadeFill: P.pearlShade,
    inner: `<path d="${ell(40, 40, 9, 5)}" fill="${P.pearlSheen}" opacity="0.6" transform="rotate(-35 40 40)"/>`,
  });
  // tiny crescent highlight (top-left)
  s += `<path d="M18.5 30Q19 19 30 16.5Q23 21 22 31Z" fill="#ffffff"/>`;
  s += dot(36, 18.6, 1.8, '#ffffff');
  return svg(64, 64, s, defs);
}

// ================================================================= GEMS
// Brilliant-cut side view: table 22…42 at y 13, girdle 9…55 at y 25, point (32, 54). Centre ≈ (32, 33).
function gemArt(c, withFace = true, k = 1, ox = 0, oy = 0, sw = 3.6) {
  const X = (x) => f(ox + (x - 32) * k + 32), Y = (y) => f(oy + (y - 33) * k + 33);
  const pt = (x, y) => `${X(x)} ${Y(y)}`;
  const outline = `M${pt(21, 13)}L${pt(43, 13)}L${pt(55, 25)}L${pt(32, 54)}L${pt(9, 25)}Z`;
  let s = `<path d="${outline}" fill="${c.base}"/>`;
  // facets
  s += `<path d="M${pt(21, 13)}L${pt(43, 13)}L${pt(38, 25)}L${pt(26, 25)}Z" fill="${c.light}"/>`; // table
  s += `<path d="M${pt(9, 25)}L${pt(21, 13)}L${pt(26, 25)}Z" fill="${c.light}" opacity="0.6"/>`; // crown left
  s += `<path d="M${pt(43, 13)}L${pt(55, 25)}L${pt(38, 25)}Z" fill="${c.shade}" opacity="0.55"/>`; // crown right
  s += `<path d="M${pt(38, 25)}L${pt(55, 25)}L${pt(32, 54)}Z" fill="${c.shade}"/>`; // pavilion right
  s += `<path d="M${pt(9, 25)}L${pt(26, 25)}L${pt(32, 54)}Z" fill="${c.light}" opacity="0.35"/>`; // pavilion left
  const fl = Math.max(1.4, sw * 0.42);
  s += `<path d="M${pt(9, 25)}L${pt(55, 25)}M${pt(26, 25)}L${pt(32, 54)}L${pt(38, 25)}M${pt(21, 13)}L${pt(26, 25)}M${pt(43, 13)}L${pt(38, 25)}" fill="none" stroke="${c.line}" stroke-width="${fl}" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>`;
  s += `<path d="${outline}" fill="none" stroke="${c.line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  // shine
  s += `<path d="M${pt(24, 15.5)}L${pt(31, 15.5)}L${pt(28.5, 21)}L${pt(25.5, 21)}Z" fill="#ffffff" opacity="0.9"/>`;
  if (withFace) {
    s += dot(+X(26.5), +Y(33), 2.7 * k, c.line) + dot(+X(37.5), +Y(33), 2.7 * k, c.line);
    s += dot(+X(27.3), +Y(32), 0.9 * k, '#ffffff') + dot(+X(38.3), +Y(32), 0.9 * k, '#ffffff');
    s += line(`M${pt(29.5, 38)}Q${pt(32, 40.5)} ${pt(34.5, 38)}`, c.line, 1.8 * k);
  }
  return s;
}
function gem(i) {
  PFX = 'g' + i; _id = 0;
  let s = gemArt(P.gems[i]);
  s += sparkle(52, 10, 6.5, '#ffffff', P.gems[i].line, 1.2);
  return svg(64, 64, s);
}
function gemHud() {
  PFX = 'gh'; _id = 0;
  // same cut, 48 viewBox, no face (reads better tiny)
  const s = `<g transform="scale(0.75)">${gemArt(P.gems[0], false, 1.12, 0, -1, 4.6)}</g>`;
  return svg(48, 48, s);
}

// ================================================================= MAGNET POWER-UP
function magnet() {
  PFX = 'm'; _id = 0;
  const defs = `<radialGradient id="mbub" cx="26" cy="22" r="34" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="0.7" stop-color="${P.bubble}" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="${P.bubble}" stop-opacity="0.6"/></radialGradient>`;
  let s = `<circle cx="32" cy="32" r="29" fill="url(#mbub)"/>`;
  // horseshoe (opening up, tilted)
  s += `<g transform="rotate(-18 32 34)">`;
  const d = 'M21 22L21 34A11 11 0 0 0 43 34L43 22';
  s += limb(d, 9.5, P.red, P.redLine, 3);
  s += line('M41.5 35A9.5 9.5 0 0 1 34 43.5', P.redShade, 3.6, ' opacity="0.9"');
  s += line('M22.5 27L22.5 34A9.5 9.5 0 0 0 26.5 41', P.redHi, 2.4);
  for (const x of [21, 43]) {
    s += `<rect x="${x - 7.8}" y="11.5" width="15.6" height="10" rx="2" fill="${P.tip}" stroke="${P.tipLine}" stroke-width="3"/>`;
    s += `<rect x="${x - 6.3}" y="17.4" width="12.6" height="3.1" fill="${P.tipBlue}"/>`;
    s += `<rect x="${x - 5.3}" y="13.2" width="3" height="3.2" rx="1" fill="#ffffff" opacity="0.9"/>`;
  }
  s += `</g>`;
  // little attraction sparks
  s += line('M13 12L16 16M50 6L48 11M55 15L51 17', '#ffe27a', 2.4);
  // bubble rim + glints
  s += `<circle cx="32" cy="32" r="29" fill="none" stroke="${P.bubbleLine}" stroke-width="2.6" opacity="0.95"/>`;
  s += line('M12 22Q16 11 27 7.5', '#ffffff', 3.2, ' opacity="0.9"');
  s += dot(49, 48, 2.6, '#ffffff', ' opacity="0.8"');
  return svg(64, 64, s, defs);
}

// ================================================================= HEARTS
function heart(full) {
  PFX = full ? 'h' : 'e'; _id = 0;
  const d = heartPath(24, 25, 19);
  if (full) {
    return svg(48, 48, shape(d, P.heart, P.heartLine, {
      sw: 3.2,
      shade: 'M48 14Q40 38 14 48L48 48Z', shadeFill: P.heartShade,
      hi: ell(15, 15, 4.6, 3), hiOp: 0.85,
    }));
  }
  let s = `<path d="${d}" fill="${P.ink}" fill-opacity="0.35"/>`;
  s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" opacity="0.45"/>`;
  s += `<path d="${d}" fill="none" stroke="${P.heartLine}" stroke-width="3.2" stroke-linejoin="round"/>`;
  s += `<path d="${heartPath(24, 25.6, 13.4)}" fill="none" stroke="${P.heart}" stroke-width="1.8" stroke-linejoin="round" opacity="0.6"/>`;
  return svg(48, 48, s);
}

// ================================================================= PARTICLES
function sparkleP() {
  PFX = 's'; _id = 0;
  let s = `<circle cx="16" cy="16" r="9" fill="${P.sparkWarm}" opacity="0.28"/>`;
  s += sparkle(16, 16, 15, P.sparkWarm, null, 0, 0.2);
  s += sparkle(16, 16, 10.5, P.spark, null, 0, 0.2);
  s += dot(16, 16, 2.6, '#ffffff');
  return svg(32, 32, s);
}
function puff() {
  PFX = 'p'; _id = 0;
  const s = blob([[11, 19, 7.5], [17.5, 13, 8.5], [23, 19, 7]], P.cloud, '#9a90cc', 2.2, {
    inner: `<path d="M0 20Q16 25 32 20L32 32L0 32Z" fill="${P.cloudShade}"/>` + `<path d="${ell(15, 10, 3.6, 2)}" fill="#fff"/>`,
  });
  return svg(32, 32, s);
}

// ================================================================= ICON
// viewBox 0 0 256 256: opaque full-bleed night square, round badge, Wisp's face, the pearl, two gems, skyline.
function icon() {
  PFX = 'i'; _id = 0;
  const defs =
    `<linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.night0}"/><stop offset="1" stop-color="#1a2160"/></linearGradient>` +
    `<radialGradient id="isky" cx="128" cy="96" r="150" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${P.night2}"/><stop offset="0.6" stop-color="${P.night1}"/><stop offset="1" stop-color="#161c50"/></radialGradient>` +
    `<radialGradient id="ipg" cx="128" cy="50" r="40" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0.5" stop-color="${P.pearlGlow}" stop-opacity="0.85"/><stop offset="1" stop-color="${P.pearlGlow}" stop-opacity="0"/></radialGradient>` +
    `<filter id="iwglow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>`;
  let s = `<rect width="256" height="256" fill="url(#ibg)"/>`;
  s += `<circle cx="128" cy="128" r="122" fill="url(#isky)"/>`;
  const clip = nid();
  s += `<clipPath id="${clip}"><circle cx="128" cy="128" r="121"/></clipPath><g clip-path="url(#${clip})">`;
  for (const [x, y, r] of [[40, 70, 2.4], [70, 34, 1.8], [190, 30, 2], [222, 96, 2.2], [30, 120, 1.6], [214, 60, 1.6], [96, 22, 1.4]])
    s += dot(x, y, r, '#fff8e0', ' opacity="0.9"');
  // skyline
  s += `<path d="M0 206L18 206L18 186L40 186L40 196L56 196L56 172L64 166L72 172L72 200L90 200L90 188L108 188L108 210L148 210L148 184L166 184L166 196L184 196L184 168L204 168L204 192L222 192L222 180L240 180L240 200L256 200L256 256L0 256Z" fill="${P.skyline}"/>`;
  for (const [x, y] of [[24, 192], [60, 178], [62, 188], [96, 194], [154, 190], [190, 174], [190, 184], [228, 186], [44, 200], [208, 198]])
    s += `<rect x="${x}" y="${y}" width="4.5" height="5" rx="1" fill="${P.win}" opacity="0.9"/>`;
  s += `</g>`;
  s += `<circle cx="128" cy="128" r="122" fill="none" stroke="#8fa2ff" stroke-width="4" opacity="0.75"/>`;
  // pearl
  s += `<circle cx="128" cy="52" r="38" fill="url(#ipg)"/>`;
  s += `<circle cx="128" cy="52" r="22" fill="${P.pearl}" stroke="${P.pearlLine}" stroke-width="3.6"/>`;
  s += `<path d="M116 52Q116 40 127 36Q120 42 120 53Z" fill="#ffffff"/>`;
  // gems
  s += `<g transform="translate(52 82) rotate(-14) scale(0.72) translate(-32 -33)">${gemArt(P.gems[1], false, 1, 0, 0, 4.6)}</g>`;
  s += `<g transform="translate(204 82) rotate(14) scale(0.72) translate(-32 -33)">${gemArt(P.gems[0], false, 1, 0, 0, 4.6)}</g>`;
  // Wisp (idle body + face), big and centred
  PFX = 'iw'; _id = 0;
  // the face is drawn 1.35x bigger than in game so it still reads at 32 px
  const face = `<g transform="translate(120 58) scale(1.35) translate(-120 -58)">${eyes('normal') + cheeks() + mouth('smile')}</g>`;
  const body = wispBody(0) + wispArm(-1) + wispArm(1) + face;
  s += `<g transform="translate(128 150) scale(0.96) translate(-120 -56)">${body}</g>`;
  return svg(256, 256, s, defs);
}

// ================================================================= WRITE
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (/<text|<image|<script|href=|@import|font-family/i.test(content)) throw new Error('forbidden element in ' + rel);
  fs.writeFileSync(p, content);
  console.log('wrote', path.relative(process.cwd(), p), content.length + ' B');
}
for (const fr of ['idle', 'left', 'right', 'cheer', 'oops', 'magnet']) write(`wisp_${fr}.svg`, wisp(fr));
write('ball.svg', ball());
for (const i of [0, 1, 2]) write(`gem_${i}.svg`, gem(i));
write('magnet.svg', magnet());
write('heart.svg', heart(true));
write('heart_empty.svg', heart(false));
write('gem_hud.svg', gemHud());
write('icon.svg', icon());
write('particles/sparkle.svg', sparkleP());
write('particles/puff.svg', puff());
