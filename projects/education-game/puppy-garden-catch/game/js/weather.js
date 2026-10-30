/* Puppy Garden Catch — PG.Weather (headless, deterministic ambient weather; DESIGN §5.3)
 *
 *   const wx = new PG.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 sunny, 1 breezy, 2 soft rain, 3 golden evening + rainbow (2 s crossfade)
 *   wx.update(dt, { groundY });      // fixed 1/60 s sub-steps (accumulator) → same result for any dt split
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle', n })   // one-shot effects (addition), same cap
 *   wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', kind }
 *   wx.clouds[]    { sprite, x, y, scale, alpha }       // sprite 'cloud1..3' | 'cloud_rain', drawn width 300·scale, centre x,y
 *   wx.ambient     { skyTop, skyBottom, tint, wind, sway, sun, rainbow, darkness, gust }
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX,1) → sprite of width `size`
 * centred, globalAlpha = alpha. Layers: 'sky' (behind hills), 'back' (behind items/nests,
 * in front of the scenery), 'front' (over everything — kept translucent).
 * Total particles ≤ 140 (ambient share scales with W×H; splashes/bursts use the rest).
 *
 * Motion models (docs/MECHANICS.md §Weather):
 *  butterfly : heading θ integrates a smoothly wandering turn rate (re-targeted every
 *              0.8–2 s), steered back when leaving its band; vertical flutter; wings
 *              alternate butterfly1/2 at 7–10 Hz with short glides; tilt from vy.
 *  pollen    : velocity eases toward a new random drift every 1–3 s + wind; twinkles; wraps.
 *  leaf/petal: falling-leaf pendulum: swing φ = A sin(ωt+φ0); horizontal speed = wind +
 *              L·A·ω·cos(ωt+φ0); descent slows at the swing ends; rot = φ + spin;
 *              flipX tumbles; gusts (every 4–7 s, 0.6 s rise / 0.8 s hold / 1.5 s decay)
 *              push wind and spin. Leaves settle on the grass and fade.
 *  rain      : straight fast streaks at the wind angle (rot = −atan2(vx,vy)), splash at groundY.
 *  sparkle   : twinkle life 1–2 s (alpha sin(πu), size pulse), slow drift.
 */
