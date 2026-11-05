/* Bop's Rainy Band — RB.Weather (headless, deterministic rainy-garden seasons; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new RB.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);         // groundY = world.layout.groundY: raindrops splash on the lawn band above it (splashY)
 *   wx.setWeather(i, { instant });    // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setShower(k)                   // 0..1 heavy shower on top of the season (world.shower; winter: a snow flurry)
 *   wx.setParty(on, { instant })      // session-done winter party: snow + sparkles whatever the season (setNight = alias)
 *   wx.update(dt);                    // fixed 1/60 s steps
 *   wx.burst(x, y, { kind, n, color })   // one-shot effects (same cap), SCREEN px:
 *       'confetti' | 'notes' (music notes float up, tinted) | 'puff' | 'sparkle' | 'stars' | 'leaves' | 'petals' |
 *       'splash' (a drop spray: raindrop on a drum) | 'snow' | 'pollen' (= soft sparkles)   ('rustle' = 'leaves')
 *   wx.particles[] { type, sprite (= type), x, y, size, rot, alpha, layer:'back'|'front', kind, color?, flipX?, sy? }  SCREEN px
 *       type ∈ Weather.SPRITES = particles/<type>.svg (32×32), drawn size px (square), rotated rot, alpha. color: CSS colour to
 *       tint (confetti, notes, sparkles) or null. sy (raindrops only) = extra vertical stretch for speed (1 … 1.6; optional).
 *       'back' = behind the stage and band; 'front' = over everything but the UI.
 *   wx.clouds[]    { sprite:'cloud_a'|'cloud_b'|'cloud_c', x, y, scale, alpha, layer 0|1 }   SCREEN px (centre, 320·scale wide)
 *   wx.ambient     { skyTop, skyBottom, skyMid, tint (rgba | null), sun 0..1, sunX, sunY (0..1 of the screen), rainbow 0..1,
 *                    darkness 0..0.2, rain 0..1, snow 0..1, shower 0..1, wind (px/s, + = right), gust 0..1,
 *                    season:'spring'|'summer'|'autumn'|'winter', seasonIndex 0..3, env (= season: env/<far|mid|ground>_<env>.svg),
 *                    envFrom, envMix 0..1, mood / moodIndex (= season, old names) }
 */
