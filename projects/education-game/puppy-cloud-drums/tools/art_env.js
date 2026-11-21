// Bibi's Cloud Drums: rainbow cloud-land environment + particle art generator (100 % original, hand-laid flat SVG).
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, env/{sun,moon,cloud_a,cloud_b,rainbow}.svg
// and game/assets/default/particles/{mist,mote,sparkle,star,ember,firefly,leaf,butterfly,confetti_a,confetti_b,dot,dust,note}.svg;
// any other (old) env / particle file is deleted.                                                   (DESIGN §3, §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof + recipe: node tools/env_scenes.js
//
// Tiling: every layer is 1200 wide. Cloud masses are unions of "bump" circles placed periodically (periodic distance), props
// that cross x = 0 / 1200 are drawn twice (x and x ∓ 1200), rows use spacings that divide 1200 — both edges match pixel for
// pixel (docs/art/env_seams.png).
// Colour rule (DESIGN §3): calm pastel, clearly less saturated than the answer drums; no saturated red / blue / yellow / green
// area anywhere. The rainbow in the far layer is faint (group opacity ≤ 0.32) and desaturated. Night is deep blue-lilac (not
// black): the layers carry the darkness, the drums stay untinted.
//
// Cloud shading (one-step cel): every bump = a shade disc + a lit disc (0.86 r, shifted up-left) inside it, so each puff gets
// a soft shade crescent bottom-right; a thin rim arc upper-left (sunset: golden rims on the right, towards the low sun).
//
// Layer anchors (env_scenes.js envLayout() has the screen maths; the geometry is the same as the camp game's recipe):
//   far    0 0 1200 720 : transparent sky; faint rainbow arc (centre 600/640, r 430 → top y 210; feet hidden behind the
//                         back cloud mountains), back cloud mountains (tops ≈ 300…420), two floating cloud islands with tiny
//                         puffball trees (≈ y 170…300), main cloud mountains (tops ≈ 440…480), the cloud sea
//                         HORIZON.y0…y1 (560…700: soft flat puffs) — render's ENV.LAKE = HORIZON (the sky gradient ends at y0).
//   mid    0 0 1200 300 : transparent top; back cloud hills (tops ≈ 150…190) with puffball trees, front hills (≈ 215…250),
//                         2 cloud cottages with round windows (x 300 / 545; night: warm glowing windows). MID_BASE 298 → campY.
//   ground 0 0 1200 260 : transparent above GROUND_LINE = 40 (puffs poke up to ≈ 26); the soft cloud floor (gradient
//                         FLOOR[m] → GROUND_BOTTOM[m]) with rows of soft bumps and tiny star flowers.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const MID_BASE = 298, GROUND_LINE = 40, FAR_BOTTOM = 720;
const HORIZON = { y0: 560, y1: 700 };   // the cloud-sea strip in far-tile coordinates (render: ENV.LAKE)
const LAKE = HORIZON;                   // alias (the camp recipe's name, kept so render.js runs unchanged)
const f = n => (Math.round(n * 10) / 10).toString();
const T = (s, ...v) => s.reduce((a, str, i) => a + str + (i < v.length ? (typeof v[i] === 'number' ? f(v[i]) : v[i]) : ''), '');

