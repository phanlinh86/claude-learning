// Ziggy's Apple Castle: environment art generator (4 times of day + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg     960x540 opaque, tiles in x. Sun/moon/big clouds outside x 380–580 below y 150.
//  - levels/<zone>/far.svg     960x540, the castle on a hill; transparent sky above the roofs, opaque below y 440, tiles in x.
//  - levels/<zone>/ground.svg  960x180, surface line y 40 (flat for x 300–660), opaque soil below, props at the sides.
//  - particles/*.svg           32x32, centred, transparent edges.
// Also writes tools/art-environment/lights.json: the lit windows / lamps per zone (svg coords) for the renderer's glints.
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
const dark = (c, t = 0.45) => mix(c, '#1a1030', t);   // outline / shade: dark violet tone of the fill, never black
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
const wrapG = (x0, x1, body) => body + (x0 <= 0 ? `<g transform="translate(${W} 0)">${body}</g>` : '') + (x1 >= W ? `<g transform="translate(${-W} 0)">${body}</g>` : '');
const prof = (base, terms) => x => base + terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const profPath = (fy, yBottom, step = 4, x0 = 0, x1 = W) => { let d = `M${x0} ${yBottom}`; for (let x = x0; x <= x1 + 0.01; x += step) d += `L${f(x)} ${f(fy(x))}`; return d + `L${x1} ${yBottom}Z`; };
const profLine = (fy, step = 4, x0 = 0, x1 = W) => { let d = ''; for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + f(x) + ' ' + f(fy(x)); return d; };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
let UID = 0; const uid = p => p + (UID++);

