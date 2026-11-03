#!/usr/bin/env node
// Character & light art generator for Ember's Glow Castle.
// 100% original hand-written SVG (no text, fonts, scripts, images or external refs).
// Ember's five frames are built from the SAME body parts, so her body geometry is
// identical across frames — only wings, face and paws change.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Ember (baby dragon)
  body: '#7fd8c8', bodyShade: '#55b8a8', bodyLine: '#2c7a6f', muzzle: '#b4efe4',
  belly: '#fff1c9', bellyShade: '#f0d9a0', bellyLine: '#b8925a',
  wing: '#b9a0f5', wingShade: '#9478e0', wingLine: '#563f9e', wingBone: '#7a5fcc',
  horn: '#fff1c9', hornShade: '#ecd29a', hornLine: '#a8803f',
  tailTip: '#b9a0f5',
  eye: '#2e1d57', eyeLow: '#6a4cc4', cheek: '#ff9ec4', mouth: '#7a2e4a', tongue: '#ff8fae',
  puff: '#ffd27a', puffLine: '#d98a2b', sweat: '#9fe3ff', sweatLine: '#3f8fbf',
  // Boo (ghost)
  boo: '#f3eeff', booShade: '#cfc3f2', booLine: '#6a5aa8', booEye: '#3a2d63',
  cap: '#8fb0ff', capShade: '#6d8ae6', capLine: '#33479e', capBand: '#fff4d6', capBandLine: '#a8905a', pom: '#ffffff',
  // pumpkin
  pk: '#ff9b3d', pkShade: '#e2731c', pkLine: '#93410f', stem: '#7a8a3a', stemLine: '#3e4a14',
  leaf: '#7cc35a', leafShade: '#5aa23c', leafLine: '#2e5e1c', bubble: '#cdeeff', bubbleLine: '#4f8fc0',
  pkFace: '#6b2a08',
  // lights
  t1: '#b6f04a', t1s: '#86c22a', t1l: '#3d6a0e',
  t2: '#5cc8ff', t2s: '#2f9fe0', t2l: '#14588a',
  t3: '#ff7ac8', t3s: '#e04ea6', t3l: '#8a1f63',
  t4: '#ffd44a', t4s: '#f0a820', t4l: '#8a5a00', glass: '#e4f4ff', glassLine: '#4e6a9c',
  cork: '#c98a4b', corkS: '#a66b31', corkL: '#6b3f17',
  t5: '#ff9a3c', t5core: '#ffe68a', t5l: '#b04812', wax: '#fff3d6', waxS: '#ecd2a6', waxL: '#9a7a4a',
  t6: '#ff5a5a', t6s: '#d93a44', t6l: '#7a1a26', gold: '#ffc83d', goldS: '#e09a18', goldL: '#8a5a00',
  t7: '#ffe14d', t7s: '#f2b41c', t7l: '#946200',
  t8: '#e9e2ff', t8s: '#c6b8f2', t8l: '#5e4ea0', crater: '#d4c8fa',
  face: '#3a2340', blush: '#ff8fb8',
  // HUD / icon
  medal: '#ffcf4a', medalS: '#e09a18', medalL: '#7a4a00', medalIn: '#5a3ea8', night: '#2a1b5e', night2: '#4b2f96',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +(+n).toFixed(2);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
let _id = 0;
let PFX = 'a';
const uid = () => `${PFX}${++_id}`;

// Filled shape with a one-step cel shade (the shape minus a copy shifted up-left,
// so the shade sits lower-right), one highlight, then the outline on top.
function shape(d, fill, shade, lineC, opt = {}) {
  const sw = opt.sw ?? 3;
  const [ox, oy] = opt.off ?? [-4, -4];
  const id = uid();
  let s = `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
  s += `<g clip-path="url(#${id})">`;
  s += `<path d="${d}" fill="${shade || fill}"/>`;
  if (shade) s += `<path d="${d}" fill="${fill}" transform="translate(${ox} ${oy})"/>`;
  if (opt.inner) s += opt.inner;
  if (opt.hi) {
    const [hx, hy, hrx, hry, rot = 0] = opt.hi;
    s += `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" transform="rotate(${rot} ${hx} ${hy})" fill="#fff" opacity="${opt.hiOp ?? 0.6}"/>`;
  }
  s += `</g>`;
  if (sw) s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  return s;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
// a "tube" (arm, tail): outline stroke under a fill stroke
const limb = (d, w, fill, lineC, sw = 3) =>
  line(d, lineC, w + sw * 2) + line(d, fill, w);
