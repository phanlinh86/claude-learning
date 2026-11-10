// Kiki's Camp Chimes: mountain-campsite environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, env/{sun,moon,cloud_a,cloud_b}.svg and
// game/assets/default/particles/{mist,mote,sparkle,star,ember,firefly,leaf,butterfly,confetti_a,confetti_b,dot,dust,note}.svg;
// any other (old) env / particle file is deleted.                                                   (DESIGN §3, §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Ridges are periodic functions of x (period 1200, integer harmonics); props that cross
// x = 0 / 1200 are drawn twice (x and x ∓ 1200), rows use spacings that divide 1200 — both edges match pixel for pixel
// (docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm, slightly desaturated and a bit cooler than the chimes; no answer hue (red / blue / yellow /
// green / orange / purple / pink) in a saturated form — the bright chimes must pop in front of it. Night is dark blue, not
// black; the far + ground layers carry the darkness.
//
// Layer anchors (env_scenes.js envLayout() has the screen maths):
//   far    0 0 1200 720 : transparent sky; back range (hazy, snowy peaks ≈ y 300…380), main range (snowy peaks ≈ y 390…470),
//                         forested foothills (≈ 540…600), far-shore pines (≈ 596…612), the lake LAKE.y0…LAKE.y1
//                         (612…694, reflections, shimmer; morning mist bands), near shore 694…720. Bottom line 720 sits
//                         behind the mid layer's grass bank (render: y 720 → campY − 30·km).
//   mid    0 0 1200 300 : transparent top; pine forest edge (clusters), two small A-frame tents (night: warm doorway), a log
//                         bench, a signpost, rocks, ferns, standing on a meadow bank (≈ 250…300). MID_BASE = 298 → campY.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (a few grass tufts poke up to ≈ 32); meadow with a winding dirt
//                         path (≈ 66…112, + a branch towards the viewer), pebbles, small muted flowers, ferns; the bottom
//                         fades to GROUND_BOTTOM[m] (the render fills below the tile with it).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const MID_BASE = 298, GROUND_LINE = 40, FAR_BOTTOM = 720;
const LAKE = { y0: 612, y1: 694 };   // lake strip in far-tile coordinates
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
const pd = (a, b) => { let d = ((a - b) % W + W) % W; return d > W / 2 ? d - W : d; };   // periodic signed distance a − b
const wave = (x, terms) => terms.reduce((s, [k, amp, ph]) => s + amp * Math.sin(2 * Math.PI * k * x / W + ph), 0);   // periodic

