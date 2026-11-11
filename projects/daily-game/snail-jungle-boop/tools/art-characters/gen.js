// Zippy's Jungle Boop — character & HUD art generator (DESIGN.md §2, §3, §4 "Characters").
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette ----------
const C = {
  // Zippy
  skin: '#ffc9a3', skinS: '#f2a47e', skinO: '#b5603c', skinL: '#ffe7d4',
  shell: '#ee8a3c', shellS: '#cf6b25', shellO: '#86400f', shellL: '#ffc27e', shellBand: '#ffe2b0',
  metal: '#c3cedb', metalS: '#94a3b8', metalO: '#4b586d', metalL: '#f1f5fa', rivet: '#ffd36b',
  bulb: '#ffffff', bulbO: '#9aa6b5',
  // shared face
  eye: '#2a1d33', mouth: '#8a2f4a', tongue: '#ff8fa6', blush: '#ff8fae', white: '#ffffff',
  // monkey
  fur: '#a0623a', furS: '#844a29', furO: '#55301a', furL: '#c88a5c',
  tan: '#f7d6aa', tanS: '#e9b986', tanO: '#9a6438', palm: '#efc394',
  // frog (turquoise, cream belly — distinct from jungle greens and the stars)
  frog: '#35c9c3', frogS: '#1fa3a5', frogO: '#0f5f6b', frogL: '#9af0e8', cream: '#fff3cf', creamS: '#f0d99a', pad: '#7fe6df',
  // toucan
  ink: '#2e2b3d', inkS: '#211e2e', inkO: '#13111c', inkL: '#57527a',
  bib: '#fffaf0', bibS: '#eadfc8', beak: '#ff9a26', beakS: '#ee7414', beakO: '#8f430c', beakL: '#ffd27a', beakTip: '#e5532a', ring: '#ffb648',
  // leaf
  leaf: '#63d449', leafS: '#3fae35', leafO: '#226e1f', leafL: '#b8f28c',
};
// star palette (DESIGN §3) + derived shades
const STARS = [
  { fill: '#ff5d73', shade: '#e63d58', out: '#a3223a', light: '#ffb3bf', emblem: 'heart' },
  { fill: '#ffc93c', shade: '#f0a91c', out: '#9a6608', light: '#fff0b0', emblem: 'sun' },
  { fill: '#3fa7ff', shade: '#2185e6', out: '#14508f', light: '#b6dcff', emblem: 'drop' },
  { fill: '#a46bff', shade: '#8549eb', out: '#4f2596', light: '#dcc6ff', emblem: 'moon' },
];

