/* Lulu's Jungle Tower — JT.Weather (headless, deterministic time of day; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new JT.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 morning, 1 noon, 2 sunset, 3 night (2.5 s crossfade)
 *   wx.setNight(on, { instant })     // the session-done starry party: extra darkness + fireflies whatever the time of day
 *   wx.update(dt);                   // fixed 1/60 s steps
 *   wx.burst(x, y, { kind, n, color })   // one-shot effects (same cap), SCREEN px:
 *       'confetti' | 'puff' | 'sparkle' | 'stars' | 'leaves' (green leaves puff out: block clear, gust) |
 *       'petals' (coral/cream petals: bloom) | 'pollen' (soft glowing dust: count glow)   ('rustle' = 'leaves')
 *   wx.particles[] { sprite, x, y, size, rot, alpha, layer:'sky'|'back'|'front', kind, color?, flipX?, glow? }  SCREEN px (centre)
 *       sprite ∈ Weather.SPRITES (game/assets/default/particles/<sprite>.svg, 32×32), drawn size px, rotated rot;
 *       layer 'sky' = twinkling stars (draw right after the sky gradient, before the far jungle); 'back' = behind the
 *       tower and blocks; 'front' = over everything but the UI. color: CSS colour to tint (confetti, glints) or null;
 *       glow 0..1 (fireflies): draw an extra soft additive halo of 3·size.
 *   wx.clouds[]    { sprite:'cloud_a'|'cloud_b'|'cloud_c', x, y, scale, alpha, layer 0|1 }   SCREEN px (centre, 320·scale wide)
 *   wx.mist[]      { sprite:'cloud_a'|'cloud_b'|'cloud_c', x, y, scale, alpha }   morning mist bands low over the jungle
 *                  (draw between the mid and the ground layers, 320·scale wide, 170·scale·0.5 tall: squashed)
 *   wx.ambient     { skyTop, skyBottom, skyMid, tint (rgba | null), sun 0..1, sunX, sunY, moon 0..1, moonX, moonY (0..1 of
 *                    the screen), darkness 0..0.45, mist 0..1, wind (px/s, + = right), gust 0..1, mood:'morning'|'noon'|
 *                    'sunset'|'night', moodIndex 0..3, env (= mood: env/<far|mid|ground>_<env>.svg), envFrom, envMix 0..1 }
 */
