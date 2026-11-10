#!/usr/bin/env node
// Mochi's Fairy Bounce — environment art generator (100 % original SVG, written from code).
// Writes into game/assets/default/:
//   levels/<s>/sky.svg (960x540), far.svg (960x300, tileable), near.svg (960x200, tileable, surface at y=150)
//   levels/palette.json
//   bricks/<s>.svg, <s>_tough.svg, <s>_crack.svg, star.svg (140x50)
//   particles/petal, firefly, butterfly, leaf, snow, sparkle, puff (32x32), glow (64x64), chip_<s> (24x24)
// Usage: node tools/art-environment/gen.js [assetsDir]
// Style: soft pastel fairy forest, flat base + one shadow + one highlight, outlines = darker shade of the fill.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const W = 960;

// ---------- helpers ----------
function RNG(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: arr => arr[Math.floor(next() * arr.length)] };
}
const f = n => (Math.round(n * 10) / 10).toString();
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
const PLUM = '#2e2140';
const dark = (c, t) => mix(c, PLUM, t);           // darker shade (toward deep plum, never pure black)
const light = (c, t) => mix(c, '#ffffff', t);
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
// periodic curve over 0..960: base + sum of sines with integer periods -> edges match in value and slope
function wave(base, terms) { return x => base + terms.reduce((s, [a, k, ph]) => s + a * Math.sin(2 * Math.PI * k * x / W + ph), 0); }
function curvePath(fn, bottom, step = 8) {
  let d = `M0 ${f(bottom)} L0 ${f(fn(0))}`;
  for (let x = step; x <= W; x += step) d += ` L${x} ${f(fn(x))}`;
  return d + ` L${W} ${f(bottom)} Z`;
}
// stroke only the top edge (a closed path would draw vertical lines on the tile edges = visible seams)
function topLine(fn, step = 8, sw = 3, col = '#000') {
  let d = `M${-step} ${f(fn(-step))}`; for (let x = 0; x <= W + step; x += step) d += ` L${x} ${f(fn(x))}`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}
// duplicate anything that crosses the left/right edge so the tile wraps
function wrap(items, getX, getR) {
  const out = [];
  for (const it of items) {
    out.push(it);
    const x = getX(it), r = getR(it);
    if (x - r < 0) out.push({ ...it, x: x + W });
    if (x + r > W) out.push({ ...it, x: x - W });
  }
  return out;
}
let uid = 0;
// union of circles with a soft darker outline, one shadow (lower-right) and the lit base
function blobs(cs, o) {
  const id = 'c' + (++uid);
  const rects = o.rects || [];
  const clip = `<clipPath id="${id}">${cs.map(c => circle(c.x, c.y, c.r, '#000')).join('')}${rects.map(r => `<rect x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}"/>`).join('')}</clipPath>`;
  const sw = o.sw ?? 3;
  let s = '';
  if (sw > 0) {
    s += cs.map(c => circle(c.x, c.y, c.r + sw, o.outline)).join('');
    s += rects.map(r => `<rect x="${f(r[0] - sw)}" y="${f(r[1] - sw)}" width="${f(r[2] + 2 * sw)}" height="${f(r[3] + 2 * sw)}" fill="${o.outline}"/>`).join('');
  }
  s += `<g clip-path="url(#${id})"><rect x="-200" y="-200" width="1400" height="900" fill="${o.shadow}"/>`;
  const dx = o.dx ?? -3, dy = o.dy ?? -5, k = o.k ?? 0.9;
  s += cs.map(c => circle(c.x + dx * c.r / 20, c.y + dy * c.r / 20, c.r * k, c.fill || o.base)).join('');
  if (o.inner) s += o.inner;
  s += '</g>';
  return { defs: clip, body: s };
}
function star5(cx, cy, R, r, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a));
  }
  return d + 'Z';
}
function star4(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (-90 + i * 45) * Math.PI / 180, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a));
  }
  return d + 'Z';
}

// ---------- palette ----------
const PAL = {
  spring: { skyTop: '#b8dcef', skyMid: '#e3eff3', skyBottom: '#fce9ee', ink: '#3b4767', bar: '#fff7fa', glow: '#ffc8dd' },
  summer: { skyTop: '#a3d6e0', skyMid: '#f1ecc4', skyBottom: '#fde3a8', ink: '#4a3a1e', bar: '#fffaea', glow: '#ffd76a' },
  autumn: { skyTop: '#8a82bf', skyMid: '#d6a3b4', skyBottom: '#f8bd8c', ink: '#3b2240', bar: '#fff0e2', glow: '#ffab5a' },
  winter: { skyTop: '#16214b', skyMid: '#253a72', skyBottom: '#4562a0', ink: '#1b2450', bar: '#e7efff', glow: '#9fe8ff' },
};

