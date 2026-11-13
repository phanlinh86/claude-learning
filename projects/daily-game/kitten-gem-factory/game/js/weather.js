/* Comet's Gem Factory — CGF.Weather (seasonal ambience, steam, bursts). Deterministic from the seed, no DOM.
 *
 *   const wx = new CGF.Weather({ width: 960, height: 540, seed: 7 });
 *   wx.setLevel(season, { instant: true });   // 0 spring, 1 summer, 2 autumn, 3 winter
 *   wx.setVents([{ x, y }, …]);               // (added) steam vent positions, stage px
 *   wx.update(dt);
 *   wx.burst('sparkle' | 'spark' | 'confetti', x, y, n);
 *   wx.steam(x, y);                           // one puff cluster
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer, color? }]
 *
 * Drawing: translate(x, y) → rotate(rot) → scale(flipX, 1) → draw `particles/<sprite>.svg` centred at
 * `size` px wide (height by the sprite's aspect), globalAlpha = alpha. sprite 'confetti' = a rect
 * size × size·0.6 in `color`. |flipX| ∈ [0.2, 1] (never 0, so nothing vanishes edge-on).
 * layer: 'outside' (behind the wall, seen through the windows), 'room' (in front of the wall, behind
 * the board), 'front' (over everything). Hard cap: CAP particles.
 *
 * Motion (see docs/MECHANICS.md §7):
 *  - petals / leaves: fall at a terminal speed + pendulum sway  x = x0 + A·sin(ωt), the rotation follows
 *    the swing (rot ∝ cos ωt, i.e. it tilts most at the middle of the swing, like a real falling leaf) and
 *    flipX = cos(tumble) gives the 3-D tumble.
 *  - snow: 3 depth layers; farther = smaller, slower, dimmer (parallax), slight sway.
 *  - sun motes: slow drift + alpha twinkle; butterflies: wander on a Lissajous path, flapping (flipX).
 *  - steam: rises with buoyancy decaying (drag), grows ×2.5, fades out.
 *  - sparkle/spark: radial burst with air drag (v·e^(−kt)); sparks also fall (gravity).
 *  - confetti: launched up, quadratic air drag → flutters down at ~60 px/s, tumbling (flipX).
 */
