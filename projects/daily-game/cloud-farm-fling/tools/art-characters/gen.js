// Nubi's Farm Fling — character & item art generator (DESIGN.md §3, §4).
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette (DESIGN §3) ----------
// Nubi white / pale lavender with a darker lavender-grey outline; yellow/amber ONLY for fireflies.
const C = {
  // Nubi
  cloud: '#f7f8ff', cloudS: '#d9dcf3', cloudO: '#5b5690', cloudL: '#ffffff', crease: '#c3c6e6',
  eye: '#2b2747', mouth: '#7a2f52', tongue: '#ff7f98', cheek: '#ff8fae',
  rain: '#6db8ff', rainO: '#2a68b4', rainL: '#d8eeff',
  sprout: '#74d84c', sproutS: '#43ac3a', sproutO: '#226b2a', sproutL: '#c9ff9c',
  spark: '#ffffff', sparkO: '#6a7fc0',
  // firefly (the only yellow/amber)
  ffBody: '#43456e', ffBodyS: '#2f3052', ffBodyO: '#1f2038', ffGlow: '#e8ff5a', ffGlowS: '#b9e02c', ffGlowO: '#6f8f14', ffHalo: '#eaff7a',
  ffWing: '#eef6ff', ffWingO: '#7f8db8',
  gdGlow: '#ffd23c', gdGlowS: '#f5a623', gdGlowO: '#a8650f', gdHalo: '#ffdf73',
  // wagon (warm red-brown wood)
  wood: '#b8573a', woodS: '#8c3d26', woodO: '#552013', woodL: '#d97b57', woodD: '#6e2c1a',
  soil: '#6e4a33', soilS: '#56382a', soilO: '#3a2215', soilL: '#8e6a4e', thirst: '#3e2617', crack: '#b08a66',
  dry: '#9aa64e', dryO: '#5c6426',
  metal: '#5b6177', metalO: '#30344a', metalL: '#8d93ab',
  // sling post (lighter tan wood, different from the wagon)
  post: '#c48c58', postS: '#9a6638', postO: '#5c3a1c', postL: '#e0b27e',
  ribbon: '#5b7cff', ribbonS: '#3e59cc', ribbonO: '#22337f', ribbonL: '#a9bbff',
  band: '#8a4a2a',
  // bale (pale straw / tan, never firefly yellow)
  straw: '#e2c992', strawS: '#c4a467', strawO: '#86683a', strawL: '#f4e3b8', twine: '#b0573b', twineO: '#6a2c1c',
  grass: '#69bd4b', grassS: '#4c9a3a', grassO: '#2f6b2a', grassL: '#9fe07a', dirt: '#8a6243', dirtO: '#553a26',
  // crops
  tulip: '#ff5a86', tulipS: '#d83564', tulipO: '#8a1d3e', tulipL: '#ffb3c8',
  stem: '#58b845', stemS: '#3c8f34', stemO: '#235f25',
  sunP: '#ef8a2e', sunPS: '#cc6a1e', sunPO: '#7e3c10', sunC: '#6b3b1f', sunCO: '#3a1c0c', sunCL: '#8c5534',
  pump: '#f07b2a', pumpS: '#cf5d17', pumpO: '#7d330c', pumpL: '#ffb070', vine: '#4e9e3a',
  cab: '#8fd27a', cabS: '#62ad55', cabO: '#2f6d34', cabL: '#c8f2b2', snow: '#ffffff', snowS: '#dfe9f7', snowO: '#7d92b8',
  // crow
  crow: '#3f4866', crowS: '#2d3450', crowO: '#1b2034', crowL: '#68739a', beak: '#f2793a', beakO: '#90401a',
  scarf: '#e2475f', scarfS: '#b62f47', scarfO: '#6e1828',
  // hearts
  heart: '#ff5a6e', heartS: '#dc3651', heartO: '#951d34', heartL: '#ffc2cb', emptyF: '#ffffff', emptyO: '#8b6f78',
  // icon sky
  skyT: '#79b8ef', skyB: '#3f84cf', field: '#5fb24a', fieldO: '#3c8233',
};

// ---------- helpers ----------
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
const r1 = v => +v.toFixed(2);
const E = (cx, cy, rx, ry, extra = '') => `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}"${extra}/>`;
const Ci = (cx, cy, r, extra = '') => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"${extra}/>`;
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
const R = (x, y, w, h, rx, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}"${extra}/>`;
// silhouette: shapes drawn thick in the outline colour, then filled on top → one clean outer outline (w px)
const sil = (shapes, fill, out, w = 3, tr = '') =>
  `<g${tr ? ` transform="${tr}"` : ''}><g fill="${out}" stroke="${out}" stroke-width="${2 * w}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="${fill}">${shapes}</g></g>`;
