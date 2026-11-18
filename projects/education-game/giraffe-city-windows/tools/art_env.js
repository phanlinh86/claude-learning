// Gigi's Peekaboo Windows: environment + particle art generator (100 % original, procedurally laid out flat-cartoon SVG).
// Usage: node tools/art_env.js            Preview scenes + seam proof: node tools/env_scenes.js
// Writes game/assets/default/env/{far,mid,ground}_{sunny,breezy,rain,rainbow}.svg, sun, cloud1..3, rain_cloud, rainbow,
// car_a, car_b, bus, kite and game/assets/default/particles/{drop,splash,leaf_a,leaf_b,paper,sparkle,star,puff,confetti_a,b}.
// Removes the old forest files (far/mid/ground_{spring,summer,autumn,winter}, particles petal/snow1/snow2/firefly).
//
// Tiling: every hill / roofline is either a sum of sines with INTEGER periods over W (f(0) = f(W)) or a partition of
// [0, W); every object near an edge is drawn again at x ± W (wrap()), so the left and right edges of each layer match.
// All 4 moods share ONE layout (same shops, trees, lamps); only the palette and the mood details change, so a crossfade
// between moods never "jumps".
// Colour rule (DESIGN §3): everything is calmer, lighter and less saturated than the answer colours AND than the
// foreground building facades, so the windows pop. No text, no logos, generic vehicles.
//
// Layer geometry (svg coords) that the draw recipe in env_scenes.js relies on:
//   far    0 0 1200 420 : skyline + spire + soft hills, opaque from the hills (y ≈ 330) down to 420.
//   mid    0 0 1200 360 : continuous back row opaque from y = BACK_TOP_MIN (242) to 360; shop roofs 156..202; tree tops 116..180.
//   ground 0 0 1200 260 : transparent 0..40, pavement 40..100, kerb 100..110, road 110..260 (lane dashes 136..142).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wave = terms => x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const rrD = (x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); return `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`; };
// rounded top only
const rtD = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return `M${f(x)} ${f(y + h)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h)}Z`; };
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) and, if the object crosses an edge, again shifted by ∓W
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
const lg = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
function mix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); }
const dk = (c, t = 0.18) => mix(c, '#3E3A44', t);
const lt = (c, t = 0.35) => mix(c, '#FFFFFF', t);

// ---------------- palettes ----------------
// Per mood. Facades are hazier than the foreground set (brick-rose E6B8A2, cream F2E3C6, sage C9D8B6, sky-grey C8D6E2,
// lilac-grey D9CFE0, sand EAD4AE): mid = that set mixed 45 % toward the sky haze.
const HAZE = { sunny: '#E4EEF3', breezy: '#E6F0F0', rain: '#D2D9E1', rainbow: '#EAEDEE' };
const FACADES = ['#E6B8A2', '#F2E3C6', '#C9D8B6', '#C8D6E2', '#D9CFE0', '#EAD4AE'];
const AWN = [['#DCA79C', '#F7EFE2'], ['#A9C4A3', '#F4F1E4'], ['#A3B4CA', '#F3F1EA'], ['#C9C08E', '#F6F0DD']];
const MOODS = {
  sunny: {
    farBack: '#D3E1EC', farFront: '#C1D3E3', farWin: '#D8E4EE', farLit: null, spire: '#B6C9DB', spireHi: '#CFDCE8',
    hill: '#C9DDC3', hillSh: '#BCD3B5', hill2: '#D5E5CE',
    back: '#DCE4E8', backRoof: '#CDD7DD', backWin: '#E8EEF1', hazeT: 0.45,
    glass: '#D3E6EE', glassHi: '#EEF6F8', glassLit: null, door: '#BBA28B', trim: '#F8F4EC',
    tree: ['#AFCF9C', '#9DC28A', '#C6DEB6'], trunk: '#B09A84', planter: '#CDB8A0', planterSh: '#B9A389',
    hedge: '#A7C994', hedgeSh: '#97BC84', lawn: '#C2DBAF',
    pole: '#8F9CA6', poleSh: '#7B8892', lamp: '#F6F1DE', lampGlow: 0,
    table: '#F4EFE6', chair: '#BCA58E', umbrella: false, parasolCol: null, wet: 0, tilt: 0, flags: false,
    pave: '#D9D3C9', paveHi: '#E7E2D9', paveJoint: '#CCC5B9', paveBack: '#CDC6BA', kerb: '#C6BEB1', kerbFront: '#ABA396',
    road: '#8F9298', roadDark: '#82858B', roadHi: '#9A9DA2', dash: '#E5E0D2', puddle: null, leaves: 0,
  },
};
MOODS.breezy = Object.assign({}, MOODS.sunny, {
  farBack: '#D5E3EA', farFront: '#C3D5E0', hill: '#C6DCBF', hillSh: '#B7D1AF', back: '#DDE5E7',
  tree: ['#A9CC97', '#97BF85', '#C2DCB1'], tilt: 1, flags: true, leaves: 1,
});
MOODS.rain = Object.assign({}, MOODS.sunny, {
  farBack: '#BCC7D4', farFront: '#ABB8C8', farWin: '#B9C4D2', farLit: '#E9D7A8', spire: '#A3B1C2', spireHi: '#B7C3D1',
  hill: '#B3C3B8', hillSh: '#A6B7AC', hill2: '#BECCC1',
  back: '#C6CDD5', backRoof: '#B8C0CA', backWin: '#EADBB2', hazeT: 0.5,
  glass: '#C3CFDA', glassHi: '#D9E2EA', glassLit: '#F6DFA6', door: '#A8917C', trim: '#E9E6E0',
  tree: ['#9BB98E', '#8AAC7E', '#AFC9A2'], trunk: '#9A8673', planter: '#B9A690', planterSh: '#A6937D',
  hedge: '#94B286', hedgeSh: '#86A578', lawn: '#AFC6A2',
  pole: '#7F8B96', poleSh: '#6E7A85', lamp: '#FFF0C4', lampGlow: 1,
  table: '#E6E2DA', chair: '#A9937D', umbrella: true, wet: 1,
  pave: '#CDC9C2', paveHi: '#DCDAD5', paveJoint: '#C0BBB3', paveBack: '#C1BCB3', kerb: '#B9B3AA', kerbFront: '#9E978D',
  road: '#7E838B', roadDark: '#737880', roadHi: '#959AA2', dash: '#D8D5CB', puddle: ['#B9C6D2', '#DCE5EC', '#A9B7C5'],
});
MOODS.rainbow = Object.assign({}, MOODS.sunny, {
  farBack: '#D6E0EA', farFront: '#C5D3E1', hill: '#C7DDC2', hillSh: '#B9D2B3', back: '#DEE3E7',
  glassLit: '#F8E8BC', lampGlow: 0.4, wet: 0.5, umbrella: false, flags: true,
  pave: '#D6D1C7', paveHi: '#E6E2DA', paveJoint: '#C9C3B8', road: '#8A8E95', roadDark: '#7E8288', roadHi: '#A2A6AB',
  puddle: ['#C5D7E2', '#EEF4F7', '#B5C8D6'], rainbowPuddle: true,
});
const ROAD_FILL = Object.fromEntries(Object.entries(MOODS).map(([k, v]) => [k, v.roadDark]));

