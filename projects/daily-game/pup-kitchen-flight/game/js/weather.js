/* Biscuit's Kitchen Flight — BKF.Weather (headless, deterministic particles; no DOM)
 *
 *   const wx = new BKF.Weather({ width: 960, height: 540, seed });
 *   wx.setLevel(zone, { instant })   // 0 sunny, 1 rainy, 2 windy, 3 snowy (smooth ≈1.5 s hand-over)
 *   wx.update(dt, scrollSpeed)       // px/s of the kitchen scroll
 *   wx.gust('up'|'down') / wx.calm() // forward world gust / gustEnd events
 *   wx.steam(x, y)                   // one soft puff rising from (x, y)
 *   wx.burst(kind, x, y, n)          // 'sparkle' | 'bit' | 'dust'
 *   wx.particles → [{ sprite, x, y, size, rot, flipX, alpha, layer }]   (+ private fields)
 *
 * Coordinates are SCREEN px like BKF.World. `size` = drawn width in px (keep the sprite aspect).
 * Layers: 'outside' (behind the wall, seen through the windows), 'room' (in front of the wall,
 * behind obstacles), 'front' (over everything, sparse). Particles live in x ∈ [−pad, width+pad]
 * (pad = 160) so letterboxed wide screens are covered. Hard cap: 260 particles.
 */