(function (CGF) {
  'use strict';

  var CAP = 260;
  var TAU = Math.PI * 2;
  var OUT_Y1 = 320;          // outside particles live above this (windows are y ≈ 96–300)
  var FLOOR = 478;
  var CONFETTI = ['#ff7a59', '#ffd23f', '#4ecdc4', '#a06cd5', '#ff5d8f', '#7ed957', '#4ea8ff'];

  /* Emitters per season: kind, layer, count, size [a,b], alpha [a,b], fall [a,b] px/s, sway amp px. */
  var SEASONS = [
    [ // spring
      { kind: 'petal', sprite: 'blossom', layer: 'outside', count: 34, size: [8, 13], alpha: [0.75, 1], fall: [18, 32], sway: [10, 22], wind: -14 },
      { kind: 'petal', sprite: 'blossom', layer: 'room', count: 7, size: [12, 17], alpha: [0.8, 1], fall: [22, 36], sway: [14, 26], wind: -8 }
    ],
    [ // summer
      { kind: 'mote', sprite: 'sunmote', layer: 'room', count: 24, size: [8, 16], alpha: [0.25, 0.75] },
      { kind: 'mote', sprite: 'sunmote', layer: 'outside', count: 10, size: [6, 11], alpha: [0.3, 0.7] },
      { kind: 'butterfly', sprite: 'butterfly', layer: 'outside', count: 2, size: [18, 24], alpha: [0.95, 1] }
    ],
    [ // autumn
      { kind: 'leaf', sprite: 'leaf', layer: 'outside', count: 28, size: [11, 17], alpha: [0.85, 1], fall: [24, 42], sway: [18, 34], wind: -26 },
      { kind: 'leaf', sprite: 'leaf', layer: 'room', count: 4, size: [15, 20], alpha: [0.9, 1], fall: [30, 44], sway: [20, 34], wind: -12 }
    ],
    [ // winter — snow in 3 depth layers
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', count: 36, size: [4, 6], alpha: [0.45, 0.6], fall: [12, 20], sway: [3, 6], wind: -6 },
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', count: 24, size: [8, 11], alpha: [0.7, 0.85], fall: [24, 34], sway: [5, 9], wind: -9 },
      { kind: 'snow', sprite: 'snowflake', layer: 'outside', count: 12, size: [13, 17], alpha: [0.9, 1], fall: [40, 54], sway: [7, 12], wind: -12 }
    ]
  ];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = CGF.RNG(opts.seed !== undefined ? opts.seed : 5);
    this.cap = CAP;
    this.particles = [];
    this.season = -1;
    this.t = 0;
    this.vents = [];
    this.setVents(opts.vents || [{ x: 330, y: 90 }, { x: 790, y: 90 }]);
    this._spawnBudget = [];
    this.setLevel(opts.season || 0, { instant: true });
  }

  Weather.SEASONS = SEASONS;
  Weather.CAP = CAP;

  Weather.prototype.setVents = function (list) {
    var r = this.rng;
    this.vents = (list || []).map(function (v) { return { x: v.x, y: v.y, t: r.range(0.5, 2.5) }; });
  };

  Weather.prototype._add = function (p) {
    if (this.particles.length >= this.cap) {
      if (p.layer !== 'front') return null;                      // ambience just waits for room
      // a burst evicts the oldest ambient particle (bursts are what the player is looking at)
      var idx = -1;
      for (var i = 0; i < this.particles.length; i++) if (this.particles[i].ambient) { idx = i; break; }
      if (idx < 0) return null;
      this.particles.splice(idx, 1);
    }
    if (p.flipX === undefined) p.flipX = 1;
    if (p.rot === undefined) p.rot = 0;
    this.particles.push(p);
    return p;
  };

  /* ---------------- seasons ---------------- */
  Weather.prototype.setLevel = function (season, opts) {
    season = ((season | 0) % 4 + 4) % 4;
    var instant = !!(opts && opts.instant);
    if (season === this.season && !instant) return;
    this.season = season;
    var i, p;
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (!p.ambient) continue;
      if (instant) this.particles.splice(i, 1); else p.fading = true;   // old season fades out over ~1.5 s
    }
    var em = SEASONS[season];
    this._spawnBudget = em.map(function () { return 0; });
    if (instant) for (i = 0; i < em.length; i++) for (var n = 0; n < em[i].count; n++) this._spawnAmbient(i, true, true);
  };

  Weather.prototype._count = function (ei) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.ambient && !p.fading && p.season === this.season && p.ei === ei) n++;
    }
    return n;
  };

  Weather.prototype._spawnAmbient = function (ei, anywhere, instant) {
    var r = this.rng, e = SEASONS[this.season][ei], W = this.width;
    var yMax = e.layer === 'outside' ? OUT_Y1 : FLOOR;
    var size = r.range(e.size[0], e.size[1]);
    var p = {
      sprite: e.sprite, x: r.range(-20, W + 20), y: 0, size: size, rot: r.range(-Math.PI, Math.PI), flipX: 1,
      alpha: 0, layer: e.layer,
      ambient: true, season: this.season, ei: ei, kind: e.kind, fading: false, fade: instant ? 1 : 0,
      a0: r.range(e.alpha[0], e.alpha[1]), age: r.range(0, 10), ph: r.range(0, TAU), x0: 0, yMax: yMax
    };
    if (e.kind === 'petal' || e.kind === 'leaf' || e.kind === 'snow') {
      p.vy = r.range(e.fall[0], e.fall[1]);
      p.amp = r.range(e.sway[0], e.sway[1]);
      p.w = r.range(0.6, 1.2) * (e.kind === 'leaf' ? 1.3 : 1);    // rad/s, sway frequency
      p.wind = e.wind * r.range(0.7, 1.3);
      p.tumble = r.range(1.2, 2.6) * r.sign();
      p.spin = e.kind === 'snow' ? r.range(-0.6, 0.6) : 0;
      p.y = anywhere ? r.range(-10, yMax) : -size - r.range(0, 30);
      p.x0 = p.x;
    } else if (e.kind === 'mote') {
      p.y = anywhere ? r.range(80, yMax - 20) : r.range(80, yMax - 20);
      p.vx = r.range(-6, 6); p.vy = r.range(-8, -2);
      p.tw = r.range(0.5, 1.2);                                   // twinkle Hz
      p.life = r.range(5, 10); if (anywhere) p.age = r.range(0, p.life * 0.8); else p.age = 0;
    } else if (e.kind === 'butterfly') {
      p.cx = r.range(0, W); p.cy = r.range(150, 260);
      p.speed = r.range(16, 26) * r.sign();
      p.ax = r.range(30, 50); p.ay = r.range(18, 30);
      p.fx = r.range(0.25, 0.4); p.fy = r.range(0.5, 0.8);
      p.flap = r.range(7, 9);
      p.x = p.cx; p.y = p.cy;
    }
    return this._add(p);
  };

  Weather.prototype._stepAmbient = function (p, dt) {
    var W = this.width;
    p.age += dt;
    if (p.kind === 'petal' || p.kind === 'leaf' || p.kind === 'snow') {
      p.y += p.vy * dt;
      p.x0 += p.wind * dt;
      var s = Math.sin(p.w * p.age + p.ph);
      p.x = p.x0 + p.amp * s;
      if (p.kind === 'snow') p.rot += p.spin * dt;
      else p.rot = 0.9 * Math.cos(p.w * p.age + p.ph) + (p.kind === 'leaf' ? 0.4 : 0);   // tilts with the swing
      var fx = Math.cos(p.tumble * p.age + p.ph);
      p.flipX = p.kind === 'snow' ? 1 : (Math.abs(fx) < 0.2 ? (fx < 0 ? -0.2 : 0.2) : fx);
      if (p.x0 < -60) p.x0 += W + 120;
      if (p.x0 > W + 60) p.x0 -= W + 120;
      if (p.y > p.yMax + p.size) return false;              // fell out of its band → respawn at the top
    } else if (p.kind === 'mote') {
      p.x += (p.vx + 4 * Math.sin(p.age * 0.7 + p.ph)) * dt;
      p.y += p.vy * dt;
      var lifeA = Math.min(1, p.age / 1.2, (p.life - p.age) / 1.2);
      p.twinkle = 0.65 + 0.35 * Math.sin(TAU * p.tw * p.age + p.ph);
      p.lifeA = Math.max(0, lifeA);
      if (p.age >= p.life) return false;
    } else if (p.kind === 'butterfly') {
      p.cx += p.speed * dt;
      if (p.cx < -60) p.cx += W + 120;
      if (p.cx > W + 60) p.cx -= W + 120;
      var nx = p.cx + p.ax * Math.sin(TAU * p.fx * p.age + p.ph);
      var ny = p.cy + p.ay * Math.sin(TAU * p.fy * p.age);
      var dx = nx - p.x;
      p.x = nx; p.y = ny;
      var dir = dx < 0 ? -1 : 1;
      var flap = 0.25 + 0.75 * Math.abs(Math.cos(TAU * p.flap * p.age * 0.5));
      p.flipX = dir * flap;                                 // wings open/close + face the way it flies
      p.rot = 0.15 * Math.sin(TAU * p.fy * p.age);
    }
    // alpha: fade in on spawn, fade out on season change
    if (p.fading) p.fade -= dt / 1.5; else if (p.fade < 1) p.fade = Math.min(1, p.fade + dt / 1.0);
    var base = p.a0 * (p.kind === 'mote' ? p.twinkle * p.lifeA : 1);
    p.alpha = Math.max(0, base * p.fade);
    if (p.fading && p.fade <= 0) return false;
    return true;
  };

  /* ---------------- steam ---------------- */
  Weather.prototype.steam = function (x, y) {
    var r = this.rng, n = r.int(3, 4);
    for (var i = 0; i < n; i++) {
      this._add({
        sprite: 'steam', x: x + r.range(-6, 6), y: y - i * 4, size: r.range(16, 22), rot: r.range(-1, 1), flipX: r.sign(),
        alpha: 0, layer: 'room', fx: 'steam',
        vx: r.range(-8, 8), vy: r.range(-60, -40), age: -i * 0.12, life: r.range(1.8, 2.6), s0: 0, grow: r.range(2.2, 2.8),
        spin: r.range(-0.4, 0.4), a0: r.range(0.45, 0.6)
      });
    }
  };

  /* ---------------- bursts ---------------- */
  Weather.prototype.burst = function (kind, x, y, n) {
    var r = this.rng, i, a, sp, p;
    if (kind === 'confetti') {
      n = n || 70;
      for (i = 0; i < n; i++) {
        a = -Math.PI / 2 + r.range(-1.1, 1.1); sp = r.range(260, 560);
        this._add({ sprite: 'confetti', x: x + r.range(-10, 10), y: y, size: r.range(8, 12), rot: r.range(0, TAU), flipX: 1,
          alpha: 1, layer: 'front', color: r.pick(CONFETTI), fx: 'confetti',
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: r.range(2.4, 3.2),
          spin: r.range(-6, 6), tumble: r.range(5, 10), ph: r.range(0, TAU) });
      }
      return;
    }
    var spark = kind === 'spark';
    n = n || (spark ? 14 : 10);
    for (i = 0; i < n; i++) {
      a = (i / n) * TAU + r.range(-0.3, 0.3);
      sp = spark ? r.range(150, 380) : r.range(80, 220);
      p = { sprite: spark ? 'spark' : 'sparkle', x: x, y: y, size: spark ? r.range(6, 10) : r.range(14, 26),
        rot: r.range(0, TAU), flipX: 1, alpha: 1, layer: 'front', fx: spark ? 'spark' : 'sparkle',
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: spark ? r.range(0.45, 0.75) : r.range(0.55, 0.9),
        spin: r.range(-5, 5), s0: 0 };
      p.s0 = p.size;
      this._add(p);
    }
  };

  Weather.prototype._stepFx = function (p, dt) {
    p.age += dt;
    if (p.age < 0) { p.alpha = 0; return true; }
    var k = p.age / p.life;
    if (k >= 1) return false;
    if (p.fx === 'steam') {
      var drag = Math.exp(-0.9 * dt);                       // buoyant rise slows down as the puff mixes
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.s0) p.s0 = p.size;
      p.size = p.s0 * (1 + (p.grow - 1) * Math.sqrt(k));
      p.rot += p.spin * dt;
      p.alpha = p.a0 * Math.min(1, k / 0.15) * (1 - k);
    } else if (p.fx === 'confetti') {
      // gravity + quadratic drag (terminal speed ≈ 60 px/s) + sideways flutter
      var g = 520, cd = 0.0045;
      var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.vx += (-cd * v * p.vx) * dt;
      p.vy += (g - cd * v * p.vy) * dt;
      if (p.vy > 60) p.vy += (60 - p.vy) * Math.min(1, 6 * dt);
      p.x += (p.vx + 30 * Math.sin(p.tumble * 0.5 * p.age + p.ph)) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var fx = Math.cos(p.tumble * p.age + p.ph);
      p.flipX = Math.abs(fx) < 0.2 ? (fx < 0 ? -0.2 : 0.2) : fx;
      p.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      if (p.y > this.height + 20) return false;
    } else {
      var dr = Math.exp(-(p.fx === 'spark' ? 3.2 : 4.5) * dt);
      p.vx *= dr; p.vy *= dr;
      if (p.fx === 'spark') p.vy += 600 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.fx === 'sparkle') p.size = p.s0 * (k < 0.2 ? 0.6 + 2 * k : 1 - 0.6 * (k - 0.2) / 0.8);
      p.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
    return true;
  };

  /* ---------------- update ---------------- */
  Weather.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;                                  // tab-out: no huge jumps
    this.t += dt;
    var i, ps = this.particles;
    for (i = ps.length - 1; i >= 0; i--) {
      var p = ps[i], keep = p.ambient ? this._stepAmbient(p, dt) : this._stepFx(p, dt);
      if (!keep) ps.splice(i, 1);
    }
    // keep each emitter at its count (trickle in: at most count/2 per second)
    var em = SEASONS[this.season];
    for (i = 0; i < em.length; i++) {
      var missing = em[i].count - this._count(i);
      if (missing <= 0) { this._spawnBudget[i] = 0; continue; }
      this._spawnBudget[i] += dt * Math.max(1, em[i].count / 2);
      while (this._spawnBudget[i] >= 1 && missing > 0) {
        this._spawnBudget[i] -= 1; missing--;
        if (!this._spawnAmbient(i, em[i].kind === 'mote' || em[i].kind === 'butterfly')) { this._spawnBudget[i] = 0; break; }
      }
    }
    // vents
    for (i = 0; i < this.vents.length; i++) {
      var v = this.vents[i];
      v.t -= dt;
      if (v.t <= 0) { this.steam(v.x, v.y); v.t = this.rng.range(2.6, 4.6); }
    }
  };

  CGF.Weather = Weather;
})(window.CGF = window.CGF || {});