// ---------- helpers ----------
const f = n => +n.toFixed(2);
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
const E = (cx, cy, rx, ry, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${extra}/>`;
const Er = (cx, cy, rx, ry, rot, extra = '') => E(cx, cy, rx, ry, ` transform="rotate(${rot} ${cx} ${cy})"${extra}`);
const Ci = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${extra}/>`;
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
// silhouette: shapes stroked thick in the outline colour, then filled on top → one clean outer outline of w px
const sil = (shapes, fill, out, w = 3, tr = '') =>
  `<g${tr ? ` transform="${tr}"` : ''}><g fill="${out}" stroke="${out}" stroke-width="${2 * w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="${fill}">${shapes}</g></g>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
// rounded tube (limb) with outline
const tube = (d, w, col, out, ow = 3) => line(d, out, w + 2 * ow) + line(d, col, w);
// clip helper (ids are unique per file via prefix)
const clip = (id, shapes) => `<clipPath id="${id}">${shapes}</clipPath>`;

// ---------- shared faces ----------
// big glossy eye (dark iris, two highlights)
const eyeOpen = (cx, cy, rx, ry, lx = 0, ly = 0) =>
  E(cx, cy, rx, ry, ` fill="${C.eye}"`) +
  E(f(cx + lx - rx * 0.32), f(cy + ly - ry * 0.36), f(rx * 0.42), f(ry * 0.36), ` fill="#fff"`) +
  Ci(f(cx + lx + rx * 0.36), f(cy + ly + ry * 0.38), f(rx * 0.18), ` fill="#fff" opacity=".85"`);
// surprised eye: white with a small pupil
const eyeWow = (cx, cy, rx, ry, out) =>
  E(cx, cy, rx, ry, ` fill="#fff" stroke="${out}" stroke-width="2.2"`) +
  Ci(cx, f(cy + 0.5), f(Math.min(rx, ry) * 0.42), ` fill="${C.eye}"`) +
  Ci(f(cx - rx * 0.12), f(cy - ry * 0.12), f(Math.min(rx, ry) * 0.14), ` fill="#fff"`);
// giggle eye: ^ arc
const eyeHappy = (cx, cy, w, col = C.eye, sw = 3.2) =>
  line(`M${cx - w},${cy + w * 0.35} Q${cx},${cy - w * 0.9} ${cx + w},${cy + w * 0.35}`, col, sw);
const blush = (cx, cy, rx = 7, ry = 4.2, op = 0.75) => E(cx, cy, rx, ry, ` fill="${C.blush}" opacity="${op}"`);
// open laughing mouth (D shape) from x0..x1 at y, depth d
const mouthOpen = (x0, x1, y, d, out = C.mouth) => {
  const cx = (x0 + x1) / 2;
  const shape = `M${x0},${y} Q${cx},${y - 2} ${x1},${y} Q${x1 - 1},${y + d} ${cx},${y + d} Q${x0 + 1},${y + d} ${x0},${y} Z`;
  const id = 'm' + (Math.random() * 1e9 | 0);
  return `<defs>${clip(id, P(shape))}</defs>` +
    P(shape, ` fill="${C.mouth}" stroke="${out}" stroke-width="2.2" stroke-linejoin="round"`) +
    `<g clip-path="url(#${id})">${E(cx, y + d, (x1 - x0) * 0.3, d * 0.5, ` fill="${C.tongue}"`)}</g>`;
};
const mouthO = (cx, cy, rx, ry, out = C.mouth) =>
  E(cx, cy, rx, ry, ` fill="${C.mouth}" stroke="${out}" stroke-width="2.2"`) + E(cx, f(cy + ry * 0.45), f(rx * 0.55), f(ry * 0.35), ` fill="${C.tongue}"`);
const smile = (x0, x1, y, d, col, sw = 2.8) => line(`M${x0},${y} Q${(x0 + x1) / 2},${y + d} ${x1},${y}`, col, sw);

// deterministic ids: replace random ids per file afterwards
const fixIds = (s, prefix) => {
  let n = 0; const map = {};
  return s.replace(/id="(m\d+)"/g, (_, id) => { map[id] = prefix + 'm' + (n++); return `id="${map[id]}"`; })
    .replace(/url\(#(m\d+)\)/g, (_, id) => `url(#${map[id]})`);
};

// =====================================================================
// Zippy (160×140): facing right; body centre (80,82); nozzle exit (34,104); antenna tips (114,20), (132,30)
// =====================================================================
const Z = { headX: 122, headY: 62, headR: 25 };
const ZIPPY_FOOT = E(92, 112, 50, 12) + P('M60,102 Q40,104 33,118 Q46,124 66,123 Z');
const ZIPPY_NECK = P('M102,112 C98,94 102,80 110,74 L136,78 C143,92 144,104 141,112 Z');
const ZIPPY_HEAD = Ci(Z.headX, Z.headY, Z.headR);
const SHELL = { cx: 70, cy: 70, r: 33 };

function zippyJetpack(p) {
  // canister rotated 20° so its axis points down-left; nozzle exit (local 0,30) lands exactly on (34,104)
  const can = `<rect x="-12" y="-22" width="24" height="42" rx="10"/>`;
  const fin = P('M-10,2 L-20,13 L-19,22 L-10,16 Z');
  const noz = P('M-7,17 L7,17 L9.5,30 L-9.5,30 Z');
  const a = 20 * Math.PI / 180, ox = f(34 + 30 * Math.sin(a)), oy = f(104 - 30 * Math.cos(a));
  return `<g transform="translate(${ox} ${oy}) rotate(20)">` +
    sil(fin, C.metalS, C.metalO) +
    sil(noz, C.metalS, C.metalO) + `<rect x="-9.5" y="27.6" width="19" height="2.4" fill="${C.metalO}"/>` +
    sil(can, C.metal, C.metalO) +
    `<defs>${clip(p + 'jc', can)}</defs><g clip-path="url(#${p}jc)">` +
    `<rect x="4" y="-24" width="10" height="46" fill="${C.metalS}"/>` +
    `<rect x="-12" y="2" width="24" height="5" fill="${C.shell}"/><rect x="-12" y="7" width="24" height="1.6" fill="${C.shellS}"/></g>` +
    `<rect x="-7" y="-17" width="3.6" height="16" rx="1.8" fill="${C.metalL}"/>` +
    Ci(0, -12, 2, ` fill="${C.rivet}" stroke="${C.metalO}" stroke-width="1.2"`) + `</g>`;
}

function zippyShell(p) {
  const { cx, cy, r } = SHELL;
  // spiral from the centre outward (Archimedean), drawn as one stroke
  let d = '';
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, a = -Math.PI / 2 + t * Math.PI * 4.1, rr = 3 + t * (r - 9);
    const x = cx + 2 + Math.cos(a) * rr, y = cy + 2 + Math.sin(a) * rr;
    d += (i ? ' L' : 'M') + f(x) + ',' + f(y);
  }
  return sil(Ci(cx, cy, r), C.shell, C.shellO) +
    `<defs>${clip(p + 'sc', Ci(cx, cy, r))}</defs><g clip-path="url(#${p}sc)">` +
    Ci(cx + 7, cy + 9, r, ` fill="${C.shellS}"`) + Ci(cx - 2, cy - 3, r - 3, ` fill="${C.shell}"`) + `</g>` +
    line(d, C.shellBand, 5.5) + line(d, C.shellO, 2.4) +
    Er(cx - 17, cy - 17, 7, 4, -40, ` fill="${C.shellL}" opacity=".9"`) + Ci(cx - 25, cy - 4, 2.4, ` fill="${C.shellL}" opacity=".9"`);
}

