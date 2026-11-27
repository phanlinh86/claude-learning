/* BD.TableArt (Tupi's Bakery Delivery) — the bakery table (play map), the biscuit roads, the back wall with the season
 * window, the bakery and wheel skid puffs. Pure canvas code over BD.Assets images (DESIGN §3, §4.4, §7, §8).
 *
 *   BD.TableArt.drawTable(ctx, layout, season, opt)   cream gingham cloth in layout.table (season tint of the check), a soft
 *       vignette, a shadow under the wooden rim, linen specks, flour dust + crumbs, seeded decorations (env/flour,
 *       env/rollingpin, env/jar, env/plant_<m>) kept away from opt.keep rects, layout.bakery / bubble / hud and (if given)
 *       the road polylines. opt = { keep: [{x0,y0,x1,y1}], seed, roads (optional, the roads object), alpha, dpr }.
 *       Cached bitmap per (W, H, season, seed, keep rects, roads.key) — a small LRU of 4 (two seasons crossfading).
 *   BD.TableArt.drawRoads(ctx, roads, layout, opt)    shadow → outline → biscuit shade/body → docking holes → cream icing
 *       bead borders → dashed icing centre line → sugar bumps, round "plaza" + icing rosette at every fork node.
 *       roads = { key, nodes:[{x,y}], edges:[{id, from, to, pts:[[x,y]…], len, cum:[…]}] }, layout.roadW = width.
 *       opt = { reveal 0..1 (pour-out from the root along the tree, children after their parent; default 1),
 *         glowEdges: [ids], glow 0..1 (hint: warm glowing marching dots ON the road), trail: [ids], trailT 0..1 (soft golden
 *         "driven" sheen), snow 0..1 (icing snow dusting), t (seconds, for the marching hint dots), quality 0.5..1, alpha, dpr }.
 *       The static road is ONE cached bitmap per (roads.key, W, H, roadW, dpr); reveal < 1 draws that bitmap through a clip
 *       of circles along the revealed path (+ a glossy pour front); the snow overlay is a second lazily-built bitmap.
 *   BD.TableArt.drawWall(ctx, layout, season, t, opt) the back wall (env/wall_<m> scaled to layout.wall.h, the window centred
 *       by RECIPE.wallLayout, the plaster strips repeated sideways) + a cheap live view through the glass: drifting clouds,
 *       a swaying blossom / amber branch (spring / autumn), falling snow (winter). opt = { alpha, quality, dpr }.
 *       Cached per (W, wall.h, season, window x, dpr); a frame = 1 wall blit + ≤ 30 tiny shapes + 1 window-frame blit.
 *   BD.TableArt.drawBakery(ctx, layout, t, opt)       env/bakery at layout.bakery (bottom-centre of the box, fit inside),
 *       a soft contact shadow, the oven window glow pulse, opt.puff 0..1 steam puffs from the chimney. opt = { alpha }.
 *   BD.TableArt.drawSkid(ctx, x, y, r, a)             a soft sugar-dust puff (radius r, alpha a).
 *   BD.TableArt.wallLayout(layout)  → RECIPE.wallLayout (screen geometry of the wall: k, window x, glass, sill, sun …)
 *   BD.TableArt.bumps(roads, layout) → [{edge, s, x, y}] the sugar-bump spots (the world kicks the cart's bounce there).
 *   BD.TableArt.bakeryPoints(layout) → {door, oven, chimney, box} in screen px.
 *   BD.TableArt.decorRects() → last placed table decorations [{key, x, y, w, h}] (tests / debug).
 *   BD.TableArt.RECIPE — the wall RECIPE (same literal as tools/env_scenes.js), BD.TableArt.SPRITES — asset keys used.
 *   BD.TableArt._reset() — drop every cache (tests; also call on memory pressure / dpr change).
 *
 * season: 'spring'|'summer'|'autumn'|'winter' or 0..3. Rects: layout.wall/table/bakery/bubble/hud are {x, y, w, h}
 * (top-left); keep rects are {x0, y0, x1, y1}. Node-safe at load (no DOM until the first draw); without a DOM (node tests)
 * every draw falls back to drawing straight into ctx without caches. Nothing is allocated per frame on the cached paths.
 */
