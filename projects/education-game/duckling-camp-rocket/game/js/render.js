/* DK.Renderer (Nim's River Hop) — draws the woodland brook and the river crossing on one canvas (DESIGN §7, MECHANICS §5).
 * Order: sky → sun → clouds → far → mid (season crossfade, the env RECIPE from tools/env_scenes.js) → river (DK.RiverArt:
 * water + flowing streaks) → ripples + leaves / petals floating on the water + the fish's shadow (under the stones) → banks +
 * decorations + far-bank tree (DK.RiverArt, cached per season as one bitmap) → flying back particles (petals, butterflies,
 * dragonflies, snow — see the deviation note in docs/reports/integration.md) → the waiting fruit → stones back-to-front by y
 * (stone → its thing; golden glow / hint glow / active ring are drawStone options) with Nim (+ the fruits on his spines)
 * inserted after the stone he stands on → frog + lily pad → fish (above the water) → things counted / showing their home above
 * Nim + home badges → the round's fruit while it sticks / glides onto his back → drops → snowflakes → hint hand → the wipe
 * curtain → front particles (incl. the wipe's seasonal sweep) → fx (sparkles, numerals, stars flying to the HUD) → banner.
 * Title: Nim waving with an apple on his spines on the near bank, the brook flowing past a few stepping stones, a fish leaps.
 * Session done: Nim dances with his fruits by golden stones that glow, confetti and fireflies.
 * Every moving world value is interpolated with its `_p` twin and world.alpha. Logical coordinates (short side 720) × render
 * scale rs = device pixels. */
