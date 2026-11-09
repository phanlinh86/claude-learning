// Finn's Island Fling — character & item art generator (DESIGN.md §3, §4).
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette (DESIGN §3: hero warm orange / cream, leaves bright green, sea teal) ----------
const C = {
  fox: '#f58a2b', foxS: '#d8661a', foxO: '#8a3a10', foxL: '#ffc07a',
  cream: '#fff3dc', creamS: '#f2d5aa', creamO: '#b5814f',
  sock: '#7a3d1d', sockO: '#4a220e', sockL: '#a8623a',
  eye: '#2b1810', nose: '#3a1f14', mouth: '#7a2a1c', tongue: '#ff7a7a', cheek: '#ff8f7a',
  red: '#e5383b', redS: '#b8262c', redO: '#7a1519', dot: '#ffffff',
  shirt: '#ffffff', stripe: '#3e6fd8', stripeO: '#26479a', shirtS: '#d7e3f7',
  leaf: '#7ee04f', leafS: '#45b23a', leafO: '#1f6a2a', leafL: '#d4ff9e', rib: '#2f8a33',
  moon: '#e4fbff', moonS: '#9fe3f5', moonO: '#2f86b0', moonL: '#ffffff', moonGlow: '#c9f6ff',
  wood: '#c98a4e', woodS: '#9a6131', woodO: '#5c3517', woodL: '#e8b27a', woodD: '#7c4c26',
  rope: '#efd59a', ropeO: '#9c7a3e',
  metal: '#4b4f66', metalO: '#2a2c3d', glowA: '#fff4b0', glowB: '#ffc93c', glowO: '#c98a1a',
  flame: '#ff9a1f', flameIn: '#ffe36a', flameO: '#c7461a',
  palm: '#b98552', palmS: '#8e5d33', palmO: '#5a3519', palmL: '#d9a874', frond: '#5cc24a', frondO: '#2a6e2a',
  gull: '#ffffff', gullS: '#dfe7ee', gullO: '#5d6b7c', wing: '#b7c3cf', wingS: '#93a1b0', wingTip: '#4d5868',
  beak: '#ffab2e', beakO: '#b9641a', gullCheek: '#ffb3b3',
  heart: '#ff5a6e', heartS: '#dc3651', heartO: '#951d34', heartL: '#ffc2cb',
  emptyF: '#ffffff', emptyO: '#8b6f78',
  teal: '#22b3ad', tealD: '#13838c', tealL: '#5fd6cc', sea: '#1aa0a8',
  star: '#ffe14d', starO: '#c4931a', water: '#7fe3ea', waterO: '#1b7f8f', foam: '#ffffff',
};

// ---------- helpers ----------
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
const r1 = v => +v.toFixed(2);
const E = (cx, cy, rx, ry, extra = '') => `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}"${extra}/>`;
const Ci = (cx, cy, r, extra = '') => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"${extra}/>`;
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
const R = (x, y, w, h, rx, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${extra}/>`;
// silhouette: the shapes drawn thick in the outline colour, then filled on top → one clean outer outline (w px)
const sil = (shapes, fill, out, w = 3, tr = '') =>
  `<g${tr ? ` transform="${tr}"` : ''}><g fill="${out}" stroke="${out}" stroke-width="${2 * w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="${fill}">${shapes}</g></g>`;
const tube = (d, w, col, out, ow = 3) =>
  `<path d="${d}" fill="none" stroke="${out}" stroke-width="${w + 2 * ow}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
let uid = 0;
// shape with outline + a flat shade (clipped) + optional highlight
const shaded = (pfx, shapes, fill, out, shade, shadeShapes, hi = '', w = 3, tr = '') => {
  const id = `${pfx}c${uid++}`;
  return `<g${tr ? ` transform="${tr}"` : ''}>` + sil(shapes, fill, out, w) +
    `<clipPath id="${id}">${shapes}</clipPath><g clip-path="url(#${id})" fill="${shade}">${shadeShapes}</g>${hi}</g>`;
};
const star5 = (cx, cy, ro, ri, rot = -90) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    d += (i ? 'L' : 'M') + r1(cx + r * Math.cos(a)) + ',' + r1(cy + r * Math.sin(a));
  }
  return d + 'Z';
};

// ======================================================================
// FINN — identical head & body geometry in every frame
// body centre (64,64) = world position; feet line y 112; facing RIGHT
// ======================================================================
const HEAD = { cx: 64, cy: 44, rx: 31, ry: 26 };   // x 33–95, y 18–70
const BODY = { cx: 60, cy: 86, rx: 23, ry: 21 };   // x 37–83, y 65–107
const FOOT_CY = 105; // fill bottom 109.5, outline bottom 112.5 → stands on y 112

// tail in local coords: base at (0,0) pointing +x, length ≈ 44
const TAIL = 'M0,-8 C12,-17 30,-21 41,-12 C48,-6 48,4 42,9 C30,16 12,12 0,8 Z';
const tail = (pfx, x, y, ang, s = 1, flipY = false, op = 1) => {
  const id = `${pfx}t${uid++}`;
  const sh = P(TAIL);
  return `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s} ${flipY ? -s : s})" opacity="${op}">` +
    sil(sh, C.fox, C.foxO, 3 / s) +
    `<clipPath id="${id}">${sh}</clipPath><g clip-path="url(#${id})">` +
    P('M-2,4 C14,12 30,14 50,4 L50,20 L-2,20 Z', ` fill="${C.foxS}"`) +
    E(44, 0, 13, 16, ` fill="${C.cream}"`) + E(46, 5, 10, 9, ` fill="${C.creamS}"`) +
    `</g>` + line('M33,-8 C36,-2 36,4 33,9', C.creamO, 1.6 / s, ' opacity=".55"') +
    E(16, -8, 8, 2.4, ` fill="#fff" opacity=".4" transform="rotate(-12 16 -8)"`) + `</g>`;
};
// foot / paw: dark "fox sock" mitt
const foot = (x, y, ang = 0, s = 1) =>
  sil(E(0, 0, 10, 4.5), C.sock, C.sockO, 3 / s, `translate(${x} ${y}) rotate(${ang}) scale(${s})`) +
  `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})">` + E(-2, -1.6, 4.5, 1.3, ` fill="${C.sockL}" opacity=".8"`) + `</g>`;
