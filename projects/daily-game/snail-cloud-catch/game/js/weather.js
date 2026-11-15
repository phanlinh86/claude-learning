/* Shelly's Sky Catch — SC.Weather (weather-level ambient particles + gameplay fx, headless, deterministic)
 *
 *   const wx = new SC.Weather({ width:960, height:540, seed });
 *   wx.setZone(z, { instant:false });            // alias wx.setSeason(); smooth hand-over (~2 s)
 *   wx.update(dt, { wind: w.wind, snail: w.snail, world: w });   // all optional
 *   wx.burst(kind, x, y, n);                     // 'sparkle'|'twinkle'|'zap'|'puff'|'splash'|'confetti'
 *   wx.jet(x, y, strength, { vx, vy, face });    // jet puffs from the nozzle (opts optional)
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, zone, depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, fog: 0..1 }
 *
 * `size` = drawn width in px. 'back' = behind the falling items (sky band), 'front' = over everything.
 * Draw with translate(x,y) → rotate(rot) → scale(flipX, 1). Sprites = assets/default/particles/<name>.svg
 * (DESIGN §4.3: sparkle twinkle puff rain splash snowflake streak petal zap mote), plus 'dot' (filled circle
 * of diameter `size` in `color`) and 'confetti' (small rect size × size·0.55 in `color`).
 *
 * JET PUFFS: with env.snail given, update() emits jet puffs automatically from the nozzle while
 * snail.flame > 0 (rate ∝ flame), so the renderer does NOT need to call jet() per frame. Call jet()
 * only for an extra burst (e.g. 6 puffs on the 'jet' event). Disable with new SC.Weather({ autoJet:false }).
 *
 * update() runs fixed 1/60 s sub-steps with an accumulator, so the result is identical for any dt
 * partition (same seed + same calls + same env). Hard bound: MAX_PARTICLES = 176 (< 180).
 *
 * Motion models (docs/MECHANICS.md §7):
 *  - mote    : sunny dust motes: velocity eases to random wander targets, gentle pulse
 *  - glint   : sunny sparkles: fixed spot, sin² life (twinkle)
 *  - rain    : straight fast streaks, slant = wind + a base lean, 2 depth layers; front drops
 *              splash on the cloud floor (y 488–496)
 *  - flake   : snow: terminal fall, pendulum drift x = x0 + A·sin φ, tumble, 3 depth layers,
 *              follows the wind by depth (parallax)
 *  - streak  : wind wisps, speed ∝ wind level, alpha life fade, count ∝ wind level (+ preview in the
 *              telegraph direction while wind.warn > 0)
 *  - petal   : falling-leaf pendulum carried by the wind (velocity relaxes to wind.x)
 *  - fx      : bursts (radial, drag), confetti (ballistic + air drag + flutter), jet puffs
 *              (exhaust down/back + inherited velocity, drag, grow ×2.2, fade)
 */
