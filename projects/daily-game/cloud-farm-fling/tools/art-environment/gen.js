#!/usr/bin/env node
// Environment art generator for Nubi's Farm Fling (original, hand-written SVG; no deps).
// Writes into game/assets/default/:
//   levels/<zone>/sky.svg     960x540  gradient sky, pale sun, soft distant clouds (flight band kept calm)
//   levels/<zone>/far.svg     960x300  rolling farm hills on the horizon line y 300, tileable, transparent above
//   levels/<zone>/near.svg    960x200  nearer farm details on the line y 200 (field band from ~y 130), tileable
//   levels/<zone>/ground.svg  960x240  the field from the grass top line y 20 downwards, tileable
//   levels/palette.json       per zone { skyTop, skyBottom, ground, ink, bar }
//   particles/*.svg           32x32 sprites
// zones: spring | summer | autumn | winter.  Contract: docs/DESIGN.md §2–§4.  Usage: node gen.js [assetsDir]
// It never writes the character files (nubi_*, bale, sling, wagon, crops, crows, hearts, icon).
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
// darker / lighter shade of a colour (outline rule: never black, always a darker version of the fill)
function dk(hex, k = 0.78) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
function lt(hex, k = 0.3) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
// place markup (drawn around 0,0 with half-width r) at x and again at x±W where it crosses the tile edge
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
// periodic ridge height function: every term has an integer number of periods over W -> seamless
function ridgeY(W, base, terms) {
  return x => {
    let y = base;
    for (const [amp, n, ph, pow] of terms) {
      const s = Math.sin(Math.PI * 2 * n * x / W + ph);
      y -= pow ? amp * Math.pow(Math.abs(s), pow) : amp * s;
    }
    return y;
  };
}
// ridge drawn 3x wide (from -W to 2W) so its outline stroke has no break at the tile edge, then clipped by the viewBox
function ridgeWide(W, base, terms, bottom, step = 6) {
  const Y = ridgeY(W, base, terms);
  let d = '';
  for (let x = -W; x <= 2 * W; x += step) d += (x === -W ? 'M' : 'L') + f(x) + ' ' + f(Y(x));
  return d + `L${2 * W} ${bottom + 10} L${-W} ${bottom + 10} Z`;
}
// open line along a ridge (for contour rows / furrows)
function ridgeLine(W, base, terms, step = 6) {
  const Y = ridgeY(W, base, terms);
  let d = '';
  for (let x = -W; x <= 2 * W; x += step) d += (x === -W ? 'M' : 'L') + f(x) + ' ' + f(Y(x));
  return d;
}
// merged blob of circles with a darker outline and one-step shading (shade on the lower right, one highlight)
function blob(circles, fill, sw = 3, shade = 0.9, hi = true) {
  const C = (dx, dy, k, dr) => circles.map(([x, y, r]) => `<circle cx="${f(x + dx * r)}" cy="${f(y + dy * r)}" r="${f(r * k + dr)}"/>`).join('');
  let m = `<g fill="${dk(fill, 0.78)}">${C(0, 0, 1, sw / 2)}</g><g fill="${dk(fill, shade)}">${C(0, 0, 1, -sw / 2)}</g>` +
    `<g fill="${fill}">${C(-0.1, -0.12, 0.86, -sw / 2)}</g>`;
  if (hi) { const [x, y, r] = circles.reduce((a, b) => (b[2] > a[2] ? b : a)); m += `<circle cx="${f(x - r * 0.38)}" cy="${f(y - r * 0.4)}" r="${f(r * 0.16)}" fill="${lt(fill, 0.28)}"/>`; }
  return m;
}
// a soft distant cloud: puffs on a flat base + flat underside band (one-step shading), low contrast
function cloud(w, h, fill, under, opacity, seed = 1) {
  const R = rng(seed), n = Math.max(3, Math.round(w / (h * 0.8)));
  let top = '', bot = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), bump = Math.sin(t * Math.PI);
    const cx = -w / 2 + h * 0.45 + t * (w - h * 0.9), r = h * (0.34 + 0.3 * bump + 0.08 * R()), cy = h * 0.16 - bump * h * 0.24;
    top += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
    bot += `<circle cx="${f(cx)}" cy="${f(cy + h * 0.1)}" r="${f(r)}"/>`;
  }
  const base = dy => `<rect x="${f(-w / 2 + h * 0.2)}" y="${f(h * 0.02 + dy)}" width="${f(w - h * 0.4)}" height="${f(h * 0.42)}" rx="${f(h * 0.21)}"/>`;
  return `<g opacity="${opacity}"><g fill="${under}">${bot}${base(h * 0.1)}</g><g fill="${fill}">${top}${base(0)}</g></g>`;
}

// ---------- palette ----------
// skyTop/skyBottom: sky gradient (mid-tone so white Nubi reads); ground: field colour below the ground tile;
// ink: HUD text colour on this zone; bar: HUD panel colour.
const PALETTE = {
  spring: { skyTop: '#6fa6d4', skyBottom: '#b5d6e4', ground: '#6e8f55', ink: '#2c4a36', bar: '#f4faee' },
  summer: { skyTop: '#5f9ad0', skyBottom: '#b2d2dc', ground: '#7d8f4c', ink: '#3a4622', bar: '#fbf8e8' },
  autumn: { skyTop: '#7f9fc7', skyBottom: '#d6c9bd', ground: '#7d6045', ink: '#4a3122', bar: '#fbf1e4' },
  winter: { skyTop: '#73879f', skyBottom: '#a8b4c2', ground: '#a9b6c6', ink: '#2c3a50', bar: '#eef3f8' }
};
const SKYMID = { spring: '#8dbbdc', summer: '#82b4d8', autumn: '#a6b5c8', winter: '#8d9db1' };

