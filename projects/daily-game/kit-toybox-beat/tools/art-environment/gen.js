// Kit's Toybox Beat: environment art generator (toy room at 4 times of day + shared props + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<tod>/wallpaper.svg 256x256 opaque, seamless in x AND y (stripe period 64 divides 256; every
//    motif that crosses an edge is re-emitted at ±256 on the opposite side).
//  - levels/<tod>/window.svg    320x260 transparent outside the frame, sky inside.
//  - levels/<tod>/floor.svg     512x192 opaque, seamless in x (plank joints wrap mod 512).
//  - room/shelf.svg 512x56 (top surface y 8..18), room/track.svg 512x40 (rail centre line y=20),
//    room/decor_0..5.svg 160x160 (base y≈150), room/nightlight.svg 96x96.
//  - particles/*.svg 32x32 centred.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#1e1424', t);   // outline / shade: a dark tone of the fill, never black
const lite = (c, t = 0.35) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
// outlined shape with one-step shade: draws fill + outline in a dark tone of the fill
const shape = (d, fill, w = 3) => pth(d, fill, OL(dark(fill), w));
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, r) => { // 4-point concave sparkle
  const p = (a, q) => [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; let d = '';
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2, [x, y] = p(a, R), [mx, my] = p(a + Math.PI / 4, r); d += (i ? 'L' : 'M') + f(x) + ' ' + f(y) + `Q${f(cx + (mx - cx) * 0.4)} ${f(cy + (my - cy) * 0.4)} ` + (() => { const [nx, ny] = p(a + Math.PI / 2, R); return f(nx) + ' ' + f(ny); })(); }
  return d + 'Z';
};
// emit fn(x, y) for each wrapped copy (radius rr) that touches the tile
function wrap(x, y, rr, fn, W, H, wrapY = true) {
  let o = '';
  for (const dx of [-W, 0, W]) for (const dy of (wrapY ? [-H, 0, H] : [0])) {
    const X = x + dx, Y = y + dy;
    if (X + rr < 0 || X - rr > W || Y + rr < 0 || Y - rr > H) continue;
    o += fn(X, Y);
  }
  return o;
}
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// =====================================================================================
// PALETTES (per time of day)
// =====================================================================================
const PAL = {
  dawn: {
    wall: '#f8dcd3', stripe: '#f4d1c8', motif: '#fbe9e2', motif2: '#efc5bd', // peach / pink
    floor: '#e2b497', floorD: '#c9967a', curtain: '#f2a7b4', trim: '#fff6f2',
    sky: [['0', '#f5a9c0'], ['0.55', '#ffcdb8'], ['1', '#ffe6c6']],
  },
  noon: {
    wall: '#d6ecef', stripe: '#cbe6e0', motif: '#e9f6f6', motif2: '#bfdcd8', // sky-blue / mint
    floor: '#e0bd8c', floorD: '#c49e6c', curtain: '#8fd3c0', trim: '#ffffff',
    sky: [['0', '#6fbff0'], ['1', '#c6ecff']],
  },
  sunset: {
    wall: '#f6cda6', stripe: '#f1c097', motif: '#f9dbbd', motif2: '#e9b08d', // warm apricot
    floor: '#cf9065', floorD: '#b2744d', curtain: '#f08c78', trim: '#fff0e2',
    sky: [['0', '#8f6cbf'], ['0.45', '#f0879a'], ['0.75', '#ff9f6a'], ['1', '#ffc583']],
  },
  night: {
    wall: '#26325e', stripe: '#2a3766', motif: '#3a4a82', motif2: '#c9d3ff', // deep navy + tiny stars
    floor: '#4a4f7e', floorD: '#3a3e68', curtain: '#5d63a6', trim: '#b9c0e6',
    sky: [['0', '#121a44'], ['1', '#2e3c7c']],
  },
};
const TODS = Object.keys(PAL);

