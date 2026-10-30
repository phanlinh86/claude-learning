/* Pip's Candy Dash — CD.Weather (candy-biome ambient particles, headless, deterministic)
 *
 *   const wx = new CD.Weather({ width:960, height:540, seed });
 *   wx.setSeason(biome, { instant:false });   // alias wx.setBiome(); smooth hand-over (~2 s)
 *   wx.update(dt, { wind });                  // optional extra wind px/s (+ = right)
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, biome, depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, fog: 0..1 }
 *
 * `size` = drawn width in px. 'back' layer: on the ground, behind the entities;
 * 'front': over everything (kept sparse/translucent). Draw with translate(x,y) →
 * rotate(rot) → scale(flipX, 1). Sprite 'dot' = filled circle of diameter `size`
 * in `color`; other sprites = assets/default/particles/<sprite>.svg.
 * update() runs fixed 1/60 s sub-steps with an accumulator (`_acc`), so the
 * result is identical for any dt partition (same seed + same setSeason times).
 *
 * Motion models (docs/MECHANICS.md):
 *  - drift  : sugar sparkles / glints: velocity eases to a new random target every
 *             1–3 s, twinkles in alpha (scale pulse), wraps around the screen
 *  - floss  : candy-floss puffs: slow wind drift + gentle vertical bob, slow spin,
 *             breathing size; wrap horizontally
 *  - ripple : chocolate rings born on the river band (never on the wafer bridges):
 *             grow 0.4 → 1.6× and fade over 2–3 s, then reborn elsewhere
 *  - fall   : sprinkles / sugar snowflakes: terminal fall speed, pendulum sway,
 *             spin + flipX tumble (sprinkles tumble fast, snowflakes slowly),
 *             3 depth layers with parallax-scaled wind
 *  - rainbow: tiny 'dot's that drift up like drift particles while cycling through
 *             rainbow colours (clouds)
 */
