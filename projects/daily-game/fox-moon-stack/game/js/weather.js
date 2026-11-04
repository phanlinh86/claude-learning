/* Juno's Moon Stack — MS.Weather: ambient space particles per planet + world-space bursts (DESIGN §5.2)
 *
 *   var wx = new MS.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });
 *   wx.update(dt, camY);                                   // camY = world.cam.y (≤ 0 as the tower rises)
 *   wx.burst('sparkle', x, y, 12, { speed, life, size, gravity, spread, up, spin, layer });  // x,y in WORLD coords
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', world?}
 *     world === true → draw at (x, y − camY); otherwise x,y are SCREEN coords
 *   wx.ambient {tint (css rgba or null)}
 *
 * Zones: 0 moon (twinkling sparkles + slow floating moon-dust motes), 1 dunes (red dust streaks blowing
 * sideways in gusts), 2 rings (tumbling ice crystals drifting), 3 comet (soft pink snow with sway + a
 * shooting star every 6–10 s). Ambient particles drift with a little parallax when the camera moves.
 * Front-layer ambient particles never sit in the tower column (x within cx ± 1.6·unit): inside it they
 * are drawn on the back layer. Total count is always < 140.
 */
(function (MS) {
  'use strict';
  var M = Math;

  var CAP = 139;              // hard cap on particles (DESIGN: < 140)
  var MAX_TRAIL = 18;         // shooting-star trail pieces
  var COLUMN = 1.6;           // unit  half-width of the calm tower column for front particles
  var PARALLAX = 0.35;        // ×     ambient particles shift by this share of the camera motion (depth)

  // per zone: counts at 960×540 (scaled gently with screen area), tint
  var ZONES = [
    { twinkle: 26, mote: 16, streak: 0,  ice: 0,  snow: 0,  tint: 'rgba(120,140,255,0.05)', shoot: false },
    { twinkle: 8,  mote: 0,  streak: 30, ice: 0,  snow: 0,  tint: 'rgba(255,120,60,0.07)',  shoot: false },
    { twinkle: 10, mote: 0,  streak: 0,  ice: 26, snow: 0,  tint: 'rgba(90,220,210,0.05)',  shoot: false },
    { twinkle: 8,  mote: 0,  streak: 0,  ice: 0,  snow: 38, tint: 'rgba(255,140,210,0.06)', shoot: true }
  ];
  var KINDS = ['twinkle', 'mote', 'streak', 'ice', 'snow'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // one constructor → one hidden class → fast update loop
  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.pref = o.layer || 'back'; this.layer = this.pref;
    this.world = !!o.world;
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0; this.tw = o.tw || 0;
    this.g = o.g || 0; this.drag = o.drag || 0; this.depth = o.depth === undefined ? 1 : o.depth;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.8 : o.fadeIn;
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new MS.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0;
    this.time = 0;
    this.ambient = { tint: null };
    this._camY = null;
    this._gust = 0; this._gustPh = this.rng.range(0, 6.28);
    this._shootT = 3;
    this._shot = null;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.resize = function (w, h, quiet) {
    this.width = w; this.height = h;
    var L = MS.World && MS.World.computeLayout ? MS.World.computeLayout(w, h) : { unit: M.min(w / 9.6, h / 5.4), cx: w / 2 };
    this.unit = L.unit; this.cx = L.cx;
    this.colHalf = COLUMN * L.unit;
    this.areaK = clamp(M.sqrt((w * h) / (960 * 540)), 0.85, 1.35);
    if (quiet) return;
    // re-scatter ambient particles into the new screen (bursts are world-space: keep them)
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.kind === 'burst' || p.kind === 'trail' || p.kind === 'shoot') continue;
      p.x = this.rng.range(0, w); p.y = this.rng.range(0, h);
    }
    this._fill(false);
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
    this._fill(!!instant);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone][kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._fill = function (instant) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this.particles.length < CAP - MAX_TRAIL - 2; i++) this._spawn(kind, true, instant);
    }
  };

  /** A spawn x for a front particle: anywhere but the tower column (null when there is no room). */
  Weather.prototype._sideX = function () {
    var a = this.cx - this.colHalf, b = this.width - (this.cx + this.colHalf);
    if (a + b < 8) return null;
    var r = this.rng.range(0, a + b);
    return r < a ? r : this.cx + this.colHalf + (r - a);
  };

  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100, o;
    var front = kind !== 'twinkle' && r.chance(0.35);
    var x = r.range(0, W), y = anywhere ? r.range(0, H) : 0;
    if (front) { var sx = this._sideX(); if (sx === null) front = false; else x = sx; }
    switch (kind) {
      case 'twinkle':   // fixed, softly twinkling far sparkles (upper sky; never bright in the column)
        y = r.range(0, H * 0.62);
        if (M.abs(x - this.cx) < this.colHalf * 0.94) x = r.chance(0.5) ? r.range(0, this.cx - this.colHalf) : r.range(this.cx + this.colHalf, W);
        o = { sprite: 'sparkle', size: r.range(5, 11) * u, tw: r.range(1.2, 3.2), ph: r.range(0, 6.28), base: r.range(0.35, 0.8), depth: 0.1 };
        break;
      case 'mote':      // moon dust: big slow motes, tiny upward float (low gravity), lazy sway
        if (!anywhere) y = H + 10;
        o = { sprite: 'puff', size: r.range(5, 12) * u, vx: r.range(-6, 6) * u, vy: -r.range(5, 14) * u, sw: r.range(0.4, 0.9), swAmp: r.range(6, 16) * u,
          ph: r.range(0, 6.28), base: r.range(0.18, 0.4), spin: r.range(-0.3, 0.3), depth: front ? 1 : 0.6 };
        break;
      case 'streak':    // red dust blowing sideways (speed follows the gust)
        if (!anywhere) x = -20;
        o = { sprite: 'dust', size: r.range(5, 11) * u, vx: r.range(90, 160) * u, vy: r.range(-6, 10) * u, sw: r.range(1, 2), swAmp: r.range(4, 10) * u,
          ph: r.range(0, 6.28), base: r.range(0.35, 0.7), rot: 0, depth: front ? 1.1 : 0.7 };
        break;
      case 'ice':       // tumbling ice crystals drifting slowly down-right
        if (!anywhere) y = -16;
        o = { sprite: 'ice', size: r.range(7, 15) * u, vx: r.range(4, 16) * u, vy: r.range(10, 24) * u, sw: r.range(0.3, 0.7), swAmp: r.range(8, 20) * u,
          ph: r.range(0, 6.28), base: r.range(0.45, 0.85), rot: r.range(0, 6.28), spin: r.range(-1.6, 1.6), flipX: r.chance(0.5), depth: front ? 1 : 0.6 };
        break;
      case 'snow':      // soft pink snow with sway
        if (!anywhere) y = -12;
        o = { sprite: 'snow', size: r.range(5, 11) * u, vx: r.range(-4, 6) * u, vy: r.range(28, 52) * u, sw: r.range(0.8, 1.6), swAmp: r.range(10, 22) * u,
          ph: r.range(0, 6.28), base: r.range(0.45, 0.85), depth: front ? 1 : 0.6 };
        break;
    }
    o.kind = kind; o.x = x; o.y = y; o.layer = front ? 'front' : 'back';
    if (instant) o.fadeIn = 0.001;
    var p = new Particle(o);
    p.homeX = x;
    this.particles.push(p);
    return p;
  };

  /** World-space burst at (x, y). opts: {speed, life, size, gravity, spread, up, spin, layer, drag}. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, u = this.unit / 100;
    var reserve = 0;                                   // bursts never starve the ambient set (or a shooting star's trail)
    for (var k = 0; k < KINDS.length; k++) reserve += M.max(0, this._want(KINDS[k]) - this._count(KINDS[k]));
    var room = M.max(0, CAP - MAX_TRAIL - 2 - reserve - this.particles.length);
    n = M.min(n | 0, room);
    var speed = (opts.speed === undefined ? 160 : opts.speed) * u, life = opts.life === undefined ? 0.8 : opts.life;
    var size = (opts.size === undefined ? 14 : opts.size) * u, gr = (opts.gravity === undefined ? 300 : opts.gravity) * u;
    var spread = opts.spread === undefined ? M.PI * 2 : opts.spread, up = opts.up ? 1 : 0;
    var spin = opts.spin === undefined ? 3 : opts.spin;
    for (var i = 0; i < n; i++) {
      var a = up ? -M.PI / 2 + r.range(-spread / 2, spread / 2) * (opts.spread === undefined ? 0.5 : 1) : r.range(-spread / 2, spread / 2) + (opts.angle || 0);
      var v = speed * r.range(0.45, 1);
      this.particles.push(new Particle({ kind: 'burst', sprite: sprite, world: true, layer: opts.layer || 'front',
        x: x + r.range(-4, 4) * u, y: y + r.range(-4, 4) * u, vx: M.cos(a) * v, vy: M.sin(a) * v,
        size: size * r.range(0.7, 1.25), rot: r.range(0, 6.28), spin: r.range(-spin, spin), flipX: r.chance(0.5),
        g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag, life: life * r.range(0.75, 1.15), base: 1, fadeIn: 0.001 }));
    }
    return n;
  };

  Weather.prototype._shoot = function () {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100;
    var fromLeft = r.chance(0.5), sp = r.range(620, 820) * u;
    var a = r.range(0.32, 0.55);
    var p = new Particle({ kind: 'shoot', sprite: 'star', layer: 'back', x: fromLeft ? -20 : W + 20, y: r.range(0.04, 0.3) * H,
      vx: (fromLeft ? 1 : -1) * M.cos(a) * sp, vy: M.sin(a) * sp, size: 16 * u, base: 1, fadeIn: 0.05, life: 2.2, spin: 5, depth: 0 });
    this.particles.push(p);
    this._shot = p;
  };

  Weather.prototype.update = function (dt, camY) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    this.time += dt;
    var u = this.unit / 100, W = this.width, H = this.height, Z = ZONES[this.zone];
    var cam = typeof camY === 'number' ? camY : 0;
    var dCam = this._camY === null ? 0 : cam - this._camY;     // camera moved up (dCam < 0) → particles shift down
    this._camY = cam;
    if (M.abs(dCam) > H) dCam = 0;                               // level change snap: no streak
    // dunes gusts: smooth ≈0.25..1.65 strength from two incommensurate sines
    this._gust = 0.95 + 0.45 * M.sin(this.time * 0.37 + this._gustPh) + 0.25 * M.sin(this.time * 1.13 + 2 * this._gustPh);
    // shooting stars (comet)
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
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        var lf = p.age / p.life;
        p.alpha = clamp(lf < 0.7 ? 1 : 1 - (lf - 0.7) / 0.3, 0, 1);
        p.layer = p.pref;
        if (lf >= 1) kill = true;
      } else if (p.kind === 'trail') {
        p.alpha = clamp(p.base * (1 - p.age / p.life), 0, 1);
        p.size *= M.exp(-1.5 * dt);
        if (p.age >= p.life) kill = true;
      } else if (p.kind === 'shoot') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        p.alpha = clamp(p.age / 0.05, 0, 1) * (p.age > p.life - 0.3 ? (p.life - p.age) / 0.3 : 1);
        if (trails < MAX_TRAIL && this.particles.length < CAP) {
          var t = new Particle({ kind: 'trail', sprite: 'sparkle', layer: 'back', x: p.x - p.vx * 0.012, y: p.y - p.vy * 0.012,
            size: p.size * 0.7, base: 0.8 * p.alpha, life: 0.35, fadeIn: 0.001 });
          t.alpha = t.base; this.particles.push(t); trails++;
        }
        if (p.age >= p.life || p.x < -60 || p.x > W + 60 || p.y > H + 60) { kill = true; if (this._shot === p) this._shot = null; }
      } else {
        // ambient (screen space) + parallax
        p.y -= dCam * PARALLAX * p.depth;
        var wind = p.kind === 'streak' ? this._gust : 1;
        p.ph += p.sw * dt;
        p.x += (p.vx * wind + M.cos(p.ph) * p.swAmp * p.sw) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt * (p.kind === 'streak' ? 0 : 1);
        if (p.kind === 'streak') { p.rot = M.atan2(p.vy, p.vx * wind) ; }
        var a = p.base;
        if (p.kind === 'twinkle') a = p.base * (0.45 + 0.55 * (0.5 + 0.5 * M.sin(this.time * p.tw + p.ph)));
        // fade in / dying fade out
        var fin = clamp(p.age / p.fadeIn, 0, 1);
        if (p.dying) { p.fade -= dt / 0.9; if (p.fade <= 0) kill = true; }
        p.alpha = clamp(a * fin * clamp(p.fade, 0, 1), 0, 1);
        // wrap around the screen (re-enter on the upwind side)
        var m = 24 * u + p.size;
        if (p.x > W + m) { p.x = -m; } else if (p.x < -m) { p.x = W + m; }
        if (p.y > H + m) { p.y = -m; if (p.kind === 'twinkle') p.y = this.rng.range(0, H * 0.4); }
        else if (p.y < -m) { p.y = H + m; }
        // front layer stays out of the tower column
        p.layer = (p.pref === 'front' && M.abs(p.x - this.cx) >= this.colHalf) ? 'front' : 'back';
      }
      if (kill) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    // keep the ambient counts topped up (new ones enter from the edge)
    if (!this._fillT || (this._fillT -= dt) <= 0) { this._fillT = 0.25; this._topUp(); }
  };

  Weather.prototype._topUp = function () {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this.particles.length < CAP - MAX_TRAIL - 2; i++) this._spawn(kind, kind === 'twinkle', false);
    }
  };

  MS.Weather = Weather;
})(window.MS = window.MS || {});
