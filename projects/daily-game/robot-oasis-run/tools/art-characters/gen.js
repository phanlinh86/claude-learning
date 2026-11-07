// Generates Pebble's Oasis Run character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
// Contract: docs/DESIGN.md §3 (style) and §4.1 (files, viewBoxes, anchors).
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const f1 = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;
const pt = (cx, cy, r, deg) => [f1(cx + r * Math.cos(rad(deg))), f1(cy + r * Math.sin(rad(deg)))];
const files = [];
const write = (name, s) => { fs.writeFileSync(path.join(OUT, name), s); files.push(name); };
const E = (cx, cy, rx, ry, a = '') => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" ${a}/>`;
const Ci = (cx, cy, r, a = '') => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" ${a}/>`;
const P = (d, a = '') => `<path d="${d}" ${a}/>`;
const poly = p => 'M' + p.map(q => q.map(f1).join(',')).join(' L') + ' Z';
const line = p => 'M' + p.map(q => q.map(f1).join(',')).join(' L');
// smooth closed path through points (Catmull-Rom → cubic Bézier)
function smooth(p, closed = true) {
  const n = p.length, g = i => p[(i + n) % n];
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = closed ? g(i - 1) : p[Math.max(0, i - 1)], p1 = g(i), p2 = g(i + 1), p3 = closed ? g(i + 2) : p[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? ' Z' : '');
}
function sparkle(x, y, s, c = '#ffffff', k = 0.22) {
  const a = s * k;
  return `<path d="M${f1(x)},${f1(y - s)} Q${f1(x + a)},${f1(y - a)} ${f1(x + s)},${f1(y)} Q${f1(x + a)},${f1(y + a)} ${f1(x)},${f1(y + s)} ` +
    `Q${f1(x - a)},${f1(y + a)} ${f1(x - s)},${f1(y)} Q${f1(x - a)},${f1(y - a)} ${f1(x)},${f1(y - s)} Z" fill="${c}"/>`;
}
function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < n * 2; i++) p.push(pt(cx, cy, i % 2 ? ri : ro, rot + i * 180 / n));
  return p;
}
// deterministic PRNG (mulberry32) for the tumbleweed twigs
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// "union outline" helper: draw every shape thick in the line colour first, then all fills on top
const outlined = (shapes, line, w = 6) => shapes.map(s => s.replace('/>', ` fill="${line}" stroke="${line}" stroke-width="${w}" ${R}/>`)).join('');

/* ================================ PALETTE ================================ */
const PB = {
  body: '#f3dfb8', shade: '#d9bb86', line: '#6b4a2b', hi: '#fffaf0', teal: '#2ec4b6', tealD: '#1a8f84', tealL: '#a8f0e8',
  red: '#ff5a5f', redD: '#c23c45', redL: '#ff9a9c', eye: '#2b2440', blush: '#ff9fa8', star: '#ffd23f', starD: '#c98f12',
  panel: '#e8cd9a', pad: '#2ec4b6',
};

/* ================================ PEBBLE ================================ */
// Seen from behind, slightly from above. All frames share the head (64,40 rx30 ry25) and torso (64,78 rx40 ry28)
// geometry; bob is a translate of the upper group. Feet line y=120.
const HEAD = [64, 37, 30, 25];
const TORSO = [64, 83, 40, 25];

