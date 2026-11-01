/* Mầm's Treasure Reef — TR.Weather (headless, deterministic times of day under the sea; DESIGN §5.3)
 *
 *   const wx = new TR.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 morning, 1 noon, 2 sunset, 3 night (2.5 s crossfade)
 *   wx.update(dt, { groundY });      // fixed 1/60 s sub-steps (accumulator) → same result for any dt split
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle', n })   // one-shot effects ('puff' = sand puff), same cap
 *   wx.particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front', kind }
 *   wx.clouds[]    { sprite:'cloud1..3', x, y, scale, alpha }  // drifting surface light blobs / plankton clouds
 *   wx.stars[]     { x, y, r, phase, tw }   // fixed twinkle field near the surface; alpha = ambient.stars·(0.55 + 0.45·sin(phase + tw·time))
 *   wx.shafts[]    { x, w, alpha, phase }   // light shafts from the surface (x = top centre, w = width at the top, alpha 0..1 already
 *                                           //   scaled by ambient.sun and a slow pulse; phase for the renderer's own wobble)
 *   wx.auroraT     seconds (plankton-glow animation clock), wx.time
 *   wx.ambient     { skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, moon, moonX, moonY,
 *                    stars, aurora (= plankton glow 0..1), darkness, gust, windBase }
 *                  skyTop/skyBottom = water gradient, horizon = surface glow colour; sunX/sunY/moonX/moonY are 0..1 of the screen.
 *                  darkness ≤ 0.28 is a navy tint for the BACKGROUND only (never over items, mounds, chests, Tutu).
 *                  wind = current (kelp sway), sway = kelp sway amplitude.
 *
 * Draw a particle: translate(x,y) → rotate(rot) → scale(flipX,1) → sprite of width `size`
 * centred, globalAlpha = alpha. Layers: 'sky' (behind the far reef, near the surface), 'back' (behind items/chests,
 * in front of the scenery), 'front' (over everything — kept translucent and few).
 * Total particles ≤ 140 (ambient share scales with W×H; bursts use the rest).
 *
 * Motion models (docs/MECHANICS.md §7):
 *  bubble  : rises  vy = −rise·(0.85 + 0.15 sin), wobbles sideways  vx = current·40·depth + L·ω·cos(ωt+φ), grows a little,
 *            pops near the surface (y < 0.06 H) and respawns at the bottom; 'front' bubbles are bigger and translucent.
 *  fishlet : a shoal in the 'back' layer swims horizontally (dir shared per mood), bobbing; wraps around.
 *  sparkle : twinkle life 1–2 s (alpha sin(πu), size pulse), slow upward drift (morning glitter in the water).
 *  star    : twinkle near the surface, long life 2–4 s, no drift (night).
 *  plankton: glow dots (night), very slow drift, alpha pulses with aurora (plankton glow).
 *  gusts   : every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) push the current (wind/sway), scaled by the mood's base.
 */
