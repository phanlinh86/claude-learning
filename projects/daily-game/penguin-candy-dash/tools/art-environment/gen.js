// Pip's Candy Dash: environment art generator (biomes + particles).
// Writes original, hand-authored, procedurally-laid-out SVGs.
// Usage: node gen.js [assetsDir]
// Same helper approach as projects/daily-game/foxy-reef-memory/tools/art-environment/gen.js,
// but for a single-screen TOP-DOWN (3/4) arena: no tiling, calm centre, decorated border ring.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const W = 960, H = 540;
const AR = { x: 40, y: 84, w: 880, h: 432, r: 26 }; // arena (DESIGN §2)
const GATE = { x: 900, y: 300, top: 228, bottom: 372 }; // keep the right border clear here
let PREC = 10; // 10 = 0.1 px; dense layers drop to 2 (0.5 px) to stay < 60 KB
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function svg(body, defs = '', w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const rrect = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
// smooth closed curve through points (quadratic through midpoints)
function smooth(pts) {
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const n = pts.length;
  let s = m(pts[n - 1], pts[0]); let d = `M${f(s[0])} ${f(s[1])}`;
  for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); d += `Q${f(p[0])} ${f(p[1])} ${f(q[0])} ${f(q[1])}`; }
  return d + 'Z';
}
function blob(cx, cy, rx, ry, seed, n = 14, jit = 0.08) {
  const r = rng(seed); const pts = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n, k = 1 + (r() - 0.5) * 2 * jit; pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]); }
  return smooth(pts);
}
// scalloped circle (candy floss / cloud edge)
function scallop(cx, cy, R, bumps, depth, seed = 1) {
  const r = rng(seed); let d = '';
  for (let i = 0; i <= bumps; i++) {
    const t0 = 2 * Math.PI * i / bumps, t1 = 2 * Math.PI * (i + 0.5) / bumps;
    const x0 = cx + Math.cos(t0) * R, y0 = cy + Math.sin(t0) * R;
    const k = 1 + depth * (0.8 + r() * 0.4);
    const x1 = cx + Math.cos(t1) * R * k, y1 = cy + Math.sin(t1) * R * k;
    d += i ? `Q${f(x1)} ${f(y1)} ${f(x0)} ${f(y0)}` : `M${f(x0)} ${f(y0)}`;
    if (i < bumps) { const t2 = 2 * Math.PI * (i + 1) / bumps; d += ''; void t2; }
  }
  return d + 'Z';
}
// points evenly placed along the border ring, avoiding the arena (+pad) and an optional set of keep-out rects
function inArena(x, y, pad = 0) { return x > AR.x - pad && x < AR.x + AR.w + pad && y > AR.y - pad && y < AR.y + AR.h + pad; }
function nearGate(x, y, pad = 0) { return x > 840 - pad && y > GATE.top - pad && y < GATE.bottom + pad; }
const shadow = (x, y, rx, ry, op = 0.18) => ell(x, y, rx, ry, '#3a2440', ` opacity="${op}"`);

