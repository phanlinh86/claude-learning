/* Owlet's Snow Garden — SG.Weather (headless, deterministic times of day; DESIGN §5.3)
 *
 *   const wx = new SG.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 morning, 1 noon, 2 sunset, 3 starry night (2.5 s crossfade)
 *   wx.update(dt, { groundY });      // fixed 1/60 s sub-steps (accumulator) → same result for any dt split
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle', n })   // one-shot effects, same cap
 *   wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', kind }
 *   wx.clouds[]    { sprite:'cloud1..3', x, y, scale, alpha }  // drawn width 300·scale, centre x,y
 *   wx.stars[]     { x, y, r, phase, tw }   // fixed star field (px); alpha = ambient.stars·(0.55 + 0.45·sin(phase + tw·time))
 *   wx.auroraT     seconds (aurora ribbon animation clock), wx.time
 *   wx.ambient     { skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, moon, moonX, moonY,
 *                    stars, aurora, darkness, gust, windBase }
 *                  sunX/sunY/moonX/moonY are 0..1 of the screen (the sun travels when the time of day changes).
 *                  darkness ≤ 0.28 is a navy tint for the BACKGROUND only (never over seeds, pots, flowers, Lumi).
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX,1) → sprite of width `size`
 * centred, globalAlpha = alpha. Layers: 'sky' (behind hills), 'back' (behind seeds/pots,
 * in front of the scenery), 'front' (over everything — kept translucent and few).
 * Total particles ≤ 140 (ambient share scales with W×H; bursts use the rest).
 *
 * Motion models (docs/MECHANICS.md §6):
 *  snow    : falling flake with a sideways flutter  vx = wind·120·depth + L·A·ω·cos(ωt+φ),
 *            vy = fall·(0.8 + 0.2·|sin(ωt+φ)|); tumbles (rot spin + flipX); settles on the snow and fades.
 *  petal   : falling-leaf pendulum (swing φ = A sin(ωt+φ0), descent slows at the swing ends), settles + fades.
 *  sparkle : twinkle life 1–2 s (alpha sin(πu), size pulse), slow drift (sky) / static glitter on the snow.
 *  star    : sky twinkle, long life 2–4 s, no drift.
 *  mist    : large faint 'puff' sprites drifting slowly along the horizon (morning), wrap around.
 *  gusts   : every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) push wind/sway, scaled by the mood's base wind.
 */
