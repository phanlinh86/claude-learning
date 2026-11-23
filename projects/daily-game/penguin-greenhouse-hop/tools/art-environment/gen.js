#!/usr/bin/env node
// Environment art generator for Puddle's Greenhouse Hop (original, hand-written SVG; no deps).
// Writes into game/assets/default/: levels/<f>/sky.svg, levels/<f>/far.svg (f = potting|fern|balcony|roof),
// levels/ground.svg, levels/pole.svg, levels/beam.svg, levels/palette.json and particles/*.svg.
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
const inCentre = x => x > 300 && x < 660;

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
  const base = y => `<rect x="${f(-w / 2 + h * 0.2)}" y="${f(y)}" width="${f(w - h * 0.4)}" height="${f(h * 0.4)}" rx="${f(h * 0.2)}"/>`;
  return `<g opacity="${opacity}"><g fill="${under}">${bot}${base(h * 0.15)}</g><g fill="${fill}">${top}${base(h * 0.05)}</g></g>`;
}
// 4-point twinkle star
const star4 = (r, c, a) => `<path d="M0 ${-r} Q${f(r * 0.18)} ${f(-r * 0.18)} ${r} 0 Q${f(r * 0.18)} ${f(r * 0.18)} 0 ${r} Q${f(-r * 0.18)} ${f(r * 0.18)} ${-r} 0 Q${f(-r * 0.18)} ${f(-r * 0.18)} 0 ${-r}Z" fill="${c}" opacity="${a}"/>`;
// a wobbly rain streak running down glass (starts at 0,0, length L) with a bead at the bottom
function streak(L, a, seed) {
  const R = rng(seed); let d = 'M0 0', x = 0;
  for (let y = 8; y <= L; y += 8) { x += (R() - 0.5) * 3; d += ` L${f(x)} ${y}`; }
  return `<g opacity="${a}"><path d="${d}" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${f(x)}" cy="${L + 2}" r="3" fill="#ffffff"/><circle cx="${f(x - 1)}" cy="${L + 1}" r="1" fill="#e9f3f7"/></g>`;
}

// ---------- palette ----------
const PALETTE = {
  potting: { skyTop: '#a9bcc9', skyBottom: '#e7eef0', tint: 'rgba(170,190,205,0.08)' },
  fern:    { skyTop: '#9cc9b4', skyBottom: '#e3f2ea', tint: 'rgba(150,205,185,0.10)' },
  balcony: { skyTop: '#a7a9c9', skyBottom: '#e9e8f4', tint: 'rgba(150,152,190,0.12)' },
  roof:    { skyTop: '#8d86c2', skyBottom: '#f3dbe4', tint: 'rgba(160,140,200,0.08)' }
};

// ======================================================================
// SKY (960x540, opaque, horizontally tileable)
// ======================================================================
const SW = 960, SH = 540;