const paw = (x, y, r = 5.2) => sil(Ci(x, y, r), C.sock, C.sockO, 3) + Ci(x - 1.4, y - 1.6, r * 0.38, ` fill="${C.sockL}"`);
// an arm: orange tube ending in a sock paw
const arm = (d, px, py) => tube(d, 9, C.fox, C.foxO) + paw(px, py);
// a leg as a short tube with a foot at its end
const leg = (d, fx, fy, fa) => tube(d, 11, C.fox, C.foxO) + foot(fx, fy, fa);

const body = (pfx) => {
  const { cx, cy, rx, ry } = BODY;
  const B = E(cx, cy, rx, ry);
  const id = pfx + 'bd';
  // little striped sailor shirt over the upper body; cream belly peeks below
  let stripes = '';
  for (let y = 68; y < 92; y += 8) stripes += R(30, y, 60, 3.6, 0);
  return sil(B, C.fox, C.foxO) +
    `<clipPath id="${id}">${B}</clipPath><g clip-path="url(#${id})">` +
    E(cx + 4, cy + 13, 16, 12, ` fill="${C.cream}"`) +
    P(`M30,62 L92,62 L92,92 Q60,99 30,92 Z`, ` fill="${C.shirt}"`) +
    P(`M66,62 L92,62 L92,94 L66,96 Z`, ` fill="${C.shirtS}"`) +
    `<g fill="${C.stripe}">${stripes}</g>` +
    P(`M30,92 Q60,99 92,92`, ` fill="none" stroke="${C.stripeO}" stroke-width="2"`) +
    P(`M${cx + 6},${cy + 20} Q${cx + 20},${cy + 14} ${cx + 24},${cy - 4} L${cx + 26},${cy + 26} Z`, ` fill="${C.foxS}" opacity=".9"`) +
    `</g>`;
};

// ears (behind the bandana edge but drawn after it so they poke through)
const ear = (bx1, by1, tx, ty, bx2, by2, inner) =>
  sil(P(`M${bx1},${by1} Q${tx - 4},${ty + 10} ${tx},${ty} Q${tx + 6},${ty + 12} ${bx2},${by2} Z`), C.fox, C.foxO) +
  P(`M${tx},${ty} Q${tx + 3},${ty + 6} ${tx + (bx2 - tx) * 0.35},${ty + (by2 - ty) * 0.35} L${tx + (bx1 - tx) * 0.3},${ty + (by1 - ty) * 0.3} Z`, ` fill="${C.sock}"`) +
  P(inner, ` fill="${C.creamS}"`);

