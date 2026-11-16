/* Momo's Dino Drums — DD.Weather (per-floor ambient particles + fx, headless, deterministic)
 *
 *   const wx = new DD.Weather({ width:960, height:540, seed });
 *   wx.setLevel(tod, { instant:false });     // floor 0 river, 1 ferns, 2 nests, 3 sky; smooth hand-over (~2 s)
 *   wx.resize(w, h);                         // any canvas size (portrait up to 720×1600)
 *   wx.update(dt, { beat, kitX, kitY });     // env optional; crossing an integer beat calls pulse()
 *   wx.pulse();                              // on each beat: particles bob / swell a little
 *   wx.burst(sprite, x, y, n, opts)          // one-shot fx: 'sparkle' | 'star' | 'note' | 'confetti' | 'dot' | 'fluff' | 'leaf' | 'firefly'
 *                                            //  ('feather' is accepted as an alias of 'fluff')
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, sx? }]
 *   wx.ambient    // { tint:'rgba(..)'|null, glow:0..1, shafts:[{x, w, slope, alpha}] }
 *
 * Draw: translate(x,y) → rotate(rot) → scale(flipX·(sx ?? 1), 1), sprite of width `size` centred,
 * globalAlpha = alpha. `sx` (butterflies only) is the wing-flap x-scale 0.22..1. 'dot' = filled circle of
 * diameter `size` in `color`. `color` on 'confetti' / 'butterfly' = tint (sprite is white). 'back'
 * particles go behind the rails / Momo, 'front' over everything (sparse, translucent).
 * ambient.shafts (Riverbank only): soft diagonal morning light bands, x = centre at the TOP of the canvas,
 * w = width, slope = dx per dy px (bands lean right going down), alpha = strength.
 * Fixed 1/60 s sub-steps with an accumulator → identical for any dt partition.
 */
