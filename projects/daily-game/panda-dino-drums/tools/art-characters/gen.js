#!/usr/bin/env node
// Character & item art generator for Momo's Dino Drums (DESIGN.md §4.1).
// 100% original hand-written SVG, built from shared parts so every frame of a
// character has identical body geometry (only face / arms / sticks / wings change).
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Momo (panda cub)
  fur: '#fbf8f4', furShade: '#e4dde8', furLine: '#5b5266',
  ink: '#3b3540', inkShade: '#2b2630', inkLine: '#1e1a23', inkHi: '#6d6478',
  eyeDark: '#241d2b', blush: '#ff9fb4', pad: '#ffb7c6', padLine: '#b4566e',
  mouth: '#c4455a', tongue: '#ff8fa3',
  band: '#7cc843', bandShade: '#5ea532', bandLine: '#356b1f',
  // bamboo (sticks, swing)
  bam: '#c9d75c', bamShade: '#a3b43c', bamNode: '#7e8f2a', bamLine: '#4f5c19', bamTip: '#f5dc8e', bamTipLine: '#8a6a22',
  rope: '#c49a63', ropeShade: '#9b7444', ropeLine: '#5d4123',
  // Pip (baby pterosaur)
  pip: '#ffae70', pipShade: '#f08b4d', pipLine: '#a14e1f', belly: '#fff1d6', bellyShade: '#f8dcb2',
  beak: '#ffd36b', beakShade: '#f1aa3c', beakLine: '#9c5f16',
  crest: '#ff8c7c', crestShade: '#ea6a5d', crestLine: '#a33c35',
  wing: '#d0b0f6', wingShade: '#ac8ae3', wingLine: '#644498',
  // gem (teal)
  gLine: '#0d5363',
  // rainbow gem
  rLine: '#6a2c78',
  // drum
  wood: '#e7a35a', woodShade: '#c57f3a', woodLine: '#74431b', skin: '#f6dcaa', skinLight: '#fff4dd', lace: '#fff2d2',
  // UI chips
  leaf: '#6cc24a', leafShade: '#53a336', leafLine: '#2d6a1d', leafLight: '#9be07a',
  note: '#3b4fa8', noteLine: '#1f2b66',
  star: '#ffe066', starLine: '#c48a12',
  valley: '#8fd16a', valleyShade: '#6cb84c', valleyLine: '#2f6b24',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +n.toFixed(2);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const rot = (deg, x, y, inner) => `<g transform="rotate(${deg} ${x} ${y})">${inner}</g>`;
// filled shape with cel shade (clipped), optional inner art + highlight, then outline on top
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
    if (opt.hi) s += `<path d="${opt.hi}" fill="${opt.hiFill || '#fff'}" opacity="${opt.hiOp ?? 0.6}"/>`;
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
function sparkle(cx, cy, r, fill = '#fff', stroke = null, sw = 1.5) {
  const k = r * 0.22;
  const d = `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
  return `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
}
function swirl(x, y, r, c, w) {
  let d = `M${x} ${y}`;
  const turns = 2.2 * Math.PI * 2;
  for (let t = 0; t <= turns; t += 0.3) {
    const rr = (t / turns) * r;
    d += `L${f(x + rr * Math.cos(t))} ${f(y + rr * Math.sin(t))}`;
  }
  return line(d, c, w);
}
// leaf shape from base (x,y) pointing at angle a (deg), length L, width W
function leafPath(x, y, a, L, W) {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const pt = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const [tx, ty] = pt(L, 0), [a1x, a1y] = pt(L * 0.45, -W), [a2x, a2y] = pt(L * 0.45, W);
  return `M${f(x)} ${f(y)}Q${f(a1x)} ${f(a1y)} ${f(tx)} ${f(ty)}Q${f(a2x)} ${f(a2y)} ${f(x)} ${f(y)}Z`;
}
function leaf(x, y, a, L, W, sw = 2) {
  const r = (a * Math.PI) / 180;
  return shape(leafPath(x, y, a, L, W), P.band, P.bandLine, { sw }) +
    line(`M${f(x + Math.cos(r) * L * 0.12)} ${f(y + Math.sin(r) * L * 0.12)}L${f(x + Math.cos(r) * L * 0.7)} ${f(y + Math.sin(r) * L * 0.7)}`, P.bandShade, sw * 0.7);
}

// ================================================================= MOMO
// Anchors (viewBox 0 0 120 120): body centre (58,62); seat line (bottom of bum) y=104;
// head top y≈12 (ears to y≈7); reach stick tip (106,76).
const M = {
  head: { cx: 62, cy: 38, rx: 30, ry: 25.5 },
  body: { cx: 56, cy: 83, rx: 25, ry: 21 }, // bottom = 104 = seat line
  nearEye: [63, 40], farEye: [83, 38.5],
};