// =====================================================================================
// WALLPAPER 256x256 (seamless x & y)
// =====================================================================================
function wallpaper(tod) {
  const P = PAL[tod], S = 256; const r = rng(tod.length * 97 + 11);
  let o = rect(0, 0, S, S, P.wall);
  // vertical stripes, period 64 (divides 256) – soft, low contrast
  for (let x = 32; x < S; x += 64) o += rect(x, 0, 32, S, P.stripe);
  // thin pin lines on stripe edges
  const pin = tod === 'night' ? mix(P.stripe, P.motif, 0.6) : mix(P.stripe, P.motif2, 0.35);
  for (let x = 32; x < S; x += 64) { o += rect(x, 0, 1.5, S, pin); o += rect(x + 30.5, 0, 1.5, S, pin); }
  const motifs = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    // big motif in the plain band, small dot in the stripe band; staggered
    motifs.push({ x: 16 + 64 * i, y: (32 + 64 * j + (i % 2) * 32) % S, big: true, k: (i + j) % 2 });
    motifs.push({ x: 48 + 64 * i, y: (64 * j + (i % 2 ? 0 : 32)) % S, big: false });
  }
  const cloud = (x, y, s, c) => pth(`M${f(x - 9 * s)} ${f(y + 3 * s)}a${f(4 * s)} ${f(4 * s)} 0 0 1 ${f(2 * s)}-${f(7 * s)}a${f(5.5 * s)} ${f(5.5 * s)} 0 0 1 ${f(10 * s)}-${f(2 * s)}a${f(4.5 * s)} ${f(4.5 * s)} 0 0 1 ${f(6 * s)} ${f(9 * s)}z`, c);
  const heart = (x, y, s, c) => pth(`M${f(x)} ${f(y + 5 * s)}C${f(x - 9 * s)} ${f(y - 1 * s)} ${f(x - 5 * s)} ${f(y - 8 * s)} ${f(x)} ${f(y - 3 * s)}C${f(x + 5 * s)} ${f(y - 8 * s)} ${f(x + 9 * s)} ${f(y - 1 * s)} ${f(x)} ${f(y + 5 * s)}Z`, c);
  const flower = (x, y, s, c, cc) => { let d = ''; for (let k = 0; k < 5; k++) { const a = k * 72 * Math.PI / 180; d += circ(x + Math.cos(a) * 3.6 * s, y + Math.sin(a) * 3.6 * s, 2.8 * s, c); } return d + circ(x, y, 2 * s, cc); };
  const leaf = (x, y, s, c) => pth(`M${f(x - 6 * s)} ${f(y + 4 * s)}Q${f(x - 5 * s)} ${f(y - 6 * s)} ${f(x + 6 * s)} ${f(y - 4 * s)}Q${f(x + 4 * s)} ${f(y + 6 * s)} ${f(x - 6 * s)} ${f(y + 4 * s)}Z`, c);
  for (const m of motifs) {
    let fn;
    if (tod === 'dawn') fn = m.big ? (X, Y) => (m.k ? cloud(X, Y, 1, P.motif) : heart(X, Y, 0.9, P.motif2)) : (X, Y) => circ(X, Y, 2.2, P.motif);
    if (tod === 'noon') fn = m.big ? (X, Y) => (m.k ? cloud(X, Y, 1.05, P.motif) : flower(X, Y, 0.85, P.motif, P.motif2)) : (X, Y) => circ(X, Y, 2.2, P.motif);
    if (tod === 'sunset') fn = m.big ? (X, Y) => (m.k ? leaf(X, Y, 1, P.motif2) : flower(X, Y, 0.85, P.motif, P.motif2)) : (X, Y) => circ(X, Y, 2.2, P.motif);
    if (tod === 'night') fn = m.big ? (X, Y) => (m.k ? pth(star5(X, Y, 6, 2.8), P.motif) : pth(`M${f(X + 4)} ${f(Y - 6)}a7 7 0 1 0 0 12a5.5 5.5 0 1 1 0-12z`, P.motif)) : (X, Y) => circ(X, Y, 1.3, P.motif2, ' opacity=".7"');
    o += wrap(m.x, m.y, 12, fn, S, S);
  }
  if (tod === 'night') { // tiny scattered star dots (wrapped)
    for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, rr = 0.6 + r() * 0.8; o += wrap(x, y, 2, (X, Y) => circ(X, Y, rr, '#dfe5ff', ` opacity="${f(0.35 + r() * 0.4)}"`), S, S); }
  }
  return svg(S, S, o);
}