const tube = (d, w, col, out, ow = 3) =>
  `<path d="${d}" fill="none" stroke="${out}" stroke-width="${w + 2 * ow}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
let uid = 0, PFX = 'a';
// shape with outline + a flat shade (clipped) + optional highlight
const shaded = (shapes, fill, out, shade, shadeShapes, hi = '', w = 3, tr = '') => {
  const id = `${PFX}c${uid++}`;
  return `<g${tr ? ` transform="${tr}"` : ''}>` + sil(shapes, fill, out, w) +
    `<clipPath id="${id}">${shapes}</clipPath><g clip-path="url(#${id})" fill="${shade}">${shadeShapes}</g>${hi}</g>`;
};
const star4 = (cx, cy, r) => { // soft 4-point sparkle
  const k = r * 0.28;
  return `M${r1(cx)},${r1(cy - r)} Q${r1(cx + k)},${r1(cy - k)} ${r1(cx + r)},${r1(cy)} Q${r1(cx + k)},${r1(cy + k)} ${r1(cx)},${r1(cy + r)} ` +
    `Q${r1(cx - k)},${r1(cy + k)} ${r1(cx - r)},${r1(cy)} Q${r1(cx - k)},${r1(cy - k)} ${r1(cx)},${r1(cy - r)} Z`;
};
const begin = p => { uid = 0; PFX = p; };

// ======================================================================
// NUBI — 128×128, body centre (64,64) = world position, bottom line y 108, facing RIGHT
// one cloud body of 6 lobes, re-mapped per pose (axis-aligned scale → outlines stay 3 px)
// ======================================================================
// [cx, cy, rx, ry]; fill spans x 11–116, y 20–105 → outline bottom 108
const LOBES = [
  [64, 86, 42, 19],   // flat base
  [30, 77, 19, 18],   // left
  [98, 76, 18, 18],   // right
  [44, 56, 22, 22],   // upper left
  [68, 50, 24, 24],   // top (sprout grows here)
  [93, 59, 19, 19],   // upper right
];
const FACE = [80, 64]; // face centre (between the eyes, slightly right = facing right)
const SPROUT = [69, 27]; // where the stem meets the top lobe
// pose transform: scale (sx, sy) about origin (ox, oy) then translate (tx, ty)
const mapT = (T, x, y) => [T.ox + (x - T.ox) * T.sx + (T.tx || 0), T.oy + (y - T.oy) * T.sy + (T.ty || 0)];
const lobes = (T, dx = 0, dy = 0, grow = 0) => LOBES.map(([cx, cy, rx, ry]) => {
  const [x, y] = mapT(T, cx, cy);
  return E(x + dx, y + dy, rx * T.sx + grow, ry * T.sy + grow);
}).join('');

function sprout(x, y, ang = 0, s = 1) {
  const leafL = 'M0,-10 C-3,-17 -12,-21 -19,-18 C-16,-11 -8,-7 0,-10 Z';
  const leafR = 'M0,-12 C4,-20 13,-24 21,-20 C17,-12 8,-9 0,-12 Z';
  const id = `${PFX}sp`;
  return `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${ang}) scale(${s})">` +
    tube('M0,2 Q-1,-6 0,-12', 3.2, C.sproutS, C.sproutO, 2) +
    sil(P(leafL) + P(leafR), C.sprout, C.sproutO, 2.2) +
    `<clipPath id="${id}">${P(leafL) + P(leafR)}</clipPath><g clip-path="url(#${id})" fill="${C.sproutS}">` +
    P('M-20,-14 C-12,-8 -6,-8 0,-10 L0,-4 L-20,-4 Z') + P('M22,-16 C14,-10 8,-10 0,-12 L0,-6 L22,-6 Z') + `</g>` +
    line('M-2,-11 Q-9,-15 -15,-17', C.sproutO, 1.1, ' opacity=".5"') + line('M2,-13 Q10,-18 17,-20', C.sproutO, 1.1, ' opacity=".5"') +
    E(-10, -17, 3.4, 1.4, ` fill="${C.sproutL}" transform="rotate(-20 -10 -17)"`) + E(11, -20, 3.6, 1.4, ` fill="${C.sproutL}" transform="rotate(-18 11 -20)"`) +
    `</g>`;
}

function cloudBody(T, opts = {}) {
  const B = lobes(T);
  const id = `${PFX}bd`;
  // one-step shade: the body minus a copy shifted up-left → crescent on the lower/right rims
  const cover = `<g fill="${C.cloud}">${lobes(T, -5, -7)}</g>`;
  const [hx, hy] = mapT(T, 52, 38);
  const [h2x, h2y] = mapT(T, 70, 28);
  // soft creases where lobes meet (subtle cloud feel)
  const [c1x, c1y] = mapT(T, 24, 64), [c2x, c2y] = mapT(T, 86, 44), [c3x, c3y] = mapT(T, 104, 64);
  const crease = line(`M${r1(c1x)},${r1(c1y)} q4,-3 9,-2`, C.crease, 2, ' opacity=".9"') +
    line(`M${r1(c2x)},${r1(c2y)} q4,0 7,4`, C.crease, 2, ' opacity=".9"') +
    line(`M${r1(c3x)},${r1(c3y)} q3,1 5,5`, C.crease, 2, ' opacity=".9"');
  return sil(B, C.cloud, C.cloudO, 3) +
    `<clipPath id="${id}">${B}</clipPath><g clip-path="url(#${id})"><g fill="${C.cloudS}">${B}</g>${cover}</g>` +
    crease +
    E(hx, hy, 9 * T.sx, 4.5 * T.sy, ` fill="${C.cloudL}" transform="rotate(-24 ${r1(hx)} ${r1(hy)})"`) +
    Ci(h2x, h2y, 2.6, ` fill="${C.cloudL}"`) + (opts.over || '');
}

// ---- face parts (relative to the face centre) ----
const eyeOpen = (x, y, s = 1) =>
  E(x, y, 5 * s, 6.6 * s, ` fill="${C.eye}"`) + Ci(x + 1.7 * s, y - 2.5 * s, 2.1 * s, ` fill="#fff"`) + Ci(x - 1.6 * s, y + 2.7 * s, 1 * s, ` fill="#fff" opacity=".85"`);
