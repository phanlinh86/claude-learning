/* Kit's Toybox Beat — KB.Weather (time-of-day ambient particles + fx, headless, deterministic)
 *
 *   const wx = new KB.Weather({ width:960, height:540, seed });
 *   wx.setLevel(tod, { instant:false });     // 0 dawn, 1 noon, 2 sunset, 3 night; smooth hand-over (~2 s)
 *   wx.resize(w, h);                         // any canvas size (portrait up to 720×1600)
 *   wx.update(dt, { beat, kitX, kitY });     // env optional; crossing an integer beat calls pulse()
 *   wx.pulse();                              // on each beat: particles bob / swell a little
 *   wx.burst(sprite, x, y, n, opts)          // one-shot fx: 'sparkle' | 'star' | 'feather' | 'note' | 'confetti' | 'dot' …
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color? }]
 *   wx.ambient    // { tint:'rgba(..)'|null, glow:0..1, shafts:[{x, w, slope, alpha}] }
 *
 * Draw: translate(x,y) → rotate(rot) → scale(flipX,1), sprite of width `size` centred, globalAlpha = alpha.
 * 'dot' = filled circle of diameter `size` in `color`. `color` on 'confetti' = tint. 'back' particles go
 * behind the tracks / Kit, 'front' over everything (sparse, translucent).
 * ambient.shafts (dawn only, optional): soft diagonal light bands, x = centre at the TOP of the canvas,
 * w = width, slope = dx per dy px (bands lean right going down), alpha = strength.
 * Fixed 1/60 s sub-steps with an accumulator → identical for any dt partition.
 */
