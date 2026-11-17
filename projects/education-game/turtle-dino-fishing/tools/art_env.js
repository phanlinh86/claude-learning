// Tibo's Dino Lake Fishing: dinosaur-valley LAKE environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,bed}_{morning,noon,sunset,night}.svg, env/{rock,reeds,weed,sun,moon,cloud_a,
// cloud_b,smoke}.svg and game/assets/default/particles/{mote,sparkle,glint,firefly,star,dot,drop,bubble,leaf_a,leaf_b,
// confetti_a,confetti_b,petal}.svg; any other (old) env / particle file is deleted. (DESIGN §3, §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + RECIPE: node tools/env_scenes.js
//
// Look: a calm prehistoric valley lake. far = hazy blue-violet back range, a gentle volcano (smoke is env/smoke.svg, drawn by
// code at FAR_CRATER), a mesa with a waterfall ribbon falling into the valley, soft sage hills; mid = the lake's FAR SHORE:
// tree ferns, palm-like cycads, a few soft long-neck dinosaur silhouettes, bushes and a sand strip whose bottom row (300)
// sits exactly on surfaceY; bed = sandy lake bed (ripples, pebbles, shells, a tiny ammonite, weed tufts) seen through water.
// Colour rule (DESIGN §3): everything is desaturated sage / blue-violet / sand; no saturated red / blue / yellow / green /
// orange / purple anywhere, so the answer colours pop. Night = deep blue with moonlit rims; sunset = warm peach.
//
// Tiling: every layer is 1200 wide; silhouettes are periodic functions of x (gaussian peaks on the wrapped distance, integer
// harmonics) and props crossing x = 0 / 1200 are drawn twice (x and x ∓ 1200) → both edges match (docs/art/env_seams.png).
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far  0 0 1200 720 : transparent top; tallest point = volcano rim row ≈ 498 (crater FAR_CRATER = [760, 500]); back range
//                       peaks ≈ 520…560; mesa top 566 (waterfall x 404…428 from 570 down to the pool ≈ 676); hills 630…690.
//                       Row 720 = surfaceY (the mid shore hides rows ≥ ≈ 680).
//   mid  0 0 1200 300 : transparent top; tree-fern crowns ≈ rows 110…170, cycads ≈ 170…230, dinos ≈ 175…285, bank ≈ 255,
//                       sand strip 276…300. Row 300 = surfaceY (water covers rows ≥ 294).
//   bed  0 0 1200 200 : transparent above BED_TOP ≈ 52 (sand crest); bottom row 200 = H.
//   rock 0 0 320 260  : seat (150, 70); waterline row ≈ 106 at in-game scale; the rock fades out below row ≈ 150 (mask), so
//                       only a ghostly underwater base shows through the lake. Bottom-centre anchor (160, 260).
//   reeds 0 0 200 260 : bottom anchor (100, 260) = where the stems enter the water.  weed 0 0 80 200: bottom anchor (40, 200).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const FAR_CRATER = [760, 500], FAR_FALL = [416, 570, 676];
const MID_BASE = 300, BED_TOP = 52;
const ROCK = { w: 320, h: 260, anchor: [160, 260], seat: [150, 70], fadeFrom: 114 };
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
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);
const pd = d => ((d % W) + W * 1.5) % W - W / 2;                 // wrapped distance in [-600, 600)
const peaks = (x, list) => list.reduce((s, [cx, h, w]) => s - h * Math.exp(-Math.pow(pd(x - cx) / w, 2)), 0);
const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ridgePoly = (fn, bottom, step = 4) => { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, fn(x)]); pts.push([W, bottom]); return poly(pts); };
const ridgeLine = (fn, step = 4, dy = 0) => line(Array.from({ length: W / step + 1 }, (_, i) => [i * step, fn(i * step) + dy]));

// ---------------- palettes ----------------
const SKY = {   // DESIGN §3 exact top / bottom, plus a mid stop (at 55 % of the sky band)
  morning: ['#BFE6F2', '#DDEDE6', '#FBE9C9'], noon: ['#8FD0F0', '#B8E3F4', '#E6F6FA'],
  sunset: ['#F6B48A', '#F8C9A0', '#FBE3B8'], night: ['#1E2A55', '#2C3A6A', '#3B4C7E'],
};
const WATER = { morning: ['#9FD9D6', '#5FAFB4'], noon: ['#8FD6DA', '#4E9FB0'], sunset: ['#B9C6C4', '#6E8C9A'], night: ['#3D5677', '#22344F'] };
// mood grading: base colour → TINT by t → hazed toward HAZE by distance
const TINT = { morning: ['#FFF0D8', 0.08], noon: ['#FFFFFF', 0], sunset: ['#E79A7C', 0.24], night: ['#1F2B57', 0.58] };
const HAZE = { morning: '#E3EEEA', noon: '#D6EDF5', sunset: '#F7CDA8', night: '#3A4A7A' };
const RIM = { morning: '#FFF6E2', noon: '#FFFFFF', sunset: '#FFE3BC', night: '#C4D2F4' };   // rim light (night = moonlight)
const RIM_A = { morning: 0.5, noon: 0.45, sunset: 0.6, night: 0.7 };
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#2E3440', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
// base colours (noon), all calm / desaturated
const MTN = { back: '#BCC4E0', range: '#A3ABD0', rangeL: '#BBC2E0', volc: '#ADA0BF', volcL: '#C4B9D2', volcD: '#9488AA', mesa: '#A9A4C6', hill: '#A3BDAE', hill2: '#93AF9F' };
const PLANT = { frond: '#8DA97C', frondD: '#718F66', frondL: '#A9C196', trunk: '#9A8468', trunkD: '#7A6750', cyc: '#97AF80', cycD: '#7A9468' };
const DINO = { c: '#A9B3C9', l: '#C3CADB', d: '#949FB8' };
const SHORE = { bank: '#A9BD95', bankD: '#90A67F', sand: '#E5D7B4', sandD: '#CDBD98', peb: '#C9C0B0' };
const BED = { sand: '#E2D2A9', sandD: '#C9B68C', peb: '#C4BBAA', shell: '#F1E6D2', weed: '#86A88D' };

// =====================================================================================================
// FAR (0 0 1200 720): back range, volcano, mesa + waterfall, hills. Bottom-anchored on surfaceY.
// =====================================================================================================
const BACK = x => 600 + wave(x, [[1, 10, 0.3], [3, 6, 1.4], [8, 2.5, 0.2]]) + peaks(x, [[80, 70, 70], [250, 50, 60], [560, 82, 80], [1000, 64, 75], [1130, 46, 50], [380, 34, 50]]);
const VOLC = x => { const d = pd(x - FAR_CRATER[0]); const h = (218 / Math.pow(1 + Math.pow(d / 150, 2), 0.85) - 22) * 1.11; return 720 - Math.max(0, Math.min(h, 220)) + (Math.abs(d) < 36 ? 7 * (1 - Math.pow(d / 36, 2)) : 0); };
const RANGE = x => 648 + wave(x, [[2, 6, 0.9], [5, 3, 2.1]]) + peaks(x, [[160, 66, 58], [300, 40, 46], [620, 52, 60], [960, 70, 64], [1080, 46, 44]]) +
  (Math.abs(pd(x - 416)) < 64 ? Math.min(0, -82 + 82 * Math.pow(Math.max(0, Math.abs(pd(x - 416)) - 46) / 18, 2)) : 0);
