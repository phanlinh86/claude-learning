// Bao's Bubble Sky: rainbow-cloud-land environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground,cushion}_{spring,summer,autumn,winter}.svg, env/{sun,moon,cloud_a,cloud_b}.svg
// and game/assets/default/particles/*.svg (keeps every particle the parade had, restyles leaf / petal for the cloud land,
// adds snow, blossom, glint). Any other (old) env file is deleted.  (DESIGN §3, §4.4)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Look: a calm pastel sky land. far = a distant sea of clouds, a pale cloud CASTLE on a cloud mound, floating islands with
// rock "carrot" undersides and tiny round trees (hazed toward the sky), a few tiny high islands for tall portrait skies;
// mid = big puffy cloud banks (back bank hazy, front bank with a soft outline) and 3 small floating islands (one with a
// little waterfall, frozen into icicles in winter); ground = the fluffy cloud floor (one row of round puffs, top edge
// ≈ y 40…60, then plain, very light rows — the bubbles float in front of them); cushion = the puffy cloud Bao sits on.
//
// Tiling: every layer is 1200 wide. Puff rows use spacings that divide 1200 with per-index (not per-x) jitter, wavy lines
// are integer harmonics over 1200, props crossing x = 0 / 1200 are drawn twice (x and x ∓ 1200): both edges match pixel
// for pixel (docs/art/env_seams.png).
// Colour rule (DESIGN §3): pastel, slightly warm, low chroma — no answer hue in a saturated form; the clouds are tinted
// off-white (never pure white masses behind yellow), the shade tones are mid-light lilac / blue / peach so a yellow or a pink
// thing still separates. The season lives in the sky gradient, the cloud shade tint, island tops, trees and decorations.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far     0 0 1200 720 : transparent top; tiny high islands rows ≈ 150…320, big islands ≈ 400…600, castle ≈ 400…600,
//                          cloud sea tops ≈ 560…600, solid from FAR_SOLID = 640 down. Row 720 hides behind the mid banks.
//   mid     0 0 1200 300 : transparent top; islands rows ≈ 30…200, back bank tops ≈ 120…150, front bank tops ≈ 175…200,
//                          solid from MID_SOLID = 250. Row MID_BASE = 296 hides behind the ground.
//   ground  0 0 1200 260 : transparent above GROUND_TOP ≈ 40; puff row 40…110, CALM rows 110…215 (plain, very light);
//                          season decoration on the puff tops and below 215; bottom fades to GROUND_BOTTOM[m] (render fills
//                          below the tile with it).
//   cushion 0 0 300 120  : top-centre anchor CUSHION.anchor = (150, 30) = Bao's feet; side puffs cradle Bao from y ≈ 8, centre top ≈ 22, base ≈ 112.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const GROUND_TOP = 40, GROUND_ROW = 50, CALM = [110, 215], MID_BASE = 296, MID_SOLID = 250, FAR_SOLID = 640;
const CUSHION = { w: 300, h: 120, anchor: [150, 30] };
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
// draw fn(x) and its wrapped copies when the prop (half width `half`) crosses an edge
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);   // periodic
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rot = (x, y, a) => ` transform="rotate(${f(a)} ${f(x)} ${f(y)})"`;

