// Bristle's Moon Pop: environment art generator (4 times of day on a tiny friendly Moon + particles).
// Writes original, hand-authored, procedurally laid-out SVGs (seeded, deterministic). Node, no deps.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3. Static SIDE view, logical 960x540:
//   sky.svg    opaque: vertical gradient (top row = palette skyTop, so portrait extension is seamless) + sky props
//   far.svg    transparent: two soft moon ridges (gaussian-sum silhouettes, crater rims) + the Moon Bakery base
//   haze.svg   960x220 transparent, horizontally tileable (every blob also drawn at x±960), drawn at y 140
//   ground.svg transparent above a FLAT skate edge at y 491 (lip 491–494), fills to 540; texture only below y 500
// The play band y 250–480 stays calm and mid/low contrast so a chestnut hedgehog, white-rimmed bubbles,
// pink/mint/lemon cupcakes and lilac-grey pebbles always win.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const W = 960, H = 540, FLOOR = 491;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function svg(body, defs = '', w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const lin = (id, s, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const poly = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('');
const twinkle = (x, y, R, k = 0.16) => `M${f(x)} ${f(y - R)}Q${f(x + R * k)} ${f(y - R * k)} ${f(x + R)} ${f(y)}Q${f(x + R * k)} ${f(y + R * k)} ${f(x)} ${f(y + R)}Q${f(x - R * k)} ${f(y + R * k)} ${f(x - R)} ${f(y)}Q${f(x - R * k)} ${f(y - R * k)} ${f(x)} ${f(y - R)}Z`;
const star5 = (cx, cy, R, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return poly(p) + 'Z'; };

// ---------- palettes ----------
// sky: vertical gradient stops (offset 0 = skyTop). ridge: [back, front]. gr: ground. bk: bakery.
const PAL = {
  dawn: {
    sky: [[0, '#5d5a9c'], [0.3, '#8f7cb4'], [0.55, '#c99bb8'], [0.75, '#eab3b0'], [0.9, '#f3c3ab']],
    back: { base: '#d9a9b4', sh: '#cc9eae', hi: '#f0c4c2' }, front: { base: '#bb93ab', sh: '#a98399', hi: '#d8aebd' },
    crater: '#a98199', bk: { wall: '#ead2cc', sh: '#d3b4b8', roof: '#c7a0b4', out: '#9a7a92', win: '#f6dcc8', lit: false, glow: '#ffffff' },
    haze: ['#ffd9e2', '#e8d2ff'], hazeOp: 0.28,
    gr: { lip: '#f1e6f0', top: '#ddd0de', mid: '#cdbfd2', bot: '#b5a6c1', line: '#a796b4', pit: '#bcadc7', pitHi: '#ece2ee' },
  },
  noon: {
    sky: [[0, '#8fa6de'], [0.35, '#acbce9'], [0.65, '#c8ccef'], [0.9, '#d8d4f0']],
    back: { base: '#bccbe8', sh: '#b2c1e0', hi: '#d6e0f5' }, front: { base: '#a2b5dd', sh: '#93a7d2', hi: '#c0cfee' },
    crater: '#8fa1cc', bk: { wall: '#eef0f8', sh: '#c9d1e8', roof: '#9fb3dc', out: '#7487b6', win: '#a8bde6', lit: false, glow: '#ffffff' },
    haze: ['#ffffff', '#dfe6ff'], hazeOp: 0.3,
    gr: { lip: '#f5f2fa', top: '#e0dbea', mid: '#d0cadf', bot: '#b8b1cc', line: '#a49cbc', pit: '#c3bcd4', pitHi: '#f3f0f8' },
  },
  sunset: {
    sky: [[0, '#4e3580'], [0.28, '#8a4c8c'], [0.52, '#c9668a'], [0.72, '#ec8a6c'], [0.9, '#f6a668']],
    back: { base: '#c8727f', sh: '#bb6878', hi: '#e89488' }, front: { base: '#975a7e', sh: '#865070', hi: '#bb7486' },
    crater: '#7f4b6c', bk: { wall: '#e2b2a6', sh: '#c08a8e', roof: '#a8678a', out: '#6e4466', win: '#ffd59a', lit: true, glow: '#ffcf8a' },
    haze: ['#ffcfa6', '#e6a6d6'], hazeOp: 0.24,
    gr: { lip: '#f7e3d8', top: '#e6cdc4', mid: '#d6b7b0', bot: '#bc9a98', line: '#a8848a', pit: '#c9a8a4', pitHi: '#f6e2da' },
  },
  night: {
    sky: [[0, '#0b0f30'], [0.35, '#151c4c'], [0.7, '#212b62'], [0.92, '#2a3670']],
    back: { base: '#2c376e', sh: '#283266', hi: '#3e4a88' }, front: { base: '#1f275a', sh: '#1b2250', hi: '#36427e' },
    crater: '#182048', bk: { wall: '#4a5590', sh: '#3a447c', roof: '#5a5f9e', out: '#151b44', win: '#ffd88a', lit: true, glow: '#ffd07a' },
    haze: ['#8a92e6', '#c2a2f2'], hazeOp: 0.2,
    gr: { lip: '#c9d1f0', top: '#a9b2d8', mid: '#959fcc', bot: '#7680b0', line: '#6a74a6', pit: '#8892c0', pitHi: '#c4ccec' },
  },
};

