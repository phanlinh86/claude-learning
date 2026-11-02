/* Dee's Forest Memory — DM.Weather (headless, deterministic forest seasons; DESIGN §5.3)
 *
 *   const wx = new DM.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.update(dt, { groundY });      // fixed 1/60 s sub-steps (accumulator) → same result for any dt split
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle', n, color })   // one-shot effects (same cap)
 *   wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', kind, glow?, color?, flap? }
 *   wx.clouds[]    { sprite:'cloud1..3', x, y, scale, alpha }   // drawn width 300·scale, centre x,y
 *   wx.stars[]     { x, y, r, phase, tw }   // unused by the seasons (ambient.stars = 0), kept for the shared renderer
 *   wx.ambient     { skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, moon, moonX, moonY, stars, darkness (0),
 *                    gust, windBase, season (0..3, = the target season) }
 *       wind      px/s, gusty, −40..40 (positive = blowing right). main copies it into world.wind every frame.
 *       sway      0..1 for grass / trees;   sunX/sunY 0..1 of the screen.
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX, 1) → sprite of width `size` centred, globalAlpha = alpha.
 * sprite 'butterfly' has no SVG: draw DM.CardArt.drawButterfly(ctx, p.color, p.size, p.flap) (flap 0..1).
 * glow:true → soft additive halo (fireflies). Layers: 'sky' (behind the hills), 'back' (in front of the scenery, behind
 * the cards / Dee), 'front' (over everything; few, faint).
 *
 * Seasons (docs/MECHANICS.md §7):
 *  0 spring : falling petals (flutter down, sway, wrap) + butterflies (wander, flap 7–9 Hz) + a few sparkles
 *  1 summer : sun sparkles (glints in the air) + a few fireflies (glow, blink) + 2 butterflies
 *  2 autumn : tumbling leaves (leaf_a / leaf_b) that fall and are blown across by strong gusts
 *  3 winter : snowflakes (snow1 / snow2) falling with a slow sway, a few bigger front flakes
 *  gusts    : every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) push wind and sway, scaled by the season's gustiness.
 */
