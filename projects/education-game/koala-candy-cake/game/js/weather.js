/* Koko's Cake Tower — CK.Weather (headless, deterministic Candy Village weather; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new CK.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H);  wx.groundY = layout.groundY;   // rain splashes land on the plaza (default 0.92·H)
 *   wx.setWeather(i, { instant });   // 0 sunny, 1 breezy, 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.update(dt);                   // fixed 1/60 s steps
 *   wx.party(on = true)              // session-end party: sprinkle confetti rains from the top + sparkles (until party(false))
 *   wx.burst(x, y, { kind, n, tint })   // one-shot effects (same cap), SCREEN px. kind:
 *       'confetti' | 'sprinkles' (small fast confetti, candy colours) | 'puff' | 'dust' | 'sparkle' | 'stars' | 'splash'
 *   wx.particles[] { kind, x, y, rot, s, a, tint?, layer, flipX? }  SCREEN px (centre)
 *       kind = asset name: game/assets/default/particles/<kind>.svg (32×32) — sparkle, sugar, wrapper_a, wrapper_b, blossom,
 *       raindrop, splash, puff, dust, confetti_a, confetti_b, pstar (= particles/star.svg). Draw s px wide, rotated rot,
 *       globalAlpha a, mirrored horizontally by flipX (−1..1, a tumble: scale(flipX, 1)) when present; tint = CSS colour to
 *       multiply / source-atop (confetti, blossoms) or null. layer 'back' = behind the cake and Koko, 'front' = over everything
 *       but the UI.
 *   wx.clouds[]    { kind: 'a'|'b'|'c'|'rain', x, y, s, alpha }  SCREEN px (centre); sprite env/cloud_<kind>.svg drawn 320·s wide.
 *   wx.ambient     { skyTop, skyBottom, skyMid (hex), tint (rgba | null), sun 0..1, sunX, sunY (0..1 of the screen),
 *                    darkness 0..0.15, wind 0..1 (breezy ≈ 0.8 with gusts, others ≤ 0.15; main → world.setBreeze(wind)),
 *                    gust 0..1, rain 0..1, rainbow 0..1, cloudSpeed px/s, mood 'sunny'|'breezy'|'rain'|'rainbow', moodIndex 0..3,
 *                    env (= mood: env/<far|mid|ground>_<env>.svg), envFrom, envMix 0..1 (crossfade from envFrom to env) }
 */
