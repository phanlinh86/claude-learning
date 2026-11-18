// Taffy's Candy Reel: environment art generator (4 weather levels on the Fizzy Soda Lake + dock gap + particles).
// Writes original, hand-authored SVGs (seeded, deterministic). No <text>, fonts, scripts, <image> or external refs.
// Usage: node gen.js [assetsDir]
// Contract: docs/DESIGN.md §2, §3, §4.2, §4.3.
//  - levels/<lvl>/sky.svg    960x200 opaque, tiles in x.
//  - levels/<lvl>/far.svg    960x200 transparent above the shore, tiles in x. Candy shore base ≈ y140, then a strip of
//                            distant lake (water-top colour) down to y200 (hidden by the dock / water.svg below y150/170).
//  - levels/<lvl>/dock.svg   960x80  transparent above y4; icing deck top at y10 (= SURFACE_Y), wafer slab to ≈ y47,
//                            candy-cane posts every 160 px (x = 80 + 160k) down to ≈ y66.
//  - levels/<lvl>/water.svg  960x400 opaque, soft only (stretched).
//  - levels/<lvl>/reef.svg   960x320 transparent, sugar-sand bed top ≈ y286 (= FLOOR_Y), x 320–640 kept ≤ 30 px tall.
//  - dock_gap.svg 96x80 (gap x 16..80, svg y10 = SURFACE_Y), particles/*.svg 32x32.
// Tileability: every edge-crossing shape is emitted again at ±960; every horizon / icing / sand profile is a sum of
// sines with whole periods over 960 px, so the first and last sample are identical.
// Colour rule: candy-saturated pink / lime / purple / orange / gold live on the shore and in the sky only. Under water
// everything is pale (sugar sand, clear rock candy) or muted toward the water colour, and the calm play column
// (x 320–640) holds nothing but sand, pale pebbles and tiny clear crystals.
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const W = 960;
const f = n => (Math.round(n * 10) / 10).toString();

// ---------- helpers ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dark = (c, t = 0.42) => mix(c, '#2a1838', t);   // outline / shade: a dark plum tone of the fill, never black
const lite = (c, t = 0.35) => mix(c, '#ffffff', t);
const OL = (c, w = 3) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra}/>`;
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stk = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
const rad = (id, s, extra = '') => `<radialGradient id="${id}"${extra}>${stops(s)}</radialGradient>`;
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${extra}>${stops(s)}</linearGradient>`;
const star5 = (cx, cy, R, r, rot = -90) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; };
const twinkle = (cx, cy, R, k = 0.22) => { // 4-point concave sparkle
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, nx = cx + Math.cos(b) * R, ny = cy + Math.sin(b) * R;
    const m = a + Math.PI / 4, qx = cx + Math.cos(m) * R * k, qy = cy + Math.sin(m) * R * k;
    d += (i ? '' : `M${f(x)} ${f(y)}`) + `Q${f(qx)} ${f(qy)} ${f(nx)} ${f(ny)}`;
  }
  return d + 'Z';
};
// emit fn(X) for every horizontal copy (x, x±960) whose [X-rr, X+rr] touches the tile
const wrap = (x, rr, fn) => [-W, 0, W].map(dx => x + dx).filter(X => X + rr > 0 && X - rr < W).map(fn).join('');
// periodic profile: base + Σ a·sin(2π k x / 960 + p)  (k integer => seamless)
const prof = (base, terms) => x => base + terms.reduce((s, [a, k, p]) => s + a * Math.sin(2 * Math.PI * k * x / W + p), 0);
const profPath = (fy, yBottom, step = 6, x0 = 0, x1 = W) => { let d = `M${x0} ${yBottom}`; for (let x = x0; x <= x1 + 0.01; x += step) d += `L${f(x)} ${f(fy(x))}`; return d + `L${x1} ${yBottom}Z`; };
const profLine = (fy, step = 6, x0 = 0, x1 = W) => { let d = ''; for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + f(x) + ' ' + f(fy(x)); return d; };
const poly = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const write = (rel, s) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const rmrf = rel => { const p = path.join(OUT, rel); if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); };

// =====================================================================================
// PALETTES
// =====================================================================================
// candy: shore colours (pink, lime, purple, orange, gold, mint, sky-blue); haze: what distance / weather mixes in.
const CANDY = { pink: '#ff8cc6', lime: '#a6e05a', purple: '#b88cf0', orange: '#ffaa5e', gold: '#ffd75e', mint: '#7fe0c4', blue: '#7cc8ff', red: '#ef4f6a' };
const PAL = {
  sunny: { // bright midday
    sky: [['0', '#4cb6f0'], ['0.6', '#a4e1fb'], ['1', '#eafaff']],
    cloud: '#ffffff', cloudSh: '#ffd3ea', cloudSh2: '#cfe9ff',
    haze: '#eafaff', hazeK: 0, farHaze: 0.38,
    ground: '#bff0c8', groundSh: '#8fd6ab',
    water: ['#8fe3e0', '#2f9bb5'], rays: 0.24,
    wafer: '#ebb768', waferD: '#c0843b', waferL: '#f8d99c', cream: '#fff3dc', icing: '#fffaf3', icingSh: '#f3dcc8',
    sand: '#f5ead0', sandSh: '#dcc9a1', crystal: '#e9fbff', crystalSh: '#a9dbe8', under: 0.55,
  },
  rain: { // soft pink-grey drizzle
    sky: [['0', '#a8919f'], ['0.5', '#cdb6c2'], ['1', '#ead9df']],
    cloud: '#bea6b6', cloudSh: '#9b8296', cloudSh2: '#d8c4cf',
    haze: '#c7b5bf', hazeK: 0.45, farHaze: 0.5,
    ground: '#b9d6c0', groundSh: '#93b7a3',
    water: ['#7cc4cf', '#2e6f8f'], rays: 0,
    wafer: '#d9a65e', waferD: '#a36d33', waferL: '#ecc98c', cream: '#f6e8d6', icing: '#fbf3ee', icingSh: '#e2cdc6',
    sand: '#dcd6cb', sandSh: '#b9b0a2', crystal: '#e2f1f5', crystalSh: '#9cc1cc', under: 0.5,
  },
  wind: { // bright, breezy, streaky
    sky: [['0', '#1f86d8'], ['0.5', '#5cbcf0'], ['0.85', '#b6e8fb'], ['1', '#e4f7ff']],
    cloud: '#ffffff', cloudSh: '#d6ecfb', cloudSh2: '#ffe6f2',
    haze: '#dcf5ff', hazeK: 0.1, farHaze: 0.4,
    ground: '#c7efc0', groundSh: '#9ad6a4',
    water: ['#86dcd6', '#2a8aa6'], rays: 0.16,
    wafer: '#ebb768', waferD: '#c0843b', waferL: '#f8d99c', cream: '#fff3dc', icing: '#fffaf3', icingSh: '#efd9c6',
    sand: '#f0e4c8', sandSh: '#d5c299', crystal: '#e6faff', crystalSh: '#a3d6e4', under: 0.55,
  },
  snow: { // lilac evening, lit windows
    sky: [['0', '#2c2766'], ['0.45', '#5a4996'], ['0.8', '#a684c4'], ['1', '#e6b8d2']],
    cloud: '#8a78b8', cloudSh: '#6a5a9c', cloudSh2: '#b9a3d6',
    haze: '#5c4f94', hazeK: 0.42, farHaze: 0.45,
    ground: '#eef0ff', groundSh: '#b9b8e2',
    water: ['#4f7fb8', '#1c2e63'], rays: 0,
    wafer: '#c99a66', waferD: '#8e6146', waferL: '#e0bd8e', cream: '#f2e6e6', icing: '#f7f6ff', icingSh: '#c8c4e8',
    sand: '#8e93c2', sandSh: '#666b9e', crystal: '#d6ecff', crystalSh: '#7f9fd6', under: 0.55,
  },
};
const LVLS = Object.keys(PAL);
const tone = (P, c) => mix(c, P.haze, P.hazeK);          // weather mood on candy colours
const farTone = (P, c) => mix(tone(P, c), P.sky[P.sky.length - 1][1], P.farHaze); // distance haze (back hills)

