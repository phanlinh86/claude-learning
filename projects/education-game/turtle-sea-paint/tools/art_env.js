// Nini's Sea Painting: seabed environment + particle art generator (100 % original, hand-laid flat-cartoon SVG).
// Writes game/assets/default/env/{far,mid,ground,surface}_{spring,summer,autumn,winter}.svg, env/rays.svg,
// env/caustic.svg and game/assets/default/particles/{petal,leaf_a,leaf_b,snow,sparkle,star,plankton,dot,confetti_a,
// confetti_b}.svg (bubble.svg and the other old particle files are left alone)                         (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every tileable layer is 1200 wide (caustic 400 x 200, tileable both ways). Height fields are sums of
// periodic bumps / sines whose period divides 1200, and every prop that crosses x = 0 / 1200 is drawn twice
// (at x and x -/+ 1200), so the left and right edges match pixel for pixel.
// Colour rule (DESIGN §3): calm, slightly desaturated sea; no answer hue in a large area; sand warm #EAD7AE.
//
// Layer anchors (see env_scenes.js envLayout() for the screen maths):
//   far     0 0 1200 720 : reef silhouettes, bottom edge = just under the sand line; top ~250 px fully transparent.
//   mid     0 0 1200 300 : kelp / coral / rocks; their bases sit on y ≈ 288 (the sand line, MID_BASE).
//   ground  0 0 1200 260 : sand; the bumpy sand top lies between y 36 and 60 (GROUND_LINE = 60 = nominal sand line),
//                          rows above the bumps are transparent; bottom row colour = SAND_BOTTOM[m] (fill below with it).
//   surface 0 0 1200 120 : the water surface seen from below, top-anchored (y 0 = screen top).
//   rays    0 0 600 720  : god-ray fan, apex at (300, 0).   caustic 0 0 400 200 : white light net, tile both ways.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['spring', 'summer', 'autumn', 'winter'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lg = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) once, plus a wrapped copy if it crosses an edge (half = half width of the thing)
const both = (fn, x, half, period = W) => fn(x) + (x + half > period ? fn(x - period) : '') + (x - half < 0 ? fn(x + period) : '');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// periodic distance on [0, W)
const pd = (x, c, per = W) => { let d = Math.abs(x - c) % per; return Math.min(d, per - d); };
// height field from periodic gaussian-ish bumps [[centre, height, halfWidth]] + base
const field = (bumps, base) => x => base + bumps.reduce((s, [c, h, w]) => s + h * Math.exp(-Math.pow(pd(x, c) / w, 2)), 0);
// filled silhouette under y(x) down to yb
const fill = (y, yb, step = 6) => { const p = [[0, yb]]; for (let x = 0; x <= W; x += step) p.push([x, y(x)]); p.push([W, yb]); return poly(p); };

// ---------------- palettes ----------------
// exact water gradient per mood (DESIGN §3): render paints top → bottom over the whole screen
const WATER = { spring: ['#7FD3D8', '#2E8FA8'], summer: ['#5CC8E8', '#1E78B4'], autumn: ['#7CC0B8', '#2F6F86'], winter: ['#A9D8EC', '#3C6E9A'] };
const SAND = { spring: '#EAD7AE', summer: '#ECD9AF', autumn: '#E9D3A6', winter: '#E6D8BC' };
const SAND_BOTTOM = {}; for (const m of MOODS) SAND_BOTTOM[m] = mix(SAND[m], '#B89868', 0.16);
// default strength of the light layers for previews (render: ambient.rays / ambient.caustic)
const RAYS_ALPHA = { spring: 0.55, summer: 0.95, autumn: 0.5, winter: 0.35 };
const CAUSTIC_ALPHA = { spring: 0.25, summer: 0.55, autumn: 0.2, winter: 0.12 };
const INK = '#1E3A4A';
const MIDP = {
  spring: { kelp: '#86C08E', kelp2: '#9FCD94', coral: '#F2A9B8', coral2: '#F5C6C6', fan: '#E9B3C6', rock: '#86A0AA', grass: '#A3CF92', sponge: '#E8C9A4', frost: null },
  summer: { kelp: '#6FAF92', kelp2: '#8CC0A0', coral: '#F0AE94', coral2: '#EFC7A6', fan: '#E7A9A0', rock: '#7896A5', grass: '#8EC39C', sponge: '#E6C390', frost: null },
  autumn: { kelp: '#C99A52', kelp2: '#D9AE67', coral: '#D9926E', coral2: '#E3B784', fan: '#CF8E72', rock: '#7F8E8E', grass: '#B6A764', sponge: '#D7A673', frost: null },
  winter: { kelp: '#93B6B4', kelp2: '#A9C6C2', coral: '#DDE6EF', coral2: '#CCD5E8', fan: '#D6DCEC', rock: '#8FA4B6', grass: '#ABC6C4', sponge: '#D9DEE6', frost: '#FFFFFF' },
};
const pal = (m, c, haze = 0.12) => mix(c, mix(WATER[m][0], WATER[m][1], 0.6), haze);
const dk = (c, t = 0.38) => mix(c, INK, t), lt = (c, t = 0.35) => mix(c, '#FFFFFF', t);