// ======================================================================
// SKIES (960x540, opaque). Visible area in play is ~y 0..490. The flight band (y ~70..400) stays empty:
// clouds only along the top edge (y < 80) and low on the horizon (y > 330, partly behind the hills).
// ======================================================================
const SW = 960, SH = 540;
function sky(z, o) {
  const P = PALETTE[z];
  let defs = vgrad('g', [[0, P.skyTop], [0.55, SKYMID[z]], [1, P.skyBottom]]) + radial('haze', o.haze, 0.55, [0.5, 0.3]) + radial('sun', o.sunHalo, 0.5, [0.45, 0.18]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // pale sun in the upper-right corner (creamy white, never firefly yellow)
  b += `<circle cx="${o.sun[0]}" cy="${o.sun[1]}" r="${o.sun[2] * 2.6}" fill="url(#sun)"/>` +
    (() => { let r = ''; for (let i = 0; i < 12; i++) { const t = i * Math.PI / 6 + 0.13, r0 = o.sun[2] * 1.35, r1 = o.sun[2] * (i % 2 ? 1.7 : 1.95);
      r += `M${f(o.sun[0] + Math.cos(t) * r0)} ${f(o.sun[1] + Math.sin(t) * r0)} L${f(o.sun[0] + Math.cos(t) * r1)} ${f(o.sun[1] + Math.sin(t) * r1)} `; }
      return `<path d="${r}" stroke="${o.sunC}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`; })() +
    `<circle cx="${o.sun[0]}" cy="${o.sun[1]}" r="${o.sun[2]}" fill="${o.sunC}" stroke="${o.sunRim}" stroke-width="3"/>` +
    `<circle cx="${o.sun[0] - o.sun[2] * 0.35}" cy="${o.sun[1] - o.sun[2] * 0.35}" r="${o.sun[2] * 0.22}" fill="#ffffff" opacity=".55"/>`;
  const cf = mix(SKYMID[z], '#ffffff', o.cloudK), cu = mix(SKYMID[z], o.under, 0.5);
  for (const [x, y, w, h, a, s] of o.clouds) b += wrap(x, y, w / 2 + 4, cloud(w, h, y > 300 ? mix(P.skyBottom, '#ffffff', o.cloudK * 0.8) : cf, y > 300 ? mix(P.skyBottom, o.under, 0.45) : cu, a, s));
  for (const [x, y, rx, ry] of [[120, 470, 280, 70], [500, 495, 320, 70], [860, 470, 260, 70]])
    b += wrap(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#haze)"/>`);
  return svg(SW, SH, b, defs);
}
const SKY = {
  spring: { sunC: '#fbf4e2', sunRim: '#f0cfb8', sunHalo: '#fff6e4', sun: [842, 62, 30], cloudK: 0.5, under: '#9fbfd6', haze: '#eef7f2',
    clouds: [[150, 40, 170, 40, 0.75, 2], [520, 26, 120, 30, 0.6, 5], [360, 370, 220, 48, 0.7, 9], [740, 350, 180, 42, 0.65, 4], [40, 390, 160, 36, 0.6, 7]] },
  summer: { sunC: '#fbf3df', sunRim: '#efc9a8', sunHalo: '#fff4dc', sun: [120, 58, 34], cloudK: 0.5, under: '#93b6d2', haze: '#f3f4e2',
    clouds: [[460, 34, 200, 44, 0.7, 12], [800, 44, 130, 32, 0.6, 13], [220, 360, 260, 52, 0.7, 14], [660, 380, 200, 44, 0.65, 15]] },
  autumn: { sunC: '#fbefe0', sunRim: '#eebc9e', sunHalo: '#ffeedd', sun: [790, 70, 30], cloudK: 0.42, under: '#c9a99a', haze: '#f5e6d8',
    clouds: [[200, 36, 220, 40, 0.7, 21], [580, 54, 140, 30, 0.55, 22], [120, 360, 220, 44, 0.65, 23], [500, 380, 280, 50, 0.7, 24], [880, 350, 180, 40, 0.6, 25]] },
  winter: { sunC: '#e9edf2', sunRim: '#c9c3cf', sunHalo: '#eef2f6', sun: [160, 66, 28], cloudK: 0.4, under: '#7e8ea3', haze: '#c9d2dc',
    clouds: [[520, 30, 240, 42, 0.55, 31], [860, 50, 150, 32, 0.45, 32], [300, 370, 260, 50, 0.7, 33], [740, 380, 240, 46, 0.65, 34], [60, 360, 160, 36, 0.6, 35]] }
};

// ======================================================================
// SHARED FARM PROPS (each drawn with its base at (0,0), growing upwards)
// ======================================================================
// round-canopy tree: trunk height h, canopy radius r
function tree(h, r, C, seed = 1, sw = 3) {
  const R = rng(seed);
  const tw = Math.max(3, r * 0.26);
  let m = `<path d="M0 2 C ${f(-tw * 0.2)} ${f(-h * 0.5)}, ${f(tw * 0.3)} ${f(-h * 0.8)}, 0 ${f(-h - r * 0.3)}" stroke="${dk(C.trunk, 0.75)}" stroke-width="${f(tw + sw)}" fill="none" stroke-linecap="round"/>` +
    `<path d="M0 2 C ${f(-tw * 0.2)} ${f(-h * 0.5)}, ${f(tw * 0.3)} ${f(-h * 0.8)}, 0 ${f(-h - r * 0.3)}" stroke="${C.trunk}" stroke-width="${f(tw)}" fill="none" stroke-linecap="round"/>`;
  const cy = -h - r * 0.55;
  const circles = [[-r * 0.62, cy + r * 0.25, r * 0.62], [r * 0.62, cy + r * 0.22, r * 0.6], [0, cy - r * 0.2, r * 0.78], [r * 0.05 * (R() - 0.5), cy + r * 0.35, r * 0.6]];
  m += blob(circles, C.leaf, sw);
  if (C.dots) for (let i = 0; i < (C.nDots || 9); i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.95;
    m += `<circle cx="${f(Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d * 0.8)}" r="${f(Math.max(1.4, r * 0.09))}" fill="${C.dots}" stroke="${dk(C.dots, 0.82)}" stroke-width="${f(sw * 0.35)}"/>`;
  }
  if (C.snow) m += `<path d="M${f(-r * 1.1)} ${f(cy - r * 0.05)} C ${f(-r * 1.0)} ${f(cy - r * 0.6)}, ${f(-r * 0.5)} ${f(cy - r * 1.0)}, 0 ${f(cy - r * 1.0)} C ${f(r * 0.5)} ${f(cy - r * 1.0)}, ${f(r * 1.0)} ${f(cy - r * 0.6)}, ${f(r * 1.15)} ${f(cy - r * 0.05)} ` +
    `C ${f(r * 0.8)} ${f(cy - r * 0.3)}, ${f(r * 0.5)} ${f(cy - r * 0.1)}, ${f(r * 0.2)} ${f(cy - r * 0.35)} C 0 ${f(cy - r * 0.15)}, ${f(-r * 0.4)} ${f(cy - r * 0.2)}, ${f(-r * 0.6)} ${f(cy - r * 0.35)} C ${f(-r * 0.8)} ${f(cy - r * 0.15)}, ${f(-r * 1.0)} ${f(cy - r * 0.2)}, ${f(-r * 1.1)} ${f(cy - r * 0.05)} Z" fill="${C.snow}" stroke="${dk(C.snow, 0.86)}" stroke-width="${f(sw * 0.7)}" stroke-linejoin="round"/>`;
  return m;
}
// pine / fir: three tiers, optional snow on each tier
function pine(h, w, C, sw = 3) {
  let m = `<rect x="${f(-w * 0.08)}" y="${f(-h * 0.2)}" width="${f(w * 0.16)}" height="${f(h * 0.2 + 2)}" fill="${C.trunk}" stroke="${dk(C.trunk, 0.75)}" stroke-width="${f(sw * 0.8)}"/>`;
  for (let i = 0; i < 3; i++) {
    const yb = -h * (0.15 + i * 0.25), yt = yb - h * 0.42, ww = w * (1 - i * 0.22) / 2;
    const p = `M${f(-ww)} ${f(yb)} Q 0 ${f(yb + h * 0.06)} ${f(ww)} ${f(yb)} L ${f(ww * 0.12)} ${f(yt)} Q 0 ${f(yt - 3)} ${f(-ww * 0.12)} ${f(yt)} Z`;
    m += `<path d="${p}" fill="${C.leaf}" stroke="${dk(C.leaf, 0.78)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
      `<path d="M${f(ww * 0.05)} ${f(yt + 2)} L${f(ww - 2)} ${f(yb - 1)} Q ${f(ww * 0.5)} ${f(yb + h * 0.03)} ${f(ww * 0.1)} ${f(yb + h * 0.03)} Z" fill="${dk(C.leaf, 0.9)}"/>`;
    if (C.snow) m += `<path d="M${f(-ww * 0.62)} ${f(yb - h * 0.14)} Q 0 ${f(yb - h * 0.08)} ${f(ww * 0.62)} ${f(yb - h * 0.14)} L ${f(ww * 0.2)} ${f(yt + h * 0.12)} Q 0 ${f(yt + h * 0.06)} ${f(-ww * 0.2)} ${f(yt + h * 0.12)} Z" fill="${C.snow}" stroke="${dk(C.snow, 0.88)}" stroke-width="${f(sw * 0.6)}" stroke-linejoin="round"/>`;
  }
  return m;
}
// bare winter tree (branchy, with snow lines)
function bareTree(h, C, sw = 3) {
  const br = `M0 2 V${-h * 0.55} M0 ${-h * 0.3} L${-h * 0.25} ${-h * 0.62} M${-h * 0.15} ${-h * 0.48} L${-h * 0.3} ${-h * 0.5} M0 ${-h * 0.55} L${h * 0.06} ${-h * 0.95} M0 ${-h * 0.45} L${h * 0.3} ${-h * 0.75} M${h * 0.18} ${-h * 0.6} L${h * 0.34} ${-h * 0.58} M${h * 0.03} ${-h * 0.8} L${-h * 0.12} ${-h * 0.92}`;
  return `<path d="${br}" stroke="${dk(C.trunk, 0.72)}" stroke-width="${f(sw + 5)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${br}" stroke="${C.trunk}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${-h * 0.22} ${-h * 0.61} L${-h * 0.08} ${-h * 0.4} M${h * 0.27} ${-h * 0.74} L${h * 0.06} ${-h * 0.5} M${h * 0.06} ${-h * 0.94} L0 ${-h * 0.7}" stroke="${C.snow}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}
// red barn (gambrel roof), base width w
function barn(w, C, sw = 3, snow) {
  const h = w * 0.55, rh = w * 0.42, e = w * 0.06;
  let m = `<rect x="${f(-w / 2)}" y="${f(-h)}" width="${w}" height="${f(h + 2)}" fill="${C.wall}" stroke="${dk(C.wall, 0.75)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<rect x="${f(w * 0.18)}" y="${f(-h)}" width="${f(w * 0.32)}" height="${f(h + 2)}" fill="${dk(C.wall, 0.9)}"/>`;
  const roof = `M${f(-w / 2 - e)} ${f(-h + 1)} L${f(-w * 0.38)} ${f(-h - rh * 0.6)} L0 ${f(-h - rh)} L${f(w * 0.38)} ${f(-h - rh * 0.6)} L${f(w / 2 + e)} ${f(-h + 1)} Z`;
  m += `<path d="${roof}" fill="${C.roof}" stroke="${dk(C.roof, 0.75)}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  m += `<path d="M0 ${f(-h - rh)} L${f(w * 0.38)} ${f(-h - rh * 0.6)} L${f(w / 2 + e)} ${f(-h + 1)} L${f(w * 0.12)} ${f(-h + 1)} Z" fill="${dk(C.roof, 0.9)}"/>`;
  if (snow) m += `<path d="M${f(-w / 2 - e - 1)} ${f(-h + 2)} L${f(-w * 0.38)} ${f(-h - rh * 0.6)} L0 ${f(-h - rh - 1)} L${f(w * 0.38)} ${f(-h - rh * 0.6)} L${f(w / 2 + e + 1)} ${f(-h + 2)} Q${f(w * 0.4)} ${f(-h - rh * 0.2)} ${f(w * 0.3)} ${f(-h - rh * 0.4)} Q${f(w * 0.1)} ${f(-h - rh * 0.6)} 0 ${f(-h - rh * 0.72)} Q${f(-w * 0.2)} ${f(-h - rh * 0.5)} ${f(-w * 0.3)} ${f(-h - rh * 0.42)} Q${f(-w * 0.42)} ${f(-h - rh * 0.2)} ${f(-w / 2 - e - 1)} ${f(-h + 2)} Z" fill="${snow}" stroke="${dk(snow, 0.86)}" stroke-width="${f(sw * 0.7)}" stroke-linejoin="round"/>`;
  // big door with an X brace, loft window
  const dw = w * 0.36, dh = h * 0.62;
  m += `<rect x="${f(-dw / 2)}" y="${f(-dh)}" width="${f(dw)}" height="${f(dh + 1)}" fill="${dk(C.wall, 0.86)}" stroke="${C.trim}" stroke-width="${f(sw * 0.9)}"/>` +
    `<path d="M${f(-dw / 2)} ${f(-dh)} L${f(dw / 2)} 0 M${f(dw / 2)} ${f(-dh)} L${f(-dw / 2)} 0" stroke="${C.trim}" stroke-width="${f(sw * 0.8)}"/>` +
    `<rect x="${f(-w * 0.09)}" y="${f(-h - rh * 0.5)}" width="${f(w * 0.18)}" height="${f(w * 0.14)}" fill="${dk(C.wall, 0.7)}" stroke="${C.trim}" stroke-width="${f(sw * 0.8)}"/>`;
  return m;
}
// silo: cylinder + dome
function silo(w, h, C, sw = 3, snow) {
  let m = `<rect x="${f(-w / 2)}" y="${f(-h)}" width="${w}" height="${f(h + 2)}" fill="${C.silo}" stroke="${dk(C.silo, 0.75)}" stroke-width="${sw}"/>` +
    `<rect x="${f(w * 0.12)}" y="${f(-h)}" width="${f(w * 0.38)}" height="${f(h + 2)}" fill="${dk(C.silo, 0.9)}"/>`;
  for (let i = 1; i < 4; i++) m += `<path d="M${f(-w / 2)} ${f(-h * i / 4)} H${f(w / 2)}" stroke="${dk(C.silo, 0.8)}" stroke-width="${f(sw * 0.6)}"/>`;
  m += `<path d="M${f(-w / 2 - 1)} ${f(-h)} Q 0 ${f(-h - w * 0.75)} ${f(w / 2 + 1)} ${f(-h)} Z" fill="${snow || C.dome}" stroke="${dk(snow || C.dome, 0.78)}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  return m;
}
// Dutch-style farm windmill: tower height h, sails rotated by ang
function windmill(h, C, ang = 18, sw = 3) {
  const bw = h * 0.36, tw = h * 0.2;
  let m = `<path d="M${f(-bw / 2)} 2 L${f(-tw / 2)} ${f(-h)} H${f(tw / 2)} L${f(bw / 2)} 2 Z" fill="${C.tower}" stroke="${dk(C.tower, 0.75)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="M${f(bw * 0.05)} 2 L${f(tw * 0.05)} ${f(-h)} H${f(tw / 2)} L${f(bw / 2)} 2 Z" fill="${dk(C.tower, 0.9)}"/>` +
    `<path d="M${f(-bw * 0.13)} 2 V${f(-h * 0.2)} Q0 ${f(-h * 0.3)} ${f(bw * 0.13)} ${f(-h * 0.2)} V2 Z" fill="${C.door}" stroke="${dk(C.door, 0.75)}" stroke-width="${f(sw * 0.8)}"/>` +
    `<circle cx="0" cy="${f(-h * 0.55)}" r="${f(h * 0.05)}" fill="${C.door}" stroke="${dk(C.door, 0.75)}" stroke-width="${f(sw * 0.7)}"/>` +
    `<path d="M${f(-tw / 2 - 4)} ${f(-h + 2)} Q0 ${f(-h - h * 0.2)} ${f(tw / 2 + 4)} ${f(-h + 2)} Z" fill="${C.cap}" stroke="${dk(C.cap, 0.75)}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const hub = -h - h * 0.02, L = h * 0.62, sw2 = h * 0.12;
  let sails = '';
  for (let i = 0; i < 4; i++) {
    sails += `<g transform="rotate(${ang + i * 90})"><path d="M0 0 V${f(-L)}" stroke="${dk(C.sail, 0.6)}" stroke-width="${f(sw * 1.2)}" stroke-linecap="round"/>` +
      `<rect x="2" y="${f(-L)}" width="${f(sw2)}" height="${f(L * 0.74)}" fill="${C.sail}" stroke="${dk(C.sail, 0.72)}" stroke-width="${f(sw * 0.8)}" stroke-linejoin="round"/>` +
      `<path d="M${f(2 + sw2 / 2)} ${f(-L)} V${f(-L * 0.26)} M2 ${f(-L * 0.75)} H${f(2 + sw2)} M2 ${f(-L * 0.5)} H${f(2 + sw2)}" stroke="${dk(C.sail, 0.8)}" stroke-width="${f(sw * 0.5)}"/></g>`;
  }
  m += `<g transform="translate(0 ${f(hub)})">${sails}<circle r="${f(h * 0.05)}" fill="${C.cap}" stroke="${dk(C.cap, 0.75)}" stroke-width="${f(sw * 0.8)}"/></g>`;
  return m;
}
// wooden fence from x0 to x1 (posts every gap px), height h
function fence(x0, x1, h, C, gap = 30, sw = 3, snow) {
  let rails = '', posts = '', caps = '';
  for (const y of [-h * 0.35, -h * 0.75]) rails += `<rect x="${x0}" y="${f(y - 3)}" width="${x1 - x0}" height="6" rx="2" fill="${C.wood}" stroke="${dk(C.wood, 0.75)}" stroke-width="${f(sw * 0.8)}"/>`;
  for (let x = x0 + 4; x <= x1 - 2; x += gap) {
    posts += `<path d="M${f(x - 4)} 2 V${f(-h + 3)} L${f(x)} ${f(-h - 3)} L${f(x + 4)} ${f(-h + 3)} V2 Z" fill="${C.wood}" stroke="${dk(C.wood, 0.75)}" stroke-width="${f(sw * 0.8)}" stroke-linejoin="round"/>` +
      `<rect x="${f(x + 0.5)}" y="${f(-h + 3)}" width="3" height="${f(h - 2)}" fill="${dk(C.wood, 0.9)}"/>`;
    if (snow) caps += `<path d="M${f(x - 5.5)} ${f(-h + 4)} Q${f(x - 5)} ${f(-h - 6)} ${f(x)} ${f(-h - 7)} Q${f(x + 5)} ${f(-h - 6)} ${f(x + 5.5)} ${f(-h + 4)} Q${f(x)} ${f(-h + 1)} ${f(x - 5.5)} ${f(-h + 4)} Z" fill="${snow}" stroke="${dk(snow, 0.86)}" stroke-width="1.6"/>`;
  }
  if (snow) for (const y of [-h * 0.35, -h * 0.75]) caps += `<rect x="${x0 + 1}" y="${f(y - 6)}" width="${x1 - x0 - 2}" height="4" rx="2" fill="${snow}"/>`;
  return rails + posts + caps;
}
// round haystack (muted straw, not firefly yellow)
function haystack(w, C, sw = 3, snow) {
  const h = w * 0.75;
  let m = `<path d="M${f(-w / 2)} 2 C ${f(-w / 2)} ${f(-h * 0.7)}, ${f(-w * 0.25)} ${f(-h)}, 0 ${f(-h)} C ${f(w * 0.25)} ${f(-h)}, ${f(w / 2)} ${f(-h * 0.7)}, ${f(w / 2)} 2 Z" fill="${C.hay}" stroke="${dk(C.hay, 0.72)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="M${f(w * 0.1)} ${f(-h * 0.98)} C ${f(w * 0.35)} ${f(-h * 0.9)}, ${f(w / 2)} ${f(-h * 0.6)}, ${f(w / 2 - 1)} 1 L${f(w * 0.15)} 1 C ${f(w * 0.25)} ${f(-h * 0.4)}, ${f(w * 0.2)} ${f(-h * 0.8)}, ${f(w * 0.1)} ${f(-h * 0.98)} Z" fill="${dk(C.hay, 0.9)}"/>`;
  const R = rng(Math.round(w * 13));
  for (let i = 0; i < 7; i++) { const x = (R() - 0.5) * w * 0.7, y = -h * (0.15 + R() * 0.65); m += `<path d="M${f(x)} ${f(y)} q3 -5 7 -6" stroke="${dk(C.hay, 0.78)}" stroke-width="${f(sw * 0.55)}" fill="none" stroke-linecap="round"/>`; }
  m += `<path d="M${f(-w * 0.44)} ${f(-h * 0.25)} Q0 ${f(-h * 0.12)} ${f(w * 0.46)} ${f(-h * 0.25)}" stroke="${dk(C.hay, 0.7)}" stroke-width="${f(sw * 0.8)}" fill="none"/>`;
  if (snow) m += `<path d="M${f(-w * 0.4)} ${f(-h * 0.6)} C ${f(-w * 0.3)} ${f(-h * 1.05)}, ${f(w * 0.3)} ${f(-h * 1.05)}, ${f(w * 0.42)} ${f(-h * 0.6)} Q${f(w * 0.2)} ${f(-h * 0.72)} 0 ${f(-h * 0.66)} Q${f(-w * 0.2)} ${f(-h * 0.74)} ${f(-w * 0.4)} ${f(-h * 0.6)} Z" fill="${snow}" stroke="${dk(snow, 0.86)}" stroke-width="2"/>`;
  else m += `<circle cx="${f(-w * 0.2)}" cy="${f(-h * 0.7)}" r="${f(w * 0.06)}" fill="${lt(C.hay, 0.3)}"/>`;
  return m;
}
// rolled hay bale seen from the side (round end showing the spiral)
function hayRoll(r, C, sw = 3) {
  return `<rect x="${f(-r * 1.3)}" y="${f(-r * 2)}" width="${f(r * 1.6)}" height="${f(r * 2 + 2)}" rx="${f(r * 0.3)}" fill="${dk(C.hay, 0.93)}" stroke="${dk(C.hay, 0.72)}" stroke-width="${sw}"/>` +
    `<circle cx="${f(r * 0.3)}" cy="${f(-r)}" r="${f(r)}" fill="${C.hay}" stroke="${dk(C.hay, 0.72)}" stroke-width="${sw}"/>` +
    `<path d="M${f(r * 0.3)} ${f(-r)} m-2 0 a3 3 0 1 1 5 2 a7 7 0 1 1 -10 -6 a12 12 0 1 1 14 14" stroke="${dk(C.hay, 0.75)}" stroke-width="${f(sw * 0.6)}" fill="none" stroke-linecap="round" transform="translate(0 0) scale(1)"/>`;
}
// pumpkin (muted orange — the crop sprites are brighter)
function pumpkin(r, C, sw = 2.5) {
  const h = r * 0.8;
  let m = `<g fill="${C.pump}" stroke="${dk(C.pump, 0.72)}" stroke-width="${sw}"><ellipse cx="${f(-r * 0.42)}" cy="${f(-h)}" rx="${f(r * 0.55)}" ry="${f(h)}"/><ellipse cx="${f(r * 0.42)}" cy="${f(-h)}" rx="${f(r * 0.55)}" ry="${f(h)}"/><ellipse cx="0" cy="${f(-h)}" rx="${f(r * 0.5)}" ry="${f(h * 1.02)}"/></g>` +
    `<ellipse cx="${f(r * 0.5)}" cy="${f(-h * 0.9)}" rx="${f(r * 0.3)}" ry="${f(h * 0.7)}" fill="${dk(C.pump, 0.9)}"/>` +
    `<ellipse cx="0" cy="${f(-h)}" rx="${f(r * 0.5)}" ry="${f(h * 1.02)}" fill="none" stroke="${dk(C.pump, 0.72)}" stroke-width="${f(sw * 0.8)}"/>` +
    `<path d="M0 ${f(-h * 1.9)} q2 -6 6 -8" stroke="${C.stem}" stroke-width="${f(sw * 1.5)}" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${f(-r * 0.15)}" cy="${f(-h * 1.5)}" r="${f(r * 0.1)}" fill="${lt(C.pump, 0.35)}"/>`;
  return m;
}
// low bush
function bush(w, fill, sw = 3, extra = '') {
  return blob([[-w * 0.28, -w * 0.18, w * 0.26], [w * 0.28, -w * 0.18, w * 0.25], [0, -w * 0.3, w * 0.32]], fill, sw) + extra;
}
// snowman (winter near)
function snowman(s, C) {
  return `<g transform="scale(${s})">` + blob([[0, -18, 20]], C.snow, 3, 0.9, false) + blob([[0, -48, 14]], C.snow, 3, 0.9, false) +
    `<circle cx="-4" cy="-51" r="2" fill="#4c5566"/><circle cx="5" cy="-51" r="2" fill="#4c5566"/>` +
    `<path d="M0 -46 l9 2 l-9 2 Z" fill="#d9926a" stroke="#a96a4a" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M-12 -37 Q0 -32 12 -37" stroke="${C.scarf}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M8 -36 l3 12" stroke="${C.scarf}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M-16 -26 L-30 -38 M-27 -35 l-3 -6 M16 -26 L28 -40" stroke="#8b7462" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `<circle cx="0" cy="-22" r="2" fill="#7d8697"/><circle cx="0" cy="-12" r="2" fill="#7d8697"/></g>`;
}

// ======================================================================
// FAR (960x300, horizon y 300). Hill tops stay below y ~205 so the flight band remains open.
// ======================================================================
const FW = 960, FH = 300;
// generic far landscape: back ridge, front ridge with contour rows, props placed on the ridges
function farScene(o) {
  let b = '', defs = '';
  const back = ridgeY(FW, o.back.base, o.back.terms), front = ridgeY(FW, o.front.base, o.front.terms);
  b += `<path d="${ridgeWide(FW, o.back.base, o.back.terms, 300)}" fill="${o.back.c}" stroke="${dk(o.back.c, 0.88)}" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (o.back.cap) { // snow / light caps on the back ridge tops
    defs += `<clipPath id="bk"><path d="${ridgeWide(FW, o.back.base, o.back.terms, 300)}"/></clipPath>`;
    b += `<g clip-path="url(#bk)"><path d="${ridgeWide(FW, o.back.base + 14, o.back.terms.map(([a, n, p, w]) => [a * 1.05, n, p, w]), 300)}" fill="${o.back.c2}"/></g>`;
  }
  for (const p of o.backProps || []) b += wrap(p[0], back(p[0]) + (p[3] || 4), p[1], p[2]);
  b += `<path d="${ridgeWide(FW, o.front.base, o.front.terms, 300)}" fill="${o.front.c}" stroke="${dk(o.front.c, 0.86)}" stroke-width="2.5" stroke-linejoin="round"/>`;
  defs += `<clipPath id="fr"><path d="${ridgeWide(FW, o.front.base, o.front.terms, 300)}"/></clipPath>`;
  let rows = '';
  for (const [dy, c, sw] of o.rows) rows += `<path d="${ridgeLine(FW, o.front.base + dy, o.front.terms.map(([a, n, p, w]) => [a * (1 - dy / 90), n, p, w]))}" stroke="${c}" stroke-width="${sw}" fill="none"/>`;
  // patchwork dividers (tileable: period divides W)
  if (o.patch) for (let x = o.patch.x0; x < FW; x += o.patch.step) rows += wrap(x, 0, 40, `<path d="M0 ${f(front(x) + 2)} Q ${o.patch.lean} ${f(front(x) + 50)} ${o.patch.lean * 1.6} 310" stroke="${o.patch.c}" stroke-width="3" fill="none"/>`);
  b += `<g clip-path="url(#fr)">${rows}</g>`;
  for (const p of o.frontProps || []) b += wrap(p[0], front(p[0]) + (p[3] || 4), p[1], p[2]);
  return svg(FW, FH, b, defs);
}
const FAR = {
  spring: () => {
    const backC = '#a8c7a6', frontC = '#97bd8a', T = { trunk: '#8e7765', leaf: '#e7c3cf' }, G = { trunk: '#8e7765', leaf: '#8db486' };
    const B = { wall: '#b5675d', roof: '#87625c', trim: '#efe5da' }, S = { silo: '#c9c3b8', dome: '#9a8f86' };
    const small = (x, r, C, s) => [x, r * 1.4, tree(r * 0.9, r, C, s, 2), 3];
    return farScene({
      back: { base: 246, terms: [[20, 2, 0.5], [9, 5, 1.7]], c: backC },
      front: { base: 274, terms: [[12, 3, 1.2], [5, 7, 0.4]], c: frontC },
      rows: [[12, dk(frontC, 0.95), 3], [26, lt(frontC, 0.12), 4], [40, dk(frontC, 0.95), 3]],
      patch: { x0: 70, step: 240, lean: 18, c: dk(frontC, 0.94) },
      backProps: [small(80, 13, T, 1), small(110, 10, G, 2), small(300, 12, G, 3), small(330, 14, T, 4), small(520, 11, T, 5), small(790, 13, G, 6), small(820, 10, T, 7)],
      frontProps: [[620, 40, barn(46, B, 2.5), 5], [660, 14, silo(16, 50, S, 2.5), 5], small(705, 15, T, 8), small(180, 16, T, 9), small(420, 12, G, 10), small(900, 14, T, 11)]
    });
  },
  summer: () => {
    const backC = '#b2bf88', frontC = '#a6b676', G = { trunk: '#8a7560', leaf: '#86a974' }, B = { wall: '#b06a5c', roof: '#86655c', trim: '#efe5da' }, S = { silo: '#cdc6b9', dome: '#9a8f86' };
    const small = (x, r, s) => [x, r * 1.4, tree(r * 0.9, r, G, s, 2), 3];
    // tiny sunflower rows (only small & far): little muted heads with brown centres
    let sun = '';
    for (let row = 0; row < 2; row++) for (let i = 0; i < 11; i++) {
      const x = -70 + i * 14 + row * 7, y = -4 - row * 7;
      sun += `<path d="M${x} ${y + 8} V${y}" stroke="#7d9360" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="3.6" fill="#d3b46a" stroke="#a88a4c" stroke-width="1"/><circle cx="${x}" cy="${y}" r="1.6" fill="#8a6446"/>`;
    }
    return farScene({
      back: { base: 250, terms: [[16, 2, 2.1], [8, 4, 0.6]], c: backC },
      front: { base: 278, terms: [[10, 2, 0.4], [6, 6, 1.3]], c: frontC },
      rows: [[10, '#bcc184', 4], [22, dk(frontC, 0.94), 3], [34, '#bcc184', 4], [46, dk(frontC, 0.94), 3]],
      patch: { x0: 140, step: 320, lean: -20, c: dk(frontC, 0.93) },
      backProps: [small(60, 12, 1), small(90, 9, 2), small(400, 13, 3), small(690, 11, 4), small(720, 13, 5)],
      frontProps: [[250, 80, sun, 6], [520, 36, barn(40, B, 2.5), 5], [556, 14, silo(14, 44, S, 2.5), 5], small(820, 16, 6), small(850, 12, 7), [880, 80, sun.replace(/-70/g, '-40'), 6]]
    });
  },
  autumn: () => {
    const backC = '#c4a493', frontC = '#b0906a', O = { trunk: '#86685a', leaf: '#d49a68' }, R = { trunk: '#86685a', leaf: '#c27d5d' }, Y = { trunk: '#86685a', leaf: '#c9a46c' };
    const B = { wall: '#a8645a', roof: '#7f5c54', trim: '#efe4d8' }, H = { hay: '#cfb489' };
    const small = (x, r, C, s) => [x, r * 1.4, tree(r * 0.9, r, C, s, 2), 3];
    return farScene({
      back: { base: 244, terms: [[18, 2, 1.0], [10, 5, 0.2]], c: backC },
      front: { base: 276, terms: [[12, 3, 2.2], [5, 8, 0.9]], c: frontC },
      rows: [[12, dk(frontC, 0.93), 3], [24, lt(frontC, 0.12), 3], [36, dk(frontC, 0.93), 3], [48, lt(frontC, 0.12), 3]],
      patch: { x0: 30, step: 240, lean: 22, c: dk(frontC, 0.92) },
      backProps: [small(140, 13, O, 1), small(170, 10, R, 2), small(460, 12, Y, 3), small(610, 14, O, 4), small(640, 10, R, 5), small(900, 12, O, 6)],
      frontProps: [[300, 40, barn(44, B, 2.5), 5], small(350, 15, R, 7), [420, 14, haystack(20, H, 2), 4], [445, 12, haystack(16, H, 2), 4], small(760, 16, O, 8), [800, 14, haystack(20, H, 2), 4], small(40, 13, Y, 9)]
    });
  },
  winter: () => {
    const backC = '#a3afc0', frontC = '#b9c4d1', snow = '#dfe5ec', P = { trunk: '#7d6b60', leaf: '#6f8a8a', snow }, B = { wall: '#a3665f', roof: '#7c5f5b', trim: '#e6e1dc' }, S = { silo: '#bcbcbf', dome: '#8f8f96' };
    const fir = (x, h, s = 2) => [x, h * 0.3, pine(h, h * 0.55, P, s), 3];
    return farScene({
      back: { base: 246, terms: [[22, 2, 0.8], [10, 5, 2.4]], c: backC, cap: true, c2: dk(backC, 0.95) },
      front: { base: 274, terms: [[11, 3, 0.3], [5, 7, 1.9]], c: frontC },
      rows: [[14, dk(frontC, 0.95), 3], [30, lt(frontC, 0.2), 4], [46, dk(frontC, 0.95), 3]],
      backProps: [fir(70, 30), fir(92, 24), fir(380, 28), fir(402, 34), fir(426, 24), fir(700, 30), fir(860, 26)],
      frontProps: [[560, 40, barn(44, B, 2.5, snow), 5], [598, 14, silo(15, 46, S, 2.5, snow), 5], fir(200, 40), fir(226, 30), fir(640, 34), fir(940, 38)]
    });
  }
};

// ======================================================================
// NEAR (960x200, line y 200). A continuous field band from ~y 130 hides the far layer's bottom edge;
// props stand on it. Most of the width stays below y 80 (≤ 120 px tall); one tall element per zone.
// ======================================================================
const NW = 960, NH = 200;
function nearBase(fieldC, terms = [[5, 2, 0.3], [4, 5, 1.1]], base = 124) {
  let b = `<path d="${ridgeWide(NW, base, terms, 200, 4)}" fill="${fieldC}" stroke="${dk(fieldC, 0.86)}" stroke-width="3" stroke-linejoin="round"/>`;
  b += `<path d="${ridgeWide(NW, base + 36, terms.map(([a, n, p]) => [a * 0.6, n, p]), 200, 4)}" fill="${dk(fieldC, 0.95)}"/>`;
  return { b, Y: ridgeY(NW, base, terms) };
}
// scatter of little dots / tufts on the field (wrapped)
function speckles(R, n, y0, y1, markup) {
  let b = '';
  for (let i = 0; i < n; i++) { const x = R() * 960, y = y0 + R() * (y1 - y0); b += wrap(x, y, 10, markup(R)); }
  return b;
}
const NEAR = {
  spring: () => {
    const field = '#8fb97c', { b: base, Y } = nearBase(field);
    const T = { trunk: '#8b6e5a', leaf: '#efc6d3', dots: '#f8e4ea', nDots: 10 }, G = { trunk: '#8b6e5a', leaf: '#86b17a' }, W = { wood: '#c6a483' };
    let b = base;
    b += speckles(rng(5), 34, 158, 196, R => { const c = R() < 0.5 ? '#efc4d3' : '#f4efe6'; return `<circle r="2.6" fill="${c}" stroke="${dk(c, 0.8)}" stroke-width="1"/>`; });
    b += wrap(130, Y(130) + 18, 70, tree(56, 40, T, 1));
    b += wrap(250, Y(250) + 14, 40, bush(56, '#7fa972'));
    b += wrap(400, Y(400) + 16, 110, fence(-100, 100, 34, W, 28));
    b += wrap(540, Y(540) + 16, 40, tree(34, 26, G, 2));
    b += wrap(690, Y(690) + 18, 30, bush(44, '#86ae78', 3, `<g fill="#efc4d3" stroke="#c99aaa" stroke-width="1"><circle cx="-8" cy="-22" r="3"/><circle cx="6" cy="-26" r="3"/><circle cx="14" cy="-14" r="3"/></g>`));
    b += wrap(830, Y(830) + 20, 80, tree(66, 46, T, 3));
    return svg(NW, NH, b);
  },
  summer: () => {
    const field = '#a6b673', { b: base, Y } = nearBase(field, [[4, 2, 1.4], [3, 6, 0.2]]);
    const G = { trunk: '#86705c', leaf: '#82a870' }, M = { tower: '#e0d3c1', cap: '#9b6c60', door: '#8f6d5c', sail: '#ece5d8' }, H = { hay: '#cdb58c' }, W = { wood: '#c2a07f' };
    let b = base;
    // stripes of crop rows on the field band
    for (const [dy, c] of [[18, '#b5bf7e'], [34, dk(field, 0.93)], [50, '#b5bf7e'], [66, dk(field, 0.93)]]) b += `<path d="${ridgeLine(NW, 124 + dy, [[3, 2, 1.4], [2, 6, 0.2]])}" stroke="${c}" stroke-width="4" fill="none"/>`;
    b += wrap(150, Y(150) + 18, 60, tree(46, 34, G, 1));
    b += wrap(215, Y(215) + 16, 30, bush(42, '#7fa36d'));
    b += wrap(370, Y(370) + 18, 30, hayRoll(16, H)) + wrap(420, Y(420) + 20, 30, hayRoll(13, H));
    b += wrap(540, Y(540) + 16, 90, fence(-80, 80, 32, W, 28));
    b += wrap(760, Y(760) + 20, 90, windmill(96, M, 22));
    b += wrap(900, Y(900) + 16, 40, bush(52, '#7fa36d'));
    return svg(NW, NH, b);
  },
  autumn: () => {
    const field = '#a98d62', { b: base, Y } = nearBase(field, [[5, 2, 2.0], [3, 5, 0.6]]);
    const O = { trunk: '#80634f', leaf: '#d6996a' }, R = { trunk: '#80634f', leaf: '#c3785b' }, H = { hay: '#cfb489' }, P = { pump: '#d58c58', stem: '#6f7a4c' }, W = { wood: '#b8977a' };
    let b = base;
    b += speckles(rng(9), 26, 160, 196, R => `<path d="M-3 0 l3 -6 l3 6" stroke="#9a7f58" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
    b += wrap(110, Y(110) + 20, 70, tree(58, 42, O, 1));
    b += wrap(260, Y(260) + 18, 40, haystack(60, H)) + wrap(318, Y(318) + 18, 30, haystack(44, H));
    b += wrap(430, Y(430) + 18, 20, pumpkin(14, P)) + wrap(458, Y(458) + 20, 14, pumpkin(10, P)) + wrap(484, Y(484) + 18, 18, pumpkin(12, P));
    b += wrap(610, Y(610) + 18, 50, tree(40, 30, R, 2));
    b += wrap(740, Y(740) + 16, 80, fence(-70, 70, 32, W, 28));
    b += wrap(880, Y(880) + 20, 30, pumpkin(15, P)) + wrap(910, Y(910) + 20, 20, pumpkin(10, P));
    return svg(NW, NH, b);
  },
  winter: () => {
    const field = '#c6d0dc', { b: base, Y } = nearBase(field, [[5, 2, 0.9], [4, 5, 2.2]]);
    const snow = '#e7ecf2', P = { trunk: '#7d6b60', leaf: '#6d8887', snow }, T = { trunk: '#86766a', snow }, W = { wood: '#a88e7c' }, S = { snow: '#e9eef4', scarf: '#c26f6a' };
    let b = base;
    b += speckles(rng(13), 18, 162, 196, R => `<ellipse rx="${f(8 + R() * 8)}" ry="2" fill="${dk(field, 0.93)}"/>`);
    b += wrap(120, Y(120) + 18, 40, pine(104, 60, P));
    b += wrap(180, Y(180) + 18, 30, pine(74, 44, P));
    b += wrap(400, Y(400) + 16, 120, fence(-110, 110, 32, W, 28, 3, snow));
    b += wrap(640, Y(640) + 20, 40, snowman(1, S));
    b += wrap(820, Y(820) + 18, 60, bareTree(110, T));
    b += wrap(900, Y(900) + 16, 30, pine(60, 36, P));
    return svg(NW, NH, b);
  }
};

// ======================================================================
// GROUND (960x240, grass top line y 20). Scalloped grass edge (period 30 px), then furrow rows; bottom = palette.ground.
// ======================================================================
const GW = 960, GH = 240, GY = 20;
function ground(z, o) {
  let b = '';
  // scalloped top edge (32 tufts per tile)
  const n = 32, p = GW / n;
  let crest = `M0 ${GY}`;
  for (let i = 0; i < n; i++) { const x = i * p; crest += ` Q${f(x + p * 0.25)} ${GY - 7} ${f(x + p * 0.5)} ${GY - 3} Q${f(x + p * 0.75)} ${GY + 1} ${f(x + p)} ${GY}`; }
  const defs = vgrad('gg', [[0, o.top], [0.25, o.top], [0.26, o.band2], [1, PALETTE[z].ground]]);
  b += `<path d="${crest} L${GW} ${GH} L0 ${GH} Z" fill="url(#gg)"/>`;
  b += `<path d="${crest}" stroke="${dk(o.top, 0.8)}" stroke-width="3" fill="none" stroke-linejoin="round"/>`;
  // lighter lip just under the edge (one highlight band)
  b += `<path d="${crest} L${GW} ${GY + 8} Q${GW / 2} ${GY + 10} 0 ${GY + 8} Z" fill="${lt(o.top, 0.18)}" opacity=".8"/>`;
  // furrow rows: alternating ridges (uniform horizontally -> seamless), with a soft shadow line under each
  for (const [y, h, c] of o.rows) {
    b += `<rect x="0" y="${y}" width="${GW}" height="${h}" fill="${c}"/>`;
    b += `<rect x="0" y="${y + h - 3}" width="${GW}" height="3" fill="${dk(c, 0.88)}"/>`;
  }
  // details (tufts, sprouts, stubble, snow sparkles) wrapped at the edge
  const R = rng(o.seed);
  for (const [y0, y1, cnt, mk] of o.details) for (let i = 0; i < cnt; i++) { const x = (i + R() * 0.8) * GW / cnt, y = y0 + R() * (y1 - y0); b += wrap(x, y, 12, mk(R)); }
  return svg(GW, GH, b, defs);
}
const tuft = (c, s = 1) => `<path transform="scale(${s})" d="M-7 1 Q-8 -6 -11 -11 Q-4 -6 -2 0 Q-1 -10 2 -14 Q3 -7 2.5 0 Q6 -7 11 -9 Q7 -4 6 1 Z" fill="${c}" stroke="${dk(c, 0.75)}" stroke-width="1.6" stroke-linejoin="round"/>`;
const sprout = c => `<path d="M0 0 V-7" stroke="${dk(c, 0.75)}" stroke-width="2" stroke-linecap="round"/><path d="M0 -6 Q-6 -10 -8 -5 Q-4 -3 0 -6 Z M0 -7 Q6 -12 8 -6 Q4 -4 0 -7 Z" fill="${c}" stroke="${dk(c, 0.75)}" stroke-width="1.2"/>`;
const GROUND = {
  spring: () => ground('spring', { top: '#86b46c', band2: '#7aa563', seed: 41,
    rows: [[70, 34, '#9c7f62'], [104, 22, '#7aa060'], [126, 34, '#957a5e'], [160, 22, '#76995c'], [182, 34, '#8c735a']],
    details: [[30, 58, 18, R => tuft(R() < 0.5 ? '#9cc57f' : '#78a65f', 0.8 + R() * 0.4)], [36, 60, 10, R => `<circle r="2.6" fill="#f4efe6" stroke="#c9c0b2" stroke-width="1"/><circle r="1" fill="#d9c08f"/>`],
      [84, 86, 16, () => sprout('#86b46c')], [140, 142, 14, () => sprout('#86b46c')], [196, 198, 12, () => sprout('#7fac65')]] }),
  summer: () => ground('summer', { top: '#9db35f', band2: '#90a656', seed: 42,
    rows: [[70, 30, '#b9b778'], [100, 22, '#8a9e52'], [122, 30, '#b2af70'], [152, 22, '#86984f'], [174, 30, '#aaa66a'], [204, 36, '#80904b']],
    details: [[30, 58, 20, R => tuft(R() < 0.5 ? '#aec46f' : '#8aa252', 0.8 + R() * 0.4)],
      [80, 90, 22, () => `<path d="M-4 2 L-3 -7 M0 2 V-9 M4 2 L3 -7" stroke="#9a9a5e" stroke-width="1.6" stroke-linecap="round"/>`],
      [132, 142, 20, () => `<path d="M-4 2 L-3 -7 M0 2 V-9 M4 2 L3 -7" stroke="#949258" stroke-width="1.6" stroke-linecap="round"/>`]] }),
  autumn: () => ground('autumn', { top: '#a59a5f', band2: '#988c56', seed: 43,
    rows: [[70, 32, '#9b7655'], [102, 20, '#8e8452'], [122, 32, '#93704f'], [154, 20, '#87794c'], [174, 32, '#8a694b'], [206, 34, '#7d6045']],
    details: [[30, 58, 18, R => tuft(R() < 0.5 ? '#b0a466' : '#94894f', 0.8 + R() * 0.4)],
      [32, 60, 9, R => `<g transform="rotate(${Math.round(R() * 360)})"><path d="M0 -5 C 4 -3, 4 3, 0 5 C -4 3, -4 -3, 0 -5 Z" fill="${R() < 0.5 ? '#d39563' : '#c4795a'}" stroke="#93604a" stroke-width="1.2"/></g>`],
      [80, 92, 20, () => `<path d="M-3 2 L-2 -6 M2 2 L3 -6" stroke="#b39a6a" stroke-width="1.8" stroke-linecap="round"/>`],
      [132, 144, 18, () => `<path d="M-3 2 L-2 -6 M2 2 L3 -6" stroke="#a88f61" stroke-width="1.8" stroke-linecap="round"/>`]] }),
  winter: () => ground('winter', { top: '#d9e0e9', band2: '#cbd4df', seed: 44,
    rows: [[72, 30, '#c9d2de'], [102, 22, '#d8dfe8'], [124, 30, '#c2ccd9'], [154, 22, '#d1d9e3'], [176, 30, '#bcc7d4'], [206, 34, '#b1bdcb']],
    details: [[34, 60, 14, R => `<ellipse rx="${f(10 + R() * 10)}" ry="2.4" fill="#cdd6e1"/>`],
      [78, 90, 16, () => `<path d="M-3 2 L-2 -5 M2 2 L3 -6" stroke="#8f8476" stroke-width="1.8" stroke-linecap="round"/>`],
      [30, 200, 26, R => `<circle r="${f(1 + R() * 1.2)}" fill="#f6f9fc"/>`]] })
};

// ======================================================================
// PARTICLES (32x32)
// ======================================================================
const P32 = b => svg(32, 32, b);
const particles = {
  sparkle: P32(`<path d="M16 2 Q18 14 30 16 Q18 18 16 30 Q14 18 2 16 Q14 14 16 2 Z" fill="#ffffff" stroke="#d9d6ee" stroke-width="1.2" stroke-linejoin="round"/><circle cx="16" cy="16" r="3" fill="#fbfbff"/>`),
  drop: P32(`<path d="M16 3 C 18 10, 25 15, 25 21 A9 9 0 0 1 7 21 C 7 15, 14 10, 16 3 Z" fill="#a9d6ef" stroke="#5f9fc8" stroke-width="2" stroke-linejoin="round"/><path d="M20 15 C 23 19, 23 23, 20 26 L17 26 Z" fill="#8cc3e3"/><path d="M11.5 18 Q11 22 13 24" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  snow: P32(`<g stroke="#9fb4cc" stroke-width="4.6" stroke-linecap="round"><path d="M16 4 V28 M5.6 10 L26.4 22 M5.6 22 L26.4 10"/></g>` +
    `<g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"><path d="M16 4 V28 M5.6 10 L26.4 22 M5.6 22 L26.4 10"/></g><circle cx="16" cy="16" r="4" fill="#ffffff" stroke="#9fb4cc" stroke-width="1.4"/>`),
  ripple: P32(`<ellipse cx="16" cy="18" rx="14" ry="5.5" fill="none" stroke="#7fb4d6" stroke-width="2.4" opacity=".9"/><ellipse cx="16" cy="18" rx="8" ry="3" fill="none" stroke="#e6f4fb" stroke-width="2"/>`),
  // bump star: soft white-pink with a lavender outline (yellow stays reserved for fireflies)
  star: P32(`<path d="M16 3 L19.5 11.5 L28.5 12 L21.5 17.8 L23.8 26.8 L16 21.8 L8.2 26.8 L10.5 17.8 L3.5 12 L12.5 11.5 Z" fill="#fff3f8" stroke="#a98fbc" stroke-width="2" stroke-linejoin="round"/><path d="M16 21.8 L23.8 26.8 L21.5 17.8 L28.5 12 L19.5 11.5 Z" fill="#f2dcea"/><circle cx="13" cy="13" r="1.8" fill="#ffffff"/>`),
  // tiny ambient firefly: yellow-green glow
  firefly: svg(32, 32, `<defs>${radial('fg', '#e8ff8a', 0.85, [0.4, 0.4])}</defs><circle cx="16" cy="16" r="15" fill="url(#fg)"/><circle cx="16" cy="16" r="4.5" fill="#efffa8" stroke="#95b843" stroke-width="1.5"/><circle cx="15" cy="15" r="1.6" fill="#ffffff"/>`),
  petal: P32(`<path d="M16 4 C 24 8, 25 20, 16 28 C 7 20, 8 8, 16 4 Z" fill="#f7c4d6" stroke="#d48ea9" stroke-width="2" stroke-linejoin="round"/><path d="M16 6 C 22 10, 23 19, 16 26 Z" fill="#efb1c7"/><path d="M14 10 C 12 14, 12 18, 13.5 22" stroke="#fff0f5" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  butterfly: P32(`<g stroke="#4f7c9c" stroke-width="1.6" stroke-linejoin="round"><path d="M15 15 C 8 4, 2 6, 4 13 C 5 17, 10 17, 15 16 Z" fill="#9fd3f0"/><path d="M17 15 C 24 4, 30 6, 28 13 C 27 17, 22 17, 17 16 Z" fill="#9fd3f0"/>` +
    `<path d="M15 17 C 9 18, 6 24, 10 26 C 13 27, 15 22, 15 18 Z" fill="#f7c1d5"/><path d="M17 17 C 23 18, 26 24, 22 26 C 19 27, 17 22, 17 18 Z" fill="#f7c1d5"/></g>` +
    `<circle cx="8" cy="11" r="1.8" fill="#fff"/><circle cx="24" cy="11" r="1.8" fill="#fff"/><rect x="15" y="10" width="2.4" height="14" rx="1.2" fill="#3e5a70"/><path d="M15.5 10 Q13 6 11 5 M16.8 10 Q19 6 21 5" stroke="#3e5a70" stroke-width="1.2" fill="none" stroke-linecap="round"/>`),
  puff: P32(`<g fill="#d9dfee"><circle cx="11" cy="19" r="7"/><circle cx="21" cy="19" r="7"/><circle cx="16" cy="15" r="8"/></g><g fill="#ffffff"><circle cx="11" cy="17" r="6.5"/><circle cx="21" cy="17" r="6.5"/><circle cx="16" cy="13" r="7.5"/></g><circle cx="13" cy="11" r="2" fill="#ffffff"/>`),
  // autumn leaf: three-lobed, orange with a darker vein
  leafbit: P32(`<g transform="rotate(-20 16 16)"><path d="M16 3 C 19 7, 20 8, 24 7 C 23 11, 24 13, 28 15 C 24 17, 22 18, 22 22 C 19 21, 17 22, 16 27 C 15 22, 13 21, 10 22 C 10 18, 8 17, 4 15 C 8 13, 9 11, 8 7 C 12 8, 13 7, 16 3 Z" fill="#df935a" stroke="#a2603c" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="M16 6 C 18 9, 20 9, 23 9 C 22 12, 23 14, 26 15 C 23 17, 21 18, 21 21 C 19 20, 17 21, 16 25 Z" fill="#cf7f4c"/><path d="M16 9 V30 M16 17 L10 12 M16 17 L22 12" stroke="#a2603c" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>`),
  glow: svg(32, 32, `<defs><radialGradient id="gl"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".3" stop-color="#ffffff" stop-opacity=".7"/><stop offset=".65" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#gl)"/>`)
};

// ---------- write ----------
const ZONES = ['spring', 'summer', 'autumn', 'winter'];
for (const z of ZONES) {
  write(`levels/${z}/sky.svg`, sky(z, SKY[z]));
  write(`levels/${z}/far.svg`, FAR[z]());
  write(`levels/${z}/near.svg`, NEAR[z]());
  write(`levels/${z}/ground.svg`, GROUND[z]());
}
write('levels/palette.json', JSON.stringify(PALETTE, null, 2) + '\n');
for (const [n, s] of Object.entries(particles)) write(`particles/${n}.svg`, s);
// remove the old island art this game no longer uses
for (const old of ['levels/cove', 'levels/jungle', 'levels/lagoon', 'levels/lantern', 'levels/sea.svg', 'particles/bubble.svg']) {
  const p = path.join(OUT, old);
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
console.log('environment art written to ' + OUT);
