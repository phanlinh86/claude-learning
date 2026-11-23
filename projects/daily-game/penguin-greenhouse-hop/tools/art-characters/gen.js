// Puddle's Greenhouse Hop — character & item art generator (DESIGN.md §3, §4.1).
// Usage: node tools/art-characters/gen.js [outDir]
// Writes hand-written, original SVGs into game/assets/default/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');

// ---------- palette (DESIGN §3) ----------
const C = {
  // Puddle
  slate: '#33476e', slateS: '#24345a', slateO: '#1a2440', slateL: '#5a71a0',
  cream: '#fbfdff', creamS: '#dfe8f3',
  beak: '#ff9f1c', beakS: '#e07f0a', beakO: '#b8650a', beakL: '#ffd08a',
  cheek: '#ff9eb5', eye: '#1e1a33', mouth: '#7a2a44', tongue: '#ff7f98',
  hood: '#ff5d73', hoodS: '#d93d58', hoodO: '#9e2a40', hoodL: '#ff9aa8', toggle: '#fff3d6',
  // firefly
  ffGlow: '#fff27a', ffAmber: '#ffb627', ffWing: '#e8f6ff', ffBody: '#5a3d5c', ffBodyO: '#3a2540',
  // pot
  pot: '#d9774a', potS: '#b25a33', potO: '#7a3a1e', potL: '#f09a6c', soil: '#5b3a29', soilD: '#3e271b',
  // wood (shelf, jar lid, umbrella handle)
  wood: '#b98552', woodS: '#8a5a33', woodO: '#5e3a1f', woodL: '#d9a673',
  // leaf
  leaf: '#5cc35a', leafS: '#3f9a45', leafV: '#2f7a37', leafO: '#2a6a30', leafL: '#9be38a', vein: '#f4f9d2',
  // basket
  wick: '#c99a5b', wickS: '#9a6c36', wickO: '#6a4520', wickL: '#e6bf86', flower: '#ff8fb8', flowerS: '#e0628f', flowerC: '#fff3d6',
  // mushroom
  cap: '#ff5a5f', capS: '#d83c43', capO: '#8e1f26', capL: '#ff9a9c', dot: '#fff3d6', stalk: '#fff3d6', stalkS: '#ecd9b5', stalkO: '#a8875a',
  // umbrella
  umb: '#ff5d73', umbS: '#d93d58', umbO: '#9e2a40', umbC: '#fff3d6', umbCS: '#f1dcc0',
  // HUD
  heart: '#ff6b6b', heartS: '#e04848', heartO: '#a8323a',
  glass: '#dff3ff', glassO: '#5f86a3', metal: '#9aa7b8', metalS: '#6f7c8e', metalO: '#46505e', metalL: '#d6dee8',
  water: '#cfeeff', waterO: '#5f86a3',
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
// a limb / stem as a rounded tube with outline
const tube = (d, w, col, out, ow = 3) =>
  `<path d="${d}" fill="none" stroke="${out}" stroke-width="${w + 2 * ow}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, col, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const clip = (id, shape, inner) => `<clipPath id="${id}">${shape}</clipPath><g clip-path="url(#${id})">${inner}</g>`;
const star = (x, y, r, col, out, sw = 2, k = 0.48) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * k : r;
    d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1);
  }
  return P(d + 'Z', ` fill="${col}" stroke="${out}" stroke-width="${sw}" stroke-linejoin="round"`);
};
const drop = (x, y, s, col = C.water, out = C.waterO) => // teardrop, tip up, centre of the round part at (x,y)
  P(`M${x},${y - 2.2 * s} C${x + 0.6 * s},${y - 1.2 * s} ${x + s},${y - 0.5 * s} ${x + s},${y} A${s},${s} 0 0 1 ${x - s},${y} C${x - s},${y - 0.5 * s} ${x - 0.6 * s},${y - 1.2 * s} ${x},${y - 2.2 * s} Z`,
    ` fill="${col}" stroke="${out}" stroke-width="${Math.max(1.2, s * 0.3).toFixed(1)}" stroke-linejoin="round"`) +
  Ci(x - s * 0.35, y - s * 0.2, s * 0.28, ' fill="#fff" opacity=".9"');

// ======================================================================
// PUDDLE — round chick-like penguin, facing right (¾ view).
// Body ellipse centred (64,72) rx 40; feet outline bottom y = 118.
// Head geometry (head circle, hood, face, eyes, beak) identical in every pose;
// only the crouch pose moves the whole head group down by HEAD_DY.
// ======================================================================
const HEAD = { cx: 66, cy: 44, r: 30 };
const HOOD = 'M33,52 C30,33 44,12 69,11 C88,10 102,21 103,35 ' + // outer
  'C94,31 81,30 70,32 C58,34 50,41 47,51 C43,55 36,56 33,52 Z';      // front rim, back to the nape
const HOOD_RIM = 'M103,35 C94,31 81,30 70,32 C58,34 50,41 47,51';
const FACE = P('M50,52 C52,38 64,32 78,33 C92,34 100,42 100,54 C100,66 92,74 78,75 C62,76 50,68 50,52 Z');
const EYE = { far: [67, 51, 5.2, 7.2], near: [86, 50, 6.4, 8.4] };
const BEAK_Y = 60;

const flipperShape = E(0, 13, 7.5, 15);
const flipper = (x, y, rot, far = false) => {
  const col = far ? C.slateS : C.slate;
  return sil(flipperShape, col, C.slateO, 3, `translate(${x} ${y}) rotate(${rot})`) +
    (far ? '' : `<g transform="translate(${x} ${y}) rotate(${rot})">${E(-2.2, 10, 2.4, 8, ` fill="${C.slateL}" opacity=".55"`)}</g>`);
};
// foot: a plump orange paddle with two toe creases, pointing +x in local coords; rot in degrees
const footShape = P('M-9,-2 C-9,-6 -2,-6 4,-5 C10,-4 13,-2 13,1 C13,4 9,4 4,4 L-6,4 C-9,4 -9,1 -9,-2 Z');
const foot = (x, y, rot = 0, s = 1) =>
  sil(footShape, C.beak, C.beakO, 3 / s, `translate(${x} ${y}) rotate(${rot}) scale(${s})`) +
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
  line('M5,-1 L11,0 M5,2 L10,2.5', C.beakS, 1.4) + E(-1, -3, 4, 1.2, ` fill="${C.beakL}" opacity=".8"`) + `</g>`;
// sitting-foot y so that the outline bottom is the feet line 118 (shape bottom +4, outline +3)
const FY = 111;
// a foot standing on the feet line: shape bottom (+4·s) + outline (3) = 118
const gfoot = (x, s = 1) => foot(x, +(115 - 4 * s).toFixed(2), 0, s);

const eyesOpen = (big = false, squint = false) => ['far', 'near'].map(k => {
  const [x, y, rx, ry0] = EYE[k];
  const ry = squint ? ry0 * 0.72 : ry0, s = big ? 1.15 : 1;
  return E(x, y + (squint ? 1.5 : 0), rx, ry, ` fill="${C.eye}"`) +
    Ci(x + rx * 0.32, y - ry * 0.42, rx * 0.5 * s, ' fill="#fff"') + Ci(x - rx * 0.38, y + ry * 0.45, rx * 0.22, ' fill="#fff"');
}).join('');
const eyesHappy = () => line('M61.5,53 Q67,44 72.5,53', C.eye, 3.4) + line('M79.5,52.5 Q86,42.5 92.5,52.5', C.eye, 3.6);
const eyesOuch = () => line('M62,46 L71,51.5 L62,57', C.eye, 3.4) + line('M92,45 L82,51 L92,57', C.eye, 3.6);
const cheeks = () => E(62.5, 62, 4.2, 2.6, ` fill="${C.cheek}" opacity=".9"`) + E(84, 64.5, 5.2, 3.1, ` fill="${C.cheek}" opacity=".95"`);
const UPPER = 'M91,57.5 C96,55.8 102,57 106.5,60.5 C102,62.4 96,62.8 91,62.5 Z';
const LOWER = 'M92,62.3 C96,62.9 100,62.6 103,62 C100,64.8 96,65.6 92.5,64.8 Z';
const BEAK = {
  closed: () => sil(P(UPPER) + P(LOWER), C.beak, C.beakO, 1.6) +
    line('M92,62.5 C97,63.1 101,62.6 105,61.4', C.beakO, 1.2) + P('M93.5,58.4 Q98,57.2 101.5,58.4', ` fill="none" stroke="${C.beakL}" stroke-width="1.6" stroke-linecap="round"`),
  open: () => P('M91,59 L106,58 L102,66.5 L92,67 Z', ` fill="${C.mouth}" stroke="${C.beakO}" stroke-width="1.4" stroke-linejoin="round"`) +
    P('M92.5,65.5 C95,63.5 99,63.5 101.5,65.5 C99,67 95,67.2 92.5,65.5 Z', ` fill="${C.tongue}"`) +
    sil(P('M90.5,56 C96,53.6 103,54.4 108.5,57.6 C103,60 96,60.6 91,60 Z'), C.beak, C.beakO, 1.6) +
    sil(P('M92,66 C96,66.8 100,66.6 103,66 C100,69.6 96,70.6 92.5,69.6 Z'), C.beak, C.beakO, 1.6) +
    P('M93.5,56.6 Q98,55 102,56.4', ` fill="none" stroke="${C.beakL}" stroke-width="1.6" stroke-linecap="round"`),
  o: () => E(96.5, 65.5, 3.4, 4, ` fill="${C.mouth}" stroke="${C.beakO}" stroke-width="2"`) +
    sil(P('M91,57 C96,55.4 101.5,56.6 105.5,59.6 C101,61.4 96,61.8 91,61.4 Z'), C.beak, C.beakO, 1.6),
  wobble: () => sil(P(UPPER) + P(LOWER), C.beak, C.beakO, 1.6) +
    line('M92,62.8 q2.2,-1.4 4.4,0 q2.2,1.4 4.4,0 q2,-1.3 4,-0.6', C.beakO, 1.2),
};

function hood(P0, tr = '', flap = false) {
  const flapShape = flap ? P('M37,32 C30,28 24,22 17,15 C22,16 25,13 27,9 C31,17 38,21 45,23 Z') : '';
  return `<g${tr ? ` transform="${tr}"` : ''}>` +
    (flap ? sil(flapShape, C.hoodS, C.hoodO) + line('M20,15 C26,20 32,24 39,27', C.hoodO, 1.4, ' opacity=".5"') : '') +
    sil(P(HOOD), C.hood, C.hoodO) +
    clip(P0 + 'hc', P(HOOD),
      // cel shade on the back, lining along the front rim
      E(30, 46, 16, 30, ` fill="${C.hoodS}"`) + line(HOOD_RIM, C.hoodS, 7)) +
    line(HOOD_RIM, C.hoodL, 2.2, ' opacity=".9"') +  // piping
    line('M46,23 C53,16 62,14 70,14.5', '#fff', 3.4, ' opacity=".6"') + // highlight
    // a little seam + a raindrop stitch on the side
    line('M44,22 C40,32 38,42 39,52', C.hoodO, 1.4, ' opacity=".4"') +
    `</g>`;
}

function collar(P0) {
  const sh = P('M31,68 C48,77 82,79 101,68 C104,71 104,75 102,78 Q95,84 88,81 Q78,87 68,82 Q57,87 48,81 Q39,84 32,78 C29,75 29,71 31,68 Z');
  return sil(sh, C.hood, C.hoodO) +
    clip(P0 + 'cc', sh, E(36, 82, 18, 10, ` fill="${C.hoodS}"`) + line('M32,71 C48,79 82,81 101,71', C.hoodL, 2.4, ' opacity=".85"')) +
    // toggle button + cord
    line('M92,78 L93,84', C.hoodO, 1.6) + E(93.5, 86.5, 2.2, 3, ` fill="${C.toggle}" stroke="${C.hoodO}" stroke-width="1.6"`);
}

const POSES = {
  idle: {
    body: [64, 72, 40, 42], dy: 0,
    farFl: [100, 76, -22], nearFl: [35, 74, 22],
    feet: () => gfoot(52, 0.82) + gfoot(77, 0.9),
    eyes: () => eyesOpen(), beak: 'closed', smile: true,
  },
  crouch: {
    body: [64, 76, 46, 37], dy: 6,
    farFl: [104, 80, -70], nearFl: [28, 80, 68],
    feet: () => gfoot(44, 0.95) + gfoot(84),
    eyes: () => eyesOpen(false, true), beak: 'closed', smile: true,
  },
  up: {
    body: [64, 71, 38, 43], dy: -1,
    farFl: [98, 70, -152], nearFl: [36, 70, 150],
    feet: () => foot(58, 104, 80, 0.74) + foot(69, 104.5, 88, 0.78),
    eyes: () => eyesOpen(), beak: 'open',
  },
  fall: {
    body: [64, 72, 40, 41], dy: 0,
    farFl: [100, 70, -112], nearFl: [34, 70, 104],
    feet: () => foot(40, 110, 28, 0.92) + foot(88, 110, -18),
    eyes: () => eyesOpen(true), beak: 'o', hood: 'translate(0 -2)', flap: true,
  },
  ouch: {
    body: [64, 72, 40, 42], dy: 0,
    farFl: [100, 74, -40], nearFl: [35, 72, 60],
    feet: () => gfoot(50, 0.92) + gfoot(78),
    eyes: () => eyesOuch(), beak: 'wobble', hood: 'rotate(-13 66 40) translate(-2 1)',
    extra: () => star(112, 15, 9, '#e4f6ff', C.waterO, 2, 0.45) + drop(23, 26, 4.2) + drop(10, 42, 2.8),
  },
  happy: {
    body: [64, 72, 40, 42], dy: 0,
    farFl: [100, 68, -148], nearFl: [34, 68, 146],
    feet: () => gfoot(52, 0.82) + gfoot(77, 0.9),
    eyes: () => eyesHappy(), beak: 'open',
    extra: () => star(18, 20, 5, '#ffffff', '#9fb6cc', 1.4, 0.42) + star(110, 12, 4, '#ffffff', '#9fb6cc', 1.2, 0.42),
  },
};

// inner content of a Puddle pose (no <svg> wrapper), ids prefixed with P0
function puddleBody(name, P0) {
  const f = POSES[name];
  const [bx, by, brx, bry] = f.body;
  const dy = f.dy;
  const BODY = E(bx, by, brx, bry);
  const HEADc = Ci(HEAD.cx, HEAD.cy + dy, HEAD.r);
  const TAIL = P(`M${bx - brx + 6},${by + bry - 16} L${bx - brx - 6},${by + bry - 6} L${bx - brx + 10},${by + bry - 6} Z`);
  const silh = sil(BODY + HEADc + TAIL, C.slate, C.slateO);
  const shade = clip(P0 + 'bd', BODY + HEADc,
    `<rect width="128" height="128" fill="${C.slateS}"/>` + E(bx + 8, by - 6, brx * 0.95, bry * 0.96, ` fill="${C.slate}"`) +
    Ci(HEAD.cx + 6, HEAD.cy + dy - 3, HEAD.r * 0.96, ` fill="${C.slate}"`)) +
    line(`M${bx - brx + 8},${by - 10} Q${bx - brx + 4},${by + 6} ${bx - brx + 10},${by + 22}`, '#fff', 3, ' opacity=".22"');
  // belly (cream) clipped to the body
  const BEL = E(bx + 8, by + 18, brx * 0.72, bry * 0.6);
  const belly = clip(P0 + 'bl', BODY, BEL.replace('/>', ` fill="${C.cream}"/>`) +
    E(bx + 2, by + bry + 2, brx * 0.7, bry * 0.22, ` fill="${C.creamS}"`));
  // head group (identical geometry; only translated by dy)
  const face = clip(P0 + 'fc', Ci(HEAD.cx, HEAD.cy, HEAD.r + 4), FACE.replace('/>', ` fill="${C.cream}"/>`) +
    E(78, 71, 22, 6, ` fill="${C.creamS}"`));
  const headG = `<g${dy ? ` transform="translate(0 ${dy})"` : ''}>` + face + hood(P0, f.hood || '', !!f.flap) +
    cheeks() + f.eyes() + BEAK[f.beak]() + (f.smile ? '' : '') + `</g>`;
  const collarG = `<g${dy ? ` transform="translate(0 ${dy})"` : ''}>${collar(P0)}</g>`;
  return flipper(...f.farFl, true) + silh + shade + belly + collarG + headG +
    flipper(...f.nearFl) + f.feet() + (f.extra ? f.extra() : '');
}
const puddle = (name) => svg(128, 128, puddleBody(name, 'p' + name));

// ---------- firefly (centre 32,34) ----------
function firefly(frame, P0 = 'ff') {
  const wing = frame === 0
    ? E(30, 20, 7, 13, ` transform="rotate(-28 30 26)"`) + E(37, 20, 6, 11, ` transform="rotate(22 37 26)"`)
    : E(26, 27, 6, 12.5, ` transform="rotate(-72 30 28)"`) + E(37, 25, 5.5, 10, ` transform="rotate(-48 36 28)"`);
  const defs = `<radialGradient id="${P0}h${frame}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0" stop-color="${C.ffGlow}" stop-opacity=".95"/><stop offset=".55" stop-color="${C.ffGlow}" stop-opacity=".5"/>` +
    `<stop offset="1" stop-color="${C.ffGlow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${P0}a${frame}" cx="42%" cy="38%" r="62%"><stop offset="0" stop-color="#fffbd6"/>` +
    `<stop offset=".3" stop-color="${C.ffGlow}"/><stop offset="1" stop-color="${C.ffAmber}"/></radialGradient>`;
  const b = Ci(32, 34, 26, ` fill="url(#${P0}h${frame})"`) +
    Ci(24, 38, 17, ` fill="${C.ffGlow}" opacity=".45"`) +
    line('M45,26 Q48,17 54,16', C.ffBodyO, 1.8) + line('M43,25 Q43,16 47,12', C.ffBodyO, 1.8) +
    Ci(54.5, 16, 1.8, ` fill="${C.ffBodyO}"`) + Ci(47.3, 11.6, 1.8, ` fill="${C.ffBodyO}"`) +
    `<g fill="${C.ffWing}" fill-opacity=".6" stroke="#8fb3cf" stroke-width="1.4">${wing.split('/>')[1] + '/>'}</g>` +
    sil(E(36, 31, 8, 6.5) + Ci(44, 28.5, 6.2), C.ffBody, C.ffBodyO, 1.8) +
    Ci(46, 27, 2.2, ' fill="#fff"') + Ci(46.6, 27.3, 1.2, ` fill="${C.eye}"`) + E(48.2, 31.6, 1.4, 0.9, ` fill="${C.cheek}"`) +
    line('M33,37 l-1,4 M37,37.5 l0,4 M41,36.5 l1,3.5', C.ffBodyO, 1.6) +
    E(23, 38, 13.5, 12, ` fill="url(#${P0}a${frame})" stroke="#e08a0c" stroke-width="2.2" transform="rotate(-12 23 38)"`) +
    P('M14,36 Q18,29 26,29', ` fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"`) +
    line('M21,27.5 Q17.5,38 22,49', C.ffAmber, 1.3, ' opacity=".5"') +
    `<g fill="${C.ffWing}" fill-opacity=".6" stroke="#8fb3cf" stroke-width="1.4">${wing.split('/>')[0] + '/>'}</g>`;
  return { defs, body: b };
}
const fireflySvg = (frame) => { const f = firefly(frame); return svg(64, 64, f.body, f.defs); };

