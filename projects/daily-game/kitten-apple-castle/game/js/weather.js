/* Ziggy's Apple Castle — AC.Weather: ambient particles per time of day + world-space bursts (DESIGN §5.2)
 *
 *   var wx = new AC.Weather({ width: 960, height: 540, seed: 1 });
 *   wx.setLevel(zone, { instant: true });
 *   wx.update(dt, camY);                                   // camY = world.cam.y (≤ 0 as the tower rises)
 *   wx.burst('sparkle', x, y, 12, { speed, life, size, gravity, spread, up, spin, layer, drag, angle, glow });  // WORLD coords
 *   draw wx.particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', world?, glow}
 *     world === true → draw at (x, y − camY); otherwise x,y are SCREEN coords
 *     glow === true  → draw ABOVE the darkness layer (fireflies, wisps, night twinkles, the shooting star)
 *   wx.ambient {tint (css rgba or null)}
 *
 * Zones (MECHANICS §5):
 *   0 dawn   — soft mist puffs drifting in the back + pink blossom petals falling like little pendulums
 *   1 noon   — autumn leaves tumbling (spin + flutter, falling slower when broadside) + short sparkle glints
 *   2 sunset — cute bats (bat_0 wings up / bat_1 wings down) on sinusoidal flight paths + some leaves
 *   3 night  — fireflies wandering on smooth noise and blinking, twinkling sparkles, a shooting star every
 *              6–10 s, and now and then a friendly wisp drifting up in the back
 * Ambient particles drift with a little parallax when the camera moves. Front-layer ambient particles never
 * sit in the tower column (x within cx ± 1.6·unit): inside it they are drawn on the back layer. Total < 140.
 * Sprites face RIGHT; flipX = true means mirrored (bats flying left).
 */
