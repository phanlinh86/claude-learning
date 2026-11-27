// Pip's Oasis Glow — character & HUD art generator (DESIGN.md §2, §3, §4 "Characters").
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette (fill / one shade step / outline = darker shade / highlight) ----------
const C = {
  // Pip the frog
  pip: '#5cc96b', pipS: '#3fa957', pipO: '#23743f', pipL: '#b4f0a4', belly: '#e6f8b8', bellyS: '#cdeb93',
  // shared face
  eye: '#2b1d2e', mouth: '#8c2f45', tongue: '#ff8fa3', blush: '#ff8fa8', white: '#ffffff',
  // fennec kit (orange-sand)
  fen: '#f2a457', fenS: '#d9823a', fenO: '#94501f', fenL: '#ffd29c', fenCream: '#fff3df', fenCreamS: '#f1d9b8', fenEar: '#ffb4a2', fenNose: '#5b3424',
  // jerboa (peach)
  jer: '#f7b68a', jerS: '#e5966a', jerO: '#a45a37', jerL: '#ffe1c8', jerBelly: '#fff4e8', jerEar: '#ff9eb0', jerNose: '#e8697f',
  // tortoise (olive shell, warm sandy skin)
  sh: '#93ad3e', shS: '#728d29', shO: '#43581b', shL: '#c4da70', shPlate: '#a9c24f', shRim: '#cf9150', shRimS: '#ad7034',
  tsk: '#d3c47a', tskS: '#b5a457', tskO: '#6e6326', tskL: '#eee3a6',
  // nightcap (soft lavender-blue, white pompom)
  cap: '#93a6ff', capS: '#7184e6', capO: '#3f4aa3', capL: '#c9d3ff', pom: '#ffffff', pomO: '#8d97c9',
  // firefly
  ffHead: '#7a4e36', ffHeadO: '#3e2518', ffHeadL: '#a8775a', ffGlow: '#ffe066', ffGlowS: '#ffc93a', ffGlowO: '#c88a12', ffWing: '#eaf4ff', ffWingO: '#8fa8cc',
  gold: '#ffb81f', goldS: '#f09400', goldO: '#9c5a06', goldL: '#ffd45a', crown: '#ffd45a',
  // lily pads / leaves
  pad: '#62c46a', padS: '#43a352', padO: '#24703a', padL: '#a9e79a', lotus: '#ff9cc0', lotusS: '#f075a2', lotusO: '#b3406f', lotusL: '#ffd8e6',
  // jar
  glassO: '#5f8fa8', glassL: '#ffffff', cork: '#c98b52', corkS: '#a86c38', corkO: '#6e4220', string: '#e2c79a',
};