// =====================================================================================================
// FAR: distant reef silhouettes (0 0 1200 720), bottom anchored
// =====================================================================================================
function far(m) {
  const [top, bot] = WATER[m], r = rng(11 + MOODS.indexOf(m));
  let o = '', defs = '';
  // soft light from above (two broad glows, period 600 → tileable)
  defs += rg('glow', [[0, m === 'autumn' ? '#FFE3B0' : '#FFFFFF', m === 'summer' ? 0.28 : 0.2], [1, '#FFFFFF', 0]]);
  for (const x of [300, 900]) o += E(x, 120, 330, 260, 'url(#glow)');
  // layer A: faraway pinnacles + kelp forest haze (tall, very low contrast)
  const cA = mix(mix(top, bot, 0.62), '#0E3A52', m === 'winter' ? 0.08 : 0.14);
  const yA = field([[60, -250, 50], [190, -150, 70], [340, -300, 45], [430, -180, 60], [610, -230, 55], [760, -140, 80], [880, -320, 40], [990, -200, 60], [1110, -160, 55]], 640);
  let kel = '';
  for (let i = 0; i < 14; i++) {
    const x0 = i * (W / 14) + 30, h = 230 + (i * 73) % 170, ph = i * 1.7, pts = [];
    for (let t = 0; t <= 1.0001; t += 0.05) pts.push([x0 + Math.sin(t * 6 + ph) * 26 * t, 720 - h * t]);
    kel += line(pts);
  }
  o += `<g opacity="0.5">` + P(fill(yA, 720), cA) + S(kel, cA, 9) + `</g>`;
  // layer B: nearer reef mounds with coral-branch silhouettes
  const cB = mix(bot, '#0F3550', m === 'winter' ? 0.12 : 0.22);
  const yB = field([[0, -120, 110], [170, -70, 90], [300, -150, 85], [470, -90, 120], [640, -170, 90], [800, -80, 100], [960, -140, 95], [1100, -60, 80]], 640);
  let br = '';
  const branch = (x, y, a, len, w, d) => {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    br += S(`M${f(x)} ${f(y)}L${f(x1)} ${f(y1)}`, cB, w);
    if (d > 0) { branch(x1, y1, a - 0.45, len * 0.72, w * 0.75, d - 1); branch(x1, y1, a + 0.42, len * 0.7, w * 0.75, d - 1); }
  };
  for (const [x, s] of [[120, 1], [420, 0.8], [720, 1.1], [1020, 0.9]]) branch(x, yB(x) + 10, -Math.PI / 2 + (r() - 0.5) * 0.3, 52 * s, 16 * s, 3);
  let fans = '';
  for (const [x, s] of [[260, 1], [560, 0.85], [880, 1.05], [1160, 0.8]]) {
    const y = yB(x) + 12; fans += both(xx => `M${f(xx - 46 * s)} ${f(y)}Q${f(xx - 60 * s)} ${f(y - 90 * s)} ${f(xx)} ${f(y - 96 * s)}Q${f(xx + 60 * s)} ${f(y - 90 * s)} ${f(xx + 46 * s)} ${f(y)}Z`, x, 62 * s);
  }
  o += `<g opacity="0.62">` + P(fill(yB, 720), cB) + br + P(fans, cB) + `</g>`;
  // a lighter rim on top of the near mounds (light from above)
  let rim = ''; for (let x = 0; x <= W; x += 6) rim += (x ? 'L' : 'M') + f(x) + ' ' + f(yB(x) + 3);
  o += S(rim, lt(top, 0.3), 4, ' opacity="0.22"');
  return svg(1200, 720, o, defs, `water ${top} ${bot}`);
}