const head = (pfx, opts = {}) => {
  const { cx, cy, rx, ry } = HEAD;
  const H = E(cx, cy, rx, ry);
  const id = pfx + 'hd';
  const knot = opts.knot || 0; // angle tweak for bandana tails
  // bandana tails (behind head)
  const tails = `<g transform="rotate(${knot} 36 36)">` +
    sil(P('M36,34 Q22,32 10,40 Q16,44 14,52 Q26,44 36,42 Z') + P('M36,38 Q24,46 18,60 Q26,58 30,64 Q32,50 38,42 Z'), C.red, C.redO) +
    P('M34,38 Q22,38 14,44', ` fill="none" stroke="${C.redS}" stroke-width="2"`) + `</g>`;
  // cheek fluff + muzzle
  const face = E(cx - 1, cy + 4, rx - 3, ry - 6, ` fill="${C.fox}"`);
  return tails + sil(H + P('M36,52 Q30,62 40,66 Q44,70 50,68 Z'), C.fox, C.foxO) +
    `<clipPath id="${id}">${H}</clipPath><g clip-path="url(#${id})">` +
    `<rect x="30" y="16" width="70" height="60" fill="${C.foxS}"/>` + E(cx - 4, cy - 3, rx - 2, ry - 3, ` fill="${C.fox}"`) + face +
    // cream cheek/muzzle area
    E(cx + 14, cy + 17, 24, 13, ` fill="${C.cream}"`) + E(cx + 16, cy + 22, 22, 7, ` fill="${C.creamS}"`) +
    `</g>` +
    // snout bump poking right
    sil(E(87, 55, 12, 9), C.cream, C.creamO, 2.5) + E(86, 59, 10, 4, ` fill="${C.creamS}"`) +
    E(cx + 14, cy + 9, 25, 8, ` fill="${C.cream}"`) +
    // bandana cap (follows the head top, slightly larger)
    bandana(pfx);
};
// bandana: cap over the top of the head, lower edge arcs across the forehead
const bandana = (pfx) => {
  const { cx, cy } = HEAD, rx = 32.5, ry = 27.5;
  const pt = t => [r1(cx + rx * Math.cos(t * Math.PI / 180)), r1(cy + ry * Math.sin(t * Math.PI / 180))];
  const [lx, ly] = pt(196), [rxp, ryp] = pt(-18);
  const capD = `M${lx},${ly} A${rx},${ry} 0 0 1 ${rxp},${ryp} Q${cx + 4},${cy - 16} ${lx},${ly} Z`;
  const id = pfx + 'bn';
  let dots = '';
  [[44, 26], [58, 21], [73, 22], [86, 28], [50, 34], [66, 30], [80, 34], [38, 36]].forEach(([x, y]) => dots += Ci(x, y, 2.5));
  return sil(P(capD), C.red, C.redO) +
    `<clipPath id="${id}">${P(capD)}</clipPath><g clip-path="url(#${id})">` +
    P(`M${lx},${ly} Q${cx + 4},${cy - 16} ${rxp},${ryp} L${rxp},${ryp + 10} L${lx},${ly + 10} Z`, ` fill="${C.redS}" transform="translate(0 -4)"`) +
    `<g fill="${C.dot}">${dots}</g>` + `</g>` +
    E(52, 21, 9, 3, ` fill="#fff" opacity=".35" transform="rotate(-18 52 21)"`) +
    // knot at the back
    sil(Ci(35, 38, 5.5), C.red, C.redO, 2.5) + Ci(34, 36.5, 1.8, ` fill="${C.dot}"`);
};
const ears = () =>
  ear(38, 30, 35, 6, 54, 22, 'M40,26 Q38,15 37.5,12 Q44,17 49,22 Z') +
  ear(72, 20, 89, 5, 92, 30, 'M76,19 Q85,12 88,10 Q89,18 89,25 Z');

// ---- faces ----
const EYE_B = [54, 46], EYE_F = [78, 44];
const eyeOpen = (x, y, s = 1) =>
  E(x, y, 5.6 * s, 7 * s, ` fill="${C.eye}"`) + Ci(x + 1.8 * s, y - 2.6 * s, 2.3 * s, ` fill="#fff"`) + Ci(x - 1.8 * s, y + 2.8 * s, 1.1 * s, ` fill="#fff" opacity=".85"`);
const eyeHappy = (x, y) => line(`M${x - 5.5},${y + 2} Q${x},${y - 6} ${x + 5.5},${y + 2}`, C.eye, 3.4);
const eyeSquint = (x, y, dir) => line(dir > 0 ? `M${x - 5},${y - 4} L${x + 4},${y} L${x - 5},${y + 4}` : `M${x + 5},${y - 4} L${x - 4},${y} L${x + 5},${y + 4}`, C.eye, 3.2);
const eyeFocus = (x, y) => // determined: open eye with a lowered lid
  E(x, y + 1, 5.4, 6, ` fill="${C.eye}"`) + Ci(x + 1.8, y - 0.6, 2, ` fill="#fff"`) +
  line(`M${x - 6.5},${y - 5} L${x + 6},${y - 2}`, C.foxO, 3);
