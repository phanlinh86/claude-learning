// Foxy's Reef Memory: environment art generator.
// Writes original, hand-authored, procedurally-laid-out SVGs (seasons + particles).
// Usage: node gen.js [assetsDir]
// Adapted from projects/flappy/tools/art-environment/gen.js (same tileable-band + wrap technique).
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const W = 960;
let PREC = 10; // coordinate precision (10 = 0.1 px); dense layers drop to whole px to stay < 60 KB
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function wave(terms) { return x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0); }
// periodic band (tileable because every k is an integer)
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
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// ---------- props (one-step shading: dark offset, base, highlight) ----------
// branching (staghorn) coral: tapered round-capped curved strokes
function branchCoral(x, y, s, c, seed) {
  const r = rng(seed); const segs = [];
  function grow(x0, y0, ang, len, w, depth) {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    const bend = (r() - 0.5) * len * 0.35;
    const cx = (x0 + x1) / 2 + Math.cos(ang + Math.PI / 2) * bend, cy = (y0 + y1) / 2 + Math.sin(ang + Math.PI / 2) * bend;
    segs.push({ d: `M${f(x0)} ${f(y0)}Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`, w, x1, y1 });
    if (depth > 0) {
      const n = depth > 1 ? 2 : 1 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const spread = n === 1 ? (r() - 0.5) * 0.5 : (i ? 0.42 : -0.42) + (r() - 0.5) * 0.25;
        grow(x1, y1, ang + spread, len * (0.68 + r() * 0.16), w * 0.76, depth - 1);
      }
    }
  }
  const trunks = 3;
  for (let i = 0; i < trunks; i++) grow(x + (i - 1) * 7 * s, y, -Math.PI / 2 + (i - 1) * 0.45, 30 * s, 11 * s, 3);
  const grp = (col, extra, body) => `<g fill="none" stroke="${col}" stroke-linecap="round"${extra}>${body}</g>`;
  const ps = (d, w) => `<path d="${d}" stroke-width="${f(w)}"/>`;
  let o = grp(c.dark, ` transform="translate(${f(2.5 * s)} ${f(2 * s)})"`, segs.map(g => ps(g.d, g.w)).join(''));
  o += grp(c.base, '', segs.map(g => ps(g.d, g.w)).join(''));
  o += grp(c.light, ` opacity="0.7" transform="translate(${f(-1.8 * s)} 0)"`, segs.filter(g => g.w > 6 * s).map(g => ps(g.d, g.w * 0.22)).join(''));
  o += `<g fill="${c.light}">` + segs.filter(g => g.w < 7 * s).map(g => `<circle cx="${f(g.x1 - g.w * 0.15)}" cy="${f(g.y1 - g.w * 0.15)}" r="${f(g.w * 0.28)}"/>`).join('') + '</g>';
  return o;
}
// sea fan: rounded fan with a lattice of veins
function fanCoral(x, y, s, c, seed) {
  const r = rng(seed); const R = 46 * s, H = 58 * s;
  const pts = []; for (let i = 0; i <= 24; i++) { const t = Math.PI * (1.08 + 0.84 * i / 24); const k = 1 + (r() - 0.5) * 0.1; pts.push([x + Math.cos(t) * R * k, y - 10 * s + Math.sin(t) * H * k]); }
  const d = `M${f(x - 4 * s)} ${f(y)}` + pts.map(p => `L${f(p[0])} ${f(p[1])}`).join('') + `L${f(x + 4 * s)} ${f(y)}Z`;
  let o = `<path d="${d}" fill="${c.dark}" transform="translate(${f(3 * s)} ${f(2 * s)})"/>`;
  o += `<path d="${d}" fill="${c.base}"/>`;
  // veins radiating from the base, and two arcs
  for (let i = 0; i < 9; i++) { const t = Math.PI * (1.14 + 0.72 * i / 8); o += strokeP(`M${f(x)} ${f(y - 4 * s)}Q${f(x + Math.cos(t) * R * 0.5)} ${f(y - 10 * s + Math.sin(t) * H * 0.45)} ${f(x + Math.cos(t) * R * 0.92)} ${f(y - 10 * s + Math.sin(t) * H * 0.92)}`, c.dark, 2.2 * s, ' opacity="0.75"'); }
  for (const k of [0.45, 0.72]) { let a = ''; for (let i = 0; i <= 12; i++) { const t = Math.PI * (1.12 + 0.76 * i / 12); a += (i ? 'L' : 'M') + f(x + Math.cos(t) * R * k) + ' ' + f(y - 10 * s + Math.sin(t) * H * k); } o += strokeP(a, c.dark, 1.6 * s, ' opacity="0.55"'); }
  o += strokeP(`M${f(x - R * 0.55)} ${f(y - H * 0.62)}Q${f(x - R * 0.2)} ${f(y - H * 0.98)} ${f(x + R * 0.25)} ${f(y - H * 0.95)}`, c.light, 3 * s, ' opacity="0.8"');
  return o;
}
// brain coral dome with grooves
function brainCoral(x, y, s, c, seed) {
  const r = rng(seed); const rx = 30 * s, ry = 22 * s;
  const d = `M${f(x - rx)} ${f(y)}C${f(x - rx)} ${f(y - ry * 1.35)} ${f(x + rx)} ${f(y - ry * 1.35)} ${f(x + rx)} ${f(y)}Z`;
  let o = `<path d="${d}" fill="${c.dark}" transform="translate(${f(2.5 * s)} ${f(1.5 * s)})"/><path d="${d}" fill="${c.base}"/>`;
  for (let j = 0; j < 4; j++) {
    const yy = y - ry * (0.15 + j * 0.2), half = rx * Math.sqrt(Math.max(0.05, 1 - Math.pow((y - yy) / (ry * 1.02), 2))) * 0.82;
    let a = `M${f(x - half)} ${f(yy)}`; const n = 6;
    for (let i = 1; i <= n; i++) a += `Q${f(x - half + (i - 0.5) * 2 * half / n)} ${f(yy + (i % 2 ? -1 : 1) * 4 * s * (0.6 + r() * 0.5))} ${f(x - half + i * 2 * half / n)} ${f(yy)}`;
    o += strokeP(a, c.dark, 1.8 * s, ' opacity="0.6"');
  }
  o += ell(x - rx * 0.35, y - ry * 0.72, rx * 0.28, ry * 0.16, c.light, ` opacity="0.75" transform="rotate(-18 ${f(x - rx * 0.35)} ${f(y - ry * 0.72)})"`);
  return o;
}
// tube sponge cluster
function tubeSponge(x, y, s, c, seed) {
  const r = rng(seed); const tubes = [[-11, 34], [0, 50], [11, 28], [19, 20]]; let o = '';
  for (const [dx, h0] of tubes) {
    const h = h0 * s * (0.85 + r() * 0.3), tw = 10 * s, cx = x + dx * s, top = y - h;
    const d = `M${f(cx - tw / 2)} ${f(y)}L${f(cx - tw * 0.62)} ${f(top)}Q${f(cx)} ${f(top - 3 * s)} ${f(cx + tw * 0.62)} ${f(top)}L${f(cx + tw / 2)} ${f(y)}Z`;
    o += `<path d="${d}" fill="${c.dark}" transform="translate(${f(2 * s)} ${f(1 * s)})"/><path d="${d}" fill="${c.base}"/>`;
    o += ell(cx, top, tw * 0.55, 2.8 * s, c.dark) + ell(cx, top + 0.6 * s, tw * 0.38, 1.6 * s, mix(c.dark, '#000000', 0.25));
    o += strokeP(`M${f(cx - tw * 0.3)} ${f(top + 6 * s)}L${f(cx - tw * 0.25)} ${f(y - 4 * s)}`, c.light, 2 * s, ' opacity="0.7"');
  }
  return o;
}
// anemone: short column with curling tentacles
function anemone(x, y, s, c, seed) {
  const r = rng(seed); let o = '';
  const n = 11; const tips = [];
  for (let i = 0; i < n; i++) {
    const t = Math.PI * (1.1 + 0.8 * i / (n - 1)); const len = (16 + r() * 7) * s;
    const x1 = x + Math.cos(t) * len, y1 = y - 10 * s + Math.sin(t) * len;
    const cx = x + Math.cos(t) * len * 0.5 + (r() - 0.5) * 6 * s, cy = y - 10 * s + Math.sin(t) * len * 0.6;
    tips.push([`M${f(x)} ${f(y - 9 * s)}Q${f(cx)} ${f(cy)} ${f(x1)} ${f(y1)}`, x1, y1]);
  }
  for (const [d] of tips) o += strokeP(d, c.dark, 5 * s, ` transform="translate(${f(1.5 * s)} ${f(1 * s)})"`);
  for (const [d] of tips) o += strokeP(d, c.base, 4.2 * s);
  for (const [, x1, y1] of tips) o += circ(x1, y1, 2.6 * s, c.light);
  o += `<path d="M${f(x - 8 * s)} ${f(y)}Q${f(x - 9 * s)} ${f(y - 9 * s)} ${f(x)} ${f(y - 10 * s)}Q${f(x + 9 * s)} ${f(y - 9 * s)} ${f(x + 8 * s)} ${f(y)}Z" fill="${c.stem || c.dark}"/>`;
  return o;
}
// kelp stalk with alternating blades and float bulbs
function kelp(x, y, h, s, c, seed) {
  const r = rng(seed); const ph = r() * 6; const sway = 10 * s;
  const px = t => x + Math.sin(t * 3.2 + ph) * sway * t;
  let d = `M${f(x)} ${f(y)}`; const N = 16;
  for (let i = 1; i <= N; i++) { const t = i / N; d += `L${f(px(t))} ${f(y - h * t)}`; }
  let o = strokeP(d, c.dark, 4.5 * s, ` transform="translate(${f(1.5 * s)} 0)"`) + strokeP(d, c.stem, 3.2 * s);
  const blades = Math.floor(h / (26 * s)); let leaves = '', bulbs = '';
  for (let i = 1; i <= blades; i++) {
    const t = i / (blades + 0.6); const bx = px(t), by = y - h * t; const side = i % 2 ? 1 : -1;
    const L = (20 + r() * 8) * s * (1 - t * 0.25), Wd = 6.5 * s * (1 - t * 0.2); const ang = side * (38 + r() * 14) - 90;
    const tf = `translate(${f(bx)} ${f(by)}) rotate(${f(ang + 90)})`;
    const leaf = `M0 0C${f(Wd)} ${f(-L * 0.3)} ${f(Wd * 0.8)} ${f(-L * 0.8)} 0 ${f(-L)}C${f(-Wd * 0.9)} ${f(-L * 0.75)} ${f(-Wd)} ${f(-L * 0.3)} 0 0Z`;
    leaves += `<g transform="${tf}"><path d="${leaf}" fill="${c.dark}" transform="translate(1.5 1)"/><path d="${leaf}"/><path d="M0 -2V${f(-L * 0.8)}" fill="none" stroke="${c.light}" opacity="0.8"/></g>`;
    bulbs += `<circle cx="${f(bx + side * 2 * s)}" cy="${f(by - 1 * s)}" r="${f(2.6 * s)}"/>`;
  }
  o += `<g fill="${c.base}" stroke-width="${f(1.2 * s)}" stroke-linecap="round">${leaves}</g><g fill="${c.bulb || c.light}">${bulbs}</g>`;
  o += circ(px(1), y - h - 2 * s, 3.5 * s, c.base) + circ(px(1) - 1 * s, y - h - 3 * s, 1.4 * s, c.light);
  return o;
}
// sea grass tuft (tapered blades)
function grass(x, y, s, c, seed, n = 5) {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) {
    const bx = x + (i - (n - 1) / 2) * 3.2 * s, h = (16 + r() * 16) * s, lean = (i - (n - 1) / 2) * 3 * s + (r() - 0.5) * 6 * s;
    const col = i % 2 ? c.base : c.dark;
    o += `<path d="M${f(bx - 1.8 * s)} ${f(y)}Q${f(bx + lean * 0.3)} ${f(y - h * 0.6)} ${f(bx + lean)} ${f(y - h)}Q${f(bx + lean * 0.3 + 2 * s)} ${f(y - h * 0.55)} ${f(bx + 1.8 * s)} ${f(y)}Z" fill="${col}"/>`;
  }
  return o;
}
// rounded rock outcrop
function rock(x, y, w, h, c, seed) {
  const r = rng(seed); let d = `M${f(x - w / 2)} ${f(y)}`;
  for (let i = 0; i <= 10; i++) { const t = Math.PI * (1 + i / 10); const k = 0.9 + r() * 0.16; d += `L${f(x + Math.cos(t) * w / 2 * k)} ${f(y + Math.sin(t) * h * k)}`; }
  d += `L${f(x + w / 2)} ${f(y)}Z`;
  return `<path d="${d}" fill="${c.dark}" transform="translate(3 2)"/><path d="${d}" fill="${c.base}" stroke="${c.base}" stroke-width="4" stroke-linejoin="round"/>` +
    ell(x - w * 0.16, y - h * 0.62, w * 0.2, h * 0.14, c.light, ' opacity="0.6"');
}
// small scallop shell (floor)
function shell(x, y, s, c) {
  let o = `<path d="M${f(x)} ${f(y + 5 * s)}L${f(x - 8 * s)} ${f(y - 2 * s)}Q${f(x)} ${f(y - 11 * s)} ${f(x + 8 * s)} ${f(y - 2 * s)}Z" fill="${c.base}" stroke="${c.dark}" stroke-width="${f(1.4 * s)}" stroke-linejoin="round"/>`;
  for (const a of [-5, -2.5, 0, 2.5, 5]) o += strokeP(`M${f(x)} ${f(y + 4 * s)}L${f(x + a * 1.2 * s)} ${f(y - 6 * s + Math.abs(a) * 0.5 * s)}`, c.dark, 0.9 * s, ' opacity="0.6"');
  return o + `<path d="M${f(x - 3 * s)} ${f(y + 5 * s)}h${f(6 * s)}l${f(-1 * s)} ${f(2.5 * s)}h${f(-4 * s)}Z" fill="${c.dark}"/>`;
}
function starfish(x, y, s, col, dark, rot) {
  let d = ''; for (let i = 0; i < 10; i++) { const t = (rot + i * 36 - 90) * Math.PI / 180, rr = i % 2 ? 4.2 * s : 10 * s; d += (i ? 'L' : 'M') + f(x + Math.cos(t) * rr) + ' ' + f(y + Math.sin(t) * rr * 0.62); }
  return `<path d="${d}Z" fill="${col}" stroke="${dark}" stroke-width="${f(1.6 * s)}" stroke-linejoin="round"/>` + circ(x, y, 1.2 * s, dark) + circ(x - 3 * s, y - 2 * s, 0.9 * s, '#ffffff', ' opacity="0.7"');
}
// distant silhouettes
function farCoralHead(x, y, s, col) { // bumpy rounded top
  let d = `M${f(x - 30 * s)} ${f(y)}`; const bumps = [[-24, -14, 9], [-11, -24, 11], [4, -28, 12], [18, -20, 10], [27, -10, 7]];
  for (const [dx, dy, r] of bumps) d += `A${f(r * s)} ${f(r * s)} 0 0 1 ${f(x + (dx + r * 0.9) * s)} ${f(y + dy * s + r * 0.6 * s)}`;
  return `<path d="${d}L${f(x + 30 * s)} ${f(y + 40)}L${f(x - 30 * s)} ${f(y + 40)}Z" fill="${col}"/>`;
}
function farKelp(x, y, h, s, col, seed) {
  const r = rng(seed); const ph = r() * 6; let d = `M${f(x)} ${f(y)}`; let o = '';
  for (let i = 1; i <= 12; i++) { const t = i / 12; d += `L${f(x + Math.sin(t * 3 + ph) * 7 * s * t)} ${f(y - h * t)}`; }
  o += strokeP(d, col, 3 * s);
  for (let i = 1; i < 6; i++) { const t = i / 6.3; const bx = x + Math.sin(t * 3 + ph) * 7 * s * t, by = y - h * t, side = i % 2 ? 1 : -1; o += ell(bx + side * 6 * s, by - 6 * s, 3.4 * s, 10 * s, col, ` transform="rotate(${side * 35} ${f(bx + side * 6 * s)} ${f(by - 6 * s)})"`); }
  return o;
}
function farFan(x, y, s, col) { return `<path d="M${f(x - 3 * s)} ${f(y)}C${f(x - 40 * s)} ${f(y - 30 * s)} ${f(x - 30 * s)} ${f(y - 66 * s)} ${f(x)} ${f(y - 62 * s)}C${f(x + 30 * s)} ${f(y - 66 * s)} ${f(x + 40 * s)} ${f(y - 30 * s)} ${f(x + 3 * s)} ${f(y)}V${f(y + 40)}H${f(x - 3 * s)}Z" fill="${col}"/>`; }
// distant rock arch
function farArch(x, y, s, col) { return `<path d="M${f(x - 70 * s)} ${f(y)}C${f(x - 72 * s)} ${f(y - 60 * s)} ${f(x - 40 * s)} ${f(y - 92 * s)} ${f(x + 4 * s)} ${f(y - 90 * s)}C${f(x + 50 * s)} ${f(y - 88 * s)} ${f(x + 74 * s)} ${f(y - 55 * s)} ${f(x + 70 * s)} ${f(y)}L${f(x + 36 * s)} ${f(y)}C${f(x + 36 * s)} ${f(y - 34 * s)} ${f(x + 20 * s)} ${f(y - 52 * s)} ${f(x)} ${f(y - 52 * s)}C${f(x - 22 * s)} ${f(y - 52 * s)} ${f(x - 34 * s)} ${f(y - 32 * s)} ${f(x - 34 * s)} ${f(y)}Z" fill="${col}"/>`; }