// =====================================================================================
// SKY 960x200 (opaque, tileable)
// =====================================================================================
function puffCloud(x, y, s, P, flat = 1) {
  // cotton-candy cumulus: flat-ish bottom, 5 lobes; a soft tinted underside + top highlight
  const lobes = [[-1.0, 0.1, 0.55], [-0.45, -0.32, 0.75], [0.2, -0.45, 0.85], [0.8, -0.15, 0.62], [1.15, 0.12, 0.45]];
  let body = '';
  for (const [dx, dy, rr] of lobes) body += ell(x + dx * s, y + dy * s * flat, rr * s, rr * s * flat, P.cloud);
  body += rect(x - 1.15 * s, y - 0.05 * s, 2.5 * s, 0.5 * s, P.cloud, ` rx="${f(0.25 * s)}"`);
  const shade = ell(x + 0.08 * s, y + 0.32 * s, 1.22 * s, 0.16 * s, P.cloudSh, ' opacity="0.95"') + ell(x - 0.55 * s, y + 0.25 * s, 0.45 * s, 0.1 * s, P.cloudSh2, ' opacity="0.9"');
  const hl = ell(x + 0.05 * s, y - 0.75 * s * flat, 0.38 * s, 0.13 * s, '#ffffff', ' opacity="0.6"');
  return `<g>${body}${shade}${hl}</g>`;
}
function streak(x, y, len, th, col, a) { // long wind-stretched cloud: tapered capsule + a thinner one on top
  const d = (cx, cy, L, T) => `M${f(cx - L / 2)} ${f(cy)}Q${f(cx - L * 0.3)} ${f(cy - T)} ${f(cx)} ${f(cy - T)}L${f(cx + L * 0.32)} ${f(cy - T * 0.8)}Q${f(cx + L / 2 + T)} ${f(cy - T * 0.4)} ${f(cx + L / 2)} ${f(cy + T * 0.25)}Q${f(cx)} ${f(cy + T * 0.7)} ${f(cx - L / 2)} ${f(cy)}Z`;
  return `<g opacity="${a}">${pth(d(x, y, len, th), col)}${pth(d(x + len * 0.12, y - th * 0.9, len * 0.55, th * 0.7), col)}</g>`;
}
function sky(L) {
  const P = PAL[L], li = LVLS.indexOf(L), r = rng(11 + li * 97);
  let defs = lin('sk', P.sky), b = rect(0, 0, W, 200, 'url(#sk)');
  if (L === 'sunny') {
    defs += rad('sg', [['0', '#fffbe0', 0.95], ['0.3', '#fff1b8', 0.55], ['1', '#fff1b8', 0]]);
    b += wrap(760, 110, X => {
      let o = circ(X, 52, 110, 'url(#sg)');
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.1; o += stk(`M${f(X + Math.cos(a) * 36)} ${f(52 + Math.sin(a) * 36)}L${f(X + Math.cos(a) * 50)} ${f(52 + Math.sin(a) * 50)}`, '#fff0a8', 5, ' opacity="0.7"'); }
      return o + circ(X, 52, 28, '#fff3b0', OL('#ffd36a', 3)) + circ(X, 52, 22, '#fff8d6') + ell(X - 9, 43, 8, 5, '#ffffff', ' opacity="0.8"');
    });
    { // soft pastel rainbow arc behind the clouds
      const cols = [CANDY.red, CANDY.orange, CANDY.gold, CANDY.lime, CANDY.blue, CANDY.purple];
      b += `<g opacity="0.42">` + cols.map((c, i) => stk(`M${150 + i * 7} 190A${150 - i * 7} ${150 - i * 7} 0 0 1 ${450 - i * 7} 190`, c, 7.5)).join('') + '</g>';
    }
    for (const [x, y, s] of [[110, 64, 28], [330, 112, 17], [520, 44, 22], [900, 104, 24], [640, 138, 13], [250, 30, 12]]) b += wrap(x, s * 1.7, X => puffCloud(X, y, s, P));
  } else if (L === 'rain') {
    // a heavy, soft blanket of rain clouds: three overlapping rows of round lobes, darker at the back
    const base = prof(70, [[8, 2, 0.4], [5, 5, 1.9], [2, 9, 0.7]]);
    b += pth(profPath(x => base(x) - 34, 0, 6), P.cloudSh);
    const rows = [[-34, 30, P.cloudSh, 0], [-18, 26, mix(P.cloudSh, P.cloud, 0.5), 1], [-2, 22, P.cloud, 2]];
    for (const [dy, R, col, k] of rows) {
      for (let i = 0; i < 24; i++) {
        const x = i * 40 + 13 * k + 9 * Math.sin(i * 2.3 + k), rr = R * (0.8 + 0.35 * Math.abs(Math.sin(i * 1.7 + k * 0.9))), y = base(x) + dy;
        b += wrap(x, rr + 2, X => circ(X, y, rr, col) + (k === 2 && i % 3 === 0 ? ell(X - rr * 0.2, y - rr * 0.55, rr * 0.4, rr * 0.13, '#ffffff', ' opacity="0.35"') : ''));
      }
    }
    for (const [x, y, l] of [[140, 118, 190], [470, 132, 150], [760, 112, 210]]) b += wrap(x, l / 2 + 20, X => streak(X, y, l, 9, P.cloudSh2, 0.8));
    // soft rain veils under the cloud base (very faint diagonal bands)
    defs += lin('rv', [['0', '#8f7690', 0.22], ['1', '#8f7690', 0]]);
    for (let i = 0; i < 8; i++) { const x = i * 120 + 40; b += wrap(x, 60, X => pth(`M${f(X)} ${f(base(x) + 12)}L${f(X + 40)} ${f(base(x) + 12)}L${f(X + 10)} 200L${f(X - 30)} 200Z`, 'url(#rv)')); }
  } else if (L === 'wind') {
    for (const [x, y, l, t, a] of [[90, 40, 260, 11, 0.95], [420, 72, 320, 13, 0.95], [760, 32, 240, 10, 0.9], [250, 118, 220, 9, 0.85], [640, 140, 280, 9, 0.8], [910, 96, 180, 8, 0.85]])
      b += wrap(x, l / 2 + t + 4, X => streak(X, y + 4, l * 0.9, t, P.cloudSh, a * 0.7) + streak(X, y, l, t, P.cloud, a));
    // breeze swooshes
    for (const [x, y, l] of [[200, 90, 90], [560, 108, 110], [860, 56, 80], [40, 150, 70], [430, 30, 70]])
      b += wrap(x, l / 2 + 12, X => stk(`M${f(X - l / 2)} ${f(y)}Q${f(X)} ${f(y - 9)} ${f(X + l / 2)} ${f(y - 2)}Q${f(X + l / 2 + 14)} ${f(y)} ${f(X + l / 2 + 6)} ${f(y + 8)}Q${f(X + l / 2 - 2)} ${f(y + 10)} ${f(X + l / 2 - 6)} ${f(y + 5)}`, '#ffffff', 2.6, ' opacity="0.7"'));
    // tufts of candy floss blown across the sky, each with a little trail
    for (const [x, y, s] of [[150, 64, 1], [520, 150, 0.8], [700, 90, 1.1], [880, 160, 0.7], [360, 40, 0.7]])
      b += wrap(x, 50, X => stk(`M${f(X - 46 * s)} ${f(y + 2)}Q${f(X - 24 * s)} ${f(y - 4)} ${f(X - 8 * s)} ${f(y)}`, '#ffffff', 2, ' opacity="0.65"')
        + circ(X - 4 * s, y + 1, 6 * s, '#ffd1e8') + circ(X + 4 * s, y - 2, 7 * s, '#ffe3f1') + circ(X + 9 * s, y + 3, 5 * s, '#ffc4e1') + ell(X + 1, y - 5 * s, 3 * s, 1.5 * s, '#ffffff', ' opacity="0.9"'));
    // a small pale sun hidden behind the breeze
    defs += rad('sg', [['0', '#fffbe6', 0.85], ['1', '#fffbe6', 0]]);
    b += wrap(300, 60, X => circ(X, 36, 60, 'url(#sg)') + circ(X, 36, 18, '#fffbe2', ' opacity="0.95"'));
  } else { // snow evening
    for (let i = 0; i < 70; i++) { const x = r() * W, y = 3 + r() * 90, s = 0.6 + r() * 1.2; b += wrap(x, 4, X => circ(X, y, s, '#fff6ff', ` opacity="${f(0.4 + r() * 0.55)}"`)); }
    for (const [x, y, s] of [[150, 22, 6], [610, 40, 5], [830, 16, 7], [380, 64, 4]]) b += wrap(x, s + 2, X => pth(twinkle(X, y, s), '#fff4fb', ' opacity="0.95"'));
    defs += rad('mg', [['0', '#fff6e0', 0.5], ['1', '#fff6e0', 0]]);
    b += wrap(470, 56, X => circ(X, 44, 56, 'url(#mg)') + pth(`M${X} 26A18 18 0 1 0 ${X} 62A22 22 0 0 1 ${X} 26Z`, '#fff3d6', OL('#e6c79a', 2)));
    // soft snow clouds low in the sky (translucent, lilac)
    for (const [x, y, s] of [[90, 120, 26], [330, 140, 20], [600, 112, 28], [850, 132, 22]]) b += wrap(x, s * 1.7, X => `<g opacity="0.75">${puffCloud(X, y, s, P, 0.6)}</g>`);
    for (const [x, y, l] of [[220, 96, 200], [720, 84, 170]]) b += wrap(x, l / 2 + 12, X => streak(X, y, l, 6, P.cloudSh2, 0.45));
  }
  return svg(W, 200, b, defs);
}

