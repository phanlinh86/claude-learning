/* Pip's Oasis Glow — POG.Weather: ambient chapter particles in logical stage px (DESIGN §5, docs/MECHANICS.md)
 *
 *   var wx = new POG.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });  // 0 spring, 1 palms, 2 dunes, 3 night (crossfades unless instant)
 *   wx.update(dt);
 *   wx.burst('sparkle' | 'gold' | 'ripple', x, y);
 *   draw wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer: 'back'|'front' }
 *     sprite = particle file basename (assets/default/particles/<sprite>.svg); (x, y) = sprite centre;
 *     size = drawn width in px (height keeps the file's aspect); rot = radians, clockwise; layer 'back' = behind the
 *     burrows, 'front' = over the friends (under the HUD).
 *   draw wx.ripples[] { x, y, r, alpha }: water rings, drawn as flat ellipses (rx = r, ry ≈ 0.3·r) by render.
 *
 * Motion models
 *  spring  dragonflies hover (fast tiny buzz around an anchor) then dash to a new anchor on a stiff critically-damped
 *          spring, nose tilted along the dash; lotus petals fall like light pendulums (θ = A·sin(ωt+φ), the petal
 *          slides along the arc and lifts at the ends of each swing) pushed by a gusty wind; rings now and then on the pool.
 *  palms   butterflies wander (heading = smoothed random walk + soft steering back into the play area), wings flap by
 *          swapping butterfly_0/1 (~7 Hz) with a little lift per beat; a few petals.
 *  dunes   sand wisps slide low (back layer) with a breathing alpha; now and then one tumbleweed rolls along the
 *          horizon line without slipping (rot = travelled distance / r) and hops on bumps under gravity, bouncing
 *          a little when it lands (restitution 0.3).
 *  night   ambient fireflies ('glow') glide on lazy Lissajous loops around a drifting centre and blink (sharp on, soft
 *          fade); twinkle stars ('star_tw') in the sky band y < 200; rings now and then on the pool.
 *  setLevel crossfades: old particles fade out over FADE_OUT s, new ones fade in. Bounded: ≤ CAP (60) particles,
 *  ≤ RIPPLE_CAP (12) ripples.
 */
