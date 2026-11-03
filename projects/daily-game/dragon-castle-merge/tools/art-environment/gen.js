// Ember's Glow Castle: environment art generator (4 castle places + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §3, §4.2, §4.3.
//  - levels/<zone>/sky.svg   960x540 opaque, tiles in x (drawn full screen height, drift 4 px/s).
//  - levels/<zone>/far.svg   960x540 transparent, tiles in x (drift 1.5 px/s). Dense only near the bottom, soft contrast.
//  - levels/<zone>/near.svg  960x540 transparent, static, centred, repeated left/right on wide screens.
//                            x 300–660 is empty above y 500 (only the floor); the interesting things sit in the bottom corners.
//                            Its floor profile is periodic and corner props are clear of the edges, so copies join cleanly.
//  - particles/*.svg         32x32, centred, transparent edges.
// Tileability: every edge-crossing shape is emitted again at ±960 (wrap); every profile is a sum of sines with whole
// periods over 960 px, so the first and last sample match.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960, H = 540;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.45) => mix(c, '#170f2e', t);   // outline / shade: a dark violet tone of the fill, never black
const lite = (c, t = 0.3) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const op = a => ` opacity="${a}"`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
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
const wrap = (x, rr, fn) => [-W, 0, W].map(dx => x + dx).filter(X => X + rr > 0 && X - rr < W).map(fn).join('');
const prof = (base, terms) => x => base + terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const profPath = (fy, yBottom, step = 6, x0 = 0, x1 = W) => { let d = `M${x0} ${yBottom}`; for (let x = x0; x <= x1 + 0.01; x += step) d += `L${f(x)} ${f(fy(x))}`; return d + `L${x1} ${yBottom}Z`; };
const profLine = (fy, step = 6, x0 = 0, x1 = W) => { let d = ''; for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + f(x) + ' ' + f(fy(x)); return d; };
const blob = pts => { const n = pts.length, mid = i => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2]; let [mx, my] = mid(n - 1); let d = `M${f(mx)} ${f(my)}`; for (let i = 0; i < n; i++) { const [qx, qy] = mid(i); d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(qx)} ${f(qy)}`; } return d + 'Z'; };
const roundBlob = (cx, cy, r, n, jit, R) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, q = r * (1 + (R() - 0.5) * jit); pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return blob(pts); };
const glow = (id, col, a = 0.5) => rad(id, [['0', col, a], ['0.45', col, a * 0.4], ['1', col, 0]]);
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// A small friendly ghost silhouette for lit windows: dome head, wavy hem, two dot eyes and a tiny smile.
const ghost = (x, y, s, body, face) => {
  const d = `M${f(x - 7 * s)} ${f(y + 8 * s)}L${f(x - 7 * s)} ${f(y - 1 * s)}Q${f(x - 7 * s)} ${f(y - 9 * s)} ${f(x)} ${f(y - 9 * s)}Q${f(x + 7 * s)} ${f(y - 9 * s)} ${f(x + 7 * s)} ${f(y - 1 * s)}L${f(x + 7 * s)} ${f(y + 8 * s)}`
    + `Q${f(x + 5.3 * s)} ${f(y + 5.5 * s)} ${f(x + 3.5 * s)} ${f(y + 8 * s)}Q${f(x + 1.7 * s)} ${f(y + 10.5 * s)} ${f(x)} ${f(y + 8 * s)}Q${f(x - 1.7 * s)} ${f(y + 5.5 * s)} ${f(x - 3.5 * s)} ${f(y + 8 * s)}Q${f(x - 5.3 * s)} ${f(y + 10.5 * s)} ${f(x - 7 * s)} ${f(y + 8 * s)}Z`;
  return pth(d, body) + circ(x - 2.6 * s, y - 2 * s, 1.15 * s, face) + circ(x + 2.6 * s, y - 2 * s, 1.15 * s, face)
    + stk(`M${f(x - 1.5 * s)} ${f(y + 1.2 * s)}Q${f(x)} ${f(y + 2.6 * s)} ${f(x + 1.5 * s)} ${f(y + 1.2 * s)}`, face, 0.7 * s);
};
// arched window (lit) with optional ghost
const archWin = (x, y, w, h, lit, frame, gh) => {
  const d = `M${f(x - w / 2)} ${f(y + h)}L${f(x - w / 2)} ${f(y + w / 2)}A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w / 2)} ${f(y + w / 2)}L${f(x + w / 2)} ${f(y + h)}Z`;
  return pth(d, lit, OL(frame, 2)) + (gh ? gh : '') + stk(`M${f(x)} ${f(y + 2)}L${f(x)} ${f(y + h)}`, frame, 1.6) + stk(`M${f(x - w / 2)} ${f(y + h * 0.58)}L${f(x + w / 2)} ${f(y + h * 0.58)}`, frame, 1.4);
};
// starfield in a band (wrap-safe)
const stars = (R, n, y0, y1, col, rmin, rmax, aMin = 0.35, aMax = 0.9) => { let s = ''; for (let i = 0; i < n; i++) { const x = R() * W, y = y0 + R() * (y1 - y0), r = rmin + R() * (rmax - rmin), a = aMin + R() * (aMax - aMin); s += wrap(x, r, X => circ(X, y, r, col, op(f(a)))); } return s; };

// =====================================================================================
// COURTYARD — dusky violet-pink garden evening (#5b3f8f → #e79bb8)
// =====================================================================================
function courtyard() {
  const R = rng(11);
  // ---- sky
  let defs = lin('cs', [['0', '#2f2463'], ['0.32', '#5b3f8f'], ['0.66', '#9c6fae'], ['0.88', '#cf93b4'], ['1', '#dca3bd']])
    + glow('cmoonG', '#fff1f6', 0.55) + rad('cmoon', [['0', '#fff8f2'], ['0.8', '#fbe6ef'], ['1', '#f1cfe0']], ' cx="0.42" cy="0.4"');
  let b = rect(0, 0, W, H, 'url(#cs)');
  b += stars(R, 40, 6, 170, '#fff4ff', 0.8, 1.8, 0.3, 0.75);
  for (const [x, y, r] of [[120, 50, 5], [560, 34, 4], [860, 80, 4.5]]) b += wrap(x, r, X => pth(twinkle(X, y, r), '#fff6ff', op(0.7)));
  // big soft moon (well left so it is free of the board at drift offset 0)
  b += wrap(168, 160, X => circ(X, 118, 150, 'url(#cmoonG)') + circ(X, 118, 54, 'url(#cmoon)') + circ(X - 16, 104, 9, '#efd4e2', op(0.6)) + circ(X + 18, 128, 6, '#efd4e2', op(0.55)) + circ(X + 6, 92, 4, '#efd4e2', op(0.5)));
  // soft cloud bands (periodic)
  const cloud = (cx, cy, s, col, a) => wrap(cx, 130 * s, X => `<g opacity="${a}">` + ell(X, cy, 120 * s, 18 * s, col) + circ(X - 50 * s, cy - 12 * s, 26 * s, col) + circ(X - 8 * s, cy - 22 * s, 34 * s, col) + circ(X + 42 * s, cy - 12 * s, 24 * s, col) + '</g>');
  b += cloud(300, 150, 1, '#b48ac0', 0.45) + cloud(760, 118, 0.8, '#b48ac0', 0.4) + cloud(60, 230, 1.2, '#c595c0', 0.38) + cloud(560, 262, 1.1, '#cf9bc2', 0.32);
  b += cloud(240, 125, 0.7, '#e5b9d4', 0.35) + cloud(900, 205, 0.9, '#d9aed0', 0.3);
  // pale horizon haze
  b += pth(profPath(prof(420, [[10, 2, 0.4], [6, 5, 1.3]]), H), '#e4b3c6', op(0.35));
  write('levels/courtyard/sky.svg', svg(W, H, b, defs));

  // ---- far: castle walls and towers with lit windows
  const back = '#6c4f98', backSh = '#5d4389', wall = '#4a3576', wallSh = '#3e2c66', roof = '#3a2a62', lit = '#f0c79a', litDim = '#c99a9a';
  defs = lin('cfh', [['0', '#3d2c64', 0.0], ['0.35', '#3a2a60', 0.85], ['1', '#30234f', 1]]) + glow('cwg', '#ffd8a8', 0.35);
  b = '';
  // distant ridge of towers (hazy)
  b += pth(profPath(prof(330, [[8, 1, 0.3], [5, 3, 1.1]]), H), back, op(0.75));
  const tower = (x, w, top, body, sh, rf, win, cone = true, gh = '') => {
    let s = rect(x - w / 2, top, w, H - top, body) + rect(x + w * 0.15, top, w * 0.35, H - top, sh, op(0.6));
    if (cone) s += pth(`M${f(x - w / 2 - 6)} ${f(top + 2)}L${f(x)} ${f(top - w * 1.15)}L${f(x + w / 2 + 6)} ${f(top + 2)}Z`, rf) + stk(`M${f(x)} ${f(top - w * 1.15)}L${f(x)} ${f(top - w * 1.15 - 16)}`, rf, 2) + pth(`M${f(x)} ${f(top - w * 1.15 - 16)}l12 4l-12 4Z`, mix(rf, '#c98fb6', 0.45));
    else { const n = Math.max(2, Math.round(w / 16)); for (let i = 0; i < n; i++) s += rect(x - w / 2 + i * (w / n) + 2, top - 9, w / n - 5, 10, body); }
    if (win) s += win;
    return s + gh;
  };
  const far1 = [[40, 46, 225], [250, 38, 250], [430, 52, 205], [655, 40, 240], [860, 48, 215]];
  for (const [x, w, top] of far1) b += wrap(x, w, X => tower(X, w, top, back, backSh, mix(back, '#2e2258', 0.3), circ(X, top + 40, 4, litDim, op(0.7)) + circ(X, top + 72, 4, litDim, op(0.5))));
  // main curtain wall with merlons (24 merlons per 960 => seamless)
  const WT = 372;
  b += rect(0, WT, W, H - WT, wall);
  for (let i = 0; i < 24; i++) b += rect(i * 40 + 6, WT - 14, 26, 15, wall);
  for (let i = 0; i < 12; i++) b += rect(i * 80 + 20, WT + 24, 40, 3, wallSh, op(0.6)) + rect(i * 80 + 60, WT + 52, 40, 3, wallSh, op(0.6));
  // big towers with lit windows; one friendly ghost peeking
  const big = [[150, 78, 196, true], [520, 64, 236, false], [790, 84, 180, true]];
  big.forEach(([x, w, top, cone], k) => {
    b += wrap(x, w, X => {
      let win = circ(X - 2, top + 70, 26, 'url(#cwg)') + archWin(X, top + 50, 20, 34, lit, dark(wall, 0.3));
      if (k !== 1) win += circ(X, top + 140, 22, 'url(#cwg)') + archWin(X, top + 124, 16, 26, lit, dark(wall, 0.3));
      const gh = k === 0 ? ghost(X - 0.5, top + 76, 0.95, '#fff6fb', '#6b4a7c') : '';
      return tower(X, w, top, wall, wallSh, roof, win, cone, gh);
    });
  });
  // gatehouse lit windows along wall
  for (const x of [300, 380, 660, 920]) b += wrap(x, 20, X => circ(X, WT + 40, 16, 'url(#cwg)') + archWin(X, WT + 28, 12, 20, lit, dark(wall, 0.3)));
  // soft treeline / hedge band at the bottom (dense but low contrast)
  b += pth(profPath(prof(440, [[12, 3, 0.2], [7, 7, 1.7], [4, 13, 0.4]]), H), 'url(#cfh)');
  write('levels/courtyard/far.svg', svg(W, H, b, defs));

  // ---- near: hedges + fountain (left), pumpkin patch + lamp post (right), grass floor
  defs = lin('cg', [['0', '#4f7a63'], ['0.25', '#3b5f50'], ['1', '#2a4540']]) + glow('clamp', '#ffd59a', 0.55) + glow('cpg', '#ffb25e', 0.3)
    + lin('cw', [['0', '#cdeefa'], ['1', '#8cc6e6']]);
  b = '';
  const gy = prof(506, [[2.5, 2, 0.3], [1.5, 5, 1.2]]);
  // hedge (left corner)
  const hedge = '#2f5848', hedgeL = '#3f6e59', hedgeD = '#203f35';
  b += pth('M-10 540L-10 360Q10 318 52 326Q78 290 122 304Q160 286 196 316Q236 316 248 360Q268 392 262 430L262 540Z', hedge, OL(hedgeD, 3));
  b += pth('M10 360Q30 336 60 344Q86 316 120 326Q150 312 178 334', 'none', OL(hedgeL, 6) + op(0.8));
  for (const [x, y] of [[60, 380], [140, 360], [210, 400], [100, 440], [40, 470]]) b += circ(x, y, 3, hedgeL, op(0.7)) + circ(x + 9, y + 6, 2.5, hedgeL, op(0.6));
  // little flowers in the hedge (muted lavender, not pink)
  for (const [x, y] of [[80, 352], [170, 344], [228, 382], [30, 420]]) { for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; b += circ(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, '#c6b4ea'); } b += circ(x, y, 2.2, '#f6e3a8'); }
  // fountain (stone lavender) in front of the hedge
  const st = '#8f86b3', stL = '#aaa2cc', stD = dark(st, 0.5);
  b += ell(150, 508, 112, 16, '#3b4a63', op(0.5));
  b += pth('M44 470L56 506Q150 524 244 506L256 470Z', st, OL(stD)) + ell(150, 470, 106, 14, stL, OL(stD)) + ell(150, 471, 92, 9, 'url(#cw)');
  b += rect(138, 410, 24, 60, st, OL(stD)) + rect(143, 414, 6, 52, stL, op(0.6));
  b += pth('M96 404Q150 432 204 404Z', st, OL(stD)) + ell(150, 404, 56, 9, stL, OL(stD)) + ell(150, 405, 46, 5, 'url(#cw)');
  b += rect(145, 372, 10, 30, st, OL(stD)) + circ(150, 368, 9, stL, OL(stD));
  // water arcs + droplets
  for (const s of [-1, 1]) {
    b += stk(`M150 360Q${150 + s * 36} 336 ${150 + s * 52} 404`, '#d8f3ff', 3, op(0.85));
    b += stk(`M150 404Q${150 + s * 60} 386 ${150 + s * 84} 468`, '#d8f3ff', 3, op(0.75));
  }
  b += circ(150, 352, 5, '#e9f9ff', op(0.9)) + circ(120, 460, 2.5, '#e9f9ff') + circ(184, 462, 2, '#e9f9ff') + circ(104, 398, 2, '#e9f9ff');
  // lamp post (right) with warm glow
  b += circ(888, 286, 90, 'url(#clamp)');
  b += rect(883, 300, 10, 210, '#2f2a4a', OL('#1c1830', 2)) + rect(874, 496, 28, 10, '#2f2a4a', OL('#1c1830', 2));
  b += pth('M868 300L908 300L900 270L876 270Z', '#ffe1a8', OL('#4a3a52', 3)) + pth('M864 270L912 270L888 252Z', '#2f2a4a', OL('#1c1830', 2.5)) + circ(888, 248, 3, '#2f2a4a');
  b += ell(888, 286, 6, 9, '#fff6da');
  // pumpkin patch (sleepy faces, curly vines)
  const pk = '#de8a45', pkL = '#f0a868', pkD = dark(pk, 0.5);
  b += stk('M690 506Q720 480 760 498Q800 512 830 492Q870 470 940 500', '#3b6a48', 4);
  b += stk('M742 492q-10 -16 4 -22q12 -2 6 10', '#3b6a48', 2.5) + stk('M858 482q8 -18 -6 -20q-10 2 -2 10', '#3b6a48', 2.5);
  const leafL = (x, y, r, a) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${a})">${pth(`M0 0Q${f(r)} ${f(-r * 0.9)} ${f(r * 2)} 0Q${f(r)} ${f(r * 0.9)} 0 0Z`, '#3f7652', OL('#244a37', 2))}</g>`;
  b += leafL(700, 500, 13, -30) + leafL(806, 500, 12, -150) + leafL(930, 492, 12, -110) + leafL(770, 480, 10, -60);
  const pumpkin = (x, y, r) => {
    let s = circ(x, y, r * 1.6, 'url(#cpg)') + ell(x, y + r * 0.95, r * 1.05, r * 0.2, '#22392f', op(0.5));
    s += ell(x - r * 0.45, y, r * 0.62, r * 0.88, pk, OL(pkD)) + ell(x + r * 0.45, y, r * 0.62, r * 0.88, pk, OL(pkD)) + ell(x, y, r * 0.6, r * 0.92, pkL, OL(pkD));
    s += pth(`M${f(x - 3)} ${f(y - r * 0.85)}q2 -${f(r * 0.4)} 8 -${f(r * 0.45)}`, 'none', OL('#4b6b3c', 4));
    s += stk(`M${f(x - r * 0.38)} ${f(y - r * 0.05)}q${f(r * 0.13)} ${f(r * 0.12)} ${f(r * 0.26)} 0`, pkD, 2.2) + stk(`M${f(x + r * 0.12)} ${f(y - r * 0.05)}q${f(r * 0.13)} ${f(r * 0.12)} ${f(r * 0.26)} 0`, pkD, 2.2);
    s += stk(`M${f(x - r * 0.12)} ${f(y + r * 0.32)}q${f(r * 0.12)} ${f(r * 0.1)} ${f(r * 0.24)} 0`, pkD, 2) + circ(x - r * 0.5, y + r * 0.2, r * 0.09, '#f2918a', op(0.6)) + circ(x + r * 0.5, y + r * 0.2, r * 0.09, '#f2918a', op(0.6));
    return s;
  };
  b += pumpkin(780, 470, 36) + pumpkin(714, 488, 20) + pumpkin(846, 484, 24);
  // sleep bubble from the big pumpkin (no text)
  b += circ(812, 428, 4, '#e8f4ff', op(0.55)) + circ(824, 414, 6.5, '#e8f4ff', op(0.45)) + circ(840, 394, 10, '#e8f4ff', op(0.35));
  // grass floor across the whole width (periodic) + tufts outside the board band
  b += pth(profPath(gy, H), 'url(#cg)') + stk(profLine(gy), '#5f8d70', 3);
  for (let i = 0; i < 26; i++) { const x = 8 + i * 37 + R() * 10; if (x > 290 && x < 670) continue; const y = gy(x) + 2; b += stk(`M${f(x - 5)} ${f(y)}l2 -9M${f(x)} ${f(y)}l0 -12M${f(x + 5)} ${f(y)}l-2 -8`, '#5f8d70', 2); }
  for (let i = 0; i < 12; i++) { const x = R() * W, y = 518 + R() * 18; b += wrap(x, 4, X => circ(X, y, 1.8, '#6d9b7e', op(0.6))); }
  write('levels/courtyard/near.svg', svg(W, H, b, defs));
}

