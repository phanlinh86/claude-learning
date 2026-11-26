/* Wisp's Rooftop Bounce — WRB.Weather: ambient zone particles in logical screen px (DESIGN §5)
 *
 *   var wx = new WRB.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });   // 0 cloud, 1 spires, 2 gardens, 3 lanes (crossfades unless instant)
 *   wx.resize(w, h);  wx.setGround(groundPx); // groundPx = screen y of world y 0 (default 0.93·h)
 *   wx.update(dt);
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}
 *     sprite = 'p_<file>' (assets/default/particles/<file>.svg); size = drawn width in px (p_shooting is 2:1, the
 *     others square); rot = radians, canvas convention (clockwise); layer 'back' = behind the blocks, 'front' = over
 *     everything (except the HUD). p_shooting points along +x (head right): rot is its heading.
 *
 * Cloud Deck: twinkles at fixed spots (blink with a soft sine², each its own rhythm) + slow mist wisps drifting
 *   sideways in the back layer, breathing in and out (they wrap around the screen edges).
 * Skyscraper Spires: twinkles + a few quick window/antenna glints (p_sparkle: a short flash, then gone) + a shooting
 *   star every 4–8 s: a fast straight diagonal (≈ 700 px/s, ~0.9 s) that fades in, then out.
 * Rooftop Gardens: fireflies (smoothed random walk + blink) + petals (falling leaf model: a sideways sine sway,
 *   fastest fall while edge-on, flipping as they turn).
 * Lantern Lane: embers rising from the bottom (buoyancy ≈ 30 px/s up, with a wobble, cooling: alpha + size shrink)
 *   + a few fireflies.
 * setLevel crossfades: the old zone's particles fade out (≈ 1.2 s) while the new ones fade in.
 * Bounded: never more than CAP = 90 particles (the dying ones count, new ones wait for room).
 * Sizes scale with the screen (k = min(W, H)/540).
 */
