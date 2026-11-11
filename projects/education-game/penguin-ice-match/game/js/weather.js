/* Tuk's Ice Match — IM.Weather (headless, deterministic polar weather stages; DESIGN §5.3)
 *
 *   const wx = new IM.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 sunny, 1 breezy, 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.update(dt, { groundY, lakeTop });   // fixed 1/60 s sub-steps → same result for any dt split. lakeTop = top of the
 *                                    // frozen lake (rain splash rings land between lakeTop and groundY; default 0.5·groundY)
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle'|'shard'|'splash', n, color })   // one-shot effects (same cap)
 *   wx.particles[] { sprite, x, y, size, rot, flipX, scaleY?, stretch?, alpha, layer:'sky'|'back'|'front', kind, color? }
 *   wx.clouds[]    { sprite:'cloud1..3', x, y, scale, alpha }   // drawn width 300·scale, centre x,y
 *   wx.ambient     { skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, darkness, stage (0..3), rainbow (0..1),
 *                    gust (0..1), windBase, season (= stage, old name), moon, stars (0) }
 *       wind      px/s, gusty, −40..40 (positive = blowing right). main copies it into world.wind every frame.
 *       rainbow   0..1 opacity of env/rainbow.svg (crossfades with the stage).
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX · (stretch || 1), scaleY || 1) → sprite of width `size`
 * centred, globalAlpha = alpha. Streaks (breezy) have stretch 1.5–4 along their heading (rot = heading); rain drops have
 * rot = heading − π/2 (sprite drawn vertical); splash rings have scaleY 0.4 (a flat ellipse on the ice).
 *
 * Stages (docs/MECHANICS.md §7):
 *  0 sunny  : a few sparkles glinting in the air
 *  1 breezy : blowing snow (snow1 / snow2) + snow streaks that brighten and speed up in gusts (gust > 0.6)
 *  2 rain   : falling drops (slanted by the wind) + tiny splash rings on the ice at the lake level
 *  3 rainbow: sparkles + gentle falling snow1, ambient.rainbow → 1
 *  gusts    : every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) push wind and sway, scaled by the stage's gustiness.
 */