function zippyBody(p) {
  // foot + tail + neck as one silhouette, then shading, then the head on top of the shell
  const bodyClip = ZIPPY_FOOT + ZIPPY_NECK;
  return sil(ZIPPY_FOOT + ZIPPY_NECK, C.skin, C.skinO) +
    `<defs>${clip(p + 'bc', bodyClip)}</defs><g clip-path="url(#${p}bc)">` +
    E(92, 124, 56, 7, ` fill="${C.skinS}"`) + line('M48,108 Q90,101 132,104', C.skinL, 3, ' opacity=".9"') + `</g>`;
}

function zippyHead(p) {
  const { headX: x, headY: y, headR: r } = Z;
  return sil(ZIPPY_HEAD, C.skin, C.skinO) +
    `<defs>${clip(p + 'hc', ZIPPY_HEAD)}</defs><g clip-path="url(#${p}hc)">` +
    Ci(x + 6, y + 8, r, ` fill="${C.skinS}"`) + Ci(x - 2, y - 2, r - 1.5, ` fill="${C.skin}"`) + `</g>` +
    Er(x - 12, y - 14, 6, 3.4, -35, ` fill="${C.skinL}"`);
}

function zippyAntennae() {
  // stalks behind the goggles, bulbs at the contract points
  return tube('M112,44 Q108,32 114,20', 4.2, C.skin, C.skinO, 2.6) +
    tube('M128,42 Q128,35 132,30', 4.2, C.skin, C.skinO, 2.6) +
    sil(Ci(132, 30, 5), C.bulb, C.bulbO, 2.4) + Ci(130.6, 28.4, 1.6, ` fill="#fff"`) +
    sil(Ci(114, 20, 5.6), C.bulb, C.bulbO, 2.4) + Ci(112.4, 18.2, 1.8, ` fill="#fff"`);
}

const ZFACE = {
  idle: () => eyeOpen(113, 63, 6.6, 8.6, 0.6) + eyeOpen(131, 62, 6.2, 8.2, 0.6) +
    blush(103, 74, 5.5, 3.4) + blush(142, 72, 4.5, 3.4) + smile(118, 132, 75, 6, C.skinO),
  fly: () => // eyes looking ahead with a determined brow, open grin
    eyeOpen(114, 63, 6.6, 8.6, 1.6) + eyeOpen(132, 62, 6.2, 8.2, 1.6) +
    line('M107,53.5 Q113,51 119,53', C.skinO, 2.4) + line('M127,52.5 Q132,51 137,53', C.skinO, 2.4) +
    blush(103, 74, 5.5, 3.4) + blush(142, 72, 4.5, 3.4) + mouthOpen(117, 135, 73, 9, C.skinO),
  boop: () => eyeHappy(113, 63, 6) + eyeHappy(131, 62, 5.6) +
    blush(103, 73, 6.5, 4, 0.9) + blush(142, 71, 5, 4, 0.9) + mouthOpen(115, 135, 72, 11, C.skinO),
  dizzy: () => {
    const sw = (cx, cy, r) => { let d = ''; for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 3.6, rr = 0.6 + t * r; d += (i ? ' L' : 'M') + f(cx + Math.cos(a) * rr) + ',' + f(cy + Math.sin(a) * rr); } return d; };
    return E(113, 63, 7, 8.6, ` fill="#fff" stroke="${C.skinO}" stroke-width="2"`) + E(131, 62, 6.6, 8.2, ` fill="#fff" stroke="${C.skinO}" stroke-width="2"`) +
      line(sw(113, 63, 5.6), C.eye, 2) + line(sw(131, 62, 5.2), C.eye, 2) +
      line('M116,77 Q119,73 122,77 Q125,81 128,77 Q131,73 134,77', C.skinO, 2.6);
  },
};

function zippy(frame) {
  const p = 'z' + frame;
  let extra = '';
  if (frame === 'dizzy') // little wobble swirls around the head (not stars, to avoid confusion with gameplay stars)
    extra = line('M96,34 q4,-6 8,0 q4,6 8,0', C.skinO, 2.2, ' opacity=".7"') + line('M140,40 q3,-5 6,0 q3,5 6,0', C.skinO, 2.2, ' opacity=".7"');
  if (frame === 'fly') // speed streaks behind
    extra = line('M10,70 L26,70', '#ffffff', 3, ' opacity=".85"') + line('M4,84 L22,84', '#ffffff', 3, ' opacity=".7"') + line('M12,56 L24,56', '#ffffff', 3, ' opacity=".6"');
  if (frame === 'boop') // happy sparkle ticks
    extra = line('M148,46 L155,40', C.skinO, 2.4) + line('M150,58 L158,57', C.skinO, 2.4) + line('M144,36 L146,28', C.skinO, 2.4);
  const s = extra + zippyBody(p) + zippyJetpack(p) + zippyShell(p) + zippyAntennae() + zippyHead(p) + ZFACE[frame]();
  return fixIds(svg(160, 140, s), p);
}