// =====================================================================================
// SKY (opaque 960x540)
// =====================================================================================
function skyBase(c, extraDefs = '') {
  return { defs: lin('s', c.sky) + extraDefs, o: `<rect width="${W}" height="${H}" fill="url(#s)"/>` };
}
// tiny dots; `fade(y)` = opacity multiplier (stars fade toward the horizon / play band)
function starDots(r, n, y0, y1, col, fade, rMin = 0.6, rMax = 1.6) {
  let d = ''; for (let i = 0; i < n; i++) { const x = r() * W, y = y0 + Math.pow(r(), 1.35) * (y1 - y0), R = rMin + r() * (rMax - rMin), a = (0.35 + r() * 0.6) * fade(y); if (a < 0.05) continue; d += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" opacity="${f(a)}"/>`; }
  return `<g fill="${col}">${d}</g>`;
}
function skyDawn() {
  const c = PAL.dawn; const r = rng(11);
  const ex = rad('glow', [[0, '#ffe2c4', 0.75], [1, '#ffe2c4', 0]]) + rad('atm', [[0.5, '#cfe6ff', 0.3], [1, '#cfe6ff', 0]]) +
    lin('earthSh', [[0, '#000000', 0], [0.55, '#1e1a4a', 0], [1, '#1e1a4a', 0.38]], 1, 1) + rad('earthOc', [[0, '#7fb4e0'], [1, '#5f90c8']], ' cx="0.4" cy="0.35" r="0.7"');
  let { defs, o } = skyBase(c, ex);
  // fading stars: plenty at the top, gone by y ~230
  o += starDots(r, 70, 4, 240, '#fff4f4', y => Math.max(0, 1 - y / 230));
  let tw = ''; for (const [x, y, R] of [[420, 70, 4], [700, 40, 4.5], [880, 150, 3.2], [270, 120, 3]]) tw += twinkle(x, y, R);
  o += pth(tw, '#fff6f2', ' opacity="0.7"');
  // warm sunrise glow on the horizon (behind the far ridges), right of the Earth
  o += ell(560, 470, 520, 150, 'url(#glow)');
  // the Earth, rising low-left (original simple shapes): ocean disc, two soft continents, cloud swirls, night side
  const ex0 = 176, ey = 380, R = 56;
  o += circ(ex0, ey, R * 1.28, 'url(#atm)');
  let e = circ(ex0, ey, R, 'url(#earthOc)');
  e += pth(`M${ex0 - 40} ${ey - 30}q14 -20 34 -14q12 6 4 18q-6 10 6 18q10 10 -4 20q-16 6 -28 -6q-14 -12 -12 -36Z`, '#8fc79c');
  e += pth(`M${ex0 + 14} ${ey - 46}q22 -2 32 14q8 14 -6 18q-12 2 -14 14q-2 12 -14 8q-10 -8 -6 -26q2 -18 8 -28Z`, '#9acd9c');
  e += strokeP(`M${ex0 - 52} ${ey - 4}q22 -10 46 -2q18 6 40 -4M${ex0 - 26} ${ey + 28}q20 -6 38 2q10 4 24 -2M${ex0 - 10} ${ey - 52}q16 -6 30 0`, '#ffffff', 4, ' opacity="0.75"');
  e += circ(ex0, ey, R, 'url(#earthSh)');
  o += `<g opacity="0.72">${e}${circ(ex0, ey, R, 'none', ' stroke="#5a6aa0" stroke-width="2.4" stroke-opacity="0.3"')}</g>`;
  return svg(o, defs);
}
function skyNoon() {
  const c = PAL.noon; const r = rng(21);
  const ex = rad('sun', [[0, '#ffffff', 0.9], [0.25, '#fbf8ff', 0.55], [1, '#f4f0ff', 0]]);
  let { defs, o } = skyBase(c, ex);
  // a few very faint daytime stars at the very top (space has no blue sky!)
  o += starDots(r, 24, 4, 120, '#ffffff', y => 0.45 * Math.max(0, 1 - y / 120));
  // small white sun, top-right, below the HUD buttons
  o += circ(842, 124, 110, 'url(#sun)');
  let rays = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; rays += `M${f(842 + Math.cos(a) * 34)} ${f(124 + Math.sin(a) * 34)}L${f(842 + Math.cos(a) * 48)} ${f(124 + Math.sin(a) * 48)}`; }
  o += strokeP(rays, '#ffffff', 3.4, ' opacity="0.45"');
  o += circ(842, 124, 22, '#fffdf6') + ell(835, 117, 7, 4.5, '#ffffff');
  // pale wisps of light high up
  let w = ''; for (let i = 0; i < 5; i++) { const x = 120 + r() * 560, y = 120 + r() * 90; w += `M${f(x)} ${f(y)}h${f(50 + r() * 80)}`; }
  o += strokeP(w, '#ffffff', 3, ' opacity="0.22"');
  return svg(o, defs);
}
function skySunset() {
  const c = PAL.sunset; const r = rng(31);
  const ex = rad('glow', [[0, '#ffd59a', 0.8], [1, '#ffd59a', 0]]) +
    lin('pl', [[0, '#f6c79a'], [0.5, '#e9a07c'], [1, '#c77382']], 0.3, 1) + lin('plSh', [[0, '#3a1c50', 0], [0.5, '#3a1c50', 0], [1, '#3a1c50', 0.35]], 1, 0.6) +
    lin('ring', [[0, '#f8d6b0', 0.2], [0.5, '#fde6c6', 0.9], [1, '#f8d6b0', 0.2]], 1, 0);
  let { defs, o } = skyBase(c, ex);
  o += starDots(r, 40, 4, 170, '#ffe8f4', y => Math.max(0, 1 - y / 170));
  // low sun glow on the horizon (sun itself sits behind the ridges)
  o += ell(330, 470, 460, 140, 'url(#glow)');
  // the big ringed planet, upper right-of-centre; ring back half, body, ring front half
  const px = 640, py = 180, R = 74, rx = 150, ry = 28, ang = -14;
  const arc = (a, b, sweep) => `M${px - a} ${py}A${a} ${b} 0 0 ${sweep} ${px + a} ${py}`;
  const ringW = (sweep, op) => `<g transform="rotate(${ang} ${px} ${py})" opacity="${op}">${strokeP(arc(rx, ry, sweep), 'url(#ring)', 14)}${strokeP(arc(rx - 12, ry - 4, sweep), '#fbe2c4', 2.4, ' opacity="0.6"')}</g>`;
  let p = ringW(1, 0.7);
  p += circ(px, py, R, 'url(#pl)');
  // soft bands
  p += `<g transform="rotate(${ang} ${px} ${py})" opacity="0.4">${ell(px, py - 30, R * 0.92, 7, '#fbe0b8')}${ell(px, py + 6, R, 9, '#d98a76')}${ell(px, py + 38, R * 0.8, 6, '#b76a7e')}</g>`;
  p += circ(px, py, R, 'url(#plSh)');
  p += pth(`M${px - 52} ${py - 34}A${R - 10} ${R - 10} 0 0 1 ${px - 12} ${py - 62}`, 'none', ' stroke="#fff4e0" stroke-width="5" stroke-linecap="round" opacity="0.55"');
  p += circ(px, py, R, 'none', ' stroke="#8a4a72" stroke-width="3" stroke-opacity="0.45"');
  p += ringW(0, 0.9);
  o += `<g opacity="0.9">${p}</g>`;
  return svg(o, defs);
}
function skyNight() {
  const c = PAL.night; const r = rng(41);
  const ex = rad('mw', [[0, '#9aa6ff', 0.32], [0.5, '#b6a2f0', 0.14], [1, '#b6a2f0', 0]]) + rad('mw2', [[0, '#e8e2ff', 0.22], [1, '#e8e2ff', 0]]) +
    rad('moon', [[0, '#e8ecff', 0.35], [1, '#e8ecff', 0]]);
  let { defs, o } = skyBase(c, ex);
  // soft milky band, diagonal from the upper left to the right, made of overlapping soft ellipses
  let mw = ''; for (let i = 0; i < 9; i++) { const t = i / 8, x = -60 + t * 1080, y = 60 + t * 200 + Math.sin(t * 6) * 14; mw += ell(x, y, 170 + r() * 50, 50 + r() * 16, 'url(#mw)', ` transform="rotate(12 ${f(x)} ${f(y)})"`); }
  for (let i = 0; i < 6; i++) { const t = 0.08 + i * 0.16, x = -60 + t * 1080, y = 60 + t * 200; mw += ell(x, y, 80, 18, 'url(#mw2)', ` transform="rotate(12 ${f(x)} ${f(y)})"`); }
  o += mw;
  // starfield: dense in the upper sky, sparse and faint in the play band
  o += starDots(r, 150, 2, 250, '#f4f2ff', y => 1 - y / 300, 0.6, 1.7);
  o += starDots(r, 60, 230, 470, '#dcdcff', y => 0.45 * (1 - (y - 230) / 260), 0.5, 1.1);
  // dust of stars inside the milky band
  let mb = ''; for (let i = 0; i < 90; i++) { const t = r(), x = -60 + t * 1080, y = 60 + t * 200 + (r() - 0.5) * 70; mb += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.5 + r() * 0.7)}" opacity="${f(0.3 + r() * 0.4)}"/>`; }
  o += `<g fill="#ffffff">${mb}</g>`;
  let tw = ''; for (const [x, y, R] of [[130, 60, 5], [380, 110, 4], [560, 46, 5.5], [760, 150, 4.2], [900, 80, 4.6], [260, 200, 3.4], [640, 220, 3.2]]) tw += twinkle(x, y, R);
  o += pth(tw, '#fffbe8', ' opacity="0.9"');
  // a small friendly crescent (the Earth's sister in this sky), top-left of centre
  o += circ(300, 120, 56, 'url(#moon)') + `<path d="M300 98A22 22 0 1 0 322 126A17 17 0 1 1 300 98Z" fill="#eef0ff" opacity="0.9"/>`;
  return svg(o, defs);
}