const nose = () => sil(E(97, 52, 5, 3.8), C.nose, C.nose, 0.5) + E(95.6, 50.8, 1.8, 1.1, ` fill="#fff" opacity=".7"`);
const cheeks = (op = 0.55) => E(70, 58, 5, 3, ` fill="${C.cheek}" opacity="${op}"`) + E(46, 58, 3.6, 2.4, ` fill="${C.cheek}" opacity="${op}"`);
const MOUTH = {
  smile: line('M83,59 Q88,64 94,58', C.mouth, 2.6),
  grin: P('M82,58 Q89,66 96,57 Q90,60 82,58 Z', ` fill="#fff" stroke="${C.mouth}" stroke-width="2.4" stroke-linejoin="round"`),
  open: P('M82,58 Q89,70 96,57 Q89,61 82,58 Z', ` fill="${C.mouth}" stroke="${C.mouth}" stroke-width="2.4" stroke-linejoin="round"`) + E(89, 63, 3.2, 1.8, ` fill="${C.tongue}"`),
  big: P('M80,57 Q88,74 97,56 Q88,60 80,57 Z', ` fill="${C.mouth}" stroke="${C.mouth}" stroke-width="2.4" stroke-linejoin="round"`) + E(88, 66, 4.2, 2.4, ` fill="${C.tongue}"`),
  o: E(88, 62, 3.2, 3.8, ` fill="${C.mouth}" stroke="${C.mouth}" stroke-width="1.6"`),
  wobble: line('M81,61 Q84,58 87,61 Q90,64 93,60', C.mouth, 2.4),
};
const face = (kind) => {
  let e = '';
  if (kind === 'happy') e = eyeHappy(...EYE_B) + eyeHappy(...EYE_F);
  else if (kind === 'focus') e = eyeFocus(...EYE_B) + eyeFocus(...EYE_F);
  else if (kind === 'dizzy') e = eyeSquint(EYE_B[0], EYE_B[1], 1) + eyeSquint(EYE_F[0], EYE_F[1], -1);
  else if (kind === 'wide') e = eyeOpen(EYE_B[0], EYE_B[1], 1.1) + eyeOpen(EYE_F[0], EYE_F[1], 1.12);
  else e = eyeOpen(...EYE_B) + eyeOpen(...EYE_F);
  return e + nose() + cheeks();
};

// flat translucent tail used as a motion ghost (no outline → no grey mush)
const ghostTail = (x, y, ang, s, op) => `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})" opacity="${op}">` +
  P(TAIL, ` fill="${C.fox}"`) + E(44, 0, 11, 13, ` fill="${C.cream}"`) + `</g>`;
const spinArc = (d, op = 1) => line(d, C.foxO, 5.4, ` opacity="${op * 0.55}"`) + line(d, '#ffffff', 3, ` opacity="${op}"`);
// motion swooshes / props
const swoosh = (d, op = 0.8) => line(d, '#ffffff', 3, ` opacity="${op}"`) + line(d, C.foxO, 1, ` opacity="${op * 0.3}"`);
const tiny5 = (x, y, r) => sil(P(star5(x, y, r, r * 0.45)), C.star, C.starO, 1.6);

