/* Bun's Dino Dig — DD.Weather (headless, deterministic sky + ambient life for the dinosaur valley; DESIGN §5.3). Node-safe.
 *
 *   const wx = new DD.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWeather(i, { instant });     // 0 morning, 1 noon, 2 sunset, 3 night (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti + gold stars drift whatever the mood
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.addSand(x, y, n)                // sand clumps kicked up (world 'scoop' / 'fling')
 *   wx.addDust(x, y, n)                // a soft dust puff (world 'puff' / 'sandLand' / 'sandTap' / 'mole')
 *   wx.burst(x, y, { kind: 'confetti'|'sparkle'|'stars'|'feathers'|'dots'|'dust'|'sand'|'leaves', n, color })   // one-shot effects
 *   wx.ambient { skyTop, skyMid, skyBottom (hex), tint (rgba overlay for the scene | null), light 0..1 (overall brightness),
 *                night 0..1, sunX, sunY (logical px, centre), sunA 0..1, moonX, moonY, moonA 0..1, mist 0..1 (morning haze),
 *                glow 0..1 (night lantern glow over the field), mood 'morning'|'noon'|'sunset'|'night', moodIndex, env (= mood),
 *                envFrom, envMix 0..1 (crossfade from envFrom to env), party 0..1 }
 *   wx.clouds[] { type 'cloud_a'|'cloud_b', x, y (centre), s (scale of the 300×140 sprite), alpha, flipX }   slow drift
 *   wx.particles[] { type (= sprite: sand, dust, leaf_a, leaf_b, sparkle, star, firefly, mote, confetti_a, confetti_b, dot,
 *                    feather), sprite, x, y, size (drawn px, square), r (= size / 2), rot, alpha, layer 'back'|'front', kind,
 *                    color (hex tint | null), flipX? }  SCREEN px. 'back' = behind the mounds (ambient life, sky stars),
 *                    'front' = over everything (sand, dust, confetti, sparkles, feathers).
 */