(function (RB) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 160, AMBIENT_CAP = 120, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- sky per season (DESIGN §3)
  var SKY = [
    { top: '#CFE6F0', bottom: '#F3F1E2', tint: [210, 225, 235, 0.05] },   // spring: light rain, blossoms
    { top: '#8FD0F2', bottom: '#E3F4FB', tint: [255, 248, 220, 0.0] },    // summer: sun shower, rainbow
    { top: '#E9C9A0', bottom: '#F6E6CB', tint: [240, 200, 150, 0.06] },   // autumn: drizzle, leaves
    { top: '#C9D6E6', bottom: '#EEF2F7', tint: [225, 235, 250, 0.06] }    // winter: snow
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'rainbow', 'rain', 'snow', 'windBase', 'gusty'];
  var GLINT = ['#FFF6C8', '#FFFFFF', '#E8F6FF'];
  var PETAL = ['#F7C6D4', '#FBE3EA', '#F3D9C9'];
  var NOTE_TINT = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD'];

  /* emitters: rain = falling drops ending in a splash; drift = petals / leaves / snow tumbling down; glint = sparkles */
  var SEASONS = [
    { name: 'spring', amb: { sun: 0.35, sunX: 0.8, sunY: 0.14, rainbow: 0, rain: 0.45, snow: 0, windBase: 14, gusty: 18 }, clouds: [3, 3],
      emitters: [
        { kind: 'rain', sprite: 'drop', layer: 'back', count: 16, size: [12, 18], alpha: [0.4, 0.6], fall: [620, 760] },
        { kind: 'rain', sprite: 'drop', layer: 'front', count: 20, size: [16, 24], alpha: [0.55, 0.8], fall: [760, 920] },
        { kind: 'drift', sprite: 'petal', layer: 'front', count: 10, size: [12, 18], alpha: [0.75, 0.95], fall: [40, 70], sway: 34, spin: 2.2, tint: true }
      ] },
    { name: 'summer', amb: { sun: 1, sunX: 0.78, sunY: 0.12, rainbow: 1, rain: 0.2, snow: 0, windBase: 6, gusty: 10 }, clouds: [2, 1],
      emitters: [
        { kind: 'rain', sprite: 'drop', layer: 'front', count: 12, size: [16, 22], alpha: [0.6, 0.9], fall: [720, 880], bright: true },
        { kind: 'rain', sprite: 'drop', layer: 'back', count: 6, size: [12, 16], alpha: [0.45, 0.7], fall: [620, 740], bright: true },
        { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 8, size: [10, 18], alpha: [0.5, 0.85] }
      ] },
    { name: 'autumn', amb: { sun: 0.5, sunX: 0.2, sunY: 0.16, rainbow: 0, rain: 0.3, snow: 0, windBase: 20, gusty: 26 }, clouds: [3, 2],
      emitters: [
        { kind: 'rain', sprite: 'drop', layer: 'back', count: 10, size: [10, 14], alpha: [0.35, 0.55], fall: [480, 580] },
        { kind: 'rain', sprite: 'drop', layer: 'front', count: 14, size: [12, 18], alpha: [0.45, 0.7], fall: [560, 680] },
        { kind: 'drift', sprite: 'leaf_a', layer: 'front', count: 7, size: [16, 24], alpha: [0.85, 1], fall: [45, 75], sway: 44, spin: 2.8 },
        { kind: 'drift', sprite: 'leaf_b', layer: 'front', count: 6, size: [16, 24], alpha: [0.85, 1], fall: [45, 75], sway: 44, spin: 2.8 },
        { kind: 'drift', sprite: 'leaf_a', layer: 'back', count: 3, size: [12, 16], alpha: [0.6, 0.8], fall: [30, 50], sway: 30, spin: 2 }
      ] },
    { name: 'winter', amb: { sun: 0.25, sunX: 0.82, sunY: 0.16, rainbow: 0, rain: 0, snow: 1, windBase: 8, gusty: 12 }, clouds: [3, 3],
      emitters: [
        { kind: 'drift', sprite: 'snow', layer: 'back', count: 26, size: [8, 13], alpha: [0.6, 0.85], fall: [30, 50], sway: 18, spin: 0.8 },
        { kind: 'drift', sprite: 'snow', layer: 'front', count: 30, size: [12, 20], alpha: [0.8, 1], fall: [45, 75], sway: 26, spin: 1.2 }
      ] }
  ];
  SEASONS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._bot = hex(SKY[i].bottom); m._tint = SKY[i].tint; });
  // the party (setParty): snow + sparkles whatever the season
  var PARTY_EMIT = [
    { kind: 'drift', sprite: 'snow', layer: 'front', count: 24, size: [12, 20], alpha: [0.8, 1], fall: [45, 75], sway: 26, spin: 1.2 },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 12, size: [12, 20], alpha: [0.6, 0.95] }
  ];
  // the shower (setShower): extra heavy rain (winter: an extra snow flurry)
  var SHOWER_EMIT = [
    { kind: 'rain', sprite: 'drop', layer: 'front', count: 46, size: [18, 26], alpha: [0.6, 0.85], fall: [980, 1160], heavy: true },
    { kind: 'rain', sprite: 'drop', layer: 'back', count: 22, size: [14, 18], alpha: [0.45, 0.65], fall: [860, 1000], heavy: true }
  ];
  var FLURRY_EMIT = [
    { kind: 'drift', sprite: 'snow', layer: 'front', count: 44, size: [12, 20], alpha: [0.8, 1], fall: [80, 120], sway: 40, spin: 1.6 }
  ];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.splashY = opts.groundY || this.height - 24;
    this.rng = new RB.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.mist = [];
    this.season = 0; this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null; this._fromSeason = 0;
    this.party = 0; this._partyT = 0; this.shower = 0; this._showerT = 0;
    this.ambient = {};
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.SEASONS = SEASONS; Weather.MOODS = SEASONS; Weather.SKY = SKY; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP;
  Weather.FADE_TIME = FADE_TIME; Weather.NAMES = NAMES;
  Weather.SPRITES = ['drop', 'splash', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'puff', 'note_a', 'note_b', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud_a', 'cloud_b', 'cloud_c'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeClouds = function () {    // 2 layers of soft rain clouds in the upper sky; they drift and wrap
    var r = new RB.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height, k = clamp(W / 1280, 0.7, 1.3);
    this.clouds = [];
    for (var l = 0; l < 2; l++) {
      var n = Math.max(2, Math.round([4, 3][l] * k));
      for (var i = 0; i < n; i++) {
        this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: (i + r.float(0, 1)) / n * W * 1.2 - 0.1 * W,
          y: r.float(0.04, l ? 0.2 : 0.14) * H, scale: [0.55, 0.8][l] * r.float(0.85, 1.2), alpha: [0.7, 0.9][l], layer: l,
          _a: [0.7, 0.9][l], _v: r.float(4, 9) * (l + 1), _on: 1, idx: i });
      }
    }
  };

  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.landY !== undefined) p.landY *= sy;
    }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    this.width = W; this.height = H;
    this.splashY = groundY !== undefined && isFinite(groundY) ? groundY : this.splashY * sy;
  };

  P.setWeather = function (i, opts) {
    i = ((i | 0) % 4 + 4) % 4;
    var instant = opts && opts.instant;
    if (!instant && i === this.season && this._from) return;
    this._from = this._snapshot();
    this._fromSeason = this.season;
    this.season = this.mood = this.weather = i;
    if (instant) {
      this._fadeU = 1; this._fromSeason = i;
      for (var k = 0; k < 4; k++) this.ramp[k] = k === i ? 1 : 0;
      this.particles.length = 0;
      this._populate(true);
    } else this._fadeU = 0;
    this._ambient();
  };
  P.setShower = function (k) { this._showerT = clamp(+k || 0, 0, 1); };
  P.setParty = function (on, opts) { this._partyT = on ? 1 : 0; if (opts && opts.instant) this.party = this._partyT; this._ambient(); };
  P.setNight = P.setParty;   // old name (main.js of the sister game)

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), bot: a._bot.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };

  P._ambient = function () {
    var m = SEASONS[this.season], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) {
      f = { top: m._top, bot: m._bot, tint: m._tint };
      for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]];
    }
    a._top = C(f.top, m._top); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); }
    // the shower darkens the sky a little (grey-blue) and hides the sun
    var sh = this.shower, top = a._top, bot = a._bot, G = [150, 165, 185];
    if (sh > 0) { top = top.map(function (c, j) { return c + (G[j] - c) * 0.35 * sh; }); bot = bot.map(function (c, j) { return c + (G[j] + 40 - c) * 0.25 * sh; }); }
    a.skyTop = toHex(top); a.skyBottom = toHex(bot); a.skyMid = toHex([(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2]);
    var tint = a._tint.slice();
    if (sh > 0) { tint = [lerpN(tint[0], 120, sh), lerpN(tint[1], 135, sh), lerpN(tint[2], 160, sh), Math.max(tint[3], 0.1 * sh)]; }
    a.tint = tint[3] > 0.004 ? 'rgba(' + Math.round(tint[0]) + ',' + Math.round(tint[1]) + ',' + Math.round(tint[2]) + ',' + tint[3].toFixed(3) + ')' : null;
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust + 30 * sh, -70, 70);
    a.sun = a._sun * (1 - 0.7 * sh); a.sunX = a._sunX; a.sunY = a._sunY;
    a.rainbow = clamp(a._rainbow * (1 - this.party), 0, 1);
    a.rain = clamp(a._rain + (1 - a._rain) * sh * (a._snow > 0.5 ? 0 : 1), 0, 1);
    a.snow = clamp(Math.max(a._snow, this.party), 0, 1);
    a.shower = sh; a.darkness = clamp(0.2 * sh, 0, 0.2);
    a.gust = this.gust; a.seasonIndex = a.moodIndex = this.season; a.season = a.mood = NAMES[this.season];
    a.env = NAMES[this.season]; a.envFrom = NAMES[this._fromSeason]; a.envMix = s;
  };
  function lerpN(a, b, u) { return a + (b - a) * u; }

  // ---------------------------------------------------------------- particles
  // emitter groups: 0..3 seasons, 4 party, 5 shower (rain), 6 shower (winter flurry)
  P._emitters = function (m) { return m < 4 ? SEASONS[m].emitters : m === 4 ? PARTY_EMIT : m === 5 ? SHOWER_EMIT : FLURRY_EMIT; };
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e, wint = this.ramp[3];
    for (m = 0; m < 7; m++) {
      out[m] = [];
      var ramp = m < 4 ? this.ramp[m] * (1 - 0.6 * this.party) : m === 4 ? this.party * (1 - wint) : m === 5 ? this.shower * (1 - wint) : this.shower * wint;
      var em = this._emitters(m);
      for (e = 0; e < em.length; e++) { var t = em[e].count * k * ramp; out[m][e] = t; sum += t; }
    }
    var cap = AMBIENT_CAP, f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 7; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [], i, m, e;
    for (m = 0; m < 7; m++) { counts[m] = []; for (e = 0; e < tg[m].length; e++) counts[m][e] = 0; }
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.emitter >= 0 && !p.dying) counts[p.group][p.emitter]++; }
    for (m = 0; m < 7; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      // rain refills fast (drops are short-lived), the rest gently
      var em = this._emitters(m)[e], spawnN = anywhere ? want - have : Math.min(em.kind === 'rain' ? 3 : 1, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) {
          var q = this.particles[i];
          if (q.group === m && q.emitter === e && !q.dying) { q.dying = true; extra--; }
        }
      }
    }
  };

  P._live = function (p) { var tg = this._lastTargets; return tg && tg[p.group] && tg[p.group][p.emitter] > 0; };

  P._spawn = function (m, e, anywhere) {
    var em = this._emitters(m)[e], r = this.rng, W = this.width, H = this.height;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(-0.05, 1.05) * W, y: anywhere ? r.float(0.02, 0.98) * H : -20,
      size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU), alpha: 0, layer: em.layer, kind: em.kind, group: m, emitter: e,
      a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0, dying: false, age: 0, vx: 0, vy: 0, color: null,
      ph: r.float(0, TAU), t: r.float(0, 10) };
    switch (em.kind) {
      case 'rain':
        p.vy = r.float(em.fall[0], em.fall[1]); p.fade = 1; p.heavy = !!em.heavy;
        this._rainLand(p);
        if (anywhere) p.y = r.float(-20, p.landY);
        if (em.bright) p.color = '#FFFFFF';
        break;
      case 'drift':
        p.vy = r.float(em.fall[0], em.fall[1]); p.sway = em.sway * r.float(0.6, 1.2); p.sw = r.float(0.8, 1.6); p.spin = em.spin * r.float(-1, 1);
        p.flipW = r.float(2, 5);
        if (em.tint) p.color = r.pick(PETAL);
        if (em.sprite === 'snow') p.rot = r.float(0, TAU);
        break;
      case 'glint':
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.fade = 1;
        p.y = r.float(0.05, 0.6) * H; p.rotV = r.float(-1, 1); p.s0 = p.size; p.color = r.pick(GLINT);
        break;
    }
    this.particles.push(p);
    return p;
  };
  /** Where a drop ends: back drops higher on the lawn (farther away), front drops near the front grass line (splashY). */
  P._rainLand = function (p) {
    var sY = this.splashY, r = this.rng;
    p.landY = p.layer === 'back' ? sY - r.float(70, 170) : sY - r.float(-6, 70);
  };

  /** One-shot effect particles in SCREEN px (count toward the hard cap). color = CSS colour (tint). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || (kind === 'splash' ? 6 : 24), r = this.rng;
    if (kind === 'rustle') kind = 'leaves';
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { type: 'confetti_a', sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: kind,
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        if (!o.color) p.color = r.pick(NOTE_TINT);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
      } else if (kind === 'notes') {          // music notes float up, sway, fade
        p.sprite = r.chance(0.5) ? 'note_a' : 'note_b'; p.size = r.float(20, 30); p.kind = 'float';
        if (!o.color) p.color = r.pick(NOTE_TINT);
        p.vx = r.float(-50, 50); p.vy = r.float(-150, -90); p.rotV = r.float(-1.2, 1.2); p.rot = r.float(-0.3, 0.3); p.life = r.float(1.1, 1.7);
        p.sw = r.float(2, 4);
      } else if (kind === 'puff') {
        p.sprite = 'puff'; p.size = r.float(18, 30); p.layer = 'back';
        var a2 = r.float(Math.PI, TAU); p.vx = Math.cos(a2) * r.float(30, 90); p.vy = Math.sin(a2) * r.float(10, 50); p.life = r.float(0.45, 0.8); p.rotV = r.float(-2, 2);
      } else if (kind === 'splash') {         // a little spray of drops jumping off a drum skin
        p.sprite = 'drop'; p.size = r.float(8, 13); p.kind = 'bit'; p.g = 1400;
        var a6 = r.float(-Math.PI * 0.85, -Math.PI * 0.15), s6 = r.float(120, 260);
        p.vx = Math.cos(a6) * s6; p.vy = Math.sin(a6) * s6; p.rotV = 0; p.rot = 0; p.life = r.float(0.35, 0.55);
      } else if (kind === 'leaves' || kind === 'petals' || kind === 'snow') {   // bits puff out and flutter down
        p.sprite = kind === 'petals' ? 'petal' : kind === 'snow' ? 'snow' : r.chance(0.5) ? 'leaf_a' : 'leaf_b'; p.size = r.float(10, 18);
        if (kind === 'petals' && !o.color) p.color = r.pick(PETAL);
        var a4 = r.float(-Math.PI * 0.9, -Math.PI * 0.1), s4 = r.float(90, 240);
        p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4; p.rotV = r.float(-6, 6); p.life = r.float(0.8, 1.3); p.g = 380; p.kind = 'bit';
      } else {   // 'sparkle' | 'stars' | 'pollen'
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a3 = r.float(0, TAU), s3 = r.float(80, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3 - (kind === 'stars' ? 120 : 0);
        p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 420 : 0;
        if (!o.color && kind === 'stars') p.color = '#FFD54A';
        p.kind = 'spark';
      }
      p.type = p.sprite;
      p.s0 = p.size;
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
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.season ? h : -h) / ft, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / ft);
    if (this.party !== this._partyT) this.party = this._partyT > this.party ? Math.min(this._partyT, this.party + h / FADE_TIME) : Math.max(this._partyT, this.party - h / FADE_TIME);
    // the shower follows the world's 0..1 smoothly (≈ 0.25 s)
    this.shower += (this._showerT - this.shower) * Math.min(1, h * 4);
    if (Math.abs(this.shower - this._showerT) < 1e-3) this.shower = this._showerT;
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
    }
    this._ambient();
    var a = this.ambient;
    var wantClouds = SEASONS[this.season].clouds;
    for (k = 0; k < this.clouds.length; k++) {
      var c = this.clouds[k], half = 160 * c.scale;
      c.x += (c._v + a.wind * 0.25) * h;
      if (c.x - half > W) c.x = -half; else if (c.x + half < 0) c.x = W + half;
      var on = c.idx < wantClouds[c.layer] || this.shower > 0.3 ? 1 : 0;
      c._on = clamp(c._on + (on ? h : -h) / ft, 0, 1);
      c.alpha = clamp(c._a * c._on * (1 + 0.15 * this.shower), 0, 1);
    }
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, a = this.ambient, u, live = p.emitter >= 0 && !p.dying && this._live(p);
    p.age += h; p.t += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'rain': {   // straight fast fall, leaning with the wind, ends in a splash ring on the lawn
        var vx = a.wind * (p.heavy ? 2.2 : 1.6);
        p.x += vx * h; p.y += p.vy * h;
        p.rot = -Math.atan2(vx, p.vy);
        p.sy = 1 + clamp((p.vy - 500) / 1000, 0, 0.6);
        p.alpha = p.a0 * (p.dying ? Math.max(0, p.fade) : 1);
        if (p.y >= p.landY) {
          if (this.particles.length < HARD_CAP) this._splash(p);
          if (live) { p.y = -20 - this.rng.float(0, 60); p.x = this.rng.float(-0.05, 1.05) * W; this._rainLand(p); }
          else { this._kill(p); return; }
        }
        if (p.x < -40) p.x = W + 30; else if (p.x > W + 40) p.x = -30;
        break;
      }
      case 'splashRing': {
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.size = p.s0 * (0.5 + 1.1 * u); p.alpha = p.a0 * (1 - u) * (1 - u); p.sy = 0.45;
        break;
      }
      case 'drift': {   // petals / leaves / snow: terminal fall speed, sway, gusts push sideways, flip as they spin
        p.x += (a.wind + p.sway * Math.cos(p.ph + p.age * p.sw)) * h;
        p.y += p.vy * (1 + 0.25 * Math.sin(p.ph * 1.7 + p.age * p.sw * 1.3)) * h;
        p.rot += (p.spin + a.gust * 1.5) * h;
        if (p.sprite !== 'snow') p.flipX = Math.cos(p.age * p.flipW + p.ph);
        p.alpha = p.a0 * p.fade;
        if (p.y > H + 24) { if (live) { p.y = -20; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      }
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (live) this._spawn(p.group, p.emitter, false); return; }
        p.rot += p.rotV * h;
        p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 900 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h + a.wind * 0.5 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'float': {   // music notes: rise with drag, sway
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.5, h); p.vy *= Math.pow(0.6, h);
        p.x += (p.vx + 18 * Math.sin(p.age * p.sw + p.rotV)) * h; p.y += p.vy * h; p.rot += p.rotV * h * 0.3;
        p.alpha = u < 0.1 ? u / 0.1 : u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      }
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
        break;
      case 'bit':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.25, h); p.vy = p.vy * Math.pow(p.sprite === 'drop' ? 0.8 : 0.25, h) + (p.g || 0) * h;
        p.x += (p.vx + a.wind * 0.3) * h; p.y += p.vy * h; p.rot += p.rotV * h;
        if (p.sprite === 'drop') p.rot = -Math.atan2(p.vx, p.vy);
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
  };
  /** A splash ring where a drop hits the lawn (short-lived; only while the total stays under HARD_CAP). */
  P._splash = function (d) {
    var p = { type: 'splash', sprite: 'splash', x: d.x, y: d.landY, size: d.size * 1.1, rot: 0, alpha: d.a0, layer: d.layer, kind: 'splashRing',
      group: -1, emitter: -1, a0: d.a0 * 0.9, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: d.color || null, life: 0.28, sy: 0.45 };
    p.s0 = p.size;
    this.particles.push(p);
  };

  RB.Weather = Weather;
})(window.RB = window.RB || {});