// ---------- props (one-step cel shading: dark offset, base, highlight; ~3 px outline in dark tone) ----------
// gumdrop: sugared dome, seen 3/4 from above
function gumdrop(x, y, s, col, seed = 1) {
  const r = rng(seed); const w = 15 * s, h = 17 * s; const dark = mix(col, '#3a1840', 0.38), lite = mix(col, '#ffffff', 0.5);
  const d = `M${f(x - w)} ${f(y)}C${f(x - w)} ${f(y - h * 1.25)} ${f(x + w)} ${f(y - h * 1.25)} ${f(x + w)} ${f(y)}Q${f(x)} ${f(y + 5 * s)} ${f(x - w)} ${f(y)}Z`;
  let o = shadow(x + 2 * s, y + 2 * s, w * 1.1, 4.5 * s);
  o += `<path d="${d}" fill="${col}" stroke="${dark}" stroke-width="${f(2.4 * s)}" stroke-linejoin="round"/>`;
  o += `<path d="M${f(x + w * 0.2)} ${f(y + 2 * s)}Q${f(x + w * 0.9)} ${f(y)} ${f(x + w * 0.85)} ${f(y - h * 0.5)}" fill="none" stroke="${dark}" stroke-width="${f(3 * s)}" opacity="0.3" stroke-linecap="round"/>`;
  o += ell(x - w * 0.35, y - h * 0.6, w * 0.32, h * 0.2, lite, ` transform="rotate(-25 ${f(x - w * 0.35)} ${f(y - h * 0.6)})"`);
  for (let i = 0; i < 6; i++) o += circ(x + (r() - 0.5) * w * 1.3, y - h * (0.15 + r() * 0.6), 0.9 * s, '#ffffff', ' opacity="0.85"');
  return o;
}
// gumdrop bush: rounded mint shrub studded with mini gumdrops
function gumBush(x, y, s, c, seed, cols) {
  const r = rng(seed); const rx = 26 * s, ry = 18 * s;
  const d = blob(x, y - ry * 0.8, rx, ry, seed, 12, 0.1);
  let o = shadow(x + 3 * s, y + 1 * s, rx * 1.05, 6 * s, 0.2);
  o += `<path d="${d}" fill="${c.base}" stroke="${c.dark}" stroke-width="${f(2.6 * s)}"/>`;
  o += `<path d="${blob(x - rx * 0.22, y - ry * 1.05, rx * 0.55, ry * 0.45, seed + 3, 10, 0.08)}" fill="${c.light}" opacity="0.8"/>`;
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, rr = 0.55 * r(); const gx = x + Math.cos(a) * rx * rr, gy = y - ry * 0.8 + Math.sin(a) * ry * rr;
    const col = cols[Math.floor(r() * cols.length)];
    o += ell(gx, gy + 1.2 * s, 4.2 * s, 2 * s, c.dark, ' opacity="0.5"') + `<path d="M${f(gx - 4 * s)} ${f(gy)}Q${f(gx)} ${f(gy - 8 * s)} ${f(gx + 4 * s)} ${f(gy)}Z" fill="${col}"/>` + circ(gx - 1.3 * s, gy - 2.6 * s, 1 * s, '#ffffff', ' opacity="0.8"');
  }
  return o;
}
// lollipop tree: swirl head on a striped stick
function lollipop(x, y, s, col, seed = 1, stick = '#fff6ea') {
  const R = 15 * s, hy = y - 30 * s; const dark = mix(col, '#3a1840', 0.4), lite = mix(col, '#ffffff', 0.62);
  let o = shadow(x + 6 * s, y + 1 * s, R * 0.95, 4.5 * s, 0.2);
  o += `<rect x="${f(x - 2.4 * s)}" y="${f(hy)}" width="${f(4.8 * s)}" height="${f(30 * s)}" rx="${f(2.4 * s)}" fill="${stick}" stroke="#c9b4a6" stroke-width="${f(1.4 * s)}"/>`;
  o += circ(x, hy, R, col, ` stroke="${dark}" stroke-width="${f(2.6 * s)}"`);
  // swirl
  let sw = ''; const turns = 2.2, N = 22; const rot = seed * 1.7;
  for (let i = 0; i <= N; i++) { const t = i / N; const a = rot + t * turns * 2 * Math.PI; const rr = R * 0.92 * t; sw += (i ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(hy + Math.sin(a) * rr); }
  o += strokeP(sw, lite, 3.4 * s);
  o += strokeP(`M${f(x - R * 0.62)} ${f(hy - R * 0.35)}Q${f(x - R * 0.35)} ${f(hy - R * 0.75)} ${f(x + R * 0.05)} ${f(hy - R * 0.72)}`, '#ffffff', 2.4 * s, ' opacity="0.85"');
  return o;
}
// licorice fence segment (black licorice, rounded posts)
function fence(x0, x1, y, c, caps) {
  let o = ''; let rails = '';
  for (const ry of [y - 14, y - 6]) rails += `M${x0} ${ry}H${x1}`;
  o += `<path d="${rails}" stroke="${c.dark}" stroke-width="5.4" stroke-linecap="round"/><path d="${rails}" stroke="${c.base}" stroke-width="3.2" stroke-linecap="round"/>`;
  let k = 0;
  for (let x = x0 + 10; x <= x1 - 6; x += 60, k++) {
    o += ell(x + 2, y + 1, 6, 2, '#2a1830', ' opacity="0.2"');
    o += `<rect x="${x - 4}" y="${y - 22}" width="8" height="23" rx="4" fill="${c.base}" stroke="${c.dark}" stroke-width="1.6"/><path d="M${x - 1} ${y - 18}v13" stroke="${c.light}" stroke-width="1.6" stroke-linecap="round"/>`;
    o += circ(x, y - 23, 5, caps[k % caps.length], ` stroke="${c.dark}" stroke-width="1.4"`) + circ(x - 1.6, y - 24.6, 1.5, '#ffffff', ' opacity="0.85"');
  }
  return o;
}
// marshmallow stone (cylinder seen from above)
function marshmallow(x, y, s, col = '#fff8f2', seed = 1) {
  const r = rng(seed); const rx = 10 * s * (0.9 + r() * 0.2), ry = 6 * s, h = 9 * s; const dark = mix(col, '#7a4a5a', 0.3);
  let o = shadow(x + 2 * s, y + 2 * s, rx * 1.05, ry * 0.8, 0.22);
  o += `<path d="M${f(x - rx)} ${f(y - h)}V${f(y)}A${f(rx)} ${f(ry)} 0 0 0 ${f(x + rx)} ${f(y)}V${f(y - h)}Z" fill="${mix(col, dark, 0.35)}" stroke="${dark}" stroke-width="${f(1.8 * s)}"/>`;
  o += ell(x, y - h, rx, ry, col, ` stroke="${dark}" stroke-width="${f(1.8 * s)}"`);
  o += ell(x - rx * 0.3, y - h - ry * 0.2, rx * 0.35, ry * 0.32, '#ffffff', ' opacity="0.9"');
  return o;
}
// wafer plank texture inside a rect
function wafer(x, y, w, h, c, rnd = 5, grid = 9) {
  let o = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rnd}" fill="${c.base}" stroke="${c.dark}" stroke-width="2.6"/>`;
  let g = '';
  for (let gx = x + grid; gx < x + w - 2; gx += grid) g += `M${f(gx)} ${f(y + 3)}V${f(y + h - 3)}`;
  for (let gy = y + grid; gy < y + h - 2; gy += grid) g += `M${f(x + 3)} ${f(gy)}H${f(x + w - 3)}`;
  o += `<path d="${g}" stroke="${c.mid}" stroke-width="1.6" fill="none"/>`;
  o += `<rect x="${f(x + 3)}" y="${f(y + 3)}" width="${f(w - 6)}" height="3" rx="1.5" fill="${c.light}" opacity="0.8"/>`;
  return o;
}
// fluffy cloud lump (border filler)
function cloudLump(x, y, s, col, seed) {
  const r = rng(seed); const dark = mix(col, '#6a4a8a', 0.28), lite = mix(col, '#ffffff', 0.6);
  const balls = [[-16, 0, 11], [-4, -6, 14], [11, -3, 12], [20, 2, 8]].map(([dx, dy, rr]) => [x + dx * s, y + dy * s, rr * s * (0.9 + r() * 0.2)]);
  let o = shadow(x + 3 * s, y + 8 * s, 30 * s, 5 * s, 0.14);
  o += balls.map(([bx, by, rr]) => circ(bx, by, rr + 2.2 * s, dark)).join('');
  o += balls.map(([bx, by, rr]) => circ(bx, by, rr, col)).join('');
  o += balls.slice(0, 3).map(([bx, by, rr]) => circ(bx - rr * 0.25, by - rr * 0.3, rr * 0.5, lite, ' opacity="0.9"')).join('');
  return o;
}
// ice-cream scoop hill (with drippy rim)
function scoop(x, y, s, col, seed, sprCols) {
  const r = rng(seed); const w = 30 * s, h = 26 * s; const dark = mix(col, '#5a2a40', 0.35), lite = mix(col, '#ffffff', 0.55);
  let rim = `M${f(x - w)} ${f(y - 4 * s)}`; const n = 7;
  for (let i = 0; i < n; i++) { const xa = x - w + (i + 0.5) * 2 * w / n, xb = x - w + (i + 1) * 2 * w / n; const dy = (i % 2 ? 4 : 9) * s * (0.7 + r() * 0.5); rim += `Q${f(xa)} ${f(y + dy)} ${f(xb)} ${f(y - 4 * s)}`; }
  const d = `M${f(x + w)} ${f(y - 4 * s)}C${f(x + w * 1.05)} ${f(y - h * 1.35)} ${f(x - w * 1.05)} ${f(y - h * 1.35)} ${f(x - w)} ${f(y - 4 * s)}` + rim.replace(/^M[^Q]+/, '') + 'Z';
  let o = shadow(x + 4 * s, y + 4 * s, w * 1.1, 6 * s, 0.18);
  o += `<path d="${d}" fill="${col}" stroke="${dark}" stroke-width="${f(2.6 * s)}" stroke-linejoin="round"/>`;
  o += ell(x - w * 0.35, y - h * 0.62, w * 0.3, h * 0.18, lite, ` opacity="0.9" transform="rotate(-20 ${f(x - w * 0.35)} ${f(y - h * 0.62)})"`);
  if (sprCols) { const L = []; for (let i = 0; i < 6; i++) L.push([x + (r() - 0.5) * w * 1.2, y - h * (0.25 + r() * 0.5), s, sprCols[i % sprCols.length], r() * 180]); o += sprinkles(L); }
  return o;
}
// grass / sugar tuft for textures
const tuftD = (x, y, s) => `M${f(x - 3 * s)} ${f(y - 4 * s)}L${f(x - 1 * s)} ${f(y)}L${f(x)} ${f(y - 6 * s)}M${f(x + 1 * s)} ${f(y)}l${f(2.5 * s)} ${f(-4.5 * s)}`;
const sprinkle = (x, y, s, col, a, extra = '') => sprinkles([[x, y, s, col, a]], extra);
// many sprinkles -> one round-capped stroked path per colour/size (keeps files small)
function sprinkles(list, extra = '') {
  const g = {};
  for (const [x, y, s, col, a] of list) { const k = col + '|' + f(2 * s); const dx = Math.cos(a * Math.PI / 180) * 2 * s, dy = Math.sin(a * Math.PI / 180) * 2 * s; g[k] = (g[k] || '') + `M${f(x - dx)} ${f(y - dy)}l${f(2 * dx)} ${f(2 * dy)}`; }
  return Object.entries(g).map(([k, d]) => { const [col, w] = k.split('|'); return `<path d="${d}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${extra}/>`; }).join('');
}

