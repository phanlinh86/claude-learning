// Mochi's Icing Bakery: bakery-kitchen environment + particle art generator (100 % original flat-cartoon SVG).
// Writes game/assets/default/env/{far,mid,ground}_{spring,summer,autumn,winter}.svg, env/light.svg and
// game/assets/default/particles/{petal,leaf_a,leaf_b,snow,sparkle,star,flour,steam,sprinkle_a,sprinkle_b,confetti_a,
// confetti_b,crumb}.svg; removes the old sea-only files (env/rays, env/caustic, env/surface_*, particles/bubble,
// particles/plankton).                                                                                  (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: far tiles are 800 wide, mid / ground 1200 wide. Every repeating pattern has a period that divides the tile
// width (patterns start at x 0) and every prop that crosses x = 0 / W is drawn twice (at x and x ∓ W), so the left and
// right edges match pixel for pixel.
// Colour rule (DESIGN §3): calm, warm, slightly desaturated kitchen; the icing answer colours never appear saturated in a
// large area (seasonal props use dusty versions), the counter top is quiet (the tray and the icing bags sit there).
//
// Layer anchors (see env_scenes.js envLayout() for the screen maths):
//   far    0 0 800 720  : back wall, opaque. One window per tile, inner glass rect x 250–550, y 90–400 (comment in the
//                         file). Top rows = WALL[m] exactly (render fills the screen above the tile with it).
//                         Backsplash tiles from y 478 down (behind the counter).
//   mid    0 0 1200 300 : counter-top props (bowls, canisters, mini oven, copper pot, crock, rolling pin, seasonal prop);
//                         their bases stand on y = MID_BASE (296) = the counter's back edge.
//   ground 0 0 1200 260 : counter: back edge y GROUND_LINE (8), top surface to the front edge y 48, lip to 58, sage
//                         cabinet front with drawers + doors 58–236, toe kick 236–248, floor 248–260 (= FLOOR[m]).
//   light  0 0 600 720  : warm window light bars, white + transparent; same scale / y as far, glass at x 150–450 of it.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const MOODS = ['spring', 'summer', 'autumn', 'winter'];
const FW = 800, W = 1200;
const MID_BASE = 296, GROUND_LINE = 8, GROUND_FRONT = 48;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w = 3) => ` stroke="${col}" stroke-width="${w}" stroke-linejoin="round"`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const rr = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = ' x1="0" y1="0" x2="0" y2="1"') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) once, plus a wrapped copy if it crosses an edge (half = half width of the thing)
const both = (fn, x, half, period) => fn(x) + (x + half > period ? fn(x - period) : '') + (x - half < 0 ? fn(x + period) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dk = (c, t = 0.32) => mix(c, '#4A3426', t), lt = (c, t = 0.35) => mix(c, '#FFFFFF', t);

// ---------------- palettes (DESIGN §3) ----------------
const WALL = { spring: '#F6E9D2', summer: '#F7EACF', autumn: '#F3E3C8', winter: '#EFE5D6' };
const TILE = { spring: '#EEDDC2', summer: '#EFDDBF', autumn: '#EBD8BB', winter: '#E7DCCB' };
const FLOOR = { spring: '#B98E66', summer: '#BC9068', autumn: '#B2875F', winter: '#AD8763' };
const WOOD = '#C99A6B', WOOD_D = '#A87A4E', WOOD_L = '#DDB689';
const SAGE = '#B9C3B2', SAGE_D = '#8E9B88', SAGE_L = '#CDD5C6';
const COPPER = '#C98A5C';
const FRAME = '#A9B8A6', FRAME_D = '#7D8C7A';
// suggested ambient values for weather.js / render.js (also listed in docs/art/ENV_NOTES.md)
const AMBIENT = {
  spring: { wall: WALL.spring, floor: FLOOR.spring, tint: null, light: 0.45 },
  summer: { wall: WALL.summer, floor: FLOOR.summer, tint: 'rgba(255,236,190,0.06)', light: 0.85 },
  autumn: { wall: WALL.autumn, floor: FLOOR.autumn, tint: 'rgba(240,170,90,0.07)', light: 0.5 },
  winter: { wall: WALL.winter, floor: FLOOR.winter, tint: 'rgba(255,190,120,0.05)', light: 0.28 },
};
const CURTAIN = { spring: '#E9CBC4', summer: '#CFE1CC', autumn: '#E6C99B', winter: '#CBD4DE' };
const SKY = { spring: ['#C8E2F0', '#EEF5EC'], summer: ['#9ED2EE', '#E2F3F0'], autumn: ['#EAB57C', '#F6DDB4'], winter: ['#B4C4D6', '#E4EAF0'] };

// =====================================================================================================
// FAR: back wall with one window (0 0 800 720)
// =====================================================================================================
function windowView(m) {
  const r = rng(7 + MOODS.indexOf(m));
  let o = R(250, 90, 300, 310, 'url(#sky)');
  const hills = (c1, c2) => P('M250 330Q320 296 400 318T550 300V400H250Z', c1) + P('M250 362Q330 338 420 356T550 344V400H250Z', c2);
  const flower5 = (x, y, s, c, cc) => { let p = ''; for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; p += C(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s, 4.6 * s, c); } return p + C(x, y, 2.4 * s, cc); };
  const branch = (col, w) => S('M556 112Q500 128 462 160Q440 178 418 182', col, w) + S('M500 132Q492 108 470 100', col, w * 0.6) + S('M462 160Q470 188 456 206', col, w * 0.55) + S('M530 120Q528 150 512 166', col, w * 0.5);
  if (m === 'spring') {
    o += E(330, 140, 40, 13, '#FFFFFF', ' opacity="0.8"') + E(352, 132, 26, 12, '#FFFFFF', ' opacity="0.8"');
    o += hills('#D3E6C1', '#BCD9A8');
    // a little blossom tree far away
    o += R(296, 300, 6, 36, '#A58A75') + C(299, 292, 22, '#F2D3DB') + C(286, 300, 14, '#EEC6D1') + C(312, 300, 15, '#EEC6D1');
    o += branch('#9C7B66', 9);
    for (const [x, y, s] of [[470, 100, 1.1], [486, 118, 0.9], [452, 156, 1.2], [430, 176, 1], [418, 186, 0.8], [458, 204, 1], [512, 166, 1.1], [528, 140, 0.9], [544, 116, 1], [500, 136, 0.8]]) o += flower5(x, y, s, '#F6CED8', '#E3A0B3');
    for (let i = 0; i < 6; i++) o += E(280 + r() * 240, 200 + r() * 150, 4.5, 3, '#F4C6D2', ` transform="rotate(${f(r() * 180)} ${f(280 + i * 40)} 260)" opacity="0.9"`);
  } else if (m === 'summer') {
    o += C(320, 150, 62, 'url(#sun)') + C(320, 150, 30, '#FFF1BE') + C(314, 144, 18, '#FFF8DE');
    o += E(470, 230, 46, 14, '#FFFFFF', ' opacity="0.85"') + E(490, 220, 28, 14, '#FFFFFF', ' opacity="0.85"');
    o += hills('#B7DAA0', '#9BCB8A');
    o += R(510, 286, 7, 44, '#93765F') + C(513, 278, 24, '#94C489') + C(499, 290, 15, '#86BA7E') + C(527, 290, 16, '#86BA7E');
    o += branch('#8D735E', 9);
    for (const [x, y, a] of [[470, 100, -30], [488, 120, 20], [452, 156, -60], [430, 176, 30], [416, 190, -20], [458, 206, 70], [512, 166, 40], [530, 140, -10], [544, 116, 50], [500, 138, 0], [440, 168, 80]]) {
      o += E(x, y, 13, 7, x % 3 ? '#8FC48C' : '#76AF7C', ` transform="rotate(${a} ${x} ${y})"`) + S(`M${x - 9} ${y}L${x + 9} ${y}`, '#6E9F70', 1.4, ` transform="rotate(${a} ${x} ${y})"`);
    }
  } else if (m === 'autumn') {
    o += E(300, 150, 36, 11, '#FFF4E2', ' opacity="0.7"');
    o += hills('#DCC595', '#CDB07D');
    o += R(318, 258, 9, 80, '#8C6A52') + C(322, 238, 34, '#E0A866') + C(298, 256, 22, '#D18A55') + C(348, 254, 24, '#D9B266') + C(322, 214, 20, '#D9B266');
    o += branch('#8C6A52', 9);
    const lc = ['#E1A866', '#CF8752', '#D9B266', '#C8794A'];
    for (const [x, y, a] of [[470, 100, -30], [488, 120, 20], [452, 156, -60], [430, 176, 30], [512, 166, 40], [544, 116, 50], [500, 138, 0]]) o += E(x, y, 11, 6.5, lc[(x + y) % 4], ` transform="rotate(${a} ${x} ${y})"`);
    for (let i = 0; i < 6; i++) { const x = 300 + r() * 220, y = 210 + r() * 150; o += E(x, y, 7, 4, lc[i % 4], ` transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"`); }
  } else {
    o += hills('#F4F6F9', '#E3EAF1');
    for (const [x, s] of [[290, 1], [318, 0.75], [470, 0.9], [500, 1.15]]) {
      const b = 328 + (x > 400 ? -8 : 0);
      o += P(`M${x} ${b - 70 * s}L${x + 22 * s} ${b}H${x - 22 * s}Z`, '#9FB2C1') + P(`M${x} ${b - 70 * s}L${x + 9 * s} ${b - 42 * s}L${x - 9 * s} ${b - 42 * s}Z`, '#F7F9FB');
    }
    o += branch('#8A7464', 9);
    o += S('M556 106Q500 122 462 154Q440 172 418 176', '#FFFFFF', 6) + S('M500 126Q492 102 470 94', '#FFFFFF', 4) + S('M462 154Q470 182 456 200', '#FFFFFF', 3.5);
    for (let i = 0; i < 22; i++) o += C(258 + r() * 284, 98 + r() * 290, 1.8 + r() * 2.4, '#FFFFFF', ' opacity="0.9"');
    // frost corners
    const fr = 'url(#frost)';
    o += P('M250 90H330Q296 104 284 128Q270 150 250 160Z', fr) + P('M550 90H476Q506 102 520 124Q532 146 550 152Z', fr);
    o += P('M250 400H340Q300 388 284 368Q270 350 250 342Z', fr) + P('M550 400H466Q504 390 520 372Q534 354 550 348Z', fr);
  }
  // glass reflections
  o += P('M268 390L360 98H392L300 390Z', '#FFFFFF', ' opacity="0.13"') + P('M318 390L410 98H422L330 390Z', '#FFFFFF', ' opacity="0.1"');
  return o;
}

