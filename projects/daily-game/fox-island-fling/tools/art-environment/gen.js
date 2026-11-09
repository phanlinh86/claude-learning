#!/usr/bin/env node
// Environment art generator for Finn's Island Fling (original, hand-written SVG; no deps).
// Writes into game/assets/default/:
//   levels/<zone>/sky.svg   960x540  daytime gradient + soft clouds (no sun/moon/stars)
//   levels/<zone>/far.svg   960x300  distant islands on the horizon line y 300, tileable, transparent above
//   levels/<zone>/near.svg  960x200  nearer details on the horizon line y 200, tileable
//   levels/sea.svg          960x240  water from the surface line y 20 down, tileable
//   rock.svg                480x220  beach rock + sand for the slingshot (top surface y 40, waterline y 160)
//   levels/palette.json     per zone colours (+ "lights": glow spots in near/far art coords for the night)
//   particles/*.svg         32x32 sprites
// zones: cove | jungle | lagoon | lantern.  Contract: docs/DESIGN.md §2–§4.  Usage: node gen.js [assetsDir]
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
// darker shade of a colour (outline rule: never black, always a darker version of the fill)
function dk(hex, k = 0.78) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
function lt(hex, k = 0.3) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k));
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
// periodic ridge: y(x) = base - h(x); every term has an integer number of periods over W -> seamless
function ridge(W, base, terms, bottom, step = 6) {
  let d = '';
  for (let x = 0; x <= W; x += step) {
    let y = base;
    for (const [amp, n, ph, pow] of terms) {
      const s = Math.sin(Math.PI * 2 * n * x / W + ph);
      y -= pow ? amp * Math.pow(Math.abs(s), pow) : amp * s;
    }
    d += (x ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d + `L${W} ${bottom} L0 ${bottom} Z`;
}
// ridge drawn 3x wide (from -W to 2W) so its outline stroke has no break at the tile edge, then clipped by the viewBox
function ridgeWide(W, base, terms, bottom, step = 6) {
  let d = '';
  for (let x = -W; x <= 2 * W; x += step) {
    let y = base;
    for (const [amp, n, ph, pow] of terms) {
      const s = Math.sin(Math.PI * 2 * n * x / W + ph);
      y -= pow ? amp * Math.pow(Math.abs(s), pow) : amp * s;
    }
    d += (x === -W ? 'M' : 'L') + f(x) + ' ' + f(y);
  }
  return d + `L${2 * W} ${bottom + 10} L${-W} ${bottom + 10} Z`;
}

// a picture-book cloud: row of puffs on a flat base + a flat underside band (one-step shading)
function cloud(w, h, fill, under, opacity, seed = 1) {
  const R = rng(seed), n = Math.max(3, Math.round(w / (h * 0.8)));
  let top = '', bot = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), bump = Math.sin(t * Math.PI);
    const cx = -w / 2 + h * 0.45 + t * (w - h * 0.9), r = h * (0.34 + 0.3 * bump + 0.08 * R()), cy = h * 0.16 - bump * h * 0.24;
    top += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
    bot += `<circle cx="${f(cx)}" cy="${f(cy + h * 0.12)}" r="${f(r)}"/>`;
  }
  const base = (dy) => `<rect x="${f(-w / 2 + h * 0.2)}" y="${f(h * 0.02 + dy)}" width="${f(w - h * 0.4)}" height="${f(h * 0.42)}" rx="${f(h * 0.21)}"/>`;
  return `<g opacity="${opacity}"><g fill="${under}">${bot}${base(h * 0.12)}</g><g fill="${fill}">${top}${base(0)}</g></g>`;
}
// long thin streak cloud (golden-hour / pastel skies)
function streak(w, h, fill, under, a) {
  return `<g opacity="${a}"><rect x="${f(-w / 2 + 8)}" y="${f(-h / 2 + h * 0.45)}" width="${f(w - 16)}" height="${f(h)}" rx="${f(h / 2)}" fill="${under}"/>` +
    `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${fill}"/>` +
    `<rect x="${f(-w / 2 + w * 0.2)}" y="${f(-h / 2 - h * 0.85)}" width="${f(w * 0.42)}" height="${f(h)}" rx="${f(h / 2)}" fill="${fill}"/></g>`;
}

// ---------- palette ----------
// skyTop/skyBottom: day sky; sea: water tint; ink: HUD/text colour on this zone; bar: HUD panel colour;
// nightTop/nightBottom: the night sky the renderer fades to.  lights: glow spots [x, y, r] in near/far art px.
const PALETTE = {
  cove:    { skyTop: '#86c6e6', skyBottom: '#e8f5f6', sea: '#3fb2b6', ink: '#1f4b5c', bar: '#fff6df', nightTop: '#141d44', nightBottom: '#2f4a7a' },
  jungle:  { skyTop: '#8fbfcc', skyBottom: '#e5efe0', sea: '#38a69f', ink: '#1f4a3e', bar: '#f4f8e8', nightTop: '#111c38', nightBottom: '#284a63' },
  lagoon:  { skyTop: '#a3bfe8', skyBottom: '#f7e4ea', sea: '#4cbfc6', ink: '#3f3a66', bar: '#fff1f4', nightTop: '#1a1a46', nightBottom: '#3e3f78' },
  lantern: { skyTop: '#8ea7d3', skyBottom: '#f3dac8', sea: '#3497ad', ink: '#3a2f55', bar: '#fff1dc', nightTop: '#100f33', nightBottom: '#33305f' }
};
const LIGHTS = { cove: { near: [], far: [] }, jungle: { near: [], far: [] }, lagoon: { near: [], far: [] }, lantern: { near: [], far: [] } };

