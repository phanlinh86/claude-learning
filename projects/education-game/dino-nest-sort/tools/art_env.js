// Dino Nest Sort: environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/*.svg and particles/*.svg, then (unless --no-qa) renders QA PNGs with Playwright:
//   docs/art/env_sheet.png  (sun, clouds, rainbow, layers, particles at 4x)
//   docs/art/scene_<device>_<mood>.png  (sky gradient + far + mid + ground + stand-in eggs/nest, 4 moods x 3 screens)
//   /tmp/dino-env-qa/seam_*.png + numeric seam report (layers tiled 3x, joins at 2x zoom)
// Usage: node tools/art_env.js [--no-qa]
// Technique (from daily-game/foxy-reef-memory/tools/art-environment): every ridge is a sum of sines with integer
// periods over W, and every object near an edge is drawn again at x±W, so the left and right edges match exactly.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
let PREC = 10; // 0.1 px; the dense mid layer uses whole px to stay small
const f = n => (Math.round(n * PREC) / PREC).toString();

// ---------------- helpers ----------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const wave = terms => x => terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const pd = d => `<path d="${d}"/>`;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const line = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L');
function svg(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
// draw fn at x and its wrapped copies so objects crossing an edge tile seamlessly
function wrap(x, half, fn) { let o = fn(x); if (x + half > W) o += fn(x - W); if (x - half < 0) o += fn(x + W); return o; }
// tileable band: top edge y(x), filled to `bottom`
function bandD(yf, bottom, step = 6) { const pts = [[0, bottom]]; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); pts.push([W, bottom]); return poly(pts); }
function edgeD(yf, step = 6) { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, yf(x)]); return line(pts); }
const lg = (id, x1, y1, x2, y2, stops, units = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';

// ---------------- palette ----------------
const C = {
  // far: misty blue-violet
  farBack: '#CBCDEC', farBackSh: '#BBBDE3', farFront: '#AEB1DD', farFrontSh: '#9EA1D2', farHi: '#DCDAF2',
  volc: '#A6A5D8', volcSh: '#9592CB', volcHi: '#C2BFE6', volcLip: '#BDB8E4', volcFace: '#6F69A6', volcCheek: '#E0A9C9', mist: '#ECEAF8', smoke: '#F6F4FC', smokeSh: '#DCD8F0',
  // mid: soft yellow-greens
  hillBack: '#C3DB98', hillBackHi: '#D3E6AC', hillFront: '#AACD82', hillFrontHi: '#C0DD97',
  palmTrunk: '#C49A6C', palmTrunkSh: '#A67E55', palmRing: '#9A744E', frond: '#93C162', frondSh: '#7EAC52', frondHi: '#B5D985',
  fern: '#8FBE64', fernSh: '#7AAA55', bush: '#A0C873', bushSh: '#8BB663', rock: '#C9C0AE', rockSh: '#AEA48F', rockHi: '#E0DACC',
  // ground
  grassTop: '#C7E29A', grass: '#B6D683', grassLow: '#A5C774', grassDark: '#97BA67', blade: '#9EC26C', bladeHi: '#CFE6A6',
  dirt: '#DCC497', dirtSh: '#CBB083', pebble: '#D3CBBB', pebbleSh: '#B9AF9C', pebbleHi: '#ECE7DD',
  flowers: [['#FFFFFF', '#FFD86B'], ['#FFD9E4', '#FFC24D'], ['#FFF1A8', '#F5A845'], ['#E9DEFF', '#FFD86B']],
};

// ---------------- far.svg (0 0 1200 420) ----------------
// rounded cartoon peak profile: height h at dx=0, falls to 0 at |dx| = R, with a soft flared foot
const peakY = (dx, R) => { const t = Math.min(1, Math.abs(dx) / R); return Math.pow(0.5 + 0.5 * Math.cos(Math.PI * t), 0.85); };
function mountain(x0, base, h, R, col, sh, hi, seed) {
  const r = rng(seed); const pts = []; const n = 40;
  const jitter = wave([[3, 7, r() * 6], [2, 13, r() * 6]]);
  const foot = (420 - base) * 1.6; // feet keep sloping gently down to y 420 (no vertical edges)
  for (let i = 0; i <= n; i++) { const dx = -R + 2 * R * i / n; pts.push([x0 + dx, base - h * peakY(dx, R) + (Math.abs(dx) < R * 0.9 ? jitter(x0 + dx) * 0.6 : 0)]); }
  pts.push([x0 + R + foot, 420], [x0 - R - foot, 420]);
  let o = P(poly(pts), col);
  // one-step shading: right flank darker (from the peak down the right side, then straight down)
  const sp = [[x0, base - h]]; for (let i = 0; i <= 20; i++) { const dx = R * i / 20; sp.push([x0 + dx, base - h * peakY(dx, R) + (dx < R * 0.9 ? jitter(x0 + dx) * 0.6 : 0)]); }
  sp.push([x0 + R + foot, 420], [x0 + R * 0.5, 420], [x0 + R * 0.2, base - h * 0.35]);
  o += P(poly(sp), sh);
  // soft highlight facet on the upper-left slope
  if (hi) {
    const hp = []; for (let i = 0; i <= 10; i++) { const dx = -R * 0.42 * i / 10; hp.push([x0 + dx, base - h * peakY(dx, R) + 1.5]); }
    hp.push([x0 - R * 0.2, base - h * 0.55], [x0 - R * 0.04, base - h * 0.86]);
    o += P(poly(hp), hi, ' opacity="0.8"');
  }
  return o;
}
function volcano(x0) {
  // calm, cute volcano: soft trapezoid, flat crater, sleepy smile
  const top = 132, base = 420, rt = 40, rb = 270;
  const d = `M${x0 - rb} ${base}C${x0 - rb + 120} ${base - 70} ${x0 - rt - 34} ${top + 70} ${x0 - rt} ${top + 6}Q${x0 - rt + 4} ${top - 4} ${x0 - rt + 16} ${top - 2}Q${x0} ${top + 8} ${x0 + rt - 16} ${top - 2}Q${x0 + rt - 4} ${top - 4} ${x0 + rt} ${top + 6}C${x0 + rt + 34} ${top + 70} ${x0 + rb - 120} ${base - 70} ${x0 + rb} ${base}Z`;
  let o = P(d, C.volc);
  // shadow: right flank
  o += P(`M${x0 + 6} ${top + 4}Q${x0 + rt - 4} ${top - 2} ${x0 + rt} ${top + 6}C${x0 + rt + 34} ${top + 70} ${x0 + rb - 120} ${base - 70} ${x0 + rb} ${base}L${x0 + 60} ${base}C${x0 + 70} ${base - 120} ${x0 + 30} ${top + 90} ${x0 + 6} ${top + 4}Z`, C.volcSh);
  // highlight: upper-left
  o += P(`M${x0 - rt + 6} ${top + 10}C${x0 - rt - 16} ${top + 60} ${x0 - rt - 44} ${top + 100} ${x0 - rt - 70} ${top + 140}C${x0 - rt - 30} ${top + 120} ${x0 - rt - 4} ${top + 70} ${x0 - rt + 14} ${top + 16}Z`, C.volcHi, ' opacity="0.9"');
  // crater lip (lighter rim) + inner dark mouth
  o += ell(x0, top + 1, rt - 6, 7, C.volcLip);
  o += ell(x0, top + 2, rt - 16, 3.6, C.volcFace, ' opacity="0.55"');
  // sleepy face: closed happy eyes, rosy cheeks, small smile
  const fy = top + 112;
  o += strokeP(`M${x0 - 44} ${fy}q10 -9 20 0`, C.volcFace, 4.5);
  o += strokeP(`M${x0 + 24} ${fy}q10 -9 20 0`, C.volcFace, 4.5);
  o += ell(x0 - 52, fy + 20, 13, 7, C.volcCheek, ' opacity="0.55"');
  o += ell(x0 + 52, fy + 20, 13, 7, C.volcCheek, ' opacity="0.55"');
  o += strokeP(`M${x0 - 14} ${fy + 20}q14 12 28 0`, C.volcFace, 4.5);
  // little smoke wisp (three soft puffs drifting right)
  const puffs = [[x0 + 4, top - 18, 13], [x0 + 20, top - 44, 17], [x0 + 10, top - 78, 21], [x0 + 32, top - 104, 15]];
  puffs.forEach(([x, y, r], i) => { o += circ(x + 2, y + 3, r, C.smokeSh, ` opacity="${0.7 - i * 0.1}"`); o += circ(x, y, r, C.smoke, ` opacity="${0.85 - i * 0.12}"`); });
  return o;
}
function genFar() {
  const defs = lg('mist', 0, 0, 0, 1, [[0, C.mist, 0], [0.55, C.mist, 0.35], [1, C.mist, 0.75]]);
  let o = '';
  // back range (lightest, hazy)
  const back = [[60, 300, 150, 190], [300, 300, 120, 170], [520, 310, 175, 200], [930, 305, 160, 190], [1110, 300, 120, 160]];
  back.forEach(([x, b, h, R], i) => { o += wrap(x, R + (420 - b) * 1.6, xx => mountain(xx, b, h, R, C.farBack, C.farBackSh, C.farHi, 11 + i)); });
  // haze over the back range so the volcano separates
  o += `<rect x="0" y="230" width="${W}" height="190" fill="url(#mist)" opacity="0.55"/>`;
  // the one calm volcano
  o += volcano(720);
  // front range (lower, a bit deeper)
  const front = [[150, 380, 105, 190], [420, 385, 80, 160], [1000, 382, 100, 180], [1200, 388, 70, 150], [600, 395, 45, 140], [860, 392, 55, 140]];
  front.forEach(([x, b, h, R], i) => { o += wrap(x, R + (420 - b) * 1.6, xx => mountain(xx, b, h, R, C.farFront, C.farFrontSh, null, 31 + i)); });
  // continuous base hills (tileable), then bottom mist
  const baseW = wave([[8, 2, 0.4], [5, 5, 1.3], [3, 9, 2.1]]);
  o += P(bandD(x => 372 + baseW(x), 420), C.farFront);
  o += `<rect x="0" y="300" width="${W}" height="120" fill="url(#mist)"/>`;
  return svg(1200, 420, o, defs);
}

// ---------------- mid.svg (0 0 1200 360) ----------------
function palm(x, baseY, h, lean, seed) {
  const r = rng(seed);
  // trunk: quadratic curve, tapered polygon
  const p0 = [x, baseY], p2 = [x + lean, baseY - h], p1 = [x + lean * 0.1, baseY - h * 0.55];
  const bz = t => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
  const L = [], R = [], N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = bz(Math.max(0, t - 0.01)), b = bz(Math.min(1, t + 0.01)); let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    const w = 9 - 4 * t; const c = bz(t); L.push([c[0] + nx * w, c[1] + ny * w]); R.push([c[0] - nx * w, c[1] - ny * w]);
  }
  let o = '';
  const fr = (ang, len, droop, col, hiOn) => {
    const top = p2; const dx = Math.cos(ang), dy = Math.sin(ang); const M = 14; const up = [], dn = [];
    const mid = t => [top[0] + dx * len * t, top[1] + dy * len * t + droop * len * t * t];
    for (let i = 0; i <= M; i++) {
      const t = i / M; const a = mid(Math.max(0, t - 0.02)), b = mid(Math.min(1, t + 0.02)); let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      const saw = (i % 2) ? 0.74 : 1; const w = 16 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (i > 1 && i < M ? saw : 1);
      const c = mid(t); up.push([c[0] + nx * w, c[1] + ny * w]); dn.push([c[0] - nx * w * 0.8, c[1] - ny * w * 0.8]);
    }
    let s = P(poly(up.concat(dn.reverse())), col);
    if (hiOn) { const m = []; for (let i = 1; i < M - 2; i += 2) m.push(mid(i / M)); s += strokeP(line(m), C.frondHi, 2.2, ' opacity="0.85"'); }
    return s;
  };
  // back fronds (darker), trunk, front fronds
  const backA = [-2.5, -0.65, -1.6], frontA = [-3.0, -2.15, -1.2, -0.25, 0.3];
  backA.forEach(a => { o += fr(a + (r() - 0.5) * 0.2, 62 + r() * 14, 0.55, C.frondSh, false); });
  o += P(poly(L.concat(R.reverse())), C.palmTrunk);
  // shade the right side of the trunk
  const Rs = []; for (let i = 0; i <= N; i++) { const t = i / N, c = bz(t); Rs.push([c[0] + 1.5, c[1]]); }
  o += P(poly(Rs.concat(R.slice().reverse())), C.palmTrunkSh, ' opacity="0.9"');
  // rings
  let rings = ''; for (let i = 2; i < N; i += 2) { const t = i / N, c = bz(t), w = 9 - 4 * t; rings += `M${f(c[0] - w + 1)} ${f(c[1])}q${f(w - 1)} 4 ${f(2 * w - 2)} 0`; }
  o += strokeP(rings, C.palmRing, 2, ' opacity="0.7"');
  frontA.forEach(a => { o += fr(a + (r() - 0.5) * 0.2, 70 + r() * 18, 0.6, C.frond, true); });
  o += circ(p2[0], p2[1] + 2, 6, C.palmTrunkSh) + circ(p2[0] + 7, p2[1] + 5, 5, C.palmTrunkSh);
  return o;
}
function fernClump(x, y, s, seed, col = C.fern, sh = C.fernSh) {
  const r = rng(seed); let o = '';
  const frond = (ang, len, c) => {
    const dx = Math.cos(ang), dy = Math.sin(ang); const M = 16; const up = [], dn = [];
    const side = dx >= 0 ? 1 : -1; const mid = t => [x + dx * len * t + side * len * 0.15 * t * t, y + dy * len * t + len * 0.75 * t * t];
    for (let i = 0; i <= M; i++) {
      const t = i / M; const a = mid(Math.max(0, t - 0.02)), b = mid(Math.min(1, t + 0.02)); let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      const lob = (i % 2) ? 0.45 : 1; const w = 11 * s * Math.pow(1 - t, 0.6) * Math.min(1, t * 5) * (i > 0 && i < M ? lob : 1);
      const c = mid(t); up.push([c[0] + nx * w, c[1] + ny * w]); dn.push([c[0] - nx * w, c[1] - ny * w]);
    }
    return P(poly(up.concat(dn.reverse())), c);
  };
  const n = 7; for (let i = 0; i < n; i++) { const a = -Math.PI + 0.35 + (Math.PI - 0.7) * i / (n - 1) + (r() - 0.5) * 0.15; o += frond(a, (52 + r() * 18) * s, i % 2 ? sh : col); }
  for (let i = 0; i < 4; i++) { const a = -Math.PI * 0.82 + Math.PI * 0.64 * i / 3; o += frond(a, (40 + r() * 10) * s, col); }
  return o;
}
function rock(x, y, w, h) {
  const d = (cx, cy, ww, hh) => `M${f(cx - ww / 2)} ${f(cy)}C${f(cx - ww / 2)} ${f(cy - hh * 0.8)} ${f(cx - ww * 0.3)} ${f(cy - hh)} ${f(cx)} ${f(cy - hh)}C${f(cx + ww * 0.35)} ${f(cy - hh)} ${f(cx + ww / 2)} ${f(cy - hh * 0.7)} ${f(cx + ww / 2)} ${f(cy)}Z`;
  return P(d(x, y, w, h), C.rockSh) + P(d(x - w * 0.06, y - h * 0.08, w * 0.84, h * 0.88), C.rock) + ell(x - w * 0.18, y - h * 0.7, w * 0.13, h * 0.11, C.rockHi, ' opacity="0.9"');
}
function bush(x, y, s, seed) {
  const r = rng(seed); const cs = [[-34, -14, 20], [-14, -26, 24], [10, -28, 22], [30, -14, 19], [0, -10, 22]];
  let o = cs.map(([dx, dy, rr]) => circ(x + dx * s + 3, y + dy * s + 3, rr * s, C.bushSh)).join('');
  o += cs.map(([dx, dy, rr]) => circ(x + dx * s, y + dy * s, rr * s * (0.92 + r() * 0.06), C.bush)).join('');
  o += ell(x - 14 * s, y - 36 * s, 9 * s, 5 * s, C.hillFrontHi, ' opacity="0.8"');
  return o;
}
function genMid() {
  PREC = 1;
  const backY = x => 212 + wave([[18, 1, 0.3], [12, 2, 2.0], [6, 5, 4.1]])(x);
  const frontY = x => 268 + wave([[16, 1, 2.6], [10, 3, 0.8], [4, 7, 1.7]])(x);
  let o = '';
  o += P(bandD(backY, 360), C.hillBack);
  o += strokeP(edgeD(x => backY(x) + 3), C.hillBackHi, 5, ' opacity="0.9"');
  // palms and bushes on the back hill
  const palms = [[110, 190, 150, 24, 1], [175, 200, 118, -18, 2], [640, 205, 140, 26, 3], [985, 196, 150, -22, 4], [1045, 206, 105, 16, 5]];
  palms.forEach(([x, dy, h, lean, s]) => { o += wrap(x, 120, xx => palm(xx, frontY(xx) + 10, h + (frontY(xx) - backY(xx)), lean, s * 17)); });
  [[380, 7], [800, 8], [520, 9]].forEach(([x, s]) => { o += wrap(x, 60, xx => bush(xx, backY(xx) + 12, 0.9, s)); });
  o += P(bandD(frontY, 360), C.hillFront);
  o += strokeP(edgeD(x => frontY(x) + 3), C.hillFrontHi, 6, ' opacity="0.9"');
  // big ferns + rounded rocks on the front hill
  [[60, 1.1], [300, 1.25], [760, 1.0], [880, 1.3], [1140, 0.9]].forEach(([x, s], i) => { o += wrap(x, 100 * s, xx => fernClump(xx, frontY(xx) + 14, s, 40 + i)); });
  [[230, 64, 40], [560, 90, 50], [610, 46, 30], [1010, 70, 44]].forEach(([x, w, h]) => { o += wrap(x, w, xx => rock(xx, frontY(xx) + 16, w, h)); });
  PREC = 10;
  return svg(1200, 360, o);
}

