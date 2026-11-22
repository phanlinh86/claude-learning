/* DK.Renderer (Mimi's Splash Rocket) — draws the mountain campsite and the rocket launches on one canvas (DESIGN §7,
 * MECHANICS §5). Order: sky → sun → rainbow (mood) → clouds → far → mid (the env RECIPE from tools/env_scenes.js, pasted
 * verbatim below; mood crossfade) → back particles → meadow + camp props, flame, windsock (DK.MeadowArt) → puddle rings →
 * burrow + marmot, rock + goat → pole + pennants (+ the bird on the pole) → mats back-to-front by y (mat → thing → glow,
 * home badges) → the flying thing → aim arc → pad + pump → Mimi → rocket (+ chute; in flight drawn in front of everything
 * except the water and fx) → drops → fountain (+ a little rainbow in the spray) → hint hand → front particles (rain) → fx
 * (sparkles, numerals, stars flying to the HUD, confetti) → wipe (a weather sweep) → chapter banner.
 * Title: Mimi in her title pose (waving, the bottle rocket under her wing) by the camp, a rocket sways down under its
 * parachute onto a golden mat now and then. Session done: Mimi dances under a garland of every pennant won, the rocket
 * shoots fountains with a little rainbow, confetti.
 * Every moving world value is interpolated with its `_p` twin and world.alpha. Logical coordinates (short side 720) × render
 * scale rs = device pixels. world.js gives `camp` / `meadow` as {x0, x1, y0, y1}; DK.MeadowArt and the RECIPE read
 * {x, y, w, h}: `artLayout()` adds those (both forms kept). */
