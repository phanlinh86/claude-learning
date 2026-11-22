// Mimi's Splash Rocket: mountain-campsite environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid}_{sunny,breezy,rain,rainbow}.svg, the camp sprites env/{tent_a,tent_b,campfire,pine,
// rock,flowers,windsock}.svg, env/{sun,cloud_a,cloud_b,cloud_rain,rainbow}.svg and game/assets/default/particles/*.svg.
// Every other (old) env file and the river-only particles (glint, dragonfly, snow, blossom, firefly) are deleted.
// (DESIGN §3, §4.4)        Usage: node tools/art_env.js        Preview scenes + seam proof + RECIPE: node tools/env_scenes.js
//
// Look: a calm mountain campsite. far = two ranges of soft snow-capped peaks (a lavender-grey back range hazed into the sky,
// a blue-grey main range with a shaded right flank) over forested foothills; mid = a pine forest edge in clusters with a
// still lake strip (soft white glints) in front of it, standing on a meadow band in the exact far-meadow colour so the
// canvas-drawn meadow (DK.MeadowArt.drawMeadow) continues it without a seam at the horizon.
// rain: the far range is misty (more haze, a mist band, softer caps); rainbow: clear and a touch brighter. The rainbow arc
// itself is env/rainbow.svg, drawn ONCE by the RECIPE's drawEnv behind the far layer (a rainbow inside a tiled layer would
// repeat on wide screens).
//
// Tiling: far and mid are 1200 wide. Ridges are periodic functions of x (integer harmonics over 1200, periodic peak
// distance); props crossing x = 0 / 1200 are drawn twice (x and x ∓ 1200): both edges match pixel for pixel
// (docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm, muted, low chroma; nothing in a saturated answer hue. Meadow greens are all calmer than
// answer green #4CC26B; mountains blue-grey / lavender-grey (never saturated blue / purple); tents khaki + dusty teal.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far  0 0 1200 720 : transparent top; back peaks ≈ y 360…430, main peaks ≈ 420…480, foothills ≈ 560…610, solid from
//                       FAR_SOLID = 620 down. Row FAR_BASE = 660 sits on mid row MID_FAR = 205 (hidden behind the forest).
//   mid  0 0 1200 300 : transparent top; pine tops ≈ 95…175, pine feet ≈ 212…222, lake strip ≈ 216…244, meadow band
//                       MID_BAND = 240…300 in MEADOW[m].far. Row MID_BASE = 300 = layout.horizon on screen.
//   sprites (bottom-centre anchor): tent_a/tent_b 260×200 (130,196) · campfire 140×120 (70,114; flame base (70,92)) ·
//   pine 160×300 (80,294) · rock 120×80 (60,76) · flowers 140×70 (70,68) · windsock 120×200 (60,196; sock hinge (62,34))
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const FAR_SOLID = 620, FAR_BASE = 660, MID_FAR = 205, MID_BAND = 240, MID_BASE = 300;
const SPRITES = {
  tent_a: [260, 200, 130, 196], tent_b: [260, 200, 130, 196], campfire: [140, 120, 70, 114], pine: [160, 300, 80, 294],
  rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], windsock: [120, 200, 60, 196],
};
const FLAME_BASE = [70, 92], SOCK_HINGE = [62, 34];
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
const pd = (x, c) => { let d = x - c; d -= Math.round(d / W) * W; return d; };   // periodic signed distance
const poly = pts => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join('L') + 'Z';
/** closed path of a periodic ridge y(x), x 0..W, filled down to yBottom (step px, exactly periodic) */
const ridge = (yf, yBottom, step = 6) => { let d = `M-4 ${f(yBottom)}L-4 ${f(yf(0))}`; for (let x = 0; x <= W; x += step) d += `L${f(x)} ${f(yf(x))}`; return d + `L${W + 4} ${f(yf(W))}L${W + 4} ${f(yBottom)}Z`; };

// ---------------- palettes (DESIGN §3 exact where given) ----------------
const SKY = {
  sunny: [[0, '#9FD3EE'], [1, '#F3F7EE']],
  breezy: [[0, '#B7D9EC'], [1, '#F1F3EA']],
  rain: [[0, '#A7B5C3'], [1, '#DCE2E6']],
  rainbow: [[0, '#B6DDF0'], [1, '#FBF3E6']],
};
const skyTop = m => SKY[m][0][1], skyBot = m => SKY[m][1][1];
// distance haze: what far things fade into (≈ the lower sky); rain is mistier
const HAZE = { sunny: mix('#F3F7EE', '#9FD3EE', 0.3), breezy: mix('#F1F3EA', '#B7D9EC', 0.3), rain: mix('#DCE2E6', '#A7B5C3', 0.25), rainbow: mix('#FBF3E6', '#B6DDF0', 0.3) };
const HAZE_K = { sunny: 1, breezy: 1, rain: 1.45, rainbow: 0.85 };   // haze strength factor
// meadow grass: base (DESIGN §3), far (at the horizon, under the forest edge), light (hazy band just below), near (deeper)
const MEADOW = {
  sunny: { base: '#A9CF8E', far: '#9CC48A' },
  breezy: { base: '#A2C78C', far: '#97BD88' },
  rain: { base: '#8FB385', far: '#86A982' },
  rainbow: { base: '#AFD596', far: '#A2CB90' },
};
for (const m of MOODS) {
  const g = MEADOW[m];
  g.light = mix(g.base, skyBot(m), 0.22);
  g.near = mix(g.base, '#5E8A5E', 0.2);
  g.tuft = mix(g.base, '#4E7560', 0.38);
  g.stripe = mix(g.base, '#FFFFFF', 0.16);
}
const MT = { back: '#A9A6C4', main: '#8FA3B8', snow: '#F4F6FA', snowS: '#D3DBE7', foot: '#7E9C8A' };
const PINE = { lit: '#6E9A7C', c: '#5F8A6E', s: '#4E7560', o: '#3E5E4D' }, TRUNK = '#7E6450';
const LAKE = { sunny: '#B9D4D6', breezy: '#BBD3D4', rain: '#B3C2C6', rainbow: '#C0DADB' };
const TENT = { a: ['#D9C59A', '#C0AB7E', '#8C7752'], b: ['#7FA8A2', '#6A918B', '#4E6E69'] };

