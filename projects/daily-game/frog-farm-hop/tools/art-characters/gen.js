// Clover's Farm Hop — character & item art generator (DESIGN.md §3, §4.1).
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette (DESIGN §3) ----------
const C = {
  g: '#7ed957', gs: '#4fae3b', go: '#2f6b2a', gl: '#b6f08f',
  belly: '#fff3c4', bellyS: '#f1d98f', cheek: '#ff9eb5', eye: '#2b2440',
  mouth: '#8a2f4a', tongue: '#ff7f98',
  hat: '#ffd23f', hatS: '#f0ae1e', hatO: '#b8860b', hatL: '#fff3a8',
  ffGlow: '#fff27a', ffAmber: '#ffb627', ffWing: '#e8f6ff', ffBody: '#5a3d5c', ffBodyO: '#3a2540',
  hay: '#e8b84a', hayS: '#c08a2a', hayO: '#8a5a2a', hayL: '#f7d77e', twine: '#8a5a2a',
  wood: '#b97a45', woodS: '#8a5530', woodO: '#5e3a1f', woodL: '#d69a62',
  red: '#d9534f', redS: '#a8322f', redO: '#6e1f1d', redL: '#f08a7e',
  white: '#ffffff', lilac: '#c9d6ff', cloudO: '#8696d4',
  metal: '#9aa7b8', metalS: '#6f7c8e', metalO: '#46505e', metalL: '#d6dee8', cap: '#ff5a5f', capS: '#d83c43', capO: '#8e1f26',
  mat: '#3b82c4', matS: '#2a5f94', matO: '#1d3f66', frame: '#ffd23f', frameS: '#e0a817', frameO: '#9c6f08',
  heart: '#ff6b6b', heartS: '#e04848', heartO: '#a8323a',
  glass: '#dff3ff', glassO: '#5f86a3',
  vaneArrow: '#e2574c', vaneO: '#6e2a24', post: '#8a5530',
};

