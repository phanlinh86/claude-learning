// Pip's Reef Tower: underwater seabed environment + particle art generator (original, procedurally laid out flat-cartoon
// SVGs).                                                                                                  (DESIGN §3, §4.3)
// Writes game/assets/default/env/{far,mid,ground}_{sunny,breezy,rain,rainbow}.svg, rock, jelly_ride, sun, rays, surface,
// rainbow, cloud_a..c, cloud_rain  and  game/assets/default/particles/{sparkle, sugar, wrapper_a, wrapper_b, blossom,
// raindrop, splash, puff, dust, confetti_a, confetti_b, star, bubble}.svg
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that may cross the left/right edge of a tileable file is drawn again at x±1200 (wrap()); edge
// curves are sums of sines with whole-number periods over 1200 px, so the left and right edges match exactly. The four
// moods share ONE layout per layer (same seed); colours change, breezy leans seaweed / sea fans to the right, rain mixes
// everything towards a grey-blue, rainbow brightens and lights a few glowing anemones.
// Colour rule (DESIGN §3): calm pastel (HSV saturation ≤ 0.45, checked below), paler than the answer colours; the far reef
// is a pale teal haze of the water colour, never blue-#3C8DE8-like. The mid layer's front band = GROUND[mood] exactly, so
// mid → ground has no visible seam and the renderer can fill any gap between them with GROUND[mood]; FARFILL[mood] = the
// far layer's bottom colour.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const TAU = Math.PI * 2;
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const f = n => (Math.round(n * 10) / 10).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
const cp = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn(x) at x, and again at x∓1200 when the object (half-width `half`) crosses an edge
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const lgr = (id, stops, extra = '') => `<linearGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const ridge = (x, base, comps) => comps.reduce((y, [a, k, p]) => y + a * Math.sin(TAU * k * x / W + p), base);
const hsvSat = h => { const c = hex(h), mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
const mound = (x, y0, w, h) => `M${f(x - w)} ${f(y0)}C${f(x - w * 0.92)} ${f(y0 - h * 1.32)} ${f(x + w * 0.92)} ${f(y0 - h * 1.32)} ${f(x + w)} ${f(y0)}Z`;
// group: translate to (x, by); lean = skewX degrees around the baseline (negative = top leans RIGHT)
const G = (x, by, body, lean = 0, sc = 1) => `<g transform="translate(${f(x)} ${f(by)})${lean ? ` skewX(${f(lean)})` : ''}${sc !== 1 ? ` scale(${f(sc)})` : ''}">${body}</g>`;
function star4(x, y, s, col, a) {
  return P(`M${f(x)} ${f(y - s)}Q${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s)} ${f(y)}Q${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x)} ${f(y + s)}Q${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s)} ${f(y)}Q${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x)} ${f(y - s)}Z`, col, ` opacity="${a}"`);
}

// ---------------- moods ----------------
// water gradient (ambient skyTop → skyBottom, DESIGN §3); the renderer paints it, the art is tuned against it
const SKY = { sunny: ['#7FD0E3', '#DDF4EC'], breezy: ['#88C7DA', '#D5EDE4'], rain: ['#6C93AB', '#BCD1D6'], rainbow: ['#86D2E8', '#E9F6EA'] };
const MOOD = {
  sunny: { tint: '#FFFFFF', amt: { far: 0, mid: 0, ground: 0 } },
  breezy: { tint: '#DDEBE8', amt: { far: 0.06, mid: 0.07, ground: 0.05 }, lean: -9 },
  rain: { tint: '#7F8EA2', amt: { far: 0.12, mid: 0.26, ground: 0.2 }, wet: true },
  rainbow: { tint: '#FFFFFF', amt: { far: 0, mid: 0.06, ground: 0.04 }, glint: true },
};
const BASE = {
  mid: {
    peach: '#EDC6B0', peachSh: '#DDAD97', peachLn: '#C2917D', peachHi: '#F8E2D4',
    lilac: '#D6CAE6', lilacSh: '#C0B2D6', lilacLn: '#A597C0', lilacHi: '#EDE7F5',
    sage: '#B7D6BC', sageSh: '#9EC3A6', sageLn: '#82A98C', sageHi: '#DCEDDD',
    weed: '#8FBF9F', weedSh: '#7AAC8B', weedLn: '#679679', weedHi: '#BEDCC6',
    mauve: '#DDBCD0', mauveSh: '#C9A2BA', mauveLn: '#B08AA2',
    stone: '#C9C3D6', stoneSh: '#B3ABC6', stoneLn: '#958CAD', stoneHi: '#E2DEEA',
    shell: '#F8E6D0', shellLn: '#D2B293', shellPk: '#F3D3C8', shellPkLn: '#CFA597',
    anchor: '#B9B5C8', anchorSh: '#A39EB6', anchorLn: '#857F9C',
    anem: '#F0CDB9', anemLn: '#CFA28B', anemTip: '#FBEADF',
  },
  ground: { base: '#F1E2BE', front: '#E3CC9C', lip: '#F8EED6', rim: '#E0C996', ripple: '#E2CD9F', rippleHi: '#FAF2DE',
    shell: '#F8E7D4', shellLn: '#C9A887', shellPk: '#F4D6CB', shellPkLn: '#C99D90', peb: '#D9D3E0', pebLn: '#ACA4BE', pebB: '#CFD9CF', pebBLn: '#9FB0A3' },
};
function pal(m, layer) {
  const M = MOOD[m], o = {};
  for (const [k, v] of Object.entries(BASE[layer])) {
    let c = mix(v, M.tint, M.amt[layer]);
    if (layer === 'mid') c = mix(c, SKY[m][1], 0.1); // a touch of water haze
    o[k] = c;
  }
  return o;
}
// far reef: three rows of pale teal-sage silhouettes, mixed from the water's bottom colour
const FARDEEP = ['#73B3B0', '#86B7A3', '#7EAFB0'];
const farCol = (m, row) => { const base = SKY[m][1], t = [0.2, 0.3, 0.4][row]; return mix(mix(base, FARDEEP[row], t), MOOD[m].tint, MOOD[m].amt.far); };
const GROUND = Object.fromEntries(MOODS.map(m => [m, pal(m, 'ground').base]));
const FARFILL = Object.fromEntries(MOODS.map(m => [m, farCol(m, 2)]));

// ---------------- shared seabed shapes (origin = base centre, y up is negative) ----------------
function blade(h, wid, amp, ph, lean) { // one tapered wavy seaweed blade: returns a closed path
  const n = 14, L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = -h * t, x = amp * Math.sin(ph + t * 5.2) * t + lean * h * t * t, w = wid * (1 - t * 0.85) * (0.75 + 0.25 * Math.sin(t * 9 + ph));
    L.push([x - w / 2, y]); R.push([x + w / 2, y]);
  }
  const tip = [L[n][0] / 2 + R[n][0] / 2, -h - 6];
  return poly([...L, tip, ...R.reverse()]);
}
function seaweed(C, s, lean) { // a clump of 3–5 blades; s = { h, n, seed }
  const r = rng(s.seed); let o = '';
  for (let i = 0; i < s.n; i++) {
    const h = s.h * (0.6 + r() * 0.4), off = (i - (s.n - 1) / 2) * 9, d = blade(h, 15 + r() * 6, 8 + r() * 6, r() * 6, lean + (r() - 0.5) * 0.12);
    const back = i % 2 === 0;
    o += `<g transform="translate(${f(off)} 0)">` + P(d, back ? C.weedSh : C.weed, ` stroke="${C.weedLn}" stroke-width="2.5" stroke-linejoin="round"`) + '</g>';
  }
  return o;
}
function branchCoral(C, s, k) { // rounded branching coral: thick strokes with round tips; k = colour key
  const r = rng(s.seed), segs = [];
  const grow = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    segs.push([x, y, x2, y2, w]);
    if (d <= 0) return;
    const n = d > 2 ? 2 : (r() < 0.6 ? 2 : 1);
    for (let i = 0; i < n; i++) grow(x2, y2, a + (n === 1 ? (r() - 0.5) * 0.5 : (i ? 0.45 : -0.45) + (r() - 0.5) * 0.3), len * (0.68 + r() * 0.12), w * 0.8, d - 1);
  };
  grow(0, 0, -Math.PI / 2, s.h * 0.36, s.w, 3);
  const d = segs.map(([a, b, c, e]) => `M${f(a)} ${f(b)}L${f(c)} ${f(e)}`);
  let o = '';
  // outline, fill, highlight per width group (thick first)
  o += segs.map(([a, b, c, e, w]) => strokeP(`M${f(a)} ${f(b)}L${f(c)} ${f(e)}`, C[k + 'Ln'], w + 5)).join('');
  o += segs.map(([a, b, c, e, w]) => strokeP(`M${f(a)} ${f(b)}L${f(c)} ${f(e)}`, C[k], w)).join('');
  o += segs.filter(sg => sg[4] > 9).map(([a, b, c, e, w]) => strokeP(`M${f(a - w * 0.22)} ${f(b)}L${f(c - w * 0.22)} ${f(e)}`, C[k + 'Hi'], Math.max(2, w * 0.22), ' opacity="0.8"')).join('');
  void d;
  return o;
}
function brainCoral(C, s, k) { // a rounded mound with soft groove lines
  const w = s.w, h = s.h;
  let o = P(mound(0, 0, w, h), C[k], ` stroke="${C[k + 'Ln']}" stroke-width="3" stroke-linejoin="round"`);
  o += P(`M${f(w * 0.25)} -2C${f(w * 0.5)} ${f(-h * 0.5)} ${f(w * 0.55)} ${f(-h * 0.9)} ${f(w * 0.2)} ${f(-h * 1.0)}C${f(w * 0.8)} ${f(-h * 0.95)} ${f(w * 0.98)} ${f(-h * 0.4)} ${f(w - 2)} -2Z`, C[k + 'Sh'], ' opacity="0.7"');
  let g = '';
  for (let i = 1; i <= 3; i++) {
    const yy = -h * (0.22 + i * 0.2), ww = w * (0.95 - i * 0.2);
    g += `M${f(-ww)} ${f(yy + h * 0.12)}`;
    for (let q = 0; q < 6; q++) { const x0 = -ww + q * 2 * ww / 6; g += `Q${f(x0 + ww / 6)} ${f(yy + (q % 2 ? 7 : -7))} ${f(x0 + 2 * ww / 6)} ${f(yy + (q === 5 ? h * 0.12 : 0))}`; }
  }
  o += strokeP(g, C[k + 'Ln'], 2.2, ' opacity="0.55"');
  o += ell(-w * 0.4, -h * 0.82, w * 0.2, h * 0.12, C[k + 'Hi'], ` opacity="0.85" transform="rotate(-25 ${f(-w * 0.4)} ${f(-h * 0.82)})"`);
  return o;
}
function tubes(C, s, k) { // a cluster of soft tube sponges
  const r = rng(s.seed); let o = '';
  const list = [[-22, 0.72, 13], [0, 1, 15], [21, 0.82, 12], [38, 0.5, 10]].slice(0, s.n);
  for (const [x, hk, rw] of list) {
    const h = s.h * hk * (0.9 + r() * 0.2);
    o += P(`M${f(x - rw)} 0V${f(-h + 4)}Q${f(x - rw)} ${f(-h - 4)} ${f(x)} ${f(-h - 4)}Q${f(x + rw)} ${f(-h - 4)} ${f(x + rw)} ${f(-h + 4)}V0Z`, C[k], ` stroke="${C[k + 'Ln']}" stroke-width="3" stroke-linejoin="round"`);
    o += P(`M${f(x + rw * 0.25)} -2V${f(-h + 2)}H${f(x + rw - 2)}V-2Z`, C[k + 'Sh'], ' opacity="0.7"');
    o += ell(x, -h + 1, rw * 0.72, 4.2, C[k + 'Ln'], ' opacity="0.75"');
    o += strokeP(`M${f(x - rw * 0.55)} ${f(-h + 10)}V${f(-h * 0.45)}`, C[k + 'Hi'], 3, ' opacity="0.8"');
  }
  return o;
}
function seaFan(C, s, lean) { // a flat lattice fan on a short stem
  const R = s.h * 0.62, cy = -s.h * 0.42, k = s.k;
  const fan = [];
  for (let i = 0; i <= 20; i++) { const a = Math.PI * (1.08 + 0.84 * i / 20), rr = R * (0.88 + 0.12 * Math.sin(i * 1.7 + s.seed)); fan.push([Math.cos(a) * rr * 0.95, cy + Math.sin(a) * rr]); }
  let o = '';
  o += P(poly([[0, cy + R * 0.25], ...fan]), C[k], ` stroke="${C[k + 'Ln']}" stroke-width="3" stroke-linejoin="round" opacity="0.92"`);
  let lat = '';
  for (let i = 1; i < 20; i += 2) { const [x, y] = fan[i]; lat += `M0 ${f(cy + R * 0.18)}Q${f(x * 0.3)} ${f(cy + (y - cy) * 0.45)} ${f(x * 0.92)} ${f(cy + (y - cy) * 0.92)}`; }
  for (let ring = 1; ring <= 3; ring++) { const t = ring / 4; lat += line(fan.slice(2, 19).map(([x, y]) => [x * t * 1.02, cy + (y - cy) * t + R * 0.18 * (1 - t)])); }
  o += strokeP(lat, C[k + 'Sh'], 2.2);
  o += strokeP(`M0 0Q2 ${f(cy * 0.5)} 0 ${f(cy + R * 0.2)}`, C[k + 'Ln'], 6) + strokeP(`M0 0Q2 ${f(cy * 0.5)} 0 ${f(cy + R * 0.2)}`, C[k + 'Sh'], 3);
  void lean;
  return o;
}
function scallop(x, y, s, fill, ln, rot = 0) { // small scallop shell (fan with ridges), base at (x,y)
  let d = `M${f(-3 * s)} 0`;
  const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.08 + 0.84 * i / 8); pts.push([Math.cos(a) * 11 * s, -3 * s + Math.sin(a) * 11 * s]); }
  d = poly([[-3 * s, 0], ...pts, [3 * s, 0]]);
  let ridges = ''; for (let i = 1; i < 8; i += 1) ridges += `M0 ${f(-1 * s)}L${f(pts[i][0] * 0.85)} ${f(-3 * s + (pts[i][1] + 3 * s) * 0.85)}`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">` + P(d, fill, ` stroke="${ln}" stroke-width="${f(1.8 * Math.max(0.8, s))}" stroke-linejoin="round"`) +
    strokeP(ridges, ln, 1.2 * Math.max(0.8, s), ' opacity="0.6"') + P(`M${f(-4 * s)} 0h${f(8 * s)}v${f(2.5 * s)}h${f(-8 * s)}Z`, fill, ` stroke="${ln}" stroke-width="1.4"`) + '</g>';
}
function snail(x, y, s, fill, ln) { // small spiral shell
  const pts = []; for (let t = 0; t <= 1; t += 0.05) { const a = t * TAU * 2.2, r = 1 + t * 8 * s; pts.push([Math.cos(a) * r, -8 * s + Math.sin(a) * r]); }
  return `<g transform="translate(${f(x)} ${f(y)})">` + P(`M${f(-9 * s)} 0C${f(-11 * s)} ${f(-18 * s)} ${f(10 * s)} ${f(-19 * s)} ${f(10 * s)} ${f(-6 * s)}L${f(14 * s)} 0Z`, fill, ` stroke="${ln}" stroke-width="1.8" stroke-linejoin="round"`) +
    strokeP(line(pts), ln, 1.3, ' opacity="0.7"') + '</g>';
}
function rockShells(C, s) { // a rounded stone with a couple of shells
  const w = s.w, h = s.h;
  let o = P(`M${f(-w)} 0C${f(-w * 1.02)} ${f(-h * 0.8)} ${f(-w * 0.5)} ${f(-h * 1.08)} ${f(w * 0.05)} ${f(-h)}C${f(w * 0.7)} ${f(-h * 0.95)} ${f(w * 1.05)} ${f(-h * 0.55)} ${f(w)} 0Z`, C.stone, ` stroke="${C.stoneLn}" stroke-width="3" stroke-linejoin="round"`);
  o += P(`M${f(w * 0.2)} -2C${f(w * 0.6)} ${f(-h * 0.3)} ${f(w * 0.5)} ${f(-h * 0.8)} ${f(w * 0.25)} ${f(-h * 0.95)}C${f(w * 0.75)} ${f(-h * 0.9)} ${f(w * 1.02)} ${f(-h * 0.5)} ${f(w - 2)} -2Z`, C.stoneSh, ' opacity="0.8"');
  o += ell(-w * 0.45, -h * 0.7, w * 0.22, h * 0.12, C.stoneHi, ` opacity="0.9" transform="rotate(-20 ${f(-w * 0.45)} ${f(-h * 0.7)})"`);
  o += circ(-w * 0.1, -h * 0.45, 2.5, C.stoneSh) + circ(w * 0.35, -h * 0.3, 2, C.stoneSh) + circ(-w * 0.55, -h * 0.25, 1.8, C.stoneSh);
  if (s.shell) o += scallop(-w * 0.15, -h * 0.98, 0.9, C.shellPk, C.shellPkLn, -12);
  o += snail(w * 0.85, 2, 0.8, C.shell, C.shellLn);
  return o;
}
function anchorArt(C) { // a small sunken anchor, tilted, half in the sand
  let o = '<g transform="rotate(-18)">';
  const ln = C.anchorLn, fl = C.anchor;
  // ring
  o += circ(0, -86, 9, 'none', ` stroke="${ln}" stroke-width="9"`) + circ(0, -86, 9, 'none', ` stroke="${fl}" stroke-width="4.5"`);
  // shank + stock
  const shank = 'M0 -76V-6', stock = 'M-20 -64H20';
  o += strokeP(shank + stock, ln, 13) + strokeP(shank + stock, fl, 8);
  // arms
  const arms = 'M-34 -26Q-30 0 0 -4Q30 0 34 -26';
  o += strokeP(arms, ln, 13) + strokeP(arms, fl, 8);
  o += P('M-34 -36L-44 -22L-28 -22Z', fl, ` stroke="${ln}" stroke-width="3" stroke-linejoin="round"`) + P('M34 -36L44 -22L28 -22Z', fl, ` stroke="${ln}" stroke-width="3" stroke-linejoin="round"`);
  o += strokeP('M-2 -72V-12', '#FFFFFF', 2.5, ' opacity="0.45"');
  o += '</g>';
  return o;
}
function anemone(C, s, glow) { // a little anemone: body + soft tentacles; glow → light tips with halos (rainbow)
  let o = P(`M-12 0C-14 -10 -10 -16 0 -16C10 -16 14 -10 12 0Z`, C.anem, ` stroke="${C.anemLn}" stroke-width="2.5"`);
  let t = '', tips = '';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.3, L = s * (0.8 + (i % 3) * 0.12), x1 = Math.cos(a) * 6, y1 = -15 + Math.sin(a) * 2, x2 = Math.cos(a) * L, y2 = -15 + Math.sin(a) * L;
    t += `M${f(x1)} ${f(y1)}Q${f((x1 + x2) / 2 + (i % 2 ? 3 : -3))} ${f((y1 + y2) / 2)} ${f(x2)} ${f(y2)}`;
    tips += cp(x2, y2, 3.2);
  }
  o = strokeP(t, C.anemLn, 7.5) + strokeP(t, C.anem, 4.5) + o;
  if (glow) {
    let halos = ''; for (let i = 0; i < 9; i += 2) { const a = -Math.PI / 2 + (i - 4) * 0.3, L = s * (0.8 + (i % 3) * 0.12); halos += circ(Math.cos(a) * L, -15 + Math.sin(a) * L, 9, 'url(#gl)'); }
    o = halos + o;
  }
  o += P(tips, glow ? '#FFFDF7' : C.anemTip);
  return o;
}

