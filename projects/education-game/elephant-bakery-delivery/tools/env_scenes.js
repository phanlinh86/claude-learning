// Tupi's Bakery Delivery: environment RECIPE + composed preview scenes (Playwright + canvas, the real BD.TableArt).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "winter", "720x1556", "junction", "states")
// Writes docs/art/env_scene_<season>_<WxH>.png (4 shapes × 4 seasons), docs/art/env_junction_3x.png (fork close-ups at 3×),
// docs/art/env_states_960x720.png (pour-out reveal 0.35 / 0.7, hint glow + trail, winter snow dusting), prints a placement
// check (decorations vs houses / cart / bakery / HUD / bubble / roads), the wall geometry per shape and a contrast table.
// It also checks that game/js/table_art.js carries this RECIPE verbatim (`node tools/env_scenes.js sync` rewrites it there).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// The wall: env/wall_<m>.svg (1600×400) is drawn by BD.TableArt.drawWall — render.js does NOT draw it itself; it only needs
// RECIPE.wallLayout(layout) (= BD.TableArt.wallLayout) for things that sit on / in the wall:
//   * scale k = layout.wall.h / 400 — the whole SVG height always shows (plaster, shelf, window, sill, table rim).
//     landscape 1556×720 / 960×720: wall 216 → k 0.54 · portrait 720×1556: wall 311 → k 0.7775 · 720×960: wall 192 → k 0.48.
//   * window centre x: landscape → the middle of the gap between the speech bubble's right edge and the HUD's left edge when
//     that gap ≥ 300·k (1556×720 → x 990, 960×720 → x 692), else W/2; portrait → W/2 (360). Clamped so the frame stays on screen.
//   * horizontal cover: the SVG spans x0 = cx − 800·k … x0 + 1600·k; the strip x 0…400 of the SVG is repeated to the left and
//     the strip 1200…1600 to the right (period 400·k, integer device px → seamless) until the screen is covered (crop rule:
//     never scale up to cover, never crop vertically).
//   * wallLayout(L) → { k, x0, y0, h, cx, glass {x,y,w,h,arcY,r}, frame {x,y,w,h}, sill {x0,x1,y} (the bird's perch),
//     rimY (top of the table rim), sun: {spring|summer|autumn|winter: {x, y, r}} } — screen px.
//   * SUN[m] (SVG units) = the sun disc painted in the window; Weather's light beams for summer start at wall.sun.summer.
//   * SKY[m] = the window sky (top, bottom), also in each SVG's <!-- sky --> comment; Weather.ambient.skyTop/skyBottom.
//   * ANIM[m] = the live view through the glass (clouds, cloud speed, branch kind, snowflakes) drawn by drawWall.
// Render order (DESIGN §7): drawWall → back particles (clip them to wallLayout().glass if they are "outside") → drawTable →
//   light beams → drawRoads → drawBakery → houses … ; season crossfade = drawWall/drawTable(old) then (new) with opt.alpha.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TA = path.join(ROOT, 'game/js/table_art.js');

