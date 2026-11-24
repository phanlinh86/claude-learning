// Lolo's Jungle Leaf Match: environment + particle art generator (100 % original, procedurally laid out flat-cartoon SVG).
// Usage: node tools/art_env.js            Preview scenes + seam proof + sheets: node tools/env_scenes.js
// Writes game/assets/default/env/{far,mid,ground}_{morning,noon,sunset,night}.svg, sun, moon, cloud1..3, log and
// game/assets/default/particles/{petal_a,petal_b,leaf_a,leaf_b,pollen,firefly,sparkle,star,puff,confetti_a,confetti_b}.
// Removes the old city files (env: far/mid/ground_{sunny,breezy,rain,rainbow}, rain_cloud, rainbow, car_a, car_b, bus,
// kite; particles: drop, splash, paper).
//
// Tiling: every band edge is a sum of sines with INTEGER periods over W (f(0) = f(W)); every object that crosses an edge
// is drawn again at x ± W (wrap()), so the left and right edges of each layer match exactly.
// All 4 moods share ONE layout (same trees, palms, ferns, roots); only the palette and the mood details change, so the
// 2.5 s crossfade between moods never "jumps".
// Colour rule (DESIGN §3): the background is misty, lighter and bluer with distance and always calmer than the answer
// colours and the foreground leaves (#3E9A5E #3A9488 #7AA845 #4F8F3C): mid layers sit at L ≈ 68–82 % (day), far higher.
//
// Layer geometry (svg coords) the draw recipe in env_scenes.js relies on:
//   far    0 0 1200 420 : giant trees, waterfall, misty hills; OPAQUE from y = 300 down to 420 (canopy band).
//   mid    0 0 1200 360 : palms, banana plants, lianas, ferns, monstera; OPAQUE from y = 232 down to 360 (bush band).
//   ground 0 0 1200 260 : transparent above the moss edge (y 37..43, grass tips up to y ≈ 22); opaque y 44 → 260.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const W = 1200;
const f = n => (Math.round(n * 10) / 10).toString();

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
const lg = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>';
const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>` + stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>';
function mix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); }

// Tapered blade along a drooping curve (palm fronds, banana leaves, ferns, grass). serr → serrated (alternating width).
function blade(x0, y0, ang, len, droop, wid, serr = 0, n = 16, curl = 0) {
  const pt = t => { const a = ang + curl * t * t; return [x0 + Math.cos(a) * len * t, y0 + Math.sin(a) * len * t + droop * t * t]; };
  const L = [], R = [], spine = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = pt(t), q = pt(Math.min(1, t + 0.01)), p0 = pt(Math.max(0, t - 0.01));
    const dx = q[0] - p0[0], dy = q[1] - p0[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
    let w = wid * Math.pow(Math.sin(Math.PI * Math.min(t * 1.08, 1)), 0.65) * (1 - 0.25 * t);
    if (serr && i % 2 && i < n) w *= 1 - serr;
    L.push([p[0] + nx * w, p[1] + ny * w]); R.push([p[0] - nx * w, p[1] - ny * w]); spine.push(p);
  }
  return { d: poly(L.concat(R.reverse())), spine };
}

// ---------------- palettes ----------------
// Day "base" colours, then per layer: mix toward the mood haze (aerial perspective), then a mood grade.
const MOODS = ['morning', 'noon', 'sunset', 'night'];
const HAZE = { morning: '#F3E7D2', noon: '#DCEDF0', sunset: '#F2C9BE', night: '#5A72A0' };
const GRADE = { morning: ['#FFE0B8', 0.10], noon: ['#FFFFFF', 0], sunset: ['#E8938A', 0.16], night: ['#1C3352', 0.56] };
const RIM = { morning: '#FFF1D2', noon: '#F2FAE8', sunset: '#FFD2A6', night: '#9DB9DC' };
const RIMDIR = { morning: -1, noon: 0, sunset: 1, night: 1 };   // which side the light comes from (sun / moon x)
const HAZE_AMT = { far0: 0.66, far1: 0.56, far2: 0.46, far3: 0.38, mid0: 0.42, mid1: 0.32, mid2: 0.24, ground: 0.06 };
function tone(base, layer, m) {
  const c = mix(base, HAZE[m], HAZE_AMT[layer]); const [g, t] = GRADE[m]; const o = t ? mix(c, g, t) : c;
  return m === 'night' && (layer === 'ground' || layer.startsWith('mid')) ? mix(o, '#1E5066', layer === 'ground' ? 0.46 : 0.18) : o;   // night: blue-teal, never grey
}
const BASE = {
  green: '#5F9E7C', greenSh: '#4E8C70', greenLt: '#86B98E', greenHi: '#A9D0A0', teal: '#579A98', tealSh: '#467F80',
  olive: '#8DAF70', trunk: '#8F8270', trunkSh: '#73685A', rock: '#8E9E9C', rockSh: '#788A8A',
  banana: '#86B678', bananaSh: '#6A9E6A', liana: '#7F9A62',
  moss: '#93B064', mossSh: '#789A52', mossHi: '#B6CF84', soil: '#A0845F', soilSh: '#8A714F', soilDeep: '#76614A',
  root: '#AC8E6A', rootSh: '#8B6E50', pebble: '#BDB3A2', pebbleSh: '#A39A8A', cap: '#E2A28E', capSh: '#C9836F', stem: '#F1E6D2',
  grass: '#86AC5C', grassLt: '#A6C676',
};
const FLOWERS = ['#E9CDEB', '#F6D3DC', '#F8EFD6'];
function pal(layer, m) { const o = {}; for (const [k, v] of Object.entries(BASE)) o[k] = tone(v, layer, m); o.rim = mix(RIM[m], HAZE[m], HAZE_AMT[layer] * 0.4); o.flowers = FLOWERS.map(c => tone(c, layer, m)); return o; }

// ---------------- FAR: misty hills, giant emergent trees, waterfall (0 0 1200 420) ----------------
const FAR_TREES = [{ x: 96, top: 128, s: 1 }, { x: 352, top: 156, s: 0.82 }, { x: 548, top: 112, s: 1.1 }, { x: 1010, top: 140, s: 0.95 }, { x: 1168, top: 168, s: 0.75 }];
const FALL_X = 790;
function far(m) {
  const C0 = pal('far0', m), C1 = pal('far1', m), C2 = pal('far2', m), C3 = pal('far3', m);
  let o = '', defs = '';
  // 1. the far mountain range
  const h0 = wave([[22, 2, 0.4], [12, 3, 2.1], [7, 7, 1.1]]);
  o += P(bandD(x => 222 + h0(x), 420), C0.teal);
  // 2. the waterfall cliff (a rounded mesa), behind the giant trees
  const cx = FALL_X;
  o += P(`M${cx - 120} 420L${cx - 104} 214Q${cx - 98} 168 ${cx - 50} 162L${cx + 52} 156Q${cx + 102} 156 ${cx + 110} 206L${cx + 132} 420Z`, C1.rock);
  o += P(`M${cx + 40} 420L${cx + 60} 196Q${cx + 66} 164 ${cx + 84} 170Q${cx + 106} 180 ${cx + 112} 214L${cx + 132} 420Z`, C1.rockSh);
  o += P(`M${cx - 104} 214Q${cx - 98} 168 ${cx - 50} 162L${cx + 52} 156Q${cx + 102} 156 ${cx + 110} 206Q${cx + 60} 182 ${cx} 186Q${cx - 60} 188 ${cx - 104} 214Z`, C1.greenLt);   // mossy top
  const water = mix(C1.rim, '#FFFFFF', 0.4), waterSh = mix(water, C1.rock, 0.3);
  o += P(`M${cx - 20} 180Q${cx} 176 ${cx + 20} 180L${cx + 24} 330L${cx - 26} 330Z`, waterSh);
  o += P(`M${cx - 15} 180Q${cx} 177 ${cx + 15} 180L${cx + 16} 330L${cx - 18} 330Z`, water);
  for (const dx of [-8, 3, 10]) o += strokeP(`M${cx + dx} 192V${300 + (dx % 7) * 3}`, waterSh, 2.2, ' opacity="0.7"');
  // 3. giant emergent rainforest trees (umbrella crowns on tall thin trunks)
  const crown = (x, top, s, C) => {
    let t = P(poly([[x - 9 * s, 330], [x - 3.5 * s, top + 34 * s], [x + 3.5 * s, top + 34 * s], [x + 9 * s, 330]]), C.trunkSh);
    t += strokeP(`M${f(x)} ${f(top + 60 * s)}l${f(-26 * s)} ${f(-18 * s)}M${f(x)} ${f(top + 74 * s)}l${f(24 * s)} ${f(-20 * s)}`, C.trunkSh, 4 * s);
    const blobs = [[-46, 26, 26], [-20, 12, 30], [14, 10, 32], [44, 24, 26], [0, 30, 30], [-60, 38, 16], [62, 38, 16]];
    for (const [dx, dy, r] of blobs) t += circ(x + dx * s, top + dy * s, r * s, C.greenSh);
    for (const [dx, dy, r] of blobs.slice(1, 4)) t += circ(x + dx * s - 6 * s, top + dy * s - 7 * s, r * 0.55 * s, C.green);
    return t;
  };
  for (const T of FAR_TREES) o += wrap(T.x, 80 * T.s, x => crown(x, T.top, T.s, C2));
  // 4. canopy band (opaque from y 300): bumpy top made of overlapping round crowns
  const h1 = wave([[8, 3, 0.7], [5, 8, 2.4]]);
  const r1 = rng(11);
  o += rect(0, 300, W, 120, C2.green);
  for (let x = 0; x < W; x += 38) { const xx = x + r1() * 10, rr = 24 + r1() * 16, yy = 300 + h1(xx) + r1() * 6; o += wrap(xx, rr, X => circ(X, yy, rr, C2.green)); }
  // 5. mist band over the canopy (all moods, strongest in the morning)
  const mistA = { morning: 0.75, noon: 0.32, sunset: 0.45, night: 0.38 }[m];
  defs += lg('mist', 0, 0, 0, 1, [[0, HAZE[m], 0], [0.45, HAZE[m], mistA], [1, HAZE[m], mistA * 0.4]]);
  o += rect(0, 262, W, 80, 'url(#mist)');
  // mist pool at the foot of the waterfall
  o += ell(cx, 330, 54, 12, water, ` opacity="${f(0.75)}"`) + ell(cx - 30, 322, 22, 9, water, ' opacity="0.6"') + ell(cx + 34, 324, 24, 9, water, ' opacity="0.6"');
  // 6. front canopy band (y ≈ 350), a step closer: a touch darker, a rim on its bumps
  const h2 = wave([[7, 2, 2.0], [6, 5, 0.3], [3, 11, 1.4]]);
  const r2 = rng(23), dir = RIMDIR[m];
  o += rect(0, 352, W, 68, C3.teal);
  for (let x = 0; x < W; x += 52) {
    const xx = x + r2() * 14, rr = 26 + r2() * 18, yy = 354 + h2(xx) + r2() * 6;
    o += wrap(xx, rr + 6, X => circ(X + dir * rr * 0.12, yy - rr * 0.14, rr, mix(C3.teal, C3.rim, 0.35)) + circ(X, yy, rr, C3.teal));
  }
  return svg(W, 420, o, defs);
}

// ---------------- MID: palms, banana plants, lianas, ferns, monstera, bush band (0 0 1200 360) ----------------
const PALMS = [{ x: 150, h: 250, lean: 34, s: 1 }, { x: 640, h: 290, lean: -30, s: 1.08 }, { x: 1040, h: 235, lean: 26, s: 0.95 }];
const BANANAS = [{ x: 360, s: 1 }, { x: 850, s: 0.92 }];
const MONSTERAS = [{ x: 470, s: 1 }, { x: 1180, s: 0.95 }, { x: 250, s: 0.8 }];
const FERNS = [{ x: 60, s: 1 }, { x: 300, s: 0.85 }, { x: 560, s: 1.05 }, { x: 760, s: 0.9 }, { x: 960, s: 1 }];
const MID_OPAQUE = 232;
function heart(cx, cy, r, rot, col, sh, slit) {   // monstera leaf: heart with lobes at the stem end and slits
  const pts = []; for (let i = 0; i < 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
  const k = r / 17, tr = ` transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)}) scale(${f(k * 100) / 100})"`;
  let o = P(poly(pts), col, tr);
  let sl = 'M0 -4V16';
  for (const s of [-1, 1]) for (const y of [-2, 4, 10]) sl += `M${s * 14 * (1 - y / 30)} ${y}L${s * 5} ${y + 3}`;
  o += `<path d="${sl}" fill="none" stroke="${slit}" stroke-width="${f(1.9)}" stroke-linecap="round"${tr}/>`;
  return o + P('M0 -4L0 16', sh, ` stroke="${sh}" stroke-width="0.8"${tr}`);
}
function mid(m) {
  const B = 360, C = pal('mid1', m), Cb = pal('mid0', m), Cf = pal('mid2', m), dir = RIMDIR[m];
  let o = '', defs = '';
  // 1. back bush band (lightest) — opaque from MID_OPAQUE
  const hb = wave([[10, 3, 1.1], [7, 7, 0.2]]); const rb = rng(5);
  o += rect(0, MID_OPAQUE, W, B - MID_OPAQUE, Cb.green);
  for (let x = 0; x < W; x += 44) { const xx = x + rb() * 12, rr = 30 + rb() * 22, yy = 246 + hb(xx); o += wrap(xx, rr + 6, X => circ(X + dir * rr * 0.14, yy - rr * 0.16, rr, mix(Cb.green, Cb.rim, 0.4)) + circ(X, yy, rr, Cb.green)); }
  // 2. palms (curved trunk, ringed, drooping serrated fronds) + hanging lianas from the crowns
  const palm = (x, h, lean, s) => {
    const top = [x + lean, B - 60 - h], ctl = [x + lean * 0.1, B - 60 - h * 0.55];
    const at = t => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * ctl[0] + t * t * top[0], (1 - t) * (1 - t) * (B - 40) + 2 * (1 - t) * t * ctl[1] + t * t * top[1]];
    const Lp = [], Rp = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, p = at(t), w = (11 - 5 * t) * s; Lp.push([p[0] - w, p[1]]); Rp.push([p[0] + w, p[1]]); }
    let t = P(poly(Lp.concat(Rp.reverse())), C.trunk);
    for (let i = 1; i < 14; i++) { const p = at(i / 14), w = (11 - 5 * i / 14) * s; t += strokeP(`M${f(p[0] - w + 1)} ${f(p[1])}q${f(w)} 4 ${f(2 * w - 2)} 0`, C.trunkSh, 1.8 * s); }
    // lianas hanging from the crown (behind the fronds)
    for (const [dx, len] of [[-42, 120], [30, 150]]) {
      const lx = top[0] + dx * s, ly = top[1] + 8;
      t += strokeP(`M${f(lx)} ${f(ly)}C${f(lx - 10)} ${f(ly + len * 0.4)} ${f(lx + 12)} ${f(ly + len * 0.7)} ${f(lx + 2)} ${f(ly + len)}q-8 10 -2 14`, C.liana, 3.2 * s);
      for (let j = 1; j < 5; j++) { const yy = ly + len * j / 5, xx = lx + (j % 2 ? -3 : 4); t += P(blade(xx, yy, j % 2 ? Math.PI * 0.85 : Math.PI * 0.15, 14 * s, 3, 4.5 * s, 0, 8).d, C.olive); }
    }
    const fr = [[-2.95, 110, 70], [-2.55, 120, 46], [-2.05, 96, 20], [-1.25, 96, 22], [-0.65, 122, 48], [-0.2, 112, 72], [2.6, 78, 34], [0.6, 80, 34]];
    fr.forEach(([a, len, dr], i) => {
      const b = blade(top[0], top[1], a, len * s, dr * s, 15 * s, 0.55, 22);
      t += P(b.d, i % 2 ? C.greenSh : C.green);
      t += strokeP(line(b.spine), mix(C.green, C.rim, 0.5), 1.6 * s, ' opacity="0.8"');
    });
    t += circ(top[0] - 6 * s, top[1] + 6 * s, 6 * s, C.trunkSh) + circ(top[0] + 5 * s, top[1] + 8 * s, 6 * s, C.trunkSh);
    return t;
  };
  for (const p of PALMS) o += wrap(p.x + p.lean / 2, 150 * p.s, x => palm(x - p.lean / 2, p.h, p.lean, p.s));
  // 3. banana plants (pseudostem + big paddle leaves with a pale midrib and a few tears)
  const banana = (x, s) => {
    const sy = B - 40, ty = sy - 110 * s;
    let t = P(poly([[x - 9 * s, sy], [x - 6 * s, ty], [x + 6 * s, ty], [x + 9 * s, sy]]), C.bananaSh);
    const lv = [[-2.7, 120, 50], [-2.1, 130, 10], [-1.62, 120, -6], [-1.1, 128, 14], [-0.45, 120, 52]];
    lv.forEach(([a, len, dr], i) => {
      const b = blade(x, ty + 6, a, len * s, dr * s, 22 * s, 0, 18);
      t += P(b.d, i % 2 ? C.bananaSh : C.banana);
      t += strokeP(line(b.spine), mix(C.banana, C.rim, 0.55), 2 * s);
      const p = b.spine[11], q = b.spine[14];
      t += strokeP(`M${f(p[0])} ${f(p[1])}l${f(Math.cos(a + 1.2) * 18 * s)} ${f(Math.sin(a + 1.2) * 18 * s)}M${f(q[0])} ${f(q[1])}l${f(Math.cos(a - 1.2) * 16 * s)} ${f(Math.sin(a - 1.2) * 16 * s)}`, Cb.green, 2);
    });
    return t;
  };
  for (const b of BANANAS) o += wrap(b.x, 150 * b.s, x => banana(x, b.s));
  // 4. front bush band (a step closer), with rims and soft pastel flowers
  const hf = wave([[8, 2, 0.6], [6, 6, 1.9]]); const rf = rng(77);
  o += rect(0, 310, W, 50, C.greenLt);
  const fl = [];
  for (let x = 0; x < W; x += 56) {
    const xx = x + rf() * 16, rr = 26 + rf() * 18, yy = 312 + hf(xx);
    o += wrap(xx, rr + 6, X => circ(X + dir * rr * 0.14, yy - rr * 0.16, rr, mix(C.greenLt, C.rim, 0.45)) + circ(X, yy, rr, C.greenLt));
    if (rf() < 0.55) fl.push([xx + (rf() - 0.5) * rr, yy - rr * 0.55 + rf() * 10, Math.floor(rf() * 3)]);
  }
  // 5. monstera bushes
  const monstera = (x, s) => {
    let t = '';
    const lv = [[-46, 250, 30, -30], [40, 244, 32, 28], [-8, 228, 36, 4], [-70, 288, 26, -55], [66, 284, 26, 52]];
    for (const [dx, y, r, rot] of lv) t += strokeP(`M${f(x)} ${f(B - 30)}Q${f(x + dx * 0.3 * s)} ${f(y + 30)} ${f(x + dx * s)} ${f(y + r * 0.2)}`, C.tealSh, 3 * s);
    lv.forEach(([dx, y, r, rot], i) => { t += heart(x + dx * s, B - (B - y) * s, r * s, rot, i % 2 ? C.tealSh : C.teal, C.tealSh, mix(C.teal, Cb.green, 0.55)); });
    return t;
  };
  for (const ms of MONSTERAS) o += wrap(ms.x, 110 * ms.s, x => monstera(x, ms.s));
  // 6. ferns at the front (fans of serrated fronds)
  const fern = (x, s) => {
    let t = '';
    for (let i = 0; i < 7; i++) { const a = -Math.PI + 0.35 + i * (Math.PI - 0.7) / 6, b = blade(x, B - 22, a, (64 + (i % 3) * 14) * s, 30 * s, 13 * s, 0.42, 22, (a < -Math.PI / 2 ? -0.45 : 0.45)); t += P(b.d, i % 2 ? C.green : Cf.olive) + strokeP(line(b.spine.slice(0, 20)), mix(Cf.olive, Cf.rim, 0.4), 1.4 * s, ' opacity="0.8"'); }
    return t;
  };
  for (const fe of FERNS) o += wrap(fe.x, 100 * fe.s, x => fern(x, fe.s));
  // soft flowers on the front bushes (pastel, hazy)
  for (const [x, y, c] of fl) o += wrap(x, 10, X => { let s = ''; for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; s += circ(X + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2, 3.6, C.flowers[c]); } return s + circ(X, y, 2.2, mix('#F6E3A0', HAZE[m], 0.35)); });
  // 7. morning: a low mist band across the bushes
  const mistA = { morning: 0.42, noon: 0.12, sunset: 0.2, night: 0.22 }[m];
  defs += lg('mm', 0, 0, 0, 1, [[0, HAZE[m], 0], [0.6, HAZE[m], mistA], [1, HAZE[m], mistA * 0.6]]);
  o += rect(0, 250, W, 110, 'url(#mm)');
  return svg(W, 360, o, defs);
}

