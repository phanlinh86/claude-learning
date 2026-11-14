/* Tofu's Volcano Melody — PVM.Weather (seasonal ambience, volcano smoke, footstep dust, bursts). No DOM,
 * deterministic from the seed.
 *
 *   const wx = new PVM.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(season, { instant });        // 0 spring, 1 summer, 2 autumn, 3 winter; old ambience fades out
 *   wx.update(dt);
 *   wx.burst('sparkle' | 'spark' | 'confetti' | 'stars', x, y, n);
 *   wx.smoke(x, y);                          // one volcano puff (also emitted on its own from CRATER)
 *   wx.dust(x, y);                           // a footstep puff (ground layer)
 *   wx.ripple(x, y);                         // (added) a soft ground ring, e.g. where a volcano note lands
 *   wx.autoSmoke = true;                     // (added) steady gentle puffs from PVM.CRATER
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer, color? }]
 *
 * Drawing: translate(x, y) → rotate(rot) → scale(flipX, 1) → draw `particles/<sprite>.svg` centred, `size`
 * px wide (height by the sprite's aspect), globalAlpha = alpha. sprite 'confetti' = a rect size × size·0.6 in
 * `color`. |flipX| ∈ [0.2, 1] (never 0: nothing vanishes edge-on). Layers: 'ground' (under entities: dust,
 * ripples), 'air' (over entities: petals, motes, butterflies, leaves, snow, smoke), 'front' (over everything:
 * bursts). Hard cap CAP = 260; a burst may evict the oldest ambient particle, ambience never evicts.
 *
 * Motion (docs/MECHANICS.md §7):
 *  - petals / leaves: drift at a terminal speed + pendulum sway x = x0 + A·sin(ωt); rotation follows the
 *    swing (rot ∝ cos ωt: tilts most mid-swing, like a falling leaf); flipX = cos(tumble) = 3-D tumble.
 *  - snow: 3 depth layers; farther = smaller, slower, dimmer (parallax), slight sway and spin.
 *  - sun motes: slow drift + twinkle; butterflies: Lissajous wander with flapping (flipX) and facing.
 *  - smoke: rises with buoyancy decaying (drag), wind drift, grows ×2.6, fades in then out.
 *  - dust: tiny outward puff with strong drag, grows, fades in 0.5 s. ripple: grows ×2.2 and fades.
 *  - sparkle/spark/stars: radial bursts with air drag v·e^(−kt); sparks and stars also fall (gravity).
 *  - confetti: launched up, quadratic air drag → flutters down at ~60 px/s, tumbling.
 */
