// Owlet's Snow Garden: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground,sun,moon,cloud1..3}.svg and particles/*.svg.
// Preview scenes + seam proof: node tools/env_scenes.js (after this script).
// Usage: node tools/art_env.js
// Tiling technique (same as the sister games): every ridge is a sum of sines with integer periods over W, and every
// object near an edge is drawn again at x±W, so the left and right edges match exactly.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
let PREC = 10;
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wave = terms => x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); return line(pts); }
const lg = (id, x1, y1, x2, y2, stops, units = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';

// ---------------- palette (calm, lighter than the answer palette) ----------------
const C = {
  // far: pale blue-lavender ice mountains
  backBody: '#D3D6EF', backSh: '#C0C4E6', backCap: '#F3F4FC', backCapSh: '#E1E4F5',
  frontBody: '#BCCBEA', frontSh: '#A9BADF', frontCap: '#F1F5FC', frontCapSh: '#DCE5F5',
  glacier: '#E3F0FA', glacierSh: '#CCE1F2', crevasse: '#B5D0E8', mist: '#EEF3FB',
  // mid: snowy hills, muted teal pines, igloo, ice rocks
  hillBack: '#E2EBF7', hillBackSh: '#D0DEEF', hillBackHi: '#F2F6FC',
  hillFront: '#EDF3FA', hillFrontSh: '#D6E3F1', hillFrontHi: '#FBFDFF',
  pine: '#6E9D94', pineSh: '#5C877F', pineHi: '#86B2A8', trunk: '#8E7766', snow: '#F7FAFF', snowSh: '#DCE7F3',
  igloo: '#F6F9FD', iglooSh: '#DAE5F1', iglooLine: '#BACDE2', door: '#6A86A8', doorIn: '#506B8E',
  ice: '#BEDCEB', iceSh: '#A2C5DA', iceHi: '#E4F2FA', iceLine: '#8FB3CB',
  // ground: snow
  snowTop: '#F6FAFF', snowMid: '#EDF3FA', snowLow: '#E1EBF6', shadow: '#D6E4F2', rim: '#C9DAEC', crystal: '#B9D5EE', print: '#D3E1F0',
};

// ---------------- far.svg (0 0 1200 420) ----------------
const EXP = 1.25; // >1 = a bit pointier than the dino hills (icy peaks), tip stays rounded
const peakY = (dx, R) => { const t = Math.min(1, Math.abs(dx) / R); return Math.pow(0.5 + 0.5 * Math.cos(Math.PI * t), EXP); };
const capT = c => Math.acos(2 * Math.pow(c, 1 / EXP) - 1) / Math.PI; // t where peakY = c
function mountain(x0, base, h, R, col, seed, capFrac = 0.6) {
  const r = rng(seed); const n = 40;
  const jit = wave([[2.5, 7, r() * 6], [1.5, 13, r() * 6]]);
  const Y = dx => base - h * peakY(dx, R) + (Math.abs(dx) < R * 0.9 && Math.abs(dx) > R * 0.08 ? jit(x0 + dx) * 0.6 : 0);
  const foot = (420 - base) * 1.6;
  const pts = []; for (let i = 0; i <= n; i++) { const dx = -R + 2 * R * i / n; pts.push([x0 + dx, Y(dx)]); }
  pts.push([x0 + R + foot, 420], [x0 - R - foot, 420]);
  let o = P(poly(pts), col.body);
  const sp = [[x0, base - h]]; for (let i = 0; i <= 20; i++) { const dx = R * i / 20; sp.push([x0 + dx, Y(dx)]); }
  sp.push([x0 + R + foot, 420], [x0 + R * 0.45, 420], [x0 + R * 0.16, base - h * 0.4]);
  o += P(poly(sp), col.sh);
  // snow cap: profile above capFrac, scalloped (drippy) lower edge
  const Rc = R * capT(capFrac), cy = base - h * capFrac;
  const cap = []; for (let i = 0; i <= 16; i++) { const dx = -Rc + 2 * Rc * i / 16; cap.push([x0 + dx, Y(dx)]); }
  const drips = 3 + Math.floor(r() * 2); const low = [];
  for (let i = 0; i <= drips * 6; i++) { const t = i / (drips * 6); const dx = Rc - 2 * Rc * t; const s = Math.abs(Math.sin(Math.PI * t * drips)); low.push([x0 + dx, cy + s * h * 0.07 * (0.7 + 0.3 * Math.sin(i))]); }
  o += P(poly(cap.concat(low)), col.cap);
  // shaded right half of the cap
  const capR = [[x0, base - h]]; for (let i = 0; i <= 8; i++) { const dx = Rc * i / 8; capR.push([x0 + dx, Y(dx)]); }
  low.filter(p => p[0] >= x0 + Rc * 0.12).forEach(p => capR.push(p)); capR.push([x0 + Rc * 0.12, cy + h * 0.02]);
  o += P(poly(capR), col.capSh);
  return o;
}
function glacier(x0, top, base) {
  // ice tongue spilling out of the big peak's snow cap and widening toward the base:
  // cyan-white with a shaded right side, a few faint flow bands and short crevasse slits
  const d = `M${x0 - 30} ${top + 6}Q${x0} ${top - 12} ${x0 + 30} ${top + 6}C${x0 + 40} ${top + 90} ${x0 + 92} ${base - 80} ${x0 + 150} ${base}L${x0 - 150} ${base}C${x0 - 96} ${base - 80} ${x0 - 40} ${top + 90} ${x0 - 30} ${top + 6}Z`;
  let o = P(d, C.glacier);
  o += P(`M${x0 + 10} ${top - 2}Q${x0 + 22} ${top} ${x0 + 30} ${top + 6}C${x0 + 40} ${top + 90} ${x0 + 92} ${base - 80} ${x0 + 150} ${base}L${x0 + 70} ${base}C${x0 + 44} ${base - 90} ${x0 + 22} ${top + 90} ${x0 + 10} ${top - 2}Z`, C.glacierSh);
  let fb = '';
  [[top + 80, 28], [top + 130, 46], [top + 178, 66]].forEach(([y, w]) => { fb += `M${x0 - w} ${y - 6}Q${x0} ${y + 10} ${x0 + w} ${y - 6}`; });
  o += strokeP(fb, '#FFFFFF', 4, ' opacity="0.75"');
  let cr = '';
  [[-12, top + 46, 14], [12, top + 58, 10], [-30, top + 100, 16], [0, top + 104, 12], [28, top + 96, 14], [-56, top + 150, 14], [42, top + 146, 16]].forEach(([dx, y, l]) => { cr += `M${x0 + dx} ${y}l${(dx / 20).toFixed(1)} ${l}`; });
  o += strokeP(cr, C.crevasse, 3.2, ' opacity="0.85"');
  // the snow cap drips back over the glacier's top so it reads as coming out of the cap
  o += P(`M${x0 - 34} ${top + 4}Q${x0 - 16} ${top + 22} ${x0} ${top + 10}Q${x0 + 16} ${top + 24} ${x0 + 34} ${top + 4}Q${x0} ${top - 10} ${x0 - 34} ${top + 4}Z`, C.backCap);
  return o;
}
function genFar() {
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.55, C.mist, 0.35], [1, C.mist, 0.8]]);
  let o = '';
  const back = { body: C.backBody, sh: C.backSh, cap: C.backCap, capSh: C.backCapSh };
  const front = { body: C.frontBody, sh: C.frontSh, cap: C.frontCap, capSh: C.frontCapSh };
  const bk = [[80, 300, 170, 175], [330, 305, 140, 165], [610, 300, 215, 210], [900, 305, 175, 185], [1110, 300, 130, 150]];
  bk.forEach(([x, b, h, R], i) => { o += wrap(x, R + (420 - b) * 1.6, xx => mountain(xx, b, h, R, back, 11 + i, 0.58)); });
  o += glacier(585, 178, 404); // hangs out of the big peak's snow cap, down its left flank
  o += `<rect x="0" y="250" width="${W}" height="170" fill="url(#mist)" opacity="0.5"/>`;
  const fr = [[170, 385, 120, 170], [430, 392, 80, 140], [760, 385, 115, 165], [1010, 390, 95, 150], [1200, 395, 60, 120]];
  fr.forEach(([x, b, h, R], i) => { o += wrap(x, R + (420 - b) * 1.6, xx => mountain(xx, b, h, R, front, 31 + i, 0.5)); });
  const baseW = wave([[7, 2, 0.4], [4, 5, 1.3], [2.5, 9, 2.1]]);
  o += P(bandD(x => 376 + baseW(x), 420), C.frontBody);
  o += `<rect x="0" y="310" width="${W}" height="110" fill="url(#mist)"/>`;
  return svg(1200, 420, o, defs);
}

