#!/usr/bin/env node
// Wisp's Rooftop Bounce — environment art generator (100 % original SVG, written from code).
// Writes into game/assets/default/ (DESIGN.md section 4, "Environment"):
//   levels/<z>/sky.svg  (960x540, cover-fit)
//   levels/<z>/far.svg  (960x300, horizontally tileable, transparent above)
//   levels/<z>/near.svg (960x200, tileable, world y = 0 at art y = 150)
//   levels/palette.json
//   bricks/<z>.svg, <z>_tough.svg, <z>_crack.svg, gem.svg, magnet.svg (140x50)
//   particles/twinkle, mist, shooting, firefly, petal, ember (32x32), glow (64x64), chip_<z> (24x24)
// Zones: cloud (Cloud Deck), spires (Skyscraper Spires), gardens (Rooftop Gardens), lanes (Lantern Lane).
// Usage: node tools/art-environment/gen.js [assetsDir]
// Style: calm cosy city at night. Flat base + one shadow + one highlight, outlines = darker shade of the fill.
// The play area (y 1..8 u = screen y 36..456 at 60 px/u) stays dark and low-contrast: Wisp and the pearl are white.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const ZONES = ['cloud', 'spires', 'gardens', 'lanes'];
const W = 960;

// ---------- helpers ----------
function RNG(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: arr => arr[Math.floor(next() * arr.length)], chance: p => next() < p };
}
const f = n => (Math.round(n * 10) / 10).toString();
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
const NIGHT = '#141634';
const dark = (c, t) => mix(c, NIGHT, t);         // darker shade (toward deep night indigo, never pure black)
const light = (c, t) => mix(c, '#ffffff', t);
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rr = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra}/>`;
const line = (x1, y1, x2, y2, col, sw, extra = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${f(sw)}"${extra}/>`;
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); written.push(rel); };
const written = [];
const blur = (id, sd) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.min(4, sd)}"/></filter>`;
// periodic curve over 0..960: base + sum of sines with integer periods -> edges match in value and slope
const wave = (base, terms) => x => base + terms.reduce((s, [a, k, ph]) => s + a * Math.sin(2 * Math.PI * k * x / W + ph), 0);
// filled area under a periodic curve; drawn a step past both edges so nothing is cut at the tile edge
function curvePath(fn, bottom, step = 8) {
  let d = `M${-step} ${f(bottom)} L${-step} ${f(fn(-step))}`;
  for (let x = 0; x <= W + step; x += step) d += ` L${x} ${f(fn(x))}`;
  return d + ` L${W + step} ${f(bottom)} Z`;
}
function topLine(fn, col, sw = 3, step = 8, extra = '') {
  let d = `M${-step} ${f(fn(-step))}`; for (let x = 0; x <= W + step; x += step) d += ` L${x} ${f(fn(x))}`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`;
}
// draw something at x and, if it crosses an edge, again at x ± 960 so the tile wraps exactly
function wrapDraw(x, halfW, draw) {
  let s = draw(x);
  if (x - halfW < 0) s += draw(x + W);
  if (x + halfW > W) s += draw(x - W);
  return s;
}
function star4(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 8; i++) { const a = (-90 + i * 45) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + q * Math.cos(a)) + ' ' + f(cy + q * Math.sin(a)); }
  return d + 'Z';
}
function star5(cx, cy, R, r, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + q * Math.cos(a)) + ' ' + f(cy + q * Math.sin(a)); }
  return d + 'Z';
}
function starfield(r, n, y0, y1, col, maxOp = 0.75) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r.range(6, 954), y = r.range(y0, y1), big = r.chance(0.12);
    const op = f(r.range(0.25, maxOp));
    s += big ? `<path d="${star4(x, y, 4.5, 1.2)}" fill="${col}" opacity="${op}"/>` : circle(x, y, r.range(0.7, 1.6), col, ` opacity="${op}"`);
  }
  return s;
}
// a row of puffy cloud bumps: union of circles + base rect, outline = circles drawn bigger behind
function puffRow(bumps, bottom, base, shade, lit, outline, sw = 3) {
  let o = '', b = '', h = '';
  for (const p of bumps) {
    o += wrapDraw(p.x, p.r + sw, x => circle(x, p.y, p.r + sw, outline));
    b += wrapDraw(p.x, p.r, x => circle(x, p.y, p.r, shade));
    h += wrapDraw(p.x, p.r, x => circle(x - p.r * 0.1, p.y - p.r * 0.14, p.r * 0.84, lit));
  }
  const top = Math.min(...bumps.map(p => p.y));
  const baseTop = Math.max(...bumps.map(p => p.y)) - 2;
  void top; void base;
  return o + rect(-20, baseTop, W + 40, bottom - baseTop, outline) + b + rect(-20, baseTop + sw, W + 40, bottom - baseTop - sw, shade) + h;
}
function bumpsAlong(r, x0, x1, yFn, rMin, rMax, gap = 0.9) {
  const out = []; let x = x0;
  while (x < x1) { const rad = r.range(rMin, rMax); out.push({ x, y: yFn(x) + rad * 0.35, r: rad }); x += rad * gap * 2 * r.range(0.55, 0.8); }
  return out;
}

// ---------- palette ----------
// skyTop/skyBottom: fallback gradient; ink: HUD text; bar: HUD pill; glow: accent; ground: fill under the near layer.
const PAL = {
  cloud:   { skyTop: '#141841', skyMid: '#262a68', skyBottom: '#43448e', ink: '#232659', bar: '#e9ebff', glow: '#a9b8ff', ground: '#4d4f98' },
  spires:  { skyTop: '#08122f', skyMid: '#132a5c', skyBottom: '#23457f', ink: '#14244d', bar: '#e4eeff', glow: '#ff6b6b', ground: '#1a2a55' },
  gardens: { skyTop: '#161440', skyMid: '#2f2868', skyBottom: '#8c5476', ink: '#2a1f4f', bar: '#f1eaff', glow: '#ffc27a', ground: '#2c2550' },
  lanes:   { skyTop: '#1e1440', skyMid: '#47285f', skyBottom: '#9a4f63', ink: '#3a1d43', bar: '#fff0e6', glow: '#ff9f5a', ground: '#3b2840' },
};

// ================= SKIES (960x540) =================
function skyGrad(p, stops) {
  return `<linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}
