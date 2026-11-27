/* Tupi's Bakery Delivery — BD.Weather (headless, deterministic seasons for the bakery window + ambient life over the table;
 * DESIGN §5.3). Node-safe.
 *
 *   const wx = new BD.Weather({ width, height, seed, layout });
 *   wx.windSource = world;              // optional (recommended): follow the world's wind (world.wind / world.gust) so autumn gusts blow
 *                                       // the leaves in together with the world's `gust` event; else a BD.WindModel copy
 *   wx.resize(W, H, layout);           // world.layout (wall / table / play / bakery)
 *   wx.setWeather(i, { instant });     // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti + gold stars + hearts whatever the season
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.wind / wx.gust                  // px/s² horizontal / 0..1 gust envelope
 *   wx.burst(x, y, { kind: 'stars'|'sparkle'|'confetti'|'petals'|'leaves'|'hearts'|'crumbs'|'dots', n, color })   // one-shot effects
 *   wx.wipeParticles(dir)              // the round wipe: ≈ 60 seasonal particles + flour sweeping across along dir {x, y} in ≈ 1.1 s
 *                                      // (layer 'front', kind 'sweep'; + 60 over the cap while it runs)
 *   wx.window { x, y, w, h }           // where the window sits in the back wall (an estimate; render.js may use the env RECIPE instead)
 *   wx.ambient { skyTop, skyMid, skyBottom (hex), tint (rgba | null), light 0..1, sunX, sunY (px, inside the window), sunA, beam 0..1
 *                (warm light beams from the window over the table), mood 'spring'|'summer'|'autumn'|'winter', moodIndex, env, envFrom,
 *                envMix 0..1, party 0..1, frost 0..1 } — for the WINDOW / outside only: the table is never tinted (DESIGN §3)
 *   wx.clouds[] { type 'cloud_a'|'cloud_b', x, y (centre), s, alpha, flipX }   slow drift inside the window rect (render clips)
 *   wx.particles[] { type (= sprite: petal, blossom, butterfly, glint, mote, leaf, snow, sparkle, star, confetti_a, confetti_b, dot,
 *                    firefly, crumb, heart), sprite, x, y, size (px), r, rot, alpha, kind, color (hex | null), flipX?, flap?,
 *                    layer 'back'   — OUTSIDE, seen through the window: draw after the wall's sky, clipped to wx.window
 *                          'table'  — lying ON the table (settled petals / leaves, glints): draw after the roads, before the bakery
 *                          'front'  — in the air over everything }   SCREEN px.
 */