(function (PVM) {
  'use strict';

  var CAP = 260;
  var TAU = Math.PI * 2;
  var CONFETTI = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a06cd5', '#ff8fb1', '#7ed957', '#4ea8ff'];
  var STAR_COLORS = ['#ffe066', '#fff3b0', '#ffd23f'];

  /* Emitters per season: count, size [a,b] px, alpha [a,b], fall [a,b] px/s, sway [a,b] px, wind px/s.
   * Sparse on purpose: the play area must stay readable (≈ 15–40 ambient particles on screen). */
  var SEASONS = [
    [ // spring: blossom petals tumbling
      { kind: 'petal', sprite: 'blossom', count: 16, size: [10, 15], alpha: [0.7, 0.95], fall: [16, 28], sway: [12, 24], wind: 14 }
    ],
    [ // summer: sun motes + 2 butterflies
      { kind: 'mote', sprite: 'sunmote', count: 14, size: [8, 16], alpha: [0.25, 0.6] },
      { kind: 'butterfly', sprite: 'butterfly', count: 2, size: [20, 26], alpha: [0.95, 1] }
    ],
    [ // autumn: leaves, pendulum + tumble
      { kind: 'leaf', sprite: 'leaf', count: 14, size: [12, 18], alpha: [0.8, 0.95], fall: [22, 38], sway: [18, 32], wind: 22 }
    ],
    [ // winter: snow in 3 depth layers (far → near)
      { kind: 'snow', sprite: 'snowflake', count: 18, size: [5, 7], alpha: [0.35, 0.5], fall: [12, 18], sway: [3, 6], wind: 6 },
      { kind: 'snow', sprite: 'snowflake', count: 12, size: [9, 12], alpha: [0.6, 0.75], fall: [22, 32], sway: [5, 9], wind: 9 },
      { kind: 'snow', sprite: 'snowflake', count: 7, size: [14, 18], alpha: [0.8, 0.95], fall: [38, 50], sway: [7, 12], wind: 12 }
    ]
  ];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = PVM.RNG(opts.seed !== undefined ? opts.seed : 5);
    this.cap = CAP;
    this.particles = [];
    this.season = -1;
    this.t = 0;
    this.autoSmoke = opts.autoSmoke !== false;
    this.crater = opts.crater || PVM.CRATER || { x: 480, y: 196 };
    this._smokeT = 0.5;
    this._budget = [];
    this.setLevel(opts.season || 0, { instant: true });
  }

  Weather.SEASONS = SEASONS;
  Weather.CAP = CAP;

  Weather.prototype._add = function (p) {
    if (this.particles.length >= this.cap) {
      if (p.ambient) return null;                                 // ambience waits for room
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
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (!p.ambient) continue;
      if (instant) this.particles.splice(i, 1); else p.fading = true;   // old season fades out over 1.5 s
    }
    var em = SEASONS[season];
    this._budget = em.map(function () { return 0; });
    if (instant) for (var e = 0; e < em.length; e++) for (var n = 0; n < em[e].count; n++) this._spawnAmbient(e, true, true);
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
    var r = this.rng, e = SEASONS[this.season][ei], W = this.width, H = this.height;
    var p = {
      sprite: e.sprite, x: r.range(-20, W + 20), y: 0, size: r.range(e.size[0], e.size[1]), rot: r.range(-Math.PI, Math.PI),
      flipX: 1, alpha: 0, layer: 'air',
      ambient: true, season: this.season, ei: ei, kind: e.kind, fading: false, fade: instant ? 1 : 0,
      a0: r.range(e.alpha[0], e.alpha[1]), age: r.range(0, 10), ph: r.range(0, TAU), x0: 0
    };
    if (e.kind === 'petal' || e.kind === 'leaf' || e.kind === 'snow') {
      p.vy = r.range(e.fall[0], e.fall[1]);
      p.amp = r.range(e.sway[0], e.sway[1]);
      p.w = r.range(0.6, 1.2) * (e.kind === 'leaf' ? 1.3 : 1);   // rad/s sway frequency
      p.wind = e.wind * r.range(0.7, 1.3);
      p.tumble = r.range(1.2, 2.6) * r.sign();
      p.spin = e.kind === 'snow' ? r.range(-0.6, 0.6) : 0;
      p.y = anywhere ? r.range(-10, H) : -p.size - r.range(0, 30);
      p.x0 = p.x;
    } else if (e.kind === 'mote') {
      p.y = r.range(70, H - 30);
      p.vx = r.range(-6, 6); p.vy = r.range(-8, -2);
      p.tw = r.range(0.5, 1.2);
      p.life = r.range(5, 10); p.age = anywhere ? r.range(0, p.life * 0.8) : 0;
      p.twinkle = 1; p.lifeA = 0;
    } else if (e.kind === 'butterfly') {
      p.cx = r.range(0, W); p.cy = r.range(130, H - 90);
      p.speed = r.range(16, 26) * r.sign();
      p.ax = r.range(30, 50); p.ay = r.range(18, 30);
      p.fx = r.range(0.25, 0.4); p.fy = r.range(0.5, 0.8);
      p.flap = r.range(7, 9);
      p.x = p.cx; p.y = p.cy;
    }
    return this._add(p);
  };

  Weather.prototype._stepAmbient = function (p, dt) {
    var W = this.width, H = this.height;
    p.age += dt;
    if (p.kind === 'petal' || p.kind === 'leaf' || p.kind === 'snow') {
      p.y += p.vy * dt;
      p.x0 += p.wind * dt;
      var s = Math.sin(p.w * p.age + p.ph);
      p.x = p.x0 + p.amp * s;
      if (p.kind === 'snow') p.rot += p.spin * dt;
      else p.rot = 0.9 * Math.cos(p.w * p.age + p.ph) + (p.kind === 'leaf' ? 0.4 : 0);
      var fx = Math.cos(p.tumble * p.age + p.ph);
      p.flipX = p.kind === 'snow' ? 1 : (Math.abs(fx) < 0.2 ? (fx < 0 ? -0.2 : 0.2) : fx);
      if (p.x0 < -60) p.x0 += W + 120;
      if (p.x0 > W + 60) p.x0 -= W + 120;
      if (p.y > H + p.size) return false;                         // left the stage → respawn at the top
    } else if (p.kind === 'mote') {
      p.x += (p.vx + 4 * Math.sin(p.age * 0.7 + p.ph)) * dt;
      p.y += p.vy * dt;
      p.twinkle = 0.65 + 0.35 * Math.sin(TAU * p.tw * p.age + p.ph);
      p.lifeA = Math.max(0, Math.min(1, p.age / 1.2, (p.life - p.age) / 1.2));
      if (p.age >= p.life) return false;
    } else if (p.kind === 'butterfly') {
      p.cx += p.speed * dt;
      if (p.cx < -60) p.cx += W + 120;
      if (p.cx > W + 60) p.cx -= W + 120;
      var nx = p.cx + p.ax * Math.sin(TAU * p.fx * p.age + p.ph);
      var ny = p.cy + p.ay * Math.sin(TAU * p.fy * p.age);
      var dir = nx - p.x < 0 ? -1 : 1;
      p.x = nx; p.y = ny;
      p.flipX = dir * (0.25 + 0.75 * Math.abs(Math.cos(TAU * p.flap * p.age * 0.5)));
      p.rot = 0.15 * Math.sin(TAU * p.fy * p.age);
    }
    if (p.fading) p.fade -= dt / 1.5; else if (p.fade < 1) p.fade = Math.min(1, p.fade + dt);
    p.alpha = Math.max(0, p.a0 * (p.kind === 'mote' ? p.twinkle * p.lifeA : 1) * p.fade);
    if (p.fading && p.fade <= 0) return false;
    return true;
  };

  /* ---------------- smoke, dust, ripples ---------------- */
  Weather.prototype.smoke = function (x, y) {
    var r = this.rng;
    this._add({
      sprite: 'smoke', x: x + r.range(-6, 6), y: y, size: r.range(22, 30), rot: r.range(-1, 1), flipX: r.sign(),
      alpha: 0, layer: 'air', fx: 'smoke',
      vx: r.range(-6, 10), vy: r.range(-48, -34), wind: r.range(6, 12), age: 0, life: r.range(2.4, 3.2),
      grow: r.range(2.3, 2.9), spin: r.range(-0.3, 0.3), a0: r.range(0.45, 0.6)
    });
  };

  Weather.prototype.dust = function (x, y) {
    var r = this.rng, n = r.int(1, 2);
    for (var i = 0; i < n; i++) {
      var a = r.range(0, TAU), sp = r.range(14, 30);
      this._add({
        sprite: 'dust', x: x + r.range(-4, 4), y: y + r.range(-2, 2), size: r.range(10, 14), rot: r.range(0, TAU), flipX: 1,
        alpha: 0, layer: 'ground', fx: 'dust', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5,
        age: 0, life: r.range(0.4, 0.55), grow: 1.8, spin: 0, a0: r.range(0.45, 0.6)
      });
    }
  };

  Weather.prototype.ripple = function (x, y) {
    this._add({ sprite: 'ripple', x: x, y: y, size: 30, rot: 0, flipX: 1, alpha: 0, layer: 'ground', fx: 'ripple',
      vx: 0, vy: 0, age: 0, life: 0.6, grow: 2.2, spin: 0, a0: 0.7 });
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
    if (kind === 'stars') {
      // a little fountain of stars: up and out, then they fall back, spinning
      n = n || 8;
      for (i = 0; i < n; i++) {
        a = -Math.PI / 2 + r.range(-1.0, 1.0); sp = r.range(140, 260);
        p = { sprite: 'sparkle', x: x, y: y, size: r.range(12, 18), rot: r.range(0, TAU), flipX: 1, alpha: 1, layer: 'front',
          color: r.pick(STAR_COLORS), fx: 'stars', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: r.range(0.8, 1.1),
          spin: r.range(-6, 6) };
        p.s0 = p.size;
        this._add(p);
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
        spin: r.range(-5, 5) };
      p.s0 = p.size;
      this._add(p);
    }
  };

  Weather.prototype._stepFx = function (p, dt) {
    p.age += dt;
    var k = p.age / p.life;
    if (k >= 1) return false;
    if (!p.s0) p.s0 = p.size;
    if (p.fx === 'smoke') {
      var drag = Math.exp(-0.7 * dt);                              // buoyant rise slows as the puff mixes
      p.vx = p.vx * drag + p.wind * (1 - drag); p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size = p.s0 * (1 + (p.grow - 1) * Math.sqrt(k));
      p.rot += p.spin * dt;
      p.alpha = p.a0 * Math.min(1, k / 0.15) * (1 - k);
    } else if (p.fx === 'dust' || p.fx === 'ripple') {
      var dd = Math.exp(-6 * dt);
      p.vx *= dd; p.vy *= dd;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size = p.s0 * (1 + (p.grow - 1) * Math.sqrt(k));
      p.alpha = p.a0 * Math.min(1, k / 0.12) * (1 - k);
    } else if (p.fx === 'confetti') {
      var g = 520, cd = 0.0045, v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);   // gravity + quadratic drag
      p.vx += (-cd * v * p.vx) * dt;
      p.vy += (g - cd * v * p.vy) * dt;
      if (p.vy > 60) p.vy += (60 - p.vy) * Math.min(1, 6 * dt);             // terminal flutter speed
      p.x += (p.vx + 30 * Math.sin(p.tumble * 0.5 * p.age + p.ph)) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var fx = Math.cos(p.tumble * p.age + p.ph);
      p.flipX = Math.abs(fx) < 0.2 ? (fx < 0 ? -0.2 : 0.2) : fx;
      p.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      if (p.y > this.height + 20) return false;
    } else {
      var dr = Math.exp(-(p.fx === 'spark' ? 3.2 : p.fx === 'stars' ? 1.6 : 4.5) * dt);
      p.vx *= dr; p.vy *= dr;
      if (p.fx === 'spark') p.vy += 600 * dt;
      if (p.fx === 'stars') p.vy += 420 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.fx === 'sparkle' || p.fx === 'stars') p.size = p.s0 * (k < 0.2 ? 0.6 + 2 * k : 1 - 0.6 * (k - 0.2) / 0.8);
      p.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
    return true;
  };

  /* ---------------- update ---------------- */
  Weather.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;                                       // tab-out: no huge jumps
    this.t += dt;
    var i, ps = this.particles;
    for (i = ps.length - 1; i >= 0; i--) {
      var p = ps[i], keep = p.ambient ? this._stepAmbient(p, dt) : this._stepFx(p, dt);
      if (!keep) ps.splice(i, 1);
    }
    // keep each emitter at its count, trickling in (at most count/2 per second)
    var em = SEASONS[this.season];
    for (i = 0; i < em.length; i++) {
      var missing = em[i].count - this._count(i);
      if (missing <= 0) { this._budget[i] = 0; continue; }
      this._budget[i] += dt * Math.max(1, em[i].count / 2);
      while (this._budget[i] >= 1 && missing > 0) {
        this._budget[i] -= 1; missing--;
        var anywhere = em[i].kind === 'mote' || em[i].kind === 'butterfly';
        if (!this._spawnAmbient(i, anywhere, false)) { this._budget[i] = 0; break; }
      }
    }
    // steady gentle smoke from the crater
    if (this.autoSmoke) {
      this._smokeT -= dt;
      if (this._smokeT <= 0) { this.smoke(this.crater.x, this.crater.y); this._smokeT = this.rng.range(1.4, 2.4); }
    }
  };

  PVM.Weather = Weather;
})(window.PVM = window.PVM || {});