// =====================================================================================
// WINDOW 320x260 (transparent outside)
// =====================================================================================
function windowSvg(tod) {
  const P = PAL[tod]; const W = 320, H = 260;
  const ox0 = 56, oy0 = 30, ox1 = 264, oy1 = 214; // inner opening
  const frameC = tod === 'night' ? '#c3c8e8' : '#fffaf4', frameD = dark(frameC, 0.32);
  let defs = lin('sky', P.sky) + `<clipPath id="op"><rect x="${ox0}" y="${oy0}" width="${ox1 - ox0}" height="${oy1 - oy0}"/></clipPath>`;
  let sky = rect(ox0, oy0, ox1 - ox0, oy1 - oy0, 'url(#sky)');
  const hills = (c1, c2) => pth(`M${ox0} ${oy1 - 30}Q${ox0 + 60} ${oy1 - 62} ${ox0 + 120} ${oy1 - 34}T${ox1} ${oy1 - 40}V${oy1}H${ox0}Z`, c1, OL(dark(c1, 0.3), 2.5)) +
    pth(`M${ox0} ${oy1 - 12}Q${ox0 + 90} ${oy1 - 40} ${ox0 + 170} ${oy1 - 16}T${ox1} ${oy1 - 22}V${oy1}H${ox0}Z`, c2, OL(dark(c2, 0.3), 2.5));
  const puff = (x, y, s, c = '#ffffff') => pth(`M${f(x - 26 * s)} ${f(y + 8 * s)}a${f(10 * s)} ${f(10 * s)} 0 0 1 ${f(6 * s)}-${f(17 * s)}a${f(14 * s)} ${f(14 * s)} 0 0 1 ${f(25 * s)}-${f(6 * s)}a${f(11 * s)} ${f(11 * s)} 0 0 1 ${f(20 * s)} ${f(6 * s)}a${f(9 * s)} ${f(9 * s)} 0 0 1 ${f(1 * s)} ${f(17 * s)}z`, c, OL(dark(c, 0.18), 2.5));
  if (tod === 'dawn') {
    defs += rad('sg', [['0', '#fff3c9', 0.95], ['0.55', '#ffe4b0', 0.5], ['1', '#ffd6b0', 0]]);
    sky += circ(160, oy1 - 26, 64, 'url(#sg)') + circ(160, oy1 - 26, 30, '#ffd98a', OL('#f0a868', 3)) + circ(152, oy1 - 36, 9, '#ffecbf');
    sky += puff(98, 74, 0.7, '#ffe9ee') + puff(226, 92, 0.55, '#ffe9ee');
    sky += hills('#c6dca6', '#a9cd94');
  } else if (tod === 'noon') {
    defs += rad('sg', [['0', '#ffffff', 0.9], ['0.6', '#fff7cf', 0.45], ['1', '#fff7cf', 0]]);
    sky += circ(214, 70, 40, 'url(#sg)') + circ(214, 70, 18, '#ffe377', OL('#e8b13c', 3)) + circ(209, 65, 6, '#fff3b8');
    sky += puff(110, 82, 0.9) + puff(186, 128, 0.6) + puff(250, 54, 0.5);
    sky += hills('#9fd88a', '#7cc472');
  } else if (tod === 'sunset') {
    defs += rad('sg', [['0', '#ffe0a0', 0.9], ['0.5', '#ffb070', 0.45], ['1', '#ff9070', 0]]);
    sky += circ(150, oy1 - 30, 84, 'url(#sg)') + circ(150, oy1 - 30, 42, '#ffad5a', OL('#e0703a', 3)) + circ(138, oy1 - 46, 12, '#ffd08a');
    sky += pth(`M${ox0} 76h70a6 6 0 0 1 0 12h-70z`, '#ffb7b9', ' opacity=".7"') + pth(`M${ox1} 104h-80a6 6 0 0 0 0 12h80z`, '#ffc2a6', ' opacity=".7"');
    sky += hills('#9a6a8e', '#7d5478');
  } else {
    defs += rad('mg', [['0', '#fff6cf', 0.55], ['1', '#fff6cf', 0]]);
    sky += circ(204, 78, 46, 'url(#mg)') + pth(`M${204 + 6} ${78 - 24}a24 24 0 1 0 14 40a19 19 0 1 1 -14-40z`, '#fff1bf', OL('#d8c07a', 2.5));
    const rr = rng(77);
    for (let i = 0; i < 22; i++) { const x = ox0 + 8 + rr() * (ox1 - ox0 - 16), y = oy0 + 8 + rr() * 120; if (Math.hypot(x - 204, y - 78) < 34) continue; sky += i % 4 ? circ(x, y, 1 + rr() * 1.1, '#e8ecff') : pth(twinkle(x, y, 4.5, 1.4), '#fff7d6'); }
    sky += hills('#2a3868', '#1f2b56');
  }
  // glass sheen
  sky += pth(`M${ox0 + 14} ${oy1}L${ox0 + 74} ${oy0}h22L${ox0 + 36} ${oy1}z`, '#ffffff', ' opacity=".13"') + pth(`M${ox0 + 120} ${oy1}L${ox0 + 180} ${oy0}h10L${ox0 + 130} ${oy1}z`, '#ffffff', ' opacity=".1"');
  let o = `<g clip-path="url(#op)">${sky}</g>`;
  // frame (4 panes): outer frame rect with hole, mullions
  const fx0 = ox0 - 14, fy0 = oy0 - 14, fx1 = ox1 + 14, fy1 = oy1 + 12;
  o += pth(`M${fx0} ${fy0}H${fx1}V${fy1}H${fx0}Z M${ox0} ${oy0}V${oy1}H${ox1}V${oy0}Z`, frameC, ` fill-rule="evenodd"${OL(frameD, 3)}`);
  o += rect(ox0, oy0, ox1 - ox0, 5, dark(frameC, 0.12), ' opacity=".6"'); // inner top shade
  const mx = (ox0 + ox1) / 2, my = (oy0 + oy1) / 2;
  o += rect(mx - 5, oy0, 10, oy1 - oy0, frameC, OL(frameD, 2.5)) + rect(ox0, my - 5, ox1 - ox0, 10, frameC, OL(frameD, 2.5));
  // sill
  o += rect(fx0 - 14, fy1 - 4, fx1 - fx0 + 28, 14, frameC, ` rx="4"${OL(frameD, 3)}`) + rect(fx0 - 10, fy1 + 7, fx1 - fx0 + 20, 3, dark(frameC, 0.2), ' opacity=".7"');
  // curtains (tied back), rod and valance
  const cu = P.curtain, cuD = dark(cu, 0.18), cuO = dark(cu, 0.45);
  const curtain = (sx) => { // sx = 1 left, -1 right (mirror around x=160)
    const X = x => (sx > 0 ? x : W - x);
    const d = `M${X(10)} 14L${X(84)} 14Q${X(76)} 80 ${X(52)} 128Q${X(70)} 176 ${X(80)} ${H - 10}L${X(14)} ${H - 10}Q${X(22)} 170 ${X(30)} 132Q${X(14)} 70 ${X(10)} 14Z`;
    let s = pth(d, cu, OL(cuO, 3));
    s += stk(`M${X(30)} 22Q${X(36)} 80 ${X(40)} 124`, cuD, 3) + stk(`M${X(56)} 22Q${X(56)} 80 ${X(46)} 124`, cuD, 3) + stk(`M${X(40)} 140Q${X(40)} 190 ${X(34)} ${H - 14}`, cuD, 3) + stk(`M${X(54)} 140Q${X(62)} 190 ${X(64)} ${H - 14}`, cuD, 3);
    s += stk(`M${X(20)} 30Q${X(24)} 80 ${X(30)} 116`, lite(cu, 0.35), 2.5, ' opacity=".8"');
    s += pth(`M${X(26)} 124Q${X(48)} 118 ${X(62)} 126Q${X(48)} 140 ${X(28)} 136Z`, '#fff1d8', OL('#c9a87a', 2.5)); // tie band
    return s;
  };
  o += curtain(1) + curtain(-1);
  o += rect(4, 8, W - 8, 8, '#c58d5e', ` rx="4"${OL('#7f5636', 2.5)}`) + circ(8, 12, 7, '#d9a274', OL('#7f5636', 2.5)) + circ(W - 8, 12, 7, '#d9a274', OL('#7f5636', 2.5));
  // scalloped valance
  let v = `M18 14H${W - 18}V30`; for (let x = W - 18; x > 18; x -= 28.4) v += `Q${f(x - 14.2)} 44 ${f(x - 28.4)} 30`; v += 'Z';
  o += pth(v, cu, OL(cuO, 3)) + stk(`M24 20H${W - 24}`, lite(cu, 0.4), 2.5, ' opacity=".7"');
  return svg(W, H, o, defs);
}

