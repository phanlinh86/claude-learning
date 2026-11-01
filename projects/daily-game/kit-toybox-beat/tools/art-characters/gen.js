#!/usr/bin/env node
// Character & item art generator for Kit's Toybox Beat.
// 100% original hand-written SVG, built from shared parts so every frame of a
// character has identical body geometry (only face / paws / tail change).
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Kit
  fur: '#ffd7a3', furShade: '#f3b878', stripe: '#e88a3e', furLine: '#8f4c1e',
  cream: '#fff4de', creamShade: '#f6dcb6',
  eye: '#3a2846', nose: '#f2768d', blush: '#ff98aa', innerEar: '#ffb3bf',
  scarf: '#38b5c4', scarfShade: '#2a909e', scarfLine: '#1c6470',
  rocket: '#e8443a', rocketShade: '#c23029', rocketLine: '#7a1c18',
  white: '#fff7ef', whiteShade: '#e6d9cf', glass: '#8fd6ff', glassShade: '#5fb6e8',
  metal: '#a3a6bf', metalShade: '#7f829c', metalLine: '#4b4d66',
  // flame
  flCore: '#fffbd6', flMid: '#ffd23c', flEdge: '#ff8f2b', flLine: '#cf5a1a',
  // coin
  coin: '#ffd84a', coinRim: '#f2a81c', coinShade: '#e39612', coinStar: '#f5b326', coinLine: '#7d4f00',
  // super coin
  gFace: '#ffc4d4', gFaceShade: '#ffa3bd', gHeart: '#ff4f86', gHeartShade: '#e23570', gLine: '#7d2f55',
  // pillow
  pil: '#d8ecff', pilStripe: '#c7b5f5', pilShade: '#b4cdee', pilLine: '#5f5d9e',
  // Baron Fluff
  bear: '#c98a4b', bearShade: '#a86b34', bearLine: '#663a17', muzzle: '#f3d3a6', bearNose: '#5a3320',
  patch: '#9fd8b8', patchLine: '#4e8f6c',
  hat: '#fbf7f0', hatShade: '#e3dbcf', hatBand: '#34427c', hatLine: '#222b55',
  balA: '#a8e6cf', balB: '#d6bdf2', balC: '#ffc6d8', balLine: '#6c5a90', balShade: 'rgba(80,60,140,0.16)',
  balPatch: '#fff0b0',
  wicker: '#dda66b', wickerShade: '#bb7f44', wickerLine: '#6c431e', rope: '#8b6a48',
  feather: '#ffffff', featherLine: '#a7a2c4',
  // ring
  wood: '#f1bb6c', woodShade: '#d99a48', woodLine: '#86531f', jingle: '#e3e7f2', jingleLine: '#5f6680',
  // UI
  toy: '#4a8fe8', toyShade: '#3673c9', toyLine: '#1f4d94', toyLight: '#78b0f5',
  star: '#ffe066', starLine: '#c48a12',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +n.toFixed(2);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
