#!/usr/bin/env node
// Environment art generator for Mossy's Egg Grove (original, hand-written SVG; no deps).
// Writes into game/assets/default/:
//   nest.svg, nest_front.svg       416x620  twig nest: back panel + walls (behind eggs) / front lip pieces (over eggs)
//                                           inner wall faces x 28 and x 388, inner floor y 568, wall tops y 120
//   vine.svg                       400x40   the danger line (thin flowering vine, centre line y 20)
//   levels/<zone>/sky.svg          960x540  gradient sky glimpsed through the canopy (opaque, cover-fit)
//   levels/<zone>/far.svg          960x360  far forest (trees, toadstool houses, hills), base y 360, tileable
//   levels/<zone>/near.svg         960x240  ferns, flowers, mushrooms, lantern, roots, base y 240, tileable
//   levels/<zone>/ground.svg       960x120  forest floor from the top line y 10 downwards, tileable
//   levels/palette.json            per zone { skyTop, skyBottom, ground, ink, bar, accent }
//   particles/*.svg                32x32 sprites
// zones: spring (Blossom Glade) | summer (Mushroom Meadow) | autumn (Lantern Woods) | winter (Frost Hollow).
// Contract: docs/DESIGN.md §2–§4. Usage: node gen.js [assetsDir]
// Rules: 3 px outlines in darker shades (never black), one-step flat shading, gradients only for sky + glow,
// no filters/text/images/scripts. Gold/yellow is reserved for the golden egg: lights are warm peach.
// It never writes the character files (eggs, mossy_*, baby, fairy, windsock*, bubble, shells, icon).
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));

// ---------- helpers ----------
const f = n => (Math.round(n * 10) / 10).toString();
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') + body + `</svg>\n`;
function write(rel, text) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hx = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dk = (h, k = 0.72) => toHex(hx(h).map(v => v * k));                   // darker shade (outlines / shading)
const lt = (h, k = 0.3) => toHex(hx(h).map(v => v + (255 - v) * k));        // lighter tint (highlights)
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
// place markup drawn around local (0,0) at x and again at x±W when it crosses a tile edge (r = half-width)
function wrap(x, y, r, markup, W = 960) {
  let out = '';
  for (const dx of [0, -W, W]) {
    const X = x + dx;
    if (X + r < 0 || X - r > W) continue;
    out += `<g transform="translate(${f(X)} ${f(y)})">${markup}</g>`;
  }
  return out;
}
const vgrad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
  stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + `</linearGradient>`;
const radial = (id, color, a0, mid) => `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a0}"/>` +
  (mid ? `<stop offset="${mid[0]}" stop-color="${color}" stop-opacity="${mid[1]}"/>` : '') +
  `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
// periodic height: every term has an integer number of periods over W -> seamless
const ridgeY = (W, base, terms) => x => terms.reduce((y, [a, n, ph]) => y - a * Math.sin(Math.PI * 2 * n * x / W + ph), base);
function ridgeFill(W, base, terms, bottom, step = 6) {
  const Y = ridgeY(W, base, terms); let d = '';
  for (let x = -W; x <= 2 * W; x += step) d += (x === -W ? 'M' : 'L') + f(x) + ' ' + f(Y(x));
  return d + `L${2 * W} ${bottom + 10} L${-W} ${bottom + 10} Z`;
}
function ridgeLine(W, base, terms, step = 6) {
  const Y = ridgeY(W, base, terms); let d = '';
  for (let x = -W; x <= 2 * W; x += step) d += (x === -W ? 'M' : 'L') + f(x) + ' ' + f(Y(x));
  return d;
}
// merged blob of circles: outline = slightly bigger circles in a dark shade, then shade, then the lit fill shifted up-left
function blob(circles, fill, o = {}) {
  const sw = o.sw ?? 3, line = o.line || dk(fill, 0.7), shade = o.shade || dk(fill, 0.86);
  const C = (dx, dy, k, dr) => circles.map(([x, y, r]) => `<circle cx="${f(x + dx * r)}" cy="${f(y + dy * r)}" r="${f(Math.max(0.5, r * k + dr))}"/>`).join('');
  let m = `<g fill="${line}">${C(0, 0, 1, sw / 2)}</g><g fill="${shade}">${C(0, 0, 1, -sw / 2)}</g>` +
    `<g fill="${fill}">${C(-0.08, -0.1, 0.86, -sw / 2)}</g>`;
  if (o.hi !== false) { const [x, y, r] = circles.reduce((a, b) => (b[2] > a[2] ? b : a)); m += `<ellipse cx="${f(x - r * 0.36)}" cy="${f(y - r * 0.42)}" rx="${f(r * 0.2)}" ry="${f(r * 0.12)}" fill="${o.hiC || lt(fill, 0.22)}"/>`; }
  return m;
}
const P3 = (fill, line, extra = '') => {
  const m = extra.match(/ ?stroke-width="([\d.]+)"/), w = m ? m[1] : 3;
  return `fill="${fill}" stroke="${line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${m ? extra.replace(m[0], '') : extra}`;
};

// ---------- palettes ----------
// skyTop/skyBottom: sky gradient; ground: fill below the ground tile; ink: HUD text on bar; bar: HUD panel; accent: highlights.
const PALETTE = {
  spring: { skyTop: '#86b7c2', skyBottom: '#e9dccb', ground: '#4d6e43', ink: '#fbf5e8', bar: '#3d5a45', accent: '#e7a3b4' },
  summer: { skyTop: '#5c9fb8', skyBottom: '#d4e6c4', ground: '#3f6b3a', ink: '#f3fae6', bar: '#2c5136', accent: '#e06a52' },
  autumn: { skyTop: '#5c5583', skyBottom: '#eaae8a', ground: '#6a4630', ink: '#fff0e0', bar: '#4a2f2a', accent: '#f0915a' },
  winter: { skyTop: '#3d5076', skyBottom: '#a9bbd3', ground: '#d4dfeb', ink: '#eef4ff', bar: '#2c3a56', accent: '#9cd2e6' }
};
// scene colours per zone. haze = atmospheric colour (far things are mixed toward it).
const Z = {
  spring: { haze: '#c9d6c6', hill: '#7f9e86', trunk: '#7b6a5e', crown: ['#c69aa2', '#7fa07a', '#8eae84'], house: '#e8d9c2', cap: '#c27a68', spot: '#f4e8d8',
    door: '#7a5440', fern: '#5f8f58', fern2: '#79a46a', flower: '#f3ddd0', glow: '#ffd2b0', grass: '#6a9452', soil: '#4d6e43', soil2: '#5b7f4d',
    leaf: ['#e2b2bc', '#f0e2d6'], light: '#ffc9a3', snow: false, blossom: true },
  summer: { haze: '#b9d2b8', hill: '#5f8f66', trunk: '#6d5848', crown: ['#4a8a50', '#5e9c52', '#3a7448'], house: '#efe2c8', cap: '#b9473d', spot: '#f8eedf',
    door: '#6c4734', fern: '#3f7a46', fern2: '#5a9550', flower: '#e8f2e0', glow: '#d8ffcc', grass: '#4f8640', soil: '#3f6b3a', soil2: '#4a7a40',
    leaf: ['#7fae5c', '#c9e0a8'], light: '#ffc196', snow: false },
  autumn: { haze: '#b98f84', hill: '#7a5a5a', trunk: '#5a4038', crown: ['#b8643c', '#a24f36', '#c97f48'], house: '#e6cfb2', cap: '#8f4d3c', spot: '#f2dfc6',
    door: '#5c3a2c', fern: '#8a6a3c', fern2: '#a8793e', flower: '#f6d7c0', glow: '#ffb980', grass: '#8a6c3a', soil: '#6a4630', soil2: '#7a5236',
    leaf: ['#d0703c', '#b8502e', '#e2965a'], light: '#ffb27a', snow: false, lanterns: true },
  winter: { haze: '#8d9fbd', hill: '#6c7f9e', trunk: '#4e5568', crown: ['#466a72', '#3c5d6a', '#557b80'], house: '#e4dccf', cap: '#9a4e4e', spot: '#f4ece2',
    door: '#5a3c34', fern: '#4a6c70', fern2: '#5f8286', flower: '#eef6ff', glow: '#bfe6ff', grass: '#c6d4e3', soil: '#d4dfeb', soil2: '#bccbdc',
    leaf: ['#ffffff', '#dfe9f4'], light: '#ffbe8e', snow: true }
};
const SNOW = '#f2f6fb', SNOWSH = '#c9d6e6', SNOWLN = '#9fb0c8';

