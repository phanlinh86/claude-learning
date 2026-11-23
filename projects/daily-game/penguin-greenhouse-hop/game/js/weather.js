/* Puddle's Greenhouse Hop — PH.Weather: screen-space ambient particles per greenhouse floor + bursts (DESIGN §5.2)
 *
 *   var wx = new PH.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });   // 0 potting, 1 fern, 2 balcony, 3 roof (old ones fade out unless instant)
 *   wx.resize(w, h);
 *   wx.update(dt, climbVy);                 // climbVy = camera speed in px/s (+ = climbing: things stream down faster)
 *   wx.burst('sparkle', x, y, 6, { speed, life, size, gravity, spread, up, spin, layer, drag, angle });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', ar}
 *     — logical SCREEN px; `size` = drawn WIDTH in px, `ar` = height / width (raindrop streaks 3–6, drip 1.3,
 *       everything else 1). Sprites: raindrop, drip, splash, mist, petal, leafbit, sparkle, glow, soil, puff, bubble.
 *   wx.ambient {tint (css rgba)};  wx.setWind() is a no-op kept for compatibility.
 *
 * potting  — rain runnels crawling DOWN the glass (back layer): stick-slip motion (a drop clings, then lets go and
 *            accelerates), a wobbly path, long `ar` = a little trail; drips falling straight from the top under
 *            gravity with quadratic drag (terminal speed); slow dust motes (tiny `puff`s, Brownian drift).
 * fern     — big soft `mist` puffs drifting sideways, fading in and out; drips; `leafbit`s tumbling down.
 * balcony  — steady `raindrop` streaks in 2 depth layers (front: fast, bigger, faint; back: slow, small, fainter),
 *            slight slant, rot along the velocity; `splash` crowns popping at the sides; `petal`s fluttering.
 * roof     — thin drizzle (fewer, slower, shorter drops); `sparkle`s twinkling; occasional `bubble`s rising.
 * Falling leaves/petals: a pendulum swing (phase φ, tilt = A·sin φ) — gliding fastest sideways mid-swing and
 * dropping fastest at the ends — with velocities relaxed toward that target by drag (no teleporting).
 * Front-layer particles are small, sparse and pale (alpha ≤ 0.5); no background particle is ever yellow (`glow`
 * is only used by bursts for firefly pickups). Sizes scale with the screen (k = min(W, H)/540); counts scale
 * gently with area; the total is capped at 179 (< 180).
 */
