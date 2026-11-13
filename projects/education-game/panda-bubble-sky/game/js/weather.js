/* Bao's Bubble Sky — PB.Weather (headless, deterministic sky + ambient life for the rainbow cloud land through the four seasons;
 * DESIGN §5.3). Node-safe.
 *
 *   const wx = new PB.Weather({ width, height, seed, groundY });
 *   wx.windSource = world;              // optional (recommended): follow the world's wind (world.wind / world.gust) so leaves and
 *                                       // bubbles move together; without it the weather runs its own PB.WindModel copy
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWeather(i, { instant });     // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti + gold stars drift whatever the season
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.wind                            // px/s² horizontal (spring / summer ±6 breeze, autumn gusts up to ±60, winter ±10)
 *   wx.gust                            // 0..1 gust envelope (autumn)
 *   wx.burst(x, y, { kind: 'stars'|'sparkle'|'confetti'|'petals'|'dots', n, color })   // one-shot effects
 *   wx.ambient { skyTop, skyMid, skyBottom (hex), tint (rgba overlay for the far / mid / ground layers only | null), light 0..1,
 *                sunX, sunY (logical px, centre), sunA 0..1, moonX, moonY, moonA (0: unused), starsA (0), glow (0),
 *                mood 'spring'|'summer'|'autumn'|'winter', moodIndex, env (= mood), envFrom, envMix 0..1 (crossfade from envFrom
 *                to env), party 0..1, frost 0..1 (winter: bubble rim frost) }
 *   wx.clouds[] { type 'cloud_a'|'cloud_b', x, y (centre), s (scale of the 300×140 sprite), alpha, flipX }   slow drift
 *   wx.particles[] { type (= sprite: petal, blossom, butterfly, glint, mote, leaf, snow, sparkle, star, confetti_a, confetti_b, dot),
 *                    sprite, x, y, size (drawn px), r (= size / 2), rot, alpha, layer 'back'|'front', kind, color (hex | null),
 *                    flipX?, flap? }  SCREEN px. 'back' = drawn behind the rainbow / bubbles (ambient life), 'front' = over
 *                    everything (bursts, party). Sprite files: particles/<type>.svg (DESIGN §4.4).
 */