// =====================================================================================================
// FAR (0 0 1200 720): two snowy ranges + forested foothills
// =====================================================================================================
// a periodic range: peaks [x, y, slopeL, slopeR]; y(x) = min over peaks of the two slope lines + soft periodic noise
function range(peaks, noise, base) {
  const own = x => { let best = 1e9, bi = -1; peaks.forEach((p, i) => { const d = pd(x, p[0]); const y = p[1] + (d < 0 ? -d * p[2] : d * p[3]); if (y < best) { best = y; bi = i; } }); return [best, bi]; };
  // round the peak tips a little: blend with a parabola near each summit
  const y = x => { const [b, i] = own(x); const p = peaks[i], d = pd(x, p[0]); const tip = Math.abs(d) < 14 ? (14 - Math.abs(d)) * (14 - Math.abs(d)) / 28 * Math.min(p[2], p[3]) * 0.5 : 0; return Math.min(base, b + tip + wave(x, noise)); };
  return { y, own, peaks };
}
let CLIP = 0;
/** snow cap: a band above a wavy line per peak, clipped to the range */
function caps(rg_, depths, col, colS, clipId) {
  let band = '', shade = '';
  rg_.peaks.forEach((p, i) => {
    const d0 = depths[i % depths.length];
    const fn = cx => {
      const pts = [];
      for (let dx = -170; dx <= 170; dx += 5) {
        const zig = (0.5 + 0.5 * Math.cos(dx * Math.PI / 17)) * d0 * 0.32;
        pts.push([cx + dx, p[1] + d0 - zig + Math.abs(dx) * 0.06]);
      }
      const top = [[cx + 170, p[1] - 40], [cx - 170, p[1] - 40]];
      // shade: right half of the cap (light from the upper-left)
      const sh = pts.filter(q => q[0] >= cx + 2);
      return [poly([...pts, ...top]), poly([[cx + 1, p[1] - 40], ...sh.map(q => [q[0], q[1]]), [cx + 170, p[1] - 40]])];
    };
    for (const xx of [p[0], p[0] - W, p[0] + W]) { if (xx < -200 || xx > W + 200) continue; const [b, s] = fn(xx); band += b.replace(/^M/, 'M'); shade += s; }
  });
  return `<g clip-path="url(#${clipId})">` + P(band, col) + P(shade, colS, ' opacity="0.8"') + '</g>';
}
/** right-flank shading of every peak: a wedge from the summit down-right, clipped to the range */
function flanks(rg_, col, op, y0, clipId) {
  let d = '';
  for (const p of rg_.peaks) for (const xx of [p[0], p[0] - W, p[0] + W]) {
    if (xx < -300 || xx > W + 300) continue;
    const h = y0 - p[1];
    d += poly([[xx, p[1] - 2], [xx + h / p[3] * 1.05, y0], [xx + h * 0.32, y0], [xx + h * 0.12, p[1] + h * 0.55], [xx + 2, p[1] + h * 0.18]]);
  }
  return `<g clip-path="url(#${clipId})">` + P(d, col, ` opacity="${op}"`) + '</g>';
}
function tinyPine(x, yb, h, col) { const w = h * 0.36; return P(T`M${x} ${yb - h}L${x + w * 0.62} ${yb - h * 0.42}L${x + w * 0.36} ${yb - h * 0.42}L${x + w} ${yb}L${x - w} ${yb}L${x - w * 0.36} ${yb - h * 0.42}L${x - w * 0.62} ${yb - h * 0.42}Z`, col); }

