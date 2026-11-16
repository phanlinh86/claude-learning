// Momo's Dino Drums: environment art generator (Dino Lookout tower floors + shared props + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - levels/<floor>/wallpaper.svg 256x256 opaque, seamless in x AND y (all periods divide 256; every motif that
//    crosses an edge is re-emitted at ±256 on the opposite side via wrap()).
//  - levels/<floor>/window.svg    320x260 arched opening onto the valley; opaque inside the arch, transparent outside.
//  - levels/<floor>/floor.svg     512x192 opaque deck, seamless in x (all joints wrap mod 512), top edge y=0.
//  - room/shelf.svg 512x56 bamboo beam (top surface y 8..18), room/track.svg 512x40 bamboo rail (centre line y=20),
//    room/decor_0..5.svg 160x160 (base y≈150), room/nightlight.svg 96x96 firefly jar.
//  - particles/*.svg 32x32 centred.
// Floors: river (warm morning stone) · ferns (green fern canopy, bamboo) · nests (pale airy cloud ledge) · sky (dusk violet roof).
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#2a1a22', t);   // outline / shade: a dark tone of the fill, never black
const lite = (c, t = 0.35) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const shape = (d, fill, w = 3) => pth(d, fill, OL(dark(fill), w));
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, r) => { // 4-point concave sparkle
  const p = (a, q) => [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; let d = '';
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2, [x, y] = p(a, R), [mx, my] = p(a + Math.PI / 4, r); const [nx, ny] = p(a + Math.PI / 2, R); d += (i ? 'L' : 'M') + f(x) + ' ' + f(y) + `Q${f(cx + (mx - cx) * 0.4)} ${f(cy + (my - cy) * 0.4)} ${f(nx)} ${f(ny)}`; }
  return d + 'Z';
};
// emit fn(x, y) for each wrapped copy (radius rr) that touches the tile
function wrap(x, y, rr, fn, W, H, wrapY = true) {
  let o = '';
  for (const dx of [-W, 0, W]) for (const dy of (wrapY ? [-H, 0, H] : [0])) {
    const X = x + dx, Y = y + dy;
    if (X + rr < 0 || X - rr > W || Y + rr < 0 || Y - rr > H) continue;
    o += fn(X, Y);
  }
  return o;
}
// a leaf shape pointing along angle a (deg), base at (x,y)
const leafD = (x, y, a, L, w) => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); const P = (u, v) => f(x + u * c - v * s) + ' ' + f(y + u * s + v * c); return `M${P(0, 0)}Q${P(L * 0.45, -w)} ${P(L, 0)}Q${P(L * 0.45, w)} ${P(0, 0)}Z`; };
const leaf = (x, y, a, L, w, col, ow = 2) => pth(leafD(x, y, a, L, w), col, OL(dark(col, 0.4), ow)) + stk((() => { const r = a * Math.PI / 180; return `M${f(x)} ${f(y)}L${f(x + Math.cos(r) * L * 0.8)} ${f(y + Math.sin(r) * L * 0.8)}`; })(), dark(col, 0.2), Math.max(0.8, ow * 0.45));
// fern frond along a quadratic bezier P0 -> C -> P1 with paired leaflets (shrinking to the tip)
function frond(x0, y0, cx, cy, x1, y1, n, len, col, ow = 2, fill2) {
  const B = t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];
  const D = t => [2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy)];
  let o = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), [px, py] = B(t), [dx, dy] = D(t), a = Math.atan2(dy, dx) * 180 / Math.PI, L = len * (1 - t * 0.75);
    o += pth(leafD(px, py, a - 62, L, L * 0.28), i % 2 ? col : (fill2 || col), OL(dark(col, 0.38), ow));
    o += pth(leafD(px, py, a + 62, L, L * 0.28), i % 2 ? (fill2 || col) : col, OL(dark(col, 0.38), ow));
  }
  o += stk(`M${f(x0)} ${f(y0)}Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`, dark(col, 0.35), ow * 1.3);
  return o;
}
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// =====================================================================================
// PALETTES (per floor)
// =====================================================================================
const PAL = {
  river: { // warm morning sand-stone
    mortar: '#dcbd92', blocks: ['#ebd1a7', '#e8cda1', '#eed5ad', '#e6c99d'],
    deck: '#c99f74', grout: '#a87e56', deckT: ['#d3aa7e', '#cca276', '#d8b285'],
    frame: '#e3c08e', vine: '#7fb35e',
    sky: [['0', '#9fd2ef'], ['0.55', '#d8ecf2'], ['0.78', '#fde7c2']],
  },
  ferns: { // woven bamboo slats, green-tan
    gap: '#b2ad76', slat: '#cdc792', slat2: '#c6c089',
    deck: '#b9a463', frame: '#c9b46c', vine: '#6fae4e',
    sky: [['0', '#f3f6cf'], ['0.6', '#d7ebaa'], ['1', '#a9d07e']],
  },
  nests: { // pale airy stone
    base: '#dfe4ee', mortar: '#cdd3e0', pebble: ['#c6cddb', '#d5dbe6', '#c2c6d6', '#eef1f7'],
    deck: '#cfc3b0', grout: '#ad9f8a', deckT: ['#d6cab7', '#d1c4b0', '#dbd0be'],
    frame: '#ece6da', vine: '#8bbd6a',
    sky: [['0', '#c3def7'], ['0.6', '#e4effb'], ['1', '#f7f2fb']],
  },
  sky: { // dusk violet planks with stars
    planks: ['#574a7d', '#5d5084', '#524675'], gap: '#3e345e', star: '#efe4ff',
    deck: '#4a4470', frame: '#8a7ab0', vine: '#6d9a6a',
    sky: [['0', '#25265a'], ['0.45', '#54408a'], ['0.75', '#b2678f'], ['0.92', '#f2a37e']],
  },
};
const FLOORS = Object.keys(PAL);

