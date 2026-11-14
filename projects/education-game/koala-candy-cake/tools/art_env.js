// Koko's Cake Tower: Candy Village environment + particle art generator (original, procedurally laid out flat-cartoon SVGs).
// Writes game/assets/default/env/{far,mid,ground}_{sunny,breezy,rain,rainbow}.svg, stand, cloud_candy, sun, rainbow,
// cloud_a..c, cloud_rain  and  game/assets/default/particles/{sparkle, sugar, wrapper_a, wrapper_b, blossom, raindrop,
// splash, puff, dust, confetti_a, confetti_b, star}.svg                                              (DESIGN §4.3)
// Usage: node tools/art_env.js        Preview scenes + seam proof: node tools/env_scenes.js
//
// Tiling: every object that may cross the left/right edge of a tileable file is drawn again at x±1200 (wrap()); edge
// curves are sums of sines with whole-number periods over 1200 px, so the left and right edges match exactly. The four
// moods share ONE layout per layer (same seed); colours change, breezy leans trees/flags, rain adds wet sheen + puddles,
// rainbow adds a few soft glints.
// Colour rule (DESIGN §3): pastel, calm (HSV saturation ≤ 0.45 checked below), yellower than the answer colours so red /
// blue / yellow / green cake layers pop. The mid layer's front band = GROUND[mood] exactly, so mid → ground has no visible
// seam and the renderer can fill any gap between them with GROUND[mood]; FARFILL[mood] = the far layer's bottom colour.
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
// mound (rounded candy hill) from x-w..x+w at baseline y0, height h
const mound = (x, y0, w, h) => `M${f(x - w)} ${f(y0)}C${f(x - w * 0.92)} ${f(y0 - h * 1.32)} ${f(x + w * 0.92)} ${f(y0 - h * 1.32)} ${f(x + w)} ${f(y0)}Z`;
// group helper: translate to (x, by); lean = skewX degrees around the baseline (breezy)
const G = (x, by, body, lean = 0) => `<g transform="translate(${f(x)} ${f(by)})${lean ? ` skewX(${f(lean)})` : ''}">${body}</g>`;

// ---------------- moods ----------------
const SKY = { sunny: ['#A9DDF5', '#FFF4DA'], breezy: ['#BFDDEB', '#F3EEDF'], rain: ['#8FA0B8', '#CBD5E0'], rainbow: ['#9FD6F0', '#FFF1D6'] };
const MOOD = {
  sunny: { tint: '#FFFFFF', amt: { far: 0, mid: 0, ground: 0 }, haze: 0.12 },
  breezy: { tint: '#E3ECEE', amt: { far: 0.12, mid: 0.07, ground: 0.05 }, haze: 0.16, lean: -7 },
  rain: { tint: '#7D89A2', amt: { far: 0.34, mid: 0.24, ground: 0.17 }, haze: 0.14, wet: true },
  rainbow: { tint: '#F6FFF8', amt: { far: 0.06, mid: 0.04, ground: 0.03 }, haze: 0.08, glint: true },
};
const BASE = {
  far: { pink: '#EFCDCD', pinkSh: '#E0B7BA', mint: '#C8E2CC', mintSh: '#B0D1B8', lemon: '#F2E3B6', lemonSh: '#E3CF9A', lilac: '#D8CFE6', lilacSh: '#C3B8D8',
    base: '#E3E6C9', icing: '#FFFCF4', wall: '#DFC3A2', roof: '#F8EEE8', tree: '#E8C4CC', treeB: '#C9E2D4' },
  mid: { ginger: '#D6AE84', gingerSh: '#C0946A', gingerLn: '#9C7A5E', door: '#B58B6A', doorLn: '#8F6B52', win: '#FFF1CF', winGlow: '#FBE4B4',
    icing: '#FFFCF5', icingSh: '#EFE6DA',
    roofPink: '#F2C6CC', roofPinkSh: '#DDA9B2', roofMint: '#C3E3D3', roofMintSh: '#A5CDB9', roofLemon: '#F4E2AE', roofLemonSh: '#DFC98C', roofLilac: '#D9CCEA', roofLilacSh: '#BFAFD6',
    stick: '#FBF6EE', stickLn: '#D9CDBD', lolPink: '#F5CBD3', lolPinkB: '#FFF4F2', lolPinkLn: '#D9A6B0', lolMint: '#C6E7D8', lolMintB: '#F4FCF7', lolMintLn: '#9DC9B4',
    lolLilac: '#DCD0EE', lolLilacB: '#F8F4FD', lolLilacLn: '#B8A7D4', lolPeach: '#F8D8BE', lolPeachB: '#FFF6EC', lolPeachLn: '#D9B192',
    gumPink: '#EFBFC8', gumMint: '#BEDFCB', gumLilac: '#D4C6E6', gumPeach: '#F2D1B3', cane: '#FFFDF8', caneStripe: '#EDB4B8', caneLn: '#D8C6BC', flag: '#F2C6CC' },
  ground: { base: '#F3E2C0', front: '#E6CC9E', rim: '#E2C89C', lip: '#FBF0D8', hi: '#F8EBD0', spA: '#F0BFC6', spB: '#BFE0CF', spC: '#D6CBEA', spD: '#F4D7A8',
    puddle: '#C6D2E0', puddleHi: '#EEF3F8' },
};
function pal(m, layer) {
  const M = MOOD[m], o = {};
  for (const [k, v] of Object.entries(BASE[layer])) {
    let c = mix(v, M.tint, M.amt[layer]);
    if (layer === 'far') c = mix(c, SKY[m][1], M.haze);
    o[k] = c;
  }
  return o;
}
const GROUND = Object.fromEntries(MOODS.map(m => [m, pal(m, 'ground').base]));
const FARFILL = Object.fromEntries(MOODS.map(m => [m, pal(m, 'far').base]));