// ---------- helpers ----------
const f = n => +n.toFixed(2);
let PFX = 'x', UID = 0;
const uid = () => PFX + (UID++);
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
const E = (cx, cy, rx, ry, extra = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${extra}/>`;
const Er = (cx, cy, rx, ry, rot, extra = '') => E(cx, cy, rx, ry, ` transform="rotate(${rot} ${f(cx)} ${f(cy)})"${extra}`);
const Ci = (cx, cy, r, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${extra}/>`;
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
// silhouette: shapes stroked in the outline colour, then filled on top → one clean outer outline of w px
const sil = (shapes, fill, out, w = 3, tr = '') =>
  `<g${tr ? ` transform="${tr}"` : ''}><g fill="${out}" stroke="${out}" stroke-width="${2 * w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="${fill}">${shapes}</g></g>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const tube = (d, w, col, out, ow = 3) => line(d, out, w + 2 * ow) + line(d, col, w);
// draw `inner` clipped to `shape`
const clipped = (shape, inner) => { const id = uid(); return `<defs><clipPath id="${id}">${shape}</clipPath></defs><g clip-path="url(#${id})">${inner}</g>`; };
// mirrored copy reuses the first copy's clipPaths (user-space clips follow the mirror transform)
const mirror = g => g + `<g transform="translate(140 0) scale(-1 1)">${g.replace(/<defs>.*?<\/defs>/g, '')}</g>`;

// ---------- shared faces ----------
const eyeOpen = (cx, cy, rx, ry, lx = 0) =>
  E(cx, cy, rx, ry, ` fill="${C.eye}"`) +
  E(cx + lx - rx * 0.3, cy - ry * 0.34, rx * 0.44, ry * 0.38, ` fill="#fff"`) +
  Ci(cx + lx + rx * 0.36, cy + ry * 0.4, rx * 0.2, ` fill="#fff" opacity=".85"`);
// giggle ^ arc
const eyeHappy = (cx, cy, w, col, sw = 3.4) => line(`M${f(cx - w)},${f(cy + w * 0.35)} Q${f(cx)},${f(cy - w * 0.95)} ${f(cx + w)},${f(cy + w * 0.35)}`, col, sw);
// sleeping ‿ arc with two little lashes
const eyeSleep = (cx, cy, w, col, sw = 3.2) =>
  line(`M${f(cx - w)},${f(cy - w * 0.15)} Q${f(cx)},${f(cy + w * 0.85)} ${f(cx + w)},${f(cy - w * 0.15)}`, col, sw) +
  line(`M${f(cx - w * 0.7)},${f(cy + w * 0.35)} l${f(-w * 0.32)},${f(w * 0.36)} M${f(cx + w * 0.7)},${f(cy + w * 0.35)} l${f(w * 0.32)},${f(w * 0.36)}`, col, sw * 0.6);
const blush = (cx, cy, rx = 7, ry = 4.2, op = 0.75) => E(cx, cy, rx, ry, ` fill="${C.blush}" opacity="${op}"`);
const mouthOpen = (x0, x1, y, d, out) => {
  const cx = (x0 + x1) / 2;
  const shape = `M${x0},${y} Q${cx},${y - 2} ${x1},${y} Q${x1 - 1},${y + d} ${cx},${y + d} Q${x0 + 1},${y + d} ${x0},${y} Z`;
  return P(shape, ` fill="${C.mouth}" stroke="${out}" stroke-width="2.4" stroke-linejoin="round"`) +
    clipped(P(shape), E(cx, y + d, (x1 - x0) * 0.32, d * 0.55, ` fill="${C.tongue}"`));
};
const mouthO = (cx, cy, rx, ry, out) =>
  E(cx, cy, rx, ry, ` fill="${C.mouth}" stroke="${out}" stroke-width="2.4"`) + E(cx, cy + ry * 0.42, rx * 0.58, ry * 0.4, ` fill="${C.tongue}"`);
const smile = (x0, x1, y, d, col, sw = 2.8) => line(`M${x0},${y} Q${(x0 + x1) / 2},${y + d} ${x1},${y}`, col, sw);
// little "w" cat-mouth under a nose
const wMouth = (cx, y, w, col, sw = 2.6) => line(`M${cx - w},${y} Q${cx - w / 2},${y + w * 0.8} ${cx},${y} Q${cx + w / 2},${y + w * 0.8} ${cx + w},${y}`, col, sw);

// face kit shared by the three friends: cfg = eye x's, eye y, eye size, mouth y, outline colour, cheek y
function friendFace(frame, k) {
  const { ex, ey, rx, ry, my, out, cy, cx = 0 } = k;
  const [a, b] = ex;
  const cheeks = op => blush(a - 12 - cx, cy, 7.5, 4.4, op) + blush(b + 12 + cx, cy, 7.5, 4.4, op);
  if (frame === 'up') return eyeOpen(a, ey, rx, ry, 0.4) + eyeOpen(b, ey, rx, ry, 0.4) + cheeks(0.8) + wMouth(70, my, 6, out, 2.8);
  if (frame === 'happy') return eyeHappy(a, ey + 1, rx * 0.95, out, 3.6) + eyeHappy(b, ey + 1, rx * 0.95, out, 3.6) + cheeks(1) +
    E(a - 12 - cx, cy, 9.5, 5.6, ` fill="${C.blush}" opacity=".55"`) + E(b + 12 + cx, cy, 9.5, 5.6, ` fill="${C.blush}" opacity=".55"`) +
    mouthOpen(70 - 9, 70 + 9, my - 1, 11, out);
  if (frame === 'wow') // just woken: big round sparkly eyes, little "o" mouth, raised brows — curious, never scary
    return eyeOpen(a, ey - 1, rx * 1.18, ry * 1.15, 0) + eyeOpen(b, ey - 1, rx * 1.18, ry * 1.15, 0) +
      Ci(a + rx * 0.5, ey - ry * 0.75, 1.5, ' fill="#fff"') + Ci(b + rx * 0.5, ey - ry * 0.75, 1.5, ' fill="#fff"') +
      line(`M${a - 7},${f(ey - ry * 1.15 - 6)} Q${a},${f(ey - ry * 1.15 - 10)} ${a + 7},${f(ey - ry * 1.15 - 7)}`, out, 2.6) +
      line(`M${b - 7},${f(ey - ry * 1.15 - 7)} Q${b},${f(ey - ry * 1.15 - 10)} ${b + 7},${f(ey - ry * 1.15 - 6)}`, out, 2.6) +
      cheeks(0.6) + mouthO(70, my + 3, 4.2, 5, out);
  // sleepy
  return eyeSleep(a, ey + 1, rx * 0.95, out) + eyeSleep(b, ey + 1, rx * 0.95, out) + cheeks(0.9) + smile(65, 75, my + 1, 4, out, 2.6);
}

// soft nightcap: base centre (cx,cy), base width w, rotated `rot` degrees; tip flops to the right with a pompom
function nightcap(cx, cy, w, rot) {
  const h = w / 2;
  const cone = P(`M${-h},0 C${-h},${-w * 0.62} ${w * 0.1},${-w * 0.86} ${w * 0.88},${-w * 0.44} C${w * 0.6},${-w * 0.4} ${h + 1},${-w * 0.3} ${h},0 Z`);
  const band = `<rect x="${-h - 3}" y="-6" width="${w + 6}" height="10" rx="5"/>`;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">` +
    sil(cone, C.cap, C.capO) +
    clipped(cone, P(`M${-w * 0.2},${-w * 0.7} C${w * 0.15},${-w * 0.45} ${h},${-w * 0.3} ${h + 4},0 L${w * 1.2},${-w} Z`, ` fill="${C.capS}"`)) +
    Ci(-w * 0.18, -w * 0.26, 2.2, ` fill="${C.capL}"`) + Ci(w * 0.2, -w * 0.42, 1.8, ` fill="${C.capL}"`) + Ci(w * 0.02, -w * 0.18, 1.6, ` fill="${C.capL}"`) +
    E(-w * 0.22, -w * 0.42, 4, 2, ` fill="${C.capL}" opacity=".8" transform="rotate(-50 ${f(-w * 0.22)} ${f(-w * 0.42)})"`) +
    sil(band, '#f4f1ff', C.pomO, 2.4) +
    sil(Ci(w * 0.9, -w * 0.42, 6), C.pom, C.pomO, 2.4) + Ci(w * 0.88, -w * 0.45, 2.2, ` fill="#fff"`) + `</g>`;
}

