/* Spike's Dino Jam — DJ.Weather (biome ambient particles, headless, deterministic)
 *
 *   const wx = new DJ.Weather({ width:960, height:540, seed });
 *   wx.setBiome(b, { instant:false });        // alias wx.setSeason(); smooth hand-over (~2 s)
 *   wx.resize(w, h);                          // any canvas size (portrait up to 720×1600)
 *   wx.update(dt, { spike: w.spike, boss: w.boss });   // env optional
 *   wx.burst(sprite, x, y, n)                 // one-shot puff, e.g. 'feather' on pillowpuff, 'sparkle' on note
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, biome, depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, fog: 0..1 }
 *
 * `size` = drawn width in px. 'back' = on the ground, under the trail/Spike; 'front' = over everything
 * (sparse / translucent). Draw with translate(x,y) → rotate(rot) → scale(flipX, 1). Sprite 'dot' = a
 * filled circle of diameter `size` in `color`; others = assets/default/particles/<sprite>.svg.
 * update() runs fixed 1/60 s sub-steps with an accumulator, so the result is identical for any dt
 * partition (same seed + same setBiome/resize times + same env).
 *
 * Motion models (docs/MECHANICS.md §6):
 *  - flutter : butterflies: wander targets + bob; wings flap via |flipX| 0.25..1 and size wobble
 *  - leaf    : petals / leaves: pendulum drift x = x0 + A·sin φ, tilt follows the swing, tumble flipX
 *  - drift   : pollen / sparkle motes: velocity eases to random targets, wraps around
 *  - mist    : big soft blobs drifting slowly, fade in/out over a long life (sin)
 *  - firefly : slow wander, glow pulse (alpha)
 *  - gust    : dust wisps blown sideways by a gusting wind (strength = smooth noise of time)
 *  - fall    : snow in depth layers: terminal fall ∝ depth, pendulum sway, parallax wind
 *  - fx      : 'feather' (falls slowly, rocking) and 'sparkle' (pops out, fades) — from env or burst()
 */