function curtain(m, side) {
  const c = CURTAIN[m], cd = dk(c, 0.22), cl = lt(c, 0.35);
  // left curtain: gathered at the rod (x 196–272), tied back at y 300 (x 196–232), flares to the sill (196–250)
  let d = 'M196 70H272Q270 160 238 296Q236 304 240 312Q256 370 252 440H196Z';
  let folds = S('M216 76Q214 200 214 300M214 316Q216 380 212 436', cd, 3, ' opacity="0.6"') + S('M244 76Q236 190 226 296M228 316Q236 380 236 436', cd, 3, ' opacity="0.5"');
  let hi = P('M200 74H222Q222 190 212 296L202 296Z', cl, ' opacity="0.45"');
  // gingham-ish dots (small, calm)
  let dots = ''; for (let y = 96; y < 430; y += 26) for (let x = 204; x < 262; x += 20) { if (y > 280 && y < 330 && x > 236) continue; if (y < 296 && x > 272 - (y - 70) * 0.17) continue; dots += C(x + ((y / 26) % 2) * 8, y, 2.4, cd); }
  const tie = R(194, 292, 50, 16, dk(c, 0.3), ' rx="8"') + C(236, 300, 7, dk(c, 0.4));
  let g = P(d, c, OL(cd, 3)) + `<g opacity="0.35">${dots}</g>` + hi + folds + tie;
  return side === 'L' ? g : `<g transform="translate(800 0) scale(-1 1)">${g}</g>`;
}