// ---------- seasons ----------
// water: 4-stop vertical gradient; far: two haze tones; floor: sand tones
const S = {
  spring: {
    water: ['#9beee6', '#4fcfd2', '#2a9db4', '#1d6f94'], glow: '#eafff6', glowX: 260, caustic: 0.12,
    far: ['#6fc6cc', '#58b0bf'], dune: '#5aa6a8',
    sand: ['#f3dfb2', '#e6c995', '#cfae78', '#fff3d6'],
    coralA: { base: '#ff8fb1', dark: '#d9608a', light: '#ffc6d6' }, coralB: { base: '#ffb0c8', dark: '#e07b9d', light: '#ffe0ea' },
    fan: { base: '#f58fc0', dark: '#c95f95', light: '#ffd0e6' }, anem: { base: '#c58bf0', dark: '#9259c4', light: '#f2d9ff', stem: '#8550b8' },
    sponge: { base: '#7fd6a0', dark: '#4ea472', light: '#c3f2d3' }, brain: { base: '#f7b98a', dark: '#d48c5c', light: '#ffe1c8' },
    kelp: { base: '#5fcf7a', dark: '#38995a', light: '#a8f0b8', stem: '#3f9e5c', bulb: '#9ee6a8' },
    grass: { base: '#6ad884', dark: '#3fa862' }, rock: { base: '#5f9fa8', dark: '#477e8a', light: '#8cc6c9' },
    floorGrass: { base: '#69d07f', dark: '#3c9d5c' }, shell: { base: '#ffd2df', dark: '#d77f9c' }, star: ['#ff9f7a', '#c9603e'],
    rays: { col: '#f4fff6', a: 0.22, n: 6, srcX: 200 },
  },
  summer: {
    water: ['#a8f4f6', '#52d6ec', '#22a6d4', '#1675b0'], glow: '#fffbe0', glowX: 700, caustic: 0.16,
    far: ['#6ccbe0', '#4fb1d3'], dune: '#4da6bf',
    sand: ['#fbe7b8', '#f1d293', '#dcb571', '#fff8e2'],
    coralA: { base: '#ffcf3f', dark: '#dd9c1e', light: '#fff0a6' }, coralB: { base: '#ff9b3d', dark: '#d86b1c', light: '#ffd09a' },
    fan: { base: '#ff7f5c', dark: '#d2533a', light: '#ffc6ad' }, anem: { base: '#ff9fbe', dark: '#d76d93', light: '#fff0f5', stem: '#c25b80' },
    sponge: { base: '#ffa94a', dark: '#d97b22', light: '#ffd9a8' }, brain: { base: '#ffe07a', dark: '#d9b03f', light: '#fff5c8' },
    kelp: { base: '#6cd68a', dark: '#3d9f62', light: '#b2f3c2', stem: '#44a666', bulb: '#ffe07a' },
    grass: { base: '#74dc8c', dark: '#45ac66' }, rock: { base: '#5aa7c0', dark: '#3f86a4', light: '#8dcbe0' },
    floorGrass: { base: '#76d68a', dark: '#46a466' }, shell: { base: '#ffe3c2', dark: '#d79a62' }, star: ['#ff7e5f', '#c7472e'],
    rays: { col: '#fffbe6', a: 0.3, n: 7, srcX: 700 },
  },
  autumn: {
    water: ['#f4cc7e', '#d09f55', '#8c8257', '#3d5652'], glow: '#fff1c8', glowX: 640, caustic: 0.11,
    far: ['#b39a66', '#96865e'], dune: '#8b7a55',
    sand: ['#e8c890', '#d6ad6e', '#b98d52', '#f7e2b6'],
    coralA: { base: '#e2553a', dark: '#a8352a', light: '#ff9a7c' }, coralB: { base: '#f08a3a', dark: '#b85e22', light: '#ffc38a' },
    fan: { base: '#d9473a', dark: '#9e2e28', light: '#ff9c86' }, anem: { base: '#f2b13c', dark: '#bb7f1f', light: '#ffe7a6', stem: '#a96c1c' },
    sponge: { base: '#c8673a', dark: '#93462a', light: '#f0a77a' }, brain: { base: '#e4a35a', dark: '#b07636', light: '#ffd7a2' },
    kelp: { base: '#ec8a34', dark: '#a8521f', light: '#ffc27e', stem: '#b4602a', bulb: '#ffb04a' },
    kelp2: { base: '#d5503a', dark: '#94321f', light: '#ff9a7e', stem: '#9c3e26', bulb: '#ff8a5a' },
    grass: { base: '#c99a3e', dark: '#9a6f28' }, rock: { base: '#7e7558', dark: '#615a44', light: '#a69a72' },
    floorGrass: { base: '#d0962f', dark: '#9e6a22' }, shell: { base: '#fbe1c0', dark: '#bf8250' }, star: ['#e8573e', '#9e3324'],
    rays: { col: '#ffe9b8', a: 0.22, n: 6, srcX: 640 },
  },
  winter: {
    water: ['#6f8fd0', '#3f5ca8', '#25387a', '#141c4a'], glow: '#dce8ff', glowX: 480, caustic: 0.07,
    far: ['#4b63a3', '#3d5290'], dune: '#3d4f8a',
    sand: ['#b7c3e3', '#9aa7d0', '#7c88b7', '#e2eaff'],
    coralA: { base: '#cfe6ff', dark: '#8fb0dd', light: '#ffffff' }, coralB: { base: '#e9f3ff', dark: '#a7bfe2', light: '#ffffff' },
    fan: { base: '#b9d3f6', dark: '#7f9fd0', light: '#f4f9ff' }, anem: { base: '#c7b8f2', dark: '#8e7fcf', light: '#f6f2ff', stem: '#7666b6' },
    sponge: { base: '#a9c4ea', dark: '#7290c4', light: '#e6f0ff' }, brain: { base: '#d8e4f6', dark: '#9fb2d4', light: '#ffffff' },
    kelp: { base: '#7fb5c9', dark: '#4f8299', light: '#cbeaf4', stem: '#568aa0', bulb: '#d6f1ff' },
    grass: { base: '#8fb8d0', dark: '#6390ac' }, rock: { base: '#5a6aa6', dark: '#454f86', light: '#8a98cc' },
    floorGrass: { base: '#9cc4d8', dark: '#6b98b4' }, shell: { base: '#f2f6ff', dark: '#8e9cc8' }, star: ['#b6c6f2', '#6f7fb8'],
    rays: { col: '#dfe9ff', a: 0.1, n: 5, srcX: 480 },
  },
};