function far(m) {
  const hz = HAZE[m], hk = HAZE_K[m];
  const hzc = (c, t) => mix(c, hz, Math.min(0.92, t * hk));
  let o = '', defs = '';
  // back range: lavender-grey, hazy, gentle caps
  const back = range([[70, 372, 0.78, 0.9], [330, 398, 0.85, 0.8], [560, 362, 0.8, 0.95], [800, 404, 0.9, 0.85], [1010, 380, 0.8, 0.9]], [[3, 4, 0.5], [7, 2.5, 1.3], [13, 1.2, 0.2]], 640);
  const id1 = 'r' + (++CLIP), id2 = 'r' + (++CLIP);
  const backD = ridge(back.y, 724);
  defs += `<clipPath id="${id1}"><path d="${backD}"/></clipPath>`;
  o += P(backD, hzc(MT.back, 0.45));
  o += flanks(back, hzc(mix(MT.back, '#6F6C8E', 0.4), 0.45), 0.45, 640, id1);
  o += caps(back, [34, 28, 38, 26, 32], hzc(MT.snow, 0.3), hzc(MT.snowS, 0.4), id1);
  // main range: blue-grey, caps with a shaded right half
  const main = range([[190, 428, 0.72, 0.82], [450, 446, 0.8, 0.7], [690, 418, 0.7, 0.86], [930, 452, 0.85, 0.75], [1130, 440, 0.75, 0.8]], [[2, 4, 1.1], [5, 3, 0.4], [11, 1.5, 2.2]], 640);
  const mainD = ridge(main.y, 724);
  defs += `<clipPath id="${id2}"><path d="${mainD}"/></clipPath>`;
  o += P(mainD, hzc(MT.main, 0.24));
  o += flanks(main, hzc(mix(MT.main, '#5D6F84', 0.45), 0.24), 0.55, 640, id2);
  o += caps(main, [40, 32, 46, 30, 36], hzc(MT.snow, 0.12), hzc(MT.snowS, 0.2), id2);
  // a few soft rock streaks on the main range
  for (const p of main.peaks) o += both(xx => S(T`M${xx - 18} ${p[1] + 70}Q${xx - 30} ${p[1] + 100} ${xx - 46} ${p[1] + 118}M${xx + 22} ${p[1] + 66}Q${xx + 34} ${p[1] + 96} ${xx + 52} ${p[1] + 110}`, hzc(mix(MT.main, '#5D6F84', 0.3), 0.24), 3, ' opacity="0.55"'), p[0], 70);
  // mist band (rain: thick, others: a thin morning haze) in front of the main range's feet
  const mistA = m === 'rain' ? 0.75 : 0.35;
  o += P(ridge(x => 520 + wave(x, [[2, 8, 0.3], [5, 5, 1.7]]), 600), hz, ` opacity="${mistA}"`);
  // forested foothills: two rolling rows with tiny pines on the crest
  const y1 = x => 566 + wave(x, [[1, 10, 0.6], [3, 8, 2.1], [6, 4, 0.3]]);
  const foot1 = hzc(MT.foot, 0.42);
  for (let k = 0; k < 60; k++) { const x = k * 20 + hsh(k, 3) * 10; o += both(xx => tinyPine(xx, y1(x) + 6, 22 + hsh(k, 4) * 16, foot1), x, 12); }
  o += P(ridge(y1, 724), foot1);
  const y2 = x => 596 + wave(x, [[2, 7, 2.6], [4, 5, 0.9], [9, 2, 1.7]]);
  const foot2 = hzc(mix(MT.foot, PINE.c, 0.5), 0.3);
  for (let k = 0; k < 48; k++) { const x = k * 25 + hsh(k, 7) * 12; o += both(xx => tinyPine(xx, y2(x) + 6, 26 + hsh(k, 8) * 18, foot2), x, 14); }
  o += P(ridge(y2, 724), foot2);
  if (m === 'rain') o += P(ridge(x => 600 + wave(x, [[3, 5, 1.0], [7, 3, 0.2]]), 724), hz, ' opacity="0.4"');
  o += R(-4, FAR_SOLID, W + 8, 104, foot2);
  return svg(1200, 720, o, defs, `sky ${skyTop(m)} ${skyBot(m)}`);
}

