// Ollie's Lighthouse Flip: environment art generator (4 floors / times of day + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg       960x540 opaque outside sky, tiles in x (parallax 0.03).
//  - levels/<zone>/far.svg       960x540 outside landscape (mountains, frozen sea, icebergs, snowy shore);
//                                transparent above ~y 200, opaque from the sea line (y 296) down. Tiles in x (0.12).
//  - levels/<zone>/mid.svg       960x540 the corridor's back wall, opaque except 2 window holes (centres x 240 / 720,
//                                see HOLES below), tiles in x (0.6).
//  - levels/<zone>/building.svg  240x400 floor: top surface exactly y 16 (transparent above), opaque below, tiles every 240.
//  - levels/<zone>/rail.svg      240x160 ceiling: opaque y 0..144, smooth beam underside exactly y 144, tiles every 240.
//  - levels/<zone>/rail_end.svg  40x160 right end cap of a ceiling span (the renderer mirrors it for the left end).
//  - particles/*.svg             32x32 (aurora 64x32), centred, transparent edges.
// Tileability: every shape that crosses an edge is emitted again at ±width (wrapG); ridges use whole sine periods.
// Corridor rule (screen y ≈ 141..431 at 960x540): calm, muted, no big green / gold / orange areas
// (leaves #5fd35a / #ffc53d / #ff6b3d, Ollie chestnut #8a5a3c with a teal scarf #2ec4b6).
// Also writes tools/art-environment/palette.json ({zone: {wall, slab, bottom, floor, beam, skyTop, skyBottom, holes}}).
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960, H = 540, BW = 240, BH = 400, RW = 240, RH = 160, ROOF = 16, UNDER = 144, SEA = 296;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#1a1630', t);   // outline / shade: dark tone of the fill, never black
const lite = (c, t = 0.3) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const linU = (id, s, y1, y2) => lin(id, s, 0, y1, 0, y2, ' gradientUnits="userSpaceOnUse"');
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.45], ['1', col, 0]]);
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
// emit a group (absolute coords) again shifted by ±tw when it crosses an edge of a tile tw wide
const wrapG = (x0, x1, body, tw = W) => body + (x0 < 0 ? `<g transform="translate(${tw} 0)">${body}</g>` : '') + (x1 > tw ? `<g transform="translate(${-tw} 0)">${body}</g>` : '');
// periodic ridge: y(x) = base + Σ amp·sin(2πk·x/W + ph), whole periods → seamless
const ridgeY = (x, base, terms) => terms.reduce((y, [k, a, p]) => y + a * Math.sin(2 * Math.PI * k * x / W + p), base);
const ridge = (base, terms, bottom = H, step = 6) => { let d = `M0 ${bottom}`; for (let x = 0; x <= W; x += step) d += `L${x} ${f(ridgeY(x, base, terms))}`; return d + `L${W} ${bottom}Z`; };
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
// path shapes
const rrPath = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
const archPath = (cx, hw, top, bot) => `M${f(cx - hw)} ${f(bot)}V${f(top + hw)}A${f(hw)} ${f(hw)} 0 0 1 ${f(cx + hw)} ${f(top + hw)}V${f(bot)}Z`;
const circPath = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;

// ---------- palettes ----------
const Z = {
  dawn: { // Boot Room
    sky: [['0', '#9d94cf'], ['0.3', '#b7a3d6'], ['0.55', '#d8aac8'], ['0.75', '#f1b9b0'], ['1', '#fbd2b4']],
    mtn: '#c9aecb', mtnSh: '#a991b6', sea: ['#d7b9cf', '#9c8cb4'], ice: '#f6e8ee', iceSh: '#bfaed0', shore: '#efe0ea', shoreSh: '#c8b6d2',
    wall: '#a9b6c8', wallDk: '#8f9db2', frame: '#e8e6e2', sill: '#d8d2c8',
    floor: '#b07a4f', slab: '#7a5236', below: '#5c5262', bottom: '#3a3040',
    ceil: '#8794ab', beam: '#ddd3c2', beamSh: '#b8ad9c', trim: '#b89a6a',
  },
  noon: { // Greenhouse
    sky: [['0', '#4fa2ea'], ['0.38', '#76c0fb'], ['0.72', '#a8d8f8'], ['1', '#d4f0ff']],
    mtn: '#e8f2fa', mtnSh: '#b8cfe2', sea: ['#bfe0f2', '#7fb0d2'], ice: '#ffffff', iceSh: '#c2dcee', shore: '#f8fcff', shoreSh: '#cfe2f0',
    wall: '#dfe9e4', wallDk: '#c6d6cf', frame: '#fbfdfb', sill: '#e9efe9',
    floor: '#c47a5a', slab: '#8a5c4c', below: '#6a5a5a', bottom: '#3e3238',
    ceil: '#d2ddd6', beam: '#cdb48c', beamSh: '#a98f68', trim: '#a8b0a8',
  },
  sunset: { // Map Library
    sky: [['0', '#3d3380'], ['0.28', '#5f4898'], ['0.5', '#8c5c98'], ['0.66', '#c47a8a'], ['0.82', '#e8a086'], ['1', '#f6c09a']],
    mtn: '#a87896', mtnSh: '#7e5a80', sea: ['#b57a8c', '#5e4470'], ice: '#f0cdd0', iceSh: '#9a7096', shore: '#dcb8c6', shoreSh: '#9e7c9e',
    wall: '#6e4f5a', wallDk: '#5a3f4a', frame: '#4c3438', sill: '#5e4246',
    floor: '#7a4a34', slab: '#563428', below: '#3e2c34', bottom: '#241820',
    ceil: '#4a343c', beam: '#86687a', beamSh: '#65495a', trim: '#c4a46e',
  },
  night: { // Lantern Deck
    sky: [['0', '#070c26'], ['0.35', '#0c1434'], ['0.7', '#162050'], ['1', '#22306a']],
    mtn: '#2c3a6c', mtnSh: '#202c58', sea: ['#1e2a5a', '#0e163a'], ice: '#5a6c9e', iceSh: '#34447a', shore: '#3c4a7c', shoreSh: '#283664',
    wall: '#3a4560', wallDk: '#2f384f', frame: '#9a8250', sill: '#4a5470',
    floor: '#4a5470', slab: '#343c56', below: '#262c42', bottom: '#151a2c',
    ceil: '#2a3248', beam: '#56607e', beamSh: '#3e4662', trim: '#b49656',
  },
};
Object.keys(Z).forEach(k => { Z[k].skyTop = Z[k].sky[0][1]; Z[k].skyBottom = Z[k].sky[Z[k].sky.length - 1][1]; });