// =====================================================================================
// FAR 960x200 (tileable): gumdrop hills, lollipop trees, candy-cane fence, gingerbread houses; shore base ≈ y140,
// distant lake from there down (water-top colour) so the dock sits on the lake.
// =====================================================================================
function gumdrop(x, base, w, h, c, P, opt = {}) {
  const ys = t => base - h * Math.pow(Math.max(0, 1 - t * t), 0.45);
  const pts = []; for (let i = 0; i <= 24; i++) { const t = -1 + i / 12; pts.push([x + t * w / 2, ys(t)]); }
  let o = pth(poly(pts), c, opt.ol === false ? '' : OL(dark(c, 0.3), opt.olw || 2));
  // cel shade (right side) + highlight
  const sh = []; for (let i = 0; i <= 12; i++) { const t = 0.3 + 0.7 * i / 12; sh.push([x + t * w / 2, ys(t)]); }
  sh.push([x + w * 0.2, base]);
  o += pth(poly(sh), dark(c, 0.14), ' opacity="0.6"');
  o += stk(`M${f(x - w * 0.3)} ${f(ys(-0.6) + 3)}Q${f(x - w * 0.22)} ${f(ys(-0.25) + 1)} ${f(x - w * 0.06)} ${f(ys(-0.05) + 3)}`, '#ffffff', Math.max(1.5, w * 0.03), ' opacity="0.55"');
  if (opt.dots) { const rr = rng(Math.floor(x * 7 + w)); for (let i = 0; i < w / 6; i++) { const t = -0.8 + rr() * 1.6, yy = ys(t) + 3 + rr() * (base - ys(t) - 5); o += circ(x + t * w / 2, yy, 0.9, '#ffffff', ' opacity="0.7"'); } }
  if (opt.cap) { // snow cap
    const cp = []; for (let i = 0; i <= 16; i++) { const t = -0.78 + 1.56 * i / 16; cp.push([x + t * w / 2, ys(t) - 0.8]); }
    for (let i = 16; i >= 0; i--) { const t = -0.78 + 1.56 * i / 16; cp.push([x + t * w / 2, Math.max(ys(t), base - h * 0.66 + 2.5 * Math.sin(i * 1.9))]); }
    o += pth(poly(cp), '#fbfbff', OL('#c3c0e6', 1.4));
  }
  return o;
}
function spiralD(cx, cy, R, turns = 2.6) {
  let d = ''; const n = Math.round(turns * 20);
  for (let i = 0; i <= n; i++) { const th = i / n * turns * Math.PI * 2, rr = R * i / n; d += (i ? 'L' : 'M') + f(cx + Math.cos(th) * rr) + ' ' + f(cy + Math.sin(th) * rr); }
  return d;
}
function lollipop(x, base, h, R, c1, c2, opt = {}) {
  const lean = opt.lean || 0, tx = x + lean, ty = base - h;
  const stick = opt.stick || '#fff6ec';
  let o = stk(`M${f(x)} ${f(base)}Q${f(x + lean * 0.2)} ${f(base - h * 0.5)} ${f(tx)} ${f(ty)}`, dark(stick, 0.35), R * 0.26 + 2) + stk(`M${f(x)} ${f(base)}Q${f(x + lean * 0.2)} ${f(base - h * 0.5)} ${f(tx)} ${f(ty)}`, stick, R * 0.26);
  o += circ(tx, ty, R, c1, OL(dark(c1, 0.35), opt.olw || 2));
  o += stk(spiralD(tx, ty, R * 0.86, 2.4), c2, R * 0.24, ' opacity="0.95"');
  o += ell(tx - R * 0.38, ty - R * 0.42, R * 0.28, R * 0.16, '#ffffff', ' opacity="0.7"');
  if (opt.cap) o += pth(`M${f(tx - R * 0.9)} ${f(ty - R * 0.3)}Q${f(tx)} ${f(ty - R * 1.35)} ${f(tx + R * 0.9)} ${f(ty - R * 0.3)}Q${f(tx + R * 0.4)} ${f(ty - R * 0.55)} ${f(tx)} ${f(ty - R * 0.45)}Q${f(tx - R * 0.5)} ${f(ty - R * 0.6)} ${f(tx - R * 0.9)} ${f(ty - R * 0.3)}Z`, '#fbfbff', OL('#c3c0e6', 1));
  return o;
}
function cane(x, base, h, w, red, dir = 1, opt = {}) { // candy cane: white with dashed red stripes, hook at the top
  const r = w * 1.3, top = base - h + r;
  const d = `M${f(x)} ${f(base)}V${f(top)}A${f(r)} ${f(r)} 0 0 ${dir > 0 ? 1 : 0} ${f(x + 2 * r * dir)} ${f(top)}V${f(top + r * 0.6)}`;
  return stk(d, opt.ol || dark(red, 0.4), w + 1.8) + stk(d, '#fffaf6', w) + `<path d="${d}" fill="none" stroke="${red}" stroke-width="${f(w)}" stroke-dasharray="${f(w * 0.75)} ${f(w * 0.75)}"/>`;
}
function fence(x0, x1, base, P, opt = {}) {
  const red = tone(P, CANDY.red), rail = tone(P, '#fff3f6');
  let o = '';
  for (const yy of [base - 6, base - 11]) o += stk(`M${f(x0)} ${f(yy)}H${f(x1)}`, dark(rail, 0.35), 3.4) + stk(`M${f(x0)} ${f(yy)}H${f(x1)}`, rail, 2);
  for (let x = x0; x <= x1 + 0.1; x += 14) o += cane(x, base + 1, 18, 2.6, red, opt.dir || 1);
  if (opt.cap) o += stk(`M${f(x0)} ${f(base - 12.4)}H${f(x1)}`, '#fbfbff', 2.4);
  return o;
}
function house(x, base, s, P, opt = {}) {
  const gb = tone(P, '#c98447'), roof = tone(P, '#9b5a33'), ic = tone(P, '#fffaf4'), door = tone(P, CANDY.pink);
  const ol = dark(gb, 0.4), w = 30 * s, hb = 22 * s, rh = 20 * s;
  let o = '';
  // chimney
  o += rect(x + 7 * s, base - hb - rh * 0.9, 6 * s, 12 * s, roof, OL(ol, 1.6));
  if (opt.lit) o += circ(x + 10 * s, base - hb - rh * 0.9 - 6 * s, 4 * s, '#efe8ff', ' opacity="0.6"') + circ(x + 13 * s, base - hb - rh * 0.9 - 13 * s, 5 * s, '#efe8ff', ' opacity="0.4"');
  o += rect(x - w / 2, base - hb, w, hb, gb, OL(ol, 2));
  // icing zig-zag under the roof + corner icing dots
  let zz = `M${f(x - w / 2)} ${f(base - hb + 2 * s)}`; for (let i = 1; i <= 8; i++) zz += `L${f(x - w / 2 + i * w / 8)} ${f(base - hb + (i % 2 ? 5 : 2) * s)}`;
  o += stk(zz, ic, 1.6 * s);
  // windows
  for (const wx of [x - 9 * s, x + 9 * s]) {
    if (opt.lit) o += circ(wx, base - hb * 0.55, 10 * s, '#ffd77a', ' opacity="0.28"');
    o += rect(wx - 3.5 * s, base - hb * 0.55 - 3.5 * s, 7 * s, 7 * s, opt.lit ? '#ffd56e' : tone(P, '#bfe6ff'), OL(ic, 1.4 * s) + ` rx="${f(1.2 * s)}"`);
    o += stk(`M${f(wx)} ${f(base - hb * 0.55 - 3.5 * s)}V${f(base - hb * 0.55 + 3.5 * s)}M${f(wx - 3.5 * s)} ${f(base - hb * 0.55)}H${f(wx + 3.5 * s)}`, ic, 1 * s);
  }
  // door (pink candy door with an icing arch)
  o += pth(`M${f(x - 3.5 * s)} ${f(base)}V${f(base - 8 * s)}A${f(3.5 * s)} ${f(3.5 * s)} 0 0 1 ${f(x + 3.5 * s)} ${f(base - 8 * s)}V${f(base)}Z`, opt.lit ? '#ffcf73' : door, OL(ic, 1.3 * s));
  // roof with scalloped icing edge and a gumdrop on top
  o += pth(`M${f(x - w / 2 - 5 * s)} ${f(base - hb + 1)}L${f(x)} ${f(base - hb - rh)}L${f(x + w / 2 + 5 * s)} ${f(base - hb + 1)}Z`, roof, OL(dark(roof, 0.35), 2));
  for (let i = 0; i <= 6; i++) { const t = i / 6; o += circ(x - w / 2 - 5 * s + t * (w / 2 + 5 * s), base - hb + 1 - t * rh, 2.1 * s, ic) + circ(x + t * (w / 2 + 5 * s), base - hb - rh + t * (rh + 1), 2.1 * s, ic); }
  o += stk(`M${f(x - w / 2 - 5 * s)} ${f(base - hb + 1)}L${f(x)} ${f(base - hb - rh)}L${f(x + w / 2 + 5 * s)} ${f(base - hb + 1)}`, ic, 2.2 * s);
  if (opt.cap) o += pth(`M${f(x - w / 2 - 7 * s)} ${f(base - hb + 1)}L${f(x)} ${f(base - hb - rh - 3 * s)}L${f(x + w / 2 + 7 * s)} ${f(base - hb + 1)}Q${f(x + w / 4)} ${f(base - hb - rh * 0.35)} ${f(x + w * 0.1)} ${f(base - hb - rh * 0.25)}Q${f(x - w * 0.2)} ${f(base - hb - rh * 0.45)} ${f(x - w / 2 - 7 * s)} ${f(base - hb + 1)}Z`, '#fbfbff', OL('#c3c0e6', 1.4));
  o += circ(x, base - hb - rh - 2 * s, 3.4 * s, tone(P, CANDY.lime), OL(dark(CANDY.lime, 0.4), 1.4));
  // candy pebble path + gumdrop bushes by the door
  o += gumdrop(x - w / 2 - 4 * s, base + 0.5, 9 * s, 7 * s, tone(P, CANDY.mint), P, { olw: 1.4, cap: opt.cap });
  o += gumdrop(x + w / 2 + 4 * s, base + 0.5, 8 * s, 6 * s, tone(P, CANDY.orange), P, { olw: 1.4, cap: opt.cap });
  return o;
}
function far(L) {
  const P = PAL[L], li = LVLS.indexOf(L), r = rng(201 + li * 31);
  const snow = L === 'snow', windy = L === 'wind', rainy = L === 'rain';
  const HC = [CANDY.pink, CANDY.lime, CANDY.purple, CANDY.orange, CANDY.mint, CANDY.blue];
  let b = '';
  // back row: big hazy gumdrop hills
  const backH = [[40, 170, 74], [180, 150, 56], [320, 190, 80], [480, 140, 50], [610, 200, 88], [780, 160, 62], [905, 150, 70]];
  backH.forEach(([x, w, h], i) => { const c = farTone(P, HC[(i * 2 + li) % HC.length]); b += wrap(x, w / 2 + 3, X => gumdrop(X, 146, w, h, c, P, { olw: 1.5, cap: snow })); });
  // front row: smaller, saturated gumdrops with sugar dots
  const frontH = [[95, 90, 40], [255, 70, 30], [395, 100, 34], [545, 76, 28], [700, 96, 38], [860, 84, 32]];
  frontH.forEach(([x, w, h], i) => { const c = tone(P, HC[(i * 3 + 1 + li) % HC.length]); b += wrap(x, w / 2 + 3, X => gumdrop(X, 146, w, h, c, P, { dots: true, cap: snow })); });
  // shore meadow (sugar grass) — base wavy around y 140
  const shore = prof(140, [[1.6, 2, 0.5 + li], [1.1, 5, 1.1], [0.5, 11, 2]]);
  const grass = snow ? P.ground : tone(P, P.ground);
  b += pth(profPath(shore, 200), grass);
  b += stk(profLine(x => shore(x) + 7, 6), snow ? P.groundSh : tone(P, P.groundSh), 4, ' opacity="0.7"');
  b += stk(profLine(shore, 6), '#ffffff', 1.6, ' opacity="0.7"');
  // lollipop trees (lean with the wind)
  const trees = [[30, 52, 15], [150, 40, 12], [300, 58, 16], [420, 36, 11], [575, 48, 14], [655, 34, 10], [890, 54, 15]];
  trees.forEach(([x, h, R], i) => {
    const c1 = tone(P, HC[(i + li * 2) % HC.length]), c2 = tone(P, i % 2 ? '#ffffff' : CANDY.pink === HC[(i + li * 2) % HC.length] ? '#ffffff' : lite(c1, 0.6));
    b += wrap(x + (windy ? 14 : 0), R + 20, X => lollipop(X - (windy ? 14 : 0), shore(x) + 2, h, R, c1, c2, { lean: windy ? 13 + R * 0.4 : 0, cap: snow }));
  });
  // candy-cane fence segments
  for (const [x0, x1] of [[200, 270], [600, 700]]) b += wrap((x0 + x1) / 2, (x1 - x0) / 2 + 10, X => fence(X - (x1 - x0) / 2, X + (x1 - x0) / 2, shore((x0 + x1) / 2) + 1, P, { cap: snow, dir: windy ? 1 : (x0 > 400 ? -1 : 1) }));
  // gingerbread houses (one big, one small)
  b += wrap(780, 40, X => house(X, shore(780) + 1, 1.25, P, { lit: snow, cap: snow }));
  b += wrap(215, 26, X => house(X, shore(215) + 1, 0.8, P, { lit: snow, cap: snow }));
  // weather touches on the shore
  if (windy) { // bunting on the fence blowing right, and tufts of candy floss caught in the grass
    for (const [x0, x1] of [[600, 700]]) {
      const y = shore(650) - 14; let d = '';
      for (let x = x0; x < x1; x += 10) d += pth(`M${x} ${f(y + 0.04 * (x - x0))}L${x + 9} ${f(y + 0.04 * (x - x0) + 0.4)}L${x + 8} ${f(y + 0.04 * (x - x0) + 7)}Z`, [CANDY.pink, CANDY.gold, CANDY.blue][((x - x0) / 10) % 3], OL('#ffffff', 0.8));
      b += wrap(650, 60, X => `<g transform="translate(${X - 650} 0)">${d}</g>`);
    }
  }
  if (windy) for (const [x, y, l] of [[120, 104, 120], [470, 96, 150], [800, 112, 130], [330, 124, 90], [640, 128, 80]])
    b += wrap(x, l / 2 + 12, X => stk(`M${f(X - l / 2)} ${f(y)}Q${f(X)} ${f(y - 6)} ${f(X + l / 2)} ${f(y - 1)}Q${f(X + l / 2 + 10)} ${f(y + 1)} ${f(X + l / 2 + 4)} ${f(y + 6)}`, '#ffffff', 2.2, ' opacity="0.75"'));
  if (rainy) for (let i = 0; i < 16; i++) { const x = 20 + i * 60 + r() * 20; b += wrap(x, 8, X => ell(X, shore(x) + 4, 6 + r() * 4, 1.2, '#ffffff', ' opacity="0.45"')); } // puddle shines
  if (snow) for (let i = 0; i < 26; i++) { const x = r() * W; b += wrap(x, 3, X => circ(X, shore(x) + 2 + r() * 5, 0.8, '#ffffff', ' opacity="0.9"')); }
  // distant lake (matches the top of water.svg) with soft shine lines
  const lakeTop = prof(141.5, [[0.6, 3, 0.2]]);
  const lake = lite(P.water[0], 0.12);
  b += pth(profPath(lakeTop, 200), lake);
  b += stk(profLine(lakeTop, 6), '#ffffff', 1.4, ' opacity="0.75"');
  for (let i = 0; i < 12; i++) { const x = 30 + i * 80 + r() * 30, y = 145 + r() * 4, l = 14 + r() * 26; b += wrap(x, l, X => stk(`M${f(X - l / 2)} ${f(y)}H${f(X + l / 2)}`, '#ffffff', 1.2, ' opacity="0.5"')); }
  return svg(W, 200, b);
}