function finn(pose) {
  uid = 0;
  const pfx = 'f' + pose[0] + pose[1];
  let back = '', front = '', mouth = 'smile', fc = 'open', extra = '', over = '', knot = 0;
  switch (pose) {
    case 'sit': // relaxed in the sling: tail curled, paws on tummy
      back = tail(pfx, 42, 96, 200, 0.95, true) + foot(46, FOOT_CY, -4);
      front = foot(74, FOOT_CY, 4) + arm('M72,76 Q78,86 70,90', 70, 90) ;
      extra = arm('M48,76 Q46,86 52,90', 53, 91);
      break;
    case 'pull': // braced, leaning back, paws gripping forward, feet pushing
      back = tail(pfx, 40, 94, 160, 0.95, false) + leg('M50,100 L42,106', 40, FOOT_CY + 1, -8);
      front = leg('M70,100 Q80,104 86,104', 88, FOOT_CY - 1, -14) + arm('M72,76 Q86,74 96,70', 97, 69);
      extra = arm('M50,76 Q64,70 88,66', 89, 65);
      mouth = 'grin'; fc = 'focus'; knot = -8;
      over = swoosh('M106,62 L116,60') + swoosh('M104,74 L114,74', 0.6);
      break;
    case 'fly': // superhero: arms forward, legs and tail streaming back
      back = tail(pfx, 42, 84, 186, 0.92, false) + leg('M50,98 L28,97', 22, 97, -8);
      front = leg('M60,102 L38,107', 31, 108, 8) + arm('M74,76 Q92,70 106,62', 107, 61);
      extra = arm('M54,72 Q72,62 96,54', 98, 53);
      mouth = 'open'; fc = 'wide'; knot = -22;
      over = swoosh('M4,58 L18,58', 0.7) + swoosh('M6,74 L16,74', 0.5);
      break;
    case 'flutter': // tail spun like a propeller (ghost copies + arcs), arms out
      back = ghostTail(44, 94, 215, 0.82, 0.6) + ghostTail(44, 94, 135, 0.82, 0.6) + tail(pfx, 44, 94, 176, 0.86, false) +
        spinArc('M16,62 A40,40 0 0 0 4,82') + spinArc('M5,108 A40,40 0 0 0 18,124') + spinArc('M22,72 A26,26 0 0 0 18,84', 0.7) +
        foot(48, FOOT_CY, 10);
      front = foot(74, FOOT_CY + 1, -6) + arm('M74,76 Q90,72 100,78', 101, 79);
      extra = arm('M50,76 Q42,70 36,62', 35, 61);
      mouth = 'open'; fc = 'open'; knot = 20;
      break;
    case 'land': // happy arms up
      back = tail(pfx, 42, 94, 230, 0.95, true) + foot(46, FOOT_CY, -4);
      front = foot(74, FOOT_CY, 4) + arm('M74,74 Q88,66 96,52', 97, 50);
      extra = arm('M48,74 Q36,64 30,52', 29, 50);
      mouth = 'big'; fc = 'happy';
      over = tiny5(110, 26, 6) + tiny5(18, 22, 5) + tiny5(116, 46, 3.6);
      break;
    case 'bonk': // dizzy squint, paws flailing, stars
      back = tail(pfx, 40, 94, 196, 0.9, true) + foot(46, FOOT_CY, -12);
      front = foot(74, FOOT_CY - 2, 18) + arm('M74,76 Q90,80 98,90', 99, 92);
      extra = arm('M50,76 Q40,84 34,92', 33, 93);
      mouth = 'wobble'; fc = 'dizzy'; knot = 14;
      over = tiny5(36, 10, 6.5) + tiny5(64, 4, 5) + tiny5(98, 10, 6) +
        line('M30,14 Q64,-2 104,14', C.starO, 1.4, ' opacity=".6" stroke-dasharray="3 4"');
      break;
  }
  const H = head(pfx, { knot });
  const parts = back + extra + body(pfx) + front + H + ears() + face(fc) + MOUTH[mouth] + over;
  return svg(128, 128, parts);
}
// head + paws above a water line at y 84 (everything below clipped)
function finnSplash() {
  uid = 0;
  const pfx = 'fsp';
  const waveD = 'M0,84 Q8,80 16,84 T32,84 T48,84 T64,84 T80,84 T96,84 T112,84 T128,84';
  const clipBody = `<clipPath id="${pfx}w"><path d="M-10,-10 L138,-10 L138,84 ${'Q120,80 112,84 T96,84 T80,84 T64,84 T48,84 T32,84 T16,84 T0,84'.replace(/^Q120,80/, 'Q132,80')} L-10,84 Z"/></clipPath>`;
  const parts = `<g clip-path="url(#${pfx}w)">` +
    body(pfx) + arm('M74,76 Q90,66 96,52', 97, 50) + arm('M48,76 Q36,66 32,54', 31, 52) +
    head(pfx, { knot: 10 }) + ears() + face('wide') + MOUTH.o + `</g>`;
  const water = P(`${waveD} L128,128 L0,128 Z`, ` fill="${C.water}" opacity=".0"`) +
    line(waveD, C.waterO, 7) + line(waveD, C.water, 3.5) +
    // splash crown + drops
    sil(P('M20,84 Q16,70 22,64 Q24,74 30,82 Z') + P('M106,84 Q112,70 108,62 Q102,72 98,82 Z'), C.water, C.waterO, 2) +
    sil(Ci(14, 58, 3.2) + Ci(114, 54, 3) + Ci(26, 50, 2.2) + Ci(104, 44, 2.2), C.water, C.waterO, 1.8) +
    Ci(13, 57, 1, ' fill="#fff"') + Ci(113, 53, 1, ' fill="#fff"') +
    line('M40,90 Q64,94 88,90', C.foam, 2.4, ' opacity=".8"') + line('M30,96 Q64,101 98,96', C.foam, 2, ' opacity=".5"');
  return svg(128, 128, parts + water, clipBody);
}