// =====================================================================================
// SKY
// =====================================================================================
function puffy(x, y, w, col, shade, a = 1) {
  const h = w * 0.32, rr = [0.2, 0.3, 0.26, 0.17];
  let sh = rrect(x - w / 2, y - h * 0.35 + 3, w, h * 0.7, h * 0.35, shade), c = '';
  for (let i = 0; i < 4; i++) { const cx = x - w / 2 + w * (0.18 + i * 0.22), r = w * rr[i]; sh += circ(cx, y - r * 0.55 + 3, r, shade); c += circ(cx, y - r * 0.55, r, col); }
  c += rrect(x - w / 2, y - h * 0.38, w, h * 0.66, h * 0.33, col);
  return wrapG(x - w * 0.62, x + w * 0.62, `<g${op(a)}>${sh}${c}</g>`);
}
const streak = (x, y, w, h, col, top, a) => wrapG(x - w / 2, x + w / 2, `<g${op(a)}>` + rrect(x - w / 2, y - h / 2, w, h, h / 2, col) + rrect(x - w * 0.42, y - h / 2, w * 0.7, h * 0.45, h * 0.22, top) + '</g>');
const bird = (x, y, s, col) => stk(`M${f(x - 6 * s)} ${f(y - 2 * s)}Q${f(x - 3 * s)} ${f(y - 4 * s)} ${f(x)} ${f(y)}Q${f(x + 3 * s)} ${f(y - 4 * s)} ${f(x + 6 * s)} ${f(y - 2 * s)}`, col, 1.6 * s);

function skyDawn(P) {
  const defs = lin('g', P.sky) + glow('sh', '#ffe0c6', 0.65);
  let b = rect(0, 0, W, H, 'url(#g)');
  // warm glow on the horizon + low rising sun (lower half sinks behind the far sea line at y 296)
  b += wrapG(600 - 340, 600 + 340, ell(600, 300, 340, 150, 'url(#sh)'));
  b += circ(600, 292, 46, '#ffe6cc') + circ(600, 292, 36, '#fff2e0') + ell(588, 280, 14, 8, '#fffbf2', op(0.8));
  for (const [x, y, w] of [[200, 262, 420], [760, 236, 360], [470, 276, 300]]) b += wrapG(x - w / 2, x + w / 2, ell(x, y, w / 2, 6, '#fff1ea', op(0.35)));
  for (const [x, y, w, a] of [[120, 70, 150, 0.85], [400, 44, 110, 0.75], [560, 112, 170, 0.8], [850, 80, 130, 0.85], [280, 196, 130, 0.55], [900, 206, 110, 0.5], [700, 170, 90, 0.45]]) b += puffy(x, y, w, '#fbe7e8', '#cdb2d8', a);
  b += `<g${op(0.45)}>` + bird(330, 150, 1, '#6e5a8e') + bird(350, 142, 0.8, '#6e5a8e') + '</g>';
  return svg(W, H, b, defs);
}
function skyNoon(P) {
  const defs = lin('g', P.sky) + glow('sh', '#fff8d6', 0.75);
  let b = rect(0, 0, W, H, 'url(#g)');
  b += circ(180, 70, 100, 'url(#sh)') + circ(180, 70, 24, '#fff7dc') + circ(180, 70, 18, '#fffef4');
  for (const [x, y, w, a] of [[430, 74, 190, 1], [720, 50, 130, 0.95], [890, 120, 200, 1], [60, 150, 150, 0.95]]) b += puffy(x, y, w, '#ffffff', '#d2e6f5', a);
  for (const [x, y, w, a] of [[300, 210, 150, 0.8], [620, 236, 130, 0.7], [820, 200, 110, 0.65], [120, 250, 100, 0.6]]) b += puffy(x, y, w, '#f4faff', '#c8e0f2', a);
  b += `<g${op(0.35)}>` + bird(560, 170, 1, '#4a6a8e') + bird(578, 162, 0.8, '#4a6a8e') + '</g>';
  return svg(W, H, b, defs);
}
function skySunset(P) {
  const defs = lin('g', P.sky) + glow('sh', '#ffc28e', 0.6) + rad('sd', [['0', '#ffe8c4'], ['0.7', '#ffd4a6'], ['1', '#f6b88e']]);
  let b = rect(0, 0, W, H, 'url(#g)');
  b += wrapG(300 - 380, 300 + 380, ell(300, 296, 380, 190, 'url(#sh)'));
  b += circ(300, 286, 78, '#f8c49c', op(0.7)) + circ(300, 286, 64, 'url(#sd)');
  for (const [x, y, w, h] of [[160, 60, 300, 12], [620, 44, 360, 10], [860, 104, 240, 9], [420, 126, 280, 8]]) b += streak(x, y, w, h, '#7a5aa6', '#9a7ac0', 0.55);
  for (const [x, y, w, h] of [[250, 206, 380, 9], [700, 230, 300, 8], [470, 258, 260, 7], [900, 270, 220, 6], [120, 244, 200, 6]]) b += streak(x, y, w, h, '#c8788a', '#e89a92', 0.55);
  b += `<g${op(0.45)}>` + bird(620, 160, 1, '#3e2c5c') + bird(642, 152, 0.8, '#3e2c5c') + '</g>';
  return svg(W, H, b, defs);
}
function skyNight(P) {
  const R = rng(77);
  let defs = lin('g', P.sky) + glow('mg', '#f4ecd0', 0.16)
    + `<mask id="cm"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="836" cy="66" r="26" fill="#000"/></mask>`
    // aurora curtain: violet top -> mint-green lower edge, fading out at the bottom
    + lin('au', [['0', '#8a6ad8', 0], ['0.4', '#8a6ad8', 0.3], ['0.72', '#5ad6a6', 0.5], ['0.86', '#8af0c4', 0.62], ['1', '#8af0c4', 0]])
    + lin('au2', [['0', '#a07ae0', 0], ['0.5', '#7a62cc', 0.26], ['0.84', '#62d8b0', 0.4], ['1', '#62d8b0', 0]])
    + glow('ag', '#6ae0b4', 0.22);
  let b = rect(0, 0, W, H, 'url(#g)');
  // stars (small and dim below y 140 so they never compete with the glowing leaves)
  for (let i = 0; i < 210; i++) {
    const x = R() * W, y = Math.pow(R(), 1.3) * 290, low = y > 140;
    const r = (0.5 + R() * R() * 1.3) * (low ? 0.75 : 1), a = (0.35 + R() * 0.55) * (low ? 0.6 : 1);
    if (Math.hypot(x - 828, y - 70) < 46) continue;
    b += wrapG(x - r, x + r, circ(x, y, r, '#e6e8ff', op(f(a))));
  }
  for (const [x, y, r] of [[120, 40, 4.5], [330, 22, 3.5], [560, 70, 4], [660, 18, 3], [920, 120, 3.5], [240, 104, 3]]) b += pth(twinkle(x, y, r, 0.22), '#f6f2ff', op(0.85));
  // aurora: two layers of curtain "rays" hanging from a wavy periodic line
  const curtain = (grad, top, base, terms, amp, wRay, a, seed) => {
    const Q = rng(seed); let s = '';
    for (let x = 0; x < W; x += wRay) {
      const y = ridgeY(x, base, terms), len = amp * (0.7 + 0.3 * Math.sin(x * 0.07 + seed)) + Q() * 18;
      s += rect(x, y - len, wRay + 0.6, len + 26, `url(#${grad})`, op(f(a * (0.75 + Q() * 0.25))));
    }
    return `<g>${s}</g>`;
  };
  b += wrapG(-1, W + 1, ell(480, 190, 520, 70, 'url(#ag)'));
  b += curtain('au2', 80, 220, [[1, 26, 0.6], [2, 14, 2.1], [3, 8, 4]], 150, 6, 0.8, 5);
  b += curtain('au', 30, 196, [[1, 30, 2.4], [2, 18, 0.3], [4, 6, 1.2]], 170, 4, 0.9, 9);
  // soft bright lower hem
  let hem = `M0 ${f(ridgeY(0, 196, [[1, 30, 2.4], [2, 18, 0.3], [4, 6, 1.2]]) + 18)}`;
  for (let x = 6; x <= W; x += 6) hem += `L${x} ${f(ridgeY(x, 196, [[1, 30, 2.4], [2, 18, 0.3], [4, 6, 1.2]]) + 18)}`;
  b += stk(hem, '#a8f6d2', 3, op(0.35)) + stk(hem, '#7ae6bc', 9, op(0.12));
  // crescent moon
  b += circ(828, 70, 64, 'url(#mg)');
  b += `<g mask="url(#cm)">` + circ(828, 70, 28, '#f4ecd0') + circ(820, 80, 4.5, '#e2d6b2') + circ(814, 60, 3, '#e2d6b2') + '</g>';
  return svg(W, H, b, defs);
}