const HILL = x => 684 + wave(x, [[3, 5, 0.5], [7, 3, 1.7], [11, 1.5, 0.3]]) + peaks(x, [[60, 22, 70], [300, 18, 60], [560, 26, 90], [880, 20, 80], [1060, 16, 60]]) +
  8 * Math.exp(-Math.pow(pd(x - 416) / 30, 2));
function far(m) {
  const night = m === 'night';
  let o = '', defs = '';
  // ---- 0 back range (very hazy) with lit faces + snowless soft ridges
  const cB = tone(m, MTN.back, night ? 0.35 : 0.5), cBL = mix(cB, RIM[m], night ? 0.12 : 0.22);
  o += P(ridgePoly(BACK, 720), cB);
  o += litFaces(BACK, [[80, 70, 70], [560, 82, 80], [1000, 64, 75], [250, 50, 60]], 720, cBL, 'cb');
  o += S(ridgeLine(BACK, 4, 1), RIM[m], 1.6, ` opacity="${f(RIM_A[m] * 0.6)}"`);
  // ---- 1 volcano: concave cone, lit left flank, gullies, crater rim (a faint warm glow inside at night / sunset)
  const cV = tone(m, MTN.volc, night ? 0.22 : 0.3), cVL = mix(tone(m, MTN.volcL, night ? 0.22 : 0.3), RIM[m], night ? 0.1 : 0.12), cVD = tone(m, MTN.volcD, night ? 0.22 : 0.3);
  const vol = (vx, id) => {
    const vpts = []; for (let x = vx - 560; x <= vx + 560; x += 4) vpts.push([x, VOLC(x)]);
    const vPath = poly([[vx - 560, 720], ...vpts, [vx + 560, 720]]);
    let v = `<clipPath id="${id}"><path d="${vPath}"/></clipPath>` + P(vPath, cV);
    v += `<g clip-path="url(#${id})">` + P(T`M${vx - 560} 720L${vx - 560} 400L${vx - 20} 400Q${vx - 26} 560 ${vx - 120} 720Z`, cVL, ' opacity="0.85"') +
      P(T`M${vx + 40} 480Q${vx + 70} 600 ${vx + 200} 720L${vx + 560} 720L${vx + 560} 480Z`, cVD, ' opacity="0.55"');
    let gul = ''; for (const [dx, len, bend] of [[-58, 120, -30], [-22, 150, -8], [18, 140, 12], [52, 110, 34], [-100, 60, -26]]) { const y0 = VOLC(vx + dx) + 6; gul += T`M${vx + dx} ${y0}Q${vx + dx + bend * 0.4} ${y0 + len * 0.5} ${vx + dx + bend} ${y0 + len}`; }
    v += S(gul, cVD, 3, ' opacity="0.5"') + `</g>`;
    v += E(vx, VOLC(vx) - 1, 34, 6, dk(cV, 0.18)) + S(T`M${vx - 36} ${VOLC(vx - 36) + 1}Q${vx} ${VOLC(vx) + 5} ${vx + 36} ${VOLC(vx + 36) + 1}`, lt(cV, 0.25), 2.4, ' opacity="0.8"');
    if (m === 'sunset' || night) v += E(vx, VOLC(vx) - 2, 44, 12, 'url(#cg)', ` opacity="${night ? 0.55 : 0.4}"`);
    v += S(line(vpts.filter(p => p[0] >= vx - 300 && p[0] <= vx - 34)), RIM[m], 2, ` opacity="${f(RIM_A[m] * 0.8)}"`);
    return v;
  };
  if (m === 'sunset' || night) defs += rg('cg', [[0, '#F2C4A0', 0.7], [1, '#F2C4A0', 0]]);
  o += vol(FAR_CRATER[0], 'vc') + vol(FAR_CRATER[0] - W, 'vc2');
  // ---- 2 mid range (blue-violet) with the waterfall mesa at x 416
  const cR = tone(m, MTN.range, night ? 0.12 : 0.2), cRL = mix(tone(m, MTN.rangeL, night ? 0.12 : 0.2), RIM[m], night ? 0.08 : 0.1);
  o += P(ridgePoly(RANGE, 720), cR);
  o += litFaces(RANGE, [[160, 66, 58], [620, 52, 60], [960, 70, 64], [300, 40, 46]], 720, cRL, 'cr');
  // mesa: lit top band + strata lines
  const fx = FAR_FALL[0];
  o += P(T`M${fx - 62} ${RANGE(fx - 62)}L${fx - 46} 568Q${fx} 562 ${fx + 46} 568L${fx + 60} ${RANGE(fx + 60)}L${fx + 40} 592Q${fx} 586 ${fx - 44} 592Z`, cRL, ' opacity="0.9"');
  o += S(T`M${fx - 50} 604Q${fx} 598 ${fx + 50} 604M${fx - 54} 622Q${fx} 616 ${fx + 54} 622`, dk(cR, 0.12), 2, ' opacity="0.5"');
  o += S(ridgeLine(RANGE, 4, 1), RIM[m], 1.8, ` opacity="${f(RIM_A[m] * 0.7)}"`);
  // ---- waterfall: ribbon with stripes, falls into a pool behind the hills, foam + spray puffs
  const wf = night ? '#AFC0DE' : m === 'sunset' ? '#F4EEE6' : '#EEF8F7', ws = night ? '#8EA2C8' : m === 'sunset' ? '#D9DCDA' : '#C7E4E6';
  const [, wTop, wBot] = FAR_FALL;
  o += P(T`M${fx - 13} ${wTop}Q${fx - 15} ${(wTop + wBot) / 2} ${fx - 18} ${wBot}L${fx + 18} ${wBot}Q${fx + 15} ${(wTop + wBot) / 2} ${fx + 13} ${wTop}Q${fx} ${wTop - 4} ${fx - 13} ${wTop}Z`, wf);
  o += S(T`M${fx - 6} ${wTop + 8}L${fx - 8} ${wBot - 4}M${fx + 5} ${wTop + 18}L${fx + 7} ${wBot - 8}M${fx - 1} ${wTop + 40}L${fx - 1} ${wBot - 20}`, ws, 2.2, ' opacity="0.9"');
  o += P(T`M${fx - 16} ${wTop}Q${fx} ${wTop - 6} ${fx + 16} ${wTop}Q${fx} ${wTop + 4} ${fx - 16} ${wTop}Z`, lt(wf, 0.4));
  // ---- 3 hills (sage) with tiny far cycads / conifers
  const cH = tone(m, MTN.hill, night ? 0.06 : 0.12), cH2 = tone(m, MTN.hill2, night ? 0.06 : 0.12);
  o += P(ridgePoly(HILL, 720), cH);
  let tr = '';
  for (let k = 0; k < 26; k++) {
    const x = k * 46 + 12 + (k * 17) % 19; if (Math.abs(pd(x - fx)) < 46) continue;
    const y = HILL(x) + 6, h = 14 + (k * 7) % 12, cyc = k % 3 === 0;
    tr += both(xx => cyc ? P(T`M${xx} ${y}L${xx} ${y - h}`, 'none', OL(cH2, 2.4)) + E(xx - 5, y - h, 7, 3, cH2, ` transform="rotate(-25 ${f(xx - 5)} ${f(y - h)})"`) + E(xx + 5, y - h, 7, 3, cH2, ` transform="rotate(25 ${f(xx + 5)} ${f(y - h)})"`) + E(xx, y - h - 3, 3, 6, cH2)
      : P(T`M${xx - 7} ${y}Q${xx - 5} ${y - h * 0.6} ${xx} ${y - h}Q${xx + 5} ${y - h * 0.6} ${xx + 7} ${y}Z`, cH2), x, 10);
  }
  o += tr;
  o += S(ridgeLine(HILL, 4, 1), RIM[m], 1.6, ` opacity="${f(RIM_A[m] * 0.6)}"`);
  // waterfall foam where it meets the hills
  const foam = lt(wf, 0.2);
  o += C(fx - 16, wBot - 4, 10, foam, ' opacity="0.9"') + C(fx, wBot - 8, 13, foam, ' opacity="0.95"') + C(fx + 17, wBot - 4, 10, foam, ' opacity="0.9"') + C(fx - 4, wBot + 2, 12, foam, ' opacity="0.8"');
  // ---- horizon haze (thicker low) — calm behind the far shore
  defs += lg('hz', [[0, HAZE[m], 0], [0.5, HAZE[m], night ? 0.25 : 0.35], [1, HAZE[m], night ? 0.4 : 0.55]], V);
  o += R(0, 560, W, 160, 'url(#hz)');
  return svg(1200, 720, o, defs, `sky ${SKY[m][0]} ${SKY[m][2]}`);
}
// lighter left faces of gaussian peaks (light from the upper left), clipped to the ridge
function litFaces(fn, list, bottom, col, id) {
  let s = `<clipPath id="${id}"><path d="${ridgePoly(fn, bottom)}"/></clipPath><g clip-path="url(#${id})">`;
  for (const [cx, h, w] of list) {
    const draw = c => { const top = fn(c); return P(T`M${c - w * 2.2} ${bottom}L${c - w * 2.2} ${top - 40}L${c} ${top - 4}Q${c + w * 0.05} ${top + h * 0.6} ${c - w * 0.5} ${bottom}Z`, col, ' opacity="0.8"'); };
    s += both(draw, cx, w * 2.3);
  }
  return s + '</g>';
}