(function (SG) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 140, AMBIENT_CAP = 112, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }

  // ---- sky colours per time of day (the environment artist may refine these constants)
  var SKY = [   // values from the environment artist's scene study (tools/env_scenes.js)
    { top: '#F3B5C9', bottom: '#FFE3C8', horizon: '#FFD2B0', tint: 'rgba(255,186,160,0.10)' },   // 0 morning: pink / peach
    { top: '#62B4F0', bottom: '#D5EEFF', horizon: '#EEF8FF', tint: null },                         // 1 noon: bright blue
    { top: '#6E58B4', bottom: '#FF9F6A', horizon: '#FFC27A', tint: 'rgba(255,140,96,0.13)' },     // 2 sunset: violet → orange
    { top: '#121B45', bottom: '#2D3E7C', horizon: '#4E63A6', tint: null }                          // 3 night: navy
  ];
  var NUM_KEYS = ['wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'aurora', 'darkness'];

  var MOODS = [
    { name: 'morning',
      amb: { wind: 0.12, sway: 0.2, sun: 1, sunX: 0.8, sunY: 0.34, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, aurora: 0, darkness: 0 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.9, scale: [0.55, 0.85] },
      emitters: [
        { kind: 'sparkle', layer: 'sky', count: 6, size: [10, 18], alpha: [0.6, 0.9], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'back', count: 4, size: [9, 14], alpha: [0.55, 0.85], sprite: 'sparkle' },
        { kind: 'mist', layer: 'back', count: 6, size: [140, 220], alpha: [0.14, 0.22], sprite: 'puff' },
        { kind: 'petal', layer: 'back', count: 3, size: [12, 16], alpha: [0.85, 1], sprite: 'petal', fall: [18, 26] }
      ] },
    { name: 'noon',
      amb: { wind: 0.25, sway: 0.35, sun: 1, sunX: 0.66, sunY: 0.12, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, aurora: 0, darkness: 0 },
      clouds: { n: 4, speed: [10, 18], alpha: 0.95, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'snow', layer: 'back', count: 30, size: [10, 18], alpha: [0.75, 0.95], fall: [32, 50] },
        { kind: 'snow', layer: 'front', count: 5, size: [20, 26], alpha: [0.55, 0.7], fall: [55, 70], depth: 1.3 },
        { kind: 'glitter', layer: 'back', count: 10, size: [8, 14], alpha: [0.7, 1], sprite: 'sparkle' }
      ] },
    { name: 'sunset',
      amb: { wind: 0.18, sway: 0.3, sun: 1, sunX: 0.24, sunY: 0.46, moon: 0.15, moonX: 0.84, moonY: 0.22, stars: 0.1, aurora: 0, darkness: 0.08 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.9, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'snow', layer: 'back', count: 18, size: [10, 16], alpha: [0.7, 0.9], fall: [22, 34] },
        { kind: 'petal', layer: 'back', count: 4, size: [12, 16], alpha: [0.85, 1], sprite: 'petal', fall: [18, 28] },
        { kind: 'sparkle', layer: 'sky', count: 4, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' }
      ] },
    { name: 'night',
      amb: { wind: 0.1, sway: 0.2, sun: 0, sunX: 0.12, sunY: 0.62, moon: 1, moonX: 0.78, moonY: 0.16, stars: 1, aurora: 1, darkness: 0.28 },
      clouds: { n: 2, speed: [3, 6], alpha: 0.35, scale: [0.5, 0.8] },
      emitters: [
        { kind: 'star', layer: 'sky', count: 18, size: [10, 18], alpha: [0.7, 1], sprite: 'star' },
        { kind: 'snow', layer: 'back', count: 16, size: [9, 15], alpha: [0.65, 0.9], fall: [18, 28] },
        { kind: 'snow', layer: 'front', count: 3, size: [18, 24], alpha: [0.45, 0.6], fall: [36, 48], depth: 1.3 }
      ] }
  ];
  function parseTint(t) {
    if (!t) return null;
    var m = /rgba?\(([^)]+)\)/.exec(t)[1].split(',').map(parseFloat);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  MOODS.forEach(function (m, i) {
    m.amb.skyTop = SKY[i].top; m.amb.skyBottom = SKY[i].bottom; m.amb.horizon = SKY[i].horizon; m.amb.tint = SKY[i].tint;
    m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._hor = hex(SKY[i].horizon); m._tint = parseTint(SKY[i].tint);
  });

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.rng = new SG.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0; this.auroraT = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 70;
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1;
    this._fadeU = 1; this._from = null;
    this.ambient = {};
    this._makeStars();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS;
  Weather.SKY = SKY;
  Weather.CAP = HARD_CAP;
  Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['snow1', 'snow2', 'sparkle', 'star', 'petal', 'leaf', 'puff', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P._makeStars = function () {     // own generator: the star field never changes the particle sequence
    var r = new SG.RNG((this.rng.seed ^ 0x5f3759df) >>> 0), W = this.width, gY = this.groundY;
    var n = Math.round(70 * clamp(W * this.height / REF_AREA, 0.7, 1.5));
    this.stars = [];
    for (var i = 0; i < n; i++) {
      this.stars.push({ x: r.float(0, W), y: r.float(0.03, 0.55) * gY, r: r.chance(0.12) ? r.float(2, 3) : r.float(0.8, 1.8),
        phase: r.float(0, TAU), tw: r.float(1, 3) });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    for (i = 0; i < this.stars.length; i++) { this.stars[i].x *= sx; this.stars[i].y *= sy; }
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
    var s = { top: hex(a.skyTop), bot: hex(a.skyBottom), hor: hex(a.horizon), tint: a._tint ? a._tint.slice() : null };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]] !== undefined ? a['_' + NUM_KEYS[k]] : a[NUM_KEYS[k]];
    return s;
  };

  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return toHex(L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])); }
    if (!f || u >= 1) {
      f = { top: m._top, bot: m._bot, hor: m._hor, tint: m._tint };
      for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]];
    }
    a.skyTop = C(f.top, m._top); a.skyBottom = C(f.bot, m._bot); a.horizon = C(f.hor, m._hor);
    var t0 = f.tint || (m._tint ? [m._tint[0], m._tint[1], m._tint[2], 0] : null), t1 = m._tint || (t0 ? [t0[0], t0[1], t0[2], 0] : null);
    if (t0 && t1) {
      var tt = [L(t0[0], t1[0]), L(t0[1], t1[1]), L(t0[2], t1[2]), L(t0[3], t1[3])];
      a._tint = tt;
      a.tint = tt[3] > 0.004 ? 'rgba(' + Math.round(tt[0]) + ',' + Math.round(tt[1]) + ',' + Math.round(tt[2]) + ',' + tt[3].toFixed(3) + ')' : null;
    } else { a._tint = null; a.tint = null; }
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    a.windBase = a._wind;
    a.wind = a._wind * (1 + 0.8 * this.gust);
    a.sway = clamp(a._sway + 0.25 * this.gust, 0, 1);
    a.darkness = clamp(a._darkness, 0, 0.28);
    a.gust = this.gust;
  };

  // ---------------------------------------------------------------- clouds
  P._fillClouds = function (spread) {
    var c = MOODS[this.mood].clouds, W = this.width, H = this.height, r = this.rng;
    var n = Math.max(1, Math.round(c.n * clamp(W / 1280, 0.7, 1.3)));
    for (var i = 0; i < n; i++) {
      var sc = r.float(c.scale[0], c.scale[1]);
      this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: (i + r.float(0.15, 0.85)) / n * (W + 300 * sc) - 150 * sc,
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
    var p = { sprite: em.sprite || 'snow1', x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    switch (em.kind) {
      case 'snow':
      case 'petal':
        if (em.kind === 'snow') p.sprite = r.chance(0.5) ? 'snow1' : 'snow2';
        p.fall = r.float(em.fall[0], em.fall[1]) * p.depth;
        p.A = em.kind === 'snow' ? r.float(0.4, 0.8) : r.float(0.55, 1.0);
        p.w = em.kind === 'snow' ? r.float(1.2, 2.2) : r.float(1.8, 3.0);
        p.ph = r.float(0, TAU); p.L = (em.kind === 'snow' ? r.float(10, 22) : r.float(22, 40)) * p.depth;
        p.spin = r.float(-1.2, 1.2); p.spinA = r.float(0, TAU); p.tumble = r.float(0, TAU); p.tumbleW = r.float(0.6, 2);
        p.rest = -1;
        if (anywhere) { p.x = r.float(0, W); p.y = r.float(-0.05, 0.95) * gY; }
        else { p.x = r.float(-0.15, 1.05) * W; p.y = -30; p.fade = 1; }
        break;
      case 'sparkle':
      case 'star':
      case 'glitter':
        p.x = r.float(0.04, 0.96) * W;
        if (em.kind === 'glitter') p.y = gY + r.float(-6, Math.max(10, H - gY - 10));
        else p.y = (p.layer === 'sky' ? r.float(0.05, em.kind === 'star' ? 0.5 : 0.45) : r.float(0.35, 0.85)) * gY;
        p.life = em.kind === 'star' ? r.float(2, 4) : r.float(1, 2);
        p.age = anywhere ? r.float(0, p.life) : 0;
        p.vx = em.kind === 'sparkle' ? r.float(-6, 6) : 0; p.vy = em.kind === 'sparkle' ? r.float(-8, 2) : 0;
        p.fade = 1; p.rotV = r.float(-1, 1); p.s0 = p.size;
        break;
      case 'mist':
        p.x = r.float(-0.1, 1.1) * W; p.y = gY + r.float(-60, 10);
        p.vx = r.float(4, 10) * r.sign(); p.ph = r.float(0, TAU);
        break;
    }
    this.particles.push(p);
    return p;
  };

  P._respawn = function (p) {
    var i = this.particles.indexOf(p);
    if (i >= 0) this.particles.splice(i, 1);
    if (!p.dying && this.mood === p.mood) return this._spawn(p.mood, p.emitter, false);
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
    this.time += h; this.auroraT += h;
    var k;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.7, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp * clamp(this.ambient.windBase / 0.25, 0, 1.2); this._gustAge += h; }
    }
    this._ambient();
    this._stepClouds(h);
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, gY = this.groundY, a = this.ambient, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this.particles.splice(this.particles.indexOf(p), 1); return; }
    var windPx = a.wind * 120;
    switch (p.kind) {
      case 'snow':
      case 'petal': {
        if (p.rest >= 0) {                          // lying on the snow, fading
          p.rest += h; p.alpha = p.a0 * p.fade * clamp(1 - p.rest / 1.2, 0, 1);
          if (p.rest >= 1.2) this._respawn(p);
          return;
        }
        var ph = p.w * p.age + p.ph, sn = Math.sin(ph), cs = Math.cos(ph), gustSpin = 1 + 2.5 * this.gust;
        p.vx = windPx * p.depth * (p.kind === 'petal' ? 1.3 : 1) + p.L * p.A * p.w * cs;
        p.vy = p.kind === 'snow' ? p.fall * (0.8 + 0.2 * Math.abs(sn)) : p.fall * (0.45 + 0.55 * Math.abs(cs)) - 20 * this.gust * p.depth;
        p.x += p.vx * h; p.y += p.vy * h;
        p.spinA += p.spin * gustSpin * h;
        p.rot = p.kind === 'petal' ? p.A * sn * 0.9 + p.spinA : p.spinA;
        p.flipX = Math.cos(p.tumble + p.tumbleW * p.age * gustSpin) >= 0 ? 1 : -1;
        p.alpha = p.a0 * p.fade;
        if (p.layer !== 'front') {
          var floor = gY - 4 + (p.ph / TAU) * 30;
          if (p.y >= floor) { p.rest = 0; p.y = floor; return; }
        }
        if (p.layer !== 'front') { if (p.x > W + 40) p.x -= W + 80; else if (p.x < -40) p.x += W + 80; }   // wrap
        if (p.y > H + 40 || p.x > W + 60 || p.x < -0.3 * W - 60) this._respawn(p);
        break;
      }
      case 'sparkle':
      case 'star':
      case 'glitter': {
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
      case 'mist': {
        p.x += (p.vx + windPx * 0.15) * h;
        p.y += Math.sin(p.ph + p.age * 0.4) * 2 * h;
        if (p.x - p.size > W) p.x = -p.size; else if (p.x + p.size < 0) p.x = W + p.size;
        p.alpha = p.a0 * p.fade * (0.8 + 0.2 * Math.sin(p.ph + p.age * 0.6));
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

  SG.Weather = Weather;
})(window.SG = window.SG || {});