// =====================================================================================
// FLOOR 512x192 (seamless x) – wooden boards, perspective rows grow toward the viewer
// =====================================================================================
function floor(tod) {
  const P = PAL[tod], W = 512, H = 192; const r = rng(tod.length * 31 + 5);
  const rows = [26, 32, 38, 44, 52]; // sum 192
  let o = rect(0, 0, W, H, P.floor), y = 0;
  rows.forEach((h, i) => {
    const t = i / (rows.length - 1);
    const tone = mix(P.floor, P.floorD, 0.1 + t * 0.3 + (i % 2) * 0.1); // gentle depth; also repeats vertically without a hard jump
    o += rect(0, y, W, h, tone);
    o += rect(0, y + 1.5, W, 2.5, lite(tone, 0.16));           // board top highlight
    // grain: long soft wavy lines (period 512 → seamless)
    for (let g = 0; g < 2; g++) { const gy = y + h * (0.4 + g * 0.3), ph = r() * 6.28, a = 1 + r() * 1.5; let d = `M0 ${f(gy + a * Math.sin(ph))}`; for (let x = 16; x <= W; x += 16) d += `L${x} ${f(gy + a * Math.sin(ph + x / W * 6.283 * 2))}`; o += stk(d, dark(tone, 0.12), 1.4, ' opacity=".55"'); }
    // plank joints, staggered, wrapped mod 512
    const off = (i * 157) % 256, n = 2 + (i % 2);
    for (let k = 0; k < n; k++) { const jx = (off + k * W / n + r() * 30) % W; o += rect(jx - 1.5, y + 2, 3, h - 3, dark(tone, 0.32)); o += rect(jx + 1.5, y + 2, 2, h - 3, lite(tone, 0.12)); }
    // tiny knots
    if (i > 0) { const kx = r() * W, ky = y + h * (0.3 + r() * 0.4); o += wrap(kx, ky, 8, (X, Y) => ell(X, Y, 5 + i, 2.2, dark(tone, 0.16), ' opacity=".6"'), W, H, false); }
    y += h;
    o += rect(0, y - 2, W, 2, dark(tone, 0.38));                // seam between rows
  });
  // skirting line at the top + soft contact shadow below it
  o += rect(0, 0, W, 4, dark(P.floor, 0.5)) + rect(0, 4, W, 6, dark(P.floor, 0.3), ' opacity=".35"');
  return svg(W, H, o);
}

// =====================================================================================
// SHELF 512x56 (tileable x; top surface y 8..18)
// =====================================================================================
function shelf() {
  const W = 512, wood = '#cf9160', top = '#e9b583', face = '#c4844f', out = dark(face, 0.5); const r = rng(42);
  let defs = lin('sh', [['0', '#3a2418', 0.32], ['1', '#3a2418', 0]]);
  let o = rect(0, 38, W, 16, 'url(#sh)');                       // soft shadow on the wall
  // brackets (period 256)
  for (const bx of [128, 384]) o += pth(`M${bx - 10} 36H${bx + 10}V40Q${bx + 10} 52 ${bx} 54Q${bx - 10} 52 ${bx - 10} 40Z`, wood, OL(out, 3));
  o += rect(0, 8, W, 10, top) + rect(0, 9.5, W, 2, lite(top, 0.35));   // top surface (y 8..18)
  o += rect(0, 18, W, 20, face) + rect(0, 30, W, 8, dark(face, 0.14));  // front face + one-step shade
  for (let g = 0; g < 2; g++) { const gy = 22 + g * 6, ph = r() * 6.28; let d = `M0 ${f(gy + Math.sin(ph))}`; for (let x = 16; x <= W; x += 16) d += `L${x} ${f(gy + 1.2 * Math.sin(ph + x / W * 6.283 * 3))}`; o += stk(d, dark(face, 0.2), 1.3, ' opacity=".6"'); }
  o += rect(0, 6.5, W, 3, out) + rect(0, 17, W, 2, dark(top, 0.35)) + rect(0, 37, W, 3, out); // outlines (horizontal only → seamless)
  return svg(W, 56, o, defs);
}