// =====================================================================
// Critters (140×150): body bottom y150, head top ≈ y8; star at (70,96); paws at ≈ (40,100) & (100,100)
// =====================================================================
const mirror = g => `<g transform="translate(140 0) scale(-1 1)">${g}</g>`;
const both = g => g + mirror(g);

// ---------- monkey ----------
const MK = {
  torso: P('M30,150 C28,116 40,90 70,88 C100,90 112,116 110,150 Z'),
  head: Ci(70, 48, 36) + Er(63, 15, 6, 9, -22) + Er(73, 12.5, 5.5, 9.5, 12),
  ears: Ci(29, 52, 14) + Ci(111, 52, 14),
  mask: Ci(56, 47, 16) + Ci(84, 47, 16) + E(70, 65, 25, 16.5),
};
function monkeyBody(p) {
  const tail = 'M108,132 C132,130 138,104 124,94 C114,88 106,98 115,104';
  return tube(tail, 8, C.fur, C.furO) +
    sil(MK.ears, C.fur, C.furO) + Ci(29, 52, 8, ` fill="${C.tan}"`) + Ci(111, 52, 8, ` fill="${C.tan}"`) +
    Ci(31, 54, 4, ` fill="${C.tanS}"`) + Ci(109, 54, 4, ` fill="${C.tanS}"`) +
    sil(MK.torso, C.fur, C.furO) +
    `<defs>${clip(p + 'tc', MK.torso)}</defs><g clip-path="url(#${p}tc)">${E(96, 130, 22, 40, ` fill="${C.furS}"`)}</g>` +
    E(70, 128, 25, 24, ` fill="${C.tan}"`) +
    // arms reach round to the paws (the paws themselves are in monkey_paws.svg)
    both(tube('M38,95 C22,99 22,110 37,106', 12, C.fur, C.furO)) +
    sil(MK.head, C.fur, C.furO) +
    `<defs>${clip(p + 'hc', MK.head)}</defs><g clip-path="url(#${p}hc)">${Ci(80, 58, 36, ` fill="${C.furS}"`)}${Ci(68, 45, 34, ` fill="${C.fur}"`)}</g>` +
    Er(52, 24, 7, 3.6, -35, ` fill="${C.furL}"`) +
    sil(MK.mask, C.tan, C.tanO, 1.6) +
    `<defs>${clip(p + 'mc', MK.mask)}</defs><g clip-path="url(#${p}mc)">${E(70, 82, 26, 8, ` fill="${C.tanS}"`)}</g>` +
    // nose
    E(70, 59, 5.5, 3.4, ` fill="${C.furO}"`) + E(68.6, 58, 1.8, 1, ` fill="#fff" opacity=".6"`);
}
const MFACE = {
  up: () => eyeOpen(57, 46, 6.8, 8.6, 0.4) + eyeOpen(83, 46, 6.8, 8.6, 0.4) + blush(44, 60) + blush(96, 60) + smile(59, 81, 66, 8, C.furO, 3),
  happy: () => eyeHappy(57, 47, 6.4) + eyeHappy(83, 47, 6.4) + blush(44, 59, 8, 5, 0.95) + blush(96, 59, 8, 5, 0.95) + mouthOpen(58, 82, 65, 12, C.furO),
  wow: () => eyeWow(57, 45, 8, 9.5, C.tanO) + eyeWow(83, 45, 8, 9.5, C.tanO) +
    line('M48,31 Q56,27 63,30', C.furO, 2.6) + line('M77,30 Q84,27 92,31', C.furO, 2.6) + mouthO(70, 70, 5.5, 6.5),
};
function monkeyPaw() {
  // mitten paw cupping the star's left side; three fingers curl over the star front
  const fingers = Er(50, 91, 4.6, 3.6, -25) + Er(53, 98.5, 4.8, 3.6, 0) + Er(51, 106, 4.6, 3.6, 25);
  const palm = Er(41, 99, 10, 11, 10);
  return sil(fingers + palm, C.palm, C.furO) + Ci(40, 99, 6, ` fill="${C.tan}"`) +
    line('M48,95 L51,95.6 M49.6,102.4 L52.8,102.6', C.tanO, 1.4, ' opacity=".7"') +
    Er(37, 93, 3, 2, -30, ` fill="#fff" opacity=".55"`);
}