// ---------------- mid.svg (0 0 1200 360) ----------------
function pine(x, baseY, h, seed) {
  const r = rng(seed); const w = h * 0.56; let o = '';
  o += `<rect x="${f(x - h * 0.045)}" y="${f(baseY - h * 0.14)}" width="${f(h * 0.09)}" height="${f(h * 0.16)}" rx="${f(h * 0.02)}" fill="${C.trunk}"/>`;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const tb = baseY - h * 0.1 - i * h * 0.24, tt = tb - h * (0.46 - i * 0.04), tw = w * (1 - i * 0.24) / 2;
    const tip = [x, tt];
    const body = `M${f(x - tw)} ${f(tb)}Q${f(x - tw * 0.55)} ${f(tb - (tb - tt) * 0.45)} ${f(x - 3)} ${f(tt + 3)}Q${f(x)} ${f(tt - 2)} ${f(x + 3)} ${f(tt + 3)}Q${f(x + tw * 0.55)} ${f(tb - (tb - tt) * 0.45)} ${f(x + tw)} ${f(tb)}Q${f(x)} ${f(tb + h * 0.05)} ${f(x - tw)} ${f(tb)}Z`;
    o += P(body, C.pine);
    o += P(`M${f(x + 2)} ${f(tt + 4)}Q${f(x + tw * 0.55)} ${f(tb - (tb - tt) * 0.45)} ${f(x + tw)} ${f(tb)}Q${f(x + tw * 0.5)} ${f(tb + h * 0.03)} ${f(x + tw * 0.25)} ${f(tb + h * 0.025)}Z`, C.pineSh);
    // snow drape on the upper part of the tier, scalloped lower edge
    const sh = (tb - tt) * 0.5, sy = tt + sh, sw = tw * 0.5 + 2;
    const sc = 3; let d = `M${f(x - sw)} ${f(sy)}Q${f(x - sw * 0.5)} ${f(tt + sh * 0.35)} ${f(x - 3)} ${f(tt + 2)}Q${f(x)} ${f(tt - 3)} ${f(x + 3)} ${f(tt + 2)}Q${f(x + sw * 0.5)} ${f(tt + sh * 0.35)} ${f(x + sw)} ${f(sy)}`;
    for (let k = 0; k < sc; k++) { const x1 = x + sw - (k + 1) * 2 * sw / sc; d += `Q${f(x1 + sw / sc)} ${f(sy + h * (0.05 + 0.02 * r()))} ${f(x1)} ${f(sy)}`; }
    o += P(d + 'Z', C.snow);
    o += P(`M${f(x + 2)} ${f(tt + 2)}Q${f(x + sw * 0.5)} ${f(tt + sh * 0.35)} ${f(x + sw)} ${f(sy)}Q${f(x + sw * 0.7)} ${f(sy + h * 0.045)} ${f(x + sw * 0.34)} ${f(sy)}Z`, C.snowSh);
    void tip;
  }
  return o;
}
function igloo(x, baseY, s) {
  const rw = 66 * s, rh = 54 * s; let o = '';
  o += ell(x + 6 * s, baseY + 2, rw + 14 * s, 7 * s, C.hillFrontSh);
  o += P(`M${f(x - rw)} ${f(baseY)}A${f(rw)} ${f(rh)} 0 0 1 ${f(x + rw)} ${f(baseY)}Z`, C.igloo);
  o += P(`M${f(x + rw * 0.2)} ${f(baseY - rh * 0.98)}A${f(rw)} ${f(rh)} 0 0 1 ${f(x + rw)} ${f(baseY)}L${f(x + rw * 0.45)} ${f(baseY)}Q${f(x + rw * 0.62)} ${f(baseY - rh * 0.6)} ${f(x + rw * 0.2)} ${f(baseY - rh * 0.98)}Z`, C.iglooSh);
  // block rows (elliptic arcs) + staggered joints
  let ln = '';
  [0.3, 0.58, 0.82].forEach((t, i) => {
    const yy = baseY - rh * t, hw = rw * Math.sqrt(1 - t * t);
    ln += `M${f(x - hw)} ${f(yy)}Q${f(x)} ${f(yy + 6 * s)} ${f(x + hw)} ${f(yy)}`;
    const t0 = i === 0 ? 0 : [0.3, 0.58][i - 1]; const n = 5 - i;
    for (let k = 0; k < n; k++) { const u = (k + (i % 2 ? 0.5 : 0.25)) / n * 2 - 1; const yb = baseY - rh * t0, hb = rw * Math.sqrt(1 - t0 * t0); ln += `M${f(x + u * hb * 0.92)} ${f(yb + 2 * s)}L${f(x + u * hw * 0.92)} ${f(yy + 3 * s)}`; }
  });
  o += strokeP(ln, C.iglooLine, 2.6 * s, ' opacity="0.9"');
  o += ell(x - rw * 0.42, baseY - rh * 0.72, rw * 0.16, rh * 0.08, '#FFFFFF', ` transform="rotate(-35 ${f(x - rw * 0.42)} ${f(baseY - rh * 0.72)})"`);
  // entrance tunnel at the front-left
  const ex = x - rw * 0.55, ew = 30 * s, eh = 30 * s;
  o += P(`M${f(ex - ew)} ${f(baseY + 3)}L${f(ex - ew)} ${f(baseY - eh * 0.55)}A${f(ew)} ${f(eh * 0.55)} 0 0 1 ${f(ex + ew)} ${f(baseY - eh * 0.55)}L${f(ex + ew)} ${f(baseY + 3)}Z`, C.igloo);
  o += strokeP(`M${f(ex - ew)} ${f(baseY - eh * 0.2)}L${f(ex + ew)} ${f(baseY - eh * 0.2)}M${f(ex)} ${f(baseY - eh * 0.2)}L${f(ex)} ${f(baseY - eh * 0.55 - eh * 0.45)}`, C.iglooLine, 2.2 * s, ' opacity="0.7"');
  o += P(`M${f(ex - ew * 0.55)} ${f(baseY + 3)}L${f(ex - ew * 0.55)} ${f(baseY - eh * 0.45)}A${f(ew * 0.55)} ${f(eh * 0.5)} 0 0 1 ${f(ex + ew * 0.55)} ${f(baseY - eh * 0.45)}L${f(ex + ew * 0.55)} ${f(baseY + 3)}Z`, C.door);
  o += P(`M${f(ex - ew * 0.38)} ${f(baseY + 3)}L${f(ex - ew * 0.38)} ${f(baseY - eh * 0.4)}A${f(ew * 0.38)} ${f(eh * 0.34)} 0 0 1 ${f(ex + ew * 0.38)} ${f(baseY - eh * 0.4)}L${f(ex + ew * 0.38)} ${f(baseY + 3)}Z`, C.doorIn);
  return o;
}
function iceRock(x, y, w, h, seed) {
  // faceted ice chunk: rounded polygon in two tones, a light top facet, a highlight streak, snow piled at the foot
  const r = rng(seed);
  const pts = [[-0.5, 0], [-0.46, -0.5], [-0.2, -0.92], [0.12, -1], [0.42, -0.62], [0.5, 0]].map(([u, v]) => [x + u * w + (r() - 0.5) * w * 0.06, y + v * h]);
  const fillR = (d, col) => `<path d="${d}" fill="${col}" stroke="${col}" stroke-width="5" stroke-linejoin="round"/>`;
  let o = ell(x + w * 0.06, y + 1, w * 0.66, h * 0.13, C.hillFrontSh);
  o += fillR(poly(pts), C.ice);
  o += fillR(poly([pts[3], pts[4], pts[5], [x + w * 0.08, y], [x + w * 0.02, y - h * 0.62]]), C.iceSh);
  o += fillR(poly([pts[1], pts[2], pts[3], [x + w * 0.02, y - h * 0.62], [x - w * 0.22, y - h * 0.45]]), C.iceHi);
  o += strokeP(`M${f(x - w * 0.3)} ${f(y - h * 0.3)}l${f(w * 0.1)} ${f(-h * 0.25)}`, '#FFFFFF', 3, ' opacity="0.9"');
  o += P(`M${f(x - w * 0.62)} ${f(y + 2)}Q${f(x - w * 0.5)} ${f(y - h * 0.22)} ${f(x - w * 0.2)} ${f(y - h * 0.12)}Q${f(x + w * 0.2)} ${f(y - h * 0.2)} ${f(x + w * 0.62)} ${f(y + 2)}Z`, C.snow);
  return o;
}
function genMid() {
  PREC = 1;
  const backY = x => 214 + wave([[16, 1, 0.3], [11, 2, 2.0], [5, 5, 4.1]])(x);
  const frontY = x => 272 + wave([[14, 1, 2.6], [9, 3, 0.8], [3.5, 7, 1.7]])(x);
  let o = '';
  o += P(bandD(backY, 360), C.hillBack);
  // soft blue shading in the dips of the back hill
  o += P(bandD(x => backY(x) + 26 + wave([[8, 3, 1.0]])(x), 360), C.hillBackSh, ' opacity="0.6"');
  o += strokeP(edgeD(x => backY(x) + 3), C.hillBackHi, 5);
  // small far pines on the back hill (groups)
  const bp = [[60, 70], [95, 56], [300, 64], [335, 80], [372, 58], [690, 66], [725, 54], [960, 76], [998, 60], [1160, 64]];
  bp.forEach(([x, h], i) => { o += wrap(x, 40, xx => pine(xx, backY(xx) + 14, h, 100 + i)); });
  o += P(bandD(frontY, 360), C.hillFront);
  o += P(bandD(x => frontY(x) + 30 + wave([[6, 4, 2.0]])(x), 360), C.hillFrontSh, ' opacity="0.55"');
  o += strokeP(edgeD(x => frontY(x) + 3), C.hillFrontHi, 6);
  // bigger pines on the front hill
  const fp = [[150, 128], [196, 100], [470, 116], [560, 140], [602, 104], [1060, 132], [1108, 98]];
  fp.forEach(([x, h], i) => { o += wrap(x, 50, xx => pine(xx, frontY(xx) + 18, h, 200 + i)); });
  o += igloo(840, frontY(840) + 22, 1);
  [[260, 50, 40], [298, 30, 26], [700, 44, 36], [960, 56, 44], [1185, 38, 32]].forEach(([x, w, h], i) => { o += wrap(x, w, xx => iceRock(xx, frontY(xx) + 20, w, h, 300 + i)); });
  PREC = 10;
  return svg(1200, 360, o);
}