// =====================================================================================
// FAR: snowy mountains on the far shore, the frozen sea (ice floes, icebergs), a snowy shore in front.
// Transparent above ~y 200 (mountain tops 200..280), opaque from the sea line y 296 down.
// =====================================================================================
function farLayer(z, P) {
  const R = rng({ dawn: 11, noon: 22, sunset: 33, night: 44 }[z]);
  let defs = linU('sea', [['0', P.sea[0]], ['1', P.sea[1]]], SEA, H)
    + linU('hz', [['0', P.skyBottom, 0], ['1', P.skyBottom, 0.35]], 220, SEA);
  let b = '';
  // back range (hazy) and front range with snow caps
  const back = [[2, 16, 0.4], [3, 12, 1.9], [5, 7, 0.2], [9, 3, 2.2]], front = [[1, 10, 2.8], [4, 15, 0.9], [7, 7, 2.5], [11, 3, 0.3]];
  b += pth(ridge(244, back, SEA + 2), mix(P.mtn, P.skyBottom, 0.45));
  b += pth(ridge(266, front, SEA + 2), P.mtn);
  // shaded right-hand faces: a lower copy of the front ridge shifted right
  let sh = `M0 ${SEA + 2}`; for (let x = 0; x <= W; x += 6) sh += `L${x} ${f(Math.max(ridgeY(x - 9, 266, front) + 10, ridgeY(x, 266, front) + 3))}`;
  b += pth(sh + `L${W} ${SEA + 2}Z`, P.mtnSh, op(0.75));
  b += rect(0, 220, W, SEA - 220, 'url(#hz)');
  // frozen sea
  b += rect(0, SEA, W, H - SEA, 'url(#sea)') + rect(0, SEA, W, 2, lite(P.sea[0], 0.35), op(0.8));
  // ice floes: flat lens shapes, smaller and paler near the horizon
  for (let i = 0; i < 26; i++) {
    const y = SEA + 6 + Math.pow(R(), 1.6) * 150, k = (y - SEA) / 150, w = 20 + k * 110 + R() * 30, h = 2 + k * 7, x = R() * W;
    const body = ell(x, y + h * 0.4, w / 2, h * 0.7, P.iceSh, op(0.6)) + ell(x, y, w / 2, h * 0.6, P.ice, op(f(0.55 + k * 0.4)));
    b += wrapG(x - w / 2, x + w / 2, body);
  }
  // icebergs: faceted, a lit and a shaded face, a pale water line
  const berg = (x, base, w, hgt) => {
    const top = base - hgt, a = x - w / 2, c = x + w / 2, px = x - w * 0.12;
    const outline = `M${f(a)} ${f(base)}L${f(a + w * 0.12)} ${f(top + hgt * 0.45)}L${f(px - w * 0.1)} ${f(top + hgt * 0.15)}L${f(px)} ${f(top)}L${f(px + w * 0.2)} ${f(top + hgt * 0.3)}L${f(c - w * 0.14)} ${f(top + hgt * 0.42)}L${f(c)} ${f(base)}Z`;
    const shade = `M${f(px)} ${f(top)}L${f(px + w * 0.2)} ${f(top + hgt * 0.3)}L${f(c - w * 0.14)} ${f(top + hgt * 0.42)}L${f(c)} ${f(base)}L${f(px + w * 0.06)} ${f(base)}Z`;
    let s = pth(outline, P.ice, OL(dark(P.iceSh, 0.2), 1.6)) + pth(shade, P.iceSh, op(0.8));
    s += ell(x, base + 2, w * 0.58, 3.5, lite(P.sea[0], 0.4), op(0.6)) + ell(x, base + 7, w * 0.4, 2.5, P.iceSh, op(0.45));
    return wrapG(a - 4, c + 4, s);
  };
  b += berg(130, SEA + 10, 90, 46) + berg(520, SEA + 6, 54, 30) + berg(760, SEA + 18, 130, 62) + berg(900, SEA + 4, 36, 18) + berg(330, SEA + 26, 70, 34);
  // snowy shore in front (bottom), soft drifts
  const shoreT = [[1, 8, 0.5], [3, 9, 2.0], [6, 4, 1.1]];
  b += pth(ridge(470, shoreT), P.shoreSh) + pth(ridge(478, shoreT.map(([k, a, p]) => [k, a, p + 0.25])), P.shore);
  for (const [x, y, s] of [[90, 470, 1], [400, 462, 0.8], [690, 474, 1.1]]) {
    // little snowy pine silhouettes on the shore (muted, far)
    const col = dark(P.shoreSh, 0.25);
    const tree = (tx, ts) => pth(`M${f(tx)} ${f(y - 40 * ts)}L${f(tx + 11 * ts)} ${f(y - 14 * ts)}L${f(tx + 6 * ts)} ${f(y - 14 * ts)}L${f(tx + 14 * ts)} ${f(y)}L${f(tx - 14 * ts)} ${f(y)}L${f(tx - 6 * ts)} ${f(y - 14 * ts)}L${f(tx - 11 * ts)} ${f(y - 14 * ts)}Z`, col, op(0.8))
      + pth(`M${f(tx)} ${f(y - 40 * ts)}L${f(tx + 5 * ts)} ${f(y - 28 * ts)}L${f(tx - 5 * ts)} ${f(y - 28 * ts)}Z`, P.shore);
    b += wrapG(x - 40, x + 40, tree(x, s) + tree(x + 22 * s, s * 0.75) + tree(x - 18 * s, s * 0.6));
  }
  return svg(W, H, b, defs);
}

