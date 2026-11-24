/* Nubi's Farm Fling — CFF.Weather: screen-space ambient particles per season + bursts (DESIGN §5)
 *
 *   var wx = new CFF.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });   // 0 spring, 1 summer, 2 autumn, 3 winter (old ones fade out unless instant)
 *   wx.resize(w, h);  wx.setHorizon(grassPx); // grassPx = screen y of the grass top (default 0.78·h)
 *   wx.update(dt);
 *   wx.burst('plop' | 'fly' | 'land' | 'bump' | 'puff' | 'grow', x, y, n, opts);   // logical screen px
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', flap}
 *     — `sprite` = 'p_<particle file>' (assets/default/particles/<name>.svg), `size` = drawn width in px (square
 *       sprites), `rot` radians (canvas convention, clockwise), `flap` (butterflies, 0..1) = wing opening the
 *       renderer may use to squash x. layer 'sky' = behind the far hills, 'back' = behind Nubi, 'front' = over.
 *
 * Ambient (no day–night any more):
 *   spring → blossom petals falling like little pendulums (sway + rock) + a few butterflies on noisy flutter paths;
 *   summer → butterflies + warm sparkles twinkling in the air;
 *   autumn → leaves tumbling down: a pendulum sway (they slow down at the ends of each swing and drop faster through
 *            the middle) plus a steady spin, a little wind drift to the right;
 *   winter → snow in three depth layers (far: small, slow, faint, layer 'sky'; mid 'back'; near: big, faster,
 *            'front'), each flake with a gentle sinus sway.
 *   everywhere → a few tiny wandering ambient fireflies (layer 'back') with a soft glow pulse.
 * Bursts:
 *   plop  = soft mist puffs spreading sideways along the grass + a few drops on gravity arcs;
 *   fly   = sparkles bursting out and slowing down (drag) + one soft glow that swells and fades;
 *   land  = a rain shower: drops spread over opts.width px fall from y with gravity (staggered over ≈ 0.7 s) and
 *           end in a small ripple ring; opts.snow (or winter when opts.snow is undefined) = snowflakes that drift
 *           down slower with sway instead; opts.fall = how far they fall in px (default 0.7·unit);
 *   bump  = little stars spinning outward; puff = small mist puffs blown downward/behind;
 *   grow  = a ring of tiny puffs expanding outward around Nubi (opts.r = start radius px).
 * Sizes scale with the screen (k = min(W, H)/540; ambient ≤ 0.5 u). Bounded: ambient ≤ CAP − RESERVE, all ≤ CAP.
 */
