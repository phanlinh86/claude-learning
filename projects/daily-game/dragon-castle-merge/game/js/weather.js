/* Ember's Glow Castle — EG.Weather: ambient particles per castle place (DESIGN §5.2)
 *
 *   var wx = new EG.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });
 *   wx.update(dt, { boardX, boardY, boardW, boardH });       // the board rectangle (world.layout)
 *   wx.burst('sparkle', x, y, 12, { speed, gravity, drag, life, size, layer, up, spread, spin });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', glow?}
 *   wx.ambient {tint (css rgba or null), glow (0..1)}
 *
 * Zones: 0 courtyard (fireflies + leaves), 1 cellar (drips + crystal sparkles),
 * 2 library (dust motes in a light shaft + tumbling pages), 3 tower (twinkling stars + shooting stars).
 * Front-layer AMBIENT particles never enter the calm band (board + 30 px, and the strip above it where
 * Ember flies); bursts (merge effects) are drawn where they happen. Total count is always ≤ CAP (139).
 */
(function (EG) {
  'use strict';
  var M = Math;

  var CAP = 139;
  var MAX_BURST = 48, MAX_TRAIL = 22, MAX_SPLASH = 12;
  var MARGIN = 30;            // px  calm band around the board (DESIGN §2)

  var ZONES = [
    { firefly: 24, leaf: 10, drip: 0, crystal: 0,  dust: 0,  page: 0, star: 0,  tint: 'rgba(255,170,210,0.05)', glow: 0.35, shoot: 0 },
    { firefly: 0,  leaf: 0,  drip: 9, crystal: 22, dust: 0,  page: 0, star: 0,  tint: 'rgba(40,130,210,0.08)',  glow: 0.5,  shoot: 0 },
    { firefly: 0,  leaf: 0,  drip: 0, crystal: 0,  dust: 42, page: 2, star: 0,  tint: 'rgba(255,205,140,0.06)', glow: 0.3,  shoot: 0 },
    { firefly: 0,  leaf: 0,  drip: 0, crystal: 0,  dust: 0,  page: 0, star: 48, tint: 'rgba(20,30,100,0.10)',   glow: 0.6,  shoot: 1 }
  ];
  var KINDS = ['firefly', 'leaf', 'drip', 'crystal', 'dust', 'page', 'star'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // every particle gets the same field set from one constructor (one hidden class → fast update loop)
  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back'; this.glow = !!o.glow;
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.ph2 = o.ph2 || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0;
    this.tw = o.tw || 0; this.spd = o.spd || 0; this.g = o.g || 0; this.drag = o.drag || 0;
    this.life = o.life || 0; this.age = 0; this.hang = o.hang || 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.6 : o.fadeIn;
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new EG.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.particles = [];
    this.zone = 0;
    this.time = 0;
    this.ambient = { tint: null, glow: 0 };
    this._glow = 0;
    this._shootT = 3;
    this._shot = null;
    this._defaultRect();
    this.setLevel(0, { instant: true });
  }

  Weather.prototype._defaultRect = function () {
    var L = EG.World && EG.World.computeLayout ? EG.World.computeLayout(this.width, this.height) : null;
    if (L) this._setRect({ boardX: L.boardX, boardY: L.boardY, boardW: L.boardW, boardH: L.boardH, cell: L.cell });
    else this._setRect({ boardX: this.width * 0.35, boardY: this.height * 0.25, boardW: this.width * 0.3, boardH: this.height * 0.7 });
  };

  /** The calm band: board ± MARGIN, extended up over Ember's strip (≈2 cells above the board). */
  Weather.prototype._setRect = function (r) {
    var cell = r.cell || r.boardW / 5;
    this.rect = { x0: r.boardX - MARGIN, x1: r.boardX + r.boardW + MARGIN,
      y0: r.boardY - cell * 2 - MARGIN, y1: r.boardY + r.boardH + MARGIN, boardY: r.boardY };
  };

  Weather.prototype._inCalm = function (x, y, pad) {
    var R = this.rect; pad = pad || 0;
    return x > R.x0 - pad && x < R.x1 + pad && y > R.y0 - pad && y < R.y1 + pad;
  };

  /** A random x outside the calm band (left or right side), or null if there is no room. */
  Weather.prototype._sideX = function (pad) {
    var R = this.rect, r = this.rng, l = R.x0 - pad, rr = this.width - (R.x1 + pad);
    if (l < 12 && rr < 12) return null;
    var pickLeft = rr < 12 || (l >= 12 && r.next() * (l + rr) < l);
    return pickLeft ? r.range(0, l) : r.range(R.x1 + pad, this.width);
  };

  Weather.prototype.resize = function (w, h) {
    var sx = w / this.width, sy = h / this.height;
    this.width = w; this.height = h;
    for (var i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; }
    this._defaultRect();
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var z = ZONES[this.zone];
    this.target = z;
    this.ambient.tint = z.tint;
    this._shootT = 2 + this.rng.range(0, 3);
    if (opts && opts.instant) {
      this._glow = this.ambient.glow = z.glow;
      this.particles = this.particles.filter(function (p) { return p.kind === 'burst' || p.kind === 'trail' || p.kind === 'splash'; });
      this._shot = null;
      for (var k = 0; k < KINDS.length; k++) for (var n = 0; n < z[KINDS[k]]; n++) {
        var p = this._spawn(KINDS[k], true);
        if (p) { p.age = p.fadeIn; }                       // pre-filled: already visible
      }
    }
  };

  Weather.prototype._push = function (o) {
    if (this.particles.length >= CAP) return null;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._spawn = function (kind, anywhere) {
    var r = this.rng, W = this.width, H = this.height, R = this.rect, x, front;
    switch (kind) {
      case 'firefly': {
        front = r.next() < 0.4;
        x = front ? this._sideX(10) : r.range(0, W);
        if (x === null) { front = false; x = r.range(0, W); }
        var y = r.range(H * 0.12, H * 0.95);
        if (front && this._inCalm(x, y, 10)) y = R.y0 - 10 > 20 ? r.range(10, R.y0 - 10) : y;
        return this._push({ kind: kind, sprite: 'glow', layer: front ? 'front' : 'back', glow: true, x: x, y: y,
          size: front ? r.range(9, 14) : r.range(5, 10), spd: r.range(14, 30), ph: r.range(0, 6.28), ph2: r.range(0, 6.28),
          sw: r.range(0.5, 0.9), tw: r.range(0.6, 1.4), base: front ? 0.95 : 0.75 });
      }
      case 'leaf': {
        front = r.next() < 0.5;
        x = front ? this._sideX(24) : r.range(-10, W + 10);
        if (x === null) { front = false; x = r.range(-10, W + 10); }
        return this._push({ kind: kind, sprite: 'leaf', layer: front ? 'front' : 'back', x: x,
          y: anywhere ? r.range(-20, H) : r.range(-30, -10), size: front ? r.range(14, 20) : r.range(9, 14),
          vy: r.range(26, 44), sw: r.range(1.1, 1.8), swAmp: r.range(14, 26), ph: r.range(0, 6.28),
          flipX: r.next() < 0.5, base: front ? 0.95 : 0.7, vx: r.range(4, 12) });
      }
      case 'drip':
        return this._push({ kind: kind, sprite: 'drip', layer: 'back', x: r.range(8, W - 8), y: r.range(2, 26),
          size: r.range(6, 10), hang: r.range(0.4, 2.4) + (anywhere ? r.range(0, 2) : 0), g: 900, base: 0.85, fadeIn: 0.3 });
      case 'crystal': {
        front = r.next() < 0.3;
        x = front ? this._sideX(8) : r.range(6, W - 6);
        if (x === null) { front = false; x = r.range(6, W - 6); }
        return this._push({ kind: kind, sprite: 'sparkle', layer: front ? 'front' : 'back', glow: true, x: x,
          y: r.range(H * 0.08, H * 0.97), size: r.range(5, front ? 13 : 10), tw: r.range(0.7, 1.6), ph: r.range(0, 6.28),
          life: r.range(3, 7), base: 0.9, spin: r.range(-0.6, 0.6) });
      }
      case 'dust': {
        // dust motes live in a diagonal light shaft from the upper left; brighter on its centre line
        var u = r.next();
        var sy = u * H, sx = this._shaftX(sy) + r.range(-1, 1) * W * 0.09;
        return this._push({ kind: kind, sprite: 'dust', layer: 'back', glow: true, x: sx, y: sy,
          size: r.range(3, 6), vx: r.range(-5, 5), vy: r.range(-3, 5), ph: r.range(0, 6.28), tw: r.range(0.4, 1),
          base: 0.8, life: r.range(6, 12) });
      }
      case 'page': {
        x = this._sideX(40);
        front = x !== null;
        if (!front) x = r.range(0, W);
        return this._push({ kind: kind, sprite: 'page', layer: front ? 'front' : 'back', x: x,
          y: anywhere ? r.range(-40, H * 0.6) : r.range(-50, -20), size: r.range(20, 26),
          vy: r.range(22, 32), sw: r.range(0.7, 1.1), swAmp: r.range(26, 40), ph: r.range(0, 6.28), base: 0.95, vx: r.range(-4, 4) });
      }
      case 'star':
        return this._push({ kind: kind, sprite: 'sparkle', layer: 'back', glow: true, x: r.range(4, W - 4),
          y: r.range(4, M.max(40, H * 0.72)), size: r.range(3, 8), tw: r.range(0.5, 1.6), ph: r.range(0, 6.28),
          life: r.range(5, 12), base: 0.9 });
    }
    return null;
  };

  Weather.prototype._shaftX = function (y) { return this.width * 0.16 + y * 0.42; };

  /** One-off burst. opts: speed (px/s), gravity (px/s²), drag (1/s), life (s), size (px),
   *  layer, up (bias upward 0..1), spread (rad, default 2π), spin. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, nb = 0, i;
    for (i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'burst') nb++;
    n = M.min(n | 0, MAX_BURST - nb, CAP - this.particles.length);
    var speed = opts.speed || 160, spread = opts.spread === undefined ? M.PI * 2 : opts.spread;
    var up = opts.up || 0, glow = sprite === 'sparkle' || sprite === 'star' || sprite === 'glow' || sprite === 'spark' || !!opts.glow;
    for (i = 0; i < n; i++) {
      var a = -M.PI / 2 + (r.next() - 0.5) * spread;
      var s = speed * r.range(0.45, 1);
      this._push({ kind: 'burst', sprite: sprite, layer: opts.layer || 'front', glow: glow, fadeIn: 0,
        x: x, y: y, vx: M.cos(a) * s, vy: M.sin(a) * s - up * speed * 0.5,
        g: opts.gravity === undefined ? 260 : opts.gravity, drag: opts.drag === undefined ? 1.6 : opts.drag,
        life: (opts.life || 0.9) * r.range(0.75, 1.15), size: (opts.size || 12) * r.range(0.7, 1.2),
        rot: r.range(0, 6.28), spin: (opts.spin === undefined ? 4 : opts.spin) * r.range(-1, 1), base: 1 });
    }
  };

  Weather.prototype._count = function () {
    var cnt = { firefly: 0, leaf: 0, drip: 0, crystal: 0, dust: 0, page: 0, star: 0, trail: 0, splash: 0 };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (!p.dying && cnt[p.kind] !== undefined) cnt[p.kind]++;
    }
    return cnt;
  };

  Weather.prototype.update = function (dt, rect) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    if (rect && rect.boardW) this._setRect(rect);
    this.time += dt;
    var z = this.target, r = this.rng, W = this.width, H = this.height, R = this.rect, i, p;

    this._glow += (z.glow - this._glow) * (1 - M.exp(-dt * 1.6));   // ≈2 s crossfade
    this.ambient.glow = this._glow;

    // keep counts on target: grow one per kind per frame; surplus fades out
    var cnt = this._count();
    for (var q = 0; q < KINDS.length; q++) {
      var kind = KINDS[q], have = cnt[kind], want = z[kind];
      if (have < want) this._spawn(kind, kind === 'crystal' || kind === 'star' || kind === 'dust' || kind === 'firefly');
      else if (have > want) {
        for (i = 0; i < this.particles.length && have > want; i++) {
          p = this.particles[i];
          if (p.kind === kind && !p.dying) { p.dying = true; have--; }
        }
      }
    }

    // shooting star (tower): a fast streak across the upper sky every 6–10 s, leaving a trail of stars
    if (z.shoot) {
      this._shootT -= dt;
      if (this._shootT <= 0 && !this._shot) {
        this._shootT = r.range(6, 10);
        var dir = r.sign(), sp = r.range(560, 760);
        this._shot = { x: dir > 0 ? r.range(-40, W * 0.4) : r.range(W * 0.6, W + 40), y: r.range(10, M.max(30, R.y0 * 0.6)),
          vx: dir * sp, vy: sp * r.range(0.22, 0.34), t: 0, life: r.range(0.9, 1.3), emit: 0 };
      }
    } else this._shot = null;
    if (this._shot) {
      var s = this._shot;
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.emit -= dt;
      if (s.emit <= 0 && cnt.trail < MAX_TRAIL) {
        s.emit = 0.025;
        cnt.trail++;
        this._push({ kind: 'trail', sprite: 'star', layer: 'back', glow: true, fadeIn: 0, x: s.x, y: s.y,
          vx: s.vx * 0.08, vy: s.vy * 0.08 + 10, size: r.range(5, 9) * (1 - 0.5 * s.t / s.life), life: r.range(0.35, 0.55),
          rot: r.range(0, 6.28), spin: r.range(-3, 3), base: 1 });
      }
      if (s.t >= s.life || s.x < -60 || s.x > W + 60 || s.y > H) this._shot = null;
    }

    var arr = this.particles, nOut = 0, nIn = arr.length, t = this.time;
    for (i = 0; i < nIn; i++) {
      p = arr[i];
      p.age += dt;
      var dead = false;
      switch (p.kind) {
        case 'firefly': {
          // wander: heading = smooth sum of sines (Perlin-ish), speed breathes; glow pulses
          var hd = p.ph + M.sin(t * p.sw + p.ph2) * 1.7 + M.sin(t * p.sw * 2.3 + p.ph) * 0.7;
          var v = p.spd * (0.7 + 0.3 * M.sin(t * 1.3 + p.ph2));
          p.x += M.cos(hd) * v * dt;
          p.y += M.sin(hd) * v * dt * 0.7;
          // soft walls: steer back into the screen
          if (p.x < 8) p.ph += dt * 2; if (p.x > W - 8) p.ph += dt * 2;
          p.x = clamp(p.x, 0, W); p.y = clamp(p.y, H * 0.08, H - 4);
          if (p.layer === 'front' && this._inCalm(p.x, p.y, 4)) this._pushOut(p);
          p.alpha = p.base * (0.35 + 0.65 * M.pow(0.5 + 0.5 * M.sin(t * p.tw * 3 + p.ph), 2));
          break;
        }
        case 'leaf': case 'page': {
          // falling leaf: pendulum sway; it sinks fastest at the bottom of the swing, rotation follows the swing
          var ang = p.age * p.sw + p.ph, swing = M.sin(ang);
          p.y += p.vy * (0.45 + 0.55 * M.abs(M.cos(ang))) * dt;
          p.x += (M.cos(ang) * p.swAmp * p.sw + p.vx) * dt;
          p.rot = swing * (p.kind === 'page' ? 0.6 : 0.9) + (p.kind === 'page' ? M.sin(ang * 0.5) * 0.5 : 0);
          if (p.kind === 'page') p.flipX = M.cos(ang * 0.5) < 0;      // tumbling: shows its back now and then
          p.alpha = p.base;
          var gone = p.y > H + 30 || p.x < -40 || p.x > W + 40;
          if (p.layer === 'front' && this._inCalm(p.x, p.y, p.size * 0.5)) gone = true;   // never crosses the board
          if (gone) {
            if (p.dying) dead = true;
            else this._respawnFaller(p);
          }
          break;
        }
        case 'drip':
          if (p.hang > 0) {                                        // grows on the ceiling, then lets go
            p.hang -= dt;
            p.alpha = p.base * clamp(p.age / 0.3, 0, 1);
            p.size = M.min(p.size + dt * 2, 11);
          } else {
            p.vy += p.g * dt;
            p.y += p.vy * dt;
            p.alpha = p.base;
            if (p.y >= H - 14) {                                   // tiny splash
              var ns = 0;
              for (var j = 0; j < arr.length; j++) if (arr[j].kind === 'splash') ns++;
              var k2 = M.min(3, MAX_SPLASH - ns);
              for (var m = 0; m < k2; m++) this._push({ kind: 'splash', sprite: 'drip', layer: 'back', fadeIn: 0, x: p.x, y: H - 14,
                vx: r.range(-60, 60), vy: -r.range(80, 150), g: 700, size: r.range(2.5, 4), life: r.range(0.25, 0.4), base: 0.8 });
              if (p.dying) dead = true;
              else { p.x = r.range(8, W - 8); p.y = r.range(2, 26); p.vy = 0; p.hang = r.range(0.6, 2.6); p.size = r.range(5, 8); p.age = 0; }
            }
          }
          break;
        case 'crystal': case 'star':
          p.alpha = p.base * (0.25 + 0.75 * M.pow(0.5 + 0.5 * M.sin(t * p.tw * 2 + p.ph), 3));
          p.rot += p.spin * dt;
          if (p.age > p.life) {
            if (p.dying) dead = true;
            else {
              p.age = p.fadeIn;
              if (p.kind === 'star') { p.x = r.range(4, W - 4); p.y = r.range(4, M.max(40, H * 0.72)); }
              else {
                var fx = p.layer === 'front' ? this._sideX(8) : r.range(6, W - 6);
                if (fx === null) { p.layer = 'back'; fx = r.range(6, W - 6); }
                p.x = fx; p.y = r.range(H * 0.08, H * 0.97);
              }
            }
          }
          break;
        case 'dust': {
          p.vx += r.range(-6, 6) * dt; p.vy += r.range(-6, 6) * dt + 0.8 * dt;   // Brownian drift, settling a little
          p.vx = clamp(p.vx, -7, 7); p.vy = clamp(p.vy, -5, 7);
          p.x += p.vx * dt; p.y += p.vy * dt;
          var off = M.abs(p.x - this._shaftX(p.y)) / (W * 0.1);
          p.alpha = p.base * clamp(1 - off * off, 0.08, 1) * (0.6 + 0.4 * M.sin(t * p.tw + p.ph));
          if (p.y > H + 6 || p.y < -6 || off > 1.6 || p.age > p.life) {
            if (p.dying) dead = true;
            else { var yy = r.next() * H; p.y = yy; p.x = this._shaftX(yy) + r.range(-1, 1) * W * 0.09; p.age = 0; p.life = r.range(6, 12); }
          }
          break;
        }
        case 'burst': case 'trail': case 'splash':
          p.vy += p.g * dt;
          var dr = M.exp(-p.drag * dt);
          p.vx *= dr; p.vy *= dr;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.spin * dt;
          p.alpha = p.base * clamp(1 - M.pow(p.age / p.life, 2), 0, 1);
          if (p.age >= p.life) dead = true;
          break;
      }
      if (p.fadeIn > 0 && p.age < p.fadeIn) p.alpha *= p.age / p.fadeIn;
      if (p.dying && p.kind !== 'burst' && p.kind !== 'trail' && p.kind !== 'splash') {
        p.fade -= dt / 1.2;                                        // surplus particles fade out over 1.2 s
        if (p.fade <= 0) dead = true;
        p.alpha *= clamp(p.fade, 0, 1);
      }
      if (!dead) arr[nOut++] = p;
    }
    arr.length = nOut;
  };

  /** Move a front wanderer to the nearest edge of the calm band and turn it around. */
  Weather.prototype._pushOut = function (p) {
    var R = this.rect, pad = 6;
    var dl = p.x - (R.x0 - pad), dr = (R.x1 + pad) - p.x, du = p.y - (R.y0 - pad);
    var mn = M.min(dl, dr, du);
    if (mn === dl && R.x0 - pad > 0) p.x = R.x0 - pad;
    else if (mn === dr && R.x1 + pad < this.width) p.x = R.x1 + pad;
    else if (R.y0 - pad > 0) p.y = R.y0 - pad;
    else { p.layer = 'back'; return; }                         // no room outside: let it live behind the board
    p.ph += M.PI;
  };

  Weather.prototype._respawnFaller = function (p) {
    var r = this.rng, front = p.layer === 'front';
    var x = front ? this._sideX(p.kind === 'page' ? 40 : 24) : r.range(-10, this.width + 10);
    if (x === null) { p.layer = 'back'; x = r.range(-10, this.width + 10); }
    p.x = x; p.y = r.range(-40, -12); p.age = 0;
  };

  Weather.CAP = CAP;
  Weather.ZONES = ZONES;
  EG.Weather = Weather;
})(window.EG = window.EG || {});