// =====================================================================================
// MID: the corridor back wall, opaque except 2 window holes per 960 (centres x 240 and 720).
// =====================================================================================
const WX = [240, 720];
const HOLES = {
  dawn: { kind: 'rect', hw: 92, top: 166, bot: 334, r: 10 },
  noon: { kind: 'rect', hw: 126, top: 146, bot: 356, r: 22 },
  sunset: { kind: 'arch', hw: 82, top: 152, bot: 334 },
  night: { kind: 'circle', cx: 0, cy: 250, r: 84 },
};
const holePath = (h, cx, grow = 0) => h.kind === 'rect' ? rrPath(cx - h.hw - grow, h.top - grow, 2 * (h.hw + grow), h.bot - h.top + 2 * grow, h.r + grow)
  : h.kind === 'arch' ? archPath(cx, h.hw + grow, h.top - grow, h.bot + grow) : circPath(cx, h.cy, h.r + grow);
const holeRange = h => h.kind === 'circle' ? [h.cy - h.r, h.cy + h.r] : [h.top, h.bot];

function midLayer(z, P) {
  const h = HOLES[z], R = rng({ dawn: 101, noon: 202, sunset: 303, night: 404 }[z]);
  const holes = WX.map(x => holePath(h, x)).join('');
  const ol = dark(P.wall, 0.45);
  let defs = `<clipPath id="wc"><path clip-rule="evenodd" d="M0 0H${W}V${H}H0Z${holes}"/></clipPath>`
    + linU('sh', [['0', dark(P.wall, 0.5), 0.75], ['0.24', dark(P.wall, 0.3), 0.1], ['0.3', P.wall, 0], ['0.76', P.wall, 0], ['0.84', dark(P.wall, 0.3), 0.18], ['1', dark(P.wall, 0.5), 0.7]], 0, H);
  let wall = rect(0, 0, W, H, P.wall);
  let deco = '';                      // drawn on the wall (clipped out of the holes)
  let front = '';                     // frames, mullions, sills (drawn over the holes' edges)
  const frameRing = (grow, col, extra = '') => WX.map(x => pth(holePath(h, x, grow) + holePath(h, x), col, ` fill-rule="evenodd"${extra}`)).join('');

  if (z === 'dawn') {
    // vertical painted planks (40 wide), wainscot below a chair rail
    for (let x = 0; x < W; x += 40) wall += rect(x, 0, 1.6, H, P.wallDk, op(0.55)) + rect(x + 1.6, 0, 1.2, H, lite(P.wall, 0.25), op(0.35));
    for (let i = 0; i < 40; i++) { const x = Math.floor(R() * 24) * 40 + 8 + R() * 24, y = R() * 500; wall += rect(x, y, 1.2, 10 + R() * 30, P.wallDk, op(0.25)); }
    wall += rect(0, 360, W, H - 360, P.wallDk) + rect(0, 354, W, 10, lite(P.wall, 0.3), OL(ol, 1.5));
    for (let x = 20; x < W; x += 80) wall += rrect(x, 378, 60, 140, 4, 'none', OL(dark(P.wallDk, 0.2), 1.6) + op(0.6));
    // coat-hook rail between the windows at x 480 with three coats
    const hooks = (cx) => {
      let s = rrect(cx - 96, 194, 192, 12, 3, '#b8a58c', OL('#7a6a5a', 2));
      const coats = [['#7e8fb0', -60], ['#9a8aa6', 0], ['#8c9496', 60]];
      for (const [col, dx] of coats) {
        const x = cx + dx, c2 = dark(col, 0.3);
        s += circ(x, 200, 3.5, '#8a7a60');
        s += pth(`M${f(x - 10)} ${f(212)}Q${f(x)} ${f(202)} ${f(x + 10)} ${f(212)}L${f(x + 22)} ${f(300)}Q${f(x)} ${f(308)} ${f(x - 22)} ${f(300)}Z`, col, OL(c2, 2.5));
        s += stk(`M${f(x)} ${f(214)}V${f(300)}`, c2, 1.6, op(0.7)) + pth(`M${f(x - 10)} ${f(212)}L${f(x)} ${f(232)}L${f(x + 10)} ${f(212)}Z`, lite(col, 0.2), OL(c2, 1.5));
        for (const yy of [244, 264, 284]) s += circ(x + 3, yy, 1.8, lite(col, 0.5));
        s += rrect(x - 21, 300, 8, 18, 3, col, OL(c2, 2)) + rrect(x + 13, 300, 8, 18, 3, col, OL(c2, 2));  // sleeves/pocket tips
      }
      // knitted hat on the first hook
      s += pth(`M${f(cx - 74)} ${f(196)}Q${f(cx - 60)} ${f(172)} ${f(cx - 46)} ${f(196)}Z`, '#c4b0b8', OL('#8a7480', 2)) + circ(cx - 60, 176, 5, '#ece2e4', OL('#8a7480', 1.5));
      return s;
    };
    deco += hooks(480);
    // skis leaning on the wall + boots at x 0 (wraps)
    const skis = (cx) => {
      let s = '';
      for (const [dx, col, rot] of [[-36, '#8e9cbc', -8], [-18, '#a8b4c8', -6], [22, '#b9a28a', 7], [38, '#9eac9a', 9]]) {
        const c2 = dark(col, 0.35);
        s += `<g transform="rotate(${rot} ${cx + dx} 431)">` + pth(`M${f(cx + dx - 5)} 431V200Q${f(cx + dx - 5)} 184 ${f(cx + dx + 2)} 180Q${f(cx + dx + 5)} 186 ${f(cx + dx + 5)} 200V431Z`, col, OL(c2, 2.2)) + rect(cx + dx - 5, 300, 10, 14, c2, op(0.6)) + '</g>';
      }
      // a pair of boots on the floor
      for (const bx of [cx - 70, cx + 62]) s += pth(`M${f(bx - 8)} 431V398H${f(bx + 6)}V418Q${f(bx + 16)} 418 ${f(bx + 18)} 431Z`, '#7d7488', OL('#4e4658', 2.2)) + rect(bx - 8, 398, 14, 5, '#c9c0cc');
      return wrapG(cx - 90, cx + 90, s);
    };
    deco += skis(0);
    front += frameRing(14, P.frame, OL(ol, 2.5));
    for (const x of WX) {
      front += rect(x - 2.5, h.top, 5, h.bot - h.top, P.frame) + rect(x - h.hw, 248, 2 * h.hw, 5, P.frame);        // mullions
      front += rrect(x - h.hw - 24, h.bot + 8, 2 * h.hw + 48, 12, 3, P.sill, OL(ol, 2));                          // sill
    }
  } else if (z === 'noon') {
    // greenhouse: white glass-frame structure: posts, frosted panels between the windows
    for (const cx of [0, 480]) {
      let s = '';
      for (const dx of [-80, 0, 80]) s += rect(cx + dx - 4, 0, 8, H, P.frame, OL(dark(P.wall, 0.25), 1.5));
      for (const dx of [-40, 40]) s += rrect(cx + dx - 30, 40, 60, 300, 6, lite(P.wallDk, 0.25), op(0.8)) + pth(`M${f(cx + dx - 18)} 330L${f(cx + dx + 10)} 60L${f(cx + dx + 20)} 60L${f(cx + dx - 8)} 330Z`, '#ffffff', op(0.35));
      deco += wrapG(cx - 120, cx + 120, s);
    }
    wall += rect(0, 380, W, H - 380, P.wallDk) + rect(0, 374, W, 8, P.frame, OL(dark(P.wall, 0.25), 1.5));
    // potting bench with small pots (muted)
    for (const cx of [0, 480]) {
      let s = rrect(cx - 90, 400, 180, 8, 2, '#b8a588', OL('#7e6e58', 1.8)) + rect(cx - 82, 408, 6, 24, '#a08e72') + rect(cx + 76, 408, 6, 24, '#a08e72');
      for (const [dx, sz] of [[-58, 1], [-10, 0.8], [42, 1.1]]) {
        const px = cx + dx;
        s += circ(px - 6 * sz, 380 - 6 * sz, 9 * sz, '#86a892', OL('#5e7f6a', 1.6)) + circ(px + 6 * sz, 378 - 8 * sz, 10 * sz, '#94b49e', OL('#5e7f6a', 1.6)) + circ(px, 372 - 14 * sz, 8 * sz, '#a2bea8', OL('#5e7f6a', 1.6));
        s += pth(`M${f(px - 14 * sz)} ${f(380)}H${f(px + 14 * sz)}L${f(px + 10 * sz)} 400H${f(px - 10 * sz)}Z`, '#b9907c', OL('#7e5e50', 1.8)) + rect(px - 15 * sz, 378, 30 * sz, 5, '#c8a08c', OL('#7e5e50', 1.4));
      }
      deco += wrapG(cx - 100, cx + 100, s);
    }
    front += frameRing(12, P.frame, OL(dark(P.wall, 0.35), 2.5));
    for (const x of WX) {
      for (const dx of [-42, 42]) front += rect(x + dx - 3, h.top, 6, h.bot - h.top, P.frame, OL(dark(P.wall, 0.25), 1));
      front += rect(x - h.hw, 250, 2 * h.hw, 6, P.frame, OL(dark(P.wall, 0.25), 1));
      front += rrect(x - h.hw - 18, h.bot + 6, 2 * h.hw + 36, 10, 3, P.sill, OL(dark(P.wall, 0.35), 2));
      // vines along the top of each frame, a few tendrils hanging down the sides (sage, muted)
      let d = `M${x - h.hw - 14} ${h.top - 4}`;
      for (let i = 1; i <= 10; i++) { const xx = x - h.hw - 14 + i * (2 * h.hw + 28) / 10; d += `Q${f(xx - 13)} ${f(h.top - 4 + (i % 2 ? 9 : -9))} ${f(xx)} ${f(h.top - 4)}`; }
      front += stk(d, '#5e7f6a', 2.4);
      for (let i = 0; i < 16; i++) { const lx = x - h.hw - 10 + i * (2 * h.hw + 20) / 15, ly = h.top - 4 + (i % 2 ? 6 : -6); front += `<g transform="rotate(${(i % 2 ? 40 : -40)} ${f(lx)} ${f(ly)})">` + ell(lx, ly, 7, 4, i % 3 ? '#8cae96' : '#9cbca4', OL('#5e7f6a', 1.2)) + '</g>'; }
      for (const side of [-1, 1]) {
        const sx = x + side * (h.hw + 6), len = 70 + R() * 50;
        front += stk(`M${sx} ${h.top}Q${sx + side * 8} ${f(h.top + len / 2)} ${sx} ${f(h.top + len)}`, '#5e7f6a', 2);
        for (let t = 0.2; t < 1; t += 0.22) front += ell(sx + side * 5 * Math.sin(t * 3), h.top + len * t, 5, 3, '#8cae96', OL('#5e7f6a', 1));
      }
    }
  } else if (z === 'sunset') {
    // wood panels: vertical stiles every 120, raised panels upper + lower, a picture rail
    for (let x = 0; x < W; x += 120) wall += rect(x - 5, 0, 10, H, P.wallDk);
    for (let x = 0; x < W; x += 120) wall += rrect(x + 14, 60, 92, 270, 4, 'none', OL(dark(P.wall, 0.25), 2) + op(0.7)) + rrect(x + 16, 62, 88, 3, 1, lite(P.wall, 0.15), op(0.5)) + rrect(x + 14, 380, 92, 140, 4, 'none', OL(dark(P.wall, 0.25), 2) + op(0.7));
    wall += rect(0, 356, W, 12, P.wallDk, OL(dark(P.wall, 0.4), 1.5)) + rect(0, 120, W, 6, P.wallDk);
    // bookshelf between the windows at x 480
    const shelf = (cx) => {
      const x0 = cx - 92, x1 = cx + 92, wood = '#5a3c36', wd = dark(wood, 0.35);
      let s = rect(x0, 128, x1 - x0, 303, dark(wood, 0.25), OL(wd, 2.5)) + rect(x0, 124, x1 - x0, 10, wood, OL(wd, 2));
      const books = ['#8a6a7a', '#6e7a96', '#8a7a62', '#7a5a68', '#5e6e7e', '#9a8a7a', '#6a5a7a', '#7e8a86'];
      for (const sy of [206, 282, 358]) {
        let x = x0 + 8;
        while (x < x1 - 12) {
          const w = 8 + R() * 8, ht = 44 + R() * 22, col = books[Math.floor(R() * books.length)], lean = R() < 0.08;
          if (R() < 0.07 && x < x1 - 40) { x += 14; continue; }
          s += lean ? `<g transform="rotate(12 ${f(x)} ${sy})">` + rect(x, sy - ht, w, ht, col, OL(dark(col, 0.4), 1.4)) + '</g>' : rect(x, sy - ht, w, ht, col, OL(dark(col, 0.4), 1.4)) + rect(x + 2, sy - ht + 8, w - 4, 2, lite(col, 0.3), op(0.6));
          x += w + 1.5;
        }
        s += rect(x0, sy, x1 - x0, 8, wood, OL(wd, 1.6));
      }
      // a small globe on top of the shelf
      s += rect(cx + 46, 112, 4, 12, '#8a7050') + circ(cx + 48, 98, 14, '#7a8aa6', OL('#4e5a72', 2)) + pth(`M${cx + 40} 92q6 -4 10 2q-2 8 -8 6z`, '#a69a7a', op(0.8)) + stk(`M${cx + 30} 98a18 18 0 0 0 36 0`, '#a08458', 2);
      return s;
    };
    deco += shelf(480);
    // framed map at x 0 (wraps)
    const map = (cx) => {
      let s = rrect(cx - 84, 182, 168, 116, 4, '#7a5a3e', OL('#4a3424', 2.5)) + rect(cx - 74, 192, 148, 96, '#cdbb9c');
      s += pth(`M${cx - 60} 220q20 -14 40 -2q10 18 -8 30q-24 6 -32 -10z`, '#a8b0a0', OL('#7a7a6a', 1.4)) + pth(`M${cx + 14} 240q24 -20 46 -4q6 22 -18 30q-22 0 -28 -26z`, '#b0a890', OL('#7a7a6a', 1.4));
      s += stk(`M${cx - 70} 268q40 -10 70 4t70 -6`, '#8a9ab0', 1.6, ' stroke-dasharray="4 4"') + stk(`M${cx - 30} 236l40 12l20 -14`, '#9a6a5a', 1.4, ' stroke-dasharray="3 3"');
      s += circ(cx + 52, 208, 8, 'none', OL('#7a6a5a', 1.2)) + stk(`M${cx + 52} 198v20M${cx + 42} 208h20`, '#7a6a5a', 1.2);
      return wrapG(cx - 90, cx + 90, s);
    };
    deco += map(0);
    front += frameRing(14, P.frame, OL(dark(P.frame, 0.4), 2.5));
    for (const x of WX) {
      front += rect(x - 2.5, h.top, 5, h.bot - h.top, P.frame) + rect(x - h.hw, 252, 2 * h.hw, 5, P.frame);
      front += stk(archPath(x, h.hw - 22, h.top + 22, h.bot).replace(/V[\d.]+Z$/, ''), P.frame, 4);
      front += rrect(x - h.hw - 24, h.bot + 8, 2 * h.hw + 48, 12, 3, P.sill, OL(dark(P.frame, 0.4), 2));
    }
  } else { // night: deep blue-grey stone blocks, brass portholes and pipes
    for (let y = 0, row = 0; y < H; y += 45, row++) {
      wall += rect(0, y, W, 2, P.wallDk);
      for (let x = (row % 2 ? 40 : 0); x < W; x += 80) wall += rect(x, y, 2, 45, P.wallDk);
    }
    for (let i = 0; i < 46; i++) { const x = Math.floor(R() * 12) * 80 + 6 + (R() < 0.5 ? 40 : 0), y = Math.floor(R() * 12) * 45 + 6; wall += rrect(x, y, 68, 33, 4, lite(P.wall, 0.06), op(0.6)); }
    // brass pipes: a horizontal pair low on the wall and a vertical one at x 480 with a valve wheel + gauge
    const brass = '#7a6e58', bd = '#463e30', bh = '#a09070';
    wall += rect(0, 392, W, 8, brass, OL(bd, 1.6)) + rect(0, 393, W, 2, bh, op(0.5));
    for (let x = 60; x < W; x += 240) wall += rrect(x - 6, 388, 12, 16, 3, dark(brass, 0.25), OL(bd, 1.4));
    const vpipe = (cx) => {
      let s = rect(cx - 6, 0, 12, 392, brass, OL(bd, 1.6)) + rect(cx - 4, 0, 3, 392, bh, op(0.55));
      s += rrect(cx - 10, 140, 20, 10, 3, dark(brass, 0.2), OL(bd, 1.4)) + rrect(cx - 10, 330, 20, 10, 3, dark(brass, 0.2), OL(bd, 1.4));
      s += circ(cx, 236, 22, 'none', OL(bd, 6)) + circ(cx, 236, 22, 'none', OL(brass, 3.5)) + stk(`M${cx - 20} 236H${cx + 20}M${cx} 216V256`, brass, 3) + circ(cx, 236, 5, bh, OL(bd, 1.4));
      s += rect(cx + 6, 290, 18, 4, brass) + circ(cx + 34, 292, 13, '#d8d2bc', OL(bd, 3)) + stk(`M${cx + 34} 292l6 -6`, '#5a4a3a', 2);
      return s;
    };
    wall += vpipe(480);
    // small mooring rope coil + lantern hook at x 0 (wraps)
    const coil = (cx) => wrapG(cx - 40, cx + 40, rrect(cx - 5, 196, 10, 12, 3, '#5e6680', OL('#2e3448', 1.4))
      + [[-2, 22, 46], [2, 18, 52], [0, 25, 40]].map(([dx, rx, ry]) => ell(cx + dx, 204 + ry, rx, ry, 'none', OL('#7e7666', 6)) + ell(cx + dx, 204 + ry, rx, ry, 'none', OL('#a39a86', 2.5))).join('')
      + stk(`M${cx + 6} 296q6 20 -2 34`, '#8e8676', 5));
    deco += coil(0);
    front += frameRing(16, '#8a7a56', OL('#4e4430', 2.5));
    for (const x of WX) {
      front += pth(holePath(h, x, 6) + holePath(h, x), dark('#8a7a56', 0.2), ' fill-rule="evenodd"');
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; front += circ(x + Math.cos(a) * (h.r + 11), h.cy + Math.sin(a) * (h.r + 11), 2.6, '#b8a678', OL('#4e4430', 1)); }
      front += rrect(x - 18, h.cy + h.r + 10, 36, 14, 4, dark('#8a7a56', 0.1), OL('#4e4430', 2));  // hinge latch
    }
  }
  // soft shading toward the ceiling and the floor (keeps the middle band calm and readable)
  const body = `<g clip-path="url(#wc)">${wall}${deco}${rect(0, 0, W, H, 'url(#sh)')}</g>` + front;
  return svg(W, H, body, defs);
}