// =====================================================================================
// WALLPAPER 256x256 (seamless x & y)
// =====================================================================================
function wallRiver() { // running-bond sand-stone blocks, rows 32 tall, blocks 64 wide
  const P = PAL.river, S = 256, r = rng(11);
  let o = rect(0, 0, S, S, P.mortar);
  for (let j = 0; j < 8; j++) {
    const off = (j % 2) * 32, y = j * 32;
    for (let i = -1; i < 4; i++) {
      const x = off + i * 64, k = ((i % 4) + 4) % 4, c = P.blocks[(k * 3 + j * 5) % 4];
      o += rect(x + 1.5, y + 1.5, 61, 29, c, ' rx="5"');
      o += rect(x + 4, y + 3, 52, 2.5, lite(c, 0.2), ' rx="1.2" opacity=".7"');   // top highlight
      o += rect(x + 3, y + 25.5, 58, 4, dark(c, 0.05), ' rx="2"');               // one-step shade
    }
  }
  for (let i = 0; i < 40; i++) { // tiny sand speckles
    const x = r() * S, y = r() * S, rr = 0.6 + r() * 0.9, c = r() < 0.5 ? '#f7e6c8' : '#cfa97b';
    o += wrap(x, y, 2, (X, Y) => circ(X, Y, rr, c, ' opacity=".7"'), S, S);
  }
  return svg(S, S, o);
}
function wallFerns() { // basket-weave bamboo slats, 32px cells (8x8, parity wraps)
  const P = PAL.ferns, S = 256;
  let o = rect(0, 0, S, S, P.gap);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const x = i * 32, y = j * 32, hor = (i + j) % 2 === 0;
    for (let s = 0; s < 3; s++) {
      const c = s === 1 ? P.slat2 : P.slat;
      if (hor) {
        const yy = y + 1.5 + s * 10;
        o += rect(x + 1, yy, 30, 8.5, c, ' rx="3"') + rect(x + 3, yy + 1.3, 26, 1.8, lite(c, 0.2), ' rx="1"') + rect(x + 2, yy + 6.3, 28, 1.6, dark(c, 0.08), ' rx="1"');
      } else {
        const xx = x + 1.5 + s * 10;
        o += rect(xx, y + 1, 8.5, 30, c, ' rx="3"') + rect(xx + 1.3, y + 3, 1.8, 26, lite(c, 0.2), ' rx="1"') + rect(xx + 6.3, y + 2, 1.6, 28, dark(c, 0.08), ' rx="1"');
      }
    }
  }
  return svg(S, S, o);
}
function wallNests() { // pale ashlar stone, 128x64 blocks running bond, tiny pebble dots
  const P = PAL.nests, S = 256, r = rng(23);
  let o = rect(0, 0, S, S, P.mortar);
  const tones = [P.base, mix(P.base, '#d6dbe8', 0.6), mix(P.base, '#e8ebf3', 0.7)];
  for (let j = 0; j < 4; j++) {
    const off = (j % 2) * 64, y = j * 64;
    for (let i = -1; i < 2; i++) {
      const x = off + i * 128, k = ((i % 2) + 2) % 2, c = tones[(k + j * 2) % 3];
      o += rect(x + 1.5, y + 1.5, 125, 61, c, ' rx="8"');
      o += rect(x + 6, y + 4, 100, 3, lite(c, 0.5), ' rx="1.5"');
      o += rect(x + 4, y + 55, 120, 5.5, dark(c, 0.045), ' rx="3"');
    }
  }
  for (let i = 0; i < 46; i++) {
    const x = r() * S, y = r() * S, rr = 0.9 + r() * 1.8, c = P.pebble[Math.floor(r() * 4)];
    o += wrap(x, y, rr + 1, (X, Y) => circ(X, Y, rr, c) + circ(X - rr * 0.3, Y - rr * 0.35, rr * 0.35, '#fbfaf6', ' opacity=".8"'), S, S);
  }
  return svg(S, S, o);
}
function wallSky() { // dusky violet vertical planks (32 wide) with tiny star dots
  const P = PAL.sky, S = 256, r = rng(37);
  let o = rect(0, 0, S, S, P.gap);
  for (let k = 0; k < 8; k++) {
    const x = k * 32, c = P.planks[k % 3];
    o += rect(x + 1.5, 0, 29, S, c);
    o += rect(x + 3, 0, 2, S, lite(c, 0.08)) + rect(x + 26, 0, 3, S, dark(c, 0.1));
    for (let g = 0; g < 2; g++) { const gx = x + 10 + g * 8 + r() * 3, ph = r() * 6.28; let d = `M${f(gx)} 0`; for (let y = 16; y <= S; y += 16) d += `L${f(gx + 1.2 * Math.sin(ph + y / S * 6.283 * 2))} ${y}`; o += stk(d, dark(c, 0.12), 1.1, ' opacity=".55"'); }
    const jy = (k * 97 + 40) % 240 + 8; // plank end joint + two pegs
    o += rect(x + 1.5, jy, 29, 2, P.gap) + circ(x + 9, jy - 5, 1.4, dark(c, 0.25)) + circ(x + 23, jy - 5, 1.4, dark(c, 0.25)) + circ(x + 9, jy + 7, 1.4, dark(c, 0.25)) + circ(x + 23, jy + 7, 1.4, dark(c, 0.25));
  }
  for (let i = 0; i < 30; i++) {
    const x = r() * S, y = r() * S, rr = 0.6 + r() * 0.8, a = f(0.35 + r() * 0.35);
    o += wrap(x, y, 2, (X, Y) => circ(X, Y, rr, P.star, ` opacity="${a}"`), S, S);
  }
  for (let i = 0; i < 4; i++) { const x = 20 + i * 64 + r() * 20, y = 30 + i * 61 + r() * 20; o += wrap(x, y, 6, (X, Y) => pth(twinkle(X, Y, 4.5, 1.2), '#f4ecff', ' opacity=".55"'), S, S); }
  return svg(S, S, o);
}
const WALL = { river: wallRiver, ferns: wallFerns, nests: wallNests, sky: wallSky };

// =====================================================================================
// WINDOW 320x260: arched opening onto the valley (transparent outside the frame)
// =====================================================================================
const AX0 = 40, AX1 = 280, ACY = 140, AR = 120, ABOT = 244; // inner arch
const archD = (pad) => `M${AX0 - pad} ${ABOT + Math.min(pad, 4)}V${ACY}A${AR + pad} ${AR + pad} 0 0 1 ${AX1 + pad} ${ACY}V${ABOT + Math.min(pad, 4)}Z`;
const puff = (x, y, s, c = '#ffffff', ow = 2) => pth(`M${f(x - 26 * s)} ${f(y + 8 * s)}a${f(10 * s)} ${f(10 * s)} 0 0 1 ${f(6 * s)}-${f(17 * s)}a${f(14 * s)} ${f(14 * s)} 0 0 1 ${f(25 * s)}-${f(6 * s)}a${f(11 * s)} ${f(11 * s)} 0 0 1 ${f(20 * s)} ${f(6 * s)}a${f(9 * s)} ${f(9 * s)} 0 0 1 ${f(1 * s)} ${f(17 * s)}z`, c, ow ? OL(dark(c, 0.15), ow) : '');

