/* Nini's Sea Painting — SP.Weather (headless, deterministic seasons seen from under the water; DESIGN §5.3). Node-safe.
 *
 *   const wx = new SP.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWeather(i, { instant });     // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: confetti-ish sparkles + stars drift whatever the season
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.addSplash(x, y, color, n)       // paint dots burst (world 'paint' / 'fishyTap' / 'wrong' events); color = hex or palette name
 *   wx.addBubbles(x, y, n)             // a puff of bubbles (world 'bubbles' / 'alive' events)
 *   wx.burst(x, y, { kind: 'confetti'|'sparkle'|'stars'|'bubbles'|'dots', n, color })   // one-shot effects
 *   wx.particles[] { type (= sprite), sprite, x, y, size (drawn px, square), r (= size/2), rot, alpha, layer 'back'|'front',
 *                    kind, color (hex tint | null), flipX?, sy? }  SCREEN px.
 *       sprite ∈ Weather.SPRITES = particles/<sprite>.svg (32×32). 'back' = behind the canvas (ambient water life),
 *       'front' = over everything (splashes, confetti, sparkles).
 *   wx.ambient { waterTop, waterBottom (hex, DESIGN §3), tint (rgba | null), rays 0..1 (god rays), caustic 0..1, ice 0..1 (ice sheet
 *                along the top), light 0..1 (overall brightness), mood 'spring'|'summer'|'autumn'|'winter', moodIndex, env (= mood),
 *                envFrom, envMix 0..1 (crossfade from envFrom to env), surfaceY (px: the water surface band ≈ top), party 0..1 }
 */