// ---------- shared props (all drawn around local 0,0 with the base at y 0) ----------
// big tree: trunk with root flare, bark grooves, shade strip; crown of merged circles
let CLIP = 0;
function tree(o, zz, defs) {
  const { w, h, crown, cr, col, tcol } = o; const R = rng(o.seed || 1);
  const id = 'tc' + (++CLIP);
  const trunk = `M${f(-w / 2)} ${f(-h)} L${f(-w / 2)} ${f(-h * 0.28)} Q${f(-w / 2)} ${f(-h * 0.06)} ${f(-w * 1.05)} 0 L${f(w * 1.05)} 0 Q${f(w / 2)} ${f(-h * 0.06)} ${f(w / 2)} ${f(-h * 0.28)} L${f(w / 2)} ${f(-h)} Z`;
  defs.push(`<clipPath id="${id}"><path d="${trunk}"/></clipPath>`);
  let m = `<path d="${trunk}" fill="${tcol}" stroke="${dk(tcol, 0.7)}" stroke-width="3" stroke-linejoin="round"/>`;
  m += `<g clip-path="url(#${id})"><rect x="${f(w * 0.14)}" y="${f(-h - 5)}" width="${f(w)}" height="${f(h + 10)}" fill="${dk(tcol, 0.86)}"/>`;
  for (let i = 0; i < Math.max(2, Math.round(w / 22)); i++) {
    const x = -w * 0.36 + (i + 0.5) * (w * 0.72) / Math.max(2, Math.round(w / 22)) + (R() - 0.5) * 6;
    m += `<path d="M${f(x)} ${f(-h)} Q${f(x + (R() - 0.5) * 14)} ${f(-h * 0.5)} ${f(x * 1.4)} ${f(-4)}" fill="none" stroke="${dk(tcol, 0.74)}" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  m += `</g>`;
  if (o.roots) for (const sd of [-1, 1]) m += `<path d="M${f(sd * w * 0.45)} ${f(-h * 0.12)} Q${f(sd * w * 0.9)} ${f(-h * 0.06)} ${f(sd * w * 1.35)} 2 L${f(sd * w * 0.9)} 2 Q${f(sd * w * 0.7)} ${f(-h * 0.03)} ${f(sd * w * 0.4)} ${f(-h * 0.02)} Z" ${P3(dk(tcol, 0.92), dk(tcol, 0.7))}/>`;
  // knot hole
  if (o.knot) m += `<ellipse cx="${f(-w * 0.12)}" cy="${f(-h * 0.55)}" rx="${f(w * 0.12)}" ry="${f(w * 0.16)}" ${P3(dk(tcol, 0.55), dk(tcol, 0.45))}/>`;
  if (crown) {
    const cy = -h;
    const circles = crown.map(([x, y, r]) => [x * cr, cy + y * cr, r * cr]);
    m += blob(circles, col);
    if (zz.snow) m += snowCaps(circles);
    if (zz.blossom && o.bloom) { const B = rng(o.seed + 7); for (const [x, y, r] of circles) for (let k = 0; k < 3; k++) { const a = B() * 6.28, d = r * 0.55 * B(); m += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(2.5 + B() * 2)}" fill="${lt(col, 0.45)}"/>`; } }
  }
  return m;
}
// snow lumps on the top of each circle of a crown
function snowCaps(circles) {
  let m = '';
  for (const [x, y, r] of circles) {
    const d = `M${f(x - r * 0.78)} ${f(y - r * 0.5)} Q${f(x)} ${f(y - r * 1.22)} ${f(x + r * 0.78)} ${f(y - r * 0.5)} Q${f(x + r * 0.3)} ${f(y - r * 0.62)} ${f(x)} ${f(y - r * 0.5)} Q${f(x - r * 0.35)} ${f(y - r * 0.64)} ${f(x - r * 0.78)} ${f(y - r * 0.5)} Z`;
    m += `<path d="${d}" ${P3(SNOW, SNOWLN, ' stroke-width="2.5"')}/>`;
  }
  return m;
}
// toadstool house: stem body with round door + lit round windows, dome cap with spots
function house(o, zz, defs, gid) {
  const { w, h, s = 1 } = o; const capW = w * 1.7, capH = h * 0.55;
  const body = `M${f(-w / 2)} 0 Q${f(-w * 0.56)} ${f(-h * 0.5)} ${f(-w * 0.42)} ${f(-h)} L${f(w * 0.42)} ${f(-h)} Q${f(w * 0.56)} ${f(-h * 0.5)} ${f(w / 2)} 0 Z`;
  const bc = o.col || zz.house, id = 'hc' + (++CLIP);
  defs.push(`<clipPath id="${id}"><path d="${body}"/></clipPath>`);
  let m = `<circle cx="${f(w * 0.24)}" cy="${f(-h * 0.5)}" r="${f(h * 0.75)}" fill="url(#${gid})"/>`;
  m += `<path d="${body}" ${P3(bc, dk(bc, 0.66))}/>`;
  m += `<g clip-path="url(#${id})"><rect x="${f(w * 0.2)}" y="${f(-h)}" width="${f(w)}" height="${f(h)}" fill="${dk(bc, 0.88)}"/></g>`;
  // door: round-topped
  const dw = w * 0.34, dh = h * 0.56, dx = -w * 0.14;
  m += `<path d="M${f(dx - dw / 2)} 0 L${f(dx - dw / 2)} ${f(-dh + dw / 2)} A${f(dw / 2)} ${f(dw / 2)} 0 0 1 ${f(dx + dw / 2)} ${f(-dh + dw / 2)} L${f(dx + dw / 2)} 0 Z" ${P3(zz.door, dk(zz.door, 0.65))}/>`;
  m += `<path d="M${f(dx)} ${f(-dh + 3)} L${f(dx)} -2" stroke="${dk(zz.door, 0.75)}" stroke-width="2"/><circle cx="${f(dx + dw * 0.26)}" cy="${f(-dh * 0.45)}" r="2.4" fill="${zz.light}"/>`;
  // round window, lit
  const wr = w * 0.13, wx = w * 0.22, wy = -h * 0.6;
  m += `<circle cx="${f(wx)}" cy="${f(wy)}" r="${f(wr)}" ${P3(zz.light, dk(zz.door, 0.8))}/><path d="M${f(wx - wr)} ${f(wy)} L${f(wx + wr)} ${f(wy)} M${f(wx)} ${f(wy - wr)} L${f(wx)} ${f(wy + wr)}" stroke="${dk(zz.door, 0.8)}" stroke-width="2"/>`;
  // steps
  m += `<ellipse cx="${f(dx)}" cy="0" rx="${f(dw * 0.7)}" ry="4" ${P3('#a4968a', '#766a60', ' stroke-width="2"')}/>`;
  // cap
  const cap = `M${f(-capW / 2)} ${f(-h + 6)} Q${f(-capW * 0.52)} ${f(-h - capH * 1.25)} 0 ${f(-h - capH * 1.12)} Q${f(capW * 0.52)} ${f(-h - capH * 1.25)} ${f(capW / 2)} ${f(-h + 6)} Q0 ${f(-h - 8)} ${f(-capW / 2)} ${f(-h + 6)} Z`;
  const cc = o.cap || zz.cap, cid = 'cc' + (++CLIP);
  defs.push(`<clipPath id="${cid}"><path d="${cap}"/></clipPath>`);
  m += `<path d="${cap}" ${P3(cc, dk(cc, 0.66))}/>`;
  m += `<g clip-path="url(#${cid})"><ellipse cx="${f(capW * 0.32)}" cy="${f(-h + 4)}" rx="${f(capW * 0.5)}" ry="${f(capH * 0.55)}" fill="${dk(cc, 0.85)}"/>`;
  const S = rng(o.seed || 3);
  for (const [sx, sy, sr] of [[-0.28, -0.62, 0.11], [0.05, -0.9, 0.09], [0.3, -0.55, 0.08], [-0.05, -0.45, 0.06], [-0.4, -0.3, 0.06]])
    m += `<ellipse cx="${f(sx * capW + (S() - 0.5) * 4)}" cy="${f(-h + sy * capH)}" rx="${f(sr * capW)}" ry="${f(sr * capW * 0.75)}" fill="${zz.spot}"/>`;
  m += `</g><path d="M${f(-capW * 0.32)} ${f(-h - capH * 0.8)} Q${f(-capW * 0.2)} ${f(-h - capH * 1.02)} ${f(-capW * 0.04)} ${f(-h - capH * 1.04)}" stroke="${lt(cc, 0.3)}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (zz.snow) m += `<path d="M${f(-capW * 0.46)} ${f(-h - capH * 0.45)} Q${f(-capW * 0.4)} ${f(-h - capH * 1.2)} 0 ${f(-h - capH * 1.14)} Q${f(capW * 0.4)} ${f(-h - capH * 1.2)} ${f(capW * 0.46)} ${f(-h - capH * 0.45)} Q${f(capW * 0.25)} ${f(-h - capH * 0.62)} ${f(capW * 0.1)} ${f(-h - capH * 0.5)} Q${f(-capW * 0.15)} ${f(-h - capH * 0.66)} ${f(-capW * 0.46)} ${f(-h - capH * 0.45)} Z" ${P3(SNOW, SNOWLN)}/>`;
  return m;
}
function mushroom(o, zz) {
  const { s = 1 } = o, cc = o.cap || zz.cap, st = lt(zz.house, 0.2);
  let m = `<path d="M${f(-4 * s)} 0 Q${f(-5 * s)} ${f(-9 * s)} ${f(-3 * s)} ${f(-16 * s)} L${f(3 * s)} ${f(-16 * s)} Q${f(5 * s)} ${f(-9 * s)} ${f(4 * s)} 0 Z" ${P3(st, dk(st, 0.66), ' stroke-width="2.5"')}/>`;
  m += `<path d="M${f(-13 * s)} ${f(-14 * s)} Q${f(-12 * s)} ${f(-28 * s)} 0 ${f(-28 * s)} Q${f(12 * s)} ${f(-28 * s)} ${f(13 * s)} ${f(-14 * s)} Q0 ${f(-17 * s)} ${f(-13 * s)} ${f(-14 * s)} Z" ${P3(cc, dk(cc, 0.66), ' stroke-width="2.5"')}/>`;
  m += `<circle cx="${f(-5 * s)}" cy="${f(-22 * s)}" r="${f(2.2 * s)}" fill="${zz.spot}"/><circle cx="${f(4 * s)}" cy="${f(-24 * s)}" r="${f(1.6 * s)}" fill="${zz.spot}"/>`;
  if (zz.snow) m += `<path d="M${f(-10 * s)} ${f(-21 * s)} Q0 ${f(-33 * s)} ${f(10 * s)} ${f(-21 * s)} Q0 ${f(-24 * s)} ${f(-10 * s)} ${f(-21 * s)} Z" fill="${SNOW}" stroke="${SNOWLN}" stroke-width="2"/>`;
  return m;
}
// fern: a curving stem with alternating leaflets (one flat shade on the right side leaflets)
function fern(o) {
  const { len, lean, col, R } = o; let m = '';
  const pt = t => { const x = lean * len * t * t, y = -len * t; return [x, y]; };
  let stem = 'M0 0'; for (let t = 0.05; t <= 1.001; t += 0.05) { const [x, y] = pt(t); stem += ` L${f(x)} ${f(y)}`; }
  const n = Math.max(6, Math.round(len / 9));
  for (let i = 1; i < n; i++) {
    const t = i / n, [x, y] = pt(t), sz = (1 - t * 0.75) * len * 0.22 + 3;
    for (const side of [-1, 1]) {
      const ex = x + side * sz, ey = y - sz * 0.35;
      const c = side > 0 ? dk(col, 0.86) : col;
      m += `<path d="M${f(x)} ${f(y)} Q${f(x + side * sz * 0.5)} ${f(y - sz * 0.55)} ${f(ex)} ${f(ey)} Q${f(x + side * sz * 0.55)} ${f(y + sz * 0.15)} ${f(x)} ${f(y)} Z" ${P3(c, dk(col, 0.66), ' stroke-width="2"')}/>`;
    }
  }
  return `<path d="${stem}" fill="none" stroke="${dk(col, 0.66)}" stroke-width="3" stroke-linecap="round"/>` + m;
}
// glowing flower on a thin stem
function flower(o, zz, gid) {
  const { h, s = 1 } = o, c = o.col || zz.flower;
  let m = `<path d="M0 0 Q${f(-4 * s)} ${f(-h * 0.5)} 0 ${f(-h)}" fill="none" stroke="${dk(zz.fern, 0.75)}" stroke-width="2.5"/>`;
  m += `<path d="M${f(-1 * s)} ${f(-h * 0.4)} q${f(-9 * s)} ${f(-3 * s)} ${f(-12 * s)} ${f(-10 * s)} q${f(8 * s)} ${f(-1 * s)} ${f(12 * s)} ${f(10 * s)} Z" ${P3(zz.fern2, dk(zz.fern2, 0.66), ' stroke-width="2"')}/>`;
  m += `<circle cx="0" cy="${f(-h)}" r="${f(16 * s)}" fill="url(#${gid})"/>`;
  for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; m += `<circle cx="${f(Math.cos(a) * 5 * s)}" cy="${f(-h + Math.sin(a) * 5 * s)}" r="${f(4.2 * s)}" ${P3(c, dk(c, 0.72), ' stroke-width="2"')}/>`; }
  m += `<circle cx="0" cy="${f(-h)}" r="${f(3 * s)}" fill="${zz.glow === '#d8ffcc' ? '#e8ffd8' : '#fff4ea'}"/>`;
  return m;
}
// lantern on a curved post (warm peach light, never saturated yellow)
function lantern(o, zz, gid) {
  const h = o.h, post = '#5e4636';
  let m = `<path d="M0 0 L0 ${f(-h)} Q0 ${f(-h - 26)} 26 ${f(-h - 26)} L32 ${f(-h - 26)}" fill="none" stroke="${dk(post, 0.7)}" stroke-width="9" stroke-linecap="round"/>`;
  m += `<path d="M0 0 L0 ${f(-h)} Q0 ${f(-h - 26)} 26 ${f(-h - 26)} L32 ${f(-h - 26)}" fill="none" stroke="${post}" stroke-width="4" stroke-linecap="round"/>`;
  m += `<path d="M-9 0 Q0 -10 9 0 Z" fill="${post}" stroke="${dk(post, 0.7)}" stroke-width="3"/>`;
  m += lanternHead(34, -h - 26 + 6, zz, gid, 1);
  if (zz.snow) m += `<path d="M-5 ${f(-h - 8)} Q0 ${f(-h - 40)} 30 ${f(-h - 31)} L30 ${f(-h - 27)} Q4 ${f(-h - 30)} 5 ${f(-h)} Z" fill="${SNOW}" stroke="${SNOWLN}" stroke-width="2"/>`;
  return m;
}
function lanternHead(x, y, zz, gid, s) {
  x = Math.round(x * 10) / 10;
  const fr = '#6a4a38';
  let m = `<path d="M${x} ${f(y - 6 * s)} L${x} ${f(y)}" stroke="${fr}" stroke-width="2"/>`;
  m += `<circle cx="${x}" cy="${f(y + 16 * s)}" r="${f(34 * s)}" fill="url(#${gid})"/>`;
  m += `<path d="M${f(x - 9 * s)} ${f(y + 4 * s)} L${f(x + 9 * s)} ${f(y + 4 * s)} L${f(x + 6 * s)} ${f(y)} L${f(x - 6 * s)} ${f(y)} Z" ${P3(fr, dk(fr, 0.7), ' stroke-width="2"')}/>`;
  m += `<ellipse cx="${x}" cy="${f(y + 16 * s)}" rx="${f(10 * s)}" ry="${f(12 * s)}" ${P3(zz.light, '#b26a48')}/>`;
  m += `<ellipse cx="${f(x + 3 * s)}" cy="${f(y + 18 * s)}" rx="${f(5 * s)}" ry="${f(8 * s)}" fill="${dk(zz.light, 0.92)}"/><ellipse cx="${f(x - 4 * s)}" cy="${f(y + 11 * s)}" rx="${f(2 * s)}" ry="${f(3.5 * s)}" fill="#fff1e4"/>`;
  m += `<path d="M${f(x - 7 * s)} ${f(y + 28 * s)} L${f(x + 7 * s)} ${f(y + 28 * s)} L${f(x + 4 * s)} ${f(y + 32 * s)} L${f(x - 4 * s)} ${f(y + 32 * s)} Z" ${P3(fr, dk(fr, 0.7), ' stroke-width="2"')}/>`;
  return m;
}
// arched root (a loop of root going in and out of the ground)
function root(o, col) {
  const { w, h } = o;
  const d = `M${f(-w / 2)} 4 Q${f(-w * 0.45)} ${f(-h)} 0 ${f(-h)} Q${f(w * 0.45)} ${f(-h)} ${f(w / 2)} 4 L${f(w / 2 - 14)} 4 Q${f(w * 0.3)} ${f(-h + 14)} 0 ${f(-h + 14)} Q${f(-w * 0.3)} ${f(-h + 14)} ${f(-w / 2 + 14)} 4 Z`;
  return `<path d="${d}" ${P3(col, dk(col, 0.68))}/><path d="M${f(-w * 0.32)} ${f(-h * 0.55)} Q${f(-w * 0.2)} ${f(-h + 4)} 0 ${f(-h + 4)}" stroke="${lt(col, 0.22)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}
const grassTuft = (col, s = 1) => `<path d="M${f(-8 * s)} 2 Q${f(-7 * s)} ${f(-8 * s)} ${f(-11 * s)} ${f(-14 * s)} Q${f(-3 * s)} ${f(-9 * s)} ${f(-2 * s)} ${f(-3 * s)} Q${f(-1 * s)} ${f(-14 * s)} ${f(2 * s)} ${f(-19 * s)} Q${f(4 * s)} ${f(-10 * s)} ${f(3 * s)} ${f(-3 * s)} Q${f(7 * s)} ${f(-10 * s)} ${f(12 * s)} ${f(-12 * s)} Q${f(8 * s)} ${f(-6 * s)} ${f(8 * s)} 2 Z" ${P3(col, dk(col, 0.68), ' stroke-width="2.5"')}/>`;

// ======================================================================
// SKY (960x540, opaque). Gradient + soft light shafts + canopy framing the top corners (centre left open).
// ======================================================================
function sky(z) {
  const P = PALETTE[z], zz = Z[z]; const R = rng(z.length * 31);
  const defs = vgrad('g', [[0, P.skyTop], [0.62, mix(P.skyTop, P.skyBottom, 0.6)], [1, P.skyBottom]]) +
    radial('lg', z === 'autumn' ? '#ffd9c0' : '#ffffff', 0.38, [0.5, 0.12]) +
    `<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;
  let b = `<rect width="960" height="540" fill="url(#g)"/>`;
  // glow where the light comes in
  const lx = { spring: 600, summer: 380, autumn: 700, winter: 300 }[z];
  b += `<circle cx="${lx}" cy="40" r="300" fill="url(#lg)"/>`;
  // distant soft tree silhouettes low in the sky (very low contrast)
  const far2 = mix(P.skyBottom, zz.haze, 0.5);
  let cs = []; for (let i = 0; i < 14; i++) cs.push([i * 72 + R() * 30, 400 + R() * 30, 50 + R() * 40]);
  b += `<g fill="${far2}" opacity=".8">${cs.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`).join('')}<rect x="0" y="420" width="960" height="120"/></g>`;
  // light shafts (flat white, alpha fading via gradient)
  for (const [x, w, sk] of [[lx - 160, 60, 90], [lx - 40, 34, 110], [lx + 70, 80, 130], [lx + 210, 40, 150]])
    b += `<path d="M${x} -10 L${x + w} -10 L${x + w + sk} 540 L${x + sk - w * 0.4} 540 Z" fill="url(#sh)"/>`;
  if (z === 'autumn') { // pale peach moon low in the dusk + a few tiny white stars
    b += `<circle cx="790" cy="150" r="30" fill="#fbe8dc" stroke="#e2b9a4" stroke-width="3"/><circle cx="778" cy="140" r="6" fill="#efd3c4"/><circle cx="800" cy="162" r="4" fill="#efd3c4"/>`;
    for (const [x, y] of [[430, 60], [520, 110], [610, 42], [700, 86], [360, 128]]) b += `<circle cx="${x}" cy="${y}" r="2" fill="#ffffff" opacity=".8"/>`;
  }
  if (z === 'winter') {
    b += `<circle cx="660" cy="120" r="28" fill="#eef3fb" stroke="#b9c6dc" stroke-width="3"/><circle cx="650" cy="112" r="5" fill="#d9e1ef"/><circle cx="670" cy="130" r="3.5" fill="#d9e1ef"/>`;
    for (const [x, y] of [[380, 70], [470, 40], [560, 96], [760, 60], [330, 150], [600, 170]]) b += `<circle cx="${x}" cy="${y}" r="2" fill="#ffffff" opacity=".85"/>`;
  }
  // canopy framing the top corners (dark, low saturation). Outer edge to x 300 and x 660 at most, mostly y < 140.
  const can = mix(zz.crown[2] || zz.crown[0], P.skyTop, 0.25), can2 = mix(zz.crown[0], P.skyTop, 0.35);
  const Lc = [[0, 0, 130], [110, -20, 110], [210, -30, 90], [60, 110, 80], [-20, 190, 70], [270, 10, 50]];
  const left = Lc.map(([x, y, r]) => [x, y, r]);
  const right = Lc.map(([x, y, r]) => [960 - x * 0.95, y + 10, r * 0.95]);
  b += blob(left.map(([x, y, r]) => [x + 20, y + 30, r * 0.7]), can2, { hi: false });
  b += blob(left, can, { hi: false });
  b += blob(right.map(([x, y, r]) => [x - 20, y + 30, r * 0.7]), can2, { hi: false });
  b += blob(right, can, { hi: false });
  if (zz.snow) b += snowCaps(left.filter(c => c[1] > 60)) + snowCaps(right.filter(c => c[1] > 60));
  if (zz.blossom) for (const [x, y] of [[40, 120], [130, 60], [200, 40], [230, 70], [80, 170], [850, 70], [770, 50], [900, 140], [930, 60], [700, 30]])
    b += `<circle cx="${x}" cy="${y}" r="5" fill="${lt(zz.crown[0], 0.25)}" stroke="${dk(zz.crown[0], 0.8)}" stroke-width="2"/>`;
  // hanging vines from the canopy
  for (const [x, y0, len] of [[250, 60, 120], [300, 20, 70], [705, 50, 100], [660, 20, 60]]) {
    b += `<path d="M${x} ${y0} q-6 ${len / 2} 4 ${len}" fill="none" stroke="${dk(can, 0.8)}" stroke-width="4" stroke-linecap="round"/>`;
    for (let k = 1; k < 4; k++) b += `<ellipse cx="${f(x + (k % 2 ? -5 : 7) + k * 0.6)}" cy="${f(y0 + len * k / 4)}" rx="6" ry="3.5" fill="${lt(can, 0.15)}" stroke="${dk(can, 0.8)}" stroke-width="2"/>`;
  }
  return svg(960, 540, b, defs);
}

// ======================================================================
// FAR (960x360, base y 360, tileable). Atmospheric: everything mixed toward the haze colour.
// Busy items (big trees, houses) sit in x 0..280 and 680..960; the middle has hills + slim trunks only.
// ======================================================================
const CROWN = [[0, -0.1, 1], [-0.9, 0.2, 0.7], [0.9, 0.15, 0.72], [-0.45, -0.75, 0.62], [0.5, -0.7, 0.6], [0, 0.5, 0.6]];
function far(z) {
  const zz = Z[z], P = PALETTE[z], defs = [], H = 360; CLIP = 0;
  const at = (c, k) => mix(c, zz.haze, k);
  defs.push(radial('wg', zz.light, 0.55, [0.4, 0.2]));
  let b = '';
  // back hills
  const T1 = [[16, 2, 0.6], [9, 5, 1.3], [5, 9, 2.1]], T2 = [[14, 3, 2.2], [8, 7, 0.4], [4, 12, 1.0]];
  b += `<path d="${ridgeFill(960, 250, T1, H)}" fill="${at(zz.hill, 0.55)}"/><path d="${ridgeLine(960, 250, T1)}" fill="none" stroke="${dk(at(zz.hill, 0.55), 0.85)}" stroke-width="3"/>`;
  if (zz.snow) b += `<path d="${ridgeFill(960, 254, T1, H)}" fill="${mix(SNOW, zz.haze, 0.35)}" opacity=".7"/>`;
  // slim background trunks (behind the nest area) with small crowns
  const R = rng(17 + z.length);
  const SLIM = [[0, 0, 1], [-0.7, 0.3, 0.6], [0.7, 0.25, 0.62], [0, -0.7, 0.6]];
  for (const [x, w, h, cr, ci] of [[345, 20, 200, 44, 1], [455, 14, 160, 34, 2], [540, 24, 220, 52, 0], [640, 16, 180, 40, 1]]) {
    b += wrap(x, H - 40, cr * 1.8, tree({ w, h: Math.min(h, H - 40 - 8 - 1.3 * cr), crown: SLIM, cr, col: at(zz.crown[ci], 0.55), tcol: at(zz.trunk, 0.5), seed: x }, zz, defs));
  }
  // nearer hill band
  b += `<path d="${ridgeFill(960, 300, T2, H)}" fill="${at(zz.hill, 0.35)}"/><path d="${ridgeLine(960, 300, T2)}" fill="none" stroke="${dk(at(zz.hill, 0.35), 0.82)}" stroke-width="3"/>`;
  if (zz.snow) b += `<path d="${ridgeFill(960, 304, T2, H)}" fill="${mix(SNOW, zz.haze, 0.2)}"/><path d="${ridgeLine(960, 304, T2)}" fill="none" stroke="${mix(SNOWLN, zz.haze, 0.2)}" stroke-width="3"/>`;
  // big trees at the sides (one spans the tile edge)
  const big = { spring: [[30, 96, 250, 0], [215, 54, 190, 2], [760, 60, 205, 0], [905, 40, 170, 1]],
    summer: [[0, 110, 260, 0], [190, 60, 200, 1], [745, 70, 230, 2], [880, 50, 170, 1]],
    autumn: [[60, 100, 255, 0], [240, 46, 175, 2], [780, 74, 225, 1], [930, 44, 160, 2]],
    winter: [[10, 100, 250, 0], [220, 52, 190, 2], [770, 66, 220, 1], [900, 44, 170, 0]] }[z];
  for (const [x, w, h, ci] of big) {
    const cr = w * 0.62 + 34, hh = Math.min(h, H + 2 - 8 - 1.4 * cr);
    b += wrap(x, H + 2, cr * 2.2, tree({ w, h: hh, crown: CROWN, cr, col: at(zz.crown[ci], 0.3), tcol: at(zz.trunk, 0.28), seed: x + 5, knot: w > 80, bloom: true, roots: w > 60 }, zz, defs));
  }
  // toadstool houses in the far forest
  const hs = { spring: [[120, 52, 58], [850, 42, 46]], summer: [[110, 60, 64], [700, 40, 44], [840, 50, 54]],
    autumn: [[150, 50, 56], [860, 46, 50]], winter: [[120, 56, 60], [690, 38, 42], [850, 46, 50]] }[z];
  for (const [x, w, h] of hs) b += wrap(x, H - 6, w * 1.2, house({ w, h, seed: x, col: at(zz.house, 0.2), cap: at(zz.cap, 0.18) }, { ...zz, door: at(zz.door, 0.15) }, defs, 'wg'));
  // autumn: strings of small lanterns between the side trees
  if (zz.lanterns) for (const [x0, x1, y] of [[60, 215, 170], [760, 905, 160]]) {
    b += `<path d="M${x0} ${y} Q${(x0 + x1) / 2} ${y + 40} ${x1} ${y}" fill="none" stroke="#4a3430" stroke-width="2.5"/>`;
    for (let k = 1; k < 4; k++) { const t = k / 4, x = x0 + (x1 - x0) * t, yy = y + 40 * 2 * t * (1 - t) * 1; b += lanternHead(f(x), yy + 2, zz, 'wg', 0.5); }
  }
  // ground strip line where the far forest meets the floor
  b += `<rect x="0" y="${H - 8}" width="960" height="8" fill="${at(zz.soil, 0.3)}"/>`;
  return svg(960, H, b, defs.join(''));
}

// ======================================================================
// NEAR (960x240, base y 240, tileable): ferns, glowing flowers, mushrooms, a toadstool house, lantern post, roots.
// ======================================================================
function near(z) {
  const zz = Z[z], defs = [], H = 240; CLIP = 0;
  defs.push(radial('wg', zz.light, 0.6, [0.4, 0.22]), radial('fg', zz.glow, 0.7, [0.35, 0.3]));
  const R = rng(99 + z.length * 7);
  let b = '';
  // low bushes band along the whole width (calm, darker)
  const bush = mix(zz.fern, '#2d3b33', 0.25);
  // make tileable: generate positions on [0,960) and replicate
  const base = []; { const Q = rng(5 + z.length); for (let x = 0; x < 960; x += 52) base.push([x + Q() * 18, H - 8 - Q() * 14, 26 + Q() * 16]); }
  const bushes = base.flatMap(([x, y, r]) => [[x, y, r], [x - 960, y, r], [x + 960, y, r]]);
  b += blob(bushes, zz.snow ? '#5f7f88' : bush, { hi: false });
  if (zz.snow) b += snowCaps(bushes);
  // roots
  const rootC = mix(zz.trunk, '#8a6a52', 0.35);
  for (const [x, w, h] of [[300, 120, 46], [640, 150, 40], [960 - 30, 110, 40]]) b += wrap(x, H, w / 2 + 4, root({ w, h }, rootC));
  // a closer toadstool house on one side + lantern post on the other (side per zone)
  const L = { spring: [130, 845], summer: [820, 140], autumn: [150, 830], winter: [840, 120] }[z];
  b += wrap(L[0], H - 2, 110, house({ w: 72, h: 82, seed: L[0] + 1 }, zz, defs, 'wg'));
  b += wrap(L[1], H - 2, 60, lantern({ h: 120 }, zz, 'wg'));
  if (zz.lanterns) b += wrap(L[1] - 70, H - 2, 60, lantern({ h: 80 }, zz, 'wg'));
  // ferns in clusters
  const FR = rng(31 + z.length);
  for (const cx of [40, 250, 380, 560, 700, 900]) for (let k = 0; k < 3; k++) {
    const len = 40 + FR() * (cx > 300 && cx < 650 ? 25 : 55), lean = (k - 1) * 0.5 + (FR() - 0.5) * 0.3;
    b += wrap(cx + (k - 1) * 14, H - 4, len, fern({ len, lean, col: k % 2 ? zz.fern2 : zz.fern, R: FR }));
  }
  if (zz.snow) for (const cx of [40, 250, 380, 560, 700, 900]) b += wrap(cx, H - 4, 30, `<ellipse cx="0" cy="-8" rx="26" ry="9" ${P3(SNOW, SNOWLN)}/>`);
  // mushrooms
  const MR = rng(77 + z.length);
  for (const [x, s] of [[200, 1.1], [215, 0.75], [470, 0.8], [600, 1], [612, 0.65], [760, 0.9], [985 - 25, 0.8]])
    b += wrap(x, H - 3, 20 * s, mushroom({ s, cap: MR() > 0.5 ? zz.cap : mix(zz.cap, zz.house, 0.45) }, zz));
  // glowing flowers
  for (const [x, h, s] of [[70, 50, 1], [95, 36, 0.8], [330, 40, 0.8], [520, 34, 0.75], [660, 46, 0.9], [920, 52, 1], [940, 34, 0.7]])
    b += wrap(x, H - 4, 22 * s, flower({ h, s }, zz, 'fg'));
  // front grass tufts along the base
  const GT = rng(3 + z.length);
  for (let x = 10; x < 960; x += 60) b += wrap(x + GT() * 20, H, 16, grassTuft(zz.snow ? '#6f8f96' : mix(zz.grass, zz.fern, 0.3), 0.9 + GT() * 0.4));
  return svg(960, H, b, defs.join(''));
}

// ======================================================================
// GROUND (960x120, top line y 10, tileable).
// ======================================================================
function ground(z) {
  const zz = Z[z]; const H = 120;
  const T = [[3, 4, 0.3], [2, 9, 1.7], [1.2, 15, 0.8]];
  let b = '';
  const top = zz.snow ? SNOW : zz.grass, body = zz.soil, line = zz.snow ? SNOWLN : dk(zz.grass, 0.66);
  b += `<path d="${ridgeFill(960, 12, T, H)}" fill="${zz.snow ? SNOWSH : body}"/>`;
  b += `<path d="${ridgeFill(960, 12, T, 30)}" fill="${top}"/>`;
  // top band: lit strip; lower: one flat darker band
  b += `<path d="${ridgeFill(960, 34, [[3, 6, 1.1], [2, 11, 0.2]], H)}" fill="${zz.snow ? '#dbe5f0' : zz.soil2}"/>`;
  b += `<path d="${ridgeFill(960, 70, [[4, 5, 2.1], [2, 13, 0.7]], H)}" fill="${zz.snow ? SNOWSH : body}"/>`;
  b += `<path d="${ridgeLine(960, 12, T)}" fill="none" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>`;
  const R = rng(55 + z.length * 13);
  // pebbles, clover/moss dots, leaves
  for (let i = 0; i < 16; i++) {
    const x = (i + 0.3 + R() * 0.4) * 60, y = 40 + R() * 70, r = 4 + R() * 5;
    const c = zz.snow ? '#b2c2d6' : mix(body, '#9a9488', 0.5);
    b += wrap(x, y, r + 3, `<ellipse rx="${f(r * 1.3)}" ry="${f(r)}" ${P3(c, dk(c, 0.7), ' stroke-width="2.5"')}/><ellipse cx="${f(-r * 0.4)}" cy="${f(-r * 0.35)}" rx="${f(r * 0.4)}" ry="${f(r * 0.22)}" fill="${lt(c, 0.3)}"/>`);
  }
  for (let i = 0; i < 26; i++) {
    const x = (i + R()) * (960 / 26), y = 24 + R() * 86, c = zz.leaf[i % zz.leaf.length], a = R() * 360;
    const mk = zz.snow
      ? `<path d="M-6 0 L6 0 M0 -6 L0 6 M-4 -4 L4 4 M-4 4 L4 -4" stroke="${'#ffffff'}" stroke-width="2" stroke-linecap="round" opacity=".8"/>`
      : `<g transform="rotate(${f(a)})"><path d="M-8 0 Q0 -7 8 0 Q0 7 -8 0 Z" ${P3(c, dk(c, 0.68), ' stroke-width="2"')}/><path d="M-6 0 L6 0" stroke="${dk(c, 0.75)}" stroke-width="1.5"/></g>`;
    b += wrap(x, y, 10, mk);
  }
  // grass tufts / snow lumps along the top line
  const Y = ridgeY(960, 12, T);
  for (let i = 0; i < 24; i++) {
    const x = (i + 0.2 + R() * 0.6) * 40;
    if (zz.snow) b += wrap(x, Y(x) + 2, 20, `<path d="M-16 2 Q-12 -9 0 -9 Q12 -9 16 2 Z" fill="${SNOW}" stroke="${SNOWLN}" stroke-width="2.5"/>`);
    else b += wrap(x, Y(x) + 3, 14, grassTuft(i % 3 ? zz.grass : lt(zz.grass, 0.12), 0.6 + R() * 0.35));
  }
  return svg(960, H, b);
}

// ======================================================================
// NEST (416x620): back panel + walls. nest_front: lip pieces over the eggs.
// ======================================================================
const BARK = '#8c6446', BARK2 = '#a57a54', BARKLN = '#5a3c2a', PANEL = '#4b3a2e', PANEL2 = '#5d4838', PANELLN = '#3a2c22';
const MOSS = '#6f9a4e', MOSS2 = '#86b05e', MOSSLN = '#4a6c34';
const twig = (x1, y1, x2, y2, w = 8, col = BARK2) =>
  `<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="${dk(col, 0.62)}" stroke-width="${w + 3}" stroke-linecap="round"/><path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="${col}" stroke-width="${w - 0}" stroke-linecap="round"/>` +
  `<path d="M${f(x1 + (x2 - x1) * 0.15)} ${f(y1 + (y2 - y1) * 0.15 - w * 0.2)} L${f(x1 + (x2 - x1) * 0.6)} ${f(y1 + (y2 - y1) * 0.6 - w * 0.2)}" stroke="${lt(col, 0.25)}" stroke-width="${f(w * 0.28)}" stroke-linecap="round"/>`;
function mossTuft(x, y, s = 1, up = true) {
  const d = up ? -1 : 1, c = [[x, y, 9 * s], [x - 9 * s, y + 3 * s * -d, 6.5 * s], [x + 9 * s, y + 2 * s * -d, 7 * s]];
  return blob(c, MOSS, { line: MOSSLN, shade: dk(MOSS, 0.85), hiC: MOSS2 });
}
function nestBack() {
  const defs = [radial('fg', '#ffd8bd', 0.75, [0.35, 0.3]), radial('fg2', '#d6f5e8', 0.6, [0.35, 0.25])];
  let b = '';
  // back panel (woven mesh) between the inner faces, y 120..568; slightly rounded top corners hidden behind posts
  b += `<rect x="24" y="122" width="368" height="450" fill="${PANEL}"/>`;
  // horizontal weave rows (each row a wavy band, alternating phase) + vertical stakes: low contrast so eggs read
  for (let r = 0; r < 15; r++) {
    const y = 140 + r * 29.5, ph = r % 2 ? 0 : Math.PI;
    let d = ''; for (let x = 28; x <= 388; x += 6) d += (x === 28 ? 'M' : 'L') + f(x) + ' ' + f(y + Math.sin((x - 28) / 360 * Math.PI * 2 * 6 + ph) * 4);
    b += `<path d="${d}" fill="none" stroke="${PANELLN}" stroke-width="14" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="${PANEL2}" stroke-width="9"/>`;
  }
  for (let i = 1; i < 12; i++) { const x = 28 + i * 30; b += `<path d="M${x} 126 L${x} 566" stroke="${PANELLN}" stroke-width="3" opacity=".55"/>`; }
  // soft top rim of the back panel
  b += `<path d="M28 124 L388 124" stroke="${PANELLN}" stroke-width="5"/>`;
  // walls: bark posts x 0..28 and 388..416, y 120..596, with rounded tops; woven bands across them
  for (const x0 of [0, 388]) {
    const id = 'wall' + x0;
    const d = `M${x0 + 1.5} 596 L${x0 + 1.5} 132 Q${x0 + 1.5} 121.5 ${x0 + 14} 121.5 Q${x0 + 26.5} 121.5 ${x0 + 26.5} 132 L${x0 + 26.5} 596 Z`;
    defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    b += `<path d="${d}" ${P3(BARK, BARKLN)}/>`;
    b += `<g clip-path="url(#${id})"><rect x="${x0 + 17}" y="118" width="14" height="480" fill="${dk(BARK, 0.84)}"/>`;
    for (let y = 150; y < 590; y += 34) b += `<path d="M${x0 + 6} ${y} q4 10 0 20" stroke="${BARKLN}" stroke-width="2" fill="none" opacity=".7"/>`;
    b += `<path d="M${x0 + 8} 128 L${x0 + 8} 590" stroke="${lt(BARK, 0.22)}" stroke-width="3" opacity=".8"/></g>`;
    // woven twig bands wrapping the wall (stay inside 0..416)
    for (const y of [190, 300, 420, 520]) b += twig(x0 + 2, y + (x0 ? 8 : 0), x0 + 26, y + (x0 ? 0 : 8), 9);
  }
  // nest base under the floor: a fat woven rim y 562..620 (back part), full width
  b += `<path d="M2 566 L414 566 L414 600 Q414 618 396 618 L20 618 Q2 618 2 600 Z" ${P3(BARK, BARKLN)}/>`;
  b += `<rect x="4" y="596" width="408" height="20" rx="10" fill="${dk(BARK, 0.84)}"/>`;
  // outside decorations: moss on the wall tops, moss + mushrooms + glowing flowers low on the outer sides
  b += mossTuft(14, 132, 1.0) + mossTuft(402, 132, 1.0);
  b += mossTuft(10, 330, 0.75) + mossTuft(406, 250, 0.75) + mossTuft(12, 470, 0.7) + mossTuft(404, 440, 0.8);
  // glowing flowers on the outside faces (peach + pale mint glow; small)
  for (const [x, y, g] of [[8, 238, 'fg'], [408, 352, 'fg2'], [9, 402, 'fg2'], [406, 520, 'fg']]) {
    b += `<circle cx="${x}" cy="${y}" r="18" fill="url(#${g})"/>`;
    for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; b += `<circle cx="${f(x + Math.cos(a) * 4.5)}" cy="${f(y + Math.sin(a) * 4.5)}" r="3.6" fill="${g === 'fg' ? '#ffe2cc' : '#e4f8ee'}" stroke="${g === 'fg' ? '#c98d6c' : '#7fae98'}" stroke-width="1.8"/>`; }
    b += `<circle cx="${x}" cy="${y}" r="2.2" fill="#ffffff"/>`;
  }
  return svg(416, 620, b, defs.join(''));
}
function nestFront() {
  let b = '';
  // twig ends poking slightly over the inner faces (≤ 6 px): left wall x ≤ 34, right wall x ≥ 382
  for (const [y, len] of [[205, 6], [356, 5], [478, 6]]) b += twig(4, y + 6, 28 + len - 6, y - 2, 7);
  for (const [y, len] of [[262, 6], [404, 5], [540, 6]]) b += twig(412, y + 6, 388 - len + 6, y - 2, 7);
  // small moss tufts on the wall edges
  b += blob([[24, 300, 6], [30, 306, 4]], MOSS, { line: MOSSLN, hiC: MOSS2 }) + blob([[392, 470, 6], [386, 476, 4]], MOSS, { line: MOSSLN, hiC: MOSS2 });
  // floor lip: woven front rim overlapping the floor by 6 px (top at y 562)
  b += `<path d="M0 572 Q0 562 12 562 L404 562 Q416 562 416 572 L416 606 Q416 620 402 620 L14 620 Q0 620 0 606 Z" ${P3(BARK, BARKLN)}/>`;
  b += `<path d="M3 598 L413 598 L413 606 Q413 617 402 617 L14 617 Q3 617 3 606 Z" fill="${dk(BARK, 0.84)}"/>`;
  // woven strands across the lip
  for (let i = 0; i < 9; i++) { const x = 14 + i * 46; b += twig(x, 590 + (i % 2) * 8, x + 40, 576 - (i % 2) * 4, 8, i % 2 ? BARK2 : '#9a6f4c'); }
  b += `<path d="M12 566 L404 566" stroke="${lt(BARK, 0.25)}" stroke-width="3" stroke-linecap="round"/>`;
  // moss + tiny mushrooms + flowers on the lip
  b += mossTuft(40, 566, 0.85) + mossTuft(190, 568, 0.7) + mossTuft(300, 566, 0.8) + mossTuft(392, 567, 0.9);
  const zz = { ...Z.summer, cap: '#b9584a', house: '#ead9c0', spot: '#f6ead8', snow: false };
  b += `<g transform="translate(16 590)">${mushroom({ s: 0.75 }, zz)}</g><g transform="translate(30 594)">${mushroom({ s: 0.5, cap: '#c98a5a' }, zz)}</g>`;
  b += `<g transform="translate(404 592)">${mushroom({ s: 0.7, cap: '#c98a5a' }, zz)}</g>`;
  for (const [x, y] of [[120, 572], [262, 574]]) {
    for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; b += `<circle cx="${f(x + Math.cos(a) * 4.5)}" cy="${f(y + Math.sin(a) * 4.5)}" r="3.6" fill="#ffe2cc" stroke="#c98d6c" stroke-width="1.8"/>`; }
    b += `<circle cx="${x}" cy="${y}" r="2.2" fill="#ffffff"/>`;
  }
  return svg(416, 620, b);
}
function vine() {
  const ST = '#93c070', STL = '#3c5c30';
  let d = ''; for (let x = 0; x <= 400; x += 5) d += (x ? 'L' : 'M') + x + ' ' + f(20 + Math.sin(x / 400 * Math.PI * 2 * 4) * 3);
  let b = `<path d="${d}" fill="none" stroke="${STL}" stroke-width="6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${ST}" stroke-width="3" stroke-linecap="round"/>`;
  for (let i = 0; i < 16; i++) {
    const x = 12 + i * 25, y = 20 + Math.sin(x / 400 * Math.PI * 8) * 3, up = i % 2 ? -1 : 1;
    b += `<path d="M${x} ${f(y)} q6 ${-8 * up} 14 ${-7 * up} q-4 ${8 * up} -14 ${7 * up} Z" ${P3('#a6cf7e', STL, ' stroke-width="2"')}/>`;
  }
  for (let i = 0; i < 7; i++) {
    const x = 30 + i * 57, y = 20 + Math.sin(x / 400 * Math.PI * 8) * 3;
    for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; b += `<circle cx="${f(x + Math.cos(a) * 4)}" cy="${f(y + Math.sin(a) * 4)}" r="3.3" fill="#f6eee2" stroke="#b9a08c" stroke-width="1.6"/>`; }
    b += `<circle cx="${x}" cy="${f(y)}" r="2" fill="#f2b08c"/>`;
  }
  return svg(400, 40, b);
}

