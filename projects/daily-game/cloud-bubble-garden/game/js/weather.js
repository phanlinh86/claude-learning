/* Nimbus's Bubble Garden — NB.Weather: rain + ambient particles per time of day + bursts (DESIGN §5.2)
 *
 *   var wx = new NB.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setGround(layout.groundY, layout.unit);        // after every resize (resize() also guesses it from World.computeLayout)
 *   wx.setLevel(zone, { instant: true });             // 0 dawn, 1 noon, 2 sunset, 3 night (crossfades unless instant)
 *   wx.resize(w, h);
 *   wx.setShower(on, x, y);                           // heavy rain; optional (x, y) = Nimbus's position (call again as she moves)
 *   wx.update(dt, world.wind.x);                      // wind px/s: rain slants and leaves/mist/glow drift with it
 *   wx.burst('drop', x, y, 10, { speed, life, size, gravity, spread, up, spin, layer, drag, angle });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', aspect}
 *   wx.ambient {tint (css rgba or null), rain (0..1 strength)}
 *
 * Drawing: `size` is the sprite's LONG side in px and `aspect` = width / height of its box (streak 1/6, mist 2,
 * everything else 1): aspect < 1 → w = size·aspect, h = size; aspect ≥ 1 → w = size, h = size / aspect.
 * Centred on (x, y). rot is a canvas rotation (radians, clockwise); a streak is rotated so it points along its
 * fall direction. x, y are screen coords (= world coords, no camera).
 *
 * Rain has depth: every streak has d ∈ [0.45, 1.2]; far drops (small d) are shorter, slower, fainter and land
 * higher (further back in the garden); d > 1 are the few front-layer drops (alpha ≤ 0.35). Near drops landing on
 * the lawn make a tiny 'splash' (≤ 10 alive). Dawn: low mist wisps; noon: floating sparkles; sunset: tumbling
 * leaves (pendulum glide or spin); night: glow-worms near the grass + twinkling stars (y < 0.35·h).
 * Total count is always < 180.
 */