(function (SP) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 64, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §3 water per season
  var MOODS = [
    { name: 'spring', top: '#7FD3D8', bottom: '#2E8FA8', tint: [255, 214, 230, 0.04], amb: { rays: 0.45, caustic: 0.5, ice: 0, light: 0.95 },
      emitters: [{ kind: 'petal', sprite: 'petal', layer: 'back', count: 9, size: [14, 22], alpha: [0.8, 1] },
        { kind: 'bubble', sprite: 'bubble', layer: 'back', count: 7, size: [10, 22], alpha: [0.5, 0.85] },
        { kind: 'plankton', sprite: 'plankton', layer: 'back', count: 10, size: [5, 9], alpha: [0.35, 0.7] }] },
    { name: 'summer', top: '#5CC8E8', bottom: '#1E78B4', tint: [255, 248, 210, 0.03], amb: { rays: 1, caustic: 1, ice: 0, light: 1 },
      emitters: [{ kind: 'glint', sprite: 'sparkle', layer: 'back', count: 9, size: [10, 18], alpha: [0.55, 0.9] },
        { kind: 'bubble', sprite: 'bubble', layer: 'back', count: 9, size: [10, 24], alpha: [0.5, 0.85] },
        { kind: 'plankton', sprite: 'plankton', layer: 'back', count: 8, size: [5, 9], alpha: [0.35, 0.7] }] },
    { name: 'autumn', top: '#7CC0B8', bottom: '#2F6F86', tint: [255, 190, 120, 0.06], amb: { rays: 0.55, caustic: 0.45, ice: 0, light: 0.9 },
      emitters: [{ kind: 'leaf', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 8, size: [18, 28], alpha: [0.8, 1] },
        { kind: 'bubble', sprite: 'bubble', layer: 'back', count: 6, size: [10, 22], alpha: [0.5, 0.8] },
        { kind: 'plankton', sprite: 'plankton', layer: 'back', count: 12, size: [5, 9], alpha: [0.35, 0.7], warm: true }] },
    { name: 'winter', top: '#A9D8EC', bottom: '#3C6E9A', tint: [200, 225, 255, 0.07], amb: { rays: 0.2, caustic: 0.15, ice: 1, light: 0.85 },
      emitters: [{ kind: 'snow', sprite: 'snow', layer: 'back', count: 16, size: [10, 18], alpha: [0.7, 0.95] },
        { kind: 'bubble', sprite: 'bubble', layer: 'back', count: 5, size: [10, 20], alpha: [0.5, 0.8] },
        { kind: 'plankton', sprite: 'plankton', layer: 'back', count: 6, size: [5, 8], alpha: [0.3, 0.6] }] }
  ];
  MOODS.forEach(function (m) { m._top = hex(m.top); m._bot = hex(m.bottom); });
  var NUM_KEYS = ['rays', 'caustic', 'ice', 'light'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], gold: true },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95] }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var GLINT = ['#FFF6C8', '#FFFFFF', '#E8F6FF'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 18;
    this.rng = new SP.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = [];
    this.mood = 0; this.weather = 0; this.season = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.ambient = {};
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['bubble', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'plankton', 'dot', 'confetti_a', 'confetti_b'];
  Weather.WATER = MOODS.map(function (m) { return [m.top, m.bottom]; });

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  P._surfaceY = function () { return Math.min(70, 0.08 * this.height); };

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
    var s = { top: a._top.slice(), bot: a._bot.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { top: m._top, bot: m._bot, tint: m.tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._top = C(f.top, m._top); a._bot = C(f.bot, m._bot);
    a._tint = [L(f.tint[0], m.tint[0]), L(f.tint[1], m.tint[1]), L(f.tint[2], m.tint[2]), L(f.tint[3], m.tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    a.waterTop = toHex(a._top); a.waterBottom = toHex(a._bot);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.party = this.party;
    a.moodIndex = this.mood; a.mood = a.env = NAMES[this.mood]; a.envFrom = NAMES[this._fromMood]; a.envMix = s;
    a.season = a.mood; a.seasonIndex = this.mood;
    a.surfaceY = this._surfaceY();
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
    var em = this._emitters(g)[e], r = this.rng, W = this.width, H = this.height, sY = this._surfaceY();
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.08, 0.85) * H, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: null, ph: r.float(0, TAU) };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'bubble':   // rising from the seabed, wobbling; pops at the surface
        p.x = r.float(0.03, 0.97) * W; p.y = anywhere ? r.float(0.15, 0.95) * this.groundY : this.groundY - r.float(0, 40);
        p.vy = -r.float(35, 70); p.sw = r.float(0.8, 1.6); p.rot = 0;
        break;
      case 'plankton':   // tiny drifting specks (Brownian)
        p.life = r.float(5, 10); p.age = anywhere ? r.float(0, p.life) : 0; p.vx = r.float(-6, 6); p.vy = r.float(-4, 4); p.sw = r.float(0.3, 0.8);
        if (em.warm) p.color = '#FFE3B0';
        break;
      case 'petal':   // floats along the surface; one in three slowly sinks, turning
        p.sink = r.chance(0.35); p.y = p.sink ? (anywhere ? r.float(sY, 0.7 * H) : sY) : r.float(6, sY); p.x = anywhere ? r.float(0, W) : r.chance(0.5) ? -20 : W + 20;
        p.vx = (p.x > W / 2 && !anywhere ? -1 : 1) * r.float(10, 22); p.vy = p.sink ? r.float(10, 20) : 0; p.spin = r.float(-0.6, 0.6); p.sway = r.float(18, 34); p.sw = r.float(0.5, 1.0);
        break;
      case 'leaf':   // drifts down from the surface, swaying like a pendulum, slowed by the water
        p.y = anywhere ? r.float(0, 0.85) * this.groundY : r.float(-10, sY); p.vy = r.float(14, 26); p.sway = r.float(26, 48); p.sw = r.float(0.5, 0.9); p.spin = r.float(-0.5, 0.5);
        break;
      case 'snow':   // sinks slowly, a little side-to-side
        p.y = anywhere ? r.float(0, this.groundY) : r.float(-10, sY); p.vy = r.float(12, 24); p.sway = r.float(6, 14); p.sw = r.float(0.6, 1.2); p.spin = r.float(-0.4, 0.4);
        break;
      case 'glint':   // twinkles in the sun rays (summer) / party stars
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.y = r.float(0.05, 0.55) * H; p.rotV = r.float(-1, 1);
        p.color = em.gold ? '#FFD54A' : r.pick(GLINT); p.fade = 1;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && SP.PALETTE && SP.PALETTE[c] ? SP.PALETTE[c].base : c || null; }

  /** Paint dots flying out of a dab (tinted, gravity + water drag, short life). */
  P.addSplash = function (x, y, color, n) { this.burst(x, y, { kind: 'dots', n: n || 10, color: tintOf(color) }); };
  P.addBubbles = function (x, y, n) { this.burst(x, y, { kind: 'bubbles', n: n || 6 }); };

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 18, r = this.rng;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      var p = { type: 'sparkle', sprite: 'sparkle', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark',
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, rotV: 0, g: 0, life: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
        if (!o.color) p.color = r.pick(CONFETTI);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(220, 520);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-8, 8); p.tumbleW = r.float(6, 14); p.life = r.float(1.6, 2.4);
      } else if (kind === 'dots') {
        p.sprite = 'dot'; p.kind = 'dot'; p.size = r.float(8, 16);
        var a2 = r.float(-Math.PI * 0.95, -Math.PI * 0.05), s2 = r.float(120, 320);
        p.vx = Math.cos(a2) * s2; p.vy = Math.sin(a2) * s2; p.life = r.float(0.45, 0.8); p.g = 500; p.rot = 0;
      } else if (kind === 'bubbles') {
        p.sprite = 'bubble'; p.kind = 'pop'; p.size = r.float(12, 24); p.vx = r.float(-50, 50); p.vy = -r.float(60, 140); p.sw = r.float(1, 2); p.life = r.float(0.9, 1.6); p.rot = 0; p.color = null;
      } else {   // 'sparkle' | 'stars'
        p.sprite = kind === 'stars' ? 'star' : 'sparkle'; p.size = r.float(12, 22); p.life = r.float(0.6, 1.1);
        var a3 = r.float(0, TAU), s3 = r.float(80, 240); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3 - (kind === 'stars' ? 100 : 0);
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
    this._lastTargets = this._targets();
    this._populate(false);
    var ps = this.particles;
    for (var i = ps.length - 1; i >= 0; i--) if (i < ps.length) this._stepP(ps[i], h);
  };
  P._kill = function (p) { var i = this.particles.indexOf(p); if (i >= 0) this.particles.splice(i, 1); };
  P._respawn = function (p) { this._kill(p); if (this._live(p)) this._spawn(p.group, p.emitter, false); };
  P._stepP = function (p, h) {
    var W = this.width, H = this.height, u, sY = this._surfaceY();
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'bubble': {   // buoyant: terminal rise speed, wobble; pops at the surface
        p.x += 14 * Math.sin(p.ph + p.age * p.sw * 2) * h; p.y += p.vy * h;
        p.sy = 1 + 0.07 * Math.sin(p.age * 7 + p.ph);
        p.alpha = p.a0 * p.fade * Math.min(1, p.age * 2);
        if (p.y < sY) { this._respawn(p); return; }
        break;
      }
      case 'plankton': {
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.vx += Math.sin(p.ph + p.age * p.sw * 2.1) * 5 * h; p.vy += Math.cos(p.ph * 1.3 + p.age * p.sw * 1.7) * 5 * h;
        p.vx *= Math.pow(0.6, h); p.vy *= Math.pow(0.6, h);
        p.x += p.vx * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'petal': {
        var sw = Math.sin(p.ph + p.age * p.sw);
        p.x += (p.vx + (p.sink ? p.sway * Math.cos(p.ph + p.age * p.sw) : 0)) * h;
        if (p.sink) { p.y += p.vy * h; p.rot = 0.7 * sw + p.spin * p.age * 0.3; } else { p.y = Math.min(sY, p.y + 3 * Math.sin(p.age * 1.3 + p.ph) * h); p.rot += p.spin * h; }
        p.alpha = p.a0 * p.fade * (p.sink ? clamp((this.groundY - p.y) / 120, 0, 1) : 1);
        if (p.x < -40 || p.x > W + 40 || p.y > this.groundY) { this._respawn(p); return; }
        break;
      }
      case 'leaf': case 'snow': {   // pendulum fall at terminal speed (water drag)
        var c = Math.cos(p.ph + p.age * p.sw);
        p.x += p.sway * c * h; p.y += p.vy * (0.75 + 0.4 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h;
        p.rot = (p.kind === 'leaf' ? 0.65 : 0.25) * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.1;
        p.alpha = p.a0 * p.fade * clamp((this.groundY + 10 - p.y) / 60, 0, 1);
        if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
        if (p.y > this.groundY + 10) { this._respawn(p); return; }
        break;
      }
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.rot += (p.rotV || 0) * h; p.size = p.s0 * (0.5 + 0.7 * Math.sin(Math.PI * u)); p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      case 'confetti': {   // sinks through water: strong drag, slow terminal fall, tumbling
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        var drag = Math.pow(0.2, h);
        p.vx *= drag; p.vy = p.vy * drag + 420 * h;
        p.vx += Math.sin(p.age * 5 + p.rotV) * 30 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.flipX = Math.cos(p.age * p.tumbleW);
        p.alpha = u > 0.75 ? (1 - u) / 0.25 : 1;
        break;
      }
      case 'dot':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.05, h); p.vy = p.vy * Math.pow(0.05, h) + p.g * h;
        p.x += p.vx * h; p.y += p.vy * h;
        p.size = p.s0 * (1 - 0.4 * u); p.alpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        break;
      case 'pop':
        u = p.age / p.life;
        if (u >= 1 || p.y < sY) { this._kill(p); return; }
        p.vx *= Math.pow(0.2, h); p.vy = p.vy * Math.pow(0.5, h) - 60 * h;
        p.x += (p.vx + 12 * Math.sin(p.age * 8 + p.sw)) * h; p.y += p.vy * h;
        p.alpha = Math.min(1, u * 8) * (u > 0.8 ? (1 - u) / 0.2 : 1);
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

  SP.Weather = Weather;
})(window.SP = window.SP || {});