// ================= far_<m>.svg (0 0 1200 420): hazy distant reef silhouettes =================
function farLayout() {
  const r = rng(411), rows = [];
  const spec = [[250, 7], [306, 8], [356, 9]];
  spec.forEach(([y0, n], ri) => {
    const items = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * W / n + (r() - 0.5) * 60, kind = ['mound', 'branch', 'kelp', 'mound', 'tube', 'fan'][(i * 2 + ri) % 6];
      items.push({ x, kind, s: 0.7 + r() * 0.5, seed: 1000 + ri * 50 + i });
    }
    rows.push({ y0, items, comps: [[6, 2, ri * 1.7], [4, 5, 0.6 + ri], [2, 9, 2.1]] });
  });
  return rows;
}
const FAR = farLayout();
function farSil(it, col, lean) { // single-colour silhouette at baseline 0
  const s = it.s, r = rng(it.seed);
  switch (it.kind) {
    case 'mound': { let o = P(mound(0, 4, 70 * s, 46 * s), col); o += P(mound(-40 * s, 4, 38 * s, 30 * s), col) + P(mound(46 * s, 4, 30 * s, 22 * s), col); return o; }
    case 'branch': {
      const segs = []; const grow = (x, y, a, len, w, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; segs.push(`M${f(x)} ${f(y)}L${f(x2)} ${f(y2)}`); if (d > 0) for (const sg of [-0.5, 0.45]) grow(x2, y2, a + sg + (r() - 0.5) * 0.3, len * 0.72, w * 0.8, d - 1); };
      grow(0, 4, -Math.PI / 2, 48 * s, 14, 3);
      return strokeP(segs.join(''), col, 13 * s) + P(mound(0, 6, 34 * s, 12 * s), col);
    }
    case 'kelp': { let o = ''; for (let i = 0; i < 3; i++) o += `<g transform="translate(${f((i - 1) * 12)} 4)">` + P(blade(140 * s * (0.7 + 0.15 * i), 13, 10, i * 2, lean), col) + '</g>'; return o; }
    case 'tube': { let o = ''; for (const [x, hk, rw, bend] of [[-22, 0.55, 6, -6], [-8, 0.85, 7, -3], [6, 1, 7.5, 2], [19, 0.7, 6, 6], [30, 0.45, 5, 9]]) { const h = 90 * s * hk, tx = x + bend + lean * 30; o += strokeP(`M${f(x)} 4Q${f(x)} ${f(-h * 0.5)} ${f(tx)} ${f(-h)}`, col, rw * 2) + ell(tx, -h - 2, rw * 1.3, rw * 0.7, col); } return o + P(mound(4, 6, 40 * s, 10 * s), col); }
    case 'fan': { const R = 62 * s, pts = [[0, 4]]; for (let i = 0; i <= 14; i++) { const a = Math.PI * (1.1 + 0.8 * i / 14); pts.push([Math.cos(a) * R + lean * 40 * s, -R * 0.55 + Math.sin(a) * R * (0.92 + 0.08 * Math.sin(i * 2))]); } return P(poly(pts), col, ' opacity="0.9"') + strokeP(`M0 4L${f(lean * 20 * s)} ${f(-R * 0.5)}`, col, 6); }
  }
  return '';
}
function genFar(m) {
  const M = MOOD[m], lean = M.lean ? -0.12 * Math.sign(M.lean) : 0; // breezy: kelp/fans lean right
  let o = '';
  FAR.forEach((row, ri) => {
    const col = farCol(m, ri);
    for (const it of row.items) o += wrap(it.x, 120, x => G(x, ridge(x, row.y0, row.comps), farSil(it, col, lean)));
    const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, ridge(x, row.y0, row.comps)]);
    o += P(line(pts) + `L${W} 420L0 420Z`, col);
    // a faint light rim on the back rows (sunlight from above)
    if (ri < 2) o += strokeP(line(pts.map(([x, y]) => [x, y + 2])), mix(col, '#FFFFFF', 0.25), 2, ' opacity="0.6"');
  });
  if (M.glint) { const r = rng(7); for (let i = 0; i < 12; i++) { const x = r() * W, y = 170 + r() * 150, sz = 3 + r() * 3; o += wrap(x, 6, xx => star4(xx, y, sz, '#FFFFFF', 0.7)); } }
  return svg(1200, 420, o);
}

