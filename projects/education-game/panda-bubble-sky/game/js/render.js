/* PB.Renderer (Bao's Bubble Sky) — draws the rainbow cloud land and the bubble field on one canvas (DESIGN §7, MECHANICS §5).
 * Order: sky → sun → clouds → far → mid (season crossfade) → back particles → ground → rainbow (+ a mist at its feet; drawn
 * over the floor so no piece hides in the clouds — see _rainbowMist) → Bao's cushion → Bao (the wand
 * film is in the SVG) → kite string + kite → bubbles (back-to-front by y: film back → the thing → shine front; growing ones on
 * the wand) → bird → freed things (hop / count / badge / flight to the rainbow) → drops / mini bubbles → snowflakes → hint hand
 * → front particles → fx (numerals, sparkles, stars flying to the HUD) → chapter banner.
 * The environment follows tools/env_scenes.js RECIPE: envLayout / tileXs / cushionRect / drawEnv are pasted verbatim below
 * (one change in drawEnv: a cloud may carry its own fade `a`). Title: Bao waving with the wand on his cushion under a full
 * rainbow, bubbles drifting up behind the logo. Session done: Bao dances and blows a sky full of bubbles that pop into
 * confetti. Logical coordinates (short side 720) × render scale rs = device pixels. */
(function (PB) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const INK = '#4A4880', INK2 = '#6E6AAE';

  /* ---------- RECIPE tables (tools/env_scenes.js + tools/art_env.js) ---------- */
  const SKY = { spring: [[0, '#CFE6FA'], [1, '#FCEFF4']], summer: [[0, '#86C9F0'], [1, '#E2F5FF']], autumn: [[0, '#F3C28F'], [1, '#FCEBD3']], winter: [[0, '#B7C8E4'], [1, '#EEF2F9']] };
  const GROUND_BOTTOM = { spring: '#EEDDEA', summer: '#DCE9F5', autumn: '#F2DDCA', winter: '#DFE6F1' };
  const SUN = {
    landscape: { spring: { x: 0.74, y: 0.62, size: 140, a: 0.95 }, summer: { x: 0.8, y: 0.5, size: 160, a: 1 }, autumn: { x: 0.86, y: 0.95, size: 170, a: 0.95 }, winter: { x: 0.68, y: 0.7, size: 120, a: 0.8 } },
    portrait: { spring: { x: 0.74, y: 0.5, size: 130, a: 0.95 }, summer: { x: 0.76, y: 0.42, size: 150, a: 1 }, autumn: { x: 0.8, y: 0.72, size: 160, a: 0.95 }, winter: { x: 0.7, y: 0.55, size: 112, a: 0.8 } },
  };
  const MOON = { landscape: { x: 0.68, y: 0.4, size: 120 }, portrait: { x: 0.72, y: 0.5, size: 120 } };
  const CLOUDS = {
    spring: { n: 3, alpha: 0.9, tint: 'rgba(250,226,238,0.35)' },
    summer: { n: 3, alpha: 0.95, tint: null },
    autumn: { n: 3, alpha: 0.85, tint: 'rgba(250,214,180,0.4)' },
    winter: { n: 3, alpha: 0.9, tint: 'rgba(214,224,242,0.35)' },
  };
  const PARTICLES = {
    spring: { back: ['petal', 'blossom'], front: ['petal', 'butterfly'], n: 22 },
    summer: { back: ['mote', 'glint'], front: ['glint', 'butterfly'], n: 18 },
    autumn: { back: ['leaf'], front: ['leaf'], n: 20 },
    winter: { back: ['snow'], front: ['snow', 'sparkle'], n: 40 },
  };
  const RECIPE_TABLES = { SKY, GROUND_BOTTOM, CLOUDS };

  /* ---------- RECIPE functions: pasted verbatim from tools/env_scenes.js (pure) ---------- */
  /** Pure layout of the environment for a W × H screen. ins = safe-area insets; groundY = world.layout.groundY. */
  function envLayout(W, H, ins, groundY) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    if (groundY == null) groundY = H - ins.bottom - (portrait ? 26 : 14);
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.9 * kp, km = kp;
    const kg = portrait ? (tall ? 1.3 : 1.15) : 1;
    const floorY = Math.round(groundY - (portrait ? (tall ? 300 : 250) : 150));   // visible top of the cloud floor
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: Math.round(floorY - 50 * kg) };
    ground.fillY = ground.y + 258 * kg;
    // mid: row 296 hides behind the floor; the waterfall island (x 300) a bit left of centre in landscape, left in portrait
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.3 : 0.42) - 300 * km), y: Math.round(floorY + 24 * kg - 296 * km) };
    // far: its row 720 lands on mid row 236 (inside the mid banks' solid part); the castle (far x 860) right of centre
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.62 : 0.66) - 860 * kf), y: Math.round(mid.y + 236 * km - 720 * kf) };
    const landY = Math.round(far.y + 400 * kf);               // ≈ the top of the big far islands (sun reference)
    const sky = { y0: 0, y1: Math.round(far.y + 640 * kf) };   // sky gradient end (behind the far cloud sea)
    const o = portrait ? 'portrait' : 'landscape', sun = {};
    const cw = W - ins.left - ins.right, skyH = landY - ins.top;
    // landscape: the top band is shared with the speech bubble (top-left) — keep the sun right of the bubble's edge (bx)
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
    for (const m of ['spring', 'summer', 'autumn', 'winter']) {
      const s = SUN[o][m]; let x = ins.left + s.x * cw;
      if (!portrait) x = Math.max(x, bx + s.size * 0.5);
      sun[m] = { x, y: ins.top + s.y * skyH, size: s.size, a: s.a };
    }
    const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * skyH, size: mo.size };
    const clouds = portrait
      ? { y0: ins.top + 0.17 * H, y1: Math.max(ins.top + 0.17 * H + 40, landY - 170), y2: landY - 40, s: 0.62 }
      : { y0: ins.top + 40, y1: Math.min(ins.top + 200, landY - 20), y2: landY, s: 0.6 };
    return { W, H, portrait, tall, groundY, floorY, kp, far, mid, ground, landY, sky, sun, moon, clouds };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
  /** Bao's cushion rect from world.layout.bao {x, y (FEET), h}: art 300×120, anchor (150, 30) on the feet, k = h / 220. */
  function cushionRect(bao) { const k = bao.h / 220; return { x: bao.x - 150 * k, y: bao.y - 30 * k, w: 300 * k, h: 120 * k, k }; }
  /** Draw the environment for season m (steps 0–5 of the recipe). img(name) → a drawable for 'env/far_spring' etc. (an
   *  Image or a pre-scaled canvas from PB.Assets.exact). opt = { part: 'all'|'back'|'front', clouds: [{kind:'a'|'b', x, y,
   *  s, a?}] (centres, from weather.clouds; a = the cloud's own fade — the one integrator change), cloudImg(kind, m) → tinted
   *  drawable (optional), alpha }. Pure canvas. */
  function drawEnv(g, L, m, img, opt) {
    opt = opt || {};
    const W = L.W, H = L.H, part = opt.part || 'all', R = RECIPE_TABLES;
    g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
    const a0 = g.globalAlpha;
    const tile = (name, Ly) => { const im = img(name); if (!im) return; for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
    if (part !== 'front') {
      // 0 sky
      const gr = g.createLinearGradient(0, L.sky.y0, 0, L.sky.y1);
      for (const [o, c] of R.SKY[m]) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // 1 sun + glow
      const sn = L.sun[m], warm = m === 'autumn' ? '255,214,170' : '255,248,220';
      const glow = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3);
      glow.addColorStop(0, `rgba(${warm},0.45)`); glow.addColorStop(1, `rgba(${warm},0)`);
      g.fillStyle = glow; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
      const si = img('env/sun'); if (si) { g.globalAlpha = a0 * sn.a; g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = a0; }
      // 2 clouds
      const cc = R.CLOUDS[m];
      for (const c of opt.clouds || []) {
        const im = opt.cloudImg ? opt.cloudImg(c.kind, m) : img('env/cloud_' + c.kind), w = 300 * c.s, h = 140 * c.s;
        if (!im) continue;
        g.globalAlpha = a0 * cc.alpha * (c.a == null ? 1 : c.a); g.drawImage(im, c.x - w / 2, c.y - h / 2, w, h);
      }
      g.globalAlpha = a0;
      // 3 far, 4 mid
      tile('env/far_' + m, L.far); tile('env/mid_' + m, L.mid);
    }
    if (part !== 'back') {
      // 5 ground + fill below
      tile('env/ground_' + m, L.ground);
      if (L.ground.fillY < H) { g.fillStyle = R.GROUND_BOTTOM[m]; g.fillRect(0, Math.floor(L.ground.fillY) - 1, W, H - L.ground.fillY + 2); }
    }
    g.restore();
  }

  /* ---------- character art metrics (docs/reports/art_bao.md, DESIGN §4.1) ---------- */
  const BAO = { w: 300, h: 300, ax: 150, ay: 292 };
  const BIRD = { w: 120, h: 100, ax: 60, ay: 50, k: 0.9 };
  const KITE = { w: 140, h: 200, ax: 70, ay: 70, k: 0.7 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const BA = () => PB.BubbleArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, mist: 1, feather: 1 };
  const BAO_FRAMES = { idle: 1, blink: 1, talk: 1, happy: 1, cheer: 1, think: 1, oops: 1, blow: 1, wave: 1, giggle: 1, dance: 1, title: 1 };
  // things for the title / celebration bubbles (answer colours, a few friends)
  const TITLE_THINGS = [{ kind: 'toy', obj: 'ball', color: 'red' }, { kind: 'toy', obj: 'duck', color: 'yellow' }, { kind: 'stars', n: 1 },
    { kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'toy', obj: 'car', color: 'blue' }, { kind: 'animal', animal: 'sheep' },
    { kind: 'shape', shape: 'triangle', color: 'green' }, { kind: 'toy', obj: 'umbrella', color: 'purple' }, { kind: 'toy', obj: 'kite', color: 'orange' }];

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
    const f = fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, f * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this.gallery = []; this._off = {};
      this._titleB = []; this._doneB = []; this._doneT = 0;
      this.onDonePop = null;   // main: a sound for the celebration's bubbles popping
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      PB.Assets.dropExact();
      this._envKey = ''; this._off = {};
      this._titleB = []; this._doneB = [];
    }
    /** pre-rasterize a season's tiles (so the crossfade never stutters) */
    prewarm(layout, season) {
      if (layout) this._envFor(layout);
      if (!this._env) return;
      const m = SEASONS[clamp(season | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
      if (layout && layout.bao) { const c = cushionRect(layout.bao); this._cushionImg(m, c); }
    }
    /** build the bitmap caches of this round's things + films before the first tap (bubble_art tip) */
    prewarmRound(world) {
      const P = BA(); if (!P || !world || !world.bubbles) return;
      const c = PB.Assets.makeCanvas(2, 2), x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      const R = world.layout ? world.layout.R : 70, mx = this._maxN(world);
      try {
        for (const b of world.bubbles) { P.drawThing(x, b.thing, 1.2 * R, { maxN: mx }); }
        P.drawBubble(x, R, { part: 'back' }); P.drawBubble(x, R, { part: 'front' });
      } catch (e) { /* cache only */ }
    }
    /** the things met this session (the celebration's bubbles carry them) */
    setGallery(list) { this.gallery = (list || []).slice(-12); this._doneB = []; this._doneT = 0; }
    clearGallery() { this.gallery = []; this._doneB = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const gy = L && L.groundY != null ? Math.round(L.groundY) : null;
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right), Math.round(ins.bottom), gy].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins, gy);
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const Ly = this._env[layer];
      return PB.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    _cushionImg(m, c) { return PB.Assets.exact('env/cushion_' + m, Math.max(1, Math.round(c.w * this.rs)), Math.max(1, Math.round(c.h * this.rs))); }
    /** a cloud through its season's 'source-atop' tint, cached */
    _cloudImg(kind, m) {
      const key = 'cloud' + kind + m;
      if (this._off[key]) return this._off[key];
      const base = PB.Assets.sprite('env/cloud_' + kind, 300 * 0.66 * this.rs * 1.2);
      if (!base) return null;
      const tint = CLOUDS[m] && CLOUDS[m].tint;
      const c = PB.Assets.makeCanvas(base.width, base.height), x = c.getContext('2d');
      x.drawImage(base, 0, 0);
      if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
      this._off[key] = c;
      return c;
    }
    _img4env(name) {
      const m = /^env\/(far|mid|ground)_(\w+)$/.exec(name);
      if (m) return this._tile(m[1], m[2]);
      return PB.Assets.sprite(name, 200 * this.rs);
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
      this._to = SEASONS.includes(amb.env) ? amb.env : 'spring';
      this._from = SEASONS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const clouds = this._clouds(weather.clouds || []);
      this._moods((m, al) => drawEnv(g, this._env, m, n => this._img4env(n), { part: 'back', clouds, cloudImg: (k, mm) => this._cloudImg(k, mm), alpha: al }));
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
    /** draw fn(season, alpha) for the current season, crossfading from the previous one */
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }
    /** the weather's drifting clouds placed in the RECIPE cloud band (yf 0.06…0.3 → y0…y1) */
    _clouds(list) {
      const C = this._env.clouds, out = [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!(c.alpha > 0.01)) continue;
        const yf = clamp(((c.yf != null ? c.yf : 0.18) - 0.06) / 0.24, 0, 1);
        const low = this._env.portrait && i === list.length - 1;   // portrait: one cloud in the lower band
        const y = (low ? lerp(C.y1, C.y2, 0.5) : lerp(C.y0, C.y1, yf)) + 4 * Math.sin(this.time * 0.2 + (c.ph || i));
        out.push({ kind: c.type === 'cloud_b' ? 'b' : 'a', x: c.x, y, s: C.s * (c.s || 0.8) / 0.8, a: clamp(c.alpha, 0, 1) });
      }
      return out;
    }
    /** ground (front part of the recipe) + Bao's cushion, crossfaded */
    _floor(baoBox) {
      const g = this.g;
      this._moods((m, al) => drawEnv(g, this._env, m, n => this._img4env(n), { part: 'front', alpha: al }));
      this._cushion(baoBox);
    }
    /** Integrator change: DESIGN draws the rainbow BEHIND the ground, but the cloud floor's top sits 150 px (landscape) /
     *  300 px (tall portrait) above groundY, so the arch's lower pieces — and in portrait the whole arch — were hidden and the
     *  freed things flew into the clouds. The rainbow is drawn over the floor; this soft cloud mist melts its feet into it. */
    _rainbowMist(rb, alpha) {
      const g = this.g, H = this.H;
      if (!(alpha > 0.01)) return;
      const col = GROUND_BOTTOM[this._to] || '#F4F6FB', feet = rb.cy;
      if (feet >= H) {   // landscape: the feet are below the screen — the mist rises from the floor top to the bottom edge
        const top = this._env.floorY + 20;
        if (top >= H) return;
        const gr = g.createLinearGradient(0, top, 0, H);
        gr.addColorStop(0, this._rgba(col, 0)); gr.addColorStop(0.55, this._rgba(col, 0.55 * alpha)); gr.addColorStop(1, this._rgba(col, 0.85 * alpha));
        g.fillStyle = gr; g.fillRect(0, top, this.W, H - top);
      } else {           // portrait: the feet stand on the clouds above Bao — a soft cloud band hides the cut ends
        const top = feet - 90, bot = Math.min(H, feet + 70);
        const gr = g.createLinearGradient(0, top, 0, bot);
        gr.addColorStop(0, this._rgba(col, 0)); gr.addColorStop(0.62, this._rgba(col, 0.92 * alpha)); gr.addColorStop(1, this._rgba(col, 0));
        g.fillStyle = gr; g.fillRect(0, top, this.W, bot - top);
        // and nothing of the arch shows below its feet
      }
    }
    _rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`; }
    _cushion(baoBox) {
      const g = this.g;
      if (!baoBox) return;
      const c = cushionRect(baoBox);
      this._moods((m, al) => { const im = this._cushionImg(m, c); if (im && al > 0.01) { g.globalAlpha = al; g.drawImage(im, c.x, c.y, c.w, c.h); g.globalAlpha = 1; } });
    }

    /* ---------- the round ---------- */
    _maxN(w) { let n = 0; if (w.cur && w.cur.mode === 'countSel') for (const b of w.bubbles || []) if (b.thing && b.thing.kind === 'stars') n = Math.max(n, b.thing.n || 0); return n || undefined; }
    _game(w, o, a) {
      const L = this._L, P = BA(); if (!L) return;
      const g = this.g, rb = w.rainbow;
      this._floor(null);
      // rainbow (behind the bubbles, rising out of the cloud floor — see _rainbowMist)
      if (P && rb && rb.alpha > 0.01 && rb.k) {
        try { P.drawRainbow(g, rb, rb.k, ip(rb, 'filled', a) || 0, { shine: ip(rb, 'shine', a) || 0, alpha: ip(rb, 'alpha', a), guide: rb.guide == null ? 1 : rb.guide }); } catch (e) { /* skip */ }
        this._rainbowMist(rb, ip(rb, 'alpha', a));
      }
      this._cushion(L.bao);
      this._bao(w.bao, L.bao, {});
      this._kite(w.kite, a);
      if (!P) return;
      const frost = clamp(this._amb.frost || 0, 0, 1), maxN = this._maxN(w);
      const list = (w.bubbles || []).filter(b => b.state !== 'wait' && b.state !== 'gone' && b.state !== 'freed');
      list.sort((p, q) => (p.state === 'grow') - (q.state === 'grow') || p.y - q.y);
      for (const b of list) this._bubble(b, a, frost, maxN, w);
      this._bird(w.bird, a);
      // freed things: hop / count / badge / fly to the rainbow (drawn above every bubble)
      for (const b of w.bubbles || []) if (b.fstate && b.fstate !== 'done') this._freed(b, a, maxN, L);
      for (const d of w.drops || []) { try { P.drawDrop(g, ip(d, 'x', a), ip(d, 'y', a), d.r, d.a); } catch (e) { /* skip */ } }
      for (const m of w.minis || []) { try { P.drawMiniBubble(g, ip(m, 'x', a), ip(m, 'y', a), m.r, m.a); } catch (e) { /* skip */ } }
      for (const f of w.snowflakes || []) {
        if (f.state === 'wait' || !(f.a > 0.01)) continue;
        g.save(); g.translate(ip(f, 'x', a), ip(f, 'y', a));
        try { P.drawSnowflake(g, f.r * (1 + 0.3 * (f.tw || 0)), ip(f, 'rot', a) || 0, f.a); } catch (e) { /* skip */ }
        g.restore();
      }
      this._hintHand(w.hintHand, a);
    }
    _bubble(b, a, frost, maxN, w) {
      const P = BA(), g = this.g;
      const x = ip(b, 'x', a), y = ip(b, 'y', a), r = ip(b, 'r', a), wob = ip(b, 'wob', a) || 0;
      if (!(r > 0.5)) return;
      const al = b.state === 'grow' ? clamp(ip(b, 'alpha', a), 0, 1) : 1;
      const opt = { wob, wobA: b.wobA || 0, t: b.t || 0, glow: b.glow || 0, frost, alpha: al,
        grow: b.state === 'grow' ? clamp(ip(b, 'grow', a) || 0, 0, 1) : 1, pop: b.state === 'pop' ? clamp(b.popT || 0, 0, 1) : 0 };
      g.save(); g.translate(x, y);
      try {
        if (b.state === 'pop') {
          P.drawBubble(g, r, Object.assign({ part: 'back' }, opt));
          // a soft pop at the top edge (the thing was never freed): it fades with the film
          if (!b.fstate) { g.save(); g.globalAlpha *= 1 - opt.pop; g.rotate(ip(b, 'rot', a) || 0); P.drawThing(g, b.thing, 1.2 * r, { maxN }); g.restore(); }
        } else {
          P.drawBubble(g, r, Object.assign({ part: 'back' }, opt));
          g.save(); g.globalAlpha *= al; g.rotate(ip(b, 'rot', a) || 0);
          P.drawThing(g, b.thing, 1.2 * r, { glow: b.glow || 0, maxN });
          g.restore();
          P.drawBubble(g, r, Object.assign({ part: 'front' }, opt));
        }
      } catch (e) { /* skip */ }
      g.restore();
    }
    _freed(b, a, maxN, L) {
      const P = BA(), g = this.g;
      const fx = ip(b, 'fx', a), fy = ip(b, 'fy', a), fs = ip(b, 'fs', a) || 1, fr = ip(b, 'fr', a) || 0, fq = ip(b, 'fq', a) || 0;
      const size = 1.2 * (L.R || L.d / 2);
      if (b.badge && b.badge.a > 0.01) {
        g.save(); g.translate(b.badge.x, b.badge.y);
        try { P.drawHomeBadge(g, b.badge.home, b.badge.r, { a: b.badge.a, pop: easeOutBack(clamp(b.badge.a, 0, 1)) }); } catch (e) { /* skip */ }
        g.restore();
      }
      g.save(); g.translate(fx, fy); g.rotate(fr); g.scale(fs * (1 + fq), fs / (1 + fq));
      // a soft glow while it flies, so the eye follows it to the rainbow
      if (b.fstate === 'fly') {
        const gr = g.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 0.85);
        gr.addColorStop(0, 'rgba(255,255,240,0.55)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, size * 0.85, 0, TAU); g.fill();
      }
      try { P.drawThing(g, b.thing, size, { count: b.count == null ? -1 : b.count, maxN }); } catch (e) { /* skip */ }
      g.restore();
    }
    _baoFrame(mood, blink) {
      let nm = BAO_FRAMES[mood] ? mood : 'idle';
      if (blink && nm === 'idle') nm = 'blink';
      // speaking: the mouth flaps between talk and idle (only in the calm poses)
      if (this._speaking && (nm === 'idle' || nm === 'talk' || nm === 'blink')) nm = Math.sin(this.time * 17) > -0.2 ? 'talk' : 'idle';
      else if (nm === 'talk' && !this._speaking) nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      const key = 'characters/bao_' + nm;
      return PB.Assets.has(key) ? key : 'characters/bao_idle';
    }
    /** Bao at feet (box.x, box.y), height box.h (art 300 × 300, feet anchor (150, 292)) */
    _bao(b, box, opt) {
      if (!box) return;
      b = b || {};
      const nm = opt.frame || this._baoFrame(b.mood, b.blink);
      const bounce = clamp(b.bounce || 0, 0, 1);
      const k = box.h / 300 * (opt.k || 1), lift = bounce * 14 * (box.h / 240) + (opt.lift || 0);
      const breathe = 1 + 0.012 * Math.sin(this.time * 2.4);
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.translate(0, -lift); g.rotate((b.look || 0) * 0.025 + (opt.rot || 0));
      g.scale(1 / Math.sqrt(breathe) * (1 - bounce * 0.02), breathe * (1 + bounce * 0.05));
      this._img(nm, -BAO.ax * k, -BAO.ay * k, BAO.w * k, BAO.h * k);
      g.restore();
    }
    _bird(bd, a) {
      if (!bd || bd.state === 'gone') return;
      const g = this.g, x = ip(bd, 'x', a), y = ip(bd, 'y', a);
      if (!(x > -140 && x < this.W + 140)) return;
      const nm = (bd.flap || 0) > 0.5 ? 'characters/bird_flap' : 'characters/bird', k = BIRD.k;
      g.save(); g.translate(x, y);
      if ((bd.face || 1) < 0) g.scale(-1, 1);
      if (bd.state === 'in' || bd.state === 'out' || bd.state === 'pass') g.rotate(Math.sin(this.time * 9) * 0.05);
      this._img(nm, -BIRD.ax * k, -BIRD.ay * k, BIRD.w * k, BIRD.h * k);
      g.restore();
    }
    _kite(kt, a) {
      if (!kt || kt.state === 'gone') return;
      const g = this.g, x = ip(kt, 'x', a), y = ip(kt, 'y', a), rot = ip(kt, 'rot', a) || 0, k = KITE.k;
      // a sagging string from the bridle knot to off-screen bottom-left
      const sx = kt.stringX != null ? kt.stringX : -40, sy = kt.stringY != null ? kt.stringY : this.H + 40;
      g.save();
      g.strokeStyle = 'rgba(110,100,130,0.75)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + sx) / 2, (y + sy) / 2 + 60, sx, sy); g.stroke();
      g.translate(x, y); g.rotate(rot);
      this._img('characters/kite', -KITE.ax * k, -KITE.ay * k, KITE.w * k, KITE.h * k);
      g.restore();
    }
    _hintHand(H, a) {
      const P = BA(); if (!H || !P) return;
      const al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      try { P.drawHintHand(this.g, ip(H, 'x', a), ip(H, 'y', a), H.press || 0, al, 96); } catch (e) { /* skip */ }
    }

    /* ---------- floating bubbles for the title / celebration ---------- */
    _spawnFloat(list, opt) {
      const R = Math.random, r = opt.r0 + R() * (opt.r1 - opt.r0);
      list.push({ x: opt.x(), y: opt.y(), r, vx: opt.vx(), vy: opt.vy(), t: R() * 10, ph: R() * TAU, age: 0,
        life: opt.life ? opt.life[0] + R() * (opt.life[1] - opt.life[0]) : 1e9, pop: 0,
        thing: R() < (opt.pThing || 0) ? opt.thing() : null, rot: (R() - 0.5) * 0.3 });
    }
    _drawFloat(b, frost) {
      const P = BA(), g = this.g;
      g.save(); g.translate(b.x, b.y);
      const wob = 0.04 * Math.sin(b.t * 3.1 + b.ph);
      const opt = { wob, wobA: b.ph, t: b.t, frost, alpha: clamp(Math.min(1, b.age / 0.4), 0, 1) };
      try {
        if (b.pop > 0) P.drawBubble(g, b.r, Object.assign({ part: 'back', pop: clamp(b.pop, 0, 1) }, opt));
        else {
          P.drawBubble(g, b.r, Object.assign({ part: 'back' }, opt));
          if (b.thing) { g.save(); g.globalAlpha *= opt.alpha; g.rotate(b.rot + 0.08 * Math.sin(b.t + b.ph)); P.drawThing(g, b.thing, 1.2 * b.r, {}); g.restore(); }
          P.drawBubble(g, b.r, Object.assign({ part: 'front' }, opt));
        }
      } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- title: Bao waving with the wand on his cushion under a full rainbow; bubbles drift up behind the logo ---------- */
    _titleScene(w, o) {
      const P = BA(), g = this.g, W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W, dt = this._dt || 0;
      const bh = portrait ? 280 : clamp(H * 0.44, 250, 320);
      const box = { x: (ins.left || 0) + (portrait ? 40 : 46) + bh * 0.42, y: L.groundY - 4, h: bh };
      this._floor(null);
      // a full pastel rainbow over the field
      if (P && L.rainbow) { try { P.drawRainbow(g, L.rainbow, 7, 7, { shine: (this.time * 0.18) % 1, alpha: 0.85, guide: 0 }); } catch (e) { /* skip */ } this._rainbowMist(L.rainbow, 0.85); }
      this._cushion(box);
      // drifting bubbles: rise from below, wobble, some with a friend inside; pop softly at the top
      const list = this._titleB, frost = clamp(this._amb.frost || 0, 0, 1);
      const want = portrait ? 9 : 8;
      if (P && list.length < want && Math.random() < dt * 3) {
        this._spawnFloat(list, { r0: 34, r1: 70, x: () => box.x + bh * 0.3 + Math.random() * (W - box.x - bh * 0.3 - 40), y: () => L.groundY + 60,
          vx: () => (Math.random() - 0.3) * 20, vy: () => -(40 + Math.random() * 40), pThing: 0.45, thing: () => TITLE_THINGS[(Math.random() * TITLE_THINGS.length) | 0] });
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]; b.age += dt; b.t += dt;
        if (b.pop > 0) { b.pop += dt / 0.22; if (b.pop >= 1) { list.splice(i, 1); continue; } }
        else { b.x += (b.vx + 14 * Math.sin(b.t * 0.9 + b.ph)) * dt; b.y += b.vy * dt; if (b.y < (ins.top || 0) + b.r + 10) b.pop = 0.01; }
      }
      list.sort((p, q) => p.y - q.y);
      if (P) for (const b of list) this._drawFloat(b, frost);
      this._bao({ bounce: 0 }, box, { frame: 'characters/bao_title', rot: Math.sin(this.time * 2) * 0.02 });
    }
    /* ---------- session done: Bao dances and blows a sky full of bubbles that pop into confetti ---------- */
    _doneScene(w, o) {
      const P = BA(), g = this.g, L = this._L, t = this.time, dt = this._dt || 0;
      this._floor(null);
      if (P && L.rainbow) { try { P.drawRainbow(g, L.rainbow, 7, 7, { shine: (t * 0.3) % 1, alpha: 0.9, guide: 0 }); } catch (e) { /* skip */ } this._rainbowMist(L.rainbow, 0.9); }
      this._cushion(L.bao);
      const beat = Math.floor(t * 2.6) % 2;
      const blowing = Math.floor(t / 1.8) % 3 === 0;   // every third beat-bar Bao blows a fresh stream of bubbles
      this._bao({ bounce: blowing ? 0 : Math.max(0, Math.sin(t * 2.6 * Math.PI)) * 0.8 }, L.bao, { frame: blowing ? 'characters/bao_blow' : beat ? 'characters/bao_dance' : 'characters/bao_cheer' });
      const ring = L.bao.blowRing || { x: L.bao.x + 60, y: L.bao.y - 180 };
      const list = this._doneB, frost = clamp(this._amb.frost || 0, 0, 1), things = this.gallery.length ? this.gallery : TITLE_THINGS;
      this._doneT -= dt;
      if (P && blowing && this._doneT <= 0 && list.length < 16) {
        this._doneT = 0.22;
        this._spawnFloat(list, { r0: 30, r1: 62, x: () => ring.x + 10, y: () => ring.y, vx: () => 160 + Math.random() * 220, vy: () => -(60 + Math.random() * 170),
          life: [1.6, 3.4], pThing: 0.6, thing: () => things[(Math.random() * things.length) | 0] });
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]; b.age += dt; b.t += dt;
        if (b.pop > 0) { b.pop += dt / 0.22; if (b.pop >= 1) { list.splice(i, 1); continue; } continue; }
        b.vx *= 1 - 0.8 * dt; b.vy = b.vy * (1 - 0.5 * dt) - 18 * dt;
        b.x += (b.vx + 12 * Math.sin(b.t * 1.1 + b.ph)) * dt; b.y += b.vy * dt;
        const out = b.x - b.r > this.W || b.y + b.r < 0;
        if (out) { list.splice(i, 1); continue; }
        if (b.age >= b.life) {
          b.pop = 0.01;
          this.burst('confetti', b.x, b.y, { n: 10, life: 1.6, at: true });
          if (b.thing) this.burst('sparkles', b.x, b.y, { n: 6 });
          if (this.onDonePop) this.onDonePop(b);
        }
      }
      if (P) for (const b of list) this._drawFloat(b, frost);
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((PB.CONFIG && PB.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = H > W ? W / 2 : clamp(W / 2, bw / 2 + 30, W - bw / 2 - 30);
      const cy = H > W ? Math.max((L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 50, H * 0.34) : H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(50,56,110,.22)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 9, bw, bh, 34); g.fill();
      // a rainbow rim: the 7 pastel bands around the card
      const RB = ['#F6A6A6', '#F8C49A', '#F7E19A', '#B9E3A8', '#A9D2F2', '#B9B2EE', '#E2B6E8'];
      const grd = g.createLinearGradient(-bw / 2 - 10, 0, bw / 2 + 10, 0);
      RB.forEach((c, i) => grd.addColorStop(i / (RB.length - 1), c));
      g.fillStyle = grd; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.fillStyle = '#FDFEFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#C9D6F2'; g.stroke();
      const I = PB.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, INK2, null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 56, INK, '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, INK2, null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, INK, '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && PB.PALETTE && PB.PALETTE[c]) ? PB.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round((opt.n || 110) * q), lf = opt.life || 5;
        for (let i = 0; i < n; i++) {
          const at = !!opt.at, a = R() * TAU, sp = 120 + R() * 200;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[(i + (R() * 7 | 0)) % CONF.length],
            x: at ? x : R() * this.W, y: at ? y : -20 - R() * this.H * (opt.n ? 0.25 : 0.5), vx: at ? Math.cos(a) * sp : (R() - 0.5) * 60, vy: at ? Math.sin(a) * sp - 80 : 60 + R() * 120,
            g: at ? 220 : 30, drag: at ? 1.4 : 0.6, t: 0, life: lf + R() * lf * 0.4, size: (at ? 16 : 22) + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral pops up over the counted star / bubble
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.6, text: String(opt.n || '') });
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
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFFFFF', INK, 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = PB.Assets.tinted ? PB.Assets.tinted(name, color, size * this.rs) : PB.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        const tint = p.color && TINTABLE[nm] ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = PB.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = PB.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.baoHit && w.baoHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      const f = L.field; if (f) { g.strokeStyle = 'rgba(0,140,0,.5)'; g.strokeRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0); }
      for (const b of w.bubbles || []) {
        const h = w.bubbleHit && w.bubbleHit(b.id); if (!h) continue;
        g.strokeStyle = b.target ? 'rgba(0,160,0,.7)' : 'rgba(220,0,0,.6)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      for (const h of [w.birdHit && w.birdHit(), w.kiteHit && w.kiteHit(), w.snowHit && w.snowHit()]) {
        if (h) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke(); }
      }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with BubbleArt.drawIcon into a small canvas. opt.bubble: the shown
   *  thing sits inside a soap bubble (the question card), like in the game. */
  Renderer.preview = function (canvas, thing, opt) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const P = BA();
    if (!thing || !P) return;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      if (opt && opt.bubble) {
        const r = Math.min(ch, cw) * 0.46;
        P.drawBubble(g, r, { part: 'back', t: 1.3 });
        P.drawThing(g, thing, 1.2 * r, {});
        P.drawBubble(g, r, { part: 'front', t: 1.3 });
      } else P.drawIcon(g, thing, Math.min(ch, cw) * 0.94);
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.cushionRect = cushionRect;
  Renderer.drawEnv = drawEnv;
  Renderer.RECIPE = { SEASONS, SKY, GROUND_BOTTOM, SUN, MOON, CLOUDS, PARTICLES };
  PB.Renderer = Renderer;
})(window.PB = window.PB || {});
