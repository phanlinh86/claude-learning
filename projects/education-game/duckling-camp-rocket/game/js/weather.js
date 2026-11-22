/* Mimi's Splash Rocket — DK.Weather (headless, deterministic sky + ambient life for the mountain campsite: sunny → breezy → rain →
 * rainbow; DESIGN §5.3; adapted from Moka's Fairy Tea Party (the same 4 moods) on the base's particle schema). Node-safe.
 *
 *   const wx = new DK.Weather({ width, height, seed, layout });
 *   wx.windSource = world;              // recommended: follow the world's wind (world.wind px/s², world.gust 0..1) so leaves, petals,
 *                                       // rain and clouds gust with the parachute; without it the weather runs its own DK.WindModel copy
 *   wx.resize(W, H, layout);           // world.layout (horizon / meadow: where raindrops splash)
 *   wx.setWeather(i, { instant });     // 0 sunny, 1 breezy, 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti + gold stars + rainbow sparkles whatever the mood
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.wind / wx.gust                  // px/s² horizontal (breezy gusts every 6–10 s, ±40–60 for 1.5 s) / 0..1 envelope
 *   wx.burst(x, y, { kind: 'stars'|'sparkle'|'confetti'|'drops'|'rainbow'|'petals'|'leaves'|'dots', n, color })   // one-shot effects
 *   wx.wipeParticles(dir)              // the round wipe: ≈ 60 mood particles (sun motes / leaves / rain / rainbow sparkles) sweeping
 *                                      // across along dir {x, y} in ≈ 1.1 s (layer 'front', kind 'sweep'; +60 over the cap)
 *   wx.ambient { skyTop, skyMid, skyBottom (hex), tint (rgba for far / mid only | null), light 0..1, sunX, sunY (px), sunA 0..1,
 *                dark 0..0.12, wind 0..1 (strength; windPx = signed px/s²), gust 0..1, rain 0..1, rainbow 0..1, mood 'sunny'|'breezy'|
 *                'rain'|'rainbow', moodIndex, env (= mood: env/far_<env>.svg, env/mid_<env>.svg), envFrom, envMix 0..1, party 0..1 }
 *   wx.clouds[] { type 'cloud_a'|'cloud_b'|'cloud_rain', x, y (centre), s (scale of the 300×140 sprite), alpha, flipX }   slow drift
 *   wx.particles[] { type (= sprite: mote, sparkle, star, leaf, petal, butterfly, confetti_a, confetti_b, dot, raindrop, splash, dust,
 *                    rainbow_sparkle), sprite, x, y, size (px; raindrop: the streak length), r, rot, alpha, layer 'back'|'front', kind,
 *                    color (hex | null), flipX?, flap? }  SCREEN px.
 */
