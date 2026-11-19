#!/usr/bin/env node
// Character & item art generator for Ziggy's Apple Castle.
// 100% original hand-written SVG (no text, fonts, scripts, images or external refs).
// Ziggy's four frames are built from the SAME rocket parts, so the rocket geometry is
// identical across frames: only the face, ears, paws, lever and emitter glow change.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Ziggy (cream-and-ginger kitten)
  cream: '#fff3e0', creamShade: '#f0d9b8', creamLine: '#a8784a',
  ginger: '#ffb15c', gingerShade: '#ec8f34', gingerLine: '#a3561c', stripe: '#e07f2a',
  earIn: '#ffb3c1', eye: '#3a2340', eyeLow: '#7a5ab0', cheek: '#ff8fa8', nose: '#ff7f9a', noseLine: '#b84862',
  mouth: '#8a3a3a', tongue: '#ff7f96', whisker: '#a8784a',
  sweat: '#9fe3ff', sweatShade: '#6cc7ee', sweatLine: '#3f8fbf',
  brass: '#f0b84e', brassShade: '#c98d2c', brassLine: '#7a5418', goggle: '#c6f4ee', goggleShade: '#8ed8cf',
  // hover-rocket (mint-teal)
  mint: '#3fd6c0', mintShade: '#25ad99', mintLine: '#136b5e', inside: '#1d7f71', rim: '#ffffff', rimShade: '#d4f2ec',
  fin: '#ff8f7a', finShade: '#e0634f', finLine: '#8f3a2c',
  port: '#fff0a8', portShade: '#ffd45a',
  lever: '#9fd9cf', knob: '#ff5c8a', knobLine: '#a3224f',
  emit: '#ffd25a', emitCore: '#fff8d6', emitLine: '#a8741a',
  // crates (honey wood) and their painted bands: [fill, shade, line]
  wood: '#d9a066', woodShade: '#a86a3a', woodLine: '#6b3f1f', post: '#c4864d', grain: '#b97a45',
  bands: [
    ['#ff5a5a', '#d93d45', '#8f2430'],
    ['#4ccf6a', '#2fa84e', '#1d6b33'],
    ['#ffc93c', '#e8a51c', '#8a5a00'],
    ['#58b4ff', '#3590e0', '#1d5a99'],
  ],
  stencil: '#fff3e0',
  // apple
  apple: '#ff4d4d', appleShade: '#c22d3a', appleLine: '#7a1b26', stem: '#8a5a32', stemLine: '#4f3018',
  leaf: '#5ccf5c', leafShade: '#3aa845', leafLine: '#22652a',
  // lantern
  lamp: '#ffcf5a', lampCore: '#fff6c8', lampShade: '#f0a632', lampLine: '#9a5a14',
  // stone (base)
  stone: '#aaa2d0', stoneShade: '#8f86b8', stoneLine: '#4e4680', stoneDark: '#7b72a8', moss: '#7fbf6a', mossShade: '#5a9a4e', mossLine: '#2f5f2a',
  // flag
  pennant: '#ff8fc0', pennantShade: '#e866a0', pennantLine: '#9a3366', pole: '#c99a60', poleLine: '#6b3f1f',
  // Granny Boo
  ghost: '#f4f0ff', ghostShade: '#cfc6f0', ghostLine: '#7d70b3', ghostEye: '#4a3f7a',
  bonnet: '#ffa6c9', bonnetShade: '#e87fab', bonnetLine: '#a34a77',
  // pie
  crust: '#f5bd5f', crustShade: '#d6913a', crustLine: '#8a5420', filling: '#d9443e', tin: '#c9c0ea', tinShade: '#a49bd0', tinLine: '#5b5196',
  // hearts
  heart: '#ff5c8a', heartShade: '#e23d6e', heartLine: '#a3224f', heartEmpty: '#b9b1e8',
  // icon
  night: '#2e1f66', night2: '#170f40', badgeLine: '#9a8ae6', moon: '#fff1b0', moonShade: '#f2d470', moonLine: '#a88a2a',
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
const heartPath = (cx, cy, s) => {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 0.95)}C${p(-0.35, 0.68)} ${p(-1, 0.25)} ${p(-1, -0.28)}C${p(-1, -0.72)} ${p(-0.62, -0.95)} ${p(-0.3, -0.95)}` +
    `C${p(-0.12, -0.95)} ${p(0, -0.84)} ${p(0, -0.62)}C${p(0, -0.84)} ${p(0.12, -0.95)} ${p(0.3, -0.95)}` +
    `C${p(0.62, -0.95)} ${p(1, -0.72)} ${p(1, -0.28)}C${p(1, 0.25)} ${p(0.35, 0.68)} ${p(0, 0.95)}Z`;
};
// apple silhouette centred on (cx, cy) with half-width s (top dimple, bottom dimple)
const applePath = (cx, cy, s) => {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, -0.72)}C${p(0.3, -1.02)} ${p(1, -0.95)} ${p(1, -0.18)}C${p(1, 0.52)} ${p(0.55, 0.98)} ${p(0.22, 0.95)}` +
    `C${p(0.1, 0.94)} ${p(0.05, 0.88)} ${p(0, 0.88)}C${p(-0.05, 0.88)} ${p(-0.1, 0.94)} ${p(-0.22, 0.95)}` +
    `C${p(-0.55, 0.98)} ${p(-1, 0.52)} ${p(-1, -0.18)}C${p(-1, -0.95)} ${p(-0.3, -1.02)} ${p(0, -0.72)}Z`;
};
// leaf from base (x, y) pointing at angle a (deg), length L, half-width w
const leafPath = (x, y, a, L, w) => {
  const r = (a * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const T = (u, v) => `${f(x + u * c - v * sn)} ${f(y + u * sn + v * c)}`;
  return `M${T(0, 0)}C${T(L * 0.3, -w)} ${T(L * 0.75, -w)} ${T(L, 0)}C${T(L * 0.75, w)} ${T(L * 0.3, w)} ${T(0, 0)}Z`;
};
const leafVein = (x, y, a, L) => {
  const r = (a * Math.PI) / 180;
  return `M${f(x + 0.15 * L * Math.cos(r))} ${f(y + 0.15 * L * Math.sin(r))}L${f(x + 0.8 * L * Math.cos(r))} ${f(y + 0.8 * L * Math.sin(r))}`;
};

// ================================================================= ZIGGY
// viewBox 0 0 160 160. Body centre (80,78). Lantern emitter (80,140).
const RIM = { cx: 80, cy: 98, rx: 46, ry: 7.5 };
const RIM_D = ell(RIM.cx, RIM.cy, RIM.rx, RIM.ry);
const BODY_D = `M34 98A46 7.5 0 0 0 126 98C131 106 133 116 129 124C124 132 106 137 80 137C54 137 36 132 31 124C27 116 29 106 34 98Z`;
const HEAD_D = 'M80 34C102 34 115 46 115 61C115 67 113 71 110 74L116 78L107 80C101 86 92 89 80 89C68 89 59 86 53 80L44 78L50 74C47 71 45 67 45 61C45 46 58 34 80 34Z';
const TORSO_D = 'M56 114C56 89 66 82 80 82C94 82 104 89 104 114Z';
const EAR_D = 'M47 54Q42 32 48 18Q51 14 56 17Q67 25 74 39Z';
const EAR_IN = 'M52 47Q49 33 52 25Q60 31 66 39Z';
const TAIL_D = 'M108 106C122 102 139 98 143 84C147 70 141 59 132 61C125 63 127 72 134 70';

function ear(side, mode) {
  const pivot = [61, 45];
  let tf = '';
  if (mode === 'perk') tf = `rotate(-7 ${pivot[0]} ${pivot[1]}) translate(0 -2)`;
  if (mode === 'down') tf = `rotate(-30 ${pivot[0]} ${pivot[1]}) translate(2 5)`;
  const ginger = side === 'L';
  const fill = ginger ? P.ginger : P.cream, shade = ginger ? P.gingerShade : P.creamShade, ln = ginger ? P.gingerLine : P.creamLine;
  let s = `<g transform="${tf}">` + shape(EAR_D, fill, shade, ln, { off: [-3, 1], inner: `<path d="${EAR_IN}" fill="${P.earIn}"/>` }) + `</g>`;
  return side === 'L' ? s : `<g transform="translate(160 0) scale(-1 1)">${s}</g>`;
}

function helmet() {
  let s = '';
  const dome = 'M63 43C63 30 70 23 80 23C90 23 97 30 97 43Z';
  s += shape(dome, P.brass, P.brassShade, P.brassLine, { off: [-3, -2], hi: [72, 30, 4.5, 2.4, -35], hiOp: 0.75,
    inner: `<rect x="60" y="36" width="40" height="2" fill="${P.brassShade}" opacity="0.6"/>` });
  s += shape(ell(80, 43, 22, 4.2), P.brass, P.brassShade, P.brassLine, { sw: 2.5, off: [0, -1.5] });
  s += `<circle cx="80" cy="22" r="3" fill="${P.brass}" stroke="${P.brassLine}" stroke-width="2"/>`;
  // goggles pushed up on the dome
  s += line('M64 34Q80 29 96 34', P.brassLine, 3.2);
  for (const x of [72, 88]) {
    s += shape(circ(x, 32, 5.4), P.goggle, P.goggleShade, P.brassLine, { sw: 2.4, off: [-1.5, -1.5], hi: [x - 1.6, 30.4, 1.8, 1.1, -30], hiOp: 0.95 });
  }
  return s;
}

function face(frame) {
  let s = '';
  const eyeOpen = (x, y, big = 1) =>
    `<ellipse cx="${x}" cy="${y}" rx="${f(7 * big)}" ry="${f(8.6 * big)}" fill="${P.eye}"/>` +
    `<ellipse cx="${x}" cy="${f(y + 4.3 * big)}" rx="${f(4.4 * big)}" ry="${f(2.8 * big)}" fill="${P.eyeLow}" opacity="0.85"/>` +
    `<circle cx="${f(x - 2.4 * big)}" cy="${f(y - 3.2 * big)}" r="${f(2.9 * big)}" fill="#fff"/><circle cx="${f(x + 2.6 * big)}" cy="${f(y + 1.8 * big)}" r="${f(1.3 * big)}" fill="#fff"/>`;
  if (frame === 'idle') {
    s += eyeOpen(67, 61) + eyeOpen(93, 61);
    s += line('M73.5 75.5Q76.8 79 80 75.8Q83.2 79 86.5 75.5', P.mouth, 2.3);
  } else if (frame === 'drop') {
    s += eyeOpen(67, 61, 1.08) + eyeOpen(93, 61, 1.08);
    s += `<ellipse cx="80" cy="79" rx="3.6" ry="4.4" fill="${P.mouth}"/><ellipse cx="80" cy="80.6" rx="2.2" ry="1.8" fill="${P.tongue}"/>`;
  } else if (frame === 'happy') {
    s += line('M60 63Q67 53 74 63', P.eye, 3.6) + line('M86 63Q93 53 100 63', P.eye, 3.6);
    s += `<path d="M71.5 75Q80 74 88.5 75Q87.5 85.5 80 85.5Q72.5 85.5 71.5 75Z" fill="${P.mouth}" stroke="${P.mouth}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="M75 81.5Q80 78.5 85 81.5Q83 85 80 85Q77 85 75 81.5Z" fill="${P.tongue}"/>`;
  } else if (frame === 'oops') {
    s += line('M61 56L72 61L61 66', P.eye, 3.6) + line('M99 56L88 61L99 66', P.eye, 3.6);
    s += line('M71 79.5Q73.5 76.5 76 79.5Q78.5 82.5 81 79.5Q83.5 76.5 86 79.5Q87.5 81 89 79.5', P.mouth, 2.3);
  }
  // nose: little pink rounded triangle
  s += `<path d="M75.5 70Q80 67.4 84.5 70Q83 74.2 80 74.2Q77 74.2 75.5 70Z" fill="${P.nose}" stroke="${P.noseLine}" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="78.4" cy="69.9" rx="1.5" ry="0.8" fill="#fff" opacity="0.8"/>`;
  // rosy cheeks
  const cr = frame === 'happy' ? 1.22 : 1;
  s += `<ellipse cx="56.5" cy="73.5" rx="${f(5.6 * cr)}" ry="${f(3.4 * cr)}" fill="${P.cheek}" opacity="0.72"/>`;
  s += `<ellipse cx="103.5" cy="73.5" rx="${f(5.6 * cr)}" ry="${f(3.4 * cr)}" fill="${P.cheek}" opacity="0.72"/>`;
  // whiskers (two each side, outside the cheeks)
  const wk = ' opacity="0.85"';
  s += line('M50 70.5L36 67.5', P.whisker, 1.8, wk) + line('M50 75L37 77', P.whisker, 1.8, wk);
  s += line('M110 70.5L124 67.5', P.whisker, 1.8, wk) + line('M110 75L123 77', P.whisker, 1.8, wk);
  if (frame === 'oops') {
    s += shape('M114 40Q120 49 120 53Q120 58 114.5 58Q109 58 109 53Q109 49 114 40Z', P.sweat, P.sweatShade, P.sweatLine, { sw: 2, off: [-1.5, -1.5], hi: [112.5, 52, 1.6, 2.6, 0], hiOp: 0.9 });
  }
  return s;
}

function paw(x, y, ginger = false) {
  const fill = ginger ? P.ginger : P.cream, shade = ginger ? P.gingerShade : P.creamShade, ln = ginger ? P.gingerLine : P.creamLine;
  return shape(ell(x, y, 7, 5), fill, shade, ln, { sw: 2.5, off: [-1.5, -1.5] }) +
    line(`M${x - 2.2} ${y + 1.5}V${y + 4}M${x + 2.2} ${y + 1.5}V${y + 4}`, ln, 1.4, ' opacity="0.7"');
}

function ziggy(frame, prefix) {
  PFX = prefix; _id = 0;
  let s = '';
  // --- rocket back parts (identical in every frame)
  // side fins
  s += shape('M36 106Q16 112 13 130Q12 138 19 137L40 128Z', P.fin, P.finShade, P.finLine, { off: [-2, -3] });
  s += shape('M124 106Q144 112 147 130Q148 138 141 137L120 128Z', P.fin, P.finShade, P.finLine, { off: [-2, -3] });
  // lantern-hook nozzle (behind the hull bottom)
  s += shape(rrect(71, 130, 18, 8, 3.5), P.brass, P.brassShade, P.brassLine, { sw: 2.5, off: [-2, -2] });
  // inside of the barrel (dark), seen through the open top
  s += `<path d="${RIM_D}" fill="${P.inside}"/>`;
  // tail rises from inside the barrel (base hidden by the front lip)
  s += line(TAIL_D, P.gingerLine, 14.5) + line(TAIL_D, P.ginger, 9.5);
  s += `<path d="${TAIL_D}" fill="none" stroke="${P.stripe}" stroke-width="9.5" stroke-dasharray="4 7"/>`;
  // --- kitten
  s += shape(TORSO_D, P.cream, P.creamShade, P.creamLine, { off: [-3, -3], inner: `<path d="M84 80C96 82 104 90 104 102H90Q92 92 84 80Z" fill="${P.ginger}"/>` });
  const em = frame === 'happy' ? 'perk' : frame === 'oops' ? 'down' : 'up';
  s += ear('L', em) + ear('R', em);
  s += shape(HEAD_D, P.cream, P.creamShade, P.creamLine, {
    off: [-3, -4],
    inner:
      // ginger patch over the right eye (soft blob) + two forehead stripes
      `<path d="M84 46C96 42 112 48 114 60C116 70 106 74 98 72C90 70 84 64 83 57C82 52 82 48 84 46Z" fill="${P.ginger}"/>` +
      `<path d="M84 46C96 42 112 48 114 60C116 70 106 74 98 72C96 72 95 70 98 69C108 68 110 60 104 54C99 49 90 48 84 46Z" fill="${P.gingerShade}" opacity="0.55"/>` +
      `<ellipse cx="80" cy="76" rx="12" ry="8" fill="#fff" opacity="0.55"/>`,
    hi: [62, 46, 9, 3.6, -25], hiOp: 0.55,
  });
  s += helmet();
  s += face(frame);
  // --- rocket front (identical in every frame)
  s += shape(BODY_D, P.mint, P.mintShade, P.mintLine, {
    off: [-6, -4],
    inner: line('M28 102A52 8.5 0 0 0 132 102', P.rimShade, 8) + line('M28 101A52 8.5 0 0 0 132 101', P.rim, 6) +
      `<path d="M38 108Q35 120 46 128" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.5"/>`,
  });
  s += line('M34 98A46 7.5 0 0 1 126 98', P.mintLine, 3); // back rim edge
  // portholes / lights
  for (const [x, y] of [[55, 119], [80, 122.5], [105, 119]]) {
    s += `<circle cx="${x}" cy="${y}" r="7.6" fill="${P.rim}" stroke="${P.mintLine}" stroke-width="2.4"/>`;
    s += shape(circ(x, y, 4.6), P.port, P.portShade, P.mintLine, { sw: 1.8, off: [-1.4, -1.4], hi: [x - 1.4, y - 1.6, 1.5, 1, 0], hiOp: 0.95 });
  }
  // lever (on the rim, left) + paws on the rim
  if (frame === 'drop') {
    s += line('M44 101L52 89', P.mintLine, 6.5) + line('M44 101L52 89', P.lever, 3.2);
    s += `<circle cx="52.6" cy="88" r="4.4" fill="${P.knob}" stroke="${P.knobLine}" stroke-width="2"/><circle cx="51.4" cy="86.8" r="1.3" fill="#fff" opacity="0.85"/>`;
    s += paw(55, 90, true) + paw(96, 99);
  } else {
    s += line('M44 101L38 88', P.mintLine, 6.5) + line('M44 101L38 88', P.lever, 3.2);
    s += `<circle cx="37.7" cy="87" r="4.4" fill="${P.knob}" stroke="${P.knobLine}" stroke-width="2"/><circle cx="36.5" cy="85.8" r="1.3" fill="#fff" opacity="0.85"/>`;
    if (frame === 'happy') s += paw(62, 93, true) + paw(98, 93);
    else if (frame === 'oops') s += paw(70, 99, true) + paw(90, 99);
    else s += paw(65, 99, true) + paw(95, 99);
  }
  // lantern emitter glow
  if (frame === 'drop') s += glow(80, 140, 20, P.emit, 0.95, 0.45);
  else s += glow(80, 140, 13, P.emit, 0.7, 0.3);
  s += line('M80 136V137.5', P.brassLine, 2.5);
  s += `<circle cx="80" cy="140" r="${frame === 'drop' ? 5.4 : 4.6}" fill="${P.emitCore}" stroke="${P.emitLine}" stroke-width="2"/>`;
  return s;
}

// ================================================================= BEAM (0 0 80 120)
function beam() {
  PFX = 'bm'; _id = 0;
  const g = uid(), h = uid();
  let s = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd98a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffc861" stop-opacity="0.2"/></linearGradient>`;
  s += `<linearGradient id="${h}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2c8" stop-opacity="0"/><stop offset="0.5" stop-color="#fff2c8" stop-opacity="0.3"/><stop offset="1" stop-color="#fff2c8" stop-opacity="0"/></linearGradient>`;
  s += `<path d="M30 0H50L80 120H0Z" fill="url(#${g})"/>`;
  s += `<path d="M36 0H44L58 120H22Z" fill="url(#${h})"/>`;
  for (const y of [28, 64, 100]) {
    const hw = 10 + (30 * y) / 120;
    s += `<ellipse cx="40" cy="${y}" rx="${f(hw - 2)}" ry="${f(2 + y / 60)}" fill="none" stroke="#ffe7a8" stroke-width="2" opacity="0.4"/>`;
  }
  for (const [x, y, r] of [[34, 46, 1.6], [50, 80, 1.8], [28, 92, 1.4], [46, 18, 1.2]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffbe8" opacity="0.45"/>`;
  return s;
}

// ================================================================= CRATES (0 0 120 80)
function stencil(i, ln) {
  const w = P.stencil, o = { sw: 2.2, off: [-1, -1] };
  if (i === 0) {
    return shape(applePath(60, 41.5, 9.5), w, '#ffe2d6', ln, o) + line('M60 34.5Q60.5 31.5 62 30', ln, 2.2) +
      shape(leafPath(61.5, 32, -25, 9, 3.4), w, null, ln, { sw: 1.8 });
  }
  if (i === 1) {
    return shape(leafPath(48, 47, -28, 26, 8.5), w, '#e2f7e4', ln, o) + line(leafVein(48, 47, -28, 26), ln, 1.8) +
      line('M48 47L45 50', ln, 2.2);
  }
  if (i === 2) {
    let s = '';
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, x1 = 60 + 9.5 * Math.cos(a), y1 = 40 + 9.5 * Math.sin(a), x2 = 60 + 13 * Math.cos(a), y2 = 40 + 13 * Math.sin(a);
      s += line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, ln, 5.4) + line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, w, 2.4);
    }
    return s + shape(circ(60, 40, 7), w, '#fff1c8', ln, o);
  }
  const d = 'M63 28A12 12 0 1 0 70 50A10 10 0 1 1 63 28Z';
  return shape(d, w, '#e2f0ff', ln, o) + `<circle cx="71" cy="33" r="1.6" fill="${w}" stroke="${ln}" stroke-width="1.2"/>`;
}
function crate(i) {
  PFX = 'c' + i; _id = 0;
  const [bf, bs, bl] = P.bands[i];
  const O = rrect(1.5, 1.5, 117, 77, 7.5);
  const id = uid();
  let s = `<clipPath id="${id}"><path d="${O}"/></clipPath><g clip-path="url(#${id})">`;
  s += `<rect x="0" y="0" width="120" height="80" fill="${P.wood}"/>`;
  // three planks, each with a darker lower edge (one-step shade) and a grain stroke
  for (const [y0, y1] of [[0, 27], [27, 53], [53, 80]]) {
    s += `<rect x="0" y="${y1 - 5}" width="120" height="5" fill="${P.woodShade}" opacity="0.55"/>`;
  }
  s += line('M26 12Q46 9 60 13', P.grain, 1.6, ' opacity="0.7"') + line('M70 65Q84 62 96 66', P.grain, 1.6, ' opacity="0.7"');
  s += `<rect x="18" y="5" width="48" height="2.6" rx="1.3" fill="#fff" opacity="0.4"/>`;
  // painted band on the middle plank
  s += `<rect x="0" y="27" width="120" height="26" fill="${bs}"/><rect x="0" y="27" width="120" height="21.5" fill="${bf}"/>`;
  s += `<rect x="20" y="30" width="30" height="2.2" rx="1.1" fill="#fff" opacity="0.45"/>`;
  // corner posts
  for (const x of [0, 104]) {
    s += `<rect x="${x}" y="0" width="16" height="80" fill="${P.woodShade}"/><rect x="${x}" y="0" width="12.5" height="80" fill="${P.post}"/>`;
    s += `<path d="M${x === 0 ? 16 : 104} 0V80" stroke="${P.woodLine}" stroke-width="2.2"/>`;
  }
  s += `<path d="M16 27H104M16 53H104" stroke="${P.woodLine}" stroke-width="2.2"/>`;
  s += `</g>`;
  // nails on the posts
  for (const x of [8.5, 111.5]) for (const y of [12, 40, 68]) s += `<circle cx="${x}" cy="${y}" r="2.1" fill="${P.woodLine}" opacity="0.8"/>`;
  s += stencil(i, bl);
  s += `<path d="${O}" fill="none" stroke="${P.woodLine}" stroke-width="3" stroke-linejoin="round"/>`;
  return s;
}

