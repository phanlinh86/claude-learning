// Pebble's Oasis Run: environment art generator (4 storybook chapters + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image>, filters or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<ch>/sky.svg      960x540, transparent sky décor only, nothing below y 420, horizontally tileable.
//  - levels/<ch>/far.svg      960x300 horizon band, transparent above ~y 60, rows y 280..300 opaque in palette.sandFar,
//                             bottom edge sits on horizonY in game; tileable.
//  - levels/<ch>/prop_0..3    160x220 roadside props, base line y 214, centre x 80, transparent.
//  - levels/palette.json      {ch: {skyTop, skyBottom, sandFar, sandNear, path, pathEdge, divider, vig}}
//  - particles/*.svg          32x32 (sand 16x8), centred, transparent edges.
// Tileability: every shape that crosses x 0 or x 960 is emitted again shifted by ±960 (wrap()); bands are periodic
// (sine sums with integer periods over 960), so the left edge equals the right edge.
// Play-area rule: backgrounds softer/less saturated than the characters; the path is a calm sand a step darker
// than Pebble's cream (#f3dfb8) and clearly lighter than pots/logs/tumbleweeds; never the shell colours.
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x9E3779B9 | 0; let t = Math.imul(seed ^ seed >>> 16, 0x85EBCA6B); t = Math.imul(t ^ t >>> 13, 0xC2B2AE35); return ((t ^ t >>> 16) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dk = (c, t = 0.25, to = '#3a2414') => mix(c, to, t);
const lt = (c, t = 0.25) => mix(c, '#ffffff', t);
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"${fill ? ` fill="${fill}"` : ''}${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}"${fill ? ` fill="${fill}"` : ''}${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const SO = (c, w) => ` stroke="${c}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const linV = (id, s, y1, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stops(s)}</linearGradient>`;
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.45], ['1', col, 0]]);
const poly = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('') + 'Z';
const star5 = (cx, cy, R, r, rot = -90) => { const p = []; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return poly(p); };
const twinkle = (cx, cy, R, k = 0.2) => {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2, m = a + Math.PI / 4;
    if (!i) d += `M${f(cx + Math.cos(a) * R)} ${f(cy + Math.sin(a) * R)}`;
    d += `Q${f(cx + Math.cos(m) * R * k)} ${f(cy + Math.sin(m) * R * k)} ${f(cx + Math.cos(b) * R)} ${f(cy + Math.sin(b) * R)}`;
  }
  return d + 'Z';
};
// emit a group again shifted by ±W when its x range [x0, x1] crosses an edge of the tile
const wrap = (x0, x1, body) => body + (x0 < 0 ? `<g transform="translate(${W} 0)">${body}</g>` : '') + (x1 > W ? `<g transform="translate(${-W} 0)">${body}</g>` : '');
// periodic band: y(x) = y0 + Σ a·sin(2π k x / W + p), filled down to yb
const wave = (y0, terms, yb, step = 6) => {
  let d = '';
  for (let x = 0; x <= W; x += step) {
    let y = y0; for (const [k, a, p] of terms) y += a * Math.sin(2 * Math.PI * k * x / W + p);
    d += (x ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d + `L${W} ${yb}L0 ${yb}Z`;
};
const waveY = (y0, terms, x) => { let y = y0; for (const [k, a, p] of terms) y += a * Math.sin(2 * Math.PI * k * x / W + p); return y; };
// a ridge line only (no fill) of a wave, for highlight strokes
const waveLine = (y0, terms, dy = 0) => { let d = ''; for (let x = 0; x <= W; x += 6) d += (x ? 'L' : 'M') + f(x) + ' ' + f(waveY(y0, terms, x) + dy); return d; };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// a leaf/frond shape along a drooping curved spine from (x,y); ang in degrees (0 = right, -90 = up)
function frondPath(x, y, ang, len, droop, wid, notches = 0) {
  const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), n = 16, L = [], R = [];
  const pt = t => [x + dx * len * t, y + dy * len * t + droop * len * t * t];
  for (let i = 0; i <= n; i++) {
    const t = i / n, [px, py] = pt(t), [qx, qy] = pt(Math.min(1, t + 0.01)), [rx, ry] = pt(Math.max(0, t - 0.01));
    let tx = qx - rx, ty = qy - ry; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    let w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t);
    const wl = notches ? w * (0.7 + 0.3 * Math.abs(Math.sin(t * notches * Math.PI))) : w;
    L.push([px - ty * wl, py + tx * wl]); R.push([px + ty * w * 0.8, py - tx * w * 0.8]);
  }
  return { d: poly([...L, ...R.reverse()]), spine: (() => { let d = ''; for (let i = 0; i <= 10; i++) { const [px, py] = pt(i / 10 * 0.92); d += (i ? 'L' : 'M') + f(px) + ' ' + f(py); } return d; })() };
}
// a palm tree: curved trunk from (bx, by) to crown (cx, cy), fronds
function palm(bx, by, cx, cy, s, c, o = {}) {
  const ow = o.ow ?? 0, out = c.out;
  let g = '';
  const mx = (bx + cx) / 2 + (o.bend ?? 0) * s, my = (by + cy) / 2;
  const tw0 = 7 * s, tw1 = 4.2 * s;
  const trunk = `M${f(bx - tw0)} ${f(by)}Q${f(mx - (tw0 + tw1) / 2)} ${f(my)} ${f(cx - tw1)} ${f(cy)}L${f(cx + tw1)} ${f(cy)}Q${f(mx + (tw0 + tw1) / 2)} ${f(my)} ${f(bx + tw0)} ${f(by)}Z`;
  g += pth(trunk, c.trunk, ow ? SO(out, ow) : '');
  if (o.rings !== false) {
    // trunk rings: short arcs along the curve, shade side
    const nR = o.nRings ?? 9;
    for (let i = 1; i < nR; i++) {
      const t = i / nR, x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * cx, y = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * cy;
      const w = tw0 + (tw1 - tw0) * t;
      g += stk(`M${f(x - w * 0.9)} ${f(y - 1.2 * s)}Q${f(x)} ${f(y + 2 * s)} ${f(x + w * 0.9)} ${f(y - 1.2 * s)}`, c.trunkShade, Math.max(1, 1.6 * s));
    }
    g += pth(`M${f(bx + tw0 * 0.25)} ${f(by)}Q${f(mx + tw0 * 0.3)} ${f(my)} ${f(cx + tw1 * 0.2)} ${f(cy)}L${f(cx + tw1)} ${f(cy)}Q${f(mx + (tw0 + tw1) / 2)} ${f(my)} ${f(bx + tw0)} ${f(by)}Z`, c.trunkShade, op(0.55));
  }
  const fr = o.fronds || [[-160, 0.55], [-130, 0.35], [-100, 0.15], [-60, 0.2], [-25, 0.4], [5, 0.6], [-200, 0.75], [30, 0.8]];
  const len = (o.len ?? 46) * s, wid = (o.wid ?? 9) * s;
  // back fronds first (shade colour), then front
  fr.forEach(([a, dr], i) => {
    const F = frondPath(cx, cy, a, len * (0.85 + 0.15 * ((i * 7) % 3) / 2), dr, wid, o.notch ?? 5);
    const back = i % 2 === 1;
    g += pth(F.d, back ? c.leafShade : c.leaf, ow ? SO(out, ow) : '');
    if (o.ribs !== false) g += stk(F.spine, back ? dk(c.leafShade, 0.2) : c.leafShade, Math.max(0.8, 1.4 * s), op(0.8));
  });
  if (o.coconuts) for (const [dx, dy] of [[-4, 4], [3, 5], [0, 7.5]]) g += circ(cx + dx * s, cy + dy * s, 3.6 * s, c.nut, ow ? SO(out, ow * 0.8) : '');
  return g;
}
// puffy storybook cloud: flat-ish bottom, one-step shade underneath
function cloud(x, y, w, h, c, seed) {
  const r = rng(seed), n = 4 + Math.floor(w / 70), circles = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, bump = Math.sin(Math.PI * t);
    const rr = h * (0.45 + 0.5 * bump) * (0.85 + r() * 0.3);
    circles.push([x - w / 2 + t * w, y - rr * 0.55 + h * 0.15, rr]);
  }
  let g = `<g fill="${c.shade}">${circles.map(([cx, cy, rr]) => circ(cx, cy + 3, rr)).join('')}${rrect(x - w / 2 - h * 0.1, y - h * 0.3, w + h * 0.2, h * 0.62, h * 0.31)}</g>`;
  g += `<g fill="${c.fill}">${circles.map(([cx, cy, rr]) => circ(cx, cy - 1, rr * 0.94)).join('')}${rrect(x - w / 2, y - h * 0.32, w, h * 0.5, h * 0.25)}</g>`;
  g += ell(circles[1][0], circles[1][1] - circles[1][2] * 0.35, circles[1][2] * 0.45, circles[1][2] * 0.22, '#ffffff', op(0.55));
  return wrap(x - w / 2 - h, x + w / 2 + h, `<g opacity="${c.op}">${g}</g>`);
}
const bird = (x, y, s, col) => stk(`M${f(x - 7 * s)} ${f(y - 2 * s)}Q${f(x - 3.5 * s)} ${f(y - 5 * s)} ${f(x)} ${f(y)}Q${f(x + 3.5 * s)} ${f(y - 5 * s)} ${f(x + 7 * s)} ${f(y - 2 * s)}`, col, 1.8 * s);