const eyeHappy = (x, y) => line(`M${x - 5},${y + 2} Q${x},${y - 5.5} ${x + 5},${y + 2}`, C.eye, 3.2);
const eyeSqueeze = (x, y, dir) => line(dir > 0 ? `M${x - 4.5},${y - 4.5} L${x + 4},${y} L${x - 4.5},${y + 4.5}` : `M${x + 4.5},${y - 4.5} L${x - 4},${y} L${x + 4.5},${y + 4.5}`, C.eye, 3.2);
const eyeSwirl = (x, y) => {
  let d = '';
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = t * Math.PI * 4.2, r = 0.8 + t * 5.4;
    d += (i ? 'L' : 'M') + r1(x + r * Math.cos(a)) + ',' + r1(y + r * Math.sin(a));
  }
  return line(d, C.eye, 2.2);
};
const eyeDizzyHappy = (x, y) => line(`M${x - 5},${y} Q${x - 2.5},${y - 4} ${x},${y} Q${x + 2.5},${y + 4} ${x + 5},${y}`, C.eye, 3);
function face(kind, fx, fy) {
  const eb = [fx - 11, fy - 1], ef = [fx + 9, fy - 2];
  const cheekL = [fx - 20, fy + 8], cheekR = [fx + 20, fy + 6];
  let e = '', m = '', ch = E(cheekL[0], cheekL[1], 5.2, 3.2, ` fill="${C.cheek}" opacity=".75"`) + E(cheekR[0], cheekR[1], 4.4, 3, ` fill="${C.cheek}" opacity=".75"`);
  const mx = fx - 1, my = fy + 9;
  switch (kind) {
    case 'sit':
      e = eyeOpen(...eb) + eyeOpen(...ef);
      m = line(`M${mx - 5},${my - 1} Q${mx},${my + 4} ${mx + 5},${my - 1}`, C.mouth, 2.6);
      break;
    case 'pull':
      e = eyeSqueeze(eb[0], eb[1], 1) + eyeSqueeze(ef[0], ef[1], -1);
      m = P(`M${mx - 7},${my - 2} Q${mx},${my + 6} ${mx + 7},${my - 2} Q${mx},${my + 1} ${mx - 7},${my - 2} Z`, ` fill="#fff" stroke="${C.mouth}" stroke-width="2.4" stroke-linejoin="round"`);
      break;
    case 'fly':
      e = eyeOpen(eb[0], eb[1], 1.08) + eyeOpen(ef[0], ef[1], 1.1);
      m = P(`M${mx - 7},${my - 2} Q${mx},${my + 11} ${mx + 7},${my - 2} Q${mx},${my} ${mx - 7},${my - 2} Z`, ` fill="${C.mouth}" stroke="${C.mouth}" stroke-width="2.2" stroke-linejoin="round"`) +
        E(mx, my + 4, 3, 1.7, ` fill="${C.tongue}"`);
      break;
    case 'puff':
      e = eyeHappy(eb[0], eb[1] - 1) + eyeHappy(ef[0], ef[1] - 1);
      ch = sil(Ci(cheekL[0] + 1, cheekL[1] - 1, 7), C.cheek, '#e46a8d', 1.4) + sil(Ci(cheekR[0] - 1, cheekR[1] - 1, 6.4), C.cheek, '#e46a8d', 1.4) +
        Ci(cheekL[0] - 1, cheekL[1] - 3, 1.8, ' fill="#fff" opacity=".8"') + Ci(cheekR[0] - 3, cheekR[1] - 3, 1.6, ' fill="#fff" opacity=".8"');
      m = E(mx, my + 1, 2.8, 3.2, ` fill="${C.mouth}"`);
      break;
    case 'rain':
      e = eyeHappy(...eb) + eyeHappy(...ef);
      m = line(`M${mx - 6},${my - 1} Q${mx},${my + 5} ${mx + 6},${my - 1}`, C.mouth, 2.6);
      break;
    case 'plop':
      e = eyeDizzyHappy(...eb) + eyeDizzyHappy(...ef);
      m = P(`M${mx - 8},${my - 3} Q${mx},${my + 7} ${mx + 8},${my - 3} Q${mx},${my - 1} ${mx - 8},${my - 3} Z`, ` fill="${C.mouth}" stroke="${C.mouth}" stroke-width="2" stroke-linejoin="round"`) +
        E(mx + 1, my + 1.5, 2.8, 1.4, ` fill="${C.tongue}"`);
      break;
    case 'bonk':
      e = eyeSwirl(...eb) + eyeSwirl(...ef);
      m = line(`M${mx - 7},${my + 1} Q${mx - 3.5},${my - 2} ${mx},${my + 1} Q${mx + 3.5},${my + 4} ${mx + 7},${my + 1}`, C.mouth, 2.4);
      break;
  }
  return ch + e + m;
}

const sparkle = (x, y, r) => sil(P(star4(x, y, r)), C.spark, C.sparkO, 1.4);
const wisp = (d, op = 1) => line(d, C.cloudO, 5.4, ` opacity="${op * 0.55}"`) + line(d, '#ffffff', 3, ` opacity="${op}"`);
const miniPuff = (x, y, s) => sil(Ci(x - 3 * s, y, 3.4 * s) + Ci(x + 2 * s, y - 1.5 * s, 4 * s) + Ci(x + 5 * s, y + 1 * s, 2.8 * s), C.cloud, C.cloudO, 1.6) +
  Ci(x + 1 * s, y - 3 * s, 1.2 * s, ` fill="${C.cloudL}"`);
const drop = (x, y1, y2) => { const m = y2 - 3.2; return sil(P(`M${x},${y1} Q${x + 1.4},${m - 3} ${x + 2.6},${m} A2.8,2.8 0 1 1 ${x - 2.6},${m} Q${x - 1.4},${m - 3} ${x},${y1} Z`), C.rain, C.rainO, 1.3, `rotate(8 ${x} ${y2})`) +
  Ci(x - 0.8, m - 0.6, 0.9, ` fill="${C.rainL}" transform="rotate(8 ${x} ${y2})"`); };

