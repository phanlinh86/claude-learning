/* Gigi's Peekaboo Windows — GW.Weather (headless, deterministic city weather; DESIGN §6.5, docs/MECHANICS.md §7)
 *
 *   const wx = new GW.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 sunny, 1 breezy, 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.update(dt, { groundY });      // fixed 1/60 s sub-steps (accumulator) → same result for any dt split
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle', n, color })   // one-shot effects (same cap)
 *   wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', kind, color? }
 *   wx.clouds[]    { sprite:'cloud1..3'|'rain_cloud', x, y, scale, alpha }   // drawn width 300·scale, centre x,y
 *   wx.kites[]     { x, y, rot, tail (0..1 wiggle phase), ax, ay (string anchor, off-screen below), size, alpha, side }
 *   wx.stars[]     unused (ambient.stars = 0), kept for a shared renderer
 *   wx.ambient     { skyTop, skyBottom, horizon, tint, wind, gust, windBase, sway, sun, sunX, sunY, darkness, rain, rainbow,
 *                    wet, cloudSpeed, mood (= the target mood 0..3), season (= mood, old name), moon 0, stars 0 }
 *       wind      px/s, gusty, −40..40 (positive = blowing right). main copies it into world.wind every frame.
 *       sway      0..1 for awnings / trees / flags;   sunX/sunY 0..1 of the screen.
 *       rain      0..1 rain intensity (drops on the window glass, puddle rings, rain sound volume)
 *       rainbow   0..1 rainbow arc opacity;   wet 0..1 wet-pavement shine;   darkness 0..0.28 (grey overlay)
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX, 1) → sprite of width `size` centred, globalAlpha = alpha.
 * 'drop' is a vertical streak sprite: rot = −atan2(vx, vy) already slants it along its velocity.
 * Layers: 'sky' (behind the far skyline), 'back' (in front of the scenery, behind the building / Gigi), 'front' (over
 * everything; few, faint).
 *
 * Moods:
 *  0 sunny   : clear blue sky, the sun, 3 soft sky sparkles, slow clouds
 *  1 breezy  : wind 22 + gusts (to ≈ 38), fast clouds, leaf_a / leaf_b / paper blown across, 1–2 kites on strings
 *  2 rain    : grey-blue sky, darkness 0.18, 90 slanted rain streaks + splashes on the pavement, wet 1, rain clouds
 *  3 rainbow : the rain fades out over the first 6 s, the rainbow fades in (2 → 8 s), the sky clears, sparkles, wet → 0.4
 *  gusts     : every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) push wind and sway, scaled by the mood's gustiness.
 */
