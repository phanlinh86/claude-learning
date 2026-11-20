/* Pip's Reef Tower — RT.Weather (headless, deterministic UNDERWATER ambience; DESIGN §5.3). Node-safe (no DOM).
 * The weather happens above the waves; under water it shows as the light, the current, rain ripples on the surface.
 *
 *   const wx = new RT.Weather({ width, height, seed, groundY, surfaceY });
 *   wx.resize(W, H);  wx.groundY = layout.groundY;       // bubbles rise from the sand (default 0.92·H)
 *   wx.surfaceY = ins.top + 40;                          // the water surface line: rain ripples land at surfaceY − 20 … + 20 (default 40)
 *   wx.pip = { x, y } | null                             // optional: about 1 in 3 rising bubbles start here (Pip's head)
 *   wx.setWeather(i, { instant });   // 0 sunny, 1 breezy (sea current), 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.update(dt);                   // fixed 1/60 s steps
 *   wx.party(on = true)              // session-end party: a stream of tiny fish confetti + bubbles + sparkles (until party(false))
 *   wx.burst(x, y, { kind, n, tint })   // one-shot effects (same cap), SCREEN px. kind:
 *       'confetti' | 'sprinkles' (tiny fish confetti swirling out, watery) | 'bubbles' (a cluster rising) | 'puff' (sand puff)
 *       | 'dust' (sand grains) | 'sparkle' | 'stars' | 'splash' (a ripple ring)
 *   wx.particles[] { kind, x, y, rot, s, a, tint?, layer, flipX? }  SCREEN px (centre)
 *       kind = asset name: game/assets/default/particles/<kind>.svg (32×32) — bubble, sparkle, sugar (tiny glint), wrapper_a,
 *       wrapper_b (seaweed bits), blossom (plankton speck), raindrop (a streak above the surface), splash (ripple ring), puff
 *       (sand puff), dust (sand grain), confetti_a (a tiny fish: tint it), confetti_b (a round bubble-confetti), pstar
 *       (= particles/star.svg). Draw s px wide, rotated rot, globalAlpha a, mirrored by flipX (−1..1) when present; tint = CSS
 *       colour (multiply / source-atop) or null. layer 'back' = behind the tower and Pip, 'front' = over everything but the UI.
 *       Everything moves with a water feel: slow drifting, rising; nothing falls fast (only rain streaks ABOVE the surface).
 *   wx.clouds[]    { kind: 'a'|'b'|'c'|'rain', x, y, s, alpha }  SCREEN px (centre); env/cloud_<kind>.svg drawn 320·s wide —
 *                  soft drifting light / plankton patches in the upper water ('rain' = a darker shadow patch).
 *   wx.ambient     { skyTop, skyBottom, skyMid (hex: the WATER gradient), tint (rgba | null), sun 0..1 (light-ray strength),
 *                    sunX, sunY (0..1 of the screen: the sun glow seen through the water), darkness 0..0.15, wind 0..1 (sea current:
 *                    breezy ≈ 0.8 with surges, others ≤ 0.15; main → world.setBreeze(wind)), gust 0..1, rain 0..1, rainbow 0..1,
 *                    cloudSpeed px/s, mood 'sunny'|'breezy'|'rain'|'rainbow', moodIndex 0..3, env (= mood:
 *                    env/<far|mid|ground>_<env>.svg), envFrom, envMix 0..1 (crossfade from envFrom to env) }
 */