// ---------------- FAR: skyline + spire + hills (0 0 1200 420) ----------------
function far(m) {
  const C = MOODS[m], r = rng(41);
  let o = '';
  // back skyline blocks: partition of [0, W) into widths 46..96 (last one closes exactly at W)
  const backs = []; { let x = 0; while (x < W) { let w = 46 + Math.floor(r() * 50); if (W - x - w < 46) w = W - x; backs.push([x, w, 150 + r() * 110]); x += w; } }
  // gaps (lower blocks) so the skyline breathes: every 3rd block much lower
  backs.forEach((b, i) => { if (i % 3 === 2) b[2] = 240 + r() * 40; });
  for (const [x, w, top] of backs) o += P(rtD(x - 0.5, top, w + 1, 420 - top, 10), C.farBack);
  // the spire (generic TV-tower-like), x 840
  const sx = 842;
  o += P(poly([[sx - 9, 330], [sx - 3, 120], [sx + 3, 120], [sx + 9, 330]]), C.spire);
  o += ell(sx, 118, 24, 14, C.spire) + ell(sx - 6, 113, 12, 5, C.spireHi);
  o += rect(sx - 13, 128, 26, 8, C.spire, 4);
  o += P(poly([[sx - 2, 104], [sx - 1, 44], [sx + 1, 44], [sx + 2, 104]]), C.spire) + circ(sx, 44, 3.5, C.spire);
  // front skyline blocks: separate, with gaps, rounded or stepped tops + faint window rows
  const fronts = [[30, 70, 220], [120, 54, 250], [210, 90, 196], [345, 62, 236], [430, 78, 212], [560, 58, 248], [640, 96, 204], [905, 70, 226], [1000, 60, 254], [1080, 86, 210], [1180, 56, 238]];
  for (const [x0, w, top] of fronts) o += wrap(x0 + w / 2, w / 2 + 2, cx => {
    const x = cx - w / 2;
    let s = P(rtD(x, top, w, 420 - top, 8), C.farFront);
    if (w > 80) s += P(rtD(x + w * 0.3, top - 22, w * 0.4, 30, 6), C.farFront);   // stepped crown
    for (let yy = top + 18; yy < 330; yy += 22) for (let xx = x + 10; xx < x + w - 12; xx += 16) {
      const lit = C.farLit && ((xx * 7 + yy * 3) % 11 === 0);
      s += rect(xx, yy, 7, 9, lit ? C.farLit : C.farWin, 2);
    }
    return s;
  });
  // soft hills in front of the skyline base
  const h1 = wave([[10, 2, 0.4], [6, 5, 1.7], [3, 9, 0.2]]);
  const h2 = wave([[8, 3, 2.1], [5, 7, 0.9]]);
  o += P(bandD(x => 330 + h1(x), 420), C.hill);
  o += P(bandD(x => 356 + h2(x), 420), C.hillSh);
  // round trees on the hills, tiny
  const tr = rng(7);
  for (let i = 0; i < 14; i++) { const x = 40 + i * 84 + tr() * 30, y = 338 + h1(x) + 4, rr = 9 + tr() * 6; o += wrap(x, rr, cx => circ(cx, y, rr, C.hillSh) + circ(cx - rr * 0.3, y - rr * 0.3, rr * 0.45, C.hill2)); }
  return svg(W, 420, o);
}