function waterSVG(s) {
  const c = S[s]; const [a, b, cc, d] = c.water;
  const defs = `<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.3" stop-color="${b}"/><stop offset="0.68" stop-color="${cc}"/><stop offset="1" stop-color="${d}"/></linearGradient>` +
    `<radialGradient id="g" cx="${c.glowX / 960}" cy="0" r="0.55" gradientTransform="translate(${c.glowX / 960} 0) scale(1 1.4) translate(${-c.glowX / 960} 0)"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.42"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${d}" stop-opacity="0"/><stop offset="1" stop-color="${d}" stop-opacity="0.45"/></linearGradient>`;
  let o = `<rect width="960" height="540" fill="url(#w)"/><rect width="960" height="540" fill="url(#g)"/>`;
  // surface: bright wavy band at the top with a lighter rim
  let sd = 'M0 0'; for (let x = 0; x <= 960; x += 8) sd += `L${x} ${f(22 + 5 * Math.sin(x / 38) + 3 * Math.sin(x / 13 + 1))}`;
  o += `<path d="${sd}L960 0Z" fill="${c.glow}" opacity="0.45"/>`;
  let sd2 = 'M0 0'; for (let x = 0; x <= 960; x += 8) sd2 += `L${x} ${f(10 + 3 * Math.sin(x / 24 + 2) + 2 * Math.sin(x / 9))}`;
  o += `<path d="${sd2}L960 0Z" fill="#ffffff" opacity="0.35"/>`;
  // soft caustic net near the surface (fades with depth)
  const r = rng(s.length * 77); let caus = '';
  for (let row = 0; row < 4; row++) {
    const y0 = 44 + row * 30; const op = c.caustic * (1 - row * 0.22);
    let d2 = ''; for (let x = -20; x < 980; x += 30 + r() * 26) { const w2 = 18 + r() * 22; d2 += `M${f(x)} ${f(y0 + r() * 10)}q${f(w2 / 2)} ${f(-6 - r() * 6)} ${f(w2)} ${f(r() * 6 - 3)}`; }
    caus += `<path d="${d2}" fill="none" stroke="#ffffff" stroke-width="${f(2.4 - row * 0.4)}" stroke-linecap="round" opacity="${f(op * 10) / 10 || 0.05}"/>`;
  }
  o += caus + `<rect width="960" height="540" fill="url(#v)"/>`;
  return svg(960, 540, o, defs);
}

