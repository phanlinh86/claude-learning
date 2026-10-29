// Family Flappy environment art generator. Writes hand-authored, procedurally-laid-out SVGs.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || '/home/claude/claude-learning/projects/flappy/game/assets/default';
const W = 960;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function wave(terms) { return x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0); }
function yAt(base, terms, x) { return base + wave(terms)(((x % W) + W) % W); }
// periodic band (tileable because all k are integers)
function band(base, terms, fill, bottom = 540, step = 6, extra = '') {
  const w = wave(terms); let d = `M0 ${bottom}`;
  for (let x = 0; x <= W; x += step) d += `L${x} ${f(base + w(x))}`;
  return `<path d="${d}L${W} ${bottom}Z" fill="${fill}"${extra}/>`;
}
// draw fn at x and its wrapped copies so objects crossing an edge tile seamlessly
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;

// ---------- props ----------
// puffy deciduous tree, one-step shading (dark offset layer, base, highlight)
function puffTree(x, y, s, c) {
  const blobs = [[0, -50, 22], [-19, -39, 16], [19, -39, 16], [-10, -62, 14], [12, -63, 14], [0, -32, 14]];
  let o = `<path d="M${f(x - 4 * s)} ${f(y)}L${f(x - 2.6 * s)} ${f(y - 34 * s)}L${f(x + 2.6 * s)} ${f(y - 34 * s)}L${f(x + 4 * s)} ${f(y)}Z" fill="${c.trunk}"/>`;
  o += `<path d="M${f(x)} ${f(y - 22 * s)}L${f(x + 9 * s)} ${f(y - 32 * s)}" stroke="${c.trunk}" stroke-width="${f(2.4 * s)}" stroke-linecap="round"/>`;
  for (const [dx, dy, r] of blobs) o += circ(x + dx * s + 2.5 * s, y + dy * s + 3.5 * s, r * s, c.dark);
  for (const [dx, dy, r] of blobs) o += circ(x + dx * s, y + dy * s, r * s, c.mid);
  o += circ(x - 9 * s, y - 64 * s, 6 * s, c.light) + circ(x - 20 * s, y - 43 * s, 5 * s, c.light) + circ(x - 3 * s, y - 54 * s, 4 * s, c.light);
  if (c.dots) { const r = rng(Math.round(x * 7 + y)); for (let i = 0; i < 7; i++) o += circ(x + (r() - 0.5) * 44 * s, y + (-30 - r() * 38) * s, 2 * s, c.dots); }
  return o;
}
// tall poplar / cypress
function poplar(x, y, s, c) {
  let o = `<rect x="${f(x - 2 * s)}" y="${f(y - 14 * s)}" width="${f(4 * s)}" height="${f(14 * s)}" fill="${c.trunk}"/>`;
  o += ell(x + 2.5 * s, y - 44 * s, 12 * s, 34 * s, c.dark) + ell(x, y - 46 * s, 12 * s, 34 * s, c.mid) + ell(x - 4.5 * s, y - 56 * s, 4 * s, 16 * s, c.light);
  return o;
}
function bush(x, y, s, c) {
  return circ(x - 12 * s + 2, y - 7 * s + 2, 11 * s, c.dark) + circ(x + 10 * s + 2, y - 8 * s + 2, 12 * s, c.dark) + circ(x + 2, y - 13 * s + 2, 14 * s, c.dark) +
    circ(x - 12 * s, y - 7 * s, 11 * s, c.mid) + circ(x + 10 * s, y - 8 * s, 12 * s, c.mid) + circ(x, y - 13 * s, 14 * s, c.mid) + circ(x - 5 * s, y - 19 * s, 4.5 * s, c.light);
}
function pine(x, y, s, c, snow) {
  let o = `<rect x="${f(x - 3 * s)}" y="${f(y - 12 * s)}" width="${f(6 * s)}" height="${f(12 * s)}" fill="${c.trunk}"/>`;
  const tiers = [[-10, 26, 24], [-28, 21, 22], [-45, 15, 20]]; // [baseY, halfWidth, height]
  for (const [by, hw, h] of tiers) {
    const b = y + by * s, t = b - h * s;
    o += `<path d="M${f(x - hw * s)} ${f(b)}Q${f(x)} ${f(b + 4 * s)} ${f(x + hw * s)} ${f(b)}L${f(x + 2 * s)} ${f(t + 1)}Q${f(x)} ${f(t - 1)} ${f(x - 2 * s)} ${f(t + 1)}Z" fill="${c.mid}"/>`;
    o += `<path d="M${f(x)} ${f(t)}L${f(x + hw * s)} ${f(b)}Q${f(x + hw * 0.5 * s)} ${f(b + 3 * s)} ${f(x + 1 * s)} ${f(b + 3.5 * s)}Z" fill="${c.dark}"/>`;
    if (snow) {
      const sy = t + h * s * 0.55, sw = hw * s * 0.55;
      o += `<path d="M${f(x - 2 * s)} ${f(t + 1)}Q${f(x)} ${f(t - 1.5)} ${f(x + 2 * s)} ${f(t + 1)}L${f(x + sw)} ${f(sy)}Q${f(x + sw * 0.6)} ${f(sy + 4 * s)} ${f(x + sw * 0.3)} ${f(sy - 1)}Q${f(x)} ${f(sy + 5 * s)} ${f(x - sw * 0.35)} ${f(sy)}Q${f(x - sw * 0.7)} ${f(sy + 4 * s)} ${f(x - sw)} ${f(sy)}Z" fill="${snow.mid}"/>`;
      o += `<path d="M${f(x + 1 * s)} ${f(t + 2)}L${f(x + sw)} ${f(sy)}Q${f(x + sw * 0.6)} ${f(sy + 4 * s)} ${f(x + sw * 0.3)} ${f(sy - 1)}Z" fill="${snow.dark}"/>`;
      // snow on tier edge
      o += `<path d="M${f(x - hw * s)} ${f(b)}Q${f(x)} ${f(b + 4 * s)} ${f(x + hw * s)} ${f(b)}Q${f(x)} ${f(b + 0.5 * s)} ${f(x - hw * s)} ${f(b)}Z" fill="${snow.mid}"/>`;
    }
  }
  return o;
}
function sunflower(x, y, s, h) {
  const cy = y - h * s;
  let o = `<path d="M${f(x)} ${f(y)}Q${f(x - 3 * s)} ${f(y - h * s * 0.5)} ${f(x)} ${f(cy)}" stroke="#4f8a2f" stroke-width="${f(2.6 * s)}" fill="none" stroke-linecap="round"/>`;
  o += `<path d="M${f(x - 1 * s)} ${f(y - h * s * 0.45)}q${f(-9 * s)} ${f(-6 * s)} ${f(-12 * s)} ${f(1 * s)}q${f(7 * s)} ${f(4 * s)} ${f(12 * s)} ${f(-1 * s)}Z" fill="#5f9e34"/>`;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, px = x + Math.cos(a) * 8 * s, py = cy + Math.sin(a) * 8 * s;
    o += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(5.2 * s)}" ry="${f(2.6 * s)}" fill="${i % 2 ? '#ffc93c' : '#ffd95a'}" transform="rotate(${f(a * 180 / Math.PI)} ${f(px)} ${f(py)})"/>`;
  }
  o += circ(x, cy, 6 * s, '#7a4a24') + circ(x - 1.5 * s, cy - 1.5 * s, 2.6 * s, '#9a6232');
  return o;
}
function haystack(x, y, s) {
  return `<path d="M${f(x - 24 * s)} ${f(y)}Q${f(x - 26 * s)} ${f(y - 34 * s)} ${f(x)} ${f(y - 36 * s)}Q${f(x + 26 * s)} ${f(y - 34 * s)} ${f(x + 24 * s)} ${f(y)}Z" fill="#e9bf55"/>` +
    `<path d="M${f(x + 4 * s)} ${f(y - 36 * s)}Q${f(x + 26 * s)} ${f(y - 34 * s)} ${f(x + 24 * s)} ${f(y)}L${f(x + 8 * s)} ${f(y)}Q${f(x + 14 * s)} ${f(y - 20 * s)} ${f(x + 4 * s)} ${f(y - 36 * s)}Z" fill="#d29d3c"/>` +
    `<path d="M${f(x - 20 * s)} ${f(y - 12 * s)}Q${f(x)} ${f(y - 7 * s)} ${f(x + 21 * s)} ${f(y - 13 * s)}M${f(x - 16 * s)} ${f(y - 24 * s)}Q${f(x)} ${f(y - 19 * s)} ${f(x + 17 * s)} ${f(y - 25 * s)}" stroke="#c18a34" stroke-width="${f(1.6 * s)}" fill="none" stroke-linecap="round"/>` +
    ell(x - 9 * s, y - 28 * s, 6 * s, 3 * s, '#f6d97f');
}
function pumpkin(x, y, s) {
  return `<path d="M${f(x)} ${f(y - 15 * s)}q${f(1 * s)} ${f(-5 * s)} ${f(4 * s)} ${f(-6 * s)}" stroke="#5c7a2a" stroke-width="${f(2.4 * s)}" stroke-linecap="round" fill="none"/>` +
    ell(x - 6 * s, y - 7.5 * s, 7 * s, 7.5 * s, '#e0702a') + ell(x + 6 * s, y - 7.5 * s, 7 * s, 7.5 * s, '#d4622a') + ell(x, y - 8 * s, 6 * s, 8 * s, '#f0863a') + ell(x - 2 * s, y - 11 * s, 2 * s, 3 * s, '#f7ab6a');
}
function fence(x1, x2, y, c) {
  let o = `<rect x="${f(x1)}" y="${f(y - 14)}" width="${f(x2 - x1)}" height="3" rx="1.5" fill="${c}"/><rect x="${f(x1)}" y="${f(y - 7)}" width="${f(x2 - x1)}" height="3" rx="1.5" fill="${c}"/>`;
  for (let x = x1 + 3; x <= x2 - 1; x += 16) o += `<rect x="${f(x - 2)}" y="${f(y - 19)}" width="4" height="19" rx="2" fill="${c}"/>`;
  return o;
}
function cottage(x, y, s) {
  let o = '';
  // chimney + smoke
  o += `<rect x="${f(x + 10 * s)}" y="${f(y - 58 * s)}" width="${f(8 * s)}" height="${f(18 * s)}" fill="#8f5a4a"/>` + `<rect x="${f(x + 9 * s)}" y="${f(y - 61 * s)}" width="${f(10 * s)}" height="${f(4 * s)}" rx="${f(2 * s)}" fill="#f4f7ff"/>`;
  o += circ(x + 16 * s, y - 70 * s, 4 * s, '#e9ecf6', ' opacity="0.8"') + circ(x + 21 * s, y - 80 * s, 5.5 * s, '#e9ecf6', ' opacity="0.6"') + circ(x + 29 * s, y - 92 * s, 7 * s, '#e9ecf6', ' opacity="0.4"');
  // walls
  o += `<rect x="${f(x - 26 * s)}" y="${f(y - 34 * s)}" width="${f(52 * s)}" height="${f(34 * s)}" fill="#b0684c"/>`;
  o += `<rect x="${f(x + 12 * s)}" y="${f(y - 34 * s)}" width="${f(14 * s)}" height="${f(34 * s)}" fill="#96553e"/>`;
  for (let i = 1; i < 4; i++) o += `<rect x="${f(x - 26 * s)}" y="${f(y - 34 * s + i * 8.5 * s)}" width="${f(52 * s)}" height="${f(1.2 * s)}" fill="#8a4c37" opacity="0.6"/>`;
  // window glow + window
  o += circ(x - 10 * s, y - 18 * s, 16 * s, 'url(#glow)');
  o += `<rect x="${f(x - 17 * s)}" y="${f(y - 25 * s)}" width="${f(14 * s)}" height="${f(13 * s)}" rx="${f(1.5 * s)}" fill="#ffd56b" stroke="#6e3b2a" stroke-width="${f(1.6 * s)}"/>`;
  o += `<path d="M${f(x - 10 * s)} ${f(y - 25 * s)}V${f(y - 12 * s)}M${f(x - 17 * s)} ${f(y - 18.5 * s)}H${f(x - 3 * s)}" stroke="#6e3b2a" stroke-width="${f(1.4 * s)}"/>`;
  o += `<rect x="${f(x - 16 * s)}" y="${f(y - 11 * s)}" width="${f(12 * s)}" height="${f(3 * s)}" rx="${f(1.5 * s)}" fill="#f4f7ff"/>`;
  // door
  o += `<path d="M${f(x + 3 * s)} ${f(y)}V${f(y - 18 * s)}Q${f(x + 8 * s)} ${f(y - 23 * s)} ${f(x + 13 * s)} ${f(y - 18 * s)}V${f(y)}Z" fill="#6e3b2a"/>` + circ(x + 11 * s, y - 9 * s, 1 * s, '#ffd56b');
  // snowy roof
  o += `<path d="M${f(x - 33 * s)} ${f(y - 32 * s)}L${f(x)} ${f(y - 56 * s)}L${f(x + 33 * s)} ${f(y - 32 * s)}Q${f(x + 33 * s)} ${f(y - 26 * s)} ${f(x + 27 * s)} ${f(y - 27 * s)}Q${f(x + 18 * s)} ${f(y - 24 * s)} ${f(x + 12 * s)} ${f(y - 28 * s)}Q${f(x)} ${f(y - 24 * s)} ${f(x - 10 * s)} ${f(y - 28 * s)}Q${f(x - 20 * s)} ${f(y - 24 * s)} ${f(x - 28 * s)} ${f(y - 27 * s)}Q${f(x - 34 * s)} ${f(y - 27 * s)} ${f(x - 33 * s)} ${f(y - 32 * s)}Z" fill="#f4f7ff"/>`;
  o += `<path d="M${f(x + 1 * s)} ${f(y - 55 * s)}L${f(x + 33 * s)} ${f(y - 32 * s)}Q${f(x + 33 * s)} ${f(y - 26 * s)} ${f(x + 27 * s)} ${f(y - 27 * s)}Q${f(x + 18 * s)} ${f(y - 24 * s)} ${f(x + 12 * s)} ${f(y - 28 * s)}Z" fill="#cdd8ef"/>`;
  return o;
}
function sailboat(x, y, s) {
  return `<path d="M${f(x - 14 * s)} ${f(y - 6 * s)}H${f(x + 14 * s)}L${f(x + 9 * s)} ${f(y)}H${f(x - 9 * s)}Z" fill="#c4553f"/>` +
    `<path d="M${f(x)} ${f(y - 7 * s)}V${f(y - 34 * s)}L${f(x + 13 * s)} ${f(y - 9 * s)}Z" fill="#fffdf6"/><path d="M${f(x - 1.5 * s)} ${f(y - 9 * s)}V${f(y - 28 * s)}L${f(x - 11 * s)} ${f(y - 9 * s)}Z" fill="#ffe6a8"/>` +
    `<rect x="${f(x - 0.8 * s)}" y="${f(y - 35 * s)}" width="${f(1.6 * s)}" height="${f(29 * s)}" fill="#7a4a30"/>`;
}
// rounded mountain with lit/shaded faces and optional snow cap
function mountain(x, B, h, w, c) {
  const T = B - h;
  let o = `<path d="M${f(x - w)} ${f(B)}L${f(x - 7)} ${f(T + 6)}Q${f(x)} ${f(T - 2)} ${f(x + 7)} ${f(T + 6)}L${f(x + w)} ${f(B)}Z" fill="${c.mid}"/>`;
  o += `<path d="M${f(x + 3)} ${f(T + 2)}Q${f(x + 6)} ${f(T + 4)} ${f(x + 7)} ${f(T + 6)}L${f(x + w)} ${f(B)}L${f(x + w * 0.18)} ${f(B)}L${f(x + w * 0.1)} ${f(B - h * 0.45)}Z" fill="${c.dark}"/>`;
  if (c.snow) {
    const k = 0.33, lx = x - w * k, rx = x + w * k, cy = T + h * k;
    o += `<path d="M${f(lx)} ${f(cy)}L${f(x - 7)} ${f(T + 6)}Q${f(x)} ${f(T - 2)} ${f(x + 7)} ${f(T + 6)}L${f(rx)} ${f(cy)}Q${f(x + w * 0.22)} ${f(cy - h * 0.1)} ${f(x + w * 0.12)} ${f(cy + h * 0.04)}Q${f(x + w * 0.02)} ${f(cy - h * 0.12)} ${f(x - w * 0.08)} ${f(cy + h * 0.03)}Q${f(x - w * 0.2)} ${f(cy - h * 0.08)} ${f(lx)} ${f(cy)}Z" fill="${c.snow}"/>`;
    o += `<path d="M${f(x + 3)} ${f(T + 2)}Q${f(x + 6)} ${f(T + 4)} ${f(x + 7)} ${f(T + 6)}L${f(rx)} ${f(cy)}Q${f(x + w * 0.22)} ${f(cy - h * 0.1)} ${f(x + w * 0.12)} ${f(cy + h * 0.04)}L${f(x + w * 0.06)} ${f(cy - h * 0.1)}Z" fill="${c.snowShade}"/>`;
  }
  return o;
}
function cloud(x, y, s, c) {
  const puffs = [[-34, -6, 18], [-12, -18, 24], [16, -14, 20], [36, -4, 14]];
  let o = `<rect x="${f(x - 50 * s)}" y="${f(y - 10 * s + 4 * s)}" width="${f(100 * s)}" height="${f(20 * s)}" rx="${f(10 * s)}" fill="${c.shade}"/>`;
  for (const [dx, dy, r] of puffs) o += circ(x + dx * s, y + dy * s + 4 * s, r * s, c.shade);
  o += `<rect x="${f(x - 50 * s)}" y="${f(y - 10 * s)}" width="${f(100 * s)}" height="${f(20 * s)}" rx="${f(10 * s)}" fill="${c.main}"/>`;
  for (const [dx, dy, r] of puffs) o += circ(x + dx * s, y + dy * s, r * s, c.main);
  o += ell(x - 16 * s, y - 28 * s, 10 * s, 5 * s, c.hi);
  return `<g opacity="${c.op || 1}">${o}</g>`;
}
function tulip(x, y, col, dark) {
  return `<path d="M${f(x)} ${f(y)}V${f(y - 6)}" stroke="#4e8f2c" stroke-width="1.4" stroke-linecap="round"/><path d="M${f(x - 2.6)} ${f(y - 9.5)}L${f(x - 2.6)} ${f(y - 6.5)}Q${f(x)} ${f(y - 4.6)} ${f(x + 2.6)} ${f(y - 6.5)}L${f(x + 2.6)} ${f(y - 9.5)}L${f(x + 1.3)} ${f(y - 8)}L${f(x)} ${f(y - 10)}L${f(x - 1.3)} ${f(y - 8)}Z" fill="${col}"/><path d="M${f(x)} ${f(y - 10)}L${f(x + 1.3)} ${f(y - 8)}L${f(x + 2.6)} ${f(y - 9.5)}L${f(x + 2.6)} ${f(y - 6.5)}Q${f(x + 1.4)} ${f(y - 5.4)} ${f(x)} ${f(y - 5.2)}Z" fill="${dark}"/>`;
}
function daisy(x, y) {
  let o = '';
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; o += circ(x + Math.cos(a) * 2.3, y + Math.sin(a) * 2.3, 1.7, '#ffffff'); }
  return o + circ(x, y, 1.4, '#ffc93c');
}