const POSE = {
  sit: { T: { sx: 1, sy: 1, ox: 64, oy: 105 }, spr: 0 },
  pull: { T: { sx: 1.08, sy: 0.88, ox: 64, oy: 105 }, spr: 12 },                   // squashed / braced
  fly: { T: { sx: 1.09, sy: 0.93, ox: 64, oy: 64, tx: -3, ty: 0 }, spr: -22 },      // stretched slightly back
  puff: { T: { sx: 0.97, sy: 1.03, ox: 64, oy: 105, ty: -2 }, spr: -6 },
  rain: { T: { sx: 1.03, sy: 0.97, ox: 64, oy: 105 }, spr: 4 },
  plop: { T: { sx: 1.12, sy: 0.447, ox: 64, oy: 105, ty: 4 }, spr: 26, sprS: 0.85 }, // pancake y 71–109 (+outline → 112)
  bonk: { T: { sx: 1, sy: 1, ox: 64, oy: 64 }, spr: -18 },
};
function nubi(pose) {
  begin('n' + pose.slice(0, 2));
  const { T, spr, sprS } = POSE[pose];
  const SPR_S = 0.82;
  const [sx, sy] = mapT(T, ...SPROUT);
  let [fx, fy] = mapT(T, ...FACE);
  if (pose === 'plop') fy -= 2;
  let under = '', over = '';
  if (pose === 'fly') {
    under = wisp('M4,58 L16,58', 0.9) + wisp('M2,74 L12,74', 0.7) + wisp('M8,90 L16,90', 0.5);
  } else if (pose === 'puff') {
    over = miniPuff(58, 116, 1.15) + miniPuff(76, 121, 0.75) + line('M66,110 L66,113', C.cloudO, 1.6, ' opacity=".5"');
  } else if (pose === 'rain') {
    [[34, 110, 120], [50, 113, 125], [66, 110, 121], [82, 113, 125], [98, 110, 120]].forEach(([x, a, b]) => { under += drop(x, a, b); });
  } else if (pose === 'plop') {
    under = miniPuff(10, 106, 1) + miniPuff(118, 104, 0.9);
    over = sparkle(30, 60, 4.5) + sparkle(100, 56, 3.5);
  } else if (pose === 'bonk') {
    over = sparkle(30, 12, 6) + sparkle(104, 16, 5.5) + sparkle(16, 34, 3.5) +
      line('M26,20 Q60,2 108,22', C.sparkO, 1.4, ' opacity=".6" stroke-dasharray="3 4"');
  } else if (pose === 'pull') {
    over = line('M118,60 L124,58', C.cloudO, 2, ' opacity=".6"') + line('M118,72 L125,72', C.cloudO, 2, ' opacity=".6"');
  }
  const parts = under + sprout(sx, sy, spr, (sprS || 1) * SPR_S) + cloudBody(T) + face(pose, fx, fy) + over;
  return svg(128, 128, parts);
}

// ======================================================================
// FIREFLY 64×64, centre (32,32): round cute bug, glowing tail, tiny wings, halo ring
// ======================================================================
function firefly(gold) {
  begin(gold ? 'fg' : 'ff');
  const glow = gold ? C.gdGlow : C.ffGlow, glowS = gold ? C.gdGlowS : C.ffGlowS, glowO = gold ? C.gdGlowO : C.ffGlowO, halo = gold ? C.gdHalo : C.ffHalo;
  const haloG = Ci(32, 34, 30, ` fill="${halo}" opacity=".18"`) + Ci(32, 34, 23, ` fill="${halo}" opacity=".22"`) +
    Ci(32, 34, 26, ` fill="none" stroke="${halo}" stroke-width="1.6" opacity=".45"`);
  const tail = Ci(25, 38, 12);
  const head = Ci(41, 27, 10);
  const wings = sil(E(28, 18, 8, 5.5, ' transform="rotate(-28 28 18)"') + E(37, 15, 6.5, 4.5, ' transform="rotate(20 37 15)"'), C.ffWing, C.ffWingO, 1.6) +
    line('M24,20 Q28,17 32,15', C.ffWingO, 1, ' opacity=".5"');
  const body =
    haloG + '<g transform="translate(31 33) scale(1.12) translate(-32 -32)">' +
    shaded(tail, glow, glowO, glowS, Ci(28, 45, 12), Ci(21, 33, 3.4, ' fill="#fff" opacity=".85"') + Ci(27, 31, 1.6, ' fill="#fff" opacity=".8"'), 2.4) +
    // tail segment stripes
    line('M33,30 Q30,38 33,47', glowO, 1.6, ' opacity=".55"') +
    shaded(head, C.ffBody, C.ffBodyO, C.ffBodyS, Ci(46, 31, 8), E(37, 22, 3, 1.6, ` fill="${C.ffWing}" opacity=".5" transform="rotate(-30 37 22)"`), 2.4) +
    // antennae
    line('M44,18 Q46,10 52,8', C.ffBodyO, 1.8) + Ci(52.5, 8, 2, ` fill="${C.ffBodyO}"`) +
    line('M47,19 Q53,14 58,15', C.ffBodyO, 1.8) + Ci(58.5, 15, 2, ` fill="${C.ffBodyO}"`) +
    wings +
    // face
    E(45, 27, 3.4, 4, ' fill="#fff"') + E(46, 27.6, 2.1, 2.7, ` fill="${C.eye}"`) + Ci(46.8, 26.2, 0.9, ' fill="#fff"') +
    E(48, 33, 2.4, 1.3, ` fill="${C.cheek}" opacity=".8"`) + line('M42.5,33.5 Q44.5,35.5 46.5,33.8', '#fff', 1.3, ' opacity=".85"') +
    // tiny legs
    line('M36,37 L34,41 M40,36 L40,40', C.ffBodyO, 1.6) +
    '</g>' + (gold ? sil(P(star4(52, 48, 7)), '#ffffff', glowO, 1.2) + sil(P(star4(10, 16, 4.2)), '#ffffff', glowO, 1) : '');
  return svg(64, 64, body);
}