// filled shape with cel shade (clipped), optional highlight, then outline on top
let _id = 0;
function shape(d, fill, line, opt = {}) {
  const sw = opt.sw ?? 3;
  let s = '';
  if (opt.shade || opt.hi || opt.inner) {
    const id = `${opt.pfx || 'c'}${++_id}`;
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    s += `<path d="${d}" fill="${fill}"/>`;
    s += `<g clip-path="url(#${id})">`;
    if (opt.shade) s += `<path d="${opt.shade}" fill="${opt.shadeFill}"/>`;
    if (opt.inner) s += opt.inner;
    if (opt.hi) s += `<path d="${opt.hi}" fill="#fff" opacity="${opt.hiOp ?? 0.6}"/>`;
    s += `</g>`;
    s += `<path d="${d}" fill="none" stroke="${line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else {
    s += `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }
  return s;
}
// thick rounded limb with outline (stroke trick)
function limb(d, w, fill, line, sw = 3) {
  return `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w + sw * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
function starPath(cx, cy, ro, ri, n = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    d += (i ? 'L' : 'M') + f(cx + r * Math.cos(a)) + ' ' + f(cy + r * Math.sin(a));
  }
  return d + 'Z';
}
// rounded star: quadratic corners
function softStar(cx, cy, ro, ri, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const a = mid(p, prev, 0.18), b = mid(p, next, 0.18);
    d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(b[0]) + ' ' + f(b[1]);
  }
  return d + 'Z';
}
function sparkle(cx, cy, r, fill = '#fff', stroke = null, sw = 1.5) {
  const k = r * 0.22;
  const d = `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
}
function annulusSeg(cx, cy, r1, r2, a0, a1) {
  const p = (r, a) => [f(cx + r * Math.cos((a * Math.PI) / 180)), f(cy + r * Math.sin((a * Math.PI) / 180))];
  const [x1, y1] = p(r2, a0), [x2, y2] = p(r2, a1), [x3, y3] = p(r1, a1), [x4, y4] = p(r1, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}

// ================================================================= KIT
// Anchors: body centre (58,62); nozzle bottom (30,96); reach paw centre (103,62).
const KIT = {
  head: { cx: 68, cy: 44, rx: 24, ry: 21 },
  body: { cx: 56, cy: 76, rx: 19, ry: 16 },
};

function kitTail(frame) {
  const d = {
    idle: 'M40 80C22 86 6 76 8 60C9 52 15 49 19 52',
    reach: 'M40 80C28 84 16 82 9 75C6 71 7 67 11 67',
    happy: 'M40 78C20 80 4 62 10 44C12 38 18 36 21 40',
    dizzy: 'M40 82C26 88 14 90 9 97C7 100 8 104 12 103',
  }[frame];
  // tip stripe: overlay the last segment with the ginger stripe colour
  return limb(d, 8, P.fur, P.furLine) + kitTailTip(frame);
}
function kitTailTip(frame) {
  const t = {
    idle: 'M9 56C10 52 15 49 19 52',
    reach: 'M8 71C7 68 9 67 11 67',
    happy: 'M11 41C13 37 18 36 21 40',
    dizzy: 'M8 99C7 102 9 104 12 103',
  }[frame];
  return line(t, P.stripe, 8);
}

function kitRocket() {
  const body = 'M30 22C38 26 42 37 42 50L42 82Q42 88 36 88L24 88Q18 88 18 82L18 50C18 37 22 26 30 22Z';
  let s = '';
  // fin (back, left) drawn behind capsule
  s += shape('M20 64L9 80Q6 88 13 89L20 87Z', P.rocket, P.rocketLine, { shade: 'M0 82L30 82L30 100L0 100Z', shadeFill: P.rocketShade, pfx: 'kf' });
  s += shape(body, P.rocket, P.rocketLine, {
    pfx: 'kr',
    shade: 'M0 0L24 0L24 120L0 120Z', shadeFill: P.rocketShade,
    inner:
      // white nose cap
      `<path d="M0 0L60 0L60 40Q30 46 0 40Z" fill="${P.white}"/>` +
      `<path d="M0 0L24 0L24 42L0 40Z" fill="${P.whiteShade}"/>` +
      `<path d="M0 40Q30 46 60 40" fill="none" stroke="${P.rocketLine}" stroke-width="2"/>` +
      // white band
      `<path d="M0 70L60 70L60 77L0 77Z" fill="${P.white}"/>` +
      `<path d="M0 70L24 70L24 77L0 77Z" fill="${P.whiteShade}"/>` +
      `<path d="M0 70L60 70M0 77L60 77" stroke="${P.rocketLine}" stroke-width="1.6"/>`,
    hi: 'M34 30Q39 38 39 48L36 48Q36 38 32 31Z', hiOp: 0.7,
  });
  // porthole
  s += `<path d="${circ(30, 52, 6)}" fill="${P.white}" stroke="${P.rocketLine}" stroke-width="2.4"/>`;
  s += `<path d="${circ(30, 52, 3.8)}" fill="${P.glass}"/>`;
  s += `<path d="M26.2 53A3.8 3.8 0 0 0 32.8 55A4.8 4.8 0 0 1 26.2 53Z" fill="${P.glassShade}"/>`;
  s += `<path d="${circ(31.5, 50.5, 1.2)}" fill="#fff"/>`;
  // nozzle (bottom centre exactly (30,96))
  s += shape('M24.5 88L35.5 88L37.5 96L22.5 96Z', P.metal, P.metalLine, { sw: 2.6, pfx: 'kn', shade: 'M0 92L60 92L60 100L0 100Z', shadeFill: P.metalShade });
  return s;
}

function kitEars(frame) {
  // far ear (left/back) and near ear (right/front); dizzy tilts them
  const farRot = frame === 'dizzy' ? -22 : frame === 'happy' ? -6 : 0;
  const nearRot = frame === 'dizzy' ? 18 : frame === 'happy' ? 6 : 0;
  const far = 'M48 34L47 12Q48 8 52 10L66 25Z';
  const farIn = 'M51 28L50.5 15.5L60 25Z';
  const near = 'M70 24L84 8Q88 6 89 10L90 32Z';
  const nearIn = 'M74 24L85 13L86 28Z';
  return `<g transform="rotate(${farRot} 56 30)">` + shape(far, P.fur, P.furLine, { pfx: 'ke', shade: 'M40 0L52 0L52 40L40 40Z', shadeFill: P.furShade }) +
    `<path d="${farIn}" fill="${P.innerEar}"/></g>` +
    `<g transform="rotate(${nearRot} 80 28)">` + shape(near, P.fur, P.furLine) + `<path d="${nearIn}" fill="${P.innerEar}"/></g>`;
}

function kitHead() {
  const { cx, cy, rx, ry } = KIT.head;
  // head with fluffy cheek tuft at lower-left
  const d = `M${cx - rx} ${cy}C${cx - rx} ${cy - ry * 0.62} ${cx - rx * 0.55} ${cy - ry} ${cx} ${cy - ry}C${cx + rx * 0.6} ${cy - ry} ${cx + rx} ${cy - ry * 0.55} ${cx + rx} ${cy + 1}` +
    `C${cx + rx} ${cy + ry * 0.7} ${cx + rx * 0.5} ${cy + ry} ${cx + 2} ${cy + ry}` +
    `C${cx - 8} ${cy + ry} ${cx - 14} ${cy + ry - 1} ${cx - 17} ${cy + ry - 4}L${cx - 22} ${cy + ry - 2}L${cx - 20} ${cy + ry - 7}L${cx - 25} ${cy + ry - 9}L${cx - 22.5} ${cy + ry - 12}C${cx - rx} ${cy + 4} ${cx - rx} ${cy + 2} ${cx - rx} ${cy}Z`;
  const shade = `M${cx - rx - 6} ${cy - 8}C${cx - rx + 1} ${cy + 10} ${cx - 8} ${cy + 18} ${cx + 16} ${cy + 20}L${cx + 16} ${cy + ry + 6}L${cx - rx - 6} ${cy + ry + 6}Z`;
  const stripes = line('M62 24L63 31M68 23.5L68 31M74 24L73 30.5', P.stripe, 3) +
    line('M46 40L52 41M45.5 46L51 46', P.stripe, 2.6);
  return shape(d, P.fur, P.furLine, {
    pfx: 'kh', shade, shadeFill: P.furShade, inner: stripes,
    hi: ell(78, 30, 7, 3.6), hiOp: 0.55,
  }) +
    // muzzle
    `<path d="${ell(78, 53, 11, 7)}" fill="${P.cream}"/>`;
}

function kitBody() {
  const { cx, cy, rx, ry } = KIT.body;
  const d = ell(cx, cy, rx, ry);
  return shape(d, P.fur, P.furLine, {
    pfx: 'kb',
    shade: `M30 72Q50 88 80 80L80 100L30 100Z`, shadeFill: P.furShade,
    inner: `<path d="${ell(64, 80, 9, 10)}" fill="${P.cream}"/>` + line('M42 66L47 70M39 74L45 76', P.stripe, 3),
  });
}

function kitLegs(which) {
  if (which === 'far') {
    return limb('M49 86L47 99', 8, P.furShade, P.furLine) + shape(ell(46.5, 101.5, 5.6, 4.2), P.furShade, P.furLine, { sw: 2.6 });
  }
  return limb('M61 87L62 100', 9, P.fur, P.furLine) + shape(ell(62.5, 102.5, 6.4, 4.6), P.cream, P.furLine, { sw: 2.6 }) +
    line('M60.5 104L60.5 106M64.5 104L64.5 106', P.furLine, 1.4);
}

function kitStrap() {
  return limb('M41 61Q52 64 56 91', 3.4, P.rocketShade, P.rocketLine, 1.6) +
    `<rect x="47.5" y="69" width="6" height="5" rx="1.4" fill="${P.metal}" stroke="${P.metalLine}" stroke-width="1.4" transform="rotate(25 50.5 71.5)"/>`;
}

function kitScarf() {
  const tail = 'M50 64C42 61 35 64 25 61L24 65.5L20 67L24 69L23 73.5C32 74 42 71 52 70.5Z';
  const band = 'M48 60Q66 70 84 59L86 66Q66 79 47 68Z';
  return shape(tail, P.scarf, P.scarfLine, { pfx: 'ks', shade: 'M0 66L60 64L60 80L0 80Z', shadeFill: P.scarfShade, sw: 2.6 }).replace('M0 66L60 64','M0 72L60 70') +
    shape(band, P.scarf, P.scarfLine, { pfx: 'ks', shade: 'M40 68Q66 80 90 64L90 90L40 90Z', shadeFill: P.scarfShade, sw: 2.6 }) +
    line('M60 66.5L59.5 72.5M70 66.5L70.5 72', P.scarfShade, 1.6) +
    `<path d="${circ(51, 66, 4.2)}" fill="${P.scarf}" stroke="${P.scarfLine}" stroke-width="2.4"/>`;
}

function kitEyes(frame) {
  const near = { x: 66, y: 43 }, far = { x: 82, y: 42 };
  const eyeShape = (x, y, rx, ry) =>
    `<path d="${ell(x, y, rx, ry)}" fill="${P.eye}"/>` +
    `<path d="${circ(x + rx * 0.35, y - ry * 0.4, rx * 0.42)}" fill="#fff"/>` +
    `<path d="${circ(x - rx * 0.35, y + ry * 0.42, rx * 0.2)}" fill="#fff"/>`;
  if (frame === 'idle') return eyeShape(near.x, near.y, 5.6, 7) + eyeShape(far.x, far.y, 4.6, 6.6);
  if (frame === 'reach') {
    return eyeShape(near.x, near.y - 0.5, 6.2, 7.8) + eyeShape(far.x, far.y - 0.5, 5.1, 7.3) +
      line('M60 32Q65 29.5 70 31.5M78 31Q82 29 86 30.5', P.furLine, 2.2);
  }
  if (frame === 'happy') {
    return line(`M60 45Q66 36 72 45`, P.eye, 3.4) + line(`M77.5 44Q82 36.5 86.5 44`, P.eye, 3.2);
  }
  // dizzy: swirl eyes
  const swirl = (x, y, r) => {
    let d = `M${x} ${y}`;
    for (let t = 0; t <= 2.3 * Math.PI * 2; t += 0.35) {
      const rr = (t / (2.3 * Math.PI * 2)) * r;
      d += `L${f(x + rr * Math.cos(t))} ${f(y + rr * Math.sin(t))}`;
    }
    return line(d, P.eye, 2.1);
  };
  return swirl(near.x, near.y, 6.4) + swirl(far.x, far.y, 5.4);
}

function kitMouth(frame) {
  let s = '';
  // blush
  s += `<path d="${ell(58, 52, 4.4, 2.6)}" fill="${P.blush}" opacity="0.6"/>`;
  s += `<path d="${ell(90, 51, 2.8, 2.2)}" fill="${P.blush}" opacity="0.6"/>`;
  // nose
  s += `<path d="M78 48.2Q82 47.4 85 48.6Q83.6 51.6 81.4 52Q79 51 78 48.2Z" fill="${P.nose}" stroke="#b84a5c" stroke-width="1.2" stroke-linejoin="round"/>`;
  if (frame === 'idle') s += line('M81.5 52L81.5 54.2M77 54.6Q79.4 57 81.5 54.2Q83.6 57 86 54.4', '#8a3e2c', 1.6);
  else if (frame === 'reach') {
    s += line('M81.5 52L81.5 53.6', '#8a3e2c', 1.6);
    s += `<path d="${ell(81.6, 57, 3.2, 3.4)}" fill="#c4455a" stroke="#7d2a2a" stroke-width="1.5"/><path d="${ell(81.6, 58.8, 2, 1.3)}" fill="#ff8fa3"/>`;
  } else if (frame === 'happy') {
    s += `<path d="M75 53.5Q81.5 55 88 53Q87.6 61.5 81.5 62Q75.6 61.5 75 53.5Z" fill="#c4455a" stroke="#7d2a2a" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<path d="M77.6 59.2Q81.5 56.6 85.6 59Q84 61.4 81.5 61.5Q79 61.4 77.6 59.2Z" fill="#ff8fa3"/>`;
  } else {
    s += line('M75.5 56Q77.5 54 79.5 56T83.5 56T87.5 56', '#8a3e2c', 1.7);
  }
  // whiskers
  s += line('M91 50.5L99 49M91 53L98.5 54.5', P.furLine, 1.1, ' opacity="0.55"');
  return s;
}

function kitArm(which, frame) {
  // far arm (behind body, shade colour) and near arm (front, fur colour)
  const far = {
    idle: 'M70 68L80 75', reach: 'M70 68L80 75', happy: 'M58 62Q48 50 44 34', dizzy: 'M66 70L70 86',
  }[frame];
  const farPaw = { idle: [81.5, 76], reach: [81.5, 76], happy: [43, 31], dizzy: [70.5, 88.5] }[frame];
  const near = {
    idle: 'M62 70Q66 79 72 80', reach: 'M62 69Q80 63 97 62.5', happy: 'M64 70Q86 70 96 42', dizzy: 'M60 72Q60 82 62 88',
  }[frame];
  const nearPaw = { idle: [74.5, 80], reach: [103, 62], happy: [97, 38], dizzy: [62.5, 90.5] }[frame];
  if (which === 'far') return limb(far, 7.5, P.furShade, P.furLine) + shape(circ(farPaw[0], farPaw[1], 4.6), P.furShade, P.furLine, { sw: 2.6 });
  const pr = frame === 'reach' ? 6 : 5.2;
  return limb(near, 8, P.fur, P.furLine) + shape(circ(nearPaw[0], nearPaw[1], pr), P.cream, P.furLine, {
    sw: 2.6, pfx: 'kp', shade: `M0 ${nearPaw[1] + 1.6}L120 ${nearPaw[1] + 2.6}L120 120L0 120Z`, shadeFill: P.creamShade,
  }) + (frame === 'reach'
    ? line(`M${nearPaw[0] + 2.5} ${nearPaw[1] - 3.6}L${nearPaw[0] + 4.5} ${nearPaw[1] - 2}M${nearPaw[0] + 3.4} ${nearPaw[1] + 2.6}L${nearPaw[0] + 5.2} ${nearPaw[1] + 1}`, P.furLine, 1.3)
    : '');
}

function kitDizzyStars() {
  return sparkle(46, 12, 5, P.star, P.starLine, 1.4) + sparkle(96, 16, 4, P.star, P.starLine, 1.3) +
    `<path d="${softStar(72, 6, 4.6, 2.2)}" fill="${P.star}" stroke="${P.starLine}" stroke-width="1.3" stroke-linejoin="round"/>`;
}

function kitGroup(frame) {
  _id = 0;
  return [
    kitTail(frame),
    kitArm('far', frame === 'happy' ? 'happy' : frame), // far arm behind everything
    kitLegs('far'),
    kitRocket(),
    kitBody(),
    kitLegs('near'),
    kitScarf(),
    kitEars(frame),
    kitHead(),
    kitEyes(frame),
    kitMouth(frame),
    kitArm('near', frame),
    frame === 'dizzy' ? kitDizzyStars() : '',
  ].join('\n');
}
const kitSVG = (frame) => svg(120, 120, `<g id="kit-${frame}">${kitGroup(frame)}</g>`);

// ================================================================= FLAME
function flameGroup(v) {
  // top centre (20,2) attaches to nozzle; points down
  const outer = v === 1
    ? 'M7 3Q20 0 33 3C38 12 36 22 30 30C27 36 24 41 20 46C16 41 13 36 10 30C4 22 2 12 7 3Z'
    : 'M8 3Q20 0 32 3C36 11 35 20 31 28C27 35 23 40 20 46.5C17 40 13 35 9 28C5 20 4 11 8 3Z';
  const mid = v === 1
    ? 'M11 4Q20 2 29 4C31 13 28 22 24 29Q22 34 20 37Q18 34 16 29C12 22 9 13 11 4Z'
    : 'M12 4Q20 2 28 4C30 12 28 20 24.5 27Q22 32 20 36Q18 32 15.5 27C12 20 10 12 12 4Z';
  const core = v === 1 ? ell(20, 11, 6.2, 8) : ell(20, 10, 5.4, 8.6);
  // detached puffs
  const puffs = v === 1
    ? [[9, 36, 3.2], [31, 38, 2.6], [20, 44.6, 0]]
    : [[31, 34, 3.2], [8, 40, 2.4]];
  let s = '';
  for (const [x, y, r] of puffs) if (r) s += `<path d="${circ(x, y, r)}" fill="${P.flMid}" stroke="${P.flLine}" stroke-width="1.8"/>`;
  s += shape(outer, P.flEdge, P.flLine, { sw: 2.6, pfx: 'fl' });
  s += `<path d="${mid}" fill="${P.flMid}"/>`;
  s += `<path d="${core}" fill="${P.flCore}"/>`;
  s += `<path d="${circ(v === 1 ? 23 : 16.5, v === 1 ? 26 : 25, 1.6)}" fill="${P.flCore}" opacity="0.9"/>`;
  return s;
}

// ================================================================= COIN
function coinGroup(px = 'co') {
  let s = '';
  const c = 32;
  // outer rim
  s += `<path d="${circ(c, c, 29)}" fill="${P.coinRim}" stroke="${P.coinLine}" stroke-width="3.4"/>`;
  // rim ridges (radially symmetric so rotation looks fine)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    s += line(`M${f(c + 24.6 * Math.cos(a))} ${f(c + 24.6 * Math.sin(a))}L${f(c + 27.4 * Math.cos(a))} ${f(c + 27.4 * Math.sin(a))}`, P.coinShade, 1.8);
  }
  // face (raised)
  s += shape(circ(c, c, 21.5), P.coin, P.coinLine, {
    sw: 2.4, pfx: px,
    shade: `${circ(c + 4, c + 4, 22)}`, shadeFill: P.coin,
    inner: `<path d="${annulusSeg(c, c, 18.5, 23, 20, 160)}" fill="${P.coinShade}" opacity="0.55"/>`,
  });
  // star stamp
  const st = softStar(c, c + 0.8, 13, 6.2);
  s += `<path d="${st}" fill="${P.coinStar}" stroke="${P.coinShade}" stroke-width="2.2" stroke-linejoin="round"/>`;
  s += `<path d="${softStar(c - 0.8, c, 8.6, 4.1)}" fill="#ffe680"/>`;
  // highlight glint
  s += `<path d="M14.5 27A18 18 0 0 1 27 14.2" fill="none" stroke="#fffbe0" stroke-width="3" stroke-linecap="round" opacity="0.9"/>`;
  s += `<path d="${circ(17, 33, 1.6)}" fill="#fffbe0" opacity="0.9"/>`;
  return s;
}