// ---------------- palettes (DESIGN §3) ----------------
const SKY = {
  spring: [[0, '#CFE6FA'], [1, '#FCEFF4']],
  summer: [[0, '#86C9F0'], [1, '#E2F5FF']],
  autumn: [[0, '#F3C28F'], [1, '#FCEBD3']],
  winter: [[0, '#B7C8E4'], [1, '#EEF2F9']],
};
const skyTop = m => SKY[m][0][1], skyBot = m => SKY[m][1][1];
// what distant things fade into (sky bottom, a touch of the top)
const HAZE = { spring: mix('#FCEFF4', '#CFE6FA', 0.3), summer: mix('#E2F5FF', '#86C9F0', 0.22), autumn: mix('#FCEBD3', '#F3C28F', 0.25), winter: mix('#EEF2F9', '#B7C8E4', 0.3) };
// cloud tones per season: hi (highlight), base (lit top), shade (cel shade), deep (lower body), ol (soft outline)
const CLOUD = {
  spring: { hi: '#FFFFFF', base: '#FFF8FA', shade: '#EEDDEA', deep: '#E3CEE0', ol: '#D6BFD5' },
  summer: { hi: '#FFFFFF', base: '#F9FCFF', shade: '#DCE9F5', deep: '#CADBEC', ol: '#B9CFE5' },
  autumn: { hi: '#FFFDF8', base: '#FFF5EA', shade: '#F3DECB', deep: '#EACCB6', ol: '#DDBBA2' },
  winter: { hi: '#FFFFFF', base: '#F7F9FD', shade: '#DFE6F1', deep: '#CDD7E8', ol: '#BCC8DD' },
};
// fill colour below the ground tile (= the tile's last row)
const GROUND_BOTTOM = { spring: '#EEDDEA', summer: '#DCE9F5', autumn: '#F2DDCA', winter: '#DFE6F1' };
// floating islands: rock underside, grass / snow cap, trees
const LAND = {
  spring: { rock: '#D9C6C8', rockS: '#C4AFB7', cap: '#CBE0B2', capS: '#B3CD9B', capL: '#E0EDCC', tree: ['#F4CADB', '#E4AFC5'], tree2: ['#F8DFE8', '#EAC4D3'], trunk: '#B39A90', water: '#E2F1FA' },
  summer: { rock: '#D4C2B4', rockS: '#BEAA9D', cap: '#B6D8A2', capS: '#9DC48B', capL: '#D2E8C2', tree: ['#9CCB98', '#83B583'], tree2: ['#B4D8A6', '#98C38D'], trunk: '#AA8D78', water: '#DDF1FB' },
  autumn: { rock: '#D5BCA9', rockS: '#BFA18E', cap: '#DECC99', capS: '#CBB680', capL: '#EDE0BC', tree: ['#D9A06A', '#C4885A'], tree2: ['#C98A5E', '#B2744F'], trunk: '#A3806A', water: '#EEF2F2' },
  winter: { rock: '#CBC8D6', rockS: '#B5B2C5', cap: '#F8FAFE', capS: '#DCE3EF', capL: '#FFFFFF', tree: ['#F2F5FB', '#D6DEEB'], tree2: ['#F2F5FB', '#D6DEEB'], trunk: '#9C93A2', water: '#EAF2FA' },
};
const CASTLE = { spring: '#E9DDEA', summer: '#D6E6F2', autumn: '#F1DCCB', winter: '#DCE3EF' };

// =====================================================================================================
// building blocks
// =====================================================================================================
/** A soft cloud mass from circles [x, y, r] (wrapped across the seam), optional solid fill below `solidY` (full tile width).
 *  passes: outline (r + olw/2) → solid rect → shade circles → lit circles (offset up-left, smaller) → highlights. */