// ======================================================================
// WAGON 256×128: soil top y 40 (x 16–240), centre x 128, thirsty patch, dry sprouts, wheels bottom y 128
// ======================================================================
function wagon() {
  begin('wg');
  const box = P('M10,50 L246,50 L240,92 Q240,96 236,96 L20,96 Q16,96 16,92 Z');
  let planks = '';
  [62, 78].forEach(y => { planks += line(`M${14 + (y - 46) * 0.1},${y} L${242 - (y - 46) * 0.1},${y}`, C.woodS, 2.2); });
  [[50, 66], [130, 82], [200, 60]].forEach(([x, y]) => { planks += line(`M${x},${y} q8,-2 16,0`, C.woodD, 1.4, ' opacity=".6"'); });
  // corner braces + bolts
  const brace = x => R(x - 6, 50, 12, 46, 2, ` fill="${C.woodD}"`) + Ci(x, 60, 2, ` fill="${C.metalL}"`) + Ci(x, 88, 2, ` fill="${C.metalL}"`);
  const bodyBox = shaded(box, C.wood, C.woodO, C.woodS, P('M0,84 L256,84 L256,100 L0,100 Z') + P('M214,40 L256,40 L256,100 L206,100 Z'),
    line('M22,51 L120,51', C.woodL, 2.4, ' opacity=".8"'), 3) + planks + brace(30) + brace(226) + brace(128);
  // soil: mound filling the box, top line y 40
  const soil = P('M16,52 Q16,40 28,40 L228,40 Q240,40 240,52 Z');
  const soilShape = shaded(soil, C.soil, C.soilO, C.soilS, R(0, 48, 256, 8, 0), '', 2.5);
  const clods = [[40, 43, 3], [70, 42.6, 2.2], [176, 43, 2.6], [214, 42.6, 2.4], [100, 44, 1.8]].map(([x, y, r]) => E(x, y, r * 1.4, r * 0.8, ` fill="${C.soilL}"`)).join('');
  // thirsty patch (bullseye) with cracks
  const thirst = E(128, 45, 36, 5, ` fill="${C.thirst}" stroke="${C.soilO}" stroke-width="1.6"`) +
    line('M98,45 L108,44 L114,46 L122,43.5 L128,46 L136,43.6 L144,46 L150,44 L158,45', C.crack, 1.4) +
    line('M114,46 L112,48.6 M128,46 L130,48.8 M144,46 L146,48.4 M122,43.5 L120,41.6 M136,43.6 L138,41.6', C.crack, 1.1);
  // rim lip over the front edge of the soil
  const rim = sil(R(8, 49, 240, 6.5, 3.2), C.woodL, C.woodO, 2.6) + line('M14,51.2 L240,51.2', '#fff', 1.2, ' opacity=".35"');
  // dry droopy sprouts on the soil
  const drySprout = (x, flip) => {
    const f = flip ? -1 : 1;
    return `<g transform="translate(${x} 43) scale(${f} 1)">` +
      line('M0,0 Q1,-8 4,-12', C.dryO, 2.4) +
      sil(P('M4,-12 Q10,-12 12,-6 Q6,-6 4,-12 Z') + P('M2,-7 Q-4,-9 -7,-4 Q-2,-3 2,-7 Z'), C.dry, C.dryO, 1.3) + `</g>`;
  };
  const sprouts = drySprout(48, false) + drySprout(86, true) + drySprout(170, false) + drySprout(208, true);
  // wheels: centre y 105, r 20 → outline bottom 128
  const wheel = cx => {
    const W = Ci(cx, 105, 20);
    let spokes = '';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; spokes += line(`M${cx},105 L${r1(cx + 13 * Math.cos(a))},${r1(105 + 13 * Math.sin(a))}`, C.woodO, 2.6); }
    return sil(W, C.woodD, C.woodO, 3) + Ci(cx, 105, 14.5, ` fill="${C.wood}"`) + P(`M${cx + 14.5},105 A14.5,14.5 0 0 1 ${cx - 6},${r1(105 + 13.2)} L${cx},105 Z`, ` fill="${C.woodS}"`) +
      spokes + Ci(cx, 105, 14.5, ` fill="none" stroke="${C.woodO}" stroke-width="2"`) +
      sil(Ci(cx, 105, 5), C.metal, C.metalO, 1.6) + Ci(cx - 1.4, 103.6, 1.6, ` fill="${C.metalL}"`) +
      P(`M${cx - 15},${92} A20,20 0 0 1 ${cx + 2},${86.2}`, ` fill="none" stroke="${C.woodL}" stroke-width="2" opacity=".7" stroke-linecap="round"`);
  };
  const body = tube('M64,98 L192,98', 4, C.metal, C.metalO, 2) + soilShape + clods + thirst + sprouts + bodyBox + rim + wheel(64) + wheel(192);
  return svg(256, 128, body);
}

// ======================================================================
// CROPS 64×96, base centre (32,96)
// ======================================================================
const leafPair = (y, s = 1) =>
  sil(P(`M32,${y} Q${32 - 16 * s},${y - 4} ${32 - 22 * s},${y - 18 * s} Q${32 - 8 * s},${y - 14 * s} 32,${y} Z`) +
    P(`M32,${y + 4} Q${32 + 16 * s},${y} ${32 + 22 * s},${y - 14 * s} Q${32 + 8 * s},${y - 10 * s} 32,${y + 4} Z`), C.stem, C.stemO, 2.4) +
  line(`M31,${y - 1} Q${32 - 11 * s},${y - 6} ${32 - 18 * s},${y - 15 * s}`, C.stemS, 1.4) +
  line(`M33,${y + 3} Q${32 + 11 * s},${y - 2} ${32 + 18 * s},${y - 11 * s}`, C.stemS, 1.4);