// ======================================================================
// LEAVES 64×64, centre (32,32)
// ======================================================================
function leafShape() {
  // diagonal tropical leaf, stem bottom-left, tip top-right, with 3 notches per side (palm-ish lobes)
  return 'M12,52 C10,38 16,22 30,14 C38,10 48,8 56,8 C56,16 54,26 50,34 C44,46 30,54 12,52 Z';
}
function leaf(kind) {
  uid = 0;
  const pfx = kind === 'moon' ? 'lm' : 'lf';
  const L = P(leafShape());
  const id = pfx + 'c';
  const f = kind === 'moon' ? C.moon : C.leaf, s = kind === 'moon' ? C.moonS : C.leafS, o = kind === 'moon' ? C.moonO : C.leafO,
    rib = kind === 'moon' ? C.moonO : C.rib, hi = kind === 'moon' ? C.moonL : C.leafL;
  let defs = '', glow = '';
  if (kind === 'moon') {
    defs = `<radialGradient id="lmg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.moonGlow}" stop-opacity=".95"/>` +
      `<stop offset=".55" stop-color="${C.moonGlow}" stop-opacity=".45"/><stop offset="1" stop-color="${C.moonGlow}" stop-opacity="0"/></radialGradient>`;
    glow = Ci(32, 32, 31, ' fill="url(#lmg)"') + Ci(32, 32, 25, ` fill="none" stroke="#fff" stroke-width="1.4" opacity=".55"`);
  }
  // veins from the midrib
  const veins = [[0.25], [0.42], [0.58], [0.74]].map(([t]) => {
    const x = 14 + t * 40, y = 50 - t * 40;
    return line(`M${r1(x)},${r1(y)} Q${r1(x - 2)},${r1(y - 8)} ${r1(x - 6)},${r1(y - 12)}`, rib, 1.6, ' opacity=".7"') +
      line(`M${r1(x)},${r1(y)} Q${r1(x + 7)},${r1(y + 2)} ${r1(x + 11)},${r1(y + 5)}`, rib, 1.6, ' opacity=".7"');
  }).join('');
  const body = glow +
    // white rim first: keeps the leaf readable on teal sea and on dark night
    `<g transform="translate(32 32) scale(${kind === 'moon' ? 0.92 : 1}) translate(-32 -32)">` +
    P(leafShape(), ` fill="none" stroke="#ffffff" stroke-width="${kind === 'moon' ? 0 : 9}" stroke-linejoin="round" opacity=".85"`) +
    sil(L, f, o, 3) +
    `<clipPath id="${id}">${L}</clipPath><g clip-path="url(#${id})">` +
    P('M10,54 L56,6 L64,20 L56,44 L30,62 Z', ` fill="${s}"`) + `</g>` +
    veins +
    line('M8,58 L14,50 Q30,32 54,10', rib, 2.6) +
    line('M8,58 L14,50', o, 3.6) +
    E(24, 30, 7, 2.4, ` fill="${hi}" opacity=".9" transform="rotate(-48 24 30)"`) +
    Ci(36, 18, 1.8, ` fill="${hi}"`) +
    `</g>` +
    (kind === 'moon' ? sil(P(star5(52, 50, 5, 2)), '#fff', C.moonO, 1.2) + sil(P(star5(12, 14, 3.5, 1.4)), '#fff', C.moonO, 1) : '');
  return svg(64, 64, body, defs);
}

// ======================================================================
// RAFT 256×112: deck top y 34, deck spans x 16–240, centre x 128, red X mid-deck, lantern centre (222,6)
// ======================================================================
function raft() {
  uid = 0;
  const pfx = 'rf';
  // deck top surface (slight top view) y 34–48, front log ends row y 46–78, underwater part below y 70
  const deck = P('M16,38 Q16,34 22,34 L234,34 Q240,34 240,38 L242,50 L14,50 Z');
  let planks = '';
  for (let x = 44; x < 240; x += 28) planks += line(`M${x},35 L${x + 1},49`, C.woodS, 2);
  // log ends (front row)
  let logs = '', rings = '';
  const n = 8, w = 228 / n;
  for (let i = 0; i < n; i++) {
    const cx = 14 + w / 2 + i * w;
    logs += Ci(cx, 62, w / 2 + 0.5);
    rings += Ci(cx, 62, w / 2 - 4, ` fill="${C.woodL}"`) + Ci(cx, 62, w / 2 - 9, ` fill="none" stroke="${C.woodS}" stroke-width="1.6"`) + Ci(cx, 62, 1.6, ` fill="${C.woodS}"`);
  }
  // underwater bottom logs (darker, renderer tints them)
  const under = sil(R(18, 66, 220, 26, 13), C.woodD, C.woodO) + line('M30,80 L226,80', C.woodO, 2, ' opacity=".5"');
  const X = line('M102,37 L154,47 M154,37 L102,47', C.redO, 11) + line('M102,37 L154,47 M154,37 L102,47', C.red, 7) +
    line('M108,37.5 L118,40', '#fff', 1.4, ' opacity=".6"');
  // ropes binding the logs
  const ropes = [52, 204].map(x => sil(R(x - 4, 34, 8, 44, 3), C.rope, C.ropeO, 2) + line(`M${x - 4},44 L${x + 4},48 M${x - 4},56 L${x + 4},60 M${x - 4},68 L${x + 4},72`, C.ropeO, 1.2)).join('');
  // lantern post on the right end + lantern (centre 222,6)
  const post = tube('M222,36 L222,14', 5, C.woodS, C.woodO, 2.4);
  const lantern = `<defs><radialGradient id="rfg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.glowA}" stop-opacity=".9"/><stop offset="1" stop-color="${C.glowB}" stop-opacity="0"/></radialGradient></defs>` +
    Ci(222, 7, 14, ' fill="url(#rfg)"') +
    sil(R(214, 2, 16, 11, 4), C.glowB, C.metalO, 2) + R(217, 3.5, 10, 8, 3, ` fill="${C.glowA}"`) + E(222, 7, 2.2, 3, ` fill="#fff"`) +
    sil(R(212, 0.8, 20, 3.4, 1.6) + R(212, 11.6, 20, 3.4, 1.6), C.metal, C.metalO, 1.4);
  const flag = ''; // keep it simple
  const body = under +
    sil(logs, C.wood, C.woodO) + `<g>${rings}</g>` +
    shaded(pfx, deck, C.woodL, C.woodO, C.wood, R(0, 44, 256, 10, 0)) + planks +
    line('M24,37 L120,37', '#fff', 1.6, ' opacity=".4"') +
    ropes + X + post + lantern + flag;
  return svg(256, 112, body);
}

