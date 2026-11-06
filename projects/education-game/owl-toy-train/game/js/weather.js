/* Momo's Toy Train — TT.Weather (headless, deterministic toy-room times of day; DESIGN §5.3). Node-safe (no DOM).
 *
 *   const wx = new TT.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);         // world.layout.groundY
 *   wx.setWeather(i, { instant });    // 0 morning, 1 noon, 2 sunset, 3 night (2.5 s crossfade)
 *   wx.setParty(on, { instant })      // session-done party: stars + sparkles drift whatever the mood (setNight = alias)
 *   wx.update(dt);                    // fixed 1/60 s steps
 *   wx.addPuff(x, y, v, small?)       // a steam puff from the chimney (world 'puff' event: x, y, v = train velocity px/s)
 *   wx.burst(x, y, { kind, n, color })   // one-shot effects, SCREEN px: 'confetti' | 'sparkle' | 'stars' | 'puff' | 'bubbles' |
 *                                        //   'feathers' | 'steam' (3 whistle rings)
 *   wx.particles[] { type, sprite (= type), x, y, size, rot, alpha, layer:'back'|'front', kind, color?, flipX? }  SCREEN px
 *       sprite ∈ Weather.SPRITES = particles/<sprite>.svg (32×32), drawn size px (square), centred, rotated rot, alpha.
 *       color: CSS colour to tint (confetti, sparkles) or null. 'back' = in the room behind the train (puffs, motes, wall
 *       stars), 'front' = over the train and cargo.
 *   wx.stars[]     { x, y, r (px), alpha, phase }  night-light stars projected on the wall (SCREEN px; slowly turning)
 *   wx.clouds[]    { sprite:'cloud_a'|'cloud_b', u, v (0..1 inside the window glass), scale (× 320 px), alpha }
 *   wx.ambient     { skyTop, skyBottom, skyMid, wall (hex = the far layer's top colour), tint (rgba | null), sun 0..1,
 *                    sunX, sunY (0..1 of the window), moon 0..1, moonX, moonY, stars 0..1, beam 0..1 (sunbeam strength),
 *                    beamLine {x0, y0, x1, y1, w} (SCREEN px: the sunbeam's centre line + width), darkness 0..0.32,
 *                    lamp 0..1 (night-light + headlamp), mood 'morning'|'noon'|'sunset'|'night', moodIndex, env (= mood:
 *                    env/<far|mid|ground>_<env>.svg), envFrom, envMix 0..1, party 0..1 }
 */