// ---------- chapter palettes (muted; path a step darker than Pebble's cream, lighter than obstacles) ----------
const Z = {
  grove: {
    skyTop: '#8ccbe3', skyBottom: '#f4ecd2', sandFar: '#e3d5a4', sandNear: '#cbb978',
    path: '#e0c38e', pathEdge: '#a8875a', divider: '#f6e7c4', vig: 'rgba(70,60,30,0.16)',
    cloud: { fill: '#fffbf2', shade: '#dfe8ec', op: 0.92 }, sun: '#fff3c8', sunGlow: '#fff2c0', bird: '#7f93a6',
    hill: '#cfd2a6', hill2: '#b9c695', palmFar: { trunk: '#b3a888', trunkShade: '#a19676', leaf: '#9fbc8f', leafShade: '#8aab80', nut: '#8a7a5a' },
    water: '#a7d6d0', waterDeep: '#8cc4c4', glint: '#f2fbf8', wall: '#e2bf92', wallShade: '#cda57a', door: '#a78562', ground: '#dccf9b'
  },
  dunes: {
    skyTop: '#73b9e6', skyBottom: '#eef1e6', sandFar: '#efd59a', sandNear: '#d9a764',
    path: '#e3c38c', pathEdge: '#b08355', divider: '#f8e8c4', vig: 'rgba(90,60,20,0.16)',
    cloud: { fill: '#ffffff', shade: '#e3eef5', op: 0.7 }, sun: '#fffdf0', sunGlow: '#fff8d8',
    d1: '#f3e2bb', d2: '#efd29e', d3: '#ebc583', d4: '#e9c486', mesa: '#e6c7a2'
  },
  bazaar: {
    skyTop: '#8c86c6', skyBottom: '#ffc99a', sandFar: '#ecbf92', sandNear: '#cc9469',
    path: '#e2bf95', pathEdge: '#a67658', divider: '#f6e2c4', vig: 'rgba(80,40,40,0.18)',
    sun: '#ffd28e', sunGlow: '#ffb987', streak: ['#f6b9b0', '#eca4ae', '#f8c6b0', '#dc9fb4'],
    kite: ['#7fb3ad', '#e9b866', '#b58bb5'], city: '#d8a49e', city2: '#c9939a', dome: '#d29a91',
    tent: ['#d0938a', '#9bb5ac', '#dcb282', '#b59fbc'], tentLite: '#f5e0cc', light: '#ffe6a3', wire: '#8d6a6e', ground: '#e5b88f'
  },
  night: {
    skyTop: '#18204a', skyBottom: '#47578c', sandFar: '#56628f', sandNear: '#3a4470',
    path: '#979fbd', pathEdge: '#5f6892', divider: '#cfd5e8', vig: 'rgba(6,8,30,0.34)',
    moon: '#f5f0d6', moonShade: '#e2dcbd', moonGlow: '#cfd4f2', starCol: '#f3efd6',
    dune1: '#2f3a6b', dune2: '#3a4679', palmN: { trunk: '#222b55', trunkShade: '#1d2449', leaf: '#253262', leafShade: '#1f2a55', nut: '#222b55' },
    water: '#34417a', house: '#2a3262', houseShade: '#232a55', win: '#ffd58a', winGlow: '#ffcf7a'
  }
};
const CH = Object.keys(Z);