function farSVG(s) {
  const c = S[s]; const [back, front] = c.far; const r = rng(s.length * 13 + 5); let o = '';
  // back haze ridge with silhouettes
  o += band(408, [[10, 2, 0.4], [6, 5, 1.7], [3, 9, 0.2]], back);
  for (let i = 0; i < 9; i++) { const x = i * 107 + r() * 40; const yy0 = 404 + r() * 4, sc = 0.8 + r() * 0.5; o += wrap(x, 40, xx => farCoralHead(xx, yy0, sc, back)); }
  for (let i = 0; i < 6; i++) { const x = 60 + i * 160 + r() * 50; const h = 70 + r() * 70; o += wrap(x, 40, xx => farKelp(xx, 410, h, 0.9, back, i * 9 + s.length)); }
  o += wrap(700, 75, xx => farArch(xx, 432, 0.95, back));
  // front ridge, darker, a bit lower
  o += band(440, [[9, 3, 1.1], [5, 7, 2.6], [2.5, 13, 0.9]], front);
  for (let i = 0; i < 7; i++) { const x = 40 + i * 140 + r() * 50; const sc = 0.8 + r() * 0.5; o += wrap(x, 40, xx => (i % 2 ? farFan(xx, 440, sc, front) : farCoralHead(xx, 438, sc, front))); }
  if (s === 'autumn') for (let i = 0; i < 10; i++) { const x = 20 + i * 96 + r() * 40; const hh = 120 + r() * 120; o += wrap(x, 40, xx => farKelp(xx, 444, hh, 1.1, front, i * 31)); }
  return svg(960, 540, o);
}