// ---------- frog ----------
const FR = {
  torso: P('M28,150 C26,118 38,92 70,90 C102,92 114,118 112,150 Z'),
  head: E(70, 60, 53, 30) + Ci(41, 30, 19.5) + Ci(99, 30, 19.5),
};
function frogBody(p) {
  return sil(FR.torso, C.frog, C.frogO) +
    `<defs>${clip(p + 'tc', FR.torso)}</defs><g clip-path="url(#${p}tc)">${E(98, 132, 20, 44, ` fill="${C.frogS}"`)}</g>` +
    E(70, 126, 30, 30, ` fill="${C.cream}"`) + E(70, 148, 30, 10, ` fill="${C.creamS}"`) +
    both(tube('M36,97 C22,101 22,110 35,106', 12, C.frog, C.frogO)) +
    sil(FR.head, C.frog, C.frogO) +
    `<defs>${clip(p + 'hc', FR.head)}</defs><g clip-path="url(#${p}hc)">` +
    E(72, 92, 52, 14, ` fill="${C.frogS}"`) + E(70, 80, 40, 6, ` fill="${C.cream}" opacity=".85"`) + `</g>` +
    // spots + shine
    Ci(70, 39, 4, ` fill="${C.frogS}"`) + Ci(60, 43, 2.4, ` fill="${C.frogS}"`) + Ci(80, 43, 2.4, ` fill="${C.frogS}"`) +
    Ci(19.5, 52, 2.6, ` fill="${C.frogS}"`) + Ci(120.5, 52, 2.6, ` fill="${C.frogS}"`) +
    Er(28, 16, 5, 2.8, -35, ` fill="${C.frogL}"`) + Er(86, 16, 5, 2.8, -35, ` fill="${C.frogL}"`) +
    // nostrils
    E(64, 53, 1.8, 1.3, ` fill="${C.frogO}"`) + E(76, 53, 1.8, 1.3, ` fill="${C.frogO}"`);
}
// eye sockets on the bumps: white eyeball, big glossy pupil
const frogEyeBall = (cx, cy) => Ci(cx, cy, 13, ` fill="#fff" stroke="${C.frogO}" stroke-width="2"`);
const FFACE = {
  up: () => frogEyeBall(41, 31) + frogEyeBall(99, 31) + eyeOpen(42, 32, 8.6, 9.6, 0.4) + eyeOpen(98, 32, 8.6, 9.6, 0.4) +
    blush(33, 66, 8, 4.6, 0.95) + blush(107, 66, 8, 4.6, 0.95) + smile(44, 96, 64, 15, C.frogO, 3.2),
  happy: () => eyeHappy(41, 32, 8.5, C.frogO, 3.6) + eyeHappy(99, 32, 8.5, C.frogO, 3.6) +
    blush(33, 64, 9, 5.4, 0.95) + blush(107, 64, 9, 5.4, 0.95) + mouthOpen(48, 92, 63, 15, C.frogO),
  wow: () => frogEyeBall(41, 30) + frogEyeBall(99, 30) + Ci(41, 31, 4.6, ` fill="${C.eye}"`) + Ci(99, 31, 4.6, ` fill="${C.eye}"`) +
    Ci(39.6, 29.4, 1.6, ` fill="#fff"`) + Ci(97.6, 29.4, 1.6, ` fill="#fff"`) + mouthO(70, 70, 7, 7.5, C.frogO),
};
function frogPaw() {
  // three long fingers with round sticky pads resting on the star
  const palm = Er(39, 100, 9, 9.5, 0);
  const fingers = tube('M41,98 L52,90', 4.6, C.frog, C.frogO, 3) + tube('M42,100 L53,99.5', 4.6, C.frog, C.frogO, 3) + tube('M41,102 L52,109', 4.6, C.frog, C.frogO, 3);
  const pads = Ci(52.5, 89.5, 4) + Ci(53.5, 99.5, 4) + Ci(52.5, 109.5, 4);
  return sil(palm, C.frog, C.frogO) + fingers + sil(pads, C.pad, C.frogO, 2.4) +
    `<g fill="${C.frog}">${Er(39, 100, 9, 9.5, 0)}${P('M41,98 L52,90 M42,100 L53,99.5 M41,102 L52,109', ` stroke="${C.frog}" stroke-width="4.6" stroke-linecap="round"`)}</g>` +
    Ci(52.5, 89.5, 4, ` fill="${C.pad}"`) + Ci(53.5, 99.5, 4, ` fill="${C.pad}"`) + Ci(52.5, 109.5, 4, ` fill="${C.pad}"`) +
    Er(36, 95, 3, 2, -30, ` fill="#fff" opacity=".55"`);
}