// ---------------- MID: shops, cafe, park corner, trees, lamp posts (0 0 1200 360) ----------------
const B = 360;   // base line of the mid layer (sits on the pavement back edge)
const SHOPS = [   // x (left), w, h (from base), facade idx, awning idx, kind
  { x: 22, w: 178, h: 158, fc: 0, aw: 0, kind: 'bakery' },
  { x: 252, w: 212, h: 176, fc: 1, aw: 1, kind: 'cafe' },
  { x: 718, w: 172, h: 204, fc: 3, aw: 2, kind: 'florist' },
  { x: 918, w: 190, h: 166, fc: 5, aw: 3, kind: 'books' },
  { x: 1148, w: 74, h: 190, fc: 4, aw: -1, kind: 'narrow' },   // crosses the right edge → wrapped
];
const TREES = [{ x: 226, s: 0.9 }, { x: 560, s: 1.15 }, { x: 650, s: 0.95 }, { x: 1128, s: 0.85 }];
const LAMPS = [484, 904, 700];
const BACK_TOP_MIN = 242;

function mid(m) {
  const C = MOODS[m], hz = HAZE[m];
  const fac = FACADES.map(c => mix(c, hz, C.hazeT));
  let o = '', defs = '';
  if (C.lampGlow) defs += rg('lg', [[0, '#FFF1C6', 0.75 * C.lampGlow], [0.5, '#FFE9B0', 0.3 * C.lampGlow], [1, '#FFE9B0', 0]]);
  if (C.glassLit) defs += rg('wg', [[0, C.glassLit, 1], [1, C.glass, 1]], ' cx="0.5" cy="0.35" r="0.75"');
  // 1. continuous back row (hazy rowhouses), partition of [0, W): opaque from y ≥ BACK_TOP_MIN
  const r = rng(99); const backs = []; { let x = 0; while (x < W) { let w = 70 + Math.floor(r() * 60); if (W - x - w < 70) w = W - x; backs.push([x, w, B - (118 + Math.floor(r() * 18))]); x += w; } }
  for (const [x, w, top] of backs) {
    o += rect(x - 0.5, top, w + 1, B - top, C.back);
    o += rect(x - 0.5, top - 6, w + 1, 8, C.backRoof, 0);
    for (let xx = x + 14; xx < x + w - 18; xx += 26) o += rect(xx, top + 16, 12, 16, C.backWin, 3);
  }
  // park corner (x 470..720): low fence + hedge + lawn, between the cafe and the florist
  o += rect(464, 300, 254, 60, C.lawn);
  const hedge = x => 292 - 10 * Math.abs(Math.sin((x - 470) / 22));
  { const pts = [[470, B]]; for (let x = 470; x <= 716; x += 4) pts.push([x, hedge(x)]); pts.push([716, B]); o += P(poly(pts), C.hedge); }
  o += rect(470, 330, 246, 30, C.hedgeSh);
  // bench in the park
  o += rect(604, 316, 62, 7, C.chair, 3) + rect(604, 302, 62, 6, C.chair, 3) + rect(608, 322, 5, 16, dk(C.chair)) + rect(657, 322, 5, 16, dk(C.chair));
  // fence posts
  for (let x = 476; x <= 712; x += 18) o += rect(x, 326, 5, 34, C.trim, 2);
  o += rect(470, 334, 246, 4, C.trim, 2);
  // 2. trees (drawn before shops? no — park trees behind lamp; planter trees in front of the back row)
  const tree = (x, s) => {
    const lean = C.tilt * 7 * s, top = B - 210 * s;
    let t = P(poly([[x - 5 * s, B - 30], [x - 3 * s + lean * 0.3, top + 60 * s], [x + 3 * s + lean * 0.3, top + 60 * s], [x + 5 * s, B - 30]]), C.trunk);
    const cx = x + lean, cy = top + 52 * s;
    t += circ(cx - 26 * s, cy + 14 * s, 34 * s, C.tree[1]) + circ(cx + 24 * s, cy + 12 * s, 36 * s, C.tree[1]) + circ(cx, cy - 10 * s, 44 * s, C.tree[1]);
    t += circ(cx - 22 * s, cy + 6 * s, 30 * s, C.tree[0]) + circ(cx + 20 * s, cy + 4 * s, 31 * s, C.tree[0]) + circ(cx - 2 * s, cy - 16 * s, 38 * s, C.tree[0]);
    t += circ(cx - 16 * s, cy - 26 * s, 13 * s, C.tree[2]);
    // planter box
    t += P(poly([[x - 26 * s, B - 34], [x + 26 * s, B - 34], [x + 21 * s, B], [x - 21 * s, B]]), C.planter) + rect(x - 28 * s, B - 38, 56 * s, 7, C.planterSh, 3);
    return t;
  };
  for (const t of TREES) o += wrap(t.x, 90 * t.s, cx => tree(cx, t.s));
  // 3. shops
  const awning = (x, w, y, h, ai, kind) => {
    if (ai < 0) return '';
    const [c1, c2] = AWN[ai].map(c => C.wet ? mix(c, '#8B95A3', 0.15 * C.wet) : c);
    const lift = C.tilt * 7;   // breezy: right side of the valance lifts
    const xl = x - 8, xr = x + w + 8, n = Math.max(6, Math.round(w / 22));
    const yB = i => y + h - lift * (i / n);
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = x + (w * i) / n, b = x + (w * (i + 1)) / n, a2 = xl + ((xr - xl) * i) / n, b2 = xl + ((xr - xl) * (i + 1)) / n;
      s += P(poly([[a, y], [b, y], [b2, yB(i + 1)], [a2, yB(i)]]), i % 2 ? c2 : c1);
      // scallop
      const sc = (a2 + b2) / 2, sr = (b2 - a2) / 2, sy = (yB(i) + yB(i + 1)) / 2;
      s += `<path d="M${f(a2)} ${f(yB(i))}A${f(sr)} ${f(sr * 0.8)} 0 0 0 ${f(b2)} ${f(yB(i + 1))}Z" fill="${i % 2 ? c2 : c1}"${C.tilt ? ` transform="rotate(${f(-8 * C.tilt)} ${f(sc)} ${f(sy)})"` : ''}/>`;
    }
    s += rect(x - 4, y - 4, w + 8, 6, dk(c1, 0.1), 3);
    return s;
  };
  const shop = S => {
    const { w, h, fc, aw, kind } = S; const x = S.x, top = B - h, col = fac[fc], line = dk(col, 0.12);
    let s = P(rtD(x, top, w, h, 6), col);
    s += rect(x - 4, top - 2, w + 8, 12, line, 4);   // cornice
    s += rect(x, B - 10, w, 10, mix(col, '#9A948C', 0.25));   // plinth
    // upper floor windows
    if (h > 150) for (let xx = x + 16; xx + 26 <= x + w - 10; xx += Math.max(38, (w - 20) / Math.floor((w - 20) / 38))) {
      s += rect(xx - 3, top + 22, 30, 36, C.trim, 5) + rect(xx, top + 25, 24, 30, C.glassLit && (xx | 0) % 3 === 0 ? C.glassLit : C.glass, 4) + rect(xx + 3, top + 28, 6, 12, C.glassHi, 2);
    }
    if (kind === 'narrow') { s += rect(x + 18, B - 70, 38, 60, C.door, 8) + rect(x + 22, B - 64, 30, 22, C.glass, 6); return s; }
    // shop window + door
    const wy = B - 92, wh = 70, dw = 34, dx = kind === 'books' ? x + 14 : x + w - dw - 14;
    const gx = kind === 'books' ? x + dw + 26 : x + 12, gw = w - dw - 40;
    s += rect(gx - 4, wy - 4, gw + 8, wh + 8, C.trim, 6);
    s += rect(gx, wy, gw, wh, C.glassLit ? 'url(#wg)' : C.glass, 4);
    s += P(poly([[gx + 8, wy + wh - 8], [gx + 26, wy + 6], [gx + 38, wy + 6], [gx + 20, wy + wh - 8]]), C.glassHi, ' opacity="0.7"');
    // what is in the window (simple shapes, no text): bakery buns, cafe cups, florist pots, books stacks
    const sy = wy + wh - 4;
    if (kind === 'bakery') for (let i = 0; i < 4; i++) s += ell(gx + 22 + i * (gw - 40) / 3, sy - 9, 13, 9, '#E9CFA6') + ell(gx + 18 + i * (gw - 40) / 3, sy - 13, 5, 2.5, '#F5E5C9');
    if (kind === 'cafe') for (let i = 0; i < 3; i++) { const cx = gx + 28 + i * (gw - 56) / 2; s += rect(cx - 9, sy - 20, 18, 16, C.trim, 3) + strokeP(`M${f(cx + 9)} ${f(sy - 16)}q7 4 0 9`, C.trim, 3); }
    if (kind === 'florist') for (let i = 0; i < 3; i++) { const cx = gx + 20 + i * (gw - 40) / 2; s += P(poly([[cx - 10, sy - 18], [cx + 10, sy - 18], [cx + 7, sy], [cx - 7, sy]]), C.planter) + circ(cx, sy - 26, 9, C.tree[0]) + circ(cx - 4, sy - 30, 4, '#F1D6D8') + circ(cx + 5, sy - 26, 4, '#F6EAD0'); }
    if (kind === 'books') for (let i = 0; i < 7; i++) s += rect(gx + 10 + i * (gw - 24) / 7, sy - 22 - (i % 3) * 4, (gw - 24) / 7 - 3, 22 + (i % 3) * 4, ['#C9B6C9', '#B9C9C0', '#D9C4A8'][i % 3], 2);
    s += rect(gx - 6, wy + wh + 2, gw + 12, 6, C.trim, 3);  // sill
    s += rect(dx - 3, B - 84, dw + 6, 74, C.trim, 6) + rect(dx, B - 81, dw, 71, C.door, 5) + rect(dx + 6, B - 75, dw - 12, 26, C.glass, 4) + circ(dx + dw - 8, B - 44, 2.5, C.trim);
    // blank round sign plate with a simple shape (no letters)
    s += awning(x + 6, w - 12, wy - 26, 18, aw, kind);
    if (kind === 'cafe' || kind === 'florist') {   // hanging sign
      const hx = x + w - 10, hy = top + 64;
      const swing = C.tilt * 10;
      s += rect(hx - 2, hy - 2, 22, 4, line, 2) + `<g transform="rotate(${f(swing)} ${f(hx + 12)} ${f(hy)})">` + strokeP(`M${f(hx + 6)} ${f(hy)}v8M${f(hx + 18)} ${f(hy)}v8`, line, 2) + circ(hx + 12, hy + 20, 13, C.trim) + (kind === 'cafe' ? rect(hx + 6, hy + 15, 12, 10, AWN[1][0], 2) : circ(hx + 12, hy + 20, 6, AWN[0][0])) + '</g>';
    }
    return s;
  };
  for (const S of SHOPS) o += wrap(S.x + S.w / 2, S.w / 2 + 10, cx => shop(Object.assign({}, S, { x: cx - S.w / 2 })));
  // 4. cafe tables in front of the cafe (x 270..450)
  const cafe = SHOPS[1];
  for (let i = 0; i < 2; i++) {
    const tx = cafe.x + 46 + i * 120;
    let t = '';
    if (C.umbrella) {   // rain: umbrellas open over the tables (cosy)
      const uc = AWN[i ? 1 : 0][0];
      t += rect(tx - 1.5, B - 92, 3, 66, C.pole);
      t += `<path d="M${f(tx - 40)} ${f(B - 84)}Q${f(tx)} ${f(B - 128)} ${f(tx + 40)} ${f(B - 84)}Z" fill="${uc}"/>`;
      t += `<path d="M${f(tx - 40)} ${f(B - 84)}q10 6 20 0q10 6 20 0q10 6 20 0q10 6 20 0" fill="${dk(uc, 0.08)}"/>`;
      t += circ(tx, B - 106, 3, dk(uc, 0.2));
    } else if (C.tilt) {   // breezy: a little flag on the table
      t += rect(tx - 1, B - 66, 2, 34, C.pole) + P(poly([[tx + 1, B - 66], [tx + 20, B - 60], [tx + 1, B - 54]]), AWN[i ? 3 : 0][0]);
    }
    t += ell(tx, B - 32, 22, 5, C.table) + rect(tx - 2, B - 32, 4, 26, dk(C.table, 0.25)) + ell(tx, B - 6, 10, 2.5, dk(C.table, 0.25));
    for (const d of [-1, 1]) t += rect(tx + d * 30 - 7, B - 24, 14, 4, C.chair, 2) + rect(tx + d * 30 + (d > 0 ? 4 : -7), B - 42, 3, 22, C.chair, 1.5) + rect(tx + d * 30 - 6, B - 20, 2.5, 18, C.chair) + rect(tx + d * 30 + 3.5, B - 20, 2.5, 18, C.chair);
    if (!C.umbrella) t += circ(tx, B - 40, 5, '#F1D6D8') + rect(tx - 3, B - 37, 6, 5, C.planter, 1);
    o += t;
  }
  // 5. lamp posts
  for (const lx of LAMPS) o += wrap(lx, 30, x => {
    let s = '';
    if (C.lampGlow) s += circ(x + 14, B - 156, 34, 'url(#lg)');
    s += rect(x - 3.5, B - 160, 7, 160, C.pole, 3) + rect(x - 8, B - 12, 16, 12, C.poleSh, 3) + rect(x - 6, B - 70, 12, 6, C.poleSh, 3);
    s += strokeP(`M${f(x)} ${f(B - 158)}q0 -14 14 -12`, C.pole, 5);
    s += rect(x + 6, B - 172, 16, 6, C.poleSh, 3) + P(`M${f(x + 7)} ${f(B - 166)}h14l-2 14h-10Z`, C.lamp);
    if (C.flags) {   // breezy / rainbow: a small pennant banner on the pole, tilted by the wind
      const fl = C.tilt ? 1 : 0.4;
      s += P(poly([[x + 3, B - 128], [x + 30, B - 124 + 4 * fl], [x + 3, B - 112]]), AWN[(x | 0) % 4][0]);
    }
    return s;
  });
  // 6. wet sheen at the shop bases (rain / rainbow)
  if (C.wet) for (const S of SHOPS) o += wrap(S.x + S.w / 2, S.w / 2, cx => rect(cx - S.w / 2 + 6, B - 4, S.w - 12, 3, '#FFFFFF', 0, ` opacity="${f(0.25 * C.wet)}"`));
  return svg(W, 360, o, defs);
}