function coinGoldGroup() {
  let s = '';
  const c = 32;
  const cols = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];
  s += `<path d="${circ(c, c, 29)}" fill="#fff"/>`;
  for (let i = 0; i < 6; i++) s += `<path d="${annulusSeg(c, c, 21, 29, -90 + i * 60, -90 + (i + 1) * 60)}" fill="${cols[i]}"/>`;
  s += `<path d="${circ(c, c, 29)}" fill="none" stroke="${P.gLine}" stroke-width="3.4"/>`;
  s += shape(circ(c, c, 21.5), P.gFace, P.gLine, {
    sw: 2.4, pfx: 'cg', inner: `<path d="${annulusSeg(c, c, 18, 23, 20, 160)}" fill="${P.gFaceShade}"/>`,
  });
  // heart
  const heart = 'M32 45C24 39 18.5 34 18.5 27.5C18.5 23 22 20 26 20C28.8 20 30.8 21.6 32 23.6C33.2 21.6 35.2 20 38 20C42 20 45.5 23 45.5 27.5C45.5 34 40 39 32 45Z';
  s += shape(heart, P.gHeart, P.gHeartShade === '' ? P.gLine : P.gLine, {
    sw: 2.4, pfx: 'cgh', shade: 'M10 34Q32 40 54 30L54 60L10 60Z', shadeFill: P.gHeartShade,
    hi: ell(25.6, 25.6, 3.2, 2.2), hiOp: 0.85,
  });
  // sparkles
  s += sparkle(50, 13, 7.5, '#fff', P.gLine, 1.6);
  s += sparkle(12.5, 49, 4.2, '#fff', P.gLine, 1.3);
  return s;
}