// bamboo drumstick: from grip point (x,y), angle a (deg, 0 = right, + = down), back length b, front length L
function stick(x, y, a, L = 24, b = 6) {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const x0 = x - c * b, y0 = y - s * b, x1 = x + c * L, y1 = y + s * L;
  let o = limb(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`, 4.2, P.bam, P.bamLine, 1.8);
  // shaded underside
  o += line(`M${f(x0 + 1.2 * -s)} ${f(y0 + 1.2 * c)}L${f(x1 + 1.2 * -s)} ${f(y1 + 1.2 * c)}`, P.bamShade, 1.4, ' opacity="0.9"');
  // node rings
  for (const t of [0.42, 0.78]) {
    const nx = x + c * L * t, ny = y + s * L * t;
    o += line(`M${f(nx - 2.6 * -s)} ${f(ny - 2.6 * c)}L${f(nx + 2.6 * -s)} ${f(ny + 2.6 * c)}`, P.bamNode, 1.6);
  }
  // rounded tip knob
  o += `<path d="${circ(f(x1), f(y1), 3.6)}" fill="${P.bamTip}" stroke="${P.bamTipLine}" stroke-width="1.8"/>`;
  o += `<path d="${circ(f(x1 - 1), f(y1 - 1.1), 1.1)}" fill="#fff" opacity="0.85"/>`;
  return o;
}
function paw(x, y, r = 6.4) {
  return shape(circ(x, y, r), P.ink, P.inkLine, { sw: 2.4, pfx: 'mp', hi: ell(x + r * 0.25, y - r * 0.45, r * 0.45, r * 0.25), hiFill: P.inkHi, hiOp: 0.9 });
}
// arm pose per frame: shoulder path to paw, stick angle
const ARMS = {
  idle: {
    far: { d: 'M70 70Q80 70 88 66', paw: [89, 65.5], a: -40, L: 26 },
    near: { d: 'M60 70Q66 80 79 79', paw: [81, 78.5], a: -24, L: 27 },
  },
  reach: {
    far: { d: 'M70 70Q80 68 86 60', paw: [87, 59], a: -62, L: 26 },
    near: { d: 'M60 70Q74 74 88 70', paw: [90, 69.6], a: 22, L: 17.5 }, // tip lands at ≈(106,76)
  },
  happy: {
    far: { d: 'M50 68Q30 62 26 40', paw: [25.5, 37], a: -104, L: 24 },
    near: { d: 'M66 72Q100 72 101 44', paw: [101, 40], a: -74, L: 24 },
  },
  dizzy: {
    far: { d: 'M70 72Q80 76 88 78', paw: [89.5, 78.5], a: 48, L: 22 },
    near: { d: 'M60 72Q62 84 72 88', paw: [74, 88.5], a: 18, L: 30 },
  },
};
function momoArm(which, frame) {
  const A = ARMS[frame][which];
  const col = which === 'far' ? P.inkShade : P.ink;
  return stick(A.paw[0], A.paw[1], A.a, A.L) + limb(A.d, 11, col, P.inkLine, 2.6) + paw(A.paw[0], A.paw[1]);
}
function momoEars(frame) {
  let s = '';
  // far ear (top right, a bit smaller)
  s += shape(circ(85, 17, 8.6), P.ink, P.inkLine, { sw: 2.8, pfx: 'me', hi: ell(86, 13, 3.6, 2), hiFill: P.inkHi, hiOp: 0.9 });
  if (frame === 'dizzy') {
    // near ear folded down over the side of the head (cute flop)
    s += rot(-28, 40, 20, shape('M30 22Q30 11 41 10Q51 10 51 19Q45 26 37 27Q31 27 30 22Z', P.ink, P.inkLine, { sw: 2.8 }));
  } else {
    s += shape(circ(40, 18, 10), P.ink, P.inkLine, { sw: 2.8, pfx: 'me', hi: ell(42, 13, 4.2, 2.2), hiFill: P.inkHi, hiOp: 0.9 });
  }
  return s;
}
function momoBandTails() {
  // leaf tails of the headband knot, behind the head on the left
  return leaf(36, 30, 200, 17, 5.5) + leaf(36, 32, 152, 15, 5);
}
function momoHead(frame) {
  const { cx, cy, rx, ry } = M.head;
  // chubby head: rounder cheeks at the bottom
  const d = `M${cx - rx} ${cy}C${cx - rx} ${cy - ry * 0.6} ${cx - rx * 0.56} ${cy - ry} ${cx} ${cy - ry}` +
    `C${cx + rx * 0.58} ${cy - ry} ${cx + rx} ${cy - ry * 0.6} ${cx + rx} ${cy}` +
    `C${cx + rx} ${cy + ry * 0.66} ${cx + rx * 0.6} ${cy + ry} ${cx} ${cy + ry}` +
    `C${cx - rx * 0.62} ${cy + ry} ${cx - rx} ${cy + ry * 0.62} ${cx - rx} ${cy}Z`;
  const shade = `M${cx - rx - 4} ${cy - 2}C${cx - rx + 4} ${cy + 16} ${cx - 6} ${cy + 22} ${cx + 18} ${cy + 22}L${cx + 18} ${cy + ry + 6}L${cx - rx - 6} ${cy + ry + 6}Z`;
  const band = limb('M26 31Q58 12 96 26', 6.4, P.band, P.bandLine, 1.8) + line('M30 31.6Q58 15.6 94 28.6', P.bandShade, 1.6) +
    line('M30 26.8Q58 9.6 90 19.8', '#c9f5a6', 1.4, ' opacity="0.8"');
  let s = shape(d, P.fur, P.furLine, { pfx: 'mh', shade, shadeFill: P.furShade, inner: band });
  // knot on the band at the back
  s += `<path d="${circ(35.5, 29.5, 3.6)}" fill="${P.band}" stroke="${P.bandLine}" stroke-width="1.8"/>`;
  // eye patches (droop outwards)
  s += rot(32, M.nearEye[0], M.nearEye[1], shape(ell(M.nearEye[0], M.nearEye[1] + 0.6, 8.6, 10.8), P.ink, P.inkLine, { sw: 1.6 }));
  s += rot(-22, M.farEye[0], M.farEye[1], shape(ell(M.farEye[0] + 0.4, M.farEye[1] + 0.6, 6.4, 9.6), P.ink, P.inkLine, { sw: 1.6 }));
  // muzzle (white, faint ring)
  s += `<path d="${ell(80, 50, 11.5, 8)}" fill="${P.fur}" stroke="${P.furShade}" stroke-width="1.6"/>`;
  // blush
  s += `<path d="${ell(54, 53, 5.2, 3)}" fill="${P.blush}" opacity="0.75"/><path d="${ell(89.5, 50.5, 2.6, 2.4)}" fill="${P.blush}" opacity="0.75"/>`;
  return s;
}
function momoEyes(frame) {
  const [nx, ny] = M.nearEye, [fx, fy] = M.farEye;
  const eye = (x, y, r) =>
    `<path d="${circ(x, y, r)}" fill="#fff"/>` +
    `<path d="${circ(x + r * 0.16, y + r * 0.08, r * 0.8)}" fill="${P.eyeDark}"/>` +
    `<path d="${circ(x + r * 0.4, y - r * 0.32, r * 0.36)}" fill="#fff"/>` +
    `<path d="${circ(x - r * 0.22, y + r * 0.42, r * 0.17)}" fill="#fff"/>`;
  if (frame === 'idle') return eye(nx + 0.5, ny, 5.6) + eye(fx + 0.4, fy, 4.4);
  if (frame === 'reach') {
    return eye(nx + 0.8, ny - 0.4, 6.1) + eye(fx + 0.6, fy - 0.4, 4.8) +
      line('M54 27.6Q60 24.6 66 26.4M79 25.6Q83 23.8 87 25.2', P.ink, 2.4);
  }
  if (frame === 'happy') {
    return line(`M${nx - 4.6} ${ny + 2}Q${nx} ${ny - 5} ${nx + 4.6} ${ny + 2}`, '#fff', 2.8) +
      line(`M${fx - 3.4} ${fy + 2}Q${fx} ${fy - 4} ${fx + 3.4} ${fy + 2}`, '#fff', 2.5);
  }
  // dizzy: white swirl eyes on the patches
  return `<path d="${circ(nx, ny, 5.8)}" fill="#fff"/><path d="${circ(fx, fy, 4.6)}" fill="#fff"/>` +
    swirl(nx, ny, 4.8, P.eyeDark, 1.6) + swirl(fx, fy, 3.8, P.eyeDark, 1.4);
}
function momoMouth(frame) {
  let s = '';
  // nose: soft rounded triangle
  s += `<path d="M77.6 45.4Q81.8 44 86 45.4Q85.2 49 81.8 49.8Q78.4 49 77.6 45.4Z" fill="${P.ink}" stroke="${P.inkLine}" stroke-width="1.2" stroke-linejoin="round"/>`;
  s += `<path d="${ell(80.6, 45.9, 1.6, 0.8)}" fill="${P.inkHi}"/>`;
  if (frame === 'idle') s += line('M81.8 49.8L81.8 51.6M77.4 52Q79.6 54.6 81.8 51.6Q84 54.6 86.2 52', P.ink, 1.6);
  else if (frame === 'reach') {
    s += line('M81.8 49.8L81.8 51', P.ink, 1.6);
    s += `<path d="${ell(81.8, 54.4, 3, 3.1)}" fill="${P.mouth}" stroke="${P.ink}" stroke-width="1.4"/><path d="${ell(81.8, 56, 1.9, 1.2)}" fill="${P.tongue}"/>`;
  } else if (frame === 'happy') {
    s += `<path d="M75.6 51Q81.8 52.6 88 50.6Q87.6 58.6 81.8 59.2Q76.2 58.6 75.6 51Z" fill="${P.mouth}" stroke="${P.ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="M78 56.6Q81.8 54.2 85.6 56.4Q84.2 58.6 81.8 58.7Q79.4 58.6 78 56.6Z" fill="${P.tongue}"/>`;
  } else {
    s += line('M75.8 54Q77.8 51.8 79.8 54T83.8 54T87.8 54', P.ink, 1.6);
  }
  return s;
}
function momoBody() {
  const { cx, cy, rx, ry } = M.body;
  // slightly pear-shaped, flat-ish seat
  const d = `M${cx - rx + 4} ${cy - ry + 6}C${cx - 10} ${cy - ry - 2} ${cx + 12} ${cy - ry - 2} ${cx + rx - 4} ${cy - ry + 6}` +
    `C${cx + rx + 1} ${cy - 4} ${cx + rx + 1} ${cy + ry - 6} ${cx + rx - 6} ${cy + ry - 1}` +
    `Q${cx} ${cy + ry + 0.6} ${cx - rx + 6} ${cy + ry - 1}` +
    `C${cx - rx - 1} ${cy + ry - 6} ${cx - rx - 1} ${cy - 4} ${cx - rx + 4} ${cy - ry + 6}Z`;
  return shape(d, P.fur, P.furLine, {
    pfx: 'mb', shade: `M20 80Q36 98 64 100L64 112L20 112Z`, shadeFill: P.furShade,
  });
}
function momoTail() {
  return shape(circ(31.5, 96, 5), P.fur, P.furLine, { sw: 2.6 });
}
function momoLegs(which) {
  if (which === 'far') {
    return limb('M66 96Q76 96 86 93', 12, P.inkShade, P.inkLine, 2.6) +
      shape(ell(90, 91.5, 6.4, 7.6), P.inkShade, P.inkLine, { sw: 2.6 });
  }
  return limb('M54 99Q66 102 80 100', 13, P.ink, P.inkLine, 2.6) +
    shape(ell(84, 98.5, 7.4, 8.8), P.ink, P.inkLine, { sw: 2.6, pfx: 'mf', hi: ell(82, 92.5, 3.4, 1.8), hiFill: P.inkHi, hiOp: 0.9 }) +
    // paw pad + toe beans
    `<path d="${ell(85.6, 100, 3.4, 3.6)}" fill="${P.pad}"/>` +
    `<path d="${circ(86.6, 93.6, 1.4)}" fill="${P.pad}"/><path d="${circ(89.4, 96.4, 1.3)}" fill="${P.pad}"/><path d="${circ(89.6, 100.4, 1.2)}" fill="${P.pad}"/>`;
}
function momoDizzyStars() {
  return sparkle(24, 12, 4.6, P.star, P.starLine, 1.3) + sparkle(102, 10, 4, P.star, P.starLine, 1.2) +
    sparkle(62, 5.4, 3.4, P.star, P.starLine, 1.1);
}
function momoGroup(frame) {
  _id = 0;
  return [
    momoArm('far', frame),
    momoTail(),
    momoLegs('far'),
    momoBody(),
    momoBandTails(),
    momoEars(frame),
    momoHead(frame),
    momoEyes(frame),
    momoMouth(frame),
    momoLegs('near'),
    momoArm('near', frame),
    frame === 'dizzy' ? momoDizzyStars() : '',
  ].join('\n');
}
const momoSVG = (frame) => svg(120, 120, `<g id="momo-${frame}">${momoGroup(frame)}</g>`);