// ---------- SKY ----------
function sky(ch) {
  const c = Z[ch]; let s = '', defs = '';
  if (ch === 'grove') {
    defs += glow('sg', c.sunGlow, 0.75);
    s += circ(735, 118, 120, 'url(#sg)') + circ(735, 118, 44, c.sun) + circ(735, 118, 36, '#fff8dc') + ell(722, 104, 12, 7, '#ffffff', op(0.6));
    s += cloud(170, 120, 190, 54, c.cloud, 11) + cloud(470, 70, 140, 40, c.cloud, 12) + cloud(905, 165, 200, 56, c.cloud, 13) + cloud(600, 225, 120, 34, c.cloud, 14) + cloud(330, 260, 160, 42, c.cloud, 15);
    for (const [x, y, sc] of [[420, 150, 1.1], [446, 140, 0.9], [462, 160, 0.8], [80, 60, 0.9], [60, 78, 0.7]]) s += bird(x, y, sc, c.bird);
  } else if (ch === 'dunes') {
    defs += glow('sg', c.sunGlow, 0.85);
    const sx = 300, sy = 72;
    let rays = '';
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, a1 = a - 0.07, a2 = a + 0.07, r0 = 58, r1 = i % 2 ? 98 : 122;
      rays += poly([[sx + Math.cos(a1) * r0, sy + Math.sin(a1) * r0], [sx + Math.cos(a) * r1, sy + Math.sin(a) * r1], [sx + Math.cos(a2) * r0, sy + Math.sin(a2) * r0]]);
    }
    s += circ(sx, sy, 170, 'url(#sg)') + pth(rays, '#fffbe6', op(0.5)) + circ(sx, sy, 46, '#fff6d6') + circ(sx, sy, 38, c.sun) + ell(sx - 12, sy - 13, 13, 7, '#ffffff', op(0.8));
    // thin wispy clouds: long soft capsules with a pale underside
    const wisp = (x, y, w, h, a) => wrap(x - w / 2 - 10, x + w / 2 + 10, `<g opacity="${a}">${rrect(x - w / 2, y - h / 2 + 2, w, h, h / 2, '#e2edf4')}${rrect(x - w / 2 + 6, y - h / 2, w - 12, h * 0.8, h * 0.4, '#ffffff')}${rrect(x - w * 0.15, y - h * 1.1, w * 0.45, h * 0.8, h * 0.4, '#ffffff')}</g>`);
    s += wisp(640, 60, 260, 12, 0.75) + wisp(560, 96, 160, 9, 0.6) + wisp(900, 140, 240, 11, 0.7) + wisp(110, 190, 200, 10, 0.6) + wisp(470, 232, 280, 10, 0.55) + wisp(760, 290, 180, 8, 0.45);
  } else if (ch === 'bazaar') {
    defs += glow('sg', c.sunGlow, 0.8) + linV('sunF', [['0', '#ffe2a6'], ['1', '#ffb978']], 80, 260);
    s += circ(640, 190, 210, 'url(#sg)') + circ(640, 190, 80, 'url(#sunF)') + ell(618, 150, 26, 12, '#fff3d0', op(0.55));
    // pink streaky clouds: long horizontal capsules, two tones
    const r = rng(31);
    for (let i = 0; i < 11; i++) {
      const x = r() * W, y = 40 + r() * 240, w = 120 + r() * 220, h = 9 + r() * 10, col = c.streak[i % 4];
      s += wrap(x - w / 2, x + w / 2, `<g opacity="${(0.55 + r() * 0.3).toFixed(2)}">${rrect(x - w / 2, y, w, h, h / 2, col)}${rrect(x - w / 2 + w * 0.12, y - h * 0.45, w * 0.5, h * 0.7, h * 0.35, lt(col, 0.3))}</g>`);
    }
    // kites with ribbon tails
    for (const [x, y, sz, ci, rot] of [[170, 80, 1, 0, -12], [260, 135, 0.75, 1, 10], [850, 70, 0.85, 2, -6]]) {
      const col = c.kite[ci], sh = dk(col, 0.18);
      const k = `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sz})">` +
        stk('M0 22Q-8 36 2 48Q10 58 0 72', '#9a7f8f', 1.4, op(0.8)) +
        [[2, 44], [-2, 58]].map(([bx, by]) => pth(`M${bx - 5} ${by - 3}L${bx} ${by}L${bx - 5} ${by + 3}Z M${bx + 5} ${by - 3}L${bx} ${by}L${bx + 5} ${by + 3}Z`, c.kite[(ci + 1) % 3], op(0.85))).join('') +
        pth('M0 -22L15 0L0 22L-15 0Z', col, SO(sh, 2)) + pth('M0 -22L0 22L-15 0Z', sh, op(0.45)) + stk('M-15 0L15 0M0 -22L0 22', lt(col, 0.4), 1, op(0.8)) + '</g>';
      s += k;
    }
  } else {
    defs += glow('mg', c.moonGlow, 0.45) + rad('mw', [['0', '#c9d0f5', 0.16], ['0.6', '#aab4ea', 0.07], ['1', '#aab4ea', 0]]);
    // milky way: a soft periodic band of faint layers + dense tiny dots
    const terms = [[1, 55, 0.6], [2, 14, 2.1]];
    for (const [dy, th, a] of [[0, 76, 0.08], [6, 46, 0.1], [10, 22, 0.1]]) {
      let d = ''; for (let x = 0; x <= W; x += 8) d += (x ? 'L' : 'M') + f(x) + ' ' + f(waveY(160 + dy, terms, x) - th / 2);
      for (let x = W; x >= 0; x -= 8) d += 'L' + f(x) + ' ' + f(waveY(160 + dy, terms, x) + th / 2);
      s += pth(d + 'Z', '#c6cdf3', op(a));
    }
    const r = rng(41);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = waveY(162, terms, x) + (r() + r() + r() - 1.5) * 36, rr = 0.5 + r() * 0.9;
      s += wrap(x - 2, x + 2, circ(x, y, rr, '#e8ebff', op((0.25 + r() * 0.45).toFixed(2))));
    }
    const mx = 250, my = 105;
    s += circ(mx, my, 150, 'url(#mg)') + circ(mx, my, 50, c.moon) + pth(`M${mx + 18} ${my - 46}A50 50 0 0 1 ${mx + 18} ${my + 46}A54 54 0 0 0 ${mx + 18} ${my - 46}Z`, c.moonShade, op(0.8));
    for (const [dx, dy, rr] of [[-16, -10, 9], [12, 14, 7], [-8, 22, 5], [18, -20, 4.5], [-26, 12, 4]]) s += circ(mx + dx, my + dy, rr, c.moonShade, op(0.75)) + circ(mx + dx - 1, my + dy - 1, rr * 0.7, lt(c.moonShade, 0.15), op(0.6));
    s += ell(mx - 20, my - 26, 12, 6, '#ffffff', op(0.5));
    // stars: small dots, some 4-point twinkles, a few 5-point
    const r2 = rng(42);
    for (let i = 0; i < 110; i++) {
      const x = r2() * W, y = 8 + Math.pow(r2(), 1.25) * 360, k = r2();
      if (Math.hypot(x - mx, y - my) < 72) continue;
      if (k < 0.75) s += wrap(x - 2, x + 2, circ(x, y, 0.8 + r2() * 1.3, c.starCol, op((0.5 + r2() * 0.5).toFixed(2))));
      else if (k < 0.94) { const R = 4 + r2() * 4; s += wrap(x - R, x + R, pth(twinkle(x, y, R, 0.18), c.starCol, op(0.9))); }
      else { const R = 5 + r2() * 2; s += wrap(x - R, x + R, pth(star5(x, y, R, R * 0.45), '#fff4c8', op(0.9))); }
    }
  }
  return svg(W, 540, s, defs);
}