// ================================================================= PILLOW
function pillowGroup() {
  // puffy square: convex sides, pinched-out corners
  const d = 'M6 6Q19 10 32 9Q45 10 58 6Q54 15 55 24Q54 33 58 42Q45 38 32 39Q19 38 6 42Q10 33 9 24Q10 15 6 6Z';
  let stripes = '';
  for (let x = 2; x < 64; x += 11) stripes += `<path d="M${x} 0L${x + 5} 0L${x + 5} 48L${x} 48Z" fill="${P.pilStripe}"/>`;
  return shape(d, P.pil, P.pilLine, {
    pfx: 'pw', inner: stripes,
    shade: 'M0 32Q32 42 64 30L64 48L0 48Z', shadeFill: 'rgba(90,80,170,0.18)',
    hi: ell(20, 15, 8, 3.4), hiOp: 0.7,
  }) +
    // center tuft button + seam dimple
    line('M14 13Q16 15 14 17M50 13Q48 15 50 17M14 35Q16 33 14 31M50 35Q48 33 50 31', P.pilLine, 1.3, ' opacity="0.5"') +
    `<path d="${circ(32, 24, 2.6)}" fill="#fff" stroke="${P.pilLine}" stroke-width="1.5"/>`;
}

// ================================================================= BARON FLUFF
// Anchors: basket centre (80,160); throw paw (112,104); balloon top y=4, basket bottom y=196.
function fluffBalloon() {
  const env = 'M80 4C112 4 132 22 132 42C132 60 112 72 94 80L66 80C48 72 28 60 28 42C28 22 48 4 80 4Z';
  let gores = '';
  const cols = [P.balC, P.balA, P.balB, P.balC, P.balA, P.balB, P.balC, P.balA];
  const bnd = (k) => ({ c: 80 + k * 24, b: 80 + k * 5 });
  for (let i = -4; i < 4; i++) {
    const a = bnd(i), b = bnd(i + 1);
    gores += `<path d="M80 2Q${a.c} 42 ${a.b} 84L${b.b} 84Q${b.c} 42 80 2Z" fill="${cols[i + 4]}"/>`;
  }
  for (let i = -3; i <= 3; i++) {
    const a = bnd(i);
    gores += line(`M80 2Q${a.c} 42 ${a.b} 84`, P.balLine, 1.4, ' opacity="0.45"');
  }
  let s = '';
  // ropes (behind)
  s += line('M70 82L52 128M90 82L108 128M76 84L70 128M84 84L90 128', P.rope, 2.2);
  s += shape(env, P.balA, P.balLine, {
    pfx: 'fb', inner: gores + `<path d="M140 0Q112 40 70 80L140 80Z" fill="${P.balShade}"/>`,
    hi: 'M50 16Q60 8 72 8Q60 14 54 26Q49 22 50 16Z', hiOp: 0.75,
  });
  // patches (stitched)
  const patch = (x, y, rot, col) =>
    `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 7}" y="${y - 6}" width="14" height="12" rx="2" fill="${col}" stroke="${P.balLine}" stroke-width="1.8"/>` +
    `<path d="M${x - 9} ${y - 3}L${x - 5} ${y - 3}M${x - 9} ${y + 2}L${x - 5} ${y + 2}M${x + 5} ${y - 3}L${x + 9} ${y - 3}M${x + 5} ${y + 2}L${x + 9} ${y + 2}" stroke="${P.balLine}" stroke-width="1.3" stroke-linecap="round"/></g>`;
  s += patch(52, 44, -14, P.balPatch) + patch(110, 30, 12, '#ffffff');
  // skirt / mouth
  s += shape('M66 79L94 79L90 89L70 89Z', P.balB, P.balLine, { sw: 2.4, pfx: 'fm', shade: 'M80 70L100 70L100 95L80 95Z', shadeFill: P.balShade });
  return s;
}