// ---------- seasons ----------
const S = {};
S.spring = {
  sky: { stops: [['0', '#7ccbef'], ['0.55', '#b4e3f6'], ['1', '#eef9f6']], sun: { x: 800, y: 96, r: 40, c: '#fff6c8', glow: '#fffbe0', glowA: 0.7 } },
  cloud: { main: '#ffffff', shade: '#d9eef8', hi: '#ffffff', op: 0.95 },
  far: () => {
    let o = band(300, [[22, 2, 0.3], [12, 5, 1.2], [6, 9, 2.1]], '#b7dce0');
    o += band(352, [[18, 3, 2.4], [10, 7, 0.4]], '#a6d6c4');
    // tiny distant blossom trees
    const r = rng(11);
    for (let i = 0; i < 16; i++) { const x = (i * 60 + r() * 30) % W, y = yAt(352, [[18, 3, 2.4], [10, 7, 0.4]], x) + 6; o += wrap(x, 12, X => circ(X, y - 2, 6.5, '#ecd3df') + circ(X + 7, y + 1, 5, '#e6c6d6') + circ(X - 6, y + 2, 4.5, '#e6c6d6')); }
    o += band(400, [[14, 2, 1.1], [8, 6, 2.8]], '#98cfa4');
    return o;
  },
  mid: () => {
    const T = [[16, 2, 0.9], [10, 5, 2.2], [5, 11, 0.4]], T2 = [[12, 3, 3.1], [6, 8, 1.0]], B2 = 436;
    let o = band(412, T, '#9fd283');
    const tc = { trunk: '#8a5a4a', dark: '#e98fb3', mid: '#f6b6cf', light: '#fcdbe7', dots: '#ffffff' };
    const gc = { dark: '#7bb768', mid: '#93cc78', light: '#bfe5a3' };
    for (const [x, s] of [[70, 1.05], [300, 0.85], [520, 1.15], [760, 0.95], [905, 0.75]]) { const y = yAt(412, T, x) + 6; o += wrap(x, 50 * s, X => puffTree(X, y, s, tc)); }
    o += band(B2, T2, '#acd98a') + band(B2 + 12, T2, '#9dcf7c');
    for (const [x, s] of [[180, 0.9], [420, 0.7], [640, 0.8], [850, 1]]) { const y = yAt(B2, T2, x) + 6; o += wrap(x, 30 * s, X => bush(X, y, s, gc)); }
    for (let i = 0; i < 60; i++) { const x = i * 16 + (i * 7) % 9, y = yAt(B2, T2, x) + 5 + (i % 3) * 4; const c = ['#ffffff', '#ffd1e0', '#fff1a6'][i % 3]; o += wrap(x, 3, X => circ(X, y, 1.8, c)); }
    const fy = x => yAt(B2, T2, x) + 8;
    o += fence(560, 700, fy(630), '#f3ead8');
    return o;
  },
  ground: { lip: '#a8d84f', lipDark: '#86bb3c', lipHi: '#c9ea7a', dirt: '#b98353', dirtDark: '#9c6a42', pebble: '#d6a676', deco: 'spring' },
};
S.summer = {
  sky: { stops: [['0', '#2a86db'], ['0.6', '#6cbcf0'], ['1', '#c9ecfa']], sun: { x: 790, y: 104, r: 54, c: '#ffe066', glow: '#fff3b0', glowA: 0.85, rays: true } },
  cloud: { main: '#ffffff', shade: '#cfe6f7', hi: '#ffffff', op: 1 },
  far: () => {
    let o = '';
    const r = rng(5);
    const peaks = [[60, 150, 150], [250, 110, 130], [410, 165, 170], [600, 120, 140], [790, 150, 160], [930, 105, 120]];
    for (const [x, h, w] of peaks) o += wrap(x, w, X => mountain(X, 420, h, w, { mid: '#8fb4d8', dark: '#7ea3cb' }));
    o += band(372, [[16, 3, 0.2], [9, 7, 1.4]], '#82c09a');
    for (let i = 0; i < 20; i++) { const x = i * 48 + r() * 20, y = yAt(372, [[16, 3, 0.2], [9, 7, 1.4]], x) + 8; o += wrap(x, 10, X => ell(X, y - 6, 6, 9, '#6fae8a')); }
    o += band(410, [[10, 2, 2.0], [6, 5, 0.7]], '#73b78a');
    return o;
  },
  mid: () => {
    // lake
    let o = `<rect x="0" y="418" width="960" height="122" fill="#6ec3e6"/><rect x="0" y="418" width="960" height="5" fill="#a9def2"/>`;
    for (let i = 0; i < 24; i++) { const x = (i * 40 + (i % 3) * 13) % W, y = 428 + (i * 7) % 26; o += wrap(x, 14, X => `<rect x="${f(X - 12)}" y="${y}" width="24" height="2.4" rx="1.2" fill="#c3ebf8" opacity="0.8"/>`); }
    o += wrap(560, 20, X => sailboat(X, 436, 1));
    const T = [[30, 2, 0.5], [14, 4, 2.6], [6, 9, 1.3]];
    const B = 450;
    o += band(B, T, '#4f9c6c');
    o += band(B + 12, T, '#438e60');
    const tc = { trunk: '#7a5236', dark: '#2b6b4b', mid: '#388759', light: '#5fae7a' };
    const r = rng(3);
    for (let x = 10; x < W; x += 34) {
      const y = yAt(B, T, x) + 6; if (y > 452) continue;
      const s = 0.7 + r() * 0.45;
      const isP = r() < 0.25;
      o += wrap(x, 50 * s, X => (isP ? poplar(X, y, s, tc) : puffTree(X, y, s, tc)));
    }
    for (let x = 0; x < W; x += 16) { const y = yAt(B + 12, T, x) + 4; if (y > 450 || Math.floor(x / 16) % 6 > 2) continue; const h = 18 + (x * 13) % 10; o += wrap(x, 14, X => sunflower(X, y + 10, 0.75, h)); }
    return o;
  },
  ground: { lip: '#9fd246', lipDark: '#7cb43a', lipHi: '#c6ea6e', dirt: '#c99258', dirtDark: '#ac7646', pebble: '#e3b67f', deco: 'summer' },
};
S.autumn = {
  sky: { stops: [['0', '#8fb0d6'], ['0.45', '#e9c3b0'], ['0.8', '#f8cfa0'], ['1', '#fde4bd']], sun: { x: 760, y: 250, r: 46, c: '#ffd27a', glow: '#ffe2a8', glowA: 0.8 } },
  cloud: { main: '#fff3e6', shade: '#f2cdb8', hi: '#ffffff', op: 0.92 },
  far: () => {
    let o = band(318, [[24, 2, 1.8], [12, 4, 0.2], [6, 9, 2.5]], '#d7b3b4');
    const T = [[18, 3, 0.6], [9, 6, 2.9]];
    o += band(368, T, '#d9a888');
    const r = rng(9);
    for (let i = 0; i < 22; i++) { const x = i * 44 + r() * 20, y = yAt(368, T, x) + 7; const c = ['#d98a68', '#e2a35e', '#c97b6a'][i % 3]; o += wrap(x, 12, X => circ(X, y - 1, 7.5, c) + circ(X + 7, y + 2, 5.5, c)); }
    o += band(410, [[12, 2, 0.3], [7, 5, 1.9]], '#cfa070');
    return o;
  },
  mid: () => {
    const T = [[15, 2, 2.4], [9, 5, 0.6], [4, 10, 1.7]], T2 = [[10, 3, 1.3], [6, 7, 2.6]], B2 = 436;
    let o = band(414, T, '#c9a04c');
    const cols = [
      { trunk: '#7a4a32', dark: '#c4452f', mid: '#e0623f', light: '#f29a6e' },
      { trunk: '#7a4a32', dark: '#d9822a', mid: '#f0a03a', light: '#f8c66e' },
      { trunk: '#7a4a32', dark: '#d9ad2a', mid: '#f2cb46', light: '#fbe38a' },
    ];
    [[60, 1.0, 0], [190, 0.8, 2], [330, 1.1, 1], [470, 0.85, 0], [640, 1.05, 2], [800, 0.9, 1], [920, 0.75, 0]].forEach(([x, s, ci]) => { const y = yAt(414, T, x) + 6; o += wrap(x, 50 * s, X => puffTree(X, y, s, cols[ci])); });
    o += band(B2, T2, '#bf9442') + band(B2 + 12, T2, '#b0853a');
    [[120, 1], [560, 0.85], [870, 1.1]].forEach(([x, s]) => { const y = yAt(B2, T2, x) + 8; o += wrap(x, 30 * s, X => haystack(X, y, s)); });
    [[240, 1], [262, 0.75], [700, 0.9], [420, 0.8]].forEach(([x, s]) => { const y = yAt(B2, T2, x) + 9; o += wrap(x, 14, X => pumpkin(X, y, s)); });
    o += fence(300, 440, yAt(B2, T2, 370) + 9, '#8a5a3a');
    return o;
  },
  ground: { lip: '#d6a640', lipDark: '#b88530', lipHi: '#ecc76a', dirt: '#9a663e', dirtDark: '#7f5232', pebble: '#b98a5e', deco: 'autumn' },
};
S.winter = {
  sky: { stops: [['0', '#7f8fc4'], ['0.5', '#aab5de'], ['1', '#e6e6f4']], sun: { x: 770, y: 118, r: 34, c: '#fff4e2', glow: '#ffffff', glowA: 0.55 } },
  cloud: { main: '#f3f4fb', shade: '#cfd3ea', hi: '#ffffff', op: 0.9 },
  far: () => {
    let o = '';
    const peaks = [[40, 170, 150], [210, 130, 130], [370, 190, 170], [560, 140, 140], [730, 180, 165], [900, 125, 125]];
    for (const [x, h, w] of peaks) o += wrap(x, w, X => mountain(X, 430, h, w, { mid: '#97a3cf', dark: '#8390c1', snow: '#f1f3fc', snowShade: '#d3d9f0' }));
    o += band(388, [[14, 3, 1.0], [8, 7, 0.1]], '#dfe5f6');
    const r = rng(21);
    for (let i = 0; i < 20; i++) { const x = i * 48 + r() * 24, y = yAt(388, [[14, 3, 1.0], [8, 7, 0.1]], x) + 8; o += wrap(x, 8, X => `<path d="M${f(X - 6)} ${f(y)}L${f(X)} ${f(y - 20)}L${f(X + 6)} ${f(y)}Z" fill="#a9b6d6"/>`); }
    o += band(414, [[10, 2, 2.2], [5, 6, 0.8]], '#d2daf0');
    return o;
  },
  mid: () => {
    const T = [[16, 2, 0.4], [9, 5, 2.0], [4, 11, 1.1]], T2 = [[10, 3, 2.7], [6, 7, 0.9]], B2 = 436;
    let o = band(414, T, '#e9eefb') + band(424, T, '#d7e0f4');
    const pc = { trunk: '#6d4c3e', dark: '#2f5a5e', mid: '#3d7070' }, sn = { mid: '#f4f7ff', dark: '#cdd8ef' };
    [[40, 1.1], [80, 0.8], [250, 1.0], [470, 1.2], [510, 0.85], [690, 0.95], [880, 1.05], [925, 0.8]].forEach(([x, s]) => { const y = yAt(414, T, x) + 8; o += wrap(x, 28 * s, X => pine(X, y, s, pc, sn)); });
    o += band(B2, T2, '#f2f5fd') + band(B2 + 12, T2, '#dbe3f5');
    o += wrap(360, 50, X => cottage(X, yAt(B2, T2, 360) + 8, 1.4));
    [[600, 0.8], [780, 0.7], [140, 0.75]].forEach(([x, s]) => { const y = yAt(B2, T2, x) + 8; o += wrap(x, 30 * s, X => bush(X, y, s, { dark: '#cdd8ef', mid: '#f4f7ff', light: '#ffffff' })); });
    return o;
  },
  ground: { lip: '#f5f8ff', lipDark: '#cfdbf2', lipHi: '#ffffff', dirt: '#86727c', dirtDark: '#6e5c68', pebble: '#a3919a', deco: 'winter', lipDepth: 18 },
};

