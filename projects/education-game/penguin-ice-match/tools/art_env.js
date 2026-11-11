// Tuk's Ice Match: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground}_{sunny,breezy,rain,rainbow}.svg, sun.svg, cloud1..3.svg, rainbow.svg
// and particles/*.svg.   Usage: node tools/art_env.js      Preview scenes + seam proof: node tools/env_scenes.js
// Theme: a cartoon polar ice land — faceted icy mountains + tabular icebergs (far), snow hills, an igloo, ice pressure
// ridges, snow-tipped pines and the open sea edge with little icebergs (mid), a snow bank (ground).
// Tiling: every ridge / bank / sea edge is a sum of sines with INTEGER periods over W (so f(0) = f(W)), and every object
// near an edge is drawn again at x±W (wrap()), so the left and right edges of each layer match exactly.
// Stages share ONE layout (same seeds, same shapes); only the palette and the weather details change.
// Colour rule (DESIGN §3): icy blues, whites, soft lilac — lighter and less saturated than every answer colour, so the
// coloured ice-block pictures pop. Pines are a dusty teal (never answer green), the igloo door a blue-grey (never black).
//
// Sea edge (mid_* svg coordinates, 0 0 1200 360): exported as SEA and printed when it runs — fish dive at y ≈ SEA.y.
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
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6, x0 = 0, x1 = W) { const pts = []; for (let x = x0; x <= x1; x += step) pts.push([x, yf(x)]); return line(pts); }
function between(top, bot, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, top(x)]); for (let x = W; x >= 0; x -= step) pts.push([x, bot(x)]); return poly(pts); }
const lg = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
const spark4 = (x, y, r, col, extra = '') => P(`M${f(x)} ${f(y - r)}Q${f(x + r * 0.16)} ${f(y - r * 0.16)} ${f(x + r)} ${f(y)}Q${f(x + r * 0.16)} ${f(y + r * 0.16)} ${f(x)} ${f(y + r)}Q${f(x - r * 0.16)} ${f(y + r * 0.16)} ${f(x - r)} ${f(y)}Q${f(x - r * 0.16)} ${f(y - r * 0.16)} ${f(x)} ${f(y - r)}Z`, col, extra);

// ---------------- palettes (per weather stage) ----------------
const BASE = {
  snow: '#FFFFFF', trunk: '#A99A8C', trunkSh: '#8E8072',
  doorDark: '#8DA6BC', doorDeep: '#7891A8',
};
const STAGES = {
  sunny: {
    // far
    mBack: '#D3E6F3', mBackSh: '#BDD7EA', mFront: '#C4DEF0', mFrontSh: '#A9CBE3', cap: '#FFFFFF', capSh: '#E3EFF8', mist: '#F2FAFF',
    berg: '#E8F4FB', bergSh: '#C6DFEE', bergLine: '#B4D3E6',
    // mid
    hill: '#EAF4FA', hillSh: '#D4E6F1', hillHi: '#FFFFFF', shelf: '#F4F9FC', shelfSh: '#DCEAF3', cliff: '#BFDDEE', cliffSh: '#A3CCE3', cliffHi: '#E6F3FA',
    pine: '#86AFA6', pineSh: '#719C93', pineSnow: '#FFFFFF',
    igloo: '#F8FBFE', iglooSh: '#D3E3EF', iglooLine: '#A9C6DA',
    ridge: '#D7EDF8', ridgeSh: '#AFD3E8', ridgeHi: '#FFFFFF',
    seaTop: '#9CCFE6', sea: '#B4DCEE', seaLow: '#C6E5F2', seaHi: '#EAF6FB', seaLine: '#86BEDA',
    // ground
    gTop: '#FDFEFF', g: '#F0F6FB', gLow: '#E1EDF5', gRim: '#C9DDEB', gLipHi: '#FFFFFF', gDip: '#D3E4F0', gChunk: '#D9EDF8', gChunkSh: '#B6D6E9',
    pebble: '#B9BFCB', fill: '#E1EDF5', sparkle: 1, bend: 0,
  },
  breezy: {
    mBack: '#DAD9EA', mBackSh: '#C6C4DD', mFront: '#CDCCE2', mFrontSh: '#B5B3D2', cap: '#F9F9FD', capSh: '#E6E5F1', mist: '#F3F1F8',
    berg: '#ECEBF5', bergSh: '#CFCDE3', bergLine: '#BDBBD6',
    hill: '#ECEBF4', hillSh: '#D9D7E8', hillHi: '#FBFBFE', shelf: '#F4F3F9', shelfSh: '#E0DEEC', cliff: '#C9CCE2', cliffSh: '#B1B4D2', cliffHi: '#E7E8F3',
    pine: '#8EA9A7', pineSh: '#7A9593', pineSnow: '#F9F9FD',
    igloo: '#F7F7FB', iglooSh: '#D6D4E6', iglooLine: '#B5B2CF',
    ridge: '#DEDEEF', ridgeSh: '#BFBEDA', ridgeHi: '#FAFAFE',
    seaTop: '#A6B5CF', sea: '#BAC5DA', seaLow: '#C9D2E3', seaHi: '#EBEEF6', seaLine: '#97A6C3',
    gTop: '#FBFBFE', g: '#EFEEF6', gLow: '#E2E0EE', gRim: '#CDCBE0', gLipHi: '#FFFFFF', gDip: '#D9D7E8', gChunk: '#E1E1F0', gChunkSh: '#C3C2DB',
    pebble: '#B8B5C8', fill: '#E2E0EE', sparkle: 0.5, bend: 1, drift: true,
  },
  rain: {
    mBack: '#CBD6E0', mBackSh: '#B6C4D2', mFront: '#BCCAD7', mFrontSh: '#A4B5C6', cap: '#EEF3F7', capSh: '#D9E2EA', mist: '#E6ECF1',
    berg: '#DDE7EF', bergSh: '#BCCCDA', bergLine: '#A9BCCC',
    hill: '#DCE5EC', hillSh: '#C7D4DF', hillHi: '#EEF3F7', shelf: '#E5ECF2', shelfSh: '#CFDBE5', cliff: '#B2C6D6', cliffSh: '#9BB2C5', cliffHi: '#D6E2EC',
    pine: '#7F9E99', pineSh: '#6C8A86', pineSnow: '#EEF3F7',
    igloo: '#EDF2F6', iglooSh: '#C8D5E0', iglooLine: '#A0B4C5',
    ridge: '#CFDDE8', ridgeSh: '#A9BED0', ridgeHi: '#EEF4F8',
    seaTop: '#93ADC2', sea: '#A8BFD0', seaLow: '#B9CCDA', seaHi: '#DDE7EF', seaLine: '#839EB5',
    gTop: '#EFF4F8', g: '#E3EAF0', gLow: '#D5DFE8', gRim: '#BCCBD8', gLipHi: '#F6F9FB', gDip: '#C9D6E1', gChunk: '#D2E0EA', gChunkSh: '#AFC3D3',
    pebble: '#A6ADBA', fill: '#D5DFE8', sparkle: 0.2, bend: 0, wet: true,
    puddle: '#B4C8D7', puddleSh: '#9DB5C8', puddleHi: '#E9F0F5',
  },
  rainbow: {
    mBack: '#D8ECF6', mBackSh: '#C6DEEE', mFront: '#CBE4F3', mFrontSh: '#B6D3EA', cap: '#FFFFFF', capSh: '#EEE6F4', mist: '#FBF6FA',
    berg: '#EEF7FC', bergSh: '#D1E5F2', bergLine: '#BFD9EA',
    hill: '#EFF7FB', hillSh: '#DCEBF4', hillHi: '#FFFFFF', shelf: '#F7FBFD', shelfSh: '#E3EEF6', cliff: '#C8E3F1', cliffSh: '#B0D3E7', cliffHi: '#EDF7FC',
    pine: '#8DB8AD', pineSh: '#78A498', pineSnow: '#FFFFFF',
    igloo: '#FBFDFF', iglooSh: '#DAE7F2', iglooLine: '#B3CDE0',
    ridge: '#DDF0FA', ridgeSh: '#B8DAEC', ridgeHi: '#FFFFFF',
    seaTop: '#A4D6EA', sea: '#BCE2F1', seaLow: '#CDEAF5', seaHi: '#F0F9FC', seaLine: '#8FC5DE',
    gTop: '#FFFFFF', g: '#F3F8FC', gLow: '#E6F0F7', gRim: '#CFE1EE', gLipHi: '#FFFFFF', gDip: '#DAE8F2', gChunk: '#DEF0FA', gChunkSh: '#BDDBEC',
    pebble: '#BEC3D0', fill: '#E6F0F7', sparkle: 1.6, bend: 0, pastel: ['#FBE3EC', '#E9E2F8', '#DFF3EA', '#FFF3D6'],
  },
};
for (const k in STAGES) STAGES[k] = Object.assign({}, BASE, STAGES[k]);