// =====================================================================================================
// MID (0 0 1200 300): pine forest edge + lake strip on a meadow band (MEADOW[m].far)
// =====================================================================================================
/** a soft flat pine: 4 rounded tiers, lit left half, outline (ow 0 = none), haze [col, t] */
function pine(x, yb, h, { ow = 3, haze = null, tiers = 4 } = {}) {
  const tn = c => (haze ? mix(c, haze[0], haze[1]) : c);
  const lit = tn(PINE.lit), c = tn(PINE.c), sh = tn(PINE.s), ol = tn(PINE.o);
  const w = h * 0.46, tw = Math.max(3, h * 0.07);
  let s = R(x - tw / 2, yb - h * 0.14, tw, h * 0.14 + 1, tn(TRUNK), ow ? OL(tn(mix(TRUNK, '#3A2A20', 0.35)), ow * 0.6) : '');
  const TI = tiers === 4 ? [[0.1, 0.5, 1], [0.3, 0.68, 0.82], [0.5, 0.86, 0.62], [0.68, 1.02, 0.42]] : [[0.12, 0.6, 1], [0.38, 0.82, 0.75], [0.6, 1.02, 0.5]];
  let o = '', b = '', l = '', d2 = '';
  for (const [t0, t1, wf] of TI) {
    const y0 = yb - h * t0, y1 = yb - h * t1, ww = w * wf / 2;
    const d = T`M${x - ww} ${y0}Q${x - ww * 0.5} ${y0 + 6} ${x} ${y0 + 4}Q${x + ww * 0.5} ${y0 + 6} ${x + ww} ${y0}Q${x + ww * 0.3} ${y0 - (y0 - y1) * 0.45} ${x + 1.5} ${y1 + 1.5}Q${x} ${y1 - 1} ${x - 1.5} ${y1 + 1.5}Q${x - ww * 0.3} ${y0 - (y0 - y1) * 0.45} ${x - ww} ${y0}Z`;
    if (ow) o += d;
    b += d;
    if (!ow) continue;
    d2 += T`M${x + 2} ${y0 + 3.5}Q${x + ww * 0.5} ${y0 + 5.5} ${x + ww} ${y0}Q${x + ww * 0.3} ${y0 - (y0 - y1) * 0.45} ${x + 1.5} ${y1 + 2}Z`;
    l += T`M${x - ww * 0.86} ${y0 - 1}Q${x - ww * 0.5} ${y0 + 2} ${x - ww * 0.3} ${y0 + 1.5}Q${x - ww * 0.2} ${y0 - (y0 - y1) * 0.5} ${x - 1} ${y1 + 4}Q${x - ww * 0.3} ${y0 - (y0 - y1) * 0.4} ${x - ww * 0.86} ${y0 - 1}Z`;
  }
  return s + (ow ? P(o, ol, OL(ol, ow * 2)) : '') + P(b, c) + (ow ? P(d2, sh, ' opacity="0.75"') + P(l, lit, ' opacity="0.85"') : '');
}
function mid(m) {
  const hz = HAZE[m], hk = HAZE_K[m], G = MEADOW[m];
  let o = '';
  // back forest row (hazy, no outline) — a continuous low wall of crowns + taller pines
  const backH = [hz, Math.min(0.85, 0.5 * hk)];
  o += P(ridge(x => 196 + wave(x, [[4, 6, 0.2], [9, 4, 1.4], [17, 2, 0.7]]), 260), mix(PINE.c, hz, backH[1]));
  for (let k = 0; k < 40; k++) { const x = k * 30 + hsh(k, 11) * 18, yb = 212 + hsh(k, 12) * 6; o += both(xx => pine(xx, yb, 70 + hsh(k, 13) * 50, { ow: 0, haze: backH, tiers: 3 }), x, 30); }
  // front clusters (outlined) with gaps where the back row shows
  const clusters = [[60, 5], [300, 3], [520, 6], [800, 4], [1020, 5]];
  const front = [];
  clusters.forEach(([cx, n], ci) => { for (let j = 0; j < n; j++) { const x = cx + (j - (n - 1) / 2) * 34 + (hsh(ci, j) - 0.5) * 14; const h = 80 + hsh(j, ci + 40) * 50 + (j === Math.floor(n / 2) ? 26 : 0); front.push([x, 218 + hsh(j, ci + 9) * 5, h]); } });
  front.sort((p, q) => p[1] - q[1]);
  for (const [x, yb, h] of front) o += both(xx => pine(xx, yb, h, { ow: 2.5, haze: [hz, 0.12 * hk] }), x, 36);
  // the lake strip (in front of the forest feet), rounded ends, with glints
  const lakeC = LAKE[m];
  const lake = (x0, x1, y0, y1) => P(T`M${x0 + 20} ${y0}L${x1 - 20} ${y0}Q${x1 + 8} ${y0 + 2} ${x1 + 6} ${(y0 + y1) / 2}Q${x1} ${y1} ${x1 - 30} ${y1}L${x0 + 30} ${y1}Q${x0} ${y1} ${x0 - 6} ${(y0 + y1) / 2}Q${x0 - 8} ${y0 + 2} ${x0 + 20} ${y0}Z`, lakeC);
  o += lake(160, 760, 210, 247) + lake(880, 1110, 214, 245);
  // forest reflections + glints
  for (const [x0, x1, y0] of [[160, 760, 210], [880, 1110, 214]]) {
    o += R(x0 + 10, y0, x1 - x0 - 20, 6, mix(lakeC, PINE.c, 0.35), ' opacity="0.5" rx="3"');
    for (let k = 0; k < Math.round((x1 - x0) / 55); k++) { const x = x0 + 30 + hsh(k, x0) * (x1 - x0 - 60), y = y0 + 12 + hsh(k, x0 + 1) * 14, l = 10 + hsh(k, x0 + 2) * 22; o += S(T`M${x - l / 2} ${y}L${x + l / 2} ${y}`, '#FFFFFF', 2.4, ` opacity="${m === 'rain' ? 0.45 : 0.8}"`); }
  }
  // meadow band in the far-meadow colour (+ a soft darker lip at its top edge)
  const band = x => MID_BAND + wave(x, [[3, 2, 0.4], [8, 1.5, 1.2]]);
  o += P(ridge(band, 304), G.far);
  o += S((() => { let d = `M-4 ${f(band(0) + 1.5)}`; for (let x = 0; x <= W; x += 10) d += `L${f(x)} ${f(band(x) + 1.5)}`; return d + `L${W + 4} ${f(band(W) + 1.5)}`; })(), mix(G.far, PINE.s, 0.25), 3, ' opacity="0.6"');
  // little tufts on the band
  for (let k = 0; k < 48; k++) { const x = k * 25 + hsh(k, 31) * 14, y = 258 + hsh(k, 32) * 34; o += both(xx => S(T`M${xx - 3} ${y}L${xx - 5} ${y - 5}M${xx} ${y}L${xx} ${y - 7}M${xx + 3} ${y}L${xx + 5} ${y - 5}`, G.tuft, 1.8, ' opacity="0.45"'), x, 8); }
  return svg(1200, 300, o, '', `mid ${m}: pine feet ≈ 212…222, lake 216…246, meadow ${MID_BAND}…300 = ${G.far}, row ${MID_BASE} = horizon`);
}