// ---------------- GROUND: pavement, kerb, road (0 0 1200 260) ----------------
function ground(m) {
  const C = MOODS[m];
  let o = '', defs = '';
  defs += lg('rd', 0, 0, 0, 1, [[0, C.road], [1, C.roadDark]]);
  // road 110..260
  o += `<rect x="0" y="108" width="${W}" height="152" fill="url(#rd)"/>`;
  o += rect(0, 110, W, 6, C.roadDark, 0, ' opacity="0.6"');   // gutter shadow
  // lane dashes (period 100 → 12 per tile, seamless)
  for (let x = 25; x < W; x += 100) o += rect(x, 136, 50, 6, C.dash, 3);
  // wet road: soft reflections of the shop lights + far edge
  if (C.wet) {
    for (let x = 60; x < W; x += 150) o += rect(x, 120, 16, 34, C.roadHi, 8, ` opacity="${f(0.55 * C.wet)}"`) + rect(x + 26, 124, 8, 22, C.roadHi, 4, ` opacity="${f(0.4 * C.wet)}"`);
    if (C.glassLit) for (let x = 100; x < W; x += 300) o += rect(x, 150, 30, 6, '#E9D8A9', 3, ` opacity="${f(0.35 * C.wet)}"`);
  }
  // kerb 100..110
  o += rect(0, 98, W, 8, C.kerb) + rect(0, 104, W, 8, C.kerbFront);
  for (let x = 20; x < W; x += 80) o += rect(x, 98, 1.5, 14, C.paveJoint);
  // drain grates (2 per tile)
  for (const gx of [330, 930]) o += rect(gx, 105, 34, 7, C.roadDark, 2) + [4, 12, 20, 28].map(d => rect(gx + d, 106, 2.5, 5, C.kerbFront, 1)).join('');
  // pavement 40..100
  o += rect(0, 40, W, 60, C.pave);
  o += rect(0, 40, W, 5, C.paveBack);   // back edge where the shops meet the pavement
  o += rect(0, 45, W, 3, C.paveHi);
  // big paving slabs: 2 rows, staggered, period 80
  for (let x = 20; x < W; x += 80) o += rect(x, 48, 1.5, 24, C.paveJoint) + rect(x + 40, 72, 1.5, 26, C.paveJoint);
  o += rect(0, 72, W, 1.5, C.paveJoint);
  // breezy: a few leaves lying on the pavement (away from Gigi's feet row y ≈ 92)
  if (C.leaves) for (const [lx, ly, rot, c] of [[180, 60, 20, '#B9D19E'], [520, 56, -30, '#E2CB93'], [790, 64, 50, '#B9D19E'], [1060, 58, -10, '#E2CB93']])
    o += `<path d="M${f(lx - 8)} ${f(ly)}Q${f(lx)} ${f(ly - 7)} ${f(lx + 8)} ${f(ly)}Q${f(lx)} ${f(ly + 7)} ${f(lx - 8)} ${f(ly)}Z" fill="${c}" transform="rotate(${rot} ${lx} ${ly})"/>`;
  // wet: sheen streaks + puddles
  if (C.wet) {
    for (let x = 40; x < W; x += 120) o += rect(x, 52, 40, 3, '#FFFFFF', 1.5, ` opacity="${f(0.35 * C.wet)}"`) + rect(x + 56, 80, 26, 3, '#FFFFFF', 1.5, ` opacity="${f(0.28 * C.wet)}"`);
  }
  if (C.puddle) {
    const [pc, ph, ps] = C.puddle;
    for (const [px, py, rx] of [[250, 82, 46], [700, 64, 34], [1010, 84, 52]]) {
      o += wrap(px, rx + 2, x => {
        let s = ell(x, py + 1.5, rx + 2, rx * 0.2 + 2, ps, ' opacity="0.6"') + ell(x, py, rx, rx * 0.2, pc);
        if (C.rainbowPuddle) ['#F2C7C4', '#F6E2B4', '#C9E3C0', '#BFD8EE'].forEach((c, i) => { s += ell(x - rx * 0.2, py - 1 + i * 2.2 - 3, rx * 0.55, 1.2, c, ' opacity="0.9"'); });
        s += ell(x + rx * 0.35, py - rx * 0.06, rx * 0.25, 1.6, ph);
        return s;
      });
    }
  }
  return svg(W, 260, o, defs);
}