// =====================================================================
// Pip (160×140): round green frog facing right. Body centre (80,82); feet line y 128; mouth corner (118,74)
// =====================================================================
const PIP_BODY = E(80, 82, 44, 38);
const PIP_EYES = Ci(89, 46, 15) + Ci(116, 50, 13);
function pipBody() {
  const blob = PIP_BODY + PIP_EYES;
  return sil(blob, C.pip, C.pipO) +
    clipped(PIP_BODY, E(64, 112, 52, 22, ` fill="${C.pipS}"`) + E(98, 98, 25, 19, ` fill="${C.belly}"`) + E(98, 112, 24, 8, ` fill="${C.bellyS}"`)) +
    // back spots + highlight
    Ci(52, 64, 5.2, ` fill="${C.pipS}"`) + Ci(44, 82, 3.6, ` fill="${C.pipS}"`) + Ci(62, 52, 3, ` fill="${C.pipS}"`) +
    Er(60, 60, 8, 4, -35, ` fill="${C.pipL}" opacity=".9"`) + Er(83, 37, 4, 2.4, -30, ` fill="${C.pipL}"`) + Er(111, 42, 3.4, 2, -30, ` fill="${C.pipL}"`) +
    // nostrils
    Ci(122, 60, 1.4, ` fill="${C.pipO}"`) + Ci(116, 58, 1.4, ` fill="${C.pipO}"`);
}
// eyeballs on the bumps
const pipEyeWhite = () => Ci(90, 47, 10.5, ` fill="#fff" stroke="${C.pipO}" stroke-width="1.8"`) + Ci(117, 51, 9, ` fill="#fff" stroke="${C.pipO}" stroke-width="1.8"`);
function swirl(cx, cy, r) {
  let d = '';
  for (let i = 0; i <= 26; i++) { const a = i * 0.55, rr = r * i / 26; d += (i ? ' L' : 'M') + f(cx + Math.cos(a) * rr) + ',' + f(cy + Math.sin(a) * rr); }
  return line(d, C.eye, 2);
}
const PFACE = {
  idle: () => pipEyeWhite() + eyeOpen(92, 48, 6.6, 7.6, 0.4) + eyeOpen(118.5, 52, 5.6, 6.6, 0.4) +
    blush(104, 76, 6.5, 3.8, 0.85) + line('M86,67 Q101,82 118,74', C.pipO, 3) + line('M118,74 l3,-3', C.pipO, 2.6),
  hop: () => pipEyeWhite() + eyeOpen(93.5, 47, 6.6, 7.6, 0.4) + eyeOpen(120, 51, 5.6, 6.6, 0.4) +
    blush(104, 76, 6.5, 3.8, 0.85) + mouthOpen(96, 118, 71, 9, C.pipO),
  boop: () => eyeHappy(90, 48, 8, C.pipO, 3.6) + eyeHappy(117, 52, 7, C.pipO, 3.4) +
    blush(102, 77, 8.5, 5, 1) + blush(62, 76, 6, 3.6, 0.6) + mouthOpen(90, 120, 69, 13, C.pipO),
  dizzy: () => pipEyeWhite() + swirl(90, 47, 8.4) + swirl(117, 51, 7) + blush(104, 77, 6.5, 3.8, 0.7) +
    line('M90,72 q4,-4 8,0 t8,0 t8,0 t6,-1', C.pipO, 2.8),
};
// limbs
function pipLegsSit() {
  const haunch = Er(52, 106, 21, 15, -12);
  const foot = P('M36,124 C36,119 44,117 56,118 C66,118 76,120 78,124 Z');
  const hand = P('M98,124 C98,120 104,118 110,119 C116,120 120,122 120,124 Z');
  return sil(foot, C.pip, C.pipO) + line('M50,121 l2,3 M60,120 l2,4 M68,121 l2,3', C.pipO, 1.6, ' opacity=".6"') +
    sil(haunch, C.pip, C.pipO) + clipped(haunch, E(50, 118, 24, 9, ` fill="${C.pipS}"`)) + Er(46, 100, 6, 3, -20, ` fill="${C.pipL}" opacity=".8"`) +
    tube('M102,104 C104,112 106,116 108,120', 9, C.pip, C.pipO) + sil(hand, C.pip, C.pipO);
}
function pipLegsHop() {
  // back legs stretched behind (left, down), arms reaching forward (right)
  const thigh = Er(46, 106, 20, 12, 28);
  const footB = P('M12,126 C6,124 4,118 10,116 C16,116 22,120 26,124 Z');
  return tube('M38,112 C30,118 24,120 16,121', 10, C.pip, C.pipO) + sil(footB, C.pip, C.pipO) +
    sil(thigh, C.pip, C.pipO) + clipped(thigh, E(44, 118, 22, 8, ` fill="${C.pipS}"`)) +
    tube('M108,100 C118,98 128,94 136,90', 9, C.pip, C.pipO) +
    sil(Er(140, 88, 7, 5, -25) + Er(146, 84, 4, 3, -40) + Er(146, 93, 4, 3, 10), C.pip, C.pipO, 2.6);
}
function pip(frame) {
  PFX = 'p' + frame[0]; UID = 0;
  const legs = frame === 'hop' ? pipLegsHop() : pipLegsSit();
  const core = pipBody() + PFACE[frame]();
  // boop: soft landing squash around the feet point (80,128) — same body geometry, just squashed
  const g = frame === 'boop' ? `<g transform="translate(80 128) scale(1.1 0.88) translate(-80 -128)">${legs}${core}</g>` : legs + core;
  return svg(160, 140, g);
}