function shelfProps(x) {
  // a little wooden shelf on the wall (centred at x, width 210) with jars, a plate and hanging utensils
  let o = '';
  o += R(x - 105, 300, 210, 12, WOOD, OL(WOOD_D, 2.5) + ' rx="3"') + R(x - 103, 300, 206, 4, WOOD_L, ' rx="2"');
  o += P(`M${x - 80} 312h12v6q-6 18 -24 22h-0v-10q12 -4 12 -18z`, WOOD_D) + P(`M${x + 80} 312h-12v6q6 18 24 22v-10q-12 -4 -12 -18z`, WOOD_D);
  // jars
  const jar = (jx, w, h, fill, lid) => P(rr(jx - w / 2, 300 - h, w, h, 9), '#EAF0EE', OL('#A8B5B2', 2.5)) + R(jx - w / 2 + 5, 300 - h * 0.62, w - 10, h * 0.62 - 5, fill, ' rx="5"') +
    R(jx - w / 2 - 2, 300 - h - 9, w + 4, 11, lid, OL(dk(lid), 2) + ' rx="4"') + R(jx - w / 2 + 6, 300 - h + 6, 5, h * 0.5, '#FFFFFF', ' opacity="0.6" rx="2.5"');
  o += jar(x - 72, 38, 52, '#F8F3EA', WOOD) + jar(x - 26, 44, 66, '#D9A869', '#B9C3B2');
  // cookies visible in the middle jar
  o += C(x - 32, 270, 7, '#C98E4A') + C(x - 20, 262, 7, '#D7A060') + C(x - 26, 282, 7, '#C98E4A');
  // upright plate
  o += C(x + 34, 266, 30, '#FBF6EE', OL('#C9BBA6', 2.5)) + C(x + 34, 266, 21, 'none', OL('#DCCFBB', 2)) + R(x + 22, 292, 24, 8, WOOD_D, ' rx="2"');
  o += jar(x + 82, 30, 40, '#E8D9BF', '#C98A5C');
  // hooks + utensils under the shelf
  o += S(`M${x - 30} 312v12M${x + 12} 312v12M${x + 52} 312v12`, '#8E7A66', 3);
  o += S(`M${x - 30} 324v40`, WOOD_D, 5) + E(x - 30, 372, 9, 12, WOOD, OL(WOOD_D, 2.5)); // spoon
  o += S(`M${x + 12} 324v30`, '#9AA4A6', 4) + P(`M${x + 12} 352q-14 14 -8 32q8 10 16 0q6 -18 -8 -32z`, 'none', OL('#9AA4A6', 2.5)); // whisk
  o += S(`M${x + 12} 356q-4 14 0 28M${x + 12} 356q4 14 0 28`, '#9AA4A6', 2);
  o += S(`M${x + 52} 324v34`, '#A86E46', 4) + P(`M${x + 36} 356h32q0 20 -16 20q-16 0 -16 -20z`, COPPER, OL('#9C6440', 2.5)); // ladle
  return o;
}

function lights() {
  // winter string lights: sagging wire between hooks at x 0, 200, 400, 600, 800 (y 26), warm soft bulbs
  let wire = '', bulbs = '', glow = '';
  const cols = ['#FFE0A6', '#F4C2AE', '#D8E6BE', '#FFE9C2'];
  for (let k = 0; k < 4; k++) {
    const x0 = k * 200;
    wire += `M${x0} 26Q${x0 + 100} 62 ${x0 + 200} 26`;
    for (let j = 1; j <= 4; j++) {
      const t = j / 5, x = x0 + 200 * t, y = 26 * (1 - t) * (1 - t) + 2 * 44 * t * (1 - t) + 26 * t * t, c = cols[(k + j) % 4];
      glow += C(x, y + 10, 15, 'url(#bulbglow)');
      bulbs += R(x - 3, y, 6, 6, '#7D7468') + E(x, y + 12, 5.5, 8, c, OL(dk(c, 0.25), 1.5)) + E(x - 1.6, y + 9, 1.6, 3, '#FFFFFF', ' opacity="0.8"');
    }
  }
  return glow + S(wire, '#7D7468', 2) + bulbs + C(0, 26, 4, '#7D7468') + C(200, 26, 4, '#7D7468') + C(400, 26, 4, '#7D7468') + C(600, 26, 4, '#7D7468') + C(800, 26, 4, '#7D7468');
}

function far(m) {
  const wall = WALL[m], tile = TILE[m];
  let defs = '';
  defs += `<pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">${C(10, 10, 2.2, mix(wall, '#B89A72', 0.14))}${C(30, 30, 2.2, mix(wall, '#B89A72', 0.14))}</pattern>`;
  const grout = mix(tile, '#A88B66', 0.18);
  defs += `<pattern id="tiles" width="100" height="56" patternUnits="userSpaceOnUse">${R(0, 0, 100, 56, tile)}${R(0, 0, 100, 2.5, grout)}${R(0, 28, 100, 2.5, grout)}${R(0, 0, 2.5, 28, grout)}${R(50, 0, 2.5, 28, grout)}${R(25, 28, 2.5, 28, grout)}${R(75, 28, 2.5, 28, grout)}${R(4, 4, 42, 4, '#FFFFFF', ' opacity="0.35" rx="2"')}${R(29, 32, 42, 4, '#FFFFFF', ' opacity="0.35" rx="2"')}</pattern>`;
  defs += lg('sky', [[0, SKY[m][0]], [1, SKY[m][1]]]);
  defs += `<clipPath id="glass"><rect x="250" y="90" width="300" height="310" rx="5"/></clipPath>`;
  const glowCol = { spring: '#FFF6E0', summer: '#FFF1C8', autumn: '#FFDDA8', winter: '#FFD9A6' }[m];
  defs += rg('wglow', [[0, glowCol, m === 'winter' ? 0.5 : 0.55], [1, glowCol, 0]]);
  if (m === 'summer') defs += rg('sun', [[0, '#FFF3C4', 0.9], [1, '#FFF3C4', 0]]);
  if (m === 'winter') defs += lg('frost', [[0, '#FFFFFF', 0.85], [1, '#FFFFFF', 0.25]], ' x1="0" y1="0" x2="1" y2="1"') + rg('bulbglow', [[0, '#FFE2B0', 0.7], [1, '#FFE2B0', 0]]);
  let o = R(0, 0, FW, 720, wall);
  o += R(0, 0, FW, 470, 'url(#dots)');
  o += R(0, 478, FW, 242, 'url(#tiles)');
  o += R(0, 466, FW, 14, WOOD, '') + R(0, 466, FW, 4, WOOD_L) + R(0, 478, FW, 3, WOOD_D);   // chair rail
  o += E(400, 250, 330, 250, 'url(#wglow)');
  // window
  o += R(226, 66, 348, 352, FRAME, OL(FRAME_D, 3) + ' rx="10"') + R(236, 76, 328, 332, mix(FRAME, '#FFFFFF', 0.25), ' rx="7"');
  o += `<g clip-path="url(#glass)">${windowView(m)}</g>`;
  o += R(250, 90, 300, 310, 'none', OL(FRAME_D, 3) + ' rx="5"');
  o += R(395, 90, 10, 310, FRAME, OL(FRAME_D, 2)) + R(250, 240, 300, 10, FRAME, OL(FRAME_D, 2)) + R(397, 92, 3, 306, lt(FRAME, 0.35)) + R(252, 242, 296, 3, lt(FRAME, 0.35));
  // sill
  o += R(212, 410, 376, 20, WOOD, OL(WOOD_D, 3) + ' rx="5"') + R(216, 412, 368, 5, WOOD_L, ' rx="2.5"') + R(226, 430, 348, 8, mix(wall, '#8A6A4A', 0.22), ' opacity="0.5"');
  // sill pot (herbs) + little milk bottle
  o += P('M282 410L276 376H324L318 410Z', '#D3A182', OL('#A8705A', 2.5)) + R(272, 370, 56, 10, '#DDB096', OL('#A8705A', 2.5) + ' rx="3"');
  for (const [x, a] of [[286, -25], [298, -8], [310, 10], [320, 28], [300, 0]]) o += E(x, 352, 7, 15, '#9CC08F', ` transform="rotate(${a} ${x} 362)"` + OL('#6F9A68', 2));
  o += P('M496 410V384Q496 374 502 370V360H514V370Q520 374 520 384V410Z', '#F7F6F2', OL('#B8B4AA', 2.5)) + R(500, 354, 16, 7, '#C9D5DC', ' rx="2"') + R(500, 388, 16, 14, '#CFDCE4', ' rx="3" opacity="0.8"');
  // curtains + rod + valance
  o += curtain(m, 'L') + curtain(m, 'R');
  o += R(176, 58, 448, 9, WOOD_D, ' rx="4"') + C(178, 62, 9, WOOD, OL(WOOD_D, 2.5)) + C(622, 62, 9, WOOD, OL(WOOD_D, 2.5));
  let val = 'M190 60H610V88'; for (let x = 610; x > 190; x -= 35) val += `Q${x - 17.5} 108 ${x - 35} 88`; val += 'Z';
  o += P(val, CURTAIN[m], OL(dk(CURTAIN[m], 0.22), 3)) + S('M194 70H606', lt(CURTAIN[m], 0.4), 4, ' opacity="0.7"');
  // shelf at the tile edge (wraps)
  o += both(shelfProps, 0, 112, FW);
  if (m === 'winter') o += lights();
  return svg(FW, 720, o, defs, 'window 250 90 300 310');
}