(function (IM) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 90, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r0(r, a, b) { return r.float(a, b); }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }

  // ---- sky per season (light and less saturated than every answer colour)
  var SKY = [
    { top: '#8CCBF0', bottom: '#E8F6FC', horizon: '#F4FAFD', tint: null },                        // 0 sunny: bright, crisp blue
    { top: '#B9B8D8', bottom: '#ECEBF4', horizon: '#F3F1F7', tint: 'rgba(200,190,235,0.06)' },   // 1 breezy: lilac-grey
    { top: '#9DB2C6', bottom: '#DCE5ED', horizon: '#E8EEF3', tint: 'rgba(120,140,170,0.08)' },   // 2 rain: soft grey-blue
    { top: '#A3D8F4', bottom: '#F0F8FC', horizon: '#FBFDFE', tint: 'rgba(255,240,250,0.05)' }    // 3 rainbow: fresh, light
  ];
  var NUM_KEYS = ['windBase', 'gusty', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'darkness', 'rainbow'];

  var MOODS = [
    { name: 'sunny',
      amb: { windBase: 6, gusty: 6, sway: 0.15, sun: 1, sunX: 0.8, sunY: 0.14, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0, rainbow: 0 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.9, scale: [0.55, 0.85] },
      emitters: [
        { kind: 'sparkle', layer: 'back', count: 8, size: [10, 18], alpha: [0.55, 0.85], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'sky', count: 4, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' }
      ] },
    { name: 'breezy',
      amb: { windBase: 16, gusty: 22, sway: 0.4, sun: 0.8, sunX: 0.76, sunY: 0.18, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0, rainbow: 0 },
      clouds: { n: 4, speed: [10, 18], alpha: 0.9, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'snow', layer: 'back', count: 16, size: [8, 14], alpha: [0.8, 1], sprite: 'snow1' },
        { kind: 'snow', layer: 'back', count: 8, size: [10, 16], alpha: [0.8, 1], sprite: 'snow2' },
        { kind: 'streak', layer: 'back', count: 14, size: [10, 16], alpha: [0.6, 0.9], sprite: 'snow1' },
        { kind: 'streak', layer: 'front', count: 3, size: [16, 22], alpha: [0.45, 0.6], sprite: 'snow1', depth: 1.4 }
      ] },
    { name: 'rain',
      amb: { windBase: 8, gusty: 10, sway: 0.2, sun: 0.25, sunX: 0.8, sunY: 0.16, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0.06, rainbow: 0 },
      clouds: { n: 5, speed: [6, 12], alpha: 0.95, scale: [0.7, 1.05] },
      emitters: [
        { kind: 'drop', layer: 'back', count: 40, size: [10, 16], alpha: [0.55, 0.8], sprite: 'drop' },
        { kind: 'drop', layer: 'front', count: 6, size: [16, 22], alpha: [0.4, 0.55], sprite: 'drop', depth: 1.4 }
      ] },
    { name: 'rainbow',
      amb: { windBase: 5, gusty: 6, sway: 0.12, sun: 1, sunX: 0.82, sunY: 0.12, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0, rainbow: 1 },
      clouds: { n: 3, speed: [4, 8], alpha: 0.85, scale: [0.55, 0.9] },
      emitters: [
        { kind: 'sparkle', layer: 'back', count: 10, size: [10, 18], alpha: [0.55, 0.9], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'sky', count: 4, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' },
        { kind: 'snow', layer: 'back', count: 12, size: [8, 12], alpha: [0.7, 0.9], sprite: 'snow1', gentle: true }
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
    this.rng = new IM.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 96; this.lakeTop = null;
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null;
    this.ambient = {};
    this._makeStars();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS;
  Weather.SKY = SKY;
  Weather.CAP = HARD_CAP;
  Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['snow1', 'snow2', 'drop', 'splash', 'sparkle', 'star', 'shard', 'puff', 'confetti_a', 'confetti_b'];
  Weather.STAGES = ['sunny', 'breezy', 'rain', 'rainbow'];
  Weather.SEASONS = Weather.STAGES;   // old name
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P._makeStars = function () {     // own generator: the star field never changes the particle sequence
    var r = new IM.RNG((this.rng.seed ^ 0x5f3759df) >>> 0), W = this.width, gY = this.groundY;
    var n = Math.round(70 * clamp(W * this.height / REF_AREA, 0.7, 1.5));
    this.stars = [];
    for (var i = 0; i < n; i++) {
      this.stars.push({ x: r.float(0, W), y: r.float(0.03, 0.55) * gY, r: r.chance(0.12) ? r.float(2, 3) : r.float(0.8, 1.8),
        phase: r.float(0, TAU), tw: r.float(1, 3) });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; if (this.particles[i].landY !== undefined) this.particles[i].landY *= sy; }
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
    a.darkness = clamp(a._darkness, 0, 0.28);
    a.gust = this.gust;
    a.rainbow = clamp(a._rainbow, 0, 1);
    a.stage = this.mood; a.season = this.mood;
    delete a.gusty;
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
      var spawnN = anywhere ? want - have : Math.min(1, want - have);
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

  P._lakeTop = function () { return this.lakeTop !== null ? this.lakeTop : 0.5 * this.groundY; };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, gY = this.groundY;
    var p = { sprite: em.sprite, x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    switch (em.kind) {
      case 'snow':
        // fallers: start anywhere (instant) or just above the top edge; fall speed, sway phase/rate, spin
        p.ph = r.float(0, TAU); p.w = r.float(0.6, 1.4); p.spin = r.float(-1.5, 1.5);
        p.fall = (em.gentle ? r.float(22, 38) : r.float(30, 55)) * p.depth;
        p.gentle = !!em.gentle;
        p.x = r.float(-0.05, 1.05) * W;
        p.y = anywhere ? r.float(-0.05, 1) * (gY + 40) : -r.float(10, 60);
        p.fade = 1;
        break;
      case 'streak':
        // blowing snow streaks: fast, nearly horizontal, re-enter from the windward edge
        p.ph = r.float(0, TAU); p.sp = r.float(150, 240) * p.depth; p.fall = r.float(18, 40);
        p.x = anywhere ? r.float(-0.05, 1.05) * W : -r.float(20, 120);
        p.y = r.float(0.05, 0.95) * (gY + 30);
        p.fade = 1;
        break;
      case 'drop':
        p.fall = r.float(520, 700) * p.depth; p.x = r.float(-0.05, 1.05) * W;
        p.y = anywhere ? r.float(-0.05, 1) * gY : -r.float(10, 80);
        p.landY = r.float(this._lakeTop(), gY);
        p.fade = 1;
        break;
      case 'sparkle':
      case 'star':
        p.x = r.float(0.04, 0.96) * W;
        p.y = (em.kind === 'star' ? r.float(0.05, 0.5) : em.layer === 'sky' ? r.float(0.05, 0.35) : r.float(0.25, 0.8)) * gY;
        p.life = em.kind === 'star' ? r.float(2, 4) : r.float(1, 2);
        p.age = anywhere ? r.float(0, p.life) : 0;
        p.vx = r.float(-6, 6); p.vy = r.float(-8, 2);
        p.fade = 1; p.rotV = r.float(-1, 1); p.s0 = p.size;
        break;
    }
    this.particles.push(p);
    return p;
  };

  /** A splash ring on the ice (rain) — counts toward the hard cap; skipped when full. */
  P._ring = function (x, y, big) {
    if (this.particles.length >= HARD_CAP) return null;
    var r = this.rng, s0 = big ? r.float(16, 22) : r.float(6, 9);
    var p = { sprite: 'splash', x: x, y: y, size: s0, s0: s0, s1: s0 * (big ? 3 : 3.2), rot: 0, flipX: 1, scaleY: 0.4, alpha: 0,
      layer: 'back', kind: 'splash', mood: -1, emitter: -1, a0: big ? 0.9 : r.float(0.5, 0.75), fade: 1, dying: false, age: 0,
      vx: 0, vy: 0, depth: 1, life: big ? 0.6 : r.float(0.3, 0.42) };
    this.particles.push(p);
    return p;
  };

  P._respawn = function (p) {
    var i = this.particles.indexOf(p);
    if (i >= 0) this.particles.splice(i, 1);
    if (!p.dying && this.mood === p.mood) return this._spawn(p.mood, p.emitter, false);
    return null;
  };

  /** One-shot effect particles (count toward the hard cap). color = palette key (renderer tints confetti).
   *  shard: ice shards fly up and fall (frost crack) · splash: water spray + one big ring (a fish dives) */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', r = this.rng;
    var n = o.n || (kind === 'shard' ? 10 : kind === 'splash' ? 8 : 24);
    if (kind === 'splash') this._ring(x, y, true);
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
      } else if (kind === 'shard') {
        p.sprite = 'shard'; p.size = r.float(10, 18); p.g = 1400;
        var a4 = r.float(-Math.PI * 0.92, -Math.PI * 0.08), s4 = r.float(160, 420);
        p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4; p.rotV = r.float(-12, 12); p.life = r.float(0.55, 0.85);
      } else if (kind === 'splash') {
        p.sprite = 'drop'; p.kind = 'spray'; p.size = r.float(8, 13); p.g = 1200;
        var a5 = r.float(-Math.PI * 0.8, -Math.PI * 0.2), s5 = r.float(140, 320);
        p.vx = Math.cos(a5) * s5; p.vy = Math.sin(a5) * s5; p.rotV = 0; p.life = r.float(0.45, 0.65);
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
    if (env && env.lakeTop !== undefined) this.lakeTop = env.lakeTop;
    if (!(dt > 0)) return;
    this._acc += Math.min(dt, 1);
    while (this._acc >= this.stepH - 1e-12) { this._acc -= this.stepH; this._step(this.stepH); }
  };

  P._step = function (h) {
    this.time += h;
    var k;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
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
    switch (p.kind) {
      case 'snow': {
        // terminal-speed fall + sideways sway + wind drift (breezy: strong drift, gusts carry the flakes across)
        var windK = p.gentle ? 0.4 : 0.9;
        p.vx = a.wind * windK * p.depth + 14 * Math.cos(p.ph + p.age * p.w * 2.2);
        p.vy = p.fall - 10 * this.gust;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * 0.5 * h;
        p.alpha = p.a0 * p.fade;
        if (p.y > gY + 60 || p.x > W + 60 || p.x < -60) {
          if (p.dying || this.mood !== p.mood) { this._respawn(p); return; }
          p.y = -r0(this.rng, 10, 50); p.x = this.rng.float(-0.05, 1.05) * W; p.age = 0;
          if (a.wind > 20 && this.rng.chance(0.5)) { p.x = -30; p.y = this.rng.float(0.05, 0.6) * gY; }
        }
        break;
      }
      case 'streak': {
        var g = this.gust, gs = g * g * (3 - 2 * g);
        p.vx = (p.sp + a.wind * 3) * (0.7 + 0.9 * gs);
        p.vy = p.fall + 12 * Math.sin(p.ph + p.age * 2.3);
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = Math.atan2(p.vy, p.vx);
        p.stretch = clamp(Math.abs(p.vx) / 100, 1.5, 4);
        p.alpha = p.a0 * p.fade * (0.3 + 0.7 * (g > 0.6 ? 1 : gs));
        if (p.x > W + 80 || p.y > gY + 60) {
          if (p.dying || this.mood !== p.mood) { this._respawn(p); return; }
          p.x = -this.rng.float(20, 120); p.y = this.rng.float(0.05, 0.95) * (gY + 30); p.age = 0;
        }
        break;
      }
      case 'drop': {
        p.vx = a.wind * 1.2 * p.depth; p.vy = p.fall;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = Math.atan2(p.vy, p.vx) - Math.PI / 2;
        p.alpha = p.a0 * p.fade;
        var landY = p.layer === 'front' ? gY + 50 : p.landY;
        if (p.y >= landY) {
          if (p.layer !== 'front') this._ring(p.x, landY, false);
          if (p.dying || this.mood !== p.mood) { this._respawn(p); return; }
          p.y = -this.rng.float(10, 80); p.x = this.rng.float(-0.05, 1.05) * W; p.age = 0;
          p.landY = this.rng.float(this._lakeTop(), gY);
        }
        break;
      }
      case 'splash': {
        u = p.age / p.life;
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.size = p.s0 + (p.s1 - p.s0) * Math.sqrt(u);
        p.alpha = p.a0 * (1 - u);
        break;
      }
      case 'sparkle':
      case 'star': {
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
      case 'shard':
      case 'spray': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.vy += p.g * h; p.vx *= Math.pow(0.6, h);
        p.x += p.vx * h; p.y += p.vy * h; p.rot = p.kind === 'spray' ? Math.atan2(p.vy, p.vx) - Math.PI / 2 : p.rot + p.rotV * h;
        p.alpha = u > 0.6 ? (1 - u) / 0.4 : 1;
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

  IM.Weather = Weather;
})(window.IM = window.IM || {});
