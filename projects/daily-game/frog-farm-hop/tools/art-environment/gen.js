#!/usr/bin/env node
// Environment art generator for Clover's Farm Hop (original, hand-written SVG; no deps).
// Writes into game/assets/default/: levels/<w>/sky.svg, levels/<w>/far.svg (w = sunny|rain|wind|snow),
// levels/ground.svg, levels/pole.svg, levels/palette.json and particles/*.svg.
// Contract: docs/DESIGN.md §3, §4.2, §4.3.  Usage: node gen.js [assetsDir]
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
// a seeded RNG so the art is the same every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Place a piece of markup (drawn around 0,0, radius r) at (x, y) and repeat it on the opposite edge(s)
// wherever it crosses the tile border — this is what makes the tile seamless.
function wrapPlace(x, y, r, markup, W, H, wrapY, wrapX = true) {
  let out = '';
  const dxs = wrapX ? [0, -W, W] : [0], dys = wrapY ? [0, -H, H] : [0];
  for (const dx of dxs) for (const dy of dys) {
    const X = x + dx, Y = y + dy;
    if (X + r < 0 || X - r > W || Y + r < 0 || Y - r > H) continue;
    out += `<g transform="translate(${f(X)} ${f(Y)})">${markup}</g>`;
  }
  return out;
}
const radial = (id, color, a0, a1 = 0, stopMid) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a0}"/>` +
  (stopMid ? `<stop offset="${stopMid[0]}" stop-color="${color}" stop-opacity="${stopMid[1]}"/>` : '') +
  `<stop offset="1" stop-color="${color}" stop-opacity="${a1}"/></radialGradient>`;
const vgrad = (id, stops) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
  stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + `</linearGradient>`;

// A flat picture-book cloud: puffs on a flat-ish base, a soft underside band. Drawn centred at 0,0.
function cloud(w, h, fill, under, opacity, seed = 1) {
  const R = rng(seed), n = Math.max(3, Math.round(w / (h * 0.75)));
  let top = '', bot = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const cx = -w / 2 + h * 0.45 + t * (w - h * 0.9);
    const bump = Math.sin(t * Math.PI);
    const r = h * (0.36 + 0.28 * bump + 0.08 * R());
    const cy = h * 0.18 - bump * h * 0.22;
    top += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
    bot += `<circle cx="${f(cx)}" cy="${f(cy + h * 0.1)}" r="${f(r)}"/>`;
  }
  const base = `<rect x="${f(-w / 2 + h * 0.2)}" y="${f(h * 0.05)}" width="${f(w - h * 0.4)}" height="${f(h * 0.4)}" rx="${f(h * 0.2)}"/>`;
  return `<g opacity="${opacity}"><g fill="${under}">${bot}${base.replace(/y="([\d.-]+)"/, (m, v) => `y="${f(+v + h * 0.1)}"`)}</g>` +
    `<g fill="${fill}">${top}${base}</g></g>`;
}

// ---------- palette ----------
const PALETTE = {
  sunny: { skyTop: '#8fd3ff', skyBottom: '#e8f7ff', tint: '#fffaf0', snow: false },
  rain:  { skyTop: '#9fb3b8', skyBottom: '#dfe8e4', tint: '#7f979c', snow: false },
  wind:  { skyTop: '#f2b7a4', skyBottom: '#fff1e4', tint: '#e9a08c', snow: false },
  snow:  { skyTop: '#b7a6d9', skyBottom: '#f6e3ec', tint: '#a796cf', snow: true }
};

// ======================================================================
// SKY (960x540, opaque, horizontally tileable)
// ======================================================================
const SW = 960, SH = 540;