// =====================================================================================
// FAR (960x540, transparent): two soft moon ridges + the Moon Bakery
// =====================================================================================
// Height profile = baseline minus a sum of gaussians (smooth, rounded). Crater rims: two narrow bumps with a dip.
function profile(baseY, hills, craters = []) {
  const pts = [];
  for (let x = -4; x <= 964; x += 4) {
    let h = 0;
    for (const [c, a, s] of hills) h += a * Math.exp(-Math.pow((x - c) / s, 2));
    for (const [c, a, s] of craters) { // rims at c±s, shallow bowl between
      h += a * Math.exp(-Math.pow((x - c + s) / (s * 0.45), 2)) + a * Math.exp(-Math.pow((x - c - s) / (s * 0.45), 2));
      h -= a * 0.35 * Math.exp(-Math.pow((x - c) / (s * 0.6), 2));
    }
    pts.push([x, baseY - h]);
  }
  // mirror-safe edges: within 90 px of x=0 / x=960 ease the height to a constant (slope 0 at the edge)
  const edge = (at0) => pts.find(p => p[0] === at0)[1];
  const yL = edge(0), yR = edge(960), yE = (yL + yR) / 2;
  for (const p of pts) {
    const d = Math.min(Math.abs(p[0]), Math.abs(960 - p[0]));
    if (d < 90) { const t = d / 90, k = t * t * (3 - 2 * t); p[1] = yE + (p[1] - yE) * k; }
    if (p[0] < 0 || p[0] > 960) p[1] = yE;
  }
  return pts;
}
const at = (pts, x) => { const i = Math.max(0, Math.min(pts.length - 2, Math.floor((x + 4) / 4))); const a = pts[i], b = pts[i + 1], t = (x - a[0]) / 4; return a[1] + (b[1] - a[1]) * t; };
function ridge(pts, c, seed, shadeDy = 22, craterSpots = []) {
  const r = rng(seed);
  const band = poly(pts) + `L964 504L-4 504Z`;
  // one-step cel shade: the same silhouette shifted down, on the right-hand (away from light) side
  const sh = poly(pts.map(([x, y]) => [x, y + shadeDy])) + `L964 504L-4 504Z`;
  let o = pth(band, c.base) + pth(sh, c.sh);
  // a lit lip line just under the top
  o += strokeP(poly(pts.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y + 2.5])), c.hi, 2.6, ' opacity="0.8"');
  // a few soft crater dents on the slope (flat ellipses, low contrast)
  for (const [x, dy, w] of craterSpots) {
    const y = at(pts, x) + dy;
    o += ell(x, y, w, w * 0.26, c.sh, ` opacity="0.9"`) + ell(x, y + w * 0.1, w * 0.8, w * 0.14, c.hi, ' opacity="0.35"');
  }
  void r;
  return o;
}
function bakery(x, base, s, b, fade) {
  // b = colours; fade = aerial-perspective mix toward the ridge colour
  const C = {}; for (const [k, v] of Object.entries(b)) C[k] = typeof v === 'string' && v[0] === '#' && k !== 'win' && k !== 'glow' ? mix(v, fade.col, fade.k) : v;
  const win = b.lit ? b.win : mix(b.win, fade.col, fade.k);
  const sw = 2.2;
  let o = '';
  const dome = (cx, R, kWin) => {
    let d = pth(`M${f(cx - R)} ${f(base + 4)}V${f(base)}A${f(R)} ${f(R)} 0 0 1 ${f(cx + R)} ${f(base)}V${f(base + 4)}Z`, C.wall, ` stroke="${C.out}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="0.8"`);
    // cel shade on the right quarter + panel lines + a highlight arc
    d += pth(`M${f(cx + R * 0.35)} ${f(base + 3)}V${f(base - Math.sqrt(1 - 0.1225) * R + 1)}A${f(R - 1)} ${f(R - 1)} 0 0 1 ${f(cx + R - 1)} ${f(base)}V${f(base + 3)}Z`, C.sh, ' opacity="0.8"');
    d += strokeP(`M${f(cx - R * 0.5)} ${f(base - R * 0.86)}Q${f(cx - R * 0.2)} ${f(base - R * 0.4)} ${f(cx - R * 0.28)} ${f(base)}M${f(cx + R * 0.15)} ${f(base - R * 0.99)}Q${f(cx + R * 0.32)} ${f(base - R * 0.4)} ${f(cx + R * 0.3)} ${f(base)}`, C.out, 1.2, ' opacity="0.35"');
    d += strokeP(`M${f(cx - R * 0.72)} ${f(base - R * 0.5)}A${f(R * 0.82)} ${f(R * 0.82)} 0 0 1 ${f(cx - R * 0.2)} ${f(base - R * 0.8)}`, '#ffffff', 2.4, ' opacity="0.45"');
    // a band of round porthole windows
    for (let i = 0; i < kWin; i++) {
      const wx = cx - R * 0.5 + (kWin === 1 ? R * 0.5 : i * R / (kWin - 1)), wy = base - R * 0.36, wr = R * 0.12;
      if (b.lit) d += circ(wx, wy, wr * 2.4, b.glow, ' opacity="0.22"');
      d += circ(wx, wy, wr, win, ` stroke="${C.out}" stroke-width="1.3" stroke-opacity="0.8"`);
    }
    return d;
  };
  // chimney shaped like a cupcake (wrapper tube + wavy dome cap) — in the building's own muted colours, no frosting pink
  const cx = x - 10 * s, cy0 = base - 34 * s, ch = 30 * s, cw = 15 * s;
  const tube = `M${f(cx - cw * 0.8)} ${f(cy0)}L${f(cx - cw)} ${f(cy0 - ch)}H${f(cx + cw)}L${f(cx + cw * 0.8)} ${f(cy0)}Z`;
  o += pth(tube, C.roof, ` stroke="${C.out}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="0.8"`);
  let ribs = ''; for (let i = -2; i <= 2; i++) ribs += `M${f(cx + i * cw * 0.36)} ${f(cy0 - ch + 3)}L${f(cx + i * cw * 0.3)} ${f(cy0 - 2)}`;
  o += strokeP(ribs, C.out, 1.1, ' opacity="0.35"');
  const capY = cy0 - ch;
  o += pth(`M${f(cx - cw - 3)} ${f(capY + 1)}Q${f(cx - cw - 4)} ${f(capY - 10 * s)} ${f(cx - cw * 0.4)} ${f(capY - 12 * s)}Q${f(cx)} ${f(capY - 22 * s)} ${f(cx + cw * 0.4)} ${f(capY - 12 * s)}Q${f(cx + cw + 4)} ${f(capY - 10 * s)} ${f(cx + cw + 3)} ${f(capY + 1)}Q${f(cx)} ${f(capY + 5)} ${f(cx - cw - 3)} ${f(capY + 1)}Z`, C.wall, ` stroke="${C.out}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="0.8"`);
  o += strokeP(`M${f(cx - cw * 0.6)} ${f(capY - 6 * s)}Q${f(cx - cw * 0.2)} ${f(capY - 13 * s)} ${f(cx + cw * 0.1)} ${f(capY - 13 * s)}`, '#ffffff', 2, ' opacity="0.5"');
  // a soft little steam curl from the chimney top
  o += strokeP(`M${f(cx + 2)} ${f(capY - 22 * s)}q-7 -8 0 -14q7 -6 1 -14`, C.wall, 3.2, ' opacity="0.5"');
  // the big dome (behind) and the small dome (front), linked by a tube corridor
  o += dome(x, 46 * s, 3);
  o += `<rect x="${f(x + 40 * s)}" y="${f(base - 14 * s)}" width="${f(30 * s)}" height="${f(16 * s)}" rx="${f(5 * s)}" fill="${C.sh}" stroke="${C.out}" stroke-width="${sw}" stroke-opacity="0.8"/>`;
  o += dome(x + 82 * s, 26 * s, 1);
  // door on the big dome
  o += pth(`M${f(x + 6 * s)} ${f(base + 3)}V${f(base - 12 * s)}A${f(8 * s)} ${f(8 * s)} 0 0 1 ${f(x + 22 * s)} ${f(base - 12 * s)}V${f(base + 3)}Z`, b.lit ? mix(b.win, C.out, 0.25) : mix(C.out, C.wall, 0.45), ` stroke="${C.out}" stroke-width="1.6" stroke-opacity="0.8"`);
  // antenna with a small dish on the small dome
  const ax = x + 86 * s, ay = base - 26 * s;
  o += strokeP(`M${f(ax)} ${f(ay + 1)}V${f(ay - 34 * s)}`, C.out, 2, ' opacity="0.85"');
  o += pth(`M${f(ax - 12 * s)} ${f(ay - 22 * s)}Q${f(ax)} ${f(ay - 10 * s)} ${f(ax + 12 * s)} ${f(ay - 22 * s)}Z`, C.wall, ` stroke="${C.out}" stroke-width="1.6" stroke-opacity="0.8"`);
  o += circ(ax, ay - 36 * s, 3.2 * s, b.lit ? '#ff9e9e' : mix('#e89aa0', fade.col, fade.k), ` stroke="${C.out}" stroke-width="1.2" stroke-opacity="0.8"`);
  if (b.lit) o += circ(ax, ay - 36 * s, 9 * s, '#ffb0b0', ' opacity="0.25"');
  return o;
}
function far(zone) {
  const c = PAL[zone];
  const L = {
    dawn: { b: [[60, 70, 110], [300, 58, 140], [560, 92, 130], [830, 66, 150], [1010, 60, 120]], bc: [[700, 14, 40]], f: [[120, 30, 120], [420, 22, 110], [760, 34, 150], [990, 30, 100]], fc: [[300, 10, 34]] },
    noon: { b: [[-20, 62, 140], [240, 84, 130], [520, 60, 150], [780, 88, 130], [1000, 60, 120]], bc: [[400, 14, 44]], f: [[90, 34, 140], [380, 24, 120], [700, 32, 160], [960, 30, 110]], fc: [[560, 9, 30]] },
    sunset: { b: [[40, 82, 130], [330, 60, 150], [600, 78, 120], [870, 60, 150]], bc: [[180, 14, 40]], f: [[140, 28, 130], [450, 22, 120], [770, 34, 150], [1000, 28, 100]], fc: [[620, 10, 32]] },
    night: { b: [[40, 66, 140], [290, 88, 120], [560, 60, 150], [840, 82, 130]], bc: [[680, 13, 40]], f: [[110, 32, 130], [430, 22, 120], [760, 34, 150], [990, 28, 100]], fc: [[260, 10, 34]] },
  }[zone];
  const back = profile(420, L.b, L.bc), front = profile(476, L.f, L.fc);
  let o = ridge(back, c.back, 1, 26, [[140, 30, 26], [470, 34, 22], [880, 26, 20]]);
  o += ridge(front, c.front, 2, 16, [[230, 14, 18], [560, 10, 16]]);
  // the Moon Bakery on the right (on noon/sunset) or left, sitting on the front ridge
  const bx = zone === 'noon' || zone === 'dawn' ? 700 : 210;
  const by = Math.min(at(front, bx), at(front, bx + 82)) + 8;
  o += bakery(bx, by, 0.9, c.bk, { col: c.front.base, k: c.bk.lit ? 0.14 : 0.3 });
  return { svg: svg(o), back, front };
}