// =====================================================================================
// DOCK 960x80 (transparent above y4, tileable). Icing deck top at y10 (SURFACE_Y), wafer slab y14..47, posts to ≈ y66.
// =====================================================================================
const POSTS = [80, 240, 400, 560, 720, 880];
function post(x, P, wet) {
  const red = tone(P, CANDY.red), wh = '#fff8f4', w = 18, y0 = 30, y1 = 64;
  let o = ell(x, 52, 17, 3.4, '#ffffff', ' opacity="0.45"'); // ripple ring where the post meets the water
  o += pth(`M${x - w / 2} ${y0}V${y1 - 4}Q${x} ${y1 + 3} ${x + w / 2} ${y1 - 4}V${y0}Z`, wh, OL(dark(red, 0.45), 2.4));
  for (let y = y0 - 2; y < y1; y += 9) o += pth(`M${x - w / 2 + 1} ${f(y + 6)}L${x + w / 2 - 1} ${f(y)}L${x + w / 2 - 1} ${f(y + 4)}L${x - w / 2 + 1} ${f(Math.min(y + 10, y1 - 3))}Z`, red);
  o += rect(x + w / 2 - 6, y0, 4, y1 - y0 - 6, dark(red, 0.2), ' opacity="0.25"');                 // cel shade
  o += stk(`M${x - w / 2 + 4} ${y0 + 4}V${y1 - 10}`, '#ffffff', 2, ' opacity="0.8"');             // highlight
  // under the waterline: a soft tint so the post reads as "in the lake"
  o += pth(`M${x - w / 2 - 1} 52V${y1 - 4}Q${x} ${y1 + 4} ${x + w / 2 + 1} ${y1 - 4}V52Z`, P.water[0], ' opacity="0.35"');
  if (wet) o += stk(`M${x + 2} ${y0 + 6}V${y0 + 14}`, '#ffffff', 1.4, ' opacity="0.8"');
  return o;
}
function dock(L) {
  const P = PAL[L], li = LVLS.indexOf(L), r = rng(301 + li * 13);
  const snow = L === 'snow', wet = L === 'rain';
  let defs = lin('wf', [['0', P.waferL], ['0.45', P.wafer], ['1', P.waferD]]) + lin('ic', [['0', P.icing], ['1', P.icingSh]]);
  let b = '';
  // shadow on the water right under the dock (soft, very low contrast)
  defs += lin('sh', [['0', '#0d3550', 0.22], ['1', '#0d3550', 0]]);
  b += rect(0, 47, W, 10, 'url(#sh)');
  for (const x of POSTS) b += wrap(x, 20, X => post(X, P, wet));
  // wafer slab: three wafer layers with cream between; a waffle grid of little square indents on each layer
  const top = 13, bot = prof(47, [[0.6, 3, li], [0.4, 8, 1]]);
  let d = `M0 ${top}H${W}`; for (let x = W; x >= 0; x -= 8) d += `L${x} ${f(bot(x))}`; d += 'Z';
  b += pth(d, 'url(#wf)');
  const layers = [[14, 23], [25.5, 34.5], [37, 46]];
  for (const [y0, y1] of layers) {
    for (let x = 2; x < W; x += 12) b += rect(x, y0 + 1.6, 9, y1 - y0 - 3.2, P.waferD, ' opacity="0.32" rx="1.2"') + rect(x, y0 + 1.6, 9, 1.4, P.waferL, ' opacity="0.8"');
  }
  for (const yy of [24.2, 35.8]) b += rect(0, yy - 1.3, W, 2.6, P.cream) + rect(0, yy + 0.9, W, 0.8, dark(P.cream, 0.2), ' opacity="0.5"');
  b += stk(profLine(bot, 8), dark(P.waferD, 0.35), 3);
  // biscuit seams at the posts
  for (const x of POSTS) b += wrap(x, 3, X => stk(`M${X} 16V${f(bot(x) - 1)}`, dark(P.waferD, 0.25), 1.6, ' opacity="0.7"'));
  // icing layer on top: bumpy top at ≈ y10, drips down the front
  const iol = mix(P.icingSh, P.waferD, 0.55);
  const itop = prof(10, [[0.5, 6, li], [0.35, 17, 1.3]]), ibot = prof(18, [[1, 5, 0.3 + li], [0.7, 13, 2.2]]);
  let id = `M0 ${f(itop(0))}`; for (let x = 0; x <= W; x += 6) id += `L${x} ${f(itop(x))}`; for (let x = W; x >= 0; x -= 6) id += `L${x} ${f(ibot(x))}`; id += 'Z';
  let drips = '', joins = '', shines = '';
  for (let x = 10; x < W - 4; x += 22 + r() * 30) {
    if (x > 440 && x < 520) continue; // the gap (render cuts 448..512)
    const L2 = 6 + r() * 15, w = 2.6 + r() * 2, y0 = ibot(x) - 3, yb = y0 + L2;
    // drip: wide shoulders at the icing edge, narrow neck, round bulb
    const drip = X => `M${f(X - w - 4)} ${f(y0)}Q${f(X - w)} ${f(y0 + 1)} ${f(X - w * 0.7)} ${f(y0 + L2 * 0.45)}L${f(X - w)} ${f(yb - w)}A${f(w)} ${f(w)} 0 0 0 ${f(X + w)} ${f(yb - w)}L${f(X + w * 0.7)} ${f(y0 + L2 * 0.45)}Q${f(X + w)} ${f(y0 + 1)} ${f(X + w + 4)} ${f(y0)}Z`;
    drips += wrap(x, w + 6, X => pth(drip(X), P.icingSh, OL(iol, 2)));
    joins += wrap(x, w + 6, X => pth(drip(X), P.icingSh));
    shines += wrap(x, w + 2, X => stk(`M${f(X - w * 0.3)} ${f(yb - w - 1)}V${f(yb - w + 0.6)}`, '#ffffff', 1.3, ' opacity="0.9"'));
  }
  b += drips + pth(id, 'url(#ic)', OL(iol, 2.4)) + joins + shines;
  b += stk(profLine(x => itop(x) + 2, 6), '#ffffff', 1.4, ' opacity="0.85"');
  // a few pastel sprinkles on the icing (soft, small)
  const spr = ['#ffb6d8', '#bfe6ff', '#fff0a6', '#c9f2c2'];
  for (let i = 0; i < 46; i++) { const x = r() * W; if (x > 440 && x < 520) continue; const y = 12.5 + r() * 3, a = r() * 180, c = spr[i % 4]; b += wrap(x, 4, X => `<rect x="${f(X - 2.2)}" y="${f(y - 0.7)}" width="4.4" height="1.4" rx="0.7" fill="${tone(P, c)}" transform="rotate(${f(a)} ${f(X)} ${f(y)})"/>`); }
  if (wet) { // wet shine: glossy streaks on the icing + drops hanging under the slab
    for (let i = 0; i < 18; i++) { const x = r() * W, l = 10 + r() * 30; b += wrap(x, l, X => stk(`M${f(X)} ${f(itop(x) + 3.4)}H${f(X + l)}`, '#ffffff', 1.8, ' opacity="0.9"')); }
    for (let i = 0; i < 26; i++) { const x = r() * W; b += wrap(x, 12, X => stk(`M${f(X)} ${f(18 + r() * 24)}l${f(8)} 0`, '#ffffff', 1.2, ' opacity="0.35"')); }
    for (let i = 0; i < 14; i++) { const x = 15 + i * 68 + r() * 20; if (x > 436 && x < 524) continue; b += wrap(x, 4, X => pth(`M${f(X)} ${f(bot(x) + 1)}Q${f(X + 2.6)} ${f(bot(x) + 5)} ${f(X)} ${f(bot(x) + 6.5)}Q${f(X - 2.6)} ${f(bot(x) + 5)} ${f(X)} ${f(bot(x) + 1)}Z`, '#dff4fb', OL('#7fb2c4', 1))); }
  }
  if (snow) { // sugar snow along the deck top
    const st = prof(7.5, [[1.2, 4, 0.3], [0.9, 11, 1.2], [0.5, 23, 2.1]]);
    let sd = `M0 ${f(st(0))}`; for (let x = 0; x <= W; x += 6) sd += `L${x} ${f(Math.max(4.5, st(x)))}`; for (let x = W; x >= 0; x -= 6) sd += `L${x} ${f(itop(x) + 4 + Math.sin(x * 0.11) * 1.2)}`; sd += 'Z';
    b += pth(sd, '#fbfbff', OL('#b9b6e0', 1.8));
    for (let i = 0; i < 12; i++) { const x = 30 + i * 80 + r() * 30, w = 10 + r() * 14; if (x > 436 && x < 524) continue; b += wrap(x, w + 2, X => pth(`M${f(X - w)} ${f(st(x) + 2)}Q${f(X - w * 0.4)} ${f(st(x) - 3.2)} ${f(X)} ${f(st(x) - 2.6)}Q${f(X + w * 0.5)} ${f(st(x) - 2.4)} ${f(X + w)} ${f(st(x) + 2)}Z`, '#ffffff')); }
    for (let i = 0; i < 30; i++) { const x = r() * W; b += wrap(x, 3, X => circ(X, 8 + r() * 4, 0.6 + r() * 0.6, '#d8f0ff', ' opacity="0.95"')); }
  }
  return svg(W, 80, b, defs);
}