// ================= far_<s>.svg (0 0 1200 420): faceted icy mountains + tabular icebergs =================
// Visible part: above ≈ y 340 (the mid layer's back hills cover the rest).
function mountain(x, base, w, h, skew, C, front) {
  const L = [x - w / 2, base], R = [x + w / 2, base], pk = [x + skew, base - h];
  const fill = front ? C.mFront : C.mBack, sh = front ? C.mFrontSh : C.mBackSh;
  const r = Math.min(18, h * 0.08);   // soft rounded tip
  const along = (a, b, d) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [a[0] + dx / l * d, a[1] + dy / l * d]; };
  const pl = along(pk, L, r), pr = along(pk, R, r);
  let o = P(`M${f(L[0])} ${f(L[1])}L${f(pl[0])} ${f(pl[1])}Q${f(pk[0])} ${f(pk[1])} ${f(pr[0])} ${f(pr[1])}L${f(R[0])} ${f(R[1])}Z`, fill);
  // shadow facet: right flank, with a crease line down from the peak
  const cx = pk[0] + w * 0.06, cyy = base - h * 0.42;
  o += P(poly([pr, R, [x + w * 0.1, base], [cx, cyy], [pk[0] + 2, pk[1] + r * 0.6]]), sh);
  // a second, smaller facet on the left flank for a crisp crystal look
  o += P(poly([[pk[0] - w * 0.14, base - h * 0.5], [pk[0] - w * 0.24, base - h * 0.2], [pk[0] - w * 0.12, base - h * 0.08], [pk[0] - w * 0.06, base - h * 0.3]]), sh, ' opacity="0.45"');
  // snow cap with a zig-zag lower edge (follows the two flanks)
  const t = 0.34, n = 5, pts = [];
  const lx = pk[0] + (L[0] - pk[0]) * t, rx = pk[0] + (R[0] - pk[0]) * t, cyCap = pk[1] + h * t;
  pts.push(pl, [lx, cyCap]);
  for (let i = 1; i < n; i++) { const u = i / n; pts.push([lx + (rx - lx) * u, cyCap + (i % 2 ? -h * 0.1 : h * 0.03)]); }
  pts.push([rx, cyCap], pr);
  o += P(`M${f(pl[0])} ${f(pl[1])}` + pts.slice(1).map(p => `L${f(p[0])} ${f(p[1])}`).join('') + `Q${f(pk[0])} ${f(pk[1])} ${f(pl[0])} ${f(pl[1])}Z`, C.cap);
  // cap shadow on the right half
  o += P(poly([[pk[0] + 2, pk[1] + r * 0.6], pr, [rx, cyCap], [lx + (rx - lx) * 0.8, cyCap - h * 0.1], [lx + (rx - lx) * 0.6, cyCap + h * 0.03]]), C.capSh);
  return o;
}
function tabBerg(x, base, w, h, C) {
  // distant tabular iceberg: flat top, steep sides, vertical striations, a shadow side
  const tl = x - w / 2 + h * 0.25, tr = x + w / 2 - h * 0.18;
  let o = P(poly([[x - w / 2, base], [tl, base - h], [tr, base - h], [x + w / 2, base]]), C.berg);
  o += P(poly([[x + w * 0.18, base], [x + w * 0.22, base - h], [tr, base - h], [x + w / 2, base]]), C.bergSh);
  let st = ''; for (let i = 1; i < 6; i++) { const u = i / 6, xx = tl + (tr - tl) * u * 0.7; st += `M${f(xx)} ${f(base - h + 4)}L${f(xx - 2)} ${f(base - h * 0.45)}`; }
  o += strokeP(st, C.bergLine, 1.4, ' opacity="0.6"');
  o += strokeP(`M${f(tl + 2)} ${f(base - h + 1.5)}L${f(tr - 2)} ${f(base - h + 1.5)}`, '#FFFFFF', 2.4, ' opacity="0.9"');
  return o;
}
function genFar(C, s) {
  PREC = 1;
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.55, C.mist, 0.5], [1, C.mist, 0.95]]);
  const baseY = x => 372 + wave([[6, 1, 0.4], [4, 3, 2.1]])(x);
  let o = '';
  const r = rng(7);
  // back range: tall, hazy peaks (sorted so overlapping order is stable)
  const back = [];
  for (let i = 0; i < 7; i++) { const x = (i + 0.2 + r() * 0.6) * W / 7; back.push([x, 190 + r() * 120, 270 + r() * 120, (r() - 0.5) * 70]); }
  for (const [x, h, w, sk] of back) o += wrap(x, w / 2 + 2, xx => mountain(xx, 392, w, h, sk, C, false));
  o += `<rect x="0" y="180" width="${W}" height="240" fill="url(#mist)" opacity="0.55"/>`;
  // front range: lower, crisper peaks
  const front = [];
  for (let i = 0; i < 5; i++) { const x = (i + 0.15 + r() * 0.7) * W / 5; front.push([x, 105 + r() * 75, 290 + r() * 110, (r() - 0.5) * 80]); }
  for (const [x, h, w, sk] of front) o += wrap(x, w / 2 + 2, xx => mountain(xx, 400, w, h, sk, C, true));
  // a soft snow field joining the bases
  o += P(bandD(x => baseY(x) - 20, 420), C.mFront);
  o += P(bandD(x => baseY(x) - 12, 420), C.berg);
  // breezy: snow plumes blowing off the front peaks
  if (C.drift) for (const [x, h, , sk] of front) o += wrap(x, 120, xx => P(`M${f(xx + sk)} ${f(400 - h + 4)}Q${f(xx + sk + 40)} ${f(400 - h - 14)} ${f(xx + sk + 110)} ${f(400 - h - 4)}Q${f(xx + sk + 50)} ${f(400 - h + 2)} ${f(xx + sk + 6)} ${f(400 - h + 14)}Z`, '#FFFFFF', ' opacity="0.55"'));
  // tabular icebergs along the distant shore
  for (const [x, w, h] of [[90, 120, 34], [400, 160, 44], [700, 100, 28], [980, 150, 40]]) o += wrap(x, w / 2 + 2, xx => tabBerg(xx, baseY(xx) - 8, w, h, C));
  o += `<rect x="0" y="300" width="${W}" height="120" fill="url(#mist)" opacity="0.8"/>`;
  // rainbow / sunny: a few glints on the caps
  if (C.sparkle >= 1) for (const [x, h, , sk] of front.slice(0, C.sparkle > 1 ? 7 : 3)) o += wrap(x, 10, xx => spark4(xx + sk - 6, 400 - h + 16, 6, '#FFFFFF', ' opacity="0.95"'));
  PREC = 10;
  return svg(1200, 420, o, defs);
}