// ---------- small sprout / flower helpers ----------
const sprout = (x, y, h, s = 1) => // stem from (x,y) up h, two round leaves
  tube(`M${x},${y} q${-1 * s},${-h * 0.5} ${0.5 * s},${-h}`, 2.4 * s, C.leafS, C.leafO, 1.4) +
  sil(P(`M${x + 0.5 * s},${y - h} c${4 * s},${-5 * s} ${10 * s},${-5 * s} ${13 * s},${-2 * s} c${-3 * s},${5 * s} ${-9 * s},${6 * s} ${-13 * s},${2 * s} Z`) +
    P(`M${x + 0.5 * s},${y - h + 2 * s} c${-4 * s},${-5 * s} ${-9 * s},${-5 * s} ${-12 * s},${-2 * s} c${3 * s},${5 * s} ${8 * s},${5 * s} ${12 * s},${2 * s} Z`),
  C.leaf, C.leafO, 1.4) +
  line(`M${x + 2 * s},${y - h - 1 * s} l${7 * s},${-2 * s}`, C.leafL, 1.2 * s);
const flower = (x, y, r, rot = 0) => {
  let petals = '';
  for (let i = 0; i < 5; i++) { const a = (rot + i * 72) * Math.PI / 180; petals += Ci((x + Math.cos(a) * r * 0.62).toFixed(1), (y + Math.sin(a) * r * 0.62).toFixed(1), (r * 0.52).toFixed(1)); }
  return sil(petals, C.flower, C.flowerS, 1.2) + Ci(x, y, r * 0.34, ` fill="${C.flowerC}" stroke="${C.flowerS}" stroke-width="1"`);
};
const smallLeaf = (x, y, rot, s = 1) =>
  sil(P('M0,0 C3,-4 9,-4 12,0 C9,4 3,4 0,0 Z'), C.leaf, C.leafO, 1.2, `translate(${x} ${y}) rotate(${rot}) scale(${s})`);