// ================= mid_<m>.svg (0 0 1200 380): coral mounds, sea fans, seaweed, rocks with shells, a little anchor ======
const BASEY = 272; // where everything stands (in landscape the ground tile's edge hides ~10 px below this)
const MID = {
  back: [
    { t: 'weed', x: 36, h: 172, n: 5, seed: 11 }, { t: 'fan', x: 292, h: 150, k: 'mauve', seed: 2 }, { t: 'branch', x: 548, h: 150, w: 17, k: 'peach', seed: 31 },
    { t: 'weed', x: 800, h: 190, n: 4, seed: 12 }, { t: 'fan', x: 1052, h: 136, k: 'lilac', seed: 5 }, { t: 'branch', x: 1138, h: 118, w: 14, k: 'lilac', seed: 33 },
    { t: 'weed', x: 456, h: 120, n: 3, seed: 13 }, { t: 'branch', x: 186, h: 104, w: 13, k: 'sage', seed: 35 },
  ],
  front: [
    { t: 'brain', x: 118, w: 54, h: 42, k: 'peach' }, { t: 'tubes', x: 214, h: 72, n: 3, k: 'lilac', seed: 3 }, { t: 'rock', x: 384, w: 46, h: 40, shell: true },
    { t: 'brain', x: 652, w: 62, h: 46, k: 'sage' }, { t: 'anchor', x: 728 }, { t: 'tubes', x: 888, h: 62, n: 4, k: 'peach', seed: 4 },
    { t: 'rock', x: 972, w: 38, h: 32 }, { t: 'anem', x: 160, s: 30 }, { t: 'anem', x: 598, s: 28 }, { t: 'anem', x: 1010, s: 32 }, { t: 'anem', x: 1180, s: 26 },
    { t: 'weed', x: 330, h: 70, n: 3, seed: 14 }, { t: 'weed', x: 1100, h: 80, n: 3, seed: 15 },
  ],
  pebbles: Array.from({ length: 15 }, (_, i) => { const r = rng(900 + i); return { x: i * W / 15 + r() * 40, r: 4 + r() * 5, k: i % 3 }; }),
};
const frontEdge = x => ridge(x, BASEY + 6, [[3, 2, 1.3], [2, 5, 0.4], [1, 9, 2.0]]);
function midItem(C, it, M) {
  const lean = M.lean || 0, leanK = lean ? -0.22 : 0;
  switch (it.t) {
    case 'weed': return seaweed(C, it, leanK);
    case 'fan': return `<g transform="skewX(${f(lean * 1.1)})">${seaFan(C, it, lean)}</g>`;
    case 'branch': return `<g transform="skewX(${f(lean * 0.35)})">${branchCoral(C, it, it.k)}</g>`;
    case 'brain': return brainCoral(C, it, it.k);
    case 'tubes': return tubes(C, it, it.k);
    case 'rock': return rockShells(C, it);
    case 'anchor': return anchorArt(C) + `<g transform="translate(26 0)">${seaweed(C, { h: 60, n: 2, seed: 77 }, leanK)}</g>`;
    case 'anem': return `<g transform="skewX(${f(lean * 0.8)})${M.glint ? ' scale(1.3)' : ''}">${anemone(C, it.s, M.glint)}</g>`;
  }
  return '';
}
function genMid(m) {
  const C = pal(m, 'mid'), Gp = pal(m, 'ground'), M = MOOD[m];
  let o = '', defs = '';
  if (M.glint) defs += rg('gl', [[0, '#FFFFFF', 0.9], [0.5, '#FFF6EE', 0.35], [1, '#FFF6EE', 0]]);
  for (const it of MID.back) o += wrap(it.x, 100, x => G(x, BASEY + 4, midItem(C, it, M)));
  for (const it of MID.front) o += wrap(it.x, 80, x => G(x, BASEY + 6, midItem(C, it, M)));
  // front band = the ground colour (seamless into ground_<m>), a soft light lip
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, frontEdge(x)]);
  o += P(line(pts) + `L${W} 380L0 380Z`, Gp.base) + strokeP(line(pts), Gp.lip, 3, ' opacity="0.9"');
  for (const p of MID.pebbles) o += wrap(p.x, p.r, x => ell(x, frontEdge(x) + 3, p.r, p.r * 0.55, [Gp.peb, Gp.pebB, Gp.rim][p.k], ` stroke="${[Gp.pebLn, Gp.pebBLn, Gp.ripple][p.k]}" stroke-width="1.5"`));
  if (M.glint) { const r = rng(17); for (let i = 0; i < 10; i++) { const x = r() * W, y = 120 + r() * 130, sz = 3 + r() * 3; o += wrap(x, 6, xx => star4(xx, y, sz, '#FFFFFF', 0.85)); } }
  return svg(1200, 380, o, defs);
}