// =====================================================================================================
// MID (0 0 1200 300): the far shore — tree ferns, cycads, long-neck silhouettes, bushes, sand strip
// =====================================================================================================
const BANK = x => 262 + wave(x, [[2, 4, 0.6], [5, 3, 2.0], [13, 1.4, 0.4]]);
const SAND = x => 280 + wave(x, [[3, 2, 1.2], [9, 1.2, 0.2]]);
function lobes(list, col, colS, colL) {
  let s = '';
  for (const [x, y, r] of list) s += C(x, y, r, colS);
  for (const [x, y, r] of list) s += C(x - r * 0.12, y - r * 0.16, r * 0.84, col);
  for (const [x, y, r] of list) if (r > 10) s += E(x - r * 0.36, y - r * 0.4, r * 0.3, r * 0.18, colL, ` opacity="0.7" transform="rotate(-30 ${f(x - r * 0.36)} ${f(y - r * 0.4)})"`);
  return s;
}
// one frond: quadratic midrib p0 → c → tip with leaflets on both sides; droop = leaflets hang down (tree fern) or comb (cycad)
function frond(p0, c, tip, Lf, col, colD, sw, narrow) {
  const bz = t => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * tip[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * tip[1]];
  let leaf = '';
  const seg = narrow ? 12 : 9;
  for (let q = 1; q < seg; q++) {
    const t = q / seg, p = bz(t), p2 = bz(Math.min(1, t + 0.05));
    const dx = p2[0] - p[0], dy = p2[1] - p[1], dl = Math.hypot(dx, dy) || 1, tX = dx / dl, tY = dy / dl, nX = -tY, nY = tX;
    const L = Lf * Math.sin(Math.PI * (0.15 + 0.85 * t)) * (1.1 - t * 0.4);
    for (const sd of [-1, 1]) {
      // leaflets lean toward the tip and a bit downward (gravity)
      const ex = p[0] + nX * sd * L + tX * L * 0.5, ey = p[1] + nY * sd * L + tY * L * 0.5 + L * 0.35;
      const w = narrow ? 0.18 : 0.32;
      const mx = (p[0] + ex) / 2, my = (p[1] + ey) / 2;
      leaf += T`M${p[0]} ${p[1]}Q${mx - tY * L * w * -1} ${my + tX * L * w * -1} ${ex} ${ey}Q${mx + tX * L * w} ${my + tY * L * w} ${p[0] + tX * L * 0.3} ${p[1] + tY * L * 0.3}Z`;
    }
  }
  return P(leaf, col) + S(T`M${p0[0]} ${p0[1]}Q${c[0]} ${c[1]} ${tip[0]} ${tip[1]}`, colD, sw);
}
function treeFern(m, x, yb, h, k, seed, haze) {
  const tc = tone(m, PLANT.trunk, haze), td = tone(m, PLANT.trunkD, haze), fc = tone(m, PLANT.frond, haze), fd = tone(m, PLANT.frondD, haze), fl = tone(m, PLANT.frondL, haze);
  const lean = (hsh(seed, 1) - 0.5) * 24 * k, tx = x + lean, ty = yb - h;
  let s = P(T`M${x - 8 * k} ${yb}Q${x - 6 * k + lean * 0.4} ${yb - h * 0.5} ${tx - 5 * k} ${ty}L${tx + 5 * k} ${ty}Q${x + 6 * k + lean * 0.4} ${yb - h * 0.5} ${x + 8 * k} ${yb}Z`, tc);
  let sc = ''; for (let i = 1; i < 9; i++) { const t = i / 9, yy = yb - h * t, xx = x + lean * t * t; sc += T`M${xx - 5 * k} ${yy}q${5 * k} ${3 * k} ${10 * k} 0`; }
  s += S(sc, td, 1.6 * k, ' opacity="0.7"');
  const n = 9, back = [], front = [];
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) / ((n - 1) / 2), side = Math.sign(u) || (hsh(seed, i) < 0.5 ? -1 : 1);
    const len = (58 + 22 * (1 - Math.abs(u)) + 12 * hsh(seed, i + 3)) * k;
    const reach = Math.abs(u) < 0.2 ? 0.25 : 0.55 + 0.45 * Math.abs(u);
    const tip = [tx + side * len * reach, ty + len * (0.15 + 0.45 * Math.abs(u)) - (Math.abs(u) < 0.2 ? len * 0.55 : 0)];
    const c = [tx + side * len * reach * 0.45, ty - len * (0.3 + 0.2 * (1 - Math.abs(u)))];
    (i % 2 ? back : front).push(frond([tx, ty], c, tip, 13 * k, i % 2 ? fd : fc, dk(fd, 0.15), 2 * k, false));
  }
  s += back.join('') + front.join('');
  s += C(tx, ty, 6 * k, fd) + E(tx - 2 * k, ty - 3 * k, 3 * k, 2 * k, fl, ' opacity="0.8"');
  return s;
}
function cycad(m, x, yb, k, seed, haze) {
  const tc = tone(m, PLANT.trunk, haze), td = tone(m, PLANT.trunkD, haze), fc = tone(m, PLANT.cyc, haze), fd = tone(m, PLANT.cycD, haze);
  const th = 44 * k, tw = 15 * k;
  let s = '';
  // fronds behind the trunk top
  const n = 11, fr = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + 0.25 + (i / (n - 1)) * (Math.PI - 0.5) + (hsh(seed, i) - 0.5) * 0.12, len = (62 + 16 * Math.sin(Math.PI * i / (n - 1)) + 8 * hsh(i, seed)) * k;
    const tip = [x + Math.cos(a) * len, yb - th + Math.sin(a) * len * 0.85 + len * 0.18 * Math.abs(Math.cos(a))];
    const c = [x + Math.cos(a) * len * 0.5, yb - th + Math.sin(a) * len * 0.6 - 6 * k];
    fr.push(frond([x, yb - th], c, tip, 9 * k, i % 2 ? fd : fc, dk(fd, 0.15), 1.8 * k, true));
  }
  s += fr.join('');
  // pineapple trunk
  s += P(T`M${x - tw} ${yb}Q${x - tw * 1.15} ${yb - th * 0.5} ${x - tw * 0.8} ${yb - th}L${x + tw * 0.8} ${yb - th}Q${x + tw * 1.15} ${yb - th * 0.5} ${x + tw} ${yb}Z`, tc);
  let dm = ''; for (let r = 0; r < 5; r++) for (let c = -1; c <= 1; c++) { const cx = x + (c + (r % 2) * 0.5 - 0.25) * tw * 0.62, cy = yb - th * (r + 0.6) / 5.4; dm += T`M${cx - 4 * k} ${cy}L${cx} ${cy - 4 * k}L${cx + 4 * k} ${cy}L${cx} ${cy + 4 * k}Z`; }
  s += P(dm, td, ' opacity="0.45"');
  s += P(T`M${x + tw * 0.3} ${yb}Q${x + tw * 0.75} ${yb - th * 0.5} ${x + tw * 0.5} ${yb - th}L${x + tw * 0.8} ${yb - th}Q${x + tw * 1.15} ${yb - th * 0.5} ${x + tw} ${yb}Z`, td, ' opacity="0.35"');
  return s;
}
// soft long-neck dinosaur silhouette (far away): faces right unless flip; s = scale (1 → ≈ 150 tall)
function longneck(x, yb, s, col, colL, colD, flip, headDown) {
  const g = [];
  const L = (dx, dy) => [dx * s, dy * s];
  // legs (back pair darker)
  for (const [lx, dark] of [[-26, 1], [30, 1], [-36, 0], [22, 0]]) g.push(P(T`M${lx * s - 7 * s} ${0}L${lx * s - 6 * s} ${-44 * s}L${lx * s + 8 * s} ${-44 * s}L${lx * s + 8 * s} ${0}Q${lx * s} ${3 * s} ${lx * s - 7 * s} ${0}Z`, dark ? colD : col));
  // tail
  g.push(P(T`M${-40 * s} ${-60 * s}Q${-90 * s} ${-52 * s} ${-128 * s} ${-18 * s}Q${-96 * s} ${-38 * s} ${-40 * s} ${-36 * s}Z`, col));
  // neck + head
  const hx = headDown ? 108 : 86, hy = headDown ? -40 : -146;
  g.push(P(T`M${30 * s} ${-74 * s}Q${62 * s} ${-90 * s} ${hx * s - 6 * s} ${hy * s + 6 * s}L${hx * s + 6 * s} ${hy * s + 12 * s}Q${70 * s} ${-70 * s} ${46 * s} ${-44 * s}Z`, col));
  g.push(E(hx * s + 4 * s, hy * s + 4 * s, 13 * s, 8.5 * s, col, ` transform="rotate(${headDown ? 50 : 8} ${f(hx * s + 4 * s)} ${f(hy * s + 4 * s)})"`));
  // body
  g.push(E(0, -58 * s, 52 * s, 27 * s, col));
  // lit back + neck rim (upper left light)
  g.push(S(T`M${-44 * s} ${-68 * s}Q${-10 * s} ${-90 * s} ${32 * s} ${-80 * s}Q${58 * s} ${-96 * s} ${hx * s - 8 * s} ${hy * s + 2 * s}`, colL, 4 * s, ' opacity="0.85"'));
  g.push(C(hx * s + 8 * s, hy * s + 1 * s, 1.8 * s, colD));
  const tr = flip ? `translate(${f(x)} ${f(yb)}) scale(-1 1)` : `translate(${f(x)} ${f(yb)})`;
  return `<g transform="${tr}">${g.join('')}</g>`;
}
function mid(m) {
  const night = m === 'night';
  let o = '', defs = '';
  const H1 = night ? 0.18 : 0.32, H2 = night ? 0.1 : 0.2, H3 = night ? 0.04 : 0.1;
  // ---- far shore tree line (hazy bushes) behind everything
  const bb = tone(m, SHORE.bankD, H1 + 0.08), bbS = mix(bb, HAZE[m], 0.1), bbL = lt(bb, 0.12);
  let bank = '';
  for (let k = 0; k < 40; k++) { const x = k * 30 + 15, r = 16 + hsh(k, 7) * 14, y = BANK(x) - r * 0.35; bank += both(xx => C(xx, y, r, bbS) + C(xx - r * 0.1, y - r * 0.14, r * 0.86, bb) + C(xx - r * 0.35, y - r * 0.4, r * 0.28, bbL, ' opacity="0.6"'), x, r); }
  o += bank;
  // ---- back tree ferns (hazy)
  for (const [x, h, k, sd] of [[90, 130, 0.8, 1], [1110, 140, 0.85, 4]]) o += both(xx => treeFern(m, xx, BANK(x) + 6, h, k, sd, H1), x, 90 * k);
  // ---- long-necks (soft, far away): a parent + baby pair and a lone one drinking at the shore
  const dc = tone(m, DINO.c, H2), dl = mix(tone(m, DINO.l, H2), RIM[m], night ? 0.35 : 0.2), dd = tone(m, DINO.d, H2);
  o += both(xx => longneck(xx, 284, 0.62, dc, dl, dd, false, false) + longneck(xx + 62, 285, 0.36, dc, dl, dd, false, false), 260, 90);
  o += both(xx => longneck(xx, 284, 0.56, dc, dl, dd, true, true), 860, 80);
  // ---- cycads + front tree ferns
  for (const [x, k, sd] of [[180, 0.9, 11], [560, 1.0, 12], [760, 0.8, 13], [1010, 0.95, 14]]) o += both(xx => cycad(m, xx, BANK(x) + 18, k, sd, H2), x, 80 * k);
  for (const [x, h, k, sd] of [[380, 165, 0.95, 21], [960, 175, 0.95, 22]]) o += both(xx => treeFern(m, xx, BANK(x) + 18, h, k, sd, H2), x, 95 * k);
  // ---- low bushes / ground ferns along the bank
  const bc = { c: tone(m, SHORE.bank, H3), s: tone(m, SHORE.bankD, H3), l: mix(tone(m, PLANT.frondL, H3), RIM[m], 0.15) };
  for (const [x, k] of [[40, 0.8], [300, 0.9], [520, 0.7], [700, 0.85], [1060, 0.8]]) o += both(xx => lobes([[xx - 22 * k, 274 - 10 * k, 15 * k], [xx, 272 - 18 * k, 21 * k], [xx + 22 * k, 274 - 10 * k, 16 * k]], bc.c, bc.s, bc.l), x, 44 * k);
  // ---- solid bank band + rim
  const bk = tone(m, SHORE.bank, H3);
  { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 6) pts.push([x, BANK(x) + 12]); pts.push([W, 300]); o += P(poly(pts), bk); }
  o += S(ridgeLine(x => BANK(x) + 12, 6, 0.5), RIM[m], 1.8, ` opacity="${f(RIM_A[m] * 0.8)}"`);
  // ---- sand strip (the far beach) + pebbles; bottom row 300 = surfaceY
  const sd = tone(m, SHORE.sand, H3), sdD = tone(m, SHORE.sandD, H3);
  defs += lg('sd', [[0, sd], [1, sdD]], V);
  { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 6) pts.push([x, SAND(x)]); pts.push([W, 300]); o += P(poly(pts), 'url(#sd)'); }
  o += S(ridgeLine(SAND, 6, 0.6), lt(sd, 0.3), 1.6, ' opacity="0.8"');
  const pb = tone(m, SHORE.peb, H3);
  let pe = ''; for (let k = 0; k < 40; k++) { const x = k * 30 + (k * 13) % 19, y = SAND(x) + 6 + (k * 7) % 8, r0 = 2 + (k % 3); pe += both(xx => E(xx, y, r0 * 1.5, r0, pb) + E(xx - r0 * 0.4, y - r0 * 0.4, r0 * 0.6, r0 * 0.35, lt(pb, 0.4)), x, 6); }
  o += pe;
  // reed tufts on the far beach
  let rd = ''; for (let k = 0; k < 14; k++) { const x = k * 86 + 30 + (k * 29) % 37, y = SAND(x) + 4; rd += both(xx => T`M${xx} ${y}q-3 -10 -6 -16M${xx + 2} ${y}q1 -12 0 -20M${xx + 4} ${y}q4 -9 8 -14`, x, 10); }
  o += S(rd, tone(m, SHORE.bankD, H3), 1.8, ' opacity="0.9"');
  // ---- light haze over the whole shore (it is across the lake)
  defs += lg('cz', [[0, HAZE[m], 0], [0.7, HAZE[m], night ? 0.1 : 0.18], [1, HAZE[m], night ? 0.12 : 0.22]], V);
  o += R(0, 100, W, 200, 'url(#cz)');
  if (night) {   // a few moonlit sparkles on the beach
    let g = ''; for (let k = 0; k < 16; k++) { const x = k * 75 + (k * 11) % 23, y = SAND(x) + 8; g += both(xx => C(xx, y, 1.2, '#E8F0FF'), x, 2); }
    o += `<g opacity="0.7">${g}</g>`;
  }
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// BED (0 0 1200 200): lake bed seen through the water; bottom row 200 = H
// =====================================================================================================
const BEDY = x => BED_TOP + 10 + wave(x, [[2, 7, 0.4], [5, 4, 1.8], [11, 2, 0.6]]) + peaks(x, [[200, 10, 90], [700, 12, 120], [1000, 8, 80]]);
function bed(m) {
  const night = m === 'night', r = rng(501 + MOODS.indexOf(m));
  const wd = WATER[m][1];
  const sand = mix(tone(m, BED.sand), wd, night ? 0.38 : 0.36), sandD = mix(tone(m, BED.sandD), wd, night ? 0.45 : 0.45), sandL = mix(sand, '#FFFFFF', night ? 0.08 : 0.2);
  let o = '', defs = '';
  defs += lg('bd', [[0, sandL], [0.25, sand], [1, sandD]], V);
  o += P(ridgePoly(BEDY, 200, 6), 'url(#bd)');
  o += S(ridgeLine(BEDY, 6, 1), lt(sandL, 0.3), 2.4, ' opacity="0.7"');
  // sand ripples (curved strokes, periodic grid)
  let rp = ''; for (let k = 0; k < 44; k++) { const x = (k % 11) * 110 + ((k / 11) | 0) * 37 + 20, y = BEDY(x) + 22 + ((k / 11) | 0) * 30, w = 26 + (k * 7) % 18; rp += both(xx => T`M${xx - w} ${y}q${w / 2} -6 ${w} 0t${w} 0`, x, w * 2); }
  o += S(rp, sandD, 2, ' opacity="0.45"') + S(rp.replace(/M(\S+) (\S+)q/g, (s0, a, b) => `M${a} ${f(+b - 2.5)}q`), sandL, 1.4, ' opacity="0.5"');
  // half-buried mossy stones
  const st = mix(tone(m, '#B9B2A4'), wd, 0.35), stD = dk(st, 0.2), moss = mix(tone(m, '#9DB58A'), wd, 0.35);
  for (const [x, y, rx, ry] of [[120, 120, 34, 18], [650, 150, 44, 20], [930, 110, 26, 14]]) {
    o += both(xx => E(xx, y + ry * 0.6, rx * 1.1, ry * 0.4, sandD, ' opacity="0.6"') + P(T`M${xx - rx} ${y + ry * 0.5}Q${xx - rx} ${y - ry} ${xx} ${y - ry}Q${xx + rx} ${y - ry} ${xx + rx} ${y + ry * 0.5}Z`, st) +
      P(T`M${xx + rx * 0.2} ${y - ry * 0.9}Q${xx + rx} ${y - ry} ${xx + rx} ${y + ry * 0.5}L${xx + rx * 0.3} ${y + ry * 0.5}Z`, stD, ' opacity="0.5"') +
      E(xx - rx * 0.25, y - ry * 0.78, rx * 0.5, ry * 0.3, moss), x, rx + 4);
  }
  // pebbles
  const pb = mix(tone(m, BED.peb), wd, 0.32);
  for (let k = 0; k < 34; k++) { const x = r() * W, y = BEDY(x) + 16 + r() * 110, s0 = 2.5 + r() * 3.5, c = k % 3 ? pb : mix(pb, sandD, 0.5); o += both(xx => E(xx, y, s0 * 1.4, s0, c) + E(xx - s0 * 0.4, y - s0 * 0.35, s0 * 0.5, s0 * 0.3, lt(c, 0.35)), x, s0 * 2); }
  // tiny shells (scallop fans) + one ammonite
  const sh = mix(tone(m, BED.shell), wd, 0.25), shD = dk(sh, 0.22);
  for (const [x, y, a] of [[300, 130, -10], [540, 100, 15], [820, 160, -20], [1110, 120, 8], [60, 170, 20]]) {
    o += both(xx => `<g transform="rotate(${a} ${f(xx)} ${f(y)})">` + P(T`M${xx} ${y + 5}L${xx - 8} ${y - 3}Q${xx} ${y - 11} ${xx + 8} ${y - 3}Z`, sh, OL(shD, 1.2)) + S(T`M${xx} ${y + 4}L${xx - 4} ${y - 6}M${xx} ${y + 4}L${xx} ${y - 8}M${xx} ${y + 4}L${xx + 4} ${y - 6}`, shD, 1, ' opacity="0.7"') + '</g>', x, 12);
  }
  { const x = 760, y = 120; let sp = `M${x} ${y}`; for (let t = 0; t < 4 * Math.PI; t += 0.25) { const rr = 1 + t * 1.1; sp += `L${f(x + Math.cos(t) * rr)} ${f(y + Math.sin(t) * rr * 0.9)}`; }
    o += C(x, y, 15, sh, OL(shD, 1.4)) + S(sp, shD, 1.4, ' opacity="0.8"'); }
  // weed tufts (bases; the tall strands are env/weed.svg drawn by code)
  const wc = mix(tone(m, BED.weed), wd, 0.3), wcD = dk(wc, 0.15);
  let wt = ''; for (const x of [90, 240, 410, 590, 720, 880, 1050, 1160]) { const y = BEDY(x) + 14; wt += both(xx => T`M${xx - 8} ${y}Q${xx - 12} ${y - 14} ${xx - 6} ${y - 24}M${xx - 2} ${y}Q${xx - 4} ${y - 20} ${xx + 2} ${y - 30}M${xx + 4} ${y}Q${xx + 9} ${y - 12} ${xx + 7} ${y - 22}`, x, 14); }
  o += S(wt, wcD, 4.4) + S(wt, wc, 2.6);
  // caustic light patches (soft) on the sand
  let ca = ''; for (let k = 0; k < 16; k++) { const x = k * 75 + (k * 23) % 31, y = BEDY(x) + 18 + (k * 37) % 70; ca += both(xx => E(xx, y, 18 + (k % 4) * 5, 4, '#FFFFFF'), x, 40); }
  o += `<g opacity="${night ? 0.06 : 0.14}">${ca}</g>`;
  return svg(1200, 200, o, defs);
}

