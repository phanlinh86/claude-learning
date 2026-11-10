/* Mochi's Fairy Bounce — MFB.Weather: ambient season particles in logical screen px (DESIGN §5)
 *
 *   var wx = new MFB.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });   // 0 spring, 1 summer, 2 autumn, 3 winter (crossfades unless instant)
 *   wx.resize(w, h);  wx.setGround(groundPx); // groundPx = screen y of world y 0 (default 0.93·h)
 *   wx.update(dt);
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', flap}
 *     sprite = 'p_<file>' (assets/default/particles/<file>.svg); size = drawn width in px (square sprites);
 *     rot = radians, canvas convention (clockwise); flap (butterflies, 0…1) = wing opening, the renderer may squash x
 *     by (0.35 + 0.65·flap); layer 'back' = behind the blocks, 'front' = over everything (except the HUD).
 *
 * Spring Meadow: petals flutter down (a sideways sine + a slow fall, flipping as they turn) and sparkles twinkle.
 * Summer Glade: fireflies wander on smoothed random walks with a soft blink; butterflies flap along wavy paths.
 * Autumn Hollow: leaves fall like pendulums (swing angle θ = A·sin ωt, the leaf slides along the arc, rotates with θ
 *   and drops faster at the bottom of each swing), plus a gentle wind.
 * Winter Glow: snow in 3 depth layers (far = small/slow/faint, mid, near = bigger/faster/brighter, in front).
 * setLevel crossfades: the old season's particles fade out (≈ 1.2 s) while the new ones fade in at their entry edge.
 * Bounded: never more than CAP = 90 particles (the dying ones count, new ones wait for room).
 * Sizes scale with the screen (k = min(W, H)/540).
 */
