/* Taffy's Candy Reel — PR.Weather: ambient particles per weather level (DESIGN §5.2)
 *
 *   var wx = new PR.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });                  // 0 sunny, 1 rain, 2 wind, 3 snow
 *   wx.update(dt, { hookX, hookY, surfaceY, waterTop, wind });   // wind = world.wind.value (−1..1)
 *   wx.burst('star', x, y, 12, { speed, gravity, drag, life, size, layer, up, spread });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', glow?, sx?}
 *   wx.ambient {tint, glow, dark}
 *
 * Sprites (assets/default/particles/): snowflake, bubble_s, sprinkle, sprinkle_b, sprinkle_y, floss,
 * wrapper, ring, sparkle, drop, star, puff. Total particle count is always < CAP (160).
 * Everything light is pushed sideways by the wind with inertia (vx eases toward wind·push),
 * so when a gust flips, floss and snow slow down, stop and drift back instead of snapping.
 * Sprinkle rods are drawn rotated by `rot` (0 = rod vertical) so they fall along their velocity.
 * Rings are flat ripples: draw `ring` at size × (size·sx) — sx < 1 squashes them vertically.
 */
(function (PR) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  var CAP = 159;

  // targets per weather level
  var ZONES = [
    // sunny: a few floss puffs drifting, lots of soda fizz
    { floss: 6, wrapper: 0, sprinkle: 0, snow: 0, bubble: 26, glint: 0, flossFast: false,
      tint: null, glow: 0.0, dark: 0.0 },
    // rain: rainbow sprinkles at an angle, ring ripples on the water
    { floss: 0, wrapper: 0, sprinkle: 56, snow: 0, bubble: 14, glint: 0, flossFast: false,
      tint: 'rgba(110,100,150,0.08)', glow: 0.2, dark: 0.15 },
    // wind: floss tufts and wrappers tumbling fast
    { floss: 14, wrapper: 10, sprinkle: 0, snow: 0, bubble: 14, glint: 0, flossFast: true,
      tint: null, glow: 0.05, dark: 0.0 },
    // snow: depth-layered sugar snow, glowing sparkles in the water
    { floss: 0, wrapper: 0, sprinkle: 0, snow: 64, bubble: 10, glint: 14, flossFast: false,
      tint: 'rgba(30,30,90,0.16)', glow: 0.85, dark: 0.45 }
  ];
  var KINDS = ['floss', 'wrapper', 'sprinkle', 'snow', 'bubble', 'glint'];
  var MAX_TRAIL = 12, MAX_BURST = 48, MAX_RING = 18;
  var SPRINKLES = ['sprinkle', 'sprinkle_b', 'sprinkle_y'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new PR.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.surfaceY = 150;
    this.waterTop = 190;
    this.wind = 0;
    this.particles = [];
    this.zone = 0;
    this.time = 0;
    this.ambient = { tint: null, glow: 0, dark: 0 };
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
      this.ambient.glow = z.glow;
      this.ambient.dark = z.dark;
      // drop ambient particles of other levels at once and pre-fill this level's
      this.particles = this.particles.filter(function (p) { return p.kind === 'burst' || p.kind === 'trail'; });
      for (var k = 0; k < KINDS.length; k++) for (var n = 0; n < z[KINDS[k]]; n++) this._spawn(KINDS[k], true);
    }
  };

  // every particle gets the same field set from one constructor (one hidden class → fast update loop)
  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back'; this.glow = !!o.glow;
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.size0 = this.size; this.sx = o.sx || 1;
    this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = this.base;
    this.depth = o.depth || 0; this.sway = o.sway || 0; this.swayAmp = o.swayAmp || 0; this.ph = o.ph || 0;
    this.wob = o.wob || 0; this.wobAmp = o.wobAmp || 0; this.push = o.push || 0; this.resp = o.resp || 1;
    this.tw = o.tw || 0; this.g = o.g || 0; this.drag = o.drag || 0;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1; this.yEnd = o.yEnd || 0;
  }
  Weather.prototype._push = function (o) {
    if (this.particles.length >= CAP) return null;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._spawn = function (kind, anywhere) {
    var r = this.rng, W = this.width, H = this.height, wt = this.waterTop, sy = this.surfaceY;
    var floor = H - 34, wind = this.wind, depth;
    switch (kind) {
      case 'floss': {
        // candy-floss puffs: light, so the wind carries them (fast and tumbling on the wind level)
        var fast = this.target.flossFast;
        depth = r.next();
        return this._push({ kind: kind, sprite: 'floss', layer: 'sky', depth: depth,
          x: anywhere ? r.range(-20, W + 20) : (wind >= 0 ? -24 : W + 24), y: r.range(14, sy - 24),
          size: fast ? 12 + depth * 14 : 18 + depth * 18, vx: wind * (fast ? 150 : 30),
          push: (fast ? 150 : 34) * (0.6 + 0.6 * depth) + (fast ? 0 : 6), resp: fast ? 1.4 : 0.6,
          sway: r.range(0.5, 1.2), swayAmp: fast ? 18 : 5, ph: r.range(0, 6.28),
          rot: r.range(0, 6.28), spin: fast ? r.range(-3, 3) : r.range(-0.2, 0.2), base: fast ? 0.9 : 0.75 });
      }
      case 'wrapper':
        depth = r.next();
        return this._push({ kind: kind, sprite: 'wrapper', layer: 'sky', depth: depth,
          x: anywhere ? r.range(-20, W + 20) : (wind >= 0 ? -20 : W + 20), y: r.range(20, sy - 10),
          size: 10 + depth * 8, vx: wind * 180, push: 170 + 80 * depth, resp: 1.8,
          sway: r.range(1.5, 2.6), swayAmp: 26, ph: r.range(0, 6.28),
          rot: r.range(0, 6.28), spin: r.range(4, 9) * r.sign(), base: 0.95 });
      case 'sprinkle': {
        // near sprinkles (front layer) fall all the way to the water and ring it; far ones stop at the deck
        depth = r.next();
        var front = depth > 0.62;
        return this._push({ kind: kind, sprite: r.pick(SPRINKLES), layer: front ? 'front' : 'sky', depth: depth,
          x: r.range(-40, W + 40), y: anywhere ? r.range(-10, front ? wt : sy) : r.range(-30, -8),
          size: 6 + depth * 7, vy: 190 + depth * 170, vx: wind * 90, push: 70 + 50 * depth, resp: 3,
          yEnd: front ? wt + 2 : sy + 4, base: 0.65 + depth * 0.35 });
      }
      case 'snow':
        depth = r.next();                       // 0 = far (small, slow, faint) … 1 = near
        return this._push({ kind: kind, sprite: 'snowflake', layer: depth > 0.7 ? 'front' : 'sky', depth: depth,
          x: r.range(-10, W + 10), y: anywhere ? r.range(-10, sy) : r.range(-20, -6),
          size: 4 + depth * 10, vy: 14 + depth * 34, vx: wind * (16 + 30 * depth), push: 16 + 30 * depth, resp: 0.8,
          sway: r.range(0.6, 1.4), swayAmp: 6 + depth * 14, ph: r.range(0, 6.28),
          rot: r.range(0, 6.28), spin: r.range(-1, 1), yEnd: depth > 0.7 ? wt + 2 : sy + 4, base: 0.45 + depth * 0.5 });
      case 'bubble':
        // soda fizz rising from the lake bed, bent by the current
        return this._push({ kind: kind, sprite: 'bubble_s', layer: 'back',
          x: r.range(8, W - 8), y: anywhere ? r.range(wt + 10, floor) : floor + r.range(-6, 6),
          size: r.range(5, 12), vy: -r.range(26, 48), ph: r.range(0, 6.28), wob: r.range(2.5, 4.5), wobAmp: r.range(3, 7),
          push: 14, resp: 1, base: 0.75 });
      case 'glint':
        // snow level: soft glowing sparkles drifting in the water
        return this._push({ kind: kind, sprite: 'sparkle', layer: 'back', glow: true,
          x: r.range(0, W), y: r.range(wt + 14, floor - 6), size: r.range(5, 10),
          vx: r.range(-6, 6), vy: r.range(-4, 4), push: 10, resp: 0.5, ph: r.range(0, 6.28), tw: r.range(0.8, 1.8),
          base: 0.85, life: r.range(8, 16) });
    }
    return null;
  };

  Weather.prototype._ring = function (x) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'ring') n++;
    if (n >= MAX_RING || x < -10 || x > this.width + 10) return;
    this._push({ kind: 'ring', sprite: 'ring', layer: 'front', x: x, y: this.waterTop + 2, size: 6, sx: 0.32,
      life: this.rng.range(0.5, 0.75), base: 0.85 });
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
    if (typeof ctx.wind === 'number' && isFinite(ctx.wind)) this.wind = clamp(ctx.wind, -1, 1);
    this.time += dt;
    var z = this.target, r = this.rng, W = this.width, H = this.height, wt = this.waterTop, sy = this.surfaceY;
    var floor = H - 34, wind = this.wind, i, p;

    // ambient crossfade (≈2 s)
    var k = 1 - M.exp(-dt * 1.6);
    this.ambient.glow += (z.glow - this.ambient.glow) * k;
    this.ambient.dark += (z.dark - this.ambient.dark) * k;

    // keep counts on target: grow one per kind per frame; surplus fades out
    var cnt = { floss: 0, wrapper: 0, sprinkle: 0, snow: 0, bubble: 0, glint: 0, trail: 0 };
    for (i = 0; i < this.particles.length; i++) { p = this.particles[i]; if (!p.dying && cnt[p.kind] !== undefined) cnt[p.kind]++; }
    for (var q = 0; q < KINDS.length; q++) {
      var kind = KINDS[q], have = cnt[kind], want = z[kind];
      if (have < want) this._spawn(kind, kind === 'glint' || kind === 'floss' || kind === 'wrapper');
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
          ph: r.range(0, 6.28), wob: 5, wobAmp: 3, push: 14, resp: 1, life: r.range(0.8, 1.4), base: 0.8 });
      }
    }

    var arr = this.particles, nOut = 0, nIn = arr.length, rings = [];
    for (i = 0; i < nIn; i++) {
      p = arr[i];
      p.age += dt;
      var dead = false, ke;
      switch (p.kind) {
        case 'floss': case 'wrapper':
          // carried by the wind with inertia; bob up and down, tumble
          ke = 1 - M.exp(-p.resp * dt);
          p.vx += (wind * p.push - p.vx) * ke;
          p.x += p.vx * dt;
          p.y += M.cos(this.time * p.sway + p.ph) * p.swayAmp * dt;
          p.y = clamp(p.y, 8, sy - 6);
          p.rot += (p.spin + p.vx * 0.01) * dt;
          p.alpha = p.base;
          if (p.x > W + 40 || p.x < -40) {
            if (p.dying) dead = true;
            else { p.x = p.x > W ? -30 : W + 30; p.y = r.range(14, sy - 24); }
          }
          break;
        case 'sprinkle':
          ke = 1 - M.exp(-p.resp * dt);
          p.vx += (wind * p.push - p.vx) * ke;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot = -M.atan2(p.vx, p.vy);            // rod points along its fall
          p.alpha = p.base;
          if (p.y >= p.yEnd) {
            if (p.layer === 'front') rings.push(p.x);
            if (p.dying) dead = true;
            else { p.y = r.range(-30, -8); p.x = r.range(-40, W + 40); }
          }
          if (p.x > W + 60) p.x -= W + 100; else if (p.x < -60) p.x += W + 100;
          break;
        case 'ring':
          // ripple spreads and fades
          var u = p.age / p.life;
          p.size = 6 + 26 * M.sqrt(u);
          p.alpha = p.base * clamp(1 - u, 0, 1);
          if (u >= 1) dead = true;
          break;
        case 'snow':
          ke = 1 - M.exp(-p.resp * dt);
          p.vx += (wind * p.push - p.vx) * ke;
          p.y += p.vy * dt;
          p.x += (M.cos(this.time * p.sway + p.ph) * p.swayAmp + p.vx) * dt;
          p.rot += (p.spin + p.vx * 0.02) * dt;
          p.alpha = p.base;
          if (p.y > p.yEnd) { if (p.dying) dead = true; else { p.y = r.range(-20, -6); p.x = r.range(-10, W + 10); } }
          if (p.x > W + 14) p.x = -12; else if (p.x < -14) p.x = W + 12;
          break;
        case 'bubble': case 'trail':
          p.vy -= 18 * dt;                                         // buoyancy…
          p.vy *= M.exp(-0.8 * dt);                                // …vs drag → steady rise
          ke = 1 - M.exp(-p.resp * dt);
          p.vx += (wind * p.push - p.vx) * ke;                     // bent by the current
          p.y += p.vy * dt;
          p.x += (M.cos(p.age * p.wob + p.ph) * p.wobAmp * p.wob + p.vx) * dt;
          p.alpha = p.base;
          if (p.kind === 'trail') p.size *= 1 + 0.15 * dt;
          if (p.x < -10) p.x = W + 8; else if (p.x > W + 10) p.x = -8;
          if (p.y <= wt + 3) {                                      // pop at the water top
            p.kind = 'pop'; p.life = 0.18; p.age = 0; p.vy = 0; p.base = p.alpha;
          } else if (p.kind === 'trail' && p.age > p.life) dead = true;
          break;
        case 'pop':
          p.size *= 1 + 5 * dt;
          p.alpha = p.base * clamp(1 - p.age / p.life, 0, 1);
          if (p.age >= p.life) dead = true;
          break;
        case 'glint':
          p.vx += r.range(-8, 8) * dt; p.vy += r.range(-8, 8) * dt;
          p.vx = clamp(p.vx + wind * p.push * 0.4 * dt, -14, 14); p.vy = clamp(p.vy, -8, 8);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y < wt + 10) p.vy = M.abs(p.vy);
          if (p.y > floor - 4) p.vy = -M.abs(p.vy);
          p.alpha = p.base * (0.4 + 0.6 * (0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph)));
          if (p.age > p.life) { if (p.dying) dead = true; else p.age = 0; }
          if (p.x < -10) p.x = W + 8; else if (p.x > W + 10) p.x = -8;
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
      if (p.dying && p.kind !== 'burst' && p.kind !== 'ring') {
        p.fade -= dt / 1.2;                                       // surplus particles fade out over 1.2 s
        if (p.fade <= 0) dead = true;
        p.alpha *= clamp(p.fade, 0, 1);
      }
      if (!dead) arr[nOut++] = p;
    }
    arr.length = nOut;
    for (i = 0; i < rings.length; i++) this._ring(rings[i]);
  };

  Weather.CAP = CAP;
  Weather.ZONES = ZONES;
  PR.Weather = Weather;
})(window.PR = window.PR || {});
