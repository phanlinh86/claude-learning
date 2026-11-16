// Moka's Fairy Tea Party: fairy-forest environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{sunny,breezy,rain,rainbow}.svg, env/trunk_l.svg, env/trunk_r.svg,
// env/{sun,rainbow,cloud_a,cloud_b,cloud_rain}.svg and game/assets/default/particles/{mote,sparkle,leaf,leaf_b,petal,raindrop,
// splash,puff,dust,seed,confetti_a,confetti_b,star,dot}.svg; any other (old) env / particle file is deleted. (DESIGN §3, §4.4)
// Usage: node tools/art_env.js        Preview scenes + seam proof + RECIPE: node tools/env_scenes.js
//
// Look: a calm, misty, slightly yellow-green forest clearing. far = three depths of soft tree silhouettes (hazy canopy wall,
// back trees, nearer trees) with sun shafts falling through a gap and a floor mist; mid = a bush bank, young trees, ferns,
// glowing cream / dusty-rose mushroom clusters and a little tree-stump house with an arched door and a glowing window;
// ground = a mossy clearing with clover, tiny muted flowers and pebbles (rain: puddles; rainbow: wet glints).
// Colour rule (DESIGN §3): every green is sage / olive and desaturated, no saturated red / yellow / blue anywhere, so the
// answer colours (#E84A4A #3C8DE8 #FFD23F #4CC26B …) pop. Rain = bluish-grey and darker; rainbow = fresh with wet glints.
//
// Tiling: every layer is 1200 wide; silhouettes are periodic functions of x (integer harmonics over 1200, bump periods that
// divide 1200) and props crossing x = 0 / 1200 are drawn twice (x and x ∓ 1200) → both edges match (docs/art/env_seams.png).
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far    0 0 1200 720 : transparent top. Near-tree crowns ≈ rows 70…330, back-tree crowns ≈ 200…360, hazy canopy wall from
//                         ≈ 330, floor mist ≈ 560…690. FAR_BASE = 690: this row is placed on the mid bank (hidden below).
//   mid    0 0 1200 340 : transparent top; props stand on rows 300…330; solid bank from MID_BANK ≈ 296 down to 340.
//                         MID_BASE = 334 lands on the ground horizon. Rows 270…340 are hazed (calm behind the tea things).
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 30 (tufts poke up to ≈ 22); CALM rows 40…150 stay plain (the
//                         table / placemats band); clover, flowers, pebbles (rain: puddles) below; bottom = GROUND_BOTTOM[m].
//   trunk  0 0 220 900  : bottom anchor (110, 900); tie point trunk_l (150, 140), trunk_r (70, 140) (on the branch stub).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const FAR_BASE = 690, MID_BASE = 334, MID_BANK = 296, GROUND_LINE = 30;
const CALM = [40, 150];
const TRUNK = { w: 220, h: 900, anchor: [110, 900], tieL: [150, 140], tieR: [70, 140] };
const f = n => (Math.round(n * 10) / 10).toString();
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
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) and its wrapped copy when the prop (half width `half`) crosses an edge
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);   // periodic over 1200
const bump = (x, period, amp, pw = 0.7, ph = 0) => -amp * Math.pow(Math.abs(Math.sin(Math.PI * (x + ph) / period)), pw);  // rounded treetops (period | 1200)
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------- palettes ----------------
const SKY = {   // DESIGN §3 exact (top, bottom)
  sunny: ['#BFE3D0', '#FBF6DF'], breezy: ['#CFE6DA', '#F5F1E2'], rain: ['#97A9B4', '#CBD6D6'], rainbow: ['#A9DCEB', '#FFF1D9'],
};
// mood grading: base colour → TINT by t → hazed toward HAZE by distance
const TINT = { sunny: ['#FFF4D2', 0.06], breezy: ['#EAF2EC', 0.1], rain: ['#56687A', 0.34], rainbow: ['#F0FAF2', 0.03] };
const HAZE = { sunny: '#EDF0D2', breezy: '#E6EEE0', rain: '#AEBCC0', rainbow: '#E4F2E8' };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#2E3A34', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
const RIM = { sunny: '#FFF6DE', breezy: '#FFFFFF', rain: '#FFE9C2', rainbow: '#FFF8EE' };   // warm rim light on things (code)
const MOSS = { sunny: '#B3C08E', breezy: '#B0BF92', rain: '#7D8C88', rainbow: '#ADC196' };
const GROUND_BOTTOM = { sunny: '#9DAB79', breezy: '#9BAA7E', rain: '#6B7976', rainbow: '#98AE80' };
// base colours (sunny), all calm / desaturated
const FAR = { back: '#BACBA4', mid: '#A0B68E', near: '#8CA27A', bark: '#9E987C' };
const BUSH = { c: '#8FA672', s: '#778E5E', l: '#B1C28E', o: '#5E7248' };
const FERN = { c: '#93AC72', d: '#738C58' };
const BARK = { c: '#A48A6A', d: '#765F47', l: '#C3AC8A', o: '#5E4A38' };
const MUSH = { stem: '#F2EAD6', stemD: '#D8CBB0', rose: '#C9978F', roseD: '#A6766F', cream: '#EADCC0', creamD: '#C8B694', spot: '#FBF5E8', glow: '#FFF1CF' };

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
const CANOPY0 = x => 336 + wave(x, [[1, 12, 0.4], [3, 9, 1.9], [7, 4, 0.7]]) + bump(x, 75, 22) + bump(x, 120, 16, 0.8, 30);
const FLOOR = x => 612 + wave(x, [[2, 6, 1.1], [5, 4, 0.2]]) + bump(x, 40, 12, 0.6) + bump(x, 100, 14, 0.8, 20);
function crown(cx, cy, r, col, colL, seed, n = 7) {
  // a soft cloud-of-circles crown (flat, no outline) + one highlight lobe upper-left
  let s = '', hl = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hsh(seed, i) * 0.6, d = r * (0.42 + 0.22 * hsh(i, seed)), rr = r * (0.5 + 0.22 * hsh(seed + 3, i));
    const x = cx + Math.cos(a) * d * 1.15, y = cy + Math.sin(a) * d * 0.78;
    s += C(x, y, rr, col);
    if (Math.cos(a) < -0.2 && Math.sin(a) < 0.1) hl += C(x - rr * 0.18, y - rr * 0.22, rr * 0.62, colL);
  }
  return s + C(cx, cy, r * 0.7, col) + hl;
}
function farTree(x, base, top, w, col, colL, bark, seed, crownR) {
  // tapered trunk from base up to the crown + a couple of side branches, crown at `top`
  const tw = w * 0.62;
  let s = P(T`M${x - w / 2} ${base}Q${x - tw / 2} ${(base + top) / 2} ${x - tw / 2} ${top}L${x + tw / 2} ${top}Q${x + tw / 2} ${(base + top) / 2} ${x + w / 2} ${base}Z`, bark);
  const by = top + (base - top) * 0.25, sd = hsh(seed, 5) < 0.5 ? -1 : 1;
  s += S(T`M${x} ${by + 20}Q${x + sd * crownR * 0.4} ${by - 10} ${x + sd * crownR * 0.7} ${top + 8}`, bark, Math.max(3, w * 0.22));
  s += crown(x, top - crownR * 0.25, crownR, col, colL, seed);
  s += crown(x + sd * crownR * 0.72, top + 4, crownR * 0.6, col, colL, seed + 9, 5);
  return s;
}
function far(m) {
  const rain = m === 'rain', shafts = m === 'sunny' ? 1 : m === 'rainbow' ? 0.8 : m === 'breezy' ? 0.45 : 0;
  let o = '', defs = '';
  const skyB = SKY[m][1];
  // ---- 0 hazy canopy wall (almost sky-coloured) with faint trunks
  const c0 = mix(tone(m, FAR.back, 0.55), skyB, rain ? 0.25 : 0.35);
  { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 5) pts.push([x, CANOPY0(x)]); pts.push([W, 720]); o += P(poly(pts), c0); }
  let ft = ''; for (let k = 0; k < 24; k++) { const x = k * 50 + 13 + (k * 17) % 21, w = 7 + (k * 5) % 6; ft += both(xx => R(xx - w / 2, CANOPY0(x) + 30, w, 720, dk(c0, 0.07)), x, w); }
  o += `<g opacity="0.7">${ft}</g>`;
  // ---- 1 back trees (hazy), crowns ≈ rows 200…360
  const h1 = rain ? 0.4 : 0.46, c1 = tone(m, FAR.mid, h1), c1L = lt(c1, 0.12), b1 = tone(m, FAR.bark, h1 + 0.06);
  const BACK = [[30, 22, 250, 62], [150, 18, 290, 52], [270, 24, 236, 66], [395, 16, 300, 50], [480, 14, 330, 40], [880, 14, 330, 40], [965, 22, 250, 60], [1080, 18, 284, 54]];
  BACK.forEach(([x, w, top, r], i) => { o += both(xx => farTree(xx, 720, top, w, c1, c1L, b1, 40 + i, r), x, r * 1.6); });
  // ghost trees in the clearing (very hazy, slender) so a tall portrait screen never shows an empty hole
  const cg = mix(c1, HAZE[m], 0.45), cgL = lt(cg, 0.1), bg = mix(b1, HAZE[m], 0.5);
  for (const [x, w, top, r, sd] of [[600, 10, 300, 40, 61], [770, 12, 270, 46, 62]]) o += farTree(x, 720, top, w, cg, cgL, bg, sd, r);
  // mist between back and near trees
  defs += lg('ms', [[0, HAZE[m], 0], [0.5, HAZE[m], rain ? 0.75 : 0.6], [1, HAZE[m], 0]], V);
  o += R(0, 380, W, 160, 'url(#ms)');
  // ---- sun shafts (from the upper right, slanting down-left) through the canopy gap
  if (shafts) {
    defs += lg('sh', [[0, '#FFFBEA', 0], [0.18, '#FFFBEA', 0.55], [0.7, '#FFFBEA', 0.18], [1, '#FFFBEA', 0]], V);
    for (const [x, w, d, a] of [[560, 58, 170, 0.55], [650, 34, 180, 0.45], [720, 80, 200, 0.5], [830, 40, 210, 0.4], [180, 46, 170, 0.32], [1040, 54, 190, 0.3]]) {
      o += both(xx => P(T`M${xx} -10L${xx + w} -10L${xx + w - d} 660L${xx - d - w * 0.4} 660Z`, 'url(#sh)', ` opacity="${f(a * shafts)}"`), x, d + w);
    }
  }
  // ---- 2 nearer trees, crowns ≈ rows 70…330 — a clearing gap around x 560…780 lets the sun in
  const h2 = rain ? 0.2 : 0.24, c2 = tone(m, FAR.near, h2), c2L = lt(c2, 0.12), b2 = tone(m, FAR.bark, h2);
  const NEAR = [[100, 40, 160, 92], [330, 34, 200, 80], [440, 26, 280, 52], [930, 36, 200, 80], [1120, 44, 150, 96]];
  NEAR.forEach(([x, w, top, r], i) => { o += both(xx => farTree(xx, 720, top, w, c2, c2L, b2, 80 + i, r), x, r * 1.7); });
  // bark detail on the near trunks
  let bk = ''; NEAR.forEach(([x, w, top]) => { bk += both(xx => T`M${xx - w * 0.12} ${top + 60}Q${xx - w * 0.2} ${top + 200} ${xx - w * 0.1} 700M${xx + w * 0.16} ${top + 120}Q${xx + w * 0.22} ${top + 260} ${xx + w * 0.14} 700`, x, w); });
  o += S(bk, dk(b2, 0.12), 2.2, ' opacity="0.55"');
  // ---- 3 forest floor: low bushes / undergrowth band + floor mist
  const c3 = tone(m, FAR.near, rain ? 0.26 : 0.3);
  { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 4) pts.push([x, FLOOR(x)]); pts.push([W, 720]); o += P(poly(pts), c3); }
  defs += lg('fm', [[0, HAZE[m], 0], [0.55, HAZE[m], rain ? 0.7 : 0.6], [1, HAZE[m], 0.3]], V);
  o += R(0, 560, W, 160, 'url(#fm)');
  if (m === 'rainbow') {   // wet glints on the far leaves
    let g = ''; for (let k = 0; k < 40; k++) { const x = k * 30 + (k * 13) % 17, y = 120 + (k * 53) % 420; g += both(xx => E(xx, y, 2.2, 1.2, '#FFFFFF'), x, 3); }
    o += `<g opacity="0.55">${g}</g>`;
  }
  return svg(1200, 720, o, defs, `sky ${SKY[m][0]} ${SKY[m][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 340): bush bank, young trees, ferns, glowing mushrooms, tree-stump house
// =====================================================================================================
const BANK = x => MID_BANK + wave(x, [[2, 4, 0.9], [5, 3, 2.2], [12, 1.5, 0.4]]);
function lobes(list, col, colS, colL, ol, olw) {
  let s = '';
  for (const [x, y, r] of list) s += C(x, y, r + olw / 2, ol);
  for (const [x, y, r] of list) s += C(x, y, r, colS);
  for (const [x, y, r] of list) s += C(x - r * 0.12, y - r * 0.16, r * 0.84, col);
  for (const [x, y, r] of list) if (r > 12) s += E(x - r * 0.36, y - r * 0.4, r * 0.32, r * 0.2, colL, ` opacity="0.7" transform="rotate(-30 ${f(x - r * 0.36)} ${f(y - r * 0.4)})"`);
  return s;
}
const bushC = m => ({ c: tone(m, BUSH.c), s: tone(m, BUSH.s), l: tone(m, BUSH.l), o: tone(m, BUSH.o) });
function youngTree(m, x, yb, h, k, seed) {
  const b = { c: tone(m, BARK.c, 0.08), d: tone(m, BARK.d, 0.08) }, tc = bushC(m);
  const tw = 14 * k;
  let s = P(T`M${x - tw} ${yb}Q${x - tw * 0.5} ${yb - h * 0.5} ${x - tw * 0.45} ${yb - h}L${x + tw * 0.45} ${yb - h}Q${x + tw * 0.5} ${yb - h * 0.5} ${x + tw} ${yb}Z`, b.c, OL(b.d, 2));
  s += S(T`M${x + tw * 0.3} ${yb - 8}Q${x + tw * 0.2} ${yb - h * 0.5} ${x + tw * 0.15} ${yb - h * 0.9}`, b.d, 2, ' opacity="0.6"');
  const L = [[0, -1.0, 34], [-30, -0.9, 26], [30, -0.88, 27], [-14, -1.16, 26], [16, -1.14, 25], [0, -0.82, 26]];
  s += lobes(L.map(([dx, dy, r], i) => [x + dx * k, yb + dy * h, r * k * (0.9 + 0.2 * hsh(seed, i))]), tc.c, tc.s, tc.l, tc.o, 4);
  return s;
}
function fern(m, x, yb, k, lean, seed) {
  // 5–7 fronds fanning out from (x, yb); each frond = a curved midrib with alternating leaflets
  const c = tone(m, FERN.c), d = tone(m, FERN.d);
  let s = '';
  const n = 7;
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) / ((n - 1) / 2);   // -1..1
    const len = (70 + 26 * (1 - Math.abs(u)) + 14 * hsh(seed, i)) * k;
    const ang = -Math.PI / 2 + u * 1.15 + lean;
    const tx = x + Math.cos(ang) * len, ty = yb + Math.sin(ang) * len * 0.92;
    const cx = x + Math.cos(ang - 0.25 * Math.sign(u || 1)) * len * 0.55, cy = yb + Math.sin(ang) * len * 0.75 - 10 * k;
    const tip = [tx + u * 10 * k, ty + Math.abs(u) * 20 * k];
    const bz = t => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tip[0], (1 - t) * (1 - t) * yb + 2 * (1 - t) * t * cy + t * t * tip[1]];
    const col = i % 2 ? c : d;
    let leaf = '';
    const seg = 10;
    for (let q = 1; q < seg; q++) {
      const t = q / seg, p = bz(t), p2 = bz(t + 0.06);
      const dx = p2[0] - p[0], dy = p2[1] - p[1], dl = Math.hypot(dx, dy) || 1, tX = dx / dl, tY = dy / dl, nX = -tY, nY = tX;
      const Lf = len * 0.17 * Math.sin(Math.PI * (0.1 + 0.9 * t)) * (1.1 - t * 0.5);
      for (const sd of [-1, 1]) {
        const tipL = [p[0] + nX * sd * Lf + tX * Lf * 0.45, p[1] + nY * sd * Lf + tY * Lf * 0.45];
        const q2 = [p[0] + tX * Lf * 0.55, p[1] + tY * Lf * 0.55];
        leaf += T`M${p[0]} ${p[1]}Q${p[0] + nX * sd * Lf * 0.7} ${p[1] + nY * sd * Lf * 0.7} ${tipL[0]} ${tipL[1]}Q${q2[0] + nX * sd * Lf * 0.3} ${q2[1] + nY * sd * Lf * 0.3} ${q2[0]} ${q2[1]}Z`;
      }
    }
    s += P(leaf, col) + S(T`M${x} ${yb}Q${cx} ${cy} ${tip[0]} ${tip[1]}`, dk(col, 0.15), 2.2 * k);
  }
  return s;
}
function mushroom(m, x, yb, h, w, rose, glowA) {
  const st = tone(m, MUSH.stem, 0.04), stD = tone(m, MUSH.stemD, 0.04);
  const cap = tone(m, rose ? MUSH.rose : MUSH.cream, 0.04), capD = tone(m, rose ? MUSH.roseD : MUSH.creamD, 0.04), spot = tone(m, MUSH.spot);
  const yc = yb - h * 0.7, hc = h * 0.42;
  let s = C(x, yc - hc * 0.2, w * 1.05, 'url(#mg)', ` opacity="${f(glowA)}"`);
  s += E(x, yb + 1, w * 0.4, 3, '#2E3A34', ' opacity="0.12"');
  s += P(T`M${x - w * 0.17} ${yb}Q${x - w * 0.22} ${yb - h * 0.4} ${x - w * 0.13} ${yc + 2}L${x + w * 0.13} ${yc + 2}Q${x + w * 0.22} ${yb - h * 0.4} ${x + w * 0.17} ${yb}Q${x} ${yb + 3} ${x - w * 0.17} ${yb}Z`, st, OL(stD, 1.8));
  s += P(T`M${x + w * 0.04} ${yc + 4}Q${x + w * 0.14} ${yb - h * 0.35} ${x + w * 0.1} ${yb - 1}L${x + w * 0.16} ${yb - 1}Q${x + w * 0.2} ${yb - h * 0.4} ${x + w * 0.12} ${yc + 4}Z`, stD, ' opacity="0.6"');
  const capP = T`M${x - w / 2} ${yc}C${x - w / 2} ${yc - hc * 1.3} ${x + w / 2} ${yc - hc * 1.3} ${x + w / 2} ${yc}Q${x} ${yc + hc * 0.28} ${x - w / 2} ${yc}Z`;
  s += P(capP, cap, OL(capD, 2));
  s += P(T`M${x + w * 0.12} ${yc - hc * 0.9}C${x + w * 0.4} ${yc - hc * 0.8} ${x + w * 0.5} ${yc - hc * 0.3} ${x + w / 2 - 1} ${yc}Q${x + w * 0.3} ${yc + hc * 0.16} ${x + w * 0.2} ${yc + hc * 0.14}Q${x + w * 0.36} ${yc - hc * 0.4} ${x + w * 0.12} ${yc - hc * 0.9}Z`, capD, ' opacity="0.45"');
  s += C(x - w * 0.22, yc - hc * 0.45, w * 0.07, spot) + C(x + w * 0.05, yc - hc * 0.78, w * 0.06, spot) + C(x + w * 0.26, yc - hc * 0.35, w * 0.05, spot);
  s += E(x - w * 0.2, yc - hc * 0.75, w * 0.1, w * 0.05, '#FFFFFF', ` opacity="0.7" transform="rotate(-25 ${f(x - w * 0.2)} ${f(yc - hc * 0.75)})"`);
  return s;
}
function mushCluster(m, x, yb, k, glowA, seed) {
  const r = rng(seed);
  const list = [[-26, 34, 30, r() < 0.5], [4, 56, 44, true], [30, 40, 32, false], [-6, 22, 20, false], [48, 20, 18, true]];
  return list.map(([dx, h, w, rose]) => mushroom(m, x + dx * k, yb + (Math.abs(dx) > 30 ? 3 : 0), h * k, w * k, rose, glowA)).join('');
}
function stumpHouse(m, x, yb) {
  const b = { c: tone(m, BARK.c), d: tone(m, BARK.d), l: tone(m, BARK.l), o: tone(m, BARK.o) };
  const h = 128, hw = 60;
  let s = E(x, yb + 2, 96, 7, '#2E3A34', ' opacity="0.14"');
  s += P(T`M${x - hw - 30} ${yb}Q${x - hw - 4} ${yb - 6} ${x - hw} ${yb - 36}L${x - hw + 4} ${yb - h}L${x + hw - 4} ${yb - h}L${x + hw} ${yb - 36}Q${x + hw + 4} ${yb - 6} ${x + hw + 30} ${yb}Z`, b.c, OL(b.o, 3));
  s += P(T`M${x + hw * 0.45} ${yb - h}L${x + hw - 4} ${yb - h}L${x + hw} ${yb - 36}Q${x + hw + 4} ${yb - 6} ${x + hw + 26} ${yb - 1}L${x + hw * 0.6} ${yb - 1}Q${x + hw * 0.55} ${yb - 60} ${x + hw * 0.45} ${yb - h}Z`, b.d, ' opacity="0.45"');
  s += S(T`M${x - hw + 14} ${yb - h + 16}Q${x - hw + 10} ${yb - 70} ${x - hw + 16} ${yb - 24}M${x + hw - 22} ${yb - h + 20}Q${x + hw - 16} ${yb - 80} ${x + hw - 20} ${yb - 30}`, b.d, 2.2, ' opacity="0.6"');
  // cut top with rings + moss
  s += E(x, yb - h, hw - 3, 12, b.l, OL(b.o, 2.6)) + E(x, yb - h, hw * 0.62, 7.5, 'none', OL(b.c, 1.6)) + E(x, yb - h, hw * 0.3, 3.6, 'none', OL(b.c, 1.6));
  const tc = bushC(m);
  s += lobes([[x - hw + 4, yb - h + 4, 13], [x - hw + 22, yb - h - 2, 10], [x + hw - 12, yb - h + 2, 11]], tc.c, tc.s, tc.l, tc.o, 3);
  // arched door
  const dw = 26, dTop = yb - 66;
  const doorC = tone(m, '#8E7A63'), doorD = dk(doorC, 0.35);
  s += P(T`M${x - dw - 5} ${yb}L${x - dw - 5} ${dTop}A${dw + 5} ${dw + 5} 0 0 1 ${x + dw + 5} ${dTop}L${x + dw + 5} ${yb}Z`, b.o);
  s += P(T`M${x - dw} ${yb}L${x - dw} ${dTop}A${dw} ${dw} 0 0 1 ${x + dw} ${dTop}L${x + dw} ${yb}Z`, doorC);
  s += S(T`M${x - dw * 0.35} ${dTop - dw * 0.92}L${x - dw * 0.35} ${yb}M${x + dw * 0.35} ${dTop - dw * 0.92}L${x + dw * 0.35} ${yb}`, doorD, 1.6, ' opacity="0.7"');
  s += C(x + dw * 0.62, yb - 30, 3.4, tone(m, '#E9DDBF'), OL(doorD, 1.2));
  // round window with a warm (pale) glow + cross
  const win = m === 'rain' ? '#F7E6B6' : '#F2E6C4';
  s += C(x - 40, yb - 88, 16, 'url(#wg)', ' opacity="0.9"') + C(x - 40, yb - 88, 11, win, OL(b.o, 2.4)) + S(T`M${x - 51} ${yb - 88}L${x - 29} ${yb - 88}M${x - 40} ${yb - 99}L${x - 40} ${yb - 77}`, b.o, 1.8);
  // stepping stones + a tiny mushroom by the door
  const st = tone(m, '#C3BEB0');
  s += E(x - 4, yb + 4, 20, 5, st, OL(dk(st, 0.3), 1.4)) + E(x + 30, yb + 6, 11, 3.5, st, OL(dk(st, 0.3), 1.2));
  s += mushroom(m, x + hw + 18, yb, 26, 22, true, 0.5);
  return s;
}
function mid(m) {
  const rain = m === 'rain', breezy = m === 'breezy';
  let o = '', defs = '';
  const glowA = rain ? 0.95 : m === 'sunny' ? 0.5 : 0.6;
  defs += rg('mg', [[0, MUSH.glow, 0.85], [0.45, MUSH.glow, 0.35], [1, MUSH.glow, 0]]);
  defs += rg('wg', [[0, '#FFF0C8', 1], [1, '#FFF0C8', 0]]);
  const tc = bushC(m);
  // ---- back bush bank (soft, lightly hazed), circles every 40 px → periodic
  const bb = tone(m, BUSH.c, 0.22), bbS = tone(m, BUSH.s, 0.22), bbL = tone(m, BUSH.l, 0.2);
  let bank = '';
  for (let k = 0; k < 30; k++) { const x = k * 40 + 20, r = 24 + hsh(k, 7) * 18, y = BANK(x) - r * 0.45 + 4; bank += both(xx => C(xx, y, r, bbS) + C(xx - r * 0.1, y - r * 0.14, r * 0.86, bb) + C(xx - r * 0.35, y - r * 0.4, r * 0.3, bbL, ' opacity="0.6"'), x, r); }
  o += bank;
  // ---- young trees
  for (const [x, h, k, sd] of [[140, 170, 0.9, 1], [1010, 190, 0.95, 3]]) o += both(xx => youngTree(m, xx, BANK(x) + 18, h, k, sd), x, 70 * k);
  // ---- bushes in front of the bank
  for (const [x, k] of [[60, 0.9], [300, 0.75], [700, 0.9], [1120, 0.8]]) {
    o += both(xx => lobes([[xx - 26 * k, 300 - 16 * k, 20 * k], [xx, 300 - 28 * k, 28 * k], [xx + 26 * k, 300 - 16 * k, 21 * k], [xx - 6 * k, 300 - 10 * k, 22 * k]], tc.c, tc.s, tc.l, tc.o, 4), x, 52 * k);
  }
  // ---- solid bank (covers the far layer's bottom) + rim highlight
  const bk = tone(m, mix(MOSS.sunny, BUSH.c, 0.35));
  { const pts = [[0, 340]]; for (let x = 0; x <= W; x += 6) pts.push([x, BANK(x)]); pts.push([W, 340]); o += P(poly(pts), bk); }
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, BANK(i * 6) + 0.5])), lt(bk, 0.2), 2, ' opacity="0.7"');
  // ---- tree-stump house (x 840), mushrooms, ferns
  o += stumpHouse(m, 840, 318);
  const lean = breezy ? 0.22 : 0;
  for (const [x, k, sd] of [[240, 0.95, 1], [420, 0.8, 2], [640, 1.0, 3], [990, 0.85, 4], [1170, 0.9, 5]]) o += both(xx => fern(m, xx, 322, k, lean, sd), x, 110 * k);
  for (const [x, k, sd] of [[330, 1.0, 11], [740, 0.8, 12], [1090, 0.9, 13]]) o += both(xx => mushCluster(m, xx, 322, k, glowA, sd), x, 80 * k);
  // ---- grass tufts along the bottom
  let gb = ''; for (let k = 0; k < 100; k++) { const x = k * 12 + 3, y = 336 - (k % 3) * 2, h = 7 + (k * 7) % 6; gb += both(xx => T`M${xx} ${y}l${-2} ${-h}M${xx + 3} ${y}l${2} ${-h + 1}`, x, 6); }
  o += S(gb, dk(bk, 0.12), 1.6, ' opacity="0.6"');
  // ---- calm haze over the band behind the tea things (rows 270…340)
  defs += lg('cz', [[0, HAZE[m], 0], [0.6, HAZE[m], rain ? 0.32 : 0.4], [1, HAZE[m], rain ? 0.4 : 0.5]], V);
  o += R(0, 262, W, 78, 'url(#cz)');
  if (rain) {   // drips shining on the leaves
    let g = ''; for (let k = 0; k < 30; k++) { const x = k * 40 + 11, y = 170 + (k * 37) % 120; g += both(xx => E(xx, y, 1.6, 2.6, '#E6EEF2'), x, 3); }
    o += `<g opacity="0.6">${g}</g>`;
  }
  if (m === 'rainbow') {
    let g = ''; for (let k = 0; k < 36; k++) { const x = k * 33 + (k * 7) % 13, y = 90 + (k * 41) % 200; g += both(xx => E(xx, y, 2.4, 1.3, '#FFFFFF') + C(xx + 3, y - 2, 0.9, '#FFFFFF'), x, 4); }
    o += `<g opacity="0.75">${g}</g>`;
  }
  return svg(1200, 340, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): mossy clearing; CALM rows 40…150 stay plain (table band)
// =====================================================================================================
function ground(m) {
  const rain = m === 'rain', r = rng(301 + MOODS.indexOf(m));
  const top = MOSS[m], bot = GROUND_BOTTOM[m];
  let o = '', defs = '';
  const edge = x => GROUND_LINE - 2 + wave(x, [[6, 1.2, 0.3], [25, 1, 1.1]]);
  defs += lg('gr', [[0, lt(top, 0.06)], [0.3, top], [0.75, mix(top, bot, 0.6)], [1, bot]], V);
  { const pts = [[0, 260]]; for (let x = 0; x <= W; x += 6) pts.push([x, edge(x)]); pts.push([W, 260]); o += P(poly(pts), 'url(#gr)'); }
  let tf = ''; for (let k = 0; k < 75; k++) { const x = k * 16 + 5 + (k * 5) % 7; tf += both(xx => T`M${xx - 5} ${edge(x) + 2}Q${xx - 4} ${edge(x) - 4} ${xx - 2} ${edge(x) - 7}Q${xx} ${edge(x) - 2} ${xx + 1} ${edge(x) - 8}Q${xx + 3} ${edge(x) - 3} ${xx + 6} ${edge(x) - 5}L${xx + 6} ${edge(x) + 2}Z`, x, 7); }
  o += P(tf, lt(top, 0.05));
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, edge(i * 6) + 1])), lt(top, 0.2), 2, ' opacity="0.6"');
  const okY = y => y < CALM[0] - 4 || y > CALM[1] + 6;
  // moss mottles (very soft inside the calm rows)
  for (let i = 0; i < 24; i++) { const x = r() * W, y = 40 + r() * 215, rx = 40 + r() * 60, ry = 6 + r() * 7, calm = !okY(y); o += both(xx => E(xx, y, rx, ry, (i % 3 ? dk(top, 0.08) : lt(top, 0.1)), ` opacity="${calm ? 0.18 : 0.35}"`), x, rx); }
  // puddles (rain) — before clover so tufts overlap their rims
  if (rain) {
    const pw = '#93A4AE', pl = '#BFCCD2';
    for (const [x, y, rx, ry] of [[160, 196, 74, 12], [520, 222, 96, 14], [880, 190, 60, 10], [1120, 230, 70, 12], [360, 60, 40, 6]]) {
      o += both(xx => E(xx, y + 2, rx + 6, ry + 3, dk(top, 0.15), ' opacity="0.6"') + E(xx, y, rx, ry, pw) + E(xx - rx * 0.15, y - ry * 0.25, rx * 0.6, ry * 0.35, pl, ' opacity="0.8"') +
        E(xx + rx * 0.3, y + ry * 0.2, rx * 0.22, ry * 0.32, 'none', OL('#DDE6EA', 1.4) + ' opacity="0.8"') + S(T`M${xx - rx * 0.5} ${y - 1}L${xx - rx * 0.2} ${y - 1}`, '#EEF3F4', 1.8, ' opacity="0.8"'), x, rx + 8);
    }
  }
  // clover patches
  const cl = tone(m, '#9AB27D'), cld = dk(cl, 0.16);
  const clover = (x, y, s0) => { let s = ''; for (let a = 0; a < 3; a++) { const an = -Math.PI / 2 + a * 2.094, cx = x + Math.cos(an) * 3.4 * s0, cy = y + Math.sin(an) * 2.8 * s0; s += C(cx, cy, 3.2 * s0, a === 1 ? cld : cl); } return s + C(x, y, 1, cld); };
  for (let i = 0; i < 52; i++) { const x = r() * W, y = 36 + r() * 220, s0 = 1 + r() * 0.5; if (!okY(y)) continue; o += both(xx => clover(xx, y, s0) + clover(xx + 10, y + 3, 0.85) + (i % 2 ? clover(xx - 8, y + 5, 0.75) : ''), x, 18); }
  // tiny muted flowers (cream, pale lilac-grey, blush cream, pale butter)
  const fl = rain ? ['#D8DCD8', '#BDB8C8', '#D2C6C2', '#D4D0B8'] : ['#F4EEDF', '#D8CEDD', '#EBD8D0', '#EFE4C0'];
  const stem = tone(m, '#88A274');
  for (let i = 0; i < 34; i++) {
    const x = r() * W, y = 40 + r() * 214; if (!okY(y)) continue;
    const col = fl[i % 4], n = 2 + (i % 3);
    o += both(xx => { let s = ''; for (let k = 0; k < n; k++) { const fx = xx + (k - n / 2) * 7 + (k % 2) * 2, fy = y - (k % 2) * 5; s += S(T`M${fx} ${fy + 8}L${fx} ${fy}`, stem, 1.6); for (let p = 0; p < 5; p++) { const a = p * 1.2566; s += C(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 1.8, col); } s += C(fx, fy, 1.3, rain ? '#C8C4AE' : '#E0CD98'); } return s; }, x, 22);
  }
  // fallen leaves (breezy)
  if (m === 'breezy') {
    const lc = ['#B6B67E', '#C2AE84', '#A9B47C'];
    for (let i = 0; i < 16; i++) { const x = r() * W, y = 36 + r() * 220, a = r() * 180; if (!okY(y)) continue; const c = lc[i % 3]; o += both(xx => P(T`M${xx - 7} ${y}Q${xx} ${y - 5} ${xx + 7} ${y}Q${xx} ${y + 5} ${xx - 7} ${y}Z`, c, ` transform="rotate(${f(a)} ${f(xx)} ${f(y)})"` + OL(dk(c, 0.25), 1)), x, 9); }
  }
  // grass strokes (sparser in the calm rows)
  let gs = ''; for (let i = 0; i < 100; i++) { const x = r() * W, y = 40 + r() * 215, h = 5 + r() * 6; if (!okY(y) && r() < 0.8) continue; gs += both(xx => T`M${xx} ${y}l-2 ${-h}M${xx + 2} ${y}l1 ${-h * 0.9}M${xx + 4} ${y}l3 ${-h * 0.7}`, x, 6); }
  o += S(gs, dk(top, 0.18), 1.4, ' opacity="0.5"');
  // pebbles near the bottom
  const peb = tone(m, '#C3BEB2'), pebd = dk(peb, 0.28);
  for (let k = 0; k < 20; k++) { const x = k * 60 + 20 + (k * 13) % 23, y = 196 + (k * 17) % 52, s0 = 2.6 + (k * 7) % 3; o += both(xx => E(xx, y, s0 * 1.4, s0, peb, OL(pebd, 1.2)) + E(xx - s0 * 0.4, y - s0 * 0.3, s0 * 0.5, s0 * 0.3, lt(peb, 0.4)), x, 6); }
  if (m === 'rainbow') {   // wet glints on the moss
    let g = ''; for (let k = 0; k < 30; k++) { const x = k * 40 + (k * 11) % 23, y = 160 + (k * 29) % 96; g += both(xx => P(T`M${xx} ${y - 4}L${xx + 1} ${y - 1}L${xx + 4} ${y}L${xx + 1} ${y + 1}L${xx} ${y + 4}L${xx - 1} ${y + 1}L${xx - 4} ${y}L${xx - 1} ${y - 1}Z`, '#FFFFFF'), x, 5); }
    o += `<g opacity="0.8">${g}</g>`;
  }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// TRUNKS (0 0 220 900, bottom anchor (110, 900)): big friendly framing trees; the vine ties on the branch stub
// =====================================================================================================
function trunk(side) {
  // drawn as the LEFT trunk (branch stub pointing right, tie (150, 140)); the right one is a different seed, mirrored
  const sd = side === 'l' ? 1 : 2;
  const b = BARK, c = b.c, d = b.d, l = b.l, o = b.o;
  const tc = { c: BUSH.c, s: BUSH.s, l: BUSH.l, o: BUSH.o };
  let s = '';
  // roots + trunk outline: trunk body x ≈ 56…164 (narrower up top), flaring roots to 0…220 at the bottom
  const wob = sd === 1 ? 0 : 4;
  const body = T`M${2} ${900}Q${30} ${888} ${44} ${852}Q${56} ${800} ${58 + wob} ${700}L${64} ${300}Q${66} ${200} ${68} ${110}L${152} ${110}Q${154} ${200} ${156} ${300}L${160 - wob} ${700}Q${164} ${800} ${176} ${852}Q${190} ${888} ${218} ${900}Z`;
  s += E(110, 898, 116, 8, '#2E3A34', ' opacity="0.16"');
  s += P(body, c, OL(o, 4));
  // branch stub (to the right) at y ≈ 140, tie point (150, 140) sits on it
  s += P(T`M${148} ${124}Q${176} ${120} ${204} ${106}Q${214} ${102} ${215} ${112}Q${215} ${121} ${205} ${125}Q${178} ${138} ${150} ${160}Z`, c, OL(o, 3.4));
  s += S(T`M${158} ${136}Q${180} ${128} ${200} ${118}`, d, 2, ' opacity="0.6"');
  s += E(210, 114, 4, 6, l, OL(o, 2) + ' transform="rotate(-20 210 114)"');
  s += C(210, 114, 1.6, d);
  // cel shade on the right side + highlight strip on the left
  s += P(T`M${118} ${112}L${152} ${112}Q${154} ${200} ${156} ${300}L${160 - wob} ${700}Q${164} ${800} ${176} ${852}Q${188} ${884} ${212} ${897}L${150} ${897}Q${140} ${860} ${136} ${800}Q${128} ${600} ${122} ${400}Z`, d, ' opacity="0.42"');
  s += S(T`M${80} ${140}Q${78} ${400} ${76} ${700}Q${72} ${800} ${60} ${860}`, l, 7, ' opacity="0.55"');
  // bark grooves (wavy, per seed)
  let gr = '';
  for (let i = 0; i < 6; i++) {
    const x0 = 78 + i * 14 + (hsh(sd, i) - 0.5) * 8, y0 = 150 + hsh(i, sd) * 120, y1 = 620 + hsh(sd + 4, i) * 220;
    gr += T`M${x0} ${y0}Q${x0 + (hsh(i, sd + 9) - 0.5) * 18} ${(y0 + y1) / 2} ${x0 + (i - 2.5) * 3} ${y1}`;
  }
  s += S(gr, d, 2.6, ' opacity="0.6"');
  // a knot hole (different height per side)
  const ky = sd === 1 ? 470 : 560, kx = sd === 1 ? 104 : 118;
  s += E(kx, ky, 15, 21, d, OL(o, 3)) + E(kx, ky + 2, 9, 14, mix(o, '#2E3A34', 0.3)) + S(T`M${kx - 12} ${ky - 12}Q${kx} ${ky - 26} ${kx + 12} ${ky - 12}`, l, 2.4, ' opacity="0.7"');
  // root lines
  s += S(T`M${48} ${846}Q${36} ${880} ${14} ${896}M${172} ${846}Q${186} ${878} ${206} ${896}M${96} ${860}Q${90} ${884} ${82} ${898}M${130} ${860}Q${136} ${884} ${144} ${898}`, d, 2.6, ' opacity="0.7"');
  // moss patches (sage) on the roots + a little on the stub side
  const ms = { c: '#9FB27E', s: '#83975F', l: '#BCCA9A', o: '#66784C' };
  s += lobes([[30, 884, 12], [48, 874, 10], [182, 886, 11], [196, 892, 9], [64, 890, 8]], ms.c, ms.s, ms.l, ms.o, 2.5);
  s += lobes(sd === 1 ? [[70, 620, 9], [66, 640, 7]] : [[150, 380, 8], [154, 398, 6]], ms.c, ms.s, ms.l, ms.o, 2.4);
  // a tiny cream mushroom pair at the roots (left trunk) / a fern sprig (right trunk)
  if (sd === 1) s += mushroom('sunny', 176, 892, 26, 22, false, 0) + mushroom('sunny', 194, 896, 18, 15, true, 0);
  else s += fern('sunny', 34, 896, 0.42, -0.1, 7);
  // leafy crown at the top (rows 0…130) so the trunk never ends in mid-air
  const L = [[36, 88, 32], [66, 60, 40], [110, 50, 44], [156, 62, 40], [186, 90, 30], [86, 98, 32], [136, 100, 32], [84, 30, 26], [134, 30, 26], [110, 74, 40]];
  s += lobes(L.map(([x, y, r], i) => [x, y + (sd === 2 ? (i % 2 ? 4 : -3) : 0), r]), tc.c, tc.s, tc.l, tc.o, 4);
  // hanging leaf tufts under the crown
  s += P(T`M${70} ${118}Q${66} ${138} ${74} ${150}Q${80} ${136} ${78} ${118}Z`, tc.s) + P(T`M${136} ${120}Q${134} ${142} ${140} ${152}Q${146} ${138} ${144} ${120}Z`, tc.s);
  const body2 = side === 'l' ? s : `<g transform="translate(220 0) scale(-1 1)">${s}</g>`;
  const tie = side === 'l' ? TRUNK.tieL : TRUNK.tieR;
  return svg(220, 900, body2, rg('mg', [[0, MUSH.glow, 0.8], [1, MUSH.glow, 0]]), `tie ${tie[0]} ${tie[1]} (anchor 110 900)`);
}

// =====================================================================================================
// SUN, RAINBOW, CLOUDS
// =====================================================================================================
function sun() {
  const defs = rg('h', [[0, '#FFF8DE', 0.9], [0.45, '#FFF4D4', 0.4], [1, '#FFF4D4', 0]]) + rg('d', [[0, '#FFFCEE'], [0.7, '#FFF3D2'], [1, '#F6E6BC']], ' cx="0.4" cy="0.38" r="0.65"');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 60, r1 = i % 2 ? 76 : 86; rays += T`M${100 + Math.cos(a) * r0} ${100 + Math.sin(a) * r0}L${100 + Math.cos(a) * r1} ${100 + Math.sin(a) * r1}`; }
  return svg(200, 200, C(100, 100, 99, 'url(#h)') + S(rays, '#FFF3D0', 9, ' opacity="0.8"') + C(100, 100, 50, '#F4E4B8') + C(100, 100, 46, 'url(#d)') +
    E(86, 82, 14, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-30 86 82)"'), defs);
}
function rainbow() {
  // soft pastel arc, centre (600, 600), outer r 560; the bottom fades out (mask) so it melts into the trees
  const bands = ['#F2C2BE', '#F4D6B4', '#F2E8B8', '#CBE5C6', '#BED8EC', '#D3C8E6'];
  const defs = lg('fade', [[0, '#FFFFFF', 1], [0.6, '#FFFFFF', 1], [1, '#FFFFFF', 0]], V) + `<mask id="mk"><rect width="1200" height="600" fill="url(#fade)"/></mask>`;
  let o = '<g mask="url(#mk)" opacity="0.62">';
  const r0 = 556, bw = 20;
  o += `<path d="M${f(600 - r0 - 10)} 600A${f(r0 + 10)} ${f(r0 + 10)} 0 0 1 ${f(600 + r0 + 10)} 600" fill="none" stroke="#FFFFFF" stroke-width="10" opacity="0.4"/>`;
  bands.forEach((c, i) => { const r = r0 - i * bw - bw / 2; o += `<path d="M${f(600 - r)} 600A${f(r)} ${f(r)} 0 0 1 ${f(600 + r)} 600" fill="none" stroke="${c}" stroke-width="${f(bw + 0.8)}"/>`; });
  o += `<path d="M${f(600 - r0 + 6 * bw + 8)} 600A${f(r0 - 6 * bw - 8)} ${f(r0 - 6 * bw - 8)} 0 0 1 ${f(600 + r0 - 6 * bw - 8)} 600" fill="none" stroke="#FFFFFF" stroke-width="12" opacity="0.25"/>`;
  return svg(1200, 600, o + '</g>', defs, 'arc centre (600,600), outer radius 566, bottom 40 % fades out');
}
function cloud(puffs, bottom, x0, x1, CL) {
  const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
  const hb = 30, d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.sh2}" opacity="0.95"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.sh}" transform="translate(0 -6)"/><path d="${d}" fill="${CL.base}" transform="translate(-3 -13)"/></g>`;
  return svg(300, 140, o);
}
const WHITE = { base: '#FFFFFF', sh: '#F3F4EE', sh2: '#E2E7DE' };
const RAINCL = { base: '#C9D0D2', sh: '#B7C0C3', sh2: '#9DA8AE' };
const clouds = () => ({
  cloud_a: cloud([[66, 96, 28], [116, 72, 40], [172, 64, 46], [226, 86, 34], [150, 100, 30]], 128, 26, 276, WHITE),
  cloud_b: cloud([[56, 104, 22], [96, 88, 30], [146, 82, 36], [198, 90, 28], [244, 104, 20]], 126, 30, 272, WHITE),
  cloud_rain: cloud([[54, 98, 30], [106, 70, 42], [168, 60, 48], [228, 82, 38], [268, 102, 24], [140, 102, 32]], 132, 18, 290, RAINCL),
});

