/* FP.Renderer (Bo's Farm Parade) — draws the sunny farm and the parade on one canvas (DESIGN §7, MECHANICS §5).
 * Order: sky gradient → stars → sun / moon → clouds → far → mid → rooster (on the fence) → ground → path band → back particles
 * → barn back (dark doorway) + doors + weathervane → hay-bale stage + home badge → members (shadows; marchers clipped by the
 * door frame) → Bo (mood frames, blink, talk mouth flap, hop) → chick → fireflies → dust puffs → hint hand → front particles
 * → fx → chapter banner. The environment follows tools/env_scenes.js RECIPE (envLayout / tileXs / drawPath / barnGeom are
 * pasted verbatim below). Title: Bo in the parade cap waving beside a little line (bucket wagon, sheep, block) marching in
 * place. Session done: the friends parade out of the barn in a loop, Bo dances, confetti.
 * Logical coordinates (short side 720) × render scale rs = device pixels. */
(function (FP) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['morning', 'noon', 'sunset', 'night'];

  /* ---------- RECIPE tables (tools/env_scenes.js + tools/art_env.js) ---------- */
  const SKY = { morning: [[0, '#F8DCC6'], [1, '#FDF4E3']], noon: [[0, '#7CC4EE'], [1, '#D6F0FB']], sunset: [[0, '#F29B6B'], [1, '#FBD7A5']], night: [[0, '#1E2A4A'], [1, '#3B4C78']] };
  const GROUND_BOTTOM = { morning: '#9FAE7C', noon: '#9AAF77', sunset: '#A09468', night: '#2A3B4C' };
  const PATH = {
    morning: { fill: '#DCC4A0', edge: '#C2A57E', dark: '#B39470', light: '#E8D6B8', peb: '#BDB2A2', grass: '#95A774' },
    noon: { fill: '#D8BE95', edge: '#BFA27A', dark: '#AE8F68', light: '#E6D2B0', peb: '#B8AE9E', grass: '#8EA36E' },
    sunset: { fill: '#D9B790', edge: '#B8936E', dark: '#A88262', light: '#E7CBA8', peb: '#B7A08E', grass: '#929266' },
    night: { fill: '#646C86', edge: '#485070', dark: '#525A76', light: '#737B96', peb: '#7E86A0', grass: '#2C4252' } };
  const RIM = { morning: '#FFF1DE', noon: '#FFFFFF', sunset: '#FFD6A0', night: '#FFD38A' };
  const DOOR_TINT = { morning: 'rgba(246,217,198,0.08)', noon: null, sunset: 'rgba(194,128,110,0.14)', night: 'rgba(28,40,80,0.42)' };
  const GLOW = { morning: 0.1, noon: 0, sunset: 0.4, night: 1 };
  const SUN = {
    landscape: { morning: { x: 0.3, y: 0.66, size: 140 }, noon: { x: 0.62, y: 0.2, size: 150 }, sunset: { x: 0.8, y: 0.84, size: 176 }, night: { x: 0.84, y: 1.25, size: 150 } },
    portrait: { morning: { x: 0.24, y: 0.62, size: 130 }, noon: { x: 0.7, y: 0.42, size: 140 }, sunset: { x: 0.74, y: 0.86, size: 170 }, night: { x: 0.76, y: 1.2, size: 140 } } };
  const MOON = { landscape: { x: 0.68, y: 0.3, size: 130 }, portrait: { x: 0.72, y: 0.5, size: 130 } };
  const STARS = { density: 1 / 3600, max: 200, r: [0.7, 2.1], twinkle: 0.3 };
  const CLOUDS = { morning: { n: 2, alpha: 0.8, tint: 'rgba(255,226,206,0.45)' }, noon: { n: 4, alpha: 0.95, tint: null },
    sunset: { n: 3, alpha: 0.85, tint: 'rgba(246,170,140,0.5)' }, night: { n: 2, alpha: 0.2, tint: 'rgba(90,108,160,0.6)' } };

  /* ---------- RECIPE functions: pasted verbatim from tools/env_scenes.js (pure) ---------- */
  /** Pure layout of the environment for a W × H screen. ins = safe-area insets; lineY = world.layout.line.y. */
  function envLayout(W, H, ins, lineY) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const groundY = H - ins.bottom - (portrait ? 26 : 14);
    if (lineY == null) lineY = portrait ? groundY - 4 - 200 - 70 : groundY - 96;
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.9 * kp, km = 0.9 * kp;
    const kg = portrait ? (tall ? 1.3 : 1.15) : 1;
    const horizonY = Math.round(lineY - (140 - 40) * kg);     // ground row 140 (PATH_ROW) on the line, row 40 on the horizon
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: horizonY - 40 * kg };
    ground.fillY = ground.y + 258 * kg;
    // mid: the pond (mid x 570) a bit left of centre in landscape (behind the line), centred in portrait
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.5 : 0.45) - 570 * km), y: horizonY + 4 - 296 * km };
    // far: tile centre a bit left of the screen centre → the wind pump (far x 840) sits right of centre, the silo left
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.36 : 0.46) - 600 * kf), y: Math.round(horizonY - 22 * km - 720 * kf) };
    const ridgeY = Math.round(far.y + 400 * kf);              // ≈ the farthest range's crest (top of the land)
    const skyY1 = Math.round(far.y + 470 * kf);               // sky gradient end (hidden behind the back hills)
    const fence = { y: Math.round(mid.y + 214 * km), k: km };  // FENCE_TOP: the rooster's feet
    const path = { y: lineY, h: Math.round(110 * (portrait ? (tall ? 1.1 : 1.05) : 1)) };
    const o = portrait ? 'portrait' : 'landscape', sun = {};
    const cw = W - ins.left - ins.right, skyH = ridgeY - ins.top;
    // landscape: the sky is shared with the bubble (top-left) — keep the sun right of the bubble's edge (bx)
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
    for (const m of ['morning', 'noon', 'sunset', 'night']) {
      const s = SUN[o][m]; let x = ins.left + s.x * cw;
      if (!portrait) x = Math.max(x, bx + s.size * 0.5);
      sun[m] = { x, y: ins.top + s.y * skyH, size: s.size };
    }
    const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * skyH, size: mo.size };
    const stars = { y1: ridgeY + 20, n: Math.min(STARS.max, Math.round(W * (ridgeY + 20) * STARS.density)) };
    const clouds = portrait
      ? { y0: ins.top + 0.06 * H, y1: Math.min(ins.top + 0.3 * H, ridgeY - 40), s: 0.55 }
      : { y0: ins.top + 30, y1: Math.min(ins.top + 170, ridgeY - 30), s: 0.6 };
    return { portrait, tall, groundY, lineY, horizonY, kp, far, mid, ground, ridgeY, skyY1, fence, path, sun, moon, stars, clouds };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
  /** Barn placement from world.layout.barn {x, y (BASE centre), w}. s = w / 300 (art 300×320, base anchor (150, 316)). */
  function barnGeom(b) {
    const s = b.w / 300, ox = b.x - 150 * s, oy = b.y - 316 * s;
    const R = (x, y, w, h) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s });
    const doorL = R(80, 166, 70, 150), doorR = R(150, 166, 70, 150);
    doorL.hx = doorL.x; doorR.hx = doorR.x + doorR.w;          // hinge x (outer edges)
    return { s, img: R(0, 0, 300, 320), doorway: R(80, 166, 140, 150), doorL, doorR,
      vane: { x: ox + 150 * s, y: oy + 12 * s, size: 80 * s, pivot: [40, 64] }, loft: { x: ox + 150 * s, y: oy + 104 * s, r: 34 * s },
      lamp: { x: ox + 56 * s, y: oy + 180 * s }, roofTop: { x: ox + 150 * s, y: oy + 30 * s } };
  }
  /** The parade path: a dirt band centred on y (members' feet), height h, colours c = RECIPE.PATH[mood]. Pure canvas. */
  function drawPath(g, W, y, h, c) {
    const top = x => y - h / 2 + 2.5 * Math.sin(x / 41) + 1.6 * Math.sin(x / 97 + 1.3);
    const bot = x => y + h / 2 + 2.2 * Math.sin(x / 53 + 0.7) + 1.8 * Math.sin(x / 113 + 2.1);
    const band = () => { g.beginPath(); g.moveTo(-4, top(-4)); for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, top(x)); for (let x = W + 8; x >= -8; x -= 8) g.lineTo(x, bot(x)); g.closePath(); };
    g.save();
    band(); g.fillStyle = c.fill; g.fill();
    g.clip();
    // the back (top) part a touch darker, a lighter worn middle where the feet go
    const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    gr.addColorStop(0, c.edge); gr.addColorStop(0.22, c.fill); gr.addColorStop(0.55, c.light); gr.addColorStop(0.8, c.fill); gr.addColorStop(1, c.edge);
    g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, y - h / 2 - 6, W, h + 12); g.globalAlpha = 1;
    // two soft wheel ruts
    g.strokeStyle = c.dark; g.lineWidth = 3; g.globalAlpha = 0.22; g.lineCap = 'round';
    for (const f of [-0.3, 0.3]) { g.beginPath(); for (let x = 0; x <= W; x += 10) { const yy = y + f * h + 1.5 * Math.sin(x / 70 + f * 5); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
    g.globalAlpha = 1;
    // pebbles (deterministic in x)
    for (let x = 13; x < W; x += 37) {
      const hsh = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1, yy = y + (hsh - 0.5) * h * 0.8, r = 2 + hsh * 2.6;
      if (Math.abs(yy - y) < h * 0.12) continue;
      g.fillStyle = c.peb; g.beginPath(); g.ellipse(x + hsh * 20, yy, r * 1.4, r, 0, 0, 7); g.fill();
    }
    g.restore();
    // edges + overhanging grass
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = c.edge; g.lineWidth = 4; g.beginPath(); for (let x = -4; x <= W + 8; x += 8) x > -4 ? g.lineTo(x, top(x)) : g.moveTo(x, top(x)); g.stroke();
    g.lineWidth = 5; g.beginPath(); for (let x = -4; x <= W + 8; x += 8) x > -4 ? g.lineTo(x, bot(x)) : g.moveTo(x, bot(x)); g.stroke();
    g.strokeStyle = c.grass; g.lineWidth = 2;
    g.beginPath();
    for (let x = 9; x < W; x += 23) { const t = top(x) + 1, b = bot(x) - 1; g.moveTo(x, t); g.lineTo(x - 3, t + 6); g.moveTo(x + 3, t); g.lineTo(x + 5, t + 5); if (x % 2) { g.moveTo(x + 7, b); g.lineTo(x + 4, b - 7); g.moveTo(x + 10, b); g.lineTo(x + 12, b - 6); } }
    g.stroke();
  }

  /* ---------- character art metrics (docs/art/bo_points.json, DESIGN §4.1) ---------- */
  const BO = { w: 300, h: 300, ax: 150, ay: 292, body: 260 };       // visible body y 33…293
  const CHICK = { w: 120, h: 120, ax: 60, ay: 116, draw: 92 };
  const ROOSTER = { w: 160, h: 180, ax: 80, ay: 176, draw: 150 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const PA = () => FP.ParadeArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, mist: 1, feather: 1 };

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  }
  function fitText(g, text, maxW, px, weight) {
    let f = px;
    g.font = `${weight || 900} ${f}px ${FONT}`;
    const w = g.measureText(text).width;
    if (w > maxW) { f = Math.max(8, f * maxW / w); g.font = `${weight || 900} ${f}px ${FONT}`; }
    return f;
  }
  function outlinedText(g, text, x, y, px, fill, stroke, maxW) {
    fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, px * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this.gallery = []; this._galleryT = 0; this._stars = null; this._off = {};
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      FP.Assets.dropExact();
      this._envKey = ''; this._off = {};
    }
    prewarm(layout, level) {
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3) % 4];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
      this._pathImg(m);
    }
    /** every member thing of the session (the done screen's parade out of the barn) */
    setGallery(list) { this.gallery = (list || []).slice(-12); this._galleryT = 0; }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const lineY = L && L.line ? Math.round(L.line.y) : null;
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right), Math.round(ins.bottom), lineY].join(',');
      if (this._envKey === key && this._env) return this._env;
      const sizeKey = [this.W, this.H].join(',');
      this._env = envLayout(this.W, this.H, ins, lineY);
      this._envKey = key;
      // the tiles depend on the size only; the path band on its y: drop the cached path when it moved
      for (const k of Object.keys(this._off)) if (k.startsWith('path') && !k.endsWith('@' + lineY + '@' + sizeKey)) delete this._off[k];
      let s = 12345; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const n = this._env.stars.n, y1 = this._env.stars.y1;
      this._stars = Array.from({ length: n }, () => ({ x: R() * this.W, y: R() * y1, r: STARS.r[0] + Math.pow(R(), 2.2) * (STARS.r[1] - STARS.r[0]), tw: R() < STARS.twinkle ? R() * TAU : -1, a: 0.45 + 0.55 * R() }));
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return FP.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    /** the path band for mood m, cached per mood + size in an offscreen canvas (RECIPE step 6) */
    _pathImg(m) {
      const E = this._env, P = E.path, key = 'path' + m + '@' + Math.round(P.y) + '@' + this.W + ',' + this.H;
      if (this._off[key]) return this._off[key];
      const pad = 24, y0 = P.y - P.h / 2 - pad, h = P.h + 2 * pad;
      const c = FP.Assets.makeCanvas(this.W * this.rs, h * this.rs), g = c.getContext('2d');
      g.setTransform(this.rs, 0, 0, this.rs, 0, -y0 * this.rs);
      drawPath(g, this.W, P.y, P.h, PATH[m]);
      const o = { c, y0, h };
      this._off[key] = o;
      return o;
    }
    /** an SVG image through a 'source-atop' tint, cached (clouds per mood, doors per mood) */
    _tintedImg(name, tint, w, h) {
      const key = 'tint' + name + tint + Math.round(w) + 'x' + Math.round(h);
      if (this._off[key]) return this._off[key];
      const base = FP.Assets.sprite(name, Math.max(w, h) * this.rs * 1.05);
      if (!base) return null;
      const c = FP.Assets.makeCanvas(base.width, base.height), x = c.getContext('2d');
      x.drawImage(base, 0, 0);
      if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
      this._off[key] = c;
      return c;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = MOODS.includes(amb.env) ? amb.env : 'morning';
      this._from = MOODS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      // night-ness for the members' warm rim light: sunset ≈ 0.33, night 1 (follows the light level through a crossfade)
      this._night = clamp(amb.light != null ? (1 - amb.light) / 0.45 : 0, 0, 1);
      this._envFor(this._L);
      this._G = this._L && this._L.barn ? barnGeom(this._L.barn) : null;
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather, o.title || o.done ? null : world, a);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    /** draw fn(mood, alpha) for the current mood, crossfading from the previous one */
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }

    /* ---------- backdrop: sky → stars → sun / moon → clouds → far → mid → rooster → ground (+ fill) → path ---------- */
    _backdrop(amb, weather, world, a) {
      const g = this.g, W = this.W, H = this.H, E = this._env, to = this._to, from = this._from, mix = this._mix;
      const gr = g.createLinearGradient(0, 0, 0, Math.max(10, E.skyY1));
      if (amb.skyTop) { gr.addColorStop(0, amb.skyTop); if (amb.skyMid) gr.addColorStop(0.5, amb.skyMid); gr.addColorStop(1, amb.skyBottom || amb.skyTop); }
      else for (const [o, c] of SKY[to]) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // star field (RECIPE: cream #FFF6DE, the biggest ones with particles/star, ~30 % twinkle)
      const sA = clamp(amb.starsA || 0, 0, 1);
      if (sA > 0.02 && this._stars) {
        g.fillStyle = '#FFF6DE';
        for (const s of this._stars) {
          const tw = s.tw >= 0 ? 0.55 + 0.45 * Math.sin(this.time * 2.2 + s.tw) : 1;
          g.globalAlpha = sA * tw * s.a * (1 - s.y / E.stars.y1 * 0.5); g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
          if (s.r > 1.8) { g.globalAlpha = sA * 0.9 * tw; this._sprite('pstar', s.x, s.y, 18, 0, 1); }
        }
        g.globalAlpha = 1;
      }
      // the sun glides between the moods' spots (parked below the ridge at night); the moon sits in its spot
      const sunA = clamp(amb.sunA == null ? 1 : amb.sunA, 0, 1);
      const s1 = E.sun[to], s0 = this._fading() ? E.sun[from] : s1;
      const sp = { x: lerp(s0.x, s1.x, mix), y: lerp(s0.y, s1.y, mix), size: lerp(s0.size, s1.size, mix) };
      if (sunA > 0.02) {
        const warm = to === 'sunset' ? '255,200,150' : '255,248,220';
        const glow = g.createRadialGradient(sp.x, sp.y, sp.size * 0.2, sp.x, sp.y, sp.size * 1.3);
        glow.addColorStop(0, `rgba(${warm},${0.45 * sunA})`); glow.addColorStop(1, `rgba(${warm},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, sp.size * 1.3, 0, TAU); g.fill();
        g.globalAlpha = sunA; this._img('env/sun', sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size); g.globalAlpha = 1;
      }
      const moonA = clamp(amb.moonA || 0, 0, 1);
      if (moonA > 0.02) {
        const m = E.moon;
        const glow = g.createRadialGradient(m.x, m.y, m.size * 0.3, m.x, m.y, m.size * 1.1);
        glow.addColorStop(0, `rgba(255,246,222,${0.18 * moonA})`); glow.addColorStop(1, 'rgba(255,246,222,0)');
        g.fillStyle = glow; g.beginPath(); g.arc(m.x, m.y, m.size * 1.1, 0, TAU); g.fill();
        g.globalAlpha = moonA; this._img('env/moon', m.x - m.size / 2, m.y - m.size / 2, m.size, m.size); g.globalAlpha = 1;
      }
      // clouds: the weather's drifting set, placed in the RECIPE cloud band; white art tinted per mood; tall portrait +1
      const CT = CLOUDS[to] || CLOUDS.noon, C = E.clouds;
      const list = weather.clouds || [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        let al = c.alpha || 0;
        if (E.tall && i === (CT.n | 0) && al < 0.01) al = (list[0] && list[0].alpha) || 0;   // calm tall sky: one more cloud
        if (!(al > 0.01)) continue;
        const s = C.s * (c.s || 0.8) / 0.8, w = 300 * s, h = 140 * s;
        const yf = clamp(((c.yf != null ? c.yf : 0.18) - 0.06) / 0.24, 0, 1);
        const y = lerp(C.y0, C.y1, yf) + 4 * Math.sin(this.time * 0.2 + (c.ph || i));
        const spr = this._tintedImg('env/' + (c.type || 'cloud_a'), CT.tint, w, h);
        if (!spr) continue;
        g.save(); g.globalAlpha = al * (CT.alpha || 1); g.translate(c.x, y); if (c.flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h);
        g.restore();
      }
      const layer = l => {
        const Ly = E[l];
        this._moods((m, al) => {
          if (al <= 0.01) return;
          const t = this._tile(l, m); if (!t) return;
          g.globalAlpha = al;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
          if (l === 'ground' && Ly.fillY < H) { g.fillStyle = GROUND_BOTTOM[m]; g.fillRect(0, Ly.fillY - 1, W, H - Ly.fillY + 1); }
          g.globalAlpha = 1;
        });
      };
      layer('far'); layer('mid');
      if (world) this._rooster(world.rooster, a);
      layer('ground');
      this._moods((m, al) => {
        if (al <= 0.01) return;
        const P = this._pathImg(m);
        g.globalAlpha = al; g.drawImage(P.c, 0, P.y0, W, P.h); g.globalAlpha = 1;
      });
    }

    /* ---------- barn (back + dark doorway, doors, weathervane) ---------- */
    _barn(doorOpen, vane, opt = {}) {
      const G = this._G; if (!G) return;
      const g = this.g, amb = this._amb;
      this._moods((m, al) => { if (al > 0.01) { g.globalAlpha = al; this._img('env/barn_' + m, G.img.x, G.img.y, G.img.w, G.img.h); g.globalAlpha = 1; } });
      // warm window glow (the night barn's loft + lamp already glow; a soft pulse on top)
      const gl = clamp(amb.glow == null ? GLOW[this._to] : amb.glow, 0, 1);
      if (gl > 0.05) {
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.7);
        for (const p of [{ x: G.loft.x, y: G.loft.y, r: G.loft.r * 2.6 }, { x: G.lamp.x, y: G.lamp.y, r: 40 * G.s }]) {
          const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          rg.addColorStop(0, `rgba(255,214,140,${0.36 * gl * pulse})`); rg.addColorStop(1, 'rgba(255,214,140,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
        }
      }
      if (!opt.noDoors) this._doors(doorOpen);
      this._vane(vane);
    }
    /** doors: θ = door × 80° (clamped ≤ 100°, overshoot past flat shows the darker back), horizontal cos squash about each hinge */
    _doors(open) {
      const G = this._G, g = this.g;
      const th = clamp(open, 0, 1.25) * 80 * Math.PI / 180, k = Math.cos(th);
      if (Math.abs(k) < 0.04) return;
      const tint = DOOR_TINT[this._to], back = k < 0;
      for (const [name, d] of [['env/barn_door_l', G.doorL], ['env/barn_door_r', G.doorR]]) {
        const img = this._tintedImg(name, back ? 'rgba(40,26,20,0.45)' : tint, d.w, d.h);
        if (!img) continue;
        g.save(); g.translate(d.hx, 0); g.scale(k, 1); g.translate(-d.hx, 0);
        g.drawImage(img, d.x, d.y, d.w, d.h);
        g.restore();
      }
    }
    /** the weathervane spins about its vertical axis: horizontal scale cos(angle) about the pivot (40, 64) */
    _vane(angle) {
      const G = this._G, g = this.g, v = G.vane, k = v.size / 80;
      // edge-on the vane would read as a broken stick: never thinner than a quarter
      let c = Math.cos(angle || 0); if (Math.abs(c) < 0.25) c = c < 0 ? -0.25 : 0.25;
      g.save(); g.translate(v.x, v.y); g.scale(c, 1);
      const nt = this._night;
      if (nt > 0.2) {   // warm night rim (the same light as the members' rim) so the dark vane reads on the night sky
        g.save(); g.shadowColor = `rgba(255,211,138,${(0.9 * nt).toFixed(2)})`; g.shadowBlur = 3 * this.rs;
        for (const [ox, oy] of [[1.6, 0], [-1.6, 0], [0, -1.6]]) { g.shadowOffsetX = ox * this.rs; g.shadowOffsetY = oy * this.rs; this._img('env/vane', -40 * k, -64 * k, 80 * k, 80 * k); }
        g.restore();
        g.shadowColor = 'rgba(255,214,140,0.55)'; g.shadowBlur = 8 * this.rs;
      }
      this._img('env/vane', -40 * k, -64 * k, 80 * k, 80 * k);
      g.restore();
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L, P = PA(); if (!L) return;
      const g = this.g;
      this._barn(ip(w.barn, 'door', a) || 0, ip(w.barn, 'vane', a) || 0);
      // the hay-bale stage + the home badge of an odd animal
      const st = w.stage, pop = ip(st, 'pop', a) || 0;
      if (P) {
        g.save(); g.translate(L.stage.x, L.stage.y);
        try { P.drawStage(g, L.stage.s, { pop: clamp(pop / 0.12, 0, 1), night: this._night }); } catch (e) { /* skip */ }
        g.restore();
        if (st.badge && st.badge.a > 0.01) {
          const B = L.homeBadge;
          g.save(); g.translate(B.x, B.y);
          try { P.drawHomeBadge(g, st.badge.home, B.r, { a: st.badge.a, pop: easeOutBack(clamp(st.badge.a, 0, 1)) }); } catch (e) { /* skip */ }
          g.restore();
        }
      }
      // members: the one on the stage first (it stands behind the line), the line by x, flyers on top
      const list = (w.members || []).filter(m => m.state !== 'gone');
      const rank = m => (m.state === 'stage' ? 0 : m.state === 'hop' || (m.state === 'leave' && m._lv && m._lv.phase === 'drop') ? 2 : 1);
      list.sort((p, q) => rank(p) - rank(q) || p.y - q.y || p.x - q.x);
      const dip = P && P.stageDip ? P.stageDip(L.stage.s, clamp(pop / 0.12, 0, 1)) : 0;
      for (const m of list) if (m.state !== 'hop' && m.state !== 'stage') this._shadow(m, a);
      // crates: one apple size per round (from the round's largest n); first-letter rounds: a letter pennant on each member
      let appleN = 0; for (const m of w.members || []) if (m.thing && m.thing.kind === 'crate') appleN = Math.max(appleN, m.thing.n || 0);
      // letter flags would give the answer away by shape: show them only after a miss (as a hint) or once the round is answered
      const pen = !!(w.cur && w.cur.rule && w.cur.rule.kind === 'initial') && (w.misses > 0 || (w.phase !== 'enter' && w.phase !== 'play'));
      this._memberOpt = { appleN, pen };
      for (const m of list) this._member(m, a, m.state === 'stage' ? dip : 0);
      this._memberOpt = null;
      this._bo(w.bo, L.bo);
      this._chick(w.chick, a);
      for (const f of w.fireflies || []) this._firefly(ip(f, 'x', a), ip(f, 'y', a), f.glow == null ? 1 : f.glow);
      if (P) for (const p of w.puffs || []) { try { P.drawDust(g, p.x, p.y, p.r, p.alpha); } catch (e) { /* skip */ } }
      this._hintHand(w.hintHand, a);
    }
    _shadow(m, a) {
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a), bob = Math.max(0, ip(m, 'bob', a) || 0);
      const sc = (ip(m, 'scale', a) || 1) * (m.thing.big === false ? 0.62 : 1), al = (m.alpha == null ? 1 : ip(m, 'alpha', a)) * clamp(1 - bob / 90, 0.3, 1);
      const rw = m.size * 0.36 * sc * (1 - Math.min(0.3, bob / 120));
      g.fillStyle = `rgba(50,40,30,${(0.2 * al).toFixed(3)})`;
      g.beginPath(); g.ellipse(x, y + 3, rw, 7 * sc, 0, 0, TAU); g.fill();
    }
    _member(m, a, dip) {
      const P = PA(); if (!P) return;
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a) + (dip || 0), bob = ip(m, 'bob', a) || 0, rot = ip(m, 'rot', a) || 0;
      const sx = ip(m, 'sx', a) || 1, sy = ip(m, 'sy', a) || 1, sc = ip(m, 'scale', a) || 1, al = m.alpha == null ? 1 : ip(m, 'alpha', a);
      if (!(al > 0.01)) return;
      g.save();
      if (m.clip && this._G) {
        // marching in: the part right of the door frame is behind the barn wall, except inside the doorway
        const D = this._G.doorway;
        g.beginPath(); g.rect(-this.W, -this.H, D.x + this.W, 3 * this.H); g.rect(D.x, D.y - 4, D.w, D.h + 14); g.clip();
      }
      g.globalAlpha *= al;
      g.translate(x, y - bob); g.rotate(rot); g.scale((m.face || 1) * sx * sc, sy * sc);
      try {
        const mo = this._memberOpt || {};
        P.drawMember(g, m.thing, m.size, { glow: m.glow || 0, dim: m.dim || 0, wheel: ip(m, 'wheel', a) || 0, step: m.step || 0,
          night: this._night, count: m.count == null ? -1 : m.count, dpr: this.rs * sc, appleN: mo.appleN || 0,
          pennant: mo.pen && m.thing.letter ? m.thing.letter : null, face: m.face || 1 });
      } catch (e) { /* skip */ }
      g.restore();
    }
    _boFrame(mood, blink) {
      let nm = mood || 'idle';
      if (blink && (nm === 'idle' || nm === 'talk' || nm === 'happy')) nm = 'blink';
      if (this._speaking && (nm === 'idle' || nm === 'talk' || nm === 'blink') && Math.sin(this.time * 17) > -0.2) nm = 'talk';
      else if (nm === 'talk' && !this._speaking) nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      const key = 'characters/bo_' + nm;
      return FP.Assets.has(key) ? key : 'characters/bo_idle';
    }
    /** Bo at feet (x, y), visible height h (bigger than the members and in front of them) */
    _bo(b, box, opt = {}) {
      if (!box) return;
      b = b || {};
      const nm = opt.frame || this._boFrame(b.mood, b.blink);
      const hop = clamp(ip(b, 'hop', 1) || 0, 0, 1);
      const k = box.h * (opt.k || 1.06) / BO.body, lift = hop * 14 * (box.h / 220) + (opt.lift || 0);
      const breathe = 1 + 0.012 * Math.sin(this.time * 2.4);
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.fillStyle = `rgba(45,35,25,${0.22 - hop * 0.08})`; g.beginPath(); g.ellipse(4 * k, -1, box.h * 0.36 * (1 - hop * 0.2), box.h * 0.05, 0, 0, TAU); g.fill();
      g.translate(0, -lift); g.rotate((b.look || 0) * 0.03 + (opt.rot || 0));
      g.scale(1 / Math.sqrt(breathe) * (1 + hop * 0.02), breathe * (1 + hop * 0.04));
      this._img(nm, -BO.ax * k, -BO.ay * k, BO.w * k, BO.h * k);
      g.restore();
    }
    _chick(c, a) {
      if (!c || c.state === 'gone') return;
      const g = this.g, x = ip(c, 'x', a), y = ip(c, 'y', a), al = c.alpha == null ? 1 : ip(c, 'alpha', a), sc = c.scale || 1;
      if (!(al > 0.01) || !(x > -120 && x < this.W + 120)) return;
      const k = CHICK.draw / CHICK.w * sc, moving = c.state === 'run' || c.state === 'march' || c.state === 'in';
      const nm = (c.flap || 0) > 0.05 ? 'characters/chick_flap' : moving && c.step ? 'characters/chick_step' : 'characters/chick';
      const hopy = moving ? Math.abs(Math.sin((c.stepT || 0) * Math.PI)) * 4 : (c.flap || 0) * 10;
      g.save();
      if (c.state === 'in' && this._G) { const D = this._G.doorway; g.beginPath(); g.rect(-this.W, -this.H, D.x + this.W, 3 * this.H); g.rect(D.x, D.y - 4, D.w, D.h + 14); g.clip(); }
      g.globalAlpha *= al;
      g.fillStyle = 'rgba(50,40,30,0.18)'; g.beginPath(); g.ellipse(x, y + 2, 26 * sc, 5 * sc, 0, 0, TAU); g.fill();
      g.translate(x, y - hopy);
      if ((c.face || 1) < 0) g.scale(-1, 1);
      g.rotate((c.peck || 0) * 0.32);
      this._img(nm, -CHICK.ax * k, -CHICK.ay * k, CHICK.w * k, CHICK.h * k);
      g.restore();
    }
    _rooster(r, a) {
      if (!r) return;
      const g = this.g, x = ip(r, 'x', a), y = ip(r, 'y', a);
      if (!(x > -160 && x < this.W + 160)) return;
      const k = ROOSTER.draw / ROOSTER.h, fly = r.state === 'in' || r.state === 'leave';
      const nm = (r.crow || 0) > 0.05 ? 'characters/rooster_crow' : 'characters/rooster';
      g.save(); g.translate(x, y);
      if ((r.face || -1) > 0) g.scale(-1, 1);   // the art faces LEFT
      if (fly) g.rotate(Math.sin(this.time * 22) * 0.07 - 0.08);
      else if ((r.crow || 0) > 0.05) g.scale(1 + 0.04 * r.crow, 1 + 0.04 * r.crow);
      this._img(nm, -ROOSTER.ax * k, -ROOSTER.ay * k, ROOSTER.w * k, ROOSTER.h * k);
      g.restore();
    }
    _firefly(x, y, glow) {
      const g = this.g, gl = clamp(glow, 0, 1.6);
      if (gl <= 0.01) return;
      const r = 18 + 16 * gl;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(240,250,160,${(0.55 * Math.min(1, gl)).toFixed(3)})`); rg.addColorStop(1, 'rgba(240,250,160,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      this._sprite('particles/firefly', x, y, 22 + 6 * gl, Math.sin(this.time * 3 + x) * 0.3, Math.min(1, 0.5 + gl * 0.5));
    }
    _hintHand(H, a) {
      const P = PA(); if (!H || !P) return;
      const al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      try { P.drawHintHand(this.g, ip(H, 'x', a), ip(H, 'y', a), H.press || 0, al, 96); } catch (e) { /* skip */ }
    }

    /* ---------- a little parade (title / done): things marching in step at feet y ---------- */
    _things(items, opt = {}) {
      const P = PA(); if (!P) return;
      const g = this.g, t = this.time, rate = opt.rate || 2.4;
      for (const it of items) {
        const ph = (t * rate + (it.ph || 0)) % 1, step = Math.floor(t * rate + (it.ph || 0)) % 2;
        const walker = it.thing.kind === 'animal', bob = (walker ? 9 : 3.5) * 4 * ph * (1 - ph), q = Math.max(0, 0.05 * Math.cos(ph * TAU));
        g.fillStyle = 'rgba(50,40,30,0.2)'; g.beginPath(); g.ellipse(it.x, it.y + 3, it.size * 0.36 * (1 - bob / 80), 7, 0, 0, TAU); g.fill();
        g.save();
        if (opt.clip) { const D = opt.clip; g.beginPath(); g.rect(-this.W, -this.H, D.x + this.W, 3 * this.H); g.rect(D.x, D.y - 4, D.w, D.h + 14); g.clip(); }
        g.globalAlpha *= it.alpha == null ? 1 : it.alpha;
        g.translate(it.x, it.y - bob); g.rotate((it.face || 1) * 0.05 * Math.sin(ph * TAU)); g.scale((it.face || 1) * (1 + q), 1 / (1 + q));
        try { P.drawMember(g, it.thing, it.size, { step, wheel: (it.face || 1) * t * 4, night: this._night, dpr: this.rs }); } catch (e) { /* skip */ }
        g.restore();
      }
    }

    /* ---------- title: Bo in the parade cap waving beside a little line (bucket wagon, sheep, block) ---------- */
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      this._barn(0, Math.sin(this.time * 0.6) * 0.5);
      const ly = L.line.y;
      // portrait: Bo stands in front, below the path (as in play); landscape: Bo on the left, the line by the barn — right of
      // the centred ▶ / star pill so the DOM title never covers it
      const bh = portrait ? 250 : clamp(H * 0.4, 230, 300);
      const bx = (ins.left || 0) + (portrait ? 40 : 50) + bh * 0.4, by = gy - 6;
      const x1 = this._G ? this._G.doorway.x - 70 : W - 220;
      // keep clear of the DOM title (▶ and the star pill) when they reach down to the path (landscape phones)
      const x0min = bx + bh * 0.45, boxes = (o.boxes && o.boxes.title) || [];
      const things = [{ kind: 'animal', animal: 'sheep' }, { kind: 'block', shape: 'star', color: 'yellow' }, { kind: 'obj', obj: 'bucket', color: 'red' }];
      const n = things.length, maxS = portrait ? 116 : 108, fit = xmin => (x1 - xmin) / (0.55 + (n - 1) * 1.15);
      let xmin = x0min, y = ly, low = 0;
      for (const r of boxes) if (r.y + r.h > ly - 130 && r.x < x1) { xmin = Math.max(xmin, r.x + r.w + 12); low = Math.max(low, r.y + r.h); }
      let size = Math.min(maxS, fit(xmin));
      if (size < 90) {   // no room beside the ▶ / star pill: walk on the grass just below them instead
        const yLow = low + Math.min(maxS, fit(x0min)) + 6;
        if (yLow <= gy - 2) { y = Math.max(ly, yLow); size = Math.min(maxS, fit(x0min)); } else size = Math.max(78, size);
      }
      const sp = size * (portrait ? 1.3 : 1.15), x0 = x1 - (n - 1) * sp;
      this._things(things.map((th, i) => ({ thing: th, x: x0 + i * sp, y, size, ph: 0 })), { rate: 1.6 });
      this._bo({ hop: 0 }, { x: bx, y: by, h: bh }, { frame: 'characters/bo_title', k: 1, rot: Math.sin(this.time * 2) * 0.02 });
    }
    /* ---------- session done: the friends parade out of the barn in a loop, Bo dances, confetti ---------- */
    _doneScene(w, o) {
      const W = this.W, t = this.time, L = this._L, G = this._G;
      this._galleryT += o.dt || 0;
      this._barn(1, t * 2.4);
      const list = this.gallery.length ? this.gallery : [{ kind: 'obj', obj: 'bucket', color: 'red' }, { kind: 'animal', animal: 'sheep' }, { kind: 'block', shape: 'heart', color: 'blue' }, { kind: 'animal', animal: 'cow' }];
      const size = Math.min(L.item || 110, 112), gap = size * 1.45, speed = 120;
      const startX = G ? G.doorway.x + G.doorway.w * 0.5 : W - 120, endX = -size;
      const loop = Math.max(startX - endX, list.length * gap) + gap;
      const items = [];
      list.forEach((th, i) => {
        const d = ((this._galleryT * speed - i * gap) % loop + loop) % loop;
        if (this._galleryT * speed - i * gap < 0) return;
        const x = startX - d;
        if (x < endX) return;
        items.push({ thing: th, x, y: L.line.y, size, face: -1, ph: i * 0.5, alpha: clamp((startX - x) / 30, 0, 1) });
      });
      this._things(items, { rate: 2.6, clip: G ? G.doorway : null });
      const beat = Math.floor(t * 2.6) % 2;
      this._bo({ hop: Math.max(0, Math.sin(t * 2.6 * Math.PI)) * 0.8 }, L.bo, { frame: beat ? 'characters/bo_dance' : 'characters/bo_cheer' });
      this._confT = (this._confT || 0) - (o.dt || 0);
      if (this._confT <= 0) { this._confT = 0.7; this.burst('sparkles', lerp(L.line.x0, L.line.x1, Math.random()), L.line.y - size * (0.8 + Math.random() * 0.8), { n: 6 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((FP.CONFIG && FP.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2;
      const cy = H > W ? Math.max((L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 40, L.line.y - L.item - 260) : H * 0.4;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(50,35,25,.28)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#B5735E'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#7E4A3C'; g.stroke();
      g.fillStyle = '#FFF9EE'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#E9C46A'; g.stroke();
      const I = FP.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7D6A4A', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#7E4A3C', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7D6A4A', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#7E4A3C', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && FP.PALETTE && FP.PALETTE[c]) ? FP.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'woof') {   // Bo's bark: three little motion arcs from the mouth
        fx.push({ k: 'woof', x, y, t: 0, life: 0.45 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round((opt.n || 110) * q), lf = opt.life || 5;   // opt.n / opt.life: a short burst (the grand parade)
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * (opt.n ? 0.25 : 0.5), vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: lf + R() * lf * 0.4, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral pops up over the counted apple
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.5, text: String(opt.n || '') });
      } else if (type === 'puff') {
        const n = Math.round((opt.n || 7) * q);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + R() * 0.4, sp = 60 + R() * 70;
          fx.push({ k: 'p', sprite: 'dust', tint: opt.color || '#F3ECE2', x, y, vx: Math.cos(a) * sp + (opt.vx || 0), vy: Math.sin(a) * sp * 0.5 - 30, g: -20, drag: 2, t: 0, life: 0.5 + R() * 0.3, size: 22 + R() * 16, rot: R() * TAU, vr: 1 });
        }
      } else if (type === 'feathers') {
        const n = Math.round((opt.n || 6) * q);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 80 + R() * 120;
          fx.push({ k: 'p', sprite: 'feather', tint: null, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 60, drag: 2.5, t: 0, life: 1.2 + R() * 0.5, size: 18 + R() * 8, rot: R() * TAU, vr: (R() - 0.5) * 6, sway: R() * TAU });
        }
      }
    }
    _fx(dt) {
      const g = this.g, fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        const u = f.t / f.life;
        if (u >= 1) { if (f.onDone) f.onDone(); fx.splice(i, 1); continue; }
        if (f.k === 'p') {
          f.vy += (f.g || 0) * dt;
          if (f.drag) { f.vx *= 1 - Math.min(0.9, f.drag * dt); f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'woof') {
          g.save(); g.strokeStyle = `rgba(122,78,44,${(0.85 * (1 - u)).toFixed(3)})`; g.lineCap = 'round'; g.lineWidth = 5;
          for (let j = -1; j <= 1; j++) { const r = 22 + u * 34 + Math.abs(j) * 4; g.beginPath(); g.arc(f.x, f.y, r, j * 0.45 - 0.32, j * 0.45 + 0.32); g.stroke(); }
          g.restore();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#7E4A3C', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = FP.Assets.tinted ? FP.Assets.tinted(name, color, size * this.rs) : FP.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        if (nm === 'firefly') { this._firefly(p.x, p.y, (p.glow != null ? p.glow : 1) * p.alpha * 0.8); continue; }
        const tint = p.color && TINTABLE[nm] ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = FP.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      const a0 = g.globalAlpha;
      if (alpha != null && alpha < 1) g.globalAlpha = a0 * alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      g.globalAlpha = a0;
    }
    _img(name, x, y, w, h) {
      const spr = FP.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.boHit && w.boHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      const d = w.doorHit && w.doorHit(); if (d) { g.strokeStyle = 'rgba(255,120,0,.7)'; g.strokeRect(d.x, d.y, d.w, d.h); }
      for (const m of w.members || []) {
        const h = w.memberHit && w.memberHit(m.id); if (!h) continue;
        g.strokeStyle = m.odd ? 'rgba(220,0,0,.7)' : 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      for (const h of [w.chickHit && w.chickHit(), w.roosterHit && w.roosterHit(), w.fireflyHit && w.fireflyHit()]) {
        if (h) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke(); }
      }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with ParadeArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !PA()) return;
    try { g.save(); g.translate(cw / 2, ch / 2); PA().drawIcon(g, thing, Math.min(ch, cw) * 0.94); g.restore(); } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.barnGeom = barnGeom;
  Renderer.drawPath = drawPath;
  Renderer.RECIPE = { SKY, GROUND_BOTTOM, PATH, RIM, DOOR_TINT, GLOW, SUN, MOON, STARS, CLOUDS };
  FP.Renderer = Renderer;
})(window.FP = window.FP || {});