(function (SC) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 176;          // hard bound (DESIGN §5.2: < 180)
  var FX_MAX = 64;                  // gameplay fx share of the budget
  var FLOOR = 492;
  var CONFETTI = ['#ff8fb1', '#ffd34d', '#7fd3ff', '#9be89b', '#c9a3ff', '#ffb36b'];

  // count = steady-state particles per emitter
  var ZONES = [
    { // 0 sunny
      ambient: { tint: [255, 240, 205, 0.03], fog: 0 },
      emitters: [
        { kind: 'mote', layer: 'back', count: 14, size: [6, 11], alpha: [0.35, 0.65], sprite: 'mote', band: [130, 470], depth: 0.5 },
        { kind: 'glint', layer: 'back', count: 5, size: [9, 15], alpha: [0.6, 0.95], sprite: 'sparkle', band: [140, 330], depth: 0.4 },
        { kind: 'mote', layer: 'front', count: 2, size: [12, 16], alpha: [0.25, 0.4], sprite: 'mote', band: [160, 460], depth: 1 }
      ]
    },
    { // 1 rain — 2 depth layers
      ambient: { tint: [120, 130, 175, 0.07], fog: 0.06 },
      emitters: [
        { kind: 'rain', layer: 'back', count: 32, size: [9, 13], alpha: [0.3, 0.45], sprite: 'rain', depth: 0.45, fall: [470, 560] },
        { kind: 'rain', layer: 'front', count: 16, size: [16, 22], alpha: [0.55, 0.75], sprite: 'rain', depth: 1, fall: [760, 880], splash: true }
      ]
    },
    { // 2 wind
      ambient: { tint: [255, 205, 170, 0.035], fog: 0.02 },
      emitters: [
        { kind: 'streak', layer: 'back', count: 7, size: [44, 70], alpha: [0.5, 0.75], sprite: 'streak', depth: 0.5, band: [130, 420] },
        { kind: 'streak', layer: 'front', count: 6, size: [60, 92], alpha: [0.6, 0.9], sprite: 'streak', depth: 1, band: [150, 470] },
        { kind: 'petal', layer: 'back', count: 6, size: [9, 13], alpha: [0.6, 0.85], sprite: 'petal', depth: 0.55, fall: [18, 30] },
        { kind: 'petal', layer: 'front', count: 4, size: [14, 19], alpha: [0.8, 1], sprite: 'petal', depth: 1, fall: [28, 40] }
      ]
    },
    { // 3 snow — 3 depth layers (size / speed / alpha by depth)
      ambient: { tint: [120, 105, 200, 0.06], fog: 0.04 },
      emitters: [
        { kind: 'flake', layer: 'back', count: 28, size: [5, 8], alpha: [0.4, 0.6], sprite: 'snowflake', depth: 0.3, fall: [16, 24] },
        { kind: 'flake', layer: 'back', count: 20, size: [9, 13], alpha: [0.6, 0.8], sprite: 'snowflake', depth: 0.6, fall: [28, 38] },
        { kind: 'flake', layer: 'front', count: 8, size: [15, 20], alpha: [0.7, 0.9], sprite: 'snowflake', depth: 1, fall: [46, 58] }
      ]
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new SC.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.autoJet = opts.autoJet !== false;
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.zone = 0; this.season = 0;
    this.time = 0;
    this.windX = 0; this.windLevel = 0; this.windDir = 1; this.windWarn = 0;
    this.ambient = { tint: null, fog: 0 };
    this._jetAcc = 0; this._nFx = 0;
    this.setZone(opts.zone || opts.season || 0, { instant: true });
    for (var k = 0; k < 60; k++) this._step(this.stepH, null);   // pre-warm 1 s
    this.time = 0;
  }
  Weather.ZONES = ZONES;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['sparkle', 'twinkle', 'puff', 'rain', 'splash', 'snowflake', 'streak', 'petal', 'zap', 'mote', 'dot', 'confetti'];

  Weather.prototype.setZone = function (i, opts) {
    i = (((i | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k;
    this.zone = this.season = i;
    if (instant) {
      for (k = this.particles.length - 1; k >= 0; k--) if (this.particles[k].zone >= 0) this.particles.splice(k, 1);
      this.ramp = [0, 0, 0, 0]; this.ramp[i] = 1;
      var ems = ZONES[i].emitters;
      for (var e = 0; e < ems.length; e++) for (k = 0; k < ems[e].count; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.zone < 0) continue;
        if (p.zone !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 0.8); }
        else if (p.zone === i) p.leaving = false;
      }
    }
    this._updateAmbient();
  };
  Weather.prototype.setSeason = Weather.prototype.setZone;

  /* --- spawning --- */
  Weather.prototype._base = function (zone, kind, sprite, layer, depth) {
    return {
      sprite: sprite, x: 0, y: 0, size: 0, size0: 0, rot: 0, flipX: 1, alpha: 0, layer: layer,
      depth: depth, zone: zone, emitter: -1, kind: kind, baseAlpha: 1, fade: 1, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0, life: 0, x0: 0, drag: 0, grow: 0, g: 0
    };
  };

  Weather.prototype._spawn = function (zone, ei, where, fade) {
    if (this.particles.length >= MAX_PARTICLES) return null;
    var em = ZONES[zone].emitters[ei], r = this.rng;
    var p = this._base(zone, em.kind, em.sprite, em.layer, em.depth);
    p.emitter = ei; p.fade = fade;
    p.baseAlpha = r.range(em.alpha[0], em.alpha[1]);
    if (em.color) p.color = em.color;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, inside = where === 'inside', band = em.band;
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU); p.age = 0; p.rot = 0; p.flipX = 1;
    switch (p.kind) {
      case 'mote':
        p.x = r.range(0, W); p.y = r.range(band[0], band[1]); p.band = band;
        p.tvx = r.range(-9, 9); p.tvy = r.range(-6, 5); p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.2, 2.6); p.spin = r.range(-0.5, 0.5);
        break;
      case 'glint':
        p.x = r.range(20, W - 20); p.y = r.range(band[0], band[1]);
        p.life = r.range(1.0, 2.4); p.age = inside ? r.range(0, p.life) : 0;
        p.rot = r.range(-0.3, 0.3);
        break;
      case 'rain':
        p.vy = r.range(em.fall[0], em.fall[1]);
        p.floor = p.depth >= 1 ? r.range(488, 496) : r.range(455, 478);   // back drops vanish behind the floor
        p.x = r.range(-60, W + 60);
        p.y = inside ? r.range(40, p.floor) : r.range(-40, 30);
        p.splash = !!em.splash;
        p.rot = -Math.atan2(p.vy * 0.1 + this.windX * 0.6 * p.depth, p.vy);
        break;
      case 'flake':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.8, 1.6);                         // pendulum rate (rad/s)
        p.amp = r.range(8, 22) * (0.5 + 0.5 * p.depth);      // drift half-width (px)
        p.x0 = r.range(-20, W + 20); p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y = inside ? r.range(40, 500) : r.range(-30, -10);
        p.spin = r.range(0.3, 1.2) * r.sign(); p.rot = r.range(0, TAU);
        break;
      case 'streak':
        p.y = r.range(band[0], band[1]);
        p.x = inside ? r.range(0, W) : (this.windDir > 0 ? r.range(-120, W * 0.6) : r.range(W * 0.4, W + 120));
        p.life = r.range(0.8, 1.6); p.age = inside ? r.range(0, p.life) : 0;
        p.speed = r.range(0.8, 1.2);
        break;
      case 'petal':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(1.6, 2.6); p.amp = r.range(10, 22) * (0.6 + 0.4 * p.depth);
        if (inside) { p.x0 = r.range(0, W); p.y = r.range(80, 470); }
        else if (r.chance(0.6)) { p.x0 = this.windDir > 0 ? r.range(-40, -10) : r.range(W + 10, W + 40); p.y = r.range(100, 420); }
        else { p.x0 = r.range(0, W); p.y = r.range(-30, -10); }
        p.vx = this.windX * 0.9 * p.depth; p.x = p.x0;
        p.tphase = r.range(0, TAU); p.tomega = r.range(2, 4) * r.sign();
        break;
    }
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, e, u;
    p.age += h;
    switch (p.kind) {
      case 'mote':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-9, 9); p.tvy = r.range(-6, 5); p.retarget = r.range(1, 3); }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += p.vx * h; p.y += p.vy * h;
        p.phase += p.omega * h; p.rot += p.spin * h;
        p.size = p.size0 * (0.85 + 0.15 * Math.sin(p.phase));
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < p.band[0]) p.tvy = Math.abs(p.tvy); else if (p.y > p.band[1]) p.tvy = -Math.abs(p.tvy);
        break;
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge'); u = 0; }
        p.size = p.size0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.rot += 0.6 * h;
        break;
      case 'rain':
        p.vx = p.vy * 0.1 + this.windX * 0.6 * p.depth;     // base lean + wind
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = -Math.atan2(p.vx, p.vy);
        if (p.y >= p.floor) {
          if (p.splash && p.fade > 0.5 && !p.leaving) this._splash(p.x, p.floor, 0.8);
          if (p.leaving) { p.dead = true; break; }
          this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge');
        }
        if (p.x < -80) p.x += W + 140; else if (p.x > W + 80) p.x -= W + 140;
        break;
      case 'flake':
        p.phase += p.omega * h;
        p.x0 += this.windX * 0.5 * p.depth * h;              // parallax: near flakes follow the wind more
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.fall * (0.8 + 0.3 * Math.abs(Math.cos(p.phase))) * h;   // a bit faster through the swing bottom
        p.rot += p.spin * h;
        if (p.x0 < -30) p.x0 += W + 60; else if (p.x0 > W + 30) p.x0 -= W + 60;
        break;
      case 'streak': {
        var dir = this.windDir, lv = Math.max(this.windLevel, this.windWarn > 0 ? 0.6 : 0);
        p.x += dir * (180 + 420 * lv) * (0.55 + 0.45 * p.depth) * p.speed * h;
        p.y += Math.sin(p.phase + p.age * 2) * 6 * h;
        p.flipX = dir;
        if (p.age >= p.life) this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge');
        break;
      }
      case 'petal':
        e = 1 - Math.exp(-1.2 * h);
        p.vx += (this.windX * 0.9 * (0.5 + 0.5 * p.depth) - p.vx) * e;
        p.phase += p.omega * h;
        p.x0 += p.vx * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.fall * (0.5 + 0.7 * Math.abs(Math.cos(p.phase))) * h;
        p.rot = 0.6 * Math.cos(p.phase) + clamp(p.vx / 300, -0.5, 0.5);
        p.tphase += p.tomega * h;
        p.flipX = Math.cos(p.tphase) >= 0 ? Math.max(0.3, Math.abs(Math.cos(p.tphase))) : -Math.max(0.3, Math.abs(Math.cos(p.tphase)));
        break;
      // ---- fx (zone −1) ----
      case 'fx':
        p.vy += p.g * h;
        e = Math.exp(-p.drag * h); p.vx *= e; p.vy *= e;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (1 + p.grow * u);
        if (p.flutter) { p.phase += p.omega * h; p.flipX = Math.cos(p.phase); }
        if (p.floorY && p.y > p.floorY) { p.y = p.floorY; p.vy = 0; p.vx *= 0.8; }
        break;
    }
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    switch (p.kind) {
      case 'flake': return p.y > FLOOR + 10;
      case 'petal': return p.y > FLOOR + 6 || p.x < -m - 40 || p.x > W + m + 40;
      case 'streak': return p.x < -m - 140 || p.x > W + m + 140;
      default: return p.y > H + m;
    }
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1), u;
    switch (p.kind) {
      case 'glint': u = clamp(p.age / p.life, 0, 1); a *= Math.pow(Math.sin(Math.PI * u), 2); break;
      case 'mote': a *= 0.6 + 0.4 * Math.sin(p.phase); break;
      case 'streak': {
        u = clamp(p.age / p.life, 0, 1);
        var lv = Math.max(this.windLevel, this.windWarn > 0 ? 0.6 : 0);
        a *= Math.sin(Math.PI * u) * clamp(0.15 + lv, 0, 1);
        break;
      }
      case 'flake': if (p.y > FLOOR - 12) a *= clamp((FLOOR + 10 - p.y) / 22, 0, 1); break;
      case 'fx': u = clamp(p.age / p.life, 0, 1); a *= p.fadeIn ? Math.min(1, u * 6) * (1 - u) : 1 - u * u; break;
    }
    return clamp(a, 0, 1);
  };

  /* --- gameplay fx (zone −1, never part of a hand-over) --- */
  Weather.prototype._fx = function (sprite, layer) {
    if (this._nFx >= FX_MAX || this.particles.length >= MAX_PARTICLES) return null;
    var p = this._base(-1, 'fx', sprite, layer || 'front', 1);
    this.particles.push(p); this._nFx++;
    return p;
  };
  Weather.prototype._splash = function (x, y, s) {
    var p = this._fx('splash', 'front');
    if (!p) return;
    p.x = x; p.y = y - 3; p.size0 = p.size = 10 * s + this.rng.range(0, 4); p.grow = 0.7; p.life = 0.28; p.baseAlpha = 0.7;
  };

  /** One-shot burst of n particles at (x, y). */
  Weather.prototype.burst = function (kind, x, y, n) {
    var r = this.rng, p, i, a, sp;
    n = Math.max(1, Math.min(24, n | 0 || 8));
    for (i = 0; i < n; i++) {
      switch (kind) {
        case 'sparkle': case 'twinkle':
          p = this._fx(kind, 'front'); if (!p) return;
          a = r.range(0, TAU); sp = kind === 'sparkle' ? r.range(90, 210) : r.range(25, 70);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 'twinkle' ? 30 : 0);
          p.drag = kind === 'sparkle' ? 3.5 : 1.2; p.g = kind === 'sparkle' ? 120 : -10;
          p.size0 = r.range(kind === 'sparkle' ? 10 : 7, kind === 'sparkle' ? 18 : 12); p.grow = -0.5;
          p.life = r.range(0.45, 0.85); p.spin = r.range(-4, 4); p.rot = r.range(0, TAU);
          break;
        case 'zap':
          p = this._fx('zap', 'front'); if (!p) return;
          a = r.range(0, TAU); sp = r.range(60, 170);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.drag = 5; p.g = 0;
          p.size0 = r.range(12, 20); p.grow = -0.3; p.life = r.range(0.3, 0.55); p.rot = a; p.spin = r.range(-6, 6);
          break;
        case 'puff':
          p = this._fx('puff', 'front'); if (!p) return;
          a = r.range(0, TAU); sp = r.range(20, 70);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6 - 15; p.drag = 2.5; p.g = 0;
          p.size0 = r.range(14, 22); p.grow = 1.2; p.life = r.range(0.45, 0.8); p.baseAlpha = 0.85; p.rot = r.range(0, TAU); p.spin = r.range(-1, 1);
          break;
        case 'splash':
          p = this._fx('splash', 'front'); if (!p) return;
          p.vx = r.range(-15, 15); p.vy = 0; p.size0 = r.range(12, 18); p.grow = 0.8; p.life = r.range(0.25, 0.4); p.baseAlpha = 0.8;
          p.drag = 2;
          break;
        case 'confetti':
          p = this._fx('confetti', 'front'); if (!p) return;
          a = -Math.PI / 2 + r.range(-0.9, 0.9); sp = r.range(220, 420);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 380; p.drag = 1.6;
          p.size0 = r.range(7, 11); p.grow = 0; p.life = r.range(1.4, 2.2); p.spin = r.range(-7, 7); p.rot = r.range(0, TAU);
          p.flutter = true; p.omega = r.range(7, 12); p.color = CONFETTI[i % CONFETTI.length]; p.floorY = FLOOR;
          break;
        default: return;
      }
      p.x = x + r.range(-4, 4); p.y = y + r.range(-4, 4); p.size = p.size0; p.alpha = p.baseAlpha;
    }
  };

  /** Jet puffs from the nozzle at (x, y): exhaust down and back, inheriting a little of Shelly's motion. */
  Weather.prototype.jet = function (x, y, strength, o) {
    var r = this.rng, s = clamp(strength === undefined ? 1 : strength, 0, 1), n = 1 + Math.round(2 * s);
    o = o || {};
    var face = o.face || 1, vx0 = o.vx || 0, vy0 = o.vy || 0;
    for (var i = 0; i < n; i++) {
      var p = this._fx('puff', 'front'); if (!p) return;
      p.x = x + r.range(-3, 3); p.y = y + r.range(-2, 3);
      p.vx = -face * r.range(20, 60) + vx0 * 0.3 + r.range(-15, 15);
      p.vy = r.range(70, 140) * (0.5 + 0.5 * s) + vy0 * 0.2;
      p.drag = 3.2; p.g = -40;                                   // warm exhaust slows and floats up a little
      p.size0 = p.size = r.range(9, 14) * (0.7 + 0.3 * s); p.grow = 1.2;
      p.life = r.range(0.4, 0.7); p.baseAlpha = r.range(0.6, 0.85); p.rot = r.range(0, TAU); p.spin = r.range(-1.5, 1.5);
      p.fadeIn = true; p.alpha = 0;
    }
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, env) {
    var i, p, b, wind = env && env.wind, sn = env && env.snail;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.zone) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    // wind follows the world (eased a little so particles never snap)
    var wx = wind ? (+wind.x || 0) : 0;
    this.windX += (wx - this.windX) * (1 - Math.exp(-3 * h));
    this.windLevel = wind && wind.level !== undefined ? clamp(+wind.level || 0, 0, 1) : clamp(Math.abs(this.windX) / 110, 0, 1);
    this.windWarn = wind ? (+wind.warn || 0) : 0;
    if (Math.abs(this.windX) > 6) this.windDir = this.windX > 0 ? 1 : -1;
    else if (this.windWarn > 0 && wind && wind.nextDir) this.windDir = wind.nextDir;
    // automatic jet puffs from the nozzle
    if (this.autoJet && sn && sn.flame > 0.02) {
      this._jetAcc += h * 26 * sn.flame;
      while (this._jetAcc >= 1) {
        this._jetAcc -= 1;
        var face = sn.face || 1;
        this.jet(sn.x - 30 * face, sn.y + 16, sn.flame, { face: face, vx: sn.vx || 0, vy: sn.vy || 0 });
      }
    } else this._jetAcc = 0;

    var ems = ZONES[this.zone].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.zone === this.zone && !p.leaving) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.zone < 0) {                                    // fx particles: fixed lifetime
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life) { this.particles.splice(i, 1); this._nFx--; }
        continue;
      }
      if (p.dead) { this.particles.splice(i, 1); continue; }
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var em = ZONES[p.zone].emitters[p.emitter];
        var target = Math.round(em.count * this.ramp[p.zone]);
        if (!p.leaving && p.zone === this.zone && have[p.emitter] <= target) { this._init(p, em, 'edge'); p.fade = 1; }
        else { this.particles.splice(i, 1); if (!p.leaving && p.zone === this.zone) have[p.emitter]--; }
      }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(ems[i].count * this.ramp[this.zone]);
      while (have[i] < want && this.particles.length < MAX_PARTICLES) { this._spawn(this.zone, i, 'inside', 0); have[i]++; }
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], fog = 0, b;
    for (b = 0; b < 4; b++) tot += this.ramp[b];
    if (tot <= 0) tot = 1;
    for (b = 0; b < 4; b++) {
      var k = this.ramp[b] / tot, a = ZONES[b].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.fog = fog;
  };

  /** update(dt, { wind:{x,level,warn,nextDir}, snail:{x,y,vx,vy,face,flame}, world }) — all optional. */
  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var h = this.stepH;
    if (env && !env.wind && env.world) env = { wind: env.world.wind, snail: env.snail || env.world.snail };
    if (env && !env.snail && env.world) env = { wind: env.wind, snail: env.world.snail };
    this._acc += dt;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, env || null); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a zone's own emitters (tests / debug). */
  Weather.prototype.fullCount = function (z) {
    var ems = ZONES[z].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += ems[i].count;
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, fx: this._nFx, bySprite: {}, byKind: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
      o.byKind[p.kind] = (o.byKind[p.kind] || 0) + 1;
    }
    return o;
  };

  SC.Weather = Weather;
})(window.SC = window.SC || {});
