/* Zippy's Jungle Boop — ZJB.Weather: ambient biome particles in logical stage px (DESIGN §5, docs/MECHANICS.md)
 *
 *   var wx = new ZJB.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });  // 0 riverbank, 1 bamboo, 2 canopy, 3 ruins (crossfades unless instant)
 *   wx.update(dt);
 *   wx.burst('sparkle', x, y);             // a little star-burst (boops)
 *   draw wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer: 'back'|'front' }
 *     sprite = particle file basename (assets/default/particles/<sprite>.svg); (x, y) = sprite centre;
 *     size = drawn width in px (height keeps the file's aspect); rot = radians, clockwise; layer 'back' = behind the
 *     burrows, 'front' = over the critters (under the HUD).
 *
 * Motion models
 *  riverbank  dragonflies hover (fast tiny buzz around an anchor) then dash to a new anchor on a stiff
 *             critically-damped spring, nose tilted along the dash; a few leaves drift down.
 *  bamboo     leaves fall like pendulums: swing angle θ = A·sin(ωt+φ), the leaf slides along the arc (x = R·sinθ,
 *             y lifts by R(1−cosθ)), rotates with θ plus a slow tumble, and a light wind pushes it sideways.
 *  canopy     butterflies wander (heading = smoothed random walk + soft steering back into the play area), wings
 *             flap by swapping butterfly_0/1 (~7 Hz) with a little bob per beat; a few leaves.
 *  ruins      fireflies glide on slow Lissajous loops around a drifting centre and blink (sharp on, soft fade);
 *             mist puffs slide along the floor (back layer, breathing alpha); spray drops arc out of the waterfall
 *             (WATERFALL x/y) under gravity.
 *  setLevel crossfades: old particles fade out over FADE_OUT s, new ones fade in. Bounded: ≤ CAP (60) particles.
 */
