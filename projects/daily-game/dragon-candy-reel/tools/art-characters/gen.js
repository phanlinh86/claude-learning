#!/usr/bin/env node
// Character & item art generator for Taffy's Candy Reel.
// 100% original hand-written SVG (no tracing, no known characters or brands).
// Taffy's four frames are built from the same body parts, so the body geometry
// is identical; only the face, wings, arms and rod change between frames.
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Taffy (mint dragon, peach belly, lilac wings, pink scarf)
  mint: '#86e3c3', mintShade: '#5cc6a6', mintHi: '#c8f7e6', mintLine: '#2c7f6c', mintDeep: '#4db497',
  peach: '#ffd8b8', peachShade: '#f6b994', peachLine: '#b97a55',
  horn: '#fff1cf', hornShade: '#f1d79e', hornLine: '#a8844a',
  wing: '#cdb8f6', wingShade: '#a991e8', wingLine: '#6b55b5',
  ridge: '#b9a1f0',
  scarf: '#ff8fbd', scarfShade: '#ec6aa0', scarfLine: '#a8346c', scarfRib: '#ffc4dc',
  eyeWhite: '#ffffff', iris: '#3d2f5c', irisHi: '#7a63b8', eyeLine: '#27584c',
  mouth: '#b8405f', tongue: '#ff8aa6', blush: '#ff9cbc',
  // candy-striped bucket stool
  stoolW: '#fff7f2', stoolS: '#ff7aa0', stoolLine: '#b04a6b', stoolShade: '#f1d8de',
  // peppermint rod + reel
  mintStick: '#ffffff', mintRed: '#f0475e', rodLine: '#a3303f', reel: '#d3dbe6', reelLine: '#56627a',
  // flakes
  berry: '#ff6fa8', berryHi: '#ffc2dc', berryLine: '#b02e68', berryDeep: '#8a1f50',   // berryDeep: the flake's thicker, darker outline (keeps contrast when colour-blind)
  lime: '#8edc3e', limeHi: '#d6f7a8', limeLine: '#3f8019',
  grape: '#a970ea', grapeHi: '#dcc6ff', grapeDeep: '#7d45c9', grapeLine: '#4e2591',
  gold: '#ffcf2e', goldHi: '#fff3a8', goldDeep: '#f0a20f', goldLine: '#97600a',
  sugar: '#fffdf7',
  // bubble
  bub: '#e6fbff',
  // sour gummy (orange)
  gum: '#ffa23f', gumShade: '#f27e1f', gumHi: '#ffd28f', gumLine: '#a94c12', gumBelly: '#ffc46e',
  // deco fish
  cherry: '#ff5470', cherryHi: '#ffb3c0', cherryLine: '#9e1f3a',
  bfBlue: '#4fa3f0', bfWhite: '#f6fbff', bfLine: '#1f5a9c', bfFin: '#9fd0ff',
  // licorice spool
  lic: '#e0283f', licHi: '#ff7b8a', licLine: '#7d1022', spoolW: '#ffe3c2', spoolWShade: '#f0c48f', spoolLine: '#9a6430',
  // jar
  glass: '#e9fbff', glassLine: '#5d9bb0', lid: '#ff8fbd', lidShade: '#ec6aa0', lidLine: '#a8346c',
  // windsock
  sockPink: '#ff7aa8', sockW: '#ffffff', sockLine: '#a8346c', pole: '#fff7ea', poleLine: '#a9845a',
};