function fluffBasket() {
  const body = 'M50 134L110 134L104 191Q103 196 97 196L63 196Q57 196 56 191Z';
  let weave = '';
  for (let y = 146; y < 196; y += 12) weave += line(`M40 ${y}L120 ${y}`, P.wickerShade, 2);
  for (let r = 0; r < 5; r++) {
    const y0 = 134 + r * 12;
    for (let x = 56 + (r % 2) * 7; x < 110; x += 14) weave += line(`M${x} ${y0 + 3}L${x} ${y0 + 9}`, P.wickerShade, 2.2);
  }
  let s = shape(body, P.wicker, P.wickerLine, {
    pfx: 'fk', inner: weave, shade: 'M92 120L130 120L130 200L88 200Z', shadeFill: 'rgba(110,60,20,0.18)',
  });
  return s;
}
function fluffRim() {
  let hatch = '';
  for (let x = 44; x < 118; x += 6) hatch += line(`M${x} 126L${x + 4} 136`, P.wickerShade, 1.8);
  return shape('M46 130Q46 124 52 124L108 124Q114 124 114 130Q114 136 108 136L52 136Q46 136 46 130Z', P.wicker, P.wickerLine, {
    pfx: 'fr', inner: hatch, hi: 'M50 126L110 126L110 127.6L50 127.6Z', hiOp: 0.5,
  });
}