function midSVG(s) {
  const c = S[s]; const r = rng(s.length * 101 + 3); let o = '';
  // back dune that the floor lip sits on
  o += band(446, [[5, 2, 0.6], [3, 5, 2.1], [1.5, 11, 0.3]], c.dune);
  // left/right rocks (cluster anchors). Tile x 0-260 and 800-960 are the busy edges at offset 0.
  o += wrap(150, 70, x => rock(x, 458, 130, 46, c.rock, 11)) + wrap(900, 70, x => rock(x, 458, 120, 40, c.rock, 12));
  const kelpC = c.kelp, kelpB = c.kelp2 || c.kelp;
  // ---- cluster A (around x 40-250) ----
  const A = [];
  if (s === 'autumn') {
    // kelp forest: tall stalks
    [[52, 300], [104, 360], [176, 320], [232, 260]].forEach(([x, h], i) => A.push(wrap(x, 45, xx => kelp(xx, 462, h, 1.15, i % 2 ? kelpB : kelpC, 50 + i))));
    A.push(branchCoral(100, 452, 0.85, c.coralA, 7) + fanCoral(196, 452, 0.9, c.fan, 3) + anemone(58, 456, 1, c.anem, 2) + tubeSponge(250, 458, 0.9, c.sponge, 4));
  } else {
    A.push(wrap(48, 45, xx => kelp(xx, 462, s === 'winter' ? 170 : 220, 1, kelpC, 51)));
    A.push(fanCoral(92, 444, 1.25, c.fan, 3));
    A.push(branchCoral(160, 450, 1.05, c.coralA, 7));
    A.push(tubeSponge(226, 458, 1, c.sponge, 4));
    A.push(anemone(126, 462, 1.05, c.anem, 2) + brainCoral(60, 462, 0.9, c.brain, 9));
    A.push(wrap(250, 30, xx => grass(xx, 464, 1.5, c.grass, 31, 7)) + wrap(8, 30, xx => grass(xx, 464, 1.7, c.grass, 34, 7)) + grass(196, 466, 1.3, c.grass, 35, 5));
  }
  // ---- cluster B (around x 780-960, wraps) ----
  const B = [];
  if (s === 'autumn') {
    [[796, 280], [852, 350], [914, 300]].forEach(([x, h], i) => B.push(wrap(x, 45, xx => kelp(xx, 462, h, 1.15, i % 2 ? kelpC : kelpB, 70 + i))));
    B.push(wrap(850, 75, xx => branchCoral(xx, 454, 0.9, c.coralB, 17)) + wrap(915, 40, xx => brainCoral(xx, 462, 0.8, c.brain, 19)));
  } else {
    B.push(wrap(820, 75, xx => branchCoral(xx, 452, 0.9, c.coralB, 17)));
    B.push(wrap(872, 55, xx => fanCoral(xx, 446, 1.05, c.coralA, 13)));
    B.push(wrap(912, 45, xx => kelp(xx, 462, s === 'winter' ? 150 : 190, 1, kelpC, 53)));
    B.push(wrap(905, 40, xx => brainCoral(xx, 464, 1, c.brain, 21)));
    B.push(wrap(860, 30, xx => anemone(xx, 464, 0.95, c.anem, 22)));
    B.push(wrap(790, 30, xx => grass(xx, 464, 1.5, c.grass, 33, 7)) + wrap(925, 30, xx => grass(xx, 466, 1.3, c.grass, 36, 5)));
  }
  o += A.join('') + B.join('');
  // ---- calm middle (x 280-760): only low, sparse props (≤ ~40 px tall) ----
  const lows = [[330, 'brain'], [420, 'grass'], [505, 'anem'], [590, 'rock'], [660, 'grass'], [730, 'sponge']];
  lows.forEach(([x, k], i) => {
    const xx = x + (r() - 0.5) * 20;
    if (k === 'brain') o += brainCoral(xx, 466, 0.7, c.brain, 40 + i);
    if (k === 'grass') o += grass(xx, 466, 0.9, c.grass, 41 + i, 4);
    if (k === 'anem') o += anemone(xx, 466, 0.75, c.anem, 42 + i);
    if (k === 'rock') o += rock(xx, 468, 60, 20, c.rock, 43 + i);
    if (k === 'sponge') o += tubeSponge(xx, 468, 0.6, c.sponge, 44 + i);
  });
  return svg(960, 540, o);
}