function ear(x, y, a, tipTeal = true) {
  // a floppy-but-mechanical ear: rounded panel hanging from a rivet at (0,0), local +y = down the ear
  const d = 'M-8,-1 C-12,9 -11,22 0,27 C11,22 12,9 8,-1 C5,-4 -5,-4 -8,-1 Z';
  const tip = 'M-10.6,15 C-9,23 -4,26.5 0,27 C4,26.5 9,23 10.6,15 C4,18.5 -4,18.5 -10.6,15 Z';
  return `<g transform="translate(${x},${y}) rotate(${a})">` +
    P(d, `fill="${PB.body}" stroke="${PB.line}" stroke-width="3" ${R}`) +
    P('M5.5,2 C8.5,10 8,19 2,24', `fill="none" stroke="${PB.shade}" stroke-width="3" ${R}`) +
    (tipTeal ? P(tip, `fill="${PB.teal}" stroke="${PB.line}" stroke-width="2.4" ${R}`) : '') +
    Ci(0, 3.5, 2.6, `fill="${PB.panel}" stroke="${PB.line}" stroke-width="1.8"`) + `</g>`;
}
function coil(base, tip, loops = 3.5, amp = 4.6) {
  // a springy coil tail from base to tip: a looping path drawn as a dark stroke + cream stroke, teal bulb at the tip
  const [bx, by] = base, [tx, ty] = tip;
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const pts = [];
  const N = 70;
  for (let i = 0; i <= N; i++) {
    const t = i / N, ph = t * loops * Math.PI * 2;
    const a = amp * (1 - 0.25 * t);
    const along = t * L - Math.cos(ph) * a * 0.55 + a * 0.55;
    const side = Math.sin(ph) * a;
    pts.push([bx + ux * along * (L / (L + a * 1.1)) + nx * side, by + uy * along * (L / (L + a * 1.1)) + ny * side]);
  }
  const d = line(pts);
  return P(d, `fill="none" stroke="${PB.line}" stroke-width="7.4" ${R}`) + P(d, `fill="none" stroke="${PB.body}" stroke-width="3.6" ${R}`) +
    Ci(tx, ty, 5.6, `fill="${PB.teal}" stroke="${PB.line}" stroke-width="2.6"`) + Ci(tx - 1.8, ty - 1.8, 1.7, `fill="${PB.tealL}"`);
}
function pawBack(x, footY, w = 1) {
  // a rear/front leg seen from behind with the back of the paw (planted)
  const top = 90;
  return P(`M${x - 7 * w},${top} L${x - 7.5 * w},${footY - 8} L${x + 7.5 * w},${footY - 8} L${x + 7 * w},${top} Z`, `fill="${PB.body}" stroke="${PB.line}" stroke-width="3" ${R}`) +
    E(x, footY - 6, 10 * w, 6.4 * w, `fill="${PB.body}" stroke="${PB.line}" stroke-width="3"`) +
    P(`M${x + 4 * w},${footY - 9} Q${x + 7 * w},${footY - 6} ${x + 5 * w},${footY - 3}`, `fill="none" stroke="${PB.shade}" stroke-width="2.4" ${R}`);
}
function pawSole(x, y, s = 1, rot = 0) {
  // a kicked-back paw showing its teal pads to the camera
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})">` +
    E(0, 0, 10.5, 9, `fill="${PB.body}" stroke="${PB.line}" stroke-width="3"`) +
    E(0, 2.4, 5, 4, `fill="${PB.pad}" stroke="${PB.tealD}" stroke-width="1.4"`) +
    Ci(-5.6, -3.6, 2.1, `fill="${PB.pad}"`) + Ci(0, -5.4, 2.1, `fill="${PB.pad}"`) + Ci(5.6, -3.6, 2.1, `fill="${PB.pad}"`) + `</g>`;
}
function legStub(x, y1, x2, y2) {
  // short leg linking body to a kicked sole (drawn under the sole)
  return P(`M${x},${y1} L${x2},${y2}`, `fill="none" stroke="${PB.line}" stroke-width="16" ${R}`) + P(`M${x},${y1} L${x2},${y2}`, `fill="none" stroke="${PB.body}" stroke-width="10" ${R}`);
}
function scarfTails(ph) {
  // two scarf tails flapping out to the left from the knot at (36,60); ph = flap phase 0..3
  const w = [0, 3, -1, 2][ph % 4];
  const a = `M38,58 C28,56 18,${57 + w} 9,${55 + w} C12,${61 + w} 13,${64 + w} 10,${69 + w} C20,${68 + w} 30,66 38,63 Z`;
  const b = `M37,62 C30,66 22,${73 - w} 15,${78 - w} C20,${80 - w} 22,${83 - w} 22,${88 - w} C29,${82 - w} 34,73 39,65 Z`;
  return P(b, `fill="${PB.redD}" stroke="${PB.line}" stroke-width="2.8" ${R}`) + P(a, `fill="${PB.red}" stroke="${PB.line}" stroke-width="2.8" ${R}`) +
    P(`M33,59.5 C26,59 19,${59.5 + w} 13,${58.5 + w}`, `fill="none" stroke="${PB.redL}" stroke-width="1.8" ${R}`);
}
function scarfBand() {
  // the band sits on the torso's top edge (where the neck is), knot on the left side of the neck
  const d = 'M30,70 Q64,48 98,70';
  return P(d, `fill="none" stroke="${PB.line}" stroke-width="12.5" ${R}`) + P(d, `fill="none" stroke="${PB.red}" stroke-width="7.4" ${R}`) +
    P('M46,61.5 Q64,54.5 82,61.5', `fill="none" stroke="${PB.redL}" stroke-width="2" ${R}`) +
    // white polka dots on the band
    Ci(54, 60.4, 1.5, 'fill="#fff4f0"') + Ci(74, 60.4, 1.5, 'fill="#fff4f0"') + Ci(89, 64.4, 1.4, 'fill="#fff4f0"') +
    E(38, 64, 7, 6, `fill="${PB.red}" stroke="${PB.line}" stroke-width="2.8"`) + E(36.4, 62.1, 2.4, 1.6, `fill="${PB.redL}"`);
}
function headShapes(face) {
  const s = [E(...HEAD)];
  if (face) s.push(E(94, 45, 11, 9)); // cheek/muzzle peeking past the right side of the head (head turned)
  return s;
}
function head(face, id) {
  const shapes = headShapes(face);
  const clip = `<clipPath id="${id}h">${shapes.join('')}</clipPath>`;
  let s = `<defs>${clip}</defs>` + outlined(shapes, PB.line, 6);
  s += `<g clip-path="url(#${id}h)"><rect width="128" height="128" fill="${PB.shade}"/>` +
    E(HEAD[0] - 4, HEAD[1] - 4.5, HEAD[2] - 2, HEAD[3] - 2.5, `fill="${PB.body}"`) + (face ? E(92, 42.5, 10, 8, `fill="${PB.body}"`) : '') +
    // helmet seam across the back of the head + two rivets
    P('M40,42 Q64,28 88,42', `fill="none" stroke="${PB.shade}" stroke-width="2.6" ${R}`) + `</g>` +
    Ci(46, 37.6, 1.8, `fill="${PB.panel}" stroke="${PB.line}" stroke-width="1.4"`) + Ci(82, 37.6, 1.8, `fill="${PB.panel}" stroke="${PB.line}" stroke-width="1.4"`) +
    E(50, 22, 8, 4.6, `transform="rotate(-24 50 22)" fill="${PB.hi}"`);
  s += '<g transform="translate(3,-2)">';
  if (face === 'ouch') {
    s += P('M80,36 L86,40 L80,44', `fill="none" stroke="${PB.eye}" stroke-width="2.8" ${R}`) +
      E(93, 50, 3, 2, `fill="${PB.blush}"`) + P('M95,44 Q98,43 99.5,45', `fill="none" stroke="${PB.line}" stroke-width="2" ${R}`);
  } else if (face === 'happy') {
    s += P('M78.5,41 Q83,34.5 87.5,41', `fill="none" stroke="${PB.eye}" stroke-width="3" ${R}`) +
      E(91, 52, 3.2, 2.2, `fill="${PB.blush}"`) + Ci(99.2, 44.6, 2, `fill="${PB.eye}"`) +
      P('M89,49 Q94,54.5 99,49.5', `fill="${PB.eye}" stroke="${PB.eye}" stroke-width="1.6" ${R}`);
  }
  s += '</g>';
  return s;
}
function antenna(lean = 0) {
  const tx = 68 + lean, ty = 6.5;
  return P(`M64,13 Q65,10 ${tx},${ty + 3}`, `fill="none" stroke="${PB.line}" stroke-width="5.4" ${R}`) +
    P(`M64,13 Q65,10 ${tx},${ty + 3}`, `fill="none" stroke="${PB.panel}" stroke-width="2.2" ${R}`) +
    Ci(tx, ty, 4.8, `fill="${PB.teal}" stroke="${PB.line}" stroke-width="2.6"`) + Ci(tx - 1.6, ty - 1.6, 1.5, `fill="${PB.tealL}"`);
}
function torso(id) {
  const clip = `<clipPath id="${id}t">${E(...TORSO)}</clipPath>`;
  return `<defs>${clip}</defs>` + E(...TORSO, `fill="${PB.line}" stroke="${PB.line}" stroke-width="6"`) +
    `<g clip-path="url(#${id}t)"><rect width="128" height="128" fill="${PB.shade}"/>` + E(TORSO[0] - 5, TORSO[1] - 6, TORSO[2] - 3, TORSO[3] - 4, `fill="${PB.body}"`) + `</g>` +
    // spine seam (a gentle line down the back) + side seams
    P('M64,84 L64,96', `fill="none" stroke="${PB.shade}" stroke-width="2.4" ${R}`) +
    E(42, 75, 6, 3.4, `transform="rotate(-28 42 75)" fill="${PB.hi}"`);
}
function hatch() {
  return `<rect x="51" y="70" width="26" height="16" rx="5" fill="${PB.panel}" stroke="${PB.line}" stroke-width="2.6"/>` +
    P('M54,83 L74,83', `fill="none" stroke="${PB.shade}" stroke-width="2" ${R}`) +
    Ci(55.2, 73.6, 1.4, `fill="${PB.line}"`) + Ci(72.8, 73.6, 1.4, `fill="${PB.line}"`) + Ci(55.2, 80, 1.4, `fill="${PB.line}"`) +
    Ci(64, 77, 3.1, `fill="${PB.teal}" stroke="${PB.tealD}" stroke-width="1.4"`) + Ci(63.1, 76.1, 1, `fill="${PB.tealL}"`) +
    `<rect x="69.5" y="77.6" width="5" height="3.4" rx="1.2" fill="${PB.red}"/>`;
}

// frame specs. legs: rl/rr rear (x 46 / 82), fl/fr front far legs (x 33 / 95).
// value: number = planted foot y; {sole:[x,y,rot]} = kicked back toward the camera
function pebble(o) {
  const id = o.id;
  const b = o.bob || 0;
  let back = '', front = '';
  const legs = o.legs;
  const doLeg = (k, x, w) => {
    const v = legs[k];
    if (v == null) return;
    if (typeof v === 'number') back += pawBack(x, v, w);
    else {
      if (v.hidden) return;
      front += legStub(x, 98 + b, v.sole[0], v.sole[1]) + pawSole(v.sole[0], v.sole[1], v.s || 1, v.sole[2] || 0);
    }
  };
  // far front legs first (thinner/smaller: further away)
  doLeg('fl', 33, 0.8); doLeg('fr', 95, 0.8);
  doLeg('rl', 46, 1); doLeg('rr', 82, 1);
  let up = antenna(o.antLean || 0) + head(o.face, id) + torso(id) + ear(36, 30, o.ears[0]) + ear(92, 30, o.ears[1]) +
    scarfTails(o.scarf || 0) + scarfBand() + hatch();
  if (o.wave) {
    // waving front paw raised at the right side
    up += legStub(98, 76, 110, 56) + pawSole(111, 52, 0.95, 18) +
      P('M118,38 Q124,44 123,52', `fill="none" stroke="${PB.line}" stroke-width="2.4" ${R} opacity="0.75"`) +
      P('M122,32 Q130,40 129,51', `fill="none" stroke="${PB.line}" stroke-width="2.4" ${R} opacity="0.5"`);
  }
  up += coil([64, 101], o.tail, o.tailLoops || 3.5);
  if (o.star) up += P(poly(starPts(104, 16, 9, 4.2, 5, -80)), `fill="${PB.star}" stroke="${PB.starD}" stroke-width="2.2" ${R}`) + sparkle(116, 30, 4.2, '#fff6c8') + sparkle(90, 8, 3.2, '#fff6c8');
  if (o.ouchLines) up += P('M22,22 L15,17 M20,32 L12,31', `fill="none" stroke="${PB.line}" stroke-width="2.6" ${R} opacity="0.7"`);
  return svg(128, 128, back + `<g transform="translate(0,${b})">${up}</g>` + front);
}