const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
const E = (cx, cy, rx, ry, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${extra}/>`;
const Ci = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${extra}/>`;
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
// silhouette: shapes drawn once thick in the outline colour, then filled on top → one clean outer outline (≈3 px)
const sil = (shapes, fill, out, w = 3, tr = '') =>
  `<g${tr ? ` transform="${tr}"` : ''}><g fill="${out}" stroke="${out}" stroke-width="${2 * w}" stroke-linejoin="round">${shapes}</g>` +
  `<g fill="${fill}">${shapes}</g></g>`;
// a limb as a rounded tube with outline
const tube = (d, w, col, out) =>
  `<path d="${d}" fill="none" stroke="${out}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// ---------- Clover ----------
// webbed paw in local coords pointing +x, sole at local y ≈ +3.2
const pawShapes = E(0, 0, 7.5, 3.4) + Ci(5.5, 0.5, 2.8) + Ci(9.6, 0.4, 2.8) + Ci(13.2, -0.4, 2.6);
const paw = (x, y, ang = 0, s = 1, flip = false) =>
  sil(pawShapes, C.g, C.go, 3 / s, `translate(${x} ${y}) rotate(${ang}) scale(${flip ? -s : s} ${s})`);
const hand = (x, y, ang = 0, s = 0.78) => {
  const sh = Ci(0, 0, 5) + Ci(5, -3.2, 2.7) + Ci(6.2, 0.6, 2.7) + Ci(4.4, 4.2, 2.6);
  return sil(sh, C.g, C.go, 3 / s, `translate(${x} ${y}) rotate(${ang}) scale(${s})`);
};
// sitting foot on the feet line (fill bottom 115.6 → outline bottom ≈ 118.6)
const FOOT_Y = 112.4;
const groundFoot = (x, dir = 1) => paw(x, FOOT_Y, 0, 1, dir < 0);
// haunch (thigh) with shading
let uid = 0;
const thigh = (cx, cy, rx, ry, rot) => {
  const id = 'th' + (uid++);
  const sh = E(cx, cy, rx, ry, ` transform="rotate(${rot} ${cx} ${cy})"`);
  return sil(sh, C.g, C.go) + `<clipPath id="${id}">${sh}</clipPath><g clip-path="url(#${id})">` +
    E(cx - rx * 0.25, cy + ry * 0.55, rx * 1.1, ry * 0.75, ` fill="${C.gs}" transform="rotate(${rot} ${cx} ${cy})"`) + `</g>` +
    E(cx - rx * 0.3, cy - ry * 0.45, rx * 0.32, ry * 0.18, ` fill="#fff" opacity=".45" transform="rotate(${rot - 10} ${cx} ${cy})"`);
};

// HEAD — identical geometry in every frame
const HEAD = E(66, 58, 40, 26);
const head = (P0) => {
  const id = P0 + 'hd';
  return `<clipPath id="${id}">${HEAD}</clipPath><g clip-path="url(#${id})">` +
    `<rect x="20" y="28" width="92" height="62" fill="${C.gs}"/>` + E(70, 54.5, 39, 25.5, ` fill="${C.g}"`) + `</g>` +
    // little brow bumps behind the eyes (frog cue, peeking under the brim)
    E(38, 52, 5, 2.4, ` fill="#fff" opacity=".42" transform="rotate(-38 38 52)"`);
};
const body = (P0, cx, cy, rx, ry) => {
  const id = P0 + 'bd', id2 = P0 + 'bl';
  const B = E(cx, cy, rx, ry);
  const bx = cx + 8, by = cy + 5, brx = rx * 0.6, bry = ry * 0.66;
  const BL = E(bx, by, brx, bry);
  return `<clipPath id="${id}">${B}</clipPath><g clip-path="url(#${id})">` +
    `<rect x="0" y="0" width="128" height="128" fill="${C.gs}"/>` + E(cx + 5, cy - 4, rx * 0.98, ry * 0.94, ` fill="${C.g}"`) + `</g>` +
    `<clipPath id="${id2}">${BL}</clipPath>` + BL.replace('/>', ` fill="${C.belly}"/>`) +
    `<g clip-path="url(#${id2})">${E(bx - 5, by + bry * 0.95, brx * 1.1, bry * 0.55, ` fill="${C.bellyS}"`)}</g>`;
};
// eyes
const EYES = { far: [55, 56.5, 7.6, 10], near: [83, 57, 8.6, 10.8] };
const eyeOpen = (k, big = false) => {
  const [x, y, rx, ry] = EYES[k];
  const s = big ? 1.15 : 1;
  return E(x, y, rx, ry, ` fill="${C.eye}"`) + Ci(x + 2.4 * s, y - 4.2, 3.3 * s, ' fill="#fff"') + Ci(x - 2.6, y + 4, 1.5, ' fill="#fff"');
};
const eyesOpen = (big) => eyeOpen('far', big) + eyeOpen('near', big);
const eyesHappy = () => line('M49,59 Q55,49.5 61,59', C.eye, 3.6) + line('M76.5,59.5 Q83,49 89.5,59.5', C.eye, 3.6);
const eyesOuch = () => line('M50,51 L60,56.5 L50,62', C.eye, 3.6) + line('M89,51 L78,57 L89,63', C.eye, 3.6);
const eyesFocus = () => // determined: open eyes with a lid line on top
  eyesOpen(false) + `<g fill="${C.g}">${P('M46,47 L64,47 L64,51 Q55,49 46,52 Z')}${P('M73,46 L93,46 L93,52 Q83,49 73,51 Z')}</g>` +
  line('M47,51.5 Q55,49 63,51', C.go, 2.2) + line('M74,51 Q83,48.6 92,51.5', C.go, 2.2);
const cheeks = () => E(45, 68.5, 5, 3, ` fill="${C.cheek}" opacity=".85"`) + E(93.5, 70, 5.6, 3.3, ` fill="${C.cheek}" opacity=".9"`);
const nostrils = () => Ci(99, 61.5, 1.2, ` fill="${C.go}"`) + Ci(103, 60.8, 1.1, ` fill="${C.go}"`);
const MOUTH = {
  smile: () => line('M62,69 Q75,79.5 88,68', C.go, 2.8),
  grin: () => line('M64,70 Q75,76 86,69.5', C.go, 2.8),
  open: () => P('M61,68 Q75,70 89,67 Q87,83 75,83 Q63,83 61,68 Z', ` fill="${C.mouth}" stroke="${C.go}" stroke-width="2.6" stroke-linejoin="round"`) +
    P('M66,78.5 Q75,73.5 84,78.3 Q80,82 75,82 Q69,82 66,78.5 Z', ` fill="${C.tongue}"`),
  o: () => E(75, 74, 4.6, 5.6, ` fill="${C.mouth}" stroke="${C.go}" stroke-width="2.6"`),
  wobble: () => line('M63,73 q3,-3 6,0 q3,3 6,0 q3,-3 6,0 q3,3 6,0', C.go, 2.6),
};
// HAT: sou'wester, back brim (left) longer; a little clover badge
const hat = (tr = '') => {
  const crown = P('M39,38 C38,19 52,10 66,10 C81,10 94,18 93,37 Z');
  const brim = P('M15,43 C19,33 40,33.5 66,33.5 C89,33.5 104,32 111,37.5 C109,44 96,44.5 66,44 C42,43.6 27,48.5 15,43 Z');
  return `<g${tr ? ` transform="${tr}"` : ''}>` +
    sil(crown, C.hat, C.hatO) +
    `<clipPath id="hatc${uid}">${crown}</clipPath><g clip-path="url(#hatc${uid++})">` +
    E(46, 34, 14, 26, ` fill="${C.hatS}"`) + `<rect x="36" y="31" width="60" height="4.5" fill="${C.hatS}"/></g>` +
    P('M54,16 Q60,12.5 67,12.6', ` fill="none" stroke="${C.hatL}" stroke-width="3.4" stroke-linecap="round"`) +
    sil(brim, C.hat, C.hatO) +
    line('M22,43 C34,42 46,40.6 66,40.8 C86,41 98,40.6 106,39.6', C.hatS, 3) +
    // clover badge (three leaves + stem)
    `<g transform="translate(79 23)">` + line('M0,2 q1.5,4 3.4,5.5', C.go, 1.8) +
    sil(Ci(-2.6, -0.4, 3.1) + Ci(2.6, -0.4, 3.1) + Ci(0, -4.6, 3.1), C.g, C.go, 1.3) + Ci(-0.4, -3, 1, ' fill="#fff" opacity=".6"') + `</g>` +
    `</g>`;
};
const star = (x, y, r, col = '#ffe066', out = C.hatO) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r;
    d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1);
  }
  return P(d + 'Z', ` fill="${col}" stroke="${out}" stroke-width="2" stroke-linejoin="round"`);
};

// frame definitions: far limbs (behind), body, near limbs (front), eyes, mouth, hat transform, extras
const FRAMES = {
  idle: {
    far: tube('M60,96 Q66,106 68,111', 7, C.g, C.go) + paw(69, FOOT_Y, 0, 0.82),
    body: [60, 92, 32, 22],
    near: thigh(42, 101, 18, 13, -18) + groundFoot(40, 1) + groundFoot(26, -1) +
      tube('M82,84 Q90,98 86,110', 8, C.g, C.go) + paw(87, FOOT_Y, 0, 0.88),
    eyes: () => eyesOpen(false), mouth: 'smile', hat: '',
  },
  crouch: {
    far: tube('M60,100 Q70,108 72,111', 7, C.g, C.go) + paw(74, FOOT_Y, 0, 0.82),
    body: [60, 96, 36, 20],
    near: thigh(34, 104, 20, 11, -8) + groundFoot(18, -1) + groundFoot(38, 1) +
      tube('M86,90 Q98,102 96,110', 8, C.g, C.go) + paw(97, FOOT_Y, 0, 0.9),
    eyes: () => eyesFocus(), mouth: 'grin', hat: '',
  },
  up: {
    far: tube('M42,84 Q30,76 22,64', 7, C.g, C.go) + hand(21, 60, -110) +
      tube('M64,100 L65,104', 8, C.g, C.go) + paw(65, 104, 80, 0.7),
    body: [62, 90, 30, 22],
    near: tube('M52,100 L53,104', 9, C.g, C.go) + paw(53, 104.5, 86, 0.74) +
      tube('M86,80 Q100,72 108,60', 8, C.g, C.go) + hand(110, 56, -70),
    eyes: () => eyesOpen(false), mouth: 'open', hat: 'translate(0 -5) rotate(-9 66 34)',
  },
  fall: {
    far: tube('M42,86 Q28,82 16,74', 7, C.g, C.go) + hand(13, 72, -160) +
      tube('M80,104 Q96,108 106,112', 8, C.g, C.go) + paw(108, 112, 10, 0.9),
    body: [62, 92, 30, 21],
    near: thigh(40, 103, 15, 11, 18) + tube('M38,106 Q30,111 23,111', 9, C.g, C.go) + paw(23, 111, 172, 0.92, false) +
      tube('M88,80 Q106,66 106,44', 8, C.g, C.go) + hand(106, 40, -88),
    eyes: () => eyesOpen(true), mouth: 'o', hat: 'translate(0 -5)',
  },
  ouch: {
    far: tube('M60,96 Q66,106 68,111', 7, C.g, C.go) + paw(69, FOOT_Y, 0, 0.82),
    body: [60, 92, 32, 22],
    near: thigh(42, 101, 18, 13, -18) + groundFoot(40, 1) + groundFoot(26, -1) +
      tube('M84,84 Q98,86 100,76', 8, C.g, C.go) + hand(100, 72, -80),
    eyes: () => eyesOuch(), mouth: 'wobble', hat: 'rotate(15 66 36) translate(6 1)',
    extra: () => star(18, 26, 8) + star(30, 12, 4.5),
  },
  happy: {
    far: tube('M38,82 Q22,74 16,56', 7, C.g, C.go) + hand(15, 52, -105),
    body: [60, 92, 32, 22],
    near: thigh(42, 101, 18, 13, -18) + groundFoot(40, 1) + groundFoot(26, -1) +
      tube('M84,82 Q100,70 104,54', 8, C.g, C.go) + hand(105, 50, -78),
    eyes: () => eyesHappy(), mouth: 'open', hat: 'translate(0 -2) rotate(-4 66 34)',
  },
};

function clover(name) {
  const f = FRAMES[name];
  const id = 'c' + name;
  const [bx, by, brx, bry] = f.body;
  const silhouette = sil(E(bx, by, brx, bry) + HEAD, C.g, C.go);
  const parts = f.far + silhouette + body(id, bx, by, brx, bry) + head(id) + f.near +
    cheeks() + nostrils() + f.eyes() + MOUTH[f.mouth]() + hat(f.hat) + (f.extra ? f.extra() : '');
  return svg(128, 128, parts);
}

// ---------- firefly (centre 32,34) ----------
function firefly(frame) {
  const wing = frame === 0
    ? E(30, 20, 7, 13, ` transform="rotate(-28 30 26)"`) + E(37, 20, 6, 11, ` transform="rotate(22 37 26)"`)
    : E(26, 27, 6, 12.5, ` transform="rotate(-72 30 28)"`) + E(37, 25, 5.5, 10, ` transform="rotate(-48 36 28)"`);
  const defs = `<radialGradient id="ffh${frame}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0" stop-color="${C.ffGlow}" stop-opacity=".95"/><stop offset=".55" stop-color="${C.ffGlow}" stop-opacity=".5"/>` +
    `<stop offset="1" stop-color="${C.ffGlow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="ffa${frame}" cx="42%" cy="38%" r="62%"><stop offset="0" stop-color="#fffbd6"/>` +
    `<stop offset=".3" stop-color="${C.ffGlow}"/><stop offset="1" stop-color="${C.ffAmber}"/></radialGradient>`;
  const b = Ci(32, 34, 26, ` fill="url(#ffh${frame})"`) +
    Ci(24, 38, 17, ` fill="${C.ffGlow}" opacity=".45"`) +
    // antennae
    line('M45,26 Q48,17 54,16', C.ffBodyO, 1.8) + line('M43,25 Q43,16 47,12', C.ffBodyO, 1.8) +
    Ci(54.5, 16, 1.8, ` fill="${C.ffBodyO}"`) + Ci(47.3, 11.6, 1.8, ` fill="${C.ffBodyO}"`) +
    // far wing behind
    `<g fill="${C.ffWing}" fill-opacity=".6" stroke="#8fb3cf" stroke-width="1.4">${wing.split('/>')[1] + '/>'}</g>` +
    // body: thorax + head
    sil(E(36, 31, 8, 6.5) + Ci(44, 28.5, 6.2), C.ffBody, C.ffBodyO, 1.8) +
    Ci(46, 27, 2.2, ' fill="#fff"') + Ci(46.6, 27.3, 1.2, ` fill="${C.eye}"`) + E(48.2, 31.6, 1.4, 0.9, ` fill="${C.cheek}"`) +
    // little legs
    line('M33,37 l-1,4 M37,37.5 l0,4 M41,36.5 l1,3.5', C.ffBodyO, 1.6) +
    // glowing abdomen
    E(23, 38, 13.5, 12, ` fill="url(#ffa${frame})" stroke="#e08a0c" stroke-width="2.2" transform="rotate(-12 23 38)"`) +
    P('M14,36 Q18,29 26,29', ` fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"`) +
    line('M21,27.5 Q17.5,38 22,49', C.ffAmber, 1.3, ' opacity=".5"') +
    // near wing in front
    `<g fill="${C.ffWing}" fill-opacity=".6" stroke="#8fb3cf" stroke-width="1.4">${wing.split('/>')[0] + '/>'}</g>`;
  return svg(64, 64, b, defs);
}

