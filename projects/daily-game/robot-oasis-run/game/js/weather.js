/* Pebble's Oasis Run — PO.Weather: screen-space ambient particles per chapter + bursts (DESIGN §5.2)
 *
 *   var wx = new PO.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setHorizon(horizonY);                 // screen y of the horizon (renderer)
 *   wx.setLevel(zone, { instant: true });    // 0 grove, 1 dunes, 2 bazaar, 3 night (old ones fade out unless instant)
 *   wx.resize(w, h);
 *   wx.update(dt, world.speed);              // speed in u/s: things over the sand stream toward the camera faster
 *   wx.burst('dust', x, y, 6, { speed, life, size, gravity, spread, up, spin, layer, drag, angle });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'} — SCREEN px, size = px
 *   wx.ambient {tint (css rgba or null), shimmer (0..1 heat shimmer strength)}
 *
 * Grove: butterflies on a flapping sine path (flipX by direction) + leaves falling like pendulums.
 * Dunes: sand streaks blowing low over the plain + shimmer 0.5. Bazaar: tumbling petals + a few sparkles at
 * lantern height (sides). Night: fireflies (slow wander, pulsing alpha) + twinkling stars above the horizon.
 * "Toward the camera": anything below the horizon drifts away from the vanishing point (W/2, horizonY) at a
 * rate ∝ speed, like the path itself. Back-layer particles live above the horizon or at the sides; front-layer
 * ones are small, sparse, pale (alpha ≤ 0.55) and fade out inside the centre lane band near Pebble.
 * Sizes scale with the screen (k = min(W, H)/540). Total count is always < 160 (CAP 159).
 */