// ---------------- GROUND: moss edge, soil, roots, pebbles, mushrooms, tufts (0 0 1200 260) ----------------
const TUFTS = [40, 132, 214, 300, 388, 470, 548, 640, 712, 800, 884, 968, 1046, 1130];
const MUSH = [{ x: 262, s: 1 }, { x: 278, s: 0.7 }, { x: 676, s: 0.9 }, { x: 1088, s: 1.05 }, { x: 1104, s: 0.65 }];
const PEBBLES = [[180, 120, 9], [196, 126, 5], [520, 150, 11], [840, 118, 8], [950, 162, 10], [1150, 136, 7], [380, 196, 9], [70, 170, 7], [700, 214, 8]];
const ROOTS = [{ x0: 330, x1: 560, y: 98, s: 1 }, { x0: 900, x1: 1240, y: 108, s: 0.85 }];
function ground(m) {
  const C = pal('ground', m), night = m === 'night', dir = RIMDIR[m];
  let o = '', defs = '';
  const top = wave([[2.4, 4, 0.3], [1.4, 9, 2.0]]), te = x => 40 + top(x);
  // soil with a soft gradient into the deep
  defs += lg('soil', 0, 0, 0, 1, [[0, C.soil], [0.55, C.soilSh], [1, C.soilDeep]]);
  o += P(bandD(x => te(x) + 14, 260), 'url(#soil)');
  // strata streaks (period divides W)
  for (let x = 0; x < W; x += 150) o += rect(x + 20, 150 + (x % 300 ? 0 : 18), 70, 4, C.soilSh, 2, ' opacity="0.7"') + rect(x + 95, 196 + (x % 300 ? 12 : 0), 46, 4, C.soilDeep, 2, ' opacity="0.6"');
  // pebbles
  for (const [x, y, r] of PEBBLES) o += wrap(x, r + 2, X => ell(X, y + 2, r, r * 0.62, C.soilDeep, ' opacity="0.5"') + ell(X, y, r, r * 0.64, C.pebble) + ell(X - r * 0.3, y - r * 0.25, r * 0.4, r * 0.22, mix(C.pebble, '#FFFFFF', 0.4)));
  // roots: thick curvy roots crossing the floor, rooted under the moss
  for (const R of ROOTS) {
    const fn = x0 => { const x1 = x0 + (R.x1 - R.x0), mx = (x0 + x1) / 2; const w = 16 * R.s;
      return strokeP(`M${f(x0)} ${f(R.y - 40)}C${f(x0 + 40)} ${f(R.y + 10)} ${f(mx - 30)} ${f(R.y + 20)} ${f(mx + 20)} ${f(R.y + 12)}S${f(x1 - 30)} ${f(R.y + 2)} ${f(x1)} ${f(R.y + 26)}`, C.rootSh, w + 4)
        + strokeP(`M${f(x0)} ${f(R.y - 40)}C${f(x0 + 40)} ${f(R.y + 10)} ${f(mx - 30)} ${f(R.y + 20)} ${f(mx + 20)} ${f(R.y + 12)}S${f(x1 - 30)} ${f(R.y + 2)} ${f(x1)} ${f(R.y + 26)}`, C.root, w)
        + strokeP(`M${f(mx - 40)} ${f(R.y + 12)}Q${f(mx - 10)} ${f(R.y + 14)} ${f(mx + 20)} ${f(R.y + 8)}`, mix(C.root, C.rim, 0.25), 4)
        + strokeP(`M${f(mx)} ${f(R.y + 16)}q10 22 30 30`, C.rootSh, 5); };
    o += fn(R.x0); if (R.x1 > W) o += fn(R.x0 - W);
  }
  // moss band with drips on its lower edge
  const mb = wave([[4, 5, 1.2], [3, 12, 0.4], [2, 19, 2.2]]);
  o += P(`M0 ${f(te(0))}` + Array.from({ length: 201 }, (_, i) => { const x = i * 6; return `L${f(x)} ${f(te(x))}`; }).join('') + Array.from({ length: 201 }, (_, i) => { const x = W - i * 6; return `L${f(x)} ${f(te(x) + 22 + mb(x))}`; }).join('') + 'Z', C.moss);
  o += P(`M0 ${f(te(0) + 15)}` + Array.from({ length: 201 }, (_, i) => { const x = i * 6; return `L${f(x)} ${f(te(x) + 15 + mb(x) * 0.5)}`; }).join('') + Array.from({ length: 201 }, (_, i) => { const x = W - i * 6; return `L${f(x)} ${f(te(x) + 22 + mb(x))}`; }).join('') + 'Z', C.mossSh);
  o += strokeP(line(Array.from({ length: 201 }, (_, i) => [i * 6, te(i * 6) + 3])), mix(C.mossHi, C.rim, 0.3), 3, ' opacity="0.9"');
  // noon: sun patches on the floor; sunset: long warm streaks
  if (m === 'noon') for (const [x, y, rx] of [[120, 54, 60], [470, 60, 44], [760, 52, 70], [1010, 58, 40]]) o += wrap(x, rx, X => ell(X, y, rx, 6, '#FFF3B8', ' opacity="0.28"') + ell(X + 10, y, rx * 0.45, 2.5, '#FFF8D8', ' opacity="0.35"'));
  if (m === 'sunset') for (let x = 60; x < W; x += 240) o += rect(x, 49, 110, 4, '#FFD2A6', 2, ' opacity="0.45"');
  // grass tufts on the edge (+ long shadows at sunset)
  const r = rng(3);
  for (const x of TUFTS) {
    const s = 0.8 + r() * 0.5, y = te(x) + 4;
    o += wrap(x, 30, X => {
      let t = m === 'sunset' ? ell(X + 26 * s, y + 3, 30 * s, 3.5, C.mossSh, ' opacity="0.8"') : '';
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.34; t += P(blade(X + (i - 2) * 4 * s, y, a, (16 + (i % 2 ? 0 : 6)) * s, 2, 3 * s, 0, 8, (i - 2) * 0.25).d, i % 2 ? C.grass : C.grassLt); }
      return t;
    });
  }
  // little mushrooms (night: they glow softly)
  if (night) defs += rg('gl', [[0, '#BFF3E4', 0.75], [0.45, '#8EE0D2', 0.3], [1, '#8EE0D2', 0]]);
  const cap = night ? '#9FE6D8' : C.cap, capSh = night ? '#6CC2B8' : C.capSh, stem = night ? '#D6F2EA' : C.stem;
  for (const M of MUSH) o += wrap(M.x, 20, X => {
    const y = te(M.x) + 8, s = M.s;
    let t = night ? circ(X, y - 12 * s, 30 * s, 'url(#gl)') : '';
    if (m === 'sunset') t += ell(X + 16 * s, y + 2, 18 * s, 3, C.mossSh, ' opacity="0.8"');
    t += P(`M${f(X - 4 * s)} ${f(y)}Q${f(X - 5 * s)} ${f(y - 10 * s)} ${f(X - 3 * s)} ${f(y - 14 * s)}H${f(X + 3 * s)}Q${f(X + 5 * s)} ${f(y - 10 * s)} ${f(X + 4 * s)} ${f(y)}Z`, stem);
    t += P(`M${f(X - 12 * s)} ${f(y - 12 * s)}Q${f(X - 11 * s)} ${f(y - 26 * s)} ${f(X)} ${f(y - 26 * s)}Q${f(X + 11 * s)} ${f(y - 26 * s)} ${f(X + 12 * s)} ${f(y - 12 * s)}Z`, capSh);
    t += P(`M${f(X - 12 * s)} ${f(y - 13 * s)}Q${f(X - 11 * s)} ${f(y - 26 * s)} ${f(X)} ${f(y - 26 * s)}Q${f(X + 9 * s)} ${f(y - 26 * s)} ${f(X + 10 * s)} ${f(y - 15 * s)}Z`, cap);
    t += circ(X - 4 * s, y - 20 * s, 2 * s, mix(cap, '#FFFFFF', 0.6)) + circ(X + 4 * s, y - 17 * s, 1.5 * s, mix(cap, '#FFFFFF', 0.6));
    return t;
  });
  // tiny clover sprouts on the moss
  for (const x of [90, 430, 600, 930, 1180]) o += wrap(x, 10, X => { const y = te(x) + 10; return strokeP(`M${f(X)} ${f(y + 4)}v-6`, C.grass, 1.6) + circ(X - 3, y - 3, 3, C.grassLt) + circ(X + 3, y - 3, 3, C.grassLt) + circ(X, y - 6, 3, C.grassLt); });
  return svg(W, 260, o, defs);
}
const GROUND_FILL = Object.fromEntries(MOODS.map(m => [m, tone(BASE.soilDeep, 'ground', m)]));

