// Bolt's Rooftop Flip: environment art generator (4 times of day + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg       960x540 opaque, tiles in x.
//  - levels/<zone>/far.svg       960x540, transparent above ~y 230, distant skyline, opaque below y 440, tiles in x.
//  - levels/<zone>/mid.svg       960x540, transparent above ~y 280, nearer muted buildings, opaque below y 470, tiles in x.
//  - levels/<zone>/building.svg  240x400, rooftop surface line exactly y 16 (nothing above it), opaque below, tiles every 240.
//  - levels/<zone>/rail.svg      240x160, girder truss y 104–144, flat underside exactly y 144, cables to y 0, tiles every 240.
//  - levels/<zone>/rail_end.svg  40x160, right end cap of a rail span (the renderer mirrors it for the left end).
//  - particles/*.svg             32x32 (shoot: 64x16), centred, transparent edges.
// Tileability: every shape that crosses an edge is emitted again at ±width (wrapG); full-width bands are plain rects.
// Corridor rule (screen y ≈ 141..431 at 960x540, i.e. sky/far/mid y 141..431): calm, muted, darker/less saturated than the
// firefly colours (#ff5fa2 / #ffd23f / #39e1ff); no tiny glowing dots there (night stars stay above the rail).
// Also writes tools/art-environment/palette.json ({zone: {wall, bottom, skyTop, skyBottom}}) for sheet.js / the integrator.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960, H = 540, BW = 240, BH = 400, RW = 240, RH = 160, ROOF = 16, UNDER = 144;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#1a1430', t);   // outline / shade: dark tone of the fill, never black
const lite = (c, t = 0.3) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const linU = (id, s, y1, y2) => lin(id, s, 0, y1, 0, y2, ' gradientUnits="userSpaceOnUse"');
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.45], ['1', col, 0]]);
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, k = 0.22) => {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, nx = cx + Math.cos(b) * R, ny = cy + Math.sin(b) * R;
    const m = a + Math.PI / 4, qx = cx + Math.cos(m) * R * k, qy = cy + Math.sin(m) * R * k;
    d += (i ? '' : `M${f(x)} ${f(y)}`) + `Q${f(qx)} ${f(qy)} ${f(nx)} ${f(ny)}`;
  }
  return d + 'Z';
};
// emit a group (absolute coords) again shifted by ±tw when it crosses an edge of a tile tw wide
const wrapG = (x0, x1, body, tw = W) => body + (x0 < 0 ? `<g transform="translate(${tw} 0)">${body}</g>` : '') + (x1 > tw ? `<g transform="translate(${-tw} 0)">${body}</g>` : '');
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// ---------- palettes ----------
const Z = {
  dawn: {
    sky: [['0', '#a596d2'], ['0.34', '#bba5d8'], ['0.58', '#d9adc6'], ['0.8', '#f0b6ab'], ['1', '#f8c8a8']],
    far: '#b896b4', farHaze: '#e2b4b0', mid: '#866890', midHi: '#9c80a2', midWin: '#6a5276', midLit: '#f2c9b0',
    wall: '#b56a5a', cope: '#e0b49c', trim: '#8e4c44', bottom: '#6e3a3a', glass: '#5f4a6e', glassHi: '#c9b2d8', frame: '#f0d6c4',
    curtain: '#e8c070', pipe: '#8a7f98', lit: null,
    steel: '#8580a8', steelHi: '#b3aed0', steelDk: '#504b70', railGlow: '#ffe7d6', brick: [12, 24],
  },
  noon: {
    sky: [['0', '#55a8ee'], ['0.4', '#7cc6ff'], ['0.75', '#acdaf8'], ['1', '#cdeeff']],
    far: '#9cb9d0', farHaze: '#c4e0f0', mid: '#6c8aa4', midHi: '#86a2b8', midWin: '#526d88', midLit: null,
    wall: '#c9a27a', cope: '#ecd6b2', trim: '#9c7552', bottom: '#7e5d42', glass: '#466a8c', glassHi: '#bfe2f6', frame: '#f6ead6',
    curtain: '#f2efe6', pipe: '#7d8a96', lit: null,
    steel: '#6e8498', steelHi: '#a9bfd0', steelDk: '#3e5064', railGlow: '#f4fbff', brick: [20, 40],
  },
  sunset: {
    sky: [['0', '#3e3482'], ['0.3', '#634a9c'], ['0.52', '#8f5e98'], ['0.7', '#cf7a6e'], ['0.86', '#f99a5e'], ['1', '#ffb36a']],
    far: '#8a5c88', farHaze: '#c97a78', mid: '#5c4068', midHi: '#6e4f7a', midWin: '#47304f', midLit: '#eeae6e',
    wall: '#7d4e5e', cope: '#b88478', trim: '#5c3446', bottom: '#43283a', glass: '#3c2a44', glassHi: '#e0a080', frame: '#d8a890',
    curtain: '#e09a5a', pipe: '#6a5470', lit: '#f2b46e',
    steel: '#5f4c72', steelHi: '#937ea8', steelDk: '#372a48', railGlow: '#ffd8b4', brick: [12, 24],
  },
  night: {
    sky: [['0', '#0a1130'], ['0.32', '#0e1638'], ['0.68', '#1d2456'], ['1', '#2b2f6b']],
    far: '#232a5e', farHaze: '#2b3270', mid: '#181d44', midHi: '#222852', midWin: '#12163a', midLit: '#ffd98a',
    wall: '#3b4466', cope: '#5d6890', trim: '#2a3150', bottom: '#20263f', glass: '#1e2442', glassHi: '#5a6694', frame: '#6c77a0',
    curtain: '#d08a5a', pipe: '#4c5578', lit: '#ffd98a',
    steel: '#4b5578', steelHi: '#7783aa', steelDk: '#262c48', railGlow: '#cfdcff', brick: [24, 48],
  },
};
Object.keys(Z).forEach(k => { Z[k].skyTop = Z[k].sky[0][1]; Z[k].skyBottom = Z[k].sky[Z[k].sky.length - 1][1]; });