function fluffHead(frame) {
  let s = '';
  // ears (right one patched)
  s += shape(circ(60, 92, 9), P.bear, P.bearLine, { pfx: 'fe' }) + `<path d="${circ(60.5, 92.5, 4.6)}" fill="${P.muzzle}"/>`;
  s += shape(circ(100, 92, 9), P.bear, P.bearLine, {
    pfx: 'fe',
    inner: `<rect x="96" y="83" width="13" height="11" fill="${P.patch}" stroke="${P.patchLine}" stroke-width="1.5" transform="rotate(10 102 88)"/>` +
      line('M97 96L95 92M101 97L99 93', P.patchLine, 1.2),
  });
  // shoulders (mostly hidden by rim)
  s += shape(ell(80, 132, 24, 12), P.bear, P.bearLine);
  // head
  const hd = 'M57 108C57 94 67 87 80 87C93 87 103 94 103 108C103 113 102 117 99 120C96 126 89 129 80 129C71 129 64 126 61 120C58 117 57 113 57 108Z';
  s += shape(hd, P.bear, P.bearLine, {
    pfx: 'fh', shade: 'M50 112Q80 126 110 108L110 140L50 140Z', shadeFill: P.bearShade,
    hi: ell(70, 94, 6, 3), hiOp: 0.45,
  });
  // cheeks puffed
  s += `<path d="${ell(65.5, 116, 5.2, 3.6)}" fill="#ff9e9e" opacity="0.55"/><path d="${ell(94.5, 116, 5.2, 3.6)}" fill="#ff9e9e" opacity="0.55"/>`;
  // muzzle
  s += `<path d="${ell(80, 117, 10.5, 7.5)}" fill="${P.muzzle}" stroke="${P.bearShade}" stroke-width="1.4"/>`;
  s += `<path d="M75.5 112.5Q80 110.6 84.5 112.5Q83.6 116 80 116.6Q76.4 116 75.5 112.5Z" fill="${P.bearNose}"/>`;
  s += `<path d="${ell(78.6, 112.6, 1.6, 0.9)}" fill="#fff" opacity="0.7"/>`;
  // eyes / brows / mouth per frame
  if (frame === 'oof') {
    s += line('M66.5 101L73 104.5L66.5 108M93.5 101L87 104.5L93.5 108', '#3a2630', 2.6);
    s += `<path d="M74 119.5Q80 117 86 119.5Q85.5 124 80 124.6Q74.5 124 74 119.5Z" fill="#7d2f3a" stroke="#4a1f24" stroke-width="1.3"/>`;
    s += `<path d="M77 122Q80 128.5 83.4 122.4Q83 121 80 121Q77.4 121 77 122Z" fill="#ff8fa3" stroke="#c4455a" stroke-width="1.1"/>`;
    // bump
    s += shape(ell(70, 89, 5.5, 4), '#ffb0a8', P.bearLine, { sw: 2 });
  } else {
    const look = frame === 'throw' ? 1.2 : -1.2; // idle glances toward Kit (left)
    for (const ex of [71, 89]) {
      s += `<path d="${circ(ex + look, 106, 3.8)}" fill="#3a2630"/><path d="${circ(ex + look + 1.2, 104.6, 1.3)}" fill="#fff"/>`;
    }
    s += line(frame === 'throw' ? 'M64.5 98.5L76 102.5M95.5 98.5L84 102.5' : 'M65 99.5L76 101.5M95 99.5L84 101.5', P.bearLine, 3);
    s += frame === 'throw'
      ? `<path d="M75 121Q80 118.6 85 121Q83.6 124.4 80 124.4Q76.4 124.4 75 121Z" fill="#7d2f3a" stroke="#4a1f24" stroke-width="1.3"/>`
      : line('M75.5 122.4Q80 119.6 84.5 122.4', '#4a1f24', 1.8);
  }
  return s;
}