// =====================================================================================
// TRACK 512x40 (tileable x; rail centre line y=20)
// =====================================================================================
function track() {
  const W = 512; const sl = '#ebc48e', slO = dark(sl, 0.45), rail = '#8fa5c2', railO = '#4e5f7a';
  let o = rect(0, 31, W, 5, '#3a2418', ' opacity=".18"'); // contact shadow
  for (let x = 0; x < W; x += 32) { // sleepers, seen slightly from above (trapezoid: far end narrower)
    o += pth(`M${x + 7} 6H${x + 25}L${x + 28} 33H${x + 4}Z`, sl, OL(slO, 2.5));
    o += pth(`M${x + 8} 8H${x + 13}L${x + 11} 31H${x + 7}Z`, lite(sl, 0.3), ' opacity=".8"');
    o += pth(`M${x + 21} 8H${x + 24}L${x + 26} 31H${x + 22}Z`, dark(sl, 0.12), ' opacity=".8"');
  }
  // rails (far rail thinner): horizontal strips only → seamless
  const railStrip = (y, h) => rect(0, y - 1.5, W, h + 3, railO) + rect(0, y, W, h, rail) + rect(0, y, W, Math.max(1.5, h * 0.4), lite(rail, 0.5));
  o += railStrip(11.5, 4) + railStrip(24, 5.5);
  return svg(W, 40, o);
}