// ======================================================================
// PLATFORMS
// ======================================================================
function pot() {
  // rim fill top y = 14, centre x 96
  const rim = `<rect x="6" y="14" width="180" height="22" rx="7"/>`;
  const bodyP = P('M20,34 L172,34 L157,88 Q155.5,93 150,93 L42,93 Q36.5,93 35,88 Z');
  return svg(192, 96,
    E(96, 92, 66, 3.5, ' fill="#000" opacity=".14"') +
    sil(bodyP, C.pot, C.potO) +
    clip('potb', bodyP, `<rect x="120" y="30" width="80" height="70" fill="${C.potS}"/>` + E(78, 56, 70, 34, ` fill="${C.pot}"`) +
      `<rect x="0" y="34" width="192" height="7" fill="${C.potS}" opacity=".8"/>` +
      // pressed little flower motif on the front (no logos)
      `<g opacity=".55">${Ci(96, 64, 4.2, ` fill="${C.potL}"`)}${[0, 72, 144, 216, 288].map(a => Ci((96 + Math.cos(a * Math.PI / 180) * 8).toFixed(1), (64 + Math.sin(a * Math.PI / 180) * 8).toFixed(1), 3.6, ` fill="none" stroke="${C.potL}" stroke-width="2"`)).join('')}</g>` +
      line('M44,50 L50,84', C.potL, 3, ' opacity=".6"')) +
    sil(rim, C.pot, C.potO) +
    clip('potr', rim, `<rect x="0" y="27" width="192" height="12" fill="${C.potS}"/>` +
      // the rim's top face, seen slightly from above, with soil inside
      E(96, 19.5, 88, 5.8, ` fill="${C.potL}"`) + E(96, 20.6, 80, 3.4, ` fill="${C.soil}"`) + E(96, 21.6, 74, 1.8, ` fill="${C.soilD}"`) +
      line('M150,30 L176,30', C.potL, 2, ' opacity=".5"')) +
    line('M14,26 L120,26', '#fff', 2.4, ' opacity=".35"') +
    // two small sprouts from the soil (tips stay under y ≈ 1)
    sprout(58, 19, 10, 1) + sprout(136, 19, 8, 0.85));
}

