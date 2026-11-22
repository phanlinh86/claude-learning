/* Otto's Playroom Dash — OD.World: the headless, deterministic game simulation (DESIGN §5.1)
 *
 *   var w = new OD.World({ seed: 1, difficulty: 'normal', level: 0 });
 *   w.move(-1); w.jump();                 // input
 *   w.update(dt);                         // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction
 *   w.drainEvents();                      // [{type:'acorn', …}, {type:'gravity', …}, …]
 *
 * World units ("u"): 1 u = one lane width, seconds, y grows UP from the road. Lanes x = −1, 0, +1.
 * s = distance along the track, dist = how far Otto has run, z = s − dist (Otto at z = 0).
 * No pixels in here: the renderer projects (x, y, z). Every moving thing keeps prev* values (saved at the
 * start of each sub-step) so the renderer can lerp with `alpha`.
 *
 * THE TWIST — gravity per biome: zones[z].gk = 1.0 / 0.7 / 1.25 / 0.5. world.gk eases (smoothstep, gravEase s)
 * to gTarget after a level change; world.g = g·gk, world.jumpV = jumpV·gk^jumpVexp. A jump keeps the gravity it
 * took off with (hero.jg / hero.jv), so an ease never jolts a jump in flight. Below gk 1 the apex gets a little
 * "hang" (g reduced by up to `hang` while |vy| < hangV). Balls bounce under the same g; acorn arcs are generated
 * from the exact jump path at the row's gravity; row gaps grow with airtime.
 *
 * CONFIG (units → why):
 *   step 1/120 s ............ fixed sub-step: the lane spring (ω·dt = 0.22) and the jump are exact & stable
 *   stride 1.1 u ............ one full 4-frame leg cycle (hero.run += speed·dt/stride) — feet don't skate
 *   laneOmega 26 rad/s, laneZeta 0.85 … spring toward the target lane: 1 lane in ≈ 0.15 s, overshoot < 0.001 u
 *   queueAt 0.35 u .......... a move while |x − lane| > this is queued (one slot) → quick double swipes work
 *   tiltMax 0.3 rad, tiltRate 18 /s … lean = clamp(vx/8, −1, 1)·0.3, eased so it never snaps
 *   jumpV 6.2 u/s, g 19 u/s² . at gk 1: apex v²/2g = 1.01 u (clears blocks 0.42 u), airtime 2v/g = 0.65 s
 *   jumpVexp 0.35 ........... take-off speed ∝ gk^0.35 → apex ∝ gk^−0.3, airtime ∝ gk^−0.65 (+ hang)
 *   hang 0.2, hangV 1 u/s ... apex hang when gk < 1: g·(1 − hang·hk·(1 − (vy/hangV)²)) for |vy| < hangV, hk = clamp((1−gk)/0.3, 0, 1)
 *   gravEase 1.2 s .......... smoothstep ease of gk after a level change
 *   jumpBuffer 0.15 s ....... a jump pressed just before landing still fires (kids press early)
 *   squashDecay 7 /s, stretchDecay 8 /s … renderer squash/stretch envelopes (0..1)
 *   accel 2.6 /s ............ speed eases toward its target (stumble slow-down reads in ≈ 0.3 s)
 *   chapterRamp 0.08 ........ +8 % speed by the end of a biome; zoneSpeedK 0.06 per biome, loopSpeedK 0.1 per loop
 *   stumbleSlow 0.55 ........ speed factor while stumbling (stumble 0.6 s after a bump)
 *   invuln 1.6 s ............ blink time after a bump (long enough to get past the row you hit)
 *   spawnAhead 34 u ......... rows are generated this far ahead (the renderer shows z ≤ 36)
 *   removeBehind −3 u ....... objects behind this are dropped (arrays stay ≈ 20–40 long)
 *   maxSpeed 13 u/s ......... cap for late loops
 *   heroHalfW 0.28 u, heroH 0.7 u, hitZPad 0.25 u … collision box (a high moon ball can pass over Otto)
 *   ballSpeed 1.2–1.8 u/s ... sideways roll (+10 % per biome after 3); ballWake 1.5–3 s (wakes when z < speed·wake)
 *   ballV 3.4 u/s, ballKick 1.6, ballRest 0.78 … bounce: wakes with a big first hop (1.6·ballV), restitution 0.78,
 *                             never below ballV → steady hop ballV²/2g: 0.30 u normal, 0.43 floaty, 0.24 heavy, 0.61 moon;
 *                             first moon hops 1.56 / 0.95 u: Otto can run under them (heroH 0.7)
 *   goal {easy 410, normal 530, hard 640} u … ≈ 60–75 s per biome
 *   difficulty.*: hearts, speed (u/s), react (s: row gap ≥ speed·(react + 0.5·airtime) + 2.5 u)
 *   zones[z]: gk, patterns {name: weight}, gapK (multiplies the minimum row gap; biome 1 is roomy)
 */