function viewRiver() {
  let d = rad('sun', [['0', '#fff6d0', 0.95], ['0.5', '#fff0c0', 0.45], ['1', '#fff0c0', 0]]);
  let o = rect(0, 0, 320, 260, 'url(#sky)');
  o += circ(96, 112, 60, 'url(#sun)') + circ(96, 112, 20, '#fff2b6', OL('#f2cf7c', 2.5)) + circ(90, 106, 6, '#fffbe2');
  o += puff(190, 70, 0.7, '#ffffff') + puff(250, 100, 0.45, '#fff8ee') + puff(70, 60, 0.5, '#ffffff');
  // far blue-violet mountains, then green hills
  o += pth('M30 170L78 128L104 146L138 116L178 150L210 128L250 152L290 136V180H30Z', '#c4cde6', OL('#a9b2d2', 2));
  o += pth('M30 176Q80 146 130 166T230 158T290 162V200H30Z', '#b7d59c', OL('#93b77c', 2.5));
  // the river (soft periwinkle, not aqua), winding toward the viewer
  o += pth('M30 196Q110 182 170 188Q236 194 290 184V206Q230 214 170 208Q100 202 30 212Z', '#a9c4ec', OL('#86a3d2', 2));
  o += stk('M60 199Q90 195 116 197', '#eef4ff', 2, ' opacity=".9"') + stk('M180 197Q205 199 228 196', '#eef4ff', 2, ' opacity=".9"') + stk('M136 204H156', '#ffffff', 2, ' opacity=".8"');
  o += pth(twinkle(128, 194, 4, 1), '#ffffff') + pth(twinkle(214, 203, 3.2, 0.9), '#ffffff');
  // friendly long-neck dino drinking on the far bank (muted, atmospheric), head down to the water
  const dc = '#97a7a8', dO = '#7d8c90';
  o += `<g opacity=".92">`;
  o += pth('M236 178Q262 176 280 190Q262 186 240 186Z', dc, OL(dO, 2)); // tail
  for (const lx of [222, 230, 244, 252]) o += rect(lx - 3, 178, 6, 12, dc, ` rx="3"${OL(dO, 1.8)}`);
  o += ell(238, 176, 21, 11, dc, OL(dO, 2));
  o += stk('M222 172Q200 156 196 186', dO, 9) + stk('M222 172Q200 156 196 186', dc, 5.5);
  o += ell(195, 190, 6.5, 4.5, dc, OL(dO, 1.8)) + circ(193, 188.5, 1.1, '#5f6c70');
  o += ell(240, 172, 10, 3, lite(dc, 0.25), ' opacity=".7"');
  o += `</g>`;
  o += stk('M188 194Q195 192 202 194', '#ffffff', 1.5, ' opacity=".9"'); // ripple at the drink
  // near bank: grass + reeds + little flowers
  o += pth('M30 216Q90 206 160 214T290 210V260H30Z', '#a3cd83', OL('#86b169', 2.5));
  o += pth('M30 236Q120 226 200 234T290 230V260H30Z', '#93c276');
  for (const [x, h] of [[54, 26], [62, 34], [70, 22], [258, 30], [266, 22], [250, 20]]) o += stk(`M${x} 240Q${x + 3} ${240 - h / 2} ${x + 1} ${240 - h}`, '#6f9f55', 3) + ell(x + 1, 240 - h + 4, 2.4, 6, '#b48a5a');
  for (const [x, y, c] of [[110, 228, '#ffe08a'], [146, 236, '#ffc2d6'], [196, 230, '#fff4f0'], [228, 238, '#ffe08a']]) o += circ(x, y, 3, c, OL(dark(c, 0.25), 1.2)) + circ(x, y, 1.1, '#f2a65a');
  return { d, o };
}
function viewFerns() {
  let d = rad('dap', [['0', '#fffbe0', 0.6], ['1', '#fffbe0', 0]]);
  let o = rect(0, 0, 320, 260, 'url(#sky)');
  // canopy blobs layered (yellow-greens; no teal)
  const blob = (x, y, r, c) => circ(x, y, r, c, OL(dark(c, 0.18), 2));
  for (const [x, y, rr] of [[60, 70, 34], [110, 52, 30], [214, 56, 32], [268, 76, 34], [160, 40, 26]]) o += blob(x, y, rr, '#bfdc8e');
  for (const [x, y, rr] of [[40, 130, 40], [100, 150, 36], [170, 142, 42], [240, 136, 38], [292, 150, 36]]) o += blob(x, y, rr, '#9fca72');
  for (const [x, y, rr] of [[70, 200, 44], [150, 210, 40], [226, 204, 44], [290, 214, 36]]) o += blob(x, y, rr, '#86b85d');
  // dappled light spots
  const r = rng(5);
  for (let i = 0; i < 14; i++) o += circ(50 + r() * 220, 40 + r() * 190, 8 + r() * 14, 'url(#dap)');
  // light shafts
  o += pth('M150 20L190 20L120 244L80 244Z', '#fffbe0', ' opacity=".18"') + pth('M210 20L226 20L170 244L154 244Z', '#fffbe0', ' opacity=".14"');
  // giant fern fronds framing the view
  o += frond(30, 250, 70, 150, 150, 120, 11, 30, '#6fa84f', 2, '#7db85a');
  o += frond(300, 250, 250, 160, 176, 150, 10, 28, '#669f48', 2, '#76b154');
  o += frond(40, 40, 100, 70, 130, 120, 8, 22, '#7db85a', 1.8, '#89c265');
  // tiny far butterfly
  o += pth('M226 98C220 90 214 92 216 98C214 104 222 104 226 100C230 104 238 104 236 98C238 92 232 90 226 98Z', '#ffd27a', OL('#c99a40', 1.3));
  return { d, o };
}
function viewNests() {
  let d = rad('gl', [['0', '#ffffff', 0.9], ['1', '#ffffff', 0]]);
  let o = rect(0, 0, 320, 260, 'url(#sky)');
  o += circ(90, 60, 50, 'url(#gl)');
  // distant pterosaur pair (cute round bodies, peach, wings up)
  const ptero = (x, y, s, flip) => {
    const c = '#f1b896', cO = '#c88a6c', w = '#d9c2ea', k = flip ? -1 : 1;
    let g = `<g transform="translate(${x} ${y}) scale(${s * k} ${s})">`;
    g += pth('M0 0Q-10 -14 -24 -10Q-14 -4 0 2Z', w, OL(dark(w, 0.3), 1.6)) + pth('M0 0Q10 -14 24 -10Q14 -4 0 2Z', w, OL(dark(w, 0.3), 1.6));
    g += ell(0, 1, 6, 5, c, OL(cO, 1.6)) + circ(6, -3, 4, c, OL(cO, 1.6)) + pth('M9 -3L14 -2L9 -1Z', '#f6d27a', OL('#c9a050', 1)) + circ(7, -4, 0.9, '#5a4048') + pth('M3 -6Q2 -10 6 -8', 'none', OL(cO, 1.4));
    return g + '</g>';
  };
  o += ptero(108, 104, 1, false) + ptero(136, 90, 0.8, false);
  o += puff(220, 62, 0.55, '#ffffff') + puff(70, 132, 0.4, '#ffffff');
  // cliff on the right with round nests and eggs
  const rock = '#cdbba5', rO = '#a8957f';
  o += pth('M196 260L204 196Q206 170 220 156L232 128Q240 112 256 110L270 98Q284 92 300 96V260Z', rock, OL(rO, 2.5));
  o += pth('M214 200Q236 194 260 198L300 194V204Q260 208 214 210Z', lite(rock, 0.25)) + pth('M236 132Q260 126 300 128V136Q262 136 236 140Z', lite(rock, 0.25));
  o += stk('M228 176Q246 170 262 176', dark(rock, 0.15), 2) + stk('M262 160Q276 156 290 160', dark(rock, 0.15), 2);
  const nest = (x, y, s) => {
    const n = '#b48a5c', nO = '#86643f'; let g = '';
    for (const [ex, c] of [[-7, '#fff2de'], [0, '#ffe2cf'], [7, '#ece0fb']]) g += ell(x + ex * s, y - 6 * s, 5 * s, 6.5 * s, c, OL(dark(c, 0.3), 1.4)) + circ(x + ex * s - 1.5 * s, y - 8 * s, 1.1 * s, dark(c, 0.22));
    g += pth(`M${f(x - 16 * s)} ${f(y - 4 * s)}Q${f(x)} ${f(y + 10 * s)} ${f(x + 16 * s)} ${f(y - 4 * s)}Q${f(x)} ${f(y + 1 * s)} ${f(x - 16 * s)} ${f(y - 4 * s)}Z`, n, OL(nO, 1.8));
    g += stk(`M${f(x - 12 * s)} ${f(y - 1 * s)}L${f(x + 8 * s)} ${f(y + 1 * s)}M${f(x - 6 * s)} ${f(y + 2.5 * s)}L${f(x + 12 * s)} ${f(y - 1.5 * s)}`, nO, 1.1);
    return g;
  };
  o += nest(268, 130, 1.1) + nest(240, 198, 1.2);
  // the cloud sea below
  o += pth('M30 214Q52 194 76 206Q92 186 118 200Q140 184 162 202Q182 190 200 206L200 260H30Z', '#ffffff', OL('#d9dcef', 2));
  o += pth('M30 232Q60 218 92 228Q120 214 150 228Q180 216 214 230Q250 218 290 228V260H30Z', '#f4f1fb', OL('#d9d4ec', 2));
  o += stk('M50 240Q80 234 110 240', '#ded8f0', 2) + stk('M170 244Q200 238 236 244', '#ded8f0', 2);
  return { d, o };
}
function viewSky() {
  let d = rad('mg', [['0', '#fff6cf', 0.5], ['1', '#fff6cf', 0]]) + rad('vg', [['0', '#ffb98a', 0.7], ['1', '#ffb98a', 0]]);
  let o = rect(0, 0, 320, 260, 'url(#sky)');
  const r = rng(77);
  for (let i = 0; i < 30; i++) { const x = 44 + r() * 232, y = 24 + r() * 130; if (Math.hypot(x - 212, y - 70) < 30) continue; o += i % 5 ? circ(x, y, 0.8 + r() * 1.1, '#f3eeff', ` opacity="${f(0.6 + r() * 0.4)}"`) : pth(twinkle(x, y, 4.2, 1.2), '#fff6d8'); }
  o += circ(212, 70, 40, 'url(#mg)') + pth('M218 50a21 21 0 1 0 12 34a16 16 0 1 1 -12-34z', '#fff1bf', OL('#d8c07a', 2.2));
  // sleepy far volcano: soft purple, closed eyes, a small puff (no lava)
  o += circ(118, 150, 40, 'url(#vg)');
  o += pth('M40 230L96 156Q104 148 112 150H126Q134 148 142 156L210 230Z', '#6c5486', OL('#4d3b66', 2.5));
  o += pth('M126 150Q134 148 142 156L210 230H160Z', '#5e4878', ' opacity=".9"');
  o += pth('M100 154Q119 160 138 154L134 150H104Z', '#f6b28c', OL('#c9806a', 1.6));
  o += stk('M104 184Q109 188 114 184', '#3f2f56', 2) + stk('M126 184Q131 188 136 184', '#3f2f56', 2) + ell(100, 192, 4, 2.2, '#e58aa6', ' opacity=".55"') + ell(140, 192, 4, 2.2, '#e58aa6', ' opacity=".55"');
  o += circ(122, 136, 7, '#e9dff3', OL('#bfaed6', 1.5)) + circ(132, 124, 9, '#e9dff3', OL('#bfaed6', 1.5)) + circ(146, 110, 11, '#f1eaf8', OL('#c6b6dc', 1.5));
  // dark rolling hills + fern tops in the foreground
  o += pth('M30 220Q90 202 160 216T290 206V260H30Z', '#3e3460', OL('#2e2650', 2));
  o += pth('M180 218Q230 196 290 204V260H180Z', '#352c56');
  o += frond(250, 262, 262, 228, 296, 214, 6, 14, '#3e5a54', 1.4) + frond(56, 262, 46, 232, 36, 212, 6, 14, '#3e5a54', 1.4);
  for (const [x, y] of [[80, 230], [140, 238], [200, 228], [252, 236]]) o += circ(x, y, 1.8, '#e8ff9a') + circ(x, y, 5, '#e8ff9a', ' opacity=".25"');
  return { d, o };
}
const VIEW = { river: viewRiver, ferns: viewFerns, nests: viewNests, sky: viewSky };