// =====================================================================================
// HAZE (960x220, transparent, horizontally tileable)
// =====================================================================================
function haze(zone, seed) {
  const c = PAL[zone]; const r = rng(seed);
  const defs = rad('h0', [[0, c.haze[0], 1], [0.55, c.haze[0], 0.45], [1, c.haze[0], 0]]) + rad('h1', [[0, c.haze[1], 1], [0.55, c.haze[1], 0.4], [1, c.haze[1], 0]]);
  let o = '';
  const items = [];
  for (let i = 0; i < 9; i++) { const x = i * 107 + r() * 60, y = 50 + r() * 110, rx = 90 + r() * 110, ry = 22 + r() * 26; items.push([x, Math.min(y, 210 - ry), rx, ry, i % 2, (r() - 0.5) * 10]); }
  for (const [x, y, rx, ry, k, a] of items) for (const dx of [-W, 0, W]) {
    const X = x + dx; if (X + rx < -10 || X - rx > W + 10) continue;
    o += ell(X, Math.max(ry + 4, y), rx, ry, `url(#h${k})`, ` transform="rotate(${f(a)} ${f(X)} ${f(Math.max(ry + 4, y))})"`);
  }
  return svg(`<g opacity="${c.hazeOp}">${o}</g>`, defs, W, 220);
}