// =====================================================================================
// CELLAR — deep blue cave with glowing crystal veins (#13284f → #3fb6d9)
// =====================================================================================
function cellar() {
  const R = rng(23);
  let defs = lin('ks', [['0', '#0b1a3a'], ['0.5', '#13284f'], ['1', '#1a3561']]) + glow('kcg', '#4fc6e6', 0.35);
  let b = rect(0, 0, W, H, 'url(#ks)');
  // stone blocks (subtle), rows of offset rounded rectangles; 8 per row => 120 px blocks, seamless
  for (let r = 0; r < 9; r++) {
    const y = r * 62 + 4, off = (r % 2) * 60;
    for (let i = -1; i < 9; i++) { const x = i * 120 + off + 3, w = 114, sh = R() * 0.06 + 0.04; b += wrap(x + w / 2, w / 2, X => rect(X - w / 2, y, w, 56, '#2a4a7c', ` rx="14"` + op(f(sh)))); }
  }
  // glowing crystal veins (periodic wiggles drawn as polylines with glow)
  const vein = (pts) => { const d = 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L'); return stk(d, '#3fb6d9', 9, op(0.08)) + stk(d, '#56c8e6', 2.4, op(0.55)); };
  const veins = [];
  for (let k = 0; k < 7; k++) { let x = R() * W, y = 30 + R() * 420; const pts = [[x, y]]; for (let i = 0; i < 6; i++) { x += 20 + R() * 30; y += (R() - 0.5) * 40; pts.push([x, y]); } veins.push(pts); }
  for (const pts of veins) for (const dx of [-W, 0, W]) { const p = pts.map(([x, y]) => [x + dx, y]); if (p[p.length - 1][0] > 0 && p[0][0] < W) b += vein(p); }
  // little crystal nodes on the veins
  for (const pts of veins) { const [x, y] = pts[3]; b += wrap(x, 30, X => circ(X, y, 26, 'url(#kcg)') + pth(`M${f(X)} ${f(y - 9)}L${f(X + 5)} ${f(y)}L${f(X)} ${f(y + 9)}L${f(X - 5)} ${f(y)}Z`, '#8fe3f2', op(0.8))); }
  b += stars(R, 30, 10, 520, '#7fd9ef', 0.8, 1.6, 0.25, 0.6);
  write('levels/cellar/sky.svg', svg(W, H, b, defs));

  // ---- far: stalactites + crystal clusters + rock mounds
  defs = lin('kfr', [['0', '#16305c'], ['1', '#112650']]) + lin('kfm', [['0', '#1b3766', 0.0], ['0.3', '#183262', 0.9], ['1', '#122852']]) + glow('kfg', '#3fb6d9', 0.28);
  b = '';
  const ceil = prof(26, [[10, 2, 0.5], [6, 5, 1.9], [3, 11, 0.3]]);
  b += pth(`M0 0` + profLine(ceil).replace('M', 'L') + `L${W} 0Z`, '#13294f');
  for (let i = 0; i < 20; i++) {
    const x = i * 48 + R() * 20, len = 40 + R() * (i % 3 === 0 ? 110 : 60), w = 12 + R() * 14, y0 = ceil(x) - 4;
    b += wrap(x, w, X => pth(`M${f(X - w)} ${f(y0)}Q${f(X - w * 0.35)} ${f(y0 + len * 0.6)} ${f(X)} ${f(y0 + len)}Q${f(X + w * 0.35)} ${f(y0 + len * 0.6)} ${f(X + w)} ${f(y0)}Z`, '#1c3a68') + pth(`M${f(X - w * 0.5)} ${f(y0)}Q${f(X - w * 0.2)} ${f(y0 + len * 0.5)} ${f(X - 1)} ${f(y0 + len * 0.9)}`, 'none', OL('#2a5185', 2) + op(0.6)) + circ(X, y0 + len + 5, 2, '#8fdcf0', op(0.5)));
  }
  // rock mounds at the bottom
  b += pth(profPath(prof(430, [[18, 2, 1.0], [10, 5, 0.2], [5, 9, 2.1]]), H), 'url(#kfm)');
  // crystal clusters (hazy, low contrast)
  const cryst = (x, y, s, col) => { let g = circ(x, y - 30 * s, 70 * s, 'url(#kfg)'); for (const [dx, h, w, a] of [[-18, 50, 12, -18], [0, 78, 15, 0], [17, 58, 12, 16], [-34, 30, 9, -32], [32, 34, 9, 30]]) { g += `<g transform="translate(${f(x + dx * s)} ${f(y)}) rotate(${a})">` + pth(`M${f(-w * s)} 0L${f(-w * s)} ${f(-h * s * 0.75)}L0 ${f(-h * s)}L${f(w * s)} ${f(-h * s * 0.75)}L${f(w * s)} 0Z`, col) + pth(`M0 0L0 ${f(-h * s)}L${f(w * s)} ${f(-h * s * 0.75)}L${f(w * s)} 0Z`, mix(col, '#0e1f44', 0.35)) + '</g>'; } return g; };
  for (const [x, y, s] of [[90, 470, 0.9], [330, 455, 0.7], [600, 475, 1.0], [820, 450, 0.75]]) b += wrap(x, 80 * s, X => cryst(X, y, s, '#2a7aa6'));
  b += pth(profPath(prof(490, [[8, 3, 0.4], [5, 7, 1.3]]), H), '#102349', op(0.85));
  write('levels/cellar/far.svg', svg(W, H, b, defs));

  // ---- near: barrels + mushrooms (left), crystals + crate (right), stone floor
  defs = lin('kfl', [['0', '#3a4f78'], ['0.2', '#2c3e64'], ['1', '#1e2c4c']]) + glow('kmg', '#6fe0e6', 0.45) + glow('kcg2', '#4fc6e6', 0.45)
    + lin('kwd', [['0', '#7a5d52'], ['1', '#5b4442']], 0, 0, 1, 0) + lin('kcr', [['0', '#a8ecf7'], ['0.5', '#4fc0de'], ['1', '#2e8db5']], 0, 0, 1, 0);
  b = '';
  const wood = '#6f574f', woodD = '#3a2c35', band = '#46506e';
  // barrels: one lying, one standing, small keg on top
  const barrelUp = (x, y, w, h) => pth(`M${f(x - w / 2)} ${f(y)}Q${f(x - w / 2 - 8)} ${f(y + h / 2)} ${f(x - w / 2)} ${f(y + h)}L${f(x + w / 2)} ${f(y + h)}Q${f(x + w / 2 + 8)} ${f(y + h / 2)} ${f(x + w / 2)} ${f(y)}Z`, 'url(#kwd)', OL(woodD))
    + ell(x, y, w / 2, 7, mix(wood, '#ffffff', 0.12), OL(woodD, 2.5)) + stk(`M${f(x - w / 2 - 4)} ${f(y + h * 0.25)}Q${f(x)} ${f(y + h * 0.25 + 8)} ${f(x + w / 2 + 4)} ${f(y + h * 0.25)}`, band, 5) + stk(`M${f(x - w / 2 - 4)} ${f(y + h * 0.75)}Q${f(x)} ${f(y + h * 0.75 + 8)} ${f(x + w / 2 + 4)} ${f(y + h * 0.75)}`, band, 5)
    + stk(`M${f(x - w * 0.15)} ${f(y + 8)}L${f(x - w * 0.17)} ${f(y + h - 4)}M${f(x + w * 0.18)} ${f(y + 8)}L${f(x + w * 0.2)} ${f(y + h - 4)}`, woodD, 1.5, op(0.5));
  b += `<g transform="rotate(-12 124 356)">` + ghost(124, 356, 2.6, '#eef0ff', '#4a4f86') + '</g>' + circ(110, 362, 4, '#f2a0c0', op(0.5));
  b += barrelUp(70, 402, 84, 104) + barrelUp(76, 352, 56, 52);
  b += stk('M42 418Q38 454 42 492', '#9a7e70', 4, op(0.5)) + stk('M56 362Q53 380 56 398', '#9a7e70', 3, op(0.5)) + stk('M136 446L216 446', '#9a7e70', 3, op(0.45));
  // lying barrel
  b += pth('M128 438L224 438Q236 472 224 506L128 506Q116 472 128 438Z', 'url(#kwd)', OL(woodD)) + ell(226, 472, 14, 34, '#6c5450', OL(woodD, 2.5)) + ell(226, 472, 6, 14, woodD, op(0.5));
  b += stk('M150 436Q140 472 150 508M200 436Q190 472 200 508', band, 5);
  // glowing mushrooms
  const mush = (x, y, r, cap) => circ(x, y - r, r * 2.6, 'url(#kmg)') + rect(x - r * 0.28, y - r * 0.9, r * 0.56, r * 0.9, '#e8e2f2', OL('#7a7096', 2)) + pth(`M${f(x - r)} ${f(y - r * 0.8)}Q${f(x - r)} ${f(y - r * 1.9)} ${f(x)} ${f(y - r * 1.9)}Q${f(x + r)} ${f(y - r * 1.9)} ${f(x + r)} ${f(y - r * 0.8)}Z`, cap, OL(dark(cap, 0.5), 2.5))
    + circ(x - r * 0.4, y - r * 1.35, r * 0.15, '#e6fbff') + circ(x + r * 0.3, y - r * 1.5, r * 0.12, '#e6fbff') + circ(x + r * 0.55, y - r * 1.08, r * 0.1, '#e6fbff');
  b += mush(254, 508, 16, '#56cbd2') + mush(238, 510, 10, '#6ab5e8') + mush(30, 510, 12, '#56cbd2');
  // crystal cluster (right corner)
  const bigCryst = (x, y, s) => { let g = circ(x, y - 50 * s, 110 * s, 'url(#kcg2)'); for (const [dx, h, w, a] of [[-40, 70, 16, -24], [-14, 120, 22, -6], [20, 96, 19, 12], [48, 60, 14, 30], [-62, 40, 11, -40]]) { g += `<g transform="translate(${f(x + dx * s)} ${f(y)}) rotate(${a})">` + pth(`M${f(-w * s)} 0L${f(-w * s)} ${f(-h * s * 0.72)}L0 ${f(-h * s)}L${f(w * s)} ${f(-h * s * 0.72)}L${f(w * s)} 0Z`, 'url(#kcr)', OL('#1d527c', 3)) + pth(`M${f(-w * s * 0.45)} ${f(-6 * s)}L${f(-w * s * 0.45)} ${f(-h * s * 0.7)}`, 'none', OL('#e6fbff', 3) + op(0.7)) + '</g>'; } return g; };
  b += bigCryst(850, 508, 1.15);
  // crate with a small lantern
  b += rect(700, 448, 66, 60, '#62504c', OL(woodD)) + stk('M700 478L766 478M704 452L762 504', woodD, 3, op(0.6));
  b += circ(733, 430, 34, 'url(#kmg)') + rect(722, 418, 22, 30, '#cfefff', OL('#2c3a5c', 2.5) + op(0.9)) + rect(720, 412, 26, 7, '#3e4a6c', OL('#2c3a5c', 2)) + ell(733, 434, 5, 7, '#7be3ee');
  b += mush(930, 510, 13, '#6ab5e8') + mush(686, 510, 9, '#56cbd2');
  // stone floor
  const fy = prof(506, [[2, 2, 0.6], [1.2, 6, 0.2]]);
  b += pth(profPath(fy, H), 'url(#kfl)') + stk(profLine(fy), '#4c638f', 3);
  for (let i = 0; i < 12; i++) b += stk(`M${i * 80 + 30} ${f(fy(i * 80 + 30) + 2)}L${i * 80 + 26} 522M${i * 80 + 68} 522L${i * 80 + 64} 540`, '#1a2644', 2, op(0.7));
  b += stk('M0 522L960 522', '#1a2644', 2, op(0.6));
  write('levels/cellar/near.svg', svg(W, H, b, defs));
}

// =====================================================================================
// LIBRARY — dark blue wall, very tall arched moon windows; warm lamp light only at the sides (#1d2350 → #d8b46a)
// =====================================================================================
function library() {
  const R = rng(37);
  let defs = lin('ls', [['0', '#151a40'], ['0.6', '#1d2350'], ['1', '#252b5c']]) + lin('lg', [['0', '#1f2c64'], ['0.6', '#2f4482'], ['1', '#3d5596']])
    + glow('lmoon', '#e6ecff', 0.6) + lin('lshaft', [['0', '#c8d6ff', 0.14], ['1', '#c8d6ff', 0]]);
  let b = rect(0, 0, W, H, 'url(#ls)');
  // vertical wall panel lines (period 60 => 16 per tile)
  for (let i = 0; i < 16; i++) b += rect(i * 60 + 28, 0, 3, H, '#2a3166', op(0.35));
  // two tall arched windows per tile at x 240 and 720
  const win = (x, moon) => {
    const w = 132, top = 46, bot = 470;
    const outer = `M${x - w / 2 - 14} ${bot + 10}L${x - w / 2 - 14} ${top + w / 2}A${w / 2 + 14} ${w / 2 + 14} 0 0 1 ${x + w / 2 + 14} ${top + w / 2}L${x + w / 2 + 14} ${bot + 10}Z`;
    const inner = `M${x - w / 2} ${bot}L${x - w / 2} ${top + w / 2 + 6}A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${top + w / 2 + 6}L${x + w / 2} ${bot}Z`;
    const id = 'lw' + x;
    let s = `<clipPath id="${id}"><path d="${inner}"/></clipPath>`;
    s += pth(outer, '#2b3170') + pth(inner, 'url(#lg)');
    s += `<g clip-path="url(#${id})">`;
    for (let i = 0; i < 12; i++) s += circ(x - w / 2 + R() * w, top + 20 + R() * 300, 0.8 + R() * 1.1, '#eef2ff', op(f(0.4 + R() * 0.5)));
    if (moon) s += circ(x + 22, 150, 70, 'url(#lmoon)') + circ(x + 22, 150, 26, '#eef1ff') + circ(x + 14, 144, 5, '#d4dbf5') + circ(x + 30, 160, 3.5, '#d4dbf5');
    // distant rooftops through the glass
    s += pth(`M${x - w / 2} ${bot}L${x - w / 2} 420L${x - 30} 410L${x - 20} 380L${x - 10} 410L${x + 30} 400L${x + w / 2} 430L${x + w / 2} ${bot}Z`, '#1b2558', op(0.8));
    s += '</g>';
    // mullions
    s += stk(`M${x} ${top + 6}L${x} ${bot}`, '#20265a', 5);
    for (const yy of [180, 280, 380]) s += stk(`M${x - w / 2} ${yy}L${x + w / 2} ${yy}`, '#20265a', 4);
    s += stk(`M${x - w / 2} ${top + w / 2 + 6}A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${top + w / 2 + 6}`, '#20265a', 4);
    s += rect(x - w / 2 - 20, bot + 6, w + 40, 14, '#30377a') + rect(x - w / 2 - 20, bot + 6, w + 40, 3, '#3d4590');
    if (!moon) s += ghost(x - 34, bot - 14, 1.6, '#c9d2f4', '#3a4278') + rect(x - 44, bot - 8, 20, 8, '#8a6a8a', ' rx="1.5"') + rect(x - 44, bot - 8, 20, 2, '#d8c8a8', op(0.7));
    // moonlight shaft onto the floor (very soft)
    s += pth(`M${x - w / 2} ${top + 60}L${x + w / 2} ${top + 60}L${x + w / 2 + 120} ${H}L${x - w / 2 + 60} ${H}Z`, 'url(#lshaft)');
    return s;
  };
  b += win(240, false) + win(720, true);
  write('levels/library/sky.svg', svg(W, H, b, defs));

  // ---- far: tall bookshelves and ladders
  defs = lin('lbf', [['0', '#2a2352'], ['1', '#221c46']]) + lin('lfh', [['0', '#1c1840', 0], ['0.4', '#1c1840', 0.9], ['1', '#171436', 1]]);
  b = '';
  const bookCols = ['#7a4a6a', '#4a6a8a', '#6a7a4a', '#8a6a4a', '#5a4a8a', '#7a5a5a', '#4a7a7a'].map(c => mix(c, '#241e4a', 0.6));
  const shelf = (x, w, top) => {
    let s = rect(x - w / 2, top, w, H - top, 'url(#lbf)') + rect(x - w / 2 - 8, top - 14, w + 16, 16, '#30295c') + rect(x - w / 2 - 4, top - 22, w + 8, 9, '#2a2352');
    s += rect(x - w / 2, top, 7, H - top, '#30295c') + rect(x + w / 2 - 7, top, 7, H - top, '#1d1840');
    for (let y = top + 10; y < H - 20; y += 58) {
      let bx = x - w / 2 + 10; const by = y + 48;
      while (bx < x + w / 2 - 14) {
        const bw = 7 + R() * 9, bh = 30 + R() * 16, c = bookCols[Math.floor(R() * bookCols.length)];
        if (bx + bw > x + w / 2 - 9) break;
        if (R() < 0.12) { s += pth(`M${f(bx)} ${f(by)}L${f(bx + bh * 0.3)} ${f(by - bh)}L${f(bx + bh * 0.3 + bw)} ${f(by - bh + 2)}L${f(bx + bw)} ${f(by)}Z`, c); bx += bw + bh * 0.3 + 2; continue; }
        s += rect(bx, by - bh, bw, bh, c) + rect(bx, by - bh + 5, bw, 2, mix(c, '#d8c8a0', 0.25), op(0.5));
        bx += bw + 1 + (R() < 0.1 ? 10 : 0);
      }
      s += rect(x - w / 2, by, w, 7, '#352d66');
    }
    return s;
  };
  for (const [x, w, top] of [[20, 230, 70], [480, 250, 50]]) b += wrap(x, w / 2 + 10, X => shelf(X, w, top));
  // ladders leaning on the shelves
  const ladder = (x0, y0, x1, y1) => { let s = stk(`M${x0} ${y0}L${x1} ${y1}M${x0 + 30} ${y0}L${x1 + 30} ${y1}`, '#3a3058', 5); for (let t = 0.08; t < 1; t += 0.085) s += stk(`M${f(x0 + (x1 - x0) * t)} ${f(y0 + (y1 - y0) * t)}l30 0`, '#3a3058', 3.5); return s; };
  b += wrap(560, 120, X => ladder(X + 70, 540, X - 10, 120));
  b += wrap(-40, 120, X => ladder(X + 90, 540, X + 40, 200));
  // little reading balcony rail between shelves (whole width, soft)
  b += pth(profPath(() => 455, H), 'url(#lfh)');
  for (let i = 0; i < 48; i++) b += rect(i * 20 + 8, 462, 5, 50, '#2c2658', op(0.6));
  b += rect(0, 456, W, 8, '#2f285e', op(0.9));
  write('levels/library/far.svg', svg(W, H, b, defs));

  // ---- near: armchair + lamp (left), globe + books + candle (right), rug, wooden floor
  defs = lin('lfl', [['0', '#4a3446'], ['0.2', '#3b2a3c'], ['1', '#2a1f30']]) + glow('llamp', '#ffd690', 0.42) + glow('lcand', '#ffcf80', 0.45)
    + lin('lchair', [['0', '#8a4766'], ['1', '#6a3354']]) + rad('lglobe', [['0', '#7ab3cf'], ['1', '#3f6d96']], ' cx="0.38" cy="0.35"');
  b = '';
  // warm lamp glow (sides only)
  b += circ(196, 330, 104, 'url(#llamp)') + circ(240, 318, 58, 'url(#llamp)');
  // floor lamp
  b += rect(237, 340, 6, 168, '#5b4a3c', OL('#2e2430', 2)) + ell(240, 508, 22, 6, '#5b4a3c', OL('#2e2430', 2));
  b += pth('M206 340L274 340L260 296L220 296Z', '#e7c47e', OL('#7a5838', 3)) + pth('M214 334L266 334', 'none', OL('#f6dda6', 3));
  // armchair
  const cD = '#3e1f36';
  b += pth('M40 500L40 380Q40 338 84 336L156 336Q198 338 198 380L198 500Z', 'url(#lchair)', OL(cD, 3));
  b += pth('M70 380Q120 360 170 380', 'none', OL('#a35a7c', 4) + op(0.6));
  for (const x of [80, 119, 158]) b += circ(x, 372, 3, '#4e2742');
  b += pth('M30 430Q30 410 50 410L60 410L60 500L30 500Z', '#7a3d5e', OL(cD, 3)) + pth('M178 410L190 410Q210 410 210 430L210 500L178 500Z', '#7a3d5e', OL(cD, 3));
  b += pth('M56 440L184 440Q192 450 184 462L56 462Q48 450 56 440Z', '#9a5274', OL(cD, 3));
  b += rect(44, 496, 10, 12, '#3a2a30') + rect(186, 496, 10, 12, '#3a2a30');
  // a knitted blanket over the arm (teal, cosy)
  b += pth('M178 410L210 412L214 470L196 466L184 474Z', '#4f8a8a', OL('#2c5254', 2.5)) + stk('M186 430L208 432M186 446L210 448', '#6aa8a4', 2);
  // book stack by the chair
  const book = (x, y, w, h, c) => rect(x, y, w, h, c, OL(dark(c, 0.5), 2.5) + ' rx="2"') + rect(x + w - 8, y + 2, 5, h - 4, '#efe2c2', op(0.85));
  b += book(4, 486, 34, 12, '#5a6fa0') + book(8, 474, 28, 12, '#a0705a') + book(2, 462, 32, 12, '#6a8f6a');
  // right: globe on stand
  b += circ(840, 400, 120, 'url(#lcand)', op(0.7));
  b += stk('M840 506L840 452M816 506L864 506', '#6b4e3a', 6) + pth('M800 420A44 44 0 0 0 880 420', 'none', OL('#8a6a44', 4));
  b += circ(840, 410, 38, 'url(#lglobe)', OL('#2c4a6e', 3));
  b += pth('M818 392q10 -8 20 0q6 10 -4 16q-12 4 -16 -16Z', '#6e9a72', op(0.9)) + pth('M846 414q12 -4 16 6q-2 12 -12 10q-8 -6 -4 -16Z', '#6e9a72', op(0.9)) + circ(828, 398, 7, '#d6eeff', op(0.35));
  // stacked books + candle
  b += book(700, 486, 64, 18, '#7a5a8a') + book(706, 466, 54, 20, '#4a7a8a') + book(698, 448, 60, 18, '#9a6a4a');
  b += circ(728, 420, 70, 'url(#lcand)') + rect(721, 418, 14, 30, '#f2e6cc', OL('#a8946a', 2)) + ell(728, 448, 14, 3, '#c9b48a') + pth('M728 400Q736 410 728 418Q720 410 728 400Z', '#ffcf7a') + ell(728, 412, 2, 4, '#fff6da');
  b += book(902, 488, 48, 16, '#5a6fa0') + book(908, 472, 40, 16, '#8a5a6a');
  // wooden floor + rug in the middle (low)
  const fy = prof(506, [[1.5, 2, 0.4]]);
  b += pth(profPath(fy, H), 'url(#lfl)') + stk(profLine(fy), '#6a4d58', 3);
  for (let i = 0; i < 16; i++) b += stk(`M${i * 60 + 20} 512L${i * 60 + 20} 540`, '#22182a', 2, op(0.5));
  b += pth('M250 512L710 512L730 540L230 540Z', '#4a2a4e') + pth('M262 516L698 516L712 538L248 538Z', 'none', OL('#9a7c56', 2) + op(0.7));
  write('levels/library/near.svg', svg(W, H, b, defs));
}

// =====================================================================================
// TOWER — deep starry night with a milky way (#0b1030 → #6f7fe0)
// =====================================================================================
function tower() {
  const R = rng(53);
  let defs = lin('ts', [['0', '#080c26'], ['0.4', '#0f1640'], ['0.8', '#24307a'], ['1', '#4a58b8']]) + rad('tmw', [['0', '#b8b4ff', 0.22], ['1', '#b8b4ff', 0]]) + rad('tmw2', [['0', '#ffd8f0', 0.12], ['1', '#ffd8f0', 0]]);
  let b = rect(0, 0, W, H, 'url(#ts)');
  // milky way: soft blobs along a periodic sine band
  const my = x => 170 + 70 * Math.sin(2 * Math.PI * x / W + 0.6);
  for (let i = 0; i < 40; i++) { const x = i * 24 + R() * 10, y = my(x) + (R() - 0.5) * 30, rx = 60 + R() * 40, ry = 30 + R() * 22; b += wrap(x, rx, X => ell(X, y, rx, ry, i % 3 ? 'url(#tmw)' : 'url(#tmw2)')); }
  for (let i = 0; i < 140; i++) { const x = R() * W, y = my(x) + (R() - 0.5) * 90, r = 0.5 + R() * 1.0; b += wrap(x, r, X => circ(X, y, r, '#e8e8ff', op(f(0.3 + R() * 0.5)))); }
  b += stars(R, 90, 4, 420, '#f2f2ff', 0.7, 1.9, 0.35, 0.95);
  for (const [x, y, r] of [[70, 60, 7], [300, 290, 5], [520, 46, 6], [700, 330, 5], [880, 120, 7], [420, 150, 4]]) b += wrap(x, r, X => circ(X, y, r * 2, '#cfd6ff', op(0.12)) + pth(twinkle(X, y, r), '#f4f4ff', op(0.85)));
  // a small ringed planet (cute, far from the moon light's look)
  b += wrap(840, 40, X => circ(X, 250, 16, '#9a8ed8') + circ(X - 5, 245, 6, '#b3a8ea', op(0.6)) + ell(X, 252, 30, 7, 'none', OL('#c9c0f4', 2.5) + ` transform="rotate(-14 ${X} 252)"` + op(0.8)));
  // horizon haze
  b += pth(profPath(prof(450, [[8, 2, 0.1], [5, 5, 1.0]]), H), '#5a68c8', op(0.25));
  write('levels/tower/sky.svg', svg(W, H, b, defs));

  // ---- far: battlements and roofs of lower towers
  defs = glow('twg', '#ffd8a8', 0.32) + lin('tfh', [['0', '#1a2058', 0], ['0.3', '#1a2058', 0.9], ['1', '#141a48', 1]]);
  b = '';
  const roofC = '#2e3584', roofD = '#262c70', wallC = '#232a6c', wallD = '#1d2360', lit = '#f1cf98';
  const roofTower = (x, w, top, flag, gh) => {
    let s = rect(x - w / 2, top, w, H - top, wallC) + rect(x + w * 0.12, top, w * 0.38, H - top, wallD);
    const ch = w * 1.05;
    s += pth(`M${f(x - w / 2 - 10)} ${f(top + 4)}Q${f(x - w * 0.2)} ${f(top - ch * 0.4)} ${f(x)} ${f(top - ch)}Q${f(x + w * 0.2)} ${f(top - ch * 0.4)} ${f(x + w / 2 + 10)} ${f(top + 4)}Z`, roofC);
    s += pth(`M${f(x)} ${f(top - ch)}Q${f(x + w * 0.2)} ${f(top - ch * 0.4)} ${f(x + w / 2 + 10)} ${f(top + 4)}L${f(x + 6)} ${f(top + 4)}Z`, roofD);
    for (let k = 1; k < 4; k++) s += stk(`M${f(x - w / 2 - 10 + k * 4)} ${f(top + 4 - k * ch * 0.18)}Q${f(x)} ${f(top + 10 - k * ch * 0.18)} ${f(x + w / 2 + 10 - k * 4)} ${f(top + 4 - k * ch * 0.18)}`, '#3a42a0', 1.5, op(0.5));
    s += stk(`M${f(x)} ${f(top - ch)}L${f(x)} ${f(top - ch - 20)}`, '#3a42a0', 2);
    if (flag) s += pth(`M${f(x)} ${f(top - ch - 20)}q10 -3 18 2q-8 5 -18 6Z`, flag);
    s += circ(x, top + 40, 24, 'url(#twg)') + archWin(x, top + 26, 16, 28, lit, '#151a4a', gh ? ghost(x, top + 46, 0.75, '#f6f2ff', '#4a4a7a') : '');
    return s;
  };
  // battlement wall across (seamless: 24 merlons)
  const BT = 410;
  for (const [x, w, top, flag, gh] of [[90, 64, 290, '#7a6ac8', false], [330, 52, 330, null, false], [600, 70, 270, '#4f9aa8', true], [820, 56, 315, '#9a72c0', false]]) b += wrap(x, w / 2 + 12, X => roofTower(X, w, top, flag, gh));
  b += rect(0, BT, W, H - BT, wallC);
  for (let i = 0; i < 24; i++) b += rect(i * 40 + 6, BT - 16, 26, 17, wallC);
  for (let i = 0; i < 12; i++) b += rect(i * 80 + 30, BT + 30, 40, 3, wallD, op(0.7));
  for (const x of [200, 470, 720, 900]) b += wrap(x, 20, X => circ(X, BT + 54, 16, 'url(#twg)') + archWin(X, BT + 42, 11, 20, lit, '#151a4a'));
  b += pth(profPath(prof(470, [[6, 3, 0.4], [4, 8, 1.1]]), H), 'url(#tfh)');
  write('levels/tower/far.svg', svg(W, H, b, defs));

  // ---- near: stone parapet (merlons only at the sides), telescope (left), banners + lantern + star charts (right)
  defs = lin('tst', [['0', '#5a5f9e'], ['1', '#3d4280']]) + glow('tlg', '#ffd8a0', 0.5);
  b = '';
  const stone = 'url(#tst)', stD = '#262a5c', stL = '#7479b8';
  // banners on poles at the far sides (hang down from the top)
  const banner = (x, col, emb) => stk(`M${x} 0L${x} 360`, '#4a4880', 5) + pth(`M${x - 34} 40L${x + 34} 40L${x + 34} 250L${x} 222L${x - 34} 250Z`, col, OL(dark(col, 0.5), 3))
    + rect(x - 40, 32, 80, 10, '#5a5890', OL('#2c2a5a', 2) + ' rx="4"') + emb + stk(`M${x - 26} 60L${x + 26} 60`, lite(col, 0.25), 2, op(0.6));
  b += banner(40, '#5d4a9e', pth(star5(40, 140, 22, 10), '#d8cdf8', OL('#3a2f6e', 2)));
  b += banner(920, '#3e7d8e', circ(920, 136, 20, '#cfeff2', OL('#244a56', 2)) + circ(928, 130, 17, '#3e7d8e'));
  // parapet: low wall all across with top at y 500; merlons at the sides only
  b += rect(-2, 500, W + 4, 40, stone) + rect(-2, 501, W + 4, 7, stL) + stk('M-2 501L962 501', stD, 2);
  for (const x of [0, 96, 864]) b += rect(x, 420, 96 - 14, 82, stone, OL(stD, 3)) + rect(x - 4, 414, 96 - 6, 10, stL, OL(stD, 2.5));
  b += rect(864 - 96, 440, 82, 62, stone, OL(stD, 3)) + rect(864 - 100, 434, 90, 10, stL, OL(stD, 2.5));
  for (let i = 0; i < 12; i++) b += stk(`M${i * 80 + 40} 504L${i * 80 + 40} 522M${i * 80} 522L${i * 80} 540M0 522L960 522`, stD, 2, op(0.6));
  for (const [x, y0, w] of [[0, 424, 82], [96, 424, 82], [864, 424, 82], [768, 444, 82]]) b += stk(`M${x + 3} ${y0 + 26}L${x + w - 3} ${y0 + 26}M${x + 3} ${y0 + 52}L${x + w - 3} ${y0 + 52}M${x + w * 0.5} ${y0 + 6}L${x + w * 0.5} ${y0 + 26}M${x + w * 0.25} ${y0 + 26}L${x + w * 0.25} ${y0 + 52}M${x + w * 0.75} ${y0 + 26}L${x + w * 0.75} ${y0 + 52}`, stD, 2, op(0.45)) + rect(x + 6, y0 + 8, 18, 4, '#8a8fcc', op(0.35) + ' rx="2"');
  // telescope on a tripod, pointing up-right (left corner)
  const br = '#9a8a6a', brD = '#4c4236';
  b += stk('M196 432L168 500M196 432L226 500M196 432L198 500', '#5a4a40', 6);
  b += `<g transform="translate(196 432) scale(0.85) rotate(-34) translate(-210 -418)">` + rect(150, 398, 140, 26, '#4f5aa8', OL('#262c5c', 3) + ' rx="8"') + rect(286, 392, 22, 38, '#5f6ab8', OL('#262c5c', 3) + ' rx="5"') + rect(132, 403, 22, 16, '#4f5aa8', OL('#262c5c', 3) + ' rx="4"')
    + rect(196, 396, 10, 30, br, OL(brD, 2)) + rect(250, 396, 8, 30, br, OL(brD, 2)) + rect(170, 403, 120, 4, '#7f8ad8', op(0.6)) + '</g>';
  b += circ(196, 432, 5.5, br, OL(brD, 2));
  // right: lantern on the parapet + a little basket of rolled star charts
  b += circ(724, 452, 62, 'url(#tlg)');
  b += rect(706, 444, 28, 36, '#ffe2aa', OL('#3c3a6a', 3) + ' rx="4"') + pth('M702 444L738 444L720 428Z', '#3c3a6a', OL('#2a2850', 2)) + rect(704, 478, 32, 8, '#3c3a6a', ' rx="2"') + ell(720, 462, 5, 8, '#fff6dc') + stk('M720 428q0 -12 8 -12', '#3c3a6a', 2.5);
  b += pth('M772 470L832 470L826 500L778 500Z', '#7a5a4a', OL('#3c2a2a', 2.5));
  for (const [x, a, c] of [[784, -14, '#efe0bc'], [800, -4, '#d8cdf8'], [816, 10, '#efe0bc']]) b += `<g transform="rotate(${a} ${x} 470)">` + rect(x - 5, 432, 10, 40, c, OL('#8a7a5a', 2) + ' rx="4"') + circ(x, 436, 4, mix(c, '#8a7a5a', 0.3)) + '</g>';
  write('levels/tower/near.svg', svg(W, H, b, defs));
}

// =====================================================================================
// PARTICLES (32x32, centred, transparent edges)
// =====================================================================================
function particles() {
  const P = (name, body, defs = '') => write(`particles/${name}.svg`, svg(32, 32, body, defs));
  P('glow', circ(16, 16, 15, 'url(#g)') + circ(16, 16, 4.5, '#f4ffd0'), rad('g', [['0', '#efffb0', 1], ['0.3', '#c8f06a', 0.75], ['0.65', '#b6f04a', 0.22], ['1', '#b6f04a', 0]]));
  P('leaf', `<g transform="rotate(-25 16 16)">` + pth('M16 4Q26 8 26 17Q24 26 16 29Q8 26 6 17Q6 8 16 4Z', '#e8693a', OL('#8a3a24', 2)) + stk('M16 6L16 28M16 13L21 10M16 18L22 15M16 13L11 10M16 18L10 15', '#a8452a', 1.3) + pth('M10 12Q12 8 15 7', 'none', OL('#ffb07a', 1.5) + op(0.7)) + '</g>');
  P('drip', pth('M16 3Q24 15 24 20A8 8 0 0 1 8 20Q8 15 16 3Z', '#bfeefc', OL('#4f9fc0', 2)) + ell(13, 19, 2.2, 3.5, '#ffffff', op(0.85)));
  P('sparkle', circ(16, 16, 14, 'url(#g)') + pth(twinkle(16, 16, 13, 0.18), '#f2fdff', OL('#9adff2', 1)) + circ(16, 16, 2.2, '#ffffff'), rad('g', [['0', '#bff2ff', 0.6], ['1', '#bff2ff', 0]]));
  P('dust', circ(16, 16, 14, 'url(#g)'), rad('g', [['0', '#fff1d0', 1], ['0.35', '#ffe2b0', 0.6], ['1', '#ffe2b0', 0]]));
  P('page', `<g transform="rotate(-12 16 16)">` + pth('M7 6Q16 4 25 7L24 27Q16 25 8 27Z', '#f6ecd0', OL('#a8946a', 1.6)) + stk('M10 11L21 12M10 15L22 16M10 19L20 20M10 23L17 23.5', '#c2ad84', 1.2) + pth('M25 7L24 27Q22 26 21 25.5', 'none', OL('#d8c8a0', 1.2)) + '</g>');
  P('star', circ(16, 16, 15, 'url(#g)') + pth(star5(16, 17, 11, 5), '#fff1a8', OL('#c99a3a', 1.8)) + circ(13.5, 14, 1.6, '#ffffff', op(0.8)), rad('g', [['0', '#fff3b0', 0.45], ['1', '#fff3b0', 0]]));
  P('puff', circ(16, 17, 14, 'url(#g)') + circ(12, 18, 6.5, '#ffffff', op(0.85)) + circ(19, 15, 7.5, '#ffffff', op(0.9)) + circ(17, 21, 6.5, '#ddd8ee', op(0.9)) + circ(12, 20, 5, '#e6e2f4', op(0.8)) + circ(17, 13.5, 3, '#ffffff'), rad('g', [['0', '#ffffff', 0.5], ['1', '#ffffff', 0]]));
  P('heart', pth('M16 27Q5 19 5 12A5.5 5.5 0 0 1 16 10A5.5 5.5 0 0 1 27 12Q27 19 16 27Z', '#ff8fb8', OL('#b84a7a', 2)) + ell(11, 12.5, 2.2, 1.6, '#ffffff', op(0.8) + ' transform="rotate(-30 11 12.5)"'));
  P('spark', circ(16, 16, 15, 'url(#g)') + pth('M16 7L19 16L16 25L13 16Z', '#ffd27a') + circ(16, 16, 2.6, '#fff6dc'), rad('g', [['0', '#fff0c0', 0.95], ['0.3', '#ffb050', 0.6], ['0.7', '#ff9a3c', 0.15], ['1', '#ff9a3c', 0]]));
}

courtyard(); cellar(); library(); tower(); particles();
console.log('environment art written to', OUT);