function skyCloud() {
  const p = PAL.cloud, r = RNG(101);
  let defs = skyGrad(p, [[0, p.skyTop], [0.55, p.skyMid], [1, p.skyBottom]]) +
    `<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f3dfa6" stop-opacity=".34"/><stop offset=".45" stop-color="#c9b8e8" stop-opacity=".12"/><stop offset="1" stop-color="#c9b8e8" stop-opacity="0"/></radialGradient>
<radialGradient id="moon" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#ecd99f"/><stop offset="1" stop-color="#cfb377"/></radialGradient>` + blur('b3', 3);
  let body = rect(0, 0, 960, 540, 'url(#sg)');
  body += starfield(r, 110, 8, 330, '#dfe3ff', 0.7);
  // big friendly moon, upper right (behind the brick band, warm gold not white, sleepy smile)
  const mx = 770, my = 150, mr = 82;
  body += circle(mx, my, 230, 'url(#halo)');
  body += circle(mx, my, mr + 3, '#a98f5c') + circle(mx, my, mr, 'url(#moon)');
  body += circle(mx + 14, my + 12, mr * 0.86, '#c4a86c', ' opacity=".35"');           // one-step shade (lower right)
  body += circle(mx - 26, my - 32, 13, '#c8ad73', ' opacity=".6"') + circle(mx + 38, my - 18, 8, '#c8ad73', ' opacity=".55"') + circle(mx + 30, my + 44, 10, '#c8ad73', ' opacity=".5"');
  body += `<path d="M${mx - 34} ${my + 2} q11 -11 22 0" fill="none" stroke="#7d6440" stroke-width="4" stroke-linecap="round"/>`;
  body += `<path d="M${mx + 12} ${my + 2} q11 -11 22 0" fill="none" stroke="#7d6440" stroke-width="4" stroke-linecap="round"/>`;
  body += `<path d="M${mx - 12} ${my + 20} q12 10 24 0" fill="none" stroke="#7d6440" stroke-width="4" stroke-linecap="round"/>`;
  body += ell(mx - 40, my + 18, 10, 6, '#e59a8e', ' opacity=".55"') + ell(mx + 40, my + 18, 10, 6, '#e59a8e', ' opacity=".55"');
  body += ell(mx - 30, my - 46, 18, 9, '#f6e8bf', ' opacity=".55" transform="rotate(-25 ' + (mx - 30) + ' ' + (my - 46) + ')"');
  // faint drifting wisps across the sky (low alpha, blurred)
  for (const [x, y, w, o] of [[180, 120, 140, .10], [420, 230, 180, .08], [90, 300, 160, .09], [620, 330, 200, .08]])
    body += ell(x, y, w, 12, '#b8b9ef', ` opacity="${o}" filter="url(#b3)"`);
  // sea of clouds far below (mostly hidden by the far layer, peeks out between banks)
  const sea1 = wave(395, [[10, 3, 0.4], [6, 7, 1.2]]), sea2 = wave(430, [[8, 4, 2.1], [5, 9, 0.3]]);
  body += `<path d="${curvePath(sea1, 540)}" fill="#3d3f86"/>` + `<path d="${curvePath(sea2, 540)}" fill="#46489a"/>`;
  body += topLine(sea1, '#5b5db0', 2, 8, ' opacity=".6"');
  return svg(960, 540, body, defs);
}
function skySpires() {
  const p = PAL.spires, r = RNG(202);
  let defs = skyGrad(p, [[0, p.skyTop], [0.6, p.skyMid], [1, p.skyBottom]]) +
    `<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9d7a0" stop-opacity=".22"/><stop offset="1" stop-color="#e9d7a0" stop-opacity="0"/></radialGradient>`;
  let body = rect(0, 0, 960, 540, 'url(#sg)');
  body += starfield(r, 140, 6, 360, '#e3ecff', 0.8);
  // crescent moon (upper left)
  const mx = 150, my = 92;
  body += circle(mx, my, 110, 'url(#halo)');
  body += `<mask id="cm"><rect width="960" height="540" fill="#fff"/>${circle(mx + 17, my - 10, 34, '#000')}</mask>`;
  body += `<g mask="url(#cm)">${circle(mx, my, 40, '#a68f5c')}${circle(mx, my, 37, '#e6d295')}${circle(mx - 8, my + 8, 30, '#d4bd7d', ' opacity=".6"')}</g>`;
  body += circle(mx - 24, my + 4, 2.6, '#7b6440') + `<path d="M${mx - 26} ${my + 16} q6 5 12 0" fill="none" stroke="#7b6440" stroke-width="2.4" stroke-linecap="round"/>`;
  // far skyscraper silhouettes (very low contrast, a few dim windows)
  let x = -10;
  while (x < 970) {
    const w = r.range(34, 80), top = r.range(300, 400);
    body += rect(x, top, w, 540 - top, '#1a3266');
    if (r.chance(0.5)) body += rect(x + w / 2 - 1, top - r.range(16, 40), 2, 40, '#1a3266');
    for (let wy = top + 10; wy < 520; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 10) if (r.chance(0.09)) body += rect(wx, wy, 4, 5, '#c8a85e', ' opacity=".35"');
    x += w + r.range(-6, 10);
  }
  return svg(960, 540, body, defs);
}
function skyGardens() {
  const p = PAL.gardens, r = RNG(303);
  let defs = skyGrad(p, [[0, p.skyTop], [0.42, p.skyMid], [0.68, '#6a4278'], [1, p.skyBottom]]) +
    `<radialGradient id="hz" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#e8956a" stop-opacity=".7"/><stop offset=".45" stop-color="#c0707a" stop-opacity=".35"/><stop offset="1" stop-color="#e79a6e" stop-opacity="0"/></radialGradient>
<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f1cf9a" stop-opacity=".25"/><stop offset="1" stop-color="#f1cf9a" stop-opacity="0"/></radialGradient>`;
  let body = rect(0, 0, 960, 540, 'url(#sg)') + `<rect x="-200" y="170" width="1360" height="370" fill="url(#hz)"/>`;
  body += starfield(r, 80, 6, 260, '#efe6ff', 0.65);
  // a soft round moon low-ish on the left, peach-gold
  body += circle(170, 190, 120, 'url(#halo)') + circle(170, 190, 33, '#b98a5e') + circle(170, 190, 30, '#e8c58e') + circle(176, 196, 24, '#d9ae78', ' opacity=".5"');
  // distant rooftops + trees in haze
  const hill = wave(420, [[12, 2, 0.5], [7, 5, 2.3], [4, 11, 1.1]]);
  body += `<path d="${curvePath(hill, 540)}" fill="#5b3d70" opacity=".85"/>`;
  let x = 0;
  while (x < 960) { const w = r.range(40, 90), h = r.range(20, 60); body += rect(x, 410 - h, w, h + 130, '#53386b', ' opacity=".9"'); if (r.chance(.4)) body += circle(x + w / 2, 410 - h - 8, r.range(10, 18), '#4f3a68'); x += w + r.range(4, 30); }
  return svg(960, 540, body, defs);
}
function skyLanes() {
  const p = PAL.lanes, r = RNG(404);
  let defs = skyGrad(p, [[0, p.skyTop], [0.5, p.skyMid], [0.82, '#7a3d63'], [1, p.skyBottom]]) +
    `<radialGradient id="cg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffa76a" stop-opacity=".35"/><stop offset="1" stop-color="#ffa76a" stop-opacity="0"/></radialGradient>`;
  let body = rect(0, 0, 960, 540, 'url(#sg)');
  body += starfield(r, 55, 6, 220, '#ffe9f0', 0.55);
  for (const [x, y, rx] of [[160, 470, 260], [520, 490, 320], [860, 470, 240]]) body += ell(x, y, rx, 150, 'url(#cg)');
  // slender evening moon (small, warm)
  body += `<mask id="cm"><rect width="960" height="540" fill="#fff"/>${circle(812, 82, 22, '#000')}</mask><g mask="url(#cm)">${circle(800, 90, 24, '#e9b98a')}</g>`;
  // distant pagoda-ish roofs in haze
  let x = -20;
  while (x < 980) {
    const w = r.range(50, 110), top = r.range(370, 420);
    body += rect(x, top, w, 540 - top, '#5e3260', ' opacity=".9"');
    body += `<path d="M${f(x - 8)} ${f(top)} L${f(x + w / 2)} ${f(top - r.range(14, 26))} L${f(x + w + 8)} ${f(top)} Z" fill="#5e3260" opacity=".9"/>`;
    x += w + r.range(0, 18);
  }
  return svg(960, 540, body, defs);
}

