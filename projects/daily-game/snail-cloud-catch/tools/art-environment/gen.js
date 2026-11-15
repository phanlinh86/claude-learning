// Shelly's Sky Catch: environment art generator (4 weather levels of the Cloud Kingdom + particles).
// Writes original, hand-authored, procedurally-laid-out SVGs (seeded, deterministic).
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3. Static SIDE view:
//   sky.svg    opaque gradient + far cloud sea (horizon)
//   castle.svg far cloud islands with original castle towers (per-level props), bottoms behind the floor
//   clouds.svg 960x220 tileable wisps (drawn at y 120, drifting)
//   bank.svg   960x150 tileable cloud bank, fluffy bottom edge y 90..110 (HUD sits on it)
//   ground.svg cloud floor, top edge 468..500 (avg ~492)
// The play band y 280–480 stays calm, mid-toned and low contrast so a mint/coral snail, saturated
// yellow/pink/blue/gold stars and slate thunder puffs always win.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const W = 960, H = 540;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function svg(body, defs = '', w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
}
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const strokeP = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rad = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const poly = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('');
const twinkle = (x, y, R, k = 0.16) => `M${f(x)} ${f(y - R)}Q${f(x + R * k)} ${f(y - R * k)} ${f(x + R)} ${f(y)}Q${f(x + R * k)} ${f(y + R * k)} ${f(x)} ${f(y + R)}Q${f(x - R * k)} ${f(y + R * k)} ${f(x - R)} ${f(y)}Q${f(x - R * k)} ${f(y - R * k)} ${f(x)} ${f(y - R)}Z`;

// A fluffy edge: a run of half-ellipse bumps between x0 and x1 on a baseline.
// dir = -1 bumps go UP (cloud tops), +1 bumps go DOWN (cloud bottoms). widths are normalised so the run
// exactly fills [x0, x1] (=> periodic when x1 - x0 = 960 and the baseline is constant: tileable).
// Returns sampled points (every ~4 px) so we can also measure the edge.
function bumpEdge(x0, x1, base, seed, wMin, wMax, kMin, kMax, dir = -1, big = null) {
  const r = rng(seed); const ws = [];
  let tot = 0; while (tot < x1 - x0) { const w = wMin + r() * (wMax - wMin); ws.push(w); tot += w; }
  const sc = (x1 - x0) / tot; const pts = []; let x = x0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] * sc; let k = kMin + r() * (kMax - kMin);
    if (big) k *= big(x + w / 2);
    const ry = w / 2 * k; const n = Math.max(4, Math.round(w / 4));
    for (let j = (i ? 1 : 0); j <= n; j++) { const t = j / n; const a = Math.PI * t; pts.push([x + w * t, base + dir * Math.sin(a) * ry]); }
    x += w;
  }
  return pts;
}
const edgeAvg = pts => { let s = 0, L = 0; for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0]; s += (pts[i][1] + pts[i - 1][1]) / 2 * dx; L += dx; } return s / L; };
const edgeAt = (pts, x) => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const a = pts[i - 1], b = pts[i], t = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; } return pts[pts.length - 1][1]; };
// closed band: an upward-bumpy top edge closed down to yB
const bandUp = (pts, yB) => poly(pts) + `L${f(pts[pts.length - 1][0])} ${yB}L${f(pts[0][0])} ${yB}Z`;
// closed band: a downward-bumpy bottom edge closed up to yT
const bandDown = (pts, yT) => poly(pts) + `L${f(pts[pts.length - 1][0])} ${yT}L${f(pts[0][0])} ${yT}Z`;

// cloud lump made of circles (union). Drawn with the "stroke-under" trick for a union outline.
function lumps(cx, cy, w, h, seed, n = 6) {
  const r = rng(seed); const c = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), x = cx - w / 2 + w * (0.12 + t * 0.76);
    const R = h * (0.42 + 0.35 * Math.sin(Math.PI * t)) * (0.85 + r() * 0.3);
    c.push([x, cy - R * 0.25, R]);
  }
  return c;
}

// ---------- palettes ----------
const PAL = {
  sunny: {
    sky: [[0, '#4ea3e4'], [0.3, '#7cc0ee'], [0.58, '#b9def5']],
    sea: ['#d2e9f7', '#bfdff2', '#acd3ec', '#9fcae7'], seaHi: '#e8f5fc',
    haze: '#b9dbf1',
    isl: { base: '#e9f3fb', sh: '#bcd6ec', hi: '#ffffff', out: '#9bbad6' },
    wall: '#f1e7d6', wallSh: '#d8cbb8', roofA: '#8fa6e4', roofB: '#e8a6c4', out: '#7a86a8', win: '#7d8fc0', flag: '#ff9fb8',
    clouds: { a: '#ffffff', b: '#d8ecf8', op: 0.55 },
    bank: { base: '#f5fbff', sh: '#cfe4f4', hi: '#ffffff', out: '#b4d0e6' },
    gr: { top: '#f7fbff', mid: '#e4f0fa', bot: '#c8dff0', sh: '#bdd6ec', out: '#97b8d6', hi: '#ffffff' },
  },
  rain: {
    sky: [[0, '#6f709e'], [0.32, '#9493bb'], [0.58, '#b6b1cd']],
    sea: ['#bdb7d1', '#aea9c7', '#a19dbd', '#9693b4'], seaHi: '#d4d0e3',
    haze: '#aaa6c4',
    isl: { base: '#cdc9df', sh: '#a6a1c2', hi: '#e2dfee', out: '#837fa6' },
    wall: '#d9d3e6', wallSh: '#b9b2cf', roofA: '#7f8fc6', roofB: '#9a86c2', out: '#66628c', win: '#f2d9a6', flag: '#9fc4ea',
    clouds: { a: '#e4e1ef', b: '#a9a5c4', op: 0.55 },
    bank: { base: '#d9d7e7', sh: '#b2aecb', hi: '#ebe9f4', out: '#9894b8' },
    gr: { top: '#e3e1ef', mid: '#d0cde3', bot: '#b7b3d0', sh: '#aca8c8', out: '#8581aa', hi: '#f3f2fa' },
  },
  wind: {
    sky: [[0, '#5fb0b6'], [0.22, '#93c9c2'], [0.42, '#e7cdb4'], [0.6, '#f0c3ac']],
    sea: ['#ecc8b8', '#dfbcb4', '#d1b2b4', '#c4a9b4'], seaHi: '#f6dccc',
    haze: '#dcbdb4',
    isl: { base: '#f6e4da', sh: '#d8bfbc', hi: '#fff5ee', out: '#b39aa4' },
    wall: '#f4e6d6', wallSh: '#d9c4b6', roofA: '#6fa8b0', roofB: '#c78aa0', out: '#8a7486', win: '#7f9aa8', flag: '#7fc6c8',
    clouds: { a: '#fff4ea', b: '#e9c4b6', op: 0.6 },
    bank: { base: '#fff3ea', sh: '#ecd0c4', hi: '#ffffff', out: '#d4b2aa' },
    gr: { top: '#fff6f0', mid: '#f6e4dc', bot: '#e4cac6', sh: '#dcc0bc', out: '#b89aa2', hi: '#ffffff' },
  },
  snow: {
    sky: [[0, '#2c2a64'], [0.28, '#4f4790'], [0.58, '#8f7dbb']],
    sea: ['#a698cb', '#9789c0', '#897bb4', '#7d70aa'], seaHi: '#c4b9e0',
    haze: '#8f80bb',
    isl: { base: '#c9c6ea', sh: '#a29dcc', hi: '#eeefff', out: '#6f68a2' },
    wall: '#c3bde0', wallSh: '#a29bc8', roofA: '#6a6eb0', roofB: '#8a6ea8', out: '#4f4a86', win: '#ffd27e', flag: '#a8d8ff',
    snowcap: '#f4f6ff',
    clouds: { a: '#d8d4f4', b: '#7c71ae', op: 0.5 },
    bank: { base: '#e6ebff', sh: '#bcc3ec', hi: '#ffffff', out: '#9ea6da' },
    gr: { top: '#f4f7ff', mid: '#e2e8fb', bot: '#c4cdef', sh: '#b6bfe8', out: '#8d96cc', hi: '#ffffff' },
  },
};