function shelf() {
  // plank fill top y = 8
  const pl = `<rect x="4" y="8" width="152" height="18" rx="4"/>`;
  const br = (x, dir) => P(`M${x},25 L${x + 14 * dir},25 Q${x + 14 * dir},38 ${x + 3 * dir},45 L${x},45 Z`);
  return svg(160, 48,
    sil(br(22, 1) + br(138, -1), C.woodS, C.woodO) +
    line('M25,30 L25,41 M135,30 L135,41', C.woodO, 1.4, ' opacity=".5"') +
    sil(pl, C.wood, C.woodO) +
    clip('shp', pl, `<rect x="0" y="20" width="160" height="10" fill="${C.woodS}"/>` +
      `<rect x="6" y="9" width="148" height="3.4" rx="1.7" fill="${C.woodL}"/>` +
      line('M12,16 Q40,14 64,17 M100,15 Q126,13 150,16', C.woodS, 1.6) + E(118, 16.5, 5, 2, ` fill="none" stroke="${C.woodS}" stroke-width="1.4"`)) +
    // empty little brass label holder
    `<rect x="67" y="12" width="26" height="10" rx="2" fill="#f6ead2" stroke="${C.metalO}" stroke-width="2"/>` +
    line('M69,14.5 L91,14.5', C.metal, 1.6) +
    Ci(13, 17, 2.4, ` fill="${C.metal}" stroke="${C.metalO}" stroke-width="1.2"`) + Ci(147, 17, 2.4, ` fill="${C.metal}" stroke="${C.metalO}" stroke-width="1.2"`));
}

