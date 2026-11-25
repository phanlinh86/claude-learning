/* Mossy's Egg Grove — MEG.Weather: screen-space ambient particles per season, wind drift + streaks, bursts (DESIGN §5)
 *
 *   var wx = new MEG.Weather({ width: 960, height: 540, seed: 5 });
 *   wx.setLevel(zone, { instant: true });   // 0 spring, 1 summer, 2 autumn, 3 winter (old ambient fades out unless instant)
 *   wx.resize(w, h);
 *   wx.setWind(force);                       // signed u/s² (world.wind.force), every frame
 *   wx.update(dt);
 *   wx.burst('merge' | 'hatch' | 'land' | 'rescue' | 'level', x, y, n, opts);   // logical screen px
 *   draw wx.particles[] { sprite, name, x, y, size, rot, flipX, alpha, layer: 'sky'|'back'|'front', tint }
 *     — `name` = particle file (assets/default/particles/<name>.svg): sparkle star glow petal leafbit snow firefly
 *       streak puff shellbit heart; `sprite` = 'p_' + name (the MEG.Assets key); `size` = drawn width in px (square
 *       sprites; `streak` is drawn size × size too); `rot` radians, canvas convention (clockwise);
 *       `tint` = optional CSS colour (merge sparkles carry opts.color) the renderer may use for a glow/tint.
 *
 * Ambient:
 *   spring → blossom petals falling as little pendulums (sway, rocking, faster through the middle of each swing);
 *   summer → pale-green fireflies wandering on noisy paths with a glow pulse + sparkles twinkling in place;
 *   autumn → leaves tumbling down: pendulum sway + a steady spin;
 *   winter → snow in three depth layers (far: small, slow, faint, layer 'sky'; mid 'back'; near: big, fast, 'front').
 * Wind: every ambient particle eases its sideways drift toward force × WIND_PX × (its own response: light petals and
 *   near snow react most, fireflies least); during a gust (|force| > STREAK_MIN) white `streak` lines fly across the
 *   screen in the wind's direction (flipX = blowing left), more of them the stronger it blows.
 * Bursts: merge = sparkles flying out and slowing (drag) + one puff that swells and fades;
 *   hatch = shell bits on gravity arcs + spinning stars + hearts floating up; land = 2–3 tiny bits (moss puff /
 *   leaf / snow by season); rescue = a ring of sparkles spinning outward + a glow; level = a shower of the season's
 *   particles from the top of the screen.
 * Sizes scale with the screen (k = min(W, H)/540). Bounded: ambient ≤ CAP − RESERVE, everything ≤ CAP (160).
 */