// =====================================================================================
// SKY (opaque 960x540): gradient + sun/stars + far cloud sea rows (low contrast)
// =====================================================================================
function cloudSea(c, seed) {
  // 4 rows of soft cloud tops, far (lighter, smaller bumps) to near; the play band ends up a calm mid-tone
  let o = ''; const rows = [[318, 30, 70, 0.28, 0.5], [352, 40, 90, 0.26, 0.48], [392, 50, 110, 0.24, 0.44], [436, 60, 130, 0.22, 0.4]];
  rows.forEach(([y, a, b, k1, k2], i) => {
    const e = bumpEdge(-20, 980, y, seed + i, a, b, k1, k2);
    o += pth(bandUp(e, H), c.sea[i]);
    // soft lit rim on the bump tops (one step lighter, thin, low opacity)
    const rim = e.map(p => [p[0], p[1] + 2]);
    o += strokeP(poly(rim), c.seaHi, 2.2, ` opacity="${f(0.55 - i * 0.1)}"`);
  });
  return o;
}
function skySunny() {
  const c = PAL.sunny; const r = rng(11);
  const defs = lin('s', c.sky) + rad('sun', [[0, '#fffbe8', 0.95], [0.3, '#fff3cc', 0.6], [1, '#fff3cc', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  // soft sun top-left, below the HUD bank; pale cream (not a flat yellow disc)
  o += circ(170, 168, 130, 'url(#sun)');
  let rays = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.13; rays += `M${f(170 + Math.cos(a) * 52)} ${f(168 + Math.sin(a) * 52)}L${f(170 + Math.cos(a) * 74)} ${f(168 + Math.sin(a) * 74)}`; }
  o += strokeP(rays, '#fff8de', 5, ' opacity="0.55"');
  o += circ(170, 168, 40, '#fff6d6') + circ(170, 168, 33, '#fffcef') + ell(158, 156, 11, 7, '#ffffff', ' opacity="0.9"');
  // tiny high wisps
  let w = ''; for (let i = 0; i < 6; i++) { const x = 360 + r() * 560, y = 130 + r() * 110; w += `M${f(x)} ${f(y)}h${f(40 + r() * 70)}`; }
  o += strokeP(w, '#ffffff', 3, ' opacity="0.35"');
  o += cloudSea(c, 120);
  return svg(o, defs);
}
function skyRain() {
  const c = PAL.rain; const r = rng(21);
  const defs = lin('s', c.sky) + rad('glow', [[0, '#e8e2f6', 0.5], [1, '#e8e2f6', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  // a pale veiled sun glow behind the overcast + soft heavy cloud layers high up
  o += ell(720, 200, 260, 110, 'url(#glow)');
  for (let i = 0; i < 3; i++) {
    const e = bumpEdge(-20, 980, 150 + i * 40, 200 + i, 70, 150, 0.18, 0.3, 1);
    o += pth(bandDown(e, 0), mix(c.sky[0][1], '#c8c4dc', 0.15 + i * 0.12), ` opacity="${f(0.45 - i * 0.1)}"`);
  }
  // very faint slanted rain veils in the distance (static)
  let v = ''; for (let i = 0; i < 40; i++) { const x = r() * 980, y = 170 + r() * 120; v += `M${f(x)} ${f(y)}l-6 24`; }
  o += strokeP(v, '#d8d4ea', 1.4, ' opacity="0.35"');
  o += cloudSea(c, 220);
  return svg(o, defs);
}
function skyWind() {
  const c = PAL.wind; const r = rng(31);
  const defs = lin('s', c.sky) + rad('sun', [[0, '#fff2e0', 0.8], [1, '#fff2e0', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  o += ell(780, 290, 230, 90, 'url(#sun)');
  // long horizontal wind streak clouds
  let st = ''; for (let i = 0; i < 9; i++) { const y = 140 + i * 18 + r() * 10, x = r() * 820; st += `M${f(x)} ${f(y)}q${f(60)} -6 ${f(140 + r() * 140)} 0`; }
  o += strokeP(st, '#fff1e4', 4, ' opacity="0.45"');
  o += cloudSea(c, 320);
  return svg(o, defs);
}
function skySnow() {
  const c = PAL.snow; const r = rng(41);
  const defs = lin('s', c.sky) + rad('moon', [[0, '#f4ecff', 0.55], [1, '#f4ecff', 0]]) + rad('hz', [[0, '#ffc2a8', 0.32], [1, '#ffc2a8', 0]]);
  let o = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
  // a few small sky stars, kept tiny (never like the collectible stars) and above the play band
  let dots = ''; for (let i = 0; i < 46; i++) { const x = r() * W, y = 100 + Math.pow(r(), 1.3) * 160, R = 0.7 + r() * 1.1; dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" opacity="${f(0.4 + r() * 0.5)}"/>`; }
  o += `<g fill="#f2eeff">${dots}</g>`;
  let tw = ''; for (const [x, y, R] of [[330, 132, 4.5], [610, 118, 5], [860, 176, 4], [90, 220, 3.5], [500, 200, 3.5]]) tw += twinkle(x, y, R);
  o += pth(tw, '#f6f2ff', ' opacity="0.85"');
  // slim crescent moon top-right with a soft halo
  o += circ(800, 150, 70, 'url(#moon)');
  o += `<path d="M800 124A27 27 0 1 0 826 156A21 21 0 1 1 800 124Z" fill="#f6f0ff"/>`;
  // warm twilight glow low on the horizon
  o += ell(480, 330, 520, 70, 'url(#hz)');
  o += cloudSea(c, 420);
  return svg(o, defs);
}

// =====================================================================================
// CASTLE LAYER (960x540, transparent): far cloud islands + original towers
// =====================================================================================
// island: a cloud mound rising from behind the floor (bottom 500) with a bumpy top at `top`
function island(x0, x1, top, seed, c, k = 1) {
  const e = bumpEdge(x0, x1, top, seed, 34, 70, 0.35, 0.6);
  // round the ends down so the mound looks like a cloud, not a band
  const L = x1 - x0; const pts = e.map(([x, y]) => { const t = (x - x0) / L; const u = Math.abs(t - 0.5) * 2; const edgeSide = (x0 <= 0 && t < 0.5) || (x1 >= 960 && t > 0.5); const fall = edgeSide ? Math.pow(u, 3) * 40 * k : (1 - Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.4)))) * (504 - y); return [x, Math.min(504, y + fall)]; });
  const body = bandUp(pts, 505);
  const shade = bandUp(pts.map(([x, y]) => [x, y + 26]), 505);
  const hi = pts.filter((_, i) => i % 3 === 0);
  let o = pth(body, c.base, ` stroke="${c.out}" stroke-width="2.4" stroke-linejoin="round" stroke-opacity="0.45"`) + pth(shade, c.sh, ' opacity="0.55"');
  let h = ''; for (let i = 1; i < hi.length - 1; i += 2) h += `M${f(hi[i][0] - 8)} ${f(hi[i][1] + 6)}q8 -5 16 0`;
  o += strokeP(h, c.hi, 3, ' opacity="0.7"');
  return { svg: o, top: pts };
}
// floating island with drips (rain)
function floatIsle(cx, cy, w, h, seed, c, drips = true) {
  const r = rng(seed);
  const top = lumps(cx, cy, w, h, seed, 6), bot = [];
  bot.push([cx - w * 0.2, cy + h * 0.12, h * 0.42], [cx + w * 0.18, cy + h * 0.14, h * 0.4]);
  const all = top.concat(bot);
  const g = (fill, ex = '') => `<g fill="${fill}"${ex}>${all.map(([x, y, R]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}"/>`).join('')}</g>`;
  let o = `<g stroke="${c.out}" stroke-width="5" stroke-opacity="0.45">${all.map(([x, y, R]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${c.base}"/>`).join('')}</g>` + g(c.base);
  o += ell(cx, cy + h * 0.3, w * 0.38, h * 0.2, c.sh, ' opacity="0.6"');
  o += `<g fill="${c.hi}" opacity="0.8">${top.map(([x, y, R]) => `<ellipse cx="${f(x - R * 0.2)}" cy="${f(y - R * 0.45)}" rx="${f(R * 0.45)}" ry="${f(R * 0.22)}"/>`).join('')}</g>`;
  if (drips) {
    // soft drippy tails + a few falling drops (static, pale)
    let d = ''; for (let i = 0; i < 3; i++) { const x = cx - w * 0.22 + i * w * 0.22 + r() * 8, y = cy + h * 0.42; const L = 6 + r() * 6; d += `M${f(x - 4)} ${f(y)}Q${f(x - 3)} ${f(y + L)} ${f(x)} ${f(y + L + 3)}Q${f(x + 3)} ${f(y + L)} ${f(x + 4)} ${f(y)}Z`; }
    o += pth(d, c.base, ` stroke="${c.out}" stroke-width="1.6" stroke-opacity="0.45"`);
    let s = ''; for (let i = 0; i < 6; i++) { const x = cx - w * 0.3 + r() * w * 0.6, y = cy + h * 0.75 + r() * 40; s += `M${f(x)} ${f(y)}l-1.5 7`; }
    o += strokeP(s, c.hi, 1.6, ' opacity="0.45"');
  }
  return o;
}
// one castle tower: body, shade, conical roof, pennant, arched window
function tower(x, baseY, w, h, c, o2 = {}) {
  const top = baseY - h, rh = o2.roofH ?? w * 1.15, roof = o2.roof || c.roofA;
  const sw = o2.sw ?? 2.2;
  let o = '';
  o += `<rect x="${f(x - w / 2)}" y="${f(top)}" width="${f(w)}" height="${f(h + 4)}" fill="${c.wall}" stroke="${c.out}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  o += `<rect x="${f(x + w * 0.18)}" y="${f(top + sw / 2)}" width="${f(w * 0.32 - sw / 2)}" height="${f(h + 4 - sw)}" fill="${c.wallSh}"/>`;
  // roof (slightly curved cone with an eave)
  const ex = w / 2 + 4;
  const rd = `M${f(x - ex)} ${f(top + 2)}Q${f(x - w * 0.16)} ${f(top - rh * 0.4)} ${f(x)} ${f(top - rh)}Q${f(x + w * 0.16)} ${f(top - rh * 0.4)} ${f(x + ex)} ${f(top + 2)}Q${f(x)} ${f(top + 6)} ${f(x - ex)} ${f(top + 2)}Z`;
  o += pth(rd, roof, ` stroke="${c.out}" stroke-width="${sw}" stroke-linejoin="round"`);
  o += pth(`M${f(x)} ${f(top - rh)}Q${f(x + w * 0.16)} ${f(top - rh * 0.4)} ${f(x + ex)} ${f(top + 2)}Q${f(x + ex * 0.5)} ${f(top + 4.5)} ${f(x + 2)} ${f(top + 4)}Z`, mix(roof, c.out, 0.28), ' opacity="0.7"');
  o += strokeP(`M${f(x - w * 0.2)} ${f(top - rh * 0.3)}Q${f(x - w * 0.08)} ${f(top - rh * 0.62)} ${f(x - 1)} ${f(top - rh * 0.86)}`, mix(roof, '#ffffff', 0.45), 1.8, ' opacity="0.8"');
  if (o2.snow) {
    // snow cap: fluffy white on the upper roof + a soft lip on the eave
    const sy = top - rh * 0.55;
    o += pth(`M${f(x - w * 0.14)} ${f(sy)}Q${f(x - w * 0.06)} ${f(top - rh * 0.85)} ${f(x)} ${f(top - rh - 1)}Q${f(x + w * 0.06)} ${f(top - rh * 0.85)} ${f(x + w * 0.14)} ${f(sy)}Q${f(x + w * 0.07)} ${f(sy + 5)} ${f(x)} ${f(sy + 2)}Q${f(x - w * 0.07)} ${f(sy + 6)} ${f(x - w * 0.14)} ${f(sy)}Z`, c.snowcap, ` stroke="${c.out}" stroke-width="1.4" stroke-opacity="0.6"`);
    let lip = `M${f(x - ex - 1)} ${f(top + 1)}`; const n = Math.max(3, Math.round(w / 9));
    for (let i = 0; i < n; i++) { const xa = x - ex - 1 + (2 * ex + 2) * (i + 1) / n; lip += `Q${f(xa - (ex / n))} ${f(top + 8 + (i % 2) * 3)} ${f(xa)} ${f(top + 2)}`; }
    o += pth(lip + 'Z', c.snowcap, ` stroke="${c.out}" stroke-width="1.2" stroke-opacity="0.5"`);
  }
  if (o2.flag !== false) {
    const py = top - rh; o += strokeP(`M${f(x)} ${f(py)}V${f(py - 16)}`, c.out, 1.6);
    const fl = o2.flagDir ?? 1;
    o += pth(`M${f(x)} ${f(py - 16)}Q${f(x + fl * 8)} ${f(py - 17)} ${f(x + fl * 15)} ${f(py - 12)}Q${f(x + fl * 8)} ${f(py - 10)} ${f(x)} ${f(py - 8)}Z`, c.flag, ` stroke="${c.out}" stroke-width="1.2" stroke-linejoin="round"`);
  }
  // arched windows
  const nw = o2.windows ?? 1;
  for (let i = 0; i < nw; i++) {
    const wx = x - w * 0.08, wy = top + 14 + i * 26, ww = Math.min(9, w * 0.26), wh = ww * 1.6;
    if (wy + wh > baseY - 6) break;
    const d = `M${f(wx - ww / 2)} ${f(wy + wh)}V${f(wy + ww / 2)}A${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(wx + ww / 2)} ${f(wy + ww / 2)}V${f(wy + wh)}Z`;
    if (o2.lit) o += ell(wx, wy + wh * 0.55, ww * 1.5, wh * 0.9, c.win, ' opacity="0.22"');
    o += pth(d, c.win, ` stroke="${c.out}" stroke-width="1.3"`);
    if (o2.lit) o += strokeP(`M${f(wx)} ${f(wy + 2)}V${f(wy + wh - 1)}`, mix(c.win, c.out, 0.5), 1, ' opacity="0.6"');
  }
  return o;
}
// a castle: central keep with crenellations + gate, side towers
function castle(cx, baseY, s, c, o2 = {}) {
  let o = '';
  const kw = 70 * s, kh = 64 * s;
  // keep
  let cren = `M${f(cx - kw / 2)} ${f(baseY + 4)}V${f(baseY - kh)}`;
  const n = 5; for (let i = 0; i < n; i++) { const a = cx - kw / 2 + kw * i / n, b = a + kw / n; cren += `H${f(a + kw / n * 0.25)}V${f(baseY - kh - 7 * s)}H${f(b - kw / n * 0.25)}V${f(baseY - kh)}H${f(b)}`; }
  cren += `V${f(baseY + 4)}Z`;
  const towers = o2.towers || [[-48, 26, 108, c.roofA], [50, 24, 92, c.roofB], [-14, 22, 132, c.roofB]];
  // back towers first (tallest middle one behind keep)
  for (const [dx, tw, th, roof] of towers.filter(t => t[4] === 'back')) o += tower(cx + dx * s, baseY, tw * s, th * s, c, { roof, snow: o2.snow, lit: o2.lit, flagDir: o2.flagDir, windows: 2 });
  o += pth(cren, c.wall, ` stroke="${c.out}" stroke-width="2.2" stroke-linejoin="round"`);
  o += `<rect x="${f(cx + kw * 0.2)}" y="${f(baseY - kh + 1)}" width="${f(kw * 0.28)}" height="${f(kh + 2)}" fill="${c.wallSh}"/>`;
  if (o2.snow) o += pth(`M${f(cx - kw / 2 - 2)} ${f(baseY - kh - 7 * s)}h${f(kw + 4)}v5q${f(-kw / 4)} 5 ${f(-kw / 2)} 1t${f(-kw / 2 - 4)} 1Z`, c.snowcap, ` stroke="${c.out}" stroke-width="1.2" stroke-opacity="0.5"`);
  // gate
  const gw = 22 * s, gh = 30 * s;
  o += pth(`M${f(cx - gw / 2)} ${f(baseY + 2)}V${f(baseY - gh + gw / 2)}A${f(gw / 2)} ${f(gw / 2)} 0 0 1 ${f(cx + gw / 2)} ${f(baseY - gh + gw / 2)}V${f(baseY + 2)}Z`, o2.lit ? mix(c.win, c.out, 0.4) : mix(c.out, c.wall, 0.35), ` stroke="${c.out}" stroke-width="1.6"`);
  // keep windows
  for (const dx of [-0.3, 0.3]) {
    const wx = cx + kw * dx, wy = baseY - kh + 14 * s, ww = 8 * s;
    if (o2.lit) o += ell(wx, wy + ww, ww * 1.4, ww * 1.4, c.win, ' opacity="0.22"');
    o += pth(`M${f(wx - ww / 2)} ${f(wy + ww * 1.6)}V${f(wy + ww / 2)}A${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(wx + ww / 2)} ${f(wy + ww / 2)}V${f(wy + ww * 1.6)}Z`, c.win, ` stroke="${c.out}" stroke-width="1.2"`);
  }
  for (const [dx, tw, th, roof, z] of towers) if (z !== 'back') o += tower(cx + dx * s, baseY, tw * s, th * s, c, { roof, snow: o2.snow, lit: o2.lit, flagDir: o2.flagDir, windows: 2 });
  return o;
}
function windmill(x, baseY, s, c, ang = 18) {
  const h = 92 * s, bw = 30 * s, tw = 18 * s;
  let o = '';
  const body = `M${f(x - bw / 2)} ${f(baseY + 4)}L${f(x - tw / 2)} ${f(baseY - h)}L${f(x + tw / 2)} ${f(baseY - h)}L${f(x + bw / 2)} ${f(baseY + 4)}Z`;
  o += pth(body, c.wall, ` stroke="${c.out}" stroke-width="2.2" stroke-linejoin="round"`);
  o += pth(`M${f(x + 2)} ${f(baseY + 3)}L${f(x + 1)} ${f(baseY - h + 1)}L${f(x + tw / 2 - 1)} ${f(baseY - h + 1)}L${f(x + bw / 2 - 1.2)} ${f(baseY + 3)}Z`, c.wallSh);
  // door + window
  o += pth(`M${f(x - 6 * s)} ${f(baseY + 2)}V${f(baseY - 10 * s)}A${f(6 * s)} ${f(6 * s)} 0 0 1 ${f(x + 6 * s)} ${f(baseY - 10 * s)}V${f(baseY + 2)}Z`, mix(c.out, c.wall, 0.35), ` stroke="${c.out}" stroke-width="1.4"`);
  o += circ(x, baseY - h * 0.55, 4.5 * s, c.win, ` stroke="${c.out}" stroke-width="1.3"`);
  // cap
  o += pth(`M${f(x - tw / 2 - 5 * s)} ${f(baseY - h + 2)}Q${f(x)} ${f(baseY - h - 26 * s)} ${f(x + tw / 2 + 5 * s)} ${f(baseY - h + 2)}Z`, c.roofA, ` stroke="${c.out}" stroke-width="2.2" stroke-linejoin="round"`);
  // four static sails (lattice frames) around the hub
  const hx = x, hy = baseY - h - 6 * s, L = 58 * s, sw = 13 * s;
  let sails = '';
  for (let i = 0; i < 4; i++) {
    const a = (ang + i * 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const p = (t, k) => [hx + ux * L * t + vx * sw * k, hy + uy * L * t + vy * sw * k];
    const q = [p(0.18, 0), p(1, 0), p(1, 1), p(0.22, 1)];
    sails += pth(poly(q) + 'Z', mix(c.wall, '#ffffff', 0.3), ` stroke="${c.out}" stroke-width="1.6" stroke-linejoin="round"`);
    let lat = ''; for (let k = 1; k < 4; k++) { const a1 = p(0.2 + k * 0.2, 0), b1 = p(0.2 + k * 0.2, 1); lat += `M${f(a1[0])} ${f(a1[1])}L${f(b1[0])} ${f(b1[1])}`; }
    const m0 = p(0.2, 0.5), m1 = p(1, 0.5); lat += `M${f(m0[0])} ${f(m0[1])}L${f(m1[0])} ${f(m1[1])}`;
    sails += strokeP(lat, c.out, 1.1, ' opacity="0.6"');
    const s0 = p(0, 0), s1 = p(1, 0); sails += strokeP(`M${f(s0[0])} ${f(s0[1])}L${f(s1[0])} ${f(s1[1])}`, c.out, 2.4);
  }
  o += sails + circ(hx, hy, 4.5 * s, c.roofB, ` stroke="${c.out}" stroke-width="1.6"`);
  return o;
}
// little pennant pole with a wavy flag (blown to the right)
function flagPole(x, baseY, h, c, col) {
  const t = baseY - h;
  return strokeP(`M${f(x)} ${f(baseY + 2)}V${f(t)}`, c.out, 2) + circ(x, t - 1, 2.2, c.wall, ` stroke="${c.out}" stroke-width="1.2"`) +
    pth(`M${f(x)} ${f(t + 2)}Q${f(x + 10)} ${f(t - 2)} ${f(x + 18)} ${f(t + 3)}T${f(x + 34)} ${f(t + 6)}Q${f(x + 22)} ${f(t + 11)} ${f(x + 16)} ${f(t + 12)}T${f(x)} ${f(t + 15)}Z`, col, ` stroke="${c.out}" stroke-width="1.3" stroke-linejoin="round"`);
}
function fadePal(c, k) { // aerial perspective: pull castle colours toward the haze colour
  const o = {}; for (const [key, v] of Object.entries(c)) o[key] = typeof v === 'string' && v[0] === '#' ? mix(v, c.haze, k) : v; return o;
}

function castleSunny() {
  const c0 = PAL.sunny, c = fadePal({ ...c0, ...{} }, 0.22), ci = fadePal({ ...c0.isl, haze: c0.haze }, 0.15);
  let o = '';
  // rainbow bridge first (behind the islands), pastel and translucent
  const bands = ['#ffb3c4', '#ffd2a8', '#fff0b0', '#bfeab8', '#b0dcf4', '#c8b8f0'];
  let rb = ''; bands.forEach((col, i) => { const R = 300 - i * 7; rb += strokeP(`M${f(480 - R * 0.98)} ${f(410)}A${f(R)} ${f(R * 0.66)} 0 0 1 ${f(480 + R * 0.98)} ${f(410)}`, col, 7.4); });
  o += `<g opacity="0.55">${rb}</g>`;
  // far small island far right (behind)
  const isB = island(640, 960, 410, 501, ci, 0.6); o += isB.svg;
  o += castle(812, edgeAt(isB.top, 812) + 10, 0.75, c, { towers: [[-44, 24, 96, c.roofB], [46, 22, 80, c.roofA], [-6, 20, 120, c.roofA, 'back']] });
  // main island left
  const isA = island(0, 420, 372, 502, ci, 0.7); o += isA.svg;
  o += castle(200, edgeAt(isA.top, 200) + 12, 1, c, { towers: [[-50, 28, 112, c.roofA], [52, 26, 96, c.roofB], [-4, 24, 150, c.roofB, 'back']] });
  // a lone tiny tower island mid-right, low
  const isC = island(520, 680, 440, 503, ci, 0.9); o += isC.svg;
  o += tower(598, edgeAt(isC.top, 598) + 10, 20, 52, c, { roof: c.roofA, windows: 1 });
  return svg(o);
}
function castleRain() {
  const c0 = PAL.rain, c = fadePal(c0, 0.28), ci = fadePal({ ...c0.isl, haze: c0.haze }, 0.12);
  let o = '';
  // drifting drippy rain islands, high (above the play band) and far
  { const cf = fadePal(c0, 0.36); o += tower(548, 196, 18, 40, cf, { roof: cf.roofB, windows: 1, lit: true }) + tower(578, 198, 14, 28, cf, { roof: cf.roofA, windows: 0 }); }
  o += floatIsle(560, 214, 160, 50, 601, fadePal({ ...c0.isl, haze: c0.haze }, 0.2));
  const isA = island(560, 960, 380, 611, ci, 0.7); o += isA.svg;
  o += castle(760, edgeAt(isA.top, 760) + 12, 1, c, { towers: [[-52, 26, 104, c.roofA], [52, 28, 116, c.roofB], [0, 22, 146, c.roofA, 'back']], lit: true });
  const isB = island(0, 330, 420, 612, ci, 0.7); o += isB.svg;
  o += castle(150, edgeAt(isB.top, 150) + 10, 0.72, c, { towers: [[-46, 24, 90, c.roofB], [44, 22, 104, c.roofA]], lit: true });
  return svg(o);
}
function castleWind() {
  const c0 = PAL.wind, c = fadePal(c0, 0.2), ci = fadePal({ ...c0.isl, haze: c0.haze }, 0.12);
  let o = '';
  // a far floating islet with a tiny windmill, high
  o += floatIsle(600, 236, 120, 40, 701, fadePal({ ...c0.isl, haze: c0.haze }, 0.32), false);
  o += windmill(600, 222, 0.42, fadePal(c0, 0.42), 30);
  const isA = island(0, 400, 384, 711, ci, 0.7); o += isA.svg;
  o += windmill(110, edgeAt(isA.top, 110) + 8, 1, c, 16);
  o += castle(270, edgeAt(isA.top, 270) + 12, 0.8, c, { towers: [[-46, 24, 96, c.roofA], [46, 24, 84, c.roofB]], flagDir: 1 });
  const isB = island(600, 960, 404, 712, ci, 0.65); o += isB.svg;
  o += windmill(860, edgeAt(isB.top, 860) + 8, 0.9, c, 40);
  o += windmill(720, edgeAt(isB.top, 720) + 8, 0.66, c, 4);
  // bunting / flags on poles
  o += flagPole(380, edgeAt(isA.top, 380) + 4, 54, c, c.flag) + flagPole(790, edgeAt(isB.top, 790) + 6, 40, c, c.flag);
  return svg(o);
}
function castleSnow() {
  const c0 = PAL.snow, c = fadePal(c0, 0.12), ci = fadePal({ ...c0.isl, haze: c0.haze }, 0.1);
  c.win = c0.win; c.snowcap = mix(c0.snowcap, c0.haze, 0.08);
  let o = '';
  const isB = island(560, 960, 400, 801, ci, 0.6); o += isB.svg;
  o += castle(800, edgeAt(isB.top, 800) + 12, 0.85, c, { towers: [[-48, 24, 96, c.roofA], [48, 24, 88, c.roofB], [0, 20, 128, c.roofB, 'back']], snow: true, lit: true });
  const isA = island(0, 400, 368, 802, ci, 0.7); o += isA.svg;
  o += castle(190, edgeAt(isA.top, 190) + 12, 1.05, c, { towers: [[-52, 28, 112, c.roofB], [54, 26, 98, c.roofA], [-2, 24, 150, c.roofA, 'back']], snow: true, lit: true });
  // snow on the island tops
  for (const isl of [isA, isB]) { const t = isl.top.filter((_, i) => i % 2 === 0); o += strokeP(poly(t.map(([x, y]) => [x, y + 2])), c.snowcap, 4, ' opacity="0.8"'); }
  return svg(o);
}

// =====================================================================================
// CLOUDS (960x220, transparent, horizontally tileable: every shape is also drawn at x±960)
// =====================================================================================
function wisp(x, y, w, h, seed) {
  const r = rng(seed); let o = ell(x, y, w / 2, h * 0.16);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const px = x - w / 2 + w * (0.12 + t * 0.76), pr = h * (0.22 + r() * 0.2) * (1 - Math.abs(t - 0.5) * 0.9); o += ell(px, y - pr * 0.35, pr * 2.1, pr * 0.8); }
  o += ell(x - w * 0.42, y + h * 0.05, w * 0.3, h * 0.07) + ell(x + w * 0.38, y - h * 0.02, w * 0.34, h * 0.06);
  return o;
}
function clouds(zone, seed) {
  const c = PAL[zone].clouds; const r = rng(seed); let top = '', sh = '';
  const items = [];
  // mostly in the upper half of the strip (strip spans world y 120..340): keeps the play band clear
  for (let i = 0; i < 6; i++) { const x = i * 160 + r() * 70, y = 34 + r() * 70 + (i % 2) * 20, w = 140 + r() * 140, h = 30 + r() * 22; items.push([x, y, w, h, Math.floor(r() * 9999)]); }
  if (zone === 'wind') for (let i = 0; i < 4; i++) items.push([i * 240 + r() * 80, 150 + r() * 40, 220 + r() * 120, 14, Math.floor(r() * 9999)]);
  for (const [x, y, w, h, s] of items) for (const dx of [-W, 0, W]) {
    if (x + dx + w < -20 || x + dx - w > W + 20) continue;
    sh += wisp(x + dx, y + 4, w, h, s); top += wisp(x + dx, y, w * 0.94, h * 0.9, s);
  }
  const o = `<g fill="${c.b}" opacity="${c.op * 0.8}">${sh}</g><g fill="${c.a}" opacity="${c.op}">${top}</g>`;
  return svg(o, '', W, 220);
}

// =====================================================================================
// BANK (960x150, transparent, tileable): solid soft cloud y 0..fluffy bottom (90..110)
// =====================================================================================
function bank(zone, seed) {
  const c = PAL[zone].bank; const r = rng(seed);
  const eSh = bumpEdge(0, 960, 96, seed, 50, 96, 0.22, 0.32, 1);           // shade rim: bottom 96..~110
  const eMain = bumpEdge(0, 960, 88, seed + 1, 60, 110, 0.18, 0.3, 1);    // main body: bottom 88..~104
  let o = pth(bandDown(eSh, 0), c.sh) + pth(bandDown(eMain, 0), c.base);
  o += strokeP(poly(eSh), c.out, 2.2, ' opacity="0.5"');
  // soft highlight lumps inside (wrapped at ±960)
  let hl = ''; for (let i = 0; i < 9; i++) { const x = i * 107 + r() * 40, y = 52 + r() * 22, w = 26 + r() * 30; for (const dx of [-W, 0, W]) { const X = x + dx; if (X < -70 || X > W + 70) continue; hl += `M${f(X - w)} ${f(y)}q${f(w)} ${f(-w * 0.42)} ${f(2 * w)} 0`; } }
  o += strokeP(hl, c.hi, 5, ' opacity="0.8"');
  // a faint inner shading bump row above the rim (cel step)
  let sb = ''; for (let i = 1; i < eMain.length - 1; i += 6) { const [x, y] = eMain[i]; if (y > 92) sb += `M${f(x - 10)} ${f(y - 8)}q10 5 20 0`; }
  o += strokeP(sb, c.sh, 2.2, ' opacity="0.6"');
  if (zone === 'rain') {
    // little drips hanging off the rim (pale, soft)
    let d = ''; for (let i = 0; i < 7; i++) { const x = 40 + i * 137 + r() * 20, y = edgeAt(eSh, x) - 2; d += `M${f(x - 5)} ${f(y)}q1 12 5 15q4 -3 5 -15Z`; }
    o += pth(d, c.sh, ` stroke="${c.out}" stroke-width="1.4" stroke-opacity="0.5"`);
  }
  if (zone === 'snow') {
    // tiny frosty icicles + snow speckles
    let ic = ''; for (let i = 0; i < 10; i++) { const x = 30 + i * 96 + r() * 30, y = edgeAt(eSh, x) - 2, L = 6 + r() * 7; ic += `M${f(x - 3)} ${f(y)}L${f(x)} ${f(y + L)}L${f(x + 3)} ${f(y)}Z`; }
    o += pth(ic, '#f6f8ff', ` stroke="${c.out}" stroke-width="1.1" stroke-linejoin="round" stroke-opacity="0.7"`);
    let sp = ''; for (let i = 0; i < 40; i++) { const x = 6 + r() * 948, y = 10 + r() * 70; sp += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 1.2)}"/>`; }
    o += `<g fill="#ffffff" opacity="0.85">${sp}</g>`;
  }
  return svg(o, '', W, 150);
}

// =====================================================================================
// GROUND (960x540, transparent above the cloud floor). Top edge 468..500, avg ~492.
// =====================================================================================
const floorBig = x => (x < 110 || x > 850 ? 2.4 : 1); // taller fluffy bumps only at the outer edges
function groundEdge(seed) { return bumpEdge(-10, 970, 498, seed, 46, 84, 0.14, 0.3, -1, floorBig); }
function groundBase(c, seed) {
  const e = groundEdge(seed);
  const defs = lin('gg', [[0, c.top], [0.25, c.mid], [1, c.bot]]);
  let o = pth(bandUp(e, 541), 'url(#gg)');
  // cel shade: a second bumpy band lower down
  const e2 = bumpEdge(-10, 970, 524, seed + 7, 60, 110, 0.12, 0.22, -1);
  o += pth(bandUp(e2, 541), c.sh, ' opacity="0.55"');
  o += strokeP(poly(e), c.out, 3);
  // thin highlight just under the top of each bump
  const hi = e.map(([x, y]) => [x, y + 4]);
  let hl = ''; for (let i = 6; i < hi.length - 6; i += 14) hl += `M${f(hi[i - 3][0])} ${f(hi[i - 3][1])}L${f(hi[i][0])} ${f(hi[i][1])}L${f(hi[i + 3][0])} ${f(hi[i + 3][1])}`;
  o += strokeP(hl, c.hi, 3, ' opacity="0.9"');
  return { e, defs, o };
}
function puffTuft(x, y, s, c) { // small fluffy cloud bumps near the outer edges
  return `<g stroke="${c.out}" stroke-width="2.2">${circ(x - 12 * s, y, 11 * s, c.top)}${circ(x + 10 * s, y + 1, 10 * s, c.top)}${circ(x, y - 7 * s, 13 * s, c.top)}</g>` +
    `<g fill="${c.top}">${circ(x - 12 * s, y, 9.9 * s, c.top).replace(` fill="${c.top}"`, '')}${circ(x + 10 * s, y + 1, 8.9 * s, c.top).replace(` fill="${c.top}"`, '')}${circ(x, y - 7 * s, 11.9 * s, c.top).replace(` fill="${c.top}"`, '')}</g>` +
    ell(x - 3 * s, y - 13 * s, 6 * s, 2.6 * s, c.hi, ' opacity="0.9"');
}
function groundSunny() {
  const c = PAL.sunny.gr; const r = rng(51);
  const { e, defs, o: base } = groundBase(c, 52); let o = base;
  o += puffTuft(40, 520, 1, c) + puffTuft(924, 522, 0.9, c);
  // a couple of tiny sky flowers at the far edges (pastel)
  for (const [x, col] of [[78, '#ffc0d4'], [890, '#c8d0ff']]) { const y = edgeAt(e, x) + 16; let p = ''; for (let i = 0; i < 5; i++) { const a = i * 1.2566; p += circ(x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, 2.6, col); } o += `<g stroke="${mix(col, '#5a5a8a', 0.4)}" stroke-width="0.9">${p}</g>` + circ(x, y, 1.8, '#fff4d8'); }
  void r; return { svg: svg(o, defs), e };
}
function groundRain() {
  const c = PAL.rain.gr; const r = rng(61);
  const { e, defs, o: base } = groundBase(c, 62); let o = base;
  // small shiny puddles low on the floor (below Shelly's band)
  for (const [x, y, s] of [[110, 522, 1], [330, 530, 0.8], [600, 526, 0.9], [850, 520, 1.1]]) {
    o += ell(x, y, 30 * s, 6.5 * s, '#a9b8e0', ` stroke="#8481aa" stroke-width="1.6"`) + ell(x - 6 * s, y - 1.5 * s, 14 * s, 2 * s, '#e8f0ff', ' opacity="0.85"') + ell(x + 14 * s, y + 1, 4 * s, 1.2, '#e8f0ff', ' opacity="0.6"');
  }
  o += puffTuft(30, 518, 0.9, c) + puffTuft(934, 520, 0.85, c);
  void r; return { svg: svg(o, defs), e };
}
function groundWind() {
  const c = PAL.wind.gr; const r = rng(71);
  const { e, defs, o: base } = groundBase(c, 72); let o = base;
  // swirly wind marks drawn into the cloud floor (very soft)
  let sw = ''; for (const [x, y] of [[160, 520], [420, 528], [690, 522], [880, 530]]) sw += `M${x - 26} ${y}q14 -8 30 -2q10 4 4 -4`;
  o += strokeP(sw, c.out, 2, ' opacity="0.35"');
  o += puffTuft(36, 520, 1, c) + puffTuft(926, 518, 0.95, c);
  // two little pastel petals resting at the edges
  for (const [x, y, a, col] of [[86, 526, 20, '#ffc6d2'], [870, 528, -30, '#c8e6e4']]) o += ell(x, y, 6, 3, col, ` stroke="${mix(col, '#6a5a7a', 0.45)}" stroke-width="1" transform="rotate(${a} ${x} ${y})"`);
  void r; return { svg: svg(o, defs), e };
}
function groundSnow() {
  const c = PAL.snow.gr; const r = rng(81);
  const { e, defs, o: base } = groundBase(c, 82); let o = base;
  // icy sheen streaks + tiny sparkles (small, white-blue)
  let ice = ''; for (let i = 0; i < 9; i++) { const x = 40 + i * 104 + r() * 30, y = 514 + r() * 18; ice += `M${f(x)} ${f(y)}h${f(28 + r() * 30)}`; }
  o += strokeP(ice, '#ffffff', 2.4, ' opacity="0.75"');
  let sp = ''; for (let i = 0; i < 14; i++) { const x = 20 + r() * 920, y = 508 + r() * 26; sp += twinkle(x, y, 2.2 + r() * 2); }
  o += pth(sp, '#ffffff', ' opacity="0.95"');
  // snow drifts at the outer edges + tiny icicle sparkle crystals
  o += puffTuft(36, 518, 1.05, c) + puffTuft(928, 520, 1, c);
  for (const [x, s] of [[82, 1], [880, 0.8]]) { const y = edgeAt(e, x) + 8; o += pth(`M${f(x - 4 * s)} ${f(y)}L${f(x - 2 * s)} ${f(y - 14 * s)}L${f(x + 1 * s)} ${f(y - 18 * s)}L${f(x + 4 * s)} ${f(y - 12 * s)}L${f(x + 4 * s)} ${f(y)}Z`, '#cfe4ff', ` stroke="#7b84c4" stroke-width="1.3" stroke-linejoin="round"`); }
  return { svg: svg(o, defs), e };
}

// =====================================================================================
// PARTICLES (32x32 centred, soft transparent edges)
// =====================================================================================
const P = {};
const ps = (body, defs = '') => svg(body, defs, 32, 32);
const glow = (id, col, a = 0.8) => rad(id, [[0, col, a], [1, col, 0]]);
P.sparkle = ps(`<circle cx="16" cy="16" r="13" fill="url(#g)"/><path d="${twinkle(16, 16, 14, 0.13)}" fill="#ffffff" stroke="#ffe08a" stroke-width="1"/><path d="${twinkle(16, 16, 6.5, 0.2)}" fill="#fffbe6"/>`, glow('g', '#fff6c8', 0.85));
P.twinkle = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><path d="${twinkle(16, 16, 10, 0.18)}" fill="#ffffff"/><path d="${twinkle(16, 16, 6, 0.3)}" fill="#fff8d8" transform="rotate(45 16 16)" opacity="0.8"/><circle cx="16" cy="16" r="2.2" fill="#ffffff"/>`, glow('g', '#fff2b8', 0.7));
P.puff = ps(`<g fill="#d6dcec" opacity="0.8"><circle cx="11" cy="19.5" r="6.5"/><circle cx="17.5" cy="14.5" r="7.5"/><circle cx="22.5" cy="20" r="6"/><circle cx="16" cy="22.5" r="5.5"/></g><g fill="#ffffff" opacity="0.95"><circle cx="11" cy="18.5" r="5.4"/><circle cx="17" cy="13.5" r="6.4"/><circle cx="21.5" cy="18.8" r="5"/><circle cx="16" cy="20.5" r="4.6"/></g>`);
P.rain = ps(`<path d="M16 4C17.8 10 20.5 15 20.5 20.5A4.5 4.5 0 0 1 11.5 20.5C11.5 15 14.2 10 16 4Z" fill="#a8d8fa" stroke="#5a8fcc" stroke-width="1.4" stroke-linejoin="round"/><path d="M13.8 20Q13.9 16.5 15.2 13.6" fill="none" stroke="#f0faff" stroke-width="1.6" stroke-linecap="round"/>`);
P.splash = ps(`<ellipse cx="16" cy="25" rx="11" ry="3" fill="#a8d8fa" opacity="0.55"/><path d="M6 25Q7 17 9 15M11 24Q12 15 13 11M16 24V9M21 24Q20 15 19 11M26 25Q25 17 23 15" fill="none" stroke="#a8d8fa" stroke-width="2.4" stroke-linecap="round"/><g fill="#d8f0ff" stroke="#5a8fcc" stroke-width="0.9"><circle cx="9" cy="13" r="1.8"/><circle cx="13" cy="9" r="1.7"/><circle cx="16" cy="6.5" r="2"/><circle cx="19" cy="9" r="1.7"/><circle cx="23" cy="13" r="1.8"/></g>`);
{
  let arms = ''; for (let i = 0; i < 6; i++) { const a = i * 60; arms += `<g transform="rotate(${a} 16 16)"><path d="M16 16V4M16 8l-3 -3M16 8l3 -3M16 12l-2.4 -2.2M16 12l2.4 -2.2"/></g>`; }
  P.snowflake = ps(`<circle cx="16" cy="16" r="14" fill="url(#g)"/><g fill="none" stroke="#9fb0e8" stroke-width="3.4" stroke-linecap="round" opacity="0.55">${arms}</g><g fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round">${arms}</g><circle cx="16" cy="16" r="2.4" fill="#ffffff"/>`, glow('g', '#ffffff', 0.35));
}
P.streak = ps(`<path d="M2 14Q10 11 18 13.5T30 13" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.85"/><path d="M7 19Q14 17 22 18.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.55"/><path d="M26 13q4 0 3 -3q-1 -2 -3 -1" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`);
P.petal = ps(`<path d="M6 20C8 11 17 6 26 9C24 17 15 23 6 20Z" fill="#ffc6d6" stroke="#d6849e" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 19Q15 14 23 10.5" fill="none" stroke="#fff0f4" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/><path d="M6 20Q9 19 10 21" fill="none" stroke="#d6849e" stroke-width="1" stroke-linecap="round"/>`);
P.zap = ps(`<circle cx="16" cy="16" r="13" fill="url(#g)"/><path d="M18.5 3L9 17.5H15L12.5 29L23 13.5H16.8Z" fill="#ffe14a" stroke="#c48a10" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 6.5L12 15" fill="none" stroke="#fff8c8" stroke-width="1.5" stroke-linecap="round"/>`, glow('g', '#fff2a0', 0.6));
P.mote = ps(`<circle cx="16" cy="16" r="12" fill="url(#g)"/><circle cx="16" cy="16" r="3.2" fill="#fffbe8"/><circle cx="15" cy="15" r="1.2" fill="#ffffff"/>`, glow('g', '#fff4cc', 0.75));

// ---------- palette.json (banner, accent, HUD pill background readable on that sky, average sky colour) ----------
// "sky" = measured mean of sky.svg (printed by sheet.js)
const PALETTE_JSON = {
  sunny: { banner: '#3f8fd8', accent: '#ffc93c', hud: '#2f679c', sky: '#97caec' },
  rain: { banner: '#6f68ae', accent: '#8fd0ff', hud: '#4d4a7e', sky: '#9b98bb' },
  wind: { banner: '#e8835e', accent: '#2fa6aa', hud: '#2f7c84', sky: '#bebeb8' },
  snow: { banner: '#5a49a8', accent: '#a8dcff', hud: '#2f2a66', sky: '#6e63a0' },
};

// ---------- write ----------
const G = { sunny: groundSunny(), rain: groundRain(), wind: groundWind(), snow: groundSnow() };
const files = {
  'zones/sunny/sky.svg': skySunny(), 'zones/sunny/castle.svg': castleSunny(), 'zones/sunny/clouds.svg': clouds('sunny', 101), 'zones/sunny/bank.svg': bank('sunny', 111), 'zones/sunny/ground.svg': G.sunny.svg,
  'zones/rain/sky.svg': skyRain(), 'zones/rain/castle.svg': castleRain(), 'zones/rain/clouds.svg': clouds('rain', 202), 'zones/rain/bank.svg': bank('rain', 212), 'zones/rain/ground.svg': G.rain.svg,
  'zones/wind/sky.svg': skyWind(), 'zones/wind/castle.svg': castleWind(), 'zones/wind/clouds.svg': clouds('wind', 303), 'zones/wind/bank.svg': bank('wind', 313), 'zones/wind/ground.svg': G.wind.svg,
  'zones/snow/sky.svg': skySnow(), 'zones/snow/castle.svg': castleSnow(), 'zones/snow/clouds.svg': clouds('snow', 404), 'zones/snow/bank.svg': bank('snow', 414), 'zones/snow/ground.svg': G.snow.svg,
  'zones/palette.json': JSON.stringify(PALETTE_JSON, null, 2) + '\n',
};
for (const k of Object.keys(P)) files['particles/' + k + '.svg'] = P[k];
for (const [rel, data] of Object.entries(files)) {
  if (/<text|<script|<image|href=|@import|url\((?!#)/.test(data)) throw new Error('forbidden content in ' + rel);
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  const kb = Buffer.byteLength(data) / 1024; console.log(rel.padEnd(30), kb.toFixed(1) + ' KB', kb >= 60 ? 'TOO BIG' : '');
}
for (const z of Object.keys(G)) { const e = G[z].e.filter(p => p[0] >= 0 && p[0] <= 960); const ys = e.map(p => p[1]); console.log(`ground ${z}: top edge min ${Math.min(...ys).toFixed(1)} max ${Math.max(...ys).toFixed(1)} avg ${edgeAvg(e).toFixed(1)}`); }
module.exports = { PAL, PALETTE_JSON };