// ==== RECIPE BEGIN ====
  const RECIPE = {
    WALL_VB: [1600, 400],                 // env/wall_<m>.svg viewBox
    WIN_X: 800,                           // the window's centre x in the SVG
    STRIP_L: [0, 400], STRIP_R: [1200, 1600],   // periodic strips repeated to the left / right of the SVG
    OPENING: { x0: 630, x1: 970, top: 46, arcY: 216, r: 170, bottom: 316, mullX: [794, 806], mullY: [210, 222] },
    FRAME: { x0: 560, x1: 1040, y0: 16, y1: 342 },   // window + curtains + rod + sill (the part redrawn over the live view)
    SILL: { x0: 600, x1: 1000, y: 312 },  // the bird's perch line
    RIM_Y: 372,                           // the top of the table's wooden back rim (the cloth starts at the SVG bottom)
    WALL_FRAC: { landscape: 0.30, portrait: 0.20 },   // layout.wall.h ≈ frac · H (World owns the exact value)
    SKY: { spring: ['#BFDDF2', '#E9F2F4'], summer: ['#8CCBEA', '#D3ECF3'], autumn: ['#F1C893', '#F8E3C4'], winter: ['#B9C8E2', '#E4EAF3'] },
    SUN: { spring: { x: 700, y: 118, r: 22 }, summer: { x: 892, y: 104, r: 28 }, autumn: { x: 742, y: 214, r: 30 }, winter: { x: 868, y: 132, r: 20 } },
    ANIM: {                               // the live view through the glass (wall units, per second)
      spring: { clouds: 1, cloudA: 0.85, cloudV: 6, branch: 'blossom', snow: 0 },
      summer: { clouds: 2, cloudA: 0.9, cloudV: 5, branch: null, snow: 0 },
      autumn: { clouds: 1, cloudA: 0.6, cloudV: 9, branch: 'amber', snow: 0 },
      winter: { clouds: 1, cloudA: 0.7, cloudV: 4, branch: null, snow: 28 },
    },
    /** Screen geometry of the back wall. Scale k = wall.h / 400 (the whole SVG height always shows: plaster, shelf, window,
     *  sill, rim). Window centre: landscape → the middle of the free gap between the speech bubble and the HUD (when that gap
     *  is ≥ 300·k wide, else W/2); portrait → W/2. Clamped so the frame stays on screen. The SVG covers x0 … x0 + 1600·k;
     *  the strip 0…400 repeats to the left of it, 1200…1600 to the right (period 400·k) until the screen is covered. */
    wallLayout(L) {
      const W = L.W, wall = L.wall || { x: 0, y: 0, w: W, h: Math.round(L.H * (L.portrait ? 0.2 : 0.3)) };
      const k = wall.h / 400, F = this.FRAME;
      let cx = W / 2;
      if (!L.portrait && L.bubble && L.hud) {
        const g0 = L.bubble.x + L.bubble.w, g1 = L.hud.x;
        if (g1 - g0 >= 300 * k) cx = (g0 + g1) / 2;
      }
      const half = (F.x1 - F.x0) / 2 * k;
      cx = Math.round(Math.max(half, Math.min(W - half, cx)));
      const x0 = cx - 800 * k, y0 = wall.y, O = this.OPENING;
      const sx = u => x0 + u * k, sy = v => y0 + v * k;
      const out = { k, x0, y0, W, h: wall.h, cx,
        glass: { x: sx(O.x0), y: sy(O.top), w: (O.x1 - O.x0) * k, h: (O.bottom - O.top) * k, arcY: sy(O.arcY), r: O.r * k },
        frame: { x: sx(F.x0), y: sy(F.y0), w: (F.x1 - F.x0) * k, h: (F.y1 - F.y0) * k },
        sill: { x0: sx(this.SILL.x0), x1: sx(this.SILL.x1), y: sy(this.SILL.y) },
        rimY: sy(this.RIM_Y), sun: {} };
      for (const m in this.SUN) { const s = this.SUN[m]; out.sun[m] = { x: sx(s.x), y: sy(s.y), r: s.r * k }; }
      return out;
    },
  };
  // ==== RECIPE END ====

module.exports = { RECIPE };
if (require.main !== module) return;

// ---------------------------------------------------------------------------------------------- RECIPE sync check
const block = s => { const a = s.indexOf('// ==== RECIPE BEGIN ===='), b = s.indexOf('// ==== RECIPE END ===='); return a < 0 || b < 0 ? null : s.slice(a, b).replace(/\s+/g, ' '); };
{
  const me = fs.readFileSync(__filename, 'utf8'), ta = fs.readFileSync(TA, 'utf8');
  if (process.argv[2] === 'sync') {
    const a = me.indexOf('// ==== RECIPE BEGIN ===='), b = me.indexOf('// ==== RECIPE END ====');
    const ta2 = ta.slice(0, ta.indexOf('// ==== RECIPE BEGIN ====')) + me.slice(a, b) + ta.slice(ta.indexOf('// ==== RECIPE END ===='));
    fs.writeFileSync(TA, ta2); console.log('RECIPE synced into table_art.js'); process.exit(0);
  }
  console.log(block(me) === block(ta) ? 'RECIPE: table_art.js carries the same RECIPE ✓' : 'RECIPE MISMATCH between env_scenes.js and table_art.js — run `node tools/env_scenes.js sync`');
}

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const NAMES = [...SEASONS.flatMap(m => ['env/wall_' + m, 'env/plant_' + m]), 'env/bakery', 'env/flour', 'env/rollingpin', 'env/jar', 'particles/crumb', 'particles/heart', 'particles/petal', 'particles/leaf', 'particles/snow', 'particles/mote'];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556], [720, 960]];
const PAL = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#8E44AD', '#6840A8'], pink: ['#FF8FC0', '#C9558A'] };
const ROOF = [PAL.red, PAL.blue, PAL.yellow];