// ================================================================= LANTERN (0 0 48 64; hook at 24,0)
function lantern(prefix = 'ln') {
  PFX = prefix; _id = 0;
  let s = '';
  s += glow(24, 36, 24, P.lamp, 0.55, 0.22);
  s += line('M24 0.5V5', P.brassLine, 2.4) + line('M24 5Q19 5 19 9', P.brassLine, 2.2);
  // cap
  s += shape('M15 15Q15 9 24 9Q33 9 33 15Z', P.brass, P.brassShade, P.brassLine, { sw: 2.4, off: [-1.5, -1] });
  // glowing body
  const g = uid();
  s += `<radialGradient id="${g}" cx="22" cy="33" r="18" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.lampCore}"/><stop offset="0.45" stop-color="${P.lamp}"/><stop offset="1" stop-color="${P.lampShade}"/></radialGradient>`;
  const body = ell(24, 34, 16, 18);
  s += `<path d="${body}" fill="url(#${g})"/>`;
  s += line('M15 20Q10 34 15 48M33 20Q38 34 33 48M24 16V52', P.lampShade, 1.6, ' opacity="0.8"');
  s += `<ellipse cx="18" cy="26" rx="3" ry="5" transform="rotate(20 18 26)" fill="#fff" opacity="0.7"/>`;
  s += `<path d="${body}" fill="none" stroke="${P.lampLine}" stroke-width="2.6"/>`;
  // base + tassel
  s += shape('M16 50H32Q32 56 24 56Q16 56 16 50Z', P.brass, P.brassShade, P.brassLine, { sw: 2.4, off: [-1.5, -1] });
  s += line('M24 56V61', P.fin, 3) + `<circle cx="24" cy="61.4" r="1.8" fill="${P.fin}"/>`;
  return s;
}