(function (BD) {
  'use strict';
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const sIndex = s => (typeof s === 'number' ? ((Math.round(s) % 4) + 4) % 4 : Math.max(0, SEASONS.indexOf(s)));
  // ---- palette (DESIGN §3) ----
  const CLOTH = '#F6ECD8';
  const CHECK = ['#E3E6CF', '#F1E3B9', '#EBD3B8', '#DCE0E6'];
  const ROAD = { body: '#8C5E3F', shade: '#6E4630', ol: '#5A3826', light: '#A0714F', icing: '#FFF4E2', icingShade: '#D9C3A5', caramel: '#E0A867' };
  const SPRITES = ['env/wall_spring', 'env/wall_summer', 'env/wall_autumn', 'env/wall_winter', 'env/bakery', 'env/flour', 'env/rollingpin', 'env/jar',
    'env/plant_spring', 'env/plant_summer', 'env/plant_autumn', 'env/plant_winter'];
  // decoration sprites: [w, h, anchorX, anchorY] (viewBox, bottom-centre anchors; tools/art_env.js)
  const DEC = { flour: [120, 60, 60, 56], rollingpin: [200, 60, 100, 54], jar: [90, 110, 45, 106], plant: [120, 140, 60, 136] };
  const BAKERY = { w: 260, h: 240, door: [130, 236], oven: [192, 170, 21], chimney: [196, 28] };

  // =================================================================================================================
  // RECIPE — copied verbatim from tools/env_scenes.js (env_scenes checks they are identical)
  // =================================================================================================================
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

  // ---- small helpers ----
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hasDOM = () => typeof document !== 'undefined' && !!document.createElement;
  const hasP2D = () => typeof Path2D !== 'undefined';
  function canvas(w, h) {
    if (!hasDOM()) return null;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  }
  const img = k => (BD.Assets && BD.Assets.img ? BD.Assets.img(k) : null);
  function dprOf(ctx, opt) {
    if (opt && opt.dpr) return clamp(opt.dpr, 1, 3);
    try { const m = ctx.getTransform && ctx.getTransform(); if (m && m.a) return clamp(Math.abs(m.a), 1, 2); } catch (e) { /* node mock */ }
    return 1;
  }
  const hstr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  /** soft round sprite (cached): radial gradient of colour c, alpha a0 at the centre → 0 */
  const SOFT = {};
  function soft(c, a0, size) {
    const key = c + a0 + size;
    if (SOFT[key] !== undefined) return SOFT[key];
    const cv = canvas(size, size); if (!cv) return (SOFT[key] = null);
    const g = cv.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${c},${a0})`); gr.addColorStop(0.5, `rgba(${c},${a0 * 0.5})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return (SOFT[key] = cv);
  }

  // =================================================================================================================
  // TABLE
  // =================================================================================================================
  const TCACHE = [];          // [{key, c, x, y, w, h, decor}] LRU (≤ 4)
  let lastTable = null;       // fast path: same args as the last call → that entry, no string building
  let lastDecor = [];
  function tableKey(L, si, seed, keep, roads) {
    let s = L.W + 'x' + L.H + '|' + si + '|' + seed + '|' + (roads ? roads.key : '') + '|' + (L.roadW || 0);
    for (const r of keep) s += '|' + Math.round(r.x0) + ',' + Math.round(r.y0) + ',' + Math.round(r.x1) + ',' + Math.round(r.y1);
    const b = L.bakery; if (b) s += '|b' + Math.round(b.x) + ',' + Math.round(b.y);
    return s;
  }
  function tableRect(L) {
    if (L.table) return L.table;
    const wy = L.wall ? L.wall.y + L.wall.h : Math.round(L.H * (L.portrait ? 0.2 : 0.3));
    return { x: 0, y: wy, w: L.W, h: L.H - wy };
  }
  /** the rects decorations must avoid (screen coords, {x0,y0,x1,y1}) */
  function keepRects(L, opt) {
    const out = [];
    for (const r of (opt.keep || [])) out.push(r);
    const add = (r, m) => { if (r) out.push({ x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m }); };
    add(L.bakery, 16); add(L.bubble, 10); add(L.hud, 10);
    if (L.start) out.push({ x0: L.start.x - 90, y0: L.start.y - 90, x1: L.start.x + 90, y1: L.start.y + 60 });
    return out;
  }
  /** min distance² from (x,y) to any road point (coarse: every 2nd point) */
  function roadD2(roads, x, y) {
    let best = 1e12;
    for (const e of roads.edges) { const p = e.pts; for (let i = 0; i < p.length; i += 2) { const dx = p[i][0] - x, dy = p[i][1] - y, d = dx * dx + dy * dy; if (d < best) best = d; } }
    return best;
  }
  function placeDecor(L, si, seed, keep, roads, T) {
    const r = rng(0xBA4E + seed * 977 + si * 31 + Math.round(L.W) * 7 + Math.round(L.H) * 3);
    const m = SEASONS[si], sc = Math.min(L.W, L.H) / 720;
    const list = [['env/rollingpin', 'rollingpin', 0.78], ['env/plant_' + m, 'plant', 0.8], ['env/jar', 'jar', 0.74], ['env/flour', 'flour', 1.1], ['env/flour', 'flour', 0.9], ['env/flour', 'flour', 0.8]];
    const placed = [], roadClear = (L.roadW || 72) / 2 + 22;
    for (const [key, kind, s0] of list) {
      const d = DEC[kind], s = s0 * sc * (0.92 + r() * 0.16), w = d[0] * s, h = d[1] * s;
      const rot = kind === 'rollingpin' ? (r() - 0.5) * 0.9 : kind === 'flour' ? (r() - 0.5) * 0.6 : 0;
      for (let tries = 0; tries < 90; tries++) {
        // prefer the table's edges (decor sits at the rim / sides, the middle stays for the map)
        const edge = r() < 0.75;
        let x = T.x + r() * T.w, y = T.y + h * 0.7 + r() * (T.h - h * 0.6);
        if (edge) { const side = Math.floor(r() * 4); if (side === 0) x = T.x + w * 0.2 + r() * w * 0.4; else if (side === 1) x = T.x + T.w - w * 0.2 - r() * w * 0.4; else if (side === 2) y = T.y + T.h - r() * h * 0.3; else y = T.y + h * 0.9 + r() * h * 0.3; }
        const ext = Math.abs(Math.sin(rot)) * w * 0.5;
        const bx = { x0: x - w * 0.5 - 8, y0: y - h - ext - 8, x1: x + w * 0.5 + 8, y1: y + ext + 6 };
        if (bx.y0 < T.y + 4 || x < T.x - w * 0.15 || x > T.x + T.w + w * 0.15 || y > T.y + T.h + h * 0.25) continue;
        let bad = false;
        for (const k of keep) if (bx.x0 < k.x1 && bx.x1 > k.x0 && bx.y0 < k.y1 && bx.y1 > k.y0) { bad = true; break; }
        if (!bad) for (const p of placed) if (bx.x0 < p.bx.x1 + 10 && bx.x1 > p.bx.x0 - 10 && bx.y0 < p.bx.y1 + 10 && bx.y1 > p.bx.y0 - 10) { bad = true; break; }
        if (!bad && roads) {
          const rr = roadClear + Math.min(w, h) * 0.5;
          if (roadD2(roads, x, y - h * 0.5) < rr * rr || roadD2(roads, x - w * 0.4, y - h * 0.3) < roadClear * roadClear || roadD2(roads, x + w * 0.4, y - h * 0.3) < roadClear * roadClear) bad = true;
        }
        if (bad) continue;
        placed.push({ key, kind, x, y, w, h, rot, s, bx });
        break;
      }
    }
    return placed;
  }
  function paintTable(g, L, si, seed, keep, roads, T) {
    const W = T.w, H = T.h, r = rng(0x7AB1E + si * 13 + seed * 101);
    g.fillStyle = CLOTH; g.fillRect(T.x, T.y, W, H);
    // gingham: vertical + horizontal bands in the season tint, 55 % → crossings darker (a calm, low-contrast check)
    const cell = Math.round(clamp(Math.min(L.W, L.H) / 720 * 46, 34, 60)), band = cell / 2;
    g.save(); g.globalAlpha = 0.55; g.fillStyle = CHECK[si];
    const ox = T.x + ((L.W / 2) % cell) - cell, oy = T.y;
    for (let x = ox; x < T.x + W; x += cell) g.fillRect(x, T.y, band, H);
    for (let y = oy; y < T.y + H; y += cell) g.fillRect(T.x, y, W, band);
    g.restore();
    // woven thread hint: a hairline on the band edges
    g.save(); g.globalAlpha = 0.18; g.fillStyle = '#FFFFFF';
    for (let x = ox; x < T.x + W; x += cell) g.fillRect(x + band - 1, T.y, 1, H);
    for (let y = oy; y < T.y + H; y += cell) g.fillRect(T.x, y + band - 1, W, 1);
    g.restore();
    // linen specks
    g.save();
    const nS = Math.round(W * H / 900);
    for (let i = 0; i < nS; i++) { g.globalAlpha = 0.05 + r() * 0.06; g.fillStyle = r() < 0.5 ? '#FFFFFF' : '#B99A72'; g.fillRect(T.x + r() * W, T.y + r() * H, 1 + r() * 1.4, 1); }
    g.restore();
    // soft vignette (warm, edges only)
    const cx = T.x + W / 2, cy = T.y + H / 2, R = Math.hypot(W, H) / 2;
    const vg = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.02);
    vg.addColorStop(0, 'rgba(150,105,60,0)'); vg.addColorStop(1, 'rgba(150,105,60,0.16)');
    g.fillStyle = vg; g.fillRect(T.x, T.y, W, H);
    // the rim's shadow on the cloth
    const sg = g.createLinearGradient(0, T.y, 0, T.y + 22);
    sg.addColorStop(0, 'rgba(90,56,38,0.28)'); sg.addColorStop(1, 'rgba(90,56,38,0)');
    g.fillStyle = sg; g.fillRect(T.x, T.y, W, 22);
    // decorations + their flour / crumbs
    const dec = placeDecor(L, si, seed, keep, roads, T);
    for (const d of dec) {
      const im = img(d.key);
      g.save(); g.translate(d.x, d.y); g.rotate(d.rot);
      const s = DEC[d.kind];
      if (d.kind === 'flour') g.globalAlpha = 0.7;
      if (im) g.drawImage(im, -s[2] * d.s, -s[3] * d.s, d.w, d.h);
      else { g.fillStyle = 'rgba(180,140,100,0.5)'; g.fillRect(-d.w / 2, -d.h, d.w, d.h); }
      g.restore();
      // crumbs near the jar / rolling pin
      if (d.kind !== 'flour') {
        for (let i = 0; i < 6; i++) {
          const a = r() * 6.283, rr = d.w * (0.45 + r() * 0.35), x = d.x + Math.cos(a) * rr, y = d.y - d.h * 0.2 + Math.sin(a) * rr * 0.5;
          if (keep.some(k => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1)) continue;
          crumbAt(g, x, y, 2 + r() * 2.4, r() * 6.283);
        }
      }
    }
    // scattered flour specks + crumbs (avoid keep rects)
    const nF = Math.round(W * H / 26000);
    for (let i = 0; i < nF; i++) {
      const x = T.x + r() * W, y = T.y + 24 + r() * (H - 24);
      if (keep.some(k => x > k.x0 - 6 && x < k.x1 + 6 && y > k.y0 - 6 && y < k.y1 + 6)) continue;
      if (r() < 0.6) { g.fillStyle = 'rgba(255,253,248,' + (0.5 + r() * 0.4).toFixed(2) + ')'; g.beginPath(); g.ellipse(x, y, 2 + r() * 5, 1.4 + r() * 2.4, r() * 3, 0, 6.283); g.fill(); }
      else crumbAt(g, x, y, 1.6 + r() * 2, r() * 6.283);
    }
    return dec;
  }
  function crumbAt(g, x, y, s, a) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#C9945E'; g.strokeStyle = '#8C5E3F'; g.lineWidth = Math.max(0.8, s * 0.28);
    g.beginPath(); g.moveTo(-s, 0.2 * s); g.lineTo(-0.4 * s, -0.9 * s); g.lineTo(0.7 * s, -0.7 * s); g.lineTo(s, 0.3 * s); g.lineTo(0.1 * s, s); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  function drawTable(ctx, L, season, opt) {
    opt = opt || {};
    const si = sIndex(season), seed = opt.seed | 0, keep0 = opt.keep || null, roads = opt.roads || null;
    const T = tableRect(L), dpr = dprOf(ctx, opt);
    let e = lastTable;
    if (!(e && e.W === L.W && e.H === L.H && e.si === si && e.seed === seed && e.keepRef === keep0 && e.roadsRef === roads && e.dpr === dpr && e.T.y === T.y)) {
      const keep = keepRects(L, opt);
      const key = tableKey(L, si, seed, keep, roads) + '|' + dpr;
      e = null;
      for (let i = 0; i < TCACHE.length; i++) if (TCACHE[i].key === key) { e = TCACHE[i]; TCACHE.splice(i, 1); TCACHE.push(e); break; }
      if (!e) {
        const c = canvas(T.w * dpr, T.h * dpr);
        if (!c) { const d = paintTable(ctx, L, si, seed, keep, roads, T); lastDecor = d.map(q => ({ key: q.key, x: q.x - q.w / 2, y: q.y - q.h, w: q.w, h: q.h })); return; }
        const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, -T.x * dpr, -T.y * dpr);
        const d = paintTable(g, L, si, seed, keep, roads, T);
        e = { key, c, decor: d.map(q => ({ key: q.key, x: q.x - q.w / 2, y: q.y - q.h, w: q.w, h: q.h })) };
        TCACHE.push(e); if (TCACHE.length > 4) TCACHE.shift();
      }
      e.W = L.W; e.H = L.H; e.si = si; e.seed = seed; e.keepRef = keep0; e.roadsRef = roads; e.dpr = dpr; e.T = T;
      lastTable = e; lastDecor = e.decor;
    }
    const a = opt.alpha == null ? 1 : opt.alpha;
    if (a < 1) { ctx.save(); ctx.globalAlpha *= a; ctx.drawImage(e.c, T.x, T.y, T.w, T.h); ctx.restore(); }
    else ctx.drawImage(e.c, T.x, T.y, T.w, T.h);
  }

  // =================================================================================================================
  // ROADS
  // =================================================================================================================
  let RC = null;              // road cache: {roads, key, W, H, rw, dpr, bmp, bx, by, bw, bh, snowBmp, edges: Map, D0, maxD, …}
  const DASH_GLOW = [0, 1];   // reused dash arrays (values set when used)
  const NO_DASH = [];
  function analyse(roads, rw) {
    const nodes = roads.nodes, edges = roads.edges, n = nodes.length;
    const deg = new Array(n).fill(0), inc = new Array(n).fill(0);
    for (const e of edges) { deg[e.from]++; deg[e.to]++; inc[e.to]++; }
    let root = 0; for (let i = 0; i < n; i++) if (inc[i] === 0 && deg[i] > 0) { root = i; break; }
    // root distance per edge (parents first)
    const D0 = new Map(), byFrom = new Map();
    for (const e of edges) { if (!byFrom.has(e.from)) byFrom.set(e.from, []); byFrom.get(e.from).push(e); }
    let maxD = 0; const stack = [[root, 0]];
    while (stack.length) {
      const [nd, d] = stack.pop();
      for (const e of byFrom.get(nd) || []) { if (D0.has(e.id)) continue; D0.set(e.id, d); maxD = Math.max(maxD, d + e.len); stack.push([e.to, d + e.len]); }
    }
    for (const e of edges) if (!D0.has(e.id)) { D0.set(e.id, 0); maxD = Math.max(maxD, e.len); }
    const forks = []; for (let i = 0; i < n; i++) if (deg[i] >= 3 || (deg[i] >= 2 && i !== root && inc[i] === 1 && deg[i] > 2)) forks.push(i);
    const plazaR = rw * 0.74;
    return { root, D0, maxD, forks, plazaR, deg };
  }
  /** offset polyline (left = +1 / right = −1 normal) */
  function offsetPts(pts, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      out.push([pts[i][0] - ty * d, pts[i][1] + tx * d]);
    }
    return out;
  }
  /** points every `step` px along a polyline (returns [[x,y,s]…]) */
  function resample(pts, step, start) {
    const out = []; let acc = 0, next = start || 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (next <= acc + l) { const t = l ? (next - acc) / l : 0; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, next]); next += step; }
      acc += l;
    }
    return out;
  }
  function pointAt(e, s) {
    const c = e.cum, p = e.pts; s = clamp(s, 0, e.len);
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const t = c[hi] > c[lo] ? (s - c[lo]) / (c[hi] - c[lo]) : 0;
    return [p[lo][0] + (p[hi][0] - p[lo][0]) * t, p[lo][1] + (p[hi][1] - p[lo][1]) * t];
  }
  /** sugar-bump spots: every 140 px from s = 70 on each edge, kept ≥ plaza + 30 from fork / root and ≥ 60 from the end */
  function bumps(roads, L) {
    const rw = (L && L.roadW) || 72, A = analyse(roads, rw), out = [];
    for (const e of roads.edges) {
      const s0 = (A.forks.indexOf(e.from) >= 0 ? A.plazaR + 30 : 90), s1 = e.len - 70;
      for (let s = 70; s <= s1; s += 140) { if (s < s0) continue; const p = pointAt(e, s); out.push({ edge: e.id, s, x: p[0], y: p[1] }); }
    }
    return out;
  }
  function pathOf(pts) {
    if (!hasP2D()) return null;
    const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    return p;
  }
  function strokePts(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  function bead(g, x, y, r, col) {
    g.fillStyle = 'rgba(90,56,38,0.38)'; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.35, r * 1.05, 0, 6.283); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x - r * 0.32, y - r * 0.34, r * 0.36, 0, 6.283); g.fill();
  }
  /** paint the whole static road tree into g (screen coords) */
  function paintRoads(g, roads, L, A) {
    const rw = L.roadW || 72, E = roads.edges, N = roads.nodes;
    const fk = A.forks.map(i => N[i]);
    // every layer is ONE path (all edges as sub-paths) so translucent layers never stack where branches overlap
    const allStroke = (w, col, dy, plaza) => {
      g.save(); if (dy) g.translate(0, dy); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (const e of E) { g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); }
      g.stroke();
      if (plaza !== false) { g.fillStyle = col; g.beginPath(); for (const p of fk) { const r = A.plazaR + (w - rw) / 2; g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, 6.283); } g.fill(); }
      g.restore();
    };
    // 1 soft shadow (two passes)
    allStroke(rw + 22, 'rgba(90,56,38,0.08)', rw * 0.12, false);
    allStroke(rw + 10, 'rgba(90,56,38,0.16)', rw * 0.09, false);
    // 2 outline, 3 shade (biscuit thickness, shows at the bottom), 4 body (lifted)
    allStroke(rw + 6, ROAD.ol, 0);
    allStroke(rw, ROAD.shade, 0);
    allStroke(rw - 9, ROAD.body, -rw * 0.045);
    // a soft baked sheen down the middle
    g.save(); g.globalAlpha = 0.35; allStroke(rw * 0.42, ROAD.light, -rw * 0.08, false); g.restore();
    // 5 docking holes (biscuit), skipping plazas
    const nearFork = (x, y, r) => { for (const p of fk) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < r * r) return true; } return false; };
    const otherBody = (x, y, eid, r) => {
      for (const e of E) { if (e.id === eid) continue; const p = e.pts; for (let i = 0; i < p.length; i++) { const dx = p[i][0] - x, dy = p[i][1] - y; if (dx * dx + dy * dy < r * r) return true; } }
      return false;
    };
    const hr = Math.max(1.8, rw * 0.033);
    for (const e of E) for (const side of [-1, 1]) {
      const op = offsetPts(e.pts, side * rw * 0.27);
      for (const q of resample(op, 30, 15)) {
        if (nearFork(q[0], q[1], A.plazaR + 8) || otherBody(q[0], q[1], e.id, rw * 0.5 + 4)) continue;
        g.fillStyle = 'rgba(255,230,200,0.35)'; g.beginPath(); g.arc(q[0], q[1] + 1.2, hr, 0, 6.283); g.fill();
        g.fillStyle = ROAD.shade; g.beginPath(); g.arc(q[0], q[1], hr, 0, 6.283); g.fill();
      }
    }
    // 6 dashed icing centre line (skips plazas and the last 10 px)
    const lw = Math.max(4, rw * 0.075);
    for (const pass of [0, 1]) {
      g.save(); g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = pass ? ROAD.icing : 'rgba(90,56,38,0.35)';
      if (!pass) g.translate(0.6, 1.6);
      for (const e of E) {
        const s0 = A.forks.indexOf(e.from) >= 0 ? A.plazaR + 8 : 26, s1 = e.len - (A.forks.indexOf(e.to) >= 0 ? A.plazaR + 8 : 12);
        g.beginPath();
        for (let s = s0; s < s1; s += 34) { const a = pointAt(e, s), b = pointAt(e, Math.min(s1, s + 16)); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
        g.stroke();
      }
      g.restore();
    }
    // 7 cream icing bead borders (piped dots on both biscuit edges), plaza rings, end caps
    const br = Math.max(3.4, rw * 0.072), off = rw / 2 + 0.5, spacing = br * 2.3;
    const beads = [];
    for (const e of E) for (const side of [-1, 1]) {
      for (const q of resample(offsetPts(e.pts, side * off), spacing, spacing * 0.5)) {
        if (nearFork(q[0], q[1], A.plazaR - 1) || otherBody(q[0], q[1], e.id, rw / 2 - 1)) continue;
        beads.push(q[0], q[1]);
      }
      // end caps (root and leaves): a half ring of beads round the road end
      for (const endA of [0, 1]) {
        const node = endA ? e.to : e.from;
        if (A.deg[node] !== 1 || side !== 1) continue;
        const p = endA ? e.pts[e.pts.length - 1] : e.pts[0], q = endA ? e.pts[e.pts.length - 2] : e.pts[1];
        const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
        const nb = Math.max(3, Math.round(Math.PI * off / spacing));
        for (let i = 1; i < nb; i++) { const a = ang - Math.PI / 2 + i / nb * Math.PI; beads.push(p[0] + Math.cos(a) * off, p[1] + Math.sin(a) * off); }
      }
    }
    for (const p of fk) {
      const R = A.plazaR + 0.5, nb = Math.round(6.283 * R / spacing);
      for (let i = 0; i < nb; i++) {
        const a = i / nb * 6.283, x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
        let inside = false;
        for (const e of E) { const q = e.pts; for (let j = 0; j < q.length && !inside; j++) { const dx = q[j][0] - x, dy = q[j][1] - y; if (dx * dx + dy * dy < (rw / 2 - 1) * (rw / 2 - 1)) inside = true; } if (inside) break; }
        if (!inside) beads.push(x, y);
      }
    }
    for (let i = 0; i < beads.length; i += 2) bead(g, beads[i], beads[i + 1], br, ROAD.icing);
    // 8 plaza rosettes (piped icing flower at each fork)
    for (const p of fk) {
      const r0 = rw * 0.16;
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; bead(g, p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0, br * 0.9, ROAD.icing); }
      bead(g, p.x, p.y, br * 1.05, ROAD.caramel);
    }
    // 9 sugar bumps: a short row of beads across the road (white · caramel · white) on a soft shadow
    for (const b of bumps(roads, L)) {
      const e = E.find(q => q.id === b.edge), a = pointAt(e, b.s - 4), c = pointAt(e, b.s + 4);
      let nx = -(c[1] - a[1]), ny = c[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      g.fillStyle = 'rgba(60,36,22,0.25)';
      g.save(); g.translate(b.x, b.y + 3); g.rotate(Math.atan2(ny, nx)); g.beginPath(); g.ellipse(0, 0, rw * 0.36, rw * 0.1, 0, 0, 6.283); g.fill(); g.restore();
      const r = Math.max(4, rw * 0.085);
      for (let i = -1; i <= 1; i++) bead(g, b.x + nx * i * rw * 0.22, b.y + ny * i * rw * 0.22, r, i === 0 ? ROAD.caramel : '#FFFFFF');
    }
  }
  function paintSnow(g, roads, L) {
    const rw = L.roadW || 72, r = rng(hstr(String(roads.key)) ^ 0x5A0);
    g.fillStyle = '#FFFFFF';
    for (const e of roads.edges) {
      // a light sugar-snow dusting: sparse fine specks on the biscuit (calm, the road must stay brown)
      for (const q of resample(e.pts, 11, 3)) {
        const ang = r() * 6.283, d = Math.sqrt(r()) * rw * 0.4;
        g.globalAlpha = 0.45 + r() * 0.35; g.beginPath(); g.arc(q[0] + Math.cos(ang) * d, q[1] + Math.sin(ang) * d, 0.8 + r() * 1.3, 0, 6.283); g.fill();
      }
      // a few soft snow tufts resting on the icing border (on the bead line, so they never cross another branch)
      g.globalAlpha = 0.55;
      for (const q of resample(offsetPts(e.pts, -(rw / 2 + 0.5)), 46, 20 + r() * 20)) { g.beginPath(); g.ellipse(q[0], q[1] - 1, 6 + r() * 4, 3 + r() * 1.5, r() * 0.6, 0, 6.283); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  function roadCache(ctx, roads, L, dpr) {
    const rw = L.roadW || 72;
    if (RC && RC.roads === roads && RC.W === L.W && RC.H === L.H && RC.rw === rw && RC.dpr === dpr) return RC;
    if (RC && RC.key === roads.key && roads.key != null && RC.W === L.W && RC.H === L.H && RC.rw === rw && RC.dpr === dpr) { RC.roads = roads; return RC; }
    const A = analyse(roads, rw);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const e of roads.edges) for (const p of e.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const m = rw / 2 + 24;
    x0 = Math.floor(Math.max(0, x0 - m)); y0 = Math.floor(Math.max(0, y0 - m)); x1 = Math.ceil(Math.min(L.W, x1 + m)); y1 = Math.ceil(Math.min(L.H, y1 + m));
    const c = canvas((x1 - x0) * dpr, (y1 - y0) * dpr);
    const edges = new Map(); for (const e of roads.edges) edges.set(e.id, { e, p: pathOf(e.pts) });
    RC = { roads, key: roads.key, W: L.W, H: L.H, rw, dpr, A, bmp: c, bx: x0, by: y0, bw: x1 - x0, bh: y1 - y0, snowBmp: null, edges, clip: [] };
    if (c) { const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr); paintRoads(g, roads, L, A); }
    // the reveal clip: circles every 8 px along each edge with their root distance
    for (const e of roads.edges) { const d0 = A.D0.get(e.id); for (const q of resample(e.pts, 8, 0)) RC.clip.push(q[0], q[1], d0 + q[2]); const lp = e.pts[e.pts.length - 1]; RC.clip.push(lp[0], lp[1], d0 + e.len); }
    RC.front = soft('255,244,226', 0.9, 64);
    return RC;
  }
  function drawRoads(ctx, roads, L, opt) {
    if (!roads || !roads.edges || !roads.edges.length) return;
    opt = opt || {};
    const dpr = dprOf(ctx, opt), C = roadCache(ctx, roads, L, dpr), rw = C.rw;
    const reveal = opt.reveal == null ? 1 : clamp(opt.reveal, 0, 1);
    if (reveal <= 0) return;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    if (!C.bmp) { if (reveal >= 1) paintRoads(ctx, roads, L, C.A); ctx.restore(); return; }   // node / no DOM
    if (reveal < 1) {
      const d = reveal * C.A.maxD, R = rw / 2 + 16, cl = C.clip;
      ctx.beginPath();
      for (let i = 0; i < cl.length; i += 3) if (cl[i + 2] <= d) { ctx.moveTo(cl[i] + R, cl[i + 1]); ctx.arc(cl[i], cl[i + 1], R, 0, 6.283); }
      ctx.save(); ctx.clip();
      ctx.drawImage(C.bmp, C.bx, C.by, C.bw, C.bh);
      ctx.restore();
      // glossy pour fronts (one per edge being poured)
      if (C.front) for (const e of roads.edges) {
        const d0 = C.A.D0.get(e.id); if (d < d0 || d > d0 + e.len) continue;
        const p = pointAt(e, d - d0), s = rw * 0.9;
        ctx.drawImage(C.front, p[0] - s / 2, p[1] - s / 2, s, s);
      }
    } else ctx.drawImage(C.bmp, C.bx, C.by, C.bw, C.bh);
    // snow dusting overlay
    if (opt.snow > 0) {
      if (!C.snowBmp) { C.snowBmp = canvas(C.bw * dpr, C.bh * dpr); if (C.snowBmp) { const g = C.snowBmp.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, -C.bx * dpr, -C.by * dpr); paintSnow(g, roads, L); } }
      if (C.snowBmp && reveal >= 1) { ctx.save(); ctx.globalAlpha *= clamp(opt.snow, 0, 1); ctx.drawImage(C.snowBmp, C.bx, C.by, C.bw, C.bh); ctx.restore(); }
    }
    const q = opt.quality == null ? 1 : opt.quality;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // trail: soft golden sheen on driven edges
    if (opt.trail && opt.trail.length && opt.trailT > 0) {
      ctx.globalAlpha = (opt.alpha == null ? 1 : opt.alpha) * clamp(opt.trailT, 0, 1) * 0.32;
      ctx.strokeStyle = '#FFE3A0'; ctx.lineWidth = rw * 0.5;
      for (let i = 0; i < opt.trail.length; i++) { const r = C.edges.get(opt.trail[i]); if (r) { if (r.p) ctx.stroke(r.p); else strokePts(ctx, r.e.pts); } }
    }
    // hint glow: a warm halo + marching golden dots on the route
    if (opt.glowEdges && opt.glowEdges.length && opt.glow > 0) {
      const a0 = (opt.alpha == null ? 1 : opt.alpha) * clamp(opt.glow, 0, 1), t = opt.t || 0;
      ctx.globalAlpha = a0 * 0.34; ctx.strokeStyle = '#FFD27A'; ctx.lineWidth = rw * 0.86;
      for (let i = 0; i < opt.glowEdges.length; i++) { const r = C.edges.get(opt.glowEdges[i]); if (r) { if (r.p) ctx.stroke(r.p); else strokePts(ctx, r.e.pts); } }
      if (q >= 0.6) {
        ctx.globalAlpha = a0 * 0.95; ctx.strokeStyle = '#FFF1C4'; ctx.lineWidth = rw * 0.2;
        DASH_GLOW[0] = 0.01; DASH_GLOW[1] = rw * 0.5; ctx.setLineDash(DASH_GLOW); ctx.lineDashOffset = -t * 70;
        for (let i = 0; i < opt.glowEdges.length; i++) { const r = C.edges.get(opt.glowEdges[i]); if (r) { if (r.p) ctx.stroke(r.p); else strokePts(ctx, r.e.pts); } }
        ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
      }
    }
    ctx.restore();
  }

  // =================================================================================================================
  // WALL
  // =================================================================================================================
  let WC = [];                // [{key fields…, base, over, ox, oy, clip, …}] (≤ 2: crossfade)
  const SNOW = (() => { const r = rng(0x5110), a = new Float32Array(30 * 4); for (let i = 0; i < 30; i++) { a[i * 4] = r(); a[i * 4 + 1] = r(); a[i * 4 + 2] = 0.6 + r() * 0.8; a[i * 4 + 3] = r() * 6.283; } return a; })();
  function openingPath(g, G, k) {   // the glass opening in screen px (arch + square bottom)
    const O = RECIPE.OPENING, x0 = G.x0 + O.x0 * k, x1 = G.x0 + O.x1 * k, cx = G.x0 + 800 * k, cy = G.y0 + O.arcY * k, r = O.r * k, yb = G.y0 + O.bottom * k;
    g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, cy); g.arc(cx, cy, r, Math.PI, 0); g.lineTo(x1, yb); g.closePath();
  }
  function branchSprite(kind, k) {   // a branch hanging into the window from the top corner, pivot at (0,0)
    const s = 150 * k, c = canvas(s * 2, s * 2); if (!c) return null;
    const g = c.getContext('2d'); g.translate(s * 0.1, s * 0.1); g.scale(k, k);
    g.lineCap = 'round'; g.strokeStyle = kind === 'blossom' ? '#9A7660' : '#7E5A44'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(-10, -6); g.quadraticCurveTo(50, 30, 120, 50); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(50, 22); g.quadraticCurveTo(70, 60, 64, 96); g.stroke();
    const cols = kind === 'blossom' ? ['#F2CFD9', '#F8E1E8', '#E9B9C8'] : ['#D9A06A', '#E4B67E', '#C27E4E'];
    const pts = [[30, 14], [56, 30], [84, 40], [112, 50], [64, 66], [66, 92], [96, 56], [40, 30], [126, 46]];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]; g.fillStyle = cols[i % 3]; g.strokeStyle = kind === 'blossom' ? '#C995A6' : '#9E6A40'; g.lineWidth = 2;
      if (kind === 'blossom') { for (let j = 0; j < 5; j++) { const a = j / 5 * 6.283; g.beginPath(); g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.6, 0, 6.283); g.fill(); } g.fillStyle = '#F4D7AE'; g.beginPath(); g.arc(x, y, 2.4, 0, 6.283); g.fill(); }
      else { g.save(); g.translate(x, y); g.rotate(0.6 + i); g.beginPath(); g.ellipse(0, 0, 10, 5.4, 0, 0, 6.283); g.fill(); g.stroke(); g.restore(); }
    }
    return { c, off: s * 0.1 };
  }
  function cloudSprite(k) {
    const w = 120 * k, h = 50 * k, c = canvas(w, h); if (!c) return null;
    const g = c.getContext('2d'); g.scale(k, k); g.fillStyle = '#FFFFFF';
    for (const [x, y, rx, ry] of [[60, 28, 38, 14], [40, 30, 20, 12], [80, 31, 22, 11], [56, 20, 18, 12], [70, 22, 14, 10]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill(); }
    g.fillStyle = 'rgba(214,224,236,0.5)'; g.beginPath(); g.ellipse(60, 36, 36, 5, 0, 0, 6.283); g.fill();
    return c;
  }
  function wallCache(L, si, dpr) {
    const G = RECIPE.wallLayout(L), m = SEASONS[si];
    for (const w of WC) if (w.W === L.W && w.h === G.h && w.si === si && w.cx === G.cx && w.y0 === G.y0 && w.dpr === dpr) return w;
    const im = img('env/wall_' + m);
    const kd = Math.max(1, Math.round(400 * G.k * dpr)) / 400;    // device scale with an integer strip width (seamless tiles)
    const stripD = Math.round(400 * kd), fullW = stripD * 4, fullH = Math.round(400 * kd);
    const ent = { W: L.W, h: G.h, si, cx: G.cx, y0: G.y0, dpr, G, base: null, over: null, branch: null, cloud: null, ready: !!im };
    const base = canvas(L.W * dpr, G.h * dpr);
    if (base && im) {
      const raster = canvas(fullW, fullH), rg = raster.getContext('2d');
      rg.drawImage(im, 0, 0, fullW, fullH);
      const g = base.getContext('2d');
      const x0d = Math.round(G.x0 * dpr), sh = base.height;
      g.drawImage(raster, 0, 0, fullW, fullH, x0d, 0, fullW, sh);
      for (let x = x0d - stripD; x > -stripD; x -= stripD) g.drawImage(raster, 0, 0, stripD, fullH, x, 0, stripD, sh);
      for (let x = x0d + fullW; x < base.width; x += stripD) g.drawImage(raster, fullW - stripD, 0, stripD, fullH, x, 0, stripD, sh);
      // window-frame overlay: the frame region with the glass cut out (live view goes between base and over)
      const F = RECIPE.FRAME, fx = Math.floor(F.x0 * kd), fy = Math.floor(F.y0 * kd), fw = Math.ceil((F.x1 - F.x0) * kd), fh = Math.ceil((F.y1 - F.y0) * kd);
      const over = canvas(fw, fh), og = over.getContext('2d');
      og.drawImage(raster, fx, fy, fw, fh, 0, 0, fw, fh);
      og.save(); og.globalCompositeOperation = 'destination-out';
      openingPath(og, { x0: -fx, y0: -fy }, kd); og.fill(); og.restore();
      const O = RECIPE.OPENING;   // put the mullions back
      og.drawImage(raster, Math.floor(O.mullX[0] * kd) - 1, Math.floor(O.top * kd), Math.ceil((O.mullX[1] - O.mullX[0]) * kd) + 2, Math.ceil((O.bottom - O.top) * kd), Math.floor(O.mullX[0] * kd) - 1 - fx, Math.floor(O.top * kd) - fy, Math.ceil((O.mullX[1] - O.mullX[0]) * kd) + 2, Math.ceil((O.bottom - O.top) * kd));
      og.drawImage(raster, Math.floor(O.x0 * kd), Math.floor(O.mullY[0] * kd) - 1, Math.ceil((O.x1 - O.x0) * kd), Math.ceil((O.mullY[1] - O.mullY[0]) * kd) + 2, Math.floor(O.x0 * kd) - fx, Math.floor(O.mullY[0] * kd) - 1 - fy, Math.ceil((O.x1 - O.x0) * kd), Math.ceil((O.mullY[1] - O.mullY[0]) * kd) + 2);
      // glass reflections (two soft diagonal streaks per side), clipped to the opening
      og.save(); openingPath(og, { x0: -fx, y0: -fy }, kd); og.clip();
      og.fillStyle = 'rgba(255,255,255,0.16)';
      for (const [u, w] of [[660, 26], [700, 10], [842, 22], [878, 8]]) { og.beginPath(); og.moveTo((u - F.x0) * kd, (O.bottom - F.y0) * kd); og.lineTo((u + w - F.x0) * kd, (O.bottom - F.y0) * kd); og.lineTo((u + w + 110 - F.x0) * kd, (O.top + 40 - F.y0) * kd); og.lineTo((u + 110 - F.x0) * kd, (O.top + 40 - F.y0) * kd); og.closePath(); og.fill(); }
      og.restore();
      ent.over = over; ent.overX = G.x0 + F.x0 * G.k; ent.overY = G.y0 + F.y0 * G.k; ent.overW = fw / kd * G.k; ent.overH = fh / kd * G.k;
      ent.base = base;
      const an = RECIPE.ANIM[m];
      if (an.branch) ent.branch = branchSprite(an.branch, G.k * dpr);
      ent.cloud = cloudSprite(G.k * dpr);
    }
    WC.push(ent); if (WC.length > 2) WC.shift();
    return ent;
  }
  function drawWall(ctx, L, season, t, opt) {
    opt = opt || {};
    const si = sIndex(season), dpr = dprOf(ctx, opt), e = wallCache(L, si, dpr), G = e.G, m = SEASONS[si];
    if (!e.ready) {   // art not loaded yet: plain plaster + a sky rectangle (also the node path)
      if (!img('env/wall_' + m)) { WC = WC.filter(w => w !== e); }
      ctx.save(); if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
      ctx.fillStyle = '#F2DFC4'; ctx.fillRect(0, G.y0, L.W, G.h);
      ctx.fillStyle = RECIPE.SKY[m][0]; ctx.fillRect(G.glass.x, G.glass.y, G.glass.w, G.glass.h);
      ctx.fillStyle = '#A87346'; ctx.fillRect(0, G.rimY, L.W, G.y0 + G.h - G.rimY);
      ctx.restore(); return;
    }
    if (!e.base) return;
    ctx.save(); if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    const a0 = ctx.globalAlpha;
    ctx.drawImage(e.base, 0, G.y0, L.W, G.h);
    const q = opt.quality == null ? 1 : opt.quality, an = RECIPE.ANIM[m], k = G.k, gl = G.glass;
    t = t || 0;
    ctx.save(); openingPath(ctx, G, k); ctx.clip();
    // drifting clouds
    if (e.cloud) for (let i = 0; i < an.clouds; i++) {
      const cw = 120 * k, ch = 50 * k, span = gl.w + cw, x = gl.x - cw + (((t * an.cloudV * k + i * span * 0.55 + 40 * k) % span) + span) % span;
      ctx.globalAlpha = a0 * an.cloudA; ctx.drawImage(e.cloud, x, gl.y + (24 + i * 34) * k, cw, ch);
    }
    // falling snow outside
    if (an.snow && q >= 0.5) {
      ctx.globalAlpha = a0 * 0.95; ctx.fillStyle = '#FFFFFF'; ctx.beginPath();
      const n = Math.min(an.snow, 30);
      for (let i = 0; i < n; i++) {
        const sp = SNOW[i * 4 + 2], y = gl.y + ((SNOW[i * 4 + 1] * gl.h + t * 18 * sp * k) % gl.h);
        const x = gl.x + ((SNOW[i * 4] * gl.w + Math.sin(t * 0.8 + SNOW[i * 4 + 3]) * 6 * k) + gl.w) % gl.w, r = (1.6 + sp * 1.6) * k * 1.4;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283);
      }
      ctx.fill();
    }
    // swaying branch from the top-left (blossom) / top-right (amber) corner of the glass
    if (e.branch) {
      const left = an.branch === 'blossom', px = left ? gl.x + 8 * k : gl.x + gl.w - 8 * k, py = gl.y + 52 * k;
      ctx.globalAlpha = a0; ctx.save(); ctx.translate(px, py); if (!left) ctx.scale(-1, 1);
      ctx.rotate(0.05 * Math.sin(t * 0.9) + 0.02 * Math.sin(t * 2.3));
      const s = 1 / dpr; ctx.drawImage(e.branch.c, -e.branch.off * s, -e.branch.off * s, e.branch.c.width * s, e.branch.c.height * s);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = a0;
    if (e.over) ctx.drawImage(e.over, e.overX, e.overY, e.overW, e.overH);
    ctx.restore();
  }

  // =================================================================================================================
  // BAKERY + SKID
  // =================================================================================================================
  function bakeryGeom(L) {
    const b = L.bakery || { x: 20, y: L.H / 2 - 100, w: 200, h: 185 };
    const k = Math.min(b.w / BAKERY.w, b.h / BAKERY.h), dx = b.x + b.w / 2 - BAKERY.door[0] * k, dy = b.y + b.h - BAKERY.door[1] * k;
    return { k, dx, dy, b };
  }
  function bakeryPoints(L) {
    const g = bakeryGeom(L), P = (q) => ({ x: g.dx + q[0] * g.k, y: g.dy + q[1] * g.k });
    return { door: P(BAKERY.door), oven: P(BAKERY.oven), chimney: P(BAKERY.chimney), box: { x: g.dx, y: g.dy, w: BAKERY.w * g.k, h: BAKERY.h * g.k }, k: g.k };
  }
  function drawBakery(ctx, L, t, opt) {
    opt = opt || {}; t = t || 0;
    const g = bakeryGeom(L), k = g.k, im = img('env/bakery');
    ctx.save(); if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    const a0 = ctx.globalAlpha;
    const sh = soft('90,56,38', 0.45, 64);
    if (sh) ctx.drawImage(sh, g.dx + 2 * k, g.dy + 206 * k, 256 * k, 52 * k);
    if (im) ctx.drawImage(im, g.dx, g.dy, BAKERY.w * k, BAKERY.h * k);
    else { ctx.fillStyle = '#F3E2C6'; ctx.fillRect(g.dx + 34 * k, g.dy + 100 * k, 192 * k, 134 * k); ctx.fillStyle = '#B8794A'; ctx.fillRect(g.dx + 14 * k, g.dy + 40 * k, 232 * k, 70 * k); }
    // oven glow pulse
    const glow = soft('255,201,119', 0.9, 96);
    if (glow) {
      const ox = g.dx + BAKERY.oven[0] * k, oy = g.dy + BAKERY.oven[1] * k, r = BAKERY.oven[2] * k * (2.3 + 0.25 * Math.sin(t * 2.4));
      ctx.globalAlpha = a0 * (0.42 + 0.2 * Math.sin(t * 2.4) + (opt.ding || 0) * 0.4);
      ctx.drawImage(glow, ox - r, oy - r, r * 2, r * 2);
    }
    // steam puffs from the chimney
    const puff = opt.puff == null ? 0.35 : opt.puff, st = soft('255,255,255', 0.95, 64);
    if (puff > 0 && st) {
      const cx = g.dx + BAKERY.chimney[0] * k, cy = g.dy + BAKERY.chimney[1] * k;
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.45 + i / 3) % 1), r = (10 + ph * 22) * k;
        ctx.globalAlpha = a0 * puff * Math.sin(ph * Math.PI) * 0.85;
        ctx.drawImage(st, cx - r + Math.sin(t * 1.3 + i * 2) * 6 * k + ph * 10 * k, cy - ph * 70 * k - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }
  function drawSkid(ctx, x, y, r, a) {
    if (!(a > 0) || !(r > 0)) return;
    const s = soft('255,248,236', 0.9, 48);
    ctx.save(); ctx.globalAlpha *= clamp(a, 0, 1);
    if (s) { ctx.drawImage(s, x - r, y - r * 0.8, r * 2, r * 1.6); ctx.drawImage(s, x - r * 1.3, y - r * 0.5, r * 1.3, r * 1.1); }
    else { ctx.fillStyle = 'rgba(255,248,236,0.6)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }

  function _reset() { TCACHE.length = 0; lastTable = null; lastDecor = []; RC = null; WC = []; for (const k in SOFT) delete SOFT[k]; }
  BD.TableArt = { drawTable, drawRoads, drawWall, drawBakery, drawSkid, wallLayout: L => RECIPE.wallLayout(L), bumps, bakeryPoints,
    decorRects: () => lastDecor.slice(), RECIPE, SPRITES, BAKERY, _reset };
})(typeof window !== 'undefined' ? (window.BD = window.BD || {}) : (globalThis.BD = globalThis.BD || {}));