(function (KB) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 136;            // hard bound (DESIGN §5.2: < 140)
  var AMB_MAX = 96;                   // ambient budget (incl. particles fading out during a hand-over)
  var FX_MAX = 40;
  var REF_AREA = 960 * 540;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // count = steady state per emitter on 960×540 (scaled by area ×0.6..×1.5)
  var TODS = [
    { // 0 dawn — motes drifting inside diagonal light shafts
      tint: [255, 190, 170, 0.06], glow: 0,
      emitters: [
        { kind: 'mote', layer: 'back', count: 26, size: [5, 9], alpha: [0.45, 0.85], sprite: 'mote' },
        { kind: 'mote', layer: 'front', count: 6, size: [9, 13], alpha: [0.3, 0.55], sprite: 'mote' },
        { kind: 'drift', layer: 'back', count: 10, size: [2, 3], alpha: [0.3, 0.6], sprite: 'dot', color: 'rgba(255,236,210,1)' }
      ]
    },
    { // 1 noon — soap bubbles drifting up, wobbling, popping
      tint: null, glow: 0,
      emitters: [
        { kind: 'bubble', layer: 'back', count: 12, size: [14, 26], alpha: [0.55, 0.85], sprite: 'bubble', rise: [22, 40] },
        { kind: 'bubble', layer: 'front', count: 4, size: [26, 36], alpha: [0.45, 0.65], sprite: 'bubble', rise: [34, 50] },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 3], alpha: [0.25, 0.5], sprite: 'dot', color: 'rgba(255,255,255,1)' }
      ]
    },
    { // 2 sunset — dandelion fluff blown sideways with a gentle pendulum
      tint: [255, 140, 60, 0.10], glow: 0.25,
      emitters: [
        { kind: 'fluff', layer: 'back', count: 14, size: [14, 20], alpha: [0.7, 0.95], sprite: 'fluff', wind: [28, 46] },
        { kind: 'fluff', layer: 'front', count: 4, size: [20, 26], alpha: [0.55, 0.8], sprite: 'fluff', wind: [44, 60] },
        { kind: 'drift', layer: 'back', count: 12, size: [2, 4], alpha: [0.35, 0.65], sprite: 'dot', color: 'rgba(255,200,140,1)' }
      ]
    },
    { // 3 night — projector stars twinkling on the wall + a few floating sparkles
      tint: [20, 30, 90, 0.18], glow: 1,
      emitters: [
        { kind: 'proj', layer: 'back', count: 30, size: [8, 16], alpha: [0.35, 0.8], sprite: 'star' },
        { kind: 'drift', layer: 'front', count: 6, size: [10, 14], alpha: [0.5, 0.85], sprite: 'sparkle' },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 3], alpha: [0.4, 0.8], sprite: 'dot', color: 'rgba(200,220,255,1)' }
      ]
    }
  ];

  // fx defaults per sprite
  var FX = {
    sparkle: { speed: [60, 160], life: [0.45, 0.8], size: [10, 18], g: 0, drag: 3, spin: 4, layer: 'front' },
    star: { speed: [70, 170], life: [0.5, 0.9], size: [12, 20], g: 120, drag: 2, spin: 5, layer: 'front' },
    feather: { speed: [40, 120], life: [1.2, 1.8], size: [14, 20], g: 0, fall: 40, drag: 2.5, rock: true, layer: 'front' },
    note: { speed: [20, 50], life: [0.9, 1.3], size: [16, 22], g: -60, drag: 1.5, spin: 0, layer: 'front' },
    confetti: { speed: [120, 260], life: [0.9, 1.4], size: [8, 12], g: 260, drag: 1.6, spin: 9, layer: 'front' },
    dot: { speed: [60, 140], life: [0.3, 0.6], size: [3, 6], g: 0, drag: 3, spin: 0, layer: 'front' }
  };
  var CONFETTI = ['#ff6b8b', '#ffd25e', '#6bd6ff', '#8cf07a', '#c79bff'];

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new KB.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.stepH = 1 / 60;
    this._acc = 0;
    this.time = 0;
    this.particles = [];
    this.tod = 0;
    this._pulse = 0;
    this._lastBeat = null;
    this._mix = 1;                       // 0→1 hand-over of the ambient tint
    this._fromAmb = null;
    this.ambient = { tint: null, glow: 0, shafts: [] };
    this._scale = this._areaScale();
    this.setLevel(opts.tod || 0, { instant: true });
  }
  Weather.TODS = TODS;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['mote', 'bubble', 'fluff', 'star', 'sparkle', 'feather', 'note', 'confetti', 'dot'];

  Weather.prototype._areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.5); };
  Weather.prototype._count = function (em) { return Math.round(em.count * this._scale); };
  Weather.prototype._ambCount = function () {
    var n = 0; for (var i = 0; i < this.particles.length; i++) if (!this.particles[i].fx) n++; return n;
  };
  Weather.prototype._target = function (tod) {
    var ems = TODS[tod].emitters, n = 0;
    for (var e = 0; e < ems.length; e++) n += this._count(ems[e]);
    return Math.min(n, AMB_MAX);
  };

  Weather.prototype.setLevel = function (tod, opts) {
    tod = (((tod | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, i, p;
    this._fromAmb = this._ambNow();
    this._prevTod = instant ? tod : this.tod;
    this.tod = tod;
    if (instant) {
      this.particles = this.particles.filter(function (q) { return q.fx; });
      var ems = TODS[tod].emitters;
      for (var e = 0; e < ems.length; e++) for (var k = 0, n = this._count(ems[e]); k < n; k++) this._spawn(tod, e, true);
      this._mix = 1;
    } else {
      for (i = 0; i < this.particles.length; i++) {
        p = this.particles[i];
        if (p.fx) continue;
        if (p.tod !== tod) { if (!p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1.2); } }
        else p.leaving = false;
      }
      this._mix = 0;
    }
    this._updateAmbient();
  };
  Weather.prototype.setTod = Weather.prototype.setLevel;

  Weather.prototype.resize = function (w, h) {
    w = +w || this.width; h = +h || this.height;
    if (w === this.width && h === this.height) return;
    var sx = w / this.width, sy = h / this.height;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= sx; p.y *= sy; p.x0 *= sx; p.y0 *= sy;
    }
    this.width = w; this.height = h;
    this._scale = this._areaScale();
    // trim to the new budget (smaller screen): fade the surplus out
    var tgt = this._target(this.tod), n = 0;
    for (i = 0; i < this.particles.length; i++) {
      var q = this.particles[i];
      if (q.fx || q.leaving) continue;
      if (++n > tgt) { q.leaving = true; q.leaveDelay = 0; }
    }
  };

  /* --- light shafts (dawn): 3 diagonal bands from the window side --- */
  Weather.prototype._shafts = function () {
    var W = this.width, H = this.height, out = [];
    for (var i = 0; i < 3; i++) {
      out.push({ x: W * (0.10 + 0.22 * i) + 12 * Math.sin(this.time * 0.15 + i * 2), w: W * (0.07 + 0.03 * (i % 2)),
        slope: 0.45, alpha: 0.10 + 0.04 * Math.sin(this.time * 0.4 + i) });
    }
    return out;
  };

  /* --- spawning --- */
  Weather.prototype._spawn = function (tod, ei, inside) {
    var em = TODS[tod].emitters[ei], r = this.rng, W = this.width, H = this.height;
    var p = {
      sprite: em.sprite, x: 0, y: 0, size: 0, rot: 0, flipX: 1, alpha: 0, layer: em.layer,
      kind: em.kind, tod: tod, ei: ei, fx: false, leaving: false, leaveDelay: 0, fade: inside ? 1 : 0,
      size0: r.range(em.size[0], em.size[1]), a0: r.range(em.alpha[0], em.alpha[1]),
      ph: r.range(0, TAU), x0: 0, y0: 0, vx: 0, vy: 0, life: 0, age: 0, spin: 0
    };
    if (em.color) p.color = em.color;
    p.size = p.size0; p.alpha = p.a0 * p.fade;
    switch (em.kind) {
      case 'mote': {                                      // inside a light shaft
        var sh = r.int(3), yy = r.range(0, H);
        var cx = W * (0.10 + 0.22 * sh) + yy * 0.45;
        p.x = p.x0 = cx + r.range(-0.05, 0.05) * W; p.y = p.y0 = yy;
        p.vx = r.range(-6, 6); p.vy = r.range(-4, 4); p.sh = sh;
        break;
      }
      case 'bubble':
        p.x = p.x0 = r.range(0.05, 0.95) * W;
        p.y = inside ? r.range(0.1, 1) * H : H + p.size0;
        p.vy = -r.range(em.rise[0], em.rise[1]); p.amp = r.range(8, 18);
        p.life = r.range(5, 14); p.age = inside ? r.range(0, p.life * 0.7) : 0;
        break;
      case 'fluff':
        p.x = inside ? r.range(0, W) : -p.size0 - r.range(0, 60);
        p.y = p.y0 = r.range(0.08, 0.85) * H;
        p.vx = r.range(em.wind[0], em.wind[1]); p.amp = r.range(10, 22); p.freq = r.range(0.5, 0.9);
        p.flipX = r.chance(0.5) ? 1 : -1;
        break;
      case 'proj':                                        // projector star on the wall (slowly rotating field)
        p.x = p.x0 = r.range(0, W); p.y = p.y0 = r.range(0.04, 0.62) * H;
        p.spin = r.range(-0.3, 0.3); p.tw = r.range(0.6, 1.4);
        p.rot = r.range(0, TAU);
        break;
      default:                                            // drift
        p.x = p.x0 = r.range(0, W); p.y = p.y0 = r.range(0, H);
        p.vx = r.range(-8, 8); p.vy = r.range(-6, 6);
        if (em.sprite === 'sparkle') { p.spin = r.range(-1, 1); p.tw = r.range(1, 2); }
    }
    this.particles.push(p);
    return p;
  };

  Weather.prototype.pulse = function () { this._pulse = 1; };

  /* burst(sprite, x, y, n, opts): opts { speed:[a,b], life:[a,b], size:[a,b], color, layer, dir (rad), spread (rad) } */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var d = FX[sprite] || FX.sparkle, r = this.rng;
    n = clamp(n === undefined ? 8 : n | 0, 0, FX_MAX);
    for (var i = 0; i < n; i++) {
      var nfx = 0, k;
      for (k = 0; k < this.particles.length; k++) if (this.particles[k].fx) nfx++;
      if (nfx >= FX_MAX || this.particles.length >= MAX_PARTICLES) {   // drop the oldest fx
        for (k = 0; k < this.particles.length; k++) if (this.particles[k].fx) { this.particles.splice(k, 1); break; }
        if (this.particles.length >= MAX_PARTICLES) break;
      }
      var sp = opts.speed || d.speed, lf = opts.life || d.life, sz = opts.size || d.size;
      var ang = opts.dir !== undefined ? opts.dir + r.range(-1, 1) * (opts.spread !== undefined ? opts.spread : 0.8)
        : r.range(0, TAU);
      var v = r.range(sp[0], sp[1]);
      var p = {
        sprite: sprite, x: x, y: y, x0: x, y0: y, size: 0, size0: r.range(sz[0], sz[1]), rot: r.range(0, TAU), flipX: r.chance(0.5) ? 1 : -1,
        alpha: 1, a0: 1, layer: opts.layer || d.layer, fx: true, kind: 'fx', vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        life: r.range(lf[0], lf[1]), age: 0, spin: (d.spin || 0) * r.range(-1, 1), g: d.g, drag: d.drag, fall: d.fall || 0,
        rock: !!d.rock, ph: r.range(0, TAU), fade: 1, leaving: false
      };
      p.size = p.size0;
      if (sprite === 'confetti') p.color = opts.color || r.pick(CONFETTI);
      else if (opts.color) p.color = opts.color;
      else if (sprite === 'dot') p.color = 'rgba(255,255,255,1)';
      this.particles.push(p);
    }
  };

  Weather.prototype.update = function (dt, env) {
    dt = clamp(+dt || 0, 0, 0.5);
    if (env && typeof env.beat === 'number' && isFinite(env.beat)) {
      var fb = Math.floor(env.beat);
      if (this._lastBeat !== null && fb !== this._lastBeat) this.pulse();
      this._lastBeat = fb;
    }
    this._acc += dt;
    while (this._acc >= this.stepH - 1e-9) { this._acc -= this.stepH; this._step(this.stepH, env); }
  };

  Weather.prototype._step = function (h, env) {
    var W = this.width, H = this.height, r = this.rng, i, p;
    this.time += h;
    this._pulse = Math.max(0, this._pulse - h * 4);       // a beat bob lasts ≈ 0.25 s
    if (this._mix < 1) this._mix = Math.min(1, this._mix + h / 2);
    var pulse = this._pulse * this._pulse;
    var kx = env && env.kitX, ky = env && env.kitY;
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (p.fx) {
        p.age += h;
        if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
        var dr = Math.exp(-p.drag * h);
        p.vx *= dr; p.vy = p.vy * dr + p.g * h;
        if (p.fall) p.vy += (p.fall - p.vy) * Math.min(1, 2 * h);
        p.x += p.vx * h; p.y += p.vy * h;
        if (p.rock) { p.rot = 0.6 * Math.sin(p.ph + p.age * 4); p.x += Math.cos(p.ph + p.age * 4) * 18 * h; }
        else p.rot += p.spin * h;
        var u = p.age / p.life;
        p.alpha = u < 0.7 ? 1 : clamp((1 - u) / 0.3, 0, 1);
        p.size = p.size0 * (p.sprite === 'sparkle' ? (u < 0.2 ? 0.5 + 2.5 * u : 1 - 0.4 * u) : 1);
        continue;
      }
      // fade in / out
      if (p.leaving) {
        if (p.leaveDelay > 0) p.leaveDelay -= h;
        else { p.fade -= h / 0.8; if (p.fade <= 0) { this.particles.splice(i, 1); continue; } }
      } else if (p.fade < 1) p.fade = Math.min(1, p.fade + h / 0.8);
      var a = p.a0, sz = p.size0, t = this.time;
      switch (p.kind) {
        case 'mote': {
          // wander slowly, gently pulled back to the centre line of its shaft; brighter near the centre
          p.vx += r.range(-10, 10) * h; p.vy += r.range(-10, 10) * h - 1.5 * h;
          p.vx *= Math.exp(-0.8 * h); p.vy *= Math.exp(-0.8 * h);
          var cx = W * (0.10 + 0.22 * p.sh) + 12 * Math.sin(t * 0.15 + p.sh * 2) + p.y * 0.45;
          var half = W * (0.035 + 0.015 * (p.sh % 2));
          p.vx += (cx - p.x) * 0.25 * h;
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
          var dd = Math.abs(p.x - cx) / (half * 1.6);
          a *= clamp(1.15 - dd, 0.15, 1) * (0.75 + 0.25 * Math.sin(p.ph + t * 1.3));
          p.rot = 0;
          break;
        }
        case 'bubble': {
          p.age += h;
          p.y += p.vy * h;
          p.x = p.x0 + p.amp * Math.sin(p.ph + t * 1.6);
          sz *= 1 + 0.06 * Math.sin(p.ph * 2 + t * 5);    // wobble
          p.rot = 0.12 * Math.sin(p.ph + t * 2.2);
          if (p.age >= p.life || p.y < -40) {             // pop (or float away) → respawn at the bottom
            if (p.y > 0 && this.particles.length < MAX_PARTICLES - 6) this.burst('dot', p.x, p.y, 4, { speed: [40, 80], life: [0.2, 0.35], size: [2, 4], layer: p.layer });
            this._respawn(p, i); continue;
          }
          if (kx !== undefined && ky !== undefined) {     // nudged by Kit's rocket
            var bx = p.x - kx, by = p.y - ky, b2 = bx * bx + by * by;
            if (b2 < 70 * 70 && b2 > 1) p.x0 += bx / Math.sqrt(b2) * 40 * h;
          }
          break;
        }
        case 'fluff': {
          p.x += p.vx * h * (0.85 + 0.3 * Math.sin(t * 0.7 + p.ph));   // gusty breeze
          var sw = Math.sin(p.ph + t * p.freq * TAU);
          p.y = p.y0 + p.amp * sw + 6 * Math.sin(t * 0.3 + p.ph);
          p.y0 += 3 * h;                                   // sinks very slowly
          p.rot = 0.5 * Math.cos(p.ph + t * p.freq * TAU);   // tilt follows the swing
          if (p.x > W + 40 || p.y0 > H * 0.95) { this._respawn(p, i); continue; }
          break;
        }
        case 'proj': {
          p.x += 6 * h;                                    // projector turns slowly → stars slide sideways
          if (p.x > W + 20) p.x -= W + 40;
          p.y = p.y0 + 3 * Math.sin(t * 0.2 + p.ph);
          p.rot += p.spin * h;
          a *= 0.55 + 0.45 * Math.sin(p.ph + t * p.tw * 2);     // twinkle
          break;
        }
        default: {                                         // drift: velocity eases to random targets, wraps
          if (r.chance(h * 0.5)) { p.tvx = r.range(-10, 10); p.tvy = r.range(-8, 6); }
          if (p.tvx !== undefined) { p.vx += (p.tvx - p.vx) * h; p.vy += (p.tvy - p.vy) * h; }
          p.x += p.vx * h; p.y += p.vy * h;
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
          if (p.spin) { p.rot += p.spin * h; a *= 0.6 + 0.4 * Math.sin(p.ph + t * p.tw * 3); }
        }
      }
      p.size = sz * (1 + 0.12 * pulse);
      p.alpha = clamp(a * p.fade, 0, 1);
      // beat bob: up to 3 px up. Kinds that recompute y each step get the full offset; integrating
      // kinds get only the change, so the bob never accumulates into their motion.
      var bob = -3 * pulse;
      if (p.kind === 'fluff' || p.kind === 'proj') p.y += bob; else p.y += bob - (p.bob || 0);
      p.bob = bob;
    }
    // top up the current time of day (gradually during a hand-over), within the budget
    var ems = TODS[this.tod].emitters, amb = this._ambCount();
    for (var e = 0; e < ems.length; e++) {
      var have = 0;
      for (i = 0; i < this.particles.length; i++) { p = this.particles[i]; if (!p.fx && !p.leaving && p.tod === this.tod && p.ei === e) have++; }
      var want = this._count(ems[e]);
      var add = Math.min(want - have, this._mix < 1 ? 1 : want);
      for (var k = 0; k < add && amb < AMB_MAX && this.particles.length < MAX_PARTICLES; k++) {
        var q = this._spawn(this.tod, e, true);
        q.fade = 0; amb++;
      }
    }
    this._updateAmbient();
  };

  Weather.prototype._respawn = function (p, i) {
    this.particles.splice(i, 1);
    if (p.leaving || p.tod !== this.tod) return;
    var q = this._spawn(p.tod, p.ei, false);
    q.fade = 0;
  };

  Weather.prototype._ambNow = function () {
    var a = this.ambient;
    return { tint: this._tintArr || null, glow: a.glow };
  };
  Weather.prototype._updateAmbient = function () {
    var to = TODS[this.tod], m = this._mix, from = this._fromAmb || { tint: null, glow: to.glow };
    var t0 = from.tint || (to.tint ? [to.tint[0], to.tint[1], to.tint[2], 0] : null);
    var t1 = to.tint || (t0 ? [t0[0], t0[1], t0[2], 0] : null);
    var tint = null;
    if (t0 && t1) {
      tint = [0, 1, 2, 3].map(function (j) { return t0[j] + (t1[j] - t0[j]) * m; });
      if (tint[3] < 0.004) tint = null;
    }
    this._tintArr = tint;
    this.ambient.tint = tint ? 'rgba(' + Math.round(tint[0]) + ',' + Math.round(tint[1]) + ',' + Math.round(tint[2]) + ',' + tint[3].toFixed(3) + ')' : null;
    this.ambient.glow = from.glow + (to.glow - from.glow) * m;
    // dawn light shafts fade in / out with the hand-over
    var k = this.tod === 0 ? (this._prevTod === 0 ? 1 : m) : (this._prevTod === 0 ? 1 - m : 0);
    this.ambient.shafts = k > 0.001 ? this._shafts().map(function (s) { s.alpha *= k; return s; }) : [];
  };

  KB.Weather = Weather;
})(window.KB = window.KB || {});
