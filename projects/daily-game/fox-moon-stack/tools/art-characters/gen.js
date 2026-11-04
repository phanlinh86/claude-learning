#!/usr/bin/env node
// Character & item art generator for Juno's Moon Stack.
// 100% original hand-written SVG (no text, fonts, scripts, images or external refs).
// Juno's four frames are built from the SAME saucer parts, so the hull geometry is
// identical across frames: only the face, ears, paws, lever and emitter glow change.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Juno (fox)
  fox: '#ff8a3d', foxShade: '#e86a24', foxLine: '#a3461c',
  cream: '#fff1d6', creamShade: '#f2d9ae', creamLine: '#b98a5c',
  earTip: '#5a3020', earIn: '#ffc9a8', paw: '#c8602a', pawLine: '#7a3416',
  eye: '#2b1a3a', eyeLow: '#5d4a9c', cheek: '#ff8fa8', nose: '#4a2618', mouth: '#7a2a24', tongue: '#ff7f96',
  sweat: '#9fe3ff', sweatLine: '#3f8fbf',
  // saucer
  hull: '#eae6ff', hullShade: '#b9b1e8', hullLine: '#5b5196', collar: '#cfc8f2', under: '#9d94d6',
  glass: '#cfeeff', glassLine: '#8db6e6',
  lTeal: '#3fe0d0', lYellow: '#ffd23f', lPink: '#ff7ab8', lightLine: '#4a4185',
  emit: '#46e8d8', emitCore: '#d4fff9', emitLine: '#1f8a86', nozzle: '#8f86c8',
  lever: '#8f86c8', knob: '#ff5c8a', knobLine: '#a3224f',
  // crates: [fill, shade, line]
  crates: [
    ['#ff6b6b', '#e2474d', '#9e2a32'],
    ['#ffc93c', '#eea514', '#8f5c00'],
    ['#4fb8ff', '#2b90e2', '#1a5a96'],
    ['#3fd6a0', '#1fb37f', '#11704c'],
  ],
  band: '#e6e2f6', bandShade: '#bdb6dc', rivet: '#8c86b0', sticker: '#ffffff',
  // coin
  gold: '#ffd23f', goldRim: '#e0a400', goldLine: '#9a6400', goldEdge: '#c48a00', goldHi: '#fff2a8',
  // base
  pad: '#c9c2f0', padShade: '#a49bd8', padLine: '#4f4690', padStripe: '#3fd6c8',
  // flag & rocket
  pole: '#e6e2f6', poleLine: '#5b5196', beacon: '#ffe15a', beaconLine: '#a87a00', pennant: '#3fd6c8', pennantShade: '#22b2a6', pennantLine: '#0f6e68',
  rkt: '#fff6e6', rktShade: '#e8d8bf', rktLine: '#8a6a5a', rktRed: '#ff6b6b', rktRedShade: '#e2474d', rktRedLine: '#9e2a32',
  win: '#7fd6ff', winShade: '#4aa8e6', winLine: '#2a5a96',
  // hearts
  heart: '#ff5c8a', heartShade: '#e23d6e', heartLine: '#a3224f', heartEmpty: '#b9b1e8',
  // icon
  night: '#2a1b5e', night2: '#160f3c', badgeLine: '#8f7fe0',
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
let _id = 0;
let PFX = 'a';
const uid = () => `${PFX}${++_id}`;