// ---------- FAR (960x300 horizon band) ----------
function far(ch) {
  const c = Z[ch], H = 300; let s = '', defs = '';
  const base = (yTop, col) => { defs += linV('gb', [['0', col], ['1', c.sandFar]], yTop, 282); return wave(yTop, [[3, 2, 0.4], [7, 1.2, 1.3]], H); };
  if (ch === 'grove') {
    s += pth(wave(214, [[2, 10, 0.3], [5, 5, 1.7]], H), c.hill, op(0.75));
    s += pth(wave(228, [[3, 8, 2.2], [7, 3, 0.4]], H), c.hill2, op(0.8));
    // palm skyline: palms of different heights
    const r = rng(51);
    const palms = [];
    for (let i = 0; i < 11; i++) { const x = i * 87 + r() * 40; if (x > 540 && x < 660) continue; palms.push([x, 0.38 + r() * 0.42, (r() - 0.5) * 30]); }
    if (true) palms.push([700, 0.55, -8], [526, 0.62, 10]);
    palms.sort((a, b) => a[1] - b[1]);
    let pg = '';
    for (const [x, sc, lean] of palms) {
      const by = 250, cy = by - 92 * sc;
      pg += wrap(x - 60 * sc, x + 60 * sc + 30, palm(x, by, x + lean * sc, cy, sc, c.palmFar, { len: 44, wid: 8.5, ribs: false, nRings: 6, notch: 4 }));
    }
    s += `<g opacity="0.88">${pg}</g>`;
    // mud-brick house with a little dome
    const hx = 600, hy = 258;
    s += wrap(hx - 50, hx + 50, rrect(hx - 44, hy - 46, 88, 46, 6, c.wall) + rect(hx + 14, hy - 46, 30, 46, c.wallShade) + rrect(hx - 22, hy - 62, 44, 18, 4, c.wall) +
      pth(`M${hx - 12} ${hy - 62}A12 12 0 0 1 ${hx + 12} ${hy - 62}Z`, c.wallShade) + rrect(hx - 7, hy - 22, 14, 22, 7, c.door) + rrect(hx - 34, hy - 36, 10, 11, 5, c.door, op(0.8)) + rrect(hx + 22, hy - 36, 10, 11, 5, dk(c.door, 0.15), op(0.8)));
    // ground + pond
    s += pth(base(250, c.ground), 'url(#gb)');
    const pond = (x, w) => wrap(x - w / 2, x + w / 2, ell(x, 266, w / 2, 9, c.waterDeep) + ell(x, 264.5, w / 2 - 6, 6.5, c.water) +
      stk(`M${x - w * 0.3} 263H${x - w * 0.12}M${x + w * 0.05} 266H${x + w * 0.28}M${x - w * 0.05} 261.5H${x + w * 0.06}`, c.glint, 1.6, op(0.9)));
    s += pond(250, 200) + pond(860, 120);
  } else if (ch === 'dunes') {
    // distant mesa silhouettes, then 4 layered dunes, each with a sunlit crest and shade side
    s += wrap(120, 360, pth('M130 230L150 196Q160 190 175 192L240 194Q252 194 258 202L272 230Z', c.mesa, op(0.7)) + pth('M290 232L300 210Q306 206 316 207L340 209L352 232Z', c.mesa, op(0.6)));
    s += wrap(700, 840, pth('M705 234L722 205Q730 199 742 200L800 202Q812 203 818 212L834 234Z', c.mesa, op(0.65)));
    const layers = [[206, [[2, 16, 0.2], [3, 8, 1.4]], c.d1], [222, [[3, 14, 2.0], [5, 6, 0.3]], c.d2], [240, [[2, 12, 4.1], [4, 9, 1.0]], c.d3], [258, [[3, 8, 0.9], [6, 4, 2.6]], c.d4]];
    layers.forEach(([y0, t, col], i) => {
      if (i === 3) { defs += linV('gb', [['0', col], ['0.75', c.sandFar]], y0 - 10, 282); s += pth(wave(y0, t, H), 'url(#gb)'); }
      else s += pth(wave(y0, t, H), col);
      s += pth(wave(y0 + 7, t.map(([k, a, p]) => [k, a * 0.9, p + 0.35]), H), dk(col, 0.06, '#b07040'), op(0.45));
      s += stk(waveLine(y0, t, 1.2), lt(col, 0.45), 2, op(0.8));
    });
    s += rect(0, 276, W, 24, c.sandFar);
  } else if (ch === 'bazaar') {
    // hazy city wall and roofs
    s += pth(wave(214, [[5, 5, 0.3], [11, 2, 1]], H), c.city2, op(0.55));
    let roofs = '';
    const r = rng(61);
    for (let x = -20; x < W + 20; x += 46 + r() * 30) { const w = 34 + r() * 30, h = 18 + r() * 26; roofs += wrap(x, x + w, rrect(x, 222 - h, w, h + 40, 3, c.city) + (r() < 0.35 ? pth(`M${x + w * 0.2} ${222 - h}A${w * 0.3} ${w * 0.3} 0 0 1 ${x + w * 0.8} ${222 - h}Z`, c.city) : '')); }
    s += `<g opacity="0.75">${roofs}</g>`;
    // domed tower + minaret
    const tx = 330;
    s += `<g opacity="0.85">` + rrect(tx - 34, 150, 68, 110, 4, c.dome) + pth(`M${tx - 38} 152Q${tx - 38} 100 ${tx} 86Q${tx + 38} 100 ${tx + 38} 152Z`, c.dome) + pth(`M${tx} 86Q${tx + 38} 100 ${tx + 38} 152L${tx + 8} 152Q${tx + 12} 104 ${tx} 86Z`, dk(c.dome, 0.1), op(0.6)) +
      stk(`M${tx} 86V72`, c.dome, 3) + circ(tx, 70, 4, c.dome) + rrect(tx - 12, 176, 10, 22, 5, c.city2) + rrect(tx + 4, 176, 10, 22, 5, c.city2) +
      rrect(tx + 62, 112, 22, 150, 3, c.dome) + pth(`M${tx + 58} 114L${tx + 73} 88L${tx + 88} 114Z`, dk(c.dome, 0.08)) + rect(tx + 58, 136, 30, 6, dk(c.dome, 0.08)) + `</g>`;
    // tent tops: peaked striped
    const tents = [[60, 120, 0], [200, 96, 1], [470, 130, 2], [610, 104, 3], [760, 124, 0], [900, 100, 2]];
    for (const [x, w, ci] of tents) {
      const col = c.tent[ci], top = 196 - w * 0.22, b = 250;
      let t = pth(`M${x - w / 2} ${b}L${x - w / 2} 232Q${x - w * 0.3} 222 ${x} ${top}Q${x + w * 0.3} 222 ${x + w / 2} 232L${x + w / 2} ${b}Z`, col);
      for (let i = 1; i < 6; i += 2) { const u0 = -0.5 + i / 6, u1 = u0 + 1 / 6; t += pth(`M${x + u0 * w} ${b}L${x + u0 * w} ${232 - 12 * (1 - Math.abs(u0) * 2)}L${x} ${top}L${x + u1 * w} ${232 - 12 * (1 - Math.abs(u1) * 2)}L${x + u1 * w} ${b}Z`, c.tentLite, op(0.75)); }
      t += pth(`M${x} ${top}Q${x + w * 0.3} 222 ${x + w / 2} 232L${x + w / 2} ${b}L${x + w * 0.1} ${b}Z`, dk(col, 0.12), op(0.35));
      t += stk(`M${x} ${top}V${top - 10}`, dk(col, 0.25), 2) + circ(x, top - 11, 2.6, '#f1cf86');
      s += wrap(x - w / 2, x + w / 2, `<g opacity="0.9">${t}</g>`);
    }
    // string lights between poles
    const poles = [0, 160, 330, 540, 720, 870, 960];
    for (let i = 0; i < poles.length - 1; i++) {
      const x0 = poles[i], x1 = poles[i + 1], y0 = 182, sag = 24;
      s += stk(`M${x0} ${y0}Q${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}`, c.wire, 1.2, op(0.7));
      const n = Math.round((x1 - x0) / 18);
      for (let j = 1; j < n; j++) { const t = j / n, x = x0 + (x1 - x0) * t, y = y0 + sag * 2 * 2 * t * (1 - t); s += circ(x, y + 2, 4.5, c.light, op(0.25)) + circ(x, y + 2, 2.2, c.light); }
    }
    for (const x of poles.slice(0, -1)) s += wrap(x - 3, x + 3, rect(x - 1.5, 180, 3, 74, c.wire, op(0.8)));
    s += pth(base(250, c.ground), 'url(#gb)');
  } else {
    defs += linV('gb', [['0', c.dune2], ['1', c.sandFar]], 240, 282) + linV('rf', [['0', '#f5f0d6', 0.55], ['1', '#f5f0d6', 0]], 252, 280);
    s += pth(wave(204, [[2, 14, 0.7], [3, 7, 2.0]], H), c.dune1);
    s += stk(waveLine(204, [[2, 14, 0.7], [3, 7, 2.0]], 1), '#46528a', 1.6, op(0.7));
    // houses with warm windows
    for (const [hx, w, h] of [[150, 46, 34], [196, 30, 24], [640, 52, 38], [686, 30, 26]]) {
      const b = 232;
      let g = rrect(hx - w / 2, b - h, w, h + 10, 4, c.house) + rect(hx + w * 0.2, b - h, w * 0.3, h + 10, c.houseShade);
      g += circ(hx - w * 0.15, b - h * 0.55, 9, c.winGlow, op(0.22)) + rrect(hx - w * 0.15 - 4, b - h * 0.55 - 5, 8, 10, 4, c.win);
      if (w > 40) g += circ(hx + w * 0.22, b - h * 0.5, 8, c.winGlow, op(0.2)) + rrect(hx + w * 0.22 - 3.5, b - h * 0.5 - 4.5, 7, 9, 3.5, c.win, op(0.9));
      s += wrap(hx - w / 2, hx + w / 2, g);
    }
    s += pth(wave(226, [[3, 9, 2.6], [5, 4, 0.8]], H), c.dune2);
    // palm silhouettes
    const r = rng(71);
    for (const [x, sc] of [[60, 0.9], [100, 0.65], [420, 1.0], [462, 0.7], [800, 0.85], [905, 0.6], [560, 0.55]]) {
      const lean = (r() - 0.5) * 34, by = 254;
      s += wrap(x - 60 * sc, x + 60 * sc + 30, palm(x, by, x + lean * sc, by - 100 * sc, sc, c.palmN, { len: 44, wid: 8.5, ribs: false, rings: false, notch: 4 }));
    }
    // pond with the moon's reflection + a soft rim
    s += pth(base(250, c.dune2), 'url(#gb)');
    const pond = (x, w) => wrap(x - w / 2, x + w / 2, ell(x, 266, w / 2, 10, '#2a356c') + ell(x, 264.5, w / 2 - 6, 7, c.water) +
      stk(`M${x - w * 0.32} 263H${x - w * 0.18}M${x + w * 0.2} 266H${x + w * 0.34}`, '#7d89c4', 1.4, op(0.8)));
    s += pond(255, 260) + pond(760, 130);
    s += `<g opacity="0.9">${rrect(238, 259, 34, 2.4, 1.2, '#f5f0d6')}${rrect(244, 263.5, 22, 2.2, 1.1, '#f5f0d6', op(0.8))}${rrect(248, 267.5, 14, 2, 1, '#f5f0d6', op(0.6))}</g>`;
  }
  s += rect(0, 280, W, 20, c.sandFar);
  return svg(W, H, s, defs);
}

