// Otto's Playroom Dash: environment art generator (4 playroom biomes + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image>, filters or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<b>/sky.svg      960x540, transparent except décor (the room beyond), nothing below y 420, horizontally tileable.
//  - levels/<b>/far.svg      960x300 horizon band, transparent above ~y 60, rows y 280..300 opaque in palette.floorFar,
//                            bottom edge sits on horizonY in game; tileable.
//  - levels/<b>/prop_0..3    160x220 roadside props, base line y 214, centre x 80, transparent.
//  - levels/palette.json     {b: {skyTop, skyBottom, floorFar, floorNear, path, pathEdge, divider, vig}}
//  - particles/*.svg         32x32 (confetti 16x16), centred, transparent edges.
// Tileability: every shape that crosses x 0 or x 960 is emitted again shifted by ±960 (wrap()); bands are periodic
// (sine sums with integer periods over 960; grids with periods dividing 960), so the left edge equals the right edge.
// Visible sky: in landscape only y 0..~0.4·VH of sky.svg shows (≈ 0..216 at 960x540, the far band covers ~66..216);
// in portrait (560x1000) up to y ≈ 360. So the main décor sits in y 0..200, secondary bits down to ~330.
// Play-area rule: backgrounds softer/less saturated than characters; the road is a light toy-road colour per biome
// (felt / linen quilt / drawing paper / periwinkle carpet), never the acorn colours (caramel, gold, raspberry).
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
const dk = (c, t = 0.3, to = '#2e2236') => mix(c, to, t);
const lt = (c, t = 0.25) => mix(c, '#ffffff', t);
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"${fill ? ` fill="${fill}"` : ''}${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}"${fill ? ` fill="${fill}"` : ''}${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const stitch = (d, col, w = 1.4, da = '4 3.5', extra = '') => stk(d, col, w, ` stroke-dasharray="${da}"` + extra);
const SO = (c, w) => ` stroke="${c}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const linV = (id, s, y1, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stops(s)}</linearGradient>`;
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.45], ['1', col, 0]]);
const poly = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('') + 'Z';
const star5 = (cx, cy, R, r, rot = -90) => { const p = []; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return poly(p); };
// a chunky rounded 5-point star (stroke in the same colour rounds the tips)
const starR = (cx, cy, R, col, extra = '', rot = -90) => pth(star5(cx, cy, R * 0.86, R * 0.44, rot), col, SO(col, R * 0.28) + extra);
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
const waveY = (y0, terms, x) => { let y = y0; for (const [k, a, p] of terms) y += a * Math.sin(2 * Math.PI * k * x / W + p); return y; };
const wave = (y0, terms, yb, step = 6) => { let d = ''; for (let x = 0; x <= W; x += step) d += (x ? 'L' : 'M') + f(x) + ' ' + f(waveY(y0, terms, x)); return d + `L${W} ${yb}L0 ${yb}Z`; };
const waveLine = (y0, terms, dy = 0) => { let d = ''; for (let x = 0; x <= W; x += 6) d += (x ? 'L' : 'M') + f(x) + ' ' + f(waveY(y0, terms, x) + dy); return d; };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
// bumpy outline through points going clockwise; each pair joined by an outward arc, the last back to the first by a line
const bumps = (pts, k = 0.62) => { let d = `M${f(pts[0][0])} ${f(pts[0][1])}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], r = Math.hypot(x1 - x0, y1 - y0) * k; d += `A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)}`; } return d + 'Z'; };
const cloudPts = (x, y, w, h, s = 1) => [[-0.4, 0.5], [-0.5, 0.08], [-0.24, -0.3], [0.06, -0.5], [0.34, -0.22], [0.5, 0.12], [0.4, 0.5]].map(([u, v]) => [x + u * w * s, y + 0.06 * h + (v - 0.06) * h * s]);
// soft plush / felt cloud with an inset running stitch
function feltCloud(x, y, w, h, c) {
  let g = pth(bumps(cloudPts(x, y + 3, w, h)), c.shade, SO(c.out, c.ow ?? 2.4));
  g += pth(bumps(cloudPts(x - 1, y - 1, w * 0.97, h * 0.94)), c.fill);
  g += stitch(bumps(cloudPts(x, y, w, h, 0.8)), c.stitch, 1.5, '5 4');
  g += ell(x - w * 0.16, y - h * 0.22, w * 0.11, h * 0.1, '#ffffff', op(0.7));
  return g;
}
// pillow: four pinched corner tips, puffy bulging edges
const pillowD = (cx, cy, w, h, b = 0.14) => { const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, bo = cy + h / 2, bx = w * b * 0.5, by = h * b;
  return `M${f(l)} ${f(t)}Q${f(cx)} ${f(t - by)} ${f(r)} ${f(t)}Q${f(r + bx)} ${f(cy)} ${f(r)} ${f(bo)}Q${f(cx)} ${f(bo + by)} ${f(l)} ${f(bo)}Q${f(l - bx)} ${f(cy)} ${f(l)} ${f(t)}Z`; };
function pillow(cx, cy, w, h, col, o = {}) {
  const out = o.out || dk(col, 0.35), ow = o.ow ?? 2.6;
  let g = pth(pillowD(cx, cy, w, h), col, SO(out, ow));
  g += pth(pillowD(cx + w * 0.05, cy + h * 0.12, w * 0.86, h * 0.66, 0.1), dk(col, 0.1, '#6a4c7a'), op(0.35));
  g += pth(pillowD(cx - w * 0.04, cy - h * 0.06, w * 0.8, h * 0.6, 0.1), col);
  g += stitch(pillowD(cx, cy, w * 0.86, h * 0.78, 0.1), lt(col, 0.55), 1.3, '4 3');
  g += ell(cx - w * 0.22, cy - h * 0.2, w * 0.13, h * 0.09, '#ffffff', op(0.55));
  if (o.tuft !== false) { g += stk(`M${f(cx - 9)} ${f(cy - 5)}L${f(cx + 9)} ${f(cy + 5)}M${f(cx + 9)} ${f(cy - 5)}L${f(cx - 9)} ${f(cy + 5)}`, dk(col, 0.18), 1.4, op(0.6)) + circ(cx, cy, 3.6, dk(col, 0.12), SO(dk(col, 0.3), 1.2)); }
  return g;
}
// a wavy paper band across a crayon wrapper
const wavyH = (x0, x1, y, a = 2, n = 3) => { let d = `M${f(x0)} ${f(y)}`; const st = (x1 - x0) / (n * 2); for (let i = 0; i < n * 2; i++) d += `Q${f(x0 + st * (i + 0.5))} ${f(y + (i % 2 ? a : -a))} ${f(x0 + st * (i + 1))} ${f(y)}`; return d; };
// crayon standing tip-up: plain coloured paper wrapper with a wavy band (generic, unbranded)
function crayon(x, b, w, h, col, o = {}) {
  const out = o.out || dk(col, 0.38), ow = o.ow ?? 2, l = x - w / 2, r = x + w / 2, top = b - h, tipH = w * 0.95, wr = lt(col, 0.42);
  let g = pth(`M${f(l)} ${f(top)}L${f(x - w * 0.2)} ${f(top - tipH)}Q${f(x)} ${f(top - tipH - w * 0.22)} ${f(x + w * 0.2)} ${f(top - tipH)}L${f(r)} ${f(top)}Z`, col, SO(out, ow));
  g += pth(`M${f(x + w * 0.08)} ${f(top)}L${f(x + w * 0.12)} ${f(top - tipH)}L${f(x + w * 0.2)} ${f(top - tipH)}L${f(r)} ${f(top)}Z`, dk(col, 0.12), op(0.6));
  g += rrect(l, top, w, h, Math.min(5, w * 0.18), col, SO(out, ow));
  const y0 = top + h * 0.16, y1 = b - h * 0.14;
  g += pth(`${wavyH(l, r, y0, 1.6)}L${f(r)} ${f(y1)}${wavyH(r, l, y1, 1.6).replace(/^M[^Q]+/, '')}Z`, wr);
  g += stk(wavyH(l + 1, r - 1, (y0 + y1) / 2, 2.2, 2), col, Math.max(1.5, w * 0.12), op(0.8));
  g += rect(x + w * 0.18, top + 1, w * 0.3, h - 2, dk(col, 0.1), op(0.35));
  g += rect(l + w * 0.14, top + 3, w * 0.12, h - 8, '#ffffff', op(0.35));
  return g;
}
// paper leaf along an angle, with a centre fold
const leafD = (x, y, ang, L, Wd) => { const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, tx = x + dx * L, ty = y + dy * L, mx = x + dx * L * 0.5, my = y + dy * L * 0.5;
  return { d: `M${f(x)} ${f(y)}Q${f(mx + nx * Wd)} ${f(my + ny * Wd)} ${f(tx)} ${f(ty)}Q${f(mx - nx * Wd)} ${f(my - ny * Wd)} ${f(x)} ${f(y)}Z`, vein: `M${f(x)} ${f(y)}L${f(x + dx * L * 0.85)} ${f(y + dy * L * 0.85)}`, half: `M${f(x)} ${f(y)}Q${f(mx - nx * Wd)} ${f(my - ny * Wd)} ${f(tx)} ${f(ty)}Z` }; };

// ---------- biome palettes ----------
const Z = {
  meadow: {   // morning playroom: pale blue wall, green felt rug, cream felt road
    skyTop: '#bfe0ea', skyBottom: '#fbf1da', floorFar: '#cfe2a9', floorNear: '#a8c97c',
    path: '#eee2c4', pathEdge: '#b89b6c', divider: '#fffaec', vig: 'rgba(60,70,30,0.15)'
  },
  pillows: {  // the big bed: lavender wall, lilac quilt, pale linen road
    skyTop: '#cbc3ec', skyBottom: '#fde8ea', floorFar: '#e8d5ee', floorNear: '#cdb3db',
    path: '#f6ebe2', pathEdge: '#b9909f', divider: '#e6c3d0', vig: 'rgba(80,50,90,0.16)'
  },
  crayon: {   // craft table, afternoon: mint paper wall, pale wood table, white drawing-paper road
    skyTop: '#b2dbd2', skyBottom: '#fff0d2', floorFar: '#ead8b8', floorNear: '#cfb790',
    path: '#f6f0e1', pathEdge: '#86aac0', divider: '#b9d2e2', vig: 'rgba(80,60,30,0.16)'
  },
  stars: {    // bedtime: deep-blue ceiling, blue blanket floor, periwinkle carpet road
    skyTop: '#141b45', skyBottom: '#3c4b89', floorFar: '#3e4b82', floorNear: '#2a3464',
    path: '#9ba7d6', pathEdge: '#5b67a2', divider: '#e2e7fa', vig: 'rgba(6,8,30,0.32)'
  }
};
const BI = Object.keys(Z);

// ---------- SKY (the room beyond) ----------
function sky(b) {
  const c = Z[b]; let s = '', defs = '';
  if (b === 'meadow') {
    // wallpaper: tiny soft dots on a diamond lattice (period 48 divides 960)
    for (let y = 22, row = 0; y < 400; y += 38, row++) for (let x = (row % 2) * 24; x < W; x += 48) s += wrap(x - 3, x + 3, circ(x, y, 2.4, '#ffffff', op(0.32)));
    // sunlight beams falling from the window into the room
    defs += linV('ray', [['0', '#fffbe8', 0.5], ['1', '#fffbe8', 0]], 40, 400) + glow('sun', '#fff2c0', 0.9) + linV('pane', [['0', '#d2ecf7'], ['1', '#f3fbf6']], 38, 216);
    s += pth('M560 70L610 60L430 400L300 400Z', 'url(#ray)') + pth('M640 120L690 110L560 400L470 400Z', 'url(#ray)', op(0.8)) + pth('M700 160L734 160L680 400L620 400Z', 'url(#ray)', op(0.6));
    // window: frame, panes with a soft sky, a sun and a little cloud
    const fx = 530, fy = 24, fw = 220, fh = 206;
    s += rrect(fx, fy, fw, fh, 10, '#fbf4e4', SO('#d2bb93', 4));
    s += rrect(fx + 14, fy + 14, fw - 28, fh - 28, 4, 'url(#pane)', SO('#e1cfaa', 2));
    s += circ(700, 72, 44, 'url(#sun)') + circ(700, 72, 19, '#fff4c6', SO('#ffe7a0', 2));
    s += feltCloud(598, 160, 66, 26, { fill: '#ffffff', shade: '#e3eef3', out: '#cfdfe6', stitch: '#cfe0e8', ow: 1.5 });
    s += rect(fx + fw / 2 - 5, fy + 14, 10, fh - 28, '#fbf4e4', SO('#e1cfaa', 1.5)) + rect(fx + 14, fy + fh / 2 - 5, fw - 28, 10, '#fbf4e4', SO('#e1cfaa', 1.5));
    for (const [x, y] of [[562, 54], [672, 150]]) s += stk(`M${x} ${y + 18}L${x + 18} ${y}M${x + 8} ${y + 22}L${x + 22} ${y + 8}`, '#ffffff', 3, op(0.7));
    s += rrect(fx - 12, fy + fh - 8, fw + 24, 14, 5, '#f4e7cb', SO('#d2bb93', 3));
    // a little felt plant on the sill
    s += pth('M702 216L706 236L726 236L730 216Z', '#e9a88f', SO('#b97a66', 2)) + rect(700, 212, 32, 6, '#f0b8a0', SO('#b97a66', 2));
    for (const [a, L] of [[-120, 22], [-90, 26], [-60, 22], [-150, 15], [-30, 15]]) { const lf = leafD(716, 212, a, L, 7); s += pth(lf.d, '#9ccf86', SO('#5e9a58', 1.6)) + stk(lf.vein, '#78b468', 1); }
    // curtains on a rod, tied back
    s += rrect(492, 8, 296, 8, 4, '#c9a477', SO('#a27c50', 2)) + circ(490, 12, 7, '#d8b688', SO('#a27c50', 2)) + circ(790, 12, 7, '#d8b688', SO('#a27c50', 2));
    const cur = pth('M506 12H566Q562 90 548 142Q566 196 560 240H500Q492 150 506 12Z', '#f6cfbf', SO('#d6a08e', 3)) +
      stk('M520 18Q518 80 526 140M536 18Q536 80 540 140M522 150Q516 200 516 236M538 150Q540 200 544 236', '#e3ad9a', 2, op(0.8)) +
      rrect(518, 136, 40, 12, 6, '#a9d6c2', SO('#6fa98f', 2)) + circ(554, 142, 5, '#a9d6c2', SO('#6fa98f', 1.6));
    s += cur + `<g transform="matrix(-1 0 0 1 1280 0)">${cur}</g>`;
    // felt cloud mobile hanging from the ceiling
    s += stk('M220 0V34', '#b6a07e', 1.4) + stk('M146 36H294', '#a07a4e', 6) + stk('M146 36H294', '#d4b083', 3.6) + circ(146, 36, 4.5, '#e7a6a0', SO('#b97670', 1.4)) + circ(294, 36, 4.5, '#9fc8e6', SO('#6f98b6', 1.4));
    s += stk('M160 36V84M220 36V112M282 36V72', '#b6a07e', 1.2);
    const fc = { fill: '#ffffff', shade: '#e6eef2', out: '#cad8e0', stitch: '#bcd2de' };
    s += feltCloud(160, 104, 74, 36, fc) + feltCloud(282, 92, 62, 30, fc);
    s += pth('M220 112Q234 132 234 142A14 14 0 0 1 206 142Q206 132 220 112Z', '#a9d3ef', SO('#6f9fc4', 2.2)) + stitch('M220 120Q229 134 229 142A9 9 0 0 1 211 142', '#e6f4fc', 1.2, '3 3') + ell(214, 138, 3, 4, '#ffffff', op(0.7));
    // a framed picture (a hill and a sun, painted shapes only)
    s += rrect(852, 54, 92, 72, 6, '#d9b98d', SO('#a8855a', 3)) + rect(862, 64, 72, 52, '#eaf6f4') + pth('M862 116Q884 90 904 104Q918 94 934 104V116Z', '#a9d38f') + circ(916, 80, 8, '#ffe2a0');
    s += stk('M898 54L898 40', '#a8855a', 1.5) + stk('M872 54L898 40L924 54', '#a8855a', 1.2);
    // a small bunting of felt hearts on the left
    s += stk('M10 40Q60 70 110 44', '#c7aa86', 1.2);
    for (const [t, col] of [[0.15, '#f4b6b6'], [0.5, '#b8dcc6'], [0.85, '#f6d6a4']]) { const x = 10 + 100 * t, y = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * 70 + t * t * 44 + 2; s += pth(`M${x} ${y + 14}C${x - 12} ${y + 6} ${x - 10} ${y - 4} ${x} ${y + 2}C${x + 10} ${y - 4} ${x + 12} ${y + 6} ${x} ${y + 14}Z`, col, SO(dk(col, 0.3), 1.6)); }
  } else if (b === 'pillows') {
    // bed canopy valance with scallops + pom-poms (60 px scallops → 16 per tile)
    let v = 'M0 0H960V26'; for (let x = 960; x > 0; x -= 60) v += `Q${x - 30} 58 ${x - 60} 26`; v += 'Z';
    s += pth(v, '#f5d3df');
    for (let x = 15; x < W; x += 30) s += rect(x, 0, 10, 26, '#fbe5ec', op(0.8));
    let sc = 'M0 26'; for (let x = 0; x < W; x += 60) sc += `Q${x + 30} 58 ${x + 60} 26`;
    s += stk(sc, '#d7a3b6', 3) + stitch('M0 18H960', '#ffffff', 1.4, '5 4', op(0.8));
    for (let x = 30; x < W; x += 60) s += circ(x, 45, 5.5, '#fff4f7', SO('#d7a3b6', 1.4));
    // soft swags of fabric between the canopy ties, bows at the ties
    for (const x0 of [0, 480]) {
      const x1 = x0 + 480, m = x0 + 240;
      s += pth(`M${x0} 30Q${m} 132 ${x1} 30Q${m} 100 ${x0} 30Z`, '#fdeef3', SO('#e3bccb', 2) + op(0.95));
      s += stk(`M${x0 + 60} 44Q${m} 116 ${x1 - 60} 44`, '#efcfdb', 2, op(0.8));
    }
    const bow = x => wrap(x - 26, x + 26, pth(`M${x} 32C${x - 22} 16 ${x - 26} 46 ${x} 36Z M${x} 32C${x + 22} 16 ${x + 26} 46 ${x} 36Z`, '#e6a9bf', SO('#b97890', 1.8)) + pth(`M${x - 3} 36L${x - 10} 60L${x - 2} 54L${x} 62L${x + 3} 36Z`, '#e6a9bf', SO('#b97890', 1.6)) + circ(x, 34, 4.5, '#f2c2d2', SO('#b97890', 1.6)));
    s += bow(0) + bow(480);
    // bunting garland: two sagging strings with patterned flags
    const FL = ['#bfe3e0', '#ffe0bd', '#d9cdf3', '#ffd1d8', '#cfe8bf'];
    let k = 0;
    for (const x0 of [0, 480]) {
      const x1 = x0 + 480, y0 = 70, cy = 150, q = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (x0 + 240) + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0];
      s += stk(`M${x0} ${y0}Q${x0 + 240} ${cy} ${x1} ${y0}`, '#b89aa8', 1.4);
      for (let i = 1; i < 12; i++) {
        const t = i / 12, [ax, ay] = q(t - 0.028), [bx, by] = q(t + 0.028), [mx, my] = q(t), col = FL[k++ % 5], o = dk(col, 0.32);
        s += pth(`M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}L${f(mx)} ${f(my + 30)}Z`, col, SO(o, 1.6));
        if (k % 3 === 0) s += circ(mx - 4, my + 8, 2, '#ffffff', op(0.85)) + circ(mx + 4, my + 8, 2, '#ffffff', op(0.85)) + circ(mx, my + 16, 2, '#ffffff', op(0.85));
        else if (k % 3 === 1) s += stk(`M${f(mx - 7)} ${f(my + 9)}L${f(mx + 7)} ${f(my + 9)}M${f(mx - 4)} ${f(my + 16)}L${f(mx + 4)} ${f(my + 16)}`, '#ffffff', 2, op(0.8));
        else s += stitch(`M${f(ax + (mx - ax) * 0.25)} ${f(ay + 4)}L${f(mx)} ${f(my + 24)}L${f(bx - (bx - mx) * 0.25)} ${f(by + 4)}`, '#ffffff', 1.1, '2.5 2.5');
      }
    }
    // puffy plush clouds with stitched seams
    const pc = { fill: '#fffafc', shade: '#ecdff1', out: '#d6c3df', stitch: '#dccbe6' };
    s += wrap(60, 240, feltCloud(150, 178, 150, 56, pc)) + feltCloud(790, 168, 170, 60, pc) + feltCloud(470, 214, 120, 44, pc) + wrap(850, 1010, feltCloud(930, 250, 120, 42, pc)) + feltCloud(300, 270, 110, 40, pc);
  } else if (b === 'crayon') {
    // flat paper clouds with a cast paper shadow
    const pcl = (x, y, w, h) => wrap(x - w * 0.6, x + w * 0.6, pth(bumps(cloudPts(x + 5, y + 5, w, h)), '#6f9f95', op(0.18)) + pth(bumps(cloudPts(x, y, w, h)), '#fffdf6', SO('#d9d2bf', 1.6)));
    s += pcl(120, 150, 130, 48) + pcl(470, 120, 110, 40) + pcl(900, 196, 140, 50) + pcl(620, 250, 120, 42) + pcl(300, 290, 120, 40);
    // paper-cut sun: zigzag ray ring + layered discs
    const sx = 760, sy = 100;
    const zig = (R, r, n) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, q = i % 2 ? r : R; p.push([Math.cos(a) * q, Math.sin(a) * q]); } return p; };
    const zz = (dx, dy) => poly(zig(76, 56, 16).map(([x, y]) => [sx + dx + x, sy + dy + y]));
    s += pth(zz(5, 5), '#6f9f95', op(0.2)) + pth(zz(0, 0), '#ffd9a0', SO('#e2ad6c', 2));
    s += circ(sx + 4, sy + 4, 50, '#6f9f95', op(0.18)) + circ(sx, sy, 50, '#ffe6b4', SO('#e9bb7c', 2)) + circ(sx, sy, 36, '#fff2cf') + stk(`M${sx - 22} ${sy - 12}Q${sx - 14} ${sy - 26} ${sx} ${sy - 28}`, '#ffffff', 4, op(0.7));
    // hanging paper vines
    const vine = (x, L, seed) => {
      const r = rng(seed); let d = `M${x} 0`, pts = [];
      for (let y = 0; y <= L; y += 10) { const px = x + Math.sin(y / 26 + seed) * 9; pts.push([px, y]); d += `L${f(px)} ${y}`; }
      let g = stk(d, '#6fa576', 3.2);
      pts.forEach(([px, py], i) => { if (i % 2 || i < 1) return; const side = (i / 2) % 2 ? 1 : -1, ang = side > 0 ? 25 + r() * 25 : 155 - r() * 25, col = i % 4 ? '#9fd08b' : '#86c393';
        const lf = leafD(px, py, ang, 22 + r() * 6, 8), sh = leafD(px + 3, py + 3, ang, 22, 8);
        g += pth(sh.d, '#4f7f6a', op(0.18)) + pth(lf.d, col, SO('#5e9467', 1.6)) + pth(lf.half, dk(col, 0.1, '#3f6a4a'), op(0.35)); });
      const [ex, ey] = pts[pts.length - 1];
      g += stk(`M${f(ex)} ${f(ey)}q6 8 0 14q-8 2 -6 -6`, '#6fa576', 2.2);
      return wrap(x - 40, x + 40, g);
    };
    s += vine(36, 130, 3) + vine(330, 90, 7) + vine(560, 150, 11) + vine(932, 110, 5);
    // a string of paper chains across the room
    const CC = ['#f6b8b0', '#a9d6ee', '#f8dca2', '#c6b7ea', '#b6e0b0'];
    let n = 0;
    for (const x0 of [0, 480]) {
      const x1 = x0 + 480, y0 = 44, cy = 104, q = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (x0 + 240) + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0];
      for (let i = 0; i < 24; i++) {
        const t = (i + 0.5) / 24, [x, y] = q(t), [xa, ya] = q(t + 0.01), ang = Math.atan2(ya - y, xa - x) * 57.3, col = CC[n++ % 5];
        s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})">` + (i % 2 ? ell(0, 0, 4, 9, 'none', SO(dk(col, 0.25), 5)) + ell(0, 0, 4, 9, 'none', SO(col, 3)) : ell(0, 0, 13, 7.5, 'none', SO(dk(col, 0.25), 5.4)) + ell(0, 0, 13, 7.5, 'none', SO(col, 3.4)) + stk('M-8 -5Q0 -8 8 -5', '#ffffff', 1.2, op(0.7))) + '</g>';
      }
    }
  } else {
    // deep-blue ceiling: tiny painted dots, glow-in-the-dark stars, a sleepy crescent nightlight, a planet mobile
    const r = rng(41);
    for (let i = 0; i < 140; i++) { const x = r() * W, y = 6 + Math.pow(r(), 1.2) * 360; s += wrap(x - 2, x + 2, circ(x, y, 0.7 + r() * 1.1, '#dfe4ff', op((0.3 + r() * 0.5).toFixed(2)))); }
    defs += glow('gs', '#e8f8b4', 0.55) + glow('mg', '#fff0c2', 0.5) + `<mask id="cm"><rect width="960" height="540" fill="#000"/><circle cx="250" cy="104" r="50" fill="#fff"/><circle cx="276" cy="90" r="44" fill="#000"/></mask>`;
    const mx = 250, my = 104;
    const skip = (x, y) => Math.hypot(x - mx, y - my) < 90 || (x > 580 && x < 790 && y < 170);
    const r2 = rng(43); let placed = 0;
    for (let i = 0; i < 200 && placed < 30; i++) {
      const x = r2() * W, y = 14 + Math.pow(r2(), 1.1) * 320, R = 5 + r2() * (y < 200 ? 9 : 5), rot = -90 + (r2() - 0.5) * 40;
      if (skip(x, y)) continue; placed++;
      s += wrap(x - R * 2.4, x + R * 2.4, circ(x, y, R * 2.4, 'url(#gs)') + starR(x, y, R, '#e3f4ac', op(0.92), rot) + circ(x - R * 0.25, y - R * 0.3, R * 0.18, '#ffffff', op(0.6)));
    }
    // crescent nightlight with a sleepy face
    s += circ(mx, my, 120, 'url(#mg)');
    s += `<g mask="url(#cm)">${circ(mx, my, 50, '#fff1c4')}${circ(mx - 14, my + 14, 30, '#f6dfa6', op(0.55))}${circ(mx, my, 50, 'none', SO('#e4c787', 5))}</g>`;
    s += stk(`M${mx - 30} ${my - 6}q6 6 12 0`, '#a4844e', 2.4) + circ(mx - 30, my + 8, 5, '#f4b9a6', op(0.6)) + stk(`M${mx - 28} ${my + 20}q4 3 8 0`, '#a4844e', 2) + ell(mx - 34, my - 26, 7, 4, '#ffffff', op(0.6));
    // toy planet mobile on strings
    s += stk('M680 0V26', '#8088bb', 1.2) + stk('M604 30H756', '#56508a', 6) + stk('M604 30H756', '#8a7fb8', 3.4) + circ(604, 30, 4, '#c9b8e8') + circ(756, 30, 4, '#c9b8e8');
    s += stk('M612 30V78M684 30V60M750 30V96', '#8088bb', 1.1, op(0.8));
    s += ell(612, 100, 36, 9, 'none', SO('#b9a9de', 3.4)) + circ(612, 100, 22, '#e7a891', SO('#a8705e', 2.4)) + pth('M592 92Q612 88 632 94L633 100Q612 96 591 100Z', '#f2c3ad', op(0.8)) + circ(620, 108, 11, '#c98571', op(0.35)) +
      pth('M576 100A36 9 0 0 0 648 100', 'none', SO('#d4c6f2', 3.4)) + ell(604, 90, 5, 3, '#ffffff', op(0.6));
    s += circ(684, 70, 24, 'url(#gs)') + starR(684, 70, 11, '#e3f4ac', '');
    s += circ(750, 110, 15, '#8ccacc', SO('#4f8a8e', 2.2)) + circ(745, 105, 5, '#b9e3e2', op(0.8)) + circ(756, 116, 3.4, '#6aa9ac', op(0.8));
  }
  return svg(W, 540, s, defs);
}