(function (CD) {
  'use strict';

  var TAU = Math.PI * 2;
  var RAINBOW = ['rgba(255,120,150,1)', 'rgba(255,180,90,1)', 'rgba(255,235,110,1)', 'rgba(140,230,140,1)', 'rgba(120,190,255,1)', 'rgba(190,150,255,1)'];

  // count = steady-state particles per emitter (sum per biome 30–80)
  var BIOMES = [
    { // 0 Gumdrop Meadow — drifting sugar sparkles + a few floss puffs
      wind: 6,
      ambient: { tint: [255, 250, 200, 0.03], fog: 0 },
      emitters: [
        { kind: 'drift', layer: 'back',  count: 16, size: [8, 14], alpha: [0.6, 0.95], sprite: 'sparkle' },
        { kind: 'drift', layer: 'back',  count: 10, size: [6, 10], alpha: [0.5, 0.85], sprite: 'sugar' },
        { kind: 'drift', layer: 'back',  count: 12, size: [2, 4],  alpha: [0.45, 0.8], sprite: 'dot', color: 'rgba(255,255,235,1)', depth: 0.3 },
        { kind: 'floss', layer: 'back',  count: 4,  size: [26, 40], alpha: [0.45, 0.65], sprite: 'floss' },
        { kind: 'floss', layer: 'front', count: 2,  size: [34, 46], alpha: [0.25, 0.35], sprite: 'floss', depth: 1 },
        { kind: 'drift', layer: 'front', count: 3,  size: [10, 14], alpha: [0.4, 0.55], sprite: 'sparkle', depth: 1 }
      ]
    },
    { // 1 Chocolate River — ripples on the stream band + sparkles
      wind: 10,
      ambient: { tint: [200, 130, 70, 0.04], fog: 0 },
      emitters: [
        { kind: 'ripple', layer: 'back', count: 10, size: [26, 40], alpha: [0.55, 0.8], sprite: 'ripple' },
        { kind: 'drift',  layer: 'back', count: 14, size: [8, 13], alpha: [0.55, 0.9], sprite: 'sparkle' },
        { kind: 'drift',  layer: 'back', count: 10, size: [2, 4],  alpha: [0.4, 0.75], sprite: 'dot', color: 'rgba(255,235,200,1)', depth: 0.3 },
        { kind: 'drift',  layer: 'back', count: 6,  size: [6, 10], alpha: [0.5, 0.8], sprite: 'sugar' },
        { kind: 'drift',  layer: 'front', count: 2, size: [10, 14], alpha: [0.35, 0.5], sprite: 'sparkle', depth: 1 }
      ]
    },
    { // 2 Cotton Candy Clouds — floss puffs drifting + rainbow sparkles
      wind: 14,
      ambient: { tint: [255, 170, 220, 0.05], fog: 0.04 },
      emitters: [
        { kind: 'floss',   layer: 'back',  count: 10, size: [26, 46], alpha: [0.5, 0.75], sprite: 'floss' },
        { kind: 'floss',   layer: 'front', count: 3,  size: [40, 56], alpha: [0.22, 0.32], sprite: 'floss', depth: 1 },
        { kind: 'rainbow', layer: 'back',  count: 16, size: [3, 6],  alpha: [0.6, 0.95], sprite: 'dot', depth: 0.4 },
        { kind: 'drift',   layer: 'back',  count: 12, size: [8, 14], alpha: [0.55, 0.9], sprite: 'sparkle' },
        { kind: 'drift',   layer: 'back',  count: 4,  size: [9, 13], alpha: [0.5, 0.8], sprite: 'star' }
      ]
    },
    { // 3 Ice-Cream Glacier — 3-colour sprinkles tumbling + sugar snowflakes in depth layers
      wind: 8,
      ambient: { tint: [170, 210, 255, 0.07], fog: 0.12 },
      emitters: [
        { kind: 'fall', layer: 'back',  count: 8,  size: [9, 13],  alpha: [0.8, 0.95], sprite: 'sprinkle_pink',   depth: 0.7, fall: [30, 46], tumble: true },
        { kind: 'fall', layer: 'back',  count: 8,  size: [9, 13],  alpha: [0.8, 0.95], sprite: 'sprinkle_blue',   depth: 0.7, fall: [30, 46], tumble: true },
        { kind: 'fall', layer: 'back',  count: 8,  size: [9, 13],  alpha: [0.8, 0.95], sprite: 'sprinkle_yellow', depth: 0.7, fall: [30, 46], tumble: true },
        { kind: 'fall', layer: 'back',  count: 16, size: [2, 3],   alpha: [0.35, 0.55], sprite: 'dot', color: 'rgba(240,248,255,1)', depth: 0.2, fall: [8, 14] },
        { kind: 'fall', layer: 'back',  count: 10, size: [9, 14],  alpha: [0.7, 0.9], sprite: 'snowflake', depth: 0.5, fall: [16, 26] },
        { kind: 'fall', layer: 'front', count: 4,  size: [14, 18], alpha: [0.4, 0.55], sprite: 'snowflake', depth: 1, fall: [28, 38] },
        { kind: 'fall', layer: 'front', count: 2,  size: [12, 15], alpha: [0.45, 0.6], sprite: 'sprinkle_pink', depth: 1, fall: [44, 56], tumble: true },
        { kind: 'drift', layer: 'back', count: 4,  size: [6, 10], alpha: [0.5, 0.8], sprite: 'sugar' }
      ]
    }
  ];

  // river band (matches CD.CONFIG zonesByBiome[1]; read from it when loaded)
  function riverRects() {
    var z = CD.CONFIG && CD.CONFIG.zonesByBiome && CD.CONFIG.zonesByBiome[1];
    if (z && z.length) return z;
    return [{ x: 40, y: 270, w: 260, h: 80 }, { x: 360, y: 270, w: 280, h: 80 }, { x: 700, y: 270, w: 220, h: 80 }];
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new CD.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.biome = 0;
    this.season = 0;                          // alias of biome (sister-game contract)
    this.time = 0;
    this.wind = 0;                            // wind px/s in effect (biome base + env, smoothed)
    this.ambient = { tint: null, fog: 0 };
    this._river = riverRects();
    this.setSeason(opts.biome || opts.season || 0, { instant: true });
  }
  Weather.BIOMES = BIOMES;
  Weather.SPRITES = ['sparkle', 'sugar', 'floss', 'sprinkle_pink', 'sprinkle_blue', 'sprinkle_yellow', 'ripple', 'snowflake', 'star', 'dot'];

  Weather.prototype.setSeason = function (i, opts) {
    i = ((i % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k;
    this.biome = this.season = i;
    if (instant) {
      this.particles.length = 0;
      this.ramp = [0, 0, 0, 0];
      this.ramp[i] = 1;
      this.wind = BIOMES[i].wind;
      var ems = BIOMES[i].emitters;
      for (var e = 0; e < ems.length; e++) for (k = 0; k < ems[e].count; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.biome !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1); }
        else if (p.biome === i) p.leaving = false;
      }
    }
    this._updateAmbient();
  };
  Weather.prototype.setBiome = Weather.prototype.setSeason;

  /* --- spawning --- */
  Weather.prototype._spawn = function (biome, ei, where, fade) {
    var em = BIOMES[biome].emitters[ei], r = this.rng;
    var p = {
      sprite: em.sprite, x: 0, y: 0, size: 0, rot: 0, flipX: 1, alpha: 0, layer: em.layer,
      depth: em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.5),
      biome: biome, emitter: ei, kind: em.kind,
      baseAlpha: r.range(em.alpha[0], em.alpha[1]),
      fade: fade, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0
    };
    if (em.color) p.color = em.color;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, H = this.height, inside = where === 'inside';
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU);
    p.age = 0;
    switch (p.kind) {
      case 'drift':
      case 'rainbow':
        p.x = r.range(0, W); p.y = r.range(70, H - 10);
        p.tvx = r.range(-8, 8); p.tvy = p.kind === 'rainbow' ? r.range(-14, -4) : r.range(-7, 5);
        p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.5, 4); p.spin = r.range(-0.6, 0.6);
        if (p.kind === 'rainbow') { p.ci = r.int(0, RAINBOW.length - 1); p.ct = r.next(); p.color = RAINBOW[p.ci]; }
        break;
      case 'floss':
        p.x = inside ? r.range(-20, W + 20) : (this.wind >= 0 ? -p.size - 10 : W + p.size + 10);
        p.y0 = r.range(90, H - 40); p.y = p.y0;
        p.omega = r.range(0.4, 0.8); p.amp = r.range(4, 10);
        p.spin = r.range(-0.15, 0.15); p.rot = r.range(-0.3, 0.3);
        p.drift = r.range(0.6, 1.2);
        break;
      case 'ripple': {
        var rects = this._river, tot = 0, k;
        for (k = 0; k < rects.length; k++) tot += rects[k].w;
        var u = r.range(0, tot), R = rects[0];
        for (k = 0; k < rects.length; k++) { if (u <= rects[k].w) { R = rects[k]; break; } u -= rects[k].w; }
        var m = 14;
        p.x = r.range(R.x + m, R.x + R.w - m); p.y = r.range(R.y + 12, R.y + R.h - 12);
        p.life = r.range(2, 3);
        p.age = inside ? r.range(0, p.life) : 0;
        p.rot = 0; p.flipX = 1;
        break;
      }
      case 'fall':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.5, 1.2); p.amp = r.range(4, 12) * (0.5 + p.depth);
        p.tumble = !!em.tumble;
        p.spin = em.tumble ? r.range(1.5, 4) * r.sign() : r.range(-0.6, 0.6);
        p.tomega = em.tumble ? r.range(2.5, 5) * r.sign() : 0; p.tphase = r.range(0, TAU);
        p.rot = r.range(0, TAU);
        p.x = r.range(-10, W + 10);
        p.y = inside ? r.range(-10, H - 10) : r.range(-30, -8);
        break;
    }
    if (p.kind !== 'fall' || !p.tumble) p.flipX = 1;
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, H = this.height, wind = this.wind * (0.4 + 0.6 * p.depth), e;
    p.age += h;
    switch (p.kind) {
      case 'drift':
      case 'rainbow':
        p.retarget -= h;
        if (p.retarget <= 0) {
          p.tvx = r.range(-8, 8); p.tvy = p.kind === 'rainbow' ? r.range(-14, -4) : r.range(-7, 5);
          p.retarget = r.range(1, 3);
        }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += (p.vx + wind * 0.5) * h; p.y += p.vy * h;
        p.phase += p.omega * h;
        p.rot += p.spin * h;
        p.size = p.size0 * (0.8 + 0.2 * Math.sin(p.phase));      // twinkle pulse
        if (p.kind === 'rainbow') {
          p.ct += h * 0.6;
          if (p.ct >= 1) { p.ct -= 1; p.ci = (p.ci + 1) % RAINBOW.length; p.color = RAINBOW[p.ci]; }
        }
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < 66) { p.y = H - 6; } else if (p.y > H - 4) { p.y = H - 4; p.tvy = -Math.abs(p.tvy); }
        break;
      case 'floss':
        p.phase += p.omega * h;
        p.x += (wind * p.drift) * h;
        p.y = p.y0 + Math.sin(p.phase) * p.amp;
        p.rot += p.spin * h;
        if (Math.abs(p.rot) > 0.35) p.spin = -p.spin;
        p.size = p.size0 * (1 + 0.05 * Math.sin(p.phase * 1.7));
        break;
      case 'ripple':
        if (p.age >= p.life) this._init(p, BIOMES[p.biome].emitters[p.emitter], 'edge');
        break;
      case 'fall':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + wind) * h;
        p.y += p.fall * h;
        p.rot += p.spin * h;
        if (p.tumble) { p.tphase += p.tomega * h; p.flipX = Math.cos(p.tphase); }
        break;
    }
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    if (p.kind === 'fall') return p.y > H + m || p.x < -m - 30 || p.x > W + m + 30;
    if (p.kind === 'floss') return p.x < -m - 30 || p.x > W + m + 30;
    return false;
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1);
    if (p.kind === 'drift' || p.kind === 'rainbow') a *= 0.55 + 0.45 * Math.sin(p.phase);
    if (p.kind === 'ripple') {
      var u = clamp(p.age / p.life, 0, 1);
      p.size = p.size0 * (0.4 + 1.2 * u);
      a *= Math.min(1, u * 6) * (1 - u);
    }
    return a;
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, envWind) {
    var i, p, b;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.biome) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    var wTarget = BIOMES[this.biome].wind + envWind;
    this.wind += (wTarget - this.wind) * (1 - Math.exp(-0.8 * h));

    var ems = BIOMES[this.biome].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.biome === this.biome && !p.leaving) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var em = BIOMES[p.biome].emitters[p.emitter];
        var target = Math.round(em.count * this.ramp[p.biome]);
        if (!p.leaving && p.biome === this.biome && have[p.emitter] <= target) { this._init(p, em, 'edge'); p.fade = 1; }
        else { this.particles.splice(i, 1); if (!p.leaving && p.biome === this.biome) have[p.emitter]--; }
      }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(ems[i].count * this.ramp[this.biome]);
      while (have[i] < want) { this._spawn(this.biome, i, 'inside', 0); have[i]++; }
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

  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var wind = (env && env.wind) || 0, h = this.stepH;
    this._acc += Math.min(dt, 0.25);
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, wind); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a biome (tests / debug). */
  Weather.prototype.fullCount = function (b) {
    var ems = BIOMES[b].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += ems[i].count;
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, bySprite: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
    }
    return o;
  };

  CD.Weather = Weather;
})(window.CD = window.CD || {});