// ================= mid_<s>.svg (0 0 1200 360): snow hills, igloo, ice ridges, pines, sea edge with icebergs =================
// The ground lip covers mid y > ~340 (mid bottom gy-10, ground lip gy-30), so detail lives above y 340.
const backY = x => 206 + wave([[14, 1, 0.3], [9, 2, 2.0], [5, 5, 4.1]])(x);
const shelfY = x => 266 + wave([[6, 1, 2.6], [5, 3, 0.8], [2, 7, 1.7]])(x);
const seaY = x => 300 + wave([[1.5, 2, 0.4], [1, 5, 1.3]])(x);   // open water from here down
const SEA = { y: 300, top: 298, bottom: 340, note: 'open sea band in mid_* svg coords; visible y 300..340 (ground lip hides the rest)' };

function pine(x, base, s, C, bend) {
  // snow-tipped fir: 4 tiers; bend > 0 leans the top to the right (wind)
  const tiers = 4; let o = ''; const bendIn = bend; bend = 0;
  o += rect(x - 3 * s, base - 12 * s, 6 * s, 12 * s, C.trunk, 1.5 * s);
  o += rect(x, base - 12 * s, 3 * s, 12 * s, C.trunkSh);
  const lean = i => bend * 4 * s * (i * i) / 3;
  for (let i = 0; i < tiers; i++) {
    const yb = base - 9 * s - i * 15 * s, w = (24 - i * 5) * s, top = yb - (22 - i * 1.5) * s, cx = x + lean(i), tx = x + lean(i + 0.9) + bend * 3 * s;
    o += P(`M${f(cx - w)} ${f(yb)}Q${f(cx - w * 0.5)} ${f(yb - 6 * s)} ${f(tx)} ${f(top)}Q${f(cx + w * 0.5)} ${f(yb - 6 * s)} ${f(cx + w)} ${f(yb)}Q${f(cx)} ${f(yb + 4 * s)} ${f(cx - w)} ${f(yb)}Z`, C.pine);
    o += P(`M${f(tx)} ${f(top)}Q${f(cx + w * 0.5)} ${f(yb - 6 * s)} ${f(cx + w)} ${f(yb)}Q${f(cx + w * 0.4)} ${f(yb + 3 * s)} ${f(cx + 2 * s)} ${f(yb + 2 * s)}Q${f(cx + w * 0.2)} ${f(yb - 8 * s)} ${f(tx)} ${f(top)}Z`, C.pineSh);
    // snow on the tier: a scalloped band hugging the upper edge
    const sy = yb - 4 * s;
    o += P(`M${f(cx - w * 0.92)} ${f(yb - 1 * s)}Q${f(cx - w * 0.45)} ${f(yb - 8 * s)} ${f(tx)} ${f(top)}Q${f(cx + w * 0.45)} ${f(yb - 8 * s)} ${f(cx + w * 0.92)} ${f(yb - 1 * s)}Q${f(cx + w * 0.6)} ${f(sy - 1 * s)} ${f(cx + w * 0.35)} ${f(sy + 1.5 * s)}Q${f(cx + w * 0.1)} ${f(sy - 3 * s)} ${f(cx - w * 0.15)} ${f(sy + 1 * s)}Q${f(cx - w * 0.45)} ${f(sy - 2.5 * s)} ${f(cx - w * 0.92)} ${f(yb - 1 * s)}Z`, C.pineSnow, ' opacity="0.97"');
  }
  // wind: lean the whole tree from its base (shear), the top more than the bottom
  if (bendIn) o = `<g transform="translate(${f(x)} ${f(base)}) skewX(${f(-20 * bendIn)}) translate(${f(-x)} ${f(-base)})">${o}</g>`;
  return o;
}
function igloo(x, base, s, C) {
  const rx = 50 * s, ry = 42 * s;
  let o = ell(x + 6 * s, base + 2 * s, rx * 1.12, 6 * s, C.shelfSh);
  // dome
  o += P(`M${f(x - rx)} ${f(base)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(base)}Z`, C.igloo, ` stroke="${C.iglooLine}" stroke-width="${f(3 * s)}"`);
  o += P(`M${f(x + rx * 0.25)} ${f(base - ry * 0.97)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(base)}L${f(x + rx * 0.45)} ${f(base)}Q${f(x + rx * 0.72)} ${f(base - ry * 0.55)} ${f(x + rx * 0.25)} ${f(base - ry * 0.97)}Z`, C.iglooSh);
  // block courses: elliptic rows + staggered joints
  let ln = '';
  const rows = [0.22, 0.45, 0.66, 0.84];
  rows.forEach((v, i) => {
    const yy = base - ry * v, half = rx * Math.sqrt(1 - v * v);
    ln += `M${f(x - half)} ${f(yy)}Q${f(x)} ${f(yy + 4 * s)} ${f(x + half)} ${f(yy)}`;
    const lo = i ? rows[i - 1] : 0, nb = 6 - i;
    for (let k = 0; k < nb; k++) {
      const u = (k + (i % 2 ? 0.5 : 0.25)) / nb * 2 - 1; if (Math.abs(u) > 0.92) continue;
      const hl = rx * Math.sqrt(1 - lo * lo);
      ln += `M${f(x + u * half)} ${f(yy + 1.5 * s)}L${f(x + u * hl)} ${f(base - ry * lo + (i ? 1.5 * s : 0))}`;
    }
  });
  o += strokeP(ln, C.iglooLine, 2 * s, ' opacity="0.85"');
  // entrance tunnel (front-left) with a blue-grey arched opening
  const ex = x - rx * 0.38, ew = 19 * s, eh = 22 * s;
  o += P(`M${f(ex - ew)} ${f(base)}V${f(base - eh + ew * 0.55)}Q${f(ex - ew)} ${f(base - eh - 4 * s)} ${f(ex)} ${f(base - eh - 4 * s)}Q${f(ex + ew)} ${f(base - eh - 4 * s)} ${f(ex + ew)} ${f(base - eh + ew * 0.55)}V${f(base)}Z`, C.igloo);
  o += strokeP(`M${f(ex - ew)} ${f(base)}V${f(base - eh + ew * 0.55)}Q${f(ex - ew)} ${f(base - eh - 4 * s)} ${f(ex)} ${f(base - eh - 4 * s)}Q${f(ex + ew)} ${f(base - eh - 4 * s)} ${f(ex + ew)} ${f(base - eh + ew * 0.55)}V${f(base)}`, C.iglooLine, 2 * s);
  const dw = 11 * s, dh = 16 * s;
  o += P(`M${f(ex - dw)} ${f(base)}V${f(base - dh + dw)}A${f(dw)} ${f(dw)} 0 0 1 ${f(ex + dw)} ${f(base - dh + dw)}V${f(base)}Z`, C.doorDark);
  o += P(`M${f(ex - dw + 4 * s)} ${f(base)}V${f(base - dh + dw)}A${f(dw - 4 * s)} ${f(dw - 4 * s)} 0 0 1 ${f(ex + dw - 4 * s)} ${f(base - dh + dw)}V${f(base)}Z`, C.doorDeep);
  // highlight upper-left
  o += P(`M${f(x - rx * 0.78)} ${f(base - ry * 0.5)}Q${f(x - rx * 0.6)} ${f(base - ry * 0.95)} ${f(x - rx * 0.1)} ${f(base - ry * 1.0)}`, 'none', ` stroke="#FFFFFF" stroke-width="${f(5 * s)}" stroke-linecap="round" opacity="0.9"`);
  // snow along the base
  o += P(`M${f(x - rx * 1.1)} ${f(base + 1)}Q${f(x - rx * 0.9)} ${f(base - 7 * s)} ${f(x - rx * 0.6)} ${f(base - 2 * s)}L${f(x + rx * 0.6)} ${f(base - 2 * s)}Q${f(x + rx * 0.95)} ${f(base - 8 * s)} ${f(x + rx * 1.15)} ${f(base + 1)}Z`, C.shelf);
  return o;
}
function ridge(x, base, s, seed, C) {
  // ice pressure ridge: a cluster of tilted angular slabs with a light face + shadow face + white top edge
  const r = rng(seed); let o = '';
  const n = 5;
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * 15 * s + (r() - 0.5) * 6 * s, h = (18 + r() * 22) * s * (i === 2 ? 1.25 : 1), w = (12 + r() * 6) * s, tilt = (r() - 0.5) * 14 * s;
    const pts = [[cx - w, base], [cx - w * 0.55 + tilt, base - h * 0.8], [cx + tilt * 1.3, base - h - 4 * s], [cx + w, base]];
    o += P(poly(pts), C.ridge);
    o += P(poly([[cx + w * 0.1 + tilt * 0.3, base], [cx + tilt * 1.3, base - h - 4 * s], [cx + w, base]]), C.ridgeSh);
    o += strokeP(line([pts[1], pts[2]]), C.ridgeHi, 2.4 * s);
  }
  o += P(`M${f(x - 50 * s)} ${f(base + 1)}Q${f(x)} ${f(base - 10 * s)} ${f(x + 52 * s)} ${f(base + 1)}Z`, C.shelf);
  return o;
}
function iceberg(x, wl, s, seed, C) {
  // small floating iceberg: faceted top above the waterline, a pale submerged hint + waterline highlight
  const r = rng(seed); const h = (22 + r() * 16) * s, w = (30 + r() * 14) * s;
  const pts = [[x - w, wl], [x - w * 0.78, wl - h * 0.55], [x - w * 0.35, wl - h], [x + w * 0.15, wl - h * 0.88], [x + w * 0.55, wl - h * 0.5], [x + w, wl]];
  let o = ell(x, wl + 4 * s, w * 0.95, 5 * s, C.seaLow, ' opacity="0.9"');
  o += P(poly(pts), C.berg);
  o += P(poly([[x - w * 0.05, wl], [x + w * 0.05, wl - h * 0.6], [x + w * 0.15, wl - h * 0.88], [x + w * 0.55, wl - h * 0.5], [x + w, wl]]), C.bergSh);
  o += strokeP(line([pts[1], pts[2], pts[3]]), '#FFFFFF', 2.4 * s, ' opacity="0.95"');
  o += strokeP(`M${f(x - w * 1.05)} ${f(wl + 0.5)}L${f(x + w * 1.05)} ${f(wl + 0.5)}`, C.seaHi, 2.6 * s);
  return o;
}
function genMid(C) {
  PREC = 1;
  const defs = lg('sea', 0, 0, 0, 1, [[0, C.seaTop], [0.35, C.sea], [1, C.seaLow]]);
  let o = '';
  // back snow hills with small pines
  o += P(bandD(backY, 360), C.hill);
  o += P(bandD(x => backY(x) + 26 + wave([[7, 3, 1.0]])(x), 360), C.hillSh, ' opacity="0.7"');
  o += strokeP(edgeD(x => backY(x) + 3), C.hillHi, 5);
  [[86, 0.55], [118, 0.48], [478, 0.6], [508, 0.5], [536, 0.56], [884, 0.5], [1012, 0.58], [1044, 0.5]].forEach(([x, s]) => {
    o += wrap(x, 30 * s, xx => pine(xx, backY(xx) + 14, s, C, C.bend * 0.8));
  });
  if (C.drift) o += [[260, 1], [700, 0.8], [1120, 0.9]].map(([x, s]) => wrap(x, 120, xx => P(`M${f(xx - 70 * s)} ${f(backY(xx) + 4)}Q${f(xx)} ${f(backY(xx) - 16 * s)} ${f(xx + 110 * s)} ${f(backY(xx) - 4)}Q${f(xx + 20 * s)} ${f(backY(xx) - 2)} ${f(xx - 70 * s)} ${f(backY(xx) + 4)}Z`, '#FFFFFF', ' opacity="0.6"'))).join('');
  // the front snow shelf (the far shore of the channel)
  o += P(between(shelfY, x => seaY(x) + 2), C.shelf);
  o += P(between(x => shelfY(x) + 12 + wave([[3, 4, 2.0]])(x), x => seaY(x) + 2), C.shelfSh, ' opacity="0.7"');
  o += strokeP(edgeD(x => shelfY(x) + 2.5), C.hillHi, 4);
  // ice cliff face down to the water
  const cliffTop = x => seaY(x) - 11 + wave([[2.5, 9, 0.5], [1.5, 17, 1.1]])(x);
  o += P(between(cliffTop, x => seaY(x) + 2), C.cliff);
  let cr = ''; { const rc = rng(31); for (let x = 14; x < W - 14; x += 34 + rc() * 40) cr += `M${f(x)} ${f(cliffTop(x) + 4)}L${f(x + 3)} ${f(seaY(x) - 2)}`; }
  o += strokeP(cr, C.cliffSh, 2.2, ' opacity="0.45"');
  o += P(between(x => seaY(x) - 4, x => seaY(x) + 2), C.cliffSh, ' opacity="0.55"');
  o += strokeP(edgeD(x => cliffTop(x) + 1, 6), C.cliffHi, 2.4);
  // ice ridges, igloo, pines on the shelf (back to front)
  [[600, 1.0, 41], [990, 0.85, 42], [40, 0.7, 43]].forEach(([x, s, sd]) => { o += wrap(x, 60 * s, xx => ridge(xx, shelfY(xx) + 10, s, sd, C)); });
  o += wrap(330, 70, xx => igloo(xx, shelfY(330) + 12, 1.0, C));
  [[176, 1.0], [214, 0.82], [712, 0.92], [748, 1.08], [782, 0.78], [1130, 0.95]].forEach(([x, s]) => {
    o += wrap(x, 34 * s, xx => pine(xx, shelfY(xx) + 12, s, C, C.bend));
  });
  // snow drifts in front of things
  [[150, 70], [460, 60], [760, 80], [1060, 64]].forEach(([x, w]) => { o += wrap(x, w, xx => P(`M${f(xx - w)} ${f(shelfY(xx) + 18)}Q${f(xx - w * 0.3)} ${f(shelfY(xx) + 6)} ${f(xx + w)} ${f(shelfY(xx) + 18)}Z`, C.shelf)); });
  if (C.wet) for (const [x, w] of [[90, 40], [520, 54], [880, 46]]) o += wrap(x, w, xx => strokeP(`M${f(xx - w)} ${f(shelfY(xx) + 22)}L${f(xx + w)} ${f(shelfY(xx) + 20)}`, C.cliffHi, 3, ' opacity="0.9"'));
  // the open sea
  o += P(bandD(seaY, 362), 'url(#sea)');
  o += strokeP(edgeD(x => seaY(x) + 1.5), C.seaLine, 2.4, ' opacity="0.8"');
  const r = rng(77);
  let rip = '';
  for (let i = 0; i < 16; i++) { const x = (i + r()) * W / 16, y = 310 + r() * 26, l = 14 + r() * 20; if (x - l > 0 && x + l < W) rip += `M${f(x - l)} ${f(y)}Q${f(x)} ${f(y - 2.5)} ${f(x + l)} ${f(y)}`; }
  o += strokeP(rip, C.seaHi, 2.2, ' opacity="0.85"');
  if (C.wet) { let rr = ''; for (let i = 0; i < 12; i++) { const x = 40 + (i + r() * 0.6) * (W - 80) / 12, y = 312 + r() * 22, rx = 7 + r() * 6; rr += `M${f(x - rx)} ${f(y)}A${f(rx)} ${f(rx * 0.3)} 0 1 0 ${f(x + rx)} ${f(y)}A${f(rx)} ${f(rx * 0.3)} 0 1 0 ${f(x - rx)} ${f(y)}`; } o += strokeP(rr, C.seaHi, 1.4, ' opacity="0.9"'); }
  // little icebergs
  [[120, 330, 0.8, 51], [430, 326, 1.15, 52], [655, 333, 0.6, 53], [905, 328, 1.0, 54], [1095, 334, 0.7, 55]].forEach(([x, wl, s, sd]) => { o += wrap(x, 46 * s, xx => iceberg(xx, wl, s, sd, C)); });
  if (C.sparkle >= 1) for (const [x, y, sr] of [[420, 300, 6], [900, 304, 5], [596, 248, 5], [340, 230, 4], [1004, 254, 4]].slice(0, C.sparkle > 1 ? 5 : 3)) o += spark4(x, y, sr, '#FFFFFF');
  if (C.pastel) [[200, 196], [640, 186], [1080, 200], [770, 238]].forEach(([x, y], i) => { o += spark4(x, y, 4, C.pastel[i % 4]); });
  PREC = 10;
  return svg(1200, 360, o, defs);
}

