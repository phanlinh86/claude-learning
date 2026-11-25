/* Tumi's Flower Farm — FT.Weather (headless, deterministic OUTDOOR seasons over the whole farm scene; DESIGN §5.1). Node-safe.
 *
 *   const wx = new FT.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWindows(rects)               // legacy no-op (outdoors: no windows; kept so old callers do not break)
 *   wx.setOven(x, y)                   // legacy no-op (no oven steam outdoors)
 *   wx.setWeather(i, { instant });     // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: sparkles + stars drift whatever the season
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.addSplash(x, y, hex, n)         // a petal shower (butterfly tap / finish); hex or palette name; null = mixed petals
 *   wx.addPuff(x, y, n)                // a puff of straw bits (chick / hay tap, a landing)
 *   wx.burst(x, y, { kind: 'confetti'|'sparkle'|'stars'|'petals'|'sprinkles' (= petals)|'straw'|'flour' (= straw)|
 *                          'crumbs' (soil crumbs)|'drops' (water), n, color })
 *   wx.particles[] { type (= sprite), sprite, x, y, size (drawn px, square), r, rot, alpha, layer 'back'|'front', kind,
 *                    color (hex tint | null), outside (always false), flipX?, sy? }  SCREEN px.
 *       sprite ∈ Weather.SPRITES = particles/<sprite>.svg (32×32). 'back' = the air of the scene (behind the bed), 'front' =
 *       over everything (petal showers, confetti, straw puffs).
 *       Ambient kinds: 'seed' (dandelion fluff, always), 'pollen' (soft dots, always), 'petal' (spring), 'glint' (summer
 *       sparkles), 'leaf' (autumn, blown by gusts), 'snow' (winter). They live over the whole screen (no clipping).
 *   wx.gust 0..1   wind gust envelope (a gust every 6–10 s, ≈ 2.6 s long; full strength in autumn, a soft breeze otherwise)
 *   wx.wind        current horizontal wind px/s (base breeze + gust push) — everything airborne drifts with it
 *   wx.ambient { skyTop, skyBottom (hex: the sky gradient), wall (= skyBottom, legacy), sky (= skyTop, legacy), floor (hex: the
 *                meadow below the ground layer), tint (rgba | null: a light overlay), light 0..1 (overall brightness),
 *                lightBars 0..1 (alpha of env/light.svg sun rays), warmLights (0, legacy), mood 'spring'|'summer'|'autumn'|
 *                'winter', moodIndex, env (= mood), envFrom, envMix 0..1, party 0..1, gust 0..1 }
 */
