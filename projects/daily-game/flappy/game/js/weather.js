/* Family Flappy — FF.Weather (seasonal particle simulation, headless, deterministic)
 *
 *   const wx = new FF.Weather({ width:960, height:540, groundY:470, seed });
 *   wx.setSeason(i, { instant:false });     // smooth hand-over (≈2 s ramp)
 *   wx.update(dt, { wind, scrollSpeed });   // wind px/s (neg = left), scroll px/s
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer, color? , depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, sunRays: 0..1, fog: 0..1 }
 *
 * Coordinates are SCREEN px (same as FF.World). `size` is the drawn width in px.
 * Renderer: draw 'back' layer behind the bird/turtles, 'front' layer over everything;
 * scale x by flipX (−1..1) for the 3-D tumble; sprite 'dot' = filled circle of
 * diameter `size` in `color`.
 *
 * Motion models (see docs/MECHANICS.md):
 *  - petal    : helical "spiral drift" – circular sway + spin, flipX = cos(phase)
 *  - blossom  : slower, mostly face-on drift
 *  - seed     : very low terminal speed, strong wind response, gentle updrafts
 *  - leaf     : pendulum ("falling leaf") – side-to-side swing, falls fastest at the
 *               bottom of the swing, slows at the ends; 40% also tumble (flipX)
 *  - snow     : 3 depth layers; far = tiny/slow/low-parallax, near = big/fast
 *  - butterfly: wandering heading (smoothed random turn), flutter bob at wing rate,
 *               sprite alternates butterfly_a / _b at 8–12 Hz
 *  - pollen   : drifting 'dot' motes in summer light
 * Everything moves left with world scroll × layer parallax, plus wind.
 */