// =====================================================================================================
// ROCK (0 0 320 260): Tibo's mossy shore rock. seat (150, 70); fades out under water (mask from row 150).
// =====================================================================================================
function rock() {
  const c = '#BDB3A3', l = '#D6CDBD', d = '#958B7C', o = '#6F675A';
  const moss = { c: '#A8BE8E', s: '#8CA676', l: '#C6D6AE' };
  let s = '';
  // main boulder: low wide dome, flattish top around the seat; sides continue down under water
  const body = 'M18 258Q10 170 22 128Q34 82 84 64Q128 52 168 54Q226 56 270 78Q306 100 304 150Q302 210 296 258Z';
  s += P(body, c, OL(o, 4));
  // right-hand smaller lump
  s += P('M250 258Q248 196 270 170Q296 148 314 176Q320 214 316 258Z', mix(c, d, 0.35), OL(o, 3.4));
  // cel shade (lower right) + highlight (upper left)
  s += P('M300 120Q306 170 298 258L170 258Q230 200 248 140Q262 104 288 96Q300 106 300 120Z', d, ' opacity="0.55"');
  s += P('M40 120Q52 84 96 70Q130 62 150 66Q110 74 82 96Q60 116 52 150Q40 140 40 120Z', l, ' opacity="0.9"');
  // cracks + speckles
  s += S('M210 70Q216 92 206 108M60 170Q74 180 72 198M236 150Q226 168 232 186', o, 2.2, ' opacity="0.55"');
  for (const [x, y, r] of [[110, 118, 3], [190, 140, 2.5], [76, 210, 3], [240, 212, 2.5], [150, 190, 2]]) s += C(x, y, r, d, ' opacity="0.6"');
  // moss cushion over the top (where Tibo sits) + drips down the sides
  s += P('M44 104Q60 70 104 60Q150 50 196 56Q244 62 272 86Q262 92 246 88Q240 100 222 92Q206 104 190 92Q170 102 152 92Q132 104 116 92Q98 104 84 96Q66 108 56 100Q50 108 44 104Z', moss.c, OL(mix(moss.s, o, 0.3), 2.6));
  s += P('M86 64Q128 52 176 54Q140 60 112 70Q92 76 86 64Z', moss.l, ' opacity="0.9"');
  for (const [x, y, r] of [[60, 98, 6], [118, 96, 5], [196, 96, 6], [250, 92, 5], [150, 98, 4]]) s += C(x, y, r, moss.s);
  // tiny moss tufts / clover + a fern sprig at the left
  s += S('M30 124Q20 104 6 98M30 124Q22 100 22 82M30 124Q32 104 40 92M30 124Q14 116 2 120', '#8CA676', 3.4);
  s += S('M14 101l-4 -6M20 93l-6 -4M24 88l2 -7M36 96l5 -3M10 119l-3 -6', '#A8BE8E', 2.4);
  // little pebbles on the top edge (decor, off the seat)
  s += E(262, 84, 9, 6, '#CFC6B6', OL(o, 2)) + E(276, 92, 6, 4, '#C6BDAD', OL(o, 1.8));
  // the lower part fades out under water (one mask; render tints everything below surfaceY)
  const defs = lg('rf', [[0, '#FFFFFF', 1], [ROCK.fadeFrom / 260, '#FFFFFF', 1], [150 / 260, '#FFFFFF', 0.4], [180 / 260, '#FFFFFF', 0]], V) +
    `<mask id="rm" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="260"><rect width="320" height="260" fill="url(#rf)"/></mask>`;
  return svg(320, 260, `<g mask="url(#rm)">${s}</g>`, defs, `seat ${ROCK.seat[0]} ${ROCK.seat[1]} (anchor ${ROCK.anchor[0]} ${ROCK.anchor[1]})`);
}