// ---------- FAR (960x300 horizon band) ----------
function far(b) {
  const c = Z[b], H = 300; let s = '', defs = '';
  const soft = (col, t = 0.32) => mix(col, c.skyBottom, t);
  const floorBand = (y0, top) => { defs += linV('gb', [['0', top], ['1', c.floorFar]], y0 - 6, 282); return pth(wave(y0, [[4, 2, 0.5], [9, 1, 1.1]], H), 'url(#gb)'); };
  if (b === 'meadow') {
    const o = soft('#9c7c56'), wood = soft('#e5cba0'), woodS = soft('#d0b285'), inner = soft('#c9ab80', 0.25);
    s += rect(0, 238, W, 18, soft('#fffaf0', 0.1)) + rect(0, 236, W, 3, soft('#d9c6a4'));   // baseboard
    // toy shelf with toys
    let g = rrect(20, 168, 300, 94, 5, wood, SO(o, 2)) + rect(30, 178, 135, 36, inner) + rect(175, 178, 135, 36, inner) + rect(30, 222, 135, 34, inner) + rect(175, 222, 135, 34, inner);
    g += rect(20, 214, 300, 8, woodS) + rect(165, 168, 10, 94, woodS);
    const T = { r: soft('#e98a80'), y: soft('#f3cf7e'), b: soft('#86aee0'), g: soft('#9fcf8a'), p: soft('#c6aee6') };
    g += rrect(40, 194, 20, 20, 3, T.r) + rrect(62, 194, 20, 20, 3, T.b) + rrect(51, 174, 20, 20, 3, T.y);
    g += circ(110, 202, 12, T.p) + stk('M98 202H122', soft('#ffffff', 0.4), 2) + rrect(130, 190, 28, 24, 4, T.g);
    g += pth('M190 214L196 186H226L232 214Z', T.y) + pth('M240 214L246 194H268L274 214Z', T.r) + pth('M282 214L287 200H301L306 214Z', T.b);
    g += rrect(42, 232, 46, 24, 10, T.b) + stk('M48 240H82M48 248H82', soft('#ffffff', 0.4), 2) + circ(118, 244, 12, T.r) + circ(146, 248, 8, T.g);
    g += rrect(186, 236, 56, 20, 4, T.p) + circ(196, 256, 5, o) + circ(232, 256, 5, o) + rrect(250, 228, 50, 28, 6, T.g) + circ(275, 242, 7, soft('#ffffff', 0.4));
    g += rrect(60, 146, 22, 22, 3, T.b) + rrect(84, 146, 22, 22, 3, T.r) + rrect(72, 124, 22, 22, 3, T.g) + circ(260, 154, 14, T.y) + stk('M248 148Q260 140 272 148', soft('#ffffff', 0.4), 2);
    s += `<g opacity="0.9">${g}</g>`;
    // wooden castle
    const cx = 520, cb = 258, cw = soft('#ead4ab'), cwS = soft('#d7bb90'), roof = soft('#b6a2d8'), co = soft('#a98a62');
    g = rect(cx - 52, cb - 82, 104, 82, cw, SO(co, 2)) + rect(cx + 20, cb - 82, 32, 82, cwS);
    for (let i = 0; i < 4; i++) g += rect(cx - 52 + i * 30, cb - 94, 14, 12, cw, SO(co, 2));
    for (const tx of [cx - 72, cx + 52]) g += rect(tx, cb - 110, 26, 110, cw, SO(co, 2)) + pth(`M${tx - 6} ${cb - 110}L${tx + 13} ${cb - 146}L${tx + 32} ${cb - 110}Z`, roof, SO(co, 2)) + stk(`M${tx + 13} ${cb - 146}V${cb - 162}`, co, 2) + pth(`M${tx + 13} ${cb - 162}L${tx + 27} ${cb - 157}L${tx + 13} ${cb - 152}Z`, soft('#ef9d8f')) + pth(`M${tx + 7} ${cb - 76}V${cb - 86}A6 6 0 0 1 ${tx + 19} ${cb - 86}V${cb - 76}Z`, soft('#8a7458'));
    g += pth(`M${cx - 16} ${cb}V${cb - 30}A16 16 0 0 1 ${cx + 16} ${cb - 30}V${cb}Z`, soft('#8a7458')) + circ(cx, cb - 56, 9, soft('#86aee0'));
    s += `<g opacity="0.9">${g}</g>`;
    // dollhouse
    const hx = 712, hb = 258, hw = soft('#f2cfc4'), hr = soft('#9fbfe6'), ho = soft('#b08a80');
    g = rect(hx - 62, hb - 78, 124, 78, hw, SO(ho, 2)) + rect(hx + 20, hb - 78, 42, 78, soft('#e5bdb1')) + rect(hx + 26, hb - 140, 16, 34, soft('#d7a99c'), SO(ho, 2));
    g += pth(`M${hx - 74} ${hb - 76}L${hx} ${hb - 132}L${hx + 74} ${hb - 76}Z`, hr, SO(ho, 2)) + circ(hx, hb - 100, 9, soft('#fff6e2'), SO(ho, 1.5));
    for (const [wx, wy] of [[hx - 44, hb - 66], [hx + 22, hb - 66], [hx - 44, hb - 36]]) g += rect(wx, wy, 22, 20, soft('#fff3d6'), SO(ho, 1.5)) + stk(`M${wx + 11} ${wy}V${wy + 20}M${wx} ${wy + 10}H${wx + 22}`, ho, 1.2);
    g += rrect(hx + 14, hb - 40, 22, 40, 4, soft('#b9d6a0'), SO(ho, 1.5));
    s += `<g opacity="0.9">${g}</g>`;
    // rocking horse silhouette
    const rc = soft('#c4a77f', 0.38);
    g = stk('M824 254Q884 278 944 254', rc, 7) + stk('M856 226L848 262M866 228L864 266M900 228L904 266M912 226L920 262', rc, 6) + ell(884, 222, 34, 15, rc) +
      pth('M906 218L918 186Q922 178 932 180L944 186Q946 194 938 196L930 194L924 214Z', rc) + pth('M918 184L914 174L922 180Z', rc) + stk('M850 216Q836 214 832 230', rc, 6) + stk('M916 188Q906 196 908 210', soft('#a98c66', 0.38), 4);
    s += `<g opacity="0.85">${g}</g>`;
    // rug edge with a running stitch
    s += floorBand(258, mix(c.floorFar, '#ffffff', 0.18));
    s += stitch(waveLine(258, [[4, 2, 0.5], [9, 1, 1.1]], 6), mix(c.floorFar, '#ffffff', 0.55), 1.6, '6 5');
  } else if (b === 'pillows') {
    // pillow peaks at the head of the bed
    const PC = ['#f7cbd7', '#c9e1f2', '#fbe7c2', '#dccff2', '#cfe9d4'];
    const pl = [[70, 226, 150, 56, 0], [262, 222, 140, 52, 1], [470, 228, 160, 58, 2], [676, 220, 146, 54, 3], [872, 226, 140, 52, 4]];
    for (const [x, y, w, h, ci] of pl) s += wrap(x - w / 2 - 14, x + w / 2 + 14, `<g opacity="0.9">${pillow(x, y, w, h, soft(PC[ci], 0.4), { out: soft(dk(PC[ci], 0.3), 0.4), ow: 2 })}</g>`);
    // two patchwork quilt hills (grids of 40 / 48 px, both divide 960)
    const quilt = (id, y0, terms, sz, pal, seed) => {
      const d = wave(y0, terms, H); defs += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
      let g = '', yTop = Math.floor((y0 - 30) / sz) * sz;
      for (let x = 0, ci = 0; x < W; x += sz, ci++) for (let y = yTop, ri = 0; y < H; y += sz, ri++) {
        const k = (ci * 7 + ri * 3 + seed) % pal.length, col = pal[k];
        g += rect(x, y, sz, sz, col);
        if ((ci * 5 + ri * 2 + seed) % 4 === 0) for (const [dx, dy] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.7]]) g += circ(x + sz * dx, y + sz * dy, 2.4, '#ffffff', op(0.55));
        else if ((ci * 3 + ri + seed) % 5 === 0) g += stk(`M${x + 6} ${y + sz / 2}H${x + sz - 6}M${x + sz / 2} ${y + 6}V${y + sz - 6}`, '#ffffff', 2.2, op(0.45));
      }
      let st = ''; for (let x = sz; x < W; x += sz) st += `M${x} ${yTop}V${H}`; for (let y = yTop + sz; y < H; y += sz) st += `M0 ${y}H${W}`;
      g += stitch(st, '#ffffff', 1.3, '4 3.5', op(0.7));
      g += pth(wave(y0 + 10, terms, H), dk(pal[0], 0.15, '#7a5a8a'), op(0.12));
      return `<g clip-path="url(#${id})">${g}</g>` + stk(waveLine(y0, terms, 0.5), dk(pal[1], 0.22, '#7a5a8a'), 2.2, op(0.7)) + stk(waveLine(y0, terms, 3), '#ffffff', 2, op(0.55));
    };
    s += quilt('q1', 236, [[2, 9, 0.4], [3, 5, 1.9]], 40, ['#f3cfd8', '#cfe1f0', '#f8e6c8', '#ddd2f0', '#d5e8d0'].map(x => soft(x, 0.35)), 1);
    s += quilt('q2', 256, [[3, 6, 2.4], [5, 3, 0.7]], 48, ['#e9c3dc', '#c6d4f0', '#f3d8c6', '#d4c6ec', '#c9e3dc'].map(x => soft(x, 0.25)), 3);
    s += floorBand(270, mix(c.floorFar, '#ffffff', 0.15));
  } else if (b === 'crayon') {
    // layered paper hills
    const t1 = [[2, 14, 0.8], [3, 6, 2.0]], t2 = [[3, 10, 2.6], [5, 4, 0.4]];
    s += pth(wave(214, t1, H), '#6f8f6a', op(0.16)) + pth(wave(208, t1, H), soft('#bcdcab', 0.3)) + stk(waveLine(208, t1), soft('#9fc590', 0.3), 1.6);
    // paper trees: lollipops and zigzag pines with cast shadows
    const tree = (x, by, kind, sc, col) => {
      let g = stk(`M${x} ${by}V${by - 40 * sc}`, soft('#b48d68'), 4 * sc);
      if (kind === 0) g += circ(x + 4, by - 52 * sc + 4, 22 * sc, '#5f7f5a', op(0.18)) + circ(x, by - 52 * sc, 22 * sc, col, SO(dk(col, 0.25), 1.6)) + stk(`M${x - 10 * sc} ${by - 56 * sc}Q${x} ${by - 70 * sc} ${x + 10 * sc} ${by - 58 * sc}`, lt(col, 0.4), 2);
      else { const tri = (dx, dy) => poly([[x - 20 * sc + dx, by - 26 * sc + dy], [x + dx, by - 60 * sc + dy], [x + 20 * sc + dx, by - 26 * sc + dy]]) + poly([[x - 16 * sc + dx, by - 46 * sc + dy], [x + dx, by - 80 * sc + dy], [x + 16 * sc + dx, by - 46 * sc + dy]]);
        g += pth(tri(4, 4), '#5f7f5a', op(0.18)) + pth(tri(0, 0), col, SO(dk(col, 0.25), 1.6)); }
      return wrap(x - 30, x + 30, g);
    };
    s += tree(70, 246, 0, 1, soft('#9fd08a')) + tree(240, 244, 1, 1.1, soft('#86c39a')) + tree(450, 246, 0, 0.9, soft('#b2d68a')) + tree(600, 244, 1, 0.9, soft('#9fd08a')) + tree(820, 246, 0, 1.1, soft('#86c39a'));
    s += pth(wave(232, t2, H), '#6f8f6a', op(0.16)) + pth(wave(226, t2, H), soft('#a9d19c', 0.3));
    // standing crayons skyline (plain paper wrappers with a wavy band)
    const CR = [[30, 28, 96, '#e6978d'], [64, 24, 70, '#8fbfe6'], [128, 30, 118, '#b6d68c'], [160, 24, 84, '#c8aee8'], [316, 30, 104, '#f2b98c'], [350, 24, 76, '#e6978d'], [530, 30, 124, '#8fbfe6'], [562, 26, 90, '#f0c9a0'], [700, 28, 100, '#c8aee8'], [734, 24, 72, '#b6d68c'], [880, 30, 112, '#e6978d'], [912, 24, 80, '#8fbfe6']];
    for (const [x, w, h, col] of CR) s += wrap(x - w, x + w, `<g opacity="0.9">${crayon(x, 256, w * 0.8, h * 0.62, soft(col, 0.42), { out: soft(dk(col, 0.4), 0.42) })}</g>`);
    // glue pots
    const pot = (x, w, h, col) => wrap(x - w, x + w, rrect(x - w / 2, 256 - h, w, h, 8, soft('#fbf7ee', 0.2), SO(soft('#b9b09c'), 2)) + rrect(x - w / 2 - 3, 256 - h - 10, w + 6, 12, 4, soft(col), SO(soft(dk(col, 0.3)), 2)) + rect(x - w / 2 + 6, 256 - h * 0.7, w - 12, h * 0.4, soft(lt(col, 0.5), 0.2)) + pth(`M${x - w / 2 + 8} ${256 - h - 2}q4 10 0 16`, soft('#ffffff', 0.1), SO(soft('#ddd6c6'), 1)));
    s += pot(250, 44, 34, '#86b8d8') + pot(430, 36, 28, '#c8aee8') + pot(640, 40, 30, '#9fd08a') + pot(800, 34, 26, '#e6978d');
    // zigzag paper grass strip at the table edge (teeth of 16 px)
    let gz = 'M0 252'; for (let x = 0; x < W; x += 16) gz += `L${x + 8} ${244 - ((x / 16) % 3) * 2}L${x + 16} 252`; gz += `L${W} 262L0 262Z`;
    s += pth(gz, soft('#94c784', 0.3)) + rect(0, 252, W, 10, soft('#94c784', 0.3));
    s += floorBand(260, mix(c.floorFar, '#ffffff', 0.12));
    s += stk(waveLine(260, [[4, 2, 0.5], [9, 1, 1.1]], 1), mix(c.floorFar, '#ffffff', 0.5), 1.6, op(0.8));
  } else {
    // a warm nightlight glow on the floor
    defs += glow('nl', '#ffd99a', 0.42) + glow('pw', '#ffe7a8', 0.7);
    s += wrap(540, 980, ell(760, 268, 220, 120, 'url(#nl)'));
    // blanket hills with stitched ridges
    const t1 = [[2, 9, 0.3], [3, 5, 1.4]], t2 = [[3, 7, 2.2], [4, 4, 0.6]];
    s += pth(wave(222, t1, H), '#2a376f') + stitch(waveLine(222, t1, 9), '#4b5998', 1.5, '5 4');
    // toy rocket silhouettes with lit portholes
    const rocket = (x, by, sc) => { const g = pth(`M${x} ${by - 76 * sc}Q${x + 18 * sc} ${by - 56 * sc} ${x + 16 * sc} ${by - 14 * sc}L${x + 26 * sc} ${by}L${x + 10 * sc} ${by - 4 * sc}L${x - 10 * sc} ${by - 4 * sc}L${x - 26 * sc} ${by}L${x - 16 * sc} ${by - 14 * sc}Q${x - 18 * sc} ${by - 56 * sc} ${x} ${by - 76 * sc}Z`, '#1f295a') +
      circ(x, by - 44 * sc, 16 * sc, 'url(#pw)') + circ(x, by - 44 * sc, 6.5 * sc, '#ffe2a6', SO('#2f3a74', 2)) + stk(`M${x - 13 * sc} ${by - 24 * sc}H${x + 13 * sc}`, '#34407a', 2); return wrap(x - 30 * sc, x + 30 * sc, g); };
    s += rocket(130, waveY(222, t1, 130) + 8, 0.8) + rocket(520, waveY(222, t1, 520) + 8, 0.62) + rocket(900, waveY(222, t1, 900) + 8, 0.9);
    s += pth(wave(246, t2, H), '#313e79') + stitch(waveLine(246, t2, 8), '#56649f', 1.5, '5 4');
    for (let x = 30; x < W; x += 60) s += stitch(`M${x} ${f(waveY(246, t2, x) + 14)}l14 14l-14 14`, '#3b4886', 1.2, '3 3', op(0.8));
    // the plug-in nightlight dome
    s += circ(760, 262, 34, 'url(#pw)') + pth('M742 270A18 18 0 0 1 778 270Z', '#ffe9b6', SO('#d6b070', 2)) + rrect(736, 268, 48, 7, 3, '#7f88bb') + ell(754, 260, 5, 3, '#ffffff', op(0.7));
    s += floorBand(270, '#36437c');
  }
  s += rect(0, 280, W, 20, c.floorFar);
  return svg(W, H, s, defs);
}

