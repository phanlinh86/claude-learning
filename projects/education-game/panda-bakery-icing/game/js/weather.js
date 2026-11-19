/* Mochi's Icing Bakery — IB.Weather (headless, deterministic seasons seen through the kitchen window; DESIGN §5.4). Node-safe.
 *
 *   const wx = new IB.Weather({ width, height, seed, groundY });
 *   wx.resize(W, H, groundY);          // world.layout.groundY
 *   wx.setWindows([{x, y, w, h}…])     // SCREEN rects of the window glass (render knows where far_<m>.svg is drawn). Default:
 *                                      //   the far tile (800 × 720, glass x 250–550, y 90–400) scaled to the height, tiled from x 0
 *   wx.setOven(x, y)                   // where the steam rises (default: right side above the counter)
 *   wx.setWeather(i, { instant });     // 0 spring, 1 summer, 2 autumn, 3 winter (2.5 s crossfade)
 *   wx.setParty(on, { instant })       // session-done party: sparkles + stars drift whatever the season
 *   wx.update(dt);                     // fixed 1/60 s steps
 *   wx.addSplash(x, y, hex, n)         // sprinkle bits burst (bird tap / finish); hex or palette name; null = rainbow
 *   wx.addPuff(x, y, n)                // a soft flour puff (mouse tap, cookie landing)
 *   wx.burst(x, y, { kind: 'confetti'|'sparkle'|'stars'|'sprinkles'|'flour'|'crumbs', n, color })
 *   wx.particles[] { type (= sprite), sprite, x, y, size (drawn px, square), r, rot, alpha, layer 'back'|'front', kind,
 *                    color (hex tint | null), outside (bool: clip to the window rects), flipX?, sy? }  SCREEN px.
 *       sprite ∈ Weather.SPRITES = particles/<sprite>.svg (32×32). 'back' = behind the tray (room air, window), 'front' = over
 *       everything (sprinkle bursts, confetti, flour puffs).
 *   wx.ambient { wall, floor (hex), tint (rgba | null: a light overlay), light 0..1 (overall warmth / brightness), lightBars 0..1
 *                (alpha of env/light.svg), sky (hex: window sky fallback), warmLights 0..1 (winter string lights), mood
 *                'spring'|'summer'|'autumn'|'winter', moodIndex, env (= mood), envFrom, envMix 0..1, party 0..1 }
 */