// ================================================================= APPLES (0 0 64 64; centre 32,34)
function apple(frame, prefix) {
  PFX = prefix; _id = 0;
  let s = '';
  const d = applePath(32, 36, 22);
  s += shape(d, P.apple, P.appleShade, P.appleLine, { off: [-5, -4], hi: [22, 26, 4.8, 7.5, 30], hiOp: 0.75 });
  s += `<circle cx="20" cy="38" r="2" fill="#fff" opacity="0.6"/>`;
  // stem
  s += line('M32 21Q31 14 35 9', P.stemLine, 5.4) + line('M32 21Q31 14 35 9', P.stem, 2.6);
  // leaf: frame 0 lies to the right, frame 1 flips up
  const [lx, ly, la] = frame ? [34, 13, -70] : [34, 14, -18];
  s += shape(leafPath(lx, ly, la, 18, 6.5), P.leaf, P.leafShade, P.leafLine, { sw: 2.4, off: [-1.5, -1.5] }) + line(leafVein(lx, ly, la, 18), P.leafLine, 1.5, ' opacity="0.8"');
  return s;
}
function appleGlow() {
  PFX = 'ag'; _id = 0;
  const id = uid();
  return `<radialGradient id="${id}" cx="32" cy="32" r="32" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#fff3b0" stop-opacity="0.5"/><stop offset="0.35" stop-color="#ffc04a" stop-opacity="0.38"/>` +
    `<stop offset="0.7" stop-color="#ff7a4a" stop-opacity="0.14"/><stop offset="1" stop-color="#ff6a5a" stop-opacity="0"/></radialGradient>` +
    `<circle cx="32" cy="32" r="32" fill="url(#${id})"/>`;
}