// =====================================================================================================
// MID: counter-top props (0 0 1200 300), bases on MID_BASE
// =====================================================================================================
const Y = MID_BASE;
function shadow(x, w) { return E(x, Y - 1, w, 6, '#6B4B30', ' opacity="0.16"'); }
function bowls(x) {
  let o = shadow(x, 74);
  o += P(`M${x - 70} ${Y - 56}Q${x - 66} ${Y} ${x} ${Y}Q${x + 66} ${Y} ${x + 70} ${Y - 56}Z`, '#B9C3B2', OL(SAGE_D, 3));
  o += P(`M${x - 64} ${Y - 46}Q${x - 50} ${Y - 10} ${x - 20} ${Y - 6}`, 'none', OL(SAGE_L, 4) + ' opacity="0.8"');
  o += E(x, Y - 56, 70, 9, '#A3AF9C', OL(SAGE_D, 3));
  o += P(`M${x - 52} ${Y - 88}Q${x - 48} ${Y - 56} ${x} ${Y - 56}Q${x + 48} ${Y - 56} ${x + 52} ${Y - 88}Z`, '#F3E7D6', OL('#C4B093', 3));
  o += E(x, Y - 88, 52, 7, '#E7D7BE', OL('#C4B093', 3)) + R(x - 30, Y - 80, 22, 4, '#FFFFFF', ' opacity="0.6" rx="2"');
  // a wooden spoon resting in the top bowl
  o += S(`M${x + 14} ${Y - 92}L${x + 58} ${Y - 150}`, WOOD_D, 6) + E(x + 62, Y - 156, 9, 14, WOOD, OL(WOOD_D, 2.5) + ` transform="rotate(38 ${x + 62} ${Y - 156})"`);
  return o;
}
function canisters(x) {
  let o = shadow(x, 92);
  const can = (cx, w, h, body) => R(cx - w / 2, Y - h, w, h, body, OL(dk(body, 0.25), 3) + ' rx="10"') + R(cx - w / 2 + 6, Y - h + 10, 6, h - 22, '#FFFFFF', ' opacity="0.35" rx="3"') +
    R(cx - w / 2 - 3, Y - h - 12, w + 6, 14, WOOD, OL(WOOD_D, 2.5) + ' rx="5"') + R(cx - 7, Y - h - 20, 14, 9, WOOD_D, ' rx="4"') +
    R(cx - w * 0.3, Y - h * 0.62, w * 0.6, h * 0.26, lt(body, 0.55), ' rx="6"');
  o += can(x - 56, 54, 96, '#F1E6D6') + can(x + 2, 58, 120, '#E2CDB2') + can(x + 60, 48, 76, '#F1E6D6');
  return o;
}
function oven(x) {
  // a cream retro countertop oven, window glowing warm (cookies baking)
  let o = shadow(x, 118);
  o += R(x - 104, Y - 14, 18, 14, '#8E8678', ' rx="4"') + R(x + 86, Y - 14, 18, 14, '#8E8678', ' rx="4"');
  o += R(x - 112, Y - 176, 224, 164, '#EFE4D2', OL('#B5A48A', 3.5) + ' rx="22"');
  o += R(x - 104, Y - 168, 208, 18, '#FFFFFF', ' opacity="0.35" rx="9"');
  o += R(x - 92, Y - 140, 140, 104, '#B5A48A', ' rx="14"') + R(x - 86, Y - 134, 128, 92, 'url(#ovenglow)', ' rx="10"');
  o += R(x - 80, Y - 70, 116, 4, '#8E7A5E', ' rx="2"');
  // cookies on the oven rack
  o += E(x - 52, Y - 76, 16, 6, '#D7A060') + E(x - 16, Y - 76, 16, 6, '#C98E4A') + E(x + 20, Y - 76, 14, 5.5, '#D7A060');
  o += R(x - 86, Y - 134, 128, 22, '#FFFFFF', ' opacity="0.18" rx="10"') + P(`M${x - 70} ${Y - 46}L${x - 40} ${Y - 130}H${x - 26}L${x - 56} ${Y - 46}Z`, '#FFFFFF', ' opacity="0.16"');
  o += R(x - 92, Y - 156, 140, 9, '#B5A48A', ' rx="4.5"');                                   // handle
  for (const [ky, c] of [[Y - 130, '#C98A5C'], [Y - 92, '#A9B8A6'], [Y - 54, '#C98A5C']]) o += C(x + 80, ky, 12, c, OL(dk(c), 2.5)) + R(x + 78, ky - 10, 4, 10, lt(c, 0.5), ' rx="2"');
  return o;
}
function copperPot(x) {
  let o = shadow(x, 62);
  o += P(`M${x - 56} ${Y - 70}V${Y - 18}Q${x - 56} ${Y} ${x - 36} ${Y}H${x + 36}Q${x + 56} ${Y} ${x + 56} ${Y - 18}V${Y - 70}Z`, COPPER, OL('#9C6440', 3));
  o += R(x - 50, Y - 64, 10, 52, '#E2B08A', ' opacity="0.7" rx="5"') + R(x - 62, Y - 78, 124, 12, '#B97A4E', OL('#9C6440', 3) + ' rx="6"');
  o += S(`M${x + 58} ${Y - 60}H${x + 104}`, '#9C6440', 9) + S(`M${x + 58} ${Y - 60}H${x + 102}`, COPPER, 5);
  o += P(`M${x - 50} ${Y - 80}Q${x} ${Y - 112} ${x + 50} ${Y - 80}Z`, '#B97A4E', OL('#9C6440', 3)) + C(x, Y - 104, 7, '#9C6440');
  return o;
}
function crock(x) {
  let o = shadow(x, 40);
  // utensils first (behind the crock rim)
  o += S(`M${x - 14} ${Y - 70}L${x - 30} ${Y - 150}`, WOOD_D, 6) + E(x - 33, Y - 160, 9, 15, WOOD, OL(WOOD_D, 2.5) + ` transform="rotate(-11 ${x - 33} ${Y - 160})"`);
  o += S(`M${x + 4} ${Y - 70}L${x + 8} ${Y - 146}`, '#A0A9AB', 4.5) + P(`M${x + 8} ${Y - 144}q-16 -18 -6 -40q8 -8 14 0q8 22 -8 40z`, 'none', OL('#A0A9AB', 2.5));
  o += S(`M${x + 16} ${Y - 70}L${x + 36} ${Y - 140}`, WOOD_D, 5) + R(x + 28, Y - 168, 22, 30, WOOD, OL(WOOD_D, 2.5) + ` rx="4" transform="rotate(16 ${x + 39} ${Y - 153})"`);
  o += P(`M${x - 38} ${Y - 84}H${x + 38}L${x + 32} ${Y - 8}Q${x + 30} ${Y} ${x + 22} ${Y}H${x - 22}Q${x - 30} ${Y} ${x - 32} ${Y - 8}Z`, '#D9C4A6', OL('#A68A68', 3));
  o += R(x - 42, Y - 90, 84, 12, '#E7D7BE', OL('#A68A68', 3) + ' rx="5"') + R(x - 36, Y - 60, 72, 8, '#B9C3B2', ' rx="3"');
  return o;
}
function rollingPin(x) {
  let o = E(x, Y - 2, 88, 5, '#6B4B30', ' opacity="0.14"');
  o += R(x - 96, Y - 20, 28, 12, WOOD_D, OL('#7E5A38', 2.5) + ' rx="6"') + R(x + 68, Y - 20, 28, 12, WOOD_D, OL('#7E5A38', 2.5) + ' rx="6"');
  o += R(x - 70, Y - 30, 140, 30, WOOD_L, OL(WOOD_D, 3) + ' rx="14"') + R(x - 62, Y - 26, 124, 6, '#F0D5AE', ' rx="3"');
  return o;
}
// ---- seasonal props (dusty colours; never a saturated answer colour in a big area)
function seasonal(m, x) {
  let o = '';
  if (m === 'spring') {           // a vase of tulips + blossom sprig
    o += shadow(x, 34);
    const st = '#7FA877';
    o += S(`M${x} ${Y - 70}Q${x - 4} ${Y - 130} ${x - 26} ${Y - 168}M${x} ${Y - 70}Q${x + 2} ${Y - 140} ${x + 6} ${Y - 186}M${x} ${Y - 70}Q${x + 8} ${Y - 124} ${x + 34} ${Y - 158}`, st, 4.5);
    o += E(x - 14, Y - 112, 7, 20, '#8DB683', ` transform="rotate(-30 ${x - 14} ${Y - 112})"` + OL('#6F9A68', 2)) + E(x + 18, Y - 110, 7, 20, '#8DB683', ` transform="rotate(32 ${x + 18} ${Y - 110})"` + OL('#6F9A68', 2));
    const tulip = (tx, ty, c) => P(`M${tx - 13} ${ty - 18}Q${tx - 15} ${ty + 6} ${tx} ${ty + 8}Q${tx + 15} ${ty + 6} ${tx + 13} ${ty - 18}L${tx + 6} ${ty - 8}L${tx} ${ty - 22}L${tx - 6} ${ty - 8}Z`, c, OL(dk(c, 0.25), 2.5)) + P(`M${tx - 9} ${ty - 12}Q${tx - 9} ${ty} ${tx - 3} ${ty + 3}`, 'none', OL(lt(c, 0.45), 2.5));
    o += tulip(x - 26, Y - 172, '#EDB3C0') + tulip(x + 6, Y - 190, '#F2D78E') + tulip(x + 34, Y - 162, '#E9A9A0');
    o += P(`M${x - 30} ${Y - 78}Q${x - 36} ${Y - 30} ${x - 22} ${Y - 6}Q${x - 18} ${Y} ${x - 10} ${Y}H${x + 10}Q${x + 18} ${Y} ${x + 22} ${Y - 6}Q${x + 36} ${Y - 30} ${x + 30} ${Y - 78}Z`, '#C9D7E0', OL('#91A4B1', 3));
    o += R(x - 36, Y - 84, 72, 10, '#D9E3EA', OL('#91A4B1', 2.5) + ' rx="4"') + R(x - 24, Y - 70, 7, 50, '#FFFFFF', ' opacity="0.55" rx="3.5"');
    o += P(`M${x - 28} ${Y - 46}Q${x} ${Y - 54} ${x + 30} ${Y - 46}`, 'none', OL('#F0F4F6', 3));
  } else if (m === 'summer') {    // lemonade jug + glass + lemons
    o += shadow(x, 56);
    o += P(`M${x - 34} ${Y - 110}L${x - 40} ${Y - 10}Q${x - 40} ${Y} ${x - 30} ${Y}H${x + 30}Q${x + 40} ${Y} ${x + 40} ${Y - 10}L${x + 34} ${Y - 110}Z`, '#EEF3EC', OL('#A6B5AC', 3));
    o += P(`M${x - 36} ${Y - 80}L${x - 39} ${Y - 10}Q${x - 39} ${Y - 2} ${x - 30} ${Y - 2}H${x + 30}Q${x + 39} ${Y - 2} ${x + 39} ${Y - 10}L${x + 36} ${Y - 80}Z`, '#F6E7A6');
    o += C(x - 8, Y - 50, 12, '#FAF1C4', OL('#E3CF7C', 2.5)) + C(x + 14, Y - 28, 11, '#FAF1C4', OL('#E3CF7C', 2.5)) + C(x - 8, Y - 50, 4, '#E8D58A');
    o += E(x - 14, Y - 70, 7, 4, '#9CC08F', ' transform="rotate(-20 ' + (x - 14) + ' ' + (Y - 70) + ')"') + C(x + 18, Y - 66, 4, '#FFFFFF', ' opacity="0.8"') + C(x - 22, Y - 22, 3, '#FFFFFF', ' opacity="0.8"');
    o += S(`M${x + 34} ${Y - 96}Q${x + 66} ${Y - 92} ${x + 60} ${Y - 56}Q${x + 56} ${Y - 30} ${x + 38} ${Y - 26}`, '#A6B5AC', 7) + S(`M${x + 34} ${Y - 96}Q${x + 66} ${Y - 92} ${x + 60} ${Y - 56}Q${x + 56} ${Y - 30} ${x + 38} ${Y - 26}`, '#EEF3EC', 3);
    o += P(`M${x - 38} ${Y - 112}L${x - 48} ${Y - 122}L${x - 32} ${Y - 118}Z`, '#EEF3EC', OL('#A6B5AC', 2.5)) + R(x - 28, Y - 104, 7, 80, '#FFFFFF', ' opacity="0.5" rx="3.5"');
    // glass with straw
    const gx = x + 86;
    o += S(`M${gx + 4} ${Y - 54}L${gx + 18} ${Y - 92}L${gx + 30} ${Y - 92}`, '#E9B8B4', 4.5);
    o += P(`M${gx - 18} ${Y - 60}L${gx - 14} ${Y}H${gx + 14}L${gx + 18} ${Y - 60}Z`, '#EEF3EC', OL('#A6B5AC', 2.5)) + P(`M${gx - 16} ${Y - 40}L${gx - 14} ${Y - 2}H${gx + 14}L${gx + 16} ${Y - 40}Z`, '#F6E7A6');
    o += C(gx + 16, Y - 60, 10, '#F4E19A', OL('#D9BF5E', 2)) + S(`M${gx + 16} ${Y - 60}L${gx + 16} ${Y - 51}M${gx + 16} ${Y - 60}L${gx + 23} ${Y - 55}M${gx + 16} ${Y - 60}L${gx + 9} ${Y - 55}`, '#E3CF7C', 1.5);
    // lemons on the counter
    o += E(x - 70, Y - 13, 17, 13, '#F2DC8A', OL('#CDB45A', 2.5)) + E(x - 76, Y - 17, 5, 3, '#FFF5CF') + E(x - 44, Y - 11, 13, 11, '#EED47A', OL('#CDB45A', 2.5));
  } else if (m === 'autumn') {    // pumpkin + little gourd + a leafy twig
    o += shadow(x, 62);
    const pc = '#E1A469', pd = '#B97A44';
    o += E(x - 26, Y - 40, 30, 40, mix(pc, pd, 0.25), OL(pd, 3)) + E(x + 26, Y - 40, 30, 40, mix(pc, pd, 0.25), OL(pd, 3)) + E(x, Y - 42, 30, 42, pc, OL(pd, 3));
    o += E(x - 8, Y - 58, 7, 16, lt(pc, 0.35), ' opacity="0.7"') + S(`M${x} ${Y - 82}Q${x + 4} ${Y - 100} ${x + 14} ${Y - 106}`, '#7E8F5E', 7);
    o += S(`M${x + 6} ${Y - 92}Q${x + 30} ${Y - 112} ${x + 40} ${Y - 96}`, '#8FA06A', 3) + E(x - 14, Y - 90, 12, 7, '#9CAE72', ` transform="rotate(-25 ${x - 14} ${Y - 90})"` + OL('#728550', 2));
    o += E(x + 76, Y - 20, 20, 20, '#E6CF96', OL('#B9A061', 2.5)) + S(`M${x + 76} ${Y - 40}V${Y - 50}`, '#7E8F5E', 5) + S(`M${x + 66} ${Y - 30}Q${x + 76} ${Y - 10} ${x + 86} ${Y - 30}`, '#D2B877', 2);
    o += E(x - 74, Y - 6, 14, 6, '#D18A55', ` transform="rotate(-15 ${x - 74} ${Y - 6})"` + OL('#A6643A', 2)) + E(x - 96, Y - 5, 12, 5, '#D9B266', ` transform="rotate(20 ${x - 96} ${Y - 5})"` + OL('#A88A44', 2));
  } else {                        // gingerbread house
    o += shadow(x, 74);
    const gb = '#C98E5C', gbd = '#8E5E36', ic = '#FFFDF8';
    o += P(`M${x - 62} ${Y}V${Y - 74}L${x} ${Y - 128}L${x + 62} ${Y - 74}V${Y}Z`, gb, OL(gbd, 3));
    o += P(`M${x - 74} ${Y - 66}L${x} ${Y - 138}L${x + 74} ${Y - 66}L${x + 62} ${Y - 58}L${x} ${Y - 118}L${x - 62} ${Y - 58}Z`, '#F7F3EE', OL('#C9BFB4', 2.5));
    let sc = `M${x - 70} ${Y - 64}`; for (let i = 0; i < 6; i++) { const ax = x - 70 + i * 11.7, ay = Y - 64 - i * 11.4; sc += `Q${ax + 3} ${ay + 6} ${ax + 11.7} ${ay - 11.4}`; }
    o += S(sc, ic, 3) + S(`M${x + 70} ${Y - 64}` + Array.from({ length: 6 }, (_, i) => { const ax = x + 70 - i * 11.7, ay = Y - 64 - i * 11.4; return `Q${ax - 3} ${ay + 6} ${ax - 11.7} ${ay - 11.4}`; }).join(''), ic, 3);
    o += P(`M${x - 16} ${Y}V${Y - 34}Q${x - 16} ${Y - 50} ${x} ${Y - 50}Q${x + 16} ${Y - 50} ${x + 16} ${Y - 34}V${Y}Z`, '#8E5E36', OL('#6E4426', 2.5)) + C(x + 9, Y - 22, 2.5, '#F2DC8A');
    o += R(x - 50, Y - 64, 22, 20, '#FFE2A8', OL(ic, 3) + ' rx="3"') + R(x + 28, Y - 64, 22, 20, '#FFE2A8', OL(ic, 3) + ' rx="3"');
    o += S(`M${x - 39} ${Y - 64}V${Y - 44}M${x + 39} ${Y - 64}V${Y - 44}`, ic, 2);
    o += S(`M${x - 56} ${Y - 30}Q${x - 46} ${Y - 22} ${x - 36} ${Y - 30}Q${x - 28} ${Y - 22} ${x - 20} ${Y - 30}M${x + 20} ${Y - 30}Q${x + 28} ${Y - 22} ${x + 36} ${Y - 30}Q${x + 46} ${Y - 22} ${x + 56} ${Y - 30}`, ic, 2.6);
    for (const [cx, c] of [[x - 48, '#E4A9A9'], [x - 28, '#B9D3A8'], [x + 28, '#E4A9A9'], [x + 48, '#B9D3A8']]) o += C(cx, Y - 10, 4.5, c, OL('#FFFFFF', 1.5));
    o += C(x, Y - 94, 9, '#E4A9A9', OL(ic, 2.5)) + C(x, Y - 94, 3, '#FFFFFF');
    o += E(x, Y - 2, 76, 5, '#FFFFFF', ' opacity="0.9"') + E(x - 82, Y - 4, 12, 4, '#FFFFFF') + E(x + 84, Y - 4, 10, 4, '#FFFFFF');
    // candy cane
    o += S(`M${x + 96} ${Y}V${Y - 44}Q${x + 96} ${Y - 58} ${x + 108} ${Y - 58}Q${x + 118} ${Y - 58} ${x + 118} ${Y - 48}`, '#F7F3EE', 8) + S(`M${x + 96} ${Y - 6}V${Y - 44}Q${x + 96} ${Y - 58} ${x + 108} ${Y - 58}Q${x + 118} ${Y - 58} ${x + 118} ${Y - 48}`, '#D98C8C', 8, ' stroke-dasharray="7 9"');
  }
  return o;
}
function mid(m) {
  const defs = lg('ovenglow', [[0, '#FFE6B4'], [0.6, '#FFD49A'], [1, '#F2B47A']]);
  // layout along the 1200 tile (x = prop centre); seasonal at 300 and 900 (spacing 600 → visible on any screen side)
  let o = '';
  o += bowls(100);
  o += seasonal(m, 290);
  o += canisters(450);
  o += oven(660);
  o += rollingPin(560);
  o += seasonal(m, 890);
  o += copperPot(1010);
  o += both(x => crock(x), 1160, 50, W);
  return svg(W, 300, o, defs, 'props stand on y ' + MID_BASE);
}