// ---------- toucan ----------
const TC = {
  torso: P('M30,150 C28,114 40,88 68,86 C98,88 112,116 110,150 Z'),
  head: Ci(64, 50, 35) + Er(56, 16, 5, 10, -28) + Er(66, 13, 4.5, 9, 6),
  bib: 'M38,62 C36,88 48,112 70,120 C92,112 100,90 96,66 C82,76 52,76 38,62 Z',
};
const BEAK_UP = 'M60,50 C84,36 116,40 132,70 C118,64 92,62 64,64 Z';
const BEAK_LO = 'M64,64 C90,62 112,64 130,71 C114,80 88,80 66,72 Z';
function toucanBeak(p, open) {
  // lower mandible rotates down around its hinge (64,68) when open
  const lo = open ? `<g transform="rotate(${open} 64 68)">${P(BEAK_LO)}</g>` : P(BEAK_LO);
  const loClip = open ? `<g transform="rotate(${open} 64 68)">${P(BEAK_LO)}</g>` : P(BEAK_LO);
  const mouthIn = open ? P(`M64,64 L130,70 L${open > 10 ? 118 : 124},${open > 10 ? 88 : 80} Z`, ` fill="${C.mouth}"`) : '';
  return `<g transform="translate(1 8)">` + mouthIn +
    sil(lo, C.beakL, C.beakO) +
    `<defs>${clip(p + 'bl', loClip)}</defs><g clip-path="url(#${p}bl)">${Ci(136, 80, 18, ` fill="${C.beakTip}"`)}${E(92, 80, 40, 6, ` fill="${C.beak}" opacity=".7"`)}</g>` +
    sil(P(BEAK_UP), C.beak, C.beakO) +
    `<defs>${clip(p + 'bu', P(BEAK_UP))}</defs><g clip-path="url(#${p}bu)">` +
    Ci(140, 70, 20, ` fill="${C.beakTip}"`) + E(96, 66, 40, 5, ` fill="${C.beakS}"`) + `</g>` +
    line('M72,47 Q96,42 116,52', C.beakL, 3.2, ' opacity=".9"') +
    E(70, 52, 1.6, 1.2, ` fill="${C.beakO}"`) + `</g>`;
}
function toucanBody(p) {
  return sil(TC.torso, C.ink, C.inkO) +
    `<defs>${clip(p + 'tc', TC.torso)}</defs><g clip-path="url(#${p}tc)">${E(98, 132, 18, 44, ` fill="${C.inkS}"`)}</g>` +
    both(tube('M36,96 C22,100 22,110 35,106', 12, C.ink, C.inkO)) +
    sil(TC.head, C.ink, C.inkO) +
    Er(44, 26, 7, 3.6, -40, ` fill="${C.inkL}"`) +
    P(TC.bib, ` fill="${C.bib}"`) +
    `<defs>${clip(p + 'bc', P(TC.bib))}</defs><g clip-path="url(#${p}bc)">${E(84, 118, 22, 16, ` fill="${C.bibS}"`)}</g>` +
    // little yellow throat tint, typical of toucans
    E(68, 84, 18, 9, ` fill="#fff1b8" opacity=".9"`);
}
const TEYE = (cx, cy) => Ci(cx, cy, 10.5, ` fill="${C.ring}" stroke="${C.beakO}" stroke-width="1.6"`);
const TFACE = {
  up: p => TEYE(46, 44) + TEYE(76, 41) + eyeOpen(46, 44, 6.4, 7.4, 0.3) + eyeOpen(76, 41, 6.4, 7.4, 0.3) +
    blush(36, 62, 6.5, 4) + toucanBeak(p, 0) + line('M65,72 Q67,77 73,75', C.beakO, 2.4),
  happy: p => TEYE(46, 44) + TEYE(76, 41) + eyeHappy(46, 45, 6, C.eye, 3.2) + eyeHappy(76, 42, 6, C.eye, 3.2) +
    blush(34, 61, 8, 5, 0.95) + toucanBeak(p, 9),
  wow: p => TEYE(46, 44) + TEYE(76, 41) + eyeWow(46, 44, 7.4, 8.4, C.beakO) + eyeWow(76, 41, 7.4, 8.4, C.beakO) +
    line('M37,30 Q45,25 53,29', C.inkL, 2.6) + line('M68,26 Q76,22 85,26', C.inkL, 2.6) + toucanBeak(p, 16),
};
function toucanPaw() {
  // a wing tip of three fanned feathers wrapping the star's side
  const feathers = Er(47, 92, 10.5, 4.6, 24) + Er(50, 100, 11.5, 4.8, 4) + Er(47, 108, 10.5, 4.6, -18);
  const base = Er(37, 100, 9.5, 11, 0);
  // feathers a step lighter than the body so they read over the chest and the star; pale tips grip the star
  const tips = Er(54.5, 95, 3.6, 3, 24) + Er(58.5, 100.6, 3.8, 3.1, 4) + Er(54.5, 105.6, 3.6, 3, -18);
  toucanPaw.defs = clip('tpf', feathers); // clip in user space: one definition serves both mirrored wings
  return sil(base + feathers, '#433d5e', C.inkO) +
    `<g clip-path="url(#tpf)">${tips.replace(/\/>/g, ` fill="${C.bibS}"/>`)}</g>` +
    line('M41,95.5 L50,96.6 M42,100.5 L52,100.8 M41,105.5 L50,105', C.inkL, 1.6) +
    Er(34, 94, 3, 2, -30, ` fill="${C.inkL}"`);
}

const KINDS = {
  monkey: { body: monkeyBody, face: MFACE, paw: monkeyPaw },
  frog: { body: frogBody, face: FFACE, paw: frogPaw },
  toucan: { body: toucanBody, face: TFACE, paw: toucanPaw },
};
function critter(kind, frame) {
  const K = KINDS[kind], p = kind[0] + frame[0];
  // paws slide 3.5 px outward so the fingers grip the star's sides without hiding its colour
  if (frame === 'paws') { const g = both(`<g transform="translate(-3.5 0)">${K.paw()}</g>`); return fixIds(svg(140, 150, g, K.paw.defs || ''), p); }
  return fixIds(svg(140, 150, K.body(p) + K.face[frame](p)), p);
}