// =====================================================================================
// DECOR 160x160 (base y≈150)
// =====================================================================================
const base = (cx, w) => ell(cx, 150, w, 5, '#3a2418', ' opacity=".18"');
function block(x, y, s, c, emb, rot = 0) {
  const cx = x + s / 2, cy = y + s / 2; let g = `<g transform="rotate(${rot} ${f(cx)} ${f(cy)})">`;
  g += rect(x, y, s, s, c, ` rx="7"${OL(dark(c), 3)}`);
  g += pth(`M${x + s * 0.7} ${y + 2}H${x + s - 7}a5 5 0 0 1 5 5V${y + s - 7}a5 5 0 0 1 -5 5H${x + s * 0.7}Z`, dark(c, 0.14), ' opacity=".7"');
  g += rect(x + 6, y + 5, s * 0.36, 4, lite(c, 0.5), ' rx="2"');
  const ec = lite(c, 0.4), m = 4;
  g += rect(x + m + 2, y + m + 2, s - 2 * m - 4, s - 2 * m - 4, 'none', ` rx="4" stroke="${dark(c, 0.2)}" stroke-width="2" opacity=".5"`);
  if (emb === 'circle') g += circ(cx, cy, s * 0.2, ec, OL(dark(c, 0.25), 2));
  if (emb === 'star') g += pth(star5(cx, cy + 1, s * 0.25, s * 0.11), ec, OL(dark(c, 0.25), 2));
  if (emb === 'heart') g += pth(`M${cx} ${cy + 8}C${cx - 14} ${cy - 2} ${cx - 7} ${cy - 12} ${cx} ${cy - 5}C${cx + 7} ${cy - 12} ${cx + 14} ${cy - 2} ${cx} ${cy + 8}Z`, ec, OL(dark(c, 0.25), 2));
  return g + '</g>';
}
function decor0() { // block tower
  let o = base(80, 52);
  o += block(30, 104, 44, '#ef7a76', 'star') + block(78, 104, 44, '#62aee6', 'circle');
  o += block(54, 60, 44, '#6fcaa1', 'heart', -5);
  o += pth('M58 58L78 22L100 58Z', '#f6a35a', OL(dark('#f6a35a'), 3)) + pth('M78 22L100 58H86Z', dark('#f6a35a', 0.14), ' opacity=".7"') + stk('M66 52L76 34', lite('#f6a35a', 0.5), 3);
  return svg(160, 160, o);
}
function decor1() { // toy drum
  const body = '#ea5f62', rim = '#4d8fdc', skin = '#fff3e0';
  let o = base(80, 56);
  o += pth('M28 66V136A52 14 0 0 0 132 136V66Z', body, OL(dark(body), 3));
  o += pth('M108 72V140A52 14 0 0 0 128 132V66Z', dark(body, 0.14), ' opacity=".8"');
  let z = 'M32 84'; for (let i = 0; i < 6; i++) { const x = 32 + i * 16; z += `L${x + 8} 124L${x + 16} 84`; } o += stk(z, '#fff3e0', 3);
  o += pth('M28 126A52 14 0 0 0 132 126V138A52 14 0 0 1 28 138Z', rim, OL(dark(rim), 3));
  o += pth('M28 70A52 14 0 0 0 132 70V82A52 14 0 0 1 28 82Z', rim, OL(dark(rim), 3));
  o += ell(80, 68, 52, 14, skin, OL(dark(skin, 0.35), 3)) + ell(70, 65, 26, 5, '#ffffff', ' opacity=".7"');
  const stick = (x1, y1, x2, y2) => stk(`M${x1} ${y1}L${x2} ${y2}`, '#7a4f32', 8) + stk(`M${x1} ${y1}L${x2} ${y2}`, '#e2b07a', 4) + circ(x2, y2, 7, '#fff3e0', OL('#9a7a5a', 2.5));
  o += stick(40, 32, 76, 58) + stick(126, 30, 92, 58);
  return svg(160, 160, o);
}
function decor2() { // rocking horse (generic)
  const wood = '#e9b072', mane = '#8a5a3c', rock = '#b8743f', saddle = '#e85f72';
  let o = base(80, 64);
  o += stk('M12 134Q80 162 148 134', dark(rock, 0.45), 12) + stk('M12 134Q80 162 148 134', rock, 7) + stk('M18 134Q80 158 142 135', lite(rock, 0.3), 2);
  for (const [x1, x2] of [[52, 40], [62, 60], [100, 102], [110, 120]]) o += stk(`M${x1} 96L${x2} 143`, dark(wood, 0.45), 9) + stk(`M${x1} 96L${x2} 143`, x1 === 62 || x1 === 100 ? dark(wood, 0.12) : wood, 4.5);
  o += pth('M38 90Q24 82 20 98Q18 112 28 116Q30 104 40 100Z', mane, OL(dark(mane), 3)); // yarn tail
  o += ell(80, 90, 44, 18, wood, OL(dark(wood), 3)) + pth('M48 100Q80 112 118 100Q100 108 80 108Q60 108 48 100Z', dark(wood, 0.12), ' opacity=".8"');
  o += pth('M106 84Q112 60 118 46L136 44Q148 48 150 60Q150 70 140 70L128 68Q122 80 120 92Z', wood, OL(dark(wood), 3)); // neck + head
  o += pth('M104 80Q104 56 114 42Q118 36 126 38Q116 52 116 78Z', mane, OL(dark(mane), 3)); // mane
  o += pth('M126 40L128 28L136 40Z', wood, OL(dark(wood), 3)); // ear
  o += circ(134, 52, 3.5, '#3a2a30') + circ(135, 51, 1.2, '#ffffff') + stk('M142 64Q146 66 148 63', dark(wood, 0.5), 2) + circ(144, 58, 1.6, dark(wood, 0.45));
  o += stk('M126 66Q118 76 104 84', '#4d8fdc', 3); // rein
  o += pth('M68 72Q80 66 94 72L96 82Q80 86 66 82Z', saddle, OL(dark(saddle), 3)) + stk('M72 75Q80 72 90 75', lite(saddle, 0.4), 2.5);
  return svg(160, 160, o);
}
function decor3() { // wind-up robot
  const b = '#8fbadc', h = '#a9d0ea', acc = '#f28b6b';
  let o = base(80, 42);
  o += rect(58, 130, 16, 18, dark(b, 0.15), ` rx="4"${OL(dark(b), 3)}`) + rect(86, 130, 16, 18, dark(b, 0.15), ` rx="4"${OL(dark(b), 3)}`);
  o += rect(52, 143, 26, 8, '#6f8fae', ` rx="4"${OL(dark('#6f8fae'), 2.5)}`) + rect(82, 143, 26, 8, '#6f8fae', ` rx="4"${OL(dark('#6f8fae'), 2.5)}`);
  // key (behind, on the left side)
  o += stk('M50 104H34', '#9a8a70', 5) + pth('M34 104C22 90 14 100 22 104C14 108 22 118 34 104Z', '#f0b75a', OL('#a8782a', 2.5));
  // arms
  o += stk('M50 98Q36 110 40 124', dark(b), 9) + stk('M50 98Q36 110 40 124', b, 5) + circ(40, 126, 6, acc, OL(dark(acc), 2.5));
  o += stk('M110 98Q126 104 124 120', dark(b), 9) + stk('M110 98Q126 104 124 120', b, 5) + circ(124, 122, 6, acc, OL(dark(acc), 2.5));
  o += rect(48, 84, 64, 50, b, ` rx="10"${OL(dark(b), 3)}`) + rect(96, 86, 14, 46, dark(b, 0.14), ' rx="7" opacity=".8"');
  o += rect(60, 96, 34, 24, '#e9f4fb', ` rx="5"${OL(dark(b, 0.4), 2.5)}`) + circ(70, 108, 4, acc) + circ(84, 108, 4, '#7bd0a2') + stk('M66 116H88', '#c9dbe8', 2);
  o += rect(64, 76, 32, 10, dark(b, 0.2), ` rx="3"${OL(dark(b), 2.5)}`); // neck
  o += rect(52, 38, 56, 42, h, ` rx="12"${OL(dark(h), 3)}`) + rect(94, 40, 12, 38, dark(h, 0.14), ' rx="6" opacity=".7"') + rect(58, 43, 20, 4, lite(h, 0.6), ' rx="2"');
  o += circ(70, 58, 8, '#ffffff', OL(dark(h, 0.5), 2.5)) + circ(92, 58, 8, '#ffffff', OL(dark(h, 0.5), 2.5)) + circ(72, 59, 4, '#2f3a58') + circ(94, 59, 4, '#2f3a58') + circ(73.5, 57, 1.4, '#ffffff') + circ(95.5, 57, 1.4, '#ffffff');
  o += stk('M72 70Q81 76 90 70', dark(h, 0.55), 2.5);
  o += stk('M80 38V24', dark(h, 0.5), 3) + circ(80, 20, 6, acc, OL(dark(acc), 2.5)) + circ(78, 18, 2, '#ffffff', ' opacity=".8"');
  return svg(160, 160, o);
}
function decor4() { // stacking rings toy
  const cols = ['#ef6f6f', '#f6a35a', '#7ccc8a', '#5fb0e6', '#a98ae0'];
  let o = base(80, 50);
  o += rect(76, 24, 8, 110, '#e6b07a', OL(dark('#e6b07a'), 2.5));
  o += pth('M34 140Q34 132 44 132H116Q126 132 126 140V144Q126 150 116 150H44Q34 150 34 144Z', '#d79a62', OL(dark('#d79a62'), 3));
  let y = 132; const ws = [44, 39, 33, 27, 21];
  ws.forEach((w, i) => { const c = cols[i], hh = 18; y -= hh; o += rect(80 - w, y, 2 * w, hh, c, ` rx="9"${OL(dark(c), 3)}`) + rect(80 + w * 0.35, y + 2, w * 0.55, hh - 4, dark(c, 0.14), ' rx="6" opacity=".75"') + rect(80 - w + 6, y + 4, w * 0.6, 3.5, lite(c, 0.5), ' rx="2"'); });
  o += circ(80, y - 10, 12, '#f58fb6', OL(dark('#f58fb6'), 3)) + circ(76, y - 14, 3.5, '#ffffff', ' opacity=".8"');
  return svg(160, 160, o);
}
function decor5() { // toy sailboat on wheels
  const hull = '#4d8fdc', stripe = '#fff3e0', sail = '#fffaf0', flag = '#ef6f6f';
  let o = base(80, 54);
  o += circ(50, 140, 9, '#e9b072', OL(dark('#e9b072'), 3)) + circ(110, 140, 9, '#e9b072', OL(dark('#e9b072'), 3)) + circ(50, 140, 3, dark('#e9b072', 0.3)) + circ(110, 140, 3, dark('#e9b072', 0.3));
  o += rect(78, 20, 6, 96, '#b8743f', OL(dark('#b8743f'), 2.5));
  o += pth('M86 26Q124 60 132 104H86Z', sail, OL(dark(sail, 0.38), 3)) + stk('M88 60Q112 70 118 74', '#7fb5ec', 4) + stk('M88 84H126', '#7fb5ec', 4);
  o += pth('M76 40Q48 74 40 104H76Z', sail, OL(dark(sail, 0.38), 3)) + pth('M76 40Q66 70 60 104H76Z', dark(sail, 0.08), ' opacity=".9"');
  o += pth('M84 20L104 26L84 32Z', flag, OL(dark(flag), 2.5));
  o += pth('M22 108H142Q136 138 112 140H48Q28 138 22 108Z', hull, OL(dark(hull), 3));
  o += pth('M26 118H138', 'none', ` stroke="${stripe}" stroke-width="5"`) + pth('M100 112H138Q134 134 112 138H100Z', dark(hull, 0.15), ' opacity=".6"');
  o += circ(54, 126, 5, '#fff3e0', OL(dark(hull), 2)) + circ(76, 126, 5, '#fff3e0', OL(dark(hull), 2));
  return svg(160, 160, o);
}
function nightlight() { // 96x96 star lamp, glows
  const c = '#ffe9a6', cO = '#c89a3c';
  let defs = rad('gl', [['0', '#fff3c4', 0.85], ['0.5', '#ffe9a6', 0.35], ['1', '#ffe9a6', 0]]);
  let o = circ(48, 44, 47, 'url(#gl)');
  o += pth('M30 92Q30 78 48 78Q66 78 66 92Z', '#9aa4d8', OL(dark('#9aa4d8'), 3)) + pth('M52 80Q64 82 66 92H56Z', dark('#9aa4d8', 0.14), ' opacity=".8"');
  const s = star5(48, 46, 32, 15);
  o += pth(s, c, ` stroke="${cO}" stroke-width="7" stroke-linejoin="round"`) + pth(s, c, ' stroke="' + c + '" stroke-width="3" stroke-linejoin="round"');
  o += pth(star5(48, 46, 20, 10), '#fff8dc', ' opacity=".8"');
  o += stk('M38 46Q41 49 44 46', '#8a6a3a', 2.2) + stk('M52 46Q55 49 58 46', '#8a6a3a', 2.2) + stk('M44 54Q48 57 52 54', '#8a6a3a', 2.2);
  o += ell(36, 52, 3.5, 2, '#ffb3a6', ' opacity=".8"') + ell(60, 52, 3.5, 2, '#ffb3a6', ' opacity=".8"');
  return svg(96, 96, o, defs);
}