// Filled shape with a one-step cel shade (shape minus a copy shifted up-left, so the
// shade sits lower-right), optional inner art + highlight, then the outline on top.
function shape(d, fill, shade, lineC, opt = {}) {
  const sw = opt.sw ?? 3;
  const [ox, oy] = opt.off ?? [-4, -4];
  const id = uid();
  let s = `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">`;
  s += `<path d="${d}" fill="${shade || fill}"/>`;
  if (shade) s += `<path d="${d}" fill="${fill}" transform="translate(${ox} ${oy})"/>`;
  if (opt.inner) s += opt.inner;
  if (opt.hi) {
    const [hx, hy, hrx, hry, r = 0] = opt.hi;
    s += `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" transform="rotate(${r} ${hx} ${hy})" fill="#fff" opacity="${opt.hiOp ?? 0.6}"/>`;
  }
  s += `</g>`;
  if (sw) s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  return s;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
function glow(cx, cy, r, col, a0 = 0.6, a1 = 0.26) {
  const id = uid();
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${col}" stop-opacity="${a0}"/><stop offset="0.55" stop-color="${col}" stop-opacity="${a1}"/>` +
    `<stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
}
function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
// rounded polygon (corners softened with quadratic curves)
function softPoly(pts, k = 0.2) {
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const a = mid(p, prev, k), b = mid(p, next, k);
    d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(b[0]) + ' ' + f(b[1]);
  }
  return d + 'Z';
}
const star = (cx, cy, ro, ri, k = 0.22) => softPoly(starPts(cx, cy, ro, ri), k);
const heartPath = (cx, cy, s) => {
  // heart of width ~2s, centred at (cx, cy)
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 0.95)}C${p(-0.35, 0.68)} ${p(-1, 0.25)} ${p(-1, -0.28)}C${p(-1, -0.72)} ${p(-0.62, -0.95)} ${p(-0.3, -0.95)}` +
    `C${p(-0.12, -0.95)} ${p(0, -0.84)} ${p(0, -0.62)}C${p(0, -0.84)} ${p(0.12, -0.95)} ${p(0.3, -0.95)}` +
    `C${p(0.62, -0.95)} ${p(1, -0.72)} ${p(1, -0.28)}C${p(1, 0.25)} ${p(0.35, 0.68)} ${p(0, 0.95)}Z`;
};

// ================================================================= JUNO
// viewBox 0 0 160 160. Body centre (80,78). Beam emitter (80,140).
const DOME = { cx: 80, cy: 70, r: 54, base: 100 };
const domeHalf = Math.sqrt(DOME.r ** 2 - (DOME.base - DOME.cy) ** 2);
const DOME_D = `M${f(DOME.cx - domeHalf)} ${DOME.base}A${DOME.r} ${DOME.r} 0 1 1 ${f(DOME.cx + domeHalf)} ${DOME.base}Z`;
const HULL_D = 'M4 111C4 100 36 96 80 96C124 96 156 100 156 111C156 122 122 130 80 130C38 130 4 122 4 111Z';
const HEAD_D = 'M80 35C99 35 109 46 109 58C109 64 108 68 106 71L115 77L102 80C96 85 89 88 80 88C71 88 64 85 58 80L45 77L54 71C52 68 51 64 51 58C51 46 61 35 80 35Z';
const MASK_D = 'M40 66C56 61 70 63 80 70C90 63 104 61 120 66L120 100L40 100Z';
const EAR_L = 'M51 55Q49 33 54 21Q57 18 61 21Q70 29 76 40Z';
const TAIL_D = 'M108 102C126 110 152 106 157 86C161 71 151 57 136 58C142 66 142 76 134 82C126 88 117 90 108 91Z';

function ear(side, mode) {
  // mode: 'up' | 'perk' | 'down'
  const pivot = [63, 44];
  let tf = '';
  if (mode === 'perk') tf = `rotate(6 ${pivot[0]} ${pivot[1]}) translate(0 -2)`;
  if (mode === 'down') tf = `rotate(-34 ${pivot[0]} ${pivot[1]}) translate(2 4)`;
  const id = uid();
  let s = `<g transform="${tf}">`;
  s += `<clipPath id="${id}"><path d="${EAR_L}"/></clipPath><g clip-path="url(#${id})">`;
  s += `<path d="${EAR_L}" fill="${P.foxShade}"/><path d="${EAR_L}" fill="${P.fox}" transform="translate(-3 1)"/>`;
  s += `<path d="M56 50Q55 35 58 28Q66 34 70 42Z" fill="${P.earIn}"/>`;
  s += `<path d="M40 10L80 10L80 36Q66 26 46 32Z" fill="${P.earTip}"/>`;
  s += `</g><path d="${EAR_L}" fill="none" stroke="${P.foxLine}" stroke-width="3" stroke-linejoin="round"/></g>`;
  return side === 'L' ? s : `<g transform="translate(160 0) scale(-1 1)">${s}</g>`;
}

function face(frame) {
  let s = '';
  const eyeOpen = (x, y, dy = 0) =>
    `<ellipse cx="${x}" cy="${y}" rx="6.4" ry="8" fill="${P.eye}"/>` +
    `<ellipse cx="${x}" cy="${y + 4 + dy}" rx="4" ry="2.6" fill="${P.eyeLow}" opacity="0.8"/>` +
    `<circle cx="${x - 2}" cy="${y - 3 + dy}" r="2.6" fill="#fff"/><circle cx="${x + 2.4}" cy="${y + 2 + dy}" r="1.1" fill="#fff"/>`;
  if (frame === 'idle') {
    s += eyeOpen(68, 59) + eyeOpen(92, 59);
    s += line('M73 76Q76.5 79.5 80 76.5Q83.5 79.5 87 76', P.mouth, 2.4);
  } else if (frame === 'drop') {
    s += eyeOpen(68, 60, 1.5) + eyeOpen(92, 60, 1.5);
    s += `<ellipse cx="80" cy="79" rx="3.6" ry="4.2" fill="${P.mouth}"/><ellipse cx="80" cy="80.5" rx="2.2" ry="1.8" fill="${P.tongue}"/>`;
  } else if (frame === 'happy') {
    s += line('M61.5 61Q68 52 74.5 61', P.eye, 3.4) + line('M85.5 61Q92 52 98.5 61', P.eye, 3.4);
    s += `<path d="M71 75Q80 74 89 75Q88 85 80 85Q72 85 71 75Z" fill="${P.mouth}" stroke="${P.mouth}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="M75 81.5Q80 78.5 85 81.5Q83 84.5 80 84.5Q77 84.5 75 81.5Z" fill="${P.tongue}"/>`;
  } else if (frame === 'oops') {
    s += line('M62 55L73 59.5L62 64', P.eye, 3.4) + line('M98 55L87 59.5L98 64', P.eye, 3.4);
    s += line('M71 79Q73.5 76 76 79Q78.5 82 81 79Q83.5 76 86 79Q87.5 80.5 89 79', P.mouth, 2.4);
  }
  // nose (on top of the mouth start)
  s += `<path d="M75.5 69.5Q80 67 84.5 69.5Q83 74 80 74Q77 74 75.5 69.5Z" fill="${P.nose}"/><ellipse cx="78.6" cy="69.6" rx="1.6" ry="0.9" fill="#fff" opacity="0.7"/>`;
  // rosy cheeks (bigger when happy)
  const cr = frame === 'happy' ? 1.25 : 1;
  s += `<ellipse cx="60" cy="72" rx="${f(5.5 * cr)}" ry="${f(3.4 * cr)}" fill="${P.cheek}" opacity="0.75"/>`;
  s += `<ellipse cx="100" cy="72" rx="${f(5.5 * cr)}" ry="${f(3.4 * cr)}" fill="${P.cheek}" opacity="0.75"/>`;
  if (frame === 'oops') {
    // sweat drop beside the head
    s += shape('M113 46Q119 55 119 59Q119 64 113.5 64Q108 64 108 59Q108 55 113 46Z', P.sweat, '#6cc7ee', P.sweatLine, { sw: 2, off: [-1.5, -1.5], hi: [111.5, 58, 1.6, 2.6, 0], hiOp: 0.9 });
  }
  return s;
}

function juno(frame, prefix) {
  PFX = prefix; _id = 0;
  let s = '';
  // underside bowl + nozzle (behind the hull)
  s += shape('M46 122C54 136 106 136 114 122Z', P.under, null, P.hullLine);
  s += shape(rrect(71, 128, 18, 10, 4), P.nozzle, null, P.hullLine, { sw: 2.5 });
  // dome back glass
  s += `<path d="${DOME_D}" fill="${P.glass}" opacity="0.22"/>`;
  // torso + chest
  s += shape('M57 106C57 90 66 81 80 81C94 81 103 90 103 106Z', P.fox, P.foxShade, P.foxLine, { off: [-3, -3] });
  s += `<ellipse cx="80" cy="95" rx="12" ry="11" fill="${P.cream}"/>`;
  // ears behind the head
  const em = frame === 'happy' ? 'perk' : frame === 'oops' ? 'down' : 'up';
  s += ear('L', em) + ear('R', em);
  // head with cream mask
  s += shape(HEAD_D, P.fox, P.foxShade, P.foxLine, {
    off: [-3, -4],
    inner: `<path d="${MASK_D}" fill="${P.creamShade}"/><path d="${MASK_D}" fill="${P.cream}" transform="translate(-2 -2)"/>` +
      `<ellipse cx="70" cy="44" rx="10" ry="4" transform="rotate(-18 70 44)" fill="#fff" opacity="0.35"/>`,
  });
  s += face(frame);
  // dome front glass: outline + highlights
  s += `<path d="${DOME_D}" fill="none" stroke="${P.glassLine}" stroke-width="3" stroke-linejoin="round" opacity="0.95"/>`;
  s += line('M37 66A44 44 0 0 1 62 25', '#fff', 5, ' opacity="0.75"');
  s += `<circle cx="70" cy="21.5" r="2.6" fill="#fff" opacity="0.8"/>`;
  s += line('M124 78A46 46 0 0 1 120 92', '#fff', 3, ' opacity="0.45"');
  // hull (identical in every frame)
  s += shape(HULL_D, P.hull, P.hullShade, P.hullLine, { off: [0, -8], hi: [40, 104, 20, 3.2, -4], hiOp: 0.8 });
  // dome collar ring
  s += shape(ell(80, 99, 47, 6), P.collar, P.hullShade, P.hullLine, { sw: 2.5, off: [0, -2] });
  // rim lights along the equator
  const cols = [P.lTeal, P.lYellow, P.lPink];
  [17, 37, 58.5, 80, 101.5, 123, 143].forEach((x, i) => {
    const y = 112 + 5 * (1 - ((x - 80) / 78) ** 2);
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="4.6" fill="${cols[i % 3]}" stroke="${P.lightLine}" stroke-width="2"/>`;
    s += `<circle cx="${f(x - 1.4)}" cy="${f(y - 1.5)}" r="1.4" fill="#fff" opacity="0.9"/>`;
  });
  // lever on the collar (left, clear of the tail) + paws
  const pawAt = (x, y, r = 0) => shape(ell(x, y, 6.8, 4.8), P.paw, null, P.pawLine, { sw: 2.5, hi: [x - 2, y - 2, 2.6, 1.3, r], hiOp: 0.35 });
  if (frame === 'drop') {
    s += line('M48 99L56 88', P.hullLine, 6) + line('M48 99L56 88', P.lever, 3);
    s += `<circle cx="56.5" cy="87" r="4.2" fill="${P.knob}" stroke="${P.knobLine}" stroke-width="2"/>`;
    s += pawAt(58, 89) + pawAt(93, 97);
  } else {
    s += line('M48 99L44 86', P.hullLine, 6) + line('M48 99L44 86', P.lever, 3);
    s += `<circle cx="43.7" cy="85" r="4.2" fill="${P.knob}" stroke="${P.knobLine}" stroke-width="2"/>`;
    if (frame === 'happy') s += pawAt(64, 95, -20) + pawAt(96, 95, 20);
    else if (frame === 'oops') s += pawAt(70, 98) + pawAt(90, 98);
    else s += pawAt(67, 97) + pawAt(93, 97);
  }
  // bushy tail curling over the rim on the right, white tip
  s += shape(TAIL_D, P.fox, P.foxShade, P.foxLine, {
    off: [-3, -3],
    inner: `<path d="M128 50L164 50L164 78Q152 80 144 76Q138 70 134 62Z" fill="${P.creamShade}"/><path d="M126 48L164 48L164 74Q152 77 144 73Q138 68 133 60Z" fill="${P.cream}"/>`,
  });
  // beam emitter glow
  if (frame === 'drop') s += glow(80, 140, 19, P.emit, 0.95, 0.45);
  else s += glow(80, 140, 12, P.emit, 0.7, 0.3);
  s += `<circle cx="80" cy="140" r="${frame === 'drop' ? 5.6 : 4.6}" fill="${P.emitCore}" stroke="${P.emitLine}" stroke-width="2"/>`;
  return s;
}

// ================================================================= BEAM
function beam() {
  PFX = 'bm'; _id = 0;
  const g = uid(), h = uid();
  let s = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ff7ee" stop-opacity="0.45"/><stop offset="1" stop-color="#46d8e8" stop-opacity="0.16"/></linearGradient>`;
  s += `<linearGradient id="${h}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bffcff" stop-opacity="0"/><stop offset="0.5" stop-color="#bffcff" stop-opacity="0.3"/><stop offset="1" stop-color="#bffcff" stop-opacity="0"/></linearGradient>`;
  s += `<path d="M30 0H50L80 120H0Z" fill="url(#${g})"/>`;
  s += `<path d="M36 0H44L58 120H22Z" fill="url(#${h})"/>`;
  for (const y of [28, 64, 100]) {
    const hw = 10 + (30 * y) / 120;
    s += `<ellipse cx="40" cy="${y}" rx="${f(hw - 2)}" ry="${f(2 + y / 60)}" fill="none" stroke="#dffeff" stroke-width="2" opacity="0.4"/>`;
  }
  return s;
}

// ================================================================= CRATES (0 0 120 80)
function sticker(i, ln) {
  const w = P.sticker;
  if (i === 0) return shape(star(60, 41, 17, 7.6, 0.18), w, '#ffe3e0', ln, { sw: 2.5, off: [-1.5, -1.5] });
  if (i === 1) {
    const d = 'M66 24A17 17 0 1 0 72 54A14 14 0 1 1 66 24Z';
    return shape(d, w, '#fff0c4', ln, { sw: 2.5, off: [-1.5, -1.5] }) +
      `<circle cx="74" cy="31" r="2.2" fill="${w}" stroke="${ln}" stroke-width="1.5"/>`;
  }
  if (i === 2) {
    const ringD = 'M36 41A24 7 0 1 0 84 41A24 7 0 1 0 36 41Z', front = 'M36 41A24 7 0 0 0 84 41';
    let s = line(ringD, ln, 7) + line(ringD, w, 3.2);
    s += shape(circ(60, 41, 12.5), w, '#dcefff', ln, { sw: 2.5, off: [-1.5, -1.5], inner: `<path d="M44 37Q60 33 76 37" stroke="#cfe6ff" stroke-width="3" fill="none"/>` });
    s += line(front, ln, 7) + line(front, w, 3.2);
    return `<g transform="rotate(-16 60 41)">${s}</g>`;
  }
  // rocket
  let s = shape('M52 50L46 57L52 56Z', w, null, ln, { sw: 2.2 }) + shape('M68 50L74 57L68 56Z', w, null, ln, { sw: 2.2 });
  s += shape('M60 22C67 28 69 38 68 54H52C51 38 53 28 60 22Z', w, '#d9f7ea', ln, { sw: 2.5, off: [-1.5, -1.5] });
  s += `<circle cx="60" cy="38" r="4" fill="${P.crates[3][0]}" stroke="${ln}" stroke-width="2"/>`;
  return `<g transform="rotate(14 60 40)">${s}</g>`;
}
function crate(i) {
  PFX = 'c' + i; _id = 0;
  const [fill, shade, ln] = P.crates[i];
  const O = rrect(1.5, 1.5, 117, 77, 7.5);
  const id = uid();
  let s = `<clipPath id="${id}"><path d="${O}"/></clipPath><g clip-path="url(#${id})">`;
  // body with one-step shade (bottom + right)
  s += `<rect x="0" y="0" width="120" height="80" fill="${shade}"/>`;
  s += `<rect x="0" y="0" width="112" height="56" fill="${fill}"/>`;
  // side panel grooves
  s += line('M22 17V63', ln, 2.4, ' opacity="0.35"') + line('M98 17V63', ln, 2.4, ' opacity="0.35"');
  // metal bands
  s += `<rect x="0" y="0" width="120" height="16" fill="${P.bandShade}"/><rect x="0" y="0" width="120" height="12.5" fill="${P.band}"/>`;
  s += `<rect x="8" y="3.6" width="64" height="3.2" rx="1.6" fill="#fff" opacity="0.9"/><rect x="78" y="3.6" width="10" height="3.2" rx="1.6" fill="#fff" opacity="0.9"/>`;
  s += `<rect x="0" y="64" width="120" height="16" fill="${P.bandShade}"/><rect x="0" y="64" width="120" height="10" fill="${P.band}"/>`;
  s += `<path d="M0 16H120M0 64H120" stroke="${ln}" stroke-width="2.5"/>`;
  s += `</g>`;
  // rivets
  for (const [x, y] of [[10, 8.5], [110, 8.5], [10, 71.5], [110, 71.5]]) {
    s += `<circle cx="${x}" cy="${y}" r="3.1" fill="${P.rivet}" stroke="${ln}" stroke-width="1.4"/><circle cx="${x - 0.9}" cy="${y - 0.9}" r="1" fill="#fff" opacity="0.85"/>`;
  }
  s += sticker(i, ln);
  s += `<path d="${O}" fill="none" stroke="${ln}" stroke-width="3" stroke-linejoin="round"/>`;
  return s;
}

// ================================================================= COINS (0 0 64 64, centre 32,32)
function coin(k, prefix) {
  PFX = prefix; _id = 0;
  const R = 27, rx = R * k;
  const th = 5.5 * Math.sqrt(1 - k * k) + 0.6; // visible edge thickness
  let s = '';
  // edge (the coin's thickness, seen as a band on the right)
  if (k < 0.99) {
    const d = `M32 ${32 - R}H${f(32 + th)}A${f(rx)} ${R} 0 0 1 ${f(32 + th)} ${32 + R}H32Z`;
    s += `<path d="${d}" fill="${P.goldEdge}" stroke="${P.goldLine}" stroke-width="3" stroke-linejoin="round"/>`;
    for (let j = -3; j <= 3; j++) {
      const y = 32 + j * R * 0.26;
      const xx = 32 + th + rx * Math.sqrt(Math.max(0, 1 - ((y - 32) / R) ** 2));
      s += line(`M${f(xx - th * 0.75)} ${f(y)}H${f(xx - 1)}`, P.goldLine, 1.2, ' opacity="0.5"');
    }
  }
  // face: rim + inner disc + embossed star, all squashed by k around x=32
  const face = ell(32, 32, rx, R);
  const g = uid();
  s += `<clipPath id="${g}"><path d="${face}"/></clipPath><g clip-path="url(#${g})">`;
  s += `<path d="${face}" fill="${P.goldRim}"/>`;
  s += `<g transform="translate(32 0) scale(${k} 1) translate(-32 0)">`;
  s += `<circle cx="32" cy="32" r="20.5" fill="${P.gold}"/>`;
  s += `<path d="${star(33.2, 33.4, 13, 5.6)}" fill="${P.goldEdge}" opacity="0.7"/>`;
  s += `<path d="${star(32, 32, 13, 5.6)}" fill="${P.goldHi}"/>`;
  s += `<circle cx="32" cy="32" r="20.5" fill="none" stroke="${P.goldEdge}" stroke-width="2" opacity="0.7"/>`;
  s += `</g>`;
  s += `<ellipse cx="${f(32 - rx * 0.42)}" cy="17" rx="${f(Math.max(1.2, rx * 0.28))}" ry="5" transform="rotate(${f(-30 * k)} ${f(32 - rx * 0.42)} 17)" fill="#fff" opacity="0.75"/>`;
  s += `</g><path d="${face}" fill="none" stroke="${P.goldLine}" stroke-width="3" stroke-linejoin="round"/>`;
  return s;
}

// ================================================================= BASE (0 0 240 64; flat top y = 4)
function base() {
  PFX = 'bs'; _id = 0;
  let s = '';
  // legs + feet
  for (const x of [34, 206]) {
    s += shape(`M${x - 6} 34L${x - 9} 56H${x + 9}L${x + 6} 34Z`, P.padShade, null, P.padLine, { sw: 2.5 });
    s += shape(rrect(x - 16, 54, 32, 8, 4), P.pad, P.padShade, P.padLine, { sw: 2.5, off: [0, -3] });
  }
  s += shape('M100 34L97 52H143L140 34Z', P.padShade, null, P.padLine, { sw: 2.5 });
  s += shape(rrect(90, 50, 60, 10, 5), P.pad, P.padShade, P.padLine, { sw: 2.5, off: [0, -3] });
  // body (under the deck)
  s += shape('M18 22H222L208 40Q206 42 202 42H38Q34 42 32 40Z', P.pad, P.padShade, P.padLine, { off: [0, -5] });
  // lights
  [[80, P.lYellow], [120, P.lTeal], [160, P.lPink]].forEach(([x, c]) => {
    s += glow(x, 32, 9, c, 0.6, 0.25);
    s += `<circle cx="${x}" cy="32" r="4.4" fill="${c}" stroke="${P.lightLine}" stroke-width="2"/><circle cx="${x - 1.3}" cy="30.6" r="1.3" fill="#fff" opacity="0.9"/>`;
  });
  // deck: top outer edge exactly at y = 4 (path at 5.5 + half of the 3 px stroke)
  s += shape(rrect(3.5, 5.5, 233, 18, 6), '#e3dffa', P.padShade, P.padLine, {
    off: [0, -4],
    inner: `<rect x="0" y="13" width="240" height="4.5" fill="${P.padStripe}"/><rect x="12" y="8" width="150" height="2.4" rx="1.2" fill="#fff" opacity="0.9"/>`,
  });
  return s;
}

// ================================================================= FLAG (0 0 64 128; base 12,124)
function flag() {
  PFX = 'fl'; _id = 0;
  let s = '';
  s += shape(rrect(9.5, 14, 5, 108, 2.5), P.pole, P.hullShade, P.poleLine, { sw: 2.5, off: [-1.5, 0] });
  s += shape('M3 124Q3 114 12 114Q21 114 21 124Z', P.pad, P.padShade, P.padLine, { sw: 2.5, off: [0, -2] });
  // pennant with a paw print
  const pd = 'M15 20Q36 26 57 35Q60 37 57 39Q36 47 15 54Z';
  let paw = `<ellipse cx="31" cy="40.5" rx="5" ry="4.3" fill="#fff"/>`;
  for (const [x, y] of [[25.5, 34.5], [30, 31.5], [35, 32.5], [38, 37]]) paw += `<circle cx="${x}" cy="${y}" r="2.1" fill="#fff"/>`;
  s += shape(pd, P.pennant, P.pennantShade, P.pennantLine, { off: [0, -4], inner: paw, sw: 2.5 });
  // beacon light
  s += glow(12, 10, 10, P.beacon, 0.9, 0.4);
  s += shape(circ(12, 10, 5.8), P.beacon, '#ffc21a', P.beaconLine, { sw: 2.2, off: [-1, -1.5], hi: [10.2, 8, 1.8, 1.3, 0], hiOp: 0.95 });
  return s;
}

// ================================================================= ROCKET (0 0 96 160; centre 48,80; nozzle bottom 48,152)
function rocket() {
  PFX = 'rk'; _id = 0;
  let s = '';
  // fins (behind body)
  s += shape('M28 100Q12 112 12 138Q12 144 18 142L32 132Z', P.rktRed, P.rktRedShade, P.rktRedLine, { off: [-2, -3] });
  s += shape('M68 100Q84 112 84 138Q84 144 78 142L64 132Z', P.rktRed, P.rktRedShade, P.rktRedLine, { off: [-2, -3] });
  // nozzle
  s += shape('M38 134H58L62 150Q62 152 60 152H36Q34 152 34 150Z', P.nozzle, '#6f66ad', P.hullLine, { off: [-2, -2] });
  // body with coral nose cone (clipped band)
  const body = 'M48 10C66 22 74 50 74 84C74 106 70 124 64 138H32C26 124 22 106 22 84C22 50 30 22 48 10Z';
  s += shape(body, P.rkt, P.rktShade, P.rktLine, {
    off: [-5, 0],
    inner: `<path d="M0 0H96V40Q48 48 0 40Z" fill="${P.rktRedShade}"/><path d="M0 0H91V39Q46 47 0 39Z" fill="${P.rktRed}"/>` +
      `<path d="M0 40Q48 48 96 40" fill="none" stroke="${P.rktRedLine}" stroke-width="2.5"/>` +
      `<rect x="0" y="122" width="96" height="6" fill="${P.rktRed}"/><path d="M0 122H96M0 128H96" stroke="${P.rktRedLine}" stroke-width="2"/>`,
    hi: [36, 76, 4, 22, -4], hiOp: 0.7,
  });
  // round window with a tiny star
  s += shape(circ(48, 76, 13), P.win, P.winShade, P.winLine, { off: [-2.5, -2.5], sw: 3, inner: `<path d="${star(48, 77, 6, 2.6)}" fill="${P.lYellow}"/>`, hi: [43, 70, 4, 2.5, -35], hiOp: 0.85 });
  s += `<circle cx="48" cy="76" r="16" fill="none" stroke="${P.hullShade}" stroke-width="3"/>`;
  s += `<circle cx="48" cy="76" r="17.5" fill="none" stroke="${P.rktLine}" stroke-width="1.5"/>`;
  // centre fin
  s += shape('M48 108Q52 120 51 136H45Q44 120 48 108Z', P.rktRed, P.rktRedShade, P.rktRedLine, { sw: 2.5, off: [-1, 0] });
  return s;
}
function flame() {
  PFX = 'fm'; _id = 0;
  const g = uid();
  let s = `<radialGradient id="${g}" cx="24" cy="10" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6c2"/><stop offset="0.45" stop-color="#ffc23c"/><stop offset="1" stop-color="#ff7a3c" stop-opacity="0.85"/></radialGradient>`;
  s += `<path d="M5 0H43Q46 18 36 38Q30 52 24 63Q18 52 12 38Q2 18 5 0Z" fill="url(#${g})" opacity="0.95"/>`;
  s += `<path d="M13 0H35Q36 14 30 28Q27 36 24 44Q21 36 18 28Q12 14 13 0Z" fill="#ffe66a" opacity="0.9"/>`;
  s += `<path d="M19 0H29Q30 9 27 17Q25 22 24 26Q23 22 21 17Q18 9 19 0Z" fill="#fffbe6"/>`;
  return s;
}

// ================================================================= HEARTS (0 0 48 48)
function heart(full) {
  PFX = full ? 'hf' : 'he'; _id = 0;
  const d = heartPath(24, 25, 20);
  if (!full) return `<path d="${d}" fill="${P.heartEmpty}" fill-opacity="0.12" stroke="${P.heartEmpty}" stroke-width="3" stroke-linejoin="round" opacity="0.5"/>`;
  return shape(d, P.heart, P.heartShade, P.heartLine, { off: [-3, -3], hi: [15, 15, 5, 3, -35], hiOp: 0.8 }) +
    `<circle cx="22.5" cy="12" r="1.7" fill="#fff" opacity="0.8"/>`;
}

// ================================================================= ICON (0 0 256 256)
function icon() {
  let s = '';
  PFX = 'ic'; _id = 0;
  const g = uid();
  s += `<radialGradient id="${g}" cx="110" cy="90" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4a3496"/><stop offset="0.6" stop-color="${P.night}"/><stop offset="1" stop-color="${P.night2}"/></radialGradient>`;
  s += `<circle cx="128" cy="128" r="122" fill="url(#${g})" stroke="${P.badgeLine}" stroke-width="6"/>`;
  // ringed planet + stars
  s += line('M28 62Q48 56 70 46', '#ffd27a', 4);
  s += shape(circ(48, 56, 13), '#ff9fb8', '#e47898', '#8a3a5e', { sw: 2.5 });
  s += line('M34 66Q48 62 64 54', '#ffd27a', 4);
  s += `<path d="${star(214, 46, 7, 3)}" fill="#fff4b0"/><path d="${star(44, 118, 6, 2.6)}" fill="#fff4b0"/><path d="${star(212, 150, 6, 2.6)}" fill="#fff4b0"/>`;
  for (const [x, y, r] of [[78, 44, 2.2], [176, 36, 2], [36, 150, 1.8], [222, 112, 1.6], [60, 196, 2]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.85"/>`;
  // crates (2 stacked) — reuse the crate drawing scaled to 76x50
  const cw = 78, ch = 52, cx = 128;
  const cr = (i, x, y) => { const c = crate(i); return `<g transform="translate(${x} ${y}) scale(${cw / 120} ${ch / 80})">${c}</g>`; };
  s += cr(2, cx - cw / 2, 186) + cr(0, cx - cw / 2 + 4, 186 - ch);
  // Juno (happy) in the saucer, holding a coin
  const j = juno('happy', 'icj');
  s += `<g transform="translate(36 -8) scale(1.15)">${j}`;
  const c = coin(1, 'icc');
  s += `<g transform="translate(66 76) scale(0.44)">${c}</g></g>`;
  return s;
}

// ================================================================= write
function write(name, w, h, body) {
  fs.writeFileSync(path.join(OUT, name), svg(w, h, body));
  console.log('wrote', name);
}
fs.mkdirSync(OUT, { recursive: true });
for (const fr of ['idle', 'drop', 'happy', 'oops']) write(`juno_${fr}.svg`, 160, 160, juno(fr, 'j' + fr[0]));
write('beam.svg', 80, 120, beam());
for (let i = 0; i < 4; i++) write(`crate_${i}.svg`, 120, 80, crate(i));
write('coin_0.svg', 64, 64, coin(1, 'k0'));
write('coin_1.svg', 64, 64, coin(0.6, 'k1'));
write('coin_2.svg', 64, 64, coin(0.22, 'k2'));
write('base.svg', 240, 64, base());
write('flag.svg', 64, 128, flag());
write('rocket.svg', 96, 160, rocket());
write('flame.svg', 48, 64, flame());
write('heart.svg', 48, 48, heart(true));
write('heart_empty.svg', 48, 48, heart(false));
write('icon.svg', 256, 256, icon());