// ---------- platforms ----------
function hay() {
  // top surface y = 14 (fill top), centre x 96
  const bale = `<rect x="6" y="14" width="180" height="72" rx="20"/>`;
  let straws = '';
  const sx = [24, 40, 52, 78, 92, 112, 126, 150, 164];
  sx.forEach((x, i) => { const y = 30 + (i * 17) % 44; straws += `M${x},${y} l${8 + (i % 3) * 3},${(i % 2 ? -2 : 2)} `; });
  const tufts = 'M8,40 l-5,-3 M7,52 l-6,1 M8,64 l-5,4 M184,38 l6,-3 M185,52 l6,1 M184,66 l5,4';
  return svg(192, 96,
    E(96, 88, 84, 6, ' fill="#000" opacity=".12"') +
    line(tufts, C.hayS, 2.4) +
    sil(bale, C.hay, C.hayO) +
    `<clipPath id="hayc">${bale}</clipPath><g clip-path="url(#hayc)">` +
    `<rect x="0" y="62" width="192" height="40" fill="${C.hayS}"/>` + E(96, 60, 100, 8, ` fill="${C.hay}"`) +
    `<rect x="12" y="15" width="168" height="5" rx="2.5" fill="${C.hayL}"/>` +
    line(straws, C.hayS, 2, ' opacity=".8"') +
    line('M30,74 l10,1 M70,78 l12,-1 M120,76 l10,1 M150,72 l11,1', C.hayO, 1.8, ' opacity=".55"') +
    // twine bands
    `<rect x="54" y="10" width="7" height="80" fill="${C.twine}"/><rect x="131" y="10" width="7" height="80" fill="${C.twine}"/>` +
    `<rect x="56" y="10" width="2" height="80" fill="#b98451"/><rect x="133" y="10" width="2" height="80" fill="#b98451"/>` +
    `</g>` +
    // straw wisps poking up at the ends only (keeps the landing top flat)
    line('M18,16 l-4,-6 M24,15 l1,-6 M172,16 l4,-6 M166,15 l-2,-6', C.hayS, 2.2));
}
function plank() {
  const pl = P('M6,8 L152,8 Q156,8 156,12 L156,36 Q156,40 152,40 L10,40 Q4,40 4,34 L4,12 Q4,8 6,8 Z');
  return svg(160, 48,
    E(80, 43, 70, 3.5, ' fill="#000" opacity=".12"') +
    sil(pl, C.wood, C.woodO) +
    `<clipPath id="plc">${pl}</clipPath><g clip-path="url(#plc)">` +
    `<rect x="0" y="30" width="160" height="12" fill="${C.woodS}"/>` +
    `<rect x="8" y="9" width="144" height="4" rx="2" fill="${C.woodL}"/>` +
    line('M14,22 Q50,18 78,23 T150,21', C.woodS, 2) + line('M30,31 Q60,28 96,31', C.woodO, 1.6, ' opacity=".5"') +
    E(112, 24, 6, 3, ` fill="none" stroke="${C.woodS}" stroke-width="1.8"`) + `</g>` +
    Ci(17, 22, 3.6, ` fill="${C.metal}" stroke="${C.metalO}" stroke-width="1.6"`) + Ci(16.2, 21, 1.1, ' fill="#fff"') +
    Ci(143, 22, 3.6, ` fill="${C.metal}" stroke="${C.metalO}" stroke-width="1.6"`) + Ci(142.2, 21, 1.1, ' fill="#fff"'));
}
function cart() {
  // hay top y = 22; wheels at (56,104) and (168,104) drawn by wheel.svg
  const hayHeap = P('M22,52 Q20,30 40,24 Q60,22 112,22 Q164,22 186,24 Q206,30 202,52 Z');
  const box = `<rect x="12" y="48" width="200" height="46" rx="7"/>`;
  return svg(224, 128,
    // tongue / handle at the front
    tube('M210,80 L220,88', 4, C.wood, C.woodO) +
    // axle beam
    `<rect x="40" y="94" width="144" height="9" rx="4" fill="${C.woodS}" stroke="${C.woodO}" stroke-width="3"/>` +
    sil(hayHeap, C.hay, C.hayO) +
    `<clipPath id="cah">${hayHeap}</clipPath><g clip-path="url(#cah)">` +
    `<rect x="12" y="23" width="200" height="5" rx="2.5" fill="${C.hayL}"/>` +
    line('M40,34 l9,-2 M70,30 l10,2 M104,34 l9,-2 M140,30 l10,2 M172,34 l9,-2 M56,42 l10,1 M120,43 l10,-1 M160,42 l9,1', C.hayS, 2) + `</g>` +
    line('M24,26 l-5,-5 M30,24 l-1,-6 M196,26 l5,-5 M190,24 l1,-6', C.hayS, 2.2) +
    sil(box, C.red, C.redO) +
    `<clipPath id="cab">${box}</clipPath><g clip-path="url(#cab)">` +
    `<rect x="0" y="80" width="224" height="20" fill="${C.redS}"/>` +
    `<rect x="16" y="50" width="192" height="4" rx="2" fill="${C.redL}"/>` +
    line('M12,64 L212,64 M12,79 L212,79', C.redO, 1.8, ' opacity=".55"') + `</g>` +
    // white farm trim (corner braces)
    line('M20,56 L20,88 M204,56 L204,88 M112,56 L112,88', '#fff6ec', 4) +
    line('M24,58 L60,86 M108,58 L72,86 M116,58 L152,86 M200,58 L164,86', '#fff6ec', 3, ' opacity=".9"') +
    // wheel wells hint
    E(56, 104, 4, 4, ` fill="${C.woodO}"`) + E(168, 104, 4, 4, ` fill="${C.woodO}"`));
}
function wheel() {
  let spokes = '';
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    spokes += `M24,24 L${(24 + Math.cos(a) * 17).toFixed(1)},${(24 + Math.sin(a) * 17).toFixed(1)} `;
  }
  return svg(48, 48,
    Ci(24, 24, 20, ` fill="none" stroke="${C.woodO}" stroke-width="9"`) +
    Ci(24, 24, 20, ` fill="none" stroke="${C.wood}" stroke-width="5"`) +
    P('M10,16 A16,16 0 0 1 20,6', ` fill="none" stroke="${C.woodL}" stroke-width="2" stroke-linecap="round"`) +
    line(spokes, C.woodO, 5.5) + line(spokes, C.wood, 2.6) +
    Ci(24, 24, 5.5, ` fill="${C.woodS}" stroke="${C.woodO}" stroke-width="2.5"`) + Ci(23, 23, 1.6, ` fill="${C.metalL}"`));
}
function puff() {
  // top y = 18, flat-ish (shallow bumps whose tops are all 18–21); lilac underside puffs
  const top = P('M24,72 C6,72 4,50 20,46 C16,30 34,20 50,26 C58,17 80,17 90,22 C100,17 124,17 134,24 C150,18 172,28 168,44 ' +
    'C186,46 188,72 168,72 Z');
  const shape = top + Ci(42, 72, 11) + Ci(70, 76, 12) + Ci(100, 77, 12) + Ci(130, 76, 12) + Ci(156, 72, 11);
  return svg(192, 96,
    sil(shape, C.white, C.cloudO) +
    `<clipPath id="puc">${shape}</clipPath><g clip-path="url(#puc)">` +
    E(96, 88, 104, 24, ` fill="${C.lilac}"`) + E(150, 40, 20, 11, ` fill="#eef2ff"`) +
    line('M30,72 Q42,80 56,74 M60,78 Q72,84 86,77 M92,79 Q104,85 118,78 M124,77 Q136,83 148,75', '#aebcf2', 2.2) + `</g>` +
    // face
    line('M78,48 Q83,42.5 88,48', '#6b6fa8', 2.6) + line('M104,48 Q109,42.5 114,48', '#6b6fa8', 2.6) +
    E(74, 55, 5, 3, ` fill="${C.cheek}" opacity=".75"`) + E(118, 55, 5, 3, ` fill="${C.cheek}" opacity=".75"`) +
    line('M92,54 Q96,57.5 100,54', '#6b6fa8', 2.2) +
    line('M30,40 Q33,33 42,31', '#fff', 3, ' opacity=".9"'));
}
function springSvg(up) {
  // base y = 78, cap top y = 6 (spring_up: cap reaches y = 1, coil stretched thinner)
  const capTop = up ? 1 : 6, capH = 14, coilTop = capTop + capH - 2, coilBot = 70;
  const rx = up ? 13 : 18, n = up ? 5 : 5;
  let d = `M${32 - rx},${coilBot}`;
  const step = (coilBot - coilTop) / n;
  for (let i = 0; i < n; i++) {
    const y0 = coilBot - i * step;
    d += ` C${32 - rx - 4},${(y0 - step * 0.5).toFixed(1)} ${32 + rx + 4},${(y0 - step * 0.5).toFixed(1)} ${32 + rx},${(y0 - step * 0.5).toFixed(1)}`;
    d += ` C${32 + rx + 4},${(y0 - step * 0.5).toFixed(1)} ${32 - rx - 4},${(y0 - step).toFixed(1)} ${32 - rx},${(y0 - step).toFixed(1)}`;
  }
  const cap = `<rect x="10" y="${capTop}" width="44" height="${capH}" rx="7"/>`;
  return svg(64, 80,
    (up ? line('M6,30 L6,44 M58,30 L58,44 M2,38 L2,48 M62,38 L62,48', '#ffffff', 2.4, ' opacity=".85"') : '') +
    `<rect x="12" y="69" width="40" height="9" rx="3" fill="${C.metalS}" stroke="${C.metalO}" stroke-width="3"/>` +
    line(d, C.metalO, 8) + line(d, C.metal, 4.2) + line(d, C.metalL, 1.4, ' opacity=".8"') +
    sil(cap, C.cap, C.capO) +
    `<rect x="10" y="${capTop + 9}" width="44" height="${capH - 9}" rx="3" fill="${C.capS}"/>` +
    `<rect x="16" y="${capTop + 2.5}" width="18" height="3.4" rx="1.7" fill="#fff" opacity=".6"/>`);
}
function trampoline() {
  // mat top y = 26
  const mat = `<rect x="20" y="26" width="216" height="12" rx="6"/>`;
  const frame = `<rect x="8" y="36" width="240" height="14" rx="7"/>`;
  const legs = 'M30,48 L18,86 M226,48 L238,86 M88,48 L80,84 M168,48 L176,84';
  let hooks = '';
  for (let x = 30; x <= 226; x += 28) hooks += `M${x},34 l3,4 l-3,4 `;
  return svg(256, 96,
    E(128, 90, 116, 5, ' fill="#000" opacity=".12"') +
    tube(legs, 6, C.frameS, C.frameO) +
    sil(E(18, 87, 7, 3.5) + E(238, 87, 7, 3.5) + E(80, 85, 6, 3) + E(176, 85, 6, 3), C.metalO, C.metalO, 1) +
    sil(frame, C.frame, C.frameO) +
    `<rect x="14" y="44" width="228" height="5" rx="2.5" fill="${C.frameS}"/>` +
    `<rect x="16" y="38" width="80" height="3" rx="1.5" fill="#fff6c2"/>` +
    // little stars on the frame
    star(128, 44, 4.5, '#ffffff', C.frameO).replace('stroke-width="2"', 'stroke-width="1.4"') +
    star(64, 44, 3.6, '#ff6b6b', C.frameO).replace('stroke-width="2"', 'stroke-width="1.2"') +
    star(192, 44, 3.6, '#ff6b6b', C.frameO).replace('stroke-width="2"', 'stroke-width="1.2"') +
    sil(mat, C.mat, C.matO) +
    `<rect x="22" y="33" width="212" height="5" rx="2.5" fill="${C.matS}"/>` +
    `<rect x="40" y="28" width="176" height="2.6" rx="1.3" fill="#8cc4f0"/>` +
    line(hooks, C.metalO, 1.6));
}