// =====================================================================================
// BUILDING: the floor, 240x400, running surface line y 16 (nothing above), opaque below; tiles every 240.
// =====================================================================================
function building(z, P) {
  const ol = dark(P.slab, 0.45);
  let defs = linU('bl', [['0', P.below], ['0.5', dark(P.below, 0.15)], ['1', P.bottom]], 110, 372);
  let b = '';
  // floor covering y 16..40
  if (z === 'dawn') {
    b += rect(0, ROOF, BW, 24, P.floor) + rect(0, ROOF, BW, 3, lite(P.floor, 0.35)) + rect(0, 37, BW, 3, dark(P.floor, 0.25));
    for (const x of [24, 104, 184]) b += rect(x, 20, 1.8, 17, dark(P.floor, 0.4), op(0.7));
    for (const [x, y, w] of [[40, 26, 40], [130, 30, 30], [196, 24, 28], [6, 31, 14]]) b += rect(x, y, w, 1.2, dark(P.floor, 0.25), op(0.5));
    // a woven doormat strip (muted blue-grey) - the renderer clips spans, so it reads as random rugs
    b += rect(140, ROOF, 70, 6, '#8a96aa') + rect(140, ROOF, 70, 2, '#a8b2c2');
    for (let x = 143; x < 208; x += 6) b += rect(x, 18, 2, 4, '#6e7a90');
  } else if (z === 'noon') {
    b += rect(0, ROOF, BW, 24, P.floor) + rect(0, ROOF, BW, 3, lite(P.floor, 0.32)) + rect(0, 37, BW, 3, dark(P.floor, 0.25));
    for (let x = 0; x < BW; x += 40) b += rect(x, 19, 2, 18, lite(P.floor, 0.45), op(0.8)) + rect(x + 6, 24, 10, 6, lite(P.floor, 0.12), op(0.5));
  } else if (z === 'sunset') {
    b += rect(0, ROOF, BW, 24, P.floor) + rect(0, ROOF, BW, 3, lite(P.floor, 0.3)) + rect(0, 37, BW, 3, dark(P.floor, 0.25));
    for (const x of [60, 140, 220]) b += rect(x, 20, 1.8, 17, dark(P.floor, 0.45), op(0.7));
    // runner rug: dusky plum with a cream border pattern
    b += rect(0, ROOF, BW, 9, '#7a5a78') + rect(0, ROOF, BW, 2, '#9a7a96') + rect(0, 22, BW, 1.6, '#c8b090', op(0.8));
    for (let x = 4; x < BW; x += 12) b += pth(`M${x} 19.5l3 -2l3 2l-3 2z`, '#c8b090', op(0.7));
  } else {
    b += rect(0, ROOF, BW, 24, P.floor) + rect(0, ROOF, BW, 3, lite(P.floor, 0.35)) + rect(0, 37, BW, 3, dark(P.floor, 0.25));
    for (const x of [0, 60, 120, 180]) b += rect(x, 19, 2, 18, dark(P.floor, 0.4), op(0.8));
    for (const x of [30, 150]) b += circ(x, 28, 2.2, '#b49656', OL('#6e5a34', 0.8));   // brass deck rivets
  }
  // floor slab y 40..104: joist ends with end-grain rings (period 120)
  b += rect(0, 40, BW, 64, P.slab) + rect(0, 40, BW, 4, dark(P.slab, 0.35));
  for (const x of [30, 150]) {
    b += rrect(x, 50, 60, 44, 5, lite(P.slab, 0.08), OL(ol, 2));
    for (const r of [7, 15]) b += ell(x + 30, 72, r * 1.3, r * 0.8, 'none', OL(dark(P.slab, 0.15), 1) + op(0.35));
    b += rect(x + 60, 64, 60, 3, dark(P.slab, 0.25), op(0.5));
  }
  b += rect(0, 100, BW, 4, dark(P.slab, 0.4));
  // storey below y 104..372: stone wall, a radiator with a soft warm glow, then fading to the bottom colour
  b += rect(0, 104, BW, 296, 'url(#bl)');
  let m = '';
  for (let y = 104, row = 0; y < 330; y += 36, row++) { m += rect(0, y, BW, 2, dark(P.below, 0.35)); for (let x = row % 2 ? 30 : 0; x < BW; x += 60) m += rect(x, y, 2, 36, dark(P.below, 0.35)); }
  b += `<g${op(0.55)}>${m}</g>`;
  defs += glow('rg', '#ffb878', z === 'night' ? 0.4 : 0.3);
  b += ell(120, 196, 80, 56, 'url(#rg)');
  const iron = mix(P.below, '#9aa2b4', 0.45), ird = dark(iron, 0.4);
  b += rrect(68, 166, 104, 56, 8, iron, OL(ird, 2.5));
  for (let x = 80; x < 168; x += 12) b += rrect(x, 172, 7, 44, 3.5, lite(iron, 0.15), OL(ird, 1.2));
  b += rect(62, 214, 8, 22, ird) + rect(170, 214, 8, 22, ird) + circ(178, 174, 4, '#c8a870', OL('#6e5a34', 1.2));
  b += rect(0, 372, BW, 28, P.bottom);
  return svg(BW, BH, b, defs);
}