// REEDS (0 0 200 260): reed blades + cattails, bottom anchor (100, 260)
function reeds() {
  const g = '#97AC7C', gd = '#748B5F', gl = '#B5C79B', cat = '#8E7158', catD = '#6B5340', catL = '#A88C70';
  let s = '';
  const blade = (x0, h, bend, w, col) => { const tx = x0 + bend, ty = 260 - h; return P(T`M${x0 - w} 262Q${x0 - w * 0.6 + bend * 0.3} ${260 - h * 0.55} ${tx} ${ty}Q${x0 + w * 0.6 + bend * 0.45} ${260 - h * 0.5} ${x0 + w} 262Z`, col); };
  // back blades (darker)
  for (const [x, h, b, w] of [[60, 170, -34, 7], [92, 210, -12, 7], [130, 190, 26, 7], [150, 150, 40, 6], [44, 120, -40, 6]]) s += blade(x, h, b, w, gd);
  // cattail stems + heads
  for (const [x, h, b] of [[78, 236, -8], [112, 250, 6], [140, 206, 14]]) {
    const tx = x + b, ty = 260 - h;
    s += S(T`M${x} 262Q${x + b * 0.4} ${260 - h * 0.5} ${tx} ${ty}`, gd, 3.4);
    s += P(T`M${tx - 7} ${ty + 46}Q${tx - 8} ${ty + 24} ${tx - 6} ${ty + 10}Q${tx} ${ty + 4} ${tx + 6} ${ty + 10}Q${tx + 8} ${ty + 24} ${tx + 7} ${ty + 46}Q${tx} ${ty + 52} ${tx - 7} ${ty + 46}Z`, cat, OL(catD, 2.4));
    s += P(T`M${tx - 3} ${ty + 14}Q${tx - 5} ${ty + 26} ${tx - 3} ${ty + 40}`, 'none', OL(catL, 2.2));
    s += S(T`M${tx} ${ty + 6}L${tx + b * 0.06} ${ty - 14}`, catD, 2);
  }
  // front blades (lighter) with a highlight stroke
  for (const [x, h, b, w] of [[70, 150, -28, 8], [100, 180, 4, 8], [124, 140, 34, 7], [86, 100, -18, 7], [150, 110, 30, 6]]) {
    s += blade(x, h, b, w, g) + S(T`M${x - w * 0.3} 250Q${x - w * 0.3 + b * 0.3} ${260 - h * 0.55} ${x + b * 0.92} ${262 - h * 0.94}`, gl, 1.6, ' opacity="0.8"');
  }
  return svg(200, 260, s, '', 'anchor 100 260');
}
// WEED (0 0 80 200): one wavy strand with leaves, bottom anchor (40, 200)
function weed() {
  const c = '#86A88D', d = '#62846C', l = '#A7C3A8';
  let s = S('M40 200C30 160 52 130 40 96C30 64 48 36 42 8', d, 6) + S('M40 200C30 160 52 130 40 96C30 64 48 36 42 8', c, 3.6);
  for (const [y, sd, len] of [[176, -1, 22], [150, 1, 24], [122, -1, 22], [96, 1, 20], [70, -1, 18], [44, 1, 16], [22, -1, 12]]) {
    const x = 40 + Math.sin(y / 30) * 6;
    s += P(T`M${x} ${y}Q${x + sd * len * 0.6} ${y - 14} ${x + sd * len} ${y - 8}Q${x + sd * len * 0.5} ${y - 2} ${x} ${y}Z`, sd > 0 ? c : mix(c, d, 0.35), OL(d, 1.6));
    s += S(T`M${x + sd * 3} ${y - 3}Q${x + sd * len * 0.5} ${y - 9} ${x + sd * len * 0.85} ${y - 8}`, l, 1.1, ' opacity="0.8"');
  }
  return svg(80, 200, s, '', 'anchor 40 200');
}