// ================= far_<m>.svg (0 0 1200 420): pastel candy hills + tiny distant cottages =================
function farLayout() {
  const r = rng(111), rows = [];
  const kinds = ['pink', 'mint', 'lemon', 'lilac'];
  const spec = [[7, 150, 232, 60, 0.42], [8, 120, 300, 54, 0.18], [9, 105, 360, 46, 0.03]];  // count, half-width, baseline, height, haze extra
  spec.forEach(([n, w, y0, h, hz], ri) => {
    const ms = [];
    for (let i = 0; i < n; i++) ms.push({ x: (i + 0.5) * W / n + (r() - 0.5) * 50, w: w * (0.85 + r() * 0.35), h: h * (0.75 + r() * 0.5), k: kinds[(i * 3 + ri * 2 + 1) % 4], icing: r() < 0.35 });
    rows.push({ ms, y0, hz });
  });
  const huts = []; // tiny cottages on row 1 (middle) mound tops
  rows[1].ms.forEach((m, i) => { if (i % 2 === 0) huts.push({ x: m.x + (r() - 0.5) * m.w * 0.5, mi: i, s: 0.8 + r() * 0.4 }); });
  const trees = []; for (let i = 0; i < 16; i++) trees.push({ x: r() * W, s: 0.7 + r() * 0.5, c: r() < 0.5 });
  return { rows, huts, trees };
}
const FAR = farLayout();
const moundTop = (m, y0, x) => { // y of the mound's top curve at x (approx: cubic bezier sampled)
  let best = y0;
  for (let t = 0; t <= 1; t += 0.02) {
    const bx = (1 - t) ** 3 * (m.x - m.w) + 3 * (1 - t) ** 2 * t * (m.x - m.w * 0.92) + 3 * (1 - t) * t * t * (m.x + m.w * 0.92) + t ** 3 * (m.x + m.w);
    const byy = (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * (y0 - m.h * 1.32) + 3 * (1 - t) * t * t * (y0 - m.h * 1.32) + t ** 3 * y0;
    if (Math.abs(bx - x) < 6) best = Math.min(best, byy);
  }
  return best;
};
function genFar(m) {
  const C = pal(m, 'far'), M = MOOD[m];
  let o = '';
  FAR.rows.forEach((row, ri) => {
    const hz = c => mix(c, SKY[m][1], row.hz);
    o += P(`M0 ${row.y0 - 6}H${W}V420H0Z`, hz(ri === 2 ? C.base : mix(C.base, C.mint, 0.3)));
    for (const mm of row.ms) o += wrap(mm.x, mm.w + 10, x => {
      const col = hz(C[mm.k]), sh = hz(C[mm.k + 'Sh']);
      let s = P(mound(x + 7, row.y0, mm.w, mm.h), sh) + P(mound(x, row.y0, mm.w * 0.98, mm.h), col);
      // a soft highlight on the upper left
      s += P(mound(x - mm.w * 0.32, row.y0 - mm.h * 0.62, mm.w * 0.3, mm.h * 0.2), '#FFFFFF', ' opacity="0.28"');
      if (mm.icing) { // a little frosting cap with drips
        const ty = row.y0 - mm.h, cw = mm.w * 0.42;
        let d = `M${f(x - cw)} ${f(ty + mm.h * 0.12)}Q${f(x)} ${f(ty - mm.h * 0.16)} ${f(x + cw)} ${f(ty + mm.h * 0.12)}`;
        for (let k = 4; k >= 0; k--) { const px = x - cw + (2 * cw) * k / 4; d += `L${f(px)} ${f(ty + mm.h * 0.12 + (k % 2 ? 7 : 3))}`; }
        s += P(d + 'Z', hz(C.icing), ' opacity="0.9"');
      }
      return s;
    });
    if (ri === 1) for (const hu of FAR.huts) { // tiny distant gingerbread cottages
      const mm = row.ms[hu.mi], s = hu.s;
      o += wrap(hu.x, 20, x => {
        const by = moundTop(mm, row.y0, hu.x) + 5 - (hu.x - x === 0 ? 0 : 0);
        const ww = 18 * s, hh = 12 * s, rh = 11 * s;
        return P(`M${f(x - ww / 2)} ${f(by)}V${f(by - hh)}H${f(x + ww / 2)}V${f(by)}Z`, hz(C.wall)) +
          P(`M${f(x - ww / 2 - 3)} ${f(by - hh + 1)}L${f(x)} ${f(by - hh - rh)}L${f(x + ww / 2 + 3)} ${f(by - hh + 1)}Z`, hz(C.roof)) +
          P(`M${f(x - 2.5 * s)} ${f(by)}V${f(by - 6 * s)}H${f(x + 2.5 * s)}V${f(by)}Z`, hz(mix(C.wall, '#8E6A4E', 0.35)));
      });
    }
    if (ri === 2) for (const t of FAR.trees) o += wrap(t.x, 14, x => { // tiny lollipop dots on the nearest hills
      const by = row.y0 + 18 + (t.s - 0.7) * 30, s = t.s, lean = M.lean ? M.lean * 0.6 : 0;
      return G(x, by, strokeP(`M0 0V${f(-16 * s)}`, hz('#F6F1E8'), 2.2) + circ(0, -20 * s, 7 * s, hz(t.c ? C.tree : C.treeB)), lean);
    });
  });
  if (M.wet) o += P(`M0 300H${W}V420H0Z`, '#FFFFFF', ' opacity="0.05"');
  if (M.glint) { const r = rng(5); let d = ''; for (let i = 0; i < 14; i++) { const x = r() * W, y = 150 + r() * 160, s = 3 + r() * 3; d += `M${f(x)} ${f(y - s)}L${f(x + s * 0.3)} ${f(y - s * 0.3)}L${f(x + s)} ${f(y)}L${f(x + s * 0.3)} ${f(y + s * 0.3)}L${f(x)} ${f(y + s)}L${f(x - s * 0.3)} ${f(y + s * 0.3)}L${f(x - s)} ${f(y)}L${f(x - s * 0.3)} ${f(y - s * 0.3)}Z`; } o += P(d, '#FFFFFF', ' opacity="0.75"'); }
  return svg(1200, 420, o);
}

// ================= mid_<m>.svg (0 0 1200 380): gingerbread cottages, lollipop trees, gumdrop bushes, candy-cane fence ====
const BASEY = 272; // where everything stands (in landscape the ground tile's edge hides ~10 px below this)
function midLayout() {
  const r = rng(222);
  const cottages = [
    { x: 150, w: 112, h: 78, rh: 64, roof: 'Pink', door: -1, chim: true, flag: false },
    { x: 470, w: 132, h: 92, rh: 72, roof: 'Mint', door: 1, chim: false, flag: true },
    { x: 760, w: 100, h: 72, rh: 58, roof: 'Lilac', door: 0, chim: true, flag: false },
    { x: 1035, w: 124, h: 84, rh: 68, roof: 'Lemon', door: -1, chim: false, flag: true },
  ];
  const lolls = [
    { x: 40, sh: 120, r: 34, c: 'Mint' }, { x: 300, sh: 150, r: 40, c: 'Peach' }, { x: 610, sh: 132, r: 36, c: 'Pink' },
    { x: 890, sh: 160, r: 42, c: 'Lilac' }, { x: 1160, sh: 112, r: 30, c: 'Pink' },
  ];
  const gums = []; const gk = ['Pink', 'Mint', 'Lilac', 'Peach'];
  for (let i = 0; i < 22; i++) gums.push({ x: i * W / 22 + (r() - 0.5) * 24, r: 12 + r() * 10, c: gk[(i * 3 + (r() < 0.3 ? 1 : 0)) % 4] });
  // fence segments (between cottages), canes every 26 px
  const fence = [[205, 395], [545, 700], [815, 960], [1100, 1300]];
  return { cottages, lolls, gums, fence };
}
const MID = midLayout();
const frontEdge = x => ridge(x, BASEY + 6, [[3, 2, 1.3], [2, 5, 0.4], [1, 9, 2.0]]);
function lollipop(C, l, wet, glint) {
  const R = l.r, top = -l.sh - R, a = C['lol' + l.c], b = C['lol' + l.c + 'B'], ln = C['lol' + l.c + 'Ln'];
  let s = '';
  s += strokeP(`M0 0V${f(-l.sh)}`, C.stickLn, 9) + strokeP(`M0 -1V${f(-l.sh)}`, C.stick, 6);
  s += circ(0, top, R + 2, ln) + circ(0, top, R, a);
  // swirl (archimedean spiral) in the light tone
  const pts = []; for (let t = 0; t <= 1; t += 0.025) { const ang = t * TAU * 2.6, rr = 3 + t * (R - 6); pts.push([Math.cos(ang) * rr, top + Math.sin(ang) * rr]); }
  s += strokeP(line(pts), b, R * 0.2);
  s += ell(-R * 0.38, top - R * 0.42, R * 0.26, R * 0.15, '#FFFFFF', ` opacity="${wet ? 0.85 : 0.6}" transform="rotate(-35 ${f(-R * 0.38)} ${f(top - R * 0.42)})"`);
  if (wet) s += strokeP(`M${f(R * 0.5)} ${f(top + R * 0.2)}Q${f(R * 0.62)} ${f(top + R * 0.45)} ${f(R * 0.35)} ${f(top + R * 0.7)}`, '#FFFFFF', 2.4, ' opacity="0.7"');
  if (glint) s += star4(R * 0.55, top - R * 0.75, 5, '#FFFFFF', 0.9);
  return s;
}
function star4(x, y, s, col, a) {
  return P(`M${f(x)} ${f(y - s)}Q${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s)} ${f(y)}Q${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x)} ${f(y + s)}Q${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s)} ${f(y)}Q${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x)} ${f(y - s)}Z`, col, ` opacity="${a}"`);
}
function cottage(C, c, M) {
  const w = c.w, h = c.h, rh = c.rh, ov = 12, rc = C['roof' + c.roof], rsh = C['roof' + c.roof + 'Sh'];
  let s = ell(0, 2, w * 0.62, 5, C.gingerSh, ' opacity="0.45"');
  // chimney (behind the roof)
  if (c.chim) s += P(`M${f(w * 0.2)} ${f(-h - rh * 0.3)}V${f(-h - rh * 0.95)}H${f(w * 0.34)}V${f(-h - rh * 0.1)}Z`, C.ginger, ` stroke="${C.gingerLn}" stroke-width="3" stroke-linejoin="round"`) +
    P(`M${f(w * 0.17)} ${f(-h - rh * 0.95)}Q${f(w * 0.27)} ${f(-h - rh * 1.12)} ${f(w * 0.37)} ${f(-h - rh * 0.95)}L${f(w * 0.36)} ${f(-h - rh * 0.88)}Q${f(w * 0.27)} ${f(-h - rh * 0.8)} ${f(w * 0.18)} ${f(-h - rh * 0.88)}Z`, C.icing);
  // walls
  s += P(`M${f(-w / 2)} 0V${f(-h)}H${f(w / 2)}V0Z`, C.ginger, ` stroke="${C.gingerLn}" stroke-width="3" stroke-linejoin="round"`);
  s += P(`M${f(w * 0.22)} -1.5V${f(-h + 1.5)}H${f(w / 2 - 1.5)}V-1.5Z`, C.gingerSh, ' opacity="0.7"');
  // corner icing dots
  let dots = ''; for (let k = 1; k < 5; k++) { dots += cp(-w / 2 + 7, -h * k / 5, 2.4) + cp(w / 2 - 7, -h * k / 5, 2.4); }
  s += P(dots, C.icing, ' opacity="0.9"');
  // door (arched)
  const dx = c.door * w * 0.22, dw = 13 + w * 0.06, dh = h * 0.58;
  s += P(`M${f(dx - dw)} 0V${f(-dh + dw)}A${f(dw)} ${f(dw)} 0 0 1 ${f(dx + dw)} ${f(-dh + dw)}V0Z`, C.door, ` stroke="${C.doorLn}" stroke-width="2.6"`);
  s += P(`M${f(dx - dw - 4)} 0V${f(-dh + dw)}A${f(dw + 4)} ${f(dw + 4)} 0 0 1 ${f(dx + dw + 4)} ${f(-dh + dw)}V0`, 'none', ` stroke="${C.icing}" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round"`);
  s += circ(dx + dw * 0.5, -dh * 0.45, 2.6, C.roofPink);
  // windows (round with icing cross) on the other side(s)
  const wins = c.door === 0 ? [-w * 0.3, w * 0.3] : [-c.door * w * 0.24];
  for (const wx of wins) {
    const wy = -h * 0.55, wr = Math.min(15, w * 0.12);
    s += circ(wx, wy, wr + 3.5, C.icing) + circ(wx, wy, wr, M.wet ? mix(C.win, '#FFE3A6', 0.4) : C.win) + strokeP(`M${f(wx - wr)} ${f(wy)}H${f(wx + wr)}M${f(wx)} ${f(wy - wr)}V${f(wy + wr)}`, C.icing, 3);
  }
  // roof (triangle with scalloped shingle rows)
  const L = [-w / 2 - ov, -h + 6], R = [w / 2 + ov, -h + 6], T = [0, -h - rh];
  s += P(poly([L, T, R]), rc, ` stroke="${rsh}" stroke-width="3" stroke-linejoin="round"`);
  s += P(poly([[R[0] * 0.25, T[1] + rh * 0.25], T, R, [R[0] * 0.25, R[1]]]), rsh, ' opacity="0.45"');
  let sc = '';
  for (let row = 1; row <= 3; row++) {
    const yy = T[1] + rh * (row * 0.24 + 0.08), half = (yy - T[1]) / (L[1] - T[1]) * (w / 2 + ov) - 8, n = Math.max(2, Math.round(half * 2 / 18));
    for (let k = 0; k < n; k++) { const x0 = -half + k * (2 * half / n); sc += `M${f(x0)} ${f(yy)}q${f(half / n)} ${f(8)} ${f(2 * half / n)} 0`; }
  }
  s += strokeP(sc, rsh, 2, ' opacity="0.75"');
  // frosting along the eaves with drips
  let drips = '';
  for (const side of [-1, 1]) for (let k = 1; k <= 4; k++) {
    const t = k / 5, x = T[0] + (side * (w / 2 + ov) - T[0]) * t, y = T[1] + (L[1] - T[1]) * t, len = 5 + ((k * 7 + (side > 0 ? 3 : 0)) % 4) * 3;
    drips += `M${f(x)} ${f(y)}v${f(len)}`;
  }
  s += strokeP(`M${f(L[0] + 2)} ${f(L[1])}L${f(T[0])} ${f(T[1])}L${f(R[0] - 2)} ${f(R[1])}`, C.icingSh, 11) +
    strokeP(`M${f(L[0] + 2)} ${f(L[1] - 1.5)}L${f(T[0])} ${f(T[1] - 1.5)}L${f(R[0] - 2)} ${f(R[1] - 1.5)}`, C.icing, 9) + strokeP(drips, C.icing, 6.5);
  if (M.wet) s += strokeP(`M${f(L[0] * 0.75)} ${f(L[1] - rh * 0.3)}L${f(L[0] * 0.35)} ${f(T[1] + rh * 0.42)}M${f(R[0] * 0.3)} ${f(T[1] + rh * 0.55)}L${f(R[0] * 0.55)} ${f(R[1] - rh * 0.28)}`, '#FFFFFF', 3, ' opacity="0.55"');
  // gumdrop on the peak or a little flag
  if (c.flag) {
    const lean = M.lean ? 1 : 0, py = T[1] - 4;
    s += strokeP(`M0 ${f(py)}V${f(py - 30)}`, C.stickLn, 3);
    s += lean ? P(`M1 ${f(py - 30)}Q14 ${f(py - 34)} 28 ${f(py - 27)}Q14 ${f(py - 24)} 1 ${f(py - 19)}Z`, C.flag, ` stroke="${C.roofPinkSh}" stroke-width="1.6"`)
      : P(`M1 ${f(py - 30)}Q10 ${f(py - 27)} 17 ${f(py - 20)}Q8 ${f(py - 20)} 1 ${f(py - 17)}Z`, C.flag, ` stroke="${C.roofPinkSh}" stroke-width="1.6"`);
  } else s += P(`M-7 ${f(T[1] + 2)}C-7 ${f(T[1] - 12)} 7 ${f(T[1] - 12)} 7 ${f(T[1] + 2)}Z`, C.gumPink, ` stroke="${mix(C.gumPink, '#8A5A62', 0.3)}" stroke-width="2"`);
  if (M.glint) s += star4(-w * 0.25, T[1] + rh * 0.35, 5, '#FFFFFF', 0.85);
  return s;
}
function gumdrop(C, g, M) {
  const r = g.r, col = C['gum' + g.c], ln = mix(col, '#7A5A62', 0.28);
  let s = P(`M${f(-r)} 0C${f(-r)} ${f(-r * 1.45)} ${f(r)} ${f(-r * 1.45)} ${f(r)} 0Z`, col, ` stroke="${ln}" stroke-width="2.4" stroke-linejoin="round"`);
  s += P(`M${f(r * 0.35)} -1C${f(r * 0.6)} ${f(-r * 0.6)} ${f(r * 0.4)} ${f(-r * 0.95)} ${f(r * 0.1)} ${f(-r * 1.06)}C${f(r * 0.8)} ${f(-r * 1)} ${f(r)} ${f(-r * 0.5)} ${f(r - 1)} -1Z`, ln, ' opacity="0.22"');
  s += P(cp(-r * 0.4, -r * 0.62, 1.3) + cp(r * 0.05, -r * 0.82, 1.2) + cp(-r * 0.05, -r * 0.35, 1.1) + cp(r * 0.45, -r * 0.4, 1.1), '#FFFFFF', ' opacity="0.8"');
  s += ell(-r * 0.42, -r * 0.72, r * 0.2, r * 0.12, '#FFFFFF', ` opacity="${M.wet ? 0.8 : 0.5}" transform="rotate(-35 ${f(-r * 0.42)} ${f(-r * 0.72)})"`);
  return s;
}
function fenceSeg(C, x0, x1, M) {
  let posts = '', hooks = '';
  const n = Math.round((x1 - x0) / 26), lean = M.lean ? 2 : 0;
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, hgt = 44, dir = k % 2 ? 1 : -1;
    posts += `M${f(x)} ${BASEY}V${f(BASEY - hgt)}`;
    hooks += `M${f(x)} ${f(BASEY - hgt)}a${f(7)} ${f(7)} 0 0 ${dir > 0 ? 1 : 0} ${f(14 * dir)} 0v${f(5 + lean)}`;
  }
  const d = posts + hooks;
  let s = strokeP(`M${f(x0)} ${BASEY - 16}H${f(x1)}M${f(x0)} ${BASEY - 31}H${f(x1)}`, C.caneLn, 6) + strokeP(`M${f(x0)} ${BASEY - 16}H${f(x1)}M${f(x0)} ${BASEY - 31}H${f(x1)}`, C.icing, 3.6);
  s += strokeP(d, C.caneLn, 9) + strokeP(d, C.cane, 6) + `<path d="${d}" fill="none" stroke="${C.caneStripe}" stroke-width="6" stroke-dasharray="5 6"/>`;
  return s;
}
function genMid(m) {
  const C = pal(m, 'mid'), Gp = pal(m, 'ground'), M = MOOD[m], L = MID, lean = M.lean || 0;
  let o = '';
  for (const l of L.lolls) o += wrap(l.x, l.r + 30, x => G(x, BASEY + 2, lollipop(C, l, M.wet, M.glint), lean));
  for (const c of L.cottages) o += wrap(c.x, c.w / 2 + 20, x => G(x, BASEY, cottage(C, c, M)));
  for (const [a, b] of L.fence) o += wrap((a + b) / 2, (b - a) / 2 + 10, x => `<g transform="translate(${f(x - (a + b) / 2)} 0)">${fenceSeg(C, a, b, M)}</g>`);
  for (const g of L.gums) o += wrap(g.x, g.r + 4, x => G(x, BASEY + 4, gumdrop(C, g, M), lean * 0.3));
  // front band = the ground colour (seamless into ground_<m>), a soft lip and a cream path
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, frontEdge(x)]);
  o += P(line(pts) + `L${W} 380L0 380Z`, Gp.base) + strokeP(line(pts), Gp.lip, 3, ' opacity="0.9"');
  o += strokeP(line(pts.map(([x, y]) => [x, y + 4])), Gp.rim, 1.6, ' opacity="0.5"');
  if (M.wet) for (const [px, py, rx] of [[330, 300, 46], [880, 306, 38]]) o += ell(px, py, rx, 6, Gp.puddle, ' opacity="0.75"') + ell(px - rx * 0.2, py - 1.5, rx * 0.4, 1.6, Gp.puddleHi, ' opacity="0.8"');
  return svg(1200, 380, o);
}