(function (WRB) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 90, FADE_IN = 0.8, FADE_OUT = 1.2;

  var ZONES = [
    { key: 'cloud', counts: { twinkle: 26, mist: 7 } },
    { key: 'spires', counts: { twinkle: 22, glint: 4 }, shooting: [4, 8] },
    { key: 'gardens', counts: { firefly: 16, petal: 14 } },
    { key: 'lanes', counts: { ember: 26, firefly: 6 } }
  ];
  var KINDS = ['twinkle', 'mist', 'glint', 'firefly', 'petal', 'ember'];
  var SPRITE = { twinkle: 'p_twinkle', mist: 'p_mist', glint: 'p_sparkle', firefly: 'p_firefly', petal: 'p_petal',
    ember: 'p_ember', shooting: 'p_shooting' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new WRB.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.ground = null; this.nextShoot = 0;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;
  Weather.ZONES = ZONES;
  Weather.SPRITES = ['p_twinkle', 'p_mist', 'p_shooting', 'p_firefly', 'p_petal', 'p_ember', 'p_sparkle'];

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width || w, oldH = this.height || h;
    this.width = M.max(1, w); this.height = M.max(1, h);
    this.k = clamp(M.min(this.width, this.height) / 540, 0.6, 1.8);
    this.areaK = clamp(M.sqrt((this.width * this.height) / (960 * 540)), 0.7, 1.3);
    if (quiet) return;
    var kx = this.width / oldW, ky = this.height / oldH;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x *= kx; p.y *= ky; p.x0 *= kx; p.y0 *= ky;
    }
  };
  Weather.prototype.setGround = function (g) { this.ground = +g || null; };
  Weather.prototype._ground = function () { return this.ground !== null ? this.ground : this.height * 0.93; };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var instant = !!(opts && opts.instant);
    for (var i = this.particles.length - 1; i >= 0; i--) {
      if (instant) this.particles.splice(i, 1); else this.particles[i].dying = true;
    }
    var sh = ZONES[this.zone].shooting;
    this.nextShoot = sh ? this.time + this.rng.range(1.5, sh[0]) : 0;
    if (instant) this._topUp(true, 1e9);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone].counts[kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._topUp = function (anywhere, maxNew) {
    var made = 0;
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && made < maxNew && this.particles.length < CAP; i++) { this._spawn(kind, anywhere); made++; }
    }
  };

  Weather.prototype._spawn = function (kind, anywhere) {
    var r = this.rng, W = this.width, G = this._ground(), k = this.k;
    var p = { kind: kind, sprite: SPRITE[kind], x: 0, y: 0, x0: 0, y0: 0, size: 10 * k, rot: 0, flipX: r.chance(0.5),
      alpha: 0, a: 1, layer: 'back', vx: 0, vy: 0, age: 0, fade: anywhere ? FADE_IN * 0.99 : 0, dying: false,
      ph: r.range(0, TAU), w: 1, life: 0 };
    if (kind === 'twinkle') {             // fixed in the sky, upper 60 % of the scene
      p.x = r.range(10, W - 10); p.y = r.range(8, G * 0.6); p.size = r.range(7, 15) * k;
      p.w = r.range(0.5, 1.4); p.a = r.range(0.55, 1); p.rot = r.range(0, 0.6);
    } else if (kind === 'mist') {         // wide, slow, faint, back layer
      p.size = r.range(140, 260) * k; p.x = r.range(-p.size / 2, W + p.size / 2); p.y0 = r.range(G * 0.2, G * 0.85);
      p.y = p.y0; p.vx = (r.chance(0.5) ? 1 : -1) * r.range(6, 14) * k; p.a = r.range(0.12, 0.28); p.w = r.range(0.15, 0.3);
      p.amp = r.range(3, 8) * k;
    } else if (kind === 'glint') {        // a short flash somewhere on the towers
      p.x = r.range(20, W - 20); p.y = r.range(G * 0.35, G * 0.9); p.size = r.range(10, 18) * k;
      p.life = r.range(0.5, 0.9); p.age = anywhere ? -r.range(0, 3) : -r.range(0.3, 2.5);   // a wait, then the flash
    } else if (kind === 'firefly') {
      p.x = r.range(20, W - 20); p.y = r.range(G * 0.3, G - 20); p.size = r.range(9, 14) * k;
      p.w = r.range(1.2, 2.4); p.layer = r.chance(0.35) ? 'front' : 'back';
      p.tx = 0; p.ty = 0;
    } else if (kind === 'petal') {
      p.x0 = r.range(-20, W + 20); p.y = anywhere ? r.range(-20, G - 30) : r.range(-40, -10); p.size = r.range(11, 17) * k;
      p.vy = r.range(22, 36) * k; p.vx = r.range(4, 14) * k; p.amp = r.range(14, 28) * k; p.w = r.range(1.2, 2.2);
      p.a = r.range(0.75, 1); p.layer = r.chance(0.3) ? 'front' : 'back'; p.x = p.x0;
    } else if (kind === 'ember') {        // rise from the street
      p.x0 = r.range(0, W); p.y = anywhere ? r.range(G * 0.2, G + 10) : G + r.range(5, 25); p.y0 = p.y;
      p.size = r.range(6, 11) * k; p.size0 = p.size; p.vy = -r.range(22, 40) * k; p.vx = r.range(-4, 8) * k;
      p.amp = r.range(6, 14) * k; p.w = r.range(1.5, 3); p.life = r.range(6, 11); p.x = p.x0;
      p.age = anywhere ? r.range(0, p.life * 0.6) : 0; p.layer = r.chance(0.25) ? 'front' : 'back';
    }
    this.particles.push(p);
  };

  Weather.prototype._shoot = function () {
    var r = this.rng, W = this.width, G = this._ground(), k = this.k;
    if (this.particles.length >= CAP) return;
    var right = r.chance(0.5), sp = r.range(600, 800) * k, ang = r.range(18, 32) * M.PI / 180;
    var vx = (right ? 1 : -1) * sp * M.cos(ang), vy = sp * M.sin(ang);
    var p = { kind: 'shooting', sprite: SPRITE.shooting, x: right ? r.range(0, W * 0.5) : r.range(W * 0.5, W),
      y: r.range(10, G * 0.3), x0: 0, y0: 0, size: r.range(60, 90) * k, rot: M.atan2(vy, vx), flipX: false, alpha: 0,
      a: 1, layer: 'back', vx: vx, vy: vy, age: 0, life: r.range(0.7, 1.0), fade: FADE_IN, dying: false, ph: 0, w: 1 };
    this.particles.push(p);
  };

  Weather.prototype.update = function (dt) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.time += dt;
    var r = this.rng, W = this.width, G = this._ground();
    var sh = ZONES[this.zone].shooting;
    if (sh && this.time >= this.nextShoot) { this._shoot(); this.nextShoot = this.time + r.range(sh[0], sh[1]); }
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i], t, lk;
      p.age += dt;
      if (p.dying) { p.fade -= dt * FADE_IN / FADE_OUT; if (p.fade <= 0) { this.particles.splice(i, 1); continue; } }
      else if (p.fade < FADE_IN) p.fade = M.min(FADE_IN, p.fade + dt);
      var fadeK = clamp(p.fade / FADE_IN, 0, 1), out = false;
      switch (p.kind) {
        case 'twinkle':
          var s = M.sin(p.age * p.w * TAU + p.ph);
          p.alpha = p.a * fadeK * (0.25 + 0.75 * s * s);
          break;
        case 'mist':
          p.x += p.vx * dt;
          p.y = p.y0 + p.amp * M.sin(p.age * p.w + p.ph);
          p.alpha = p.a * fadeK * (0.7 + 0.3 * M.sin(p.age * p.w * 1.7 + p.ph));   // breathes
          if (p.vx > 0 && p.x - p.size / 2 > W) p.x = -p.size / 2;
          if (p.vx < 0 && p.x + p.size / 2 < 0) p.x = W + p.size / 2;
          break;
        case 'glint':
          if (p.age < 0) { p.alpha = 0; break; }
          lk = p.age / p.life;
          p.alpha = fadeK * M.sin(M.PI * clamp(lk, 0, 1));
          p.rot += dt * 1.5;
          out = lk >= 1;
          break;
        case 'shooting':
          p.x += p.vx * dt; p.y += p.vy * dt;
          lk = p.age / p.life;
          p.alpha = fadeK * clamp(M.min(lk / 0.15, (1 - lk) / 0.5), 0, 1);   // quick in, long tail-off
          out = lk >= 1;
          break;
        case 'firefly':
          if (r.chance(dt * 1.2)) { p.tx = r.range(-1, 1) * 30 * this.k; p.ty = r.range(-1, 1) * 20 * this.k; }
          p.vx += (p.tx - p.vx) * M.min(1, dt * 1.5); p.vy += (p.ty - p.vy) * M.min(1, dt * 1.5);  // smoothed random walk
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 10) p.tx = M.abs(p.tx) + 5; if (p.x > W - 10) p.tx = -M.abs(p.tx) - 5;
          if (p.y < G * 0.25) p.ty = M.abs(p.ty) + 5; if (p.y > G - 15) p.ty = -M.abs(p.ty) - 5;
          var bl = M.max(0, M.sin(p.age * p.w + p.ph));
          p.alpha = fadeK * (0.2 + 0.8 * bl * bl);
          break;
        case 'petal':
          t = p.age * p.w + p.ph;
          p.x0 += p.vx * dt;
          p.y += p.vy * (0.75 + 0.35 * M.abs(M.cos(t))) * dt;   // a flutter: falls fastest while edge-on
          p.x = p.x0 + p.amp * M.sin(t);
          p.rot = 0.9 * M.sin(t + 0.6);
          p.flipX = M.cos(t) < 0;
          p.alpha = p.a * fadeK;
          out = p.y > G + 10 || p.x > W + 40;
          break;
        case 'ember':
          t = p.age * p.w + p.ph;
          lk = p.age / p.life;
          p.vy *= M.exp(-0.05 * dt);                             // buoyancy fades a little as it cools
          p.x0 += p.vx * dt; p.y += p.vy * dt;
          p.x = p.x0 + p.amp * M.sin(t) + 0.4 * p.amp * M.sin(t * 2.3 + 1);
          p.size = p.size0 * (1 - 0.45 * clamp(lk, 0, 1));
          p.rot += dt * 0.6;
          var flick = 0.85 + 0.15 * M.sin(p.age * 9 + p.ph);
          p.alpha = fadeK * flick * clamp(M.min(lk / 0.1, (1 - lk) / 0.4), 0, 1);
          out = lk >= 1 || p.y < -20;
          break;
      }
      p.alpha = clamp(p.alpha, 0, 1);
      if (out) this.particles.splice(i, 1);
    }
    this._topUp(false, 3);
  };

  WRB.Weather = Weather;
})(window.WRB = window.WRB || {});