// ======================================================================
// SKIES (960x540, opaque)
// ======================================================================
const SW = 960, SH = 540;
function skyBase(z, mid) {
  const P = PALETTE[z];
  return [vgrad('g', [[0, P.skyTop], [0.55, mid], [1, P.skyBottom]]), `<rect width="${SW}" height="${SH}" fill="url(#g)"/>`];
}
function skyCove() {
  const [g, bg] = skyBase('cove', '#b8def0');
  let defs = g + radial('haze', '#ffffff', 0.7, [0.5, 0.4]);
  let b = bg;
  b += wrap(150, 104, 100, cloud(180, 52, '#ffffff', '#d6eaf4', 0.9, 2));
  b += wrap(560, 64, 130, cloud(230, 60, '#ffffff', '#d6eaf4', 0.85, 5));
  b += wrap(830, 176, 90, cloud(140, 40, '#ffffff', '#d9ecf5', 0.75, 9));
  b += wrap(380, 236, 60, cloud(90, 26, '#ffffff', '#dcedf5', 0.55, 4));
  for (const [x, y, rx, ry] of [[80, 470, 260, 60], [420, 490, 300, 60], [790, 470, 260, 60]])
    b += wrap(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#haze)"/>`);
  return svg(SW, SH, b, defs);
}
function skyJungle() {
  const [g, bg] = skyBase('jungle', '#c3ddd8');
  let defs = g + radial('mist', '#f4f8f0', 0.75, [0.5, 0.45]);
  let b = bg;
  // humid haze bands, then two tall rounded clouds (calm, low contrast)
  for (const [x, y, rx, ry] of [[200, 180, 320, 36], [720, 140, 300, 30], [480, 330, 360, 40], [60, 420, 280, 50], [860, 440, 280, 50]])
    b += wrap(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#mist)"/>`);
  b += wrap(270, 90, 110, cloud(200, 66, '#f7faf4', '#d7e7df', 0.8, 12));
  b += wrap(740, 60, 80, cloud(140, 50, '#f7faf4', '#d7e7df', 0.7, 13));
  b += wrap(560, 220, 60, cloud(100, 30, '#f7faf4', '#dbe9e1', 0.5, 14));
  return svg(SW, SH, b, defs);
}
function skyLagoon() {
  const [g, bg] = skyBase('lagoon', '#d4d4ef');
  let defs = g + radial('haze', '#fff4f7', 0.7, [0.5, 0.4]);
  let b = bg;
  // pastel cotton-candy clouds: pink undersides
  b += wrap(180, 80, 80, cloud(150, 44, '#fffafc', '#f0d3e1', 0.85, 21));
  b += wrap(640, 120, 120, cloud(210, 54, '#fffafc', '#efd0e0', 0.8, 22));
  b += wrap(880, 50, 60, cloud(100, 30, '#fffafc', '#f0d6e3', 0.65, 23));
  b += wrap(420, 200, 150, streak(300, 12, '#fff4f8', '#efcfe0', 0.6));
  b += wrap(100, 270, 120, streak(240, 10, '#fff4f8', '#efcfe0', 0.5));
  b += wrap(760, 300, 130, streak(260, 10, '#fff4f8', '#efcfe0', 0.5));
  for (const [x, y, rx, ry] of [[160, 480, 260, 60], [560, 495, 300, 60], [900, 480, 220, 60]])
    b += wrap(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#haze)"/>`);
  return svg(SW, SH, b, defs);
}
function skyLantern() {
  const [g, bg] = skyBase('lantern', '#c6c3dc');
  let defs = g + radial('haze', '#fff1e4', 0.7, [0.5, 0.4]);
  let b = bg;
  // long golden-hour streaks with peach undersides
  const S = [[260, 70, 360, 13, 0.75], [760, 50, 300, 11, 0.7], [520, 150, 380, 12, 0.6], [80, 200, 280, 10, 0.55], [860, 230, 260, 10, 0.5], [380, 290, 300, 9, 0.45]];
  for (const [x, y, w, h, a] of S) b += wrap(x, y, w / 2 + 2, streak(w, h, '#fbf3ef', '#efcdb9', a));
  for (const [x, y, rx, ry] of [[140, 480, 260, 60], [520, 500, 300, 60], [880, 480, 240, 60]])
    b += wrap(x, y, rx, `<ellipse rx="${rx}" ry="${ry}" fill="url(#haze)"/>`);
  return svg(SW, SH, b, defs);
}

// ======================================================================
// SHARED PROPS
// ======================================================================
// palm tree: base at (0,0), height h, lean (px at top); fronds muted (never the bright leaf green)
function palm(h, lean, C, seed = 1, sw = 7) {
  const R = rng(seed), tx = lean, ty = -h;
  const trunk = `M0 0 Q ${f(lean * 0.15)} ${f(-h * 0.55)} ${f(tx)} ${f(ty)}`;
  let b = `<path d="${trunk}" stroke="${dk(C.trunk, 0.72)}" stroke-width="${sw + 4}" fill="none" stroke-linecap="round"/>` +
    `<path d="${trunk}" stroke="${C.trunk}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  // trunk rings
  for (let i = 1; i < 6; i++) {
    const t = i / 6, x = 2 * (1 - t) * t * lean * 0.15 + t * t * tx, y = 2 * (1 - t) * t * (-h * 0.55) + t * t * ty;
    b += `<path d="M${f(x - sw / 2)} ${f(y + 1)} l${f(sw)} -2" stroke="${dk(C.trunk, 0.8)}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  const frond = (ang, L, droop) => {
    const p = `M0 0 C ${f(L * 0.3)} ${f(-L * 0.28)}, ${f(L * 0.75)} ${f(-L * 0.12)}, ${f(L)} ${f(droop)} C ${f(L * 0.7)} ${f(L * 0.06)}, ${f(L * 0.35)} ${f(L * 0.06)}, 0 0 Z`;
    return `<g transform="rotate(${f(ang)})"><path d="${p}" fill="${C.frond}" stroke="${dk(C.frond, 0.75)}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="M2 0 C ${f(L * 0.35)} ${f(-L * 0.12)}, ${f(L * 0.7)} ${f(-L * 0.02)}, ${f(L * 0.95)} ${f(droop)}" stroke="${dk(C.frond, 0.82)}" stroke-width="1.4" fill="none"/></g>`;
  };
  const L = h * 0.42;
  let back = '', front = '';
  for (const a of [-160, -20]) back += frond(a + R() * 10, L * 0.9, L * 0.25);
  for (const a of [-130, -55, 200, 15, 160]) front += frond(a + R() * 10, L, L * 0.32);
  b += `<g transform="translate(${f(tx)} ${f(ty)})"><g opacity=".85">${back.replace(new RegExp(C.frond, 'g'), dk(C.frond, 0.88))}</g>` +
    `<circle cx="-3" cy="4" r="4" fill="${C.nut}" stroke="${dk(C.nut, 0.72)}" stroke-width="1.6"/><circle cx="4" cy="5" r="4" fill="${C.nut}" stroke="${dk(C.nut, 0.72)}" stroke-width="1.6"/>` +
    front + `</g>`;
  return b;
}
// a little lantern: hanging point (0,0), returns markup; light at (0, 9)
function lantern(s = 1, body = '#ffd36e') {
  return `<g transform="scale(${s})"><path d="M0 0 V3" stroke="#6a4c3a" stroke-width="1.5"/>` +
    `<rect x="-4" y="3" width="8" height="2.4" rx="1" fill="#7a5a44"/>` +
    `<ellipse cx="0" cy="9.5" rx="5.2" ry="5.6" fill="${body}" stroke="${dk(body, 0.7)}" stroke-width="1.8"/>` +
    `<path d="M2.2 6 Q3.6 9.5 2.2 13" stroke="${dk(body, 0.85)}" stroke-width="1.4" fill="none"/>` +
    `<circle cx="-1.6" cy="8" r="1.6" fill="#fff6d6"/><rect x="-3" y="14.6" width="6" height="2" rx="1" fill="#7a5a44"/></g>`;
}
// water band at the bottom of near.svg: fades in from y0, fully opaque from y1 to 200 (horizontally uniform -> seamless)
function waterBand(id, top, bottom, y0, y1) {
  const H = 200, o0 = y0 / H, o1 = y1 / H;
  return [`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="${o0}" stop-color="${top}" stop-opacity="0"/>` +
    `<stop offset="${o1}" stop-color="${top}" stop-opacity="1"/><stop offset="1" stop-color="${bottom}" stop-opacity="1"/></linearGradient>`,
  `<rect x="0" y="${y0}" width="960" height="${H - y0}" fill="url(#${id})"/>`];
}
// little light strokes on water (wrapped)
function glints(R, n, y0, y1, color, a = 0.6) {
  let b = '';
  for (let i = 0; i < n; i++) {
    const x = R() * 960, y = y0 + R() * (y1 - y0), w = 14 + R() * 30;
    b += wrap(x, y, w / 2 + 2, `<path d="M${f(-w / 2)} 0 H${f(w / 2)}" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity="${a}"/>`);
  }
  return b;
}
// distant island hump (for far.svg): centred at 0, sits on y=0, width w, height h
function hump(w, h, fill, seed) {
  const R = rng(seed), a = w / 2, k1 = 0.25 + R() * 0.15, k2 = 0.6 + R() * 0.15;
  const d = `M${f(-a)} 0 C ${f(-a * 0.75)} ${f(-h * 0.25)}, ${f(-a * k2)} ${f(-h)}, ${f(-a * k1 + R() * 10)} ${f(-h)} ` +
    `C ${f(a * 0.2)} ${f(-h * 1.04)}, ${f(a * 0.6)} ${f(-h * 0.7)}, ${f(a)} 0 Z`;
  return { d, fill };
}

// ======================================================================
// FAR (960x300, horizon y 300)
// ======================================================================
const FW = 960, FH = 300;
function farCove() {
  let b = '';
  const hill = '#a6c9cf', sand = '#e2d8c0', palmC = '#93b9bf';
  // faint far-far line of sandbars
  b += `<path d="${ridgeWide(FW, 296, [[4, 3, 0.4], [3, 7, 1.3]], 300)}" fill="#c3dbdc"/>`;
  const isl = [[140, 260, 66, 3, [[-60, 70, 30], [10, 84, -14], [60, 60, 22]]], [480, 150, 38, 4, [[0, 56, 16]]],
    [770, 330, 92, 5, [[-90, 76, 26], [-30, 96, -18], [40, 86, 20], [110, 64, -24]]], [606, 64, 16, 6, []]];
  for (const [x, w, h, seed, palms] of isl) {
    const H = hump(w, h, hill, seed);
    let m = '';
    // tiny palms behind the crest
    for (const [px, ph, lean] of palms) {
      const top = -h * (1 - Math.pow(px / (w / 2), 2)) * 0.95;
      m += `<g transform="translate(${px} ${f(top + 6)})"><path d="M0 0 Q ${f(lean * 0.2)} ${f(-ph * 0.4)} ${lean} ${f(-ph * 0.55)}" stroke="${palmC}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
        `<g transform="translate(${lean} ${f(-ph * 0.55)})" fill="${palmC}">` +
        [-150, -30, 160, 20, -90].map(a => `<path transform="rotate(${a})" d="M0 0 C 6 -6, 16 -4, 22 4 C 14 2, 6 2, 0 0 Z"/>`).join('') + `</g></g>`;
    }
    m += `<path d="${H.d}" fill="${hill}" stroke="${dk(hill, 0.88)}" stroke-width="2.5" stroke-linejoin="round"/>`;
    // one-step shade on the right flank
    m += `<path d="M${f(w * 0.12)} ${f(-h * 0.98)} C ${f(w * 0.3)} ${f(-h * 0.8)}, ${f(w * 0.42)} ${f(-h * 0.35)}, ${f(w / 2 - 2)} -1 L${f(w * 0.2)} -1 C ${f(w * 0.26)} ${f(-h * 0.4)}, ${f(w * 0.2)} ${f(-h * 0.7)}, ${f(w * 0.12)} ${f(-h * 0.98)} Z" fill="${dk(hill, 0.94)}"/>`;
    m += `<path d="M${f(-w / 2 + 6)} 0 C ${f(-w * 0.3)} -12, ${f(w * 0.3)} -12, ${f(w / 2 - 6)} 0 Z" fill="${sand}" stroke="${dk(sand, 0.88)}" stroke-width="2"/>`;
    b += wrap(x, 300, w / 2 + 30, m);
  }
  return svg(FW, FH, b);
}
function farJungle() {
  let b = '';
  const back = '#b4cfc6', front = '#94b7a9', cliff = '#a9b8b0';
  // misty back mountain range
  b += `<path d="${ridgeWide(FW, 190, [[44, 2, 0.6], [22, 5, 2.1], [10, 11, 0.3]], 300)}" fill="${back}" stroke="${dk(back, 0.9)}" stroke-width="2.5" stroke-linejoin="round"/>`;
  // front jungle hills with canopy bumps (|sin| bumps -> rounded treetops)
  const fr = [[30, 3, 1.1], [14, 7, 0.2], [9, 24, 0, 0.5]];
  b += `<path d="${ridgeWide(FW, 246, fr, 300, 4)}" fill="${front}" stroke="${dk(front, 0.86)}" stroke-width="2.5" stroke-linejoin="round"/>`;
  // shaded lower band of the front hills
  b += `<path d="${ridgeWide(FW, 276, [[10, 3, 1.1], [6, 24, 0, 0.5]], 300, 4)}" fill="${dk(front, 0.93)}"/>`;
  // a cliff with a waterfall (x 640)
  let w = `<path d="M-44 0 L-40 -96 Q-30 -118 -6 -122 L14 -122 Q38 -116 44 -92 L48 0 Z" fill="${cliff}" stroke="${dk(cliff, 0.86)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M20 -120 Q40 -112 44 -92 L48 0 L22 0 Z" fill="${dk(cliff, 0.93)}"/>` +
    `<path d="M-40 -96 Q-30 -118 -6 -122 L14 -122 Q38 -116 44 -92 Q20 -100 0 -98 Q-20 -96 -40 -96 Z" fill="${front}" stroke="${dk(front, 0.86)}" stroke-width="2"/>` +
    `<path d="M-6 -100 Q-8 -50 -10 0 L10 0 Q8 -50 6 -100 Z" fill="#eef6f5" stroke="#cfe0de" stroke-width="2"/>` +
    `<path d="M-2 -90 V-10 M3 -80 V-20" stroke="#d3e5e3" stroke-width="1.6"/>` +
    `<g fill="#f2f7f5"><circle cx="-14" cy="-4" r="9"/><circle cx="0" cy="-8" r="11"/><circle cx="14" cy="-4" r="9"/></g>`;
  b += wrap(640, 300, 60, w);
  return svg(FW, FH, b);
}
function farLagoon() {
  let b = '';
  const lil = '#c9bedb', pink = '#e3c6d4', mint = '#bcd8d3';
  b += `<path d="${ridgeWide(FW, 292, [[6, 4, 0.3], [4, 9, 1.0]], 300)}" fill="${mint}" stroke="${dk(mint, 0.9)}" stroke-width="2"/>`;
  // a sea arch
  const arch = `<path d="M-90 0 C -96 -50, -70 -96, -10 -100 C 50 -102, 86 -70, 92 0 L54 0 C 52 -34, 30 -54, 2 -54 C -26 -54, -48 -34, -50 0 Z" fill="${lil}" stroke="${dk(lil, 0.86)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M40 -92 C 70 -76, 88 -50, 92 0 L54 0 C 54 -30, 46 -46, 34 -50 Z" fill="${dk(lil, 0.94)}"/>` +
    `<g fill="${lt(lil, 0.4)}"><circle cx="-40" cy="-76" r="5"/><circle cx="-20" cy="-86" r="3.5"/></g>`;
  b += wrap(230, 300, 100, arch);
  // sea stacks
  const stack = (w, h, c) => `<path d="M${-w / 2} 0 C ${-w / 2} ${-h * 0.6}, ${-w * 0.4} ${-h}, 0 ${-h} C ${w * 0.4} ${-h}, ${w / 2} ${-h * 0.6}, ${w / 2} 0 Z" fill="${c}" stroke="${dk(c, 0.86)}" stroke-width="2.5"/>` +
    `<path d="M${w * 0.12} ${-h * 0.98} C ${w * 0.4} ${-h * 0.9}, ${w / 2} ${-h * 0.6}, ${w / 2} 0 L${w * 0.2} 0 Z" fill="${dk(c, 0.94)}"/>`;
  b += wrap(500, 300, 30, stack(50, 120, pink)) + wrap(548, 300, 24, stack(40, 76, lil)) + wrap(462, 300, 18, stack(30, 50, mint));
  // long low pastel islet with round bushes
  let isl = `<path d="M-150 0 C -120 -40, -60 -56, 0 -56 C 70 -56, 120 -36, 150 0 Z" fill="${pink}" stroke="${dk(pink, 0.86)}" stroke-width="2.5"/>` +
    `<path d="M40 -54 C 90 -48, 130 -30, 150 0 L60 0 Z" fill="${dk(pink, 0.94)}"/>` +
    `<g fill="${mint}" stroke="${dk(mint, 0.86)}" stroke-width="2"><circle cx="-60" cy="-56" r="16"/><circle cx="-34" cy="-62" r="20"/><circle cx="-8" cy="-58" r="14"/></g>`;
  b += wrap(800, 300, 155, isl);
  return svg(FW, FH, b);
}
function farLantern() {
  let b = '';
  const back = '#bfc2d9', hill = '#a2a8c6', wall = '#c2c3d8', roof = '#8f8fb2', win = '#f2d79c';
  b += `<path d="${ridgeWide(FW, 236, [[30, 2, 2.4], [12, 5, 0.7]], 300)}" fill="${back}" stroke="${dk(back, 0.9)}" stroke-width="2.5"/>`;
  b += `<path d="${ridgeWide(FW, 268, [[22, 2, 0.9], [8, 6, 2.0]], 300)}" fill="${hill}" stroke="${dk(hill, 0.88)}" stroke-width="2.5"/>`;
  // a hillside village: houses stepped up the slope around x 300 and x 760, windows are light spots
  const hillY = x => { let y = 268; for (const [a, n, p] of [[22, 2, 0.9], [8, 6, 2.0]]) y -= a * Math.sin(Math.PI * 2 * n * x / FW + p); return y; };
  const house = (w, h, x, y) => {
    let m = `<rect x="${-w / 2}" y="${-h}" width="${w}" height="${h + 4}" fill="${wall}" stroke="${dk(wall, 0.84)}" stroke-width="2"/>` +
      `<path d="M${-w / 2 - 4} ${-h} L0 ${-h - w * 0.55} L${w / 2 + 4} ${-h} Z" fill="${roof}" stroke="${dk(roof, 0.84)}" stroke-width="2" stroke-linejoin="round"/>` +
      `<rect x="-3.5" y="${-h + 5}" width="7" height="8" rx="1.5" fill="${win}" stroke="${dk(win, 0.75)}" stroke-width="1.2"/>`;
    LIGHTS.lantern.far.push([x, y - h + 9, 10]);
    if (x + w > FW) LIGHTS.lantern.far.push([x - FW, y - h + 9, 10]);
    return m;
  };
  for (const [x, w, h] of [[250, 20, 16], [276, 18, 14], [300, 22, 18], [326, 18, 12], [288, 16, 12], [730, 22, 16], [756, 18, 14], [782, 20, 18]]) {
    const y = hillY(x) + 3;
    b += wrap(x, y, w, house(w, h, x, y));
  }
  // a little round watchtower
  const tx = 520, ty = hillY(520) + 2;
  b += wrap(tx, ty, 16, `<rect x="-9" y="-52" width="18" height="54" fill="${wall}" stroke="${dk(wall, 0.84)}" stroke-width="2"/>` +
    `<path d="M-13 -52 L0 -70 L13 -52 Z" fill="${roof}" stroke="${dk(roof, 0.84)}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="-4" y="-46" width="8" height="9" rx="2" fill="${win}" stroke="${dk(win, 0.75)}" stroke-width="1.2"/>`);
  LIGHTS.lantern.far.push([tx, ty - 41, 12]);
  return svg(FW, FH, b);
}

// ======================================================================
// NEAR (960x200, horizon y 200)
// ======================================================================
const NW = 960, NH = 200;
const WATER = { cove: ['#8fd0cf', '#62bcbd'], jungle: ['#86c7bf', '#58b1a8'], lagoon: ['#9ad7da', '#6cc8cd'], lantern: ['#86bccb', '#5aa4b6'] };
function nearBase(z, seed) {
  const [g, rect] = waterBand('w', WATER[z][0], WATER[z][1], 116, 146);
  return { defs: g, body: rect, glint: glints(rng(seed), 18, 160, 196, lt(WATER[z][0], 0.6), 0.7) };
}
// sand islet: centred, sitting on y 200 region (top at -h)
function islet(w, h, sand) {
  return `<path d="M${-w / 2} 6 C ${-w * 0.36} ${-h}, ${w * 0.36} ${-h}, ${w / 2} 6 Z" fill="${sand}" stroke="${dk(sand, 0.8)}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M${f(w * 0.1)} ${f(-h * 0.72)} C ${f(w * 0.3)} ${f(-h * 0.6)}, ${f(w * 0.42)} ${f(-h * 0.2)}, ${w / 2 - 3} 4 L${f(w * 0.16)} 4 Z" fill="${dk(sand, 0.93)}"/>` +
    `<path d="M${-w / 2 + 6} 4 C ${-w * 0.2} -4, ${w * 0.2} -4, ${w / 2 - 6} 4" stroke="#eef9f6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`;
}
function rocks(n, seed, c) {
  const R = rng(seed); let m = '';
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 16 + R() * 6, r = 9 + R() * 8;
    m += `<path d="M${f(x - r)} 4 C ${f(x - r)} ${f(-r * 1.1)}, ${f(x + r)} ${f(-r * 1.1)}, ${f(x + r)} 4 Z" fill="${c}" stroke="${dk(c, 0.75)}" stroke-width="2.5"/>` +
      `<path d="M${f(x + r * 0.2)} ${f(-r * 0.75)} C ${f(x + r)} ${f(-r * 0.6)}, ${f(x + r)} 0, ${f(x + r - 1)} 3 L${f(x + r * 0.3)} 3 Z" fill="${dk(c, 0.92)}"/>`;
  }
  return m;
}
function rowboat(c = '#c98f7a', trim = '#efe3cf') {
  return `<path d="M-34 -14 L34 -14 Q30 2 18 4 L-20 4 Q-32 2 -34 -14 Z" fill="${c}" stroke="${dk(c, 0.72)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M-33 -14 H33 L32 -10 H-32 Z" fill="${trim}" stroke="${dk(trim, 0.8)}" stroke-width="1.5"/>` +
    `<path d="M10 -2 Q22 -2 26 -10" stroke="${dk(c, 0.85)}" stroke-width="2" fill="none"/>` +
    `<path d="M-10 -14 L-22 -32 M-22 -32 l-4 -6" stroke="#a88a6a" stroke-width="3" stroke-linecap="round"/>`;
}
function sailboat(hull, sail, flag) {
  return `<path d="M0 -10 V-74" stroke="#8b6e58" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M3 -72 C 30 -56, 36 -30, 32 -16 L3 -16 Z" fill="${sail}" stroke="${dk(sail, 0.82)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M18 -50 C 28 -40, 32 -28, 30 -16 L20 -16 Z" fill="${dk(sail, 0.93)}"/>` +
    `<path d="M-3 -62 C -18 -46, -22 -30, -20 -16 L-3 -16 Z" fill="${sail}" stroke="${dk(sail, 0.82)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M1 -74 L14 -70 L1 -66 Z" fill="${flag}" stroke="${dk(flag, 0.75)}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M-36 -14 H36 Q30 4 16 6 H-18 Q-30 4 -36 -14 Z" fill="${hull}" stroke="${dk(hull, 0.75)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M-34 -9 H34" stroke="${lt(hull, 0.6)}" stroke-width="3"/>`;
}

function nearCove() {
  const B = nearBase('cove', 31);
  let b = B.body + B.glint;
  const sand = '#e9d9b2', P = { trunk: '#b99d7c', frond: '#7eaa90', nut: '#a58a6a' };
  // left islet with two palms
  b += wrap(400, 190, 140, `<g transform="translate(-30 -18)">${palm(96, 22, P, 1)}</g><g transform="translate(36 -14)">${palm(74, -16, P, 2)}</g>` + islet(240, 36, sand) +
    `<g transform="translate(-70 -8)">${rocks(2, 3, '#a9a3a0')}</g>`);
  // small rock group + buoy
  b += wrap(120, 194, 30, rocks(3, 4, '#a7a2a6')) + wrap(250, 194, 20, rocks(2, 9, '#aaa4a1'));
  b += wrap(540, 190, 14, `<path d="M-9 4 C -9 -6, 9 -6, 9 4 Z" fill="#e7a9a2" stroke="${dk('#e7a9a2', 0.75)}" stroke-width="2"/><path d="M-8 -2 H8" stroke="#f6eee6" stroke-width="3"/><path d="M0 -6 V-16" stroke="#9a8e86" stroke-width="2"/>`);
  // bigger islet with three palms and a beach hut-less dune
  b += wrap(730, 192, 160, `<g transform="translate(-60 -22)">${palm(84, -20, P, 3)}</g><g transform="translate(0 -30)">${palm(112, 14, P, 4)}</g><g transform="translate(64 -18)">${palm(70, 22, P, 5)}</g>` +
    islet(300, 42, sand) + `<g transform="translate(110 -4)">${rocks(2, 6, '#aaa4a1')}</g>`);
  // a rowboat
  b += wrap(920, 194, 40, rowboat());
  return svg(NW, NH, b, B.defs);
}
function nearJungle() {
  const B = nearBase('jungle', 32);
  let defs = B.defs;
  let b = B.body + B.glint;
  const fol = '#6f9c86', fol2 = '#5d8a76', P = { trunk: '#9c8670', frond: '#6c9a82', nut: '#8e7660' };
  // background jungle bank (low, continuous, bumpy treetops) – periodic so it tiles
  b += `<path d="${ridgeWide(NW, 170, [[10, 2, 0.4], [16, 15, 0, 0.6], [6, 37, 1, 0.5]], 196, 3)}" fill="${fol2}" stroke="${dk(fol2, 0.8)}" stroke-width="3" stroke-linejoin="round"/>`;
  b += `<path d="${ridgeWide(NW, 184, [[6, 3, 1.4], [10, 22, 0.5, 0.6]], 198, 3)}" fill="${fol}" stroke="${dk(fol, 0.8)}" stroke-width="3" stroke-linejoin="round"/>`;
  // round-canopy jungle tree with hanging vines
  const tree = (h, s) => {
    const c = '#77a48d';
    let m = `<path d="M0 0 C -2 ${-h * 0.4}, 4 ${-h * 0.7}, 2 ${-h}" stroke="${dk('#8d7a66', 0.75)}" stroke-width="13" fill="none" stroke-linecap="round"/>` +
      `<path d="M0 0 C -2 ${-h * 0.4}, 4 ${-h * 0.7}, 2 ${-h}" stroke="#8d7a66" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    m += `<g transform="translate(2 ${-h})"><g fill="${c}" stroke="${dk(c, 0.78)}" stroke-width="3">` +
      `<circle cx="-30" cy="6" r="22"/><circle cx="30" cy="6" r="22"/><circle cx="0" cy="-8" r="28"/></g>` +
      `<g fill="${c}"><circle cx="-30" cy="6" r="20.5"/><circle cx="30" cy="6" r="20.5"/><circle cx="0" cy="-8" r="26.5"/></g>` +
      `<path d="M-48 16 Q0 34 48 16 Q30 26 0 26 Q-30 26 -48 16 Z" fill="${dk(c, 0.9)}"/>` +
      `<g fill="none" stroke="#6b9478" stroke-width="2.4" stroke-linecap="round"><path d="M-36 22 Q-40 44 -34 64"/><path d="M-14 26 Q-18 40 -12 52"/><path d="M24 24 Q28 46 22 70"/></g>` +
      `<g fill="#e9b5c8" stroke="#c68ea3" stroke-width="1.2"><circle cx="-34" cy="64" r="3"/><circle cx="22" cy="70" r="3"/><circle cx="-14" cy="-20" r="3"/><circle cx="18" cy="-4" r="2.6"/></g>` +
      `<circle cx="-10" cy="-20" r="6" fill="${lt(c, 0.25)}"/></g>`;
    return `<g transform="scale(${s})">${m}</g>`;
  };
  b += wrap(90, 180, 70, tree(104, 1));
  b += wrap(250, 186, 50, palm(108, 20, P, 7));
  // stilt hut with a glowing window and porch lantern (x 380)
  const wall = '#c7a888', roof = '#a68f6a';
  b += wrap(380, 196, 50, `<g stroke="${dk('#8a7058', 0.85)}" stroke-width="4" stroke-linecap="round"><path d="M-26 0 V-40 M26 0 V-40 M0 2 V-40"/></g>` +
    `<rect x="-36" y="-44" width="72" height="7" rx="2" fill="#9a7d62" stroke="${dk('#9a7d62', 0.75)}" stroke-width="2"/>` +
    `<rect x="-26" y="-80" width="52" height="38" fill="${wall}" stroke="${dk(wall, 0.75)}" stroke-width="3"/>` +
    `<rect x="4" y="-80" width="22" height="38" fill="${dk(wall, 0.92)}"/>` +
    `<path d="M-38 -76 L0 -108 L38 -76 Z" fill="${roof}" stroke="${dk(roof, 0.72)}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M-26 -82 L-20 -88 M-12 -84 L-6 -94 M6 -86 L10 -96 M20 -82 L24 -88" stroke="${dk(roof, 0.82)}" stroke-width="2" stroke-linecap="round"/>` +
    `<rect x="-16" y="-72" width="14" height="13" rx="2" fill="#ffd98a" stroke="#c9963f" stroke-width="2"/><path d="M-9 -72 V-59 M-16 -65.5 H-2" stroke="#c9963f" stroke-width="1.5"/>` +
    `<path d="M28 -44 Q34 -50 34 -54" stroke="#6a4c3a" stroke-width="2" fill="none"/><g transform="translate(34 -54)">${lantern(0.9)}</g>`);
  LIGHTS.jungle.near.push([371, 131, 16], [414, 151, 14]);
  // waterfall cliff (x 640): the one tall element (~150 px), at the far right of the flight band
  const cliff = '#9eaaa0';
  defs += vgrad('fall', [[0, '#f4fbfa'], [1, '#d9eeee']]);
  b += wrap(640, 198, 70, `<path d="M-62 4 L-56 -110 Q-46 -150 -6 -152 L18 -152 Q54 -148 60 -110 L66 4 Z" fill="${cliff}" stroke="${dk(cliff, 0.75)}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M24 -150 Q54 -146 60 -110 L66 4 L30 4 Z" fill="${dk(cliff, 0.92)}"/>` +
    `<path d="M-56 -110 Q-46 -150 -6 -152 L18 -152 Q54 -148 60 -110 Q40 -126 10 -124 Q-30 -122 -56 -110 Z" fill="${fol}" stroke="${dk(fol, 0.78)}" stroke-width="3" stroke-linejoin="round"/>` +
    `<g fill="${fol}" stroke="${dk(fol, 0.78)}" stroke-width="3"><circle cx="-44" cy="-128" r="14"/><circle cx="46" cy="-126" r="13"/></g>` +
    `<path d="M-14 -124 Q-16 -60 -20 0 L18 0 Q14 -60 12 -124 Z" fill="url(#fall)" stroke="#bcd9da" stroke-width="2.5"/>` +
    `<g stroke="#c3dfe0" stroke-width="2" stroke-linecap="round"><path d="M-6 -110 V-70 M4 -100 V-40 M-10 -50 V-14 M8 -30 V-6"/></g>` +
    `<g fill="none" stroke="#6b9478" stroke-width="2.4" stroke-linecap="round"><path d="M-40 -116 Q-44 -90 -38 -70"/><path d="M40 -114 Q44 -96 38 -84"/></g>` +
    `<g fill="#f3faf9" stroke="#cfe3e2" stroke-width="2"><circle cx="-24" cy="0" r="10"/><circle cx="0" cy="-4" r="13"/><circle cx="24" cy="0" r="10"/></g>`);
  // big leafy bush clumps in front
  const bush = (w, c) => `<g fill="${c}" stroke="${dk(c, 0.78)}" stroke-width="3">` + [[-w * 0.3, -10, w * 0.24], [w * 0.3, -10, w * 0.24], [0, -18, w * 0.3]].map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`).join('') + `</g>` +
    `<path d="M${f(-w * 0.52)} 0 H${f(w * 0.52)} V-6 Q0 6 ${f(-w * 0.52)} -6 Z" fill="${dk(c, 0.9)}"/>`;
  b += wrap(530, 196, 40, bush(70, '#73a08a'));
  b += wrap(860, 194, 60, bush(110, '#6c9a84') + `<g transform="translate(24 -10)">${palm(90, -18, P, 8)}</g>`);
  return svg(NW, NH, b, defs);
}
function nearLagoon() {
  const B = nearBase('lagoon', 33);
  let b = B.body + B.glint;
  // knobby coral rock: blobs with polka holes
  const coral = (w, h, c, seed) => {
    const R = rng(seed); let m = '', dots = '';
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = (t - 0.5) * w * 0.7, r = (0.25 + 0.12 * Math.sin(t * Math.PI) + R() * 0.06) * w * 0.55, y = -h * 0.35 - Math.sin(t * Math.PI) * h * 0.4;
      m += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
      dots += `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.2)}" r="${f(2 + R() * 2)}"/><circle cx="${f(x + r * 0.25)}" cy="${f(y + r * 0.25)}" r="${f(1.6 + R() * 1.5)}"/>`;
    }
    m += `<rect x="${f(-w / 2)}" y="${f(-h * 0.4)}" width="${w}" height="${f(h * 0.4 + 6)}" rx="${f(h * 0.2)}"/>`;
    return `<g fill="${c}" stroke="${dk(c, 0.78)}" stroke-width="5">${m}</g><g fill="${c}">${m}</g>` +
      `<path d="M${f(w * 0.08)} 5 H${f(w / 2 - 1)} V${f(-h * 0.3)} Q${f(w * 0.3)} ${f(-h * 0.05)} ${f(w * 0.08)} 5 Z" fill="${dk(c, 0.92)}"/>` +
      `<g fill="${dk(c, 0.86)}">${dots}</g>`;
  };
  // branchy coral fan
  const fan = (c) => `<g fill="none" stroke="${dk(c, 0.75)}" stroke-width="8" stroke-linecap="round"><path d="M0 0 V-30 M0 -18 L-14 -34 M0 -24 L12 -44 M-14 -34 L-20 -46 M12 -44 L20 -52"/></g>` +
    `<g fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"><path d="M0 0 V-30 M0 -18 L-14 -34 M0 -24 L12 -44 M-14 -34 L-20 -46 M12 -44 L20 -52"/></g>`;
  b += wrap(110, 194, 70, `<g transform="translate(-24 -16)">${fan('#e7a7b8')}</g>` + coral(130, 64, '#e4b3c4', 41) + `<g transform="translate(48 2)">${coral(60, 30, '#c7b5e0', 42)}</g>`);
  b += wrap(300, 192, 44, sailboat('#8fb6d9', '#f6efe2', '#e59aa4'));
  b += wrap(440, 196, 40, coral(76, 40, '#c7b5e0', 43) + `<g transform="translate(30 4)">${coral(40, 20, '#b8ddd0', 44)}</g>`);
  b += wrap(560, 192, 40, `<g transform="scale(.82)">${sailboat('#e7a7b8', '#f6efe2', '#8fb6d9')}</g>`);
  // lighthouse on a coral rock (x 780), lamp is a light spot
  const tw = '#f5efe7', st = '#e49c9c';
  let lh = coral(150, 46, '#ecc7b0', 45) +
    `<path d="M-18 -40 L-12 -122 H12 L18 -40 Z" fill="${tw}" stroke="${dk(tw, 0.72)}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M-16.4 -62 L-15 -80 H15 L16.4 -62 Z M-13.8 -98 L-13 -110 H13 L13.8 -98 Z" fill="${st}" stroke="${dk(st, 0.75)}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M4 -122 H12 L18 -40 H8 Z" fill="${dk(tw, 0.9)}" opacity=".6"/>` +
    `<rect x="-17" y="-128" width="34" height="7" rx="2" fill="${st}" stroke="${dk(st, 0.72)}" stroke-width="2"/>` +
    `<rect x="-10" y="-146" width="20" height="18" rx="3" fill="#ffe7a3" stroke="#c9a356" stroke-width="2.5"/>` +
    `<path d="M-14 -146 Q0 -162 14 -146 Z" fill="${st}" stroke="${dk(st, 0.72)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="0" cy="-162" r="3" fill="${dk(st, 0.8)}"/>` +
    `<rect x="-5" y="-56" width="10" height="16" rx="5" fill="#9fb9d6" stroke="${dk('#9fb9d6', 0.75)}" stroke-width="2"/>`;
  b += wrap(790, 196, 80, lh);
  LIGHTS.lagoon.near.push([790, 59, 22]);
  b += wrap(920, 196, 30, coral(56, 28, '#b8ddd0', 46));
  return svg(NW, NH, b, B.defs);
}
function nearLantern() {
  const B = nearBase('lantern', 34);
  let b = B.body + B.glint;
  // ---- cute pirate ship (x 250) ----
  const hull = '#a0796a', trim = '#d8b483', sail = '#efe5d2', wood = '#86675a';
  const shipX = 450, shipY = 192;
  let s = '';
  s += `<path d="M-10 -40 V-150 M60 -40 V-124" stroke="${dk(wood, 0.75)}" stroke-width="8" stroke-linecap="round"/><path d="M-10 -40 V-150 M60 -40 V-124" stroke="${wood}" stroke-width="5" stroke-linecap="round"/>`;
  // sails (puffy, rounded)
  const sailP = (x, top, w, h) => `<path d="M${x - w / 2} ${top} Q${x} ${top - 8} ${x + w / 2} ${top} Q${x + w / 2 + 10} ${top + h / 2} ${x + w / 2} ${top + h} Q${x} ${top + h - 6} ${x - w / 2} ${top + h} Q${x - w / 2 + 8} ${top + h / 2} ${x - w / 2} ${top} Z" fill="${sail}" stroke="${dk(sail, 0.8)}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M${x + w * 0.15} ${top + 2} Q${x + w / 2 + 10} ${top + h / 2} ${x + w / 2} ${top + h} L${x + w * 0.2} ${top + h - 3} Q${x + w * 0.36} ${top + h / 2} ${x + w * 0.15} ${top + 2} Z" fill="${dk(sail, 0.93)}"/>`;
  s += sailP(-10, -138, 64, 40) + sailP(-10, -92, 76, 42) + sailP(60, -114, 56, 58);
  // round paw-print emblem on the big sail (kid-friendly, no skull)
  s += `<g fill="#b39a86"><circle cx="-10" cy="-68" r="7"/><circle cx="-20" cy="-79" r="3.5"/><circle cx="-10" cy="-83" r="3.5"/><circle cx="0" cy="-79" r="3.5"/></g>`;
  // flag
  s += `<path d="M-10 -150 L16 -144 L-10 -136 Z" fill="#6f7fa8" stroke="${dk('#6f7fa8', 0.75)}" stroke-width="2" stroke-linejoin="round"/><circle cx="-2" cy="-143" r="2.6" fill="#f6efe2"/>`;
  // rope with lanterns from bow to masts
  const rope = `M-88 -48 Q-50 -110 -10 -150 M-10 -150 Q26 -120 60 -124 M60 -124 Q86 -84 96 -50`;
  s += `<path d="${rope}" stroke="#7b6252" stroke-width="1.8" fill="none"/>`;
  const lan = [[-68, -84], [-38, -122], [22, -133], [44, -126], [78, -96]];
  for (const [x, y] of lan) { s += `<g transform="translate(${x} ${y})">${lantern(0.8)}</g>`; LIGHTS.lantern.near.push([shipX + x, shipY + y + 8, 14]); }
  // hull: chubby rounded boat
  s += `<path d="M-100 -50 Q-90 -44 -70 -42 H90 L104 -56 Q104 -12 70 4 H-60 Q-96 -6 -100 -50 Z" fill="${hull}" stroke="${dk(hull, 0.7)}" stroke-width="3" stroke-linejoin="round"/>`;
  s += `<path d="M-96 -30 Q-80 -24 -60 -24 H100 Q96 -6 70 4 H-60 Q-86 -6 -96 -30 Z" fill="${dk(hull, 0.88)}"/>`;
  s += `<path d="M-98 -42 Q-84 -34 -62 -34 H98" stroke="${trim}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M-74 -42 V-54 M-40 -42 V-54 M-6 -42 V-54 M28 -42 V-54 M62 -42 V-54 M-82 -54 H96" stroke="${wood}" stroke-width="3" stroke-linecap="round"/>`;
  // round portholes that glow
  for (const x of [-40, 0, 40]) { s += `<circle cx="${x}" cy="-16" r="6" fill="#ffd98a" stroke="${dk(trim, 0.7)}" stroke-width="2.5"/>`; LIGHTS.lantern.near.push([shipX + x, shipY - 16, 12]); }
  // stern lantern
  s += `<path d="M98 -56 V-66 Q98 -70 104 -70" stroke="#6a4c3a" stroke-width="2" fill="none"/><g transform="translate(104 -70)">${lantern(0.9)}</g>`;
  LIGHTS.lantern.near.push([shipX + 104, shipY - 61, 14]);
  b += wrap(shipX, shipY, 120, s);
  // ---- stilt huts with lanterns (x 600, 740) and a little dock ----
  const wall = '#c2a184', roof = '#9a7f72', stilt = '#7f6656';
  const hut = (w, h, id) => {
    let m = `<g stroke="${dk(stilt, 0.85)}" stroke-width="4" stroke-linecap="round"><path d="M${-w / 2 + 6} 4 V-34 M${w / 2 - 6} 4 V-34 M0 6 V-34"/></g>` +
      `<rect x="${-w / 2 - 8}" y="-38" width="${w + 16}" height="7" rx="2" fill="#94755f" stroke="${dk('#94755f', 0.75)}" stroke-width="2"/>` +
      `<rect x="${-w / 2}" y="${-38 - h}" width="${w}" height="${h}" fill="${wall}" stroke="${dk(wall, 0.75)}" stroke-width="3"/>` +
      `<rect x="${w * 0.1}" y="${-38 - h}" width="${w * 0.4}" height="${h}" fill="${dk(wall, 0.92)}"/>` +
      `<path d="M${-w / 2 - 12} ${-34 - h} L0 ${-38 - h - w * 0.55} L${w / 2 + 12} ${-34 - h} Z" fill="${roof}" stroke="${dk(roof, 0.72)}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M${-w * 0.3} ${-40 - h} l6 -8 M0 ${-44 - h} l4 -10 M${w * 0.28} ${-40 - h} l4 -8" stroke="${dk(roof, 0.82)}" stroke-width="2" stroke-linecap="round"/>` +
      `<rect x="${-w * 0.32}" y="${-30 - h}" width="13" height="14" rx="3" fill="#ffd98a" stroke="#c9963f" stroke-width="2"/>` +
      `<rect x="${w * 0.12}" y="${-38 - h * 0.62}" width="12" height="${h * 0.62}" rx="2" fill="#7d6152" stroke="${dk('#7d6152', 0.75)}" stroke-width="2"/>`;
    return m;
  };
  b += wrap(690, 196, 50, hut(56, 34));
  LIGHTS.lantern.near.push([690 - 56 * 0.32 + 6.5, 196 - 30 - 34 + 7, 16]);
  b += wrap(840, 196, 50, hut(48, 30));
  LIGHTS.lantern.near.push([840 - 48 * 0.32 + 6.5, 196 - 30 - 30 + 7, 15]);
  // string of lanterns between the huts + porch posts
  b += `<path d="M720 160 Q765 184 810 162" stroke="#7b6252" stroke-width="1.8" fill="none"/>`;
  for (const [x, y] of [[738, 168], [765, 174], [792, 168]]) { b += wrap(x, y, 6, lantern(0.75)); LIGHTS.lantern.near.push([x, y + 7, 12]); }
  for (const [x, top] of [[720, 150], [810, 152]]) b += `<path d="M${x} 162 V${top}" stroke="${dk(stilt, 0.85)}" stroke-width="3" stroke-linecap="round"/>`;
  // dock with a lantern post (x 880)
  b += wrap(150, 196, 60, `<g stroke="${dk(stilt, 0.85)}" stroke-width="4" stroke-linecap="round"><path d="M-46 4 V-20 M-10 4 V-20 M26 4 V-20"/></g>` +
    `<rect x="-56" y="-24" width="100" height="7" rx="2" fill="#94755f" stroke="${dk('#94755f', 0.75)}" stroke-width="2"/>` +
    `<path d="M30 -24 V-70 Q30 -76 38 -76" stroke="${dk(stilt, 0.8)}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M30 -24 V-70 Q30 -76 38 -76" stroke="${stilt}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<g transform="translate(38 -76)">${lantern(1)}</g>`);
  LIGHTS.lantern.near.push([188, 129, 16]);
  return svg(NW, NH, b, B.defs);
}

// ======================================================================
// SEA (960x240, surface y 20)
// ======================================================================
function sea() {
  const W = 960, H = 240, SY = 20;
  const defs = vgrad('sg', [[0, '#5cc4c4'], [0.25, '#3fa9b3'], [0.6, '#2a83a0'], [1, '#1d5f86']]);
  // scalloped crest: 24 waves per tile (period 40 px) -> seamless
  let crest = '', foam = '';
  const n = 24, p = W / n;
  crest = `M0 ${SY}`;
  for (let i = 0; i < n; i++) { const x = i * p; crest += ` Q${f(x + p * 0.25)} ${SY - 9} ${f(x + p * 0.5)} ${SY - 4} Q${f(x + p * 0.75)} ${SY + 1} ${f(x + p)} ${SY}`; }
  const body = crest + ` L${W} ${H} L0 ${H} Z`;
  for (let i = 0; i < n; i++) { const x = i * p; foam += `<path d="M${f(x + p * 0.08)} ${SY - 2} Q${f(x + p * 0.25)} ${SY - 8} ${f(x + p * 0.45)} ${SY - 4.5}" stroke="#eefaf8" stroke-width="3.2" fill="none" stroke-linecap="round"/>`; }
  let b = `<path d="${body}" fill="url(#sg)"/>`;
  b += `<path d="${crest}" stroke="#3a9ca6" stroke-width="3" fill="none" stroke-linejoin="round"/>`;
  b += `<path d="${crest} L${W} ${SY + 14} Q${W / 2} ${SY + 18} 0 ${SY + 14} Z" fill="#7fd3cf" opacity=".55"/>`;
  b += foam;
  // gentle swell lines (periodic sines) and a few wrapped glints
  for (const [y, a, k, ph, c, o] of [[52, 3, 6, 0.3, '#5bbcc2', 0.6], [86, 4, 5, 1.9, '#3f9db0', 0.55], [128, 4, 4, 0.9, '#2f86a1', 0.5], [176, 5, 3, 2.6, '#256f93', 0.5]]) {
    let d = ''; for (let x = -20; x <= W + 20; x += 8) d += (x === -20 ? 'M' : 'L') + f(x) + ' ' + f(y + a * Math.sin(Math.PI * 2 * k * x / W + ph));
    b += `<path d="${d}" stroke="${c}" stroke-width="3" fill="none" opacity="${o}" stroke-dasharray="70 50" stroke-dashoffset="0"/>`;
  }
  b += glints(rng(77), 18, 34, 110, '#c9eeea', 0.55);
  return svg(W, H, b, defs);
}

// ======================================================================
// ROCK (480x220): top surface y 40; world: 100 px = 1 u, so the sea surface is at y 160
// ======================================================================
function rock() {
  const W = 480, H = 220, TOP = 40, WL = 160;
  const stone = '#9d958f', stoneD = dk(stone, 0.86), sand = '#e7d4a8';
  let b = '';
  // rock body: flush with x 0 from the top surface to the bottom, slopes into the water on the right
  const body = `M0 ${TOP + 6} L${W - 120} ${TOP + 6} C ${W - 70} ${TOP + 14}, ${W - 40} ${TOP + 50}, ${W - 26} ${TOP + 90} C ${W - 16} ${TOP + 120}, ${W - 10} ${WL + 20}, ${W - 14} ${H} L0 ${H} Z`;
  b += `<path d="${body}" fill="${stone}" stroke="${dk(stone, 0.7)}" stroke-width="3" stroke-linejoin="round"/>`;
  // shaded lower/right part (one step)
  b += `<path d="M0 ${TOP + 96} C 120 ${TOP + 82}, 260 ${TOP + 100}, ${W - 120} ${TOP + 70} C ${W - 70} ${TOP + 60}, ${W - 40} ${TOP + 64}, ${W - 30} ${TOP + 82} C ${W - 16} ${TOP + 120}, ${W - 10} ${WL + 20}, ${W - 14} ${H - 1.5} L0 ${H - 1.5} Z" fill="${stoneD}"/>`;
  // crack lines and a highlight
  b += `<path d="M120 ${TOP + 44} q14 14 6 30 M300 ${TOP + 36} q-10 16 2 34 M400 ${TOP + 40} q10 10 4 24" stroke="${dk(stone, 0.74)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  b += `<path d="M30 ${TOP + 28} q60 -8 120 -2 M330 ${TOP + 22} q30 -2 50 6" stroke="${lt(stone, 0.35)}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  // a wet band at the waterline (darker, with foam), barnacles
  b += `<path d="M${W - 30} ${WL - 14} C ${W - 18} ${WL - 4}, ${W - 14} ${WL + 6}, ${W - 13} ${WL + 14} L0 ${WL + 14} L0 ${WL - 6} C 140 ${WL - 10}, 300 ${WL - 4}, ${W - 30} ${WL - 14} Z" fill="${dk(stone, 0.78)}" opacity=".55"/>`;
  b += `<g fill="#c9c2b8" stroke="${dk('#c9c2b8', 0.75)}" stroke-width="1.5"><circle cx="${W - 40}" cy="${WL - 26}" r="3.5"/><circle cx="${W - 52}" cy="${WL - 18}" r="2.6"/><circle cx="${W - 34}" cy="${WL - 40}" r="2.4"/></g>`;
  // sand cap: flat from x 0 to ~350 at y 40, bulging edge drips over the rock
  const sandP = `M0 ${TOP - 2} H${W - 126} C ${W - 104} ${TOP - 2}, ${W - 92} ${TOP + 4}, ${W - 90} ${TOP + 12} C ${W - 104} ${TOP + 20}, ${W - 130} ${TOP + 16}, ${W - 150} ${TOP + 22} C ${W - 190} ${TOP + 32}, ${W - 230} ${TOP + 18}, ${W - 270} ${TOP + 24} C ${W - 320} ${TOP + 30}, ${W - 370} ${TOP + 18}, ${W - 410} ${TOP + 26} C ${W - 440} ${TOP + 30}, 20 ${TOP + 20}, 0 ${TOP + 24} Z`;
  b += `<path d="${sandP}" fill="${sand}" stroke="${dk(sand, 0.78)}" stroke-width="3" stroke-linejoin="round"/>`;
  b += `<path d="M0 ${TOP + 10} H${W - 140} C ${W - 120} ${TOP + 10}, ${W - 104} ${TOP + 12}, ${W - 96} ${TOP + 14} C ${W - 120} ${TOP + 18}, ${W - 160} ${TOP + 22}, ${W - 200} ${TOP + 24} C ${W - 260} ${TOP + 16}, ${W - 330} ${TOP + 26}, ${W - 390} ${TOP + 20} C ${W - 430} ${TOP + 18}, 30 ${TOP + 20}, 0 ${TOP + 20} Z" fill="${dk(sand, 0.92)}"/>`;
  b += `<path d="M14 ${TOP + 2} H${W - 150}" stroke="${lt(sand, 0.45)}" stroke-width="3" stroke-linecap="round" opacity=".9"/>`;
  // sand speckles
  const R = rng(91);
  for (let i = 0; i < 18; i++) b += `<circle cx="${f(10 + R() * 330)}" cy="${f(TOP + 6 + R() * 12)}" r="${f(1.2 + R())}" fill="${dk(sand, 0.82)}" opacity=".7"/>`;
  // decorations — keep x 140..320 clear for the slingshot base (x 230)
  const shell = `<path d="M-9 0 C -9 -10, 9 -10, 9 0 Z" fill="#f2c9c0" stroke="${dk('#f2c9c0', 0.75)}" stroke-width="1.8" stroke-linejoin="round"/><path d="M0 -1 V-7 M-4 -1 L-5 -6 M4 -1 L5 -6" stroke="${dk('#f2c9c0', 0.78)}" stroke-width="1.3"/>`;
  const spiral = `<path d="M-7 0 C -8 -9, 6 -11, 8 -3 C 9 1, 4 2, 0 1 Z" fill="#efe2c6" stroke="${dk('#efe2c6', 0.72)}" stroke-width="1.8" stroke-linejoin="round"/><path d="M-3 -2 q3 -4 6 -1" stroke="${dk('#efe2c6', 0.72)}" stroke-width="1.3" fill="none"/>`;
  const star = `<path transform="scale(.8)" d="M0 -11 L3 -3.5 L11 -3.5 L4.5 1.5 L7 9.5 L0 4.5 L-7 9.5 L-4.5 1.5 L-11 -3.5 L-3 -3.5 Z" fill="#eaa3a0" stroke="${dk('#eaa3a0', 0.75)}" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="0" r="1.5" fill="#f8d3cf"/>`;
  const grass = (s) => `<g transform="scale(${s})"><path d="M-10 2 Q-12 -10 -16 -18 Q-6 -10 -4 0 Q-2 -16 2 -24 Q4 -12 3 0 Q8 -12 16 -16 Q10 -6 9 2 Z" fill="#9bb889" stroke="${dk('#9bb889', 0.72)}" stroke-width="2" stroke-linejoin="round"/></g>`;
  b += `<g transform="translate(36 ${TOP + 2})">${grass(1)}</g><g transform="translate(64 ${TOP + 4})">${grass(0.7)}</g>`;
  b += `<g transform="translate(100 ${TOP + 10})">${shell}</g><g transform="translate(118 ${TOP + 14})">${spiral}</g>`;
  b += `<g transform="translate(340 ${TOP + 12})">${star}</g><g transform="translate(372 ${TOP + 8})">${spiral}</g>`;
  b += `<g transform="translate(${W - 104} ${TOP + 8})">${grass(0.8)}</g>`;
  b += `<g transform="translate(16 ${TOP + 70})">${star.replace('scale(.8)', 'scale(.6) rotate(20)')}</g>`;
  return svg(W, H, b);
}

// ======================================================================
// PARTICLES (32x32)
// ======================================================================
const P32 = b => svg(32, 32, b);
const particles = {
  sparkle: P32(`<path d="M16 2 Q18 14 30 16 Q18 18 16 30 Q14 18 2 16 Q14 14 16 2 Z" fill="#ffffff"/><circle cx="16" cy="16" r="3" fill="#fffbe6"/>`),
  bubble: P32(`<circle cx="16" cy="16" r="11" fill="#e8fbff" fill-opacity=".28" stroke="#d9f5fb" stroke-width="2.4"/><path d="M10 12 Q11.5 9 15 8" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="21" cy="21" r="1.6" fill="#ffffff" opacity=".8"/>`),
  drop: P32(`<path d="M16 3 C 18 10, 25 15, 25 21 A9 9 0 0 1 7 21 C 7 15, 14 10, 16 3 Z" fill="#bfe9f0" stroke="#7fc3cf" stroke-width="2" stroke-linejoin="round"/><path d="M20 15 C 23 19, 23 23, 20 26 L17 26 Z" fill="#a6dce6"/><path d="M11.5 18 Q11 22 13 24" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  ripple: P32(`<ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="#e6f8f6" stroke-width="2.4" opacity=".9"/><ellipse cx="16" cy="16" rx="8" ry="3" fill="none" stroke="#ffffff" stroke-width="2"/>`),
  star: P32(`<path d="M16 3 L19.5 11.5 L28.5 12 L21.5 17.8 L23.8 26.8 L16 21.8 L8.2 26.8 L10.5 17.8 L3.5 12 L12.5 11.5 Z" fill="#ffe27a" stroke="#d8a93a" stroke-width="2" stroke-linejoin="round"/><path d="M16 21.8 L23.8 26.8 L21.5 17.8 L28.5 12 L19.5 11.5 Z" fill="#f5cf5a"/><circle cx="13" cy="13" r="1.8" fill="#fff8d6"/>`),
  firefly: svg(32, 32, `<defs>${radial('fg', '#fff3a0', 0.9, [0.4, 0.45])}</defs><circle cx="16" cy="16" r="15" fill="url(#fg)"/><circle cx="16" cy="16" r="4.5" fill="#fff7c2" stroke="#e8c650" stroke-width="1.5"/><circle cx="15" cy="15" r="1.6" fill="#ffffff"/>`),
  petal: P32(`<path d="M16 4 C 24 8, 25 20, 16 28 C 7 20, 8 8, 16 4 Z" fill="#f7bfd2" stroke="#d98ea9" stroke-width="2" stroke-linejoin="round"/><path d="M16 6 C 22 10, 23 19, 16 26 Z" fill="#efaec5"/><path d="M14 10 C 12 14, 12 18, 13.5 22" stroke="#fff0f5" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  butterfly: P32(`<g stroke="#4f7c9c" stroke-width="1.6" stroke-linejoin="round"><path d="M15 15 C 8 4, 2 6, 4 13 C 5 17, 10 17, 15 16 Z" fill="#9fd3f0"/><path d="M17 15 C 24 4, 30 6, 28 13 C 27 17, 22 17, 17 16 Z" fill="#9fd3f0"/>` +
    `<path d="M15 17 C 9 18, 6 24, 10 26 C 13 27, 15 22, 15 18 Z" fill="#f7c1d5"/><path d="M17 17 C 23 18, 26 24, 22 26 C 19 27, 17 22, 17 18 Z" fill="#f7c1d5"/></g>` +
    `<circle cx="8" cy="11" r="1.8" fill="#fff"/><circle cx="24" cy="11" r="1.8" fill="#fff"/><rect x="15" y="10" width="2.4" height="14" rx="1.2" fill="#3e5a70"/><path d="M15.5 10 Q13 6 11 5 M16.8 10 Q19 6 21 5" stroke="#3e5a70" stroke-width="1.2" fill="none" stroke-linecap="round"/>`),
  puff: P32(`<g fill="#d8e4ec"><circle cx="11" cy="19" r="7"/><circle cx="21" cy="19" r="7"/><circle cx="16" cy="15" r="8"/></g><g fill="#ffffff"><circle cx="11" cy="17" r="6.5"/><circle cx="21" cy="17" r="6.5"/><circle cx="16" cy="13" r="7.5"/></g><circle cx="13" cy="11" r="2" fill="#ffffff"/>`),
  leafbit: P32(`<g transform="rotate(-25 16 16)"><path d="M16 4 C 24 9, 24 22, 16 28 C 8 22, 8 9, 16 4 Z" fill="#6fd65a" stroke="#3f9a3a" stroke-width="2" stroke-linejoin="round"/><path d="M16 6 C 22 11, 22 21, 16 26 Z" fill="#5cc04c"/><path d="M16 7 V26" stroke="#3f9a3a" stroke-width="1.4"/><path d="M12.5 12 Q12 16 13 19" stroke="#c9f5b8" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`),
  glow: svg(32, 32, `<defs><radialGradient id="gl"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".3" stop-color="#ffffff" stop-opacity=".7"/><stop offset=".65" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="16" fill="url(#gl)"/>`)
};

// ---------- write ----------
const ZONES = {
  cove: [skyCove, farCove, nearCove], jungle: [skyJungle, farJungle, nearJungle],
  lagoon: [skyLagoon, farLagoon, nearLagoon], lantern: [skyLantern, farLantern, nearLantern]
};
for (const [z, [sk, fa, ne]] of Object.entries(ZONES)) {
  write(`levels/${z}/sky.svg`, sk());
  write(`levels/${z}/far.svg`, fa());
  write(`levels/${z}/near.svg`, ne());
}
write('levels/sea.svg', sea());
write('rock.svg', rock());
const pal = {};
for (const z of Object.keys(PALETTE)) pal[z] = { ...PALETTE[z], lights: { near: LIGHTS[z].near.map(a => a.map(v => Math.round(v))), far: LIGHTS[z].far.map(a => a.map(v => Math.round(v))) } };
write('levels/palette.json', JSON.stringify(pal, null, 2) + '\n');
for (const [n, s] of Object.entries(particles)) write(`particles/${n}.svg`, s);
console.log('environment art written to ' + OUT);