// =====================================================================================
// SKY
// =====================================================================================
// puffy cloud: flat-bottomed blob of circles, shadow underneath; group wrapped at ±960
function puffy(x, y, w, col, shade, a = 1) {
  const h = w * 0.32, n = 4, rr = [0.2, 0.3, 0.26, 0.17];
  let sh = rrect(x - w / 2, y - h * 0.35, w, h * 0.7, h * 0.35, shade);
  let c = '';
  for (let i = 0; i < n; i++) { const cx = x - w / 2 + w * (0.18 + i * 0.22), r = w * rr[i]; sh += circ(cx, y - r * 0.55 + 3, r, shade); c += circ(cx, y - r * 0.55, r, col); }
  c += rrect(x - w / 2, y - h * 0.38, w, h * 0.66, h * 0.33, col);
  return wrapG(x - w * 0.62, x + w * 0.62, `<g${op(a)}>${sh}${c}</g>`);
}
// streaky cloud: long thin rounded shape with a lit top
const streak = (x, y, w, h, col, top, a) => wrapG(x - w / 2, x + w / 2, `<g${op(a)}>` + rrect(x - w / 2, y - h / 2, w, h, h / 2, col) + rrect(x - w * 0.42, y - h / 2, w * 0.7, h * 0.45, h * 0.22, top) + '</g>');
const bird = (x, y, s, col) => stk(`M${f(x - 6 * s)} ${f(y - 2 * s)}Q${f(x - 3 * s)} ${f(y - 4 * s)} ${f(x)} ${f(y)}Q${f(x + 3 * s)} ${f(y - 4 * s)} ${f(x + 6 * s)} ${f(y - 2 * s)}`, col, 1.6 * s);