(function (BD) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, SWEEP_CAP = 60, AMBIENT_CAP = 56, REF_AREA = 1280 * 720, FADE_TIME = 2.5, N_CLOUDS = 4;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }
  function mix(a, b, u) { var p = hex(a), q = hex(b); return toHex([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]); }

  // DESIGN §3 window skies per season; sun as fractions of the window rect; beam = the warm light shafts over the table.
  var MOODS = [
    { name: 'spring', top: '#CFE6F5', bottom: '#F2CFD9', tint: [255, 214, 232, 0.05],
      amb: { light: 0.97, sunX: 0.25, sunY: 0.3, sunA: 1, frost: 0, clouds: 3, cloudA: 0.9, beam: 0.45 },
      emitters: [{ kind: 'petal', sprite: 'petal', layer: 'back', count: 6, size: [10, 15], alpha: [0.75, 1] },
        { kind: 'drift', sprite: 'petal', layer: 'front', count: 5, size: [12, 18], alpha: [0.8, 1] },
        { kind: 'drift', sprite: 'blossom', layer: 'front', count: 2, size: [14, 20], alpha: [0.8, 1] },
        { kind: 'butterfly', sprite: 'butterfly', layer: 'front', count: 1, size: [18, 24], alpha: [0.85, 1] }] },
    { name: 'summer', top: '#8CCBEA', bottom: '#D8EFC9', tint: null,
      amb: { light: 1, sunX: 0.7, sunY: 0.22, sunA: 1, frost: 0, clouds: 2, cloudA: 0.95, beam: 1 },
      emitters: [{ kind: 'mote', sprite: 'mote', layer: 'front', count: 10, size: [7, 12], alpha: [0.35, 0.65], color: '#FFF6D8' },
        { kind: 'glint', sprite: 'glint', layer: 'table', count: 4, size: [12, 18], alpha: [0.5, 0.85] }] },
    { name: 'autumn', top: '#F1C893', bottom: '#F7E2C2', tint: [255, 160, 90, 0.08],
      amb: { light: 0.93, sunX: 0.78, sunY: 0.5, sunA: 0.9, frost: 0, clouds: 3, cloudA: 0.85, beam: 0.55 },
      emitters: [{ kind: 'leaf', sprite: 'leaf', layer: 'back', count: 8, size: [10, 15], alpha: [0.8, 1] },
        { kind: 'drift', sprite: 'leaf', layer: 'front', count: 4, size: [14, 20], alpha: [0.85, 1] },
        { kind: 'mote', sprite: 'mote', layer: 'front', count: 3, size: [7, 11], alpha: [0.3, 0.5], color: '#FFE2B8' }] },
    { name: 'winter', top: '#B9C8E2', bottom: '#EEF2F8', tint: [190, 210, 245, 0.1],
      amb: { light: 0.9, sunX: 0.7, sunY: 0.3, sunA: 0.55, frost: 1, clouds: 4, cloudA: 0.9, beam: 0.25 },
      emitters: [{ kind: 'snow', sprite: 'snow', layer: 'back', count: 26, size: [5, 11], alpha: [0.6, 0.95] },
        { kind: 'mote', sprite: 'mote', layer: 'front', count: 4, size: [6, 10], alpha: [0.35, 0.6], color: '#FFFFFF' },
        { kind: 'steam', sprite: 'mote', layer: 'front', count: 4, size: [14, 22], alpha: [0.25, 0.45], color: '#FFFFFF' }] }
  ];
  MOODS.forEach(function (m) { m.mid = mix(m.top, m.bottom, 0.5); m._top = hex(m.top); m._mid = hex(m.mid); m._bot = hex(m.bottom); m._tint = m.tint || [255, 255, 255, 0]; });
  var NUM_KEYS = ['light', 'sunX', 'sunY', 'sunA', 'frost', 'clouds', 'cloudA', 'beam'];
  var PARTY_EMIT = [{ kind: 'twinkle', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], color: '#FFD54A' },
    { kind: 'fall', sprite: 'confetti_a', alt: 'confetti_b', layer: 'front', count: 14, size: [12, 18], alpha: [0.85, 1] },
    { kind: 'fall', sprite: 'heart', layer: 'front', count: 5, size: [14, 20], alpha: [0.8, 1] }];
  var SWEEP = [['petal', 'blossom'], ['mote', 'sparkle'], ['leaf', 'leaf'], ['snow', 'snow']];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var LEAVES = ['#D9A06A', '#C98A5E', '#E6B565', '#C2703F'];
  var CRUMBS = ['#C98A52', '#D9A86C', '#B5773F', '#E8C48E'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.layout = null; this.window = { x: 0, y: 0, w: 0, h: 0 }; this.wallH = 0.3 * this.height; this.table = null; this.bakery = null;
    this.rng = new BD.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.windSource = opts.windSource || null; this.wind = 0; this.gust = 0; this._lastGust = 0;
    this._wind = BD.WindModel ? new BD.WindModel(opts.seed !== undefined ? (opts.seed ^ 0x77) >>> 0 : 11) : null;
    this.ambient = {};
    this._setLayout(opts.layout || null);
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['petal', 'blossom', 'butterfly', 'glint', 'mote', 'leaf', 'snow', 'sparkle', 'star', 'confetti_a', 'confetti_b', 'dot', 'firefly', 'crumb', 'heart'];
  Weather.SWEEP_CAP = SWEEP_CAP;
  Weather.SKY = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  P._setLayout = function (L) {
    this.layout = L;
    var W = this.width, H = this.height;
    this.wallH = L && L.wall ? L.wall.h : 0.3 * H;
    this.table = L && L.table ? { x: L.table.x, y: L.table.y, w: L.table.w, h: L.table.h } : { x: 0, y: this.wallH, w: W, h: H - this.wallH };
    this.play = L && L.play ? L.play : { x0: 0, y0: this.table.y, x1: W, y1: H };
    this.bakery = L && L.bakery ? L.bakery : null;
    var ww = Math.min(0.42 * W, 1.7 * this.wallH), wh = 0.72 * this.wallH;
    this.window = { x: W / 2 - ww / 2, y: 0.12 * this.wallH, w: ww, h: wh };
  };
  /** resize(W, H, layout) — layout = world.layout. */
  P.resize = function (W, H, layout) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.y0 !== undefined) p.y0 *= sy; if (p.x0 !== undefined) p.x0 *= sx; if (p.floor !== undefined) p.floor *= sy; }
    this.width = W; this.height = H;
    this._setLayout(layout && typeof layout === 'object' ? layout : this.layout);
    for (i = 0; i < this.clouds.length; i++) this._placeCloud(this.clouds[i], true);
    // outside particles now outside the window band fade quietly
    for (i = 0; i < this.particles.length; i++) { var q = this.particles[i]; if (q.layer === 'back' && q.y > this.wallH + 10) q.dying = true; }
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
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k, Wn = this.window;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, mid: m._mid, bot: m._bot, tint: m._tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._mid = C(f.mid, m._mid); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    a.skyTop = toHex(a._top); a.skyMid = toHex(a._mid); a.skyBottom = toHex(a._bot);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.light = a._light; a.sunA = a._sunA; a.frost = a._frost; a.beam = a._beam;
    a.sunX = Wn.x + a._sunX * Wn.w; a.sunY = Wn.y + a._sunY * Wn.h;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  // ---------------------------------------------------------------- outside: clouds in the window
  P._makeClouds = function () {
    var r = this.rng;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      var c = { type: i % 2 ? 'cloud_b' : 'cloud_a', x: 0, y: 0, s: r.float(0.3, 0.5), alpha: 0, flipX: r.chance(0.5), v: r.float(5, 11) * (r.chance(0.5) ? 1 : -1), fx: r.float(0, 1), fy: r.float(0.12, 0.45), ph: r.float(0, TAU), rank: i };
      this._placeCloud(c, true);
      this.clouds.push(c);
    }
  };
  P._placeCloud = function (c, init) { var Wn = this.window; if (init) c.x = Wn.x + c.fx * Wn.w; c.y0 = Wn.y + c.fy * Wn.h; c.y = c.y0; };
  P._stepSky = function (h) {
    var a = this.ambient, show = a._clouds, Wn = this.window;
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i], wHalf = 150 * c.s;
      c.x += (c.v + 0.3 * this.wind) * h;
      if (c.x < Wn.x - wHalf) c.x = Wn.x + Wn.w + wHalf; else if (c.x > Wn.x + Wn.w + wHalf) c.x = Wn.x - wHalf;
      c.y = c.y0 + 3 * Math.sin(this.time * 0.2 + c.ph);
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
      // autumn leaves blow in mostly on a gust
      if (!anywhere && g === 2 && this._emitters(g)[e].kind === 'drift' && this.gust < 0.3 && this.rng.chance(0.97)) n = 0;
      for (i = 0; i < n && this._count() < HARD_CAP; i++) this._spawn(g, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) { var q = this.particles[i]; if (q.group === g && q.emitter === e && !q.dying) { q.dying = true; extra--; } }
      }
    }
  };
  P._live = function (p) { var tg = this._lastTargets; return tg && tg[p.group] && tg[p.group][p.emitter] > 0; };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, H = this.height, Wn = this.window, wallH = this.wallH, T = this.table, PL = this.play;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0, H), size: r.float(em.size[0], em.size[1]), rot: 0,
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'petal': case 'leaf': case 'snow':   // OUTSIDE (seen through the window): drifting down / across the window band
        p.x = Wn.x + r.float(-0.05, 1.05) * Wn.w; p.y = anywhere ? Wn.y + r.float(0, 1) * Wn.h : Wn.y - r.float(5, 30);
        p.vx = em.kind === 'snow' ? 0 : r.float(-10, 22); p.vy = em.kind === 'snow' ? r.float(18, 36) * (0.6 + p.size / 16) : r.float(12, 26);
        p.sway = r.float(8, 20); p.sw = r.float(0.8, 1.8); p.spin = em.kind === 'snow' ? 0 : r.float(-2.4, 2.4); p.rot = r.float(0, TAU);
        if (em.kind === 'leaf') p.color = r.pick(LEAVES);
        break;
      case 'drift': {   // INSIDE: in through the window, tumbling down over the table, settling on it (layer 'table'), then fading
        p.x = anywhere ? r.float(PL.x0, PL.x1) : Wn.x + r.float(0.1, 0.9) * Wn.w; p.y = anywhere ? r.float(wallH, PL.y1) : Wn.y + Wn.h * r.float(0.5, 1);
        p.vx = r.float(-30, 30) + (g === 2 ? 40 * (this.wind >= 0 ? 1 : -1) : 0); p.vy = r.float(22, 40);
        p.sway = r.float(14, 30); p.sw = r.float(1.2, 2.2); p.spin = r.float(-2.6, 2.6); p.rot = r.float(0, TAU);
        p.floor = r.float(T.y + 0.1 * T.h, PL.y1 - 6); p.rest = r.float(4, 8);
        if (p.sprite === 'leaf') p.color = r.pick(LEAVES);
        if (anywhere && r.chance(0.5)) { p.y = p.floor; p.layer = 'table'; p.settled = true; p.restT = r.float(0, p.rest); p.vx = p.vy = 0; }
        break;
      }
      case 'mote':   // INSIDE: dust / flour motes drifting up slowly in the warm light
        p.x = r.float(0.03, 0.97) * W; p.y = anywhere ? r.float(wallH * 0.6, PL.y1) : PL.y1 - r.float(0, 60); p.vy = -r.float(6, 14); p.sway = r.float(10, 24); p.sw = r.float(0.4, 0.9);
        p.life = r.float(6, 11); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      case 'steam': {   // winter: steam curls rising from the bakery chimney / oven
        var B = this.bakery || { x: 40, y: H - 220, w: 200, h: 180 };
        p.x0 = B.x + B.w * r.float(0.55, 0.8); p.y0 = B.y + 6; p.x = p.x0; p.y = p.y0; p.life = r.float(2.2, 3.4); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      }
      case 'glint': {   // summer: sun glints twinkling on the table (icing, sugar)
        p.x0 = r.float(PL.x0 + 20, PL.x1 - 20); p.y0 = r.float(T.y + 20, PL.y1 - 10); p.x = p.x0; p.y = p.y0;
        p.life = r.float(1.6, 3.2); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-0.8, 0.8); p.fade = 1;
        break;
      }
      case 'butterfly':   // spring: one pale butterfly flutters in over the table
        p.x0 = r.float(0.1, 0.9) * W; p.y0 = r.float(wallH, 0.6 * H); p.x = p.x0; p.y = p.y0; p.vx = r.float(18, 34) * (r.chance(0.5) ? 1 : -1);
        p.life = r.float(12, 22); p.age = anywhere ? r.float(0, p.life) : 0; p.flapW = r.float(9, 13);
        break;
      case 'twinkle':   // party stars
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.05, 0.6) * H; p.rotV = r.float(-1, 1); p.fade = 1;
        break;
      case 'fall':   // party confetti / hearts drifting down
        p.y = anywhere ? r.float(-0.05, 0.95) * H : -r.float(10, 40); p.vx = r.float(-20, 20); p.vy = r.float(50, 90); p.sway = r.float(20, 40); p.sw = r.float(1, 2.2);
        p.rotV = r.float(-4, 4); p.color = p.sprite === 'heart' ? null : r.pick(CONFETTI); p.tumbleW = r.float(5, 11);
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  /** Particles that count toward the cap (the wipe sweep has its own + 60). */
  P._count = function () { var n = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind !== 'sweep') n++; return n; };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && BD.PALETTE && BD.PALETTE[c] ? BD.PALETTE[c].base : c || null; }

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
        case 'petals': case 'leaves':   // a soft puff of blossom petals / autumn leaves: pop out, then sway down slowly
          p.sprite = kind === 'leaves' ? 'leaf' : r.chance(0.6) ? 'petal' : 'blossom'; p.kind = 'puff'; p.size = r.float(12, 19);
          a = r.float(-Math.PI * 0.95, -Math.PI * 0.05); sp = r.float(80, 220); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.life = r.float(1.2, 2); p.sway = r.float(20, 40); p.sw = r.float(2, 3.5);
          if (kind === 'leaves') p.color = o.color ? tintOf(o.color) : r.pick(LEAVES);
          break;
        case 'hearts':   // soft pink hearts floating up (a delivery, a happy friend)
          p.sprite = 'heart'; p.kind = 'rise'; p.size = r.float(14, 22);
          p.vx = r.float(-60, 60); p.vy = -r.float(60, 140); p.life = r.float(1.0, 1.6); p.sway = r.float(10, 24); p.sw = r.float(2, 3.5); p.color = o.color ? tintOf(o.color) : null;
          break;
        case 'crumbs':   // biscuit crumbs: a little puff that falls and bounces once on the table
          p.sprite = 'crumb'; p.kind = 'crumb'; p.size = r.float(6, 11); p.color = o.color ? tintOf(o.color) : r.pick(CRUMBS);
          a = r.float(-Math.PI * 0.9, -Math.PI * 0.1); sp = r.float(90, 240); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.g = 900; p.floor = y + r.float(4, 18); p.life = r.float(0.7, 1.1); p.rotV = r.float(-8, 8); p.bounced = false;
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

  /** The round wipe (DESIGN §5.2 / §5.3): ≈ 60 seasonal particles + flour in a band crossing the screen along dir in ≈ 1.1 s; extra
   *  over the cap (≤ 60), they die once off screen. */
  P.wipeParticles = function (dir) {
    dir = dir || { x: 1, y: 0 };
    var r = this.rng, W = this.width, H = this.height, d = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1, ux = dir.x / d, uy = dir.y / d;
    var px = -uy, py = ux, sprites = SWEEP[this.mood] || SWEEP[0];
    var ext = Math.abs(ux) * W + Math.abs(uy) * H, wid = Math.abs(px) * W + Math.abs(py) * H, cx = W / 2, cy = H / 2;
    var have = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'sweep') have++;
    var n = Math.min(SWEEP_CAP - have, 60);
    for (var k = 0; k < n; k++) {
      var along = -ext / 2 - r.float(30, 260), across = r.float(-0.55, 0.55) * wid, sp = (ext + 400) / r.float(0.95, 1.2);
      var flour = k % 4 === 3, spr = flour ? 'mote' : sprites[k % 2];
      var p = { type: spr, sprite: spr, x: cx + ux * along + px * across, y: cy + uy * along + py * across,
        size: flour ? r.float(22, 40) : r.float(16, 30), rot: r.float(0, TAU), alpha: 0, layer: 'front', kind: 'sweep', group: -2, emitter: -1, a0: flour ? r.float(0.5, 0.8) : r.float(0.8, 1), fade: 1,
        dying: false, age: 0, vx: ux * sp, vy: uy * sp, color: flour ? '#FFFFFF' : null, ph: r.float(0, TAU), sway: r.float(20, 60), sw: r.float(3, 6), spin: r.float(-6, 6), life: 2.2 };
      if (this.mood === 1 && p.sprite === 'mote' && !flour) p.color = '#FFF2C4';
      if (p.sprite === 'leaf') p.color = r.pick(LEAVES);
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
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, u, wind = this.wind, c, Wn = this.window;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'petal': case 'leaf': case 'snow': {   // outside the window
        c = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.vx + (p.kind === 'snow' ? 1.2 : 2.2) * wind + p.sway * c) * h; p.y += p.vy * h; p.rot += p.spin * (1 + 2 * this.gust) * h;
        p.alpha = p.a0 * p.fade * clamp((Wn.y + Wn.h + 10 - p.y) / 30, 0, 1);
        if (p.y > Wn.y + Wn.h + 10 || p.x < Wn.x - 60 || p.x > Wn.x + Wn.w + 60) { this._respawn(p); return; }
        break;
      }
      case 'drift': {   // inside: tumbling down, then lying on the table a while
        if (p.settled) {
          p.restT += h;
          p.alpha = p.a0 * p.fade * clamp((p.rest - p.restT) / 1.2, 0, 1);
          if (p.restT >= p.rest) { this._respawn(p); return; }
          break;
        }
        c = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.vx + 3 * wind + p.sway * c) * h;
        p.y += p.vy * (0.6 + 0.6 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h * (1 - 0.4 * this.gust);
        p.rot += p.spin * (1 + 2 * this.gust) * h;
        p.alpha = p.a0 * p.fade;
        if (p.y >= p.floor) { p.y = p.floor; p.settled = true; p.layer = 'table'; p.restT = 0; p.vx = p.vy = 0; p.spin = 0; }   // slid and settled
        if (p.x > W + 40 || p.x < -40) { this._respawn(p); return; }
        break;
      }
      case 'mote':
        u = p.age / p.life;
        if (u >= 1 || p.y < -20) { this._respawn(p); return; }
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + 0.8 * wind) * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'steam':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.x = p.x0 + 14 * Math.sin(p.ph + p.age * 2.2) * u + 0.5 * wind * p.age; p.y = p.y0 - 70 * u;
        p.size = p.s0 * (0.6 + 0.8 * u); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'glint': case 'twinkle':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'sweep': {
        p.x += (p.vx + (-p.vy / (Math.abs(p.vx) + Math.abs(p.vy) + 1e-6)) * p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.y += (p.vy + (p.vx / (Math.abs(p.vx) + Math.abs(p.vy) + 1e-6)) * p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.rot += p.spin * h;
        p.alpha = p.a0 * Math.min(1, p.age * 6);
        var off = (p.vx > 0 && p.x > W + 60) || (p.vx < 0 && p.x < -60) || (p.vy > 0 && p.y > H + 60) || (p.vy < 0 && p.y < -60);
        if (off || p.age > p.life) { this._kill(p); return; }
        break;
      }
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
      case 'rise':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.2, h); p.vy *= Math.pow(0.5, h);
        p.x += (p.vx + p.sway * Math.cos(p.ph + p.age * p.sw)) * h; p.y += p.vy * h; p.rot = 0.25 * Math.sin(p.ph + p.age * p.sw);
        p.size = p.s0 * (0.7 + 0.5 * Math.min(1, u * 3)); p.alpha = u > 0.65 ? (1 - u) / 0.35 : Math.min(1, u * 8);
        break;
      case 'crumb':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vy += p.g * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        if (p.vy > 0 && p.y >= p.floor) { p.y = p.floor; if (!p.bounced) { p.bounced = true; p.vy *= -0.3; p.vx *= 0.5; p.rotV *= 0.4; } else { p.vy = 0; p.vx *= 0.8; p.rotV = 0; } }
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
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

  BD.Weather = Weather;
})(window.BD = window.BD || {});