function cloudMass(list, c, { olw = 0, solidY = null, solidH = 0, solidFill = null, hl = 0.8, hiMin = 26, litK = 0.84 } = {}) {
  let ol = '', sh = '', lit = '', hi = '';
  for (const [x, y, r] of list) {
    if (olw) ol += both(xx => C(xx, y, r + olw / 2, c.ol), x, r + olw);
    sh += both(xx => C(xx, y, r, c.shade), x, r + 2);
    lit += both(xx => C(xx - r * 0.12, y - r * 0.15, r * litK, c.base), x, r + 2);
    if (r >= hiMin) hi += both(xx => E(xx - r * 0.38, y - r * 0.45, r * 0.3, r * 0.15, c.hi, ` opacity="${hl}"` + rot(xx - r * 0.38, y - r * 0.45, -28)), x, r);
  }
  let solid = '';
  if (solidY != null) solid = R(-2, solidY, W + 4, solidH, solidFill || c.base);
  return ol + solid + sh + lit + hi;
}
/** a periodic puff row: n puffs (W/n spacing), radius r0 + dr·hash, centre y = yc(x) + 0.2·r */
function puffRow(n, yc, r0, dr, seed, jx = 0.25) {
  const sp = W / n, out = [];
  for (let k = 0; k < n; k++) {
    const r = r0 + dr * hsh(k, seed), x = k * sp + sp * 0.5 + (hsh(k, seed + 7) - 0.5) * sp * jx;
    out.push([x, yc(x) + r * 0.2, r]);
  }
  return out;
}
/** a lollipop tree (round canopy) standing at (x, yb) with canopy radius r; tc = [colour, shade]; out = outline or null */
function tree(x, yb, r, tc, trunk, out, k2 = false) {
  let s = '';
  const th = r * 0.95, tw = Math.max(1.6, r * 0.26);
  s += R(x - tw / 2, yb - th, tw, th + 1, trunk, out ? ` rx="${f(tw / 2)}"${OL(out, 1.2)}` : '');
  const cy = yb - th - r * 0.72;
  if (out) s += C(x, cy, r + 1.2, out) + (k2 ? C(x + r * 0.55, cy + r * 0.25, r * 0.7 + 1.2, out) : '');
  s += C(x, cy, r, tc[1]) + (k2 ? C(x + r * 0.55, cy + r * 0.25, r * 0.7, tc[1]) : '');
  s += C(x - r * 0.12, cy - r * 0.14, r * 0.82, tc[0]) + (k2 ? C(x + r * 0.47, cy + r * 0.13, r * 0.56, tc[0]) : '');
  if (r > 5) s += E(x - r * 0.38, cy - r * 0.4, r * 0.26, r * 0.15, '#FFFFFF', ' opacity="0.55"' + rot(x - r * 0.38, cy - r * 0.4, -30));
  return s;
}
/** a bare winter tree: trunk + 2 forked branches with tiny snow caps */
function bareTree(x, yb, h, trunk, snow, w0 = 2.2) {
  let s = S(T`M${x} ${yb}L${x} ${yb - h}M${x} ${yb - h * 0.45}L${x - h * 0.32} ${yb - h * 0.82}M${x} ${yb - h * 0.6}L${x + h * 0.34} ${yb - h * 0.95}M${x} ${yb - h * 0.8}L${x + h * 0.14} ${yb - h * 1.08}`, trunk, w0);
  s += C(x, yb - h - 0.5, w0 * 0.9, snow) + C(x - h * 0.32, yb - h * 0.82 - 0.5, w0 * 0.8, snow) + C(x + h * 0.34, yb - h * 0.95 - 0.5, w0 * 0.8, snow);
  return s;
}
/** a floating island centred at x, cap top line y, width w. tone(c) maps colours (haze). opt: {out, trees:[[dx, r, kind]], seed, fall} */
function island(m, x, y, w, tone, opt = {}) {
  const L = LAND[m], out = opt.out ? tone(mix(L.rockS, '#5A4E5E', 0.28)) : null, ow = opt.ow || 2;
  const rock = tone(L.rock), rockS = tone(L.rockS), cap = tone(L.cap), capS = tone(L.capS), capL = tone(L.capL);
  const h = w * 0.62;   // rock depth
  let s = '';
  // underside: a rounded carrot with two lumps, tip a bit right of centre
  const under = T`M${x - w / 2} ${y + 4}C${x - w * 0.5} ${y + h * 0.3} ${x - w * 0.36} ${y + h * 0.42} ${x - w * 0.24} ${y + h * 0.5}Q${x - w * 0.2} ${y + h * 0.72} ${x - w * 0.06} ${y + h * 0.74}Q${x + w * 0.02} ${y + h * 1.02} ${x + w * 0.1} ${y + h * 0.8}Q${x + w * 0.26} ${y + h * 0.66} ${x + w * 0.3} ${y + h * 0.44}C${x + w * 0.44} ${y + h * 0.3} ${x + w * 0.5} ${y + h * 0.16} ${x + w / 2} ${y + 4}Z`;
  s += P(under, rock, out ? OL(out, ow) : '');
  // cel shade on the right / lower part
  s += P(T`M${x + w * 0.04} ${y + 6}C${x + w * 0.3} ${y + h * 0.1} ${x + w * 0.24} ${y + h * 0.5} ${x + w * 0.04} ${y + h * 0.78}Q${x + w * 0.06} ${y + h * 0.92} ${x + w * 0.1} ${y + h * 0.8}Q${x + w * 0.26} ${y + h * 0.66} ${x + w * 0.3} ${y + h * 0.44}C${x + w * 0.44} ${y + h * 0.3} ${x + w * 0.5} ${y + h * 0.16} ${x + w / 2 - 1} ${y + 5}Z`, rockS, ' opacity="0.9"');
  // strata
  s += S(T`M${x - w * 0.42} ${y + h * 0.24}Q${x - w * 0.15} ${y + h * 0.32} ${x + w * 0.12} ${y + h * 0.24}M${x - w * 0.2} ${y + h * 0.52}Q${x - w * 0.02} ${y + h * 0.58} ${x + w * 0.16} ${y + h * 0.5}`, rockS, Math.max(1.2, w / 90), ' opacity="0.8"');
  // a hanging root / pebble
  s += C(x - w * 0.3, y + h * 0.38, w * 0.025, rockS);
  // cap: a soft rounded top with drips along the lower edge
  const ch = Math.max(6, w * 0.1);
  const capD = T`M${x - w / 2 - 4} ${y + 4}Q${x - w / 2 - 3} ${y - ch} ${x - w * 0.25} ${y - ch * 1.05}L${x + w * 0.25} ${y - ch * 1.05}Q${x + w / 2 + 3} ${y - ch} ${x + w / 2 + 4} ${y + 4}Z`;
  let drips = '';
  const nd = Math.max(4, Math.round(w / 22));
  for (let i = 0; i < nd; i++) { const u = (i + 0.5) / nd, dx = x - w / 2 + u * w, r = w * (0.035 + 0.02 * hsh(i, opt.seed || 1)); drips += C(dx, y + 4 + r * 0.3, r, cap); }
  if (out) s += P(capD, 'none', OL(out, ow * 2)) + drips.replace(/fill="[^"]+"/g, `fill="${out}"`).replace(/r="([\d.]+)"/g, (q, r) => `r="${f(+r + ow * 0.6)}"`);
  s += P(capD, cap) + drips;
  s += P(T`M${x - w * 0.42} ${y - ch * 0.5}Q${x - w * 0.3} ${y - ch * 0.98} ${x - w * 0.05} ${y - ch * 1.0}L${x + w * 0.1} ${y - ch * 1.0}Q${x - w * 0.18} ${y - ch * 0.7} ${x - w * 0.42} ${y - ch * 0.5}Z`, capL, ' opacity="0.9"');
  s += S(T`M${x + w * 0.1} ${y + 2}Q${x + w * 0.35} ${y + 1} ${x + w / 2 + 1} ${y - 2}`, capS, Math.max(1.4, w / 70));
  if (m === 'winter') {   // icicles under the snow cap
    let ic = ''; for (let i = 0; i < nd; i += 2) { const u = (i + 0.9) / nd, dx = x - w / 2 + u * w, l = w * 0.06 * (0.7 + hsh(i, 3)); ic += T`M${dx - w * 0.012} ${y + 6}L${dx} ${y + 6 + l}L${dx + w * 0.012} ${y + 6}Z`; }
    s += P(ic, tone('#E8F0FA'));
  }
  // waterfall (or frozen icicle curtain in winter) from the right edge of the cap
  if (opt.fall) {
    const fx = x + w * 0.3, fy = y + 2, len = opt.fall;
    if (m === 'winter') {
      s += P(T`M${fx - 5} ${fy}L${fx - 2} ${fy + 22}L${fx + 1} ${fy + 4}L${fx + 4} ${fy + 30}L${fx + 7} ${fy}Z`, tone('#EEF4FB'), out ? OL(tone('#C9D5E6'), 1) : '');
    } else {
      const wc = tone(L.water);
      s += P(T`M${fx - 6} ${fy}Q${fx - 7} ${fy + len * 0.5} ${fx - 4} ${fy + len}L${fx + 8} ${fy + len}Q${fx + 9} ${fy + len * 0.5} ${fx + 6} ${fy}Z`, wc, ' opacity="0.92"');
      s += S(T`M${fx - 2} ${fy + 6}L${fx - 1} ${fy + len * 0.8}M${fx + 3} ${fy + 12}L${fx + 4} ${fy + len * 0.9}`, '#FFFFFF', 1.6, ' opacity="0.75"');
    }
  }
  // trees / bushes on the cap
  const top = y - ch * 0.9;
  for (const [dx, r, kind] of opt.trees || []) {
    const tx = x + dx * w;
    if (m === 'winter' && kind === 2) s += bareTree(tx, top + 1, r * 2.6, tone(L.trunk), tone('#FFFFFF'), Math.max(1.4, r * 0.24));
    else s += tree(tx, top + 1, r, (kind === 2 ? L.tree2 : L.tree).map(tone), tone(L.trunk), out ? tone(mix(L.tree[1], '#5A4E5E', 0.3)) : null, kind === 1);
  }
  if (m === 'winter' && opt.trees) for (const [dx, r] of opt.trees) s += E(x + dx * w + r * 0.5, top + 1, r * 0.7, r * 0.22, tone('#FFFFFF'));   // snow drifts
  return s;
}
/** a soft cloud castle silhouette standing on (x, yb), height h (towers with cone roofs, little pennants, windows) */
function castle(m, x, yb, h, col) {
  const lt = mix(col, '#FFFFFF', 0.45), dk = mix(col, '#8E86A0', 0.14);
  const tower = (cx, w, th, roofH) => R(cx - w / 2, yb - th, w, th, col) + P(T`M${cx - w / 2 - w * 0.12} ${yb - th}L${cx} ${yb - th - roofH}L${cx + w / 2 + w * 0.12} ${yb - th}Z`, dk) +
    P(T`M${cx - w * 0.04} ${yb - th - roofH + 2}L${cx - w * 0.6 * 0.5} ${yb - th}L${cx - w * 0.1} ${yb - th}Z`, lt, ' opacity="0.5"') +
    S(T`M${cx} ${yb - th - roofH}L${cx} ${yb - th - roofH - h * 0.08}`, dk, 1.4) + P(T`M${cx} ${yb - th - roofH - h * 0.08}L${cx + h * 0.06} ${yb - th - roofH - h * 0.065}L${cx} ${yb - th - roofH - h * 0.05}Z`, dk) +
    R(cx - w * 0.14, yb - th + th * 0.18, w * 0.28, w * 0.4, lt, ` rx="${f(w * 0.14)}" opacity="0.85"`);
  let s = '';
  // back keep, wall, side towers
  s += tower(x, h * 0.2, h * 0.68, h * 0.26);
  s += tower(x - h * 0.3, h * 0.15, h * 0.48, h * 0.2) + tower(x + h * 0.32, h * 0.15, h * 0.52, h * 0.21);
  s += R(x - h * 0.42, yb - h * 0.3, h * 0.84, h * 0.3, col);
  let cren = ''; for (let i = 0; i < 9; i++) cren += R(x - h * 0.42 + i * h * 0.1, yb - h * 0.34, h * 0.06, h * 0.05, col);
  s += cren + P(T`M${x - h * 0.07} ${yb}L${x - h * 0.07} ${yb - h * 0.12}A${h * 0.07} ${h * 0.07} 0 0 1 ${x + h * 0.07} ${yb - h * 0.12}L${x + h * 0.07} ${yb}Z`, lt, ' opacity="0.8"');
  s += tower(x - h * 0.52, h * 0.11, h * 0.36, h * 0.16) + tower(x + h * 0.54, h * 0.11, h * 0.32, h * 0.15);
  return s;
}

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
function far(m) {
  const L = LAND[m], hz = HAZE[m], c = CLOUD[m];
  const toneF = t => col => mix(col, hz, t);
  let o = '';
  // ---- tiny high islands (very hazy): they fill tall portrait skies, sit behind the HUD in landscape
  const tH = toneF(0.62);
  for (const [x, y, w, tr] of [[96, 176, 58, [[-0.1, 5, 0], [0.2, 4, 2]]], [436, 258, 76, [[-0.2, 6, 1], [0.15, 5, 0]]], [742, 204, 50, [[0.05, 5, 0]]], [1104, 300, 66, [[-0.15, 5, 2], [0.2, 6, 0]]], [262, 74, 44, [[0.0, 4, 0]]], [612, 88, 52, [[-0.15, 5, 2], [0.18, 4, 0]]], [930, 66, 40, [[0.05, 4, 1]]]]) o += both(xx => island(m, xx, y, w, tH, { trees: tr, seed: x }), x, w / 2 + 6);
  // small wisps near the high islands
  const wisp = { ...c, base: mix(c.base, hz, 0.5), shade: mix(c.shade, hz, 0.5), hi: mix(c.hi, hz, 0.3) };
  o += cloudMass([[66, 196, 16], [96, 190, 20], [124, 198, 14], [470, 290, 15], [500, 284, 19], [530, 292, 13], [1076, 324, 14], [1102, 318, 18], [1130, 326, 12], [588, 104, 12], [612, 99, 15], [638, 106, 11]], wisp, { hiMin: 99 });
  // ---- castle on its cloud mound (x 860)
  const cm = { ...c, base: mix(c.base, hz, 0.35), shade: mix(c.shade, hz, 0.4), hi: c.hi };
  o += castle(m, 860, 598, 196, mix(CASTLE[m], hz, 0.25));
  o += cloudMass([[760, 600, 40], [810, 590, 48], [866, 584, 54], [924, 592, 46], [968, 604, 36], [720, 612, 30]], cm, { hl: 0.6 });
  if (m === 'winter') o += P('M800 467L813 446L824 467Z M906 471L918 450L930 471Z', '#FFFFFF', ' opacity="0.55"');   // snowy roof tips (pale)
  // ---- big far islands (hazy)
  const tF = toneF(0.42);
  o += island(m, 210, 470, 214, tF, { trees: [[-0.3, 9, 0], [-0.12, 12, 1], [0.12, 9, 2], [0.3, 8, 0]], seed: 2 });
  o += island(m, 560, 430, 132, tF, { trees: [[-0.18, 8, 2], [0.16, 10, 0]], seed: 5 });
  o += island(m, 1050, 506, 168, tF, { trees: [[-0.26, 10, 1], [0.08, 8, 0], [0.3, 7, 2]], seed: 8 });
  // ---- the distant sea of clouds (two rows, hazy, solid from FAR_SOLID)
  const sea1 = { ...c, base: mix(c.base, hz, 0.45), shade: mix(c.shade, hz, 0.45), hi: mix(c.hi, hz, 0.2) };
  o += cloudMass(puffRow(12, x => 600 + wave(x, [[2, 10, 0.4], [3, 6, 2.1]]), 56, 26, 11), sea1, { solidY: 636, solidH: 90, solidFill: sea1.base, hiMin: 999 });
  const sea2 = { ...c, base: mix(c.base, hz, 0.3), shade: mix(c.shade, hz, 0.32), hi: c.hi };
  o += cloudMass(puffRow(15, x => 654 + wave(x, [[1, 8, 1.2], [4, 5, 0.3]]), 44, 22, 13), sea2, { solidY: 668, solidH: 56, solidFill: sea2.base, hl: 0.35, hiMin: 60 });
  return svg(1200, 720, o, '', `sky ${skyTop(m)} ${skyBot(m)}`);
}