// =====================================================================================
// RAIL: the ceiling, 240x160, opaque y 0..144, beam underside exactly y 144; tiles every 240.
// =====================================================================================
function ceilingParts(z, P, x0, x1) {
  const ol = dark(P.ceil, 0.45);
  let s = '';
  // ceiling boards seen from below (y 0..74), horizontal plank lines
  s += rect(x0, 0, x1 - x0, 104, P.ceil);
  for (let y = 12; y < 74; y += 15) s += rect(x0, y, x1 - x0, 1.6, dark(P.ceil, 0.3), op(0.6)) + rect(x0, y + 1.6, x1 - x0, 1, lite(P.ceil, 0.2), op(0.4));
  s += rect(x0, 70, x1 - x0, 34, dark(P.ceil, 0.25));             // shadowed gap above the beam
  // crossing joists (end-on), period 120 at x 20 / 140
  for (let jx = Math.floor((x0 - 20) / 120) * 120 + 20; jx < x1; jx += 120) {
    if (jx + 30 < x0) continue;
    const jc = mix(P.ceil, P.beamSh, 0.55), jd = dark(jc, 0.4);
    s += pth(`M${jx + 3} 0H${jx + 27}L${jx + 30} 92H${jx}Z`, jc, OL(jd, 2)) + pth(`M${jx + 6} 0H${jx + 10}L${jx + 9} 92H${jx + 4}Z`, lite(jc, 0.2), op(0.5));
    s += rrect(jx - 4, 88, 38, 18, 3, dark(jc, 0.08), OL(jd, 2));     // corbel block
  }
  // main beam y 104..144
  s += rect(x0, 104, x1 - x0, 40, P.beam) + rect(x0, 104, x1 - x0, 4, dark(P.beam, 0.3)) + rect(x0, 108, x1 - x0, 3, lite(P.beam, 0.25), op(0.6));
  for (const [y, a] of [[118, 0.35], [126, 0.25], [133, 0.3]]) s += rect(x0, y, x1 - x0, 1.2, dark(P.beam, 0.3), op(a));
  // brass / trim plates with bolts (period 120, at x 80 / 200)
  for (let px = Math.floor((x0 - 80) / 120) * 120 + 80; px < x1; px += 120) {
    if (px + 26 < x0) continue;
    s += rrect(px - 13, 112, 26, 22, 3, P.trim, OL(dark(P.trim, 0.45), 1.8)) + circ(px - 6, 123, 2.2, lite(P.trim, 0.4)) + circ(px + 6, 123, 2.2, lite(P.trim, 0.4));
  }
  // underside: dark line + light lip; ends exactly at y 144
  s += rect(x0, 137, x1 - x0, 2.5, dark(P.beam, 0.4), op(0.8)) + rect(x0, 139.5, x1 - x0, 4.5, lite(P.beam, 0.45));
  return s;
}
const rail = (z, P) => svg(RW, RH, ceilingParts(z, P, 0, RW));
function railEnd(z, P) {
  // ceiling + beam come in from x 0 (matches rail.svg at x 0), boards end at x 26 with a cut face, the beam ends
  // with a rounded brass corner plate at x 34, and a tiny lamp hangs at the very end.
  const ol = dark(P.beam, 0.45);
  let b = `<clipPath id="ce"><path d="M0 0H22Q28 0 28 8V100H34V136Q34 144 26 144H0Z"/></clipPath>`;
  b += `<g clip-path="url(#ce)">${ceilingParts(z, P, 0, 40)}</g>`;
  b += rect(20, 0, 8, 100, dark(P.ceil, 0.35)) + stk('M28 4V100H34V136Q34 144 26 144', ol, 2.5);
  // brass corner plate (L) on the beam end
  b += pth('M18 104H34V136Q34 144 26 144H18V136H26V112H18Z', P.trim, OL(dark(P.trim, 0.45), 1.6)) + circ(29.5, 118, 1.8, lite(P.trim, 0.4)) + circ(22, 139.5, 1.8, lite(P.trim, 0.4));
  // tiny lamp under the end (hangs to y 158)
  b += rect(28, 144, 2, 4, dark(P.trim, 0.4)) + rrect(24, 147, 10, 11, 3, '#fff2b8', OL(dark(P.trim, 0.4), 1.4)) + rect(23, 146, 12, 3, P.trim);
  return svg(40, RH, b);
}