(function (CFF) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 160, RESERVE = 40;

  // ambient counts at 960×540 (× areaK)
  var ZONES = [
    { key: 'spring', counts: { petal: 14, butterfly: 4, firefly: 4 } },
    { key: 'summer', counts: { butterfly: 6, sparkle: 10, firefly: 4 } },
    { key: 'autumn', counts: { leaf: 14, firefly: 4 } },
    { key: 'winter', counts: { snowFar: 26, snowMid: 20, snowNear: 10, firefly: 3 } }
  ];
  var KINDS = ['petal', 'butterfly', 'sparkle', 'leaf', 'snowFar', 'snowMid', 'snowNear', 'firefly'];
  var SPRITE = { petal: 'p_petal', butterfly: 'p_butterfly', sparkle: 'p_sparkle', leaf: 'p_leafbit', firefly: 'p_firefly',
    snowFar: 'p_snow', snowMid: 'p_snow', snowNear: 'p_snow', snow: 'p_snow', drop: 'p_drop', ripple: 'p_ripple',
    star: 'p_star', puff: 'p_puff', glow: 'p_glow' };
  // snow depth layers: size px (×k), fall speed px/s (×k), sway amplitude px, alpha, layer
  var SNOW = {
    snowFar:  { size: [5, 7],   vy: [14, 22], sway: [4, 8],   a: [0.45, 0.6], layer: 'sky' },
    snowMid:  { size: [8, 11],  vy: [26, 38], sway: [8, 14],  a: [0.7, 0.85], layer: 'back' },
    snowNear: { size: [13, 18], vy: [44, 62], sway: [12, 20], a: [0.85, 1],   layer: 'front' }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new CFF.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0;
    this.groundY = null;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;
  Weather.RESERVE = RESERVE;
  Weather.ZONES = ZONES;

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width || w, oldH = this.height || h;
    this.width = M.max(1, w); this.height = M.max(1, h);
    this.k = clamp(M.min(this.width, this.height) / 540, 0.6, 1.8);
    this.areaK = clamp(M.sqrt((this.width * this.height) / (960 * 540)), 0.7, 1.4);
    if (quiet) return;
    var kx = this.width / oldW, ky = this.height / oldH;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x *= kx; p.y *= ky; if (p.x0 !== undefined) p.x0 *= kx; if (p.y0 !== undefined) p.y0 *= ky;
      if (p.endY !== undefined) p.endY *= ky;
    }
    this._trim(); this._topUp(true);
  };
  Weather.prototype.setHorizon = function (px) { this.groundY = +px || null; };
  Weather.prototype.setLight = function () {};                         // kept for old callers: there is no night now
  Weather.prototype._ground = function () { return this.groundY !== null ? this.groundY : this.height * 0.78; };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var instant = !!(opts && opts.instant);
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.burst || p.kind === 'firefly') continue;                     // fireflies live in every season
      if (instant) this.particles.splice(i, 1); else p.dying = true;    // crossfade: old ones fade out
    }
    this._trim(); this._topUp(true);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone].counts[kind] || 0) * this.areaK); };
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
    var r = this.rng, W = this.width, H = this.height, k = this.k, gr = this._ground(), p;
    if (kind === 'butterfly') {                                          // noisy flutter path across the sky
      var dir = r.sign();
      p = this._base(kind, anywhere ? r.range(0, W) : (dir > 0 ? -20 : W + 20), r.range(0.15, 0.6) * gr, r.range(16, 22) * k, r.chance(0.3) ? 'front' : 'back');
      p.vx = dir * r.range(22, 38) * k; p.flipX = dir < 0; p.a = 0.9;
      p.f1 = r.range(0.35, 0.6); p.f2 = r.range(0.9, 1.4); p.amp = r.range(18, 34) * k; p.flapRate = r.range(7, 10);
    } else if (kind === 'petal' || kind === 'leaf') {                    // pendulum fall (+ spin for leaves)
      var leaf = kind === 'leaf';
      p = this._base(kind, r.range(-20, W), anywhere ? r.range(0, gr) : -14, (leaf ? r.range(13, 19) : r.range(9, 14)) * k, r.chance(0.3) ? 'front' : 'back');
      p.vy = (leaf ? r.range(26, 40) : r.range(18, 30)) * k; p.vx = (leaf ? r.range(10, 22) : r.range(4, 12)) * k;
      p.swing = (leaf ? r.range(22, 36) : r.range(14, 26)) * k; p.w = leaf ? r.range(1.3, 2.0) : r.range(1.6, 2.4);
      p.spin = leaf ? r.sign() * r.range(1.2, 2.6) : 0; p.a = leaf ? 0.95 : 0.85;
      p.flipX = r.chance(0.5);
    } else if (kind === 'sparkle') {                                     // twinkles in place in the warm air
      p = this._base(kind, r.range(0, W), r.range(0.1, 0.85) * gr, r.range(7, 12) * k, 'back');
      p.life = r.range(1.4, 2.8); p.age = anywhere ? r.range(0, p.life) : 0; p.a = r.range(0.5, 0.85);
    } else if (SNOW[kind]) {                                             // snow in depth layers
      var S = SNOW[kind];
      p = this._base(kind, r.range(0, W), anywhere ? r.range(-10, H) : -12, r.range(S.size[0], S.size[1]) * k, S.layer);
      p.vy = r.range(S.vy[0], S.vy[1]) * k; p.vx = r.range(2, 8) * k; p.swing = r.range(S.sway[0], S.sway[1]) * k;
      p.w = r.range(0.6, 1.3); p.a = r.range(S.a[0], S.a[1]); p.spin = r.range(-0.8, 0.8);
    } else if (kind === 'firefly') {                                     // tiny, slow wander + glow pulse
      p = this._base(kind, r.range(0, W), r.range(0.3, 0.92) * gr, r.range(7, 10) * k, 'back');
      p.ax = r.range(25, 55) * k; p.ay = r.range(12, 28) * k; p.f1 = r.range(0.08, 0.18); p.f2 = r.range(0.12, 0.25); p.a = 0.8;
      p.pulse = r.range(1.4, 2.4);
    }
    p.fade = anywhere ? 0.6 : 0;
    p.alpha = 0;
    this.particles.push(p);
    return p;
  };

  /** burst at screen (x, y): n ≈ count of the main sprite; opts {width, fall, snow, r} (see header) */
  Weather.prototype.burst = function (kind, x, y, n, opts) {
    var r = this.rng, k = this.k, i, p, a, s, self = this;
    opts = opts || {};
    var room = function () { return self.particles.length < CAP; };
    n = n === undefined ? 8 : M.max(0, n | 0);
    if (kind === 'plop') {                                               // soft "pfff": mist spreads along the grass
      for (i = 0; i < n && room(); i++) {
        var dir = i % 2 ? 1 : -1;
        p = this._mk('puff', x + dir * r.range(2, 14) * k, y - r.range(0, 6) * k, r.range(12, 18) * k, 'front', r.range(0.55, 0.9));
        p.vx = dir * r.range(60, 140) * k; p.vy = -r.range(5, 30) * k; p.drag = 4; p.grow = r.range(14, 22) * k; p.spin = r.range(-1.5, 1.5); p.a = 0.85;
      }
      for (i = 0; i < M.ceil(n / 2) && room(); i++) {
        a = -M.PI / 2 + r.range(-1.0, 1.0); s = r.range(90, 200) * k;
        p = this._mk('drop', x + r.range(-8, 8) * k, y - 4 * k, r.range(6, 10) * k, 'front', r.range(0.5, 0.9));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.g = 620 * k; p.endY = y + 4 * k;
      }
    } else if (kind === 'fly') {
      for (i = 0; i < n && room(); i++) {
        a = r.range(0, TAU); s = r.range(60, 150) * k;
        p = this._mk('sparkle', x, y, r.range(8, 14) * k, 'front', r.range(0.35, 0.6));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 5; p.spin = r.range(-6, 6);
      }
      if (room()) { p = this._mk('glow', x, y, 18 * k, 'front', 0.45); p.grow = 34 * k; p.a = 0.8; p.rot = 0; }
    } else if (kind === 'land') {                                        // a rain (or snow) shower under Nubi
      var snow = opts.snow === undefined ? this.zone === 3 : !!opts.snow;
      var wd = opts.width || 80 * k, fall = opts.fall || 0.7 * this.height / 9;
      for (i = 0; i < n && room(); i++) {
        var dx = (n > 1 ? i / (n - 1) - 0.5 : 0) * wd + r.range(-0.06, 0.06) * wd;
        if (snow) {
          p = this._mk('snow', x + dx, y + r.range(-3, 3) * k, r.range(8, 12) * k, 'front', r.range(1.0, 1.4));
          p.vy = r.range(40, 60) * k; p.swing = r.range(6, 12) * k; p.w = r.range(3, 5); p.spin = r.range(-2, 2);
        } else {
          p = this._mk('drop', x + dx, y + r.range(-3, 3) * k, r.range(7, 11) * k, 'front', 1.2);
          p.vy = r.range(60, 120) * k; p.g = 900 * k; p.ripple = true;
        }
        p.endY = y + fall; p.delay = r.range(0, 0.7);
      }
    } else if (kind === 'bump') {
      for (i = 0; i < n && room(); i++) {
        a = TAU * i / M.max(1, n) + r.range(-0.3, 0.3); s = r.range(70, 130) * k;
        p = this._mk('star', x, y, r.range(10, 15) * k, 'front', r.range(0.5, 0.8));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 3.5; p.spin = r.sign() * r.range(6, 10); p.g = 80 * k;
      }
    } else if (kind === 'puff') {                                        // breath puffs blown out under/behind Nubi
      for (i = 0; i < n && room(); i++) {
        a = M.PI / 2 + r.range(-0.9, 0.9); s = r.range(30, 80) * k;
        p = this._mk('puff', x + r.range(-8, 8) * k, y + r.range(-3, 3) * k, r.range(8, 12) * k, 'front', r.range(0.45, 0.7));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 4; p.grow = 10 * k; p.spin = r.range(-2, 2); p.a = 0.8;
      }
    } else if (kind === 'grow') {                                        // a ring of tiny puffs pushed outward
      var r0 = opts.r || 30 * k;
      for (i = 0; i < n && room(); i++) {
        a = TAU * i / M.max(1, n) + r.range(-0.15, 0.15); s = r.range(50, 80) * k;
        p = this._mk('puff', x + M.cos(a) * r0, y + M.sin(a) * r0, r.range(6, 9) * k, 'front', r.range(0.4, 0.55));
        p.vx = M.cos(a) * s; p.vy = M.sin(a) * s; p.drag = 5; p.grow = 6 * k; p.spin = r.range(-2, 2); p.a = 0.75;
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
    var W = this.width, H = this.height, gr = this._ground(), t = this.time, r = this.rng;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i], dead = false;
      p.age += dt;
      if (p.burst) dead = this._updBurst(p, dt);
      else {
        if (p.fade < 1 && !p.dying) p.fade = M.min(1, p.fade + dt / 0.6);
        if (p.dying) { p.fade -= dt / 0.7; if (p.fade <= 0) dead = true; }
        var vis = M.max(0, p.fade), kd = p.kind;
        if (kd === 'butterfly') {
          p.x += p.vx * dt;
          p.y = p.y0 + p.amp * (0.6 * M.sin(TAU * p.f1 * t + p.ph) + 0.4 * M.sin(TAU * p.f2 * t + p.ph * 1.7));
          p.flap = 0.5 + 0.5 * M.sin(TAU * p.flapRate * t + p.ph);
          p.rot = 0.18 * M.sin(TAU * p.f2 * t + p.ph);
          p.alpha = p.a * vis;
          if (p.x < -40 || p.x > W + 40) { if (p.dying) dead = true; else { p.vx = -p.vx; p.flipX = p.vx < 0; p.x = clamp(p.x, -39, W + 39); } }
        } else if (kd === 'petal' || kd === 'leaf') {
          // pendulum: sideways speed follows cos (fast through the middle, still at the ends), the fall is quicker
          // through the middle of each swing, and the piece rocks with the swing angle (+ a steady spin for leaves)
          var ph = p.w * t + p.ph, c = M.cos(ph);
          p.x += (p.vx + p.swing * p.w * c) * dt;
          p.y += p.vy * (0.45 + 0.55 * M.abs(c)) * dt;
          p.rot = (kd === 'leaf' ? p.spin * t : 0) + 0.9 * M.sin(ph);
          p.alpha = p.a * vis;
          if (p.y > gr - 4) p.alpha *= clamp(1 - (p.y - gr + 4) / 14, 0, 1);
          if (p.y > gr + 12 || p.x > W + 30) { if (p.dying) dead = true; else { p.y = -14; p.x = r.range(-30, W * 0.9); p.age = 0; p.fade = 0; } }
        } else if (kd === 'sparkle') {
          var f = p.age / p.life;
          p.alpha = p.a * M.sin(M.PI * clamp(f, 0, 1)) * vis; p.rot += dt * 0.8;
          p.size = p.size0 || p.size; p.size0 = p.size;
          if (f >= 1) { if (p.dying) dead = true; else { p.age = 0; p.x = r.range(0, W); p.y = r.range(0.1, 0.85) * gr; p.life = r.range(1.4, 2.8); } }
        } else if (SNOW[kd]) {
          p.y += p.vy * dt; p.x += (p.vx + p.swing * p.w * M.cos(p.w * t + p.ph)) * dt; p.rot += p.spin * dt;
          p.alpha = p.a * vis;
          var floor = kd === 'snowFar' ? gr - 10 : kd === 'snowMid' ? gr + 6 : H + 10;   // far flakes vanish behind the hills
          if (p.y > floor - 10) p.alpha *= clamp((floor - p.y) / 10, 0, 1);
          if (p.y > floor || p.x > W + 20) { if (p.dying) dead = true; else { p.y = -12; p.x = r.range(-20, W); p.fade = 0; } }
        } else if (kd === 'firefly') {
          p.x = p.x0 + p.ax * M.sin(TAU * p.f1 * t + p.ph); p.y = p.y0 + p.ay * M.sin(TAU * p.f2 * t + p.ph * 1.3);
          p.alpha = p.a * vis * (0.35 + 0.65 * (0.5 + 0.5 * M.sin(TAU * t / p.pulse + p.ph)));
          p.flipX = M.cos(TAU * p.f1 * t + p.ph) < 0;
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
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.swing) p.x += p.swing * p.w * M.cos(p.w * p.age + p.ph) * dt;
    var kd = p.kind;
    if (kd === 'drop') {
      p.rot = M.atan2(p.vy, p.vx) - M.PI / 2;                            // the drop points along its flight
      p.alpha = 1 - f * f;
      if (p.vy > 0 && p.endY !== undefined && p.y >= p.endY) {           // hits the soil / grass
        if (p.ripple && this.particles.length < CAP) {
          var q = this._mk('ripple', p.x, p.endY, 5 * this.k, 'front', 0.35);
          q.grow = 12 * this.k; q.a = 0.8; q.rot = 0;
        }
        return true;
      }
    } else if (kd === 'snow') {
      p.rot += (p.spin || 0) * dt; p.alpha = f < 0.75 ? 1 : (1 - f) / 0.25;
      if (p.endY !== undefined && p.y >= p.endY) return true;
    } else if (kd === 'ripple' || kd === 'glow') {
      p.size = p.size0 + p.grow * (1 - (1 - f) * (1 - f)); p.alpha = p.a * (1 - f); p.rot = 0;
    } else if (kd === 'puff') {
      p.size = p.size0 + p.grow * (1 - (1 - f) * (1 - f)); p.alpha = p.a * (1 - f); p.rot += p.spin * dt;
    } else {
      if (p.spin) p.rot += p.spin * dt;
      p.alpha = f < 0.5 ? 1 : 1 - (f - 0.5) / 0.5;
      if (kd === 'sparkle') p.size = p.size0 * (1 - 0.5 * f);
    }
    return false;
  };

  CFF.Weather = Weather;
})(window.CFF = window.CFF || {});
