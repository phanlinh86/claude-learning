// Nim's River Hop: woodland-brook environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,bush,reeds,flowers,tree}_{spring,summer,autumn,winter}.svg, env/rock.svg,
// env/{sun,moon,cloud_a,cloud_b}.svg and game/assets/default/particles/*.svg (every particle the bubble game had + the new
// dragonfly). Any other (old) env file — cushion_*, ground_* — is deleted.  (DESIGN §3, §4.4)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Look: a calm, slightly warm woodland. far = two rows of distant wooded hills (tiny tree bumps on the ridges, hazed into
// the sky) with a little wooden water-mill cottage on the front ridge; mid = a tree line of round trees + pines (season
// colours, a hazier back row) standing on a meadow band in the exact bank-grass colour, so the canvas-drawn banks
// (NH.RiverArt.drawBanks) continue it without a seam. Bank sprites (bush, reeds, rock, flowers, tree) are bottom-centre
// anchored. The water itself is canvas code (river_art.js), never an SVG.
//
// Tiling: far and mid are 1200 wide. Wavy lines are integer harmonics over 1200, props crossing x = 0 / 1200 are drawn
// twice (x and x ∓ 1200): both edges match pixel for pixel (docs/art/env_seams.png).
// Colour rule (DESIGN §3): muted, low chroma, slightly warm; nothing in a saturated answer hue (red #E84A4A, blue #3C8DE8,
// yellow #FFD23F, green #4CC26B, orange #FF9A2E, purple #8E44AD). Greens are sage / olive, flowers are pale.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far  0 0 1200 720 : transparent top; back ridge tops ≈ 470…560, front ridge ≈ 560…620, mill on the front ridge
//                       (x ≈ 780), solid from FAR_SOLID = 640 down. Row FAR_BASE = 700 sits on mid row MID_FAR = 248.
//   mid  0 0 1200 300 : transparent top; back trees tops ≈ 110…170, front trees tops ≈ 40…150, tree feet ≈ 248…258,
//                       meadow band MID_BAND = 244…300 in BANK[m].grass. Row MID_BANK = 262 = the bank top line on screen.
//   bush 0 0 200 140 (anchor 100,136) · reeds 0 0 120 160 (60,156) · rock 0 0 120 80 (60,76) · flowers 0 0 140 70 (70,68)
//   tree 0 0 260 360 (anchor 130,354; canopy centre ≈ (130,140), the fruit hangs under the canopy at ≈ (130, 250))
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const FAR_SOLID = 640, FAR_BASE = 700, MID_FAR = 248, MID_BAND = 244, MID_BANK = 262;
const SPRITES = { bush: [200, 140, 100, 136], reeds: [120, 160, 60, 156], rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], tree: [260, 360, 130, 354] };
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
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);   // periodic
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rot = (x, y, a) => ` transform="rotate(${f(a)} ${f(x)} ${f(y)})"`;
/** closed path of a periodic ridge y(x) from x 0..W, filled down to yBottom (step 10 px, exactly periodic) */
const ridge = (yf, yBottom) => { let d = `M-4 ${f(yBottom)}L-4 ${f(yf(0))}`; for (let x = 0; x <= W; x += 10) d += `L${f(x)} ${f(yf(x))}`; return d + `L${W + 4} ${f(yf(W))}L${W + 4} ${f(yBottom)}Z`; };

// ---------------- palettes (DESIGN §3) ----------------
const SKY = {
  spring: [[0, '#CFE6F5'], [1, '#F6F1E4']],
  summer: [[0, '#8CCBEA'], [1, '#E6F5F6']],
  autumn: [[0, '#F1C893'], [1, '#FBEBD3']],
  winter: [[0, '#B9C8E2'], [1, '#EEF2F8']],
};
const skyTop = m => SKY[m][0][1], skyBot = m => SKY[m][1][1];
const HAZE = { spring: mix('#F6F1E4', '#CFE6F5', 0.3), summer: mix('#E6F5F6', '#8CCBEA', 0.25), autumn: mix('#FBEBD3', '#F1C893', 0.25), winter: mix('#EEF2F8', '#B9C8E2', 0.3) };
// bank grass (exact DESIGN tones) + the canvas bank code's companions (river_art.js keeps a copy of this table)
const BANK = {
  spring: { grass: '#9CC98A', light: '#B4D8A2', dark: '#82B272', tuft: '#74A565' },
  summer: { grass: '#86B86E', light: '#9FCA88', dark: '#6FA25A', tuft: '#62944F' },
  autumn: { grass: '#B9A764', light: '#CDBD7E', dark: '#A08E52', tuft: '#8F7E47' },
  winter: { grass: '#F1F4F8', light: '#FFFFFF', dark: '#C9D4E2', tuft: '#B7C4D4' },
};
const EARTH = { base: '#9A7B58', dark: '#6E5640', light: '#B39470' };
// trees per season: round canopy [lit, shade, outline], second round kind, pine [lit, shade, outline], trunk, snow?
const TREES = {
  spring: { round: ['#F2CFD9', '#E2B3C2', '#B98C9C'], round2: ['#A9CC92', '#8FB67C', '#6E9460'], pine: ['#7FA88A', '#6A9477', '#527660'], trunk: '#8E6E56', dots: '#FBEFF3' },
  summer: { round: ['#8DBB82', '#76A66E', '#5A8556'], round2: ['#9FC48C', '#86AF77', '#668E5B'], pine: ['#6E9C78', '#5B8766', '#476C52'], trunk: '#866650', dots: null },
  autumn: { round: ['#D9A06A', '#C2875A', '#966546'], round2: ['#C47E55', '#AB6A47', '#7F4F37'], pine: ['#7F9A78', '#6B8566', '#536A51'], trunk: '#866650', dots: '#E8BE8A' },
  winter: { round: ['#E9EEF5', '#CBD5E3', '#9EABBE'], round2: ['#E9EEF5', '#CBD5E3', '#9EABBE'], pine: ['#7E9AA0', '#6A858C', '#52696F'], trunk: '#7E6C62', dots: null, snow: true },
};