function leafSvg() {
  // top surface y = 16 (fill top), stem attachment at the LEFT end (4,20); tip at the right (~190,22)
  const L = P('M17,16 C60,15 120,15 158,16 C172,16.4 182,15.5 189,12 C187,26 168,46 120,53 C78,58 40,50 24,36 C17,29 15,22 17,16 Z');
  let side = '';
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 21, y = 22.5 + i * 0.5;
    side += `M${x},${y} q${9},${10} ${16 - i},${20 - i * 2} `;
  }
  return svg(192, 64,
    tube('M4,20 Q11,19 19,22', 4, C.leafS, C.leafO, 2.5) +
    sil(L, C.leaf, C.leafO) +
    clip('lfc', L, E(100, 54, 98, 24, ` fill="${C.leafS}"`) + E(96, 15.5, 90, 3, ` fill="${C.leafL}"`) +
      line(side, C.leafV, 1.8, ' opacity=".8"') +
      line('M60,20 l8,-3 M100,20 l9,-3 M140,20 l8,-2.5', C.leafV, 1.4, ' opacity=".45"')) +
    // central vein (cream with a dark edge so it reads)
    line('M19,22 C70,25 140,26 186,15', C.leafV, 4.4) + line('M19,22 C70,25 140,26 186,15', C.vein, 2) +
    // a water drop hanging from the tip
    drop(180, 30, 3.6));
}