// =====================================================================================
// WATER 960x400 (opaque, stretched once). Soft only.
// =====================================================================================
function water(L) {
  const P = PAL[L], [t, bt] = P.water;
  let defs = lin('wg', [['0', lite(t, 0.12)], ['0.05', t], ['0.5', mix(t, bt, 0.58)], ['1', bt]]);
  let b = rect(0, 0, W, 400, 'url(#wg)');
  defs += lin('ui', [['0', '#ffffff', L === 'snow' ? 0.1 : 0.2], ['1', '#ffffff', 0]]);
  b += rect(0, 0, W, 50, 'url(#ui)');
  if (P.rays) {
    defs += lin('ry', [['0', '#ffffff', P.rays], ['0.7', '#ffffff', P.rays * 0.25], ['1', '#ffffff', 0]]);
    const lean = L === 'wind' ? 1.6 : 1.1;
    const rays = L === 'sunny' ? [[40, 70, 120], [240, 40, 90], [430, 90, 110], [640, 50, 130], [820, 80, 100]] : [[80, 50, 140], [330, 36, 110], [600, 60, 130], [840, 40, 90]];
    for (const [x, w, sl] of rays) b += pth(`M${x} 0L${x + w} 0L${f(x + w + sl * lean * 1.15)} 320L${f(x + sl * lean * 0.9)} 320Z`, 'url(#ry)');
  }
  if (L === 'sunny' || L === 'wind') { defs += rad('fz', [['0', '#e8fffb', 0.16], ['1', '#e8fffb', 0]]); b += ell(480, 30, 560, 110, 'url(#fz)'); }
  if (L === 'rain') { defs += rad('rg', [['0', '#e6eef2', 0.14], ['1', '#e6eef2', 0]]); b += ell(480, 0, 620, 90, 'url(#rg)'); }
  if (L === 'snow') {
    defs += rad('sg', [['0', '#ffe2b0', 0.1], ['1', '#ffe2b0', 0]]); // warm house-light reflection near the surface (far left / far right)
    b += ell(215, 8, 110, 40, 'url(#sg)') + ell(780, 8, 150, 50, 'url(#sg)');
    defs += rad('sd', [['0', '#9fb8ff', 0.12], ['1', '#9fb8ff', 0]]);
    b += ell(480, 0, 560, 140, 'url(#sd)');
  }
  defs += lin('fd', [['0', bt, 0], ['1', dark(bt, 0.2), 0.55]]);
  b += rect(0, 320, W, 80, 'url(#fd)');
  return svg(W, 400, b, defs);
}