// ---- a fake layout (DESIGN §2, zero insets, age 4) ----
function fakeLayout(W, H) {
  const portrait = H > W;
  const ins = { top: 0, left: 0, right: 0, bottom: 0 };
  const wallH = Math.round(H * (portrait ? 0.2 : 0.3));
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
  const hud = { x: W - 160, y: 16, w: 144, h: 64 };
  const wall = { x: 0, y: 0, w: W, h: wallH }, table = { x: 0, y: wallH, w: W, h: H - wallH };
  const play = { x0: 16, y0: Math.max(wallH + 10, bubble.y + bubble.h + 12, hud.y + hud.h + 12), x1: W - 16, y1: H - 14 };
  const houseS = 170, roadW = 78, cartS = Math.round(1.05 * houseS);
  const bw = 210, bh = Math.round(210 * 240 / 260);
  const bakery = portrait ? { x: Math.round(W * 0.3 - bw / 2), y: play.y1 - bh, w: bw, h: bh } : { x: play.x0 + 6, y: Math.round((play.y0 + play.y1) / 2 - bh / 2 + 30), w: bw, h: bh };
  const start = { x: bakery.x + bw / 2, y: bakery.y + bh - 4 };
  return { W, H, ins, portrait, tall: H / W > 1.6, phone: Math.max(W, H) / Math.min(W, H) > 1.9, bubble, hud, wall, table, play, bakery, start, houseS, roadW, cartS, hitR: 0.6 * cartS + 14 };
}
// ---- a fake road tree: Catmull-Rom through hand-picked waypoints, resampled every 8 px ----
function crSpline(P) {
  const out = [], Q = [P[0], ...P, P[P.length - 1]];
  for (let i = 1; i < Q.length - 2; i++) for (let t = 0; t < 1; t += 0.02) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]], t2 = t * t, t3 = t2 * t;
    out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
  }
  out.push(P[P.length - 1].slice());
  return out;
}
function resample(dense, step) {
  const pts = [dense[0].slice()], cum = [0]; let acc = 0, next = step;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= acc + l) { const t = (next - acc) / l; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); cum.push(next); next += step; }
    acc += l;
  }
  const last = dense[dense.length - 1]; if (acc - cum[cum.length - 1] > 1) { pts.push(last.slice()); cum.push(acc); }
  return { pts, cum, len: cum[cum.length - 1] };
}
function fakeMap(L, variant) {
  const { W, H, play: p, start: S0, houseS: S } = L, pw = p.x1 - p.x0, ph = p.y1 - p.y0;
  const nodes = [], edges = [], houses = [];
  const node = (x, y) => (nodes.push({ x, y }), nodes.length - 1);
  const edge = (a, b, via) => { const P = [[nodes[a].x, nodes[a].y], ...via, [nodes[b].x, nodes[b].y]]; const r = resample(crSpline(P), 8); edges.push({ id: 'e' + edges.length, from: a, to: b, ...r }); };
  const root = node(S0.x, S0.y);
  if (!L.portrait) {
    const hy = [p.y0 + S * 0.95 + 26, p.y0 + ph * 0.64 + 20, p.y1 - 18];
    const hx = [W - S / 2 - 54, W - S * 1.5 - 110, W - S / 2 - 54];
    hy[1] = p.y0 + ph * 0.78;
    if (variant === 'three') { hx[1] = W - S / 2 - 54 - Math.min(300, pw * 0.1); }
    const F1 = node(p.x0 + pw * 0.38, p.y0 + ph * 0.5 + 18);
    edge(root, F1, [[S0.x + 110, S0.y + 6], [p.x0 + pw * 0.26, p.y0 + ph * 0.58]]);
    const H0 = node(hx[0], hy[0]); houses.push(nodes[H0]);
    edge(F1, H0, [[p.x0 + pw * 0.48, p.y0 + ph * 0.2], [hx[0] - S * 0.95, hy[0] + 2]]);
    const F2 = node(p.x0 + pw * 0.56, p.y0 + ph * 0.7);
    edge(F1, F2, [[p.x0 + pw * 0.47, p.y0 + ph * 0.66]]);
    const H1 = node(hx[1], hy[1]); houses.push(nodes[H1]);
    edge(F2, H1, [[hx[1] - S * 0.75, hy[1] - 4]]);
    const H2 = node(hx[2], hy[2]); houses.push(nodes[H2]);
    edge(F2, H2, [[p.x0 + pw * 0.66, p.y1 - 40], [hx[2] - S * 0.9, hy[2] - 4]]);
  } else {
    const hy = p.y0 + S * 0.95 + 24, hx = [W * 0.19, W * 0.5, W * 0.81];
    const F1 = node(W * 0.52, p.y0 + (S0.y - p.y0) * 0.52);
    edge(root, F1, [[S0.x + 140, S0.y - 14], [W * 0.62, S0.y - (S0.y - p.y0) * 0.22]]);
    for (let i = 0; i < 3; i++) {
      const Hn = node(hx[i], hy + (i === 1 ? 26 : 0)); houses.push(nodes[Hn]);
      const fy = nodes[F1].y, mid = [nodes[F1].x + (hx[i] - nodes[F1].x) * 0.8, hy + (fy - hy) * 0.42];
      edge(F1, Hn, i === 1 ? [[W * 0.5, (fy + hy) / 2]] : [mid]);
    }
  }
  return { roads: { key: `${W}x${H}:${variant || 'a'}`, nodes, edges }, houses };
}