function skyDawn(P) {
  let defs = lin('g', P.sky) + glow('sh', '#ffdcbc', 0.6) + glow('hz', '#fff0e6', 0.35);
  let b = rect(0, 0, W, H, 'url(#g)');
  // warm horizon glow (wraps) and the rising sun, half hidden behind the far skyline
  b += wrapG(820 - 300, 820 + 300, ell(820, 320, 300, 180, 'url(#sh)'));
  b += circ(820, 296, 42, '#ffe2c4') + circ(820, 296, 33, '#fff0dc') + ell(809, 285, 13, 8, '#fffaf0', op(0.8));
  // haze bands
  for (const [x, y, w] of [[240, 300, 420], [760, 270, 360], [520, 330, 520]]) b += wrapG(x - w / 2, x + w / 2, ell(x, y, w / 2, 9, '#fff1ea', op(0.22)));
  // soft pink-white clouds with lilac undersides (upper sky)
  for (const [x, y, w, a] of [[130, 70, 150, 0.85], [420, 46, 110, 0.75], [560, 120, 170, 0.8], [860, 84, 130, 0.85], [300, 190, 120, 0.4], [930, 210, 100, 0.35]]) b += puffy(x, y, w, '#fbe6e6', '#cdb0d8', a);
  // three little birds
  b += `<g${op(0.5)}>` + bird(330, 112, 1, '#6e5a8e') + bird(350, 104, 0.8, '#6e5a8e') + bird(312, 100, 0.7, '#6e5a8e') + '</g>';
  return svg(W, H, b, defs);
}
function skyNoon(P) {
  let defs = lin('g', P.sky) + glow('sh', '#fff6c8', 0.7);
  let b = rect(0, 0, W, H, 'url(#g)');
  b += circ(176, 62, 92, 'url(#sh)') + circ(176, 62, 24, '#fff6d6') + circ(176, 62, 18, '#fffdf0');
  for (const [x, y, w, a] of [[420, 70, 190, 1], [700, 48, 130, 0.95], [880, 118, 210, 1], [80, 140, 150, 0.95]]) b += puffy(x, y, w, '#ffffff', '#cfe3f3', a);
  for (const [x, y, w, a] of [[560, 186, 120, 0.45], [300, 222, 100, 0.35], [740, 246, 90, 0.3]]) b += puffy(x, y, w, '#e4f2fc', '#bcd8ee', a);
  return svg(W, H, b, defs);
}
function skySunset(P) {
  let defs = lin('g', P.sky) + glow('sh', '#ffb070', 0.6) + glow('sh2', '#ffd8a0', 0.5);
  let b = rect(0, 0, W, H, 'url(#g)');
  b += wrapG(300 - 360, 300 + 360, ell(300, 380, 360, 220, 'url(#sh)'));
  b += circ(300, 372, 80, '#ffbc7c') + circ(300, 372, 66, '#ffcc90') + circ(300, 372, 56, 'url(#sh2)');
  // long streaky clouds: violet up high, coral lit near the sun
  for (const [x, y, w, h] of [[160, 60, 300, 12], [620, 44, 360, 10], [860, 100, 240, 9], [420, 124, 280, 8]]) b += streak(x, y, w, h, '#7d5aa8', '#9d78c0', 0.55);
  for (const [x, y, w, h] of [[250, 212, 380, 9], [700, 236, 300, 8], [470, 270, 260, 7], [900, 290, 220, 6], [130, 310, 200, 6]]) b += streak(x, y, w, h, '#d27c78', '#f2a07e', 0.55);
  b += `<g${op(0.45)}>` + bird(620, 150, 1, '#3e2c5c') + bird(642, 142, 0.8, '#3e2c5c') + '</g>';
  return svg(W, H, b, defs);
}
function skyNight(P) {
  const R = rng(77);
  let defs = lin('g', P.sky) + glow('mw', '#7a74c8', 0.16) + glow('mg', '#f4ecd0', 0.16)
    + `<mask id="cm"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="776" cy="74" r="30" fill="#000"/></mask>`;
  let b = rect(0, 0, W, H, 'url(#g)');
  // faint milky band across the upper sky
  b += wrapG(-100, W + 100, ell(480, 90, 620, 70, 'url(#mw)'));
  // stars: plenty above the rail (y < 130); none below y 135 (corridor stays clear of glowing dots)
  for (let i = 0; i < 190; i++) {
    const x = R() * W, y = Math.pow(R(), 1.15) * 132, r = 0.5 + R() * R() * 1.3, a = 0.35 + R() * 0.55;
    if (Math.hypot(x - 764, y - 82) < 52) continue;
    b += wrapG(x - r, x + r, circ(x, y, r, '#e6e8ff', op(f(a))));
  }
  for (const [x, y, r] of [[120, 40, 4.5], [330, 22, 3.5], [520, 64, 4], [640, 18, 3], [900, 50, 4], [230, 96, 3]]) b += pth(twinkle(x, y, r, 0.22), '#f6f2ff', op(0.85));
  // crescent moon with a very soft glow
  b += circ(764, 82, 70, 'url(#mg)');
  b += `<g mask="url(#cm)">` + circ(764, 82, 32, '#f4ecd0') + circ(756, 92, 5, '#e2d6b2') + circ(748, 70, 3.5, '#e2d6b2') + '</g>';
  // thin lavender wisps lower down (calm, dark)
  for (const [x, y, w, h] of [[200, 200, 320, 8], [700, 250, 360, 9], [420, 300, 280, 7]]) b += streak(x, y, w, h, '#2a3270', '#343c80', 0.6);
  return svg(W, H, b, defs);
}