(function (DM) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 90, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r0(r, a, b) { return r.float(a, b); }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }

  // ---- sky per season (light and less saturated than every answer colour)
  var SKY = [
    { top: '#A9D8F0', bottom: '#EEF7EE', horizon: '#F6F2E2', tint: 'rgba(255,200,225,0.06)' },   // 0 spring: soft blue → mint, blossom tint
    { top: '#7EC4EE', bottom: '#DFF2FA', horizon: '#F2F6E2', tint: null },                        // 1 summer: clear blue
    { top: '#E9C9A0', bottom: '#FBEBD6', horizon: '#F6DDB8', tint: 'rgba(255,170,90,0.06)' },     // 2 autumn: warm apricot haze
    { top: '#C5D7E6', bottom: '#EEF4F8', horizon: '#F7FAFC', tint: 'rgba(205,222,255,0.08)' }     // 3 winter: pale grey-blue
  ];
  var NUM_KEYS = ['windBase', 'gusty', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'darkness'];
  var BF_COLORS = ['yellow', 'pink', 'blue', 'orange', 'purple'];   // ambient butterflies (DM.CardArt.drawButterfly colour keys)

  var MOODS = [
    { name: 'spring',
      amb: { windBase: 8, gusty: 10, sway: 0.2, sun: 1, sunX: 0.8, sunY: 0.16, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.9, scale: [0.55, 0.85] },
      emitters: [
        { kind: 'petal', layer: 'back', count: 16, size: [12, 18], alpha: [0.8, 1], sprite: 'petal' },
        { kind: 'petal', layer: 'front', count: 3, size: [18, 24], alpha: [0.55, 0.7], sprite: 'petal', depth: 1.4 },
        { kind: 'butterfly', layer: 'back', count: 3, size: [26, 34], alpha: [0.9, 1], sprite: 'butterfly' },
        { kind: 'sparkle', layer: 'sky', count: 3, size: [10, 16], alpha: [0.5, 0.8], sprite: 'sparkle' }
      ] },
    { name: 'summer',
      amb: { windBase: 6, gusty: 8, sway: 0.18, sun: 1, sunX: 0.68, sunY: 0.1, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0 },
      clouds: { n: 4, speed: [6, 12], alpha: 0.95, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'sparkle', layer: 'back', count: 10, size: [10, 18], alpha: [0.55, 0.85], sprite: 'sparkle' },
        { kind: 'firefly', layer: 'back', count: 6, size: [14, 20], alpha: [0.7, 0.95], sprite: 'firefly' },
        { kind: 'butterfly', layer: 'back', count: 2, size: [26, 34], alpha: [0.9, 1], sprite: 'butterfly' }
      ] },
    { name: 'autumn',
      amb: { windBase: 14, gusty: 26, sway: 0.35, sun: 1, sunX: 0.76, sunY: 0.24, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0 },
      clouds: { n: 3, speed: [8, 14], alpha: 0.9, scale: [0.6, 0.95] },
      emitters: [
        { kind: 'leaf', layer: 'back', count: 9, size: [16, 24], alpha: [0.85, 1], sprite: 'leaf_a' },
        { kind: 'leaf', layer: 'back', count: 9, size: [16, 24], alpha: [0.85, 1], sprite: 'leaf_b' },
        { kind: 'leaf', layer: 'front', count: 2, size: [26, 32], alpha: [0.55, 0.7], sprite: 'leaf_a', depth: 1.4 }
      ] },
    { name: 'winter',
      amb: { windBase: 5, gusty: 8, sway: 0.12, sun: 0.55, sunX: 0.8, sunY: 0.18, moon: 0, moonX: 0.86, moonY: 0.3, stars: 0, darkness: 0 },
      clouds: { n: 4, speed: [3, 7], alpha: 0.85, scale: [0.6, 1.0] },
      emitters: [
        { kind: 'snow', layer: 'back', count: 26, size: [8, 14], alpha: [0.8, 1], sprite: 'snow1' },
        { kind: 'snow', layer: 'back', count: 14, size: [10, 16], alpha: [0.8, 1], sprite: 'snow2' },
        { kind: 'snow', layer: 'front', count: 4, size: [18, 24], alpha: [0.5, 0.65], sprite: 'snow2', depth: 1.5 }
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
    this.rng = new DM.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 96;
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
  Weather.SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow1', 'snow2', 'sparkle', 'star', 'firefly', 'puff', 'confetti_a', 'confetti_b', 'butterfly'];
  Weather.SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P._makeStars = function () {     // own generator: the star field never changes the particle sequence
    var r = new DM.RNG((this.rng.seed ^ 0x5f3759df) >>> 0), W = this.width, gY = this.groundY;
    var n = Math.round(70 * clamp(W * this.height / REF_AREA, 0.7, 1.5));
    this.stars = [];
    for (var i = 0; i < n; i++) {
      this.stars.push({ x: r.float(0, W), y: r.float(0.03, 0.55) * gY, r: r.chance(0.12) ? r.float(2, 3) : r.float(0.8, 1.8),
        phase: r.float(0, TAU), tw: r.float(1, 3) });
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; if (this.particles[i].hy !== undefined) this.particles[i].hy *= sy; }
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
    a.season = this.mood;
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

  /** Meadow box for wanderers: x 4–96 % of W, y from 30 % of the ground line down to just above the grass. */
  P._box = function (kind) {
    var gY = this.groundY, W = this.width;
    if (kind === 'firefly') return { x0: 0.03 * W, x1: 0.97 * W, y0: 0.45 * gY, y1: gY + 40 };
    return { x0: 0.04 * W, x1: 0.96 * W, y0: 0.3 * gY, y1: gY - 10 };
  };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, gY = this.groundY;
    var p = { sprite: em.sprite, x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    var B;
    switch (em.kind) {
      case 'butterfly':
      case 'firefly':
        B = this._box(em.kind);
        p.x = r.float(B.x0, B.x1); p.y = r.float(B.y0, B.y1);
        if (!anywhere && em.kind === 'butterfly') { p.x = r.chance(0.5) ? -20 : W + 20; p.fade = 1; }
        p.head = r.float(0, TAU); p.turn = 0; p.sp = em.kind === 'butterfly' ? r.float(35, 60) : r.float(10, 22);
        p.ph = r.float(0, TAU); p.flapW = r.float(7, 9) * TAU; p.bobW = r.float(1.5, 2.5);
        p.blink = r.float(2, 4); p.blinkPh = r.float(0, 1);
        if (em.kind === 'firefly') p.glow = true;
        else { p.color = r.pick(BF_COLORS); p.flap = 1; }
        break;
      case 'petal':
      case 'leaf':
      case 'snow':
        // fallers: start anywhere (instant) or just above the top edge; vy0 = fall speed, sway phase/rate, spin
        p.ph = r.float(0, TAU); p.w = r.float(0.6, 1.4); p.spin = r.float(-1.5, 1.5);
        p.fall = em.kind === 'snow' ? r.float(30, 55) : em.kind === 'leaf' ? r.float(38, 62) : r.float(26, 44);
        p.fall *= p.depth;
        p.x = r.float(-0.05, 1.05) * W;
        p.y = anywhere ? r.float(-0.05, 1) * (gY + 40) : -r.float(10, 60);
        p.fade = 1;
        break;
      case 'sparkle':
      case 'star':
        p.x = r.float(0.04, 0.96) * W;
        p.y = (em.kind === 'star' ? r.float(0.05, 0.5) : r.float(0.25, 0.8)) * gY;
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
    var W = this.width, H = this.height, gY = this.groundY, a = this.ambient, u, B;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this.particles.splice(this.particles.indexOf(p), 1); return; }
    switch (p.kind) {
      case 'butterfly':
      case 'firefly': {
        B = this._box(p.kind);
        // smooth random walk of the heading + steering back into the box
        p.turn += (this.rng.float(-1, 1) * 3 - p.turn * 1.5) * h;
        var cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
        var out = p.x < B.x0 || p.x > B.x1 || p.y < B.y0 || p.y > B.y1;
        var want = Math.atan2(cy - p.y, cx - p.x), dh = Math.atan2(Math.sin(want - p.head), Math.cos(want - p.head));
        p.head += (p.turn + (out ? 2.5 * dh : 0.15 * dh)) * h;
        var bf = p.kind === 'butterfly';
        p.vx = Math.cos(p.head) * p.sp + a.wind * (bf ? 0.35 : 0.1);
        p.vy = Math.sin(p.head) * p.sp * 0.6 + (bf ? Math.cos(p.ph + p.bobW * TAU * p.age) * 18 : 0);
        p.x += p.vx * h; p.y += p.vy * h;
        if (bf) {
          var face = p.vx >= 0 ? 1 : -1;
          p.flap = Math.abs(Math.cos(p.ph + p.flapW * p.age));   // wings: DM.CardArt.drawButterfly(ctx, p.color, p.size, p.flap)
          p.flipX = face;                                          // facing only (the wing beat is in flap)
          p.rot = clamp(p.vy * 0.004, -0.35, 0.35);
          p.alpha = p.a0 * p.fade;
        } else {
          var bu = ((p.age / p.blink) + p.blinkPh) % 1, on = bu < 0.35 ? Math.sin(Math.PI * bu / 0.35) : 0;
          p.alpha = p.a0 * p.fade * (0.12 + 0.88 * on * on);
        }
        if (p.x < -60 || p.x > W + 60) { p.x = clamp(p.x, -60, W + 60); p.head = Math.atan2(Math.sin(p.head), -Math.cos(p.head)); }
        break;
      }
      case 'petal':
      case 'leaf':
      case 'snow': {
        // terminal-speed fall + sideways flutter (sway) + wind drift; gusts lift leaves and blow them across
        var k = p.kind, sw = k === 'snow' ? 14 : k === 'leaf' ? 34 : 24, windK = k === 'snow' ? 0.5 : k === 'leaf' ? 1.6 : 0.9;
        p.vx = (a.wind * windK) * p.depth + sw * Math.cos(p.ph + p.age * p.w * 2.2);
        p.vy = p.fall - (k === 'leaf' ? 70 : k === 'petal' ? 25 : 10) * this.gust + (k === 'leaf' ? 18 * Math.sin(p.ph + p.age * 3.1) : 0);
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * (k === 'leaf' ? 2.5 : k === 'petal' ? 1.4 : 0.5) * h;
        if (k !== 'snow') p.flipX = Math.cos(p.ph + p.age * (k === 'leaf' ? 3.4 : 2.6));   // tumbling (fractional = 3D turn)
        p.alpha = p.a0 * p.fade;
        if (p.y > gY + 60 || p.x > W + 60 || p.x < -60) {
          if (p.dying || this.mood !== p.mood) { this._respawn(p); return; }
          p.y = -r0(this.rng, 10, 50); p.x = this.rng.float(-0.05, 1.05) * W; p.age = 0;
          if (a.wind > 20 && this.rng.chance(0.5)) { p.x = -30; p.y = this.rng.float(0.05, 0.6) * gY; }
        }
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
      case 'mist':
        p.x += (p.vx + a.wind * 0.15) * h;
        p.y += Math.sin(p.ph + p.age * 0.4) * 2 * h;
        if (p.x - p.size > W) p.x = -p.size; else if (p.x + p.size < 0) p.x = W + p.size;
        p.alpha = p.a0 * p.fade * (0.8 + 0.2 * Math.sin(p.ph + p.age * 0.6));
        break;
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

  DM.Weather = Weather;
})(window.DM = window.DM || {});