function frameStone(c, P) { // voussoir arch + jambs
  const cO = dark(c, 0.4); let o = pth(archD(18) + ' ' + archD(0).replace(/^M/, 'M'), c, ` fill-rule="evenodd"${OL(cO, 3)}`);
  for (let i = 1; i < 12; i++) { // radial joints
    const a = Math.PI + i * Math.PI / 12, x0 = 160 + Math.cos(a) * AR, y0 = ACY + Math.sin(a) * AR, x1 = 160 + Math.cos(a) * (AR + 18), y1 = ACY + Math.sin(a) * (AR + 18);
    o += stk(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`, dark(c, 0.22), 2);
  }
  for (const y of [170, 204]) o += stk(`M${AX0 - 18} ${y}H${AX0}M${AX1} ${y}H${AX1 + 18}`, dark(c, 0.22), 2);
  o += stk(`M${AX0 - 12} ${ABOT}V${ACY}A${AR + 12} ${AR + 12} 0 0 1 ${AX1 + 12} ${ACY}V${ABOT}`, lite(c, 0.4), 2.5, ' opacity=".7"');
  o += pth('M150 18L170 18L174 4L146 4Z', lite(c, 0.12), OL(cO, 2.5)); // keystone
  return o;
}
function frameBamboo(c) { // two lashed bamboo poles bent into the arch
  const cO = dark(c, 0.42); const a = (pad) => `M${AX0 - pad} ${ABOT}V${ACY}A${AR + pad} ${AR + pad} 0 0 1 ${AX1 + pad} ${ACY}V${ABOT}`;
  let o = stk(a(9), cO, 21) + stk(a(9), c, 15) + stk(a(5), lite(c, 0.3), 3.5, ' opacity=".8"') + stk(a(13), dark(c, 0.12), 3, ' opacity=".8"');
  for (let i = 0; i <= 10; i++) { // nodes
    const t = Math.PI + i * Math.PI / 10, x0 = 160 + Math.cos(t) * (AR - 1), y0 = ACY + Math.sin(t) * (AR - 1), x1 = 160 + Math.cos(t) * (AR + 19), y1 = ACY + Math.sin(t) * (AR + 19);
    o += stk(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`, cO, 2.2);
  }
  for (const y of [176, 214]) o += stk(`M${AX0 - 19} ${y}H${AX0 + 1}M${AX1 - 1} ${y}H${AX1 + 19}`, cO, 2.2);
  for (const [x, y] of [[AX0 - 9, 150], [AX1 + 9, 150]]) o += stk(`M${x - 9} ${y - 6}L${x + 9} ${y + 6}M${x - 9} ${y + 6}L${x + 9} ${y - 6}`, '#b88e5c', 3); // rope lashing
  return o;
}
function windowSvg(fl) {
  const P = PAL[fl]; const W = 320, H = 260; const v = VIEW[fl]();
  let defs = lin('sky', P.sky) + v.d + `<clipPath id="op"><path d="${archD(0)}"/></clipPath>`;
  let o = `<g clip-path="url(#op)">${v.o}`;
  o += stk(archD(0), dark(P.frame, 0.4), 10, ' opacity=".18"'); // inner depth shade
  o += `</g>`;
  o += (fl === 'ferns' || fl === 'sky') ? frameBamboo(P.frame) : frameStone(P.frame, P);
  // sill ledge
  const sc = fl === 'sky' ? '#7a6aa0' : fl === 'ferns' ? '#bba25e' : dark(P.frame, 0.06);
  o += rect(10, 238, 300, 14, sc, ` rx="5"${OL(dark(sc, 0.42), 3)}`) + rect(16, 241, 288, 3, lite(sc, 0.35), ' rx="1.5"') + rect(14, 251, 292, 4, dark(sc, 0.4), ' rx="2" opacity=".35"');
  // vine with leaves over the upper-left of the arch, a tendril hanging on the right
  const vc = P.vine;
  o += stk('M24 200Q16 120 60 60Q100 18 150 10', dark(vc, 0.3), 3.5);
  for (const [x, y, a] of [[26, 176, 200], [22, 150, 160], [32, 118, 210], [46, 88, 150], [64, 60, 230], [88, 36, 170], [116, 20, 250], [140, 12, 200], [30, 132, 30], [54, 72, 10], [102, 26, 330]]) o += leaf(x, y, a, 16, 6, vc);
  o += stk('M262 44Q290 70 300 110Q304 130 298 150', dark(vc, 0.3), 2.5);
  for (const [x, y, a] of [[276, 58, 300], [292, 86, 20], [300, 118, 340], [298, 144, 60]]) o += leaf(x, y, a, 13, 5, vc);
  if (fl === 'nests') o += circ(30, 112, 3, '#ffd5e2', OL('#d79aae', 1.2)) + circ(58, 64, 3, '#fff4c4', OL('#d9be70', 1.2));
  if (fl === 'river') o += circ(40, 98, 3, '#ffe08a', OL('#d2a850', 1.2)) + circ(78, 46, 3, '#ffffff', OL('#d0c4b8', 1.2));
  return svg(W, H, o, defs);
}