// ---------------- helpers ----------------
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const S = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const OL = (col, w) => ` stroke="${col}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const stops = s => s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rg = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lg = (id, s, extra = '') => `<linearGradient id="${id}"${extra}>${stops(s)}</linearGradient>`;
const V = ' x1="0" y1="0" x2="0" y2="1"';
function svg(w, h, body, defs = '', comment = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${comment ? `<!-- ${comment} -->` : ''}${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const both = (fn, x, half) => fn(x) + (x + half > W ? fn(x - W) : '') + (x - half < 0 ? fn(x + W) : '');
const pd = (a, b) => { let d = ((a - b) % W + W) % W; return d > W / 2 ? d - W : d; };   // periodic signed distance a − b
const arc = (cx, cy, r, a0, a1) => { const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return T`M${x0} ${y0}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; };
const D2R = Math.PI / 180;
function star5(cx, cy, r, ri = 0.48, rot = -90) { const pts = []; for (let k = 0; k < 10; k++) { const a = (rot + k * 36) * D2R, rr = k % 2 ? r * ri : r; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return poly(pts); }

// ---------------- palettes ----------------
// sky gradient per mood (DESIGN §3); render paints it from y 0 to L.skyY1 and the last stop below
const SKY = {
  morning: [[0, '#FAD6E0'], [1, '#FFF1E4']],
  noon: [[0, '#8FD0F4'], [1, '#E2F5FD']],
  sunset: [[0, '#C98BC0'], [0.45, '#FFC9A0'], [1, '#FFE7C2']],
  night: [[0, '#1F2550'], [1, '#44508A']],
};
// cloud masses: c = lit, s = shade, l = rim highlight; per layer (back / main / sea / mid back hills / mid front hills)
const CL = {
  morning: { back: ['#F4E2EA', '#E3CCDA', '#FFF6F8'], main: ['#FFF5F5', '#EED7E0', '#FFFFFF'], sea: ['#FFF3F1', '#F0DCE2', '#FFFFFF'],
    hillB: ['#F6E6EE', '#E6D1DE', '#FFF8FA'], hillF: ['#FFF6F6', '#EEDCE6', '#FFFFFF'] },
  noon: { back: ['#DCEAF8', '#BFD1EC', '#F2F8FF'], main: ['#FAFBFF', '#D9DEF2', '#FFFFFF'], sea: ['#F3F5FD', '#DCE0F2', '#FFFFFF'],
    hillB: ['#ECEFFB', '#D3D8EE', '#FAFBFF'], hillF: ['#F9F8FD', '#DFDAEF', '#FFFFFF'] },
  sunset: { back: ['#E2B8CE', '#C99BBA', '#F4D2DE'], main: ['#F9D9D2', '#DDAFC4', '#FFE6B4'], sea: ['#FBE1D2', '#E2B9C6', '#FFEBC4'],
    hillB: ['#F1CCD2', '#D9AEC4', '#FFE2B8'], hillF: ['#FCE6DE', '#E6C3CF', '#FFEBC8'] },
  night: { back: ['#353F78', '#2C3568', '#454F8A'], main: ['#434D88', '#353E76', '#6672AE'], sea: ['#4A548E', '#3B447C', '#6E7AB4'],
    hillB: ['#3C4580', '#30386C', '#56609C'], hillF: ['#4B5390', '#3C437A', '#6A74B0'] },
};
const RIM = { morning: '#FFF4F0', noon: '#FFFFFF', sunset: '#FFE2A8', night: '#FFD98F' };   // warm rim light (night = window light)
// the cloud floor (ground tile): top colour and the fill below the ground tile
const FLOOR = { morning: '#FBF1F5', noon: '#F4F1FA', sunset: '#FCEAE4', night: '#4C5592' };
const GROUND_BOTTOM = { morning: '#E8D9E7', noon: '#DCD6EC', sunset: '#E8CFD9', night: '#363D72' };
const MEADOW = FLOOR;   // alias (camp name)
const HAZE = { morning: '#FFF1E4', noon: '#E2F5FD', sunset: '#FFE7C2', night: '#44508A' };
// pastel puffball tree crowns (desaturated) + trunk per mood
const TREES = {
  morning: [['#F6CCD8', '#E3AEC0'], ['#CDE9DA', '#AED3C0'], ['#DCD0F2', '#C0B2E2'], ['#FBE0C6', '#E8C2A4']],
  noon: [['#F4C8D8', '#DFA9BE'], ['#C6E6D6', '#A5CDB9'], ['#D6CBF2', '#B9ABE2'], ['#F8DEC0', '#E3BF9E']],
  sunset: [['#EFB8C8', '#D497AE'], ['#D3D6BE', '#B6B9A0'], ['#D2BDE4', '#B39FCC'], ['#F7CDA8', '#DDAA88']],
  night: [['#6A5E98', '#564C84'], ['#4E6A8E', '#41587A'], ['#5D5C9C', '#4C4A86'], ['#6D6690', '#5A547C']],
};
const TRUNK = { morning: '#D8BFAE', noon: '#D4BFAA', sunset: '#C9A49A', night: '#4A4A78' };
const lt = (c, t = 0.3) => mix(c, '#FFFFFF', t), dk = (c, t = 0.3) => mix(c, '#2E2A48', t);

// =====================================================================================================
// cloud mass: union of bump circles [cx, cy, r] (periodic), filled down to y0
// =====================================================================================================
function puffTop(bumps, x) { let best = 1e9; for (const [cx, cy, r] of bumps) { const d = Math.abs(pd(x, cx)); if (d < r) best = Math.min(best, cy - Math.sqrt(r * r - d * d)); } return best; }
function cloudMass(bumps, y0, pal, opt = {}) {
  const [c, s, l] = pal;
  let o = '';
  // base silhouette (shade colour) down to y0
  const pts = [[0, y0]]; for (let x = 0; x <= W; x += 4) pts.push([x, Math.min(y0, puffTop(bumps, x))]); pts.push([W, y0]);
  o += P(poly(pts), opt.body || s);
  // bumps, top first (lower ones overlap in front)
  const list = bumps.slice().sort((a, b) => (a[1] - a[2]) - (b[1] - b[2]));
  for (const [cx, cy, r] of list) {
    o += both(x => C(x, cy, r, s) + C(x - r * 0.09, cy - r * 0.1, r * 0.86, c), cx, r);
  }
  // rim arcs (upper-left soft highlight; opt.rimR = a second rim on the right, e.g. golden at sunset)
  if (opt.rim !== false) for (const [cx, cy, r] of list) {
    if (r < (opt.rimMin || 30)) continue;
    o += both(x => S(arc(x - r * 0.09, cy - r * 0.1, r * 0.8, 200 * D2R, 255 * D2R), l, Math.max(2, r * 0.035), ` opacity="${opt.rimA || 0.8}"`), cx, r);
    if (opt.rimR) o += both(x => S(arc(x, cy, r - 1.5, 272 * D2R, 330 * D2R), opt.rimR, Math.max(2, r * 0.03), ` opacity="${opt.rimRA || 0.8}"`), cx, r);
  }
  return o;
}
// periodic bump row: n bumps evenly (n divides the tile), jittered deterministically
function row(n, cy, r, jy = 0, jr = 0, off = 0, seed = 1) {
  const out = []; for (let k = 0; k < n; k++) { const h = Math.sin((k + 1) * 12.9898 * seed) * 43758.5453, u = h - Math.floor(h), v = (u * 7.31) % 1; out.push([((k + 0.5) * W / n + off + W) % W, cy + (u - 0.5) * 2 * jy, r + (v - 0.5) * 2 * jr]); } return out;
}
function puffTree(m, x, yb, h, ci, opt = {}) {
  const [c, s] = TREES[m][ci % 4], tr = TRUNK[m], ol = dk(s, 0.22), r = h * 0.3;
  const cy = yb - h + r;
  let o = '';
  if (!opt.noShadow) o += E(x, yb, r * 0.8, r * 0.16, dk(s, 0.3), ' opacity="0.18"');
  o += S(T`M${x} ${yb}Q${x + r * 0.08} ${yb - (yb - cy) * 0.5} ${x - r * 0.02} ${cy + r * 0.4}`, dk(tr, 0.15), Math.max(2.6, r * 0.2));
  o += S(T`M${x} ${yb}Q${x + r * 0.08} ${yb - (yb - cy) * 0.5} ${x - r * 0.02} ${cy + r * 0.4}`, tr, Math.max(1.4, r * 0.11));
  const balls = opt.single ? [[0, 0, 1]] : [[-0.55, 0.22, 0.62], [0.55, 0.24, 0.6], [0, -0.1, 0.9]];
  for (const [dx, dy, k] of balls) { const bx = x + dx * r, by = cy + dy * r, br = r * k; o += C(bx, by, br, s, OL(ol, Math.max(1.4, r * 0.07))); }
  for (const [dx, dy, k] of balls) { const bx = x + dx * r, by = cy + dy * r, br = r * k; o += C(bx - br * 0.12, by - br * 0.14, br * 0.8, c); }
  o += E(x - r * 0.32, cy - r * 0.42, r * 0.22, r * 0.13, lt(c, 0.55), ` opacity="0.85" transform="rotate(-30 ${f(x - r * 0.32)} ${f(cy - r * 0.42)})"`);
  return o;
}

// =====================================================================================================
// FAR (0 0 1200 720)
// =====================================================================================================
const RB = ['#F2B9C2', '#F5D2B4', '#F2E5BC', '#CBE3C8', '#BBD6EC', '#D0C6EA'];   // desaturated pastel bands (outer → inner)
function rainbowArc(cx, cy, r0, bw) { let o = ''; RB.forEach((col, i) => { o += S(arc(cx, cy, r0 - bw * (i + 0.5), Math.PI, 2 * Math.PI), col, bw + 0.8); }); return o; }
function island(m, x, y, w, seed) {
  const pal = CL[m].main, night = m === 'night';
  const under = night ? '#3A4378' : m === 'sunset' ? '#D8A9BF' : m === 'morning' ? '#E7CEDA' : '#CFD5EC';
  let o = '';
  // rounded underside (inverted dome) with a little dangling puff
  o += P(T`M${x - w * 0.5} ${y}Q${x - w * 0.42} ${y + w * 0.32} ${x} ${y + w * 0.4}Q${x + w * 0.42} ${y + w * 0.32} ${x + w * 0.5} ${y}Z`, under);
  o += P(T`M${x - w * 0.3} ${y + 4}Q${x - w * 0.18} ${y + w * 0.3} ${x + w * 0.06} ${y + w * 0.34}Q${x - w * 0.1} ${y + w * 0.18} ${x - w * 0.3} ${y + 4}Z`, lt(under, 0.25), ' opacity="0.8"');
  o += C(x + w * 0.08, y + w * 0.46, w * 0.06, under);
  // tiny pastel trees on top
  const tr = [[-0.24, 0.9, 0], [0.04, 1.15, 2], [0.28, 0.8, 1]];
  for (const [dx, k, ci] of tr) o += puffTree(m, x + dx * w, y - w * 0.1, w * 0.3 * k, ci + seed, { single: k < 1, noShadow: true });
  // the cloud cap (puffs) in front of the trunks
  const caps = [[-0.36, 0.02, 0.16], [-0.14, -0.04, 0.2], [0.12, -0.03, 0.2], [0.35, 0.02, 0.16]];
  for (const [dx, dy, k] of caps) o += C(x + dx * w, y + dy * w, k * w, pal[1]);
  for (const [dx, dy, k] of caps) o += C(x + dx * w - k * w * 0.1, y + dy * w - k * w * 0.12, k * w * 0.84, pal[0]);
  o += R(x - w * 0.5, y - 2, w, 6, pal[1]);
  if (night) o += C(x + w * 0.1, y - w * 0.14, 14, 'url(#lamp)') + C(x + w * 0.1, y - w * 0.14, 2.6, '#FFE6A8');
  return o;
}
function far(m) {
  const night = m === 'night', pal = CL[m];
  let o = '', defs = '';
  if (night) defs += rg('lamp', [[0, '#FFD98F', 0.7], [1, '#FFD98F', 0]]);
  // ---- 1 the faint rainbow (behind everything; feet hidden behind the back cloud mountains)
  if (!night) {
    const a = { morning: 0.3, noon: 0.32, sunset: 0.26 }[m];
    o += `<g opacity="${a}">${rainbowArc(600, 640, 430, 15)}</g>`;
  }
  // ---- 2 back cloud mountains (hazy): high at the rainbow feet, lower in the middle
  const back = [[170, 520, 215], [1030, 512, 205], [0, 560, 150], [600, 610, 200], [395, 590, 165], [810, 592, 172],
    ...row(8, 640, 95, 14, 12, 40, 3)];
  o += cloudMass(back, 720, pal.back, { rimMin: 120, rimA: 0.7, rimR: m === 'sunset' ? '#FFDDB0' : null, rimRA: 0.55 });
  // ---- 3 floating cloud islands with tiny trees
  o += island(m, 318, 300, 150, 0) + island(m, 905, 238, 116, 2);
  // ---- 4 main cloud mountains
  const main = [[100, 600, 160], [312, 612, 150], [528, 600, 140], [722, 628, 175], [942, 606, 150], [1120, 630, 150],
    ...row(10, 676, 96, 12, 10, 20, 5)];
  o += cloudMass(main, 720, pal.main, { rimMin: 120, rimR: m === 'sunset' ? RIM.sunset : null });
  // ---- 5 the cloud sea (horizon): wide soft flat puffs
  const sea = [...row(15, 700, 62, 8, 8, 0, 7), ...row(20, 726, 52, 6, 6, 30, 9)];
  o += cloudMass(sea, 720, pal.sea, { rimMin: 999, rimA: 0.6, rimR: m === 'sunset' ? RIM.sunset : null, rimRA: 0.5 });
  // ---- 6 mood atmosphere (soft horizontal haze, no blur)
  const hz = { morning: ['#FFFFFF', 0.55], noon: ['#FFFFFF', 0.35], sunset: ['#FFE3C0', 0.45], night: ['#6A76B0', 0.25] }[m];
  defs += lg('hz', [[0, hz[0], 0], [0.6, hz[0], hz[1]], [1, hz[0], 0]], V);
  o += R(0, 560, W, 90, 'url(#hz)');
  if (m === 'morning') o += R(0, 470, W, 70, 'url(#hz)', ' opacity="0.6"');
  return svg(1200, 720, o, defs, `sky ${SKY[m][0][1]} ${SKY[m][SKY[m].length - 1][1]}`);
}

// =====================================================================================================
// MID (0 0 1200 300): cloud hills, puffball trees, 2 cloud cottages
// =====================================================================================================
function cottage(m, x, yb, w, roofI) {
  const night = m === 'night';
  const wall = night ? '#5E6699' : m === 'sunset' ? '#FFF0EA' : m === 'morning' ? '#FFF8F6' : '#FFFBF6';
  const wallS = night ? '#4C5386' : m === 'sunset' ? '#EBCFD2' : m === 'morning' ? '#EFDCE2' : '#E6E0EE';
  const roofs = night ? [['#6E6AA6', '#5A5690'], ['#5C74A0', '#4C628C']] :
    m === 'sunset' ? [['#E3B8D6', '#C99ABD'], ['#F5C9B8', '#DAA898']] : [['#DCCDF0', '#BFAEDF'], ['#F7D0C4', '#E2B0A4']];
  const [rc, rs] = roofs[roofI % 2], ol = dk(wallS, 0.35), rol = dk(rs, 0.25);
  const h = w * 0.62, top = yb - h;
  let o = E(x, yb + 2, w * 0.62, 5, dk(wallS, 0.4), ' opacity="0.18"');
  // body: rounded box
  o += R(x - w / 2, top, w, h, wall, ` rx="${f(w * 0.2)}"${OL(ol, 2.4)}`);
  o += P(T`M${x + w * 0.22} ${top + 2}L${x + w * 0.3} ${top + 2}Q${x + w / 2 - 1} ${top + 2} ${x + w / 2 - 1} ${top + w * 0.2}L${x + w / 2 - 1} ${yb - w * 0.2}Q${x + w / 2 - 1} ${yb - 1} ${x + w * 0.3} ${yb - 1}L${x + w * 0.22} ${yb - 1}Z`, wallS, ' opacity="0.85"');
  // round door
  const dw = w * 0.24, dh = h * 0.55;
  const door = night ? '#7A6E9C' : m === 'sunset' ? '#D9B0C4' : '#E4CCE0';
  o += P(T`M${x - w * 0.12 - dw / 2} ${yb}L${x - w * 0.12 - dw / 2} ${yb - dh + dw / 2}A${dw / 2} ${dw / 2} 0 0 1 ${x - w * 0.12 + dw / 2} ${yb - dh + dw / 2}L${x - w * 0.12 + dw / 2} ${yb}Z`, door, OL(dk(door, 0.3), 2));
  o += C(x - w * 0.12 + dw * 0.25, yb - dh * 0.45, 1.8, dk(door, 0.4));
  // round window (night: warm glow)
  const wx = x + w * 0.2, wy = top + h * 0.42, wr = w * 0.12;
  if (night) o += C(wx, wy, wr * 4.2, 'url(#wglow)');
  o += C(wx, wy, wr, night ? '#FFD98F' : '#CFE3F2', OL('#C9CCDA', 3));
  if (night) o += C(wx - wr * 0.2, wy - wr * 0.2, wr * 0.55, '#FFF0C8');
  else o += S(T`M${wx - wr * 0.5} ${wy - wr * 0.1}Q${wx - wr * 0.45} ${wy - wr * 0.5} ${wx - wr * 0.05} ${wy - wr * 0.55}`, '#FFFFFF', 2, ' opacity="0.9"');
  o += S(T`M${wx - wr} ${wy}L${wx + wr} ${wy}M${wx} ${wy - wr}L${wx} ${wy + wr}`, '#C9CCDA', 1.6);
  // a puffy cloud roof (3 puffs + a cap)
  const puffs = [[-0.38, 0.02, 0.24], [0, -0.14, 0.32], [0.38, 0.02, 0.24]];
  for (const [dx, dy, k] of puffs) o += C(x + dx * w, top + dy * w, k * w, rs, OL(rol, 2.4));
  o += P(T`M${x - w * 0.6} ${top + w * 0.06}Q${x} ${top + w * 0.18} ${x + w * 0.6} ${top + w * 0.06}L${x + w * 0.6} ${top - w * 0.04}L${x - w * 0.6} ${top - w * 0.04}Z`, rs);
  for (const [dx, dy, k] of puffs) o += C(x + dx * w - k * w * 0.1, top + dy * w - k * w * 0.12, k * w * 0.82, rc);
  o += E(x - w * 0.12, top - w * 0.3, w * 0.1, w * 0.05, lt(rc, 0.6), ' opacity="0.9" transform="rotate(-20 ' + f(x - w * 0.12) + ' ' + f(top - w * 0.3) + ')"');
  // tiny star finial on top
  o += P(star5(x, top - w * 0.5, w * 0.07), night ? '#FFE6A8' : '#F6E4B8', OL(night ? '#C9A866' : '#D9C08E', 1.4));
  return o;
}
function mid(m) {
  const night = m === 'night', pal = CL[m];
  let o = '', defs = '';
  defs += rg('wglow', [[0, '#FFD98F', 0.7], [0.35, '#FFD08A', 0.28], [1, '#FFD08A', 0]]);
  // ---- back cloud hills
  const hb = [[60, 262, 100], [230, 268, 96], [420, 250, 92], [640, 262, 104], [850, 254, 96], [1040, 266, 100], ...row(10, 300, 70, 8, 8, 0, 11)];
  o += cloudMass(hb, 300, pal.hillB, { rimMin: 85, rimR: m === 'sunset' ? RIM.sunset : null, rimRA: 0.6 });
  // puffball trees on the back hills (away from the cottages)
  for (const [x, h, ci] of [[40, 74, 1], [110, 58, 0], [690, 80, 2], [748, 60, 3], [960, 70, 1], [1150, 62, 2]]) o += both(xx => puffTree(m, xx, puffTop(hb, ((xx % W) + W) % W) + 14, h, ci), x, 30);
  // ---- front cloud hills
  const hf = [...row(12, 300, 76, 10, 10, 50, 13), [300, 300, 90], [545, 304, 88]];
  o += cloudMass(hf, 300, pal.hillF, { rimMin: 85, rimR: m === 'sunset' ? RIM.sunset : null, rimRA: 0.6 });
  // ---- 2 cloud cottages + front puffs hiding their bases, a few small trees beside them
  o += cottage(m, 300, 262, 96, 0) + cottage(m, 545, 270, 80, 1);
  for (const [x, h, ci] of [[376, 54, 1], [470, 44, 2], [212, 48, 3], [880, 56, 0], [1080, 50, 3]]) o += both(xx => puffTree(m, xx, 276, h, ci), x, 22);
  const fp = [[240, 292, 26], [272, 296, 22], [356, 294, 24], [498, 298, 22], [592, 296, 24], [620, 300, 20]];
  for (const [x, y, r] of fp) o += C(x, y, r, pal.hillF[1]) + C(x - r * 0.1, y - r * 0.12, r * 0.84, pal.hillF[0]);
  o += R(0, 296, W, 4, pal.hillF[0]);
  return svg(1200, 300, o, defs);
}

// =====================================================================================================
// GROUND (0 0 1200 260): the soft cloud floor with bumps and tiny star flowers
// =====================================================================================================
function ground(m) {
  const night = m === 'night';
  const top = FLOOR[m], bot = GROUND_BOTTOM[m], shade = dk(mix(top, bot, 0.5), night ? 0.25 : 0.1), hi = night ? '#6872AE' : '#FFFFFF';
  let o = '', defs = '';
  defs += lg('gr', [[0, top], [0.25, top], [1, bot]], ' gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="260"');
  // the puffy top edge (tops ≈ 26…34) + the floor body from y 40
  const edge = row(30, 62, 30, 3, 3, 0, 17);
  for (const [x, y, r] of edge) o += both(xx => C(xx, y, r, mix(top, shade, 0.35)), x, r);
  o += R(0, 46, W, 214, 'url(#gr)');
  for (const [x, y, r] of edge) o += both(xx => C(xx - r * 0.06, y - r * 0.08, r * 0.9, top), x, r);
  o += R(0, 54, W, 30, top);
  for (const [x, y, r] of edge) o += both(xx => S(arc(xx - r * 0.06, y - r * 0.08, r * 0.74, 205 * D2R, 260 * D2R), hi, 2.4, ` opacity="${night ? 0.5 : 0.9}"`), x, r);
  // rows of soft bumps (shade crescent under a cover ellipse in the same gradient → reads as a soft mound)
  const rows = [[92, 8, 120, 15, 0.45], [138, 6, 150, 19, 0.5], [190, 5, 190, 24, 0.55], [240, 4, 220, 28, 0.55]];
  rows.forEach(([y, n, rx, ry, a], ri) => {
    for (let k = 0; k < n; k++) {
      const x = (k + (ri % 2 ? 0.5 : 0.15) + ((k * 7 + ri * 3) % 5) * 0.04) * W / n, yy = y + ((k * 13 + ri) % 5) - 2;
      o += both(xx => E(xx + rx * 0.04, yy + ry * 0.2, rx, ry, shade, ` opacity="${a * (night ? 0.8 : 0.55)}"`) + E(xx, yy, rx * 0.98, ry * 0.92, 'url(#gr)') +
        S(T`M${xx - rx * 0.7} ${yy - ry * 0.45}Q${xx - rx * 0.3} ${yy - ry * 1.02} ${xx + rx * 0.1} ${yy - ry * 0.92}`, hi, 2.6, ` opacity="${night ? 0.35 : 0.85}"`), x, rx + 4);
    }
  });
  // tiny star flowers (soft pastel, outlined in a darker tone), little clusters of 1–3
  const FL = night ? [['#E8DCFF', '#9C92CC'], ['#FFE6B8', '#B89C70'], ['#CFE0FF', '#8E9CC8']] :
    m === 'sunset' ? [['#F8DDB0', '#D2A878'], ['#F4C4D2', '#C98FA4'], ['#DACCF0', '#A898CC']] :
      [['#F6E3AE', '#CDB073'], ['#F5C8D6', '#CF94A8'], ['#D8CDF2', '#A99BD0'], ['#C6E6D6', '#8DB8A2']];
  let seed = 311 + MOODS.indexOf(m); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const x = rnd() * W, y = 70 + rnd() * 180, n = 1 + Math.floor(rnd() * 3), sc = 0.8 + (y - 70) / 180 * 0.7, ci = i % FL.length;
    if (x < 40 || x > W - 40) continue;   // keep flower clusters off the seam column (cleaner seam metric)
    o += both(xx => {
      let s = '';
      for (let k = 0; k < n; k++) {
        const fx = xx + (k - (n - 1) / 2) * 13 * sc + (k % 2) * 3, fy = y - (k % 2) * 6 * sc, r = (5.2 + (k === 1 ? 1.2 : 0)) * sc, [c, d] = FL[(ci + k) % FL.length];
        s += E(fx, fy + r * 0.9, r * 0.9, r * 0.25, shade, ' opacity="0.35"');
        s += P(star5(fx, fy, r, 0.5, -90 + k * 12), c, OL(d, 1.2 * sc)) + C(fx, fy, r * 0.28, night ? '#FFFFFF' : lt(c, 0.7));
      }
      return s;
    }, x, 34 * sc);
  }
  // sparkle dots (white)
  for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 66 + rnd() * 190, rr = 1.2 + rnd() * 1.2; o += both(xx => C(xx, y, rr, hi, ` opacity="${night ? 0.5 : 0.9}"`), x, 3); }
  return svg(1200, 260, o, defs);
}