// ================= ground_<m>.svg (0 0 1200 260): the smooth cream / biscuit plaza =================
const edgeY = x => ridge(x, 36, [[4, 2, 0.7], [3, 3, 1.9], [1.5, 7, 0.3]]);
function groundLayout() {
  const r = rng(333), spr = [];
  // sprinkles only in the band just under the edge (y 52..96) and the very front corners of each tile (y > 236)
  for (let i = 0; i < 34; i++) spr.push({ x: r() * W, y: 54 + r() * 40, a: r() * 180, c: ['spA', 'spB', 'spC', 'spD'][i % 4] });
  for (let i = 0; i < 10; i++) spr.push({ x: r() * W, y: 238 + r() * 16, a: r() * 180, c: ['spA', 'spB', 'spC', 'spD'][(i + 1) % 4] });
  const puddles = [{ x: 180, y: 78, rx: 70, ry: 9 }, { x: 640, y: 70, rx: 54, ry: 7 }, { x: 1010, y: 84, rx: 82, ry: 10 }, { x: 420, y: 246, rx: 90, ry: 8 }];
  const glints = []; for (let i = 0; i < 12; i++) glints.push({ x: r() * W, y: 52 + r() * 50, s: 3 + r() * 3 });
  return { spr, puddles, glints };
}
const GRD = groundLayout();
function genGround(m) {
  const C = pal(m, 'ground'), M = MOOD[m], L = GRD;
  let o = '', defs = '';
  const pts = []; for (let x = 0; x <= W; x += 10) pts.push([x, edgeY(x)]);
  o += P(line(pts) + `L${W} 260L0 260Z`, C.base);
  // lip (soft light rounded edge, like a biscuit rim) and its shadow
  o += strokeP(line(pts.map(([x, y]) => [x, y + 6])), C.rim, 4, ' opacity="0.55"');
  o += strokeP(line(pts), C.lip, 5);
  // very soft depth gradient towards the front; middle band stays plain
  defs += lgr('gd', [[0, C.front, 0], [1, C.front, 1]], ' x1="0" y1="0" x2="0" y2="1"');
  o += `<rect x="0" y="120" width="${W}" height="140" fill="url(#gd)"/>`;
  // a few very faint wide sheen ovals (smooth, polished plaza)
  for (const [px, py, rx, ry] of [[200, 120, 190, 14], [760, 136, 230, 16], [1080, 110, 150, 11]]) o += wrap(px, rx, x => ell(x, py, rx, ry, C.hi, ' opacity="0.45"'));
  // sprinkles
  const byC = {};
  for (const s of L.spr) { if (M.wet && s.y > 230) continue; byC[s.c] = (byC[s.c] || '') + wrap(s.x, 6, x => { const a = s.a * Math.PI / 180, dx = Math.cos(a) * 4, dy = Math.sin(a) * 4; return `M${f(x - dx)} ${f(s.y - dy)}L${f(x + dx)} ${f(s.y + dy)}`; }); }
  for (const [k, d] of Object.entries(byC)) o += strokeP(d, C[k], 3.2);
  if (M.wet) { // puddles + wet sheen streaks
    for (const p of L.puddles) o += wrap(p.x, p.rx, x => ell(x, p.y + 2, p.rx + 3, p.ry + 2, C.rim, ' opacity="0.35"') + ell(x, p.y, p.rx, p.ry, C.puddle, ' opacity="0.85"') +
      ell(x - p.rx * 0.25, p.y - p.ry * 0.3, p.rx * 0.38, p.ry * 0.22, C.puddleHi, ' opacity="0.85"') + ell(x + p.rx * 0.4, p.y + p.ry * 0.2, p.rx * 0.14, p.ry * 0.14, C.puddleHi, ' opacity="0.6"'));
    let st = ''; for (const [x, y, l] of [[90, 150, 120], [520, 170, 160], [880, 140, 110], [1100, 200, 90], [300, 208, 100]]) st += `M${x} ${y}h${l}`;
    o += strokeP(st, '#FFFFFF', 3, ' opacity="0.22"');
  }
  if (M.glint) for (const g of L.glints) o += wrap(g.x, g.s, x => star4(x, g.y, g.s, '#FFFFFF', 0.85));
  return svg(1200, 260, o, defs);
}