// =====================================================================================
// FAR skyline (distant, low contrast). Shapes in one colour; tops between y 236 and 410.
// =====================================================================================
function farLayer(z, P) {
  const R = rng({ dawn: 11, noon: 22, sunset: 33, night: 44 }[z]);
  const col = P.far, hi = mix(P.far, P.farHaze, 0.35), lit = z === 'night' ? '#ffd98a' : z === 'sunset' ? '#e8a46e' : null;
  let defs = linU('fh', [['0', P.farHaze, 0], ['1', P.farHaze, 0.55]], 330, 540);
  let b = '';
  const winDots = (x0, x1, top) => {
    if (!lit) return '';
    let s = '';
    for (let y = top + 10; y < 470; y += 11) for (let x = x0 + 5; x < x1 - 5; x += 8) if (R() < (z === 'night' ? 0.16 : 0.06)) s += rect(x, y, 2, 3, lit, op(z === 'night' ? 0.45 : 0.35));
    return s;
  };
  const kinds = ['tower', 'tower', 'slab', 'dome', 'water', 'crane', 'spire', 'tower', 'slab', 'water', 'tower', 'dome'];
  let x = -10, k = 0;
  while (x < W - 10) {
    const kind = kinds[k++ % kinds.length];
    let w, s = '', x0 = x, x1;
    if (kind === 'tower') { w = 26 + R() * 30; const top = 250 + R() * 110; s += rect(x, top, w, H - top, col); if (R() < 0.5) s += rect(x + w / 2 - 1, top - 22, 2, 22, col) + circ(x + w / 2, top - 23, 2.4, col); s += rect(x, top, w, 3, hi); s += winDots(x, x + w, top); }
    else if (kind === 'slab') { w = 60 + R() * 50; const top = 330 + R() * 60; s += rect(x, top, w, H - top, col) + rect(x, top, w, 3, hi) + rect(x + w * 0.2, top - 10, w * 0.25, 10, col); s += winDots(x, x + w, top); }
    else if (kind === 'dome') { w = 50 + R() * 30; const top = 300 + R() * 60; s += rect(x, top, w, H - top, col) + pth(`M${f(x + 4)} ${f(top)}A${f(w / 2 - 4)} ${f(w / 2.6)} 0 0 1 ${f(x + w - 4)} ${f(top)}Z`, col) + rect(x + w / 2 - 1, top - w / 2.6 - 14, 2, 14, col); s += winDots(x, x + w, top); }
    else if (kind === 'water') { w = 46 + R() * 20; const top = 330 + R() * 50; s += rect(x, top, w, H - top, col); const cx = x + w / 2, ty = top - 34; s += rect(cx - 13, ty - 2, 26, 26, col, ' rx="3"') + pth(`M${f(cx - 15)} ${f(ty)}L${f(cx)} ${f(ty - 12)}L${f(cx + 15)} ${f(ty)}Z`, col) + stk(`M${f(cx - 10)} ${f(ty + 24)}L${f(cx - 12)} ${f(top)}M${f(cx + 10)} ${f(ty + 24)}L${f(cx + 12)} ${f(top)}M${f(cx - 11)} ${f(top - 5)}L${f(cx + 11)} ${f(top - 5)}`, col, 2.2); s += winDots(x, x + w, top); }
    else if (kind === 'crane') { w = 40 + R() * 20; const top = 340 + R() * 40; s += rect(x, top, w, H - top, col); const mx = x + w * 0.4, mt = 236 + R() * 30; s += rect(mx - 2.5, mt, 5, top - mt, col) + stk(`M${f(mx - 30)} ${f(mt + 6)}L${f(mx + 70)} ${f(mt + 6)}M${f(mx)} ${f(mt - 8)}L${f(mx - 30)} ${f(mt + 6)}M${f(mx)} ${f(mt - 8)}L${f(mx + 70)} ${f(mt + 6)}M${f(mx + 52)} ${f(mt + 6)}L${f(mx + 52)} ${f(mt + 40)}`, col, 2) + rect(mx - 32, mt + 6, 12, 8, col); x1 = mx + 72; x0 = mx - 34; s += winDots(x, x + w, top); }
    else if (kind === 'spire') { w = 30 + R() * 14; const top = 270 + R() * 50; s += rect(x, top, w, H - top, col) + rect(x + 4, top - 18, w - 8, 18, col) + pth(`M${f(x + 8)} ${f(top - 18)}L${f(x + w / 2)} ${f(top - 60)}L${f(x + w - 8)} ${f(top - 18)}Z`, col); s += winDots(x, x + w, top); }
    x1 = Math.max(x1 || 0, x + w);
    b += wrapG(Math.min(x0, x), x1, s);
    x += w + (R() < 0.3 ? 8 + R() * 18 : -4 + R() * 6);
  }
  b += rect(0, 440, W, 100, col);
  b += rect(0, 330, W, 210, 'url(#fh)');
  return svg(W, H, b, defs);
}