// ================= ground_<s>.svg (0 0 1200 260): snow bank; top edge ≈ y 40 =================
function chunk(x, y, s, C) {
  const pts = [[x - 9 * s, y], [x - 6 * s, y - 7 * s], [x + 2 * s, y - 10 * s], [x + 9 * s, y - 4 * s], [x + 8 * s, y]];
  return ell(x, y + 1, 11 * s, 2.6 * s, C.gDip) + P(poly(pts), C.gChunk) + P(poly([[x + 1 * s, y], [x + 2 * s, y - 10 * s], [x + 9 * s, y - 4 * s], [x + 8 * s, y]]), C.gChunkSh) + strokeP(line([pts[1], pts[2]]), '#FFFFFF', 1.6 * s);
}
function pebble(x, y, s, C) { return ell(x, y, 6 * s, 4 * s, C.pebble) + ell(x - 1.6 * s, y - 1.6 * s, 2.6 * s, 1.4 * s, '#FFFFFF', ' opacity="0.55"') + P(`M${f(x - 6 * s)} ${f(y - 1 * s)}Q${f(x)} ${f(y - 7 * s)} ${f(x + 6 * s)} ${f(y - 1 * s)}Q${f(x)} ${f(y - 3.5 * s)} ${f(x - 6 * s)} ${f(y - 1 * s)}Z`, C.gTop); }
function genGround(C) {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.gTop], [0.3, C.g], [1, C.gLow]]);
  const lip = x => 40 + wave([[3, 2, 0.7], [2, 5, 2.2], [1, 11, 0.4]])(x);
  let o = '';
  o += P(bandD(lip, 260, 4), 'url(#gfill)');
  // the bank's front edge: a soft blue shadow just under the rounded lip, then the white lip highlight
  o += P(between(x => lip(x) + 6, x => lip(x) + 14 + wave([[3, 4, 1.2], [2, 9, 0.3]])(x)), C.gDip, ' opacity="0.65"');
  o += strokeP(edgeD(x => lip(x) + 1, 6), C.gRim, 3);
  o += strokeP(edgeD(x => lip(x) + 4.5, 6), C.gLipHi, 3, ' opacity="0.95"');
  const r = rng(21);
  // soft snow lumps: shadowed dips under rounded swells
  for (let i = 0; i < 11; i++) { const x = (i + r()) * W / 11, y = 80 + r() * 160, rx = 50 + r() * 60; o += wrap(x, rx, xx => P(`M${f(xx - rx)} ${f(y)}Q${f(xx)} ${f(y - 12)} ${f(xx + rx)} ${f(y)}Q${f(xx)} ${f(y + 7)} ${f(xx - rx)} ${f(y)}Z`, C.gDip, ' opacity="0.7"') + strokeP(`M${f(xx - rx * 0.7)} ${f(y - 5)}Q${f(xx)} ${f(y - 12)} ${f(xx + rx * 0.6)} ${f(y - 6)}`, '#FFFFFF', 2.4, ' opacity="0.9"')); }
  // ice chunks + a few pebbles poking out
  for (let i = 0; i < 9; i++) { const x = (i + 0.2 + r() * 0.6) * W / 9, y = 70 + r() * 170, s = 0.8 + r() * 0.7; o += wrap(x, 14 * s, xx => chunk(xx, y, s, C)); }
  for (let i = 0; i < 6; i++) { const x = (i + r()) * W / 6, y = 90 + r() * 150, s = 0.8 + r() * 0.5; o += wrap(x, 8 * s, xx => pebble(xx, y, s, C)); }
  if (C.drift) {
    // wind ripples in the snow + a drift curling off the lip
    for (let i = 0; i < 14; i++) { const x = (i + r()) * W / 14, y = 64 + r() * 180, l = 30 + r() * 40; o += wrap(x, l + 4, xx => strokeP(`M${f(xx - l)} ${f(y)}Q${f(xx - l * 0.3)} ${f(y - 6)} ${f(xx)} ${f(y - 1)}T${f(xx + l)} ${f(y - 2)}`, C.gRim, 2, ' opacity="0.7"') + strokeP(`M${f(xx - l)} ${f(y - 2.5)}Q${f(xx - l * 0.3)} ${f(y - 8.5)} ${f(xx)} ${f(y - 3.5)}`, '#FFFFFF', 1.8)); }
    for (const x of [180, 620, 1010]) o += wrap(x, 90, xx => P(`M${f(xx - 60)} ${f(lip(xx - 60) + 2)}Q${f(xx)} ${f(lip(xx) - 12)} ${f(xx + 80)} ${f(lip(xx + 80) - 4)}Q${f(xx + 10)} ${f(lip(xx) - 2)} ${f(xx - 60)} ${f(lip(xx - 60) + 2)}Z`, '#FFFFFF', ' opacity="0.9"'));
  }
  if (C.wet) {
    // puddles (meltwater on the snow bank) with sky reflections, and a wet sheen
    for (const [x, y, rx] of [[120, 120, 70], [430, 200, 90], [660, 104, 54], [880, 176, 80], [1130, 226, 60]]) {
      o += wrap(x, rx + 4, xx => ell(xx, y + 2, rx + 4, rx * 0.17 + 3, C.gRim, ' opacity="0.7"') + ell(xx, y, rx, rx * 0.17, C.puddle) + ell(xx + rx * 0.15, y + rx * 0.05, rx * 0.7, rx * 0.09, C.puddleSh, ' opacity="0.6"') +
        strokeP(`M${f(xx - rx * 0.6)} ${f(y - rx * 0.05)}L${f(xx - rx * 0.1)} ${f(y - rx * 0.07)}M${f(xx + rx * 0.1)} ${f(y + rx * 0.02)}L${f(xx + rx * 0.4)} ${f(y)}`, C.puddleHi, 2.4));
    }
    for (let i = 0; i < 10; i++) { const x = (i + r()) * W / 10, y = 60 + r() * 190, l = 18 + r() * 24; o += wrap(x, l, xx => strokeP(`M${f(xx - l)} ${f(y)}L${f(xx + l)} ${f(y - 1.5)}`, C.puddleHi, 2.2, ' opacity="0.9"')); }
  }
  // sparkle dots (more on sunny / rainbow)
  const nS = Math.round(40 * C.sparkle);
  let dots = '';
  for (let i = 0; i < nS; i++) { const x = r() * W, y = 52 + r() * 205, rr = 1.1 + r() * 1.1; if (x > 4 && x < W - 4) dots += `M${f(x - rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0`; }
  if (dots) o += P(dots, '#FFFFFF');
  if (C.sparkle >= 1) for (let i = 0; i < Math.round(6 * C.sparkle); i++) { const x = 30 + r() * (W - 60), y = 60 + r() * 180; o += spark4(x, y, 4 + r() * 3, C.pastel ? C.pastel[i % 4] : '#FFFFFF', C.pastel ? '' : ' opacity="0.95"') + (C.pastel ? spark4(x, y, 2, '#FFFFFF') : ''); }
  return svg(1200, 260, o, defs);
}