// ---------------- sky props ----------------
function sun() {
  const defs = rg('sg', [[0, '#FFF7DA', 0.85], [0.5, '#FFE9A8', 0.35], [1, '#FFE9A8', 0]]);
  let o = circ(100, 100, 98, 'url(#sg)');
  for (let i = 0; i < 12; i++) o += `<rect x="95" y="14" width="10" height="${i % 2 ? 18 : 24}" rx="5" fill="#FFE59A" opacity="0.9" transform="rotate(${i * 30 + 15} 100 100)"/>`;
  o += circ(100, 100, 54, '#F6C95E') + circ(100, 100, 50, '#FFDF7E');
  o += `<path d="M146 112a50 50 0 0 1-78 26a54 54 0 0 0 78-26Z" fill="#F8CF66"/>`;
  o += ell(82, 80, 15, 9, '#FFF2C4', ' transform="rotate(-35 82 80)"');
  return svg(200, 200, o, defs);
}
function moon() {
  let defs = rg('mg', [[0, '#E6F0FF', 0.5], [0.55, '#C9DAF5', 0.16], [1, '#C9DAF5', 0]]);
  let o = circ(100, 100, 98, 'url(#mg)');
  // crescent: a disc masked by an offset disc (lit side to the left), soft inner shade + a few faint craters
  defs += '<mask id="cr" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#000"/>'
    + circ(96, 100, 58, '#FFF') + circ(128, 84, 50, '#000') + '</mask>';
  o += '<g mask="url(#cr)">' + circ(96, 100, 58, '#F2EBCF') + circ(90, 106, 50, '#FBF6E2') + circ(66, 96, 6, '#E8DFBE') + circ(76, 128, 4.5, '#E8DFBE') + circ(58, 120, 3, '#E8DFBE') + circ(98, 146, 3.5, '#E8DFBE') + '</g>';
  return svg(200, 200, o, defs);
}
function cloudShape(blobs, base, body, shade, hi) {
  const g = (dy, col) => blobs.map(([x, y, r]) => circ(x, y + dy, r, col)).join('') + rect(base[0], base[1] + dy, base[2], base[3], col, base[3] / 2);
  return g(7, shade) + g(0, body) + blobs.slice(0, 2).map(([x, y, r]) => ell(x - r * 0.25, y - r * 0.35, r * 0.45, r * 0.25, hi)).join('');
}
const CLOUDS = [
  [[[95, 92, 38], [150, 70, 52], [210, 90, 38]], [50, 90, 210, 44]],
  [[[80, 96, 32], [128, 76, 42], [180, 66, 46], [232, 94, 32]], [46, 92, 214, 38]],
  [[[118, 86, 40], [172, 82, 44]], [70, 88, 150, 40]],
];
const cloud = i => svg(300, 160, cloudShape(CLOUDS[i][0], CLOUDS[i][1], '#FFFFFF', '#E1E9F0', '#FFFFFF'));