// =====================================================================================================
// MID (0 0 1200 300): big puffy banks + 3 small floating islands
// =====================================================================================================
function mid(m) {
  const c = CLOUD[m], hz = HAZE[m];
  let o = '';
  // ---- back bank (hazy, no outline)
  const back = { ...c, base: mix(c.base, hz, 0.22), shade: mix(c.shade, hz, 0.25), hi: c.hi };
  o += cloudMass(puffRow(15, x => 196 + wave(x, [[1, 18, 0.7], [3, 10, 2.4], [5, 5, 0.1]]), 44, 34, 21), back, { solidY: 232, solidH: 70, solidFill: back.base, hl: 0.35, hiMin: 70 });
  // ---- islands (slightly hazed, thin outline)
  const tI = col => mix(col, hz, 0.14);
  o += island(m, 300, 82, 150, tI, { out: true, ow: 2, trees: [[-0.3, 11, 0], [-0.08, 15, 1], [0.24, 10, 2]], seed: 3, fall: 96 });
  o += island(m, 790, 50, 104, tI, { out: true, ow: 2, trees: [[-0.12, 11, 2], [0.22, 9, 0]], seed: 6 });
  o += island(m, 1090, 124, 82, tI, { out: true, ow: 1.8, trees: [[0.0, 10, 0]], seed: 9 });
  // ---- front bank (outline, cel shade, highlights)
  o += cloudMass(puffRow(20, x => 238 + wave(x, [[2, 9, 1.9], [5, 6, 0.6], [7, 3, 2.2]]), 34, 26, 31), c, { olw: 2.5, solidY: 262, solidH: 40, solidFill: c.base, hl: 0.55, hiMin: 44 });
  // a soft deep band at the very bottom (hidden by the ground on screen; avoids a hard edge if it peeks through)
  o += R(-2, 286, W + 4, 14, c.shade, ' opacity="0.5"');
  return svg(1200, 300, o);
}