// ================================================================= SWING
// viewBox 0 0 120 40: ropes at x=14 and x=106 (tops y=2); seat top y=10.
function swingGroup() {
  let s = '';
  // ropes (behind plank top, over its front as loops)
  for (const x of [14, 106]) s += limb(`M${x} 2L${x} 12`, 3, P.rope, P.ropeLine, 1.4);
  // plank: a thick bamboo pole, seat top y=10
  const d = 'M6 10L114 10Q118 10 118 16Q118 22 114 22L6 22Q2 22 2 16Q2 10 6 10Z';
  let inner = `<path d="M0 17.5L120 17.5L120 24L0 24Z" fill="${P.bamShade}"/>`;
  for (const x of [34, 60, 86]) inner += line(`M${x} 9L${x} 23`, P.bamNode, 2.2) + line(`M${x + 2} 11L${x + 2} 21`, '#e4ef94', 1, ' opacity="0.8"');
  s += shape(d, P.bam, P.bamLine, { pfx: 'sw', sw: 2.6, inner, hi: 'M8 12L112 12L112 13.8L8 13.8Z', hiOp: 0.55 });
  // end caps (cut bamboo)
  s += `<path d="${ell(4.8, 16, 2.4, 5.4)}" fill="${P.bamTip}" stroke="${P.bamLine}" stroke-width="1.6"/>`;
  s += `<path d="${ell(115.2, 16, 2.4, 5.4)}" fill="${P.bamTip}" stroke="${P.bamLine}" stroke-width="1.6"/>`;
  // rope loops wrapping the plank + dangling ends
  for (const x of [14, 106]) {
    s += limb(`M${x - 4} 9.5Q${x} 12 ${x + 4} 9.5`, 2.6, P.rope, P.ropeLine, 1.2);
    s += limb(`M${x - 4.2} 22.5Q${x} 25 ${x + 4.2} 22.5`, 2.6, P.rope, P.ropeLine, 1.2);
    s += limb(`M${x - 3} 10.5L${x - 3} 22.5M${x + 3} 10.5L${x + 3} 22.5`, 2.6, P.rope, P.ropeLine, 1.2);
    s += limb(`M${x + 2} 25Q${x + 4} 30 ${x + 2} 34`, 2, P.rope, P.ropeLine, 1.1);
  }
  // little leaf tied on the right rope
  s += leaf(108, 26, 60, 12, 4, 1.6) + leaf(108, 26, 120, 10, 3.6, 1.6);
  s += `<path d="${circ(108, 25.5, 2)}" fill="${P.rope}" stroke="${P.ropeLine}" stroke-width="1.2"/>`;
  return s;
}