// ---------- skies ----------
function cloud(x, y, s, base, shadow, outline, op = 1) {
  const cs = [[-46, 6, 20], [-22, -8, 26], [8, -14, 30], [36, -4, 24], [56, 8, 16], [0, 8, 26]].map(([a, b, r]) => ({ x: x + a * s, y: y + b * s, r: r * s }));
  const b = blobs(cs, { base, shadow, outline, sw: 2, dx: -1, dy: -4, k: 0.95, rects: [[x - 46 * s, y + 6 * s, 102 * s, 14 * s]] });
  return { defs: b.defs, body: `<g opacity="${op}">${b.body}</g>` };
}
function skySpring() {
  const p = PAL.spring, r = RNG(11);
  let defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset=".55" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient>
<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe8" stop-opacity=".95"/><stop offset=".25" stop-color="#fff4d8" stop-opacity=".6"/><stop offset="1" stop-color="#fff4d8" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="960" height="540" fill="url(#g)"/><circle cx="800" cy="96" r="150" fill="url(#sun)"/>${circle(800, 96, 34, '#fff9e6', ' stroke="#f5e3bd" stroke-width="3"')}`;
  for (const [x, y, s, o] of [[150, 110, 1.0, .85], [470, 70, .7, .7], [640, 210, .8, .55], [90, 290, .9, .55], [880, 300, .75, .5]]) {
    const c = cloud(x, y, s, '#ffffff', '#f1e4ee', '#e7d6e4', o); defs += c.defs; body += c.body;
  }
  // a few drifting petals painted far away
  for (let i = 0; i < 12; i++) { const x = r.range(20, 940), y = r.range(40, 330); body += ell(x, y, 3.5, 2.2, '#f8d3e1', ` opacity=".6" transform="rotate(${f(r.range(0, 180))} ${f(x)} ${f(y)})"`); }
  return svg(960, 540, body, defs);
}
function skySummer() {
  const p = PAL.summer;
  let defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset=".5" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient>
<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8" stop-opacity="1"/><stop offset=".3" stop-color="#ffe9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
<radialGradient id="haze" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".7"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="960" height="540" fill="url(#g)"/><rect y="250" width="960" height="290" fill="url(#haze)"/><circle cx="170" cy="105" r="190" fill="url(#sun)"/>`;
  // soft sun rays (very faint wedges)
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a0 = (i * 30 + 6) * Math.PI / 180, a1 = a0 + 0.16, R = 175;
    rays += `<path d="M170 105 L${f(170 + R * Math.cos(a0))} ${f(105 + R * Math.sin(a0))} L${f(170 + R * Math.cos(a1))} ${f(105 + R * Math.sin(a1))} Z" fill="#fff3c0" opacity=".22"/>`;
  }
  body += rays + circle(170, 105, 40, '#fff2b8', ' stroke="#f3d27e" stroke-width="3"') + circle(158, 93, 12, '#fffbe6', ' opacity=".8"');
  for (const [x, y, s, o] of [[520, 92, .85, .75], [800, 160, 1.0, .7], [380, 300, 1.1, .6], [700, 330, 1.25, .55], [70, 330, .9, .55]]) {
    const c = cloud(x, y, s, '#fffdf4', '#f8e6c0', '#efd7a8', o); defs += c.defs; body += c.body;
  }
  return svg(960, 540, body, defs);
}
function skyAutumn() {
  const p = PAL.autumn, r = RNG(33);
  let defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset=".5" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient>
<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe3b0" stop-opacity=".95"/><stop offset=".3" stop-color="#ffc98a" stop-opacity=".5"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="960" height="540" fill="url(#g)"/>`;
  for (let i = 0; i < 18; i++) { const x = r.range(10, 950), y = r.range(8, 150), s = r.range(1, 2.2); body += circle(x, y, s, '#fff3e6', ` opacity="${f(r.range(.35, .75))}"`); }
  body += `<path d="${star4(140, 60, 7, 2)}" fill="#fff6ea" opacity=".8"/>`;
  body += `<circle cx="650" cy="330" r="230" fill="url(#sun)"/>${circle(650, 330, 56, '#ffb98c', ' stroke="#ec9a6c" stroke-width="3"')}${circle(634, 314, 16, '#ffd2b0', ' opacity=".7"')}`;
  // long dusk streaks
  const streak = (x, y, w, h, c, o) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${c}" opacity="${o}"/>`;
  body += streak(40, 150, 360, 14, '#e9b3c4', .55) + streak(120, 172, 230, 10, '#f0c3c9', .45) + streak(560, 120, 330, 12, '#d9a7c4', .5) + streak(620, 140, 220, 9, '#e7b8c8', .4);
  body += streak(430, 300, 400, 12, '#ffd4a8', .55) + streak(500, 322, 240, 9, '#ffe0b8', .45) + streak(30, 330, 280, 11, '#f7c7a2', .45);
  for (const [x, y, s, o] of [[230, 240, .85, .55], [860, 250, .7, .5]]) {
    const c = cloud(x, y, s, '#f6c9c4', '#e3a9b1', '#d29aa8', o); defs += c.defs; body += c.body;
  }
  return svg(960, 540, body, defs);
}
function skyWinter() {
  const p = PAL.winter, r = RNG(44);
  let defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset=".55" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient>
<linearGradient id="au1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff0d4" stop-opacity="0"/><stop offset=".55" stop-color="#9ff0d4" stop-opacity=".55"/><stop offset="1" stop-color="#9ff0d4" stop-opacity="0"/></linearGradient>
<linearGradient id="au2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3a8f5" stop-opacity="0"/><stop offset=".5" stop-color="#c3a8f5" stop-opacity=".5"/><stop offset="1" stop-color="#c3a8f5" stop-opacity="0"/></linearGradient>
<radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9f0ff" stop-opacity=".55"/><stop offset="1" stop-color="#e9f0ff" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
<mask id="cres"><rect width="960" height="540" fill="#fff"/><circle cx="822" cy="86" r="34" fill="#000"/></mask>`;
  let body = `<rect width="960" height="540" fill="url(#g)"/>`;
  // aurora ribbons: band between two wavy edges, faded top and bottom
  const ribbon = (y0, h, amp, k, ph, grad, op) => {
    let top = '', bot = '';
    for (let x = -20; x <= 980; x += 20) {
      const yy = y0 + amp * Math.sin(x / 960 * Math.PI * k + ph) + 10 * Math.sin(x / 70 + ph);
      top += (x === -20 ? 'M' : 'L') + x + ' ' + f(yy - h / 2);
      bot = `L${x} ${f(yy + h / 2 + 18 * Math.sin(x / 110 + ph * 2))}` + bot;
    }
    return `<path d="${top} ${bot.replace(/^L/, 'L')} Z" fill="url(#${grad})" opacity="${op}" filter="url(#soft)"/>`;
  };
  body += ribbon(250, 150, 45, 2.2, 0.4, 'au1', .75) + ribbon(190, 100, 35, 1.6, 2.1, 'au2', .7) + ribbon(310, 70, 25, 3.1, 1.0, 'au1', .5);
  // stars
  for (let i = 0; i < 110; i++) {
    const x = r.range(4, 956), y = Math.pow(r.next(), 1.4) * 420, s = r.range(.8, 1.9);
    body += circle(x, y, s, r.next() < .2 ? '#fff4d6' : '#eaf2ff', ` opacity="${f(r.range(.4, .95))}"`);
  }
  for (const [x, y, R] of [[90, 60, 9], [300, 120, 7], [520, 40, 8], [690, 180, 6], [930, 210, 7], [210, 260, 6], [420, 210, 5]]) {
    body += `<path d="${star4(x, y, R, R * .28)}" fill="#f4f8ff" opacity=".85"/>`;
  }
  // crescent moon
  body += `<circle cx="805" cy="96" r="120" fill="url(#moon)"/><g mask="url(#cres)">${circle(805, 96, 38, '#9fb0d8')}${circle(803, 94, 35, '#fbf6e2')}</g>`;
  // low snow haze near the horizon
  body += `<linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa8dc" stop-opacity="0"/><stop offset="1" stop-color="#8fa8dc" stop-opacity=".3"/></linearGradient><rect y="330" width="960" height="210" fill="url(#hz)"/>`;
  return svg(960, 540, body, defs);
}