// ---------------- ground.svg (0 0 1200 260) ----------------
function crystal(x, y, s, col) {
  return P(`M${f(x)} ${f(y - 5 * s)}Q${f(x + 0.8 * s)} ${f(y - 0.8 * s)} ${f(x + 5 * s)} ${f(y)}Q${f(x + 0.8 * s)} ${f(y + 0.8 * s)} ${f(x)} ${f(y + 5 * s)}Q${f(x - 0.8 * s)} ${f(y + 0.8 * s)} ${f(x - 5 * s)} ${f(y)}Q${f(x - 0.8 * s)} ${f(y - 0.8 * s)} ${f(x)} ${f(y - 5 * s)}Z`, col);
}
function birdPrint(x, y, s, a) {
  // small three-toe track (owlet footprints), pointing in direction a
  const c = Math.cos(a), sn = Math.sin(a); const R = (dx, dy) => [x + dx * c - dy * sn, y + dx * sn + dy * c];
  const toe = (ang) => { const p0 = R(0, 0), p1 = R(Math.cos(ang) * 7 * s, Math.sin(ang) * 7 * s); return `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}`; };
  const back = R(-4 * s, 0);
  return toe(-0.55) + toe(0) + toe(0.55) + `M${f(x)} ${f(y)}L${f(back[0])} ${f(back[1])}`;
}
function genGround() {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.snowTop], [0.35, C.snowMid], [1, C.snowLow]]);
  const lip = x => 40 + wave([[3, 2, 0.7], [2, 5, 2.2], [1, 11, 0.4]])(x);
  let o = '';
  o += P(bandD(lip, 260, 4), 'url(#gfill)');
  // soft blue shadow just under the lip (gives the snow edge depth against the hills)
  const sh = [[0, lip(0)]]; for (let x = 0; x <= W; x += 6) sh.push([x, lip(x)]); for (let x = W; x >= 0; x -= 6) sh.push([x, lip(x) + 9 + wave([[3, 4, 1.2], [2, 9, 0.3]])(x)]);
  o += P(poly(sh), C.shadow, ' opacity="0.55"');
  o += strokeP(edgeD(x => lip(x) + 1, 6), C.rim, 3);
  o += strokeP(edgeD(x => lip(x) + 4.5, 6), '#FFFFFF', 3, ' opacity="0.9"');
  // gentle drift ridges: thin crescent of blue shadow under a soft bright crest
  [[120, 112, 110, 12], [520, 132, 150, 13], [900, 108, 120, 11], [330, 196, 150, 14], [760, 206, 170, 15], [1110, 190, 130, 13]].forEach(([x, y, rx, ry]) => {
    o += wrap(x, rx + 10, xx => P(`M${f(xx - rx)} ${f(y)}Q${f(xx)} ${f(y - ry * 2)} ${f(xx + rx)} ${f(y)}Q${f(xx + rx * 0.2)} ${f(y - ry * 0.7)} ${f(xx - rx)} ${f(y)}Z`, C.shadow, ' opacity="0.75"')
      + strokeP(`M${f(xx - rx * 0.8)} ${f(y - ry * 0.5)}Q${f(xx - rx * 0.1)} ${f(y - ry * 1.55)} ${f(xx + rx * 0.6)} ${f(y - ry * 0.75)}`, '#FFFFFF', 3, ' opacity="0.9"'));
  });
  // owlet footprints (a little wandering trail, low and faint)
  let fpD = ''; const trail = [[610, 178], [636, 170], [662, 180], [688, 171], [714, 182], [740, 173]];
  trail.forEach(([x, y], i) => { fpD += birdPrint(x, y, 1, -0.15 + (i % 2 ? -0.25 : 0.25)); });
  o += strokeP(fpD, C.print, 2.6);
  // tiny ice crystals (few)
  const r = rng(9);
  for (let i = 0; i < 18; i++) { const x = (i + 0.5) * W / 18 + (r() - 0.5) * 30, y = 72 + r() * 170, s = 0.8 + r() * 0.7; o += wrap(x, 8, xx => crystal(xx, y, s, i % 3 ? C.crystal : '#FFFFFF')); }
  return svg(1200, 260, o, defs);
}