// mossy log Lolo sits on: seat top centre (160, 34), bottom 140
function log() {
  const bark = '#8A6A4E', barkSh = '#6E523B', barkDk = '#5E4532', line = '#4E3826', moss = '#8DBA6A', mossSh = '#6E9A50', mossHi = '#B4D68E';
  let o = ell(162, 132, 146, 8, '#2E3A2A', ' opacity="0.22"');
  // body (cylinder lying down), outline 4 px
  o += P('M34 34H282Q306 34 306 82Q306 128 282 128H34Z', line);
  o += P('M36 38H280Q302 38 302 82Q302 124 280 124H36Z', bark);
  o += P('M36 92H284Q300 92 301 84Q300 124 280 124H36Z', barkSh);
  // bark grooves
  for (const [x, y, l] of [[70, 60, 60], [150, 74, 70], [230, 58, 40], [100, 104, 70], [210, 100, 60]]) o += strokeP(`M${x} ${y}q${l / 2} -5 ${l} 0`, barkDk, 3.2);
  // branch stub top right
  o += P('M246 40L262 6Q266 0 272 4L276 8Q280 14 274 18L264 42Z', line) + P('M249 40L264 9Q267 5 271 7L273 9Q276 13 272 16L262 40Z', bark);
  o += ell(270, 9, 4.5, 3.5, '#C9A582');
  // cut end (left) with rings
  o += ell(36, 81, 26, 47, line) + ell(36, 81, 22, 43, '#D9B98E') + ell(36, 81, 15, 31, 'none', ' stroke="#BF9A6E" stroke-width="3"') + ell(36, 81, 7, 15, 'none', ' stroke="#BF9A6E" stroke-width="3"') + circ(36, 81, 2.5, '#A98157');
  o += ell(30, 60, 6, 10, '#EBD2AC', ' opacity="0.8"');
  // moss blanket on top with drips; the seat (x 120..200) is flat at y 34
  o += P('M58 40Q56 30 70 30L120 33Q160 32 200 33L262 30Q282 30 286 42Q290 52 278 50Q270 60 262 50Q252 58 240 48L216 50Q208 64 198 50L150 52Q142 66 132 52L106 50Q96 60 88 48Q72 54 66 46Q58 50 58 40Z', mossSh);
  o += P('M60 38Q58 29 72 29L120 31Q160 29.5 200 31L262 28Q280 28 283 40Q284 46 276 45Q268 52 260 45Q250 51 240 44L216 45Q206 56 198 46L150 47Q140 58 132 47L106 45Q96 54 88 44Q74 48 68 42Q60 44 60 38Z', moss);
  o += strokeP('M74 33Q120 30 160 31T258 31', mossHi, 3.5);
  // a tiny mushroom and a fern sprout on the right end
  o += P('M292 92q-1 -9 2 -12h4q3 3 2 12Z', '#F1E6D2') + P('M286 82q2 -11 10 -11t10 11Z', '#D88E78') + circ(293, 76, 1.6, '#F6D2C6');
  o += P(blade(240, 40, -1.9, 26, 4, 4, 0.5, 10).d, mossSh) + P(blade(244, 40, -1.2, 22, 4, 3.6, 0.5, 10).d, moss);
  // highlight upper-left on the bark
  o += strokeP('M70 50Q120 46 170 48', '#A8876A', 4, ' opacity="0.8"');
  return svg(320, 140, o);
}