// =====================================================================================
// PARTICLES 32x32 (centred)
// =====================================================================================
const P32 = (body, defs) => svg(32, 32, body, defs);
const particles = {
  mote: () => P32(circ(16, 16, 12, 'url(#m)') + circ(16, 16, 4, '#fffaf0', ' opacity=".9"'), rad('m', [['0', '#fffaf0', 0.9], ['0.45', '#fff1d6', 0.45], ['1', '#fff1d6', 0]])),
  bubble: () => P32(circ(16, 16, 12, 'url(#bf)') + circ(16, 16, 12, 'none', ' stroke="url(#br)" stroke-width="2"') + stk('M9 13Q10 9 14 8', '#ffffff', 2.2) + circ(21, 21, 1.6, '#ffffff', ' opacity=".8"'),
    rad('bf', [['0', '#e6f6ff', 0.08], ['0.75', '#cfeaff', 0.22], ['1', '#b9dcff', 0.45]]) + lin('br', [['0', '#ff9ccf'], ['0.35', '#9ee8ff'], ['0.7', '#a6f0b4'], ['1', '#c9a6ff']], 1, 1)),
  fluff: () => { let o = stk('M16 27L16 14', '#b9a990', 1.2) + ell(16, 28, 1.6, 2.6, '#b08e66'); for (let i = 0; i < 9; i++) { const a = Math.PI + i * Math.PI / 8, x = 16 + Math.cos(a) * 11, y = 13 + Math.sin(a) * 9; o += stk(`M16 14L${f(x)} ${f(y)}`, '#a89c88', 1.6) + stk(`M16 14L${f(x)} ${f(y)}`, '#ffffff', 0.9) + circ(x, y, 1.5, '#ffffff', OL('#b9ad98', 0.6)); } return P32(o); },
  star: () => P32(pth(star5(16, 17, 13, 6.2), '#fff2b8', ` stroke="#d9ac4a" stroke-width="2" stroke-linejoin="round"`) + pth(star5(16, 17, 7, 3.4), '#fffbe6', ' opacity=".9"')),
  sparkle: () => P32(pth(twinkle(16, 16, 14, 4), '#fffbe8', OL('#e2c25a', 1.4)) + circ(16, 16, 2.4, '#ffffff')),
  feather: () => { // fluffy pillow feather: soft curved vane with two little notches, curved quill
    const d = 'M6 28C2 19 8 9 18 5Q23 3 27 4Q26 9 22.5 12L25 12.5Q21 19 15.5 22L18 23Q12 28 6 28Z';
    let o = pth(d, '#ffffff', OL('#a9a2c6', 1.5)) + pth('M8 26C10 20 16 14 24 7Q22 12 19 15Q14 22 8 26Z', '#ecebf7');
    o += stk('M5 30Q13 19 25 6', '#b4add0', 1.4) + stk('M10 12Q12 9 15 8', '#ffffff', 1.6);
    return P32(o);
  },
  note: () => P32(stk('M20 7V22', '#eef1ff', 7, ' opacity=".55"') + stk('M20 7Q26 9 26 15', '#eef1ff', 7, ' opacity=".55"') + ell(14, 23, 8.6, 6.8, '#eef1ff', ' transform="rotate(-22 14 23)" opacity=".55"') + stk('M20 7V22', '#24357a', 4.6) + stk('M20 7V22', '#3a4fa0', 2) + stk('M20 7Q26 9 26 15', '#24357a', 4.6) + stk('M20 7Q26 9 26 15', '#3a4fa0', 2) + ell(14, 23, 7, 5.2, '#3a4fa0', ` transform="rotate(-22 14 23)"${OL('#24357a', 2)}`) + ell(12, 21.5, 2.5, 1.4, '#8fa0e0', ' transform="rotate(-22 12 21.5)"')),
  confetti: () => P32(`<g transform="rotate(-18 16 16)">${rect(10, 9, 12, 14, '#ffffff', ' rx="1.5"')}${rect(10, 17, 12, 6, '#e8e8e8', ' rx="1.5"')}</g>`),
};

// =====================================================================================
for (const t of TODS) {
  write(`levels/${t}/wallpaper.svg`, wallpaper(t));
  write(`levels/${t}/window.svg`, windowSvg(t));
  write(`levels/${t}/floor.svg`, floor(t));
}
write('room/shelf.svg', shelf());
write('room/track.svg', track());
[decor0, decor1, decor2, decor3, decor4, decor5].forEach((fn, i) => write(`room/decor_${i}.svg`, fn()));
write('room/nightlight.svg', nightlight());
for (const [k, fn] of Object.entries(particles)) write(`particles/${k}.svg`, fn());
console.log('environment art written to', OUT);