// ---------- arena base (shared) ----------
// Whole screen = border colour; HUD band softened; arena = calm rounded clearing with a rim and a 3/4 "back wall" shade at the top.
function base(c, id) {
  const defs = `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.hudTop}"/><stop offset="1" stop-color="${c.border}"/></linearGradient>` +
    `<radialGradient id="${id}a" cx="0.5" cy="0.52" r="0.62"><stop offset="0" stop-color="${c.arenaHi}"/><stop offset="1" stop-color="${c.arena}"/></radialGradient>` +
    `<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.rim}" stop-opacity="0.35"/><stop offset="1" stop-color="${c.rim}" stop-opacity="0"/></linearGradient>`;
  let o = `<rect width="${W}" height="${H}" fill="${c.border}"/>`;
  o += `<rect width="${W}" height="78" fill="url(#${id}h)"/>`;
  const ad = rrect(AR.x, AR.y, AR.w, AR.h, AR.r);
  o += `<path d="${rrect(AR.x - 5, AR.y - 4, AR.w + 10, AR.h + 10, AR.r + 4)}" fill="${c.rim}" opacity="0.55"/>`;
  o += `<path d="${ad}" fill="url(#${id}a)"/>`;
  o += `<path d="${rrect(AR.x, AR.y, AR.w, 22, AR.r)}" fill="url(#${id}t)"/>`;
  return { defs, body: o };
}
// low-contrast arena texture: soft patches + small marks (kept inside arena with margin)
function texture(seed, n, fn, margin = 14) {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) {
    const x = AR.x + margin + r() * (AR.w - 2 * margin), y = AR.y + margin + 6 + r() * (AR.h - 2 * margin - 6);
    o += fn(x, y, r);
  }
  return o;
}
// slots along the border ring (centre line of each side) for props
function ringSlots(seed, opt) {
  const r = rng(seed); const out = [];
  const add = (x, y, side) => { if (!nearGate(x, y, opt.gatePad ?? 12)) out.push({ x, y, side, k: r() }); };
  for (let x = opt.bottomStart ?? 30; x < W; x += opt.bottomStep) add(x + (r() - 0.5) * opt.bottomStep * 0.4, opt.bottomY + (r() - 0.5) * 3, 'b');
  for (let y = opt.sideStart; y < opt.sideEnd; y += opt.sideStep) { add(opt.sideX + (r() - 0.5) * 4, y + (r() - 0.5) * 8, 'l'); add(W - opt.sideX + (r() - 0.5) * 4, y + (r() - 0.5) * 8, 'r'); }
  return out;
}

// =====================================================================================
// BIOMES
// =====================================================================================
const PAL = {
  meadow: { border: '#93d9ab', hudTop: '#b9ead0', rim: '#5fae80', arena: '#cdeed8', arenaHi: '#ddf5e4', texL: '#eafaef', texD: '#b2dfc0',
    bush: { base: '#6cc58f', dark: '#3f9566', light: '#94dbae' }, licorice: { base: '#4b2d45', dark: '#2a1428', light: '#9a7091' },
    candy: ['#ff8fc4', '#b993f2', '#7fc8f7', '#ffd66b'], lolli: ['#ff8fc4', '#8fc9ff', '#c7a2ff', '#ffb3d6'] },
  river: { border: '#b57d55', hudTop: '#d2a27b', rim: '#7d5034', arena: '#ecd6bb', arenaHi: '#f4e4cd', texL: '#f8ecdb', texD: '#d9bc98',
    choc: { base: '#8b4e2f', deep: '#6e3a22', mid: '#a6633e', hi: '#c98c62', rim: '#5a2e1a' }, wafer: { base: '#efc27a', dark: '#b07c3a', mid: '#d19a52', light: '#fff0c8' },
    mallow: ['#fff8f2', '#ffd9e6', '#fff8f2', '#e9f3ff'] },
  clouds: { border: '#e7c4ee', hudTop: '#d8e6fb', rim: '#c39ad6', arena: '#f6e8f7', arenaHi: '#fcf4fc', texL: '#ffffff', texD: '#e9d2ee',
    lumps: ['#ffd2ea', '#d6e6ff', '#ead8ff', '#fff3fb'], rainbow: ['#ff9ec7', '#ffc48a', '#ffe68a', '#a8e6b8', '#9fd2ff', '#c2a8ff'],
    puff: [{ base: '#ffc6e3', light: '#ffe6f3', dark: '#e58ab9' }, { base: '#bfdcff', light: '#e4f0ff', dark: '#7fa9e0' }, { base: '#dcc8ff', light: '#f0e8ff', dark: '#a68ad9' }] },
  glacier: { border: '#f1dfbf', hudTop: '#e2f0f8', rim: '#c8ab86', arena: '#fdf4e3', arenaHi: '#fffaf0', texL: '#ffffff', texD: '#efdfc2',
    scoops: ['#f9b3c8', '#b5ead2', '#fff3dc', '#a5785e', '#f9b3c8', '#b5ead2'], wafer: { base: '#e9b872', dark: '#a8763a', mid: '#cc9450', light: '#fff0c8' },
    ice: { base: '#d3effc', deep: '#b3e0f6', rim: '#86c3e3', hi: '#ffffff' }, spr: ['#ff8fc0', '#7fc6f5', '#ffd66b', '#b993f2', '#8fdcb0'] },
};