function fluffHat(frame) {
  const rot = frame === 'oof' ? 16 : -8;
  return `<g transform="rotate(${rot} 82 88)">` +
    shape('M68 88C68 78 74 73 82 73C90 73 96 78 96 88Z', P.hat, P.hatLine, { pfx: 'fhat', sw: 2.6, shade: 'M88 70L100 70L100 92L88 92Z', shadeFill: P.hatShade }) +
    shape('M67 84L97 84L97 89L67 89Z', P.hatBand, P.hatLine, { sw: 2.4 }) +
    shape('M60 89Q66 85 82 88L82 92Q68 91 61 92.6Q57 92 60 89Z', P.hatBand, P.hatLine, { sw: 2.4 }) +
    `<path d="${circ(82, 80, 2.6)}" fill="${P.star}" stroke="${P.starLine}" stroke-width="1.2"/></g>`;
}

function fluffArms(frame) {
  const paw = (x, y, r = 6) => shape(circ(x, y, r), P.bear, P.bearLine, { sw: 2.6, pfx: 'fpw', shade: `M0 ${y + 1.6}L160 ${y + 3}L160 200L0 200Z`, shadeFill: P.bearShade }) +
    `<path d="${ell(x, y + 1.6, r * 0.5, r * 0.36)}" fill="${P.muzzle}" opacity="0.9"/>`;
  if (frame === 'idle') {
    return limb('M66 130L64 127', 9, P.bear, P.bearLine) + limb('M94 130L96 127', 9, P.bear, P.bearLine) + paw(63, 127) + paw(97, 127);
  }
  if (frame === 'throw') {
    return limb('M66 130L64 127', 9, P.bear, P.bearLine) + paw(63, 127) +
      limb('M96 128Q112 122 112 108', 10, P.bear, P.bearLine) + paw(112, 104, 7.2) +
      line('M118 96Q123 100 122 106M121 92Q127 96 128 102', P.bearLine, 1.6, ' opacity="0.6"');
  }
  // oof: paws flailing up beside the cheeks
  return limb('M64 132Q54 126 52 116', 9, P.bear, P.bearLine) + limb('M96 132Q106 126 108 116', 9, P.bear, P.bearLine) +
    paw(51, 113) + paw(109, 113);
}

function feather(x, y, rot, s = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
    `<path d="M0 -8C5 -5 5 4 0 8C-5 4 -5 -5 0 -8Z" fill="${P.feather}" stroke="${P.featherLine}" stroke-width="1.4"/>` +
    line('M0 -6L0 9', P.featherLine, 1.1) + `</g>`;
}

function fluffGroup(frame) {
  _id = 0;
  return [
    fluffBalloon(),
    fluffBasket(),
    fluffHead(frame),
    fluffHat(frame),
    fluffRim(),
    fluffArms(frame),
    frame === 'oof' ? feather(42, 98, -30) + feather(122, 120, 40) + feather(118, 86, 15, 0.8) + feather(40, 128, 70, 0.75) : '',
  ].join('\n');
}

// ================================================================= RING
function ringGroup() {
  let s = '';
  const c = 48;
  // faint drum skin hint is NOT drawn (centre stays transparent)
  s += `<path d="${annulusSeg(c, c, 34, 44, 0, 359.99)}" fill="${P.wood}"/>`;
  s += `<path d="${annulusSeg(c, c, 34, 44, 20, 160)}" fill="${P.woodShade}"/>`;
  // inner light lip
  s += `<path d="${annulusSeg(c, c, 34, 36.2, 180, 359.99)}" fill="#ffe0a8"/>`;
  // jingle slots
  for (let i = 0; i < 6; i++) {
    const a = -90 + i * 60 + 30;
    s += `<g transform="rotate(${a} ${c} ${c})">` +
      `<rect x="${c + 35.5}" y="${c - 6}" width="7" height="12" rx="2.5" fill="${P.woodLine}" opacity="0.85"/>` +
      `<path d="${ell(c + 39, c - 2.6, 3.6, 3.6)}" fill="${P.jingle}" stroke="${P.jingleLine}" stroke-width="1.4"/>` +
      `<path d="${ell(c + 39, c + 2.6, 3.6, 3.6)}" fill="${P.jingle}" stroke="${P.jingleLine}" stroke-width="1.4"/>` +
      `<path d="${circ(c + 38, c - 3.6, 1)}" fill="#fff"/></g>`;
  }
  s += `<path d="${circ(c, c, 44)}" fill="none" stroke="${P.woodLine}" stroke-width="3.2"/>`;
  s += `<path d="${circ(c, c, 34)}" fill="none" stroke="${P.woodLine}" stroke-width="3"/>`;
  s += `<path d="M16 30A38 38 0 0 1 30 15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`;
  return s;
}