// ---------------- sky props ----------------
function sun() {
  let o = '';
  o += circ(100, 100, 92, '#FFFFFF', ' opacity="0.32"') + circ(100, 100, 72, '#FFF6D6', ' opacity="0.5"');
  for (let i = 0; i < 12; i++) o += `<rect x="94" y="8" width="12" height="26" rx="6" fill="#FFE9A6" transform="rotate(${i * 30} 100 100)"/>`;
  o += circ(100, 100, 56, '#F7CE6A') + circ(100, 100, 52, '#FFE38A');
  o += `<path d="M146 112a52 52 0 0 1-76 30a56 56 0 0 0 76-30Z" fill="#FBD56F"/>`;
  o += ell(80, 80, 16, 10, '#FFF3C8', ' transform="rotate(-35 80 80)"');
  return svg(200, 200, o);
}
function cloudShape(blobs, base, body, shade, hi) {
  // separate shapes (no winding tricks), shade copy 7 px lower makes the soft underside
  const g = (dy, col) => `<g fill="${col}">` + blobs.map(([x, y, r]) => circ(x, y + dy, r, col)).join('') + rect(base[0], base[1] + dy, base[2], base[3], col, base[3] / 2) + '</g>';
  return g(7, shade) + g(0, body) + blobs.slice(0, 2).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.35, r * 0.45, r * 0.25, hi)).join('');
}
const CLOUDS = [
  [[[95, 92, 38], [150, 70, 52], [210, 90, 38]], [50, 90, 210, 44]],
  [[[80, 96, 32], [128, 76, 42], [180, 66, 46], [232, 94, 32]], [46, 92, 214, 38]],
  [[[118, 86, 40], [172, 82, 44]], [70, 88, 150, 40]],
];
const cloud = i => svg(300, 160, cloudShape(CLOUDS[i][0], CLOUDS[i][1], '#FFFFFF', '#DCE7F1', '#FFFFFF'));
const rainCloud = () => svg(300, 160, cloudShape([[86, 90, 40], [146, 66, 54], [212, 88, 42]], [44, 88, 214, 46], '#CAD3DF', '#AAB6C7', '#DCE2EA'));
function rainbow() {
  const cols = ['#F4B2AE', '#F8CFA2', '#F8E7A8', '#C6E3AE', '#AFD3EC', '#C4B9E6'];
  const defs = lg('fade', 0, 0, 0, 1, [[0, '#FFFFFF'], [0.62, '#FFFFFF'], [1, '#FFFFFF', 0]])
    + `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="600"><rect width="1200" height="600" fill="url(#fade)"/></mask>`
    + `<filter id="b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.5"/></filter>`;
  let o = `<g mask="url(#m)" filter="url(#b)" opacity="0.8">`;
  cols.forEach((c, i) => { const rr = 548 - i * 24 - 12; o += `<path d="M${600 - rr} 600A${rr} ${rr} 0 0 1 ${600 + rr} 600" fill="none" stroke="${c}" stroke-width="25"/>`; });
  o += '</g>';
  return svg(1200, 600, o, defs);
}
function car(body, line, glass, variant) {
  let o = ell(120, 112, 100, 6, '#2E3440', ' opacity="0.18"');
  if (variant === 'a') {   // little rounded sedan
    o += `<path d="M22 96V70Q22 54 40 52L64 50Q78 22 104 20H146Q168 20 182 48L206 52Q222 56 222 72V96Z" fill="${line}"/>`;
    o += `<path d="M26 92V71Q26 58 41 56L67 54Q80 26 105 24H145Q165 24 178 52L204 56Q218 59 218 73V92Z" fill="${body}"/>`;
    o += `<path d="M78 52Q88 30 104 30H122V52Z" fill="${glass}"/><path d="M130 30H145Q160 30 170 52H130Z" fill="${glass}"/>`;
    o += rect(118, 56, 3, 30, line, 1.5) + rect(76, 64, 14, 4, line, 2) + rect(136, 64, 14, 4, line, 2);
    o += ell(206, 66, 7, 5, '#FFF6DA') + rect(24, 62, 7, 8, '#E3B6AE', 3);
  } else {                 // round hatchback with a roof rack
    o += `<path d="M24 96V64Q24 48 44 44L70 38Q92 16 124 16H160Q192 16 206 50Q220 56 220 74V96Z" fill="${line}"/>`;
    o += `<path d="M28 92V65Q28 52 45 48L72 42Q93 20 124 20H158Q188 20 202 52Q216 58 216 75V92Z" fill="${body}"/>`;
    o += `<path d="M84 44Q98 26 122 26H136V46Z" fill="${glass}"/><path d="M144 26H158Q180 26 190 50H144Z" fill="${glass}"/>`;
    o += rect(96, 8, 80, 5, line, 2.5) + rect(108, 12, 4, 6, line) + rect(160, 12, 4, 6, line);
    o += rect(30, 70, 186, 6, lt(body, 0.35), 3);
    o += ell(206, 64, 6, 6, '#FFF6DA') + rect(26, 58, 6, 9, '#E3B6AE', 3);
  }
  o += ell(70, 36, 8, 3, '#FFFFFF', ' opacity="0.5"');
  for (const wx of [66, 176]) o += circ(wx, 94, 19, '#5B5F66') + circ(wx, 94, 9, '#C9CDD2') + circ(wx, 94, 3.5, '#8C9198');
  return svg(240, 120, o);
}
function bus() {
  const body = '#A3C6D8', line = '#6F95AA', stripe = '#F4ECDA', glass = '#E1EDF2';
  let o = ell(240, 190, 210, 8, '#2E3440', ' opacity="0.18"');
  o += P(rrD(14, 26, 452, 150, 38), line) + P(rrD(18, 30, 444, 142, 34), body);
  o += rect(18, 124, 444, 22, stripe) + rect(18, 146, 444, 4, lt(line, 0.2));
  o += rect(200, 18, 80, 14, line, 7) + rect(204, 20, 72, 10, '#EEF3F5', 5);   // roof light
  for (const wx of [52, 164, 276]) o += rect(wx - 3, 53, 106, 64, line, 14) + rect(wx, 56, 100, 58, glass, 12) + P(`M${wx + 12} 106L${wx + 34} 62H${wx + 46}L${wx + 24} 106Z`, '#FFFFFF', ' opacity="0.55"');
  // front: big windscreen + door + friendly face (round headlight eyes are on the front panel, smile on the bumper)
  o += P(`M392 50H420Q452 50 456 92V118H392Z`, line) + P(`M395 53H419Q448 54 452 92V114H395Z`, glass);
  o += circ(436, 144, 9, '#FFF6DA') + circ(437, 142, 3, '#FFFFFF');
  o += strokeP('M420 160q14 8 30 0', line, 4);
  o += circ(414, 98, 4.5, '#5B5F66') + circ(415, 97, 1.5, '#FFFFFF') + circ(436, 98, 4.5, '#5B5F66') + circ(437, 97, 1.5, '#FFFFFF');   // eyes in the windscreen
  o += ell(400, 110, 6, 3.5, '#F2B9B6', ' opacity="0.8"');
  o += rect(20, 140, 8, 14, '#E3B6AE', 4);
  for (const wx of [104, 370]) o += circ(wx, 172, 25, '#5B5F66') + circ(wx, 172, 12, '#C9CDD2') + circ(wx, 172, 4, '#8C9198');
  return svg(480, 200, o);
}
function kite() {
  const a = '#E8B2AB', b = '#F6EBD6', line = '#B88078', spar = '#A88B6E';
  let o = '';
  o += P(poly([[48, 4], [88, 46], [48, 46]]), a) + P(poly([[48, 4], [8, 46], [48, 46]]), b) + P(poly([[8, 46], [48, 96], [48, 46]]), a) + P(poly([[88, 46], [48, 96], [48, 46]]), b);
  o += strokeP(poly([[48, 4], [88, 46], [48, 96], [8, 46]]), line, 3);
  o += strokeP('M48 6V94M10 46H86', spar, 2.5);
  o += strokeP('M48 96q-10 8 0 14q10 6 0 16', line, 2);
  for (const [x, y] of [[44, 104], [50, 120]]) o += P(`M${x} ${y}l-8 -5v10Z`, '#C8DAB4') + P(`M${x} ${y}l8 -5v10Z`, '#C8DAB4');
  return svg(96, 128, o);
}