// ---------------------------------------------------------------- helpers
const f = (n) => +(+n).toFixed(2);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const ell = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
const circ = (cx, cy, r) => ell(cx, cy, r, r);
const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
let _id = 0;
let PFX = 'a';
const nid = () => `${PFX}${++_id}`;
// filled shape (one or several paths = union) with clipped cel shade/inner details + highlight, outline drawn
// UNDER the fill at double width so overlapping parts merge into one clean silhouette.
function shape(d, fill, lineC, opt = {}) {
  const ds = Array.isArray(d) ? d : [d];
  const sw = opt.sw ?? 3;
  let s = '';
  if (sw) for (const p of ds) s += `<path d="${p}" fill="none" stroke="${lineC}" stroke-width="${sw * 2}" stroke-linejoin="round"/>`;
  for (const p of ds) s += `<path d="${p}" fill="${fill}"${opt.op ? ` opacity="${opt.op}"` : ''}/>`;
  if (opt.shade || opt.hi || opt.inner) {
    const id = nid();
    s += `<clipPath id="${id}">${ds.map((p) => `<path d="${p}"/>`).join('')}</clipPath><g clip-path="url(#${id})">`;
    if (opt.shade) s += `<path d="${opt.shade}" fill="${opt.shadeFill}"/>`;
    if (opt.inner) s += opt.inner;
    if (opt.hi) s += `<path d="${opt.hi}" fill="#fff" opacity="${opt.hiOp ?? 0.55}"/>`;
    s += `</g>`;
  }
  return s;
}
function limb(d, w, fill, lineC, sw = 3) {
  return `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${w + sw * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const line = (d, c, w, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
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
// tapered filled path along a cubic bezier (w0 at start, w1 at end)
function taper(p0, p1, p2, p3, w0, w1, n = 24) {
  const L = [], R = [];
  const pt = (t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = pt(Math.max(0, t - 0.01)), b = pt(Math.min(1, t + 0.01)), c = pt(t);
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push([c[0] - dy * w, c[1] + dx * w]); R.push([c[0] + dy * w, c[1] - dx * w]);
  }
  return 'M' + L.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'L' + R.reverse().map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
}
const rot = (p, c, deg) => {
  const a = (deg * Math.PI) / 180, x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
};
// white sugar rim + coloured outline (flakes must pop on light AND dark water)
const rimmed = (d, lineC, sw = 2.4, rimW = 4.5) =>
  `<path d="${d}" fill="none" stroke="${P.sugar}" stroke-width="${sw + rimW}" stroke-linejoin="round" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// ================================================================= TAFFY
// viewBox 0 0 160 160. Seat line y=150 (bottom of the stool). Body centre (68,96).
// Rod butt (88,121); rod tips: idle/happy/oops (150,22), reel (146,14).
const ROD_BUTT = [88, 121];
const TIP_IDLE = [150, 22];
const TIP_REEL = [146, 14];
const WING_ROOT = [52, 80];

function taffyStool() {
  // upturned bucket, candy stripes, wider at the bottom
  const d = 'M50 121L86 121Q89 121 89.4 124L93.6 146.5Q94 150 90 150L46 150Q42 150 42.4 146.5L46.6 124Q47 121 50 121Z';
  let stripes = '';
  for (let x = 20; x < 110; x += 11) stripes += `<path d="${poly([[x, 160], [x + 5.5, 160], [x + 25.5, 115], [x + 20, 115]])}" fill="${P.stoolS}"/>`;
  let s = shape(d, P.stoolW, P.stoolLine, {
    inner: stripes + `<path d="M76 116L100 116L100 154L82 154Z" fill="#7a2a45" opacity="0.13"/>`,
    hi: 'M50 125L54 125L51 146L47 146Z', hiOp: 0.6,
  });
  s += shape('M44.2 142H91.8Q93.6 142 93.8 144L94 147Q94 150 90.6 150H45.4Q42 150 42 147L42.2 144Q42.4 142 44.2 142Z', P.stoolW, P.stoolLine, { sw: 2.2, inner: `<path d="M74 140H100V152H74Z" fill="${P.stoolShade}"/>` });
  return s;
}
function taffyTail() {
  // curly tail out of the lower back, curling behind the stool to the left, spade tip
  const d = taper([48, 118], [30, 140], [6, 134], [10, 114], 15, 5);
  let s = shape(d, P.mint, P.mintLine, {
    shade: taper([48, 124], [30, 146], [2, 138], [6, 116], 10, 3), shadeFill: P.mintShade,
  });
  // spade tip (lilac)
  const tip = 'M10.5 116Q3 112 4 104Q10 106 12 98Q17 104 21 104Q20 112 13 116Z';
  s += shape(tip, P.wing, P.wingLine, { sw: 2.4, hi: ell(10, 106, 2.4, 2), hiOp: 0.6 });
  // little ridge spikes on the tail
  for (const [x, y, a] of [[34, 133, 200], [22, 134, 170]]) {
    const pts = [rot([x - 4, y], [x, y], a - 180), rot([x, y - 6], [x, y], a - 180), rot([x + 4, y], [x, y], a - 180)];
    s += shape(softPoly(pts, 0.25), P.ridge, P.wingLine, { sw: 1.8 });
  }
  return s;
}
function wingPath(scale = 1) {
  // bat-like baby wing, root at WING_ROOT, three soft scallops
  const [rx, ry] = WING_ROOT;
  const k = (x, y) => `${f(rx + (x - rx) * scale)} ${f(ry + (y - ry) * scale)}`;
  return `M${k(54, 76)}Q${k(42, 56)} ${k(24, 50)}Q${k(22, 58)} ${k(24, 66)}Q${k(28, 64)} ${k(30, 70)}Q${k(34, 68)} ${k(37, 76)}Q${k(42, 74)} ${k(45, 82)}Q${k(50, 84)} ${k(56, 84)}Z`;
}
function taffyWing(angle, far) {
  const d = wingPath(far ? 0.88 : 1);
  const s = shape(d, far ? P.wingShade : P.wing, P.wingLine, {
    sw: 2.6,
    inner: line(`M52 79L28 55M51 80L32 69M51 81L40 77`, far ? P.wingLine : P.wingShade, 1.8, ' opacity="0.8"'),
    hi: far ? null : ell(40, 60, 6, 2.6), hiOp: 0.45,
  });
  const tx = far ? 6 : 0, ty = far ? -6 : 0;
  return `<g transform="translate(${tx} ${ty}) rotate(${angle} ${WING_ROOT[0]} ${WING_ROOT[1]})">${s}</g>`;
}
function taffyRidge() {
  // soft lilac back spikes from the crown down the back (peek out behind head/body)
  let s = '';
  const spikes = [[54, 42, -100, 6.5], [45, 53, -80, 6.5], [41, 68, -95, 6], [40, 84, -105, 5.5], [41, 100, -115, 5]];
  for (const [x, y, a, h] of spikes) {
    const base = 5;
    const p1 = rot([x, y - base], [x, y], a + 90), p2 = rot([x - h, y], [x, y], a + 90), p3 = rot([x, y + base], [x, y], a + 90);
    // spike points outward along angle a (deg from +x)
    const o = [Math.cos((a * Math.PI) / 180) * h * 1.0, Math.sin((a * Math.PI) / 180) * h * 1.0];
    const b1 = [x - Math.sin((a * Math.PI) / 180) * base, y + Math.cos((a * Math.PI) / 180) * base];
    const b2 = [x + Math.sin((a * Math.PI) / 180) * base, y - Math.cos((a * Math.PI) / 180) * base];
    void p1; void p2; void p3;
    s += shape(softPoly([b1, [x + o[0] * 1.4, y + o[1] * 1.4], b2], 0.3), P.ridge, P.wingLine, { sw: 2 });
  }
  return s;
}
const BODY = ell(68, 96, 27, 29);
function taffyBody() {
  const belly = ell(78, 101, 15.5, 21);
  let stripes = '';
  for (const y of [88, 97, 106, 115]) stripes += line(`M63 ${y}Q78 ${y + 3.4} 94 ${y}`, P.peachShade, 1.8);
  return shape(BODY, P.mint, P.mintLine, {
    shade: 'M36 104Q56 128 100 112L100 130L36 130Z', shadeFill: P.mintShade,
    inner: shape(belly, P.peach, P.peachLine, { sw: 1.4, inner: stripes }) ,
    hi: ell(52, 80, 7, 4.5), hiOp: 0.45,
  });
}
function taffyLegs() {
  // far leg (darker, slightly behind), near leg in front of the stool, feet on the deck
  let s = limb('M70 120Q86 120 92 140', 12, P.mintDeep, P.mintLine, 2.6);
  s += shape(ell(95, 145.5, 8.5, 4.5), P.mintDeep, P.mintLine, { sw: 2.4 });
  s += limb('M66 122Q88 124 98 141', 14, P.mint, P.mintLine);
  s += line('M74 119Q89 120 97 132', P.mintHi, 2.4, ' opacity="0.7"');
  s += shape('M92 143Q92 139 100 139Q111 139 112 145Q112 150 107 150L96 150Q92 150 92 147Z', P.mint, P.mintLine, {
    shade: 'M88 147H116V152H88Z', shadeFill: P.mintShade,
  });
  // cream toe claws
  for (const x of [104, 108.5, 112]) s += shape(ell(x, 146.5, 1.7, 2.2), P.horn, P.hornLine, { sw: 1.1 });
  return s;
}
function taffyHorns(oops) {
  const lift = oops ? -1.5 : 0;
  let s = '';
  // short stubby horns curving back (left), with sugar-candy bands
  s += shape(`M64 34Q60 26 54 ${21 + lift}Q51 ${19 + lift} 52.6 ${23 + lift}Q56 30 60 38Z`, P.horn, P.hornLine, { sw: 2.4, shade: `M58 40Q56 30 50 22L46 26L54 42Z`, shadeFill: P.hornShade, inner: line('M57 30.5L62 28.4M55.4 26.4L59.4 24.6', P.hornShade, 1.6) });
  s += shape(`M76 28Q74 18 68 ${12 + lift}Q65 ${10 + lift} 66 ${14.6 + lift}Q68 22 69 30Z`, P.horn, P.hornLine, { sw: 2.4, shade: `M70 32Q70 22 64 14L62 18L66 34Z`, shadeFill: P.hornShade, inner: line('M69.2 23.6L75 22.4M67.6 18.2L72.4 17', P.hornShade, 1.6) });
  return s;
}
const HEAD = circ(80, 52, 26);
const MUZZLE = ell(103, 62, 15, 12);
function taffyHead() {
  let s = shape([HEAD, MUZZLE], P.mint, P.mintLine, {
    shade: 'M50 66Q74 82 120 68L120 90L50 90Z', shadeFill: P.mintShade,
    hi: ell(68, 36, 8, 4.5), hiOp: 0.55,
  });
  // cheek frill (tiny lilac fin behind the cheek)
  return shape('M58 56Q48 50 46 58Q50 60 47 66Q54 66 58 64Z', P.ridge, P.wingLine, { sw: 2 }) + s;
}
function taffyNostrils() {
  return `<path d="${ell(113.5, 57.5, 1.6, 1.1)}" fill="${P.mintLine}"/><path d="${ell(107.5, 56, 1.2, 0.9)}" fill="${P.mintLine}" opacity="0.8"/>`;
}
function eyeOpen(cx, cy, rx, ry, lookX = 1.2, lookY = 0.5) {
  let s = shape(ell(cx, cy, rx, ry), P.eyeWhite, P.eyeLine, { sw: 1.8 });
  const ix = cx + lookX, iy = cy + lookY, ir = rx * 0.78, iry = ry * 0.8;
  s += shape(ell(ix, iy, ir, iry), P.iris, P.iris, { sw: 0, inner: `<path d="${ell(ix, iy + iry * 0.55, ir * 0.8, iry * 0.45)}" fill="${P.irisHi}"/>` });
  s += `<path d="${ell(ix - ir * 0.32, iy - iry * 0.4, ir * 0.36, iry * 0.3)}" fill="#fff"/>`;
  s += `<path d="${circ(ix + ir * 0.35, iy + iry * 0.3, ir * 0.15)}" fill="#fff"/>`;
  return s;
}
function blush() {
  return `<path d="${ell(80, 66, 6, 3.4)}" fill="${P.blush}" opacity="0.75"/><path d="${ell(111, 67, 3.6, 2.2)}" fill="${P.blush}" opacity="0.6"/>`;
}
function taffyFace(mode) {
  let s = '';
  if (mode === 'idle') {
    s += eyeOpen(86, 50, 8, 10.5) + eyeOpen(103.5, 47, 6, 9, 1.4, 0.6);
    s += line('M96 68Q104 73.5 113 66.5', P.mouth, 2.2);
    s += line('M94.6 67.4L96.4 68.6', P.mouth, 1.8);
  } else if (mode === 'reel') {
    // focused: lids lowered, brows in, tongue poking out
    s += eyeOpen(86, 51, 8, 9.5, 2, 1) + eyeOpen(103.5, 48, 6, 8.5, 2, 1);
    s += `<path d="M77 43Q86 39 95 44L95 40L77 40Z" fill="${P.mint}"/>` + line('M77.5 43.5Q86 40 94.5 44.5', P.eyeLine, 2);
    s += `<path d="M97 40Q103.5 37 110 42L110 37L97 37Z" fill="${P.mint}"/>` + line('M97.5 40.4Q103.5 37.6 109.5 42', P.eyeLine, 1.8);
    s += line('M80 36L90 38M100 35L107 38', P.mintLine, 2.2);
    s += shape('M106 68Q109 75 113 73Q115 70 112 67Z', P.tongue, P.mouth, { sw: 1.4 });
    s += line('M97 68Q104 71 113 66.5', P.mouth, 2.2);
  } else if (mode === 'happy') {
    s += line('M78.5 52Q86 41 93.5 52', P.eyeLine, 3);
    s += line('M98 49Q103.5 40 109 49', P.eyeLine, 2.6);
    // open smile
    s += shape('M95 65Q104 64 114 63Q114 74 104 76Q96 75 95 65Z', P.mouth, P.mouth, {
      sw: 1.4, inner: `<path d="${ell(105, 76, 7, 4.5)}" fill="${P.tongue}"/>`,
    });
    // tiny pink candy-smoke puff from the nostril
    s += `<g opacity="0.92">` + shape([circ(118, 40, 3.6), circ(123, 33, 4.8), circ(130, 30, 4)], '#ffd2e5', '#e57ea9', { sw: 1.4, hi: circ(122, 31.5, 1.8), hiOp: 0.8 }) + `</g>`;
    s += sparkle(132, 21, 3, '#fff', '#e57ea9', 1);
  } else if (mode === 'oops') {
    s += shape(ell(86, 49, 8.6, 11), P.eyeWhite, P.eyeLine, { sw: 1.8 }) + `<path d="${ell(87.5, 50, 3.4, 4.2)}" fill="${P.iris}"/><path d="${circ(86.4, 48.4, 1.3)}" fill="#fff"/>`;
    s += shape(ell(103.5, 46, 6.4, 9.6), P.eyeWhite, P.eyeLine, { sw: 1.8 }) + `<path d="${ell(105, 47, 2.6, 3.6)}" fill="${P.iris}"/><path d="${circ(104.2, 45.6, 1)}" fill="#fff"/>`;
    s += line('M79 34Q85 30 92 33M99 31Q103 29 108 32', P.mintLine, 2.2);
    s += shape(ell(106, 69, 3.6, 4.4), P.mouth, P.mouth, { sw: 1, inner: `<path d="${ell(106, 72, 2.6, 1.8)}" fill="${P.tongue}"/>` });
    // sweat drop
    s += shape('M120 36Q124 43 122 46Q119 48 117.6 45Q117 42 120 36Z', '#bfefff', '#3f8fb0', { sw: 1.4, hi: ell(119.4, 43.4, 0.9, 1.4), hiOp: 0.9 });
  }
  if (mode !== 'happy') s += blush();
  else s += `<path d="${ell(80, 63, 6.4, 3.6)}" fill="${P.blush}" opacity="0.85"/><path d="${ell(112, 62, 3, 2)}" fill="${P.blush}" opacity="0.7"/>`;
  return s;
}
function taffyScarfTails() {
  // knitted ends flutter back-left
  let s = shape('M52 84Q40 86 30 94Q27 97 29.6 100Q32.4 102 35 99Q43 92 54 92Z', P.scarf, P.scarfLine, {
    shade: 'M26 99Q40 92 58 92L58 106L26 106Z', shadeFill: P.scarfShade,
    inner: line('M46 86.4L46.6 93M39.4 89.4L40.6 95.6', P.scarfRib, 1.4),
  });
  s += shape('M50 90Q42 98 38 108Q37 112 40.6 112.4Q43.6 112.6 44.6 109Q47 100 54 94Z', P.scarf, P.scarfLine, {
    shade: 'M36 110Q46 102 56 94L58 116L34 116Z', shadeFill: P.scarfShade,
  });
  s += line('M29.6 97L24 98M31 100.6L27 104M39 111L36 116M43 111.6L43 116.6', P.scarfLine, 2.4);
  s += line('M29.6 97L24.6 97.9M31 100.6L27.6 103.6M39 111L36.6 115.4M43 111.6L43 116', P.scarfRib, 1);
  return s;
}
function taffyScarfWrap() {
  const d = 'M54 74Q76 84 98 73Q101 72 101.5 75L102 81Q101.5 84 98 85.5Q76 96 54 85Q51 84 51 81L51 77Q51 73 54 74Z';
  return shape(d, P.scarf, P.scarfLine, {
    shade: 'M48 83Q76 95 104 81L104 100L48 100Z', shadeFill: P.scarfShade,
    inner: line('M59 77L58 87M66 80L65.5 90M73 81.6L73 91.4M80 81.6L80.5 91.4M87 80L88 89.6M94 77L95.5 86.6', P.scarfRib, 1.5, ' opacity="0.9"'),
    hi: ell(64, 77.5, 5, 1.4), hiOp: 0.5,
  });
}
// rod: peppermint stick. bent=true → quadratic arch (reel frame)
function rodPath(tip, bent) {
  const [bx, by] = ROD_BUTT;
  if (!bent) return `M${bx} ${by}L${tip[0]} ${tip[1]}`;
  return `M${bx} ${by}C${f(bx + 14)} ${f(by - 40)} ${f(tip[0] - 20)} ${f(tip[1] + 8)} ${tip[0]} ${tip[1]}`;
}
function rodPoint(tip, bent, t) {
  const b = ROD_BUTT;
  if (!bent) return lerp(b, tip, t);
  const c1 = [b[0] + 14, b[1] - 40], c2 = [tip[0] - 20, tip[1] + 8], u = 1 - t;
  const q = (i) => u * u * u * b[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * tip[i];
  return [q(0), q(1)];
}
function taffyRod(tip, bent) {
  const d = rodPath(tip, bent);
  let s = '';
  s += `<path d="${d}" fill="none" stroke="${P.rodLine}" stroke-width="8" stroke-linecap="round"/>`;
  s += `<path d="${d}" fill="none" stroke="${P.mintStick}" stroke-width="4.6" stroke-linecap="round"/>`;
  s += `<path d="${d}" fill="none" stroke="${P.mintRed}" stroke-width="4.6" stroke-dasharray="4 5"/>`;
  s += `<path d="${d}" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.7" transform="translate(-0.8 -0.6)"/>`;
  // rounded handle knob at the butt + tip eyelet
  s += shape(circ(ROD_BUTT[0], ROD_BUTT[1], 4.4), P.mintRed, P.rodLine, { sw: 2, hi: circ(86.8, 119.8, 1.4), hiOp: 0.8 });
  s += `<path d="${circ(tip[0], tip[1], 2.6)}" fill="none" stroke="${P.reelLine}" stroke-width="2.4"/>`;
  return s;
}
function taffyReel(tip, bent, crankAng) {
  const p = rodPoint(tip, bent, 0.1);
  const c = [p[0] + 5, p[1] + 3.5];
  let s = line(`M${f(p[0])} ${f(p[1])}L${f(c[0])} ${f(c[1])}`, P.reelLine, 2.6);
  s += shape(circ(c[0], c[1], 5.4), P.reel, P.reelLine, { sw: 2, inner: `<path d="${circ(c[0], c[1], 2.6)}" fill="#ff8fbd"/>`, hi: circ(c[0] - 1.8, c[1] - 2, 1.4), hiOp: 0.9 });
  const k = rot([c[0] + 7, c[1]], c, crankAng);
  s += line(`M${f(c[0])} ${f(c[1])}L${f(k[0])} ${f(k[1])}`, P.reelLine, 2);
  s += shape(circ(k[0], k[1], 1.9), '#ffe066', P.reelLine, { sw: 1.2 });
  return { s, knob: k, centre: c };
}
function paw(x, y, r = 5.6, col = P.mint) {
  return shape(circ(x, y, r), col, P.mintLine, { sw: 2.6, hi: circ(x - 1.6, y - 1.8, 1.8), hiOp: 0.5 });
}
function taffy(mode) {
  _id = 0; PFX = 't' + mode[0];
  const bent = mode === 'reel';
  const tip = bent ? TIP_REEL : TIP_IDLE;
  const wingUp = mode === 'oops' ? 24 : mode === 'happy' ? 10 : 0;
  let s = '';
  s += taffyWing(wingUp - 8, true);
  s += taffyTail();
  s += taffyScarfTails();
  // far arm: hidden behind the body, only the paw shows (keeps the peach belly readable)
  const reelK = taffyReel(tip, bent, mode === 'reel' ? 70 : 20).knob;
  const farPaw = mode === 'reel' ? [reelK[0], reelK[1] + 1] : rodPoint(tip, bent, 0.04);
  if (mode !== 'happy') s += limb(`M66 96Q78 110 ${f(farPaw[0] - 3)} ${f(farPaw[1])}`, 8.5, P.mintDeep, P.mintLine, 2.6);
  s += taffyStool();
  s += taffyRidge();
  s += taffyBody();
  s += taffyWing(wingUp, false);
  if (mode === 'happy') { // far arm raised in a cheer, in front of the wing
    s += limb('M58 84Q48 74 44 58', 9, P.mintDeep, P.mintLine, 2.6);
    s += paw(43, 55, 6.4, P.mintDeep);
    s += line('M34 48Q32 44 34 40M30 55Q26 54 24 51', '#ffffff', 2.2, ' opacity="0.95"');
  }
  s += taffyLegs();
  s += taffyHorns(mode === 'oops');
  s += taffyHead();
  s += taffyNostrils();
  s += taffyFace(mode);
  s += taffyScarfWrap();
  // rod + reel
  s += taffyRod(tip, bent);
  const reel = taffyReel(tip, bent, mode === 'reel' ? 70 : 20);
  s += reel.s;
  // far paw: on the crank (reel), on the lower grip (idle/oops)
  if (mode !== 'happy') s += paw(farPaw[0], farPaw[1], 5, P.mintDeep);
  // near arm holds the upper grip
  const g2 = rodPoint(tip, bent, 0.2);
  s += limb(`M74 88Q84 100 ${f(g2[0] - 3)} ${f(g2[1] + 2)}`, 10, P.mint, P.mintLine);
  s += paw(g2[0], g2[1], 6);
  s += line(`M${f(g2[0] + 2)} ${f(g2[1] - 3.6)}L${f(g2[0] + 3.4)} ${f(g2[1] - 1)}`, P.mintLine, 1.4);
  return svg(160, 160, s);
}

// ================================================================= ITEMS
function jar() {
  _id = 0; PFX = 'j';
  const body = 'M18 20Q12 22 12 30L12 54Q12 62 20 62L44 62Q52 62 52 54L52 30Q52 22 46 20Z';
  let inside = '';
  // little flakes inside
  const mini = (x, y, r, c, lc, a) => {
    let d = '';
    for (let i = 0; i < 6; i++) { const q = rot([x + r, y], [x, y], a + i * 60); d += `M${x} ${y}L${f(q[0])} ${f(q[1])}`; }
    return line(d, '#fff', 4.6) + line(d, c, 2.6) + `<path d="${circ(x, y, 1.6)}" fill="${lc}"/>`;
  };
  inside += mini(23, 53, 6, P.berry, P.berryLine, 10) + mini(38, 50, 6.5, P.lime, P.limeLine, 25) + mini(31, 41, 6, P.grape, P.grapeLine, 0) + mini(42, 36, 5, P.berry, P.berryLine, 30) + mini(21, 37, 5, P.gold, P.goldLine, 15);
  let s = shape(body, P.glass, P.glassLine, {
    sw: 2.6, op: 0.6,
    inner: inside + `<path d="M12 56Q32 62 52 56L52 64L12 64Z" fill="#bde8f4" opacity="0.5"/>`,
    hi: 'M16 28Q16 24 19 24L21 24L21 54Q21 56 18.5 56Q16 56 16 54Z', hiOp: 0.8,
  });
  s += `<path d="M45 26L47 26L47 40L45 40Z" fill="#fff" opacity="0.6"/>`;
  // neck + pink lid
  s += shape('M18 15H46V21H18Z', '#dff6fc', P.glassLine, { sw: 2 });
  s += shape('M14 8Q14 4 18 4H46Q50 4 50 8V13Q50 16 46 16H18Q14 16 14 13Z', P.lid, P.lidLine, {
    sw: 2.6, shade: 'M10 11H54V18H10Z', shadeFill: P.lidShade,
    inner: line('M20 5V15M26 5V15M32 5V15M38 5V15M44 5V15', '#ffc4dc', 1.4, ' opacity="0.9"'),
    hi: ell(22, 7.4, 4.4, 1.3), hiOp: 0.7,
  });
  return svg(64, 64, s);
}

function hook() {
  _id = 0; PFX = 'h';
  // silver hook (shank from bobber down, J bend centred on hit point (16,32))
  let s = line('M16 15L16 36Q16 44 22 44Q27 44 27 38L25 34', P.reelLine, 4.8);
  s += line('M16 15L16 36Q16 44 22 44Q27 44 27 38L25 34', '#dfe6ee', 2.4);
  s += `<path d="M24.4 37.4L27.8 33.4L28.4 38.2Z" fill="#dfe6ee" stroke="${P.reelLine}" stroke-width="1.2" stroke-linejoin="round"/>`;
  s += line('M15.2 20L15.2 34', '#fff', 0.9, ' opacity="0.9"');
  // attach ring at the top (line attach 16,2)
  s += `<path d="${circ(16, 3.2, 1.6)}" fill="none" stroke="${P.reelLine}" stroke-width="1.4"/>`;
  // swirl-candy bobber y 4..16
  const swirl = 'M16 10m0 0q2.2 -0.4 1.6 2q-1 2.4 -4 1.2q-3 -1.6 -1.6 -5q2 -3.6 6.4 -2.2q4.4 2 3 7';
  s += shape(circ(16, 10, 6.4), '#fff', P.berryLine, {
    sw: 1.6, inner: line(swirl, P.berry, 2.6) + `<path d="M8 13Q16 18 24 13L24 18L8 18Z" fill="#f4c8d8" opacity="0.7"/>`, hi: ell(13.4, 6.8, 2, 1.2), hiOp: 0.9,
  });
  return svg(32, 48, s);
}

// --------------------------------------------------------------- snowflakes
// six arms, each flake a different silhouette.
function armSet(cx, cy, build, a0 = -90) {
  let d = '';
  for (let i = 0; i < 6; i++) d += build(i, a0 + i * 60);
  return d;
}
function at(cx, cy, r, deg) { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
const P2 = (p) => `${f(p[0])} ${f(p[1])}`;

function flakeBerry() {
  // chunky round-tipped arms: thick rounded spokes with big ball tips + side nubs
  _id = 0; PFX = 'fb';
  const c = 32;
  const spokes = armSet(c, c, (i, a) => `M${P2(at(c, c, 4, a))}L${P2(at(c, c, 19, a))}`);
  const nubs = armSet(c, c, (i, a) => {
    const m = at(c, c, 13, a);
    return `M${P2(m)}L${P2(at(m[0], m[1], 6.5, a - 55))}M${P2(m)}L${P2(at(m[0], m[1], 6.5, a + 55))}`;
  });
  let s = '';
  // sugar rim + outline under
  s += line(spokes, P.sugar, 15) + line(nubs, P.sugar, 11);
  for (let i = 0; i < 6; i++) { const t = at(c, c, 22, -90 + i * 60); s += `<path d="${circ(t[0], t[1], 7.6)}" fill="${P.sugar}"/>`; }
  s += `<path d="${circ(c, c, 11.5)}" fill="${P.sugar}"/>`;
  s += line(spokes, P.berryDeep, 11.8) + line(nubs, P.berryDeep, 8);
  for (let i = 0; i < 6; i++) { const t = at(c, c, 22, -90 + i * 60); s += `<path d="${circ(t[0], t[1], 6)}" fill="${P.berryDeep}"/>`; }
  s += `<path d="${circ(c, c, 9.8)}" fill="${P.berryDeep}"/>`;
  s += line(spokes, P.berry, 7) + line(nubs, P.berry, 3.6);
  for (let i = 0; i < 6; i++) {
    const t = at(c, c, 22, -90 + i * 60);
    s += `<path d="${circ(t[0], t[1], 3.8)}" fill="${P.berry}"/><path d="${circ(t[0] - 1.2, t[1] - 1.2, 1.4)}" fill="${P.berryHi}"/>`;
  }
  s += `<path d="${circ(c, c, 7.4)}" fill="${P.berry}"/><path d="${circ(c, c, 3.6)}" fill="${P.berryHi}"/>`;
  s += `<path d="${ell(c - 3, c - 3.4, 2, 1.2)}" fill="#fff" opacity="0.9"/>`;
  return svg(64, 64, s);
}
function flakeLime() {
  // thin branchy fern arms: long spine + 3 pairs of slanted twigs, tiny dot tips
  _id = 0; PFX = 'fl';
  const c = 32;
  const spines = armSet(c, c, (i, a) => `M${P2(at(c, c, 3, a))}L${P2(at(c, c, 28, a))}`);
  const twigs = armSet(c, c, (i, a) => {
    let d = '';
    for (const [r, l] of [[10, 8], [17, 7], [23, 4.6]]) {
      const m = at(c, c, r, a);
      d += `M${P2(m)}L${P2(at(m[0], m[1], l, a - 42))}M${P2(m)}L${P2(at(m[0], m[1], l, a + 42))}`;
    }
    return d;
  });
  let s = line(spines + twigs, P.sugar, 7.4);
  s += line(spines + twigs, P.limeLine, 4.4);
  s += line(spines + twigs, P.lime, 2.2);
  for (let i = 0; i < 6; i++) {
    const t = at(c, c, 28.4, -90 + i * 60);
    s += `<path d="${circ(t[0], t[1], 3.4)}" fill="${P.sugar}"/><path d="${circ(t[0], t[1], 2.2)}" fill="${P.lime}" stroke="${P.limeLine}" stroke-width="1"/>`;
  }
  // small open hexagon ring in the centre
  const hx = []; for (let i = 0; i < 6; i++) hx.push(at(c, c, 6, -90 + i * 60));
  s += rimmed(poly(hx), P.limeLine, 3.2, 3.6) + `<path d="${poly(hx)}" fill="${P.lime}" stroke="${P.limeHi}" stroke-width="1.2"/>`;
  s += `<path d="${circ(c, c, 2)}" fill="${P.limeHi}"/>`;
  return svg(64, 64, s);
}
function flakeGrape() {
  // star plate: broad 6-point star with a faceted hexagon centre and notched tips
  _id = 0; PFX = 'fg';
  const c = 32;
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = -90 + i * 30;
    if (i % 2) pts.push(at(c, c, 13, a));
    else { pts.push(at(c, c, 25, a - 7)); pts.push(at(c, c, 27, a)); pts.push(at(c, c, 25, a + 7)); }
  }
  const star = poly(pts);
  const hx = []; for (let i = 0; i < 6; i++) hx.push(at(c, c, 10.5, -90 + i * 60));
  const hx2 = []; for (let i = 0; i < 6; i++) hx2.push(at(c, c, 5.4, -90 + i * 60));
  let facets = '';
  for (let i = 0; i < 6; i++) {
    const a = -90 + i * 60;
    facets += `<path d="${poly([at(c, c, 11, a), at(c, c, 25, a - 7), at(c, c, 27, a)])}" fill="${P.grapeDeep}" opacity="0.55"/>`;
    facets += line(`M${P2(at(c, c, 12, a))}L${P2(at(c, c, 22, a))}`, P.grapeHi, 1.4, ' opacity="0.85"');
  }
  let s = rimmed(star, P.grapeLine, 2.6, 5);
  s += `<path d="${star}" fill="${P.grape}"/>` + facets;
  s += `<path d="${poly(hx)}" fill="${P.grapeHi}" stroke="${P.grapeLine}" stroke-width="1.8" stroke-linejoin="round"/>`;
  s += `<path d="${poly(hx2)}" fill="${P.grape}" stroke="${P.grapeLine}" stroke-width="1.2" stroke-linejoin="round"/>`;
  s += `<path d="${ell(c - 2, c - 6.4, 3, 1.3)}" fill="#fff" opacity="0.85"/>`;
  return svg(64, 64, s);
}
function flakeGold() {
  // big ornate flake: arms with forked crowns + diamond, a ring, centre sparkle + glints
  _id = 0; PFX = 'fo';
  const c = 32;
  const arms = armSet(c, c, (i, a) => {
    let d = `M${P2(at(c, c, 6, a))}L${P2(at(c, c, 25, a))}`;
    const m = at(c, c, 19, a);
    d += `M${P2(m)}L${P2(at(m[0], m[1], 7.5, a - 50))}M${P2(m)}L${P2(at(m[0], m[1], 7.5, a + 50))}`;
    const n = at(c, c, 11, a);
    d += `M${P2(n)}L${P2(at(n[0], n[1], 5.5, a - 60))}M${P2(n)}L${P2(at(n[0], n[1], 5.5, a + 60))}`;
    return d;
  });
  let s = `<path d="${circ(c, c, 30)}" fill="${P.goldHi}" opacity="0.28"/>`;
  s += line(arms, P.sugar, 9) + line(arms, P.goldLine, 6) + line(arms, P.gold, 3.4);
  for (let i = 0; i < 6; i++) {
    const a = -90 + i * 60, t = at(c, c, 26.5, a);
    const dm = poly([at(t[0], t[1], 4.6, a), at(t[0], t[1], 3, a + 90), at(t[0], t[1], 3.4, a + 180), at(t[0], t[1], 3, a - 90)]);
    s += rimmed(dm, P.goldLine, 1.6, 3.4) + `<path d="${dm}" fill="${P.goldHi}"/>`;
  }
  s += `<path d="${circ(c, c, 13)}" fill="none" stroke="${P.sugar}" stroke-width="5"/><path d="${circ(c, c, 13)}" fill="none" stroke="${P.goldLine}" stroke-width="3"/><path d="${circ(c, c, 13)}" fill="none" stroke="${P.gold}" stroke-width="1.4"/>`;
  s += `<path d="${circ(c, c, 8)}" fill="${P.gold}" stroke="${P.goldLine}" stroke-width="2"/>`;
  s += sparkle(c, c, 7.4, '#fff', P.goldDeep, 1);
  s += sparkle(12, 10, 4.2, '#fff', P.goldDeep, 0.8) + sparkle(53, 52, 3.6, '#fff', P.goldDeep, 0.8) + sparkle(54, 14, 2.6, '#fff');
  return svg(64, 64, s);
}

function bubble() {
  _id = 0; PFX = 'b';
  let s = `<path d="${circ(48, 48, 43)}" fill="${P.bub}" opacity="0.16"/>`;
  s += `<path d="${circ(48, 48, 43)}" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.75"/>`;
  s += `<path d="${circ(48, 48, 41)}" fill="none" stroke="#9fe7f5" stroke-width="1.2" opacity="0.5"/>`;
  s += line('M18 38Q22 22 38 14', '#fff', 5, ' opacity="0.85"');
  s += `<path d="${ell(24, 22, 3.2, 2.2)}" fill="#fff" opacity="0.9" transform="rotate(-40 24 22)"/>`;
  s += line('M76 66Q72 76 62 82', '#fff', 2.4, ' opacity="0.5"');
  for (const [x, y, r] of [[70, 20, 2.4], [78, 28, 1.6], [64, 14, 1.3], [22, 70, 1.8], [30, 78, 1.2]]) s += `<path d="${circ(x, y, r)}" fill="none" stroke="#fff" stroke-width="1" opacity="0.8"/>`;
  return svg(96, 96, s);
}

// --------------------------------------------------------------- sour gummies
function sugarDots(seed, n, box, clip) {
  let s = '', x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const px = box[0] + rnd() * (box[2] - box[0]), py = box[1] + rnd() * (box[3] - box[1]), r = 0.7 + rnd() * 1.1;
    s += `<path d="${poly([[px, py - r * 1.3], [px + r, py], [px, py + r * 1.3], [px - r, py]])}" fill="#fffaf0" opacity="${f(0.6 + rnd() * 0.4)}"/>`;
  }
  return s;
}
function gummy() {
  _id = 0; PFX = 'g';
  const body = 'M18 40Q20 18 48 16Q74 16 82 36Q84 42 82 46Q74 64 48 64Q20 62 18 40Z';
  let s = '';
  // tail (left), fins
  s += shape('M22 40Q12 26 4 24Q2 24 3 27Q8 40 3 53Q2 56 4 56Q12 54 22 40Z', P.gumShade, P.gumLine, { sw: 2.6, inner: sugarDots(7, 10, [2, 22, 22, 58]) });
  s += shape('M40 18Q46 6 58 8Q62 9 60 13Q56 18 56 18Z', P.gumShade, P.gumLine, { sw: 2.4 });
  s += shape(body, P.gum, P.gumLine, {
    shade: 'M14 48Q48 70 90 46L90 70L14 70Z', shadeFill: P.gumShade,
    inner: `<path d="${ell(52, 50, 22, 9)}" fill="${P.gumBelly}" opacity="0.7"/>` + sugarDots(3, 46, [18, 16, 84, 64]),
    hi: ell(40, 25, 10, 4), hiOp: 0.5,
  });
  s += shape('M44 50Q52 60 42 62Q38 58 44 50Z', P.gumShade, P.gumLine, { sw: 2.2 });
  // eye with a little pouty brow
  s += shape(ell(64, 33, 6.4, 7.4), '#fff', P.gumLine, { sw: 1.8 }) + `<path d="${ell(65.6, 34.4, 3.6, 4.4)}" fill="#4a2a1a"/><path d="${circ(64.4, 32.4, 1.5)}" fill="#fff"/>`;
  s += line('M57 24.5Q63 23 70 26.5', P.gumLine, 2.2);
  // pouty lips
  s += shape('M78 43Q85 40 86 44Q87 48 80 49Q77 46 78 43Z', '#ff6f6f', '#b43a2a', { sw: 1.6 });
  s += line('M79.6 45.8L85 45.6', '#b43a2a', 1);
  s += `<path d="${ell(70, 44, 4, 2.4)}" fill="${P.blush}" opacity="0.7"/>`;
  return svg(96, 80, s);
}
function gummyPuffed() {
  _id = 0; PFX = 'gp';
  const c = [48, 48];
  let s = '';
  // sugar crystals sticking out all around
  for (let i = 0; i < 16; i++) {
    const a = i * 22.5 + 8, b = at(c[0], c[1], 32, a);
    const pts = [at(b[0], b[1], 4, a - 90), at(b[0], b[1], 9 + (i % 3) * 1.5, a), at(b[0], b[1], 4, a + 90), at(b[0], b[1], 2, a + 180)];
    s += `<path d="${poly(pts)}" fill="#fffaf0" stroke="${P.gumLine}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  // tiny tail + fins
  s += shape('M18 48Q8 38 5 40Q4 48 5 56Q8 58 18 48Z', P.gumShade, P.gumLine, { sw: 2.2 });
  s += shape(circ(48, 48, 32), P.gum, P.gumLine, {
    shade: 'M10 58Q48 86 88 56L88 90L10 90Z', shadeFill: P.gumShade,
    inner: sugarDots(11, 60, [16, 16, 80, 80]),
    hi: ell(36, 28, 10, 5), hiOp: 0.5,
  });
  // squeezed eyes >_<
  s += line('M50 34L58 38L50 42', P.gumLine, 2.8);
  s += line('M76 33L68 37.6L75 42', P.gumLine, 2.8);
  // puckered sour lips
  s += shape(ell(72, 54, 5, 4.4), '#ff6f6f', '#b43a2a', { sw: 1.6 });
  s += line('M69.6 52L74.4 56M74.4 52L69.6 56', '#b43a2a', 1.1);
  s += `<path d="${ell(54, 50, 5, 3)}" fill="${P.blush}" opacity="0.7"/><path d="${ell(84, 48, 3, 2.4)}" fill="${P.blush}" opacity="0.7"/>`;
  s += line('M30 58Q34 63 30 68', P.gumLine, 2.2, ' opacity="0.6"');
  return svg(96, 96, s);
}

// --------------------------------------------------------------- deco fish
function fishA() {
  // translucent cherry jelly fish
  _id = 0; PFX = 'fa';
  const body = 'M16 24Q20 8 42 8Q64 8 72 22Q73 25 72 27Q64 40 42 40Q20 40 16 24Z';
  let s = shape('M20 24Q10 12 4 12Q2 12 3 15Q7 24 3 33Q2 36 4 36Q10 36 20 24Z', P.cherry, P.cherryLine, { sw: 2.4, op: 0.85 });
  s += shape(body, P.cherry, P.cherryLine, {
    sw: 2.4, op: 0.86,
    shade: 'M10 30Q40 46 80 28L80 46L10 46Z', shadeFill: '#e23a58',
    inner: `<path d="${ell(44, 30, 16, 5)}" fill="#ffd0d8" opacity="0.45"/>` + `<path d="${circ(30, 20, 2)}" fill="#fff" opacity="0.4"/><path d="${circ(36, 32, 1.4)}" fill="#fff" opacity="0.4"/>`,
    hi: 'M24 18Q30 11 44 11L44 14Q32 15 26 20Z', hiOp: 0.75,
  });
  s += shape('M38 9Q44 2 52 4Q54 6 52 9Z', P.cherry, P.cherryLine, { sw: 2, op: 0.9 });
  s += shape(ell(58, 21, 4.4, 5), '#fff', P.cherryLine, { sw: 1.4 }) + `<path d="${ell(59.2, 22, 2.6, 3.2)}" fill="#3a1a2a"/><path d="${circ(58.2, 20.6, 1)}" fill="#fff"/>`;
  s += line('M64 30Q67 32 70 29', P.cherryLine, 1.6);
  return svg(80, 48, s);
}
function fishB() {
  // small striped blue/white candy fish
  _id = 0; PFX = 'fbb';
  const body = 'M18 24Q22 10 42 10Q62 10 70 22Q71 25 70 27Q62 38 42 38Q22 38 18 24Z';
  let stripes = '';
  for (const x of [26, 38, 50]) stripes += `<path d="M${x} 0L${x + 6} 0L${x + 2} 48L${x - 4} 48Z" fill="${P.bfBlue}"/>`;
  let s = shape('M22 24Q12 14 5 14Q3 14 4 17Q8 24 4 31Q3 34 5 34Q12 34 22 24Z', P.bfBlue, P.bfLine, { sw: 2.4, inner: line('M8 18L14 24L8 30', P.bfFin, 1.6) });
  s += shape('M36 11Q42 3 52 6Q54 9 50 12Z', P.bfFin, P.bfLine, { sw: 2 });
  s += shape(body, P.bfWhite, P.bfLine, {
    sw: 2.4, inner: stripes, shade: 'M10 30Q40 44 80 28L80 46L10 46Z', shadeFill: '#1f5a9c" opacity="0.16',
    hi: ell(38, 15, 9, 2.4), hiOp: 0.8,
  });
  s += shape(ell(60, 21, 4, 4.6), '#fff', P.bfLine, { sw: 1.4 }) + `<path d="${ell(61, 22, 2.4, 3)}" fill="#1a2a4a"/><path d="${circ(60.2, 20.6, 0.9)}" fill="#fff"/>`;
  s += line('M63 30Q66 32 69 29', P.bfLine, 1.6);
  s += `<path d="${ell(55, 28, 3, 1.8)}" fill="${P.blush}" opacity="0.7"/>`;
  return svg(80, 48, s);
}

// --------------------------------------------------------------- HUD bits
function spool() {
  _id = 0; PFX = 's';
  let s = '';
  // licorice line wound on the drum
  const drum = 'M14 18H50V46H14Z';
  let wraps = '';
  for (let y = 19; y < 47; y += 4.6) wraps += line(`M12 ${y}Q32 ${y + 2.6} 52 ${y}`, P.licLine, 1.2, ' opacity="0.65"');
  s += shape(drum, P.lic, P.licLine, { sw: 2.6, inner: wraps, hi: 'M18 19H24V45H18Z', hiOp: 0.35, shade: 'M42 16H54V48H42Z', shadeFill: '#b51a30' });
  // flanges (biscuit discs)
  for (const y of [10, 46]) {
    s += shape(`M6 ${y + 2}Q6 ${y} 9 ${y}H55Q58 ${y} 58 ${y + 2}V${y + 6}Q58 ${y + 8} 55 ${y + 8}H9Q6 ${y + 8} 6 ${y + 6}Z`, P.spoolW, P.spoolLine, {
      sw: 2.4, shade: `M4 ${y + 5}H60V${y + 10}H4Z`, shadeFill: P.spoolWShade,
      inner: [12, 20, 28, 36, 44, 52].map((x) => `<path d="${circ(x, y + 3.6, 0.9)}" fill="${P.spoolLine}" opacity="0.6"/>`).join(''),
    });
  }
  // loose line end curling off
  s += line('M50 34Q58 36 58 44Q58 52 52 56', P.licLine, 4.8) + line('M50 34Q58 36 58 44Q58 52 52 56', P.lic, 2.6);
  s += line('M51 35Q56.4 37 56.6 43', P.licHi, 1, ' opacity="0.9"');
  return svg(64, 64, s);
}
function windsock() {
  _id = 0; PFX = 'w';
  let s = '';
  // lollipop pole (bottom (10,62)), swirl ball on top
  s += limb('M10 62L10 8', 3.4, P.pole, P.poleLine, 1.6);
  // sock attached at (14,14): cone from mouth (x14) to tail (x90), pink/white bands
  const sock = 'M14 6Q14 4 16 4.4L88 13Q91 13.6 91 16.4L91 19.6Q91 22.4 88 23L16 31.6Q14 32 14 30Z';
  let bands = '';
  const xs = [14, 29, 44, 59, 74, 92];
  for (let i = 0; i < xs.length - 1; i++) bands += `<path d="M${xs[i]} 0H${xs[i + 1]}V40H${xs[i]}Z" fill="${i % 2 ? P.sockW : P.sockPink}"/>`;
  s += shape(sock, P.sockPink, P.sockLine, {
    sw: 2, inner: bands + `<path d="M10 22L96 18L96 40L10 40Z" fill="#7a1f45" opacity="0.14"/>`,
    hi: 'M18 8L86 14.6L86 16L18 11Z', hiOp: 0.6,
  });
  // mouth ring + bracket
  s += shape(ell(14.6, 18, 3, 14.4), '#ffe9f2', P.sockLine, { sw: 2 });
  s += line('M10 14L13 14', P.poleLine, 2);
  s += shape(circ(8, 6.4, 4.6), '#ffd84a', '#a87a12', { sw: 1.6, inner: line('M8 6.4m0 0q1.4 0 1 1.4q-0.7 1.5 -2.6 0.7q-1.9 -1.2 -0.7 -3.2q1.5 -2 4.1 -0.7', '#ff7aa8', 1.3), hi: circ(6.6, 4.8, 1.1), hiOp: 0.9 });
  return svg(96, 64, s);
}

// --------------------------------------------------------------- app icon
function icon() {
  _id = 0; PFX = 'i';
  let s = `<defs><radialGradient id="ibg" cx="0.5" cy="0.36" r="0.7"><stop offset="0" stop-color="#fff2f8"/><stop offset="0.6" stop-color="#ffc6de"/><stop offset="1" stop-color="#c9a8f2"/></radialGradient>` +
    `<linearGradient id="iwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe3e0"/><stop offset="1" stop-color="#2f9bb5"/></linearGradient></defs>`;
  s += `<path d="${circ(128, 128, 122)}" fill="url(#ibg)" stroke="#9b6ad6" stroke-width="6"/>`;
  s += `<clipPath id="iclip"><path d="${circ(128, 128, 119)}"/></clipPath><g clip-path="url(#iclip)">`;
  s += `<path d="M0 196H256V256H0Z" fill="url(#iwater)"/>`;
  // sparkles in the sky
  // Taffy head (the sprite's head geometry, scaled), peeking over the dock
  const k = 2.4, ox = 112 - 80 * k, oy = 120 - 52 * k;
  let head = '';
  head += taffyHorns(false);
  head += shape('M58 56Q48 50 46 58Q50 60 47 66Q54 66 58 64Z', P.ridge, P.wingLine, { sw: 2 });
  head += shape([HEAD, MUZZLE], P.mint, P.mintLine, { shade: 'M50 66Q74 82 120 68L120 90L50 90Z', shadeFill: P.mintShade, hi: ell(68, 36, 8, 4.5), hiOp: 0.55 });
  head += taffyNostrils();
  head += eyeOpen(86, 50, 8, 10.5, 2, -1) + eyeOpen(103.5, 47, 6, 9, 2, -1);
  head += shape('M95 65Q104 64 114 63Q114 74 104 76Q96 75 95 65Z', P.mouth, P.mouth, { sw: 1.4, inner: `<path d="${ell(105, 76, 7, 4.5)}" fill="${P.tongue}"/>` });
  head += blush();
  s += `<g transform="translate(${f(ox)} ${f(oy)}) scale(${k})">${head}</g>`;
  // raised arm holding the snowflake up (right of the snout)
  s += limb('M236 196Q222 150 210 112', 17, P.mint, P.mintLine, 3.4);
  // wafer dock edge with pink icing
  s += shape('M0 184H256V222H0Z', '#f3c98b', '#a8743a', { sw: 3, inner: [20, 52, 84, 116, 148, 180, 212, 244].map((x) => line(`M${x} 184V222`, '#d9a764', 2.4)).join('') + line('M0 203H256', '#d9a764', 2.4) });
  s += `<path d="M0 190Q14 200 24 190Q38 206 54 190Q68 200 82 190Q98 206 114 190Q128 200 144 190Q158 206 174 190Q188 200 202 190Q218 206 234 190Q246 198 256 190V180H0Z" fill="#fff4fa" stroke="#e5a3c2" stroke-width="2.4"/>`;
  // front paw resting on the dock
  s += paw(78, 186, 12) + paw(102, 188, 11);
  s += `</g>`;
  // the big pink snowflake held up (berry geometry), paw under it
  const flake = flakeBerry().replace(/<\/?svg[^>]*>/g, '');
  s += `<g transform="translate(160 24) scale(1.38)">${flake}</g>`;
  s += paw(209, 108, 12);
  s += sparkle(160, 36, 8, '#fff', '#e57ea9', 1.6) + sparkle(244, 70, 7, '#fff', '#e57ea9', 1.4) + sparkle(46, 70, 8, '#fff', '#c9a8f2', 1.4);
  s += `<path d="${circ(128, 128, 122)}" fill="none" stroke="#fff" stroke-width="2" opacity="0.6"/>`;
  return svg(256, 256, s);
}

// ================================================================= write
const files = {
  'taffy_idle.svg': taffy('idle'), 'taffy_reel.svg': taffy('reel'), 'taffy_happy.svg': taffy('happy'), 'taffy_oops.svg': taffy('oops'),
  'jar.svg': jar(), 'hook.svg': hook(),
  'flake_berry.svg': flakeBerry(), 'flake_lime.svg': flakeLime(), 'flake_grape.svg': flakeGrape(), 'flake_gold.svg': flakeGold(),
  'bubble.svg': bubble(), 'gummy.svg': gummy(), 'gummy_puffed.svg': gummyPuffed(),
  'fish_a.svg': fishA(), 'fish_b.svg': fishB(), 'spool.svg': spool(), 'windsock.svg': windsock(), 'icon.svg': icon(),
};
fs.mkdirSync(OUT, { recursive: true });
for (const [n, c] of Object.entries(files)) {
  if (/<text|<image|<script|href=/i.test(c)) throw new Error('forbidden element in ' + n);
  fs.writeFileSync(path.join(OUT, n), c);
}
// remove the scaffold's panda-game files
for (const n of fs.readdirSync(OUT)) {
  if (/^(bao_.*|bucket|gem_.*|puffer.*)\.svg$/.test(n)) fs.unlinkSync(path.join(OUT, n));
}
console.log('wrote', Object.keys(files).length, 'files to', OUT);
module.exports = { TIP_IDLE, TIP_REEL };