// ---------------- particles (0 0 32 32) ----------------
const S = b => svg(32, 32, b);
const PARTICLES = {
  petal_a: () => S(`<path d="M16 3Q26 8 24 18Q21 27 16 29Q11 27 8 18Q6 8 16 3Z" fill="#E7C6F0" stroke="#C9A2D8" stroke-width="1.4"/><path d="M16 26V10" stroke="#D4B0E2" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9Q14 6 17 6" stroke="#F6E8FA" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  petal_b: () => S(`<path d="M6 22Q4 10 14 5Q24 2 27 10Q28 18 20 24Q12 29 6 22Z" fill="#F8CCD8" stroke="#E0A6B8" stroke-width="1.4"/><path d="M9 20Q15 14 22 9" stroke="#FBE5EC" stroke-width="2" fill="none" stroke-linecap="round"/>` + circ(10, 21, 1.8, '#F7E4A6')),
  leaf_a: () => S(`<path d="M4 27Q5 8 28 4Q27 25 4 27Z" fill="#8FBF74" stroke="#679A54" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 26Q16 16 25 7M12 19L11 13M16 15L20 16M19 12L18 8" stroke="#679A54" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M10 12Q14 8 20 7" stroke="#C3E0A8" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  leaf_b: () => S(`<path d="M16 3Q28 9 25 20Q22 27 16 29Q10 27 7 20Q4 9 16 3Z" fill="#C9C46E" stroke="#9E9A4A" stroke-width="1.4" stroke-linejoin="round"/><path d="M16 31V8M16 15L11 11M16 15L21 11M16 21L10 17M16 21L22 17" stroke="#9E9A4A" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M11 8Q13 6 16 5.5" stroke="#E8E4A8" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  pollen: () => svg(32, 32, circ(16, 16, 15, 'url(#p)') + circ(16, 16, 4.5, '#FFF6CF') + circ(14.8, 14.8, 1.6, '#FFFFFF'), rg('p', [[0, '#FFF0B0', 0.9], [0.4, '#FFE89A', 0.35], [1, '#FFE89A', 0]])),
  firefly: () => svg(32, 32, circ(16, 16, 16, 'url(#ff)') + circ(16, 16, 5.5, '#E9FF9C') + circ(16, 16, 3, '#FBFFE0'), rg('ff', [[0, '#DDFF7A', 0.9], [0.3, '#C4F25E', 0.45], [0.7, '#B6EC5A', 0.12], [1, '#B6EC5A', 0]])),
  sparkle: () => S(circ(16, 16, 9, '#FFF7D6', ' opacity="0.5"') + `<path d="M16 2Q18 14 30 16Q18 18 16 30Q14 18 2 16Q14 14 16 2Z" fill="#FFFFFF"/>` + circ(16, 16, 3, '#FFF3C2')),
  star: () => S(`<path d="M16 3L19.8 11.2L28.4 12.2L22 18.2L23.7 27L16 22.6L8.3 27L10 18.2L3.6 12.2L12.2 11.2Z" fill="#FFE08A" stroke="#E0B54F" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 13.5L15 9" stroke="#FFF3C6" stroke-width="2" stroke-linecap="round"/>`),
  puff: () => S(`<path d="M6 22a6 6 0 0 1 3-11a7 7 0 0 1 13-2a6 6 0 0 1 4 11a5 5 0 0 1-5 6H11a5 5 0 0 1-5-4Z" fill="#E7EDF2" transform="translate(0 1.5)"/><path d="M6 22a6 6 0 0 1 3-11a7 7 0 0 1 13-2a6 6 0 0 1 4 11a5 5 0 0 1-5 6H11a5 5 0 0 1-5-4Z" fill="#FFFFFF"/>` + ell(13, 12, 3.5, 2, '#FFFFFF')),
  confetti_a: () => S(`<rect x="9" y="5" width="14" height="22" rx="3" fill="#FFFFFF" transform="rotate(18 16 16)"/><rect x="16" y="5" width="7" height="22" rx="3" fill="#E4E4E4" transform="rotate(18 16 16)"/>`),
  confetti_b: () => S(`<path d="M5 20Q10 8 16 16T27 12" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M5 22Q10 10 16 18T27 14" stroke="#E2E2E2" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>`),
};

// ---------------- write ----------------
function main() {
  const env = path.join(A, 'env'), par = path.join(A, 'particles');
  fs.mkdirSync(env, { recursive: true }); fs.mkdirSync(par, { recursive: true });
  const out = {};
  for (const m of MOODS) { out[`far_${m}`] = far(m); out[`mid_${m}`] = mid(m); out[`ground_${m}`] = ground(m); }
  out.sun = sun(); out.moon = moon(); [0, 1, 2].forEach(i => { out['cloud' + (i + 1)] = cloud(i); }); out.log = log();
  for (const [n, s] of Object.entries(out)) fs.writeFileSync(path.join(env, n + '.svg'), s);
  for (const [n, fn] of Object.entries(PARTICLES)) fs.writeFileSync(path.join(par, n + '.svg'), fn());
  // remove the old city game's files (env/ and particles/ are owned by this generator)
  const old = [];
  for (const s of ['sunny', 'breezy', 'rain', 'rainbow']) for (const l of ['far', 'mid', 'ground']) old.push(path.join(env, `${l}_${s}.svg`));
  for (const n of ['rain_cloud', 'rainbow', 'car_a', 'car_b', 'bus', 'kite']) old.push(path.join(env, n + '.svg'));
  for (const p of ['drop', 'splash', 'paper']) old.push(path.join(par, p + '.svg'));
  let removed = 0; for (const p of old) if (fs.existsSync(p)) { fs.unlinkSync(p); removed++; }
  console.log('env:', Object.keys(out).map(n => `${n} ${(out[n].length / 1024).toFixed(1)}k`).join(', '));
  console.log('particles:', Object.keys(PARTICLES).join(', ')); console.log('removed old files:', removed);
}
if (require.main === module) main();
module.exports = { MOODS, GROUND_FILL, HAZE, MID_OPAQUE };