(function (TR) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 140, AMBIENT_CAP = 112, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + (16777216 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1).toUpperCase(); }

  // ---- water colours per time of day (DESIGN §3: turquoise lighter/greener than answer blue; night navy #13305A)
  var SKY = [
    { top: '#7FCBD8', bottom: '#D8ECE0', horizon: '#F7D3C2', tint: 'rgba(255,190,160,0.08)' },   // 0 morning: peach glow on turquoise
    { top: '#5FC9DD', bottom: '#B4EAEC', horizon: '#EAFBFF', tint: null },                          // 1 noon: bright turquoise
    { top: '#E9907E', bottom: '#7C6DB3', horizon: '#FFC29A', tint: 'rgba(255,140,96,0.10)' },     // 2 sunset: orange-pink top → violet bottom
    { top: '#13305A', bottom: '#1F4A73', horizon: '#2E6190', tint: 'rgba(40,70,140,0.08)' }       // 3 night: navy, bioluminescence
  ];
  var NUM_KEYS = ['wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'aurora', 'darkness'];

  var MOODS = [
    { name: 'morning',
      amb: { wind: 0.12, sway: 0.2, sun: 1, sunX: 0.8, sunY: 0.2, moon: 0, moonX: 0.86, moonY: 0.2, stars: 0, aurora: 0, darkness: 0 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.55, scale: [0.55, 0.85] },
      shafts: { n: 4, alpha: 0.28 },
      emitters: [
        { kind: 'sparkle', layer: 'sky', count: 8, size: [10, 18], alpha: [0.5, 0.85], sprite: 'sparkle' },
        { kind: 'sparkle', layer: 'back', count: 6, size: [9, 14], alpha: [0.45, 0.8], sprite: 'sparkle' },
        { kind: 'bubble', layer: 'back', count: 8, size: [8, 14], alpha: [0.45, 0.7], rise: [14, 24] }
      ] },
    { name: 'noon',
      amb: { wind: 0.25, sway: 0.35, sun: 1, sunX: 0.66, sunY: 0.08, moon: 0, moonX: 0.86, moonY: 0.2, stars: 0, aurora: 0, darkness: 0 },
      clouds: { n: 4, speed: [10, 18], alpha: 0.6, scale: [0.6, 0.95] },
      shafts: { n: 5, alpha: 0.35 },
      emitters: [
        { kind: 'bubble', layer: 'back', count: 24, size: [8, 16], alpha: [0.5, 0.8], rise: [28, 48] },
        { kind: 'bubble', layer: 'front', count: 4, size: [18, 26], alpha: [0.3, 0.5], rise: [40, 60], depth: 1.3 },
        { kind: 'fishlet', layer: 'back', count: 9, size: [16, 24], alpha: [0.6, 0.85], sprite: 'fishlet', speed: [40, 70] }
      ] },
    { name: 'sunset',
      amb: { wind: 0.18, sway: 0.3, sun: 1, sunX: 0.24, sunY: 0.3, moon: 0.15, moonX: 0.84, moonY: 0.14, stars: 0.1, aurora: 0, darkness: 0.08 },
      clouds: { n: 3, speed: [5, 10], alpha: 0.5, scale: [0.6, 0.95] },
      shafts: { n: 3, alpha: 0.22 },
      emitters: [
        { kind: 'bubble', layer: 'back', count: 14, size: [8, 14], alpha: [0.45, 0.7], rise: [16, 28] },
        { kind: 'sparkle', layer: 'sky', count: 5, size: [10, 16], alpha: [0.45, 0.75], sprite: 'sparkle' }
      ] },
    { name: 'night',
      amb: { wind: 0.1, sway: 0.2, sun: 0, sunX: 0.12, sunY: 0.4, moon: 1, moonX: 0.78, moonY: 0.1, stars: 1, aurora: 1, darkness: 0.28 },
      clouds: { n: 2, speed: [3, 6], alpha: 0.3, scale: [0.5, 0.8] },
      shafts: { n: 2, alpha: 0.12 },
      emitters: [
        { kind: 'star', layer: 'sky', count: 16, size: [10, 18], alpha: [0.7, 1], sprite: 'star' },
        { kind: 'plankton', layer: 'back', count: 22, size: [6, 12], alpha: [0.5, 0.9], sprite: 'plankton' },
        { kind: 'bubble', layer: 'back', count: 10, size: [8, 14], alpha: [0.4, 0.6], rise: [12, 20] }
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
    this.rng = new TR.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0; this.auroraT = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = []; this.shafts = [];
    this.mood = 0; this.weather = 0;
    this.ramp = [0, 0, 0, 0];
    this.groundY = this.height - 70;
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1;
    this._fadeU = 1; this._from = null;
    this.ambient = {};
    this._fishDir = 1;
    this._makeStars();
    this._makeShafts();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS;
  Weather.SKY = SKY;
  Weather.CAP = HARD_CAP;
  Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['bubble1', 'bubble2', 'sparkle', 'star', 'plankton', 'sand', 'fishlet', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud1', 'cloud2', 'cloud3'];

  var P = Weather.prototype;

  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.55, 1.5); };

  P._makeStars = function () {     // own generator: the twinkle field never changes the particle sequence
    var r = new TR.RNG((this.rng.seed ^ 0x5f3759df) >>> 0), W = this.width, gY = this.groundY;
    var n = Math.round(70 * clamp(W * this.height / REF_AREA, 0.7, 1.5));
    this.stars = [];
    for (var i = 0; i < n; i++) {
      this.stars.push({ x: r.float(0, W), y: r.float(0.03, 0.55) * gY, r: r.chance(0.12) ? r.float(2, 3) : r.float(0.8, 1.8),
        phase: r.float(0, TAU), tw: r.float(1, 3) });
    }
  };
  P._makeShafts = function () {    // 6 shaft slots spread over the width; each mood lights its first n
    var r = new TR.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width;
    this.shafts = [];
    for (var i = 0; i < 6; i++) {
      this.shafts.push({ x: W * (i + r.float(0.2, 0.8)) / 6, w: r.float(0.06, 0.12) * W, alpha: 0, phase: r.float(0, TAU),
        _x0: (i + r.float(0.2, 0.8)) / 6, _w0: r.float(0.06, 0.12), _sp: r.float(0.15, 0.3), _drift: r.float(0.01, 0.025) });
      this.shafts[i].x = W * this.shafts[i]._x0; this.shafts[i].w = W * this.shafts[i]._w0;
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i;
    for (i = 0; i < this.particles.length; i++) { this.particles[i].x *= sx; this.particles[i].y *= sy; }
    for (i = 0; i < this.clouds.length; i++) { this.clouds[i].x *= sx; this.clouds[i].y *= sy; }
    for (i = 0; i < this.stars.length; i++) { this.stars[i].x *= sx; this.stars[i].y *= sy; }
    for (i = 0; i < this.shafts.length; i++) { this.shafts[i].x *= sx; this.shafts[i].w *= sx; }
    this.groundY *= sy;
    this.width = W; this.height = H;
  };

  P.setWeather = function (i, opts) {
    i = ((i | 0) % 4 + 4) % 4;
    var instant = opts && opts.instant;
    if (!instant && i === this.mood && this._from) return;
    this._from = this._snapshot();
    this.mood = this.weather = i;
    this._fishDir = this.rng.sign();
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
    this._stepShafts(0);
  };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a.skyTop) return null;
    var s = { top: hex(a.skyTop), bot: hex(a.skyBottom), hor: hex(a.horizon), tint: a._tint ? a._tint.slice() : null };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]] !== undefined ? a['_' + NUM_KEYS[k]] : a[NUM_KEYS[k]];
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
    a.windBase = a._wind;
    a.wind = a._wind * (1 + 0.8 * this.gust);
    a.sway = clamp(a._sway + 0.25 * this.gust, 0, 1);
    a.darkness = clamp(a._darkness, 0, 0.28);
    a.gust = this.gust;
  };

  // ---------------------------------------------------------------- light shafts
  P._stepShafts = function (h) {
    var a = this.ambient, W = this.width, cur = MOODS[this.mood].shafts;
    for (var i = 0; i < this.shafts.length; i++) {
      var sh = this.shafts[i];
      sh._x0 += sh._drift * h * (0.5 + 0.5 * Math.sin(sh.phase + this.time * 0.1));
      if (sh._x0 > 1.1) sh._x0 -= 1.2;
      sh.x = W * sh._x0; sh.w = W * sh._w0 * (1 + 0.1 * Math.sin(sh.phase + this.time * sh._sp));
      var want = i < cur.n ? cur.alpha : 0;
      var pulse = 0.75 + 0.25 * Math.sin(sh.phase + this.time * sh._sp * 2);
      var target = want * Math.max(a.sun, 0.6 * a.moon) * pulse;    // night: faint moon shafts
      sh.alpha = h > 0 ? sh.alpha + (target - sh.alpha) * Math.min(1, h / 1.2) : target;
      sh.alpha = clamp(sh.alpha, 0, 1);
    }
  };

  // ---------------------------------------------------------------- clouds (surface light blobs)
  P._fillClouds = function (spread) {
    var c = MOODS[this.mood].clouds, W = this.width, H = this.height, r = this.rng;
    var n = Math.max(1, Math.round(c.n * clamp(W / 1280, 0.7, 1.3)));
    for (var i = 0; i < n; i++) {
      var sc = r.float(c.scale[0], c.scale[1]);
      this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: (i + r.float(0.15, 0.85)) / n * (W + 300 * sc) - 150 * sc,
        y: H * r.float(0.03, H > W ? 0.14 : 0.2), scale: sc, alpha: spread ? c.alpha : 0,
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
      var spawnN = anywhere ? want - have : Math.min(2, want - have);
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

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, H = this.height, gY = this.groundY;
    var p = { sprite: em.sprite || 'bubble1', x: 0, y: 0, size: r.float(em.size[0], em.size[1]), rot: 0, flipX: 1, alpha: 0,
      layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, depth: em.depth || 1 };
    switch (em.kind) {
      case 'bubble':
        p.sprite = r.chance(0.5) ? 'bubble1' : 'bubble2';
        p.rise = r.float(em.rise[0], em.rise[1]) * p.depth;
        p.w = r.float(1.2, 2.4); p.ph = r.float(0, TAU); p.L = r.float(4, 10) * p.depth;
        p.s0 = p.size; p.rotV = r.float(-0.6, 0.6);
        if (anywhere) { p.x = r.float(0, W); p.y = r.float(0.08, 1.0) * gY; }
        else { p.x = r.float(0.02, 0.98) * W; p.y = gY + r.float(0, 30); p.fade = 1; }
        break;
      case 'fishlet':
        p.dir = this._fishDir; p.flipX = p.dir;
        p.speed = r.float(em.speed[0], em.speed[1]); p.ph = r.float(0, TAU); p.w = r.float(1.5, 3);
        p.y0 = r.float(0.3, 0.75) * gY;
        if (anywhere) p.x = r.float(0, W); else p.x = p.dir > 0 ? -40 - r.float(0, 0.3 * W) : W + 40 + r.float(0, 0.3 * W);
        p.y = p.y0; p.fade = 1;
        break;
      case 'sparkle':
      case 'star':
        p.x = r.float(0.04, 0.96) * W;
        p.y = (p.layer === 'sky' ? r.float(0.05, em.kind === 'star' ? 0.5 : 0.45) : r.float(0.35, 0.85)) * gY;
        p.life = em.kind === 'star' ? r.float(2, 4) : r.float(1, 2);
        p.age = anywhere ? r.float(0, p.life) : 0;
        p.vx = em.kind === 'sparkle' ? r.float(-6, 6) : 0; p.vy = em.kind === 'sparkle' ? r.float(-14, -4) : 0;
        p.fade = 1; p.rotV = r.float(-1, 1); p.s0 = p.size;
        break;
      case 'plankton':
        p.x = r.float(0, W); p.y = r.float(0.1, 1.0) * gY;
        p.vx = r.float(-6, 6); p.vy = r.float(-5, 3); p.ph = r.float(0, TAU); p.w = r.float(0.6, 1.4); p.s0 = p.size;
        p.life = r.float(4, 8); p.age = anywhere ? r.float(0, p.life) : 0;
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

  /** One-shot effect particles (count toward the hard cap): confetti (lagoon fanfare), puff (sand puff), sparkle (landing). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), flipX: 1, alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, depth: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        var ang = r.float(-Math.PI * 0.9, -Math.PI * 0.1), sp = r.float(250, 620);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.6, 2.4);
      } else if (kind === 'puff') {
        p.sprite = 'sand'; p.size = r.float(18, 28); p.layer = 'back';
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
    this.time += h; this.auroraT += h;
    var k;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.7, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp * clamp(this.ambient.windBase / 0.25, 0, 1.2); this._gustAge += h; }
    }
    this._ambient();
    this._stepShafts(h);
    this._stepClouds(h);
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };

  P._stepP = function (p, h) {
    var W = this.width, H = this.height, gY = this.groundY, a = this.ambient, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this.particles.splice(this.particles.indexOf(p), 1); return; }
    var curPx = a.wind * 40;
    switch (p.kind) {
      case 'bubble': {
        var ph = p.w * p.age + p.ph, sn = Math.sin(ph), cs = Math.cos(ph);
        p.vx = curPx * p.depth + p.L * p.w * cs;
        p.vy = -p.rise * (0.85 + 0.15 * sn) * (1 + 0.6 * this.gust);
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (1 + 0.25 * clamp(1 - p.y / Math.max(1, gY), 0, 1));   // grows a little on the way up
        var surf = 0.06 * H;
        p.alpha = p.a0 * p.fade * clamp((p.y - surf) / 40, 0, 1);              // pops near the surface
        if (p.y < surf) { this._respawn(p); return; }
        if (p.x > W + 30) p.x -= W + 60; else if (p.x < -30) p.x += W + 60;
        break;
      }
      case 'fishlet': {
        p.x += p.dir * p.speed * (1 + 0.3 * this.gust) * h;
        p.y = p.y0 + 6 * Math.sin(p.ph + p.w * p.age);
        p.rot = 0.08 * Math.cos(p.ph + p.w * p.age) * p.dir;
        p.flipX = p.dir;
        p.alpha = p.a0 * p.fade;
        if (p.dir > 0 && p.x > W + 60) this._respawn(p); else if (p.dir < 0 && p.x < -60) this._respawn(p);
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
        if (p.s0 === undefined) p.s0 = p.size;
        p.size = p.s0 * (0.6 + 0.6 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'plankton': {
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.x += (p.vx + curPx * 0.3) * h; p.y += p.vy * h;
        p.size = p.s0 * (0.8 + 0.2 * Math.sin(p.ph + p.w * p.age * TAU * 0.3));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(p.ph + p.w * p.age)) * clamp(a.aurora, 0.3, 1);
        if (p.x > W + 20) p.x -= W + 40; else if (p.x < -20) p.x += W + 40;
        break;
      }
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 900 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW) >= 0 ? 1 : -1;
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this.particles.splice(this.particles.indexOf(p), 1); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) + 30 * h;     // sand settles back down
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
        break;
    }
  };

  TR.Weather = Weather;
})(window.TR = window.TR || {});