// ================= stand.svg (0 0 260 120): cake stand; top surface y = 18 across x 20–240; anchor (130,116) ============
function genStand() {
  const c = { por: '#FFF8EC', porSh: '#EFE3CF', porSh2: '#E2D2B9', ln: '#C9B79B', mint: '#A9DCCB', mintSh: '#86C2AE', hi: '#FFFFFF' };
  let o = ell(130, 115, 70, 4.5, '#5A4A3A', ' opacity="0.14"');
  // foot
  o += P('M82 116Q82 102 104 98H156Q178 102 178 116Z', c.por, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += P('M150 100H156Q174 104 175 114H150Z', c.porSh2, ' opacity="0.8"');
  o += strokeP('M88 108Q130 103 172 108', c.mint, 3);
  // stem
  o += P('M112 99Q118 76 114 56H146Q142 76 148 99Z', c.por, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += P('M135 58H143Q140 78 145 97H136Q138 78 135 58Z', c.porSh2, ' opacity="0.8"');
  o += ell(130, 74, 15, 5.5, c.mint, ` stroke="${c.mintSh}" stroke-width="2"`);
  // plate underside + rim (the plate: top ellipse cy 18, rx 110, ry 10, rim thickness to y 38)
  o += P('M18 20Q20 40 60 48Q130 60 200 48Q240 40 242 20Z', c.porSh, ` stroke="${c.ln}" stroke-width="3.5" stroke-linejoin="round"`);
  o += P('M22 24Q28 38 62 44Q130 54 198 44Q232 38 238 24Q232 32 198 36Q130 44 62 36Q28 32 22 24Z', c.porSh2, ' opacity="0.7"');
  // scalloped mint trim along the rim
  let sc = 'M24 28'; for (let k = 0; k < 12; k++) { const x0 = 24 + k * 212 / 12, x1 = x0 + 212 / 12, y = 28 + 8 * Math.sin(Math.PI * (x0 + x1 - 48) / 2 / 212); sc += `L${f(x0)} ${f(y)}Q${f((x0 + x1) / 2)} ${f(y + 7)} ${f(x1)} ${f(28 + 8 * Math.sin(Math.PI * (x1 - 24) / 212))}`; }
  o += strokeP(sc, c.mint, 3.4);
  o += ell(130, 18, 110, 10, c.por, ` stroke="${c.ln}" stroke-width="3.5"`);
  o += ell(130, 18, 92, 6.5, 'none', ` stroke="${c.porSh}" stroke-width="2.4"`);
  o += ell(68, 16, 22, 3, c.hi, ' opacity="0.9"');
  o += ell(46, 40, 9, 2.4, c.hi, ' opacity="0.7" transform="rotate(14 46 40)"');
  return svg(260, 120, o);
}

// ================= cloud_candy.svg (0 0 200 110): cotton-candy cloud, cherry sits at (100,22) =================
function genCloudCandy() {
  const c = { a: '#F6D9EA', b: '#E9C2DC', ln: '#D9AECB', hi: '#FFF3FA' };
  const puffs = [[46, 62, 30], [80, 42, 30], [120, 42, 30], [156, 62, 30], [100, 70, 34], [30, 80, 20], [172, 80, 20]];
  const d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + 'M26 76H174Q190 84 176 98H24Q10 84 26 76Z';
  const defs = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  let o = `<path d="${d}" fill="${c.ln}" transform="translate(0 2.5)"/>`;
  o += `<path d="${d}" fill="${c.b}"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${c.a}" transform="translate(-3 -7)"/></g>`;
  // the top dip where the cherry sits (surface at y 22 centre) — a soft light ellipse
  o += ell(100, 23, 22, 5, c.hi, ' opacity="0.75"');
  o += P(cp(62, 40, 7) + cp(132, 34, 5) + cp(44, 66, 4), c.hi, ' opacity="0.7"');
  return svg(200, 110, o, defs);
}
// NOTE: the middle top puffs (centres y 42, r 30) give a surface at y ≈ 12–14 between them; a dip at x 100 → y ≈ 20–22.

// ================= sun, rainbow, clouds =================
function genSun() {
  const defs = rg('glow', [[0, '#FFF7D8', 0.9], [0.45, '#FFF0C8', 0.45], [1, '#FFF0C8', 0]]) + rg('disc', [[0, '#FFFBEA'], [0.7, '#FFF0C4'], [1, '#F9E2A8']], ' cx="0.4" cy="0.38" r="0.65"');
  let o = circ(100, 100, 100, 'url(#glow)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 12, r0 = 64, r1 = i % 2 ? 80 : 90; rays += `M${f(100 + Math.cos(a) * r0)} ${f(100 + Math.sin(a) * r0)}L${f(100 + Math.cos(a) * r1)} ${f(100 + Math.sin(a) * r1)}`; }
  o += strokeP(rays, '#FFEFC2', 10, ' opacity="0.85"');
  o += circ(100, 100, 55, '#F3DDA6') + circ(100, 100, 51, 'url(#disc)');
  o += ell(84, 80, 16, 10, '#FFFEF6', ' opacity="0.85" transform="rotate(-30 84 80)"');
  return svg(200, 200, o, defs);
}
function genRainbow() {
  const bands = ['#F4B8B8', '#F7CFA6', '#F6E7A8', '#BFE3C2', '#B4D4EE', '#CDBFE6'];
  const defs = lgr('fade', [[0, '#FFFFFF', 1], [0.62, '#FFFFFF', 1], [1, '#FFFFFF', 0]], ' x1="0" y1="0" x2="0" y2="1"') + `<mask id="mk"><rect width="1200" height="600" fill="url(#fade)"/></mask>`;
  let o = '<g mask="url(#mk)" opacity="0.55">';
  const r0 = 560, bw = 22;
  bands.forEach((c, i) => { const r = r0 - i * bw - bw / 2; o += `<path d="M${f(600 - r)} 600A${f(r)} ${f(r)} 0 0 1 ${f(600 + r)} 600" fill="none" stroke="${c}" stroke-width="${bw + 0.8}"/>`; });
  const rr = r0 - 3 * bw; o += `<path d="M${f(600 - r0 - 6)} 600A${f(r0 + 6)} ${f(r0 + 6)} 0 0 1 ${f(600 + r0 + 6)} 600" fill="none" stroke="#FFFFFF" stroke-width="8" opacity="0.35"/>`;
  void rr;
  return svg(1200, 600, o + '</g>', defs);
}
function genCloud(puffs, bottom, x0, x1, CL) {
  const hb = 34, d = puffs.map(([x, y, r]) => cp(x, y, r)).join('') + `M${f(x0 + hb / 2)} ${f(bottom - hb)}H${f(x1 - hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${hb}H${f(x0 + hb / 2)}a${hb / 2} ${hb / 2} 0 0 1 0 ${-hb}Z`;
  let o = `<clipPath id="cc"><path d="${d}"/></clipPath>`;
  o += `<path d="${d}" fill="${CL.sh2}" opacity="0.94"/>`;
  o += `<g clip-path="url(#cc)"><path d="${d}" fill="${CL.sh}" transform="translate(0 -7)"/><path d="${d}" fill="${CL.base}" transform="translate(-3 -15)"/></g>`;
  return svg(320, 170, o);
}
const WHITE = { base: '#FFFFFF', sh: '#F4F1F4', sh2: '#E8E3EC' };
const RAINCL = { base: '#D3D0DF', sh: '#C3C0D3', sh2: '#ABA8C0' };
const genClouds = () => ({
  cloud_a: genCloud([[70, 110, 32], [124, 86, 44], [186, 78, 50], [242, 104, 36], [160, 116, 34]], 150, 30, 290, WHITE),
  cloud_b: genCloud([[56, 120, 24], [98, 104, 34], [150, 100, 38], [204, 106, 30], [254, 120, 22]], 146, 30, 290, WHITE),
  cloud_c: genCloud([[84, 106, 36], [142, 74, 52], [204, 88, 42], [248, 114, 28], [130, 118, 32]], 152, 40, 286, WHITE),
  cloud_rain: genCloud([[62, 112, 34], [116, 82, 46], [178, 72, 52], [238, 96, 40], [276, 118, 26], [150, 118, 36]], 152, 26, 296, RAINCL),
});

// ================= particles (0 0 32 32, centred) =================
function genParticles() {
  const p = {};
  const S = (body, defs) => svg(32, 32, body, defs);
  // tinted-by-code particles (neutral white/grey)
  p.sparkle = S(`${P('M16 1Q17.6 14.4 31 16Q17.6 17.6 16 31Q14.4 17.6 1 16Q14.4 14.4 16 1Z', '#F2F2F2')}${P('M16 7Q16.9 15.1 25 16Q16.9 16.9 16 25Q15.1 16.9 7 16Q15.1 15.1 16 7Z', '#FFFFFF')}`);
  const sp = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6.4 : 14; sp.push([16 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
  p.star = S(`<path d="${poly(sp)}" fill="#EDEDED" stroke="#EDEDED" stroke-width="3" stroke-linejoin="round"/>` + `<path d="${poly(sp.map(([x, y]) => [16 + (x - 16) * 0.55, 17 + (y - 17) * 0.55]))}" fill="#FFFFFF"/>`);
  p.puff = S(`${circ(11, 18, 8, 'url(#pf)')}${circ(19, 14, 10, 'url(#pf)')}${circ(21, 21, 7, 'url(#pf)')}`, rg('pf', [[0, '#FFFFFF', 0.95], [0.7, '#F2F2F4', 0.8], [1, '#E4E4EA', 0]]));
  p.dust = S(circ(16, 16, 9, 'url(#ds)') + circ(16, 16, 3.2, '#FFFFFF'), rg('ds', [[0, '#FFFFFF', 0.9], [0.45, '#FFFFFF', 0.4], [1, '#FFFFFF', 0]]));
  p.confetti_a = S(`<g transform="rotate(20 16 16)"><rect x="8" y="11" width="16" height="10" rx="2.5" fill="#FFFFFF"/><rect x="8" y="16.5" width="16" height="4.5" rx="2" fill="#D9D9D9"/></g>`);
  p.confetti_b = S(`${strokeP('M5 20Q9 10 13 18T21 16T27 10', '#DADADA', 4.4)}${strokeP('M5 19.4Q9 9.4 13 17.4T21 15.4T27 9.4', '#FFFFFF', 2.6)}`);
  // sugar glint: a tiny sugar crystal with a 4-point twinkle
  p.sugar = S(circ(16, 16, 11, 'url(#sg)') + `<g transform="rotate(45 16 16)"><rect x="12.5" y="12.5" width="7" height="7" rx="1.4" fill="#FFFFFF" stroke="#E6EEF5" stroke-width="1"/></g>` + star4(16, 16, 13, '#FFFFFF', 0.9) + circ(14.5, 14.5, 1.3, '#FFFFFF'),
    rg('sg', [[0, '#FFFFFF', 0.85], [0.5, '#FFF8EC', 0.3], [1, '#FFF8EC', 0]]));
  // candy wrappers (bow-tie twist) — pastel pink stripes / mint
  const wrapper = (body, ends, ln, stripe) => S(`<g transform="rotate(-18 16 16)">${P('M4 9L11 13V19L4 23Q2 16 4 9Z', ends, ` stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"`)}${P('M28 9L21 13V19L28 23Q30 16 28 9Z', ends, ` stroke="${ln}" stroke-width="1.4" stroke-linejoin="round"`)}${ell(16, 16, 6.5, 5.5, body, ` stroke="${ln}" stroke-width="1.5"`)}${stripe}${ell(14, 13.8, 2.4, 1.3, '#FFFFFF', ' opacity="0.85"')}</g>`);
  p.wrapper_a = wrapper('#F7C6D0', '#FCE3E8', '#D69AA8', strokeP('M12.5 12L15 20.5M17 11.5L19.5 20', '#FFFFFF', 1.6, ' opacity="0.9"'));
  p.wrapper_b = wrapper('#BFE5D6', '#E5F6EE', '#86BFA8', strokeP('M10.5 16H21.5', '#FFFFFF', 1.6, ' opacity="0.9"'));
  // blossom: a single pastel petal
  p.blossom = S(P('M16 3Q27 9 25 19Q23 28 16 29Q9 28 7 19Q5 9 16 3Z', '#F8CAD6', ' stroke="#E2A2B4" stroke-width="1.6"') + P('M16 8Q21 12 20 19Q19 24 16 25Q13 24 12 19Q11 12 16 8Z', '#FFE8EE') + P('M16 3Q14 7 16 10Q18 7 16 3Z', '#E2A2B4'));
  // raindrop: soft blue streak (falls downwards, head at the bottom)
  p.raindrop = S(P('M16 2Q18.6 14 19.2 22Q19.4 29 16 29Q12.6 29 12.8 22Q13.4 14 16 2Z', 'url(#rd)') + ell(14.8, 23, 1.2, 2.4, '#FFFFFF', ' opacity="0.8"'),
    lgr('rd', [[0, '#C9DCF2', 0], [0.55, '#B3CDEC', 0.7], [1, '#9CBDE6', 1]], ' x1="0" y1="0" x2="0" y2="1"'));
  // splash: a little crown of droplets on a ripple
  p.splash = S(ell(16, 25, 11, 3.4, 'none', ' stroke="#A9C6E8" stroke-width="2" opacity="0.8"') +
    P('M9 23Q7 15 5 12Q10 15 12 22ZM23 23Q25 15 27 12Q22 15 20 22ZM14.5 22Q15 14 16 9Q17 14 17.5 22Z', '#B6D0EE') +
    circ(5, 9, 1.8, '#B6D0EE') + circ(27, 9, 1.8, '#B6D0EE') + circ(16, 5.5, 2, '#C6DAF2'));
  return p;
}

// ---------------- write ----------------
function build() {
  const env = { ...genClouds(), sun: genSun(), rainbow: genRainbow(), stand: genStand(), cloud_candy: genCloudCandy() };
  for (const m of MOODS) { env['far_' + m] = genFar(m); env['mid_' + m] = genMid(m); env['ground_' + m] = genGround(m); }
  return { env, particles: genParticles() };
}
if (require.main === module) {
  const { env, particles } = build();
  const envD = path.join(A, 'env'), parD = path.join(A, 'particles');
  fs.mkdirSync(envD, { recursive: true }); fs.mkdirSync(parD, { recursive: true });
  // remove the old jungle art
  const oldEnv = ['stump', 'branch', 'vine', 'moon', ...['far', 'mid', 'ground'].flatMap(l => ['morning', 'noon', 'sunset', 'night'].map(m => `${l}_${m}`))];
  for (const old of oldEnv) { try { fs.unlinkSync(path.join(envD, old + '.svg')); } catch (e) { /* gone */ } }
  for (const old of ['leaf_a', 'leaf_b', 'petal', 'firefly', 'pollen', 'seed', 'snow']) { try { fs.unlinkSync(path.join(parD, old + '.svg')); } catch (e) { /* gone */ } }
  for (const [k, v] of Object.entries(env)) fs.writeFileSync(path.join(envD, k + '.svg'), v);
  for (const [k, v] of Object.entries(particles)) fs.writeFileSync(path.join(parD, k + '.svg'), v);
  let bad = 0;
  for (const [k, v] of [...Object.entries(env).map(([k, v]) => ['env/' + k, v]), ...Object.entries(particles).map(([k, v]) => ['particles/' + k, v])]) {
    const kb = Buffer.byteLength(v) / 1024, blur = (v.match(/feGaussianBlur/g) || []).length;
    const mm = v.match(/width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/), okBox = mm && mm[1] === mm[3] && mm[2] === mm[4];
    const forb = /<text|<script|href=|@import|font|NaN|undefined|Infinity/.test(v) || blur > 1;
    // calm-pastel check on the tileable layers: HSV saturation of every fill/stroke colour
    let satMax = 0;
    if (/^env\/(far|mid|ground)_/.test(k)) for (const c of v.match(/#[0-9A-F]{6}/gi) || []) satMax = Math.max(satMax, hsvSat(c.toUpperCase()));
    const sat = satMax > 0.45;
    if (forb || !okBox || kb > 60 || sat) bad++;
    console.log(`${k.padEnd(24)} ${kb.toFixed(1)} KB${kb > 60 ? '  TOO BIG' : ''}${forb ? '  FORBIDDEN' : ''}${okBox ? '' : '  BAD VIEWBOX'}${satMax ? `  sat≤${satMax.toFixed(2)}` : ''}${sat ? ' TOO SATURATED' : ''}`);
  }
  console.log('GROUND', JSON.stringify(GROUND), 'FARFILL', JSON.stringify(FARFILL));
  if (bad) { console.error(bad, 'file(s) failed checks'); process.exit(1); }
}
module.exports = { SKY, MOOD, GROUND, FARFILL, MOODS, pal, build };