(function (PH) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 179, RESERVE = 24, FRONT_ALPHA = 0.5, FADE = 0.8;

  // populations at 960×540 (× areaK) + timed pops per second
  var ZONES = [
    { key: 'potting', counts: { runnel: 18, mote: 14 },                 rates: { drip: 0.9 },  tint: 'rgba(120,140,165,0.06)' },
    { key: 'fern',    counts: { mist: 7, leafbit: 9 },                  rates: { drip: 1.2 },  tint: 'rgba(110,160,140,0.07)' },
    { key: 'balcony', counts: { rainBack: 44, rainFront: 16, petal: 8 }, rates: { splash: 4 }, tint: 'rgba(100,100,140,0.08)' },
    { key: 'roof',    counts: { drizzle: 24, sparkle: 12 },             rates: { bubble: 0.35 }, tint: 'rgba(150,120,170,0.06)' }
  ];
  var POP = ['runnel', 'mote', 'mist', 'leafbit', 'rainBack', 'rainFront', 'petal', 'drizzle', 'sparkle'];
  var SPRITE = { runnel: 'raindrop', mote: 'puff', mist: 'mist', leafbit: 'leafbit', rainBack: 'raindrop', rainFront: 'raindrop',
    petal: 'petal', drizzle: 'raindrop', sparkle: 'sparkle', drip: 'drip', splash: 'splash', bubble: 'bubble' };
  var FRONT = { mote: 0.15, leafbit: 0.25, petal: 0.3, sparkle: 0.2, drip: 0.25, rainFront: 1 };
  // falling water: gravity px/s² and terminal speed px/s (both × k); quadratic drag kd = g / vt²
  var WATER = { drip: [1400, 620], rainBack: [1400, 430], rainFront: [1400, 720], drizzle: [900, 300] };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new PH.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.climb = 0;
    this.ambient = { tint: null };
    this._acc = {};
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.setHorizon = function () {};    // compatibility no-op (sister games had a horizon)
  Weather.prototype.setWind = function () {};       // compatibility no-op (the fork had wind)

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width || w, oldH = this.height || h;
    this.width = M.max(1, w); this.height = M.max(1, h);
    this.k = clamp(M.min(this.width, this.height) / 540, 0.8, 1.6);
    this.areaK = clamp(M.sqrt((this.width * this.height) / (960 * 540)), 0.8, 1.4);
    if (quiet) return;
    var kx = this.width / oldW, ky = this.height / oldH;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x *= kx; p.y *= ky; if (p.x0 !== undefined) p.x0 *= kx;
    }
    this._trim(); this._topUp(true, true);
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var Z = ZONES[this.zone], instant = !!(opts && opts.instant);
    this.ambient.tint = Z.tint;
    this._acc = {};
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst') continue;
      if (instant) this.particles.splice(i, 1); else p.dying = true;   // crossfade: old ones fade out
    }
    this._topUp(true, instant);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone].counts[kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._trim = function () {
    for (var k = 0; k < POP.length; k++) {
      var extra = this._count(POP[k]) - this._want(POP[k]);
      for (var i = this.particles.length - 1; i >= 0 && extra > 0; i--) {
        var p = this.particles[i];
        if (p.kind === POP[k] && !p.dying) { p.dying = true; extra--; }   // fades out (no popping)
      }
    }
  };
  Weather.prototype._topUp = function (anywhere, instant) {
    for (var k = 0; k < POP.length; k++) {
      var kind = POP[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this.particles.length < CAP - RESERVE; i++) this._spawn(kind, anywhere, instant);
    }
  };

  /** a new ambient particle. `anywhere` = scatter over the screen (level start), else enter from its edge */
  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, k = this.k;
    var front = r.chance(FRONT[kind] || 0);
    var o = { kind: kind, sprite: SPRITE[kind], layer: front ? 'front' : 'back', x: 0, y: 0, size: 10, rot: 0, flipX: r.chance(0.5),
      alpha: 0, ar: 1, vx: 0, vy: 0, spin: 0, ph: r.range(0, TAU), base: 1, age: 0, life: 0,
      fade: instant ? 1 : 0, dying: false, par: front ? 1 : 0.55 };
    switch (kind) {
      case 'runnel': {              // a drop crawling down the glass: clings, lets go, wobbles, leaves a trail
        o.layer = 'back'; o.par = 0.3;
        o.size = r.range(3, 4.5) * k; o.ar = r.range(3, 6);
        o.x0 = r.chance(0.7) ? (r.chance(0.5) ? r.range(0, 0.33 * W) : r.range(0.67 * W, W)) : r.range(0, W);
        o.x = o.x0; o.y = anywhere ? r.range(0, H) : r.range(-0.15 * H, -10 * k);
        o.vMax = r.range(45, 110) * k; o.stick = r.range(0, 0.6); o.wob = r.range(4, 9) * k; o.wf = r.range(0.015, 0.03) / k;
        o.base = r.range(0.25, 0.45);
        break;
      }
      case 'mote': {                // dust in the window light: slow Brownian drift, gentle upward bias
        o.size = r.range(2.5, 4.5) * k; o.x = r.range(0, W); o.y = r.range(0, H);
        o.vx = r.range(-6, 6) * k; o.vy = r.range(-6, 2) * k;
        o.base = front ? r.range(0.2, 0.3) : r.range(0.2, 0.4); o.tw = r.range(0.6, 1.4); o.par = front ? 0.9 : 0.4;
        break;
      }
      case 'mist': {                // a big soft puff drifting sideways, fading in and out over its life
        o.layer = 'back'; o.par = 0.25;
        o.size = r.range(90, 180) * k; o.x = r.range(-0.1 * W, 1.1 * W); o.y = r.range(0.05 * H, 0.95 * H);
        o.vx = r.sign() * r.range(8, 18) * k; o.life = r.range(6, 10); o.age = anywhere ? r.range(0, o.life * 0.7) : 0;
        o.base = r.range(0.12, 0.25); o.fade = 1;
        break;
      }
      case 'leafbit': case 'petal': {   // pendulum flutter (see the header)
        var pet = kind === 'petal';
        o.size = (front ? r.range(9, 12) : r.range(9, 14)) * k;
        o.x = r.range(-0.05 * W, 1.05 * W); o.y = anywhere ? r.range(0, H) : -15 * k;
        o.om = r.range(1.6, 2.6); o.A = r.range(0.5, 0.9); o.glide = r.range(28, 50) * k; o.fall = r.range(26, 40) * k * (pet ? 0.85 : 1);
        o.drift = r.range(-8, 8) * k; o.rot0 = r.range(-0.4, 0.4); o.vy = o.fall * 0.6;
        o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.55, 0.85);
        break;
      }
      case 'rainBack': case 'rainFront': case 'drizzle': {
        var fr = kind === 'rainFront', dz = kind === 'drizzle';
        o.layer = fr ? 'front' : 'back'; o.par = fr ? 1 : 0.5;
        o.size = (fr ? r.range(4, 5.5) : dz ? r.range(2.5, 3.5) : r.range(2.8, 3.8)) * k;
        o.ar = fr ? 5 : dz ? 3 : 4;
        o.x = r.range(-0.15 * W, 1.1 * W); o.y = anywhere ? r.range(-0.1 * H, H) : r.range(-0.3 * H, -20 * k);
        var vt = WATER[kind][1] * k;
        o.vy = vt * r.range(0.85, 1); o.slant = fr ? 0.13 : 0.1;
        o.base = fr ? r.range(0.25, 0.4) : dz ? r.range(0.25, 0.4) : r.range(0.3, 0.5);
        break;
      }
      case 'sparkle': {             // twinkles in place (alpha pulses), slow drift, then moves on
        o.size = (front ? r.range(7, 10) : r.range(8, 14)) * k; o.x = r.range(0, W); o.y = r.range(0, H);
        o.vx = r.range(-4, 4) * k; o.vy = r.range(-4, 4) * k; o.tw = r.range(1.5, 3); o.life = r.range(3, 6);
        o.age = anywhere ? r.range(0, o.life) : 0; o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.5, 0.85); o.fade = 1;
        o.spin = r.range(-0.5, 0.5);
        break;
      }
      // ---- timed pops
      case 'drip': {                // a single drop let go at the top: starts at rest, accelerates to terminal speed
        o.size = (front ? r.range(5, 7) : r.range(6, 9)) * k; o.ar = 1.3;
        o.x = r.chance(0.6) ? (r.chance(0.5) ? r.range(0, 0.33 * W) : r.range(0.67 * W, W)) : r.range(0, W);
        o.y = -10 * k; o.vy = 0; o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.5, 0.8); o.fade = 1; o.par = front ? 1 : 0.6;
        o.flipX = false;
        break;
      }
      case 'splash': {              // a tiny crown of droplets that pops and fades (at the sides)
        o.layer = 'back'; o.size = r.range(10, 15) * k;
        o.x = r.chance(0.5) ? r.range(0, 0.3 * W) : r.range(0.7 * W, W); o.y = r.range(0.2 * H, 0.95 * H);
        o.life = r.range(0.3, 0.42); o.base = r.range(0.45, 0.7); o.fade = 1; o.par = 1; o.s0 = o.size;
        break;
      }
      case 'bubble': {              // a pale bubble rising (buoyancy vs drag), wobbling, then it pops (fades fast)
        o.layer = 'back'; o.size = r.range(10, 18) * k;
        o.x = r.range(0.05 * W, 0.95 * W); o.y = H + 15 * k; o.vy = -r.range(10, 20) * k; o.vt = r.range(35, 55) * k;
        o.life = r.range(4, 7); o.base = r.range(0.35, 0.6); o.fade = 1; o.par = 0.5; o.wob = r.range(8, 16) * k; o.x0 = o.x;
        break;
      }
    }
    if (o.layer === 'front') o.base = M.min(o.base, FRONT_ALPHA);
    this.particles.push(o);
    return o;
  };

  /** Screen-space burst at (x, y). opts: {speed px/s, life s, size px, gravity px/s², spread rad, up, spin, layer, drag, angle} */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng;
    n = M.max(0, n | 0);
    var room = CAP - this.particles.length;
    if (room < n) this._evict(n - room);
    n = M.min(n, CAP - this.particles.length);
    var speed = opts.speed === undefined ? 160 : opts.speed, life = opts.life === undefined ? 0.7 : opts.life;
    var size = opts.size === undefined ? 12 : opts.size, gr = opts.gravity === undefined ? 300 : opts.gravity;
    var spread = opts.spread === undefined ? (opts.up ? M.PI * 0.9 : TAU) : opts.spread;
    var spin = opts.spin === undefined ? 3 : opts.spin, dir = opts.up ? -M.PI / 2 : (opts.angle || 0);
    for (var i = 0; i < n; i++) {
      var a = dir + r.range(-spread / 2, spread / 2), v = speed * r.range(0.45, 1);
      this.particles.push({ kind: 'burst', sprite: sprite, layer: opts.layer || 'front', x: x + r.range(-3, 3), y: y + r.range(-3, 3),
        vx: M.cos(a) * v, vy: M.sin(a) * v, size: size * r.range(0.7, 1.25), rot: r.range(0, TAU), spin: r.range(-spin, spin),
        flipX: r.chance(0.5), ar: sprite === 'raindrop' ? 4 : sprite === 'drip' ? 1.3 : 1, g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag,
        life: life * r.range(0.75, 1.15), age: 0, base: 1, alpha: 1, fade: 1, dying: false });
    }
    return n;
  };
  /** make room for bursts: drop fading ambient particles first, then the oldest bursts, then any ambient */
  Weather.prototype._evict = function (n) {
    var ps = this.particles, i;
    for (i = 0; i < ps.length && n > 0; i++) if (ps[i].dying && ps[i].kind !== 'burst') { ps.splice(i, 1); i--; n--; }
    for (i = 0; i < ps.length && n > 0; i++) if (ps[i].kind === 'burst') { ps.splice(i, 1); i--; n--; }
    for (i = 0; i < ps.length && n > 0; i++) { ps.splice(i, 1); i--; n--; }
  };

  Weather.prototype.update = function (dt, climbVy) {
    dt = M.min(M.max(+dt || 0, 0), 0.1);
    this.time += dt;
    this.climb = clamp(+climbVy || 0, -200, 1600);   // camera speed px/s: a big jump never teleports everything
    var W = this.width, H = this.height, k = this.k, ps = this.particles, keep = 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], dead = false;
      p.age += dt;
      if (p.kind === 'burst') {
        var dr = M.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt + this.climb * dt; p.rot += p.spin * dt;
        var q = p.age / p.life;
        p.alpha = q < 0.6 ? 1 : M.max(0, 1 - (q - 0.6) / 0.4);
        if (p.age >= p.life) dead = true;
      } else {
        dead = this._move(p, dt, k, W, H);
        if (p.life && p.age > p.life) dead = true;
        if (p.dying) { p.fade -= dt / FADE; if (p.fade <= 0) dead = true; }
        else if (p.fade < 1) p.fade = M.min(1, p.fade + dt / FADE);
        var a = p.base * clamp(p.fade, 0, 1) * (p.env === undefined ? 1 : p.env);
        if (p.layer === 'front') a = M.min(a, FRONT_ALPHA);
        p.alpha = clamp(a, 0, 1);
      }
      if (!dead) ps[keep++] = p;
    }
    ps.length = keep;
    // timed pops (deterministic rng, steady rate)
    var rates = ZONES[this.zone].rates;
    for (var kind in rates) {
      this._acc[kind] = (this._acc[kind] || 0) + dt * rates[kind] * this.areaK;
      while (this._acc[kind] >= 1) { this._acc[kind] -= 1; if (ps.length < CAP - RESERVE) this._spawn(kind, true, true); }
    }
    this._trim();
    this._topUp(false, false);
  };

  /** falling water: dv/dt = g − kd·v² (terminal speed vt = √(g/kd)) */
  function fallV(v, g, vt, dt) { return v + (g - g * v * M.abs(v) / (vt * vt)) * dt; }

  /** per-kind motion; returns true when the particle is done (populations are re-spawned by _topUp) */
  Weather.prototype._move = function (p, dt, k, W, H) {
    var t = this.time, climb = this.climb * (p.par || 1), m = 40 * k, r = this.rng;
    switch (p.kind) {
      case 'runnel': {
        if (p.stick > 0) { p.stick -= dt; p.vy *= M.exp(-12 * dt); }          // clinging to the glass
        else {
          p.vy += (p.vMax - p.vy) * (1 - M.exp(-3 * dt));                     // let go: speeds up (surface drag caps it)
          if (r.chance(dt * 0.5)) p.stick = r.range(0.2, 0.9);                // caught on a dry spot again
        }
        p.y += (p.vy + climb) * dt;
        var nx = p.x0 + p.wob * M.sin(p.y * p.wf + p.ph);
        p.rot = -M.atan2(nx - p.x, M.max(1e-3, (p.vy + 1) * dt)) * 0.3;        // leans along its wobble
        p.x = nx;
        if (p.y > H + m * 2) return true;
        return false;
      }
      case 'mote': {
        p.vx += r.range(-1, 1) * 30 * k * dt - p.vx * 0.8 * dt;
        p.vy += (r.range(-1, 1) * 30 * k - 3 * k) * dt - p.vy * 0.8 * dt;
        p.x += p.vx * dt; p.y += (p.vy + climb) * dt;
        p.env = 0.7 + 0.3 * M.sin(t * p.tw + p.ph);
        if (p.x < -m) p.x += W + m; else if (p.x > W + m) p.x -= W + m;
        if (p.y < -m) p.y += H + m;
        break;
      }
      case 'mist': {
        p.x += p.vx * dt; p.y += climb * dt;
        p.env = M.sin(M.PI * clamp(p.age / p.life, 0, 1));                  // fade in, linger, fade out
        p.size += 4 * k * dt;                                                 // spreads out slowly
        if (p.x < -p.size || p.x > W + p.size) return true;
        if (p.y > H + p.size) return true;
        return false;
      }
      case 'leafbit': case 'petal': {
        var phi = t * p.om + p.ph, sw = M.sin(phi);
        var tvx = p.drift + p.glide * M.cos(phi);                             // glides mid-swing
        var tvy = p.fall * (0.45 + 0.9 * M.abs(sw));                          // drops at the ends of the swing
        var dr = 1 - M.exp(-3 * dt);                                          // air drag relaxes toward the target
        p.vx += (tvx - p.vx) * dr; p.vy += (tvy - p.vy) * dr;
        p.x += p.vx * dt; p.y += (p.vy + climb) * dt;
        p.rot = p.rot0 + p.A * sw;
        break;
      }
      case 'rainBack': case 'rainFront': case 'drizzle': case 'drip': {
        var wv = WATER[p.kind];
        p.vy = fallV(p.vy, wv[0] * k, wv[1] * k, dt);
        var vx = p.slant ? p.vy * p.slant : 0;
        p.x += vx * dt; p.y += (p.vy + climb) * dt;
        if (p.slant) p.rot = -M.atan2(vx, p.vy + climb);                     // the streak points along its velocity
        if (p.y > H + 30 * k) return true;
        if (p.x < -0.2 * W || p.x > 1.2 * W) return true;
        return false;
      }
      case 'splash': {
        var e = clamp(p.age / p.life, 0, 1);
        p.size = p.s0 * (0.5 + 0.6 * M.sqrt(e));
        p.env = 1 - e * e;
        p.y += climb * dt;
        return false;
      }
      case 'sparkle': {
        p.x += p.vx * dt; p.y += (p.vy + climb) * dt; p.rot += p.spin * dt;
        var s = M.max(0, M.sin(t * p.tw + p.ph));
        p.env = s * s * M.sin(M.PI * clamp(p.age / p.life, 0, 1));
        break;
      }
      case 'bubble': {
        p.vy += (-p.vt - p.vy) * (1 - M.exp(-1.5 * dt));                     // buoyancy vs drag → rises at vt
        p.y += (p.vy + climb) * dt;
        p.x = p.x0 + p.wob * M.sin(t * 2.2 + p.ph);
        var u = p.age / p.life;
        p.env = u < 0.85 ? 1 : M.max(0, 1 - (u - 0.85) / 0.15);               // pops at the end of its life
        p.size *= 1 + 0.03 * dt;
        if (p.y < -m) return true;
        return false;
      }
    }
    // generic exits for drifting things
    if (p.y > H + m) return true;
    if (p.y < -H) return true;
    if (p.x < -W * 0.3 || p.x > W * 1.3) return true;
    return false;
  };

  Weather.ZONES = ZONES;
  PH.Weather = Weather;
})(window.PH = window.PH || {});