// ================= FAR (960x300, tileable) =================
function farCloud() {
  const r = RNG(111);
  let body = '';
  // back bank
  const y1 = wave(170, [[14, 2, 0.3], [9, 5, 1.7]]);
  body += puffRow(bumpsAlong(r, 0, W, y1, 26, 44), 300, '#3b3d88', '#373a82', '#40438f', '#2c2e6e', 3);
  // a few far tower tips poking out of the cloud sea (very dark, tiny red light)
  for (const x of [140, 455, 700]) body += rect(x - 7, 120, 14, 70, '#2a2c64') + rect(x - 1, 92, 2, 30, '#2a2c64') + circle(x, 92, 3, '#ff6b6b', ' opacity=".8"');
  // front bank
  const y2 = wave(225, [[12, 3, 2.2], [7, 7, 0.4]]);
  body += puffRow(bumpsAlong(r, 0, W, y2, 30, 52), 300, '#46489a', '#43459a', '#4f52a6', '#33357a', 3);
  return svg(960, 300, body);
}
function windowsGrid(r, x, y, w, h, litP, lit, dim, ww = 7, wh = 9, gx = 13, gy = 16) {
  let s = '';
  for (let wy = y; wy + wh <= y + h; wy += gy) for (let wx = x; wx + ww <= x + w; wx += gx) s += rect(wx, wy, ww, wh, r.chance(litP) ? lit : dim, ' rx="1.5"');
  return s;
}
function farSpires() {
  const r = RNG(222);
  let defs = blur('gl', 3);
  let body = '';
  // towers placed edge to edge around the loop; each drawn with wrap
  const towers = []; let x = 10;
  while (x < W - 30) { const w = r.range(70, 130); towers.push({ x: x + w / 2, w, top: r.range(70, 170), crown: r.int(0, 3), shade: r.range(0, 1) }); x += w + r.range(8, 26); }
  for (const t of towers) {
    body += wrapDraw(t.x, t.w / 2 + 12, cx => {
      const r2 = RNG(Math.round(t.top * 7 + t.w));
      const x0 = cx - t.w / 2, base = mix('#1a2d5e', '#21386e', t.shade), out = dark(base, 0.35);
      let s = '';
      // crown shapes
      if (t.crown === 0) s += `<path d="M${f(x0 + 8)} ${f(t.top)} L${f(cx)} ${f(t.top - 26)} L${f(x0 + t.w - 8)} ${f(t.top)} Z" fill="${base}" stroke="${out}" stroke-width="3" stroke-linejoin="round"/>`;
      if (t.crown === 1) s += rr(x0 + t.w * 0.2, t.top - 22, t.w * 0.6, 26, 3, base, ` stroke="${out}" stroke-width="3"`) + rr(x0 + t.w * 0.35, t.top - 38, t.w * 0.3, 20, 3, base, ` stroke="${out}" stroke-width="3"`);
      if (t.crown === 2) s += `<path d="M${f(x0 + 6)} ${f(t.top)} A${f(t.w / 2 - 6)} ${f(t.w / 2 - 6)} 0 0 1 ${f(x0 + t.w - 6)} ${f(t.top)} Z" fill="${base}" stroke="${out}" stroke-width="3"/>`;
      const antTop = t.top - (t.crown === 1 ? 38 : t.crown === 0 ? 26 : t.w / 2 - 6) - r2.range(24, 50);
      s += line(cx, antTop, cx, t.top - 4, out, 3) + line(cx, antTop, cx, t.top - 4, base, 1.5);
      s += circle(cx, antTop, 7, '#ff5f5f', ' opacity=".45" filter="url(#gl)"') + circle(cx, antTop, 3.2, '#ff7a72');
      s += rect(x0, t.top, t.w, 300 - t.top + 4, base, ` stroke="${out}" stroke-width="3"`);
      s += rect(x0 + t.w * 0.68, t.top + 2, t.w * 0.32 - 2, 300 - t.top, dark(base, 0.15));       // one-step side shade
      s += windowsGrid(r2, x0 + 9, t.top + 12, t.w - 16, 300 - t.top - 12, 0.13, '#d9a85a', dark(base, 0.18));
      // a couple of red dots on roof corners too
      s += circle(x0 + 5, t.top - 2, 2.4, '#ff7a72', ' opacity=".85"') + circle(x0 + t.w - 5, t.top - 2, 2.4, '#ff7a72', ' opacity=".85"');
      return s;
    });
  }
  return svg(960, 300, body, defs);
}
function waterTower(cx, baseY, s, col, out) {
  const w = 44 * s, h = 46 * s, leg = 30 * s, top = baseY - leg - h;
  let g = '';
  g += line(cx - w * 0.38, baseY, cx - w * 0.3, top + h, out, 3) + line(cx + w * 0.38, baseY, cx + w * 0.3, top + h, out, 3) + line(cx - w * 0.34, baseY - leg * 0.5, cx + w * 0.34, baseY - leg * 0.5, out, 2) + line(cx - w * 0.36, baseY - 2, cx + w * 0.3, top + h, out, 1.6) + line(cx + w * 0.36, baseY - 2, cx - w * 0.3, top + h, out, 1.6);
  g += rr(cx - w / 2, top, w, h, 6 * s, col, ` stroke="${out}" stroke-width="3"`);
  g += rect(cx + w * 0.15, top + 2, w * 0.33, h - 4, dark(col, 0.15));
  g += line(cx - w / 2, top + h * 0.33, cx + w / 2, top + h * 0.33, out, 2) + line(cx - w / 2, top + h * 0.66, cx + w / 2, top + h * 0.66, out, 2);
  g += `<path d="M${f(cx - w / 2 - 4)} ${f(top + 2)} L${f(cx)} ${f(top - 22 * s)} L${f(cx + w / 2 + 4)} ${f(top + 2)} Z" fill="${dark(col, 0.1)}" stroke="${out}" stroke-width="3" stroke-linejoin="round"/>`;
  return g;
}
function farGardens() {
  const r = RNG(333);
  let body = '';
  const roofs = []; let x = 0;
  while (x < W - 20) { const w = r.range(90, 160); roofs.push({ x: x + w / 2, w, top: r.range(150, 205), tower: r.chance(0.5), tree: r.chance(0.55), sh: r.next() }); x += w + r.range(-4, 6); }
  for (const t of roofs) body += wrapDraw(t.x, t.w / 2 + 40, cx => {
    const r2 = RNG(Math.round(t.top * 13 + t.w));
    const x0 = cx - t.w / 2, base = mix('#2b2560', '#342b6a', t.sh), out = dark(base, 0.35);
    let s = '';
    if (t.tree) for (let i = 0; i < 3; i++) { const tx = x0 + r2.range(20, t.w - 20), rad = r2.range(12, 20); s += circle(tx, t.top - rad * 0.6, rad + 3, '#1f2d4a') + circle(tx, t.top - rad * 0.6, rad, '#2c4a5a') + circle(tx - rad * 0.25, t.top - rad * 0.85, rad * 0.55, '#36596a'); }
    if (t.tower) s += waterTower(x0 + r2.range(30, t.w - 30), t.top, r2.range(0.8, 1.05), '#5a4366', '#2e2244');
    s += rect(x0, t.top, t.w, 300 - t.top + 4, base, ` stroke="${out}" stroke-width="3"`) + rect(x0 - 3, t.top - 6, t.w + 6, 8, dark(base, 0.1), ` stroke="${out}" stroke-width="2"`);
    s += windowsGrid(r2, x0 + 10, t.top + 16, t.w - 18, 300 - t.top - 16, 0.2, '#d9a066', dark(base, 0.15), 10, 12, 20, 22);
    return s;
  });
  // a sagging string of warm lights along the roofline (periodic)
  const sl = wave(140, [[10, 6, 0.2]]);
  body += topLine(sl, '#2a2240', 1.5, 8, ' opacity=".9"');
  for (let x2 = 0; x2 < W; x2 += 24) body += circle(x2 + 12, sl(x2 + 12) + 4, 2.6, x2 % 48 ? '#ffd27a' : '#ff9fb0', ' opacity=".85"');
  return svg(960, 300, body);
}
function farLanes() {
  const r = RNG(444);
  let defs = blur('gl', 4);
  let body = '';
  const shops = []; let x = 0;
  while (x < W - 20) { const w = r.range(96, 140); shops.push({ x: x + w / 2, w, top: r.range(110, 170), roof: r.int(0, 2), sh: r.next(), aw: r.int(0, 3) }); x += w + r.range(-2, 4); }
  const AW = [['#9a4352', '#a88a86'], ['#3f6c74', '#a88a86'], ['#9a6a3a', '#ad9282'], ['#60478a', '#a88a86']];
  for (const t of shops) body += wrapDraw(t.x, t.w / 2 + 12, cx => {
    const r2 = RNG(Math.round(t.top * 17 + t.w));
    const x0 = cx - t.w / 2, base = mix('#45284f', '#53305a', t.sh), out = dark(base, 0.4);
    let s = '';
    if (t.roof === 0) s += `<path d="M${f(x0 - 8)} ${f(t.top + 2)} L${f(cx)} ${f(t.top - 34)} L${f(x0 + t.w + 8)} ${f(t.top + 2)} Z" fill="${dark(base, 0.2)}" stroke="${out}" stroke-width="3" stroke-linejoin="round"/>`;
    if (t.roof === 1) s += `<path d="M${f(x0 - 10)} ${f(t.top + 4)} Q${f(cx)} ${f(t.top - 10)} ${f(x0 + t.w + 10)} ${f(t.top + 4)} L${f(x0 + t.w - 6)} ${f(t.top - 12)} L${f(x0 + 6)} ${f(t.top - 12)} Z" fill="${dark(base, 0.2)}" stroke="${out}" stroke-width="3" stroke-linejoin="round"/>`;
    if (t.roof === 2) s += rect(x0 - 4, t.top - 8, t.w + 8, 10, dark(base, 0.2), ` stroke="${out}" stroke-width="3"`);
    s += rect(x0, t.top, t.w, 300 - t.top + 4, base, ` stroke="${out}" stroke-width="3"`);
    // upper windows: arched, warm, with a soft glow
    const n = t.w > 118 ? 3 : 2, ww = 18, gap = (t.w - n * ww) / (n + 1);
    for (let i = 0; i < n; i++) {
      const wx = x0 + gap + i * (ww + gap), wy = t.top + 22, lit = r2.chance(0.7);
      if (lit) s += rect(wx - 6, wy - 6, ww + 12, 36, '#ffb35c', ' opacity=".3" filter="url(#gl)"');
      s += `<path d="M${f(wx)} ${f(wy + 24)} V${f(wy + 8)} A9 9 0 0 1 ${f(wx + ww)} ${f(wy + 8)} V${f(wy + 24)} Z" fill="${lit ? '#f2b764' : dark(base, 0.25)}" stroke="${out}" stroke-width="2"/>`;
      s += line(wx + ww / 2, wy + 2, wx + ww / 2, wy + 24, out, 1.5);
    }
    // shop front: awning + lit window band
    const ay = 228, [c1, c2] = AW[t.aw];
    s += rect(x0 + 8, ay + 10, t.w - 16, 300 - ay, '#f0a65a', ' opacity=".18" filter="url(#gl)"');
    s += rect(x0 + 10, ay + 14, t.w - 20, 60, '#8e5446') + rect(x0 + 10, ay + 14, t.w - 20, 60, 'none', ` stroke="${out}" stroke-width="2"`);
    for (let k = 0; k < 4; k++) s += line(x0 + 10 + (t.w - 20) * (k + 1) / 5, ay + 14, x0 + 10 + (t.w - 20) * (k + 1) / 5, 300, out, 1.5, ' opacity=".6"');
    const stripes = 6, sw = (t.w + 4) / stripes;
    for (let k = 0; k < stripes; k++) s += `<path d="M${f(x0 - 2 + k * sw)} ${f(ay - 6)} h${f(sw)} v16 q${f(-sw / 2)} 8 ${f(-sw)} 0 Z" fill="${k % 2 ? c2 : c1}" opacity=".9"/>`;
    s += line(x0 - 2, ay - 6, x0 + t.w + 2, ay - 6, out, 2.5);
    return s;
  });
  // lantern string across the whole tile (periodic sag)
  const sl = wave(126, [[12, 5, 1.0]]);
  body += topLine(sl, '#2c1a33', 1.5);
  for (let x2 = 16; x2 < W; x2 += 48) { const y = sl(x2) + 3; body += circle(x2, y + 5, 9, '#ff8a4a', ' opacity=".35" filter="url(#gl)"') + ell(x2, y + 6, 6, 7, x2 % 96 < 48 ? '#c9504a' : '#d08a40', ' stroke="#6a2a2e" stroke-width="1.5" opacity=".85"'); }
  return svg(960, 300, body, defs);
}