// ================================================================= GEM
// viewBox 0 0 64 64, centre (32,32), table top y=8, girdle y=26, bottom tip y=58.
const GEM = (() => {
  const T0 = [21, 8], T1 = [43, 8];
  const G = [[5, 26], [18.5, 26], [32, 26], [45.5, 26], [59, 26]];
  const tip = [32, 58];
  return {
    outline: poly([T0, T1, G[4], tip, G[0]]),
    facets: [
      [G[0], T0, G[1]], [T0, G[2], G[1]], [T0, T1, G[2]], [T1, G[3], G[2]], [T1, G[4], G[3]],
      [G[0], G[1], tip], [G[1], G[2], tip], [G[2], G[3], tip], [G[3], G[4], tip],
    ],
  };
})();
function gemGroup(cols, lineCol, hiCol, extra = '') {
  let s = '';
  // white sticker halo so the gem reads on any wall (warm, green, violet)
  s += `<path d="${GEM.outline}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round" opacity="0.9"/>`;
  GEM.facets.forEach((pts, i) => { s += `<path d="${poly(pts)}" fill="${cols[i]}"/>`; });
  // facet edges
  s += `<path d="M18.5 26L21 8L32 26L43 8L45.5 26M18.5 26L32 58L45.5 26M32 26L32 58M5 26L59 26" fill="none" stroke="${lineCol}" stroke-width="1.3" stroke-linejoin="round" opacity="0.45"/>`;
  s += `<path d="${GEM.outline}" fill="none" stroke="${lineCol}" stroke-width="3" stroke-linejoin="round"/>`;
  // big highlight on the table + glints
  s += `<path d="M24 11L33 11L27.5 21Z" fill="${hiCol}" opacity="0.95"/>`;
  s += `<path d="M10 28L16.5 28L24 44Z" fill="${hiCol}" opacity="0.7"/>`;
  s += sparkle(47.5, 14.5, 4.4, '#fff');
  return s + extra;
}
const GEM_TEAL = ['#8ff2e4', '#5fdfd3', '#c8fff6', '#38c9c6', '#22a6b2', '#41cec9', '#86ece1', '#27b1b8', '#1b8597'];
const GEM_RAIN = ['#ffd56e', '#ffb2d0', '#fff2bf', '#eaa2ff', '#b383f0', '#ff9ec6', '#ffe18c', '#c79bff', '#8e5fd8'];