// =====================================================================================
// REEF 960x320 (transparent, tileable). Sugar-sand bed top ≈ y286. Calm column x 320–640: ≤ 30 px tall, pale only.
// =====================================================================================
const CALM0 = 320, CALM1 = 640;
function crystals(x, base, h, P, n, r, glow) { // rock-candy cluster: clear faceted prisms
  let o = '';
  const parts = [];
  for (let i = 0; i < n; i++) parts.push({ dx: (i - (n - 1) / 2) * h * 0.22 + (r() - 0.5) * h * 0.08, hh: h * (0.45 + r() * 0.55), w: h * (0.13 + r() * 0.06), a: (i - (n - 1) / 2) * 14 + (r() - 0.5) * 10 });
  parts.sort((a, b) => a.hh - b.hh);
  for (const p of parts) {
    const w = p.w, hh = p.hh;
    const face = poly([[-w, 0], [-w, -hh * 0.78], [0, -hh], [w, -hh * 0.78], [w, 0]]);
    const shade = poly([[0, 0], [0, -hh], [w, -hh * 0.78], [w, 0]]);
    let g = pth(face, P.crystal, ' fill-opacity="0.82"' + OL(P.crystalSh, Math.max(1.4, w * 0.22))) + pth(shade, P.crystalSh, ' opacity="0.45"');
    g += stk(`M${f(-w * 0.5)} ${f(-hh * 0.15)}V${f(-hh * 0.7)}`, '#ffffff', Math.max(1, w * 0.25), ' opacity="0.9"');
    if (glow) g = circ(0, -hh * 0.6, w * 2.6, 'url(#cg)') + g;
    o += `<g transform="translate(${f(x + p.dx)} ${f(base)}) rotate(${f(p.a)})">${g}</g>`;
  }
  return o;
}
function gumRock(x, base, w, h, c) { // sugared gumdrop rock (muted under water)
  let o = gumdrop(x, base, w, h, c, null, { olw: 2.4 });
  const rr = rng(Math.floor(x * 13 + w)); for (let i = 0; i < w / 5; i++) { const t = -0.75 + rr() * 1.5; o += circ(x + t * w / 2, base - 3 - rr() * h * 0.75 * Math.sqrt(1 - t * t), 1, '#ffffff', ' opacity="0.65"'); }
  return o;
}
function licorice(x, base, h, c, n, r, lean = 0) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 5, hh = h * (0.6 + r() * 0.4), ph = r() * 6, sw = 6 + r() * 4;
    let d = `M${f(x + dx)} ${f(base)}`; for (let y = 6; y <= hh; y += 6) d += `L${f(x + dx + Math.sin(y / 16 + ph) * sw * (y / hh) + lean * (y / hh) * (y / hh))} ${f(base - y)}`;
    o += stk(d, dark(c, 0.3), 6) + stk(d, c, 4) + stk(d, lite(c, 0.35), 1.2, ' opacity="0.6" stroke-dasharray="3 5"');
  }
  return o;
}
function reef(L) {
  const P = PAL[L], li = LVLS.indexOf(L), r = rng(401 + li * 53);
  const under = c => mix(c, P.water[1], P.under);             // candy colours seen through the soda
  const glow = L === 'snow' ? '#cfe6ff' : null, lean = L === 'wind' ? 18 : 0;
  let defs = lin('sd', [['0', P.sand], ['1', P.sandSh]]) + rad('cg', [['0', '#dff0ff', 0.45], ['1', '#dff0ff', 0]]);
  let back = '', mid = '', front = '';
  const bed = prof(286, [[2.2, 2, li], [1.4, 5, 1.7], [0.6, 13, 0.4]]);
  // swirl-lollipop "plants" (edges only)
  const lol = [[40, 130, 17, CANDY.pink], [92, 86, 12, CANDY.mint], [205, 110, 15, CANDY.blue], [262, 70, 11, CANDY.purple], [700, 92, 13, CANDY.lime], [770, 140, 18, CANDY.blue], [845, 78, 12, CANDY.pink], [925, 112, 15, CANDY.mint]];
  for (const [x, h, R, c] of lol) { const c1 = under(c); back += wrap(x + lean, R + 22, X => lollipop(X - lean, bed(x) + 4, h, R, c1, lite(c1, 0.55), { lean, stick: under('#fff6ec'), olw: 2.4 })); }
  // licorice weeds
  const lic = under(L === 'snow' ? '#5a4a78' : '#6b4a63');
  for (const [x, h, n] of [[130, 90, 4], [300, 50, 3], [668, 60, 3], [880, 100, 4], [955, 64, 3]]) back += wrap(x, 30 + lean, X => licorice(X, bed(x) + 4, h, lic, n, r, lean));
  // rock-candy crystal clusters
  for (const [x, h, n] of [[160, 74, 5], [290, 40, 3], [735, 56, 4], [820, 96, 5], [20, 50, 3]]) { const st = r(); mid += wrap(x, h * 0.7, X => crystals(X, bed(x) + 4, h, P, n, rng(Math.floor(st * 1e6)), glow)); }
  // gumdrop rocks
  for (const [x, w, h, c] of [[70, 56, 34, CANDY.purple], [245, 40, 24, CANDY.orange], [690, 46, 28, CANDY.pink], [895, 64, 38, CANDY.lime], [612, 26, 12, '#bfe3e8']]) mid += wrap(x, w / 2 + 4, X => gumRock(X, bed(x) + 4, w, h, under(c)));
  // calm column: only tiny clear crystals, pale pebbles and a couple of shells (all ≤ 30 px)
  for (const [x, h] of [[360, 22, 3], [455, 16, 2], [530, 26, 3], [600, 14, 2]].map(a => a)) { const st = r(); front += crystals(x, bed(x) + 4, h, P, 3, rng(Math.floor(st * 1e6)), glow); }
  for (let i = 0; i < 10; i++) { const x = CALM0 + 10 + r() * (CALM1 - CALM0 - 20), c = lite(P.sand, 0.4); front += ell(x, bed(x) + 2, 4 + r() * 3, 2.4 + r() * 1.2, c, OL(P.sandSh, 1.4)); }
  // sugar-sand bed
  let sand = pth(profPath(bed, 320, 6), 'url(#sd)') + stk(profLine(bed, 6), dark(P.sand, 0.25), 3);
  sand += stk(profLine(x => bed(x) + 3, 6), lite(P.sand, 0.45), 1.6, ' opacity="0.8"');
  // sugar grains + candy pebbles (colour only outside the calm column, and muted)
  const peb = [CANDY.pink, CANDY.mint, CANDY.blue, CANDY.purple, CANDY.gold];
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = bed(x) + 8 + r() * 24, s = 1.2 + r() * 2.6, m = ((x % W) + W) % W, calm = m > CALM0 - 10 && m < CALM1 + 10;
    const c = calm || r() < 0.55 ? (r() < 0.5 ? P.sandSh : lite(P.sand, 0.5)) : under(peb[i % peb.length]);
    sand += wrap(x, s + 2, X => ell(X, y, s * 1.3, s, c, ' opacity="0.85"'));
  }
  for (let i = 0; i < 40; i++) { const x = r() * W, y = bed(x) + 6 + r() * 26; sand += wrap(x, 2, X => circ(X, y, 0.8, '#ffffff', ' opacity="0.8"')); }
  for (let i = 0; i < 12; i++) { const x = r() * W, y = bed(x) + 14 + r() * 14; sand += wrap(x, 14, X => stk(`M${f(X - 9)} ${f(y)}Q${f(X)} ${f(y - 3)} ${f(X + 9)} ${f(y)}`, dark(P.sand, 0.12), 1.4, ' opacity="0.55"')); }
  return svg(W, 320, back + mid + sand + front, defs);
}