// ---------- Meadow ----------
function meadow() {
  const c = PAL.meadow; const { defs, body } = base(c, 'm'); let o = body; const r = rng(11);
  // arena texture: soft lighter grass patches, tiny tufts, few sugar sparkles
  o += texture(3, 9, (x, y, r) => `<path d="${blob(x, y, 50 + r() * 50, 18 + r() * 14, Math.floor(r() * 999), 12, 0.15)}" fill="${c.texL}" opacity="0.45"/>`, 70);
  { const d = ['', '']; texture(4, 120, (x, y, r) => { d[r() < 0.5 ? 0 : 1] += tuftD(x, y, 1.1); return ''; }); o += strokeP(d[0], c.texD, 1.5, ' opacity="0.6"') + strokeP(d[1], '#a5d9b5', 1.5, ' opacity="0.6"'); }
  o += texture(5, 26, (x, y) => circ(x, y, 1.3, '#ffffff', ' opacity="0.7"'));
  // HUD band back row: soft scalloped hedge silhouette (simple, low contrast)
  let hedge = `M0 70`; for (let x = 0; x <= W; x += 24) hedge += `Q${x + 12} ${54 + (x / 24 % 2) * 4} ${x + 24} 70`;
  o += `<path d="${hedge}V84H0Z" fill="${c.bush.base}" opacity="0.55"/>`;
  // back row of lollipop trees in the HUD gaps (between hearts / score / jar)
  for (const [x, k] of [[232, 0], [300, 1], [368, 2], [604, 3], [672, 0], [740, 2]]) o += lollipop(x, 74, 0.82, c.lolli[k], x);
  // licorice fence along the top edge of the arena (back wall)
  o += fence(28, 932, 84, c.licorice, c.candy);
  // side + bottom border props
  const slots = ringSlots(21, { bottomStart: 60, bottomY: 536, bottomStep: 46, sideX: 17, sideStart: 112, sideEnd: 500, sideStep: 46 });
  let props = slots.map((p, i) => {
    if (p.side === 'b') return i % 3 === 0 ? gumdrop(p.x, p.y, 0.95, c.candy[i % 4], i) : gumBush(p.x, p.y + 8, 0.95, c.bush, i, c.candy);
    return i % 3 === 1 ? lollipop(p.x, p.y + 16, 1.05, c.lolli[i % 4], i) : (i % 3 === 2 ? gumdrop(p.x, p.y + 6, 0.95, c.candy[i % 4], i) : gumBush(p.x, p.y + 12, 0.8, c.bush, i, c.candy));
  });
  // sort by y for 3/4 depth
  o += slots.map((p, i) => [p.y, props[i]]).sort((a, b) => a[0] - b[0]).map(a => a[1]).join('');
  // corner gumdrop clusters at the bottom corners
  o += gumdrop(14, 512, 0.9, c.candy[0], 3) + gumdrop(946, 512, 0.9, c.candy[2], 4);
  void r;
  return svg(o, defs);
}
function meadowEdge() {
  const c = PAL.meadow; let o = '';
  // foreground bush tops peeking up from the bottom (top >= 524) and tall sugar grass on the sides (x <= 30)
  for (let x = 20, i = 0; x < W; x += 74, i++) {
    const bx = x + (i % 2) * 12; const d = `M${f(bx - 30)} 541C${f(bx - 28)} 524 ${f(bx + 28)} 524 ${f(bx + 30)} 541Z`;
    o += `<path d="${d}" fill="${c.bush.base}" stroke="${c.bush.dark}" stroke-width="2.4"/>` + ell(bx - 8, 531, 9, 3, c.bush.light, ' opacity="0.9"');
    if (i % 3 === 1) o += `<path d="M${bx + 6} 533Q${bx + 10} 526 ${bx + 14} 533Z" fill="${c.candy[i % 4]}"/>`;
  }
  const blades = (x, y, dir) => { let s = ''; for (let k = 0; k < 4; k++) { const bx = x + dir * k * 4; s += `<path d="M${f(bx - 2)} ${y}Q${f(bx + dir * 4)} ${f(y - 14 - k * 3)} ${f(bx + dir * 8)} ${f(y - 24 - k * 2)}Q${f(bx + dir * 3)} ${f(y - 12)} ${f(bx + 2)} ${y}Z" fill="${k % 2 ? c.bush.base : c.bush.dark}"/>`; } return s; };
  for (const y of [190, 330, 470]) o += blades(4, y, 1);
  for (const y of [150, 470]) o += blades(956, y, -1);
  return svg(o);
}