// ---------------- sun, moon, clouds ----------------
function genSun() {
  const defs = rg('glow', [[0, '#FFF6CF', 0.9], [0.45, '#FFE9A0', 0.45], [1, '#FFE9A0', 0]]) + rg('disc', [[0, '#FFF5B8'], [0.7, '#FFE27A'], [1, '#FFD45E']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 88; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFDF72', 9, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F6C44A') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFCE6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genMoon() {
  const defs = rg('mglow', [[0, '#DCE6FF', 0.35], [0.5, '#B9C8FF', 0.16], [1, '#B9C8FF', 0]], ' cx="0.44" cy="0.56" r="0.5"');
  let o = circ(100, 100, 98, 'url(#mglow)');
  // crescent opening to the upper-right: outer circle r 52 at (100,100) minus inner circle r 44 at (122, 82)
  const cres = 'M93.6 48.4A52 52 0 1 0 149.3 116.5A44 44 0 0 1 93.6 48.4Z';
  o += P(cres, '#E8CF86', ' transform="translate(2 3)" opacity="0.5"');
  o += P(cres, '#FFF7D6');
  // calm shading along the inner edge + soft craters
  // one-step cel shade on the lower-left rim (outer circle minus a slightly shifted copy)
  o += P('M81.1 51.6A52 52 0 1 0 148.4 118.9A50 50 0 1 1 81.1 51.6Z', '#F6E3A6', ' opacity="0.9"');
  o += circ(74, 112, 6, '#F4E3AE', ' opacity="0.8"') + circ(88, 136, 4, '#F4E3AE', ' opacity="0.8"') + circ(66, 88, 3.5, '#F4E3AE', ' opacity="0.7"');
  o += ell(76, 70, 9, 5, '#FFFBEA', ' opacity="0.9" transform="rotate(-40 76 70)"');
  return svg(200, 200, o, defs);
}
function genClouds() {
  const out = {};
  const mk = (puffs, base, sh, hi, bottom) => {
    const x0 = puffs[0][0] - puffs[0][2] * 0.7, x1 = puffs[puffs.length - 1][0] + puffs[puffs.length - 1][2] * 0.7, hb = 30;
    let o = `<rect x="${f(x0)}" y="${bottom - hb + 6}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${sh}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y + 7, r, sh)).join('');
    o += `<rect x="${f(x0)}" y="${bottom - hb}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${base}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y, r, base)).join('');
    o += puffs.slice(0, 3).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.45, r * 0.4, r * 0.2, hi, ' opacity="0.95"')).join('');
    return svg(300, 160, o);
  };
  out.cloud1 = mk([[70, 104, 34], [120, 80, 46], [180, 72, 52], [232, 98, 38], [150, 108, 34]], '#FFFFFF', '#E2DEF4', '#FFFFFF', 132);
  out.cloud2 = mk([[60, 110, 28], [104, 92, 38], [156, 96, 36], [204, 104, 30], [244, 114, 22]], '#FFFFFF', '#E5E1F5', '#FFFFFF', 134);
  out.cloud3 = mk([[78, 98, 40], [138, 66, 54], [196, 82, 44], [236, 108, 30], [130, 110, 36]], '#FFFFFF', '#DFDBF2', '#FFFFFF', 136);
  return out;
}