// ======================================================================
// SLING 160×256: palm-trunk Y fork; anchor (80,50); band ties (34,46) & (126,46); torch flame at (20,20); base y 256
// ======================================================================
function sling() {
  uid = 0;
  const pfx = 'sl';
  // trunk + prongs as one silhouette
  const trunk = P('M60,256 C62,220 66,180 68,150 C64,130 50,110 40,88 C34,74 30,60 28,50 L40,44 C44,60 52,82 66,102 C72,112 78,118 80,120 ' +
    'C82,118 88,112 94,102 C108,82 116,60 120,44 L132,50 C130,60 126,74 120,88 C110,110 96,130 92,150 C94,180 98,220 100,256 Z');
  let rings = '';
  for (let y = 162; y < 256; y += 16) rings += line(`M${64 - (y - 160) * 0.04},${y} Q80,${y + 5} ${96 + (y - 160) * 0.04},${y}`, C.palmS, 2.4);
  [[40, 62, -24], [50, 82, -32], [60, 100, -40]].forEach(([x, y, a]) => rings += line(`M${x - 6},${y + 2} L${x + 6},${y - 2}`, C.palmS, 2, ` transform="rotate(${a + 20} ${x} ${y})"`));
  [[120, 62, 24], [110, 82, 32], [100, 100, 40]].forEach(([x, y, a]) => rings += line(`M${x - 6},${y - 2} L${x + 6},${y + 2}`, C.palmS, 2, ` transform="rotate(${a - 20} ${x} ${y})"`));
  const shade = P('M80,124 C86,116 94,104 104,90 L140,40 L160,256 L86,256 C84,210 82,170 84,150 Z');
  const hi = line('M70,170 L68,240', C.palmL, 3, ' opacity=".7"') + line('M38,58 Q44,78 56,94', C.palmL, 2.4, ' opacity=".6"');
  // rope wraps at the band tie points
  const wrap = (x, y) => sil(R(x - 8, y - 4, 16, 9, 4), C.rope, C.ropeO, 2) + line(`M${x - 5},${y - 3} L${x - 2},${y + 4} M${x + 1},${y - 3} L${x + 4},${y + 4}`, C.ropeO, 1.2);
  // little palm tufts on top of each prong tip
  const tuft = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s} 1)">` +
    sil(P('M0,0 Q-10,-12 -20,-8 Q-10,-6 0,0 Z') + P('M0,0 Q-4,-16 4,-22 Q2,-10 0,0 Z') + P('M0,0 Q10,-10 18,-6 Q8,-4 0,0 Z'), C.frond, C.frondO, 2) + `</g>`;
  // torch tied on the left prong, flame centre (20,20)
  const torch = tube('M30,64 L22,34', 5, C.woodS, C.woodO, 2.2) + sil(P('M14,30 L28,30 L25,38 L17,38 Z'), C.metal, C.metalO, 1.8) +
    `<defs><radialGradient id="slg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.glowA}" stop-opacity=".85"/><stop offset="1" stop-color="${C.glowB}" stop-opacity="0"/></radialGradient></defs>` +
    Ci(20, 20, 16, ' fill="url(#slg)"') +
    sil(P('M13,28 Q10,20 15,14 Q16,19 19,18 Q18,10 22,5 Q24,13 27,16 Q30,22 27,28 Z'), C.flame, C.flameO, 1.8) +
    P('M16,28 Q15,23 18,20 Q19,23 21,22 Q22,18 23,15 Q26,21 25,28 Z', ` fill="${C.flameIn}"`) +
    sil(R(24, 50, 9, 6, 2.5), C.rope, C.ropeO, 1.4);
  const body = tuft(33, 42, 1) + tuft(127, 42, -1) +
    shaded(pfx, trunk, C.palm, C.palmO, C.palmS, shade, '') + rings + hi +
    wrap(34, 46) + wrap(126, 46) + torch;
  return svg(160, 256, body);
}