(function (OD) {
  'use strict';
  var M = Math;

  var CONFIG = {
    step: 1 / 120,
    stride: 1.1,
    laneOmega: 26, laneZeta: 0.85, queueAt: 0.35,
    tiltMax: 0.3, tiltRate: 18,
    jumpV: 6.2, g: 19, jumpVexp: 0.35, hang: 0.2, hangV: 1.0, gravEase: 1.2, jumpBuffer: 0.15,
    squashDecay: 7, stretchDecay: 8,
    accel: 2.6, chapterRamp: 0.08, zoneSpeedK: 0.06, loopSpeedK: 0.1, stumbleSlow: 0.55,
    stumble: 0.6, invuln: 1.6, ouchT: 0.8, happyT: 1.2,
    spawnAhead: 34, removeBehind: -3, firstRow: 16,
    maxSpeed: 13,
    heroHalfW: 0.28, heroH: 0.7, hitZPad: 0.25,
    acornPoints: 10, comboEvery: 10, levelBonus: 100,
    ballSpeed: [1.2, 1.8], ballWake: [1.5, 3.0], ballV: 3.4, ballKick: 1.6, ballRest: 0.78,
    goal: { easy: 410, normal: 530, hard: 640 },
    difficulty: {
      easy:   { hearts: 5, speed: 5.5, react: 1.1 },
      normal: { hearts: 3, speed: 7.0, react: 0.8 },
      hard:   { hearts: 3, speed: 8.4, react: 0.62 }
    },
    zones: [
      { gk: 1.0,  patterns: { tower1: 5, tower2: 2, acornLine: 3, acornZig: 2 }, gapK: 1.35 },
      { gk: 0.7,  patterns: { tower1: 3, tower2: 2, blocks1: 3, blocks3: 1, acornLine: 2, acornArc: 2, acornZig: 1 }, gapK: 1.15 },
      { gk: 1.25, patterns: { tower1: 3, tower2: 2, blocks1: 2, blocks3: 1, ball: 3, acornLine: 2, acornArc: 2, acornZig: 1 }, gapK: 1.08 },
      { gk: 0.5,  patterns: { tower1: 3, tower2: 3, blocks1: 2, blocks3: 2, ball: 2, acornLine: 2, acornArc: 2, acornZig: 2 }, gapK: 1.0 }
    ],
    // collision sizes: h = top height (ball: 2r, measured from ball.y), w = half-width, d = half-depth (u)
    kinds: {
      tower:  { h: 1.6,  w: 0.34, d: 0.3 },
      blocks: { h: 0.42, w: 0.44, d: 0.18 },
      ball:   { h: 0.62, w: 0.28, d: 0.28, r: 0.31 },
      acorn:  { h: 0.3,  w: 0.22, d: 0.2 }
    },
    acornY: 0.35            // a resting acorn floats at Otto's middle height
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }

  // ------------------------------------------------------------------ jump physics (shared by hero, arcs, tests)
  function jumpVFor(gk) { return CONFIG.jumpV * M.pow(gk, CONFIG.jumpVexp); }
  function hangFor(gk) { return CONFIG.hang * clamp((1 - gk) / 0.3, 0, 1); }
  /** one exact-ish sub-step of a jump: st {y, vy}, g (u/s²), hk (hang 0..hang) */
  function airStep(st, g, hk, dt) {
    var ge = g;
    if (hk > 0 && M.abs(st.vy) < CONFIG.hangV) { var u = st.vy / CONFIG.hangV; ge = g * (1 - hk * (1 - u * u)); }
    st.y += st.vy * dt - 0.5 * ge * dt * dt;
    st.vy -= ge * dt;
  }
  var profiles = {};
  /** the jump path at gravity multiplier gk: {gk, jumpV, g, apex (u), air (s), ys[] per step, step} */
  function jumpProfile(gk) {
    var key = gk.toFixed(4) + '|' + CONFIG.jumpV + '|' + CONFIG.g + '|' + CONFIG.jumpVexp + '|' + CONFIG.hang;
    if (profiles[key]) return profiles[key];
    var dt = CONFIG.step, v = jumpVFor(gk), g = CONFIG.g * gk, hk = hangFor(gk);
    var st = { y: 0, vy: v }, ys = [0], apex = 0, n = 0;
    while (n < 2000) {
      airStep(st, g, hk, dt); n++;
      if (st.y <= 0) { ys.push(0); break; }
      ys.push(st.y); if (st.y > apex) apex = st.y;
    }
    return (profiles[key] = { gk: gk, jumpV: v, g: g, apex: apex, air: n * dt, ys: ys, step: dt });
  }
  /** height of the jump path t s after take-off (linear between sub-steps) */
  function pathY(p, t) {
    var f = t / p.step, i = M.floor(f);
    if (i < 0 || i >= p.ys.length - 1) return 0;
    return p.ys[i] + (p.ys[i + 1] - p.ys[i]) * (f - i);
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.jumpProfile = jumpProfile;
  World.pathY = pathY;

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.opts = opts;
    this.seed = opts.seed === undefined || opts.seed === null ? 1 : opts.seed;
    this.difficulty = C.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.D = C.difficulty[this.difficulty];
    this.rng = new OD.RNG(this.seed);
    this.trackRng = this.rng.fork('track');
    this.fxRng = this.rng.fork('fx');
    this.time = 0; this.phase = 'play'; this.acc = 0; this.alpha = 0;
    this.level = 0; this.zone = 0; this.loop = 0;
    this.dist = 0; this.levelDist = 0;
    this.goal = this._goalFor(0); this.progress = 0; this.endS = this.goal; this.startS = 0;
    this.speed = this.D.speed * 0.45; this.overV = 0;
    this.score = 0; this.acorns = 0;
    this.maxHearts = this.D.hearts; this.hearts = this.maxHearts;
    this.combo = 0; this.maxCombo = 0;
    this.gk = C.zones[0].gk; this.gTarget = this.gk; this.gFrom = this.gk; this.gEaseT = C.gravEase;
    this._applyGravity();
    this.hero = { lane: 0, x: 0, prevX: 0, vx: 0, y: 0, prevY: 0, vy: 0, onGround: true,
      tilt: 0, squash: 0, stretch: 0, mood: 'run', moodT: 0, invuln: 0, stumbleT: 0, run: 0, prevRun: 0,
      queued: 0, buffer: 0, airT: 0, apexY: 0, jg: this.g, jv: this.jumpV, jk: 0 };
    this.objects = [];
    this.events = [];
    this.stats = { acorns: 0, jumps: 0, lanes: 0, bumps: 0, levels: 0, dist: 0, time: 0, maxAir: 0, maxApex: 0 };
    this._id = 0;
    this.rowLog = opts.recordRows ? [] : null;
    this._gen = { nextS: C.firstRow, lastObstS: -1e9, lastLowS: -1e9, lastLowAll: false, lastAcornEnd: -1e9, lastFree: null, variant: 0, lastAir: 0 };
    if (opts.level) { this._setLevel(opts.level | 0, false); this._snapGravity(); }
    this._fill();
  };

  World.prototype._goalFor = function (level) {
    return CONFIG.goal[this.difficulty] * (1 + 0.1 * M.floor(level / 4));
  };
  World.prototype.setLayout = function () { /* no pixels in the world (shared main.js calls this) */ };

  // ------------------------------------------------------------------ gravity
  World.prototype._applyGravity = function () {
    this.g = CONFIG.g * this.gk;
    this.jumpV = jumpVFor(this.gk);
  };
  World.prototype._startGravity = function (to) {
    var from = this.gk;
    this.gFrom = from; this.gTarget = to; this.gEaseT = 0;
    if (M.abs(to - from) > 1e-9) this.events.push({ type: 'gravity', gk: to, from: from, to: to });
    else this.gEaseT = CONFIG.gravEase;
  };
  World.prototype._snapGravity = function () {
    this.gk = this.gFrom = this.gTarget = CONFIG.zones[this.zone].gk; this.gEaseT = CONFIG.gravEase;
    this._applyGravity();
  };
  World.prototype._easeGravity = function (dt) {
    if (this.gEaseT >= CONFIG.gravEase) return;
    this.gEaseT = M.min(CONFIG.gravEase, this.gEaseT + dt);
    this.gk = this.gFrom + (this.gTarget - this.gFrom) * smooth(this.gEaseT / CONFIG.gravEase);
    this._applyGravity();
  };

  // ------------------------------------------------------------------ input
  World.prototype._applyMove = function (dir) {
    var h = this.hero, to = clamp(h.lane + dir, -1, 1);
    if (to === h.lane) return false;
    var from = h.lane;
    h.lane = to; this.stats.lanes++;
    this.events.push({ type: 'lane', from: from, to: to });
    return true;
  };
  /** dir −1 (left) / +1 (right). Queued (one slot) while a lane change is still in progress. */
  World.prototype.move = function (dir) {
    if (this.phase !== 'play') return false;
    dir = sgn(dir); if (!dir) return false;
    var h = this.hero, off = h.lane - h.x;
    if (M.abs(off) > CONFIG.queueAt) {
      if (sgn(off) === -dir) { h.queued = 0; return this._applyMove(dir); }   // a swipe back reverses at once
      h.queued = dir; return true;
    }
    return this._applyMove(dir);
  };
  World.prototype.jump = function () {
    if (this.phase !== 'play') return false;
    var h = this.hero;
    if (h.onGround) { this._doJump(); return true; }
    h.buffer = CONFIG.jumpBuffer; return false;
  };
  World.prototype._doJump = function () {
    var h = this.hero;
    h.jg = this.g; h.jv = this.jumpV; h.jk = hangFor(this.gk);       // the jump keeps its take-off gravity
    h.vy = h.jv; h.onGround = false; h.stretch = 1; h.buffer = 0; h.airT = 0; h.apexY = 0;
    this.stats.jumps++;
    this.events.push({ type: 'jump', gk: this.gk });
  };
  /** test hook: instant lane */
  World.prototype.setLane = function (i) {
    var h = this.hero; i = clamp(M.round(i), -1, 1);
    h.lane = i; h.x = h.prevX = i; h.vx = 0; h.queued = 0;
  };

  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ------------------------------------------------------------------ main loop
  World.prototype.update = function (dt) {
    var C = CONFIG;
    this.acc += M.min(M.max(dt || 0, 0), 0.25);
    while (this.acc >= C.step) { this.acc -= C.step; this._step(C.step); }
    this.alpha = this.acc / C.step;
  };

  World.prototype._speedFor = function (zone, loop, progress) {
    var C = CONFIG;
    return M.min(C.maxSpeed, this.D.speed * (1 + C.zoneSpeedK * zone + C.loopSpeedK * loop) * (1 + C.chapterRamp * progress));
  };
  World.prototype._targetSpeed = function () {
    var v = this._speedFor(this.zone, this.loop, this.progress);
    if (this.hero.stumbleT > 0) v *= CONFIG.stumbleSlow;
    return v;
  };

  World.prototype._step = function (dt) {
    var C = CONFIG, h = this.hero;
    this.time += dt; this.stats.time = this.time;
    h.prevX = h.x; h.prevY = h.y; h.prevRun = h.run;

    this._easeGravity(dt);

    // speed & distance
    if (this.phase === 'play') {
      var tv = this._targetSpeed();
      this.speed += (tv - this.speed) * (1 - M.exp(-C.accel * dt));
    } else {
      this.speed = M.max(0, this.speed - this.overV * dt);
    }
    var ds = this.speed * dt;
    this.dist += ds; this.levelDist += ds; this.stats.dist = this.dist;
    h.run += ds / C.stride;

    // lane spring (semi-implicit Euler, critically-damped-ish)
    var w0 = C.laneOmega, ax = w0 * w0 * (h.lane - h.x) - 2 * C.laneZeta * w0 * h.vx;
    h.vx += ax * dt; h.x += h.vx * dt;
    if (h.queued && M.abs(h.x - h.lane) <= C.queueAt) { var q = h.queued; h.queued = 0; this._applyMove(q); }
    var tt = clamp(h.vx / 8, -1, 1) * C.tiltMax;
    h.tilt += (tt - h.tilt) * (1 - M.exp(-C.tiltRate * dt));

    // jump (per-step parabola with the take-off gravity, apex hang below gk 1; lands exactly on y = 0)
    if (h.buffer > 0) h.buffer = M.max(0, h.buffer - dt);
    if (!h.onGround) {
      h.airT += dt;
      airStep(h, h.jg, h.jk, dt);
      if (h.y <= 0) {
        var vLand = h.vy;
        h.y = 0; h.vy = 0; h.onGround = true;
        h.squash = clamp(-vLand / h.jv, 0.3, 1);
        if (h.airT > this.stats.maxAir) this.stats.maxAir = h.airT;
        if (h.apexY > this.stats.maxApex) this.stats.maxApex = h.apexY;
        this.events.push({ type: 'land', hard: -vLand > 0.8 * h.jv });
        if (h.buffer > 0 && this.phase === 'play') this._doJump();
      } else if (h.y > h.apexY) h.apexY = h.y;
    }
    h.squash *= M.exp(-C.squashDecay * dt); if (h.squash < 1e-3) h.squash = 0;
    h.stretch *= M.exp(-C.stretchDecay * dt); if (h.stretch < 1e-3) h.stretch = 0;
    if (h.invuln > 0) h.invuln = M.max(0, h.invuln - dt);
    if (h.stumbleT > 0) h.stumbleT = M.max(0, h.stumbleT - dt);
    if (h.moodT > 0) h.moodT = M.max(0, h.moodT - dt);
    if (h.moodT <= 0 && this.phase === 'play') h.mood = h.onGround ? 'run' : 'jump';

    this._updateObjects(dt);
    if (this.phase === 'play') this._collide();
    this._fill();

    // biomes
    if (this.phase === 'play' && this.levelDist >= this.goal) this._levelUp();
    this.progress = clamp(this.levelDist / this.goal, 0, 1);
  };

  // ------------------------------------------------------------------ biomes
  World.prototype._setLevel = function (lv, keepObjects) {
    this.level = M.max(0, lv); this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.levelDist = 0; this.goal = this._goalFor(this.level); this.progress = 0;
    this.startS = this.dist; this.endS = this.dist + this.goal;
    if (!keepObjects) {
      // regenerate the track for the new biome (keep what is right in front of Otto)
      var keep = [];
      for (var i = 0; i < this.objects.length; i++) if (this.objects[i].z < 10) keep.push(this.objects[i]);
      this.objects = keep;
      var g = this._gen;
      g.nextS = this.dist + 14; g.lastObstS = M.min(g.lastObstS, this.dist + 10); g.lastFree = null;
      g.lastLowS = M.min(g.lastLowS, this.dist + 10);
      g.lastAcornEnd = M.min(g.lastAcornEnd, this.dist + 10);
    }
  };
  World.prototype._levelUp = function () {
    var C = CONFIG, h = this.hero;
    var bonus = C.levelBonus * (this.zone + 1) * (this.loop + 1);
    this.score += bonus; this.stats.levels++;
    this._setLevel(this.level + 1, true);
    if (this.hearts < this.maxHearts) { this.hearts++; this.events.push({ type: 'heartGain', hearts: this.hearts }); }
    h.mood = 'happy'; h.moodT = C.happyT;
    var to = C.zones[this.zone].gk;
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: bonus, gk: to });
    this._startGravity(to);
  };
  /** jump to biome i (debug / ?level=N). Emits levelUp (bonus 0); gravity snaps (a `gravity` event if it changed). */
  World.prototype.gotoLevel = function (i) {
    var from = this.gk;
    this._setLevel(i | 0, false);
    this._snapGravity();
    this.speed = M.max(this.speed, this._targetSpeed() * 0.8);
    this._fill();
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: 0, gk: this.gk });
    if (M.abs(this.gk - from) > 1e-9) this.events.push({ type: 'gravity', gk: this.gk, from: from, to: this.gk });
  };

  // ------------------------------------------------------------------ objects
  World.prototype._obj = function (kind, x, s, o) {
    var K = CONFIG.kinds[kind];
    var ob = { id: ++this._id, kind: kind, s: s, z: s - this.dist, prevZ: s - this.dist, x: x, prevX: x, y: 0, prevY: 0,
      vx: 0, vy: 0, vs: 0, rot: 0, prevRot: 0, spin: 0, h: K.h, w: K.w, d: K.d, variant: 0, state: 'live', t: 0, squash: 0 };
    if (o) for (var k in o) ob[k] = o[k];
    ob.prevX = ob.x; ob.prevY = ob.y; ob.prevZ = ob.z = ob.s - this.dist;
    this.objects.push(ob);
    return ob;
  };

  /** test hook: add an object `zAhead` u in front of Otto. ball opts: {vx (awake, rolling), y, vy, wake} */
  World.prototype.spawn = function (kind, lane, zAhead, opts) {
    if (!CONFIG.kinds[kind]) throw new Error('unknown kind ' + kind);
    opts = opts || {};
    var o = {}; for (var k in opts) o[k] = opts[k];
    if (kind === 'acorn' && o.y === undefined) o.y = CONFIG.acornY;
    if (kind === 'ball') {
      o.awake = o.vx !== undefined; o.bounces = o.bounces || 0; o.vx = o.vx || 0;
      if (o.wake === undefined) o.wake = 2;
      if (o.awake && o.vy === undefined && !o.y) o.vy = CONFIG.ballV;
    }
    if (kind === 'acorn') o.grp = o.grp || { n: 1, taken: 0 };
    return this._obj(kind, lane === undefined ? 0 : lane, this.dist + (zAhead === undefined ? 10 : zAhead), o);
  };

  World.prototype._knock = function (o) {
    var r = this.fxRng, side = o.x > this.hero.x + 0.02 ? 1 : o.x < this.hero.x - 0.02 ? -1 : r.sign();
    o.vx = side * r.range(2.2, 3.2); o.vy = r.range(2.2, 3.0); o.vs = r.range(1.0, 1.8);
    o.spin = side * r.range(4, 7); o.airborne = true;
  };

  World.prototype._updateObjects = function (dt) {
    var C = CONFIG, g = this.g, objs = this.objects, keep = 0;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      o.prevX = o.x; o.prevY = o.y; o.prevZ = o.z; o.prevRot = o.rot;
      o.t += dt;
      if (o.squash > 0) { o.squash *= M.exp(-6 * dt); if (o.squash < 1e-3) o.squash = 0; }
      switch (o.kind) {
        case 'acorn':
          if (o.state === 'taken') { o.y += 2.2 * dt; if (o.t > 0.35) o.state = 'gone'; }
          else o.rot = 0.18 * M.sin(this.time * 2.4 + o.id);
          break;
        case 'ball':
          if (o.state === 'live') this._rollBall(o, dt);
          break;
        case 'tower':
          if (o.state === 'hit') o.rot = 0.3 * M.exp(-4 * o.t) * M.sin(16 * o.t);   // wobble, passed through
          break;
      }
      if (o.airborne) {                    // knocked aside: a small ballistic hop with bounces and friction
        o.x += o.vx * dt; o.s += o.vs * dt; o.rot += o.spin * dt;
        o.y += o.vy * dt - 0.5 * g * dt * dt; o.vy -= g * dt;
        o.vs *= M.exp(-1.5 * dt);
        if (o.y <= 0) {
          o.y = 0;
          if (o.vy < -1.2) { o.vy = -o.vy * (o.kind === 'ball' ? 0.6 : 0.35); o.vx *= 0.6; o.spin *= 0.5; }
          else { o.vy = 0; o.vx *= M.exp(-6 * dt); o.spin *= M.exp(-6 * dt); }
        }
      }
      o.z = o.s - this.dist;
      if (o.kind === 'acorn' && o.state === 'live' && o.z < -0.6) {
        o.state = 'gone';
        if (o.grp && o.grp.taken > 0 && this.phase === 'play') this.combo = 0;
      }
      if (o.z < C.removeBehind || o.state === 'gone') continue;
      objs[keep++] = o;
    }
    objs.length = keep;
  };

  /** a bouncy ball: waits at the roadside, then rolls across (rot = distance / r) and bounces under the current g */
  World.prototype._rollBall = function (o, dt) {
    var C = CONFIG, K = C.kinds.ball, g = this.g;
    if (!o.awake) {
      if (o.z < this.speed * o.wake) { o.awake = true; o.vy = C.ballV * C.ballKick; o.squash = 0.6; }
      else { o.rot = 0.06 * M.sin(this.time * 3 + o.id); return; }    // rocking at the roadside, waiting
    }
    var x0 = o.x;
    o.x += o.vx * dt;
    o.rot += (o.x - x0) / K.r;            // rolling without slipping: angle = distance / radius
    o.y += o.vy * dt - 0.5 * g * dt * dt; o.vy -= g * dt;
    if (o.y <= 0) {
      var vIn = -o.vy;
      o.y = 0; o.vy = M.max(C.ballRest * vIn, C.ballV);
      o.squash = clamp(vIn / (C.ballV * C.ballKick), 0.3, 1);
      if (o.z < 24) this.events.push({ type: 'ballBounce', o: o, wall: false, z: o.z });
    }
    if (o.bounces < 1 && M.abs(o.x) > 1.45 && sgn(o.x) === sgn(o.vx)) {
      o.vx = -o.vx * 0.9; o.bounces++; o.squash = 1;
      this.events.push({ type: 'ballBounce', o: o, wall: true, z: o.z });
    }
  };

  // ------------------------------------------------------------------ collisions
  World.prototype._collide = function () {
    var C = CONFIG, h = this.hero, objs = this.objects;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.state !== 'live') continue;
      if (M.abs(o.z) >= o.d + C.hitZPad || M.abs(o.x - h.x) >= o.w + C.heroHalfW) continue;
      if (o.kind === 'acorn') {
        if (M.abs(o.y - h.y - C.acornY) < 0.6) this._takeAcorn(o);
        continue;
      }
      if (h.invuln > 0) continue;
      if (h.y < o.y + o.h - 0.05 && (o.kind !== 'ball' || h.y + C.heroH > o.y + 0.05)) this._bump(o);
      if (this.phase !== 'play') return;
    }
  };

  World.prototype._takeAcorn = function (o) {
    var C = CONFIG;
    o.state = 'taken'; o.t = 0;
    if (o.grp) o.grp.taken++;
    this.acorns++; this.stats.acorns++;
    this.score += C.acornPoints;
    this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.events.push({ type: 'acorn', o: o, x: o.x, y: o.y, z: o.z, variant: o.variant, points: C.acornPoints, combo: this.combo });
    if (this.combo % C.comboEvery === 0) this.events.push({ type: 'combo', combo: this.combo });
  };

  World.prototype._bump = function (o) {
    var C = CONFIG, h = this.hero;
    o.state = 'hit'; o.t = 0;
    if (o.kind !== 'tower') this._knock(o);
    this.stats.bumps++;
    h.invuln = C.invuln; h.stumbleT = C.stumble; h.mood = 'ouch'; h.moodT = C.ouchT; h.squash = M.max(h.squash, 0.7);
    this.combo = 0;
    this.hearts = M.max(0, this.hearts - 1);
    this.events.push({ type: 'bump', o: o, kind: o.kind });
    this.events.push({ type: 'heartLost', hearts: this.hearts });
    if (this.hearts <= 0) this._gameOver();
  };

  World.prototype._gameOver = function () {
    this.phase = 'over';
    this.overV = this.speed / 1.0;              // ease to a stop over ~1 s
    this.hero.queued = 0; this.hero.buffer = 0;
    this.hero.mood = 'ouch'; this.hero.moodT = 1e9;
    this.events.push({ type: 'gameOver' });
  };

  // ------------------------------------------------------------------ track generation
  /** which biome will Otto be in when he reaches s? {lv, zone, loop, start (s where that biome starts)} */
  World.prototype._rowInfo = function (s) {
    var lv = this.level, start = this.startS, end = this.endS;
    while (s >= end) { lv++; start = end; end += this._goalFor(lv); }
    return { lv: lv, zone: lv % 4, loop: M.floor(lv / 4), start: start, goal: end - start };
  };

  World.prototype._fill = function () {
    var lim = this.dist + CONFIG.spawnAhead, n = 0;
    while (this._gen.nextS < lim && n++ < 50) this._genRow();
  };

  World.prototype._pickPattern = function (zone, easing) {
    var r = this.trackRng, P = CONFIG.zones[zone].patterns, names = [], ws = [], tot = 0;
    for (var k in P) {
      var w = P[k];
      if (this.difficulty === 'easy') {
        if (k === 'blocks3' && zone < 2) continue;
        if (k === 'tower2') w *= 0.5;
      }
      if (easing && k === 'acornArc') continue;     // the arc shape is only exact once the gravity has settled
      names.push(k); ws.push(w); tot += w;
    }
    var x = r.next() * tot;
    for (var i = 0; i < names.length; i++) { x -= ws[i]; if (x < 0) return names[i]; }
    return names[names.length - 1];
  };

  World.prototype._genRow = function () {
    var C = CONFIG, r = this.trackRng, g = this._gen, D = this.D;
    var S = g.nextS, info = this._rowInfo(S), lv = info.lv, zone = info.zone, loop = info.loop;
    var gk = C.zones[zone].gk, gkPrev = lv > 0 ? C.zones[(lv + 3) % 4].gk : gk;
    var vEst = this._speedFor(zone, loop, 1);                                     // worst case: end of the biome
    // rows near a biome start may meet a jump taken under the old gravity or during the ease
    var easing = S < info.start + vEst * (C.gravEase + 1.5) && S > info.start - vEst * 1.5 && lv !== this._lv0();
    var prof = jumpProfile(gk), air = easing ? M.max(prof.air, jumpProfile(gkPrev).air) : prof.air;
    // a jump over the previous obstacle row may have been taken under that row's (easing) gravity
    var airGap = M.max(air, g.lastAir);
    var minGap = vEst * (D.react + 0.5 * airGap) + 2.5;
    var gap = minGap * C.zones[zone].gapK * r.range(1, 1.3);
    var lowGap = vEst * airGap + 2.0;             // two all-lane low rows: land, then take off again
    var vArc = this._speedFor(zone, loop, clamp((S - info.start) / info.goal, 0, 1));
    var pat = this._pickPattern(zone, easing);
    var variant = g.variant = (g.variant + 1 + r.int(0, 1)) % 3;
    var self = this, items = [], obstS = null, end = S, tall = [], low = [], lowAll = false;
    function acorn(x, s, y) { items.push(['acorn', x, s, { y: y === undefined ? C.acornY : y, variant: variant }]); }
    function lanesExcept(a) { var o = []; for (var l = -1; l <= 1; l++) if (a.indexOf(l) < 0) o.push(l); return o; }

    switch (pat) {
      case 'tower1': case 'tower2': {
        var free;
        if (pat === 'tower1') {
          var L = r.int(-1, 1); tall = [L];
        } else {
          var cands = [-1, 0, 1];
          if (g.lastFree && this.difficulty !== 'hard') {        // keep the free lane within one step of the last one
            cands = cands.filter(function (f) { return g.lastFree.some(function (q) { return M.abs(q - f) <= 1; }); });
          }
          var F = r.pick(cands); tall = lanesExcept([F]);
        }
        free = lanesExcept(tall);
        for (var i = 0; i < tall.length; i++) items.push(['tower', tall[i], S, { variant: r.int(0, 1) }]);
        if (r.chance(pat === 'tower2' ? 0.6 : 0.4)) {           // a little acorn "this way!" lure in a free lane
          var fl = r.pick(free);
          for (var j = -1; j <= 1; j++) acorn(fl, S + j * 1.2);
          end = S + 1.2;
        }
        obstS = S; g.lastFree = free;
        break;
      }
      case 'blocks1': {
        var L1 = r.int(-1, 1); low = [L1];
        items.push(['blocks', L1, S, {}]); obstS = S;
        break;
      }
      case 'blocks3': {
        low = [-1, 0, 1]; lowAll = true;
        for (var l3 = -1; l3 <= 1; l3++) items.push(['blocks', l3, S, {}]);
        if (!easing && r.chance(0.5)) end = this._arc(items, r.int(-1, 1), S, vArc, prof, variant, 4);
        obstS = S;
        break;
      }
      case 'ball': {
        var side = r.sign();
        items.push(['ball', side * 1.9, S, { awake: false, vx: -side * r.range(C.ballSpeed[0], C.ballSpeed[1]) * (1 + 0.1 * M.max(0, zone - 2)),
          bounces: 0, wake: r.range(C.ballWake[0], C.ballWake[1]), variant: 0 }]);
        low = [-1, 0, 1]; obstS = S;
        break;
      }
      case 'acornArc': {
        var La = r.int(-1, 1); low = [La];
        items.push(['blocks', La, S, {}]);
        end = this._arc(items, La, S, vArc, prof, variant, 6);
        obstS = S;
        break;
      }
      case 'acornLine': {
        var n = r.int(5, 8), Ll = r.int(-1, 1);
        for (var a = 0; a < n; a++) acorn(Ll, S + a * 1.2);
        end = S + (n - 1) * 1.2;
        break;
      }
      case 'acornZig': {
        var nz = r.int(6, 8), lane = r.int(-1, 1), dir = lane === 0 ? r.sign() : -lane;
        for (var z = 0; z < nz; z++) {
          acorn(lane, S + z * 1.5);
          if (z % 2 === 1) { if (M.abs(lane + dir) > 1) dir = -dir; lane += dir; }
        }
        end = S + (nz - 1) * 1.5;
        break;
      }
    }

    // spacing rules: obstacle rows ≥ gap apart (gap grows with airtime), two all-lane low rows a full jump apart,
    // an arc's take-off point not inside the previous row, and not right behind an acorn run
    var shift = 0;
    if (obstS !== null) {
      var need = M.max(g.lastObstS + gap, g.lastAcornEnd + 0.6 * minGap);
      if (low.length && g.lastLowAll) need = M.max(need, g.lastLowS + lowGap);
      if (lowAll && low.length) need = M.max(need, g.lastLowS + lowGap);
      for (var it0 = 0; it0 < items.length; it0++) {
        var e0 = items[it0];
        if (e0[3].arcS !== undefined) need = M.max(need, g.lastObstS + 1.5 + (S - e0[3].arcS), g.lastAcornEnd + 1.5 + (S - e0[2]));
      }
      if (obstS < need) shift = need - obstS;
    }
    var grp = { n: 0, taken: 0 };
    for (var it = 0; it < items.length; it++) {
      var e = items[it];
      if (e[0] === 'acorn') { grp.n++; e[3].grp = grp; if (e[3].arcS !== undefined) e[3].arcS += shift; }
      self._obj(e[0], e[1], e[2] + shift, e[3]);
    }
    end += shift;
    if (obstS !== null) {
      g.lastObstS = obstS + shift; g.lastAir = air;
      if (low.length) { g.lastLowS = obstS + shift; g.lastLowAll = lowAll; }
      else g.lastLowAll = false;
    }
    if (grp.n > 0) g.lastAcornEnd = M.max(g.lastAcornEnd, end);
    g.nextS = (obstS !== null ? M.max(end, obstS + shift) : end) + r.range(2.5, 4.5);
    if (this.rowLog) this.rowLog.push({ s: S + shift, obstS: obstS === null ? null : obstS + shift, pattern: pat, zone: zone,
      level: lv, gk: gk, gkPrev: gkPrev, easing: easing, air: air, airGap: airGap, tall: tall.slice(), low: low.slice(), lowAll: lowAll,
      minGap: minGap, lowGap: lowGap, vEst: vEst, end: end, diff: this.difficulty });
  };
  World.prototype._lv0 = function () { return this.opts && this.opts.level ? this.opts.level | 0 : 0; };

  /** n acorns along Otto's jump path at gravity prof.gk with the apex over s = S (one jump grabs them all).
   *  Each arc acorn carries arcS = the take-off point. Returns the s of the last acorn. */
  World.prototype._arc = function (items, lane, S, v, prof, variant, n) {
    var C = CONFIG, T = prof.air, s0 = S - v * T / 2, last = S;
    for (var i = 0; i < n; i++) {
      var t = T * (i + 0.5) / n, y = pathY(prof, t);
      last = s0 + v * t;
      items.push(['acorn', lane, last, { y: y + C.acornY, variant: variant, arc: true, arcS: s0 }]);
    }
    return last;
  };

  // ------------------------------------------------------------------ summary for tests / debug
  World.prototype.getState = function () {
    var h = this.hero, counts = {};
    for (var i = 0; i < this.objects.length; i++) { var k = this.objects[i].kind; counts[k] = (counts[k] || 0) + 1; }
    var st = {}; for (var s in this.stats) st[s] = this.stats[s];
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop, dist: this.dist,
      levelDist: this.levelDist, goal: this.goal, progress: this.progress, endS: this.endS, speed: this.speed, score: this.score,
      acorns: this.acorns, hearts: this.hearts, maxHearts: this.maxHearts, difficulty: this.difficulty,
      combo: this.combo, maxCombo: this.maxCombo, gk: this.gk, gTarget: this.gTarget, g: this.g, jumpV: this.jumpV,
      hero: { lane: h.lane, x: h.x, y: h.y, vx: h.vx, vy: h.vy, onGround: h.onGround, tilt: h.tilt, squash: h.squash,
        stretch: h.stretch, mood: h.mood, invuln: h.invuln, stumbleT: h.stumbleT, run: h.run, airT: h.airT },
      objects: this.objects.length, counts: counts, stats: st
    };
  };

  OD.World = World;
})(window.OD = window.OD || {});