// =====================================================================================
// FLOOR 512x192 (seamless x) – deck seen from the front/above, top edge y=0
// =====================================================================================
function flags(P, seed) { // stone flags, rows grow toward the viewer, widths sum to 512 per row
  const W = 512, H = 192, r = rng(seed), rows = [30, 34, 38, 42, 48];
  let o = rect(0, 0, W, H, P.grout), y = 0;
  rows.forEach((h, i) => {
    let ws = [], sum = 0; while (sum < W) { const w = 70 + Math.floor(r() * 70); ws.push(w); sum += w; }
    ws[ws.length - 1] -= sum - W; if (ws[ws.length - 1] < 40) { ws[ws.length - 2] += ws.pop(); }
    let x = Math.floor(r() * 120);
    ws.forEach((w, k) => {
      const c = mix(P.deckT[(k + i) % 3], P.grout, i * 0.05);
      const one = X => rect(X + 2, y + 2, w - 4, h - 3.5, c, ' rx="6"') + rect(X + 6, y + 3.5, w - 16, 2.5, lite(c, 0.25), ' rx="1.2"') + rect(X + 4, y + h - 7, w - 8, 4.5, dark(c, 0.08), ' rx="2"');
      o += one(x) + (x + w > W ? one(x - W) : '');
      if (r() < 0.5) { const sx = x + 10 + r() * (w - 20), sy = y + h * 0.5; o += wrap(sx, sy, 4, (X, Y) => circ(X, Y, 1.2 + r() * 1, dark(c, 0.12), ' opacity=".7"'), W, H, false); }
      x += w;
    });
    y += h;
  });
  return o;
}
function floorRiver() { const P = PAL.river; let o = flags(P, 3); o += rect(0, 0, 512, 5, dark(P.deck, 0.35)) + rect(0, 5, 512, 6, dark(P.deck, 0.25), ' opacity=".3"'); return svg(512, 192, o); }
function floorNests() { const P = PAL.nests; let o = flags(P, 9); o += rect(0, 0, 512, 5, dark(P.deck, 0.28)) + rect(0, 5, 512, 6, dark(P.deck, 0.2), ' opacity=".3"'); return svg(512, 192, o); }
function floorFerns() { // bamboo culms laid horizontally, nodes wrap mod 512
  const W = 512, H = 192, r = rng(17), rows = [18, 20, 22, 24, 26, 26, 28, 28]; const base = PAL.ferns.deck;
  let o = rect(0, 0, W, H, dark(base, 0.3)), y = 0;
  rows.forEach((h, i) => {
    const c = mix(i % 2 ? '#c2ad6a' : '#baa662', dark(base, 0.2), i * 0.03);
    o += rect(0, y + 1, W, h - 2, c) + rect(0, y + 3, W, h * 0.18, lite(c, 0.3)) + rect(0, y + h * 0.7, W, h * 0.22, dark(c, 0.1));
    const n = 3 + (i % 2), off = r() * 170;
    for (let k = 0; k < n; k++) { const nx = (off + k * W / n + r() * 30) % W; o += wrap(nx, y, 4, X => rect(X - 1.5, y + 1, 3, h - 2, dark(c, 0.28)) + rect(X + 1.5, y + 2, 1.5, h - 4, lite(c, 0.25)), W, H, false); }
    y += h;
  });
  o += rect(0, 0, W, 5, dark(base, 0.4)) + rect(0, 5, W, 6, dark(base, 0.3), ' opacity=".3"');
  return svg(W, H, o);
}
function floorSky() { // dusky violet-blue planks
  const W = 512, H = 192, r = rng(29), rows = [26, 32, 38, 44, 52]; const P = PAL.sky;
  let o = rect(0, 0, W, H, P.deck), y = 0;
  rows.forEach((h, i) => {
    const tone = mix(P.deck, '#3a3560', 0.1 + i * 0.07 + (i % 2) * 0.08);
    o += rect(0, y, W, h, tone) + rect(0, y + 1.5, W, 2.5, lite(tone, 0.12));
    for (let g = 0; g < 2; g++) { const gy = y + h * (0.4 + g * 0.3), ph = r() * 6.28, a = 1 + r() * 1.5; let d = `M0 ${f(gy + a * Math.sin(ph))}`; for (let x = 16; x <= W; x += 16) d += `L${x} ${f(gy + a * Math.sin(ph + x / W * 6.283 * 2))}`; o += stk(d, dark(tone, 0.14), 1.3, ' opacity=".55"'); }
    const off = (i * 157) % 256, n = 2 + (i % 2);
    for (let k = 0; k < n; k++) { const jx = (off + k * W / n + r() * 30) % W; o += wrap(jx, y, 4, X => rect(X - 1.5, y + 2, 3, h - 3, dark(tone, 0.3)) + rect(X + 1.5, y + 2, 2, h - 3, lite(tone, 0.08)), W, H, false); }
    y += h; o += rect(0, y - 2, W, 2, dark(tone, 0.35));
  });
  o += rect(0, 0, W, 5, dark(P.deck, 0.45)) + rect(0, 5, W, 6, dark(P.deck, 0.35), ' opacity=".35"');
  return svg(W, H, o);
}
const FLOOR = { river: floorRiver, ferns: floorFerns, nests: floorNests, sky: floorSky };