function basket() {
  // rim fill top y = 22, centre x 80; no chain (renderer draws it from the pivot)
  const rim = `<rect x="12" y="22" width="136" height="14" rx="7"/>`;
  const bowl = P('M18,34 L142,34 C142,68 114,86 80,86 C46,86 18,68 18,34 Z');
  let weave = '';
  for (let r = 0; r < 5; r++) {
    const y = 42 + r * 9;
    for (let x = 14 + (r % 2) * 7; x < 150; x += 14) weave += `M${x},${y} q3.5,-3 7,0 `;
  }
  const tendril = (d) => tube(d, 2, C.leafS, C.leafO, 1.2);
  return svg(160, 112,
    // back tendrils
    tendril('M128,40 C140,56 136,74 146,92') +
    sil(bowl, C.wick, C.wickO) +
    clip('bkb', bowl, `<rect x="0" y="62" width="160" height="40" fill="${C.wickS}"/>` + E(74, 52, 62, 22, ` fill="${C.wick}"`) +
      line(weave, C.wickS, 2.2) + line('M30,40 L30,80 M52,40 L52,86 M80,40 L80,88 M108,40 L108,86 M130,40 L130,80', C.wickO, 1.3, ' opacity=".4"')) +
    sil(rim, C.wick, C.wickO) +
    clip('bkr', rim, `<rect x="0" y="31" width="160" height="6" fill="${C.wickS}"/>` +
      `<rect x="14" y="23.5" width="132" height="3" rx="1.5" fill="${C.wickL}"/>` +
      line('M20,29 l6,3 M34,29 l6,3 M48,29 l6,3 M62,29 l6,3 M76,29 l6,3 M90,29 l6,3 M104,29 l6,3 M118,29 l6,3 M132,29 l6,3', C.wickO, 1.3, ' opacity=".55"')) +
    // chain eyelets on the rim (the renderer's chains end here: x 22, 80, 138)
    [22, 80, 138].map(x => Ci(x, 24, 2.6, ` fill="none" stroke="#5a5f73" stroke-width="1.8"`)).join('') +
    // trailing tendrils + leaves + pink flowers
    tendril('M20,34 C10,50 18,70 8,96') + tendril('M58,82 C54,92 60,100 54,108') + tendril('M102,84 C108,92 104,100 110,104') + tendril('M142,34 C152,50 146,64 152,80') +
    smallLeaf(14, 52, 110) + smallLeaf(13, 72, 70, 0.9) + smallLeaf(56, 96, 120, 0.8) + smallLeaf(106, 94, 60, 0.8) + smallLeaf(148, 58, 70, 0.9) + smallLeaf(140, 84, 110, 0.8) +
    flower(10, 34, 8, 10) + flower(9, 96, 7, 40) + flower(54, 106, 6.5, 20) + flower(110, 104, 6.5, 0) + flower(150, 36, 7.5, 30) +
    flower(152, 80, 6.5, 50) + flower(146, 94, 6, 10) + flower(30, 84, 6, 60));
}

function mushroom(up) {
  // base: outline bottom y = 78; cap top y = 6 (fill) in the normal frame
  if (!up) {
    const cap = P('M4,37 C2,17 16,6 32,6 C48,6 62,17 60,37 Q46,44 32,43 Q18,44 4,37 Z');
    const stalk = P('M23,38 L41,38 C43,52 45,66 47,72 Q48,75 45,75 L19,75 Q16,75 17,72 C19,66 21,52 23,38 Z');
    return svg(64, 80,
      sil(stalk, C.stalk, C.stalkO) + clip('ms', stalk, `<rect x="36" y="38" width="20" height="40" fill="${C.stalkS}"/>`) +
      Ci(28.5, 58, 2, ` fill="${C.eye}"`) + Ci(36.5, 58, 2, ` fill="${C.eye}"`) + Ci(29, 57.3, 0.7, ' fill="#fff"') + Ci(37, 57.3, 0.7, ' fill="#fff"') +
      line('M29.5,63 Q32.5,65.5 35.5,63', C.eye, 1.5) + E(25, 62.5, 2, 1.2, ` fill="${C.cheek}"`) + E(40, 62.5, 2, 1.2, ` fill="${C.cheek}"`) +
      sil(cap, C.cap, C.capO) +
      clip('mc', cap, E(42, 40, 30, 14, ` fill="${C.capS}"`) + E(32, 42, 30, 3.5, ` fill="${C.stalkS}"`) +
        Ci(20, 20, 5.5, ` fill="${C.dot}"`) + Ci(38, 14, 4.2, ` fill="${C.dot}"`) + Ci(50, 26, 4.8, ` fill="${C.dot}"`) + Ci(31, 29, 3.4, ` fill="${C.dot}"`) + Ci(9, 32, 3, ` fill="${C.dot}"`)) +
      line('M13,19 Q18,11 27,9', '#fff', 2.6, ' opacity=".7"'));
  }
  const cap = P('M1,47 C1,29 15,20 32,20 C49,20 63,29 63,47 Q48,54 32,53 Q16,54 1,47 Z');
  const stalk = P('M18,49 L46,49 C48,60 51,68 53,72 Q54,75 51,75 L13,75 Q10,75 11,72 C13,68 16,60 18,49 Z');
  return svg(64, 80,
    sil(stalk, C.stalk, C.stalkO) + clip('ms', stalk, `<rect x="40" y="48" width="20" height="30" fill="${C.stalkS}"/>`) +
    line('M25,63 Q28,60 31,63', C.eye, 1.6) + line('M34,63 Q37,60 40,63', C.eye, 1.6) + line('M28.5,67 Q32.5,70.5 36.5,67', C.eye, 1.5) +
    sil(cap, C.cap, C.capO) +
    clip('mc', cap, E(42, 50, 32, 12, ` fill="${C.capS}"`) + E(32, 52, 32, 3.5, ` fill="${C.stalkS}"`) +
      E(17, 32, 6, 4.4, ` fill="${C.dot}"`) + E(37, 27, 5, 3.4, ` fill="${C.dot}"`) + E(52, 37, 5, 3.8, ` fill="${C.dot}"`) + E(30, 41, 3.8, 2.8, ` fill="${C.dot}"`)) +
    line('M10,32 Q16,24 25,22', '#fff', 2.6, ' opacity=".7"') +
    // springy motion marks
    line('M6,14 Q4,8 8,3 M58,14 Q60,8 56,3 M32,12 L32,4', '#ffffff', 2.4, ' opacity=".9"'));
}