// =====================================================================================
// GROUND (960x540, transparent above a flat skate edge at y 491)
// =====================================================================================
function ground(zone, seed) {
  const c = PAL[zone].gr; const r = rng(seed);
  const defs = lin('gg', [[0, c.top], [0.3, c.mid], [1, c.bot]]);
  let o = `<rect x="0" y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="url(#gg)"/>`;
  // flat lip: a lighter skate line on the top edge, then a soft shade step (still flat)
  o += `<rect x="0" y="${FLOOR}" width="${W}" height="3" fill="${c.lip}"/>`;
  o += `<rect x="0" y="${FLOOR + 3}" width="${W}" height="1.4" fill="${c.line}" opacity="0.35"/>`;
  // regolith below y 500 only: soft wavy strata + scattered tiny craterlets + specks, sparser under the middle
  let st = ''; for (const [y, a] of [[512, 2], [526, 2.5]]) { st += `M0 ${y}`; for (let x = 0; x <= W; x += 60) st += `Q${x + 30} ${f(y + (x / 60 % 2 ? a : -a))} ${x + 60} ${y}`; }
  o += strokeP(st, c.line, 1.6, ' opacity="0.28"');
  const pits = [];
  for (let i = 0; i < 22; i++) {
    const x = 16 + r() * 928, mid = Math.abs(x - 480) < 300;
    if (mid && r() < 0.45) continue;
    pits.push([x, 507 + r() * 26, 3 + r() * (mid ? 6 : 10)]);
  }
  for (const [x, y, w] of pits) o += ell(x, y, w, w * 0.32, c.pit, ' opacity="0.85"') + ell(x + w * 0.1, y - w * 0.12, w * 0.75, w * 0.17, c.line, ' opacity="0.35"') + ell(x, y + w * 0.2, w * 0.7, w * 0.1, c.pitHi, ' opacity="0.7"');
  let sp = ''; for (let i = 0; i < 70; i++) { sp += `<circle cx="${f(r() * W)}" cy="${f(502 + r() * 36)}" r="${f(0.7 + r() * 0.9)}"/>`; }
  o += `<g fill="${c.line}" opacity="0.4">${sp}</g>`;
  let sp2 = ''; for (let i = 0; i < 30; i++) { sp2 += `<circle cx="${f(r() * W)}" cy="${f(503 + r() * 34)}" r="${f(0.6 + r() * 0.7)}"/>`; }
  o += `<g fill="${c.pitHi}" opacity="0.8">${sp2}</g>`;
  return svg(o, defs);
}