(function (AC) {
  'use strict';
  var M = Math, TAU = 2 * M.PI;

  var CAP = 139;              // hard cap on particles (DESIGN: < 140)
  var MAX_TRAIL = 18;         // shooting-star trail pieces
  var MAX_GLINT = 4;          // noon sparkle glints alive at once
  var MAX_WISP = 3;           // night wisps alive at once
  var COLUMN = 1.6;           // unit  half-width of the calm tower column for front particles
  var PARALLAX = 0.35;        // ×     ambient particles shift by this share of the camera motion (× depth)

  // per zone: ambient counts at 960×540 (scaled gently with screen area), tint, timed effects
  var ZONES = [
    { key: 'dawn',   mist: 8, petal: 32, tint: 'rgba(255,170,190,0.06)' },
    { key: 'noon',   leaf: 30, glint: true, tint: 'rgba(255,240,200,0.04)' },
    { key: 'sunset', bat: 9, leaf: 12, tint: 'rgba(255,120,80,0.07)' },
    { key: 'night',  firefly: 24, twinkle: 18, wisp: true, shoot: true, tint: 'rgba(70,80,170,0.07)' }
  ];
  var KINDS = ['mist', 'petal', 'leaf', 'bat', 'firefly', 'twinkle'];
  var TIMED = { burst: 1, trail: 1, shoot: 1, glint: 1, wisp: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // one constructor → one hidden class → fast update loop
  function Particle(o) {
    this.kind = o.kind; this.sprite = o.sprite; this.pref = o.layer || 'back'; this.layer = this.pref;
    this.world = !!o.world; this.glow = !!o.glow;
    this.x = o.x; this.y = o.y; this.bx = o.x; this.by = o.y;           // bx,by: the drifting base point
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.size = o.size || 8; this.rot = o.rot || 0; this.spin = o.spin || 0; this.flipX = !!o.flipX;
    this.base = o.base === undefined ? 1 : o.base; this.alpha = 0;
    this.ph = o.ph || 0; this.w = o.w || 0; this.A = o.A || 0; this.B = o.B || 0; this.tilt = o.tilt || 0;
    this.ph2 = o.ph2 || 0; this.w2 = o.w2 || 0; this.tw = o.tw || 0; this.flap = 0;
    this.g = o.g || 0; this.drag = o.drag || 0; this.depth = o.depth === undefined ? 1 : o.depth;
    this.life = o.life || 0; this.age = 0; this.dying = false; this.fade = 1;
    this.fadeIn = o.fadeIn === undefined ? 0.8 : o.fadeIn;
  }

  function Weather(opts) {
    opts = opts || {};
    this.rng = new AC.RNG(opts.seed === undefined ? 7 : opts.seed);
    this.particles = [];
    this.zone = 0;
    this.time = 0;
    this.ambient = { tint: null };
    this._camY = null;
    this._shootT = 3; this._shot = null;
    this._glintT = 0.5; this._wispT = 2;
    this.resize(opts.width || 960, opts.height || 540, true);
    this.setLevel(0, { instant: true });
  }

  Weather.prototype.resize = function (w, h, quiet) {
    this.width = w; this.height = h;
    var L = AC.World && AC.World.computeLayout ? AC.World.computeLayout(w, h) : { unit: M.min(w / 9.6, h / 5.4), cx: w / 2 };
    this.unit = L.unit; this.cx = L.cx;
    this.colHalf = COLUMN * L.unit;
    this.areaK = clamp(M.sqrt((w * h) / (960 * 540)), 0.85, 1.35);
    if (quiet) return;
    // re-scatter ambient particles into the new screen (bursts are world-space: keep them)
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (TIMED[p.kind]) continue;
      p.bx = p.x = this.rng.range(0, w); p.by = p.y = this.rng.range(0, h);
      if (p.kind === 'bat' || p.kind === 'firefly') this._home(p);
    }
    this._fill(false);
  };

  Weather.prototype.setLevel = function (zone, opts) {
    this.zone = ((zone | 0) % 4 + 4) % 4;
    var Z = ZONES[this.zone], instant = opts && opts.instant;
    this.ambient.tint = Z.tint;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      if (p.kind === 'burst') continue;
      if (instant) this.particles.splice(i, 1); else p.dying = true;
    }
    this._shot = null;
    this._shootT = this.rng.range(2.5, 5);
    this._glintT = this.rng.range(0.3, 1); this._wispT = this.rng.range(1, 3);
    this._fill(!!instant);
  };

  Weather.prototype._want = function (kind) { return M.round((ZONES[this.zone][kind] || 0) * this.areaK); };
  Weather.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.kind === kind && !p.dying) n++; }
    return n;
  };
  Weather.prototype._room = function () { return this.particles.length < CAP - MAX_TRAIL - MAX_GLINT - MAX_WISP - 2; };
  Weather.prototype._fill = function (instant) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this._room(); i++) this._spawn(kind, true, instant);
    }
  };

  /** A spawn x for a front particle: anywhere but the tower column (null when there is no room). */
  Weather.prototype._sideX = function () {
    var a = this.cx - this.colHalf, b = this.width - (this.cx + this.colHalf);
    if (a + b < 8) return null;
    var r = this.rng.range(0, a + b);
    return r < a ? r : this.cx + this.colHalf + (r - a);
  };
  /** bats/fireflies keep a home height band; fireflies also a home x they wander around */
  Weather.prototype._home = function (p) {
    var H = this.height, r = this.rng;
    if (p.kind === 'bat') p.by = r.range(0.1, p.pref === 'front' ? 0.45 : 0.55) * H;
    else { p.hx = p.bx; p.hy = r.range(0.25, 0.88) * H; p.by = p.hy; }
  };

  Weather.prototype._spawn = function (kind, anywhere, instant) {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100, o;
    var front = kind !== 'mist' && kind !== 'twinkle' && r.chance(kind === 'bat' ? 0.25 : 0.35);
    var x = r.range(0, W), y = anywhere ? r.range(0, H) : 0;
    if (front) { var sx = this._sideX(); if (sx === null) front = false; else x = sx; }
    switch (kind) {
      case 'mist':      // big soft blobs drifting slowly sideways, low over the garden (back layer only)
        y = r.range(0.42, 0.92) * H;
        if (!anywhere) x = -90 * u;
        o = { sprite: 'mist', size: r.range(110, 200) * u, vx: r.range(4, 11) * u, A: r.range(3, 7) * u, w: r.range(0.15, 0.3),
          ph: r.range(0, TAU), base: r.range(0.16, 0.32), depth: 0.35, fadeIn: 2.5 };
        break;
      case 'petal':     // blossom petal: a little pendulum — sways ±A, rises B at the ends of each swing, tilts with its motion
        if (!anywhere) y = -14 * u;
        o = { sprite: 'petal', size: r.range(9, 16) * u, vx: r.range(4, 14) * u, vy: r.range(20, 34) * u,
          A: r.range(14, 30) * u, w: r.range(1.3, 2.1), ph: r.range(0, TAU), tilt: r.range(0.45, 0.75),
          base: r.range(0.55, 0.9), flipX: r.chance(0.5), depth: front ? 1 : 0.6 };
        o.B = o.A * 0.28;
        break;
      case 'leaf':      // autumn leaf: tumbles (spin), flutters sideways, falls slower when broadside to the air
        if (!anywhere) y = -16 * u;
        o = { sprite: 'leaf', size: r.range(11, 19) * u, vx: r.range(8, 22) * u, vy: r.range(34, 52) * u,
          A: r.range(10, 22) * u, w: r.range(1.6, 2.6), ph: r.range(0, TAU), rot: r.range(0, TAU),
          spin: (r.chance(0.5) ? 1 : -1) * r.range(1.6, 3.4), base: r.range(0.6, 0.95), flipX: r.chance(0.5), depth: front ? 1 : 0.6 };
        break;
      case 'bat':       // bat: crosses the sky on a sine path; flaps hard when climbing, glides when dipping
        var dir = r.chance(0.5) ? 1 : -1;
        if (!anywhere) x = dir > 0 ? -30 * u : W + 30 * u;
        o = { sprite: 'bat_0', size: r.range(26, 38) * u * (front ? 1.15 : 0.8), vx: dir * r.range(45, 80) * u,
          A: r.range(16, 34) * u, w: r.range(1.1, 1.9), ph: r.range(0, TAU), base: front ? 0.95 : 0.7, flipX: dir < 0, depth: front ? 0.9 : 0.4 };
        break;
      case 'firefly':   // wanders on smooth noise (two incommensurate sines per axis) around a home point, blinks
        o = { sprite: 'firefly', size: r.range(10, 17) * u, A: r.range(18, 34) * u, w: r.range(0.35, 0.7), ph: r.range(0, TAU),
          w2: r.range(0.9, 1.5), ph2: r.range(0, TAU), tw: r.range(0.3, 0.65), B: r.range(0, 1),
          base: r.range(0.7, 1), glow: true, depth: front ? 0.9 : 0.5 };
        break;
      case 'twinkle':   // fixed, softly twinkling sky sparkles (upper sky; never in the column)
        y = r.range(0, H * 0.5);
        if (M.abs(x - this.cx) < this.colHalf * 0.94) x = r.chance(0.5) ? r.range(0, this.cx - this.colHalf) : r.range(this.cx + this.colHalf, W);
        o = { sprite: 'sparkle', size: r.range(5, 11) * u, tw: r.range(1.2, 3.2), ph: r.range(0, TAU), base: r.range(0.35, 0.85), glow: true, depth: 0.1 };
        break;
    }
    o.kind = kind; o.x = x; o.y = y; o.layer = front ? 'front' : 'back';
    if (instant) o.fadeIn = 0.001;
    var p = new Particle(o);
    if (kind === 'bat' || kind === 'firefly') this._home(p);
    this._pose(p);
    p.layer = (p.pref === 'front' && M.abs(p.x - this.cx) >= this.colHalf) ? 'front' : 'back';
    this.particles.push(p);
    return p;
  };

  /** World-space burst at (x, y). opts: {speed, life, size, gravity, spread, up, spin, layer, drag, angle, glow}. */
  Weather.prototype.burst = function (sprite, x, y, n, opts) {
    opts = opts || {};
    var r = this.rng, u = this.unit / 100;
    var reserve = 0;                                   // bursts never starve the ambient set (or the timed effects)
    for (var k = 0; k < KINDS.length; k++) reserve += M.max(0, this._want(KINDS[k]) - this._count(KINDS[k]));
    var room = M.max(0, CAP - MAX_TRAIL - MAX_GLINT - MAX_WISP - 2 - reserve - this.particles.length);
    n = M.min(n | 0, room);
    var speed = (opts.speed === undefined ? 160 : opts.speed) * u, life = opts.life === undefined ? 0.8 : opts.life;
    var size = (opts.size === undefined ? 14 : opts.size) * u, gr = (opts.gravity === undefined ? 300 : opts.gravity) * u;
    var spread = opts.spread === undefined ? TAU : opts.spread, up = opts.up ? 1 : 0;
    var spin = opts.spin === undefined ? 3 : opts.spin;
    for (var i = 0; i < n; i++) {
      var a = up ? -M.PI / 2 + r.range(-spread / 2, spread / 2) * (opts.spread === undefined ? 0.5 : 1) : r.range(-spread / 2, spread / 2) + (opts.angle || 0);
      var v = speed * r.range(0.45, 1);
      this.particles.push(new Particle({ kind: 'burst', sprite: sprite, world: true, layer: opts.layer || 'front', glow: !!opts.glow,
        x: x + r.range(-4, 4) * u, y: y + r.range(-4, 4) * u, vx: M.cos(a) * v, vy: M.sin(a) * v,
        size: size * r.range(0.7, 1.25), rot: r.range(0, TAU), spin: r.range(-spin, spin), flipX: r.chance(0.5),
        g: gr, drag: opts.drag === undefined ? 1.6 : opts.drag, life: life * r.range(0.75, 1.15), base: 1, fadeIn: 0.001 }));
    }
    return n;
  };

  Weather.prototype._shoot = function () {
    var r = this.rng, W = this.width, H = this.height, u = this.unit / 100;
    var fromLeft = r.chance(0.5), sp = r.range(620, 820) * u;
    var a = r.range(0.32, 0.55);
    var p = new Particle({ kind: 'shoot', sprite: 'star', layer: 'back', glow: true, x: fromLeft ? -20 : W + 20, y: r.range(0.04, 0.3) * H,
      vx: (fromLeft ? 1 : -1) * M.cos(a) * sp, vy: M.sin(a) * sp, size: 16 * u, base: 1, fadeIn: 0.05, life: 2.2, spin: 5, depth: 0 });
    this.particles.push(p);
    this._shot = p;
  };
  Weather.prototype._glint = function () {          // noon: a quick sparkle glint off a window / dew (never in the column)
    var r = this.rng, u = this.unit / 100, x = this._sideX();
    if (x === null) x = r.range(0, this.width);
    this.particles.push(new Particle({ kind: 'glint', sprite: 'sparkle', layer: 'back', x: x, y: r.range(0.08, 0.7) * this.height,
      size: r.range(10, 18) * u, life: r.range(0.5, 0.8), base: r.range(0.7, 1), spin: r.range(-2, 2), fadeIn: 0.001, depth: 0.2 }));
  };
  Weather.prototype._wisp = function () {           // night: a tiny friendly wisp drifts up in the back, swaying
    var r = this.rng, u = this.unit / 100;
    var x = r.chance(0.5) ? r.range(0.05, 0.3) * this.width : r.range(0.7, 0.95) * this.width;
    this.particles.push(new Particle({ kind: 'wisp', sprite: 'wisp', layer: 'back', glow: true, x: x, y: this.height * r.range(0.75, 0.95),
      vy: -r.range(14, 24) * u, A: r.range(10, 18) * u, w: r.range(0.9, 1.4), ph: r.range(0, TAU),
      size: r.range(20, 28) * u, life: r.range(6, 9), base: r.range(0.55, 0.8), flipX: r.chance(0.5), fadeIn: 0.001, depth: 0.4 }));
  };

  /** Drawn position/rotation from the base point and the particle's own oscillator (pure motion models). */
  Weather.prototype._pose = function (p) {
    var s, c;
    switch (p.kind) {
      case 'petal':
        // pendulum: x = A sin φ, lifted B·sin²φ at the swing ends; tilt ∝ sideways velocity (A ω cos φ)
        s = M.sin(p.ph); c = M.cos(p.ph);
        p.x = p.bx + p.A * s; p.y = p.by - p.B * s * s;
        p.rot = p.tilt * c;
        break;
      case 'leaf':
        // flutter rides on the tumble: the side push is strongest when the leaf is broadside (|sin rot| small = flat)
        p.x = p.bx + p.A * M.sin(p.ph); p.y = p.by;
        break;
      case 'bat':
        p.x = p.bx; p.y = p.by + p.A * M.sin(p.ph);
        break;
      case 'firefly':
        p.x = p.bx; p.y = p.by;
        break;
      case 'mist':
        p.x = p.bx; p.y = p.by + p.A * M.sin(p.ph);
        break;
      case 'wisp':
        p.x = p.bx + p.A * M.sin(p.ph); p.y = p.by;
        p.rot = 0.18 * M.cos(p.ph);
        break;
      default:
        p.x = p.bx; p.y = p.by;
    }
  };

  Weather.prototype.update = function (dt, camY) {
    if (!(dt > 0)) return;
    dt = M.min(dt, 0.1);
    this.time += dt;
    var u = this.unit / 100, W = this.width, H = this.height, Z = ZONES[this.zone];
    var cam = typeof camY === 'number' ? camY : 0;
    var dCam = this._camY === null ? 0 : cam - this._camY;     // camera moved up (dCam < 0) → particles shift down
    this._camY = cam;
    if (M.abs(dCam) > H) dCam = 0;                               // level change snap: no streak
    var i, p, counts = { trail: 0, glint: 0, wisp: 0 };
    for (i = 0; i < this.particles.length; i++) { p = this.particles[i]; if (counts[p.kind] !== undefined && !p.dying) counts[p.kind]++; }
    // timed effects
    if (Z.shoot) {
      this._shootT -= dt;
      if (this._shootT <= 0 && !this._shot) { this._shoot(); this._shootT = this.rng.range(6, 10); }
    }
    if (Z.glint && (this._glintT -= dt) <= 0) {
      this._glintT = this.rng.range(0.4, 1.3);
      if (counts.glint < MAX_GLINT && this.particles.length < CAP - MAX_TRAIL) { this._glint(); counts.glint++; }
    }
    if (Z.wisp && (this._wispT -= dt) <= 0) {
      this._wispT = this.rng.range(3, 6);
      if (counts.wisp < MAX_WISP && this.particles.length < CAP - MAX_TRAIL) { this._wisp(); counts.wisp++; }
    }
    var trails = counts.trail;

    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.age += dt;
      var kill = false, a = p.base, lf;
      switch (p.kind) {
        case 'burst': {
          var k = M.exp(-p.drag * dt);
          p.vx *= k; p.vy = p.vy * k + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          lf = p.age / p.life;
          p.alpha = clamp(lf < 0.7 ? 1 : 1 - (lf - 0.7) / 0.3, 0, 1);
          p.layer = p.pref;
          if (lf >= 1) kill = true;
          break;
        }
        case 'trail':
          p.alpha = clamp(p.base * (1 - p.age / p.life), 0, 1);
          p.size *= M.exp(-1.5 * dt);
          if (p.age >= p.life) kill = true;
          break;
        case 'shoot':
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          p.alpha = clamp(p.age / 0.05, 0, 1) * (p.age > p.life - 0.3 ? (p.life - p.age) / 0.3 : 1);
          if (trails < MAX_TRAIL && this.particles.length < CAP) {
            var t = new Particle({ kind: 'trail', sprite: 'sparkle', layer: 'back', glow: true, x: p.x - p.vx * 0.012, y: p.y - p.vy * 0.012,
              size: p.size * 0.7, base: 0.8 * p.alpha, life: 0.35, fadeIn: 0.001 });
            t.alpha = t.base; this.particles.push(t); trails++;
          }
          if (p.age >= p.life || p.x < -60 || p.x > W + 60 || p.y > H + 60) { kill = true; if (this._shot === p) this._shot = null; }
          break;
        case 'glint':      // pops in, peaks, fades (sin envelope), spins a little
          lf = p.age / p.life;
          p.rot += p.spin * dt;
          p.alpha = clamp(p.base * M.sin(M.PI * clamp(lf, 0, 1)), 0, 1);
          if (p.dying) p.alpha *= clamp(p.fade -= dt / 0.9, 0, 1);
          p.y -= dCam * PARALLAX * p.depth;
          if (lf >= 1 || p.fade <= 0) kill = true;
          break;
        case 'wisp':       // rises with a lazy sway; fades in over 1 s and out over the last 1.5 s
          p.by += p.vy * dt - dCam * PARALLAX * p.depth;
          p.ph += p.w * dt;
          this._pose(p);
          lf = p.life - p.age;
          p.alpha = clamp(p.base * M.min(1, p.age / 1) * M.min(1, lf / 1.5), 0, 1);
          if (p.dying) p.alpha *= clamp(p.fade -= dt / 0.9, 0, 1);
          if (lf <= 0 || p.fade <= 0) kill = true;
          break;
        default:
          kill = this._ambient(p, dt, dCam);
          break;
      }
      if (kill) this.particles.splice(i, 1);
    }
    if (this.particles.length > CAP) this.particles.splice(0, this.particles.length - CAP);
    // keep the ambient counts topped up (new ones enter from the edge)
    if (!this._fillT || (this._fillT -= dt) <= 0) { this._fillT = 0.25; this._topUp(); }
  };

  /** One ambient particle (screen space). Returns true when it should be removed. */
  Weather.prototype._ambient = function (p, dt, dCam) {
    var u = this.unit / 100, W = this.width, H = this.height, a = p.base, s;
    p.by -= dCam * PARALLAX * p.depth;
    switch (p.kind) {
      case 'mist':
        p.bx += p.vx * dt; p.ph += p.w * dt;
        break;
      case 'petal':
        // the swing phase advances at ω; the sink is slowest at the swing ends (it "catches air") and fastest mid-swing
        p.ph += p.w * dt; s = M.cos(p.ph);
        p.bx += p.vx * dt;
        p.by += p.vy * (0.55 + 0.75 * s * s) * dt;
        break;
      case 'leaf': {
        // tumbling: spin rate wobbles a little; sink depends on how broadside the leaf is (|cos rot| = flat → slow)
        p.rot += p.spin * (0.85 + 0.3 * M.sin(p.ph * 0.5)) * dt;
        var flat = M.abs(M.cos(p.rot));
        p.ph += p.w * dt;
        p.bx += (p.vx + 18 * u * flat * M.sin(p.rot)) * dt;
        p.by += p.vy * (1.25 - 0.6 * flat) * dt;
        break;
      }
      case 'bat': {
        p.ph += p.w * dt;
        p.bx += p.vx * dt;
        // vertical velocity of the sine path decides the wingbeat: climbing → fast flaps, dipping → glide (wings up)
        var vy = p.A * p.w * M.cos(p.ph);
        var rate = vy < 0 ? 7 + 9 * M.min(1, -vy / (40 * u)) : 2.5 * M.max(0, 1 - vy / (30 * u));
        p.flap += rate * dt;
        p.sprite = (M.floor(p.flap) % 2) ? 'bat_1' : 'bat_0';
        p.rot = clamp(M.atan2(vy, M.abs(p.vx)) * 0.5, -0.35, 0.35) * (p.vx < 0 ? -1 : 1);
        break;
      }
      case 'firefly': {
        // smooth wander: velocity = sum of two sines per axis + a weak spring to home (stays in its patch of garden)
        p.ph += p.w * dt; p.ph2 += p.w2 * dt;
        var vxw = p.A * (M.sin(p.ph) + 0.6 * M.sin(p.ph2 * 1.31 + 1.7));
        var vyw = p.A * 0.7 * (M.cos(p.ph * 0.83 + 0.4) + 0.6 * M.sin(p.ph2));
        p.bx += (vxw + (p.hx - p.bx) * 0.15) * dt;
        p.by += (vyw + (p.hy - p.by) * 0.15) * dt;
        p.hy -= dCam * PARALLAX * p.depth;
        // blink: a smooth pulse each cycle (on ≈45 % of the time), never fully dark
        p.B = (p.B + p.tw * dt) % 1;
        var on = p.B < 0.45 ? M.sin(M.PI * p.B / 0.45) : 0;
        a = p.base * (0.12 + 0.88 * on * on);
        p.flipX = vxw < 0;
        break;
      }
      case 'twinkle':
        a = p.base * (0.45 + 0.55 * (0.5 + 0.5 * M.sin(this.time * p.tw + p.ph)));
        break;
    }
    // fade in / dying fade out
    var fin = clamp(p.age / p.fadeIn, 0, 1);
    if (p.dying) { p.fade -= dt / 0.9; if (p.fade <= 0) return true; }
    p.alpha = clamp(a * fin * clamp(p.fade, 0, 1), 0, 1);
    // wrap around the screen (re-enter on the far side)
    var m = 24 * u + p.size;
    if (p.kind === 'bat') {
      if ((p.vx > 0 && p.bx > W + m) || (p.vx < 0 && p.bx < -m)) {
        p.bx = p.vx > 0 ? -m : W + m; this._home(p); p.ph = this.rng.range(0, TAU);   // a new pass at a new height
      }
    } else if (p.kind === 'firefly') {
      if (p.bx < -m) { p.bx = W + m; p.hx = W - m; } else if (p.bx > W + m) { p.bx = -m; p.hx = m; }
      if (p.by > H + m || p.by < -m) { p.by = p.hy = this.rng.range(0.3, 0.85) * H; }
    } else {
      if (p.bx > W + m) p.bx = -m; else if (p.bx < -m) p.bx = W + m;
      if (p.by > H + m) { p.by = -m; if (p.kind === 'twinkle') p.by = this.rng.range(0, H * 0.4); }
      else if (p.by < -m) p.by = H + m;
    }
    this._pose(p);
    // front layer stays out of the tower column
    p.layer = (p.pref === 'front' && M.abs(p.x - this.cx) >= this.colHalf) ? 'front' : 'back';
    return false;
  };

  Weather.prototype._topUp = function () {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k], need = this._want(kind) - this._count(kind);
      for (var i = 0; i < need && this._room(); i++) this._spawn(kind, kind === 'twinkle' || kind === 'firefly', false);
    }
  };

  AC.Weather = Weather;
})(window.AC = window.AC || {});
