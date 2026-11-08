/* Clover's Farm Hop — FH.Weather: screen-space ambient particles per weather level + bursts (DESIGN §5.2)
 *
 *   var wx = new FH.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });   // 0 sunny, 1 rain, 2 wind, 3 snow (old ones fade out unless instant)
 *   wx.resize(w, h);
 *   wx.setWind(world.wind.dir, world.wind.strength);   // every frame
 *   wx.update(dt, climbVy);                 // climbVy = camera speed in px/s (falling things stream past faster)
 *   wx.burst('sparkle', x, y, 6, { speed, life, size, gravity, spread, up, spin, layer, drag, angle });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', ar, flap}
 *     — logical SCREEN px; `size` = drawn WIDTH in px, `ar` = height / width of the sprite (raindrop 4, gust 1/3,
 *       everything else 1); `flap` (butterflies, 0..1) = wing opening the renderer may use to squash x.
 *   wx.ambient {tint (css rgba or null)}
 *
 * Sunny: butterflies on a flapping sine path + petals tumbling down. Rain: raindrop streaks in two depth layers,
 * slanted by the wind (rot follows the velocity) + little splashes popping at random heights at the sides.
 * Wind: leaves streaming and tumbling (pendulum) + soft gust swooshes. Snow: snowflakes in 3 depth layers (size,
 * speed, alpha and wind push grow with nearness). While the wind blows (any level): extra swooshes, everything
 * drifts and leans with it, and leaves/petals get pushed along. Back-layer particles are faint; front-layer ones
 * are small, sparse and pale (alpha ≤ 0.5) and never yellow dots (no firefly look-alikes).
 * Sizes scale with the screen (k = min(W, H)/540); counts scale gently with screen area; total < 180 (CAP 179).
 */