// =====================================================================================
// PARTICLES (32x32 centred, soft transparent edges)
// =====================================================================================
const P = {};
const ps = (body, defs = '') => svg(body, defs, 32, 32);
const glow = (id, col, a = 0.8) => rad(id, [[0, col, a], [1, col, 0]]);
P.sparkle = ps(`<circle cx="16" cy="16" r="14" fill="url(#g)"/><path d="${twinkle(16, 16, 14, 0.13)}" fill="#ffffff" stroke="#ffe08a" stroke-width="1" stroke-linejoin="round"/><path d="${twinkle(16, 16, 6.5, 0.2)}" fill="#fffbe6"/>`, glow('g', '#fff6c8', 0.85));
P.twinkle = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><path d="${twinkle(16, 16, 10, 0.18)}" fill="#ffffff"/><path d="${twinkle(16, 16, 6, 0.3)}" fill="#fff8e8" transform="rotate(45 16 16)" opacity="0.8"/><circle cx="16" cy="16" r="2.2" fill="#ffffff"/>`, glow('g', '#f4eeff', 0.7));
P.dust = ps(`<g fill="url(#g)"><circle cx="12" cy="18" r="9"/><circle cx="19" cy="14" r="10"/><circle cx="21" cy="20" r="8"/></g><g fill="#f4eef2" opacity="0.55"><circle cx="12.5" cy="17.5" r="4.6"/><circle cx="18.5" cy="14" r="5.4"/><circle cx="20.5" cy="19.5" r="4"/></g>`, rad('g', [[0, '#ece4ec', 0.75], [0.6, '#ddd3e0', 0.4], [1, '#ddd3e0', 0]]));
P.droplet = ps(`<circle cx="16" cy="16" r="9" fill="#ffffff" fill-opacity="0.14"/><circle cx="16" cy="16" r="9.6" fill="none" stroke="#5b6aa0" stroke-opacity="0.35" stroke-width="1.2"/><circle cx="16" cy="16" r="8.2" fill="none" stroke="url(#ir)" stroke-width="2.4"/><path d="M11.2 13.6A5.6 5.6 0 0 1 15 10.6" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><circle cx="19.6" cy="19.8" r="1.1" fill="#ffffff" opacity="0.9"/>`, lin('ir', [[0, '#ffc4e6'], [0.5, '#b6f0ff'], [1, '#fff2a8']], 1, 1));
P.mote = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><circle cx="16" cy="16" r="3.2" fill="#fffbf0"/><circle cx="15.2" cy="15.2" r="1.2" fill="#ffffff"/>`, glow('g', '#fff0e0', 0.7));
P.shoot = ps(`<path d="M1 16L25 13.2A2.8 2.8 0 0 1 25 18.8Z" fill="url(#t)"/><circle cx="25.5" cy="16" r="6" fill="url(#g)"/><path d="${twinkle(25.5, 16, 5, 0.22)}" fill="#ffffff"/>`, lin('t', [[0, '#cfd8ff', 0], [0.7, '#eef2ff', 0.6], [1, '#ffffff', 0.95]], 1, 0) + glow('g', '#fff8e0', 0.85));
P.spark = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><path d="${twinkle(16, 16, 11, 0.2)}" fill="#ff5a5a" stroke="#c42a3a" stroke-width="1" stroke-linejoin="round"/><path d="${twinkle(16, 16, 5.5, 0.28)}" fill="#ffffff"/>`, glow('g', '#ff8a8a', 0.6));
P.star = ps(`<circle cx="16" cy="16.5" r="14" fill="url(#g)"/><path d="${star5(16, 16.8, 11.5, 5.2)}" fill="#ffd94a" stroke="#d08a18" stroke-width="1.8" stroke-linejoin="round"/><path d="M11.4 13.6L14.6 13.2L15.8 9.8" fill="none" stroke="#fff6c0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`, glow('g', '#fff0a0', 0.5));
P.crumb = ps(`<g transform="rotate(-30 16 16)"><rect x="8.5" y="12.5" width="15" height="7" rx="3.5" fill="#ff9cc4" stroke="#d0628e" stroke-width="1.4"/><path d="M11.5 14.6H19.5" stroke="#ffe4f0" stroke-width="1.6" stroke-linecap="round"/></g>`);