(function (BKF) {
  'use strict';

  var TAU = Math.PI * 2;
  var CAP = 260;
  var PAD = 160;
  var PAR = { outside: 0.08, room: 0.35, front: 1.1 };   // scroll parallax per layer (DESIGN.md §4)

  // ambient emitters per zone: n = steady count, size px, alpha range
  var ZONES = [
    [ // 0 sunny: dust motes in the sunbeams
      { kind: 'mote', sprite: 'dust', layer: 'room', n: 40, size: [4, 9], alpha: [0.35, 0.8], fall: [-4, 6] },
      { kind: 'mote', sprite: 'dust', layer: 'front', n: 3, size: [14, 20], alpha: [0.15, 0.3], fall: [-3, 4] }
    ],
    [ // 1 rainy: slanted streaks outside
      { kind: 'rain', sprite: 'raindrop', layer: 'outside', n: 60, size: [6, 9], alpha: [0.45, 0.75], fall: [520, 680] },
      { kind: 'rain', sprite: 'raindrop', layer: 'outside', n: 24, size: [9, 12], alpha: [0.6, 0.85], fall: [700, 860] }
    ],
    [ // 2 windy: autumn leaves tumbling past outside (streaks only during gusts, see _streaks)
      { kind: 'oleaf', sprite: 'outside_leaf', layer: 'outside', n: 18, size: [12, 20], alpha: [0.85, 1], fall: [30, 60] }
    ],
    [ // 3 snowy: 3 depth layers outside (far = tiny/slow/faint, near = big/faster)
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', n: 42, size: [5, 7], alpha: [0.45, 0.6], fall: [22, 32], depth: 0.2 },
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', n: 26, size: [9, 12], alpha: [0.7, 0.85], fall: [40, 55], depth: 0.55 },
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', n: 12, size: [14, 18], alpha: [0.85, 0.95], fall: [65, 85], depth: 1 }
    ]
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(cur, target, rate, h) { return cur + (target - cur) * (1 - Math.exp(-rate * h)); }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new BKF.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = -1;
    this.windK = 0;          // 0..1 eased gust strength
    this.windDir = 0;        // −1 up, +1 down
    this._windTarget = 0;
    this._streakAcc = 0;
    this.t = 0;
    this.cap = CAP;
    this.setLevel(opts.zone || 0, { instant: true });
  }

  Weather.prototype.setLevel = function (zone, o) {
    zone = ((zone | 0) % 4 + 4) % 4;
    var instant = !!(o && o.instant);
    if (zone === this.zone && !instant) return;
    this.zone = zone;
    var i, p;
    // retire the old ambient particles (fade out), keep transients
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (!p.ambient) continue;
      if (instant) this.particles.splice(i, 1);
      else p.dying = true;
    }
    this.emitters = ZONES[zone].map(function (e) { return { def: e, live: 0, acc: 0 }; });
    if (instant) for (i = 0; i < this.emitters.length; i++) {
      var em = this.emitters[i];
      while (em.live < em.def.n && this._ambient(em, true)) { /* fill */ }
    }
    if (zone !== 2) { this._windTarget = 0; }
  };

  Weather.prototype.gust = function (dir) { this._windTarget = 1; this.windDir = dir === 'up' ? -1 : 1; };
  Weather.prototype.calm = function () { this._windTarget = 0; };

  Weather.prototype._add = function (p) {
    if (this.particles.length >= this.cap) return null;
    if (p.flipX === undefined) p.flipX = 1;
    if (p.rot === undefined) p.rot = 0;
    this.particles.push(p);
    return p;
  };

  /** Spawn one ambient particle for an emitter. anywhere = random position on screen (instant fill). */
  Weather.prototype._ambient = function (em, anywhere) {
    var r = this.rng, d = em.def, W = this.width, H = this.height;
    var p = {
      sprite: d.sprite, layer: d.layer, kind: d.kind, ambient: true, em: em,
      size: r.range(d.size[0], d.size[1]), a0: r.range(d.alpha[0], d.alpha[1]), alpha: 0, fade: anywhere ? 1 : 0,
      x: r.range(-PAD, W + PAD), y: anywhere ? r.range(0, H) : -20, vx: 0, vy: r.range(d.fall[0], d.fall[1]),
      rot: 0, flipX: 1, ph: r.range(0, TAU), spin: r.range(-1, 1), depth: d.depth || 1, dying: false
    };
    if (d.kind === 'mote') { p.y = anywhere ? r.range(60, 450) : r.range(60, 450); p.x = anywhere ? p.x : r.range(-PAD, W + PAD); }
    if (d.kind === 'rain') { p.vx = -0.32 * p.vy; p.rot = Math.atan2(-p.vx, p.vy); if (!anywhere) p.y = r.range(-60, -10); }
    if (d.kind === 'oleaf') { p.vx = -r.range(90, 160); if (!anywhere) { p.x = W + PAD - 1; p.y = r.range(40, 400); } }
    if (!this._add(p)) return null;
    em.live++;
    return p;
  };

  Weather.prototype.steam = function (x, y) {
    var r = this.rng;
    return this._add({ sprite: 'steam', layer: 'room', kind: 'steam', x: x + r.range(-6, 6), y: y, vx: r.range(-8, 8), vy: -r.range(60, 90),
      size: r.range(18, 26), grow: r.range(30, 42), life: 0, maxLife: r.range(1.1, 1.5), a0: r.range(0.55, 0.75), alpha: 0.6,
      rot: r.range(0, TAU), spin: r.range(-0.8, 0.8), par: 1.0 });
  };

  Weather.prototype.burst = function (kind, x, y, n) {
    var r = this.rng, out = 0;
    n = n || 10;
    for (var i = 0; i < n; i++) {
      var ang = r.range(0, TAU), sp;
      var p;
      if (kind === 'sparkle') {
        sp = r.range(80, 220);
        p = { sprite: 'sparkle', layer: 'front', kind: 'sparkle', size: r.range(12, 22), g: 0, drag: 3.5, maxLife: r.range(0.45, 0.75) };
      } else if (kind === 'bit') {
        sp = r.range(60, 180);
        p = { sprite: 'bit', layer: 'front', kind: 'bit', size: r.range(8, 13), g: 380, drag: 1.2, maxLife: r.range(0.6, 0.95) };
      } else {
        sp = r.range(30, 90);
        p = { sprite: 'dust', layer: 'front', kind: 'puff', size: r.range(8, 16), g: -20, drag: 2.5, maxLife: r.range(0.5, 0.8) };
      }
      p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - (kind === 'bit' ? 80 : 0);
      p.life = 0; p.a0 = 1; p.alpha = 1; p.rot = r.range(0, TAU); p.spin = r.range(-6, 6); p.par = 0;
      if (this._add(p)) out++;
    }
    return out;
  };

  Weather.prototype.update = function (dt, scrollSpeed) {
    dt = clamp(+dt || 0, 0, 0.1);
    scrollSpeed = scrollSpeed || 0;
    var r = this.rng, W = this.width, H = this.height, i, p, e;
    this.t += dt;
    this.windK = approach(this.windK, this._windTarget, this._windTarget > this.windK ? 2.2 : 1.4, dt);

    // top up ambient emitters (gradual after a level change)
    for (i = 0; i < this.emitters.length; i++) {
      e = this.emitters[i];
      if (e.live < e.def.n) {
        e.acc += dt * e.def.n / 1.5;                    // refill over ≈1.5 s
        while (e.acc >= 1 && e.live < e.def.n) { e.acc -= 1; if (!this._ambient(e, e.def.kind === 'mote' || e.def.kind === 'snow')) break; }
        if (e.acc > 4) e.acc = 4;
      }
    }
    // wind streaks (zone 2, while gusting)
    if (this.zone === 2 && this.windK > 0.3) {
      this._streakAcc += dt * 10 * this.windK;
      while (this._streakAcc >= 1) {
        this._streakAcc -= 1;
        this._add({ sprite: 'wind', layer: 'room', kind: 'streak', x: W + PAD * 0.5, y: r.range(70, 440),
          vx: -r.range(420, 560), vy: this.windDir * r.range(40, 80), size: r.range(80, 130), life: 0, maxLife: r.range(1.4, 2.0),
          a0: r.range(0.35, 0.6), alpha: 0, rot: 0, par: 0, flipX: 1 });
      }
    } else this._streakAcc = 0;

    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      var par = p.par !== undefined ? p.par : PAR[p.layer];
      var dead = false;
      if (p.ambient) {
        p.ph += dt;
        p.fade = clamp(p.fade + (p.dying ? -dt / 1.0 : dt / 0.8), 0, 1);
        if (p.kind === 'mote') {
          // brownian-ish wander in the sunbeam, slow twinkle
          p.vx = approach(p.vx, Math.sin(p.ph * 0.7 + p.spin * 3) * 10, 0.8, dt);
          p.x += (p.vx - scrollSpeed * par) * dt;
          p.y += (p.vy * 0.3 + Math.sin(p.ph * 0.9 + p.spin) * 6) * dt;
          if (p.y < 50) p.y = 450; else if (p.y > 460) p.y = 60;
          p.alpha = p.a0 * p.fade * (0.75 + 0.25 * Math.sin(p.ph * 2.1 + p.spin * 5));
        } else if (p.kind === 'rain') {
          p.x += (p.vx - scrollSpeed * par) * dt; p.y += p.vy * dt;
          p.alpha = p.a0 * p.fade;
          if (p.y > H + 30) { if (p.dying) dead = true; else { p.y = r.range(-60, -10); p.x = r.range(-PAD, W + PAD); } }
        } else if (p.kind === 'oleaf') {
          // tumbling leaf blown left; faster and higher-tumble in a gust
          var g = this.windK;
          p.x += (p.vx * (1 + 1.6 * g) - scrollSpeed * par) * dt;
          p.y += (p.vy * 0.4 + Math.sin(p.ph * 2.2 + p.spin) * 40 + this.windDir * g * 60) * dt;
          p.rot += (2 + 4 * g) * (p.spin >= 0 ? 1 : -1) * dt;
          p.flipX = Math.cos(p.ph * (2.5 + 2 * g) + p.spin * 3);
          p.alpha = p.a0 * p.fade;
          if (p.y > 470) p.y = 40; else if (p.y < 20) p.y = 450;
          if (p.x < -PAD) { if (p.dying) dead = true; else { p.x = W + PAD; p.y = r.range(40, 420); } }
        } else if (p.kind === 'snow') {
          var sway = Math.sin(p.ph * (0.8 + 0.6 * p.depth) + p.spin * 4) * 14 * p.depth;
          p.x += (sway - 10 * p.depth - scrollSpeed * par * (0.5 + 0.5 * p.depth)) * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * 0.6 * dt;
          p.alpha = p.a0 * p.fade;
          if (p.y > H + 20) { if (p.dying) dead = true; else { p.y = -20; p.x = r.range(-PAD, W + PAD); } }
        }
        if (p.x < -PAD) p.x += W + 2 * PAD; else if (p.x > W + PAD) p.x -= W + 2 * PAD;
        if (p.dying && p.fade <= 0) dead = true;
        if (dead) p.em.live--;
      } else {
        p.life += dt;
        var k = p.life / p.maxLife;
        if (k >= 1) dead = true;
        else if (p.kind === 'steam') {
          p.vy = approach(p.vy, -35, 1.2, dt);
          p.x += (p.vx - scrollSpeed * par) * dt; p.y += p.vy * dt;
          p.size += p.grow * dt; p.rot += p.spin * dt;
          p.alpha = p.a0 * Math.min(1, k * 6) * (1 - k) * (1 - k);
        } else if (p.kind === 'streak') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot = Math.atan(p.vy / p.vx);           // along its motion (sprite is horizontal)
          p.alpha = p.a0 * Math.min(1, k * 5, (1 - k) * 4) * Math.min(1, this.windK * 1.5);
          if (p.x < -PAD) dead = true;
        } else {
          var dr = Math.exp(-p.drag * dt);
          p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          p.alpha = (1 - k) * (k < 0.15 ? k / 0.15 : 1);
          if (p.kind === 'sparkle') p.size *= Math.exp(-0.8 * dt);
        }
      }
      if (dead) this.particles.splice(i, 1);
    }
  };

  Weather.CAP = CAP;
  BKF.Weather = Weather;
})(window.BKF = window.BKF || {});