// Calm column: x 380–580 below y 150 only gets tiny dim stars.
const inCalm = (x, y, pad = 0) => x > 380 - pad && x < 580 + pad && y > 150 - pad;
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
function twinkles(R, n, y0, y1, col, rmin, rmax, avoid = []) {
  let s = '', k = 0, guard = 0;
  while (k < n && guard++ < 500) {
    const x = 20 + R() * (W - 40), y = y0 + R() * (y1 - y0), r = rmin + R() * (rmax - rmin);
    if (inCalm(x, y, 30) || avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
    s += pth(twinkle(x, y, r, 0.2), col, op(0.85)); k++;
  }
  return s;
}

// ---------- sky pieces ----------
// fluffy cloud, flat-ish bottom at y; s = scale; wrap-safe
function cloud(x, y, s, col, shade, hi, a = 1) {
  const bumps = [[-40, -8, 18], [-20, -20, 24], [6, -27, 27], [30, -15, 21], [48, -6, 14], [-52, -2, 11]];
  let o = `<g opacity="${a}">`;
  o += ell(x, y + 1 * s, 62 * s, 9 * s, shade);
  for (const [dx, dy, r] of bumps) o += circ(x + dx * s, y + dy * s + 3 * s, r * s, shade);
  for (const [dx, dy, r] of bumps) o += circ(x + dx * s, y + dy * s, r * s, col);
  o += ell(x, y - 5 * s, 58 * s, 9 * s, col);
  o += ell(x - 2 * s, y - 36 * s, 13 * s, 6 * s, hi, op(0.8)) + ell(x - 26 * s, y - 28 * s, 9 * s, 4 * s, hi, op(0.7));
  return wrapG(x - 70 * s, x + 70 * s, o + '</g>');
}
// a long soft streak cloud (dawn/sunset bands)
function streak(x, y, w, h, col, a = 1, hi = null) {
  let o = rect(x - w / 2, y - h / 2, w, h, col, ` rx="${f(h / 2)}"` + op(a));
  o += rect(x - w * 0.3, y - h * 1.1, w * 0.5, h * 0.9, col, ` rx="${f(h * 0.45)}"` + op(a));
  if (hi) o += rect(x - w * 0.26, y - h * 1.0, w * 0.3, h * 0.28, hi, ` rx="${f(h * 0.14)}"` + op(a * 0.8));
  return wrapG(x - w / 2, x + w / 2, o);
}

// ---------- castle pieces ----------
// arched window: top-left (x-ww/2, y), size ww × wh. kind: 'dark' | 'lit' | 'ghost'
function archWin(x, y, ww, wh, kind, p, lights, gid) {
  const L = x - ww / 2, R = x + ww / 2, r = ww / 2;
  const d = `M${f(L)} ${f(y + wh)}L${f(L)} ${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(R)} ${f(y + r)}L${f(R)} ${f(y + wh)}Z`;
  let o = '';
  if (kind === 'dark') {
    o += pth(d, p.win, OL(p.ol, 2.2));
    o += stk(`M${f(L + 3)} ${f(y + wh - 3)}L${f(L + 3)} ${f(y + r)}`, lite(p.win, 0.18), 1.5, op(0.6));
  } else {
    o += circ(x, y + wh * 0.55, Math.max(ww, wh) * 1.05, `url(#${gid})`);
    o += pth(d, p.lit, OL(p.ol, 2.2));
    o += ell(x, y + wh * 0.62, ww * 0.32, wh * 0.3, p.litCore, op(0.9));
    if (kind === 'ghost') {
      // a shy friendly ghost peeking from the left side of the window, little hand on the sill
      const gid2 = uid('wc');
      o += `<clipPath id="${gid2}"><path d="${d}"/></clipPath><g clip-path="url(#${gid2})">`;
      const gx = L + ww * 0.36, gy = y + wh * 0.56, gr = ww * 0.5;
      o += circ(gx, gy, gr, '#f4f0ff', OL('#8a7fc0', 1.6)) + rect(gx - gr, gy, gr * 2, wh, '#f4f0ff');
      o += circ(gx + gr * 0.42, gy - gr * 0.1, gr * 0.17, '#3a3070') + circ(gx + gr * 0.47, gy - gr * 0.17, gr * 0.06, '#ffffff');
      o += circ(gx - gr * 0.05, gy - gr * 0.1, gr * 0.15, '#3a3070');
      o += ell(gx + gr * 0.55, gy + gr * 0.25, gr * 0.17, gr * 0.1, '#ffb0c8', op(0.9));
      o += stk(`M${f(gx + gr * 0.05)} ${f(gy + gr * 0.3)}Q${f(gx + gr * 0.22)} ${f(gy + gr * 0.45)} ${f(gx + gr * 0.36)} ${f(gy + gr * 0.3)}`, '#3a3070', 1.1);
      o += '</g>';
      o += pth(d, 'none', OL(p.ol, 2.2));
      o += ell(gx + gr * 0.5, y + wh - 1, gr * 0.34, gr * 0.24, '#f4f0ff', OL('#8a7fc0', 1.2)); // little hand
    } else {
      o += stk(`M${f(x)} ${f(y + 3)}L${f(x)} ${f(y + wh)}M${f(L)} ${f(y + wh * 0.55)}L${f(R)} ${f(y + wh * 0.55)}`, p.ol, 1.6, op(0.75));
    }
    lights.push({ x: Math.round(x), y: Math.round(y + wh * 0.55), r: Math.round(Math.max(ww, wh) * 0.9), kind });
  }
  o += rect(L - 2.5, y + wh - 1, ww + 5, 4, p.stone, OL(p.ol, 1.6) + ' rx="1.5"');
  return o;
}
// one rounded crooked turret with a cone roof and a pennant. t: {x, base, w, top, roofH, lean, tip, wins:[[dy, ww, wh, kind]], pen}
function tower(t, p, R, lights, gid) {
  const { x, w, top, base } = t, L = x - w / 2, Rr = x + w / 2;
  const cid = uid('tc');
  const body = `M${f(L)} ${base}L${f(L + 2)} ${top + 4}Q${f(L + 2)} ${top} ${f(L + 6)} ${top}L${f(Rr - 6)} ${top}Q${f(Rr - 2)} ${top} ${f(Rr - 2)} ${top + 4}L${f(Rr)} ${base}Z`;
  let o = `<clipPath id="${cid}"><path d="${body}"/></clipPath>`;
  o += pth(body, p.stone);
  o += `<g clip-path="url(#${cid})">` + rect(x + w * 0.2, top - 2, w, base - top + 4, p.shade);
  for (let i = 0; i < Math.round((base - top) / 22); i++) {
    const by = top + 16 + i * 22 + R() * 6, bx = L + 6 + R() * (w - 22), bw = 8 + R() * 10;
    o += stk(`M${f(bx)} ${f(by)}L${f(bx + bw)} ${f(by)}`, p.ol, 1.6, op(0.28));
  }
  o += rect(L + 4, top + 4, 4, base - top, lite(p.stone, 0.22), op(0.55));
  o += '</g>' + pth(body, 'none', OL(p.ol, 3));
  // rim band
  o += rect(L - 5, top - 9, w + 10, 13, p.stone, OL(p.ol, 3) + ' rx="4"') + rect(x + w * 0.2, top - 7.5, w / 2 - w * 0.2 + 3.5, 10, p.shade, ' rx="3"');
  // cone roof with a soft eave and a crooked tip
  const rb = top - 7, rl = L - 10, rr = Rr + 10, tx = x + (t.tip || 0), ty = rb - t.roofH;
  const roof = `M${f(rl)} ${f(rb)}Q${f(rl + (tx - rl) * 0.62)} ${f(rb - t.roofH * 0.3)} ${f(tx)} ${f(ty)}Q${f(rr - (rr - tx) * 0.62)} ${f(rb - t.roofH * 0.3)} ${f(rr)} ${f(rb)}Q${f(x)} ${f(rb + 8)} ${f(rl)} ${f(rb)}Z`;
  const rcid = uid('rc');
  o += `<clipPath id="${rcid}"><path d="${roof}"/></clipPath>`;
  o += pth(roof, p.roof);
  o += `<g clip-path="url(#${rcid})">` + pth(`M${f(tx)} ${f(ty - 4)}L${f(x + w * 0.12)} ${f(rb + 10)}L${f(rr + 4)} ${f(rb + 10)}L${f(rr + 4)} ${f(ty - 4)}Z`, p.roofShade);
  for (let k = 1; k <= 2; k++) { const yy = rb - t.roofH * k * 0.3; o += stk(`M${f(rl - 4)} ${f(yy + 6)}Q${f(x)} ${f(yy + 12)} ${f(rr + 4)} ${f(yy + 6)}`, p.ol, 1.4, op(0.3)); }
  o += stk(`M${f(rl + 8)} ${f(rb - 3)}Q${f(rl + (tx - rl) * 0.6)} ${f(rb - t.roofH * 0.35)} ${f(tx - 3)} ${f(ty + 10)}`, lite(p.roof, 0.35), 2.2, op(0.6));
  o += '</g>' + pth(roof, 'none', OL(p.ol, 3));
  // pennant / tip ball
  if (t.pen) {
    const py = ty - 22;
    o += stk(`M${f(tx)} ${f(ty)}L${f(tx)} ${f(py)}`, p.ol, 2);
    const fw = t.penW || 22;
    o += pth(`M${f(tx)} ${f(py)}Q${f(tx + fw * 0.5)} ${f(py + 1)} ${f(tx + fw)} ${f(py + 5)}Q${f(tx + fw * 0.5)} ${f(py + 7)} ${f(tx)} ${f(py + 11)}Z`, t.pen, OL(p.ol, 1.6));
  }
  o += circ(tx, ty, 3.2, p.tip || p.roof, OL(p.ol, 1.6));
  for (const [dy, ww, wh, kind] of t.wins || []) o += archWin(x, top + dy, ww, wh, kind, p, lights, gid);
  return t.lean ? `<g transform="rotate(${t.lean} ${x} ${base})">${o}</g>` : o;
}
// curtain wall with merlons (period 30 → tileable); centre section 345–615 lower with an arcade (the old bridge)
function wall(p, R) {
  const topAt = x => (x > 345 && x < 615) ? 372 : 352;
  let d = `M-30 470`;
  for (let x = -30; x < W + 30; x += 30) {
    const t = topAt(x + 15);
    d += `L${x} ${t}L${x + 7} ${t}L${x + 7} ${t - 12}L${x + 23} ${t - 12}L${x + 23} ${t}L${x + 30} ${t}`;
  }
  d += `L${W + 30} 470Z`;
  let o = pth(d, p.wall, OL(p.ol, 2.5));
  // faint brick rows
  for (let row = 0; row < 4; row++) {
    const y = 364 + row * 13;
    for (let x = (row % 2) * 15 - 30; x < W + 30; x += 30) { if (y < topAt(x) + 6 || y < topAt(x + 20) + 6) continue; o += stk(`M${x + 2} ${y}L${x + 20} ${y}`, p.ol, 1.3, op(0.2)); }
  }
  // arcade of the bridge in the centre: calm, same-tone darker arches
  for (let i = 0; i < 5; i++) {
    const ax = 376 + i * 52, aw = 34, ay = 392;
    o += pth(`M${ax} 430L${ax} ${ay + aw / 2}A${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${ay + aw / 2}L${ax + aw} 430Z`, p.arch, op(0.85));
  }
  o += stk(`M345 384L615 384`, p.ol, 1.6, op(0.35));
  return o;
}

// ======================================================================================
// Zone palettes (backgrounds stay less saturated than honey crates #d9a066 and red apples #ff4d4d)
// ======================================================================================
const Z = {
  dawn: {
    sky: [['0', '#cfc2e8'], ['0.32', '#e6bcd8'], ['0.6', '#f5b8c6'], ['0.84', '#ffd0b6'], ['1', '#ffe2c6']],
    far: { stone: '#bcaccb', shade: '#a596ba', ol: '#7e6f9c', wall: '#b2a3c4', arch: '#988ab0', roof: '#cf9ab4', roofShade: '#b8819f', win: '#7c6e9c', lit: '#ffe0a0', litCore: '#fff4d6', tip: '#e8b8c8' },
    hillBack: '#d6c0d6', band: '#86a87c', bandHi: '#a0c094', bandDark: '#6f9068',
    ground: { top: '#8fbf7a', mid: '#7dac6c', bottom: '#668f5c', lip: '#a8d48f', ol: '#557a4d', stone: '#c9bfd2', stoneOl: '#8f84a6' }
  },
  noon: {
    sky: [['0', '#6fb4e8'], ['0.45', '#9cd0f6'], ['0.8', '#c8e8fc'], ['1', '#dcf1ff']],
    far: { stone: '#aaa4cc', shade: '#9089b8', ol: '#665e92', wall: '#a19ac4', arch: '#857eae', roof: '#7f9ccc', roofShade: '#6a86b8', win: '#5c548a', lit: '#ffe0a0', litCore: '#fff4d6', tip: '#ffd98a' },
    hillBack: '#a9cfb0', band: '#6fa864', bandHi: '#8cc07c', bandDark: '#5a9055',
    ground: { top: '#7fc26a', mid: '#6caf5c', bottom: '#548f4c', lip: '#9ed886', ol: '#457a40', stone: '#d4cbc0', stoneOl: '#998c80' }
  },
  sunset: {
    sky: [['0', '#5e4a8c'], ['0.3', '#94609e'], ['0.56', '#d27a92'], ['0.8', '#f39a76'], ['1', '#f8b480']],
    far: { stone: '#8c7099', shade: '#755c88', ol: '#4e3a68', wall: '#836892', arch: '#5e4a78', roof: '#a35e80', roofShade: '#88506e', win: '#5a4472', lit: '#ffd36a', litCore: '#fff2c4', tip: '#f6c070' },
    hillBack: '#9a6c90', band: '#5f6a4e', bandHi: '#76805c', bandDark: '#4c5640',
    ground: { top: '#7a8a5a', mid: '#69784e', bottom: '#525e40', lip: '#94a46c', ol: '#434d34', stone: '#a8938c', stoneOl: '#6e5c5a' }
  },
  night: {
    sky: [['0', '#1b1e4a'], ['0.45', '#262a5e'], ['0.8', '#332f70'], ['1', '#3a3478']],
    far: { stone: '#4c4a84', shade: '#3e3c72', ol: '#28265a', wall: '#45437c', arch: '#302e62', roof: '#5c4c90', roofShade: '#4a3e7c', win: '#2c2a5c', lit: '#ffd56a', litCore: '#fff4c8', tip: '#ffd56a' },
    hillBack: '#2f3068', band: '#2b3060', bandHi: '#363c70', bandDark: '#232752',
    ground: { top: '#3e4a6a', mid: '#36415f', bottom: '#2b3450', lip: '#4f5c80', ol: '#232a44', stone: '#5a6088', stoneOl: '#31365a' }
  }
};
const LIGHTS = {};

// ======================================================================================
// SKIES
// ======================================================================================
function skyDawn() {
  const R = rng(11);
  let defs = lin('sg', Z.dawn.sky) + glow('sun', '#fff0d0', 0.75) + glow('sunb', '#ffd8b8', 0.55);
  let b = rect(0, 0, W, H, 'url(#sg)');
  // rising sun low behind the left of the castle
  b += wrap(210, 280, X => circ(X, 318, 280, 'url(#sunb)')) + circ(210, 318, 120, 'url(#sun)');
  b += circ(210, 318, 46, '#fff3d8', op(0.95)) + circ(210, 318, 38, '#fff9ea');
  // high pink/lilac streak clouds (may cross the column: above y 150)
  b += streak(520, 70, 300, 16, '#f6cfe0', 0.85, '#fff0f6') + streak(140, 112, 220, 13, '#efc2da', 0.8, '#fbe4ee') + streak(820, 96, 260, 14, '#f3cadf', 0.8, '#fde9f2');
  b += streak(470, 128, 150, 9, '#f6d6e4', 0.6);
  // soft puffy clouds at the sides
  b += cloud(80, 236, 0.75, '#fde6ee', '#ecc4d8', '#ffffff', 0.9) + cloud(780, 210, 0.9, '#fde6ee', '#ecc4d8', '#ffffff', 0.9) + cloud(900, 280, 0.55, '#fde4ea', '#ecc4d6', '#ffffff', 0.8);
  // a few fading morning stars high up
  b += stars(R, 14, 4, 60, '#ffffff', 0.6, 1.3, 0.3, 0.7);
  write('levels/dawn/sky.svg', svg(W, H, b, defs));
}
function skyNoon() {
  const R = rng(22);
  let defs = lin('sg', Z.noon.sky) + glow('sun', '#fffbe0', 0.85) + glow('haze', '#ffffff', 0.5);
  let b = rect(0, 0, W, H, 'url(#sg)');
  b += ell(480, 520, 700, 140, 'url(#haze)');
  // small friendly sun upper right with soft rounded rays
  const sx = 868, sy = 74;
  b += circ(sx, sy, 110, 'url(#sun)');
  for (let i = 0; i < 10; i++) { const a = i * 36 * Math.PI / 180; b += stk(`M${f(sx + Math.cos(a) * 40)} ${f(sy + Math.sin(a) * 40)}L${f(sx + Math.cos(a) * 52)} ${f(sy + Math.sin(a) * 52)}`, '#fff3b8', 5, op(0.85)); }
  b += circ(sx, sy, 31, '#fff1a8', OL('#f4d27a', 3)) + circ(sx - 9, sy - 9, 8, '#fffbe2', op(0.9));
  // fluffy clouds (none in the column below y 150)
  b += cloud(170, 120, 1.15, '#ffffff', '#d6e8f6', '#ffffff') + cloud(500, 74, 0.95, '#ffffff', '#d6e8f6', '#ffffff') + cloud(690, 190, 0.8, '#ffffff', '#d6e8f6', '#ffffff', 0.95);
  b += cloud(60, 268, 0.6, '#f6fbff', '#d6e8f6', '#ffffff', 0.85) + cloud(920, 250, 0.7, '#f6fbff', '#d6e8f6', '#ffffff', 0.9) + cloud(330, 40, 0.5, '#f6fbff', '#d6e8f6', '#ffffff', 0.8);
  write('levels/noon/sky.svg', svg(W, H, b, defs));
}
function skySunset() {
  const R = rng(33);
  let defs = lin('sg', Z.sunset.sky) + glow('sun', '#ffe2a0', 0.8) + glow('sunb', '#ffb080', 0.5);
  let b = rect(0, 0, W, H, 'url(#sg)');
  // big low sun behind the right turrets
  const sx = 745, sy = 318;
  b += wrap(sx, 300, X => circ(X, sy, 300, 'url(#sunb)')) + wrap(sx, 150, X => circ(X, sy, 150, 'url(#sun)'));
  b += circ(sx, sy, 72, '#ffd98e', op(0.95)) + circ(sx, sy, 62, '#ffe6a8');
  // long cloud bands, warm undersides
  b += streak(480, 60, 420, 15, '#b876a6', 0.75, '#d898b8') + streak(180, 104, 300, 13, '#c87e9e', 0.7, '#e8a0b0') + streak(860, 130, 240, 12, '#d88a98', 0.75, '#f6b0a8');
  b += streak(690, 300, 260, 12, '#f0a088', 0.8, '#ffc8a0') + streak(820, 350, 200, 9, '#f6b090', 0.75) + streak(120, 236, 220, 11, '#e0889a', 0.7, '#f8b0a8') + streak(250, 290, 160, 9, '#ec9a90', 0.6);
  b += stars(R, 18, 4, 70, '#fff0f8', 0.6, 1.3, 0.25, 0.65);
  write('levels/sunset/sky.svg', svg(W, H, b, defs));
}
function skyNight() {
  const R = rng(44);
  const mx = 300, my = 92, MR = 60;
  let defs = lin('sg', Z.night.sky) + glow('moonG', '#fff3c0', 0.55) + glow('moonG2', '#b8b0ff', 0.28)
    + rad('neb', [['0', '#6a5cb8', 0.22], ['0.6', '#5a4ea8', 0.09], ['1', '#5a4ea8', 0]])
    + `<mask id="cres"><rect x="0" y="0" width="${W}" height="${H}" fill="#000"/><circle cx="${mx}" cy="${my}" r="${MR}" fill="#fff"/><circle cx="${mx + 34}" cy="${my - 16}" r="${MR * 0.84}" fill="#000"/></mask>`;
  let b = rect(0, 0, W, H, 'url(#sg)');
  b += wrap(700, 300, X => ell(X, 230, 300, 110, 'url(#neb)')) + wrap(120, 260, X => ell(X, 380, 260, 90, 'url(#neb)'));
  const avoid = [[mx, my, 120]];
  b += stars(R, 150, 0, 520, '#fff8e8', 0.5, 1.5, 0.3, 0.9, avoid);
  b += twinkles(R, 9, 12, 330, '#fff6d8', 4, 7, avoid);
  // big friendly crescent moon with a sleepy smile
  b += wrap(mx, 240, X => circ(X, my, 240, 'url(#moonG2)')) + wrap(mx, 140, X => circ(X, my, 140, 'url(#moonG)'));
  b += `<g mask="url(#cres)">` + circ(mx, my, MR, '#fff8dc') + circ(mx - 6, my + 6, MR * 0.9, '#ffeeb8', op(0.55)) + circ(mx - 30, my + 26, 7, '#f2dea0', op(0.6)) + circ(mx - 40, my - 4, 4.5, '#f2dea0', op(0.6)) + '</g>';
  b += `<g mask="url(#cres)">` + circ(mx, my, MR, 'none', OL('#e6c87a', 3)) + '</g>';
  // face on the thick part: closed happy eye, smile, rosy cheek
  b += stk(`M${mx - 44} ${my - 6}Q${mx - 38} ${my - 12} ${mx - 32} ${my - 6}`, '#8a6a3a', 2.6);
  b += stk(`M${mx - 42} ${my + 14}Q${mx - 32} ${my + 24} ${mx - 20} ${my + 18}`, '#8a6a3a', 2.6);
  b += ell(mx - 26, my + 6, 6, 3.5, '#ffb0a8', op(0.75));
  // a couple of soft dark-lilac clouds
  b += cloud(640, 120, 0.7, '#3a3a7c', '#2e2e6a', '#4c4c90', 0.75) + cloud(880, 220, 0.55, '#38387a', '#2e2e6a', '#4a4a8e', 0.7);
  write('levels/night/sky.svg', svg(W, H, b, defs));
  LIGHTS.night_moon = { x: mx, y: my, r: MR };
}

// ======================================================================================
// FAR: the castle on its hill
// ======================================================================================
// wk: per tower window kinds; zone-specific extras via hooks
function castle(zone, opts) {
  const P = Z[zone], p = P.far, R = rng(500 + zone.length * 7);
  const lights = []; const gid = 'wg';
  let defs = glow(gid, '#ffcf5a', 0.55) + lin('hb', [['0', P.hillBack], ['1', mix(P.hillBack, p.wall, 0.4)]]);
  let b = '';
  // distant hills (haze)
  const hill = prof(372, [[16, 1, 0.6], [10, 3, 2.1], [5, 7, 0.4]]);
  b += pth(profPath(hill, H + 2), 'url(#hb)', op(0.9));
  b += opts.behind || '';
  b += wall(p, R);
  const k = opts.wins;
  const T = [
    { x: 70, base: 470, w: 54, top: 268, roofH: 60, lean: -3, tip: -4, pen: opts.pens[0], wins: [[30, 14, 22, k[0]], [86, 14, 22, k[1]]] },
    { x: 192, base: 470, w: 96, top: 206, roofH: 92, lean: 0, tip: 6, pen: opts.pens[1], penW: opts.bigFlag ? 40 : 24, wins: [[28, 22, 32, k[2]], [96, 16, 24, k[3]], [96, 16, 24, k[4]]].map((w, i) => i === 0 ? w : w) },
    { x: 304, base: 470, w: 50, top: 288, roofH: 50, lean: 5, tip: 8, pen: opts.pens[2], wins: [[26, 13, 20, k[5]]] },
    { x: 660, base: 470, w: 52, top: 292, roofH: 52, lean: -4, tip: -6, pen: opts.pens[3], wins: [[26, 13, 20, k[6]]] },
    { x: 784, base: 470, w: 84, top: 190, roofH: 86, lean: 3, tip: -8, pen: opts.pens[4], wins: [[30, 22, 32, k[7]], [104, 16, 24, k[8]]] },
    { x: 896, base: 470, w: 48, top: 266, roofH: 56, lean: -2, tip: 5, pen: opts.pens[5], wins: [[28, 13, 20, k[9]]] }
  ];
  // the keep's two lower windows side by side
  T[1].wins = [[28, 22, 32, k[2]]];
  for (const t of T) {
    let s = tower(t, p, R, lights, gid);
    if (t.x === 192) {
      // lower pair of windows on the keep, added after so they sit on the body
      const extra = [];
      s += archWin(172, t.top + 100, 15, 22, k[3], p, extra, gid) + archWin(212, t.top + 100, 15, 22, k[4], p, extra, gid);
      lights.push(...extra);
      s += opts.keepExtra ? opts.keepExtra(t, p) : '';
    }
    if (t.x === 784 && opts.tallExtra) s += opts.tallExtra(t, p);
    b += s;
  }
  // lean correction for light positions (rotate about base)
  b += opts.front(P, R);
  write(`levels/${zone}/far.svg`, svg(W, H, b, defs));
  // light positions: rotate by tower lean (approximate per tower by x proximity)
  const leaned = lights.map(L => {
    const t = T.reduce((a, c) => Math.abs(c.x - L.x) < Math.abs(a.x - L.x) ? c : a);
    const a = (t.lean || 0) * Math.PI / 180, dx = L.x - t.x, dy = L.y - t.base;
    return { ...L, x: Math.round(t.x + dx * Math.cos(a) - dy * Math.sin(a)), y: Math.round(t.base + dx * Math.sin(a) + dy * Math.cos(a)) };
  });
  LIGHTS[zone + '_far'] = leaned;
}
// front band: rounded hedge bumps (tileable: period 40) on a sine baseline
function hedgeBand(P, base, rr, R, extra = '') {
  const y0 = prof(base, [[5, 2, 0.3], [3, 5, 1.7]]);
  let o = '', hi = '';
  for (let x = 0; x < W; x += 40) {
    const r = rr + 5 * Math.sin(x * 0.37) * Math.sin(x * 0.11), y = y0(x) + 4;
    o += wrap(x, r + 2, X => circ(X, y, r, P.band));
    hi += wrap(x, r, X => ell(X - r * 0.2, y - r * 0.55, r * 0.45, r * 0.22, P.bandHi, op(0.7)));
  }
  o += pth(profPath(x => y0(x) + 8, H + 2), P.band) + hi;
  o += pth(profPath(x => y0(x) + 34 + 4 * Math.sin(2 * Math.PI * 4 * x / W), H + 2), P.bandDark);
  o += rect(0, 500, W, 42, P.bandDark);
  return o + extra;
}
function farDawn() {
  castle('dawn', {
    wins: ['dark', 'dark', 'lit', 'dark', 'dark', 'dark', 'dark', 'dark', 'lit', 'dark'],
    pens: ['#e8a6c0', '#f0b0c8', '#e8a6c0', '#c8b0e0', '#f0b0c8', '#c8b0e0'],
    front: (P, R) => {
      let o = '';
      // mist veil over the castle foot (soft, calm)
      for (let i = 0; i < 12; i++) { const x = i * 80 + 20, y = 392 + 8 * Math.sin(i * 1.3); o += wrap(x, 90, X => ell(X, y, 90, 13, '#ffffff', op(0.32))); }
      o += hedgeBand(P, 410, 22, R);
      // apple dots on the hedge (tiny, sides only), muted
      for (const [x, y] of [[60, 412], [120, 418], [240, 414], [700, 416], [840, 412], [910, 420]]) o += circ(x, y, 3.2, '#d8857a', op(0.8));
      for (let i = 0; i < 10; i++) { const x = i * 96 + 50, y = 432 + 6 * Math.sin(i * 2.1); o += wrap(x, 120, X => ell(X, y, 120, 12, '#ffffff', op(0.26))); }
      return o;
    }
  });
}
function farNoon() {
  castle('noon', {
    wins: ['dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark'],
    pens: ['#e8a0a0', '#f2c86a', '#8cc8a0', '#e8a0a0', '#9cc0ec', '#f2c86a'],
    bigFlag: true,
    keepExtra: (t, p) => '',
    front: (P, R) => {
      let o = hedgeBand(P, 412, 20, R);
      // little round trees in front at the sides
      for (const [x, s] of [[30, 1], [128, 0.8], [252, 0.9], [710, 0.85], [842, 1.05], [930, 0.7]]) {
        const y = 408;
        o += rect(x - 3 * s, y - 4, 6 * s, 16, '#7a6450');
        o += circ(x, y - 14 * s, 17 * s, '#5f9c58') + circ(x - 4 * s, y - 20 * s, 7 * s, '#82bc72', op(0.8));
      }
      return o;
    }
  });
}
function farSunset() {
  castle('sunset', {
    wins: ['lit', 'dark', 'lit', 'lit', 'dark', 'lit', 'lit', 'lit', 'dark', 'lit'],
    pens: ['#f0a070', '#f6c070', '#f0a070', '#e88a9a', '#f6c070', '#e88a9a'],
    tallExtra: (t, p) => {
      // a bats' perch: a little wooden beam out of the tall tower with two tiny sleepy bats hanging
      const y = t.top + 78, x0 = t.x + t.w / 2;
      let o = rect(x0 - 4, y - 4, 38, 7, '#6e4e5c', OL(p.ol, 2) + ' rx="2"');
      const bat = (bx, by) => ell(bx, by + 8, 5.5, 7, '#7e7090', OL(p.ol, 1.4)) + pth(`M${bx - 5} ${by + 4}q-6 4 -3 10q2 -4 4 -4Z`, '#6a5c82', OL(p.ol, 1.2)) + pth(`M${bx + 5} ${by + 4}q6 4 3 10q-2 -4 -4 -4Z`, '#6a5c82', OL(p.ol, 1.2)) + stk(`M${bx - 2.5} ${by + 10}l1.2 1M${bx + 2.5} ${by + 10}l-1.2 1`, '#3a2c50', 1.1) + circ(bx - 3.5, by + 7, 1.2, '#ff9cb0', op(0.8)) + circ(bx + 3.5, by + 7, 1.2, '#ff9cb0', op(0.8)) + stk(`M${bx - 1} ${by}l0 -1.5M${bx + 1} ${by}l0 -1.5`, p.ol, 1.2);
      return o + bat(x0 + 12, y + 4) + bat(x0 + 26, y + 4);
    },
    keepExtra: (t, p) => {
      const y = t.top + 60, x0 = t.x - t.w / 2;
      return rect(x0 - 30, y - 3, 34, 6, '#6e4e5c', OL(p.ol, 2) + ' rx="2"');
    },
    front: (P, R) => hedgeBand(P, 410, 21, R)
  });
}
function farNight() {
  castle('night', {
    wins: ['lit', 'dark', 'lit', 'lit', 'lit', 'lit', 'lit', 'ghost', 'lit', 'dark'],
    pens: ['#9a8cd8', '#b0a0e8', '#9a8cd8', '#b0a0e8', '#9a8cd8', '#b0a0e8'],
    front: (P, R) => {
      let o = hedgeBand(P, 410, 21, R);
      // tiny glow-dots of fireflies resting on the hedge (sides only)
      for (const [x, y] of [[44, 420], [150, 416], [270, 424], [690, 418], [820, 422], [918, 414]]) o += circ(x, y, 6, '#d8ff8a', op(0.18)) + circ(x, y, 1.8, '#eaffb0', op(0.85));
      return o;
    }
  });
}

// ======================================================================================
// GROUND: courtyard strip, surface line y 40, flat 300–660
// ======================================================================================
const surfY = (amp1, amp2) => x => {
  if (x <= 300) return SURF - amp1 * Math.pow(Math.sin(Math.PI * x / 300), 2);
  if (x >= 660) return SURF - amp2 * Math.pow(Math.sin(Math.PI * (x - 660) / 300), 2);
  return SURF;
};
function groundBase(zone, sy, R) {
  const g = Z[zone].ground, id = 'gg';
  const defs = lin(id, [['0', g.top], ['0.1', g.top], ['0.4', g.mid], ['0.78', g.bottom], ['1', g.bottom]], 0, SURF, 0, GH - 20, ' gradientUnits="userSpaceOnUse"');
  let b = pth(profPath(sy, GH + 2, 4), `url(#${id})`);
  // cobblestone courtyard path in the middle (under the plinth), fades at the sides
  for (let row = 0; row < 5; row++) {
    const y = 58 + row * 18, n = 15, x0 = 290 - row * 6 + (row % 2) * 13;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 27 + (R() - 0.5) * 4, rx = 10 + R() * 2.5, ry = 6 + R() * 1.5;
      const edge = Math.min(x - 260, 700 - x), a = Math.max(0, Math.min(1, edge / 70)) * (1 - row * 0.15);
      if (a <= 0.05) continue;
      b += ell(x, y, rx, ry, g.stone, OL(g.stoneOl, 1.6) + op(f(a * 0.75)));
      b += ell(x - 3, y - 2, rx * 0.45, ry * 0.3, '#ffffff', op(f(a * 0.25)));
    }
  }
  // pebbles in the soil at the sides
  for (let i = 0; i < 22; i++) {
    const x = R() * W; if (x > 250 && x < 710) continue;
    const y = 70 + R() * 70, rx = 4 + R() * 8, ry = rx * 0.5;
    b += wrap(x, rx + 2, X => ell(X, y, rx, ry, g.bottom, op(f(0.45 + R() * 0.3))));
  }
  b += rect(0, 160, W, 22, g.bottom);
  // grass lip: scalloped fringe under the surface + tufts
  let lip = '';
  for (let x = 0; x < W; x += 16) lip += wrap(x, 9, X => ell(X, sy(X < 0 ? X + W : X > W ? X - W : X) + 6, 9, 5, g.top));
  b += lip + stk(profLine(x => sy(x) + 2), g.lip, 3, op(0.7));
  b += stk(profLine(sy), g.ol, 3);
  for (let i = 0; i < 40; i++) {
    const x = 6 + R() * (W - 12); const y = sy(x);
    if (x > 300 && x < 660 && R() < 0.5) continue;
    b += stk(`M${f(x - 4)} ${f(y + 1)}Q${f(x - 3)} ${f(y - 4)} ${f(x - 5)} ${f(y - 7)}M${f(x)} ${f(y + 1)}Q${f(x + 1)} ${f(y - 5)} ${f(x)} ${f(y - 9)}M${f(x + 4)} ${f(y + 1)}Q${f(x + 4)} ${f(y - 4)} ${f(x + 6)} ${f(y - 6)}`, g.ol, 1.6, op(0.7));
  }
  return { defs, b };
}
// smiling pumpkin; mood: 'sleepy' | 'happy' | 'lit'
function pumpkin(x, y, r, mood, gid) {
  const c = '#e69a5c', sh = '#c9783f', ol = '#8a4a28';
  let o = '';
  if (mood === 'lit') o += circ(x, y - r * 0.9, r * 2.6, `url(#${gid})`);
  o += ell(x, y - 1, r * 1.1, 2.5, '#000000', op(0.12));
  o += ell(x - r * 0.45, y - r * 0.85, r * 0.6, r * 0.85, sh, OL(ol, 2.4)) + ell(x + r * 0.45, y - r * 0.85, r * 0.6, r * 0.85, sh, OL(ol, 2.4));
  o += ell(x, y - r * 0.88, r * 0.62, r * 0.9, c, OL(ol, 2.4));
  o += ell(x - r * 0.18, y - r * 1.35, r * 0.18, r * 0.12, '#ffd8b0', op(0.7));
  o += pth(`M${f(x - 2)} ${f(y - r * 1.7)}q1 -6 5 -7q-1 4 -1 7Z`, '#6f8a4a', OL('#4a5c30', 1.6));
  o += pth(`M${f(x + 2)} ${f(y - r * 1.72)}q6 -4 10 -1q-5 3 -10 1Z`, '#7fb05a', OL('#4a5c30', 1.4));
  const ey = y - r * 0.98, ex = r * 0.34;
  if (mood === 'sleepy') {
    o += stk(`M${f(x - ex - 3)} ${f(ey)}q3 3 6 0M${f(x + ex - 3)} ${f(ey)}q3 3 6 0`, ol, 1.8);
    o += stk(`M${f(x - 4)} ${f(y - r * 0.55)}q4 3 8 0`, ol, 1.8);
    o += ell(x - r * 0.62, y - r * 0.68, 2.6, 1.6, '#ff9c8c', op(0.7)) + ell(x + r * 0.62, y - r * 0.68, 2.6, 1.6, '#ff9c8c', op(0.7));
  } else {
    const fill = mood === 'lit' ? '#ffe07a' : '#7a3e22';
    o += ell(x - ex, ey, 2.6, 3.2, fill, mood === 'lit' ? OL('#c0702a', 1) : '') + ell(x + ex, ey, 2.6, 3.2, fill, mood === 'lit' ? OL('#c0702a', 1) : '');
    o += pth(`M${f(x - r * 0.5)} ${f(y - r * 0.68)}Q${f(x)} ${f(y - r * 0.2)} ${f(x + r * 0.5)} ${f(y - r * 0.68)}Q${f(x)} ${f(y - r * 0.42)} ${f(x - r * 0.5)} ${f(y - r * 0.68)}Z`, fill, mood === 'lit' ? OL('#c0702a', 1) : '');
    if (mood !== 'lit') o += ell(x - r * 0.62, y - r * 0.72, 2.6, 1.6, '#ff9c8c', op(0.7)) + ell(x + r * 0.62, y - r * 0.72, 2.6, 1.6, '#ff9c8c', op(0.7));
  }
  return o;
}
function groundDawn() {
  const R = rng(71), sy = surfY(2, 2), g = groundBase('dawn', sy, R), gr = Z.dawn.ground;
  let b = g.b;
  // apple trees (≤ 38 px tall)
  const tree = (x, s) => {
    const y = sy(x); let o = ell(x, y + 1, 26 * s, 3, gr.ol, op(0.3));
    o += pth(`M${f(x - 3 * s)} ${f(y)}L${f(x - 2 * s)} ${f(y - 16 * s)}L${f(x + 2 * s)} ${f(y - 16 * s)}L${f(x + 3 * s)} ${f(y)}Z`, '#9a7458', OL('#6a4a36', 2));
    const cy = y - 21 * s;
    o += ell(x, cy, 26 * s, 13 * s, '#6aa25e', OL('#4a7a44', 2.5)) + ell(x - 7 * s, cy - 5 * s, 12 * s, 6 * s, '#8cc47a', op(0.8));
    for (const [dx, dy] of [[-14, 2], [-2, 6], [12, -2], [17, 6], [-6, -6]]) o += circ(x + dx * s, cy + dy * s, 3.4 * s, '#e0675e', OL('#8a3434', 1.2)) + circ(x + dx * s - 1, cy + dy * s - 1, 1, '#ffffff', op(0.7));
    return o;
  };
  const hedge = (x, w, h) => { const y = sy(x); let o = ''; for (let i = 0; i < 4; i++) o += circ(x - w / 2 + w * (i + 0.5) / 4, y - h * 0.5 - (i % 2) * 3, h * 0.55, '#76a86a', OL('#4f7c48', 2.2)); o += rect(x - w / 2, y - h * 0.55, w, h * 0.55, '#76a86a'); o += stk(`M${f(x - w / 2)} ${f(y)}L${f(x + w / 2)} ${f(y)}`, '#4f7c48', 2.2); for (let i = 0; i < 3; i++) o += ell(x - w / 2 + w * (i + 0.6) / 4, y - h * 0.8, 4, 2, '#9cd08a', op(0.8)); return o; };
  const flower = (x, col) => { const y = sy(x); return stk(`M${x} ${f(y)}L${x} ${f(y - 8)}`, '#4f7c48', 1.5) + circ(x, y - 10, 3, col, OL(dark(col, 0.35), 1.2)) + circ(x, y - 10, 1, '#fff6c8'); };
  b += tree(110, 1) + hedge(205, 56, 22) + pumpkin(262, sy(262), 12, 'sleepy') + pumpkin(285, sy(285), 8, 'sleepy');
  b += pumpkin(700, sy(700), 11, 'sleepy') + tree(830, 0.92) + hedge(920, 60, 20) + flower(60, '#f4a6c0') + flower(160, '#fff0f4') + flower(760, '#f4a6c0') + flower(888, '#e8d0ff') + flower(20, '#fff0f4');
  write('levels/dawn/ground.svg', svg(W, GH, b, g.defs));
}
function groundNoon() {
  const R = rng(72), sy = surfY(0, 0), g = groundBase('noon', sy, R);
  let b = g.b;
  // stone well with a little roof and a bucket (≤ 38 px)
  const well = x => {
    const y = sy(x); let o = ell(x, y + 1, 26, 3, '#3a5a34', op(0.3));
    o += rect(x - 20, y - 16, 40, 16, '#c8c0d4', OL('#7a7096', 2.5) + ' rx="3"') + stk(`M${x - 20} ${y - 8}L${x + 20} ${y - 8}M${x - 6} ${y - 16}L${x - 6} ${y - 8}M${x + 8} ${y - 8}L${x + 8} ${y}`, '#7a7096', 1.5, op(0.6));
    o += stk(`M${x - 16} ${y - 16}L${x - 16} ${y - 30}M${x + 16} ${y - 16}L${x + 16} ${y - 30}`, '#8a6448', 3);
    o += pth(`M${x - 24} ${y - 29}L${x} ${y - 38}L${x + 24} ${y - 29}Z`, '#c87a6a', OL('#8a4a40', 2.2));
    o += stk(`M${x + 4} ${y - 30}L${x + 4} ${y - 22}`, '#8a6448', 1.2) + pth(`M${x - 1} ${y - 22}L${x + 9} ${y - 22}L${x + 8} ${y - 15}L${x} ${y - 15}Z`, '#b08a62', OL('#6a4a36', 1.6));
    return o;
  };
  const basket = (x, s) => {
    const y = sy(x); let o = ell(x, y + 1, 20 * s, 2.5, '#3a5a34', op(0.3));
    for (const [dx, dy] of [[-8, -15], [0, -17], [8, -15], [-4, -19], [5, -20]]) o += circ(x + dx * s, y + dy * s, 5 * s, '#e0675e', OL('#8a3434', 1.4)) + circ(x + dx * s - 1.5, y + dy * s - 1.5, 1.3, '#ffffff', op(0.7));
    o += pth(`M${f(x - 16 * s)} ${f(y - 14 * s)}L${f(x + 16 * s)} ${f(y - 14 * s)}L${f(x + 12 * s)} ${f(y)}L${f(x - 12 * s)} ${f(y)}Z`, '#c8a070', OL('#7a5a38', 2.2));
    o += stk(`M${f(x - 14 * s)} ${f(y - 9 * s)}L${f(x + 14 * s)} ${f(y - 9 * s)}M${f(x - 13 * s)} ${f(y - 4 * s)}L${f(x + 13 * s)} ${f(y - 4 * s)}`, '#9a7650', 1.4, op(0.8));
    return o;
  };
  const tent = x => {
    const y = sy(x); let o = ell(x, y + 1, 34, 3, '#3a5a34', op(0.3));
    const body = `M${x - 30} ${y}L${x} ${y - 28}L${x + 30} ${y}Z`;
    const cid = uid('tn');
    o += `<clipPath id="${cid}"><path d="${body}"/></clipPath>` + pth(body, '#f4ece4');
    o += `<g clip-path="url(#${cid})">`; for (let i = -3; i < 4; i += 2) o += pth(`M${x + i * 8.5} ${y}L${x} ${y - 30}L${x + (i + 1) * 8.5} ${y}Z`, '#d88a8a'); o += '</g>';
    o += pth(body, 'none', OL('#8a5a5a', 2.5)) + pth(`M${x - 5} ${y}L${x} ${y - 14}L${x + 5} ${y}Z`, '#8a5a5a', op(0.6));
    o += stk(`M${x} ${y - 28}L${x} ${y - 36}`, '#8a5a5a', 1.8) + pth(`M${x} ${y - 36}L${x + 13} ${y - 33}L${x} ${y - 30}Z`, '#f2c86a', OL('#a07a3a', 1.4));
    return o;
  };
  const flower = (x, col) => { const y = sy(x); return stk(`M${x} ${f(y)}L${x} ${f(y - 8)}`, '#457a40', 1.5) + circ(x, y - 10, 3, col, OL(dark(col, 0.35), 1.2)) + circ(x, y - 10, 1, '#fff6c8'); };
  b += well(140) + basket(236, 1) + basket(270, 0.7) + basket(712, 0.85) + tent(845) + flower(60, '#fff4a0') + flower(196, '#ffffff') + flower(760, '#f4b0c8') + flower(930, '#fff4a0');
  write('levels/noon/ground.svg', svg(W, GH, b, g.defs));
}
function groundSunset() {
  const R = rng(73), sy = surfY(4, 4), g = groundBase('sunset', sy, R);
  let b = g.b;
  const barrel = x => {
    const y = sy(x); let o = ell(x, y + 1, 18, 2.5, '#2a3020', op(0.35));
    o += pth(`M${x - 13} ${y}Q${x - 17} ${y - 15} ${x - 13} ${y - 30}L${x + 13} ${y - 30}Q${x + 17} ${y - 15} ${x + 13} ${y}Z`, '#a8784e', OL('#5e3e26', 2.5));
    o += stk(`M${x - 15} ${y - 8}L${x + 15} ${y - 8}M${x - 15} ${y - 22}L${x + 15} ${y - 22}`, '#6e5a5a', 3) + stk(`M${x - 5} ${y - 28}L${x - 5} ${y - 2}`, '#8a603e', 1.4, op(0.6));
    o += ell(x, y - 30, 13, 3, '#b88a5e', OL('#5e3e26', 2));
    return o;
  };
  const broom = (x0, x1) => {
    const y0 = sy(x0) - 2, y1 = 4;
    let o = stk(`M${x0} ${y0}L${x1} ${y1}`, '#8a6448', 3.2);
    // bristles at the bottom
    o += pth(`M${x0 - 7} ${y0 + 2}L${x0 + 3} ${y0 + 2}L${x0 + 4} ${y0 - 12}L${x0 - 2} ${y0 - 13}Z`, '#d8b070', OL('#8a6a3a', 1.8));
    o += stk(`M${x0 - 3} ${y0 - 14}L${x0 + 4} ${y0 - 12}`, '#a85a5a', 2.4);
    return o;
  };
  const leafPile = (x) => { const y = sy(x); let o = ''; for (const [dx, c] of [[-8, '#d07a4a'], [0, '#c8904a'], [7, '#b8603e'], [-3, '#d8a05a']]) o += ell(x + dx, y - 2, 6, 2.6, c, OL('#7a4a2a', 1) + ` transform="rotate(${dx * 3} ${x + dx} ${y - 2})"`); return o; };
  const hay = x => { const y = sy(x); return ell(x, y + 1, 22, 2.5, '#2a3020', op(0.35)) + rect(x - 20, y - 20, 40, 20, '#c8a45a', OL('#7a6030', 2.4) + ' rx="5"') + stk(`M${x - 16} ${y - 13}L${x + 16} ${y - 13}M${x - 16} ${y - 6}L${x + 16} ${y - 6}`, '#a08040', 1.4, op(0.8)); };
  b += hay(100) + pumpkin(210, sy(210), 14, 'happy') + pumpkin(248, sy(248), 9, 'happy') + leafPile(160) + leafPile(285);
  b += broom(742, 772) + barrel(780) + pumpkin(860, sy(860), 10, 'sleepy') + leafPile(700) + leafPile(915);
  write('levels/sunset/ground.svg', svg(W, GH, b, g.defs));
}
function groundNight() {
  const R = rng(74), sy = surfY(4, 4), g = groundBase('night', sy, R);
  let defs = g.defs + glow('pg', '#ffcf5a', 0.6) + glow('lg', '#ffe08a', 0.7) + glow('mg', '#a8f0e0', 0.5);
  let b = g.b;
  const lights = [];
  const lamp = x => {
    const y = sy(x); let o = circ(x, 9, 34, 'url(#lg)');
    o += rect(x - 6, y - 4, 12, 4, '#4a4a78', OL('#232a44', 1.8) + ' rx="1.5"') + stk(`M${x} ${y - 4}L${x} 15`, '#4a4a78', 3.5);
    o += pth(`M${x - 7} 15L${x + 7} 15L${x + 5} 5L${x - 5} 5Z`, '#ffe08a', OL('#6a5a3a', 2)) + rect(x - 3, 8, 6, 5, '#fff6d0');
    o += pth(`M${x - 8} 5L${x} 1L${x + 8} 5Z`, '#4a4a78', OL('#232a44', 1.6));
    lights.push({ x, y: 10, r: 40, kind: 'lamp' });
    return o;
  };
  const mush = (x, s, cap) => {
    const y = sy(x); let o = circ(x, y - 8 * s, 14 * s, 'url(#mg)');
    o += pth(`M${f(x - 3.5 * s)} ${f(y)}L${f(x - 3 * s)} ${f(y - 8 * s)}L${f(x + 3 * s)} ${f(y - 8 * s)}L${f(x + 3.5 * s)} ${f(y)}Z`, '#e8e4f4', OL('#5a5a88', 1.8));
    o += pth(`M${f(x - 10 * s)} ${f(y - 7 * s)}Q${f(x - 10 * s)} ${f(y - 18 * s)} ${f(x)} ${f(y - 18 * s)}Q${f(x + 10 * s)} ${f(y - 18 * s)} ${f(x + 10 * s)} ${f(y - 7 * s)}Z`, cap, OL(dark(cap, 0.45), 2));
    o += circ(x - 4 * s, y - 12 * s, 1.8 * s, '#ffffff', op(0.85)) + circ(x + 4 * s, y - 14 * s, 1.4 * s, '#ffffff', op(0.85)) + circ(x + 1 * s, y - 9.5 * s, 1.2 * s, '#ffffff', op(0.7));
    return o;
  };
  b += lamp(120) + pumpkin(232, sy(232), 14, 'lit', 'pg') + pumpkin(270, sy(270), 9, 'lit', 'pg');
  lights.push({ x: 232, y: Math.round(sy(232) - 13), r: 36, kind: 'pumpkin' }, { x: 270, y: Math.round(sy(270) - 8), r: 24, kind: 'pumpkin' });
  b += pumpkin(726, sy(726), 12, 'lit', 'pg'); lights.push({ x: 726, y: Math.round(sy(726) - 11), r: 30, kind: 'pumpkin' });
  b += mush(810, 1, '#9a8ad8') + mush(832, 0.7, '#6cc0b4') + mush(900, 0.85, '#9a8ad8') + mush(40, 0.75, '#6cc0b4');
  write('levels/night/ground.svg', svg(W, GH, b, defs));
  LIGHTS.night_ground = lights;
}