// ---------- PROPS (160x220, base y 214, centre x 80) ----------
const PB = 214;
const shadow = (w, col = '#2e2236', a = 0.18) => ell(80, PB - 1, w, w * 0.16, col, op(a));
function props(b) {
  const P = [];
  const OW = 3;
  if (b === 'meadow') {
    // 0 wooden toy tree: painted ball crown on a peg trunk, round wooden base
    let g = shadow(44);
    const wd = '#d8ae78', wo = '#8a6034', gr = '#7fc06a', go = '#3f7f3c';
    g += ell(80, 204, 42, 10, dk(wd, 0.12), SO(wo, OW)) + rrect(38, 192, 84, 12, 6, wd, SO(wo, OW)) + ell(80, 192, 42, 8, lt(wd, 0.15), SO(wo, 2));
    g += rrect(70, 104, 20, 90, 6, '#c48b56', SO(wo, OW)) + rect(80, 108, 8, 84, '#a87442', op(0.6)) + stk('M76 130V150M76 162V176', '#e2b583', 2, op(0.8));
    g += circ(50, 112, 22, '#8fca74', SO(go, OW)) + circ(112, 104, 24, '#8fca74', SO(go, OW));
    g += circ(80, 76, 48, gr, SO(go, OW)) + pth('M104 36A48 48 0 0 1 112 112A52 52 0 0 0 104 36Z', '#62a756', op(0.8)) + pth('M80 124A48 48 0 0 0 128 76A44 44 0 0 1 72 122Z', '#62a756', op(0.7));
    g += ell(62, 56, 14, 9, '#ffffff', op(0.45)) + circ(100, 64, 4, '#f4b6b6', SO('#b97a7a', 1.4)) + circ(66, 96, 4, '#fff3c6', SO('#b9a06a', 1.4)) + circ(92, 98, 3.5, '#f4b6b6', SO('#b97a7a', 1.4));
    P.push(g);
    // 1 felt flower clump with button centres
    g = shadow(52, '#2e2236', 0.15);
    const lv = [[40, -120, 50], [56, -100, 62], [72, -80, 56], [92, -96, 64], [110, -70, 54], [120, -110, 46], [62, -140, 44]];
    for (const [x, a, L] of lv) { const lf = leafD(x, PB - 4, a, L, 12); g += pth(lf.d, '#8cc773', SO('#4f8a48', 2.2)) + pth(lf.half, '#6fae5e', op(0.5)) + stitch(lf.vein, '#c3e7a8', 1.2, '3 3'); }
    const flower = (x, y, R, col, ctr) => { let h = stk(`M${x} ${y}Q${x + 4} ${(y + PB) / 2} ${x} ${PB - 4}`, '#5e9a50', 4); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; h += ell(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, R * 0.5, R * 0.34, col, ` transform="rotate(${f(a * 57.3)} ${f(x + Math.cos(a) * R * 0.62)} ${f(y + Math.sin(a) * R * 0.62)})"` + SO(dk(col, 0.32), 2)); }
      return h + circ(x, y, R * 0.36, ctr, SO(dk(ctr, 0.35), 1.8)) + circ(x - R * 0.1, y - R * 0.05, R * 0.07, dk(ctr, 0.4)) + circ(x + R * 0.12, y + R * 0.05, R * 0.07, dk(ctr, 0.4)) + stitch(`M${x - R * 0.62} ${y}A${R * 0.62} ${R * 0.62} 0 1 1 ${x + R * 0.62} ${y}`, '#ffffff', 1.1, '2.5 2.5', op(0.7)); };
    g += flower(52, 108, 26, '#f7b7c4', '#ffe39a') + flower(112, 96, 28, '#fffaf0', '#f3b86b') + flower(84, 140, 22, '#c9b5f0', '#fff0b8') + flower(130, 152, 16, '#a9d8f2', '#fff6d8') + flower(30, 160, 16, '#ffe2b0', '#f39b8c');
    g += pth(`M16 ${PB}Q30 ${PB - 20} 56 ${PB - 12}Q80 ${PB - 24} 104 ${PB - 12}Q130 ${PB - 20} 144 ${PB}Z`, '#97cc7c', SO('#4f8a48', 2.2)) + stitch(`M30 ${PB - 6}Q56 ${PB - 16} 80 ${PB - 14}Q106 ${PB - 16} 130 ${PB - 6}`, '#cfeab6', 1.3, '3 3');
    P.push(g);
    // 2 toy windmill: wooden tower, cap roof, four lattice sails
    g = shadow(40);
    const tw = '#f4e4c6', to = '#9a7a52', rf = '#e2867a', rfo = '#9a4c44';
    g += pth(`M54 ${PB - 2}L66 96H94L106 ${PB - 2}Z`, tw, SO(to, OW)) + pth(`M86 96H94L106 ${PB - 2}H92Z`, '#e2cfa8', op(0.85));
    for (const y of [130, 168]) g += stk(`M${58 + (PB - y) * 0.1} ${y}H${102 - (PB - y) * 0.1}`, '#dcc59a', 2);
    g += pth(`M68 ${PB - 2}V184A12 12 0 0 1 92 184V${PB - 2}Z`, '#8fbfe0', SO(to, 2.4)) + circ(80, 142, 8, '#fff6dc', SO(to, 2)) + stk('M80 134V150M72 142H88', to, 1.4);
    g += pth('M60 98Q80 64 100 98Z', rf, SO(rfo, OW)) + pth('M84 70Q96 82 100 98H88Z', '#c86e62', op(0.8)) + rrect(56, 94, 48, 8, 4, '#eec8a0', SO(to, 2));
    const hx = 80, hy = 82;
    for (const a of [-30, 60, 150, 240]) {
      g += `<g transform="rotate(${a} ${hx} ${hy})">` + rect(hx + 6, hy - 2.5, 60, 5, '#b98c5c', SO(to, 1.6)) + rect(hx + 18, hy + 2, 48, 16, '#fffaf0', SO(to, 2.2)) + stk(`M${hx + 30} ${hy + 2}V${hy + 18}M${hx + 42} ${hy + 2}V${hy + 18}M${hx + 54} ${hy + 2}V${hy + 18}M${hx + 18} ${hy + 10}H${hx + 66}`, '#d8c09a', 1.3) + '</g>';
    }
    g += circ(hx, hy, 8, '#f3c46e', SO(to, 2.4)) + circ(hx - 2, hy - 2, 2.4, '#ffffff', op(0.8));
    g += pth(`M30 ${PB}Q56 ${PB - 14} 80 ${PB - 10}Q106 ${PB - 14} 130 ${PB}Z`, '#97cc7c', SO('#4f8a48', 2));
    P.push(g);
    // 3 teddy-sized wooden house: block body, roof, round window, painted heart
    g = shadow(56);
    const hb = '#f3caa0', ho = '#9a6a44', hr = '#76a8d8', hro = '#3f6a9a';
    g += rrect(30, 118, 100, PB - 120, 6, hb, SO(ho, OW)) + rect(98, 121, 29, PB - 126, '#e2b285', op(0.85));
    g += rect(100, 64, 16, 40, '#e2a08a', SO('#9a5a48', 2.4)) + rect(97, 60, 22, 8, '#f0b8a2', SO('#9a5a48', 2));
    g += pth('M18 124L80 62L142 124Z', hr, SO(hro, OW)) + pth('M80 62L142 124H112Z', '#5f90c4', op(0.8)) + stk('M30 118L80 70', '#a3c8ec', 3, op(0.7));
    g += circ(80, 100, 11, '#fff6dc', SO(hro, 2.4)) + stk('M80 89V111M69 100H91', hro, 1.6);
    g += pth(`M64 ${PB - 1}V170A16 16 0 0 1 96 170V${PB - 1}Z`, '#9dd09a', SO('#4f8a58', 2.4)) + circ(90, 190, 2.8, '#f6d36b', SO('#9a7a30', 1));
    g += rrect(38, 142, 20, 20, 3, '#fff6dc', SO(ho, 2)) + stk('M48 142V162M38 152H58', ho, 1.4) + pth('M112 146C104 140 104 132 112 136C120 132 120 140 112 146Z', '#f08a8a', SO('#a45454', 1.4));
    g += stk('M40 128H120', '#ffe2c4', 2.4, op(0.7));
    P.push(g);
  } else if (b === 'pillows') {
    // 0 pillow stack
    let g = shadow(62, '#3e2a4e', 0.16);
    g += pillow(82, 186, 132, 46, '#c8e0f2', { ow: OW }) + pillow(76, 146, 118, 42, '#f7c6d4', { ow: OW }) + pillow(84, 110, 100, 36, '#fff0c8', { ow: OW });
    g += pth('M114 92Q124 86 130 92L122 98Z', '#e9a9bf', SO('#b97890', 1.4)) + pth('M114 92Q108 84 100 90L108 96Z', '#e9a9bf', SO('#b97890', 1.4)) + circ(112, 94, 3, '#f2c2d2', SO('#b97890', 1.2));
    P.push(g);
    // 1 plush cloud on a stick, in a wooden block
    g = shadow(34, '#3e2a4e', 0.16);
    g += rrect(76, 96, 8, 100, 4, '#e2c39a', SO('#9a7656', 2.4)) + stk('M78 104V190', '#f2dcbc', 2);
    g += rrect(54, 186, 52, 28, 5, '#b8a6e6', SO('#6e5aa0', OW)) + rect(88, 189, 15, 22, '#9f8ad6', op(0.8)) + starR(72, 200, 7, '#fff3c4', '');
    g += feltCloud(80, 76, 128, 62, { fill: '#fffbfd', shade: '#e8dcef', out: '#a993bd', stitch: '#d2c1e0', ow: OW });
    g += stk('M62 78q5 5 10 0M90 78q5 5 10 0', '#6e5a80', 2.4) + circ(58, 88, 5, '#f7b8c8', op(0.75)) + circ(104, 88, 5, '#f7b8c8', op(0.75)) + stk('M77 90q4 3 8 0', '#6e5a80', 2);
    P.push(g);
    // 2 tall painted bedpost with a round knob and a ribbon
    g = shadow(30, '#3e2a4e', 0.16);
    const pw = '#f6eee6', pk = '#9fc4ea', pko = '#5c80aa', pout = '#8a7088';
    g += rrect(56, 184, 48, 30, 5, pw, SO(pout, OW)) + rect(88, 187, 13, 24, '#e7dcd6', op(0.9)) + rrect(50, 176, 60, 10, 4, pw, SO(pout, 2.4));
    g += rrect(70, 66, 20, 112, 6, pw, SO(pout, OW)) + rect(82, 70, 6, 104, '#e7dcd6', op(0.9));
    for (const y of [74, 116, 160]) g += ell(80, y, 16, 6, pw, SO(pout, 2.4)) + ell(78, y - 1.5, 9, 2, '#ffffff', op(0.8));
    g += ell(80, 60, 14, 5, pw, SO(pout, 2.4)) + circ(80, 38, 20, pk, SO(pko, OW)) + pth('M94 24A20 20 0 0 1 96 50A18 18 0 0 0 94 24Z', '#7fa8d6', op(0.9)) + ell(73, 31, 6, 4, '#ffffff', op(0.7));
    g += pth('M70 128Q60 136 64 150L72 140Z M90 128Q100 136 98 152L88 140Z', '#f2b6c8', SO('#b97890', 1.8)) + rrect(66, 124, 28, 10, 4, '#f2b6c8', SO('#b97890', 1.8));
    g += circ(80, 129, 4, '#fad0dc', SO('#b97890', 1.4));
    P.push(g);
    // 3 folded blanket stack (patchwork, stitched)
    g = shadow(60, '#3e2a4e', 0.16);
    const BL = [['#cfe6d4', '#f7c6d4', 128], ['#f6d8b8', '#c8e0f2', 120], ['#d9cdf2', '#fff0c8', 124], ['#f7c6d4', '#cfe6d4', 112]];
    let y = PB;
    BL.forEach(([a, bcol, ww], i) => {
      const h = 28, x = 80 + (i % 2 ? 4 : -3) - ww / 2; y -= h;
      const o = dk(a, 0.36);
      g += rrect(x, y, ww, h, 12, a, SO(o, OW));
      for (let k = 0; k < Math.floor((ww - 30) / 18); k++) if (k % 2 === 0) g += rect(x + 12 + k * 18, y + 3, 18, h - 6, bcol, op(0.9));
      g += stitch(`M${x + 8} ${y + 6}H${x + ww - 22}M${x + 8} ${y + h - 6}H${x + ww - 22}`, '#ffffff', 1.3, '3.5 3');
      g += pth(`M${x + ww - 20} ${y + 1.5}Q${x + ww - 1.5} ${y + 1.5} ${x + ww - 1.5} ${y + h / 2}Q${x + ww - 1.5} ${y + h - 1.5} ${x + ww - 20} ${y + h - 1.5}Z`, dk(a, 0.1, '#6a4c7a'), op(0.6));
      g += stk(`M${x + 14} ${y + 4}H${x + 40}`, '#ffffff', 2, op(0.55));
    });
    g += pth(`M98 ${y + 2}C92 ${y - 10} 98 ${y - 18} 106 ${y - 10}C114 ${y - 18} 120 ${y - 10} 114 ${y + 2}Z`, '#f6b3c6', SO('#b97890', 2)) + ell(102, y - 9, 2.4, 1.6, '#ffffff', op(0.7));
    P.push(g);
  } else if (b === 'crayon') {
    // 0 giant crayon tree: a fat crayon trunk, a paper-cut crown with crayon scribbles
    let g = shadow(46);
    g += crayon(80, PB, 30, 100, '#b296dc', { ow: OW, out: '#5e4a86' });
    const crown = bumps([[34, 120], [22, 86], [40, 52], [76, 30], [116, 44], [138, 78], [128, 116], [96, 128]], 0.6);
    g += `<g transform="translate(5 5)">${pth(crown, '#4f6f4a', op(0.2))}</g>` + pth(crown, '#86c36e', SO('#3f7a3c', OW));
    let sc = 'M40 96'; const r = rng(91); for (let i = 0; i < 16; i++) sc += `L${f(42 + r() * 80)} ${f(48 + (i % 2 ? r() * 30 : 40 + r() * 36))}`;
    g += stk(sc, '#a2d886', 2.4, op(0.45)) + stk('M46 64Q60 44 84 42', '#d2f0b8', 4, op(0.8));
    for (const [x, y, col] of [[54, 80, '#f5a3a0'], [104, 70, '#ffe2a0'], [92, 104, '#f5a3a0'], [70, 58, '#a9d6ee']]) g += circ(x, y, 6, col, SO(dk(col, 0.35), 1.6));
    P.push(g);
    // 1 paper palm: stacked paper trunk segments, fringed paper fronds
    g = shadow(44);
    for (let i = 0; i < 7; i++) { const y0 = PB - i * 18, x = 80 + i * 1.6, w0 = 14 - i * 0.6; g += pth(`M${f(x - w0)} ${y0}L${f(x - w0 + 3)} ${y0 - 20}L${f(x + w0 + 1)} ${y0 - 20}L${f(x + w0 + 4)} ${y0}Z`, i % 2 ? '#d8b088' : '#e6c39a', SO('#8a6440', 2.4)); }
    const top = [92, PB - 130];
    for (const [a, L, col] of [[-170, 62, '#7fbf6e'], [-140, 60, '#9fd286'], [-110, 52, '#86c876'], [-70, 54, '#9fd286'], [-35, 62, '#7fbf6e'], [-5, 60, '#86c876'], [-200, 50, '#6fae62'], [20, 50, '#6fae62']]) {
      const ar = a * Math.PI / 180, ex = top[0] + Math.cos(ar) * L, ey = top[1] + Math.sin(ar) * L + L * 0.35, mx = (top[0] + ex) / 2, my = (top[1] + ey) / 2 - 14;
      let d = `M${top[0]} ${top[1]}Q${f(mx)} ${f(my - 10)} ${f(ex)} ${f(ey)}`; const n = 7;
      for (let k = n; k >= 0; k--) { const t = k / n, px = (1 - t) * (1 - t) * top[0] + 2 * (1 - t) * t * mx + t * t * ex, py = (1 - t) * (1 - t) * top[1] + 2 * (1 - t) * t * (my + 8) + t * t * ey; d += `L${f(px + (k % 2 ? 0 : 4))} ${f(py + (k % 2 ? 6 : 14))}`; }
      g += `<g transform="translate(4 4)">${pth(d + 'Z', '#3f5f3a', op(0.15))}</g>` + pth(d + 'Z', col, SO('#3f7a3c', 2.2)) + stk(`M${top[0]} ${top[1]}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`, '#c8ecb0', 1.4, op(0.8));
    }
    g += circ(top[0], top[1] + 4, 7, '#c99a6a', SO('#8a6440', 2));
    g += pth(`M30 ${PB}L38 ${PB - 12}L46 ${PB}L54 ${PB - 14}L62 ${PB}L70 ${PB - 10}L78 ${PB}L86 ${PB - 14}L94 ${PB}L102 ${PB - 10}L110 ${PB}L118 ${PB - 13}L126 ${PB}Z`, '#94c784', SO('#4f8a48', 1.8));
    P.push(g);
    // 2 glue bottle with a blank label and a little drip
    g = shadow(34);
    const bo = '#8f8a9e';
    g += pth(`M50 ${PB - 2}V110Q50 92 66 88H94Q110 92 110 110V${PB - 2}Q110 ${PB + 1} 104 ${PB + 1}H56Q50 ${PB + 1} 50 ${PB - 2}Z`, '#fbfaf6', SO(bo, OW));
    g += pth(`M96 90Q110 94 110 110V${PB - 2}Q110 ${PB + 1} 104 ${PB + 1}H96Z`, '#e8e6ee', op(0.9)) + rrect(58, 128, 44, 56, 6, '#cdeee2', SO('#6fa892', 2.2)) + stk('M62 136V176', '#ffffff', 3, op(0.6));
    g += pth('M64 88L68 72H92L96 88Z', '#5fb0e0', SO('#2f6f9a', OW)) + pth('M72 72L78 46Q80 42 82 46L88 72Z', '#5fb0e0', SO('#2f6f9a', OW)) + stk('M76 70L80 50', '#a8d8f6', 2, op(0.8));
    g += pth('M64 92Q60 102 62 112Q64 118 66 112Q68 102 64 92Z', '#ffffff', SO('#cfcad8', 1.4)) + ell(42, PB - 2, 10, 3, '#ffffff', SO('#cfcad8', 1.4)) + ell(58, 104, 4, 8, '#ffffff', op(0.8));
    P.push(g);
    // 3 paintbrush cup: a glass jar of tinted water, three brushes with painted tips
    g = shadow(44);
    const br = (x0, y0, x1, y1, tip) => { const a = Math.atan2(y1 - y0, x1 - x0); const nx = -Math.sin(a), ny = Math.cos(a);
      return stk(`M${x0} ${y0}L${x1} ${y1}`, '#6b4a2b', 8) + stk(`M${x0} ${y0}L${x1} ${y1}`, '#e0b07a', 5) +
        pth(`M${f(x1 + nx * 5)} ${f(y1 + ny * 5)}L${f(x1 - nx * 5)} ${f(y1 - ny * 5)}L${f(x1 - nx * 4 + Math.cos(a) * 12)} ${f(y1 - ny * 4 + Math.sin(a) * 12)}L${f(x1 + nx * 4 + Math.cos(a) * 12)} ${f(y1 + ny * 4 + Math.sin(a) * 12)}Z`, '#c7ccd8', SO('#6b6f80', 1.6)) +
        pth(`M${f(x1 + nx * 4 + Math.cos(a) * 12)} ${f(y1 + ny * 4 + Math.sin(a) * 12)}Q${f(x1 + Math.cos(a) * 34 + nx * 3)} ${f(y1 + Math.sin(a) * 34 + ny * 3)} ${f(x1 + Math.cos(a) * 38)} ${f(y1 + Math.sin(a) * 38)}Q${f(x1 + Math.cos(a) * 34 - nx * 3)} ${f(y1 + Math.sin(a) * 34 - ny * 3)} ${f(x1 - nx * 4 + Math.cos(a) * 12)} ${f(y1 - ny * 4 + Math.sin(a) * 12)}Z`, tip, SO(dk(tip, 0.35), 1.8)); };
    g += br(70, 170, 52, 92, '#f08f8f') + br(84, 170, 88, 78, '#7fb8e8') + br(96, 170, 116, 96, '#9fd286');
    g += pth(`M44 120H116L112 ${PB - 4}Q112 ${PB} 106 ${PB}H54Q48 ${PB} 48 ${PB - 4}Z`, '#d8eef8', SO('#6f98b0', OW) + op(0.92));
    g += pth(`M47 150Q80 144 113 150L112 ${PB - 4}Q112 ${PB} 106 ${PB}H54Q48 ${PB} 48 ${PB - 4}Z`, '#a9d2ec', op(0.85)) + stk('M50 150Q80 144 110 150', '#e8f6fc', 2);
    g += rrect(40, 114, 80, 10, 4, '#e8f6fc', SO('#6f98b0', 2.4)) + stk('M56 132V196', '#ffffff', 4, op(0.6)) + stk('M66 132V150', '#ffffff', 2.4, op(0.5));
    g += pth('M114 130q4 8 0 14q-3 -6 0 -14Z', '#f08f8f', SO('#a85a5a', 1.2)) + ell(132, PB - 2, 9, 3, '#9fd286', SO('#5e9a50', 1.2)) + ell(26, PB - 3, 7, 2.6, '#7fb8e8', SO('#4f7fa8', 1.2));
    P.push(g);
  } else {
    const ng = (id, col, a) => `<defs>${glow(id, col, a)}</defs>`;
    // 0 toy rocket on its fins with a lit porthole
    let g = ng('pg', '#ffe6a6', 0.7) + shadow(40, '#05081e', 0.3);
    const rb = '#e9e6f6', ro = '#4e4e86', rn = '#f2a088', rno = '#9a5248';
    g += pth(`M50 ${PB}L60 168L64 196Z`, rn, SO(rno, OW)) + pth(`M110 ${PB}L100 168L96 196Z`, rn, SO(rno, OW));
    g += pth(`M80 24Q118 60 108 168Q104 196 96 200H64Q56 196 52 168Q42 60 80 24Z`, rb, SO(ro, OW)) + pth(`M92 40Q118 76 106 168Q102 194 96 198H86Q100 120 92 40Z`, '#c9c6e6', op(0.9));
    g += pth('M80 24Q96 38 102 56Q80 50 58 56Q64 38 80 24Z', rn, SO(rno, 2.4)) + rrect(66, 200, 28, 10, 4, '#9aa0c8', SO(ro, 2.4)) + pth(`M76 ${PB - 6}L84 ${PB - 6}L80 ${PB + 2}Z`, '#9aa0c8');
    g += circ(80, 104, 34, 'url(#pg)') + circ(80, 104, 17, '#ffe6a6', SO('#7a7aa8', 4)) + ell(74, 98, 6, 4, '#ffffff', op(0.8)) + stk('M60 146H100M62 154H98', '#a7a2d2', 2, op(0.8)) + starR(80, 176, 7, '#f2a088', '');
    g += stk('M62 64Q58 100 62 140', '#ffffff', 3, op(0.6));
    P.push(g);
    // 1 bedside lamp with a warm glow and a light pool
    g = `<defs>${glow('lg', '#ffd998', 0.65)}${glow('lp', '#ffd998', 0.45)}</defs>` + ell(80, PB - 2, 64, 12, 'url(#lp)') + shadow(28, '#05081e', 0.25);
    g += circ(80, 84, 76, 'url(#lg)');
    g += pth(`M52 ${PB - 1}Q52 186 80 184Q108 186 108 ${PB - 1}Z`, '#8fa6e0', SO('#3f4f8a', OW)) + rrect(75, 112, 10, 76, 4, '#e8d2b0', SO('#8a6a4a', 2.4)) + ell(70, 196, 8, 4, '#c3d0f4', op(0.8));
    g += pth('M40 118L56 52H104L120 118Z', '#ffe3a6', SO('#c48d48', OW)) + pth('M90 52H104L120 118H100Z', '#ffd08a', op(0.85)) + pth('M40 118H120L116 124H44Z', '#ffcd86', SO('#c48d48', 2));
    g += stitch('M46 108H114', '#fff4d8', 1.4, '4 3') + ell(66, 72, 8, 12, '#fffbe8', op(0.75)) + stk('M110 124V150', '#8a6a4a', 1.4) + circ(110, 152, 3, '#e8d2b0', SO('#8a6a4a', 1.2));
    P.push(g);
    // 2 planet on a wooden stand
    g = shadow(40, '#05081e', 0.3);
    const so = '#5a4466', sw = '#b99ac8';
    g += ell(80, PB - 6, 40, 9, dk(sw, 0.15), SO(so, OW)) + rrect(42, PB - 14, 76, 8, 4, sw, SO(so, 2.4)) + rrect(75, 150, 10, PB - 160, 4, sw, SO(so, 2.4));
    g += stk('M40 96A42 42 0 0 0 120 96', so, 7) + stk('M40 96A42 42 0 0 0 120 96', sw, 4);
    g += ell(80, 96, 66, 16, 'none', SO('#7a6a9a', 6)) + ell(80, 96, 66, 16, 'none', SO('#f0dcae', 3.4));
    g += circ(80, 96, 38, '#93b4ec', SO('#3f5a9a', OW)) + pth('M46 84Q80 76 114 86L116 94Q80 86 44 94Z', '#b9d0f6', op(0.9)) + pth('M44 104Q80 98 116 106L112 116Q80 108 48 114Z', '#7898d8', op(0.85));
    g += pth('M100 64A38 38 0 0 1 112 118A40 40 0 0 0 100 64Z', '#5f7fc6', op(0.6)) + ell(66, 76, 10, 6, '#ffffff', op(0.6)) + circ(96, 92, 4, '#7898d8') + circ(64, 102, 3, '#b9d0f6');
    g += pth('M14 96A66 16 0 0 0 146 96', 'none', SO('#7a6a9a', 6)) + pth('M14 96A66 16 0 0 0 146 96', 'none', SO('#f0dcae', 3.4)) + circ(80, 52, 6, '#e8c8ec', SO(so, 2));
    P.push(g);
    // 3 sleepy star plush sitting on the floor
    g = ng('sg', '#f4f0b0', 0.5) + shadow(52, '#05081e', 0.3) + circ(80, 140, 74, 'url(#sg)');
    const sp = '#f9e8a8', spo = '#a8884a';
    const sd = star5(80, 136, 74, 34, -90);
    g += pth(sd, sp, SO(spo, OW * 2.6)) + pth(sd, sp, SO(sp, OW * 1.6)) + pth(star5(88, 144, 56, 24, -90), '#ecd38a', op(0.5)) + pth(star5(78, 134, 58, 27, -90), sp);
    g += stitch(star5(80, 138, 60, 28, -90), '#fffbe2', 1.4, '4 3.5');
    g += stk('M60 132q7 7 14 0M88 132q7 7 14 0', '#6a5428', 3) + circ(56, 146, 7, '#f6b3a6', op(0.7)) + circ(106, 146, 7, '#f6b3a6', op(0.7)) + stk('M76 150q5 4 10 0', '#6a5428', 2.4);
    g += pth('M80 62Q70 56 64 64Q60 72 70 72Z', '#9aa8e0', SO('#4f5c9a', 2)) + ell(70, 108, 9, 5, '#ffffff', op(0.6));
    P.push(g);
  }
  return P.map(x => svg(160, 220, x));
}