// ---------- Chocolate River ----------
function river() {
  const c = PAL.river; const { defs, body } = base(c, 'r'); let o = body;
  o += texture(13, 8, (x, y, r) => `<path d="${blob(x, y, 40 + r() * 50, 16 + r() * 12, Math.floor(r() * 999), 12, 0.15)}" fill="${c.texL}" opacity="0.55"/>`, 70);
  // cocoa crumbs and soft swirl marks
  o += texture(14, 110, (x, y, r) => circ(x, y, 1 + r() * 1.4, c.texD, ' opacity="0.7"'));
  o += texture(15, 18, (x, y, r) => strokeP(`M${f(x - 10)} ${f(y)}q5 -5 10 0t10 0`, c.texD, 1.5, ' opacity="0.6"'));
  // HUD band: distant cocoa bank with chocolate-chunk rocks
  let bank = 'M0 72'; for (let x = 0; x <= W; x += 30) bank += `Q${x + 15} ${62 + (x / 30 % 2) * 5} ${x + 30} 72`;
  o += `<path d="${bank}V84H0Z" fill="${mix(c.border, '#5a2e1a', 0.25)}" opacity="0.6"/>`;
  for (const x of [230, 300, 370, 600, 670, 740]) {
    const r = rng(x); const s = 0.9 + r() * 0.3;
    o += shadow(x + 3, 80, 16 * s, 4) + `<path d="M${f(x - 14 * s)} 80L${f(x - 11 * s)} ${f(80 - 14 * s)}L${f(x + 8 * s)} ${f(80 - 17 * s)}L${f(x + 14 * s)} 80Z" fill="${c.choc.base}" stroke="${c.choc.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M${f(x - 9 * s)} ${f(80 - 12 * s)}L${f(x + 6 * s)} ${f(80 - 15 * s)}" stroke="${c.choc.hi}" stroke-width="2" stroke-linecap="round"/>`;
  }
  // marshmallow stones along the top edge and border ring
  for (let x = 46; x < 930; x += 58) o += marshmallow(x + (x % 3) * 3, 84, 0.72, c.mallow[(x / 58 | 0) % 4], x);
  const slots = ringSlots(31, { bottomStart: 40, bottomY: 536, bottomStep: 40, sideX: 19, sideStart: 112, sideEnd: 510, sideStep: 34, gatePad: 4 });
  o += slots.filter(p => p.side === 'b' || p.y < 262 || p.y > 362).sort((a, b) => a.y - b.y).map((p, i) => {
    if (i % 3 === 2) return chocChunk(p.x, p.y, 1.05, c.choc);
    return marshmallow(p.x, p.y, 1.1, c.mallow[i % 4], i + 7);
  }).join('');
  return svg(o, defs);
}
function chocChunk(x, y, s, c) {
  return shadow(x + 2, y + 2, 13 * s, 4 * s) + `<path d="M${f(x - 12 * s)} ${f(y)}L${f(x - 9 * s)} ${f(y - 12 * s)}L${f(x + 9 * s)} ${f(y - 14 * s)}L${f(x + 12 * s)} ${f(y)}Z" fill="${c.base}" stroke="${c.rim}" stroke-width="${f(2 * s)}" stroke-linejoin="round"/>` +
    `<path d="M${f(x - 7 * s)} ${f(y - 10 * s)}L${f(x + 6 * s)} ${f(y - 12 * s)}" stroke="${c.hi}" stroke-width="${f(2 * s)}" stroke-linecap="round"/>`;
}
function riverZone() {
  const c = PAL.river; const ch = c.choc; const r = rng(41); const Y0 = 270, Y1 = 350;
  // wavy bank lines (subtle, stays within ±3 px of the band)
  const edge = (y, ph) => { let d = ''; for (let x = -10; x <= W + 10; x += 20) d += (x < 0 ? 'M' : 'L') + `${x} ${f(y + Math.sin(x / 37 + ph) * 2.5)}`; return d; };
  const top = edge(Y0, 0), bot = edge(Y1, 2);
  const xs = []; for (let x = -10; x <= W + 10; x += 20) xs.push(x);
  const bandD = 'M' + xs.map(x => `${x} ${f(Y0 + Math.sin(x / 37) * 2.5)}`).join('L') + 'L' + xs.slice().reverse().map(x => `${x} ${f(Y1 + Math.sin(x / 37 + 2) * 2.5)}`).join('L') + 'Z';
  const defs = `<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ch.deep}"/><stop offset="0.25" stop-color="${ch.base}"/><stop offset="0.7" stop-color="${ch.mid}"/><stop offset="1" stop-color="${ch.base}"/></linearGradient>`;
  let o = `<path d="${bandD}" fill="url(#cg)"/>`;
  // glossy flow: long soft milk-chocolate arcs, a few cream glints and slow eddy swirls
  for (let i = 0; i < 12; i++) {
    const x = (i + r() * 0.6) * W / 12, y = Y0 + 16 + r() * (Y1 - Y0 - 32), L = 60 + r() * 60;
    o += strokeP(`M${f(x)} ${f(y)}c${f(L * 0.3)} -6 ${f(L * 0.7)} 6 ${f(L)} 0`, ch.hi, 5, ' opacity="0.5"');
  }
  for (let i = 0; i < 8; i++) { const x = 40 + r() * 880, y = Y0 + 14 + r() * 14; o += strokeP(`M${f(x)} ${f(y)}q${f(9)} -3 ${f(18 + r() * 10)} 0`, '#fff2e2', 2.4, ' opacity="0.5"'); }
  for (const x of [150, 480, 560, 800]) { const y = Y0 + 40 + (x % 3) * 6; o += `<ellipse cx="${x}" cy="${y}" rx="16" ry="6" fill="none" stroke="${ch.hi}" stroke-width="2" opacity="0.45"/><ellipse cx="${x + 2}" cy="${y}" rx="8" ry="3" fill="none" stroke="${ch.hi}" stroke-width="1.6" opacity="0.35"/>`; }
  // melted rims: lighter lip on the far bank, darker shade under the near bank
  o += strokeP(top, ch.rim, 4) + strokeP(edge(Y0 + 4, 0), mix(ch.hi, '#ffffff', 0.2), 2, ' opacity="0.6"');
  o += strokeP(bot, ch.rim, 4) + strokeP(edge(Y1 - 5, 2), ch.deep, 3, ' opacity="0.6"');
  // wafer bridges at the gaps x 300–360 and 640–700 (span the band + a little bank overlap)
  for (const bx of [300, 640]) {
    o += `<rect x="${bx - 2}" y="${Y0 - 6}" width="64" height="${Y1 - Y0 + 16}" rx="7" fill="${ch.rim}" opacity="0.35" transform="translate(3 4)"/>`;
    o += wafer(bx, Y0 - 10, 60, Y1 - Y0 + 20, c.wafer, 6, 10);
    // candy rails
    for (const x of [bx + 3, bx + 57]) o += `<rect x="${x - 2.5}" y="${Y0 - 12}" width="5" height="${Y1 - Y0 + 24}" rx="2.5" fill="#fff6ee" stroke="#d86a8e" stroke-width="1.4"/>` + `<path d="M${x - 2} ${Y0 - 4}${Array.from({ length: 9 }, (_, k) => `M${x - 2} ${Y0 - 4 + k * 11}l4 -5`).join('')}" stroke="#f0789e" stroke-width="2"/>`;
  }
  // wafer landing under the gate (gate sits at (900,300) on the right edge, over the river)
  o += `<rect x="852" y="${Y0 - 8}" width="112" height="${Y1 - Y0 + 18}" rx="8" fill="${ch.rim}" opacity="0.35" transform="translate(3 4)"/>`;
  o += wafer(852, Y0 - 12, 112, Y1 - Y0 + 22, c.wafer, 8, 11);
  return svg(o, defs);
}
function riverEdge() {
  const c = PAL.river; let o = '';
  // foreground: chocolate-dipped marshmallow tops + cocoa reeds along the bottom; reeds on the sides
  for (let x = 30, i = 0; x < W; x += 92, i++) {
    const bx = x + (i % 2) * 20;
    o += `<path d="M${bx - 24} 541C${bx - 22} 527 ${bx + 22} 527 ${bx + 24} 541Z" fill="${mix(c.border, '#5a2e1a', 0.15)}" stroke="${c.choc.rim}" stroke-width="2.2"/>`;
    o += ell(bx - 6, 533, 7, 2.4, mix(c.border, '#ffffff', 0.35), ' opacity="0.8"');
  }
  const reed = (x, y, dir) => { let s = ''; for (let k = 0; k < 3; k++) { const bx = x + dir * k * 6, h = 30 + k * 6; s += strokeP(`M${bx} ${y}Q${bx + dir * 4} ${y - h / 2} ${bx + dir * 2} ${y - h}`, c.choc.base, 2.4) + `<rect x="${f(bx + dir * 2 - 3)}" y="${f(y - h - 4)}" width="6" height="13" rx="3" fill="${c.choc.deep}"/>`; } return s; };
  for (const y of [200, 470]) o += reed(6, y, 1);
  for (const y of [180, 470]) o += reed(954, y, -1);
  return svg(o);
}