function crop(kind) {
  begin('cr' + kind[0] + kind[1]);
  let body = '';
  if (kind === 'spring') { // tulip
    const cup = P('M18,22 Q16,40 32,46 Q48,40 46,22 L40,30 L32,16 L24,30 Z');
    body = tube('M32,94 Q30,70 32,42', 4, C.stem, C.stemO, 2.2) + leafPair(84, 1) +
      shaded(cup, C.tulip, C.tulipO, C.tulipS, P('M32,16 L46,22 Q48,40 32,46 Z'),
        P('M24,30 L32,16 L32,46 Q22,42 24,30 Z', ` fill="${C.tulip}"`) + line('M32,18 L32,44', C.tulipS, 1.4) +
        E(22, 30, 2, 5, ` fill="${C.tulipL}" transform="rotate(10 22 30)"`), 2.6);
  } else if (kind === 'summer') { // small orange-brown sunflower
    let petals = '';
    for (let i = 0; i < 12; i++) { const a = i * 30; petals += E(32, 14, 4.6, 9, ` transform="rotate(${a} 32 30)"`); }
    body = tube('M32,94 Q35,70 32,40', 4.4, C.stem, C.stemO, 2.2) + leafPair(78, 0.95) +
      sil(petals, C.sunP, C.sunPO, 2) +
      `<g fill="${C.sunPS}">${[15, 75, 135].map(a => E(32, 15, 2.2, 6, ` transform="rotate(${a} 32 30)"`)).join('')}</g>` +
      shaded(Ci(32, 30, 10), C.sunC, C.sunCO, C.sunCO, Ci(36, 34, 9)) +
      [[28, 26], [33, 25], [37, 29], [29, 31], [34, 31]].map(([x, y]) => Ci(x, y, 1.2, ` fill="${C.sunCL}"`)).join('');
  } else if (kind === 'autumn') { // pumpkin with vine
    const pk = E(32, 77, 26, 17);
    body = line('M32,62 Q44,46 50,52 Q56,58 48,60 Q44,58 46,55', C.vine, 2.4) +
      sil(P('M30,62 Q14,50 10,38 Q22,38 30,46 Q32,40 40,36 Q38,50 30,62 Z'), C.stem, C.stemO, 2.2) +
      line('M29,58 Q20,48 14,41', C.stemS, 1.4) +
      shaded(pk, C.pump, C.pumpO, C.pumpS, E(38, 84, 24, 12),
        E(18, 72, 4, 7, ` fill="${C.pumpL}" opacity=".85" transform="rotate(20 18 72)"`), 3) +
      line('M32,61 Q22,77 32,93', C.pumpO, 2, ' opacity=".55"') + line('M32,61 Q42,77 32,93', C.pumpO, 2, ' opacity=".55"') +
      line('M32,61 Q10,72 16,91', C.pumpO, 1.6, ' opacity=".4"') + line('M32,61 Q54,72 48,91', C.pumpO, 1.6, ' opacity=".4"') +
      tube('M32,62 Q31,56 34,52', 5, '#7a6a2e'.replace('#7a6a2e', '#6d7a34'), C.stemO, 2);
  } else { // winter cabbage with snow cap
    const cab = Ci(32, 72, 22);
    body = sil(P('M8,86 Q2,70 14,60 Q16,76 22,86 Z') + P('M56,86 Q62,70 50,60 Q48,76 42,86 Z'), C.cabS, C.cabO, 2.4) +
      shaded(cab, C.cab, C.cabO, C.cabS, Ci(38, 78, 21),
        line('M32,92 Q24,74 32,58', C.cabO, 1.6, ' opacity=".5"') + line('M32,92 Q42,76 38,58', C.cabO, 1.6, ' opacity=".5"') +
        line('M20,84 Q16,74 22,64', C.cabL, 2, ' opacity=".8"'), 3) +
      // veined front leaf
      sil(P('M14,80 Q24,70 32,74 Q40,70 50,80 Q42,94 32,94 Q22,94 14,80 Z'), C.cabL, C.cabO, 2.2) +
      line('M32,76 L32,92 M32,82 L25,78 M32,86 L39,82', C.cabS, 1.4) +
      // snow cap on top
      sil(P('M12,62 Q14,48 32,48 Q50,48 52,62 Q46,66 42,62 Q38,67 32,62 Q26,67 22,62 Q17,66 12,62 Z'), C.snow, C.snowO, 2.2) +
      P('M30,62 Q38,66 42,62 Q46,66 52,62 Q51,56 48,54 Q44,60 30,62 Z', ` fill="${C.snowS}"`) +
      E(24, 53, 5, 1.8, ` fill="#fff"`) + sparkle(54, 42, 4);
  }
  return svg(64, 96, body);
}

// ======================================================================
// SLING 160×256: wooden Y-fork fence post; anchor (80,50); band ties (34,46) & (126,46); base y 256
// ======================================================================
function sling() {
  begin('sl');
  const post = P('M62,256 L64,150 C58,128 44,106 36,84 C31,70 28,56 27,40 Q27,34 33,34 L37,34 Q41,34 41,40 ' +
    'C43,58 50,80 64,100 C70,108 76,114 80,116 C84,114 90,108 96,100 C110,80 117,58 119,40 Q119,34 123,34 L127,34 Q133,34 133,40 ' +
    'C132,56 129,70 124,84 C116,106 102,128 96,150 L98,256 Z');
  const shade = P('M80,120 C88,112 98,100 108,84 L140,30 L160,256 L84,256 L82,150 Z') + P('M0,40 L30,40 L32,48 L0,48 Z');
  // wood grain
  let grain = line('M72,160 Q70,200 73,250', C.postS, 2, ' opacity=".7"') + line('M86,170 Q88,210 86,244', C.postS, 1.6, ' opacity=".6"') +
    line('M34,52 Q38,72 48,88', C.postS, 1.6, ' opacity=".6"') + line('M124,54 Q120,72 112,88', C.postS, 1.6, ' opacity=".6"') +
    E(76, 196, 3, 6, ` fill="none" stroke="${C.postO}" stroke-width="1.6" opacity=".7"`) + Ci(76, 196, 1.2, ` fill="${C.postO}" opacity=".7"`);
  const hi = line('M68,160 L67,236', C.postL, 3, ' opacity=".8"') + line('M33,44 Q35,62 42,78', C.postL, 2.4, ' opacity=".8"') +
    line('M122,44 Q121,52 119,60', C.postL, 2, ' opacity=".55"');
  // band tie wraps
  const wrap = (x, y) => sil(R(x - 9, y - 4, 18, 9, 4), C.band, '#4a2412', 2) + line(`M${x - 5},${y - 3} L${x - 2},${y + 4} M${x + 1},${y - 3} L${x + 4},${y + 4}`, '#4a2412', 1.2);
  // blue ribbon bow on the left prong (no yellow)
  const bow = `<g transform="translate(36 70) rotate(-18)">` +
    sil(P('M0,0 Q-14,-12 -18,-2 Q-16,8 0,0 Z') + P('M0,0 Q14,-12 18,-2 Q16,8 0,0 Z') +
      P('M-2,1 L-10,18 L-5,15 L-3,20 Z') + P('M2,1 L8,19 L3,16 L1,20 Z'), C.ribbon, C.ribbonO, 1.8) +
    P('M0,0 Q-10,-2 -16,-1 Q-14,4 0,0 Z', ` fill="${C.ribbonS}"`) + P('M0,0 Q10,-2 16,-1 Q14,4 0,0 Z', ` fill="${C.ribbonS}"`) +
    sil(Ci(0, 0, 3.6), C.ribbonS, C.ribbonO, 1.6) + E(-10, -5, 3, 1.4, ` fill="${C.ribbonL}" transform="rotate(-30 -10 -5)"`) + `</g>`;
  // a few nail heads + grass tuft at the base
  const nails = Ci(72, 140, 2, ` fill="${C.metal}"`) + Ci(88, 140, 2, ` fill="${C.metal}"`);
  const body = shaded(post, C.post, C.postO, C.postS, shade, '') + grain + hi + nails +
    wrap(34, 46) + wrap(126, 46) + bow;
  return svg(160, 256, body);
}