(function (PO) {
  'use strict';
  var M = Math;
  var CAP = 159, FRONT_ALPHA = 0.55;

  // counts at 960×540 (scaled gently with screen area)
  var ZONES = [
    { key: 'grove',  counts: { butterfly: 7, leaf: 9 },               tint: 'rgba(255,240,200,0.04)', shimmer: 0 },
    { key: 'dunes',  counts: { sand: 26, dust: 4 },                   tint: 'rgba(255,220,150,0.05)', shimmer: 0.5 },
    { key: 'bazaar', counts: { petal: 14, sparkle: 8 },               tint: 'rgba(255,140,90,0.06)',  shimmer: 0.15 },
    { key: 'night',  counts: { firefly: 16, star: 42 },               tint: 'rgba(30,40,120,0.10)',   shimmer: 0 }
  ];
  var KINDS = ['butterfly', 'leaf', 'sand', 'dust', 'petal', 'sparkle', 'firefly', 'star'];
  var FRONT = { butterfly: 0.25, leaf: 0.3, sand: 0.35, dust: 0, petal: 0.3, sparkle: 0, firefly: 0.2, star: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new PO.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.speed = 0;
    this.ambient = { tint: null, shimmer: 0 };
    this._horizonSet = false;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.setHorizon = function (y) {
    this.horizonY = clamp(+y || 0, 20, this.height - 40); this._horizonSet = true;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.kind === 'star' && p.y > this.horizonY - 6) p.y = this.rng.range(6, this.horizonY - 8);
    }
  };

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width, oldH = this.height;
    this.width = M.max(1, w); this.height = M.max(1, h);
    if (!this._horizonSet || quiet) this.horizonY = M.round(this.height * (this.height > this.width ? 0.36 : 0.40));
    else this.horizonY = clamp(this.horizonY * (this.height / oldH), 20, this.height - 40);
    this.k = M.min(this.width, this.height) / 540;                 // size scale (px per "design px")
    this.k = clamp(this.k, 0.8, 1.6);
    this.areaK = clamp(M.sqrt((this.width * this.height) / (960 * 540)), 0.8, 1.35);
    if (quiet) return;
    var kx = this.width / oldW, ky = this.height / oldH;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= kx; p.y *= ky; }
    this._trim(); this._topUp(true, true);
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var Z = ZONES[this.zone], instant = opts && opts.instant;
    this.ambient.tint = Z.tint; this.ambient.shimmer = Z.shimmer;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst') continue;
      if (instant) this.particles.splice(i, 1); else p.dying = true;
    }
    this._topUp(true, !!instant);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone].counts[kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._trim = function () {
    for (var k = 0; k < KINDS.length; k++) {
      var extra = this._count(KINDS[k]) - this._want(KINDS[k]);
      for (var i = this.particles.length - 1; i >= 0 && extra > 0; i--) {
        var p = this.particles[i];
        if (p.kind === KINDS[k] && !p.dying) { p.dying = true; extra--; }
      }
    }
  };
  Weather.prototype._topUp = function (anywhere, instant) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this.particles.length < CAP - 12; i++) this._spawn(kind, anywhere, instant);
    }
  };

  /** a point at the sides of the screen (outside the path) or in the sky */
  Weather.prototype._sideX = function () {
    var W = this.width, r = this.rng;
    return r.chance(0.5) ? r.range(0, 0.27 * W) : r.range(0.73 * W, W);
  };

  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, hz = this.horizonY, k = this.k;
    var front = r.chance(FRONT[kind]), o = { kind: kind, layer: front ? 'front' : 'back', rot: 0, flipX: false,
      vx: 0, vy: 0, spin: 0, ph: r.range(0, 6.283), base: 1, tw: 0, age: 0, life: 0, fade: instant ? 1 : 0, dying: false, stream: 0 };
    switch (kind) {
      case 'butterfly': {             // flutters along a sine path, mostly at the sides above the sand
        var dir = r.sign();
        o.sprite = 'butterfly'; o.size = (front ? r.range(16, 22) : r.range(12, 18)) * k;
        o.x = anywhere ? this._sideX() : (dir > 0 ? -20 * k : W + 20 * k);
        o.y = r.range(0.15 * H, front ? H * 0.9 : hz + 0.25 * (H - hz));
        o.vx = dir * r.range(18, 34) * k; o.vy = r.range(-4, 4) * k;
        o.flap = r.range(5, 8); o.amp = r.range(10, 20) * k; o.flipX = dir < 0; o.base = front ? r.range(0.4, FRONT_ALPHA) : r.range(0.7, 0.95);
        o.stream = front ? 0.8 : 0.15;
        break;
      }
      case 'leaf': {                  // falls like a pendulum: swings side to side, rot follows the swing
        o.sprite = 'leaf'; o.size = (front ? r.range(12, 16) : r.range(10, 16)) * k;
        o.x = this._sideX(); o.y = anywhere ? r.range(0, H) : -20 * k;
        o.vy = r.range(18, 30) * k; o.amp = r.range(16, 30) * k; o.sw = r.range(1.1, 1.8); o.x0 = o.x;
        o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.6, 0.9); o.stream = front ? 0.6 : 0.1;
        break;
      }
      case 'sand': {                  // thin streaks blown low over the plain by the wind (left → right or back)
        o.sprite = 'sand'; o.size = (front ? r.range(12, 18) : r.range(8, 14)) * k;
        o.wind = this._wind || (this._wind = r.sign());
        o.x = anywhere ? r.range(0, W) : (o.wind > 0 ? -20 * k : W + 20 * k);
        o.y = r.range(hz + 4 * k, front ? H * 0.95 : hz + 0.35 * (H - hz));
        o.vx = o.wind * r.range(90, 160) * k; o.vy = r.range(-4, 6) * k; o.flipX = o.wind < 0;
        o.base = front ? r.range(0.25, 0.45) : r.range(0.35, 0.6); o.stream = 1; o.tw = r.range(2, 4);
        break;
      }
      case 'dust': {                  // big soft sand puffs drifting far away near the horizon
        o.sprite = 'dust'; o.size = r.range(40, 70) * k; o.layer = 'back';
        o.x = anywhere ? r.range(0, W) : -60 * k; o.y = r.range(hz - 10 * k, hz + 30 * k);
        o.vx = r.range(10, 22) * k; o.base = r.range(0.15, 0.3); o.stream = 0;
        break;
      }
      case 'petal': {                 // tumbling petals drifting down and sideways
        o.sprite = 'petal'; o.size = (front ? r.range(10, 14) : r.range(8, 13)) * k;
        o.x = anywhere ? this._sideX() : r.range(-0.05 * W, 1.05 * W); o.y = anywhere ? r.range(0, H) : -15 * k;
        o.vx = r.range(-16, 16) * k; o.vy = r.range(14, 26) * k; o.amp = r.range(8, 16) * k; o.sw = r.range(1.5, 2.5);
        o.rot = r.range(0, 6.28); o.spin = r.range(-2.5, 2.5); o.flipX = r.chance(0.5);
        o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.6, 0.9); o.stream = front ? 0.6 : 0.1;
        break;
      }
      case 'sparkle': {               // little lantern glints at the sides, roughly lantern height
        o.sprite = 'sparkle'; o.size = r.range(7, 12) * k;
        o.x = this._sideX(); o.y = r.range(hz - 0.12 * H, hz + 0.12 * (H - hz));
        o.tw = r.range(1.5, 3); o.base = r.range(0.4, 0.75); o.rot = r.range(0, 1.5); o.life = r.range(2.5, 5);
        break;
      }
      case 'firefly': {               // slow wander + pulsing glow
        o.sprite = 'firefly'; o.size = (front ? r.range(10, 13) : r.range(7, 11)) * k;
        o.x = anywhere ? this._sideX() : this._sideX();
        o.y = front ? r.range(hz + 0.3 * (H - hz), H * 0.92) : r.range(hz - 0.15 * H, hz + 0.3 * (H - hz));
        o.wx = r.range(0.2, 0.5); o.wy = r.range(0.3, 0.6); o.amp = r.range(14, 30) * k; o.x0 = o.x; o.y0 = o.y;
        o.tw = r.range(1.2, 2.4); o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.6, 1); o.stream = 0;
        break;
      }
      case 'star': {                  // twinkling, only above the horizon
        o.sprite = 'star'; o.size = r.range(4, 9) * k;
        o.x = r.range(0, W); o.y = r.range(6, M.max(8, hz - 10));
        o.tw = r.range(1, 3); o.base = r.range(0.45, 0.95); o.rot = r.range(0, 1.2); o.layer = 'back';
        break;
      }
    }
    o.alpha = 0;
    this.particles.push(o);
    return o;
  };

  /** Screen-space burst at (x, y). opts: {speed px/s, life s, size px, gravity px/s², spread rad, up, spin, layer, drag, angle} */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng;
    var room = M.max(0, CAP - this.particles.length);
    if (room < n) this._evict(n - room);
    n = M.min(n | 0, CAP - this.particles.length);
    var speed = opts.speed === undefined ? 160 : opts.speed, life = opts.life === undefined ? 0.7 : opts.life;
    var size = opts.size === undefined ? 12 : opts.size, gr = opts.gravity === undefined ? 300 : opts.gravity;
    var spread = opts.spread === undefined ? (opts.up ? M.PI * 0.9 : M.PI * 2) : opts.spread;
    var spin = opts.spin === undefined ? 3 : opts.spin, dir = opts.up ? -M.PI / 2 : (opts.angle || 0);
    for (var i = 0; i < n; i++) {
      var a = dir + r.range(-spread / 2, spread / 2), v = speed * r.range(0.45, 1);
      this.particles.push({ kind: 'burst', sprite: sprite, layer: opts.layer || 'front', x: x + r.range(-3, 3), y: y + r.range(-3, 3),
        vx: M.cos(a) * v, vy: M.sin(a) * v, size: size * r.range(0.7, 1.25), rot: r.range(0, 6.28), spin: r.range(-spin, spin),
        flipX: r.chance(0.5), g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag, life: life * r.range(0.75, 1.15), age: 0,
        base: 1, alpha: 1, fade: 1, dying: false });
    }
    return n;
  };
  /** make room for bursts: drop the oldest ambient/burst particles */
  Weather.prototype._evict = function (n) {
    for (var i = 0; i < this.particles.length && n > 0; i++) {
      var p = this.particles[i];
      if (p.dying && p.kind !== 'burst') { this.particles.splice(i, 1); i--; n--; }
    }
    for (var j = 0; j < this.particles.length && n > 0; j++) {
      if (this.particles[j].kind === 'burst') { this.particles.splice(j, 1); j--; n--; }
    }
  };

  Weather.prototype.update = function (dt, speed) {
    dt = M.min(M.max(dt || 0, 0), 0.1);
    this.time += dt; this.speed = speed || 0;
    var W = this.width, H = this.height, hz = this.horizonY, cx = W / 2, k = this.k;
    var str = 0.035 * this.speed;                         // outward stream rate (1/s) below the horizon
    var keep = 0, ps = this.particles;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], dead = false;
      p.age += dt;
      if (p.kind === 'burst') {
        var dr = M.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        var q = p.age / p.life;
        p.alpha = q < 0.6 ? 1 : M.max(0, 1 - (q - 0.6) / 0.4);
        if (p.age >= p.life) dead = true;
      } else {
        this._move(p, dt, k);
        if (p.stream && p.y > hz) {                       // flow toward the camera like the path does
          var f = str * p.stream * (0.4 + (p.y - hz) / M.max(1, H - hz));
          p.x += (p.x - cx) * f * dt; p.y += (p.y - hz) * f * dt;
        }
        var m = 30 * k;
        if (p.x < -m * 2 || p.x > W + m * 2 || p.y > H + m || p.y < -m * 2) dead = true;
        if (p.life && p.age > p.life) dead = true;
        // fade in / out
        if (p.dying) { p.fade -= dt / 0.8; if (p.fade <= 0) dead = true; }
        else if (p.fade < 1) p.fade = M.min(1, p.fade + dt / 0.8);
        if (p.life) p.fade = M.min(p.fade, clamp((p.life - p.age) / 0.6, 0, 1), clamp(p.age / 0.4, 0, 1));
        var a = p.base * (p.tw ? 0.6 + 0.4 * M.sin(this.time * p.tw * 2 + p.ph) : 1) * clamp(p.fade, 0, 1);
        if (p.layer === 'front') a = M.min(a, FRONT_ALPHA) * this._bandMask(p.x, p.y);
        p.alpha = a;
      }
      if (!dead) ps[keep++] = p;
    }
    ps.length = keep;
    this._topUp(false, false);
  };

  /** front-layer particles fade out in the centre lane band near Pebble (bottom half, middle 40 %) */
  Weather.prototype._bandMask = function (x, y) {
    var W = this.width, H = this.height, hz = this.horizonY;
    var dy = (y - hz) / M.max(1, H - hz);
    if (dy < 0.25) return 1;
    var dx = M.abs(x - W / 2) / (W * 0.5);           // 0 centre … 1 edge
    var inner = 0.4 + 0.2 * dy, outer = inner + 0.12;
    return clamp((dx - inner) / (outer - inner), 0, 1);
  };

  Weather.prototype._move = function (p, dt, k) {
    var t = this.time;
    switch (p.kind) {
      case 'butterfly':
        p.x += p.vx * dt;
        p.y += p.vy * dt + M.cos(t * p.flap * 0.5 + p.ph) * p.amp * 0.5 * dt;
        p.rot = 0.25 * M.sin(t * p.flap + p.ph);       // the renderer can also squash x by |sin| for the flap
        p.flap2 = M.abs(M.sin(t * p.flap + p.ph));
        if (this.rng.chance(dt * 0.15)) { p.vx = -p.vx; p.flipX = p.vx < 0; }
        break;
      case 'leaf': {
        p.y += p.vy * dt;
        var sw = M.sin(t * p.sw + p.ph);
        p.x = p.x0 + sw * p.amp; p.rot = 0.7 * M.cos(t * p.sw + p.ph);
        p.x0 += (p.xs || 0) * dt;
        break;
      }
      case 'sand':
        p.x += p.vx * dt; p.y += p.vy * dt + M.sin(t * 3 + p.ph) * 4 * k * dt;
        p.rot = M.atan2(p.vy, p.vx) * 0.3;
        break;
      case 'dust':
        p.x += p.vx * dt; p.y += M.sin(t * 0.5 + p.ph) * 2 * k * dt; p.rot += 0.05 * dt;
        break;
      case 'petal':
        p.x += (p.vx + M.sin(t * p.sw + p.ph) * p.amp) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        break;
      case 'sparkle':
        p.rot += 0.6 * dt;
        break;
      case 'firefly':
        p.x = p.x0 + M.sin(t * p.wx + p.ph) * p.amp + M.sin(t * p.wx * 2.3 + p.ph * 2) * p.amp * 0.3;
        p.y = p.y0 + M.sin(t * p.wy + p.ph * 1.7) * p.amp * 0.6;
        p.x0 += M.sin(t * 0.1 + p.ph) * 3 * k * dt;
        break;
      case 'star':
        p.x -= 0.6 * k * dt; if (p.x < -10) p.x += this.width + 20;
        break;
    }
  };

  PO.Weather = Weather;
})(window.PO = window.PO || {});
