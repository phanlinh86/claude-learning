/* Bristle's Moon Pop — MP.Weather (time-of-day ambient particles + gameplay fx, headless, deterministic)
 *
 *   const wx = new MP.Weather({ width:960, height:540, seed });
 *   wx.setZone(z, { instant:false });            // alias wx.setSeason(); smooth hand-over (~2 s)
 *   wx.update(dt, { hog: w.hog, world: w });     // both optional (hog defaults to world.hog)
 *   wx.burst(kind, x, y, n, opts?);              // 'pop'|'sparkle'|'twinkle'|'dust'|'star'|'spark'|'confetti'|'crumb'
 *   wx.wheels(x, y, speed);                      // a puff of moon dust from the wheels (one call = one puff)
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, zone, depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, glow: 0..1 (bubble glow, night = 1) }
 *
 * `size` = drawn width in px. 'back' = behind the bubbles (sky band), 'front' = over everything.
 * Draw with translate(x,y) → rotate(rot) → scale(flipX, 1). Sprites = assets/default/particles/<name>.svg
 * (DESIGN §4.3: sparkle twinkle dust droplet mote shoot spark star crumb), plus 'dot' (filled circle of
 * diameter `size` in `color`) and 'confetti' (small rect size × size·0.55 in `color`).
 *
 * AUTOMATIC FX (when update() gets env.hog / env.world; disable with new MP.Weather({ auto:false })):
 *  - wheel dust while Bristle skates fast on the floor (rate ∝ speed above 170 px/s) — main.js does NOT need
 *    to call wheels() per frame (call it for an extra puff, e.g. on 'land');
 *  - magnet sparks on the field ring while world.magnet.t > 0.
 * POP DROPLETS: burst('pop', x, y, n) flings droplets that inherit the bubble's velocity. Pass
 *  opts {vx, vy} (the 'pop' event carries vx, vy); without opts the velocity is looked up from the popped
 *  bubble in the last world seen by update().
 *
 * update() runs fixed 1/60 s sub-steps with an accumulator, so the result is identical for any dt
 * partition (same seed + same calls + same env). Hard bound: MAX_PARTICLES = 176 (< 180).
 *
 * Motion models (docs/MECHANICS.md §7):
 *  - mote    : dust motes: velocity eases to random wander targets, gentle pulse
 *  - glint   : twinkles / glitter / night stars: fixed spot, sin² life (twinkle), dawn twinkles fade
 *  - shoot   : shooting star: straight fast streak (rot = heading), fades in/out over its life
 *  - fx      : bursts: velocity + gravity + air drag, optional floor, size growth, fade
 */