(function (CK) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 80, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['sunny', 'breezy', 'rain', 'rainbow'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- sky per weather (DESIGN §3)
  var SKY = [
    { top: '#A9DDF5', bottom: '#FFF4DA', tint: [255, 244, 214, 0.0] },    // sunny
    { top: '#BFDDEB', bottom: '#F3EEDF', tint: [236, 246, 255, 0.03] },   // breezy
    { top: '#8FA0B8', bottom: '#CBD5E0', tint: [120, 136, 172, 0.08] },   // rain (+ darkness 0.15)
    { top: '#9FD6F0', bottom: '#FFF1D6', tint: [255, 238, 248, 0.04] }    // rainbow
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'dark', 'windBase', 'gusty', 'rain', 'rainbow', 'cloudSpeed'];
  var BLOSSOM = ['#F7C6D9', '#FBE3B8', '#E3D3F3', '#FFFFFF'];       // pastel petals (never an answer colour)
  var GLINT = ['#FFF6C8', '#FFFFFF', '#FFE9F3'];
  var SPRINKLE = ['#FF8FC0', '#FFD23F', '#7FD3F7', '#8EE0A8', '#FFB35C', '#C9A0DC', '#FFFFFF'];
  var WRAP = ['#FFB3C7', '#B8E4F5', '#FFE08A', '#C8F0C8'];

  var MOODS = [
    { name: 'sunny', amb: { sun: 1, sunX: 0.8, sunY: 0.13, dark: 0, windBase: 0.06, gusty: 0.06, rain: 0, rainbow: 0, cloudSpeed: 10 },
      clouds: 3, emitters: [
        { mode: 'glint', kind: 'sugar', layer: 'back', count: 12, s: [10, 18], a: [0.55, 0.9] },
        { mode: 'drift', kind: 'blossom', layer: 'front', count: 6, s: [12, 18], a: [0.8, 1], fall: [18, 30], sway: 26, spin: 1.4 }
      ] },
    { name: 'breezy', amb: { sun: 0.85, sunX: 0.78, sunY: 0.15, dark: 0, windBase: 0.7, gusty: 0.3, rain: 0, rainbow: 0, cloudSpeed: 46 },
      clouds: 5, emitters: [
        { mode: 'fly', kind: 'wrapper_a', layer: 'front', count: 4, s: [16, 22], a: [0.85, 1] },
        { mode: 'fly', kind: 'wrapper_b', layer: 'front', count: 4, s: [16, 22], a: [0.85, 1] },
        { mode: 'fly', kind: 'blossom', layer: 'front', count: 10, s: [11, 17], a: [0.8, 1] }
      ] },
    { name: 'rain', amb: { sun: 0, sunX: 0.8, sunY: 0.15, dark: 0.15, windBase: 0.07, gusty: 0.04, rain: 1, rainbow: 0, cloudSpeed: 16 },
      clouds: 6, emitters: [
        { mode: 'rain', kind: 'raindrop', layer: 'front', count: 56, s: [16, 24], a: [0.45, 0.75] }
      ] },
    { name: 'rainbow', amb: { sun: 0.9, sunX: 0.82, sunY: 0.12, dark: 0, windBase: 0.05, gusty: 0.05, rain: 0, rainbow: 1, cloudSpeed: 8 },
      clouds: 3, emitters: [
        { mode: 'glint', kind: 'sparkle', layer: 'back', count: 14, s: [12, 20], a: [0.6, 1] },
        { mode: 'glint', kind: 'sugar', layer: 'front', count: 6, s: [10, 16], a: [0.6, 0.9] },
        { mode: 'drift', kind: 'blossom', layer: 'front', count: 4, s: [12, 18], a: [0.8, 1], fall: [18, 30], sway: 26, spin: 1.4 }
      ] }
  ];
  MOODS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._tint = SKY[i].tint; });
  var N_CLOUDS = 6;
  function cloudKind(mood, idx) { return mood === 2 ? (idx % 3 === 2 ? 'b' : 'rain') : ['a', 'b', 'c'][idx % 3]; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || 0.92 * this.height;
    this.rng = new CK.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this.gust = 0; this._gustT = this.rng.float(3, 6); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.partyOn = false; this._partyAcc = 0;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.SKY = SKY; Weather.CAP = HARD_CAP; Weather.FADE_TIME = FADE_TIME; Weather.NAMES = NAMES;
  Weather.KINDS = ['sparkle', 'sugar', 'wrapper_a', 'wrapper_b', 'blossom', 'raindrop', 'splash', 'puff', 'dust', 'confetti_a', 'confetti_b', 'pstar'];
  Weather.CLOUD_KINDS = ['a', 'b', 'c', 'rain'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeClouds = function () {   // fixed cloud slots in the upper sky; they drift with the weather and wrap
    var r = new CK.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      var far = i % 2;
      this.clouds.push({ kind: 'a', x: (i + r.float(0, 1)) / N_CLOUDS * W * 1.2 - 0.1 * W, y: r.float(0.04, far ? 0.16 : 0.26) * H,
        s: (far ? 0.5 : 0.72) * r.float(0.85, 1.2), alpha: 0, _a: far ? 0.75 : 0.92, _v: r.float(0.7, 1.3) * (far ? 0.6 : 1), _on: 0, idx: i });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; if (this.particles[i]._hy) this.particles[i]._hy *= sy; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    this.groundY *= sy;
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
      for (var q = 0; q < this.clouds.length; q++) { var c = this.clouds[q]; c.kind = cloudKind(i, q); c._on = q < MOODS[i].clouds ? 1 : 0; }
      this._populate(true);
    } else this._fadeU = 0;
    this._ambient();
  };
  /** The session-end party: sprinkle confetti from the top + sparkles while on. */
  P.party = function (on) {
    this.partyOn = on !== false;
    if (this.partyOn) for (var i = 0; i < 4; i++) this.burst(this.width * (0.2 + 0.2 * i), this.height * 0.35, { kind: 'sparkle', n: 6 });
  };

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
    var top = a._top, bot = a._bot;
    a.skyTop = toHex(top); a.skyBottom = toHex(bot); a.skyMid = toHex([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2]);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust, 0, 1);
    a.gust = this.gust;
    a.sun = a._sun; a.sunX = a._sunX; a.sunY = a._sunY;
    a.darkness = clamp(a._dark, 0, 0.15);
    a.rain = clamp(a._rain, 0, 1); a.rainbow = clamp(a._rainbow, 0, 1); a.cloudSpeed = a._cloudSpeed;
    a.moodIndex = this.mood; a.mood = NAMES[this.mood];
    a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- particles
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 4; m++) {
      out[m] = [];
      var em = MOODS[m].emitters;
      for (e = 0; e < em.length; e++) { var t = em[e].count * k * this.ramp[m]; out[m][e] = t; sum += t; }
    }
    var f = sum > AMBIENT_CAP ? AMBIENT_CAP / sum : 1;
    for (m = 0; m < 4; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [], i, m, e;
    for (m = 0; m < 4; m++) { counts[m] = []; for (e = 0; e < tg[m].length; e++) counts[m][e] = 0; }
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p._em >= 0 && !p._dying) counts[p._mood][p._em]++; }
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      var spawnN = anywhere ? want - have : Math.min(2, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) {
          var q = this.particles[i];
          if (q._mood === m && q._em === e && !q._dying) { q._dying = true; extra--; }
        }
      }
    }
  };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, H = this.height;
    var p = { kind: em.kind, x: r.float(0.02, 0.98) * W, y: anywhere ? r.float(0.02, 0.9) * H : -20, rot: r.float(0, TAU), s: r.float(em.s[0], em.s[1]),
      a: 0, tint: null, layer: em.layer, _mode: em.mode, _mood: m, _em: e, _a0: r.float(em.a[0], em.a[1]), _fade: anywhere ? 1 : 0, _dying: false,
      _age: 0, vx: 0, vy: 0, _ph: r.float(0, TAU), _s0: 0 };
    p._s0 = p.s;
    switch (em.mode) {
      case 'glint':   // twinkles in place in the air, then respawns elsewhere
        p._life = r.float(1.0, 2.0); p._age = anywhere ? r.float(0, p._life) : 0; p._fade = 1;
        p.y = r.float(0.05, 0.6) * H; p._rv = r.float(-1, 1); p.tint = r.pick(GLINT);
        break;
      case 'drift':   // petals: slow fall, sway, wind push
        p.vy = r.float(em.fall[0], em.fall[1]); p._sway = em.sway * r.float(0.6, 1.2); p._sw = r.float(0.8, 1.6); p._spin = em.spin * r.float(-1, 1);
        p._flipW = r.float(2, 5); p.tint = r.pick(BLOSSOM); p.flipX = 1;
        break;
      case 'fly':     // wrappers / petals flying sideways with the breeze, fluttering
        if (!anywhere) { p.x = -30; p.y = r.float(0.15, 0.8) * H; }
        p._v = r.float(0.8, 1.25); p._sw = r.float(1.5, 3); p._spin = r.float(2, 5) * (r.chance(0.5) ? 1 : -1); p._flipW = r.float(3, 7);
        p.tint = em.kind === 'blossom' ? r.pick(BLOSSOM) : r.pick(WRAP); p.flipX = 1;
        break;
      case 'rain':    // fast streaks, slanted by the wind; a splash where they hit the plaza
        p.vy = r.float(1000, 1300); p._hy = this.groundY - r.float(0, 70);
        if (!anywhere) p.y = r.float(-60, -10); else p.y = r.float(0, p._hy);
        break;
    }
    this.particles.push(p);
    return p;
  };

  function oneShot(kind, x, y, tint) {
    return { kind: kind, x: x, y: y, rot: 0, s: 14, a: 1, tint: tint || null, layer: 'front', _mode: 'shot', _mood: -1, _em: -1, _a0: 1, _fade: 1,
      _dying: false, _age: 0, vx: 0, vy: 0, _ph: 0, _s0: 14, _life: 1, _g: 0, _drag: 0.3, _rv: 0, _grow: 0 };
  }
  /** One-shot effect particles in SCREEN px (count toward the hard cap). tint = CSS colour or null. */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 20, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p, a, sp;
      switch (kind) {
        case 'confetti': case 'sprinkles': {
          var sprk = kind === 'sprinkles';
          p = oneShot(r.chance(0.5) ? 'confetti_a' : 'confetti_b', x, y, o.tint || r.pick(SPRINKLE));
          p.s = sprk ? r.float(9, 13) : r.float(12, 18); p.rot = r.float(0, TAU);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(sprk ? 260 : 220, sprk ? 620 : 560);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p._rv = r.float(-10, 10); p._flipW = r.float(6, 14); p.flipX = 1;
          p._life = r.float(1.3, 2.1); p._g = 900; p._drag = 0.35; p._mode = 'confetti';
          break;
        }
        case 'puff': case 'dust':
          p = oneShot(kind, x, y, o.tint); p.s = r.float(18, 30); p.layer = 'back'; p.rot = r.float(0, TAU);
          a = r.float(Math.PI, TAU); p.vx = Math.cos(a) * r.float(30, 90); p.vy = Math.sin(a) * r.float(10, 50);
          p._life = r.float(0.45, 0.8); p._rv = r.float(-2, 2); p._g = -20; p._drag = 0.1; p._grow = 0.8; p._a0 = 0.75;
          break;
        case 'splash':
          p = oneShot('splash', x, y, o.tint); p.s = r.float(14, 22); p.layer = 'front'; p._life = 0.3; p._grow = 0.6; p._a0 = 0.8;
          break;
        default: {   // 'sparkle' | 'stars'
          p = oneShot(kind === 'stars' ? 'pstar' : 'sparkle', x, y, o.tint || (kind === 'stars' ? '#FFD54A' : null));
          p.s = r.float(12, 22); p._life = r.float(0.6, 1.1);
          a = r.float(0, TAU); sp = r.float(80, 260); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 'stars' ? 120 : 0);
          p._rv = r.float(-3, 3); p._g = kind === 'stars' ? 420 : 0; p._drag = 0.08; p._mode = 'spark';
        }
      }
      p._s0 = p.s;
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
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
    }
    this._ambient();
    var a = this.ambient;
    for (k = 0; k < this.clouds.length; k++) {
      var c = this.clouds[k], half = 160 * c.s, want = cloudKind(this.mood, c.idx), on = c.idx < MOODS[this.mood].clouds && c.kind === want;
      c.x += (a.cloudSpeed * c._v + a.wind * 20) * h;
      if (c.x - half > W) c.x = -half; else if (c.x + half < 0) c.x = W + half;
      c._on = clamp(c._on + (on ? h : -h) / (ft / 2), 0, 1);
      if (c._on <= 0 && c.kind !== want) c.kind = want;   // swap the sprite while it is invisible
      c.alpha = c._a * c._on;
    }
    if (this.partyOn) {   // confetti sprinkles rain from the top edge
      this._partyAcc += h * 36;
      while (this._partyAcc >= 1) {
        this._partyAcc -= 1;
        if (this.particles.length >= HARD_CAP) break;
        var r = this.rng, p = oneShot(r.chance(0.5) ? 'confetti_a' : 'confetti_b', r.float(0, W), -16, r.pick(SPRINKLE));
        p.s = r.float(10, 16); p.rot = r.float(0, TAU); p.vx = r.float(-40, 40); p.vy = r.float(80, 200); p._rv = r.float(-8, 8);
        p._flipW = r.float(6, 14); p.flipX = 1; p._life = 4; p._g = 160; p._drag = 0.7; p._mode = 'confetti'; p._s0 = p.s;
        this.particles.push(p);
      }
      if (this.rng.chance(h * 3) && this.particles.length < HARD_CAP) this.burst(this.rng.float(0.1, 0.9) * W, this.rng.float(0.1, 0.6) * this.height, { kind: 'sparkle', n: 3 });
    }
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, a = this.ambient, u, live = p._em >= 0 && p._mood === this.mood && !p._dying;
    p._age += h;
    if (p._dying) p._fade -= h / 0.8; else if (p._fade < 1) p._fade = Math.min(1, p._fade + h / 0.8);
    if (p._dying && p._fade <= 0) { this._kill(p); return; }
    switch (p._mode) {
      case 'glint':
        u = p._age / p._life;
        if (u >= 1) { this._kill(p); if (live) this._spawn(p._mood, p._em, false); return; }
        p.rot += p._rv * h; p.s = p._s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.a = p._a0 * p._fade * Math.sin(Math.PI * u);
        break;
      case 'drift':
        p.x += (a.wind * 60 + p._sway * Math.cos(p._ph + p._age * p._sw)) * h;
        p.y += p.vy * (1 + 0.25 * Math.sin(p._ph * 1.7 + p._age * p._sw * 1.3)) * h;
        p.rot += p._spin * h; p.flipX = Math.cos(p._age * p._flipW + p._ph); p.a = p._a0 * p._fade;
        if (p.y > H + 24) { if (live) { p.y = -20; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      case 'fly':
        p.x += (60 + 260 * a.wind) * p._v * h;
        p.y += (Math.sin(p._ph + p._age * p._sw) * 40 + 10) * h;
        p.rot += (p._spin + a.gust * 3) * h; p.flipX = Math.cos(p._age * p._flipW + p._ph); p.a = p._a0 * p._fade;
        if (p.x > W + 30) { if (live) { p.x = -30; p.y = this.rng.float(0.15, 0.8) * H; } else { this._kill(p); return; } }
        if (p.y > H + 30) p.y = -20; else if (p.y < -30) p.y = H * 0.5;
        break;
      case 'rain': {
        var vx = -60 - 160 * a.wind;
        p.x += vx * h; p.y += p.vy * h; p.rot = -Math.atan2(vx, p.vy); p.a = p._a0 * p._fade;
        if (p.y >= p._hy) {
          if (this.particles.length < HARD_CAP && p._hy > 0.5 * H) this.burst(p.x, p._hy, { kind: 'splash', n: 1 });
          if (live) { p.y = this.rng.float(-60, -10); p.x = this.rng.float(0, W * 1.15); p._hy = this.groundY - this.rng.float(0, 70); }
          else { this._kill(p); return; }
        }
        if (p.x < -30) p.x += W + 60;
        break;
      }
      case 'confetti':
        u = p._age / p._life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var dr = Math.pow(p._drag, h);
        p.vx = p.vx * dr + (Math.sin(p._age * 5 + p._rv) * 40 + a.wind * 40) * h; p.vy = p.vy * dr + p._g * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p._rv * h; p.flipX = Math.cos(p._age * p._flipW);
        p.a = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      case 'spark':
        u = p._age / p._life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(p._drag, h); p.vy = p.vy * Math.pow(p._drag, h) + p._g * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p._rv * h;
        p.s = p._s0 * (0.6 + 0.6 * Math.sin(Math.PI * u)); p.a = Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.1));
        break;
      default:   // 'shot': puff / dust / splash
        u = p._age / p._life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(p._drag, h); p.vy = p.vy * Math.pow(p._drag, h) + p._g * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p._rv * h;
        p.s = p._s0 * (0.7 + p._grow * u); p.a = p._a0 * (1 - u);
    }
  };

  CK.Weather = Weather;
})(window.CK = window.CK || {});