// =====================================================================================================
// building blocks
// =====================================================================================================
/** a round tree standing at (x, yb): trunk + 3-blob canopy (outline, shade, lit, highlight). c = [lit, shade, outline] */
function roundTree(x, yb, r, c, trunk, { ow = 3, dots = null, seed = 1, haze = null } = {}) {
  const tn = col => (haze ? mix(col, haze[0], haze[1]) : col);
  const lit = tn(c[0]), sh = tn(c[1]), ol = tn(c[2]), tr = tn(trunk);
  const th = r * 0.9, tw = Math.max(3, r * 0.22), cy = yb - th - r * 0.55;
  const blobs = [[x, cy - r * 0.18, r], [x - r * 0.62, cy + r * 0.22, r * 0.72], [x + r * 0.64, cy + r * 0.2, r * 0.74]];
  let s = R(x - tw / 2, yb - th - 2, tw, th + 3, tr, ow ? ` rx="${f(tw / 2)}"${OL(tn(mix(trunk, '#3A2A20', 0.35)), ow * 0.7)}` : '');
  if (ow) for (const [bx, by, br] of blobs) s += C(bx, by, br + ow / 2, ol);
  for (const [bx, by, br] of blobs) s += C(bx, by, br, sh);
  for (const [bx, by, br] of blobs) s += C(bx - br * 0.1, by - br * 0.13, br * 0.84, lit);
  s += E(x - r * 0.34, cy - r * 0.56, r * 0.28, r * 0.14, '#FFFFFF', ' opacity="0.35"' + rot(x - r * 0.34, cy - r * 0.56, -28));
  if (dots) for (let k = 0; k < 7; k++) { const a = hsh(k, seed) * 6.28, d = r * (0.25 + 0.6 * hsh(k, seed + 3)); s += C(x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, Math.max(1.5, r * 0.07), tn(dots), ' opacity="0.9"'); }
  return s;
}
/** a soft pine of 3 tiers (rounded triangles); snow = white caps */
function pine(x, yb, h, c, trunk, { ow = 3, snow = false, haze = null } = {}) {
  const tn = col => (haze ? mix(col, haze[0], haze[1]) : col);
  const lit = tn(c[0]), sh = tn(c[1]), ol = tn(c[2]);
  const w = h * 0.5, tw = Math.max(3, h * 0.07);
  let s = R(x - tw / 2, yb - h * 0.16, tw, h * 0.16 + 2, tn(trunk));
  const tiers = [[0.18, 0.62, 1], [0.42, 0.86, 0.8], [0.64, 1.06, 0.58]];   // [bottom frac, top frac, width frac]
  let o = '', b = '', l = '', sn = '';
  for (const [t0, t1, wf] of tiers) {
    const y0 = yb - h * t0, y1 = yb - h * t1, ww = w * wf / 2;
    const d = T`M${x - ww} ${y0}Q${x - ww * 0.4} ${y0 + 5} ${x} ${y0 + 4}Q${x + ww * 0.4} ${y0 + 5} ${x + ww} ${y0}L${x} ${y1}Z`;
    if (ow) o += P(d, ol, OL(ol, ow));
    b += P(d, sh, OL(sh, 2));
    l += P(T`M${x - ww * 0.92} ${y0 - 1}Q${x - ww * 0.4} ${y0 + 3} ${x - ww * 0.05} ${y0 + 2}L${x - ww * 0.02} ${y1 + 3}Z`, lit, OL(lit, 1.5));
    if (snow) sn += P(T`M${x - ww * 0.62} ${y0 - (y0 - y1) * 0.38}Q${x - ww * 0.2} ${y0 - (y0 - y1) * 0.3} ${x} ${y0 - (y0 - y1) * 0.34}Q${x + ww * 0.3} ${y0 - (y0 - y1) * 0.28} ${x + ww * 0.6} ${y0 - (y0 - y1) * 0.4}L${x} ${y1 + 1}Z`, '#F7F9FC', OL('#F7F9FC', 2));
  }
  return s + o + b + l + sn;
}
/** a bare winter tree (trunk, forks, snow on branches) */
function bareTree(x, yb, h, trunk, w0, haze = null) {
  const tn = col => (haze ? mix(col, haze[0], haze[1]) : col);
  const br = T`M${x} ${yb}L${x} ${yb - h * 0.7}M${x} ${yb - h * 0.38}L${x - h * 0.3} ${yb - h * 0.72}M${x} ${yb - h * 0.5}L${x + h * 0.32} ${yb - h * 0.86}M${x} ${yb - h * 0.7}L${x - h * 0.1} ${yb - h}M${x} ${yb - h * 0.7}L${x + h * 0.12} ${yb - h * 0.98}M${x - h * 0.18} ${yb - h * 0.58}L${x - h * 0.34} ${yb - h * 0.6}`;
  let s = S(br, tn(trunk), w0);
  const snow = tn('#F7F9FC');
  for (const [dx, dy] of [[-0.3, 0.72], [0.32, 0.86], [-0.1, 1], [0.12, 0.98], [0, 0.7], [-0.34, 0.6]]) s += E(x + dx * h, yb - dy * h - w0 * 0.3, w0 * 1.3, w0 * 0.6, snow);
  return s;
}
/** cottage / water-mill silhouette standing on (x, yb): body, roof, chimney, a window, and a small wheel at the right */
function mill(x, yb, k, body, roof, wheel) {
  let s = '';
  s += C(x + 46 * k, yb - 16 * k, 20 * k, 'none', OL(wheel, 4 * k));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; s += S(T`M${x + 46 * k} ${yb - 16 * k}L${x + 46 * k + Math.cos(a) * 20 * k} ${yb - 16 * k + Math.sin(a) * 20 * k}`, wheel, 2.4 * k); }
  s += R(x - 30 * k, yb - 40 * k, 62 * k, 40 * k, body);
  s += R(x + 12 * k, yb - 70 * k, 8 * k, 20 * k, roof);
  s += P(T`M${x - 38 * k} ${yb - 38 * k}L${x} ${yb - 66 * k}L${x + 40 * k} ${yb - 38 * k}Z`, roof, OL(roof, 3 * k));
  s += R(x - 18 * k, yb - 30 * k, 12 * k, 12 * k, mix(body, '#FFF6DC', 0.55), ` rx="${f(2 * k)}"`);
  s += R(x + 4 * k, yb - 26 * k, 12 * k, 26 * k, mix(body, roof, 0.5), ` rx="${f(2 * k)}"`);
  return s;
}