// =====================================================================================
// MID buildings (nearer, muted, darker). Tops between y 292 and 420.
// =====================================================================================
function midLayer(z, P) {
  const R = rng({ dawn: 101, noon: 202, sunset: 303, night: 404 }[z]);
  let defs = linU('mh', [['0', dark(P.mid, 0.2), 0], ['1', dark(P.mid, 0.5), 0.95]], 410, 540);
  let b = '';
  let x = -20, k = 0;
  while (x < W - 20) {
    const w = 70 + R() * 70, top = 296 + R() * 110, shade = k % 3 === 0 ? P.mid : k % 3 === 1 ? mix(P.mid, P.midHi, 0.5) : dark(P.mid, 0.08);
    let s = rect(x, top, w, H - top, shade) + rect(x - 2, top - 4, w + 4, 5, P.midHi);
    // windows: small rounded rectangles in a grid
    const cols = Math.max(2, Math.floor((w - 12) / 18)), gx = (w - cols * 18) / 2 + 5;
    for (let y = top + 12; y < 500; y += 22) for (let c = 0; c < cols; c++) {
      const wx = x + gx + c * 18;
      const isLit = P.midLit && R() < (z === 'night' ? 0.2 : z === 'sunset' ? 0.13 : 0.06);
      s += rrect(wx, y, 7, 10, 1.5, isLit ? mix(P.midLit, shade, 0.3) : P.midWin, op(isLit ? 0.6 : 0.75));
    }
    // roof extras
    const rx = x + 10 + R() * (w - 40), r = R();
    let ex0 = x, ex1 = x + w;
    if (r < 0.25) { const cx = rx + 10; s += rect(cx - 10, top - 26, 20, 20, P.midHi, ' rx="3"') + pth(`M${f(cx - 12)} ${f(top - 25)}L${f(cx)} ${f(top - 34)}L${f(cx + 12)} ${f(top - 25)}Z`, P.midHi) + stk(`M${f(cx - 7)} ${f(top - 6)}L${f(cx - 8)} ${f(top)}M${f(cx + 7)} ${f(top - 6)}L${f(cx + 8)} ${f(top)}`, P.midHi, 2); }
    else if (r < 0.45) s += rect(rx, top - 12, 22, 12, P.midHi, ' rx="2"');
    else if (r < 0.62) s += rect(rx + 6, top - 34, 2, 30, P.midHi) + stk(`M${f(rx)} ${f(top - 26)}L${f(rx + 14)} ${f(top - 26)}`, P.midHi, 2);
    else if (z === 'noon') { // rooftop garden: round muted trees
      const g = z === 'noon' ? '#79a088' : '#9a8aa0';
      for (let t = 0; t < 3; t++) { const tx = x + 12 + t * (w - 24) / 2, tr = 7 + R() * 5; s += circ(tx, top - tr + 2, tr, g); }
    }
    b += wrapG(ex0 - 16, ex1 + 16, s);
    x += w + (R() < 0.35 ? 6 + R() * 16 : -2);
    k++;
  }
  b += rect(0, 470, W, 70, dark(P.mid, 0.12));
  b += rect(0, 420, W, 120, 'url(#mh)');
  return svg(W, H, b, defs);
}