// ---------- palette.json ----------
// banner = level-banner colour; accent = highlight colour on that sky; hud = HUD pill background (a deep tone of the
// sky that white text reads on); sky = measured mean of sky.svg (sheet.js prints it); skyTop = sky.svg top row
// (= gradient stop 0, for extending the sky upward in portrait); tint = crater tint toward the zone's floor/ridge cast.
const PALETTE_JSON = {
  dawn: { banner: '#e88a8a', accent: '#ffd27a', hud: '#5a4e8c', sky: '#b698b2', skyTop: PAL.dawn.sky[0][1], tint: '#b8a0c4' },
  noon: { banner: '#6f8fd8', accent: '#ffcf5a', hud: '#4f63a6', sky: '#bac3eb', skyTop: PAL.noon.sky[0][1], tint: '#b0b6d8' },
  sunset: { banner: '#e8735e', accent: '#ffd08a', hud: '#5a3478', sky: '#ba7381', skyTop: PAL.sunset.sky[0][1], tint: '#c8a29e' },
  night: { banner: '#5d64c8', accent: '#ffd88a', hud: '#1c2258', sky: '#232a5d', skyTop: PAL.night.sky[0][1], tint: '#7e88bc' },
};

// ---------- write ----------
const ZONES = ['dawn', 'noon', 'sunset', 'night'];
const SKY = { dawn: skyDawn, noon: skyNoon, sunset: skySunset, night: skyNight };
const files = {};
const FAR = {};
ZONES.forEach((z, i) => {
  FAR[z] = far(z);
  files[`zones/${z}/sky.svg`] = SKY[z]();
  files[`zones/${z}/far.svg`] = FAR[z].svg;
  files[`zones/${z}/haze.svg`] = haze(z, 100 + i * 101);
  files[`zones/${z}/ground.svg`] = ground(z, 51 + i * 10);
});
files['zones/palette.json'] = JSON.stringify(PALETTE_JSON, null, 2) + '\n';
for (const k of Object.keys(P)) files['particles/' + k + '.svg'] = P[k];
for (const [rel, data] of Object.entries(files)) {
  if (/<text|<script|<image|<filter|href=|@import|url\((?!#)/.test(data)) throw new Error('forbidden content in ' + rel);
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  const kb = Buffer.byteLength(data) / 1024; console.log(rel.padEnd(30), kb.toFixed(1) + ' KB', kb >= 60 ? 'TOO BIG' : '');
}
for (const z of ZONES) { const b = FAR[z].back.filter(p => p[0] >= 0 && p[0] <= 960).map(p => p[1]), fr = FAR[z].front.filter(p => p[0] >= 0 && p[0] <= 960).map(p => p[1]); console.log(`far ${z}: back ridge top ${Math.min(...b).toFixed(0)}..${Math.max(...b).toFixed(0)}, front ${Math.min(...fr).toFixed(0)}..${Math.max(...fr).toFixed(0)}`); }
module.exports = { PAL, PALETTE_JSON };