// ---------- PARTICLES ----------
function particles() {
  const P = {};
  const g1 = (id, col, a) => `<defs>${rad(id, [['0', col, a], ['0.55', col, a * 0.5], ['1', col, 0]])}</defs>`;
  P.dust = svg(32, 32, g1('d', '#f3ead8', 0.9) + circ(16, 16, 15, 'url(#d)') + circ(12, 17, 6, '#f8f1e2', op(0.7)) + circ(19, 14, 5, '#fbf6ec', op(0.7)) + circ(17, 19, 4.5, '#ece0c8', op(0.6)));
  P.sparkle = svg(32, 32, g1('g', '#ffffff', 0.5) + circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#ffffff', SO('#fff6dc', 0.8)) + circ(16, 16, 2.6, '#ffffff'));
  {
    const wing = (sx, col, sh) => `<g transform="translate(16 16) scale(${sx} 1)">${pth('M1 -1C4 -12 14 -12 14 -5C14 0 8 2 1 1Z', col, SO(sh, 1.3))}${pth('M1 1C7 1 12 4 10 9C8 12 3 10 1 3Z', lt(col, 0.25), SO(sh, 1.3))}${circ(8, -5.5, 2, '#ffffff', op(0.8))}${stk('M3 -2C6 -8 11 -8 12 -5', '#ffffff', 0.7, ' stroke-dasharray="1.5 1.3"' + op(0.8))}</g>`;
    P.butterfly = svg(32, 32, wing(1, '#a9d8f2', '#5f93b8') + wing(-1, '#a9d8f2', '#5f93b8') + rrect(15, 8, 2.2, 16, 1.1, '#5a4a6a') + stk('M16 9Q14 5 12 4M16 9Q18 5 20 4', '#5a4a6a', 0.9) + circ(12, 4, 0.9, '#5a4a6a') + circ(20, 4, 0.9, '#5a4a6a'));
  }
  P.feather = svg(32, 32, `<g transform="rotate(-35 16 16)">${pth('M16 3C21 8 22 17 17 28L15 28C10 17 11 8 16 3Z', '#fffcf6', SO('#ddd0e0', 1.2))}${pth('M16 3C21 8 22 17 17 28L16 28Z', '#f1eaf4', op(0.8))}${stk('M16 6V29', '#cdbbd0', 1)}${stk('M16 12L20 9M16 16L21 13M16 20L20 18M16 12L12 9M16 16L11 13M16 20L12 18', '#e9e0ec', 0.8)}</g>`);
  P.confetti = svg(16, 16, `<g transform="rotate(18 8 8)">${rect(3, 3, 10, 10, '#9fd6f2', SO('#5f9ec4', 0.8))}${pth('M3 3L13 3L3 13Z', '#c4e7f8')}</g>`);
  P.leaf = svg(32, 32, (() => { const lf = leafD(5, 26, -45, 26, 8); return `<g transform="translate(1.5 1.5)">${pth(lf.d, '#3f6a4a', op(0.2))}</g>` + pth(lf.d, '#9fd08b', SO('#5e9467', 1.4)) + pth(lf.half, '#7fbf76', op(0.6)) + stk(lf.vein, '#d2f0bc', 1); })());
  P.star = svg(32, 32, g1('t', '#eaf8b8', 0.5) + circ(16, 16, 15, 'url(#t)') + starR(16, 16.8, 10, '#e6f6ae') + circ(14, 14, 1.6, '#ffffff', op(0.9)));
  P.firefly = svg(32, 32, g1('f', '#ffe08a', 0.9) + circ(16, 16, 15, 'url(#f)') + circ(16, 16, 4, '#fff2c0') + circ(15, 15, 1.6, '#ffffff'));
  P.puff = svg(32, 32, `<g fill="#e6e4f0">${circ(11, 18, 7.6)}${circ(20.5, 18, 8.2)}${circ(16, 12, 7.6)}</g><g fill="#ffffff">${circ(11, 17, 6.4)}${circ(20.5, 16.8, 7)}${circ(15.6, 11.2, 6.4)}</g>` + ell(13, 9, 2.8, 1.6, '#ffffff'));
  P.ring = svg(32, 32, circ(16, 16, 12.5, 'none', SO('#ffffff', 2.2)) + circ(16, 16, 9.5, 'none', SO('#ffffff', 0.8) + op(0.45)));
  return P;
}

// ---------- write everything ----------
const KEYS = ['skyTop', 'skyBottom', 'floorFar', 'floorNear', 'path', 'pathEdge', 'divider', 'vig'];
const pal = {};
for (const b of BI) {
  write(`levels/${b}/sky.svg`, sky(b));
  write(`levels/${b}/far.svg`, far(b));
  props(b).forEach((p, i) => write(`levels/${b}/prop_${i}.svg`, p));
  pal[b] = Object.fromEntries(KEYS.map(k => [k, Z[b][k]]));
}
write('levels/palette.json', JSON.stringify(pal, null, 2) + '\n');
const P = particles();
for (const [k, v] of Object.entries(P)) write(`particles/${k}.svg`, v);
console.log(`wrote ${BI.length * 6} level files + palette.json + ${Object.keys(P).length} particles to ${OUT}`);