// =====================================================================================================
// FAR (0 0 1200 720): distant wooded hills + a little mill
// =====================================================================================================
function far(m) {
  const hz = HAZE[m], TR = TREES[m];
  const hill1 = mix(m === 'winter' ? '#C6D2DE' : TR.pine[0], hz, m === 'winter' ? 0.35 : 0.66);
  const hill2 = mix(m === 'winter' ? '#B5C3D1' : (m === 'autumn' ? TR.round[1] : TR.round2[1]), hz, m === 'winter' ? 0.3 : 0.5);
  let o = '';
  // back ridge
  const y1 = x => 520 + wave(x, [[1, 26, 0.6], [2, 18, 2.1], [5, 6, 0.3]]);
  o += P(ridge(y1, 724), hill1);
  // tiny tree bumps along the back ridge
  for (let k = 0; k < 60; k++) { const x = k * 20 + hsh(k, 3) * 8; o += both(xx => C(xx, y1(x) + 4, 7 + hsh(k, 4) * 6, hill1), x, 14); }
  // front ridge
  const y2 = x => 592 + wave(x, [[1, 14, 2.6], [3, 10, 0.9], [4, 5, 1.7]]);
  const millX = 780;
  o += both(xx => mill(xx, y2(millX) + 4, 0.8, mix(m === 'winter' ? '#B9A898' : '#C2A688', hz, 0.42), mix(m === 'winter' ? '#9A8C88' : '#A07C66', hz, 0.42), mix('#9C8470', hz, 0.42)) +
    (m === 'winter' ? P(T`M${xx - 30} ${y2(millX) - 26}L${xx} ${y2(millX) - 49}L${xx + 32} ${y2(millX) - 26}L${xx + 24} ${y2(millX) - 30}L${xx} ${y2(millX) - 44}L${xx - 22} ${y2(millX) - 30}Z`, mix('#FFFFFF', hz, 0.2)) : ''), millX, 60);
  o += P(ridge(y2, 724), hill2);
  for (let k = 0; k < 40; k++) { const x = k * 30 + hsh(k, 7) * 12; if (Math.abs(x - millX) < 70) continue; o += both(xx => C(xx, y2(x) + 6, 10 + hsh(k, 8) * 8, hill2), x, 20); }
  if (m === 'winter') for (let k = 0; k < 30; k++) { const x = k * 40 + 8; o += both(xx => E(xx, y2(x) + 2, 14, 4, mix('#FFFFFF', hz, 0.25), ' opacity="0.8"'), x, 16); }
  o += R(-4, FAR_SOLID, W + 8, 84, hill2);
  return svg(1200, 720, o, '', `sky ${skyTop(m)} ${skyBot(m)}`);
}