function umbrella() {
  // upside-down open umbrella; bowl rim (rib tips) y = 26; bowl bottom (128,96); J-handle up in the middle
  const cx = 128, rimY = 26, RX = 120, RY = 70, N = 8;
  const ks = [];
  for (let i = 0; i <= N; i++) ks.push(Math.sin((-90 + i * 180 / N) * Math.PI / 180));
  const rib = (k, rev) => { const pts = [];
    for (let j = 0; j <= 14; j++) { const t = (j / 14) * Math.PI / 2; pts.push([cx + RX * k * Math.cos(t), rimY + RY * Math.sin(t)]); }
    return rev ? pts.reverse() : pts; };
  const f = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  let panels = '', outlineD = '';
  for (let i = 0; i < N; i++) {
    const a = cx + RX * ks[i], b = cx + RX * ks[i + 1];
    const d = `M${a.toFixed(1)},${rimY} Q${((a + b) / 2).toFixed(1)},${rimY + 7} ${b.toFixed(1)},${rimY} L` +
      rib(ks[i + 1]).slice(1).map(f).join(' L') + ' L' + rib(ks[i], true).slice(1).map(f).join(' L') + ' Z';
    outlineD += d + ' ';
    panels += P(d, ` fill="${i % 2 ? C.umbC : C.umb}"`);
  }
  let ribs = '';
  for (let i = 1; i < N; i++) ribs += 'M' + rib(ks[i]).map(f).join(' L') + ' ';
  const shaft = 'M128,98 L128,14 C128,3 142,0 148,7 C152,12 150,18 145,19';
  return svg(256, 112,
    // inside of the bowl peeking above the rim
    E(cx, rimY, RX - 3, 4.5, ` fill="${C.umbS}" stroke="${C.umbO}" stroke-width="2"`) +
    E(cx, rimY + 1, RX - 12, 2.2, ` fill="${C.umbO}" opacity=".5"`) +
    tube(shaft, 5, C.wood, C.woodO, 2.5) + line('M126.6,20 L126.6,8', C.woodL, 1.6) +
    // handle grip
    tube('M144,12 C149,14 150,17 145,19', 6, C.umb, C.umbO, 2.2) +
    // the bowl
    `<g fill="${C.umbO}" stroke="${C.umbO}" stroke-width="6" stroke-linejoin="round">${P(outlineD)}</g>` + panels +
    clip('umbc', P(outlineD), E(cx + 26, 104, 128, 34, ` fill="${C.umbO}" opacity=".18"`) +
      line(ribs, C.umbO, 1.6, ' opacity=".55"')) +
    line('M40,42 Q62,72 104,86', '#fff', 3.4, ' opacity=".45"') +
    // ferrule tip at the bottom + little rib-tip knobs on the rim
    `<rect x="124.5" y="94" width="7" height="10" rx="3" fill="${C.wood}" stroke="${C.woodO}" stroke-width="2"/>` +
    ks.map(k => Ci((cx + RX * k).toFixed(1), rimY, 3, ` fill="${C.umbC}" stroke="${C.umbO}" stroke-width="1.8"`)).join(''));
}