(function (PB) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 56, REF_AREA = 1280 * 720, FADE_TIME = 2.5, N_CLOUDS = 6;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }
  function mix(a, b, u) { var p = hex(a), q = hex(b); return toHex([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]); }

  // DESIGN §3 skies per season. sun position as fractions of (W, H above the ground); clouds = how many of 6 show.
  var MOODS = [
    { name: 'spring', top: '#CFE6FA', bottom: '#FCEFF4', tint: [255, 214, 232, 0.05],
      amb: { light: 0.97, sunX: 0.2, sunY: 0.28, sunA: 1, frost: 0, clouds: 4, cloudA: 0.9 },
      emitters: [{ kind: 'petal', sprite: 'petal', layer: 'back', count: 9, size: [12, 18], alpha: [0.75, 1] },
        { kind: 'petal', sprite: 'blossom', layer: 'back', count: 4, size: [14, 20], alpha: [0.8, 1] },
        { kind: 'butterfly', sprite: 'butterfly', layer: 'back', count: 3, size: [18, 24], alpha: [0.85, 1] }] },
    { name: 'summer', top: '#86C9F0', bottom: '#E2F5FF', tint: null,
      amb: { light: 1, sunX: 0.62, sunY: 0.12, sunA: 1, frost: 0, clouds: 3, cloudA: 0.95 },
      emitters: [{ kind: 'glint', sprite: 'glint', layer: 'back', count: 6, size: [12, 20], alpha: [0.55, 0.9] },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 9, size: [7, 12], alpha: [0.35, 0.65], color: '#FFF6D8' }] },
    { name: 'autumn', top: '#F3C28F', bottom: '#FCEBD3', tint: [255, 160, 90, 0.08],
      amb: { light: 0.93, sunX: 0.8, sunY: 0.42, sunA: 0.9, frost: 0, clouds: 4, cloudA: 0.85 },
      emitters: [{ kind: 'leaf', sprite: 'leaf', layer: 'back', count: 12, size: [14, 22], alpha: [0.8, 1] },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 4, size: [7, 12], alpha: [0.3, 0.55], color: '#FFE2B8' }] },
    { name: 'winter', top: '#B7C8E4', bottom: '#EEF2F9', tint: [190, 210, 245, 0.1],
      amb: { light: 0.9, sunX: 0.75, sunY: 0.26, sunA: 0.55, frost: 1, clouds: 5, cloudA: 0.9 },
      emitters: [{ kind: 'snow', sprite: 'snow', layer: 'back', count: 30, size: [6, 13], alpha: [0.6, 0.95] }] }
  ];
  MOODS.forEach(function (m) { m.mid = mix(m.top, m.bottom, 0.5); m._top = hex(m.top); m._mid = hex(m.mid); m._bot = hex(m.bottom); m._tint = m.tint || [255, 255, 255, 0]; });
  var NUM_KEYS = ['light', 'sunX', 'sunY', 'sunA', 'frost', 'clouds', 'cloudA'];
  var PARTY_EMIT = [{ kind: 'twinkle', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], color: '#FFD54A' },
    { kind: 'fall', sprite: 'confetti_a', alt: 'confetti_b', layer: 'front', count: 14, size: [12, 18], alpha: [0.85, 1] }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var PETALS = ['#F4CADB', '#FBDDE8', '#F7B8CF'];
  var LEAVES = ['#D9A06A', '#C98A5E', '#E6B565', '#C2703F'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 14;
    this.rng = new PB.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.windSource = opts.windSource || null; this.wind = 0; this.gust = 0;
    this._wind = PB.WindModel ? new PB.WindModel(opts.seed !== undefined ? (opts.seed ^ 0x77) >>> 0 : 11) : null;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['petal', 'blossom', 'butterfly', 'glint', 'mote', 'leaf', 'snow', 'sparkle', 'star', 'confetti_a', 'confetti_b', 'dot'];
  Weather.SKY = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  P._skyBottom = function () { return Math.min(this.groundY * 0.5, this.height * 0.46); };

  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.y0 !== undefined) p.y0 *= sy; if (p.x0 !== undefined) p.x0 *= sx; }
    for (i = 0; i < this.clouds.length; i++) { var c = this.clouds[i]; c.x *= sx; c.y *= sy; c.y0 *= sy; }
    this.width = W; this.height = H;
    this.groundY = groundY !== undefined && isFinite(groundY) ? groundY : this.groundY * sy;
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
    var gy = Math.min(this.height, this.groundY);
    a.light = a._light; a.sunA = a._sunA; a.frost = a._frost;
    a.sunX = a._sunX * W; a.sunY = a._sunY * gy;
    a.moonX = 0.8 * W; a.moonY = 0.18 * gy; a.moonA = 0; a.starsA = 0; a.glow = 0;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- sky: clouds (a fixed set of 6)
  P._makeClouds = function () {
    var r = this.rng;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      this.clouds.push({ type: i % 2 ? 'cloud_b' : 'cloud_a', x: r.float(0, 1) * this.width, y0: 0, y: 0, s: r.float(0.55, 1.05), alpha: 0, flipX: r.chance(0.5),
        v: r.float(7, 16) * (r.chance(0.5) ? 1 : -1), yf: r.float(0.06, 0.3), ph: r.float(0, TAU), rank: i });
    }
  };
  P._stepSky = function (h) {
    var a = this.ambient, show = a._clouds, sb = this._skyBottom(), W = this.width, i;
    for (i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i], wHalf = 150 * c.s;
      c.y0 = Math.max(30 + 70 * c.s, c.yf * sb * 1.6);
      c.x += (c.v + 0.4 * this.wind) * h;
      if (c.x < -wHalf - 20) c.x = W + wHalf; else if (c.x > W + wHalf + 20) c.x = -wHalf;
      c.y = c.y0 + 4 * Math.sin(this.time * 0.2 + c.ph);
      var vis = clamp(show - c.rank, 0, 1);
      c.alpha += (vis * a._cloudA - c.alpha) * Math.min(1, h * 1.2);
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
      var have = counts[g][e], want = tg[g][e], n = anywhere ? want - have : Math.min(1, want - have);
      for (i = 0; i < n && this.particles.length < HARD_CAP; i++) this._spawn(g, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) { var q = this.particles[i]; if (q.group === g && q.emitter === e && !q.dying) { q.dying = true; extra--; } }
      }
    }
  };
  P._live = function (p) { var tg = this._lastTargets; return tg && tg[p.group] && tg[p.group][p.emitter] > 0; };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, G = this.groundY, H = this.height;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.1, 0.9) * G, size: r.float(em.size[0], em.size[1]), rot: 0,
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'petal':   // blossom petals tumbling across on the breeze, falling slowly
        p.x = anywhere ? r.float(-0.05, 1.05) * W : (this.wind < 0 ? W + 20 : -20); p.y = anywhere ? r.float(0.05, 0.9) * G : r.float(0.02, 0.5) * G;
        p.vx = r.float(25, 55); p.vy = r.float(10, 22); p.sway = r.float(14, 28); p.sw = r.float(1, 1.8); p.spin = r.float(-2.4, 2.4); p.rot = r.float(0, TAU);
        if (p.sprite === 'petal' && !p.color) p.color = null;
        void PETALS;
        break;
      case 'leaf':   // autumn leaves: blown by the wind, fluttering down
        p.x = anywhere ? r.float(-0.05, 1.05) * W : (this.wind < 0 ? W + 20 : -20); p.y = anywhere ? r.float(0.05, 0.9) * G : r.float(0.02, 0.55) * G;
        p.vx = r.float(30, 70); p.vy = r.float(18, 34); p.sway = r.float(18, 34); p.sw = r.float(1.2, 2.2); p.spin = r.float(-3, 3); p.rot = r.float(0, TAU);
        void LEAVES;
        break;
      case 'snow':   // soft snow: falls straight-ish, sways, drifts with the wind
        p.y = anywhere ? r.float(-0.02, 1) * G : -r.float(5, 40); p.vy = r.float(28, 60) * (0.6 + p.size / 20); p.sway = r.float(8, 20); p.sw = r.float(0.6, 1.4);
        break;
      case 'mote':   // light motes drifting up slowly in the warm light, swaying
        p.y = anywhere ? r.float(0.2, 0.95) * G : G - r.float(0, 60); p.vy = -r.float(8, 18); p.sway = r.float(10, 24); p.sw = r.float(0.4, 0.9);
        p.life = r.float(6, 11); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      case 'glint':   // summer sun glints: twinkle in place over the clouds
        p.x0 = r.float(0.03, 0.97) * W; p.y0 = r.float(0.15, 0.95) * G; p.x = p.x0; p.y = p.y0;
        p.life = r.float(1.6, 3.2); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-0.8, 0.8); p.fade = 1;
        break;
      case 'butterfly':   // spring: a few pale butterflies flutter over the cloud floor
        p.x0 = r.float(0.1, 0.9) * W; p.y0 = r.float(0.55, 0.9) * G; p.x = p.x0; p.y = p.y0; p.vx = r.float(18, 34) * (r.chance(0.5) ? 1 : -1);
        p.life = r.float(12, 22); p.age = anywhere ? r.float(0, p.life) : 0; p.flapW = r.float(9, 13);
        break;
      case 'twinkle':   // party stars
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.05, 0.6) * H; p.rotV = r.float(-1, 1); p.fade = 1;
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
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && PB.PALETTE && PB.PALETTE[c] ? PB.PALETTE[c].base : c || null; }

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'sparkle', n = o.n || 12, r = this.rng, a, sp;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      var p = { type: 'sparkle', sprite: 'sparkle', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark',
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: tintOf(o.color) || null, rotV: 0, g: 0, life: 1 };
      switch (kind) {
        case 'confetti':
          p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
          if (!o.color) p.color = r.pick(CONFETTI);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(260, 560);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.rotV = r.float(-8, 8); p.tumbleW = r.float(6, 14); p.life = r.float(1.8, 2.6);
          break;
        case 'petals':   // a soft puff of blossom petals: pop out, then sway down slowly
          p.sprite = r.chance(0.6) ? 'petal' : 'blossom'; p.kind = 'puff'; p.size = r.float(12, 18);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(80, 220); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.life = r.float(1.2, 2); p.sway = r.float(20, 40); p.sw = r.float(2, 3.5);
          break;
        case 'dots':
          p.sprite = 'dot'; p.kind = 'dot'; p.size = r.float(8, 16);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(120, 320);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = r.float(0.45, 0.8); p.g = 700; p.rot = 0;
          break;
        default:   // 'sparkle' | 'stars'
          p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
          a = r.float(0, TAU); sp = r.float(80, 240); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 'stars' ? 100 : 0);
          p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 300 : 0;
          if (!o.color && kind === 'stars') p.color = '#FFD54A';
      }
      p.type = p.sprite; p.s0 = p.size; p.r = p.size / 2;
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
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, G = this.groundY, u, wind = this.wind, c;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'petal': case 'leaf': {
        var push = p.kind === 'leaf' ? 3.2 : 2.2;   // px/s of drift per px/s² of wind
        c = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.vx * (wind < -2 ? -0.4 : 1) + push * wind + p.sway * c) * h;
        p.y += p.vy * (0.6 + 0.6 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h * (1 - 0.5 * this.gust);
        p.rot += p.spin * (1 + 2 * this.gust) * h;
        p.alpha = p.a0 * p.fade * clamp((G + 10 - p.y) / 50, 0, 1);
        if (p.x > W + 40 || p.x < -40 || p.y > G + 10) { this._respawn(p); return; }
        break;
      }
      case 'snow':
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + 1.6 * wind) * h; p.y += p.vy * h;
        if (p.x < -20) p.x = W + 10; else if (p.x > W + 20) p.x = -10;
        p.alpha = p.a0 * p.fade * clamp((G + 20 - p.y) / 60, 0, 1);
        if (p.y > G + 20) { this._respawn(p); return; }
        break;
      case 'mote':
        u = p.age / p.life;
        if (u >= 1 || p.y < -20) { this._respawn(p); return; }
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + 0.8 * wind) * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'glint': case 'twinkle':
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
      case 'confetti': {   // air drag: a quick slow-down, then a gentle tumbling fall
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.15, h);
        p.vx *= drag; p.vy = p.vy * drag + 520 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h;
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

  PB.Weather = Weather;
})(window.PB = window.PB || {});