// =====================================================================================================
// MID (0 0 1200 300): tree line on a meadow band in the bank-grass colour
// =====================================================================================================
function mid(m) {
  const hz = HAZE[m], TR = TREES[m], B = BANK[m];
  let o = '';
  // back row (hazy, no outline)
  const backH = [hz, 0.42];
  for (let k = 0; k < 16; k++) {
    const x = k * 75 + 30 + hsh(k, 11) * 20, yb = 250 + hsh(k, 12) * 6;
    if (k % 3 === 1) o += both(xx => pine(xx, yb, 150 + hsh(k, 13) * 40, TR.pine, TR.trunk, { ow: 0, snow: TR.snow, haze: backH }), x, 50);
    else if (m === 'winter') o += both(xx => bareTree(xx, yb, 110 + hsh(k, 13) * 30, TR.trunk, 6, backH), x, 50);
    else o += both(xx => roundTree(xx, yb, 34 + hsh(k, 13) * 10, k % 2 ? TR.round : TR.round2, TR.trunk, { ow: 0, haze: backH }), x, 64);
  }
  // meadow band
  o += P(ridge(x => MID_BAND + wave(x, [[3, 2, 0.4], [8, 1.5, 1.2]]), 304), B.grass);
  // front row (outlined)
  for (let k = 0; k < 12; k++) {
    const x = k * 100 + 40 + hsh(k, 21) * 30, yb = 254 + hsh(k, 22) * 6;
    if (k % 4 === 1 || k % 4 === 3 && m === 'winter') o += both(xx => pine(xx, yb, 170 + hsh(k, 23) * 50, TR.pine, TR.trunk, { snow: TR.snow }), x, 60);
    else if (m === 'winter') o += both(xx => bareTree(xx, yb, 140 + hsh(k, 23) * 40, TR.trunk, 7), x, 60);
    else o += both(xx => roundTree(xx, yb, 42 + hsh(k, 23) * 14, k % 2 ? TR.round2 : TR.round, TR.trunk, { dots: TR.dots, seed: k }), x, 90);
    // a soft contact shadow on the meadow
    o += both(xx => E(xx, yb + 2, 30, 5, B.dark, ' opacity="0.55"'), x, 32);
  }
  // little meadow tufts on the band
  for (let k = 0; k < 40; k++) { const x = k * 30 + hsh(k, 31) * 14, y = 268 + hsh(k, 32) * 24; o += both(xx => S(T`M${xx - 4} ${y}L${xx - 6} ${y - 6}M${xx} ${y}L${xx} ${y - 8}M${xx + 4} ${y}L${xx + 6} ${y - 6}`, B.dark, 2, ' opacity="0.7"'), x, 8); }
  return svg(1200, 300, o, '', `mid ${m}: tree feet ≈ 248…258, meadow ${MID_BAND}…300 = bank grass ${B.grass}, bank top row ${MID_BANK}`);
}