const RUN = [
  { bob: 0, legs: { fl: { hidden: 1 }, fr: 113, rl: 120, rr: { sole: [84, 108, -8] } }, tail: [100, 86], ears: [36, -28], scarf: 0 },
  { bob: -2, legs: { fl: 113, fr: 112, rl: 119, rr: 117 }, tail: [94, 78], ears: [26, -24], scarf: 1, antLean: -1.5 },
  { bob: 0, legs: { fl: 113, fr: { hidden: 1 }, rl: { sole: [44, 108, 8] }, rr: 120 }, tail: [28, 86], ears: [28, -36], scarf: 2 },
  { bob: -2, legs: { fl: 112, fr: 113, rl: 117, rr: 119 }, tail: [34, 78], ears: [24, -26], scarf: 3, antLean: 1.5 },
];
RUN.forEach((f, i) => write(`pebble_${i}.svg`, pebble({ ...f, id: 'p' + i })));
write('pebble_jump.svg', pebble({ id: 'pj', bob: 0, legs: { fl: { hidden: 1 }, fr: { hidden: 1 }, rl: { sole: [42, 104, 14], s: 0.95 }, rr: { sole: [86, 104, -14], s: 0.95 } },
  tail: [66, 58], tailLoops: 4, ears: [152, -152], scarf: 1, antLean: 0 }));
write('pebble_ouch.svg', pebble({ id: 'po', bob: 0, face: 'ouch', legs: { fl: 114, fr: 114, rl: 120, rr: 119 }, tail: [100, 96], tailLoops: 3, ears: [62, -84], scarf: 2, star: 1, ouchLines: 1, antLean: 4 }));
write('pebble_happy.svg', pebble({ id: 'ph', bob: -1, face: 'happy', wave: 1, legs: { fl: 113, rl: 120, rr: 120 }, tail: [34, 80], ears: [30, -78], scarf: 1, antLean: -2 }));

/* ================================ SHELLS ================================ */
function scallop(o = {}) {
  const C = { f: '#ff8fb1', s: '#ec6a95', l: '#b13c68', hi: '#ffe3ec' };
  const H = [32, 52];
  const A0 = -160, A1 = -20, NR = 7; // rib directions (degrees)
  const rim = (deg, k = 1) => [H[0] + 29 * k * Math.cos(rad(deg)), H[1] + 41 * k * Math.sin(rad(deg))];
  let d = `M${H[0] - 6},${H[1] + 2}`;
  const start = rim(A0);
  d += ` L${f1(start[0])},${f1(start[1])}`;
  for (let i = 0; i < NR; i++) {
    const a = A0 + (A1 - A0) * i / NR, b2 = A0 + (A1 - A0) * (i + 1) / NR, m = (a + b2) / 2;
    const c = rim(m, 1.09), e = rim(b2);
    d += ` Q${f1(c[0])},${f1(c[1])} ${f1(e[0])},${f1(e[1])}`;
  }
  d += ` L${H[0] + 6},${H[1] + 2} Z`;
  const ears = `M${H[0] - 6},${H[1] + 1} L${H[0] - 15},${H[1] + 1} Q${H[0] - 16},${H[1] + 7} ${H[0] - 10},${H[1] + 8} L${H[0] + 10},${H[1] + 8} Q${H[0] + 16},${H[1] + 7} ${H[0] + 15},${H[1] + 1} L${H[0] + 6},${H[1] + 1} Z`;
  let s = `<defs><clipPath id="sc${o.id || ''}"><path d="${d}"/></clipPath></defs>`;
  s += P(ears, `fill="${C.s}" stroke="${C.l}" stroke-width="3" ${R}`);
  s += P(d, `fill="${C.f}" stroke="${C.l}" stroke-width="3" ${R}`);
  // cel shade: the right-most ribs a step darker
  s += `<g clip-path="url(#sc${o.id || ''})">` + P(`M${H[0]},${H[1]} L${f1(rim(-50, 1.3)[0])},${f1(rim(-50, 1.3)[1])} L64,64 Z`, `fill="${C.s}"`) + `</g>`;
  for (let i = 1; i < NR; i++) {
    const a = A0 + (A1 - A0) * i / NR, e = rim(a, 0.97), m = rim(a, 0.3);
    s += P(`M${f1(m[0])},${f1(m[1])} L${f1(e[0])},${f1(e[1])}`, `fill="none" stroke="${C.l}" stroke-width="1.8" ${R} opacity="0.7"`);
  }
  s += E(H[0] - 9, H[1] - 26, 5, 8, `transform="rotate(-24 ${H[0] - 9} ${H[1] - 26})" fill="${C.hi}"`) + Ci(H[0] - 4, H[1] - 33, 1.8, 'fill="#ffffff"');
  return s;
}
function conch() {
  const C = { f: '#ffb067', s: '#ee8a3c', l: '#a8571f', in: '#ffe2c6', inS: '#ffb7a0', hi: '#fff0dc' };
  const body = smooth([[32, 8], [38, 17], [50, 24], [54, 33], [47, 44], [38, 54], [32, 61], [27, 54], [17, 43], [11, 32], [15, 23], [26, 17]]);
  let s = `<defs><clipPath id="cc"><path d="${body}"/></clipPath></defs>` + P(body, `fill="${C.f}" stroke="${C.l}" stroke-width="3" ${R}`);
  s += `<g clip-path="url(#cc)">` + P('M38,0 C58,20 58,44 30,66 L64,66 L64,0 Z', `fill="${C.s}"`) +
    // spire whorl lines
    P('M23,19 Q32,24 41,19', `fill="none" stroke="${C.l}" stroke-width="2" ${R}`) + P('M27,13.5 Q32,16.5 37,13.5', `fill="none" stroke="${C.l}" stroke-width="1.8" ${R}`) +
    // spiral body bands
    P('M12,31 Q30,40 53,30', `fill="none" stroke="${C.l}" stroke-width="1.8" ${R} opacity="0.55"`) + `</g>`;
  // shoulder knobs
  [[16, 26], [25, 22.5], [39, 22.5], [48, 26]].forEach(([x, y]) => s += Ci(x, y, 2.7, `fill="${C.hi}" stroke="${C.l}" stroke-width="1.6"`));
  // aperture (pearly opening) on the front right
  s += P('M34,34 C44,33 47,42 41,50 C38,54 34,57 32,58 C31,50 29,40 34,34 Z', `fill="${C.in}" stroke="${C.l}" stroke-width="2.4" ${R}`) +
    P('M36,39 C41,40 42,45 38,50', `fill="none" stroke="${C.inS}" stroke-width="2.4" ${R}`);
  s += E(21, 38, 3.4, 7, `transform="rotate(20 21 38)" fill="${C.hi}"`) + Ci(24, 29.5, 1.6, 'fill="#ffffff"');
  return s;
}
function cowrie() {
  const C = { f: '#b9a3ff', s: '#9a82f0', l: '#5f47b8', hi: '#efe9ff', slit: '#5f47b8', teeth: '#ffffff', spot: '#e3dbff' };
  let s = `<defs><clipPath id="cw">${E(32, 34, 19.5, 25.5)}</clipPath></defs>` + E(32, 34, 19.5, 25.5, `fill="${C.f}" stroke="${C.l}" stroke-width="3"`);
  s += `<g clip-path="url(#cw)">` + E(40, 42, 19, 25, `fill="${C.s}"`) + E(28, 30, 17, 24, `fill="${C.f}"`) + `</g>`;
  [[20, 22], [17, 33], [21, 46], [44, 27], [46, 40], [41, 52], [24, 56]].forEach(([x, y], i) => s += Ci(x, y, i % 2 ? 1.6 : 2.1, `fill="${C.spot}"`));
  // the toothed slit down the front
  s += P('M33,12 C29,24 36,40 31,57', `fill="none" stroke="${C.l}" stroke-width="5.2" ${R}`);
  for (let i = 0; i < 7; i++) {
    const t = 0.1 + i * 0.13, y = 12 + 45 * t, x = 33 + Math.sin(t * Math.PI * 1.8) * 2.5 - t * 2;
    s += P(`M${f1(x - 4.4)},${f1(y)} L${f1(x - 1.4)},${f1(y)} M${f1(x + 1.4)},${f1(y + 1)} L${f1(x + 4.4)},${f1(y + 1)}`, `fill="none" stroke="${C.l}" stroke-width="1.8" ${R}`);
  }
  s += E(23, 23, 4, 8, `transform="rotate(18 23 23)" fill="${C.hi}"`) + Ci(27, 15.5, 1.8, 'fill="#ffffff"');
  return s;
}
const shellSpark = (x, y) => sparkle(x, y, 5.2, '#ffffff', 0.2);
write('shell_0.svg', svg(64, 64, scallop({ id: '0' }) + shellSpark(52, 14)));
write('shell_1.svg', svg(64, 64, conch() + shellSpark(54, 12)));
write('shell_2.svg', svg(64, 64, cowrie() + shellSpark(53, 13)));