// ================= ground_<m>.svg (0 0 1200 260): smooth pale sand floor =================
const edgeY = x => ridge(x, 36, [[4, 2, 0.7], [3, 3, 1.9], [1.5, 7, 0.3]]);
function groundLayout() {
  const r = rng(533), deco = [];
  // decorations only in the band just under the edge (y 52..94) and the very front strip (y > 240): the middle stays calm
  for (let i = 0; i < 16; i++) deco.push({ x: (i + r()) * W / 16, y: 54 + r() * 36, k: ['scallop', 'peb', 'pebB', 'snail'][i % 4], rot: (r() - 0.5) * 50, s: 0.8 + r() * 0.4 });
  for (let i = 0; i < 8; i++) deco.push({ x: (i + r()) * W / 8, y: 246 + r() * 8, k: ['peb', 'scallop', 'pebB', 'peb'][i % 4], rot: (r() - 0.5) * 50, s: 0.9 + r() * 0.3 });
  const ripples = []; for (let i = 0; i < 18; i++) ripples.push({ x: r() * W, y: [62, 76, 92][i % 3] + r() * 8, len: 50 + r() * 70 });
  for (let i = 0; i < 8; i++) ripples.push({ x: r() * W, y: 238 + r() * 14, len: 60 + r() * 80 });
  const glints = []; for (let i = 0; i < 12; i++) glints.push({ x: r() * W, y: 52 + r() * 46, s: 3 + r() * 3 });
  return { deco, ripples, glints };
}
const GRD = groundLayout();
function genGround(m) {
  const C = pal(m, 'ground'), M = MOOD[m], L = GRD;
  let o = '', defs = '';
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, edgeY(x)]);
  o += P(line(pts) + `L${W} 260L0 260Z`, C.base);
  o += strokeP(line(pts.map(([x, y]) => [x, y + 6])), C.rim, 4, ' opacity="0.45"');
  o += strokeP(line(pts), C.lip, 5);
  // very soft depth gradient towards the front; the middle band stays plain
  defs += lgr('gd', [[0, C.front, 0], [1, C.front, 0.9]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="140" width="${W}" height="120" fill="url(#gd)"/>`;
  // gentle sand ripples (short wavy dashes), only near the back edge and the very front
  let rp = '', rh = '';
  for (const q of L.ripples) o += '', rp += wrap(q.x, q.len / 2 + 4, x => { const a = x - q.len / 2; let d = `M${f(a)} ${f(q.y)}`; for (let k = 0; k < 3; k++) d += `q${f(q.len / 6)} -4 ${f(q.len / 3)} 0`; return d; }),
    rh += wrap(q.x, q.len / 2 + 4, x => `M${f(x - q.len / 2 + 4)} ${f(q.y - 2.5)}q${f(q.len / 6)} -4 ${f(q.len / 3)} 0`);
  o += strokeP(rh, C.rippleHi, 2, ' opacity="0.8"') + strokeP(rp, C.ripple, 2.4, ' opacity="0.9"');
  // a few faint wide sheen ovals (smooth sand)
  for (const [px, py, rx, ry] of [[220, 150, 200, 14], [780, 166, 240, 16], [1090, 140, 150, 11]]) o += wrap(px, rx, x => ell(x, py, rx, ry, C.lip, ' opacity="0.4"'));
  // shells and pebbles
  for (const d of L.deco) o += wrap(d.x, 16, x => {
    switch (d.k) {
      case 'scallop': return scallop(x, d.y + 4, d.s, d.y > 200 ? C.shellPk : C.shell, d.y > 200 ? C.shellPkLn : C.shellLn, d.rot);
      case 'snail': return snail(x, d.y + 4, d.s * 0.8, C.shell, C.shellLn);
      case 'peb': return ell(x, d.y, 7 * d.s, 4.2 * d.s, C.peb, ` stroke="${C.pebLn}" stroke-width="1.6"`) + ell(x - 2 * d.s, d.y - 1.5 * d.s, 2.5 * d.s, 1.1 * d.s, '#FFFFFF', ' opacity="0.6"');
      default: return ell(x, d.y, 5.5 * d.s, 3.6 * d.s, C.pebB, ` stroke="${C.pebBLn}" stroke-width="1.5"`);
    }
  });
  if (M.wet) { // rain: a darker, damp sheen
    let st = ''; for (const [x, y, l] of [[90, 150, 120], [520, 170, 160], [880, 140, 110], [1100, 200, 90], [300, 208, 100]]) st += `M${x} ${y}h${l}`;
    o += strokeP(st, '#FFFFFF', 3, ' opacity="0.16"');
  }
  if (M.glint) for (const g of L.glints) o += wrap(g.x, g.s, x => star4(x, g.y, g.s, '#FFFFFF', 0.85));
  return svg(1200, 260, o, defs);
}

// ================= rock.svg (0 0 260 120): flat seabed rock; top surface y = 18 across x 20–240; anchor (130,116) ========
function genRock() {
  const c = { st: '#C9C3D6', sh: '#B7AFC9', dk: '#A79FBA', ln: '#857C9C', top: '#DDD8E7', hi: '#F0EDF5', sand: '#F1E2BE', sandLn: '#D8C291',
    grass: '#8FBF9F', grassLn: '#679679', shell: '#F8E6D0', shellLn: '#C8A584' };
  const body = 'M20 18H240Q251 19 252 30C258 42 249 52 254 64C259 80 250 96 238 106Q226 117 204 115Q170 119 130 116Q92 119 58 115Q34 116 22 106C9 96 1 80 7 64C11 52 2 42 9 30Q10 19 20 18Z';
  const defs = `<clipPath id="rk"><path d="${body}"/></clipPath>`;
  let o = ell(130, 116, 122, 5, '#6E6A7E', ' opacity="0.18"');
  // sea grass tufts behind the rock ends (outside the block footprint x 53–207)
  const grass = (x, dir, h, seed) => { const r = rng(seed); let g = ''; for (let i = 0; i < 3; i++) g += `<g transform="translate(${f(x + i * 7 * dir)} 46)">` + P(blade(h * (0.7 + 0.2 * i), 9, 4, r() * 6, -0.25 * dir), i === 1 ? c.grass : '#7FB18F', ` stroke="${c.grassLn}" stroke-width="2" stroke-linejoin="round"`) + '</g>'; return g; };
  o += grass(10, 1, 40, 5) + grass(250, -1, 34, 6);
  o += P(body, c.st);
  o += `<g clip-path="url(#rk)">`;
  o += P('M168 18H260V120H150C176 96 184 60 168 18Z', c.sh, ' opacity="0.85"');
  o += P('M0 84Q130 100 260 84V120H0Z', c.dk, ' opacity="0.75"');
  o += P('M0 18H260V30Q130 40 0 30Z', c.top); // the flat top face
  o += strokeP('M14 30Q130 40 246 30', c.dk, 2.4, ' opacity="0.55"');
  o += ell(48, 52, 18, 7, c.hi, ' opacity="0.7" transform="rotate(-12 48 52)"');
  o += P(cp(96, 60, 3) + cp(150, 74, 2.5) + cp(186, 56, 3.4) + cp(118, 90, 2.2) + cp(206, 86, 2.6) + cp(40, 80, 2.4), c.dk, ' opacity="0.7"');
  o += strokeP('M66 22H112M150 23H200', c.hi, 3, ' opacity="0.9"');
  o += strokeP('M226 40L216 56L222 66M30 96L44 86', c.ln, 2.2, ' opacity="0.6"');
  o += P('M8 40Q20 34 34 40Q30 48 22 50Q14 54 6 50Z', '#A9CDB2', ' opacity="0.9"') + P(cp(14, 44, 2) + cp(26, 43, 1.6), '#CFE6D4');
  o += '</g>';
  o += P(body, 'none', ` stroke="${c.ln}" stroke-width="4" stroke-linejoin="round"`);
  // sand heaped at the foot so it sits in the seabed
  o += P('M2 118Q14 102 34 108Q48 100 62 112Q70 117 76 120H0Z', c.sand, ` stroke="${c.sandLn}" stroke-width="2"`) + P('M258 118Q246 100 224 108Q208 101 196 113Q190 117 184 120H260Z', c.sand, ` stroke="${c.sandLn}" stroke-width="2"`);
  // a shell and a tiny snail on the front
  o += scallop(78, 100, 1.15, '#F4D6CB', '#C99D90', -8);
  o += snail(206, 104, 0.85, c.shell, c.shellLn);
  return svg(260, 120, o, defs);
}

// ================= jelly_ride.svg (0 0 200 200): friendly pink jellyfish; the crown sits on (100, 30) =================
function genJelly() {
  const c = { a: '#F6D3EA', b: '#E2AACB', ln: '#C78AAF', hi: '#FFF4FB', in: '#FBE6F3', eye: '#4B3550', cheek: '#F39DBE', tent: '#EBB9D6', tentLn: '#CE93B6' };
  const defs = lgr('jb', [[0, '#FBE4F3'], [1, c.b]], ' x1="0" y1="0" x2="0" y2="1"');
  let o = '';
  // tentacles: 4 thin wavy ones + 3 frilly oral arms (behind the bell)
  let thin = '';
  for (const [x, ph, L] of [[48, 0, 78], [78, 1.3, 88], [122, 2.4, 86], [152, 0.7, 74]]) {
    const pts = []; for (let t = 0; t <= 1; t += 0.05) pts.push([x + 7 * Math.sin(ph + t * 9) * t + (x - 100) * 0.12 * t, 106 + L * t]);
    thin += line(pts);
  }
  o += strokeP(thin, c.tentLn, 6) + strokeP(thin, c.tent, 3.2);
  for (const [x, L, ph] of [[84, 58, 0.5], [100, 70, 2.6], [116, 56, 4.4]]) {
    const Lf = [], Rt = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, y = 104 + L * t, cx = x + 4 * Math.sin(ph + t * 4.5) * t, w = 7.5 * (1 - t * 0.7) + 1.4 * Math.sin(t * 14 + ph); Lf.push([cx - w, y]); Rt.push([cx + w, y]); }
    o += P(poly([...Lf, ...Rt.reverse()]), c.a, ` stroke="${c.tentLn}" stroke-width="2.4" stroke-linejoin="round" opacity="0.95"`);
  }
  // bell: dome from (30,100) up to the top centre (100,30), scalloped skirt at the bottom
  let skirt = ''; const n = 6; for (let i = n; i > 0; i--) { const x1 = 30 + 140 * (i - 1) / n; skirt += `Q${f(30 + 140 * (i - 0.5) / n)} ${i % 2 ? 118 : 114} ${f(x1)} 104`; }
  const bell = `M30 104C26 62 56 30 100 30C144 30 174 62 170 104${skirt}Z`;
  o += P(bell, 'url(#jb)', ' opacity="0.96"');
  o += P('M48 98C48 66 70 46 100 46C130 46 152 66 152 98Z', c.in, ' opacity="0.55"');
  o += P(bell, 'none', ` stroke="${c.ln}" stroke-width="4" stroke-linejoin="round"`);
  o += strokeP('M40 100Q100 92 160 100', c.ln, 2.4, ' opacity="0.45"');
  // spots + gloss
  o += P(cp(64, 56, 4) + cp(140, 60, 3.4) + cp(150, 82, 2.6) + cp(52, 82, 2.8) + cp(118, 44, 2.4), c.hi, ' opacity="0.85"');
  o += ell(66, 48, 16, 7, c.hi, ' opacity="0.9" transform="rotate(-30 66 48)"');
  // face
  for (const x of [80, 120]) o += ell(x, 74, 7.5, 9, c.eye) + circ(x - 2.5, 70, 3.2, '#FFFFFF') + circ(x + 2.6, 77.5, 1.4, '#FFFFFF');
  o += ell(66, 86, 8, 5, c.cheek, ' opacity="0.7"') + ell(134, 86, 8, 5, c.cheek, ' opacity="0.7"');
  o += P('M91 86Q100 96 109 86Q100 90 91 86Z', '#9C5577', ` stroke="#9C5577" stroke-width="2.6" stroke-linejoin="round"`);
  // the little "seat" at the top: a soft highlight where the crown rests
  o += ell(100, 33, 14, 3, c.hi, ' opacity="0.8"');
  return svg(200, 200, o, defs);
}

// ================= sun (glow), rays, surface, rainbow, light patches =================
function genSun() {
  const defs = rg('glow', [[0, '#FFFDF0', 0.95], [0.25, '#FFF8DA', 0.75], [0.55, '#FFF5D0', 0.3], [1, '#FFF5D0', 0]]);
  let o = circ(100, 100, 100, 'url(#glow)');
  o += circ(100, 100, 30, '#FFFEF6', ' opacity="0.7"');
  return svg(200, 200, o, defs);
}
function genRays() { // 5 soft diagonal shafts of light from the surface, fading downwards
  const defs = lgr('rf', [[0, '#FFFFFF', 0.34], [0.45, '#FFFFFF', 0.16], [1, '#FFFFFF', 0]], ' x1="0" y1="0" x2="0" y2="700" gradientUnits="userSpaceOnUse"') +
    '<filter id="bl" x="-10%" y="-5%" width="120%" height="110%"><feGaussianBlur stdDeviation="6"/></filter>';
  const rays = [[150, 34, 90, 0.9], [235, 22, 60, 0.7], [300, 46, 120, 1], [390, 26, 74, 0.75], [450, 38, 100, 0.85]];
  let o = '<g filter="url(#bl)">';
  for (const [x, wt, wb, a] of rays) { const sh = 150; o += P(poly([[x - wt / 2, 0], [x + wt / 2, 0], [x + sh + wb / 2, 700], [x + sh - wb / 2, 700]]), 'url(#rf)', ` opacity="${a}"`); }
  return svg(600, 700, o + '</g>', defs);
}
const surfY = x => ridge(x, 40, [[6, 3, 0.4], [3, 7, 1.1], [1.6, 13, 2.3]]);
function genSurface() { // the wavy underside of the water surface (top of the screen), transparent below
  const defs = lgr('sf', [[0, '#F4FFFC', 0.95], [1, '#CFF3F1', 0.6]], ' x1="0" y1="0" x2="0" y2="1"');
  const pts = []; for (let x = 0; x <= W; x += 8) pts.push([x, surfY(x)]);
  let o = P(`M0 0H${W}V${f(surfY(W))}` + line(pts.slice().reverse()).replace('M', 'L') + 'Z', 'url(#sf)');
  o += strokeP(line(pts.map(([x, y]) => [x, y + 9])), '#FFFFFF', 2.2, ' opacity="0.35"');
  o += strokeP(line(pts), '#FFFFFF', 4, ' opacity="0.95"');
  // dancing light ripples just below
  const r = rng(61); let d = '';
  for (let i = 0; i < 30; i++) { const x = r() * W, y = 56 + r() * 26, l = 14 + r() * 26, bh = -4 - r() * 3; d += wrap(x, l, xx => `M${f(xx - l / 2)} ${f(y)}q${f(l / 2)} ${f(bh)} ${f(l)} 0`); }
  o += strokeP(d, '#FFFFFF', 2.4, ' opacity="0.45"');
  return svg(1200, 90, o, defs);
}
function genRainbow() {
  const bands = ['#F4B8B8', '#F7CFA6', '#F6E7A8', '#BFE3C2', '#B9DCEB', '#CDBFE6'];
  const defs = lgr('fade', [[0, '#FFFFFF', 1], [0.62, '#FFFFFF', 1], [1, '#FFFFFF', 0]], ' x1="0" y1="0" x2="0" y2="1"') + `<mask id="mk"><rect width="1200" height="600" fill="url(#fade)"/></mask>`;
  let o = '<g mask="url(#mk)" opacity="0.55">';
  const r0 = 560, bw = 22;
  bands.forEach((c, i) => { const r = r0 - i * bw - bw / 2; o += `<path d="M${f(600 - r)} 600A${f(r)} ${f(r)} 0 0 1 ${f(600 + r)} 600" fill="none" stroke="${c}" stroke-width="${bw + 0.8}"/>`; });
  o += `<path d="M${f(600 - r0 - 6)} 600A${f(r0 + 6)} ${f(r0 + 6)} 0 0 1 ${f(600 + r0 + 6)} 600" fill="none" stroke="#FFFFFF" stroke-width="8" opacity="0.35"/>`;
  return svg(1200, 600, o + '</g>', defs);
}
function genPatch(blobs, col, a, seed, specks) { // soft drifting light / plankton patch
  const defs = rg('pg', [[0, col, a], [0.6, col, a * 0.45], [1, col, 0]]);
  let o = blobs.map(([x, y, rx, ry]) => ell(x, y, rx, ry, 'url(#pg)')).join('');
  if (specks) { const r = rng(seed); let d = ''; for (let i = 0; i < specks; i++) d += cp(40 + r() * 240, 40 + r() * 90, 1.2 + r() * 2); o += P(d, '#FFFFFF', ' opacity="0.75"'); }
  return svg(320, 170, o, defs);
}
const genClouds = () => ({
  cloud_a: genPatch([[110, 90, 90, 52], [200, 80, 100, 58], [160, 100, 120, 50]], '#FFFFFF', 0.5, 1, 10),
  cloud_b: genPatch([[100, 95, 80, 40], [190, 90, 100, 46], [250, 100, 60, 34]], '#FFFDF0', 0.45, 2, 8),
  cloud_c: genPatch([[140, 85, 110, 60], [220, 100, 80, 44]], '#F4FFFB', 0.5, 3, 12),
  cloud_rain: genPatch([[100, 90, 92, 56], [190, 80, 110, 60], [250, 104, 64, 40], [150, 104, 110, 50]], '#7E8FA4', 0.2, 4, 0),
});

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  const bub = (x, y, r, rim = 1.6) => circ(x, y, r, '#FFFFFF', ' opacity="0.22"') + circ(x, y, r, 'none', ` stroke="#8FC9D1" stroke-width="${f(rim + 1)}" opacity="0.55"`) +
    circ(x, y, r, 'none', ` stroke="#FFFFFF" stroke-width="${f(rim)}" opacity="0.95"`) + strokeP(`M${f(x - r * 0.62)} ${f(y - r * 0.1)}A${f(r * 0.64)} ${f(r * 0.64)} 0 0 1 ${f(x - r * 0.05)} ${f(y - r * 0.64)}`, '#FFFFFF', rim * 1.3) + circ(x + r * 0.4, y + r * 0.42, Math.max(0.9, r * 0.12), '#FFFFFF', ' opacity="0.8"');
  // tinted-by-code particles (neutral white/grey)
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F2F2F2')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  // bubble: one water bubble ring; sugar: a little cluster of tiny bubbles
  p.bubble = S(bub(16, 16, 12.5, 1.8));
  p.sugar = S(bub(12, 19, 8, 1.5) + bub(23, 10, 5, 1.2) + bub(24, 23, 3.2, 1));
  // sand puff (pale sand, light enough to tint) and a sand grain
  p.puff = S(`${circ(11, 19, 8, 'url(#pf)')}${circ(19, 15, 10, 'url(#pf)')}${circ(22, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FCF5E4', 0.95], [0.65, '#F6EBD2', 0.75], [1, '#F1E2BE', 0]]));
  p.dust = S(circ(16, 16, 8, 'url(#ds)') + P('M13 13.5Q16 11 19.5 13Q21 16.5 18.5 19.5Q15 21 12.5 18.5Q11.5 15.5 13 13.5Z', '#F6EBD0', ' stroke="#E3CFA4" stroke-width="1"') + circ(14.8, 14.6, 1.1, '#FFFFFF', ' opacity="0.9"'),
    rg('ds', [[0, '#FFFFFF', 0.7], [0.5, '#FFFFFF', 0.25], [1, '#FFFFFF', 0]]));
  // confetti (white, tinted by code): a tiny fish / a round bubble
  p.confetti_a = S(P('M5 16C7 10 14 8.5 19 10.5L26 6.5Q24.5 16 26 25.5L19 21.5C14 23.5 7 22 5 16Z', '#FFFFFF') + P('M8 16C10 19.5 15 20.5 19 19.5', 'none', ' stroke="#DADADA" stroke-width="2" stroke-linecap="round"') + circ(10, 14.5, 1.6, '#9A9A9A'));
  p.confetti_b = S(circ(16, 16, 11, '#FFFFFF', ' opacity="0.9"') + P('M24.5 13A10 10 0 0 1 13 25.5A9 9 0 0 0 24.5 13Z', '#DCDCDC') + ell(12.5, 11.5, 3.6, 2.2, '#FFFFFF', ' transform="rotate(-35 12.5 11.5)"') + circ(16, 16, 11, 'none', ' stroke="#E6E6E6" stroke-width="1.4"'));
  // seaweed leaf / drifting sea-grass bit
  p.wrapper_a = S(`<g transform="rotate(-25 16 16)">${P('M16 2C24 8 24 22 16 30C8 22 8 8 16 2Z', '#A9D3B3', ' stroke="#6E9F80" stroke-width="1.6" stroke-linejoin="round"')}${strokeP('M16 6V27M16 13L12 10M16 18L20 15M16 23L12 20', '#7FB08F', 1.3)}</g>`);
  p.wrapper_b = S(P('M6 28C10 20 9 12 14 6Q16 3 18 5C14 12 15 20 10 28Q8 30 6 28Z', '#B8D8A9', ' stroke="#7EA472" stroke-width="1.5" stroke-linejoin="round"') + P('M19 27C21 21 21 15 25 10Q26.5 8.5 27.5 10C25 15 24.5 21 22 27Q20.5 28.5 19 27Z', '#C6E0BC', ' stroke="#86AC7C" stroke-width="1.3" stroke-linejoin="round"'));
  // blossom → a pastel plankton speck (soft glow + tiny body)
  p.blossom = S(circ(16, 16, 11, 'url(#pk)') + circ(16, 16, 4, '#FBD9E4', ' stroke="#E7AFC3" stroke-width="1.2"') + circ(14.8, 14.8, 1.2, '#FFFFFF') + strokeP('M16 12V8M19.5 13.5L22 11M12.5 13.5L10 11', '#E7AFC3', 1.1),
    rg('pk', [[0, '#FFF2F6', 0.9], [0.55, '#FDE6EE', 0.35], [1, '#FDE6EE', 0]]));
  // raindrop → a soft white streak (head at the bottom)
  p.raindrop = S(P('M16 2Q17.6 14 18 22Q18.2 28 16 28Q13.8 28 14 22Q14.4 14 16 2Z', 'url(#rd)'),
    lgr('rd', [[0, '#FFFFFF', 0], [0.6, '#FFFFFF', 0.6], [1, '#FFFFFF', 0.95]], ' x1="0" y1="0" x2="0" y2="1"'));
  // splash → a surface ripple ring
  p.splash = S(ell(16, 17, 14, 5.2, 'none', ' stroke="#FFFFFF" stroke-width="1.6" opacity="0.55"') + ell(16, 17, 9, 3.3, 'none', ' stroke="#FFFFFF" stroke-width="2.2" opacity="0.85"') + ell(16, 17, 3.6, 1.4, '#FFFFFF', ' opacity="0.9"') +
    ell(16, 18.5, 14, 5.2, 'none', ' stroke="#8FC9D1" stroke-width="1" opacity="0.4"'));
  return p;
}

// ---------------- write ----------------
function build() {
  const env = { ...genClouds(), sun: genSun(), rays: genRays(), surface: genSurface(), rainbow: genRainbow(), rock: genRock(), jelly_ride: genJelly() };
  for (const m of MOODS) { env['far_' + m] = genFar(m); env['mid_' + m] = genMid(m); env['ground_' + m] = genGround(m); }
  return { env, particles: genParticles() };
}
if (require.main === module) {
  const { env, particles } = build();
  const envD = path.join(A, 'env'), parD = path.join(A, 'particles');
  fs.mkdirSync(envD, { recursive: true }); fs.mkdirSync(parD, { recursive: true });
  for (const old of ['stand', 'cloud_candy']) { try { fs.unlinkSync(path.join(envD, old + '.svg')); } catch (e) { /* gone */ } }
  for (const [k, v] of Object.entries(env)) fs.writeFileSync(path.join(envD, k + '.svg'), v);
  for (const [k, v] of Object.entries(particles)) fs.writeFileSync(path.join(parD, k + '.svg'), v);
  let bad = 0;
  for (const [k, v] of [...Object.entries(env).map(([k, v]) => ['env/' + k, v]), ...Object.entries(particles).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024, blur = (v.match(/feGaussianBlur/g) || []).length;
    const mm = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/), okBox = mm && mm[1] === mm[3] && mm[2] === mm[4];
    const forb = /<text|<script|href=|@import|font|NaN|undefined|Infinity/.test(v) || blur > 1;
    let satMax = 0;
    if (/^env\/(far|mid|ground)_/.test(k)) for (const c of v.match(/#[0-9A-F]{6}/gi) || []) satMax = Math.max(satMax, hsvSat(c.toUpperCase()));
    const sat = satMax > 0.45;
    if (forb || !okBox || kb > 80 || sat) bad++;
    console.log(`${k.padEnd(24)} ${kb.toFixed(1)} KB${kb > 80 ? '  TOO BIG' : ''}${forb ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}${satMax ? `  sat≤${satMax.toFixed(2)}` : ''}${sat ? ' TOO SATURATED' : ''}`);
  }
  console.log('GROUND', JSON.stringify(GROUND), 'FARFILL', JSON.stringify(FARFILL));
  if (bad) { console.error(bad, 'file(s) failed checks'); process.exit(1); }
}
module.exports = { SKY, MOOD, GROUND, FARFILL, MOODS, pal, build };
