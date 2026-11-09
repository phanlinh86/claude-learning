// Pom's Puzzle Town: little-town-street environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{spring,summer,autumn,winter}.svg, env/{sun,cloud_a,cloud_b}.svg and
// game/assets/default/particles/{petal,leaf_a,leaf_b,snow,mote,sparkle,star,confetti_a,confetti_b,dot,feather,dust}.svg;
// any other (old) particle file (sand, firefly …) is deleted.                                    (DESIGN §3, §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Everything is laid out on a period of 1200: rows of tiles / houses use widths that
// sum to 1200 (or spacings that divide 1200), and every prop that crosses x = 0 / 1200 is drawn twice (x and x ∓ 1200),
// so both edges match pixel for pixel (see docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm, light, slightly desaturated street; no answer hue (red/blue/yellow/green/orange/purple/
// pink) in a saturated form anywhere — the bright puzzle pieces must pop in front of it.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far    0 0 1200 720 : hazy town skyline (back row of houses, water tower, clock tower CLOCK = face centre, front row of
//                         roofs with chimneys, far trees). Transparent above. Its bottom line (720) sits BEHIND the
//                         shopfronts (render: y 720 → streetY − 150·km), so only the roofs show above the shops.
//   mid    0 0 1200 300 : terraced shopfronts (base y 268) with striped awnings, then a strip of shop-side pavement
//                         (268…300) with street trees, lamp posts, a bench and a bus-stop sign standing on y ≈ 292.
//                         MID_BASE = 298 → streetY.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (that 40 px "pavement edge" is where the mid layer's
//                         pavement shows through); 40…56 shop-side kerb, 56…104 a strip of road (dashed line), 104…116
//                         near kerb, 116…260 the near pavement in warm grey-beige tiles where Pom and the tray stand;
//                         the bottom row fades to PAVE_BOTTOM[m] (the render fills below the tile with it).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['spring', 'summer', 'autumn', 'winter'];
const MID_BASE = 298, GROUND_LINE = 40, FAR_BOTTOM = 720;
const CLOCK = { x: 864, y: 440 };   // clock-face centre in far-tile coordinates (the render may draw moving hands)
const f = n => (Math.round(n * 10) / 10).toString();
// tagged template: numbers are rounded to 0.1 — T`M${x} ${y}L…`
const T = (s, ...v) => s.reduce((a, str, i) => a + str + (i < v.length ? (typeof v[i] === 'number' ? f(v[i]) : v[i]) : ''), '');

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w) => ` stroke="${col}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) once, plus a wrapped copy if it crosses an edge (half = half width of the thing)
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- palettes ----------------
// sky gradient per mood (DESIGN §3); render paints it from y 0 to L.skyY1 and the last stop below
const SKY = {
  spring: [[0, '#BFE3F5'], [1, '#FDEFF4']],
  summer: [[0, '#79C6EF'], [1, '#D3F0FB']],
  autumn: [[0, '#F3C08E'], [1, '#FCE7C8']],
  winter: [[0, '#B9C8DC'], [1, '#EDF1F6']],
};
// near pavement (top of the near-pavement band) and its bottom colour (fill below the ground tile)
const PAVE = { spring: '#DCD2C3', summer: '#DFD5C4', autumn: '#D8CAB5', winter: '#EEF1F5' };
const PAVE_BOTTOM = { spring: '#D3C8B7', summer: '#D6CBB8', autumn: '#CFC0AA', winter: '#E6EAF0' };
const ROAD = { spring: '#B7B3B4', summer: '#BAB4B0', autumn: '#B3ABA5', winter: '#C4C8D0' };
// mood grading: base colour → mixed toward TINT[m] by t, then hazed toward HAZE[m] (far things)
const TINT = { spring: ['#FFF3F5', 0.06], summer: ['#FFFFFF', 0.0], autumn: ['#F2CFA0', 0.12], winter: ['#DCE3EE', 0.16] };
const HAZE = { spring: '#EAEFF6', summer: '#D2ECF7', autumn: '#F8DDBC', winter: '#E3E9F1' };
const RIM = { spring: '#FFF8F3', summer: '#FFFFFF', autumn: '#FFEBCB', winter: '#FFFFFF' };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#3C3842', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
const SNOW = '#FFFFFF', SNOW_S = '#DCE4EE';
// base colours, all calm / desaturated
const FACADE = ['#F1E7D6', '#E7D0C8', '#CFD8C6', '#E6D5BA', '#CDD5DC', '#E2CBB3', '#DAD4DD'];
const ROOF = ['#9EA3AF', '#B39E90', '#A9907C', '#A7AAB5'];
const AWN = ['#D8B0AA', '#AFC3A8', '#DCC8A0', '#A9BEBD', '#C2B8CA'];   // desaturated rose, sage, sand, grey-teal, lilac-grey
const AWN_CREAM = '#F6EFE3';
const GLASS = '#D5E2E7', GLOW = '#F6DEA8', DOOR = '#A98E76', FRAME = '#F8F2E8', METAL = '#80848F', TRUNK = '#A08670';
const TREE = {
  spring: { c: '#F6DFE6', s: '#E8C7D2', l: '#FFF6F8', dot: '#E2B9C7' },   // soft blossom (pastel, NOT answer pink)
  summer: { c: '#8DBF8A', s: '#78AA78', l: '#A9D2A3', dot: '#9CC898' },   // sage
  autumn: { c: '#D9A15A', s: '#C77F4A', l: '#E8BF83', dot: '#CF9255' },   // amber / ochre
  winter: null,                                                          // bare + snow
};
const FAR_TREE = { spring: '#E9D6DC', summer: '#9EC59A', autumn: '#D7AA70', winter: '#B7BCC6' };

// ---------------- shared small shapes ----------------
// a snow cap along the top of x … x + w at y (thickness t), soft drips
const snowCap = (x, y, w, t) => P(T`M${x - 2} ${y + 1}Q${x - 4} ${y - t} ${x + 5} ${y - t}L${x + w - 5} ${y - t}Q${x + w + 4} ${y - t} ${x + w + 2} ${y + 1}` +
  T`Q${x + w * 0.86} ${y + t * 0.6} ${x + w * 0.74} ${y + 1}Q${x + w * 0.62} ${y + t * 1.25} ${x + w * 0.48} ${y + 1}Q${x + w * 0.3} ${y + t * 0.7} ${x + w * 0.18} ${y + 1}Q${x + w * 0.08} ${y + t * 0.9} ${x - 2} ${y + 1}Z`, SNOW, OL(SNOW_S, 1.4));
// a window with frame, cross mullion and sill
function windowSq(m, x, y, w, h, opt = {}) {
  const winter = m === 'winter', glass = tone(m, winter ? GLOW : GLASS), fr = tone(m, FRAME);
  let s = R(x - 3, y - 3, w + 6, h + 6, fr, ` rx="3"${OL(dk(fr, 0.3), 2)}`) + R(x, y, w, h, glass, ' rx="2"');
  if (opt.arch) s = P(T`M${x - 3} ${y + h + 3}L${x - 3} ${y + w / 2}A${w / 2 + 3} ${w / 2 + 3} 0 0 1 ${x + w + 3} ${y + w / 2}L${x + w + 3} ${y + h + 3}Z`, fr, OL(dk(fr, 0.3), 2)) +
    P(T`M${x} ${y + h}L${x} ${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}L${x + w} ${y + h}Z`, glass);
  // soft reflection
  s += P(T`M${x + w * 0.18} ${y + h * 0.9}L${x + w * 0.5} ${y + h * 0.2}L${x + w * 0.66} ${y + h * 0.2}L${x + w * 0.34} ${y + h * 0.9}Z`, '#FFFFFF', ` opacity="${winter ? 0.25 : 0.45}"`);
  s += S(T`M${x + w / 2} ${y + (opt.arch ? 4 : 0)}L${x + w / 2} ${y + h}M${x} ${y + h * 0.5}L${x + w} ${y + h * 0.5}`, fr, 3);
  s += R(x - 6, y + h + 2, w + 12, 5, lt(fr, 0.2), ` rx="2"${OL(dk(fr, 0.3), 1.6)}`);
  if (opt.box && !winter) {   // a little flower box (muted leaves + cream/blush blooms)
    const bc = tone(m, '#B8977A');
    s += R(x - 3, y + h + 7, w + 6, 8, bc, ` rx="2"${OL(dk(bc, 0.3), 1.6)}`);
    const leaf = tone(m, m === 'autumn' ? '#B9A36E' : '#9DBB95');
    for (let i = 0; i < 4; i++) s += C(x + 2 + i * (w - 4) / 3, y + h + 6, 4.4, leaf);
    if (m !== 'autumn') for (let i = 0; i < 3; i++) s += C(x + 6 + i * (w - 12) / 2, y + h + 3.5, 2.6, i % 2 ? '#F4E8DA' : '#EBCFD3');
  }
  if (winter) s += snowCap(x - 6, y + h + 2, w + 12, 4);
  return s;
}

// =====================================================================================================
// FAR (0 0 1200 720): hazy skyline, bottom anchored, transparent top
// =====================================================================================================
function farHouse(x, w, ridge, base, kind, wall, roof, winter, winC) {
  let s = '';
  const eave = ridge + (kind === 'gable' ? Math.min(46, w * 0.42) : kind === 'mansard' ? 26 : 0);
  if (kind === 'gable') {
    s += P(poly([[x, base], [x, eave], [x + w / 2, ridge], [x + w, eave], [x + w, base]]), wall);
    s += P(poly([[x - 6, eave + 4], [x + w / 2, ridge - 4], [x + w + 6, eave + 4], [x + w + 6, eave + 10], [x + w / 2, ridge + 4], [x - 6, eave + 10]]), roof);
    if (winter) s += P(poly([[x - 6, eave + 4], [x + w / 2, ridge - 6], [x + w + 6, eave + 4], [x + w / 2, ridge + 2]]), SNOW);
  } else if (kind === 'mansard') {
    s += R(x, eave, w, base - eave, wall);
    s += P(poly([[x - 4, eave], [x + 8, ridge], [x + w - 8, ridge], [x + w + 4, eave]]), roof);
    if (winter) s += R(x + 6, ridge - 4, w - 12, 6, SNOW, ' rx="3"');
  } else {   // flat block with a cornice
    s += R(x, ridge, w, base - ridge, wall) + R(x - 3, ridge - 5, w + 6, 7, roof);
    if (winter) s += R(x - 3, ridge - 9, w + 6, 6, SNOW, ' rx="3"');
  }
  // tiny windows (two rows)
  const cols = Math.max(2, Math.round(w / 26)), ww = 8, gap = w / cols;
  for (let r = 0; r < 3; r++) {
    const wy = eave + 16 + r * 30; if (wy > base - 30) break;
    for (let c = 0; c < cols; c++) s += R(x + gap * (c + 0.5) - ww / 2, wy, ww, 12, winC, ' rx="1.5"');
  }
  return s;
}
function far(m) {
  const winter = m === 'winter';
  const r = rng(17 + MOODS.indexOf(m));
  let o = '', defs = '';
  const B = FAR_BOTTOM;
  // ---- 1 back row (very hazy): widths sum to 1200 so the row tiles
  const backW = [96, 120, 84, 132, 104, 90, 118, 100, 126, 88, 142];   // = 1200
  const backC = ['#D8CFC6', '#CDC8C8', '#D6CBBE', '#CFCBC9'];
  let x = -30;
  backW.forEach((w, i) => {
    const ridge = 470 + ((i * 37) % 5) * 14, kind = ['gable', 'flat', 'mansard', 'gable', 'flat'][i % 5];
    const wall = tone(m, backC[i % 4], 0.62), roof = tone(m, ROOF[i % 4], 0.62), wc = tone(m, winter ? '#EED9B4' : '#C9D3DA', 0.62);
    const x0 = x;
    o += both(xx => farHouse(xx - w / 2, w, ridge, B, kind, wall, roof, winter, wc), x0 + w / 2, w / 2 + 8);
    x += w;
  });
  // ---- 2 water tower (back, hazy): tank on four legs with a cone roof
  const wt = xx => {
    const leg = tone(m, '#A39B93', 0.5), tank = tone(m, '#BDB3A8', 0.5), band = tone(m, '#A99E93', 0.5), cap = tone(m, '#9EA3AF', 0.5);
    let s = S(T`M${xx - 30} 600L${xx - 22} 470M${xx + 30} 600L${xx + 22} 470M${xx - 10} 600L${xx - 8} 470M${xx + 10} 600L${xx + 8} 470`, leg, 5);
    s += S(T`M${xx - 27} 560L${xx + 27} 520M${xx + 27} 560L${xx - 27} 520M${xx - 25} 520L${xx + 25} 520`, leg, 2.6);
    s += P(T`M${xx - 34} 422Q${xx - 36} 474 ${xx - 30} 476L${xx + 30} 476Q${xx + 36} 474 ${xx + 34} 422Z`, tank);
    s += R(xx - 35, 440, 70, 5, band) + R(xx - 34, 458, 68, 4, band);
    s += P(T`M${xx - 40} 424L${xx} 392L${xx + 40} 424Z`, cap) + C(xx, 390, 4, cap);
    if (winter) s += P(T`M${xx - 40} 424L${xx} 390L${xx + 40} 424Q${xx} 412 ${xx - 40} 424Z`, SNOW);
    return s;
  };
  o += both(wt, 258, 44);
  // ---- 3 clock tower (medium haze): square shaft, belfry with arched openings, clock face, pointed roof
  const ct = xx => {
    const wall = tone(m, '#D8C8B3', 0.38), sh = tone(m, '#C5B49F', 0.38), roof = tone(m, '#959CAA', 0.38), face = tone(m, '#F7F1E4', 0.25), ink = tone(m, '#7D7468', 0.3);
    let s = R(xx - 34, 470, 68, B - 470, wall) + R(xx + 12, 470, 22, B - 470, sh, ' opacity="0.7"');
    s += R(xx - 40, 470, 80, 9, sh);                                     // ledge under the clock stage
    s += R(xx - 38, 412, 76, 58, wall) + R(xx - 42, 404, 84, 10, sh);    // clock stage + cornice
    s += C(CLOCK.x - 864 + xx, CLOCK.y, 24, face, OL(ink, 3));
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; s += C(xx + Math.cos(a) * 18, CLOCK.y + Math.sin(a) * 18, 1.6, ink); }
    s += S(T`M${xx} ${CLOCK.y}L${xx} ${CLOCK.y - 27}M${xx} ${CLOCK.y}L${xx + 10} ${CLOCK.y - 8}`, ink, 3);
    s += R(xx - 30, 360, 60, 44, wall);                                  // belfry
    for (const dx of [-15, 15]) s += P(T`M${xx + dx - 8} 398L${xx + dx - 8} 378A8 8 0 0 1 ${xx + dx + 8} 378L${xx + dx + 8} 398Z`, sh);
    s += P(T`M${xx - 40} 362L${xx} 300L${xx + 40} 362Z`, roof) + S(T`M${xx} 300L${xx} 284`, ink, 3) + C(xx, 282, 4.5, tone(m, '#D9C38E', 0.3));
    for (let k = 0; k < 4; k++) s += R(xx - 20 + k * 11, 500 + (k % 2) * 60, 7, 16, tone(m, winter ? '#EED9B4' : '#C9D3DA', 0.38), ' rx="3"');
    if (winter) s += P(T`M${xx - 40} 362L${xx} 298L${xx + 40} 362Q${xx + 18} 344 ${xx} 336Q${xx - 18} 344 ${xx - 40} 362Z`, SNOW) + R(xx - 43, 399, 86, 7, SNOW, ' rx="3.5"') + R(xx - 41, 466, 82, 6, SNOW, ' rx="3"');
    return s;
  };
  o += both(ct, CLOCK.x, 44);
  // ---- 4 front row of roofs with chimneys (less haze), widths sum to 1200
  const frontW = [130, 110, 150, 96, 124, 140, 104, 116, 130, 100];   // = 1200
  const frontC = ['#E0D3C2', '#D9CCCB', '#D4D8CD', '#E1D2BC', '#D6D9DE'];
  x = 40;
  frontW.forEach((w, i) => {
    const ridge = 540 + ((i * 53) % 4) * 16, kind = ['gable', 'gable', 'flat', 'mansard', 'gable'][i % 5];
    const wall = tone(m, frontC[i % 5], 0.36), roof = tone(m, ROOF[(i + 1) % 4], 0.36), wc = tone(m, winter ? GLOW : '#C9D3DA', 0.36);
    const cx = x + w / 2, chim = i % 3 !== 1;
    const fn = xx => {
      let s = '';
      if (chim) {   // chimney behind the roof
        const chx = xx + (i % 2 ? -w * 0.22 : w * 0.24), chy = ridge + (kind === 'gable' ? 6 : -4), cc = tone(m, '#B9A08E', 0.36);
        s += R(chx - 8, chy - 24, 16, 40, cc) + R(chx - 10, chy - 28, 20, 6, dk(cc, 0.1));
        if (winter) s += R(chx - 10, chy - 32, 20, 6, SNOW, ' rx="3"');
      }
      return s + farHouse(xx - w / 2, w, ridge, B, kind, wall, roof, winter, wc);
    };
    o += both(fn, cx, w / 2 + 12);
    x += w;
  });
  // ---- 5 far trees between and in front of the houses (round, hazy, seasonal)
  const ftc = tone(m, FAR_TREE[m], 0.3), fts = dk(ftc, 0.08);
  for (let i = 0; i < 9; i++) {
    const tx = (i + 0.35 + r() * 0.3) * W / 9, ty = 612 + r() * 16, tr = 22 + r() * 10;
    const fn = xx => {
      let s = R(xx - 3, ty, 6, B - ty, tone(m, TRUNK, 0.35));
      if (winter) {   // bare twigs
        s += S(T`M${xx} ${ty + 10}L${xx} ${ty - tr}M${xx} ${ty - 2}L${xx - tr * 0.7} ${ty - tr * 0.8}M${xx} ${ty - 8}L${xx + tr * 0.7} ${ty - tr * 0.9}M${xx} ${ty - tr * 0.4}L${xx - tr * 0.3} ${ty - tr * 1.2}`, ftc, 3);
        s += S(T`M${xx - tr * 0.66} ${ty - tr * 0.82}L${xx - tr * 0.4} ${ty - tr * 0.6}M${xx + tr * 0.66} ${ty - tr * 0.9}L${xx + tr * 0.4} ${ty - tr * 0.66}`, SNOW, 2.6);
      } else s += C(xx - tr * 0.55, ty - tr * 0.2, tr * 0.72, fts) + C(xx + tr * 0.5, ty - tr * 0.15, tr * 0.7, fts) + C(xx, ty - tr * 0.6, tr, ftc);
      return s;
    };
    o += both(fn, tx, tr * 1.4);
  }
  // soft haze band at the bottom (so the skyline melts behind the shops)
  defs += lg('hz', [[0, HAZE[m], 0], [1, HAZE[m], 0.55]], V);
  o += R(0, 560, W, 160, 'url(#hz)');
  return svg(1200, 720, o, defs, `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): terraced shopfronts + shop-side pavement + street props