(function (IB) {
  'use strict';

  var TAU = Math.PI * 2;
  var HARD_CAP = 120, AMBIENT_CAP = 60, REF_AREA = 1280 * 720, FADE_TIME = 2.5;
  var NAMES = ['spring', 'summer', 'autumn', 'winter'];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(c) { return '#' + (16777216 + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }

  // DESIGN §3 kitchen per season (calm, warm, a little desaturated so the icing pops)
  var MOODS = [
    { name: 'spring', wall: '#F6E9D2', floor: '#B98A5E', sky: '#BFE3F5', tint: [255, 214, 230, 0.04], amb: { light: 0.9, lightBars: 0.5, warmLights: 0 },
      emitters: [{ kind: 'petal', sprite: 'petal', layer: 'back', count: 8, size: [14, 20], alpha: [0.85, 1] },
        { kind: 'mote', sprite: 'flour', layer: 'back', count: 10, size: [4, 8], alpha: [0.25, 0.55] },
        { kind: 'steam', sprite: 'steam', layer: 'back', count: 3, size: [34, 54], alpha: [0.2, 0.35] }] },
    { name: 'summer', wall: '#F8EBD0', floor: '#BC8C5C', sky: '#8FD0F2', tint: [255, 240, 200, 0.05], amb: { light: 1, lightBars: 1, warmLights: 0 },
      emitters: [{ kind: 'glint', sprite: 'sparkle', layer: 'back', count: 9, size: [10, 18], alpha: [0.55, 0.9] },
        { kind: 'mote', sprite: 'flour', layer: 'back', count: 14, size: [4, 8], alpha: [0.3, 0.6] },
        { kind: 'steam', sprite: 'steam', layer: 'back', count: 2, size: [34, 50], alpha: [0.15, 0.3] }] },
    { name: 'autumn', wall: '#F3E2C6', floor: '#AE7E50', sky: '#F2C48A', tint: [255, 190, 120, 0.06], amb: { light: 0.85, lightBars: 0.45, warmLights: 0.2 },
      emitters: [{ kind: 'leaf', sprite: 'leaf_a', alt: 'leaf_b', layer: 'back', count: 7, size: [18, 26], alpha: [0.85, 1] },
        { kind: 'mote', sprite: 'flour', layer: 'back', count: 10, size: [4, 8], alpha: [0.25, 0.5], warm: true },
        { kind: 'steam', sprite: 'steam', layer: 'back', count: 4, size: [36, 56], alpha: [0.22, 0.38] }] },
    { name: 'winter', wall: '#F1E4D0', floor: '#A9794C', sky: '#B9CCDD', tint: [200, 220, 255, 0.05], amb: { light: 0.8, lightBars: 0.15, warmLights: 1 },
      emitters: [{ kind: 'snow', sprite: 'snow', layer: 'back', count: 18, size: [8, 16], alpha: [0.75, 1], outside: true },
        { kind: 'mote', sprite: 'flour', layer: 'back', count: 8, size: [4, 8], alpha: [0.25, 0.5], warm: true },
        { kind: 'steam', sprite: 'steam', layer: 'back', count: 5, size: [38, 60], alpha: [0.25, 0.42] }] }
  ];
  MOODS.forEach(function (m) { m._wall = hex(m.wall); m._floor = hex(m.floor); m._sky = hex(m.sky); });
  var NUM_KEYS = ['light', 'lightBars', 'warmLights'];
  var PARTY_EMIT = [{ kind: 'glint', sprite: 'star', layer: 'front', count: 10, size: [12, 20], alpha: [0.6, 0.95], gold: true, anywhere: true },
    { kind: 'glint', sprite: 'sparkle', layer: 'front', count: 10, size: [10, 18], alpha: [0.6, 0.95], anywhere: true }];
  var CONFETTI = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#8E44AD', '#FF8FC0'];
  var GLINT = ['#FFF6C8', '#FFFFFF', '#FFE7A8'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 1280; this.height = opts.height || 720;
    this.groundY = opts.groundY || this.height - 18;
    this.rng = new IB.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60; this._acc = 0; this.time = 0;
    this.fadeTime = FADE_TIME;
    this.particles = [];
    this.mood = 0; this.weather = 0; this.season = 0; this.ramp = [0, 0, 0, 0];
    this._fadeU = 1; this._from = null; this._fromMood = 0;
    this.party = 0; this._partyT = 0;
    this.windows = null; this._customWindows = false; this.oven = null; this._customOven = false;
    this.ambient = {};
    this._defaults();
    this.setWeather(opts.weather || 0, { instant: true });
  }
  Weather.MOODS = MOODS; Weather.NAMES = NAMES; Weather.CAP = HARD_CAP; Weather.AMBIENT_CAP = AMBIENT_CAP; Weather.FADE_TIME = FADE_TIME;
  Weather.SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'flour', 'steam', 'sprinkle_a', 'sprinkle_b', 'confetti_a', 'confetti_b', 'crumb'];
  Weather.WINDOW = { tileW: 800, tileH: 720, x: 250, y: 90, w: 300, h: 310 };

  var P = Weather.prototype;
  P.areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.4); };
  /** Default window rects: far tile scaled to the screen height, tiled from x = 0 (render may override with setWindows). */
  P._defaults = function () {
    if (!this._customWindows) {
      var Wn = Weather.WINDOW, k = this.height / Wn.tileH, tw = Wn.tileW * k, out = [];
      for (var x = 0; x < this.width; x += tw) out.push({ x: x + Wn.x * k, y: Wn.y * k, w: Wn.w * k, h: Wn.h * k });
      this.windows = out.filter(function (r) { return r.x < this.width; }, this);
    }
    if (!this._customOven) this.oven = { x: this.width * 0.86, y: Math.max(80, this.groundY - 0.36 * this.height) };
  };
  P.setWindows = function (rects) {
    this._customWindows = !!(rects && rects.length);
    if (this._customWindows) this.windows = rects.map(function (r) { return { x: +r.x, y: +r.y, w: +r.w, h: +r.h }; });
    this._defaults();
    this.particles.forEach(function (p) { if (p.outside) p.dying = true; });
  };
  P.setOven = function (x, y) { this._customOven = isFinite(x) && isFinite(y); if (this._customOven) this.oven = { x: x, y: y }; this._defaults(); };
  P.resize = function (W, H, groundY) {
    var sx = W / this.width, sy = H / this.height;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; p.x *= sx; p.y *= sy; if (p.win) { p.win = null; } }
    this.width = W; this.height = H;
    this.groundY = groundY !== undefined && isFinite(groundY) ? groundY : this.groundY * sy;
    this._defaults();
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
    if (!a || !a._wall) return null;
    var s = { wall: a._wall.slice(), floor: a._floor.slice(), sky: a._sky.slice(), tint: a._tint.slice() };
    for (var k = 0; k < NUM_KEYS.length; k++) s[NUM_KEYS[k]] = a['_' + NUM_KEYS[k]];
    return s;
  };
  P._ambient = function () {
    var m = MOODS[this.mood], f = this._from, u = this._fadeU, s = u * u * (3 - 2 * u), a = this.ambient, k;
    function L(x, y) { return x + (y - x) * s; }
    function C(p, q) { return [L(p[0], q[0]), L(p[1], q[1]), L(p[2], q[2])]; }
    if (!f || u >= 1) { f = { wall: m._wall, floor: m._floor, sky: m._sky, tint: m.tint }; for (k = 0; k < NUM_KEYS.length; k++) f[NUM_KEYS[k]] = m.amb[NUM_KEYS[k]]; }
    a._wall = C(f.wall, m._wall); a._floor = C(f.floor, m._floor); a._sky = C(f.sky, m._sky);
    a._tint = [L(f.tint[0], m.tint[0]), L(f.tint[1], m.tint[1]), L(f.tint[2], m.tint[2]), L(f.tint[3], m.tint[3])];
    for (k = 0; k < NUM_KEYS.length; k++) { var key = NUM_KEYS[k]; a['_' + key] = L(f[key], m.amb[key]); a[key] = a['_' + key]; }
    a.wall = toHex(a._wall); a.floor = toHex(a._floor); a.sky = toHex(a._sky);
    a.tint = a._tint[3] > 0.004 ? 'rgba(' + Math.round(a._tint[0]) + ',' + Math.round(a._tint[1]) + ',' + Math.round(a._tint[2]) + ',' + a._tint[3].toFixed(3) + ')' : null;
    a.party = this.party;
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
      for (e = 0; e < em.length; e++) { var t = em[e].count * (em[e].kind === 'steam' ? 1 : k) * ramp; out[g][e] = t; sum += t; }
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
  P._win = function () { var ws = this.windows; return ws && ws.length ? ws[Math.floor(this.rng.next() * ws.length)] : { x: 0.3 * this.width, y: 0.12 * this.height, w: 0.4 * this.width, h: 0.4 * this.height }; };
  P._spawn = function (g, e, anywhere) {
    var em = this._emitters(g)[e], r = this.rng, W = this.width, H = this.height, win = this._win();
    var p = { type: em.sprite, sprite: em.sprite, x: r.float(0, W), y: r.float(0.08, 0.7) * H, size: r.float(em.size[0], em.size[1]), rot: r.float(0, TAU),
      alpha: 0, layer: em.layer, kind: em.kind, group: g, emitter: e, a0: r.float(em.alpha[0], em.alpha[1]), fade: 0, dying: false, age: 0,
      vx: 0, vy: 0, color: null, ph: r.float(0, TAU), outside: !!em.outside, win: null };
    if (em.alt && r.chance(0.5)) p.sprite = p.type = em.alt;
    switch (em.kind) {
      case 'snow':   // OUTSIDE: falls behind the glass of one window (render clips to the window rects)
        p.win = win; p.x = win.x + r.float(0, win.w); p.y = anywhere ? win.y + r.float(0, win.h) : win.y - r.float(0, 20);
        p.vy = r.float(22, 40); p.sway = r.float(6, 14); p.sw = r.float(0.6, 1.2); p.spin = r.float(-0.4, 0.4);
        break;
      case 'petal': case 'leaf':   // drifts in through the window, then sways down to the counter
        p.x = win.x + r.float(0.1, 0.9) * win.w; p.y = anywhere ? r.float(win.y, this.groundY - 40) : win.y + r.float(0.2, 0.9) * win.h;
        p.vx = r.float(-18, 18); p.vy = em.kind === 'leaf' ? r.float(22, 34) : r.float(14, 26); p.sway = r.float(22, 42); p.sw = r.float(0.5, 1.0); p.spin = r.float(-0.6, 0.6);
        break;
      case 'mote':   // flour dust floating in the window light (slow Brownian drift)
        var lw = win; p.x = lw.x + r.float(-0.3, 1.3) * lw.w; p.y = lw.y + r.float(0, 1.6) * lw.h;
        p.life = r.float(5, 10); p.age = anywhere ? r.float(0, p.life) : 0; p.vx = r.float(-5, 5); p.vy = r.float(-3, 3); p.sw = r.float(0.3, 0.8);
        p.color = em.warm ? '#FFE9C4' : '#FFFFFF';
        break;
      case 'steam':   // rises from the oven, widening and fading
        p.x = this.oven.x + r.float(-30, 30); p.y = this.oven.y; p.life = r.float(2.2, 3.4); p.age = anywhere ? r.float(0, p.life) : 0;
        p.vy = -r.float(26, 40); p.sw = r.float(0.6, 1.1); p.color = '#FFFFFF';
        break;
      case 'glint':   // summer: twinkles in the light bars below the windows / party stars anywhere
        p.life = r.float(0.9, 1.8); p.age = anywhere ? r.float(0, p.life) : 0; p.rotV = r.float(-1, 1);
        if (em.anywhere) { p.x = r.float(0, W); p.y = r.float(0.05, 0.6) * H; }
        else { p.x = win.x + r.float(0, 1.3) * win.w; p.y = win.y + win.h + r.float(0, 0.6) * (this.groundY - win.y - win.h); }
        p.color = em.gold ? '#FFD54A' : r.pick(GLINT); p.fade = 1;
        break;
    }
    if (anywhere) p.fade = 1;
    p.s0 = p.size; p.r = p.size / 2;
    this.particles.push(p);
    return p;
  };
  P._dropOldest = function () { for (var i = 0; i < this.particles.length; i++) if (this.particles[i].group >= 0) { this.particles.splice(i, 1); return; } this.particles.shift(); };
  function tintOf(c) { return c && c.charAt(0) !== '#' && IB.PALETTE && IB.PALETTE[c] ? IB.PALETTE[c].base : c || null; }

  /** Sprinkle bits flying out (bird tap shower, finish): tinted rods, gravity, bounce-less, short life. */
  P.addSplash = function (x, y, color, n) { this.burst(x, y, { kind: 'sprinkles', n: n || 14, color: tintOf(color) }); };
  /** A soft flour puff (mouse tap / a landing). */
  P.addPuff = function (x, y, n) { this.burst(x, y, { kind: 'flour', n: n || 10 }); };

  /** One-shot effect particles in SCREEN px (count toward the cap; the oldest ambient ones make room). */
  P.burst = function (x, y, o) {
    o = o || {};
    var kind = o.kind || 'confetti', n = o.n || 18, r = this.rng;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= HARD_CAP) this._dropOldest();
      var p = { type: 'sparkle', sprite: 'sparkle', x: x, y: y, size: 14, rot: r.float(0, TAU), alpha: 1, layer: 'front', kind: 'spark', outside: false,
        group: -1, emitter: -1, a0: 1, fade: 1, dying: false, age: 0, vx: 0, vy: 0, color: o.color || null, rotV: 0, g: 0, life: 1 };
      if (kind === 'confetti') {
        p.sprite = r.chance(0.5) ? 'confetti_a' : 'confetti_b'; p.size = r.float(12, 18); p.kind = 'confetti';
        if (!o.color) p.color = r.pick(CONFETTI);
        var ang = r.float(-Math.PI * 0.95, -Math.PI * 0.05), sp = r.float(260, 560);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.rotV = r.float(-8, 8); p.tumbleW = r.float(6, 14); p.life = r.float(1.8, 2.6);
      } else if (kind === 'sprinkles') {   // a shower falling from (x, y): spread, gravity, spinning
        p.sprite = r.chance(0.5) ? 'sprinkle_a' : 'sprinkle_b'; p.kind = 'sprinkle'; p.size = r.float(12, 18);
        if (!o.color) p.color = r.pick(CONFETTI.concat(['#FFFFFF']));
        p.vx = r.float(-160, 160); p.vy = r.float(-180, 40); p.g = 1100; p.rotV = r.float(-10, 10); p.life = r.float(0.9, 1.4);
      } else if (kind === 'flour') {   // soft white puff: fast out, strong drag, grows, fades
        p.sprite = 'flour'; p.kind = 'puff'; p.size = r.float(14, 26); p.color = '#FFFFFF';
        var a2 = r.float(0, TAU), s2 = r.float(60, 200); p.vx = Math.cos(a2) * s2; p.vy = Math.sin(a2) * s2 - 40; p.life = r.float(0.7, 1.2); p.g = -30;
      } else if (kind === 'crumbs') {
        p.sprite = 'crumb'; p.kind = 'crumb'; p.size = r.float(6, 11); p.color = null;
        var a3 = r.float(-Math.PI * 0.95, -Math.PI * 0.05), s3 = r.float(120, 260); p.vx = Math.cos(a3) * s3; p.vy = Math.sin(a3) * s3; p.g = 1300; p.life = r.float(0.5, 0.8); p.rotV = r.float(-8, 8);
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
    var W = this.width, H = this.height, u;
    p.age += h;
    if (p.dying) p.fade -= h / 0.8; else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
    if (p.dying && p.fade <= 0) { this._kill(p); return; }
    switch (p.kind) {
      case 'snow': {   // terminal-speed fall with a gentle sway, inside its window
        var wn = p.win || this._win();
        p.win = wn;
        p.x += p.sway * Math.cos(p.ph + p.age * p.sw) * h; p.y += p.vy * h;
        p.rot = 0.25 * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.1;
        if (p.x < wn.x - 6) p.x = wn.x + wn.w + 4; else if (p.x > wn.x + wn.w + 6) p.x = wn.x - 4;
        p.alpha = p.a0 * p.fade;
        if (p.y > wn.y + wn.h + 10) { this._respawn(p); return; }
        break;
      }
      case 'petal': case 'leaf': {   // pendulum fall (air drag), drifting into the room, fading on the counter
        var c = Math.cos(p.ph + p.age * p.sw);
        p.x += (p.vx + p.sway * c) * h; p.y += p.vy * (0.7 + 0.45 * Math.abs(Math.sin(p.ph + p.age * p.sw))) * h;
        p.rot = (p.kind === 'leaf' ? 0.7 : 0.5) * Math.sin(p.ph + p.age * p.sw) + p.spin * p.age * 0.2;
        p.alpha = p.a0 * p.fade * clamp((this.groundY - 30 - p.y) / 70, 0, 1) * Math.min(1, p.age * 2);
        if (p.x < -30 || p.x > W + 30 || p.y > this.groundY - 30) { this._respawn(p); return; }
        break;
      }
      case 'mote': {
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.vx += Math.sin(p.ph + p.age * p.sw * 2.1) * 4 * h; p.vy += Math.cos(p.ph * 1.3 + p.age * p.sw * 1.7) * 4 * h - 0.5 * h;
        p.vx *= Math.pow(0.6, h); p.vy *= Math.pow(0.6, h);
        p.x += p.vx * h; p.y += p.vy * h;
        p.alpha = p.a0 * p.fade * Math.sin(Math.PI * u);
        break;
      }
      case 'steam': {   // buoyant: rises, slows, widens, sways, fades
        u = p.age / p.life;
        if (u >= 1) { this._respawn(p); return; }
        p.y += p.vy * (1 - 0.5 * u) * h; p.x += 10 * Math.sin(p.ph + p.age * p.sw * 2) * h;
        p.size = p.s0 * (0.6 + 0.9 * u); p.rot += 0.2 * h;
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
      case 'sprinkle': case 'crumb':
        u = p.age / p.life;
        if (u >= 1 || p.y > H + 30) { this._kill(p); return; }
        p.vx *= Math.pow(0.5, h); p.vy += p.g * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rotV * h;
        p.alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        break;
      case 'puff':
        u = p.age / p.life;
        if (u >= 1) { this._kill(p); return; }
        p.vx *= Math.pow(0.03, h); p.vy = p.vy * Math.pow(0.03, h) + p.g * h;
        p.x += p.vx * h; p.y += p.vy * h;
        p.size = p.s0 * (1 + 1.2 * u); p.alpha = 0.85 * (1 - u) * Math.min(1, u * 10);
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

  IB.Weather = Weather;
})(window.IB = window.IB || {});