// potting: the back wall of the ground floor — big arched rainy glass panes in warm wood frames
function skyPotting() {
  const P = PALETTE.potting;
  const defs = vgrad('g', [[0, P.skyTop], [0.6, '#cbd8df'], [1, P.skyBottom]]) +
    radial('lite', '#f4f8f9', 0.7, 0) + radial('tree', '#9fb2b4', 0.55, 0, [0.6, 0.4]) +
    vgrad('sill', [[0, '#c9b79e'], [1, '#b5a084']]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // soft daylight patches and blurry rain-washed trees outside the glass
  for (const [x, y, rx, ry] of [[150, 160, 220, 90], [700, 120, 260, 80], [460, 300, 300, 60]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#lite)"/>`, SW, SH);
  const R = rng(3);
  for (let i = 0; i < 12; i++) {
    const x = i * 80 + R() * 30, rx = 70 + R() * 40, ry = 40 + R() * 30, y = 440 - R() * 30;
    b += wrapPlace(x, y, rx, `<ellipse rx="${f(rx)}" ry="${f(ry)}" fill="url(#tree)"/>`, SW, SH);
  }
  // rain streaks on the glass (fainter in the calm centre)
  for (let i = 0; i < 46; i++) {
    const x = R() * SW, y = 40 + R() * 380, L = 24 + R() * 70;
    b += wrapPlace(x, y, 6, streak(L, inCentre(x) ? 0.22 : 0.42, 100 + i), SW, SH);
  }
  // window frames: mullions every 160 (6 panes, tile = 960), round-arched tops, a transom and a sill
  const wood = '#b9a68c', woodD = '#9d8a71';
  let frame = '';
  for (let k = 0; k <= 6; k++) {
    const x = k * 160, a = (k >= 2 && k <= 4) ? 0.3 : 0.55;
    frame += `<path d="M${x} 108 V470" stroke="${woodD}" stroke-width="13" opacity="${a * 0.6}"/>` +
      `<path d="M${x} 108 V470" stroke="${wood}" stroke-width="8" opacity="${a}"/>`;
  }
  for (let k = 0; k < 6; k++) {
    const x0 = k * 160, a = (k >= 2 && k <= 3) ? 0.3 : 0.55;
    const arc = `M${x0} 108 A80 80 0 0 1 ${x0 + 160} 108`;
    frame += `<path d="${arc}" stroke="${woodD}" stroke-width="13" fill="none" opacity="${a * 0.6}"/><path d="${arc}" stroke="${wood}" stroke-width="8" fill="none" opacity="${a}"/>`;
    // a small round rosette in each arch, a slim glazing bar
    frame += `<circle cx="${x0 + 80}" cy="72" r="14" fill="none" stroke="${wood}" stroke-width="4" opacity="${a}"/>` +
      `<path d="M${x0 + 80} 86 V470" stroke="${wood}" stroke-width="3" opacity="${a * 0.6}"/>`;
  }
  frame += `<path d="M0 300 H${SW}" stroke="${wood}" stroke-width="5" opacity=".38"/>`;
  // the corners between arches: painted wall
  for (let k = 0; k <= 6; k++) {
    const x = k * 160;
    frame += `<path d="M${x - 80} 0 H${x + 80} V28 A80 80 0 0 0 ${x} 108 A80 80 0 0 0 ${x - 80} 28 Z" fill="#c8d3d8" opacity=".7"/>`;
  }
  b += frame;
  // sill + wainscot band (opaque, low) with plank joints every 120 (tileable)
  b += `<rect x="0" y="468" width="${SW}" height="72" fill="url(#sill)"/>`;
  b += `<rect x="0" y="462" width="${SW}" height="12" rx="3" fill="#d6c6ae"/><path d="M0 474 H${SW}" stroke="#9d8a71" stroke-width="2" opacity=".7"/>`;
  for (let x = 60; x < SW; x += 120) b += `<path d="M${x} 478 V540" stroke="#a48f74" stroke-width="2" opacity=".55"/>`;
  return svg(SW, SH, b, defs);
}

// fern: misty green-teal glasshouse with a faint lattice of glass and big soft mist banks
function skyFern() {
  const P = PALETTE.fern;
  const defs = vgrad('g', [[0, P.skyTop], [0.55, '#c1e0d1'], [1, P.skyBottom]]) +
    radial('mist', '#f2faf6', 0.85, 0, [0.5, 0.5]) + radial('deep', '#86b9a3', 0.5, 0) +
    vgrad('fade', [[0, '#ffffff', 0.35], [0.7, '#ffffff', 0.12], [1, '#ffffff', 0]]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // greener depth patches (jungle far away)
  for (const [x, y, rx, ry] of [[80, 360, 220, 120], [880, 300, 200, 140], [480, 420, 160, 60]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#deep)"/>`, SW, SH);
  // glass lattice (period 120 x, 90 y): faint white, fading downward into mist
  let lat = '';
  for (let x = 0; x <= SW; x += 120) lat += `M${x} 0 V${SH} `;
  for (let y = 45; y < SH; y += 90) lat += `M0 ${y} H${SW} `;
  b += `<path d="${lat}" stroke="url(#fade)" stroke-width="3" fill="none"/>`;
  // curved roof ribs at the top (period 240)
  let ribs = '';
  for (let x = 0; x <= SW; x += 240) ribs += `M${x - 120} 0 Q${x} 70 ${x + 120} 0 `;
  b += `<path d="${ribs}" stroke="#ffffff" stroke-width="4" fill="none" opacity=".3"/>`;
  // big silhouette fern fronds in the bottom corners (soft, low contrast)
  const sil = (s, flip) => `<g transform="scale(${flip ? -s : s} ${s})" fill="#8cbea7" opacity=".55">` +
    [[-60, 0.9], [-25, 1], [10, 0.85], [45, 0.7]].map(([a, l]) => `<path transform="rotate(${a})" d="M0 0 C -14 ${-80 * l}, -8 ${-160 * l}, 0 ${-200 * l} C 8 ${-160 * l}, 14 ${-80 * l}, 0 0 Z"/>`).join('') + `</g>`;
  b += wrapPlace(60, 560, 220, sil(1.1, false), SW, SH) + wrapPlace(900, 560, 220, sil(1.0, true), SW, SH);
  // mist banks (on top)
  for (const [x, y, rx, ry] of [[120, 470, 280, 90], [480, 510, 300, 80], [840, 480, 280, 90], [300, 230, 200, 40], [760, 190, 220, 40], [20, 120, 160, 36]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#mist)"/>`, SW, SH);
  return svg(SW, SH, b, defs);
}

// balcony: open rainy sky in grey-lilac, soft rain clouds, far rooftops, slanted rain hints
function skyBalcony() {
  const P = PALETTE.balcony;
  const defs = vgrad('g', [[0, P.skyTop], [0.55, '#c9c9df'], [1, P.skyBottom]]) +
    radial('lite', '#f5f4fa', 0.7, 0) + radial('dark', '#9799bd', 0.55, 0, [0.5, 0.4]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  const R = rng(31);
  // heavy soft cloud ceiling
  for (let i = 0; i < 9; i++) {
    const x = i * 110 + R() * 40, y = 20 + R() * 60, rx = 150 + R() * 60, ry = 60 + R() * 30;
    b += wrapPlace(x, y, rx, `<ellipse rx="${f(rx)}" ry="${f(ry)}" fill="url(#dark)"/>`, SW, SH);
  }
  // flat picture-book rain clouds with dashed rain below (side thirds)
  const rc = (w, h, seed, a) => {
    let rain = '';
    for (let i = 0; i < 6; i++) {
      const x = -w * 0.32 + i * (w * 0.64 / 5);
      rain += `<path d="M${f(x)} ${f(h * 0.5)} l-10 ${f(h * 1.3)}" stroke="#9da0c2" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="9 10" opacity="${f(a * 0.6)}"/>`;
    }
    return rain + cloud(w, h, '#d9d8ea', '#b7b6d3', a, seed);
  };
  b += wrapPlace(120, 120, 140, rc(220, 60, 5, 0.75), SW, SH) + wrapPlace(840, 170, 130, rc(200, 54, 6, 0.7), SW, SH) +
    wrapPlace(480, 90, 90, rc(140, 38, 7, 0.35), SW, SH);
  // lighter break in the middle, so the centre stays calm and bright
  b += wrapPlace(480, 280, 300, `<ellipse rx="300" ry="90" fill="url(#lite)"/>`, SW, SH);
  // far rooftops (period path: built from boxes, wrapped)
  const roofs = [[0, 90, 70], [80, 60, 100], [150, 110, 55], [270, 70, 80], [350, 120, 45], [470, 80, 60], [560, 100, 75], [670, 70, 95], [750, 120, 60], [880, 85, 80]];
  let rf = '';
  for (const [x, w, h] of roofs) {
    const m = `<path d="M0 0 V${-h} L${w / 2} ${-h - 26} L${w} ${-h} V0 Z" fill="#bcbbd6"/>` +
      `<rect x="${w * 0.6}" y="${-h - 30}" width="10" height="24" fill="#bcbbd6"/>` +
      `<rect x="${w * 0.22}" y="${-h + 16}" width="12" height="14" rx="2" fill="#d3d2e6"/>`;
    rf += wrapPlace(x, 470, w + 20, `<g transform="translate(0 0)">${m}</g>`, SW, SH);
  }
  b += `<g opacity=".8">${rf}</g>`;
  b += `<rect x="0" y="468" width="${SW}" height="72" fill="#c9c8de"/>`;
  b += wrapPlace(480, 470, 600, `<ellipse rx="600" ry="26" fill="url(#lite)"/>`, SW, SH);
  // slanted rain hints across the whole sky (very faint)
  for (let i = 0; i < 70; i++) {
    const x = R() * SW, y = R() * SH, L = 18 + R() * 26;
    b += wrapPlace(x, y, 30, `<path d="M0 0 l${f(-L * 0.25)} ${f(L)}" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="${f(inCentre(x) ? 0.18 : 0.32)}"/>`, SW, SH);
  }
  return svg(SW, SH, b, defs);
}

// roof: twilight lilac-rose, soft rainbow rising out of clouds on the right, first stars (white/lilac)
function skyRoof() {
  const P = PALETTE.roof;
  const defs = vgrad('g', [[0, P.skyTop], [0.5, '#c3b2d8'], [1, P.skyBottom]]) +
    radial('glow', '#fff1f4', 0.75, 0, [0.4, 0.35]) + radial('soft', '#f7e6ee', 0.85, 0, [0.5, 0.5]);
  let b = `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`;
  // stars (white and lilac, never yellow)
  const R = rng(41);
  for (let i = 0; i < 34; i++) {
    const x = R() * SW, y = 8 + R() * 220, r = 0.9 + R() * 1.4, c = R() < 0.6 ? '#ffffff' : '#e6dcff';
    b += wrapPlace(x, y, 3, `<circle r="${f(r)}" fill="${c}" opacity="${f((inCentre(x) ? 0.3 : 0.5) + R() * 0.3)}"/>`, SW, SH);
  }
  for (const [x, y, r] of [[90, 60, 7], [230, 130, 5], [760, 40, 6], [900, 120, 8], [40, 200, 4], [700, 170, 4]])
    b += wrapPlace(x, y, r + 1, star4(r, '#ffffff', 0.7), SW, SH);
  // soft afterglow low in the sky
  b += wrapPlace(200, 470, 380, `<ellipse rx="380" ry="140" fill="url(#glow)"/>`, SW, SH);
  // rainbow: pastel bands, centred at (760, 560), outer radius 232 — top of the arc at y≈330, right of the centre
  const bands = ['#f3b1c6', '#f6c6ae', '#f2e2b6', '#c3e2c4', '#b8d6ee', '#c7bdea'];
  let rb = '';
  bands.forEach((c, i) => {
    const r = 232 - i * 9.5;
    rb += `<path d="M${-r} 0 A${r} ${r} 0 0 1 ${r} 0" stroke="${c}" stroke-width="10.5" fill="none"/>`;
  });
  b += wrapPlace(760, 560, 240, `<g opacity=".42">${rb}</g>`, SW, SH);
  // rose clouds hiding the rainbow's feet and the horizon
  for (const [x, y, rx, ry] of [[520, 500, 200, 80], [80, 510, 240, 70], [300, 520, 220, 60], [800, 520, 260, 70], [1080, 500, 200, 80], [700, 420, 120, 30]])
    b += wrapPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#soft)"/>`, SW, SH);
  b += wrapPlace(520, 470, 100, cloud(180, 50, '#f6e3ec', '#e2c8dc', 0.85, 9), SW, SH);
  b += wrapPlace(1080, 470, 100, cloud(190, 54, '#f6e3ec', '#e2c8dc', 0.85, 10), SW, SH);
  b += wrapPlace(160, 230, 90, cloud(150, 34, '#eadcf0', '#cdbde0', 0.45, 11), SW, SH);
  return svg(SW, SH, b, defs);
}

// ======================================================================
// FAR (960x1080, transparent, tileable both ways). Décor mostly in the side thirds.
// ======================================================================
const FW = 960, FH = 1080;
const farPlace = (x, y, r, m) => wrapPlace(x, y, r, m, FW, FH, true);

// potting: far shelves of clay pots, hanging tools, faint pane frames
function farPotting() {
  let b = '';
  const pot = (w, h, c, cs) => `<path d="M${-w / 2} ${-h} H${w / 2} L${w * 0.36} 0 H${-w * 0.36} Z" fill="${c}"/>` +
    `<rect x="${-w / 2 - 3}" y="${-h - 6}" width="${w + 6}" height="9" rx="3" fill="${cs}"/>`;
  const sprout = (h) => `<path d="M0 0 C -2 ${-h * 0.5}, 2 ${-h * 0.7}, 0 ${-h}" stroke="#86a894" stroke-width="2.5" fill="none"/>` +
    `<ellipse cx="-6" cy="${-h}" rx="7" ry="3.5" fill="#97b8a4" transform="rotate(-25 -6 ${-h})"/><ellipse cx="6" cy="${-h - 2}" rx="7" ry="3.5" fill="#97b8a4" transform="rotate(25 6 ${-h - 2})"/>`;
  const shelf = (w, seed) => {
    const R = rng(seed); let m = '';
    m += `<rect x="${-w / 2}" y="0" width="${w}" height="10" rx="3" fill="#bfae9a"/><rect x="${-w / 2}" y="8" width="${w}" height="4" fill="#a8977f"/>`;
    m += `<path d="M${-w / 2 + 16} 12 V28 H${-w / 2 + 34} M${w / 2 - 16} 12 V28 H${w / 2 - 34}" stroke="#a8977f" stroke-width="4" fill="none"/>`;
    let x = -w / 2 + 22;
    while (x < w / 2 - 22) {
      const pw = 26 + R() * 16, ph = 22 + R() * 14;
      m += `<g transform="translate(${f(x + pw / 2)} 0)">${R() < 0.6 ? `<g transform="translate(0 ${f(-ph - 4)})">${sprout(10 + R() * 14)}</g>` : ''}${pot(pw, ph, '#c6a597', '#d3b6a9')}</g>`;
      x += pw + 10 + R() * 12;
    }
    return `<g opacity=".62">${m}</g>`;
  };
  // faint glass-pane frames (soft white rectangles) behind the shelves
  const pane = (w, h) => `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="#ffffff" fill-opacity=".06" stroke="#ffffff" stroke-opacity=".22" stroke-width="4"/>` +
    `<path d="M0 ${-h / 2} V${h / 2} M${-w / 2} 0 H${w / 2}" stroke="#ffffff" stroke-opacity=".2" stroke-width="3"/>`;
  b += farPlace(130, 420, 110, pane(180, 260)) + farPlace(840, 900, 110, pane(170, 250)) + farPlace(860, 300, 90, pane(140, 200));
  b += farPlace(140, 230, 140, shelf(240, 1)) + farPlace(830, 520, 140, shelf(230, 2)) + farPlace(110, 800, 130, shelf(210, 3)) + farPlace(860, 1010, 140, shelf(220, 4));
  // hanging tools on hooks: trowel, little fork, a watering can (grey-blue)
  const ink = '#8a9fae';
  const trowel = `<path d="M0 -40 V-6" stroke="${ink}" stroke-width="3"/><rect x="-4" y="-6" width="8" height="24" rx="4" fill="#a69481"/><path d="M-10 18 H10 L0 48 Z" fill="${ink}"/>`;
  const fork = `<path d="M0 -40 V-6" stroke="${ink}" stroke-width="3"/><rect x="-4" y="-6" width="8" height="24" rx="4" fill="#a69481"/><path d="M-9 18 H9 M-8 18 V44 M0 18 V46 M8 18 V44" stroke="${ink}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
  const can = `<path d="M0 -40 V-24" stroke="${ink}" stroke-width="3"/><path d="M-22 -10 H22 V22 C 22 28, -22 28, -22 22 Z" fill="${ink}"/><path d="M-14 -10 C -14 -30, 14 -30, 14 -10" stroke="${ink}" stroke-width="5" fill="none"/><path d="M20 10 L44 -10" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><ellipse cx="46" cy="-12" rx="6" ry="4" fill="${ink}"/>`;
  const rail = w => `<path d="M${-w / 2} -40 H${w / 2}" stroke="#a69481" stroke-width="5" stroke-linecap="round"/>`;
  b += farPlace(820, 140, 90, `<g opacity=".55">${rail(150)}<g transform="translate(-45 0)">${trowel}</g><g transform="translate(0 0)">${fork}</g><g transform="translate(40 0)">${trowel}</g></g>`);
  b += farPlace(160, 600, 80, `<g opacity=".55">${rail(110)}<g transform="translate(-10 0)">${can}</g></g>`);
  // a couple of tiny faint pots near the calm centre so it isn't empty
  b += farPlace(380, 700, 30, `<g opacity=".3">${pot(30, 24, '#c6a597', '#d3b6a9')}</g>`) + farPlace(600, 140, 30, `<g opacity=".28">${pot(26, 22, '#c6a597', '#d3b6a9')}</g>`);
  return svg(FW, FH, b);
}

// fern: hanging fern fronds from little baskets, mist clouds
function frond(len, ang, c, seed) {
  // quadratic curve from (0,0) hanging down and out
  // arches out and slightly up from the basket, then droops down (Boston fern)
  const R = rng(seed), sg = ang < 0 ? -1 : 1, out = len * (0.12 + 0.55 * Math.abs(Math.sin(ang)));
  const ex = sg * out, ey = len * (0.95 - 0.35 * Math.abs(Math.sin(ang))), cx = sg * out * 1.05, cy = -len * 0.12 * Math.abs(Math.sin(ang));
  const pt = t => [(1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * cx + t * t * ex, 2 * (1 - t) * t * cy + t * t * ey];
  const tan = t => [2 * (1 - t) * cx + 2 * t * (ex - cx), 2 * (1 - t) * cy + 2 * t * (ey - cy)];
  let d = 'M0 0', lf = '';
  for (let t = 0.05; t <= 1.001; t += 0.05) { const [x, y] = pt(t); d += ` L${f(x)} ${f(y)}`; }
  for (let t = 0.12; t < 0.97; t += 0.075) {
    const [x, y] = pt(t), [tx, ty] = tan(t), a = Math.atan2(ty, tx) * 180 / Math.PI, s = len * 0.11 * (1 - t * 0.75) + 2;
    for (const side of [-1, 1]) {
      const rot = a + side * (62 + R() * 10);
      lf += `<ellipse transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) translate(${f(s)} 0)" rx="${f(s)}" ry="${f(s * 0.34)}"/>`;
    }
  }
  return `<g fill="${c}"><path d="${d}" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round"/>${lf}</g>`;
}
function farFern() {
  const defs = radial('mist', '#f4fbf7', 0.8, 0, [0.5, 0.45]);
  let b = '';
  // mist clouds (some in the centre, very soft)
  for (const [x, y, rx, ry] of [[480, 260, 200, 46], [470, 820, 220, 50], [120, 540, 200, 60], [860, 120, 190, 54], [880, 700, 200, 56], [200, 980, 180, 50]])
    b += farPlace(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#mist)"/>`);
  const hang = (seed, k, s) => {
    const R = rng(seed);
    let m = `<path d="M0 -70 V-10" stroke="#7e9a90" stroke-width="2"/>` +
      `<path d="M-26 -12 H26 C 24 6, 14 14, 0 14 C -14 14, -24 6, -26 -12 Z" fill="#a1b8ae"/><path d="M-26 -12 H26" stroke="#8aa69a" stroke-width="4" stroke-linecap="round"/>`;
    const cols = ['#6ea78e', '#7fb39b', '#8cc0a8'];
    for (let i = 0; i < k; i++) {
      const ang = (-1.2 + 2.4 * (i / (k - 1))) * (0.85 + R() * 0.2), len = (110 + R() * 70) * s;
      m = `<g transform="translate(0 -8)">${frond(len, ang, cols[i % 3], seed * 10 + i)}</g>` + m;
    }
    return `<g opacity=".62">${m}</g>`;
  };
  b += farPlace(130, 90, 220, hang(1, 6, 1.0)) + farPlace(850, 420, 220, hang(2, 5, 1.05)) + farPlace(170, 660, 200, hang(3, 5, 0.9)) + farPlace(820, 880, 210, hang(4, 6, 0.95));
  // a few lone fronds growing up from the bottom corners of each tile half
  // drops of water hanging from fronds' tips (pale blue, tiny)
  for (const [x, y] of [[60, 300], [210, 270], [900, 600], [770, 640], [240, 830]])
    b += farPlace(x, y, 6, `<path d="M0 -5 C 3 0, 4 3, 0 5 C -4 3, -3 0, 0 -5 Z" fill="#e6f4f2" opacity=".7"/>`);
  return svg(FW, FH, b, defs);
}

// balcony: railings with orchid pots, open umbrellas
function farBalcony() {
  let b = '';
  const rail = w => {
    let m = `<rect x="${-w / 2}" y="-6" width="${w}" height="8" rx="4" fill="#dad9ea"/><rect x="${-w / 2}" y="54" width="${w}" height="6" rx="3" fill="#cfcee3"/>`;
    for (let x = -w / 2 + 10; x <= w / 2 - 6; x += 18) m += `<path d="M${x} 2 V54" stroke="#cfcee3" stroke-width="4"/><circle cx="${x}" cy="30" r="4" fill="none" stroke="#cfcee3" stroke-width="2"/>`;
    return m;
  };
  const orchid = (seed, c, cc) => {
    const R = rng(seed);
    let m = `<path d="M-14 0 H14 L10 22 H-10 Z" fill="#b3b1cf"/><rect x="-16" y="-4" width="32" height="7" rx="3" fill="#c3c1db"/>`;
    m += `<path d="M-8 -2 C -22 -6, -26 -14, -14 -12 Z M8 -2 C 22 -6, 26 -14, 14 -12 Z" fill="#94b4a6"/>`;
    const stem = `M0 -2 C 0 -40, 14 -60, 34 -62`;
    m += `<path d="${stem}" stroke="#93a596" stroke-width="2.5" fill="none"/>`;
    for (const [x, y, s] of [[6, -42, 0.8], [16, -56, 1], [30, -62, 0.9], [40, -56, 0.7]]) {
      let fl = '';
      for (let k = 0; k < 5; k++) fl += `<ellipse transform="rotate(${k * 72 + R() * 10}) translate(0 -5)" rx="${f(3.6 * s)}" ry="${f(6 * s)}" fill="${c}"/>`;
      m += `<g transform="translate(${x} ${y})">${fl}<circle r="${f(2.4 * s)}" fill="${cc}"/></g>`;
    }
    return m;
  };
  const umbrella = (r, c, cs, tilt) => {
    let ribs = '', canopy = `M${-r} 0 A${r} ${r * 0.8} 0 0 1 ${r} 0`;
    const n = 4, sc = r / n / 2;
    for (let i = 0; i < n; i++) canopy += ` A${f(sc * 2 / 2)} ${f(sc)} 0 0 0 ${f(r - (i + 1) * (2 * r / n))} 0`;
    for (let i = 1; i < n; i++) ribs += `<path d="M0 ${-r * 0.8} Q${f((-r + i * 2 * r / n) * 0.7)} ${f(-r * 0.5)} ${f(-r + i * 2 * r / n)} 0" stroke="${cs}" stroke-width="2" fill="none"/>`;
    return `<g transform="rotate(${tilt})"><path d="${canopy} Z" fill="${c}"/>${ribs}<path d="M0 0 V${r * 0.95} a8 8 0 0 1 -16 0" stroke="#9c9ab8" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M0 ${-r * 0.8} v-8" stroke="#9c9ab8" stroke-width="3" stroke-linecap="round"/></g>`;
  };
  // left/right railings with orchids standing on them
  const seg = (w, seeds) => `<g opacity=".78">${rail(w)}` + seeds.map(([dx, s, c, cc]) => `<g transform="translate(${dx} -6)">${orchid(s, c, cc)}</g>`).join('') + `</g>`;
  b += farPlace(130, 300, 150, seg(250, [[-70, 1, '#d9a9c9', '#f4dbe8'], [40, 2, '#bfa8dc', '#ece2f7']]));
  b += farPlace(840, 620, 150, seg(240, [[-50, 3, '#e0b3cf', '#f7e3ee'], [60, 4, '#c4b0e0', '#efe7fa']]));
  b += farPlace(150, 940, 150, seg(230, [[10, 5, '#cfa6d6', '#f2e2f5']]));
  // umbrellas (pastel, tilted, drifting)
  b += farPlace(860, 160, 80, `<g opacity=".6">${umbrella(52, '#a9c4d6', '#8ea9bd', -14)}</g>`);
  b += farPlace(100, 640, 80, `<g opacity=".6">${umbrella(46, '#c7b4dc', '#a998c3', 12)}</g>`);
  b += farPlace(880, 950, 70, `<g opacity=".55">${umbrella(40, '#b7d3c8', '#98b7aa', -8)}</g>`);
  // a few orchid petals floating gently in the centre (faint)
  for (const [x, y, r] of [[420, 470, 30], [560, 860, -40], [520, 130, 70]])
    b += farPlace(x, y, 10, `<ellipse transform="rotate(${r})" rx="4" ry="7" fill="#e3c6de" opacity=".35"/>`);
  return svg(FW, FH, b);
}

// roof: chimney pots, distant tree tops, soft lilac/peach glows
function farRoof() {
  const defs = radial('gl', '#f4ecff', 0.75, 0, [0.4, 0.35]) + radial('gp', '#ffe6e0', 0.6, 0, [0.4, 0.3]);
  let b = '';
  for (const [x, y, r, g] of [[110, 180, 120, 'gl'], [850, 470, 110, 'gp'], [160, 760, 110, 'gp'], [830, 980, 120, 'gl'], [480, 600, 90, 'gl']])
    b += farPlace(x, y, r, `<circle r="${r}" fill="url(#${g})"/>`);
  const trees = (w, seed, c) => {
    const R = rng(seed); let m = '';
    for (let x = -w / 2 + 30; x < w / 2 - 20; x += 36 + R() * 18) { const r = 26 + R() * 20; m += `<circle cx="${f(x)}" cy="${f(-r * 0.6)}" r="${f(r)}"/>`; }
    let trunks = '';
    for (let x = -w / 2 + 40; x < w / 2 - 30; x += 60) trunks += `<rect x="${x}" y="-14" width="6" height="22" fill="#8e86ad"/>`;
    return `<g>${trunks}<g fill="${c}">${m}</g><path d="M${-w / 2 + 4} 8 H${w / 2 - 4} L${w / 2 - 14} 34 H${-w / 2 + 14} Z" fill="#b2a9cc"/><rect x="${-w / 2}" y="4" width="${w}" height="8" rx="3" fill="#c3bbd9"/></g>`;
  };
  const chim = (k, seed) => {
    const R = rng(seed);
    const w = 30 + k * 26;
    const rw = w + 120;
    let m = `<path d="M${-rw / 2} 40 L${-rw / 2 + 50} -10 H${rw / 2 - 50} L${rw / 2} 40 Z" fill="#b6aed0"/>` +
      [0, 1, 2].map(k => `<path d="M${-rw / 2 + 50 - k * 16} ${6 + k * 16 - 16} H${rw / 2 - 50 + k * 16}" stroke="#a49cc2" stroke-width="2.5"/>`).join('') +
      `<rect x="${-w / 2}" y="-70" width="${w}" height="70" fill="#aaa2c6"/><rect x="${-w / 2 - 5}" y="-76" width="${w + 10}" height="10" rx="2" fill="#bdb6d6"/>`;
    for (let y = -56; y < 6; y += 14) m += `<path d="M${-w / 2} ${y} H${w / 2}" stroke="#9a92b8" stroke-width="2"/>`;
    for (let i = 0; i < k; i++) {
      const x = -w / 2 + 15 + i * 26, h = 18 + R() * 12;
      m += `<path d="M${x - 9} -76 L${x - 7} ${-76 - h} H${x + 7} L${x + 9} -76 Z" fill="#b8a5c4"/><rect x="${x - 10}" y="${-80 - h}" width="20" height="6" rx="2" fill="#c8b6d2"/>`;
    }
    return m;
  };
  b += farPlace(120, 420, 160, `<g opacity=".55">${trees(240, 1, '#a3a6cc')}</g>`);
  b += farPlace(850, 760, 160, `<g opacity=".55">${trees(220, 2, '#a7a9cf')}</g>`);
  b += farPlace(830, 230, 150, `<g opacity=".6">${chim(3, 3)}</g>`) + farPlace(140, 940, 130, `<g opacity=".6">${chim(2, 4)}</g>`);
  // a tiny weather vane cockerel-free arrow on a chimney (white)
  b += farPlace(70, 560, 40, `<g opacity=".55" stroke="#e9e4f5" stroke-width="3" fill="none" stroke-linecap="round"><path d="M0 30 V-20 M-22 -10 H22 M14 -16 L22 -10 L14 -4"/><circle cy="-24" r="4" fill="#e9e4f5"/></g>`);
  // soft lilac stars (not yellow) in the sides
  const R = rng(55);
  for (let i = 0; i < 18; i++) {
    let x = R() * FW; if (inCentre(x)) x += x < 480 ? -220 : 220;
    b += farPlace(x, R() * FH, 6, star4(3 + R() * 3, R() < 0.5 ? '#ffffff' : '#e8defc', f(0.45 + R() * 0.3)));
  }
  return svg(FW, FH, b, defs);
}

// ======================================================================
// GROUND (1280x420): ground line y = 330 = world y 0 — the greenhouse entrance floor
// ======================================================================
function ground() {
  const GL = 330;
  const defs = vgrad('brick', [[0, '#b58d7c'], [1, '#8f6c5f']]) + vgrad('glass', [[0, '#bccbd6'], [1, '#dbe5ea']]) +
    vgrad('water', [[0, '#cfe4ee'], [1, '#a9c9d8']]) + vgrad('wain', [[0, '#e4e9e8'], [1, '#cfd8d7']]);
  let b = '';
  // low painted wainscot wall behind the floor (opaque from y 296)
  b += `<rect x="0" y="296" width="1280" height="${GL - 296 + 2}" fill="url(#wain)"/>`;
  b += `<rect x="0" y="290" width="1280" height="8" rx="3" fill="#f1f4f3" stroke="#a9b5b6" stroke-width="2"/>`;
  for (let x = 40; x < 1280; x += 80) b += `<path d="M${x} 300 V${GL}" stroke="#b9c4c4" stroke-width="2"/>`;
  // glass door on the right with rain outside
  const dx = 960, dw = 210, dt = 60;
  b += `<g stroke="#8d9ea3" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M${dx} ${GL} V${dt + 60} A${dw / 2} 60 0 0 1 ${dx + dw} ${dt + 60} V${GL} Z" fill="url(#glass)"/></g>`;
  // garden outside the glass
  b += `<path d="M${dx + 4} 260 C ${dx + 50} 230, ${dx + 120} 240, ${dx + dw - 4} 220 V${GL} H${dx + 4} Z" fill="#a9c3ad" opacity=".8"/>`;
  b += `<circle cx="${dx + 60}" cy="220" r="34" fill="#9bb9a3" opacity=".8"/><circle cx="${dx + 150}" cy="200" r="42" fill="#93b29c" opacity=".7"/>`;
  const R = rng(9);
  for (let i = 0; i < 26; i++) {
    const x = dx + 12 + R() * (dw - 24), y = dt + 40 + R() * 200;
    b += `<path d="M${f(x)} ${f(y)} l-4 18" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
  }
  // door frame (white iron) with glazing bars and a brass-free grey handle
  b += `<g stroke="#f4f6f5" stroke-width="10" fill="none" stroke-linejoin="round"><path d="M${dx} ${GL} V${dt + 60} A${dw / 2} 60 0 0 1 ${dx + dw} ${dt + 60} V${GL}"/>` +
    `<path d="M${dx + dw / 2} ${dt} V${GL} M${dx} 200 H${dx + dw}" stroke-width="7"/></g>`;
  b += `<g stroke="#8d9ea3" stroke-width="2" fill="none"><path d="M${dx - 5} ${GL} V${dt + 60} A${dw / 2 + 5} 65 0 0 1 ${dx + dw + 5} ${dt + 60} V${GL}"/></g>`;
  b += `<rect x="${dx + dw / 2 + 10}" y="226" width="7" height="26" rx="3" fill="#7d8b94"/>`;
  // big potted plants beside the door
  const bigPot = (x, s, leaf) => `<g transform="translate(${x} ${GL}) scale(${s})" stroke="#7a3f25" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M-30 -56 H30 L22 0 H-22 Z" fill="#c9764e"/><rect x="-34" y="-64" width="68" height="12" rx="4" fill="#dc8b62"/>` +
    `<g stroke="#2f6a3e">${[-50, -20, 10, 40].map(a => `<path transform="translate(0 -62) rotate(${a})" d="M0 0 C -16 -40, -6 -90, 0 -110 C 6 -90, 16 -40, 0 0 Z" fill="${leaf}"/>`).join('')}</g></g>`;
  b += bigPot(1222, 0.9, '#5aa565') + bigPot(915, 0.62, '#4f9a5e');
  // potting bench on the left with pots, a sack and a hanging trowel
  b += `<g stroke="#5e4330" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="50" y="210" width="300" height="16" rx="3" fill="#b98552"/><rect x="50" y="222" width="300" height="6" fill="#8a5a33" stroke="none"/>` +
    `<rect x="66" y="226" width="14" height="${GL - 226}" fill="#9c6c40"/><rect x="320" y="226" width="14" height="${GL - 226}" fill="#9c6c40"/>` +
    `<rect x="66" y="284" width="268" height="10" rx="3" fill="#a87545"/>` +
    `<rect x="50" y="110" width="12" height="104" fill="#9c6c40"/><rect x="50" y="110" width="300" height="10" rx="3" fill="#b98552"/></g>`;
  const pot = (x, y, w, h) => `<g stroke="#8e4527" stroke-width="2.5" stroke-linejoin="round"><path d="M${x - w / 2} ${y - h} H${x + w / 2} L${x + w * 0.35} ${y} H${x - w * 0.35} Z" fill="#d9774a"/>` +
    `<rect x="${x - w / 2 - 3}" y="${y - h - 6}" width="${w + 6}" height="9" rx="3" fill="#f09a6c"/></g>`;
  const seedl = (x, y) => `<path d="M${x} ${y} C ${x - 2} ${y - 10}, ${x + 2} ${y - 14}, ${x} ${y - 20}" stroke="#3f8a45" stroke-width="2.5" fill="none"/><ellipse cx="${x - 6}" cy="${y - 20}" rx="7" ry="3.5" fill="#5cb35a" transform="rotate(-25 ${x - 6} ${y - 20})"/><ellipse cx="${x + 6}" cy="${y - 22}" rx="7" ry="3.5" fill="#5cb35a" transform="rotate(25 ${x + 6} ${y - 22})"/>`;
  b += pot(110, 210, 42, 34) + seedl(110, 170) + pot(170, 210, 34, 28) + pot(226, 210, 46, 38) + seedl(226, 166) + pot(290, 210, 30, 26);
  b += pot(120, 110, 30, 24) + pot(260, 110, 34, 28) + seedl(260, 76);
  // stacked pots under the bench
  b += pot(130, 284, 40, 30) + pot(130, 258, 36, 8) + `<path d="M230 ${GL} C 226 300, 236 288, 262 288 C 288 288, 300 300, 296 ${GL} Z" fill="#c7b48e" stroke="#7f6b49" stroke-width="3"/>` +
    `<path d="M246 292 C 256 300, 270 300, 280 292" stroke="#7f6b49" stroke-width="2" fill="none"/>`;
  // a hanging trowel on the bench's back rail
  b += `<g stroke="#4f5a66" stroke-width="2"><path d="M300 120 V134"/><rect x="296" y="134" width="8" height="20" rx="4" fill="#b98552"/><path d="M290 154 H310 L300 182 Z" fill="#9aa8b4"/></g>`;
  // brick floor (opaque) — rows with staggered joints
  b += `<rect x="0" y="${GL}" width="1280" height="${420 - GL}" fill="url(#brick)"/>`;
  b += `<rect x="0" y="${GL - 2}" width="1280" height="8" fill="#c79d8a"/><path d="M0 ${GL + 6} H1280" stroke="#7d5c50" stroke-width="2"/>`;
  let rows = '';
  const rowsY = [GL + 6, GL + 26, GL + 50, GL + 78, 420];
  for (let i = 0; i < rowsY.length - 1; i++) {
    const y0 = rowsY[i], y1 = rowsY[i + 1], bw = 60 + i * 14, off = i % 2 ? bw / 2 : 0;
    rows += `<path d="M0 ${y1} H1280" stroke="#7d5c50" stroke-width="2" opacity=".7"/>`;
    for (let x = off; x < 1280; x += bw) rows += `<path d="M${f(x)} ${y0} V${y1}" stroke="#7d5c50" stroke-width="2" opacity=".6"/>`;
  }
  b += rows;
  for (let i = 0; i < 30; i++) b += `<rect x="${f(R() * 1260)}" y="${f(GL + 10 + R() * 70)}" width="${f(16 + R() * 20)}" height="4" rx="2" fill="#c49c8a" opacity=".45"/>`;
  // puddles on the floor
  const puddle = (x, y, rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${f(rx * 0.16)}" fill="url(#water)" stroke="#8fb0c0" stroke-width="2"/><path d="M${x - rx * 0.5} ${y - 1} h${f(rx * 0.35)}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
  b += puddle(560, GL + 22, 70) + puddle(760, GL + 46, 50) + puddle(1060, GL + 18, 60) + puddle(380, GL + 60, 40);
  // little rain boots (yellow-free: teal + white soles) — low, ≤ 60 px, in the centre
  const boot = (x, c, cd) => `<g transform="translate(${x} ${GL})" stroke="${cd}" stroke-width="3" stroke-linejoin="round"><path d="M-10 -46 H10 V-12 H26 C 30 -12, 32 -6, 30 0 H-10 Z" fill="${c}"/>` +
    `<rect x="-12" y="-50" width="24" height="7" rx="3" fill="${c}"/><path d="M-10 -4 H30" stroke="#f4f6f5" stroke-width="4"/><path d="M-5 -42 V-16" stroke="#ffffff" stroke-width="3" opacity=".5" stroke-linecap="round"/></g>`;
  b += boot(455, '#4c9fa8', '#2b6870') + boot(490, '#4c9fa8', '#2b6870');
  // watering can (slate grey-blue) — low, in the centre-right
  b += `<g transform="translate(810 ${GL})" stroke="#46566a" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M-26 -38 H22 V-4 C 22 0, -26 0, -26 -4 Z" fill="#8ea3b6"/><path d="M-18 -38 C -18 -58, 14 -58, 14 -38" fill="none" stroke-width="5"/>` +
    `<path d="M20 -14 L46 -40" stroke-width="7" stroke-linecap="round"/><path d="M20 -14 L46 -40" stroke="#8ea3b6" stroke-width="3" stroke-linecap="round"/>` +
    `<ellipse cx="49" cy="-43" rx="7" ry="4" fill="#8ea3b6" transform="rotate(-45 49 -43)"/><path d="M-18 -30 V-10" stroke="#c7d3dd" stroke-width="3" stroke-linecap="round"/></g>`;
  // a tiny snail-free pebble row and a few fallen leaves near the door
  b += `<ellipse cx="900" cy="${GL + 14}" rx="9" ry="4" fill="#5cb35a" transform="rotate(-20 900 ${GL + 14})"/><ellipse cx="1150" cy="${GL + 30}" rx="8" ry="3.5" fill="#4f9a5e" transform="rotate(25 1150 ${GL + 30})"/>`;
  return svg(1280, 420, b, defs);
}

// ======================================================================
// POLE (48x256, seamless vertically): white-painted iron pillar with climbing ivy
// ======================================================================
function pole() {
  const H = 256;
  let b = '';
  b += `<rect x="11" y="0" width="26" height="${H}" fill="#eef2f1"/>`;
  b += `<rect x="28" y="0" width="9" height="${H}" fill="#cfd9d8"/>`;
  b += `<rect x="14" y="0" width="4" height="${H}" fill="#ffffff"/>`;
  // fluting
  b += `<path d="M22 0 V${H} M26 0 V${H}" stroke="#d7dfde" stroke-width="1.5"/>`;
  b += `<path d="M11 0 V${H} M37 0 V${H}" stroke="#8b9ca0" stroke-width="3"/>`;
  // a decorative collar in the middle of the tile
  b += `<g stroke="#8b9ca0" stroke-width="2.5"><rect x="7" y="118" width="34" height="8" rx="3" fill="#f6f8f8"/><rect x="9" y="126" width="30" height="6" rx="2" fill="#dde4e3"/></g>`;
  // ivy vine: periodic, so it continues across the top/bottom edges
  let d = ''; for (let y = -8; y <= H + 8; y += 4) d += (y === -8 ? 'M' : 'L') + f(24 + 9 * Math.sin(2 * Math.PI * y / H)) + ' ' + y;
  b += `<path d="${d}" stroke="#3f6e48" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  // ivy leaf: 3-lobed heart shape
  const leaf = (s, flip, c) => `<g transform="scale(${flip ? -s : s} ${s}) rotate(-20)"><path d="M0 0 C 2 -6, 6 -10, 10 -8 C 12 -13, 18 -12, 17 -6 C 22 -4, 20 3, 14 3 C 12 8, 4 7, 0 0 Z" fill="${c}" stroke="#2f5a3a" stroke-width="1.6" stroke-linejoin="round"/><path d="M1 0 L13 -4" stroke="#2f5a3a" stroke-width="1" opacity=".7"/></g>`;
  const leaves = [[4, false, 1, '#5f9a63'], [40, true, 0.9, '#558f5b'], [78, false, 1.1, '#6aa56b'], [112, true, 1, '#5f9a63'],
    [150, false, 0.85, '#558f5b'], [190, true, 1.1, '#6aa56b'], [228, false, 0.95, '#5f9a63']];
  for (const [y, flip, s, c] of leaves) {
    const x = 24 + 9 * Math.sin(2 * Math.PI * y / H);
    b += wrapPlace(x, y, 20, leaf(s, flip, c), 48, H, true, false);
  }
  return svg(48, H, b);
}

// ======================================================================
// BEAM (960x48, tileable horizontally): white iron floor beam, rivets, hanging ivy
// ======================================================================
function beam() {
  const W = 960;
  let b = '';
  b += `<rect x="0" y="4" width="${W}" height="9" fill="#f4f7f6"/><rect x="0" y="27" width="${W}" height="9" fill="#e3e9e8"/>`;
  b += `<rect x="0" y="13" width="${W}" height="14" fill="#d6dedd"/>`;
  b += `<path d="M0 4 H${W} M0 36 H${W}" stroke="#8b9ca0" stroke-width="2.5"/><path d="M0 13 H${W} M0 27 H${W}" stroke="#a7b5b7" stroke-width="1.5"/>`;
  b += `<path d="M0 6.5 H${W}" stroke="#ffffff" stroke-width="2"/>`;
  // lattice web: round holes every 40 (24 per tile)
  for (let x = 20; x < W; x += 40) b += `<circle cx="${x}" cy="20" r="4.5" fill="#bccaca" stroke="#97a7aa" stroke-width="1.2"/>`;
  // rivets on both flanges every 20
  for (let x = 10; x < W; x += 20) b += `<circle cx="${x}" cy="8.5" r="1.8" fill="#c3cfcf"/><circle cx="${x}" cy="31.5" r="1.8" fill="#c3cfcf"/>`;
  // hanging ivy strands
  const ivy = (len, seed) => {
    const R = rng(seed); let d = 'M0 0', m = '';
    for (let y = 4; y <= len; y += 4) d += ` L${f(2 * Math.sin(y / 6))} ${y}`;
    m += `<path d="${d}" stroke="#3f6e48" stroke-width="1.8" fill="none"/>`;
    for (let y = 4; y <= len; y += 7) {
      const side = (y / 7) % 2 < 1 ? 1 : -1, c = R() < 0.5 ? '#5f9a63' : '#6aa56b';
      m += `<path transform="translate(${f(2 * Math.sin(y / 6))} ${y}) scale(${side * 1.3} 1.3)" d="M0 0 C 2 -3, 6 -4, 7 -1 C 8 2, 4 4, 0 0 Z" fill="${c}" stroke="#2f5a3a" stroke-width="1"/>`;
    }
    return m;
  };
  for (const [x, len, s] of [[60, 12, 1], [72, 8, 2], [250, 11, 3], [430, 8, 4], [610, 12, 5], [622, 8, 6], [820, 11, 7], [950, 9, 8]])
    b += wrapPlace(x, 34, 16, ivy(len, s), W, 48, false);
  return svg(W, 48, b);
}

// ======================================================================
// PARTICLES (0 0 32 32 unless stated, centred, transparent edges; never yellow except glow)
// ======================================================================
const P32 = b => svg(32, 32, b);
const particles = {
  raindrop: svg(8, 32, `<defs>${vgrad('r', [[0, '#e6f3ff', 0], [0.6, '#dcefff', 0.7], [1, '#f4faff', 0.95]])}</defs><path d="M4 1 C 5 10, 6 22, 6 27 A2 2 0 0 1 2 27 C 2 22, 3 10, 4 1 Z" fill="url(#r)"/>`),
  drip: P32(`<path d="M16 4 C 20 11, 25 16, 25 21 A9 9 0 0 1 7 21 C 7 16, 12 11, 16 4 Z" fill="#cfe6f4" stroke="#8fb6cd" stroke-width="2" stroke-linejoin="round"/><path d="M11 20 C 11 17, 13 14, 14 13" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),
  splash: P32(`<g fill="#e3f2fb" stroke="#a9c9da" stroke-width="1.2"><ellipse cx="16" cy="26" rx="11" ry="3" fill="#d4e9f5" opacity=".8"/><path d="M8 25 C 7 19, 5 16, 4 14 C 7 16, 10 20, 11 25 Z"/><path d="M14 24 C 14 18, 14 14, 15 11 C 17 14, 17 18, 17 24 Z"/><path d="M21 25 C 22 20, 25 16, 28 14 C 27 17, 25 21, 24 25 Z"/></g><circle cx="6" cy="9" r="1.8" fill="#eaf6fd"/><circle cx="16" cy="6" r="1.6" fill="#eaf6fd"/><circle cx="26" cy="9" r="1.8" fill="#eaf6fd"/>`),
  mist: svg(32, 32, `<defs>${radial('m', '#f2fbf8', 0.85, 0, [0.5, 0.5])}</defs><circle cx="16" cy="16" r="16" fill="url(#m)"/><circle cx="12" cy="17" r="7" fill="#f4fbf9" opacity=".35"/><circle cx="20" cy="15" r="6" fill="#eaf6f3" opacity=".35"/>`),
  petal: P32(`<path d="M16 5 C 24 9, 25 20, 16 27 C 7 20, 8 9, 16 5 Z" fill="#f2a9cf" stroke="#c97aa8" stroke-width="2" stroke-linejoin="round"/><path d="M16 21 C 13 19, 13 15, 16 13 C 19 15, 19 19, 16 21 Z" fill="#c792d8" opacity=".7"/><path d="M14 9 C 12 12, 12 15, 13 17" stroke="#fff0f6" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`),
  leafbit: P32(`<path d="M6 25 C 6 14, 14 6, 26 6 C 26 18, 18 26, 6 25 Z" fill="#7cc07a" stroke="#3f7f45" stroke-width="2" stroke-linejoin="round"/><path d="M7 25 L 22 10" stroke="#3f7f45" stroke-width="1.6" stroke-linecap="round"/><path d="M10 19 C 11 14, 15 10, 20 9" stroke="#c9ebc4" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>`),
  sparkle: P32(`<path d="M16 2 Q18 14 30 16 Q18 18 16 30 Q14 18 2 16 Q14 14 16 2 Z" fill="#ffffff"/><circle cx="16" cy="16" r="3" fill="#ffffff"/>`),
  glow: svg(32, 32, `<defs><radialGradient id="gl"><stop offset="0" stop-color="#fffbd0" stop-opacity="1"/><stop offset=".3" stop-color="#fff27a" stop-opacity=".85"/><stop offset=".65" stop-color="#ffd23f" stop-opacity=".3"/><stop offset="1" stop-color="#ffb627" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#gl)"/>`),
  soil: P32(`<g stroke="#4a2f20" stroke-width="1.4" stroke-linejoin="round"><path d="M9 14 L14 11 L17 15 L13 19 L8 18 Z" fill="#6b4532"/><path d="M18 19 L23 17 L25 22 L20 24 Z" fill="#5b3a29"/><path d="M12 22 L15 21 L16 25 L12 25 Z" fill="#7a5340"/></g><circle cx="21" cy="11" r="1.8" fill="#6b4532"/><circle cx="11" cy="15" r="1" fill="#9a7560"/>`),
  puff: P32(`<g fill="#d7defa"><circle cx="11" cy="19" r="7"/><circle cx="21" cy="19" r="7"/><circle cx="16" cy="15" r="8"/></g><g fill="#ffffff"><circle cx="11" cy="17" r="6.5"/><circle cx="21" cy="17" r="6.5"/><circle cx="16" cy="13" r="7.5"/></g><circle cx="13" cy="11" r="2" fill="#ffffff"/>`),
  bubble: P32(`<circle cx="16" cy="16" r="11" fill="#e8f4fa" fill-opacity=".25" stroke="#d6ecf6" stroke-width="2.4"/><circle cx="16" cy="16" r="11" fill="none" stroke="#b9d3e6" stroke-width="1" opacity=".7"/><path d="M10 12 A7 7 0 0 1 15 8.5" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="21" cy="21" r="1.6" fill="#ffffff" opacity=".8"/>`)
};

// ---------- write ----------
const skies = { potting: skyPotting, fern: skyFern, balcony: skyBalcony, roof: skyRoof };
const fars = { potting: farPotting, fern: farFern, balcony: farBalcony, roof: farRoof };
for (const w of Object.keys(skies)) {
  write(`levels/${w}/sky.svg`, skies[w]());
  write(`levels/${w}/far.svg`, fars[w]());
}
write('levels/ground.svg', ground());
write('levels/pole.svg', pole());
write('levels/beam.svg', beam());
write('levels/palette.json', JSON.stringify(PALETTE, null, 2) + '\n');
for (const [n, s] of Object.entries(particles)) write(`particles/${n}.svg`, s);
console.log('environment art written to ' + OUT);
