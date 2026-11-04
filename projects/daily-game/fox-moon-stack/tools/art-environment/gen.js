// Juno's Moon Stack: environment art generator (4 planets + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg     960x540 opaque, tiles in x. Hero bodies in the upper half; x 380–580 below y 150 stays calm.
//  - levels/<zone>/far.svg     960x540, transparent above ~y 320, horizon silhouettes, opaque below y 440, tiles in x.
//  - levels/<zone>/ground.svg  960x180, surface line y 40 (flat for x 300–660), opaque soil below, props at the sides.
//  - particles/*.svg           32x32, centred, transparent edges.
// Tileability: every shape that crosses an edge is emitted again at ±960 (wrap); every profile is a sum of sines with
// whole periods over 960 px (or is exactly 40 at both ends for the ground), so the first and last columns match.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960, H = 540, GH = 180, SURF = 40;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#120c2a', t);   // outline / shade: dark violet tone of the fill, never black
const lite = (c, t = 0.3) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.4], ['1', col, 0]]);
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, k = 0.22) => {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, nx = cx + Math.cos(b) * R, ny = cy + Math.sin(b) * R;
    const m = a + Math.PI / 4, qx = cx + Math.cos(m) * R * k, qy = cy + Math.sin(m) * R * k;
    d += (i ? '' : `M${f(x)} ${f(y)}`) + `Q${f(qx)} ${f(qy)} ${f(nx)} ${f(ny)}`;
  }
  return d + 'Z';
};
// emit a shape at x, x-960, x+960 when it would be visible (seamless tiling)
const wrap = (x, rr, fn) => [-W, 0, W].map(dx => x + dx).filter(X => X + rr > 0 && X - rr < W).map(fn).join('');
// emit a whole group (absolute coords) again shifted by ±960 when it crosses an edge
const wrapG = (x0, x1, body) => body + (x0 < 0 ? `<g transform="translate(${W} 0)">${body}</g>` : '') + (x1 > W ? `<g transform="translate(${-W} 0)">${body}</g>` : '');
const prof = (base, terms) => x => base + terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const profPath = (fy, yBottom, step = 4, x0 = 0, x1 = W) => { let d = `M${x0} ${yBottom}`; for (let x = x0; x <= x1 + 0.01; x += step) d += `L${f(x)} ${f(fy(x))}`; return d + `L${x1} ${yBottom}Z`; };
const profLine = (fy, step = 4, x0 = 0, x1 = W) => { let d = ''; for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + f(x) + ' ' + f(fy(x)); return d; };
const blob = pts => { const n = pts.length, mid = i => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2]; let [mx, my] = mid(n - 1); let d = `M${f(mx)} ${f(my)}`; for (let i = 0; i < n; i++) { const [qx, qy] = mid(i); d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(qx)} ${f(qy)}`; } return d + 'Z'; };
const roundBlob = (cx, cy, rx, ry, n, jit, R) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, q = 1 + (R() - 0.5) * jit; pts.push([cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]); } return blob(pts); };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// Calm column: x 380–580 below y 150 only gets tiny dim stars.
const inCalm = (x, y, pad = 0) => x > 380 - pad && x < 580 + pad && y > 150 - pad;
// starfield (wrap-safe). Stars in the calm column are shrunk and dimmed.
function stars(R, n, y0, y1, col, rmin, rmax, aMin = 0.35, aMax = 0.9, avoid = []) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = y0 + R() * (y1 - y0); let r = rmin + R() * (rmax - rmin), a = aMin + R() * (aMax - aMin);
    if (avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
    if (inCalm(x, y, 6)) { r = Math.min(r, 0.8); a = Math.min(a, 0.3); }
    s += wrap(x, r, X => circ(X, y, r, col, op(f(a))));
  }
  return s;
}
// a few bigger 4-point twinkles, never in the calm column
function twinkles(R, n, y0, y1, col, rmin, rmax, avoid = []) {
  let s = '', k = 0;
  while (k < n) {
    const x = 20 + R() * (W - 40), y = y0 + R() * (y1 - y0), r = rmin + R() * (rmax - rmin);
    if (inCalm(x, y, 30) || avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
    s += circ(x, y, r * 1.6, col, op(0.12)) + pth(twinkle(x, y, r, 0.2), col, op(0.85)); k++;
  }
  return s;
}
// soft nebula cloud: a few overlapping radial blobs (wrap-safe)
const nebula = (id, x, y, rx, ry, col, a) => wrap(x, rx, X => ell(X, y, rx, ry, `url(#${id})`)) + '';
const nebDef = (id, col, a) => rad(id, [['0', col, a], ['0.55', col, a * 0.45], ['1', col, 0]]);

// ground surface: y 40 at 0, 300..660 and 960; gentle mounds (zero slope at the joints) at the sides
const surfY = (amp1, amp2) => x => {
  if (x <= 300) return SURF - amp1 * Math.pow(Math.sin(Math.PI * x / 300), 2);
  if (x >= 660) return SURF - amp2 * Math.pow(Math.sin(Math.PI * (x - 660) / 300), 2);
  return SURF;
};
// shared ground body: soil gradient, surface lip and outline, embedded pebbles (wrap-safe)
function groundBase(id, top, mid, bottom, sy, R, pebbleCol, nPebbles = 26) {
  const defs = lin(id, [['0', top], ['0.12', top], ['0.45', mid], ['0.8', bottom], ['1', bottom]], 0, SURF - 8, 0, GH - 20, ' gradientUnits="userSpaceOnUse"');
  let b = pth(profPath(sy, GH + 2, 4), `url(#${id})`);
  // lighter dusty lip just under the surface
  b += stk(profLine(x => sy(x) + 5), lite(top, 0.18), 6, op(0.55));
  // embedded pebbles/strata (below y 60, avoid the very bottom band so groundBottom stays clean)
  for (let i = 0; i < nPebbles; i++) {
    const x = R() * W, y = 66 + R() * 80, rx = 5 + R() * 14, ry = rx * (0.35 + R() * 0.2);
    b += wrap(x, rx + 2, X => ell(X, y, rx, ry, pebbleCol, op(f(0.28 + R() * 0.25))));
  }
  b += rect(0, 160, W, 22, bottom);
  return { defs, b };
}
const surfOutline = (sy, col) => stk(profLine(sy), col, 3);

// =====================================================================================
// MOON BASE: lavender-grey moon, a friendly blue-green home world in the sky
// =====================================================================================
function moon() {
  const R = rng(101);
  // ---- sky
  let defs = lin('ms', [['0', '#11163a'], ['0.3', '#1a1f4a'], ['0.7', '#262c62'], ['1', '#323874']])
    + nebDef('mn1', '#5a5fae', 0.22) + nebDef('mn2', '#3d7a9e', 0.16)
    + glow('msun', '#ffe7b0', 0.42) + glow('matm', '#8fe0e8', 0.35)
    + rad('mocean', [['0', '#56a9c6'], ['0.7', '#3d8fb0'], ['1', '#2f7395']], ' cx="0.38" cy="0.35" r="0.75"')
    + rad('mshade', [['0', '#0e1638', 0], ['0.62', '#0e1638', 0], ['1', '#0e1638', 0.55]], ' cx="0.32" cy="0.3" r="0.85"')
    + `<clipPath id="mpc"><circle cx="760" cy="128" r="92"/></clipPath>`;
  let b = rect(0, 0, W, H, 'url(#ms)');
  b += nebula('mn1', 180, 210, 300, 120) + nebula('mn2', 880, 330, 260, 110) + nebula('mn1', 640, 40, 220, 70);
  const avoid = [[760, 128, 130], [150, 70, 40]];
  b += stars(R, 170, 0, 540, '#dfe4ff', 0.5, 1.5, 0.25, 0.8, avoid);
  b += twinkles(R, 9, 10, 300, '#f3f1ff', 4, 7, avoid);
  // little sun glow (upper left)
  b += circ(150, 70, 70, 'url(#msun)') + circ(150, 70, 17, '#fff0c4') + circ(146, 66, 9, '#fffbe8');
  // a tiny lilac moon
  b += circ(312, 58, 11, '#9e98cf', OL('#6e68a3', 2)) + circ(308, 55, 3, '#b7b2dd') + circ(316, 62, 2, '#837db8');
  // the home world: ocean + invented blobby islands + cloud swirls, gentle sleepy smile
  b += circ(760, 128, 132, 'url(#matm)');
  let land = '';
  const RL = rng(7);
  for (const [x, y, rx, ry] of [[712, 86, 40, 26], [800, 160, 46, 30], [835, 72, 22, 16], [700, 172, 22, 14], [770, 118, 14, 10]]) {
    const d = roundBlob(x, y, rx, ry, 9, 0.5, RL);
    land += pth(d, '#6fbf8a') + pth(roundBlob(x - rx * 0.15, y - ry * 0.2, rx * 0.55, ry * 0.45, 7, 0.4, RL), '#8fd29e', op(0.8));
  }
  let clouds = '';
  for (const [x, y, w] of [[690, 120, 60], [800, 98, 70], [745, 190, 66], [840, 140, 34]]) clouds += stk(`M${x} ${y}q${f(w * 0.3)} -9 ${f(w * 0.55)} -2q${f(w * 0.25)} 7 ${f(w * 0.45)} -3`, '#f2f8ff', 6, op(0.55));
  b += `<g clip-path="url(#mpc)">` + circ(760, 128, 92, 'url(#mocean)') + land + clouds + circ(760, 128, 92, 'url(#mshade)') + '</g>';
  b += circ(760, 128, 92, 'none', OL('#2a5d85', 3));
  b += pth('M700 68A80 80 0 0 1 760 42', 'none', OL('#d8f6ff', 4) + op(0.55));
  // face: closed happy eyes, a small smile, rosy cheeks
  b += stk('M726 128q8 -8 16 0M778 128q8 -8 16 0', '#1f4a6a', 3.5) + stk('M748 146q12 10 24 0', '#1f4a6a', 3.5)
    + ell(722, 145, 9, 5, '#ff9fb8', op(0.55)) + ell(798, 145, 9, 5, '#ff9fb8', op(0.55));
  write('levels/moon/sky.svg', svg(W, H, b, defs));

  // ---- far: two soft crater-rim ridges + a little moon base dome
  defs = lin('mfa', [['0', '#2d3268'], ['1', '#262a5a']]) + lin('mfb', [['0', '#363b74'], ['1', '#2b2f62']]) + glow('mfl', '#ffe2a0', 0.4);
  b = '';
  const backY = prof(392, [[16, 2, 0.6], [9, 5, 1.7], [4, 11, 0.3]]);
  b += pth(profPath(backY, H + 2), 'url(#mfa)');
  // dome on the back ridge (left) and a tiny one (right), both outside the tower column
  const dome = (x, y, r) => pth(`M${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`, '#3f4682', OL('#2a2f62', 2.5))
    + pth(`M${f(x - r * 0.6)} ${f(y - r * 0.55)}A${f(r)} ${f(r)} 0 0 1 ${f(x - r * 0.05)} ${f(y - r * 0.95)}`, 'none', OL('#6a72b0', 2) + op(0.5))
    + circ(x - r * 0.3, y - r * 0.3, 2.2, '#e8cf8e', op(0.7)) + circ(x + r * 0.2, y - r * 0.35, 2.2, '#e8cf8e', op(0.7)) + rect(x - r - 6, y - 3, r * 2 + 12, 6, '#323770', ' rx="3"');
  b += circ(150, backY(150) - 10, 46, 'url(#mfl)') + dome(150, backY(150) + 4, 30) + stk(`M${190} ${f(backY(190) + 2)}L190 ${f(backY(190) - 34)}`, '#3f4682', 2.5) + circ(190, backY(190) - 36, 2.5, '#e89aa8', op(0.7));
  b += dome(820, backY(820) + 4, 16);
  // front crater rims: bumpy ridge with a few crater bowls (darker ellipses) in it
  const frontY = prof(432, [[12, 3, 2.1], [7, 7, 0.4], [3, 13, 1.2]]);
  b += pth(profPath(frontY, H + 2), 'url(#mfb)');
  for (const [x, rx] of [[80, 46], [330, 34], [640, 40], [900, 30]]) b += wrap(x, rx, X => ell(X, frontY(X) + 14, rx, 7, '#2a2e60', op(0.8)) + pth(`M${f(X - rx)} ${f(frontY(X) + 14)}A${f(rx)} 7 0 0 1 ${f(X + rx)} ${f(frontY(X) + 14)}`, 'none', OL('#41477e', 2) + op(0.7)));
  b += rect(0, 500, W, 42, '#2b2f62');
  write('levels/moon/far.svg', svg(W, H, b, defs));

  // ---- ground: lavender-grey moon dust, craters, a cute rover, a little satellite dish
  const RG = rng(31);
  const sy = surfY(6, 5);
  const g = groundBase('mg', '#8d8fb8', '#6a6c9a', '#4a4c7e', sy, RG, '#5d5f8e');
  b = g.b;
  // small craters on the surface (drawn as dished rims)
  const crater = (x, rx) => ell(x, sy(x) + 4, rx, rx * 0.22, '#6a6c99') + pth(`M${f(x - rx)} ${f(sy(x) + 4)}A${f(rx)} ${f(rx * 0.22)} 0 0 0 ${f(x + rx)} ${f(sy(x) + 4)}`, 'none', OL('#a9abd0', 2));
  for (const [x, rx] of [[60, 18], [262, 12], [700, 14], [905, 20], [140, 8]]) b += crater(x, rx);
  b += surfOutline(sy, '#5a5c8c');
  // rover (x ≈ 170): rounded lilac body, 3 wheels, antenna with a ball, two friendly headlight "eyes"
  const rx0 = 170, ry0 = sy(170);
  b += ell(rx0, ry0 + 1, 34, 4, '#4f5182', op(0.5));
  b += rect(rx0 - 28, ry0 - 26, 56, 16, '#c9c3f0', OL('#5d5a96', 3) + ' rx="7"') + rect(rx0 - 22, ry0 - 24, 30, 5, '#e7e3ff', ' rx="2.5"' + op(0.8));
  b += rect(rx0 + 8, ry0 - 34, 20, 10, '#b3abe6', OL('#5d5a96', 2.5) + ' rx="4"');
  b += circ(rx0 + 14, ry0 - 29, 2.6, '#3a3a6a') + circ(rx0 + 22, ry0 - 29, 2.6, '#3a3a6a') + circ(rx0 + 14.8, ry0 - 29.8, 0.9, '#ffffff') + circ(rx0 + 22.8, ry0 - 29.8, 0.9, '#ffffff');
  b += stk(`M${rx0 - 16} ${f(ry0 - 26)}L${rx0 - 20} ${f(ry0 - 38)}`, '#5d5a96', 2) + circ(rx0 - 20, ry0 - 39, 2.8, '#f5a8c0', OL('#a05a7a', 1.2));
  for (const wx of [-19, 0, 19]) b += circ(rx0 + wx, ry0 - 6, 6.5, '#55578a', OL('#33356a', 2.5)) + circ(rx0 + wx, ry0 - 6, 2.2, '#9a9cc8');
  // satellite dish (x ≈ 800)
  const dx0 = 800, dy0 = sy(800);
  b += ell(dx0, dy0 + 1, 18, 3, '#4f5182', op(0.5));
  b += pth(`M${dx0 - 9} ${f(dy0)}L${dx0} ${f(dy0 - 16)}L${dx0 + 9} ${f(dy0)}Z`, '#8a86c0', OL('#4f4c86', 2.5));
  b += `<g transform="rotate(-28 ${dx0} ${f(dy0 - 20)})">` + pth(`M${dx0 - 18} ${f(dy0 - 26)}Q${dx0} ${f(dy0 - 6)} ${dx0 + 18} ${f(dy0 - 26)}Z`, '#d8d4f6', OL('#5d5a96', 2.5))
    + stk(`M${dx0} ${f(dy0 - 18)}L${dx0} ${f(dy0 - 34)}`, '#5d5a96', 2) + circ(dx0, dy0 - 35, 2.4, '#8fe0e8') + '</g>';
  b += stk(`M${dx0 + 24} ${f(dy0)}L${dx0 + 24} ${f(dy0 - 12)}`, '#5d5a96', 2) + circ(dx0 + 24, dy0 - 13, 2, '#ffd27a', op(0.85));
  // a few moon rocks
  for (const [x, r] of [[110, 6], [235, 4], [880, 5], [730, 4]]) b += ell(x, sy(x) - r * 0.4, r * 1.3, r, '#9d9fc6', OL('#5a5c8c', 2));
  write('levels/moon/ground.svg', svg(W, GH, b, g.defs));
}

// =====================================================================================
// RUSTY DUNES: red-orange desert planet, two small moons, warm sunset glow
// =====================================================================================
function dunes() {
  const R = rng(202);
  let defs = lin('ds', [['0', '#1a0e2c'], ['0.3', '#2a1638'], ['0.6', '#47213f'], ['0.85', '#6c3446'], ['1', '#7e3e48']])
    + rad('dglow', [['0', '#f08a5d', 0.5], ['0.5', '#d0705a', 0.18], ['1', '#d0705a', 0]]) + nebDef('dn1', '#8a3e6a', 0.2)
    + rad('dm1', [['0', '#e2b0a4'], ['1', '#b77a78']], ' cx="0.38" cy="0.35"') + rad('dm2', [['0', '#d6b4dc'], ['1', '#a985b6']], ' cx="0.38" cy="0.35"')
    + glow('dmg', '#f0b8b0', 0.2);
  let b = rect(0, 0, W, H, 'url(#ds)');
  b += nebula('dn1', 620, 90, 280, 80) + nebula('dn1', 80, 250, 220, 70);
  // sunset glow along the horizon (wraps)
  b += wrap(250, 520, X => ell(X, 560, 520, 230, 'url(#dglow)')) + wrap(800, 380, X => ell(X, 570, 380, 170, 'url(#dglow)', op(0.6)));
  const avoid = [[190, 100, 70], [318, 160, 30]];
  b += stars(R, 140, 0, 380, '#ffe6d8', 0.5, 1.4, 0.25, 0.75, avoid);
  b += twinkles(R, 7, 10, 260, '#fff0e0', 4, 6.5, avoid);
  // two little moons
  b += circ(190, 100, 70, 'url(#dmg)') + circ(190, 100, 36, 'url(#dm1)', OL('#82525a', 3));
  for (const [x, y, r] of [[176, 88, 7], [204, 112, 5], [200, 84, 3.5], [172, 114, 3]]) b += circ(x, y, r, '#a86e70', op(0.7)) + pth(`M${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}`, 'none', OL('#f0d0c8', 1.2) + op(0.6));
  b += pth('M165 82A30 30 0 0 1 188 68', 'none', OL('#f8e4e0', 3) + op(0.5));
  b += circ(318, 160, 16, 'url(#dm2)', OL('#755a8a', 2.5)) + circ(313, 156, 3.5, '#bb97c4', op(0.8)) + circ(323, 165, 2.4, '#bb97c4', op(0.8));
  // a far-off pale ringed speck (top right) for depth
  b += circ(840, 70, 6, '#c49ab0', op(0.7)) + ell(840, 70, 12, 3, 'none', OL('#c49ab0', 1.4) + op(0.55));
  write('levels/dunes/sky.svg', svg(W, H, b, defs));

  // ---- far: mesa rocks + rolling dunes
  defs = lin('dfa', [['0', '#55253f'], ['1', '#43203a']]) + lin('dfb', [['0', '#6a2f40'], ['1', '#4e2438']]);
  b = '';
  const mesa = (x, w, top, base) => pth(`M${f(x - w / 2 - 22)} ${base}L${f(x - w / 2)} ${top + 6}Q${f(x - w / 2)} ${top} ${f(x - w / 2 + 8)} ${top}L${f(x + w / 2 - 8)} ${top}Q${f(x + w / 2)} ${top} ${f(x + w / 2)} ${top + 6}L${f(x + w / 2 + 22)} ${base}Z`, '#4c223b')
    + pth(`M${f(x + w * 0.1)} ${top}L${f(x + w / 2 - 8)} ${top}Q${f(x + w / 2)} ${top} ${f(x + w / 2)} ${top + 6}L${f(x + w / 2 + 22)} ${base}L${f(x + w * 0.2)} ${base}Z`, '#43203a')
    + stk(`M${f(x - w / 2 + 6)} ${top + 1.5}L${f(x + w * 0.1)} ${top + 1.5}`, '#7a3c4c', 2, op(0.7))
    + stk(`M${f(x - w / 2 - 6)} ${f(top + (base - top) * 0.5)}L${f(x + w / 2 + 8)} ${f(top + (base - top) * 0.5)}`, '#5a2a42', 2, op(0.6));
  for (const [x, w, top] of [[120, 120, 352], [300, 60, 380], [760, 150, 340], [930, 70, 372]]) b += wrapG(x - w / 2 - 24, x + w / 2 + 24, mesa(x, w, top, 470));
  const duneA = prof(430, [[14, 2, 0.2], [8, 4, 2.4], [3, 9, 1.0]]);
  b += pth(profPath(duneA, H + 2), 'url(#dfa)');
  b += stk(profLine(x => duneA(x) + 2), '#7a3a4a', 2, op(0.6));
  const duneB = prof(462, [[10, 3, 1.4], [6, 5, 0.1]]);
  b += pth(profPath(duneB, H + 2), 'url(#dfb)');
  b += stk(profLine(x => duneB(x) + 2), '#83424c', 2, op(0.55));
  b += rect(0, 500, W, 42, '#4e2438');
  write('levels/dunes/far.svg', svg(W, H, b, defs));

  // ---- ground: rust sand, round rock pillars, crystal cactus plants
  const RG = rng(41);
  const sy = surfY(7, 6);
  const g = groundBase('dg', '#c0603e', '#9a4a34', '#6e3028', sy, RG, '#8a3f2e');
  b = g.b;
  // wind ripples on the sand
  for (let i = 0; i < 14; i++) { const x = RG() * W, y = 56 + RG() * 40, w = 18 + RG() * 24; b += wrap(x, w, X => stk(`M${f(X - w / 2)} ${f(y)}q${f(w / 2)} -4 ${f(w)} 0`, '#d77a52', 2, op(0.45))); }
  b += surfOutline(sy, '#7e3a2a');
  // round rock pillar (stacked rounded stones)
  const pillar = (x, s) => {
    const y = sy(x); let o = ell(x, y + 1, 22 * s, 3.5, '#6e3028', op(0.45));
    o += ell(x, y - 8 * s, 20 * s, 10 * s, '#a85a48', OL('#6a2e28', 3)) + ell(x - 2 * s, y - 22 * s, 15 * s, 8 * s, '#b86a52', OL('#6a2e28', 3)) + ell(x + 1 * s, y - 33 * s, 10 * s, 6 * s, '#c47a5e', OL('#6a2e28', 3));
    o += ell(x - 7 * s, y - 11 * s, 6 * s, 2.5 * s, '#d08a6e', op(0.6)) + ell(x - 6 * s, y - 25 * s, 5 * s, 2 * s, '#d89478', op(0.6)) + ell(x - 2 * s, y - 35 * s, 3.5 * s, 1.6 * s, '#e0a088', op(0.6));
    return o;
  };
  b += pillar(90, 1.0) + pillar(880, 1.05) + pillar(275, 0.6);
  // crystal cactus: muted teal-violet crystal stem with two arms and a glowing tip
  const cactus = (x, s, col) => {
    const y = sy(x), c2 = dark(col, 0.35), lc = lite(col, 0.35);
    let o = ell(x, y + 1, 14 * s, 3, '#6e3028', op(0.4));
    const shard = (cx, by, w, h) => pth(`M${f(cx - w / 2)} ${f(by)}L${f(cx - w / 2)} ${f(by - h + w * 0.6)}L${f(cx)} ${f(by - h)}L${f(cx + w / 2)} ${f(by - h + w * 0.6)}L${f(cx + w / 2)} ${f(by)}Z`, col, OL(c2, 2.5)) + pth(`M${f(cx)} ${f(by - h)}L${f(cx + w / 2)} ${f(by - h + w * 0.6)}L${f(cx + w / 2)} ${f(by)}L${f(cx)} ${f(by)}Z`, c2, op(0.45));
    o += stk(`M${f(x - 4 * s)} ${f(y - 12 * s)}L${f(x - 12 * s)} ${f(y - 14 * s)}M${f(x + 4 * s)} ${f(y - 18 * s)}L${f(x + 12 * s)} ${f(y - 20 * s)}`, c2, 3 * s);
    o += shard(x - 13 * s, y - 12 * s, 7 * s, 14 * s) + shard(x + 13 * s, y - 18 * s, 7 * s, 14 * s) + shard(x, y, 10 * s, 36 * s);
    o += circ(x, y - 36 * s, 3 * s, lc, op(0.8)) + stk(`M${f(x - 2.5 * s)} ${f(y - 6 * s)}L${f(x - 2.5 * s)} ${f(y - 26 * s)}`, lc, 1.5, op(0.6));
    return o;
  };
  b += cactus(200, 1.0, '#5a9a94') + cactus(760, 0.9, '#8a78b8') + cactus(40, 0.6, '#5a9a94');
  for (const [x, r] of [[140, 4], [725, 5], [930, 4], [250, 3]]) b += ell(x, sy(x) - r * 0.4, r * 1.3, r, '#a8553c', OL('#6a2e28', 2));
  write('levels/dunes/ground.svg', svg(W, GH, b, g.defs));
}

// =====================================================================================
// RING WORLD: the teal moon of a huge ringed gas giant, icy and glassy
// =====================================================================================
function rings() {
  const R = rng(303);
  const PX = 830, PY = 140, PR = 158, ROT = 14;
  let defs = lin('rs', [['0', '#081a2c'], ['0.35', '#0d2238'], ['0.7', '#133650'], ['1', '#1a4558']])
    + nebDef('rn1', '#2f8a90', 0.18) + nebDef('rn2', '#3a5a9e', 0.16)
    + rad('rpshade', [['0', '#0a1a30', 0.12], ['0.55', '#0a1a30', 0.25], ['1', '#0a1a30', 0.72]], ' cx="0.3" cy="0.28" r="0.85"')
    + glow('ratm', '#7ac8c0', 0.2)
    + `<clipPath id="rpc"><circle cx="${PX}" cy="${PY}" r="${PR}"/></clipPath>`
    // front half of the ring = below the ring's centre line (in the ring's rotated frame)
    + `<clipPath id="rfront"><rect x="${PX - 420}" y="${PY}" width="840" height="300" transform="rotate(${ROT} ${PX} ${PY})"/></clipPath>`;
  let b = rect(0, 0, W, H, 'url(#rs)');
  b += nebula('rn1', 200, 120, 260, 100) + nebula('rn2', 420, 300, 300, 90) + nebula('rn1', 900, 420, 240, 80);
  const avoid = [[PX, PY, PR + 30], [PX - W, PY, PR + 30]];
  b += stars(R, 170, 0, 540, '#d8fbff', 0.5, 1.5, 0.25, 0.8, avoid);
  b += twinkles(R, 8, 10, 320, '#e8fdff', 4, 6.5, avoid);
  // giant: atmosphere glow, back ring, banded body, front ring
  const ringStrokes = (a) => [[272, 52, '#b8987e', 9, 0.7], [250, 47, '#cdb093', 5, 0.75], [296, 58, '#7fa8a6', 4.5, 0.55], [313, 62, '#a6c4c0', 2.2, 0.45]]
    .map(([rx, ry, c, w, o]) => ell(PX, PY, rx, ry, 'none', OL(c, w) + op(f(o * a)) + ` transform="rotate(${ROT} ${PX} ${PY})"`)).join('');
  let giant = circ(PX, PY, PR + 50, 'url(#ratm)') + ringStrokes(0.75);
  let bands = circ(PX, PY, PR, '#b8937c');
  const bandCols = ['#c4a088', '#9e7468', '#5e9893', '#b8937c', '#4a8582', '#cbab92', '#93695f', '#69a19b', '#bf9a82'];
  for (let i = 0; i < 9; i++) { const y = PY - PR + i * (2 * PR / 9) + (i % 2 ? 6 : 0); bands += rect(PX - PR - 40, y, 2 * PR + 80, 2 * PR / 9 + 4, bandCols[i], ` transform="rotate(${ROT} ${PX} ${PY})"`); }
  // a gentle swirl storm (soft, not an eye)
  bands += ell(PX - 60, PY + 70, 30, 14, '#d8bca2', op(0.7) + ` transform="rotate(${ROT} ${PX} ${PY})"`) + ell(PX - 60, PY + 70, 16, 7, '#b8937c', op(0.8) + ` transform="rotate(${ROT} ${PX} ${PY})"`);
  giant += `<g clip-path="url(#rpc)">` + bands + circ(PX, PY, PR, 'url(#rpshade)') + '</g>' + circ(PX, PY, PR, 'none', OL('#6a5a68', 3) + op(0.7));
  giant += pth(`M${PX - 150} ${PY - 70}A${PR - 8} ${PR - 8} 0 0 1 ${PX - 50} ${PY - PR + 14}`, 'none', OL('#f0e2d0', 4) + op(0.3));
  giant += `<g clip-path="url(#rfront)">` + ringStrokes(1) + '</g>';
  b += wrapG(PX - 360, PX + 360, giant);
  // a tiny icy moonlet (left)
  b += circ(250, 70, 9, '#a8dde0', OL('#5a9aa6', 2)) + circ(247, 67, 2.5, '#d8f4f4');
  write('levels/rings/sky.svg', svg(W, H, b, defs));

  // ---- far: icy ridges with faint snow caps
  defs = lin('rfa', [['0', '#1c4256'], ['1', '#15344a']]) + lin('rfb', [['0', '#22506a'], ['1', '#1a3e54']]);
  b = '';
  // jagged ridge = sum of sines plus a sharpened triangle wave (whole periods)
  const tri = (x, k) => { const t = (x * k / W) % 1; return Math.abs(t - 0.5) * 2; };
  const backY = x => 380 + 26 * tri(x + 40, 7) + 10 * Math.sin(2 * Math.PI * 2 * x / W + 0.7) - 8 * Math.sin(2 * Math.PI * 5 * x / W);
  b += pth(profPath(backY, H + 2, 3), 'url(#rfa)');
  b += stk(profLine(x => backY(x) + 1.5, 3), '#5a8ea0', 2, op(0.45));
  const frontY = x => 432 + 20 * tri(x + 110, 9) + 8 * Math.sin(2 * Math.PI * 3 * x / W + 2.0);
  b += pth(profPath(frontY, H + 2, 3), 'url(#rfb)');
  b += stk(profLine(x => frontY(x) + 1.5, 3), '#6aa6b6', 2, op(0.45));
  // snow caps on a few peaks (outside the tower column)
  for (let k = 0; k < 9; k++) { const px = ((k + 0.5) / 9 * W - 110 + W) % W; if (px > 360 && px < 600) continue; const py = frontY(px); b += wrap(px, 14, X => pth(`M${f(X - 12)} ${f(py + 10)}L${f(X)} ${f(py)}L${f(X + 12)} ${f(py + 10)}Q${f(X + 4)} ${f(py + 6)} ${f(X)} ${f(py + 9)}Q${f(X - 4)} ${f(py + 6)} ${f(X - 12)} ${f(py + 10)}Z`, '#7fb6c4', op(0.5))); }
  b += rect(0, 500, W, 42, '#1a3e54');
  write('levels/rings/far.svg', svg(W, H, b, defs));

  // ---- ground: icy teal crust, ice crystals, frozen pond
  const RG = rng(51);
  const sy = surfY(5, 6);
  const g = groundBase('rg', '#5fa8b8', '#457f92', '#2c5a6c', sy, RG, '#3d7486');
  b = g.b;
  // frosty cracks
  for (let i = 0; i < 10; i++) { const x = RG() * W, y = 60 + RG() * 70, w = 16 + RG() * 22; b += wrap(x, w, X => stk(`M${f(X - w / 2)} ${f(y)}l${f(w * 0.3)} -4l${f(w * 0.25)} 6l${f(w * 0.45)} -3`, '#7cc4d0', 1.6, op(0.45))); }
  // frozen pond (x ≈ 760): flat glassy ellipse set into the surface
  b += ell(770, sy(770) + 6, 58, 7, '#9fe2ea', OL('#3f8496', 2.5)) + ell(752, sy(752) + 5, 26, 2.5, '#e2fbff', op(0.7)) + stk(`M${790} ${f(sy(790) + 7)}l14 -2`, '#e2fbff', 1.6, op(0.7));
  b += surfOutline(sy, '#3a7888');
  // ice crystal cluster
  const crystals = (x, s) => {
    const y = sy(x); let o = ell(x, y + 1, 22 * s, 3, '#2c5a6c', op(0.4));
    const shard = (cx, h, w, ang, col) => `<g transform="rotate(${ang} ${f(cx)} ${f(y)})">` + pth(`M${f(cx - w / 2)} ${f(y)}L${f(cx - w / 2)} ${f(y - h + w * 0.7)}L${f(cx)} ${f(y - h)}L${f(cx + w / 2)} ${f(y - h + w * 0.7)}L${f(cx + w / 2)} ${f(y)}Z`, col, OL('#3f8496', 2.5)) + pth(`M${f(cx)} ${f(y - h)}L${f(cx + w / 2)} ${f(y - h + w * 0.7)}L${f(cx + w / 2)} ${f(y)}L${f(cx)} ${f(y)}Z`, '#7cbccc', op(0.5)) + stk(`M${f(cx - w * 0.2)} ${f(y - 4)}L${f(cx - w * 0.2)} ${f(y - h * 0.7)}`, '#f0ffff', 1.5, op(0.7)) + '</g>';
    o += shard(x - 12 * s, 22 * s, 10 * s, -22, '#a8e4ec') + shard(x + 12 * s, 26 * s, 10 * s, 20, '#a8e4ec') + shard(x, 38 * s, 13 * s, 0, '#c4f0f4');
    return o;
  };
  b += crystals(110, 1.0) + crystals(250, 0.6) + crystals(880, 0.95) + crystals(690, 0.5);
  for (const [x, r] of [[190, 5], [40, 4], [930, 4]]) b += ell(x, sy(x) - r * 0.4, r * 1.3, r, '#8ac8d4', OL('#3f8496', 2));
  write('levels/rings/ground.svg', svg(W, GH, b, g.defs));
}

// =====================================================================================
// COMET GARDEN: pink-violet icy comet, glowing crystal flowers, violet nebula, pink star cluster
// =====================================================================================
function comet() {
  const R = rng(404);
  let defs = lin('cs', [['0', '#140a30'], ['0.35', '#1e1040'], ['0.7', '#2c1756'], ['1', '#3a1f66']])
    + nebDef('cn1', '#7a3fa8', 0.26) + nebDef('cn2', '#b04f9a', 0.16) + nebDef('cn3', '#4a3fa0', 0.2)
    + glow('ccl', '#ff9fd0', 0.45) + lin('ctail', [['0', '#ffd6ec', 0.6], ['0.6', '#e8a8d8', 0.2], ['1', '#e8a8d8', 0]], 0, 0, 1, 0);
  let b = rect(0, 0, W, H, 'url(#cs)');
  b += nebula('cn1', 260, 140, 340, 130) + nebula('cn2', 180, 110, 180, 70) + nebula('cn3', 760, 260, 300, 110) + nebula('cn1', 900, 470, 260, 90) + nebula('cn2', 660, 60, 200, 60);
  const avoid = [[230, 110, 60]];
  b += stars(R, 170, 0, 540, '#ffe6f6', 0.5, 1.5, 0.25, 0.8, avoid);
  b += twinkles(R, 7, 10, 300, '#fff0fa', 4, 6.5, avoid);
  // pink glowing star cluster
  b += circ(230, 110, 90, 'url(#ccl)');
  const RC = rng(9);
  for (let i = 0; i < 26; i++) { const a = RC() * Math.PI * 2, d = Math.pow(RC(), 0.7) * 52, x = 230 + Math.cos(a) * d, y = 110 + Math.sin(a) * d * 0.8, r = 0.8 + RC() * 1.8; b += circ(x, y, r, i % 3 ? '#ffd0ea' : '#ffffff', op(f(0.6 + RC() * 0.4))); }
  b += pth(twinkle(230, 110, 13, 0.18), '#fff2fa') + pth(twinkle(258, 92, 8, 0.2), '#ffd6ec', op(0.9)) + pth(twinkle(205, 132, 7, 0.2), '#ffd6ec', op(0.85));
  // a friendly little comet with a soft tail (upper right, heading left-down)
  b += `<g transform="rotate(-18 760 80)">` + pth('M760 70Q840 58 930 62Q850 80 930 98Q840 102 760 90Z', 'url(#ctail)') + pth('M760 76Q820 72 880 74Q820 80 880 86Q820 88 760 84Z', 'url(#ctail)') + '</g>';
  b += circ(760, 80, 26, 'url(#ccl)') + circ(760, 80, 10, '#fff0f8', OL('#e08ac0', 2)) + circ(757, 77, 3.5, '#ffffff');
  write('levels/comet/sky.svg', svg(W, H, b, defs));

  // ---- far: crystal spires
  defs = lin('cfa', [['0', '#33205e'], ['1', '#2a1850']]) + lin('cfb', [['0', '#3d2670'], ['1', '#30205a']]) + glow('cfg', '#ff9fd0', 0.35);
  b = '';
  const spire = (x, w, h, base, col, face, tip) => {
    const top = base - h;
    let s = pth(`M${f(x - w / 2)} ${base}L${f(x - w * 0.36)} ${f(top + w * 0.9)}L${f(x)} ${f(top)}L${f(x + w * 0.36)} ${f(top + w * 0.9)}L${f(x + w / 2)} ${base}Z`, col);
    s += pth(`M${f(x)} ${f(top)}L${f(x + w * 0.36)} ${f(top + w * 0.9)}L${f(x + w / 2)} ${base}L${f(x + w * 0.05)} ${base}Z`, face);
    if (tip) s += circ(x, top + 2, 16, 'url(#cfg)') + circ(x, top + 3, 2.2, '#f7b8de', op(0.8));
    return s;
  };
  const ridge = prof(430, [[12, 2, 1.1], [6, 5, 0.3]]);
  for (const [x, w, h, tip] of [[60, 34, 120, true], [120, 22, 80, false], [250, 30, 100, true], [330, 18, 60, false], [640, 20, 70, false], [700, 36, 130, true], [790, 24, 90, false], [880, 30, 110, true]])
    b += wrapG(x - w, x + w, spire(x, w, h, 470, '#33205e', '#2a1850', tip));
  b += pth(profPath(ridge, H + 2), 'url(#cfa)');
  b += stk(profLine(x => ridge(x) + 1.5), '#5a3e8e', 2, op(0.5));
  for (const [x, w, h] of [[160, 26, 50], [420, 14, 28], [560, 16, 32], [840, 22, 46]]) b += wrapG(x - w, x + w, spire(x, w, h, ridge(x) + 30, '#3d2670', '#33205e', false));
  const front = prof(468, [[8, 3, 2.2], [4, 7, 0.9]]);
  b += pth(profPath(front, H + 2), 'url(#cfb)');
  b += stk(profLine(x => front(x) + 1.5), '#64489a', 2, op(0.5));
  b += rect(0, 500, W, 42, '#30205a');
  write('levels/comet/far.svg', svg(W, H, b, defs));

  // ---- ground: pale violet comet ice, glowing crystal flowers, ice boulders
  const RG = rng(61);
  const sy = surfY(6, 6);
  const g = groundBase('cg', '#b79ad9', '#8566ae', '#5e4589', sy, RG, '#7a5ca6');
  defs = g.defs + glow('cfl', '#ff9fd0', 0.5);
  b = g.b;
  for (let i = 0; i < 18; i++) { const x = RG() * W, y = 56 + RG() * 90, r = 1 + RG() * 1.5; b += wrap(x, r, X => circ(X, y, r, '#e8d8ff', op(f(0.35 + RG() * 0.3)))); }
  b += surfOutline(sy, '#6e52a0');
  // ice boulder
  const boulder = (x, s) => { const y = sy(x); return ell(x, y + 1, 20 * s, 3, '#5e4589', op(0.45)) + pth(`M${f(x - 18 * s)} ${f(y)}Q${f(x - 20 * s)} ${f(y - 16 * s)} ${f(x - 6 * s)} ${f(y - 20 * s)}Q${f(x + 10 * s)} ${f(y - 24 * s)} ${f(x + 18 * s)} ${f(y - 10 * s)}Q${f(x + 20 * s)} ${f(y)} ${f(x + 18 * s)} ${f(y)}Z`, '#d6c6f2', OL('#7a5ca6', 3)) + pth(`M${f(x + 2 * s)} ${f(y - 21 * s)}Q${f(x + 14 * s)} ${f(y - 18 * s)} ${f(x + 18 * s)} ${f(y - 8 * s)}L${f(x + 17 * s)} ${f(y)}L${f(x + 4 * s)} ${f(y)}Z`, '#b7a2e0', op(0.6)) + ell(x - 8 * s, y - 13 * s, 5 * s, 2.2 * s, '#ffffff', op(0.6)); };
  b += boulder(60, 1.0) + boulder(900, 1.1) + boulder(700, 0.55);
  // glowing crystal flower: thin stem, two leaves, a 5-petal crystal head with a bright heart
  const flower = (x, s, col) => {
    const y = sy(x), hy = y - 30 * s;
    let o = circ(x, hy, 18 * s, 'url(#cfl)');
    o += stk(`M${x} ${f(y)}Q${f(x - 3 * s)} ${f(y - 15 * s)} ${x} ${f(hy)}`, '#7a5ca6', 2.5);
    o += pth(`M${f(x - 1 * s)} ${f(y - 10 * s)}q-9 -2 -11 -9q8 0 11 7Z`, '#8fd0c4', OL('#5a8a90', 1.5)) + pth(`M${f(x)} ${f(y - 16 * s)}q9 -2 11 -9q-8 0 -11 7Z`, '#8fd0c4', OL('#5a8a90', 1.5));
    for (let k = 0; k < 5; k++) { const a = -90 + k * 72; o += `<g transform="rotate(${a} ${x} ${f(hy)})">` + pth(`M${x} ${f(hy)}L${f(x + 4 * s)} ${f(hy - 3 * s)}L${f(x + 10 * s)} ${f(hy)}L${f(x + 4 * s)} ${f(hy + 3 * s)}Z`, col, OL(dark(col, 0.4), 1.5)) + '</g>'; }
    o += circ(x, hy, 2.8 * s, '#fff4fb');
    return o;
  };
  b += flower(140, 1.0, '#f4a6d6') + flower(185, 0.75, '#c8a8f4') + flower(250, 0.9, '#f4a6d6') + flower(780, 1.0, '#c8a8f4') + flower(830, 0.8, '#f4a6d6') + flower(20, 0.6, '#c8a8f4');
  write('levels/comet/ground.svg', svg(W, GH, b, defs));
}

// =====================================================================================
// PARTICLES (32x32, centred, transparent edges)
// =====================================================================================
function particles() {
  const P = (name, body, defs = '') => write(`particles/${name}.svg`, svg(32, 32, body, defs));
  const soft = (col, a = 0.5) => rad('g', [['0', col, a], ['1', col, 0]]);
  P('star', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 11, 5), '#fff3b8', OL('#d0a040', 1.8)) + circ(13.5, 14, 1.6, '#ffffff', op(0.85)), soft('#fff3b0', 0.45));
  P('sparkle', circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#f6f4ff', OL('#b8b0f0', 1)) + circ(16, 16, 2.2, '#ffffff'), soft('#d8d0ff', 0.6));
  P('puff', circ(16, 17, 14, 'url(#g)') + circ(12, 18, 6.5, '#ffffff', op(0.85)) + circ(19, 15, 7.5, '#ffffff', op(0.9)) + circ(17, 21, 6.5, '#e2def2', op(0.9)) + circ(12, 20, 5, '#ebe8f6', op(0.8)) + circ(17, 13.5, 3, '#ffffff'), soft('#ffffff', 0.45));
  P('dust', circ(16, 16, 14, 'url(#g)'), rad('g', [['0', '#ffb08a', 1], ['0.35', '#f08a5d', 0.65], ['1', '#e0704a', 0]]));
  const hexPts = (cx, cy, r) => { let d = ''; for (let i = 0; i < 6; i++) { const a = (i * 60 - 90) * Math.PI / 180; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * r) + ' ' + f(cy + Math.sin(a) * r); } return d + 'Z'; };
  P('ice', circ(16, 16, 15, 'url(#g)') + pth(hexPts(16, 16, 10), '#d4f8fc', OL('#5ab0c4', 1.8)) + pth(`M16 6L16 26M7.3 11L24.7 21M7.3 21L24.7 11`, 'none', OL('#8fd6e4', 1.2) + op(0.8)) + ell(12.5, 11.5, 2.5, 1.4, '#ffffff', op(0.9)), soft('#b8f0f8', 0.45));
  P('snow', circ(16, 16, 14, 'url(#g)') + circ(16, 16, 5, '#ffe2f2', op(0.95)), rad('g', [['0', '#ffd6ec', 0.9], ['0.5', '#ffc4e4', 0.4], ['1', '#ffc4e4', 0]]));
  P('heart', pth('M16 27Q5 19 5 12A5.5 5.5 0 0 1 16 10A5.5 5.5 0 0 1 27 12Q27 19 16 27Z', '#ff7aa6', OL('#b8487a', 2)) + ell(11, 12.5, 2.2, 1.6, '#ffffff', op(0.8) + ' transform="rotate(-30 11 12.5)"'));
  P('spark', circ(16, 16, 15, 'url(#g)') + pth('M16 7L19 16L16 25L13 16Z', '#ffd27a') + pth('M7 16L16 13.5L25 16L16 18.5Z', '#ffc060', op(0.8)) + circ(16, 16, 2.6, '#fff6dc'), rad('g', [['0', '#fff0c0', 0.95], ['0.3', '#ffb050', 0.6], ['0.7', '#ff9a3c', 0.15], ['1', '#ff9a3c', 0]]));
  P('coinbit', circ(16, 16, 14, 'url(#g)') + pth(star5(16, 17, 9, 4), '#ffd23f', OL('#c08a00', 1.6)) + circ(14, 14.5, 1.4, '#fff6c8'), soft('#ffe27a', 0.5));
  P('petal', circ(16, 16, 15, 'url(#g)') + `<g transform="rotate(30 16 16)">` + pth('M16 4L22 14L16 28L10 14Z', '#f0a8e0', OL('#9a5ab8', 1.6)) + pth('M16 4L22 14L16 28Z', '#c890e8', op(0.6)) + stk('M14 11L14 18', '#ffffff', 1.4, op(0.8)) + '</g>', rad('g', [['0', '#ffb8e8', 0.6], ['1', '#c890e8', 0]]));
}

moon(); dunes(); rings(); comet(); particles();
console.log('environment art written to', OUT);