(function (GW) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 140, AMBIENT_CAP = 110, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var RAIN_DROPS = 90, SPLASH_MAX = 22, RAIN_OUT = 6, RAINBOW_IN = [2, 8];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  // ---- sky per mood (light and less saturated than every answer colour)
  var SKY = [
    { top: '#8CCBF2', bottom: '#E2F3FB', horizon: '#F4F1E4', tint: null },                         // 0 sunny: clear blue
    { top: '#9FD0EE', bottom: '#E8F4F6', horizon: '#F1F3E6', tint: null },                         // 1 breezy: a bit paler, hazy
    { top: '#8E9FB3', bottom: '#C9D3DD', horizon: '#D5DCE2', tint: 'rgba(70,90,120,0.10)' },       // 2 rain: grey-blue
    { top: '#A7D3EE', bottom: '#F0F1F4', horizon: '#FBF3E6', tint: 'rgba(255,236,214,0.05)' }      // 3 rainbow: washed, warm light
  ];
  var NUM_KEYS = ['windBase', 'gusty', 'sway', 'sun', 'sunX', 'sunY', 'darkness', 'cloudSpeed'];

  var MOODS = [
    { name: 'sunny',
      amb: { windBase: 6, gusty: 8, sway: 0.18, sun: 1, sunX: 0.78, sunY: 0.14, darkness: 0, cloudSpeed: 1 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.9, scale: [0.55, 0.85], sprites: ['cloud1', 'cloud2', 'cloud3'] },
      emitters: [
        { kind: 'sparkle', layer: 'sky', count: 3, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' }
      ] },
    { name: 'breezy',
      amb: { windBase: 22, gusty: 16, sway: 0.45, sun: 0.9, sunX: 0.7, sunY: 0.12, darkness: 0, cloudSpeed: 2.5 },
      clouds: { n: 4, speed: [14, 24], alpha: 0.92, scale: [0.5, 0.85], sprites: ['cloud1', 'cloud2', 'cloud3'] },
      kites: true,
      emitters: [
        { kind: 'leaf', layer: 'back', count: 7, size: [16, 24], alpha: [0.85, 1], sprite: 'leaf_a' },
        { kind: 'leaf', layer: 'back', count: 7, size: [16, 24], alpha: [0.85, 1], sprite: 'leaf_b' },
        { kind: 'paper', layer: 'back', count: 6, size: [12, 18], alpha: [0.8, 1], sprite: 'paper' },
        { kind: 'leaf', layer: 'front', count: 2, size: [26, 32], alpha: [0.55, 0.7], sprite: 'leaf_a', depth: 1.4 }
      ] },
    { name: 'rain',
      amb: { windBase: 10, gusty: 10, sway: 0.25, sun: 0, sunX: 0.8, sunY: 0.16, darkness: 0.18, cloudSpeed: 0.8 },
      clouds: { n: 5, speed: [4, 8], alpha: 0.95, scale: [0.7, 1.1], sprites: ['rain_cloud', 'rain_cloud', 'cloud3'] },
      rain: true,
      emitters: [] },
    { name: 'rainbow',
      amb: { windBase: 5, gusty: 6, sway: 0.15, sun: 0.8, sunX: 0.85, sunY: 0.18, darkness: 0, cloudSpeed: 1 },
      clouds: { n: 2, speed: [4, 8], alpha: 0.85, scale: [0.5, 0.8], sprites: ['cloud1', 'cloud2'] },
      emitters: [
        { kind: 'sparkle', layer: 'back', count: 10, size: [10, 18], alpha: [0.55, 0.85], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'sky', count: 3, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' }
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
    this.rng = new GW.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = []; this.kites = [];
    this.mood = 0; this.weather = 0; this.moodTime = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 90;
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null;
    this.rain = 0; this.rainbow = 0; this.wet = 0; this._rain0 = 0;
    this.ambient = {};
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS;
  Weather.SKY = SKY;
  Weather.CAP = HARD_CAP;
  Weather.AMBIENT_CAP = AMBIENT_CAP;
  Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['drop', 'splash', 'leaf_a', 'leaf_b', 'paper', 'sparkle', 'star', 'puff', 'confetti_a', 'confetti_b'];
  Weather.NAMES = ['sunny', 'breezy', 'rain', 'rainbow'];
  Weather.SEASONS = Weather.NAMES;   // old name
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3', 'rain_cloud'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.ly !== undefined) p.ly *= sy; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    this.groundY *= sy;
    this.width = W; this.height = H;
    this._placeKites();
  };

  P.setWeather = function (i, opts) {
    i = ((i | 0) % 4 + 4) % 4;
    var instant = opts && opts.instant;
    if (!instant && i === this.mood && this._from) return;
    this._from = this._snapshot();
    this.mood = this.weather = i; this.moodTime = 0; this._rain0 = this.rain;
    if (instant) {
      this._fadeU = 1;
      for (var k = 0; k < 4; k++) this.ramp[k] = k === i ? 1 : 0;
      this.rain = i === 2 ? 1 : 0; this.rainbow = i === 3 ? 1 : 0; this.wet = i === 2 ? 1 : i === 3 ? 0.4 : 0; this._rain0 = this.rain;
      this.particles.length = 0; this.clouds.length = 0; this.kites.length = 0;
      this._fillClouds(true);
      this._populate(true);
    } else {
      this._fadeU = 0;
      for (var c = 0; c < this.clouds.length; c++) this.clouds[c]._out = true;
      this._fillClouds(false);
    }
    this._stepKites(0);
    this._ambient();
  };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a.skyTop) return null;
    var s = { top: hex(a.skyTop), bot: hex(a.skyBottom), hor: hex(a.horizon), tint: a._tint ? a._tint.slice() : null };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
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
    // wind (px/s): base + a slow breathing wander + gusts; always within ±40
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust, -40, 40);
    a.sway = clamp(a._sway + 0.3 * this.gust, 0, 1);
    a.rain = this.rain; a.rainbow = this.rainbow; a.wet = this.wet;
    a.darkness = clamp(Math.max(a._darkness, 0.18 * this.rain), 0, 0.28);
    a.sun = a._sun * (1 - 0.8 * this.rain);
    a.gust = this.gust;
    a.mood = a.season = this.mood;
    a.moon = 0; a.stars = 0;
    delete a.gusty;
  };

  /** rain / rainbow / wet levels (DESIGN §6.5). */
  P._stepLevels = function (h) {
    var m = this.mood, t = this.moodTime;
    if (m === 2) this.rain = Math.min(1, this.rain + h / this.fadeTime);
    else if (m === 3) this.rain = Math.min(this.rain, this._rain0 * (1 - clamp(t / RAIN_OUT, 0, 1)));
    else this.rain = Math.max(0, this.rain - h / this.fadeTime);
    if (m === 3) this.rainbow = Math.max(this.rainbow, smooth((t - RAINBOW_IN[0]) / (RAINBOW_IN[1] - RAINBOW_IN[0])));
    else this.rainbow = Math.max(0, this.rainbow - h / this.fadeTime);
    var wt = m === 2 ? 1 : m === 3 ? 0.4 : 0, tau = wt > this.wet ? 2 : 8;
    this.wet += (wt - this.wet) * Math.min(1, h / tau);
  };

  // ---------------------------------------------------------------- clouds
  P._fillClouds = function (spread) {
    var c = MOODS[this.mood].clouds, W = this.width, H = this.height, r = this.rng;
    var n = Math.max(1, Math.round(c.n * clamp(W / 1280, 0.7, 1.3)));
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

  // ---------------------------------------------------------------- kites (breezy)
  P._placeKites = function () {
    var W = this.width, gY = this.groundY;
    for (var i = 0; i < this.kites.length; i++) { var k = this.kites[i]; k._bx = k._fx * W; k._by = k._fy * gY; }
  };
  P._stepKites = function (h) {
    var want = this.ramp[1] > 0.001 ? (this.width > 1100 ? 2 : 1) : 0, W = this.width, H = this.height, a = this.ambient;
    if (want === 0) { this.kites.length = 0; return; }
    while (this.kites.length < want) {
      var i = this.kites.length, r = this.rng.fork('kite' + i);
      this.kites.push({ x: 0, y: 0, rot: 0, tail: 0, ax: 0, ay: 0, size: r.float(56, 72), alpha: 0, side: i % 2 ? 1 : -1,
        _fx: want === 1 ? 0.62 : 0.3 + 0.42 * i, _fy: r.float(0.12, 0.22), _ph: r.float(0, TAU), _bx: 0, _by: 0 });
      this._placeKites();
    }
    if (this.kites.length > want) this.kites.length = want;
    var t = this.time, wind = a.wind || 0, gust = this.gust;
    for (var j = 0; j < this.kites.length; j++) {
      var k = this.kites[j];
      k.x = k._bx + 26 * Math.sin(0.45 * t + k._ph) + 0.8 * (wind - 22);
      k.y = Math.max(20, k._by + 14 * Math.sin(0.8 * t + 1.3 * k._ph) - 22 * gust);
      k.rot = 0.22 * Math.sin(0.6 * t + k._ph) + 0.012 * (wind - 22);
      k.tail = (t * 1.6 + k._ph) % 1;
      k.ax = k.x - k.side * 0.3 * W; k.ay = H + 30;
      k.alpha = this.ramp[1];
    }
  };

  // ---------------------------------------------------------------- particles
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 4; m++) {
      out[m] = [];
      for (e = 0; e < MOODS[m].emitters.length; e++) { var t = MOODS[m].emitters[e].count * k * this.ramp[m]; out[m][e] = t; sum += t; }
    }
    var drops = RAIN_DROPS * k * this.rain;
    sum += drops;
    var cap = AMBIENT_CAP, f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 4; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    out.drops = Math.floor(drops * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [[], [], [], []], i, m, e, dropN = 0;
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) counts[m][e] = 0;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.dying) continue;
      if (p.kind === 'drop') dropN++;
      else if (p.emitter >= 0) counts[p.mood][p.emitter]++;
    }
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      var spawnN = anywhere ? want - have : Math.min(1, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) this._retire(function (q) { return q.mood === m && q.emitter === e; }, have - want);
    }
    var dw = tg.drops, dn = anywhere ? dw - dropN : Math.min(4, dw - dropN);
    for (i = 0; i < dn && this.particles.length < HARD_CAP; i++) this._spawnDrop(anywhere);
    if (dropN > dw) this._retire(function (q) { return q.kind === 'drop'; }, dropN - dw);
  };
  P._retire = function (sel, extra) {
    for (var i = 0; i < this.particles.length && extra > 0; i++) {
      var q = this.particles[i];
      if (!q.dying && sel(q)) { q.dying = true; extra--; }
    }
  };

  P._spawnDrop = function (anywhere) {
    var r = this.rng, W = this.width, gY = this.groundY, front = r.chance(0.12), depth = front ? 1.3 : r.float(0.8, 1.05);
    var p = { sprite: 'drop', kind: 'drop', x: r.float(-0.1, 1.05) * W, y: 0, size: r.float(14, 22) * depth, rot: 0, flipX: 1, alpha: 0,
      layer: front ? 'front' : 'back', mood: -2, emitter: -2, a0: r.float(0.45, 0.75) * (front ? 0.7 : 1), fade: 1, dying: false, age: 0,
      vx: 0, vy: r.float(750, 950) * depth, depth: depth, ly: gY + r.float(4, 80) };
    p.y = anywhere ? r.float(-0.05, 1) * p.ly : -r.float(10, 80);
    this.particles.push(p);
    return p;
  };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, gY = this.groundY;
    var p = { sprite: em.sprite, x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    switch (em.kind) {
      case 'leaf':
      case 'paper':
        // fallers: start anywhere (instant) or just above the top edge / at the left edge in a strong wind
        p.ph = r.float(0, TAU); p.w = r.float(0.6, 1.4); p.spin = r.float(-1.5, 1.5);
        p.fall = (em.kind === 'leaf' ? r.float(30, 52) : r.float(18, 34)) * p.depth;
        p.x = r.float(-0.05, 1.05) * W;
        p.y = anywhere ? r.float(-0.05, 1) * (gY + 40) : -r.float(10, 60);
        if (!anywhere && r.chance(0.5)) { p.x = -30; p.y = r.float(0.05, 0.7) * gY; }
        p.fade = 1;
        break;
      case 'sparkle':
        p.x = r.float(0.04, 0.96) * W;
        p.y = (em.layer === 'sky' ? r.float(0.05, 0.4) : r.float(0.25, 0.8)) * gY;
        p.life = r.float(1, 2);
        p.age = anywhere ? r.float(0, p.life) : 0;
        p.vx = r.float(-6, 6); p.vy = r.float(-8, 2);
        p.fade = 1; p.rotV = r.float(-1, 1); p.s0 = p.size;
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

  /** One-shot effect particles (count toward the hard cap). color = palette key (renderer tints confetti). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), flipX: 1, alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, depth: 1, color: o.color || null };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
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
    if (env && env.groundY !== undefined && env.groundY !== this.groundY) { this.groundY = env.groundY; this._placeKites(); }
    if (!(dt > 0)) return;
    this._acc += Math.min(dt, 1);
    while (this._acc >= this.stepH - 1e-12) { this._acc -= this.stepH; this._step(this.stepH); }
  };

  P._step = function (h) {
    this.time += h; this.moodTime += h;
    var k;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
    }
    this._stepLevels(h);
    this._ambient();
    this._stepClouds(h);
    this._stepKites(h);
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, gY = this.groundY, a = this.ambient, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this.particles.splice(this.particles.indexOf(p), 1); return; }
    switch (p.kind) {
      case 'drop': {
        // fast straight streaks slanted by the wind; a splash where they hit the pavement / road
        p.vx = (a.wind * 4 + 20) * p.depth;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = -Math.atan2(p.vx, p.vy);
        p.alpha = p.a0 * p.fade;
        if (p.y >= p.ly) {
          var nSplash = 0;
          for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'splash') nSplash++;
          if (nSplash < SPLASH_MAX && this.particles.length < HARD_CAP && !p.dying)
            this.particles.push({ sprite: 'splash', kind: 'splash', x: p.x, y: p.ly, size: 8, s0: 8, rot: 0, flipX: this.rng.sign(), alpha: 0.8,
              layer: p.layer, mood: -2, emitter: -3, a0: 0.8, fade: 1, dying: false, age: 0, life: this.rng.float(0.22, 0.34), vx: 0, vy: 0, depth: 1 });
          if (p.dying || this.rain <= 0.001) { this.particles.splice(this.particles.indexOf(p), 1); return; }
          p.y = -this.rng.float(10, 60); p.x = this.rng.float(-0.1, 1.05) * W; p.ly = gY + this.rng.float(4, 80);
        }
        break;
      }
      case 'splash':
        u = p.age / p.life;
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.size = p.s0 + 16 * u; p.alpha = p.a0 * (1 - u);
        break;
      case 'leaf':
      case 'paper': {
        // terminal-speed fall + sideways flutter + wind drift; gusts lift them and blow them across
        var lf = p.kind === 'leaf', sw = lf ? 34 : 40, windK = lf ? 1.6 : 1.9;
        p.vx = (a.wind * windK) * p.depth + sw * Math.cos(p.ph + p.age * p.w * 2.2);
        p.vy = p.fall - (lf ? 70 : 55) * this.gust + (lf ? 18 : 24) * Math.sin(p.ph + p.age * 3.1);
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * (lf ? 2.5 : 1.8) * h;
        p.flipX = Math.cos(p.ph + p.age * (lf ? 3.4 : 2.6));   // tumbling (fractional = 3D turn)
        p.alpha = p.a0 * p.fade;
        if (p.y > gY + 60 || p.x > W + 60 || p.x < -60 || p.y < -120) {
          if (p.dying || this.mood !== p.mood) { this._respawn(p); return; }
          p.y = -this.rng.float(10, 50); p.x = this.rng.float(-0.05, 1.05) * W; p.age = 0;
          if (a.wind > 15 && this.rng.chance(0.6)) { p.x = -30; p.y = this.rng.float(0.05, 0.7) * gY; }
        }
        break;
      }
      case 'sparkle': {
        u = p.age / p.life;
        if (u >= 1) {
          if (p.burst) { this.particles.splice(this.particles.indexOf(p), 1); return; }
          this._respawn(p); return;
        }
        if (p.burst) { p.vx *= Math.pow(0.05, h); p.vy *= Math.pow(0.05, h); }
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.6 + 0.6 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this.particles.splice(this.particles.indexOf(p), 1); return; }
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
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
        break;
    }
  };

  GW.Weather = Weather;
})(window.GW = window.GW || {});