(function (MFB) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 90, FADE_IN = 0.8, FADE_OUT = 1.2;

  var ZONES = [
    { key: 'spring', counts: { petal: 18, sparkle: 10 } },
    { key: 'summer', counts: { firefly: 16, butterfly: 5 } },
    { key: 'autumn', counts: { leaf: 22 } },
    { key: 'winter', counts: { snowFar: 30, snowMid: 20, snowNear: 10 } }
  ];
  var KINDS = ['petal', 'sparkle', 'firefly', 'butterfly', 'leaf', 'snowFar', 'snowMid', 'snowNear'];
  var SPRITE = { petal: 'p_petal', sparkle: 'p_sparkle', firefly: 'p_firefly', butterfly: 'p_butterfly', leaf: 'p_leaf',
    snowFar: 'p_snow', snowMid: 'p_snow', snowNear: 'p_snow' };
  var SNOW = { snowFar: { size: 5, vy: 16, a: 0.45, sway: 6, layer: 'back' },
    snowMid: { size: 8, vy: 30, a: 0.7, sway: 10, layer: 'back' },
    snowNear: { size: 13, vy: 52, a: 0.95, sway: 16, layer: 'front' } };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new MFB.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.ground = null;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }
  Weather.CAP = CAP;
  Weather.ZONES = ZONES;

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
      ph: r.range(0, TAU), w: 1, flap: 0, life: 0 };
    var topY = anywhere ? r.range(-20, G - 30) : r.range(-40, -10);
    if (kind === 'petal') {
      p.x0 = r.range(-20, W + 20); p.y = topY; p.size = r.range(11, 18) * k; p.vy = r.range(22, 38) * k;
      p.vx = r.range(4, 14) * k; p.amp = r.range(14, 30) * k; p.w = r.range(1.2, 2.2); p.a = r.range(0.75, 1);
      p.layer = r.chance(0.3) ? 'front' : 'back';
    } else if (kind === 'sparkle') {
      p.x = r.range(20, W - 20); p.y = r.range(G * 0.15, G - 40); p.size = r.range(8, 15) * k; p.vy = -r.range(3, 8) * k;
      p.life = r.range(2.5, 5); p.w = r.range(2, 4); p.age = anywhere ? r.range(0, p.life) : 0;
    } else if (kind === 'firefly') {
      p.x = r.range(20, W - 20); p.y = r.range(G * 0.3, G - 20); p.size = r.range(9, 14) * k;
      p.w = r.range(1.2, 2.4); p.layer = r.chance(0.35) ? 'front' : 'back'; p.fade = anywhere ? p.fade : 0;
      p.tx = 0; p.ty = 0;
    } else if (kind === 'butterfly') {
      var fromLeft = r.chance(0.5);
      p.x = anywhere ? r.range(0, W) : (fromLeft ? -30 : W + 30); p.y0 = r.range(G * 0.25, G * 0.8); p.y = p.y0;
      p.vx = (fromLeft ? 1 : -1) * r.range(28, 50) * k; p.size = r.range(18, 24) * k; p.w = r.range(7, 10);
      p.amp = r.range(18, 40) * k; p.flipX = p.vx < 0;
    } else if (kind === 'leaf') {
      p.x0 = r.range(-20, W + 20); p.y = topY; p.size = r.range(14, 22) * k; p.vy = r.range(28, 44) * k;
      p.amp = r.range(0.5, 0.9); p.len = r.range(26, 46) * k; p.w = r.range(1.6, 2.4); p.vx = r.range(6, 18) * k;
      p.layer = r.chance(0.3) ? 'front' : 'back'; p.y0 = p.y;
    } else {
      var s = SNOW[kind];
      p.x0 = r.range(0, W); p.y = topY; p.size = s.size * r.range(0.8, 1.25) * k; p.vy = s.vy * r.range(0.85, 1.15) * k;
      p.amp = s.sway * k; p.w = r.range(0.6, 1.3); p.a = s.a; p.layer = s.layer; p.vx = r.range(2, 6) * k;
    }
    if (p.x0 === 0 && kind !== 'petal' && kind !== 'leaf' && kind.indexOf('snow') < 0) p.x0 = p.x;
    if (kind === 'petal' || kind === 'leaf' || kind.indexOf('snow') === 0) p.x = p.x0;
    this.particles.push(p);
  };

  Weather.prototype.update = function (dt) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.time += dt;
    var r = this.rng, W = this.width, G = this._ground(), k = this.k;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i], t;
      p.age += dt;
      if (p.dying) { p.fade -= dt * FADE_IN / FADE_OUT; if (p.fade <= 0) { this.particles.splice(i, 1); continue; } }
      else if (p.fade < FADE_IN) p.fade = M.min(FADE_IN, p.fade + dt);
      var fadeK = clamp(p.fade / FADE_IN, 0, 1), out = false;
      switch (p.kind) {
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
        case 'sparkle':
          p.y += p.vy * dt;
          var lk = p.age / p.life;
          p.alpha = fadeK * M.sin(M.PI * clamp(lk, 0, 1)) * (0.55 + 0.45 * M.sin(p.age * p.w * TAU));
          p.rot += dt * 0.8;
          out = lk >= 1;
          break;
        case 'firefly':
          if (r.chance(dt * 1.2)) { p.tx = r.range(-1, 1) * 30 * k; p.ty = r.range(-1, 1) * 20 * k; }
          p.vx += (p.tx - p.vx) * M.min(1, dt * 1.5); p.vy += (p.ty - p.vy) * M.min(1, dt * 1.5);  // smoothed random walk
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 10) p.tx = M.abs(p.tx) + 5; if (p.x > W - 10) p.tx = -M.abs(p.tx) - 5;
          if (p.y < G * 0.25) p.ty = M.abs(p.ty) + 5; if (p.y > G - 15) p.ty = -M.abs(p.ty) - 5;
          var bl = M.max(0, M.sin(p.age * p.w + p.ph));
          p.alpha = fadeK * (0.2 + 0.8 * bl * bl);
          break;
        case 'butterfly':
          t = p.age;
          p.x += p.vx * dt;
          p.y = p.y0 + p.amp * M.sin(t * 1.3 + p.ph) + 0.4 * p.amp * M.sin(t * 3.1 + p.ph * 2);
          p.flap = 0.5 + 0.5 * M.sin(t * p.w * TAU / 2 + p.ph);
          p.rot = 0.15 * M.sin(t * 1.3 + p.ph + 1.2);
          p.flipX = p.vx < 0;
          p.alpha = fadeK;
          out = (p.vx > 0 && p.x > W + 40) || (p.vx < 0 && p.x < -40);
          break;
        case 'leaf':
          t = p.age * p.w + p.ph;
          var th = p.amp * M.sin(t);                              // pendulum swing angle
          p.x0 += p.vx * dt;
          p.y0 += p.vy * (0.55 + 0.9 * M.abs(M.cos(t))) * dt;    // the pivot falls, fastest at the bottom of the swing
          p.x = p.x0 + p.len * M.sin(th) * 1.6;
          p.y = p.y0 - p.len * (1 - M.cos(th));                    // the leaf rises a little at the ends of the swing
          p.rot = th * 1.3;
          p.alpha = fadeK;
          out = p.y0 > G + 10 || p.x > W + 40;
          break;
        default: // snow
          t = p.age * p.w + p.ph;
          p.x0 += p.vx * dt;
          p.y += p.vy * dt;
          p.x = p.x0 + p.amp * M.sin(t);
          p.rot += dt * 0.5;
          p.alpha = p.a * fadeK;
          out = p.y > G + 6;
          if (p.x0 > W + 20) p.x0 -= W + 40;
      }
      if (out) this.particles.splice(i, 1);
    }
    this._topUp(false, 3);
  };

  MFB.Weather = Weather;
})(window.MFB = window.MFB || {});