function pageScene({ W, H, L, season, roads, houses, src, opt, roofs, crop }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    window.BD.Assets = { img: k => im[k] || null };
    const T = window.BD.TableArt; T._reset();
    const dpr = crop ? crop.s : 1;
    const c = document.createElement('canvas'); c.width = (crop ? crop.w : W) * dpr; c.height = (crop ? crop.h : H) * dpr; const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, crop ? -crop.x * dpr : 0, crop ? -crop.y * dpr : 0);
    const S = L.houseS, hb = houses.map(h => ({ x0: h.x - S / 2 - 6, y0: h.y - 0.95 * S - 6, x1: h.x + S / 2 + 6, y1: h.y + 8 }));
    const cart = { x0: L.start.x - L.cartS / 2, y0: L.start.y - L.cartS * 0.75, x1: L.start.x + L.cartS / 2, y1: L.start.y + 6 };
    const t = opt.t || 3.2;
    const t0 = performance.now();
    T.drawWall(g, L, season, t, { dpr });
    T.drawTable(g, L, season, { keep: hb.concat([cart]), seed: 3, roads, dpr });
    T.drawRoads(g, roads, L, Object.assign({ dpr }, opt.roads || {}));
    T.drawBakery(g, L, t, { puff: 0.8 });
    const tBuild = performance.now() - t0;
    // houses (fake boxes): gingerbread body, coloured roof + door, sign board
    houses.slice().sort((a, b) => a.y - b.y).forEach((h, i) => {
      const x = h.x - S / 2, y = h.y - 0.95 * S, col = roofs[houses.indexOf(h) % roofs.length];
      g.fillStyle = 'rgba(90,56,38,0.22)'; g.beginPath(); g.ellipse(h.x, h.y, S * 0.55, S * 0.09, 0, 0, 7); g.fill();
      g.fillStyle = '#C98A52'; g.strokeStyle = '#7E4E2A'; g.lineWidth = 4; g.beginPath(); g.roundRect(x + S * 0.08, y + S * 0.36, S * 0.84, S * 0.59, 10); g.fill(); g.stroke();
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.beginPath(); g.moveTo(x, y + S * 0.42); g.lineTo(h.x, y); g.lineTo(x + S, y + S * 0.42); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = col[0]; g.beginPath(); g.roundRect(h.x - S * 0.12, h.y - S * 0.3, S * 0.24, S * 0.3, 8); g.fill(); g.stroke();
      g.fillStyle = '#F3E6CC'; g.strokeStyle = '#9C7A5A'; g.beginPath(); g.roundRect(h.x - S * 0.22, y + S * 0.4, S * 0.44, S * 0.22, 8); g.fill(); g.stroke();
    });
    // fake cart box at the start
    const cs = L.cartS, cx = L.start.x + 40, cy = L.start.y;
    g.fillStyle = 'rgba(90,56,38,0.25)'; g.beginPath(); g.ellipse(cx, cy, cs * 0.45, cs * 0.08, 0, 0, 7); g.fill();
    g.fillStyle = '#D29A5F'; g.strokeStyle = '#7A4C27'; g.lineWidth = 4; g.beginPath(); g.roundRect(cx - cs * 0.42, cy - cs * 0.5, cs * 0.84, cs * 0.42, 12); g.fill(); g.stroke();
    g.fillStyle = '#B7B2B8'; g.strokeStyle = '#6B6574'; g.beginPath(); g.arc(cx - cs * 0.05, cy - cs * 0.62, cs * 0.2, 0, 7); g.fill(); g.stroke();
    for (const dx of [-0.26, 0.26]) { g.fillStyle = '#7A5A44'; g.beginPath(); g.arc(cx + dx * cs, cy - cs * 0.1, cs * 0.12, 0, 7); g.fill(); g.stroke(); }
    // a few skid puffs behind the cart + front particles
    T.drawSkid(g, cx - cs * 0.52, cy - 6, 14, 0.8); T.drawSkid(g, cx - cs * 0.68, cy - 10, 10, 0.5);
    const pk = { spring: 'petal', summer: 'mote', autumn: 'leaf', winter: 'snow' }[season];
    for (let i = 0; i < 6; i++) g.drawImage(im['particles/' + pk], ((i * 0.71 + 0.33) % 1) * W, L.table.y + ((i * 0.43 + 0.2) % 1) * L.table.h * 0.9, 22, 22);
    g.drawImage(im['particles/heart'], houses[0].x - 10, houses[0].y - S * 1.15, 26, 26);
    // UI placeholders
    const rr = (r, fill) => { g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 22); g.fillStyle = fill; g.fill(); };
    rr(L.bubble, 'rgba(255,255,255,0.93)'); rr(L.hud, 'rgba(255,255,255,0.9)');
    // timing of cached frames
    const t1 = performance.now();
    const sc = document.createElement('canvas'); sc.width = c.width; sc.height = c.height; const sg = sc.getContext('2d'); sg.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < 60; i++) { const g = sg; T.drawWall(g, L, season, t + i / 60, { dpr }); T.drawTable(g, L, season, { keep: hb.concat([cart]), seed: 3, roads, dpr }); T.drawRoads(g, roads, L, { dpr, glowEdges: ['e0'], glow: 0.5, t: i / 60 }); T.drawBakery(g, L, t, { puff: 0.5 }); }
    sg.getImageData(0, 0, 1, 1);   // flush the GPU queue so the timing is real
    const perFrame = (performance.now() - t1) / 60;
    return { url: c.toDataURL('image/png'), decor: T.decorRects(), tBuild, perFrame, wall: T.wallLayout(L) };
  })();
}