// =====================================================================================================
// CAMP SPRITES (bottom-centre anchored)
// =====================================================================================================
function tent(kind) {
  const [lit, sh, ol] = TENT[kind];
  const inner = '#6E5C46', innerD = '#57483A';
  let o = E(132, 193, 118, 8, '#3E4A36', ' opacity="0.22"');
  // guy ropes + pegs (behind)
  o += S('M100 36L14 192M190 48L252 182', mix(ol, '#FFFFFF', 0.25), 2) + R(10, 186, 6, 10, '#8A6244', ' rx="2"') + R(249, 176, 6, 10, '#8A6244', ' rx="2"');
  // side roof panel (3/4 view, going back to the right)
  o += P('M100 34L190 46L244 182L178 190Z', sh, OL(ol, 4));
  o += S('M120 37L196 164M146 40L214 174', mix(sh, ol, 0.35), 2, ' opacity="0.5"');
  o += P('M100 34L178 190L190 186L112 38Z', mix(sh, '#000000', 0.08), ' opacity="0.4"');
  // front face
  o += P('M100 34L20 190L178 190Z', lit, OL(ol, 4));
  // open door: interior + two folded-back flaps
  o += P('M100 74L62 190L138 190Z', inner);
  o += P('M100 74L78 190L122 190Z', innerD, ' opacity="0.6"');
  o += P('M100 74L62 190L48 190L90 92Z', mix(lit, '#FFFFFF', 0.25), OL(ol, 2.5));
  o += P('M100 74L138 190L150 190L110 92Z', mix(lit, sh, 0.5), OL(ol, 2.5));
  o += C(76, 120, 3.2, mix(ol, '#FFFFFF', 0.2)) + C(124, 120, 3.2, mix(ol, '#FFFFFF', 0.2));   // toggles
  // stitched seams + a soft highlight on the left of the face
  o += S('M100 40L28 184', mix(lit, '#FFFFFF', 0.45), 3, ' opacity="0.7" stroke-dasharray="6 7"');
  o += P('M98 46L40 160L52 160Z', '#FFFFFF', ' opacity="0.18"');
  // ridge pole tip + a little bead
  o += S('M100 34L96 20', '#8A6244', 4) + C(96, 18, 4, '#C9B48A', OL('#7A6544', 1.5));
  // ground skirt line
  o += S('M22 190L178 190L244 182', mix(ol, '#3E4A36', 0.3), 3, ' opacity="0.6"');
  // tent_b is mirrored (its side panel goes back to the left) for variety
  const body = kind === 'b' ? `<g transform="translate(262 0) scale(-1 1)">${o}</g>` : o;
  return svg(260, 200, body, '', `tent_${kind}: bottom-centre anchor (130,196)`);
}
function campfire() {
  const st = ['#B7B3AA', '#9C988F', '#6F6C65'];
  let o = E(70, 112, 62, 7, '#3E4A36', ' opacity="0.22"');
  // ember bed glow
  o += E(70, 98, 40, 11, '#C98F62', ' opacity="0.55"') + E(70, 96, 26, 7, '#E7B07A', ' opacity="0.65"');
  // back stones
  const stone = (x, y, rx, ry) => E(x, y, rx, ry, st[0], OL(st[2], 2.5)) + E(x - rx * 0.25, y - ry * 0.35, rx * 0.45, ry * 0.3, '#D3D0C8', ' opacity="0.9"');
  for (const [x, y, rx, ry] of [[28, 92, 11, 7], [46, 86, 10, 6.5], [70, 84, 11, 6.5], [94, 86, 10, 6.5], [112, 92, 11, 7]]) o += stone(x, y, rx, ry);
  // logs: a little teepee (tops meet around the flame base) + one log lying across
  const log = (x0, y0, x1, y1, w) => S(T`M${x0} ${y0}L${x1} ${y1}`, '#5E4330', w + 4) + S(T`M${x0} ${y0}L${x1} ${y1}`, '#8A6244', w) + S(T`M${x0} ${y0 - w * 0.2}L${(x0 + x1) / 2} ${(y0 + y1) / 2 - w * 0.2}`, '#A57E5E', w * 0.3, ' opacity="0.8"') + C(x0, y0, w / 2 + 0.5, '#D9B98E', OL('#5E4330', 2));
  o += log(40, 104, 72, 80, 9) + log(102, 104, 68, 80, 9) + log(62, 108, 74, 78, 8);
  o += log(30, 106, 110, 106, 10);
  // front stones
  for (const [x, y, rx, ry] of [[22, 104, 12, 8], [44, 110, 12, 7.5], [70, 112, 13, 7.5], [96, 110, 12, 7.5], [118, 104, 12, 8]]) o += stone(x, y, rx, ry);
  return svg(140, 120, o, '', `campfire: bottom-centre anchor (70,114); flame base (${FLAME_BASE}) drawn by DK.MeadowArt.drawFlame`);
}
function pineSprite() {
  let o = E(80, 292, 52, 7, '#3E4A36', ' opacity="0.22"');
  o += pine(80, 294, 284, { ow: 3.5 });
  return svg(160, 300, o, '', 'pine: bottom-centre anchor (80,294)');
}
function rock() {
  let o = E(60, 75, 50, 5, '#3E4A36', ' opacity="0.2"');
  o += P('M12 74Q6 50 26 34Q44 18 70 22Q100 26 110 50Q116 70 104 74Z', '#AEB0AE', OL('#72746F', 3.5));
  o += P('M60 74Q96 70 104 54Q110 68 104 74Z', '#909290');
  o += P('M24 46Q34 30 54 28Q42 36 36 50Z', '#CFD1CD', ' opacity="0.9"');
  o += P('M40 26Q58 18 78 24Q86 30 74 32Q58 28 44 32Z', '#9DB386', ' opacity="0.85"');
  o += S('M70 40L78 56L74 66', '#8C8E8A', 2, ' opacity="0.7"');
  o += E(100, 72, 12, 6, '#A3A5A2', OL('#72746F', 2.5)) + E(97, 69, 5, 2, '#CFD1CD');
  return svg(120, 80, o, '', 'rock: bottom-centre anchor (60,76)');
}
function flowers() {
  const tuft = '#7FA372';
  let o = '', bl = '';
  for (let k = 0; k < 14; k++) { const x = 16 + k * 8 + hsh(k, 41) * 4, h = 16 + hsh(k, 42) * 18, l = (hsh(k, 43) - 0.5) * 12; bl += T`M${x - 3} 68Q${x} ${68 - h * 0.6} ${x + l} ${68 - h}Q${x + 1} ${68 - h * 0.5} ${x + 3} 68Z`; }
  o += P(bl, tuft, OL(mix(tuft, '#2E3A20', 0.25), 1.2));
  const daisy = (x, y, r) => { let s = S(T`M${x} ${y + r}L${x + 1} 68`, tuft, 2); for (let q = 0; q < 6; q++) { const a = q * 1.047; s += E(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, r * 0.5, '#FBF8F0', OL('#CFC6B0', 1.1) + rot(x + Math.cos(a) * r, y + Math.sin(a) * r, a * 57.3)); } return s + C(x, y, r * 0.55, '#EAD49A', OL('#C4AC6C', 1)); };
  const bell = (x, y, r) => S(T`M${x} ${y}L${x + 1} 68`, tuft, 2) + P(T`M${x - r} ${y}Q${x - r} ${y - r * 1.6} ${x} ${y - r * 1.6}Q${x + r} ${y - r * 1.6} ${x + r} ${y}Q${x + r * 0.5} ${y - r * 0.3} ${x} ${y + r * 0.1}Q${x - r * 0.5} ${y - r * 0.3} ${x - r} ${y}Z`, '#D6D0E4', OL('#A9A2BC', 1.2));
  o += daisy(34, 36, 6) + bell(62, 30, 6) + daisy(92, 32, 6.5) + bell(114, 44, 5) + daisy(50, 52, 4.5);
  return svg(140, 70, o, '', 'flowers: bottom-centre anchor (70,68); pale daisies + lilac-grey bells');
}
function windsock() {
  let o = E(60, 194, 26, 5, '#3E4A36', ' opacity="0.22"');
  // a little grass mound + stake
  o += P('M36 196Q42 182 60 182Q78 182 84 196Z', '#9CC48A', OL('#6F9468', 2));
  o += S('M44 192L42 184M52 188L52 180M70 188L72 181M78 192L80 185', '#6F9468', 2);
  // the pole (wood) with a cap
  o += R(56, 26, 8, 166, '#9A7656', OL('#6B5038', 2.5) + ' rx="3"');
  o += R(57.5, 30, 2.5, 150, '#C4A27E', ' rx="1.2" opacity="0.8"');
  o += C(60, 24, 6, '#C9B48A', OL('#7A6544', 2));
  // the hinge ring (the sock itself is canvas code, attached at SOCK_HINGE)
  o += E(SOCK_HINGE[0] + 3, SOCK_HINGE[1], 4, 9, 'none', OL('#7F8486', 2.5));
  return svg(120, 200, o, '', `windsock pole: bottom-centre anchor (60,196); sock hinge (${SOCK_HINGE}) drawn by DK.MeadowArt.drawWindsock`);
}

