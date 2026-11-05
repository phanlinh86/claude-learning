/* Bolt's Rooftop Flip — RF.Weather: ambient particles per time of day + bursts (DESIGN §5.2)
 *
 *   var wx = new RF.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });             // 0 dawn, 1 noon, 2 sunset, 3 night (crossfades unless instant)
 *   wx.resize(w, h);
 *   wx.update(dt, world.speed);                        // scrollSpeed px/s: ambient particles drift left with it
 *   wx.burst('bit_pink', x, y, 10, { speed, life, size, gravity, spread, up, spin, layer, angle, drag, scroll });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'} — x, y are SCREEN coords
 *   wx.ambient {tint (css rgba or null)}
 *
 * Depth: every ambient particle drifts left by depth × scrollSpeed (stars 0.02 like the sky, back ≈ 0.2,
 * front ≈ 1.1) on top of its own motion. Front-layer particles are small, sparse and alpha ≤ 0.5 and never
 * glowing dots (no pink/yellow/cyan in the corridor). Night stars live only in the sky band (y < ceilY − 0.5 u).
 * Bursts are screen-space and by default stay where they were made (opts.scroll = share of the scroll they
 * follow, e.g. 1 for a burst left behind on the roof). Total count is always < 140.
 */
(function (RF) {
  'use strict';
  var M = Math;

  var CAP = 139;              // hard cap (DESIGN: < 140)
  var MAX_TRAIL = 16;         // shooting-star trail pieces
  var FRONT_ALPHA = 0.5;      // front-layer alpha ceiling (DESIGN)
  var DEPTH = { star: 0.02, back: 0.2, front: 1.1 };

  // counts at 960×540 (scaled gently with screen area); share = chance a new particle is on the front layer
  var ZONES = [
    { key: 'dawn',   mist: 9,  dew: 12, seed: 0,  leaf: 0, mote: 0,  star: 0,  sparkle: 0,  tint: 'rgba(255,170,190,0.05)', shoot: false },
    { key: 'noon',   mist: 0,  dew: 0,  seed: 22, leaf: 4, mote: 0,  star: 0,  sparkle: 0,  tint: null,                     shoot: false },
    { key: 'sunset', mist: 0,  dew: 0,  seed: 0,  leaf: 8, mote: 24, star: 0,  sparkle: 0,  tint: 'rgba(255,130,60,0.06)',  shoot: false },
    { key: 'night',  mist: 0,  dew: 0,  seed: 0,  leaf: 0, mote: 0,  star: 34, sparkle: 10, tint: 'rgba(30,50,140,0.08)',   shoot: true }
  ];
  var KINDS = ['mist', 'dew', 'seed', 'leaf', 'mote', 'star', 'sparkle'];
  var FRONT = { mist: 0, dew: 0, seed: 0.3, leaf: 0.35, mote: 0, star: 0, sparkle: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back';
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0; this.tw = o.tw || 0;
    this.g = o.g || 0; this.drag = o.drag || 0; this.depth = o.depth === undefined ? 0.2 : o.depth;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.8 : o.fadeIn;
    this.scroll = o.scroll || 0;
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new RF.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0;
    this.ambient = { tint: null };
    this._shootT = 4; this._shot = null; this._fillT = 0;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width, oldH = this.height;
    this.width = w; this.height = h;
    var L = RF.World && RF.World.computeLayout ? RF.World.computeLayout(w, h)
      : { unit: M.min(w / 9.6, h / 5.4), ceilY: 0.53 * h - 1.45 * M.min(w / 9.6, h / 5.4), floorY: 0.53 * h + 1.45 * M.min(w / 9.6, h / 5.4) };
    this.unit = L.unit; this.ceilY = L.ceilY; this.floorY = L.floorY;
    this.skyY = M.max(12, L.ceilY - 0.5 * L.unit);      // night stars stay above this
    this.areaK = clamp(M.sqrt((w * h) / (960 * 540)), 0.85, 1.35);
    if (quiet) return;
    // keep everything at the same relative screen place
    var kx = oldW ? w / oldW : 1, ky = oldH ? h / oldH : 1;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= kx; p.y *= ky;
      if (p.kind === 'star' && p.y > this.skyY) p.y = this.rng.range(4, this.skyY);
    }
    this._trim(); this._topUp(true);
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var Z = ZONES[this.zone], instant = opts && opts.instant;
    this.ambient.tint = Z.tint;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst') continue;
      if (instant) this.particles.splice(i, 1); else p.dying = true;
    }
    this._shot = null;
    this._shootT = this.rng.range(2.5, 5);
    this._topUp(true, !!instant);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone][kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  /** Drop extra ambient particles (e.g. after a resize to a smaller screen). */
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
      for (var i = 0; i < need && this.particles.length < CAP - MAX_TRAIL - 2; i++) this._spawn(kind, anywhere, instant);
    }
  };

  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100, o;
    var front = r.chance(FRONT[kind]);
    var x = anywhere ? r.range(0, W) : W + r.range(10, 60) * u, y = r.range(0, H);
    switch (kind) {
      case 'mist':     // dawn: big soft wisps, slow, low over the rooftops and in the far city
        y = r.range(0.35, 0.95) * H;
        o = { sprite: 'mist', size: r.range(90, 170) * u, vx: -r.range(4, 12) * u, sw: r.range(0.15, 0.3), swAmp: r.range(4, 10) * u,
          ph: r.range(0, 6.28), base: r.range(0.12, 0.28), flipX: r.chance(0.5) };
        break;
      case 'dew':      // dawn: tiny dew sparkles that twinkle in place (back)
        o = { sprite: 'sparkle', size: r.range(5, 10) * u, tw: r.range(1.5, 3.5), ph: r.range(0, 6.28), base: r.range(0.3, 0.6), rot: r.range(0, 1.5) };
        break;
      case 'seed':     // noon: dandelion seeds floating, swaying on their parachutes
        if (!anywhere) y = r.range(0, 0.85) * H;
        o = { sprite: 'seed', size: (front ? r.range(9, 13) : r.range(8, 14)) * u, vx: -r.range(8, 22) * u, vy: r.range(-6, 8) * u,
          sw: r.range(0.7, 1.3), swAmp: r.range(10, 22) * u, ph: r.range(0, 6.28), base: front ? r.range(0.3, FRONT_ALPHA) : r.range(0.45, 0.85),
          rot: r.range(-0.3, 0.3), spin: 0 };
        break;
      case 'leaf':     // noon/sunset: a tumbling leaf drifting down-left
        if (!anywhere && r.chance(0.5)) { y = -r.range(10, 30) * u; x = r.range(0.2 * W, W * 1.1); }
        o = { sprite: 'leaf', size: (front ? r.range(10, 14) : r.range(9, 15)) * u, vx: -r.range(15, 35) * u, vy: r.range(14, 30) * u,
          sw: r.range(1.0, 1.8), swAmp: r.range(12, 24) * u, ph: r.range(0, 6.28), base: front ? r.range(0.35, FRONT_ALPHA) : r.range(0.5, 0.85),
          rot: r.range(0, 6.28), spin: r.range(-2.2, 2.2), flipX: r.chance(0.5) };
        break;
      case 'mote':     // sunset: warm glow motes rising slowly (back only: never confused with fireflies)
        if (!anywhere) { y = H + r.range(5, 20) * u; x = r.range(0, W * 1.1); }
        o = { sprite: 'mote', size: r.range(5, 11) * u, vx: -r.range(2, 8) * u, vy: -r.range(8, 20) * u, sw: r.range(0.4, 0.9), swAmp: r.range(6, 14) * u,
          ph: r.range(0, 6.28), base: r.range(0.25, 0.55), tw: r.range(0.8, 1.6) };
        break;
      case 'star':     // night: twinkling stars in the sky band only
        y = r.range(4, this.skyY);
        o = { sprite: 'star', size: r.range(4, 9) * u, tw: r.range(1.0, 3.0), ph: r.range(0, 6.28), base: r.range(0.45, 0.95), rot: r.range(0, 1.2),
          depth: DEPTH.star };
        break;
      case 'sparkle':  // night: soft sparkles over the city (back, dim)
        y = r.range(0, 0.8) * H;
        o = { sprite: 'sparkle', size: r.range(5, 9) * u, tw: r.range(1.2, 2.6), ph: r.range(0, 6.28), base: r.range(0.18, 0.35),
          vx: -r.range(2, 6) * u, vy: -r.range(1, 4) * u };
        break;
    }
    o.kind = kind; o.x = x; o.y = y; o.layer = front ? 'front' : 'back';
    if (o.depth === undefined) o.depth = front ? DEPTH.front : DEPTH.back;
    if (instant) o.fadeIn = 0.001;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  /** Screen-space burst at (x, y). opts: {speed, life, size, gravity, spread, up, spin, layer, angle, drag, scroll}. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, u = this.unit / 100;
    var reserve = 0;                                    // bursts never starve the ambient set or a shooting star
    for (var k = 0; k < KINDS.length; k++) reserve += M.max(0, this._want(KINDS[k]) - this._count(KINDS[k]));
    var room = M.max(0, CAP - MAX_TRAIL - 2 - reserve - this.particles.length);
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
        g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag, life: life * r.range(0.75, 1.15), base: 1, fadeIn: 0.001,
        scroll: opts.scroll || 0 }));
    }
    return n;
  };

  Weather.prototype._shoot = function () {
    var r = this.rng, W = this.width, u = this.unit / 100;
    var sp = r.range(560, 760) * u, a = r.range(0.22, 0.42);
    var p = new Particle({ kind: 'shoot', sprite: 'shoot', layer: 'back', x: W * r.range(0.45, 1.0), y: -10,
      vx: -M.cos(a) * sp, vy: M.sin(a) * sp, size: 48 * u, base: 0.95, fadeIn: 0.05, life: 1.4, depth: 0 });
    p.rot = M.atan2(p.vy, p.vx);
    this.particles.push(p);
    this._shot = p;
  };

  Weather.prototype.update = function (dt, scrollSpeed) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    this.time += dt;
    var u = this.unit / 100, W = this.width, H = this.height, Z = ZONES[this.zone];
    var scroll = typeof scrollSpeed === 'number' && isFinite(scrollSpeed) ? scrollSpeed : 0;
    if (Z.shoot) {
      this._shootT -= dt;
      if (this._shootT <= 0 && !this._shot) { this._shoot(); this._shootT = this.rng.range(6, 10); }
    }
    var trails = 0, i, p;
    for (i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'trail') trails++;
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.age += dt;
      var kill = false;
      if (p.kind === 'burst') {
        var k = M.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.g * dt;
        p.x += (p.vx - p.scroll * scroll) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        var lf = p.age / p.life;
        p.alpha = clamp(lf < 0.65 ? 1 : 1 - (lf - 0.65) / 0.35, 0, 1);
        if (lf >= 1) kill = true;
      } else if (p.kind === 'trail') {
        p.alpha = clamp(p.base * (1 - p.age / p.life), 0, 1);
        p.size *= M.exp(-1.5 * dt);
        if (p.age >= p.life) kill = true;
      } else if (p.kind === 'shoot') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.alpha = clamp(p.age / 0.05, 0, 1) * (p.age > p.life - 0.3 ? clamp((p.life - p.age) / 0.3, 0, 1) : 1) * p.base;
        if (trails < MAX_TRAIL && this.particles.length < CAP) {
          var t = new Particle({ kind: 'trail', sprite: 'sparkle', layer: 'back', x: p.x - p.vx * 0.03, y: p.y - p.vy * 0.03,
            size: 7 * u, base: 0.7 * p.alpha, life: 0.35, fadeIn: 0.001 });
          t.alpha = t.base; this.particles.push(t); trails++;
        }
        if (p.age >= p.life || p.x < -80 || p.y > this.skyY + 40 * u) { kill = true; if (this._shot === p) this._shot = null; }
      } else {
        // ambient: own drift + sway + depth share of the scroll
        p.ph += p.sw * dt;
        p.x += (p.vx + M.cos(p.ph) * p.swAmp * p.sw - p.depth * scroll) * dt;
        p.y += (p.vy + (p.kind === 'seed' ? M.sin(p.ph * 0.7) * 6 * u : 0)) * dt;
        p.rot += p.spin * dt;
        if (p.kind === 'seed') p.rot = 0.25 * M.sin(p.ph);
        var a = p.base;
        if (p.tw) a = p.base * (0.4 + 0.6 * (0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph)));
        var fin = clamp(p.age / p.fadeIn, 0, 1);
        if (p.dying) { p.fade -= dt / 0.9; if (p.fade <= 0) kill = true; }
        p.alpha = clamp(a * fin * clamp(p.fade, 0, 1), 0, 1);
        if (p.layer === 'front' && p.alpha > FRONT_ALPHA) p.alpha = FRONT_ALPHA;
        // wrap: leave on the left → come back on the right (new height); out at top/bottom → re-enter
        var m = 20 * u + p.size;
        if (p.x < -m) {
          p.x = W + m * 0.5;
          p.y = p.kind === 'star' ? this.rng.range(4, this.skyY) : this.rng.range(0, H);
        } else if (p.x > W + 2 * m) p.x = -m;
        if (p.y > H + m) p.y = -m;
        else if (p.y < -m) p.y = H + m;
        if (p.kind === 'star' && p.y > this.skyY) p.y = this.rng.range(4, this.skyY);
      }
      if (kill) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    if ((this._fillT -= dt) <= 0) { this._fillT = 0.25; this._topUp(false); }
  };

  RF.Weather = Weather;
})(window.RF = window.RF || {});
