#!/usr/bin/env node
// Character & item art generator for Bao's Arctic Reel.
// 100% original hand-written SVG. Bao's four frames are built from the same
// body parts so the body geometry is identical (only face, arms, rod change).
// Usage: node tools/art-characters/gen.js   (writes into game/assets/default/)
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../game/assets/default');

// ---------------------------------------------------------------- palette
const P = {
  // Bao
  fur: '#2b2f3a', furHi: '#434a5c', furLine: '#1c1f28',
  white: '#fbfaf6', whiteShade: '#dde3ee', whiteLine: '#4a5163',
  eyeWhite: '#ffffff', iris: '#3b2a22', nose: '#1c1f28', mouth: '#c9445a', tongue: '#ff8a9c',
  blush: '#ff8fa3', pad: '#8b8fa0',
  red: '#e5383b', redShade: '#b8262c', redLine: '#7a1418', cream: '#fff3e0', creamShade: '#ecd9bd',
  // stool / bucket metal
  metal: '#9fb4c8', metalShade: '#7890a8', metalLine: '#3d5164', metalHi: '#d8e4ef',
  // rod
  wood: '#c98a4b', woodShade: '#a66b31', woodLine: '#6b3f17', blank: '#f6d77a', blankLine: '#7a5a1a',
  reel: '#c5ccd6', reelLine: '#4b5466',
  // gems
  am: '#a46be0', amLight: '#d2b0f7', amDark: '#7440b8', amLine: '#3f1f6e',
  em: '#2fc27a', emLight: '#93ecbd', emDark: '#17905a', emLine: '#0d4f33',
  ru: '#f0384f', ruLight: '#ff9aa8', ruDark: '#b81f37', ruLine: '#6a0f1e',
  go: '#ffcf2e', goLight: '#fff1a6', goDark: '#e69a10', goLine: '#7a4a00',
  rim: '#f2fbff',
  // bubble
  bub: '#cff6ff', bubRim: '#e3fbff',
  // puffer
  pf: '#ffb547', pfShade: '#f28f2c', pfBelly: '#fff0b8', pfSpot: '#e9822a', pfLine: '#9a4a14', pfFin: '#ffd36b',
  // fish
  chBack: '#6f98c4', chSide: '#b9d3ea', chBelly: '#ffb2a6', chLine: '#2f4f74', chSpot: '#eef7ff',
  stTeal: '#2fb5b0', stWhite: '#f4fffd', stLine: '#145f63', stFin: '#7fe0d6',
  // bobber
  bobRed: '#ef3b3f', bobWhite: '#ffffff', hookMetal: '#c9d2dc', hookLine: '#4b5466',
  // badge
  badge: '#bfe9fa', badgeDark: '#8fd0ee', badgeLine: '#2f6f99', iceTop: '#ffffff', ice: '#d4effa', hole: '#1d4f86',
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
// filled shape with clipped cel shade/inner details + highlight, then outline on top
function shape(d, fill, lineC, opt = {}) {
  const sw = opt.sw ?? 3;
  let s = '';
  if (opt.shade || opt.hi || opt.inner) {
    const id = `${PFX}${++_id}`;
    s += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    s += `<path d="${d}" fill="${fill}"/>`;
    s += `<g clip-path="url(#${id})">`;
    if (opt.shade) s += `<path d="${opt.shade}" fill="${opt.shadeFill}"/>`;
    if (opt.inner) s += opt.inner;
    if (opt.hi) s += `<path d="${opt.hi}" fill="#fff" opacity="${opt.hiOp ?? 0.55}"/>`;
    s += `</g>`;
    if (sw) s += `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else {
    s += `<path d="${d}" fill="${fill}"${sw ? ` stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
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
// light rim + dark outline (gems must pop on dark AND light water)
const rimmed = (d, lineC, sw = 2.6) =>
  `<path d="${d}" fill="none" stroke="${P.rim}" stroke-width="${sw + 5}" stroke-linejoin="round" opacity="0.9"/>` +
  `<path d="${d}" fill="none" stroke="${lineC}" stroke-width="${sw}" stroke-linejoin="round"/>`;

// ================================================================= BAO
// viewBox 0 0 160 160. Seat/feet line y=150. Torso centre (68,96).
// Rod butt is at (88,118); rod tips: idle/happy/oops (150,22), reel (146,14).
const ROD_BUTT = [88, 118];
const TIP_IDLE = [150, 22];
const TIP_REEL = [146, 14];

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// --- body parts shared by every frame
function baoStool() {
  // upturned metal bucket: narrow at top (its base), wide on the ice
  const d = 'M50 121L86 121Q88 121 88.4 123L93 147Q93.4 150 90 150L46 150Q42.6 150 43 147L47.6 123Q48 121 50 121Z';
  let s = shape(d, P.metal, P.metalLine, {
    shade: 'M74 118L100 118L100 152L80 152Z', shadeFill: P.metalShade,
    hi: 'M52 124L57 124L54 147L49 147Z', hiOp: 0.55,
  });
  // rim ribs
  s += line('M45.3 141.5L90.7 141.5', P.metalLine, 2);
  s += line('M47.6 129L88.4 129', P.metalLine, 1.6, ' opacity="0.7"');
  return s;
}
function baoScarfTails() {
  // ends flutter back-left, behind the body
  let s = shape('M52 80Q38 80 24 88Q20 90 22 94Q26 97 30 94Q40 88 54 88Z', P.red, P.redLine, {
    shade: 'M20 92Q34 92 56 86L56 100L20 100Z', shadeFill: P.redShade,
  });
  s += shape('M50 84Q40 92 30 104Q28 108 32 109Q36 110 38 106Q46 96 56 90Z', P.red, P.redLine, {
    shade: 'M30 106Q42 98 56 88L58 112L28 112Z', shadeFill: P.redShade,
  });
  // fringes
  s += line('M22 91L16 90M22 94L17 96M31 107L27 112M35 109L33 114', P.redLine, 2.2);
  s += line('M22 91L17 90.5M22.5 93.8L18 95.5M31 107L28 111M35 109L33.5 113', P.red, 1);
  return s;
}
function baoBackLeg() {
  let s = limb('M66 118Q80 124 84 140', 15, '#252935', P.furLine);
  s += shape(ell(88, 145, 10, 5), '#252935', P.furLine, { sw: 2.6 });
  return s;
}
function baoTorso() {
  const d = ell(68, 96, 30, 28);
  return shape(d, P.white, P.whiteLine, {
    shade: 'M30 100Q50 120 98 108L98 130L30 130Z', shadeFill: P.whiteShade,
    // black shoulder band (panda saddle)
    inner: `<path d="M34 64L102 64L102 84Q86 92 68 90Q48 90 34 82Z" fill="${P.fur}"/>`,
  }) +
    // small white tail
    shape(ell(39.5, 112, 5.5, 5), P.white, P.whiteLine, { sw: 2.4 });
}
function baoFrontLeg() {
  let s = limb('M74 116Q92 118 96 138', 16, P.fur, P.furLine);
  s += line('M80 113Q94 115 99 130', P.furHi, 2.6, ' opacity="0.9"');
  s += shape('M88 141Q88 138 96 138Q108 138 109 145Q109 150 104 150L92 150Q88 150 88 146Z', P.fur, P.furLine, {
    hi: 'M92 140Q98 139 104 140L104 142L92 142Z', hiOp: 0.15,
  });
  // sole pad (toes towards the hole)
  s += shape(ell(105.5, 144.5, 2.2, 3.4), P.pad, P.furLine, { sw: 1.2 });
  return s;
}
function baoScarfWrap() {
  const d = 'M42 76Q68 88 96 74Q99 73 99.5 76L100 82Q99 85 96 86Q68 98 42 87Q39 86 39 83L39 79Q39 75 42 76Z';
  return shape(d, P.red, P.redLine, {
    shade: 'M38 84Q68 96 102 82L102 100L38 100Z', shadeFill: P.redShade,
    inner: line('M48 79L46 88M56 82L55 91M64 84L64 93M72 84L73 93M80 83L81 92M88 80L90 89', P.redShade, 1.6),
  });
}
function baoEars(up) {
  const dy = up ? -5 : 0;
  let s = shape(circ(50, 31 + dy, 9.5), P.fur, P.furLine, { hi: circ(47, 28 + dy, 3.2), hiOp: 0.18 });
  s += shape(circ(92, 25 + dy, 9.5), P.fur, P.furLine, { hi: circ(89, 22 + dy, 3.2), hiOp: 0.18 });
  s += shape(circ(92, 26 + dy, 4.2), '#4b5163', P.furLine, { sw: 0 });
  return s;
}
// head silhouette: big round head with a short muzzle bump towards the right
const HEAD = 'M44 52Q44 24 74 22Q102 22 106 46Q114 50 114 60Q113 72 100 74Q90 80 74 80Q46 80 44 52Z';
function baoHead() {
  return shape(HEAD, P.white, P.whiteLine, {
    shade: 'M40 62Q60 80 96 74L120 70L120 90L40 90Z', shadeFill: P.whiteShade,
    hi: ell(60, 36, 9, 5), hiOp: 0.7,
  });
}
function baoHat() {
  // knitted beanie, tipped slightly towards the hole
  let s = shape('M52 36Q52 14 74 12Q94 12 98 32Z', P.red, P.redLine, {
    shade: 'M84 10Q100 18 100 34L84 34Z', shadeFill: P.redShade,
    inner: line('M62 16L60 34M70 13L69 34M78 12L79 33M86 14L88 32', P.redShade, 1.6),
    hi: ell(62, 20, 4, 2.6), hiOp: 0.35,
  });
  // cream rim band
  s += shape('M50 33Q74 26 100 30Q102 31 101.5 34L101 37Q100 39 98 38.5Q74 34 52 40Q49 41 48.6 38L48.5 36Q48.6 34 50 33Z', P.cream, P.redLine, {
    shade: 'M46 38Q74 33 104 36L104 44L46 44Z', shadeFill: P.creamShade, sw: 2.6,
  });
  // bobble
  s += shape(circ(72, 9, 6.2), P.cream, P.redLine, { shade: circ(75, 12, 5.5), shadeFill: P.creamShade, hi: circ(70, 7, 2.2), hiOp: 0.9, sw: 2.6 });
  return s;
}
function patches() {
  // tilted teardrops, sloping down-outward
  let s = shape('M60 44Q66 40 69 46Q71 54 66 60Q60 66 56 61Q53 56 56 50Q57 46 60 44Z', P.fur, P.furLine, { sw: 1.6 });
  s += shape('M84 42Q92 38 96 44Q99 52 94 59Q88 65 82 60Q79 55 80 49Q81 44 84 42Z', P.fur, P.furLine, { sw: 1.6 });
  return s;
}
function eyesOpen(look = 0, big = false) {
  const r = big ? 6.6 : 5.8;
  let s = '';
  for (const [cx, cy, sc] of [[62.5, 52, 0.82], [89, 50, 1]]) {
    const rr = r * sc;
    s += `<circle cx="${cx}" cy="${cy}" r="${f(rr + 1.3)}" fill="${P.eyeWhite}"/>`;
    s += `<circle cx="${f(cx + 1 + look)}" cy="${cy}" r="${f(rr)}" fill="${P.iris}"/>`;
    s += `<circle cx="${f(cx + 1.4 + look)}" cy="${f(cy + 0.6)}" r="${f(rr * 0.5)}" fill="#120c0a"/>`;
    s += `<circle cx="${f(cx - rr * 0.25 + look)}" cy="${f(cy - rr * 0.38)}" r="${f(rr * 0.38)}" fill="#fff"/>`;
    s += `<circle cx="${f(cx + rr * 0.45 + look)}" cy="${f(cy + rr * 0.4)}" r="${f(rr * 0.17)}" fill="#fff"/>`;
  }
  return s;
}
function eyesHappy() {
  // ^^ arcs (white on the dark patch)
  return line('M57.5 54Q62 46 66.5 53', '#fff', 3.2) + line('M83 52Q89 43 95 51', '#fff', 3.6);
}
function eyesSqueezed() {
  // > < squeezed eyes
  return line('M58 48L65 52.5L58 57', '#fff', 3) + line('M95 46L87 51L95 56', '#fff', 3.4);
}
function nose() {
  return shape('M104 49Q111 48 112 52Q111.5 56 108 57Q104 56 103 53Q102.5 50 104 49Z', P.nose, P.furLine, {
    hi: ell(106.5, 50.8, 2, 1), hiOp: 0.6, sw: 1.4,
  });
}
function blush() {
  return `<ellipse cx="97" cy="64" rx="5.5" ry="3" fill="${P.blush}" opacity="0.75"/>` +
    `<ellipse cx="58" cy="66" rx="4" ry="2.4" fill="${P.blush}" opacity="0.55"/>`;
}
function mouth(kind) {
  if (kind === 'smile') return line('M101 62Q104 66 107.5 62.5', P.furLine, 2) + line('M108 57L107.5 62.5', P.furLine, 1.8);
  if (kind === 'grin') { // focused little determined smile
    return line('M100 63Q104.5 66 109 61.5', P.furLine, 2.2) + line('M108 57L108.6 61.5', P.furLine, 1.8);
  }
  if (kind === 'open') { // happy open smile
    return line('M108 57L108 59', P.furLine, 1.8) +
      shape('M99 61Q108 59 111 60Q111 70 104 70Q99 68 99 61Z', P.mouth, P.furLine, {
        inner: `<path d="M100 66Q105 63 110 67L110 72L100 72Z" fill="${P.tongue}"/>`, sw: 2,
      });
  }
  if (kind === 'o') {
    return line('M108 57L107.5 59.5', P.furLine, 1.8) + shape(ell(105.5, 64, 3.6, 4.4), P.mouth, P.furLine, {
      inner: `<ellipse cx="105.5" cy="67" rx="2.6" ry="1.8" fill="${P.tongue}"/>`, sw: 2,
    });
  }
  return '';
}
function face(kind) {
  let s = patches();
  if (kind === 'idle') s += eyesOpen(0) + blush() + nose() + mouth('smile');
  if (kind === 'reel') s += eyesOpen(1.1) + line('M57 42Q62 40 67 43', P.furLine, 2) + line('M83 40Q89 37 95 41', P.furLine, 2.2) + blush() + nose() + mouth('grin');
  if (kind === 'happy') s += eyesHappy() + blush() + nose() + mouth('open');
  if (kind === 'oops') s += eyesSqueezed() + blush() + nose() + mouth('o') +
    // little sweat drop
    shape('M38 40Q41 46 41 48Q41 51 38 51Q35 51 35 48Q35 46 38 40Z', '#bfe9ff', '#3d7fae', { sw: 1.5 });
  return s;
}

// --- rod
function rodAt(tip, bend = 0) {
  const B = ROD_BUTT;
  const hEnd = lerp(B, tip, 0.24);
  // blank: quadratic from handle end to tip; bend pushes the middle to the right/down
  const mid = lerp(hEnd, tip, 0.5);
  const dx = tip[0] - hEnd[0], dy = tip[1] - hEnd[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L; // right-hand normal (points right/down)
  const ctrl = [mid[0] + nx * bend, mid[1] + ny * bend];
  const blankD = `M${f(hEnd[0])} ${f(hEnd[1])}Q${f(ctrl[0])} ${f(ctrl[1])} ${f(tip[0])} ${f(tip[1])}`;
  let s = '';
  s += line(blankD, P.blankLine, 6.2) + line(blankD, P.blank, 3);
  // line guides
  const q = (t) => { const u = 1 - t; return [u * u * hEnd[0] + 2 * u * t * ctrl[0] + t * t * tip[0], u * u * hEnd[1] + 2 * u * t * ctrl[1] + t * t * tip[1]]; };
  for (const t of [0.4, 0.75]) { const p = q(t); s += `<circle cx="${f(p[0] + nx * 3)}" cy="${f(p[1] + ny * 3)}" r="1.9" fill="none" stroke="${P.reelLine}" stroke-width="1.3"/>`; }
  // tip: small red cap
  s += `<circle cx="${tip[0]}" cy="${tip[1]}" r="2.6" fill="${P.red}" stroke="${P.redLine}" stroke-width="1.4"/>`;
  // handle (wooden grip)
  const hd = `M${B[0]} ${B[1]}L${f(hEnd[0])} ${f(hEnd[1])}`;
  s += limb(hd, 6.5, P.wood, P.woodLine, 2.4);
  const hs = lerp(B, hEnd, 0.5);
  s += line(`M${f(hs[0] - 2.2)} ${f(hs[1] - 1.4)}L${f(hs[0] + 2.2)} ${f(hs[1] + 1.4)}`, P.woodShade, 1.4);
  // reel on the underside of the handle
  const rp = lerp(B, hEnd, 0.42);
  const ux = (hEnd[0] - B[0]), uy = (hEnd[1] - B[1]), ul = Math.hypot(ux, uy);
  const rx = -uy / ul, ry = ux / ul; // perpendicular (lower-right side)
  const rc = [rp[0] + rx * 9.5, rp[1] + ry * 9.5];
  s += line(`M${f(rp[0])} ${f(rp[1])}L${f(rc[0])} ${f(rc[1])}`, P.reelLine, 2.6);
  s += shape(circ(rc[0], rc[1], 6), P.reel, P.reelLine, { sw: 2.2, inner: `<circle cx="${f(rc[0])}" cy="${f(rc[1])}" r="3.6" fill="${P.red}"/>`, hi: circ(rc[0] - 2, rc[1] - 2.5, 1.6), hiOp: 0.8 });
  s += `<circle cx="${f(rc[0])}" cy="${f(rc[1])}" r="1.2" fill="${P.reelLine}"/>`;
  return { svg: s, reelC: rc, handleA: lerp(B, hEnd, 0.15), handleB: lerp(B, hEnd, 0.85) };
}
function crank(rc, ang) {
  const a = (ang * Math.PI) / 180;
  const k = [rc[0] + Math.cos(a) * 7, rc[1] + Math.sin(a) * 7];
  return line(`M${f(rc[0])} ${f(rc[1])}L${f(k[0])} ${f(k[1])}`, P.reelLine, 2.2) +
    `<circle cx="${f(k[0])}" cy="${f(k[1])}" r="2.4" fill="${P.wood}" stroke="${P.woodLine}" stroke-width="1.4"/>`;
}
function paw(cx, cy, r = 6.2) {
  return shape(circ(cx, cy, r), P.fur, P.furLine, { hi: circ(cx - 1.8, cy - 2, r * 0.38), hiOp: 0.2, sw: 2.6 });
}

function bao(kind) {
  _id = 0; PFX = 'b' + kind[0];
  const tip = kind === 'reel' ? TIP_REEL : TIP_IDLE;
  const rod = rodAt(tip, kind === 'reel' ? 10 : 0);
  let s = '';
  s += baoScarfTails();
  s += baoStool();
  s += baoBackLeg();
  // back arm (far side): happy = raised and waving, else reaching the rod butt
  if (kind === 'happy') {
    s += limb('M50 80Q32 76 28 52', 12, '#252935', P.furLine);
    s += paw(28, 48, 6.8);
    s += line('M17 40Q14 46 17 52M12 36Q7 46 12 56', P.furLine, 2, ' opacity="0.55"');
  }
  s += baoTorso();
  s += baoFrontLeg();
  // the near-side (lower) arm: lower grip, or reel crank
  if (kind !== 'happy') {
    if (kind === 'reel') {
      const ang = 120; // crank pointing down-left, paw on the knob
      const a = (ang * Math.PI) / 180;
      const k = [rod.reelC[0] + Math.cos(a) * 7, rod.reelC[1] + Math.sin(a) * 7];
      s += limb(`M54 88Q66 112 ${f(k[0] - 2)} ${f(k[1] + 1)}`, 11.5, P.fur, P.furLine);
      s += rod.svg + crank(rod.reelC, ang);
      s += paw(k[0], k[1], 5.8);
    } else {
      const g = rod.handleA;
      s += limb(`M54 88Q64 112 ${f(g[0] - 2)} ${f(g[1] + 1)}`, 11.5, P.fur, P.furLine);
      s += rod.svg + crank(rod.reelC, 50);
      s += paw(g[0], g[1], 6);
    }
  } else {
    s += rod.svg + crank(rod.reelC, 50);
  }
  s += baoScarfWrap();
  // upper arm holds the top of the handle in every frame
  const h = rod.handleB;
  s += limb(`M84 80Q92 88 ${f(h[0] - 1)} ${f(h[1] + 1)}`, 12, P.fur, P.furLine);
  s += paw(h[0], h[1], 6.4);
  // head
  s += baoEars(kind === 'oops');
  s += baoHead();
  s += face(kind);
  s += baoHat();
  return svg(160, 160, s);
}

// ================================================================= BUCKET
function bucket() {
  _id = 0; PFX = 'k';
  let s = '';
  // handle (back half)
  s += line('M10 30Q32 0 54 30', P.metalLine, 4.2) + line('M10 30Q32 0 54 30', P.metalHi, 1.8);
  // gems peeking out
  s += miniGem(22, 22, 'am', -14) + miniGem(42, 21, 'ru', 12) + miniGem(32, 18, 'em', 0);
  // pail body
  const d = 'M9 30L55 30L49 59Q48.5 62 45 62L19 62Q15.5 62 15 59Z';
  s += shape(d, P.metal, P.metalLine, {
    shade: 'M40 26L60 26L60 64L36 64Z', shadeFill: P.metalShade,
    hi: 'M15 33L20 33L22 58L18 58Z', hiOp: 0.6,
    inner: line('M12 44L52 44', P.metalLine, 1.5, ' opacity="0.55"') + line('M14 53L50 53', P.metalLine, 1.5, ' opacity="0.55"'),
  });
  // rim
  s += shape('M7 27Q7 25 9 25L55 25Q57 25 57 27L57 30Q57 32 55 32L9 32Q7 32 7 30Z', P.metalHi, P.metalLine, { sw: 2.4 });
  // handle lugs
  s += `<circle cx="10" cy="31" r="2.6" fill="${P.metalShade}" stroke="${P.metalLine}" stroke-width="1.6"/><circle cx="54" cy="31" r="2.6" fill="${P.metalShade}" stroke="${P.metalLine}" stroke-width="1.6"/>`;
  return svg(64, 64, s);
}
function miniGem(cx, cy, k, rot) {
  const c = { am: [P.am, P.amLight, P.amDark, P.amLine], em: [P.em, P.emLight, P.emDark, P.emLine], ru: [P.ru, P.ruLight, P.ruDark, P.ruLine] }[k];
  const pts = [[-7, -2], [-4, -7], [4, -7], [7, -2], [0, 8]];
  const d = poly(pts.map((p) => [cx + p[0], cy + p[1]]));
  return `<g transform="rotate(${rot} ${cx} ${cy})">` + shape(d, c[0], c[3], {
    sw: 2,
    inner: `<path d="${poly([[cx - 7, cy - 2], [cx + 7, cy - 2], [cx, cy + 8]])}" fill="${c[2]}"/><path d="${poly([[cx - 4, cy - 7], [cx + 1, cy - 7], [cx - 2, cy - 2], [cx - 7, cy - 2]])}" fill="${c[1]}"/>`,
  }) + `</g>`;
}

// ================================================================= HOOK
function hook() {
  _id = 0; PFX = 'h';
  let s = '';
  // eyelet (line attach at 16,2)
  s += `<circle cx="16" cy="2.6" r="1.6" fill="none" stroke="${P.hookLine}" stroke-width="1.4"/>`;
  // bobber: red top half, white bottom half
  const ball = circ(16, 10.5, 6.6);
  s += shape(ball, P.bobWhite, '#7a1418', {
    sw: 2, inner: `<path d="M8 10.5L24 10.5L24 2L8 2Z" fill="${P.bobRed}"/><path d="M8 10.5L24 10.5" stroke="#b8262c" stroke-width="1.2"/>`,
    hi: ell(13.5, 7.5, 2.2, 1.4), hiOp: 0.85,
  });
  // stem + small sinker
  s += line('M16 17L16 21', P.hookLine, 1.6);
  s += shape('M14 21Q16 20 18 21L18.6 25Q16 26.5 13.4 25Z', '#8c96a6', P.hookLine, { sw: 1.4 });
  // hook: shank down, J bend, point up-left with a tiny barb
  const hd = 'M16 25L16 37Q16 43 11.5 43Q7.5 43 7.5 38L7.5 34.5';
  s += line(hd, P.hookLine, 3.6) + line(hd, P.hookMetal, 1.8);
  s += shape('M7.5 32.5L5.4 36.4L9.4 35.6Z', P.hookMetal, P.hookLine, { sw: 1.2 });
  s += line('M15.3 29L15.3 35', '#fff', 0.8, ' opacity="0.9"');
  return svg(32, 48, s);
}

// ================================================================= GEMS (64x64, centre 32,32)
function gemAmethyst() {
  _id = 0; PFX = 'ga';
  // round brilliant, side profile: table, crown, girdle, pavilion point
  const outer = poly([[20, 11], [44, 11], [58, 25], [32, 57], [6, 25]]);
  let s = `<path d="${outer}" fill="${P.am}"/>`;
  // crown facets
  s += `<path d="${poly([[20, 11], [44, 11], [40, 25], [24, 25]])}" fill="${P.amLight}"/>`;
  s += `<path d="${poly([[6, 25], [20, 11], [24, 25]])}" fill="${P.am}"/>`;
  s += `<path d="${poly([[44, 11], [58, 25], [40, 25]])}" fill="${P.amDark}"/>`;
  // pavilion facets
  s += `<path d="${poly([[6, 25], [24, 25], [32, 57]])}" fill="${P.am}"/>`;
  s += `<path d="${poly([[24, 25], [40, 25], [32, 57]])}" fill="${P.amDark}"/>`;
  s += `<path d="${poly([[40, 25], [58, 25], [32, 57]])}" fill="#5e2f9c"/>`;
  s += line('M6 25L58 25M24 25L32 57M40 25L32 57M20 11L24 25M44 11L40 25', P.amLine, 1.3, ' opacity="0.55"');
  s += rimmed(outer, P.amLine);
  s += `<path d="${poly([[23, 14], [33, 14], [31, 18], [22, 18]])}" fill="#fff" opacity="0.85"/>`;
  s += `<path d="M14 29L19 29L26 42Z" fill="#fff" opacity="0.5"/>`;
  s += sparkle(46, 15, 5);
  return svg(64, 64, s);
}
function gemEmerald() {
  _id = 0; PFX = 'ge';
  // emerald step cut: octagonal rectangle with a stepped table
  const O = [[14, 12], [50, 12], [57, 19], [57, 45], [50, 52], [14, 52], [7, 45], [7, 19]];
  const I = [[21, 21], [43, 21], [46, 24], [46, 40], [43, 43], [21, 43], [18, 40], [18, 24]];
  const outer = poly(O);
  let s = `<path d="${outer}" fill="${P.em}"/>`;
  // four trapezoid bands + corner bits
  s += `<path d="${poly([O[0], O[1], I[1], I[0]])}" fill="${P.emLight}"/>`;
  s += `<path d="${poly([O[7], O[0], I[0], I[7]])}" fill="${P.emLight}" opacity="0.7"/>`;
  s += `<path d="${poly([O[6], O[7], I[7], I[6]])}" fill="${P.em}"/>`;
  s += `<path d="${poly([O[1], O[2], I[2], I[1]])}" fill="${P.em}"/>`;
  s += `<path d="${poly([O[2], O[3], I[3], I[2]])}" fill="${P.emDark}"/>`;
  s += `<path d="${poly([O[3], O[4], I[4], I[3]])}" fill="${P.emDark}"/>`;
  s += `<path d="${poly([O[4], O[5], I[5], I[4]])}" fill="#0f7a4b"/>`;
  s += `<path d="${poly([O[5], O[6], I[6], I[5]])}" fill="${P.emDark}"/>`;
  // table with one inner step
  s += `<path d="${poly(I)}" fill="${P.em}"/>`;
  s += `<path d="${poly([[25, 26], [39, 26], [41, 28], [41, 36], [39, 38], [25, 38], [23, 36], [23, 28]])}" fill="#46d68f" stroke="${P.emLine}" stroke-width="0.9" stroke-opacity="0.45"/>`;
  s += line(O.map((p, i) => `M${p[0]} ${p[1]}L${I[i][0]} ${I[i][1]}`).join(''), P.emLine, 1.2, ' opacity="0.5"');
  s += `<path d="${poly(I)}" fill="none" stroke="${P.emLine}" stroke-width="1.3" opacity="0.6"/>`;
  s += rimmed(outer, P.emLine);
  s += `<path d="M15 15L30 15L26 19L12 19Z" fill="#fff" opacity="0.8"/>`;
  s += `<path d="M26 28L33 28L27 34Z" fill="#fff" opacity="0.55"/>`;
  s += sparkle(50, 13, 5);
  return svg(64, 64, s);
}
function gemRuby() {
  _id = 0; PFX = 'gr';
  // faceted heart
  const outer = 'M32 21Q28 9 18 9Q6 9 6 23Q6 38 32 57Q58 38 58 23Q58 9 46 9Q36 9 32 21Z';
  let s = shape(outer, P.ru, P.ruLine, {
    sw: 0,
    inner:
      `<path d="M32 21Q28 9 18 9Q6 9 6 23L20 24L32 21Z" fill="${P.ruLight}"/>` +
      `<path d="M32 21L20 24L24 36L32 34Z" fill="#ff6a7c"/>` +
      `<path d="M32 21L44 24L40 36L32 34Z" fill="${P.ru}"/>` +
      `<path d="M32 21Q36 9 46 9Q58 9 58 23L44 24Z" fill="${P.ru}"/>` +
      `<path d="M58 23L44 24L40 36L32 57L60 40Z" fill="${P.ruDark}"/>` +
      `<path d="M6 23L20 24L24 36L32 57L4 40Z" fill="#e02a43"/>` +
      `<path d="M24 36L32 34L40 36L32 57Z" fill="#c92440"/>`,
  });
  s += line('M6 23L20 24L32 21L44 24L58 23M20 24L24 36L32 34L40 36L44 24M24 36L32 57L40 36M32 34L32 21', P.ruLine, 1.2, ' opacity="0.5"');
  s += rimmed(outer, P.ruLine);
  s += `<path d="M12 15Q16 12 20 13L15 20Q11 19 12 15Z" fill="#fff" opacity="0.85"/>`;
  s += `<path d="M26 27L30 26L28 32Z" fill="#fff" opacity="0.5"/>`;
  s += sparkle(48, 14, 4.5);
  return svg(64, 64, s);
}
function gemGold() {
  _id = 0; PFX = 'gg';
  // big star cut: each point split into a light and a dark half facet
  const pts = starPts(32, 34, 29, 14);
  const outer = softPoly(pts, 0.14);
  let inner = '';
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const lightSide = (i % 2 === 0);
    const ang = Math.atan2((a[1] + b[1]) / 2 - 34, (a[0] + b[0]) / 2 - 32);
    const up = Math.sin(ang) < 0.1; // upper half lighter
    const col = lightSide ? (up ? P.goLight : P.go) : (up ? P.go : P.goDark);
    inner += `<path d="${poly([[32, 34], a, b])}" fill="${col}"/>`;
  }
  let s = shape(outer, P.go, P.goLine, { sw: 0, inner });
  s += `<path d="${poly(starPts(32, 34, 10, 5))}" fill="#fff6c8" opacity="0.9"/>`;
  s += line(pts.filter((_, i) => i % 2 === 0).map((p) => `M32 34L${f(p[0])} ${f(p[1])}`).join(''), P.goLine, 1.1, ' opacity="0.4"');
  s += rimmed(outer, P.goLine, 2.6);
  s += `<path d="M24 22L30 14L28 24Z" fill="#fff" opacity="0.8"/>`;
  s += sparkle(53, 12, 7, '#fff', P.goLine, 1);
  s += sparkle(11, 47, 4.5, '#fff', P.goLine, 0.9);
  s += sparkle(56, 52, 3.5);
  return svg(64, 64, s);
}

// ================================================================= BUBBLE
function bubble() {
  let s = '';
  s += `<circle cx="48" cy="48" r="44" fill="${P.bub}" fill-opacity="0.15"/>`;
  s += `<circle cx="48" cy="48" r="44" fill="none" stroke="#1b5d86" stroke-width="1" stroke-opacity="0.25"/>`;
  s += `<circle cx="48" cy="48" r="42.5" fill="none" stroke="${P.bubRim}" stroke-width="2.6" stroke-opacity="0.9"/>`;
  s += `<path d="M86 60A40 40 0 0 1 58 87" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.45"/>`;
  // glossy crescent top-left
  s += `<path d="M14 42Q16 18 40 12Q24 22 22 44Q19 47 14 42Z" fill="#fff" opacity="0.85"/>`;
  s += `<circle cx="27" cy="54" r="2.6" fill="#fff" opacity="0.7"/>`;
  s += `<ellipse cx="64" cy="16" rx="5" ry="2.4" transform="rotate(20 64 16)" fill="#fff" opacity="0.55"/>`;
  return svg(96, 96, s);
}

// ================================================================= PUFFER
function pufferFace(cx, cy, puffed) {
  let s = '';
  if (!puffed) {
    // big eye with grumpy half-lid
    s += shape(circ(cx, cy, 7.6), '#fff', P.pfLine, {
      sw: 2.2,
      inner: `<circle cx="${cx + 1.6}" cy="${cy + 1.4}" r="4.8" fill="#2b2230"/><circle cx="${cx + 0.2}" cy="${cy - 0.2}" r="1.8" fill="#fff"/>` +
        `<path d="M${cx - 9} ${cy - 9}L${cx + 9} ${cy - 9}L${cx + 9} ${cy - 2.2}Q${cx} ${cy - 4.2} ${cx - 9} ${cy - 1.2}Z" fill="${P.pf}"/>` +
        `<path d="M${cx - 9} ${cy - 1.2}Q${cx} ${cy - 4.2} ${cx + 9} ${cy - 2.2}" fill="none" stroke="${P.pfLine}" stroke-width="1.8"/>`,
    });
  } else {
    s += line(`M${cx - 5} ${cy - 4}L${cx + 3} ${cy}L${cx - 5} ${cy + 4}`, '#2b2230', 2.8);
  }
  return s;
}
function puffer() {
  _id = 0; PFX = 'p';
  let s = '';
  // tail (left)
  s += shape('M22 40Q12 28 6 30Q4 40 6 50Q12 52 22 40Z', P.pfFin, P.pfLine, { sw: 2.6, inner: line('M8 36L18 40M8 44L18 40', P.pfShade, 1.4) });
  // back fin
  s += shape('M38 21Q44 8 54 14Q52 20 50 22Z', P.pfFin, P.pfLine, { sw: 2.4 });
  // body
  const body = ell(48, 42, 30, 23);
  s += shape(body, P.pf, P.pfLine, {
    shade: 'M14 46Q48 62 82 44L82 70L14 70Z', shadeFill: P.pfShade,
    inner: `<path d="M22 50Q48 70 78 48L78 70L22 70Z" fill="${P.pfBelly}"/>` +
      [[30, 30], [40, 26], [36, 38], [50, 30], [26, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="2.4" fill="${P.pfSpot}" opacity="0.7"/>`).join(''),
    hi: ell(36, 26, 8, 3.5), hiOp: 0.45,
  });
  // tiny soft spines on the belly
  for (const [x, y] of [[34, 58], [44, 62], [56, 61], [66, 56]]) s += line(`M${x} ${y}L${x} ${y + 3}`, P.pfLine, 1.6);
  // side fin
  s += shape('M46 46Q54 42 58 48Q54 54 46 50Z', P.pfFin, P.pfLine, { sw: 2 });
  s += pufferFace(62, 34, false);
  // pouty lips
  s += shape(ell(78.5, 44, 3.6, 4), '#ff8a8a', P.pfLine, { sw: 2 });
  s += line('M76.8 44L80.2 44', P.pfLine, 1.3);
  // cheek
  s += `<ellipse cx="68" cy="47" rx="4" ry="2.4" fill="#ff7e6b" opacity="0.5"/>`;
  return svg(96, 80, s);
}
function pufferPuffed() {
  _id = 0; PFX = 'q';
  let s = '';
  // soft rounded spikes around the ball
  let spikes = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.1;
    const b1 = [48 + Math.cos(a - 0.2) * 32, 48 + Math.sin(a - 0.2) * 32];
    const b2 = [48 + Math.cos(a + 0.2) * 32, 48 + Math.sin(a + 0.2) * 32];
    const t = [48 + Math.cos(a) * 44, 48 + Math.sin(a) * 44];
    spikes += softPoly([b1, t, b2], 0.32);
  }
  s += `<path d="${spikes}" fill="${P.pfFin}" stroke="${P.pfLine}" stroke-width="2.4" stroke-linejoin="round"/>`;
  // tail stub + fins
  s += shape('M12 48Q4 40 2 44Q1 48 2 52Q4 56 12 48Z', P.pfFin, P.pfLine, { sw: 2 });
  const body = circ(48, 48, 35);
  s += shape(body, P.pf, P.pfLine, {
    shade: 'M8 54Q48 80 90 52L90 90L8 90Z', shadeFill: P.pfShade,
    inner: `<path d="M16 62Q48 86 82 60L82 92L16 92Z" fill="${P.pfBelly}"/>` +
      [[30, 28], [42, 22], [26, 42], [38, 36], [56, 24]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="2.8" fill="${P.pfSpot}" opacity="0.7"/>`).join(''),
    hi: ell(34, 24, 10, 4.5), hiOp: 0.5,
  });
  s += shape('M50 56Q58 50 62 58Q58 64 50 60Z', P.pfFin, P.pfLine, { sw: 2 });
  // squeezed eyes
  s += pufferFace(68, 40, true);
  // puffed cheeks + tiny pouty mouth
  s += `<ellipse cx="72" cy="56" rx="7" ry="4.5" fill="#ff7e6b" opacity="0.55"/>`;
  s += shape(ell(82, 50, 3, 3.6), '#ff8a8a', P.pfLine, { sw: 1.8 });
  return svg(96, 96, s);
}

// ================================================================= FISH (80x48, centre 40,24, faces right)
function fishA() {
  _id = 0; PFX = 'fa';
  let s = '';
  s += shape('M18 24Q8 12 3 13Q6 24 3 35Q8 36 18 24Z', P.chBack, P.chLine, { sw: 2.4, inner: line('M6 18L15 24M6 30L15 24', P.chSide, 1.2) });
  s += shape('M34 11Q40 3 50 8L48 12Z', P.chBack, P.chLine, { sw: 2 });
  s += shape('M40 35Q44 42 50 40L48 34Z', P.chBelly, P.chLine, { sw: 2 });
  const body = 'M16 24Q30 8 56 9Q74 11 76 24Q74 37 56 39Q30 40 16 24Z';
  s += shape(body, P.chSide, P.chLine, {
    sw: 2.6,
    inner: `<path d="M10 22Q34 6 80 18L80 0L10 0Z" fill="${P.chBack}"/>` +
      `<path d="M14 28Q40 34 80 28L80 44L14 44Z" fill="${P.chBelly}"/>` +
      [[30, 17], [38, 14], [46, 17], [36, 21], [52, 13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${P.chSpot}"/>`).join(''),
    hi: ell(46, 13, 9, 2), hiOp: 0.35,
  });
  s += line('M62 15Q58 24 62 32', P.chLine, 1.6, ' opacity="0.6"');
  s += `<circle cx="67" cy="20" r="3.6" fill="#fff" stroke="${P.chLine}" stroke-width="1.4"/><circle cx="68" cy="20.4" r="2.2" fill="#1d2433"/><circle cx="67.2" cy="19.4" r="0.8" fill="#fff"/>`;
  s += line('M71 28Q73 29.5 75 28', P.chLine, 1.4);
  return svg(80, 48, s);
}
function fishB() {
  _id = 0; PFX = 'fb';
  let s = '';
  s += shape('M24 24Q15 14 10 15Q13 24 10 33Q15 34 24 24Z', P.stFin, P.stLine, { sw: 2.2 });
  s += shape('M38 14Q42 7 50 11L48 15Z', P.stFin, P.stLine, { sw: 1.8 });
  const body = 'M22 24Q32 12 48 12Q64 13 67 24Q64 35 48 36Q32 36 22 24Z';
  s += shape(body, P.stWhite, P.stLine, {
    sw: 2.4,
    inner: `<path d="M30 8L38 8L38 40L30 40Z" fill="${P.stTeal}"/><path d="M44 8L51 8L51 40L44 40Z" fill="${P.stTeal}"/><path d="M57 8L61 8L61 40L57 40Z" fill="${P.stTeal}" opacity="0.6"/>` +
      `<path d="M18 30Q44 40 70 30L70 42L18 42Z" fill="#000" opacity="0.08"/>`,
    hi: ell(44, 16, 8, 1.8), hiOp: 0.5,
  });
  s += `<circle cx="59" cy="21" r="3.2" fill="#fff" stroke="${P.stLine}" stroke-width="1.3"/><circle cx="60" cy="21.4" r="2" fill="#1d2433"/><circle cx="59.3" cy="20.4" r="0.7" fill="#fff"/>`;
  s += line('M63 27Q64.5 28.2 66 27', P.stLine, 1.3);
  return svg(80, 48, s);
}

// ================================================================= SPOOL
function spool() {
  _id = 0; PFX = 's';
  let s = '';
  // loose line end curling off to the right
  s += line('M44 40Q56 40 56 48Q56 56 48 56', P.redLine, 3.2) + line('M44 40Q56 40 56 48Q56 56 48 56', P.red, 1.6);
  // core with red windings
  const core = 'M18 16L46 16L46 48L18 48Z';
  s += shape(core, P.red, P.redLine, {
    shade: 'M38 10L50 10L50 52L38 52Z', shadeFill: P.redShade,
    inner: line('M16 21L48 23M16 27L48 29M16 33L48 35M16 39L48 41M16 45L48 47', P.redLine, 1.1, ' opacity="0.45"'),
    hi: 'M21 16L25 16L25 48L21 48Z', hiOp: 0.35,
  });
  // wooden flanges top & bottom
  for (const y of [12, 52]) {
    s += shape(`M9 ${y - 4}Q9 ${y - 6} 12 ${y - 6}L52 ${y - 6}Q55 ${y - 6} 55 ${y - 4}L55 ${y + 4}Q55 ${y + 6} 52 ${y + 6}L12 ${y + 6}Q9 ${y + 6} 9 ${y + 4}Z`, P.wood, P.woodLine, {
      shade: `M40 ${y - 8}L58 ${y - 8}L58 ${y + 8}L40 ${y + 8}Z`, shadeFill: P.woodShade,
      hi: `M13 ${y - 4}L30 ${y - 4}L30 ${y - 2}L13 ${y - 2}Z`, hiOp: 0.5, sw: 2.8,
    });
  }
  return svg(64, 64, s);
}

// ================================================================= ICON (256)
function icon() {
  _id = 0; PFX = 'i';
  let s = '';
  // round icy badge
  s += `<circle cx="128" cy="128" r="122" fill="${P.badge}" stroke="${P.badgeLine}" stroke-width="8"/>`;
  s += `<clipPath id="ib"><circle cx="128" cy="128" r="118"/></clipPath><g clip-path="url(#ib)">`;
  s += `<path d="M0 0L256 0L256 120Q180 96 128 104Q60 114 0 140Z" fill="#d9f3fd"/>`;
  for (const [x, y, r] of [[52, 52, 4], [206, 70, 3], [176, 38, 3.4], [40, 104, 2.6]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.9"/>`;
  // ice + hole
  s += `<path d="M0 182Q128 168 256 182L256 256L0 256Z" fill="${P.ice}"/>`;
  s += `<path d="M0 182Q128 168 256 182L256 192Q128 178 0 192Z" fill="#fff"/>`;
  s += shape(ell(128, 206, 82, 22), P.hole, '#123660', { sw: 4, hi: ell(100, 200, 30, 5), hiOp: 0.25 });
  s += `</g>`;
  // panda head (front view, slightly turned) rising out of the hole
  const hx = 120, hy = 142;
  s += shape(circ(hx - 46, hy - 44, 20), P.fur, P.furLine, { sw: 6, hi: circ(hx - 51, hy - 50, 6), hiOp: 0.2 });
  s += shape(circ(hx + 46, hy - 44, 20), P.fur, P.furLine, { sw: 6, hi: circ(hx + 41, hy - 50, 6), hiOp: 0.2 });
  // scarf as the "collar" on the hole edge
  s += shape(`M${hx - 66} ${hy + 40}Q${hx} ${hy + 64} ${hx + 66} ${hy + 40}L${hx + 70} ${hy + 58}Q${hx} ${hy + 84} ${hx - 70} ${hy + 58}Z`, P.red, P.redLine, {
    sw: 6, shade: `M${hx - 80} ${hy + 56}Q${hx} ${hy + 82} ${hx + 80} ${hy + 56}L${hx + 80} ${hy + 90}L${hx - 80} ${hy + 90}Z`, shadeFill: P.redShade,
  });
  s += shape(`M${hx - 66} ${hy}Q${hx - 66} ${hy - 60} ${hx} ${hy - 62}Q${hx + 66} ${hy - 60} ${hx + 66} ${hy}Q${hx + 66} ${hy + 54} ${hx} ${hy + 56}Q${hx - 66} ${hy + 54} ${hx - 66} ${hy}Z`, P.white, P.whiteLine, {
    sw: 6, shade: `M${hx - 80} ${hy + 20}Q${hx} ${hy + 60} ${hx + 80} ${hy + 20}L${hx + 80} ${hy + 80}L${hx - 80} ${hy + 80}Z`, shadeFill: P.whiteShade,
    hi: ell(hx - 30, hy - 40, 18, 8), hiOp: 0.7,
  });
  // patches + eyes
  s += shape(`M${hx - 26} ${hy - 22}Q${hx - 10} ${hy - 24} ${hx - 10} ${hy - 4}Q${hx - 12} ${hy + 14} ${hx - 28} ${hy + 16}Q${hx - 42} ${hy + 12} ${hx - 40} ${hy - 2}Q${hx - 38} ${hy - 20} ${hx - 26} ${hy - 22}Z`, P.fur, P.furLine, { sw: 3 });
  s += shape(`M${hx + 26} ${hy - 22}Q${hx + 10} ${hy - 24} ${hx + 10} ${hy - 4}Q${hx + 12} ${hy + 14} ${hx + 28} ${hy + 16}Q${hx + 42} ${hy + 12} ${hx + 40} ${hy - 2}Q${hx + 38} ${hy - 20} ${hx + 26} ${hy - 22}Z`, P.fur, P.furLine, { sw: 3 });
  for (const ex of [hx - 24, hx + 24]) {
    s += `<circle cx="${ex}" cy="${hy - 3}" r="12" fill="#fff"/><circle cx="${ex + 2}" cy="${hy - 2}" r="10" fill="${P.iris}"/><circle cx="${ex + 2.6}" cy="${hy - 1}" r="5" fill="#120c0a"/>` +
      `<circle cx="${ex - 2}" cy="${hy - 7}" r="4.2" fill="#fff"/><circle cx="${ex + 5}" cy="${hy + 3}" r="1.8" fill="#fff"/>`;
  }
  s += `<ellipse cx="${hx - 44}" cy="${hy + 24}" rx="9" ry="5" fill="${P.blush}" opacity="0.8"/><ellipse cx="${hx + 44}" cy="${hy + 24}" rx="9" ry="5" fill="${P.blush}" opacity="0.8"/>`;
  s += shape(`M${hx - 8} ${hy + 14}Q${hx} ${hy + 11} ${hx + 8} ${hy + 14}Q${hx + 7} ${hy + 21} ${hx} ${hy + 22}Q${hx - 7} ${hy + 21} ${hx - 8} ${hy + 14}Z`, P.nose, P.furLine, { sw: 2, hi: ell(hx - 2, hy + 14.5, 3, 1.4), hiOp: 0.6 });
  s += shape(`M${hx - 12} ${hy + 27}Q${hx} ${hy + 25} ${hx + 12} ${hy + 27}Q${hx + 10} ${hy + 42} ${hx} ${hy + 42}Q${hx - 10} ${hy + 42} ${hx - 12} ${hy + 27}Z`, P.mouth, P.furLine, {
    sw: 3, inner: `<ellipse cx="${hx}" cy="${hy + 40}" rx="8" ry="5" fill="${P.tongue}"/>`,
  });
  // hat
  s += shape(`M${hx - 50} ${hy - 44}Q${hx - 46} ${hy - 96} ${hx} ${hy - 98}Q${hx + 46} ${hy - 96} ${hx + 50} ${hy - 44}Z`, P.red, P.redLine, {
    sw: 6, shade: `M${hx + 22} ${hy - 104}L${hx + 60} ${hy - 104}L${hx + 60} ${hy - 40}L${hx + 26} ${hy - 40}Z`, shadeFill: P.redShade,
    inner: line([-30, -15, 0, 15, 30].map((dx) => `M${hx + dx} ${hy - 96}L${hx + dx * 1.2} ${hy - 44}`).join(''), P.redShade, 3),
  });
  s += shape(`M${hx - 56} ${hy - 50}Q${hx} ${hy - 62} ${hx + 56} ${hy - 50}L${hx + 56} ${hy - 36}Q${hx} ${hy - 48} ${hx - 56} ${hy - 36}Z`, P.cream, P.redLine, { sw: 5, shade: `M${hx - 60} ${hy - 42}Q${hx} ${hy - 52} ${hx + 60} ${hy - 42}L${hx + 60} ${hy - 30}L${hx - 60} ${hy - 30}Z`, shadeFill: P.creamShade });
  s += shape(circ(hx, hy - 102, 13), P.cream, P.redLine, { sw: 5, shade: circ(hx + 5, hy - 97, 11), shadeFill: P.creamShade, hi: circ(hx - 4, hy - 106, 4), hiOp: 0.9 });
  // paw holding up a sparkling purple gem (right side)
  const gx = 192, gy = 108;
  s += limb(`M${hx + 54} ${hy + 46}Q${gx + 4} ${gy + 60} ${gx} ${gy + 30}`, 22, P.fur, P.furLine, 5);
  s += `<g transform="translate(${gx - 42} ${gy - 62}) scale(1.32)">${gemAmethyst().replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</g>`;
  s += shape(circ(gx, gy + 28, 13), P.fur, P.furLine, { sw: 5, hi: circ(gx - 4, gy + 24, 4.5), hiOp: 0.22 });
  s += sparkle(gx + 38, gy - 58, 12, '#fff', P.badgeLine, 2);
  s += sparkle(gx - 40, gy - 50, 8, '#fff', P.badgeLine, 1.6);
  return svg(256, 256, s);
}

// ================================================================= WRITE
const FILES = {
  'bao_idle.svg': () => bao('idle'),
  'bao_reel.svg': () => bao('reel'),
  'bao_happy.svg': () => bao('happy'),
  'bao_oops.svg': () => bao('oops'),
  'bucket.svg': bucket,
  'hook.svg': hook,
  'gem_amethyst.svg': gemAmethyst,
  'gem_emerald.svg': gemEmerald,
  'gem_ruby.svg': gemRuby,
  'gem_gold.svg': gemGold,
  'bubble.svg': bubble,
  'puffer.svg': puffer,
  'puffer_puffed.svg': pufferPuffed,
  'fish_a.svg': fishA,
  'fish_b.svg': fishB,
  'spool.svg': spool,
  'icon.svg': icon,
};
fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(FILES)) {
  const out = fn();
  if (/<text|<image|<script|href=|font/i.test(out)) throw new Error('forbidden content in ' + name);
  fs.writeFileSync(path.join(OUT, name), out);
}
console.log('wrote', Object.keys(FILES).length, 'files to', OUT);
console.log('anchors: seat y=150, body centre (68,96), rod tip idle/happy/oops', TIP_IDLE, 'reel', TIP_REEL);