// =====================================================================================================
// BANK SPRITES (bottom-centre anchored)
// =====================================================================================================
const BUSH = {
  spring: ['#93BF7F', '#77A468', '#5E8A55'], summer: ['#7FAF6C', '#669557', '#4F7C45'],
  autumn: ['#D4A062', '#B87F4C', '#8F6038'], winter: ['#8AA393', '#6F8A7C', '#56705F'],
};
function bush(m) {
  const [lit, sh, ol] = BUSH[m];
  const blobs = [[58, 104, 36], [100, 84, 48], [144, 102, 38], [80, 116, 30], [124, 116, 30]];
  let o = E(100, 134, 80, 7, '#4A3E30', ' opacity="0.18"');
  for (const [x, y, r] of blobs) o += C(x, y, r + 2, ol);
  o += R(26, 108, 148, 28, ol, ' rx="14"');
  for (const [x, y, r] of blobs) o += C(x, y, r, sh);
  o += R(28, 110, 144, 24, sh, ' rx="12"');
  for (const [x, y, r] of blobs) o += C(x - r * 0.12, y - r * 0.16, r * 0.8, lit);
  // leaf strokes
  o += S('M70 92Q78 86 86 90M110 70Q118 64 126 70M134 98Q142 92 150 98M92 108Q100 102 108 108', sh, 3, ' opacity="0.8"');
  o += E(80, 70, 14, 7, '#FFFFFF', ' opacity="0.3"' + rot(80, 70, -28));
  if (m === 'spring') for (const [x, y] of [[70, 84], [102, 62], [128, 80], [148, 96], [86, 104], [116, 100], [56, 100]]) o += C(x, y, 5, '#F4D3DD', OL('#D9A9B9', 1.5)) + C(x, y, 1.8, '#F3E2B0');
  if (m === 'summer') for (const [x, y] of [[74, 86], [118, 70], [142, 98], [96, 104]]) o += C(x, y, 3.6, '#F7F3E6', OL('#C9C0A6', 1)) + C(x, y, 1.3, '#E6CF8E');
  if (m === 'autumn') for (const [x, y, a] of [[72, 90, 20], [124, 72, -30], [146, 102, 50], [100, 108, -10]]) o += `<g${rot(x, y, a)}>` + P(T`M${x - 7} ${y}Q${x} ${y - 6} ${x + 7} ${y}Q${x} ${y + 6} ${x - 7} ${y}Z`, '#C47E55', OL('#8F5638', 1.2)) + '</g>';
  if (m === 'winter') {
    o += P('M26 104Q30 74 58 72Q70 48 100 42Q130 44 144 70Q170 72 174 102Q160 92 144 96Q128 86 112 92Q98 82 84 92Q68 86 56 96Q40 94 26 104Z', '#F7F9FC', OL('#C9D4E2', 2.5));
    o += S('M60 80Q80 70 98 56', '#FFFFFF', 4, ' opacity="0.9"');
  }
  return svg(200, 140, o, '', `bush ${m}: bottom-centre anchor (100,136)`);
}
function reeds(m) {
  const L = { spring: ['#8FBF78', '#6E9F5E'], summer: ['#79A866', '#5C8A4D'], autumn: ['#C9B074', '#A38C55'], winter: ['#C8BBA0', '#A39578'] }[m];
  const cat = m === 'spring' ? null : (m === 'winter' ? '#8F7560' : '#8C6A4E');
  let o = E(60, 154, 40, 5, '#4A3E30', ' opacity="0.16"');
  const blades = [[30, -26, 120], [44, -10, 140], [56, 4, 150], [66, -6, 128], [78, 16, 138], [90, 24, 110], [38, 14, 96], [84, -14, 100]];
  for (const [x, lean, h] of blades) {
    const tx = x + lean, ty = 156 - h;
    o += P(T`M${x - 5} 156Q${x - 2 + lean * 0.3} ${156 - h * 0.5} ${tx} ${ty}Q${x + 2 + lean * 0.4} ${156 - h * 0.5} ${x + 5} 156Z`, L[1], OL(mix(L[1], '#3A3020', 0.3), 2));
    o += P(T`M${x - 3} 156Q${x - 1 + lean * 0.3} ${156 - h * 0.5} ${tx} ${ty + 2}Q${x + lean * 0.3} ${156 - h * 0.45} ${x} 156Z`, L[0]);
    if (m === 'winter') o += E(tx, ty + 4, 4, 3, '#F7F9FC');
  }
  if (cat) for (const [x, y, lean] of [[52, 28, -4], [72, 40, 6], [62, 58, 2]]) {
    o += S(T`M${x - lean} 156L${x} ${y + 26}`, mix(L[1], '#3A3020', 0.2), 3);
    o += R(x - 6, y, 12, 30, cat, ` rx="6"${OL(mix(cat, '#2A2018', 0.35), 2)}`) + R(x - 3.5, y + 4, 3, 18, mix(cat, '#FFFFFF', 0.25), ' rx="1.5"') + S(T`M${x} ${y}L${x} ${y - 10}`, cat, 2.4);
    if (m === 'winter') o += E(x, y + 1, 7, 3.5, '#F7F9FC');
  }
  return svg(120, 160, o, '', `reeds ${m}: bottom-centre anchor (60,156)`);
}
function rock() {
  let o = E(60, 75, 50, 5, '#4A3E30', ' opacity="0.2"');
  o += P('M12 74Q6 50 26 34Q44 18 70 22Q100 26 110 50Q116 70 104 74Z', '#A9A89E', OL('#6E6D65', 3.5));
  o += P('M60 74Q96 70 104 54Q110 68 104 74Z', '#8B8A80');
  o += P('M24 46Q34 30 54 28Q42 36 36 50Z', '#C9C8BE', ' opacity="0.9"');
  o += P('M40 26Q58 18 78 24Q86 30 74 32Q58 28 44 32Z', '#9BB07A', ' opacity="0.85"');
  o += E(100, 72, 12, 6, '#9C9A90', OL('#6E6D65', 2.5)) + E(97, 69, 5, 2, '#C9C8BE');
  return svg(120, 80, o, '', 'rock: bottom-centre anchor (60,76)');
}
function flowers(m) {
  const B = BANK[m];
  let o = '';
  if (m === 'winter') {
    o += E(70, 66, 56, 6, '#9FB0C4', ' opacity="0.25"');
    o += P('M12 68Q16 50 36 50Q48 36 66 40Q80 30 98 42Q120 44 128 68Z', '#F7F9FC', OL('#C9D4E2', 2.5));
    o += S('M40 50L36 36M46 48L48 32M92 44L96 30M100 44L106 34', '#A39578', 2.4);
    o += E(50, 48, 14, 4, '#FFFFFF') + E(92, 42, 12, 3.5, '#FFFFFF');
    return svg(140, 70, o, '', 'flowers winter (snow tufts): bottom-centre anchor (70,68)');
  }
  // grass tuft
  let bl = ''; for (let k = 0; k < 14; k++) { const x = 16 + k * 8 + hsh(k, 41) * 4, h = 16 + hsh(k, 42) * 18, l = (hsh(k, 43) - 0.5) * 12; bl += T`M${x - 3} 68Q${x} ${68 - h * 0.6} ${x + l} ${68 - h}Q${x + 1} ${68 - h * 0.5} ${x + 3} 68Z`; }
  o += P(bl, B.tuft, OL(mix(B.tuft, '#2E3A20', 0.25), 1.2));
  const FL = { spring: [['#F7E6EC', '#D9A9B9', '#F3E2B0'], ['#FFFFFF', '#C9C0B0', '#F0D98E']], summer: [['#F7F3E6', '#C9C0A6', '#E6CF8E'], ['#F2E3A0', '#C2AD64', '#D9B85E']], autumn: [['#EADCEB', '#B9A3BC', '#E6CF8E'], ['#F2E6D0', '#C4AE8A', '#D9B070']] }[m];
  const fl = (x, y, r, [p, ol, c]) => { let s = ''; for (let q = 0; q < 5; q++) { const a = q * 1.2566 - 1.57; s += E(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, r * 0.6, p, OL(ol, 1.2) + rot(x + Math.cos(a) * r, y + Math.sin(a) * r, a * 57.3)); } return S(T`M${x} ${y + r}L${x + 1} 68`, B.tuft, 2) + s + C(x, y, r * 0.55, c); };
  o += fl(34, 36, 6, FL[0]) + fl(62, 26, 7, FL[1]) + fl(92, 34, 6, FL[0]) + fl(114, 44, 5, FL[1]) + fl(48, 50, 4.5, FL[1]);
  if (m === 'autumn') o += `<g${rot(100, 62, 20)}>` + P('M92 62Q100 56 108 62Q100 68 92 62Z', '#C47E55', OL('#8F5638', 1.2)) + '</g>';
  return svg(140, 70, o, '', `flowers ${m}: bottom-centre anchor (70,68)`);
}
function bankTree(m) {
  const TR = TREES[m], trunk = '#8A6A50', tol = '#5E4636';
  let o = E(130, 352, 90, 8, '#4A3E30', ' opacity="0.2"');
  // trunk with root flare + a branch fork
  o += P('M112 354Q118 320 118 250Q118 210 108 186L122 182Q130 204 132 222Q138 200 152 184L162 192Q142 216 142 250Q142 320 150 354Q140 350 130 352Q120 350 112 354Z', trunk, OL(tol, 4));
  o += P('M122 350Q126 300 124 240L132 240Q132 300 136 350Z', mix(trunk, '#FFFFFF', 0.15), ' opacity="0.7"');
  o += S('M138 300Q134 290 138 280', tol, 2.5, ' opacity="0.7"');
  if (m === 'winter') {
    o += S('M120 196Q96 160 70 140M108 172Q92 120 98 86M142 196Q170 150 196 132M156 176Q172 120 160 82M130 190Q128 130 132 60M70 140Q56 134 46 120M196 132Q212 126 222 112', trunk, 9) + S('M120 196Q96 160 70 140M108 172Q92 120 98 86M142 196Q170 150 196 132M156 176Q172 120 160 82M130 190Q128 130 132 60', tol, 2, ' opacity="0.35"');
    for (const [x, y, r] of [[72, 136, 12], [98, 84, 10], [196, 128, 12], [160, 80, 10], [132, 58, 10], [46, 118, 8], [222, 110, 8], [112, 150, 8], [168, 150, 8]]) o += E(x, y, r * 1.5, r * 0.6, '#F7F9FC', OL('#C9D4E2', 1.5));
    o += P('M84 354Q96 336 130 338Q166 336 178 354Z', '#F7F9FC', OL('#C9D4E2', 2));
    return svg(260, 360, o, '', 'tree winter: bottom-centre anchor (130,354)');
  }
  const blobs = [[130, 96, 70], [70, 140, 52], [190, 138, 54], [100, 190, 48], [162, 192, 48], [130, 160, 60]];
  const c1 = TR.round;
  const [lit, sh, ol] = c1;
  for (const [x, y, r] of blobs) o += C(x, y, r + 2.5, ol);
  for (const [x, y, r] of blobs) o += C(x, y, r, sh);
  for (const [x, y, r] of blobs) o += C(x - r * 0.1, y - r * 0.14, r * 0.82, lit);
  if (m === 'autumn') for (const [x, y, r] of [[186, 128, 28], [80, 170, 22], [150, 76, 22]]) o += C(x, y, r, TR.round2[0], ' opacity="0.9"');
  o += E(96, 70, 24, 12, '#FFFFFF', ' opacity="0.32"' + rot(96, 70, -30));
  o += S('M84 120Q100 108 116 116M150 100Q166 90 180 100M150 170Q166 160 180 168M90 196Q104 186 118 194', sh, 4, ' opacity="0.7"');
  if (m === 'spring') for (let k = 0; k < 18; k++) { const a = hsh(k, 51) * 6.28, d = 20 + hsh(k, 52) * 90; const x = 130 + Math.cos(a) * d * 0.9, y = 140 + Math.sin(a) * d * 0.6; o += C(x, y, 5, '#FBEFF3', OL('#D9A9B9', 1.2)) + C(x, y, 1.7, '#F3E2B0'); }
  if (m === 'summer') for (const [x, y] of [[78, 150], [180, 120], [140, 70], [110, 186], [170, 186]]) o += C(x, y, 3, '#F7F3E6', ' opacity="0.8"');
  return svg(260, 360, o, '', `tree ${m}: bottom-centre anchor (130,354); fruit spot under the canopy ≈ (130,250)`);
}