(function (DD) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 136;            // hard bound (DESIGN §5.2: < 140)
  var AMB_MAX = 96;                   // ambient budget (incl. particles fading out during a hand-over)
  var FX_MAX = 40;
  var REF_AREA = 960 * 540;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // count = steady state per emitter on 960×540 (scaled by area ×0.6..×1.5)
  var TODS = [
    { // 0 Riverbank — morning: warm pollen motes in light shafts + a few leaves tumbling down from the canopy
      key: 'river', tint: [255, 214, 160, 0.05], glow: 0,
      emitters: [
        { kind: 'mote', layer: 'back', count: 24, size: [5, 9], alpha: [0.45, 0.85], sprite: 'mote' },
        { kind: 'mote', layer: 'front', count: 5, size: [9, 12], alpha: [0.3, 0.5], sprite: 'mote' },
        { kind: 'leaf', layer: 'back', count: 6, size: [16, 24], alpha: [0.75, 0.95], sprite: 'leaf', fall: [26, 40], wind: [6, 16] },
        { kind: 'leaf', layer: 'front', count: 2, size: [24, 30], alpha: [0.6, 0.8], sprite: 'leaf', fall: [40, 54], wind: [10, 22] },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 3], alpha: [0.3, 0.6], sprite: 'dot', color: 'rgba(255,236,200,1)' }
      ]
    },
    { // 1 Fern Canopy — butterflies wandering on curved paths (flapping) + green-gold motes, dappled light
      key: 'ferns', tint: [120, 200, 110, 0.05], glow: 0,
      emitters: [
        { kind: 'butterfly', layer: 'back', count: 7, size: [18, 26], alpha: [0.85, 1], sprite: 'butterfly', speed: [34, 56] },
        { kind: 'butterfly', layer: 'front', count: 2, size: [28, 34], alpha: [0.75, 0.9], sprite: 'butterfly', speed: [50, 70] },
        { kind: 'drift', layer: 'back', count: 16, size: [5, 8], alpha: [0.35, 0.7], sprite: 'mote' },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 3], alpha: [0.25, 0.5], sprite: 'dot', color: 'rgba(236,255,200,1)' }
      ]
    },
    { // 2 Nest Ledge — downy fluff falling slowly with a side-to-side sway, two depth layers (parallax)
      key: 'nests', tint: [200, 220, 255, 0.04], glow: 0.1,
      emitters: [
        { kind: 'fluff', layer: 'back', count: 16, size: [10, 15], alpha: [0.45, 0.7], sprite: 'fluff', fall: [10, 18], amp: [8, 16], wind: [2, 8] },
        { kind: 'fluff', layer: 'front', count: 5, size: [20, 26], alpha: [0.6, 0.85], sprite: 'fluff', fall: [22, 32], amp: [16, 28], wind: [6, 14] },
        { kind: 'drift', layer: 'back', count: 10, size: [2, 3], alpha: [0.3, 0.55], sprite: 'dot', color: 'rgba(255,255,255,1)' }
      ]
    },
    { // 3 Sky Roof — dusk to night: twinkling stars in the back, fireflies blinking with a lazy wander
      key: 'sky', tint: [30, 30, 100, 0.16], glow: 1,
      emitters: [
        { kind: 'star', layer: 'back', count: 26, size: [7, 14], alpha: [0.35, 0.8], sprite: 'star' },
        { kind: 'firefly', layer: 'back', count: 12, size: [12, 18], alpha: [0.7, 1], sprite: 'firefly' },
        { kind: 'firefly', layer: 'front', count: 4, size: [18, 24], alpha: [0.6, 0.9], sprite: 'firefly' },
        { kind: 'drift', layer: 'back', count: 6, size: [2, 3], alpha: [0.3, 0.6], sprite: 'dot', color: 'rgba(210,225,255,1)' }
      ]
    }
  ];
  var BUTTERFLY_TINTS = ['#ffb3d1', '#ffd36b', '#a9d8ff', '#c9b2ff', '#ffffff', '#ffa86b'];

  // fx defaults per sprite
  var FX = {
    sparkle: { speed: [60, 160], life: [0.45, 0.8], size: [10, 18], g: 0, drag: 3, spin: 4, layer: 'front' },
    star: { speed: [70, 170], life: [0.5, 0.9], size: [12, 20], g: 120, drag: 2, spin: 5, layer: 'front' },
    fluff: { speed: [40, 120], life: [1.2, 1.8], size: [14, 20], g: 0, fall: 40, drag: 2.5, rock: true, layer: 'front' },
    leaf: { speed: [60, 140], life: [1.0, 1.6], size: [14, 20], g: 0, fall: 60, drag: 2.5, rock: true, layer: 'front' },
    firefly: { speed: [20, 60], life: [0.8, 1.4], size: [10, 16], g: -20, drag: 2, spin: 0, layer: 'front' },
    note: { speed: [20, 50], life: [0.9, 1.3], size: [16, 22], g: -60, drag: 1.5, spin: 0, layer: 'front' },
    confetti: { speed: [120, 260], life: [0.9, 1.4], size: [8, 12], g: 260, drag: 1.6, spin: 9, layer: 'front' },
    dot: { speed: [60, 140], life: [0.3, 0.6], size: [3, 6], g: 0, drag: 3, spin: 0, layer: 'front' }
  };
  var CONFETTI = ['#ff6b8b', '#ffd25e', '#6bd6ff', '#8cf07a', '#c79bff'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new DD.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60;
    this._acc = 0;
    this.time = 0;
    this.particles = [];
    this.tod = 0;
    this._pulse = 0;
    this._lastBeat = null;
    this._mix = 1;                       // 0→1 hand-over of the ambient tint
    this._fromAmb = null;
    this.ambient = { tint: null, glow: 0, shafts: [] };
    this._scale = this._areaScale();
    this.setLevel(opts.tod || 0, { instant: true });
  }
  Weather.TODS = TODS;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['mote', 'leaf', 'butterfly', 'fluff', 'firefly', 'star', 'sparkle', 'note', 'confetti', 'dot'];
  var ALIAS = { feather: 'fluff', pollen: 'mote' };   // old sprite names from the sister game

  Weather.prototype._areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };
  Weather.prototype._count = function (em) { return Math.round(em.count * this._scale); };
  Weather.prototype._ambCount = function () {
    var n = 0; for (var i = 0; i < this.particles.length; i++) if (!this.particles[i].fx) n++; return n;
  };
  Weather.prototype._target = function (tod) {
    var ems = TODS[tod].emitters, n = 0;
    for (var e = 0; e < ems.length; e++) n += this._count(ems[e]);
    return Math.min(n, AMB_MAX);
  };

  Weather.prototype.setLevel = function (tod, opts) {
    tod = (((tod | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, i, p;
    this._fromAmb = this._ambNow();
    this._prevTod = instant ? tod : this.tod;
    this.tod = tod;
    if (instant) {
      this.particles = this.particles.filter(function (q) { return q.fx; });
      var ems = TODS[tod].emitters;
      for (var e = 0; e < ems.length; e++) for (var k = 0, n = this._count(ems[e]); k < n; k++) this._spawn(tod, e, true);
      this._mix = 1;
    } else {
      for (i = 0; i < this.particles.length; i++) {
        p = this.particles[i];
        if (p.fx) continue;
        if (p.tod !== tod) { if (!p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1.2); } }
        else p.leaving = false;
      }
      this._mix = 0;
    }
    this._updateAmbient();
  };
  Weather.prototype.setTod = Weather.prototype.setLevel;

  Weather.prototype.resize = function (w, h) {
    w = +w || this.width; h = +h || this.height;
    if (w === this.width && h === this.height) return;
    var sx = w / this.width, sy = h / this.height;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= sx; p.y *= sy; p.x0 *= sx; p.y0 *= sy;
      if (p.bob) p.bob = 0;
    }
    this.width = w; this.height = h;
    this._scale = this._areaScale();
    // trim to the new budget (smaller screen): fade the surplus out
    var tgt = this._target(this.tod), n = 0;
    for (i = 0; i < this.particles.length; i++) {
      var q = this.particles[i];
      if (q.fx || q.leaving) continue;
      if (++n > tgt) { q.leaving = true; q.leaveDelay = 0; }
    }
  };

  /* --- light shafts (Riverbank morning): 3 diagonal bands from the window side --- */
  Weather.prototype._shafts = function () {
    var W = this.width, H = this.height, out = [];
    for (var i = 0; i < 3; i++) {
      out.push({ x: W * (0.10 + 0.22 * i) + 12 * Math.sin(this.time * 0.15 + i * 2), w: W * (0.07 + 0.03 * (i % 2)),
        slope: 0.45, alpha: 0.10 + 0.04 * Math.sin(this.time * 0.4 + i) });
    }
    return out;
  };

  /* --- spawning --- */
  Weather.prototype._spawn = function (tod, ei, inside) {
    var em = TODS[tod].emitters[ei], r = this.rng, W = this.width, H = this.height;
    var p = {
      sprite: em.sprite, x: 0, y: 0, size: 0, rot: 0, flipX: 1, alpha: 0, layer: em.layer,
      kind: em.kind, tod: tod, ei: ei, fx: false, leaving: false, leaveDelay: 0, fade: inside ? 1 : 0,
      size0: r.range(em.size[0], em.size[1]), a0: r.range(em.alpha[0], em.alpha[1]),
      ph: r.range(0, TAU), x0: 0, y0: 0, vx: 0, vy: 0, life: 0, age: 0, spin: 0
    };
    if (em.color) p.color = em.color;
    p.size = p.size0; p.alpha = p.a0 * p.fade;
    switch (em.kind) {
      case 'mote': {                                      // inside a light shaft
        var sh = r.int(3), yy = r.range(0, H);
        var cx = W * (0.10 + 0.22 * sh) + yy * 0.45;
        p.x = p.x0 = cx + r.range(-0.05, 0.05) * W; p.y = p.y0 = yy;
        p.vx = r.range(-6, 6); p.vy = r.range(-4, 4); p.sh = sh;
        break;
      }
      case 'leaf':                                        // falling leaf: pendulum swing + tumble
        p.x = p.x0 = r.range(-0.05, 0.95) * W;
        p.y = inside ? r.range(-0.05, 0.9) * H : -p.size0 - r.range(0, 40);
        p.fall = r.range(em.fall[0], em.fall[1]); p.wind = r.range(em.wind[0], em.wind[1]);
        p.amp = r.range(0.6, 1.0);                        // swing amplitude (rad)
        p.om = r.range(1.6, 2.4);                         // swing angular frequency (rad/s): a ~3 s rocking period
        p.L = r.range(18, 30);                            // "pendulum length" (px): sideways travel per swing
        p.flipX = r.chance(0.5) ? 1 : -1;
        break;
      case 'butterfly': {
        p.x = p.x0 = r.range(0.08, 0.92) * W; p.y = p.y0 = r.range(0.08, 0.7) * H;
        p.head = r.range(0, TAU); p.turn = 0; p.tturn = r.range(-0.9, 0.9);
        p.spd = r.range(em.speed[0], em.speed[1]);
        p.flap = r.range(0, TAU); p.flapHz = r.range(7, 10);
        p.color = r.pick(BUTTERFLY_TINTS); p.sx = 1;
        break;
      }
      case 'fluff':                                       // downy fluff: slow terminal fall + pendulum sway
        p.x = p.x0 = r.range(-0.05, 1.05) * W;
        p.y = inside ? r.range(-0.05, 1.0) * H : -p.size0 - r.range(0, 30);
        p.fall = r.range(em.fall[0], em.fall[1]); p.amp = r.range(em.amp[0], em.amp[1]);
        p.wind = r.range(em.wind[0], em.wind[1]); p.freq = r.range(0.25, 0.45);   // Hz
        p.flipX = r.chance(0.5) ? 1 : -1;
        break;
      case 'star':                                        // twinkling star high in the sky (back)
        p.x = p.x0 = r.range(0, W); p.y = p.y0 = r.range(0.03, 0.55) * H;
        p.tw = r.range(0.6, 1.4); p.rot = r.range(0, TAU); p.spin = r.range(-0.15, 0.15);
        break;
      case 'firefly':
        p.x = p.x0 = r.range(0.03, 0.97) * W; p.y = p.y0 = r.range(0.25, 0.95) * H;
        p.vx = r.range(-12, 12); p.vy = r.range(-8, 8);
        p.per = r.range(2.2, 4.0);                        // s between flashes
        p.blink = r.range(0, 1);                          // phase 0..1
        p.color = 'rgba(214,255,120,1)';
        break;
      default:                                            // drift
        p.x = p.x0 = r.range(0, W); p.y = p.y0 = r.range(0, H);
        p.vx = r.range(-8, 8); p.vy = r.range(-6, 6);
        if (em.sprite === 'sparkle') { p.spin = r.range(-1, 1); p.tw = r.range(1, 2); }
    }
    this.particles.push(p);
    return p;
  };

  Weather.prototype.pulse = function () { this._pulse = 1; };

  /* burst(sprite, x, y, n, opts): opts { speed:[a,b], life:[a,b], size:[a,b], color, layer, dir (rad), spread (rad) } */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    sprite = ALIAS[sprite] || sprite;
    if (Weather.SPRITES.indexOf(sprite) < 0) sprite = 'sparkle';
    var d = FX[sprite] || FX.sparkle, r = this.rng;
    n = clamp(n === undefined ? 8 : n | 0, 0, FX_MAX);
    for (var i = 0; i < n; i++) {
      var nfx = 0, k;
      for (k = 0; k < this.particles.length; k++) if (this.particles[k].fx) nfx++;
      if (nfx >= FX_MAX || this.particles.length >= MAX_PARTICLES) {   // drop the oldest fx
        for (k = 0; k < this.particles.length; k++) if (this.particles[k].fx) { this.particles.splice(k, 1); break; }
        if (this.particles.length >= MAX_PARTICLES) break;
      }
      var sp = opts.speed || d.speed, lf = opts.life || d.life, sz = opts.size || d.size;
      var ang = opts.dir !== undefined ? opts.dir + r.range(-1, 1) * (opts.spread !== undefined ? opts.spread : 0.8)
        : r.range(0, TAU);
      var v = r.range(sp[0], sp[1]);
      var p = {
        sprite: sprite, x: x, y: y, x0: x, y0: y, size: 0, size0: r.range(sz[0], sz[1]), rot: r.range(0, TAU), flipX: r.chance(0.5) ? 1 : -1,
        alpha: 1, a0: 1, layer: opts.layer || d.layer, fx: true, kind: 'fx', vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        life: r.range(lf[0], lf[1]), age: 0, spin: (d.spin || 0) * r.range(-1, 1), g: d.g, drag: d.drag, fall: d.fall || 0,
        rock: !!d.rock, ph: r.range(0, TAU), fade: 1, leaving: false
      };
      p.size = p.size0;
      if (sprite === 'confetti') p.color = opts.color || r.pick(CONFETTI);
      else if (opts.color) p.color = opts.color;
      else if (sprite === 'dot') p.color = 'rgba(255,255,255,1)';
      this.particles.push(p);
    }
  };

  Weather.prototype.update = function (dt, env) {
    dt = clamp(+dt || 0, 0, 0.5);
    if (env && typeof env.beat === 'number' && isFinite(env.beat)) {
      var fb = Math.floor(env.beat);
      if (this._lastBeat !== null && fb !== this._lastBeat) this.pulse();
      this._lastBeat = fb;
    }
    this._acc += dt;
    while (this._acc >= this.stepH - 1e-9) { this._acc -= this.stepH; this._step(this.stepH, env); }
  };

  Weather.prototype._step = function (h, env) {
    var W = this.width, H = this.height, r = this.rng, i, p;
    this.time += h;
    this._pulse = Math.max(0, this._pulse - h * 4);       // a beat bob lasts ≈ 0.25 s
    if (this._mix < 1) this._mix = Math.min(1, this._mix + h / 2);
    var pulse = this._pulse * this._pulse;
    var kx = env && env.kitX, ky = env && env.kitY;
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (p.fx) {
        p.age += h;
        if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
        var dr = Math.exp(-p.drag * h);
        p.vx *= dr; p.vy = p.vy * dr + p.g * h;
        if (p.fall) p.vy += (p.fall - p.vy) * Math.min(1, 2 * h);
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.rock) { p.rot = 0.6 * Math.sin(p.ph + p.age * 4); p.x += Math.cos(p.ph + p.age * 4) * 18 * h; }
        else p.rot += p.spin * h;
        var u = p.age / p.life;
        p.alpha = u < 0.7 ? 1 : clamp((1 - u) / 0.3, 0, 1);
        p.size = p.size0 * (p.sprite === 'sparkle' ? (u < 0.2 ? 0.5 + 2.5 * u : 1 - 0.4 * u) : 1);
        continue;
      }
      // fade in / out
      if (p.leaving) {
        if (p.leaveDelay > 0) p.leaveDelay -= h;
        else { p.fade -= h / 0.8; if (p.fade <= 0) { this.particles.splice(i, 1); continue; } }
      } else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
      var a = p.a0, sz = p.size0, t = this.time, bobAbs = false;
      switch (p.kind) {
        case 'mote': {
          // Brownian-ish wander (random accel + linear drag), slight updraft, soft spring to its light shaft
          p.vx += r.range(-10, 10) * h; p.vy += r.range(-10, 10) * h - 1.5 * h;
          p.vx *= Math.exp(-0.8 * h); p.vy *= Math.exp(-0.8 * h);
          var cx = W * (0.10 + 0.22 * p.sh) + 12 * Math.sin(t * 0.15 + p.sh * 2) + p.y * 0.45;
          var half = W * (0.035 + 0.015 * (p.sh % 2));
          p.vx += (cx - p.x) * 0.25 * h;
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
          var dd = Math.abs(p.x - cx) / (half * 1.6);
          a *= clamp(1.15 - dd, 0.15, 1) * (0.75 + 0.25 * Math.sin(p.ph + t * 1.3));
          p.rot = 0;
          break;
        }
        case 'leaf': {
          // Pendulum: swing angle θ = amp·sin(φ), φ = ph + ω·t. The leaf moves along the arc: sideways speed
          // = L·dθ/dt; it sinks fastest at the bottom of the swing (|cos φ| = 1) and almost hangs at the
          // turning points (like a real leaf gliding then stalling). Tilt follows the swing.
          var phi = p.ph + p.om * t, th = p.amp * Math.sin(phi), dth = p.amp * p.om * Math.cos(phi);
          var c2 = Math.cos(phi); c2 *= c2;
          p.x += (p.wind + p.L * dth) * h;
          p.y += p.fall * (0.35 + 1.0 * c2) * h;
          p.rot = -th * 0.9;
          if (p.y > H + 40 || p.x > W + 60) { this._respawn(p, i); continue; }
          if (p.x < -60) p.x = W + 40;
          break;
        }
        case 'butterfly': {
          // Wander: turn rate eases to random targets (curved, looping paths); steer back toward the centre
          // near the edges. Wing beat: sx = |cos(flap)| (one shape scaled in x); each downstroke gives a little lift.
          if (r.chance(h * 0.8)) p.tturn = r.range(-0.9, 0.9);     // rad/s: loops of r = v/ω ≥ 40 px
          var mx = 0.08 * W, my = 0.06 * H;
          if (p.x < mx || p.x > W - mx || p.y < my || p.y > H * 0.78) {
            var want = Math.atan2(H * 0.4 - p.y, W * 0.5 - p.x), dh = Math.atan2(Math.sin(want - p.head), Math.cos(want - p.head));
            p.tturn = clamp(dh * 2, -2.2, 2.2);
          }
          p.turn += (p.tturn - p.turn) * Math.min(1, 2 * h);
          p.head += p.turn * h;
          p.flap += p.flapHz * TAU * h;
          var cf = Math.cos(p.flap), lift = Math.max(0, -Math.sin(p.flap));      // downstroke half
          var spd = p.spd * (0.8 + 0.4 * lift);
          p.x += Math.cos(p.head) * spd * h;
          p.y += (Math.sin(p.head) * spd - 26 * lift + 10) * h;                  // flap lift vs a gentle sink
          p.sx = 0.22 + 0.78 * Math.abs(cf);
          p.flipX = Math.cos(p.head) < 0 ? -1 : 1;
          p.rot = clamp(0.35 * Math.sin(p.head) * p.flipX, -0.35, 0.35);
          if (kx !== undefined && ky !== undefined) {   // shy of Momo's drumsticks
            var bx = p.x - kx, by = p.y - ky, b2 = bx * bx + by * by;
            if (b2 < 90 * 90 && b2 > 1) { p.x += bx / Math.sqrt(b2) * 30 * h; p.y += by / Math.sqrt(b2) * 30 * h; }
          }
          p.x = clamp(p.x, -40, W + 40); p.y = clamp(p.y, -40, H + 40);
          break;
        }
        case 'fluff': {
          // Very light: it falls at terminal speed (drag balances gravity) and sways like a pendulum
          // x = x0 + A·sin(2πft); the tilt follows the sway velocity. A slow breeze moves x0.
          var sw = Math.sin(p.ph + t * p.freq * TAU), vsw = Math.cos(p.ph + t * p.freq * TAU);
          p.x0 += p.wind * (0.7 + 0.6 * Math.sin(t * 0.23 + p.ph)) * h;
          p.y += p.fall * (0.75 + 0.25 * (1 - sw * sw)) * h;                  // slower at the ends of the sway
          p.x = p.x0 + p.amp * sw;
          p.rot = 0.45 * vsw;
          if (p.y > H + 30 || p.x0 > W + 60) { this._respawn(p, i); continue; }
          break;
        }
        case 'star':
          p.rot += p.spin * h;
          p.y = p.y0;
          a *= 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(p.ph + t * p.tw * 2)) * (0.85 + 0.15 * Math.sin(p.ph * 3 + t * 7.1));
          bobAbs = true;
          break;
        case 'firefly': {
          // Lazy wander (velocity eases to random targets, drag), then a blink: a short bright flash
          // every `per` s (Gaussian envelope), dim glow in between.
          if (r.chance(h * 0.7)) { p.tvx = r.range(-14, 14); p.tvy = r.range(-10, 8); }
          if (p.tvx !== undefined) { p.vx += (p.tvx - p.vx) * 0.8 * h; p.vy += (p.tvy - p.vy) * 0.8 * h; }
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.x < 0.02 * W) p.vx += 20 * h; else if (p.x > 0.98 * W) p.vx -= 20 * h;
          if (p.y < 0.2 * H) p.vy += 20 * h; else if (p.y > 0.97 * H) p.vy -= 20 * h;
          p.blink = (p.blink + h / p.per) % 1;
          var q = (p.blink - 0.5) / 0.09;
          a *= 0.18 + 0.82 * Math.exp(-q * q);
          break;
        }
        default: {                                         // drift: velocity eases to random targets, wraps
          if (r.chance(h * 0.5)) { p.tvx = r.range(-10, 10); p.tvy = r.range(-8, 6); }
          if (p.tvx !== undefined) { p.vx += (p.tvx - p.vx) * h; p.vy += (p.tvy - p.vy) * h; }
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
          if (p.spin) { p.rot += p.spin * h; a *= 0.6 + 0.4 * Math.sin(p.ph + t * p.tw * 3); }
        }
      }
      p.size = sz * (1 + 0.12 * pulse);
      p.alpha = clamp(a * p.fade, 0, 1);
      // beat bob: up to 3 px up. Kinds that set y absolutely get the full offset; integrating kinds get
      // only the change, so the bob never accumulates into their motion.
      var bob = -3 * pulse;
      if (bobAbs) p.y += bob; else p.y += bob - (p.bob || 0);
      p.bob = bob;
    }
    // top up the current floor (gradually during a hand-over), within the budget
    var ems = TODS[this.tod].emitters, amb = this._ambCount();
    for (var e = 0; e < ems.length; e++) {
      var have = 0;
      for (i = 0; i < this.particles.length; i++) { p = this.particles[i]; if (!p.fx && !p.leaving && p.tod === this.tod && p.ei === e) have++; }
      var want = this._count(ems[e]);
      var add = Math.min(want - have, this._mix < 1 ? 1 : want);
      for (var k = 0; k < add && amb < AMB_MAX && this.particles.length < MAX_PARTICLES; k++) {
        var nq = this._spawn(this.tod, e, true);
        nq.fade = 0; amb++;
      }
    }
    this._updateAmbient();
  };

  Weather.prototype._respawn = function (p, i) {
    this.particles.splice(i, 1);
    if (p.leaving || p.tod !== this.tod) return;
    var q = this._spawn(p.tod, p.ei, false);
    q.fade = 0;
  };

  Weather.prototype._ambNow = function () {
    var a = this.ambient;
    return { tint: this._tintArr || null, glow: a.glow };
  };
  Weather.prototype._updateAmbient = function () {
    var to = TODS[this.tod], m = this._mix, from = this._fromAmb || { tint: null, glow: to.glow };
    var t0 = from.tint || (to.tint ? [to.tint[0], to.tint[1], to.tint[2], 0] : null);
    var t1 = to.tint || (t0 ? [t0[0], t0[1], t0[2], 0] : null);
    var tint = null;
    if (t0 && t1) {
      tint = [0, 1, 2, 3].map(function (j) { return t0[j] + (t1[j] - t0[j]) * m; });
      if (tint[3] < 0.004) tint = null;
    }
    this._tintArr = tint;
    this.ambient.tint = tint ? 'rgba(' + Math.round(tint[0]) + ',' + Math.round(tint[1]) + ',' + Math.round(tint[2]) + ',' + tint[3].toFixed(3) + ')' : null;
    this.ambient.glow = from.glow + (to.glow - from.glow) * m;
    // Riverbank light shafts fade in / out with the hand-over
    var k = this.tod === 0 ? (this._prevTod === 0 ? 1 : m) : (this._prevTod === 0 ? 1 - m : 0);
    this.ambient.shafts = k > 0.001 ? this._shafts().map(function (s) { s.alpha *= k; return s; }) : [];
  };

  DD.Weather = Weather;
})(window.DD = window.DD || {});