// ---------------- particles (0 0 32 32, centred) ----------------
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  // snow1: six-arm flake with little V branches, rounded ends, soft blue edge so it reads on white snow
  let arms = '', arms2 = '';
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a), X = (r, o = 0) => f(16 + c * r - s * o), Y = (r, o = 0) => f(16 + s * r + c * o);
    arms += `M16 16L${X(12.5)} ${Y(12.5)}M${X(7)} ${Y(7)}L${X(10.5, 3.6)} ${Y(10.5, 3.6)}M${X(7)} ${Y(7)}L${X(10.5, -3.6)} ${Y(10.5, -3.6)}`;
    arms2 += `M16 16L${X(11)} ${Y(11)}`;
  }
  p.snow1 = S(strokeP(arms, '#BFD6EE', 4.2) + strokeP(arms, '#FFFFFF', 2.4) + circ(16, 16, 3.2, '#FFFFFF'));
  // snow2: round puffy flake (a soft dot with six tiny bumps)
  let bumps = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; bumps += circ(16 + Math.cos(a) * 7.5, 16 + Math.sin(a) * 7.5, 3.4, '#FFFFFF'); }
  p.snow2 = S(circ(16, 16.8, 10.4, '#B7D0EA') + bumps + circ(16, 16, 8, '#FFFFFF') + circ(13.6, 13.4, 2.4, '#EAF3FC'));
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#DDF0FF')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  // star: chubby rounded 5-point twinkle star, pale gold
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#FFE9A0" stroke="#FFE9A0" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFBE6"/>`);
  p.petal = S(`<g transform="rotate(-20 16 16)">${P('M16 4C23 8 24 18 16 28C8 18 9 8 16 4Z', '#FFD0DE')}${P('M16 4C23 8 24 18 16 28C19 18 19 9 16 4Z', '#F6B2C8')}${ell(13.5, 11, 2, 4, '#FFEAF1', ' opacity="0.9"')}</g>`);
  p.leaf = S(`<g transform="rotate(-30 16 16)">${P('M16 3C24 8 25 20 16 29C7 20 8 8 16 3Z', '#8CCB7A')}${P('M16 3C24 8 25 20 16 29C19 20 20 10 16 3Z', '#74B565')}${strokeP('M16 6L16 27M16 13l4 -3M16 19l-4 -3M16 22l4 -3', '#5A9A4E', 1.3)}</g>`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#EEF4FB', 0.8], [1, '#DCE7F4', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="9" y="12" width="14" height="8" rx="2" fill="#FF9FBE"/><rect x="9" y="16" width="14" height="4" rx="1.5" fill="#EC80A6"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#7FD8E6', 4)}${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#C2F0F7', 1.4, ' opacity="0.85"')}`);
  return p;
}

// ---------------- write ----------------
const env = path.join(A, 'env'), par = path.join(A, 'particles');
fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
const files = { far: genFar(), mid: genMid(), ground: genGround(), sun: genSun(), moon: genMoon(), ...genClouds() };
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
const parts = genParticles();
for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
for (const [k, v] of [...Object.entries(files).map(([k, v]) => ['env/' + k, v]), ...Object.entries(parts).map(([k, v]) => ['particles/' + k, v])]) {
  const kb = Buffer.byteLength(v) / 1024;
  const blur = (v.match(/feGaussianBlur/g) || []).length;
  console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 60 ? '  TOO BIG' : ''}${/<text|<script|href=|@import|font/.test(v) || blur > 1 ? '  FORBIDDEN' : ''}`);
}