/* ================================ OBSTACLES ================================ */
const POT = { f: '#c8643b', s: '#9e4a2a', l: '#5e2a14', band: '#f6e1b8', bandS: '#e2c48f', hi: '#e58a5e', rim: '#d97448' };
function pot(cx, base, w, h, tilt, id, lid) {
  // a round clay pot: belly + short neck + rolled rim; local origin at the base centre
  const hw = w / 2, rimW = w * 0.34, neckY = -h * 0.84;
  const bodyD = `M${-hw * 0.38},0 C${-hw * 1.08},${-h * 0.05} ${-hw * 1.12},${-h * 0.72} ${-rimW * 0.92},${neckY} L${rimW * 0.92},${neckY} C${hw * 1.12},${-h * 0.72} ${hw * 1.08},${-h * 0.05} ${hw * 0.38},0 Z`;
  let s = `<g transform="translate(${cx},${base}) rotate(${tilt})"><defs><clipPath id="pt${id}"><path d="${bodyD}"/></clipPath></defs>`;
  s += P(bodyD, `fill="${POT.f}" stroke="${POT.l}" stroke-width="3" ${R}`);
  s += `<g clip-path="url(#pt${id})">` + E(hw * 0.62, -h * 0.4, hw * 0.62, h * 0.75, `fill="${POT.s}"`) +
    // painted band with a zigzag
    `<rect x="${-hw * 1.2}" y="${f1(-h * 0.56)}" width="${w * 1.2}" height="${f1(h * 0.17)}" fill="${POT.band}"/>` +
    P(line(Array.from({ length: 13 }, (_, i) => [-hw + i * w / 12, -h * 0.56 + (i % 2 ? h * 0.17 : 0)])), `fill="none" stroke="${POT.f}" stroke-width="2.4" ${R}`) +
    `<rect x="${hw * 0.2}" y="${f1(-h * 0.56)}" width="${hw}" height="${f1(h * 0.17)}" fill="${POT.s}" opacity="0.35"/>` + `</g>` +
    P(`M${-hw * 1.02},${f1(-h * 0.56)} L${hw * 1.02},${f1(-h * 0.56)} M${-hw * 1.01},${f1(-h * 0.39)} L${hw * 1.01},${f1(-h * 0.39)}`, `fill="none" stroke="${POT.l}" stroke-width="1.6" opacity="0.6"`) +
    P(bodyD, `fill="none" stroke="${POT.l}" stroke-width="3" ${R}`);
  // rim
  s += `<rect x="${f1(-rimW - 3)}" y="${f1(neckY - 7)}" width="${f1(rimW * 2 + 6)}" height="9" rx="4.5" fill="${POT.rim}" stroke="${POT.l}" stroke-width="3"/>`;
  s += E(-hw * 0.5, -h * 0.68, hw * 0.13, h * 0.12, `transform="rotate(20 ${f1(-hw * 0.5)} ${f1(-h * 0.68)})" fill="${POT.hi}"`);
  if (lid) {
    s += P(`M${f1(-rimW - 1)},${f1(neckY - 6)} Q0,${f1(neckY - 22)} ${f1(rimW + 1)},${f1(neckY - 6)} Z`, `fill="${POT.f}" stroke="${POT.l}" stroke-width="3" ${R}`) +
      P(`M${f1(rimW * 0.2)},${f1(neckY - 13)} Q${f1(rimW * 0.7)},${f1(neckY - 10)} ${f1(rimW + 1)},${f1(neckY - 6)}`, `fill="none" stroke="${POT.s}" stroke-width="3" ${R}`) +
      Ci(0, neckY - 19, 4.4, `fill="${POT.rim}" stroke="${POT.l}" stroke-width="2.6"`);
  }
  return s + '</g>';
}
write('pots.svg', svg(128, 160,
  E(64, 153, 46, 5, `fill="${POT.l}" opacity="0.25"`) +
  pot(64, 154, 100, 64, 0, 'a') + pot(61, 101, 78, 50, -5, 'b') + pot(67, 58, 56, 36, 6, 'c', true)));

function logSvg() {
  const C = { f: '#8a5a3a', s: '#6c4228', l: '#432612', end: '#e2b47a', ring: '#b07a45', endS: '#c8955c', hi: '#ac7a54', leaf: '#6fbf5a', leafS: '#4f9a3f', leafL: '#2e6526' };
  const top = 22, bot = 73, x0 = 24, x1 = 144, r = (bot - top) / 2;
  const bodyD = `M${x0},${top} L${x1},${top} Q${x1 + 13},${top} ${x1 + 13},${top + r} Q${x1 + 13},${bot} ${x1},${bot} L${x0},${bot} Z`;
  let s = `<defs><clipPath id="lg"><path d="${bodyD}"/></clipPath></defs>`;
  // fronds behind the log (sticking up from its top)
  const frond = (x, y, a, len, flip) => {
    const pts = [];
    let d = `M0,0 Q${len * 0.5},${-len * 0.18 * flip} ${len},${-len * 0.05 * flip}`;
    let lv = '';
    for (let i = 1; i <= 5; i++) {
      const t = i / 6, px = len * t, py = -len * 0.12 * flip * Math.sin(t * Math.PI) * 1.2;
      lv += P(`M${f1(px)},${f1(py)} Q${f1(px + 5)},${f1(py - 9)} ${f1(px + 9)},${f1(py - 14 + t * 6)}`, `fill="none" stroke="${C.leafL}" stroke-width="6.4" ${R}`) +
        P(`M${f1(px)},${f1(py)} Q${f1(px + 5)},${f1(py - 9)} ${f1(px + 9)},${f1(py - 14 + t * 6)}`, `fill="none" stroke="${C.leaf}" stroke-width="3" ${R}`);
    }
    return `<g transform="translate(${x},${y}) rotate(${a})">` + lv + P(d, `fill="none" stroke="${C.leafL}" stroke-width="5.4" ${R}`) + P(d, `fill="none" stroke="${C.leafS}" stroke-width="2.4" ${R}`) + '</g>';
  };
  s += frond(98, 26, -62, 30, 1) + frond(112, 25, -34, 30, -1) + frond(76, 26, -112, 22, -1);
  s += P(bodyD, `fill="${C.f}" stroke="${C.l}" stroke-width="3" ${R}`);
  s += `<g clip-path="url(#lg)"><rect x="0" y="${top + r + 6}" width="160" height="40" fill="${C.s}"/>`;
  // palm bark: stacked crescent scales
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
    const x = x0 + 8 + i * 14 + (row % 2) * 7, y = top + 9 + row * 15;
    s += P(`M${x - 6},${y} Q${x},${y + 6} ${x + 6},${y}`, `fill="none" stroke="${C.l}" stroke-width="1.8" ${R} opacity="0.55"`);
  }
  s += `<rect x="${x0}" y="${top + 4}" width="${x1 - x0}" height="5" rx="2.5" fill="${C.hi}" opacity="0.8"/></g>`;
  s += P(bodyD, `fill="none" stroke="${C.l}" stroke-width="3" ${R}`);
  // ring end (cut face) on the left
  s += E(x0, top + r, 12.5, r, `fill="${C.end}" stroke="${C.l}" stroke-width="3"`) +
    E(x0 + 2.5, top + r + 4, 9, r - 6, `fill="${C.endS}" opacity="0.6"`) +
    E(x0, top + r, 8.5, r - 8, `fill="none" stroke="${C.ring}" stroke-width="1.8"`) + E(x0, top + r, 4.5, r - 16, `fill="none" stroke="${C.ring}" stroke-width="1.8"`) +
    Ci(x0, top + r, 1.6, `fill="${C.ring}"`);
  // a tiny mushroom-free knot and a pebble at the base
  s += E(104, 54, 6, 4, `fill="${C.s}" stroke="${C.l}" stroke-width="2"`) + E(104, 53, 2.6, 1.6, `fill="${C.l}"`);
  return E(86, 73, 70, 4, `fill="${C.l}" opacity="0.22"`) + s;
}
write('log.svg', svg(160, 80, logSvg()));