(function (DJ) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 158;            // hard bound (DESIGN §5.2: < 160)
  var FX_MAX = 36;                    // feathers + sparkles
  var REF_AREA = 960 * 540;

  // count = steady-state particles per emitter on a 960×540 canvas (scaled by area, ×0.6..×1.6)
  var BIOMES = [
    { // 0 Fern Meadow (morning)
      wind: 10,
      ambient: { tint: [255, 244, 205, 0.04], fog: 0 },
      emitters: [
        { kind: 'flutter', layer: 'back', count: 4, size: [20, 26], alpha: [0.9, 1], sprite: 'butterfly' },
        { kind: 'flutter', layer: 'front', count: 2, size: [26, 32], alpha: [0.85, 1], sprite: 'butterfly', depth: 1 },
        { kind: 'leaf', layer: 'back', count: 6, size: [12, 16], alpha: [0.75, 0.95], sprite: 'petal', depth: 0.5, fall: [14, 22] },
        { kind: 'leaf', layer: 'front', count: 2, size: [18, 22], alpha: [0.7, 0.85], sprite: 'petal', depth: 1, fall: [24, 32] },
        { kind: 'leaf', layer: 'back', count: 3, size: [14, 18], alpha: [0.75, 0.9], sprite: 'leaf', depth: 0.6, fall: [16, 24] },
        { kind: 'drift', layer: 'back', count: 10, size: [2, 4], alpha: [0.4, 0.75], sprite: 'dot', color: 'rgba(255,250,190,1)', depth: 0.3 }
      ]
    },
    { // 1 Misty Swamp
      wind: 6,
      ambient: { tint: [120, 200, 190, 0.06], fog: 0.08 },
      emitters: [
        { kind: 'mist', layer: 'back', count: 6, size: [110, 180], alpha: [0.14, 0.24], sprite: 'mist', depth: 0.4 },
        { kind: 'mist', layer: 'front', count: 2, size: [150, 220], alpha: [0.08, 0.13], sprite: 'mist', depth: 1 },
        { kind: 'firefly', layer: 'back', count: 10, size: [10, 14], alpha: [0.7, 1], sprite: 'firefly', depth: 0.5 },
        { kind: 'firefly', layer: 'front', count: 4, size: [13, 17], alpha: [0.55, 0.85], sprite: 'firefly', depth: 1 },
        { kind: 'drift', layer: 'back', count: 6, size: [2, 3], alpha: [0.35, 0.6], sprite: 'dot', color: 'rgba(210,255,230,1)', depth: 0.3 }
      ]
    },
    { // 2 Red Rock Canyon — dust wisps in gusts
      wind: 40,
      ambient: { tint: [255, 170, 110, 0.06], fog: 0.03 },
      emitters: [
        { kind: 'gust', layer: 'back', count: 12, size: [26, 40], alpha: [0.35, 0.6], sprite: 'dust', depth: 0.55 },
        { kind: 'gust', layer: 'front', count: 3, size: [40, 56], alpha: [0.25, 0.4], sprite: 'dust', depth: 1 },
        { kind: 'gust', layer: 'back', count: 14, size: [2, 4], alpha: [0.4, 0.7], sprite: 'dot', color: 'rgba(235,190,140,1)', depth: 0.3 }
      ]
    },
    { // 3 Snowy Peaks — falling snow in 3 depth layers
      wind: 14,
      ambient: { tint: [200, 210, 255, 0.05], fog: 0.04 },
      emitters: [
        { kind: 'fall', layer: 'back', count: 26, size: [2, 4], alpha: [0.5, 0.75], sprite: 'dot', color: 'rgba(255,255,255,1)', depth: 0.25, fall: [16, 26] },
        { kind: 'fall', layer: 'back', count: 18, size: [9, 13], alpha: [0.75, 0.95], sprite: 'snow', depth: 0.55, fall: [30, 44] },
        { kind: 'fall', layer: 'front', count: 7, size: [15, 20], alpha: [0.6, 0.8], sprite: 'snow', depth: 1, fall: [52, 70] }
      ]
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new DJ.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.biome = 0;
    this.season = 0;
    this.time = 0;
    this.wind = 0;
    this.gust = 0;
    this.ambient = { tint: null, fog: 0 };
    this._featherAcc = 0; this._sparkAcc = 0;
    this._scale = this._areaScale();
    this.setBiome(opts.biome || opts.season || 0, { instant: true });
  }
  Weather.BIOMES = BIOMES;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['leaf', 'butterfly', 'firefly', 'mist', 'dust', 'snow', 'sparkle', 'feather', 'petal', 'dot'];

  Weather.prototype._areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.6); };
  Weather.prototype._count = function (em) { return Math.round(em.count * this._scale); };

  Weather.prototype.setBiome = function (i, opts) {
    i = (((i | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k, n;
    this.biome = this.season = i;
    if (instant) {
      for (k = this.particles.length - 1; k >= 0; k--) if (this.particles[k].biome >= 0) this.particles.splice(k, 1);
      this.ramp = [0, 0, 0, 0]; this.ramp[i] = 1;
      this.wind = BIOMES[i].wind;
      var ems = BIOMES[i].emitters;
      for (var e = 0; e < ems.length; e++) for (k = 0, n = this._count(ems[e]); k < n; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.biome < 0) continue;
        if (p.biome !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1); }
        else if (p.biome === i) p.leaving = false;
      }
    }
    this._updateAmbient();
  };
  Weather.prototype.setSeason = Weather.prototype.setBiome;

  /** resize(w, h): positions are scaled proportionally; counts follow the area on the next steps. */
  Weather.prototype.resize = function (w, h) {
    w = +w || this.width; h = +h || this.height;
    if (w === this.width && h === this.height) return;
    var sx = w / this.width, sy = h / this.height;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= sx; p.y *= sy;
      if (p.x0 !== undefined) p.x0 *= sx;
      if (p.tx !== undefined) { p.tx *= sx; p.ty *= sy; }
    }
    this.width = w; this.height = h;
    this._scale = this._areaScale();
  };

  /* --- spawning --- */
  Weather.prototype._base = function (biome, kind, sprite, layer, depth) {
    return {
      sprite: sprite, x: 0, y: 0, size: 0, size0: 0, rot: 0, flipX: 1, alpha: 0, layer: layer,
      depth: depth, biome: biome, emitter: -1, kind: kind, baseAlpha: 1, fade: 1, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0, life: 0
    };
  };

  Weather.prototype._spawn = function (biome, ei, where, fade) {
    if (this.particles.length >= MAX_PARTICLES - FX_MAX) return null;
    var em = BIOMES[biome].emitters[ei], r = this.rng;
    var p = this._base(biome, em.kind, em.sprite, em.layer, em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.5));
    p.emitter = ei; p.fade = fade;
    p.baseAlpha = r.range(em.alpha[0], em.alpha[1]);
    if (em.color) p.color = em.color;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, H = this.height, inside = where === 'inside';
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU);
    p.age = 0; p.rot = 0; p.flipX = 1;
    switch (p.kind) {
      case 'flutter':
        p.x = inside ? r.range(40, W - 40) : (r.chance(0.5) ? -30 : W + 30); p.y = r.range(80, H - 40);
        p.tx = r.range(40, W - 40); p.ty = r.range(80, H - 40); p.retarget = r.range(1.5, 3.5);
        p.omega = r.range(11, 15); p.dir = 1; p.vx = 0; p.vy = 0;
        break;
      case 'leaf':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(1.2, 2.0);
        p.amp = r.range(16, 30) * (0.6 + 0.4 * p.depth);
        p.x0 = r.range(-20, W + 20); p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y = inside ? r.range(0, H) : r.range(-40, -14);
        p.tphase = r.range(0, TAU); p.tomega = r.range(0.5, 1.2) * r.sign();
        break;
      case 'drift':
        p.x = r.range(0, W); p.y = r.range(0, H);
        p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 6); p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.5, 3.5); p.spin = r.range(-0.6, 0.6);
        break;
      case 'mist':
        p.x = r.range(-60, W + 60); p.y = r.range(40, H - 20);
        p.vx = r.range(4, 12) * r.sign(); p.vy = r.range(-2, 2);
        p.life = r.range(9, 15); p.age = inside ? r.range(0, p.life) : 0;
        p.rot = r.range(-0.3, 0.3); p.spin = r.range(-0.03, 0.03); p.flipX = r.chance(0.5) ? 1 : -1;
        break;
      case 'firefly':
        p.x = r.range(20, W - 20); p.y = r.range(60, H - 20);
        p.tvx = r.range(-14, 14); p.tvy = r.range(-10, 10); p.vx = p.tvx; p.vy = p.tvy; p.retarget = r.range(0.8, 2.2);
        p.omega = r.range(1.6, 3);
        break;
      case 'gust':
        p.x = inside ? r.range(-20, W + 20) : r.range(-80, -20); p.y = r.range(30, H - 10);
        p.omega = r.range(0.8, 1.6); p.amp = r.range(6, 16);
        p.spd = r.range(0.7, 1.3);
        p.flipX = r.chance(0.5) ? 1 : -1;
        break;
      case 'fall':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.5, 1.2); p.amp = r.range(4, 12) * (0.5 + p.depth);
        p.spin = r.range(-0.8, 0.8); p.rot = r.range(0, TAU);
        if (inside) { p.x = r.range(-10, W + 10); p.y = r.range(-10, H); }
        else if (r.chance(0.7)) { p.x = r.range(-10, W + 10); p.y = r.range(-30, -10); }
        else { p.x = r.range(-30, -10); p.y = r.range(0, H - 40); }
        break;
    }
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, H = this.height, wind = this.wind * (0.4 + 0.6 * p.depth), e, u;
    p.age += h;
    switch (p.kind) {
      case 'flutter': {
        p.retarget -= h;
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (p.retarget <= 0 || d < 12) {
          p.tx = clamp(p.x + r.range(-240, 240), 30, W - 30); p.ty = clamp(p.y + r.range(-200, 200), 70, H - 30);
          p.retarget = r.range(1.5, 3.5);
        }
        e = 1 - Math.exp(-1.6 * h);
        p.vx += (dx / d * 48 - p.vx) * e; p.vy += (dy / d * 36 - p.vy) * e;
        p.phase += p.omega * h;
        p.x += p.vx * h; p.y += (p.vy + Math.sin(p.phase * 0.25) * 14) * h;
        if (p.vx > 4) p.dir = 1; else if (p.vx < -4) p.dir = -1;
        var flap = Math.abs(Math.sin(p.phase));
        p.flipX = p.dir * (0.25 + 0.75 * flap);
        p.size = p.size0 * (0.92 + 0.08 * flap);
        p.rot = clamp(p.vx / 200, -0.25, 0.25);
        break;
      }
      case 'leaf': {
        p.phase += p.omega * h;
        var c = Math.cos(p.phase);
        p.x0 += wind * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.fall * (0.45 + 0.75 * Math.abs(c)) * h;
        p.rot = 0.55 * c + 0.12 * Math.sin(p.phase * 2);
        p.tphase += p.tomega * h;
        var ct = Math.cos(p.tphase);
        p.flipX = (ct >= 0 ? 1 : -1) * Math.max(0.25, Math.abs(ct));
        break;
      }
      case 'drift':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 6); p.retarget = r.range(1, 3); }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += (p.vx + wind * 0.4) * h; p.y += p.vy * h;
        p.phase += p.omega * h; p.rot += p.spin * h;
        p.size = p.size0 * (0.8 + 0.2 * Math.sin(p.phase));
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < -14) p.y += H + 28; else if (p.y > H + 14) p.y -= H + 28;
        break;
      case 'mist':
        p.x += (p.vx + wind * 0.3) * h; p.y += p.vy * h; p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (0.85 + 0.25 * u);
        if (p.age >= p.life) this._init(p, BIOMES[p.biome].emitters[p.emitter], 'edge');
        break;
      case 'firefly':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-14, 14); p.tvy = r.range(-10, 10); p.retarget = r.range(0.8, 2.2); }
        e = 1 - Math.exp(-1.2 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += p.vx * h; p.y += p.vy * h; p.phase += p.omega * h;
        if (p.x < 15) p.tvx = Math.abs(p.tvx); else if (p.x > W - 15) p.tvx = -Math.abs(p.tvx);
        if (p.y < 50) p.tvy = Math.abs(p.tvy); else if (p.y > H - 15) p.tvy = -Math.abs(p.tvy);
        p.x = clamp(p.x, 0, W); p.y = clamp(p.y, 0, H);
        break;
      case 'gust': {
        var v = wind * (0.35 + 1.3 * this.gust) * p.spd;
        p.phase += p.omega * h;
        p.x += v * h; p.y += Math.sin(p.phase) * p.amp * p.omega * h;
        p.rot = clamp(Math.cos(p.phase) * 0.25, -0.3, 0.3);
        if (p.sprite !== 'dot') p.size = p.size0 * (0.85 + 0.35 * this.gust);
        break;
      }
      case 'fall':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + wind) * h;
        p.y += p.fall * h;
        p.rot += p.spin * h;
        break;
      case 'feather':
        p.vy += (22 - p.vy) * (1 - Math.exp(-2.5 * h));      // drag → slow terminal fall
        p.vx *= Math.exp(-1.5 * h);
        p.phase += p.omega * h;
        p.x += (p.vx + Math.cos(p.phase) * 26) * h; p.y += p.vy * h;
        p.rot = 0.7 * Math.sin(p.phase);
        break;
      case 'sparkle':
        p.vx *= Math.exp(-3 * h); p.vy *= Math.exp(-3 * h);
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (0.4 + 0.9 * Math.sin(Math.PI * u));
        break;
    }
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    switch (p.kind) {
      case 'fall': case 'leaf': return p.y > H + m || p.x < -m - 60 || p.x > W + m + 40;
      case 'flutter': return p.x < -m - 20 || p.x > W + m + 20 || p.y < -m || p.y > H + m;
      case 'gust': return p.x > W + m || p.y < -m || p.y > H + m;
      case 'mist': return p.x < -p.size || p.x > W + p.size;
      default: return false;
    }
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1), u;
    switch (p.kind) {
      case 'drift': a *= 0.55 + 0.45 * Math.sin(p.phase); break;
      case 'mist': u = clamp(p.age / p.life, 0, 1); a *= Math.sin(Math.PI * u); break;
      case 'firefly': a *= 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(p.phase), 2); break;
      case 'gust': a *= 0.35 + 0.65 * this.gust; break;
      case 'feather': u = clamp(p.age / p.life, 0, 1); a *= Math.min(1, u * 6) * (1 - u * u); break;
      case 'sparkle': u = clamp(p.age / p.life, 0, 1); a *= 1 - u * u; break;
    }
    return a;
  };

  /* --- fx: feathers drifting from Mumbles' pillow sack, sparkles under Spike's kickflip --- */
  Weather.prototype._fxCount = function () {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].biome < 0) n++;
    return n;
  };

  Weather.prototype._fxSpawn = function (sprite, x, y, vx, vy, size, life) {
    if (this.particles.length >= MAX_PARTICLES || this._fxCount() >= FX_MAX) return null;
    var r = this.rng, p = this._base(-1, sprite, sprite, sprite === 'feather' ? 'front' : 'back', 1);
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.size0 = p.size = size; p.life = life;
    p.phase = r.range(0, TAU); p.omega = r.range(2.5, 4); p.spin = r.range(-4, 4); p.rot = r.range(0, TAU);
    p.baseAlpha = sprite === 'feather' ? 0.95 : 1;
    this.particles.push(p);
    return p;
  };

  /** burst(sprite, x, y, n): 'feather' (pillow puff) or 'sparkle' (note pickup / clear). */
  Weather.prototype.burst = function (sprite, x, y, n) {
    var r = this.rng;
    n = Math.min(n || 6, 12);
    for (var i = 0; i < n; i++) {
      var a = r.range(0, TAU), sp = sprite === 'feather' ? r.range(30, 80) : r.range(40, 110);
      if (!this._fxSpawn(sprite === 'feather' ? 'feather' : 'sparkle', x, y, Math.cos(a) * sp, Math.sin(a) * sp - (sprite === 'feather' ? 30 : 0),
        sprite === 'feather' ? r.range(12, 18) : r.range(10, 16), sprite === 'feather' ? r.range(1.6, 2.4) : r.range(0.45, 0.8))) break;
    }
  };

  Weather.prototype._fx = function (h, env) {
    var r = this.rng, boss = env && env.boss, spike = env && env.spike;
    if (boss && boss.state && boss.state !== 'away') {
      this._featherAcc += h * 1.4;
      while (this._featherAcc >= 1) {
        this._featherAcc -= 1;
        this._fxSpawn('feather', boss.x + r.range(-20, 20), boss.y + 18, r.range(-20, 20), r.range(0, 20), r.range(11, 16), r.range(1.8, 2.6));
      }
    } else this._featherAcc = 0;
    if (spike && spike.jump > 0) {
      this._sparkAcc += h * 14;
      while (this._sparkAcc >= 1) {
        this._sparkAcc -= 1;
        this._fxSpawn('sparkle', spike.x + r.range(-10, 10), spike.y + r.range(-4, 8), r.range(-25, 25), r.range(-10, 20), r.range(8, 13), r.range(0.35, 0.6));
      }
    } else this._sparkAcc = 0;
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, env) {
    var i, p, b;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.biome) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    this.wind += (BIOMES[this.biome].wind - this.wind) * (1 - Math.exp(-0.8 * h));
    // gust strength 0..1: smooth sum of incommensurate sines, squared so calm spells are long
    var g = 0.5 + 0.3 * Math.sin(this.time * 0.37) + 0.2 * Math.sin(this.time * 0.91 + 1.3);
    this.gust = clamp(g * g * 1.3, 0, 1);
    this._fx(h, env);

    var ems = BIOMES[this.biome].emitters, have = this._have || (this._have = []);
    have.length = ems.length;
    for (i = 0; i < ems.length; i++) have[i] = 0;
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.biome === this.biome && !p.leaving) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.biome < 0) {
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life || p.y > this.height + 40) this.particles.splice(i, 1);
        continue;
      }
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var em = BIOMES[p.biome].emitters[p.emitter];
        var target = Math.round(this._count(em) * this.ramp[p.biome]);
        if (!p.leaving && p.biome === this.biome && have[p.emitter] <= target) { this._init(p, em, 'edge'); p.fade = 1; }
        else { this.particles.splice(i, 1); if (!p.leaving && p.biome === this.biome) have[p.emitter]--; }
      }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(this._count(ems[i]) * this.ramp[this.biome]);
      while (have[i] < want && this._spawn(this.biome, i, 'inside', 0)) have[i]++;
      // shrink after a resize to a smaller canvas
      if (have[i] > want + 2) {
        for (var k = this.particles.length - 1; k >= 0 && have[i] > want; k--) {
          p = this.particles[k];
          if (p.biome === this.biome && p.emitter === i && !p.leaving) { p.leaving = true; p.leaveDelay = 0; have[i]--; }
        }
      }
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], fog = 0, b;
    for (b = 0; b < 4; b++) tot += this.ramp[b];
    if (tot <= 0) tot = 1;
    for (b = 0; b < 4; b++) {
      var k = this.ramp[b] / tot, a = BIOMES[b].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.fog = fog;
  };

  /** update(dt, { spike, boss }) — env optional. */
  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var h = this.stepH;
    this._acc += dt;
    // a huge dt (tab switch × speed) would just churn: cap the catch-up at 5 s of weather
    if (this._acc > 5) this._acc = 5;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, env || null); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a biome's own emitters at the current size (tests / debug). */
  Weather.prototype.fullCount = function (b) {
    var ems = BIOMES[b].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += this._count(ems[i]);
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, bySprite: {}, byKind: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
      o.byKind[p.kind] = (o.byKind[p.kind] || 0) + 1;
    }
    return o;
  };

  DJ.Weather = Weather;
})(window.DJ = window.DJ || {});