(function (FH) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 179, RESERVE = 24, FRONT_ALPHA = 0.5;

  // counts at 960×540 (× areaK); front = share drawn in front of the platforms
  var ZONES = [
    { key: 'sunny', counts: { butterfly: 6, petal: 14 },   tint: 'rgba(255,248,225,0.04)' },
    { key: 'rain',  counts: { raindrop: 64, splash: 0 },   tint: 'rgba(70,95,105,0.08)', splashRate: 5 },
    { key: 'wind',  counts: { leaf: 22, gust: 2 },          tint: 'rgba(255,200,130,0.05)' },
    { key: 'snow',  counts: { snowflake: 84 },             tint: 'rgba(130,110,180,0.07)' }
  ];
  var KINDS = ['butterfly', 'petal', 'raindrop', 'splash', 'leaf', 'gust', 'snowflake'];
  var FRONT = { butterfly: 0.2, petal: 0.25, raindrop: 0.35, splash: 0, leaf: 0.2, gust: 0.3, snowflake: 0 };
  var AR = { raindrop: 4, gust: 1 / 3 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new FH.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.climb = 0;
    this.windDir = 1; this.windStr = 0; this._lastDir = 1;
    this.ambient = { tint: null };
    this._splashAcc = 0;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.setHorizon = function () {};    // compatibility no-op (sister games had a horizon)

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
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst') continue;
      if (instant) this.particles.splice(i, 1); else p.dying = true;   // crossfade: old ones fade out
    }
    this._topUp(true, instant);
  };

  Weather.prototype.setWind = function (dir, strength) {
    this.windDir = dir < 0 ? -1 : 1;
    this.windStr = clamp(+strength || 0, 0, 1);
    if (this.windStr > 0.05) this._lastDir = this.windDir;
  };

  Weather.prototype._want = function (kind) {
    var n = (ZONES[this.zone].counts[kind] || 0) * this.areaK, s = this.windStr;
    if (s > 0.05) {                                  // the wind blows: swooshes + things pushed along
      if (kind === 'gust') n += 1 + 4 * s;
      if (kind === 'leaf' && this.zone === 2) n += 8 * s;
      if (kind === 'leaf' && (this.zone === 1 || this.zone === 3)) n += 5 * s;
      if (kind === 'petal' && this.zone === 0) n += 8 * s;
    }
    return M.round(n);
  };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._trim = function () {
    for (var k = 0; k < KINDS.length; k++) {
      if (KINDS[k] === 'splash') continue;          // splashes are timed pops, not a population
      var extra = this._count(KINDS[k]) - this._want(KINDS[k]);
      for (var i = this.particles.length - 1; i >= 0 && extra > 0; i--) {
        var p = this.particles[i];
        if (p.kind === KINDS[k] && !p.dying) { p.dying = true; extra--; }   // fades out (no popping)
      }
    }
  };
  Weather.prototype._topUp = function (anywhere, instant) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this.particles.length < CAP - RESERVE; i++) this._spawn(kind, anywhere, instant);
    }
  };

  /** spawn x/y helpers: things that fall start above the top edge (or anywhere at level start) */
  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, k = this.k, d = this._lastDir;
    var front = r.chance(FRONT[kind]);
    var o = { kind: kind, sprite: kind, layer: front ? 'front' : 'back', x: 0, y: 0, size: 10, rot: 0, flipX: false,
      alpha: 0, ar: AR[kind] || 1, flap: 1, vx: 0, vy: 0, spin: 0, ph: r.range(0, TAU), base: 1, age: 0, life: 0,
      fade: instant ? 1 : 0, dying: false, par: front ? 1 : 0.55, lean: 0 };
    switch (kind) {
      case 'butterfly': {           // flaps along a wavy path, turns around now and then
        var dir = r.sign();
        o.size = (front ? r.range(16, 20) : r.range(12, 17)) * k;
        o.x = anywhere ? r.range(0, W) : (dir > 0 ? -20 * k : W + 20 * k);
        o.y = r.range(0.1 * H, 0.85 * H);
        o.vx = dir * r.range(22, 38) * k; o.flapW = r.range(9, 13); o.amp = r.range(14, 26) * k; o.wav = r.range(0.8, 1.4);
        o.flipX = dir < 0; o.base = front ? FRONT_ALPHA : r.range(0.75, 0.95); o.par = front ? 0.9 : 0.6;
        o.wrapX = true;
        break;
      }
      case 'petal': {               // tumbles down, swaying, spinning
        o.size = (front ? r.range(9, 12) : r.range(8, 12)) * k;
        o.x = r.range(-0.05 * W, 1.05 * W); o.y = anywhere ? r.range(0, H) : -15 * k;
        o.vx = r.range(-12, 12) * k; o.vy = r.range(22, 36) * k; o.amp = r.range(18, 34) * k; o.sw = r.range(1.4, 2.4);
        o.rot = r.range(0, TAU); o.spin = r.range(-2.2, 2.2); o.flipX = r.chance(0.5);
        o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.6, 0.9); o.push = 1;
        break;
      }
      case 'raindrop': {            // thin streaks; two depth layers (front: faster, bigger, fainter)
        o.size = (front ? r.range(4.5, 6) : r.range(3, 4.2)) * k;
        o.x = r.range(-0.15 * W, 1.15 * W); o.y = anywhere ? r.range(-0.1 * H, H) : r.range(-0.25 * H, -20 * k);
        o.vy = (front ? r.range(620, 760) : r.range(420, 520)) * k; o.vx = -20 * k;
        o.base = front ? r.range(0.3, 0.45) : r.range(0.3, 0.5); o.par = front ? 1 : 0.5; o.slant = front ? 1 : 0.7;
        break;
      }
      case 'splash': {              // a tiny crown of droplets that pops and fades (at the sides)
        o.size = r.range(10, 15) * k; o.layer = 'back';
        o.x = r.chance(0.5) ? r.range(0, 0.3 * W) : r.range(0.7 * W, W); o.y = r.range(0.2 * H, 0.95 * H);
        o.life = r.range(0.3, 0.42); o.base = r.range(0.45, 0.7); o.fade = 1; o.par = 1; o.s0 = o.size;
        break;
      }
      case 'leaf': {                // streams with the (last) wind, pendulum tumble
        o.size = (front ? r.range(11, 14) : r.range(10, 15)) * k;
        o.x = anywhere ? r.range(0, W) : (d > 0 ? r.range(-40, -15) * k : W + r.range(15, 40) * k);
        o.y = r.range(-0.05 * H, 0.95 * H);
        o.base0 = (this.zone === 2 ? r.range(55, 110) : r.range(15, 40)) * k;
        o.vy = r.range(14, 30) * k; o.amp = r.range(10, 22) * k; o.sw = r.range(1.6, 2.6);
        o.base = front ? r.range(0.35, FRONT_ALPHA) : r.range(0.6, 0.9); o.push = 1;
        break;
      }
      case 'gust': {                // a white swoosh sweeping across in the wind direction
        o.size = r.range(90, 150) * k; o.layer = front ? 'front' : 'back';
        o.dir = this.windStr > 0.05 ? this.windDir : d;
        o.x = anywhere ? r.range(0, W) : (o.dir > 0 ? -o.size * 0.6 : W + o.size * 0.6);
        o.y = r.range(0.08 * H, 0.92 * H);
        o.vx = o.dir * r.range(380, 560) * k; o.flipX = o.dir < 0; o.life = r.range(0.9, 1.5);
        o.base = front ? r.range(0.2, 0.32) : r.range(0.25, 0.45); o.fade = 1; o.par = 0.4;
        break;
      }
      case 'snowflake': {           // 3 depth layers: far (small, slow, faint) → near (big, fast, bright)
        var z = r.int(0, 2); o.depth = z;
        o.size = [5, 8, 12][z] * r.range(0.85, 1.15) * k;
        o.layer = z === 2 && r.chance(0.5) ? 'front' : 'back';
        o.x = r.range(-0.1 * W, 1.1 * W); o.y = anywhere ? r.range(0, H) : -15 * k;
        o.vy = [24, 38, 58][z] * r.range(0.85, 1.15) * k; o.amp = [6, 10, 16][z] * k; o.sw = r.range(0.6, 1.2);
        o.base = [0.45, 0.7, 0.85][z] * r.range(0.9, 1.05); if (o.layer === 'front') o.base = M.min(o.base, FRONT_ALPHA);
        o.par = [0.3, 0.6, 1][z]; o.spin = r.range(-0.6, 0.6); o.push = [0.5, 0.8, 1.1][z];
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
        flipX: r.chance(0.5), ar: AR[sprite] || 1, flap: 1, g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag,
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
    // camera speed (px/s, + = climbing): clamp so a big jump never teleports everything
    this.climb = clamp(+climbVy || 0, -200, 1600);
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
        if (p.dying) { p.fade -= dt / 0.8; if (p.fade <= 0) dead = true; }
        else if (p.fade < 1) p.fade = M.min(1, p.fade + dt / 0.8);
        var a = p.base * clamp(p.fade, 0, 1);
        if (p.life) a *= clamp((p.life - p.age) / (p.life * 0.5), 0, 1);
        if (p.layer === 'front') a = M.min(a, FRONT_ALPHA);
        p.alpha = a;
      }
      if (!dead) ps[keep++] = p;
    }
    ps.length = keep;
    // rain splashes pop at a steady rate (Poisson-ish, deterministic rng)
    var Z = ZONES[this.zone];
    if (Z.splashRate) {
      this._splashAcc += dt * Z.splashRate * this.areaK;
      while (this._splashAcc >= 1) { this._splashAcc -= 1; if (ps.length < CAP - RESERVE) this._spawn('splash', true, true); }
    }
    this._trim();
    this._topUp(false, false);
  };

  /** per-kind motion; returns true when the particle left the screen (it is then re-spawned by _topUp) */
  Weather.prototype._move = function (p, dt, k, W, H) {
    var t = this.time, ws = this.windStr * this.windDir, climb = this.climb * (p.par || 1), m = 40 * k;
    switch (p.kind) {
      case 'butterfly': {
        p.x += (p.vx + ws * 45 * k) * dt;
        p.y += (M.cos(t * p.wav + p.ph) * p.amp * p.wav + climb * 0.5) * dt;   // a lazy wavy path
        p.flap = 0.25 + 0.75 * M.abs(M.sin(t * p.flapW + p.ph));                // wings open / close
        p.rot = 0.18 * M.sin(t * p.wav + p.ph) + 0.25 * this.windStr * this.windDir;
        if (this.rng.chance(dt * 0.12)) p.vx = -p.vx;
        p.flipX = p.vx < 0;
        if (p.y < 0.05 * H) p.y += 20 * k * dt;
        if (p.y > H + m) { p.y = -m * 0.5; }
        if (p.x < -m) p.x = W + m * 0.5; else if (p.x > W + m) p.x = -m * 0.5;
        return false;
      }
      case 'petal': {
        var sway = M.sin(t * p.sw + p.ph);
        p.x += (p.vx + sway * p.amp + ws * 160 * k * p.push) * dt;
        p.y += (p.vy + climb) * dt;
        p.rot += (p.spin + ws * 1.5) * dt;
        break;
      }
      case 'raindrop': {
        var vx = p.vx + ws * 300 * k * p.slant;
        p.x += vx * dt; p.y += (p.vy + climb) * dt;
        p.rot = -M.atan2(vx, p.vy + climb);              // the streak points along its velocity
        if (p.y > H + 30 * k) return true;
        if (p.x < -0.2 * W || p.x > 1.2 * W) return true;
        return false;
      }
      case 'splash': {
        var e = p.age / p.life;
        p.size = p.s0 * (0.5 + 0.6 * M.sqrt(clamp(e, 0, 1)));
        p.y += climb * dt;
        return false;
      }
      case 'leaf': {
        var dir = this.windStr > 0.05 ? this.windDir : this._lastDir;
        var sw = M.sin(t * p.sw + p.ph);
        p.x += (dir * p.base0 + ws * 240 * k * p.push + sw * p.amp * p.sw * 0.6) * dt;
        p.y += (p.vy + M.cos(t * p.sw * 2 + p.ph) * 8 * k + climb) * dt;
        p.rot = 0.8 * sw + 0.4 * ws + (p.ph % 1);       // pendulum swing + lean with the wind
        p.flipX = dir < 0;
        if (p.x < -m * 1.5 || p.x > W + m * 1.5) return true;
        break;
      }
      case 'gust': {
        p.x += (p.vx * (0.6 + 0.6 * this.windStr)) * dt;
        p.y += (M.sin(t * 2 + p.ph) * 10 * k + climb) * dt;
        p.rot = 0.08 * M.sin(t * 3 + p.ph);
        if (p.x < -p.size * 1.2 || p.x > W + p.size * 1.2) return true;
        return false;
      }
      case 'snowflake': {
        var s2 = M.sin(t * p.sw + p.ph);
        p.x += (s2 * p.amp * p.sw + ws * (60 + 50 * p.depth) * k * p.push) * dt;
        p.y += (p.vy + climb) * dt;
        p.rot += (p.spin + ws * 0.8) * dt;
        break;
      }
    }
    // generic exits for falling things
    if (p.y > H + m) return true;
    if (p.y < -H) return true;
    if (p.x < -W * 0.3 || p.x > W * 1.3) return true;
    return false;
  };

  FH.Weather = Weather;
})(window.FH = window.FH || {});