// ======================================================================================
// PARTICLES (32x32, centred, transparent edges)
// ======================================================================================
function particles() {
  const P = (name, body, defs = '') => write(`particles/${name}.svg`, svg(32, 32, body, defs));
  const soft = (col, a = 0.5) => rad('g', [['0', col, a], ['1', col, 0]]);
  P('star', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 11, 5), '#fff3b8', OL('#d0a040', 1.8)) + circ(13.5, 14, 1.6, '#ffffff', op(0.85)), soft('#fff3b0', 0.45));
  P('sparkle', circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#fffaf0', OL('#d8c890', 1)) + circ(16, 16, 2.2, '#ffffff'), soft('#fff0c8', 0.6));
  P('puff', circ(16, 17, 14, 'url(#g)') + circ(12, 18, 6.5, '#ffffff', op(0.85)) + circ(19, 15, 7.5, '#ffffff', op(0.9)) + circ(17, 21, 6.5, '#e8e4f2', op(0.9)) + circ(12, 20, 5, '#efecf6', op(0.8)) + circ(17, 13.5, 3, '#ffffff'), soft('#ffffff', 0.45));
  P('heart', pth('M16 27Q5 19 5 12A5.5 5.5 0 0 1 16 10A5.5 5.5 0 0 1 27 12Q27 19 16 27Z', '#ff7aa6', OL('#b8487a', 2)) + ell(11, 12.5, 2.2, 1.6, '#ffffff', op(0.8) + ' transform="rotate(-30 11 12.5)"'));
  P('spark', circ(16, 16, 15, 'url(#g)') + pth('M16 7L19 16L16 25L13 16Z', '#ffd27a') + pth('M7 16L16 13.5L25 16L16 18.5Z', '#ffc060', op(0.8)) + circ(16, 16, 2.6, '#fff6dc'), rad('g', [['0', '#fff0c0', 0.95], ['0.3', '#ffb050', 0.6], ['0.7', '#ff9a3c', 0.15], ['1', '#ff9a3c', 0]]));
  // tiny red apple chip with a leaf
  P('applebit', pth('M16 10Q10 6 7.5 12Q6 19 11 24Q14 26.5 16 25Q18 26.5 21 24Q26 19 24.5 12Q22 6 16 10Z', '#ff5a5a', OL('#7a1b26', 2)) + pth('M16 10Q19 13 23 12Q21 17 16 16Z', '#fff2dc', OL('#c89a7a', 1) + op(0.95)) + stk('M16 10L16.5 6', '#7a4a2a', 1.8) + pth('M17 7Q21 3 25 5Q22 9 17 7Z', '#5ccf5c', OL('#2f7a35', 1.2)) + ell(11, 14, 1.6, 2.4, '#ffffff', op(0.8)));
  // pink blossom petal (rounded with a notch)
  P('petal', `<g transform="rotate(-20 16 16)">` + pth('M16 28Q6 22 7 12Q8 5 13 5Q15 7 16 9Q17 7 19 5Q24 5 25 12Q26 22 16 28Z', '#ffc4d8', OL('#d4789c', 1.6)) + pth('M16 28Q22 22 23 13Q24 9 22 7Q25 12 24 16Q22 24 16 28Z', '#f6a0bc', op(0.7)) + stk('M16 25L16 14', '#f08cb0', 1.2, op(0.6)) + ell(12, 13, 2, 3.4, '#ffffff', op(0.7)) + '</g>');
  // orange-red autumn leaf (rounded maple-ish, friendly)
  P('leaf', `<g transform="rotate(15 16 16)">` + pth('M16 4Q18.5 8 20 7Q22 9 21.5 11Q25 10 27 12Q25.5 15 24 16Q26 18 24.5 20Q21 20.5 19 20Q18.5 23 17 24L17 28L15 28L15 24Q13.5 23 13 20Q11 20.5 7.5 20Q6 18 8 16Q6.5 15 5 12Q7 10 10.5 11Q10 9 12 7Q13.5 8 16 4Z', '#ee7a3e', OL('#9a4422', 1.6)) + stk('M16 26L16 9M16 18L11 13M16 18L21 13M16 22L10 18M16 22L22 18', '#b84e26', 1.1, op(0.75)) + ell(12.5, 10.5, 1.6, 2.6, '#ffd0a0', op(0.6)) + '</g>');
  // very soft wide mist blob
  P('mist', ell(16, 16, 15, 9, 'url(#g)'), rad('g', [['0', '#ffffff', 0.7], ['0.5', '#ffffff', 0.35], ['1', '#ffffff', 0]]));
  // cute lilac-grey bat, no fangs, rosy cheeks. frame 0 wings up, frame 1 wings down
  const bat = up => {
    const body = '#9a90b8', wing = '#857aa8', ol = '#4e4672';
    const wl = up ? 'M12 16Q6 6 1.5 8Q3.5 11 3 13Q5.5 12.5 6.5 15Q8.5 13.5 11 17Z' : 'M12 17Q6 22 1.5 24Q3 21 2.5 19Q5 20 6.5 18Q8.5 19.5 11 16Z';
    const wr = up ? 'M20 16Q26 6 30.5 8Q28.5 11 29 13Q26.5 12.5 25.5 15Q23.5 13.5 21 17Z' : 'M20 17Q26 22 30.5 24Q29 21 29.5 19Q27 20 25.5 18Q23.5 19.5 21 16Z';
    let o = pth(wl, wing, OL(ol, 1.5)) + pth(wr, wing, OL(ol, 1.5));
    o += pth('M11.5 12L12 7.5L14.5 10.5Z', body, OL(ol, 1.4)) + pth('M20.5 12L20 7.5L17.5 10.5Z', body, OL(ol, 1.4));
    o += ell(16, 17, 6.6, 6.4, body, OL(ol, 1.6)) + ell(16, 20, 3.6, 2.6, '#c8c0e0', op(0.8));
    o += circ(13.6, 15.6, 1.7, '#2e2850') + circ(18.4, 15.6, 1.7, '#2e2850') + circ(14.1, 15, 0.6, '#ffffff') + circ(18.9, 15, 0.6, '#ffffff');
    o += stk('M14.8 18.4Q16 19.6 17.2 18.4', '#2e2850', 1.1);
    o += ell(12.2, 18.2, 1.4, 0.9, '#ff9cb8', op(0.85)) + ell(19.8, 18.2, 1.4, 0.9, '#ff9cb8', op(0.85));
    return o;
  };
  P('bat_0', bat(true)); P('bat_1', bat(false));
  // firefly: yellow-green glowing dot with halo
  P('firefly', circ(16, 16, 15, 'url(#g)') + circ(16, 16, 4.2, '#eeff9a') + circ(16, 16, 2.2, '#ffffff'), rad('g', [['0', '#f0ffa0', 0.95], ['0.25', '#d0ff6a', 0.6], ['0.6', '#b8f060', 0.18], ['1', '#b8f060', 0]]));
  // tiny friendly ghost wisp
  P('wisp', circ(16, 15, 14, 'url(#g)') + pth('M10 15Q10 8 16 8Q22 8 22 15L22 21Q21 24 19.5 21.5Q18 24 16 21.5Q14 24 12.5 21.5Q11 24 10 21Z', '#f6f2ff', OL('#9a8fd0', 1.4)) + circ(14, 14.5, 1.2, '#3a3070') + circ(18, 14.5, 1.2, '#3a3070') + ell(12.6, 16.8, 1.2, 0.8, '#ffb4cc', op(0.8)) + ell(19.4, 16.8, 1.2, 0.8, '#ffb4cc', op(0.8)) + stk('M15 17Q16 18 17 17', '#3a3070', 0.9), rad('g', [['0', '#e8e0ff', 0.6], ['1', '#c8c0ff', 0]]));
}

skyDawn(); skyNoon(); skySunset(); skyNight();
farDawn(); farNoon(); farSunset(); farNight();
groundDawn(); groundNoon(); groundSunset(); groundNight();
particles();
fs.writeFileSync(path.join(__dirname, 'lights.json'), JSON.stringify(LIGHTS, null, 1) + '\n');
console.log('environment art written to', OUT);