// =====================================================================================================
// SUN, MOON, CLOUDS, SMOKE
// =====================================================================================================
function sun() {
  const defs = rg('h', [[0, '#FFF6D8', 0.9], [0.45, '#FFF1C8', 0.4], [1, '#FFF1C8', 0]]) + rg('d', [[0, '#FFFCEE'], [0.7, '#FFF4D2'], [1, '#F8E7BE']], ' cx="0.4" cy="0.38" r="0.65"');
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#F6E2B0') + C(100, 100, 42, 'url(#d)') +
    E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), defs);
}
function moon() {
  const defs = rg('h', [[0, '#E6EEFF', 0.55], [0.5, '#DCE6FA', 0.2], [1, '#DCE6FA', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 44, '#F4F1E4', OL('#C9CBD8', 3.4)) +
    P('M100 56a44 44 0 0 1 0 88a30 44 0 0 0 0 -88Z', '#E2E0D6', ' opacity="0.75"') +
    C(84, 88, 7, '#E3E1D6') + C(110, 116, 9, '#E3E1D6') + C(116, 80, 5, '#E3E1D6') + C(88, 120, 4, '#E3E1D6') +
    E(82, 74, 10, 6, '#FFFFFF', ' opacity="0.7" transform="rotate(-35 82 74)"'), defs);
}
function cloud(puffs, bottom, x0, x1) {
  const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
  const hb = 30, d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="#E4E8EC" opacity="0.95"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="#F3F5F6" transform="translate(0 -6)"/><path d="${d}" fill="#FFFFFF" transform="translate(-3 -13)"/></g>`;
  return svg(300, 140, o);
}
function smoke() {
  // lazy volcano puff: 3 soft white blobs (code tints it per mood, rises + grows + fades)
  return svg(120, 120, C(46, 72, 32, 'url(#s)') + C(70, 52, 36, 'url(#s)') + C(64, 82, 28, 'url(#s)') + C(52, 50, 22, 'url(#s)'),
    rg('s', [[0, '#FFFFFF', 0.85], [0.55, '#FFFFFF', 0.5], [1, '#FFFFFF', 0]]), 'centre 60 60');
}

// =====================================================================================================
// PARTICLES (0 0 32 32; drop 0 0 16 24). White / neutral ones are tinted by code (sparkle, star, confetti, dot, glint).
// =====================================================================================================
function particles() {
  const p = {};
  const S32 = (body, defs) => svg(32, 32, body, defs);
  p.mote = S32(C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  p.sparkle = S32(C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF8E6') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFFFFF', 0.6], [1, '#FFFFFF', 0]]));
  // glint: a flat horizontal water sparkle (long arms left/right, short up/down)
  p.glint = S32(E(16, 16, 15, 5, 'url(#g)') + P('M1 16Q14 14.6 16 11Q18 14.6 31 16Q18 17.4 16 21Q14 17.4 1 16Z', '#FFFFFF') + C(16, 16, 1.8, '#FFFFFF'),
    rg('g', [[0, '#FFFFFF', 0.7], [1, '#FFFFFF', 0]]));
  p.firefly = S32(C(16, 16, 15.5, 'url(#f)') + E(14, 13, 3.2, 2, '#D8E2EE', ' opacity="0.8" transform="rotate(-30 14 13)"') + E(18.5, 13, 3.2, 2, '#D8E2EE', ' opacity="0.8" transform="rotate(30 18.5 13)"') +
    C(16, 17, 4.4, '#FFF2B0') + C(15, 16, 1.8, '#FFFFFF') + C(16, 12.6, 2, '#5E5A52'),
    rg('f', [[0, '#FFE9A0', 0.95], [0.3, '#FFE39A', 0.5], [1, '#FFE39A', 0]]));
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S32(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  p.dot = S32(C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  // drop (0 0 16 24): water droplet, pale aqua-white, highlight
  p.drop = svg(16, 24, P('M8 1Q11 8 13.4 13Q15.6 18.6 12 21.6Q8 24 4 21.6Q0.4 18.6 2.6 13Q5 8 8 1Z', '#E2F4F4', OL('#9CCBCF', 1.4)) +
    P('M12 21.6Q8 24 4 21.6Q9 21 12.6 15Q14 19 12 21.6Z', '#C4E4E6') + E(5.6, 14.5, 1.6, 3.2, '#FFFFFF', ' transform="rotate(20 5.6 14.5)"'));
  // bubble: clear air bubble (rim + highlight)
  p.bubble = S32(C(16, 16, 13, 'url(#b)') + C(16, 16, 13, 'none', OL('#FFFFFF', 1.8) + ' opacity="0.85"') + E(11, 10.5, 4, 2.6, '#FFFFFF', ' opacity="0.9" transform="rotate(-35 11 10.5)"') + C(21.5, 21, 1.6, '#FFFFFF', ' opacity="0.7"'),
    rg('b', [[0, '#FFFFFF', 0.04], [0.75, '#E8F8F8', 0.18], [1, '#FFFFFF', 0.45]]));
  // leaf_a: a little fern leaflet spray; leaf_b: a ginkgo fan leaf (dry sage with a tan edge)
  let la = S('M5 28Q14 18 28 6', '#6E8A60', 1.4);
  for (let i = 1; i < 6; i++) { const t = i / 6, x = 5 + 23 * t, y = 28 - 22 * t + 2 * Math.sin(Math.PI * t), L = 6 * (1.1 - t * 0.5); la += P(T`M${x} ${y}Q${x - L * 0.2} ${y - L} ${x + L * 0.5} ${y - L * 0.9}Q${x + L * 0.3} ${y - L * 0.3} ${x} ${y}Z`, '#97B285', OL('#6E8A60', 0.9)) + P(T`M${x} ${y}Q${x + L} ${y + L * 0.1} ${x + L * 0.9} ${y - L * 0.4}Q${x + L * 0.3} ${y - L * 0.3} ${x} ${y}Z`, '#88A578', OL('#6E8A60', 0.9)); }
  p.leaf_a = S32(la);
  p.leaf_b = S32(`<g transform="rotate(-20 16 16)">` + P('M16 26L5 10Q8 4 16 3Q24 4 27 10Z', '#B3BC8A', OL('#7E8858', 1.5)) + P('M16 3Q14 8 16 12Q18 8 16 3Z', '#C9B48A') +
    S('M16 26L10 8M16 26L16 6M16 26L22 8', '#8E9868', 1, ' opacity="0.8"') + S('M16 26L16 31', '#7E8858', 1.6) + `</g>`);
  p.confetti_a = S32(`<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  p.confetti_b = S32(S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // petal: lily petal, cream-white with a blush base (paler than answer pink)
  p.petal = S32(`<g transform="rotate(-25 16 16)">` + P('M16 3Q24 9 23 18Q21 27 16 29Q11 27 9 18Q8 9 16 3Z', '#FFF8EE', OL('#E2D2C4', 1.4)) +
    P('M16 29Q21 27 23 18Q22 25 16 29Z', '#F3E4DA') + P('M16 29Q13 25 16 20Q19 25 16 29Z', '#F6DCD6', ' opacity="0.8"') + E(12.6, 11.5, 2.2, 3.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  return p;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  const E2 = { rock: rock(), reeds: reeds(), weed: weed(), sun: sun(), moon: moon(), smoke: smoke(),
    cloud_a: cloud([[66, 96, 28], [116, 72, 40], [172, 64, 46], [226, 86, 34], [150, 100, 30]], 128, 26, 276),
    cloud_b: cloud([[56, 104, 22], [96, 88, 30], [146, 82, 36], [198, 90, 28], [244, 104, 20]], 126, 30, 272) };
  for (const m of MOODS) { E2['far_' + m] = far(m); E2['mid_' + m] = mid(m); E2['bed_' + m] = bed(m); }
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg') && !E2[fn.slice(0, -4)]) fs.unlinkSync(path.join(env, fn));
  for (const k of Object.keys(E2)) wr(env, k, E2[k]);
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no external refs, ≤ 1 blur, width/height = viewBox, unique ids per file
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|<image|href=|url\((?!#)|@import|font-family|feGaussianBlur[\s\S]*feGaussianBlur/.test(s)) throw new Error('SVG rule broken in ' + fn);
    const m = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/); if (!m || m[1] !== m[3] || m[2] !== m[4]) throw new Error('size != viewBox in ' + fn);
    const ids = [...s.matchAll(/ id="([^"]+)"/g)].map(q => q[1]); if (new Set(ids).size !== ids.length) throw new Error('duplicate id in ' + fn);
  }
  console.log('wrote env: ' + Object.keys(E2).join(', ') + '\nparticles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, WATER, HAZE, RIM, FAR_CRATER, FAR_FALL, MID_BASE, BED_TOP, ROCK, BEDY };
if (require.main === module) main();