// ======================================================================
// PARTICLES (32x32). Thinner (2 px) outlines at this tiny size.
// ======================================================================
function star5(cx, cy, R, r) { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; }
const PARTS = {
  sparkle: `<path d="M16 2 Q18 14 30 16 Q18 18 16 30 Q14 18 2 16 Q14 14 16 2 Z" fill="#ffffff" stroke="#c9c2e6" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.5" fill="#f4f0ff"/>`,
  star: `<path d="${star5(16, 17, 14, 6)}" fill="#fff6ec" stroke="#d9a98e" stroke-width="2" stroke-linejoin="round"/><path d="${star5(14.5, 15.5, 6, 2.6)}" fill="#ffffff"/>`,
  glow: null, // gradient sprite, built below
  petal: `<path d="M16 3 Q28 10 22 24 Q16 30 10 24 Q4 10 16 3 Z" fill="#f2b6c6" stroke="#c98095" stroke-width="2" stroke-linejoin="round"/><path d="M16 24 Q20 18 21 13 Q22 24 16 24 Z" fill="#e39cb0"/><ellipse cx="13" cy="11" rx="2.5" ry="4" fill="#fbdbe4"/>`,
  leafbit: `<path d="M16 2 L19 9 L27 7 L23 14 L30 18 L22 20 L22 28 L16 23 L10 28 L10 20 L2 18 L9 14 L5 7 L13 9 Z" fill="#e0884a" stroke="#a6562c" stroke-width="2" stroke-linejoin="round"/><path d="M16 29 L16 10 M16 18 L11 13 M16 18 L21 13" stroke="#a6562c" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  snow: `<circle cx="16" cy="16" r="10" fill="#ffffff" stroke="#b6c6dc" stroke-width="2"/><circle cx="19" cy="19" r="5" fill="#e6eef8"/><circle cx="12.5" cy="12.5" r="2.5" fill="#ffffff"/>`,
  firefly: `<circle cx="16" cy="16" r="14" fill="#d8f7b0" opacity=".22"/><circle cx="16" cy="16" r="9" fill="#d8f7b0" opacity=".35"/><circle cx="16" cy="16" r="5" fill="#eaffd0" stroke="#8fc06a" stroke-width="2"/><circle cx="14.5" cy="14.5" r="1.6" fill="#ffffff"/>`,
  streak: `<path d="M2 20 Q12 10 22 16 Q28 20 30 13" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".9"/><path d="M6 26 Q14 21 20 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
  puff: `<g fill="#c9cfe0"><circle cx="11" cy="17" r="8"/><circle cx="20" cy="13" r="9"/><circle cx="22" cy="21" r="7"/></g><g fill="#ffffff"><circle cx="11" cy="17" r="6"/><circle cx="20" cy="13" r="7"/><circle cx="22" cy="21" r="5"/></g><circle cx="17" cy="10" r="2" fill="#ffffff"/>`,
  shellbit: `<path d="M5 22 L9 8 L14 13 L19 5 L23 12 L28 9 L26 24 Q16 29 5 22 Z" fill="#f6ecd8" stroke="#b9a283" stroke-width="2" stroke-linejoin="round"/><path d="M19 24 Q25 22 26 15 L26 24 Q22 26 19 24 Z" fill="#e4d6bc"/>`,
  heart: `<path d="M16 28 Q3 19 3 11 Q3 4 10 4 Q14 4 16 9 Q18 4 22 4 Q29 4 29 11 Q29 19 16 28 Z" fill="#f2849c" stroke="#b9506a" stroke-width="2" stroke-linejoin="round"/><path d="M16 28 Q24 21 27 14 Q27 20 16 28 Z" fill="#dc6e88"/><ellipse cx="10" cy="10" rx="3" ry="2" fill="#fbc6d2"/>`
};

// ---------- write ----------
const ZONES = ['spring', 'summer', 'autumn', 'winter'];
for (const z of ZONES) {
  write(`levels/${z}/sky.svg`, sky(z));
  write(`levels/${z}/far.svg`, far(z));
  write(`levels/${z}/near.svg`, near(z));
  write(`levels/${z}/ground.svg`, ground(z));
}
write('levels/palette.json', JSON.stringify(PALETTE, null, 2) + '\n');
write('nest.svg', nestBack());
write('nest_front.svg', nestFront());
write('vine.svg', vine());
for (const [k, v] of Object.entries(PARTS)) {
  if (k === 'glow') write('particles/glow.svg', svg(32, 32, `<circle cx="16" cy="16" r="16" fill="url(#g)"/>`, radial('g', '#ffffff', 1, [0.35, 0.55])));
  else write(`particles/${k}.svg`, svg(32, 32, v));
}
console.log('environment art written to ' + OUT);