(function (PG) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 140, AMBIENT_CAP = 112, REF_AREA = 1280 * 720;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }

  var MOODS = [
    { name: 'sunny',
      amb: { skyTop: '#8FD3FF', skyBottom: '#E6F7FF', tint: null, wind: 0.1, sway: 0.25, sun: 1, rainbow: 0, darkness: 0 },
      clouds: { sprites: ['cloud1', 'cloud2', 'cloud3'], n: 3, speed: [6, 12], alpha: 0.95, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'butterfly', layer: 'back', count: 5, size: [26, 34], alpha: [0.95, 1] },
        { kind: 'pollen', layer: 'back', count: 16, size: [5, 9], alpha: [0.45, 0.8], sprite: 'pollen' },
        { kind: 'petal', layer: 'back', count: 5, size: [12, 16], alpha: [0.85, 1], sprite: 'petal', fall: [18, 28] },
        { kind: 'pollen', layer: 'front', count: 3, size: [9, 12], alpha: [0.3, 0.45], sprite: 'pollen' }
      ] },
    { name: 'breezy',
      amb: { skyTop: '#7EC8F0', skyBottom: '#DDF3E8', tint: null, wind: 0.6, sway: 0.8, sun: 0.8, rainbow: 0, darkness: 0 },
      clouds: { sprites: ['cloud1', 'cloud2', 'cloud3'], n: 4, speed: [22, 36], alpha: 0.95, scale: [0.55, 0.9] },
      emitters: [
        { kind: 'leaf', layer: 'back', count: 16, size: [18, 26], alpha: [0.9, 1], fall: [30, 46] },
        { kind: 'leaf', layer: 'front', count: 4, size: [28, 36], alpha: [0.75, 0.9], fall: [46, 60], depth: 1.3 },
        { kind: 'petal', layer: 'back', count: 4, size: [12, 16], alpha: [0.85, 1], sprite: 'petal', fall: [20, 30] },
        { kind: 'pollen', layer: 'back', count: 6, size: [5, 8], alpha: [0.4, 0.7], sprite: 'pollen' }
      ] },
    { name: 'rain',
      amb: { skyTop: '#8C9BB0', skyBottom: '#C9D3DC', tint: null, wind: 0.35, sway: 0.5, sun: 0, rainbow: 0, darkness: 0.25 },
      clouds: { sprites: ['cloud_rain'], n: 4, speed: [10, 18], alpha: 1, scale: [0.75, 1.1] },
      emitters: [
        { kind: 'rain', layer: 'front', count: 64, size: [16, 24], alpha: [0.3, 0.5], sprite: 'raindrop', fall: [950, 1150], depth: 1 },
        { kind: 'rain', layer: 'back', count: 26, size: [11, 15], alpha: [0.22, 0.32], sprite: 'raindrop', fall: [700, 850], depth: 0.7 }
      ] },
    { name: 'rainbow',
      amb: { skyTop: '#FFB38A', skyBottom: '#FFE7B8', tint: 'rgba(255,170,90,0.12)', wind: 0.15, sway: 0.3, sun: 0.6, rainbow: 1, darkness: 0 },
      clouds: { sprites: ['cloud1', 'cloud2', 'cloud3'], n: 3, speed: [5, 10], alpha: 0.85, scale: [0.55, 0.85] },
      emitters: [
        { kind: 'sparkle', layer: 'sky', count: 14, size: [12, 22], alpha: [0.7, 1], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'back', count: 4, size: [10, 16], alpha: [0.6, 0.9], sprite: 'sparkle' },
        { kind: 'pollen', layer: 'back', count: 10, size: [5, 9], alpha: [0.5, 0.85], sprite: 'pollen' },
        { kind: 'butterfly', layer: 'back', count: 2, size: [24, 30], alpha: [0.95, 1] }
      ] }
  ];
  function parseTint(t) {
    if (!t) return null;
    var m = /rgba?\(([^)]+)\)/.exec(t).slice(1)[0].split(',').map(parseFloat);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  MOODS.forEach(function (m) { m._top = hex(m.amb.skyTop); m._bot = hex(m.amb.skyBottom); m._tint = parseTint(m.amb.tint); });

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.rng = new PG.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = 2;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 70;
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1;
    this._fadeU = 1; this._from = null;
    this.ambient = {};
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS;
  Weather.CAP = HARD_CAP;
  Weather.SPRITES = ['leaf1', 'leaf2', 'petal', 'pollen', 'butterfly1', 'butterfly2', 'raindrop', 'splash', 'sparkle', 'puff', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3', 'cloud_rain'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    this.groundY *= sy;
    this.width = W; this.height = H;
  };

  P.setWeather = function (i, opts) {
    i = ((i | 0) % 4 + 4) % 4;
    var instant = opts && opts.instant;
    if (!instant && i === this.mood && this._from) return;
    this._from = this._snapshot();
    this.mood = this.weather = i;
    if (instant) {
      this._fadeU = 1;
      for (var k = 0; k < 4; k++) this.ramp[k] = k === i ? 1 : 0;
      this.particles.length = 0; this.clouds.length = 0;
      this._fillClouds(true);
      this._populate(true);
    } else {
      this._fadeU = 0;
      for (var c = 0; c < this.clouds.length; c++) this.clouds[c]._out = true;
      this._fillClouds(false);
    }
    this._ambient();
  };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a.skyTop) return null;
    return { top: hex(a.skyTop), bot: hex(a.skyBottom), tint: a._tint ? a._tint.slice() : null, wind: a.wind, sway: a.sway, sun: a.sun, rainbow: a.rainbow, darkness: a.darkness };
  };

  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient;
    function L(x, y) { return x + (y - x) * s; }
    if (!f || u >= 1) f = { top: m._top, bot: m._bot, tint: m._tint, wind: m.amb.wind, sway: m.amb.sway, sun: m.amb.sun, rainbow: m.amb.rainbow, darkness: m.amb.darkness };
    a.skyTop = toHex(L(f.top[0], m._top[0]), L(f.top[1], m._top[1]), L(f.top[2], m._top[2]));
    a.skyBottom = toHex(L(f.bot[0], m._bot[0]), L(f.bot[1], m._bot[1]), L(f.bot[2], m._bot[2]));
    var t0 = f.tint || (m._tint ? [m._tint[0], m._tint[1], m._tint[2], 0] : null), t1 = m._tint || (t0 ? [t0[0], t0[1], t0[2], 0] : null);
    if (t0 && t1) {
      var tt = [L(t0[0], t1[0]), L(t0[1], t1[1]), L(t0[2], t1[2]), L(t0[3], t1[3])];
      a._tint = tt;
      a.tint = tt[3] > 0.004 ? 'rgba(' + Math.round(tt[0]) + ',' + Math.round(tt[1]) + ',' + Math.round(tt[2]) + ',' + tt[3].toFixed(3) + ')' : null;
    } else { a._tint = null; a.tint = null; }
    a.wind = L(f.wind, m.amb.wind) * (1 + 0.8 * this.gust);
    a.windBase = L(f.wind, m.amb.wind);
    a.sway = clamp(L(f.sway, m.amb.sway) + 0.25 * this.gust, 0, 1);
    a.sun = L(f.sun, m.amb.sun); a.rainbow = L(f.rainbow, m.amb.rainbow); a.darkness = L(f.darkness, m.amb.darkness);
    a.gust = this.gust;
  };

  // ---------------------------------------------------------------- clouds
  P._fillClouds = function (spread) {
    var c = MOODS[this.mood].clouds, W = this.width, H = this.height, r = this.rng;
    var n = Math.round(c.n * clamp(W / 1280, 0.7, 1.3));
    for (var i = 0; i < n; i++) {
      var sc = r.float(c.scale[0], c.scale[1]);
      this.clouds.push({ sprite: r.pick(c.sprites), x: (i + r.float(0.15, 0.85)) / n * (W + 300 * sc) - 150 * sc,
        y: H * r.float(0.05, H > W ? 0.2 : 0.26), scale: sc, alpha: spread ? c.alpha : 0,
        _a: c.alpha, _v: r.float(c.speed[0], c.speed[1]), _fade: spread ? 1 : 0, _out: false });
    }
  };

  P._stepClouds = function (h) {
    var W = this.width, windK = 1 + 0.6 * this.gust;
    for (var i = this.clouds.length - 1; i >= 0; i--) {
      var c = this.clouds[i], half = 150 * c.scale;
      c._fade = clamp(c._fade + (c._out ? -h : h) / this.fadeTime, 0, 1);
      if (c._out && c._fade <= 0) { this.clouds.splice(i, 1); continue; }
      c.x += c._v * windK * h;
      if (c.x - half > W) c.x = -half;
      c.alpha = c._a * c._fade;
    }
  };

  // ---------------------------------------------------------------- particles
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 4; m++) {
      out[m] = [];
      for (e = 0; e < MOODS[m].emitters.length; e++) { var t = MOODS[m].emitters[e].count * k * this.ramp[m]; out[m][e] = t; sum += t; }
    }
    var cap = Math.min(AMBIENT_CAP, AMBIENT_CAP * k), f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 4; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [[], [], [], []], i, m, e;
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) counts[m][e] = 0;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.emitter >= 0 && !p.dying) counts[p.mood][p.emitter]++;
    }
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      var spawnN = anywhere ? want - have : Math.min(2, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) {               // retire extras (fade out)
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) {
          var q = this.particles[i];
          if (q.mood === m && q.emitter === e && !q.dying) { q.dying = true; extra--; }
        }
      }
    }
  };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, H = this.height, gY = this.groundY;
    var p = { sprite: em.sprite || 'pollen', x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    switch (em.kind) {
      case 'butterfly':
        p.x = r.float(0.1, 0.9) * W; p.y = r.float(0.2, 0.75) * gY;
        p.hd = r.float(0, TAU); p.turn = 0; p.turnT = 0; p.tt = 0; p.sp = r.float(45, 70);
        p.flap = r.float(0, 1); p.flapHz = r.float(7, 10); p.glide = 0; p.flutPh = r.float(0, TAU);
        p.sprite = 'butterfly1';
        break;
      case 'pollen':
        p.x = r.float(0, W); p.y = r.float(0.1, 1) * gY;
        p.tvx = r.float(-10, 10); p.tvy = r.float(-8, 6); p.tt = r.float(1, 3); p.tw = r.float(1.5, 3.5); p.twPh = r.float(0, TAU);
        break;
      case 'leaf':
      case 'petal':
        if (em.kind === 'leaf') p.sprite = r.chance(0.5) ? 'leaf1' : 'leaf2';
        p.fall = r.float(em.fall[0], em.fall[1]) * p.depth;
        p.A = r.float(0.55, 1.0); p.w = r.float(1.8, 3.0); p.ph = r.float(0, TAU); p.L = r.float(22, 40) * p.depth;
        p.spin = r.float(-1.2, 1.2); p.spinA = 0; p.tumble = r.float(0, TAU); p.tumbleW = r.float(1, 3);
        p.rest = -1;
        if (anywhere) { p.x = r.float(0, W); p.y = r.float(-0.05, 0.9) * gY; }
        else if (r.chance(0.35) && MOODS[this.mood].amb.wind > 0.3) { p.x = -30; p.y = r.float(0.05, 0.6) * gY; p.fade = 1; }
        else { p.x = r.float(-0.2, 1) * W; p.y = -30; p.fade = 1; }
        break;
      case 'rain':
        p.fall = r.float(em.fall[0], em.fall[1]);
        p.gOff = r.float(0, 40) * (p.layer === 'back' ? 0.4 : 1);
        p.x = r.float(-0.25, 1.05) * W;
        p.y = anywhere ? r.float(-40, gY) : r.float(-120, -20);
        p.fade = 1;
        break;
      case 'sparkle':
        p.x = r.float(0.05, 0.95) * W; p.y = (p.layer === 'sky' ? r.float(0.06, 0.5) : r.float(0.35, 0.85)) * gY;
        p.life = r.float(1, 2); p.age = anywhere ? r.float(0, p.life) : 0; p.vx = r.float(-6, 6); p.vy = r.float(-8, 2);
        p.fade = 1; p.rotV = r.float(-1, 1);
        break;
    }
    this.particles.push(p);
    return p;
  };

  P._respawn = function (p) {
    var i = this.particles.indexOf(p);
    if (i >= 0) this.particles.splice(i, 1);
    if (!p.dying && this.mood === p.mood) {
      var q = this._spawn(p.mood, p.emitter, false);
      return q;
    }
    return null;
  };

  /** One-shot effect particles (count toward the hard cap). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), flipX: 1, alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, depth: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        var ang = r.float(-Math.PI * 0.9, -Math.PI * 0.1), sp = r.float(250, 620);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.6, 2.4);
      } else if (kind === 'puff') {
        p.sprite = 'puff'; p.size = r.float(18, 28); p.layer = 'back';
        var a2 = r.float(-Math.PI, 0); p.vx = Math.cos(a2) * r.float(30, 80); p.vy = Math.sin(a2) * r.float(10, 40); p.life = r.float(0.45, 0.7); p.rotV = r.float(-2, 2);
      } else {
        p.sprite = 'sparkle'; p.size = r.float(12, 20); p.kind = 'sparkle'; p.life = r.float(0.5, 0.9);
        var a3 = r.float(0, TAU), s3 = r.float(60, 200); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3; p.rotV = r.float(-3, 3); p.burst = true;
      }
      p.s0 = p.size;
      this.particles.push(p);
    }
  };

  P.update = function (dt, env) {
    if (env && env.groundY !== undefined) this.groundY = env.groundY;
    if (!(dt > 0)) return;
    this._acc += Math.min(dt, 1);
    while (this._acc >= this.stepH - 1e-12) { this._acc -= this.stepH; this._step(this.stepH); }
  };

  P._step = function (h) {
    this.time += h;
    var k;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    // gusts (strength scales with the mood's base wind)
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.7, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp * clamp(this.ambient.windBase / 0.6, 0, 1.2); this._gustAge += h; }
    }
    this._ambient();
    this._stepClouds(h);
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, gY = this.groundY, a = this.ambient, r = this.rng, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this.particles.splice(this.particles.indexOf(p), 1); return; }
    var windPx = a.wind * 120;
    switch (p.kind) {
      case 'butterfly': {
        p.tt -= h;
        if (p.tt <= 0) { p.tt = r.float(0.8, 2); p.turnT = r.float(-2.2, 2.2); if (r.chance(0.25)) p.glide = r.float(0.3, 0.6); }
        p.turn += (p.turnT - p.turn) * Math.min(1, h * 2);
        var cx = W * 0.5, cy = gY * 0.45, out = p.x < 50 || p.x > W - 50 || p.y < H * 0.1 || p.y > gY - 60;
        if (out) {
          var want = Math.atan2(cy - p.y, cx - p.x), d = Math.atan2(Math.sin(want - p.hd), Math.cos(want - p.hd));
          p.turn += d * 3 * h;
        }
        p.hd += p.turn * h;
        var flapping = p.glide <= 0;
        if (!flapping) p.glide -= h;
        p.flap = (p.flap + h * (flapping ? p.flapHz : 0)) % 1;
        p.sprite = p.flap < 0.5 ? 'butterfly1' : 'butterfly2';
        var sp = p.sp * (flapping ? 1 : 0.8);
        p.vx = Math.cos(p.hd) * sp + windPx * 0.3;
        p.vy = Math.sin(p.hd) * sp * 0.6 + (flapping ? 14 * Math.cos(TAU * 1.6 * p.age + p.flutPh) : 10);
        p.x += p.vx * h; p.y += p.vy * h;
        p.flipX = p.vx < 0 ? -1 : 1;
        p.rot = clamp(p.vy * 0.004, -0.35, 0.35) * p.flipX;
        p.alpha = p.a0 * p.fade;
        break;
      }
      case 'pollen': {
        p.tt -= h;
        if (p.tt <= 0) { p.tt = r.float(1, 3); p.tvx = r.float(-10, 10); p.tvy = r.float(-8, 6); }
        var kk = Math.min(1, h * 0.8);
        p.vx += (p.tvx + windPx * 0.5 - p.vx) * kk; p.vy += (p.tvy - p.vy) * kk;
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.x < -20) p.x += W + 40; else if (p.x > W + 20) p.x -= W + 40;
        if (p.y < -20) p.y = gY; else if (p.y > gY + 10) p.y = 0;
        p.rot += h * 0.5;
        p.alpha = p.a0 * p.fade * (0.65 + 0.35 * Math.sin(p.twPh + p.tw * p.age));
        break;
      }
      case 'leaf':
      case 'petal': {
        if (p.rest >= 0) {                          // lying on the grass, fading
          p.rest += h; p.alpha = p.a0 * clamp(1 - p.rest / 1.5, 0, 1);
          if (p.rest >= 1.5) this._respawn(p);
          return;
        }
        var ph = p.w * p.age + p.ph, swing = p.A * Math.sin(ph), cs = Math.cos(ph);
        var gustSpin = 1 + 2.5 * this.gust;
        p.vx = windPx * p.depth * (p.kind === 'leaf' ? 1.6 : 1) + p.L * p.A * p.w * cs;
        p.vy = p.fall * (0.45 + 0.55 * Math.abs(cs)) - 25 * this.gust * p.depth;
        p.x += p.vx * h; p.y += p.vy * h;
        p.spinA += p.spin * gustSpin * h;
        p.rot = swing * 0.9 + p.spinA;
        p.flipX = Math.cos(p.tumble + p.tumbleW * p.age * gustSpin) >= 0 ? 1 : -1;
        p.alpha = p.a0 * p.fade;
        var floor = p.layer === 'front' ? H + 40 : gY - 4 + (p.ph / TAU) * 26;
        if (p.y >= floor && p.layer !== 'front') { p.rest = 0; p.y = floor; return; }
        if (p.y > H + 40 || p.x > W + 60 || p.x < -0.3 * W - 60) this._respawn(p);
        break;
      }
      case 'rain': {
        var wr = a.wind * 500 * p.depth;
        p.vx = wr; p.vy = p.fall;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = -Math.atan2(p.vx, p.vy);
        p.alpha = p.a0 * p.fade;
        if (p.y >= gY + p.gOff) {
          if (this.particles.length < HARD_CAP && p.x > -10 && p.x < W + 10 && (p.layer === 'front' || r.chance(0.5))) {
            this.particles.push({ sprite: 'splash', x: p.x, y: gY + p.gOff, size: 0, s0: r.float(14, 20) * (p.layer === 'back' ? 0.7 : 1), rot: 0, flipX: r.sign(),
              alpha: 0, layer: 'back', kind: 'splash', mood: p.mood, emitter: -1, a0: 0.75, fade: 1, dying: false, age: 0, vx: 0, vy: 0, life: 0.28 });
          }
          if (p.dying) { this.particles.splice(this.particles.indexOf(p), 1); return; }
          p.x = r.float(-0.25, 1.05) * W; p.y = r.float(-120, -20);
        }
        break;
      }
      case 'splash':
        u = p.age / p.life;
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.size = p.s0 * (0.6 + 0.6 * u); p.alpha = p.a0 * (1 - u);
        break;
      case 'sparkle': {
        u = p.age / p.life;
        if (u >= 1) {
          if (p.burst) { this.particles.splice(this.particles.indexOf(p), 1); return; }
          this._respawn(p); return;
        }
        if (p.burst) { p.vx *= Math.pow(0.05, h); p.vy *= Math.pow(0.05, h); }
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        if (p.s0 === undefined) p.s0 = p.size;
        p.size = p.s0 * (0.6 + 0.6 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 900 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW) >= 0 ? 1 : -1;
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
        break;
    }
  };

  PG.Weather = Weather;
})(window.PG = window.PG || {});