(function (FF) {
  'use strict';

  var TAU = Math.PI * 2;
  var PAR = { back: 0.4, front: 1.1 };      // scroll parallax per layer
  var WIND_LAYER = { back: 0.6, front: 1.0 };

  // emitter tables per season. count = steady-state particles for that emitter.
  // size [px], fall [px/s], par overrides layer parallax, resp = wind response, alpha
  var SEASONS = [
    { // 0 spring
      ambient: { tint: [255, 214, 232, 0.05], sunRays: 0.25, fog: 0 },
      emitters: [
        { kind: 'petal',   layer: 'back',  count: 22, size: [8, 13],  fall: [26, 42], resp: 1.1, alpha: [0.75, 0.95] },
        { kind: 'petal',   layer: 'front', count: 12, size: [14, 20], fall: [42, 66], resp: 1.2, alpha: [0.85, 0.95] },
        { kind: 'blossom', layer: 'back',  count: 3,  size: [12, 16], fall: [32, 44], resp: 0.9, alpha: [0.85, 1] },
        { kind: 'blossom', layer: 'front', count: 3,  size: [18, 24], fall: [50, 66], resp: 1.0, alpha: [0.9, 1] },
        { kind: 'seed',    layer: 'back',  count: 4,  size: [10, 14], fall: [10, 20], resp: 1.4, alpha: [0.7, 0.9] }
      ]
    },
    { // 1 summer
      ambient: { tint: [255, 226, 140, 0.06], sunRays: 0.85, fog: 0 },
      emitters: [
        { kind: 'butterfly', layer: 'front', count: 'butterflies', size: [20, 26], fall: [0, 0], resp: 0.3, alpha: [1, 1] },
        { kind: 'seed',      layer: 'back',  count: 14, size: [9, 13],  fall: [8, 18],  resp: 1.4, alpha: [0.7, 0.9] },
        { kind: 'seed',      layer: 'front', count: 6,  size: [14, 18], fall: [12, 22], resp: 1.5, alpha: [0.8, 0.95] },
        { kind: 'pollen',    layer: 'back',  count: 22, size: [2, 4],   fall: [3, 9],  resp: 0.8, alpha: [0.5, 0.9], sprite: 'dot',
          color: 'rgba(255,246,196,1)' }
      ]
    },
    { // 2 autumn
      ambient: { tint: [255, 150, 70, 0.06], sunRays: 0.3, fog: 0.06 },
      emitters: [
        { kind: 'leaf', layer: 'back',  count: 26, size: [11, 16], fall: [34, 52], resp: 1.3, alpha: [0.8, 0.95] },
        { kind: 'leaf', layer: 'front', count: 14, size: [18, 26], fall: [55, 85], resp: 1.4, alpha: [0.88, 0.97] }
      ]
    },
    { // 3 winter
      ambient: { tint: [190, 210, 255, 0.08], sunRays: 0, fog: 0.35 },
      emitters: [
        { kind: 'snow', layer: 'back',  count: 40, size: [2, 4],   fall: [16, 26],  par: 0.22, resp: 0.7, alpha: [0.55, 0.75], sprite: 'dot',
          color: 'rgba(255,255,255,1)', depth: 0.15 },
        { kind: 'snow', layer: 'back',  count: 22, size: [4, 7],   fall: [32, 46],  par: 0.45, resp: 0.85, alpha: [0.75, 0.9], sprite: 'dot',
          color: 'rgba(255,255,255,1)', depth: 0.45 },
        { kind: 'snow', layer: 'back',  count: 10, size: [10, 14], fall: [40, 54],  par: 0.55, resp: 0.9, alpha: [0.85, 0.95],
          sprite: 'snowflake', depth: 0.55 },
        { kind: 'snow', layer: 'front', count: 14, size: [16, 26], fall: [70, 100], par: 1.15, resp: 1.0, alpha: [0.8, 0.9],
          sprite: 'snowflake', depth: 1 }
      ]
    }
  ];
  var LEAVES = ['leaf_red', 'leaf_orange', 'leaf_yellow'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.groundY = opts.groundY || 470;
    this.rng = new FF.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;        // s for a new season to reach full density
    this.rampOut = opts.rampOut || 1;      // s for the old season to stop spawning
    this.maxStep = 1 / 60;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.butterflies = 4;
    this.season = 0;
    this.time = 0;
    this.wind = 0; this.scrollSpeed = 0;
    this.ambient = { tint: null, sunRays: 0, fog: 0 };
    this.setSeason(opts.season || 0, { instant: true });
  }

  Weather.SEASONS = SEASONS;

  Weather.prototype._count = function (season, em) {
    return em.count === 'butterflies' ? this.butterflies : em.count;
  };

  Weather.prototype.setSeason = function (i, opts) {
    i = ((i % 4) + 4) % 4;
    var instant = opts && opts.instant;
    if (i === 1 && (instant || this.season !== 1)) this.butterflies = this.rng.int(3, 6);
    this.season = i;
    if (instant) {
      this.particles.length = 0;
      this.ramp = [0, 0, 0, 0];
      this.ramp[i] = 1;
      var ems = SEASONS[i].emitters;
      for (var e = 0; e < ems.length; e++) {
        var n = this._count(i, ems[e]);
        for (var k = 0; k < n; k++) this._spawn(i, e, 'inside', 1);
      }
    } else {
      for (var p = 0; p < this.particles.length; p++) {
        var q = this.particles[p];
        if (q.season !== i && !q.leaving) {
          q.leaving = true;
          q.leaveDelay = this.rng.range(0, 2.5);  // stagger: they fade/fly out over ~1–4 s
        } else if (q.season === i) {
          q.leaving = false;
        }
      }
    }
    this._updateAmbient();
  };

  /* --- spawning --- */
  Weather.prototype._spawn = function (season, ei, where, fade) {
    var r = this.rng, em = SEASONS[season].emitters[ei];
    var p = {
      sprite: em.sprite || em.kind, x: 0, y: 0,
      size: r.range(em.size[0], em.size[1]),
      rot: r.range(0, TAU), flipX: 1, alpha: 0,
      layer: em.layer,
      depth: em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.4),
      // internals
      season: season, emitter: ei, kind: em.kind,
      baseAlpha: r.range(em.alpha[0], em.alpha[1]),
      fade: fade, leaving: false, leaveDelay: 0,
      fall: r.range(em.fall[0], em.fall[1]),
      par: em.par !== undefined ? em.par : PAR[em.layer],
      resp: em.resp * WIND_LAYER[em.layer],
      wvx: this.wind * em.resp * WIND_LAYER[em.layer],
      phase: r.range(0, TAU), omega: 0, amp: 0, spin: 0,
      tumble: false, tphase: r.range(0, TAU), tomega: 0,
      vx: 0, vy: 0
    };
    if (em.color) p.color = em.color;
    switch (em.kind) {
      case 'petal':
        p.omega = r.range(1.3, 2.4) * r.sign(); p.amp = r.range(14, 28); p.spin = r.range(1, 2.6) * r.sign();
        break;
      case 'blossom':
        p.omega = r.range(0.8, 1.4) * r.sign(); p.amp = r.range(8, 16); p.spin = r.range(0.4, 1.0) * r.sign();
        break;
      case 'seed':
        p.omega = r.range(0.5, 1.0); p.amp = r.range(6, 14); p.spin = 0;
        break;
      case 'pollen':
        p.omega = r.range(0.4, 0.9); p.amp = r.range(5, 12);
        break;
      case 'leaf':
        p.sprite = r.pick(LEAVES);
        p.omega = r.range(1.6, 2.6); p.amp = r.range(22, 42);
        p.tumble = r.chance(0.4); p.tomega = r.range(3, 6) * r.sign();
        p.spin = p.tumble ? r.range(1.5, 4) * r.sign() : 0;
        p.baseRot = r.range(-0.6, 0.6);
        break;
      case 'snow':
        p.omega = r.range(0.6, 1.4); p.amp = r.range(6, 18) * (0.5 + p.depth); p.spin = r.range(-0.6, 0.6);
        break;
      case 'butterfly':
        p.heading = r.range(0, TAU); p.turn = 0; p.turnTarget = r.range(-1.5, 1.5); p.turnTimer = r.range(0.4, 1.4);
        p.speed = r.range(38, 62); p.flapRate = r.range(8, 12); p.fphase = r.next();
        p.rot = 0;
        break;
    }
    this._place(p, where);
    this.particles.push(p);
    return p;
  };

  // net screen velocity estimate for choosing an entry edge
  Weather.prototype._netV = function (p) {
    var vx = this.wind * p.resp - this.scrollSpeed * p.par;
    if (p.kind === 'butterfly') vx = -this.scrollSpeed * p.par;
    return { vx: vx, vy: Math.max(p.fall, 1) };
  };

  Weather.prototype._place = function (p, where) {
    var r = this.rng, W = this.width, G = this.groundY, m = p.size + 10;
    if (p.kind === 'butterfly') {
      p.y = r.range(130, G - 110);
      if (where === 'inside') p.x = r.range(40, W - 40);
      else p.x = this._netV(p).vx <= 0 ? W + m : -m;
      p.heading = p.x > W ? r.range(Math.PI * 0.8, Math.PI * 1.2) : r.range(-0.4, 0.4);
      return;
    }
    if (where === 'inside') {
      p.x = r.range(-10, W + 10);
      p.y = r.range(-10, G - 10);
      return;
    }
    var v = this._netV(p), ax = Math.abs(v.vx);
    var pSide = ax * G / (ax * G + v.vy * W);
    if (ax > 3 && r.chance(pSide)) {
      p.x = v.vx < 0 ? W + m : -m;
      p.y = r.range(-m, G - 30);
    } else {
      // top edge, shifted upwind so particles drift into view
      p.x = r.range(0, W) + (v.vx < 0 ? r.range(0, ax * 2) : -r.range(0, ax * 2));
      p.y = -m;
    }
  };

  Weather.prototype._outside = function (p) {
    var m = p.size + 20;
    if (p.x < -m - 10 || p.x > this.width + m + 80) return true;
    if (p.y < -m - 80) return true;
    var bottom = p.layer === 'back' ? this.groundY + 4 : this.height + m;
    return p.y > bottom;
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var wind = this.wind;
    p.wvx += (wind * p.resp - p.wvx) * (1 - Math.exp(-1.5 * h));
    var vx = 0, vy = p.fall, c, s;
    switch (p.kind) {
      case 'petal':      // helix seen from the side
        p.phase += p.omega * h;
        vx = Math.cos(p.phase) * p.amp * Math.abs(p.omega);
        vy = p.fall * (0.8 + 0.35 * Math.sin(p.phase));
        p.rot += p.spin * h;
        p.flipX = Math.cos(p.phase);
        break;
      case 'blossom':
        p.phase += p.omega * h;
        vx = Math.cos(p.phase) * p.amp * Math.abs(p.omega);
        vy = p.fall * (0.9 + 0.15 * Math.sin(p.phase * 2));
        p.rot += p.spin * h;
        p.flipX = 0.7 + 0.3 * Math.cos(p.phase);
        break;
      case 'seed':       // floaty, rides the wind, little thermals
        p.phase += p.omega * h;
        vx = Math.cos(p.phase) * p.amp * p.omega;
        vy = p.fall + 9 * Math.sin(p.phase * 0.7 + 1);
        p.rot = 0.35 * Math.sin(p.phase);
        p.flipX = 1;
        break;
      case 'pollen':
        p.phase += p.omega * h;
        vx = Math.cos(p.phase) * p.amp * p.omega;
        vy = p.fall + Math.sin(p.phase * 1.3) * p.amp * p.omega; // shimmer is applied to alpha in _step
        break;
      case 'leaf':       // pendulum fall
        p.phase += p.omega * h;
        s = Math.sin(p.phase); c = Math.cos(p.phase);
        vx = c * p.amp * p.omega;                       // swing velocity
        vy = p.fall * (0.3 + 1.15 * c * c);             // fast through the bottom, slow at the ends
        vy -= Math.max(0, Math.abs(wind) - 30) * 0.35;  // strong gusts loft leaves
        if (p.tumble) {
          p.tphase += p.tomega * h;
          p.rot += p.spin * h;
          p.flipX = Math.cos(p.tphase);
        } else {
          p.rot = p.baseRot + 0.85 * s;                 // tilt with the swing
          p.flipX = 0.55 + 0.45 * Math.cos(p.phase * 0.5);
        }
        break;
      case 'snow':
        p.phase += p.omega * h;
        vx = Math.cos(p.phase) * p.amp * p.omega;
        vy = p.fall;
        p.rot += p.spin * h;
        p.flipX = 1;
        break;
      case 'butterfly':
        this._butterfly(p, h);
        return;
    }
    p.x += (vx + p.wvx - this.scrollSpeed * p.par) * h;
    p.y += vy * h;
  };

  Weather.prototype._butterfly = function (p, h) {
    var r = this.rng, G = this.groundY;
    p.fphase += p.flapRate * h;
    if (p.fphase >= 1) p.fphase -= Math.floor(p.fphase);
    p.sprite = p.fphase < 0.5 ? 'butterfly_a' : 'butterfly_b';
    // wandering: turn rate eases toward a random target that changes now and then
    p.turnTimer -= h;
    if (p.turnTimer <= 0) { p.turnTarget = r.range(-1.8, 1.8); p.turnTimer = r.range(0.4, 1.4); }
    p.turn += (p.turnTarget - p.turn) * (1 - Math.exp(-3 * h));
    var hx = Math.cos(p.heading), hy = Math.sin(p.heading);
    var steer = 0;
    if (p.leaving) {
      // fly up and away
      var ang = Math.atan2(hy, hx), want = -Math.PI * 0.6;
      steer = Math.sin(want - ang) * 3;
    } else {
      // keep in the meadow band and (loosely) on screen
      if (p.y < 120) steer += hx >= 0 ? 2.2 : -2.2;          // turn downward
      if (p.y > G - 90) steer += hx >= 0 ? -2.2 : 2.2;        // turn upward
      if (p.x < 60 && hx < 0) steer += hy >= 0 ? -2 : 2;      // turn right-ward
    }
    p.heading += (p.turn + steer) * h;
    var sp = p.speed * (p.leaving ? 1.6 : 1);
    var bob = Math.sin(p.fphase * TAU) * 28;                  // flutter bob
    var vx = Math.cos(p.heading) * sp, vy = Math.sin(p.heading) * sp + bob;
    p.x += (vx + p.wvx - this.scrollSpeed * p.par) * h;
    p.y += vy * h;
    p.rot = clamp(Math.sin(p.heading) * 0.35, -0.4, 0.4);
    p.flipX = Math.cos(p.heading) >= 0 ? 1 : -1;              // face travel direction
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h) {
    var i, p, s;
    this.time += h;
    for (s = 0; s < 4; s++) {
      if (s === this.season) this.ramp[s] = Math.min(1, this.ramp[s] + h / this.rampIn);
      else this.ramp[s] = Math.max(0, this.ramp[s] - h / this.rampOut);
    }
    // count live (non-leaving) particles per emitter of the current season
    var ems = SEASONS[this.season].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.season === this.season && !p.leaving) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) {
        if (p.leaveDelay > 0) p.leaveDelay -= h;
        else p.fade -= h / 1.5;
      }
      var a = p.baseAlpha * clamp(p.fade, 0, 1);
      if (p.kind === 'pollen') a *= 0.65 + 0.35 * Math.sin(this.time * 3 + p.phase * 2);
      if (p.layer === 'back' && p.y > this.groundY - 24) a *= clamp((this.groundY + 4 - p.y) / 28, 0, 1);
      p.alpha = a;
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var target = Math.round(this._count(p.season, ems[p.emitter] || {}) * this.ramp[p.season]);
        if (!p.leaving && p.season === this.season && have[p.emitter] <= target) {
          this._recycle(p);
        } else {
          this.particles.splice(i, 1);
          if (!p.leaving && p.season === this.season) have[p.emitter]--;
        }
      }
    }
    // ramp-in fill: spawn inside the view, fading in
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(this._count(this.season, ems[i]) * this.ramp[this.season]);
      while (have[i] < want) { this._spawn(this.season, i, 'inside', 0); have[i]++; }
    }
  };

  Weather.prototype._recycle = function (p) {
    // re-enter at an edge with fresh randomness (density stays constant)
    var r = this.rng, em = SEASONS[p.season].emitters[p.emitter];
    p.size = r.range(em.size[0], em.size[1]);
    p.fall = r.range(em.fall[0], em.fall[1]);
    p.phase = r.range(0, TAU);
    if (p.kind === 'leaf') p.sprite = r.pick(LEAVES);
    p.fade = 1;
    p.wvx = this.wind * p.resp;
    this._place(p, 'edge');
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], sun = 0, fog = 0, s;
    for (s = 0; s < 4; s++) tot += this.ramp[s];
    if (tot <= 0) { tot = 1; }
    for (s = 0; s < 4; s++) {
      var k = this.ramp[s] / tot, a = SEASONS[s].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      sun += a.sunRays * k; fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.sunRays = sun;
    this.ambient.fog = fog;
  };

  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    env = env || {};
    this.wind = env.wind || 0;
    this.scrollSpeed = env.scrollSpeed || 0;
    var n = Math.max(1, Math.ceil(dt / this.maxStep - 1e-9)), h = dt / n;
    for (var i = 0; i < n; i++) this._step(h);
    this._updateAmbient();
  };

  /** Counts per sprite (debug/tests). */
  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, bySprite: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
    }
    return o;
  };

  FF.Weather = Weather;
})(typeof window !== 'undefined' ? (window.FF = window.FF || {}) : (globalThis.FF = globalThis.FF || {}));