function floorSVG(s) {
  const c = S[s]; const [sand, sand2, sand3, hi] = c.sand; const r = rng(s.length * 7 + 1); let o = '';
  // wavy top lip (y 3..12), opaque below
  o += band(9, [[2.5, 6, 0.3], [1.5, 15, 1.2]], sand, 90, 4);
  o += band(12, [[2, 6, 0.3], [1.2, 15, 1.2]], mix(sand, hi, 0.5), 90, 4, '');
  o += band(16, [[2.5, 6, 0.6], [1.5, 15, 1.4]], sand, 90, 4);
  o += band(48, [[5, 3, 0.4], [3, 8, 2.2]], sand2, 90);
  o += band(72, [[4, 4, 1.9], [2.5, 11, 0.7]], sand3, 90);
  // ripple marks
  for (let i = 0; i < 22; i++) { const x = r() * 960, y = 26 + r() * 52, w = 18 + r() * 26; o += wrap(x, w, xx => strokeP(`M${f(xx - w / 2)} ${f(y)}q${f(w / 2)} ${f(-4)} ${w}0`, i % 2 ? hi : sand3, 1.6, ` opacity="${i % 2 ? 0.6 : 0.45}"`)); }
  // pebbles
  for (let i = 0; i < 26; i++) { const x = r() * 960, y = 30 + r() * 55, rr = 2 + r() * 4; o += wrap(x, 8, xx => ell(xx + 0.8, y + 0.8, rr, rr * 0.62, sand3) + ell(xx, y, rr, rr * 0.62, mix(sand2, c.rock.base, 0.35)) + ell(xx - rr * 0.3, y - rr * 0.25, rr * 0.35, rr * 0.2, hi, ' opacity="0.8"')); }
  // grass tufts poking up from the lip
  for (let i = 0; i < 9; i++) { const x = 40 + i * 107 + r() * 40; const gy = 26 + r() * 6; o += wrap(x, 18, xx => grass(xx, gy, 0.9, c.floorGrass, 200 + i, 4)); }
  // shells + starfish
  for (let i = 0; i < 6; i++) { const x = 80 + i * 160 + r() * 60, y = 40 + r() * 34; o += wrap(x, 10, xx => shell(xx, y, 0.9, c.shell)); }
  for (let i = 0; i < 2; i++) { const x = 250 + i * 470 + r() * 60, y = 52 + r() * 20; const rot = r() * 50; o += wrap(x, 12, xx => starfish(xx, y, 1, c.star[0], c.star[1], rot)); }
  if (s === 'autumn') for (let i = 0; i < 16; i++) { const x = r() * 960, y = 22 + r() * 60, a = r() * 180, col = ['#e8792e', '#d5503a', '#f2b13c'][i % 3]; o += wrap(x, 8, xx => ell(xx, y, 6, 2.4, col, ` transform="rotate(${f(a)} ${f(xx)} ${f(y)})"`)); }
  if (s === 'winter') for (let i = 0; i < 40; i++) { const x = r() * 960, y = 14 + r() * 74; const rr = 0.8 + r() * 1.4, op = f(0.5 + r() * 0.4); o += wrap(x, 3, xx => circ(xx, y, rr, '#ffffff', ` opacity="${op}"`)); }
  if (s === 'spring') for (let i = 0; i < 10; i++) { const x = r() * 960, y = 30 + r() * 50; o += wrap(x, 5, xx => circ(xx, y, 2.2, '#ffc6d6') + circ(xx, y, 0.9, '#ff8fb1')); }
  return svg(960, 90, `<rect y="14" width="960" height="76" fill="${sand}"/>` + o);
}