// =====================================================================================
// DOCK GAP 96x80 (shared). Gap x 16..80; svg y10 = SURFACE_Y. Rounded wafer ends with an icing lip and a drip.
// The outer part (x 0..8) fades through a mask into the level's own dock underneath.
// =====================================================================================
function dockGap() {
  const P = PAL.sunny;
  const defs = lin('ge', [['0', P.waferL], ['1', P.waferD]]) + lin('gi', [['0', P.icing], ['1', P.icingSh]])
    + `<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="8" y2="0">${stops([['0', '#ffffff', 0], ['1', '#ffffff', 1]])}</linearGradient>`
    + '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="80">' + rect(0, 0, 96, 80, 'url(#fade)') + '</mask>';
  const ol = dark(P.waferD, 0.35), iol = dark(P.icingSh, 0.3);
  const side = mirror => `<g${mirror ? ' transform="translate(96 0) scale(-1 1)"' : ''}>`
    + '<g mask="url(#m)">'
    + pth('M0 13H11Q16 13 16 18V42Q16 47 11 47H0Z', 'url(#ge)')                                       // wafer end face
    + rect(0, 22.9, 15.6, 2.6, P.cream) + rect(0, 34.5, 15.6, 2.6, P.cream)                            // cream layers
    + rect(3, 15.4, 8, 5.4, P.waferD, ' opacity="0.35" rx="1"') + rect(3, 27, 8, 5.4, P.waferD, ' opacity="0.35" rx="1"') + rect(3, 38.6, 8, 5.4, P.waferD, ' opacity="0.35" rx="1"')
    + pth('M0 9.4Q9 9 14 9.6Q18.6 10.4 18.4 14.6Q18.2 18.4 16 19.2V27Q16 30.4 13.6 30.4Q11.2 30.4 11.2 27V19.4Q6 19.8 0 19Z', 'url(#gi)') // icing lip + drip at the cut
    + '</g>'
    + stk('M11 13Q16 13 16 18V42Q16 47 11 47H8', ol, 2.4)                                               // outline: gap side
    + stk('M10 9.2Q14 9.3 15.6 10Q18.6 11.4 18.4 14.6Q18.2 18.4 16 19.2V27Q16 30.4 13.6 30.4Q11.2 30.4 11.2 27V20', iol, 2)
    + stk('M13.2 21V26.6', '#ffffff', 1.2, ' opacity="0.85"') + ell(9, 11, 4.5, 1.2, '#ffffff', ' opacity="0.95"')
    + stk('M14 21V40', P.waferL, 1.4, ' opacity="0.7"')
    + '</g>';
  return svg(96, 80, side(false) + side(true), defs);
}