const hit = (a, b) => a.x < b.x1 && a.x + a.w > b.x0 && a.y < b.y1 && a.y + a.h > b.y0;
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const cr = (a, b) => { const x = lum(hexRgb(a)), y = lum(hexRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  for (const fn of fs.readdirSync(ART)) if (/^env_/.test(fn) && fn.endsWith('.png') && !process.argv[2]) fs.unlinkSync(path.join(ART, fn));
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  await pg.addScriptTag({ content: fs.readFileSync(TA, 'utf8') });
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const issues = [], perf = [];
  for (const [W, H] of VPS) {
    const L = fakeLayout(W, H), { roads, houses } = fakeMap(L);
    for (const m of SEASONS) {
      const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
      const r = await pg.evaluate(pageScene, { W, H, L, season: m, roads, houses, src: SRC, roofs: ROOF, opt: { roads: { snow: m === 'winter' ? 1 : 0 } } });
      save(r.url, path.join(ART, `env_scene_${m}_${vp}.png`));
      perf.push(`${vp.padEnd(9)} ${m.padEnd(7)} first draw (builds caches) ${r.tBuild.toFixed(1)} ms · cached frame (wall+table+roads w/ glow+bakery) ${r.perFrame.toFixed(2)} ms`);
      const S = L.houseS, keep = [{ n: 'hud', x0: L.hud.x, y0: L.hud.y, x1: L.hud.x + L.hud.w, y1: L.hud.y + L.hud.h }, { n: 'bubble', x0: L.bubble.x, y0: L.bubble.y, x1: L.bubble.x + L.bubble.w, y1: L.bubble.y + L.bubble.h },
        { n: 'bakery', x0: L.bakery.x, y0: L.bakery.y, x1: L.bakery.x + L.bakery.w, y1: L.bakery.y + L.bakery.h },
        ...houses.map((h, i) => ({ n: 'house' + i, x0: h.x - S / 2, y0: h.y - 0.95 * S, x1: h.x + S / 2, y1: h.y }))];
      for (const d of r.decor) for (const k of keep) if (hit(d, k)) issues.push(`${vp} ${m}: ${d.key} overlaps ${k.n}`);
      for (const d of r.decor) for (const e of roads.edges) for (const p of e.pts) if (p[0] > d.x + 6 && p[0] < d.x + d.w - 6 && p[1] > d.y + 6 && p[1] < d.y + d.h - 6) { issues.push(`${vp} ${m}: ${d.key} on road ${e.id}`); break; }
      if (m === 'spring') { const w = r.wall; console.log(`${vp.padEnd(9)} wall h ${w.h} k ${w.k.toFixed(4)} window cx ${w.cx} glass ${Math.round(w.glass.x)}..${Math.round(w.glass.x + w.glass.w)} × ${Math.round(w.glass.y)}..${Math.round(w.glass.y + w.glass.h)} sill y ${Math.round(w.sill.y)} | decor ${r.decor.length}`); }
    }
  }
  console.log(perf.join('\n'));
  console.log(issues.length ? 'PLACEMENT ISSUES:\n  ' + issues.join('\n  ') : 'placement: no decoration overlaps a house, the bakery, HUD, bubble or a road');
  // ---- junction close-ups at 3× (2-way fork landscape, 3-way fork portrait) ----
  if (!only || only === 'junction') {
    const parts = [];
    for (const [W, H, m] of [[1556, 720, 'spring'], [720, 1556, 'winter'], [960, 720, 'autumn']]) {
      const L = fakeLayout(W, H), { roads, houses } = fakeMap(L), f = roads.nodes[roads.edges[1].from];
      const crop = { x: f.x - 130, y: f.y - 110, w: 260, h: 220, s: 3 };
      const r = await pg.evaluate(pageScene, { W, H, L, season: m, roads, houses, src: SRC, roofs: ROOF, opt: { roads: { snow: m === 'winter' ? 1 : 0 } }, crop });
      parts.push(r.url);
    }
    const url = await pg.evaluate(async (urls) => {
      const ims = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
      const c = document.createElement('canvas'); c.width = ims.reduce((s, i) => s + i.width + 12, -12); c.height = ims[0].height; const g = c.getContext('2d');
      g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); let x = 0; for (const i of ims) { g.drawImage(i, x, 0); x += i.width + 12; }
      return c.toDataURL('image/png');
    }, parts);
    save(url, path.join(ART, 'env_junction_3x.png'));
  }
  // ---- states: reveal 0.35, reveal 0.7, hint glow + trail, winter snow ----
  if (!only || only === 'states') {
    const W = 960, H = 720, L = fakeLayout(W, H), { roads, houses } = fakeMap(L), parts = [];
    for (const [m, ro] of [['spring', { reveal: 0.35 }], ['spring', { reveal: 0.7 }], ['summer', { glowEdges: ['e0', 'e2', 'e4'], glow: 1, trail: ['e0', 'e1'], trailT: 1, t: 0.4 }], ['winter', { snow: 1 }]]) {
      const r = await pg.evaluate(pageScene, { W, H, L, season: m, roads, houses: ro.reveal ? houses.slice(0, 0).concat(houses.slice(0, 1)) : houses, src: SRC, roofs: ROOF, opt: { roads: ro } });
      parts.push(r.url);
    }
    const url = await pg.evaluate(async (urls) => {
      const ims = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
      const w = ims[0].width / 2, h = ims[0].height / 2, c = document.createElement('canvas'); c.width = w * 2 + 10; c.height = h * 2 + 10; const g = c.getContext('2d');
      g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); ims.forEach((im, i) => g.drawImage(im, (i % 2) * (w + 10), Math.floor(i / 2) * (h + 10), w, h));
      return c.toDataURL('image/png');
    }, parts);
    save(url, path.join(ART, 'env_states_960x720.png'));
  }
  // ---- contrast: road body vs the cloth tints; answer colours vs the cloth ----
  const CL = { base: '#F6ECD8', spring: '#E3E6CF', summer: '#F1E3B9', autumn: '#EBD3B8', winter: '#DCE0E6' };
  console.log('WCAG contrast vs cloth (base / darkest check per season):');
  console.log('  road body #8C5E3F', Object.entries(CL).map(([k, v]) => `${k} ${cr('#8C5E3F', v).toFixed(2)}`).join(' · '), '| road outline #5A3826 vs base', cr('#5A3826', CL.base).toFixed(2));
  for (const [k, [base, dark]] of Object.entries(PAL)) console.log('  ' + k.padEnd(7), Object.entries(CL).map(([n, v]) => `${n} ${cr(base, v).toFixed(2)}/${cr(dark, v).toFixed(2)}`).join(' · '));
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