function raysSVG(s) {
  const c = S[s].rays; const r = rng(s.length * 3 + 9);
  const defs = `<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.col}" stop-opacity="${c.a}"/><stop offset="0.55" stop-color="${c.col}" stop-opacity="${f(c.a * 0.35 * 100) / 100}"/><stop offset="1" stop-color="${c.col}" stop-opacity="0"/></linearGradient>` +
    `<filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>`;
  let o = '<g filter="url(#b)">';
  for (let i = 0; i < c.n; i++) {
    const x0 = c.srcX - 260 + i * (520 / (c.n - 1)) + (r() - 0.5) * 40; const w0 = 18 + r() * 26;
    const lean = (x0 - c.srcX) * 0.55 + 70; const len = 380 + r() * 140; const w1 = w0 * 2.4;
    o += `<path d="M${f(x0)} -10L${f(x0 + w0)} -10L${f(x0 + w0 + lean + w1 / 2)} ${f(len)}L${f(x0 + lean - w1 / 2)} ${f(len)}Z" fill="url(#r)" opacity="${f(0.6 + r() * 0.4)}"/>`;
  }
  return svg(960, 540, o + '</g>', defs);
}

// ---------- particles (32x32, centred) ----------
const P = {};
P.bubble = `<circle cx="16" cy="16" r="11.5" fill="#1d5a7a" fill-opacity="0.08" stroke="#1d4f6e" stroke-opacity="0.35" stroke-width="2.6"/>` +
  `<circle cx="16" cy="16" r="11" fill="#e8fbff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.92" stroke-width="1.6"/>` +
  `<path d="M9.2 13.2A7.5 7.5 0 0 1 14.6 8.6" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>` + circ(10.3, 17.2, 1.2, '#ffffff', ' opacity="0.85"') +
  `<path d="M21.5 20.5A7 7 0 0 1 18.5 23" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"/>`;
const glowDef = (id, col) => `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="0.75"/><stop offset="0.45" stop-color="${col}" stop-opacity="0.25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
const star4 = (cx, cy, R, r0, col) => `<path d="M${cx} ${cy - R}Q${cx + r0} ${cy - r0} ${cx + R} ${cy}Q${cx + r0} ${cy + r0} ${cx} ${cy + R}Q${cx - r0} ${cy + r0} ${cx - R} ${cy}Q${cx - r0} ${cy - r0} ${cx} ${cy - R}Z" fill="${col}"/>`;
P.plankton = [glowDef('g', '#bffcff'), `<circle cx="16" cy="16" r="15" fill="url(#g)"/>` + star4(16, 16, 9, 1.6, '#e9ffff').replace('/>', ' stroke="#3fb8c4" stroke-opacity="0.55" stroke-width="0.9" stroke-linejoin="round"/>') + circ(16, 16, 2.4, '#ffffff')];
P.sparkle = [glowDef('g', '#fff2a8'), `<circle cx="16" cy="16" r="15" fill="url(#g)"/>` + star4(16, 16, 13, 2.4, '#ffd84a') + star4(16, 16, 10, 1.6, '#fff7c8') + circ(16, 16, 2.2, '#ffffff') + star4(26, 7, 3.5, 0.8, '#fff7c8')];
P.snow = [`<radialGradient id="g"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.5" stop-color="#f2f7ff" stop-opacity="0.85"/><stop offset="1" stop-color="#e6efff" stop-opacity="0"/></radialGradient>`,
  `<circle cx="16" cy="16" r="8" fill="url(#g)"/><path d="M13.2 14.6C14 12.6 17.4 12.2 18.6 14C19.8 15.8 18.6 18.6 16.2 18.8C14.2 19 12.6 16.6 13.2 14.6Z" fill="#ffffff" opacity="0.95"/>` + circ(20.5, 11.8, 1.1, '#ffffff', ' opacity="0.8"') + circ(11.2, 19.6, 0.8, '#ffffff', ' opacity="0.7"')];