(function (MEG) {
  'use strict';
  var M = Math, TAU = M.PI * 2;
  var CAP = 160, RESERVE = 40;
  var WIND_PX = 22;        // px/s of drift per u/s² of wind (× k): a 5 u/s² winter gust ≈ 110 px/s
  var WIND_EASE = 2.5;     // 1/s: how fast the drift follows the wind
  var STREAK_MIN = 0.6;    // u/s²: streaks only in a real gust

  // ambient counts at 960×540 (× area factor)
  var ZONES = [
    { key: 'spring', counts: { petal: 18, firefly: 3 } },
    { key: 'summer', counts: { firefly: 14, sparkle: 10 } },
    { key: 'autumn', counts: { leaf: 16, firefly: 2 } },
    { key: 'winter', counts: { snowFar: 28, snowMid: 20, snowNear: 10 } }
  ];
  var NAME = { petal: 'petal', leaf: 'leafbit', firefly: 'firefly', sparkle: 'sparkle', snowFar: 'snow', snowMid: 'snow', snowNear: 'snow' };
  var SNOW = {
    snowFar:  { size: [5, 7],   vy: [14, 22], sway: [4, 8],   a: [0.45, 0.6], layer: 'sky',   resp: 0.45 },
    snowMid:  { size: [8, 11],  vy: [26, 38], sway: [8, 14],  a: [0.7, 0.85], layer: 'back',  resp: 0.75 },
    snowNear: { size: [13, 18], vy: [44, 62], sway: [12, 20], a: [0.85, 1],   layer: 'front', resp: 1 }
  };
  var LAND_BIT = ['puff', 'puff', 'leafbit', 'snow'];
  var SHOWER = [['petal'], ['sparkle', 'firefly'], ['leafbit'], ['snow']];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new MEG.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0; this.time = 0; this.force = 0; this.drift = 0; this.streakAcc = 0;
    this.resize(opts.width || 960, opts.height || 540);
    this.setLevel(opts.zone || 0, { instant: true });
  }
  var P = Weather.prototype;
  Weather.CAP = CAP; Weather.RESERVE = RESERVE;

  P.resize = function (w, h) {
    this.W = M.max(1, w); this.H = M.max(1, h);
    this.k = M.min(this.W, this.H) / 540;
    this.areaK = clamp(this.W * this.H / (960 * 540), 0.6, 1.6);
  };
  P.setHorizon = function () {};   // kept for renderer compatibility (no horizon in this game)
  P.setWind = function (force) { this.force = +force || 0; };

  P.ambientCount = function () { var n = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].amb && !this.particles[i].fade) n++; return n; };

  P.setLevel = function (zone, opts) {
    zone = clamp(zone | 0, 0, 3);
    var instant = opts && opts.instant, i;
    if (instant) this.particles = this.particles.filter(function (p) { return !p.amb; });
    else for (i = 0; i < this.particles.length; i++) if (this.particles[i].amb) this.particles[i].fade = true;
    this.zone = zone;
    var c = ZONES[zone].counts, room = CAP - RESERVE, want = [], kind;
    for (kind in c) want.push([kind, M.round(c[kind] * this.areaK)]);
    var tot = want.reduce(function (s, a) { return s + a[1]; }, 0);
    if (tot > room) want.forEach(function (a) { a[1] = M.floor(a[1] * room / tot); });
    for (i = 0; i < want.length; i++) for (var j = 0; j < want[i][1]; j++) this._spawnAmbient(want[i][0], true, !instant);
  };

  // ---------- ambient ----------
  P._spawnAmbient = function (kind, anywhere, fadeIn) {
    var r = this.rng, k = this.k, W = this.W, H = this.H;
    if (this.particles.length >= CAP) {             // a season change: make room by dropping a fading old one
      var j = -1;
      for (var q = 0; q < this.particles.length; q++) if (this.particles[q].fade) { j = q; break; }
      if (j < 0) return null;
      this.particles.splice(j, 1);
    }
    var p = { amb: true, kind: kind, name: NAME[kind], sprite: 'p_' + NAME[kind], x: r.range(-20, W + 20), y: anywhere ? r.range(-20, H) : r.range(-40, -10),
      size: 10 * k, rot: r.range(0, TAU), flipX: r.chance(0.5), alpha: 1, a0: 1, layer: 'back', tint: null,
      ph: r.range(0, TAU), wx: this.drift, resp: 1, life: 0, fadeIn: fadeIn ? 0 : 1 };
    if (kind === 'petal') {
      p.size = r.range(10, 15) * k; p.vy = r.range(26, 40) * k; p.swing = r.range(1.1, 1.8); p.amp = r.range(18, 34) * k;
      p.rock = r.range(0.4, 0.8); p.a0 = r.range(0.75, 0.95); p.layer = r.chance(0.3) ? 'front' : 'back'; p.resp = 1.1; p.x0 = p.x;
    } else if (kind === 'leaf') {
      p.size = r.range(13, 19) * k; p.vy = r.range(30, 46) * k; p.swing = r.range(0.9, 1.4); p.amp = r.range(26, 46) * k;
      p.spin = r.range(1.2, 2.6) * r.sign(); p.a0 = r.range(0.8, 1); p.layer = r.chance(0.3) ? 'front' : 'back'; p.resp = 0.9; p.x0 = p.x;
    } else if (kind === 'firefly') {
      p.size = r.range(9, 13) * k; p.vx = r.range(-12, 12) * k; p.vy = r.range(-8, 8) * k; p.pulse = r.range(0.6, 1.2);
      p.a0 = 0.85; p.y = anywhere ? r.range(0.15 * H, 0.85 * H) : r.range(0.3 * H, 0.8 * H); p.resp = 0.35;
    } else if (kind === 'sparkle') {
      p.size = r.range(8, 14) * k; p.period = r.range(1.6, 3); p.life = r.range(0, p.period); p.y = r.range(0.08 * H, 0.75 * H);
      p.a0 = 0.9; p.resp = 0.2; p.layer = 'back';
    } else {
      var L = SNOW[kind];
      p.size = r.range(L.size[0], L.size[1]) * k; p.vy = r.range(L.vy[0], L.vy[1]) * k; p.amp = r.range(L.sway[0], L.sway[1]) * k;
      p.swing = r.range(0.5, 1.1); p.a0 = r.range(L.a[0], L.a[1]); p.layer = L.layer; p.resp = L.resp; p.x0 = p.x; p.spin = r.range(-0.6, 0.6);
    }
    p.alpha = p.a0 * p.fadeIn;
    this.particles.push(p);
    return p;
  };

  P._stepAmbient = function (p, dt) {
    var W = this.W, H = this.H, k = this.k, r = this.rng;
    p.wx += (this.drift * p.resp - p.wx) * M.min(1, WIND_EASE * dt);
    if (p.fadeIn < 1) p.fadeIn = M.min(1, p.fadeIn + dt / 1.2);
    var vis = p.fadeIn;
    if (p.kind === 'petal' || p.kind === 'leaf') {
      // pendulum: angle θ = sin(phase); the fall is faster through the bottom of each swing
      p.ph += p.swing * dt;
      var s = M.sin(p.ph), c = M.cos(p.ph);
      p.x0 += p.wx * dt;
      p.x = p.x0 + p.amp * s;
      p.y += p.vy * (0.55 + 0.7 * M.abs(c)) * dt;
      if (p.kind === 'petal') p.rot = p.rock * s + 0.3 * M.sin(p.ph * 0.5);
      else { p.rot += p.spin * dt * (0.6 + 0.8 * M.abs(c)); p.flipX = M.sin(p.ph * 0.5 + p.spin) < 0; }
      if (p.y > H + 30) { p.y = r.range(-50, -15); p.x0 = r.range(-30, W + 30); }
    } else if (p.kind === 'firefly') {
      p.vx += r.range(-40, 40) * k * dt; p.vy += r.range(-40, 40) * k * dt;
      var sp = M.sqrt(p.vx * p.vx + p.vy * p.vy), mx = 22 * k;
      if (sp > mx) { p.vx *= mx / sp; p.vy *= mx / sp; }
      if (p.y < 0.12 * H) p.vy += 30 * k * dt; else if (p.y > 0.88 * H) p.vy -= 30 * k * dt;
      p.x += (p.vx + p.wx) * dt; p.y += p.vy * dt;
      p.ph += p.pulse * TAU * dt;
      vis *= 0.35 + 0.65 * (0.5 + 0.5 * M.sin(p.ph));
    } else if (p.kind === 'sparkle') {
      p.life += dt; p.x += p.wx * dt;
      var u = p.life / p.period;
      if (u >= 1) { p.life = 0; u = 0; p.x = r.range(0, W); p.y = r.range(0.08 * H, 0.75 * H); }
      var tw = M.sin(u * M.PI);
      vis *= tw * tw; p.size = (8 + 6 * tw) * k; p.rot += 0.8 * dt;
    } else {
      p.ph += p.swing * dt;
      p.x0 += p.wx * dt;
      p.x = p.x0 + p.amp * M.sin(p.ph);
      p.y += p.vy * dt; p.rot += p.spin * dt;
      if (p.y > H + 20) { p.y = r.range(-30, -8); p.x0 = r.range(-20, W + 20); }
    }
    // wrap sideways (wind can push everything off one edge)
    var m = 40 * k + p.size;
    if (p.x < -m) { if (p.x0 !== undefined) p.x0 += W + 2 * m; else p.x += W + 2 * m; }
    else if (p.x > W + m) { if (p.x0 !== undefined) p.x0 -= W + 2 * m; else p.x -= W + 2 * m; }
    if (p.fade) { p.fadeOut = (p.fadeOut === undefined ? 1 : p.fadeOut) - dt / 1.2; if (p.fadeOut <= 0) p.dead = true; vis *= M.max(0, p.fadeOut); }
    p.alpha = p.a0 * vis;
  };

  // ---------- bursts ----------
  P._add = function (o) {
    if (this.particles.length >= CAP) return null;
    var p = { amb: false, name: o.name, sprite: 'p_' + o.name, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0,
      size: o.size, s0: o.size, grow: o.grow || 0, rot: o.rot || 0, spin: o.spin || 0, flipX: !!o.flipX, alpha: o.alpha === undefined ? 1 : o.alpha,
      a0: o.alpha === undefined ? 1 : o.alpha, layer: o.layer || 'front', tint: o.tint || null, life: o.life, t: 0, delay: o.delay || 0,
      fadeIn: o.fadeIn || 0, wind: o.wind || 0 };
    this.particles.push(p);
    return p;
  };
  P.burst = function (kind, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, k = this.k, i, a, s;
    if (kind === 'merge') {
      n = n || 8;
      for (i = 0; i < n; i++) {
        a = TAU * i / n + r.range(-0.3, 0.3); s = r.range(120, 220) * k * (opts.scale || 1);
        this._add({ name: r.chance(0.7) ? 'sparkle' : 'star', x: x, y: y, vx: M.cos(a) * s, vy: M.sin(a) * s, drag: 3.2,
          size: r.range(10, 16) * k, spin: r.range(-4, 4), life: r.range(0.45, 0.75), tint: opts.color });
      }
      this._add({ name: 'puff', x: x, y: y, size: 26 * k * (opts.scale || 1), grow: 2.2, life: 0.4, alpha: 0.7, rot: r.range(0, TAU), layer: 'back', tint: opts.color });
    } else if (kind === 'hatch') {
      n = n || 8;
      for (i = 0; i < n; i++) {
        a = -M.PI / 2 + r.range(-1.1, 1.1); s = r.range(200, 340) * k;
        this._add({ name: 'shellbit', x: x + r.range(-10, 10) * k, y: y, vx: M.cos(a) * s, vy: M.sin(a) * s, g: 700 * k, size: r.range(10, 15) * k,
          spin: r.range(-8, 8), life: r.range(0.9, 1.3) });
      }
      for (i = 0; i < 6; i++) {
        a = TAU * i / 6 + r.range(-0.4, 0.4); s = r.range(140, 240) * k;
        this._add({ name: 'star', x: x, y: y, vx: M.cos(a) * s, vy: M.sin(a) * s, drag: 2.5, size: r.range(14, 20) * k, spin: r.range(-5, 5), life: r.range(0.7, 1) });
      }
      for (i = 0; i < 4; i++)
        this._add({ name: 'heart', x: x + r.range(-30, 30) * k, y: y, vx: r.range(-15, 15) * k, vy: -r.range(50, 80) * k, drag: 0.6,
          size: r.range(14, 20) * k, life: r.range(1.2, 1.6), delay: i * 0.12, fadeIn: 0.15 });
      this._add({ name: 'glow', x: x, y: y, size: 60 * k, grow: 1.6, life: 0.5, alpha: 0.8, layer: 'back' });
    } else if (kind === 'land') {
      n = clamp(n || 3, 2, 3);
      var nm = opts.name || LAND_BIT[this.zone];
      for (i = 0; i < n; i++) {
        var side = i % 2 ? 1 : -1;
        this._add({ name: nm, x: x + side * r.range(4, 10) * k, y: y, vx: side * r.range(30, 70) * k, vy: -r.range(40, 80) * k, g: 400 * k,
          size: r.range(6, 9) * k, spin: r.range(-6, 6), life: r.range(0.3, 0.45), alpha: 0.85 });
      }
    } else if (kind === 'rescue') {
      n = n || 12; var R = opts.r || 50 * k;
      for (i = 0; i < n; i++) {
        a = TAU * i / n;
        this._add({ name: i % 3 ? 'sparkle' : 'star', x: x + M.cos(a) * R, y: y + M.sin(a) * R,
          vx: M.cos(a + 0.6) * 90 * k, vy: M.sin(a + 0.6) * 90 * k, drag: 1.4, size: r.range(11, 16) * k, spin: 3, life: r.range(0.8, 1.1) });
      }
      this._add({ name: 'glow', x: x, y: y, size: R * 2, grow: 0.8, life: 0.7, alpha: 0.6, layer: 'back' });
    } else if (kind === 'level') {
      n = n || 24; var names = SHOWER[opts.zone === undefined ? this.zone : clamp(opts.zone | 0, 0, 3)];
      for (i = 0; i < n; i++)
        this._add({ name: names[i % names.length], x: r.range(0, this.W), y: -r.range(10, 80) * k, vx: r.range(-30, 30) * k, vy: r.range(90, 160) * k,
          size: r.range(12, 18) * k, spin: r.range(-3, 3), life: r.range(2.2, 3.2), delay: r.range(0, 0.8), wind: 1, fadeIn: 0.2 });
    }
  };

  // ---------- wind streaks ----------
  P._stepStreaks = function (dt) {
    var f = this.force, af = M.abs(f), r = this.rng, k = this.k;
    if (af < STREAK_MIN) { this.streakAcc = 0; return; }
    this.streakAcc += dt * (0.6 + 0.9 * af);         // ≈ 2.4 streaks/s at 2 u/s², 5 at 5 u/s²
    var live = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].name === 'streak') live++;
    while (this.streakAcc >= 1) {
      this.streakAcc -= 1;
      if (live >= 10) break;
      var dir = f > 0 ? 1 : -1, sp = r.range(420, 620) * k * (0.6 + 0.08 * af);
      var p = this._add({ name: 'streak', x: dir > 0 ? r.range(-0.2, 0.5) * this.W : r.range(0.5, 1.2) * this.W, y: r.range(0.08, 0.8) * this.H,
        vx: dir * sp, vy: r.range(-8, 8) * k, size: r.range(60, 110) * k, life: r.range(0.6, 0.95), alpha: clamp(0.25 + 0.08 * af, 0.3, 0.65),
        flipX: dir < 0, layer: r.chance(0.5) ? 'front' : 'back', fadeIn: 0.2 });
      if (p) { p.streak = true; live++; }
    }
  };

  P.update = function (dt) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    this.drift = this.force * WIND_PX * this.k;
    this._stepStreaks(dt);
    var ps = this.particles, i, p;
    for (i = 0; i < ps.length; i++) {
      p = ps[i];
      if (p.amb) { this._stepAmbient(p, dt); continue; }
      if (p.delay > 0) { p.delay -= dt; p.alpha = 0; continue; }
      p.t += dt;
      if (p.t >= p.life) { p.dead = true; continue; }
      if (p.drag) { var d = M.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += p.g * dt;
      p.x += (p.vx + (p.wind ? this.drift : 0)) * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.grow) p.size = p.s0 * (1 + p.grow * p.t / p.life);
      var u = p.t / p.life, fi = p.fadeIn ? M.min(1, p.t / p.fadeIn) : 1;
      p.alpha = p.a0 * fi * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
    }
    if (ps.some(function (q) { return q.dead; })) this.particles = ps.filter(function (q) { return !q.dead; });
    if (this.particles.length > CAP) this.particles.length = CAP;
  };

  MEG.Weather = Weather;
})(window.MEG = window.MEG || {});
