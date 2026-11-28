/* Mit's Treasure Map — TM.Weather (headless, deterministic sky + weather moods for the pirate cove; DESIGN §0.4, §5.3). Node-safe.
 *
 *   const wx = new TM.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWater(y0, y1)                // optional: the shallow-water band (sparkles on the water, rain rings); default near the ground
 *   wx.setWeather(i, { instant });     // 0 sunny, 1 breezy, 2 rain, 3 rainbow (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti + gold stars + sparkles whatever the mood
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.addDust(x, y, n)                // a soft sand puff
 *   wx.burst(x, y, { kind: 'stars'|'sparkle'|'coins'|'splash'|'confetti'|'dust'|'dots'|'leaves'|'sand', n, color })   // one-shot effects
 *   wx.ambient { skyTop, skyMid, skyBottom, sea (hex), tint (rgba overlay | null), light 0..1, darkness 0..0.14,
 *                sunX, sunY (logical px, centre), sunA 0..1,
 *                wind −1..1 (smooth gusts; breezy within ±0.8, the other moods ±0.15; > 0 blows to the right), gust 0..1,
 *                palm (rad: palm rotation about its base = wind × 0.08 + a gentle idle sway),
 *                rain 0..1 (rain mood → 1 over the crossfade), rainbow 0..1 (rainbow mood: fades in over 3 s),
 *                lantern 0..1 (the hut's warm lantern glow, = rain), whitecaps 0..1 (breezy),
 *                mood 'sunny'|'breezy'|'rain'|'rainbow', moodIndex, env (= mood: env/<layer>_<env>.svg), envFrom, envMix 0..1, party 0..1 }
 *   wx.clouds[] { type 'cloud_a'|'cloud_b'|'cloud_rain', x, y (centre), s (scale of the 300×140 sprite), alpha, flipX }
 *   wx.particles[] { type (= sprite: sparkle, mote, leaf_a, leaf_b, sand, rain, splash, droplet, star, confetti_a, confetti_b, dot,
 *                    dust, coin), sprite, x, y, size (drawn px, square), r (= size / 2), rot, alpha, layer 'back'|'front', kind,
 *                    color (hex tint | null), flipX? (−1..1 = a 3-D turn: scale x by it), sy? (y stretch, rain streaks) }
 *                    SCREEN px. 'back' = behind the board (ambient life), 'front' = over everything (bursts, confetti).
 */