// ---------- far layer (960x300, tileable, transparent above) ----------
const FAR = {
  spring: { hill: '#d3e8d5', hillO: '#c3dcc7', tree: '#bddcbd', treeS: '#a8cdb0', treeO: '#9fc4a6', accent: '#f6d6e2' },
  summer: { hill: '#cfe2b6', hillO: '#bdd4a5', tree: '#a9cf9c', treeS: '#93bf8c', treeO: '#86b381', accent: '#e8f0b8' },
  autumn: { hill: '#d9a99f', hillO: '#c9989a', tree: '#e3a77a', treeS: '#c98f78', treeO: '#b98074', accent: '#f1c189', alt: ['#e3a77a', '#d7958a', '#ecb97e', '#c99393'] },
  winter: { hill: '#3c5995', hillO: '#36518a', tree: '#33508c', treeS: '#2c4580', treeO: '#283f76', accent: '#c6d6f4' },
};
function far(s) {
  const c = FAR[s], r = RNG(100 + SEASONS.indexOf(s));
  let defs = '', body = '';
  // distant hills
  const h1 = wave(150, [[16, 2, 0.7], [10, 3, 2.1], [6, 7, 0.3]]);
  body += `<path d="${curvePath(h1, 300)}" fill="${c.hill}"/>` + topLine(h1, 8, 3, c.hillO);
  if (s === 'winter') {
    // snowy far ridge cap
    const cap = wave(150, [[16, 2, 0.7], [10, 3, 2.1], [6, 7, 0.3]]);
    let d = `M0 ${f(cap(0))}`; for (let x = 8; x <= W; x += 8) d += ` L${x} ${f(cap(x))}`;
    for (let x = W; x >= 0; x -= 8) d += ` L${x} ${f(cap(x) + 8 + 4 * Math.sin(x / 23))}`;
    body += `<path d="${d}Z" fill="#6d86bd" opacity=".9"/>`;
  }
  if (s !== 'winter') {
    // round canopy tree line
    let cs = [];
    for (let x = 0; x < W; x += r.range(34, 48)) {
      const R = r.range(24, 40), y = 214 + r.range(-10, 14) + 8 * Math.sin(2 * Math.PI * 3 * x / W);
      cs.push({ x, y, r: R, fill: c.alt ? r.pick(c.alt) : c.tree });
    }
    const dots = [];
    if (s === 'spring' || s === 'summer') for (const q of cs) for (let i = 0; i < 3; i++) dots.push({ x: q.x + r.range(-.6, .5) * q.r, y: q.y + r.range(-.7, .2) * q.r, r: r.range(2.2, 3.6) });
    cs = wrap(cs, q => q.x, q => q.r + 4);
    let inner = '';
    if (false) for (const q of cs) for (let i = 0; i < 3; i++) dots.push({ x: q.x + r.range(-.6, .5) * q.r, y: q.y + r.range(-.7, .2) * q.r, r: r.range(2.2, 3.6) });
    for (const d of wrap(dots, q => q.x, q => q.r)) inner += circle(d.x, d.y, d.r, c.accent, ' opacity=".85"');
    const b = blobs(cs, { base: c.tree, shadow: c.treeS, outline: c.treeO, sw: 3, rects: [[-20, 236, 1000, 70]], inner });
    defs += b.defs; body += b.body;
  } else {
    // snowy pines in two depths
    const pine = (x, y, h, w, fill, snow, out) => {
      let g = '';
      for (let i = 0; i < 3; i++) {
        const ty = y - h + i * h * 0.28, bw = w * (0.55 + i * 0.25), by = ty + h * 0.42;
        const d = `M${f(x)} ${f(ty)} Q${f(x + 3)} ${f(ty + 4)} ${f(x + bw / 2)} ${f(by)} Q${f(x)} ${f(by + 6)} ${f(x - bw / 2)} ${f(by)} Q${f(x - 3)} ${f(ty + 4)} ${f(x)} ${f(ty)}Z`;
        g += `<path d="${d}" fill="${fill}" stroke="${out}" stroke-width="2.5" stroke-linejoin="round"/>`;
        g += `<path d="M${f(x)} ${f(ty)} Q${f(x + bw * .2)} ${f(ty + h * .12)} ${f(x + bw * .14)} ${f(ty + h * .16)} Q${f(x)} ${f(ty + h * .13)} ${f(x - bw * .16)} ${f(ty + h * .17)} Q${f(x - bw * .18)} ${f(ty + h * .1)} ${f(x)} ${f(ty)}Z" fill="${snow}"/>`;
      }
      return g;
    };
    let back = [], front = [];
    for (let x = 0; x < W; x += r.range(30, 46)) back.push({ x, y: 236 + r.range(-6, 6), h: r.range(70, 96), w: r.range(46, 58) });
    for (let x = 18; x < W; x += r.range(42, 62)) front.push({ x, y: 262 + r.range(-6, 6), h: r.range(80, 108), w: r.range(54, 66) });
    back = wrap(back, q => q.x, q => q.w / 2 + 4); front = wrap(front, q => q.x, q => q.w / 2 + 4);
    body += back.map(q => pine(q.x, q.y, q.h, q.w, '#3d5a96', '#5f7cb6', '#36528c')).join('');
    body += `<rect x="0" y="232" width="960" height="70" fill="#34518c"/>`;
    body += front.map(q => pine(q.x, q.y, q.h, q.w, c.tree, '#7590c6', c.treeO)).join('');
    body += `<path d="${curvePath(wave(258, [[5, 4, 1.1], [3, 9, 0.2]]), 300)}" fill="#5470ab"/>`;
    // tiny soft fairy lights deep in the woods
    const lights = [];
    for (let i = 0; i < 14; i++) lights.push({ x: r.range(0, W), y: r.range(200, 280), r: r.range(1.4, 2.4) });
    body += wrap(lights, q => q.x, q => q.r).map(q => circle(q.x, q.y, q.r, '#cfeaff', ' opacity=".7"')).join('');
  }
  return svg(960, 300, body, defs);
}