// ================================================================= PIP
// viewBox 0 0 120 100: body centre (60,56), feet at (60,92). Body identical in all frames.
const WINGS = {
  // near (left) and far (right) wings: shoulder, elbow (control), tip; trailing scallops
  up: { near: { s: [48, 50], c: [30, 26], t: [8, 6] }, far: { s: [68, 44], c: [90, 18], t: [106, 2] } },
  down: { near: { s: [48, 52], c: [24, 50], t: [6, 84] }, far: { s: [70, 48], c: [96, 50], t: [114, 82] } },
  cheer: { near: { s: [48, 50], c: [26, 30], t: [4, 26] }, far: { s: [68, 44], c: [94, 26], t: [116, 20] } },
};
function pipWing(w, which) {
  const { s, c, t } = w;
  // membrane: leading edge s->c->t, trailing edge scalloped back to the body flank
  const back = which === 'near' ? [42, 74] : [74, 68];
  const m1 = [t[0] + (back[0] - t[0]) * 0.36, t[1] + (back[1] - t[1]) * 0.36];
  const m2 = [t[0] + (back[0] - t[0]) * 0.7, t[1] + (back[1] - t[1]) * 0.7];
  // scallop bulge direction: away from the leading edge
  const mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2];
  const bulge = (a, b) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = mx - c[0], dy = my - c[1], L = Math.hypot(dx, dy) || 1;
    return [mx + (dx / L) * 7, my + (dy / L) * 7];
  };
  const q1 = bulge(t, m1), q2 = bulge(m1, m2), q3 = bulge(m2, back);
  const d = `M${s[0]} ${s[1]}Q${c[0]} ${c[1]} ${t[0]} ${t[1]}` +
    `Q${f(q1[0])} ${f(q1[1])} ${f(m1[0])} ${f(m1[1])}` +
    `Q${f(q2[0])} ${f(q2[1])} ${f(m2[0])} ${f(m2[1])}` +
    `Q${f(q3[0])} ${f(q3[1])} ${back[0]} ${back[1]}Z`;
  const col = which === 'far' ? P.wingShade : P.wing;
  void mid;
  let o = shape(d, col, P.wingLine, {
    sw: 2.6, pfx: 'pw',
    inner: line(`M${s[0]} ${s[1]}L${f(m1[0])} ${f(m1[1])}M${s[0]} ${s[1]}L${f(m2[0])} ${f(m2[1])}`, P.wingLine, 1.2, ' opacity="0.35"'),
  });
  // arm bone along the leading edge, warm orange
  o += line(`M${s[0]} ${s[1]}Q${c[0]} ${c[1]} ${t[0]} ${t[1]}`, which === 'far' ? P.pipShade : P.pip, 2.4);
  return o;
}
function pipBody() {
  let s = '';
  // tail with a rounded diamond vane
  s += limb('M42 68Q30 74 22 70', 4, P.pip, P.pipLine, 2.2);
  s += shape('M22 70L15 64Q12 68 13 72Q16 76 22 70Z', P.crest, P.crestLine, { sw: 2.2 });
  // legs + little round feet (no claws)
  s += limb('M54 80L54 88', 5, P.pipShade, P.pipLine, 2.2) + limb('M66 80L66 88', 5, P.pip, P.pipLine, 2.2);
  s += shape(ell(55, 90.6, 5.2, 2.8), P.pipShade, P.pipLine, { sw: 2.2 });
  s += shape(ell(66.5, 90.6, 5.4, 2.8), P.pip, P.pipLine, { sw: 2.2 });
  // round body
  s += shape(ell(59, 63, 23, 20.5), P.pip, P.pipLine, {
    pfx: 'pb', shade: 'M30 66Q52 88 88 72L88 92L30 92Z', shadeFill: P.pipShade,
    inner: `<path d="${ell(65, 67, 13, 13.5)}" fill="${P.belly}"/><path d="M50 74Q65 86 80 74L80 86L50 86Z" fill="${P.bellyShade}"/>`,
    hi: ell(48, 49, 6, 3), hiOp: 0.45,
  });
  return s;
}
function pipHead(frame) {
  let s = '';
  // crest: rounded, swept back
  s += shape('M64 25Q50 8 32 10Q29 14 36 18Q48 26 58 33Z', P.crest, P.crestLine, { sw: 2.6, pfx: 'pc', shade: 'M30 20L70 26L70 40L30 40Z', shadeFill: P.crestShade });
  // beak (rounded tip, no teeth); cheer = open smile
  if (frame === 'cheer') {
    s += shape('M84 44Q98 47 108 51Q109 54 104 54.6Q93 54.6 84 50Z', P.beakShade, P.beakLine, { sw: 2.4 });
    s += `<path d="M86 45.4Q95 48 103 51.6Q95 53 86.4 49.4Z" fill="${P.tongue}"/>`;
    s += shape('M84 31Q102 34 113 40Q115 44 110 44.6Q96 45 84 44Z', P.beak, P.beakLine, { sw: 2.4, pfx: 'pk', hi: ell(94, 36.6, 5, 1.2), hiOp: 0.7 });
  } else {
    s += shape('M84 31Q102 34 113 42Q115 46 110 47Q96 49 84 48Z', P.beak, P.beakLine, {
      sw: 2.4, pfx: 'pk', shade: 'M80 44L110 44L110 52L80 52Z', shadeFill: P.beakShade, hi: ell(94, 36.6, 5, 1.2), hiOp: 0.7,
    });
    // smile line along the beak
    s += line('M88 43.6Q98 44.6 106 43', P.beakLine, 1.5);
  }
  // head
  s += shape(circ(72, 38, 17), P.pip, P.pipLine, {
    pfx: 'ph', shade: 'M52 42Q66 56 92 46L92 60L52 60Z', shadeFill: P.pipShade, hi: ell(66, 26, 6, 3), hiOp: 0.5,
  });
  // cheek
  s += `<path d="${ell(80.5, 47, 4, 2.6)}" fill="${P.blush}" opacity="0.8"/>`;
  // eyes
  if (frame === 'cheer') {
    s += line('M70.5 37Q76 30 81.5 37', P.eyeDark, 3);
  } else {
    s += `<path d="${circ(76, 36, 6.8)}" fill="#fff" stroke="${P.pipLine}" stroke-width="1.4"/>`;
    s += `<path d="${circ(77.4, 36.6, 5)}" fill="${P.eyeDark}"/>`;
    s += `<path d="${circ(79, 34.2, 2.1)}" fill="#fff"/><path d="${circ(75.6, 39, 0.9)}" fill="#fff"/>`;
  }
  // little nostril
  s += `<path d="${circ(98, 37.6, 0.9)}" fill="${P.beakLine}"/>`;
  return s;
}
function pipGroup(frame) {
  _id = 0;
  const w = WINGS[frame === 'fly1' ? 'up' : frame === 'fly2' ? 'down' : 'cheer'];
  return [
    pipWing(w.far, 'far'),
    pipWing(w.near, 'near'),
    pipBody(),
    pipHead(frame),
  ].join('\n');
}
// note: near wing drawn behind the body too (both wings attach behind the round body)