// =====================================================================================================
// SKY: sun, clouds, rain cloud, rainbow
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.4], [1, '#FFF2CF', 0]]);
  let rays = '';
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, r0 = 56, r1 = k % 2 ? 70 : 76, w = 0.12; rays += T`M${100 + Math.cos(a - w) * r0} ${100 + Math.sin(a - w) * r0}Q${100 + Math.cos(a) * (r1 + 4)} ${100 + Math.sin(a) * (r1 + 4)} ${100 + Math.cos(a + w) * r0} ${100 + Math.sin(a + w) * r0}Z`; }
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + P(rays, '#FFF0C4', ' opacity="0.9"') + C(100, 100, 48, '#FFF1C6', OL('#F2D9A0', 4)) + C(100, 100, 40, '#FFF7DE') +
    E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85"' + rot(86, 84, -35)), d, 'sun: centre (100,100), soft rounded rays, no face');
}
function cloud(type) {
  // white art (render may tint it per mood with a 'source-atop' overlay); soft cool-grey shade, no outline
  const blobs = type === 'a' ? [[66, 92, 34], [112, 70, 46], [166, 60, 44], [212, 80, 36], [250, 98, 26], [38, 106, 22]] : [[60, 96, 26], [98, 78, 34], [146, 70, 40], [194, 84, 32], [234, 100, 22], [32, 108, 16]];
  let sh = '', lit = '', hi = '';
  for (const [x, y, r] of blobs) { sh += C(x, y, r, '#E4E9F1'); lit += C(x - r * 0.1, y - r * 0.14, r * 0.86, '#FFFFFF'); if (r > 30) hi += E(x - r * 0.34, y - r * 0.44, r * 0.3, r * 0.14, '#FFFFFF', rot(x - r * 0.34, y - r * 0.44, -26)); }
  const base = P('M22 104Q20 126 46 126L258 126Q282 126 280 106L276 96L24 96Z', '#E4E9F1') + P('M26 102Q26 118 48 118L254 118Q276 118 274 104L270 96L28 96Z', '#FFFFFF');
  return svg(300, 140, sh + base + lit + hi, '', `cloud_${type}: centre (150,70)`);
}
function cloudRain() {
  // a fuller, soft blue-grey rain cloud (darker belly), friendly, no face
  const blobs = [[58, 90, 32], [104, 66, 44], [158, 52, 48], [210, 70, 40], [252, 92, 28], [34, 104, 22]];
  let sh = '', lit = '', hi = '';
  for (const [x, y, r] of blobs) { sh += C(x, y, r + 1, '#A9B4C1'); lit += C(x - r * 0.1, y - r * 0.16, r * 0.84, '#D3DAE2'); if (r > 34) hi += E(x - r * 0.34, y - r * 0.46, r * 0.32, r * 0.13, '#E9EDF2', rot(x - r * 0.34, y - r * 0.46, -24)); }
  const base = P('M20 104Q18 130 46 130L258 130Q284 130 282 108L278 92L22 92Z', '#A9B4C1') + P('M26 100Q26 120 48 120L254 120Q276 120 274 104L270 92L30 92Z', '#BFC8D2');
  return svg(300, 140, sh + base + lit + hi, '', 'cloud_rain: centre (150,70)');
}
function rainbow() {
  // soft pastel arcs, centre (600, 640), outer radius 560; legs run off the bottom (hidden behind the far mountains)
  const cols = ['#EDB3AE', '#F2CBA4', '#F0E1A6', '#C6DFAE', '#AFCFE0', '#BDB7DE'];
  let o = '';
  const bw = 17;
  cols.forEach((c, i) => { const r = 560 - bw / 2 - i * bw; o += `<path d="M${f(600 - r)} 640A${f(r)} ${f(r)} 0 0 1 ${f(600 + r)} 640" fill="none" stroke="${c}" stroke-width="${bw + 1}"/>`; });
  // a soft white inner glow
  const rIn = 560 - cols.length * bw - 8;
  o += `<path d="M${f(600 - rIn)} 640A${f(rIn)} ${f(rIn)} 0 0 1 ${f(600 + rIn)} 640" fill="none" stroke="#FFFFFF" stroke-width="16" opacity="0.35"/>`;
  return svg(1200, 600, `<g filter="url(#b)" opacity="0.9">${o}</g>`, '<filter id="b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.5"/></filter>',
    'rainbow: arc centre (600,640), outer radius 560 (top of the arc y 80); draw with alpha ≈ 0.55');
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
  // petal: a soft wild-rose petal (pale blush, far below answer pink in chroma)
  out.petal = svg(32, 32, `<g transform="rotate(-25 16 16)">` + P('M16 4Q25 8 24 17Q22 26 16 28Q10 26 8 17Q7 8 16 4Z', '#F9DFE4', OL('#E0BAC3', 1.4)) +
    P('M16 28Q22 26 24 17Q23 24 16 28Z', '#EFCAD3') + P('M14.6 5.2L16 8.6L17.4 5.2', 'none', OL('#E0BAC3', 1.2)) + E(12.6, 11.5, 2.2, 3.6, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // leaf: a muted sage-olive mountain leaf blown by the breeze (calmer than answer green)
  out.leaf = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 28Q12 26 9 20Q6 10 16 3Z', '#B4C48E', OL('#7E8F5E', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 28Q20 16 16 3Z', '#9FB079', ' opacity="0.8"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#7E8F5E', 1.1) +
    E(12.5, 11, 2, 3.4, '#E2EAC8', ' opacity="0.8"') + `</g>`);
  out.butterfly = svg(32, 32, P('M15.5 15Q8 4 3.5 8Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#F6EEDC', OL('#B9AFC4', 1.4)) +
    P('M16.5 15Q24 4 28.5 8Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#ECE2D0', OL('#B9AFC4', 1.4)) +
    C(7.5, 11, 2, '#DCD2E2') + C(24.5, 11, 2, '#DCD2E2') + R(15, 10, 2, 13, '#7E6656', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#7E6656', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#F7F1EA', 0.9], [0.6, '#ECE2D6', 0.45], [1, '#ECE2D6', 0]]));
  // feather: a fluffy duckling down feather (cream) — Mimi pokes / landings
  out.feather = svg(32, 32, `<g transform="rotate(35 16 16)">` + P('M16 2Q23 8 22 17Q21 24 16.6 28L15.4 28Q11 24 10 17Q9 8 16 2Z', '#FBF3DD', OL('#D9C9A2', 1.3)) +
    S('M13 10L11 8.5M12.4 15L10.2 13.6M19 10L21 8.5M19.6 15L21.8 13.6', '#E6D8B6', 1.1) + S('M16 4L16 30', '#C9B48A', 1.4) + E(13.6, 11, 1.6, 3.4, '#FFFFFF', ' opacity="0.8"') + `</g>`);
  // NEW raindrop: a falling drop, point up (vertical; weather rotates it with the wind), pale blue-grey, a white glint
  out.raindrop = svg(32, 32, P('M16 2Q17.2 9 21.5 17Q24 22 21.5 26.5Q19 30 16 30Q13 30 10.5 26.5Q8 22 10.5 17Q14.8 9 16 2Z', '#CFE0E8', OL('#8FA9B6', 1.5)) +
    P('M16 30Q19 30 21.5 26.5Q23.5 22.5 21.5 18Q21 25 16 28Z', '#B4CBD6') + E(13.2, 21, 1.6, 3.6, '#FFFFFF', ' opacity="0.9"' + rot(13.2, 21, 18)));
  // NEW splash: a little crown splash seen from the side (rain hitting the meadow / a mat), bottom centre (16, 28)
  out.splash = svg(32, 32, E(16, 27, 12, 3.4, '#C6D9E2', OL('#8FA9B6', 1.2) + ' opacity="0.85"') +
    P('M6 26Q7 18 10 15Q10 21 11 26ZM26 26Q25 18 22 15Q22 21 21 26ZM14 25Q14.5 16 16 11Q17.5 16 18 25Z', '#D7E6ED', OL('#8FA9B6', 1.1)) +
    C(8, 10, 1.8, '#D7E6ED', OL('#8FA9B6', 0.9)) + C(24, 9, 1.6, '#D7E6ED', OL('#8FA9B6', 0.9)) + C(16, 6, 1.4, '#D7E6ED', OL('#8FA9B6', 0.9)));
  // NEW rainbow_sparkle: a 4-point twinkle with soft pastel rainbow rings (multi-colour, not tintable)
  out.rainbow_sparkle = svg(32, 32,
    C(16, 16, 14.5, 'none', OL('#EDB3AE', 1.6) + ' opacity="0.55"') + C(16, 16, 12.5, 'none', OL('#F0E1A6', 1.6) + ' opacity="0.6"') + C(16, 16, 10.5, 'none', OL('#C6DFAE', 1.6) + ' opacity="0.6"') + C(16, 16, 8.5, 'none', OL('#AFCFE0', 1.6) + ' opacity="0.6"') + C(16, 16, 6.5, 'none', OL('#BDB7DE', 1.6) + ' opacity="0.55"') +
    P('M16 2Q17.4 14.6 30 16Q17.4 17.4 16 30Q14.6 17.4 2 16Q14.6 14.6 16 2Z', '#FFFDF4', OL('#F2E6C4', 0.8)) + C(16, 16, 2.6, '#FFFFFF'));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) fs.unlinkSync(path.join(par, fn));   // glint, dragonfly, snow, blossom, firefly
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); }
  wr(env, 'tent_a', tent('a')); wr(env, 'tent_b', tent('b')); wr(env, 'campfire', campfire()); wr(env, 'pine', pineSprite());
  wr(env, 'rock', rock()); wr(env, 'flowers', flowers()); wr(env, 'windsock', windsock());
  wr(env, 'sun', sun()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b')); wr(env, 'cloud_rain', cloudRain()); wr(env, 'rainbow', rainbow());
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  // sanity: no <text>, no scripts, no fonts, no external refs, ≤ 1 blur, width/height = viewBox
  for (const dir of [env, par]) for (const fn of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, fn), 'utf8');
    if (/<text|<script|font|href=|url\((?!#)|feGaussianBlur[\s\S]*feGaussianBlur|NaN|undefined|Infinity/.test(s)) throw new Error('SVG rule broken in ' + fn);
    const mm = s.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    if (!mm || mm[1] !== mm[3] || mm[2] !== mm[4]) throw new Error('size != viewBox in ' + fn);
  }
  let kb = 0; for (const fn of fs.readdirSync(env)) kb += fs.statSync(path.join(env, fn)).size;
  console.log('wrote env (' + fs.readdirSync(env).length + ' files, ' + Math.round(kb / 1024) + ' KB) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, HAZE, MEADOW, MT, PINE, TENT, LAKE, SPRITES, FLAME_BASE, SOCK_HINGE, FAR_SOLID, FAR_BASE, MID_FAR, MID_BAND, MID_BASE };
if (require.main === module) main();