// =====================================================================================================
// MID: kelp, coral, rocks, sea grass (0 0 1200 300), bases on y ≈ 288
// =====================================================================================================
const MID_BASE = 290;
function mid(m) {
  const q = MIDP[m], c = k => pal(m, q[k]), frost = q.frost, r = rng(101 + MOODS.indexOf(m));
  const Y = MID_BASE;
  const props = [];
  // --- prop painters (each returns svg for base x) ---
  const kelp = (h, sw, ph, col) => x => {
    const fillc = col, ol = dk(fillc), pts = [];
    for (let t = 0; t <= 1.0001; t += 0.04) pts.push([x + Math.sin(t * 4.2 + ph) * sw * t, Y + 4 - h * t]);
    const L = [], Rr = [];
    pts.forEach((p, i) => {
      const nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)], dx = nx[0] - pv[0], dy = nx[1] - pv[1], d = Math.hypot(dx, dy) || 1;
      const w = 7 * (1 - 0.55 * (i / (pts.length - 1)));
      L.push([p[0] - dy / d * w, p[1] + dx / d * w]); Rr.push([p[0] + dy / d * w, p[1] - dx / d * w]);
    });
    let s = '';
    // blades alternating left / right
    let blades = '', bh = '';
    for (let i = 3; i < pts.length - 1; i += 3) {
      const p = pts[i], side = (i / 3) % 2 ? 1 : -1, len = 34 + (i % 4) * 4, ang = side * 0.9 - Math.PI / 2 + side * 0.35;
      const tx = p[0] + Math.cos(ang) * len * 1.0 + side * 10, ty = p[1] + Math.sin(ang) * len * 0.75;
      const mx = (p[0] + tx) / 2, my = (p[1] + ty) / 2, nx = -(ty - p[1]), ny = tx - p[0], nl = Math.hypot(nx, ny) || 1;
      const k = 9;
      blades += `M${f(p[0])} ${f(p[1])}Q${f(mx + nx / nl * k)} ${f(my + ny / nl * k)} ${f(tx)} ${f(ty)}Q${f(mx - nx / nl * k)} ${f(my - ny / nl * k)} ${f(p[0])} ${f(p[1])}Z`;
      bh += `M${f(p[0])} ${f(p[1])}L${f(mx + (tx - p[0]) * 0.2)} ${f(my + (ty - p[1]) * 0.2)}`;
    }
    s += P(blades, fillc, ` stroke="${ol}" stroke-width="3" stroke-linejoin="round"`);
    s += S(bh, dk(fillc, 0.18), 2, ' opacity="0.7"');
    s += P(poly([...L, ...Rr.reverse()]), fillc, ` stroke="${ol}" stroke-width="3" stroke-linejoin="round"`);
    s += S(line(pts.slice(1, -2).map(p => [p[0] - 2.5, p[1]])), lt(fillc, 0.4), 2.5, ' opacity="0.65"');
    // float bladders
    for (const i of [8, 15, 21]) if (pts[i]) { const p = pts[i]; s += C(p[0] + 7, p[1] - 4, 6, lt(fillc, 0.15), ` stroke="${ol}" stroke-width="2.5"`) + C(p[0] + 5.5, p[1] - 6, 1.8, '#FFFFFF', ' opacity="0.7"'); }
    if (frost) s += C(pts[pts.length - 1][0], pts[pts.length - 1][1], 5, frost, ' opacity="0.85"');
    return s;
  };
  const branchCoral = (s0, col) => x => {
    let ol = '', fl = '', hl = '', tips = '';
    const go = (x0, y0, a, len, w, d) => {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len, seg = `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
      ol += S(seg, dk(col), w + 6); fl += S(seg, col, w); hl += S(`M${f(x0 - w * 0.2)} ${f(y0)}L${f(x1 - w * 0.2)} ${f(y1 + 3)}`, lt(col, 0.4), w * 0.28);
      if (d > 0) { go(x1, y1, a - 0.5, len * 0.78, w * 0.78, d - 1); go(x1, y1, a + 0.45, len * 0.74, w * 0.78, d - 1); }
      else tips += C(x1, y1, w * 0.62, frost || lt(col, 0.25));
    };
    go(x, Y + 2, -Math.PI / 2, 40 * s0, 16 * s0, 3);
    return `<g>${ol}${fl}${hl}${tips}</g>`;
  };
  const fan = (s0, col) => x => {
    const y = Y + 2, w = 70 * s0, h = 120 * s0, ol = dk(col);
    let o = `<path d="M${f(x - 6)} ${f(y)}L${f(x - w * 0.9)} ${f(y - h * 0.55)}Q${f(x - w * 1.05)} ${f(y - h)} ${f(x)} ${f(y - h * 1.05)}Q${f(x + w * 1.05)} ${f(y - h)} ${f(x + w * 0.9)} ${f(y - h * 0.55)}L${f(x + 6)} ${f(y)}Z" fill="${col}" stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"/>`;
    let net = '';
    for (let i = -3; i <= 3; i++) net += `M${f(x)} ${f(y - 4)}Q${f(x + i * w * 0.18)} ${f(y - h * 0.5)} ${f(x + i * w * 0.28)} ${f(y - h * 0.96 + Math.abs(i) * 6 * s0)}`;
    for (const t of [0.4, 0.62, 0.82]) net += `M${f(x - w * 0.95 * t - 6)} ${f(y - h * t)}Q${f(x)} ${f(y - h * t - 16 * s0)} ${f(x + w * 0.95 * t + 6)} ${f(y - h * t)}`;
    o += S(net, dk(col, 0.22), 2.4, ' opacity="0.8"');
    o += P(`M${f(x - w * 0.55)} ${f(y - h * 0.75)}Q${f(x - w * 0.5)} ${f(y - h * 0.95)} ${f(x - w * 0.1)} ${f(y - h * 0.98)}`, 'none', ` stroke="${lt(col, 0.5)}" stroke-width="5" stroke-linecap="round" opacity="0.7"`);
    if (frost) o += S(`M${f(x - w * 0.85)} ${f(y - h * 0.62)}Q${f(x - w)} ${f(y - h)} ${f(x)} ${f(y - h * 1.03)}Q${f(x + w)} ${f(y - h)} ${f(x + w * 0.85)} ${f(y - h * 0.62)}`, frost, 5, ' opacity="0.9"');
    return o;
  };
  const brain = (s0, col) => x => {
    const y = Y + 4, w = 52 * s0, h = 46 * s0, ol = dk(col);
    let o = `<path d="M${f(x - w)} ${f(y)}Q${f(x - w)} ${f(y - h * 1.3)} ${f(x)} ${f(y - h * 1.3)}Q${f(x + w)} ${f(y - h * 1.3)} ${f(x + w)} ${f(y)}Z" fill="${col}" stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"/>`;
    o += P(`M${f(x + w * 0.2)} ${f(y)}Q${f(x + w)} ${f(y - h * 0.2)} ${f(x + w * 0.85)} ${f(y - h * 0.6)}Q${f(x + w)} ${f(y)} ${f(x + w * 0.2)} ${f(y)}Z`, dk(col, 0.15), ' opacity="0.6"');
    let g = '';
    for (let i = 0; i < 4; i++) { const yy = y - h * (0.25 + i * 0.22), ww = w * (0.85 - i * 0.18); g += `M${f(x - ww)} ${f(yy)}q${f(ww * 0.25)} -8 ${f(ww * 0.5)} 0t${f(ww * 0.5)} 0t${f(ww * 0.5)} 0t${f(ww * 0.5)} 0`; }
    o += S(g, dk(col, 0.25), 2.6, ' opacity="0.75"');
    o += E(x - w * 0.4, y - h * 0.95, w * 0.25, h * 0.14, lt(col, 0.55), ` opacity="0.8" transform="rotate(-20 ${f(x - w * 0.4)} ${f(y - h * 0.95)})"`);
    if (frost) o += P(`M${f(x - w * 0.8)} ${f(y - h * 0.8)}Q${f(x)} ${f(y - h * 1.55)} ${f(x + w * 0.8)} ${f(y - h * 0.8)}Q${f(x)} ${f(y - h * 1.15)} ${f(x - w * 0.8)} ${f(y - h * 0.8)}Z`, frost, ' opacity="0.85"');
    return o;
  };
  const sponge = (s0, col) => x => {
    let o = '';
    for (const [dx, hh, ww] of [[-20, 70, 22], [6, 96, 25], [30, 58, 20]]) {
      const x0 = x + dx * s0, h = hh * s0, w = ww * s0, y = Y + 4, ol = dk(col);
      o += `<path d="M${f(x0 - w / 2)} ${f(y)}L${f(x0 - w / 2 - 2)} ${f(y - h)}Q${f(x0)} ${f(y - h - 8)} ${f(x0 + w / 2 + 2)} ${f(y - h)}L${f(x0 + w / 2)} ${f(y)}Z" fill="${col}" stroke="${ol}" stroke-width="3.2" stroke-linejoin="round"/>`;
      o += R(x0 + w * 0.12, y - h + 6, w * 0.3, h - 10, dk(col, 0.14), ' opacity="0.55"');
      o += E(x0, y - h - 1, w / 2 - 1, 5 * s0, dk(col, 0.45)) + E(x0, y - h - 2, w / 2 - 1, 5 * s0, 'none', ` stroke="${lt(col, 0.35)}" stroke-width="2.5"`);
      if (frost) o += E(x0, y - h - 5, w / 2 + 2, 4, frost, ' opacity="0.85"');
    }
    return o;
  };
  const rock = (s0, col, seed) => x => {
    const rr = rng(seed), pts = [], w = 70 * s0, h = 52 * s0, y = Y + 8;
    for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI, k = 0.9 + rr() * 0.14; pts.push([x + Math.cos(a) * w * k, y + Math.sin(a) * h * k * (1.1 - 0.15 * Math.abs(Math.cos(a)))]); }
    const ol = dk(col);
    let o = P(poly(pts), col, ` stroke="${ol}" stroke-width="3.5" stroke-linejoin="round"`);
    o += P(poly([[x + w * 0.15, y], ...pts.filter(p => p[0] > x + w * 0.15)]), dk(col, 0.14), ' opacity="0.6"');
    o += E(x - w * 0.35, y - h * 0.62, w * 0.28, h * 0.14, lt(col, 0.4), ` opacity="0.75" transform="rotate(-18 ${f(x - w * 0.35)} ${f(y - h * 0.62)})"`);
    o += C(x + w * 0.3, y - h * 0.5, 4 * s0, dk(col, 0.25), ' opacity="0.6"') + C(x + w * 0.05, y - h * 0.3, 3 * s0, dk(col, 0.25), ' opacity="0.5"');
    if (frost) o += P(`M${f(x - w * 0.75)} ${f(y - h * 0.6)}Q${f(x)} ${f(y - h * 1.25)} ${f(x + w * 0.7)} ${f(y - h * 0.62)}Q${f(x)} ${f(y - h * 0.92)} ${f(x - w * 0.75)} ${f(y - h * 0.6)}Z`, frost, ' opacity="0.8"');
    return o;
  };
  const grass = (s0, col, n = 6) => x => {
    let o = '', hl = '';
    for (let i = 0; i < n; i++) {
      const bx = x + (i - (n - 1) / 2) * 7 * s0, h = (40 + ((i * 37) % 30)) * s0, lean = (i - (n - 1) / 2) * 6 * s0 + 4;
      o += `M${f(bx - 4)} ${f(Y + 6)}Q${f(bx - 3 + lean * 0.3)} ${f(Y - h * 0.6)} ${f(bx + lean)} ${f(Y - h)}Q${f(bx + 3 + lean * 0.4)} ${f(Y - h * 0.55)} ${f(bx + 4)} ${f(Y + 6)}Z`;
      hl += `M${f(bx - 1)} ${f(Y)}Q${f(bx + lean * 0.3)} ${f(Y - h * 0.55)} ${f(bx + lean * 0.85)} ${f(Y - h * 0.9)}`;
    }
    return P(o, col, ` stroke="${dk(col)}" stroke-width="2.6" stroke-linejoin="round"`) + S(hl, lt(col, 0.4), 1.6, ' opacity="0.6"');
  };
  // --- layout (one period); [painter, x, halfWidth] — back row first ---
  const K = c('kelp'), K2 = c('kelp2');
  props.push([kelp(250, 26, 0.3, K), 70, 60], [kelp(205, 22, 2.1, K2), 108, 60], [kelp(170, 18, 4.0, K), 40, 55]);
  props.push([kelp(230, 24, 1.1, K2), 690, 60], [kelp(185, 20, 3.1, K), 730, 60]);
  props.push([kelp(215, 24, 5.2, K), 1135, 60], [kelp(160, 18, 0.7, K2), 1170, 55]);
  props.push([fan(1.05, c('fan')), 330, 80], [fan(0.8, c('fan')), 905, 62]);
  props.push([sponge(1, c('sponge')), 520, 50], [sponge(0.8, c('sponge')), 1040, 40]);
  props.push([branchCoral(1.0, c('coral')), 225, 80], [branchCoral(0.85, c('coral')), 815, 70]);
  props.push([rock(1.1, c('rock'), 7), 150, 85], [rock(0.8, c('rock'), 9), 615, 62], [rock(0.95, c('rock'), 13), 990, 72]);
  props.push([brain(1, c('coral2')), 430, 60], [brain(0.75, c('coral2')), 1100, 45]);
  for (const [x, s] of [[20, 1], [280, 0.8], [470, 0.9], [580, 0.7], [760, 1], [870, 0.8], [1200 - 50, 0.9]]) props.push([grass(s, c('grass')), x, 40]);
  void r;
  let o = '';
  for (const [fn, x, hw] of props) o += both(fn, x, hw);
  return svg(1200, 300, o);
}