// =====================================================================
// Friends (140×150). Body bottom y 150, head top ≈ y 10, firefly centre (70,94), paws at (42,100), (98,100)
// =====================================================================
// awake arms reach from the shoulders round to the paws (the paws themselves are in <kind>_paws.svg)
const armsAwake = (col, out, w = 12) => mirror(tube('M36,84 C30,90 32,98 40,100', w, col, out));
// sleepy: paws folded together under the chin
const armsSleepy = (col, out, pawCol, padCol, w = 12) =>
  tube('M34,90 C40,96 52,94 60,86', w, col, out) + tube('M106,90 C100,96 88,94 80,86', w, col, out) +
  sil(Er(62, 84, 10, 8, -20) + Er(78, 84, 10, 8, 20), pawCol, out) +
  line('M58,79 l3,4 M64,78 l1,4 M82,79 l-3,4 M76,78 l-1,4', out, 1.5, ' opacity=".55"') +
  (padCol ? Ci(61, 86, 2, ` fill="${padCol}"`) + Ci(79, 86, 2, ` fill="${padCol}"`) : '');

// ---------- fennec kit ----------
const FN = {
  torso: P('M26,150 C24,110 40,78 70,76 C100,78 116,110 114,150 Z'),
  head: E(70, 44, 36, 31),
  earL: P('M40,30 C30,19 19,9 13,4 C29,5 50,9 60,18 Z'),
};
function fennecBody() {
  const earR = `<g transform="translate(140 0) scale(-1 1)">${FN.earL}</g>`;
  return sil(FN.earL + earR, C.fen, C.fenO) +
    mirror(P('M42,26 C34,19 26,12 20,8.5 C32,9.5 46,13 54,19 Z', ` fill="${C.fenEar}"`) + line('M25,11 L32,15.5 M28,9.5 L35,14.5', C.fenCream, 1.6, ' opacity=".8"')) +
    // tail curling round the right side
    sil(P('M100,146 C126,144 136,120 124,104 C120,118 112,128 98,132 Z'), C.fen, C.fenO) +
    P('M124,104 C130,112 131,122 127,130 C124,124 122,114 124,104 Z', ` fill="${C.fenCream}"`) +
    sil(FN.torso, C.fen, C.fenO) +
    clipped(FN.torso, E(102, 132, 18, 44, ` fill="${C.fenS}"`) + E(70, 124, 26, 32, ` fill="${C.fenCream}"`) + E(70, 148, 28, 8, ` fill="${C.fenCreamS}"`)) +
    sil(FN.head, C.fen, C.fenO) +
    clipped(FN.head, E(70, 76, 40, 12, ` fill="${C.fenS}"`) +
      // cream mask: cheeks + muzzle
      P('M34,46 C42,48 52,50 70,52 C88,50 98,48 106,46 C104,66 90,76 70,76 C50,76 36,66 34,46 Z', ` fill="${C.fenCream}"`) +
      Er(56, 18, 10, 4, -12, ` fill="${C.fenL}"`)) +
    // forehead stripe + nose
    P('M66,16 Q70,26 74,16', ` fill="${C.fenS}"`) +
    P('M64.5,55 Q70,52 75.5,55 Q74,60 70,61 Q66,60 64.5,55 Z', ` fill="${C.fenNose}"`) + E(68.4, 55.2, 1.8, 1, ` fill="#fff" opacity=".7"`) +
    // whisker dots
    Ci(56, 62, 1.1, ` fill="${C.fenO}" opacity=".5"`) + Ci(59, 65, 1.1, ` fill="${C.fenO}" opacity=".5"`) + Ci(84, 62, 1.1, ` fill="${C.fenO}" opacity=".5"`) + Ci(81, 65, 1.1, ` fill="${C.fenO}" opacity=".5"`);
}
const FEN_FACE = { ex: [55, 85], ey: 42, rx: 6.8, ry: 8.2, my: 61, out: C.fenO, cy: 54, cx: -4 };
function fennecPaw() {
  const paw = Er(43, 100, 11, 12.5, 8);
  return sil(paw, C.fen, C.fenO) + clipped(paw, E(38, 108, 10, 8, ` fill="${C.fenS}"`) + E(50, 99, 6, 12, ` fill="${C.fenCream}"`)) +
    line('M49,93 l4,1 M50,99.6 l4.4,0.2 M49,106 l4,-0.8', C.fenO, 1.6, ' opacity=".7"') + Er(38, 93, 3.2, 2, -30, ` fill="${C.fenL}"`);
}