// ---------- HUD items ----------
const HEART = P('M24,41 C14,34 5,27 5,17.5 C5,10.5 10.5,6 16.5,6 C20,6 22.6,8 24,10.6 C25.4,8 28,6 31.5,6 C37.5,6 43,10.5 43,17.5 C43,27 34,34 24,41 Z');
function heart() {
  return svg(48, 48, sil(HEART, C.heart, C.heartO) +
    `<clipPath id="hc">${HEART}</clipPath><g clip-path="url(#hc)">${E(30, 36, 20, 14, ` fill="${C.heartS}"`)}${E(24, 18, 22, 14, ` fill="${C.heart}"`)}</g>` +
    E(14.5, 15, 4.6, 3.2, ' fill="#fff" opacity=".8" transform="rotate(-35 14.5 15)"') + Ci(20.5, 11.5, 1.6, ' fill="#fff" opacity=".8"'));
}
function heartEmpty() {
  return svg(48, 48, `<g opacity=".5">${HEART.replace('/>', ` fill="#ffffff" fill-opacity=".35" stroke="#7d7d7d" stroke-width="3.4" stroke-linejoin="round"/>`)}</g>`);
}
function jar() {
  // inner area x 16..48, y 20..56 stays see-through for the renderer's glow
  const glass = P('M18,18 L46,18 Q52,22 52,30 L52,54 Q52,61 45,61 L19,61 Q12,61 12,54 L12,30 Q12,22 18,18 Z');
  return svg(64, 64,
    P('M16,13 Q32,-6 48,13', ` fill="none" stroke="${C.metalO}" stroke-width="4.2" stroke-linecap="round"`) +
    P('M16,13 Q32,-6 48,13', ` fill="none" stroke="${C.metal}" stroke-width="1.8" stroke-linecap="round"`) +
    glass.replace('/>', ` fill="${C.glass}" fill-opacity=".28" stroke="${C.glassO}" stroke-width="3" stroke-linejoin="round"/>`) +
    P('M17,28 Q16,40 18,52', ` fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"`) +
    P('M45,30 L45,36', ` fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"`) +
    `<rect x="14" y="9" width="36" height="10" rx="3" fill="${C.wood}" stroke="${C.woodO}" stroke-width="3"/>` +
    `<rect x="17" y="11" width="16" height="2.4" rx="1.2" fill="${C.woodL}"/>` +
    line('M14,15.5 L50,15.5', C.woodS, 1.6));
}
function vane() {
  // arrow centred at (48,40) pointing right; post + little ball below
  const arrow = P('M16,36 L64,36 L64,29 L84,40 L64,51 L64,44 L16,44 Z');
  const tail = P('M10,30 L24,30 L30,40 L24,50 L10,50 L16,40 Z');
  return svg(96, 96,
    `<rect x="44" y="40" width="8" height="48" rx="3" fill="${C.post}" stroke="${C.woodO}" stroke-width="3"/>` +
    `<rect x="46" y="44" width="2" height="40" fill="${C.woodL}"/>` +
    `<rect x="34" y="86" width="28" height="7" rx="3" fill="${C.woodS}" stroke="${C.woodO}" stroke-width="3"/>` +
    sil(Ci(48, 62, 6), C.hat, C.hatO) + Ci(46, 60, 1.8, ' fill="#fff"') +
    sil(tail, C.hat, C.hatO, 2.6) + line('M14,40 L26,40', C.hatS, 2) +
    sil(arrow, C.vaneArrow, C.vaneO, 2.6) +
    `<rect x="20" y="37" width="44" height="2.4" rx="1.2" fill="#ff9b8f"/>` +
    sil(Ci(48, 40, 4.4), C.metal, C.metalO, 2) + Ci(47, 39, 1.3, ' fill="#fff"'));
}