// ---------------- particles (0 0 32 32) ----------------
const PARTICLES = {
  splash: () => svg(32, 32, ell(16, 26, 12, 3.4, 'none', ' stroke="#E6F0F7" stroke-width="2.2"') + `<path d="M9 23Q7 18 4 16Q8 17 11 22Z" fill="#EEF5FA"/><path d="M23 23Q25 18 28 16Q24 17 21 22Z" fill="#EEF5FA"/>` + circ(5, 12, 2.2, '#F3F8FB') + circ(27, 12, 2.2, '#F3F8FB') + circ(16, 15, 2.6, '#F3F8FB') + circ(11, 9, 1.5, '#F3F8FB') + circ(21, 9, 1.5, '#F3F8FB')),
  leaf_a: () => svg(32, 32, `<path d="M4 26Q6 8 28 4Q26 24 4 26Z" fill="#A9CB8E"/><path d="M4 26Q16 16 25 7" stroke="#86AB6E" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M10 12Q14 8 20 7" stroke="#C6DEB0" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  leaf_b: () => svg(32, 32, `<path d="M16 3Q28 9 25 20Q22 27 16 28Q10 27 7 20Q4 9 16 3Z" fill="#E6C98A" stroke="#C6A462" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 31V8M16 15L11 11M16 15L21 11M16 21L10 17M16 21L22 17" stroke="#C6A462" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M11 8Q13 6 16 5.5" stroke="#F4E2B6" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  paper: () => svg(32, 32, `<path d="M16 4Q27 8 24 20Q20 28 16 29Q12 28 8 20Q5 8 16 4Z" fill="#F7DEE2"/><path d="M16 8Q22 11 20 19" stroke="#FBEEF0" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M16 28V13" stroke="#E9C3CA" stroke-width="1.4" stroke-linecap="round"/>`),
  sparkle: () => svg(32, 32, circ(16, 16, 9, '#FFF7D6', ' opacity="0.5"') + `<path d="M16 2Q18 14 30 16Q18 18 16 30Q14 18 2 16Q14 14 16 2Z" fill="#FFFFFF"/>` + circ(16, 16, 3, '#FFF3C2')),
  star: () => svg(32, 32, `<path d="M16 3L19.8 11.2L28.4 12.2L22 18.2L23.7 27L16 22.6L8.3 27L10 18.2L3.6 12.2L12.2 11.2Z" fill="#FFE08A" stroke="#E0B54F" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 13.5L15 9" stroke="#FFF3C6" stroke-width="2" stroke-linecap="round"/>`),
  puff: () => svg(32, 32, `<path d="M6 22a6 6 0 0 1 3-11a7 7 0 0 1 13-2a6 6 0 0 1 4 11a5 5 0 0 1-5 6H11a5 5 0 0 1-5-4Z" fill="#E7EDF2" transform="translate(0 1.5)"/><path d="M6 22a6 6 0 0 1 3-11a7 7 0 0 1 13-2a6 6 0 0 1 4 11a5 5 0 0 1-5 6H11a5 5 0 0 1-5-4Z" fill="#FFFFFF"/>` + ell(13, 12, 3.5, 2, '#FFFFFF')),
  confetti_a: () => svg(32, 32, `<rect x="9" y="5" width="14" height="22" rx="3" fill="#FFFFFF" transform="rotate(18 16 16)"/><rect x="16" y="5" width="7" height="22" rx="3" fill="#E4E4E4" transform="rotate(18 16 16)"/>`),
  confetti_b: () => svg(32, 32, `<path d="M5 20Q10 8 16 16T27 12" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M5 22Q10 10 16 18T27 14" stroke="#E2E2E2" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>`),
};
PARTICLES.drop = () => svg(32, 32, `<defs>${lg('d', 0, 0, 0, 1, [[0, '#FFFFFF', 0.1], [0.55, '#F2F8FC', 0.75], [1, '#E6F1F8', 1]])}</defs><path d="M15.2 2Q16 1.4 16.8 2L18.2 26Q18.4 30 16 30Q13.6 30 13.8 26Z" fill="url(#d)"/>` + ell(15.4, 26.5, 0.9, 1.6, '#FFFFFF', ' opacity="0.8"'));

// ---------------- write ----------------
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const out = {};
  for (const m of Object.keys(MOODS)) { out[`far_${m}`] = far(m); out[`mid_${m}`] = mid(m); out[`ground_${m}`] = ground(m); }
  out.sun = sun(); [0, 1, 2].forEach(i => { out['cloud' + (i + 1)] = cloud(i); });
  out.rain_cloud = rainCloud(); out.rainbow = rainbow();
  out.car_a = car('#86B6B0', '#5D8C86', '#DCEBEE', 'a'); out.car_b = car('#EFE1C1', '#BDA57A', '#DCEBEE', 'b');
  out.bus = bus(); out.kite = kite();
  for (const [n, s] of Object.entries(out)) fs.writeFileSync(path.join(env, n + '.svg'), s);
  for (const [n, fn] of Object.entries(PARTICLES)) fs.writeFileSync(path.join(par, n + '.svg'), fn());
  // remove the old forest game's files
  const old = [];
  for (const s of ['spring', 'summer', 'autumn', 'winter']) for (const l of ['far', 'mid', 'ground']) old.push(path.join(env, `${l}_${s}.svg`));
  for (const p of ['petal', 'snow1', 'snow2', 'firefly']) old.push(path.join(par, p + '.svg'));
  let removed = 0; for (const p of old) if (fs.existsSync(p)) { fs.unlinkSync(p); removed++; }
  const sizes = Object.keys(out).map(n => `${n} ${(out[n].length / 1024).toFixed(1)}k`).join(', ');
  console.log('env:', sizes); console.log('particles:', Object.keys(PARTICLES).join(', ')); console.log('removed old files:', removed);
}
if (require.main === module) main();
module.exports = { MOODS, ROAD_FILL, SHOPS, TREES, LAMPS, BACK_TOP_MIN };
