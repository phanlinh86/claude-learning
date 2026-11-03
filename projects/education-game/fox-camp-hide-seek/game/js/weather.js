/* Pip's Camp Hide & Seek — FC.Weather (headless, deterministic seasons; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new FC.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setNight(on, { instant })     // the winter-night campfire party: darkness 0 → 0.25 (and back), 2.5 s
 *   wx.update(dt);                   // fixed 1/60 s steps (a 2nd argument is accepted and ignored)
 *   wx.burst(x, y, { kind, n, color })   // one-shot effects (same cap), SCREEN px:
 *       'confetti' | 'puff' | 'sparkle' | 'stars' | 'rustle' (season leaves / petals / snow puffing out of a hiding place) |
 *       'embers' (campfire sparks rising)
 *   wx.particles[] { sprite, x, y, size, rot, alpha, layer:'back'|'front', kind, color?, flipX?, t? }   SCREEN px (centre)
 *       sprite ∈ Weather.SPRITES (game/assets/default/particles/<sprite>.svg, 32×32), drawn size px, rotated rot;
 *       kind 'butterfly': draw FC.CampArt.drawButterfly(ctx, size, p.t, p.color) instead of a sprite (flipX = heading);
 *       color: CSS colour to tint (confetti, glints) or null.
 *   wx.clouds[]    { sprite:'cloud_a'|'cloud_b'|'cloud_c', x, y, scale, alpha, layer 0|1 }   SCREEN px (centre, 320·scale wide)
 *   wx.ambient     { skyTop, skyBottom, tint (rgba | null), sun 0..1, sunX, sunY (0..1 of the screen), darkness 0..0.3,
 *                    wind (px/s, + = to the right), gust 0..1, season 0..3, mountains:'spring'|'summer'|'autumn'|'winter',
 *                    mountainsFrom, mountainsMix 0..1 (crossfade from mountainsFrom to mountains), mood }
 */