(function (TM) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 56, REF_AREA = 1280 * 720, FADE_TIME = 2.5, N_CLOUDS = 6, SPLASH_MAX = 14, RAINBOW_IN = 3;
  var NAMES = ['sunny', 'breezy', 'rain', 'rainbow'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §0.1 skies per mood; sun positions as fractions of (W, H above the ground); clouds = how many of 6 show.
  // windBase / gusty: wind = windBase·(1 + wander) + gusty·gust, so |wind| ≤ windBase·1.45 + gusty (breezy ≤ 0.8, others ≤ 0.15).
  var MOODS = [
    { name: 'sunny', top: '#7CC8F0', mid: '#A9DCF5', bottom: '#D8F1FB', sea: '#5CC3D6', tint: null,
      amb: { light: 1, darkness: 0, sunX: 0.78, sunY: 0.14, sunA: 1, clouds: 3, cloudSpeed: 1, windBase: 0.05, gusty: 0.07, whitecaps: 0 },
      emitters: [{ kind: 'glint', sprite: 'sparkle', layer: 'back', count: 8, size: [10, 18], alpha: [0.6, 1], color: '#FFF8D8', onWater: true },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 6, size: [7, 12], alpha: [0.3, 0.55], color: '#FFFFFF' }] },
    { name: 'breezy', top: '#93CBEA', mid: '#BBDDF0', bottom: '#E4F3F8', sea: '#63BCD0', tint: null,
      amb: { light: 0.98, darkness: 0, sunX: 0.7, sunY: 0.12, sunA: 0.95, clouds: 5, cloudSpeed: 3.2, windBase: 0.36, gusty: 0.27, whitecaps: 1 },
      emitters: [{ kind: 'leaf', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 10, size: [16, 24], alpha: [0.85, 1] },
        { kind: 'sand', sprite: 'sand', layer: 'back', count: 12, size: [6, 11], alpha: [0.5, 0.85] }] },
    { name: 'rain', top: '#8FA3B8', mid: '#AEBDCB', bottom: '#CBD6DE', sea: '#7FA6B5', tint: [70, 82, 104, 0.1],
      amb: { light: 0.86, darkness: 0.14, sunX: 0.8, sunY: 0.16, sunA: 0, clouds: 6, cloudSpeed: 0.8, windBase: 0.07, gusty: 0.04, whitecaps: 0.3 },
      emitters: [{ kind: 'rain', sprite: 'rain', layer: 'back', count: 40, size: [16, 26], alpha: [0.45, 0.8] }] },
    { name: 'rainbow', top: '#86C9EE', mid: '#C2DEEC', bottom: '#FBE9D6', sea: '#6CC6D6', tint: [255, 236, 214, 0.04],
      amb: { light: 0.99, darkness: 0, sunX: 0.85, sunY: 0.18, sunA: 0.9, clouds: 3, cloudSpeed: 1, windBase: 0.05, gusty: 0.07, whitecaps: 0 },
      emitters: [{ kind: 'glint', sprite: 'sparkle', layer: 'back', count: 8, size: [10, 18], alpha: [0.6, 1], color: '#FFF4E0', onWater: true },
        { kind: 'droplet', sprite: 'droplet', layer: 'back', count: 5, size: [8, 12], alpha: [0.5, 0.8] }] }
  ];
  MOODS.forEach(function (m) { m._top = hex(m.top); m._mid = hex(m.mid); m._bot = hex(m.bottom); m._sea = hex(m.sea); m._tint = m.tint || [255, 255, 255, 0]; });
  var NUM_KEYS = ['light', 'darkness', 'sunX', 'sunY', 'sunA', 'clouds', 'cloudSpeed', 'windBase', 'gusty', 'whitecaps'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], color: '#FFD54A' },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95], color: '#FFF6C8' }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var DUST = ['#F1DDB0', '#DEC28C', '#F7EBCF'];   // warm sand

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 14;
    this.rng = new TM.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0; this.moodTime = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.rain = 0; this.rainbow = 0;
    this.gust = 0; this._gustT = 0; this._gustNext = 3; this._gustSign = 1;
    this.water = null;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['sparkle', 'mote', 'leaf_a', 'leaf_b', 'sand', 'rain', 'splash', 'droplet', 'star', 'confetti_a', 'confetti_b', 'dot', 'dust', 'coin'];
  Weather.CLOUDS = ['cloud_a', 'cloud_b', 'cloud_rain'];
  Weather.SKY = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  /** The sky band (clouds): above the far horizon ≈ the top 40 % of the screen above the ground. */
  P._skyBottom = function () { return Math.min(this.groundY * 0.45, this.height * 0.42); };
  /** The shallow-water band {y0, y1} (setWater, else the strip just above the ground line). */
  P._water = function () { return this.water || { y0: this.groundY - Math.min(150, 0.2 * this.height), y1: this.groundY - 6 }; };
  P.setWater = function (y0, y1) { this.water = isFinite(y0) && isFinite(y1) && y1 > y0 ? { y0: +y0, y1: +y1 } : null; };

  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.ly !== undefined) p.ly *= sy; }
    for (i = 0; i < this.clouds.length; i++) { var c = this.clouds[i]; c.x *= sx; c.y *= sy; c.y0 *= sy; }
    if (this.water) { this.water.y0 *= sy; this.water.y1 *= sy; }
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
    this.moodTime = 0;
    if (instant) {
      this._fadeU = 1; this._fromMood = i;
      for (var k = 0; k < 4; k++) this.ramp[k] = k === i ? 1 : 0;
      this.rain = i === 2 ? 1 : 0; this.rainbow = 0;   // the rainbow always fades in over 3 s
      this.particles = this.particles.filter(function (p) { return p.group < 0; });
      for (var c = 0; c < this.clouds.length; c++) { this.clouds[c].type = this._cloudType(this.clouds[c]); }
      this._ambient();
      this._populate(true);
      for (c = 0; c < this.clouds.length; c++) this.clouds[c].alpha = this._cloudTarget(this.clouds[c]);
    } else { this._fadeU = 0; this._ambient(); }
  };
  P.setParty = function (on, opts) { this._partyT = on ? 1 : 0; if (opts && opts.instant) this.party = this._partyT; this._ambient(); };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), mid: a._mid.slice(), bot: a._bot.slice(), sea: a._sea.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = smooth(u), a = this.ambient, k, W = this.width, H = this.height;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, mid: m._mid, bot: m._bot, sea: m._sea, tint: m._tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._mid = C(f.mid, m._mid); a._bot = C(f.bot, m._bot); a._sea = C(f.sea, m._sea);
    var t0 = f.tint, t1 = m._tint;
    if (t0[3] === 0) t0 = [t1[0], t1[1], t1[2], 0];
    if (t1[3] === 0) t1 = [t0[0], t0[1], t0[2], 0];
    a._tint = [L(t0[0], t1[0]), L(t0[1], t1[1]), L(t0[2], t1[2]), L(t0[3], t1[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    a.skyTop = toHex(a._top); a.skyMid = toHex(a._mid); a.skyBottom = toHex(a._bot); a.sea = toHex(a._sea);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.light = a._light; a.darkness = a._darkness; a.whitecaps = a._whitecaps;
    a.sunX = a._sunX * W; a.sunY = a._sunY * Math.min(H, this.groundY); a.sunA = a._sunA * (1 - 0.9 * this.rain);
    // wind: a slow breathing wander + gusts (smooth noise), always within ±1
    var t = this.time, wander = 0.3 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust * this._gustSign, -1, 1);
    a.gust = this.gust;
    a.palm = a.wind * 0.08 + 0.02 * Math.sin(t * 0.8);
    a.rain = this.rain; a.rainbow = this.rainbow; a.lantern = this.rain;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
  };

  /** Gusts every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay, smooth): gust 0..1. Mostly blowing right (the sea breeze). */
  P._stepGust = function (h) {
    this._gustNext -= h;
    if (this._gustNext <= 0 && this._gustT <= 0) { this._gustT = 2.9; this._gustNext = this.rng.float(4, 7); this._gustSign = this.rng.chance(0.85) ? 1 : -1; }
    if (this._gustT > 0) {
      this._gustT = Math.max(0, this._gustT - h);
      var e = 2.9 - this._gustT;
      this.gust = e < 0.6 ? smooth(e / 0.6) : e < 1.4 ? 1 : 1 - smooth((e - 1.4) / 1.5);
    } else this.gust = 0;
  };
  /** rain / rainbow levels: rain follows the crossfade; the rainbow fades in over 3 s in the rainbow mood. */
  P._stepLevels = function (h) {
    var m = this.mood;
    this.rain = m === 2 ? Math.min(1, this.rain + h / this.fadeTime) : Math.max(0, this.rain - h / this.fadeTime);
    this.rainbow = m === 3 ? Math.max(this.rainbow, smooth(this.moodTime / RAINBOW_IN)) : Math.max(0, this.rainbow - h / this.fadeTime);
  };

  // ---------------------------------------------------------------- clouds (a fixed set of 6; how many show follows the mood)
  P._makeClouds = function () {
    var r = this.rng;
    this.clouds = [];
    for (var i = 0; i < N_CLOUDS; i++) {
      var c = { type: i % 2 ? 'cloud_b' : 'cloud_a', x: r.float(0, 1) * this.width, y0: 0, y: 0, s: r.float(0.55, 1.05), alpha: 0, flipX: r.chance(0.5),
        v: r.float(7, 16), yf: r.float(0.06, 0.3), ph: r.float(0, TAU), rank: i };
      this.clouds.push(c);
    }
  };
  P._cloudType = function (c) { return this.mood === 2 ? 'cloud_rain' : c.rank % 2 ? 'cloud_b' : 'cloud_a'; };
  P._cloudTarget = function (c) {
    var a = this.ambient;
    return c.type !== this._cloudType(c) ? 0 : clamp(a._clouds - c.rank, 0, 1) * (c.type === 'cloud_rain' ? 0.95 : 0.9);
  };
  P._stepClouds = function (h) {
    var a = this.ambient, sb = this._skyBottom(), W = this.width;
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i], wHalf = 150 * c.s;
      c.y0 = Math.max(30 + 70 * c.s, c.yf * sb * 1.6);   // in the sky band, never cut by the top edge
      c.x += (c.v * a._cloudSpeed + 30 * a.wind) * h;   // drift + the wind
      if (c.x < -wHalf - 20) c.x = W + wHalf; else if (c.x > W + wHalf + 20) c.x = -wHalf;
      c.y = c.y0 + 4 * Math.sin(this.time * 0.2 + c.ph);
      if (c.type !== this._cloudType(c) && c.alpha < 0.03) c.type = this._cloudType(c);   // swap the sprite while invisible
      c.alpha += (this._cloudTarget(c) - c.alpha) * Math.min(1, h * 1.2);
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
      var have = counts[g][e], want = tg[g][e], n = anywhere ? want - have : Math.min(g === 2 ? 3 : 1, want - have);
      for (i = 0; i < n && this.particles.length < HARD_CAP; i++) this._spawn(g, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) { var q = this.particles[i]; if (q.group === g && q.emitter === e && !q.dying) { q.dying = true; extra--; } }
      }
    }
  };
  P._live = function (p) { var tg = this._lastTargets; return tg && tg[p.group] && tg[p.group][p.emitter] > 0; };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, G = this.groundY, Wt = this._water(), a = this.ambient;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.1, 0.9) * G, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: em.color || null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'mote':   // light motes drifting up slowly in the warm light, swaying
        p.y = anywhere ? r.float(0.2, 0.95) * G : G - r.float(0, 60); p.vy = -r.float(8, 18); p.sway = r.float(10, 24); p.sw = r.float(0.4, 0.9); p.rot = 0;
        p.life = r.float(6, 11); p.age = anywhere ? r.float(0, p.life) : 0;
        break;
      case 'glint':   // sparkles twinkling on the water (sunny / rainbow) — party: stars + sparkles anywhere in the air
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-1, 1); p.fade = 1;
        if (em.onWater) { p.x = r.float(0.02, 0.98) * W; p.y = r.float(Wt.y0, Wt.y1); p.rot = 0; p.rotV = 0; }
        else p.y = r.float(0.05, 0.6) * this.height;
        break;
      case 'leaf':   // blown leaf bits: fall slowly, flutter, the wind carries them across (they enter upwind)
        p.y = anywhere ? r.float(0.02, 0.85) * G : r.float(-0.05, 0.6) * G;
        p.x = anywhere ? r.float(0, W) : ((a.wind || 0) >= 0 ? -30 : W + 30);
        p.fall = r.float(22, 42); p.w = r.float(0.8, 1.4); p.spin = r.float(-1.5, 1.5); p.depth = r.float(0.7, 1.2);
        break;
      case 'sand':   // sand dust skimming low over the beach in the wind
        p.y = G - r.float(4, 70); p.y0 = p.y; p.x = anywhere ? r.float(0, W) : ((a.wind || 0) >= 0 ? -20 : W + 20);
        p.life = r.float(1.4, 3); p.age = anywhere ? r.float(0, p.life) : 0; p.depth = r.float(0.7, 1.3); p.rot = 0; p.color = r.pick(DUST);
        break;
      case 'rain':   // fast slanted streaks; each lands somewhere on the beach / the water strip (p.ly) and leaves a splash ring
        p.x = r.float(-0.15, 1.05) * W; p.y = anywhere ? r.float(-0.1, 0.95) * G : -r.float(10, 120); p.depth = r.float(0.75, 1.25);
        p.vy = r.float(900, 1200) * p.depth; p.ly = r.float(Wt.y0 - 20, G + 6); p.rot = 0; p.sy = 1;
        break;
      case 'droplet':   // rainbow: a few last drops falling slowly, glinting
        p.x = r.float(0, W); p.y = anywhere ? r.float(0, 0.9) * G : -r.float(10, 60); p.vy = r.float(160, 260); p.ly = r.float(Wt.y0, G); p.rot = 0;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && TM.PALETTE && TM.PALETTE[c] ? TM.PALETTE[c].base : c || null; }
  P._ring = function (x, y, size, life, layer) {   // a splash ring (grows, fades); ambient rings are capped at SPLASH_MAX
    return { type: 'splash', sprite: 'splash', kind: 'ring', x: x, y: y, size: size, s0: size, grow: size * 1.6, rot: 0, alpha: 0.85, a0: 0.85, layer: layer || 'back',
      group: -1, emitter: -1, fade: 1, dying: false, age: 0, life: life, vx: 0, vy: 0, color: null };
  };

  P.addDust = function (x, y, n) { this.burst(x, y, { kind: 'dust', n: n || 5 }); };

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || (kind === 'splash' ? 7 : 18), r = this.rng, a, sp;
    if (kind === 'splash') {   // a ring on the water + droplets thrown up in arcs
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      this.particles.push(this._ring(x, y, 20, 0.45, 'front'));
      n = Math.max(1, n - 1);
    }
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
        case 'coins':   // gold coins thrown up out of the chest: ballistic, spinning (flipX), a bounce on the sand
          p.sprite = 'coin'; p.kind = 'coin'; p.size = r.float(18, 28); p.color = null;
          a = r.float(-Math.PI * 0.8, -Math.PI * 0.2); sp = r.float(380, 720);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 1500; p.spinW = r.float(8, 16); p.life = r.float(1.6, 2.2); p.rot = r.float(-0.3, 0.3);
          p.ly = this.groundY - r.float(0, 30); p.bounced = 0;
          break;
        case 'splash':   // water droplets
          p.sprite = 'droplet'; p.kind = 'drip'; p.size = r.float(8, 13);
          a = r.float(-Math.PI * 0.85, -Math.PI * 0.15); sp = r.float(140, 300);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 1300; p.life = r.float(0.45, 0.7); p.rot = 0; p.ly = y + 4;
          break;
        case 'dust': case 'sand':   // a soft sand puff: expands, rises a little, fades
          p.sprite = 'dust'; p.kind = 'dust'; p.size = r.float(16, 30); p.color = o.color ? tintOf(o.color) : r.pick(DUST);
          a = r.float(-Math.PI, 0); sp = r.float(30, 110);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6; p.life = r.float(0.5, 0.9); p.rotV = r.float(-1, 1);
          break;
        case 'leaves':
          p.sprite = r.chance(0.5) ? 'leaf_a' : 'leaf_b'; p.kind = 'flutter'; p.size = r.float(14, 22);
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
    this.time += h; this.moodTime += h;
    var k, ft = this.fadeTime;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.party !== this._partyT) this.party = this._partyT > this.party ? Math.min(this._partyT, this.party + h / FADE_TIME) : Math.max(this._partyT, this.party - h / FADE_TIME);
    this._stepGust(h);
    this._stepLevels(h);
    this._ambient();
    this._stepClouds(h);
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._respawn = function (p) { this._kill(p); if (this._live(p)) this._spawn(p.group, p.emitter, false); };
  P._rings = function () { var n = 0; for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'ring' && this.particles[i].layer === 'back') n++; return n; };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, G = this.groundY, a = this.ambient, wind = a.wind || 0, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'mote': {
        u = p.age / p.life;
        if (u >= 1 || p.y < -20) { this._respawn(p); return; }
        p.x += (p.sway * Math.cos(p.ph + p.age * p.sw) + 40 * wind) * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'leaf': {   // terminal-speed fall + flutter + wind drift (240 px/s at wind 1); a gust lifts them
        p.vx = wind * 240 * p.depth + 30 * Math.cos(p.ph + p.age * p.w * 2.2);
        p.vy = p.fall - 60 * this.gust + 16 * Math.sin(p.ph + p.age * 3.1);
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * 2.5 * h + wind * 2 * h;
        p.flipX = Math.cos(p.ph + p.age * 3.4);   // tumbling (a 3-D turn)
        p.alpha = p.a0 * p.fade * clamp((G + 10 - p.y) / 40, 0, 1);
        if (p.y > G + 10 || p.x > W + 50 || p.x < -50 || p.y < -80) { this._respawn(p); return; }
        break;
      }
      case 'sand': {   // skims low and fast with the wind, hops a little, fades out
        u = p.age / p.life;
        if (u >= 1 || p.x > W + 30 || p.x < -30) { this._respawn(p); return; }
        p.vx = (wind * 420 + (wind >= 0 ? 40 : -40)) * p.depth;
        p.x += p.vx * h; p.y = p.y0 - 14 * Math.abs(Math.sin(p.ph + p.age * 2.4)) * p.depth;
        p.rot += p.vx * 0.02 * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u) * clamp(Math.abs(wind) * 3, 0.3, 1);
        break;
      }
      case 'rain': {   // straight fast streaks slanted by the wind; a splash ring where each lands
        p.vx = (wind * 320 + 40) * p.depth;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = -Math.atan2(p.vx, p.vy); p.sy = 1.6;
        p.alpha = p.a0 * p.fade * this.rain;
        if (p.y >= p.ly) {
          if (this._rings() < SPLASH_MAX && this.particles.length < HARD_CAP && !p.dying) this.particles.push(this._ring(p.x, p.ly, 8, this.rng.float(0.25, 0.38)));
          if (p.dying) { this._kill(p); return; }
          var Wt = this._water();
          p.y = -this.rng.float(10, 80); p.x = this.rng.float(-0.15, 1.05) * W; p.ly = this.rng.float(Wt.y0 - 20, G + 6);
        }
        break;
      }
      case 'droplet': {
        p.x += 30 * wind * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade;
        if (p.y >= p.ly) {
          if (this._rings() < SPLASH_MAX && this.particles.length < HARD_CAP && !p.dying) this.particles.push(this._ring(p.x, p.ly, 7, 0.35));
          this._respawn(p); return;
        }
        break;
      }
      case 'ring':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.size = p.s0 + p.grow * u; p.alpha = p.a0 * (1 - u);
        break;
      case 'confetti': {   // air drag: a quick slow-down, then a gentle tumbling fall (the breeze carries it)
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.15, h);
        p.vx *= drag; p.vy = p.vy * drag + 520 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h + wind * 60 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'coin': {   // ballistic + spin; one damped bounce on the sand, then it fades
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 40) { this._kill(p); return; }
        p.vy += p.g * h; p.x += p.vx * h; p.y += p.vy * h;
        if (p.y >= p.ly && p.vy > 0 && p.bounced < 2) { p.y = p.ly; p.vy *= -0.35; p.vx *= 0.6; p.bounced++; }
        p.flipX = Math.cos(p.age * p.spinW);
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      }
      case 'drip': {   // a water droplet thrown up: gravity, gone when it falls back in
        u = p.age / p.life;
        if (u >= 1 || (p.vy > 0 && p.y > p.ly)) { this._kill(p); return; }
        p.vy += p.g * h; p.x += p.vx * h; p.y += p.vy * h;
        p.alpha = 1 - 0.4 * u;
        break;
      }
      case 'dust':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += (p.vx + wind * 60) * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.75 * (1 - u) * Math.min(1, u * 8);
        break;
      case 'flutter': {   // burst leaves: pendulum fall
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) + 60 * h;
        p.x += (p.vx + p.sway * Math.cos(p.age * 4) + wind * 120) * h; p.y += (p.vy + 30) * h;
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

  TM.Weather = Weather;
})(window.TM = window.TM || {});