// =====================================================================================================
const SB = 268;   // building base line (top of the mid pavement strip)
const PY = 292;   // where the street props stand
// shop signs (blank of text): a little hanging disc with a neutral icon
function bladeSign(m, x, y, icon) {
  const disc = tone(m, '#F4ECDD'), ink = tone(m, '#9B8371'), br = tone(m, METAL);
  let s = S(T`M${x - 22} ${y - 18}L${x + 4} ${y - 18}M${x - 10} ${y - 18}L${x - 10} ${y - 12}M${x + 2} ${y - 18}L${x + 2} ${y - 12}`, br, 2.4);
  s += C(x - 4, y, 13, disc, OL(dk(disc, 0.35), 2.2));
  if (icon === 'cup') s += P(T`M${x - 11} ${y - 5}L${x + 2} ${y - 5}L${x + 1} ${y + 5}Q${x - 4} ${y + 8} ${x - 10} ${y + 5}Z`, ink) + S(T`M${x + 2} ${y - 3}q5 1 0 6`, ink, 2);
  else if (icon === 'loaf') s += E(x - 4, y + 1, 9.5, 6, ink) + S(T`M${x - 8} ${y - 2}l2 4M${x - 4} ${y - 3}l2 4M${x} ${y - 2}l2 4`, disc, 1.4);
  else if (icon === 'book') s += P(T`M${x - 13} ${y - 6}Q${x - 8} ${y - 8} ${x - 4} ${y - 5}Q${x} ${y - 8} ${x + 5} ${y - 6}L${x + 5} ${y + 6}Q${x} ${y + 4} ${x - 4} ${y + 7}Q${x - 8} ${y + 4} ${x - 13} ${y + 6}Z`, ink) + S(T`M${x - 4} ${y - 5}L${x - 4} ${y + 7}`, disc, 1.3);
  else if (icon === 'flower') { for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4 - Math.PI / 2; s += C(x - 4 + Math.cos(a) * 5, y - 2 + Math.sin(a) * 5, 3.4, ink); } s += C(x - 4, y - 2, 2.4, disc) + S(T`M${x - 4} ${y + 3}L${x - 4} ${y + 10}`, ink, 2); }
  else s += E(x - 5, y + 2, 8, 6, ink) + S(T`M${x + 2} ${y + 1}L${x + 7} ${y - 4}M${x - 13} ${y}q-3 3 1 6`, ink, 2.2) + C(x - 5, y - 5, 2, ink);   // teapot (tea room)
  return s;
}
// a striped awning with a scalloped valance; top edge at y over x1..x2, depth d
function awning(m, x1, x2, y, d, col) {
  const c1 = tone(m, col), c2 = tone(m, AWN_CREAM), ol = dk(c1, 0.35);
  const n = Math.max(5, Math.round((x2 - x1) / 18)) | 1, flare = 8, bx1 = x1 - flare, bx2 = x2 + flare;
  let s = '';
  // shade on the wall under the awning
  s += R(x1, y + d - 2, x2 - x1, 12, dk(c1, 0.6), ' opacity="0.18"');
  let outline = T`M${x1} ${y}L${x2} ${y}L${bx2} ${y + d}`;
  for (let k = 0; k < n; k++) {
    const tx1 = x1 + (x2 - x1) * k / n, tx2 = x1 + (x2 - x1) * (k + 1) / n, b1 = bx1 + (bx2 - bx1) * k / n, b2 = bx1 + (bx2 - bx1) * (k + 1) / n;
    s += P(T`M${tx1} ${y}L${tx2} ${y}L${b2} ${y + d}Q${(b1 + b2) / 2} ${y + d + 12} ${b1} ${y + d}Z`, k % 2 ? c2 : c1);
  }
  for (let k = n - 1; k >= 0; k--) { const b1 = bx1 + (bx2 - bx1) * k / n, b2 = bx1 + (bx2 - bx1) * (k + 1) / n; outline += T`Q${(b1 + b2) / 2} ${y + d + 12} ${b1} ${y + d}`; }
  outline += 'Z';
  s += S(outline, ol, 2.4);
  s += S(T`M${x1 + 2} ${y + 3}L${x2 - 2} ${y + 3}`, lt(c2, 0.4), 2, ' opacity="0.8"');
  s += R(x1 - 4, y - 5, x2 - x1 + 8, 6, tone(m, METAL), ` rx="3"`);   // the roller bar
  if (m === 'winter') s += snowCap(x1 - 6, y - 4, x2 - x1 + 12, 7) + P(T`M${x1} ${y}L${x2} ${y}L${bx2 - 2} ${y + d * 0.45}Q${(x1 + x2) / 2} ${y + d * 0.62} ${bx1 + 2} ${y + d * 0.45}Z`, SNOW, ' opacity="0.92"');
  return s;
}
function shop(m, x, w, h, o) {
  const winter = m === 'winter';
  const wall = tone(m, FACADE[o.c]), wd = dk(wall, 0.3), ws = dk(wall, 0.08), roof = tone(m, ROOF[o.roof || 0]);
  const top = SB - h;
  let s = '';
  // roof / top shape behind and above the facade
  if (o.top === 'gable') {
    const ap = Math.min(54, w * 0.34);
    s += R(x + w * 0.7, top - ap - 6, 16, 40, tone(m, '#B9A08E'), OL(dk(tone(m, '#B9A08E'), 0.3), 2)); // chimney
    if (winter) s += R(x + w * 0.7 - 2, top - ap - 12, 20, 7, SNOW, ' rx="3.5"');
    s += P(poly([[x, top], [x + w / 2, top - ap], [x + w, top]]), wall, OL(wd, 2.6));
    s += P(poly([[x - 8, top + 4], [x + w / 2, top - ap - 6], [x + w + 8, top + 4], [x + w + 8, top + 12], [x + w / 2, top - ap + 4], [x - 8, top + 12]]), roof, OL(dk(roof, 0.3), 2.4));
    s += C(x + w / 2, top - ap * 0.42, 9, tone(m, winter ? GLOW : GLASS), OL(tone(m, FRAME), 3));
    if (winter) s += P(poly([[x - 9, top + 4], [x + w / 2, top - ap - 8], [x + w + 9, top + 4], [x + w / 2, top - ap + 2]]), SNOW, OL(SNOW_S, 1.2));
  } else if (o.top === 'dutch') {   // curved shoulders up to a narrow cap
    const ch = 40, nw = w * 0.4;
    s += P(T`M${x} ${top}Q${x} ${top - ch * 0.4} ${x + (w - nw) / 2} ${top - ch * 0.5}Q${x + (w - nw) / 2} ${top - ch} ${x + w / 2 - nw / 2 + 4} ${top - ch}L${x + w / 2 + nw / 2 - 4} ${top - ch}Q${x + (w + nw) / 2} ${top - ch} ${x + (w + nw) / 2} ${top - ch * 0.5}Q${x + w} ${top - ch * 0.4} ${x + w} ${top}Z`, wall, OL(wd, 2.6));
    s += R(x + w / 2 - nw / 2, top - ch - 6, nw, 8, ws, ` rx="3"${OL(wd, 2)}`);
    s += E(x + w / 2, top - ch * 0.45, 9, 11, tone(m, winter ? GLOW : GLASS), OL(tone(m, FRAME), 3));
    if (winter) s += snowCap(x + w / 2 - nw / 2, top - ch - 6, nw, 6);
  } else if (o.top === 'mansard') {
    s += P(poly([[x - 4, top], [x + 10, top - 34], [x + w - 10, top - 34], [x + w + 4, top]]), roof, OL(dk(roof, 0.3), 2.4));
    for (const dx of [0.3, 0.7]) { const dx0 = x + w * dx; s += R(dx0 - 10, top - 30, 20, 24, tone(m, FRAME), ` rx="3"${OL(dk(roof, 0.3), 2)}`) + R(dx0 - 6, top - 25, 12, 16, tone(m, winter ? GLOW : GLASS), ' rx="2"'); if (winter) s += snowCap(dx0 - 12, top - 30, 24, 5); }
    if (winter) s += snowCap(x + 8, top - 34, w - 16, 7);
  }
  // facade body
  s += R(x, top, w, h, wall, OL(wd, 2.6));
  s += R(x + w - 10, top, 10, h, ws, ' opacity="0.6"');      // a soft corner shade (light from upper-left)
  if (o.top === 'flat' || !o.top) {
    s += R(x - 5, top - 12, w + 10, 14, ws, ` rx="2"${OL(wd, 2.4)}`);
    for (let k = 0; k < Math.floor(w / 16); k++) s += R(x + 6 + k * 16, top + 3, 8, 5, ws);
    if (winter) s += snowCap(x - 5, top - 12, w + 10, 8);
  }
  // upper windows
  const floors = o.floors || 1, nwin = o.win || 2, ww = Math.min(30, (w - 30) / nwin - 14), wh = ww * 1.25;
  for (let fl = 0; fl < floors; fl++) {
    const wy = top + 20 + fl * (wh + 26);
    for (let k = 0; k < nwin; k++) s += windowSq(m, x + w * (k + 0.5) / nwin - ww / 2, wy, ww, wh, { arch: o.arch, box: o.box && fl === floors - 1 });
  }
  if (o.cat) {   // a little cat dozing in the first upper window (cream-grey, tail over the sill)
    const cx0 = x + w * 0.5 / nwin, cy0 = top + 20 + wh, cc = tone(m, '#D4CCC0'), co = dk(cc, 0.4);
    s += P(T`M${cx0 - 11} ${cy0}Q${cx0 - 12} ${cy0 - 13} ${cx0 - 2} ${cy0 - 14}Q${cx0 + 10} ${cy0 - 13} ${cx0 + 10} ${cy0}Z`, cc, OL(co, 1.6));
    s += C(cx0 - 6, cy0 - 17, 6.5, cc, OL(co, 1.6)) + P(T`M${cx0 - 12} ${cy0 - 20}L${cx0 - 11} ${cy0 - 28}L${cx0 - 6} ${cy0 - 23}ZM${cx0 - 4} ${cy0 - 23}L${cx0 + 1} ${cy0 - 28}L${cx0 + 0.5} ${cy0 - 19}Z`, cc, OL(co, 1.4));
    s += S(T`M${cx0 - 9} ${cy0 - 17}q1.4 1.2 2.8 0M${cx0 - 5} ${cy0 - 17}q1.4 1.2 2.8 0`, co, 1.2);
    s += S(T`M${cx0 + 8} ${cy0 - 2}Q${cx0 + 16} ${cy0 + 2} ${cx0 + 12} ${cy0 + 12}`, cc, 4) + S(T`M${cx0 + 8} ${cy0 - 2}Q${cx0 + 16} ${cy0 + 2} ${cx0 + 12} ${cy0 + 12}`, co, 1.2, ' opacity="0.6"');
  }
  // ground floor: shop window + door + awning + sign
  const gfTop = SB - 92, dw = 30, doorX = o.door === 'left' ? x + 14 : x + w - 14 - dw;
  const swX = o.door === 'left' ? doorX + dw + 12 : x + 14, swW = w - 28 - dw - 12;
  const glass = tone(m, winter ? GLOW : GLASS), fr = tone(m, FRAME);
  s += R(x + 6, gfTop - 8, w - 12, 6, ws, ` rx="2"${OL(wd, 1.8)}`);                     // fascia ledge
  s += R(swX - 4, gfTop + 22, swW + 8, SB - gfTop - 22 - 6, fr, ` rx="3"${OL(dk(fr, 0.3), 2)}`);
  s += R(swX, gfTop + 26, swW, SB - gfTop - 36, glass, ' rx="2"');
  // window display: a shelf with a few rounded neutral things
  const dsp = dk(glass, winter ? 0.16 : 0.12);
  s += R(swX + 4, SB - 26, swW - 8, 4, dsp);
  for (let k = 0; k < 3; k++) { const ix = swX + swW * (k + 0.5) / 3; s += k === 1 ? R(ix - 9, SB - 44, 18, 18, dsp, ' rx="4"') : E(ix, SB - 33, 9, 8, dsp); }
  s += P(T`M${swX + swW * 0.1} ${SB - 12}L${swX + swW * 0.36} ${gfTop + 26}L${swX + swW * 0.48} ${gfTop + 26}L${swX + swW * 0.22} ${SB - 12}Z`, '#FFFFFF', ` opacity="${winter ? 0.2 : 0.4}"`);
  // door (rounded top), little window, knob, step
  const dc = tone(m, DOOR);
  s += P(T`M${doorX - 3} ${SB}L${doorX - 3} ${gfTop + 22}A${dw / 2 + 3} ${dw / 2 + 3} 0 0 1 ${doorX + dw + 3} ${gfTop + 22}L${doorX + dw + 3} ${SB}Z`, fr, OL(dk(fr, 0.3), 2));
  s += P(T`M${doorX} ${SB}L${doorX} ${gfTop + 22}A${dw / 2} ${dw / 2} 0 0 1 ${doorX + dw} ${gfTop + 22}L${doorX + dw} ${SB}Z`, dc, OL(dk(dc, 0.3), 1.8));
  s += P(T`M${doorX + 6} ${gfTop + 40}L${doorX + 6} ${gfTop + 26}A${dw / 2 - 6} ${dw / 2 - 6} 0 0 1 ${doorX + dw - 6} ${gfTop + 26}L${doorX + dw - 6} ${gfTop + 40}Z`, glass);
  s += C(doorX + (o.door === 'left' ? dw - 6 : 6), SB - 34, 2.4, tone(m, '#E2CC94'));
  s += R(doorX - 6, SB - 4, dw + 12, 5, tone(m, '#C9C0B4'), ` rx="2"${OL(dk(tone(m, '#C9C0B4'), 0.3), 1.4)}`);
  // awning over the shop window
  s += awning(m, swX - 6, swX + swW + 6, gfTop + 2, 24, AWN[o.awn]);
  // hanging sign at the door side
  if (o.sign) s += bladeSign(m, o.door === 'left' ? x + 30 : x + w - 8, gfTop - 28, o.sign);
  return s;
}
function streetTree(m, x, sc = 1) {
  const tr = tone(m, TRUNK), td = dk(tr, 0.35), grate = tone(m, METAL);
  let s = E(x, PY + 1, 24 * sc, 5, dk(tone(m, PAVE[m]), 0.25), ' opacity="0.5"');
  s += E(x, PY, 20 * sc, 4.5, grate, ' opacity="0.8"');
  const ty = PY - 120 * sc;   // canopy centre height
  s += P(T`M${x - 6 * sc} ${PY}Q${x - 4 * sc} ${ty + 40 * sc} ${x - 3 * sc} ${ty + 10}L${x + 3 * sc} ${ty + 10}Q${x + 4 * sc} ${ty + 40 * sc} ${x + 6 * sc} ${PY}Z`, tr, OL(td, 2));
  const C0 = TREE[m];
  if (!C0) {   // winter: bare branches with snow along the tops
    const br = T`M${x} ${ty + 30}L${x - 34 * sc} ${ty - 22 * sc}M${x - 18 * sc} ${ty + 6}L${x - 30 * sc} ${ty - 44 * sc}M${x} ${ty + 20}L${x + 6 * sc} ${ty - 56 * sc}M${x + 2 * sc} ${ty - 10}L${x + 30 * sc} ${ty - 36 * sc}M${x} ${ty + 34}L${x + 42 * sc} ${ty - 2 * sc}M${x + 22 * sc} ${ty + 14}L${x + 40 * sc} ${ty - 22 * sc}M${x - 26 * sc} ${ty - 10 * sc}L${x - 48 * sc} ${ty - 14 * sc}`;
    s += S(br, td, 6.2 * sc) + S(br, tr, 3.8 * sc);
    s += S(T`M${x - 30 * sc} ${ty - 18 * sc}L${x - 20 * sc} ${ty - 6 * sc}M${x - 28 * sc} ${ty - 40 * sc}L${x - 22 * sc} ${ty - 22 * sc}M${x + 5 * sc} ${ty - 52 * sc}L${x + 3 * sc} ${ty - 30 * sc}M${x + 27 * sc} ${ty - 34 * sc}L${x + 16 * sc} ${ty - 24 * sc}M${x + 38 * sc} ${ty - 2 * sc}L${x + 24 * sc} ${ty + 10 * sc}M${x - 46 * sc} ${ty - 15 * sc}L${x - 36 * sc} ${ty - 13 * sc}`, SNOW, 3.4 * sc);
    s += E(x, PY - 3, 20 * sc, 4, SNOW);
    return s;
  }
  const cs = T`` + C(x - 36 * sc, ty + 8 * sc, 30 * sc, C0.s) + C(x + 36 * sc, ty + 10 * sc, 30 * sc, C0.s) + C(x, ty + 20 * sc, 32 * sc, C0.s);
  let can = cs + C(x - 26 * sc, ty - 10 * sc, 34 * sc, C0.c) + C(x + 26 * sc, ty - 6 * sc, 32 * sc, C0.c) + C(x, ty - 30 * sc, 36 * sc, C0.c) + C(x + 4 * sc, ty + 4 * sc, 30 * sc, C0.c);
  can += C(x - 22 * sc, ty - 34 * sc, 14 * sc, C0.l, ' opacity="0.8"') + C(x - 36 * sc, ty - 12 * sc, 9 * sc, C0.l, ' opacity="0.7"');
  // outline the whole canopy softly by a slightly larger dark copy behind
  const back = C(x - 26 * sc, ty - 10 * sc, 36.5 * sc, dk(C0.s, 0.25)) + C(x + 26 * sc, ty - 6 * sc, 34.5 * sc, dk(C0.s, 0.25)) + C(x, ty - 30 * sc, 38.5 * sc, dk(C0.s, 0.25)) +
    C(x - 36 * sc, ty + 8 * sc, 32.5 * sc, dk(C0.s, 0.25)) + C(x + 36 * sc, ty + 10 * sc, 32.5 * sc, dk(C0.s, 0.25)) + C(x, ty + 20 * sc, 34.5 * sc, dk(C0.s, 0.25));
  s += back + can;
  // blossoms / leaf texture dots
  const r = rng(Math.round(x * 7) + 3);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 46 * sc, px = x + Math.cos(a) * d * 1.1, py = ty - 8 * sc + Math.sin(a) * d * 0.8;
    s += m === 'spring' ? C(px, py, 3.2 * sc, i % 3 ? '#FFFFFF' : C0.dot, ' opacity="0.9"') : E(px, py, 4.2 * sc, 2.6 * sc, C0.dot, ` opacity="0.75" transform="rotate(${f(a * 57)} ${f(px)} ${f(py)})"`);
  }
  return s;
}
function lampPost(m, x) {
  const mt = tone(m, METAL), md = dk(mt, 0.3), lamp = tone(m, '#F5EBCB');
  let s = E(x, PY + 1, 14, 3.5, dk(tone(m, PAVE[m]), 0.25), ' opacity="0.5"');
  s += P(T`M${x - 9} ${PY}L${x - 6} ${PY - 16}L${x + 6} ${PY - 16}L${x + 9} ${PY}Z`, mt, OL(md, 2));
  s += R(x - 3, PY - 140, 6, 126, mt, OL(md, 1.8));
  s += R(x - 6, PY - 98, 12, 6, mt, ` rx="2"${OL(md, 1.6)}`);
  // lantern
  s += P(T`M${x - 11} ${PY - 140}L${x - 14} ${PY - 166}L${x + 14} ${PY - 166}L${x + 11} ${PY - 140}Z`, lamp, OL(md, 2.2));
  s += S(T`M${x} ${PY - 140}L${x} ${PY - 166}`, md, 1.6, ' opacity="0.6"');
  s += P(T`M${x - 18} ${PY - 166}L${x} ${PY - 180}L${x + 18} ${PY - 166}Z`, mt, OL(md, 2.2)) + C(x, PY - 183, 3.5, mt);
  if (m === 'winter') s += C(x, PY - 153, 44, 'url(#lglow)') + P(T`M${x - 19} ${PY - 166}L${x} ${PY - 182}L${x + 19} ${PY - 166}Q${x} ${PY - 172} ${x - 19} ${PY - 166}Z`, SNOW, OL(SNOW_S, 1.2));
  return s;
}
function bench(m, x) {
  const wd = tone(m, '#B4936F'), wdd = dk(wd, 0.32), mt = tone(m, METAL), md = dk(mt, 0.3);
  let s = E(x, PY + 1, 50, 4, dk(tone(m, PAVE[m]), 0.25), ' opacity="0.45"');
  s += S(T`M${x - 36} ${PY}L${x - 36} ${PY - 22}M${x + 36} ${PY}L${x + 36} ${PY - 22}M${x - 36} ${PY - 22}L${x - 38} ${PY - 50}M${x + 36} ${PY - 22}L${x + 38} ${PY - 50}`, md, 5) + S(T`M${x - 36} ${PY}L${x - 36} ${PY - 22}M${x + 36} ${PY}L${x + 36} ${PY - 22}`, mt, 3);
  s += R(x - 46, PY - 26, 92, 7, wd, ` rx="3"${OL(wdd, 1.8)}`);
  s += R(x - 46, PY - 42, 92, 7, wd, ` rx="3"${OL(wdd, 1.8)}`) + R(x - 46, PY - 54, 92, 7, wd, ` rx="3"${OL(wdd, 1.8)}`);
  if (m === 'winter') s += snowCap(x - 46, PY - 26, 92, 6) + snowCap(x - 46, PY - 54, 92, 5);
  return s;
}
function busStop(m, x) {
  const mt = tone(m, METAL), md = dk(mt, 0.3), disc = tone(m, '#9FB5B7'), cream = tone(m, '#F6F0E4');
  let s = E(x, PY + 1, 10, 3, dk(tone(m, PAVE[m]), 0.25), ' opacity="0.5"');
  s += R(x - 3, PY - 150, 6, 150, mt, OL(md, 1.8));
  s += C(x, PY - 156, 21, cream, OL(md, 2.4)) + C(x, PY - 156, 16, disc);
  // a little bus pictogram (white): body, windows, wheels
  s += R(x - 10, PY - 165, 20, 14, cream, ' rx="3.5"') + R(x - 7.5, PY - 162, 6, 4.5, disc, ' rx="1"') + R(x + 1.5, PY - 162, 6, 4.5, disc, ' rx="1"') + C(x - 5, PY - 150, 2.6, cream) + C(x + 5, PY - 150, 2.6, cream);
  // timetable panel
  s += R(x - 12, PY - 112, 24, 32, cream, ` rx="3"${OL(md, 2)}`);
  for (let k = 0; k < 4; k++) s += R(x - 7, PY - 105 + k * 6, 14 - (k % 2) * 4, 2.4, tone(m, '#B8B2AA'), ' rx="1"');
  if (m === 'winter') s += snowCap(x - 21, PY - 174, 42, 6) + snowCap(x - 12, PY - 112, 24, 4);
  return s;
}
function bicycle(m, x) {
  const fr = tone(m, '#B49A86'), fd = dk(fr, 0.35), tyre = tone(m, '#6F7380'), cream = tone(m, '#F2EADC');
  const y = PY - 15, wl = x - 25, wr = x + 25;
  let s = E(x, PY + 1, 40, 3.5, dk(tone(m, PAVE[m]), 0.25), ' opacity="0.45"');
  for (const wx of [wl, wr]) s += C(wx, y, 14, 'none', OL(tyre, 3.6)) + C(wx, y, 2.4, fd) + S(T`M${wx - 10} ${y}L${wx + 10} ${y}M${wx} ${y - 10}L${wx} ${y + 10}`, tone(m, '#B8B6BC'), 0.9);
  const fp = T`M${wl} ${y}L${x - 4} ${y}L${x - 10} ${y - 22}L${wr - 6} ${y - 22}L${wr} ${y}M${x - 4} ${y}L${wr - 6} ${y - 22}M${x - 10} ${y - 22}L${x - 12} ${y - 28}M${wr - 6} ${y - 22}L${wr - 4} ${y - 32}`;
  s += S(fp, fd, 4.6) + S(fp, fr, 2.8);
  s += R(x - 19, y - 31, 14, 4.5, cream, ` rx="2.2"${OL(fd, 1.2)}`) + S(T`M${wr - 10} ${y - 33}L${wr + 2} ${y - 34}`, fd, 3);
  // a front basket (spring: blossom twigs, autumn: a few leaves, winter: snow)
  const bk = tone(m, '#C8AE88');
  s += P(T`M${wr - 2} ${y - 30}L${wr + 14} ${y - 30}L${wr + 11} ${y - 19}L${wr + 1} ${y - 19}Z`, bk, OL(dk(bk, 0.35), 1.4));
  if (m === 'spring') s += C(wr + 3, y - 32, 3, '#F8E3EA') + C(wr + 8, y - 34, 3, '#FFFFFF') + C(wr + 12, y - 31, 3, '#F3D6E0');
  else if (m === 'autumn') s += E(wr + 4, y - 31, 3.4, 2, tone(m, '#D9A15A')) + E(wr + 10, y - 32, 3.4, 2, tone(m, '#C77F4A'));
  else if (m === 'winter') s += snowCap(wr - 3, y - 30, 18, 4) + snowCap(x - 20, y - 31, 16, 3);
  else s += C(wr + 4, y - 32, 3.2, tone(m, '#A9C9A2')) + C(wr + 10, y - 32, 3.2, '#F4EEE4');
  return s;
}
function planter(m, x) {
  const pc = tone(m, '#C2AD94'), leaf = tone(m, m === 'autumn' ? '#B7A06C' : m === 'winter' ? '#A9B4A6' : '#9CB993');
  let s = R(x - 16, PY - 22, 32, 22, pc, ` rx="4"${OL(dk(pc, 0.3), 2)}`);
  if (m === 'winter') return s + E(x, PY - 24, 15, 6, leaf) + snowCap(x - 16, PY - 25, 32, 6);
  s += C(x - 8, PY - 28, 9, leaf) + C(x + 8, PY - 28, 9, leaf) + C(x, PY - 34, 10, lt(leaf, 0.1));
  if (m === 'spring' || m === 'summer') s += C(x - 6, PY - 34, 2.6, '#F7EEE6') + C(x + 6, PY - 30, 2.6, '#F1D9DD') + C(x + 1, PY - 40, 2.6, '#F7EEE6');
  return s;
}
function mid(m) {
  const winter = m === 'winter';
  let o = '', defs = '';
  defs += rg('lglow', [[0, '#FFE3A6', 0.9], [0.35, '#FFE3A6', 0.4], [1, '#FFE3A6', 0]]);
  // shops: widths sum to 1200 (row starts at x = -50 so the seam falls in the middle of a shop, drawn twice)
  const shops = [
    { w: 176, h: 186, c: 0, top: 'flat', floors: 1, win: 3, awn: 0, door: 'right', sign: 'cup', box: true },
    { w: 150, h: 160, c: 2, top: 'gable', roof: 1, floors: 1, win: 2, awn: 2, door: 'left', sign: 'loaf' },
    { w: 188, h: 200, c: 1, top: 'mansard', roof: 0, floors: 1, win: 3, awn: 1, door: 'right', box: true },
    { w: 140, h: 172, c: 3, top: 'dutch', floors: 1, win: 2, awn: 3, door: 'left', sign: 'book', arch: true },
    { w: 182, h: 156, c: 4, top: 'flat', floors: 1, win: 3, awn: 2, door: 'right', sign: 'flower', box: true, cat: true },
    { w: 160, h: 190, c: 5, top: 'gable', roof: 3, floors: 1, win: 2, awn: 4, door: 'left' },
    { w: 204, h: 168, c: 6, top: 'flat', floors: 1, win: 3, awn: 0, door: 'right', sign: 'tea', arch: true },
  ];
  let x = -50;
  for (const sh of shops) { const x0 = x; o += both(xx => shop(m, xx - sh.w / 2, sh.w, sh.h, sh), x0 + sh.w / 2, sh.w / 2 + 40); x += sh.w; }
  // building plinth + shop-side pavement strip 268…300
  const pv = tone(m, winter ? '#E9ECF1' : '#DDD3C5'), pvd = dk(pv, 0.12);
  o += R(0, SB - 4, W, 6, dk(tone(m, '#CFC4B5'), 0.15));
  o += R(0, SB + 2, W, 300 - SB - 2, pv);
  o += R(0, SB + 2, W, 5, dk(pv, 0.08), ' opacity="0.7"');
  let jt = ''; for (let k = 0; k < 24; k++) jt += T`M${k * 50 + 12} ${SB + 8}L${k * 50 + 4} 300`;
  o += S(jt, pvd, 1.4, ` opacity="${winter ? 0.25 : 0.45}"`) + S(T`M0 ${SB + 18}L${W} ${SB + 18}`, pvd, 1.2, ' opacity="0.3"');
  if (winter) { let sn = T`M0 300L0 ${SB + 4}`; for (let k = 0; k <= 30; k++) sn += T`Q${k * 40 + 20} ${SB + (k % 2 ? 0 : 3)} ${k * 40 + 40} ${SB + 4}`; sn += T`L${W} 300Z`; o += P(sn, SNOW); }
  // street props on the pavement (back to front)
  const props = [
    [96, 70, xx => streetTree(m, xx, 1.0)], [520, 70, xx => streetTree(m, xx, 0.92)], [905, 70, xx => streetTree(m, xx, 1.04)],
    [300, 22, xx => lampPost(m, xx)], [716, 22, xx => lampPost(m, xx)], [1112, 22, xx => lampPost(m, xx)],
    [620, 52, xx => bench(m, xx)], [800, 46, xx => bicycle(m, xx)], [1010, 24, xx => busStop(m, xx)], [408, 18, xx => planter(m, xx)], [212, 18, xx => planter(m, xx)],
  ];
  for (const [px, half, fn] of props) o += both(fn, px, half);
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): kerb, road strip, near kerb, near pavement tiles
// =====================================================================================================
function ground(m) {
  const winter = m === 'winter', r = rng(201 + MOODS.indexOf(m));
  const pave = PAVE[m], bot = PAVE_BOTTOM[m], road = ROAD[m];
  const kerbTop = tone(m, '#E6DFD4'), kerbFace = tone(m, '#BFB6AA');
  let o = '', defs = '';
  // shop-side kerb (top + face), gutter shadow
  o += R(0, GROUND_LINE, W, 8, kerbTop) + R(0, GROUND_LINE + 8, W, 8, kerbFace);
  let kj = ''; for (let k = 0; k < 15; k++) kj += T`M${k * 80 + 30} ${GROUND_LINE}L${k * 80 + 30} ${GROUND_LINE + 16}`;
  o += S(kj, dk(kerbFace, 0.15), 1.4, ' opacity="0.6"');
  // the road
  defs += lg('rd', [[0, dk(road, 0.08)], [0.25, road], [1, lt(road, 0.06)]], V);
  o += R(0, 56, W, 48, 'url(#rd)');
  let dash = ''; for (let k = 0; k < 12; k++) dash += R(k * 100 + 20, 78, 54, 4.5, tone(m, '#EFE8DA'), ' rx="2.2"');
  o += `<g opacity="${winter ? 0.6 : 0.85}">${dash}</g>`;
  // speckles on the asphalt
  let sp = ''; for (let i = 0; i < 60; i++) { const x = r() * W, y = 60 + r() * 40, s = 0.8 + r() * 1.4; sp += both(xx => C(xx, y, s, i % 2 ? lt(road, 0.18) : dk(road, 0.1)), x, s + 1); }
  o += `<g opacity="0.6">${sp}</g>`;
  // drain grate + manhole
  o += both(xx => R(xx - 16, 92, 32, 9, dk(road, 0.25), ' rx="2"') + S(T`M${xx - 10} 93L${xx - 10} 100M${xx - 3} 93L${xx - 3} 100M${xx + 4} 93L${xx + 4} 100M${xx + 11} 93L${xx + 11} 100`, lt(road, 0.15), 1.4), 330, 18);
  o += both(xx => E(xx, 72, 26, 6, dk(road, 0.14)) + E(xx, 71.5, 22, 4.6, dk(road, 0.06)) + S(T`M${xx - 14} 71.5L${xx + 14} 71.5`, dk(road, 0.18), 1.2), 760, 28);
  // near kerb: a soft shadow line on the road, then the kerb top
  o += R(0, 101, W, 3, dk(road, 0.22), ' opacity="0.5"');
  o += R(0, 104, W, 12, kerbTop) + R(0, 104, W, 2, lt(kerbTop, 0.4));
  let kj2 = ''; for (let k = 0; k < 12; k++) kj2 += T`M${k * 100 + 60} 104L${k * 100 + 60} 116`;
  o += S(kj2, dk(kerbTop, 0.18), 1.4, ' opacity="0.7"');
  // near pavement: soft vertical gradient to PAVE_BOTTOM, tiles in rows (spacings divide 1200)
  defs += lg('pv', [[0, lt(pave, 0.12)], [0.45, pave], [1, bot]], V);
  o += R(0, 116, W, 144, 'url(#pv)');
  const rows = [[116, 138, 60], [138, 166, 75], [166, 200, 100], [200, 242, 120]];
  let joints = '', tint = '';
  rows.forEach(([y0, y1, s], ri) => {
    joints += T`M0 ${y1}L${W} ${y1}`;
    const off = (ri % 2 ? s / 2 : 0) + 17, n = W / s;
    for (let k = 0; k < n; k++) {
      const x = off + k * s;
      joints += both(xx => T`M${xx} ${y0}L${xx} ${y1}`, x, 1);
      const v = r();
      if (v < 0.28) tint += both(xx => R(xx + 2, y0 + 2, s - 4, y1 - y0 - 4, v < 0.14 ? '#FFFFFF' : dk(pave, 0.3), ` opacity="${v < 0.14 ? 0.22 : 0.07}"`), x + s / 2, s / 2);
    }
  });
  o += tint;
  o += S(joints, dk(pave, 0.2), 1.6, ` opacity="${winter ? 0.3 : 0.55}"`);
  o += S(joints, lt(pave, 0.4), 1.2, ` opacity="${winter ? 0.2 : 0.4}" transform="translate(0 1.4)"`);
  // seasonal details
  if (m === 'spring') {   // tiny cream daisies in the joints + a few fallen petals
    for (let i = 0; i < 12; i++) {
      const x = r() * W, y = [138, 166, 200][i % 3] + (r() - 0.5) * 3;
      o += both(xx => S(T`M${xx - 4} ${y}q2 -5 4 -7M${xx + 3} ${y}q-1 -4 -2 -6`, tone(m, '#9DBB95'), 1.6) + C(xx, y - 8, 2.4, '#FBF6EE', OL('#E3D3C9', 0.8)) + C(xx, y - 8, 0.9, '#E7D6A8'), x, 8);
    }
    for (let i = 0; i < 14; i++) { const x = r() * W, y = 60 + r() * 180, a = r() * 180; o += both(xx => E(xx, y, 3.4, 2, '#F6DCE5', ` opacity="0.85" transform="rotate(${f(a)} ${f(xx)} ${f(y)})"`), x, 5); }
  } else if (m === 'summer') {   // a few tiny pebbles / sun glints in the joints
    for (let i = 0; i < 10; i++) { const x = r() * W, y = [138, 166, 200][i % 3]; o += both(xx => C(xx, y, 2.2, '#FFFFFF', ' opacity="0.7"'), x, 3); }
  } else if (m === 'autumn') {   // fallen leaves (muted amber / ochre), more along the kerbs
    const lc = ['#D9A15A', '#C77F4A', '#D4B06E'].map(c => tone(m, c));
    for (let i = 0; i < 34; i++) {
      const edgeLeaf = i < 14, x = r() * W, y = edgeLeaf ? (i % 2 ? 100 + r() * 4 : 118 + r() * 6) : 60 + r() * 185, a = r() * 360, s = 3.4 + r() * 2.4, col = lc[i % 3];
      o += both(xx => P(T`M${xx - s * 1.6} ${y}Q${xx} ${y - s * 1.2} ${xx + s * 1.6} ${y}Q${xx} ${y + s * 1.2} ${xx - s * 1.6} ${y}Z`, col, ` opacity="0.9" transform="rotate(${f(a)} ${f(xx)} ${f(y)})"`), x, s * 2);
    }
  } else {   // winter: snow on the kerbs, slushy road edges, soft drifts on the pavement
    let k1 = T`M0 ${GROUND_LINE + 9}L0 ${GROUND_LINE - 2}`; for (let k = 0; k < 20; k++) k1 += T`Q${k * 60 + 30} ${GROUND_LINE - 7 - (k % 3) * 2} ${k * 60 + 60} ${GROUND_LINE - 2}`; k1 += T`L${W} ${GROUND_LINE + 9}Z`;
    o += P(k1, SNOW) + S(T`M0 ${GROUND_LINE + 9}L${W} ${GROUND_LINE + 9}`, SNOW_S, 2);
    let k2 = T`M0 ${118}L0 ${102}`; for (let k = 0; k < 15; k++) k2 += T`Q${k * 80 + 40} ${96 + (k % 2) * 3} ${k * 80 + 80} ${102}`; k2 += T`L${W} 118Z`;
    o += P(k2, SNOW) + S(T`M0 118L${W} 118`, SNOW_S, 1.6, ' opacity="0.8"');
    o += R(0, 56, W, 8, '#FFFFFF', ' opacity="0.45"') + R(0, 94, W, 8, '#FFFFFF', ' opacity="0.4"');
    // a soft wavy snow band hugging the near kerb, deeper in a few drifts (period 1200: bumps on 60 / 200 / 400)
    const yd = x => 126 + 4 * Math.sin(2 * Math.PI * x / 200 + 0.6) + 5 * Math.max(0, Math.sin(2 * Math.PI * x / 400 + 1.3)) + 1.5 * Math.sin(2 * Math.PI * x / 60);
    let band = T`M0 116`; for (let x2 = 0; x2 <= W; x2 += 6) band += T`L${x2} ${yd(x2)}`; band += T`L${W} 116Z`;
    o += P(band, SNOW); let bl = ''; for (let x2 = 0; x2 <= W; x2 += 6) bl += (x2 ? 'L' : 'M') + f(x2) + ' ' + f(yd(x2) + 1.2); o += S(bl, SNOW_S, 2);
    for (let i = 0; i < 20; i++) { const x = r() * W, y = 140 + r() * 100; o += both(xx => E(xx, y, 5 + r() * 4, 2.2, SNOW_S, ' opacity="0.6"'), x, 10); }
  }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SUN, CLOUDS
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.42], [1, '#FFF2CF', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF2CC', OL('#F2DCA6', 4)) + C(100, 100, 38, '#FFF8E2') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  const shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#E6ECF3', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  // soft blossom petal (pink-white, not answer pink): rounded teardrop with a small notch
  out.petal = svg(32, 32, `<g transform="rotate(-28 16 16)">` + P('M16 29Q6 22 7.5 13Q9 5 14.5 4.5L16 7.5L17.5 4.5Q23 5 24.5 13Q26 22 16 29Z', '#F8E1E8', OL('#DDB3C2', 1.6)) +
    P('M16 29Q24 21 23.8 13Q23 8 19.5 6Q22 15 16 29Z', '#EDC8D4', ' opacity="0.8"') + E(12.5, 13, 2.6, 4.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // maple-ish autumn leaf (amber)
  { const pts = []; const lobes = [[0, 14], [-0.62, 6], [-1.0, 12.5], [-1.5, 6.5], [-2.0, 11], [-2.6, 7], [-3.14, 4]];
    // build a symmetric 5-lobed outline around (16, 17)
    const ang = [-90, -60, -38, -12, 8, 24, 50, 90, 130, 156, 172, 192, 218, 240];
    const rad = [14, 7, 12.5, 6.5, 11, 6, 4, 2.5, 4, 6, 11, 6.5, 12.5, 7];
    void lobes;
    for (let i = 0; i < ang.length; i++) { const a = ang[i] * Math.PI / 180; pts.push([16 + Math.cos(a) * rad[i], 16 + Math.sin(a) * rad[i]]); }
    out.leaf_a = svg(32, 32, `<g transform="rotate(14 16 16)">` + P(poly(pts), '#D9A15A', OL('#A5713A', 1.6)) +
      S('M16 30L16 18M16 18L16 4M16 18L6 9.5M16 18L26 9.5M16 18L5.5 21M16 18L26.5 21', '#B27E43', 1.1, ' opacity="0.85"') + E(11.5, 11, 2.6, 1.6, '#EDC48A', ' opacity="0.8"') + `</g>`); }
  // oval birch-ish leaf (ochre / rust, muted) with midrib and stem
  out.leaf_b = svg(32, 32, `<g transform="rotate(-32 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 27Q12 26 9 20Q6 10 16 3Z', '#C9844F', OL('#935A30', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 27Q20 16 16 3Z', '#B7743F', ' opacity="0.7"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#8F5A33', 1.1) +
    E(12.5, 11, 2, 3.4, '#E2AE7E', ' opacity="0.7"') + `</g>`);
  // snowflake: six rounded arms with little branches, soft halo
  { let arms = ''; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a); const p = (d, o) => [16 + c * d - s * o, 16 + s * d + c * o];
      const [x1, y1] = p(12, 0), [b1, b2] = p(7, 0), [l1, l2] = p(10, -3.5), [r1, r2] = p(10, 3.5); arms += `M16 16L${f(x1)} ${f(y1)}M${f(b1)} ${f(b2)}L${f(l1)} ${f(l2)}M${f(b1)} ${f(b2)}L${f(r1)} ${f(r2)}`; }
    out.snow = svg(32, 32, C(16, 16, 15, 'url(#s)') + S(arms, '#C8D5E5', 4.4) + S(arms, '#FFFFFF', 2.4) + C(16, 16, 3, '#FFFFFF'), rg('s', [[0, '#FFFFFF', 0.55], [1, '#FFFFFF', 0]])); }
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P(poly(starPts(16, 16.8, 11.5, 5.4)), '#FFF3CF', OL('#FFF3CF', 2.4)) + P(poly(starPts(15.6, 16.2, 6.5, 3)), '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.45], [1, '#FFF6DA', 0]]));
  // white (tinted by code)
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // tiny pigeon feather (soft lilac-grey)
  out.feather = svg(32, 32, `<g transform="rotate(-38 16 16)">` + P('M16 3Q23 9 22 18Q21 25 16 29Q11 25 10 18Q9 9 16 3Z', '#D3D0DC', OL('#8A879D', 1.6)) +
    P('M16 3Q23 9 22 18Q21 21 19 23Q18 12 16 3Z', '#B1AEC0', ' opacity="0.9"') + S('M16 6L16 31M16 14L12 11M16 18L11.5 15.5M16 14L20 11M16 18L20.5 15.5', '#8A879D', 1.1) + `</g>`);
  // soft round puff (pavement dust, warm grey-beige)
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#F6F1E9', 0.9], [0.6, '#EAE2D6', 0.45], [1, '#EAE2D6', 0]]));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, clouds) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, PAVE, PAVE_BOTTOM, ROAD, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, CLOCK };
if (require.main === module) main();
