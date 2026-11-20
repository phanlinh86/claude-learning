/* Ollie's Lighthouse Flip — OF.Weather: ambient particles per floor / time of day + bursts (DESIGN §5.2)
 *
 *   var wx = new OF.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });             // 0 dawn, 1 noon, 2 sunset, 3 night (crossfades unless instant)
 *   wx.resize(w, h);
 *   wx.update(dt, world.speed);                        // scrollSpeed px/s: ambient particles drift left with it
 *   wx.burst('bit_0', x, y, 10, { speed, life, size, gravity, spread, up, spin, layer, angle, drag, scroll });
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'} — x, y are SCREEN coords
 *   wx.ambient {tint (css rgba or null)}
 *
 * Layers: 'back' particles are OUTSIDE the lighthouse — the renderer draws them behind the back wall (mid.svg),
 * so they only show through the window openings: snow, ice sparkles (flake), stars and aurora wisps. 'front'
 * particles float inside the corridor in front of everything: a few small warm dust motes in the window light
 * (dawn/noon/sunset) or tiny white sparkles (night). Front ones are sparse, small and alpha ≤ 0.45, and never
 * leaf-coloured (no green/gold/orange sprites: motes are pale warm white). Sprites used: snow, flake, mote,
 * sparkle, star, aurora (ambient) and whatever burst() is given (puff, sparkle, star, glow, bit_0..2).
 * Depth: each ambient particle also drifts left by depth × scrollSpeed (stars/aurora 0.02–0.05 like the sky,
 * outside snow 0.15, inside motes 1.0 — they hang in the corridor air). Bursts are screen-space and by default
 * stay where they were made (opts.scroll = share of the scroll they follow). Total count is always < 140.
 */