function skySVG(s) {
  const sk = S[s].sky, sun = sk.sun;
  let defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${sk.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  defs += `<radialGradient id="sg"><stop offset="0" stop-color="${sun.glow}" stop-opacity="${sun.glowA}"/><stop offset="0.35" stop-color="${sun.glow}" stop-opacity="${sun.glowA * 0.45}"/><stop offset="1" stop-color="${sun.glow}" stop-opacity="0"/></radialGradient>`;
  let o = `<rect width="960" height="540" fill="url(#g)"/>`;
  o += circ(sun.x, sun.y, sun.r * 3.4, 'url(#sg)');
  if (sun.rays) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const x1 = sun.x + Math.cos(a) * sun.r * 1.25, y1 = sun.y + Math.sin(a) * sun.r * 1.25, x2 = sun.x + Math.cos(a) * sun.r * 1.65, y2 = sun.y + Math.sin(a) * sun.r * 1.65; o += `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" stroke="#ffe680" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`; } }
  o += circ(sun.x, sun.y, sun.r, sun.c) + circ(sun.x - sun.r * 0.25, sun.y - sun.r * 0.25, sun.r * 0.55, '#ffffff', ' opacity="0.35"');
  return svg(960, 540, o, defs);
}
function cloudsSVG(s) {
  const c = S[s].cloud;
  const list = { spring: [[90, 90, 0.9], [330, 150, 0.6], [560, 70, 1.0], [880, 170, 0.7]], summer: [[120, 70, 1.15], [430, 160, 0.75], [640, 60, 0.9], [930, 140, 1.0]], autumn: [[100, 120, 0.8], [380, 70, 1.0], [620, 165, 0.65], [880, 95, 0.9]], winter: [[60, 80, 1.1], [320, 140, 0.8], [600, 90, 1.0], [850, 175, 0.7]] }[s];
  let o = '';
  for (const [x, y, sc] of list) o += wrap(x, 56 * sc, X => cloud(X, y, sc, c));
  return svg(960, 540, o);
}
function groundSVG(s) {
  const g = S[s].ground, d = g.lipDepth || 14, r = rng(s.length * 31 + 7);
  let o = `<rect width="960" height="80" fill="${g.dirt}"/>`;
  // soil strata (periodic)
  o += band(46, [[3, 8, 0.3], [2, 20, 1.1]], g.dirtDark, 80, 4);
  // pebbles (periodic layout, wrapped)
  for (let i = 0; i < 26; i++) {
    const x = i * 37 + r() * 20, y = 24 + r() * 46, rx = 3 + r() * 4, ry = rx * 0.65, col = y > 46 ? g.pebble : g.pebble;
    o += wrap(x, rx + 2, X => ell(X, y, rx, ry, col, ' opacity="0.75"') + ell(X - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.35, '#ffffff', ' opacity="0.25"'));
  }
  // lip: shade layer then main, scalloped bottom edge (period 24 divides 960)
  const scal = (base, amp) => { let p = `M0 0L960 0L960 ${base}`; for (let x = 960; x >= 0; x -= 4) p += `L${x} ${f(base + amp * Math.abs(Math.sin(Math.PI * x / 24)))}`; return p + 'Z'; };
  o += `<path d="${scal(d + 2, 4)}" fill="${g.lipDark}"/>`;
  o += `<path d="${scal(d - 2, 3)}" fill="${g.lip}"/>`;
  o += `<rect x="0" y="0" width="960" height="3" fill="${g.lipHi}"/>`;
  // lip decoration
  if (g.deco === 'spring') {
    for (let i = 0; i < 40; i++) { const x = i * 24 + 6 + (i * 7) % 11; if (i % 3 === 0) o += wrap(x, 4, X => tulip(X, 12, ['#ff7a9a', '#ffb347', '#ff9fd0'][i % 3 === 0 ? (i / 3) % 3 : 0], '#e2577a')); else if (i % 3 === 1) o += wrap(x, 4, X => daisy(X, 7)); }
  } else if (g.deco === 'summer') {
    for (let i = 0; i < 48; i++) { const x = i * 20 + 5 + (i * 7) % 9; o += wrap(x, 4, X => `<path d="M${f(X - 3)} 11L${f(X - 1)} 5L${f(X)} 10L${f(X + 2)} 4L${f(X + 3)} 11Z" fill="${g.lipDark}"/>`); if (i % 5 === 2) o += wrap(x + 9, 3, X => circ(X, 7, 2, '#ffffff') + circ(X, 7, 0.9, '#ffd84a')); }
  } else if (g.deco === 'autumn') {
    for (let i = 0; i < 40; i++) { const x = i * 24 + 7 + (i * 11) % 13, c = ['#d9532f', '#ef8a2e', '#f2c13a', '#b5462c'][i % 4]; o += wrap(x, 5, X => `<ellipse cx="${f(X)}" cy="${f(6 + (i % 3) * 2)}" rx="4" ry="2" fill="${c}" transform="rotate(${(i * 37) % 60 - 30} ${f(X)} ${f(6 + (i % 3) * 2)})"/>`); }
  } else {
    for (let i = 0; i < 30; i++) { const x = i * 32 + 9 + (i * 13) % 15; o += wrap(x, 3, X => ell(X, 9 + (i % 3) * 2, 6, 1.6, g.lipDark, ' opacity="0.7"')); if (i % 4 === 1) o += wrap(x + 12, 3, X => `<path d="M${f(X)} 3V8M${f(X - 2.5)} 5.5H${f(X + 2.5)}" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`); }
  }
  return svg(960, 80, o);
}