// =====================================================================================================
// SUN, MOON, CLOUDS, RAINBOW
// =====================================================================================================
function sun() {
  const d = rg('h', [[0, '#FFF6DC', 0.9], [0.45, '#FFF2D2', 0.42], [1, '#FFF2D2', 0]]);
  return svg(200, 200, C(100, 100, 98, 'url(#h)') + C(100, 100, 46, '#FFEFC6', OL('#F2D9A8', 4)) + C(100, 100, 38, '#FFF8E4') + E(86, 84, 13, 8, '#FFFFFF', ' opacity="0.85" transform="rotate(-35 86 84)"'), d);
}
function moon() {
  // a crescent (no face): outer disc r 46 at (100,100) minus a disc r 40 at (124, 86); soft lilac glow; faint craters
  const d = rg('g', [[0, '#ECE8FF', 0.5], [0.5, '#DCD8FF', 0.18], [1, '#DCD8FF', 0]]);
  const cres = 'M100 54A46 46 0 1 0 140 122.6A40 40 0 0 1 100 54Z';
  return svg(200, 200, C(100, 100, 98, 'url(#g)') + P(cres, '#FBF4DE', OL('#DCD0B0', 3.5)) +
    P('M88 63Q67 76 65 100Q65 117 74 130', 'none', OL('#FFFFFF', 4) + ' opacity="0.65"') + C(78, 112, 4, '#EADFC0') + C(92, 136, 3, '#EADFC0') + C(70, 90, 2.6, '#EADFC0'), d);
}
function cloud(type) {
  const blobs = type === 'a' ? [[66, 92, 34], [114, 70, 46], [170, 62, 44], [214, 82, 36], [250, 98, 26], [38, 104, 22]] : [[58, 94, 26], [98, 78, 34], [146, 72, 40], [194, 84, 32], [234, 98, 24], [34, 106, 18]];
  const sh = '#E4E2F2', ol = '#D6D3EA';
  let o = P('M22 104Q22 124 46 124L258 124Q280 124 278 106L272 96L26 96Z', sh, OL(ol, 3));
  for (const [x, y, r] of blobs) o += C(x, y, r, sh, OL(ol, 3));
  o += P('M22 104Q22 124 46 124L258 124Q280 124 278 106L272 96L26 96Z', sh);
  for (const [x, y, r] of blobs) o += C(x, y, r, sh);
  for (const [x, y, r] of blobs) o += C(x - r * 0.1, y - r * 0.12, r * 0.86, '#FFFFFF');
  o += P('M30 104Q34 116 50 116L250 116Q268 116 270 104Z', '#FFFFFF');
  o += E(type === 'a' ? 104 : 90, type === 'a' ? 50 : 60, 16, 7, '#FFFFFF') + S(arc(type === 'a' ? 160 : 140, type === 'a' ? 55 : 66, 34, 205 * D2R, 255 * D2R), '#FFFFFF', 3);
  return svg(300, 140, o);
}
function rainbow() {
  // the celebration rainbow: soft pastel bands with a white edge, cloud puffs at both feet (0 0 600 300)
  const bands = ['#F6A8B6', '#F9C9A0', '#F8E3A2', '#BFE3BE', '#A9CFF0', '#C9B8EE'];
  const cx = 300, cy = 286, r0 = 262, bw = 18;
  let o = S(arc(cx, cy, r0 + 2, Math.PI, 2 * Math.PI), '#FFFFFF', 6, ' opacity="0.8"');
  bands.forEach((col, i) => { o += S(arc(cx, cy, r0 - bw * (i + 0.5), Math.PI, 2 * Math.PI), col, bw + 0.8); });
  o += S(arc(cx, cy, r0 - bw * 6 - 2, Math.PI, 2 * Math.PI), '#FFFFFF', 4, ' opacity="0.7"');
  o += S(arc(cx, cy, r0 - bw * 1.5, 205 * D2R, 250 * D2R), '#FFFFFF', 4, ' opacity="0.55"');
  const foot = fx => {
    const ps = [[fx - 46, 274, 24], [fx - 14, 262, 32], [fx + 22, 266, 28], [fx + 50, 278, 20]];
    let s = ''; for (const [x, y, r] of ps) s += C(x, y, r, '#E2DEF2', OL('#D2CDE8', 2.5));
    for (const [x, y, r] of ps) s += C(x, y, r, '#E2DEF2');
    for (const [x, y, r] of ps) s += C(x - r * 0.1, y - r * 0.12, r * 0.84, '#FFFFFF');
    return s + R(fx - 70, 278, 140, 22, '#FFFFFF', ' rx="11"');
  };
  o += foot(cx - (r0 - bw * 3)) + foot(cx + (r0 - bw * 3));
  return svg(600, 300, o);
}