// =====================================================================================
// PARTICLES (32x32, aurora 64x32), centred, transparent edges
// =====================================================================================
function particles() {
  const P = (name, body, defs = '', w = 32, h = 32) => write(`particles/${name}.svg`, svg(w, h, body, defs));
  const soft = (col, a = 0.5) => rad('g', [['0', col, a], ['1', col, 0]]);
  P('snow', circ(16, 16, 14, 'url(#g)') + circ(16, 16, 6.5, '#ffffff', op(0.95)) + circ(14.2, 14.2, 2.2, '#ffffff'), rad('g', [['0', '#ffffff', 0.7], ['0.45', '#f4f8ff', 0.35], ['1', '#ffffff', 0]]));
  let fl = '';
  for (let i = 0; i < 6; i++) fl += `<g transform="rotate(${i * 60} 16 16)">` + stk('M16 16V3.5', '#eef6ff', 2.2) + stk('M16 9L12.5 5.5M16 9L19.5 5.5M16 13L13.5 10.5M16 13L18.5 10.5', '#eef6ff', 1.6) + '</g>';
  P('flake', circ(16, 16, 14, 'url(#g)') + `<g${OL('#8fb8e0', 3.6)}>${fl.replace(/stroke="#eef6ff"/g, 'stroke="#8fb8e0" opacity="0.5"')}</g>` + fl + circ(16, 16, 2.6, '#ffffff'), soft('#cfe4ff', 0.4));
  P('mote', circ(16, 16, 14, 'url(#g)') + circ(16, 16, 3.2, '#fff0d8', op(0.9)), rad('g', [['0', '#ffe2b8', 0.85], ['0.4', '#ffc890', 0.32], ['1', '#ffc080', 0]]));
  P('sparkle', circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#f8f6ff') + circ(16, 16, 2, '#ffffff'), soft('#e4e8ff', 0.5));
  P('star', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 11, 5), '#fff3c4', OL('#d8b060', 1.6)) + circ(13.5, 14, 1.6, '#ffffff', op(0.85)), soft('#fff6d0', 0.4));
  P('puff', circ(12, 18, 6.5, '#ffffff', op(0.9)) + circ(19, 15, 7.5, '#ffffff', op(0.95)) + circ(18, 21, 6.5, '#e8ecf4', op(0.9)) + circ(11, 20.5, 5, '#eef0f6', op(0.85)) + circ(17, 13.5, 3, '#ffffff'));
  [['#5fd35a', '#2f8a34'], ['#ffc53d', '#b07c10'], ['#ff6b3d', '#b03a1a']].forEach(([c, o], i) => {
    const leaf = 'M6 22Q6 9 22 6Q26 6 26 10Q23 26 10 26Q6 26 6 22Z';
    P(`bit_${i}`, `<g transform="rotate(${[-10, 15, -30][i]} 16 16)">` + pth(leaf, c, OL(o, 1.8)) + pth('M8 24Q13 19 15 16', 'none', OL(lite(c, 0.55), 1.4)) + stk('M9 23Q16 15 23 9', lite(c, 0.6), 1.4) + stk('M6 26L9 23', o, 1.8) + ell(14, 12, 3, 1.6, '#ffffff', op(0.5) + ' transform="rotate(-40 14 12)"') + '</g>');
  });
  P('aurora', ell(32, 16, 30, 11, 'url(#g)') + ell(28, 14, 18, 5, 'url(#h)'),
    rad('g', [['0', '#7ff0bc', 0.65], ['0.55', '#5ad6a6', 0.3], ['1', '#8a6ad8', 0]]) + rad('h', [['0', '#c8ffe4', 0.55], ['1', '#a0f0d0', 0]]), 64, 32);
  P('glow', circ(16, 16, 16, 'url(#g)'), rad('g', [['0', '#ffffff', 1], ['0.25', '#ffffff', 0.7], ['0.6', '#ffffff', 0.2], ['1', '#ffffff', 0]]));
}