// ---------------- palettes ----------------
// sky gradient per mood (DESIGN §3); render paints it from y 0 to L.skyY1 and the last stop below
const SKY = {
  morning: [[0, '#F7D9C4'], [1, '#FDF3E1']],
  noon: [[0, '#7CC4EE'], [1, '#D6F0FB']],
  sunset: [[0, '#B9729A'], [0.38, '#F29B6B'], [1, '#FBD7A5']],
  night: [[0, '#1E2A4A'], [1, '#3B4C78']],
};
// mood grading: base (noon) colour → mixed toward TINT[m] by t, then hazed toward HAZE[m] by distance
const TINT = { morning: ['#F4D6C2', 0.16], noon: ['#FFFFFF', 0.0], sunset: ['#A26C8E', 0.34], night: ['#1C2850', 0.64] };
const HAZE = { morning: '#F6E6DA', noon: '#D2EAF6', sunset: '#F2B79A', night: '#3E5080' };
const RIM = { morning: '#FFF4E6', noon: '#FFFFFF', sunset: '#FFD9A8', night: '#FFD38A' };   // warm rim light (night = fire)
const tone = (m, c, haze = 0) => mix(mix(c, TINT[m][0], TINT[m][1]), HAZE[m], haze);
const dk = (c, t = 0.3) => mix(c, '#2E3440', t), lt = (c, t = 0.3) => mix(c, '#FFFFFF', t);
// meadow colours (top of the near ground) and the fill below the ground tile
const MEADOW = { morning: '#AFBE93', noon: '#A6BD8C', sunset: '#B0A47A', night: '#3B5059' };
const GROUND_BOTTOM = { morning: '#97A87F', noon: '#8EA678', sunset: '#938766', night: '#2C3D48' };
const PATH_C = { morning: '#D9C3A2', noon: '#D6C09C', sunset: '#D2AE88', night: '#56606A' };
// base colours (noon), all calm / desaturated
const MT_BACK = '#A9B9CB', MT_MAIN = '#8EA0B2', MT_FOOT = '#7F9C88', SNOW = '#F6F8FB', SNOW_S = '#CBD6E4';
const PINE = { c: '#5E8170', s: '#4C6D5E', l: '#7C9C88', o: '#3D5A4C' }, TRUNK = '#8A6C55';
const LAKE_C = '#A8CCDA';
const CANVAS = '#D9C9A8', SAGE = '#A9B89A', WOOD = '#A58262', ROCK = '#B5B2AA';
// mood-specific overrides
const pineCol = m => {
  if (m === 'sunset') return { c: '#5C5A66', s: '#4C4A58', l: '#77727C', o: '#3B3946' };       // silhouetted
  if (m === 'night') return { c: '#24395A', s: '#1D3050', l: '#33496C', o: '#152440' };         // deep blue
  return { c: tone(m, PINE.c), s: tone(m, PINE.s), l: tone(m, PINE.l), o: tone(m, PINE.o) };
};
const snowCol = m => m === 'night' ? ['#C3CCE0', '#8E9CBC'] : m === 'sunset' ? ['#FCE3D2', '#D9A8A6'] : m === 'morning' ? ['#FFF6EE', '#E3CFCB'] : [SNOW, SNOW_S];

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
// a periodic mountain range: peaks [x, y, slopeL, slopeR]; ridge(x) = min over peaks of the slope lines + soft noise
function range(peaks, noise, base) {
  const own = x => { let best = 1e9, bi = -1; peaks.forEach((p, i) => { const d = pd(x, p[0]); const y = p[1] + (d < 0 ? -d * p[2] : d * p[3]); if (y < best) { best = y; bi = i; } }); return [best, bi]; };
  const y = x => Math.min(base, own(x)[0] + wave(x, noise));
  return { y, own, peaks };
}
function rangeShape(rg_, y0, step = 6) {   // closed polygon of the range down to y0 (seamless: same at 0 and 1200)
  const pts = [[0, y0]]; for (let x = 0; x <= W; x += step) pts.push([x, rg_.y(x)]); pts.push([W, y0]); return poly(pts);
}
function snowCaps(rg_, depth, col, colS, seed) {
  const r = rng(seed); let s = '';
  rg_.peaks.forEach((p, i) => {
    const d0 = depth * (0.8 + r() * 0.4), lim = p[1] + d0;
    const fn = cx => {
      const top = [], bot = [];
      for (let dx = -160; dx <= 160; dx += 4) {
        const x = cx + dx, xs = ((x % W) + W) % W, yy = rg_.y(xs);
        if (rg_.own(xs)[1] !== i || yy > lim - 2) continue;
        const zig = (0.55 + 0.45 * Math.cos(dx * Math.PI / 15)) * d0 * 0.35;   // soft rounded drips
        top.push([x, yy - 0.5]); bot.push([x, Math.max(yy + 3, lim - zig - Math.abs(dx) * 0.05)]);
      }
      if (top.length < 3) return '';
      const sp = poly([...top, ...bot.reverse()]);
      // shade on the right half of the cap (light from upper-left)
      const sh = top.filter(q => q[0] > cx + 2), shb = bot.slice().reverse().filter(q => q[0] > cx + 2);
      let o = P(sp, col);
      if (sh.length > 2) o += P(poly([[cx, p[1]], ...sh, ...shb.reverse(), [cx + 2, lim - d0 * 0.5]]), colS, ' opacity="0.75"');
      return o;
    };
    s += both(fn, p[0], 170);
  });
  return s;
}
function slopeShade(rg_, col, op, y0) {   // the right flank of every peak in a darker tone
  let s = '';
  rg_.peaks.forEach((p, i) => {
    const fn = cx => {
      const pts = [[cx, p[1]]]; let lastX = cx;
      for (let dx = 4; dx <= 260; dx += 4) { const xs = (((cx + dx) % W) + W) % W; if (rg_.own(xs)[1] !== i) break; pts.push([cx + dx, rg_.y(xs)]); lastX = cx + dx; }
      if (pts.length < 4) return '';
      // from the valley a diagonal crease down-left (no vertical edge), then back along the base
      const vy = pts[pts.length - 1][1];
      pts.push([lastX - (y0 - vy) * 0.35, y0], [cx + (lastX - cx) * 0.22, y0]);
      // a soft wavy inner edge back up to the peak
      pts.push([cx + (lastX - cx) * 0.12, p[1] + (y0 - p[1]) * 0.55], [cx + 3, p[1] + (y0 - p[1]) * 0.2]);
      return P(poly(pts), col, ` opacity="${op}"`);
    };
    s += both(fn, p[0], 270);
  });
  return s;
}
function tinyPine(x, yb, h, col) { const w = h * 0.42; return P(T`M${x} ${yb - h}L${x + w * 0.6} ${yb - h * 0.45}L${x + w * 0.38} ${yb - h * 0.45}L${x + w} ${yb}L${x - w} ${yb}L${x - w * 0.38} ${yb - h * 0.45}L${x - w * 0.6} ${yb - h * 0.45}Z`, col); }