// ================= NEAR (960x200, tileable, ground at y = 150) =================
function nearCloud() {
  const r = RNG(121);
  let defs = '';
  let body = '';
  // fluffy cloud floor: low bumps in the middle, taller puffs at the outer 120 px
  const yFn = x => { const e = Math.min(x, W - x); return 132 - (e < 120 ? (120 - e) * 0.42 : 0) + 4 * Math.sin(2 * Math.PI * 5 * x / W); };
  const bumps = bumpsAlong(r, 0, W, yFn, 20, 30, 0.85);
  body += puffRow(bumps, 200, '#5e61ad', '#5659a3', '#686bb8', '#3a3c82', 3);
  // a few tiny stars resting in the cloud floor
  for (let i = 0; i < 9; i++) { const x = 40 + i * 107 + r.range(-10, 10), y = r.range(160, 188); body += `<path d="${star4(x, y, 5, 1.4)}" fill="#c9cdf5" opacity=".55"/>`; }
  body += rect(-10, 150, W + 20, 2, '#7477c4', ' opacity=".25"');
  return svg(960, 200, body, defs);
}
function antenna(cx, out, col) {
  let s = '';
  s += line(cx, 150, cx, 22, out, 6) + line(cx, 150, cx, 22, col, 3);
  for (const y of [60, 95, 125]) s += line(cx - 14, y, cx + 14, y, out, 3);
  s += line(cx - 14, 150, cx, 60, out, 2) + line(cx + 14, 150, cx, 60, out, 2);
  s += circle(cx, 20, 12, '#ff5f5f', ' opacity=".4" filter="url(#gl)"') + circle(cx, 20, 5, '#ff7a72', ' stroke="#b83b40" stroke-width="2"');
  // a small dish
  s += `<path d="M${cx + 8} 86 a18 18 0 0 0 22 -22 Z" fill="${col}" stroke="${out}" stroke-width="3" stroke-linejoin="round"/>` + line(cx + 2, 92, cx + 14, 80, out, 3);
  return s;
}
function nearSpires() {
  let defs = blur('gl', 4);
  const col = '#2e4a86', out = '#172a55', roof = '#233a6e';
  let body = '';
  // antennas at both sides (outer 120 px) — drawn first, behind the railing
  body += antenna(60, out, col) + antenna(900, out, col);
  // a rooftop AC unit and a vent in the middle, kept low (top >= 112)
  body += rr(330, 118, 70, 34, 4, '#2a4479', ` stroke="${out}" stroke-width="3"`) + circle(365, 135, 11, '#22396a', ` stroke="${out}" stroke-width="2"`) + line(354, 135, 376, 135, out, 2) + line(365, 124, 365, 146, out, 2);
  body += rr(600, 126, 22, 26, 3, '#2a4479', ` stroke="${out}" stroke-width="3"`) + rr(594, 120, 34, 8, 3, '#2a4479', ` stroke="${out}" stroke-width="2.5"`);
  // railing: posts every 40 px (960/40 = 24, tiles exactly), rails at y 116 and 133
  for (let x = 20; x < W; x += 40) body += line(x, 114, x, 150, out, 4) + line(x, 114, x, 150, '#36548f', 2);
  for (const y of [116, 133]) body += line(-10, y, W + 10, y, out, 4) + line(-10, y, W + 10, y, '#3b5a98', 2);
  // roof slab: ledge with a lighter top edge, then the roof below
  body += rect(-10, 146, W + 20, 10, '#3a5a98') + rect(-10, 146, W + 20, 3, '#4d6eac') + rect(-10, 156, W + 20, 44, roof) + rect(-10, 155, W + 20, 2, out);
  for (let x = 0; x < W; x += 80) body += rect(x, 158, 2, 42, out, ' opacity=".5"');
  // warm window strip of the building below (glimpse)
  for (let x = 20; x < W; x += 60) body += rect(x, 176, 26, 14, '#d9a65a', ' rx="2" opacity=".55"');
  return svg(960, 200, body, defs);
}
function planter(x, w, h, r) {
  const box = '#8a5a46', out = '#4a2e2a';
  let s = '';
  // plants
  const n = Math.max(2, Math.round(w / 22));
  for (let i = 0; i < n; i++) {
    const px = x + (i + 0.5) * w / n, ph = r.range(14, 26);
    s += ell(px - 5, 150 - h - ph * 0.45, 5, ph * 0.5, '#3f7a5e', ` transform="rotate(-20 ${f(px - 5)} ${f(150 - h - ph * 0.45)})"`) + ell(px + 5, 150 - h - ph * 0.5, 5, ph * 0.55, '#4b8c68', ` transform="rotate(18 ${f(px + 5)} ${f(150 - h - ph * 0.5)})"`);
    if (r.chance(0.6)) { const fc = r.pick(['#e88aa8', '#e8c060', '#a99ae8']), fy = 150 - h - ph - 2; for (let k = 0; k < 5; k++) { const a = k * 1.2566; s += circle(px + 4 * Math.cos(a), fy + 4 * Math.sin(a), 3.2, fc); } s += circle(px, fy, 2.4, '#fff0b0'); }
  }
  s += rr(x, 150 - h, w, h + 2, 3, box, ` stroke="${out}" stroke-width="3"`) + rect(x + 2, 150 - h + 2, w - 4, 4, '#a06c52') + rect(x + w * 0.7, 150 - h + 6, w * 0.3 - 2, h - 6, '#7a4c3c');
  return s;
}
function lightString(x1, x2, y1, sag, n) {
  let s = `<path d="M${f(x1)} ${f(y1)} Q${f((x1 + x2) / 2)} ${f(y1 + sag * 2)} ${f(x2)} ${f(y1)}" fill="none" stroke="#2a2340" stroke-width="2"/>`;
  for (let i = 1; i < n; i++) { const t = i / n, x = (1 - t) * (1 - t) * x1 + 2 * t * (1 - t) * (x1 + x2) / 2 + t * t * x2, y = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * (y1 + sag * 2) + t * t * y1; s += circle(x, y + 5, 8, '#ffcf7a', ' opacity=".35" filter="url(#gl)"') + ell(x, y + 5, 3.6, 4.6, i % 2 ? '#ffd27a' : '#ffa8b8'); }
  return s;
}
function nearGardens() {
  const r = RNG(323);
  let defs = blur('gl', 3);
  let body = '';
  // string-light poles at x 50 and 910; the string crosses the tile seam (drawn twice)
  for (const px of [50, 910]) body += line(px, 150, px, 36, '#2a2340', 6) + line(px, 150, px, 36, '#5a4a6a', 3) + circle(px, 34, 5, '#5a4a6a', ' stroke="#2a2340" stroke-width="2"');
  body += lightString(910, 1010, 40, 18, 6) + lightString(-50, 50, 40, 18, 6);
  body += lightString(50, 112, 40, 10, 3) + lightString(848, 910, 40, 10, 3);
  // planters along the roof (low: top >= ~108)
  for (const [x, w, h] of [[96, 70, 22], [250, 110, 20], [430, 60, 24], [560, 120, 20], [760, 80, 22]]) body += planter(x, w, h, r);
  // a little watering can
  body += rr(700, 134, 22, 16, 4, '#6f8fb5', ' stroke="#33476a" stroke-width="2.5"') + line(722, 138, 734, 128, '#33476a', 3) + `<path d="M704 134 q7 -10 14 0" fill="none" stroke="#33476a" stroke-width="2.5"/>`;
  // roof: parapet + tar roof with tiles
  body += rect(-10, 148, W + 20, 8, '#4c3f6e') + rect(-10, 148, W + 20, 2, '#61528a') + rect(-10, 156, W + 20, 44, '#2f2750') + rect(-10, 155, W + 20, 2, '#1f1a38');
  for (let x = 0; x < W; x += 48) body += rect(x, 156, 2, 44, '#251f42');
  for (let x = 24; x < W; x += 48) body += rect(x, 176, 2, 24, '#251f42') + rect(x - 24, 176, 48, 2, '#251f42');
  return svg(960, 200, body, defs);
}
function lanternPost(cx) {
  const out = '#2b1a2e', col = '#5a3e4e';
  let s = '';
  s += rect(cx - 9, 140, 18, 10, col, ` stroke="${out}" stroke-width="2.5"`) + line(cx, 140, cx, 28, out, 7) + line(cx, 140, cx, 28, col, 3.5);
  s += `<path d="M${cx} 30 Q${cx + 28} 18 ${cx + 34} 40" fill="none" stroke="${out}" stroke-width="4"/>`;
  s += circle(cx + 34, 62, 26, '#ff9a4a', ' opacity=".45" filter="url(#gl)"');
  s += rr(cx + 26, 40, 16, 5, 2, '#d9a84a', ` stroke="${out}" stroke-width="1.5"`) + ell(cx + 34, 62, 15, 18, '#e8574a', ` stroke="#8a2a30" stroke-width="2.5"`);
  s += ell(cx + 34, 62, 6, 18, 'none', ' stroke="#b8383e" stroke-width="1.5"') + ell(cx + 31, 56, 5, 7, '#ffb07a', ' opacity=".7"');
  s += rr(cx + 26, 79, 16, 5, 2, '#d9a84a', ` stroke="${out}" stroke-width="1.5"`) + line(cx + 34, 84, cx + 34, 94, '#d9a84a', 2);
  return s;
}
function nearLanes() {
  const r = RNG(434);
  let defs = blur('gl', 4);
  let body = '';
  body += lanternPost(46) + lanternPost(880);
  // low market bits in the middle: crates, a pot plant, a tiny cat-shaped doorstop? keep to crates + pots
  for (const [x, w] of [[260, 40], [302, 30], [640, 36]]) body += rr(x, 150 - w * 0.8, w, w * 0.8, 3, '#8a5a3e', ' stroke="#4a2c26" stroke-width="2.5"') + line(x + 3, 150 - w * 0.4, x + w - 3, 150 - w * 0.4, '#4a2c26', 2);
  body += `<path d="M470 150 l4 -22 h24 l4 22 Z" fill="#b8644a" stroke="#5a2e2a" stroke-width="2.5"/>` + ell(486, 120, 16, 10, '#4b8c68') + circle(480, 114, 4, '#ff9fb0') + circle(493, 117, 3.5, '#ffd27a');
  // curb + cobble street
  body += rect(-10, 148, W + 20, 8, '#7a5a6a') + rect(-10, 148, W + 20, 2, '#8e6c7c') + rect(-10, 156, W + 20, 44, '#4a3448') + rect(-10, 155, W + 20, 2, '#2e1f30');
  for (let row = 0; row < 3; row++) {
    const y = 160 + row * 13, off = row % 2 ? 16 : 0;
    for (let x = off - 32; x < W + 32; x += 32) body += rr(x + 2, y, 28, 10, 4, row % 2 ? '#56405a' : '#523c55');
  }
  // warm light pools on the street from the lanterns (and across the seam)
  body += ell(80, 168, 70, 12, '#ff9a4a', ' opacity=".22" filter="url(#gl)"') + ell(914, 168, 70, 12, '#ff9a4a', ' opacity=".22" filter="url(#gl)"');
  void r;
  return svg(960, 200, body, defs);
}