// ---------- particles ----------
const P = {};
const petalD = 'M16 28C8.5 22.5 6.5 13.5 10 6.5C11.8 4.2 14.2 5 16 8C17.8 5 20.2 4.2 22 6.5C25.5 13.5 23.5 22.5 16 28Z';
P.petal = `<path d="${petalD}" fill="#f9bcd3" stroke="#d97aa0" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 27C20.5 22 22.5 15 21 8.5C24 14 23 22 16 27Z" fill="#f29abd"/><path d="M12.5 21C10.5 17 10.3 12.5 11.5 9.5" stroke="#fde3ed" stroke-width="2" fill="none" stroke-linecap="round"/>`;
P.blossom = (() => {
  let o = '';
  const pd = 'M16 16C12.5 13.5 11.6 9 13 5.5C14 4.3 15.2 4.6 16 6C16.8 4.6 18 4.3 19 5.5C20.4 9 19.5 13.5 16 16Z';
  for (let i = 0; i < 5; i++) o += `<path d="${pd}" fill="#f9bcd3" stroke="#d97aa0" stroke-width="1.3" stroke-linejoin="round" transform="rotate(${i * 72} 16 16)"/>`;
  for (let i = 0; i < 5; i++) o += `<path d="M16 15C15 12 15 9.5 16 7.5" stroke="#fde3ed" stroke-width="1.4" fill="none" stroke-linecap="round" transform="rotate(${i * 72 - 8} 16 16)"/>`;
  o += circ(16, 16, 3.4, '#ffd166', ' stroke="#e0a030" stroke-width="1"');
  for (let i = 0; i < 5; i++) { const a = (i * 72 + 36 - 90) * Math.PI / 180; o += circ(16 + Math.cos(a) * 5.2, 16 + Math.sin(a) * 5.2, 0.9, '#d9576f'); }
  return o;
})();
function polarPath(fn, n = 180, cx = 16, cy = 16) { let d = ''; for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + i / n * Math.PI * 2, r = fn(t); d += (i ? 'L' : 'M') + f(cx + Math.cos(t) * r) + ' ' + f(cy + Math.sin(t) * r); } return d + 'Z'; }
P.leaf_red = (() => {
  const lobes = [[-90, 13], [-30, 12], [-150, 12], [25, 9], [155, 9]]; // degrees, length
  const fn = t => { let r = 6.4; for (const [a, L] of lobes) { let dd = Math.atan2(Math.sin(t - a * Math.PI / 180), Math.cos(t - a * Math.PI / 180)); const q = Math.max(0, 1 - Math.abs(dd) / 0.62); r = Math.max(r, 6.4 + (L - 6.4) * (q * q * (3 - 2 * q)) ** 0.8); } return r; };
  const d = polarPath(fn, 240, 16, 17.5);
  let o = `<path d="M16 22V29.5" stroke="#8a2a1e" stroke-width="1.8" stroke-linecap="round"/>`;
  o += `<path d="${d}" fill="#e2483a" stroke="#9c2a20" stroke-width="1.5" stroke-linejoin="round"/>`;
  o += `<path d="M16 17.5L16.1 5.5M16 17.5L25.4 10.9M16 17.5L6.6 10.9M16 17.5L23.7 19.6M16 17.5L8.3 19.6" stroke="#b2302a" stroke-width="1.1" stroke-linecap="round"/>`;
  o += `<path d="M11 8.5L14 6.8" stroke="#f58a72" stroke-width="1.4" stroke-linecap="round"/>`;
  return o;
})();
P.leaf_orange = `<path d="M16 28.5V31" stroke="#8a4a1a" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3C23.5 8 25 18 16 29C7 18 8.5 8 16 3Z" fill="#f08a2c" stroke="#a8541a" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 4.5C22.5 9 23.5 18 16 27.5Z" fill="#dd7322"/><path d="M16 5V28M16 11L20.5 8.5M16 16L21.8 13M16 21L20.6 18.5M16 11L11.5 8.5M16 16L10.2 13M16 21L11.4 18.5" stroke="#b15a1a" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M12.4 9.5C11.4 12 11.2 14 11.6 16" stroke="#f9b46a" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
P.leaf_yellow = `<path d="M16 17V27" stroke="#9a7a1a" stroke-width="1.7" stroke-linecap="round"/><path d="M16 18.5C11.5 15 5.5 12 4 7.5C8 3.5 13 3.2 15.2 5.8L16 8.5L16.8 5.8C19 3.2 24 3.5 28 7.5C26.5 12 20.5 15 16 18.5Z" fill="#f6cd3c" stroke="#b08a1e" stroke-width="1.5" stroke-linejoin="round"/><path d="M16.6 17.6C20 15 25 12.2 26.6 8.2C27 9 27.3 8.2 28 7.5C26.5 12 20.5 15 16 18.5Z" fill="#e2b52a"/><path d="M16 18L7 8M16 18L10.5 6M16 18L13.5 5.2M16 18L25 8M16 18L21.5 6M16 18L18.5 5.2" stroke="#d1a524" stroke-width="0.9" stroke-linecap="round"/>`;
P.snowflake = (() => {
  let arm = 'M16 16V3.5M16 8L12.8 5M16 8L19.2 5M16 12L13.2 9.6M16 12L18.8 9.6';
  let o = '';
  for (const [col, w] of [['#8fb8e6', 4.6], ['#ffffff', 2.2]]) for (let i = 0; i < 6; i++) o += `<path d="${arm}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="rotate(${i * 60} 16 16)"/>`;
  o += circ(16, 16, 2.6, '#ffffff', ' stroke="#8fb8e6" stroke-width="1.4"');
  return o;
})();
// butterfly wings defined as point lists (top view), scaled in x for closed version
function butterfly(sx) {
  const X = x => f(16 + (x - 16) * sx);
  const fw = (side) => { const s = side; return `M${X(16 + s * 1)} 14C${X(16 + s * 4)} 6 ${X(16 + s * 10)} 2.5 ${X(16 + s * 13.5)} 4.5C${X(16 + s * 15.5)} 7 ${X(16 + s * 13.5)} 13 ${X(16 + s * 1)} 16Z`; };
  const hw = (side) => { const s = side; return `M${X(16 + s * 1)} 16.5C${X(16 + s * 10)} 15.5 ${X(16 + s * 13)} 20 ${X(16 + s * 11.5)} 24C${X(16 + s * 9)} 27.5 ${X(16 + s * 4)} 25 ${X(16 + s * 1)} 19Z`; };
  let o = '';
  for (const s of [-1, 1]) {
    o += `<path d="${hw(s)}" fill="#b07ae6" stroke="#5e3496" stroke-width="1.4" stroke-linejoin="round"/>`;
    o += `<path d="${fw(s)}" fill="#c896f2" stroke="#5e3496" stroke-width="1.4" stroke-linejoin="round"/>`;
    o += `<path d="M${X(16 + s * 2.2)} 14.4C${X(16 + s * 6)} 12.6 ${X(16 + s * 10)} 10.8 ${X(16 + s * 13.2)} 9.6C${X(16 + s * 13.6)} 12 ${X(16 + s * 9)} 14.2 ${X(16 + s * 2.2)} 15.6Z" fill="#a46ad8"/>`;
    o += ell(+X(16 + s * 10.5), 6.6, 1.8 * sx + 0.3, 1.6, '#ffe27a') + ell(+X(16 + s * 8), 21.6, 1.6 * sx + 0.3, 1.5, '#ffe27a') + ell(+X(16 + s * 6.4), 8.4, 1.0 * sx + 0.2, 1.0, '#ffffff', ' opacity="0.8"');
  }
  o += `<path d="M15.2 9.5Q13.6 5 11.8 3.6M16.8 9.5Q18.4 5 20.2 3.6" stroke="#4a2a6e" stroke-width="1.1" fill="none" stroke-linecap="round"/>` + circ(11.8, 3.6, 1, '#4a2a6e') + circ(20.2, 3.6, 1, '#4a2a6e');
  o += ell(16, 16.5, 1.7, 7.5, '#4a2a6e') + circ(16, 9.6, 2, '#4a2a6e') + circ(15.4, 13, 0.6, '#8a64b0');
  return o;
}
P.butterfly_a = butterfly(1);
P.butterfly_b = butterfly(0.26);
P.seed = (() => {
  let o = `<path d="M16 15V25.5" stroke="#8a9bb4" stroke-width="2.2" stroke-linecap="round"/><path d="M16 15V25.5" stroke="#ffffff" stroke-width="1" stroke-linecap="round"/>`;
  o += ell(16, 27.6, 1.5, 2.6, '#a07850', ' stroke="#6e5232" stroke-width="0.8"');
  let lines = '', dots = '';
  for (let i = 0; i < 11; i++) { const a = (-90 + (i - 5) * 15) * Math.PI / 180, L = 11.5 - Math.abs(i - 5) * 0.35; const x = 16 + Math.cos(a) * L, y = 15 + Math.sin(a) * L; lines += `M16 15L${f(x)} ${f(y)}`; dots += circ(x, y, 1.15, '#ffffff', ' stroke="#9fb0c8" stroke-width="0.7"'); for (const da of [-0.22, 0.22]) { lines += `M${f(16 + Math.cos(a) * L * 0.7)} ${f(15 + Math.sin(a) * L * 0.7)}L${f(16 + Math.cos(a + da) * L * 0.95)} ${f(15 + Math.sin(a + da) * L * 0.95)}`; } }
  o += `<path d="${lines}" stroke="#9fb0c8" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="${lines}" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round" fill="none"/>` + dots + circ(16, 15, 1.4, '#ffffff', ' stroke="#9fb0c8" stroke-width="0.7"');
  return o;
})();

// ---------- write ----------
for (const s of Object.keys(S)) {
  const dir = path.join(OUT, 'seasons', s); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sky.svg'), skySVG(s));
  fs.writeFileSync(path.join(dir, 'clouds.svg'), cloudsSVG(s));
  fs.writeFileSync(path.join(dir, 'far.svg'), svg(960, 540, S[s].far()));
  const glow = s === 'winter' ? `<radialGradient id="glow"><stop offset="0" stop-color="#ffd56b" stop-opacity="0.7"/><stop offset="1" stop-color="#ffd56b" stop-opacity="0"/></radialGradient>` : '';
  fs.writeFileSync(path.join(dir, 'mid.svg'), svg(960, 540, S[s].mid(), glow));
  fs.writeFileSync(path.join(dir, 'ground.svg'), groundSVG(s));
}
const pdir = path.join(OUT, 'particles'); fs.mkdirSync(pdir, { recursive: true });
for (const [k, v] of Object.entries(P)) fs.writeFileSync(path.join(pdir, k + '.svg'), svg(32, 32, v));
console.log('done');