// ================================================================= BASE (0 0 240 64; flat top y = 4)
function base() {
  PFX = 'bs'; _id = 0;
  let s = '';
  // wall of stones, two rows
  const rows = [[19, 40, [12, 52, 96, 144, 188, 228]], [40, 62, [8, 40, 82, 120, 158, 200, 232]]];
  for (const [y0, y1, xs] of rows) {
    for (let k = 0; k < xs.length - 1; k++) {
      const x0 = xs[k] + 1, x1 = xs[k + 1] - 1;
      s += shape(rrect(x0, y0 + 0.5, x1 - x0, y1 - y0 - 1, 5), P.stone, P.stoneShade, P.stoneLine, { sw: 2.5, off: [-2, -3] });
    }
  }
  // carved apple medallion in the middle
  s += shape(circ(120, 41, 13), '#bcb5dc', P.stoneShade, P.stoneLine, { sw: 2.5, off: [-1.5, -2] });
  s += `<path d="${applePath(120.8, 42.8, 7.4)}" fill="${P.stoneDark}"/>`;
  s += `<path d="${applePath(120, 42, 7.4)}" fill="${P.stoneShade}" stroke="${P.stoneLine}" stroke-width="1.6"/>`;
  s += `<path d="${leafPath(121, 35.5, -30, 6.5, 2.4)}" fill="${P.stoneShade}" stroke="${P.stoneLine}" stroke-width="1.4"/>`;
  // capstone slab: top outer edge exactly at y = 4 (path at 5.5 + half of the 3 px stroke)
  s += shape(rrect(3.5, 5.5, 233, 15, 6), '#c2bce2', P.stoneShade, P.stoneLine, {
    off: [0, -4],
    inner: `<rect x="14" y="8" width="130" height="2.4" rx="1.2" fill="#fff" opacity="0.6"/>` +
      line('M70 13L74 16M176 12L171 16', P.stoneLine, 1.4, ' opacity="0.5"'),
  });
  // moss tufts hanging from the slab front edge and at the wall foot (never above y 9)
  const tuft = (x, y, w) => shape(`M${x - w} ${y}Q${x - w * 0.7} ${y + 6} ${x - w * 0.35} ${y + 3.5}Q${x} ${y + 8} ${x + w * 0.35} ${y + 3.5}Q${x + w * 0.7} ${y + 6} ${x + w} ${y}Q${x} ${y - 2} ${x - w} ${y}Z`, P.moss, P.mossShade, P.mossLine, { sw: 2, off: [0, -1.5] });
  s += tuft(30, 18.5, 11) + tuft(196, 18.5, 9) + tuft(160, 18.5, 6);
  s += shape('M16 62Q18 54 24 57Q28 52 33 58Q38 56 38 62Z', P.moss, P.mossShade, P.mossLine, { sw: 2, off: [0, -1.5] });
  s += shape('M206 62Q208 55 214 57Q219 53 224 62Z', P.moss, P.mossShade, P.mossLine, { sw: 2, off: [0, -1.5] });
  return s;
}