// =====================================================================================================
// GROUND (0 0 1200 260): the fluffy cloud floor; rows CALM stay plain
// =====================================================================================================
function ground(m) {
  const c = CLOUD[m], L = LAND[m];
  let o = '', defs = '';
  // body gradient: lit base → shade → GROUND_BOTTOM
  defs += lg('gb', [[0, c.base], [0.45, mix(c.base, c.shade, 0.35)], [0.85, mix(c.shade, GROUND_BOTTOM[m], 0.5)], [1, GROUND_BOTTOM[m]]], V);
  const edge = x => 72 + wave(x, [[2, 5, 0.3], [3, 4, 1.7], [7, 2, 0.9]]);
  const puffs = puffRow(30, edge, 26, 16, 41, 0.3);
  // a few bigger puffs behind for a rounder skyline
  const big = puffRow(8, x => 88 + wave(x, [[1, 6, 2.0]]), 50, 12, 43, 0.2);
  o += cloudMass(big, { ...c, base: mix(c.base, c.shade, 0.25) }, { olw: 3, hl: 0.5 });
  // main row: outline → body rect (gradient) → shade → lit → highlight
  let olp = '', sh = '', lit = '', hi = '';
  for (const [x, y, r] of puffs) {
    olp += both(xx => C(xx, y, r + 1.5, c.ol), x, r + 3);
    sh += both(xx => C(xx, y, r, c.shade), x, r + 2);
    lit += both(xx => C(xx - r * 0.12, y - r * 0.16, r * 0.84, c.base), x, r + 2);
    if (r > 34) hi += both(xx => E(xx - r * 0.36, y - r * 0.46, r * 0.3, r * 0.14, c.hi, ' opacity="0.6"' + rot(xx - r * 0.36, y - r * 0.46, -26)), x, r);
  }
  o += olp + R(-2, 96, W + 4, 166, 'url(#gb)') + sh + lit + hi;
  // the body below the puffs: a lit band right under the puffs so the floor reads as one soft surface
  o += R(-2, 102, W + 4, 20, c.base, ' opacity="0.7"');
  // calm rows: two very faint scallop contour lines (depth), nothing else
  const scallop = (y0, sp, amp, ph) => { let d = ''; for (let x = -sp + ph; x < W + sp; x += sp) d += T`M${x} ${y0}Q${x + sp / 2} ${y0 - amp} ${x + sp} ${y0}`; return d; };
  o += S(scallop(160, 150, 16, 40), c.shade, 2.5, ' opacity="0.45"') + S(scallop(222, 100, 12, 0), c.deep, 2.5, ' opacity="0.45"');
  // ---- season decoration (on the puff tops, and below the calm rows)
  const topAt = x => { let best = 999; for (const [px, py, r] of puffs) for (const dx of [-W, 0, W]) { const u = x - (px + dx); if (Math.abs(u) < r) best = Math.min(best, py - Math.sqrt(r * r - u * u)); } return best; };
  const deco = [];
  for (let k = 0; k < 24; k++) { const x = k * 50 + 20 + hsh(k, 51) * 14; deco.push([x, topAt(x) + 5 + hsh(k, 52) * 6, k]); }
  const low = []; for (let k = 0; k < 15; k++) low.push([k * 80 + 30 + hsh(k, 61) * 30, 232 + hsh(k, 62) * 18, k]);
  if (m === 'spring') {
    const fl = (x, y, s0, col) => { let s = ''; for (let p = 0; p < 5; p++) { const a = p * 1.2566 - 1.57; s += E(x + Math.cos(a) * 3.2 * s0, y + Math.sin(a) * 3.2 * s0, 2.8 * s0, 2.2 * s0, col, rot(x + Math.cos(a) * 3.2 * s0, y + Math.sin(a) * 3.2 * s0, a * 57.3)); } return s + C(x, y, 1.6 * s0, '#F6E4A8'); };
    for (const [x, y, k] of deco) if (k % 2 === 0) o += both(xx => fl(xx, y, 1 + (k % 3) * 0.15, k % 4 ? '#F6CFDD' : '#FBE3EC') + (k % 3 === 0 ? fl(xx + 11, y + 4, 0.8, '#F3C3D5') : ''), x, 18);
    for (const [x, y, k] of low) if (k % 2) o += both(xx => E(xx, y, 4, 2.4, '#F6D4E0', rot(xx, y, k * 40)) + E(xx + 9, y + 3, 3.4, 2, '#F9E0E9', rot(xx + 9, y + 3, k * 70)), x, 14);
  } else if (m === 'summer') {
    const gl = (x, y, s0) => P(T`M${x} ${y - 6 * s0}Q${x + 1} ${y - 1} ${x + 6 * s0} ${y}Q${x + 1} ${y + 1} ${x} ${y + 6 * s0}Q${x - 1} ${y + 1} ${x - 6 * s0} ${y}Q${x - 1} ${y - 1} ${x} ${y - 6 * s0}Z`, '#FFFFFF') + C(x, y, 1.4 * s0, '#FFF6D8');
    for (const [x, y, k] of deco) if (k % 3 !== 1) o += both(xx => gl(xx, y - 4, 0.9 + (k % 3) * 0.3), x, 10);
    for (const [x, y, k] of low) o += both(xx => gl(xx, y, 0.8) + C(xx + 14, y + 4, 1.6, '#FFFFFF', ' opacity="0.9"'), x, 18);
  } else if (m === 'autumn') {
    const leaf = (x, y, s0, a, col, cs) => `<g${rot(x, y, a)}>` + P(T`M${x - 6 * s0} ${y}Q${x - 1} ${y - 4.5 * s0} ${x + 6 * s0} ${y}Q${x - 1} ${y + 4.5 * s0} ${x - 6 * s0} ${y}Z`, col) + S(T`M${x - 6 * s0} ${y}L${x + 5 * s0} ${y}`, cs, 0.9) + '</g>';
    const LC = [['#E4B98A', '#C79A6C'], ['#DDA982', '#BE8A66'], ['#E8C79A', '#C9A574']];
    for (const [x, y, k] of deco) if (k % 3 === 0) o += both(xx => leaf(xx, y, 1.1, k * 37 % 80 - 40, ...LC[k % 3]), x, 10);
    for (const [x, y, k] of low) if (k % 2 === 0) o += both(xx => leaf(xx, y, 1, k * 53 % 120 - 60, ...LC[(k + 1) % 3]), x, 10);
  } else {   // winter: brighter snow lumps on some puffs + snow sparkles
    for (const [x, y, k] of deco) if (k % 3 === 0) o += both(xx => E(xx, y - 3, 12, 4.5, '#FFFFFF', ' opacity="0.9"'), x, 14);
    const sp = (x, y, s0) => P(T`M${x} ${y - 5 * s0}L${x + 1} ${y - 1}L${x + 5 * s0} ${y}L${x + 1} ${y + 1}L${x} ${y + 5 * s0}L${x - 1} ${y + 1}L${x - 5 * s0} ${y}L${x - 1} ${y - 1}Z`, '#FFFFFF') + C(x, y, 1, '#E8F2FF');
    for (const [x, y, k] of deco) if (k % 2) o += both(xx => sp(xx, y - 2, 0.8 + (k % 3) * 0.2), x, 8);
    for (const [x, y, k] of low) o += both(xx => C(xx, y, 2, '#FFFFFF', ' opacity="0.95"') + C(xx + 12, y - 5, 1.4, '#FFFFFF', ' opacity="0.9"') + (k % 2 ? sp(xx + 24, y + 2, 0.7) : ''), x, 30);
  }
  return svg(1200, 260, o, defs, `ground ${m}: floor top ≈ y ${GROUND_TOP}…60, calm rows ${CALM[0]}…${CALM[1]}, bottom ${GROUND_BOTTOM[m]}`);
}

