/* Bim's Rainbow Rocket — RR.Weather (headless, deterministic sky by time of day; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new RR.Weather({ width, height, seed });
 *   wx.resize(W, H);
 *   wx.setWeather(i, { instant });   // 0 morning, 1 noon, 2 sunset, 3 night (2.5 s crossfade)
 *   wx.update(dt, { camDY });        // camDY = world.camY − last frame's camY (negative while climbing); fixed 1/60 s steps
 *   wx.burst(x, y, { kind:'confetti'|'puff'|'sparkle'|'stars', n, color })   // one-shot effects (same cap), SCREEN px
 *   wx.particles[] { sprite, x, y, size, rot, alpha, layer:'back'|'front', kind, glow?, color?, len?, ang? }   SCREEN px
 *       sprite: 'dust' | 'sparkle' | 'star' | 'puff' | 'confetti_a' | 'confetti_b' (game/assets/default/particles);
 *       kind 'streak' (falling star at night): draw a fading line of length len at angle ang ending at (x, y) + a star sprite.
 *       color: CSS colour to tint (rainbow glints, sunset embers, confetti) or null.
 *   wx.clouds[]    { sprite:'cloud_a'..'cloud_e', x, y, scale, alpha, layer 0|1|2, par }   background puffs, SCREEN px
 *       (centre, drawn 320·scale wide), parallax par 0.15 / 0.35 / 0.6: they slide down by −camDY·par and wrap.
 *   wx.stars[]     { x, y, r, phase, tw }    fixed night star field (SCREEN px, parallax 0.05, wraps), alpha = ambient.stars
 *   wx.ambient     { skyTop, skyMid, skyBottom, tint (rgba for the cloud tint), cloudShade, rimLight, sun, sunX, sunY,
 *                    moon, moonX, moonY, stars, rainbow, darkness, wind, gust, mood }   (0..1 numbers; sun/moon x,y 0..1 of the screen)
 */