// =====================================================================================
// SHELF 512x56: bamboo beam (top surface y 8..18), lashings period 256
// =====================================================================================
function shelf() {
  const W = 512, top = '#e6c98a', face = '#cfae6a', out = dark(face, 0.48);
  let defs = lin('sh', [['0', '#3a2418', 0.3], ['1', '#3a2418', 0]]);
  let o = rect(0, 38, W, 16, 'url(#sh)');
  o += rect(0, 8, W, 10, top) + rect(0, 9.5, W, 2, lite(top, 0.4));
  o += rect(0, 18, W, 20, face) + rect(0, 20, W, 4, lite(face, 0.28)) + rect(0, 31, W, 7, dark(face, 0.12));
  for (const nx of [64, 192, 320, 448]) o += rect(nx - 2, 8, 4, 30, dark(face, 0.22)) + rect(nx + 2, 9, 1.5, 28, lite(face, 0.35)); // nodes
  for (const lx of [128, 384]) { // rope lashings (vertical wraps)
    for (const dx of [-5, 0, 5]) o += rect(lx + dx - 2, 6, 4, 34, '#c39a62', OL('#8a6a3e', 1.2)) + rect(lx + dx - 1.2, 8, 1.2, 30, '#dcbb86');
  }
  o += rect(0, 6.5, W, 2.5, out) + rect(0, 17, W, 1.6, dark(top, 0.3)) + rect(0, 37, W, 2.5, out);
  return svg(W, 56, o, defs);
}

// =====================================================================================
// TRACK 512x40: bamboo rail (two thin poles + cross-sticks), centre line y=20
// =====================================================================================
function track() {
  const W = 512, sl = '#b98d58', slO = dark(sl, 0.42), pole = '#e2c788', poleO = '#8f6c3c';
  let o = rect(0, 31, W, 5, '#3a2418', ' opacity=".16"');
  for (let x = 0; x < W; x += 32) {
    o += pth(`M${x + 12} 7H${x + 20}L${x + 22} 33H${x + 10}Z`, sl, OL(slO, 2));
    o += rect(x + 12.5, 9, 2.5, 22, lite(sl, 0.25), ' opacity=".8"');
  }
  const poleStrip = (y, h) => rect(0, y - 1.5, W, h + 3, poleO) + rect(0, y, W, h, pole) + rect(0, y + 0.6, W, Math.max(1.2, h * 0.35), lite(pole, 0.5));
  o += poleStrip(11.5, 4) + poleStrip(24, 5);
  for (let x = 48; x < W; x += 128) o += rect(x - 1, 10, 2, 7, poleO) + rect(x + 40, 22.5, 2, 8, poleO); // nodes
  return svg(W, 40, o);
}