// ================= sun, clouds, rainbow =================
function genSun() {
  // pale buttery disc (much lighter than the yellow answer #FFD23F) + soft rounded rays, no face
  const defs = rg('glow', [[0, '#FFF8DE', 0.9], [0.45, '#FFF2C8', 0.45], [1, '#FFF2C8', 0]]) + rg('disc', [[0, '#FFFCEA'], [0.7, '#FFF3C4'], [1, '#FBEAB0']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 88; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEFC0', 9, ' opacity="0.9"');
  o += circ(100, 100, 55, '#F5E3A8') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFFFA', ' opacity="0.85" transform="rotate(-30 84 80)"');
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
  out.cloud1 = mk([[66, 106, 32], [116, 84, 44], [174, 74, 50], [228, 98, 38], [150, 110, 34]], '#FFFFFF', '#DCE6EF', '#FFFFFF', 132);
  out.cloud2 = mk([[58, 112, 26], [102, 94, 36], [152, 98, 34], [200, 106, 28], [244, 116, 22]], '#FFFFFF', '#DFE7F0', '#FFFFFF', 134);
  out.cloud3 = mk([[76, 100, 38], [136, 70, 52], [194, 84, 42], [236, 110, 28], [128, 112, 34]], '#FFFFFF', '#D9E3ED', '#FFFFFF', 136);
  return out;
}
function genRainbow() {
  // soft pastel arc, centre below the image; legs fade out at the bottom (mask), transparent elsewhere
  const cx = 600, cy = 560, bands = ['#F7B9BE', '#FAD3AE', '#F8EAAE', '#C9E8BE', '#B9DAF2', '#D2C4EE'], bw = 22, r0 = 530;
  const defs = lg('fade', 0, 0, 0, 1, [[0, '#FFFFFF'], [0.62, '#FFFFFF'], [1, '#FFFFFF', 0]]) +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="500"><rect x="0" y="0" width="1200" height="500" fill="url(#fade)"/></mask>`;
  const arc = r => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)}`;
  const band = (r, col, w, a) => `<path d="${arc(r)}" fill="none" stroke="${col}" stroke-width="${f(w)}" opacity="${a}"/>`;
  let o = band(r0 - bw * 2.5, '#FFFFFF', bw * 8, 0.22);
  bands.forEach((c, i) => { o += band(r0 - i * bw, c, bw + 1, 0.8); });
  o += band(r0 + bw / 2 - 2, '#FFFFFF', 3, 0.5);
  return svg(1200, 500, `<g mask="url(#m)">${o}</g>`, defs);
}

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F3F9FF')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#FFEBAE" stroke="#FFEBAE" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFCEA"/>`);
  // snowflakes: snow1 = soft round flake, snow2 = little six-arm crystal
  p.snow1 = S(circ(16, 16, 11, 'url(#sn)') + circ(16, 16, 6.5, '#FFFFFF') + circ(14, 14, 2.2, '#FFFFFF'), rg('sn', [[0, '#FFFFFF', 0.9], [0.6, '#F1F7FC', 0.6], [1, '#E6F0F8', 0]]));
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, c = Math.cos(a), s = Math.sin(a); arms += `M16 16L${f(16 + c * 12)} ${f(16 + s * 12)}M${f(16 + c * 7)} ${f(16 + s * 7)}L${f(16 + c * 7 + Math.cos(a + 0.8) * 4)} ${f(16 + s * 7 + Math.sin(a + 0.8) * 4)}M${f(16 + c * 7)} ${f(16 + s * 7)}L${f(16 + c * 7 + Math.cos(a - 0.8) * 4)} ${f(16 + s * 7 + Math.sin(a - 0.8) * 4)}`; }
  p.snow2 = S(strokeP(arms, '#CFE0EE', 3.6) + strokeP(arms, '#FFFFFF', 2) + circ(16, 16, 2.6, '#FFFFFF'));
  // rain drop: a slim falling streak with a rounded head (pale blue-white, reads on grey-blue sky); points DOWN
  p.drop = S(`${P('M16 3Q19.6 13 21.2 20.2A5.3 5.3 0 0 1 10.8 20.2Q12.4 13 16 3Z', '#DCEAF5', ' stroke="#9DB9CF" stroke-width="1.4" stroke-linejoin="round"')}${P('M16 3Q19.6 13 21.2 20.2A5.3 5.3 0 0 1 16 25.5Q19 17 16 3Z', '#BFD5E6')}${ell(13.8, 19.5, 1.4, 3, '#FFFFFF', ' opacity="0.95"')}`);
  // splash: a little crown ring on the ice + two flying droplets (thin blue-grey edge so it reads on white snow too)
  const ed = ' stroke="#9DB9CF" stroke-width="1.1" stroke-linejoin="round"';
  p.splash = S(`<ellipse cx="16" cy="23" rx="11" ry="4" fill="none" stroke="#9DB9CF" stroke-width="3.6"/><ellipse cx="16" cy="23" rx="11" ry="4" fill="none" stroke="#E6F0F8" stroke-width="2"/>${P('M7 22Q8 14 10.5 12Q10 17 11 22Z', '#E6F0F8', ed)}${P('M25 22Q24 14 21.5 12Q22 17 21 22Z', '#E6F0F8', ed)}${P('M14.4 21Q15 12 16 9Q17 12 17.6 21Z', '#F1F7FC', ed)}${circ(9, 7.5, 1.9, '#E6F0F8', ed)}${circ(23.5, 6.5, 1.7, '#E6F0F8', ed)}`);
  // ice shard: an angular translucent splinter with a bright facet
  p.shard = S(`${P('M8 26L5 13L15 3L27 9L22 24Z', '#D3ECF8', ' opacity="0.95"')}${P('M15 3L27 9L22 24L15 15Z', '#A9D2E8')}${P('M8 26L5 13L15 3L15 15Z', '#EAF7FD')}${strokeP('M5.6 12.6L14.6 4', '#FFFFFF', 1.8)}${strokeP('M8 26L5 13L15 3L27 9L22 24Z', '#8FBFDA', 1.2, ' opacity="0.8"')}`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#EEF4F9', 0.8], [1, '#DFE9F1', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  return p;
}

// ---------------- write ----------------
const FILL = {}; for (const k in STAGES) FILL[k] = STAGES[k].fill;   // render.js colour below the ground art
if (require.main === module) {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  // forest-only leftovers
  for (const s of ['spring', 'summer', 'autumn', 'winter']) for (const l of ['far', 'mid', 'ground']) { try { fs.unlinkSync(path.join(env, `${l}_${s}.svg`)); } catch (e) { /* gone */ } }
  for (const n of ['petal', 'leaf_a', 'leaf_b', 'firefly']) { try { fs.unlinkSync(path.join(par, n + '.svg')); } catch (e) { /* gone */ } }
  const files = { sun: genSun(), ...genClouds(), rainbow: genRainbow() };
  for (const s of Object.keys(STAGES)) { const C = STAGES[s]; files['far_' + s] = genFar(C, s); files['mid_' + s] = genMid(C); files['ground_' + s] = genGround(C); }
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
  const parts = genParticles();
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
  for (const [k, v] of [...Object.entries(files).map(([k, v]) => ['env/' + k, v]), ...Object.entries(parts).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024;
    const blur = (v.match(/feGaussianBlur/g) || []).length;
    const m = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
    const okBox = m && m[1] === m[3] && m[2] === m[4];
    console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 90 ? '  TOO BIG' : ''}${/<text|<script|href=|@import|font|NaN|undefined/.test(v) || blur > 1 ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}`);
  }
  console.log('SEA (mid svg coords):', JSON.stringify(SEA), ' FILL:', JSON.stringify(FILL));
}
module.exports = { STAGES, SEA, FILL, seaY, shelfY };