(function (MP) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 176;          // hard bound (DESIGN §5.2: < 180)
  var FX_MAX = 80;                  // gameplay fx share of the budget
  var FLOOR = 492;
  var CONFETTI = ['#ff8fb1', '#ffd34d', '#7fe3d0', '#9be89b', '#c9a3ff', '#ffb36b'];
  var CRUMBS = ['#ff9ec4', '#8fe3c8', '#ffe27a', '#b9a3ff', '#ffffff'];
  var MOON_G = 400;                 // px/s², fx gravity: floaty Moon arcs

  // count = steady-state particles per emitter; shoot = { every: [a, b] s } (shooting stars)
  var ZONES = [
    { // 0 dawn — fading twinkles + slow dust motes
      ambient: { tint: [255, 200, 190, 0.03], glow: 0.15 },
      emitters: [
        { kind: 'glint', layer: 'back', count: 12, size: [7, 12], alpha: [0.45, 0.8], sprite: 'twinkle', band: [20, 200], life: [1.6, 3.2], dim: 0.6 },
        { kind: 'mote', layer: 'back', count: 12, size: [6, 10], alpha: [0.3, 0.55], sprite: 'mote', band: [150, 470], speed: 6 },
        { kind: 'mote', layer: 'front', count: 3, size: [10, 14], alpha: [0.2, 0.35], sprite: 'dust', band: [380, 488], speed: 8 }
      ]
    },
    { // 1 noon — glittering motes
      ambient: { tint: [255, 250, 235, 0.02], glow: 0 },
      emitters: [
        { kind: 'mote', layer: 'back', count: 16, size: [6, 11], alpha: [0.35, 0.65], sprite: 'mote', band: [120, 470], speed: 9 },
        { kind: 'glint', layer: 'back', count: 8, size: [8, 14], alpha: [0.6, 0.95], sprite: 'sparkle', band: [120, 420], life: [0.8, 1.8] },
        { kind: 'mote', layer: 'front', count: 3, size: [11, 15], alpha: [0.2, 0.35], sprite: 'mote', band: [200, 470], speed: 10 }
      ]
    },
    { // 2 sunset — motes + a shooting star every ~6 s
      ambient: { tint: [255, 160, 120, 0.05], glow: 0.35 },
      emitters: [
        { kind: 'mote', layer: 'back', count: 16, size: [6, 11], alpha: [0.35, 0.6], sprite: 'mote', band: [130, 470], speed: 7 },
        { kind: 'glint', layer: 'back', count: 6, size: [6, 10], alpha: [0.4, 0.7], sprite: 'twinkle', band: [10, 160], life: [1.5, 3] },
        { kind: 'mote', layer: 'front', count: 2, size: [11, 15], alpha: [0.2, 0.35], sprite: 'dust', band: [380, 488], speed: 8 }
      ],
      shoot: { every: [4.5, 7.5], y: [20, 170] }
    },
    { // 3 night — twinkling stars (back), shooting stars every ~4 s, glowing motes
      ambient: { tint: [70, 90, 170, 0.06], glow: 1 },
      emitters: [
        { kind: 'glint', layer: 'back', count: 30, size: [6, 13], alpha: [0.55, 1], sprite: 'twinkle', band: [10, 330], life: [1.2, 3.2] },
        { kind: 'glint', layer: 'back', count: 6, size: [10, 15], alpha: [0.6, 0.95], sprite: 'sparkle', band: [20, 260], life: [1.0, 2.2] },
        { kind: 'mote', layer: 'back', count: 12, size: [7, 12], alpha: [0.45, 0.8], sprite: 'mote', band: [160, 470], speed: 7 },
        { kind: 'mote', layer: 'front', count: 3, size: [11, 16], alpha: [0.3, 0.5], sprite: 'mote', band: [260, 480], speed: 8 }
      ],
      shoot: { every: [3, 5], y: [10, 200] }
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new MP.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.auto = opts.auto !== false;
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.zone = 0; this.season = 0;
    this.time = 0;
    this.ambient = { tint: null, glow: 0 };
    this._wheelAcc = 0; this._sparkAcc = 0; this._nFx = 0; this._shootT = 2; this._world = null;
    this.setZone(opts.zone || opts.season || 0, { instant: true });
    for (var k = 0; k < 60; k++) this._step(this.stepH, null);   // pre-warm 1 s
    this.time = 0;
  }
  Weather.ZONES = ZONES;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['sparkle', 'twinkle', 'dust', 'droplet', 'mote', 'shoot', 'spark', 'star', 'crumb', 'dot', 'confetti'];

  Weather.prototype.setZone = function (i, opts) {
    i = (((i | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k;
    this.zone = this.season = i;
    if (instant) {
      for (k = this.particles.length - 1; k >= 0; k--) if (this.particles[k].zone >= 0) this.particles.splice(k, 1);
      this.ramp = [0, 0, 0, 0]; this.ramp[i] = 1;
      var ems = ZONES[i].emitters;
      for (var e = 0; e < ems.length; e++) for (k = 0; k < ems[e].count; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.zone < 0) continue;
        if (p.zone !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 0.8); }
        else if (p.zone === i) p.leaving = false;
      }
    }
    var sh = ZONES[i].shoot;
    this._shootT = sh ? this.rng.range(1, sh.every[0]) : 1e9;
    this._updateAmbient();
  };
  Weather.prototype.setSeason = Weather.prototype.setZone;

  /* --- spawning --- */
  Weather.prototype._base = function (zone, kind, sprite, layer, depth) {
    return {
      sprite: sprite, x: 0, y: 0, size: 0, size0: 0, rot: 0, flipX: 1, alpha: 0, layer: layer,
      depth: depth, zone: zone, emitter: -1, kind: kind, baseAlpha: 1, fade: 1, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, spin: 0, vx: 0, vy: 0, age: 0, life: 0, drag: 0, grow: 0, g: 0, floorY: 0
    };
  };

  Weather.prototype._spawn = function (zone, ei, where, fade) {
    if (this.particles.length >= MAX_PARTICLES) return null;
    var em = ZONES[zone].emitters[ei], r = this.rng;
    var p = this._base(zone, em.kind, em.sprite, em.layer, em.layer === 'front' ? 1 : 0.5);
    p.emitter = ei; p.fade = fade;
    p.baseAlpha = r.range(em.alpha[0], em.alpha[1]);
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, inside = where === 'inside', band = em.band;
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU); p.age = 0; p.rot = 0; p.flipX = 1;
    switch (p.kind) {
      case 'mote':
        p.x = r.range(0, W); p.y = r.range(band[0], band[1]); p.band = band; p.speed = em.speed || 8;
        p.tvx = r.range(-1, 1) * p.speed; p.tvy = r.range(-0.7, 0.55) * p.speed; p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.2, 2.6); p.spin = r.range(-0.5, 0.5);
        break;
      case 'glint':
        p.x = r.range(14, W - 14); p.y = r.range(band[0], band[1]);
        p.life = r.range(em.life[0], em.life[1]); p.age = inside ? r.range(0, p.life) : 0;
        p.rot = r.range(-0.3, 0.3); p.dim = em.dim || 0;
        break;
    }
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, e, u;
    p.age += h;
    switch (p.kind) {
      case 'mote':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-1, 1) * p.speed; p.tvy = r.range(-0.7, 0.55) * p.speed; p.retarget = r.range(1, 3); }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += p.vx * h; p.y += p.vy * h;
        p.phase += p.omega * h; p.rot += p.spin * h;
        p.size = p.size0 * (0.85 + 0.15 * Math.sin(p.phase));
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < p.band[0]) p.tvy = Math.abs(p.tvy); else if (p.y > p.band[1]) p.tvy = -Math.abs(p.tvy);
        break;
      case 'glint':
        u = p.age / p.life;
        if (u >= 1) { this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge'); u = 0; }
        p.size = p.size0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.rot += 0.6 * h;
        break;
      case 'shoot':
        p.x += p.vx * h; p.y += p.vy * h;
        break;
      // ---- fx (zone −1) ----
      case 'fx':
        p.vy += p.g * h;
        e = Math.exp(-p.drag * h); p.vx *= e; p.vy *= e;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * Math.max(0.1, 1 + p.grow * u);
        if (p.flutter) { p.phase += p.omega * h; p.flipX = Math.cos(p.phase); }
        if (p.floorY && p.y > p.floorY) { p.y = p.floorY; p.vy = -p.vy * (p.bounce || 0); p.vx *= 0.7; if (Math.abs(p.vy) < 20) p.vy = 0; }
        break;
    }
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1), u;
    switch (p.kind) {
      case 'glint':
        u = clamp(p.age / p.life, 0, 1); a *= Math.pow(Math.sin(Math.PI * u), 2);
        if (p.dim) a *= 1 - p.dim * clamp(this.time / 40, 0, 1);   // dawn: the stars fade as the Earth rises
        break;
      case 'mote': a *= 0.6 + 0.4 * Math.sin(p.phase); break;
      case 'shoot': u = clamp(p.age / p.life, 0, 1); a *= Math.min(1, u * 5) * (1 - u); break;
      case 'fx': u = clamp(p.age / p.life, 0, 1); a *= p.fadeIn ? Math.min(1, u * 6) * (1 - u) : 1 - u * u; break;
    }
    return clamp(a, 0, 1);
  };

  /* --- shooting stars (ambient, zone-owned) --- */
  Weather.prototype._shoot = function (zone) {
    if (this.particles.length >= MAX_PARTICLES - 8) return;
    var r = this.rng, sh = ZONES[zone].shoot, dir = r.sign();
    var p = this._base(zone, 'shoot', 'shoot', 'back', 0.5);
    p.emitter = -1; p.fade = 1; p.baseAlpha = r.range(0.75, 1);
    var sp = r.range(420, 620), ang = r.range(0.25, 0.5);   // heading below horizontal
    p.vx = dir * Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    p.x = dir > 0 ? r.range(-40, this.width * 0.55) : r.range(this.width * 0.45, this.width + 40);
    p.y = r.range(sh.y[0], sh.y[1]);
    p.rot = Math.atan2(p.vy, p.vx); p.size0 = p.size = r.range(46, 70);
    p.life = r.range(0.7, 1.1);
    this.particles.push(p);
  };

  /* --- gameplay fx (zone −1, never part of a hand-over) --- */
  Weather.prototype._fx = function (sprite, layer) {
    if (this._nFx >= FX_MAX || this.particles.length >= MAX_PARTICLES) return null;
    var p = this._base(-1, 'fx', sprite, layer || 'front', 1);
    this.particles.push(p); this._nFx++;
    return p;
  };

  // velocity of the bubble that just popped near (x, y), from the last world seen by update()
  Weather.prototype._popVel = function (x, y) {
    var w = this._world, best = null, bd = 50 * 50;
    if (!w || !w.items) return null;
    for (var i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      if (it.state !== 'pop' && it.state !== 'rise') continue;
      var dx = it.x - x, dy = it.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    // a popped bubble keeps 20 % of its velocity: scale back up
    var k = best.state === 'pop' ? 5 : 1;
    return { vx: best.vx * k, vy: best.vy * k };
  };

  /** One-shot burst of n particles at (x, y). opts: { vx, vy } inherited velocity (pop droplets / dust). */
  Weather.prototype.burst = function (kind, x, y, n, opts) {
    var r = this.rng, p, i, a, sp;
    n = Math.max(1, Math.min(40, n | 0 || 8));
    var ivx = 0, ivy = 0;
    if (opts && (opts.vx || opts.vy)) { ivx = +opts.vx || 0; ivy = +opts.vy || 0; }
    else if (kind === 'pop') { var pv = this._popVel(x, y); if (pv) { ivx = pv.vx; ivy = pv.vy; } }
    for (i = 0; i < n; i++) {
      switch (kind) {
        case 'pop':          // bubble droplets: flung outward from the film, inherit the bubble's motion, Moon arcs
          p = this._fx('droplet', 'front'); if (!p) return;
          a = (i + r.range(-0.3, 0.3)) / n * TAU; sp = r.range(110, 210);
          p.x = x + Math.cos(a) * 24; p.y = y + Math.sin(a) * 24;
          p.vx = Math.cos(a) * sp + ivx * 0.8; p.vy = Math.sin(a) * sp + ivy * 0.8 - 40;
          p.g = MOON_G; p.drag = 1.2; p.size0 = r.range(6, 11); p.grow = -0.4; p.life = r.range(0.45, 0.7);
          p.rot = a; p.spin = r.range(-3, 3); p.floorY = FLOOR;
          break;
        case 'sparkle': case 'twinkle':
          p = this._fx(kind, 'front'); if (!p) return;
          a = r.range(0, TAU); sp = kind === 'sparkle' ? r.range(90, 210) : r.range(25, 70);
          p.vx = Math.cos(a) * sp + ivx * 0.5; p.vy = Math.sin(a) * sp + ivy * 0.5 - (kind === 'twinkle' ? 30 : 0);
          p.drag = kind === 'sparkle' ? 3.5 : 1.2; p.g = kind === 'sparkle' ? 120 : -10;
          p.size0 = r.range(kind === 'sparkle' ? 10 : 7, kind === 'sparkle' ? 18 : 12); p.grow = -0.5;
          p.life = r.range(0.45, 0.85); p.spin = r.range(-4, 4); p.rot = r.range(0, TAU);
          break;
        case 'dust':         // moon dust puffs: low, sideways, slow-settling (landing / pebble landing)
          p = this._fx('dust', 'front'); if (!p) return;
          a = r.sign() * r.range(0.1, 0.9); sp = r.range(40, 120);
          p.vx = Math.sign(a) * Math.cos(Math.abs(a)) * sp + ivx * 0.3; p.vy = -Math.sin(Math.abs(a)) * sp * 0.6 + ivy * 0.2;
          p.g = 60; p.drag = 2.6; p.size0 = r.range(12, 20); p.grow = 1.3; p.life = r.range(0.5, 0.9);
          p.baseAlpha = r.range(0.55, 0.8); p.rot = r.range(0, TAU); p.spin = r.range(-1, 1); p.floorY = FLOOR + 2;
          break;
        case 'star':         // dizzy stars: pop up and drift (bonk)
          p = this._fx('star', 'front'); if (!p) return;
          a = -Math.PI / 2 + r.range(-1.1, 1.1); sp = r.range(70, 150);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 140; p.drag = 2;
          p.size0 = r.range(12, 18); p.grow = -0.2; p.life = r.range(0.6, 0.95); p.spin = r.range(-5, 5); p.rot = r.range(0, TAU);
          break;
        case 'spark':        // magnet sparks: quick, red-white
          p = this._fx('spark', 'front'); if (!p) return;
          a = r.range(0, TAU); sp = r.range(60, 160);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.drag = 5; p.g = 0;
          p.size0 = r.range(9, 15); p.grow = -0.4; p.life = r.range(0.25, 0.45); p.rot = a; p.spin = r.range(-6, 6);
          break;
        case 'confetti':
          p = this._fx('confetti', 'front'); if (!p) return;
          a = -Math.PI / 2 + r.range(-0.9, 0.9); sp = r.range(220, 420);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 300; p.drag = 1.6;
          p.size0 = r.range(7, 11); p.grow = 0; p.life = r.range(1.4, 2.2); p.spin = r.range(-7, 7); p.rot = r.range(0, TAU);
          p.flutter = true; p.omega = r.range(7, 12); p.color = CONFETTI[i % CONFETTI.length]; p.floorY = FLOOR;
          break;
        case 'crumb':        // pastel sprinkles (a cupcake lands in the box / magnet pop)
          p = this._fx('crumb', 'front'); if (!p) return;
          a = -Math.PI / 2 + r.range(-1.3, 1.3); sp = r.range(80, 200);
          p.vx = Math.cos(a) * sp + ivx * 0.4; p.vy = Math.sin(a) * sp + ivy * 0.4; p.g = MOON_G; p.drag = 1;
          p.size0 = r.range(6, 9); p.grow = 0; p.life = r.range(0.6, 1.0); p.spin = r.range(-8, 8); p.rot = r.range(0, TAU);
          p.color = CRUMBS[i % CRUMBS.length]; p.floorY = FLOOR; p.bounce = 0.3;
          break;
        default: return;
      }
      if (kind !== 'pop') { p.x = x + r.range(-4, 4); p.y = y + r.range(-4, 4); }
      p.size = p.size0; p.alpha = p.baseAlpha;
    }
  };

  /** A puff of moon dust from the wheels at (x, y) (wheel contact), skating at `speed` px/s (signed). */
  Weather.prototype.wheels = function (x, y, speed) {
    var r = this.rng, s = +speed || 0, k = clamp(Math.abs(s) / 380, 0, 1.2);
    var p = this._fx('dust', 'front'); if (!p) return;
    var dir = s >= 0 ? 1 : -1;
    p.x = x - dir * r.range(8, 16); p.y = y - r.range(1, 4);
    p.vx = -dir * r.range(20, 60) * k + s * 0.15;          // kicked back, carried a little with him
    p.vy = -r.range(25, 70) * k;                             // low Moon arc
    p.g = 160; p.drag = 2.2; p.size0 = p.size = r.range(7, 12) * (0.6 + 0.5 * k); p.grow = 1.4;
    p.life = r.range(0.4, 0.7); p.baseAlpha = r.range(0.45, 0.7); p.alpha = 0;
    p.rot = r.range(0, TAU); p.spin = r.range(-1.5, 1.5); p.fadeIn = true; p.floorY = FLOOR + 1;
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, env) {
    var i, p, b, hog = env && env.hog, world = env && env.world, r = this.rng;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.zone) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    if (this.auto && hog) {
      // wheel dust while skating fast on the floor
      var sp = Math.abs(hog.vx || 0);
      if (!hog.air && sp > 170) {
        this._wheelAcc += h * 18 * (sp - 170) / 210;
        while (this._wheelAcc >= 1) {
          this._wheelAcc -= 1;
          var bx = hog.board ? hog.board.x : hog.x;
          this.wheels(bx, FLOOR - 1, hog.vx);
        }
      } else this._wheelAcc = 0;
      // magnet sparks on the field ring
      var M = world && world.magnet;
      if (M && M.t > 0) {
        this._sparkAcc += h * 9;
        while (this._sparkAcc >= 1) {
          this._sparkAcc -= 1;
          var a = r.range(0, TAU), rr = r.range(36, 70), q = this._fx('spark', 'front');
          if (!q) break;
          q.x = hog.x + Math.cos(a) * rr; q.y = hog.y + Math.sin(a) * rr;
          q.vx = -Math.cos(a) * 60 + (hog.vx || 0) * 0.6; q.vy = -Math.sin(a) * 60 + (hog.vy || 0) * 0.6;   // drawn inward
          q.drag = 4; q.size0 = q.size = r.range(8, 13); q.grow = -0.5; q.life = r.range(0.25, 0.4); q.rot = a; q.spin = r.range(-6, 6);
          q.baseAlpha = 0.9; q.alpha = 0.9;
        }
      } else this._sparkAcc = 0;
    }
    // shooting stars
    var sh = ZONES[this.zone].shoot;
    if (sh && this.ramp[this.zone] > 0.5) {
      this._shootT -= h;
      if (this._shootT <= 0) { this._shoot(this.zone); this._shootT = r.range(sh.every[0], sh.every[1]); }
    }

    var ems = ZONES[this.zone].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.zone === this.zone && !p.leaving && p.emitter >= 0) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.zone < 0) {                                    // fx particles: fixed lifetime
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life) { this.particles.splice(i, 1); this._nFx--; }
        continue;
      }
      if (p.kind === 'shoot') {
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life || p.leaving) this.particles.splice(i, 1);
        continue;
      }
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(ems[i].count * this.ramp[this.zone]);
      while (have[i] < want && this.particles.length < MAX_PARTICLES - 4) { this._spawn(this.zone, i, 'inside', 0); have[i]++; }
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], glow = 0, b;
    for (b = 0; b < 4; b++) tot += this.ramp[b];
    if (tot <= 0) tot = 1;
    for (b = 0; b < 4; b++) {
      var k = this.ramp[b] / tot, a = ZONES[b].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      glow += a.glow * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.glow = glow;
  };

  /** update(dt, { hog, world }) — both optional; hog defaults to world.hog. */
  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var h = this.stepH;
    if (env) {
      var w = env.world || null, hg = env.hog || (w && w.hog) || null;
      env = { hog: hg, world: w };
      if (w) this._world = w;
    }
    this._acc += dt;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, env || null); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a zone's own emitters (tests / debug). */
  Weather.prototype.fullCount = function (z) {
    var ems = ZONES[z].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += ems[i].count;
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, fx: this._nFx, bySprite: {}, byKind: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
      o.byKind[p.kind] = (o.byKind[p.kind] || 0) + 1;
    }
    return o;
  };

  MP.Weather = Weather;
})(window.MP = window.MP || {});