(function (DK) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const INK = '#4A3626', INK2 = '#7A6544';

  /* ---------- RECIPE: pasted verbatim from docs/reports/art_env.md (= tools/env_scenes.js) ---------- */
  const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
  const SKY = {                 // DESIGN §3 exact (= tools/art_env.js SKY, asserted below)
    sunny: [[0, '#9FD3EE'], [1, '#F3F7EE']],
    breezy: [[0, '#B7D9EC'], [1, '#F1F3EA']],
    rain: [[0, '#A7B5C3'], [1, '#DCE2E6']],
    rainbow: [[0, '#B6DDF0'], [1, '#FBF3E6']],
  };
  const K = { far: 0.6, mid: 0.62 };
  // sun per mood: alpha + glow colour (rain: hidden)
  const SUN = {
    sunny: { a: 1, size: 100, glow: '255,248,220' },
    breezy: { a: 0.92, size: 92, glow: '255,248,226' },
    rain: { a: 0, size: 86, glow: '255,248,230' },
    rainbow: { a: 0.95, size: 96, glow: '255,244,220' },
  };
  const CLOUDS = {
    sunny: { n: 3, alpha: 0.95, kinds: ['a', 'b'], tint: null },
    breezy: { n: 4, alpha: 0.92, kinds: ['b', 'a'], tint: 'rgba(236,240,246,0.25)' },
    rain: { n: 5, alpha: 0.96, kinds: ['rain', 'rain', 'a'], tint: 'rgba(170,182,196,0.35)' },
    rainbow: { n: 2, alpha: 0.9, kinds: ['a', 'b'], tint: 'rgba(255,244,230,0.2)' },
  };
  const RAINBOW = { a: 0.55, rMax: 0.62 };     // alpha; outer radius ≤ rMax × meadow width
  // weather particles per mood (names in particles/): back = behind mats, front = in front (few, small)
  const PARTICLES = {
    sunny: { back: ['mote'], front: ['butterfly'], n: 14 },
    breezy: { back: ['leaf', 'petal'], front: ['leaf', 'petal'], n: 22 },        // blown across by the wind, gusts
    rain: { back: ['raindrop'], front: ['raindrop'], ground: ['splash'], n: 60 },
    rainbow: { back: ['rainbow_sparkle', 'mote'], front: ['butterfly', 'rainbow_sparkle'], n: 16 },
  };
  // [w, h] or [w, h, anchorX, anchorY] (viewBox; bottom-centre anchors) — = tools/art_env.js SPRITES
  const TILES = { far: [1200, 720], mid: [1200, 300], rainbow: [1200, 600], cloud: [300, 140], sun: [200, 200],
    tent_a: [260, 200, 130, 196], tent_b: [260, 200, 130, 196], campfire: [140, 120, 70, 114], pine: [160, 300, 80, 294],
    rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], windsock: [120, 200, 60, 196] };
  const ROWS = { midBase: 300, midBand: 240, midFar: 205, farBase: 660 };   // mid row 300 = horizon; far row 660 on mid row 205
  
  /** Pure layout of the background for a W × H screen. ins = safe-area insets; layout = world.layout. */
  function envLayout(W, H, ins, layout) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const lay = layout || {};
    const play = lay.play || { y0: portrait ? 244 : 162 };
    const horizon = Math.round(lay.horizon != null ? lay.horizon : (portrait ? play.y0 + 120 : play.y0 + 0.3 * (H - play.y0)));
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;            // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.6 * kp, km = 0.62 * kp;
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * 0.5 - 600 * km), y: horizon - 300 * km };
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.55 : 0.6) - 690 * kf), y: mid.y + 205 * km - 660 * kf };
    const sky = { y0: 0, y1: horizon };
    const hud = lay.hud || { x: W - ins.right - 160, y: 0, w: 160 + ins.right, h: ins.top + 96 };
    const bub = lay.bubble || (portrait ? { x: 24, y: ins.top + 110, w: W - 48, h: 124 } : { x: ins.left + 24, y: ins.top + 18, w: Math.min(700, W - 224), h: 134 });
    const md = lay.meadow || { x: 0, y: play.y0, w: W, h: H - play.y0 };
    // sun
    const size = portrait ? 90 : 96;
    let sx, sy;
    if (portrait) { sx = ins.left + Math.max(size * 0.7, 0.3 * (hud.x - ins.left)); sy = ins.top + Math.max(size * 0.55, (bub.y - ins.top) * 0.5); }
    else {
      const gx0 = bub.x + bub.w + 12, gx1 = hud.x - 12;
      if (gx1 - gx0 >= size + 20) { sx = gx0 + 0.5 * (gx1 - gx0); sy = ins.top + Math.max(size * 0.6, (play.y0 - ins.top) * 0.42); }
      else { sx = hud.x - size * 0.55; sy = Math.max(hud.y + hud.h, bub.y + bub.h) + size * 0.42; }
    }
    const sun = { x: sx, y: sy, size };
    // rainbow: centred over the meadow, top ≥ ins.top + 16, feet behind the mountains (≈ the horizon − 40)
    const rbBase = horizon - 40 * kp;
    const rOut = Math.max(120, Math.min(RAINBOW.rMax * md.w, rbBase - (ins.top + 16)));
    const rk = rOut / 560;
    // landscape: shift it right so the arc shows beside / below the speech bubble (it would hide behind it otherwise)
    const rcx = portrait ? md.x + md.w / 2 : Math.min(W - ins.right - rOut * 0.45, Math.max(md.x + md.w / 2, bub.x + bub.w + rOut * 0.35));
    const rainbow = { x: rcx - 600 * rk, y: rbBase - 640 * rk, w: 1200 * rk, h: 600 * rk };
    const clouds = { y0: ins.top + 26, y1: Math.max(ins.top + 44, (portrait ? bub.y : play.y0) - 40), s: portrait ? 0.46 : 0.42 };
    return { W, H, portrait, tall, kp, horizon, far, mid, sky, sun, rainbow, clouds, _g: null };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
  /** Draw the background for mood m. img(name) → a drawable for 'env/far_sunny' etc. (Image or DK.Assets.exact canvas).
   *  opt = { clouds: [{kind:'a'|'b'|'rain', x, y, s, a?}] (centres, from weather.clouds), cloudImg(kind, m) → tinted drawable
   *  (optional), alpha, rainbow (0..1 override of the rainbow's strength; default 1 in the rainbow mood, else 0),
   *  sunA (0..1 multiplier, e.g. weather.ambient.sunA) }. Pure canvas; gradients cached on L per context. */
  function drawEnv(g, L, m, img, opt) {
    opt = opt || {};
    const W = L.W, H = L.H, R = RECIPE_TABLES;
    g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
    const a0 = g.globalAlpha;
    const tile = (name, Ly) => { const im = img(name); if (!im) return; for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
    if (!L._g || L._g.ctx !== g) L._g = { ctx: g, sky: {}, glow: {} };
    // 0 sky (the bottom stop continues below the horizon; the meadow covers it)
    let gr = L._g.sky[m];
    if (!gr) { gr = g.createLinearGradient(0, L.sky.y0, 0, L.sky.y1); for (const [o, c] of R.SKY[m]) gr.addColorStop(o, c); L._g.sky[m] = gr; }
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 1 sun + glow
    const sm = R.SUN[m], sn = L.sun, sa = sm.a * (opt.sunA == null ? 1 : opt.sunA);
    if (sa > 0.01) {
      let gl = L._g.glow[m];
      if (!gl) { gl = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3); gl.addColorStop(0, `rgba(${sm.glow},0.45)`); gl.addColorStop(1, `rgba(${sm.glow},0)`); L._g.glow[m] = gl; }
      g.globalAlpha = a0 * sa; g.fillStyle = gl; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
      const si = img('env/sun'); if (si) g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size);
      g.globalAlpha = a0;
    }
    // 2 rainbow (drawn once, behind the clouds and the mountains)
    const rb = opt.rainbow != null ? opt.rainbow : (m === 'rainbow' ? 1 : 0);
    if (rb > 0.01) { const ri = img('env/rainbow'); if (ri) { g.globalAlpha = a0 * R.RAINBOW.a * rb; g.drawImage(ri, L.rainbow.x, L.rainbow.y, L.rainbow.w, L.rainbow.h); g.globalAlpha = a0; } }
    // 3 clouds
    const cc = R.CLOUDS[m];
    for (const c of opt.clouds || []) {
      const im = opt.cloudImg ? opt.cloudImg(c.kind, m) : img('env/cloud_' + c.kind), w = 300 * c.s, h = 140 * c.s;
      if (!im) continue;
      g.globalAlpha = a0 * cc.alpha * (c.a == null ? 1 : c.a); g.drawImage(im, c.x - w / 2, c.y - h / 2, w, h);
    }
    g.globalAlpha = a0;
    // 4 far, 5 mid
    tile('env/far_' + m, L.far); tile('env/mid_' + m, L.mid);
    g.restore();
  }
  // the tables drawEnv reads (render.js: `const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };`)
  const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };

  /* ---------- character art metrics (docs/reports/art_mimi.md, DESIGN §4.1) ---------- */
  const MIMI_FRAMES = { idle: 1, blink: 1, talk: 1, happy: 1, cheer: 1, think: 1, oops: 1, pump: 1, wave: 1, giggle: 1, dance: 1, look: 1, title: 1 };
  const MP = () => DK.MIMI_POINTS || { feet: [150, 290], box: [40, 28, 284, 292] };
  const RP = () => DK.ROCKET_POINTS || { nozzle: [60, 236], nose: [60, 10], com: [60, 150], waterTop: 150, w: 56 };
  const PUMP_K = 0.85;            // the foot pump's drawn size (× MatArt's 1.35 art scale)
  const CHUTE = { w: 240, h: 200, ax: 120, ay: 196 };
  const MARMOT = { w: 160, h: 160, ax: 80, ay: 156, k: 0.6 };
  const GOAT = { w: 180, h: 180, ax: 90, ay: 174, k: 0.58 };
  const BIRD = { w: 100, h: 90, ax: 50, ay: 86, k: 0.66 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const MA = () => DK.MatArt;
  const ME = () => DK.MeadowArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, mist: 1, feather: 1 };
  // the things on the title / celebration mats (answer colours, a friend, pinecones)
  const TITLE_THINGS = [{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'animal', animal: 'duck' },
    { kind: 'dots', n: 3 }, { kind: 'obj', obj: 'lantern', color: 'blue' }];
  // the wipe sweep per mood: a soft haze + the mood's bits riding it
  const WIPE_SPR = { sunny: ['mote', 'sparkle', 'butterfly', 'mote'], breezy: ['leaf', 'petal', 'leaf', 'leaf'], rain: ['raindrop', 'dot', 'raindrop', 'raindrop'], rainbow: ['rainbow_sparkle', 'sparkle', 'butterfly', 'rainbow_sparkle'] };
  const WIPE = { sunny: ['#FFF6DA', '#FFFBEE', '#F6E4A8'], breezy: ['#EEF3E2', '#F8FAF0', '#CFE0B8'], rain: ['#E3E9EE', '#F3F6F8', '#C3CFD9'], rainbow: ['#FBEFF4', '#FFFAF3', '#E6D8F2'] };
  const RB = ['#F4A7A7', '#F7C99A', '#F6E7A0', '#B8E0B0', '#A9CDEE', '#C9B8EC'];   // the fountain's little pastel rainbow
  const byY = (p, q) => p._ry - q._ry;
  const rect = r => (r && r.x0 != null ? { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 } : r);

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
  const boxHit = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this._off = {}; this._aL = null; this._aSrc = null;
      this.gallery = [];                 // the pennants won this session (the celebration garland)
      this._list = [];                   // reused: the mats to draw this frame, sorted by y
      this._title = null; this._done = null;
      this.donePanel = null; this.titleKeep = null;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      DK.Assets.dropExact();
      this._envKey = ''; this._off = {}; this._aSrc = null;
      this._title = null; this._done = null;
    }
    /** world.layout with camp / meadow also as {x, y, w, h} (what MeadowArt and the RECIPE read) */
    artLayout(L) {
      if (!L) return null;
      if (this._aSrc === L && this._aL && this._aL.W === L.W && this._aL.H === L.H && this._aL.horizon === L.horizon) return this._aL;
      this._aSrc = L;
      this._aL = Object.assign({}, L, { camp: rect(L.camp), meadow: rect(L.meadow) });
      return this._aL;
    }
    /** pre-rasterize a mood's tiles and meadow (so the crossfade and the first round never stutter) */
    prewarm(layout, mood) {
      if (!layout) return;
      this._envFor(layout);
      const m = MOODS[clamp(mood | 0, 0, 3)];
      for (const l of ['far', 'mid']) this._tile(l, m);
      const A = DK.Assets, M = ME();
      if (M && A && A.total && A.loaded >= A.total) {
        const c = this._scratch || (this._scratch = A.makeCanvas(4, 4)), x = c.getContext('2d');
        try { M.drawMeadow(x, this.artLayout(layout), m, { t: 0, dpr: this.rs, quality: this.quality }); } catch (e) { /* cache only */ }
      }
    }
    /** build the bitmap caches of this round's mats + things before the first tap */
    prewarmRound(world) {
      const P = MA(); if (!P || !world || !world.mats || !world.layout) return;
      const c = this._scratch || (this._scratch = DK.Assets.makeCanvas(4, 4)), x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      const L = world.layout, wet = world.weather === 2 ? 1 : 0;
      try {
        for (const m of world.mats) {
          if (m.state === 'gone') continue;
          P.drawMat(x, L.S * (m.ds || 1), { seed: m.seed, unfold: 1, wet });
          P.drawThing(x, m.thing, L.itemH * (m.ds || 1), {});
        }
      } catch (e) { /* cache only */ }
    }
    /** the pennants won this session (the celebration garland) */
    setGallery(list) { this.gallery = (list || []).slice(-12); this._done = null; }
    clearGallery() { this.gallery = []; this._done = null; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const b = (L && L.bubble) || {};
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right), Math.round(ins.bottom), L && L.play ? Math.round(L.play.y0) : 0,
        L ? Math.round(L.horizon) : 0, Math.round(b.x || 0), Math.round(b.w || 0), Math.round(b.h || 0)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins, this.artLayout(L));
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const Ly = this._env[layer];
      return DK.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    /** a cloud through its mood's 'source-atop' tint, cached */
    _cloudImg(kind, m) {
      const key = 'cloud' + kind + m;
      if (this._off[key]) return this._off[key];
      const base = DK.Assets.sprite('env/cloud_' + kind, 300 * 0.5 * this.rs * 1.2);
      if (!base) return null;
      const tint = CLOUDS[m] && CLOUDS[m].tint;
      const c = DK.Assets.makeCanvas(base.width, base.height), x = c.getContext('2d');
      x.drawImage(base, 0, 0);
      if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
      this._off[key] = c;
      return c;
    }
    _img4env(name) {
      const m = /^env\/(far|mid)_(\w+)$/.exec(name);
      if (m) return this._tile(m[1], m[2]);
      if (name === 'env/rainbow') return DK.Assets.sprite(name, Math.max(200, this._env.rainbow.w * this.rs));
      return DK.Assets.sprite(name, 200 * this.rs);
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      const L = this._L = world.layout;
      const AL = this._A = this.artLayout(L);
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = MOODS.includes(amb.env) ? amb.env : (MOODS[amb.moodIndex] || 'sunny');
      this._from = MOODS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      this._wind = weather.wind || 0;
      this._envFor(L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const clouds = this._clouds(weather.clouds || []);
      this._moods((m, al) => drawEnv(g, this._env, m, n => this._img4env(n), { clouds, cloudImg: (k, mm) => this._cloudImg(k, mm), alpha: al, sunA: amb.sunA == null ? 1 : amb.sunA }));
      if (!L || L.horizon == null) { this._particles(weather.particles, 'back'); this._particles(weather.particles, 'front'); return; }
      this._particles(weather.particles, 'back');
      const M = ME();
      if (M) this._moods((m, al) => { try { M.drawMeadow(g, AL, m, { t: this.time, wind: this._wind, quality: this.quality, dpr: rs, alpha: al }); } catch (e) { /* skip */ } });
      if (o.title) this._titleScene(world, weather, o);
      else if (o.done) this._doneScene(world, weather, o);
      else this._game(world, weather, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._wipe(world.wipe, a);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    /** draw fn(mood, alpha) for the current mood, crossfading from the previous one */
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }
    /** the weather's drifting clouds placed in the RECIPE cloud band */
    _clouds(list) {
      const C = this._env.clouds, out = this._cloudList || (this._cloudList = []);
      out.length = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!(c.alpha > 0.01)) continue;
        const yf = clamp(((c.yf != null ? c.yf : (c.y != null ? c.y / Math.max(1, this.H) : 0.18)) - 0.04) / 0.3, 0, 1);
        const y = lerp(C.y0, C.y1, yf) + 4 * Math.sin(this.time * 0.2 + (c.ph || i));
        out.push({ kind: c.type === 'cloud_rain' ? 'rain' : c.type === 'cloud_b' ? 'b' : 'a', x: c.x, y, s: C.s * (c.s || 0.8) / 0.8, a: clamp(c.alpha, 0, 1) });
      }
      return out;
    }

    /* ---------- the round ---------- */
    _game(w, weather, o, a) {
      const L = this._L, P = MA(), g = this.g;
      if (!P) return;
      // puddle rings lie flat on the ground, under everything that stands
      for (const r of w.rings || []) if (r.a > 0.01) P.drawPuddleRing(g, r.x, r.y, r.r, r.a);
      this._marmot(w.marmot, a);
      this._goat(w.goat, a);
      // the camp flagpole + the pennants won this round (+ the bird perched on top)
      P.drawPole(g, L.pole.x, L.pole.y0, L.pole.y1, { t: this.time });
      for (const q of w.pennants || []) {
        const pop = Math.max(0, q.pop == null ? 1 : q.pop);
        if (pop < 0.02) continue;
        g.save(); g.translate(q.x, q.y);
        P.drawPennant(g, q.thing, (q.w || L.pennantW || 56) * pop, { flutter: clamp((q.flutter || 0) + Math.abs(q.wave || 0), 0, 1), t: q.t || this.time });
        g.restore();
      }
      this._bird(w.bird, a);
      // mats back-to-front by y
      const list = this._list; list.length = 0;
      for (const m of w.mats || []) {
        if (m.state === 'hidden' || m.state === 'gone') continue;
        m._ry = ip(m, 'y', a); list.push(m);
      }
      list.sort(byY);
      const wet = clamp(this._to === 'rain' ? this._mix : this._from === 'rain' ? 1 - this._mix : 0, 0, 1);
      for (let i = 0; i < list.length; i++) this._mat(list[i], a, L, wet);
      for (let i = 0; i < list.length; i++) {
        const b = list[i].badge;
        if (b && b.a > 0.01) { g.save(); g.translate(b.x, b.y); P.drawHomeBadge(g, b.home, b.r, { a: b.a, pop: easeOutBack(clamp(b.a, 0, 1)) }); g.restore(); }
      }
      // the thing flying up to its pennant slot
      const f = w.flyer;
      if (f) {
        const s = ip(f, 's', a) || 1, x = ip(f, 'x', a), y = ip(f, 'y', a), ih = L.itemH * s;
        g.save(); g.translate(x, y); g.rotate(ip(f, 'rot', a) || 0); g.translate(0, 0.5 * ih);
        P.drawThing(g, f.thing, ih, { shadow: false });
        g.restore();
      }
      // aim arc → pad + pump → Mimi → rocket
      if (w.arc && w.arcAlpha > 0.01) P.drawArc(g, w.arc, { t: this.time, alpha: w.arcAlpha });
      const r = w.rocket, pu = w.pump;
      this._padPump(L, ip(r, 'aim', a) || 0, { press: ip(pu, 'press', a) || 0, glow: pu.glow || 0, gauge: pu.gauge || 0, count: pu.count || 0 });
      const flying = r.state === 'boost' || r.state === 'coast' || r.state === 'chute';
      this._mimi(w.mimi, a, L);
      if (!flying) this._rocketW(r, a, L);
      // water: spray, splash, fountain drops
      for (const d of w.drops || []) P.drawDrop(g, ip(d, 'x', a), ip(d, 'y', a), d.r, d.a == null ? 1 : d.a);
      if (w.fountain) this._fountain(w.fountain, a);
      if (flying) this._rocketW(r, a, L);
      const hh = w.hintHand;
      if (hh && hh.alpha > 0.01) P.drawHintHand(g, ip(hh, 'x', a), ip(hh, 'y', a), hh.press || 0, hh.alpha, clamp(L.S * 0.72, 84, 110));
    }
    _mat(m, a, L, wet) {
      const P = MA(), g = this.g;
      const x = ip(m, 'x', a), y = m._ry, al = clamp(ip(m, 'alpha', a), 0, 1), ds = m.ds || 1;
      if (!(al > 0.01)) return;
      g.save(); g.translate(x, y);
      const rot = ip(m, 'rot', a) || 0; if (rot) g.rotate(rot);
      P.drawMat(g, L.S * ds, { seed: m.seed, unfold: ip(m, 'unfold', a), flap: ip(m, 'flap', a) || 0, squish: ip(m, 'squish', a) || 0,
        gold: clamp(ip(m, 'gold', a) || 0, 0, 1), glow: m.glow || 0, active: clamp(ip(m, 'active', a) || 0, 0, 1), wet: Math.max(wet, m.wet ? 0.6 : 0), alpha: al, t: this.time });
      const tA = clamp(ip(m, 'thingA', a), 0, 1);
      if (tA > 0.01 && m.thing) {
        g.translate(0, -(ip(m, 'thingHop', a) || 0));
        const wig = ip(m, 'wig', a) || 0; if (wig) g.rotate(wig);
        P.drawThing(g, m.thing, L.itemH * ds * (ip(m, 'thingS', a) || 1), { glow: m.glow || 0, alpha: al * tA, count: m.count == null ? -1 : m.count });
      }
      g.restore();
    }
    _mimiFrame(n, forced) {
      let nm = forced || (MIMI_FRAMES[n.frame] ? n.frame : 'idle');
      // speaking: the bill flaps between talk and idle (only in the calm poses)
      if (!forced && (nm === 'idle' || nm === 'talk' || nm === 'blink')) {
        if (this._speaking) nm = Math.sin(this.time * 17) > -0.2 ? 'talk' : 'idle';
        else if (nm === 'talk') nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      }
      const key = 'characters/mimi_' + nm;
      return DK.Assets.has(key) ? key : 'characters/mimi_idle';
    }
    /** Mimi at her feet (x, y), height h (art 300 × 300, feet (150, 290)), scale (sx, sy) + lean about the feet, facing right */
    _mimi(n, a, L, opt) {
      if (!n) return;
      opt = opt || {};
      const g = this.g, h = n.h || L.mimiH || 180, k = h / 300, F = MP().feet;
      const x = opt.x != null ? opt.x : ip(n, 'x', a), y = opt.y != null ? opt.y : ip(n, 'y', a);
      // a soft shadow on the camp ground (shrinks while she hops)
      const gy = opt.ground != null ? opt.ground : (n.onPump ? L.pump.y + 16 : L.mimiHome.y);
      const up = clamp((gy - y) / 60, 0, 1);
      if (!opt.noShadow && y <= gy + 4) {
        g.fillStyle = 'rgba(60,50,30,0.18)'; g.beginPath(); g.ellipse(x - 4 * k, gy + 2, 92 * k * (1 - 0.35 * up), 15 * k * (1 - 0.35 * up), 0, 0, TAU); g.fill();
      }
      g.save();
      g.translate(x, y); g.rotate((opt.lean != null ? opt.lean : ip(n, 'lean', a)) || 0);
      g.scale(opt.sx || ip(n, 'sx', a) || 1, opt.sy || ip(n, 'sy', a) || 1);
      if ((n.face || 1) < 0) g.scale(-1, 1);
      this._img(this._mimiFrame(n, opt.frame), -F[0] * k, -F[1] * k, 300 * k, 300 * k);
      g.restore();
    }
    /** the launch pad (+ its hose) and the foot pump; the pump is drawn at PUMP_K of MatArt's size about its plunger top so the
     *  whole pump (base plate + shadow) stays on screen above the home indicator (the hit circle is the world's, r ≥ 80) */
    _padPump(L, aim, po) {
      const P = MA(), g = this.g, k = PUMP_K, px = L.pump.x, py = L.pump.y;
      const hose = P.pumpHose ? P.pumpHose(0, 0) : { x: 44, y: 70 };
      P.drawPad(g, L.pad.x, L.pad.y, { aim, hose: { x: px + hose.x * k, y: py + hose.y * k } });
      g.save(); g.translate(px, py); g.scale(k, k); P.drawPump(g, 0, 0, po); g.restore();
    }
    /** the world's rocket: interpolated nozzle point / rotation, chute at the nose */
    _rocketW(r, a, L) {
      const s = r.s || L.rocketS || 0.53;
      const x = ip(r, 'x', a), y = ip(r, 'y', a), rot = ip(r, 'rot', a) || 0;
      const nx = ip(r, 'noseX', a), ny = ip(r, 'noseY', a);
      const ch = clamp(ip(r, 'chute', a) || 0, 0, 1.4);
      if (ch > 0.05) this._chute(nx, ny, ip(r, 'chuteRot', a) || 0, s * ch, 1);
      this._rocket(x, y, rot, s, ip(r, 'sx', a) || 1, ip(r, 'sy', a) || 1, r.water == null ? 1 : r.water, r.fizz || 0);
      if (ch <= 0.05 && (r.chuteFold || 0) > 0.02) this._chute(nx, ny, rot, s, 0, r.chuteFold);
    }
    /** the bottle rocket: nozzle bottom (x, y), rot about the nozzle (0 = nose up), art scale s × (sx, sy); water 0..1 (the empty
     *  part above the water line is glass), fizz 0..1 (bubbles after a stomp) */
    _rocket(x, y, rot, s, sx, sy, water, fizz) {
      const g = this.g, R = RP(), N = R.nozzle;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(s * (sx || 1), s * (sy || 1));
      this._img('characters/rocket', -N[0], -N[1], 120, 240);
      const wt = R.waterTop || 150, bottom = N[1] - 20, emp = clamp(1 - (water == null ? 1 : water), 0, 1);
      if (emp > 0.02) {   // the water drains towards the nozzle: the bottle above the water line is clear glass
        g.save(); g.beginPath(); roundRect(g, -N[0] + 37, wt - N[1], 46, (bottom - wt) * emp, 8); g.clip();
        g.fillStyle = 'rgba(221,239,242,0.92)'; g.fillRect(-N[0] + 30, wt - N[1] - 2, 60, (bottom - wt) * emp + 2);
        g.restore();
      }
      if (fizz > 0.02) {   // bubbles rising in the water after a stomp
        g.fillStyle = `rgba(255,255,255,${(0.85 * clamp(fizz, 0, 1)).toFixed(3)})`;
        for (let i = 0; i < 7; i++) {
          const ph = (this.time * 1.6 + i * 0.37) % 1, bx = -N[0] + 44 + ((i * 37) % 32), by = bottom - N[1] - ph * (bottom - wt - 6);
          g.beginPath(); g.arc(bx, by, 3 + (i % 3), 0, TAU); g.fill();
        }
      }
      g.restore();
    }
    /** the parachute at the nose (nx, ny): open (canopy, scale s, rot) or packed (closed bundle, alpha fold) */
    _chute(nx, ny, rot, s, open, fold) {
      if (!(isFinite(nx) && isFinite(ny))) return;
      const g = this.g;
      g.save(); g.translate(nx, ny); if (rot) g.rotate(rot);
      if (!open) g.globalAlpha *= clamp(fold, 0, 1);
      g.scale(s, s);
      this._img(open ? 'characters/chute' : 'characters/chute_closed', -CHUTE.ax, -CHUTE.ay, CHUTE.w, CHUTE.h);
      g.restore();
    }
    /** the fountain: a soft spray column from the rocket's nose + a little pastel rainbow across the spray */
    _fountain(F, a) {
      const g = this.g, h = Math.max(0, ip(F, 'h', a) || F.h || 0), al = clamp(F.a == null ? 1 : F.a, 0, 1);
      if (h < 4 || al < 0.01) return;
      const x = F.x, y = F.y;
      g.save();
      const gr = g.createLinearGradient(0, y, 0, y - h);
      gr.addColorStop(0, `rgba(235,248,252,${(0.55 * al).toFixed(3)})`); gr.addColorStop(1, 'rgba(235,248,252,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 7, y); g.quadraticCurveTo(x - 26, y - h * 0.6, x - 14, y - h); g.lineTo(x + 14, y - h); g.quadraticCurveTo(x + 26, y - h * 0.6, x + 7, y); g.closePath(); g.fill();
      const rb = clamp(F.rainbow || 0, 0, 1) * al;
      if (rb > 0.02) {
        const cy = y - h * 0.25, R0 = Math.max(26, h * 0.42);
        g.lineWidth = Math.max(3, R0 * 0.07);
        for (let i = 0; i < RB.length; i++) {
          g.strokeStyle = RB[i]; g.globalAlpha = 0.55 * rb;
          g.beginPath(); g.arc(x, cy, R0 - i * g.lineWidth, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        }
      }
      g.restore();
    }
    /** the marmot pops out of its burrow (clipped above the burrow line) */
    _marmot(q, a) {
      if (!q || !(q.a == null || q.a > 0.01)) return;
      const P = MA(), g = this.g, x = ip(q, 'x', a), y = ip(q, 'y', a), k = MARMOT.k;
      P.drawBurrow(g, x, y, q.burrowR || 34);
      const rise = clamp(q.rise || 0, 0, 1);
      if (rise < 0.01) return;
      g.save();
      g.beginPath(); g.rect(x - 120, y - 260, 240, 260 + 3); g.clip();
      g.translate(x, y + (1 - rise) * ((DK.CONFIG && DK.CONFIG.marmotH) || 84) - (q.jump || 0) + 6);
      if (q.look) g.rotate(0.08 * q.look);
      this._img(q.frame === 'marmot_wave' ? 'characters/marmot_wave' : 'characters/marmot', -MARMOT.ax * k, -MARMOT.ay * k, MARMOT.w * k, MARMOT.h * k);
      g.restore();
    }
    /** the goat on its far rock (the rock's top at the goat's feet line); the art faces LEFT */
    _goat(q, a) {
      if (!q) return;
      const P = MA(), g = this.g, al = clamp(q.a == null ? 1 : q.a, 0, 1);
      if (al < 0.01) return;
      const rw = (q.rockW || 120) * 0.75, rt = P.rockTop ? P.rockTop(rw) : rw * 0.42;
      g.save(); g.globalAlpha *= al;
      P.drawRock(g, q.rockX, q.rockY + rt, rw);
      const x = ip(q, 'x', a), y = ip(q, 'y', a) - (q.hop || 0), k = GOAT.k;
      g.translate(x, y); if ((q.face || -1) > 0) g.scale(-1, 1);
      this._img(q.frame === 'goat_hop' ? 'characters/goat_hop' : 'characters/goat', -GOAT.ax * k, -GOAT.ay * k, GOAT.w * k, GOAT.h * k);
      g.restore();
    }
    /** the little bird (perched on the pole top); the art faces LEFT */
    _bird(q, a) {
      if (!q) return;
      const g = this.g, al = clamp(q.a == null ? 1 : q.a, 0, 1);
      if (al < 0.01) return;
      const x = ip(q, 'x', a), y = ip(q, 'y', a), k = BIRD.k;
      g.save(); g.globalAlpha *= al; g.translate(x, y);
      if ((q.face || -1) > 0) g.scale(-1, 1);
      if (q.state !== 'perch') g.rotate(0.12 * Math.sin(this.time * 20) * (q.flap || 1));
      this._img(q.frame === 'bird_sing' ? 'characters/bird_sing' : 'characters/bird', -BIRD.ax * k, -BIRD.ay * k, BIRD.w * k, BIRD.h * k);
      g.restore();
    }

    /* ---------- the wipe: a weather sweep crosses the screen (covering it at t = 0.5) ---------- */
    _wipe(wp, a) {
      if (!wp) return;
      const g = this.g, W = this.W, H = this.H;
      const t = clamp(ip(wp, 't', a), 0, 1);
      if (t <= 0 || t >= 1) return;
      const dir = wp.dir || { x: 1, y: 0 }, horiz = Math.abs(dir.x) >= Math.abs(dir.y), sgn = horiz ? Math.sign(dir.x || 1) : Math.sign(dir.y || 1);
      const Lx = horiz ? W : H, f = Lx * 0.28;
      const c = -(Lx / 2 + 2 * f) + t * (2 * Lx + 4 * f);
      const half = Lx / 2 + f * 0.15;
      const mood = typeof wp.mood === 'string' && WIPE[wp.mood] ? wp.mood : MOODS[clamp((wp.weather != null ? wp.weather : wp.mood) | 0, 0, 3)];
      const col = WIPE[mood] || WIPE.sunny;
      const pos = u => sgn > 0 ? u : Lx - u;
      const p0 = pos(c - half - f), p1 = pos(c - half), p2 = pos(c + half), p3 = pos(c + half + f);
      const gr = horiz ? g.createLinearGradient(p0, 0, p3, 0) : g.createLinearGradient(0, p0, 0, p3);
      const span = p3 - p0, st = v => clamp((v - p0) / span, 0, 1);
      gr.addColorStop(0, this._rgba(col[0], 0)); gr.addColorStop(st(p1), this._rgba(col[0], 0.96));
      gr.addColorStop(clamp((st(p1) + st(p2)) / 2, 0, 1), this._rgba(col[1], 0.99)); gr.addColorStop(st(p2), this._rgba(col[0], 0.96)); gr.addColorStop(1, this._rgba(col[0], 0));
      g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const spr = WIPE_SPR[mood] || WIPE_SPR.sunny, acr = horiz ? H : W;
      for (let i = 0; i < 46; i++) {
        const h1 = ((i * 0.6180339) % 1), h2 = ((i * 0.7548776 + 0.31) % 1), h3 = ((i * 0.5698403 + 0.17) % 1);
        const u = c + (h1 - 0.5) * (2 * half + 1.2 * f) + Math.sin(t * 7 + i) * 18, v = h2 * acr + Math.cos(t * 5 + i * 1.3) * 22;
        const pu = pos(u), size = 22 + 26 * h3, nm = spr[i % spr.length];
        const rot = nm === 'raindrop' ? 0.25 : t * (3 + 4 * h3) * (i % 2 ? 1 : -1) + i;
        if (nm === 'dot') this._tinted('dot', '#BFD3E3', horiz ? pu : v, horiz ? v : pu, size * 0.5, 0, 0.8);
        else this._sprite(nm, horiz ? pu : v, horiz ? v : pu, size, rot, 0.9);
      }
      g.fillStyle = col[2]; const across = horiz ? H : W;
      for (let i = 0; i < 9; i++) {
        const v = (i + 0.5) / 9 * across, wob = Math.sin(i * 2.3 + t * 9) * f * 0.25;
        for (const e of [p1 + (p0 - p1) * 0.35, p2 + (p3 - p2) * 0.35]) {
          const r = 26 + 14 * Math.sin(i * 1.7 + t * 6);
          g.globalAlpha = 0.28;
          g.beginPath(); if (horiz) g.arc(e + wob, v, r, 0, TAU); else g.arc(v, e + wob, r, 0, TAU); g.fill();
        }
      }
      g.restore();
    }
    _rgba(hex, al) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${al.toFixed(3)})`; }

    /* ---------- title / celebration props ---------- */
    /** keep-out boxes of the camp corner (Mimi, pad, pump, pole + pennants) in logical px */
    _campKeep(L) {
      const mh = L.mimiH || 180, out = [];
      out.push({ x: L.mimiHome.x - 0.5 * mh, y: L.mimiHome.y - mh, w: mh, h: mh + 10 });
      out.push({ x: L.pad.x - 60, y: L.pad.y - (L.rocketH || 120) - 30, w: 120, h: (L.rocketH || 120) + 70 });
      out.push({ x: L.pump.x - 70, y: L.pump.y - 50, w: 140, h: 110 });
      out.push({ x: L.pole.x - 14, y: L.pole.y1 - 10, w: 100, h: L.pole.y0 - L.pole.y1 + 20 });
      return out;
    }
    /** mats on the meadow clear of the DOM title (logo, ▶, star line: keep, logical px) and the camp corner; farthest-point */
    _propMats(L, keep, n) {
      const M = rect(L.meadow), S = L.S, ih = L.itemH, avoid = (keep || []).concat(this._campKeep(L), L.keep || []);
      const dsAt = y => (DK.World && DK.World.depthAt ? DK.World.depthAt(L, y) : 0.9);
      const cand = [];
      for (let y = L.horizon + ih + 26; y <= M.y1 - 0.3 * S; y += 22) for (let x = M.x0 + 0.62 * S; x <= M.x1 - 0.62 * S; x += 22) {
        const ds = dsAt(y), f = { x: x - 0.56 * S * ds, y: y - ih * ds - 12, w: 1.12 * S * ds, h: ih * ds + 0.24 * S * ds + 16 };
        if (avoid.some(k => boxHit(f, k, 10))) continue;
        cand.push({ x, y, ds });
      }
      const out = [];
      if (!cand.length) return out;
      // seeded start: the candidate nearest the meadow centre-right, then farthest-point
      let best = cand[0], bs = -1e9;
      for (const c of cand) { const s = -Math.hypot(c.x - (M.x0 + 0.62 * M.w), c.y - (L.horizon + M.y1) / 2); if (s > bs) { bs = s; best = c; } }
      out.push(best);
      while (out.length < n) {
        let b2 = null, d2 = -1;
        for (const c of cand) {
          const d = Math.min(...out.map(o => Math.hypot(c.x - o.x, (c.y - o.y) * 1.6)));
          if (d > d2) { d2 = d; b2 = c; }
        }
        if (!b2 || d2 < S * 1.25) break;
        out.push(b2);
      }
      return out;
    }
    _layoutKey(L) { return [L.W, L.H, Math.round(L.horizon), Math.round(L.pad.x), Math.round(L.pole.x), Math.round(L.mimiHome.x), Math.round(L.mimiHome.y)].join('|'); }

    /* ---------- title: Mimi waving with her bottle rocket; a rocket sways down under its parachute onto a golden mat ---------- */
    _titleScene(w, weather, o) {
      const L = this._L, P = MA(), g = this.g, t = this.time;
      const key = this._layoutKey(L) + JSON.stringify(this.titleKeep || []);
      if (!this._title || this._title.key !== key) {
        const spots = this._propMats(L, this.titleKeep, 3);
        this._title = { key, mats: spots.map((s, i) => ({ x: s.x, y: s.y, ds: s.ds, seed: 3 + i * 5, thing: TITLE_THINGS[i], ph: i * 1.7 })) };
      }
      const T = this._title;
      if (!P) return;
      P.drawPole(g, L.pole.x, L.pole.y0, L.pole.y1, { t });
      const flags = [{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }];
      flags.forEach((th, j) => { const s = L.slots && L.slots[j]; if (!s) return; g.save(); g.translate(s.x, s.y); P.drawPennant(g, th, L.pennantW || 56, { flutter: 0.5 + 0.2 * Math.sin(t * 1.7 + j), t: t + j }); g.restore(); });
      // the demo flight lands on the first mat (period 9 s: 4.2 s under the canopy, 2 s landed, fade)
      const gold = T.mats[0], per = 9, u = (t % per);
      const sorted = T.mats.slice().sort((p, q) => p.y - q.y);
      for (const m of sorted) {
        const bob = 2 * Math.sin(t * 2.6 + m.ph), landed = m === gold && u > 4.2 && u < 7;
        g.save(); g.translate(m.x, m.y);
        P.drawMat(g, L.S * m.ds, { seed: m.seed, unfold: 1, gold: m === gold ? clamp((u - 4.2) / 0.4, 0, 1) * (u < 7.4 ? 1 : clamp(1 - (u - 7.4) / 0.6, 0, 1)) : 0,
          squish: landed ? 0.35 * Math.exp(-(u - 4.2) * 5) * Math.cos((u - 4.2) * 14) : 0, t });
        g.translate(0, -bob); g.rotate(0.04 * Math.sin(t * 1.3 + m.ph));
        P.drawThing(g, m.thing, L.itemH * m.ds, {});
        g.restore();
      }
      this._padPump(L, 0.12 * Math.sin(t * 0.7), { press: 0, glow: 0, gauge: 0.5 + 0.5 * Math.sin(t * 0.8), count: 0 });
      // Mimi waving with her rocket under her wing (a gentle breathing squash)
      const n = { h: (L.mimiH || 180) * 1.06, x: L.mimiHome.x, y: L.mimiHome.y, face: 1 };
      const br = 0.012 * Math.sin(t * 2.4);
      this._mimi(n, 1, L, { frame: 'title', lean: Math.sin(t * 2) * 0.03, sx: 1 / Math.sqrt(1 + br), sy: 1 + br, ground: L.mimiHome.y });
      // the demo rocket under its parachute
      // start below every DOM title box the descent crosses (canopy ≈ 100 px above the nose, rocket ≈ 120 px)
      let y0 = gold ? Math.max(L.horizon - 230, (this._env ? this._env.clouds.y0 : 40) + 120) : 0;
      if (gold) for (const k of this.titleKeep || []) if (gold.x + 200 > k.x && gold.x - 200 < k.x + k.w) y0 = Math.max(y0, k.y + k.h + 240);
      if (gold && u < 7.6 && y0 < gold.y - 80) {   // (no room above this mat: no demo flight)
        const s = L.rocketS || 0.53, fall = clamp(u / 4.2, 0, 1), e = 1 - Math.pow(1 - fall, 1.6);
        const sw = u < 4.2 ? 0.32 * Math.sin(u * 2.6) * (1 - fall) : 0;
        const x = gold.x + (1 - e) * 140 * Math.sin(u * 0.9 + 0.5), y = lerp(y0, gold.y + 2, e);
        const al = u > 7 ? clamp(1 - (u - 7) / 0.6, 0, 1) : clamp(u / 0.4, 0, 1);
        g.save(); g.globalAlpha = al;
        const nose = RP().nose, noz = RP().nozzle, L0 = (noz[1] - nose[1]) * s;
        const nx = x + Math.sin(sw) * L0, ny = y - Math.cos(sw) * L0;
        const open = u < 4.2 ? 1.05 : lerp(1, 0.35, clamp((u - 4.2) / 0.5, 0, 1));
        const crot = u < 4.2 ? sw * 0.4 : lerp(0, 1.1, clamp((u - 4.2) / 0.5, 0, 1));
        this._chute(nx, ny, crot, s * open, 1);
        this._rocket(x, y, sw, s, 1, 1, 0.25, 0);
        g.restore();
      }
    }

    /* ---------- session done: Mimi dances under a garland of the pennants won, the rocket shoots fountains ---------- */
    _doneScene(w, weather, o) {
      const L = this._L, P = MA(), g = this.g, t = this.time, dt = this._dt || 0;
      const dk = this.donePanel ? [this.donePanel] : [];
      const key = this._layoutKey(L) + JSON.stringify(dk) + this.gallery.length;
      if (!this._done || this._done.key !== key) {
        const spots = this._propMats(L, dk, 3);
        this._done = { key, mats: spots.map((s, i) => ({ x: s.x, y: s.y, ds: s.ds, seed: 4 + i * 3, ph: i * 1.3 })), popT: 0.8, fT: 0.4, F: null, drops: [] };
      }
      const D = this._done;
      if (!P) return;
      // golden mats glowing
      for (const m of D.mats.slice().sort((p, q) => p.y - q.y)) {
        g.save(); g.translate(m.x, m.y);
        P.drawMat(g, L.S * m.ds, { seed: m.seed, unfold: 1, gold: 1, glow: 0.4 + 0.3 * Math.sin(t * 2.4 + m.ph), t });
        g.restore();
      }
      D.popT -= dt;
      if (D.popT <= 0 && D.mats.length) { D.popT = 1.4 + Math.random(); const m = D.mats[(Math.random() * D.mats.length) | 0]; this.burst('confetti', m.x, m.y - 30, { n: 14, life: 1.8, at: true }); }
      // the pole + a garland of every pennant won (up to 12), strung from the pole top across the meadow
      P.drawPole(g, L.pole.x, L.pole.y0, L.pole.y1, { t });
      const things = this.gallery.length ? this.gallery : [{ kind: 'obj', obj: 'mug', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'obj', obj: 'ball', color: 'blue' }];
      const ins = L.ins || { left: 0, right: 0, top: 0 };
      const right = L.pole.x < L.W / 2;
      const gy0 = Math.max(L.pole.y1 + 14, dk.length ? dk[0].y + dk[0].h + 40 : 0);
      const ax = L.pole.x + 4, ay = L.portrait ? gy0 : Math.min(gy0, L.horizon - 40), bx = right ? L.W - ins.right - 24 : ins.left + 24, by = ay - 30;
      const sag = 70, N = things.length;
      const pt = u => ({ x: lerp(ax, bx, u), y: lerp(ay, by, u) + sag * 4 * u * (1 - u) });
      g.strokeStyle = '#9C8763'; g.lineWidth = 3; g.beginPath();
      for (let i = 0; i <= 24; i++) { const p = pt(i / 24); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.stroke();
      const pw = clamp(Math.abs(bx - ax) / (N + 1) * 0.9, 36, 54);
      for (let i = 0; i < N; i++) {
        const u = (i + 0.7) / (N + 0.6), p = pt(u);
        g.save(); g.translate(p.x + (right ? -pw * 0.31 : pw * 0.31), p.y); g.rotate(Math.PI / 2 + 0.08 * Math.sin(t * 2.2 + i));
        P.drawPennant(g, things[i], pw, { flutter: 0.6 + 0.3 * Math.sin(t * 1.8 + i), t: t + i * 0.7 });
        g.restore();
      }
      // the rocket on the pad shoots a fountain with a little rainbow every 2.6 s
      const s = L.rocketS || 0.53, R = RP(), noseY = L.pad.y - (R.nozzle[1] - R.nose[1]) * s;
      this._padPump(L, 0, { press: 0, glow: 0, gauge: 1, count: 3 });
      D.fT -= dt;
      if (D.fT <= 0) { D.fT = 2.6; D.F = { x: L.pad.x, y: noseY, h: 0, t: 0, a: 1, rainbow: 0 }; D.spawned = 0; }
      const F = D.F;
      if (F) {
        F.t += dt;
        const want = Math.min(36, Math.floor(36 * F.t / 0.6));
        for (; D.spawned < want; D.spawned++) { const v = Math.sqrt(2 * 900 * 240) * (0.82 + 0.22 * Math.random()); D.drops.push({ x: F.x + (Math.random() - 0.5) * 8, y: F.y, vx: (Math.random() - 0.5) * 110, vy: -v, r: 3 + 3 * Math.random(), t: 0, life: 2 * v / 900 }); }
        F.rainbow = clamp(F.t / 0.4, 0, 1) * clamp((1.5 - F.t) / 0.4, 0, 1); F.a = clamp((1.7 - F.t) / 0.4, 0, 1);
        let top = F.y; for (const d of D.drops) if (d.y < top) top = d.y;
        F.h = Math.max(F.h * (F.t > 0.6 ? 0.985 : 1), F.y - top);
        if (F.t > 2) D.F = null;
      }
      const sq = F && F.t < 0.15 ? 0.06 : 0;
      this._rocket(L.pad.x, L.pad.y, 0, s, 1 + sq, 1 - sq, 0.5, 0);
      for (let i = D.drops.length - 1; i >= 0; i--) {
        const d = D.drops[i]; d.t += dt; d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.t >= d.life) { D.drops.splice(i, 1); continue; }
        P.drawDrop(g, d.x, d.y, d.r, clamp((d.life - d.t) / 0.3, 0, 1));
      }
      if (F) this._fountain(F, 1);
      // Mimi dances
      const beat = Math.floor(t * 2.6) % 2, hop = Math.max(0, Math.sin(t * 2.6 * Math.PI));
      const x = L.mimiHome.x, y = L.mimiHome.y - hop * 16;
      const sy = 1 + 0.06 * hop - (1 - hop) * 0.03, sx = 1 / Math.sqrt(sy);
      this._mimi({ h: L.mimiH, x, y, face: 1 }, 1, L, { x, y, frame: beat ? 'dance' : 'cheer', lean: Math.sin(t * 2.6 * Math.PI / 2) * 0.06, sx, sy, ground: L.mimiHome.y });
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((DK.CONFIG && DK.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const M = rect(L.meadow), ins = L.ins || { left: 0, right: 0 };
      const bw = Math.min(600, W - ins.left - ins.right - 60, H > W ? W - 60 : M.w - 40), bh = 160;
      const cx = H > W ? W / 2 : clamp(M.x + M.w / 2, bw / 2 + 30, W - bw / 2 - 30);
      const cy = H > W ? Math.max((L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 60, (L.horizon + L.meadow.y1) / 2 - 40) : Math.max(L.play.y0 + bh / 2 + 30, H * 0.46);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      // a wooden camp sign: two posts, a khaki rim, a cream board
      g.fillStyle = '#8A6244';
      g.fillRect(-bw * 0.32 - 9, bh / 2 - 4, 18, 46); g.fillRect(bw * 0.32 - 9, bh / 2 - 4, 18, 46);
      g.fillStyle = 'rgba(70,52,30,.22)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 9, bw, bh, 34); g.fill();
      g.fillStyle = '#D9C59A'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#9C8763'; g.stroke();
      g.fillStyle = '#FFFBF0'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#EADFC4'; g.stroke();
      const I = DK.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, INK2, null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 54, INK, '#ffffff', bw - 60);
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
      const colOf = c => (c && DK.PALETTE && DK.PALETTE[c]) ? DK.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
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
      } else if (type === 'count') {   // a big numeral pops up over the counted pinecones / the counted pennant
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.6, text: String(opt.n || ''), size: opt.size || 84 });
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
          outlinedText(g, f.text, 0, 0, f.size || 84, '#FFFFFF', INK, 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = DK.Assets.tinted ? DK.Assets.tinted(name, color, size * this.rs) : DK.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    /** weather particles: 'back' = behind the meadow things, 'front' = over everything (rain streaks, leaves in the wind) */
    _particles(list, layer) {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
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
      const spr = DK.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const tr = this.g.getTransform ? this.g.getTransform() : null;
      const sc = tr ? Math.max(Math.hypot(tr.a, tr.b), Math.hypot(tr.c, tr.d)) : this.rs;   // the real device scale (rocket / chute are scaled)
      const spr = DK.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * sc * 1.05);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.mimiHit && w.mimiHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      g.strokeStyle = 'rgba(0,140,0,.5)'; g.beginPath(); g.moveTo(0, L.horizon); g.lineTo(L.W, L.horizon); g.stroke();
      for (const m of w.mats || []) {
        const h = w.matHit && w.matHit(m.id); if (!h) continue;
        g.strokeStyle = m.target ? 'rgba(0,160,0,.7)' : 'rgba(220,0,0,.6)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      for (const h of [w.pumpHit && w.pumpHit(), w.marmotHit && w.marmotHit(), w.goatHit && w.goatHit(), w.birdHit && w.birdHit()]) {
        if (h) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke(); }
      }
    }
  }
  /** A Talk-time picture (question or answer button) drawn into a small canvas: answers with MatArt.drawIcon; opt.mat — the
   *  shown thing stands on a picnic mat on a patch of meadow (the question card), like in the game. */
  Renderer.preview = function (canvas, thing, opt) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const P = MA();
    if (!thing || !P) return;
    try {
      g.save();
      if (opt && opt.mat) {
        const S = Math.min(cw * 0.62, ch * 0.9), ih = 0.62 * S * 1.04, top = ch * 0.5 + ih * 0.38;
        const gr = g.createRadialGradient(cw / 2, top + S * 0.05, S * 0.1, cw / 2, top + S * 0.05, S * 0.75);
        gr.addColorStop(0, 'rgba(150,196,130,0.7)'); gr.addColorStop(0.7, 'rgba(169,207,142,0.45)'); gr.addColorStop(1, 'rgba(169,207,142,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(cw / 2, top + S * 0.05, S * 0.75, S * 0.3, 0, 0, TAU); g.fill();
        g.translate(cw / 2, top);
        P.drawMat(g, S, { seed: 5, unfold: 1 });
        P.drawThing(g, thing, ih, {});
      } else { g.translate(cw / 2, ch / 2); P.drawIcon(g, thing, Math.min(ch, cw) * 0.94); }
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.drawEnv = drawEnv;
  Renderer.RECIPE = { MOODS, SKY, K, SUN, CLOUDS, RAINBOW, PARTICLES, TILES, ROWS };
  DK.Renderer = Renderer;
})(window.DK = window.DK || {});