// ================================================================= RING (catch drum)
function ringGroup() {
  let s = '';
  const c = 48;
  // drum side wall (front)
  s += shape(`M3 ${c}L3 ${c + 8}Q3 ${c + 38} 48 ${c + 38}Q93 ${c + 38} 93 ${c + 8}L93 ${c}Z`, P.woodShade, P.woodLine, {
    pfx: 'rw', sw: 3,
    inner: line(`M3 ${c + 20}Q48 ${c + 48} 93 ${c + 20}`, P.woodLine, 1.6, ' opacity="0.4"') +
      [16, 32, 48, 64, 80].map((x) => line(`M${x} ${c + 6}L${x + (x - 48) * 0.08} ${c + 40}`, P.lace, 1.6, ' opacity="0.7"')).join(''),
  });
  // rim (top ring) and skin
  s += `<path d="${ell(c, c, 45, 30)}" fill="${P.wood}" stroke="${P.woodLine}" stroke-width="3"/>`;
  s += `<path d="${ell(c, c + 2.5, 38, 25)}" fill="${P.woodShade}"/>`;
  s += `<path d="${ell(c, c, 37, 24)}" fill="${P.skin}" stroke="${P.woodLine}" stroke-width="2"/>`;
  s += `<path d="${ell(c + 2, c + 1, 29, 18)}" fill="#fbe8c4"/>`;
  s += `<path d="${ell(c + 3, c + 1.5, 20, 12.5)}" fill="${P.skinLight}"/>`;
  // lacing dots around the rim
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    s += `<path d="${circ(f(c + 41 * Math.cos(a)), f(c + 27 * Math.sin(a)), 1.8)}" fill="${P.lace}" stroke="${P.woodLine}" stroke-width="1"/>`;
  }
  // rim gloss
  s += line(`M12 38Q24 22 46 19.5`, '#fff', 2.2, ' opacity="0.65"');
  return s;
}