// =====================================================================================================
// CUSHION (0 0 300 120, top-centre anchor (150, 30) = Bao's feet)
// =====================================================================================================
function cushion(m) {
  const c = CLOUD[m];
  const cc = { ...c, ol: mix(c.ol, '#7E7290', 0.2) };
  let o = '';
  o += E(150, 112, 128, 8, mix(GROUND_BOTTOM[m], '#7E7290', 0.25), ' opacity="0.35"');   // contact shadow on the floor
  const puffs = [[44, 50, 22], [256, 50, 22], [70, 36, 28], [230, 36, 28], [104, 46, 28], [196, 46, 28], [150, 54, 32], [126, 44, 22], [174, 44, 22]];
  let ol = '', sh = '', lit = '', hi = '';
  for (const [x, y, r] of puffs) {
    ol += C(x, y, r + 2, cc.ol);
    sh += C(x, y, r, c.shade);
    lit += C(x - r * 0.12, y - r * 0.16, r * 0.84, c.base);
    if (r >= 22 && y < 70) hi += E(x - r * 0.36, y - r * 0.44, r * 0.3, r * 0.15, c.hi, ' opacity="0.9"' + rot(x - r * 0.36, y - r * 0.44, -26));
  }
  // a smooth flat-bottomed base (soft rounded slab) under the puffs
  ol += R(20, 52, 260, 60, cc.ol, ' rx="30"'); sh = R(22, 54, 256, 56, c.shade, ' rx="28"') + sh; lit = R(28, 52, 238, 42, c.base, ' rx="21"') + lit;
  o += ol + sh + lit + hi;
  o += S('M48 100Q100 108 150 106Q200 108 252 100', c.deep, 3, ' opacity="0.6"');
  // a soft dimple where Bao sits
  o += E(150, 33, 46, 6, c.shade, ' opacity="0.55"');
  if (m === 'spring') {
    const fl = (x, y, s0, col) => { let s = ''; for (let p = 0; p < 5; p++) { const a = p * 1.2566 - 1.57; s += E(x + Math.cos(a) * 3.4 * s0, y + Math.sin(a) * 3.4 * s0, 3 * s0, 2.3 * s0, col, rot(x + Math.cos(a) * 3.4 * s0, y + Math.sin(a) * 3.4 * s0, a * 57.3)); } return s + C(x, y, 1.8 * s0, '#F6E4A8'); };
    o += fl(58, 22, 1.2, '#F6CFDD') + fl(78, 30, 0.9, '#FBE3EC') + fl(244, 24, 1.1, '#F3C3D5');
  } else if (m === 'summer') {
    o += P('M246 12Q247 20 254 21Q247 22 246 30Q245 22 238 21Q245 20 246 12Z', '#FFFFFF') + P('M62 22Q62.6 26 66 26.5Q62.6 27 62 31Q61.4 27 58 26.5Q61.4 26 62 22Z', '#FFFFFF');
  } else if (m === 'autumn') {
    o += `<g${rot(246, 22, -24)}>` + P('M238 22Q245 16 254 22Q245 28 238 22Z', '#E2B387') + S('M238 22L252 22', '#C49468', 1) + '</g>' + `<g${rot(62, 26, 30)}>` + P('M55 26Q61 21 69 26Q61 31 55 26Z', '#E8C79A') + S('M55 26L67 26', '#C9A574', 1) + '</g>';
  } else {
    o += E(150, 26, 40, 6, '#FFFFFF') + E(68, 12, 20, 6, '#FFFFFF') + E(232, 12, 20, 6, '#FFFFFF');
    o += P('M250 40L251 45L256 46L251 47L250 52L249 47L244 46L249 45Z', '#FFFFFF') + C(84, 40, 1.6, '#FFFFFF');
  }
  return svg(300, 120, o, '', `cushion ${m}: top-centre anchor (150,30) = Bao's feet`);
}

// =====================================================================================================
// SUN, MOON, CLOUDS
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

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of SEASONS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); wr(env, 'cushion_' + m, cushion(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no external refs, ≤ 1 blur
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|href=|url\((?!#)|feGaussianBlur[\s\S]*feGaussianBlur/.test(s)) throw new Error('SVG rule broken in ' + fn);
  }
  let kb = 0; for (const fn of fs.readdirSync(env)) kb += fs.statSync(path.join(env, fn)).size;
  console.log('wrote env (' + SEASONS.length * 4 + ' layers + sun, moon, clouds; ' + Math.round(kb / 1024) + ' KB) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { SEASONS, SKY, HAZE, CLOUD, GROUND_BOTTOM, LAND, GROUND_TOP, GROUND_ROW, CALM, MID_BASE, MID_SOLID, FAR_SOLID, CUSHION };
if (require.main === module) main();