(function (OF) {
  'use strict';
  var M = Math;

  var CAP = 139;              // hard cap (DESIGN: < 140)
  var FRONT_ALPHA = 0.45;     // front-layer alpha ceiling (DESIGN)
  var DEPTH = { star: 0.02, aurora: 0.05, back: 0.15, front: 1.0 };

  // counts at 960×540 (scaled gently with screen area, ×0.85…×1.35)
  var ZONES = [
    { key: 'dawn',   snow: 24, flake: 0,  star: 0,  aurora: 0, mote: 8,  sparkle: 0, tint: 'rgba(255,176,196,0.05)' },  // light snow, pink morning
    { key: 'noon',   snow: 0,  flake: 26, star: 0,  aurora: 0, mote: 10, sparkle: 0, tint: null },                       // drifting ice sparkles
    { key: 'sunset', snow: 30, flake: 0,  star: 0,  aurora: 0, mote: 8,  sparkle: 0, tint: 'rgba(255,140,70,0.07)' },    // gentle snow, warm
    { key: 'night',  snow: 26, flake: 0,  star: 22, aurora: 5, mote: 0,  sparkle: 6, tint: 'rgba(40,60,150,0.08)' }      // snow, stars, aurora; cool
  ];
  var KINDS = ['snow', 'flake', 'star', 'aurora', 'mote', 'sparkle'];
  var LAYER = { snow: 'back', flake: 'back', star: 'back', aurora: 'back', mote: 'front', sparkle: 'front' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.layer = o.layer || 'back';
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.sw = o.sw || 0; this.swAmp = o.swAmp || 0; this.tw = o.tw || 0;
    this.g = o.g || 0; this.drag = o.drag || 0; this.depth = o.depth === undefined ? DEPTH.back : o.depth;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.8 : o.fadeIn;
    this.scroll = o.scroll || 0;
    this.y0 = o.y0 === undefined ? 0 : o.y0; this.y1 = o.y1 === undefined ? 0 : o.y1;   // band for stars / aurora / motes
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new OF.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0;
    this.ambient = { tint: null };
    this._fillT = 0;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.resize = function (w, h, quiet) {
    var oldW = this.width, oldH = this.height;
    this.width = w; this.height = h;
    var L = OF.World && OF.World.computeLayout ? OF.World.computeLayout(w, h)
      : { unit: M.min(w / 9.6, h / 5.4), ceilY: 0.53 * h - 1.45 * M.min(w / 9.6, h / 5.4), floorY: 0.53 * h + 1.45 * M.min(w / 9.6, h / 5.4) };
    this.unit = L.unit; this.ceilY = L.ceilY; this.floorY = L.floorY;
    // the window band of mid.svg (y 170–330 of 540, drawn at scale H/540), widened a little
    this.winY0 = 0.24 * h; this.winY1 = 0.66 * h;
    this.areaK = clamp(M.sqrt((w * h) / (960 * 540)), 0.85, 1.35);
    if (quiet) return;
    var kx = oldW ? w / oldW : 1, ky = oldH ? h / oldH : 1;   // keep everything at the same relative screen place
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= kx; p.y *= ky; p.y0 *= ky; p.y1 *= ky;
      if (p.kind !== 'burst') this._band(p);
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
      for (var i = 0; i < need && this.particles.length < CAP - 2; i++) this._spawn(kind, anywhere, instant);
    }
  };
  /** Bands: stars and aurora live in the upper window band, motes in the corridor's window light. */
  Weather.prototype._bandFor = function (kind) {
    var H = this.height, u = this.unit;
    if (kind === 'star') return [this.winY0 - 0.1 * H, this.winY0 + 0.45 * (this.winY1 - this.winY0)];
    if (kind === 'aurora') return [this.winY0, this.winY0 + 0.35 * (this.winY1 - this.winY0)];
    if (kind === 'mote' || kind === 'sparkle') return [this.ceilY + 0.25 * u, this.floorY - 0.25 * u];
    return null;
  };
  Weather.prototype._band = function (p) {
    var b = this._bandFor(p.kind);
    if (!b) return;
    p.y0 = b[0]; p.y1 = b[1];
    if (p.y < b[0] || p.y > b[1]) p.y = this.rng.range(b[0], b[1]);
  };

  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100, o;
    var x = anywhere ? r.range(0, W) : W + r.range(10, 60) * u, y = r.range(0, H);
    var band = this._bandFor(kind);
    if (band) y = r.range(band[0], band[1]);
    switch (kind) {
      case 'snow':     // outside: soft snow falling, swaying (dawn light, sunset gentle, night steady)
        if (!anywhere && r.chance(0.6)) { y = -r.range(5, 30) * u; x = r.range(0, W * 1.15); }
        o = { sprite: 'snow', size: r.range(6, 14) * u, vx: -r.range(4, 14) * u, vy: r.range(this.zone === 2 ? 16 : 22, this.zone === 2 ? 30 : 42) * u,
          sw: r.range(0.6, 1.3), swAmp: r.range(6, 16) * u, ph: r.range(0, 6.28), base: r.range(0.55, 0.9), rot: r.range(0, 6.28), spin: r.range(-0.6, 0.6) };
        break;
      case 'flake':    // outside noon: ice crystals drifting in the sun, twinkling and turning
        o = { sprite: 'flake', size: r.range(7, 14) * u, vx: -r.range(6, 18) * u, vy: r.range(-4, 10) * u, sw: r.range(0.5, 1.0), swAmp: r.range(8, 18) * u,
          ph: r.range(0, 6.28), base: r.range(0.45, 0.85), tw: r.range(1.2, 2.6), rot: r.range(0, 6.28), spin: r.range(-1.2, 1.2) };
        break;
      case 'star':     // outside night: twinkling stars high in the windows
        o = { sprite: 'star', size: r.range(4, 9) * u, tw: r.range(1.0, 3.0), ph: r.range(0, 6.28), base: r.range(0.45, 0.95), rot: r.range(0, 1.2),
          depth: DEPTH.star };
        break;
      case 'aurora':   // outside night: big soft green wisps, slowly breathing
        o = { sprite: 'aurora', size: r.range(150, 260) * u, vx: -r.range(2, 6) * u, sw: r.range(0.12, 0.25), swAmp: r.range(4, 10) * u,
          ph: r.range(0, 6.28), base: r.range(0.22, 0.4), tw: r.range(0.25, 0.5), flipX: r.chance(0.5), depth: DEPTH.aurora };
        break;
      case 'mote':     // inside: warm dust motes hanging in the window light (front, faint, tiny)
        o = { sprite: 'mote', size: r.range(4, 8) * u, vx: -r.range(1, 5) * u, vy: -r.range(1, 5) * u, sw: r.range(0.3, 0.7), swAmp: r.range(5, 12) * u,
          ph: r.range(0, 6.28), base: r.range(0.18, FRONT_ALPHA), tw: r.range(0.5, 1.2), depth: DEPTH.front };
        break;
      case 'sparkle':  // inside night: a few tiny white sparkles (front, faint)
        o = { sprite: 'sparkle', size: r.range(4, 7) * u, vx: -r.range(1, 4) * u, vy: -r.range(1, 3) * u, tw: r.range(1.2, 2.4), ph: r.range(0, 6.28),
          base: r.range(0.15, 0.35), rot: r.range(0, 1.5), depth: DEPTH.front };
        break;
    }
    o.kind = kind; o.x = x; o.y = y; o.layer = LAYER[kind];
    if (band) { o.y0 = band[0]; o.y1 = band[1]; }
    if (instant) o.fadeIn = 0.001;
    var p = new Particle(o);
    this.particles.push(p);
    return p;
  };

  /** Screen-space burst at (x, y). opts: {speed, life, size, gravity, spread, up, spin, layer, angle, drag, scroll}. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, u = this.unit / 100;
    var reserve = 0;                                    // bursts never starve the ambient set
    for (var k = 0; k < KINDS.length; k++) reserve += M.max(0, this._want(KINDS[k]) - this._count(KINDS[k]));
    var room = M.max(0, CAP - 2 - reserve - this.particles.length);
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

  Weather.prototype.update = function (dt, scrollSpeed) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    this.time += dt;
    var W = this.width, H = this.height, u = this.unit / 100;
    var scroll = typeof scrollSpeed === 'number' && isFinite(scrollSpeed) ? scrollSpeed : 0;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.age += dt;
      var kill = false;
      if (p.kind === 'burst') {
        var k = M.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.g * dt;
        p.x += (p.vx - p.scroll * scroll) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        var lf = p.age / p.life;
        p.alpha = clamp(lf < 0.65 ? 1 : 1 - (lf - 0.65) / 0.35, 0, 1);
        if (lf >= 1) kill = true;
      } else {
        // ambient: own drift + sway + depth share of the scroll
        p.ph += p.sw * dt;
        p.x += (p.vx + M.cos(p.ph) * p.swAmp * p.sw - p.depth * scroll) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        var a = p.base;
        if (p.tw) a = p.base * (0.4 + 0.6 * (0.5 + 0.5 * M.sin(this.time * p.tw * 2 + p.ph)));
        var fin = clamp(p.age / p.fadeIn, 0, 1);
        if (p.dying) { p.fade -= dt / 0.9; if (p.fade <= 0) kill = true; }
        p.alpha = clamp(a * fin * clamp(p.fade, 0, 1), 0, 1);
        if (p.layer === 'front' && p.alpha > FRONT_ALPHA) p.alpha = FRONT_ALPHA;
        // wrap: leave on the left → come back on the right; out of the screen / band → re-enter
        var m = 20 * u + p.size * 0.5;
        if (p.x < -m) { p.x = W + m * 0.5; p.y = p.y1 > p.y0 ? this.rng.range(p.y0, p.y1) : this.rng.range(0, H); }
        else if (p.x > W + 2 * m) p.x = -m;
        if (p.y1 > p.y0) {
          if (p.y < p.y0 - 4 * u) p.y = p.y1; else if (p.y > p.y1 + 4 * u) p.y = p.y0;
        } else if (p.y > H + m) { p.y = -m; p.x = this.rng.range(0, W * 1.1); }
        else if (p.y < -m) p.y = H + m;
      }
      if (kill) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    if ((this._fillT -= dt) <= 0) { this._fillT = 0.25; this._topUp(false); }
  };

  OF.Weather = Weather;
})(window.OF = window.OF || {});