// ---------- near layer (960x200, tileable, surface y=150) ----------
const NEAR = {
  spring: { hedge: '#b3d8a6', hedgeS: '#9cc893', hedgeO: '#88b483', grass: '#a2d18e', grassL: '#c4e4a8', grassO: '#7fb176', soil: '#d0a993', soilD: '#b48c7c', soilO: '#9c7668' },
  summer: { hedge: '#98c88c', hedgeS: '#84b97e', hedgeO: '#73a672', grass: '#8cc274', grassL: '#b6dc8f', grassO: '#6c9f62', soil: '#c9a072', soilD: '#ab8460', soilO: '#916d50' },
  autumn: { hedge: '#d7a265', hedgeS: '#c48c5a', hedgeO: '#a97452', grass: '#cfa860', grassL: '#e6c784', grassO: '#a7834c', soil: '#ad7d62', soilD: '#946654', soilO: '#7c5448' },
  winter: { hedge: '#5d78b2', hedgeS: '#506aa3', hedgeO: '#435c93', grass: '#e2eaf8', grassL: '#f6f9ff', grassO: '#a9badf', soil: '#b9c7e6', soilD: '#9caed8', soilO: '#8396c4' },
};
function flower(x, y, petal, center, out, R = 5) {
  let g = `<path d="M${f(x)} ${f(y + R * 1.2)} L${f(x)} ${f(y + 18)}" stroke="#7fae6d" stroke-width="2.4" stroke-linecap="round"/>`;
  for (let i = 0; i < 5; i++) { const a = i * 72 * Math.PI / 180 - Math.PI / 2; g += circle(x + R * Math.cos(a), y + R * Math.sin(a), R * .78, petal, ` stroke="${out}" stroke-width="1.6"`); }
  return g + circle(x, y, R * .6, center, ` stroke="${dark(center, .3)}" stroke-width="1.2"`);
}
function mushroom(x, y, s, cap, spots, stem) {
  const co = dark(cap, .3), so = dark(stem, .25);
  return `<path d="M${f(x - 5 * s)} ${f(y)} Q${f(x - 6 * s)} ${f(y - 10 * s)} ${f(x - 4 * s)} ${f(y - 14 * s)} L${f(x + 4 * s)} ${f(y - 14 * s)} Q${f(x + 6 * s)} ${f(y - 10 * s)} ${f(x + 5 * s)} ${f(y)}Z" fill="${stem}" stroke="${so}" stroke-width="2"/>` +
    `<path d="M${f(x - 15 * s)} ${f(y - 13 * s)} Q${f(x - 14 * s)} ${f(y - 28 * s)} ${f(x)} ${f(y - 29 * s)} Q${f(x + 14 * s)} ${f(y - 28 * s)} ${f(x + 15 * s)} ${f(y - 13 * s)} Q${f(x)} ${f(y - 9 * s)} ${f(x - 15 * s)} ${f(y - 13 * s)}Z" fill="${cap}" stroke="${co}" stroke-width="2.4"/>` +
    `<path d="M${f(x - 13 * s)} ${f(y - 14.5 * s)} Q${f(x)} ${f(y - 11 * s)} ${f(x + 13 * s)} ${f(y - 14.5 * s)} Q${f(x)} ${f(y - 9.5 * s)} ${f(x - 13 * s)} ${f(y - 14.5 * s)}Z" fill="${dark(cap, .15)}"/>` +
    circle(x - 6 * s, y - 20 * s, 2.4 * s, spots) + circle(x + 4 * s, y - 24 * s, 2 * s, spots) + circle(x + 8 * s, y - 17 * s, 1.6 * s, spots);
}
function grassBlade(x, y, h, lean, col, out) {
  return `<path d="M${f(x - 3)} ${f(y)} Q${f(x + lean * .3)} ${f(y - h * .6)} ${f(x + lean)} ${f(y - h)} Q${f(x + lean * .5 + 2)} ${f(y - h * .5)} ${f(x + 3)} ${f(y)}Z" fill="${col}" stroke="${out}" stroke-width="1.8" stroke-linejoin="round"/>`;
}
// tall decoration around one seam (x 0 +- 115), drawn at x=0 and x=960
function tallCluster(s, cx) {
  const n = NEAR[s];
  let g = '';
  if (s === 'spring') {
    // foxglove-like stalks with lilac/white bells, tall grass
    for (const [dx, h, col] of [[-78, 120, '#d9c4f0'], [-30, 140, '#f6eef8'], [26, 128, '#e8cdf2'], [74, 106, '#f9e8f1']]) {
      const x = cx + dx, top = 150 - h;
      g += `<path d="M${f(x)} 152 Q${f(x + 4)} ${f(150 - h / 2)} ${f(x + 2)} ${f(top)}" stroke="#7fae6d" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      for (let i = 0; i < 6; i++) {
        const by = top + 8 + i * 13, side = i % 2 ? 1 : -1;
        g += ell(x + 2 + side * 6, by, 6.5 - i * .25, 5.5, col, ` stroke="${dark(col, .3)}" stroke-width="1.8"`) + circle(x + 2 + side * 6, by + 2.5, 1.6, dark(col, .2));
      }
    }
    for (const [dx, h, l] of [[-100, 70, 18], [-55, 90, -14], [-8, 64, 12], [48, 84, 16], [100, 66, -16]]) g += grassBlade(cx + dx, 152, h, l, n.grass, n.grassO);
  } else if (s === 'summer') {
    // big ferns + a tall cream toadstool
    const fern = (x, h, dir) => {
      let d = `<path d="M${f(x)} 152 Q${f(x + dir * 20)} ${f(150 - h * .6)} ${f(x + dir * 44)} ${f(150 - h)}" stroke="${n.grassO}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      for (let i = 1; i < 9; i++) {
        const t = i / 9, px = x + dir * 44 * t * t * 0.9 + dir * 20 * 2 * t * (1 - t), py = 152 - (h + 2) * (1 - (1 - t) * (1 - t)) + 0;
        const L = 22 * (1 - t * .6);
        d += ell(px - dir * 4 - L * .4, py, L * .55, 4.2, n.grass, ` stroke="${n.grassO}" stroke-width="1.6" transform="rotate(${f(dir * -25)} ${f(px)} ${f(py)})"`);
        d += ell(px + dir * 4 + L * .4, py - 2, L * .55, 4.2, n.grassL, ` stroke="${n.grassO}" stroke-width="1.6" transform="rotate(${f(dir * 25)} ${f(px)} ${f(py)})"`);
      }
      return d;
    };
    g += fern(cx - 70, 118, 1) + fern(cx + 70, 112, -1) + fern(cx - 10, 96, -1);
    g += mushroom(cx + 34, 152, 2.1, '#f3e2bf', '#fffaf0', '#fbf3e3');
    g += mushroom(cx - 40, 152, 1.3, '#d8c6ef', '#fbf5ff', '#fbf3e3');
  } else if (s === 'autumn') {
    // cattails and a curled bare twig with last leaves
    for (const [dx, h] of [[-84, 118], [-50, 138], [-16, 124], [40, 132], [86, 112]]) {
      const x = cx + dx, top = 150 - h;
      g += `<path d="M${f(x)} 152 Q${f(x - 3)} ${f(150 - h / 2)} ${f(x + 1)} ${f(top)}" stroke="#9b8a4e" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      g += `<rect x="${f(x - 5)}" y="${f(top + 10)}" width="10" height="28" rx="5" fill="#a8704d" stroke="#7b4f3e" stroke-width="2"/><rect x="${f(x - 2.5)}" y="${f(top + 13)}" width="3" height="18" rx="1.5" fill="#c08c68"/>`;
      g += grassBlade(x + 6, 152, h * .55, 14, '#d8b56c', '#a7834c');
    }
    for (const [dx, a] of [[-64, -20], [10, 30], [62, -40]]) g += leafShape(cx + dx, 46 + (dx % 3) * 4, 9, a, '#eea055', '#b8693a');
  } else {
    // frosted reeds and a snowy pine bough
    for (const [dx, h] of [[-90, 104], [-56, 132], [-22, 116], [30, 126], [70, 140], [104, 96]]) {
      const x = cx + dx, top = 150 - h;
      g += `<path d="M${f(x - 3)} 152 Q${f(x + 2)} ${f(150 - h / 2)} ${f(x)} ${f(top)} Q${f(x + 5)} ${f(150 - h / 2)} ${f(x + 3)} 152Z" fill="#7d93c6" stroke="#5e74aa" stroke-width="1.8"/>`;
      g += ell(x, top + 4, 4, 6, '#f2f6ff', ' stroke="#b3c2e4" stroke-width="1.4"');
    }
    for (const [dx, y] of [[-40, 40], [50, 28], [0, 70]]) g += `<path d="${star4(cx + dx, y, 7, 2)}" fill="#e6fbff" stroke="#9cc6e6" stroke-width="1"/>`;
  }
  return g;
}
function leafShape(x, y, R, rot, col, out) {
  return `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><path d="M${f(x)} ${f(y - R)} Q${f(x + R * .9)} ${f(y - R * .1)} ${f(x)} ${f(y + R)} Q${f(x - R * .9)} ${f(y - R * .1)} ${f(x)} ${f(y - R)}Z" fill="${col}" stroke="${out}" stroke-width="1.6"/><path d="M${f(x)} ${f(y - R * .7)} L${f(x)} ${f(y + R * 1.3)}" stroke="${out}" stroke-width="1.2"/></g>`;
}
function near(s) {
  const n = NEAR[s], r = RNG(200 + SEASONS.indexOf(s));
  let defs = '', body = '';
  // 1) back hedge: bumpy top at y ~ 88..104, solid to the soil
  let hb = [];
  for (let x = 0; x < W; x += r.range(26, 36)) hb.push({ x, y: 106 + r.range(-3, 4), r: r.range(14, 20) });
  hb = wrap(hb, q => q.x, q => q.r + 4);
  let inner = '';
  if (s === 'winter') {
    // snow resting on the bushes
    inner += hb.map(q => ell(q.x - 2, q.y - q.r * .62, q.r * .6, q.r * .28, '#a9bbe2')).join('');
  } else {
    const dots = [];
    for (const q of hb) if (r.next() < .7) dots.push({ x: q.x + r.range(-8, 8), y: q.y + r.range(-6, 6), r: r.range(1.6, 2.6) });
    const dc = { spring: '#f7d9e4', summer: '#cfe3a2', autumn: '#ecc07c' }[s];
    inner += wrap(dots, q => q.x, q => q.r).map(q => circle(q.x, q.y, q.r, dc, ' opacity=".9"')).join('');
  }
  const hedge = blobs(hb, { base: n.hedge, shadow: n.hedgeS, outline: n.hedgeO, sw: 3, rects: [[-20, 108, 1000, 50]], inner });
  defs += hedge.defs; body += hedge.body;
  // 2) tall clusters at the seam (outer 120 px of the tile)
  const tall = tallCluster(s, 0) ; body += tall + `<g transform="translate(960 0)">${tall}</g>`;
  // 3) small stuff on the hedge face (y 112..146), kept out of the outer clusters a bit
  const small = [];
  for (let i = 0; i < 16; i++) small.push({ x: r.range(130, 830), y: r.range(130, 146), k: r.int(0, 3), sz: r.range(.8, 1.2) });
  small.sort((a, b) => a.y - b.y);
  for (const q of small) {
    if (s === 'spring') body += q.k < 2 ? flower(q.x, q.y - 8, '#ffffff', '#f7d56b', '#d9cbd6', 4.2 * q.sz) : flower(q.x, q.y - 6, '#dccaf3', '#fff2b0', '#a993c9', 3.6 * q.sz);
    else if (s === 'summer') body += q.k === 0 ? mushroom(q.x, q.y + 4, .85 * q.sz, '#e6d3f3', '#fbf6ff', '#fbf3e3') : q.k === 1 ? flower(q.x, q.y - 6, '#fff6c9', '#f2b84a', '#dcc98a', 3.6 * q.sz)
      : [[-5, 0], [4, -2], [0, 5]].map(([a, b]) => circle(q.x + a, q.y + b - 2, 4 * q.sz, '#7f8fd8', ' stroke="#5764a8" stroke-width="1.5"') + circle(q.x + a - 1.4, q.y + b - 3.4, 1.2, '#e6ebff')).join('');
    else if (s === 'autumn') body += q.k === 0 ? `<g>${ell(q.x, q.y, 11 * q.sz, 8 * q.sz, '#f0a24e', ' stroke="#b8693a" stroke-width="2"')}${ell(q.x, q.y, 4 * q.sz, 8 * q.sz, '#e08f41')}<rect x="${f(q.x - 1.5)}" y="${f(q.y - 11 * q.sz)}" width="3" height="5" rx="1" fill="#7f6a3a"/></g>`
      : q.k === 1 ? mushroom(q.x, q.y + 4, .8 * q.sz, '#e9cfa3', '#fff6e4', '#fbf0de') : leafShape(q.x, q.y + 2, 6, r.range(-70, 70), r.pick(['#eea055', '#e8c063', '#d98c64']), '#a96c40');
    else body += q.k < 2 ? ell(q.x, q.y + 4, 14 * q.sz, 6, '#eef3fe', ' stroke="#b6c5e6" stroke-width="1.6"') : `<path d="M${f(q.x)} ${f(q.y - 10)} L${f(q.x + 5)} ${f(q.y)} L${f(q.x)} ${f(q.y + 6)} L${f(q.x - 5)} ${f(q.y)}Z" fill="#c6f0ff" stroke="#7fb6dc" stroke-width="1.6"/><path d="M${f(q.x)} ${f(q.y - 7)} L${f(q.x + 2)} ${f(q.y)} L${f(q.x)} ${f(q.y + 2)}Z" fill="#f2fdff"/>`;
  }
  // 4) the walking surface: grass/snow lip with tufts down to y~156, then soil to 200
  const tuft = [];
  const N = 160, step = W / N; // 6 px
  for (let i = 0; i < N; i++) tuft.push(i % 2 ? r.range(138, 143) : r.range(145, 148));
  let d = `M0 200 L0 ${f(tuft[0])}`;
  for (let i = 1; i < N; i++) d += ` L${f(i * step)} ${f(tuft[i])}`;
  let tl = `M-6 ${f(tuft[N - 1])} L0 ${f(tuft[0])}`; for (let i = 1; i < N; i++) tl += ` L${f(i * step)} ${f(tuft[i])}`; tl += ` L${W} ${f(tuft[0])} L${W + 6} ${f(tuft[1])}`;
  d += ` L${W} ${f(tuft[0])} L${W} 200Z`;
  if (s === 'winter') {
    const top = wave(146, [[2.5, 6, .4], [1.5, 13, 1.2]]);
    body += `<path d="${curvePath(top, 200)}" fill="${n.grass}"/>` + topLine(top, 8, 3, n.grassO);
    body += `<path d="${curvePath(wave(168, [[3, 5, 2.0], [2, 11, .5]]), 200)}" fill="${n.soil}"/>`;
    body += `<path d="${curvePath(wave(186, [[2, 7, 1.0]]), 200)}" fill="${n.soilD}"/>`;
    // sparkly snow glints on the surface
    for (let i = 0; i < 18; i++) { const x = r.range(6, 954); body += circle(x, r.range(150, 162), r.range(1, 1.8), '#ffffff', ' opacity=".9"'); }
  } else {
    body += `<path d="${d}" fill="${n.grass}"/><path d="${tl}" fill="none" stroke="${n.grassO}" stroke-width="2.5" stroke-linejoin="round"/>`;
    body += `<path d="${curvePath(wave(147, [[1.5, 8, .3]]), 152)}" fill="${n.grassL}" opacity=".7"/>`;
    { const sf = wave(157, [[2.5, 5, 1.3], [1.5, 12, .2]]); body += `<path d="${curvePath(sf, 200)}" fill="${n.soil}"/>` + topLine(sf, 8, 2.5, n.soilO); }
    body += `<path d="${curvePath(wave(182, [[3, 4, .8], [2, 9, 2.2]]), 200)}" fill="${n.soilD}"/>`;
    const peb = [];
    for (let i = 0; i < 22; i++) peb.push({ x: r.range(0, W), y: r.range(164, 194), rx: r.range(3, 6.5) });
    body += wrap(peb, q => q.x, q => q.rx + 2).map(q => ell(q.x, q.y, q.rx, q.rx * .62, light(n.soil, .25), ` stroke="${n.soilO}" stroke-width="1.4"`)).join('');
  }
  return svg(960, 200, body, defs);
}

// ---------- bricks (140x50) ----------
const BR = {
  spring: { base: '#f6bcd2', motif: 'bud' },
  summer: { base: '#b7b6f0', motif: 'berry' },
  autumn: { base: '#f5c27b', motif: 'acorn' },
  winter: { base: '#bfe9f8', motif: 'ice' },
};
function motif(kind, cx, cy, k, base) {
  const o = dark(base, .45);
  if (kind === 'bud') {
    let g = '';
    for (let i = 0; i < 5; i++) { const a = (i * 72 - 90) * Math.PI / 180; g += circle(cx + 7.5 * k * Math.cos(a), cy + 7.5 * k * Math.sin(a), 6 * k, '#fff4f8', ` stroke="${o}" stroke-width="${f(1.8 * k)}"`); }
    g += circle(cx, cy, 4.2 * k, '#f8d66e', ` stroke="#c79a3a" stroke-width="${f(1.4 * k)}"`);
    return g;
  }
  if (kind === 'berry') {
    let g = `<path d="M${f(cx + 2 * k)} ${f(cy - 9 * k)} Q${f(cx + 14 * k)} ${f(cy - 16 * k)} ${f(cx + 18 * k)} ${f(cy - 8 * k)} Q${f(cx + 8 * k)} ${f(cy - 4 * k)} ${f(cx + 2 * k)} ${f(cy - 9 * k)}Z" fill="#9ed08a" stroke="#5f9356" stroke-width="${f(1.6 * k)}"/>`;
    for (const [a, b] of [[-6, -2], [6, -1], [0, 7]]) g += circle(cx + a * k, cy + b * k, 6.4 * k, '#5a5fc0', ` stroke="#3a3c86" stroke-width="${f(1.6 * k)}"`) + circle(cx + (a - 2) * k, cy + (b - 2.2) * k, 1.8 * k, '#dfe2ff');
    return g;
  }
  if (kind === 'acorn') {
    const nut = `<path d="M${f(cx - 8 * k)} ${f(cy - 2 * k)} Q${f(cx - 9 * k)} ${f(cy + 10 * k)} ${f(cx)} ${f(cy + 13 * k)} Q${f(cx + 9 * k)} ${f(cy + 10 * k)} ${f(cx + 8 * k)} ${f(cy - 2 * k)}Z" fill="#e6b27a" stroke="#9a6236" stroke-width="${f(1.8 * k)}"/>`;
    const cap = `<path d="M${f(cx - 11 * k)} ${f(cy - 1 * k)} Q${f(cx - 10 * k)} ${f(cy - 12 * k)} ${f(cx)} ${f(cy - 12 * k)} Q${f(cx + 10 * k)} ${f(cy - 12 * k)} ${f(cx + 11 * k)} ${f(cy - 1 * k)}Z" fill="#a8703f" stroke="#714626" stroke-width="${f(1.8 * k)}"/>`;
    const stem = `<rect x="${f(cx - 1.5 * k)}" y="${f(cy - 16 * k)}" width="${f(3 * k)}" height="${f(5 * k)}" rx="${f(1.2 * k)}" fill="#714626"/>`;
    const hatch = [-6, -2, 2, 6].map(a => circle(cx + a * k, cy - 5 * k, 1.1 * k, '#c48a52')).join('');
    return stem + nut + cap + hatch + ell(cx - 3.5 * k, cy + 4 * k, 1.6 * k, 3.5 * k, '#f6d3a8');
  }
  // ice crystal
  let g = '';
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * Math.PI / 180, ex = cx + 12 * k * Math.cos(a), ey = cy + 12 * k * Math.sin(a);
    g += `<path d="M${f(cx)} ${f(cy)} L${f(ex)} ${f(ey)}" stroke="#ffffff" stroke-width="${f(3.4 * k)}" stroke-linecap="round"/>`;
    const mx = cx + 7 * k * Math.cos(a), my = cy + 7 * k * Math.sin(a);
    for (const s of [-1, 1]) { const b = a + s * 0.8; g += `<path d="M${f(mx)} ${f(my)} L${f(mx + 4 * k * Math.cos(b))} ${f(my + 4 * k * Math.sin(b))}" stroke="#ffffff" stroke-width="${f(2.2 * k)}" stroke-linecap="round"/>`; }
  }
  const outline = g.replace(/#ffffff/g, '#4f8fbf').replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${f(+w + 2.4 * k)}"`);
  return outline + g + circle(cx, cy, 3 * k, '#ffffff', ` stroke="#4f8fbf" stroke-width="${f(1.4 * k)}"`);
}
function brick(s, kind) {
  const b = BR[s], id = `${s}${kind}`;
  if (kind === 'bud') {
    const base = b.base, sh = dark(base, .16), out = dark(base, .5);
    const rr = `x="3" y="3" width="134" height="44" rx="21"`;
    let side = '';
    if (s === 'spring') side = [34, 106].map(x => `<path d="M${x} 16 Q${x + 7} 24 ${x} 33 Q${x - 7} 24 ${x} 16Z" fill="#fbe2ec" stroke="${out}" stroke-width="1.8"/><path d="M${x - 5} 30 Q${x} 36 ${x + 5} 30 Q${x} 33 ${x - 5} 30Z" fill="#8cc47a" stroke="#5f9356" stroke-width="1.4"/>`).join('');
    if (s === 'summer') side = [30, 110].map(x => circle(x, 25, 4.5, '#fbf6ff', ` stroke="${out}" stroke-width="1.5"`) + circle(x + (x < 70 ? -10 : 10), 21, 2.4, '#fbf6ff', ` stroke="${out}" stroke-width="1.2"`)).join('');
    if (s === 'autumn') side = [[30, -30], [110, 30]].map(([x, a]) => leafShape(x, 25, 9, a, '#ee9d58', '#a9643a')).join('');
    if (s === 'winter') side = `<path d="M22 44 L52 6 L62 6 L32 44Z" fill="#ffffff" opacity=".45"/><path d="M96 44 L120 14 L126 18 L104 44Z" fill="#ffffff" opacity=".35"/>`;
    const defs = `<clipPath id="k${id}"><rect ${rr}/></clipPath>`;
    const body = `<rect ${rr} fill="${base}"/><g clip-path="url(#k${id})"><path d="M0 32 Q70 40 140 32 L140 50 L0 50Z" fill="${sh}"/>${side}</g>` +
      `<rect x="16" y="8" width="34" height="6" rx="3" fill="#ffffff" opacity=".7"/>` + motif(b.motif, 70, 25, 1, base) +
      `<rect ${rr} fill="none" stroke="${out}" stroke-width="3.5"/>`;
    return svg(140, 50, body, defs);
  }
  // tough + crack share the sturdier frame
  const base = dark(b.base, s === 'winter' ? .32 : .28), sh = dark(base, .18), out = dark(b.base, .62), rim = light(base, .35);
  const rr = `x="3" y="3" width="134" height="44" rx="8"`;
  let defs = `<clipPath id="k${id}"><rect ${rr}/></clipPath>`;
  let body = '';
  let mask = '';
  if (kind === 'crack') {
    defs += `<mask id="m${id}"><rect width="140" height="50" fill="#fff"/><path d="M112 0 L140 0 L140 16 L132 12 L126 6Z" fill="#000"/></mask>`;
    mask = ` mask="url(#m${id})"`;
  }
  body += `<g${mask}><rect ${rr} fill="${base}"/><g clip-path="url(#k${id})">`;
  body += `<rect x="0" y="34" width="140" height="16" fill="${sh}"/>`;
  // band across the middle with bolts at the ends
  body += `<rect x="0" y="19" width="140" height="12" fill="${dark(base, .1)}"/><rect x="0" y="19" width="140" height="2.5" fill="${rim}" opacity=".6"/>`;
  body += `</g>`;
  body += `<rect x="9" y="9" width="122" height="32" rx="5" fill="none" stroke="${rim}" stroke-width="2.5" opacity=".8"/>`;
  for (const x of [17, 123]) body += circle(x, 25, 5.2, '#e9dfc9', ` stroke="${dark('#e9dfc9', .5)}" stroke-width="2"`) + circle(x - 1.5, 23.5, 1.6, '#ffffff');
  // medallion with the season motif
  body += circle(70, 25, 15.5, light(b.base, .25), ` stroke="${out}" stroke-width="2.6"`);
  body += `<g>${motif(b.motif, 70, 25, .74, b.base)}</g>`;
  body += `<rect x="14" y="7" width="26" height="4" rx="2" fill="#ffffff" opacity=".45"/>`;
  body += `<rect ${rr} fill="none" stroke="${out}" stroke-width="4.5"/>`;
  if (kind === 'crack') {
    const cr = 'M126 6 L114 17 L118 23 L104 31 L108 38 L96 47 M114 17 L100 14 L92 8 M104 31 L92 30 M34 3 L40 12 L33 18 L44 26 L40 33 M40 12 L50 13';
    body += `<path d="${cr}" fill="none" stroke="${light(base, .55)}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(1 1)"/>`;
    body += `<path d="${cr}" fill="none" stroke="${out}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    body += `<path d="M126 6 L132 12 L137 15" fill="none" stroke="${out}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  body += `</g>`;
  return svg(140, 50, body, defs);
}
function starBrick() {
  const gold = '#e2a93c', goldD = '#a8701f', goldL = '#f7d27a';
  const defs = `<radialGradient id="lg" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fffbe6"/><stop offset=".6" stop-color="#fff2c6"/><stop offset="1" stop-color="#f6e2b0"/></radialGradient><clipPath id="kst"><rect x="6" y="6" width="128" height="38" rx="8"/></clipPath>`;
  let body = '';
  // glass body
  body += `<rect x="6" y="6" width="128" height="38" rx="8" fill="url(#lg)"/>`;
  body += `<g clip-path="url(#kst)"><path d="M18 44 L42 6 L54 6 L30 44Z" fill="#ffffff" opacity=".75"/><path d="M98 44 L118 6 L124 6 L104 44Z" fill="#ffffff" opacity=".6"/><rect x="0" y="36" width="140" height="10" fill="#f1d9a2" opacity=".7"/></g>`;
  // frame: outer rim, pane bars, top & bottom caps
  body += `<rect x="6" y="6" width="128" height="38" rx="8" fill="none" stroke="${goldD}" stroke-width="5"/><rect x="6" y="6" width="128" height="38" rx="8" fill="none" stroke="${gold}" stroke-width="2.4"/>`;
  for (const x of [38, 102]) body += `<rect x="${x - 2.5}" y="6" width="5" height="38" fill="${gold}" stroke="${goldD}" stroke-width="1.6"/>`;
  body += `<rect x="22" y="2" width="96" height="8" rx="4" fill="${gold}" stroke="${goldD}" stroke-width="2.2"/><rect x="26" y="3.5" width="40" height="2.4" rx="1.2" fill="${goldL}"/>`;
  body += `<rect x="22" y="40" width="96" height="8" rx="4" fill="${gold}" stroke="${goldD}" stroke-width="2.2"/>`;
  // the star and a little halo
  body += circle(70, 25, 17, '#fff7c8', ' opacity=".9"');
  body += `<path d="${star5(70, 26, 15, 6.6)}" fill="#ffc83a" stroke="#b9791a" stroke-width="2.6" stroke-linejoin="round"/>`;
  body += `<path d="${star5(68, 24, 7, 3)}" fill="#ffe58a"/>`;
  body += `<path d="${star4(52, 15, 4.5, 1.3)}" fill="#ffffff"/><path d="${star4(90, 34, 3.5, 1)}" fill="#ffffff"/>`;
  return svg(140, 50, body, defs);
}

// ---------- particles ----------
const PART = {
  petal: () => svg(32, 32, `<path d="M16 3 Q27 9 24 20 Q21 28 16 29 Q11 28 8 20 Q5 9 16 3Z" fill="#f9c8da" stroke="#d68aa8" stroke-width="2"/><path d="M16 28 Q21 26 23 19 Q24 14 22 11 Q20 22 16 28Z" fill="#efb0c7"/><path d="M16 26 L16 10" stroke="#e7a1bb" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="12.5" cy="11" rx="2" ry="3.5" fill="#ffffff" opacity=".8"/>`),
  firefly: () => svg(32, 32, `<circle cx="16" cy="16" r="16" fill="url(#fg)"/><ellipse cx="11.5" cy="12" rx="4" ry="2.6" fill="#ffffff" opacity=".55" transform="rotate(-30 11.5 12)"/><ellipse cx="20.5" cy="12" rx="4" ry="2.6" fill="#ffffff" opacity=".55" transform="rotate(30 20.5 12)"/><circle cx="16" cy="17" r="4.6" fill="#fbff9e" stroke="#c7d24a" stroke-width="1.5"/><circle cx="15" cy="15.8" r="1.6" fill="#ffffff"/>`,
    `<radialGradient id="fg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f6ffa8" stop-opacity=".95"/><stop offset=".35" stop-color="#e9ff7a" stop-opacity=".45"/><stop offset="1" stop-color="#e9ff7a" stop-opacity="0"/></radialGradient>`),
  butterfly: () => svg(32, 32, `<path d="M15 15 Q9 2 3 6 Q0 12 6 16 Q10 17 15 15Z" fill="#cdbaf6" stroke="#7d69c0" stroke-width="1.8" stroke-linejoin="round"/><path d="M17 15 Q23 2 29 6 Q32 12 26 16 Q22 17 17 15Z" fill="#cdbaf6" stroke="#7d69c0" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 16 Q7 18 7 24 Q10 28 15 21Z" fill="#f6c7e0" stroke="#b77aa5" stroke-width="1.8" stroke-linejoin="round"/><path d="M17 16 Q25 18 25 24 Q22 28 17 21Z" fill="#f6c7e0" stroke="#b77aa5" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="9" r="2" fill="#fff7ff"/><circle cx="24" cy="9" r="2" fill="#fff7ff"/><rect x="14.6" y="9" width="2.8" height="15" rx="1.4" fill="#5a4778"/><path d="M15.4 9.5 Q13 5 11 4 M16.6 9.5 Q19 5 21 4" stroke="#5a4778" stroke-width="1.2" fill="none" stroke-linecap="round"/>`),
  leaf: () => svg(32, 32, `<g transform="rotate(-35 16 16)"><path d="M16 2 Q24 6 25 13 Q22 13 26 18 Q23 20 21 19 Q20 26 16 29 Q12 26 11 19 Q9 20 6 18 Q10 13 7 13 Q8 6 16 2Z" fill="#f0a24f" stroke="#b0632e" stroke-width="1.9" stroke-linejoin="round"/><path d="M16 29 Q19 24 20 18 Q23 17 24 16 Q21 14 22 10 Q19 14 16 29Z" fill="#dd8a3e"/><path d="M16 31 L16 6 M16 18 L11 13 M16 14 L20 10" stroke="#a65a2a" stroke-width="1.3" stroke-linecap="round" fill="none"/><ellipse cx="12" cy="9" rx="1.6" ry="3" fill="#ffd9a8" opacity=".8"/></g>`),
  snow: () => svg(32, 32, `<circle cx="16" cy="16" r="15" fill="url(#sg)"/><circle cx="16" cy="16" r="7" fill="#ffffff" stroke="#c4d4f0" stroke-width="1.5"/><circle cx="14" cy="14" r="2.4" fill="#ffffff"/>`,
    `<radialGradient id="sg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`),
  sparkle: () => svg(32, 32, `<circle cx="16" cy="16" r="12" fill="url(#kg)"/><path d="${star4(16, 16, 14, 3.4)}" fill="#fffbe8" stroke="#e8c46a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16" cy="16" r="2.4" fill="#ffffff"/>`,
    `<radialGradient id="kg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8" stop-opacity=".8"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>`),
  puff: () => {
    const cs = [{ x: 11, y: 18, r: 7.5 }, { x: 17, y: 12, r: 8 }, { x: 22, y: 19, r: 7 }, { x: 16, y: 21, r: 7 }];
    const b = blobs(cs, { base: '#fffaf0', shadow: '#ecdfcf', outline: '#d4c4b0', sw: 1.8, dx: -1, dy: -3, k: .92 });
    return svg(32, 32, b.body + circle(14, 10, 2, '#ffffff'), b.defs);
  },
  glow: () => svg(64, 64, `<circle cx="32" cy="32" r="32" fill="url(#gg)"/>`, `<radialGradient id="gg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffdf2" stop-opacity="1"/><stop offset=".25" stop-color="#fff6d8" stop-opacity=".7"/><stop offset=".6" stop-color="#fff0c8" stop-opacity=".22"/><stop offset="1" stop-color="#fff0c8" stop-opacity="0"/></radialGradient>`),
};
function chip(s) {
  const c = s === 'winter' ? '#bfe9f8' : BR[s].base, o = dark(c, .5);
  return svg(24, 24, `<path d="M5 6 L15 3 L21 9 L19 19 L9 21 L3 14Z" fill="${c}" stroke="${o}" stroke-width="2.2" stroke-linejoin="round"/><path d="M19 19 L9 21 L3 14 L11 15Z" fill="${dark(c, .16)}"/><path d="M7 8 L13 6 L11 10Z" fill="#ffffff" opacity=".75"/>`);
}

// ---------- write everything ----------
const SKY = { spring: skySpring, summer: skySummer, autumn: skyAutumn, winter: skyWinter };
for (const s of SEASONS) {
  write(`levels/${s}/sky.svg`, SKY[s]());
  write(`levels/${s}/far.svg`, far(s));
  write(`levels/${s}/near.svg`, near(s));
  write(`bricks/${s}.svg`, brick(s, 'bud'));
  write(`bricks/${s}_tough.svg`, brick(s, 'tough'));
  write(`bricks/${s}_crack.svg`, brick(s, 'crack'));
  write(`particles/chip_${s}.svg`, chip(s));
}
write('bricks/star.svg', starBrick());
for (const [k, fn] of Object.entries(PART)) write(`particles/${k}.svg`, fn());
const pal = {};
for (const s of SEASONS) { const { skyTop, skyBottom, ink, bar, glow } = PAL[s]; pal[s] = { skyTop, skyBottom, ink, bar, glow }; }
write('levels/palette.json', JSON.stringify(pal, null, 2) + '\n');
console.log('environment art written to', OUT);