// =====================================================================================================
// GROUND: counter top + sage cabinets (0 0 1200 260)
// =====================================================================================================
const TOWEL = {
  spring: { base: '#F7EFE6', stripe: '#E6B9C3' },
  summer: { base: '#F7F1DE', stripe: '#E9D48A' },
  autumn: { base: '#F4E8D8', stripe: '#D59A6E' },
  winter: { base: '#F4EFEA', stripe: '#C98A8A' },
};
function towel(m, x) {
  const t = TOWEL[m];
  let o = '';
  o += P(`M${x - 34} 72Q${x - 38} 140 ${x - 30} 176H${x + 30}Q${x + 38} 140 ${x + 34} 72Z`, t.base, OL(dk(t.base, 0.2), 2.5));
  o += R(x - 33, 150, 66, 8, t.stripe, ' opacity="0.9"') + R(x - 32, 163, 64, 4, t.stripe, ' opacity="0.9"');
  if (m === 'autumn') o += R(x - 4, 76, 8, 98, t.stripe, ' opacity="0.45"') + R(x - 34, 110, 68, 7, t.stripe, ' opacity="0.45"');
  if (m === 'winter') { const sx = x, sy = 118; o += S(`M${sx} ${sy - 10}V${sy + 10}M${sx - 9} ${sy - 5}L${sx + 9} ${sy + 5}M${sx - 9} ${sy + 5}L${sx + 9} ${sy - 5}`, t.stripe, 2.4); }
  if (m === 'spring') o += C(x, 116, 6, t.stripe, ' opacity="0.8"') + C(x - 7, 110, 4, t.stripe, ' opacity="0.6"') + C(x + 7, 110, 4, t.stripe, ' opacity="0.6"');
  if (m === 'summer') o += C(x, 116, 9, '#F4E3A0', OL('#D9BF5E', 1.8)) + S(`M${x} 107V125M${x - 8} 112L${x + 8} 120M${x - 8} 120L${x + 8} 112`, '#E3CF7C', 1.4);
  o += P(`M${x - 34} 72Q${x} 62 ${x + 34} 72Q${x} 84 ${x - 34} 72Z`, dk(t.base, 0.08));                 // fold over the handle
  return o;
}
function ground(m) {
  let defs = lg('top', [[0, '#C69E74'], [0.25, '#DDB98E'], [1, '#E5C49A']]) + lg('front', [[0, SAGE], [1, mix(SAGE, '#6E7A68', 0.18)]]);
  let o = '';
  o += R(0, GROUND_LINE, W, GROUND_FRONT - GROUND_LINE, 'url(#top)');
  // very soft plank joints (period 300) on the top
  for (let x = 0; x < W; x += 300) o += R(x + 148, GROUND_LINE, 2, GROUND_FRONT - GROUND_LINE, '#C9A47A', ' opacity="0.45"');
  o += R(0, GROUND_LINE, W, 2, '#B48C62', ' opacity="0.7"');
  // lip
  o += R(0, GROUND_FRONT, W, 12, '#C99A6B') + R(0, GROUND_FRONT, W, 3, '#EED2AC') + R(0, GROUND_FRONT + 10, W, 3, '#8E6440');
  // cabinet front
  o += R(0, 61, W, 175, 'url(#front)');
  o += R(0, 61, W, 6, '#6E7A68', ' opacity="0.18"');
  // drawers row (y 72–120) and doors (y 130–226), 300-wide modules; module joints at x = 0, 300, 600, 900
  for (let k = 0; k < 4; k++) {
    const x0 = k * 300;
    o += R(x0 + 10, 72, 280, 48, SAGE_L, OL(SAGE_D, 3) + ' rx="8"') + R(x0 + 16, 76, 268, 6, '#FFFFFF', ' opacity="0.3" rx="3"');
    o += R(x0 + 120, 92, 60, 10, WOOD, OL(WOOD_D, 2.5) + ' rx="5"');
    for (const dx of [10, 152]) {
      o += R(x0 + dx, 130, 138, 98, SAGE_L, OL(SAGE_D, 3) + ' rx="8"') + R(x0 + dx + 14, 144, 110, 70, 'none', OL(mix(SAGE_D, SAGE_L, 0.35), 2.5) + ' rx="6"');
      o += C(x0 + dx + (dx === 10 ? 120 : 18), 179, 6.5, WOOD, OL(WOOD_D, 2.5));
    }
  }
  // toe kick + floor strip
  o += R(0, 236, W, 12, '#7D8A78') + R(0, 248, W, 12, FLOOR[m]) + R(0, 248, W, 2, dk(FLOOR[m], 0.25));
  // tea towels on two drawer handles (one per 600)
  o += towel(m, 150) + towel(m, 750);
  return svg(W, 260, o, defs, `counter back edge y ${GROUND_LINE}, front edge y ${GROUND_FRONT}; fill below with ${FLOOR[m]}`);
}