// =====================================================================================================
// SUN, MOON, CLOUDS, PARTICLES (kept from the bubble game; moon unused but harmless)
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.4], [1, '#FFF2CF', 0]]);
  let rays = '';
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, r0 = 56, r1 = k % 2 ? 70 : 76, w = 0.12; rays += T`M${100 + Math.cos(a - w) * r0} ${100 + Math.sin(a - w) * r0}Q${100 + Math.cos(a) * (r1 + 4)} ${100 + Math.sin(a) * (r1 + 4)} ${100 + Math.cos(a + w) * r0} ${100 + Math.sin(a + w) * r0}Z`; }
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + P(rays, '#FFF0C4', ' opacity="0.9"') + C(100, 100, 48, '#FFF1C6', OL('#F2D9A0', 4)) + C(100, 100, 40, '#FFF7DE') +
    E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85"' + rot(86, 84, -35)), d, 'sun: centre (100,100), soft rounded rays, no face');
}
function moon() {
  const d = rg('g', [[0, '#E9EEFF', 0.5], [0.5, '#DDE5FF', 0.18], [1, '#DDE5FF', 0]]);
  const cres = 'M100 54A46 46 0 1 0 140 122.6A40 40 0 0 1 100 54Z';
  return svg(200, 200, C(100, 100, 98, 'url(#g)') + P(cres, '#F6F1DC', OL('#D9D1B2', 3.5)) +
    P('M88 63Q67 76 65 100Q65 117 74 130', 'none', OL('#FFFFFF', 4) + ' opacity="0.65"') + C(78, 112, 4, '#E4DCBE') + C(92, 136, 3, '#E4DCBE') + C(70, 90, 2.6, '#E4DCBE'), d, 'moon: friendly crescent, no face');
}
function cloud(type) {
  // white art (render tints it per season with a 'source-atop' overlay); soft cool-grey shade, no outline
  const blobs = type === 'a' ? [[66, 92, 34], [112, 70, 46], [166, 60, 44], [212, 80, 36], [250, 98, 26], [38, 106, 22]] : [[60, 96, 26], [98, 78, 34], [146, 70, 40], [194, 84, 32], [234, 100, 22], [32, 108, 16]];
  let sh = '', lit = '', hi = '';
  for (const [x, y, r] of blobs) { sh += C(x, y, r, '#E4E9F1'); lit += C(x - r * 0.1, y - r * 0.14, r * 0.86, '#FFFFFF'); if (r > 30) hi += E(x - r * 0.34, y - r * 0.44, r * 0.3, r * 0.14, '#FFFFFF', rot(x - r * 0.34, y - r * 0.44, -26)); }
  const base = P('M22 104Q20 126 46 126L258 126Q282 126 280 106L276 96L24 96Z', '#E4E9F1') + P('M26 102Q26 118 48 118L254 118Q276 118 274 104L270 96L28 96Z', '#FFFFFF');
  return svg(300, 140, sh + base + lit + hi);
}