// ======================================================================
// BALE 480×220: hay bale + grass patch; top surface y 40, left edge = world x 0, right edge x 460 (BALE_X 4.6)
// grass top (world y 0) is at svg y 160
// ======================================================================
function bale() {
  begin('bl');
  // grass mound below and around the bale foot (y 150–220)
  const mound = P('M0,150 Q80,140 240,146 Q400,140 470,152 Q480,170 476,220 L0,220 Z');
  let tufts = '';
  for (let x = 6; x < 476; x += 22) {
    const h = 8 + ((x * 7) % 9);
    tufts += P(`M${x},152 L${x + 4},${152 - h} L${x + 8},151 L${x + 12},${152 - h * 0.7} L${x + 16},152 Z`);
  }
  const grass = sil(tufts + mound, C.grass, C.grassO, 2.4) +
    P('M0,184 Q240,172 476,186 L476,220 L0,220 Z', ` fill="${C.grassS}"`) +
    line('M20,162 Q120,154 220,160', C.grassL, 3, ' opacity=".7"');
  // bale block: top face y 40–56 (lighter), front y 56–164
  const block = P('M6,52 Q6,40 18,40 L448,40 Q460,40 460,52 L460,152 Q460,164 448,164 L18,164 Q6,164 6,152 Z');
  let straw = '';
  const rnd = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 90; i++) {
    const x = 16 + rnd(i) * 430, y = 62 + rnd(i + 99) * 94, l = 8 + rnd(i + 7) * 12, a = (rnd(i + 3) - 0.5) * 0.5;
    straw += `M${r1(x)},${r1(y)} l${r1(l * Math.cos(a))},${r1(l * Math.sin(a))} `;
  }
  const strawLines = line(straw, C.strawS, 1.6, ' opacity=".85"');
  let strawHi = '';
  for (let i = 0; i < 26; i++) {
    const x = 18 + rnd(i + 300) * 420, y = 64 + rnd(i + 400) * 60;
    strawHi += `M${r1(x)},${r1(y)} l${r1(8 + rnd(i) * 6)},${r1((rnd(i + 5) - 0.5) * 3)} `;
  }
  const top = P('M10,54 Q8,42 18,42 L448,42 Q458,42 458,54 Z');
  const balePart = shaded(block, C.straw, C.strawO, C.strawS, R(0, 134, 480, 40, 0) + R(430, 30, 60, 140, 0),
    '', 3) +
    P('M9,56 L457,56', ` stroke="${C.strawO}" stroke-width="2" opacity=".5"`) +
    `<g>${top.replace('/>', ` fill="${C.strawL}"/>`)}</g>` + strawLines + line(strawHi, C.strawL, 1.6) +
    // poking straws along the top edge
    line('M30,42 l-4,-7 M64,42 l3,-8 M150,42 l-2,-6 M300,42 l4,-7 M380,42 l-3,-8 M430,42 l2,-6', C.strawS, 1.8);
  // twine bands
  const twine = x => tube(`M${x},41 L${x + 2},163`, 5, C.twine, C.twineO, 1.8) + line(`M${x - 1},44 L${x + 1},160`, '#e98a6a', 1.2, ' opacity=".6"');
  const body = grass + balePart + twine(120) + twine(340) +
    // a few grass blades in front of the bale foot
    sil(P('M30,166 L36,150 L40,166 Z') + P('M180,166 L184,152 L190,166 Z') + P('M300,166 L306,148 L310,166 Z') + P('M420,166 L424,152 L430,166 Z'), C.grass, C.grassO, 1.6);
  return svg(480, 220, body);
}