// ---------- jerboa ----------
const JB = {
  torso: P('M28,150 C22,112 38,80 70,78 C102,80 118,112 112,150 Z'),
  head: Ci(70, 45, 34),
  earL: Er(44, 27, 10, 22, -24),
};
function jerboaBody() {
  const earR = Er(96, 27, 10, 22, 24);
  // long tail with a tuft, curving up behind the right side
  return tube('M100,140 C124,136 128,108 124,76', 5, C.jer, C.jerO, 2.6) +
    sil(P('M124,78 C116,70 116,58 122,50 C128,56 134,66 130,76 C128,80 126,80 124,78 Z'), '#fbe8da', C.jerO, 2.6) +
    P('M122,54 C126,60 128,66 127,74', ` fill="none" stroke="${C.jerS}" stroke-width="2" stroke-linecap="round"`) +
    sil(JB.earL + earR, C.jer, C.jerO) +
    Er(45, 29, 5.5, 15, -24, ` fill="${C.jerEar}"`) + Er(95, 29, 5.5, 15, 24, ` fill="${C.jerEar}"`) +
    sil(JB.torso, C.jer, C.jerO) +
    clipped(JB.torso, E(102, 134, 18, 44, ` fill="${C.jerS}"`) + E(70, 126, 27, 32, ` fill="${C.jerBelly}"`)) +
    sil(JB.head, C.jer, C.jerO) +
    clipped(JB.head, E(70, 80, 44, 14, ` fill="${C.jerS}"`) + E(70, 66, 20, 12, ` fill="${C.jerBelly}"`) + Er(52, 22, 10, 5, -25, ` fill="${C.jerL}"`)) +
    // nose + whiskers
    E(70, 58, 3.6, 2.6, ` fill="${C.jerNose}"`) + E(69, 57.2, 1.2, 0.8, ` fill="#fff" opacity=".7"`) +
    line('M58,60 L44,58 M58,63 L45,65 M82,60 L96,58 M82,63 L95,65', C.jerO, 1.3, ' opacity=".55"');
}
const JER_FACE = { ex: [54, 86], ey: 42, rx: 8.4, ry: 9.6, my: 61, out: C.jerO, cy: 55, cx: -4 };
function jerboaPaw() {
  // small rodent hand: palm + three little fingers with pink pads
  const palm = Er(42, 100, 9, 10, 0);
  const fingers = Er(51, 93, 4.2, 3.2, -25) + Er(53, 100, 4.4, 3.2, 0) + Er(51, 107, 4.2, 3.2, 25);
  return sil(palm + fingers, C.jer, C.jerO, 2.8) + clipped(palm, E(38, 106, 9, 6, ` fill="${C.jerS}"`)) +
    Ci(52.5, 93, 1.6, ` fill="${C.jerNose}"`) + Ci(54.5, 100, 1.6, ` fill="${C.jerNose}"`) + Ci(52.5, 107, 1.6, ` fill="${C.jerNose}"`) +
    Er(38, 95, 3, 1.8, -30, ` fill="${C.jerL}"`);
}

// ---------- tortoise ----------
const TT = {
  shell: P('M8,150 C6,106 32,80 70,80 C108,80 134,106 132,150 Z'),
  rim: P('M8,150 C8,140 10,134 12,130 C40,138 100,138 128,130 C130,134 132,140 132,150 Z'),
  neck: P('M49,94 C47,80 50,68 56,60 L84,60 C90,68 93,80 91,94 Z'),
  head: E(70, 40, 35, 27),
};
const hex = (cx, cy, r) => { let d = ''; for (let i = 0; i < 6; i++) { const a = (i * 60 - 90) * Math.PI / 180; d += (i ? ' L' : 'M') + f(cx + Math.cos(a) * r) + ',' + f(cy + Math.sin(a) * r * 0.82); } return d + ' Z'; };
function tortoiseShell() {
  const plates = [[70, 118, 17], [40, 124, 14], [100, 124, 14], [70, 90, 12], [44, 98, 11], [96, 98, 11], [18, 136, 10], [122, 136, 10]];
  return sil(TT.shell, C.sh, C.shO) +
    clipped(TT.shell, E(108, 130, 30, 40, ` fill="${C.shS}"`) +
      plates.map(([x, y, r]) => P(hex(x, y, r), ` fill="${C.shPlate}" stroke="${C.shO}" stroke-width="2" stroke-linejoin="round"`)).join('') +
      TT.rim.replace('/>', ` fill="${C.shRim}" stroke="${C.shO}" stroke-width="2"/>`) +
      line('M30,140 L30,134 M50,142 L50,136 M70,142 L70,137 M90,142 L90,136 M110,140 L110,134', C.shRimS, 2) +
      Er(38, 94, 9, 4, -35, ` fill="${C.shL}" opacity=".9"`) + Er(58, 86, 5, 2.4, -15, ` fill="${C.shL}" opacity=".9"`));
}
function tortoiseHead(tuck) {
  // sleepy: head half tucked (lower, by `tuck` px); same head shape
  const g = sil(TT.neck, C.tsk, C.tskO) + clipped(TT.neck, E(84, 80, 8, 20, ` fill="${C.tskS}"`)) +
    sil(TT.head, C.tsk, C.tskO) +
    clipped(TT.head, E(70, 70, 36, 12, ` fill="${C.tskS}"`) + Er(54, 20, 10, 4.6, -20, ` fill="${C.tskL}"`)) +
    // soft scale patches on the crown + neck rings + nostrils
    P('M62,17 l5,-3 l5,3 l-1,5 l-8,0 Z M74,19 l5,-2 l4,3 l-2,4 l-6,-1 Z M53,22 l4,-3 l4,2 l-1,4 l-5,0 Z', ` fill="${C.tskS}" opacity=".75"`) +
    line('M55,76 Q70,80 85,76 M53,84 Q70,88 87,84', C.tskS, 2) +
    Ci(67, 48, 1.2, ` fill="${C.tskO}"`) + Ci(73, 48, 1.2, ` fill="${C.tskO}"`);
  return tuck ? `<g transform="translate(0 ${tuck})">${g}</g>` : g;
}
const TOR_FACE = { ex: [56, 84], ey: 38, rx: 6.6, ry: 8, my: 54, out: C.tskO, cy: 50, cx: -4 };
function tortoisePaw() {
  // stubby front leg with three cream claws gripping the firefly
  const leg = Er(42, 101, 11, 11, 0);
  return sil(leg, C.tsk, C.tskO) + clipped(leg, E(38, 110, 11, 7, ` fill="${C.tskS}"`)) +
    sil(Ci(51.5, 94, 2.6) + Ci(53.5, 101, 2.6) + Ci(51.5, 108, 2.6), '#fff8e6', C.tskO, 1.6) +
    Ci(38, 98, 2.2, ` fill="${C.tskS}"`) + Ci(44, 106, 1.8, ` fill="${C.tskS}"`) + Er(37, 94, 3, 1.8, -30, ` fill="${C.tskL}"`);
}