(function (FC) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 70, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- sky per season (DESIGN §3)
  var SKY = [
    { top: '#CDEBFB', bottom: '#F6F0D8', tint: [255, 240, 230, 0.06] },   // spring
    { top: '#8FD0F5', bottom: '#E3F4FF', tint: [255, 250, 220, 0.0] },    // summer
    { top: '#F3D9B5', bottom: '#CFE3F0', tint: [255, 214, 170, 0.10] },   // autumn
    { top: '#C9D9EA', bottom: '#F2F6FA', tint: [220, 232, 255, 0.10] }    // winter
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'windBase', 'gusty'];
  var BUTTERFLY = ['#FFB3C7', '#FFE08A', '#B8E3FF', '#D6C2FF'];
  var GLINT = ['#FFF6C8', '#FFE7A0', '#FFFFFF'];

  var MOODS = [
    { name: 'spring', amb: { sun: 0.9, sunX: 0.2, sunY: 0.16, windBase: 8, gusty: 10 }, clouds: [3, 2],
      emitters: [
        { kind: 'drift', sprite: 'petal', layer: 'front', count: 16, size: [10, 16], alpha: [0.7, 0.95], fall: [18, 34], sway: 26, spin: 1.6 },
        { kind: 'butterfly', sprite: 'butterfly', layer: 'front', count: 3, size: [20, 28], alpha: [0.95, 1] }
      ] },
    { name: 'summer', amb: { sun: 1, sunX: 0.78, sunY: 0.12, windBase: 6, gusty: 8 }, clouds: [3, 2],
      emitters: [
        { kind: 'float', sprite: 'seed', layer: 'front', count: 12, size: [14, 22], alpha: [0.6, 0.9] },
        { kind: 'glint', sprite: 'sparkle', layer: 'back', count: 8, size: [10, 18], alpha: [0.5, 0.85], glint: true }
      ] },
    { name: 'autumn', amb: { sun: 0.75, sunX: 0.72, sunY: 0.22, windBase: 14, gusty: 30 }, clouds: [3, 3],
      emitters: [
        { kind: 'drift', sprite: 'leaf_a', layer: 'front', count: 12, size: [14, 22], alpha: [0.85, 1], fall: [40, 70], sway: 40, spin: 3 },
        { kind: 'drift', sprite: 'leaf_b', layer: 'front', count: 10, size: [14, 22], alpha: [0.85, 1], fall: [40, 70], sway: 40, spin: 3 }
      ] },
    { name: 'winter', amb: { sun: 0.35, sunX: 0.8, sunY: 0.18, windBase: 5, gusty: 9 }, clouds: [2, 3],
      emitters: [
        { kind: 'drift', sprite: 'snow', layer: 'back', count: 26, size: [6, 11], alpha: [0.6, 0.9], fall: [30, 50], sway: 14, spin: 0.6 },
        { kind: 'drift', sprite: 'snow', layer: 'front', count: 18, size: [10, 16], alpha: [0.8, 1], fall: [55, 85], sway: 20, spin: 0.8 }
      ] }
  ];
  MOODS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._tint = SKY[i].tint; });
  var RUSTLE = ['petal', 'seed', 'leaf_a', 'snow'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.rng = new FC.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.night = 0; this._nightT = 0;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.SKY = SKY; Weather.CAP = HARD_CAP; Weather.FADE_TIME = FADE_TIME; Weather.NAMES = NAMES;
  Weather.SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow', 'seed', 'sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud_a', 'cloud_b', 'cloud_c'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeClouds = function () {    // 2 layers in the upper sky; they drift with the wind and wrap
    var r = new FC.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height, k = clamp(W / 1280, 0.7, 1.3);
    this.clouds = [];
    for (var l = 0; l < 2; l++) {
      var n = Math.max(2, Math.round([4, 3][l] * k));
      for (var i = 0; i < n; i++) {
        this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: (i + r.float(0, 1)) / n * W * 1.2 - 0.1 * W,
          y: r.float(0.06, l ? 0.3 : 0.22) * H, scale: [0.5, 0.75][l] * r.float(0.8, 1.2), alpha: [0.7, 0.9][l], layer: l,
          _a: [0.7, 0.9][l], _v: r.float(4, 9) * (l + 1), _on: 1, idx: i });
      }
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i, a = [this.particles, this.clouds];
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
    // the winter-night party darkens the sky towards deep blue
    var nt = this.night, top = a._top, bot = a._bot;
    if (nt > 0) { var NT = [29, 37, 86], NB = [58, 47, 110]; top = top.map(function (c, j) { return c + (NT[j] - c) * nt; }); bot = bot.map(function (c, j) { return c + (NB[j] - c) * nt * 0.8; }); }
    a.skyTop = toHex(top); a.skyBottom = toHex(bot); a.skyMid = toHex([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2]);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust, -60, 60);
    a.sun = a._sun * (1 - nt);
    a.darkness = clamp(0.25 * nt, 0, 0.3);
    a.gust = this.gust; a.mood = this.mood; a.season = this.mood;
    a.mountains = NAMES[this.mood]; a.mountainsFrom = NAMES[this._fromMood]; a.mountainsMix = s;
    delete a.windBase; delete a.gusty;
  };

  // ---------------------------------------------------------------- particles
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 4; m++) {
      out[m] = [];
      for (e = 0; e < MOODS[m].emitters.length; e++) { var t = MOODS[m].emitters[e].count * k * this.ramp[m]; out[m][e] = t; sum += t; }
    }
    var cap = AMBIENT_CAP, f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 4; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [[], [], [], []], i, m, e;
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) counts[m][e] = 0;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.emitter >= 0 && !p.dying) counts[p.mood][p.emitter]++; }
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) {
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

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, H = this.height;
    var p = { sprite: em.sprite, x: r.float(0.02, 0.98) * W, y: anywhere ? r.float(0.02, 0.98) * H : -20, size: r.float(em.size[0], em.size[1]),
      rot: r.float(0, TAU), alpha: 0, layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]),
      fade: anywhere ? 1 : 0, dying: false, age: 0, vx: 0, vy: 0, color: null, ph: r.float(0, TAU), t: r.float(0, 10) };
    switch (em.kind) {
      case 'drift':
        p.vy = r.float(em.fall[0], em.fall[1]); p.sway = em.sway * r.float(0.6, 1.2); p.sw = r.float(0.8, 1.6); p.spin = em.spin * r.float(-1, 1);
        p.flipW = r.float(2, 5);
        break;
      case 'float':        // dandelion seeds: slow, mostly sideways with the wind, gentle rise and fall
        p.vy = r.float(-6, 8); p.sw = r.float(0.5, 1.1); p.spin = r.float(-0.4, 0.4);
        if (!anywhere) { p.x = r.chance(0.5) ? -20 : W + 20; p.y = r.float(0.15, 0.8) * H; }
        break;
      case 'glint':
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.fade = 1;
        p.y = r.float(0.05, 0.6) * H; p.rotV = r.float(-1, 1); p.s0 = p.size; p.color = r.pick(GLINT);
        break;
      case 'butterfly':
        p.color = r.pick(BUTTERFLY); p.y = r.float(0.45, 0.85) * H; p.tx = r.float(0.1, 0.9) * W; p.ty = r.float(0.45, 0.85) * H;
        p.retarget = r.float(2, 4); p.flipX = 1;
        if (!anywhere) p.x = r.chance(0.5) ? -20 : W + 20;
        break;
    }
    this.particles.push(p);
    return p;
  };

  /** One-shot effect particles in SCREEN px (count toward the hard cap). color = CSS colour (tint). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        if (!o.color) p.color = r.pick(['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0']);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
      } else if (kind === 'puff') {
        p.sprite = 'puff'; p.size = r.float(18, 30); p.layer = 'back';
        var a2 = r.float(Math.PI, TAU); p.vx = Math.cos(a2) * r.float(30, 90); p.vy = Math.sin(a2) * r.float(10, 50); p.life = r.float(0.45, 0.8); p.rotV = r.float(-2, 2);
      } else if (kind === 'rustle') {   // bits of the season puff out of a hiding place and flutter down
        p.sprite = RUSTLE[this.mood]; p.size = r.float(10, 18);
        var a4 = r.float(-Math.PI * 0.9, -Math.PI * 0.1), s4 = r.float(90, 240);
        p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4; p.rotV = r.float(-6, 6); p.life = r.float(0.8, 1.3); p.g = 380; p.kind = 'bit';
      } else if (kind === 'embers') {
        p.sprite = 'dust'; p.size = r.float(5, 9); p.color = r.pick(['#FFB347', '#FFD36B', '#FF8A3D']);
        p.vx = r.float(-30, 30); p.vy = r.float(-160, -80); p.rotV = 0; p.life = r.float(0.7, 1.3); p.g = -20; p.kind = 'bit';
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
    var k, W = this.width;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
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
      c._on = clamp(c._on + (c.idx < MOODS[this.mood].clouds[c.layer] ? h : -h) / this.fadeTime, 0, 1);
      c.alpha = c._a * c._on * (1 - 0.5 * this.night);
    }
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, a = this.ambient, u;
    p.age += h; p.t += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'drift': {   // falling petals / leaves / snow: terminal fall speed, sway, gusts push sideways, flip as they spin
        var gustK = p.sprite === 'snow' ? 0.5 : 1;
        p.x += (a.wind * gustK + p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.y += p.vy * (1 + 0.25 * Math.sin(p.ph * 1.7 + p.age * p.sw * 1.3)) * h;
        p.rot += (p.spin + a.gust * 1.5 * gustK) * h;
        p.flipX = Math.cos(p.age * p.flipW + p.ph);
        p.alpha = p.a0 * p.fade;
        if (p.y > H + 24) { if (p.mood === this.mood && !p.dying) { p.y = -20; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      }
      case 'float':
        p.x += (a.wind * 1.4 + 6) * h; p.y += (p.vy * Math.sin(p.ph + p.age * p.sw)) * h;
        p.rot += p.spin * h; p.alpha = p.a0 * p.fade;
        if (p.x > W + 30) { if (p.mood === this.mood && !p.dying) { p.x = -30; p.y = this.rng.float(0.15, 0.8) * H; } else { this._kill(p); return; } }
        if (p.x < -40) p.x = W + 30;
        break;
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (!p.dying && p.mood === this.mood) this._spawn(p.mood, p.emitter, false); return; }
        p.rot += p.rotV * h;
        p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'butterfly': {   // flutter towards a wandering target point, bobbing with each wing beat
        p.retarget -= h;
        if (p.retarget <= 0) { p.retarget = this.rng.float(2, 4); p.tx = this.rng.float(0.1, 0.9) * W; p.ty = this.rng.float(0.45, 0.85) * H; }
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx += (dx / d * 60 - p.vx) * Math.min(1, 1.5 * h); p.vy += (dy / d * 40 - p.vy) * Math.min(1, 1.5 * h);
        p.x += (p.vx + a.wind * 0.3) * h; p.y += (p.vy + 18 * Math.sin(p.t * 9)) * h;
        p.flipX = p.vx >= 0 ? 1 : -1; p.rot = 0; p.alpha = p.a0 * p.fade;
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

  FC.Weather = Weather;
})(window.FC = window.FC || {});