// ======================================================================
// CROW 96×64, centre (48,32), facing right; frame 0 wings up, 1 wings down; red scarf
// ======================================================================
function crow(f) {
  begin('cw' + f);
  const B = E(44, 36, 23, 17) + Ci(64, 27, 13);
  const tailD = P('M24,34 L8,26 L12,34 L6,40 L12,42 L24,42 Z');
  const wingUp = 'M46,32 C40,18 32,8 20,4 C20,10 22,13 25,15 C21,16 22,20 27,21 C24,24 27,28 32,29 Z';
  const wingDn = 'M48,34 C42,46 32,54 20,58 C21,53 23,51 26,50 C22,48 24,45 28,45 C25,42 28,39 32,39 Z';
  const farUp = 'M54,28 C56,16 62,8 72,4 C72,10 70,13 67,15 C70,17 68,21 64,21 C66,25 62,28 58,28 Z';
  const farDn = 'M54,40 C58,48 62,54 68,59 C64,59 62,57 60,55 C58,57 55,55 55,52 C52,52 51,48 52,45 Z';
  const body =
    sil(P(f === 0 ? farUp : farDn), C.crowS, C.crowO, 2.5) +
    sil(tailD, C.crowS, C.crowO, 2.5) +
    shaded(B, C.crow, C.crowO, C.crowS, E(48, 50, 28, 9), E(36, 26, 6, 2.4, ` fill="${C.crowL}" opacity=".8" transform="rotate(-20 36 26)"`), 2.8) +
    // feet tucked
    line('M40,52 L38,57 M48,52 L48,57', C.beakO, 2.4) +
    // scarf around the neck + flapping tail
    sil(P('M50,30 Q60,40 74,34 L75,40 Q60,46 49,37 Z') + P('M52,34 Q44,42 36,40 Q40,46 34,50 Q46,50 55,38 Z'), C.scarf, C.scarfO, 1.8) +
    line('M52,36 Q60,42 72,37', C.scarfS, 1.6) + line('M42,43 L46,47', C.scarfS, 1.4) +
    // beak
    sil(P('M75,24 Q86,25 90,28 Q84,32 75,31 Z'), C.beak, C.beakO, 1.8) + line('M76,28 L86,28.4', C.beakO, 1) +
    // big friendly eye
    sil(Ci(68, 22, 5.6), '#ffffff', C.crowO, 1.4) + Ci(69.4, 22.4, 3.2, ` fill="${C.eye}"`) + Ci(70.4, 21, 1.2, ' fill="#fff"') +
    E(70, 31, 3, 1.6, ` fill="${C.cheek}" opacity=".7"`) +
    // little head tuft
    line('M60,15 Q58,9 62,7 M64,14 Q65,9 69,9', C.crowO, 2) +
    sil(P(f === 0 ? wingUp : wingDn), C.crowL, C.crowO, 2.5) +
    line(f === 0 ? 'M42,26 Q34,16 24,9' : 'M42,40 Q34,48 25,53', C.crowS, 1.4, ' opacity=".7"');
  return svg(96, 64, body);
}

// ======================================================================
// HUD hearts 64×64 and app icon 256×256
// ======================================================================
const HEART = 'M32,56 C20,47 6,37 6,22 C6,12 14,6 22,6 C27,6 30,9 32,13 C34,9 37,6 42,6 C50,6 58,12 58,22 C58,37 44,47 32,56 Z';
function heart(empty) {
  begin(empty ? 'he' : 'ht');
  if (empty) return svg(64, 64, P(HEART, ` fill="${C.emptyF}" fill-opacity=".35" stroke="${C.emptyO}" stroke-width="4" stroke-linejoin="round"`) +
    line('M16,18 Q18,12 24,12', C.emptyO, 2.4, ' opacity=".5"'));
  return svg(64, 64, shaded(P(HEART), C.heart, C.heartO, C.heartS, P('M34,58 C46,46 62,36 60,18 L64,64 L30,64 Z')) +
    E(19, 18, 6, 4, ` fill="${C.heartL}" transform="rotate(-30 19 18)"`) + Ci(28, 13, 2, ` fill="#fff" opacity=".9"`));
}
const inner = (s, a, b) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\n$/, '').replace(new RegExp(`id="${a}`, 'g'), `id="${b}`).replace(new RegExp(`url\\(#${a}`, 'g'), `url(#${b}`);
function icon() {
  const nb = inner(nubi('fly'), 'nfl', 'icn');
  const ff = inner(firefly(false), 'ff', 'icf');
  begin('ic');
  const body = `<defs><linearGradient id="icbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.skyT}"/><stop offset="1" stop-color="${C.skyB}"/></linearGradient>` +
    `<clipPath id="icrr">${R(0, 0, 256, 256, 56)}</clipPath></defs>` +
    `<g clip-path="url(#icrr)">` + R(0, 0, 256, 256, 0, ' fill="url(#icbg)"') +
    E(40, 70, 40, 12, ' fill="#fff" opacity=".18"') + E(210, 44, 34, 10, ' fill="#fff" opacity=".14"') +
    P('M0,214 Q70,198 140,210 T256,206 L256,256 L0,256 Z', ` fill="${C.field}" stroke="${C.fieldO}" stroke-width="3"`) +
    P('M0,232 Q90,222 180,232 T256,230 L256,256 L0,256 Z', ` fill="${C.fieldO}" opacity=".45"`) +
    `<g transform="translate(2 34) scale(1.8)">${nb}</g>` +
    `<g transform="translate(170 12) scale(1.22)">${ff}</g>` + `</g>`;
  return svg(256, 256, body);
}

// ---------- write ----------
const files = {
  nubi_sit: nubi('sit'), nubi_pull: nubi('pull'), nubi_fly: nubi('fly'), nubi_puff: nubi('puff'),
  nubi_rain: nubi('rain'), nubi_plop: nubi('plop'), nubi_bonk: nubi('bonk'),
  firefly: firefly(false), firefly_gold: firefly(true), wagon: wagon(),
  crop_spring: crop('spring'), crop_summer: crop('summer'), crop_autumn: crop('autumn'), crop_winter: crop('winter'),
  sling: sling(), bale: bale(), crow_0: crow(0), crow_1: crow(1),
  heart: heart(false), heart_empty: heart(true), icon: icon(),
};
fs.mkdirSync(OUT, { recursive: true });
for (const [n, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n + '.svg'), s);
// remove the obsolete fox-game assets (only our own files; levels/ and particles/ belong to the environment artist)
for (const old of ['finn_sit', 'finn_pull', 'finn_fly', 'finn_flutter', 'finn_land', 'finn_splash', 'finn_bonk', 'leaf', 'leaf_moon', 'raft', 'rock', 'gull_0', 'gull_1']) {
  const f = path.join(OUT, old + '.svg');
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
console.log('wrote', Object.keys(files).length, 'files to', OUT);
