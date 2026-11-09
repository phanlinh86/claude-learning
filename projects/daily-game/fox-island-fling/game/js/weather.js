/* Finn's Island Fling — FIF.Weather: screen-space ambient particles per island + bursts (DESIGN §5)
 *
 *   var wx = new FIF.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });   // 0 cove, 1 jungle, 2 lagoon, 3 lantern (old ones fade out unless instant)
 *   wx.resize(w, h);  wx.setHorizon(seaPx); // seaPx = screen y of the sea surface (default 0.78·h)
 *   wx.setLight(world.light);               // every frame: night adds stars + fireflies
 *   wx.update(dt);
 *   wx.burst('splash' | 'leaf' | 'land' | 'bump' | 'flutter', x, y, n);   // logical screen px
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', flap}
 *     — `sprite` = 'p_<particle file>' (assets/default/particles/<name>.svg), `size` = drawn width in px (square
 *       sprites), `rot` radians (canvas convention, clockwise), `flap` (butterflies, 0..1) = wing opening the
 *       renderer may use to squash x. layer 'sky' = behind the far islands, 'back' = behind the fox, 'front' = over.
 *
 * Ambient: Sunny Cove → glints twinkling on the sea; Jungle Isle → butterflies on noisy flutter paths + petals
 * falling like little pendulums; Coral Lagoon → bubbles wobbling up to the surface and popping + glints;
 * Lantern Bay → fireflies. At night (light < 0.6, faded in with darkness) every island adds twinkling stars
 * (layer 'sky', upper sky only) and fireflies.
 * Bursts: splash = drops on gravity arcs (rot follows velocity) + an expanding, fading ripple on the water line;
 * leaf = sparkles + leaf bits that tumble and sway down; land = puffs that grow, slow down and fade; bump = little
 * stars spinning outward; flutter = small puffs behind the fox.
 * Sizes scale with the screen (k = min(W, H)/540, ≤ 0.5 u). Bounded: ambient ≤ CAP − RESERVE, everything ≤ CAP = 160.
 */