(function (TT) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 64, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['morning', 'noon', 'sunset', 'night'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §3 skies + walls
  var MOODS = [
    { name: 'morning', top: '#BFE3F5', bottom: '#FFF3D6', wall: '#F3E6CF', tint: [255, 236, 200, 0.04],
      amb: { sun: 0.85, sunX: 0.3, sunY: 0.62, moon: 0, moonX: 0.7, moonY: 0.25, stars: 0, beam: 1, darkness: 0, lamp: 0 }, clouds: 2,
      emitters: [{ kind: 'mote', sprite: 'mote', layer: 'back', count: 18, size: [6, 11], alpha: [0.45, 0.85], inBeam: true },
        { kind: 'mote', sprite: 'mote', layer: 'front', count: 6, size: [8, 13], alpha: [0.35, 0.6], inBeam: true }] },
    { name: 'noon', top: '#86CBF0', bottom: '#DFF2FB', wall: '#F6EBD8', tint: [255, 250, 235, 0],
      amb: { sun: 1, sunX: 0.62, sunY: 0.18, moon: 0, moonX: 0.7, moonY: 0.25, stars: 0, beam: 0.35, darkness: 0, lamp: 0 }, clouds: 3,
      emitters: [{ kind: 'bubble', sprite: 'bubble', layer: 'front', count: 7, size: [22, 40], alpha: [0.6, 0.9] },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 6, size: [6, 10], alpha: [0.3, 0.55], inBeam: true }] },
    { name: 'sunset', top: '#F7A86B', bottom: '#FCD9A8', wall: '#F2D6C0', tint: [255, 170, 110, 0.07],
      amb: { sun: 0.9, sunX: 0.76, sunY: 0.82, moon: 0, moonX: 0.25, moonY: 0.3, stars: 0.15, beam: 0.6, darkness: 0.06, lamp: 0.3 }, clouds: 2,
      emitters: [{ kind: 'feather', sprite: 'feather', layer: 'front', count: 5, size: [18, 28], alpha: [0.75, 0.95] },
        { kind: 'mote', sprite: 'mote', layer: 'back', count: 12, size: [6, 11], alpha: [0.4, 0.75], inBeam: true, warm: true }] },
    { name: 'night', top: '#1D2350', bottom: '#3B3F7A', wall: '#4B4F78', tint: [40, 50, 110, 0.12],
      amb: { sun: 0, sunX: 0.76, sunY: 0.9, moon: 1, moonX: 0.68, moonY: 0.26, stars: 1, beam: 0, darkness: 0.32, lamp: 1 }, clouds: 1,
      emitters: [{ kind: 'twinkle', sprite: 'sparkle', layer: 'back', count: 8, size: [8, 16], alpha: [0.5, 0.9] }] }
  ];
  MOODS.forEach(function (m) { m._top = hex(m.top); m._bot = hex(m.bottom); m._wall = hex(m.wall); });
  var NUM_KEYS = ['sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'beam', 'darkness', 'lamp'];
  var PARTY_EMIT = [{ kind: 'twinkle', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], gold: true },
    { kind: 'twinkle', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95] }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var GLINT = ['#FFF6C8', '#FFFFFF', '#E8F6FF'];
  var WALL_STARS = 14;

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 18;
    this.rng = new TT.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = []; this.clouds = []; this.stars = [];
    this.mood = 0; this.weather = 0; this.season = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.ambient = {};
    this._makeClouds(); this._makeStars();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['mote', 'bubble', 'feather', 'star', 'sparkle', 'puff', 'confetti_a', 'confetti_b'];
  Weather.CLOUD_SPRITES = ['cloud_a', 'cloud_b'];
  Weather.WALL = MOODS.map(function (m) { return m.wall; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  P._makeClouds = function () {
    var r = new TT.RNG((this.rng.seed ^ 0x2545f491) >>> 0);
    this.clouds = [];
    for (var i = 0; i < 3; i++) this.clouds.push({ sprite: Weather.CLOUD_SPRITES[i % 2], u: (i + r.float(0, 0.8)) / 3, v: r.float(0.12, 0.45),
      scale: r.float(0.35, 0.55), alpha: 0, _v: r.float(0.006, 0.014), _on: 0, idx: i });
  };
  /** Night-light stars: points on the wall around the night-light (centre ≈ upper middle of the room), turning slowly. */
  P._makeStars = function () {
    var r = new TT.RNG((this.rng.seed ^ 0x7f4a7c15) >>> 0);
    this._starDef = [];
    for (var i = 0; i < WALL_STARS; i++) this._starDef.push({ a: r.float(0, TAU), d: r.float(0.18, 0.62), r: r.float(5, 11), phase: r.float(0, TAU), tw: r.float(0.6, 1.4) });
    this._starAng = 0;
    this._placeStars();
  };
  P._placeStars = function () {
    var W = this.width, H = this.height, cx = 0.5 * W, cy = 0.36 * H, R = 0.5 * Math.max(W, H * 1.2), a = this.ambient || {}, k = a.stars || 0;
    this.stars = this._starDef.map(function (s) {
      var ang = s.a + this._starAng;
      return { x: cx + Math.cos(ang) * s.d * R, y: cy + Math.sin(ang) * s.d * R * 0.55, r: s.r, phase: s.phase,
        alpha: k * (0.55 + 0.45 * Math.sin(this.time * s.tw + s.phase)) };
    }, this).filter(function (s) { return s.y < this.groundY - 60 && s.y > 10; }, this);
  };

  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; }
    this.width = W; this.height = H;
    this.groundY = groundY !== undefined && isFinite(groundY) ? groundY : this.groundY * sy;
    this._ambient(); this._placeStars();
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
      this.clouds.forEach(function (c) { c._on = c.idx < MOODS[i].clouds ? 1 : 0; });
      this._ambient();
      this._populate(true);
    } else { this._fadeU = 0; this._ambient(); }
    this._placeStars();
  };
  P.setParty = function (on, opts) { this._partyT = on ? 1 : 0; if (opts && opts.instant) this.party = this._partyT; this._ambient(); };
  P.setNight = P.setParty;

  P._snapshot = function () {
    var a = this.ambient;
    if (!a || !a._top) return null;
    var s = { top: a._top.slice(), bot: a._bot.slice(), wall: a._wall.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, bot: m._bot, wall: m._wall, tint: m.tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._bot = C(f.bot, m._bot); a._wall = C(f.wall, m._wall);
    a._tint = [L(f.tint[0], m.tint[0]), L(f.tint[1], m.tint[1]), L(f.tint[2], m.tint[2]), L(f.tint[3], m.tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    a.skyTop = toHex(a._top); a.skyBottom = toHex(a._bot);
    a.skyMid = toHex([(a._top[0] + a._bot[0]) / 2, (a._top[1] + a._bot[1]) / 2, (a._top[2] + a._bot[2]) / 2]);
    a.wall = toHex(a._wall);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.stars = clamp(Math.max(a._stars, this.party), 0, 1);
    a.party = this.party;
    a.beamLine = this._beamLine();
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
    a.season = a.mood; a.seasonIndex = this.mood;   // old names
  };
  /** The sunbeam from the window falls diagonally down to the right (morning) / left (sunset) onto the rug. */
  P._beamLine = function () {
    var W = this.width, H = this.height, a = this.ambient, left = (a._sunX || 0.5) > 0.5;
    var x0 = W * 0.5, y0 = H * 0.2, x1 = left ? W * 0.2 : W * 0.82, y1 = Math.min(this.groundY, H * 0.95);
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: Math.max(120, 0.16 * Math.min(W, 1400)) };
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
  /** A point inside the sunbeam band (u along, offset across). */
  P._inBeam = function (r) {
    var B = this.ambient.beamLine || this._beamLine(), u = r.float(0, 1), dx = B.x1 - B.x0, dy = B.y1 - B.y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = r.float(-0.5, 0.5) * B.w;
    return { x: B.x0 + dx * u - dy / L * off, y: B.y0 + dy * u + dx / L * off };
  };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, H = this.height;
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.08, 0.85) * H, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: null, ph: r.float(0, TAU) };
    switch (em.kind) {
      case 'mote': {
        var b = em.inBeam && this.ambient.beam > 0.2 ? this._inBeam(r) : { x: p.x, y: p.y };
        p.x = b.x; p.y = b.y; p.vx = r.float(-8, 8); p.vy = r.float(-6, 4); p.sw = r.float(0.3, 0.8); p.life = r.float(5, 9);
        p.age = anywhere ? r.float(0, p.life) : 0; if (em.warm) p.color = '#FFD9A0';
        break;
      }
      case 'bubble':
        p.x = r.float(0.05, 0.95) * W; p.y = anywhere ? r.float(0.2, 0.9) * H : this.groundY - r.float(20, 140);
        p.vy = -r.float(28, 55); p.vx = r.float(-10, 10); p.sw = r.float(0.8, 1.6); p.life = r.float(4, 8); p.age = anywhere ? r.float(0, p.life * 0.7) : 0;
        p.rot = 0;
        break;
      case 'feather':
        p.y = anywhere ? r.float(0, 0.8) * H : -20; p.vy = r.float(18, 34); p.sway = r.float(30, 55); p.sw = r.float(0.7, 1.3); p.spin = r.float(-0.8, 0.8);
        break;
      case 'twinkle':
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.05, 0.6) * H; p.rotV = r.float(-1, 1); p.s0 = p.size;
        p.color = em.gold ? '#FFD54A' : r.pick(GLINT); p.fade = 1;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.s0 || p.size;
    this.particles.push(p);
    return p;
  };

  /** Steam from the chimney: a soft puff that rises, swells, trails behind the moving train and fades. */
  P.addPuff = function (x, y, v, small) {
    if (this.particles.length >= HARD_CAP) this._dropOldest();
    var r = this.rng, s = small ? r.float(18, 26) : r.float(30, 46);
    this.particles.push({ type: 'puff', sprite: 'puff', x: x + r.float(-4, 4), y: y - 4, size: s, s0: s, rot: r.float(0, TAU), alpha: 0.8, layer: 'back', kind: 'puff',
      group: -1, emitter: -1, a0: small ? 0.55 : 0.8, fade: 1, dying: false, age: 0, vx: -(+v || 0) * 0.35 + r.float(-12, 12), vy: -r.float(50, 85) * (small ? 0.6 : 1),
      rotV: r.float(-0.8, 0.8), life: small ? r.float(1.0, 1.4) : r.float(1.2, 1.8), color: null });
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0 || this.particles[i].kind === 'puff') { this.particles.splice(i, 1); return; } this.particles.shift(); };

  /** One-shot effect particles in SCREEN px (count toward the cap). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || (kind === 'steam' ? 3 : kind === 'puff' ? 6 : 18), r = this.rng;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      var p = { type: 'confetti_a', sprite: 'confetti_a', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark',
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, rotV: 0, g: 0, life: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
        if (!o.color) p.color = r.pick(CONFETTI);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-10, 10); p.tumbleW = r.float(6, 14); p.life = r.float(1.4, 2.2);
      } else if (kind === 'puff' || kind === 'steam') {
        p.sprite = 'puff'; p.kind = 'puff'; p.layer = kind === 'steam' ? 'front' : 'back';
        var a2 = kind === 'steam' ? -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 : r.float(Math.PI, TAU);
        var s2 = kind === 'steam' ? 90 + 30 * i : r.float(30, 90);
        p.vx = Math.cos(a2) * s2; p.vy = Math.sin(a2) * s2; p.size = p.s0 = kind === 'steam' ? 20 + 6 * i : r.float(18, 30);
        p.life = kind === 'steam' ? 0.7 + 0.1 * i : r.float(0.45, 0.8); p.rotV = r.float(-2, 2); p.a0 = 0.85;
      } else if (kind === 'bubbles') {
        p.sprite = 'bubble'; p.kind = 'bubble'; p.size = r.float(14, 26); p.vx = r.float(-60, 60); p.vy = -r.float(60, 140); p.sw = r.float(1, 2); p.life = r.float(0.9, 1.5); p.rot = 0;
      } else if (kind === 'feathers') {
        p.sprite = 'feather'; p.kind = 'bit'; p.size = r.float(14, 22); var a4 = r.float(-Math.PI * 0.9, -Math.PI * 0.1), s4 = r.float(90, 220);
        p.vx = Math.cos(a4) * s4; p.vy = Math.sin(a4) * s4; p.rotV = r.float(-5, 5); p.life = r.float(0.9, 1.4); p.g = 300;
      } else {   // 'sparkle' | 'stars'
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a3 = r.float(0, TAU), s3 = r.float(80, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3 - (kind === 'stars' ? 120 : 0);
        p.rotV = r.float(-3, 3); p.g = kind === 'stars' ? 420 : 0;
        if (!o.color && kind === 'stars') p.color = '#FFD54A';
      }
      p.type = p.sprite; p.s0 = p.s0 || p.size;
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
    for (k = 0; k < this.clouds.length; k++) {
      var c = this.clouds[k];
      c.u += c._v * h; if (c.u > 1.25) c.u = -0.25;
      c._on = clamp(c._on + (c.idx < MOODS[this.mood].clouds ? h : -h) / ft, 0, 1);
      c.alpha = 0.9 * c._on * (this.mood === 3 ? 0.35 : 1);
    }
    this._starAng += 0.03 * h;
    this._placeStars();
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, u, live = p.group >= 0 && !p.dying && this._live(p);
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'mote': {   // dust in the sunbeam: slow Brownian drift, twinkling as it turns in the light
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (live) this._spawn(p.group, p.emitter, false); return; }
        p.vx += Math.sin(p.ph + p.age * p.sw * 2.1) * 6 * h; p.vy += Math.cos(p.ph * 1.3 + p.age * p.sw * 1.7) * 6 * h - 1.5 * h;
        p.vx *= Math.pow(0.6, h); p.vy *= Math.pow(0.6, h);
        p.x += p.vx * h; p.y += p.vy * h; p.rot += 0.4 * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(p.ph + p.age * 3)) * clamp(0.3 + this.ambient.beam, 0, 1);
        break;
      }
      case 'bubble': {  // soap bubble: buoyant, wobbling, pops with a tiny sparkle
        u = p.age / p.life;
        if (u >= 1 || p.y < -30) {
          this._kill(p);
          if (u >= 1 && this.particles.length < HARD_CAP) this.burst(p.x, p.y, { kind: 'sparkle', n: 2 });
          if (live) this._spawn(p.group, p.emitter, false);
          return;
        }
        p.x += (p.vx + 14 * Math.sin(p.ph + p.age * p.sw * 2)) * h; p.y += p.vy * h; p.vy *= Math.pow(0.9, h);
        p.sy = 1 + 0.06 * Math.sin(p.age * 7 + p.ph);
        p.alpha = p.a0 * p.fade * Math.min(1, u * 6);
        break;
      }
      case 'feather': { // falls at terminal speed, swinging like a pendulum (rotation follows the swing)
        var sw = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.sway * sw) * h; p.y += p.vy * (0.7 + 0.5 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h;
        p.rot = 0.6 * Math.sin(p.ph + p.age * p.sw) + p.spin * 0.2;
        p.alpha = p.a0 * p.fade;
        if (p.y > this.groundY + 10) { if (live) { p.y = -20; p.x = this.rng.float(0, W); } else { this._kill(p); return; } }
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        break;
      }
      case 'twinkle':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); if (live) this._spawn(p.group, p.emitter, false); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.25, h); p.vy = p.vy * Math.pow(0.35, h) - 12 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.size = p.s0 * (0.6 + 1.1 * Math.sqrt(u)); p.alpha = p.a0 * (1 - u) * Math.min(1, u * 8 + 0.3);
        break;
      case 'confetti': {
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.35, h);
        p.vx *= drag; p.vy = p.vy * drag + 900 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 40 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'bit':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.25, h); p.vy = p.vy * Math.pow(0.25, h) + (p.g || 0) * h;
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
  };

  TT.Weather = Weather;
})(window.TT = window.TT || {});