(function (RR) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 80, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var PAR = [0.15, 0.35, 0.6], STAR_PAR = 0.05;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // ---- sky per time of day (calm, paler than every answer colour; DESIGN §3)
  var SKY = [
    { top: '#A9DBF7', mid: '#D3E3EE', bottom: '#FFE3C9', tint: [255, 236, 214, 0.10], shade: '#DCE2F6', rim: '#FFFFFF' },   // morning
    { top: '#7EC8F2', mid: '#A6D9F6', bottom: '#CDEBFB', tint: [255, 255, 255, 0.0], shade: '#DCE2F6', rim: '#FFFFFF' },     // noon
    { top: '#9E8BD6', mid: '#E7A2C4', bottom: '#FFB38A', tint: [255, 196, 170, 0.16], shade: '#D9C6E6', rim: '#FFC9A8' },   // sunset
    { top: '#1D2556', mid: '#2B2A62', bottom: '#3A2F6E', tint: [150, 160, 230, 0.22], shade: '#7D84B8', rim: '#C9D3FF' }    // night
  ];
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'rainbow', 'darkness', 'windBase', 'gusty'];
  var GLINT = ['#FF8A8A', '#FFC27A', '#FFE680', '#8FE0A0', '#8EC5FF', '#C7A6FF'];

  var MOODS = [
    { name: 'morning',
      amb: { sun: 1, sunX: 0.18, sunY: 0.2, moon: 0, moonX: 0.82, moonY: 0.16, stars: 0, rainbow: 0.5, darkness: 0, windBase: 6, gusty: 8 },
      clouds: [5, 4, 2],
      emitters: [
        { kind: 'mote', sprite: 'dust', layer: 'back', count: 18, size: [6, 12], alpha: [0.35, 0.7] },
        { kind: 'twinkle', sprite: 'sparkle', layer: 'back', count: 5, size: [10, 16], alpha: [0.5, 0.8] }
      ] },
    { name: 'noon',
      amb: { sun: 1, sunX: 0.78, sunY: 0.1, moon: 0, moonX: 0.82, moonY: 0.16, stars: 0, rainbow: 1, darkness: 0, windBase: 8, gusty: 10 },
      clouds: [5, 4, 3],
      emitters: [
        { kind: 'glint', sprite: 'sparkle', layer: 'back', count: 14, size: [10, 18], alpha: [0.55, 0.9], rainbow: true },
        { kind: 'mote', sprite: 'dust', layer: 'back', count: 6, size: [6, 10], alpha: [0.3, 0.5] }
      ] },
    { name: 'sunset',
      amb: { sun: 0.9, sunX: 0.8, sunY: 0.62, moon: 0.15, moonX: 0.16, moonY: 0.14, stars: 0.12, rainbow: 0.25, darkness: 0.08, windBase: 10, gusty: 14 },
      clouds: [4, 4, 2],
      emitters: [
        { kind: 'ember', sprite: 'dust', layer: 'back', count: 20, size: [7, 13], alpha: [0.5, 0.85], color: '#FFB46B', glow: true },
        { kind: 'twinkle', sprite: 'sparkle', layer: 'back', count: 4, size: [10, 16], alpha: [0.5, 0.8], color: '#FFD9A8' }
      ] },
    { name: 'night',
      amb: { sun: 0, sunX: 0.8, sunY: 0.7, moon: 1, moonX: 0.8, moonY: 0.16, stars: 1, rainbow: 0, darkness: 0.25, windBase: 4, gusty: 6 },
      clouds: [3, 2, 1],
      emitters: [
        { kind: 'twinkle', sprite: 'star', layer: 'back', count: 14, size: [10, 18], alpha: [0.6, 1], color: '#FFF4C2' },
        { kind: 'mote', sprite: 'dust', layer: 'back', count: 6, size: [5, 9], alpha: [0.25, 0.45], color: '#CFD8FF', glow: true }
      ] }
  ];
  MOODS.forEach(function (m, i) { m._top = hex(SKY[i].top); m._mid = hex(SKY[i].mid); m._bot = hex(SKY[i].bottom); m._shade = hex(SKY[i].shade); m._rim = hex(SKY[i].rim); m._tint = SKY[i].tint; });

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.rng = new RR.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0; this._camDY = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0; this.ramp = [0, 0, 0, 0];
    this.gust = 0; this._gustT = this.rng.float(4, 7); this._gustAge = -1; this._gustAmp = 1;
    this._fadeU = 1; this._from = null; this._streakT = 8;
    this.ambient = {};
    this._makeStars();
    this._makeClouds();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.SKY = SKY; Weather.CAP = HARD_CAP; Weather.FADE_TIME = FADE_TIME; Weather.PARALLAX = PAR;
  Weather.NAMES = ['morning', 'noon', 'sunset', 'night'];
  Weather.SPRITES = ['dust', 'sparkle', 'star', 'puff', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_d', 'cloud_e'];

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };

  P._makeStars = function () {     // own generator: the star field never changes the particle sequence
    var r = new RR.RNG((this.rng.seed ^ 0x5f3759df) >>> 0), W = this.width, H = this.height;
    var n = Math.round(90 * clamp(W * H / REF_AREA, 0.7, 1.6));
    this.stars = [];
    for (var i = 0; i < n; i++) this.stars.push({ x: r.float(0, W), y: r.float(0, H), r: r.chance(0.12) ? r.float(2, 3) : r.float(0.8, 1.8), phase: r.float(0, TAU), tw: r.float(1, 3) });
  };
  P._makeClouds = function () {    // 3 parallax layers spread over the screen height (they wrap endlessly)
    var r = new RR.RNG((this.rng.seed ^ 0x2545f491) >>> 0), W = this.width, H = this.height, k = clamp(W / 1280, 0.7, 1.3);
    this.clouds = [];
    for (var l = 0; l < 3; l++) {
      var n = Math.max(2, Math.round([5, 4, 3][l] * k * clamp(H / 720, 1, 2)));
      for (var i = 0; i < n; i++) {
        this.clouds.push({ sprite: r.pick(Weather.CLOUD_SPRITES), x: r.float(-0.1, 1.1) * W, y: (i + r.float(0.1, 0.9)) / n * (H + 300) - 150,
          scale: [0.45, 0.65, 0.9][l] * r.float(0.8, 1.2), alpha: [0.55, 0.7, 0.85][l], layer: l, par: PAR[l], _a: [0.55, 0.7, 0.85][l],
          _v: r.float(3, 8) * (l + 1) * 0.6, _on: 1, idx: i });
      }
    }
  };

  P.resize = function (W, H) {
    var sx = W / this.width, sy = H / this.height, i, a = [this.particles, this.clouds, this.stars];
    for (var k = 0; k < a.length; k++) for (i = 0; i < a[k].length; i++) { a[k][i].x *= sx; a[k][i].y *= sy; }
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
      this.particles.length = 0;
      this._populate(true);
    } else this._fadeU = 0;
    this._ambient();
  };

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), mid: a._mid.slice(), bot: a._bot.slice(), shade: a._shade.slice(), rim: a._rim.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };

  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) {
      f = { top: m._top, mid: m._mid, bot: m._bot, shade: m._shade, rim: m._rim, tint: m._tint };
      for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]];
    }
    a._top = C(f.top, m._top); a._mid = C(f.mid, m._mid); a._bot = C(f.bot, m._bot); a._shade = C(f.shade, m._shade); a._rim = C(f.rim, m._rim);
    a._tint = [L(f.tint[0], m._tint[0]), L(f.tint[1], m._tint[1]), L(f.tint[2], m._tint[2]), L(f.tint[3], m._tint[3])];
    a.skyTop = toHex(a._top); a.skyMid = toHex(a._mid); a.skyBottom = toHex(a._bot);
    a.cloudShade = toHex(a._shade); a.rimLight = toHex(a._rim);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    var wander = 0.3 * Math.sin(this.time * 0.37) + 0.15 * Math.sin(this.time * 0.91 + 1.3);
    a.wind = clamp(a._windBase * (1 + wander) + a._gusty * this.gust, -40, 40);
    a.darkness = clamp(a._darkness, 0, 0.3);
    a.gust = this.gust; a.mood = this.mood;
    delete a.windBase; delete a.gusty;
  };

  // ---------------------------------------------------------------- particles
  P._targets = function () {
    var k = this.areaScale(), out = [], sum = 0, m, e;
    for (m = 0; m < 4; m++) {
      out[m] = [];
      for (e = 0; e < MOODS[m].emitters.length; e++) { var t = MOODS[m].emitters[e].count * k * this.ramp[m]; out[m][e] = t; sum += t; }
    }
    var cap = AMBIENT_CAP, f = sum > cap ? cap / sum : 1;
    for (m = 0; m < 4; m++) for (e = 0; e < out[m].length; e++) out[m][e] = Math.floor(out[m][e] * f + 1e-9);
    return out;
  };

  P._populate = function (anywhere) {
    var tg = this._targets(), counts = [[], [], [], []], i, m, e;
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) counts[m][e] = 0;
    for (i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.emitter >= 0 && !p.dying) counts[p.mood][p.emitter]++; }
    for (m = 0; m < 4; m++) for (e = 0; e < tg[m].length; e++) {
      var have = counts[m][e], want = tg[m][e];
      var spawnN = anywhere ? want - have : Math.min(1, want - have);
      for (i = 0; i < spawnN && this.particles.length < HARD_CAP; i++) this._spawn(m, e, anywhere);
      if (have > want) {
        var extra = have - want;
        for (i = 0; i < this.particles.length && extra > 0; i++) {
          var q = this.particles[i];
          if (q.mood === m && q.emitter === e && !q.dying) { q.dying = true; extra--; }
        }
      }
    }
  };

  P._spawn = function (m, e, anywhere) {
    var em = MOODS[m].emitters[e], r = this.rng, W = this.width, H = this.height;
    var p = { sprite: em.sprite, x: r.float(0.02, 0.98) * W, y: r.float(0.02, 0.98) * H, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, mood: m, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: anywhere ? 1 : 0,
      dying: false, age: 0, vx: 0, vy: 0, color: em.color || null, par: r.float(0.5, 1) };
    if (em.glow) p.glow = true;
    if (em.rainbow) p.color = r.pick(GLINT);
    switch (em.kind) {
      case 'mote': case 'ember':
        p.vx = r.float(-6, 6); p.vy = em.kind === 'ember' ? r.float(-14, -6) : r.float(-4, 4);
        p.ph = r.float(0, TAU); p.w = r.float(0.4, 1.0);
        break;
      case 'twinkle': case 'glint':
        p.life = em.kind === 'glint' ? r.float(0.9, 1.8) : r.float(1.6, 3.2);
        p.age = anywhere ? r.float(0, p.life) : 0; p.fade = 1;
        p.vx = r.float(-4, 4); p.vy = r.float(-6, 2); p.rotV = r.float(-1, 1); p.s0 = p.size;
        break;
    }
    this.particles.push(p);
    return p;
  };

  /** One-shot effect particles in SCREEN px (count toward the hard cap). color = CSS colour (tint). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 24, r = this.rng;
    for (var i = 0; i < n && this.particles.length < HARD_CAP; i++) {
      var p = { sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: kind,
        mood: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, par: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18);
        if (!o.color) p.color = r.pick(GLINT);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
      } else if (kind === 'puff') {
        p.sprite = 'puff'; p.size = r.float(18, 30); p.layer = 'back';
        var a2 = r.float(0, Math.PI); p.vx = Math.cos(a2) * r.float(30, 90); p.vy = Math.sin(a2) * r.float(10, 50); p.life = r.float(0.45, 0.8); p.rotV = r.float(-2, 2);
      } else {   // 'sparkle' | 'stars' (a star shower: the shooting-star catch, wagon → stars)
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a3 = r.float(0, TAU), s3 = r.float(80, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3 - (kind === 'stars' ? 120 : 0);
        p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 420 : 0;
        if (!o.color && kind === 'stars') p.color = '#FFD54A';
      }
      p.kind = kind === 'stars' || kind === 'sparkle' ? 'spark' : kind;
      p.s0 = p.size;
      this.particles.push(p);
    }
  };

  P.update = function (dt, env) {
    if (env && env.camDY) this._camDY += env.camDY;
    if (!(dt > 0)) return;
    this._acc += Math.min(dt, 1);
    var n = Math.floor((this._acc + 1e-12) / this.stepH);
    if (n <= 0) return;
    var shift = this._camDY / n; this._camDY = 0;
    while (this._acc >= this.stepH - 1e-12) { this._acc -= this.stepH; this._step(this.stepH, shift); }
  };

  P._step = function (h, camDY) {
    this.time += h;
    var k, W = this.width, H = this.height;
    for (k = 0; k < 4; k++) this.ramp[k] = clamp(this.ramp[k] + (k === this.mood ? h : -h) / this.fadeTime, 0, 1);
    if (this._fadeU < 1) this._fadeU = Math.min(1, this._fadeU + h / this.fadeTime);
    this._gustT -= h;
    if (this._gustT <= 0) { this._gustT = this.rng.float(4, 7); this._gustAge = 0; this._gustAmp = this.rng.float(0.6, 1); }
    if (this._gustAge >= 0) {
      var g = this._gustAge, e = g < 0.6 ? g / 0.6 : g < 1.4 ? 1 : g < 2.9 ? 1 - (g - 1.4) / 1.5 : -1;
      if (e < 0) { this._gustAge = -1; this.gust = 0; } else { this.gust = e * e * (3 - 2 * e) * this._gustAmp; this._gustAge += h; }
    }
    this._ambient();
    var a = this.ambient;
    // background puffs: drift with the wind, slide down while the camera climbs (parallax), wrap vertically
    for (k = 0; k < this.clouds.length; k++) {
      var c = this.clouds[k], half = 160 * c.scale;
      c.x += (c._v + a.wind * 0.3 * c.par) * h; c.y -= camDY * c.par;
      if (c.x - half > W) c.x = -half; else if (c.x + half < 0) c.x = W + half;
      if (c.y - 90 * c.scale > H) { c.y -= H + 180 * c.scale + 60; c.x = this.rng.float(-0.1, 1.1) * W; }
      else if (c.y + 90 * c.scale < -60) c.y += H + 180 * c.scale + 60;
      c._on = clamp(c._on + (c.idx < MOODS[this.mood].clouds[c.layer] ? h : -h) / this.fadeTime, 0, 1);
      c.alpha = c._a * c._on;
    }
    for (k = 0; k < this.stars.length; k++) {
      var s = this.stars[k]; s.y -= camDY * STAR_PAR;
      if (s.y > H) s.y -= H; else if (s.y < 0) s.y += H;
    }
    // falling star streaks at night (every ~8 s)
    if (this.ramp[3] > 0.5) {
      this._streakT -= h;
      if (this._streakT <= 0 && this.particles.length < HARD_CAP) {
        this._streakT = this.rng.float(6.5, 9.5);
        var r = this.rng, dir = r.chance(0.5) ? 1 : -1;
        this.particles.push({ sprite: 'star', kind: 'streak', layer: 'back', x: r.float(0.15, 0.85) * W, y: r.float(0.05, 0.35) * H,
          vx: dir * r.float(380, 520), vy: r.float(160, 240), size: 12, rot: 0, alpha: 0, a0: 1, fade: 1, age: 0, life: 1.1,
          len: 0, ang: 0, mood: -1, emitter: -1, dying: false, color: '#FFF4C2', par: 1 });
      }
    }
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h, camDY);
  };

  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };

  P._stepP = function (p, h, camDY) {
    var W = this.width, H = this.height, a = this.ambient, u;
    p.age += h;
    p.y -= camDY * (p.layer === 'front' ? 1 : 0.6 * p.par);   // in the sky: they slide down as the camera climbs
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'mote': case 'ember':
        p.x += (p.vx + a.wind * 0.4 + 8 * Math.sin(p.ph + p.age * p.w)) * h;
        p.y += (p.vy + 5 * Math.cos(p.ph * 1.3 + p.age * p.w * 0.8)) * h;
        p.rot += 0.3 * h;
        p.alpha = p.a0 * p.fade * (p.kind === 'ember' ? 0.75 + 0.25 * Math.sin(p.age * 3 + p.ph) : 1);
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
        break;
      case 'twinkle': case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (!p.dying && p.mood === this.mood) this._spawn(p.mood, p.emitter, false); return; }
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'streak':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.x += p.vx * h; p.y += p.vy * h;
        p.len = 160 * Math.sin(Math.PI * Math.min(1, u * 1.4)); p.ang = Math.atan2(p.vy, p.vx);
        p.alpha = Math.sin(Math.PI * u);
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
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.1, h); p.vy = p.vy * Math.pow(0.1, h) - 20 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.7 + 0.8 * u); p.alpha = 0.7 * (1 - u);
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

  RR.Weather = Weather;
})(window.RR = window.RR || {});