// =====================================================================
// Stars (64×64), emblems, rainbow
// =====================================================================
const SC = { x: 32, y: 34 };
function starPath(cx, cy, R, r, rotDeg = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (-90 + rotDeg + i * 36) * Math.PI / 180, rr = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // round every vertex with a quadratic, more on the tips than in the notches
  let d = '';
  for (let i = 0; i < 10; i++) {
    const V = pts[i], A = pts[(i + 9) % 10], B = pts[(i + 1) % 10], t = i % 2 ? 0.2 : 0.34;
    const a = [V[0] + (A[0] - V[0]) * t, V[1] + (A[1] - V[1]) * t], b = [V[0] + (B[0] - V[0]) * t, V[1] + (B[1] - V[1]) * t];
    d += (i ? ' L' : 'M') + f(a[0]) + ',' + f(a[1]) + ' Q' + f(V[0]) + ',' + f(V[1]) + ' ' + f(b[0]) + ',' + f(b[1]);
  }
  return d + ' Z';
}
const STAR_D = starPath(SC.x, SC.y, 30, 17.5);
function emblem(kind, out) {
  const o = ` fill="#fff" stroke="${out}" stroke-width="1.8" stroke-linejoin="round"`;
  const { x, y } = SC; // centre
  if (kind === 'heart') return P(`M${x},${y + 10} C${x - 14},${y + 1} ${x - 13},${y - 10} ${x - 6},${y - 10} C${x - 2.5},${y - 10} ${x},${y - 7.5} ${x},${y - 5.5} C${x},${y - 7.5} ${x + 2.5},${y - 10} ${x + 6},${y - 10} C${x + 13},${y - 10} ${x + 14},${y + 1} ${x},${y + 10} Z`, o);
  if (kind === 'sun') {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      rays += `M${f(x + c * 8.6)},${f(y + s * 8.6)} L${f(x + c * 12)},${f(y + s * 12)} `;
    }
    return line(rays, out, 5.4) + line(rays, '#fff', 2.6) + Ci(x, y, 6.6, o);
  }
  if (kind === 'drop') return P(`M${x},${y - 12} C${x + 4},${y - 5} ${x + 8.5},${y - 1} ${x + 8.5},${y + 3.5} A8.5,8.5 0 0 1 ${x - 8.5},${y + 3.5} C${x - 8.5},${y - 1} ${x - 4},${y - 5} ${x},${y - 12} Z`, o) +
    E(x - 3.4, y + 3, 1.6, 2.6, ` fill="${out}" opacity=".25"`);
  if (kind === 'moon') {
    // crescent = outer circle minus an offset inner circle (computed intersections)
    const R = 11, cx = x - 1, cy = y, r = 9, ix = cx + 6, iy = cy - 4;
    const dx = ix - cx, dy = iy - cy, dd = Math.hypot(dx, dy);
    const a = (R * R - r * r + dd * dd) / (2 * dd), h = Math.sqrt(R * R - a * a);
    const mx = cx + a * dx / dd, my = cy + a * dy / dd;
    const p1 = [mx + h * dy / dd, my - h * dx / dd], p2 = [mx - h * dy / dd, my + h * dx / dd];
    return P(`M${f(p1[0])},${f(p1[1])} A${R},${R} 0 1 0 ${f(p2[0])},${f(p2[1])} A${r},${r} 0 0 1 ${f(p1[0])},${f(p1[1])} Z`, o);
  }
  return '';
}
function starBody(p, fill, shade, out, light) {
  return P(STAR_D, ` fill="${out}" stroke="${out}" stroke-width="6" stroke-linejoin="round"`) +
    `<defs>${clip(p + 'sc', P(STAR_D))}</defs><g clip-path="url(#${p}sc)">` +
    `<rect width="64" height="64" fill="${shade}"/>` +
    `<g transform="translate(${SC.x} ${SC.y - 3}) scale(.9) translate(${-SC.x} ${-SC.y})">${P(STAR_D, ` fill="${fill}"`)}</g></g>` +
    Er(20, 24, 4.6, 2.6, -38, ` fill="${light}"`) + Ci(14.8, 28.6, 1.8, ` fill="${light}"`);
}
function star(i) {
  const S = STARS[i], p = 's' + i;
  return svg(64, 64, starBody(p, S.fill, S.shade, S.out, S.light) + emblem(S.emblem, S.out));
}
function starRainbow() {
  const p = 'sr', out = '#4c3a7a';
  const bands = STARS.map((S, i) => `<rect x="0" y="${4 + i * 14}" width="64" height="${i === 3 ? 30 : 14.5}" fill="${S.fill}"/>`).join('');
  const sparkle = P(`M32,22 Q33.6,32.4 44,34 Q33.6,35.6 32,46 Q30.4,35.6 20,34 Q30.4,32.4 32,22 Z`, ` fill="#fff" stroke="${out}" stroke-width="1.8" stroke-linejoin="round"`);
  return svg(64, 64,
    P(STAR_D, ` fill="${out}" stroke="${out}" stroke-width="6" stroke-linejoin="round"`) +
    `<defs>${clip(p + 'sc', P(STAR_D))}</defs><g clip-path="url(#${p}sc)">${bands}` +
    P(STAR_D, ` fill="none" stroke="#000" stroke-opacity=".14" stroke-width="5" transform="translate(1.5 2.5)"`) + `</g>` +
    Er(20, 24, 4.6, 2.6, -38, ` fill="#fff" opacity=".7"`) + sparkle + Ci(43, 22, 2, ` fill="#fff"`) + Ci(21, 45, 1.6, ` fill="#fff"`));
}