const KINDS = {
  fennec: {
    body: () => fennecBody(), face: FEN_FACE, paw: fennecPaw,
    arms: s => s ? armsSleepy(C.fen, C.fenO, C.fenCream) : armsAwake(C.fen, C.fenO),
    cap: () => nightcap(70, 22, 32, -6),
  },
  jerboa: {
    body: () => jerboaBody(), face: JER_FACE, paw: jerboaPaw,
    arms: s => s ? armsSleepy(C.jer, C.jerO, C.jer, C.jerNose, 10) : armsAwake(C.jer, C.jerO, 10),
    cap: () => nightcap(70, 22, 32, -6),
  },
  tortoise: {
    body: s => tortoiseShell() + tortoiseHead(s ? 10 : 0), face: TOR_FACE, paw: tortoisePaw,
    arms: s => s ? armsSleepy(C.tsk, C.tskO, C.tsk, null, 13) : mirror(tube('M30,104 C32,100 36,99 40,100', 13, C.tsk, C.tskO)),
    cap: () => `<g transform="translate(0 10)">${nightcap(70, 20, 32, -6)}</g>`,
  },
};
function friend(kind, frame) {
  const K = KINDS[kind]; PFX = kind.slice(0, 2) + frame[0] + frame[1]; UID = 0;
  if (frame === 'paws') return svg(140, 150, mirror(K.paw()));
  const s = frame === 'sleepy';
  let face = friendFace(frame, K.face);
  if (s && kind === 'tortoise') face = `<g transform="translate(0 10)">${face}</g>`;
  return svg(140, 150, K.body(s) + K.arms(s) + face + (s ? K.cap() : ''));
}

// =====================================================================
// Fireflies (64×64): chubby, facing the viewer; glow abdomen centre (32,40)
// =====================================================================
function fireflyBody(gold) {
  const g = gold ? { f: C.gold, s: C.goldS, o: C.goldO, l: C.goldL } : { f: C.ffGlow, s: C.ffGlowS, o: C.ffGlowO, l: '#fff6c2' };
  const wing = Er(14, 22, 11, 7, -30) ;
  const wingR = Er(50, 22, 11, 7, 30);
  const abd = Ci(32, 40, 17.5);
  return `<g opacity=".85">${E(14, 22, 11, 7, ` transform="rotate(-30 14 22)" fill="${C.ffWing}" stroke="${C.ffWingO}" stroke-width="2"`)}` +
    E(50, 22, 11, 7, ` transform="rotate(30 50 22)" fill="${C.ffWing}" stroke="${C.ffWingO}" stroke-width="2"`) + `</g>` +
    line('M15,20 Q14,22 10,23 M49,20 Q50,22 54,23', C.ffWingO, 1.2, ' opacity=".6"') +
    // antennae
    line('M28,12 Q24,4 19,4 M36,12 Q40,4 45,4', C.ffHeadO, 2) + Ci(19, 4, 2.4, ` fill="${g.f}" stroke="${C.ffHeadO}" stroke-width="1.4"`) + Ci(45, 4, 2.4, ` fill="${g.f}" stroke="${C.ffHeadO}" stroke-width="1.4"`) +
    // abdomen (the glow)
    sil(abd, g.f, g.o) +
    clipped(abd, Ci(37, 46, 17, ` fill="${g.s}"`) + Ci(30, 37, 15, ` fill="${g.f}"`) +
      line('M16,44 Q32,50 48,44 M18,51 Q32,57 46,51', g.s, 2, ' opacity=".8"')) +
    Er(24, 34, 5.5, 3.6, -35, ` fill="#fff"`) + Ci(20, 41, 1.8, ` fill="#fff" opacity=".9"`) +
    // little legs
    line('M24,25 l-3,4 M40,25 l3,4', C.ffHeadO, 2) +
    // head
    sil(E(32, 18, 11, 9.5), C.ffHead, C.ffHeadO, 2.6) + clipped(E(32, 18, 11, 9.5), E(34, 25, 12, 5, ` fill="${C.ffHeadO}" opacity=".35"`)) +
    Er(27, 13, 3, 1.6, -25, ` fill="${C.ffHeadL}"`) +
    Ci(28, 18, 2.4, ` fill="#fff"`) + Ci(36, 18, 2.4, ` fill="#fff"`) + Ci(28.4, 18.4, 1.3, ` fill="${C.eye}"`) + Ci(36.4, 18.4, 1.3, ` fill="${C.eye}"`) +
    line('M29.5,22.6 Q32,24.6 34.5,22.6', '#ffd9c4', 1.4) + E(25, 21.6, 1.8, 1, ` fill="${C.blush}" opacity=".8"`) + E(39, 21.6, 1.8, 1, ` fill="${C.blush}" opacity=".8"`);
}
const sparkle = (x, y, r, fill, out) => P(`M${x},${y - r} Q${f(x + r * 0.18)},${f(y - r * 0.18)} ${x + r},${y} Q${f(x + r * 0.18)},${f(y + r * 0.18)} ${x},${y + r} Q${f(x - r * 0.18)},${f(y + r * 0.18)} ${x - r},${y} Q${f(x - r * 0.18)},${f(y - r * 0.18)} ${x},${y - r} Z`,
  ` fill="${fill}" stroke="${out}" stroke-width="1.6" stroke-linejoin="round"`);