// ---------- HUD items ----------
const HEART = P('M24,41 C14,34 5,27 5,17.5 C5,10.5 10.5,6 16.5,6 C20,6 22.6,8 24,10.6 C25.4,8 28,6 31.5,6 C37.5,6 43,10.5 43,17.5 C43,27 34,34 24,41 Z');
function heart() {
  return svg(48, 48, sil(HEART, C.heart, C.heartO) +
    clip('hc', HEART, E(30, 36, 20, 14, ` fill="${C.heartS}"`) + E(24, 18, 22, 14, ` fill="${C.heart}"`)) +
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
function grow() {
  // a tiny round penguin silhouette badge (slate + white belly) for the size meter
  const B = E(32, 38, 21, 21) , H = Ci(33, 23, 15);
  return svg(64, 64,
    sil(E(-2, 6, 4, 8), C.slateS, C.slateO, 2, 'translate(12 36) rotate(30)') +
    sil(B + H, C.slate, C.slateO, 2.6) +
    clip('gb', B + H, E(39, 44, 15, 15, ` fill="${C.cream}"`) + E(38, 26, 10, 9, ` fill="${C.cream}"`) + E(24, 30, 10, 26, ` fill="${C.slateS}"`)) +
    // coral hood cap + collar stripe
    sil(P('M18,22 C18,10 28,6 34,6 C42,6 49,11 49,18 C44,15 37,15 32,17 C27,19 24,23 23,28 Z'), C.hood, C.hoodO, 2) +
    P('M13,38 C24,43 40,44 51,37', ` fill="none" stroke="${C.hoodO}" stroke-width="6.4" stroke-linecap="round"`) +
    P('M13,38 C24,43 40,44 51,37', ` fill="none" stroke="${C.hood}" stroke-width="3.4" stroke-linecap="round"`) +
    E(36, 24, 2.4, 3.2, ` fill="${C.eye}"`) + E(43, 24, 2.6, 3.4, ` fill="${C.eye}"`) + Ci(37, 22.8, 0.9, ' fill="#fff"') + Ci(44, 22.8, 1, ' fill="#fff"') +
    sil(P('M44,28 C48,27 52,28 55,30 C52,32 48,32.5 44,32 Z'), C.beak, C.beakO, 1.4) +
    sil(E(28, 58, 6, 3) + E(40, 58, 6, 3), C.beak, C.beakO, 1.6));
}

// ---------- icon: Puddle's face + hood, a firefly, leaves, glass panes, a raindrop ----------
function icon() {
  const ff = firefly(0, 'iff');
  const defs = `<linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb7a6"/><stop offset="1" stop-color="#4f8f80"/></linearGradient>` +
    `<radialGradient id="ibd" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#eaf6f1"/><stop offset="1" stop-color="#a9d3c3"/></radialGradient>` +
    `<clipPath id="ib"><circle cx="128" cy="128" r="112"/></clipPath>` + ff.defs;
  // full-bleed opaque square: greenhouse glass panes
  let panes = '';
  for (let x = 0; x <= 256; x += 64) panes += `M${x},0 L${x},256 `;
  for (let y = 0; y <= 256; y += 64) panes += `M0,${y} L256,${y} `;
  const bg = `<rect width="256" height="256" fill="url(#ibg)"/>` + line(panes, '#e8f4ef', 5, ' opacity=".35"') +
    line('M10,30 l14,-14 M200,232 l14,-14 M170,20 l10,-10', '#fff', 3, ' opacity=".35"');
  const badgeIn = `<circle cx="128" cy="128" r="112" fill="url(#ibd)"/>` +
    line('M64,16 L64,240 M192,16 L192,240 M16,86 L240,86', '#ffffff', 4, ' opacity=".7"') +
    `<g transform="translate(-13 18) scale(2.05)">${puddleBody('idle', 'ic')}</g>` +
    // big leaves in front at the bottom
    sil(P('M20,250 C14,214 40,182 92,178 C96,214 66,246 20,250 Z'), C.leaf, C.leafO, 3) +
    sil(P('M236,250 C242,214 216,182 164,178 C160,214 190,246 236,250 Z'), C.leafS, C.leafO, 3) +
    line('M22,248 C40,224 62,200 90,180 M234,248 C216,224 194,200 166,180', C.vein, 2.6) +
    line('M40,226 l-6,-14 M54,210 l-6,-16 M44,232 l16,2 M60,216 l16,0 M216,226 l6,-14 M202,210 l6,-16 M212,232 l-16,2 M196,216 l-16,0', C.leafV, 2, ' opacity=".7"') +
    drop(58, 70, 8);
  const ring = Ci(128, 128, 113, ` fill="none" stroke="${C.slateO}" stroke-width="8"`) + Ci(128, 128, 106, ' fill="none" stroke="#fff" stroke-width="3" opacity=".75"');
  return svg(256, 256, bg + `<g clip-path="url(#ib)">${badgeIn}</g>` + ring +
    `<g transform="translate(158 18) scale(1.45)">${ff.body}</g>`, defs);
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const k of Object.keys(POSES)) files['puddle_' + k] = puddle(k);
files.firefly_0 = fireflySvg(0); files.firefly_1 = fireflySvg(1);
files.pot = pot(); files.shelf = shelf(); files.leaf = leafSvg(); files.basket = basket();
files.mushroom = mushroom(false); files.mushroom_up = mushroom(true); files.umbrella = umbrella();
files.heart = heart(); files.heart_empty = heartEmpty(); files.jar = jar(); files.grow = grow(); files.icon = icon();
for (const [n, s] of Object.entries(files)) {
  if (/<text|<image|<script|href=|font/i.test(s)) throw new Error(n + ': forbidden element');
  fs.writeFileSync(path.join(OUT, n + '.svg'), s);
}
console.log('wrote ' + Object.keys(files).length + ' SVGs to ' + OUT);