(function (JT) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 76, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['morning', 'noon', 'sunset', 'night'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- sky per time of day (DESIGN §3)
  var SKY = [
    { top: '#BFE6F2', bottom: '#F4EFD6', tint: [255, 246, 228, 0.06] },   // morning (mist)
    { top: '#7FC8F0', bottom: '#DDF1FB', tint: [255, 250, 220, 0.0] },    // noon
    { top: '#F5A878', bottom: '#FBE0A8', tint: [255, 196, 140, 0.12] },   // sunset
    { top: '#1C2650', bottom: '#3B4A7A', tint: [40, 56, 120, 0.16] }      // night
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'dark', 'mist', 'windBase', 'gusty'];
  var GLINT = ['#FFF6C8', '#FFE7A0', '#FFFFFF'];
  var PETAL = ['#F2A28E', '#F7D9C4', '#E8B4C8'];   // muted coral / cream / lilac (never an answer colour)
  var FIREFLY = ['#E8FF9A', '#FFF3A0', '#C8FF9E'];

  var MOODS = [
    { name: 'morning', amb: { sun: 0.7, sunX: 0.16, sunY: 0.2, moon: 0, moonX: 0.8, moonY: 0.14, dark: 0, mist: 1, windBase: 5, gusty: 8 }, clouds: [2, 2], mistBands: 4,
      emitters: [
        { kind: 'float', sprite: 'pollen', layer: 'front', count: 18, size: [8, 14], alpha: [0.45, 0.8], glow: 0.3 },
        { kind: 'drift', sprite: 'leaf_a', layer: 'back', count: 4, size: [14, 20], alpha: [0.7, 0.9], fall: [22, 36], sway: 30, spin: 1.6 }
      ] },
    { name: 'noon', amb: { sun: 1, sunX: 0.74, sunY: 0.1, moon: 0, moonX: 0.8, moonY: 0.14, dark: 0, mist: 0, windBase: 7, gusty: 12 }, clouds: [3, 2], mistBands: 0,
      emitters: [
        { kind: 'drift', sprite: 'leaf_a', layer: 'front', count: 8, size: [14, 22], alpha: [0.8, 1], fall: [28, 48], sway: 36, spin: 2.4 },
        { kind: 'drift', sprite: 'leaf_b', layer: 'front', count: 7, size: [14, 22], alpha: [0.8, 1], fall: [28, 48], sway: 36, spin: 2.4 },
        { kind: 'glint', sprite: 'sparkle', layer: 'back', count: 10, size: [10, 18], alpha: [0.5, 0.85] }
      ] },
    { name: 'sunset', amb: { sun: 0.8, sunX: 0.82, sunY: 0.3, moon: 0.15, moonX: 0.16, moonY: 0.16, dark: 0.08, mist: 0.2, windBase: 16, gusty: 24 }, clouds: [3, 3], mistBands: 1,
      emitters: [
        { kind: 'drift', sprite: 'petal', layer: 'front', count: 16, size: [10, 16], alpha: [0.75, 0.95], fall: [26, 44], sway: 30, spin: 2, warm: true },
        { kind: 'float', sprite: 'pollen', layer: 'back', count: 8, size: [7, 12], alpha: [0.4, 0.7], glow: 0.4 }
      ] },
    { name: 'night', amb: { sun: 0, sunX: 0.82, sunY: 0.3, moon: 1, moonX: 0.78, moonY: 0.14, dark: 0.45, mist: 0.35, windBase: 3, gusty: 6 }, clouds: [1, 2], mistBands: 2,
      emitters: [
        { kind: 'twinkle', sprite: 'star', layer: 'sky', count: 26, size: [6, 13], alpha: [0.6, 1] },
        { kind: 'firefly', sprite: 'firefly', layer: 'front', count: 16, size: [10, 16], alpha: [0.7, 1] },
        { kind: 'firefly', sprite: 'firefly', layer: 'back', count: 10, size: [7, 11], alpha: [0.5, 0.8] }
      ] }
  ];
  MOODS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._tint = SKY[i].tint; });
  // the starry party (setNight): fireflies + stars whatever the time of day
  var NIGHT_EMIT = MOODS[3].emitters;

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.rng = new JT.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.mist = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.night = 0; this._nightT = 0;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.SKY = SKY; Weather.CAP = HARD_CAP; Weather.FADE_TIME = FADE_TIME; Weather.NAMES = NAMES;
  Weather.SPRITES = ['petal', 'leaf_a', 'leaf_b', 'pollen', 'firefly', 'sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud_a', 'cloud_b', 'cloud_c'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeClouds = function () {    // 2 cloud layers in the upper sky + mist bands low over the canopy; they drift and wrap
    var r = new JT.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height, k = clamp(W / 1280, 0.7, 1.3);
    this.clouds = [];
    for (var l = 0; l < 2; l++) {
      var n = Math.max(2, Math.round([4, 3][l] * k));
      for (var i = 0; i < n; i++) {
        this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: (i + r.float(0, 1)) / n * W * 1.2 - 0.1 * W,
          y: r.float(0.05, l ? 0.26 : 0.18) * H, scale: [0.5, 0.75][l] * r.float(0.8, 1.2), alpha: [0.7, 0.9][l], layer: l,
          _a: [0.7, 0.9][l], _v: r.float(4, 9) * (l + 1), _on: 1, idx: i });
      }
    }
    this.mist = [];
    for (var j = 0; j < 4; j++) {
      this.mist.push({ sprite: Weather.CLOUD_SPRITES[j % 3], x: (j + r.float(0.2, 0.8)) / 4 * W * 1.3 - 0.15 * W,
        y: r.float(0.5, 0.72) * H, scale: r.float(1.1, 1.6) * k, alpha: 0, _a: r.float(0.35, 0.55), _v: r.float(5, 10) * (j % 2 ? 1 : -0.6),
        _on: 0, idx: j, _ph: r.float(0, TAU) });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i, a = [this.particles, this.clouds, this.mist];
    for (var k = 0; k < a.length; k++) for (i = 0; i < a[k].length; i++) { a[k][i].x *= sx; a[k][i].y *= sy; }
    this.width = W; this.height = H;
  };

  P.setWeather = function (i, opts) {
    i = ((i | 0) % 4 + 4) % 4;
    var instant = opts && opts.instant;
    if (!instant && i === this.mood && this._from) return;
    this._from = this._snapshot();
    this._fromMood = this.mood;
    this.mood = this.weather = i;
    if (instant) {
      this._fadeU = 1; this._fromMood = i;
      for (var k = 0; k < 4; k++) this.ramp[k] = k === i ? 1 : 0;
      this.particles.length = 0;
      for (var q = 0; q < this.mist.length; q++) this.mist[q]._on = q < MOODS[i].mistBands ? 1 : 0;
      this._populate(true);
    } else this._fadeU = 0;
    this._ambient();
  };
  P.setNight = function (on, opts) { this._nightT = on ? 1 : 0; if (opts && opts.instant) this.night = this._nightT; this._ambient(); };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), bot: a._bot.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };

  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) {
      f = { top: m._top, bot: m._bot, tint: m._tint };
      for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]];
    }
    a._top = C(f.top, m._top); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    // the starry party pulls any sky towards the night sky
    var nt = this.night, top = a._top, bot = a._bot, NT = MOODS[3]._top, NB = MOODS[3]._bot;
    if (nt > 0) { top = top.map(function (c, j) { return c + (NT[j] - c) * nt; }); bot = bot.map(function (c, j) { return c + (NB[j] - c) * nt; }); }
    a.skyTop = toHex(top); a.skyBottom = toHex(bot); a.skyMid = toHex([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2]);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust, -60, 60);
    a.sun = a._sun * (1 - nt); a.sunX = a._sunX; a.sunY = a._sunY;
    a.moon = Math.max(a._moon, nt); a.moonX = a._moonX; a.moonY = a._moonY;
    a.darkness = clamp(Math.max(a._dark, 0.45 * nt), 0, 0.45);
    a.mist = clamp(a._mist * (1 - 0.5 * nt), 0, 1);
    a.gust = this.gust; a.moodIndex = this.mood; a.mood = NAMES[this.mood];
    a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- particles
  P._emitters = function (m) { return m === 4 ? NIGHT_EMIT : MOODS[m].emitters; };
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 5; m++) {
      out[m] = [];
      var ramp = m < 4 ? this.ramp[m] * (m === 3 ? 1 : 1 - 0.7 * this.night) : this.night * (1 - this.ramp[3]);
      var em = this._emitters(m);
      for (e = 0; e < em.length; e++) { var t = em[e].count * k * ramp; out[m][e] = t; sum += t; }
    }
    var cap = AMBIENT_CAP, f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 5; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [], i, m, e;
    for (m = 0; m < 5; m++) { counts[m] = []; for (e = 0; e < tg[m].length; e++) counts[m][e] = 0; }
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.emitter >= 0 && !p.dying) counts[p.mood][p.emitter]++; }
    for (m = 0; m < 5; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      var spawnN = anywhere ? want - have : Math.min(1, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) {
          var q = this.particles[i];
          if (q.mood === m && q.emitter === e && !q.dying) { q.dying = true; extra--; }
        }
      }
    }
  };

  P._live = function (m) { return m === 4 ? this.night > 0 : m === this.mood; };

  P._spawn = function (m, e, anywhere) {
    var em = this._emitters(m)[e], r = this.rng, W = this.width, H = this.height;
    var p = { sprite: em.sprite, x: r.float(0.02, 0.98) * W, y: anywhere ? r.float(0.02, 0.98) * H : -20, size: r.float(em.size[0], em.size[1]),
      rot: r.float(0, TAU), alpha: 0, layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]),
      fade: anywhere ? 1 : 0, dying: false, age: 0, vx: 0, vy: 0, color: null, ph: r.float(0, TAU), t: r.float(0, 10), glow: em.glow || 0 };
    switch (em.kind) {
      case 'drift':
        p.vy = r.float(em.fall[0], em.fall[1]); p.sway = em.sway * r.float(0.6, 1.2); p.sw = r.float(0.8, 1.6); p.spin = em.spin * r.float(-1, 1);
        p.flipW = r.float(2, 5); p.warm = !!em.warm;
        if (em.sprite === 'petal') p.color = r.pick(PETAL);
        break;
      case 'float':        // pollen: slow, mostly sideways with the wind, gentle rise and fall, soft glow
        p.vy = r.float(-6, 8); p.sw = r.float(0.5, 1.1); p.spin = r.float(-0.4, 0.4);
        if (!anywhere) { p.x = r.chance(0.5) ? -20 : W + 20; p.y = r.float(0.2, 0.85) * H; }
        else p.y = r.float(0.2, 0.85) * H;
        break;
      case 'glint':
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.fade = 1;
        p.y = r.float(0.05, 0.55) * H; p.rotV = r.float(-1, 1); p.s0 = p.size; p.color = r.pick(GLINT);
        break;
      case 'twinkle':      // stars: fixed in the upper sky, twinkle
        p.y = r.float(0.03, 0.42) * H; p.tw = r.float(1.2, 3.2); p.rot = 0; p.s0 = p.size;
        if (!anywhere) p.y = r.float(0.03, 0.42) * H;
        break;
      case 'firefly':      // wander on a smooth random path in the lower 3/4, blink slowly
        p.y = r.float(0.3, 0.92) * H; p.tx = r.float(0.05, 0.95) * W; p.ty = r.float(0.3, 0.92) * H;
        p.retarget = r.float(1.5, 3.5); p.color = r.pick(FIREFLY); p.blinkW = r.float(1.2, 2.4); p.rot = 0; p.glow = 1;
        if (!anywhere) p.x = r.float(0.05, 0.95) * W;
        break;
    }
    this.particles.push(p);
    return p;
  };

  /** One-shot effect particles in SCREEN px (count toward the hard cap). color = CSS colour (tint). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    if (kind === 'rustle') kind = 'leaves';
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, glow: 0 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        if (!o.color) p.color = r.pick(['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD']);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
      } else if (kind === 'puff') {
        p.sprite = 'puff'; p.size = r.float(18, 30); p.layer = 'back';
        var a2 = r.float(Math.PI, TAU); p.vx = Math.cos(a2) * r.float(30, 90); p.vy = Math.sin(a2) * r.float(10, 50); p.life = r.float(0.45, 0.8); p.rotV = r.float(-2, 2);
      } else if (kind === 'leaves' || kind === 'petals') {   // bits puff out and flutter down
        p.sprite = kind === 'petals' ? 'petal' : r.chance(0.5) ? 'leaf_a' : 'leaf_b'; p.size = r.float(10, 18);
        if (kind === 'petals' && !o.color) p.color = r.pick(PETAL);
        var a4 = r.float(-Math.PI * 0.9, -Math.PI * 0.1), s4 = r.float(90, 240);
        p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4; p.rotV = r.float(-6, 6); p.life = r.float(0.8, 1.3); p.g = 380; p.kind = 'bit';
      } else if (kind === 'pollen') {
        p.sprite = 'pollen'; p.size = r.float(8, 14); p.glow = 0.6; p.color = o.color || null;
        var a5 = r.float(0, TAU), s5 = r.float(30, 110); p.vx = Math.cos(a5) * s5; p.vy = Math.sin(a5) * s5 - 40;
        p.rotV = 0; p.life = r.float(0.7, 1.2); p.g = -30; p.kind = 'bit';
      } else {   // 'sparkle' | 'stars'
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a3 = r.float(0, TAU), s3 = r.float(80, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3 - (kind === 'stars' ? 120 : 0);
        p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 420 : 0;
        if (!o.color && kind === 'stars') p.color = '#FFD54A';
        p.kind = 'spark';
      }
      p.s0 = p.size;
      this.particles.push(p);
    }
  };

  P.update = function (dt) {
    if (!(dt > 0)) return;
    this._acc += Math.min(dt, 1);
    while (this._acc >= this.stepH - 1e-12) { this._acc -= this.stepH; this._step(this.stepH); }
  };

  P._step = function (h) {
    this.time += h;
    var k, W = this.width, ft = this.fadeTime;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.night !== this._nightT) this.night = this._nightT > this.night ? Math.min(this._nightT, this.night + h / FADE_TIME) : Math.max(this._nightT, this.night - h / FADE_TIME);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
    }
    this._ambient();
    var a = this.ambient;
    for (k = 0; k < this.clouds.length; k++) {
      var c = this.clouds[k], half = 160 * c.scale;
      c.x += (c._v + a.wind * 0.25) * h;
      if (c.x - half > W) c.x = -half; else if (c.x + half < 0) c.x = W + half;
      c._on = clamp(c._on + (c.idx < MOODS[this.mood].clouds[c.layer] ? h : -h) / ft, 0, 1);
      c.alpha = c._a * c._on * (1 - 0.6 * a.darkness);
    }
    for (k = 0; k < this.mist.length; k++) {   // mist bands breathe slowly
      var M = this.mist[k], hm = 160 * M.scale;
      M.x += (M._v + a.wind * 0.1) * h;
      if (M.x - hm > W) M.x = -hm; else if (M.x + hm < 0) M.x = W + hm;
      M._on = clamp(M._on + (M.idx < MOODS[this.mood].mistBands ? h : -h) / ft, 0, 1);
      M.alpha = M._a * M._on * a.mist * (0.8 + 0.2 * Math.sin(this.time * 0.4 + M._ph));
    }
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, a = this.ambient, u, live = p.emitter >= 0 && this._live(p.mood) && !p.dying;
    p.age += h; p.t += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'drift': {   // falling leaves / petals: terminal fall speed, sway, gusts push sideways, flip as they spin
        p.x += ((p.warm ? a.wind * 1.4 + 10 : a.wind) + p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.y += p.vy * (1 + 0.25 * Math.sin(p.ph * 1.7 + p.age * p.sw * 1.3)) * h;
        p.rot += (p.spin + a.gust * 1.5) * h;
        p.flipX = Math.cos(p.age * p.flipW + p.ph);
        p.alpha = p.a0 * p.fade;
        if (p.y > H + 24) { if (live) { p.y = -20; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      }
      case 'float':
        p.x += (a.wind * 1.2 + 5) * h; p.y += (p.vy * Math.sin(p.ph + p.age * p.sw)) * h;
        p.rot += p.spin * h; p.alpha = p.a0 * p.fade * (0.75 + 0.25 * Math.sin(p.t * 2 + p.ph));
        if (p.x > W + 30) { if (live) { p.x = -30; p.y = this.rng.float(0.2, 0.85) * H; } else { this._kill(p); return; } }
        if (p.x < -40) p.x = W + 30;
        break;
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (live) this._spawn(p.mood, p.emitter, false); return; }
        p.rot += p.rotV * h;
        p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'twinkle':
        p.alpha = p.a0 * p.fade * (0.55 + 0.45 * Math.sin(p.t * p.tw + p.ph));
        p.size = p.s0 * (0.85 + 0.15 * Math.sin(p.t * p.tw * 1.3 + p.ph));
        break;
      case 'firefly': {   // steer towards a wandering target; slow blink with a glow halo
        p.retarget -= h;
        if (p.retarget <= 0) { p.retarget = this.rng.float(1.5, 3.5); p.tx = this.rng.float(0.05, 0.95) * W; p.ty = this.rng.float(0.3, 0.92) * H; }
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx += (dx / d * 34 - p.vx) * Math.min(1, 0.9 * h); p.vy += (dy / d * 24 - p.vy) * Math.min(1, 0.9 * h);
        p.x += (p.vx + a.wind * 0.2) * h; p.y += (p.vy + 6 * Math.sin(p.t * 3 + p.ph)) * h;
        var bl = 0.5 + 0.5 * Math.sin(p.t * p.blinkW + p.ph);
        p.alpha = p.a0 * p.fade * (0.25 + 0.75 * bl * bl); p.glow = 0.4 + 0.6 * bl;
        break;
      }
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 900 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h + a.wind * 0.5 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
        break;
      case 'bit':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.25, h); p.vy = p.vy * Math.pow(0.25, h) + (p.g || 0) * h;
        p.x += (p.vx + a.wind * 0.3) * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      case 'spark':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.08, h); p.vy = p.vy * Math.pow(0.08, h) + (p.g || 0) * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.6 + 0.6 * Math.sin(Math.PI * u)); p.alpha = Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.1));
        break;
    }
  };

  JT.Weather = Weather;
})(window.JT = window.JT || {});