// ================================================================= FLAG (0 0 64 128; base 12,124)
function flag() {
  PFX = 'fl'; _id = 0;
  let s = '';
  s += shape(rrect(9.8, 13, 4.4, 109, 2.2), P.pole, P.woodShade, P.poleLine, { sw: 2.4, off: [-1.5, 0] });
  s += shape('M3 124Q3 114 12 114Q21 114 21 124Z', P.stone, P.stoneShade, P.stoneLine, { sw: 2.5, off: [0, -2] });
  // pennant with an apple mark
  const pd = 'M15 20Q36 26 57 35Q60 37 57 39Q36 47 15 54Z';
  const mark = `<path d="${applePath(30, 38, 7)}" fill="${P.stencil}"/><path d="M30.5 32.5L32 29" stroke="${P.stencil}" stroke-width="2" stroke-linecap="round"/>`;
  s += shape(pd, P.pennant, P.pennantShade, P.pennantLine, { off: [0, -4], inner: mark, sw: 2.5 });
  // little round lantern on top
  s += glow(12, 8, 11, P.lamp, 0.9, 0.4);
  s += shape(circ(12, 8.2, 5.6), P.lamp, P.lampShade, P.lampLine, { sw: 2.2, off: [-1, -1.5], hi: [10.2, 6.4, 1.8, 1.3, 0], hiOp: 0.95 });
  s += shape(rrect(8.5, 12.4, 7, 3, 1.4), P.brass, null, P.brassLine, { sw: 1.6 });
  return s;
}