(function (NB) {
  'use strict';
  var M = Math;

  var CAP = 179;              // hard cap (DESIGN: < 180)
  var MAX_SPLASH = 10;
  var FRONT_ALPHA = 0.35;     // front-layer alpha ceiling (pale, never competes with gems/bubbles)
  var SHOWER_RAIN = 60;       // extra streaks during a shower

  // counts at 960×540 (scaled gently with screen area)
  var ZONES = [
    { key: 'dawn',   rain: 0.35, drops: 40, mist: 8, sparkle: 0,  leaf: 0, glow: 0,  star: 0,  tint: 'rgba(255,190,205,0.05)' },
    { key: 'noon',   rain: 0.25, drops: 26, mist: 0, sparkle: 12, leaf: 0, glow: 0,  star: 0,  tint: null },
    { key: 'sunset', rain: 0.4,  drops: 44, mist: 0, sparkle: 0,  leaf: 9, glow: 0,  star: 0,  tint: 'rgba(255,140,80,0.06)' },
    { key: 'night',  rain: 0.45, drops: 44, mist: 0, sparkle: 0,  leaf: 0, glow: 10, star: 20, tint: 'rgba(30,40,120,0.10)' }
  ];
  var KINDS = ['drops', 'mist', 'sparkle', 'leaf', 'glow', 'star'];
  var FRONT = { drops: 0.12, mist: 0, sparkle: 0.2, leaf: 0.3, glow: 0, star: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back';
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.aspect = o.aspect || 1; this.rot = o.rot || 0; this.spin = o.spin || 0;
    this.flipX = !!o.flipX; this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0; this.tw = o.tw || 0;
    this.g = o.g || 0; this.drag = o.drag || 0; this.d = o.d || 1; this.landY = o.landY || 0;
    this.tumble = !!o.tumble; this.grow = o.grow || 0;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.6 : o.fadeIn;
    this.shower = !!o.shower;
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new NB.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.wind = 0;
    this.ambient = { tint: null, rain: 0 };
    this._rain = 0; this._shower = false; this._sx = null; this._sy = null; this._fillT = 0;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.setGround = function (groundY, unit) {
    if (isFinite(groundY)) this.groundY = groundY;
    if (isFinite(unit) && unit > 0) this.unit = unit;
  };

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width, oldH = this.height;
    this.width = w; this.height = h;
    var L = NB.World && NB.World.computeLayout ? NB.World.computeLayout(w, h)
      : { unit: h > w ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4) };
    if (L.groundY === undefined) L.groundY = h - 0.95 * L.unit;
    this.unit = L.unit; this.groundY = L.groundY;
    this.skyY = 0.35 * h;                               // night stars stay above this
    this.areaK = clamp(M.sqrt((w * h) / (960 * 540)), 0.85, 1.4);
    if (quiet) return;
    var kx = oldW ? w / oldW : 1, ky = oldH ? h / oldH : 1;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= kx; p.y *= ky; p.landY *= ky;
      if (p.kind === 'star' && p.y > this.skyY) p.y = this.rng.range(4, this.skyY);
    }
    this._trim(); this._topUp(true);
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var Z = ZONES[this.zone], instant = opts && opts.instant;
    this.ambient.tint = Z.tint;
    if (instant) this._rain = Z.rain;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst' || p.kind === 'splash' || (p.kind === 'drops' && !instant)) continue;   // rain keeps falling
      if (instant) this.particles.splice(i, 1); else p.dying = true;
    }
    this._trim();
    this._topUp(true, !!instant);
    this.ambient.rain = this._showerRain();
  };

  Weather.prototype.setShower = function (on, x, y) {
    this._shower = !!on;
    this._sx = on && isFinite(x) ? x : null;
    this._sy = on && isFinite(y) ? y : null;
    this.ambient.rain = this._showerRain();
    if (!on) for (var i = 0; i < this.particles.length; i++) if (this.particles[i].shower) this.particles[i].dying = true;
  };
  Weather.prototype._showerRain = function () { return this._shower ? 1 : this._rain; };

  Weather.prototype._want = function (kind) {
    var n = ZONES[this.zone][kind] || 0;
    return M.round(n * this.areaK);
  };
  Weather.prototype._count = function (kind, shower) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.kind === kind && !p.dying && p.shower === !!shower) n++;
    }
    return n;
  };
  Weather.prototype._trim = function () {
    for (var k = 0; k < KINDS.length; k++) {
      var extra = this._count(KINDS[k]) - this._want(KINDS[k]);
      for (var i = this.particles.length - 1; i >= 0 && extra > 0; i--) {
        var p = this.particles[i];
        if (p.kind === KINDS[k] && !p.dying && !p.shower) { p.dying = true; extra--; }
      }
    }
  };
  Weather.prototype._room = function () { return CAP - MAX_SPLASH - this.particles.length; };
  Weather.prototype._topUp = function (anywhere, instant) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this._room() > 0; i++) this._spawn(kind, anywhere, instant, false);
    }
    if (this._shower) {
      var sn = SHOWER_RAIN - this._count('drops', true);
      for (var j = 0; j < sn && this._room() > 0; j++) this._spawn('drops', anywhere, true, true);
    }
  };

  Weather.prototype._spawn = function (kind, anywhere, instant, shower) {
    var r = this.rng, W = this.width, H = this.height, U = this.unit, u = U / 100, G = this.groundY, o;
    var front = r.chance(FRONT[kind]);
    var x = r.range(0, W), y = anywhere ? r.range(0, H) : 0;
    switch (kind) {
      case 'drops': {
        var d = front ? r.range(1.02, 1.2) : r.range(0.45, 1.0);
        if (shower) { d = r.range(0.85, 1.1); front = d > 1.0; }
        var sp = (shower ? r.range(9, 12) : r.range(7, 9.5)) * U * d;
        var land = G + 0.15 * U - (1 - M.min(d, 1)) * 1.6 * U;            // far drops land further back (higher)
        if (front) land = G + r.range(0.1, 0.5) * U;
        if (shower && this._sx !== null) {
          x = this._sx + r.range(-1.3, 1.3) * U;
          y = anywhere ? r.range(this._sy, land) : this._sy + r.range(0, 0.3) * U;
        } else if (!anywhere) y = -r.range(0.1, 0.8) * U;
        else y = r.range(-0.5 * U, land);
        o = { sprite: 'streak', aspect: 1 / 6, size: (front ? r.range(26, 36) : r.range(16, 30) * d) * u, vy: sp, d: d, landY: land,
          base: front ? r.range(0.22, FRONT_ALPHA) : r.range(0.25, 0.55) * (0.5 + 0.5 * M.min(d, 1)), fadeIn: 0.08 };
        break;
      }
      case 'mist':      // dawn: big soft wisps hugging the lawn (back)
        y = G + r.range(-1.1, 0.25) * U;
        o = { sprite: 'mist', aspect: 2, size: r.range(140, 240) * u, vx: r.range(-6, 6) * u, sw: r.range(0.12, 0.25),
          swAmp: r.range(6, 14) * u, ph: r.range(0, 6.28), base: r.range(0.14, 0.3), flipX: r.chance(0.5), fadeIn: 1.5 };
        break;
      case 'sparkle':   // noon: specks of sunlight floating, slowly rising and twinkling
        if (!anywhere) y = r.range(0.15, 0.85) * H;
        o = { sprite: 'sparkle', size: (front ? r.range(6, 9) : r.range(6, 12)) * u, vx: r.range(-5, 5) * u, vy: -r.range(3, 10) * u,
          sw: r.range(0.5, 1.0), swAmp: r.range(6, 12) * u, ph: r.range(0, 6.28), tw: r.range(1.2, 2.6),
          base: front ? r.range(0.2, FRONT_ALPHA) : r.range(0.3, 0.6), rot: r.range(0, 1.5) };
        break;
      case 'leaf': {    // sunset: falling leaves — a pendulum glide (70 %) or a fast tumble (30 %)
        if (!anywhere) y = -r.range(10, 40) * u;
        var tumble = r.chance(0.3);
        o = { sprite: 'leaf', size: (front ? r.range(12, 16) : r.range(10, 18)) * u, vy: (tumble ? r.range(55, 80) : r.range(30, 50)) * u,
          sw: tumble ? 0 : r.range(1.6, 2.6), swAmp: r.range(0.6, 1.0) * U * 0.45, ph: r.range(0, 6.28), tumble: tumble,
          spin: tumble ? r.sign() * r.range(3, 6) : 0, rot: r.range(0, 6.28), flipX: r.chance(0.5),
          base: front ? r.range(0.25, FRONT_ALPHA) : r.range(0.55, 0.85) };
        break;
      }
      case 'glow':      // night: glow-worms wandering just above the grass
        y = G + r.range(-0.9, 0.35) * U;
        o = { sprite: 'glow', size: r.range(10, 18) * u, vx: r.range(-12, 12) * u, sw: r.range(0.6, 1.3), swAmp: r.range(8, 18) * u,
          ph: r.range(0, 6.28), tw: r.range(0.5, 1.1), base: r.range(0.45, 0.85), fadeIn: 1.2 };
        break;
      case 'star':      // night: twinkling stars in the sky band only
        y = r.range(4, this.skyY);
        o = { sprite: 'star', size: r.range(5, 10) * u, tw: r.range(0.8, 2.4), ph: r.range(0, 6.28), base: r.range(0.45, 0.95), rot: r.range(0, 1.2) };
        break;
    }
    o.kind = kind; o.x = x; o.y = y; o.layer = front ? 'front' : 'back'; o.shower = !!shower;
    if (instant) o.fadeIn = 0.001;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  /** Screen-space burst at (x, y). opts: {speed, life, size, gravity, spread, up, spin, layer, angle, drag}. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, u = this.unit / 100;
    var reserve = 0;                                    // bursts never starve the rain / ambient set
    for (var k = 0; k < KINDS.length; k++) reserve += M.max(0, this._want(KINDS[k]) - this._count(KINDS[k]));
    var room = M.max(0, CAP - MAX_SPLASH - reserve - this.particles.length);
    n = M.min(n | 0, room);
    var speed = (opts.speed === undefined ? 160 : opts.speed) * u, life = opts.life === undefined ? 0.7 : opts.life;
    var size = (opts.size === undefined ? 12 : opts.size) * u, gr = (opts.gravity === undefined ? 300 : opts.gravity) * u;
    var spread = opts.spread === undefined ? M.PI * 2 : opts.spread;
    var spin = opts.spin === undefined ? 3 : opts.spin;
    var dir = opts.up ? -M.PI / 2 : (opts.angle || 0);
    if (opts.up && opts.spread === undefined) spread = M.PI * 0.9;
    for (var i = 0; i < n; i++) {
      var a = dir + r.range(-spread / 2, spread / 2), v = speed * r.range(0.45, 1);
      this.particles.push(new Particle({ kind: 'burst', sprite: sprite, layer: opts.layer || 'front',
        x: x + r.range(-3, 3) * u, y: y + r.range(-3, 3) * u, vx: M.cos(a) * v, vy: M.sin(a) * v,
        size: size * r.range(0.7, 1.25), rot: r.range(0, 6.28), spin: r.range(-spin, spin), flipX: r.chance(0.5),
        aspect: sprite === 'streak' ? 1 / 6 : sprite === 'mist' ? 2 : 1,
        g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag, life: life * r.range(0.75, 1.15), base: 1, fadeIn: 0.001 }));
    }
    return n;
  };

  Weather.prototype._splash = function (x, y, d) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'splash') n++;
    if (n >= MAX_SPLASH || this.particles.length >= CAP) return;
    var u = this.unit / 100;
    this.particles.push(new Particle({ kind: 'splash', sprite: 'splash', layer: d > 1 ? 'front' : 'back', x: x, y: y,
      size: 9 * u * d, grow: 18 * u, life: 0.28, base: d > 1 ? FRONT_ALPHA : 0.45, fadeIn: 0.001 }));
  };

  Weather.prototype.update = function (dt, wind) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    this.time += dt;
    var wx = typeof wind === 'number' && isFinite(wind) ? wind : (wind && isFinite(wind.x) ? wind.x : 0);
    this.wind = wx;
    var U = this.unit, u = U / 100, W = this.width, H = this.height, G = this.groundY, Z = ZONES[this.zone];
    this._rain += (Z.rain - this._rain) * (1 - M.exp(-1.5 * dt));     // rain strength crossfades over ≈2 s
    this.ambient.rain = this._showerRain();
    var slant = wx * 2.2;                                             // rain px/s sideways (gusts lean the streaks)
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i], kill = false;
      p.age += dt;
      var fin = clamp(p.age / p.fadeIn, 0, 1);
      if (p.dying) { p.fade -= dt / 0.9; if (p.fade <= 0) kill = true; }
      switch (p.kind) {
        case 'burst': {
          var k = M.exp(-p.drag * dt);
          p.vx *= k; p.vy = p.vy * k + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          var lf = p.age / p.life;
          p.alpha = clamp(lf < 0.65 ? 1 : 1 - (lf - 0.65) / 0.35, 0, 1);
          if (lf >= 1) kill = true;
          break;
        }
        case 'splash':
          p.size += p.grow * dt;
          p.alpha = clamp(p.base * (1 - p.age / p.life), 0, 1);
          if (p.age >= p.life) kill = true;
          break;
        case 'drops': {
          p.vx = slant * p.d;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot = -M.atan2(p.vx, p.vy);
          // rain strength fades far drops out first (a lighter drizzle is just fewer visible drops)
          var vis = p.shower ? 1 : clamp((this._showerRain() / 0.45) * 1.15 - (1 - M.min(p.d, 1)) * 0.6, 0.15, 1);
          p.alpha = clamp(p.base * vis * fin * clamp(p.fade, 0, 1), 0, 1);
          if (p.y >= p.landY) {
            if (p.d > 0.8 && p.alpha > 0.12) this._splash(p.x, p.landY, p.d);
            if (p.dying) { kill = true; break; }
            // recycle at the top (or at Nimbus during a shower)
            if (p.shower && this._sx !== null) { p.x = this._sx + this.rng.range(-1.3, 1.3) * U; p.y = this._sy + this.rng.range(0, 0.3) * U; }
            else { p.x = this.rng.range(-0.3, 1.3) * W - slant * 0.4; p.y = -this.rng.range(0.1, 0.6) * U; }
            p.age = 0;
          }
          if (p.x < -U) p.x += W + 2 * U; else if (p.x > W + U) p.x -= W + 2 * U;
          break;
        }
        case 'leaf': {
          if (p.tumble) {
            p.rot += p.spin * dt;
            p.x += (wx * 0.9 + M.sin(p.rot) * 12 * u) * dt; p.y += p.vy * dt;
          } else {
            // pendulum glide: swings side to side, falls fastest through the bottom of each arc, tilts with the swing
            p.ph += p.sw * dt;
            var c = M.cos(p.ph);
            p.x += (p.swAmp * p.sw * c + wx * 0.9) * dt;
            p.y += p.vy * (0.25 + 1.3 * c * c) * dt;
            p.rot = 0.65 * M.sin(p.ph);
          }
          p.alpha = clamp(p.base * fin * clamp(p.fade, 0, 1), 0, 1);
          if (p.y > G + 0.5 * U) { if (p.dying) kill = true; else { p.y = -this.rng.range(10, 40) * u; p.x = this.rng.range(0, W); p.age = 0; } }
          break;
        }
        default: {        // mist, sparkle, glow, star: drift + sway + twinkle
          p.ph += p.sw * dt;
          var drift = p.kind === 'mist' ? wx * 0.5 : p.kind === 'glow' ? wx * 0.2 : p.kind === 'sparkle' ? wx * 0.4 : 0;
          p.x += (p.vx + drift + M.cos(p.ph) * p.swAmp * p.sw) * dt;
          p.y += (p.vy + (p.kind === 'glow' ? M.sin(p.ph * 1.3) * 8 * u : 0)) * dt;
          var a = p.base;
          if (p.tw) a = p.base * (0.35 + 0.65 * (0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph)));
          p.alpha = clamp(a * fin * clamp(p.fade, 0, 1), 0, 1);
          var m = p.size;
          if (p.x < -m) p.x = W + m * 0.5; else if (p.x > W + m) p.x = -m * 0.5;
          if (p.kind === 'sparkle' && p.y < -m) { p.y = H * this.rng.range(0.6, 0.9); p.age = 0; }
          if (p.kind === 'glow') p.y = clamp(p.y, G - 1.0 * U, G + 0.4 * U);
          if (p.kind === 'mist') p.y = clamp(p.y, G - 1.2 * U, G + 0.3 * U);
          if (p.kind === 'star' && p.y > this.skyY) p.y = this.rng.range(4, this.skyY);
        }
      }
      if (p.layer === 'front' && p.kind !== 'burst' && p.alpha > FRONT_ALPHA) p.alpha = FRONT_ALPHA;
      if (kill) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    if ((this._fillT -= dt) <= 0) { this._fillT = 0.2; this._topUp(false); }
  };

  NB.Weather = Weather;
})(window.NB = window.NB || {});