(function (POG) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 60, RIPPLE_CAP = 12, FADE_IN = 0.9, FADE_OUT = 1.0;
  var POOL = { x0: 405, x1: 555, y0: 130, y1: 154 };   // ambient ripples (the spring pool around the lily pad)
  var TUMBLE = { ground: 258, g: 900, rest: 0.3, bumpRate: 0.7, every: [5, 11] };
  var G_SPARK = 160;

  var ZONES = [
    { key: 'spring', counts: { dragonfly: 3, petal: 6 }, ripple: [1.4, 3.2] },
    { key: 'palms', counts: { butterfly: 5, petal: 5 }, ripple: null },
    { key: 'dunes', counts: { sandwisp: 4 }, ripple: null, tumbleweed: true },
    { key: 'night', counts: { glow: 14, star: 8 }, ripple: [2.0, 4.0] }
  ];
  var KINDS = ['dragonfly', 'petal', 'butterfly', 'sandwisp', 'glow', 'star'];
  var SPRITES = [
    ['dragonfly', 'petal'], ['butterfly_0', 'butterfly_1', 'petal'], ['sandwisp', 'tumbleweed'], ['glow', 'star_tw']
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new POG.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.width = opts.width || 960; this.height = opts.height || 540;
    this.particles = []; this.ripples = [];
    this.zone = 0; this.time = 0; this.wind = 0;
    this.rippleT = 1; this.tumbleT = 3;
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;
  Weather.RIPPLE_CAP = RIPPLE_CAP;
  Weather.ZONES = ZONES;
  Weather.SPRITES = SPRITES;
  Weather.POOL = POOL;
  Weather.TUMBLE = TUMBLE;

  var P = Weather.prototype;

  P.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var r = this.rng, z = ZONES[this.zone];
    this.rippleT = z.ripple ? r.range(z.ripple[0], z.ripple[1]) : 0;
    this.tumbleT = r.range(1.5, 4);
    if (opts && opts.instant) {
      this.particles = []; this.ripples = [];
      this._fill(true);
    } else {
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        if (!p.dying && p.kind !== 'sparkle') { p.dying = true; p.fadeT = FADE_OUT; p.fade0 = p.fade; }
      }
      this._fill(false);
    }
  };

  P._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };

  /** top up the current chapter's particles (new ones wait while the cap is full of dying ones) */
  P._fill = function (scatter) {
    var counts = ZONES[this.zone].counts;
    for (var ki = 0; ki < KINDS.length; ki++) {
      var kind = KINDS[ki], want = counts[kind] || 0, have = this._count(kind);
      while (have < want && this.particles.length < CAP) { this.particles.push(this._make(kind, scatter)); have++; }
    }
  };

  P._base = function (kind, sprite, layer, size) {
    return { kind: kind, sprite: sprite, x: 0, y: 0, size: size, rot: 0, flipX: false, alpha: 0, layer: layer,
      fade: 0, dying: false, t: 0, vx: 0, vy: 0 };
  };

  P._make = function (kind, scatter) {
    var r = this.rng, W = this.width, H = this.height, p;
    switch (kind) {
      case 'dragonfly':
        p = this._base(kind, 'dragonfly', 'front', r.range(38, 50));
        p.ax = r.range(120, W - 120); p.ay = r.range(150, 300);
        p.x = scatter ? p.ax : (r.chance(0.5) ? -40 : W + 40); p.y = p.ay;
        p.hoverT = r.range(0.3, 1.5); p.mode = 'dash'; p.ph = r.range(0, TAU);
        break;
      case 'petal':
        p = this._base(kind, 'petal', r.chance(0.3) ? 'back' : 'front', r.range(16, 24));
        p.cx = r.range(-20, W + 20); p.cy = scatter ? r.range(-40, H) : r.range(-80, -20);
        p.R = r.range(14, 30); p.A = r.range(0.5, 0.9); p.w = r.range(1.5, 2.5); p.ph = r.range(0, TAU);
        p.fall = r.range(18, 30) * (p.layer === 'back' ? 0.75 : 1); p.spin = r.range(-1.2, 1.2); p.tumble = r.range(0, TAU);
        break;
      case 'butterfly':
        p = this._base(kind, 'butterfly_0', 'front', r.range(30, 40));
        p.x = scatter ? r.range(80, W - 80) : (r.chance(0.5) ? -30 : W + 30); p.y = r.range(110, 360);
        p.hd = p.x < 0 ? r.range(-0.4, 0.4) : p.x > W ? M.PI + r.range(-0.4, 0.4) : r.range(0, TAU);
        p.turn = 0; p.speed = r.range(38, 58); p.flapHz = r.range(6, 8); p.ph = r.range(0, TAU);
        break;
      case 'sandwisp':
        p = this._base(kind, 'sandwisp', 'back', r.range(240, 340));
        p.vx = r.range(18, 34) * (r.chance(0.65) ? 1 : -1); p.y = r.range(440, 515);
        p.x = scatter ? r.range(-100, W + 100) : (p.vx > 0 ? -p.size / 2 : W + p.size / 2);
        p.a0 = r.range(0.3, 0.5); p.ph = r.range(0, TAU); p.flipX = p.vx < 0;
        break;
      case 'glow':
        p = this._base(kind, 'glow', r.chance(0.6) ? 'front' : 'back', r.range(14, 22));
        p.cx = r.range(60, W - 60); p.cy = r.range(110, 470); p.ax = r.range(20, 60); p.ay = r.range(12, 40);
        p.wx = r.range(0.25, 0.55); p.wy = p.wx * r.range(1.3, 2.1); p.px = r.range(0, TAU); p.py = r.range(0, TAU);
        p.dcx = r.range(-6, 6); p.dcy = r.range(-3, 3);
        p.blinkT = r.range(0, 2.5); p.blinkEvery = r.range(1.6, 3.2); p.glow = 0;
        break;
      case 'star':
        p = this._base(kind, 'star_tw', 'back', r.range(12, 22));
        p.x = r.range(40, W - 40); p.y = r.range(22, 185);
        p.hz = r.range(0.25, 0.6); p.ph = r.range(0, TAU); p.spin = r.range(-0.4, 0.4); p.s0 = p.size;
        break;
      case 'tumbleweed':
        p = this._base(kind, 'tumbleweed', 'back', r.range(30, 40));
        p.r = p.size / 2; p.vx = r.range(70, 110) * (r.chance(0.5) ? 1 : -1);
        p.x0 = p.vx > 0 ? -p.r - 10 : W + p.r + 10; p.x = p.x0;
        p.y = TUMBLE.ground - p.r; p.vy = 0; p.air = false;
        break;
    }
    p.fade = scatter ? 1 : 0;
    this._pose(p, 0);
    return p;
  };

  // ------------------------------------------------------------------ bursts / ripples
  P.burst = function (kind, x, y) {
    if (kind === 'ripple') { this._ripple(x, y, 0, 34, 0.9); this._ripple(x, y, -0.16, 22, 0.7); return; }
    var r = this.rng, gold = kind === 'gold', n = gold ? 12 : 8;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= CAP) this._evictForBurst();
      if (this.particles.length >= CAP) return;
      var star = gold && i % 3 === 0;
      var p = this._base('sparkle', star ? 'star_tw' : 'sparkle', 'front', gold ? r.range(18, 30) : r.range(14, 24));
      var a = (i / n) * TAU + r.range(-0.25, 0.25), sp = gold ? r.range(170, 300) : r.range(140, 240);
      p.x = x; p.y = y; p.vx = M.cos(a) * sp; p.vy = M.sin(a) * sp - 40;
      p.life = gold ? r.range(0.7, 1.0) : r.range(0.5, 0.75); p.spin = r.range(-6, 6); p.fade = 1; p.alpha = 1;
      this.particles.push(p);
    }
  };

  /** a water ring: r eases out to R (r = R·(1 − e^(−t/τ))), alpha fades; t0 < 0 delays it */
  P._ripple = function (x, y, t0, R, a0) {
    if (this.ripples.length >= RIPPLE_CAP) this.ripples.shift();
    var q = { x: x, y: y, r: 0, alpha: 0, t: t0 || 0, R: R, a0: a0, life: 1.3 };
    this._poseRipple(q);
    this.ripples.push(q);
  };
  P._poseRipple = function (q) {
    var t = M.max(0, q.t), tau = q.life / 3;
    q.r = 2 + q.R * (1 - M.exp(-t / tau));
    q.alpha = q.t < 0 ? 0 : q.a0 * M.pow(clamp(1 - t / q.life, 0, 1), 1.5);
  };

  /** make room for a burst: drop the oldest sparkle or a dying particle */
  P._evictForBurst = function () {
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        if ((pass === 0 && p.kind === 'sparkle') || (pass === 1 && p.dying)) { this.particles.splice(i, 1); return; }
      }
    }
  };

  // ------------------------------------------------------------------ update
  P.update = function (dt) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    var r = this.rng, Z = ZONES[this.zone];
    this.time += dt;
    this.wind = 10 * M.sin(this.time * 0.23) + 5 * M.sin(this.time * 0.61 + 1.3);   // px/s gentle gusts
    var out = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.t += dt;
      if (p.dying) { p.fadeT -= dt; p.fade = p.fade0 * M.max(0, p.fadeT / FADE_OUT); if (p.fadeT <= 0) continue; }
      else if (p.fade < 1) p.fade = M.min(1, p.fade + dt / FADE_IN);
      if (!this._move(p, dt)) continue;
      this._pose(p, dt);
      out.push(p);
    }
    this.particles = out;
    this._fill(false);
    // ambient ripples on the pool
    if (Z.ripple) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        this.rippleT = r.range(Z.ripple[0], Z.ripple[1]);
        this._ripple(r.range(POOL.x0, POOL.x1), r.range(POOL.y0, POOL.y1), 0, r.range(14, 26), r.range(0.4, 0.6));
      }
    }
    var rs = [];
    for (var k = 0; k < this.ripples.length; k++) {
      var q = this.ripples[k]; q.t += dt;
      if (q.t >= q.life) continue;
      this._poseRipple(q); rs.push(q);
    }
    this.ripples = rs;
    // an occasional tumbleweed (one at a time)
    if (Z.tumbleweed && this._count('tumbleweed') === 0) {
      this.tumbleT -= dt;
      if (this.tumbleT <= 0 && this.particles.length < CAP) {
        this.particles.push(this._make('tumbleweed', false));
        this.tumbleT = r.range(TUMBLE.every[0], TUMBLE.every[1]);
      }
    }
  };

  /** advance one particle; return false to remove it (non-dying ones are replaced by _fill) */
  P._move = function (p, dt) {
    var W = this.width, H = this.height, r = this.rng;
    switch (p.kind) {
      case 'dragonfly': {
        if (p.mode === 'hover') {
          p.hoverT -= dt;
          var bx = p.ax + 3 * M.sin(p.t * 9 + p.ph), by = p.ay + 2.5 * M.sin(p.t * 13 + p.ph * 2);
          p.vx = (bx - p.x) / dt; p.vy = (by - p.y) / dt; p.x = bx; p.y = by;
          if (p.hoverT <= 0) {
            var a = r.range(0, TAU), d = r.range(90, 230);
            p.ax = clamp(p.ax + M.cos(a) * d, 80, W - 80); p.ay = clamp(p.ay + M.sin(a) * d * 0.5, 140, 320);
            p.mode = 'dash';
          }
        } else {   // critically damped spring toward the anchor, ω = 9 rad/s → ~0.45 s dash
          var w = 9, ex = p.x - p.ax, ey = p.y - p.ay;
          p.vx += (-w * w * ex - 2 * w * p.vx) * dt; p.vy += (-w * w * ey - 2 * w * p.vy) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (ex * ex + ey * ey < 4 && p.vx * p.vx + p.vy * p.vy < 400) { p.mode = 'hover'; p.hoverT = r.range(0.6, 1.8); p.t = 0; }
        }
        return true;
      }
      case 'petal': {
        p.cy += p.fall * dt; p.cx += (this.wind + 6) * dt; p.tumble += p.spin * dt;
        return !(p.cy > H + 40 || p.cx > W + 80 || p.cx < -80) || this._recycle(p);
      }
      case 'butterfly': {
        p.turn += r.range(-1, 1) * 6 * dt; p.turn *= M.exp(-2 * dt);
        var cx = W / 2, cy = 230, dx = cx - p.x, dy = cy - p.y;
        if (M.abs(dx) > W * 0.42 || M.abs(dy) > 140) {     // steer back gently
          var want = M.atan2(dy, dx), diff = M.atan2(M.sin(want - p.hd), M.cos(want - p.hd));
          p.turn += diff * 1.5 * dt;
        }
        p.hd += p.turn * dt * 2;
        var flap = M.sin(p.t * p.flapHz * TAU + p.ph);
        p.vx = M.cos(p.hd) * p.speed; p.vy = M.sin(p.hd) * p.speed * 0.6 - 18 * flap;
        p.x += p.vx * dt; p.y += p.vy * dt;
        return true;
      }
      case 'sandwisp': {
        p.x += (p.vx + this.wind * 0.6) * dt;
        var half = p.size / 2 + 20;
        if (p.vx > 0 && p.x > W + half) p.x = -half;
        if (p.vx < 0 && p.x < -half) p.x = W + half;
        return true;
      }
      case 'glow': {
        p.cx += p.dcx * dt; p.cy += p.dcy * dt;
        if (p.cx < 60 || p.cx > W - 60) p.dcx = -p.dcx;
        if (p.cy < 110 || p.cy > 470) p.dcy = -p.dcy;
        p.x = p.cx + p.ax * M.sin(p.wx * TAU * p.t + p.px);
        p.y = p.cy + p.ay * M.sin(p.wy * TAU * p.t + p.py);
        p.blinkT += dt;
        if (p.blinkT >= p.blinkEvery) { p.blinkT = 0; p.blinkEvery = r.range(1.6, 3.2); }
        var b = p.blinkT;                                   // sharp 0.12 s rise, soft exponential fade
        p.glow = b < 0.12 ? b / 0.12 : M.exp(-(b - 0.12) / 0.35);
        return true;
      }
      case 'star':
        return true;
      case 'tumbleweed': {
        var T = TUMBLE, rest = T.ground - p.r;
        p.x += p.vx * dt;                                  // constant roll speed (wind-driven)
        if (p.air) {
          p.vy += T.g * dt; p.y += p.vy * dt;
          if (p.y >= rest) {                               // touch down: a small bounce, then roll on
            p.y = rest;
            if (p.vy > 70) p.vy = -p.vy * T.rest; else { p.vy = 0; p.air = false; }
          }
        } else if (r.chance(T.bumpRate * dt)) { p.air = true; p.vy = -r.range(90, 170); }
        return p.dying ? p.fade > 0 : (p.vx > 0 ? p.x < W + p.r + 20 : p.x > -p.r - 20);
      }
      case 'sparkle': {
        var drag = M.exp(-4 * dt);
        p.vx *= drag; p.vy = p.vy * drag + G_SPARK * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        return p.t < p.life;
      }
    }
    return true;
  };

  /** a petal that left the screen: dying ones go, live ones restart at the top */
  P._recycle = function (p) {
    if (p.dying) return false;
    var r = this.rng;
    p.cy = r.range(-70, -25); p.cx = r.range(-20, this.width + 20) - this.wind * 2;
    p.fall = r.range(18, 30) * (p.layer === 'back' ? 0.75 : 1);
    return true;
  };

  /** derived drawing fields: x/y (for pendulum petals), rot, flipX, alpha, sprite frame */
  P._pose = function (p, dt) {
    switch (p.kind) {
      case 'dragonfly': {
        if (M.abs(p.vx) > 25) p.flipX = p.vx < 0;
        var tilt = clamp(M.atan2(p.vy, M.abs(p.vx) + 60) * 0.6, -0.5, 0.5) * (p.flipX ? -1 : 1);
        p.rot += (tilt - p.rot) * (1 - M.exp(-12 * (dt || 0.016)));
        p.alpha = p.fade;
        break;
      }
      case 'petal': {
        var th = p.A * M.sin(p.w * p.t + p.ph);
        p.x = p.cx + p.R * M.sin(th);
        p.y = p.cy - p.R * (1 - M.cos(th)) * 0.9;          // lifts at the ends of each swing
        p.rot = th * 1.1 + 0.35 * M.sin(p.tumble);
        p.flipX = M.cos(p.tumble) < 0;
        p.alpha = p.fade * (p.layer === 'back' ? 0.75 : 0.95);
        break;
      }
      case 'butterfly': {
        var ph = (p.t * p.flapHz + p.ph / TAU) % 1;
        p.sprite = ph < 0.5 ? 'butterfly_0' : 'butterfly_1';
        if (M.abs(p.vx) > 5) p.flipX = p.vx < 0;
        p.rot = clamp(p.vy / 400, -0.3, 0.3) * (p.flipX ? -1 : 1);
        p.alpha = p.fade;
        break;
      }
      case 'sandwisp':
        p.alpha = p.fade * p.a0 * (0.75 + 0.25 * M.sin(p.t * 0.6 + p.ph));
        break;
      case 'glow':
        p.alpha = p.fade * (0.18 + 0.82 * p.glow);
        p.rot = 0;
        break;
      case 'star': {
        var s = 0.5 + 0.5 * M.sin(TAU * p.hz * p.t + p.ph), tw = s * s * s;   // mostly dim, brief bright peaks
        p.alpha = p.fade * (0.3 + 0.7 * tw);
        p.size = p.s0 * (0.8 + 0.3 * tw);
        p.rot += p.spin * (dt || 0);
        break;
      }
      case 'tumbleweed':
        p.rot = (p.x - p.x0) / p.r;                         // rolling without slipping
        p.alpha = p.fade;
        break;
      case 'sparkle':
        p.rot += p.spin * (dt || 0);
        p.alpha = clamp(1 - p.t / p.life, 0, 1);
        break;
    }
  };

  POG.Weather = Weather;
})(window.POG = window.POG || {});