// ---------- Cotton Candy Clouds ----------
function clouds() {
  const c = PAL.clouds; const { defs, body } = base(c, 'c'); let o = body;
  // arena: soft swirl patches pink/blue and tiny star twinkles
  o += texture(23, 10, (x, y, r) => `<path d="${blob(x, y, 50 + r() * 50, 20 + r() * 14, Math.floor(r() * 999), 12, 0.18)}" fill="${r() < 0.5 ? '#e8eefc' : c.texL}" opacity="0.55"/>`, 70);
  o += texture(24, 34, (x, y, r) => strokeP(`M${f(x)} ${f(y)}a6 6 0 1 1 ${f(8 + r() * 4)} 2`, c.texD, 1.6, ' opacity="0.8"'));
  o += texture(25, 24, (x, y) => `<path d="M${f(x)} ${f(y - 3)}L${f(x + 0.8)} ${f(y - 0.8)}L${f(x + 3)} ${f(y)}L${f(x + 0.8)} ${f(y + 0.8)}L${f(x)} ${f(y + 3)}L${f(x - 0.8)} ${f(y + 0.8)}L${f(x - 3)} ${f(y)}L${f(x - 0.8)} ${f(y - 0.8)}Z" fill="#ffffff" opacity="0.9"/>`);
  // rainbow arc in the bottom-left corner (ground layer)
  c.rainbow.forEach((col, i) => { const R = 96 - i * 8; o += `<path d="M${f(-8 + R)} 548A${R} ${R} 0 0 0 -8 ${f(548 - R)}" fill="none" stroke="${col}" stroke-width="8.4"/>`; });
  o += cloudLump(12, 534, 0.9, c.lumps[3], 2) + cloudLump(70, 536, 0.75, c.lumps[0], 3);
  // HUD band: puffy cloud bank (low contrast)
  let bank = 'M0 76'; for (let x = 0; x <= W; x += 36) bank += `Q${x + 18} ${56 + (x / 36 % 2) * 6} ${x + 36} 76`;
  o += `<path d="${bank}V84H0Z" fill="#ffffff" opacity="0.5"/>`;
  for (const [x, k] of [[236, 0], [312, 1], [380, 2], [606, 2], [676, 0], [748, 1]]) o += cloudLump(x, 70, 0.7, c.lumps[k], x);
  // border ring cloud lumps
  const slots = ringSlots(33, { bottomStart: 140, bottomY: 538, bottomStep: 48, sideX: 14, sideStart: 112, sideEnd: 480, sideStep: 42 });
  o += slots.sort((a, b) => a.y - b.y).map((p, i) => cloudLump(p.x, p.y, p.side === 'b' ? 1.0 : 0.85, c.lumps[i % 4], i + 50)).join('');
  // tiny gold stars sprinkled on the border
  const r = rng(77); for (let i = 0; i < 14; i++) { const x = r() * W, y = 66 + r() * 14; if (x > 60 && x < 900) o += starShape(x, y, 3.2, '#ffe07a', '#e8a93a'); }
  return svg(o, defs);
}
function starShape(x, y, R, fill, stroke) {
  let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.48 : R; d += (i ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(y + Math.sin(a) * rr); }
  return `<path d="${d}Z" fill="${fill}" stroke="${stroke}" stroke-width="${f(R * 0.25)}" stroke-linejoin="round"/>`;
}
function cloudsZone() {
  const c = PAL.clouds; let o = '';
  const puffs = [[300, 200, 70], [640, 380, 80], [760, 170, 60]];
  puffs.forEach(([x, y, R], i) => {
    const p = c.puff[i];
    o += ell(x + 4, y + 8, R * 0.98, R * 0.9, '#8a5a9a', ' opacity="0.14"');
    const N = 16, br = R * 0.2, rr = R - br * 0.85; const ring = Array.from({ length: N }, (_, k) => [x + Math.cos(2 * Math.PI * k / N) * rr, y + Math.sin(2 * Math.PI * k / N) * rr]);
    o += ring.map(([bx, by]) => circ(bx, by, br + 1.5, p.dark)).join('') + circ(x, y, rr + 1.5, p.dark);
    o += ring.map(([bx, by]) => circ(bx, by, br - 1.5, p.base)).join('') + circ(x, y, rr, p.base);
    // springy inner rings (trampoline read) + fluffy highlight
    o += circ(x, y, R * 0.68, 'none', ` stroke="${p.light}" stroke-width="5" opacity="0.9"`);
    o += circ(x, y, R * 0.36, 'none', ` stroke="${p.light}" stroke-width="4" opacity="0.8"`);
    o += `<path d="${scallop(x - R * 0.32, y - R * 0.4, R * 0.3, 7, 0.12, i + 9)}" fill="#ffffff" opacity="0.65"/>`;
    o += strokeP(`M${f(x + R * 0.35)} ${f(y + R * 0.62)}Q${f(x + R * 0.66)} ${f(y + R * 0.42)} ${f(x + R * 0.72)} ${f(y + R * 0.12)}`, p.dark, 3, ' opacity="0.35"');
  });
  return svg(o);
}
function cloudsEdge() {
  const c = PAL.clouds; let o = '';
  for (let x = 150, i = 0; x < W; x += 86, i++) {
    const bx = x + (i % 2) * 14, col = c.lumps[i % 4], dark = mix(col, '#6a4a8a', 0.28);
    o += circ(bx - 14, 545, 17, dark) + circ(bx + 10, 546, 19, dark) + circ(bx - 14, 545, 15, col) + circ(bx + 10, 546, 17, col) + circ(bx - 17, 536, 5, '#ffffff', ' opacity="0.8"');
  }
  for (const [x, y] of [[-6, 200], [-4, 420], [966, 160], [966, 440]]) {
    const col = c.lumps[(y / 10) % 4 | 0], dark = mix(col, '#6a4a8a', 0.28);
    o += circ(x, y, 22, dark) + circ(x, y + 22, 18, dark) + circ(x, y, 20, col) + circ(x, y + 22, 16, col) + circ(x + (x < 0 ? 6 : -6), y - 6, 5, '#ffffff', ' opacity="0.8"');
  }
  return svg(o);
}