// ======================================================================
// GULL 96×64, centre (48,32), facing right; frame 0 wings up, 1 wings down
// ======================================================================
function gull(f) {
  uid = 0;
  const pfx = 'g' + f;
  const B = E(48, 34, 22, 16) + Ci(66, 26, 11); // round body + head
  const tailD = P('M28,32 L12,26 L16,34 L12,42 L28,38 Z');
  const wingUp = 'M48,32 C40,18 30,8 16,6 C18,12 20,14 24,15 C20,17 22,21 27,21 C24,24 27,28 32,28 C33,32 38,35 44,36 Z';
  const wingDn = 'M50,34 C42,46 30,54 16,58 C18,54 20,52 23,51 C20,49 22,46 26,46 C24,43 27,40 31,40 C34,36 40,34 46,32 Z';
  const wingFarUp = 'M56,28 C60,16 66,8 76,4 C76,10 74,12 71,14 C74,16 72,20 68,20 C70,24 66,27 62,27 Z';
  const wingFarDn = 'M56,38 C60,46 64,52 70,58 C66,58 64,56 62,54 C60,56 57,54 57,51 C54,51 53,47 54,44 Z';
  const far = f === 0 ? wingFarUp : wingFarDn;
  const near = f === 0 ? wingUp : wingDn;
  const tipNear = f === 0 ? P('M16,6 C18,12 20,14 24,15 C22,11 20,8 16,6 Z', ` fill="${C.wingTip}"`) : P('M16,58 C18,54 20,52 23,51 C21,54 19,56 16,58 Z', ` fill="${C.wingTip}"`);
  const tipFar = f === 0 ? P('M76,4 C76,10 74,12 71,14 C72,10 74,7 76,4 Z', ` fill="${C.wingTip}"`) : P('M70,58 C66,58 64,56 62,54 C65,55 68,57 70,58 Z', ` fill="${C.wingTip}"`);
  const body = sil(P(far), C.wingS, C.gullO, 2.5) + tipFar +
    sil(tailD, C.gullS, C.gullO, 2.5) +
    shaded(pfx, B, C.gull, C.gullO, C.gullS, E(50, 46, 26, 9)) +
    // beak
    sil(P('M75,24 Q86,24 90,28 Q84,31 75,30 Z'), C.beak, C.beakO, 2) + line('M76,28 L86,28', C.beakO, 1) +
    // eye + cheek
    Ci(69, 23, 2.8, ` fill="${C.eye}"`) + Ci(70, 22, 1, ' fill="#fff"') + E(68, 30, 3, 1.8, ` fill="${C.gullCheek}" opacity=".8"`) +
    // feet tucked
    line('M44,50 L42,55 M52,50 L52,55', C.beakO, 2.6) +
    sil(P(near), C.wing, C.gullO, 2.5) + tipNear +
    E(40, 26, 6, 2, ` fill="#fff" opacity=".6" transform="rotate(-20 40 26)"`);
  return svg(96, 64, body);
}

// ======================================================================
// HUD hearts 64×64 and app icon 256×256
// ======================================================================
const HEART = 'M32,56 C20,47 6,37 6,22 C6,12 14,6 22,6 C27,6 30,9 32,13 C34,9 37,6 42,6 C50,6 58,12 58,22 C58,37 44,47 32,56 Z';
function heart(empty) {
  uid = 0;
  if (empty) return svg(64, 64, P(HEART, ` fill="${C.emptyF}" fill-opacity=".35" stroke="${C.emptyO}" stroke-width="4" stroke-linejoin="round" stroke-dasharray="0"`) +
    line('M16,18 Q18,12 24,12', C.emptyO, 2.4, ' opacity=".5"'));
  return svg(64, 64, shaded('ht', P(HEART), C.heart, C.heartO, C.heartS, P('M34,58 C46,46 62,36 60,18 L64,64 L30,64 Z')) +
    E(19, 18, 6, 4, ` fill="${C.heartL}" transform="rotate(-30 19 18)"`) + Ci(28, 13, 2, ` fill="#fff" opacity=".9"`));
}
function icon() {
  uid = 0;
  // Finn's head scaled into the icon + a leaf
  const fox = `<g transform="translate(-6 30) scale(1.9)">` + head('ic', { knot: 0 }) + ears() + face('open') + MOUTH.open + `</g>`;
  const lf = leaf('leaf').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\n$/, '').replace(/id="lfc"/, 'id="iclf"').replace(/url\(#lfc\)/, 'url(#iclf)');
  const body = `<defs><linearGradient id="icbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.tealL}"/><stop offset="1" stop-color="${C.tealD}"/></linearGradient></defs>` +
    R(0, 0, 256, 256, 56, ' fill="url(#icbg)"') +
    P('M0,196 Q64,180 128,196 T256,196 L256,200 L256,256 L0,256 Z', ` fill="${C.sea}" opacity=".55"`) +
    line('M20,206 Q60,196 100,206', '#fff', 4, ' opacity=".5"') + line('M150,214 Q190,204 230,214', '#fff', 4, ' opacity=".4"') +
    fox + `<g transform="translate(166 150) rotate(8) scale(1.3)">${lf}</g>`;
  return svg(256, 256, body);
}

// ---------- write ----------
const files = {
  finn_sit: finn('sit'), finn_pull: finn('pull'), finn_fly: finn('fly'), finn_flutter: finn('flutter'),
  finn_land: finn('land'), finn_splash: finnSplash(), finn_bonk: finn('bonk'),
  leaf: leaf('leaf'), leaf_moon: leaf('moon'), raft: raft(), sling: sling(),
  gull_0: gull(0), gull_1: gull(1), heart: heart(false), heart_empty: heart(true), icon: icon(),
};
fs.mkdirSync(OUT, { recursive: true });
for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n + '.svg'), s);
console.log('wrote', Object.keys(files).length, 'files to', OUT);