// ================================================================= HUD icons
function grooveGroup() {
  let s = '';
  // small hand drum (bongo), side view
  s += shape('M5 26Q7 42 18 48L16 58Q26 61 36 58L34 48Q45 42 47 26Z', P.wood, P.woodLine, {
    pfx: 'gv', shade: 'M28 18L52 18L52 64L28 64Z', shadeFill: P.woodShade,
    inner: line('M8 36Q26 44 44 36', P.lace, 2.2, ' opacity="0.9"') + line('M10 28L16 44M20 30L22 46M32 30L30 46M42 28L36 44', P.lace, 1.6, ' opacity="0.85"') +
      line('M16 52L36 52', P.woodLine, 1.6, ' opacity="0.5"'),
  });
  s += `<path d="${ell(26, 26, 21, 6.6)}" fill="${P.skin}" stroke="${P.woodLine}" stroke-width="2.6"/>`;
  s += `<path d="${ell(28, 25.4, 11, 3)}" fill="${P.skinLight}"/>`;
  // music note
  s += `<path d="${ell(46, 23, 5.6, 4.2)}" fill="${P.note}" stroke="${P.noteLine}" stroke-width="1.8" transform="rotate(-20 46 23)"/>`;
  s += limb('M50.6 22L50.6 5Q56 7 59 12', 2.8, P.note, P.noteLine, 1.4);
  return s;
}
function tapGroup(dir) {
  let s = '';
  s += shape('M6 22Q6 6 22 6L42 6Q58 6 58 22L58 42Q58 58 42 58L22 58Q6 58 6 42Z', P.leaf, P.leafLine, {
    pfx: 't' + dir, sw: 3, shade: 'M0 44Q32 50 64 44L64 64L0 64Z', shadeFill: P.leafShade,
    hi: 'M14 12Q20 10 32 10Q20 14 13 22Q11 16 14 12Z', hiOp: 0.55,
  });
  const ch = dir === 'up' ? 'M19 38L32 25L45 38' : 'M19 26L32 39L45 26';
  s += line(ch, P.leafLine, 12) + line(ch, '#ffffff', 7);
  return s;
}