function firefly() { PFX = 'ff'; UID = 0; return svg(64, 64, fireflyBody(false)); }
function fireflyGold() {
  PFX = 'fg'; UID = 0;
  const crown = P('M24,9 L25,2 L29,6 L32,0.8 L35,6 L39,2 L40,9 Z');
  return svg(64, 64, fireflyBody(true) +
    // star mark on the belly + crown + sparkle points
    sparkle(36, 44, 6.5, '#fff', C.goldO) +
    sil(crown, C.crown, C.goldO, 1.6) + Ci(32, 6, 1.4, ` fill="#ff6fa0"`) +
    sparkle(7, 38, 6, '#fff', C.goldO) + sparkle(57, 36, 6, '#fff', C.goldO) + sparkle(54, 58, 4.2, '#fff', C.goldO) + sparkle(9, 57, 3.6, '#fff', C.goldO));
}

// =====================================================================
// HUD lily-pad hearts (48×48), jar (64×64), Pip's lily pad (200×70), icon (256×256)
// =====================================================================
// round pad with a wedge notch pointing at the centre (notch opens at angle `a` degrees)
function padPath(cx, cy, rx, ry, a = -60, gap = 22, depth = 0.12) {
  const r = d => d * Math.PI / 180;
  const a0 = r(a + gap / 2), a1 = r(a - gap / 2 + 360);
  const p0 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry], p1 = [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry];
  const c = [cx + Math.cos(r(a)) * rx * depth, cy + Math.sin(r(a)) * ry * depth];
  return `M${f(c[0])},${f(c[1])} L${f(p0[0])},${f(p0[1])} A${rx},${ry} 0 1 1 ${f(p1[0])},${f(p1[1])} Z`;
}
function lotus(x, y, s) {
  const petal = (rot) => `<path d="M0,0 C-5,-4 -4,-12 0,-15 C4,-12 5,-4 0,0 Z" transform="rotate(${rot})"/>`;
  const back = petal(-55) + petal(55);
  const front = petal(-25) + petal(25) + petal(0);
  return `<g transform="translate(${x} ${y}) scale(${s})">` + sil(back, C.lotusS, C.lotusO, 1.6) + sil(front, C.lotus, C.lotusO, 1.6) +
    `<path d="M0,-2 C-2,-5 -2,-10 0,-12 C2,-10 2,-5 0,-2 Z" fill="${C.lotusL}"/>` + Ci(0, -1, 2.2, ` fill="#ffd45a"`) + `</g>`;
}
function leaf() {
  PFX = 'lf'; UID = 0;
  const d = padPath(24, 25, 20, 19, -60, 30, 0.08);
  return svg(48, 48, sil(P(d), C.pad, C.padO) +
    clipped(P(d), E(30, 36, 22, 12, ` fill="${C.padS}"`)) +
    line('M24,25 L8,22 M24,25 L14,38 M24,25 L30,42 M24,25 L42,30 M24,25 L40,16', C.padO, 1.4, ' opacity=".35"') +
    Er(14, 16, 5, 2.6, -40, ` fill="${C.padL}"`) + lotus(31, 29, 0.85));
}
function leafEmpty() {
  PFX = 'le'; UID = 0;
  const d = padPath(24, 25, 20, 19, -60, 30, 0.08);
  return svg(48, 48, P(d, ` fill="#ffffff" fill-opacity=".35" stroke="#86a88a" stroke-width="3" stroke-linejoin="round" stroke-dasharray="5 3.4"`) +
    line('M24,25 L8,22 M24,25 L14,38 M24,25 L30,42 M24,25 L42,30', '#86a88a', 1.4, ' opacity=".5"'));
}
function jar() {
  PFX = 'jr'; UID = 0;
  const body = 'M20,20 C14,24 12,32 12,42 C12,54 18,60 32,60 C46,60 52,54 52,42 C52,32 50,24 44,20 Z';
  return svg(64, 64,
    // string handle
    line('M18,16 C14,4 50,4 46,16', C.corkO, 4.6) + line('M18,16 C14,4 50,4 46,16', C.string, 2.4) +
    // glass (transparent interior, faint tint only)
    P(body, ` fill="#e8f7ff" fill-opacity=".14" stroke="${C.glassO}" stroke-width="3" stroke-linejoin="round"`) +
    P('M18,30 C16,36 16,44 18,50', ` fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".75"`) +
    Ci(19, 54, 1.6, ` fill="#fff" opacity=".7"`) + P('M46,34 C47,38 47,42 46,46', ` fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".45"`) +
    P('M18,57 C24,61 40,61 46,57', ` fill="none" stroke="${C.glassO}" stroke-width="1.6" opacity=".5"`) +
    // cork lid + rim
    sil(`<rect x="17" y="17" width="30" height="6" rx="3"/>`, '#d7eef8', C.glassO, 2) +
    sil(`<rect x="21" y="9" width="22" height="10" rx="3"/>`, C.cork, C.corkO, 2.4) +
    `<rect x="21" y="14" width="22" height="5" rx="2" fill="${C.corkS}"/>` + Ci(26, 12, 1, ` fill="${C.corkO}" opacity=".6"`) + Ci(36, 13, 1.1, ` fill="${C.corkO}" opacity=".6"`) +
    line('M18,20 L46,20', C.string, 1.6));
}
function lilypad() {
  PFX = 'lp'; UID = 0;
  const d = padPath(100, 33, 88, 22, 70, 26, 0.1);
  const under = padPath(100, 38, 88, 22, 70, 26, 0.1);
  return svg(200, 70,
    P(under, ` fill="${C.padO}" stroke="${C.padO}" stroke-width="6" stroke-linejoin="round"`) +
    P(d, ` fill="${C.pad}" stroke="${C.padO}" stroke-width="3" stroke-linejoin="round"`) +
    clipped(P(d), E(118, 46, 92, 16, ` fill="${C.padS}"`) + E(84, 24, 52, 9, ` fill="${C.padL}" opacity=".55"`)) +
    line('M100,36 L20,30 M100,36 L40,18 M100,36 L80,12 M100,36 L124,12 M100,36 L164,18 M100,36 L182,34 M100,36 L42,48 M100,36 L156,50', C.padO, 1.6, ' opacity=".3"') +
    lotus(30, 34, 1.25) + Ci(170, 42, 2.4, ` fill="#fff" opacity=".6"`) + Ci(176, 46, 1.4, ` fill="#fff" opacity=".5"`));
}
function icon() {
  PFX = 'ic'; UID = 0;
  const defs = `<linearGradient id="icbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a9aa6"/><stop offset="1" stop-color="#1d4c6a"/></linearGradient>` +
    `<radialGradient id="icgl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe066" stop-opacity=".95"/><stop offset=".45" stop-color="#ffe066" stop-opacity=".45"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="icc"><rect width="256" height="256" rx="56"/></clipPath>`;
  const dots = [[34, 40, 2.4], [70, 26, 1.6], [214, 210, 2], [30, 150, 1.8], [226, 132, 1.6]].map(([x, y, r]) => Ci(x, y, r, ` fill="#fff3b0" opacity=".8"`)).join('');
  const bg = `<rect width="256" height="256" rx="56" fill="url(#icbg)"/><g clip-path="url(#icc)">` +
    E(128, 262, 170, 50, ' fill="#2a7a72"') + E(128, 268, 150, 38, ' fill="#3d9a7c"') + dots + `</g>`;
  // Pip (idle) scaled up so his face fills the lower half
  const pipG = `<g clip-path="url(#icc)"><g transform="translate(-96 2) scale(2.45)">${pipLegsSit()}${pipBody()}${PFACE.idle()}</g></g>`;
  const ffG = Ci(62, 60, 62, ' fill="url(#icgl)"') + `<g transform="translate(14 8) scale(1.5)">${fireflyBody(false)}</g>`;
  return svg(256, 256, bg + pipG + ffG +
    `<rect x="4" y="4" width="248" height="248" rx="52" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>`, defs);
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const fr of ['idle', 'hop', 'boop', 'dizzy']) files['pip_' + fr] = pip(fr);
for (const k of Object.keys(KINDS)) for (const fr of ['up', 'happy', 'wow', 'sleepy', 'paws']) files[k + '_' + fr] = friend(k, fr);
files.firefly = firefly(); files.firefly_gold = fireflyGold();
files.leaf = leaf(); files.leaf_empty = leafEmpty(); files.jar = jar(); files.lilypad = lilypad(); files.icon = icon();
for (const [n, s] of Object.entries(files)) {
  if (/<text|<image|<script|href=|font|@import|feGaussianBlur/i.test(s)) throw new Error(n + ': forbidden element');
  if (/#000\b|#000000|"black"/i.test(s)) throw new Error(n + ': pure black');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) throw new Error(n + ': duplicate ids ' + ids);
  fs.writeFileSync(path.join(OUT, n + '.svg'), s);
}
console.log('wrote ' + Object.keys(files).length + ' SVGs to ' + OUT);