// ================================================================= PIE (0 0 64 48)
function pieBody() {
  let s = '';
  // tin
  s += shape('M5 28H59L53 43Q52 45 49 45H15Q12 45 11 43Z', P.tin, P.tinShade, P.tinLine, { sw: 2.5, off: [-3, -2],
    inner: line('M17 32L19 43M27 32L28 43M37 32L36 43M47 32L45 43', P.tinShade, 1.6) });
  // crust dome with lattice
  const dome = 'M6 29C6 17 18 9 32 9C46 9 58 17 58 29Q32 34 6 29Z';
  let lat = `<path d="${dome}" fill="${P.filling}"/>`;
  for (let k = -3; k <= 4; k++) {
    const x = 10 + k * 10;
    lat += line(`M${x} 34L${x + 22} 4`, P.crustLine, 6.2) + line(`M${x} 34L${x + 22} 4`, P.crust, 4);
  }
  for (let k = -1; k <= 6; k++) {
    const x = 4 + k * 10;
    lat += line(`M${x} 4L${x + 22} 34`, P.crustLine, 6.2) + line(`M${x} 4L${x + 22} 34`, P.crust, 4);
  }
  lat += `<path d="${dome}" fill="${P.crustShade}" opacity="0.25" transform="translate(4 4)"/>`;
  s += shape(dome, P.filling, null, P.crustLine, { inner: lat, hi: [22, 15, 7, 2.4, -14], hiOp: 0.45 });
  // crimped rim
  s += shape(rrect(4, 26, 56, 6, 3), P.crust, P.crustShade, P.crustLine, { sw: 2.5, off: [0, -1.5],
    inner: line('M10 27V31M18 27V31M26 27V31M34 27V31M42 27V31M50 27V31', P.crustShade, 1.6) });
  return s;
}
function pie() { PFX = 'pi'; _id = 0; return pieBody(); }