// ================= BRICKS (140x50) =================
const BR = {
  cloud:   { base: '#d6b8f2', shade: '#b896e2', lit: '#efdefc', out: '#6f55a8', tBase: '#9384dc', tShade: '#7666c4', tLit: '#b3a8ee', tOut: '#3c3184', band: '#c7d3f0', bandOut: '#5d6a9a' },
  spires:  { frame: '#4a6cb8', frameOut: '#1f3570', g1: '#ffe39a', g2: '#f3a84c', tFrame: '#5b6f94', tOut: '#24324f', tg1: '#f2c56a', tg2: '#d98838' },
  gardens: { box: '#d98a52', boxShade: '#b36a3c', boxLit: '#f0aa72', out: '#743c22', tBox: '#8f5a3c', tShade: '#74442c', tOut: '#3e2218', metal: '#c3cad8', metalOut: '#5a6274' },
  lanes:   { paper: '#f06352', shade: '#c9433f', lit: '#ffb08a', out: '#7e2230', cap: '#f0c060', capOut: '#8a5a1e', tPaper: '#b8363f', tShade: '#932a35', tOut: '#4e1424' },
};
const crackLines = (col, lit) => {
  const paths = ['M70 6 L64 18 L72 24 L62 36 L68 44', 'M64 18 L50 14 L40 22', 'M72 24 L88 22 L98 30 L110 28', 'M62 36 L48 40'];
  return paths.map(d => `<path d="${d}" fill="none" stroke="${lit}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".5" transform="translate(1 1)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
    `<path d="M112 6 L122 6 L118 13 Z" fill="${col}" opacity=".7"/>`;
};
function cloudShape(fill, stroke, sw) {
  // scalloped top cloud tile, within 3..137 x 3..47
  const cs = [[26, 20, 15], [52, 16, 15], [80, 16, 15], [108, 19, 15]];
  let s = cs.map(([x, y, r]) => circle(x, y, r + sw, stroke)).join('') + rr(5 - sw, 18 - sw, 130 + 2 * sw, 28 + 2 * sw, 13, stroke);
  s += cs.map(([x, y, r]) => circle(x, y, r, fill)).join('') + rr(5, 18, 130, 28, 13, fill);
  return s;
}
function brickCloud(kind) {
  const c = BR.cloud, tough = kind !== 'block';
  const base = tough ? c.tBase : c.base, shade = tough ? c.tShade : c.shade, lit = tough ? c.tLit : c.lit, out = tough ? c.tOut : c.out, sw = tough ? 4 : 3;
  let defs = `<clipPath id="cc">${cloudShape('#000', '#000', 0)}</clipPath>`;
  let s = cloudShape(shade, out, sw);
  s += `<g clip-path="url(#cc)">${rect(0, 0, 140, 50, shade)}${[[24, 16, 15], [50, 12, 15], [78, 12, 15], [106, 15, 15]].map(([x, y, r]) => circle(x, y, r, base)).join('')}${rr(3, 13, 128, 25, 12, base)}`;
  s += ell(30, 13, 9, 4, lit, ' opacity=".9"') + ell(56, 9, 5, 2.5, lit, ' opacity=".8"');
  if (tough) {
    // a silver ribbon band with studs: the tough block's mark
    s += rect(0, 29, 140, 10, c.band) + line(0, 29, 140, 29, c.bandOut, 2) + line(0, 39, 140, 39, c.bandOut, 2);
    for (const x of [18, 46, 94, 122]) s += circle(x, 34, 2.4, c.bandOut);
    s += `</g>`;
    s += `<path d="${star5(70, 25, 11, 4.8)}" fill="#ffd66b" stroke="#a87a2a" stroke-width="2" stroke-linejoin="round"/>`;
  } else {
    s += `</g><path d="${star5(70, 28, 10, 4.4)}" fill="#ffd66b" stroke="#b08a3a" stroke-width="2" stroke-linejoin="round"/>` + circle(67, 27, 1.4, '#7a5a2a') + circle(73, 27, 1.4, '#7a5a2a');
  }
  if (kind === 'crack') s += crackLines(dark(out, 0.2), lit);
  return svg(140, 50, s, defs);
}
function brickSpires(kind) {
  const c = BR.spires, tough = kind !== 'block';
  let defs = `<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tough ? c.tg1 : c.g1}"/><stop offset="1" stop-color="${tough ? c.tg2 : c.g2}"/></linearGradient>`;
  let s = '';
  if (!tough) {
    s += rr(4, 4, 132, 42, 6, c.frame, ` stroke="${c.frameOut}" stroke-width="3"`);
    s += rect(4.5, 38, 131, 7, dark(c.frame, 0.2), ' rx="3"');
    s += rr(11, 9, 118, 30, 3, 'url(#gl)', ` stroke="${c.frameOut}" stroke-width="2"`);
    s += rect(67, 9, 6, 30, c.frame) + rect(11, 22, 118, 5, c.frame);
    // little curtains (cosy) + shine
    s += `<path d="M12 10 h14 q-3 6 -14 11 Z" fill="#e98a7a" opacity=".85"/><path d="M128 10 h-14 q3 6 14 11 Z" fill="#e98a7a" opacity=".85"/>`;
    s += `<path d="M30 11 l8 0 l-10 10 l-8 0 Z" fill="#fff6d8" opacity=".55"/><path d="M84 28 l6 0 l-8 9 l-6 0 Z" fill="#fff6d8" opacity=".45"/>`;
    s += line(6, 7, 134, 7, light(c.frame, 0.3), 1.5, ' opacity=".7"');
  } else {
    // tough: heavy steel frame, double rim, corner bolts, three mullions + a lintel bar
    s += rr(3, 3, 134, 44, 4, c.tFrame, ` stroke="${c.tOut}" stroke-width="4"`);
    s += rr(8, 7, 124, 36, 3, 'none', ` stroke="${light(c.tFrame, 0.25)}" stroke-width="2"`);
    s += rr(16, 12, 108, 24, 2, 'url(#gl)', ` stroke="${c.tOut}" stroke-width="2.5"`);
    for (const x of [43, 70, 97]) s += rect(x - 2.5, 12, 5, 24, c.tFrame);
    s += rect(16, 22, 108, 4, c.tFrame);
    for (const [x, y] of [[9, 8], [131, 8], [9, 42], [131, 42]]) s += circle(x, y, 2.6, light(c.tFrame, 0.35), ` stroke="${c.tOut}" stroke-width="1.5"`);
    s += `<path d="M22 13 l6 0 l-7 8 l-5 0 Z" fill="#fff6d8" opacity=".45"/>`;
  }
  if (kind === 'crack') s += crackLines('#2a2a3e', '#fff4d0');
  return svg(140, 50, s, defs);
}
function flower(x, y, col, r = 4.2) { let s = ''; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566; s += circle(x + r * Math.cos(a), y + r * Math.sin(a), r * 0.78, col, ` stroke="${dark(col, 0.35)}" stroke-width="1"`); } return s + circle(x, y, r * 0.55, '#fff2a8'); }
function brickGardens(kind) {
  const c = BR.gardens, tough = kind !== 'block';
  let s = '';
  if (!tough) {
    // leaves + flowers on top (y 3..24), terracotta box (y 22..46)
    for (const [x, rot] of [[16, -30], [36, 25], [58, -20], [82, 20], [104, -25], [124, 30]]) s += ell(x, 17, 6, 10, '#5fb872', ` stroke="#2f6a42" stroke-width="2" transform="rotate(${rot} ${x} 17)"`);
    s += flower(24, 11, '#ff8fb5') + flower(52, 9, '#ffd25e') + flower(80, 10, '#8fc2ff') + flower(110, 11, '#ff8fb5');
    s += rr(5, 22, 130, 24, 5, c.box, ` stroke="${c.out}" stroke-width="3"`);
    s += rect(6.5, 38, 127, 6.5, c.boxShade, ' rx="3"') + rect(9, 25, 122, 3.5, c.boxLit, ' rx="1.5"');
    s += line(5, 34, 135, 34, c.out, 1.6, ' opacity=".6"');
    for (const x of [48, 92]) s += line(x, 24, x, 34, c.out, 1.6, ' opacity=".5"');
  } else {
    // tough: tall dark-wood crate with steel corner brackets and two iron bands, small bushes on top
    for (const x of [22, 50, 78, 106]) s += circle(x + 6, 14, 10, '#4f9a62', ' stroke="#2a5a3a" stroke-width="2"');
    s += flower(36, 9, '#ff9fbf', 3.6) + flower(92, 9, '#ffd25e', 3.6);
    s += rr(4, 16, 132, 30, 4, c.tBox, ` stroke="${c.tOut}" stroke-width="4"`);
    s += rect(6, 38, 128, 6, c.tShade, ' rx="2"');
    for (const y of [24, 31]) s += line(6, y, 134, y, c.tOut, 1.4, ' opacity=".5"');
    for (const x of [44, 96]) s += rect(x - 4, 16, 8, 30, c.metal, ` stroke="${c.metalOut}" stroke-width="2"`) + circle(x, 22, 1.6, c.metalOut) + circle(x, 40, 1.6, c.metalOut);
    for (const [x, sx] of [[4, 1], [136, -1]]) s += `<path d="M${x} 16 h${12 * sx} v6 h${-6 * sx} v24 h${-6 * sx} Z" fill="${c.metal}" stroke="${c.metalOut}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if (kind === 'crack') s += crackLines('#2a160e', '#f4c9a0');
  return svg(140, 50, s);
}
function brickLanes(kind) {
  const c = BR.lanes, tough = kind !== 'block';
  const paper = tough ? c.tPaper : c.paper, shade = tough ? c.tShade : c.shade, out = tough ? c.tOut : c.out;
  let defs = `<radialGradient id="lg" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${tough ? '#e8735a' : '#ffb27a'}"/><stop offset="1" stop-color="${paper}"/></radialGradient><clipPath id="lc">${rr(6, 9, 128, 32, 16, '#000')}</clipPath>`;
  let s = '';
  // caps (top and bottom)
  s += rr(30, 3, 80, 9, 3, c.cap, ` stroke="${c.capOut}" stroke-width="2"`) + rr(30, 38, 80, 9, 3, c.cap, ` stroke="${c.capOut}" stroke-width="2"`);
  s += rr(6, 9, 128, 32, 16, 'url(#lg)', ` stroke="${out}" stroke-width="${tough ? 4 : 3}"`);
  s += `<g clip-path="url(#lc)">${rect(0, 33, 140, 10, shade)}`;
  // ribs: gentle curves (paper lantern)
  for (const x of [26, 48, 70, 92, 114]) s += `<path d="M${x} 9 q${(x - 70) * 0.12} 16 0 32" fill="none" stroke="${dark(paper, 0.3)}" stroke-width="1.6" opacity=".7"/>`;
  if (tough) for (const x of [44, 96]) s += rect(x - 5, 0, 10, 50, c.cap) + line(x - 5, 0, x - 5, 50, c.capOut, 1.5) + line(x + 5, 0, x + 5, 50, c.capOut, 1.5);
  s += ell(40, 15, 14, 3, '#ffe0c8', ' opacity=".6"') + `</g>`;
  if (tough) {
    // tassels at the ends + a gold knot in the middle: sturdy festival lantern
    s += rr(1, 21, 6, 8, 2, c.cap, ` stroke="${c.capOut}" stroke-width="1.5"`) + rr(133, 21, 6, 8, 2, c.cap, ` stroke="${c.capOut}" stroke-width="1.5"`);
    s += circle(70, 25, 6, c.cap, ` stroke="${c.capOut}" stroke-width="2"`);
  } else {
    // a cute little flame-dot motif
    s += `<path d="M70 17 q6 7 0 14 q-6 -7 0 -14 Z" fill="#ffd56a" stroke="#b5553a" stroke-width="1.5"/>`;
  }
  if (kind === 'crack') s += crackLines('#3a0e18', '#ffd0b0');
  return svg(140, 50, s, defs);
}
function brickGem() {
  let defs = `<linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fe8f0" stop-opacity=".55"/><stop offset="1" stop-color="#3a9ab8" stop-opacity=".45"/></linearGradient>` + blur('gb', 3);
  let s = rr(4, 4, 132, 42, 9, '#1d4c66', ' opacity=".55"');
  s += rr(4, 4, 132, 42, 9, 'url(#gg)', ' stroke="#8ff0f4" stroke-width="3"');
  s += rr(9, 8, 122, 34, 6, 'none', ' stroke="#c8fbff" stroke-width="1.5" opacity=".6"');
  // teal gem with glow
  s += ell(70, 26, 26, 16, '#5ff2d8', ' opacity=".5" filter="url(#gb)"');
  const g = 'M54 19 L62 11 H78 L86 19 L70 41 Z';
  s += `<path d="${g}" fill="#22c8b4" stroke="#0e6f70" stroke-width="2.5" stroke-linejoin="round"/>`;
  s += `<path d="M54 19 H86 L70 41 Z" fill="#17a99c"/><path d="M62 19 L70 41 L78 19 Z" fill="#30dcc4"/><path d="M62 11 L66 19 H54 Z M78 11 L74 19 H86 Z" fill="#6ff0dc"/><path d="M66 19 L70 11 L74 19 Z" fill="#b8fff0"/>`;
  s += `<path d="${g}" fill="none" stroke="#0e6f70" stroke-width="2.5" stroke-linejoin="round"/>`;
  s += `<path d="${star4(92, 13, 6, 1.6)}" fill="#ffffff" opacity=".95"/><path d="${star4(46, 34, 4, 1.2)}" fill="#e8ffff" opacity=".8"/>`;
  s += `<path d="M12 9 h22 l-14 14 h-8 Z" fill="#ffffff" opacity=".28"/>`;
  return svg(140, 50, s, defs);
}
function brickMagnet() {
  let s = rr(4, 4, 132, 42, 9, '#2c3c86', ' stroke="#141e52" stroke-width="3"');
  s += rr(7, 7, 126, 36, 7, 'none', ' stroke="#8fa8ff" stroke-width="2" opacity=".8"');
  // soft pulse rings
  for (const [rx, o] of [[46, .22], [34, .35], [24, .5]]) s += ell(70, 26, rx, rx * 0.5, 'none', ` stroke="#9fd0ff" stroke-width="2" opacity="${o}"`);
  // horseshoe magnet, opening upward: thick red U with silver tips
  const U = 'M58 12 V25 A12 12 0 0 0 82 25 V12';
  s += `<path d="${U}" fill="none" stroke="#6a1420" stroke-width="13" stroke-linecap="butt"/>`;
  s += `<path d="${U}" fill="none" stroke="#ef4b4b" stroke-width="8.5" stroke-linecap="butt"/>`;
  s += `<path d="M60 14 V25 A10 10 0 0 0 66 34" fill="none" stroke="#ff9a8a" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
  for (const x of [58, 82]) s += rect(x - 6.5, 6, 13, 8, '#d6e2f2', ' stroke="#5a6680" stroke-width="2"') + rect(x - 4.5, 7.5, 4, 5, '#ffffff', ' opacity=".7"');
  // tiny spark lines
  for (const [x1, y1, x2, y2] of [[46, 10, 40, 6], [94, 10, 100, 6], [44, 22, 36, 22], [96, 22, 104, 22]]) s += line(x1, y1, x2, y2, '#ffe27a', 2.5, ' stroke-linecap="round"');
  return svg(140, 50, s);
}

// ================= PARTICLES =================
function pTwinkle() { return svg(32, 32, `<defs>${blur('b', 2)}</defs>${circle(16, 16, 7, '#fff2b0', ' opacity=".5" filter="url(#b)"')}<path d="${star4(16, 16, 14, 3)}" fill="#fff4c2"/><path d="${star4(16, 16, 7, 2)}" fill="#ffffff"/>`); }
function pMist() { return svg(32, 32, `<defs>${blur('b', 3)}</defs>${ell(16, 17, 12, 6, '#b9b6ee', ' opacity=".55" filter="url(#b)"')}${ell(12, 15, 6, 4, '#cdcaf6', ' opacity=".5" filter="url(#b)"')}`); }
function pShooting() {
  return svg(32, 32, `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bcd4ff" stop-opacity="0"/><stop offset="1" stop-color="#f4f8ff" stop-opacity=".95"/></linearGradient>${blur('b', 1.5)}</defs>` +
    `<path d="M2 16 L26 13.5 L26 18.5 Z" fill="url(#t)"/>${circle(26, 16, 4.5, '#dfeaff', ' opacity=".6" filter="url(#b)"')}<path d="${star4(26, 16, 5, 1.6)}" fill="#ffffff"/>`);
}
function pFirefly() { return svg(32, 32, `<defs><radialGradient id="r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4ff9a" stop-opacity=".95"/><stop offset=".35" stop-color="#d8f26a" stop-opacity=".5"/><stop offset="1" stop-color="#c8f060" stop-opacity="0"/></radialGradient></defs>${circle(16, 16, 15, 'url(#r)')}${circle(16, 16, 3.2, '#fbffd0')}`); }
function pPetal() { return svg(32, 32, `<path d="M16 4 C25 9 26 21 16 28 C6 21 7 9 16 4 Z" fill="#f7a8c4" stroke="#c46a8e" stroke-width="2"/><path d="M16 7 C12 12 12 20 16 25" fill="none" stroke="#fcd3e2" stroke-width="2" stroke-linecap="round" opacity=".8"/>`); }
function pEmber() { return svg(32, 32, `<defs><radialGradient id="r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".3" stop-color="#ffab4a" stop-opacity=".75"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient></defs>${circle(16, 16, 14, 'url(#r)')}${circle(16, 16, 3, '#fff0c8')}`); }
function pGlow() { return svg(64, 64, `<defs><radialGradient id="r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".3" stop-color="#fff6e0" stop-opacity=".45"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></radialGradient></defs>${circle(32, 32, 32, 'url(#r)')}`); }
function pChip(z) {
  const C = { cloud: ['#d6b8f2', '#6f55a8'], spires: ['#ffd27a', '#1f3570'], gardens: ['#d98a52', '#743c22'], lanes: ['#f06352', '#7e2230'] }[z];
  const extra = { cloud: circle(15, 9, 2, '#efdefc'), spires: line(9, 8, 15, 14, '#fff6d8', 2, ' opacity=".7"'), gardens: ell(16, 7, 3, 5, '#5fb872', ' transform="rotate(30 16 7)"'), lanes: line(12, 6, 13, 18, '#c9433f', 1.5) }[z];
  const shape = z === 'cloud' ? `${circle(9, 14, 6, C[0], ` stroke="${C[1]}" stroke-width="2"`)}${circle(15, 11, 7, C[0], ` stroke="${C[1]}" stroke-width="2"`)}${circle(9, 14, 4.5, C[0])}`
    : `<path d="M4 8 L14 3 L21 10 L17 20 L6 18 Z" fill="${C[0]}" stroke="${C[1]}" stroke-width="2" stroke-linejoin="round"/>`;
  return svg(24, 24, shape + extra);
}