// ---------- PROPS (160x220, base y 214, centre x 80) ----------
const PB = 214;
const shadow = (w, col = '#3a2a14', a = 0.18) => ell(80, PB - 1, w, w * 0.16, col, op(a));
const PROPC = {
  grove: { trunk: '#b4895c', trunkShade: '#94704a', leaf: '#6fae6a', leafShade: '#548f57', nut: '#8a6a3e', out: '#4f6b3e' },
  night: { trunk: '#3b416e', trunkShade: '#2f3560', leaf: '#2f5363', leafShade: '#274456', nut: '#3a3a5e', out: '#1c2244' }
};
function props(ch) {
  const P = [];
  const OW = 2.6;
  if (ch === 'grove') {
    const c = PROPC.grove, o = c.out;
    // 0 tall palm with coconuts
    P.push(shadow(34) + palm(76, PB, 84, 60, 1.3, c, { ow: OW, coconuts: true, bend: -10, len: 50, wid: 10, fronds: [[-165, 0.55], [-130, 0.35], [-100, 0.15], [-60, 0.2], [-25, 0.45], [0, 0.65], [-195, 0.75], [25, 0.85]] }) + ell(76, PB - 2, 18, 4, '#8fae5e', op(0.6)));
    // 1 short double palm
    P.push(shadow(44) + palm(62, PB, 48, 112, 0.9, c, { ow: OW, coconuts: true, bend: 6, len: 48, fronds: [[-170, 0.6], [-130, 0.35], [-95, 0.2], [-55, 0.3], [-15, 0.55], [-205, 0.8]] }) +
      palm(98, PB, 108, 86, 1.0, c, { ow: OW, coconuts: true, bend: -4, len: 48, fronds: [[-160, 0.55], [-120, 0.3], [-90, 0.15], [-55, 0.25], [-20, 0.5], [5, 0.75], [-200, 0.8]] }));
    // 2 reed clump with flowers
    let g = shadow(46, '#3a3a14', 0.16);
    const reeds = [[40, -100, 0.08], [52, -96, 0.0], [62, -106, -0.04], [74, -94, 0.05], [86, -104, 0.02], [98, -88, -0.08], [110, -98, -0.1], [120, -80, -0.14]];
    reeds.forEach(([x, a, lean], i) => {
      const top = PB - 120 - (i * 37 % 40), col = i % 2 ? '#7aa865' : '#8fbb72', tx = x + lean * 240;
      g += pth(`M${x - 4} ${PB}Q${x + lean * 120} ${(PB + top) / 2} ${tx} ${top}Q${x + lean * 120 + 5} ${(PB + top) / 2} ${x + 4} ${PB}Z`, col, SO('#4f7a44', 2));
      if (i % 3 === 0) g += rrect(tx - 3.5, top + 6, 7, 22, 3.5, '#9c7048', SO('#6b4a2b', 1.6)) + stk(`M${tx} ${top + 6}V${top - 4}`, '#6f8f50', 2);
    });
    for (const [x, y, col] of [[44, 176, '#fff6e6'], [70, 186, '#f6dc7a'], [100, 172, '#fff6e6'], [124, 190, '#f6dc7a'], [58, 198, '#f3e2a8']]) {
      g += stk(`M${x} ${y}V${PB}`, '#6f9a5a', 2);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g += ell(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.4, 3.2, col, ` transform="rotate(${f(a * 57.3)} ${f(x + Math.cos(a) * 5)} ${f(y + Math.sin(a) * 5)})"` + SO(dk(col, 0.3), 1.2)); }
      g += circ(x, y, 3, '#e6a54a');
    }
    g += pth(`M18 ${PB}Q30 ${PB - 18} 50 ${PB - 10}Q80 ${PB - 22} 110 ${PB - 10}Q130 ${PB - 18} 142 ${PB}Z`, '#88b06a', SO('#4f7a44', 2));
    P.push(g);
    // 3 small stone well with a wooden roof and bucket
    g = shadow(52);
    const stone = '#cdbf9f', stoneS = '#b0a17f', so = '#7d6e52', wood = '#a87a4f', woodS = '#86603c', wo = '#5e4128';
    g += rect(36, 74, 9, 84, wood, SO(wo, OW)) + rect(115, 74, 9, 84, wood, SO(wo, OW));
    g += pth('M24 82L80 44L136 82Z', '#c96f4a', SO('#7e3f26', OW)) + pth('M80 44L136 82L104 82Z', '#ad5a3a', op(0.8)) + stk('M36 74L80 49L124 74', '#e08c62', 2.5, op(0.6));
    g += stk('M45 104H115', woodS, 5) + stk('M80 104V128', '#8a7a62', 1.6) + rrect(72, 128, 16, 15, 3, '#9c8a6c', SO('#5e4f3a', 2));
    g += pth(`M26 150Q26 140 80 140Q134 140 134 150V${PB - 4}Q134 ${PB + 2} 80 ${PB + 2}Q26 ${PB + 2} 26 ${PB - 4}Z`, stone, SO(so, OW));
    g += pth(`M100 141Q134 142 134 150V${PB - 4}Q134 ${PB + 1} 104 ${PB + 1.5}Z`, stoneS, op(0.8));
    g += ell(80, 148, 52, 8, '#6b6048', SO(so, 2)) + ell(80, 148, 44, 5.5, '#4f6a6e');
    for (const [x, y, w] of [[34, 164, 26], [64, 166, 30], [98, 164, 28], [46, 184, 30], [80, 186, 30], [110, 184, 18], [34, 202, 22], [62, 204, 30], [96, 204, 30]]) g += rrect(x, y, w, 13, 5, 'none', SO(stoneS, 1.6));
    g += ell(110, 210, 6, 4, '#88b06a') + ell(44, 211, 8, 4, '#88b06a');
    P.push(g);
  } else if (ch === 'dunes') {
    const rock = '#d99d68', rockS = '#bb7d50', rockL = '#ebb886', ro = '#8a5636';
    // 0 rock arch
    let g = shadow(64);
    g += pth(`M14 ${PB}Q8 150 28 104Q46 58 92 56Q136 58 146 110Q154 160 146 ${PB}L114 ${PB}Q118 160 110 126Q100 98 82 100Q60 102 54 132Q48 170 52 ${PB}Z`, rock, SO(ro, OW));
    g += pth(`M114 ${PB}Q118 160 110 126Q100 98 82 100L86 74Q130 76 140 116Q148 162 146 ${PB}Z`, rockS, op(0.85));
    g += pth(`M28 104Q46 62 90 60Q60 74 44 110Z`, rockL, op(0.9));
    for (const d of ['M24 150Q36 146 46 152', 'M120 138Q132 134 140 140', 'M22 182Q34 178 48 184', 'M118 176Q130 172 142 178', 'M70 70Q84 66 98 72']) g += stk(d, ro, 1.8, op(0.45));
    g += pth(`M4 ${PB}Q20 ${PB - 14} 40 ${PB - 8}Q60 ${PB - 14} 70 ${PB}Z M98 ${PB}Q120 ${PB - 16} 156 ${PB}Z`, '#e8c486', SO('#b88a52', 1.6));
    P.push(g);
    // 1 sand rock pile
    g = shadow(60);
    const boulder = (x, y, rx, ry, k) => pth(`M${x - rx} ${y}Q${x - rx} ${y - ry * 1.1} ${x - rx * 0.1} ${y - ry}Q${x + rx} ${y - ry * 0.95} ${x + rx} ${y - ry * 0.1}Q${x + rx * 1.05} ${y + ry * 0.6} ${x} ${y + ry * 0.62}Q${x - rx} ${y + ry * 0.6} ${x - rx} ${y}Z`, k, SO(ro, OW)) +
      pth(`M${x + rx * 0.15} ${y - ry * 0.98}Q${x + rx} ${y - ry * 0.95} ${x + rx} ${y - ry * 0.1}Q${x + rx * 1.05} ${y + ry * 0.6} ${x} ${y + ry * 0.62}Q${x + rx * 0.5} ${y} ${x + rx * 0.15} ${y - ry * 0.98}Z`, rockS, op(0.7)) +
      ell(x - rx * 0.4, y - ry * 0.6, rx * 0.3, ry * 0.15, rockL, op(0.9));
    g += boulder(50, 186, 38, 30, rock) + boulder(112, 190, 34, 24, '#d6a274') + boulder(80, 140, 32, 28, '#dfa874') + boulder(30, 204, 18, 10, rock);
    g += pth(`M0 ${PB}Q40 ${PB - 18} 80 ${PB - 10}Q120 ${PB - 18} 160 ${PB}Z`, '#e8c486', SO('#b88a52', 1.6));
    P.push(g);
    // 2 dry desert bush on a little sand mound (grey-green leaves so it never reads as a tumbleweed)
    g = shadow(50);
    const tw = '#8f6f4a', two = '#5e452c';
    const br = [[80, PB - 10, 80, 120], [80, 170, 44, 118], [80, 170, 118, 116], [80, 150, 56, 96], [80, 150, 106, 92], [66, 130, 36, 140], [94, 128, 128, 140], [80, 190, 30, 160], [80, 190, 130, 162]];
    for (const [x0, y0, x1, y1] of br) g += stk(`M${x0} ${y0}Q${(x0 + x1) / 2 + 6} ${(y0 + y1) / 2} ${x1} ${y1}`, two, 6) + stk(`M${x0} ${y0}Q${(x0 + x1) / 2 + 6} ${(y0 + y1) / 2} ${x1} ${y1}`, tw, 3.2);
    const lv = rng(81);
    for (let i = 0; i < 26; i++) { const [, , x1, y1] = br[1 + (i % 8)], x = x1 + (lv() - 0.5) * 22, y = y1 + (lv() - 0.5) * 18; g += ell(x, y, 5.5, 3, i % 2 ? '#a9b48a' : '#94a378', ` transform="rotate(${Math.round(lv() * 180)} ${f(x)} ${f(y)})"` + SO('#66734f', 1.2)); }
    for (const [x, y] of [[118, 112], [44, 116], [80, 112]]) g += circ(x, y, 3.4, '#f0d58a', SO('#b58f45', 1.2));
    g += pth(`M24 ${PB}Q52 ${PB - 24} 80 ${PB - 22}Q110 ${PB - 24} 136 ${PB}Z`, '#e8c486', SO('#b88a52', 2));
    P.push(g);
    // 3 clay milestone with a carved spiral + dot path
    g = shadow(40);
    const clay = '#d8a676', clayS = '#b7855a', co = '#80553a';
    g += pth(`M46 ${PB - 2}L50 96Q52 58 80 56Q108 58 110 96L114 ${PB - 2}Z`, clay, SO(co, OW)) + pth(`M90 58Q108 62 110 96L114 ${PB - 2}L96 ${PB - 2}Q100 120 90 58Z`, clayS, op(0.8));
    g += stk('M80 102m-2 0a2 2 0 1 1 4 0a6 6 0 1 1 -10 -2a10 10 0 1 1 18 6', '#8a5a3a', 3.4) + stk('M62 150H98', '#8a5a3a', 3, op(0.7));
    for (const x of [64, 74, 84, 94]) g += circ(x, 166, 2.6, '#8a5a3a', op(0.7));
    g += stk('M60 70Q70 62 80 62', '#f0c89c', 3, op(0.9));
    g += rrect(36, PB - 12, 88, 12, 5, '#c79a6c', SO(co, 2)) + pth(`M10 ${PB}Q30 ${PB - 10} 46 ${PB - 6}L114 ${PB - 6}Q134 ${PB - 10} 150 ${PB}Z`, '#e8c486', SO('#b88a52', 1.6));
    P.push(g);
  } else if (ch === 'bazaar') {
    // 0 striped tent (open front, shaded inside)
    let g = shadow(66);
    const tA = '#c9796c', tB = '#f3dcc0', to = '#7d4a43';
    g += pth(`M12 ${PB}L22 112Q50 96 80 46Q110 96 138 112L148 ${PB}Z`, tB, SO(to, OW));
    for (let i = 0; i < 6; i++) { if (i % 2) continue; const u0 = i / 6, u1 = (i + 1) / 6, xb0 = 12 + 136 * u0, xb1 = 12 + 136 * u1; g += pth(`M80 46L${xb0 + (22 - 12) * (1 - u0 * 2) * 0} ${PB}L${xb1} ${PB}Z`, tA, op(0.9)); }
    g += pth(`M12 ${PB}L22 112Q50 96 80 46Q110 96 138 112L148 ${PB}Z`, 'none', SO(to, OW));
    g += pth(`M52 ${PB}L66 132Q80 116 94 132L108 ${PB}Z`, '#6e3b3a', SO(to, 2)) + pth(`M60 ${PB}L70 140Q80 128 90 140L100 ${PB}Z`, '#8d4a44');
    g += pth(`M22 112Q36 124 52 116Q66 128 80 118Q94 128 108 116Q124 124 138 112`, 'none', SO('#e0b45e', 4)) + [36, 66, 94, 124].map(x => circ(x, 124, 3.2, '#e0b45e', SO('#9a7334', 1))).join('');
    g += pth(`M80 46L138 112L148 ${PB}L110 ${PB}Z`, '#5a2f2c', op(0.18));
    g += stk('M80 46V26', '#8d6a4f', 3) + pth('M80 26L102 32L80 38Z', '#7ea9a2', SO('#4e6f6a', 1.5));
    P.push(g);
    // 1 lantern post with a hanging glowing lantern
    const defs1 = glow('lg', '#ffd27a', 0.55);
    g = `<defs>${defs1}</defs>` + shadow(26);
    const iron = '#6b4f53', io = '#3e2c31';
    g += rrect(54, 40, 9, PB - 40, 3, iron, SO(io, 2)) + rrect(46, PB - 14, 25, 14, 4, iron, SO(io, 2)) + stk('M58 52H112Q120 52 120 62', io, 7) + stk('M58 52H112Q120 52 120 62', iron, 3.5) + stk('M62 70Q78 70 80 54', iron, 3);
    g += circ(120, 104, 46, 'url(#lg)');
    g += stk('M120 62V72', io, 2) + pth('M108 78L120 70L132 78Z', '#b98a3e', SO('#6e4f22', 2));
    g += pth('M106 80Q100 104 110 126L130 126Q140 104 134 80Z', '#ffcf73', SO('#a8742e', 2.4)) + pth('M120 80V126M110 84Q106 104 114 124M130 84Q134 104 126 124', 'none', SO('#c98d38', 1.6));
    g += ell(116, 98, 6, 10, '#fff2c4', op(0.8)) + pth('M110 126L130 126L124 134L116 134Z', '#b98a3e', SO('#6e4f22', 2)) + stk('M120 134V144', '#e0a23a', 2) + circ(120, 146, 2.6, '#e0a23a');
    P.push(g);
    // 2 stack of folded rugs
    g = shadow(62);
    const rugs = [['#b86b6b', '#e9c27a', 64, 120], ['#5f9c96', '#f1dcae', 58, 116], ['#9a7cae', '#e9c27a', 62, 124], ['#d79a5a', '#7c4f62', 56, 118], ['#b86b6b', '#f1dcae', 50, 110]];
    let y = PB;
    rugs.forEach(([col, trim, hw2, ww], i) => {
      const h = i === 4 ? 18 : 22, x = 80 + (i % 2 ? 5 : -4) - ww / 2;
      y -= h;
      g += rrect(x, y, ww, h, 7, col, SO(dk(col, 0.35), 2.4)) + rect(x + 6, y + h * 0.3, ww - 12, 3, trim) + rect(x + 6, y + h * 0.62, ww - 12, 2, trim, op(0.7));
      for (let k = 0; k < 5; k++) g += pth(`M${f(x + 14 + k * (ww - 28) / 4)} ${f(y + h * 0.45)}l3 -3l3 3l-3 3Z`, trim);
      g += rrect(x + ww - 14, y + 2, 12, h - 4, 6, dk(col, 0.15), op(0.8));
      if (i === 1) for (let k = 0; k < 6; k++) g += stk(`M${x + ww - 2} ${y + 4 + k * 3}l6 1`, trim, 1.6);
    });
    g += rrect(52, y - 14, 52, 14, 7, '#5f9c96', SO(dk('#5f9c96', 0.35), 2.2)) + ell(102, y - 7, 6, 7, '#e9c27a', SO(dk('#5f9c96', 0.35), 2)) + stk(`M100 ${y - 7}a2.5 2.5 0 1 1 3 2`, '#b86b6b', 1.4) + rect(60, y - 9, 36, 2.4, '#f1dcae');
    P.push(g);
    // 3 fruit cart
    g = shadow(66);
    const wd = '#b07a4c', wdS = '#8c5e38', wdo = '#5b3a22';
    g += stk('M20 150L4 128', wdo, 7) + stk('M20 150L4 128', wd, 3.5);
    g += pth('M18 116H142L134 162H26Z', wd, SO(wdo, OW)) + pth('M100 116H142L134 162H104Z', wdS, op(0.7)) + stk('M24 132H138M26 148H136', wdo, 1.6, op(0.5));
    const fr = [[34, 106, 11, '#e9963f'], [56, 102, 12, '#efa848'], [78, 104, 11, '#e9963f'], [100, 102, 12, '#efa848'], [122, 106, 11, '#e9963f'], [46, 90, 10, '#c9cf6a'], [70, 88, 11, '#b8c45d'], [94, 89, 11, '#c9cf6a'], [114, 92, 9, '#9b6aa0'], [82, 74, 10, '#e9963f']];
    for (const [x, yy, r0, col] of fr) g += circ(x, yy, r0, col, SO(dk(col, 0.35), 2)) + ell(x - r0 * 0.35, yy - r0 * 0.4, r0 * 0.3, r0 * 0.18, '#ffffff', op(0.55)) + (col === '#9b6aa0' ? '' : stk(`M${x} ${yy - r0}l2 -4`, '#6b7a3a', 1.8));
    g += pth('M30 70L80 50L130 70', 'none', SO(wdo, 4)) + stk('M30 70V116M130 70V116', wdo, 4) + stk('M30 70V116M130 70V116', wd, 2) +
      pth('M24 72Q52 58 80 50Q108 58 136 72L136 78Q122 84 108 78Q94 86 80 78Q66 86 52 78Q38 84 24 78Z', '#f1dcbc', SO('#9a7a5c', 2)) +
      pth('M52 64Q66 56 80 50Q94 56 108 64L108 78Q94 86 80 78Q66 86 52 78Z', '#7ea9a2', op(0.85));
    for (const x of [44, 116]) g += circ(x, 182, 26, '#9c6b42', SO(wdo, OW)) + circ(x, 182, 18, 'none', SO('#7a5232', 3)) + stk(`M${x - 18} 182H${x + 18}M${x} 164V200M${x - 13} 169L${x + 13} 195M${x + 13} 169L${x - 13} 195`, '#7a5232', 2.4) + circ(x, 182, 4.5, '#5b3a22');
    P.push(g);
  } else {
    const c = PROPC.night, o = c.out;
    // 0 dark palm with moonlit rim
    P.push(shadow(34, '#05081e', 0.3) + palm(78, PB, 84, 60, 1.3, c, { ow: OW, coconuts: true, bend: -10, len: 50, wid: 10, fronds: [[-165, 0.55], [-130, 0.35], [-100, 0.15], [-60, 0.2], [-25, 0.45], [0, 0.65], [-195, 0.75], [25, 0.85]] }));
    // 1 glowing lantern post (lamp at the top)
    let g = `<defs>${glow('ng', '#ffcf7a', 0.6)}</defs>` + ell(80, PB - 1, 50, 10, '#ffcf7a', op(0.15)) + shadow(24, '#05081e', 0.3);
    g += circ(80, 66, 64, 'url(#ng)');
    g += rrect(75, 92, 10, PB - 100, 3, '#3a3460', SO('#1c1a3a', 2)) + rrect(66, PB - 14, 28, 14, 4, '#3a3460', SO('#1c1a3a', 2)) + stk('M70 128H90', '#1c1a3a', 3);
    g += pth('M62 52L80 38L98 52Z', '#c89a48', SO('#6e4f22', 2)) + pth('M64 54Q58 72 66 92L94 92Q102 72 96 54Z', '#ffd27a', SO('#b47d2c', 2.4)) + stk('M80 54V92M70 58Q66 74 72 90M90 58Q94 74 88 90', '#e0a23a', 1.6, op(0.8));
    g += ell(76, 68, 6, 10, '#fff6d6', op(0.85)) + rect(62, 90, 36, 6, '#c89a48', SO('#6e4f22', 2)) + circ(80, 34, 3.4, '#c89a48');
    P.push(g);
    // 2 small tent with a lit door
    g = `<defs>${glow('tg', '#ffc96e', 0.5)}</defs>` + shadow(60, '#05081e', 0.3) + ell(80, PB - 6, 56, 22, 'url(#tg)');
    g += pth(`M14 ${PB}Q40 140 80 84Q120 140 146 ${PB}Z`, '#3d4a7e', SO('#1c2244', OW)) + pth(`M80 84Q120 140 146 ${PB}L104 ${PB}Q100 140 80 84Z`, '#2f3a6a', op(0.85));
    for (const t of [0.3, 0.7]) g += stk(`M80 84Q${80 + (t - 0.5) * 120} 150 ${14 + 132 * t} ${PB}`, '#56649c', 2, op(0.6));
    g += pth(`M60 ${PB}Q64 160 80 134Q96 160 100 ${PB}Z`, '#ffd27a', SO('#b47d2c', 2)) + pth(`M66 ${PB}Q70 168 80 148Q90 168 94 ${PB}Z`, '#fff0c0', op(0.9));
    g += stk('M80 84V64', '#56649c', 3) + pth('M80 64L98 70L80 76Z', '#c8b06a', SO('#6e5a2a', 1.5));
    g += pth(`M50 ${PB}L58 ${PB - 30}L64 ${PB}Z`, '#3d4a7e', op(0)) + stk(`M0 ${PB}L22 ${PB - 18}M160 ${PB}L136 ${PB - 18}`, '#56649c', 1.6, op(0.6));
    P.push(g);
    // 3 reed clump with fireflies
    g = `<defs>${glow('ff', '#e9ff8f', 0.85)}</defs>` + shadow(46, '#05081e', 0.3);
    const reeds = [[40, 0.08], [52, 0.0], [62, -0.04], [74, 0.05], [86, 0.02], [98, -0.08], [110, -0.1], [120, -0.14]];
    reeds.forEach(([x, lean], i) => {
      const top = PB - 120 - (i * 37 % 40), col = i % 2 ? '#2f5363' : '#38606d', tx = x + lean * 240;
      g += pth(`M${x - 4} ${PB}Q${x + lean * 120} ${(PB + top) / 2} ${tx} ${top}Q${x + lean * 120 + 5} ${(PB + top) / 2} ${x + 4} ${PB}Z`, col, SO('#1c2c40', 2));
      if (i % 3 === 0) g += rrect(tx - 3.5, top + 6, 7, 22, 3.5, '#4a3f5c', SO('#241c34', 1.6)) + stk(`M${tx} ${top + 6}V${top - 4}`, '#3d5b6a', 2);
    });
    g += pth(`M18 ${PB}Q30 ${PB - 18} 50 ${PB - 10}Q80 ${PB - 22} 110 ${PB - 10}Q130 ${PB - 18} 142 ${PB}Z`, '#2f5363', SO('#1c2c40', 2));
    for (const [x, yy] of [[30, 70], [104, 48], [132, 110], [58, 128], [88, 90], [20, 150], [140, 160]]) g += circ(x, yy, 14, 'url(#ff)') + circ(x, yy, 3, '#f4ffc2');
    P.push(g);
  }
  return P.map(b => svg(160, 220, b));
}