function skySunny() {
  const P = PALETTE.sunny;
  let defs = vgrad('g', [[0, P.skyTop], [0.55, '#bfe6ff'], [1, P.skyBottom]]) +
    radial('halo', '#fffdf2', 0.85, 0, [0.35, 0.35]) + radial('soft', '#ffffff', 0.75, 0, [0.5, 0.45]) +
    radial('haze', '#d6f0ff', 0.7, 0);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // soft high haze bands (wrap)
  for (const [x, y, rx, ry] of [[120, 150, 260, 40], [600, 110, 300, 34], [930, 220, 220, 30]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#haze)"/>`, SW, SH);
  // a soft sun top-right (outside the play column)
  b += `<circle cx="850" cy="86" r="150" fill="url(#halo)"/>`;
  b += `<circle cx="850" cy="86" r="46" fill="#fff9e3"/><circle cx="850" cy="86" r="36" fill="#fffdf4"/>`;
  b += `<path d="M826 70 a28 28 0 0 1 22 -12" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>`;
  // big soft cloud banks low on the horizon
  for (const [x, y, rx, ry] of [[40, 500, 230, 90], [300, 520, 210, 70], [560, 505, 250, 85], [820, 515, 220, 80], [700, 450, 120, 40], [170, 430, 110, 36]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#soft)"/>`, SW, SH);
  // two faint flat clouds high in the sky, left third
  b += wrapPlace(110, 120, 90, cloud(150, 44, '#ffffff', '#dceefc', 0.55, 3), SW, SH);
  b += wrapPlace(600, 300, 160, `<ellipse rx="160" ry="22" fill="url(#haze)"/>`, SW, SH);
  return svg(SW, SH, b, defs);
}

function skyRain() {
  const P = PALETTE.rain;
  let defs = vgrad('g', [[0, P.skyTop], [0.6, '#c3d1d0'], [1, P.skyBottom]]) +
    radial('dark', '#82979b', 0.75, 0, [0.55, 0.5]) + radial('lite', '#eef3f0', 0.6, 0);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // heavy soft cloud ceiling (across the whole width, wrapping)
  const R = rng(11);
  for (let i = 0; i < 9; i++) {
    const x = i * 110 + R() * 40, y = 30 + R() * 80, rx = 150 + R() * 70, ry = 70 + R() * 30;
    b += wrapPlace(x, y, rx, `<ellipse rx="${f(rx)}" ry="${f(ry)}" fill="url(#dark)"/>`, SW, SH);
  }
  // lighter breaks and low mist
  for (const [x, y, rx, ry] of [[250, 190, 200, 50], [760, 230, 220, 50], [60, 470, 240, 70], [480, 500, 260, 70], [880, 480, 200, 60]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#lite)"/>`, SW, SH);
  return svg(SW, SH, b, defs);
}

function skyWind() {
  const P = PALETTE.wind;
  let defs = vgrad('g', [[0, P.skyTop], [0.5, '#fad3c1'], [1, P.skyBottom]]) +
    radial('soft', '#fff8ee', 0.7, 0, [0.5, 0.4]) + radial('sun', '#fff6e4', 0.9, 0, [0.4, 0.4]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // low pale afternoon sun on the left (outside the column)
  b += `<circle cx="96" cy="150" r="120" fill="url(#sun)"/><circle cx="96" cy="150" r="34" fill="#fff4dc"/>`;
  // long streaky clouds (horizontal capsules; wrap left/right)
  const streaks = [[260, 70, 340, 12, '#fff6ea', 0.75], [720, 50, 280, 10, '#ffe6d0', 0.7], [880, 120, 260, 9, '#fff6ea', 0.6],
    [460, 170, 380, 11, '#ffe9d8', 0.55], [60, 240, 300, 9, '#fff6ea', 0.55], [640, 290, 360, 10, '#fff6ea', 0.5],
    [300, 360, 280, 8, '#ffe6d0', 0.45], [900, 380, 240, 8, '#fff6ea', 0.45]];
  for (const [x, y, w, h, c, a] of streaks) {
    const m = `<g opacity="${a}" fill="${c}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}"/>` +
      `<rect x="${-w / 2 + w * 0.18}" y="${-h / 2 - h * 0.9}" width="${w * 0.45}" height="${h}" rx="${h / 2}"/>` +
      `<rect x="${-w / 2 + w * 0.4}" y="${h * 0.9 - h / 2}" width="${w * 0.5}" height="${h * 0.8}" rx="${h * 0.4}"/></g>`;
    b += wrapPlace(x, y, w / 2 + 2, m, SW, SH);
  }
  for (const [x, y, rx, ry] of [[160, 500, 240, 70], [520, 520, 260, 60], [850, 495, 220, 70]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#soft)"/>`, SW, SH);
  return svg(SW, SH, b, defs);
}

function skySnow() {
  const P = PALETTE.snow;
  let defs = vgrad('g', [[0, P.skyTop], [0.55, '#d8c6e6'], [1, P.skyBottom]]) +
    radial('halo', '#fbf7ff', 0.8, 0, [0.35, 0.3]) + radial('soft', '#fbeef5', 0.7, 0, [0.5, 0.4]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // a pale moon top-left
  b += `<circle cx="120" cy="96" r="120" fill="url(#halo)"/>`;
  b += `<circle cx="120" cy="96" r="40" fill="#f7f2fd"/>` +
    `<circle cx="106" cy="86" r="8" fill="#e7def3"/><circle cx="132" cy="108" r="6" fill="#e7def3"/><circle cx="128" cy="78" r="4" fill="#e7def3"/>`;
  // faint tiny stars high up (white, not yellow)
  const R = rng(21);
  for (let i = 0; i < 26; i++) {
    const x = R() * SW, y = 10 + R() * 200, r = 0.8 + R() * 1.4;
    b += wrapPlace(x, y, 3, `<circle r="${f(r)}" fill="#ffffff" opacity="${f(0.35 + R() * 0.35)}"/>`, SW, SH);
  }
  // soft pink dusk cloud banks low
  for (const [x, y, rx, ry] of [[80, 480, 240, 80], [420, 510, 260, 70], [760, 470, 250, 85], [600, 400, 140, 30], [250, 380, 120, 26]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#soft)"/>`, SW, SH);
  b += wrapPlace(820, 200, 90, cloud(150, 38, '#efe4f6', '#d3c4e6', 0.5, 7), SW, SH);
  return svg(SW, SH, b, defs);
}

// ======================================================================
// FAR (960x1080, transparent, tileable both ways). Décor mostly in the side thirds.
// ======================================================================
const FW = 960, FH = 1080;
const bird = (s, c, a) => `<path d="M${-10 * s} ${-3 * s} Q${-5 * s} ${-7 * s} 0 0 Q${5 * s} ${-7 * s} ${10 * s} ${-3 * s}" fill="none" stroke="${c}" stroke-width="${f(2.4 * s)}" stroke-linecap="round" stroke-linejoin="round" opacity="${a}"/>`;
const star4 = (r, c, a) => `<path d="M0 ${-r} Q${r * 0.18} ${-r * 0.18} ${r} 0 Q${r * 0.18} ${r * 0.18} 0 ${r} Q${-r * 0.18} ${r * 0.18} ${-r} 0 Q${-r * 0.18} ${-r * 0.18} 0 ${-r}Z" fill="${c}" opacity="${a}"/>`;

function farSunny() {
  let b = '';
  const clouds = [[90, 80, 170, 46], [860, 230, 150, 40], [200, 420, 120, 34], [760, 560, 180, 48], [-20, 720, 160, 42],
    [700, 880, 130, 36], [220, 980, 150, 40], [470, 300, 64, 16], [500, 760, 56, 14]];
  clouds.forEach(([x, y, w, h], i) => {
    const centre = x > 300 && x < 660;
    // far clouds are flatter, bluish and fainter than the white puff-cloud platforms (which have a lilac belly and a face)
    b += wrapPlace(x, y, w / 2 + 10, cloud(w, h * 0.85, '#f3f9ff', '#d2e6f6', centre ? 0.22 : 0.5, 30 + i), FW, FH, true);
  });
  const birds = [[150, 260, 1.0], [178, 248, 0.8], [168, 278, 0.7], [830, 700, 1.0], [856, 690, 0.75], [930, 980, 0.9], [952, 994, 0.7], [60, 600, 0.8]];
  for (const [x, y, s] of birds) b += wrapPlace(x, y, 14, bird(s, '#6d8ea6', 0.55), FW, FH, true);
  return svg(FW, FH, b);
}

function farRain() {
  let b = '';
  const rc = (w, h, seed, a) => {
    let rain = '';
    for (let i = 0; i < 6; i++) {
      const x = -w * 0.35 + i * (w * 0.7 / 5);
      rain += `<path d="M${f(x)} ${f(h * 0.55)} l-8 ${f(h * 0.9)}" stroke="#8ca1a6" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="10 9" opacity="${a * 0.55}"/>`;
    }
    return rain + cloud(w, h, '#b3c2c3', '#93a6a9', a, seed);
  };
  const items = [[110, 120, 200, 56], [850, 330, 190, 52], [60, 560, 170, 48], [800, 760, 210, 58], [240, 880, 150, 42],
    [940, 1040, 160, 46], [480, 470, 90, 26]];
  items.forEach(([x, y, w, h], i) => {
    const centre = x > 300 && x < 660;
    b += wrapPlace(x, y, w / 2 + 30, rc(w, h, 50 + i, centre ? 0.3 : 0.62), FW, FH, true);
  });
  return svg(FW, FH, b);
}

function farWind() {
  let b = '';
  // kite: diamond with a cross spar, string going down-left, a wavy tail with bows
  const kite = (c1, c2, ol, a, tailSeed) => {
    const R = rng(tailSeed);
    let tail = `<path d="M0 34 C 12 54, -14 70, 4 90 S -6 120, 10 138" fill="none" stroke="#9c8a7a" stroke-width="2" stroke-linecap="round"/>`;
    for (const [tx, ty] of [[6, 52], [-6, 76], [5, 104], [3, 128]]) {
      const rot = (R() * 40 - 20).toFixed(0);
      tail += `<path transform="translate(${tx} ${ty}) rotate(${rot})" d="M0 0 L-7 -5 L-7 5 Z M0 0 L7 -5 L7 5 Z" fill="${c2}"/>`;
    }
    return `<g opacity="${a}">${tail}` +
      `<path d="M0 -36 L26 -4 L0 34 L-26 -4 Z" fill="${c1}" stroke="${ol}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M0 -36 L0 34 L-26 -4 Z" fill="${c2}" opacity=".8"/>` +
      `<path d="M0 -36 L0 34 M-26 -4 L26 -4" stroke="${ol}" stroke-width="1.6" opacity=".6"/></g>`;
  };
  const swirl = (s, a) => `<path d="M${-40 * s} 0 C ${-20 * s} ${-14 * s}, ${10 * s} ${-14 * s}, ${22 * s} ${-2 * s} C ${32 * s} ${8 * s}, ${22 * s} ${20 * s}, ${12 * s} ${14 * s} C ${4 * s} ${9 * s}, ${8 * s} ${-2 * s}, ${18 * s} ${2 * s}" fill="none" stroke="#ffffff" stroke-width="${f(4 * s)}" stroke-linecap="round" opacity="${a}"/>` +
    `<path d="M${-60 * s} ${12 * s} L${-14 * s} ${12 * s}" stroke="#ffffff" stroke-width="${f(3 * s)}" stroke-linecap="round" opacity="${a * 0.8}"/>`;
  b += wrapPlace(130, 150, 70, kite('#93bfe0', '#76a6cc', '#4f7c9e', 0.72, 1), FW, FH, true);
  b += wrapPlace(860, 520, 70, kite('#8cc2bb', '#6fa8a1', '#4d7f79', 0.72, 2), FW, FH, true);
  b += wrapPlace(180, 820, 70, kite('#b9a6dc', '#9f8bc7', '#6f5f96', 0.7, 3), FW, FH, true);
  const sw = [[820, 120, 1.2], [70, 420, 1.0], [900, 840, 1.1], [250, 600, 0.8], [480, 330, 0.7], [470, 970, 0.75], [700, 1030, 0.9]];
  for (const [x, y, s] of sw) b += wrapPlace(x, y, 75 * s, swirl(s, x > 300 && x < 660 ? 0.32 : 0.55), FW, FH, true);
  return svg(FW, FH, b);
}

function farSnow() {
  let b = '';
  const items = [[120, 100, 190, 48], [860, 380, 180, 46], [40, 640, 160, 42], [760, 860, 200, 50], [480, 560, 90, 24]];
  items.forEach(([x, y, w, h], i) => {
    const centre = x > 300 && x < 660;
    b += wrapPlace(x, y, w / 2 + 10, cloud(w, h, '#f4eefa', '#d6c9e8', centre ? 0.35 : 0.65, 70 + i), FW, FH, true);
  });
  const R = rng(77);
  for (let i = 0; i < 22; i++) {
    let x = R() * FW; if (x > 300 && x < 660) x = R() < 0.5 ? x - 260 : x + 260;
    const y = R() * FH, r = 4 + R() * 5;
    b += wrapPlace(x, y, r + 1, star4(r, '#ffffff', f(0.45 + R() * 0.35)), FW, FH, true);
  }
  for (let i = 0; i < 30; i++) b += wrapPlace(R() * FW, R() * FH, 3, `<circle r="${f(1 + R() * 1.4)}" fill="#ffffff" opacity="${f(0.3 + R() * 0.3)}"/>`, FW, FH, true);
  return svg(FW, FH, b);
}

// ======================================================================
// GROUND (1280x420): ground line y = 330 = world y 0
// ======================================================================
function ground() {
  const GL = 330;
  let defs = vgrad('soil', [[0, '#a37a52'], [1, '#7e5a3c']]) + vgrad('water', [[0, '#a9d8e6'], [1, '#7fb9cc']]);
  let b = '';
  // distant soft hills (kept low in the column centre)
  b += `<path d="M0 262 C 120 230, 240 236, 360 262 C 430 278, 520 284, 640 282 C 760 280, 850 276, 930 258 C 1040 232, 1180 236, 1280 262 L1280 330 L0 330 Z" fill="#b9d8a6"/>`;
  b += `<path d="M0 286 C 160 270, 300 280, 420 292 C 560 300, 720 300, 860 292 C 980 284, 1120 270, 1280 286 L1280 340 L0 340 Z" fill="#9ec68b"/>`;
  // silo
  b += `<g stroke="#5f6d7a" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="36" y="140" width="64" height="${GL - 140}" fill="#c7d0d8"/>` +
    `<rect x="78" y="140" width="22" height="${GL - 140}" fill="#aab6c1" stroke="none"/>` +
    `<path d="M36 140 a32 34 0 0 1 64 0 Z" fill="#94a6b8"/>` +
    `<path d="M36 186 H100 M36 236 H100 M36 286 H100" fill="none" opacity=".55"/>` +
    `<rect x="36" y="140" width="64" height="${GL - 140}" fill="none"/></g>`;
  // barn (gambrel roof, white trim)
  b += `<g stroke="#6e2e2a" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="122" y="212" width="196" height="${GL - 212}" fill="#c65a4e"/>` +
    `<rect x="276" y="212" width="42" height="${GL - 212}" fill="#a94a40" stroke="none"/>` +
    `<path d="M108 218 L148 168 L220 136 L292 168 L332 218 Z" fill="#8e3f3a"/>` +
    `<path d="M116 216 L150 172 L220 142 L290 172 L324 216" fill="none" stroke="#f7f1e6" stroke-width="5"/>` +
    `<rect x="122" y="212" width="196" height="${GL - 212}" fill="none"/></g>`;
  // loft window + door with X trim
  b += `<g stroke="#f7f1e6" stroke-width="5" stroke-linejoin="round" fill="none">` +
    `<rect x="200" y="176" width="40" height="30" fill="#6e2e2a"/>` +
    `<rect x="172" y="254" width="96" height="${GL - 254}" fill="#a94a40"/>` +
    `<path d="M172 254 L268 ${GL} M268 254 L172 ${GL} M220 254 V${GL}"/></g>`;
  b += `<path d="M206 182 L234 182" stroke="#f7f1e6" stroke-width="3" opacity=".7"/>`;
  // windmill (right)
  const wx = 1196, wy = 178;
  b += `<g stroke="#5e5248" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M${wx - 30} ${GL} L${wx - 12} ${wy + 6} L${wx + 12} ${wy + 6} L${wx + 30} ${GL} Z" fill="#e6dccb"/>` +
    `<path d="M${wx + 4} ${wy + 6} L${wx + 12} ${wy + 6} L${wx + 30} ${GL} L${wx + 16} ${GL} Z" fill="#cfc3ae" stroke="none"/>` +
    `<path d="M${wx - 30} ${GL} L${wx - 12} ${wy + 6} L${wx + 12} ${wy + 6} L${wx + 30} ${GL} Z" fill="none"/>` +
    `<rect x="${wx - 8}" y="${GL - 34}" width="16" height="34" rx="8" fill="#8a6a4a"/>` +
    `<path d="M${wx - 18} ${wy + 8} L${wx} ${wy - 12} L${wx + 18} ${wy + 8} Z" fill="#8e3f3a"/></g>`;
  let blades = '';
  for (let k = 0; k < 4; k++) blades += `<g transform="rotate(${15 + k * 90})"><path d="M0 -6 L0 -62" stroke="#5e5248" stroke-width="3"/>` +
    `<path d="M2 -16 L22 -18 L20 -62 L2 -62 Z" fill="#f4efe6" stroke="#5e5248" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M8 -28 H20 M8 -42 H20" stroke="#cbbfae" stroke-width="2"/></g>`;
  b += `<g transform="translate(${wx} ${wy})">${blades}<circle r="7" fill="#8a6a4a" stroke="#5e5248" stroke-width="3"/></g>`;
  // bushes
  const bush = (x, s) => `<g transform="translate(${x} ${GL}) scale(${s})" stroke="#3f6e42" stroke-width="3"><path d="M-34 0 C -40 -22, -22 -34, -8 -28 C -2 -44, 22 -42, 26 -24 C 40 -24, 44 -6, 36 0 Z" fill="#6c9f62"/><path d="M-14 -16 a8 8 0 0 1 12 -4" fill="none" stroke="#8ab97c" stroke-width="3" stroke-linecap="round"/></g>`;
  b += bush(18, 0.9) + bush(1104, 0.8) + bush(350, 0.7);
  // wooden fence across the whole width (≤ 46 px above the ground line)
  let fence = `<g stroke="#7d6046" stroke-width="3" stroke-linejoin="round">`;
  fence += `<rect x="-4" y="${GL - 36}" width="1288" height="9" rx="3" fill="#c9a882"/>`;
  fence += `<rect x="-4" y="${GL - 18}" width="1288" height="9" rx="3" fill="#c9a882"/>`;
  for (let x = 16; x < 1280; x += 64) fence += `<path d="M${x - 7} ${GL} V${GL - 40} L${x} ${GL - 47} L${x + 7} ${GL - 40} V${GL} Z" fill="#d8bb94"/>` +
    `<path d="M${x + 2} ${GL - 40} V${GL - 4}" stroke="#bc9c74" stroke-width="3"/>`;
  fence += `</g>`;
  b += fence;
  // sunflowers just outside the calm centre
  const sunflower = (x, h, s) => {
    let p = '';
    for (let k = 0; k < 12; k++) p += `<ellipse transform="rotate(${k * 30}) translate(0 -14)" rx="5" ry="9" fill="#f2c94c" stroke="#b78a2a" stroke-width="1.5"/>`;
    return `<g transform="translate(${x} ${GL})"><path d="M0 0 C 4 ${-h * 0.4}, -4 ${-h * 0.7}, 0 ${-h}" stroke="#4f8a49" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M0 ${-h * 0.45} C 14 ${-h * 0.55}, 22 ${-h * 0.45}, 24 ${-h * 0.38} C 14 ${-h * 0.34}, 6 ${-h * 0.38}, 0 ${-h * 0.45} Z" fill="#6c9f62" stroke="#3f6e42" stroke-width="2"/>` +
      `<g transform="translate(0 ${-h}) scale(${s})">${p}<circle r="9" fill="#7a4e2c" stroke="#55361e" stroke-width="2"/><circle cx="-3" cy="-3" r="2.5" fill="#9b6b44"/></g></g>`;
  };
  b += sunflower(364, 96, 1.1) + sunflower(388, 70, 0.85) + sunflower(904, 84, 1.0);
  // grass body (opaque to the bottom) and soil
  b += `<rect x="0" y="${GL}" width="1280" height="${420 - GL}" fill="url(#soil)"/>`;
  b += `<path d="M0 ${GL - 2} H1280 V${GL + 22} C 1100 ${GL + 30}, 900 ${GL + 20}, 640 ${GL + 26} C 380 ${GL + 32}, 180 ${GL + 22}, 0 ${GL + 28} Z" fill="#5f9a58"/>`;
  b += `<path d="M0 ${GL - 2} H1280" stroke="#79b26a" stroke-width="5"/>`;
  // grass tufts on the ground line
  const R = rng(5);
  for (let x = 6; x < 1280; x += 22 + R() * 18) {
    const h = 6 + R() * 7;
    b += `<path d="M${f(x - 5)} ${GL + 1} L${f(x - 2)} ${f(GL - h)} L${f(x)} ${GL - 1} L${f(x + 3)} ${f(GL - h * 0.8)} L${f(x + 6)} ${GL + 1} Z" fill="#79b26a"/>`;
  }
  // soil stripes and pebbles
  b += `<path d="M0 372 C 300 366, 600 378, 900 370 C 1080 366, 1200 372, 1280 370" stroke="#8d6644" stroke-width="5" fill="none" opacity=".6"/>`;
  b += `<path d="M0 402 C 260 396, 640 408, 1000 400 C 1140 398, 1220 402, 1280 400" stroke="#6f4f34" stroke-width="5" fill="none" opacity=".6"/>`;
  for (let i = 0; i < 26; i++) {
    const x = R() * 1280, y = 362 + R() * 52, rx = 4 + R() * 6;
    b += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.6)}" fill="#b58e66" opacity=".7"/>`;
  }
  // duck pond (sits in the front grass, right side) with a little white duck
  b += `<ellipse cx="1010" cy="${GL + 16}" rx="96" ry="18" fill="#4f8a4c"/>`;
  b += `<ellipse cx="1010" cy="${GL + 16}" rx="88" ry="13" fill="url(#water)" stroke="#5e8f9e" stroke-width="3"/>`;
  b += `<path d="M954 ${GL + 14} h30 M1030 ${GL + 20} h36" stroke="#e7f6fb" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;
  b += `<g transform="translate(1046 ${GL + 10})" stroke="#7c8790" stroke-width="2" stroke-linejoin="round">` +
    `<path d="M-16 0 C -16 -10, 6 -10, 10 -4 C 14 -2, 14 4, 8 6 L-12 6 C -16 6, -18 3, -16 0 Z" fill="#fbfbf6"/>` +
    `<circle cx="8" cy="-12" r="7" fill="#fbfbf6"/><path d="M14 -13 L22 -11 L14 -9 Z" fill="#f2a65a" stroke="#c97d3a"/>` +
    `<circle cx="10" cy="-13" r="1.6" fill="#3a3340" stroke="none"/><path d="M-8 -2 C -2 -6, 4 -4, 4 0" fill="none" stroke="#c8ced3"/></g>`;
  return svg(1280, 420, b, defs);
}

// ======================================================================
// POLE (48x256, seamless vertically)
// ======================================================================
function pole() {
  const H = 256;
  let b = '';
  b += `<rect x="10" y="0" width="28" height="${H}" fill="#a88a6a"/>`;
  b += `<rect x="29" y="0" width="9" height="${H}" fill="#8e7154"/>`;
  b += `<rect x="13" y="0" width="5" height="${H}" fill="#c2a581"/>`;
  // grain lines (periodic in y so the tile is seamless)
  const grain = (x0, amp, ph) => { let d = ''; for (let y = 0; y <= H; y += 8) d += (y ? 'L' : 'M') + f(x0 + amp * Math.sin(2 * Math.PI * (y / H) * 2 + ph)) + ' ' + y; return `<path d="${d}" stroke="#7d6248" stroke-width="1.5" fill="none" opacity=".55"/>`; };
  b += grain(21, 1.2, 0) + grain(26, 1.0, 2);
  b += `<ellipse cx="22" cy="122" rx="3.5" ry="6" fill="#7d6248" opacity=".7"/>`;
  b += `<path d="M10 0 V${H} M38 0 V${H}" stroke="#5e4632" stroke-width="3"/>`;
  // ivy vine: x = 24 + 11 sin(2πy/H) — periodic, so it continues across the top/bottom edges
  let d = ''; for (let y = -8; y <= H + 8; y += 4) d += (y === -8 ? 'M' : 'L') + f(24 + 8 * Math.sin(2 * Math.PI * y / H)) + ' ' + y;
  b += `<path d="${d}" stroke="#4a6e3f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  const leaf = (s, flip, c) => `<g transform="scale(${flip ? -s : s} ${s})"><path d="M0 0 C 4 -8, 14 -10, 16 -2 C 14 6, 4 8, 0 0 Z" fill="${c}" stroke="#3d6440" stroke-width="1.8" stroke-linejoin="round"/><path d="M1 0 L12 -2" stroke="#3d6440" stroke-width="1" opacity=".7"/></g>`;
  const leaves = [[4, false, 1, '#76a86c'], [40, true, 0.9, '#6a9d63'], [78, false, 1.1, '#76a86c'], [118, true, 1, '#83b277'],
    [160, false, 0.85, '#6a9d63'], [196, true, 1.1, '#76a86c'], [232, false, 0.95, '#83b277']];
  for (const [y, flip, s, c] of leaves) {
    const x = 24 + 8 * Math.sin(2 * Math.PI * y / H);
    b += wrapPlace(x, y, 18, leaf(s, flip, c), 48, H, true, false);
  }
  return svg(48, H, b);
}

// ======================================================================
// PARTICLES
// ======================================================================
const P32 = b => svg(32, 32, b);
const particles = {
  petal: P32(`<path d="M16 5 C 24 9, 25 20, 16 27 C 7 20, 8 9, 16 5 Z" fill="#ffb7cb" stroke="#e48aa6" stroke-width="2" stroke-linejoin="round"/><path d="M16 9 C 13 14, 13 19, 15 23" stroke="#fff0f4" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`),
  butterfly: P32(`<g stroke="#8d6aa8" stroke-width="1.6" stroke-linejoin="round"><path d="M15 15 C 8 4, 2 6, 4 13 C 5 17, 10 17, 15 16 Z" fill="#cdb8f5"/><path d="M17 15 C 24 4, 30 6, 28 13 C 27 17, 22 17, 17 16 Z" fill="#cdb8f5"/>` +
    `<path d="M15 17 C 9 18, 6 24, 10 26 C 13 27, 15 22, 15 18 Z" fill="#ffc7de"/><path d="M17 17 C 23 18, 26 24, 22 26 C 19 27, 17 22, 17 18 Z" fill="#ffc7de"/></g>` +
    `<circle cx="8" cy="11" r="1.8" fill="#fff"/><circle cx="24" cy="11" r="1.8" fill="#fff"/><rect x="15" y="10" width="2.4" height="14" rx="1.2" fill="#5e4472"/><path d="M15.5 10 Q13 6 11 5 M16.8 10 Q19 6 21 5" stroke="#5e4472" stroke-width="1.2" fill="none" stroke-linecap="round"/>`),
  raindrop: svg(8, 32, `<defs>${vgrad('r', [[0, '#e6f3ff', 0], [0.6, '#dcefff', 0.7], [1, '#f4faff', 0.95]])}</defs><path d="M4 1 C 5 10, 6 22, 6 27 A2 2 0 0 1 2 27 C 2 22, 3 10, 4 1 Z" fill="url(#r)"/>`),
  splash: P32(`<g fill="#e3f2fb" stroke="#a9c9da" stroke-width="1.2"><ellipse cx="16" cy="26" rx="11" ry="3" fill="#d4e9f5" opacity=".8"/><path d="M8 25 C 7 19, 5 16, 4 14 C 7 16, 10 20, 11 25 Z"/><path d="M14 24 C 14 18, 14 14, 15 11 C 17 14, 17 18, 17 24 Z"/><path d="M21 25 C 22 20, 25 16, 28 14 C 27 17, 25 21, 24 25 Z"/></g><circle cx="6" cy="9" r="1.8" fill="#eaf6fd"/><circle cx="16" cy="6" r="1.6" fill="#eaf6fd"/><circle cx="26" cy="9" r="1.8" fill="#eaf6fd"/>`),
  leaf: P32(`<path d="M5 26 C 5 14, 14 5, 27 5 C 27 18, 18 27, 5 26 Z" fill="#f0a25a" stroke="#b86a2c" stroke-width="2" stroke-linejoin="round"/><path d="M27 5 C 22 10, 18 12, 15 16" stroke="#b86a2c" stroke-width="1.4" fill="none"/><path d="M6 26 L 22 10" stroke="#b86a2c" stroke-width="1.8" stroke-linecap="round"/><path d="M8 25 L4 29" stroke="#7a8a3c" stroke-width="2.4" stroke-linecap="round"/><path d="M10 20 C 11 14, 15 10, 20 8" stroke="#ffd2a6" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>`),
  gust: svg(96, 32, `<g fill="none" stroke="#ffffff" stroke-linecap="round"><path d="M4 18 C 26 18, 48 18, 66 14 C 80 11, 84 2, 75 3 C 68 4, 70 12, 78 12" stroke-width="4" opacity=".85"/><path d="M14 26 C 34 27, 58 27, 84 22" stroke-width="3" opacity=".6"/><path d="M28 10 C 40 9, 50 9, 58 8" stroke-width="2.4" opacity=".5"/></g>`),
  snowflake: P32(`<circle cx="16" cy="16" r="9" fill="#ffffff" opacity=".25"/><g stroke="#ffffff" stroke-width="2.2" stroke-linecap="round">` +
    [0, 60, 120].map(a => `<path transform="rotate(${a} 16 16)" d="M16 5 V27 M12.5 8 L16 11 L19.5 8 M12.5 24 L16 21 L19.5 24"/>`).join('') + `</g><circle cx="16" cy="16" r="2.4" fill="#ffffff"/>`),
  sparkle: P32(`<path d="M16 2 Q18 14 30 16 Q18 18 16 30 Q14 18 2 16 Q14 14 16 2 Z" fill="#ffffff"/><circle cx="16" cy="16" r="3" fill="#ffffff"/>`),
  straw: P32(`<g transform="rotate(-30 16 16)"><rect x="14.5" y="3" width="3.4" height="26" rx="1.7" fill="#e9c46a" stroke="#b88a35" stroke-width="1.2"/><path d="M16 6 V26" stroke="#f6e0a0" stroke-width="1"/></g>`),
  puff: P32(`<g fill="#d7defa"><circle cx="11" cy="19" r="7"/><circle cx="21" cy="19" r="7"/><circle cx="16" cy="15" r="8"/></g><g fill="#ffffff"><circle cx="11" cy="17" r="6.5"/><circle cx="21" cy="17" r="6.5"/><circle cx="16" cy="13" r="7.5"/></g><circle cx="13" cy="11" r="2" fill="#ffffff"/>`),
  glow: svg(32, 32, `<defs><radialGradient id="gl"><stop offset="0" stop-color="#fffbd0" stop-opacity="1"/><stop offset=".3" stop-color="#fff27a" stop-opacity=".85"/><stop offset=".65" stop-color="#ffd23f" stop-opacity=".3"/><stop offset="1" stop-color="#ffb627" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#gl)"/>`),
  dust: P32(`<g fill="#d8c4a4"><circle cx="12" cy="18" r="6" opacity=".7"/><circle cx="20" cy="17" r="5" opacity=".6"/><circle cx="16" cy="13" r="5" opacity=".55"/></g><circle cx="14" cy="14" r="2" fill="#efe3cf" opacity=".7"/>`)
};

// ---------- write ----------
const skies = { sunny: skySunny, rain: skyRain, wind: skyWind, snow: skySnow };
const fars = { sunny: farSunny, rain: farRain, wind: farWind, snow: farSnow };
for (const w of Object.keys(skies)) {
  write(`levels/${w}/sky.svg`, skies[w]());
  write(`levels/${w}/far.svg`, fars[w]());
}
write('levels/ground.svg', ground());
write('levels/pole.svg', pole());
write('levels/palette.json', JSON.stringify(PALETTE, null, 2) + '\n');
for (const [n, s] of Object.entries(particles)) write(`particles/${n}.svg`, s);
console.log('environment art written to ' + OUT);