// ================================================================= HUD icons
function grooveGroup() {
  let s = '';
  // handle
  s += limb('M18 18Q18 9 28 9L32 9', 4, P.rocketShade, P.rocketLine, 2.4);
  // spout
  s += shape('M40 15L46 5L53 9L47 19Z', P.metal, P.metalLine, { sw: 2.6 });
  s += shape('M12 22Q12 14 20 14L42 14Q52 14 52 24L52 52Q52 59 45 59L19 59Q12 59 12 52Z', P.rocket, P.rocketLine, {
    pfx: 'gv', sw: 3, shade: 'M0 48L64 46L64 64L0 64Z', shadeFill: P.rocketShade,
    hi: 'M16 22Q16 18 20 18L22 18L22 40L16 40Z', hiOp: 0.45,
  });
  // white label + note
  s += `<path d="M18 26Q18 24 20 24L44 24Q46 24 46 26L46 50Q46 52 44 52L20 52Q18 52 18 50Z" fill="${P.white}" stroke="${P.rocketLine}" stroke-width="1.8"/>`;
  s += `<path d="${ell(27, 45, 5, 3.8)}" fill="${P.toyLine}" transform="rotate(-18 27 45)"/>`;
  s += `<path d="M31 44L31 28L40 31.5L40 36L33.6 33.8" fill="none" stroke="${P.toyLine}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  return s;
}

function tapGroup(dir) {
  let s = '';
  s += shape('M6 22Q6 6 22 6L42 6Q58 6 58 22L58 42Q58 58 42 58L22 58Q6 58 6 42Z', P.toy, P.toyLine, {
    pfx: 't' + dir, sw: 3, shade: 'M0 44Q32 50 64 44L64 64L0 64Z', shadeFill: P.toyShade,
    hi: 'M14 12Q20 10 32 10Q20 14 13 22Q11 16 14 12Z', hiOp: 0.55,
  });
  const ch = dir === 'up' ? 'M19 37L32 24L45 37' : 'M19 27L32 40L45 27';
  s += line(ch, P.toyLine, 12) + line(ch, '#ffffff', 7);
  return s;
}

// ================================================================= APP ICON
function iconSVG() {
  let s = '';
  s += `<path d="${circ(128, 128, 122)}" fill="${P.toy}" stroke="${P.toyLine}" stroke-width="8"/>`;
  s += `<path d="${circ(128, 128, 100)}" fill="${P.toyLight}" opacity="0.55"/>`;
  s += sparkle(212, 62, 9, '#fff') + sparkle(40, 112, 6, '#fff') + sparkle(150, 226, 6, '#fff');
  // music note top-left
  s += `<g transform="translate(166 150) scale(0.9)"><path d="${ell(14, 46, 10, 7.6)}" fill="#fff" stroke="${P.toyLine}" stroke-width="3" transform="rotate(-18 14 46)"/>` +
    `<path d="M22 44L22 10L44 17L44 26" fill="none" stroke="${P.toyLine}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M22 44L22 10L44 17L44 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const k = 1.85, tx = 4, ty = 8; // kit transform
  let ch = '';
  const fs_ = k * 0.8125; // flame scale relative to kit (game draws 26 px flame with 96 px kit)
  ch += `<g transform="translate(${f(tx + 30 * k - 20 * fs_)} ${f(ty + 96 * k - 2 * fs_)}) scale(${f(fs_)})">${flameGroup(1)}</g>`;
  ch += `<g transform="translate(${tx} ${ty}) scale(${k})">${kitGroup('reach')}</g>`;
  const px = tx + 103 * k, py = ty + 62 * k;
  ch += `<g transform="translate(${f(px - 22)} ${f(py - 36)}) scale(0.92)">${coinGroup('ic')}</g>`;
  s += `<clipPath id="badge"><path d="${circ(128, 128, 118)}"/></clipPath><g clip-path="url(#badge)">${ch}</g>`;
  s += `<path d="${circ(128, 128, 122)}" fill="none" stroke="${P.toyLine}" stroke-width="8"/>`;
  return svg(256, 256, s);
}

// ================================================================= WRITE
const files = {
  'kit_idle.svg': kitSVG('idle'),
  'kit_reach.svg': kitSVG('reach'),
  'kit_happy.svg': kitSVG('happy'),
  'kit_dizzy.svg': kitSVG('dizzy'),
  'flame_1.svg': svg(40, 48, flameGroup(1)),
  'flame_2.svg': svg(40, 48, flameGroup(2)),
  'coin.svg': svg(64, 64, coinGroup()),
  'coin_gold.svg': svg(64, 64, coinGoldGroup()),
  'pillow.svg': svg(64, 48, pillowGroup()),
  'fluff_idle.svg': svg(160, 200, fluffGroup('idle')),
  'fluff_throw.svg': svg(160, 200, fluffGroup('throw')),
  'fluff_oof.svg': svg(160, 200, fluffGroup('oof')),
  'ring.svg': svg(96, 96, ringGroup()),
  'groove.svg': svg(64, 64, grooveGroup()),
  'tap_up.svg': svg(64, 64, tapGroup('up')),
  'tap_down.svg': svg(64, 64, tapGroup('down')),
  'icon.svg': iconSVG(),
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, txt] of Object.entries(files)) {
  if (/<text|<script|<image|href=|@import|font/i.test(txt)) throw new Error('forbidden content in ' + name);
  fs.writeFileSync(path.join(OUT, name), txt);
}
console.log('wrote', Object.keys(files).length, 'files to', OUT);
module.exports = { files };