(function (FT) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 60, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §3 farm per season (calm, sunny, a little desaturated so the flowers pop). breeze = base wind px/s, gustK = gust
  // strength (autumn = full), seeds + pollen always drift.
  var MOODS = [
    { name: 'spring', skyTop: '#9FD3EC', skyBottom: '#E6F5F2', floor: '#7FAE5E', tint: [255, 214, 230, 0.03], amb: { light: 0.95, lightBars: 0.5, warmLights: 0 },
      breeze: 10, gustK: 0.3,
      emitters: [{ kind: 'petal', sprite: 'petal', layer: 'back', count: 10, size: [14, 20], alpha: [0.85, 1], colors: ['#FFFFFF', '#FFD3E2', '#FFC2D6', '#FFE6EE'] },
        { kind: 'seed', sprite: 'seed', layer: 'back', count: 4, size: [16, 24], alpha: [0.7, 0.95] },
        { kind: 'pollen', sprite: 'pollen', layer: 'back', count: 8, size: [5, 9], alpha: [0.35, 0.65], color: '#FFF3B0' }] },
    { name: 'summer', skyTop: '#86C8EE', skyBottom: '#E2F4F6', floor: '#78A957', tint: [255, 240, 200, 0.04], amb: { light: 1, lightBars: 1, warmLights: 0 },
      breeze: 6, gustK: 0.15,
      emitters: [{ kind: 'glint', sprite: 'sparkle', layer: 'back', count: 9, size: [10, 18], alpha: [0.55, 0.9] },
        { kind: 'pollen', sprite: 'pollen', layer: 'back', count: 12, size: [5, 9], alpha: [0.4, 0.7], color: '#FFE98A' },
        { kind: 'seed', sprite: 'seed', layer: 'back', count: 3, size: [16, 24], alpha: [0.7, 0.95] }] },
    { name: 'autumn', skyTop: '#E9C79A', skyBottom: '#F6E6CF', floor: '#A39A55', tint: [255, 190, 120, 0.06], amb: { light: 0.88, lightBars: 0.45, warmLights: 0 },
      breeze: 14, gustK: 1,
      emitters: [{ kind: 'leaf', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 10, size: [18, 26], alpha: [0.85, 1] },
        { kind: 'seed', sprite: 'seed', layer: 'back', count: 3, size: [16, 22], alpha: [0.65, 0.9] },
        { kind: 'pollen', sprite: 'pollen', layer: 'back', count: 4, size: [5, 8], alpha: [0.3, 0.55], color: '#FFE2B0' }] },
    { name: 'winter', skyTop: '#B9CFE3', skyBottom: '#EEF3F7', floor: '#CFDDD8', tint: [200, 220, 255, 0.05], amb: { light: 0.85, lightBars: 0.15, warmLights: 0 },
      breeze: 8, gustK: 0.3,
      emitters: [{ kind: 'snow', sprite: 'snow', layer: 'back', count: 22, size: [8, 16], alpha: [0.75, 1] },
        { kind: 'seed', sprite: 'seed', layer: 'back', count: 2, size: [14, 20], alpha: [0.6, 0.85] },
        { kind: 'pollen', sprite: 'pollen', layer: 'back', count: 3, size: [4, 7], alpha: [0.3, 0.5], color: '#FFFFFF' }] }
  ];
  MOODS.forEach(function (m) { m._top = hex(m.skyTop); m._bot = hex(m.skyBottom); m._floor = hex(m.floor); });
  var NUM_KEYS = ['light', 'lightBars', 'warmLights'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], gold: true, anywhere: true },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95], anywhere: true }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var PETALS = ['#E84A4A', '#FF9A2E', '#FFD23F', '#FF8FC0', '#8E44AD', '#3C8DE8', '#FFFFFF', '#FFD3E2'];
  var GLINT = ['#FFF6C8', '#FFFFFF', '#FFE7A8'];
  // how strongly each kind is pushed by the wind (1 = moves with the air)
  var WIND_K = { petal: 0.75, leaf: 1, seed: 1.15, pollen: 0.6, snow: 0.45 };
  var GUST = { every: [6, 10], dur: 2.6, push: 170 };   // s between gusts, gust length s, extra wind px/s at full gust

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 18;
    this.rng = new FT.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = [];
    this.mood = 0; this.weather = 0; this.season = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.windows = []; this.oven = null;   // legacy (outdoors: nothing to clip to)
    this.gust = 0; this.wind = 0; this._gustT = -1; this._gustNext = this.rng.float(GUST.every[0], GUST.every[1]) * 0.5;
    this.ambient = {};
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME; Weather.GUST = GUST;
  Weather.SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'seed', 'pollen', 'drop', 'straw', 'confetti_a', 'confetti_b', 'butterfly_s'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  /** Outdoors there are no windows: kept as a harmless no-op (render no longer calls it). */
  P.setWindows = function () {};
  P.setOven = function () {};
  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; }
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
    this.mood = this.weather = this.season = i;
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
    var s = { top: a._top.slice(), bot: a._bot.slice(), floor: a._floor.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, bot: m._bot, floor: m._floor, tint: m.tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._bot = C(f.bot, m._bot); a._floor = C(f.floor, m._floor);
    a._tint = [L(f.tint[0], m.tint[0]), L(f.tint[1], m.tint[1]), L(f.tint[2], m.tint[2]), L(f.tint[3], m.tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    a.skyTop = toHex(a._top); a.skyBottom = toHex(a._bot); a.floor = toHex(a._floor);
    a.wall = a.skyBottom; a.sky = a.skyTop;   // legacy names
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.party = this.party; a.gust = this.gust;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
    a.season = a.mood; a.seasonIndex = this.mood;
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
  /** An ambient particle somewhere over the WHOLE scene (anywhere = on screen already; else it enters from the top / the
   *  upwind edge for fallers, or fades in where it is for floaters). */
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, H = this.height;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.04, 0.85) * H, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU), outside: false };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'snow': case 'petal': case 'leaf':   // fallers: from above the top edge (or the upwind side in a breeze)
        if (anywhere) p.y = r.float(-20, H - 20);
        else if (Math.abs(this.wind) > 40 && r.chance(0.4)) { p.x = this.wind > 0 ? -20 : W + 20; p.y = r.float(0, 0.6) * H; }
        else p.y = -r.float(10, 40);
        if (em.kind === 'snow') { p.vy = r.float(26, 46); p.sway = r.float(6, 14); p.sw = r.float(0.6, 1.2); p.spin = r.float(-0.4, 0.4); p.color = null; }
        else {
          p.vx = r.float(-14, 14); p.vy = em.kind === 'leaf' ? r.float(30, 44) : r.float(18, 30); p.sway = r.float(22, 42); p.sw = r.float(0.5, 1.0); p.spin = r.float(-0.6, 0.6);
          if (em.colors) p.color = r.pick(em.colors);
        }
        break;
      case 'seed':   // dandelion fluff: floats, rides the wind, very slow sink / lift, long life
        p.life = r.float(9, 15); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.08, 0.75) * H;
        p.vx = r.float(-6, 6); p.vy = r.float(-4, 4); p.sw = r.float(0.3, 0.7); p.color = null;
        break;
      case 'pollen':   // soft glowing dots in the sun (Brownian drift)
        p.life = r.float(5, 10); p.age = anywhere ? r.float(0, p.life) : 0;
        p.vx = r.float(-5, 5); p.vy = r.float(-3, 3); p.sw = r.float(0.3, 0.8);
        break;
      case 'glint':   // summer sparkles in the sunny air / party stars anywhere
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-1, 1);
        p.y = em.anywhere ? r.float(0.05, 0.6) * H : r.float(0.05, 0.8) * H;
        p.color = em.gold ? '#FFD54A' : r.pick(GLINT); p.fade = 1;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && FT.PALETTE && FT.PALETTE[c] ? FT.PALETTE[c].base : c || null; }

  /** A petal shower (butterfly tap, finish): tinted petals flutter out and down. */
  P.addSplash = function (x, y, color, n) { this.burst(x, y, { kind: 'petals', n: n || 14, color: tintOf(color) }); };
  /** A puff of straw bits (chick / hay tap, a landing). */
  P.addPuff = function (x, y, n) { this.burst(x, y, { kind: 'straw', n: n || 10 }); };

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 18, r = this.rng;
    if (kind === 'sprinkles') kind = 'petals';
    if (kind === 'flour') kind = 'straw';
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      var p = { type: 'sparkle', sprite: 'sparkle', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark', outside: false,
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, rotV: 0, g: 0, life: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
        if (!o.color) p.color = r.pick(CONFETTI);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(260, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-8, 8); p.tumbleW = r.float(6, 14); p.life = r.float(1.8, 2.6);
      } else if (kind === 'petals') {   // petals burst out, then flutter down slowly (strong air drag, sway, tumble)
        p.sprite = 'petal'; p.kind = 'petalfx'; p.size = r.float(13, 19);
        if (!o.color) p.color = r.pick(PETALS);
        var a1 = r.float(-Math.PI * 0.95, -Math.PI * 0.05), s1 = r.float(140, 320);
        p.vx = Math.cos(a1) * s1; p.vy = Math.sin(a1) * s1; p.rotV = r.float(-5, 5); p.ph = r.float(0, TAU); p.tumbleW = r.float(4, 9); p.life = r.float(1.3, 1.9);
      } else if (kind === 'straw') {   // straw bits: pop out, gravity + drag, spin; a touch of dust
        p.sprite = 'straw'; p.kind = 'straw'; p.size = r.float(12, 20); p.color = null;
        var a2 = r.float(-Math.PI * 0.9, -Math.PI * 0.1), s2 = r.float(90, 260); p.vx = Math.cos(a2) * s2; p.vy = Math.sin(a2) * s2; p.g = 700; p.rotV = r.float(-9, 9); p.life = r.float(0.7, 1.1);
      } else if (kind === 'crumbs') {   // soil crumbs (a carrot pops up)
        p.sprite = 'pollen'; p.kind = 'crumb'; p.size = r.float(5, 9); p.color = '#8A5E40';
        var a3 = r.float(-Math.PI * 0.95, -Math.PI * 0.05), s3 = r.float(120, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3; p.g = 1300; p.life = r.float(0.5, 0.8); p.rotV = r.float(-8, 8);
      } else if (kind === 'drops') {   // water drops from the can: fall, short life
        p.sprite = 'drop'; p.kind = 'crumb'; p.size = r.float(7, 12); p.color = o.color || null; p.rot = 0;
        p.vx = r.float(-40, 40); p.vy = r.float(-60, 40); p.g = 1400; p.life = r.float(0.35, 0.6);
      } else {   // 'sparkle' | 'stars'
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a4 = r.float(0, TAU), s4 = r.float(80, 240); p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4 - (kind === 'stars' ? 100 : 0);
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
  /** Wind: a base breeze per season + a gust every 6–10 s (envelope sin², ≈ 2.6 s), strength by season (autumn = full). */
  P._stepWind = function (h) {
    var gk = 0, br = 0, k;
    for (k = 0; k < 4; k++) { gk += this.ramp[k] * MOODS[k].gustK; br += this.ramp[k] * MOODS[k].breeze; }
    if (this._gustT >= 0) {
      this._gustT += h;
      var u = this._gustT / GUST.dur;
      if (u >= 1) { this._gustT = -1; this.gust = 0; this._gustNext = this.rng.float(GUST.every[0], GUST.every[1]); }
      else { var sn = Math.sin(Math.PI * u); this.gust = sn * sn * gk; }
    } else {
      this.gust = 0;
      this._gustNext -= h;
      if (this._gustNext <= 0) { this._gustT = 0; }
    }
    this.wind = br + this.gust * GUST.push;
  };
  P._step = function (h) {
    this.time += h;
    var k, ft = this.fadeTime;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.party !== this._partyT) this.party = this._partyT > this.party ? Math.min(this._partyT, this.party + h / FADE_TIME) : Math.max(this._partyT, this.party - h / FADE_TIME);
    this._stepWind(h);
    this._ambient();
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._respawn = function (p) { this._kill(p); if (this._live(p)) this._spawn(p.group, p.emitter, false); };
  /** Horizontal wrap for ambient drifters (keeps the density even when the wind blows them off one side). */
  P._wrap = function (p) { var W = this.width; if (p.x < -40) p.x = W + 30; else if (p.x > W + 40) p.x = -30; };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, u, wk = WIND_K[p.kind] || 0, wind = this.wind * wk, g = this.gust;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'snow': {   // terminal-speed fall with a gentle sway, drifting with the breeze
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + wind) * h; p.y += p.vy * h;
        p.rot = 0.25 * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.1;
        this._wrap(p);
        p.alpha = p.a0 * p.fade * clamp((H + 10 - p.y) / 60, 0, 1);
        if (p.y > H + 10) { this._respawn(p); return; }
        break;
      }
      case 'petal': case 'leaf': {   // pendulum fall (air drag); a gust lifts leaves a little and spins them faster
        var c = Math.cos(p.ph + p.age * p.sw), lift = p.kind === 'leaf' ? 1 - 0.75 * g : 1 - 0.4 * g;
        p.vxw = (p.vxw || 0) + (wind - (p.vxw || 0)) * Math.min(1, h * 2.5);   // the leaf catches up with the air (inertia)
        p.x += (p.vx + p.sway * c + p.vxw) * h; p.y += p.vy * lift * (0.7 + 0.45 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h;
        p.rot = (p.kind === 'leaf' ? 0.7 : 0.5) * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.2 + (p.tw || 0);
        if (p.kind === 'leaf') p.tw = ((p.tw || 0) + 5 * g * (p.spin >= 0 ? 1 : -1) * h) % TAU;   // a gust tumbles the leaf
        this._wrap(p);
        p.alpha = p.a0 * p.fade * clamp((H + 10 - p.y) / 60, 0, 1) * Math.min(1, p.age * 2);
        if (p.y > H + 10) { this._respawn(p); return; }
        break;
      }
      case 'seed': case 'pollen': {   // floaters: Brownian drift + the wind, fade in / out over their life
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        var bz = p.kind === 'seed' ? 5 : 4;
        p.vx += Math.sin(p.ph + p.age * p.sw * 2.1) * bz * h; p.vy += Math.cos(p.ph * 1.3 + p.age * p.sw * 1.7) * bz * h - (p.kind === 'seed' ? 1.2 : 0.5) * h;
        p.vx *= Math.pow(0.6, h); p.vy *= Math.pow(0.6, h);
        p.x += (p.vx + wind) * h; p.y += (p.vy - (p.kind === 'seed' ? 10 * g : 0)) * h;
        if (p.kind === 'seed') p.rot = 0.3 * Math.sin(p.ph + p.age * 0.9);
        this._wrap(p);
        if (p.y < -30) p.y = H * 0.8; else if (p.y > H + 20) p.y = 0;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'confetti': {   // air drag, slow terminal fall, tumbling
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 520 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 30 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'petalfx': {   // shower petals: strong drag → a slow fluttering fall (terminal ≈ 90 px/s) with a sideways sway
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var d2 = Math.pow(0.12, h);
        p.vx = p.vx * d2 + Math.sin(p.ph + p.age * 6) * 120 * h; p.vy = p.vy * d2 + 260 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      }
      case 'straw': case 'crumb':
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        p.vx *= Math.pow(p.kind === 'straw' ? 0.3 : 0.5, h); p.vy += p.g * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
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
    p.r = p.size / 2;
  };

  FT.Weather = Weather;
})(window.FT = window.FT || {});