// =====================================================================================================
// GROUND: sandy seabed (0 0 1200 260); sand line ≈ y 60
// =====================================================================================================
const GROUND_LINE = 60;
function ground(m) {
  const sand = SAND[m], r = rng(201 + MOODS.indexOf(m)), [top, bot] = WATER[m];
  const yT = x => 48 + 6 * Math.sin(2 * Math.PI * x / 400 + 0.6) + 4 * Math.sin(2 * Math.PI * x / 240 + 2) + 3 * Math.sin(2 * Math.PI * x / 150);
  let defs = lg('sd', [[0, lt(sand, 0.12)], [0.35, sand], [1, SAND_BOTTOM[m]]], V);
  defs += lg('hz', [[0, mix(top, bot, 0.6), 0.5], [1, mix(top, bot, 0.6), 0]], V);
  let o = P(fill(yT, 260, 5), 'url(#sd)');
  // sand top highlight + water haze on the far sand
  let rim = ''; for (let x = 0; x <= W; x += 5) rim += (x ? 'L' : 'M') + f(x) + ' ' + f(yT(x) + 2.5);
  o += S(rim, lt(sand, 0.45), 4, ' opacity="0.8"');
  o += P(fill(x => yT(x) + 1, 130, 5), 'url(#hz)');
  // ripples (period 1200 via wrapped placement)
  const ripC = mix(sand, '#A88B5C', 0.32), ripL = lt(sand, 0.4);
  let rp = '', rl = '';
  for (let row = 0; row < 6; row++) {
    const y = 82 + row * 30 + (row > 3 ? (row - 3) * 6 : 0), n = 8 + row, len = 70 + row * 14;
    for (let i = 0; i < n; i++) {
      const x = (i + (row % 2) * 0.5) * W / n + (r() - 0.5) * 30, yy = y + (r() - 0.5) * 8, l = len * (0.7 + r() * 0.5);
      const seg = xx => `M${f(xx - l / 2)} ${f(yy)}Q${f(xx - l / 4)} ${f(yy - 5)} ${f(xx)} ${f(yy)}T${f(xx + l / 2)} ${f(yy)}`;
      rp += both(seg, x, l / 2 + 4);
      rl += both(xx => `M${f(xx - l / 2 + 4)} ${f(yy + 3.5)}Q${f(xx - l / 4)} ${f(yy - 1.5)} ${f(xx)} ${f(yy + 3.5)}`, x, l / 2 + 4);
    }
  }
  o += S(rp, ripC, 3, ' opacity="0.45"') + S(rl, ripL, 2.2, ' opacity="0.6"');
  // pebbles
  const peb = [mix('#BDB2A0', sand, 0.2), mix('#A9A9A2', sand, 0.25), mix('#C9B49A', sand, 0.2)];
  let pb = '';
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = 90 + r() * 150, rx = 5 + r() * 9 * (0.6 + (y - 90) / 150), col = peb[i % 3];
    pb += both(xx => E(xx + 1.5, y + rx * 0.4, rx, rx * 0.45, '#7A6240', ' opacity="0.15"') + E(xx, y, rx, rx * 0.62, col, ` stroke="${mix(col, '#5E5040', 0.35)}" stroke-width="2"`) + E(xx - rx * 0.3, y - rx * 0.22, rx * 0.35, rx * 0.16, '#FFFFFF', ' opacity="0.45"'), x, rx + 2);
  }
  o += pb;
  // shells: scallops + little spirals (cream / pale peach, never answer colours)
  const shellC = m === 'winter' ? ['#F4EEE6', '#E7E3EE'] : ['#F7E9D7', '#F3D5C6'];
  const scallop = (x, y, s, col) => {
    const ol = mix(col, '#8E6E4C', 0.45);
    let d = `M${f(x)} ${f(y + 9 * s)}L${f(x - 13 * s)} ${f(y - 2 * s)}Q${f(x - 13 * s)} ${f(y - 14 * s)} ${f(x)} ${f(y - 14 * s)}Q${f(x + 13 * s)} ${f(y - 14 * s)} ${f(x + 13 * s)} ${f(y - 2 * s)}Z`;
    let g = E(x + 2, y + 9 * s, 12 * s, 3.5 * s, '#7A6240', ' opacity="0.16"') + P(d, col, ` stroke="${ol}" stroke-width="2.4" stroke-linejoin="round"`);
    let ribs = ''; for (const a of [-0.75, -0.38, 0, 0.38, 0.75]) ribs += `M${f(x)} ${f(y + 7 * s)}L${f(x + Math.sin(a) * 12 * s)} ${f(y - Math.cos(a) * 12 * s)}`;
    g += S(ribs, ol, 1.5, ' opacity="0.6"') + R(x - 4 * s, y + 6 * s, 8 * s, 4 * s, col, ` stroke="${ol}" stroke-width="2" rx="${f(1.5 * s)}"`);
    return g;
  };
  const spiral = (x, y, s, col) => {
    const ol = mix(col, '#8E6E4C', 0.45);
    return E(x + 2, y + 7 * s, 13 * s, 3 * s, '#7A6240', ' opacity="0.16"') +
      P(`M${f(x - 12 * s)} ${f(y + 6 * s)}Q${f(x - 12 * s)} ${f(y - 9 * s)} ${f(x)} ${f(y - 9 * s)}Q${f(x + 12 * s)} ${f(y - 9 * s)} ${f(x + 12 * s)} ${f(y + 2 * s)}L${f(x + 15 * s)} ${f(y + 7 * s)}Z`, col, ` stroke="${ol}" stroke-width="2.3" stroke-linejoin="round"`) +
      S(`M${f(x + 1 * s)} ${f(y + 1 * s)}m-4 0a4 4 0 1 1 8 0a6 6 0 1 1 -12 0`, ol, 1.6, ' opacity="0.7"');
  };
  const shells = [[90, 120, 1, 0], [330, 205, 1.3, 1], [520, 150, 0.9, 0], [700, 228, 1.4, 0], [905, 135, 1, 1], [1110, 190, 1.2, 0], [1185, 112, 0.8, 1], [250, 100, 0.75, 1]];
  for (const [x, y, s, k] of shells) o += both(xx => (k ? spiral : scallop)(xx, y, s, shellC[(x / 10 | 0) % 2]), x, 18 * s);
  // tiny sea-star deco (muted coral, not an answer colour) and mood dressing
  const star5 = (x, y, s, col) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 5 * s : 13 * s; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]); }
    return P(poly(pts), col, ` stroke="${dk(col, 0.3)}" stroke-width="2.4" stroke-linejoin="round"`) + C(x, y - 1, 1.8 * s, lt(col, 0.4)); };
  o += both(xx => star5(xx, 175, 1.1, m === 'winter' ? '#D9C8CF' : m === 'autumn' ? '#D8A07C' : '#E8B09E'), 600, 16);
  if (m === 'spring') { // fresh sea-grass sprigs + fallen petals
    let sp = ''; for (const x of [160, 450, 780, 1010]) sp += both(xx => `M${f(xx)} 78q-3 -16 -9 -24M${f(xx)} 78q1 -18 6 -28M${f(xx)} 78q4 -12 12 -16`, x, 16);
    o += S(sp, pal(m, '#8FC48A'), 3.4);
    for (const [x, y] of [[230, 140], [640, 112], [980, 220], [60, 210]]) o += both(xx => `<g transform="rotate(${(x * 7) % 90 - 45} ${f(xx)} ${y})">` + E(xx, y, 8, 5, '#F4C2CF', ' stroke="#DE9DB0" stroke-width="1.6"') + `</g>`, x, 10);
  }
  if (m === 'autumn') for (const [x, y, a] of [[210, 132, 30], [760, 200, -40], [1060, 110, 70]]) o += both(xx => `<g transform="rotate(${a} ${f(xx)} ${y})">` + P(`M${f(xx - 12)} ${y}Q${f(xx)} ${y - 8} ${f(xx + 12)} ${y}Q${f(xx)} ${y + 8} ${f(xx - 12)} ${y}Z`, '#D99A55', ' stroke="#A8692F" stroke-width="1.8"') + S(`M${f(xx - 10)} ${y}H${f(xx + 10)}`, '#A8692F', 1.3) + `</g>`, x, 14);
  if (m === 'winter') { let fr = ''; for (let i = 0; i < 40; i++) { const x = r() * W, y = 70 + r() * 180; fr += both(xx => C(xx, y, 1.4 + r() * 1.4, '#FFFFFF'), x, 4); } o += `<g opacity="0.7">${fr}</g>`; }
  if (m === 'summer') { let gl = ''; for (let i = 0; i < 18; i++) { const x = r() * W, y = 80 + r() * 160; gl += both(xx => C(xx, y, 2, '#FFFDF0'), x, 3); } o += `<g opacity="0.75">${gl}</g>`; }
  // bottom rows: plain SAND_BOTTOM so the render can extend the sand with a flat fill
  o += R(0, 250, W, 10, SAND_BOTTOM[m]);
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SURFACE: water surface seen from below (0 0 1200 120), top anchored
// =====================================================================================================
function surface(m) {
  const r = rng(301 + MOODS.indexOf(m)), [top] = WATER[m];
  let o = '', defs = '';
  if (m !== 'winter') {
    const yB = x => 30 + 7 * Math.sin(2 * Math.PI * x / 300 + 0.4) + 5 * Math.sin(2 * Math.PI * x / 200 + 1.7) + 2.5 * Math.sin(2 * Math.PI * x / 75);
    const a = m === 'summer' ? 0.62 : 0.45;
    defs += lg('sf', [[0, '#FFFFFF', a], [1, '#FFFFFF', a * 0.25]], V);
    o += P(line([[0, 0], ...Array.from({ length: 241 }, (_, i) => [i * 5, yB(i * 5)]), [W, 0]]) + 'Z', 'url(#sf)');
    o += S(line(Array.from({ length: 241 }, (_, i) => [i * 5, yB(i * 5)])), '#FFFFFF', m === 'summer' ? 4 : 3, ` opacity="${m === 'summer' ? 0.85 : 0.6}"`);
    // ripple glints below the surface line
    let rp = '';
    const n = m === 'summer' ? 34 : 20;
    for (let i = 0; i < n; i++) {
      const x = (i + r() * 0.6) * W / n, y = 50 + r() * 50, l = 18 + r() * 34;
      rp += both(xx => `M${f(xx - l / 2)} ${f(y)}Q${f(xx)} ${f(y - 6)} ${f(xx + l / 2)} ${f(y)}`, x, l / 2 + 3);
    }
    o += S(rp, '#FFFFFF', m === 'summer' ? 3.2 : 2.4, ` opacity="${m === 'summer' ? 0.55 : 0.35}"`);
    if (m === 'summer') { // a sun-spot shimmer, period 600
      defs += rg('sun', [[0, '#FFFBE6', 0.8], [0.4, '#FFF6CC', 0.35], [1, '#FFFFFF', 0]]);
      for (const x of [260, 860]) o += E(x, 6, 150, 60, 'url(#sun)');
    }
    if (m === 'spring') { // floating blossom petals + two little blossoms (seen from below: soft and slightly shadowed)
      const petal = (x, y, a, s) => `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + P(`M${f(x - 11 * s)} ${f(y)}Q${f(x - 4 * s)} ${f(y - 8 * s)} ${f(x + 11 * s)} ${f(y - 1 * s)}Q${f(x + 3 * s)} ${f(y + 8 * s)} ${f(x - 11 * s)} ${f(y)}Z`, '#F4BCCB', ' stroke="#D995AA" stroke-width="2"') + S(`M${f(x - 8 * s)} ${f(y)}Q${f(x)} ${f(y - 2 * s)} ${f(x + 8 * s)} ${f(y - 1 * s)}`, '#FFE3EA', 1.6, ' opacity="0.8"') + `</g>`;
      const blossom = (x, y, s) => { let b = ''; for (let i = 0; i < 5; i++) { const a = i * 72 - 90, px = x + Math.cos(a * Math.PI / 180) * 9 * s, py = y + Math.sin(a * Math.PI / 180) * 6 * s; b += `<g transform="rotate(${a + 90} ${f(px)} ${f(py)})">` + E(px, py, 7 * s, 9 * s, '#F7C6D3', ' stroke="#D995AA" stroke-width="2"') + `</g>`; } return b + C(x, y, 4 * s, '#F6DFA2', ' stroke="#D3B46A" stroke-width="1.6"'); };
      for (let i = 0; i < 16; i++) { const x = (i + r()) * W / 16, y = 14 + r() * 18 + 6 * Math.sin(x / 50), a = r() * 360, s = 0.8 + r() * 0.5; o += both(xx => petal(xx, y, a, s), x, 14); }
      for (const x of [380, 1010]) o += both(xx => blossom(xx, 22, 1.2), x, 22);
    }
    if (m === 'autumn') { // floating leaves (orange / amber)
      const leaf = (x, y, a, s, col) => { const ol = mix(col, '#6E3E14', 0.45); return `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})">` + P(`M${f(x - 16 * s)} ${f(y)}Q${f(x - 4 * s)} ${f(y - 11 * s)} ${f(x + 14 * s)} ${f(y - 2 * s)}L${f(x + 19 * s)} ${f(y)}L${f(x + 14 * s)} ${f(y + 2 * s)}Q${f(x - 4 * s)} ${f(y + 11 * s)} ${f(x - 16 * s)} ${f(y)}Z`, col, ` stroke="${ol}" stroke-width="2.2" stroke-linejoin="round"`) + S(`M${f(x - 20 * s)} ${f(y + 1)}L${f(x + 14 * s)} ${f(y)}M${f(x - 4 * s)} ${f(y)}l6 -6M${f(x + 4 * s)} ${f(y)}l5 -5M${f(x - 4 * s)} ${f(y)}l6 6M${f(x + 4 * s)} ${f(y)}l5 5`, ol, 1.5, ' opacity="0.75"') + `</g>`; };
      const cols = ['#E39A52', '#D9A848', '#D58447', '#E2B35E'];
      for (let i = 0; i < 13; i++) { const x = (i + r()) * W / 13, y = 16 + r() * 18, a = r() * 360, s = 0.8 + r() * 0.45; o += both(xx => leaf(xx, y, a, s, cols[i % 4]), x, 22); }
    }
  } else {
    // winter ice sheet: thick at the top, irregular rounded underside with small icicles, cracks
    const yI = x => 82 + 9 * Math.sin(2 * Math.PI * x / 400 + 1) + 6 * Math.sin(2 * Math.PI * x / 150 + 0.3) + 3 * Math.sin(2 * Math.PI * x / 60);
    defs += lg('ice', [[0, '#F4FAFD'], [0.6, '#DCEEF6'], [1, '#C4E0EE']], V);
    const edge = Array.from({ length: 241 }, (_, i) => [i * 5, yI(i * 5)]);
    let icic = '';
    for (let i = 0; i < 18; i++) { const x = (i + 0.3 + r() * 0.4) * W / 18, y = yI(x) - 2, l = 12 + r() * 18, w = 6 + r() * 6; icic += both(xx => `M${f(xx - w)} ${f(y)}Q${f(xx - w * 0.3)} ${f(y + l * 0.7)} ${f(xx)} ${f(y + l)}Q${f(xx + w * 0.3)} ${f(y + l * 0.7)} ${f(xx + w)} ${f(y)}Z`, x, w + 2); }
    o += P(line([[0, 0], ...edge, [W, 0]]) + 'Z', 'url(#ice)', ' opacity="0.96"');
    o += P(icic, '#CBE4F0', ' stroke="#A8CBE0" stroke-width="2" stroke-linejoin="round"');
    o += S(line(edge), '#A8CBE0', 3.4);
    o += S(line(edge.map(([x, y]) => [x, y - 5])), '#FFFFFF', 2.6, ' opacity="0.8"');
    // cracks: zig-zag lines from near the top down towards the underside (+ white bevel)
    let cr = '', bv = '';
    for (let i = 0; i < 9; i++) {
      const x0 = (i + 0.2 + r() * 0.6) * W / 9, pts = [[x0, 4 + r() * 10]];
      while (pts[pts.length - 1][1] < yI(pts[pts.length - 1][0]) - 14) { const p = pts[pts.length - 1]; pts.push([p[0] + (r() - 0.5) * 34, p[1] + 9 + r() * 12]); }
      const br0 = pts[1 + (r() * (pts.length - 2) | 0)] || pts[0], brp = [br0, [br0[0] + 14 + r() * 12, br0[1] + 8 + r() * 6], [br0[0] + 26 + r() * 10, br0[1] + 12 + r() * 10]];
      const half = 40;
      cr += both(xx => line(pts.map(([x, y]) => [x - x0 + xx, y])) + line(brp.map(([x, y]) => [x - x0 + xx, y])), x0, half);
      bv += both(xx => line(pts.map(([x, y]) => [x - x0 + xx + 2.2, y + 1])), x0, half);
    }
    o += S(bv, '#FFFFFF', 2, ' opacity="0.9"') + S(cr, '#8DB7D2', 2.4);
    // frosty air bubbles trapped in the ice + sheen
    let bb = ''; for (let i = 0; i < 26; i++) { const x = r() * W, y = 14 + r() * 40, rr = 1.6 + r() * 2.6; bb += both(xx => C(xx, y, rr, 'none', ' stroke="#FFFFFF" stroke-width="1.4"'), x, 5); }
    o += `<g opacity="0.75">${bb}</g>`;
    let sh = ''; for (const x of [140, 520, 860]) sh += both(xx => `M${f(xx)} 18l40 -8M${f(xx + 10)} 28l26 -5`, x, 50);
    o += S(sh, '#FFFFFF', 4, ' opacity="0.7"');
    // light under the ice
    defs += lg('ul', [[0, '#FFFFFF', 0.3], [1, '#FFFFFF', 0]], V);
    o += P(line([...edge, [W, 120], [0, 120]]) + 'Z', 'url(#ul)');
    void top;
  }
  return svg(1200, 120, o, defs);
}