// ---------- PARTICLES ----------
function particles() {
  const P = {};
  const g1 = (id, col, a) => `<defs>${rad(id, [['0', col, a], ['0.55', col, a * 0.5], ['1', col, 0]])}</defs>`;
  P.dust = svg(32, 32, g1('d', '#e9d3a6', 0.9) + circ(16, 16, 15, 'url(#d)') + circ(12, 17, 6, '#f3e2bf', op(0.7)) + circ(19, 14, 5, '#f7ead0', op(0.7)) + circ(17, 19, 4.5, '#e6cc98', op(0.6)));
  P.sand = svg(16, 8, `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0d9a6" stop-opacity="0"/><stop offset="0.7" stop-color="#ecd09a" stop-opacity="0.8"/><stop offset="1" stop-color="#fbeed0"/></linearGradient></defs>` + rrect(1, 3, 13.5, 2.2, 1.1, 'url(#s)') + circ(13.6, 4.1, 1.5, '#fbeed0'));
  P.sparkle = svg(32, 32, g1('g', '#ffffff', 0.5) + circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#ffffff', SO('#fff3cf', 0.8)) + circ(16, 16, 2.6, '#ffffff'));
  {
    const wing = (sx, col, sh) => `<g transform="translate(16 16) scale(${sx} 1)">${pth('M1 -1C4 -12 14 -12 14 -5C14 0 8 2 1 1Z', col, SO(sh, 1.2))}${pth('M1 1C7 1 12 4 10 9C8 12 3 10 1 3Z', lt(col, 0.2), SO(sh, 1.2))}${circ(8, -6, 1.8, '#ffffff', op(0.75))}</g>`;
    P.butterfly = svg(32, 32, wing(1, '#f6e39c', '#b9a25a') + wing(-1, '#f6e39c', '#b9a25a') + rrect(15, 8, 2.2, 16, 1.1, '#6b5a5a') + stk('M16 9Q14 5 12 4M16 9Q18 5 20 4', '#6b5a5a', 0.9));
  }
  P.petal = svg(32, 32, pth('M7 20C9 9 21 5 26 9C26 18 16 26 7 20Z', '#f6ccd2', SO('#d29aa6', 1.4)) + pth('M10 19C14 14 19 11 23 10', 'none', SO('#fbdde3', 1.5)));
  P.leaf = svg(32, 32, (() => { const F = frondPath(6, 25, -40, 25, 0.25, 6, 4); return pth(F.d, '#8fbf6e', SO('#567f45', 1.4)) + stk(F.spine, '#6a9a58', 1.1); })());
  P.firefly = svg(32, 32, g1('f', '#e2ff86', 0.9) + circ(16, 16, 15, 'url(#f)') + circ(16, 16, 4, '#f2ffb8') + circ(15, 15, 1.6, '#ffffff'));
  P.star = svg(32, 32, g1('t', '#fff6c8', 0.45) + circ(16, 16, 15, 'url(#t)') + pth(star5(16, 16.8, 11, 4.8), '#fff6cf', SO('#f0dc96', 1.2)) + circ(14, 14, 1.6, '#ffffff', op(0.9)));
  P.feather = svg(32, 32, `<g transform="rotate(-35 16 16)">${pth('M16 3C21 8 22 17 17 28L15 28C10 17 11 8 16 3Z', '#fffaf2', SO('#d9cbb8', 1.2))}${stk('M16 6V29', '#cdbba4', 1)}${stk('M16 12L20 9M16 16L21 13M16 20L20 18M16 12L12 9M16 16L11 13M16 20L12 18', '#e7dccd', 0.8)}</g>`);
  P.puff = svg(32, 32, `<g fill="#e4e6ee">${circ(11, 18, 7.6)}${circ(20.5, 18, 8.2)}${circ(16, 12, 7.6)}</g><g fill="#ffffff">${circ(11, 17, 6.4)}${circ(20.5, 16.8, 7)}${circ(15.6, 11.2, 6.4)}</g>` + ell(13, 9, 2.8, 1.6, '#ffffff'));
  P.ring = svg(32, 32, circ(16, 16, 12.5, 'none', SO('#ffffff', 2.2)) + circ(16, 16, 9.5, 'none', SO('#ffffff', 0.8) + op(0.45)));
  return P;
}

// ---------- write everything ----------
const pal = {};
for (const ch of CH) {
  write(`levels/${ch}/sky.svg`, sky(ch));
  write(`levels/${ch}/far.svg`, far(ch));
  props(ch).forEach((p, i) => write(`levels/${ch}/prop_${i}.svg`, p));
  const c = Z[ch];
  pal[ch] = { skyTop: c.skyTop, skyBottom: c.skyBottom, sandFar: c.sandFar, sandNear: c.sandNear, path: c.path, pathEdge: c.pathEdge, divider: c.divider, vig: c.vig };
}
write('levels/palette.json', JSON.stringify(pal, null, 2) + '\n');
const P = particles();
for (const [k, v] of Object.entries(P)) write(`particles/${k}.svg`, v);
console.log(`wrote ${CH.length * 6} level files + palette.json + ${Object.keys(P).length} particles to ${OUT}`);