(function (DK) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const INK = '#5A3A22', INK2 = '#8A5A3C';

  /* ---------- RECIPE tables: copied verbatim from tools/env_scenes.js + tools/art_env.js ---------- */
  const SKY = {
    spring: [[0, '#CFE6F5'], [1, '#F6F1E4']],
    summer: [[0, '#8CCBEA'], [1, '#E6F5F6']],
    autumn: [[0, '#F1C893'], [1, '#FBEBD3']],
    winter: [[0, '#B9C8E2'], [1, '#EEF2F8']],
  };
  const HAZE = { spring: '#EAEEE9', summer: '#D0EBF3', autumn: '#F9E2C3', winter: '#DEE5F1' };
  const BANK = {
    spring: { grass: '#9CC98A', light: '#B4D8A2', dark: '#82B272', tuft: '#74A565' },
    summer: { grass: '#86B86E', light: '#9FCA88', dark: '#6FA25A', tuft: '#62944F' },
    autumn: { grass: '#B9A764', light: '#CDBD7E', dark: '#A08E52', tuft: '#8F7E47' },
    winter: { grass: '#F1F4F8', light: '#FFFFFF', dark: '#C9D4E2', tuft: '#B7C4D4' },
  };
  const K = { far: 0.6, mid: 0.62 };
  const SUN = {
    landscape: { spring: { x: 0.36, y: 0.42, size: 92, a: 0.95 }, summer: { x: 0.5, y: 0.36, size: 104, a: 1 }, autumn: { x: 0.66, y: 0.5, size: 110, a: 0.95 }, winter: { x: 0.44, y: 0.46, size: 82, a: 0.8 } },
    portrait: { spring: { x: 0.34, y: 0.36, size: 96, a: 0.95 }, summer: { x: 0.5, y: 0.3, size: 108, a: 1 }, autumn: { x: 0.66, y: 0.42, size: 112, a: 0.95 }, winter: { x: 0.42, y: 0.4, size: 86, a: 0.8 } },
  };
  const CLOUDS = {
    spring: { n: 3, alpha: 0.9, tint: 'rgba(250,236,226,0.3)' },
    summer: { n: 3, alpha: 0.95, tint: null },
    autumn: { n: 2, alpha: 0.85, tint: 'rgba(250,214,180,0.4)' },
    winter: { n: 3, alpha: 0.9, tint: 'rgba(214,224,242,0.35)' },
  };
  const PARTICLES = {
    spring: { back: ['petal', 'blossom'], front: ['petal', 'butterfly'], n: 22 },
    summer: { back: ['mote', 'glint'], front: ['dragonfly', 'butterfly'], n: 16 },
    autumn: { back: ['leaf'], front: ['leaf'], n: 20 },
    winter: { back: ['snow'], front: ['snow', 'sparkle'], n: 40 },
  };
  const TILES = { far: [1200, 720], mid: [1200, 300], bush: [200, 140, 100, 136], reeds: [120, 160, 60, 156], rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], tree: [260, 360, 130, 354], dragonfly: [48, 32] };
  const RECIPE_TABLES = { SKY, CLOUDS };

  /* ---------- RECIPE functions: pasted verbatim from tools/env_scenes.js (pure) ---------- */
  /** Pure layout of the background for a W × H screen. ins = safe-area insets; layout = world.layout (play, far, bubble, hud). */
  function envLayout(W, H, ins, layout) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const lay = layout || {};
    const play = lay.play || { y0: portrait ? 244 : 162 };
    const bankTop = Math.round(portrait ? (lay.far ? lay.far.y : play.y0) - 6 : play.y0 - 40);
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;            // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.6 * kp, km = 0.62 * kp;
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * 0.5 - 600 * km), y: bankTop - 262 * km };
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.55 : 0.6) - 780 * kf), y: mid.y + 248 * km - 700 * kf };
    const sky = { y0: 0, y1: bankTop };
    const o = portrait ? 'portrait' : 'landscape', sun = {};
    const hud = lay.hud || { x: W - ins.right - 160, y: ins.top + 16, w: 144, h: 64 };
    const bub = lay.bubble || (portrait ? { x: 24, y: ins.top + 110, w: W - 48, h: 124 } : { x: ins.left + 24, y: ins.top + 18, w: Math.min(560, W - 224), h: 134 });
    const gx0 = portrait ? ins.left + 10 : bub.x + bub.w + 10, gx1 = hud.x - 10;
    const skyH = Math.max(40, (portrait ? bub.y : bankTop) - ins.top);
    for (const m of ['spring', 'summer', 'autumn', 'winter']) {
      const s = SUN[o][m];
      const x = gx1 - gx0 > s.size ? gx0 + s.size * 0.5 + s.x * (gx1 - gx0 - s.size) : ins.left + s.x * (W - ins.left - ins.right);
      sun[m] = { x, y: ins.top + s.y * skyH, size: s.size, a: s.a };
    }
    const clouds = { y0: ins.top + 24, y1: Math.max(ins.top + 40, (portrait ? bub.y : bankTop) - 50), s: portrait ? 0.46 : 0.4 };
    return { W, H, portrait, tall, kp, bankTop, far, mid, sky, sun, clouds };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
  /** Draw the background for season m. img(name) → a drawable for 'env/far_spring' etc. (Image or DK.Assets.exact canvas).
   *  opt = { part: 'all'|'back'|'front', clouds: [{kind:'a'|'b', x, y, s, a?}] (centres, from weather.clouds),
   *  cloudImg(kind, m) → tinted drawable (optional), alpha }. Pure canvas. */
  function drawEnv(g, L, m, img, opt) {
    opt = opt || {};
    const W = L.W, H = L.H, part = opt.part || 'all', R = RECIPE_TABLES;
    if (part === 'front') return;   // the banks are DK.RiverArt.drawBanks now
    g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
    const a0 = g.globalAlpha;
    const tile = (name, Ly) => { const im = img(name); if (!im) return; for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
    // 0 sky (the bottom stop continues below bankTop; the mid meadow + banks cover it)
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
    g.restore();
  }

  /* ---------- character art metrics (docs/reports/art_nim.md, DESIGN §4.1) ---------- */
  const NIM_FRAMES = { idle: 1, blink: 1, talk: 1, happy: 1, cheer: 1, think: 1, oops: 1, crouch: 1, jump: 1, roll: 1, wave: 1, giggle: 1, dance: 1, title: 1 };
  const FISH = { w: 140, h: 100, ax: 70, ay: 50 };
  const FROG = { w: 140, h: 120, ax: 70, ay: 112 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const SA = () => DK.StoneArt;
  const RA = () => DK.RiverArt;
  const NP = () => DK.NIM_POINTS || { feet: [150, 290], backSlots: [[143, 83, 0.17], [98, 87, -0.35], [61, 113, -0.87], [43, 147, -1.33]], rollC: [150, 200], rollR: 88 };
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, mist: 1, feather: 1 };
  // things on the title stones (answer colours, a friend)
  const TITLE_THINGS = [{ kind: 'obj', obj: 'flower', color: 'red' }, { kind: 'shape', shape: 'star', color: 'yellow' }, { kind: 'animal', animal: 'duck' },
    { kind: 'dots', n: 3 }, { kind: 'obj', obj: 'mushroom', color: 'blue' }];
  // the wipe curtain's colour per season: a soft haze of petals / sun motes / leaves / snow
  const WIPE_SPR = { spring: ['petal', 'blossom', 'petal', 'butterfly'], summer: ['glint', 'sparkle', 'butterfly', 'glint'], autumn: ['leaf', 'leaf', 'leaf', 'mote'], winter: ['snow', 'sparkle', 'snow', 'snow'] };
  const WIPE = { spring: ['#F7E3EA', '#FBEFF3', '#F2CFD9'], summer: ['#FFF3D2', '#FFFAE8', '#F4E3A8'], autumn: ['#F6D9B0', '#FBEAD2', '#E3A877'], winter: ['#F4F8FC', '#FFFFFF', '#DCE6F1'] };
  const byY = (p, q) => p._ry - q._ry;

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
  const layoutKey = L => {
    if (!L || !L.near) return '';
    const r = o => o ? [Math.round(o.x), Math.round(o.y), Math.round(o.w), Math.round(o.h)].join(':') : '';
    return [L.W, L.H, r(L.near), r(L.far), r(L.river), r(L.bubble), r(L.hud), Math.round(L.goal.x), Math.round(L.goal.y), Math.round(L.nimHome.x), Math.round(L.nimHome.y)].join('|');
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this._off = {}; this._banksC = new Map();
      this.gallery = [];                 // the fruits Nim picked up this session (the celebration)
      this._list = [];                   // reused: the stones to draw this frame, sorted by y
      this._late = [];                   // reused: things shown above Nim
      this._title = null; this._done = null; this._hopRef = null; this._hopFromY = 0;
      this.donePanel = null; this.titleKeep = null;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      DK.Assets.dropExact();
      this._envKey = ''; this._off = {}; this._banksC.clear();
      this._title = null; this._done = null;
    }
    /** pre-rasterize a season's tiles and banks (so the crossfade and the first round never stutter) */
    prewarm(layout, season) {
      if (layout) this._envFor(layout);
      if (!this._env) return;
      const m = SEASONS[clamp(season | 0, 0, 3)];
      for (const l of ['far', 'mid']) this._tile(l, m);
      if (layout) this._banks(layout, m);
    }
    /** build the bitmap caches of this round's stones + things + fruit before the first tap (stone_art tip) */
    prewarmRound(world) {
      const P = SA(); if (!P || !world || !world.stones || !world.layout) return;
      const c = this._scratch || (this._scratch = DK.Assets.makeCanvas(4, 4)), x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      const L = world.layout, snow = world.weather === 3 ? 1 : 0;
      try {
        for (const s of world.stones) {
          P.drawStone(x, L.S, { seed: s.seed, snow, gold: 0 }); P.drawStone(x, L.S, { seed: s.seed, snow, gold: 1 });
          P.drawThing(x, s.thing, L.itemH, {});
        }
        if (world.fruit) P.drawFruit(x, world.fruit.kind, world.fruit.size || 2 * L.fruitR, {});
      } catch (e) { /* cache only */ }
      this._banks(L, SEASONS[clamp(world.weather | 0, 0, 3)]);
    }
    /** the fruits picked up this session (the celebration shows them) */
    setGallery(list) { this.gallery = (list || []).slice(-12); this._done = null; }
    clearGallery() { this.gallery = []; this._done = null; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right), Math.round(ins.bottom), L && L.play ? Math.round(L.play.y0) : 0, L && L.far ? Math.round(L.far.y) : 0].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins, L);
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const Ly = this._env[layer];
      return DK.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    /** a cloud through its season's 'source-atop' tint, cached */
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
      return DK.Assets.sprite(name, 200 * this.rs);
    }
    /** the two banks + decorations + far-bank tree of season m for layout L, rasterized once into a screen-size bitmap */
    _banks(L, m) {
      const R = RA(); if (!R || !L || !L.near) return null;
      const key = layoutKey(L) + '#' + m + '@' + this.rs.toFixed(3);
      let c = this._banksC.get(key);
      if (c) return c;
      const A = DK.Assets;
      if (!A || A.total === 0 || A.loaded < A.total) return null;   // decorations not loaded yet: draw live, cache later
      c = A.makeCanvas(Math.round(this.W * this.rs), Math.round(this.H * this.rs));
      const x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      try { R.drawBanks(x, L, m, { dpr: this.rs }); } catch (e) { return null; }
      if (this._banksC.size >= 3) this._banksC.delete(this._banksC.keys().next().value);
      this._banksC.set(key, c);
      return c;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      const L = this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = SEASONS.includes(amb.env) ? amb.env : 'spring';
      this._from = SEASONS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      this._wind = weather.wind || 0;
      this._envFor(L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const clouds = this._clouds(weather.clouds || []);
      this._moods((m, al) => drawEnv(g, this._env, m, n => this._img4env(n), { part: 'back', clouds, cloudImg: (k, mm) => this._cloudImg(k, mm), alpha: al }));
      if (!L || !L.near) { this._particles(weather.particles, 'back'); this._particles(weather.particles, 'front'); return; }
      if (o.title) this._titleScene(world, weather, o);
      else if (o.done) this._doneScene(world, weather, o);
      else this._game(world, weather, o, a);
      if (!o.title && !o.done) this._wipe(world.wipe, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    /** draw fn(season, alpha) for the current season, crossfading from the previous one */
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
        out.push({ kind: c.type === 'cloud_b' ? 'b' : 'a', x: c.x, y, s: C.s * (c.s || 0.8) / 0.8, a: clamp(c.alpha, 0, 1) });
      }
      return out;
    }

    /** the brook: water, ripples + floating leaves (+ the fish's shadow), banks, flying back particles */
    _brook(L, weather, w, a) {
      const g = this.g, R = RA(), P = SA();
      if (R) this._moods((m, al) => { try { R.drawRiver(g, L, this.time, m, { quality: this.quality, wind: this._wind, alpha: al }); } catch (e) { /* skip */ } });
      if (P) {
        const rip = w && w.ripples;
        if (rip) for (let i = 0; i < rip.length; i++) { const r = rip[i]; if (r.a > 0.01) P.drawRipple(g, r.x, r.y, r.r, r.a, r.flat); }
        const wr = weather.ripples;
        if (wr) for (let i = 0; i < wr.length; i++) { const r = wr[i]; if (r.a > 0.01) P.drawRipple(g, r.x, r.y, r.r, r.a, r.flat); }
      }
      this._particles(weather.particles, 'water');
      if (w && w.fish && !w.fish.above && w.fish.state === 'under') this._fishShadow(w.fish, a);
      this._moods((m, al) => {
        const c = this._banks(L, m);
        if (c) { g.save(); g.globalAlpha = al; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(c, 0, 0); g.restore(); }
        else if (R) { try { R.drawBanks(g, L, m, { alpha: al, dpr: this.rs }); } catch (e) { /* skip */ } }
      });
      this._particles(weather.particles, 'back');
    }

    /* ---------- the round ---------- */
    _game(w, weather, o, a) {
      const L = this._L, P = SA(), g = this.g;
      this._k = w.cur ? w.cur.k : 99;
      this._brook(L, weather, w, a);
      if (!P) return;
      const snow = clamp(this._amb.frost != null ? this._amb.frost : (this._to === 'winter' ? this._mix : this._from === 'winter' ? 1 - this._mix : 0), 0, 1);
      // the round's fruit, waiting on the far bank (under the tree)
      const f = w.fruit;
      if (f && f.state === 'wait') this._fruit(f, a);
      // stones back-to-front by y, Nim after the stone he stands on
      const list = this._list, late = this._late; list.length = 0; late.length = 0;
      for (const s of w.stones || []) {
        if (s.state === 'hidden' || s.state === 'gone') continue;
        s._ry = ip(s, 'y', a); list.push(s);
        if (s._tState === 'count' || s._tState === 'badge' || s._tState === 'away') late.push(s);
      }
      list.sort(byY);
      const n = w.nim, H = w._hop;
      let nimKey = 1e9;
      if (n) {
        const ny = ip(n, 'y', a);
        nimKey = ny + 1;
        if (H) {
          if (this._hopRef !== H) { this._hopRef = H; this._hopFromY = n._py != null ? n._py : n.y; }
          if (H.phase === 'air' || H.phase === 'crouch') nimKey = Math.max(nimKey, this._hopFromY + 1, (H.ty0 || 0) + 1);
        } else this._hopRef = null;
      }
      let nimDone = !n;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!nimDone && s._ry > nimKey) { this._nim(n, a, L); nimDone = true; }
        this._stone(s, a, L, snow);
      }
      if (!nimDone) this._nim(n, a, L);
      this._frog(w.frog, a);
      if (w.fish && w.fish.above) this._fish(w.fish, a);
      for (let i = 0; i < late.length; i++) this._lateThing(late[i], a, L);
      if (f && (f.state === 'stick' || f.state === 'fly')) this._fruit(f, a);
      for (const d of w.drops || []) P.drawDrop(g, ip(d, 'x', a), ip(d, 'y', a), d.r, d.a == null ? 1 : d.a);
      for (const fl of w.snowflakes || []) {
        if (fl.state === 'wait' || !(fl.a > 0.01)) continue;
        g.save(); g.translate(ip(fl, 'x', a), ip(fl, 'y', a));
        P.drawSnowflake(g, fl.r * (1 + 0.3 * (fl.tw || 0)), ip(fl, 'rot', a) || 0, fl.a);
        g.restore();
      }
      const hh = w.hintHand;
      if (hh && hh.alpha > 0.01) P.drawHintHand(g, ip(hh, 'x', a), ip(hh, 'y', a), hh.press || 0, hh.alpha, clamp(L.S * 0.72, 84, 110));
    }
    _stone(s, a, L, snow) {
      const P = SA(), g = this.g;
      const x = ip(s, 'x', a), y = s._ry, tilt = ip(s, 'tilt', a) || 0, al = clamp(ip(s, 'alpha', a), 0, 1);
      if (!(al > 0.01)) return;
      g.save(); g.translate(x, y);
      P.drawStone(g, L.S, { seed: s.seed, tilt, dip: clamp(ip(s, 'sub', a) || 0, 0, 1), gold: clamp(ip(s, 'gold', a) || 0, 0, 1), glow: s.glow || 0,
        active: s.active || 0, alpha: al, snow, wet: clamp(0.3 + (s.sub || 0), 0, 1), t: this.time });
      const tA = clamp(ip(s, 'thingA', a), 0, 1);
      if (s._tState !== 'count' && s._tState !== 'badge' && s._tState !== 'away' && tA > 0.01 && s.thing) {
        g.rotate(tilt);
        g.translate(ip(s, 'thingDx', a) || 0, -(ip(s, 'thingHop', a) || 0));
        const wig = ip(s, 'wig', a) || 0; if (wig) g.rotate(wig);
        const ts = ip(s, 'thingS', a) || 1; if (ts !== 1) g.scale(ts, ts);
        P.drawThing(g, s.thing, L.itemH, { glow: s.glow || 0, alpha: al * tA, count: s.count == null ? -1 : s.count });
      }
      g.restore();
    }
    /** a thing rising above Nim (counted / showing its home) or twinkling away: drawn after Nim, untilted */
    _lateThing(s, a, L) {
      const P = SA(), g = this.g;
      const tA = clamp(ip(s, 'thingA', a), 0, 1), al = clamp(ip(s, 'alpha', a), 0, 1);
      if (s.thing && tA > 0.01) {
        g.save();
        g.translate(ip(s, 'x', a) + (ip(s, 'thingDx', a) || 0), s._ry - (ip(s, 'thingHop', a) || 0));
        const wig = ip(s, 'wig', a) || 0; if (wig) g.rotate(wig);
        const ts = ip(s, 'thingS', a) || 1; if (ts !== 1) g.scale(ts, ts);
        // a soft light disc behind a counted sign so the dots read against Nim's spines / the bank
        if (s._tState !== 'away') {
          const r = L.itemH * 0.62;
          g.globalAlpha = 0.55 * tA; g.fillStyle = '#FFFBEF';
          g.beginPath(); g.ellipse(0, -L.itemH * 0.5, r, r, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        P.drawThing(g, s.thing, L.itemH, { glow: s.glow || 0, alpha: al * tA, count: s.count == null ? -1 : s.count, shadow: false });
        g.restore();
      }
      const b = s.badge;
      if (b && b.a > 0.01) {
        g.save(); g.translate(b.x, b.y);
        P.drawHomeBadge(g, b.home, b.r, { a: b.a, pop: easeOutBack(clamp(b.a, 0, 1)) });
        g.restore();
      }
    }
    _fruit(f, a) {
      const P = SA(); if (!P) return;
      const g = this.g, s = Math.max(0, ip(f, 's', a) || 0);
      if (!(s > 0.02)) return;
      g.save(); g.translate(ip(f, 'x', a), ip(f, 'y', a));
      if (f.state === 'wait') {   // a soft shadow on the grass
        g.fillStyle = 'rgba(60,50,30,0.18)'; g.beginPath(); g.ellipse(0, f.size * 0.48, f.size * 0.42 * s, f.size * 0.12 * s, 0, 0, TAU); g.fill();
      }
      let size = f.size;
      if (f.state === 'fly') size = lerp(f.size, 1.6 * (this._L.fruitR || 26) * ((this._L.nimH || 190) / 300 / 0.633), clamp(f.t / ((DK.CONFIG && DK.CONFIG.fruitGlide) || 0.35), 0, 1));
      P.drawFruit(g, f.kind, size * s, { rot: ip(f, 'rot', a) || 0 });
      g.restore();
    }
    _nimFrame(n, forced) {
      let nm = forced || (NIM_FRAMES[n.frame] ? n.frame : 'idle');
      // speaking: the mouth flaps between talk and idle (only in the calm poses)
      if (!forced && (nm === 'idle' || nm === 'talk' || nm === 'blink')) {
        if (this._speaking) nm = Math.sin(this.time * 17) > -0.2 ? 'talk' : 'idle';
        else if (nm === 'talk') nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      }
      const key = 'characters/nim_' + nm;
      return DK.Assets.has(key) ? key : 'characters/nim_idle';
    }
    /** Nim at his feet (x, y), height n.h (art 300 × 300, feet (150, 290)), scale (dsx, dsy) + lean about the feet; the roll
     *  frame spins about the ball centre; the fruits sit on his spines at backSlots / rollSlots */
    _nim(n, a, L, opt) {
      if (!n) return;
      opt = opt || {};
      const g = this.g, k = (n.h || L.nimH || 190) / 300;
      const x = opt.x != null ? opt.x : ip(n, 'x', a), y = opt.y != null ? opt.y : ip(n, 'y', a), dx = x - n.x, dy = y - n.y;
      const key = this._nimFrame(n, opt.frame);
      const roll = key === 'characters/nim_roll';
      const B = NP();
      g.save();
      if (roll) {
        g.translate(n.ballX + dx, n.ballY + dy); g.rotate(ip(n, 'rollRot', a) || 0);
        this._img(key, -B.rollC[0] * k, -B.rollC[1] * k, 300 * k, 300 * k);
      } else {
        if (!opt.noShadow && n.state !== 'air' && n.state !== 'walk' && n.onRow != null && (n.onRow < 0 || n.onRow >= (this._k || 99))) {
          g.fillStyle = 'rgba(50,40,24,0.2)'; g.beginPath(); g.ellipse(x - 6 * k, y + 2, 100 * k, 18 * k, 0, 0, TAU); g.fill();
        }
        g.translate(x, y); g.rotate((opt.lean != null ? opt.lean : ip(n, 'lean', a)) || 0);
        g.scale(opt.sx || n.dsx || 1, opt.sy || n.dsy || 1);
        this._img(key, -B.feet[0] * k, -B.feet[1] * k, 300 * k, 300 * k);
      }
      g.restore();
      // the fruits on his spines (max 4 shown)
      const P = SA(), fr = opt.fruits || n.fruits, slots = roll ? n.rollSlots : (opt.slots || n.backSlots);
      if (P && fr && fr.length && slots) {
        const sz = 1.6 * (L.fruitR || 26) * (k / 0.633), m = Math.min(4, fr.length, slots.length);
        for (let i = 0; i < m; i++) {
          const sl = slots[i];
          g.save(); g.translate(sl.x + (opt.slots ? 0 : dx), sl.y + (opt.slots ? 0 : dy));
          P.drawFruit(g, fr[fr.length - m + i], sz, { rot: sl.rot || 0 });
          g.restore();
        }
      }
    }
    _fish(f, a) {
      const g = this.g, x = ip(f, 'x', a), y = ip(f, 'y', a), s = f.s || 0.8;
      const flipping = f.flip > 0 && f.flip < 1;
      g.save(); g.translate(x, y);
      if ((f.face || 1) < 0) g.scale(-1, 1);
      g.rotate((ip(f, 'rot', a) || 0) + (flipping ? f.flip * TAU : 0));
      this._img(flipping ? 'characters/fish_flip' : 'characters/fish', -FISH.ax * s, -FISH.ay * s, FISH.w * s, FISH.h * s);
      g.restore();
    }
    _fishShadow(f, a) {
      const g = this.g, x = ip(f, 'x', a), y = ip(f, 'y', a), s = f.s || 0.8;
      g.save(); g.globalAlpha = 0.22 + 0.06 * Math.sin(this.time * 5);
      g.fillStyle = '#1E3A40'; g.beginPath(); g.ellipse(x, y, 44 * s, 14 * s, 0, 0, TAU); g.fill();
      g.restore();
    }
    _frog(fr, a) {
      if (!fr || !(fr.a > 0.01)) return;
      const P = SA(), g = this.g, s = fr.s || 0.8;
      g.save(); g.globalAlpha = clamp(fr.a, 0, 1);
      g.translate(fr.padX, fr.padY);
      if (P) P.drawLilyPad(g, fr.padR || 46, fr.padRot || 0);
      g.restore();
      g.save(); g.globalAlpha = clamp(fr.a, 0, 1);
      g.translate(ip(fr, 'x', a), ip(fr, 'y', a));
      const c = fr.croak || 0;
      if (c > 0) g.scale(1 + 0.05 * Math.sin(c * Math.PI), 1 - 0.04 * Math.sin(c * Math.PI));
      this._img(c > 0 ? 'characters/frog_croak' : 'characters/frog', -FROG.ax * s, -FROG.ay * s, FROG.w * s, FROG.h * s);
      g.restore();
    }

    /* ---------- the wipe: a curtain of seasonal haze sweeps across along the hop axis (covering the screen at t = 0.5) ---------- */
    _wipe(wp, a) {
      if (!wp) return;
      const g = this.g, W = this.W, H = this.H;
      const t = clamp(ip(wp, 't', a), 0, 1);
      if (t <= 0 || t >= 1) return;
      const dir = wp.dir || { x: 1, y: 0 }, horiz = Math.abs(dir.x) >= Math.abs(dir.y), sgn = horiz ? Math.sign(dir.x || 1) : Math.sign(dir.y || 1);
      const Lx = horiz ? W : H, f = Lx * 0.28;                 // the solid part is Lx wide, f = the soft edge on each side
      const c = -(Lx / 2 + 2 * f) + t * (2 * Lx + 4 * f);      // centre along the axis: covers [0, Lx] exactly at t = 0.5
      const half = Lx / 2 + f * 0.15;
      const col = WIPE[SEASONS[clamp(wp.season | 0, 0, 3)]] || WIPE.spring;
      const pos = u => sgn > 0 ? u : Lx - u;                   // the axis runs the other way when dir is negative
      const p0 = pos(c - half - f), p1 = pos(c - half), p2 = pos(c + half), p3 = pos(c + half + f);
      const gr = horiz ? g.createLinearGradient(p0, 0, p3, 0) : g.createLinearGradient(0, p0, 0, p3);
      const span = p3 - p0, st = v => clamp((v - p0) / span, 0, 1);
      gr.addColorStop(0, this._rgba(col[0], 0)); gr.addColorStop(st(p1), this._rgba(col[0], 0.96));
      gr.addColorStop(clamp((st(p1) + st(p2)) / 2, 0, 1), this._rgba(col[1], 0.99)); gr.addColorStop(st(p2), this._rgba(col[0], 0.96)); gr.addColorStop(1, this._rgba(col[0], 0));
      g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // a swirl of seasonal things riding the curtain (petals / sun motes + glints / leaves / snowflakes) — visual QA P3-6
      const spr = WIPE_SPR[SEASONS[clamp(wp.season | 0, 0, 3)]] || WIPE_SPR.spring, acr = horiz ? H : W;
      for (let i = 0; i < 46; i++) {
        const h1 = ((i * 0.6180339) % 1), h2 = ((i * 0.7548776 + 0.31) % 1), h3 = ((i * 0.5698403 + 0.17) % 1);
        const u = c + (h1 - 0.5) * (2 * half + 1.2 * f) + Math.sin(t * 7 + i) * 18, v = h2 * acr + Math.cos(t * 5 + i * 1.3) * 22;
        const pu = pos(u), size = 22 + 26 * h3;
        this._sprite(spr[i % spr.length], horiz ? pu : v, horiz ? v : pu, size, t * (3 + 4 * h3) * (i % 2 ? 1 : -1) + i, 0.9);
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

    /* ---------- title: Nim waving with an apple on his spines on the near bank, the brook flowing past stepping stones ---------- */
    /** stepping stones for the title / celebration: one per row, placed across the river where they stay clear of the DOM
     *  title (logo, ▶, star line: this.titleKeep, logical px) — a row with no clear spot gets no stone */
    _titleSetup(L, keep) {
      const n = Math.max(2, Math.min(3, (L.rowPos || []).length || 3)), out = [];
      const tries = [0.78, 0.22, 0.62, 0.38, 0.9, 0.1, 0.5];
      const hitK = (x, y) => (keep || []).some(k => x + 0.6 * L.S > k.x && x - 0.6 * L.S < k.x + k.w && y + 0.35 * L.S > k.y && y - L.itemH - 10 < k.y + k.h);
      for (let j = 0; j < n; j++) {
        const along = L.rowPos && L.rowPos.length ? L.rowPos[Math.round(j * (L.rowPos.length - 1) / Math.max(1, n - 1))] : null;
        for (let q = 0; q < tries.length; q++) {
          const u = tries[(q + j * 2) % tries.length];
          let x, y;
          if (!L.portrait) { x = along != null ? along : lerp(L.river.x, L.river.x + L.river.w, (j + 0.5) / n); y = lerp(L.a0 || L.play.y0 + 100, L.a1 || L.H - 80, u); }
          else { y = along != null ? along : lerp(L.river.y + L.river.h, L.river.y, (j + 0.5) / n); x = lerp(L.ins.left + 0.55 * L.S, L.W - L.ins.right - 0.55 * L.S, u); }
          if (hitK(x, y)) continue;
          out.push({ x, y, seed: 3 + j * 5, thing: TITLE_THINGS[j], ph: j * 1.7, gold: j === 0 ? 1 : 0 });
          break;
        }
      }
      return { key: layoutKey(L) + JSON.stringify(keep || []), stones: out, fishT: 2.5, fish: null };
    }
    _titleScene(w, weather, o) {
      const L = this._L, P = SA(), g = this.g, dt = this._dt || 0;
      if (!this._title || this._title.key !== layoutKey(L) + JSON.stringify(this.titleKeep || [])) this._title = this._titleSetup(L, this.titleKeep);
      const T = this._title;
      // a fish leaps now and then between the stones
      T.fishT -= dt;
      if (!T.fish && T.fishT <= 0 && L.river) {
        const R = L.river, port = L.portrait;
        const x0 = port ? lerp(R.x + 80, R.x + R.w - 300, Math.random()) : R.x + R.w * (0.3 + 0.4 * Math.random());
        const y0 = port ? R.y + R.h * (0.3 + 0.4 * Math.random()) : lerp(L.a0 || R.y + 100, L.a1 || R.y + R.h - 60, Math.random());
        T.fish = { x0, y0, t: 0, face: Math.random() < 0.5 ? 1 : -1 };
      }
      this._brook(L, weather, null, 1);
      // the apple waits under the far-bank tree
      if (P && L.goal) { g.save(); g.translate(L.goal.x, L.goal.y - (L.fruitR || 26) * 0.95 + Math.sin(this.time * 2) * 2); P.drawFruit(g, 'apple', 2 * (L.fruitR || 26), { rot: 0.05 * Math.sin(this.time * 2.2) }); g.restore(); }
      if (T.fish) {
        const F = T.fish; F.t += dt;
        const u = F.t / 1.2;
        if (u >= 1) { T.fish = null; T.fishT = 4 + Math.random() * 4; }
        else {
          const x = F.x0 + F.face * 150 * u, y = F.y0 - 120 * 4 * u * (1 - u);
          g.save(); g.translate(x, y); if (F.face < 0) g.scale(-1, 1); g.rotate(Math.atan2(-120 * 4 * (1 - 2 * u), 150) * 0.9);
          this._img('characters/fish', -FISH.ax * 0.8, -FISH.ay * 0.8, FISH.w * 0.8, FISH.h * 0.8); g.restore();
          if (P && (u < 0.12 || u > 0.88)) P.drawRipple(g, u < 0.5 ? F.x0 : F.x0 + F.face * 150, F.y0 + 6, 30 + 40 * (u < 0.5 ? u : 1 - u), 0.7, 0.38);
        }
      }
      if (P) for (const s of T.stones) {
        const bob = 2 * Math.sin(this.time * 2.6 + s.ph);
        g.save(); g.translate(s.x, s.y + bob);
        P.drawStone(g, L.S, { seed: s.seed, gold: s.gold, snow: this._to === 'winter' ? 1 : 0, wet: 0.4, glow: s.gold ? 0.4 + 0.3 * Math.sin(this.time * 2) : 0 });
        if (!s.gold) { g.rotate(0.04 * Math.sin(this.time * 1.3 + s.ph)); P.drawThing(g, s.thing, L.itemH, {}); }
        g.restore();
      }
      // Nim waving on the near bank (an apple on his spines is part of the title art)
      const n = { h: L.nimH, x: L.nimHome.x, y: L.nimHome.y, fruits: [], onRow: -1, state: 'stand' };
      this._k = 99;
      this._nim(n, 1, L, { frame: 'title', lean: Math.sin(this.time * 2) * 0.03, sx: 1 / Math.sqrt(1 + 0.012 * Math.sin(this.time * 2.4)), sy: 1 + 0.012 * Math.sin(this.time * 2.4) });
    }

    /* ---------- session done: Nim dances with his fruits by golden stones that glow ---------- */
    _doneScene(w, weather, o) {
      const L = this._L, P = SA(), g = this.g, t = this.time;
      const dk = this.donePanel ? [this.donePanel] : [];
      if (!this._done || this._done.key !== layoutKey(L) + JSON.stringify(dk)) {
        const T = this._titleSetup(L, dk);
        this._done = { key: T.key, stones: T.stones, popT: 0.6 };
      }
      const D = this._done;
      this._brook(L, weather, w, 1);
      const fruits = this.gallery.length ? this.gallery : (w.nim && w.nim.fruits) || [];
      const onBack = fruits.slice(-4), rest = fruits.slice(0, Math.max(0, fruits.length - 4));
      if (P) D.stones.forEach((s, i) => {
        const bob = 2 * Math.sin(t * 2.6 + s.ph);
        g.save(); g.translate(s.x, s.y + bob);
        P.drawStone(g, L.S, { seed: s.seed, gold: 1, glow: 0.5 + 0.4 * Math.sin(t * 2.4 + i), snow: this._to === 'winter' ? 1 : 0, wet: 0.4 });
        const fk = rest[i] || (i === 1 && !rest.length ? null : null);
        if (fk) P.drawFruit(g, fk, 2 * (L.fruitR || 26) * 1.15, { rot: 0.1 * Math.sin(t * 2 + i) });
        g.restore();
      });
      // a burst of confetti from a golden stone now and then
      D.popT -= this._dt || 0;
      if (D.popT <= 0 && D.stones.length) { D.popT = 1.4 + Math.random(); const s = D.stones[(Math.random() * D.stones.length) | 0]; this.burst('confetti', s.x, s.y - 30, { n: 14, life: 1.8, at: true }); }
      // Nim dances on the near bank with the last four fruits on his spines
      const beat = Math.floor(t * 2.6) % 2, hop = Math.max(0, Math.sin(t * 2.6 * Math.PI));
      const B = NP(), k = L.nimH / 300, x = L.nimHome.x, y = L.nimHome.y - hop * 16;
      const sy = 1 + 0.06 * hop - (1 - hop) * 0.03, sx = 1 / Math.sqrt(sy);
      const slots = B.backSlots.map(q => ({ x: x + (q[0] - B.feet[0]) * k * sx, y: y + (q[1] - B.feet[1]) * k * sy, rot: q[2] || 0 }));
      this._k = 99;
      const g2 = this.g; g2.fillStyle = 'rgba(50,40,24,0.2)'; g2.beginPath(); g2.ellipse(x - 6 * k, L.nimHome.y + 2, 100 * k * (1 - 0.25 * hop), 18 * k, 0, 0, TAU); g2.fill();
      this._nim({ h: L.nimH, x, y, onRow: 0, state: 'air' }, 1, L, { x, y, frame: beat ? 'dance' : 'cheer', lean: Math.sin(t * 2.6 * Math.PI / 2) * 0.06, sx, sy, fruits: onBack, slots, noShadow: true });
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((DK.CONFIG && DK.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = H > W ? W / 2 : clamp(W / 2, bw / 2 + 30, W - bw / 2 - 30);
      const cy = H > W ? Math.max((L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 50, H * 0.34) : H * 0.44;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      // a wooden sign: mustard rim, cream board, two little posts
      g.fillStyle = '#8A5A3C';
      g.fillRect(-bw * 0.32 - 9, bh / 2 - 4, 18, 46); g.fillRect(bw * 0.32 - 9, bh / 2 - 4, 18, 46);
      g.fillStyle = 'rgba(70,44,24,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 9, bw, bh, 34); g.fill();
      g.fillStyle = '#E3B65A'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#A9812E'; g.stroke();
      g.fillStyle = '#FFFBF0'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#EAD7AE'; g.stroke();
      const I = DK.I18N, lang = this.lang;
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
      } else if (type === 'count') {   // a big numeral pops up over the counted dots / the counted stone
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
      const spr = DK.Assets.tinted ? DK.Assets.tinted(name, color, size * this.rs) : DK.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    /** weather particles; layer 'water' = the leaves / petals floating on the brook (drawn flat, under the stones),
     *  'back' = the flying ones behind the stones, 'front' = over everything */
    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const pl = p.onWater ? 'water' : (p.layer || 'back');
        if (pl !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        const tint = p.color && TINTABLE[nm] ? p.color : null;
        if (layer === 'water') {
          g.save(); g.translate(p.x, p.y); g.scale(1, 0.55);
          if (tint) this._tinted(nm, tint, 0, 0, p.size, p.rot || 0, p.alpha); else this._sprite(nm, 0, 0, p.size, p.rot || 0, p.alpha);
          g.restore();
        } else if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
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
      const spr = DK.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.nimHit && w.nimHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      const R = L.river; if (R) { g.strokeStyle = 'rgba(0,140,0,.5)'; g.strokeRect(R.x, R.y, R.w, R.h); }
      for (const s of w.stones || []) {
        const h = w.stoneHit && w.stoneHit(s.id); if (!h) continue;
        g.strokeStyle = s.target ? 'rgba(0,160,0,.7)' : 'rgba(220,0,0,.6)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      for (const h of [w.fishHit && w.fishHit(), w.frogHit && w.frogHit(), w.snowHit && w.snowHit()]) {
        if (h) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke(); }
      }
    }
  }
  /** A Talk-time picture (question or answer button) drawn into a small canvas: answers with StoneArt.drawIcon; opt.stone —
   *  the shown thing stands on a river stone on a patch of water (the question card), like in the game. */
  Renderer.preview = function (canvas, thing, opt) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const P = SA();
    if (!thing || !P) return;
    try {
      g.save();
      if (opt && opt.stone) {
        const S = Math.min(cw * 0.62, ch * 0.8), ih = 0.62 * S * 1.08, top = ch * 0.42 + ih * 0.35;   // the whole stone fits (QA P3-4)
        // a soft oval of brook water under the stone
        const gr = g.createRadialGradient(cw / 2, top + S * 0.12, S * 0.1, cw / 2, top + S * 0.12, S * 0.72);
        gr.addColorStop(0, 'rgba(78,142,149,0.55)'); gr.addColorStop(0.7, 'rgba(127,184,180,0.35)'); gr.addColorStop(1, 'rgba(127,184,180,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(cw / 2, top + S * 0.12, S * 0.72, S * 0.26, 0, 0, TAU); g.fill();
        g.translate(cw / 2, top);
        P.drawStone(g, S, { seed: 5, wet: 0.4 });
        P.drawThing(g, thing, ih, {});
      } else { g.translate(cw / 2, ch / 2); P.drawIcon(g, thing, Math.min(ch, cw) * 0.94); }
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.drawEnv = drawEnv;
  Renderer.RECIPE = { SEASONS, SKY, HAZE, BANK, K, SUN, CLOUDS, PARTICLES, TILES };
  DK.Renderer = Renderer;
})(window.DK = window.DK || {});
