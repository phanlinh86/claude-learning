#!/usr/bin/env node
// Character & item art generator for Mochi's Fairy Bounce.
// 100% original hand-written SVG (no text, fonts, images, scripts or external refs).
// Mochi's six frames are built from the same body parts, so the feet line (y=116),
// the body centre (60,70) and the paws (34,14)/(86,14) are identical in every frame.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  ink: '#3a2a4a', // character outlines + features (deep plum)
  // Mochi
  fur: '#3b3247', furShade: '#2a2334', furHi: '#5d5270',
  white: '#fffaf3', whiteShade: '#e7dcf0', rim: '#f6f0ff',
  eyeWhite: '#ffffff', pupil: '#2a1f36', blush: '#ff9db5', tongue: '#ff7f9e', mouthIn: '#8a2f4f',
  pad: '#7a6b8c', beanPad: '#f2a7c0',
  // cap
  cap: '#f0566e', capShade: '#c93a58', capLine: '#7a1f3a', capHi: '#ffd0d8',
  spot: '#fff1d6', spotShade: '#f2d7b0', under: '#fde4c0', gill: '#d9a877', stem: '#fff4e2', stemShade: '#ecd6b4', stemLine: '#8a5a3a',
  // ball
  core: '#fffbea', coreEdge: '#ffe59a', glow: '#ffd25a', ballLine: '#b9801c',
  // star
  gold: '#ffd23f', goldShade: '#f2a51e', goldLine: '#9a5a00', goldHi: '#fff6b8',
  // owl
  owl: '#b7a6dc', owlShade: '#9580c4', owlBelly: '#efe6fb', owlBellyShade: '#dccff2', face: '#f8f3ff',
  beak: '#ffb547', beakShade: '#e88e22', owlFoot: '#ffb547',
  cloud: '#ffffff', cloudShade: '#dfe2f7', cloudLine: '#6f6a9e',
  night: '#7fa3ea', nightShade: '#5d80cc', nightStripe: '#cfe0ff', pom: '#fffaf3',
  // pillow
  pil: '#ffd6e2', pilShade: '#f4b0c6', pilLine: '#a3506f', pilStar: '#fff3a8', pilStarLine: '#d38a3a',
  // hearts
  heart: '#ff5d7d', heartShade: '#de3a62', heartLine: '#7a1f3a',
  // particles
  zzz: '#e9e6ff', zzzShade: '#c3bdf0', feather: '#ffffff', featherShade: '#e4def3', featherLine: '#8f86b0',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +(+n).toFixed(2);
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
  (defs ? `<defs>${defs}</defs>\n` : '') + `${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
let _id = 0;
let PFX = 'a';
const nid = () => `${PFX}${++_id}`;
// filled shape + clipped one-step shade + highlight, outline on top
function shape(d, fill, lineC, opt = {}) {
  const sw = opt.sw ?? 3;
  let s = '';
  const tr = opt.tr ? ` transform="${opt.tr}"` : '';
  if (opt.shade || opt.hi || opt.inner) {
    const id = nid();
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    s += `<path d="${d}" fill="${fill}"/>`;
    s += `<g clip-path="url(#${id})">`;
    if (opt.shade) s += `<path d="${opt.shade}" fill="${opt.shadeFill}"/>`;
    if (opt.inner) s += opt.inner;
    if (opt.hi) s += `<path d="${opt.hi}" fill="${opt.hiFill ?? '#fff'}" opacity="${opt.hiOp ?? 0.6}"/>`;
    s += `</g>`;
    if (sw) s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    return tr ? `<g${tr}>${s}</g>` : s;
  }
  return `<path${tr} d="${d}" fill="${fill}"${sw ? ` stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
}
// a thick round stroke with an outline (arms, stems)
function limb(d, w, fill, lineC, sw = 3, halo = null) {
  let s = '';
  if (halo) s += `<path d="${d}" fill="none" stroke="${halo}" stroke-width="${w + sw * 2 + 3}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;
  s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${w + sw * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const dot = (cx, cy, r, c, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${c}"${extra}/>`;
const halo = (d, w = 7) => `<path d="${d}" fill="none" stroke="${P.rim}" stroke-width="${w}" stroke-linejoin="round" opacity="0.55"/>`;
function sparkle(cx, cy, r, fill = '#fff', stroke = null, sw = 1.5) {
  const k = r * 0.22;
  const d = `M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z`;
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
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
// rounded polygon (quadratic corners)
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
const heartPath = (cx, cy, s) => // heart of width ~2s, point at cy + 0.95s
  `M${f(cx)} ${f(cy + 0.95 * s)}C${f(cx - 0.35 * s)} ${f(cy + 0.62 * s)} ${f(cx - s)} ${f(cy + 0.22 * s)} ${f(cx - s)} ${f(cy - 0.32 * s)}` +
  `C${f(cx - s)} ${f(cy - 0.78 * s)} ${f(cx - 0.6 * s)} ${f(cy - 1.0 * s)} ${f(cx - 0.42 * s)} ${f(cy - 1.0 * s)}` +
  `C${f(cx - 0.2 * s)} ${f(cy - 1.0 * s)} ${f(cx - 0.04 * s)} ${f(cy - 0.84 * s)} ${f(cx)} ${f(cy - 0.6 * s)}` +
  `C${f(cx + 0.04 * s)} ${f(cy - 0.84 * s)} ${f(cx + 0.2 * s)} ${f(cy - 1.0 * s)} ${f(cx + 0.42 * s)} ${f(cy - 1.0 * s)}` +
  `C${f(cx + 0.6 * s)} ${f(cy - 1.0 * s)} ${f(cx + s)} ${f(cy - 0.78 * s)} ${f(cx + s)} ${f(cy - 0.32 * s)}` +
  `C${f(cx + s)} ${f(cy + 0.22 * s)} ${f(cx + 0.35 * s)} ${f(cy + 0.62 * s)} ${f(cx)} ${f(cy + 0.95 * s)}Z`;

// ================================================================= MOCHI
// viewBox 0 0 120 120. Feet line y=116 (outer edge of the foot outline).
// Body centre (60,70). Paws at (34,14) and (86,14) (they hold the cap handles).
// Head centre (60,50), top of the head ≈ y 22 (ears stick up to ≈ y 15).
const PAW_L = [34, 14], PAW_R = [86, 14];
const HEAD = { cx: 60, cy: 50, rx: 30, ry: 27.5 };
const NECK = [60, 78]; // pivot for head tilts

function mochiArm(side, paw) {
  // shoulder -> elbow out -> paw; drawn behind the head
  const sx = side < 0 ? 42 : 78, sy = 86;
  const ex = side < 0 ? 17 : 103, ey = 56;
  const [px, py] = paw;
  const d = `M${sx} ${sy}Q${ex} ${ey + 14} ${ex + (side < 0 ? 4 : -4)} ${ey}Q${f(ex + side * -2)} ${f(py + 22)} ${f(px)} ${f(py + 4)}`;
  let s = limb(d, 11.5, P.fur, P.ink, 3, P.rim);
  // one highlight streak along the outside of the forearm
  s += line(`M${ex + (side < 0 ? 1 : -1)} ${ey - 4}Q${f(ex + side * -1)} ${f(py + 24)} ${f(px + side * 7)} ${f(py + 10)}`, P.furHi, 2.6, ' opacity="0.9"');
  return s;
}
function mochiPaw(p) {
  const [x, y] = p;
  const d = ell(x, y, 8.8, 7.8);
  let s = halo(d, 6);
  s += shape(d, P.fur, P.ink, {
    shade: ell(x + 2, y + 5.5, 8.6, 4), shadeFill: P.furShade,
  });
  // palm pad + three toe beans (so the paws never read as extra ears)
  s += `<path d="${ell(x, y + 1.8, 3.8, 3)}" fill="${P.beanPad}"/>`;
  for (const [bx, by] of [[x - 4.4, y - 2.6], [x, y - 4.2], [x + 4.4, y - 2.6]]) s += dot(bx, by, 1.7, P.beanPad);
  return s;
}
function mochiTorso() {
  const d = ell(60, 95, 23, 19);
  let s = shape(d, P.white, P.ink, {
    shade: 'M30 100Q60 112 92 92L92 120L30 120Z', shadeFill: P.whiteShade,
    hi: ell(52, 85, 6, 3.4), hiOp: 0.9,
  });
  // shoulder band (black fur across the top of the chest, joins the arms)
  s += shape('M38 88Q44 77 60 76Q76 77 82 88Q72 83 60 83Q48 83 38 88Z', P.fur, P.ink, { sw: 2.5 });
  // tiny tummy
  s += line('M55 100Q60 103 65 100', P.whiteShade, 2.2);
  return s;
}
function mochiFoot(cx, lift = 0, rot = 0) {
  // bottom of the outline lands on y=116 (fill bottom 114.5) unless lifted
  const cy = 106.5 - lift;
  const d = ell(cx, cy, 11.5, 8);
  let s = `<g transform="rotate(${rot} ${cx} ${cy})">`;
  s += halo(d, 6);
  s += shape(d, P.fur, P.ink, {
    shade: ell(cx + 3, cy + 6, 12, 5), shadeFill: P.furShade,
    hi: ell(cx - 4, cy - 4, 3.6, 1.8), hiFill: P.furHi, hiOp: 1,
  });
  // sole pad peeking at the front
  s += `<path d="${ell(cx, cy + 3.5, 5.4, 2.6)}" fill="${P.pad}"/>`;
  s += `</g>`;
  return s;
}
function mochiEars(earDroop = 0) {
  let s = '';
  for (const [x, y] of [[42.5, 28 + earDroop], [77.5, 28 + earDroop]]) {
    s += halo(circ(x, y, 8.6), 6);
    s += shape(circ(x, y, 8.6), P.fur, P.ink, {
      hi: ell(x - 2.5, y - 3.5, 3.2, 2), hiFill: P.furHi, hiOp: 1,
    });
    s += `<path d="${circ(x + (x < 60 ? 1.5 : -1.5), y + 1.5, 4.6)}" fill="${P.pad}" opacity="0.7"/>`;
  }
  return s;
}
function mochiHeadShape() {
  const { cx, cy, rx, ry } = HEAD;
  // slightly bean-shaped: fuller cheeks
  const d = `M${cx} ${cy - ry}C${cx + 19} ${cy - ry} ${cx + rx} ${cy - 15} ${cx + rx} ${cy + 1}` +
    `C${cx + rx} ${cy + 19} ${cx + 17} ${cy + ry} ${cx} ${cy + ry}` +
    `C${cx - 17} ${cy + ry} ${cx - rx} ${cy + 19} ${cx - rx} ${cy + 1}` +
    `C${cx - rx} ${cy - 15} ${cx - 19} ${cy - ry} ${cx} ${cy - ry}Z`;
  return d;
}
function mochiHead(face, look = 0, extra = '') {
  const d = mochiHeadShape();
  let s = shape(d, P.white, P.ink, {
    sw: 3.2,
    shade: 'M24 58Q46 84 92 54L96 90L24 90Z', shadeFill: P.whiteShade,
    hi: ell(46, 32, 8, 4.2), hiOp: 0.95,
  });
  // eye patches (tear-drops tilted down and out)
  const patch = (x, side) =>
    `<path transform="rotate(${side * -24} ${x} 53)" d="${ell(x, 53, 8.6, 11)}" fill="${P.fur}"/>`;
  s += patch(46.5, -1) + patch(73.5, 1);
  s += faceFeatures(face, look);
  s += extra;
  return s;
}
function eyeOpen(x, y, look, r = 5.2, pr = 3.7) {
  const lx = look * 1.6;
  return dot(x, y, r, P.eyeWhite) + dot(x + lx, y + 0.4, pr, P.pupil) +
    dot(x + lx - 1.3, y - 1.3, 1.45, '#fff') + dot(x + lx + 1.2, y + 1.5, 0.7, '#fff');
}
function faceFeatures(face, look) {
  const eL = [47.5, 51.5], eR = [72.5, 51.5];
  let s = '';
  // blush
  const blushOp = face === 'cheer' ? 0.85 : 0.6;
  s += `<path d="${ell(38.5, 63, 5.4, 3.2)}" fill="${P.blush}" opacity="${blushOp}"/>`;
  s += `<path d="${ell(81.5, 63, 5.4, 3.2)}" fill="${P.blush}" opacity="${blushOp}"/>`;
  // nose
  const nose = `M56.4 59.2Q60 57.6 63.6 59.2Q63.4 62.2 60 63.4Q56.6 62.2 56.4 59.2Z`;
  if (face === 'idle' || face === 'left' || face === 'right') {
    s += eyeOpen(eL[0], eL[1], look) + eyeOpen(eR[0], eR[1], look);
    s += `<path d="${nose}" fill="${P.ink}"/>`;
    s += line('M54.5 65Q57.5 68.4 60 65.4Q62.5 68.4 65.5 65', P.ink, 2.1);
  } else if (face === 'cheer') {
    // eyes closed in a happy arc (white arcs on the dark patches)
    s += line(`M${eL[0] - 4.6} ${eL[1] + 1.8}Q${eL[0]} ${eL[1] - 4.6} ${eL[0] + 4.6} ${eL[1] + 1.8}`, P.eyeWhite, 2.8);
    s += line(`M${eR[0] - 4.6} ${eR[1] + 1.8}Q${eR[0]} ${eR[1] - 4.6} ${eR[0] + 4.6} ${eR[1] + 1.8}`, P.eyeWhite, 2.8);
    s += `<path d="${nose}" fill="${P.ink}"/>`;
    // big open smile with a tongue
    const m = 'M52.5 65.2Q60 66.8 67.5 65.2Q67 74.5 60 75Q53 74.5 52.5 65.2Z';
    s += shape(m, P.mouthIn, P.ink, { sw: 2, inner: `<path d="${ell(60, 74, 5, 3.4)}" fill="${P.tongue}"/>` });
    // sparkle of joy
    s += sparkle(20, 33, 5.5, '#fff6b8', P.goldLine, 1.2) + sparkle(101, 37, 4.2, '#fff6b8', P.goldLine, 1.2);
  } else if (face === 'sleepy') {
    // half-closed: lid line across the top half of the eye
    for (const [x, y] of [eL, eR]) {
      s += `<path d="M${x - 5.2} ${y + 0.6}A5.2 5.2 0 0 0 ${x + 5.2} ${y + 0.6}Z" fill="${P.eyeWhite}"/>`;
      s += `<path d="M${x - 3.6} ${y + 0.6}A3.6 3.6 0 0 0 ${x + 3.6} ${y + 0.6}Z" fill="${P.pupil}"/>`;
      s += dot(x - 1.2, y + 2.2, 0.9, '#fff');
      s += line(`M${x - 5.8} ${y + 0.6}L${x + 5.8} ${y + 0.6}`, P.eyeWhite, 2);
    }
    s += `<path d="${nose}" fill="${P.ink}"/>`;
    // small sleepy "o" yawn
    s += shape(ell(60, 68.6, 2.6, 3), P.mouthIn, P.ink, { sw: 1.8 });
  } else if (face === 'oops') {
    // wide eyes, small pupils, raised brows
    for (const [x, y] of [eL, eR]) {
      s += dot(x, y, 6, P.eyeWhite) + dot(x, y + 0.6, 2.7, P.pupil) + dot(x - 1, y - 0.5, 1, '#fff');
    }
    s += line('M41 37.5Q46 34 51.5 36', P.ink, 2.2) + line('M68.5 36Q74 34 79 37.5', P.ink, 2.2);
    s += `<path d="${nose}" fill="${P.ink}"/>`;
    s += shape(ell(60, 69.4, 3.8, 4.4), P.mouthIn, P.ink, { sw: 2, inner: `<path d="${ell(60, 72.5, 2.6, 1.6)}" fill="${P.tongue}"/>` });
    // sweat drop
    s += shape('M93 34Q97.5 40.5 97.5 43.5Q97.5 47 94 47Q90.5 47 90.5 43.5Q90.5 40.5 93 34Z', '#bfe6ff', '#4a6a9a', {
      sw: 1.6, hi: ell(92.6, 43, 1, 1.8), hiOp: 0.9,
    });
  }
  return s;
}
function sleepyDent() {
  // a pillow dent: flattened crease marks on top of the head + a bed-head tuft
  let s = line('M55 25.5Q60 28.5 65 25.5', P.whiteShade, 2.4);
  s += line('M52 29.5Q55 31 58 29.8', P.whiteShade, 1.8);
  s += shape('M58.5 23.2Q57 15.5 62 14Q60.5 18 63.5 22.6Z', P.white, P.ink, { sw: 2 });
  // a tiny pillow-print star pressed into the cheek
  s += `<path d="${softPoly(starPts(86, 44, 3.6, 1.7), 0.25)}" fill="${P.blush}" opacity="0.75"/>`;
  return s;
}
function mochi(face) {
  PFX = 'm' + face[0];
  _id = 0;
  // pose per frame (body placement is shared)
  const lean = face === 'left' ? -1 : face === 'right' ? 1 : 0;
  const tilt = lean * 6 + (face === 'sleepy' ? 5 : 0) + (face === 'cheer' ? 0 : 0);
  const look = lean;
  // paws stay within ±3 px of the anchors (they nudge with the lean)
  const pawL = [PAW_L[0] + lean * 2, PAW_L[1] + (face === 'cheer' ? -1 : 0)];
  const pawR = [PAW_R[0] + lean * 2, PAW_R[1] + (face === 'cheer' ? -1 : 0)];
  let s = '';
  // feet first (behind the torso)
  const liftL = lean < 0 ? 4 : face === 'cheer' ? 2 : 0;
  const liftR = lean > 0 ? 4 : face === 'cheer' ? 2 : 0;
  const footL = mochiFoot(46 + (lean < 0 ? -1.5 : 0), liftL, lean < 0 ? -12 : face === 'cheer' ? -6 : 0);
  const footR = mochiFoot(74 + (lean > 0 ? 1.5 : 0), liftR, lean > 0 ? 12 : face === 'cheer' ? 6 : 0);
  s += footL + footR;
  // arms (behind the head)
  s += mochiArm(-1, pawL) + mochiArm(1, pawR);
  s += mochiTorso();
  // head group (tilts around the neck)
  let head = mochiEars(face === 'sleepy' ? 1.5 : 0);
  head += mochiHead(face, look, face === 'sleepy' ? sleepyDent() : '');
  s += tilt ? `<g transform="rotate(${tilt} ${NECK[0]} ${NECK[1]})">${head}</g>` : head;
  // motion swish for left/right frames (behind = trailing side)
  if (lean) {
    const x0 = lean < 0 ? 98 : 22;
    s += line(`M${x0} 88L${x0 + lean * -9} 88M${x0 + lean * 2} 97L${x0 + lean * -6} 97`, P.ink, 2, ' opacity="0.35"');
  }
  s += mochiPaw(pawL) + mochiPaw(pawR);
  return svg(120, 120, s);
}

// ================================================================= CAP
// viewBox 0 0 240 72. Bounce line = top surface y=12 (x≈36..204 is within 2 px of it);
// rounded ends at x=6 and x=234. The visible cap stops at y≈58 so that, drawn with its
// bounce line at world y=1.35 above Mochi (feet y=0), it covers only his ears and paws.
// Handles: short cream stems at x=68 and x=172, y 44–58 (see deviation note).
function cap() {
  PFX = 'c'; _id = 0;
  let s = '';
  // handles / little stems (behind the cap)
  for (const x of [68, 172]) {
    const d = `M${x - 7.5} 40L${x + 7.5} 40L${x + 7} 54Q${x + 6.6} 58 ${x} 58Q${x - 6.6} 58 ${x - 7} 54Z`;
    s += shape(d, P.stem, P.stemLine, {
      sw: 2.8,
      shade: `M${x + 2} 36L${x + 12} 36L${x + 12} 62L${x + 2} 62Z`, shadeFill: P.stemShade,
      hi: `M${x - 4.8} 47L${x - 2.6} 47L${x - 2.8} 54L${x - 4.8} 54Z`, hiOp: 0.8,
    });
  }
  // underside (cream with gills), peeking below the rim
  const under = 'M16 36Q120 54 224 36L213 46Q120 61 27 46Z';
  let gills = '';
  for (let i = 0; i <= 22; i++) {
    const x = 20 + i * 9.1;
    const t = Math.sin((Math.PI * (x - 16)) / 208);
    gills += line(`M${f(x)} ${f(38 + 9 * t)}L${f(120 + (x - 120) * 0.86)} ${f(46 + 9 * t)}`, P.gill, 1.5);
  }
  s += shape(under, P.under, P.capLine, { sw: 2.8, inner: gills });
  // the dome: flat-ish top at y=12, rolled rim, rounded ends at x=6 / x=234
  const dome = 'M6 31C4 21 14 16 36 14C64 12.3 92 12 120 12C148 12 176 12.3 204 14C226 16 236 21 234 31' +
    'C234 37 228 39.4 220 39C186 44.4 154 46 120 46C86 46 54 44.4 20 39C12 39.4 6 37 6 31Z';
  // spots (cream), squashed toward the edges like they wrap round the dome
  const spots = [
    [120, 22, 12, 6], [80, 21, 9, 5], [160, 21, 9, 5], [46, 25, 7.4, 4.6], [194, 25, 7.4, 4.6],
    [100, 35, 6.4, 3.6], [140, 35, 6.4, 3.6], [21, 31, 4.6, 3.6], [219, 31, 4.6, 3.6], [64, 35, 5, 3.2], [176, 35, 5, 3.2],
  ];
  let inner = '';
  for (const [x, y, rx, ry] of spots) {
    inner += `<path d="${ell(x, y, rx, ry)}" fill="${P.spot}"/>` +
      `<path d="M${f(x - rx)} ${f(y + ry * 0.15)}A${rx} ${ry} 0 0 0 ${f(x + rx)} ${f(y + ry * 0.15)}Q${x} ${f(y + ry * 0.55)} ${f(x - rx)} ${f(y + ry * 0.15)}Z" fill="${P.spotShade}"/>`;
  }
  s += shape(dome, P.cap, P.capLine, {
    sw: 3.4,
    shade: 'M0 31Q60 40 120 40Q180 40 240 31L240 60L0 60Z', shadeFill: P.capShade,
    inner,
    hi: 'M30 19Q46 14.6 74 14.4Q60 17.8 34 22.6Q27 23 30 19Z', hiFill: P.capHi, hiOp: 0.95,
  });
  // the springy rim edge
  s += line('M16 36.4C50 42 86 43.6 120 43.6C154 43.6 190 42 224 36.4', P.capLine, 1.5, ' opacity="0.4"');
  s += dot(83, 15.4, 1.6, '#fff', ' opacity="0.9"');
  return svg(240, 72, s);
}

// ================================================================= BALL
// viewBox 0 0 64 64, centre (32,32), solid core r=23, soft glow ring to r≈31.
function ball() {
  const defs =
    `<radialGradient id="bg" cx="32" cy="32" r="32" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0.68" stop-color="${P.glow}" stop-opacity="0.75"/>` +
    `<stop offset="0.82" stop-color="${P.glow}" stop-opacity="0.35"/>` +
    `<stop offset="1" stop-color="${P.glow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="bc" cx="27" cy="26" r="26" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${P.core}"/>` +
    `<stop offset="1" stop-color="${P.coreEdge}"/></radialGradient>`;
  let s = `<circle cx="32" cy="32" r="32" fill="url(#bg)"/>`;
  s += `<circle cx="32" cy="32" r="23" fill="url(#bc)"/>`;
  // one-step shade on the lower right
  s += `<path d="M50.6 18.4A23 23 0 0 1 18.4 50.6Q42 46 50.6 18.4Z" fill="#ffd66e" opacity="0.6"/>`;
  s += `<circle cx="32" cy="32" r="23" fill="none" stroke="${P.ballLine}" stroke-width="2.4"/>`;
  // highlight + sparkle
  s += `<path d="${ell(24, 22, 6.5, 4)}" fill="#fff" transform="rotate(-30 24 22)"/>`;
  s += sparkle(40.5, 38.5, 6, '#fff', null) + dot(16, 33, 1.5, '#fff');
  return svg(64, 64, s, defs);
}

// ================================================================= STAR (falling item)
// viewBox 0 0 64 64, centre (32,33)
function star() {
  PFX = 's'; _id = 0;
  const d = softPoly(starPts(32, 33.5, 29, 14.5), 0.22);
  let s = `<path d="${d}" fill="none" stroke="#fff6c8" stroke-width="7" stroke-linejoin="round" opacity="0.7"/>`;
  s += shape(d, P.gold, P.goldLine, {
    sw: 3,
    shade: 'M64 24L34 46L10 64L64 64Z', shadeFill: P.goldShade,
    hi: 'M24 18Q30 6 33 6Q30 14 27 22Z', hiFill: P.goldHi, hiOp: 1,
  });
  s += dot(26, 33, 2.8, P.ink) + dot(38, 33, 2.8, P.ink) + dot(25.1, 32, 0.95, '#fff') + dot(37.1, 32, 0.95, '#fff');
  s += line('M29.4 38Q32 40.4 34.6 38', P.ink, 1.8);
  s += `<path d="${ell(21.5, 38.5, 3.2, 2)}" fill="${P.blush}" opacity="0.8"/><path d="${ell(42.5, 38.5, 3.2, 2)}" fill="${P.blush}" opacity="0.8"/>`;
  return svg(64, 64, s);
}

// ================================================================= HOOT (owl boss)
// viewBox 0 0 120 100, centre (60,50). Sits on a small cloud. Night cap on.
function cloudBase() {
  const d = 'M22 84Q14 84 14 77Q14 70 22 69Q24 61 33 62Q38 55 47 59Q54 53 63 57Q71 52 79 58Q88 56 91 63Q100 62 102 70Q108 72 106 78Q105 85 97 85Q92 91 82 88Q74 93 64 89Q55 93 46 89Q36 92 30 87Q24 89 22 84Z';
  return shape(d, P.cloud, P.cloudLine, {
    sw: 3,
    shade: 'M0 80Q30 86 60 84Q90 86 120 78L120 100L0 100Z', shadeFill: P.cloudShade,
    hi: ell(36, 67, 6, 2.4), hiOp: 1,
  });
}
function owlWing(side, mode) {
  // side -1 = left, +1 = right. mode: 'down' | 'up' | 'forward' | 'ruffle'
  const sx = 60 + side * 24; // shoulder
  let d;
  if (mode === 'down') {
    d = `M${sx} 40Q${sx + side * 13} 48 ${sx + side * 10} 66Q${sx + side * 6} 74 ${sx - side * 1} 70Q${sx - side * 5} 56 ${sx} 40Z`;
  } else if (mode === 'up') {
    d = `M${sx} 46Q${sx + side * 10} 34 ${sx + side * 22} 26Q${sx + side * 28} 24 ${sx + side * 25} 31Q${sx + side * 22} 44 ${sx + side * 4} 58Q${sx - side * 2} 54 ${sx} 46Z`;
  } else if (mode === 'forward') {
    d = `M${sx} 44Q${sx + side * 8} 46 ${sx - side * 2} 58Q${sx - side * 10} 66 ${sx - side * 18} 66Q${sx - side * 23} 64 ${sx - side * 19} 60Q${sx - side * 12} 56 ${sx - side * 6} 50Q${sx - side * 4} 44 ${sx} 44Z`;
  } else { // ruffle: wings out and up, clutching the tummy laughing
    d = `M${sx} 42Q${sx + side * 14} 42 ${sx + side * 16} 54Q${sx + side * 15} 62 ${sx + side * 8} 62L${sx + side * 11} 57L${sx + side * 4} 60L${sx + side * 6} 54Q${sx} 52 ${sx} 42Z`;
  }
  return shape(d, P.owl, P.ink, {
    sw: 3,
    shade: `M${sx - 40} 56L${sx + 40} 56L${sx + 40} 80L${sx - 40} 80Z`, shadeFill: P.owlShade,
  }) + line(mode === 'up' ? `M${sx + side * 8} 44Q${sx + side * 14} 38 ${sx + side * 20} 33` :
    mode === 'down' ? `M${sx + side * 4} 50Q${sx + side * 7} 58 ${sx + side * 5} 64` : '', P.owlShade, 1.8);
}
function owl(mode) {
  PFX = 'o' + mode; _id = 0;
  let s = cloudBase();
  // back wing for the forward pose sits behind the body (both wings in front for others)
  const body = 'M60 17C80 17 88 32 88 50C88 66 78 76 60 76C42 76 32 66 32 50C32 32 40 17 60 17Z';
  // ear tufts
  const tufts = 'M36 30Q32 16 38 12Q42 20 48 22Z M84 30Q88 16 82 12Q78 20 72 22Z';
  s += shape(tufts, P.owl, P.ink, { sw: 3, shade: 'M30 20L90 20L90 34L30 34Z', shadeFill: P.owlShade });
  if (mode === 'giggle') {
    // ruffled feathers sticking out of the body outline
    s += shape('M31 48L24 44L31 54Z M89 48L96 44L89 54Z M44 20L41 13L50 18Z M76 20L79 13L70 18Z', P.owl, P.ink, { sw: 2.4 });
  }
  s += shape(body, P.owl, P.ink, {
    sw: 3.2,
    shade: 'M20 56Q60 80 100 50L100 90L20 90Z', shadeFill: P.owlShade,
    hi: ell(46, 26, 7, 3.4), hiOp: 0.6,
  });
  // belly with little feather scallops
  let scal = '';
  for (const [x, y] of [[52, 56], [60, 56], [68, 56], [56, 63], [64, 63], [60, 69]])
    scal += line(`M${x - 3} ${y}Q${x} ${y + 3} ${x + 3} ${y}`, P.owlBellyShade, 1.8);
  s += shape(ell(60, 60, 15.5, 14), P.owlBelly, P.ink, { sw: 0, inner: scal });
  // feet tucked on the cloud
  s += shape('M50 75Q48 80 52 80Q53 77 55 80Q57 80 56 75Z M64 75Q63 80 65 80Q67 77 68 80Q72 80 70 75Z', P.owlFoot, P.beakShade, { sw: 1.8 });
  // face disc: two joined rings
  const disc = 'M60 30C64 25 76 24 80 34C83 42 78 50 70 50C65 50 62 48 60 46C58 48 55 50 50 50C42 50 37 42 40 34C44 24 56 25 60 30Z';
  s += shape(disc, P.face, P.ink, { sw: 2.2 });
  // eyes
  const eL = [50, 38.5], eR = [70, 38.5];
  if (mode.startsWith('float')) {
    // sleepy: heavy lids half shut
    for (const [x, y] of [eL, eR]) {
      s += `<path d="M${x - 6} ${y}A6 6 0 0 0 ${x + 6} ${y}Z" fill="#fff"/>`;
      s += `<path d="M${x - 3.6} ${y + 0.2}A3.8 3.8 0 0 0 ${x + 3.6} ${y + 0.2}Z" fill="${P.pupil}"/>`;
      s += dot(x - 1.2, y + 2.2, 1, '#fff');
      s += shape(`M${x - 7} ${y + 0.4}Q${x} ${y - 6} ${x + 7} ${y + 0.4}Q${x} ${y - 1} ${x - 7} ${y + 0.4}Z`, P.owl, P.ink, { sw: 2 });
    }
  } else if (mode === 'throw') {
    // wide awake, cheeky glint
    for (const [x, y] of [eL, eR]) {
      s += dot(x, y, 6.4, '#fff') + dot(x + 1, y + 0.6, 4, P.pupil) + dot(x - 0.4, y - 1, 1.6, '#fff');
      s += line(`M${x - 6} ${y - 7.8}Q${x} ${y - 6} ${x + 6} ${y - 9}`, P.ink, 2);
    }
  } else {
    // giggle: squeezed shut  > <
    s += line(`M${eL[0] - 5} ${eL[1] - 4}L${eL[0] + 3} ${eL[1]}L${eL[0] - 5} ${eL[1] + 4}`, P.ink, 2.6);
    s += line(`M${eR[0] + 5} ${eR[1] - 4}L${eR[0] - 3} ${eR[1]}L${eR[0] + 5} ${eR[1] + 4}`, P.ink, 2.6);
    // happy tear
    s += shape('M84 42Q87 46 87 48Q87 50.6 84.5 50.6Q82 50.6 82 48Q82 46 84 42Z', '#bfe6ff', '#4a6a9a', { sw: 1.4 });
  }
  // blush
  s += `<path d="${ell(42, 47, 4, 2.2)}" fill="${P.blush}" opacity="0.7"/><path d="${ell(78, 47, 4, 2.2)}" fill="${P.blush}" opacity="0.7"/>`;
  // beak
  if (mode === 'giggle') {
    s += shape('M55 43Q60 41 65 43L60 48Z', P.beak, P.ink, { sw: 1.8 });
    s += shape('M56 48.6Q60 47.6 64 48.6Q62 54 60 54Q58 54 56 48.6Z', P.mouthIn, P.ink, { sw: 1.6 });
  } else {
    s += shape('M55.5 43Q60 41 64.5 43Q63 48 60 50Q57 48 55.5 43Z', P.beak, P.ink, { sw: 1.8, shade: 'M60 40L66 40L66 52L60 52Z', shadeFill: P.beakShade });
  }
  // wings
  const wm = mode === 'float0' ? 'down' : mode === 'float1' ? 'up' : mode === 'throw' ? 'forward' : mode === 'giggle' ? 'ruffle' : 'down';
  if (mode === 'throw') {
    // right wing flung up and forward (the pillow just left it), left wing down; motion arcs
    s += owlWing(-1, 'down') + owlWing(1, 'up');
    s += line('M96 18Q104 26 104 36M102 12Q112 22 111 34', P.ink, 2, ' opacity="0.4"');
  } else s += owlWing(-1, wm) + owlWing(1, wm);
  // night cap (droops over to the right, pom-pom at the end)
  const nc = 'M40 26Q44 10 62 9Q80 9 88 20Q94 28 96 36Q90 30 84 27Q82 26 80 26Q60 18 40 26Z';
  let stripes = line('M46 18Q56 12 66 13', P.nightStripe, 3) + line('M72 13Q82 16 88 24', P.nightStripe, 3);
  s += shape(nc, P.night, P.ink, { sw: 2.8, shade: 'M30 22Q62 14 100 30L100 40L30 40Z', shadeFill: P.nightShade, inner: stripes });
  s += shape('M38 27Q60 17 82 27Q83 31 80 31Q60 23 41 31Q37 31 38 27Z', P.pom, P.ink, { sw: 2.2 });
  s += shape(circ(96, 37, 5.2), P.pom, P.ink, { sw: 2.2, shade: ell(98, 41, 5, 3), shadeFill: '#e7dcf0' });
  return svg(120, 100, s);
}
// owl_0 / owl_1 share everything but the wings
const owlWithWings = (frame) => owl(frame === 0 ? 'float0' : 'float1');

// ================================================================= PILLOW
// viewBox 0 0 64 48, centre (32,24)
function pillow() {
  PFX = 'p'; _id = 0;
  const d = 'M6 8Q12 4 32 6Q52 4 58 8Q61 24 58 40Q52 44 32 42Q12 44 6 40Q3 24 6 8Z';
  let stars = '';
  for (const [x, y, r] of [[18, 16, 4], [44, 15, 3.4], [32, 27, 4.4], [17, 33, 3], [47, 33, 3.8]])
    stars += `<path d="${softPoly(starPts(x, y, r, r * 0.48), 0.25)}" fill="${P.pilStar}" stroke="${P.pilStarLine}" stroke-width="1"/>`;
  let s = shape(d, P.pil, P.pilLine, {
    sw: 3,
    shade: 'M0 36Q32 44 64 30L64 48L0 48Z', shadeFill: P.pilShade,
    inner: stars,
    hi: 'M10 10Q20 7.6 28 8.4Q18 11 11 15Z', hiOp: 0.85,
  });
  // corner tufts and a seam
  s += line('M8 10L4 6M56 10L60 6M8 38L4 42M56 38L60 42', P.pilLine, 2.4);
  s += line('M10 24Q32 21 54 24', P.pilShade, 1.4, ' stroke-dasharray="2 3"');
  return svg(64, 48, s);
}

// ================================================================= HEARTS
function heart(full) {
  PFX = full ? 'h' : 'e'; _id = 0;
  const d = heartPath(24, 25, 19);
  if (full) {
    return svg(48, 48, shape(d, P.heart, P.heartLine, {
      sw: 3,
      shade: 'M48 14Q40 38 14 48L48 48Z', shadeFill: P.heartShade,
      hi: ell(15, 15, 4.6, 3), hiOp: 0.85,
    }));
  }
  let s = `<path d="${d}" fill="#ffffff" fill-opacity="0.35"/>`;
  s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linejoin="round" opacity="0.55"/>`;
  s += `<path d="${d}" fill="none" stroke="${P.heartLine}" stroke-width="3" stroke-linejoin="round" stroke-dasharray="0"/>`;
  s += `<path d="${heartPath(24, 25.6, 13.6)}" fill="none" stroke="${P.heart}" stroke-width="1.6" stroke-linejoin="round" opacity="0.55"/>`;
  return svg(48, 48, s);
}

// ================================================================= PARTICLES
function zzz() {
  PFX = 'z'; _id = 0;
  // a chunky "Z" outline drawn as a polygon
  const d = softPoly([[6, 5], [26, 5], [26, 10], [14, 23], [26, 23], [26, 28], [6, 28], [6, 23], [18, 10], [6, 10]], 0.12);
  return svg(32, 32, shape(d, P.zzz, P.ink, {
    sw: 2.6, shade: 'M0 22L32 22L32 32L0 32Z', shadeFill: P.zzzShade,
    hi: 'M8 6.4L20 6.4L20 8L8 8Z', hiOp: 0.9,
  }));
}
function feather() {
  PFX = 'f'; _id = 0;
  const d = 'M7 27Q6 15 15 8Q22 3 28 3Q28 10 23 17Q17 25 7 27Z';
  let s = shape(d, P.feather, P.featherLine, {
    sw: 2, shade: 'M7 27Q20 18 30 2L32 32L0 32Z', shadeFill: P.featherShade,
  });
  s += line('M4 30Q14 18 26 6', P.featherLine, 1.5);
  s += line('M13 21L10 17M17 16L14 12M21 12L19 8M16 22L20 21M20 17L24 16', P.featherShade, 1.2);
  return svg(32, 32, s);
}

// ================================================================= ICON
// viewBox 0 0 256 256: round badge, Mochi's face + the cap + the ball on a purple/pink forest glow.
function icon() {
  PFX = 'i'; _id = 0;
  const defs =
    `<radialGradient id="ig" cx="128" cy="104" r="140" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ffe9f6"/><stop offset="0.45" stop-color="#e7a6dc"/><stop offset="1" stop-color="#6c4bb0"/></radialGradient>` +
    `<radialGradient id="ib" cx="128" cy="52" r="34" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0.6" stop-color="${P.glow}" stop-opacity="0.8"/><stop offset="1" stop-color="${P.glow}" stop-opacity="0"/></radialGradient>`;
  let s = `<circle cx="128" cy="128" r="124" fill="url(#ig)"/>`;
  const clip = nid();
  s += `<clipPath id="${clip}"><circle cx="128" cy="128" r="122"/></clipPath><g clip-path="url(#${clip})">`;
  // soft forest silhouettes
  s += `<path d="M0 200Q20 150 40 196Q56 140 78 190Q96 150 112 200L144 200Q160 150 178 190Q200 140 216 196Q236 150 256 200L256 256L0 256Z" fill="#8a64c4" opacity="0.55"/>`;
  s += `<path d="M0 226Q64 206 128 220Q192 206 256 226L256 256L0 256Z" fill="#5b3f9a" opacity="0.8"/>`;
  // fireflies
  for (const [x, y, r] of [[44, 92, 3], [212, 84, 3.4], [60, 150, 2.4], [200, 150, 2.6], [90, 40, 2.2], [176, 36, 2.2]])
    s += dot(x, y, r * 2.2, '#fff4c2', ' opacity="0.35"') + dot(x, y, r, '#fffbe6');
  s += `</g>`;
  s += `<circle cx="128" cy="128" r="122" fill="none" stroke="#fff" stroke-width="5" opacity="0.7"/>`;
  s += `<circle cx="128" cy="128" r="125" fill="none" stroke="#4a2f7e" stroke-width="3"/>`;
  // ball (top)
  s += `<circle cx="128" cy="52" r="34" fill="url(#ib)"/>`;
  s += `<circle cx="128" cy="52" r="22" fill="${P.core}" stroke="${P.ballLine}" stroke-width="3.5"/>`;
  s += `<path d="${ell(120, 44, 7, 4.4)}" fill="#fff" transform="rotate(-30 120 44)"/>`;
  // Mochi's face (ears + head), big
  PFX = 'iz'; _id = 0;
  const face = mochiEars() + mochiHead('idle', 0);
  s += `<g transform="translate(128 162) scale(2.0) translate(-60 -52)">${face}</g>`;
  // cap (scaled copy of the paddle shape) resting on his head
  const capSvg = cap().replace(/<svg[^>]*>\n?/, '').replace(/<\/svg>\n?/, '').replace(/id="c(\d+)"/g, 'id="ic$1"').replace(/url\(#c(\d+)\)/g, 'url(#ic$1)');
  s += `<g transform="translate(38 72) scale(0.75)">${capSvg}</g>`;
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
for (const fr of ['idle', 'left', 'right', 'cheer', 'sleepy', 'oops']) write(`mochi_${fr}.svg`, mochi(fr));
write('cap.svg', cap());
write('ball.svg', ball());
write('star.svg', star());
write('owl_0.svg', owlWithWings(0));
write('owl_1.svg', owlWithWings(1));
write('owl_throw.svg', owl('throw'));
write('owl_giggle.svg', owl('giggle'));
write('pillow.svg', pillow());
write('heart.svg', heart(true));
write('heart_empty.svg', heart(false));
write('icon.svg', icon());
write('particles/zzz.svg', zzz());
write('particles/feather.svg', feather());