function tumble() {
  const C = { base: '#c9a86c', f: '#a7844f', s: '#6e5128', l: '#523a1a', hi: '#e6cb94' };
  const r = rng(20261107);
  let s = Ci(48, 48, 38, `fill="${C.base}" opacity="0.55"`);
  // bumpy outline of twig ends
  const outer = [];
  for (let i = 0; i < 22; i++) { const a = i * 360 / 22 + r() * 6, rr = 38 + r() * 4.5; outer.push(pt(48, 48, rr, a)); }
  s += P(smooth(outer), `fill="none" stroke="${C.l}" stroke-width="3.2" ${R}`);
  // curly twigs (3 tones) – arcs inside the ball
  const arcs = (n, col, w, rad0) => {
    let o = '';
    for (let i = 0; i < n; i++) {
      const a = r() * 360, d = r() * rad0, [cx, cy] = pt(48, 48, d, a);
      const rr = 8 + r() * 14, a0 = r() * 360, sweep = 120 + r() * 160;
      const p1 = pt(cx, cy, rr, a0), p2 = pt(cx, cy, rr, a0 + sweep);
      const inside = q => Math.hypot(q[0] - 48, q[1] - 48) < 40;
      if (!inside(p1) || !inside(p2)) { i--; continue; }
      o += `<path d="M${p1[0]},${p1[1]} A${f1(rr)},${f1(rr)} 0 ${sweep > 180 ? 1 : 0} 1 ${p2[0]},${p2[1]}" fill="none" stroke="${col}" stroke-width="${w}" ${R}/>`;
    }
    return o;
  };
  s += `<defs><clipPath id="tw">${Ci(48, 48, 40.5)}</clipPath></defs><g clip-path="url(#tw)">` +
    arcs(20, C.s, 3.2, 30) + arcs(18, C.f, 3.2, 32) + arcs(9, C.hi, 2.2, 26) + `</g>`;
  // a few twig spikes poking out (silhouette readability)
  for (let i = 0; i < 9; i++) {
    const a = i * 40 + 12, p1 = pt(48, 48, 37, a), p2 = pt(48, 48, 44.5, a + 8);
    s += P(`M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`, `fill="none" stroke="${C.l}" stroke-width="3" ${R}`);
  }
  return s;
}
write('tumble.svg', svg(96, 96, tumble()));

const PIL = { f: '#fff6e8', s: '#ead9bf', l: '#9a7a5a', stripe: '#c9b6ff', stripeS: '#a994ee', tas: '#a8e6cf', tasS: '#6cc4a4', tasL: '#3f8a6e' };
function pillowShape() {
  return 'M20,16 Q64,6 108,16 Q120,50 108,84 Q64,92 20,84 Q8,50 20,16 Z';
}
function tassel(x, y, a) {
  return `<g transform="translate(${x},${y}) rotate(${a})">` + Ci(0, 0, 4, `fill="${PIL.tas}" stroke="${PIL.tasL}" stroke-width="2.2"`) +
    P('M-4,3 L-5.5,13 Q0,16 5.5,13 L4,3 Z', `fill="${PIL.tas}" stroke="${PIL.tasL}" stroke-width="2.2" ${R}`) +
    P('M-1.6,6 L-2,13 M1.6,6 L2,13', `fill="none" stroke="${PIL.tasS}" stroke-width="1.4" ${R}`) + '</g>';
}
function pillow() {
  const d = pillowShape();
  let s = `<defs><clipPath id="pl"><path d="${d}"/></clipPath></defs>`;
  s += tassel(17, 82, 40) + tassel(111, 82, -40);
  s += P(d, `fill="${PIL.f}" stroke="${PIL.l}" stroke-width="3" ${R}`);
  s += `<g clip-path="url(#pl)">` + P('M0,70 Q64,82 128,62 L128,96 L0,96 Z', `fill="${PIL.s}"`) + P('M100,0 Q122,50 104,96 L128,96 L128,0 Z', `fill="${PIL.s}"`) +
    // pastel stripe across the middle, following the puff
    P('M0,40 Q64,32 128,40 L128,58 Q64,52 0,58 Z', `fill="${PIL.stripe}"`) + P('M0,53 Q64,46 128,53 L128,58 Q64,52 0,58 Z', `fill="${PIL.stripeS}"`) + P('M100,0 Q122,50 104,96 L128,96 L128,0 Z', `fill="${PIL.stripeS}" opacity="0.25"`) + `</g>` +
    P('M14,40 Q64,32.5 114,40', `fill="none" stroke="${PIL.stripeS}" stroke-width="1.6" stroke-dasharray="3 3" ${R}`) +
    P('M14,57 Q64,51.5 114,57', `fill="none" stroke="${PIL.stripeS}" stroke-width="1.6" stroke-dasharray="3 3" ${R}`) +
    P(d, `fill="none" stroke="${PIL.l}" stroke-width="3" ${R}`);
  // centre button tuft + corner pinch creases
  s += Ci(64, 48, 4.6, `fill="${PIL.tas}" stroke="${PIL.tasL}" stroke-width="2"`) + Ci(62.8, 46.8, 1.4, 'fill="#ffffff"') +
    P('M55,43 Q59,46 59.5,48 M73,43 Q69,46 68.5,48 M56,54 Q60,51 60,49.5 M72,54 Q68,51 68,49.5', `fill="none" stroke="${PIL.stripeS}" stroke-width="1.6" ${R}`) +
    P('M24,22 Q30,24 33,28 M104,22 Q98,24 95,28 M24,78 Q30,76 33,72 M104,78 Q98,76 95,72', `fill="none" stroke="${PIL.s}" stroke-width="2.4" ${R}`);
  s += E(36, 24, 11, 4, `transform="rotate(-8 36 24)" fill="#ffffff"`);
  s += tassel(17, 18, 140) + tassel(111, 18, -140);
  return s;
}
write('pillow.svg', svg(128, 96, pillow()));