// =====================================================================================================
// PARTICLES (0 0 32 32; mist 0 0 64 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.mist = svg(64, 32, E(32, 17, 31, 12, 'url(#m)') + E(22, 15, 16, 8, 'url(#m)') + E(44, 18, 16, 8, 'url(#m)'),
    rg('m', [[0, '#FFFFFF', 0.7], [0.6, '#FFFFFF', 0.3], [1, '#FFFFFF', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P('M16 3Q17.2 14.8 29 16Q17.2 17.2 16 29Q14.8 17.2 3 16Q14.8 14.8 16 3Z', '#FFF4D2') + C(16, 16, 3.2, '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.5], [1, '#FFF6DA', 0]]));
  out.firefly = svg(32, 32, C(16, 16, 15, 'url(#f)') + C(16, 16, 4.6, '#F2FAC0') + C(16, 16, 2.4, '#FFFFF0'),
    rg('f', [[0, '#E9F59A', 0.85], [0.35, '#E9F59A', 0.35], [1, '#E9F59A', 0]]));
  // petal: a soft blossom petal (pale blush, far below answer pink in chroma)
  out.petal = svg(32, 32, `<g transform="rotate(-25 16 16)">` + P('M16 4Q25 8 24 17Q22 26 16 28Q10 26 8 17Q7 8 16 4Z', '#F9DCE6', OL('#E3B7C7', 1.4)) +
    P('M16 28Q22 26 24 17Q23 24 16 28Z', '#EFC6D5') + P('M14.6 5.2L16 8.6L17.4 5.2', 'none', OL('#E3B7C7', 1.2)) + E(12.6, 11.5, 2.2, 3.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // leaf: a muted amber autumn leaf (rust shade) — not answer orange
  out.leaf = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 28Q12 26 9 20Q6 10 16 3Z', '#DFAE7C', OL('#AD7A55', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 28Q20 16 16 3Z', '#C9906A', ' opacity="0.8"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#AD7A55', 1.1) +
    E(12.5, 11, 2, 3.4, '#F2D3B0', ' opacity="0.8"') + `</g>`);
  out.butterfly = svg(32, 32, P('M15.5 15Q8 4 3.5 8Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#F6EEDC', OL('#B9AFC4', 1.4)) +
    P('M16.5 15Q24 4 28.5 8Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#ECE2D0', OL('#B9AFC4', 1.4)) +
    C(7.5, 11, 2, '#DCD2E2') + C(24.5, 11, 2, '#DCD2E2') + R(15, 10, 2, 13, '#7E6656', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#7E6656', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#F7F1EA', 0.9], [0.6, '#ECE2D6', 0.45], [1, '#ECE2D6', 0]]));
  out.feather = svg(32, 32, `<g transform="rotate(35 16 16)">` + P('M16 2Q23 8 22 17Q21 24 16.6 28L15.4 28Q11 24 10 17Q9 8 16 2Z', '#F5EFE4', OL('#CDBFA6', 1.3)) +
    S('M13 10L11 8.5M12.4 15L10.2 13.6M19 10L21 8.5M19.6 15L21.8 13.6', '#DCD0BA', 1.1) + S('M16 4L16 30', '#C2A882', 1.4) + E(13.6, 11, 1.6, 3.4, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // NEW snow: a soft snowflake dot (white core, faint cool halo, 6 tiny arms) — reads on the pale winter sky
  out.snow = svg(32, 32, C(16, 16, 15, 'url(#s)') + C(16, 16, 6.2, '#FFFFFF', OL('#D3DEEE', 1.2)) +
    S('M16 7.5L16 24.5M8.6 11.75L23.4 20.25M8.6 20.25L23.4 11.75', '#E3EBF6', 1.4) + C(16, 16, 2.6, '#FFFFFF') + C(14, 13.8, 1.4, '#FFFFFF'),
    rg('s', [[0, '#FFFFFF', 0.75], [0.45, '#F2F6FC', 0.35], [1, '#F2F6FC', 0]]));
  // NEW blossom: a 5-petal pale cherry blossom with a butter centre
  let bl = ''; for (let p = 0; p < 5; p++) { const a = p * 72 - 90; bl += `<g transform="rotate(${a + 90} 16 16)">` + P('M16 15.5Q10.4 10 12.2 4.6Q14 2 16 4.4Q18 2 19.8 4.6Q21.6 10 16 15.5Z', '#F7CADB', OL('#DFA4BB', 1.2)) + E(14.6, 8, 1.6, 2.6, '#FFFFFF', ' opacity="0.7"') + '</g>'; }
  out.blossom = svg(32, 32, bl + C(16, 16, 3.6, '#F8E4A6', OL('#DDB977', 1)) + C(15, 15, 1.1, '#FFFFFF'));
  // NEW glint: a 4-point sun glint (white core, warm cream halo)
  out.glint = svg(32, 32, C(16, 16, 15, 'url(#g)') + P('M16 1.5Q17.3 14.7 30.5 16Q17.3 17.3 16 30.5Q14.7 17.3 1.5 16Q14.7 14.7 16 1.5Z', '#FFFDF2') +
    P('M16 9Q16.6 15.4 23 16Q16.6 16.6 16 23Q15.4 16.6 9 16Q15.4 15.4 16 9Z', '#FFFFFF', ' transform="rotate(45 16 16)" opacity="0.85"') + C(16, 16, 2.4, '#FFFFFF'),
    rg('g', [[0, '#FFF6D0', 0.7], [0.5, '#FFF3C8', 0.25], [1, '#FFF3C8', 0]]));
  return out;
}

// NEW dragonfly (0 0 48 32): soft teal-lilac wings, a slim muted teal body, facing RIGHT (head at x ≈ 40)
function dragonfly() {
  const wing = (d, c) => P(d, c, OL('#93A9BE', 1.2) + ' opacity="0.85"');
  let o = '';
  o += wing('M22 14Q14 2 4 4Q2 9 12 12Q18 14 22 15Z', '#D9E9EE') + wing('M22 17Q14 26 5 27Q3 22 12 19Q18 17 22 16Z', '#E3DCEF');
  o += wing('M27 14Q30 2 40 2Q43 7 35 11Q31 13 27 15Z', '#E3DCEF') + wing('M27 17Q31 27 39 29Q42 24 35 20Q31 18 27 16Z', '#D9E9EE');
  o += S('M10 7Q16 9 20 13M33 6Q30 10 28 13', '#FFFFFF', 1, ' opacity="0.8"');
  o += S('M4 16L30 16', '#5E8F8C', 3.4) + S('M8 16L10 16M14 16L16 16M20 16L22 16', '#3F6B68', 3.6);
  o += E(33, 16, 5, 3.8, '#6FA7A3', OL('#3F6B68', 1.2)) + C(39.5, 16, 3.6, '#7DB3AE', OL('#3F6B68', 1.2));
  o += C(41, 14.6, 1.4, '#2A3E3C') + C(41.4, 14.2, 0.5, '#FFFFFF');
  return svg(48, 32, o, '', 'dragonfly: centre (24,16), facing right');
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of SEASONS) {
    wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m));
    wr(env, 'bush_' + m, bush(m)); wr(env, 'reeds_' + m, reeds(m)); wr(env, 'flowers_' + m, flowers(m)); wr(env, 'tree_' + m, bankTree(m));
  }
  wr(env, 'rock', rock());
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  ps.dragonfly = dragonfly();
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no fonts, no external refs, ≤ 1 blur, width/height = viewBox
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|font|href=|url\((?!#)|feGaussianBlur[\s\S]*feGaussianBlur|NaN|undefined/.test(s)) throw new Error('SVG rule broken in ' + fn);
    const mm = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    if (!mm || mm[1] !== mm[3] || mm[2] !== mm[4]) throw new Error('size != viewBox in ' + fn);
  }
  let kb = 0; for (const fn of fs.readdirSync(env)) kb += fs.statSync(path.join(env, fn)).size;
  console.log('wrote env (' + fs.readdirSync(env).length + ' files, ' + Math.round(kb / 1024) + ' KB) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { SEASONS, SKY, HAZE, BANK, EARTH, TREES, SPRITES, FAR_SOLID, FAR_BASE, MID_FAR, MID_BAND, MID_BANK };
if (require.main === module) main();