function sparkle(cx, cy, r, fill = '#fff', op = 1) {
  const k = r * 0.22;
  return `<path d="M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z" fill="${fill}" opacity="${op}"/>`;
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
function softPoly(pts, kOut = 0.2, kIn = kOut) {
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const k = i % 2 ? kIn : kOut;
    const p = pts[i], prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const a = mid(p, prev, k), b = mid(p, next, k);
    d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(b[0]) + ' ' + f(b[1]);
  }
  return d + 'Z';
}
function glow(cx, cy, r, col, a0 = 0.6, a1 = 0.26) {
  const id = uid();
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${col}" stop-opacity="${a0}"/><stop offset="0.55" stop-color="${col}" stop-opacity="${a1}"/>` +
    `<stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
}
const rot = (p, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

// ================================================================= EMBER
// viewBox 0 0 160 160. Body centre (80,78). Hold point (80,138).
const EMBER = { centre: [80, 78], hold: [80, 138] };
const ROOT_L = [60, 92]; // left wing root (right wing is mirrored about x=80)

function emberWing(angleDeg, k = 1) {
  // local coords: root at (0,0), wing reaching left
  const a = (angleDeg * Math.PI) / 180;
  const L = (x, y) => { const p = rot([x * k, y * k], a); return [f(ROOT_L[0] + p[0]), f(ROOT_L[1] + p[1])]; };
  const r0 = L(2, -6), c1 = L(-18, -30), tip = L(-50, -22), s1c = L(-46, -6), s1 = L(-40, 2),
    s2c = L(-34, 14), s2 = L(-24, 6), s3c = L(-14, 18), r1 = L(2, 10);
  const d = `M${r0}Q${c1} ${tip}Q${s1c} ${s1}Q${s2c} ${s2}Q${s3c} ${r1}Z`;
  const sh = (p) => p.join(' ');
  let s = shape(d.replace(/,/g, ' '), P.wing, P.wingShade, P.wingLine, { off: [3, -5], hi: [...L(-30, -16), 9, 3.5, angleDeg - 8], hiOp: 0.45 });
  // finger bones
  s += line(`M${sh(L(0, -2))}Q${sh(L(-22, -18))} ${sh(tip)}`, P.wingLine, 2.6);
  s += line(`M${sh(L(-12, -10))}L${sh(s1)}`, P.wingBone, 2);
  s += line(`M${sh(L(-8, -6))}L${sh(s2)}`, P.wingBone, 2);
  // claw nub at the tip
  s += `<circle cx="${tip[0]}" cy="${tip[1]}" r="3" fill="${P.horn}" stroke="${P.hornLine}" stroke-width="2"/>`;
  return s;
}
function emberWings(angleDeg, k = 1) {
  const w = emberWing(angleDeg, k);
  // right wing: mirror the same drawing (unique ids for the clip in the copy)
  const w2 = emberWing(angleDeg, k);
  return `<g>${w}</g><g transform="translate(160 0) scale(-1 1)">${w2}</g>`;
}
function emberBackParts() {
  let s = '';
  // tail: curls out to the right and up, round violet tip
  s += limb('M98 118Q122 136 134 120Q140 110 136 102', 12, P.body, P.bodyLine);
  s += line('M100 124Q120 138 132 124', P.bodyShade, 4, ' opacity="0.8"');
  s += shape(circ(137, 98, 8), P.tailTip, P.wingShade, P.wingLine, { off: [-2, -2.5], hi: [134, 95, 3, 2] });
  // hind feet (dangling)
  s += shape(ell(66, 134, 9, 6.5), P.body, P.bodyShade, P.bodyLine, { off: [-2, -2] });
  s += shape(ell(94, 134, 9, 6.5), P.body, P.bodyShade, P.bodyLine, { off: [-2, -2] });
  return s;
}
function emberBody() {
  let s = '';
  // round body
  const body = ell(80, 106, 30, 29);
  const bellyStripes = line('M66 106Q80 110 94 106M64 116Q80 121 96 116M67 126Q80 130 93 126', P.bellyLine, 1.8, ' opacity="0.55"');
  s += shape(body, P.body, P.bodyShade, P.bodyLine, {
    off: [-5, -3],
    inner: shape(ell(80, 113, 19, 21), P.belly, P.bellyShade, P.bellyLine, { sw: 2.2, off: [-3, -3], inner: bellyStripes }),
  });
  // ear fins (behind the head)
  const fin = (sx) => {
    const m = (x) => f(80 + (x - 80) * sx);
    return shape(`M${m(48)} 46Q${m(26)} 32 ${m(20)} 44Q${m(26)} 52 ${m(22)} 60Q${m(34)} 66 ${m(48)} 62Z`, P.wing, P.wingShade, P.wingLine, { off: [sx * 2, -3] }) +
      line(`M${m(44)} 52L${m(28)} 46M${m(44)} 57L${m(28)} 58`, P.wingBone, 1.8);
  };
  s += fin(1) + fin(-1);
  // horns (behind the head top)
  const horn = (sx) => {
    const m = (x) => f(80 + (x - 80) * sx);
    return shape(`M${m(56)} 38Q${m(54)} 20 ${m(58)} 12Q${m(62)} 9 ${m(65)} 14Q${m(69)} 24 ${m(72)} 34Z`, P.horn, P.hornShade, P.hornLine, { off: [sx * 2.5, -2], hi: [m(59), 20, 1.6, 4] });
  };
  s += horn(1) + horn(-1);
  // head
  const head = ell(80, 60, 39, 33);
  s += shape(head, P.body, P.bodyShade, P.bodyLine, {
    off: [-5, -5], hi: [58, 38, 11, 5, -28], hiOp: 0.5,
    inner: `<path d="${ell(80, 79, 22, 13)}" fill="${P.muzzle}"/>` +
      // soft violet forehead spots
      `<circle cx="80" cy="34" r="3.2" fill="${P.wing}" opacity="0.9"/><circle cx="72" cy="37" r="2" fill="${P.wing}" opacity="0.9"/><circle cx="88" cy="37" r="2" fill="${P.wing}" opacity="0.9"/>`,
  });
  // nostrils
  s += `<ellipse cx="74" cy="76" rx="1.9" ry="1.4" fill="${P.bodyLine}"/><ellipse cx="86" cy="76" rx="1.9" ry="1.4" fill="${P.bodyLine}"/>`;
  // cheeks
  s += `<ellipse cx="52" cy="73" rx="7" ry="4.5" fill="${P.cheek}" opacity="0.75"/><ellipse cx="108" cy="73" rx="7" ry="4.5" fill="${P.cheek}" opacity="0.75"/>`;
  return s;
}
function emberEyeOpen(cx, cy, big = 1) {
  const id = uid();
  const rx = 8.5 * big, ry = 10.5 * big;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${P.eye}"/><stop offset="1" stop-color="${P.eyeLow}"/></linearGradient>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})" stroke="${P.eye}" stroke-width="1.5"/>` +
    `<circle cx="${f(cx - 2.8 * big)}" cy="${f(cy - 4 * big)}" r="${f(3.6 * big)}" fill="#fff"/>` +
    `<circle cx="${f(cx + 3 * big)}" cy="${f(cy + 4 * big)}" r="${f(1.6 * big)}" fill="#fff" opacity="0.9"/>`;
}
function emberFace(kind, puffs = true) {
  let s = '';
  if (kind === 'idle' || kind === 'flap') {
    s += emberEyeOpen(63, 56) + emberEyeOpen(97, 56);
    s += line('M73 84Q76.5 88 80 85Q83.5 88 87 84', P.mouth, 2.4);
  } else if (kind === 'drop') {
    s += emberEyeOpen(63, 55, 1.08) + emberEyeOpen(97, 55, 1.08);
    s += `<ellipse cx="80" cy="86" rx="4.2" ry="5" fill="${P.mouth}"/><ellipse cx="80" cy="88" rx="2.6" ry="2.2" fill="${P.tongue}"/>`;
  } else if (kind === 'happy') {
    s += line('M54 58Q63 46 72 58', P.eye, 4) + line('M88 58Q97 46 106 58', P.eye, 4);
    s += `<path d="M70 82Q80 81 90 82Q88 95 80 95Q72 95 70 82Z" fill="${P.mouth}" stroke="${P.mouth}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="M74 91Q80 86 86 91Q83 95 80 95Q77 95 74 91Z" fill="${P.tongue}"/>`;
    // tiny warm puffs drifting out from the nostrils (soft clouds just outside the cheeks)
    const cloud = (x, y, sx) => {
      const cs = [[x, y, 3.8], [x + sx * 3.8, y - 3.4, 3], [x - sx * 3, y - 3, 2.5]];
      return cs.map(([cx, cy, r]) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r + 1.5}" fill="${P.puffLine}"/>`).join('') +
        cs.map(([cx, cy, r]) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="#fff4dc"/>`).join('') +
        `<circle cx="${f(x - sx * 1.5)}" cy="${f(y - 1.5)}" r="1.6" fill="#fff"/>`;
    };
    s += `<circle cx="68" cy="79" r="1.6" fill="${P.puff}"/><circle cx="92" cy="79" r="1.6" fill="${P.puff}"/>`;
    if (puffs) s += `<g opacity="0.9">${cloud(46, 87, -1) + cloud(114, 87, 1)}</g>`;
    s += sparkle(34, 70, 3.5, '#fff6c4') + sparkle(126, 70, 3.5, '#fff6c4');
  } else if (kind === 'oops') {
    s += line('M55 50L69 56L55 62', P.eye, 3.6) + line('M105 50L91 56L105 62', P.eye, 3.6);
    s += line('M70 87Q73.5 83 77 87Q80.5 91 84 87Q87.5 83 91 87', P.mouth, 2.4);
    // sweat drop
    s += `<path d="M118 28Q124 38 124 42Q124 47 119 47Q114 47 114 42Q114 38 118 28Z" fill="${P.sweat}" stroke="${P.sweatLine}" stroke-width="2" stroke-linejoin="round"/>`;
    s += `<ellipse cx="117" cy="41" rx="1.4" ry="2.4" fill="#fff"/>`;
    // shake marks
    s += line('M36 22Q30 28 32 36M28 20Q22 27 24 36', '#c9b6ff', 2.4);
    s += line('M128 50Q134 56 132 64M136 48Q142 55 140 64', '#c9b6ff', 2.4);
  }
  return s;
}
function emberPaws(kind) {
  let s = '';
  const paw = (x, y, open) => {
    let p = shape(open ? ell(x, y, 7, 6) : circ(x, y, 6.5), P.body, P.bodyShade, P.bodyLine, { off: [-2, -2] });
    // toe beans
    if (open) p += `<circle cx="${f(x - 3)}" cy="${f(y + 3)}" r="1.4" fill="${P.belly}"/><circle cx="${x}" cy="${f(y + 3.8)}" r="1.4" fill="${P.belly}"/><circle cx="${f(x + 3)}" cy="${f(y + 3)}" r="1.4" fill="${P.belly}"/>`;
    else p += line(`M${f(x - 2.5)} ${f(y + 2)}L${f(x - 2.5)} ${f(y + 4.5)}M${f(x + 2.5)} ${f(y + 2)}L${f(x + 2.5)} ${f(y + 4.5)}`, P.bodyLine, 1.4);
    return p;
  };
  if (kind === 'drop') {
    s += limb('M62 100Q50 112 52 134', 9, P.body, P.bodyLine) + paw(52, 136, true);
    s += limb('M98 100Q110 112 108 134', 9, P.body, P.bodyLine) + paw(108, 136, true);
  } else {
    // paws cupped either side of the hold point (80,138)
    s += limb('M62 100Q54 114 63 127', 9, P.body, P.bodyLine) + paw(64, 129, false);
    s += limb('M98 100Q106 114 97 127', 9, P.body, P.bodyLine) + paw(96, 129, false);
  }
  return s;
}
const WING_ANGLE = { idle: -4, flap: 32, drop: 36, happy: 14, oops: -16 };
// raised wings are drawn a little larger so they show beside the head
const WING_SCALE = { idle: 1, flap: 1.3, drop: 1.25, happy: 1.08, oops: 1 };
function emberInner(kind) {
  return emberBackParts() + emberWings(WING_ANGLE[kind], WING_SCALE[kind]) + emberBody() + emberFace(kind) + emberPaws(kind);
}
function ember(kind) {
  PFX = 'e' + kind[0]; _id = 0;
  return svg(160, 160, emberInner(kind));
}

// ================================================================= BOO
// viewBox 0 0 128 128, centre (64,60)
function booBody() {
  return 'M30 98C26 70 28 26 64 22C100 26 102 70 98 98' +
    'Q96 112 88 104Q81 114 72.5 104Q64 114 55.5 104Q47 114 40 104Q32 112 30 98Z';
}
function boo(kind) {
  PFX = 'b' + kind[0]; _id = 0;
  let s = '';
  // arms (behind the sheet edge)
  if (kind === 'carry') {
    s += shape('M34 50Q22 40 22 28Q24 22 30 25Q36 34 40 44Z', P.boo, P.booShade, P.booLine, { off: [2, -2] });
    s += shape('M94 50Q106 40 106 28Q104 22 98 25Q92 34 88 44Z', P.boo, P.booShade, P.booLine, { off: [-2, -2] });
  } else {
    s += shape('M33 66Q20 70 16 78Q16 84 22 82Q30 78 34 76Z', P.boo, P.booShade, P.booLine, { off: [2, -2] });
    s += shape('M95 66Q108 70 112 78Q112 84 106 82Q98 78 94 76Z', P.boo, P.booShade, P.booLine, { off: [-2, -2] });
  }
  s += shape(booBody(), P.boo, P.booShade, P.booLine, { off: [-7, -5], hi: [44, 40, 6, 11, 20], hiOp: 0.8 });
  // night-cap: flops over to the right with a pom-pom
  s += shape('M38 34Q40 10 64 8Q88 8 98 22Q104 32 104 42Q96 30 90 32Z', P.cap, P.capShade, P.capLine, {
    off: [-4, -3], hi: [52, 18, 8, 3, -20], hiOp: 0.5,
    inner: line('M52 12Q58 22 56 34M72 9Q80 18 78 31', P.capShade, 4, ' opacity="0.7"'),
  });
  s += shape('M35 38Q36 28 64 26Q91 26 93 36Q94 42 88 41Q64 36 40 42Q34 43 35 38Z', P.capBand, '#e8d6a8', P.capBandLine, { off: [-2, -2.5], sw: 2.5 });
  s += shape(circ(104, 46, 7), P.pom, '#dcd4f4', P.capLine, { off: [-2, -2], sw: 2.5 });
  // face
  if (kind === 'carry') {
    s += line('M45 60Q51 52 57 60', P.booEye, 3.4) + line('M71 60Q77 52 83 60', P.booEye, 3.4);
    s += `<path d="M57 70Q64 70 71 70Q69 79 64 79Q59 79 57 70Z" fill="#7a2e4a"/><path d="M60 76Q64 73 68 76Q66 79 64 79Q62 79 60 76Z" fill="#ff8fae"/>`;
    s += sparkle(18, 18, 4.5, '#fff6c4') + sparkle(110, 14, 3.5, '#fff6c4');
  } else {
    for (const x of [51, 77]) {
      s += `<ellipse cx="${x}" cy="58" rx="6.2" ry="9" fill="${P.booEye}"/>` +
        `<circle cx="${x - 2}" cy="54" r="2.6" fill="#fff"/><circle cx="${x + 2}" cy="62" r="1.1" fill="#fff"/>`;
    }
    s += line('M59 71Q64 75 69 71', '#7a2e4a', 2.4);
  }
  s += `<ellipse cx="41" cy="69" rx="6" ry="3.6" fill="${P.cheek}" opacity="0.8"/><ellipse cx="87" cy="69" rx="6" ry="3.6" fill="${P.cheek}" opacity="0.8"/>`;
  return svg(128, 128, s);
}

// ================================================================= PUMPKIN
// viewBox 0 0 96 96, centre (48,50)
function pumpkin(awake) {
  PFX = awake ? 'pa' : 'ps'; _id = 0;
  let s = '';
  // stem + curl + leaf (behind)
  s += line('M50 24Q60 16 66 18Q72 22 68 27Q64 30 62 26', P.stemLine, 2.2);
  s += shape('M53 22Q66 8 80 14Q74 26 60 26Z', P.leaf, P.leafShade, P.leafLine, { off: [-2, -2], sw: 2.5 });
  s += line('M56 23Q66 17 76 16', P.leafLine, 1.6);
  s += shape('M43 26Q42 16 46 9Q50 6 53 9Q50 16 53 26Z', P.stem, '#5e6c26', P.stemLine, { off: [-1.5, -1.5], sw: 2.6 });
  // lobes
  s += shape(ell(30, 54, 21, 27), P.pk, P.pkShade, P.pkLine, { off: [-5, -4] });
  s += shape(ell(66, 54, 21, 27), P.pk, P.pkShade, P.pkLine, { off: [-5, -4] });
  s += shape(ell(48, 54, 22, 30), P.pk, P.pkShade, P.pkLine, { off: [-5, -4], hi: [38, 36, 5, 8, 15], hiOp: 0.45 });
  // face
  if (awake) {
    for (const x of [39, 57]) s += `<circle cx="${x}" cy="50" r="5.4" fill="${P.pkFace}"/><circle cx="${x - 1.6}" cy="48" r="2" fill="#fff"/>`;
    s += line('M33 41L37 39M63 41L59 39', P.pkFace, 2.2);
    s += `<path d="M40 60Q48 58 56 60Q55 70 48 70Q41 70 40 60Z" fill="${P.pkFace}"/><path d="M43 66Q48 63 53 66Q51 70 48 70Q45 70 43 66Z" fill="#ff7a6a"/>`;
    // surprise marks
    s += line('M10 22L16 28M6 34L13 36M86 30L80 34', P.pkLine, 4.6) + line('M10 22L16 28M6 34L13 36M86 30L80 34', '#ffe08a', 2.4);
  } else {
    s += line('M33 50Q39 55 45 50', P.pkFace, 2.8) + line('M51 50Q57 55 63 50', P.pkFace, 2.8);
    s += `<ellipse cx="48" cy="64" rx="3" ry="3.6" fill="${P.pkFace}"/>`;
    // sleep bubble (no text)
    s += `<circle cx="74" cy="30" r="9" fill="${P.bubble}" fill-opacity="0.75" stroke="${P.bubbleLine}" stroke-width="2"/>` +
      `<ellipse cx="71" cy="27" rx="2.6" ry="1.6" fill="#fff" transform="rotate(-30 71 27)"/>` +
      `<circle cx="64" cy="42" r="3.2" fill="${P.bubble}" fill-opacity="0.75" stroke="${P.bubbleLine}" stroke-width="1.6"/>`;
  }
  s += `<ellipse cx="29" cy="62" rx="5" ry="3" fill="#ff5f6a" opacity="0.55"/><ellipse cx="67" cy="62" rx="5" ry="3" fill="#ff5f6a" opacity="0.55"/>`;
  return svg(96, 96, s);
}

// ================================================================= LIGHTS
// viewBox 0 0 96 96, centre (48,48); everything inside an 80 px circle (r 40).
function firefly(cx, cy, r, c, cs, cl, faceDx = 0) {
  let s = '';
  // wings (translucent, flared out to the sides, behind)
  for (const sx of [-1, 1]) {
    const wx = f(cx + sx * r * 0.95), wy = f(cy - r * 0.55);
    s += `<ellipse cx="${wx}" cy="${wy}" rx="${f(r * 0.62)}" ry="${f(r * 0.36)}" transform="rotate(${sx * -28} ${wx} ${wy})" fill="#ffffff" fill-opacity="0.7" stroke="${cl}" stroke-width="1.8"/>`;
  }
  // antennae: thin, long, curling outwards with glowing tips
  for (const sx of [-1, 1]) {
    const tx = f(cx + sx * r * 0.62), ty = f(cy - r * 1.62);
    s += line(`M${f(cx + sx * r * 0.18)} ${f(cy - r * 0.9)}Q${f(cx + sx * r * 0.12)} ${f(cy - r * 1.5)} ${tx} ${ty}`, cl, 1.6);
    s += `<circle cx="${tx}" cy="${ty}" r="${f(r * 0.12 + 0.9)}" fill="#fffbe0" stroke="${cl}" stroke-width="1.2"/>`;
  }
  // glowing body
  const gid = uid();
  s += `<radialGradient id="${gid}" cx="${f(cx - r * 0.2)}" cy="${f(cy + r * 0.15)}" r="${f(r * 1.1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
  s += shape(circ(cx, cy, r), c, cs, cl, {
    off: [-r * 0.28, -r * 0.28],
    inner: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gid})"/>`,
    hi: [f(cx - r * 0.42), f(cy - r * 0.5), f(r * 0.28), f(r * 0.18), -30], hiOp: 0.85,
  });
  // face
  const ex = r * 0.3, ey = cy - r * 0.02, er = Math.max(1.6, r * 0.14);
  s += `<circle cx="${f(cx + faceDx - ex)}" cy="${f(ey)}" r="${f(er)}" fill="${P.face}"/><circle cx="${f(cx + faceDx + ex)}" cy="${f(ey)}" r="${f(er)}" fill="${P.face}"/>`;
  s += line(`M${f(cx + faceDx - r * 0.18)} ${f(cy + r * 0.28)}Q${f(cx + faceDx)} ${f(cy + r * 0.42)} ${f(cx + faceDx + r * 0.18)} ${f(cy + r * 0.28)}`, P.face, Math.max(1.4, r * 0.1));
  return s;
}
function item(tier) {
  PFX = 'i' + tier; _id = 0;
  let s = '';
  if (tier === 1) {
    s += glow(48, 50, 44, P.t1, 0.75, 0.3);
    // little glow trail
    s += sparkle(24, 70, 4, '#f3ffd0', 0.9) + sparkle(16, 60, 2.6, '#f3ffd0', 0.7);
    s += firefly(48, 54, 18, P.t1, P.t1s, P.t1l);
  } else if (tier === 2) {
    s += glow(48, 50, 46, P.t2, 0.65, 0.28);
    s += firefly(30, 56, 13.5, P.t2, P.t2s, P.t2l, -1.5) + firefly(66, 56, 13.5, P.t2, P.t2s, P.t2l, 1.5);
  } else if (tier === 3) {
    s += glow(48, 50, 46, P.t3, 0.65, 0.28);
    s += firefly(48, 36, 12, P.t3, P.t3s, P.t3l) + firefly(31, 64, 11.5, P.t3, P.t3s, P.t3l, -1) + firefly(65, 64, 11.5, P.t3, P.t3s, P.t3l, 1);
  } else if (tier === 4) {
    s += glow(48, 52, 46, P.t4, 0.7, 0.3);
    s += '<g transform="translate(48 50) scale(0.86) translate(-48 -50)">';
    const jar = 'M34 28L62 28Q64 28 64 31L64 34Q74 40 74 56L74 76Q74 86 64 86L32 86Q22 86 22 76L22 56Q22 40 32 34L32 31Q32 28 34 28Z';
    const glid = uid();
    s += `<radialGradient id="${glid}" cx="48" cy="62" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.45" stop-color="${P.t4}"/><stop offset="1" stop-color="${P.t4s}"/></radialGradient>`;
    s += shape(jar, `url(#${glid})`, null, P.glassLine, {
      sw: 3,
      inner: sparkle(38, 56, 4, '#fff', 0.95) + sparkle(58, 70, 3.2, '#fff', 0.9) + sparkle(46, 76, 2.4, '#fff', 0.8) + sparkle(56, 48, 2.6, '#fff', 0.85) +
        `<path d="M22 40L32 40L30 86L22 86Z" fill="${P.glass}" opacity="0.35"/>` +
        `<rect x="27" y="44" width="4.5" height="30" rx="2.2" fill="#fff" opacity="0.85"/>`,
    });
    // rim + cork
    s += shape('M30 30L66 30Q68 30 68 33L68 36Q68 38 66 38L30 38Q28 38 28 36L28 33Q28 30 30 30Z', P.glass, '#b8cde6', P.glassLine, { off: [-1.5, -1.5], sw: 2.6 });
    s += shape('M36 14L60 14Q62 14 61.6 16L60 30L36 30L34.4 16Q34 14 36 14Z', P.cork, P.corkS, P.corkL, { off: [-3, -2], sw: 2.6 });
    s += `<circle cx="42" cy="21" r="1.4" fill="${P.corkL}"/><circle cx="53" cy="24" r="1.2" fill="${P.corkL}"/>`;
    s += '</g>';
  } else if (tier === 5) {
    s += glow(48, 40, 46, P.t5, 0.75, 0.3);
    s += '<g transform="translate(48 47) scale(0.86) translate(-48 -47)">';
    // saucer
    s += shape('M24 80Q48 73 72 80Q74 86 69 88L27 88Q22 86 24 80Z', P.gold, P.goldS, P.goldL, { off: [-2, -2], sw: 2.6 });
    // wax body with a drip
    s += shape('M34 50Q48 44 62 50L62 82L34 82Z', P.wax, P.waxS, P.waxL, {
      off: [-5, 0], inner: `<rect x="37" y="54" width="4" height="22" rx="2" fill="#fff" opacity="0.7"/>`,
    });
    s += shape('M34 50Q48 44 62 50Q62 56 58 56Q56 66 53 66Q50 66 50 56Q44 58 40 56Q36 60 34 56Z', '#fffaf0', P.waxS, P.waxL, { off: [-1, -2], sw: 2.4 });
    s += line('M48 47L48 41', P.waxL, 2.4);
    // happy flame
    const fid = uid();
    s += `<radialGradient id="${fid}" cx="48" cy="34" r="18" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.t5core}"/><stop offset="0.55" stop-color="#ffc35a"/><stop offset="1" stop-color="${P.t5}"/></radialGradient>`;
    s += shape('M48 6Q54 14 60 22Q66 30 62 38Q58 44 48 44Q38 44 34 38Q30 30 38 20Q42 26 44 24Q42 16 48 6Z', `url(#${fid})`, null, P.t5l, { sw: 2.8 });
    s += `<circle cx="44" cy="33" r="1.9" fill="${P.face}"/><circle cx="53" cy="33" r="1.9" fill="${P.face}"/>`;
    s += line('M45.5 37.5Q48.5 40.5 51.5 37.5', P.face, 1.8);
    s += `<ellipse cx="41" cy="37" rx="2.4" ry="1.4" fill="${P.blush}" opacity="0.7"/><ellipse cx="56" cy="37" rx="2.4" ry="1.4" fill="${P.blush}" opacity="0.7"/>`;
    s += '</g>';
  } else if (tier === 6) {
    s += glow(48, 50, 46, P.t6, 0.65, 0.28);
    // hanging loop
    s += line('M42 16Q48 6 54 16', P.goldL, 2.6);
    // tassel
    s += line('M48 78L48 82', P.goldL, 2.4);
    s += shape('M44.5 80.5L51.5 80.5L53.6 85Q48 87.6 42.4 85Z', P.gold, P.goldS, P.goldL, { off: [-1.5, -1], sw: 2.2 });
    // paper body
    const lid = uid();
    s += `<radialGradient id="${lid}" cx="44" cy="46" r="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd0a0"/><stop offset="0.45" stop-color="${P.t6}"/><stop offset="1" stop-color="${P.t6s}"/></radialGradient>`;
    s += shape(ell(48, 48, 33, 27), `url(#${lid})`, null, P.t6l, {
      inner: line('M48 21L48 75M32 23Q22 48 32 73M64 23Q74 48 64 73M20 30Q12 48 20 66M76 30Q84 48 76 66', P.t6l, 1.8, ' opacity="0.45"') +
        `<ellipse cx="34" cy="38" rx="5" ry="8" transform="rotate(25 34 38)" fill="#fff" opacity="0.5"/>`,
    });
    // gold caps
    s += shape('M34 15L62 15Q66 15 66 19L66 23Q66 26 62 26L34 26Q30 26 30 23L30 19Q30 15 34 15Z', P.gold, P.goldS, P.goldL, { off: [-2, -2], sw: 2.6 });
    s += shape('M36 70L60 70Q64 70 64 74L64 76Q64 79 60 79L36 79Q32 79 32 76L32 74Q32 70 36 70Z', P.gold, P.goldS, P.goldL, { off: [-2, -2], sw: 2.6 });
    // sleepy-happy face
    s += line('M38 48Q41.5 51 45 48', P.face, 2.4) + line('M51 48Q54.5 51 58 48', P.face, 2.4);
    s += line('M44 56Q48 60 52 56', P.face, 2.2);
  } else if (tier === 7) {
    s += glow(48, 50, 46, P.t7, 0.75, 0.32);
    const d = softPoly(starPts(48, 50, 39, 20.5), 0.24, 0.3);
    s += shape(d, P.t7, P.t7s, P.t7l, { off: [-4, -4], hi: [34, 34, 6, 3.5, -40], hiOp: 0.7 });
    s += `<circle cx="41" cy="50" r="2.8" fill="${P.face}"/><circle cx="55" cy="50" r="2.8" fill="${P.face}"/>` +
      `<circle cx="40" cy="49" r="1" fill="#fff"/><circle cx="54" cy="49" r="1" fill="#fff"/>`;
    s += `<path d="M42 57Q48 58 54 57Q53 64 48 64Q43 64 42 57Z" fill="${P.face}"/>`;
    s += `<ellipse cx="36" cy="57" rx="3.4" ry="2" fill="${P.blush}" opacity="0.7"/><ellipse cx="60" cy="57" rx="3.4" ry="2" fill="${P.blush}" opacity="0.7"/>`;
  } else if (tier === 8) {
    s += glow(48, 48, 47, '#cfc4ff', 0.75, 0.32);
    s += shape(circ(48, 48, 35), P.t8, P.t8s, P.t8l, {
      off: [-6, -5], hi: [34, 30, 8, 4.5, -35], hiOp: 0.75,
      inner: [[64, 34, 6], [30, 64, 5], [68, 66, 4], [58, 22, 3]].map(([x, y, r]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.crater}" stroke="${P.t8s}" stroke-width="1.6"/>`).join(''),
    });
    s += line('M34 48Q39 53 44 48', P.t8l, 2.6) + line('M52 48Q57 53 62 48', P.t8l, 2.6);
    s += line('M42 58Q48 63 54 58', P.t8l, 2.4);
    s += `<ellipse cx="33" cy="56" rx="4" ry="2.4" fill="${P.blush}" opacity="0.6"/><ellipse cx="63" cy="56" rx="4" ry="2.4" fill="${P.blush}" opacity="0.6"/>`;
    s += sparkle(74, 24, 4, '#fff') + sparkle(22, 72, 3, '#fff', 0.85);
  }
  return svg(96, 96, s);
}

// ================================================================= GOAL RING
function goalRing() {
  PFX = 'g'; _id = 0;
  let s = '';
  // soft violet inner band (transparent centre r<30)
  s += `<path d="${circ(48, 48, 37)}${circ(48, 48, 30)}" fill="${P.medalIn}" fill-opacity="0.55" fill-rule="evenodd"/>`;
  s += `<circle cx="48" cy="48" r="30" fill="none" stroke="#c9b6ff" stroke-width="1.6" opacity="0.8"/>`;
  // gold ring: fill, lower-right shade arc, upper-left highlight arc, outlines
  s += `<path d="${circ(48, 48, 45)}${circ(48, 48, 37)}" fill="${P.medal}" fill-rule="evenodd"/>`;
  const C = 2 * Math.PI * 42;
  s += `<circle cx="48" cy="48" r="42.5" fill="none" stroke="${P.medalS}" stroke-width="5" stroke-dasharray="${f(C * 0.42)} ${f(C)}" transform="rotate(-15 48 48)"/>`;
  s += `<circle cx="48" cy="48" r="41" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-dasharray="${f(C * 0.18)} ${f(C)}" transform="rotate(195 48 48)"/>`;
  s += `<circle cx="48" cy="48" r="45" fill="none" stroke="${P.medalL}" stroke-width="2.4"/><circle cx="48" cy="48" r="37" fill="none" stroke="${P.medalL}" stroke-width="2.4"/>`;
  // studs
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const x = 48 + 41 * Math.cos(a), y = 48 + 41 * Math.sin(a);
    s += i % 2 ? `<circle cx="${f(x)}" cy="${f(y)}" r="1.8" fill="#fff6c4"/>` : sparkle(f(x), f(y), 4, '#fff8d8');
  }
  return svg(96, 96, s);
}

// ================================================================= ICON
function icon() {
  PFX = 'n'; _id = 0;
  let s = '';
  const bg = uid();
  s += `<radialGradient id="${bg}" cx="128" cy="96" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.night2}"/><stop offset="1" stop-color="${P.night}"/></radialGradient>`;
  s += `<circle cx="128" cy="128" r="122" fill="url(#${bg})" stroke="${P.medal}" stroke-width="8"/>`;
  s += `<circle cx="128" cy="128" r="113" fill="none" stroke="#7a5fd0" stroke-width="2" opacity="0.6"/>`;
  // stars
  for (const [x, y, r] of [[52, 70, 4], [204, 62, 5], [70, 40, 2.5], [190, 104, 3], [40, 120, 2.5], [222, 150, 3]]) s += sparkle(x, y, r, '#fff6c4', 0.9);
  // castle tower silhouette
  const cid = uid();
  s += `<clipPath id="${cid}"><circle cx="128" cy="128" r="118"/></clipPath><g clip-path="url(#${cid})">`;
  s += `<path d="M24 256L24 186L18 186L18 172L26 172L26 178L34 178L34 172L42 172L42 178L50 178L50 172L58 172L58 186L52 186L52 256Z" fill="#1a1046"/>`;
  s += `<path d="M14 172L38 136L62 172Z" fill="#1a1046"/><rect x="33" y="196" width="10" height="16" rx="5" fill="#ffd27a"/>`;
  s += `<path d="M196 256L196 200L234 200L234 256Z" fill="#1a1046"/><path d="M190 202L215 170L240 202Z" fill="#1a1046"/><rect x="210" y="214" width="9" height="14" rx="4.5" fill="#ffd27a" opacity="0.9"/>`;
  s += `</g>`;
  // Ember (happy), big, holding a glowing star
  const g = uid();
  s += `<radialGradient id="${g}" cx="128" cy="200" r="54" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.t7}" stop-opacity="0.85"/><stop offset="1" stop-color="${P.t7}" stop-opacity="0"/></radialGradient>`;
  const sc = 1.6, tx = 128 - 80 * sc, ty = 100 - 60 * sc;
  const saveP = PFX; PFX = 'ne';
  s += `<g clip-path="url(#${cid})"><g transform="translate(${f(tx)} ${f(ty)}) scale(${sc})">${emberBackParts() + emberWings(18) + emberBody() + emberFace('happy', false)}</g>`;
  s += `<circle cx="128" cy="200" r="54" fill="url(#${g})"/>`;
  s += shape(softPoly(starPts(128, 200, 38, 19.5), 0.24, 0.3), P.t7, P.t7s, P.t7l, { sw: 4, off: [-4, -4], hi: [116, 188, 5, 3, -40], hiOp: 0.7 });
  s += `<g transform="translate(${f(tx)} ${f(ty)}) scale(${sc})">${emberPaws('idle')}</g></g>`;
  PFX = saveP;
  return svg(256, 256, s);
}

// ================================================================= WRITE
fs.mkdirSync(OUT, { recursive: true });
const files = {};
for (const k of ['idle', 'flap', 'drop', 'happy', 'oops']) files[`ember_${k}.svg`] = ember(k);
files['boo.svg'] = boo('idle');
files['boo_carry.svg'] = boo('carry');
files['pumpkin.svg'] = pumpkin(false);
files['pumpkin_awake.svg'] = pumpkin(true);
for (let t = 1; t <= 8; t++) files[`item_${t}.svg`] = item(t);
files['goal_ring.svg'] = goalRing();
files['icon.svg'] = icon();
for (const [n, c] of Object.entries(files)) {
  if (/<text|<image|<script|href=|@import|font-family/.test(c)) throw new Error('forbidden content in ' + n);
  fs.writeFileSync(path.join(OUT, n), c);
}
console.log('wrote ' + Object.keys(files).length + ' SVGs to ' + path.relative(process.cwd(), OUT));
module.exports = { EMBER, P };