(function (DD) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 56, REF_AREA = 1280 * 720, FADE_TIME = 2.5, N_CLOUDS = 6;
  var NAMES = ['morning', 'noon', 'sunset', 'night'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §3 skies per mood. sun / moon positions as fractions of (W, H); sunA / moonA visibility; clouds = how many of the 6 show.
  var MOODS = [
    { name: 'morning', top: '#BFE6F2', mid: '#DDEBE2', bottom: '#FBE9C9', tint: [255, 236, 205, 0.05],
      amb: { light: 0.95, night: 0, sunX: 0.16, sunY: 0.3, sunA: 1, moonX: 0.8, moonY: 0.1, moonA: 0, mist: 0.6, glow: 0, clouds: 3 },
      emitters: [{ kind: 'mote', sprite: 'mote', layer: 'back', count: 12, size: [8, 14], alpha: [0.45, 0.8], color: '#FFF3D0' },
        { kind: 'dew', sprite: 'sparkle', layer: 'back', count: 6, size: [10, 16], alpha: [0.55, 0.9], color: '#FFFFFF' }] },
    { name: 'noon', top: '#7CC7EE', mid: '#A6DAF2', bottom: '#CDEBF6', tint: null,
      amb: { light: 1, night: 0, sunX: 0.62, sunY: 0.12, sunA: 1, moonX: 0.8, moonY: 0.1, moonA: 0, mist: 0, glow: 0, clouds: 5 },
      emitters: [{ kind: 'fern', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 7, size: [16, 24], alpha: [0.8, 1] },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 4, size: [7, 12], alpha: [0.3, 0.55], color: '#FFFFFF' }] },
    { name: 'sunset', top: '#B98BB5', mid: '#F6A86B', bottom: '#F9D7A0', tint: [255, 150, 90, 0.1],
      amb: { light: 0.86, night: 0.15, sunX: 0.84, sunY: 0.4, sunA: 1, moonX: 0.2, moonY: 0.14, moonA: 0.15, mist: 0.15, glow: 0.2, clouds: 3 },
      emitters: [{ kind: 'mote', sprite: 'mote', layer: 'back', count: 12, size: [8, 14], alpha: [0.5, 0.85], color: '#FFD9A0' },
        { kind: 'fern', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 3, size: [16, 22], alpha: [0.75, 0.95] }] },
    { name: 'night', top: '#1F2A55', mid: '#2C3A6A', bottom: '#3E4C7E', tint: [30, 42, 95, 0.26],
      amb: { light: 0.58, night: 1, sunX: 0.84, sunY: 0.5, sunA: 0, moonX: 0.76, moonY: 0.15, moonA: 1, mist: 0, glow: 1, clouds: 1 },
      emitters: [{ kind: 'firefly', sprite: 'firefly', layer: 'back', count: 14, size: [10, 16], alpha: [0.6, 1], color: '#FFE88A' },
        { kind: 'twinkle', sprite: 'star', layer: 'back', count: 18, size: [8, 14], alpha: [0.5, 1], color: '#FFF6D8' }] }
  ];
  MOODS.forEach(function (m) { m._top = hex(m.top); m._mid = hex(m.mid); m._bot = hex(m.bottom); m._tint = m.tint || [255, 255, 255, 0]; });
  var NUM_KEYS = ['light', 'night', 'sunX', 'sunY', 'sunA', 'moonX', 'moonY', 'moonA', 'mist', 'glow', 'clouds'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], color: '#FFD54A' },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95], color: '#FFF6C8' }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var SAND = ['#E9CF9A', '#CFAE72', '#F6E3B9'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 14;
    this.rng = new DD.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['sand', 'dust', 'leaf_a', 'leaf_b', 'sparkle', 'star', 'firefly', 'mote', 'confetti_a', 'confetti_b', 'dot', 'feather'];
  Weather.SKY = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  /** The sky band (stars, clouds): above the far hills ≈ the top 40 % of the screen above the ground. */
  P._skyBottom = function () { return Math.min(this.groundY * 0.45, this.height * 0.42); };

  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.y0 !== undefined) p.y0 *= sy; if (p.landY !== undefined) p.landY *= sy; }
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
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k, W = this.width, H = this.height;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, mid: m._mid, bot: m._bot, tint: m._tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._mid = C(f.mid, m._mid); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    a.skyTop = toHex(a._top); a.skyMid = toHex(a._mid); a.skyBottom = toHex(a._bot);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.light = a._light; a.night = a._night; a.mist = a._mist; a.glow = a._glow;
    a.sunX = a._sunX * W; a.sunY = a._sunY * Math.min(H, this.groundY); a.sunA = a._sunA;
    a.moonX = a._moonX * W; a.moonY = a._moonY * Math.min(H, this.groundY); a.moonA = a._moonA;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- clouds (a fixed set of 6; how many show follows the mood)
  P._makeClouds = function () {
    var r = this.rng;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      var c = { type: i % 2 ? 'cloud_b' : 'cloud_a', x: r.float(0, 1) * this.width, y0: 0, y: 0, s: r.float(0.55, 1.05), alpha: 0, flipX: r.chance(0.5),
        v: r.float(7, 16) * (r.chance(0.5) ? 1 : -1), yf: r.float(0.06, 0.3), ph: r.float(0, TAU), rank: i };
      this.clouds.push(c);
    }
  };
  P._stepClouds = function (h) {
    var a = this.ambient, show = a._clouds, sb = this._skyBottom(), W = this.width;
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i], wHalf = 150 * c.s;
      c.y0 = Math.max(30 + 70 * c.s, c.yf * sb * 1.6);   // in the sky band, never cut by the top edge
      c.x += c.v * h;
      if (c.x < -wHalf - 20) c.x = W + wHalf; else if (c.x > W + wHalf + 20) c.x = -wHalf;
      c.y = c.y0 + 4 * Math.sin(this.time * 0.2 + c.ph);
      var vis = clamp(show - c.rank, 0, 1);
      var target = vis * (a._night > 0.5 ? 0.45 : 0.92);
      c.alpha += (target - c.alpha) * Math.min(1, h * 1.2);
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
    var em = this._emitters(g)[e], r = this.rng, W = this.width, G = this.groundY, sb = this._skyBottom();
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.1, 0.9) * G, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'mote':   // light motes drifting up slowly in the warm light, swaying
        p.y = anywhere ? r.float(0.2, 0.95) * G : G - r.float(0, 60); p.vy = -r.float(8, 18); p.sway = r.float(10, 24); p.sw = r.float(0.4, 0.9); p.rot = 0;
        p.life = r.float(6, 11); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      case 'dew':    // twinkles low over the ground (dew on the ferns)
        p.y = r.float(0.55, 0.98) * G; p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-1, 1);
        break;
      case 'fern':   // a fern bit carried by the breeze: drifts sideways, flutters and falls slowly
        p.y = anywhere ? r.float(0.1, 0.85) * G : r.float(0.05, 0.5) * G; p.x = anywhere ? r.float(0, W) : -20;
        p.vx = r.float(22, 42); p.vy = r.float(10, 22); p.sway = r.float(14, 28); p.sw = r.float(0.8, 1.5); p.spin = r.float(-1.2, 1.2);
        break;
      case 'firefly':   // wanders low over the field (smooth random walk), blinks
        p.y = r.float(0.45, 0.97) * G; p.x = r.float(0.05, 0.95) * W; p.y0 = p.y; p.vx = r.float(-18, 18); p.vy = r.float(-10, 10); p.rot = 0;
        p.blinkW = r.float(0.5, 1.1);
        break;
      case 'twinkle':   // a star in the sky band, twinkling
        p.y = r.float(0.03, 1) * sb; p.x = r.float(0.02, 0.98) * W; p.rot = 0; p.tw = r.float(1.2, 2.6);
        break;
      case 'glint':   // party stars / sparkles
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.05, 0.6) * this.height; p.rotV = r.float(-1, 1); p.fade = 1;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && DD.PALETTE && DD.PALETTE[c] ? DD.PALETTE[c].base : c || null; }

  P.addSand = function (x, y, n) { this.burst(x, y, { kind: 'sand', n: n || 8 }); };
  P.addDust = function (x, y, n) { this.burst(x, y, { kind: 'dust', n: n || 5 }); };

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 18, r = this.rng, a, sp;
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
        case 'sand':   // a sand clump: ballistic, bounces once on the ground
          p.sprite = 'sand'; p.kind = 'sand'; p.size = r.float(8, 16); if (!o.color) p.color = null;
          a = r.float(-Math.PI * 0.92, -Math.PI * 0.08); sp = r.float(160, 420);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 1400; p.rotV = r.float(-10, 10); p.life = r.float(0.8, 1.2); p.landY = y + r.float(0, 30); p.bounced = false;
          break;
        case 'dust':   // a soft puff: expands, rises a little, fades
          p.sprite = 'dust'; p.kind = 'dust'; p.size = r.float(16, 30); p.color = o.color ? tintOf(o.color) : r.pick(SAND);
          a = r.float(-Math.PI, 0); sp = r.float(30, 110);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6; p.life = r.float(0.5, 0.9); p.rotV = r.float(-1, 1);
          break;
        case 'feathers':   // tiny pterosaur feathers: pendulum fall
          p.sprite = 'feather'; p.kind = 'feather'; p.size = r.float(12, 18);
          a = r.float(0, TAU); sp = r.float(60, 180); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 60; p.life = r.float(1.4, 2.2); p.sway = r.float(20, 40);
          break;
        case 'leaves':
          p.sprite = r.chance(0.5) ? 'leaf_a' : 'leaf_b'; p.kind = 'feather'; p.size = r.float(14, 22);
          a = r.float(-Math.PI, 0); sp = r.float(80, 220); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = r.float(1.2, 1.8); p.sway = r.float(20, 40);
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
    var k, ft = this.fadeTime;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.party !== this._partyT) this.party = this._partyT > this.party ? Math.min(this._partyT, this.party + h / FADE_TIME) : Math.max(this._partyT, this.party - h / FADE_TIME);
    this._ambient();
    this._stepClouds(h);
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._respawn = function (p) { this._kill(p); if (this._live(p)) this._spawn(p.group, p.emitter, false); };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, G = this.groundY, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'mote': {
        u = p.age / p.life;
        if (u >= 1 || p.y < -20) { this._respawn(p); return; }
        p.x += p.sway * Math.cos(p.ph + p.age * p.sw) * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'dew': case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'fern': {   // drag-limited fall with a flutter (sideways pendulum) and spin
        var c = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.vx + p.sway * c) * h; p.y += p.vy * (0.7 + 0.5 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h;
        p.rot = 0.7 * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.2;
        p.alpha = p.a0 * p.fade * clamp((G - p.y) / 60, 0, 1);
        if (p.x > W + 30 || p.y > G) { this._respawn(p); return; }
        break;
      }
      case 'firefly': {   // a smooth random walk (velocity noise + drag + a pull back to its height band), blinking glow
        p.vx += Math.sin(p.ph + p.age * 1.7) * 24 * h + (this.rng.next() - 0.5) * 40 * h;
        p.vy += Math.cos(p.ph * 1.3 + p.age * 1.3) * 18 * h + (p.y0 - p.y) * 0.4 * h;
        p.vx *= Math.pow(0.5, h); p.vy *= Math.pow(0.5, h);
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        p.y = clamp(p.y, 0.3 * G, G - 4);
        var bl = Math.max(0, Math.sin(p.ph + p.age * TAU * p.blinkW * 0.5));
        p.alpha = p.a0 * p.fade * (0.15 + 0.85 * bl * bl);
        p.size = p.s0 * (0.8 + 0.3 * bl);
        break;
      }
      case 'twinkle':
        p.alpha = p.a0 * p.fade * (0.55 + 0.45 * Math.sin(p.ph + p.age * p.tw * TAU * 0.5));
        p.size = p.s0 * (0.85 + 0.2 * Math.sin(p.ph * 2 + p.age * p.tw * TAU * 0.5));
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
      case 'sand':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        if (!p.landed) {
          p.vy += p.g * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
          if (p.y >= p.landY && p.vy > 0) { p.y = p.landY; if (!p.bounced) { p.vy *= -0.25; p.vx *= 0.5; p.bounced = true; } else { p.landed = true; p.vx = p.vy = 0; } }
        }
        p.alpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        break;
      case 'dust':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.75 * (1 - u) * Math.min(1, u * 8);
        break;
      case 'feather': {   // pendulum fall at terminal speed
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) + 60 * h;
        p.x += (p.vx + p.sway * Math.cos(p.age * 4 + p.rot)) * h; p.y += (p.vy + 30) * h;
        p.rot = 0.8 * Math.sin(p.age * 4);
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      }
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

  DD.Weather = Weather;
})(window.DD = window.DD || {});