// ================================================================= GRANNY BOO (0 0 96 160; centre 48,80; hem ~152)
function hemBody() {
  let d = 'M48 12C71 12 83 30 83 54C83 78 86 104 88 128C88.6 136 88.8 140 88 144';
  const n = 4, x0 = 88, x1 = 8, wseg = (x0 - x1) / n;
  for (let k = 0; k < n; k++) {
    const xa = x0 - k * wseg, xb = xa - wseg;
    d += `Q${f((xa + xb) / 2)} 158 ${f(xb)} 144`;
  }
  return d + 'C7.2 140 7.4 136 8 128C10 104 13 78 13 54C13 30 25 12 48 12Z';
}
function ghost(wave, prefix) {
  PFX = prefix; _id = 0;
  let s = '';
  const G = (d, o = {}) => shape(d, P.ghost, P.ghostShade, P.ghostLine, { off: [-5, -3], ...o });
  // waving arm behind the body edge (drawn first so its root tucks under the body)
  if (wave) {
    s += G('M72 94C80 88 81 76 80 64C77 58 79 50 85 50C91 50 92 58 89 64C90 78 88 92 78 102Z', { off: [-2, -2], sw: 2.8 });
    s += line('M78 44Q85 38 91 43', P.ghostLine, 2, ' opacity="0.55"') + line('M76 38Q85 30 92 36', P.ghostLine, 2, ' opacity="0.35"');
  }
  // body
  s += G(hemBody(), { hi: [30, 34, 6, 12, 20], hiOp: 0.7 });
  // bonnet
  const bon = 'M18 46C16 26 30 10 48 10C66 10 80 26 78 46C72 36 62 30 48 30C34 30 24 36 18 46Z';
  s += shape(bon, P.bonnet, P.bonnetShade, P.bonnetLine, { off: [-3, -3], hi: [34, 18, 7, 2.6, -24], hiOp: 0.55 });
  // frill along the bonnet front
  let fr = 'M19 45';
  for (let k = 0; k < 6; k++) { const xa = 19 + k * 10, xb = xa + 10; fr += `Q${xa + 5} ${k < 3 ? 33 - k * 2 : 27 + (k - 3) * 2} ${xb} ${k < 2 ? 38 - k * 4 : k < 4 ? 31 : 34 + (k - 4) * 5}`; }
  s += line(fr, '#fff', 3.4, ' opacity="0.9"');
  // little bow on the side
  s += shape('M70 20Q78 12 80 20Q78 28 70 20Z', P.bonnet, P.bonnetShade, P.bonnetLine, { sw: 2, off: [-1, -1] });
  s += shape('M70 20Q62 13 61 21Q63 28 70 20Z', P.bonnet, P.bonnetShade, P.bonnetLine, { sw: 2, off: [-1, -1] });
  s += `<circle cx="70" cy="20" r="2.6" fill="${P.bonnetShade}" stroke="${P.bonnetLine}" stroke-width="1.6"/>`;
  // face: kind eyes behind round glasses, cheeks, smile
  for (const x of [36, 60]) {
    s += `<ellipse cx="${x}" cy="60" rx="3.4" ry="4.2" fill="${P.ghostEye}"/><circle cx="${x - 1.1}" cy="58.4" r="1.3" fill="#fff"/>`;
    s += `<circle cx="${x}" cy="60" r="9" fill="#ffffff" fill-opacity="0.22" stroke="${P.ghostLine}" stroke-width="2.4"/>`;
    s += line(`M${x - 5.5} 55.5Q${x - 3} 53.2 ${x} 53.2`, '#fff', 1.6, ' opacity="0.9"');
  }
  s += line('M45 59Q48 57 51 59', P.ghostLine, 2.2);
  s += line('M27 59L21 57M69 59L75 57', P.ghostLine, 1.8, ' opacity="0.8"');
  s += `<ellipse cx="27" cy="73" rx="6" ry="3.6" fill="${P.cheek}" opacity="0.6"/><ellipse cx="69" cy="73" rx="6" ry="3.6" fill="${P.cheek}" opacity="0.6"/>`;
  s += line('M40 73.5Q48 81 56 73.5', P.ghostLine, 2.6) + `<path d="M44 76.6Q48 79.4 52 76.6Q50.5 80.4 48 80.4Q45.5 80.4 44 76.6Z" fill="${P.tongue}"/>`;
  // pie dish held in front
  s += `<g transform="translate(19 92) scale(0.9)">${pieBody()}</g>`;
  // little arms holding the dish
  s += G('M14 96C10 104 14 116 26 120C30 121 32 116 28 113C22 110 20 104 22 98Z', { off: [-2, -2], sw: 2.6 });
  if (!wave) s += G('M82 96C86 104 82 116 70 120C66 121 64 116 68 113C74 110 76 104 74 98Z', { off: [-2, -2], sw: 2.6 });
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
  const g = uid(), cl = uid();
  s += `<radialGradient id="${g}" cx="120" cy="96" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5a3fa8"/><stop offset="0.6" stop-color="${P.night}"/><stop offset="1" stop-color="${P.night2}"/></radialGradient>`;
  s += `<circle cx="128" cy="128" r="122" fill="url(#${g})" stroke="${P.badgeLine}" stroke-width="6"/>`;
  s += `<clipPath id="${cl}"><circle cx="128" cy="128" r="119"/></clipPath><g clip-path="url(#${cl})">`;
  // stars
  for (const [x, y, r] of [[100, 34, 2.2], [176, 30, 2.4], [30, 132, 1.8], [228, 104, 2], [150, 54, 1.6], [64, 92, 1.6]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.85"/>`;
  // crescent moon (top-left) with a sleepy smile
  const moon = 'M62 38A25 25 0 1 0 84 80A20 20 0 1 1 62 38Z';
  s += glow(60, 64, 36, '#fff1b0', 0.35, 0.12);
  s += shape(moon, P.moon, P.moonShade, P.moonLine, { off: [-3, -3] });
  s += line('M45 64Q48 67 51 64', P.moonLine, 2.4) + `<ellipse cx="48" cy="72" rx="3" ry="1.8" fill="${P.cheek}" opacity="0.6"/>`;
  // cute crooked turret (right)
  s += shape('M196 250L200 120Q212 116 224 120L232 250Z', '#9d94c8', '#7f76b0', '#4e4680', { off: [-4, 0] });
  s += shape('M192 124Q206 70 222 66Q230 92 236 126Q214 118 192 124Z', '#c77fb8', '#a55e98', '#6a3466', { off: [-3, 0] });
  s += line('M222 66L230 54', '#6a3466', 2.4) + shape('M230 54L246 58L231 64Z', P.pennant, null, P.pennantLine, { sw: 2 });
  s += shape(rrect(207, 146, 14, 20, 7), '#ffd86a', '#f0b040', '#7a5418', { sw: 2.5, off: [-1, -1] });
  // hill
  s += `<path d="M0 232Q128 206 256 232V256H0Z" fill="#3a5a6a"/>`;
  // two crates
  const cw = 69, ch = 46, cx = 128;
  const cr = (i, x, y) => `<g transform="translate(${x} ${y}) scale(${cw / 120} ${ch / 80})">${crate(i)}</g>`;
  s += cr(1, cx - cw / 2 - 2, 198) + cr(0, cx - cw / 2 + 3, 198 - ch + 1);
  s += `</g>`;
  // Ziggy (happy) in her rocket, holding an apple
  const z = ziggy('happy', 'icz');
  s += `<g transform="translate(52 6) scale(0.95)">${z}`;
  s += `<g transform="translate(83 72) scale(0.42)">${apple(0, 'ica')}</g></g>`;
  return s;
}

// ================================================================= write
function write(name, w, h, body) {
  fs.writeFileSync(path.join(OUT, name), svg(w, h, body));
  console.log('wrote', name);
}
fs.mkdirSync(OUT, { recursive: true });
for (const fr of ['idle', 'drop', 'happy', 'oops']) write(`ziggy_${fr}.svg`, 160, 160, ziggy(fr, 'z' + fr[0]));
write('beam.svg', 80, 120, beam());
for (let i = 0; i < 4; i++) write(`crate_${i}.svg`, 120, 80, crate(i));
write('lantern.svg', 48, 64, lantern());
write('apple_0.svg', 64, 64, apple(0, 'p0'));
write('apple_1.svg', 64, 64, apple(1, 'p1'));
write('apple_glow.svg', 64, 64, appleGlow());
write('base.svg', 240, 64, base());
write('flag.svg', 64, 128, flag());
write('ghost.svg', 96, 160, ghost(false, 'g0'));
write('ghost_wave.svg', 96, 160, ghost(true, 'g1'));
write('heart.svg', 48, 48, heart(true));
write('heart_empty.svg', 48, 48, heart(false));
write('pie.svg', 64, 48, pie());
write('icon.svg', 256, 256, icon());
// remove the fox-moon-stack leftovers
for (const old of ['juno_idle.svg', 'juno_drop.svg', 'juno_happy.svg', 'juno_oops.svg', 'coin_0.svg', 'coin_1.svg', 'coin_2.svg', 'rocket.svg', 'flame.svg']) {
  const p = path.join(OUT, old);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('removed', old); }
}