// ================================================================= APP ICON
function iconSVG() {
  let s = '';
  s += `<path d="M0 0L256 0L256 256L0 256Z" fill="#ffe7a0"/>`; // full-bleed warm background
  let inner = '';
  inner += `<path d="M0 0L256 0L256 256L0 256Z" fill="#bfeaff"/>`;
  inner += `<path d="M-10 170Q60 120 130 158Q200 120 270 160L270 270L-10 270Z" fill="${P.valleyShade}"/>`;
  inner += `<path d="M-10 196Q80 160 160 190Q220 176 270 192L270 270L-10 270Z" fill="${P.valley}"/>`;
  inner += sparkle(40, 70, 7, '#fff') + sparkle(64, 40, 4.5, '#fff');
  // drum at Momo's stick tip
  const k = 2.0, tx = -12, ty = 34;
  const tipX = tx + 106 * k, tipY = ty + 76 * k;
  const rs = 0.82;
  inner += `<g transform="translate(${f(tipX - 14 - 48 * rs)} ${f(tipY + 10 - 48 * rs)}) scale(${rs})">${ringGroup()}</g>`;
  inner += `<g transform="translate(${tx} ${ty}) scale(${k})">${momoGroup('reach')}</g>`;
  // gem bouncing above the drum + motion arc
  inner += line(`M${f(tipX + 4)} ${f(tipY - 22)}Q${f(tipX + 14)} ${f(tipY - 64)} ${f(tipX + 4)} ${f(tipY - 82)}`, '#fff', 4, ' stroke-dasharray="2 9" opacity="0.9"');
  inner += `<g transform="translate(${f(tipX - 36)} ${f(tipY - 150)}) scale(1.1)">${gemGroup(GEM_TEAL, P.gLine, '#fff')}</g>`;
  s += `<clipPath id="badge"><path d="${circ(128, 128, 118)}"/></clipPath><g clip-path="url(#badge)">${inner}</g>`;
  s += `<path d="${circ(128, 128, 120)}" fill="none" stroke="${P.valleyLine}" stroke-width="8"/>`;
  return svg(256, 256, s);
}

// ================================================================= WRITE
const files = {
  'momo_idle.svg': momoSVG('idle'),
  'momo_reach.svg': momoSVG('reach'),
  'momo_happy.svg': momoSVG('happy'),
  'momo_dizzy.svg': momoSVG('dizzy'),
  'swing.svg': svg(120, 40, swingGroup()),
  'gem.svg': svg(64, 64, gemGroup(GEM_TEAL, P.gLine, '#fff')),
  'gem_gold.svg': svg(64, 64, gemGroup(GEM_RAIN, P.rLine, '#fff',
    sparkle(10, 10, 5.5, '#fff', P.rLine, 1.4) + sparkle(56, 50, 4, '#fff', P.rLine, 1.2))),
  'pip_fly1.svg': svg(120, 100, pipGroup('fly1')),
  'pip_fly2.svg': svg(120, 100, pipGroup('fly2')),
  'pip_cheer.svg': svg(120, 100, pipGroup('cheer')),
  'ring.svg': svg(96, 96, ringGroup()),
  'groove.svg': svg(64, 64, grooveGroup()),
  'tap_up.svg': svg(64, 64, tapGroup('up')),
  'tap_down.svg': svg(64, 64, tapGroup('down')),
  'icon.svg': iconSVG(),
};
if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, txt] of Object.entries(files)) {
    if (/<text|<script|<image|href=|@import|font|<filter/i.test(txt)) throw new Error('forbidden content in ' + name);
    fs.writeFileSync(path.join(OUT, name), txt);
  }
  console.log('wrote', Object.keys(files).length, 'files to', OUT);
}
module.exports = { files, P };