// =====================================================================
// HUD leaves (48×48)
// =====================================================================
const LEAF_D = 'M9,41 C6,24 16,9 41,6 C43,28 32,41 9,41 Z';
function leaf() {
  return svg(48, 48,
    line('M9,41 L4,45', C.leafO, 6) + line('M9,41 L5,44.4', C.leafS, 2.6) +
    sil(P(LEAF_D), C.leaf, C.leafO) +
    `<defs>${clip('lfc', P(LEAF_D))}</defs><g clip-path="url(#lfc)">${P('M9,41 C24,38 36,28 41,6 L50,50 Z', ` fill="${C.leafS}"`)}</g>` +
    line('M10,40 C18,30 28,18 38,9', C.leafO, 2.2) +
    line('M19,30 L16,22 M24,25 L23,16 M29,20 L29,13 M17,33 L24,33 M22,28 L30,28 M27,23 L34,22', C.leafO, 1.6, ' opacity=".55"') +
    Er(17, 20, 4.6, 2.4, -50, ` fill="${C.leafL}"`));
}
function leafEmpty() {
  return svg(48, 48,
    line('M9,41 L4,45', '#7f9a7a', 5) +
    P(LEAF_D, ` fill="#ffffff" fill-opacity=".38" stroke="#7f9a7a" stroke-width="3" stroke-linejoin="round" stroke-dasharray="5 3.4"`) +
    line('M10,40 C18,30 28,18 38,9', '#7f9a7a', 2, ' opacity=".7"'));
}

// =====================================================================
// Icon (256×256): opaque rounded jungle-green square, Zippy's face + a star
// =====================================================================
function icon() {
  const defs = `<linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd17a"/><stop offset="1" stop-color="#1f8a4c"/></linearGradient>` +
    `<radialGradient id="igl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe680" stop-opacity=".9"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient>` +
    clip('ibc', `<rect width="256" height="256" rx="56"/>`);
  const leafy = (x, y, s, r, col) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${P('M0,0 C-8,-30 6,-60 34,-70 C42,-40 30,-10 0,0 Z', ` fill="${col}"`)}</g>`;
  const bg = `<rect width="256" height="256" rx="56" fill="url(#ibg)"/><g clip-path="url(#ibc)">` +
    leafy(18, 250, 1.6, -30, '#2f9e55') + leafy(240, 250, 1.6, 40, '#2f9e55') + leafy(-6, 120, 1.2, 60, '#48bd68') + leafy(262, 90, 1.1, -70, '#48bd68') +
    Ci(200, 64, 46, ' fill="url(#igl)"') + `</g>`;
  // reuse Zippy's in-game head pieces (shared geometry), scaled around the head
  const zp = 'zi';
  const zface = zippyBody(zp) + zippyShell(zp) + zippyAntennae() + zippyHead(zp) + ZFACE.idle();
  const zippyG = Ci(118.4, 33.6, 32, ' fill="url(#igl)"') + Ci(176, 65.6, 30, ' fill="url(#igl)"') +
    `<g transform="translate(-246.4 -30.4) scale(3.2)">${zface}</g>`;
  // star (Sunny) at the top right with its emblem
  const S = STARS[1];
  const starG = `<g transform="translate(6 12) scale(1.7)">${starBody('ist', S.fill, S.shade, S.out, S.light)}${emblem('sun', S.out)}</g>`;
  return svg(256, 256, bg + `<g clip-path="url(#ibc)">${zippyG}</g>` + starG +
    `<rect x="4" y="4" width="248" height="248" rx="52" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>`, defs);
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const fr of ['idle', 'fly', 'boop', 'dizzy']) files['zippy_' + fr] = zippy(fr);
for (const k of Object.keys(KINDS)) for (const fr of ['up', 'happy', 'wow', 'paws']) files[k + '_' + fr] = critter(k, fr);
for (let i = 0; i < 4; i++) files['star_' + i] = star(i);
files.star_rainbow = starRainbow();
files.leaf = leaf(); files.leaf_empty = leafEmpty(); files.icon = icon();
for (const [n, s] of Object.entries(files)) {
  if (/<text|<image|<script|href=|font|@import/i.test(s)) throw new Error(n + ': forbidden element');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) throw new Error(n + ': duplicate ids ' + ids);
  fs.writeFileSync(path.join(OUT, n + '.svg'), s);
}
console.log('wrote ' + Object.keys(files).length + ' SVGs to ' + OUT);