(function (FIF) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 160, RESERVE = 40;

  // ambient counts at 960×540 (× areaK)
  var ZONES = [
    { key: 'cove',    counts: { glint: 16 } },
    { key: 'jungle',  counts: { butterfly: 5, petal: 12 } },
    { key: 'lagoon',  counts: { bubble: 14, glint: 8 } },
    { key: 'lantern', counts: { firefly: 14, glint: 4 } }
  ];
  var NIGHT = { star: 46, firefly: 10 };
  var KINDS = ['glint', 'butterfly', 'petal', 'bubble', 'firefly', 'star'];
  var SPRITE = { glint: 'p_sparkle', butterfly: 'p_butterfly', petal: 'p_petal', bubble: 'p_bubble', firefly: 'p_firefly',
    star: 'p_star', drop: 'p_drop', ripple: 'p_ripple', sparkle: 'p_sparkle', leafbit: 'p_leafbit', puff: 'p_puff', glow: 'p_glow' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new FIF.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.light = 1;
    this.seaY = null;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width || w, oldH = this.height || h;
    this.width = M.max(1, w); this.height = M.max(1, h);
    this.k = clamp(M.min(this.width, this.height) / 540, 0.6, 1.8);
    this.areaK = clamp(M.sqrt((this.width * this.height) / (960 * 540)), 0.7, 1.4);
    if (quiet) return;
    var kx = this.width / oldW, ky = this.height / oldH;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x *= kx; p.y *= ky; if (p.x0 !== undefined) p.x0 *= kx; if (p.y0 !== undefined) p.y0 *= ky;
    }
    this._trim(); this._topUp(true);
  };
  Weather.prototype.setHorizon = function (seaPx) { this.seaY = +seaPx || null; };
  Weather.prototype._sea = function () { return this.seaY !== null ? this.seaY : this.height * 0.78; };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var instant = !!(opts && opts.instant);
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.burst || p.kind === 'star') continue;                       // stars belong to the night, not the island
      if (instant) this.particles.splice(i, 1); else p.dying = true;   // crossfade: old ones fade out
    }
    this._topUp(true);
  };
  Weather.prototype.setLight = function (light) { this.light = clamp(+light, 0, 1); };
  Weather.prototype.nightK = function () { return clamp((0.6 - this.light) / 0.25, 0, 1); };

  Weather.prototype._want = function (kind) {
    var n = (ZONES[this.zone].counts[kind] || 0), nk = this.nightK();
    if (kind === 'glint') n *= 1 - 0.7 * nk;                          // fewer sun glints on a dark sea
    if (kind === 'butterfly' || kind === 'petal') n *= 1 - 0.6 * nk;   // butterflies go to sleep
    n += (NIGHT[kind] || 0) * nk;
    return M.round(n * this.areaK);
  };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying && !p.burst) n++; }
    return n;
  };
  Weather.prototype._trim = function () {
    for (var k = 0; k < KINDS.length; k++) {
      var extra = this._count(KINDS[k]) - this._want(KINDS[k]);
      for (var i = this.particles.length - 1; i >= 0 && extra > 0; i--) {
        var p = this.particles[i];
        if (p.kind === KINDS[k] && !p.dying && !p.burst) { p.dying = true; extra--; }
      }
    }
  };
  Weather.prototype._ambientCount = function () {
    var n = 0; for (var i = 0; i < this.particles.length; i++) if (!this.particles[i].burst) n++; return n;
  };
  Weather.prototype._topUp = function (anywhere) {
    var amb = this._ambientCount();
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && amb < CAP - RESERVE && this.particles.length < CAP; i++) { this._spawn(kind, anywhere); amb++; }
    }
  };

  Weather.prototype._base = function (kind, x, y, size, layer) {
    return { kind: kind, sprite: SPRITE[kind], x: x, y: y, x0: x, y0: y, size: size, rot: 0, flipX: false, alpha: 0,
      a: 1, layer: layer, vx: 0, vy: 0, age: 0, life: 0, fade: 0, dying: false, burst: false, ph: this.rng.range(0, TAU), flap: 0 };
  };

  Weather.prototype._spawn = function (kind, anywhere) {
    var r = this.rng, W = this.width, H = this.height, k = this.k, sea = this._sea(), p;
    if (kind === 'glint') {                                              // twinkles in place on the sea surface band
      p = this._base(kind, r.range(0, W), sea + r.range(0.01, 0.16) * H, r.range(7, 13) * k, 'back');
      p.life = r.range(1.2, 2.6); p.age = anywhere ? r.range(0, p.life) : 0; p.a = r.range(0.5, 0.85);
    } else if (kind === 'butterfly') {                                   // noisy flutter path across the sky
      var dir = r.sign();
      p = this._base(kind, anywhere ? r.range(0, W) : (dir > 0 ? -20 : W + 20), r.range(0.15, 0.55) * H, r.range(16, 22) * k, r.chance(0.3) ? 'front' : 'back');
      p.vx = dir * r.range(22, 38) * k; p.flipX = dir < 0; p.a = 0.9;
      p.f1 = r.range(0.35, 0.6); p.f2 = r.range(0.9, 1.4); p.amp = r.range(18, 34) * k; p.flapRate = r.range(7, 10);
    } else if (kind === 'petal') {                                       // falls slowly and swings like a pendulum
      p = this._base(kind, r.range(0, W), anywhere ? r.range(0, sea) : -12, r.range(9, 14) * k, r.chance(0.3) ? 'front' : 'back');
      p.vy = r.range(18, 30) * k; p.vx = r.range(4, 12) * k; p.swing = r.range(14, 26) * k; p.w = r.range(1.6, 2.4); p.a = 0.85;
    } else if (kind === 'bubble') {                                      // under the surface, wobbling upward
      p = this._base(kind, r.range(0, W), anywhere ? r.range(sea + 10, H) : H + 10, r.range(6, 12) * k, 'back');
      p.vy = -r.range(18, 34) * k; p.wob = r.range(4, 8) * k; p.w = r.range(3, 5); p.a = 0.7;
    } else if (kind === 'firefly') {                                     // slow wander + glow pulse
      p = this._base(kind, r.range(0, W), r.range(0.2, 0.75) * H, r.range(9, 13) * k, r.chance(0.35) ? 'front' : 'back');
      p.ax = r.range(25, 55) * k; p.ay = r.range(15, 35) * k; p.f1 = r.range(0.12, 0.25); p.f2 = r.range(0.17, 0.33); p.a = 0.95;
      p.pulse = r.range(1.2, 2.2);
    } else if (kind === 'star') {                                        // upper sky only, twinkling
      p = this._base(kind, r.range(0, W), r.range(0.02, 0.42) * M.min(sea, H), r.range(6, 12) * k, 'sky');
      p.tw = r.range(1.5, 3.5); p.a = r.range(0.55, 1); p.rot = r.range(0, TAU);
    }
    p.fade = anywhere ? 0.6 : 0;
    p.alpha = 0;
    this.particles.push(p);
    return p;
  };

  /** burst: kind 'splash' | 'leaf' | 'land' | 'bump' | 'flutter' at screen (x, y), n ≈ count of the main sprite */
  Weather.prototype.burst = function (kind, x, y, n) {
    var r = this.rng, k = this.k, i, p, a, s;
    var room = function (self) { return self.particles.length < CAP; };
    n = n === undefined ? 8 : M.max(0, n | 0);
    if (kind === 'splash') {
      for (i = 0; i < n && room(this); i++) {
        a = -M.PI / 2 + r.range(-0.9, 0.9); s = r.range(120, 260) * k;
        p = this._mk('drop', x + r.range(-6, 6) * k, y, r.range(7, 12) * k, 'front', r.range(0.6, 1.0));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.g = 620 * k; p.rotVel = true; p.splashY = y;
      }
      for (i = 0; i < 2 && room(this); i++) {
        p = this._mk('ripple', x, y, 12 * k, 'back', 0.9 + i * 0.35);
        p.grow = (36 + i * 16) * k; p.delay = i * 0.18; p.a = 0.9;
      }
    } else if (kind === 'leaf') {
      for (i = 0; i < n && room(this); i++) {
        a = r.range(0, TAU); s = r.range(60, 150) * k;
        p = this._mk('sparkle', x, y, r.range(8, 14) * k, 'front', r.range(0.35, 0.6));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 5; p.spin = r.range(-6, 6);
      }
      for (i = 0; i < M.ceil(n / 3) && room(this); i++) {
        p = this._mk('leafbit', x, y, r.range(9, 13) * k, 'front', r.range(0.9, 1.4));
        p.vx = r.range(-60, 60) * k; p.vy = r.range(-120, -50) * k; p.g = 260 * k; p.drag = 2.5;
        p.swing = r.range(10, 18) * k; p.w = r.range(4, 6); p.term = 55 * k;
      }
    } else if (kind === 'land' || kind === 'flutter') {
      var small = kind === 'flutter';
      for (i = 0; i < n && room(this); i++) {
        a = small ? M.PI / 2 + r.range(-0.8, 0.8) : (r.chance(0.5) ? M.PI : 0) + r.range(-0.35, 0.35);
        s = (small ? r.range(30, 70) : r.range(50, 120)) * k;
        p = this._mk('puff', x + r.range(-8, 8) * k, y + r.range(-3, 3) * k, (small ? r.range(8, 12) : r.range(10, 16)) * k, 'front', r.range(0.45, 0.75));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s - (small ? 0 : 20 * k); p.drag = 4; p.grow = (small ? 10 : 16) * k; p.spin = r.range(-2, 2); p.a = 0.8;
      }
    } else if (kind === 'bump') {
      for (i = 0; i < n && room(this); i++) {
        a = TAU * i / M.max(1, n) + r.range(-0.3, 0.3); s = r.range(70, 130) * k;
        p = this._mk('star', x, y, r.range(10, 15) * k, 'front', r.range(0.5, 0.8));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 3.5; p.spin = r.sign() * r.range(6, 10); p.g = 80 * k;
      }
    }
  };
  Weather.prototype._mk = function (kind, x, y, size, layer, life) {
    var p = this._base(kind, x, y, size, layer);
    p.burst = true; p.life = life; p.alpha = 1; p.size0 = size;
    p.rot = this.rng.range(0, TAU);
    this.particles.push(p);
    return p;
  };

  Weather.prototype.update = function (dt) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.time += dt;
    var W = this.width, H = this.height, sea = this._sea(), t = this.time;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i], dead = false;
      p.age += dt;
      if (p.burst) dead = this._updBurst(p, dt);
      else {
        if (p.fade < 1 && !p.dying) p.fade = M.min(1, p.fade + dt / 0.6);
        if (p.dying) { p.fade -= dt / 0.7; if (p.fade <= 0) dead = true; }
        var vis = p.fade, kd = p.kind;
        if (kd === 'glint') {
          var f = p.age / p.life;
          p.alpha = p.a * M.sin(M.PI * clamp(f, 0, 1)) * vis; p.rot += dt * 0.8;
          p.size = p.size || 10;
          if (f >= 1) { if (p.dying) dead = true; else { p.age = 0; p.x = this.rng.range(0, W); p.y = sea + this.rng.range(0.01, 0.16) * H; p.life = this.rng.range(1.2, 2.6); } }
        } else if (kd === 'butterfly') {
          p.x += p.vx * dt;
          p.y = p.y0 + p.amp * (0.6 * M.sin(TAU * p.f1 * t + p.ph) + 0.4 * M.sin(TAU * p.f2 * t + p.ph * 1.7));
          p.flap = 0.5 + 0.5 * M.sin(TAU * p.flapRate * t + p.ph);
          p.rot = 0.18 * M.sin(TAU * p.f2 * t + p.ph);
          p.alpha = p.a * vis;
          if (p.x < -40 || p.x > W + 40) { if (p.dying) dead = true; else { p.vx = -p.vx; p.flipX = p.vx < 0; p.x = clamp(p.x, -39, W + 39); } }
        } else if (kd === 'petal') {
          var sw = M.sin(p.w * t + p.ph);                                // pendulum: drift sideways with the swing,
          p.x += (p.vx + p.swing * p.w * M.cos(p.w * t + p.ph)) * dt;    // fall faster at the bottom of each arc
          p.y += p.vy * (0.55 + 0.45 * M.abs(M.cos(p.w * t + p.ph))) * dt;
          p.rot = 0.9 * sw; p.alpha = p.a * vis;
          if (p.y > sea + 6) { p.alpha *= clamp(1 - (p.y - sea - 6) / 14, 0, 1); }
          if (p.y > sea + 20 || p.x > W + 30) { if (p.dying) dead = true; else { p.y = -12; p.x = this.rng.range(-20, W); p.age = 0; p.fade = 0; } }
        } else if (kd === 'bubble') {
          p.y += p.vy * dt; p.x = p.x0 + p.wob * M.sin(p.w * t + p.ph);
          p.vy *= 1 + 0.1 * dt;                                          // speeds up a little as it rises
          p.alpha = p.a * vis * clamp((H - p.y) / 30, 0, 1);
          if (p.y <= sea + 2) {                                          // pops at the surface
            if (p.dying) dead = true;
            else { p.y = H + this.rng.range(5, 40); p.x0 = this.rng.range(0, W); p.vy = -this.rng.range(18, 34) * this.k; }
          }
        } else if (kd === 'firefly') {
          p.x = p.x0 + p.ax * M.sin(TAU * p.f1 * t + p.ph); p.y = p.y0 + p.ay * M.sin(TAU * p.f2 * t + p.ph * 1.3);
          p.alpha = p.a * vis * (0.45 + 0.55 * (0.5 + 0.5 * M.sin(TAU * t / p.pulse + p.ph)));
          p.flipX = M.cos(TAU * p.f1 * t + p.ph) < 0;
        } else if (kd === 'star') {
          p.alpha = p.a * vis * (0.55 + 0.45 * M.sin(TAU * t / p.tw + p.ph)) * this.nightK();
        }
      }
      if (dead) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    this._trim(); this._topUp(false);
  };

  Weather.prototype._updBurst = function (p, dt) {
    var f = p.age / p.life;
    if (p.delay) { if (p.age < p.delay) { p.alpha = 0; return false; } f = (p.age - p.delay) / p.life; }
    if (f >= 1) return true;
    if (p.drag) { var d = M.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
    if (p.g) p.vy += p.g * dt;
    if (p.term && p.vy > p.term) p.vy = p.term;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.swing) p.x += p.swing * p.w * M.cos(p.w * p.age + p.ph) * dt;
    var kd = p.kind;
    if (kd === 'drop') {
      p.rot = M.atan2(p.vy, p.vx) + M.PI / 2;                            // the drop points along its flight
      p.alpha = 1 - f * f;
      if (p.vy > 0 && p.y > p.splashY + 4) return true;                  // back into the sea
    } else if (kd === 'ripple') {
      p.size = p.size0 + p.grow * f; p.alpha = p.a * (1 - f); p.rot = 0;
    } else if (kd === 'puff') {
      p.size = p.size0 + p.grow * (1 - (1 - f) * (1 - f)); p.alpha = p.a * (1 - f); p.rot += p.spin * dt;
    } else if (kd === 'leafbit') {
      p.rot = 1.1 * M.sin(p.w * p.age + p.ph); p.alpha = f < 0.7 ? 1 : (1 - f) / 0.3;
    } else {
      if (p.spin) p.rot += p.spin * dt;
      p.alpha = f < 0.5 ? 1 : 1 - (f - 0.5) / 0.5;
      if (kd === 'sparkle') p.size = p.size0 * (1 - 0.5 * f);
    }
    return false;
  };

  FIF.Weather = Weather;
})(window.FIF = window.FIF || {});