/* ================================ FIZZ ================================ */
const FZ = {
  fur: '#f2a65a', shade: '#d9843a', line: '#7f4318', muz: '#fff1dc', muzS: '#f1d6b0', earIn: '#ffb3c1', earInS: '#f28ea3', eye: '#2b2440',
  nose: '#4a2616', blush: '#ff8c8c', tongue: '#ff7a8a', carpet: '#1f7a8c', carpetD: '#155866', carpetL: '#0d3c47', saff: '#ffc145', saffD: '#d6951a', cream: '#fff1dc',
};
function carpet(phase) {
  // a small rug seen from slightly above, rippling. quad mapping Q(u,v), u 0..1 left→right, v 0 back..1 front
  const back = [[38, 118], [154, 118]], front = [[18, 139], [174, 139]];
  const wave = (u, v) => Math.sin(u * Math.PI * 2.4 + phase) * (1.6 + 2.8 * v);
  const Q = (u, v) => {
    const bx = back[0][0] + (back[1][0] - back[0][0]) * u, fx = front[0][0] + (front[1][0] - front[0][0]) * u;
    return [bx + (fx - bx) * v, back[0][1] + (front[0][1] - back[0][1]) * v + wave(u, v)];
  };
  const edge = (v, u0 = 0, u1 = 1, n = 16) => Array.from({ length: n + 1 }, (_, i) => Q(u0 + (u1 - u0) * i / n, v));
  const quad = (u0, u1, v0, v1) => [...edge(v0, u0, u1, 10), ...edge(v1, u0, u1, 10).reverse()];
  const thick = 6;
  const fr = edge(1);
  const side = [...fr, ...fr.slice().reverse().map(([x, y]) => [x, y + thick])];
  let s = '';
  // back tassels (stick out sideways from the back corners)
  const sw = Math.sin(phase) * 10;
  const tas = (x, y, a) => `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1(a)})">` +
    P('M0,0 L0,6', `fill="none" stroke="${FZ.saffD}" stroke-width="2.4" ${R}`) +
    P('M-3.4,5 L-4.4,14 Q0,16.5 4.4,14 L3.4,5 Z', `fill="${FZ.saff}" stroke="${FZ.saffD}" stroke-width="2" ${R}`) + '</g>';
  s += tas(...Q(0, 0), 70 + sw) + tas(...Q(1, 0), -70 + sw);
  s += P(poly(side), `fill="${FZ.carpetD}" stroke="${FZ.carpetL}" stroke-width="3" ${R}`);
  s += P(poly(quad(0, 1, 0, 1)), `fill="${FZ.carpet}" stroke="${FZ.carpetL}" stroke-width="3" ${R}`);
  // saffron border band
  s += P(poly(quad(0.045, 0.955, 0.16, 0.84)), `fill="none" stroke="${FZ.saff}" stroke-width="3" ${R}`);
  // our own pattern: a row of rounded diamonds + dots, and a fringe of little triangles on the front edge
  for (let i = 0; i < 5; i++) {
    const u = 0.18 + i * 0.16;
    const dpts = [Q(u, 0.3), Q(u + 0.045, 0.5), Q(u, 0.7), Q(u - 0.045, 0.5)];
    s += P(poly(dpts), `fill="${i % 2 ? FZ.cream : FZ.saff}" stroke="${FZ.carpetL}" stroke-width="1.4" ${R}`);
    if (i < 4) s += Ci(...Q(u + 0.08, 0.5), 1.6, `fill="${FZ.saff}"`);
  }
  // fringe dots along the front face
  for (let i = 0; i <= 12; i++) { const [x, y] = Q(i / 12, 1); s += Ci(x, y + thick / 2, 1.2, `fill="${FZ.saff}"`); }
  // front corner tassels hang down and swing
  s += tas(Q(0, 1)[0] + 1, Q(0, 1)[1] + thick - 1, 10 + sw) + tas(Q(1, 1)[0] - 1, Q(1, 1)[1] + thick - 1, -10 + sw) +
    tas(Q(0.5, 1)[0], Q(0.5, 1)[1] + thick - 1, sw * 0.6);
  return s;
}
function fizzTail() {
  // big fluffy tail curling up on Fizz's right (our left), behind him
  const d = 'M112,124 C138,128 160,116 162,96 C164,80 154,70 146,74 C152,84 148,100 132,104 C122,107 112,110 106,114 Z';
  const tip = 'M162,96 C164,80 154,70 146,74 C150,79 151,86 149,92 C153,95 158,97 162,96 Z';
  return P(d, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3" ${R}`) + P('M118,120 C136,122 152,113 157,100', `fill="none" stroke="${FZ.shade}" stroke-width="4" ${R}`) +
    P(tip, `fill="${FZ.muz}" stroke="${FZ.line}" stroke-width="3" ${R}`);
}
function fizzEars(mode) {
  // huge fennec ears; mode 'up' (default), 'side' (throw, swept out), 'back' (hmph, slightly back)
  const L = mode === 'side' ? { tip: [20, 38], b1: [74, 50], b2: [80, 66] } : mode === 'back' ? { tip: [34, 10], b1: [72, 48], b2: [88, 42] } : { tip: [40, 4], b1: [72, 52], b2: [90, 42] };
  const ear = (e, mirror) => {
    const m = p => mirror ? [192 - p[0], p[1]] : p;
    const t = m(e.tip), a = m(e.b1), b = m(e.b2);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const bulge = (p, q, k) => { const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1]; return [mx - dy * k, my + dx * k]; };
    const c1 = bulge(a, t, mirror ? 0.18 : -0.18), c2 = bulge(t, b, mirror ? 0.18 : -0.18);
    const outer = `M${a.map(f1)} Q${c1.map(f1)} ${t.map(f1)} Q${c2.map(f1)} ${b.map(f1)} Z`;
    const ti = [t[0] + (mid[0] - t[0]) * 0.16, t[1] + (mid[1] - t[1]) * 0.16];
    const ai = [a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2], bi = [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8];
    const ci1 = bulge(ai, ti, mirror ? 0.14 : -0.14), ci2 = bulge(ti, bi, mirror ? 0.14 : -0.14);
    const inner = `M${ai.map(f1)} Q${ci1.map(f1)} ${ti.map(f1)} Q${ci2.map(f1)} ${bi.map(f1)} Z`;
    // inner fluff tufts
    const f0 = [mid[0] + (t[0] - mid[0]) * 0.18, mid[1] + (t[1] - mid[1]) * 0.18];
    const tuft = `M${f1(ai[0] + (bi[0] - ai[0]) * 0.3)},${f1(ai[1] + (bi[1] - ai[1]) * 0.3)} L${f1(f0[0] + (t[0] - mid[0]) * 0.1)},${f1(f0[1] + (t[1] - mid[1]) * 0.1)} L${f1(ai[0] + (bi[0] - ai[0]) * 0.7)},${f1(ai[1] + (bi[1] - ai[1]) * 0.7)}`;
    return P(outer, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3" ${R}`) + P(inner, `fill="${FZ.earIn}" stroke="${FZ.earInS}" stroke-width="1.6" ${R}`) +
      P(tuft, `fill="${FZ.muz}" stroke="none"`);
  };
  return ear(L, false) + ear(L, true);
}
function fizzHead(face) {
  // head: wide round face with pointy cheek fluff; face 'grin' | 'throw' | 'hmph'
  const up = face === 'hmph' ? -3 : 0;
  const headD = 'M96,40 C116,40 126,52 127,64 L135,70 L125,74 C121,84 110,90 96,90 C82,90 71,84 67,74 L57,70 L65,64 C66,52 76,40 96,40 Z';
  const muzD = `M96,${68 + up} C106,${66 + up} 118,70 125,74 C121,84 110,90 96,90 C82,90 71,84 67,74 C74,70 86,${66 + up} 96,${68 + up} Z`;
  let s = `<defs><clipPath id="fh${face}"><path d="${headD}"/></clipPath></defs>` + P(headD, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3" ${R}`);
  s += `<g clip-path="url(#fh${face})">` + P('M118,40 C134,56 132,80 112,94 L140,94 L140,40 Z', `fill="${FZ.shade}"`) +
    P(muzD, `fill="${FZ.muz}"`) + P('M112,74 C118,78 120,82 116,88 L130,90 L128,70 Z', `fill="${FZ.muzS}"`) + `</g>` +
    P(muzD, `fill="none" stroke="${FZ.line}" stroke-width="0"`) + P(headD, `fill="none" stroke="${FZ.line}" stroke-width="3" ${R}`);
  // forehead marking + highlight
  s += P('M90,42 Q96,52 102,42', `fill="none" stroke="${FZ.shade}" stroke-width="3" ${R}`) + E(80, 48, 6, 3, `transform="rotate(-20 80 48)" fill="#ffd3a3"`);
  const eyeY = 62;
  if (face === 'hmph') {
    s += P('M77,62 Q84,66 91,62', `fill="none" stroke="${FZ.eye}" stroke-width="3.2" ${R}`) + P('M101,62 Q108,66 115,62', `fill="none" stroke="${FZ.eye}" stroke-width="3.2" ${R}`) +
      P('M77,54 L89,57 M115,54 L103,57', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`) +
      E(76, 77, 8, 6, `fill="${FZ.blush}" opacity="0.6"`) + E(116, 77, 8, 6, `fill="${FZ.blush}" opacity="0.6"`) +
      P('M92,69 Q96,66 100,69 Q98,73.5 96,73.5 Q94,73.5 92,69 Z', `fill="${FZ.nose}" stroke="${FZ.nose}" stroke-width="1.6" ${R}`) +
      P('M90,81 Q96,78 102,81', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`);
  } else {
    const big = face === 'throw' ? 1.08 : 1;
    [[84, eyeY], [108, eyeY]].forEach(([x, y]) => {
      s += E(x, y, 6.6 * big, 8.2 * big, `fill="${FZ.eye}"`) + Ci(x - 2, y - 3.2, 2.6, 'fill="#ffffff"') + Ci(x + 2.4, y + 3, 1.2, 'fill="#ffffff"');
    });
    if (face === 'grin') {
      // cheeky brows: one raised
      s += P('M77,51 Q83,48 89,51', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`) + P('M103,52 Q109,47 115,49', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`);
    } else s += P('M77,49 Q83,46 89,49 M103,49 Q109,46 115,49', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`);
    s += E(74, 76, 5, 3.4, `fill="${FZ.blush}" opacity="0.7"`) + E(118, 76, 5, 3.4, `fill="${FZ.blush}" opacity="0.7"`);
    s += P('M91.5,71 Q96,68.5 100.5,71 Q98.5,75.5 96,75.5 Q93.5,75.5 91.5,71 Z', `fill="${FZ.nose}" stroke="${FZ.nose}" stroke-width="1.6" ${R}`) + Ci(94.6, 70.6, 1, 'fill="#9a6a50"');
    if (face === 'grin') {
      // lopsided cheeky grin with a peek of tongue
      s += P('M96,75.5 L96,78 M86,78 Q91,83 96,78 Q102,84 109,76', `fill="none" stroke="${FZ.line}" stroke-width="2.6" ${R}`) +
        P('M99.5,80.4 Q102,86 105.6,79.6 Z', `fill="${FZ.tongue}" stroke="${FZ.line}" stroke-width="1.6" ${R}`);
    } else {
      s += P('M96,75.5 L96,77.5', `fill="none" stroke="${FZ.line}" stroke-width="2.4" ${R}`) + E(96, 82, 4, 4.4, `fill="${FZ.nose}" stroke="${FZ.line}" stroke-width="1.6"`) + E(96, 83.6, 2.4, 2, `fill="${FZ.tongue}"`);
    }
  }
  // whisker dots
  s += Ci(84, 79, 0.9, `fill="${FZ.line}"`) + Ci(87, 81, 0.9, `fill="${FZ.line}"`) + Ci(108, 79, 0.9, `fill="${FZ.line}"`) + Ci(105, 81, 0.9, `fill="${FZ.line}"`);
  return s;
}
function fizzBody() {
  // seated body + crossed legs (lap) on the carpet
  const bodyD = 'M80,92 C76,100 74,112 78,122 L114,122 C118,112 116,100 112,92 Z';
  let s = P(bodyD, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3" ${R}`) +
    P('M88,92 C86,102 87,112 90,121 L102,121 C105,112 106,102 104,92 Z', `fill="${FZ.muz}"`) +
    P('M108,94 C112,104 112,114 110,121 L114,122 C118,112 116,100 112,92 Z', `fill="${FZ.shade}"`) + P(bodyD, `fill="none" stroke="${FZ.line}" stroke-width="3" ${R}`);
  // crossed legs: two fat ovals overlapping in the middle, cream feet at the ends
  s += E(84, 125, 22, 8, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3"`) + E(108, 125, 22, 8, `fill="${FZ.fur}" stroke="${FZ.line}" stroke-width="3"`) +
    P('M100,119 Q112,121 124,127', `fill="none" stroke="${FZ.shade}" stroke-width="3" ${R}`) +
    E(66, 125, 7.5, 6, `fill="${FZ.muz}" stroke="${FZ.line}" stroke-width="2.6"`) + E(126, 125, 7.5, 6, `fill="${FZ.muz}" stroke="${FZ.line}" stroke-width="2.6"`);
  return s;
}
const fArm = (x1, y1, x2, y2) => P(`M${x1},${y1} L${x2},${y2}`, `fill="none" stroke="${FZ.line}" stroke-width="12" ${R}`) + P(`M${x1},${y1} L${x2},${y2}`, `fill="none" stroke="${FZ.fur}" stroke-width="6.4" ${R}`);
const fPaw = (x, y, r = 5.6) => Ci(x, y, r, `fill="${FZ.muz}" stroke="${FZ.line}" stroke-width="2.6"`);
function fizz(pose, phase) {
  let s = carpet(phase) + fizzTail();
  // a soft shadow of Fizz on the rug
  s += E(96, 127, 40, 6, `fill="${FZ.carpetL}" opacity="0.3"`);
  if (pose === 'grin') {
    s += fizzBody() + fArm(82, 98, 76, 116) + fArm(110, 98, 116, 116) + fPaw(76, 117) + fPaw(116, 117);
    s += fizzEars('up') + fizzHead('grin');
  } else if (pose === 'throw') {
    s += fizzBody() + fizzEars('side') + fArm(84, 96, 64, 36) + fArm(108, 96, 128, 36);
    s += fizzHead('throw') + fPaw(63, 33, 6.4) + fPaw(129, 33, 6.4) +
      // effort/motion ticks around the empty space where the renderer draws the pillow
      P('M50,20 L44,16 M50,30 L43,30 M142,20 L148,16 M142,30 L149,30', `fill="none" stroke="${FZ.line}" stroke-width="2.4" ${R} opacity="0.55"`);
  } else {
    s += fizzBody() + fizzEars('back') + fizzHead('hmph');
    // arms crossed over the chest
    s += fArm(82, 98, 106, 108) + fArm(110, 98, 86, 108) + fPaw(107, 108, 5) + fPaw(85, 108, 5);
    // a little huffy puff from the nose
    s += Ci(140, 58, 5, `fill="#ffffff" stroke="${FZ.muzS}" stroke-width="1.6"`) + Ci(148, 52, 3.6, `fill="#ffffff" stroke="${FZ.muzS}" stroke-width="1.6"`) + Ci(153, 46, 2.4, `fill="#ffffff" stroke="${FZ.muzS}" stroke-width="1.4"`);
  }
  return svg(192, 160, s);
}
write('fizz_0.svg', fizz('grin', 0));
write('fizz_1.svg', fizz('grin', Math.PI));
write('fizz_throw.svg', fizz('throw', Math.PI / 2));
write('fizz_hmph.svg', fizz('hmph', 0));

/* ================================ HUD ================================ */
const heartD = 'M24,41 C14,34 5,27 5,17.5 C5,11 10,6.5 15.6,6.5 C19.6,6.5 22.6,8.8 24,12 C25.4,8.8 28.4,6.5 32.4,6.5 C38,6.5 43,11 43,17.5 C43,27 34,34 24,41 Z';
write('heart.svg', svg(48, 48, `<defs><clipPath id="ht"><path d="${heartD}"/></clipPath></defs>` + P(heartD, `fill="#ff6b6b" stroke="#a8323a" stroke-width="3" ${R}`) +
  `<g clip-path="url(#ht)">` + P('M30,6 C44,10 46,28 24,44 L48,48 L48,0 Z', 'fill="#e84a52"') + `</g>` + P(heartD, `fill="none" stroke="#a8323a" stroke-width="3" ${R}`) +
  E(13.5, 15, 4.6, 3, 'transform="rotate(-35 13.5 15)" fill="#ffd2d2"') + Ci(18.4, 11.6, 1.4, 'fill="#ffffff"') +
  P(poly(Array.from({ length: 6 }, (_, i) => pt(31, 27, 3.8, i * 60 + 30))), `fill="#ffd6c8" stroke="#a8323a" stroke-width="1.6" ${R}`) + Ci(31, 27, 1.2, 'fill="#a8323a"')));
write('heart_empty.svg', svg(48, 48, `<g opacity="0.5">` + P(heartD, `fill="#a89a80" fill-opacity="0.18" stroke="#a89a80" stroke-width="3" ${R}`) +
  Ci(31, 27, 3.2, 'fill="none" stroke="#a89a80" stroke-width="1.6"') + `</g>`));

function book() {
  const C = { cover: '#2ec4b6', coverD: '#1a8f84', coverL: '#11635b', page: '#fff6e3', pageS: '#efdcb8', pl: '#8a6a44', ln: '#d4b98c', rib: '#ff5a5f', ribD: '#b83a40' };
  let s = P('M6,30 Q27,22 48,32 Q69,22 90,30 L90,80 Q69,72 48,82 Q27,72 6,80 Z', `fill="${C.cover}" stroke="${C.coverL}" stroke-width="3" ${R}`) +
    P('M6,74 L6,80 Q27,72 48,82 Q69,72 90,80 L90,74', `fill="none" stroke="${C.coverD}" stroke-width="3" ${R}`);
  // pages (left + right), stacked edges below
  s += P('M11,26 Q29,16 48,27 L48,76 Q29,66 11,74 Z', `fill="${C.page}" stroke="${C.pl}" stroke-width="2.8" ${R}`) +
    P('M85,26 Q67,16 48,27 L48,76 Q67,66 85,74 Z', `fill="${C.page}" stroke="${C.pl}" stroke-width="2.8" ${R}`) +
    P('M48,27 L48,76 Q60,69 72,68 L72,22 Q60,20 48,27 Z', `fill="${C.pageS}" opacity="0.6"`) +
    P('M11,74 L11,77 Q29,69 48,79 Q67,69 85,77 L85,74', `fill="none" stroke="${C.pl}" stroke-width="2" ${R}`);
  // lines of "text" (no glyphs) + a little picture box with a sun & dune
  [33, 40, 47, 54].forEach((y, i) => s += P(`M17,${y + 2} Q29,${y - 4} ${i === 3 ? 34 : 42},${y + 1}`, `fill="none" stroke="${C.ln}" stroke-width="2.4" ${R}`));
  s += P('M55,33 Q66,27 79,32 L79,52 Q66,47 55,53 Z', `fill="#ffe6a8" stroke="${C.pl}" stroke-width="1.8" ${R}`) + Ci(72, 37, 3.6, 'fill="#ffb067"') +
    P('M55,50 Q63,41 70,46 Q75,43 79,46 L79,52 Q66,47 55,53 Z', `fill="#f1d9a6" stroke="${C.pl}" stroke-width="1.4" ${R}`);
  s += P('M56,60 Q66,55 78,59 M56,66 Q64,62 72,64', `fill="none" stroke="${C.ln}" stroke-width="2.4" ${R}`);
  s += P('M48,27 L48,76', `fill="none" stroke="${C.pl}" stroke-width="2.4" ${R}`);
  // ribbon bookmark
  s += P('M51,27 L51,90 L55,86 L59,90 L59,24', `fill="${C.rib}" stroke="${C.ribD}" stroke-width="2.2" ${R}`);
  s += sparkle(20, 14, 5, '#ffd23f') + sparkle(80, 10, 3.6, '#ffd23f');
  return s;
}
write('book.svg', svg(96, 96, book()));

/* ================================ ICON ================================ */
function icon() {
  let s = `<defs><linearGradient id="isk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd6e6"/><stop offset="0.65" stop-color="#ffe9b8"/></linearGradient>` +
    `<clipPath id="ib">${Ci(128, 128, 116)}</clipPath></defs>`;
  s += Ci(128, 128, 122, `fill="#1a8f84"`) + Ci(128, 128, 116, 'fill="url(#isk)"');
  s += `<g clip-path="url(#ib)">` + Ci(196, 64, 24, 'fill="#ffd36b"') + Ci(196, 64, 32, 'fill="#ffd36b" opacity="0.3"') +
    // dunes
    P('M0,176 Q60,150 130,170 Q190,186 256,160 L256,256 L0,256 Z', 'fill="#f1cf8e"') + P('M0,206 Q80,186 150,204 Q210,218 256,200 L256,256 L0,256 Z', 'fill="#e7bc72"') +
    // palm (left)
    P('M50,190 Q46,140 58,104', `fill="none" stroke="#6b4a2b" stroke-width="13" ${R}`) + P('M50,190 Q46,140 58,104', `fill="none" stroke="#a87a4c" stroke-width="7" ${R}`) +
    [[-150, 34], [-110, 30], [-60, 34], [-20, 30], [-185, 28]].map(([a, l]) => {
      const e = pt(58, 104, l, a), c = pt(58, 104, l * 0.6, a - 22);
      return P(`M58,104 Q${c} ${e}`, `fill="none" stroke="#2e6526" stroke-width="12" ${R}`) + P(`M58,104 Q${c} ${e}`, `fill="none" stroke="#6fbf5a" stroke-width="6" ${R}`);
    }).join('') + `</g>`;
  // Pebble head, front ¾ view
  const L = PB.line;
  s += P('M84,196 Q128,224 172,196 L176,214 Q128,240 80,214 Z', `fill="${PB.red}" stroke="${L}" stroke-width="5" ${R}`);
  s += `<g transform="translate(66,108) rotate(28)">` + P('M-14,-2 C-20,16 -18,38 0,46 C18,38 20,16 14,-2 C8,-7 -8,-7 -14,-2 Z', `fill="${PB.body}" stroke="${L}" stroke-width="5" ${R}`) +
    P('M-18,26 C-15,40 -6,45.5 0,46 C6,45.5 15,40 18,26 C8,32 -8,32 -18,26 Z', `fill="${PB.teal}" stroke="${L}" stroke-width="4" ${R}`) + '</g>';
  s += `<g transform="translate(190,108) rotate(-28)">` + P('M-14,-2 C-20,16 -18,38 0,46 C18,38 20,16 14,-2 C8,-7 -8,-7 -14,-2 Z', `fill="${PB.body}" stroke="${L}" stroke-width="5" ${R}`) +
    P('M-18,26 C-15,40 -6,45.5 0,46 C6,45.5 15,40 18,26 C8,32 -8,32 -18,26 Z', `fill="${PB.teal}" stroke="${L}" stroke-width="4" ${R}`) + '</g>';
  s += P('M128,76 Q130,58 140,48', `fill="none" stroke="${L}" stroke-width="9" ${R}`) + P('M128,76 Q130,58 140,48', `fill="none" stroke="${PB.panel}" stroke-width="4" ${R}`) +
    Ci(141, 45, 10, `fill="${PB.teal}" stroke="${L}" stroke-width="5"`) + Ci(137.5, 41.5, 3, `fill="${PB.tealL}"`);
  s += `<defs><clipPath id="ihd">${E(128, 136, 62, 54)}</clipPath></defs>` + E(128, 136, 62, 54, `fill="${PB.shade}" stroke="${L}" stroke-width="6"`) +
    `<g clip-path="url(#ihd)">` + E(122, 128, 60, 50, `fill="${PB.body}"`) + `</g>` + E(128, 136, 62, 54, `fill="none" stroke="${L}" stroke-width="6"`);
  s += E(96, 100, 14, 7, `transform="rotate(-25 96 100)" fill="${PB.hi}"`);
  // face (looking slightly to the right: ¾)
  s += E(136, 160, 30, 21, `fill="#fff4dd" stroke="${PB.shade}" stroke-width="3"`);
  [[108, 134], [158, 134]].forEach(([x, y], i) => {
    s += E(x, y, i ? 12 : 11, i ? 15 : 14, `fill="${PB.eye}"`) + Ci(x - 4, y - 6, 5, 'fill="#ffffff"') + Ci(x + 4.5, y + 5, 2.4, 'fill="#ffffff"');
  });
  s += P('M128,150 Q136,146 144,150 Q142,158 136,158 Q130,158 128,150 Z', `fill="${PB.eye}" stroke="${PB.eye}" stroke-width="2" ${R}`) +
    P('M122,165 Q129,174 136,165 Q143,174 150,165', `fill="none" stroke="${PB.eye}" stroke-width="4" ${R}`) +
    E(94, 160, 9, 6, `fill="${PB.blush}" opacity="0.8"`) + E(172, 160, 9, 6, `fill="${PB.blush}" opacity="0.8"`);
  // pink scallop shell, bottom right
  s += `<g transform="translate(158,150) scale(1.5)">` + scallop({ id: 'ic' }) + `</g>`;
  s += sparkle(222, 150, 9, '#ffffff') + sparkle(36, 140, 6, '#ffffff');
  return s;
}
write('icon.svg', svg(256, 256, icon()));

console.log('wrote', files.length, 'files to', OUT);