// =====================================================================================
const pal = {};
for (const z of Object.keys(Z)) {
  const P = Z[z];
  write(`levels/${z}/sky.svg`, { dawn: skyDawn, noon: skyNoon, sunset: skySunset, night: skyNight }[z](P));
  write(`levels/${z}/far.svg`, farLayer(z, P));
  write(`levels/${z}/mid.svg`, midLayer(z, P));
  write(`levels/${z}/building.svg`, building(z, P));
  write(`levels/${z}/rail.svg`, rail(z, P));
  write(`levels/${z}/rail_end.svg`, railEnd(z, P));
  const hr = holeRange(HOLES[z]);
  pal[z] = { wall: P.wall, slab: P.slab, bottom: P.bottom, floor: P.floor, beam: P.beam, ceil: P.ceil, skyTop: P.skyTop, skyBottom: P.skyBottom, windowY: hr, windowX: WX };
}
// remove particle files of the old game that no longer exist in the contract
for (const old of ['mist', 'seed', 'leaf', 'spark', 'bit_pink', 'bit_yellow', 'bit_cyan', 'shoot']) { const p = path.join(OUT, 'particles', old + '.svg'); if (fs.existsSync(p)) fs.unlinkSync(p); }
particles();
fs.writeFileSync(path.join(__dirname, 'palette.json'), JSON.stringify(pal, null, 2) + '\n');
console.log('environment art written to', OUT);