(function (ZJB) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 60, FADE_IN = 0.9, FADE_OUT = 1.0;
  var WATERFALL = { x: 860, y: 170, w: 40 };

  var BIOMES = [
    { key: 'riverbank', counts: { dragonfly: 3, leaf: 4 } },
    { key: 'bamboo', counts: { leaf: 16 } },
    { key: 'canopy', counts: { butterfly: 6, leaf: 6 } },
    { key: 'ruins', counts: { firefly: 16, mist: 4, drop: 8 } }
  ];
  var KINDS = ['dragonfly', 'leaf', 'butterfly', 'firefly', 'mist', 'drop'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new ZJB.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.width = opts.width || 960; this.height = opts.height || 540;
    this.particles = [];
    this.zone = 0; this.time = 0; this.wind = 0;
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;
  Weather.BIOMES = BIOMES;
  Weather.WATERFALL = WATERFALL;

  var P = Weather.prototype;

  P.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    if (opts && opts.instant) {
      this.particles = [];
      this._fill(true);
    } else {
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        if (!p.dying) { p.dying = true; p.fadeT = FADE_OUT; p.fade0 = p.fade; }
      }
      this._fill(false);
    }
  };

  P._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };

  /** top up the current biome's particles (new ones wait while the cap is full of dying ones) */
  P._fill = function (scatter) {
    var counts = BIOMES[this.zone].counts;
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
      case 'leaf':
        p = this._base(kind, 'leaf', r.chance(0.3) ? 'back' : 'front', r.range(18, 30));
        p.cx = r.range(-20, W + 20); p.cy = scatter ? r.range(-40, H) : r.range(-80, -20);
        p.R = r.range(14, 34); p.A = r.range(0.5, 0.95); p.w = r.range(1.4, 2.4); p.ph = r.range(0, TAU);
        p.fall = r.range(24, 42) * (p.layer === 'back' ? 0.75 : 1); p.spin = r.range(-1.2, 1.2); p.tumble = r.range(0, TAU);
        break;
      case 'butterfly':
        p = this._base(kind, 'butterfly_0', 'front', r.range(30, 40));
        p.x = scatter ? r.range(80, W - 80) : (r.chance(0.5) ? -30 : W + 30); p.y = r.range(110, 360);
        p.hd = p.x < 0 ? r.range(-0.4, 0.4) : p.x > W ? M.PI + r.range(-0.4, 0.4) : r.range(0, TAU);
        p.turn = 0; p.speed = r.range(38, 58); p.flapHz = r.range(6, 8); p.ph = r.range(0, TAU);
        break;
      case 'firefly':
        p = this._base(kind, 'firefly', r.chance(0.6) ? 'front' : 'back', r.range(14, 22));
        p.cx = r.range(60, W - 60); p.cy = r.range(110, 470); p.ax = r.range(20, 60); p.ay = r.range(12, 40);
        p.wx = r.range(0.25, 0.55); p.wy = p.wx * r.range(1.3, 2.1); p.px = r.range(0, TAU); p.py = r.range(0, TAU);
        p.dcx = r.range(-6, 6); p.dcy = r.range(-3, 3);
        p.blinkT = r.range(0, 2.5); p.blinkEvery = r.range(1.6, 3.2); p.glow = 0;
        break;
      case 'mist':
        p = this._base(kind, 'mist', 'back', r.range(256, 360));
        p.vx = r.range(8, 18) * (r.chance(0.5) ? 1 : -1); p.y = r.range(445, 515);
        p.x = scatter ? r.range(-100, W + 100) : (p.vx > 0 ? -p.size / 2 : W + p.size / 2);
        p.a0 = r.range(0.32, 0.55); p.ph = r.range(0, TAU); p.flipX = r.chance(0.5);
        break;
      case 'drop':
        p = this._base(kind, 'drop', 'front', r.range(8, 13));
        this._resetDrop(p, scatter);
        break;
    }
    p.fade = scatter ? 1 : 0;
    this._pose(p, 0);
    return p;
  };

  P._resetDrop = function (p, scatter) {
    var r = this.rng;
    p.x = WATERFALL.x + r.range(-WATERFALL.w / 2, WATERFALL.w / 2); p.y = WATERFALL.y + r.range(0, 30);
    p.vx = r.range(-70, 30); p.vy = r.range(-120, -40); p.t = scatter ? r.range(0, 0.6) : 0;
    p.life = r.range(0.7, 1.2);
    if (scatter) { p.x += p.vx * p.t; p.y += p.vy * p.t + 0.5 * 420 * p.t * p.t; p.vy += 420 * p.t; }
  };

  P.burst = function (kind, x, y) {
    var r = this.rng, n = 8;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= CAP) this._evictForBurst();
      if (this.particles.length >= CAP) return;
      var p = this._base('sparkle', 'sparkle', 'front', r.range(14, 24));
      var a = (i / n) * TAU + r.range(-0.25, 0.25), sp = r.range(140, 240);
      p.x = x; p.y = y; p.vx = M.cos(a) * sp; p.vy = M.sin(a) * sp - 40;
      p.life = r.range(0.5, 0.75); p.spin = r.range(-6, 6); p.fade = 1; p.alpha = 1;
      this.particles.push(p);
    }
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

  P.update = function (dt) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
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
  };

  /** advance one particle; return false to remove it (non-dying ones are replaced by _fill) */
  P._move = function (p, dt) {
    var W = this.width, H = this.height, r = this.rng;
    switch (p.kind) {
      case 'dragonfly': {
        if (p.mode === 'hover') {
          p.hoverT -= dt;
          // tiny buzzing hover around the anchor
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
      case 'leaf': {
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
      case 'firefly': {
        p.cx += p.dcx * dt; p.cy += p.dcy * dt;
        if (p.cx < 60 || p.cx > W - 60) p.dcx = -p.dcx;
        if (p.cy < 110 || p.cy > 470) p.dcy = -p.dcy;
        p.x = p.cx + p.ax * M.sin(p.wx * TAU * p.t + p.px);
        p.y = p.cy + p.ay * M.sin(p.wy * TAU * p.t + p.py);
        p.blinkT += dt;
        if (p.blinkT >= p.blinkEvery) { p.blinkT = 0; p.blinkEvery = r.range(1.6, 3.2); }
        var b = p.blinkT;                                   // sharp 0.12 s rise, 0.6 s soft fade
        p.glow = b < 0.12 ? b / 0.12 : M.exp(-(b - 0.12) / 0.35);
        return true;
      }
      case 'mist': {
        p.x += p.vx * dt;
        var half = p.size / 2 + 20;
        if (p.vx > 0 && p.x > W + half) p.x = -half;
        if (p.vx < 0 && p.x < -half) p.x = W + half;
        return true;
      }
      case 'drop': {
        p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t >= p.life || p.y > H) { if (p.dying) return false; this._resetDrop(p, false); }
        return true;
      }
      case 'sparkle': {
        var drag = M.exp(-4 * dt);
        p.vx *= drag; p.vy = p.vy * drag + 160 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        return p.t < p.life;
      }
    }
    return true;
  };

  /** a leaf that left the screen: dying ones go, live ones restart at the top */
  P._recycle = function (p) {
    if (p.dying) return false;
    var r = this.rng;
    p.cy = r.range(-70, -25); p.cx = r.range(-20, this.width + 20) - this.wind * 2;
    p.fall = r.range(24, 42) * (p.layer === 'back' ? 0.75 : 1);
    return true;
  };

  /** derived drawing fields: x/y (for pendulum leaves), rot, flipX, alpha, sprite frame */
  P._pose = function (p, dt) {
    switch (p.kind) {
      case 'dragonfly': {
        if (M.abs(p.vx) > 25) p.flipX = p.vx < 0;
        var tilt = clamp(M.atan2(p.vy, M.abs(p.vx) + 60) * 0.6, -0.5, 0.5) * (p.flipX ? -1 : 1);
        p.rot += (tilt - p.rot) * (1 - M.exp(-12 * (dt || 0.016)));
        p.alpha = p.fade;
        break;
      }
      case 'leaf': {
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
      case 'firefly':
        p.alpha = p.fade * (0.18 + 0.82 * p.glow);
        p.rot = 0;
        break;
      case 'mist':
        p.alpha = p.fade * p.a0 * (0.8 + 0.2 * M.sin(p.t * 0.5 + p.ph));
        break;
      case 'drop':
        p.rot = M.atan2(p.vx, p.vy) * -1;
        p.alpha = p.fade * clamp(1 - p.t / p.life, 0, 1) * 0.85;
        break;
      case 'sparkle':
        p.rot += p.spin * (dt || 0);
        p.alpha = clamp(1 - p.t / p.life, 0, 1);
        break;
    }
  };

  ZJB.Weather = Weather;
})(window.ZJB = window.ZJB || {});