// =====================================================================================
// PARTICLES 32x32
// =====================================================================================
const sprinkleSvg = (c, o) => svg(32, 32, `<g transform="rotate(-35 16 16)">${rect(6, 12.5, 20, 7, c, ' rx="3.5"' + OL(o, 1.8))}${rect(9, 14, 13, 1.6, '#ffffff', ' rx="0.8" opacity="0.75"')}</g>`);
const particles = {
  snowflake: () => {
    let o = '';
    for (let i = 0; i < 6; i++) { const a = i * 60; o += `<g transform="rotate(${a} 16 16)">${stk('M16 16V4', '#ffffff', 2.4)}${stk('M16 8L12.5 5.5M16 8L19.5 5.5M16 12L13.5 10M16 12L18.5 10', '#ffffff', 1.6)}</g>`; }
    return svg(32, 32, `${o.replace(/#ffffff/g, '#c4b8ec').replace(/stroke-width="2.4"/g, 'stroke-width="4"').replace(/stroke-width="1.6"/g, 'stroke-width="3"')}${o}` + circ(16, 16, 2.6, '#ffffff'));
  },
  bubble_s: () => svg(32, 32, circ(16, 16, 11, '#e2fbff', ' fill-opacity="0.18"' + OL('#e0fbff', 2)) + pth('M9.5 13A7.5 7.5 0 0 1 15 8.5', 'none', OL('#ffffff', 2.4)) + circ(20.5, 20.5, 1.4, '#ffffff', ' opacity="0.7"')),
  sprinkle: () => sprinkleSvg('#ff86bf', '#c2457f'),
  sprinkle_b: () => sprinkleSvg('#74c6ff', '#2f7fbf'),
  sprinkle_y: () => sprinkleSvg('#ffe270', '#c79a1e'),
  floss: () => svg(32, 32, [[11, 18, 7.5], [20, 17, 8], [16, 11, 7.5], [24, 22, 5], [8, 23, 4.5]].map(([x, y, rr]) => circ(x, y, rr, 'url(#fg)')).join('') + ell(13, 9.5, 3, 1.6, '#ffffff', ' opacity="0.85"'),
    rad('fg', [['0', '#ffffff', 1], ['0.55', '#ffd6ea', 0.95], ['1', '#ffb3d6', 0.0]])),
  wrapper: () => svg(32, 32, `<g transform="rotate(-18 16 16)">`
    + pth('M10 16L3 10.5Q2 16 3 21.5Z', '#8fd9ff', OL('#3c88b8', 1.6)) + pth('M22 16L29 10.5Q30 16 29 21.5Z', '#8fd9ff', OL('#3c88b8', 1.6))
    + stk('M4.5 12.5L8 15M4.5 19.5L8 17M27.5 12.5L24 15M27.5 19.5L24 17', '#ffffff', 1, ' opacity="0.8"')
    + ell(16, 16, 7.5, 5.6, '#ff9ccb', OL('#c04f86', 1.8)) + stk('M12 12.4L14.5 19.6M16.4 11L19 20.4', '#ffffff', 1.4, ' opacity="0.85"') + ell(13.4, 13.4, 2, 1, '#ffffff', ' opacity="0.9"') + '</g>'),
  ring: () => svg(32, 32, ell(16, 16, 14, 5, 'none', OL('#ffffff', 1.8) + ' opacity="0.9"') + ell(16, 16, 8, 2.6, 'none', OL('#ffffff', 1.4) + ' opacity="0.6"')),
  sparkle: () => svg(32, 32, pth(twinkle(16, 16, 14, 0.2), '#fffbe0', OL('#ffd86b', 1.4)) + circ(16, 16, 3, '#ffffff')),
  drop: () => svg(32, 32, pth('M16 3Q24 14 24 20A8 8 0 0 1 8 20Q8 14 16 3Z', '#cdeefb', OL('#5aa8d0', 2)) + ell(12.8, 19, 1.8, 3.2, '#ffffff', ' opacity="0.85"')),
  star: () => svg(32, 32, pth(star5(16, 17, 14, 6.4), '#ffe36e', OL('#d39a1e', 2)) + pth(star5(16, 17, 7, 3.2), '#fff6bf') + circ(12.5, 12.5, 1.6, '#ffffff')),
  puff: () => svg(32, 32, ell(16, 22, 12, 6, '#d7d0ea', ' opacity="0.35"') + circ(11, 19, 8, 'url(#pg)') + circ(21, 19, 8.5, 'url(#pg)') + circ(16, 12.5, 9, 'url(#pg)'), rad('pg', [['0', '#ffffff', 0.95], ['0.6', '#ffffff', 0.8], ['1', '#ffffff', 0]])),
};

// =====================================================================================
for (const old of ['levels/shallows', 'levels/kelp', 'levels/twilight', 'levels/aurora', 'particles/kelp_bit.svg', 'particles/plankton.svg', 'particles/jelly.svg', 'hole_rim.svg']) rmrf(old);
for (const L of LVLS) {
  write(`levels/${L}/sky.svg`, sky(L));
  write(`levels/${L}/far.svg`, far(L));
  write(`levels/${L}/dock.svg`, dock(L));
  write(`levels/${L}/water.svg`, water(L));
  write(`levels/${L}/reef.svg`, reef(L));
}
write('dock_gap.svg', dockGap());
for (const [k, fn] of Object.entries(particles)) write(`particles/${k}.svg`, fn());
// sanity: forbidden content
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const p of walk(OUT).filter(p => p.endsWith('.svg') && (p.includes('/levels/') || p.includes('/particles/') || p.endsWith('dock_gap.svg')))) {
  const s = fs.readFileSync(p, 'utf8');
  if (/<text|<script|<image|href=|@import|font-family|NaN/i.test(s)) throw new Error('forbidden content in ' + p);
}
console.log('environment art written to', OUT);