// =====================================================================================
// BUILDING: the play rooftop, 240x400, surface line y 16, opaque below; tiles every 240.
// =====================================================================================
function building(z, P) {
  const [ch, cw] = P.brick;
  let defs = linU('wl', [['0', P.wall], ['0.6', P.wall], ['0.93', P.bottom], ['1', P.bottom]], 30, 400)
    + linU('gl', [['0', lite(P.glass, 0.12)], ['1', dark(P.glass, 0.2)]], 0, 70)
    + (P.lit ? linU('lt', [['0', lite(P.lit, 0.25)], ['1', mix(P.lit, '#e08a4a', 0.35)]], 0, 70) : '');
  const ol = dark(P.wall, 0.5);
  let b = rect(0, ROOF, BW, BH - ROOF, 'url(#wl)');
  // masonry courses (period divides 240)
  let m = '';
  for (let y = 44, row = 0; y < 330; y += ch, row++) {
    m += rect(0, y, BW, 1.4, ol);
    for (let x = (row % 2 ? cw / 2 : 0); x < BW; x += cw) m += rect(x, y - ch, 1.4, ch, ol);
  }
  b += `<g${op(0.16)}>${m}</g>`;
  // cornice band below the coping, with little dentils
  b += rect(0, 31, BW, 10, P.trim) + rect(0, 41, BW, 2.5, dark(P.trim, 0.3), op(0.6));
  for (let x = 6; x < BW; x += 12) b += rect(x, 33, 6, 5, lite(P.trim, 0.12));
  // coping: the running surface. Top exactly at y 16, light top edge so the roof line reads.
  b += rect(0, ROOF, BW, 15, P.cope) + rect(0, ROOF, BW, 3, lite(P.cope, 0.4)) + rect(0, 28, BW, 3, dark(P.cope, 0.3));
  for (const x of [30, 90, 150, 210]) b += rect(x, 19, 1.6, 9, dark(P.cope, 0.3), op(0.6));
  // drain pipe at x 120 with brackets
  b += rect(117, 43, 6, BH - 43, P.pipe) + rect(118, 43, 1.6, BH - 43, lite(P.pipe, 0.3), op(0.7));
  for (const y of [70, 170, 270, 370]) b += rect(114, y, 12, 4, dark(P.pipe, 0.3), ' rx="1.5"');
  // windows: centres x 60 and 180, rows y 54 / 154 / 254. Lit pattern alternates (night/sunset).
  const litMap = { night: [[1, 0], [0, 1], [1, 1]], sunset: [[1, 0], [0, 0], [0, 1]] }[z] || [[0, 0], [0, 0], [0, 0]];
  const win = (cx, y0, lit, extra) => {
    const w = 50, h = 62, x0 = cx - w / 2, x1 = cx + w / 2, r = w / 2;
    const shape = (i) => `M${f(x0 + i)} ${f(y0 + r)}A${f(r - i)} ${f(r - i)} 0 0 1 ${f(x1 - i)} ${f(y0 + r)}V${f(y0 + h - i)}H${f(x0 + i)}Z`;
    let s = pth(shape(0), P.frame, OL(ol, 2.5));
    s += `<g transform="translate(0 ${y0})">` + pth(`M${f(x0 + 5)} ${f(r)}A${f(r - 5)} ${f(r - 5)} 0 0 1 ${f(x1 - 5)} ${f(r)}V${f(h - 5)}H${f(x0 + 5)}Z`, lit ? 'url(#lt)' : 'url(#gl)') + '</g>';
    if (lit) {
      // curtains tied back + a little silhouette (plant or cat), no glow halo
      s += pth(`M${f(x0 + 5)} ${f(y0 + 18)}Q${f(x0 + 14)} ${f(y0 + 36)} ${f(x0 + 7)} ${f(y0 + h - 5)}L${f(x0 + 5)} ${f(y0 + h - 5)}Z`, P.curtain, op(0.9));
      s += pth(`M${f(x1 - 5)} ${f(y0 + 18)}Q${f(x1 - 14)} ${f(y0 + 36)} ${f(x1 - 7)} ${f(y0 + h - 5)}L${f(x1 - 5)} ${f(y0 + h - 5)}Z`, P.curtain, op(0.9));
      const sil = dark(P.lit, 0.62);
      if (extra === 'cat') s += ell(cx + 6, y0 + h - 10, 7, 5, sil) + circ(cx + 1, y0 + h - 17, 4.5, sil) + pth(`M${f(cx - 3)} ${f(y0 + h - 20)}l1 -5l3 3ZM${f(cx + 2)} ${f(y0 + h - 21)}l2 -4l2 4Z`, sil) + stk(`M${f(cx + 13)} ${f(y0 + h - 8)}q5 -2 3 -9`, sil, 2);
      else s += rect(cx - 5, y0 + h - 13, 10, 8, sil, ' rx="2"') + circ(cx - 3, y0 + h - 17, 4, sil) + circ(cx + 3, y0 + h - 19, 4.5, sil) + circ(cx, y0 + h - 23, 3.5, sil);
    } else {
      s += pth(`M${f(x0 + 10)} ${f(y0 + h - 8)}L${f(x0 + 28)} ${f(y0 + 14)}L${f(x0 + 36)} ${f(y0 + 16)}L${f(x0 + 18)} ${f(y0 + h - 8)}Z`, P.glassHi, op(0.28));
      s += pth(`M${f(x0 + 5)} ${f(y0 + 22)}Q${f(x0 + 12)} ${f(y0 + 30)} ${f(x0 + 8)} ${f(y0 + h - 5)}L${f(x0 + 5)} ${f(y0 + h - 5)}Z`, P.curtain, op(0.55));
    }
    // mullions
    s += rect(cx - 1.5, y0 + 4, 3, h - 6, P.frame) + rect(x0 + 4, y0 + 30, w - 8, 3, P.frame);
    // sill
    s += rrect(x0 - 5, y0 + h, w + 10, 6, 2, lite(P.wall, 0.25), OL(ol, 1.5));
    return s;
  };
  const flowerBox = (cx, y) => {
    const leaf = z === 'night' ? '#3c5a52' : z === 'sunset' ? '#5f6a4a' : '#6f9a5c', fl = z === 'night' ? ['#8a8ab0', '#a08aa0'] : z === 'sunset' ? ['#e0a070', '#f0d0b0'] : ['#f2f0e8', '#f0a070'];
    let s = '';
    for (let i = 0; i < 6; i++) s += circ(cx - 20 + i * 8, y - 2 - (i % 2) * 3, 5, leaf);
    for (let i = 0; i < 4; i++) s += circ(cx - 15 + i * 10, y - 6 - (i % 2) * 2, 3, fl[i % 2]) + circ(cx - 15 + i * 10, y - 6 - (i % 2) * 2, 1.1, '#f6e2a0', op(0.8));
    s += rrect(cx - 26, y, 52, 10, 2, z === 'night' ? '#5a4a52' : '#9a6a4a', OL(ol, 1.5));
    return s;
  };
  const awning = (cx, y) => {
    const a = z === 'noon' ? ['#5f9a7a', '#f2ecd8'] : z === 'dawn' ? ['#7e8fb8', '#f2e2d6'] : z === 'sunset' ? ['#6a7aa0', '#d8b8a0'] : ['#3e5a72', '#8a94b0'];
    let s = '';
    for (let i = 0; i < 6; i++) s += pth(`M${f(cx - 30 + i * 10)} ${f(y)}H${f(cx - 20 + i * 10)}L${f(cx - 19 + i * 10.8)} ${f(y + 14)}H${f(cx - 31 + i * 10.8)}Z`, a[i % 2]);
    s += stk(`M${f(cx - 31)} ${f(y + 14)}H${f(cx + 34)}`, dark(a[0], 0.3), 2) + stk(`M${f(cx - 30)} ${f(y)}H${f(cx + 30)}`, dark(a[0], 0.3), 2);
    return s;
  };
  [54, 154, 254].forEach((y, r) => {
    b += win(60, y, litMap[r][0], r === 0 ? 'cat' : 'plant');
    b += win(180, y, litMap[r][1], 'plant');
  });
  b += flowerBox(60, 122) + awning(180, 46) + flowerBox(180, 222);
  // a little wall lamp beside the pipe (unlit by day)
  b += rrect(100, 96, 8, 10, 2, z === 'night' ? '#ffe2a8' : lite(P.pipe, 0.2), OL(ol, 1.5)) + rect(103, 92, 2, 4, ol);
  // bottom band in exactly the bottom colour (the renderer continues it below y 400)
  b += rect(0, 372, BW, 28, P.bottom);
  return svg(BW, BH, b, defs);
}