// ---------- write ----------
const SKY = { cloud: skyCloud, spires: skySpires, gardens: skyGardens, lanes: skyLanes };
const FAR = { cloud: farCloud, spires: farSpires, gardens: farGardens, lanes: farLanes };
const NEAR = { cloud: nearCloud, spires: nearSpires, gardens: nearGardens, lanes: nearLanes };
const BRICK = { cloud: brickCloud, spires: brickSpires, gardens: brickGardens, lanes: brickLanes };
for (const z of ZONES) {
  write(`levels/${z}/sky.svg`, SKY[z]());
  write(`levels/${z}/far.svg`, FAR[z]());
  write(`levels/${z}/near.svg`, NEAR[z]());
  write(`bricks/${z}.svg`, BRICK[z]('block'));
  write(`bricks/${z}_tough.svg`, BRICK[z]('tough'));
  write(`bricks/${z}_crack.svg`, BRICK[z]('crack'));
  write(`particles/chip_${z}.svg`, pChip(z));
}
write('bricks/gem.svg', brickGem());
write('bricks/magnet.svg', brickMagnet());
write('particles/twinkle.svg', pTwinkle());
write('particles/mist.svg', pMist());
write('particles/shooting.svg', pShooting());
write('particles/firefly.svg', pFirefly());
write('particles/petal.svg', pPetal());
write('particles/ember.svg', pEmber());
write('particles/glow.svg', pGlow());
const palOut = {}; for (const z of ZONES) { const { skyTop, skyBottom, ink, bar, glow, ground } = PAL[z]; palOut[z] = { skyTop, skyBottom, ink, bar, glow, ground }; }
write('levels/palette.json', JSON.stringify(palOut, null, 2) + '\n');
// self-check: forbidden content
for (const rel of written) {
  const s = fs.readFileSync(path.join(OUT, rel), 'utf8');
  if (/<text|<script|<image|font-family|href=|url\(http/.test(s)) throw new Error('forbidden content in ' + rel);
  for (const m of s.matchAll(/stdDeviation="([\d.]+)"/g)) if (+m[1] > 4) throw new Error('blur > 4 in ' + rel);
}
console.log(`wrote ${written.length} files to ${path.relative(process.cwd(), OUT) || OUT}`);
