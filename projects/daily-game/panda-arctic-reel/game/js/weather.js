/* Bao's Arctic Reel — PR.Weather: ambient particles per depth zone (DESIGN §5.2)
 *
 *   var wx = new PR.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });
 *   wx.update(dt, { hookX, hookY, surfaceY, waterTop, hookMoving? });
 *   wx.burst('star', x, y, 12, { speed, gravity, drag, life, size, layer, up, spread });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', glow?}
 *   wx.ambient {tint, glow, aurora}
 *
 * Sprites (assets/default/particles/): snowflake, bubble_s, kelp_bit, plankton, jelly,
 * sparkle, drop, star, puff. Total particle count is always < CAP (160).
 */
(function (PR) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  var CAP = 159;
  var SKY_TOP = 0;

  // targets per zone: shallows, kelp, twilight, aurora
  var ZONES = [
    { snow: 46, skySpark: 0,  bubble: 16, kelp: 0,  plankton: 0,  jelly: 0, tint: null,                          glow: 0.0,  aurora: 0 },
    { snow: 30, skySpark: 0,  bubble: 12, kelp: 12, plankton: 0,  jelly: 0, tint: 'rgba(255,190,90,0.06)',        glow: 0.15, aurora: 0 },
    { snow: 34, skySpark: 6,  bubble: 10, kelp: 0,  plankton: 34, jelly: 0, tint: 'rgba(120,60,160,0.10)',        glow: 0.45, aurora: 0 },
    { snow: 18, skySpark: 16, bubble: 8,  kelp: 0,  plankton: 14, jelly: 4, tint: 'rgba(10,20,60,0.18)',          glow: 0.85, aurora: 1 }
  ];
  var MAX_TRAIL = 12, MAX_BURST = 48;
  var KINDS = ['snow', 'skySpark', 'bubble', 'kelp', 'plankton', 'jelly'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new PR.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.surfaceY = 150;
    this.waterTop = 190;
    this.particles = [];
    this.zone = 0;
    this.time = 0;
    this.ambient = { tint: null, glow: 0, aurora: 0 };
    this._amb = { glow: 0, aurora: 0 };
    this._trailT = 0;
    this._lastHookY = null;
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.resize = function (w, h) {
    var sx = w / this.width, oldH = this.height;
    this.width = w; this.height = h;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= sx;
      if (p.y > this.waterTop) p.y = this.waterTop + (p.y - this.waterTop) * (h - this.waterTop) / M.max(1, oldH - this.waterTop);
    }
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var z = ZONES[this.zone];
    this.target = z;
    this.ambient.tint = z.tint;
    if (opts && opts.instant) {
      this._amb.glow = this.ambient.glow = z.glow;
      this._amb.aurora = this.ambient.aurora = z.aurora;
      // drop ambient particles of other zones at once and pre-fill this zone's
      this.particles = this.particles.filter(function (p) { return p.kind === 'burst' || p.kind === 'trail'; });
      var kinds = ['snow', 'skySpark', 'bubble', 'kelp', 'plankton', 'jelly'];
      for (var k = 0; k < kinds.length; k++) for (var n = 0; n < z[kinds[k]]; n++) this._spawn(kinds[k], true);
    }
  };

  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === kind && !this.particles[i].dying) n++;
    return n;
  };

  // every particle gets the same field set from one constructor (one hidden class → fast update loop)
  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back'; this.glow = !!o.glow;
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.size0 = this.size; this.sx = 1;
    this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = this.base;
    this.depth = o.depth || 0; this.sway = o.sway || 0; this.swayAmp = o.swayAmp || 0; this.ph = o.ph || 0;
    this.wob = o.wob || 0; this.wobAmp = o.wobAmp || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0;
    this.tw = o.tw || 0; this.pulse = o.pulse || 0; this.g = o.g || 0; this.drag = o.drag || 0;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
  }
  Weather.prototype._push = function (o) {
    if (this.particles.length >= CAP) return null;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._spawn = function (kind, anywhere) {
    var r = this.rng, W = this.width, H = this.height, wt = this.waterTop, sy = this.surfaceY;
    var floor = H - 34;
    switch (kind) {
      case 'snow': {
        var depth = r.next();                     // 0 = far (small, slow, faint) … 1 = near
        return this._push({ kind: kind, sprite: 'snowflake', layer: depth > 0.7 ? 'front' : 'sky', depth: depth,
          x: r.range(-10, W + 10), y: anywhere ? r.range(SKY_TOP - 10, sy) : r.range(-20, -6),
          size: 4 + depth * 10, vy: 14 + depth * 34, sway: r.range(0.6, 1.4), swayAmp: 6 + depth * 14,
          ph: r.range(0, 6.28), rot: r.range(0, 6.28), spin: r.range(-1, 1), base: 0.45 + depth * 0.5 });
      }
      case 'skySpark':
        return this._push({ kind: kind, sprite: 'sparkle', layer: 'sky', glow: true,
          x: r.range(10, W - 10), y: r.range(8, sy - 40), size: r.range(5, 10), ph: r.range(0, 6.28),
          tw: r.range(1.2, 2.6), base: 0.9, life: r.range(4, 9) });
      case 'bubble':
        return this._push({ kind: kind, sprite: 'bubble_s', layer: 'back',
          x: r.range(8, W - 8), y: anywhere ? r.range(wt + 10, floor) : floor + r.range(-6, 6),
          size: r.range(5, 12), vy: -r.range(26, 48), ph: r.range(0, 6.28), wob: r.range(2.5, 4.5), wobAmp: r.range(3, 7),
          base: 0.75 });
      case 'kelp':
        return this._push({ kind: kind, sprite: 'kelp_bit', layer: 'back',
          x: r.range(0, W), y: anywhere ? r.range(wt, floor) : wt + r.range(-4, 10),
          size: r.range(10, 16), vy: r.range(14, 24), ph: r.range(0, 6.28), sw: r.range(1.1, 1.8), swAmp: r.range(12, 22),
          base: 0.9 });
      case 'plankton':
        return this._push({ kind: kind, sprite: 'plankton', layer: 'back', glow: true,
          x: r.range(0, W), y: r.range(wt + 12, floor - 4), size: r.range(4, 9),
          vx: r.range(-7, 7), vy: r.range(-5, 5), ph: r.range(0, 6.28), tw: r.range(0.8, 1.8), base: 0.85,
          life: r.range(8, 16) });
      case 'jelly':
        return this._push({ kind: kind, sprite: 'jelly', layer: 'back', glow: true,
          x: r.range(30, W - 30), y: anywhere ? r.range(wt + 60, floor) : floor + 30,
          size: r.range(20, 30), ph: r.range(0, 6.28), pulse: r.range(0.5, 0.8), vx: r.range(-6, 6), base: 0.85 });
    }
    return null;
  };

  /** One-off burst. opts: speed (px/s), gravity (px/s²), drag (1/s), life (s), size (px),
   *  layer, up (bias the burst upward 0..1), spread (rad, default 2π), spin. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, nb = 0, i;
    for (i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'burst') nb++;
    n = M.min(n | 0, MAX_BURST - nb, CAP - this.particles.length);
    var speed = opts.speed || 160, spread = opts.spread === undefined ? M.PI * 2 : opts.spread;
    var up = opts.up || 0, glow = sprite === 'sparkle' || sprite === 'star' || !!opts.glow;
    for (i = 0; i < n; i++) {
      var a = -M.PI / 2 + (r.next() - 0.5) * spread;
      var s = speed * r.range(0.45, 1);
      var vx = M.cos(a) * s, vy = M.sin(a) * s - up * speed * 0.5;
      this._push({ kind: 'burst', sprite: sprite, layer: opts.layer || 'front', glow: glow,
        x: x, y: y, vx: vx, vy: vy, g: opts.gravity === undefined ? 260 : opts.gravity, drag: opts.drag === undefined ? 1.6 : opts.drag,
        life: (opts.life || 0.9) * r.range(0.75, 1.15), size: (opts.size || 12) * r.range(0.7, 1.2),
        rot: r.range(0, 6.28), spin: (opts.spin === undefined ? 4 : opts.spin) * r.range(-1, 1), base: 1 });
    }
  };

  Weather.prototype.update = function (dt, ctx) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    ctx = ctx || {};
    if (ctx.surfaceY !== undefined) this.surfaceY = ctx.surfaceY;
    if (ctx.waterTop !== undefined) this.waterTop = ctx.waterTop;
    this.time += dt;
    var z = this.target, r = this.rng, W = this.width, H = this.height, wt = this.waterTop, sy = this.surfaceY;
    var floor = H - 34, i, p;

    // ambient crossfade (≈2 s)
    var k = 1 - M.exp(-dt * 1.6);
    this._amb.glow += (z.glow - this._amb.glow) * k;
    this._amb.aurora += (z.aurora - this._amb.aurora) * k;
    this.ambient.glow = this._amb.glow;
    this.ambient.aurora = this._amb.aurora;

    // keep counts on target: grow one per kind per frame; surplus fades out
    var kinds = KINDS, cnt = { snow: 0, skySpark: 0, bubble: 0, kelp: 0, plankton: 0, jelly: 0, trail: 0 };
    for (i = 0; i < this.particles.length; i++) { p = this.particles[i]; if (!p.dying && cnt[p.kind] !== undefined) cnt[p.kind]++; }
    for (var q = 0; q < kinds.length; q++) {
      var kind = kinds[q], have = cnt[kind], want = z[kind];
      if (have < want) this._spawn(kind, kind === 'plankton' || kind === 'skySpark');
      else if (have > want) {
        for (i = 0; i < this.particles.length && have > want; i++) {
          p = this.particles[i];
          if (p.kind === kind && !p.dying) { p.dying = true; have--; }
        }
      }
    }

    // hook bubble trail while the hook moves under water
    if (ctx.hookY !== undefined && ctx.hookX !== undefined) {
      var vy = this._lastHookY === null ? 0 : (ctx.hookY - this._lastHookY) / dt;
      this._lastHookY = ctx.hookY;
      this._trailT -= dt;
      if (M.abs(vy) > 35 && ctx.hookY > wt + 4 && this._trailT <= 0) {
        this._trailT = 0.07;
        if (cnt.trail < MAX_TRAIL) this._push({ kind: 'trail', sprite: 'bubble_s', layer: 'front',
          x: ctx.hookX + r.range(-5, 5), y: ctx.hookY - 6, size: r.range(3, 7), vy: -r.range(30, 55),
          ph: r.range(0, 6.28), wob: 5, wobAmp: 3, life: r.range(0.8, 1.4), base: 0.8 });
      }
    }

    var arr = this.particles, nOut = 0, nIn = arr.length;
    for (i = 0; i < nIn; i++) {
      p = arr[i];
      p.age += dt;
      var dead = false;
      switch (p.kind) {
        case 'snow':
          p.y += p.vy * dt;
          p.x += M.cos(this.time * p.sway + p.ph) * p.swayAmp * dt + 6 * p.depth * dt; // gentle wind
          p.rot += p.spin * dt;
          p.alpha = p.base;
          if (p.y > sy + 4) { if (p.dying) dead = true; else { p.y = r.range(-20, -6); p.x = r.range(-10, W + 10); } }
          if (p.x > W + 14) p.x = -12;
          break;
        case 'skySpark':
          p.alpha = p.base * (0.35 + 0.65 * M.pow(0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph), 2));
          p.rot += dt * 0.5;
          if (p.age > p.life) { if (p.dying) dead = true; else { p.x = r.range(10, W - 10); p.y = r.range(8, sy - 40); p.age = 0; } }
          break;
        case 'bubble': case 'trail':
          p.vy -= 18 * dt;                                         // buoyancy…
          p.vy *= M.exp(-0.8 * dt);                              // …vs drag → steady rise
          p.y += p.vy * dt;
          p.x += M.cos(p.age * p.wob + p.ph) * p.wobAmp * dt * p.wob;
          p.alpha = p.base;
          p.size *= p.kind === 'trail' ? 1 + 0.15 * dt : 1;
          if (p.y <= wt + 3) {                                      // pop at the water top
            p.kind = 'pop'; p.sprite = 'bubble_s'; p.life = 0.18; p.age = 0; p.vy = 0; p.base = p.alpha;
          } else if (p.kind === 'trail' && p.age > p.life) dead = true;
          break;
        case 'pop':
          p.size *= 1 + 5 * dt;
          p.alpha = p.base * clamp(1 - p.age / p.life, 0, 1);
          if (p.age >= p.life) dead = true;
          break;
        case 'kelp':
          // falling leaf: sinks slowly, swings like a pendulum, rotation follows the swing
          var sw = M.sin(p.age * p.sw + p.ph);
          p.y += p.vy * (0.6 + 0.4 * M.abs(M.cos(p.age * p.sw + p.ph))) * dt;
          p.x += M.cos(p.age * p.sw + p.ph) * p.swAmp * p.sw * dt;
          p.rot = sw * 0.9;
          p.alpha = p.base;
          if (p.y > floor) { if (p.dying) dead = true; else { p.y = wt + r.range(-4, 6); p.x = r.range(0, W); } }
          break;
        case 'plankton':
          p.vx += r.range(-8, 8) * dt; p.vy += r.range(-8, 8) * dt;
          p.vx = clamp(p.vx, -10, 10); p.vy = clamp(p.vy, -8, 8);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y < wt + 10) p.vy = M.abs(p.vy);
          if (p.y > floor - 4) p.vy = -M.abs(p.vy);
          p.alpha = p.base * (0.4 + 0.6 * (0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph)));
          if (p.age > p.life && p.dying) dead = true;
          if (p.age > p.life && !p.dying) { p.age = 0; }
          if (p.x < -10) p.x = W + 8; if (p.x > W + 10) p.x = -8;
          break;
        case 'jelly':
          // pulse: contraction gives a short upward push, then it drifts down a little
          var ph = (p.age * p.pulse + p.ph / 6.28) % 1;
          var push = ph < 0.25 ? M.sin(ph / 0.25 * M.PI) : 0;
          p.y += (-60 * push + 4) * dt;                    // net ≈ −5 px/s: jellies slowly pulse upward
          p.x += p.vx * dt;
          p.sx = 1 + 0.12 * push;                                  // render may use sx for squash
          p.alpha = p.base * clamp((p.y - wt) / 60, 0, 1);
          if (p.y < wt + 30) { if (p.dying) dead = true; else { p.y = floor + 30; p.x = r.range(30, W - 30); } }
          break;
        case 'burst':
          p.vy += p.g * dt;
          var dr = M.exp(-p.drag * dt);
          p.vx *= dr; p.vy *= dr;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.spin * dt;
          p.alpha = p.base * clamp(1 - M.pow(p.age / p.life, 2), 0, 1);
          if (p.age >= p.life) dead = true;
          break;
      }
      if (p.dying && p.kind !== 'burst') {
        p.fade -= dt / 1.2;                                       // surplus particles fade out over 1.2 s
        if (p.fade <= 0) dead = true;
        p.alpha *= clamp(p.fade, 0, 1);
      }
      if (!dead) arr[nOut++] = p;
    }
    arr.length = nOut;
  };

  Weather.CAP = CAP;
  Weather.ZONES = ZONES;
  PR.Weather = Weather;
})(window.PR = window.PR || {});