function far(m) {
  const r = rng(17 + MOODS.indexOf(m));
  let o = '', defs = '';
  const night = m === 'night', [sn, snS] = snowCol(m);
  // ---- 1 back range (very hazy)
  const back = range([[90, 330, 0.62, 0.7], [330, 300, 0.7, 0.6], [560, 352, 0.55, 0.66], [800, 318, 0.66, 0.58], [1030, 344, 0.6, 0.72]],
    [[3, 6, 0.4], [7, 3, 1.1], [13, 1.6, 2.3]], 640);
  const bc = tone(m, MT_BACK, night ? 0.30 : 0.5);
  o += P(rangeShape(back, 720), bc);
  o += slopeShade(back, dk(bc, night ? 0.18 : 0.10), 0.55, 640);
  o += `<g opacity="${night ? 0.55 : 0.7}">` + snowCaps(back, 38, mix(sn, HAZE[m], 0.35), mix(snS, HAZE[m], 0.35), 5) + '</g>';
  // ---- 2 main range (snowy peaks)
  const main = range([[210, 402, 0.78, 0.86], [470, 438, 0.7, 0.8], [690, 392, 0.82, 0.74], [950, 430, 0.74, 0.86], [1140, 460, 0.7, 0.7]],
    [[4, 5, 1.3], [9, 2.6, 0.2], [17, 1.2, 1.9]], 640);
  const mc = tone(m, MT_MAIN, night ? 0.12 : 0.24);
  o += P(rangeShape(main, 720), mc);
  o += slopeShade(main, dk(mc, night ? 0.25 : 0.14), 0.7, 650);
  o += snowCaps(main, 54, sn, snS, 9);
  // light rim on the left flanks (thin highlight along the ridge left of every peak)
  main.peaks.forEach(p => { o += both(cx => { const pts = []; for (let dx = -120; dx <= 0; dx += 6) { const xs = (((cx + dx) % W) + W) % W; pts.push([cx + dx, main.y(xs) + 1.5]); } return S(line(pts), lt(sn, 0.3), 2.2, ` opacity="${night ? 0.35 : 0.6}"`); }, p[0], 130); });
  // ---- 3 forested foothills (rounded), with tiny pine silhouettes on the crest
  const footY = x => 560 + wave(x, [[2, 14, 0.7], [5, 9, 2.1], [11, 4, 0.3]]);
  const fc = tone(m, MT_FOOT, night ? 0.1 : 0.2), fcs = dk(fc, 0.12);
  { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 6) pts.push([x, footY(x)]); pts.push([W, 720]); o += P(poly(pts), fc); }
  let tp = ''; for (let k = 0; k < 60; k++) { const x = k * 20 + 6 + ((k * 7) % 5) * 1.6, h = 14 + ((k * 13) % 7) * 2.2; tp += both(xx => tinyPine(xx, footY(((xx % W) + W) % W) + 6, h, fcs), x, 8); }
  o += tp;
  // a second, nearer hill band (darker) towards the lake
  const foot2 = x => 590 + wave(x, [[3, 8, 1.7], [7, 5, 0.4], [13, 2, 2.6]]);
  const fc2 = dk(fc, night ? 0.12 : 0.08);
  { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 6) pts.push([x, foot2(x)]); pts.push([W, 720]); o += P(poly(pts), fc2); }
  // ---- 4 far-shore pines (a row, spacing 15 → 80 per tile)
  const shc = dk(fc2, 0.12);
  let row = ''; for (let k = 0; k < 80; k++) { const x = k * 15 + 4, h = 16 + ((k * 29) % 9) * 1.8; row += both(xx => tinyPine(xx, LAKE.y0 + 2, h, shc), x, 8); }
  o += row + R(0, LAKE.y0 - 4, W, 6, shc);
  // ---- 5 the lake: gradient water, mountain reflection hints, shimmer lines
  const lw = tone(m, LAKE_C, night ? 0.25 : 0.15);
  const lwTop = m === 'sunset' ? '#E9B79B' : m === 'morning' ? '#E9DCD3' : night ? '#33466F' : '#BFDCE8';
  defs += lg('lk', [[0, lwTop], [0.45, lw], [1, dk(lw, night ? 0.1 : 0.06)]], V);
  o += R(0, LAKE.y0, W, LAKE.y1 - LAKE.y0 + 4, 'url(#lk)');
  // reflection of the far-shore pines (a soft dark band under the shore)
  o += R(0, LAKE.y0 + 2, W, 10, shc, ' opacity="0.35"');
  let rf = ''; for (let k = 0; k < 80; k++) { const x = k * 15 + 4, h = (16 + ((k * 29) % 9) * 1.8) * 0.6; rf += both(xx => P(T`M${xx - 4} ${LAKE.y0 + 2}L${xx} ${LAKE.y0 + 2 + h}L${xx + 4} ${LAKE.y0 + 2}Z`, shc), x, 6); }
  o += `<g opacity="0.3">${rf}</g>`;
  // shimmer lines (spacings divide 1200)
  const shim = night ? '#9FB0D6' : m === 'sunset' ? '#FFE3C2' : '#FFFFFF';
  let sl = '';
  for (let row2 = 0; row2 < 5; row2++) {
    const y = LAKE.y0 + 18 + row2 * 15, n = [8, 10, 12, 15, 20][row2];
    for (let k = 0; k < n; k++) { const x = (k + 0.3 + ((k * 37 + row2 * 11) % 10) / 25) * W / n, len = 14 + ((k * 17 + row2 * 5) % 6) * 6; sl += both(xx => T`M${xx - len / 2} ${y}L${xx + len / 2} ${y}`, x, len / 2 + 2); }
  }
  o += S(sl, shim, 2.4, ` opacity="${night ? 0.35 : 0.55}"`);
  // ---- 6 near shore (mostly hidden behind the mid bank)
  const shoreY = x => LAKE.y1 + wave(x, [[4, 3, 0.2], [9, 2, 1.4]]);
  { const pts = [[0, 720]]; for (let x = 0; x <= W; x += 8) pts.push([x, shoreY(x)]); pts.push([W, 720]); o += P(poly(pts), tone(m, '#98AE86', night ? 0.05 : 0.12)); }
  o += S(line(Array.from({ length: 151 }, (_, i) => [i * 8, shoreY(i * 8) + 1])), lt(lw, 0.3), 2, ' opacity="0.5"');
  // ---- 7 mood atmosphere
  if (m === 'morning') {   // mist bands over the lake and the foothills (soft white, horizontal)
    defs += lg('ms', [[0, '#FFFFFF', 0], [0.5, '#FFFFFF', 0.75], [1, '#FFFFFF', 0]], V);
    o += R(0, 540, W, 60, 'url(#ms)', ' opacity="0.75"') + R(0, 596, W, 34, 'url(#ms)', ' opacity="0.9"') + R(0, 470, W, 70, 'url(#ms)', ' opacity="0.45"');
    for (let k = 0; k < 6; k++) { const x = k * 200 + 60 + r() * 60, y = 610 + (k % 3) * 22; o += both(xx => E(xx, y, 110, 7, '#FFFFFF', ' opacity="0.45"'), x, 112); }
  } else if (m === 'noon') {
    defs += lg('hz', [[0, HAZE[m], 0], [1, HAZE[m], 0.45]], V);
    o += R(0, 480, W, 132, 'url(#hz)');
  } else if (m === 'sunset') {   // warm glow on the lake + haze
    defs += lg('hz', [[0, '#FFD3A6', 0], [1, '#FFD3A6', 0.5]], V);
    o += R(0, 470, W, 142, 'url(#hz)');
    for (let k = 0; k < 4; k++) { const x = k * 300 + 150; o += both(xx => E(xx, LAKE.y0 + 30, 70, 3, '#FFE9C8', ' opacity="0.55"'), x, 72); }
  } else {   // night: the lake catches a little moonlight; soft cool haze at the foothills
    defs += lg('hz', [[0, '#5A6B9A', 0], [1, '#5A6B9A', 0.35]], V);
    o += R(0, 500, W, 112, 'url(#hz)');
  }
  return svg(1200, 720, o, defs, `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): meadow bank, pine forest edge, tents, bench, signpost, rocks, ferns
// =====================================================================================================
const BANK = x => 258 + wave(x, [[2, 5, 0.9], [5, 3, 2.2], [12, 1.5, 0.4]]);
function pine(m, x, yb, h, opt = {}) {
  const pc = opt.col || pineCol(m), w = h * 0.36, tiers = opt.tiers || 4;
  let s = '';
  // trunk
  const tr = m === 'night' ? '#2E3550' : m === 'sunset' ? '#4A4148' : tone(m, TRUNK);
  s += R(x - h * 0.035, yb - h * 0.16, h * 0.07, h * 0.16 + 1, tr, OL(dk(tr, 0.35), 1.6));
  // tiers from bottom to top: rounded triangles
  const tier = (cy, tw, th) => T`M${x} ${cy - th}Q${x + tw * 0.08} ${cy - th + 2} ${x + tw * 0.55} ${cy - th * 0.35}Q${x + tw * 1.02} ${cy - 2} ${x + tw * 0.78} ${cy}Q${x} ${cy + th * 0.1} ${x - tw * 0.78} ${cy}Q${x - tw * 1.02} ${cy - 2} ${x - tw * 0.55} ${cy - th * 0.35}Q${x - tw * 0.08} ${cy - th + 2} ${x} ${cy - th}Z`;
  const tierR = (cy, tw, th) => T`M${x} ${cy - th}Q${x + tw * 0.08} ${cy - th + 2} ${x + tw * 0.55} ${cy - th * 0.35}Q${x + tw * 1.02} ${cy - 2} ${x + tw * 0.78} ${cy}Q${x + tw * 0.3} ${cy + th * 0.06} ${x + tw * 0.05} ${cy + th * 0.05}Q${x + tw * 0.12} ${cy - th * 0.5} ${x} ${cy - th}Z`;
  for (let k = 0; k < tiers; k++) {
    const u = k / tiers, cy = yb - h * 0.12 - h * 0.86 * u * 0.92, tw = w * (1 - u * 0.62), th = h * 0.86 / tiers * 1.75;
    s += P(tier(cy, tw, th), pc.c, OL(pc.o, 2.6));
    s += P(tierR(cy, tw, th), pc.s, ' opacity="0.85"');
    s += P(T`M${x - tw * 0.18} ${cy - th * 0.62}Q${x - tw * 0.42} ${cy - th * 0.3} ${x - tw * 0.62} ${cy - th * 0.08}`, 'none', OL(pc.l, 2.4) + ' opacity="0.8"');
  }
  if (opt.rim) s += S(T`M${x + 1} ${yb - h * 0.98}Q${x + w * 0.1} ${yb - h * 0.9} ${x + w * 0.3} ${yb - h * 0.82}`, opt.rim, 2, ' opacity="0.7"');
  return s;
}
function tent(m, x, yb, w, h, base) {
  const night = m === 'night';
  const c = night ? mix(base, '#2A3760', 0.55) : m === 'sunset' ? mix(base, '#C98C86', 0.22) : tone(m, base);
  const cs = dk(c, 0.16), ol = dk(c, 0.42);
  let s = E(x, yb + 1, w * 0.62, 5, '#000000', ' opacity="0.12"');
  // back slope (shade side, right) then front face
  s += P(T`M${x} ${yb - h}L${x + w * 0.62} ${yb}L${x + w * 0.5} ${yb}Z`, cs, OL(ol, 2.4));
  s += P(T`M${x} ${yb - h}Q${x - w * 0.18} ${yb - h * 0.45} ${x - w * 0.5} ${yb}L${x + w * 0.5} ${yb}Q${x + w * 0.2} ${yb - h * 0.45} ${x} ${yb - h}Z`, c, OL(ol, 2.6));
  // doorway (warm glow at night)
  const dw = w * 0.17, dh = h * 0.56;
  if (night) {
    s += C(x, yb - dh * 0.4, w * 0.62, 'url(#tglow)');
    s += P(T`M${x} ${yb - dh}Q${x - dw * 0.5} ${yb - dh * 0.4} ${x - dw} ${yb}L${x + dw} ${yb}Q${x + dw * 0.5} ${yb - dh * 0.4} ${x} ${yb - dh}Z`, '#F7CF84', OL('#C99A55', 1.6));
    s += P(T`M${x} ${yb - dh * 0.75}Q${x - dw * 0.3} ${yb - dh * 0.3} ${x - dw * 0.55} ${yb}L${x + dw * 0.55} ${yb}Q${x + dw * 0.3} ${yb - dh * 0.3} ${x} ${yb - dh * 0.75}Z`, '#FFE7B0');
  } else s += P(T`M${x} ${yb - dh}Q${x - dw * 0.5} ${yb - dh * 0.4} ${x - dw} ${yb}L${x + dw} ${yb}Q${x + dw * 0.5} ${yb - dh * 0.4} ${x} ${yb - dh}Z`, dk(c, 0.48));
  // tied-back flaps
  s += P(T`M${x} ${yb - dh}Q${x - dw * 0.7} ${yb - dh * 0.5} ${x - dw * 1.5} ${yb}L${x - dw * 0.95} ${yb}Q${x - dw * 0.5} ${yb - dh * 0.4} ${x} ${yb - dh}Z`, lt(c, 0.12), OL(ol, 1.6));
  s += P(T`M${x} ${yb - dh}Q${x + dw * 0.7} ${yb - dh * 0.5} ${x + dw * 1.5} ${yb}L${x + dw * 0.95} ${yb}Q${x + dw * 0.5} ${yb - dh * 0.4} ${x} ${yb - dh}Z`, cs, OL(ol, 1.6));
  // highlight on the left face, seam line, pole tip, guy lines + pegs
  s += S(T`M${x - 4} ${yb - h + 10}Q${x - w * 0.14} ${yb - h * 0.5} ${x - w * 0.36} ${yb - 6}`, lt(c, 0.35), 2.4, ' opacity="0.8"');
  const wood = night ? '#4A4458' : tone(m, WOOD);
  s += S(T`M${x} ${yb - h}L${x} ${yb - h - 9}`, dk(wood, 0.2), 3);
  const gl = night ? '#596487' : tone(m, '#BBA98C');
  s += S(T`M${x} ${yb - h + 2}L${x - w * 0.78} ${yb}M${x} ${yb - h + 2}L${x + w * 0.8} ${yb}`, gl, 1.2, ' opacity="0.8"');
  s += S(T`M${x - w * 0.78} ${yb - 4}L${x - w * 0.78} ${yb + 1}M${x + w * 0.8} ${yb - 4}L${x + w * 0.8} ${yb + 1}`, dk(wood, 0.2), 2.4);
  return s;
}
function logBench(m, x, yb) {
  const night = m === 'night';
  const w = night ? '#5A5068' : m === 'sunset' ? mix(tone(m, WOOD), '#7A5A60', 0.25) : tone(m, WOOD), wd = dk(w, 0.35), cut = night ? '#7D7290' : tone(m, '#E2C9A2');
  let s = E(x, yb + 1, 58, 5, '#000000', ' opacity="0.12"');
  // two stump legs + a half log seat
  for (const dx of [-36, 36]) s += R(x + dx - 9, yb - 20, 18, 20, dk(w, 0.08), ` rx="3"${OL(wd, 2)}`);
  s += P(T`M${x - 54} ${yb - 20}L${x + 54} ${yb - 20}Q${x + 58} ${yb - 30} ${x + 52} ${yb - 34}L${x - 52} ${yb - 34}Q${x - 58} ${yb - 30} ${x - 54} ${yb - 20}Z`, w, OL(wd, 2.4));
  s += E(x - 53, yb - 27, 4.5, 7, cut, OL(wd, 1.6)) + S(T`M${x - 40} ${yb - 30}L${x + 30} ${yb - 30}M${x - 20} ${yb - 25}L${x + 44} ${yb - 25}`, wd, 1.4, ' opacity="0.5"');
  s += S(T`M${x - 46} ${yb - 32}L${x + 40} ${yb - 32}`, lt(w, 0.3), 2, ' opacity="0.7"');
  return s;
}
function signpost(m, x, yb) {
  const night = m === 'night';
  const w = night ? '#5A5068' : m === 'sunset' ? mix(tone(m, WOOD), '#7A5A60', 0.25) : tone(m, WOOD), wd = dk(w, 0.38), board = night ? '#6A6078' : tone(m, '#C4A37C');
  let s = E(x, yb + 1, 14, 3.5, '#000000', ' opacity="0.14"');
  s += R(x - 4, yb - 92, 8, 92, w, OL(wd, 2));
  // two arrow boards (blank, with carved lines)
  s += P(T`M${x - 30} ${yb - 86}L${x + 26} ${yb - 86}L${x + 38} ${yb - 76}L${x + 26} ${yb - 66}L${x - 30} ${yb - 66}Z`, board, OL(wd, 2.2));
  s += P(T`M${x + 30} ${yb - 58}L${x - 26} ${yb - 58}L${x - 38} ${yb - 48}L${x - 26} ${yb - 38}L${x + 30} ${yb - 38}Z`, board, OL(wd, 2.2));
  s += S(T`M${x - 22} ${yb - 76}L${x + 18} ${yb - 76}M${x - 18} ${yb - 48}L${x + 22} ${yb - 48}`, wd, 1.6, ' opacity="0.5"');
  s += C(x, yb - 96, 4.5, dk(w, 0.1), OL(wd, 1.6));
  return s;
}
function rock(m, x, yb, s0) {
  const c = m === 'night' ? '#4E5774' : tone(m, ROCK), cd = dk(c, 0.3);
  return P(T`M${x - 18 * s0} ${yb}Q${x - 20 * s0} ${yb - 12 * s0} ${x - 8 * s0} ${yb - 16 * s0}Q${x + 6 * s0} ${yb - 20 * s0} ${x + 16 * s0} ${yb - 10 * s0}Q${x + 22 * s0} ${yb - 2 * s0} ${x + 18 * s0} ${yb}Z`, c, OL(cd, 2)) +
    P(T`M${x + 2 * s0} ${yb - 17 * s0}Q${x + 14 * s0} ${yb - 14 * s0} ${x + 17 * s0} ${yb - 4 * s0}L${x + 17 * s0} ${yb}L${x + 4 * s0} ${yb}Q${x + 8 * s0} ${yb - 8 * s0} ${x + 2 * s0} ${yb - 17 * s0}Z`, cd, ' opacity="0.35"') +
    E(x - 8 * s0, yb - 12 * s0, 4 * s0, 2 * s0, lt(c, 0.4), ' opacity="0.7"');
}
function fern(m, x, yb, s0, col) {
  // a fern clump: 5–6 arching fronds, each a curved stem with filled leaflets (alternating, shrinking to the tip)
  const c = col || (m === 'night' ? '#30495A' : m === 'sunset' ? '#7A7A62' : tone(m, '#7E9E74'));
  const cd = dk(c, 0.22), cl = lt(c, 0.18);
  let leaves = '', stems = '', hi = '';
  const fronds = [[-70, 24, 1], [-42, 30, 1], [-16, 34, 0], [14, 33, 0], [40, 29, 1], [68, 23, 1]];
  for (const [ang, len, back] of fronds) {
    const a = ang * Math.PI / 180, L0 = len * s0;
    const ex = x + Math.sin(a) * L0 * 1.05, ey = yb - Math.cos(a) * L0 * 0.8 + (Math.abs(ang) > 30 ? L0 * 0.18 : 0);   // arching: outer fronds droop
    const mx = x + Math.sin(a) * L0 * 0.45, my = yb - Math.cos(a) * L0 * 0.95;
    const q = t => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * yb + 2 * (1 - t) * t * my + t * t * ey];
    stems += T`M${x} ${yb}Q${mx} ${my} ${ex} ${ey}`;
    const N = 6;
    for (let k = 1; k <= N; k++) {
      const t = k / (N + 0.6), [px, py] = q(t), [nx, ny] = q(Math.min(1, t + 0.02));
      const dir = Math.atan2(ny - py, nx - px), rx = ((1 - t) * 5.2 + 1.6) * s0, ry = rx * 0.48;
      for (const side of [-1, 1]) {
        const ang2 = dir + side * 1.05, cx = px + Math.cos(ang2) * rx * 0.9, cy = py + Math.sin(ang2) * rx * 0.9;
        leaves += E(cx, cy, rx, ry, back ? cd : c, ` transform="rotate(${f((dir + side * 0.75) * 57.3)} ${f(cx)} ${f(cy)})"`);
        if (!back && side < 0 && k < 4) hi += E(cx, cy - ry * 0.2, rx * 0.6, ry * 0.4, cl, ` transform="rotate(${f((dir + side * 0.75) * 57.3)} ${f(cx)} ${f(cy)})"`);
      }
    }
    leaves += C(ex, ey, 1.6 * s0, back ? cd : c);
  }
  return E(x, yb + 1, 20 * s0, 3 * s0, '#000000', ' opacity="0.1"') + leaves + hi + S(stems, cd, 1.3 * s0, ' opacity="0.8"');
}
function mid(m) {
  const night = m === 'night';
  let o = '', defs = '';
  defs += rg('tglow', [[0, '#FFD98F', 0.75], [0.4, '#FFD08A', 0.3], [1, '#FFD08A', 0]]);
  const pc = pineCol(m), rim = m === 'sunset' ? '#FFC79A' : m === 'morning' ? '#FFE9D6' : null;
  const backCol = night ? { c: '#1F3354', s: '#1A2C4A', l: '#2A4064', o: '#14223E' } : m === 'sunset' ? { c: '#6E6672', s: '#615A68', l: '#827A84', o: '#4C4656' } :
    { c: tone(m, mix(PINE.c, HAZE[m], 0.28)), s: tone(m, mix(PINE.s, HAZE[m], 0.28)), l: tone(m, mix(PINE.l, HAZE[m], 0.28)), o: tone(m, mix(PINE.o, HAZE[m], 0.28)) };
  // ---- back row of pines (hazier, smaller): clusters at fixed spots
  const back = [[-20, 120], [18, 150], [52, 112], [96, 136], [600, 104], [640, 132], [676, 118], [880, 126], [918, 108], [1150, 140], [1188, 116]];
  for (const [x, h] of back) o += both(xx => pine(m, xx, BANK(((xx % W) + W) % W) + 6, h, { col: backCol, tiers: 4 }), x, h * 0.4);
  // ---- the meadow bank (covers the far layer's bottom); top edge wavy
  const bk = night ? '#34505A' : m === 'sunset' ? '#9C9877' : tone(m, mix(MEADOW.noon, '#C8D6B4', 0.25));
  { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 6) pts.push([x, BANK(x)]); pts.push([W, 300]); o += P(poly(pts), bk); }
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, BANK(i * 6) + 0.5])), lt(bk, 0.25), 2, ' opacity="0.7"');
  // grass blades along the bank top (spacing 12)
  let gb = ''; for (let k = 0; k < 100; k++) { const x = k * 12 + 3, y = BANK(x) + 2, h = 5 + (k * 7) % 5; gb += both(xx => T`M${xx} ${y}l${-2} ${-h}M${xx + 3} ${y}l${2} ${-h + 1}`, x, 6); }
  o += S(gb, dk(bk, 0.12), 1.4, ' opacity="0.6"');
  // ---- front pine clusters (forest edge)
  const front = [[-60, 176], [-24, 214], [30, 160], [70, 190], [118, 142], [700, 168], [742, 206], [790, 150], [1100, 150], [1140, 196]];
  for (const [x, h] of front) o += both(xx => pine(m, xx, 290, h, { rim }), x, h * 0.42);
  // ---- tents (muted canvas + sage), log bench, signpost, rocks, ferns
  o += tent(m, 330, 286, 118, 96, CANVAS);
  o += tent(m, 486, 288, 96, 80, SAGE);
  o += logBench(m, 940, 292);
  o += signpost(m, 1040, 294);
  o += rock(m, 412, 292, 0.8) + rock(m, 622, 294, 1.1) + rock(m, 860, 292, 0.7) + rock(m, 230, 294, 0.9);
  for (const [x, s0] of [[262, 0.9], [404, 0.7], [575, 1.0], [655, 0.8], [836, 0.9], [1004, 0.8], [1076, 1.0], [170, 1.1]]) o += both(xx => fern(m, xx, 296, s0), x, 34 * s0);
  // the pine roots at the cluster bases sit on a darker bank strip
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): meadow, winding dirt path, pebbles, flowers, ferns
// =====================================================================================================
const PATH_Y = x => 88 + wave(x, [[1, 12, 0.6], [3, 6, 2.0], [5, 3, 0.9]]);   // centre line of the path
const PATH_W = x => 15 + wave(x, [[2, 3, 1.1], [7, 1.5, 0.3]]);                 // half width
function ground(m) {
  const night = m === 'night', r = rng(201 + MOODS.indexOf(m));
  const top = MEADOW[m], bot = GROUND_BOTTOM[m], pc = PATH_C[m];
  let o = '', defs = '';
  // meadow body with a tufty top edge (tufts poke up to ≈ 32)
  const edge = x => GROUND_LINE - 3 + wave(x, [[6, 1.2, 0.3], [25, 1, 1.1]]);   // never below 40 (no sky slit under the mid bank)
  defs += lg('gr', [[0, lt(top, 0.06)], [0.35, top], [1, bot]], V);
  { const pts = [[0, 260]]; for (let x = 0; x <= W; x += 6) pts.push([x, edge(x)]); pts.push([W, 260]); o += P(poly(pts), 'url(#gr)'); }
  let tf = ''; for (let k = 0; k < 75; k++) { const x = k * 16 + 5 + (k * 5) % 7; tf += both(xx => T`M${xx - 5} ${edge(x) + 2}Q${xx - 4} ${edge(x) - 4} ${xx - 2} ${edge(x) - 8}Q${xx} ${edge(x) - 2} ${xx + 1} ${edge(x) - 9}Q${xx + 3} ${edge(x) - 3} ${xx + 6} ${edge(x) - 6}L${xx + 6} ${edge(x) + 2}Z`, x, 7); }
  o += P(tf, lt(top, 0.06));
  o += S(line(Array.from({ length: 201 }, (_, i) => [i * 6, edge(i * 6) + 1])), lt(top, 0.25), 2, ' opacity="0.6"');
  // soft darker mottles (meadow texture)
  for (let i = 0; i < 18; i++) { const x = r() * W, y = 130 + r() * 110, rx = 40 + r() * 50; o += both(xx => E(xx, y, rx, 8 + r() * 6, dk(top, 0.1), ' opacity="0.35"'), x, rx); }
  // ---- the path (horizontal, periodic) + a branch towards the viewer at x ≈ 560…700
  const pTop = [], pBot = []; for (let x = 0; x <= W; x += 6) { pTop.push([x, PATH_Y(x) - PATH_W(x) * 0.62]); pBot.push([x, PATH_Y(x) + PATH_W(x) * 0.62]); }
  const pathD = poly([...pTop, ...pBot.reverse()]);
  const bx = 620, by = PATH_Y(bx);
  const branch = T`M${bx - 30} ${by}Q${bx - 34} ${by + 60} ${bx - 70} ${by + 110}Q${bx - 96} ${by + 150} ${bx - 110} 262L${bx + 26} 262Q${bx + 6} ${by + 140} ${bx + 18} ${by + 96}Q${bx + 30} ${by + 50} ${bx + 34} ${by}Z`;
  o += P(pathD, dk(pc, 0.16), ' transform="translate(0 2)"') + P(branch, dk(pc, 0.16), ' transform="translate(0 2)"');
  o += P(pathD, pc) + P(branch, pc);
  o += S(line(pTop.slice().reverse().map(p => [p[0], p[1] + 2])), lt(pc, 0.3), 2, ' opacity="0.7"');
  // pebbles along the path (spacing 40) and on the branch
  const peb = night ? '#7A8197' : tone(m, '#C1BCB2'), pebd = dk(peb, 0.28);
  for (let k = 0; k < 30; k++) { const x = k * 40 + 14 + (k * 13) % 17, side = k % 2 ? 1 : -1, y = PATH_Y(x) + side * (PATH_W(x) * 0.62 + 3), s0 = 2.4 + (k * 7) % 3; o += both(xx => E(xx, y, s0 * 1.4, s0, peb, OL(pebd, 1.2)) + E(xx - s0 * 0.4, y - s0 * 0.3, s0 * 0.5, s0 * 0.3, lt(peb, 0.4)), x, 6); }
  for (let k = 0; k < 7; k++) { const t = k / 7, x = bx - 20 - t * 70 + (k % 2 ? 40 : -8), y = by + 18 + t * 140; o += E(x, y, 3.6, 2.4, dk(pc, 0.1), ' opacity="0.8"'); }
  // ---- flowers (muted: cream, pale lilac-grey, pale butter) in little clusters + grass strokes
  const fl = night ? ['#9AA4C4', '#8790B4', '#A9AFC8'] : m === 'sunset' ? ['#F2DCC4', '#D8BFC6', '#EAD6A8'] : ['#F4EEDF', '#D6CCDD', '#EFE3BC'];
  const stem = night ? '#2E4452' : tone(m, '#86A174');
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = 52 + r() * 196; if (Math.abs(y - PATH_Y(x)) < PATH_W(x) + 6) continue;
    if (x > bx - 130 && x < bx + 50 && y > by) continue;
    const col = fl[i % 3], n = 2 + (i % 3);
    o += both(xx => { let s = ''; for (let k = 0; k < n; k++) { const fx = xx + (k - n / 2) * 7 + (k % 2) * 2, fy = y - (k % 2) * 5; s += S(T`M${fx} ${fy + 8}L${fx} ${fy}`, stem, 1.6) + C(fx, fy, 3.2, col, OL(dk(col, 0.25), 0.9)) + C(fx, fy, 1.1, night ? '#C9CCD8' : '#E7D39A'); } return s; }, x, 20);
  }
  let gs = ''; for (let i = 0; i < 70; i++) { const x = r() * W, y = 60 + r() * 190, h = 5 + r() * 6; if (Math.abs(y - PATH_Y(x)) < PATH_W(x) + 2) continue; gs += both(xx => T`M${xx} ${y}l-2 ${-h}M${xx + 2} ${y}l1 ${-h * 0.9}M${xx + 4} ${y}l3 ${-h * 0.7}`, x, 6); }
  o += S(gs, dk(top, 0.18), 1.4, ' opacity="0.55"');
  // ferns at a few spots (big, near), away from where Kiki / the fire usually sit is not knowable → keep them small
  for (const [x, y, s0] of [[90, 150, 1.0], [410, 200, 1.2], [880, 170, 1.1], [1060, 230, 1.3], [300, 236, 1.0]]) o += both(xx => fern(m, xx, y, s0, night ? '#2F4A58' : tone(m, '#7D9B71')), x, 40 * s0);
  // a couple of small rocks
  o += rock(m, 760, 140, 0.9) + rock(m, 200, 120, 0.7);
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SUN, MOON, CLOUDS
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2CF', 0.42], [1, '#FFF2CF', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFF2CC', OL('#F2DCA6', 4)) + C(100, 100, 38, '#FFF8E2') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function moon() {
  // a friendly crescent (no face): outer disc r 46 at (100,100) minus a disc r 40 at (124, 86); soft cool glow; faint craters
  const d = rg('g', [[0, '#E9EEFF', 0.5], [0.5, '#DDE5FF', 0.18], [1, '#DDE5FF', 0]]);
  const cres = 'M100 54A46 46 0 1 0 140 122.6A40 40 0 0 1 100 54Z';
  return svg(200, 200, C(100, 100, 98, 'url(#g)') + P(cres, '#F6F1DC', OL('#D9D1B2', 3.5)) +
    P('M88 63Q67 76 65 100Q65 117 74 130', 'none', OL('#FFFFFF', 4) + ' opacity="0.65"') + C(78, 112, 4, '#E4DCBE') + C(92, 136, 3, '#E4DCBE') + C(70, 90, 2.6, '#E4DCBE'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[70, 92, 38], [118, 70, 50], [172, 62, 44], [214, 84, 36], [250, 100, 26], [40, 108, 22]] : [[60, 96, 28], [100, 80, 36], [148, 74, 40], [196, 86, 32], [236, 100, 24], [34, 108, 18]];
  let body = '';
  for (const [x, y, rr] of blobs) body += `M${x - rr} ${y}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0Z`;
  body += `M20 106Q20 124 44 124L262 124Q282 124 280 108L276 98L22 98Z`;
  const shade = `M20 112Q24 128 46 128L260 128Q282 128 282 112Q270 118 250 116Q200 122 150 116Q100 122 60 116Q34 118 20 112Z`;
  return svg(300, 140, P(body, '#FFFFFF') + P(shade, '#E3E9F0', ' opacity="0.9"') + E(108, 58, 22, 9, '#FFFFFF', ' opacity="0.9"'));
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
  // star twinkle: a soft 4-point glint (sky stars), cream
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P('M16 3Q17.2 14.8 29 16Q17.2 17.2 16 29Q14.8 17.2 3 16Q14.8 14.8 16 3Z', '#FFF4D2') + C(16, 16, 3.2, '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.5], [1, '#FFF6DA', 0]]));
  // ember: small warm spark with a glow
  out.ember = svg(32, 32, C(16, 16, 15, 'url(#e)') + E(16, 16, 4.2, 5.4, '#FFC46E', ' transform="rotate(20 16 16)"') + E(15.4, 15, 2, 2.6, '#FFF1C8', ' transform="rotate(20 16 16)"'),
    rg('e', [[0, '#FFB45C', 0.75], [0.45, '#FF9C4A', 0.25], [1, '#FF9C4A', 0]]));
  // firefly: warm yellow-green glow (#E9F59A, not answer green) with a tiny body
  out.firefly = svg(32, 32, C(16, 16, 15, 'url(#f)') + C(16, 16, 4.6, '#F2FAC0') + C(16, 16, 2.4, '#FFFFF0'),
    rg('f', [[0, '#E9F59A', 0.85], [0.35, '#E9F59A', 0.35], [1, '#E9F59A', 0]]));
  // leaf: a small sage leaf (noon breeze)
  out.leaf = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 3Q26 10 23 20Q20 26 16 28Q12 26 9 20Q6 10 16 3Z', '#9DB78A', OL('#64805A', 1.6)) +
    P('M16 3Q26 10 23 20Q20 26 16 28Q20 16 16 3Z', '#86A276', ' opacity="0.8"') + S('M16 31L16 6M16 12L12 9.5M16 16L11 13M16 20L11.5 17.5M16 12L20 9.5M16 16L21 13M16 20L20.5 17.5', '#64805A', 1.1) +
    E(12.5, 11, 2, 3.4, '#C3D6B2', ' opacity="0.8"') + `</g>`);
  // butterfly: tiny pale cream wings with soft lilac-grey edges, body brown
  out.butterfly = svg(32, 32, P('M15.5 15Q8 4 3.5 8Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#F6EEDC', OL('#B9AFC4', 1.4)) +
    P('M16.5 15Q24 4 28.5 8Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#ECE2D0', OL('#B9AFC4', 1.4)) +
    C(7.5, 11, 2, '#DCD2E2') + C(24.5, 11, 2, '#DCD2E2') + R(15, 10, 2, 13, '#7E6656', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#7E6656', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  out.dust = svg(32, 32, C(13, 18, 10, 'url(#d)') + C(20, 14, 10, 'url(#d)') + C(19, 21, 9, 'url(#d)'), rg('d', [[0, '#F4F1EA', 0.9], [0.6, '#E6E1D6', 0.45], [1, '#E6E1D6', 0]]));
  // music note ♪ (paths only, white-ish so code can tint it): oval head + stem + flag, soft glow
  out.note = svg(32, 32, C(16, 16, 15, 'url(#n)') +
    P('M19 5L19 21.5', 'none', OL('#DCDCDC', 4.2)) + P('M19 5L19 21.5', 'none', OL('#FFFFFF', 2.4)) +
    P('M19 4.5Q25.5 6.5 26 12.5Q23.5 9.5 19.5 9.5Z', '#FFFFFF', OL('#DCDCDC', 1.2)) +
    E(14.5, 22.5, 5.6, 4.2, '#FFFFFF', OL('#DCDCDC', 1.4) + ' transform="rotate(-22 14.5 22.5)"') + E(13, 21.2, 2, 1.1, '#FFFFFF', ' transform="rotate(-22 13 21.2)"'),
    rg('n', [[0, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b'));
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, clouds) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, MEADOW, GROUND_BOTTOM, PATH_C, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, LAKE };
if (require.main === module) main();