// =====================================================================================
// DECOR 160x160 (base y≈150)
// =====================================================================================
const base = (cx, w) => ell(cx, 150, w, 5, '#3a2418', ' opacity=".18"');
function decor0() { // fern in a clay pot
  const pot = '#dc8f62'; let o = base(80, 40);
  o += frond(80, 104, 60, 60, 22, 50, 8, 18, '#6fae4e', 2, '#7dbc5a') + frond(80, 104, 104, 58, 140, 46, 8, 18, '#6fae4e', 2, '#7dbc5a');
  o += frond(80, 104, 74, 50, 70, 14, 8, 17, '#7dbc5a', 2, '#89c867') + frond(80, 104, 96, 70, 122, 78, 6, 14, '#78b656', 2);
  o += frond(80, 104, 62, 80, 36, 86, 6, 14, '#78b656', 2);
  o += pth('M50 108H110L102 148H58Z', pot, OL(dark(pot), 3)) + pth('M90 108H110L102 148H90Z', dark(pot, 0.14), ' opacity=".8"');
  o += rect(44, 100, 72, 14, lite(pot, 0.1), ` rx="5"${OL(dark(pot), 3)}`) + rect(50, 103, 30, 3, lite(pot, 0.45), ' rx="1.5"');
  o += stk('M60 126Q80 132 100 126', lite(pot, 0.35), 2.5);
  return svg(160, 160, o);
}
function decor1() { // nest with three spotted eggs
  const n = '#b88a58', nO = dark(n, 0.45); let o = base(80, 56);
  const egg = (x, y, rx, ry, c, rot) => { let g = `<g transform="rotate(${rot} ${x} ${y})">` + ell(x, y, rx, ry, c, OL(dark(c, 0.35), 3)) + ell(x + rx * 0.35, y + ry * 0.1, rx * 0.4, ry * 0.75, dark(c, 0.07), ' opacity=".8"') + ell(x - rx * 0.4, y - ry * 0.45, rx * 0.22, ry * 0.2, '#ffffff', ' opacity=".9"');
    for (const [u, v, s] of [[-0.2, 0.1, 0.16], [0.3, -0.3, 0.12], [0.1, 0.45, 0.13], [-0.45, 0.4, 0.1]]) g += circ(x + u * rx, y + v * ry, s * rx * 1.4, dark(c, 0.2), ' opacity=".8"');
    return g + '</g>'; };
  o += egg(58, 98, 17, 22, '#fff1dc', -10) + egg(102, 98, 17, 22, '#ffdcc8', 10) + egg(80, 92, 18, 24, '#ece0fb', 0);
  o += pth('M20 108Q80 104 140 108Q138 146 80 148Q22 146 20 108Z', n, OL(nO, 3));
  o += pth('M100 112Q138 110 138 116Q134 142 96 146Z', dark(n, 0.14), ' opacity=".8"');
  const r = rng(4);
  for (let i = 0; i < 14; i++) { const y = 112 + r() * 30, x0 = 26 + r() * 40, x1 = x0 + 40 + r() * 50; o += stk(`M${f(x0)} ${f(y)}Q${f((x0 + x1) / 2)} ${f(y + 4 - r() * 8)} ${f(Math.min(x1, 134))} ${f(y + 2 - r() * 4)}`, i % 2 ? dark(n, 0.3) : lite(n, 0.25), 2); }
  o += stk('M22 108Q80 116 138 108', lite(n, 0.3), 3) + stk('M30 104L16 98M128 104L144 96M60 106L54 96', nO, 2.5);
  return svg(160, 160, o);
}
function decor2() { // stack of round stone drums
  let o = base(80, 56);
  const drum = (cx, by, rw, h, c, skin) => {
    const ry = rw * 0.28, ty = by - h; let g = '';
    g += pth(`M${cx - rw} ${ty}V${by}A${rw} ${ry} 0 0 0 ${cx + rw} ${by}V${ty}Z`, c, OL(dark(c), 3));
    g += pth(`M${cx + rw * 0.45} ${ty + ry * 0.9}V${by + ry * 0.9}A${rw} ${ry} 0 0 0 ${cx + rw} ${by}V${ty}Z`, dark(c, 0.14), ' opacity=".8"');
    g += pth(`M${cx - rw} ${by - h * 0.45}A${rw} ${ry} 0 0 0 ${cx + rw} ${by - h * 0.45}`, 'none', ` stroke="${dark(c, 0.2)}" stroke-width="2"`);
    for (let k = -3; k <= 3; k++) { const u = k / 3.6, x = cx + u * rw, yy = ty + ry * Math.sqrt(1 - u * u) + 4; g += circ(x, yy, 2.2, '#9a6a44', OL('#6e4a2e', 1)); }
    const rr = rng(Math.round(rw)); for (let k = 0; k < 5; k++) g += circ(cx - rw * 0.8 + rr() * rw * 1.4, ty + ry + 8 + rr() * (h - 12), 1.3 + rr(), lite(c, 0.25), ' opacity=".9"');
    g += ell(cx, ty, rw, ry, skin, OL(dark(c), 3)) + ell(cx - rw * 0.2, ty - ry * 0.15, rw * 0.45, ry * 0.4, lite(skin, 0.5), ' opacity=".7"');
    return g;
  };
  o += drum(80, 140, 52, 30, '#b7aa98', '#f2dfbf') + drum(80, 100, 40, 26, '#c4a9a0', '#f5e4c8') + drum(80, 66, 28, 22, '#b4b09a', '#f6e8ce');
  return svg(160, 160, o);
}
function decor3() { // glowing mushroom cluster
  let defs = rad('mg', [['0', '#fff3b0', 0.7], ['0.6', '#ffe48a', 0.25], ['1', '#ffe48a', 0]]);
  let o = circ(80, 104, 62, 'url(#mg)') + base(80, 48);
  const mush = (x, by, h, cw, cap) => {
    const stem = '#fbf1de'; let g = pth(`M${x - cw * 0.18} ${by}Q${x - cw * 0.22} ${by - h * 0.6} ${x - cw * 0.12} ${by - h}H${x + cw * 0.12}Q${x + cw * 0.22} ${by - h * 0.6} ${x + cw * 0.18} ${by}Z`, stem, OL(dark(stem, 0.35), 3));
    g += pth(`M${x - cw / 2} ${by - h + 4}Q${x - cw / 2} ${by - h - cw * 0.62} ${x} ${by - h - cw * 0.62}Q${x + cw / 2} ${by - h - cw * 0.62} ${x + cw / 2} ${by - h + 4}Q${x} ${by - h - 4} ${x - cw / 2} ${by - h + 4}Z`, cap, OL(dark(cap, 0.4), 3));
    g += pth(`M${x - cw * 0.36} ${by - h - cw * 0.1}Q${x - cw * 0.3} ${by - h - cw * 0.45} ${x - cw * 0.05} ${by - h - cw * 0.52}`, 'none', ` stroke="${lite(cap, 0.55)}" stroke-width="3" stroke-linecap="round"`);
    for (const [u, v, s] of [[0.15, 0.3, 0.07], [-0.15, 0.22, 0.05], [0.3, 0.1, 0.05]]) g += circ(x + u * cw, by - h - v * cw, s * cw, '#fffbe6');
    return g;
  };
  o += mush(52, 148, 30, 40, '#f7a6b8') + mush(110, 148, 26, 36, '#ffc98a') + mush(80, 148, 46, 54, '#ffe07a');
  for (const [x, y] of [[36, 90], [128, 84], [96, 50], [60, 60]]) o += pth(twinkle(x, y, 5, 1.4), '#fff8cc');
  o += pth('M30 150Q40 138 50 150Z', '#8cc066', OL('#5f8f46', 2)) + pth('M118 150Q128 140 138 150Z', '#8cc066', OL('#5f8f46', 2));
  return svg(160, 160, o, defs);
}
function decor4() { // bamboo wind chime on a stand
  const b = '#d6bb78', bO = dark(b, 0.45); let o = base(64, 34);
  o += rect(30, 138, 68, 12, '#b98d58', ` rx="5"${OL(dark('#b98d58'), 3)}`);
  o += rect(56, 22, 14, 120, b, ` rx="6"${OL(bO, 3)}`) + rect(59, 26, 3, 112, lite(b, 0.4), ' rx="1.5"');
  for (const y of [60, 100]) o += rect(56, y, 14, 3, bO);
  o += rect(56, 18, 90, 12, b, ` rx="6"${OL(bO, 3)}`) + rect(62, 21, 78, 2.5, lite(b, 0.4), ' rx="1.2"');
  o += stk('M54 30L70 18M54 18L70 30', '#b88e5c', 3); // lashing
  o += stk('M122 30V40', '#8a6a3e', 1.6) + ell(122, 44, 18, 4, '#c39a62', OL('#8a6a3e', 2));
  const tubes = [[106, 52], [116, 66], [128, 58], [138, 44]];
  for (const [x] of tubes) o += stk(`M${122 + (x - 122) * 0.6} 46L${x} 54`, '#8a6a3e', 1.2);
  for (const [x, L] of tubes) { const c = x % 20 ? '#cdb06c' : '#dcc488'; o += rect(x - 4, 54, 8, L, c, ` rx="3"${OL(dark(c, 0.45), 2)}`) + rect(x - 2.5, 56, 1.6, L - 4, lite(c, 0.45)) + rect(x - 4, 54 + L * 0.55, 8, 1.6, dark(c, 0.35)); }
  o += stk('M122 46V118', '#8a6a3e', 1.2) + leaf(122, 118, 90, 16, 6, '#7dbc5a');
  return svg(160, 160, o);
}
function decor5() { // friendly baby long-neck dino figurine, carved in wood
  const w = '#d9a56c', wO = dark(w, 0.48); let o = base(80, 58);
  o += rect(26, 136, 108, 12, '#a8774a', ` rx="5"${OL(dark('#a8774a'), 3)}`) + rect(32, 138, 60, 2.5, lite('#a8774a', 0.3), ' rx="1.2"');
  o += pth('M104 112Q132 110 146 126Q140 132 128 128Q114 124 104 124Z', w, OL(wO, 3)); // tail
  for (const [x, c] of [[56, dark(w, 0.12)], [100, dark(w, 0.12)], [66, w], [92, w]]) o += rect(x - 7, 116, 14, 22, c, ` rx="6"${OL(wO, 3)}`);
  o += ell(80, 110, 34, 20, w, OL(wO, 3)) + pth('M58 120Q80 130 110 118Q102 126 80 128Q64 128 58 120Z', dark(w, 0.12), ' opacity=".8"');
  o += stk('M58 102Q44 84 46 58Q48 38 60 32', wO, 19) + stk('M58 102Q44 84 46 58Q48 38 60 32', w, 13); // neck
  o += ell(66, 32, 17, 13, w, OL(wO, 3)); // head (facing right)
  o += circ(70, 29, 5.5, '#ffffff', OL(wO, 2)) + circ(71.5, 29.5, 3.2, '#4a3428') + circ(72.6, 28, 1.2, '#ffffff');
  o += stk('M72 39Q78 42 82 37', wO, 2.2) + ell(78, 34, 3, 1.8, '#f0a08a', ' opacity=".7"') + circ(80, 30, 1.2, wO);
  for (const [x, y] of [[66, 96], [80, 94], [94, 98]]) o += ell(x, y, 5, 3, lite(w, 0.25), OL(dark(w, 0.25), 1.5)); // carved back spots
  o += stk('M50 70Q52 60 56 54', lite(w, 0.35), 2.5) + stk('M62 112Q72 116 84 114', dark(w, 0.25), 1.6) + stk('M88 104Q96 108 104 106', dark(w, 0.25), 1.6);
  return svg(160, 160, o);
}
function nightlight() { // hanging firefly jar lantern, glows
  let defs = rad('gl', [['0', '#f6ffb8', 0.8], ['0.5', '#eaff9a', 0.3], ['1', '#eaff9a', 0]]) + rad('jar', [['0', '#fbffd8', 0.9], ['1', '#d9eaa8', 0.55]]);
  let o = circ(48, 58, 46, 'url(#gl)');
  o += stk('M48 2V14', '#8a6a3e', 2.5) + stk('M36 20Q48 6 60 20', '#b88e5c', 3);
  o += pth('M28 30Q24 34 24 44V78Q24 90 36 90H60Q72 90 72 78V44Q72 34 68 30Z', 'url(#jar)', OL('#8f9a7a', 3));
  o += rect(30, 18, 36, 12, '#c39a62', ` rx="4"${OL('#7f5f38', 2.5)}`) + stk('M32 26H64', '#e0bf8a', 2);
  for (const [x, y] of [[40, 52], [56, 46], [50, 68], [38, 78], [60, 74]]) o += circ(x, y, 5, '#f4ff9a', ' opacity=".55"') + circ(x, y, 2.2, '#fbffcf');
  o += stk('M31 40V78', '#ffffff', 3, ' opacity=".6"');
  return svg(96, 96, o, defs);
}