// ---------- Ice-Cream Glacier ----------
function glacier() {
  const c = PAL.glacier; const { defs, body } = base(c, 'g'); let o = body;
  // arena: gentle scoop ripples + pale sprinkle specks (very low contrast)
  o += texture(43, 9, (x, y, r) => `<path d="${blob(x, y, 50 + r() * 50, 18 + r() * 12, Math.floor(r() * 999), 12, 0.15)}" fill="${c.texL}" opacity="0.7"/>`, 70);
  o += texture(44, 22, (x, y, r) => strokeP(`M${f(x - 14)} ${f(y)}q7 -6 14 0t14 0`, c.texD, 2, ' opacity="0.8"'));
  { const L = []; texture(45, 70, (x, y, r) => { L.push([x, y, 0.8, c.spr[Math.floor(r() * 5)], r() * 180]); return ''; }); o += `<g opacity="0.28">${sprinkles(L)}</g>`; }
  // HUD band: icy sky blue with soft scoop-hill silhouettes in the gaps
  for (const [x, k] of [[250, 0], [330, 1], [620, 1], [720, 0]]) o += `<path d="M${x - 46} 84C${x - 44} 36 ${x + 44} 36 ${x + 46} 84Z" fill="${c.scoops[k]}" opacity="0.5"/>`;
  // wafer igloo (back row, left gap) — dome with waffle grid
  o += igloo(420, 82, 0.9, c.wafer);
  // scoop hills along the top edge (behind the arena rim) — small, sitting on y 84
  for (const [x, k] of [[60, 0], [170, 1], [520, 4], [800, 2], [900, 5]]) o += scoop(x, 86, 0.55, c.scoops[k], x, c.spr);
  // border ring: scoops on sides/bottom, scattered sprinkles
  const slots = ringSlots(51, { bottomStart: 40, bottomY: 540, bottomStep: 50, sideX: 14, sideStart: 124, sideEnd: 500, sideStep: 50 });
  o += slots.sort((a, b) => a.y - b.y).map((p, i) => scoop(p.x, p.y, p.side === 'b' ? 0.85 : 0.72, c.scoops[i % 6], i + 90, c.spr)).join('');
  const r = rng(91); const L = []; for (let i = 0; i < 40; i++) { const x = r() * W, y = 64 + r() * 476; if (!inArena(x, y, 4) && !nearGate(x, y, 6)) L.push([x, y, 1, c.spr[i % 5], r() * 180]); } o += sprinkles(L);
  return svg(o, defs);
}
function igloo(x, y, s, c) {
  const R = 34 * s; let o = shadow(x + 4, y + 1, R * 1.1, 6 * s, 0.2);
  const d = `M${f(x - R)} ${f(y)}A${f(R)} ${f(R * 0.95)} 0 0 1 ${f(x + R)} ${f(y)}Z`;
  o += `<path d="${d}" fill="${c.base}" stroke="${c.dark}" stroke-width="${f(2.6 * s)}"/>`;
  let g = '';
  for (let k = 1; k <= 3; k++) { const yy = y - R * 0.95 * k / 4, half = R * Math.sqrt(1 - Math.pow(k / 4, 2)); g += `M${f(x - half)} ${f(yy)}H${f(x + half)}`; }
  for (let k = -3; k <= 3; k++) g += `M${f(x + k * R / 4)} ${f(y)}Q${f(x + k * R / 3.2)} ${f(y - R * 0.6)} ${f(x + k * R / 8)} ${f(y - R * 0.93)}`;
  o += `<path d="${g}" stroke="${c.mid}" stroke-width="${f(1.6 * s)}" fill="none"/>`;
  o += `<path d="M${f(x + R * 0.12)} ${f(y)}V${f(y - R * 0.38)}A${f(R * 0.26)} ${f(R * 0.26)} 0 0 1 ${f(x + R * 0.64)} ${f(y - R * 0.38)}V${f(y)}Z" fill="#7a4a2e" stroke="${c.dark}" stroke-width="${f(2 * s)}"/>`;
  o += strokeP(`M${f(x - R * 0.7)} ${f(y - R * 0.45)}Q${f(x - R * 0.55)} ${f(y - R * 0.8)} ${f(x - R * 0.15)} ${f(y - R * 0.88)}`, c.light, 3 * s, ' opacity="0.85"');
  // pink icing drip on top
  o += `<path d="M${f(x - R * 0.5)} ${f(y - R * 0.8)}Q${f(x)} ${f(y - R * 1.15)} ${f(x + R * 0.5)} ${f(y - R * 0.8)}Q${f(x + R * 0.35)} ${f(y - R * 0.62)} ${f(x + R * 0.2)} ${f(y - R * 0.74)}Q${f(x)} ${f(y - R * 0.55)} ${f(x - R * 0.2)} ${f(y - R * 0.72)}Q${f(x - R * 0.38)} ${f(y - R * 0.6)} ${f(x - R * 0.5)} ${f(y - R * 0.8)}Z" fill="#f9b3c8" stroke="#d27896" stroke-width="${f(1.6 * s)}"/>`;
  return o;
}
function glacierZone() {
  const c = PAL.glacier.ice; let o = ''; const r = rng(61);
  const defs = `<linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient>`;
  for (const [x, y, w, h] of [[160, 140, 260, 140], [560, 320, 280, 150]]) {
    o += `<path d="${rrect(x, y, w, h, 26)}" fill="${c.rim}" opacity="0.4" transform="translate(3 4)"/>`;
    o += `<path d="${rrect(x, y, w, h, 26)}" fill="url(#ig)" stroke="${c.rim}" stroke-width="3"/>`;
    o += `<path d="${rrect(x + 5, y + 5, w - 10, h - 10, 21)}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.7"/>`;
    // diagonal gloss streaks
    for (let k = 0; k < 4; k++) { const sx = x + 30 + k * w / 4.2 + r() * 10, sy = y + 22; const L = h * (0.35 + r() * 0.3); o += strokeP(`M${f(sx)} ${f(sy + L)}L${f(sx + L * 0.55)} ${f(sy)}`, c.hi, k % 2 ? 3 : 6, ' opacity="0.55"'); }
    // faint skate scratches
    for (let k = 0; k < 3; k++) { const sx = x + 20 + r() * (w - 80), sy = y + 30 + r() * (h - 60); o += strokeP(`M${f(sx)} ${f(sy)}q20 -8 44 -2`, c.rim, 1.4, ' opacity="0.5"'); }
    o += starSpark(x + w - 26, y + 22, 7) + starSpark(x + 24, y + h - 22, 5);
  }
  return svg(o, defs);
}
const starSpark = (x, y, R) => `<path d="M${f(x)} ${f(y - R)}Q${f(x + R * 0.18)} ${f(y - R * 0.18)} ${f(x + R)} ${f(y)}Q${f(x + R * 0.18)} ${f(y + R * 0.18)} ${f(x)} ${f(y + R)}Q${f(x - R * 0.18)} ${f(y + R * 0.18)} ${f(x - R)} ${f(y)}Q${f(x - R * 0.18)} ${f(y - R * 0.18)} ${f(x)} ${f(y - R)}Z" fill="#ffffff"/>`;
function glacierEdge() {
  const c = PAL.glacier; let o = '';
  // foreground scoop drips along the bottom
  for (let x = 40, i = 0; x < W; x += 96, i++) {
    const bx = x + (i % 2) * 16, col = c.scoops[i % 3 === 2 ? 2 : i % 2], dark = mix(col, '#5a2a40', 0.35);
    o += `<path d="M${bx - 30} 541C${bx - 28} 526 ${bx + 28} 526 ${bx + 30} 541Z" fill="${col}" stroke="${dark}" stroke-width="2.4"/>` + ell(bx - 9, 532, 9, 2.6, '#ffffff', ' opacity="0.7"') + sprinkle(bx + 8, 534, 1, c.spr[i % 5], 30 + i * 40);
  }
  for (const [x, y, k] of [[-8, 220, 0], [-8, 440, 1], [968, 170, 1], [968, 450, 0]]) {
    const col = c.scoops[k], dark = mix(col, '#5a2a40', 0.35);
    o += circ(x, y, 26, col, ` stroke="${dark}" stroke-width="2.4"`) + ell(x + (x < 0 ? 8 : -8), y - 10, 6, 4, '#ffffff', ' opacity="0.7"');
  }
  return svg(o);
}