// ---------- icon (Clover's face + hat, firefly, barn, hill, sky) ----------
function icon() {
  const defs = `<clipPath id="ib"><circle cx="128" cy="128" r="120"/></clipPath>` +
    `<linearGradient id="isk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fcaf7"/><stop offset="1" stop-color="#d9f2ff"/></linearGradient>` +
    `<radialGradient id="ifh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.ffGlow}" stop-opacity=".9"/>` +
    `<stop offset=".5" stop-color="${C.ffGlow}" stop-opacity=".45"/><stop offset="1" stop-color="${C.ffGlow}" stop-opacity="0"/></radialGradient>`;
  // reuse the in-game head (shared geometry), scaled
  uid = 900;
  const face = sil(E(62, 96, 34, 24) + HEAD, C.g, C.go) + body('ic', 62, 96, 34, 24) + head('ic') + cheeks() + nostrils() +
    eyesOpen(false) + MOUTH.smile() + hat('');
  const bg = `<g clip-path="url(#ib)"><rect width="256" height="256" fill="url(#isk)"/>` +
    Ci(56, 64, 16, ' fill="#fff" opacity=".8"') + Ci(76, 60, 20, ' fill="#fff" opacity=".8"') + Ci(96, 66, 13, ' fill="#fff" opacity=".8"') +
    // barn
    `<g transform="translate(204 138) scale(.72)"><path d="M0,30 L24,8 L48,30 L48,74 L0,74 Z" fill="${C.red}" stroke="${C.redO}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M-4,32 L24,6 L52,32" fill="none" stroke="#fff6ec" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="14" y="42" width="20" height="32" fill="#fff6ec"/><path d="M14,42 L34,74 M34,42 L14,74" stroke="${C.red}" stroke-width="3"/></g>` +
    // hill
    P('M-10,196 Q70,150 150,170 Q220,184 270,168 L270,270 L-10,270 Z', ` fill="#6fcf4f" stroke="#3f8f33" stroke-width="4"`) +
    P('M-10,222 Q90,196 270,214 L270,270 L-10,270 Z', ' fill="#58b83f"') + `</g>`;
  const ring = Ci(128, 128, 121, ` fill="none" stroke="${C.go}" stroke-width="8"`) + Ci(128, 128, 115, ' fill="none" stroke="#fff" stroke-width="3" opacity=".7"');
  const ff = `<g transform="translate(166 38) scale(1.05)">` + firefly(0).replace(/^<svg[^>]*>/, '').replace('</svg>\n', '').replace(/ffh0/g, 'iffh').replace(/ffa0/g, 'iffa') + `</g>`;
  const ffDefs = firefly(0).match(/<defs>(.*)<\/defs>/)[1].replace(/ffh0/g, 'iffh').replace(/ffa0/g, 'iffa');
  return svg(256, 256, bg + `<g clip-path="url(#ib)"><g transform="translate(2 44) scale(2)">${face}</g></g>` +
ff.replace(/<defs>.*<\/defs>/, '') + ring,
    defs + ffDefs);
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const k of Object.keys(FRAMES)) { uid = 0; files['clover_' + k] = clover(k); }
files.firefly_0 = firefly(0); files.firefly_1 = firefly(1);
files.hay = hay(); files.plank = plank(); files.cart = cart(); files.wheel = wheel(); files.puff = puff();
files.spring = springSvg(false); files.spring_up = springSvg(true); files.trampoline = trampoline();
files.heart = heart(); files.heart_empty = heartEmpty(); files.jar = jar(); files.vane = vane(); files.icon = icon();
for (const [n, s] of Object.entries(files)) {
  if (/<text|<image|<script|href=|font/i.test(s)) throw new Error(n + ': forbidden element');
  fs.writeFileSync(path.join(OUT, n + '.svg'), s);
}
console.log('wrote ' + Object.keys(files).length + ' SVGs to ' + OUT);