(function (DK) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, SWEEP_CAP = 60, AMBIENT_CAP = 70, REF_AREA = 1280 * 720, FADE_TIME = 2.5, N_CLOUDS = 6;
  var NAMES = ['sunny', 'breezy', 'rain', 'rainbow'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }
  function mix(a, b, u) { var p = hex(a), q = hex(b); return toHex([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]); }

  // DESIGN §3 skies per mood. sun position as fractions of (W, H above the horizon); clouds = how many of 6 show.
  var MOODS = [
    { name: 'sunny', top: '#9FD3EE', bottom: '#F3F7EE', tint: null,
      amb: { light: 1, sunX: 0.78, sunY: 0.22, sunA: 1, dark: 0, rain: 0, rainbow: 0, clouds: 3, cloudA: 0.95, rainClouds: 0 },
      emitters: [{ kind: 'mote', sprite: 'mote', layer: 'back', count: 12, size: [7, 12], alpha: [0.35, 0.65], color: '#FFF6D8' },
        { kind: 'butterfly', sprite: 'butterfly', layer: 'back', count: 3, size: [18, 24], alpha: [0.85, 1] }] },
    { name: 'breezy', top: '#B7D9EC', bottom: '#F1F3EA', tint: [236, 246, 236, 0.03],
      amb: { light: 0.98, sunX: 0.74, sunY: 0.26, sunA: 0.85, dark: 0, rain: 0, rainbow: 0, clouds: 5, cloudA: 0.92, rainClouds: 0 },
      emitters: [{ kind: 'fly', sprite: 'leaf', layer: 'front', count: 9, size: [14, 22], alpha: [0.85, 1] },
        { kind: 'fly', sprite: 'petal', layer: 'front', count: 8, size: [11, 17], alpha: [0.8, 1] }] },
    { name: 'rain', top: '#A7B5C3', bottom: '#DCE2E6', tint: [118, 138, 150, 0.08],
      amb: { light: 0.88, sunX: 0.8, sunY: 0.2, sunA: 0, dark: 0.12, rain: 1, rainbow: 0, clouds: 6, cloudA: 0.95, rainClouds: 1 },
      emitters: [{ kind: 'rain', sprite: 'raindrop', layer: 'front', count: 54, size: [16, 24], alpha: [0.45, 0.75] }] },
    { name: 'rainbow', top: '#B6DDF0', bottom: '#FBF3E6', tint: [255, 240, 246, 0.04],
      amb: { light: 1, sunX: 0.82, sunY: 0.2, sunA: 0.9, dark: 0, rain: 0, rainbow: 1, clouds: 3, cloudA: 0.9, rainClouds: 0 },
      emitters: [{ kind: 'glint', sprite: 'rainbow_sparkle', layer: 'back', count: 12, size: [12, 20], alpha: [0.6, 1] },
        { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 5, size: [10, 16], alpha: [0.6, 0.9] },
        { kind: 'butterfly', sprite: 'butterfly', layer: 'back', count: 3, size: [18, 24], alpha: [0.85, 1] }] }
  ];
  MOODS.forEach(function (m) { m.mid = mix(m.top, m.bottom, 0.5); m._top = hex(m.top); m._mid = hex(m.mid); m._bot = hex(m.bottom); m._tint = m.tint || [255, 255, 255, 0]; });
  var NUM_KEYS = ['light', 'sunX', 'sunY', 'sunA', 'dark', 'rain', 'rainbow', 'clouds', 'cloudA', 'rainClouds'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], color: '#FFD54A' },
    { kind: 'fall', sprite: 'confetti_a', alt: 'confetti_b', layer: 'front', count: 14, size: [12, 18], alpha: [0.85, 1] },
    { kind: 'glint', sprite: 'rainbow_sparkle', layer: 'front', count: 6, size: [12, 18], alpha: [0.7, 1] }];
  var SWEEP = [['mote', 'sparkle'], ['leaf', 'petal'], ['raindrop', 'raindrop'], ['rainbow_sparkle', 'sparkle']];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var PETALS = ['#F7D6DF', '#FBEBC8', '#E8DDF3', '#FFFFFF'];       // pastel petals (never an answer colour)
  var LEAVES = ['#B9C77A', '#A7BE6E', '#D6C27A', '#C7B36A'];       // soft meadow leaves (calmer than answer green)
  var WATER = ['#B9DDE3', '#DDEFF2', '#FFFFFF'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 14; this.horizonY = 0.45 * this.height;
    this.layout = null;
    this.rng = new DK.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.windSource = opts.windSource || null; this.wind = 0; this.gust = 0;
    this._wind = DK.WindModel ? new DK.WindModel(opts.seed !== undefined ? (opts.seed ^ 0x77) >>> 0 : 11) : null;
    this.ambient = {};
    this._makeClouds();
    if (opts.layout) this._setLayout(opts.layout);
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['mote', 'sparkle', 'star', 'leaf', 'petal', 'butterfly', 'confetti_a', 'confetti_b', 'dot', 'raindrop', 'splash', 'dust', 'rainbow_sparkle'];
  Weather.CLOUDS = ['cloud_a', 'cloud_b', 'cloud_rain'];
  Weather.SWEEP_CAP = SWEEP_CAP;
  Weather.SKY = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  P._skyBottom = function () { return Math.min(this.horizonY, this.height * 0.55); };
  P._setLayout = function (L) {
    this.layout = L;
    if (L && L.play) this.groundY = L.play.y1;
    if (L && isFinite(L.horizon)) this.horizonY = L.horizon;
  };
  /** resize(W, H, layout) — layout = world.layout (a number is accepted as the ground y). */
  P.resize = function (W, H, layout) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.y0 !== undefined) p.y0 *= sy; if (p.x0 !== undefined) p.x0 *= sx; if (p.hitY !== undefined) p.hitY *= sy; }
    for (i = 0; i < this.clouds.length; i++) { var c = this.clouds[i]; c.x *= sx; c.y *= sy; c.y0 *= sy; }
    this.width = W; this.height = H;
    if (layout && typeof layout === 'object') this._setLayout(layout);
    else { this.groundY = layout !== undefined && isFinite(layout) ? layout : this.groundY * sy; this.horizonY *= sy; }
    this._ambient();
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
      this.particles = this.particles.filter(function (p) { return p.group < 0; });
      this._ambient();
      this._lastTargets = this._targets();
      this._populate(true);
    } else { this._fadeU = 0; this._ambient(); }
  };
  P.setParty = function (on, opts) { this._partyT = on ? 1 : 0; if (opts && opts.instant) this.party = this._partyT; this._ambient(); };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), mid: a._mid.slice(), bot: a._bot.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k, W = this.width;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, mid: m._mid, bot: m._bot, tint: m._tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._mid = C(f.mid, m._mid); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    a.skyTop = toHex(a._top); a.skyMid = toHex(a._mid); a.skyBottom = toHex(a._bot);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    var gy = this._skyBottom();
    a.light = a._light; a.sunA = a._sunA; a.dark = clamp(a._dark, 0, 0.12); a.darkness = a.dark;
    a.rain = clamp(a._rain, 0, 1); a.rainbow = clamp(a._rainbow, 0, 1);
    a.sunX = a._sunX * W; a.sunY = a._sunY * gy;
    a.windPx = this.wind; a.wind = clamp(Math.abs(this.wind) / 60, 0, 1); a.gust = this.gust;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- sky: clouds (a fixed set of 6; rain swaps in rain clouds)
  P._makeClouds = function () {
    var r = this.rng;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      this.clouds.push({ type: i % 2 ? 'cloud_b' : 'cloud_a', base: i % 2 ? 'cloud_b' : 'cloud_a', x: r.float(0, 1) * this.width, y0: 0, y: 0, s: r.float(0.55, 1.05), alpha: 0, flipX: r.chance(0.5),
        v: r.float(7, 16) * (r.chance(0.5) ? 1 : -1), yf: r.float(0.06, 0.3), ph: r.float(0, TAU), rank: i });
    }
  };
  P._stepSky = function (h) {
    var a = this.ambient, show = a._clouds, sb = this._skyBottom(), W = this.width, i;
    for (i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i], wHalf = 150 * c.s;
      c.y0 = Math.max(30 + 70 * c.s, c.yf * sb * 1.4);
      c.x += (c.v + 0.6 * this.wind) * h;
      if (c.x < -wHalf - 20) c.x = W + wHalf; else if (c.x > W + wHalf + 20) c.x = -wHalf;
      c.y = c.y0 + 4 * Math.sin(this.time * 0.2 + c.ph);
      var want = a._rainClouds > 0.5 && c.rank % 3 !== 2 ? 'cloud_rain' : c.base;
      var vis = clamp(show - c.rank, 0, 1) * (c.type === want ? 1 : 0);
      c.alpha += (vis * a._cloudA - c.alpha) * Math.min(1, h * 1.2);
      if (c.type !== want && c.alpha < 0.02) c.type = want;   // swap the sprite while it is invisible
    }
  };

  // ---------------------------------------------------------------- particles
  P._emitters = function (g) { return g < 4 ? MOODS[g].emitters : PARTY_EMIT; };
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, g, e;
    for (g = 0; g < 5; g++) {
      out[g] = [];
      var ramp = g < 4 ? this.ramp[g] * (1 - 0.5 * this.party) : this.party, em = this._emitters(g);
      for (e = 0; e < em.length; e++) { var t = em[e].count * k * ramp; out[g][e] = t; sum += t; }
    }
    var f = sum > AMBIENT_CAP ? AMBIENT_CAP / sum : 1;
    for (g = 0; g < 5; g++) for (e = 0; e < out[g].length; e++) out[g][e] = Math.floor(out[g][e] * f + 1e-9);
    return out;
  };
  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [], i, g, e;
    for (g = 0; g < 5; g++) { counts[g] = []; for (e = 0; e < tg[g].length; e++) counts[g][e] = 0; }
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.group >= 0 && !p.dying) counts[p.group][p.emitter]++; }
    for (g = 0; g < 5; g++) for (e = 0; e < tg[g].length; e++) {
      var have = counts[g][e], want = tg[g][e], n = anywhere ? want - have : Math.min(g < 4 && this._emitters(g)[e].kind === 'rain' ? 3 : 1, want - have);
      for (i = 0; i < n && this._count() < HARD_CAP; i++) this._spawn(g, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) { var q = this.particles[i]; if (q.group === g && q.emitter === e && !q.dying) { q.dying = true; extra--; } }
      }
    }
  };
  P._live = function (p) { var tg = this._lastTargets; return tg && tg[p.group] && tg[p.group][p.emitter] > 0; };
  /** Where a raindrop that falls at x lands: a random depth of the meadow (between the horizon and the ground). */
  P._hitY = function () { var a = this.horizonY, b = Math.max(a + 10, this.groundY); return a + (b - a) * Math.pow(this.rng.next(), 0.8); };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, G = this.groundY, H = this.height;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.1, 0.9) * G, size: r.float(em.size[0], em.size[1]), rot: 0,
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'fly':   // breezy: leaves / petals flying across with the wind, fluttering (tumble = flipX)
        p.x = anywhere ? r.float(-0.05, 1.05) * W : (this.wind < -2 ? W + 30 : -30); p.y = r.float(0.1, 0.85) * G;
        p.v = r.float(0.8, 1.25); p.sw = r.float(1.5, 3); p.spin = r.float(2, 5) * (r.chance(0.5) ? 1 : -1); p.flipW = r.float(3, 7); p.rot = r.float(0, TAU); p.flipX = 1;
        p.color = em.sprite === 'petal' ? r.pick(PETALS) : r.pick(LEAVES);
        break;
      case 'rain':   // fast streaks, slanted by the wind; a splash where they hit the meadow
        p.vy = r.float(1000, 1300); p.hitY = this._hitY(); p.x = r.float(-0.05, 1.15) * W;
        p.y = anywhere ? r.float(-60, p.hitY) : r.float(-80, -10);
        break;
      case 'mote':   // sun motes drifting up slowly in the warm light, swaying
        p.y = anywhere ? r.float(0.2, 0.95) * G : G - r.float(0, 60); p.vy = -r.float(8, 18); p.sway = r.float(10, 24); p.sw = r.float(0.4, 0.9);
        p.life = r.float(6, 11); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      case 'glint':   // sparkles (rainbow) / party stars: twinkle in place, then respawn elsewhere
        p.x0 = r.float(0.03, 0.97) * W; p.y0 = r.float(0.05, 0.75) * G; p.x = p.x0; p.y = p.y0;
        p.life = r.float(1.2, 2.6); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-0.8, 0.8); p.fade = 1;
        break;
      case 'butterfly':   // a few pale butterflies flutter over the meadow
        p.x0 = r.float(0.1, 0.9) * W; p.y0 = r.float(this.horizonY / Math.max(1, G), 0.9) * G; p.x = p.x0; p.y = p.y0; p.vx = r.float(18, 34) * (r.chance(0.5) ? 1 : -1);
        p.life = r.float(12, 22); p.age = anywhere ? r.float(0, p.life) : 0; p.flapW = r.float(9, 13);
        break;
      case 'fall':   // party confetti drifting down
        p.y = anywhere ? r.float(-0.05, 0.95) * H : -r.float(10, 40); p.vx = r.float(-20, 20); p.vy = r.float(50, 90); p.sway = r.float(20, 40); p.sw = r.float(1, 2.2);
        p.rotV = r.float(-4, 4); p.color = r.pick(CONFETTI); p.tumbleW = r.float(5, 11);
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  /** Particles that count toward the cap (the wipe sweep has its own +60). */
  P._count = function () { var n = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind !== 'sweep') n++; return n; };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && DK.PALETTE && DK.PALETTE[c] ? DK.PALETTE[c].base : c || null; }

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'sparkle', n = o.n || 12, r = this.rng, a, sp;
    for (var i = 0; i < n; i++) {
      if (this._count() >= HARD_CAP) this._dropOldest();
      var p = { type: 'sparkle', sprite: 'sparkle', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark',
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: tintOf(o.color) || null, rotV: 0, g: 0, life: 1 };
      switch (kind) {
        case 'confetti':
          p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
          if (!o.color) p.color = r.pick(CONFETTI);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(260, 560);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.rotV = r.float(-8, 8); p.tumbleW = r.float(6, 14); p.life = r.float(1.8, 2.6);
          break;
        case 'petals': case 'leaves':   // a soft puff: pop out, then sway down slowly
          p.sprite = kind === 'petals' ? 'petal' : 'leaf'; p.kind = 'puff'; p.size = r.float(12, 20);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(80, 230); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.life = r.float(1.2, 2); p.sway = r.float(20, 40); p.sw = r.float(2, 3.5); p.color = o.color ? tintOf(o.color) : r.pick(kind === 'petals' ? PETALS : LEAVES);
          break;
        case 'drops':   // water droplets (a splash): up and out, gravity
          p.sprite = 'dot'; p.kind = 'dot'; p.size = r.float(6, 12); p.color = o.color ? tintOf(o.color) : r.pick(WATER);
          a = r.float(-Math.PI * 0.92, -Math.PI * 0.08); sp = r.float(150, 380);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = r.float(0.45, 0.8); p.g = 900; p.rot = 0;
          break;
        case 'dots':
          p.sprite = 'dot'; p.kind = 'dot'; p.size = r.float(8, 16);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(120, 320);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = r.float(0.45, 0.8); p.g = 700; p.rot = 0;
          break;
        default:   // 'sparkle' | 'stars' | 'rainbow'
          p.sprite = kind === 'stars' ? 'star' : kind === 'rainbow' ? 'rainbow_sparkle' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
          a = r.float(0, TAU); sp = r.float(80, 240); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 'stars' ? 100 : 0);
          p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 300 : 0;
          if (!o.color && kind === 'stars') p.color = '#FFD54A';
      }
      p.type = p.sprite; p.s0 = p.size; p.r = p.size / 2;
      this.particles.push(p);
    }
  };

  /** The round wipe (DESIGN §5.2 / §5.3): ≈ 60 mood particles in a band that crosses the screen along dir in ≈ 1.1 s; they are
   *  extra (the ambient cap stays 120, the sweep adds ≤ 60) and die once off screen. */
  P.wipeParticles = function (dir) {
    dir = dir || { x: 1, y: 0 };
    var r = this.rng, W = this.width, H = this.height, d = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1, ux = dir.x / d, uy = dir.y / d;
    var px = -uy, py = ux, sprites = SWEEP[this.mood] || SWEEP[0];
    var ext = Math.abs(ux) * W + Math.abs(uy) * H, wid = Math.abs(px) * W + Math.abs(py) * H, cx = W / 2, cy = H / 2;
    var have = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'sweep') have++;
    var n = Math.min(SWEEP_CAP - have, 60);
    for (var k = 0; k < n; k++) {
      var along = -ext / 2 - r.float(30, 260), across = r.float(-0.55, 0.55) * wid, sp = (ext + 400) / r.float(0.95, 1.2);
      var p = { type: sprites[k % 2], sprite: sprites[k % 2], x: cx + ux * along + px * across, y: cy + uy * along + py * across,
        size: r.float(16, 30), rot: r.float(0, TAU), alpha: 0, layer: 'front', kind: 'sweep', group: -2, emitter: -1, a0: r.float(0.8, 1), fade: 1,
        dying: false, age: 0, vx: ux * sp, vy: uy * sp, color: null, ph: r.float(0, TAU), sway: r.float(20, 60), sw: r.float(3, 6), spin: r.float(-6, 6), life: 2.2 };
      if (p.sprite === 'mote') p.color = '#FFF2C4';
      if (p.sprite === 'leaf') p.color = r.pick(LEAVES);
      if (p.sprite === 'petal') p.color = r.pick(PETALS);
      if (p.sprite === 'raindrop') { p.rot = Math.atan2(-ux, uy || 1e-6); p.spin = 0; p.sway = 6; }
      p.s0 = p.size; p.r = p.size / 2;
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
    var k, ft = this.fadeTime, src = this.windSource;
    if (src && typeof src.wind === 'number' && isFinite(src.wind)) { this.wind = src.wind; this.gust = +src.gust || 0; }
    else if (this._wind) { this.wind = this._wind.step(h, this.mood); this.gust = this._wind.gust; this._wind.drain(); }
    else { this.wind = 6 * Math.sin(this.time * 0.6); this.gust = 0; }
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.party !== this._partyT) this.party = this._partyT > this.party ? Math.min(this._partyT, this.party + h / FADE_TIME) : Math.max(this._partyT, this.party - h / FADE_TIME);
    this._ambient();
    this._stepSky(h);
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._respawn = function (p) { this._kill(p); if (this._live(p)) this._spawn(p.group, p.emitter, false); };
  /** A raindrop's splash on the meadow: 1–2 tiny short-lived 'splash' sprites (count toward the cap). */
  P._rainSplash = function (x, y) {
    if (this._count() >= HARD_CAP - 2) return;
    var r = this.rng;
    this.particles.push({ type: 'splash', sprite: 'splash', x: x, y: y, size: r.float(12, 18), rot: 0, alpha: 0.8, layer: 'back', kind: 'splash', group: -1, emitter: -1,
      a0: 0.8, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: null, life: 0.3, s0: 14, r: 7 });
  };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, G = this.groundY, u, wind = this.wind;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'fly':
        p.x += (60 + 4.2 * Math.abs(wind) + 30 * this.gust) * (wind < -2 ? -1 : 1) * p.v * h;
        p.y += (Math.sin(p.ph + p.age * p.sw) * 40 + 10) * h;
        p.rot += (p.spin + this.gust * 3) * h; p.flipX = Math.cos(p.age * p.flipW + p.ph); p.alpha = p.a0 * p.fade;
        if (p.x > W + 40 || p.x < -40) { this._respawn(p); return; }
        if (p.y > G + 20) p.y = 0.1 * G; else if (p.y < -30) p.y = 0.5 * G;
        break;
      case 'rain': {
        var vx = -60 - 3 * wind;
        p.x += vx * h; p.y += p.vy * h; p.rot = -Math.atan2(vx, p.vy); p.alpha = p.a0 * p.fade;
        if (p.y >= p.hitY) {
          if (this.rng.chance(0.6)) this._rainSplash(p.x, p.hitY);
          this._respawn(p); return;
        }
        if (p.x < -30) p.x += W + 60;
        break;
      }
      case 'mote':
        u = p.age / p.life;
        if (u >= 1 || p.y < -20) { this._respawn(p); return; }
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + 0.8 * wind) * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'butterfly':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.x += (p.vx + 30 * Math.sin(p.age * 1.3 + p.ph) + 0.6 * wind) * h; p.y = p.y0 + 26 * Math.sin(p.age * 1.7 + p.ph) + 10 * Math.sin(p.age * 4.1);
        if (p.x < -30) { p.x = -30; p.vx = Math.abs(p.vx); } else if (p.x > W + 30) { p.x = W + 30; p.vx = -Math.abs(p.vx); }
        p.flipX = p.vx < 0 ? -1 : 1; p.flap = 0.5 + 0.5 * Math.sin(p.age * p.flapW); p.rot = 0.15 * Math.sin(p.age * 2);
        p.alpha = p.a0 * p.fade * Math.min(1, Math.sin(Math.PI * u) * 4);
        break;
      case 'fall':
        p.x += (p.vx + p.sway * Math.cos(p.ph + p.age * p.sw)) * h; p.y += p.vy * h; p.rot += p.rotV * h; p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = p.a0 * p.fade;
        if (p.y > H + 30) { this._respawn(p); return; }
        break;
      case 'sweep': {
        var nrm = Math.abs(p.vx) + Math.abs(p.vy) + 1e-6;
        p.x += (p.vx + (-p.vy / nrm) * p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.y += (p.vy + (p.vx / nrm) * p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.rot += p.spin * h;
        p.alpha = p.a0 * Math.min(1, p.age * 6);
        var off = (p.vx > 0 && p.x > W + 60) || (p.vx < 0 && p.x < -60) || (p.vy > 0 && p.y > H + 60) || (p.vy < 0 && p.y < -60);
        if (off || p.age > p.life) { this._kill(p); return; }
        break;
      }
      case 'splash':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.size = p.s0 * (0.7 + 0.6 * u); p.alpha = p.a0 * (1 - u);
        break;
      case 'confetti': {   // air drag: a quick slow-down, then a gentle tumbling fall
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.15, h);
        p.vx *= drag; p.vy = p.vy * drag + 520 * h;
        p.vx += (Math.sin(p.age * 5 + p.rotV) * 40 + 0.5 * wind) * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.05, h); p.vy = p.vy * Math.pow(0.05, h) + 60 * h;
        p.x += (p.vx + p.sway * Math.cos(p.ph + p.age * p.sw)) * h; p.y += p.vy * h; p.rot = 0.6 * Math.sin(p.ph + p.age * p.sw);
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : Math.min(1, u * 10);
        break;
      case 'dot':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) + p.g * h;
        p.x += p.vx * h; p.y += p.vy * h;
        p.size = p.s0 * (1 - 0.4 * u); p.alpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        break;
      case 'spark':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.08, h); p.vy = p.vy * Math.pow(0.08, h) + (p.g || 0) * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.6 + 0.6 * Math.sin(Math.PI * u)); p.alpha = Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.1));
        break;
    }
    p.r = p.size / 2;
  };

  DK.Weather = Weather;
})(window.DK = window.DK || {});