// =====================================================================================
// PARTICLES (32x32 centred)
// =====================================================================================
const P = {};
const ps = (body, defs = '') => svg(body, defs, 32, 32);
P.sparkle = ps(`<circle cx="16" cy="16" r="11" fill="url(#g)"/><path d="M16 2Q17.6 14.4 30 16Q17.6 17.6 16 30Q14.4 17.6 2 16Q14.4 14.4 16 2Z" fill="#fff6c8" stroke="#ffd25a" stroke-width="1"/><path d="M16 7Q16.8 15.2 25 16Q16.8 16.8 16 25Q15.2 16.8 7 16Q15.2 15.2 16 7Z" fill="#ffffff"/>`,
  `<radialGradient id="g"><stop offset="0" stop-color="#fff2b0" stop-opacity="0.8"/><stop offset="1" stop-color="#fff2b0" stop-opacity="0"/></radialGradient>`);
P.sugar = ps(`<g stroke="#8fb6d6" stroke-width="1.6" stroke-linejoin="round"><path d="M16 7L25 11.5L16 16L7 11.5Z" fill="#ffffff"/><path d="M7 11.5L16 16V26L7 21.5Z" fill="#e3effa"/><path d="M25 11.5L16 16V26L25 21.5Z" fill="#c9def0"/></g><path d="M10 12.5L15 10" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/><path d="M25 2.5L26 5.5L29 6.5L26 7.5L25 10.5L24 7.5L21 6.5L24 5.5Z" fill="#ffffff" stroke="#ffd25a" stroke-width="0.7"/>`);
P.floss = ps(`<g stroke="#e58ab9" stroke-width="1.6"><circle cx="11" cy="18" r="7"/><circle cx="17" cy="12" r="8"/><circle cx="22" cy="19" r="7"/><circle cx="16" cy="21" r="6"/></g><g fill="#ffc6e3"><circle cx="11" cy="18" r="7"/><circle cx="17" cy="12" r="8"/><circle cx="22" cy="19" r="7"/><circle cx="16" cy="21" r="6"/></g><circle cx="14" cy="10" r="3.4" fill="#ffffff" opacity="0.85"/><circle cx="9" cy="16" r="2.2" fill="#ffffff" opacity="0.7"/>`);
for (const [n, col] of [['pink', '#ff7fb6'], ['blue', '#5fb4f2'], ['yellow', '#ffd24a']]) {
  const dark = mix(col, '#2a1838', 0.35);
  P['sprinkle_' + n] = ps(`<g transform="rotate(-35 16 16)"><rect x="5" y="12" width="22" height="8" rx="4" fill="${col}" stroke="${dark}" stroke-width="1.6"/><rect x="8" y="13.6" width="12" height="2.2" rx="1.1" fill="#ffffff" opacity="0.75"/></g>`);
}
P.ripple = ps(`<ellipse cx="16" cy="16" rx="13" ry="7" fill="none" stroke="#d9a37a" stroke-width="2" opacity="0.8"/><ellipse cx="16" cy="16" rx="8" ry="4.2" fill="none" stroke="#e8c09e" stroke-width="1.5" opacity="0.6"/><path d="M7 13.2Q11 10.2 16 10" fill="none" stroke="#fff2e2" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`);
{
  let arms = ''; for (let i = 0; i < 6; i++) arms += `<g transform="rotate(${i * 60} 16 16)"><path d="M16 16V3.5M16 8L13 5.2M16 8L19 5.2M16 12L13.4 10M16 12L18.6 10"/></g>`;
  P.snowflake = ps(`<g fill="none" stroke="#9cc4e4" stroke-width="3.6" stroke-linecap="round">${arms}</g><g fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round">${arms}</g><circle cx="16" cy="16" r="3" fill="#ffffff" stroke="#9cc4e4" stroke-width="1"/>`);
}
P.star = ps(`${starShape(16, 17, 14, '#ffdf5e', '#e3922a')}<path d="M10 13.5Q12 9.5 15 8.5" fill="none" stroke="#fff8d0" stroke-width="2" stroke-linecap="round"/><circle cx="13.2" cy="17.5" r="1.3" fill="#7a4a1e"/><circle cx="18.8" cy="17.5" r="1.3" fill="#7a4a1e"/><path d="M14.6 20.4Q16 21.6 17.4 20.4" fill="none" stroke="#7a4a1e" stroke-width="1.1" stroke-linecap="round"/>`);

// ---------- write ----------
const files = {
  'biomes/meadow/ground.svg': (PREC = 2, meadow()), 'biomes/meadow/edge.svg': meadowEdge(),
  'biomes/river/ground.svg': river(), 'biomes/river/edge.svg': riverEdge(), 'biomes/river/zone.svg': riverZone(),
  'biomes/clouds/ground.svg': clouds(), 'biomes/clouds/edge.svg': cloudsEdge(), 'biomes/clouds/zone.svg': cloudsZone(),
  'biomes/glacier/ground.svg': glacier(), 'biomes/glacier/edge.svg': glacierEdge(), 'biomes/glacier/zone.svg': glacierZone(),
};
for (const k of Object.keys(P)) files['particles/' + k + '.svg'] = P[k];
for (const [rel, data] of Object.entries(files)) {
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  const kb = Buffer.byteLength(data) / 1024; console.log(rel.padEnd(30), kb.toFixed(1) + ' KB', kb >= 60 ? 'TOO BIG' : '');
}
module.exports = { PAL };