// =====================================================================================
// PARTICLES 32x32 (centred)
// =====================================================================================
const P32 = (body, defs) => svg(32, 32, body, defs);
const particles = {
  mote: () => P32(circ(16, 16, 12, 'url(#m)') + circ(16, 16, 3.6, '#fff3c8'), rad('m', [['0', '#fff3c8', 0.9], ['0.45', '#ffe2a0', 0.4], ['1', '#ffe2a0', 0]])),
  leaf: () => P32(pth(leafD(5, 25, -45, 26, 8), '#8cc464', OL('#5f8f44', 1.6)) + pth(leafD(9, 22, -45, 15, 3.5), '#a6d67e', ' opacity=".8"') + stk('M5 25L22 8', '#5f8f44', 1.2) + stk('M11 19L9 14M15 15L13 10M11 19L16 21M15 15L20 17', '#6fa64e', 1) + stk('M4 26L2 28', '#5f8f44', 1.6)),
  butterfly: () => P32(pth('M16 15C12 5 3 3 3 10C3 15 9 17 15 16C9 18 5 23 8 27C11 29 15 23 16 18C17 23 21 29 24 27C27 23 23 18 17 16C23 17 29 15 29 10C29 3 20 5 16 15Z', '#ffffff', OL('#cfc8dc', 1.2)) + ell(16, 16.5, 1.4, 6, '#e6e1ee', OL('#bdb5cc', 0.8)) + stk('M15.5 11Q14 6 12 5M16.5 11Q18 6 20 5', '#bdb5cc', 0.9) + circ(9, 10, 1.8, '#f0edf5') + circ(23, 10, 1.8, '#f0edf5')),
  fluff: () => { let o = circ(16, 16, 9, 'url(#fz)'); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.2, L = i % 2 ? 11 : 8.5; o += stk(`M16 16Q${f(16 + Math.cos(a + 0.3) * L * 0.6)} ${f(16 + Math.sin(a + 0.3) * L * 0.6)} ${f(16 + Math.cos(a) * L)} ${f(16 + Math.sin(a) * L)}`, '#ffffff', 1.6, ' opacity=".9"'); } return P32(o + circ(16, 16, 3.2, '#fffaf2', OL('#e6dccc', 0.8)), rad('fz', [['0', '#ffffff', 0.9], ['1', '#ffffff', 0]])); },
  firefly: () => P32(circ(16, 16, 15, 'url(#ff)') + circ(16, 16, 4.2, '#f2ff9c') + circ(15, 15, 1.8, '#ffffff'), rad('ff', [['0', '#efff8a', 0.85], ['0.35', '#d8ff6a', 0.4], ['1', '#d8ff6a', 0]])),
  star: () => P32(pth(star5(16, 17, 13, 6.2), '#fff2b8', ` stroke="#d9ac4a" stroke-width="2" stroke-linejoin="round"`) + pth(star5(16, 17, 7, 3.4), '#fffbe6', ' opacity=".9"')),
  sparkle: () => P32(pth(twinkle(16, 16, 14, 4), '#fffbe8', OL('#e2c25a', 1.4)) + circ(16, 16, 2.4, '#ffffff')),
  note: () => P32(stk('M20 7V22', '#eef1ff', 7, ' opacity=".55"') + stk('M20 7Q26 9 26 15', '#eef1ff', 7, ' opacity=".55"') + ell(14, 23, 8.6, 6.8, '#eef1ff', ' transform="rotate(-22 14 23)" opacity=".55"') + stk('M20 7V22', '#24357a', 4.6) + stk('M20 7V22', '#3a4fa0', 2) + stk('M20 7Q26 9 26 15', '#24357a', 4.6) + stk('M20 7Q26 9 26 15', '#3a4fa0', 2) + ell(14, 23, 7, 5.2, '#3a4fa0', ` transform="rotate(-22 14 23)"${OL('#24357a', 2)}`) + ell(12, 21.5, 2.5, 1.4, '#8fa0e0', ' transform="rotate(-22 12 21.5)"')),
  confetti: () => P32(`<g transform="rotate(-18 16 16)">${rect(10, 9, 12, 14, '#ffffff', ' rx="1.5"')}${rect(10, 17, 12, 6, '#e8e8e8', ' rx="1.5"')}</g>`),
};

// =====================================================================================
for (const t of FLOORS) {
  write(`levels/${t}/wallpaper.svg`, WALL[t]());
  write(`levels/${t}/window.svg`, windowSvg(t));
  write(`levels/${t}/floor.svg`, FLOOR[t]());
}
write('room/shelf.svg', shelf());
write('room/track.svg', track());
[decor0, decor1, decor2, decor3, decor4, decor5].forEach((fn, i) => write(`room/decor_${i}.svg`, fn()));
write('room/nightlight.svg', nightlight());
for (const [k, fn] of Object.entries(particles)) write(`particles/${k}.svg`, fn());
console.log('environment art written to', OUT);