// =====================================================================================================
// PARTICLES (0 0 32 32; raindrop 0 0 12 32). White / neutral ones are tinted by code (sparkle, star, confetti, dot, puff).
// =====================================================================================================
function particles() {
  const p = {};
  const S32 = (body, defs) => svg(32, 32, body, defs);
  p.mote = S32(C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  p.sparkle = S32(C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF8E6') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFFFFF', 0.6], [1, '#FFFFFF', 0]]));
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S32(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  // leaf: muted olive; leaf_b: a rounder dry-sage leaf with a tan tip
  p.leaf = S32(`<g transform="rotate(-30 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 28Q12 26 9 20Q6 10 16 3Z', '#B4B87E', OL('#7C8052', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 28Q20 16 16 3Z', '#9EA26A', ' opacity="0.8"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#7C8052', 1.1) +
    E(12.5, 11, 2, 3.4, '#D8D8B0', ' opacity="0.8"') + `</g>`);
  p.leaf_b = S32(`<g transform="rotate(25 16 16)">` + P('M6 20Q6 8 18 5Q27 4 27 9Q28 20 16 25Q9 27 6 20Z', '#A9B98C', OL('#73835A', 1.6)) +
    P('M27 9Q28 20 16 25Q9 27 6 20Q16 20 27 9Z', '#93A576', ' opacity="0.85"') + S('M4 27L9 21Q15 14 24 8', '#73835A', 1.3) + P('M24 5Q27 4 27 9Q25 7 24 5Z', '#C9B48A') + `</g>`);
  // petal: blush-cream (much paler than answer pink)
  p.petal = S32(`<g transform="rotate(-25 16 16)">` + P('M16 4Q25 8 24 17Q22 26 16 28Q10 26 8 17Q7 8 16 4Z', '#FAEDE6', OL('#DDC2B6', 1.4)) +
    P('M16 28Q22 26 24 17Q23 24 16 28Z', '#EDD6CC') + S('M16 26Q15.4 18 16 9', '#E3C8BC', 1.1) + E(12.6, 11.5, 2.2, 3.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // raindrop (0 0 12 32): pale blue-grey streak, head at the bottom
  p.raindrop = svg(12, 32, P('M6 1Q8.2 14 8.8 22Q9.2 30 6 30Q2.8 30 3.2 22Q3.8 14 6 1Z', 'url(#rd)') + E(5, 24, 1, 2.2, '#FFFFFF', ' opacity="0.8"'),
    lg('rd', [[0, '#D6E2EA', 0], [0.55, '#C2D4E0', 0.7], [1, '#A9C0D0', 1]], V));
  p.splash = S32(E(16, 25, 11, 3.4, 'none', ' stroke="#B4C8D6" stroke-width="2" opacity="0.8"') +
    P('M9 23Q7 15 5 12Q10 15 12 22ZM23 23Q25 15 27 12Q22 15 20 22ZM14.5 22Q15 14 16 9Q17 14 17.5 22Z', '#BDD0DC') + C(5, 9, 1.8, '#BDD0DC') + C(27, 9, 1.8, '#BDD0DC') + C(16, 5.5, 2, '#CCDCE6'));
  p.puff = S32(C(11, 18, 8, 'url(#pf)') + C(19, 14, 10, 'url(#pf)') + C(21, 21, 7, 'url(#pf)'), rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F3F3EF', 0.8], [1, '#E6E6E0', 0]]));
  // dust: soft gold fairy dust (glow + bright core + tiny twinkle)
  p.dust = S32(C(16, 16, 14, 'url(#ds)') + P('M16 8Q16.8 15.2 24 16Q16.8 16.8 16 24Q15.2 16.8 8 16Q15.2 15.2 16 8Z', '#FFF6D6') + C(16, 16, 2.6, '#FFFFFF'),
    rg('ds', [[0, '#FFE7A3', 0.95], [0.4, '#FFE2A0', 0.45], [1, '#FFE2A0', 0]]));
  // seed: a dandelion seed (pappus umbrella on a thin stalk, tiny brown seed)
  let rays = ''; for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; rays += T`M16 13L${16 + Math.cos(a) * 11} ${13 + Math.sin(a) * 9}`; }
  p.seed = S32(S(rays, '#FFFFFF', 1.1, ' opacity="0.95"') + C(16, 13, 10, 'url(#sd)') + S('M16 13L16 27', '#E6E0CC', 1.2) + E(16, 28, 1.4, 2.4, '#A8916E'),
    rg('sd', [[0, '#FFFFFF', 0.5], [1, '#FFFFFF', 0]]));
  p.confetti_a = S32(`<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  p.confetti_b = S32(S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  p.dot = S32(C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  return p;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  const E2 = { trunk_l: trunk('l'), trunk_r: trunk('r'), sun: sun(), rainbow: rainbow(), ...clouds() };
  for (const m of MOODS) { E2['far_' + m] = far(m); E2['mid_' + m] = mid(m); E2['ground_' + m] = ground(m); }
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg') && !E2[fn.slice(0, -4)]) fs.unlinkSync(path.join(env, fn));
  for (const k of Object.keys(E2)) wr(env, k, E2[k]);
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no external refs, ≤ 1 blur, width/height = viewBox
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|<image|href=|url\((?!#)|@import|font-family|feGaussianBlur[\s\S]*feGaussianBlur/.test(s)) throw new Error('SVG rule broken in ' + fn);
    const m = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/); if (!m || m[1] !== m[3] || m[2] !== m[4]) throw new Error('size != viewBox in ' + fn);
  }
  console.log('wrote env: ' + Object.keys(E2).join(', ') + '\nparticles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, MOSS, GROUND_BOTTOM, RIM, HAZE, FAR_BASE, MID_BASE, MID_BANK, GROUND_LINE, CALM, TRUNK };
if (require.main === module) main();