// =====================================================================================================
// PARTICLES (0 0 32 32; mist 0 0 64 32)
// =====================================================================================================
function particles() {
  const out = {};
  out.mist = svg(64, 32, E(32, 17, 31, 12, 'url(#m)') + E(22, 15, 16, 8, 'url(#m)') + E(44, 18, 16, 8, 'url(#m)'),
    rg('m', [[0, '#FFFFFF', 0.7], [0.6, '#FFFFFF', 0.3], [1, '#FFFFFF', 0]]));
  out.mote = svg(32, 32, C(16, 16, 15, 'url(#m)') + C(16, 16, 3, '#FFFBEE', ' opacity="0.9"'), rg('m', [[0, '#FFF7E2', 0.8], [0.4, '#FFF1D4', 0.3], [1, '#FFF1D4', 0]]));
  out.sparkle = svg(32, 32, C(16, 16, 15, 'url(#k)') + P('M16 1Q17.7 14.3 31 16Q17.7 17.7 16 31Q14.3 17.7 1 16Q14.3 14.3 16 1Z', '#FFF6DA') + P('M16 7.5Q16.9 15.1 24.5 16Q16.9 16.9 16 24.5Q15.1 16.9 7.5 16Q15.1 15.1 16 7.5Z', '#FFFFFF'),
    rg('k', [[0, '#FFF8E0', 0.6], [1, '#FFF8E0', 0]]));
  out.star = svg(32, 32, C(16, 16, 15, 'url(#t)') + P('M16 3Q17.2 14.8 29 16Q17.2 17.2 16 29Q14.8 17.2 3 16Q14.8 14.8 16 3Z', '#FFF4D2') + C(16, 16, 3.2, '#FFFFFF'),
    rg('t', [[0, '#FFF6DA', 0.5], [1, '#FFF6DA', 0]]));
  // ember → a tiny pastel puff (sunset): peach-pink soft cloudlet with a glow
  out.ember = svg(32, 32, C(16, 16, 15, 'url(#e)') + C(12.5, 17.5, 5, '#FFD9D2') + C(17.5, 14.5, 6, '#FFD9D2') + C(20.5, 18.5, 4.2, '#FFD9D2') +
    C(11.8, 16.6, 3.6, '#FFF0EA') + C(16.8, 13.4, 4.2, '#FFF0EA') + R(9, 18, 15, 4.6, '#FFD9D2', ' rx="2.3"'),
    rg('e', [[0, '#FFD2C6', 0.6], [0.5, '#FFD2C6', 0.2], [1, '#FFD2C6', 0]]));
  // firefly → a tiny 5-point twinkle star with a soft pale-gold glow (#FFF3B0)
  out.firefly = svg(32, 32, C(16, 16, 15, 'url(#f)') + P(star5(16, 16.5, 7.2, 0.5), '#FFF3B0', OL('#F2DC8E', 1)) + C(16, 16.5, 2.2, '#FFFFF4'),
    rg('f', [[0, '#FFF3B0', 0.75], [0.4, '#FFF3B0', 0.3], [1, '#FFF3B0', 0]]));
  // leaf → a pastel petal (noon breeze)
  out.leaf = svg(32, 32, `<g transform="rotate(-30 16 16)">` + P('M16 4Q25 9 24 18Q22.5 26 16 28Q9.5 26 8 18Q7 9 16 4Z', '#F8CEDA', OL('#D898AE', 1.4)) +
    P('M16 4Q25 9 24 18Q22.5 26 16 28Q21 18 16 4Z', '#EDB4C6', ' opacity="0.8"') + P('M16 4Q14.5 6 16 8Q17.5 6 16 4Z', '#D898AE') +
    E(12.6, 12, 2.2, 3.6, '#FFEAF0', ' opacity="0.9"') + `</g>`);
  // butterfly: pastel lilac / pink wings, soft grey-mauve body
  out.butterfly = svg(32, 32, P('M15.5 15Q8 4 3.5 8Q1 13 7 16Q2 21 6.5 25Q11 27 15.5 18Z', '#E6D8F6', OL('#B3A2D2', 1.4)) +
    P('M16.5 15Q24 4 28.5 8Q31 13 25 16Q30 21 25.5 25Q21 27 16.5 18Z', '#DCCBF0', OL('#B3A2D2', 1.4)) +
    C(7.5, 11, 2.2, '#F8D2DE') + C(24.5, 11, 2.2, '#F8D2DE') + C(8, 21, 1.6, '#FFFFFF') + C(24, 21, 1.6, '#FFFFFF') + R(15, 10, 2, 13, '#857692', ' rx="1"') + S('M15.6 10.5Q14 7 12.5 6M16.4 10.5Q18 7 19.5 6', '#857692', 1));
  out.dot = svg(32, 32, C(16, 16, 13, '#FFFFFF') + P('M3 16a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM3.6 14.8a11.2 11.2 0 1 0 22.4 0a11.2 11.2 0 1 0 -22.4 0Z', '#DADADA', ' fill-rule="evenodd"') + E(11.5, 11, 4.2, 2.8, '#FFFFFF', ' transform="rotate(-35 11.5 11)"'));
  out.confetti_a = svg(32, 32, `<g transform="rotate(18 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D8D8D8"/></g>`);
  out.confetti_b = svg(32, 32, S('M5 21Q9 11 13 19T21 17T27 11', '#DADADA', 4.6) + S('M5 20.3Q9 10.3 13 18.3T21 16.3T27 10.3', '#FFFFFF', 2.6));
  // dust → a soft cloud puff (white-lilac; tintable)
  out.dust = svg(32, 32, C(11, 19, 7.5, '#E6E1F1') + C(17, 14, 9, '#E6E1F1') + C(23, 19.5, 6.5, '#E6E1F1') + R(5, 19, 23, 7.5, '#E6E1F1', ' rx="3.7"') +
    C(10.2, 18, 6, '#F8F6FD') + C(16.2, 12.8, 7.4, '#F8F6FD') + C(22.4, 18.5, 5, '#F8F6FD') + E(14, 10.5, 2.6, 1.5, '#FFFFFF'));
  out.note = svg(32, 32, C(16, 16, 15, 'url(#n)') +
    P('M19 5L19 21.5', 'none', OL('#DCDCDC', 4.2)) + P('M19 5L19 21.5', 'none', OL('#FFFFFF', 2.4)) +
    P('M19 4.5Q25.5 6.5 26 12.5Q23.5 9.5 19.5 9.5Z', '#FFFFFF', OL('#DCDCDC', 1.2)) +
    E(14.5, 22.5, 5.6, 4.2, '#FFFFFF', OL('#DCDCDC', 1.4) + ' transform="rotate(-22 14.5 22.5)"') + E(13, 21.2, 2, 1.1, '#FFFFFF', ' transform="rotate(-22 13 21.2)"'),
    rg('n', [[0, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  return out;
}

// =====================================================================================================
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const wr = (dir, n, s) => fs.writeFileSync(path.join(dir, n + '.svg'), s);
  for (const fn of fs.readdirSync(env)) if (fn.endsWith('.svg')) fs.unlinkSync(path.join(env, fn));
  for (const m of MOODS) { wr(env, 'far_' + m, far(m)); wr(env, 'mid_' + m, mid(m)); wr(env, 'ground_' + m, ground(m)); }
  wr(env, 'sun', sun()); wr(env, 'moon', moon()); wr(env, 'cloud_a', cloud('a')); wr(env, 'cloud_b', cloud('b')); wr(env, 'rainbow', rainbow());
  const ps = particles();
  for (const fn of fs.readdirSync(par)) if (fn.endsWith('.svg') && !ps[fn.slice(0, -4)]) { fs.unlinkSync(path.join(par, fn)); console.log('removed old particle', fn); }
  for (const k of Object.keys(ps)) wr(par, k, ps[k]);
  console.log('wrote env (' + MOODS.length * 3 + ' layers + sun, moon, clouds, rainbow) and particles: ' + Object.keys(ps).join(', '));
}
module.exports = { MOODS, SKY, MEADOW, FLOOR, GROUND_BOTTOM, RIM, HAZE, MID_BASE, GROUND_LINE, FAR_BOTTOM, HORIZON, LAKE };
if (require.main === module) main();