// ---------------- ground.svg (0 0 1200 260) ----------------
function flower(x, y, s, cols) {
  let o = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; o += circ(x + Math.cos(a) * 4.2 * s, y + Math.sin(a) * 4.2 * s, 3.4 * s, cols[0]); }
  return strokeP(`M${f(x)} ${f(y + 4 * s)}l0 ${f(7 * s)}`, C.grassDark, 1.8 * s) + o + circ(x, y, 2.6 * s, cols[1]);
}
function tuft(x, y, s, col) { return strokeP(`M${f(x - 6 * s)} ${f(y - 9 * s)}Q${f(x - 3 * s)} ${f(y - 2 * s)} ${f(x - 1 * s)} ${f(y)}M${f(x)} ${f(y - 12 * s)}L${f(x)} ${f(y)}M${f(x + 6 * s)} ${f(y - 8 * s)}Q${f(x + 3 * s)} ${f(y - 2 * s)} ${f(x + 1 * s)} ${f(y)}`, col, 2.4 * s); }
function genGround() {
  const defs = lg('gfill', 0, 0, 0, 1, [[0, C.grass], [0.5, C.grassLow], [1, C.grassDark]]);
  // scalloped grass lip: small periodic tufts (60 scallops over W), top edge ≈ y 40
  const lip = x => 40 + wave([[2.5, 2, 0.7], [1.5, 5, 2.2]])(x) - 5 * Math.abs(Math.sin(Math.PI * 60 * x / W)) + 2.5;
  let o = '';
  o += P(bandD(lip, 260, 2), 'url(#gfill)');
  // lighter top rim (calm, wide)
  const rimBottom = x => 58 + wave([[3, 3, 1.1], [2, 7, 0.2]])(x);
  const rim = [[0, lip(0)]]; for (let x = 0; x <= W; x += 2) rim.push([x, lip(x)]); for (let x = W; x >= 0; x -= 6) rim.push([x, rimBottom(x)]);
  o += P(poly(rim), C.grassTop);
  const r = rng(7);
  // dirt patches (soft, wide, mostly lower down so the nest line stays calm)
  [[180, 122, 62, 12], [650, 132, 84, 14], [1010, 112, 54, 10], [410, 150, 70, 12], [1170, 140, 60, 11], [860, 200, 80, 14]].forEach(([x, y, rx, ry]) => {
    const blob = (xx, dy, k, col) => ell(xx, y + dy, rx * k, ry * k, col) + ell(xx + rx * 0.55, y + dy - ry * 0.35, rx * 0.55 * k, ry * 0.8 * k, col) + ell(xx - rx * 0.6, y + dy + ry * 0.2, rx * 0.45 * k, ry * 0.7 * k, col);
    o += wrap(x, rx * 1.4, xx => blob(xx, 2.5, 1, C.dirtSh) + blob(xx - 2, 0, 0.9, C.dirt) + ell(xx - rx * 0.25, y - ry * 0.3, rx * 0.3, ry * 0.18, '#E7D4AE', ' opacity="0.8"'));
  });
  // pebbles near the dirt
  const peb = [[125, 128, 6], [245, 112, 4.5], [580, 142, 7], [722, 124, 4.5], [705, 146, 3.5], [965, 118, 5], [1060, 102, 4], [480, 156, 5.5], [360, 140, 4.5], [1120, 150, 6], [40, 136, 5], [820, 210, 6], [300, 220, 5]];
  peb.forEach(([x, y, s]) => { o += wrap(x, 12, xx => ell(xx + 1, y + 1.5, s * 1.3, s * 0.85, C.pebbleSh) + ell(xx, y, s * 1.2, s * 0.75, C.pebble) + ell(xx - s * 0.4, y - s * 0.3, s * 0.4, s * 0.22, C.pebbleHi)); });
  // grass tufts
  let tufts = ''; for (let i = 0; i < 46; i++) { const x = (i + 0.5) * W / 46 + (r() - 0.5) * 16, y = 80 + r() * 170, s = 0.8 + r() * 0.6; tufts += wrap(x, 10, xx => tuft(xx, y, s, C.blade).replace(/<path d="([^"]+)".*/, '$1')); }
  o += strokeP(tufts, C.blade, 2.4);
  // blades poking up along the lip (light)
  let up = ''; for (let i = 0; i < 30; i++) { const x = (i + 0.3) * W / 30 + (r() - 0.5) * 10; up += wrap(x, 8, xx => `M${f(xx - 3)} ${f(lip(xx) + 4)}L${f(xx - 5)} ${f(lip(xx) - 6)}M${f(xx + 2)} ${f(lip(xx) + 4)}L${f(xx + 4)} ${f(lip(xx) - 4)}`); }
  o += strokeP(up, C.grassTop, 2.6);
  // small flowers (a few, pale)
  const fl = [[70, 96], [300, 112], [355, 88], [520, 120], [780, 104], [905, 140], [1120, 92], [250, 150], [560, 98], [1090, 128], [860, 92], [20, 150], [430, 200], [1000, 190]];
  fl.forEach(([x, y], i) => { o += wrap(x, 10, xx => flower(xx, y, 0.9 + (i % 3) * 0.15, C.flowers[i % 4])); });
  return svg(1200, 260, o, defs);
}

// ---------------- sun, clouds, rainbow ----------------
function genSun() {
  const defs = rg('glow', [[0, '#FFF6C2', 0.9], [0.45, '#FFE88A', 0.45], [1, '#FFE88A', 0]]) + rg('disc', [[0, '#FFF3A6'], [0.7, '#FFE066'], [1, '#FFD24A']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, a1 = a - 0.13, a2 = a + 0.13, r0 = 58, r1 = i % 2 ? 84 : 94; rays += `M${f(100 + Math.cos(a1) * r0)} ${f(100 + Math.sin(a1) * r0)}Q${f(100 + Math.cos(a) * (r1 + 8))} ${f(100 + Math.sin(a) * (r1 + 8))} ${f(100 + Math.cos(a2) * r0)} ${f(100 + Math.sin(a2) * r0)}Z`; }
  o += P(rays, '#FFE27A', ' opacity="0.85"');
  o += circ(100, 100, 54, '#F7C33F') + circ(100, 100, 50, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFBE0', ' opacity="0.8" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function cloud(puffs, base, sh, hi) {
  // puffs: [x, y, r]; flat-ish bottom at max(y + r*0.55)
  let o = puffs.map(([x, y, r]) => circ(x, y + 6, r, sh)).join('');
  o += puffs.map(([x, y, r]) => circ(x, y, r, base)).join('');
  o += puffs.slice(0, 3).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.45, r * 0.42, r * 0.22, hi, ' opacity="0.9"')).join('');
  return o;
}
function genClouds() {
  const out = {};
  const mk = (puffs, base, sh, hi, bottom) => {
    const x0 = puffs[0][0] - puffs[0][2] * 0.7, x1 = puffs[puffs.length - 1][0] + puffs[puffs.length - 1][2] * 0.7, hb = 30;
    let o = `<rect x="${f(x0)}" y="${bottom - hb + 5}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${sh}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y + 6, r, sh)).join('');
    o += `<rect x="${f(x0)}" y="${bottom - hb}" width="${f(x1 - x0)}" height="${hb}" rx="${hb / 2}" fill="${base}"/>`;
    o += puffs.map(([x, y, r]) => circ(x, y, r, base)).join('');
    o += puffs.slice(0, 3).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.45, r * 0.42, r * 0.22, hi, ' opacity="0.9"')).join('');
    return svg(300, 160, o);
  };
  out.cloud1 = mk([[70, 104, 34], [120, 80, 46], [180, 72, 52], [232, 98, 38], [150, 108, 34]], '#FFFFFF', '#E3DEF3', '#FFFFFF', 132);
  out.cloud2 = mk([[60, 110, 28], [104, 92, 38], [156, 96, 36], [204, 104, 30], [244, 114, 22]], '#FFFFFF', '#E6E1F4', '#FFFFFF', 134);
  out.cloud3 = mk([[78, 98, 40], [138, 66, 54], [196, 82, 44], [236, 108, 30], [130, 110, 36]], '#FFFFFF', '#E1DCF2', '#FFFFFF', 136);
  out.cloud_rain = mk([[62, 102, 36], [114, 76, 48], [176, 68, 52], [232, 96, 40], [150, 104, 38]], '#A7B2C6', '#8A95AC', '#BFC8D8', 132);
  return out;
}
function genRainbow() {
  const cols = ['#FF9C9C', '#FFC384', '#FFE58A', '#A6DE92', '#94C9F2', '#BCA4EA'];
  const cx = 400, cy = 420, bw = 26, r0 = 378;
  let defs = '', o = '';
  // vertical fade: opaque at the top of the arc, transparent at the feet (y 420)
  defs += lg('rbfade', 0, 0, 0, 420, [[0, '#FFFFFF', 1], [0.55, '#FFFFFF', 0.95], [1, '#FFFFFF', 0]], ' gradientUnits="userSpaceOnUse"');
  defs += `<mask id="rbm" maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="420"><rect width="800" height="420" fill="url(#rbfade)"/></mask>`;
  let arcs = '';
  const arc = (r, col, w, extra = '') => `<path d="M${f(cx - r)} ${cy}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${cy}" fill="none" stroke="${col}" stroke-width="${w}"${extra}/>`;
  cols.forEach((c, i) => { arcs += arc(r0 - bw / 2 - i * bw, c, bw + 1); });
  // soft white sheen on the outer edge
  arcs += arc(r0 - 3, '#FFFFFF', 4, ' opacity="0.45"');
  o = `<g mask="url(#rbm)" opacity="0.85">${arcs}</g>`;
  return svg(800, 420, o, defs);
}

// ---------------- particles (0 0 32 32, centred) ----------------
function genParticles() {
  const p = {};
  const S = body => svg(32, 32, body);
  p.leaf1 = S(`<g transform="rotate(-30 16 16)">${P('M16 3C24 8 25 20 16 29C7 20 8 8 16 3Z', '#9CCB62')}${P('M16 3C24 8 25 20 16 29C19 20 20 10 16 3Z', '#86B552')}${strokeP('M16 6L16 27M16 13l4 -3M16 19l-4 -3M16 22l4 -3', '#6E9A40', 1.3)}</g>`);
  p.leaf2 = S(`<g transform="rotate(25 16 16)">${P('M6 22C6 10 16 4 27 5C27 16 20 25 6 22Z', '#C9D86A')}${P('M6 22C15 22 23 16 27 5C27 16 20 25 6 22Z', '#AFC055')}${strokeP('M7 21Q16 15 25 7M13 17l0 -5M18 13l1 4', '#8C9C3E', 1.3)}</g>`);
  p.petal = S(`<g transform="rotate(-20 16 16)">${P('M16 4C23 8 24 18 16 28C8 18 9 8 16 4Z', '#FFC6D8')}${P('M16 4C23 8 24 18 16 28C19 18 19 9 16 4Z', '#F7A9C2')}${ell(13.5, 11, 2, 4, '#FFE3EC', ' opacity="0.9"')}</g>`);
  p.pollen = svg(32, 32, circ(16, 16, 15, 'url(#pg)') + circ(16, 16, 4.5, '#FFF3B0') + circ(14.8, 14.8, 1.6, '#FFFFFF'), rg('pg', [[0, '#FFF6C4', 0.9], [0.4, '#FFE68A', 0.45], [1, '#FFE68A', 0]]));
  const bBody = `${ell(16, 17, 2.4, 8, '#7A6A9E')}${circ(16, 9.2, 2.8, '#7A6A9E')}${strokeP('M15 7Q13 3 11 2.5M17 7Q19 3 21 2.5', '#7A6A9E', 1.2)}${circ(11, 2.5, 1.2, '#7A6A9E')}${circ(21, 2.5, 1.2, '#7A6A9E')}`;
  const wingL = 'M15 14C10 4 2 5 2.5 11C3 15 8 16 15 16Z', wingLB = 'M15 17C9 17 4 21 6.5 25.5C9 28.5 14 24 15 19Z';
  const mirror = d => d.replace(/([MCLQ ]|^)(\d+\.?\d*) (\d+\.?\d*)/g, (m, c, x, y) => `${c}${f(32 - parseFloat(x))} ${y}`);
  p.butterfly1 = S(`${P(wingL, '#FFB7D2')}${P(mirror(wingL), '#FFB7D2')}${P(wingLB, '#C7B4F2')}${P(mirror(wingLB), '#C7B4F2')}${circ(7, 10, 2.2, '#FFE3EE')}${circ(25, 10, 2.2, '#FFE3EE')}${circ(9.5, 22.5, 1.6, '#EDE5FF')}${circ(22.5, 22.5, 1.6, '#EDE5FF')}${bBody}`);
  // closed: wings folded up narrow (seen edge-on-ish), same body
  const wC = 'M15 15C12.5 7 9 4 8 7C7.5 11 10 15 15 16.5Z', wCB = 'M15 17C12 18 10.5 21 11.5 23.5C13 25 14.5 22 15 19Z';
  p.butterfly2 = S(`${P(wC, '#F5A3C3')}${P(mirror(wC), '#FFB7D2')}${P(wCB, '#B9A4EC')}${P(mirror(wCB), '#C7B4F2')}${bBody}`);
  p.raindrop = svg(32, 32, P('M15 1Q16 0 17 1L17.6 26Q16 31 14.4 26Z', 'url(#rd)'), lg('rd', 0, 0, 0, 1, [[0, '#E8F4FF', 0], [0.5, '#D8ECFF', 0.7], [1, '#F4FAFF', 1]]));
  p.splash = S(`${ell(16, 26, 10, 2.6, '#CFE6FA', ' opacity="0.7"')}${strokeP('M10 24Q8 18 6 16M13 23L12 15M19 23L20 15M22 24Q24 18 26 16', '#E4F2FF', 2)}${circ(5.5, 13.5, 1.8, '#E4F2FF')}${circ(11.6, 12, 1.6, '#E4F2FF')}${circ(20.4, 12, 1.6, '#E4F2FF')}${circ(26.5, 13.5, 1.8, '#E4F2FF')}`);
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#FFF2A8')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  p.puff = svg(32, 32, `${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2EFF8', 0.8], [1, '#E6E2F0', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)">${`<rect x="9" y="12" width="14" height="8" rx="2" fill="#FF8FB1"/>`}<rect x="9" y="16" width="14" height="4" rx="1.5" fill="#E8739A"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#7FD6E8', 4)}${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#B8EEF7', 1.4, ' opacity="0.8"')}`);
  return p;
}

// ---------------- write ----------------
function writeAll() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const files = { far: genFar(), mid: genMid(), ground: genGround(), sun: genSun(), rainbow: genRainbow(), ...genClouds() };
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(env, k + '.svg'), v);
  const parts = genParticles();
  for (const [k, v] of Object.entries(parts)) fs.writeFileSync(path.join(par, k + '.svg'), v);
  const report = [...Object.keys(files).map(k => ['env/' + k, files[k]]), ...Object.keys(parts).map(k => ['particles/' + k, parts[k]])];
  for (const [k, v] of report) { const kb = Buffer.byteLength(v) / 1024; console.log(`${k.padEnd(22)} ${kb.toFixed(1)} KB${kb > 60 ? '  TOO BIG' : ''}${/<text|<script|href=|filter/.test(v) ? '  FORBIDDEN' : ''}`); }
  return { env: Object.keys(files), parts: Object.keys(parts) };
}

// ---------------- QA renders ----------------
const MOODS = [
  { id: 'sunny', top: '#8FD3FF', bot: '#E6F7FF', tint: null, sun: 1, clouds: ['cloud1', 'cloud2'], parts: ['butterfly1', 'butterfly2', 'pollen', 'petal', 'pollen'] },
  { id: 'breezy', top: '#7EC8F0', bot: '#DDF3E8', tint: null, sun: 0.7, clouds: ['cloud3', 'cloud1', 'cloud2'], parts: ['leaf1', 'leaf2', 'leaf1', 'leaf2', 'petal'] },
  { id: 'rain', top: '#8C9BB0', bot: '#C9D3DC', tint: 'rgba(30,40,60,.25)', sun: 0, clouds: ['cloud_rain', 'cloud_rain', 'cloud_rain'], parts: [], rain: true },
  { id: 'rainbow', top: '#FFB38A', bot: '#FFE7B8', tint: 'rgba(255,170,90,.12)', sun: 0.6, clouds: ['cloud2'], parts: ['sparkle', 'sparkle', 'sparkle', 'butterfly1'], rainbow: true },
];
const EGG = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'] };
function scene(Wd, Hd, mood, uri) {
  const groundY = Hd - 70;
  const gTop = groundY - 70;          // ground.svg y=0 (its y=40 lands on groundY-30)
  const midTop = groundY - 10 - 360;  // mid bottom hidden behind the ground
  const farTop = groundY - 120 - 420; // far bottom hidden behind the mid hills
  const tile = (src, top, h, shift) => { let s = ''; for (let x = -shift % 1200 - 1200; x < Wd; x += 1200) s += `<img src="${uri(src)}" style="position:absolute;left:${x}px;top:${top}px;width:1200px;height:${h}px">`; return s; };
  let h = `<div style="position:relative;width:${Wd}px;height:${Hd}px;overflow:hidden;background:linear-gradient(${mood.top},${mood.bot} ${groundY - 200}px)">`;
  if (mood.sun) h += `<img src="${uri('env/sun')}" style="position:absolute;left:${Wd - 330}px;top:70px;width:200px;opacity:${mood.sun}">`;
  if (mood.rainbow) h += `<img src="${uri('env/rainbow')}" style="position:absolute;left:${Wd / 2 - 380}px;top:${farTop + 60}px;width:800px;opacity:.9">`;
  mood.clouds.forEach((c, i) => { h += `<img src="${uri('env/' + c)}" style="position:absolute;left:${(i * 0.37 + 0.18) * Wd - 150}px;top:${30 + (i % 2) * 70}px;width:${260 - i * 30}px">`; });
  h += tile('env/far', farTop, 420, 260) + tile('env/mid', midTop, 360, 620) + tile('env/ground', gTop, 260, 0);
  // stand-in nests (brown blob) on the grass line and eggs in the play band
  const n = 3, nw = Math.min(240, (Wd - 40) / n - 24), nh = 0.62 * nw;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * Wd / n; h += `<div style="position:absolute;left:${cx - nw / 2}px;top:${groundY - nh * 0.85}px;width:${nw}px;height:${nh * 0.85}px;border-radius:50% 50% 45% 45%/30% 30% 70% 70%;background:#B07A45;border:4px solid #7A4E26;box-sizing:border-box"></div>`;
  }
  const playTop = (Hd > Wd ? 245 : 225) + 10, playBot = groundY - nh - 24;
  Object.keys(EGG).forEach((k, i) => {
    const x = 60 + ((i + 0.5) / 6) * (Wd - 120), y = playTop + ((i * 0.37) % 1) * Math.max(10, playBot - playTop - 110) + 50;
    h += `<div style="position:absolute;left:${x - 43}px;top:${y - 55}px;width:86px;height:110px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:${EGG[k][0]};border:4px solid ${EGG[k][1]};box-sizing:border-box"></div>`;
  });
  // Bo stand-in (mint)
  h += `<div style="position:absolute;left:${105 - 60}px;top:${(Hd > Wd ? 245 : 225) - 150}px;width:120px;height:150px;border-radius:50%;background:#5FD3B4;border:4px solid #2E8C78;box-sizing:border-box"></div>`;
  mood.parts.forEach((p, k) => { const x = 220 + k * (Wd - 300) / 5, y = 160 + ((k * 137) % 260), sz = 30 + (k % 3) * 6; h += `<img src="${uri('particles/' + p)}" style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px">`; });
  if (mood.rain) for (let k = 0; k < 60; k++) { const x = (k * 97) % Wd, y = (k * 53) % (groundY); h += `<img src="${uri('particles/raindrop')}" style="position:absolute;left:${x}px;top:${y}px;width:30px;height:30px;opacity:.55;transform:rotate(12deg)">`; }
  if (mood.rain) for (let k = 0; k < 6; k++) h += `<img src="${uri('particles/splash')}" style="position:absolute;left:${(k * 271) % Wd}px;top:${groundY - 34}px;width:30px;opacity:.8">`;
  if (mood.tint) h += `<div style="position:absolute;inset:0;background:${mood.tint}"></div>`;
  return h + '</div>';
}
async function qa(names) {
  const { chromium } = require('playwright');
  const ART = path.join(ROOT, 'docs/art'), TMP = '/tmp/dino-env-qa';
  fs.mkdirSync(ART, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  const uri = k => 'file://' + path.join(A, k + '.svg');
  const b = await chromium.launch(); const pg = await b.newPage();
  const go = async (body, file, vp, bg = '#fff') => { fs.writeFileSync(TMP + '/tmp.html', `<html><body style="margin:0;background:${bg}">${body}</body></html>`); await pg.setViewportSize(vp); await pg.goto('file://' + TMP + '/tmp.html'); await pg.waitForTimeout(150); await pg.screenshot({ path: file }); };
  // 1) seam numbers + 3x tiled strips with 2x zoom windows on the joins
  const res = await pg.evaluate(async (data) => {
    const out = [];
    for (const [k, src, h] of data) {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 1200, h); g.drawImage(img, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let y = 0; y < h; y++) { const i = (y * 2400 + x1) * 4, j = (y * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let mx = 0, sum = 0; for (let x = 100; x < 1100; x++) { const v = col(x, x + 1); mx = Math.max(mx, v); sum += v; }
      out.push(`${k.padEnd(8)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
    }
    return out;
  }, [['far', 420], ['mid', 360], ['ground', 260]].map(([k, h]) => [k, 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, 'env', k + '.svg')).toString('base64'), h]));
  console.log(res.join('\n'));
  for (const [l, h] of [['far', 420], ['mid', 360], ['ground', 260]]) {
    let body = `<div style="position:relative;width:3600px;height:${h}px;background:#9ad4ff">` + [0, 1200, 2400].map(x => `<img src="${uri('env/' + l)}" style="position:absolute;left:${x}px;top:0;width:1200px">`).join('') + '</div>';
    await go(body, `${TMP}/seam_${l}_strip.png`, { width: 3600, height: h });
    // zoom 2x around both joins
    body = '<div style="display:flex;gap:6px;background:#333">' + [1200, 2400].map(j => `<div style="position:relative;width:600px;height:${h * 2}px;overflow:hidden;background:#9ad4ff"><div style="position:absolute;left:0;top:0;transform:scale(2);transform-origin:0 0">` +
      [0, 1200, 2400].map(x => `<img src="${uri('env/' + l)}" style="position:absolute;left:${x - j + 150}px;top:0;width:1200px">`).join('') + `</div><div style="position:absolute;left:299px;top:0;width:2px;height:10px;background:red"></div></div>`).join('') + '</div>';
    await go(body, `${TMP}/seam_${l}_zoom.png`, { width: 1206, height: h * 2 });
  }
  // 2) scenes
  const devices = [['iphoneL', 1556, 720], ['ipadL', 960, 720], ['iphoneP', 720, 1556]];
  for (const [dn, Wd, Hd] of devices) for (const m of MOODS) await go(scene(Wd, Hd, m, uri), `${ART}/scene_${dn}_${m.id}.png`, { width: Wd, height: Hd });
  // 3) sheet: big items + layers + particles at 4x on 3 backgrounds
  let s = '<div style="padding:12px;width:1600px;font-size:0">';
  s += `<div style="display:flex;gap:16px;align-items:flex-end;background:linear-gradient(#8FD3FF,#E6F7FF);padding:12px">` + ['sun', 'cloud1', 'cloud2', 'cloud3', 'cloud_rain'].map(k => `<img src="${uri('env/' + k)}" style="outline:1px dashed rgba(0,0,0,.2)">`).join('') + '</div>';
  s += `<div style="display:flex;gap:16px;background:linear-gradient(#FFB38A,#FFE7B8);padding:12px"><img src="${uri('env/rainbow')}" style="outline:1px dashed rgba(0,0,0,.2)"></div>`;
  s += ['far', 'mid', 'ground'].map(k => `<div style="background:#bfe6ff;padding:4px 12px"><img src="${uri('env/' + k)}" style="width:1200px;outline:1px dashed rgba(0,0,0,.25)"></div>`).join('');
  for (const bg of ['#E6F7FF', '#B6D683', '#5A6A80']) s += `<div style="display:flex;flex-wrap:wrap;gap:6px;background:${bg};padding:10px">` + names.parts.map(p => `<img src="${uri('particles/' + p)}" style="width:120px;height:120px;outline:1px dashed rgba(0,0,0,.2)">`).join('') + '</div>';
  s += '</div>';
  await go(s, `${ART}/env_sheet.png`, { width: 1624, height: 2200 });
  const full = await pg.evaluate(() => document.body.scrollHeight); await pg.setViewportSize({ width: 1624, height: full }); await pg.screenshot({ path: `${ART}/env_sheet.png` });
  await b.close(); console.log('QA images in', ART, 'and', TMP);
}

const names = writeAll();
if (!process.argv.includes('--no-qa')) qa(names).catch(e => { console.error(e); process.exit(1); });