// =====================================================================================================
// RAYS (0 0 600 720) and CAUSTIC (0 0 400 200)
// =====================================================================================================
function rays() {
  let defs = lg('ry', [[0, '#FFFFFF', 0.5], [0.55, '#FFFFFF', 0.18], [1, '#FFFFFF', 0]], V);
  let o = '';
  const beams = [[-0.42, 34, 0.55], [-0.27, 22, 0.8], [-0.14, 40, 0.65], [0.0, 26, 1], [0.12, 46, 0.7], [0.25, 20, 0.85], [0.38, 36, 0.55]];
  for (const [a, w, op] of beams) {
    const x0 = 300 + a * 120, bx = 300 + Math.tan(a) * 720 * 0.9;
    o += P(poly([[x0 - w * 0.25, 0], [x0 + w * 0.25, 0], [bx + w * 1.4, 720], [bx - w * 1.4, 720]]), 'url(#ry)', ` opacity="${op}"`);
  }
  return svg(600, 720, o, defs);
}
function caustic() {
  // jittered periodic grid (8 x 4, cell 50) → curved white edges; tile both ways
  const nx = 8, ny = 4, cw = 50, r = rng(77), J = [];
  for (let j = 0; j < ny; j++) { J[j] = []; for (let i = 0; i < nx; i++) J[j][i] = [(r() - 0.5) * 26, (r() - 0.5) * 26]; }
  const pt = (i, j) => { const ii = ((i % nx) + nx) % nx, jj = ((j % ny) + ny) % ny; return [i * cw + 25 + J[jj][ii][0], j * cw + 25 + J[jj][ii][1]]; };
  let d = '';
  for (let j = -1; j <= ny; j++) for (let i = -1; i <= nx; i++) {
    const a = pt(i, j);
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const b = pt(i + di, j + dj), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), sg = ((i + j + di) % 2 + 2) % 2 ? 1 : -1, bow = 9 * sg;
      const c1 = [a[0] + dx * 0.3 - dy / l * bow, a[1] + dy * 0.3 + dx / l * bow], c2 = [a[0] + dx * 0.7 - dy / l * bow * 0.6, a[1] + dy * 0.7 + dx / l * bow * 0.6];
      d += `M${f(a[0])} ${f(a[1])}C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
    }
  }
  // little light knots where the threads meet
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = pt(i, j); d += `M${f(p[0] - 2)} ${f(p[1])}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0`; }
  return svg(400, 200, S(d, '#FFFFFF', 7, ' opacity="0.28"') + S(d, '#FFFFFF', 3, ' opacity="0.65"'));
}

// =====================================================================================================
// PARTICLES (0 0 32 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.petal = svg(32, 32, `<g transform="rotate(-20 16 16)">` + P('M16 29Q5 23 6 13Q7 5 12.5 3.5L16 8L19.5 3.5Q25 5 26 13Q27 23 16 29Z', '#F8B9CC', ' stroke="#DC8FA8" stroke-width="1.8" stroke-linejoin="round"') +
    P('M16 26Q9.5 21.5 10.5 14Q11.5 9 14 8L16 10.5Z', '#FFE4EC', ' opacity="0.9"') + S('M16 12V24', '#E7A3B8', 1.3) + `</g>`);
  out.leaf_a = svg(32, 32, `<g transform="rotate(-14 16 16)">` +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Q13 25 12.5 21Q8.5 22.5 4 21Q5 17.5 8.5 15.5Q5.5 13 4.5 8.5Q9 7 12.5 9.5Q13 6 16 2.5Z', '#F29A48', ' stroke="#B8621E" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2.5Q19 6 19.5 9.5Q23 7 27.5 8.5Q26.5 13 23.5 15.5Q27 17.5 28 21Q23.5 22.5 19.5 21Q19 25 16 28Z', '#E0853A', ' opacity="0.55"') +
    S('M16 9V31M16 17L9 11M16 17L23 11M16 20L9 19M16 20L23 19', '#B8621E', 1.3) + `</g>`);
  out.leaf_b = svg(32, 32, `<g transform="rotate(28 16 16)">` + P('M16 2Q26 9 25 18Q24 26 16 29Q8 26 7 18Q6 9 16 2Z', '#E6AE45', ' stroke="#A9761C" stroke-width="2" stroke-linejoin="round"') +
    P('M16 2Q26 9 25 18Q24 26 16 29Z', '#D49A35', ' opacity="0.55"') + S('M16 6V31M16 13L11 9M16 13L21 9M16 19L10 15M16 19L22 15M16 24L12 21M16 24L20 21', '#A9761C', 1.3) + `</g>`);
  // snowflake (soft halo + 6 arms)
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 11)} ${f(16 + s * 11)}`; const bx = 16 + c * 7, by = 16 + s * 7; for (const d of [-1, 1]) { const b = a + d * 0.8; arms += `M${f(bx)} ${f(by)}L${f(bx + Math.cos(b) * 3.6)} ${f(by + Math.sin(b) * 3.6)}`; } }
  out.snow = svg(32, 32, C(16, 16, 15.5, 'url(#sg)') + S(arms, '#C9DDF0', 4) + S(arms, '#FFFFFF', 2.2) + C(16, 16, 3, '#FFFFFF'),
    rg('sg', [[0, '#FFFFFF', 0.7], [0.5, '#F2F7FC', 0.3], [1, '#F2F7FC', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#kg)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#F3F3F3') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('kg', [[0, '#FFFFFF', 0.55], [1, '#FFFFFF', 0]]));
  const starPts = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; };
  out.star = svg(32, 32, P(poly(starPts(16, 16.8, 14, 6.4)), '#EDEDED', ' stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"') + P(poly(starPts(15.4, 16, 8, 3.7)), '#FFFFFF'));
  out.plankton = svg(32, 32, C(16, 16, 15, 'url(#pg)') + C(16, 16, 4.2, '#F6FFF8') + C(14.8, 14.8, 1.5, '#FFFFFF'),
    rg('pg', [[0, '#F2FFF4', 0.85], [0.35, '#E6FBF0', 0.35], [1, '#E6FBF0', 0]]));
  // paint dot: white (tinted by code); faint grey shade lower-right + white glint keep it round after multiply-tint
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)">` + `<rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/>` + `</g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); wr(env, 'surface_' + m, surface(m)); }
  wr(env, 'rays', rays()); wr(env, 'caustic', caustic());
  const ps = particles(); for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 4 + ' layers + rays, caustic) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, WATER, SAND, SAND_BOTTOM, RAYS_ALPHA, CAUSTIC_ALPHA, MID_BASE, GROUND_LINE };
if (require.main === module) main();