// =====================================================================================
// RAIL: 240x160, truss y 104–144, flat underside at exactly y 144, two hangers up to y 0, tiles every 240.
// =====================================================================================
function railParts(P, x0, x1) {
  // girder segment between x0 and x1 (absolute), shared by rail.svg and rail_end.svg
  const ol = P.steelDk;
  let s = '';
  s += rect(x0, 104, x1 - x0, 11, P.steel) + rect(x0, 104, x1 - x0, 3, P.steelHi) + rect(x0, 114, x1 - x0, 1.6, ol);       // top chord
  // web: zigzag with period 40 (6 per tile), plus verticals
  let d = '';
  for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) d += `M${x} 115L${x + 20} 131L${x + 40} 115`;
  s += `<clipPath id="wc${x0}"><rect x="${x0}" y="110" width="${x1 - x0}" height="26"/></clipPath>`;
  s += `<g clip-path="url(#wc${x0})">` + rect(x0, 115, x1 - x0, 16, dark(P.steel, 0.35), op(0.5)) + stk(d, P.steel, 5) + stk(d, P.steelHi, 1.4, op(0.6)) + '</g>';
  s += rect(x0, 130, x1 - x0, 14, P.steel) + rect(x0, 130, x1 - x0, 2.5, P.steelHi) + rect(x0, 131.5, x1 - x0, 1.2, ol, op(0.5));  // bottom chord
  for (let x = Math.ceil((x0 + 10) / 20) * 20 - 10; x < x1; x += 20) s += circ(x, 136.5, 1.8, dark(P.steel, 0.3)) + circ(x - 0.5, 136, 0.8, P.steelHi);
  // underside glow strip, ends exactly at y 144
  s += rect(x0, 139.5, x1 - x0, 1.2, ol, op(0.6)) + rect(x0, 141, x1 - x0, 3, P.railGlow, op(0.75));
  return s;
}
function rail(z, P) {
  let b = '';
  // hangers at x 60 and 180: cable to the top + turnbuckle + clamp
  for (const x of [60, 180]) {
    b += rect(x - 2, 0, 4, 100, P.steelDk) + rect(x - 1, 0, 1.2, 100, P.steelHi, op(0.6));
    b += rrect(x - 4, 44, 8, 16, 3, P.steel, OL(P.steelDk, 1.5));
    b += pth(`M${x - 12} 104L${x - 7} 92H${x + 7}L${x + 12} 104Z`, P.steel, OL(P.steelDk, 2)) + circ(x, 98, 2.2, P.steelHi);
  }
  b += railParts(P, 0, RW);
  return svg(RW, RH, b);
}
function railEnd(z, P) {
  // girder runs in from the left edge (matches rail.svg at x 0), then a rounded bumper and a small warning light
  let b = railParts(P, 0, 14);
  b += rrect(8, 99, 26, 49, 10, P.steel, OL(P.steelDk, 2.5));
  b += rrect(12, 103, 7, 40, 3.5, P.steelHi, op(0.55));
  b += rect(10, 120, 22, 7, '#e0a050', op(0.85)) + rect(10, 120, 22, 2, '#f6cc8a', op(0.8));     // amber safety band
  b += rrect(17, 88, 10, 12, 3, P.steelDk) + circ(22, 88, 5, '#ff7048') + circ(20.5, 86.5, 1.6, '#ffe0d0');
  return svg(40, RH, b);
}