(function (RT) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 80, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['sunny', 'breezy', 'rain', 'rainbow'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- water gradient per weather (DESIGN §3)
  var SKY = [
    { top: '#7FD0E3', bottom: '#DDF4EC', tint: [255, 250, 220, 0.0] },    // sunny
    { top: '#88C7DA', bottom: '#D5EDE4', tint: [220, 240, 236, 0.03] },   // breezy (sea current)
    { top: '#6C93AB', bottom: '#BCD1D6', tint: [90, 116, 138, 0.08] },    // rain (+ darkness 0.15)
    { top: '#86D2E8', bottom: '#E9F6EA', tint: [255, 240, 250, 0.04] }    // rainbow
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'dark', 'windBase', 'gusty', 'rain', 'rainbow', 'cloudSpeed'];
  var PLANKTON = ['#FBE3E8', '#FFF6D8', '#E6F7EF', '#EDE4F7', '#FFFFFF'];   // pastel specks (never an answer colour)
  var GREY = ['#D6DEE2', '#C8D2D8', '#E2E8EA'];
  var GLINT = ['#FFFBE0', '#FFFFFF', '#E8FBFF'];
  var FISH = ['#FF8FC0', '#FFD23F', '#7FD3F7', '#8EE0A8', '#FFB35C', '#C9A0DC', '#FFFFFF'];
  var WEED = ['#8FBF9F', '#A8CFA0', '#9CC7B4', '#B5D6A7'];

  var BUBBLES = { mode: 'rise', kind: 'bubble', layer: 'back', count: 8, s: [8, 18], a: [0.55, 0.85], up: [30, 70] };
  var MOODS = [
    { name: 'sunny', amb: { sun: 1, sunX: 0.78, sunY: 0.06, dark: 0, windBase: 0.06, gusty: 0.06, rain: 0, rainbow: 0, cloudSpeed: 8 },
      clouds: 3, emitters: [
        BUBBLES,
        { mode: 'glint', kind: 'sugar', layer: 'back', count: 6, s: [8, 14], a: [0.5, 0.85] },
        { mode: 'drift', kind: 'blossom', layer: 'front', count: 10, s: [6, 11], a: [0.55, 0.85], vy: [-6, 6], sway: 12 }
      ] },
    { name: 'breezy', amb: { sun: 0.8, sunX: 0.76, sunY: 0.07, dark: 0, windBase: 0.7, gusty: 0.3, rain: 0, rainbow: 0, cloudSpeed: 34 },
      clouds: 5, emitters: [
        BUBBLES,
        { mode: 'fly', kind: 'wrapper_a', layer: 'front', count: 4, s: [16, 24], a: [0.8, 1] },
        { mode: 'fly', kind: 'wrapper_b', layer: 'front', count: 4, s: [16, 24], a: [0.8, 1] },
        { mode: 'fly', kind: 'blossom', layer: 'front', count: 10, s: [6, 11], a: [0.55, 0.85] }
      ] },
    { name: 'rain', amb: { sun: 0.2, sunX: 0.78, sunY: 0.07, dark: 0.15, windBase: 0.07, gusty: 0.04, rain: 1, rainbow: 0, cloudSpeed: 12 },
      clouds: 6, emitters: [
        BUBBLES,
        { mode: 'rain', kind: 'raindrop', layer: 'front', count: 14, s: [14, 22], a: [0.35, 0.6] },
        { mode: 'drift', kind: 'blossom', layer: 'front', count: 12, s: [6, 10], a: [0.45, 0.7], vy: [6, 16], sway: 8, grey: true }
      ] },
    { name: 'rainbow', amb: { sun: 0.9, sunX: 0.8, sunY: 0.06, dark: 0, windBase: 0.05, gusty: 0.05, rain: 0, rainbow: 1, cloudSpeed: 7 },
      clouds: 3, emitters: [
        { mode: 'rise', kind: 'bubble', layer: 'back', count: 10, s: [8, 18], a: [0.6, 0.9], up: [30, 70] },
        { mode: 'glint', kind: 'sparkle', layer: 'back', count: 12, s: [12, 20], a: [0.6, 1] },
        { mode: 'drift', kind: 'blossom', layer: 'front', count: 5, s: [6, 11], a: [0.55, 0.85], vy: [-6, 6], sway: 12 }
      ] }
  ];
  MOODS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._tint = SKY[i].tint; });
  var N_CLOUDS = 6;
  function cloudKind(mood, idx) { return mood === 2 ? (idx % 3 === 2 ? 'b' : 'rain') : ['a', 'b', 'c'][idx % 3]; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || 0.92 * this.height;
    this.surfaceY = opts.surfaceY || 40; this.pip = null;
    this.rng = new RT.RNG(opts.seed !== undefined ? opts.seed : 7);
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
  Weather.KINDS = ['bubble', 'sparkle', 'sugar', 'wrapper_a', 'wrapper_b', 'blossom', 'raindrop', 'splash', 'puff', 'dust', 'confetti_a', 'confetti_b', 'pstar'];
  Weather.CLOUD_KINDS = ['a', 'b', 'c', 'rain'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeClouds = function () {   // fixed cloud slots in the upper sky; they drift with the weather and wrap
    var r = new RT.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      var far = i % 2;
      this.clouds.push({ kind: 'a', x: (i + r.float(0, 1)) / N_CLOUDS * W * 1.2 - 0.1 * W, y: r.float(0.04, far ? 0.16 : 0.26) * H,
        s: (far ? 0.5 : 0.72) * r.float(0.85, 1.2), alpha: 0, _a: far ? 0.75 : 0.92, _v: r.float(0.7, 1.3) * (far ? 0.6 : 1), _on: 0, idx: i });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var q = this.particles[i]; q.x *= sx; q.y *= sy; if (q._hy) q._hy *= sy; if (q._x0 !== undefined) q._x0 *= sx; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    this.groundY *= sy; if (this.pip) { this.pip.x *= sx; this.pip.y *= sy; }
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
  /** The session-end party: tiny fish confetti swim across + bubbles + sparkles while on. */
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
    var p = { kind: em.kind, x: r.float(0.02, 0.98) * W, y: anywhere ? r.float(0.08, 0.9) * H : -20, rot: r.float(0, TAU), s: r.float(em.s[0], em.s[1]),
      a: 0, tint: null, layer: em.layer, _mode: em.mode, _mood: m, _em: e, _a0: r.float(em.a[0], em.a[1]), _fade: anywhere ? 1 : 0, _dying: false,
      _age: 0, vx: 0, vy: 0, _ph: r.float(0, TAU), _s0: 0 };
    p._s0 = p.s;
    switch (em.mode) {
      case 'glint':   // light glitter twinkling in the upper water, then respawns elsewhere
        p._life = r.float(1.0, 2.2); p._age = anywhere ? r.float(0, p._life) : 0; p._fade = 1;
        p.y = r.float(0.08, 0.55) * H; p._rv = r.float(-1, 1); p.tint = r.pick(GLINT);
        break;
      case 'drift':   // plankton specks: slow wander, carried by the current (rain: greyish, sinking slowly)
        p.vy = r.float(em.vy[0], em.vy[1]); p._sway = em.sway * r.float(0.6, 1.3); p._sw = r.float(0.4, 1.0); p._spin = r.float(-0.6, 0.6);
        p.tint = r.pick(em.grey ? GREY : PLANKTON); p._fade = 1;
        if (!anywhere) { p.y = r.float(0.08, 0.9) * H; p._fade = 0; }
        break;
      case 'fly':     // seaweed bits / plankton flowing sideways with the current, tumbling slowly
        if (!anywhere) { p.x = -30; p.y = r.float(0.15, 0.85) * H; }
        p._v = r.float(0.8, 1.25); p._sw = r.float(0.8, 1.6); p._spin = r.float(0.8, 2.2) * (r.chance(0.5) ? 1 : -1); p._flipW = r.float(1.5, 3.5);
        p.tint = em.kind === 'blossom' ? r.pick(PLANKTON) : r.pick(WEED); p.flipX = 1;
        break;
      case 'rise':    // bubbles rising from the sand (or from Pip), wobbling, until the surface
        this._bubbleStart(p, anywhere);
        p.vy = -r.float(em.up[0], em.up[1]) * (0.7 + 0.03 * p.s); p._sw = r.float(2, 4); p._sway = r.float(4, 10); p.rot = 0;
        break;
      case 'rain':    // streaks above the surface; a ripple ring where each one meets the water
        p.vy = r.float(520, 700); p._hy = this.surfaceY + r.float(-20, 20);
        p.y = anywhere ? r.float(-220, p._hy) : r.float(-220, -10);
        break;
    }
    this.particles.push(p);
    return p;
  };
  P._bubbleStart = function (p, anywhere) {
    var r = this.rng;
    if (this.pip && r.chance(0.33)) { p.x = this.pip.x + r.float(-30, 30); p.y = this.pip.y + r.float(-10, 10); }
    else { p.x = r.float(0.03, 0.97) * this.width; p.y = this.groundY - r.float(0, 30); }
    if (anywhere) p.y = r.float(this.surfaceY + 20, this.groundY);
    p._x0 = p.x;
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
        case 'confetti': case 'sprinkles': {   // tiny fish (confetti_a) + bubble confetti swirling out, slowed by the water
          var sprk = kind === 'sprinkles', fish = sprk || r.chance(0.6);
          p = oneShot(fish ? 'confetti_a' : 'confetti_b', x, y, o.tint || r.pick(FISH));
          p.s = sprk ? r.float(10, 15) : r.float(12, 18);
          a = r.float(0, TAU); sp = r.float(sprk ? 120 : 100, sprk ? 320 : 280);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 40; p.rot = fish ? Math.atan2(p.vy, p.vx) : r.float(0, TAU);
          p._rv = fish ? 0 : r.float(-3, 3); p._flipW = 0; p.flipX = fish ? (p.vx < 0 ? -1 : 1) : 1;
          p._life = r.float(1.4, 2.2); p._g = -40; p._drag = 0.12; p._mode = 'confetti'; p._fish = fish;
          break;
        }
        case 'bubbles':
          p = oneShot('bubble', x + r.float(-20, 20), y + r.float(-10, 10), null); p.s = r.float(8, 20); p.layer = 'front';
          p.vx = r.float(-30, 30); p.vy = -r.float(60, 160); p._life = r.float(0.9, 1.6); p._g = -60; p._drag = 0.3; p._a0 = 0.85; p._mode = 'bub';
          break;
        case 'puff': case 'dust':   // sand: spreads sideways along the floor, drifts up a little, settles slowly
          p = oneShot(kind, x, y, o.tint); p.s = kind === 'puff' ? r.float(18, 30) : r.float(6, 10); p.layer = 'back'; p.rot = r.float(0, TAU);
          a = r.float(Math.PI * 1.05, Math.PI * 1.95); sp = r.float(40, 110); p.vx = Math.cos(a) * sp * 1.4; p.vy = Math.sin(a) * sp * 0.5;
          p._life = r.float(0.7, 1.2); p._rv = r.float(-1.5, 1.5); p._g = kind === 'dust' ? 30 : -10; p._drag = 0.08; p._grow = kind === 'puff' ? 1.0 : 0; p._a0 = 0.7;
          break;
        case 'splash':   // a ripple ring on the surface
          p = oneShot('splash', x, y, o.tint); p.s = r.float(16, 26); p.layer = 'front'; p._life = 0.6; p._grow = 1.2; p._a0 = 0.7;
          break;
        default: {   // 'sparkle' | 'stars' (slow, floating)
          p = oneShot(kind === 'stars' ? 'pstar' : 'sparkle', x, y, o.tint || (kind === 'stars' ? '#FFD54A' : null));
          p.s = r.float(12, 22); p._life = r.float(0.7, 1.2);
          a = r.float(0, TAU); sp = r.float(60, 180); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 'stars' ? 60 : 0);
          p._rv = r.float(-3, 3); p._g = kind === 'stars' ? -30 : -20; p._drag = 0.08; p._mode = 'spark';
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
    if (this.partyOn) {   // little fish confetti swim in from both sides on wavy paths, rising a little; bubbles; sparkles
      this._partyAcc += h * 36;
      while (this._partyAcc >= 1) {
        this._partyAcc -= 1;
        if (this.particles.length >= HARD_CAP) break;
        var r = this.rng, left = r.chance(0.5), fishy = r.chance(0.75), Hh = this.height;
        var p = oneShot(fishy ? 'confetti_a' : 'bubble', left ? -16 : W + 16, r.float(0.2, 0.9) * Hh, fishy ? r.pick(FISH) : null);
        p.s = fishy ? r.float(12, 18) : r.float(8, 16); p.vx = (left ? 1 : -1) * r.float(90, 200); p.vy = -r.float(5, 35);
        p.rot = Math.atan2(p.vy, p.vx); p._rv = 0; p.flipX = left ? 1 : -1; p._flipW = 0; p._fish = fishy;
        p._life = 4.5; p._g = -6; p._drag = 0.9; p._mode = 'confetti'; p._s0 = p.s;
        this.particles.push(p);
      }
      if (this.rng.chance(h * 3) && this.particles.length < HARD_CAP) this.burst(this.rng.float(0.1, 0.9) * W, this.rng.float(0.3, 0.9) * this.height, { kind: this.rng.chance(0.5) ? 'sparkle' : 'bubbles', n: 3 });
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
        p.x += (a.wind * 50 + p._sway * Math.cos(p._ph + p._age * p._sw)) * h;
        p.y += (p.vy + 6 * Math.sin(p._ph * 1.7 + p._age * p._sw * 1.3)) * h;
        p.rot += p._spin * h; p.a = p._a0 * p._fade;
        if (p.y > H + 20 || p.y < this.surfaceY - 10) { if (live) { p.y = p.vy > 0 ? this.surfaceY + 10 : H * 0.9; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      case 'fly':
        p.x += (30 + 150 * a.wind) * p._v * h;
        p.y += (Math.sin(p._ph + p._age * p._sw) * 22 - 4) * h;
        p.rot += (p._spin + a.gust * 1.5) * h; p.flipX = Math.cos(p._age * p._flipW + p._ph); p.a = p._a0 * p._fade;
        if (p.x > W + 30) { if (live) { p.x = -30; p.y = this.rng.float(0.15, 0.85) * H; } else { this._kill(p); return; } }
        if (p.y > H + 30) p.y = H * 0.5; else if (p.y < this.surfaceY) p.y = H * 0.5;
        break;
      case 'rise':
        p.y += p.vy * h;
        p._x0 += a.wind * 30 * h;   // the current bends the bubble column
        p.x = p._x0 + p._sway * Math.sin(p._ph + p._age * p._sw);
        p.a = p._a0 * p._fade * clamp((p.y - this.surfaceY) / 60, 0, 1);
        if (p.y <= this.surfaceY) { if (live) { this._bubbleStart(p, false); p._age = 0; } else { this._kill(p); return; } }
        break;
      case 'rain': {
        var vx = -30 - 80 * a.wind;
        p.x += vx * h; p.y += p.vy * h; p.rot = -Math.atan2(vx, p.vy); p.a = p._a0 * p._fade;
        if (p.y >= p._hy) {
          if (this.particles.length < HARD_CAP) this.burst(p.x, p._hy, { kind: 'splash', n: 1 });
          if (live) { p.y = this.rng.float(-220, -10); p.x = this.rng.float(0, W * 1.1); p._hy = this.surfaceY + this.rng.float(-20, 20); }
          else { this._kill(p); return; }
        }
        if (p.x < -30) p.x += W + 60;
        break;
      }
      case 'confetti':
        u = p._age / p._life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var dr = Math.pow(p._drag, h);
        p.vx = p.vx * dr + a.wind * 30 * h; p.vy = p.vy * dr + (p._g + Math.sin(p._age * 4 + p._ph) * 30) * h;
        p.x += p.vx * h; p.y += p.vy * h;
        if (p._fish) { p.rot = Math.atan2(p.vy, Math.abs(p.vx) + 1e-3) * (p.vx < 0 ? -1 : 1); p.flipX = p.vx < 0 ? -1 : 1; }   // swims nose first
        else p.rot += p._rv * h;
        p.a = u > 0.75 ? (1 - u) / 0.25 : Math.min(1, u * 8);
        break;
      case 'bub':
        u = p._age / p._life;
        if (u >= 1 || p.y < this.surfaceY) { this._kill(p); return; }
        p.vx *= Math.pow(p._drag, h); p.vy = p.vy * Math.pow(p._drag, h) + p._g * h;
        p.x += (p.vx + 20 * Math.sin(p._age * 7 + p.s)) * h; p.y += p.vy * h;
        p.a = p._a0 * (u > 0.7 ? (1 - u) / 0.3 : 1);
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

  RT.Weather = Weather;
})(window.RT = window.RT || {});