function fish(tailUp) {
  const O = '#7a3410', body = '#ff9a3c', belly = '#ffc98a';
  const tail = tailUp ? 'M10 16L3.2 9.6Q2.4 15 4 21.6Z' : 'M10 16L4 10.4Q2.4 17 3.2 22.4Z';
  return `<path d="${tail}" fill="${body}" stroke="${O}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M14 9.8Q18 5.6 22 9.4" fill="#ff7b2a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<ellipse cx="17.6" cy="16" rx="9.4" ry="6.8" fill="${body}" stroke="${O}" stroke-width="1.4"/>` +
    `<path d="M10.8 18Q17.6 23.6 25.6 18.6Q19 21 10.8 18Z" fill="${belly}"/>` +
    `<path d="M14.6 9.6Q12.6 16 14.6 22.4L17.6 22.6Q15.8 16 17.6 9.4Z" fill="#ffffff" stroke="${O}" stroke-width="1" stroke-linejoin="round"/>` +
    circ(22.2, 14.4, 2.6, '#ffffff', ` stroke="${O}" stroke-width="0.9"`) + circ(22.8, 14.6, 1.5, '#2a1a10') + circ(23.3, 13.9, 0.6, '#ffffff') +
    `<path d="M24.4 18Q25.6 18.8 26.6 17.8" fill="none" stroke="${O}" stroke-width="1" stroke-linecap="round"/>` +
    `<path d="M18.8 17.6L${tailUp ? '15.6 20.6' : '16 19.4'}" stroke="#e8701e" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M12.6 12.8Q15 10.6 17.6 10.8" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.2" stroke-linecap="round"/>`;
}
P.fish_a = fish(true); P.fish_b = fish(false);
P.kelp_bit = `<path d="M7 25C9 17 15 9 25 6C24 15 17 23 7 25Z" fill="#ec8a34" stroke="#a8521f" stroke-width="1.4" stroke-linejoin="round"/>` +
  `<path d="M7 25C9 17 15 9 25 6C22 9 18 11 14 15C11 18 9 21 7 25Z" fill="#c96a26" opacity="0.5"/>` +
  `<path d="M8 24Q15 16 23.5 7.5" fill="none" stroke="#ffc27e" stroke-width="1.2" stroke-linecap="round"/>` + circ(9.5, 23.6, 2.4, '#ffb04a', ' stroke="#a8521f" stroke-width="1.1"');
function jelly(expanded) {
  const rim = '#a46ad4', bell = '#e8c0ff', hi = '#fbf0ff';
  const bellD = expanded ? 'M6 16.5Q6 6.5 16 6.5Q26 6.5 26 16.5Q24 15.2 22.3 16.6Q20.3 15.2 18.2 16.6Q16 15.2 13.8 16.6Q11.7 15.2 9.7 16.6Q8 15.2 6 16.5Z'
    : 'M9 18.5Q8.6 5 16 5Q23.4 5 23 18.5Q21.4 17.2 19.8 18.6Q18 17.2 16 18.6Q14 17.2 12.2 18.6Q10.6 17.2 9 18.5Z';
  const tent = expanded ? [[9, 17, 7, 23, 9.5, 29], [13, 17.5, 11.5, 23.5, 13.5, 29.5], [19, 17.5, 20.5, 23.5, 18.5, 29.5], [23, 17, 25, 23, 22.5, 29]]
    : [[11.5, 19, 10.5, 24, 12, 30], [14.5, 19.5, 13.5, 25, 15, 31], [17.5, 19.5, 18.5, 25, 17, 31], [20.5, 19, 21.5, 24, 20, 30]];
  const ey = expanded ? 12.4 : 12.8;
  return [`<radialGradient id="g" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#f6c8ff" stop-opacity="0.7"/><stop offset="0.6" stop-color="#d6a6ff" stop-opacity="0.22"/><stop offset="1" stop-color="#c49aff" stop-opacity="0"/></radialGradient>`,
    `<circle cx="16" cy="15" r="16" fill="url(#g)"/>` +
    tent.map(([a, b, c2, d, e, g]) => `<path d="M${a} ${b}Q${c2} ${d} ${e} ${g}" fill="none" stroke="#c99ae8" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>`).join('') +
    `<path d="${bellD}" fill="${bell}" fill-opacity="0.92" stroke="${rim}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="${expanded ? 'M9.5 11.5Q11 8.4 14.5 8' : 'M11.2 11Q12 7.6 14.6 7'}" fill="none" stroke="${hi}" stroke-width="1.8" stroke-linecap="round"/>` +
    circ(13.4, ey, 1.1, '#4a2a6a') + circ(18.6, ey, 1.1, '#4a2a6a') + `<path d="M15 ${ey + 1.8}Q16 ${ey + 2.7} 17 ${ey + 1.8}" fill="none" stroke="#4a2a6a" stroke-width="0.9" stroke-linecap="round"/>` +
    ell(11.6, ey + 1.9, 1.3, 0.7, '#ff9ed0', ' opacity="0.8"') + ell(20.4, ey + 1.9, 1.3, 0.7, '#ff9ed0', ' opacity="0.8"')];
}
P.jelly_a = jelly(false); P.jelly_b = jelly(true);

// ---------- write ----------
for (const s of Object.keys(S)) {
  const d = path.join(OUT, 'seasons', s); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'water.svg'), waterSVG(s));
  fs.writeFileSync(path.join(d, 'far.svg'), farSVG(s));
  PREC = s === 'autumn' ? 1 : 10; fs.writeFileSync(path.join(d, 'mid.svg'), midSVG(s)); PREC = 10;
  fs.writeFileSync(path.join(d, 'floor.svg'), floorSVG(s));
  fs.writeFileSync(path.join(d, 'rays.svg'), raysSVG(s));
}
const pdir = path.join(OUT, 'particles'); fs.mkdirSync(pdir, { recursive: true });
for (const [k, v] of Object.entries(P)) { const [defs, body] = Array.isArray(v) ? v : ['', v]; fs.writeFileSync(path.join(pdir, k + '.svg'), svg(32, 32, body, defs)); }
console.log('written to', OUT);