// =====================================================================================
// PARTICLES (32x32, shoot 64x16), centred, transparent edges
// =====================================================================================
function particles() {
  const P = (name, body, defs = '', w = 32, h = 32) => write(`particles/${name}.svg`, svg(w, h, body, defs));
  const soft = (col, a = 0.5) => rad('g', [['0', col, a], ['1', col, 0]]);
  P('mist', ell(16, 16, 15, 6, 'url(#g)') + ell(12, 15, 7, 3, '#ffffff', op(0.35)) + ell(20, 17, 8, 3, '#ffffff', op(0.3)), soft('#ffffff', 0.55));
  P('seed', stk('M16 28L16 13', '#d8d2c0', 1.2) + ell(16, 28.5, 1.6, 2.4, '#a08a60') +
    [-70, -50, -30, -10, 10, 30, 50, 70].map(a => `<g transform="rotate(${a} 16 13)">` + stk('M16 13L16 4', '#ffffff', 0.9, op(0.9)) + circ(16, 4, 1.2, '#ffffff', op(0.9)) + '</g>').join('') + circ(16, 13, 1.4, '#e8e2d0'));
  P('mote', circ(16, 16, 14, 'url(#g)') + circ(16, 16, 3.2, '#ffe8c8', op(0.9)), rad('g', [['0', '#ffd8a8', 0.85], ['0.4', '#ffb878', 0.35], ['1', '#ffb070', 0]]));
  P('leaf', `<g transform="rotate(-30 16 16)">` + pth('M5 16Q16 4 27 16Q16 28 5 16Z', '#7cbc5a', OL('#4a7a3a', 1.6)) + pth('M5 16Q16 28 27 16Z', '#68a64c', op(0.8)) + stk('M5 16L27 16', '#4a7a3a', 1.2) + stk('M13 16l3 -4M19 16l3 -3M13 16l3 4', '#4a7a3a', 0.9, op(0.7)) + '</g>');
  P('star', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 11, 5), '#fff3c4', OL('#d8b060', 1.6)) + circ(13.5, 14, 1.6, '#ffffff', op(0.85)), soft('#fff6d0', 0.4));
  P('sparkle', circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#f8f6ff') + circ(16, 16, 2, '#ffffff'), soft('#e4e0ff', 0.5));
  P('puff', circ(12, 18, 6.5, '#ffffff', op(0.9)) + circ(19, 15, 7.5, '#ffffff', op(0.95)) + circ(18, 21, 6.5, '#e6e4f0', op(0.9)) + circ(11, 20.5, 5, '#eceaf4', op(0.85)) + circ(17, 13.5, 3, '#ffffff'));
  P('spark', circ(16, 16, 15, 'url(#g)') + pth('M16 7L18.5 16L16 25L13.5 16Z', '#ffc070') + pth('M7 16L16 13.8L25 16L16 18.2Z', '#ffa850', op(0.85)) + circ(16, 16, 2.4, '#fff2d8'), rad('g', [['0', '#ffe0b0', 0.9], ['0.35', '#ff9a40', 0.5], ['1', '#ff8a30', 0]]));
  P('bit_pink', circ(16, 16, 15, 'url(#g)') + pth('M16 25Q7 18.5 7 12.5A4.6 4.6 0 0 1 16 11A4.6 4.6 0 0 1 25 12.5Q25 18.5 16 25Z', '#ff5fa2', OL('#c03a78', 1.5)) + circ(16, 15.5, 2.6, '#fff0f6') + ell(11.5, 12.8, 1.8, 1.2, '#ffffff', op(0.85)), soft('#ff5fa2', 0.55));
  P('bit_yellow', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 10, 4.5), '#ffd23f', OL('#c09a10', 1.5)) + circ(16, 17, 2.6, '#fffbe6'), soft('#ffd23f', 0.55));
  P('bit_cyan', circ(16, 16, 15, 'url(#g)') + pth('M16 6Q24 16 24 19.5A8 8 0 0 1 8 19.5Q8 16 16 6Z', '#39e1ff', OL('#1a9ac0', 1.5)) + circ(16, 19.5, 2.8, '#f0fcff') + ell(12.5, 17, 1.2, 2, '#ffffff', op(0.8)), soft('#39e1ff', 0.55));
  P('shoot', rrect(4, 6.5, 52, 3, 1.5, 'url(#t)') + circ(56, 8, 6, 'url(#g)') + circ(56, 8, 2.4, '#ffffff'),
    lin('t', [['0', '#ffffff', 0], ['0.7', '#e8ecff', 0.55], ['1', '#ffffff', 0.95]], 0, 0, 1, 0) + soft('#eef0ff', 0.7), 64, 16);
}

// =====================================================================================
const pal = {};
for (const z of Object.keys(Z)) {
  const P = Z[z];
  write(`levels/${z}/sky.svg`, { dawn: skyDawn, noon: skyNoon, sunset: skySunset, night: skyNight }[z](P));
  write(`levels/${z}/far.svg`, farLayer(z, P));
  write(`levels/${z}/mid.svg`, midLayer(z, P));
  write(`levels/${z}/building.svg`, building(z, P));
  write(`levels/${z}/rail.svg`, rail(z, P));
  write(`levels/${z}/rail_end.svg`, railEnd(z, P));
  pal[z] = { wall: P.wall, bottom: P.bottom, skyTop: P.skyTop, skyBottom: P.skyBottom };
}
particles();
fs.writeFileSync(path.join(__dirname, 'palette.json'), JSON.stringify(pal, null, 2) + '\n');
console.log('environment art written to', OUT);