// =====================================================================================================
// LIGHT: window light bars (0 0 600 720), glass at x 150–450 / y 90–400 (same scale as far)
// =====================================================================================================
function light() {
  // faint inside the glass (y 90–400 ≈ 0–0.5 of the bar) so the season view stays clear, strongest just below the sill
  const defs = lg('lb', [[0, '#FFFFFF', 0.1], [0.42, '#FFFFFF', 0.2], [0.55, '#FFFFFF', 0.5], [0.8, '#FFFFFF', 0.22], [1, '#FFFFFF', 0]], ' x1="0" y1="0" x2="0" y2="1"');
  let o = '';
  // two panes' worth of light falling down-right onto the wall below the window, the sill and the counter
  o += P('M152 92H296L470 720H290Z', 'url(#lb)') + P('M304 92H448L600 720H486Z', 'url(#lb)');
  return svg(600, 720, o, defs, 'glass at 150 90 300 310 (far tile coordinates minus 100)');
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.petal = svg(32, 32, `<g transform="rotate(-20 16 16)">` + P('M16 29Q5 23 6 13Q7 5 12.5 3.5L16 8L19.5 3.5Q25 5 26 13Q27 23 16 29Z', '#F6C8D4', ' stroke="#DC9AAE" stroke-width="1.8" stroke-linejoin="round"') +
    P('M16 26Q9.5 21.5 10.5 14Q11.5 9 14 8L16 10.5Z', '#FFE6EC', ' opacity="0.9"') + S('M16 12V24', '#E7A9BB', 1.3) + `</g>`);
  out.leaf_a = svg(32, 32, `<g transform="rotate(-14 16 16)">` +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Q13 25 12.5 21Q8.5 22.5 4 21Q5 17.5 8.5 15.5Q5.5 13 4.5 8.5Q9 7 12.5 9.5Q13 6 16 2.5Z', '#E8A462', ' stroke="#B06A34" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Z', '#D88E50', ' opacity="0.55"') +
    S('M16 9V31M16 17L9 11M16 17L23 11M16 20L9 19M16 20L23 19', '#B06A34', 1.3) + `</g>`);
  out.leaf_b = svg(32, 32, `<g transform="rotate(28 16 16)">` + P('M16 2Q26 9 25 18Q24 26 16 29Q8 26 7 18Q6 9 16 2Z', '#E0B456', ' stroke="#A27A2A" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2Q26 9 25 18Q24 26 16 29Z', '#CFA046', ' opacity="0.55"') + S('M16 6V31M16 13L11 9M16 13L21 9M16 19L10 15M16 19L22 15M16 24L12 21M16 24L20 21', '#A27A2A', 1.3) + `</g>`);
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 11)} ${f(16 + s * 11)}`; const bx = 16 + c * 7, by = 16 + s * 7; for (const d of [-1, 1]) { const b = a + d * 0.8; arms += `M${f(bx)} ${f(by)}L${f(bx + Math.cos(b) * 3.6)} ${f(by + Math.sin(b) * 3.6)}`; } }
  out.snow = svg(32, 32, C(16, 16, 15.5, 'url(#sg)') + S(arms, '#C9DDF0', 4) + S(arms, '#FFFFFF', 2.2) + C(16, 16, 3, '#FFFFFF'),
    rg('sg', [[0, '#FFFFFF', 0.7], [0.5, '#F2F7FC', 0.3], [1, '#F2F7FC', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#kg)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF8E6') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('kg', [[0, '#FFF6DC', 0.6], [1, '#FFF6DC', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? ri : ro; p.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, P(poly(starPts(16, 16.8, 14, 6.4)), '#EDEDED', ' stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"') + P(poly(starPts(15.4, 16, 8, 3.7)), '#FFFFFF'));
  // flour: a soft white mote (visible on the cream wall thanks to a faint warm-grey core edge)
  out.flour = svg(32, 32, C(16, 16, 15, 'url(#fg)') + C(16, 16, 5, '#FFFFFF', ' stroke="#E8DFD2" stroke-width="1"'),
    rg('fg', [[0, '#FFFFFF', 0.95], [0.45, '#FFFFFF', 0.45], [1, '#FFFFFF', 0]]));
  // steam: a soft wisp (white, low alpha; code scales it up and fades it)
  out.steam = svg(32, 32, E(16, 18, 14, 12, 'url(#stg)') + S('M12 28Q7 22 13 17T14 5', '#FFFFFF', 3.2, ' opacity="0.7"') + S('M20 28Q15 22 21 17T22 7', '#FFFFFF', 2.4, ' opacity="0.5"'),
    rg('stg', [[0, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  // sprinkles: white (tinted by code with multiply/source-atop); a grey under-edge keeps the shape readable
  out.sprinkle_a = svg(32, 32, `<g transform="rotate(-30 16 16)">${R(6, 12, 20, 8, '#D6D6D6', ' rx="4"')}${R(6, 11, 20, 7, '#FFFFFF', ' rx="3.5"')}${R(9, 12.6, 11, 2, '#FFFFFF', ' rx="1"')}</g>`);
  out.sprinkle_b = svg(32, 32, C(16, 17, 7.5, '#D6D6D6') + C(16, 16, 7, '#FFFFFF') + C(13.6, 13.4, 2.2, '#FFFFFF') + E(17.5, 19, 4, 2.4, '#EDEDED'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)">` + `<rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/>` + `</g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // crumb: a little cookie crumb in dough colours (not tinted)
  out.crumb = svg(32, 32, P('M8 15L12 8L20 7L26 12L25 21L18 26L10 24Z', '#E9B872', ' stroke="#9A6330" stroke-width="2" stroke-linejoin="round"') + P('M11 14L14 10L19 9.5L22 12L17 14Z', '#F6D59D') + C(18, 19, 2.4, '#C98E4A') + C(12, 19, 1.6, '#C98E4A'));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => { fs.writeFileSync(path.join(dir, n + '.svg'), s); return s.length; };
  const sizes = [];
  for (const m of MOODS) { for (const [l, fn] of [['far', far], ['mid', mid], ['ground', ground]]) sizes.push(`${l}_${m} ${(wr(env, l + '_' + m, fn(m)) / 1024).toFixed(1)}KB`); }
  sizes.push('light ' + (wr(env, 'light', light()) / 1024).toFixed(1) + 'KB');
  const ps = particles(); for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  const gone = [];
  for (const n of ['env/rays', 'env/caustic', ...MOODS.map(m => 'env/surface_' + m), 'particles/bubble', 'particles/plankton']) {
    const p = path.join(A, n + '.svg'); if (fs.existsSync(p)) { fs.unlinkSync(p); gone.push(n); }
  }
  console.log(sizes.join('  '));
  console.log('particles: ' + Object.keys(ps).join(', ') + (gone.length ? '\nremoved: ' + gone.join(', ') : ''));
}
module.exports = { MOODS, WALL, TILE, FLOOR, AMBIENT, MID_BASE, GROUND_LINE, GROUND_FRONT };
if (require.main === module) main();
