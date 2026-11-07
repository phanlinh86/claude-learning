/* Pebble's Oasis Run — PO.World: the headless, deterministic game simulation (DESIGN §5.1)
 *
 *   var w = new PO.World({ seed: 1, difficulty: 'normal', level: 0 });
 *   w.move(-1); w.jump();                 // input
 *   w.update(dt);                         // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction
 *   w.drainEvents();                      // [{type:'shell', …}, …]
 *
 * World units ("u"): 1 u = one lane width, seconds, y grows UP from the path. Lanes x = −1, 0, +1.
 * s = distance along the track, dist = how far Pebble has run, z = s − dist (Pebble at z = 0).
 * No pixels in here: the renderer projects (x, y, z). Every moving thing keeps prev* values (saved at the
 * start of each sub-step) so the renderer can lerp with `alpha`.
 *
 * CONFIG (units → why):
 *   step 1/120 s ............ fixed sub-step: the lane spring (ω·dt = 0.22) and the jump are exact & stable
 *   stride 1.1 u ............ one full 4-frame leg cycle (hero.run += speed·dt/stride) — feet don't skate
 *   laneOmega 26 rad/s, laneZeta 0.85 … spring toward the target lane: 1 lane in ≈ 0.15 s, overshoot < 0.001 u
 *   queueAt 0.35 u .......... a move while |x − lane| > this is queued (one slot) → quick double swipes work
 *   tiltMax 0.3 rad, tiltRate 18 /s … lean = clamp(vx/8, −1, 1)·0.3, eased so it never snaps
 *   jumpV 6.2 u/s, g 19 u/s² . apex v²/2g = 1.01 u (clears logs 0.42 u), airtime 2v/g = 0.65 s — a "boing", not a float
 *   jumpBuffer 0.15 s ....... a jump pressed just before landing still fires (kids press early)
 *   squashDecay 7 /s, stretchDecay 8 /s … renderer squash/stretch envelopes (0..1)
 *   accel 2.6 /s ............ speed eases toward its target (stumble slow-down reads in ≈ 0.3 s)
 *   chapterRamp 0.08 ........ +8 % speed by the end of a chapter; zoneSpeedK 0.06 per chapter, loopSpeedK 0.1 per loop
 *   stumbleSlow 0.55 ........ speed factor while stumbling (stumble 0.6 s after a bump)
 *   invuln 1.6 s ............ blink time after a bump (long enough to get past the row you hit)
 *   spawnAhead 34 u ......... rows are generated this far ahead (the renderer shows z ≤ 36)
 *   removeBehind −3 u ....... objects behind this are dropped (arrays stay ≈ 20–40 long)
 *   maxSpeed 13 u/s ......... cap for late loops
 *   heroHalfW 0.28 u, hitZPad 0.25 u … collision box padding (DESIGN rules)
 *   bossEvery 30 s .......... Fizz visits every 30 s (counted from the start of the previous visit)
 *   bossMinAway 12 s ........ … but never less than 12 s after he left
 *   bossEnterT 1.2 s, bossLeaveT 1.0 s, bossZ 11 u, bossY 2.4 u, sway 1.1·sin(0.9 t)
 *   windupT 0.4 s ........... Fizz lifts the pillow before each throw (a readable "here it comes")
 *   pillowTurns 1 ........... whole turns per flight → the cushion lands upright
 *   goal {easy 410, normal 530, hard 640} u … ≈ 72 s for chapter 1 and ≈ 62 s for chapter 4 at casual skill
 *   difficulty.*: hearts, speed (u/s), react (s: row gap ≥ speed·react + 2.5 u), pillows per visit,
 *     pillowEvery (s), zLand (u ahead at landing), flightT (s), aimRandom (share thrown at a random lane)
 *   zones[z]: patterns {name: weight}, gapK (multiplies the minimum row gap; chapter 1 is roomy)
 */
(function (PO) {
  'use strict';
  var M = Math, TAU = M.PI * 2;

  var CONFIG = {
    step: 1 / 120,
    stride: 1.1,
    laneOmega: 26, laneZeta: 0.85, queueAt: 0.35,
    tiltMax: 0.3, tiltRate: 18,
    jumpV: 6.2, g: 19, jumpBuffer: 0.15,
    squashDecay: 7, stretchDecay: 8,
    accel: 2.6, chapterRamp: 0.08, zoneSpeedK: 0.06, loopSpeedK: 0.1, stumbleSlow: 0.55,
    stumble: 0.6, invuln: 1.6, ouchT: 0.8, happyT: 1.2,
    spawnAhead: 34, removeBehind: -3, firstRow: 16,
    maxSpeed: 13,
    heroHalfW: 0.28, hitZPad: 0.25,
    bossEvery: 30, bossMinAway: 12, bossEnterT: 1.2, bossLeaveT: 1.0,
    bossZ: 11, bossY: 2.4, bossSwayA: 1.1, bossSwayW: 0.9, windupT: 0.4, pillowTurns: 1,
    shellPoints: 10, comboEvery: 10, levelBonus: 100, perfectBonus: 50,
    tumbleSpeed: [1.2, 1.8], tumbleWake: [1.5, 3.0], tumbleHopV: 1.7,
    goal: { easy: 410, normal: 530, hard: 640 },
    difficulty: {
      easy:   { hearts: 5, speed: 5.5, react: 1.1,  pillows: 2, pillowEvery: 1.5,  zLand: 7.5, flightT: 1.3,  aimRandom: 0.7 },
      normal: { hearts: 3, speed: 7.0, react: 0.8,  pillows: 4, pillowEvery: 1.15, zLand: 6.5, flightT: 1.1,  aimRandom: 0 },
      hard:   { hearts: 3, speed: 8.4, react: 0.62, pillows: 5, pillowEvery: 0.95, zLand: 5.8, flightT: 0.95, aimRandom: 0 }
    },
    zones: [
      { patterns: { pots1: 5, pots2: 2, shellLine: 3, shellZig: 2 }, gapK: 1.35 },
      { patterns: { pots1: 3, pots2: 2, log1: 3, log3: 1, shellLine: 2, shellArc: 2, shellZig: 1 }, gapK: 1.15 },
      { patterns: { pots1: 3, pots2: 2, log1: 2, log3: 1, tumble: 3, shellLine: 2, shellArc: 2, shellZig: 1 }, gapK: 1.08 },
      { patterns: { pots1: 3, pots2: 3, log1: 2, log3: 2, tumble: 2, shellLine: 2, shellArc: 2, shellZig: 2 }, gapK: 1.0 }
    ],
    // collision sizes: h = top height, w = half-width, d = half-depth (u)
    kinds: {
      pots:   { h: 1.6,  w: 0.34, d: 0.3 },
      log:    { h: 0.42, w: 0.44, d: 0.18 },
      tumble: { h: 0.55, w: 0.28, d: 0.28, r: 0.31 },
      pillow: { h: 0.45, w: 0.38, d: 0.3 },
      shell:  { h: 0.3,  w: 0.22, d: 0.2 }
    },
    shellY: 0.35            // a resting shell floats at Pebble's middle height
  };
  var TALL = { pots: 1 };
  var HEAVY = { pots2: 1, log3: 1, tumble: 1 };     // not generated while Fizz is visiting

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.opts = opts;
    this.seed = opts.seed === undefined || opts.seed === null ? 1 : opts.seed;
    this.difficulty = C.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.D = C.difficulty[this.difficulty];
    this.rng = new PO.RNG(this.seed);
    this.trackRng = this.rng.fork('track');
    this.bossRng = this.rng.fork('boss');
    this.fxRng = this.rng.fork('fx');
    this.time = 0; this.phase = 'play'; this.acc = 0; this.alpha = 0;
    this.level = 0; this.zone = 0; this.loop = 0;
    this.dist = 0; this.levelDist = 0;
    this.goal = this._goalFor(0); this.progress = 0; this.endS = this.goal;
    this.speed = this.D.speed * 0.45; this.overV = 0;
    this.score = 0; this.shells = 0;
    this.maxHearts = this.D.hearts; this.hearts = this.maxHearts;
    this.combo = 0; this.maxCombo = 0;
    this.hero = { lane: 0, x: 0, prevX: 0, vx: 0, y: 0, prevY: 0, vy: 0, onGround: true,
      tilt: 0, squash: 0, stretch: 0, mood: 'run', moodT: 0, invuln: 0, stumbleT: 0, run: 0, prevRun: 0,
      queued: 0, buffer: 0, airT: 0 };
    this.boss = { state: 'away', t: 0, x: 0, prevX: 0, y: 6.5, prevY: 6.5, z: 30, prevZ: 30, mood: 'grin', moodT: 0,
      nextT: C.bossEvery, toThrow: 0, thrown: 0, hits: 0, visits: 0, throwT: 0, windup: 0, tilt: 0, perfect: false, side: 1 };
    this.objects = [];
    this.events = [];
    this.stats = { shells: 0, jumps: 0, lanes: 0, bumps: 0, pillowsDodged: 0, pillowHits: 0, bossVisits: 0,
      bossPerfect: 0, levels: 0, dist: 0, time: 0 };
    this._id = 0;
    this.rowLog = opts.recordRows ? [] : null;
    this._gen = { nextS: C.firstRow, lastObstS: -1e9, lastShellEnd: -1e9, lastFree: null, variant: 0 };
    if (opts.level) this._setLevel(opts.level | 0, false);
    this._fill();
  };

  World.prototype._goalFor = function (level) {
    return CONFIG.goal[this.difficulty] * (1 + 0.1 * M.floor(level / 4));
  };
  World.prototype.setLayout = function () { /* no pixels in the world (shared main.js calls this) */ };

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
    h.vy = CONFIG.jumpV; h.onGround = false; h.stretch = 1; h.buffer = 0; h.airT = 0;
    this.stats.jumps++;
    this.events.push({ type: 'jump' });
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

  World.prototype._targetSpeed = function () {
    var C = CONFIG, h = this.hero;
    var v = this.D.speed * (1 + C.zoneSpeedK * this.zone + C.loopSpeedK * this.loop) * (1 + C.chapterRamp * this.progress);
    if (h.stumbleT > 0) v *= C.stumbleSlow;
    return M.min(v, C.maxSpeed);
  };

  World.prototype._step = function (dt) {
    var C = CONFIG, h = this.hero, b = this.boss;
    this.time += dt; this.stats.time = this.time;
    h.prevX = h.x; h.prevY = h.y; h.prevRun = h.run;
    b.prevX = b.x; b.prevY = b.y; b.prevZ = b.z;

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

    // jump (exact parabola per step: lands exactly on y = 0)
    if (h.buffer > 0) h.buffer = M.max(0, h.buffer - dt);
    if (!h.onGround) {
      h.airT += dt;
      var ny = h.y + h.vy * dt - 0.5 * C.g * dt * dt;
      h.vy -= C.g * dt;
      if (ny <= 0) {
        var vLand = h.vy;
        h.y = 0; h.vy = 0; h.onGround = true;
        h.squash = clamp(-vLand / C.jumpV, 0.3, 1);
        this.events.push({ type: 'land', hard: -vLand > 0.8 * C.jumpV });
        if (h.buffer > 0 && this.phase === 'play') this._doJump();
      } else h.y = ny;
    }
    h.squash *= M.exp(-C.squashDecay * dt); if (h.squash < 1e-3) h.squash = 0;
    h.stretch *= M.exp(-C.stretchDecay * dt); if (h.stretch < 1e-3) h.stretch = 0;
    if (h.invuln > 0) h.invuln = M.max(0, h.invuln - dt);
    if (h.stumbleT > 0) h.stumbleT = M.max(0, h.stumbleT - dt);
    if (h.moodT > 0) h.moodT = M.max(0, h.moodT - dt);
    if (h.moodT <= 0 && this.phase === 'play') h.mood = h.onGround ? 'run' : 'jump';

    this._updateBoss(dt);
    this._updateObjects(dt);
    if (this.phase === 'play') this._collide();
    this._fill();

    // chapters
    if (this.phase === 'play' && this.levelDist >= this.goal) this._levelUp();
    this.progress = clamp(this.levelDist / this.goal, 0, 1);
  };

  // ------------------------------------------------------------------ chapters
  World.prototype._setLevel = function (lv, keepObjects) {
    this.level = M.max(0, lv); this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.levelDist = 0; this.goal = this._goalFor(this.level); this.progress = 0;
    this.endS = this.dist + this.goal;
    if (!keepObjects) {
      // regenerate the track for the new chapter (keep what is right in front of Pebble)
      var keep = [];
      for (var i = 0; i < this.objects.length; i++) if (this.objects[i].z < 10) keep.push(this.objects[i]);
      this.objects = keep;
      var g = this._gen;
      g.nextS = this.dist + 14; g.lastObstS = M.min(g.lastObstS, this.dist + 10); g.lastFree = null;
      g.lastShellEnd = M.min(g.lastShellEnd, this.dist + 10);
    }
  };
  World.prototype._levelUp = function () {
    var C = CONFIG, h = this.hero;
    var bonus = C.levelBonus * (this.zone + 1) * (this.loop + 1);
    this.score += bonus; this.stats.levels++;
    this._setLevel(this.level + 1, true);
    if (this.hearts < this.maxHearts) { this.hearts++; this.events.push({ type: 'heartGain', hearts: this.hearts }); }
    h.mood = 'happy'; h.moodT = C.happyT;
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: bonus });
  };
  /** jump to chapter i (debug / ?level=N). Emits levelUp (bonus 0). */
  World.prototype.gotoLevel = function (i) {
    this._setLevel(i | 0, false);
    this.speed = M.max(this.speed, this._targetSpeed() * 0.8);
    this._fill();
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: 0 });
  };

  // ------------------------------------------------------------------ objects
  World.prototype._obj = function (kind, x, s, o) {
    var K = CONFIG.kinds[kind];
    var ob = { id: ++this._id, kind: kind, s: s, z: s - this.dist, prevZ: s - this.dist, x: x, prevX: x, y: 0, prevY: 0,
      vx: 0, vy: 0, vs: 0, rot: 0, prevRot: 0, spin: 0, h: K.h, w: K.w, d: K.d, variant: 0, state: 'live', t: 0,
      landX: x, landS: s, squash: 0 };
    if (o) for (var k in o) ob[k] = o[k];
    ob.prevX = ob.x; ob.prevY = ob.y; ob.prevZ = ob.z = ob.s - this.dist;
    this.objects.push(ob);
    return ob;
  };

  /** test hook: add an object `zAhead` u in front of Pebble. */
  World.prototype.spawn = function (kind, lane, zAhead, opts) {
    if (!CONFIG.kinds[kind]) throw new Error('unknown kind ' + kind);
    opts = opts || {};
    var o = {}; for (var k in opts) o[k] = opts[k];
    if (kind === 'shell' && o.y === undefined) o.y = CONFIG.shellY;
    if (kind === 'tumble') { o.awake = o.vx !== undefined; o.bounces = o.bounces || 0; o.vx = o.vx || 0; if (o.wake === undefined) o.wake = 2; }
    if (kind === 'shell') o.grp = o.grp || { n: 1, taken: 0 };
    if (kind === 'pillow' && o.state === 'fly') return this._throwPillow(lane, o);
    return this._obj(kind, lane === undefined ? 0 : lane, this.dist + (zAhead === undefined ? 10 : zAhead), o);
  };

  World.prototype._knock = function (o) {
    var r = this.fxRng, side = o.x > this.hero.x + 0.02 ? 1 : o.x < this.hero.x - 0.02 ? -1 : r.sign();
    o.vx = side * r.range(2.2, 3.2); o.vy = r.range(2.2, 3.0); o.vs = r.range(1.0, 1.8);
    o.spin = side * r.range(4, 7); o.airborne = true;
  };

  World.prototype._updateObjects = function (dt) {
    var C = CONFIG, g = C.g, objs = this.objects, keep = 0, h = this.hero;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      o.prevX = o.x; o.prevY = o.y; o.prevZ = o.z; o.prevRot = o.rot;
      o.t += dt;
      if (o.squash > 0) { o.squash *= M.exp(-6 * dt); if (o.squash < 1e-3) o.squash = 0; }
      switch (o.kind) {
        case 'shell':
          if (o.state === 'taken') { o.y += 2.2 * dt; if (o.t > 0.35) o.state = 'gone'; }
          else o.rot = 0.18 * M.sin(this.time * 2.4 + o.id);
          break;
        case 'pillow':
          if (o.state === 'fly') this._flyPillow(o, dt);
          else if (o.state === 'live' && (o.y > 0 || o.vy > 0)) {      // a little settle-bounce after landing
            o.y += o.vy * dt - 0.5 * g * dt * dt; o.vy -= g * dt;
            if (o.y <= 0) { o.y = 0; o.vy = o.vy < -1 ? -o.vy * 0.3 : 0; if (o.vy) o.squash = 0.6; }
          }
          break;
        case 'tumble':
          if (o.state === 'live') this._rollTumble(o, dt);
          break;
        case 'pots':
          if (o.state === 'hit') o.rot = 0.3 * M.exp(-4 * o.t) * M.sin(16 * o.t);   // wobble, passed through
          break;
      }
      if (o.airborne) {                    // knocked aside: a small ballistic hop with bounces and friction
        o.x += o.vx * dt; o.s += o.vs * dt; o.rot += o.spin * dt;
        o.y += o.vy * dt - 0.5 * g * dt * dt; o.vy -= g * dt;
        o.vs *= M.exp(-1.5 * dt);
        if (o.y <= 0) {
          o.y = 0;
          if (o.vy < -1.2) { o.vy = -o.vy * 0.35; o.vx *= 0.6; o.spin *= 0.5; }
          else { o.vy = 0; o.vx *= M.exp(-6 * dt); o.spin *= M.exp(-6 * dt); }
        }
      }
      o.z = o.s - this.dist;
      // pillows that got past without a hit = dodged
      if (o.kind === 'pillow' && o.state === 'live' && !o.done && o.z < -1) { o.done = true; this.stats.pillowsDodged++; }
      if (o.kind === 'shell' && o.state === 'live' && o.z < -0.6) {
        o.state = 'gone';
        if (o.grp && o.grp.taken > 0 && this.phase === 'play') this.combo = 0;
      }
      if (o.z < C.removeBehind || o.state === 'gone') continue;
      objs[keep++] = o;
    }
    objs.length = keep;
    void h;
  };

  World.prototype._rollTumble = function (o, dt) {
    var C = CONFIG, K = C.kinds.tumble;
    if (!o.awake) {
      if (o.z < this.speed * o.wake) o.awake = true;
      else { o.rot = 0.06 * M.sin(this.time * 3 + o.id); return; }    // rocking at the roadside, waiting
    }
    var x0 = o.x;
    o.x += o.vx * dt;
    o.rot += (o.x - x0) / K.r;            // rolling without slipping: angle = distance / radius
    o.y += o.vy * dt - 0.5 * C.g * dt * dt; o.vy -= C.g * dt;
    if (o.y <= 0) { o.y = 0; o.vy = C.tumbleHopV * (0.8 + 0.4 * ((o.hops = (o.hops || 0) + 1) % 3) / 2); o.squash = 0.5; }
    if (o.bounces < 1 && M.abs(o.x) > 1.45 && sgn(o.x) === sgn(o.vx)) {
      o.vx = -o.vx * 0.9; o.bounces++; o.squash = 1;
      this.events.push({ type: 'tumbleBounce', o: o });
    }
  };

  // ------------------------------------------------------------------ collisions
  World.prototype._collide = function () {
    var C = CONFIG, h = this.hero, objs = this.objects;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.state !== 'live' && o.state !== 'fly') continue;
      if (M.abs(o.z) >= o.d + C.hitZPad || M.abs(o.x - h.x) >= o.w + C.heroHalfW) continue;
      if (o.kind === 'shell') {
        if (M.abs(o.y - h.y - C.shellY) < 0.6) this._takeShell(o);
        continue;
      }
      if (h.invuln > 0) continue;
      if (o.state === 'fly') {                        // a pillow coming down on Pebble's head
        if (h.y < o.y + o.h && h.y + 0.9 > o.y) this._bump(o);
      } else if (h.y < o.y + o.h - 0.05) this._bump(o);
      if (this.phase !== 'play') return;
    }
  };

  World.prototype._takeShell = function (o) {
    var C = CONFIG;
    o.state = 'taken'; o.t = 0;
    if (o.grp) o.grp.taken++;
    this.shells++; this.stats.shells++;
    this.score += C.shellPoints;
    this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.events.push({ type: 'shell', o: o, x: o.x, y: o.y, z: o.z, variant: o.variant, points: C.shellPoints, combo: this.combo });
    if (this.combo % C.comboEvery === 0) this.events.push({ type: 'combo', combo: this.combo });
  };

  World.prototype._bump = function (o) {
    var C = CONFIG, h = this.hero, b = this.boss;
    o.state = 'hit'; o.t = 0;
    if (o.kind !== 'pots') this._knock(o);
    this.stats.bumps++;
    if (o.kind === 'pillow') {
      this.stats.pillowHits++; o.done = true;
      if (o.visit === b.visits && b.state !== 'away') b.hits++;
    }
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
    if (this.boss.state === 'enter' || this.boss.state === 'hover') this._bossLeave(false);
    this.events.push({ type: 'gameOver' });
  };

  // ------------------------------------------------------------------ the boss (Fizz)
  World.prototype._bossPillows = function () { return M.min(6, this.D.pillows + this.loop); };

  World.prototype.summonBoss = function () {
    if (this.boss.state === 'away' && this.phase === 'play') this._bossEnter();
  };
  World.prototype._bossEnter = function () {
    var C = CONFIG, b = this.boss;
    b.state = 'enter'; b.t = 0; b.visits++; this.stats.bossVisits++;
    b.toThrow = this._bossPillows(); b.thrown = 0; b.lastThrowT = 0; b.hits = 0; b.mood = 'grin'; b.moodT = 0; b.windup = 0;
    b.nextT = C.bossEvery; b.side = this.bossRng.sign();
    b.x = b.prevX = 0; b.y = b.prevY = 6.5; b.z = b.prevZ = 30;
    this.events.push({ type: 'bossEnter' });
  };
  World.prototype._bossLeave = function (fromHover) {
    var C = CONFIG, b = this.boss;
    b.state = 'leave'; b.t = 0; b.windup = 0;
    b.perfect = fromHover && b.hits === 0;
    var bonus = b.perfect ? C.perfectBonus * (this.level + 1) : 0;
    if (b.perfect) { this.score += bonus; this.stats.bossPerfect++; b.mood = 'hmph'; } else b.mood = 'grin';
    b.moodT = 1.5;
    b.lx = b.x; b.ly = b.y;
    this.events.push({ type: 'bossLeave', perfect: b.perfect, bonus: bonus });
  };

  World.prototype._updateBoss = function (dt) {
    var C = CONFIG, b = this.boss;
    if (b.state !== 'away' || this.phase === 'play') b.nextT -= dt;
    if (b.moodT > 0) { b.moodT -= dt; if (b.moodT <= 0 && b.state !== 'leave') b.mood = 'grin'; }
    var px = b.x;
    switch (b.state) {
      case 'away':
        if (this.phase === 'play' && b.nextT <= 0) this._bossEnter();
        break;
      case 'enter': {
        b.t += dt;
        var e = smooth(b.t / C.bossEnterT);
        b.z = 30 + (C.bossZ - 30) * e;
        b.y = 6.5 + (C.bossY - 6.5) * e;
        b.x = b.side * 0.9 * M.sin(M.PI * e);              // swoops in on a curve
        if (b.t >= C.bossEnterT) { b.state = 'hover'; b.t = 0; b.throwT = 0.6; b.x = 0; }
        break;
      }
      case 'hover': {
        b.t += dt;
        b.x = C.bossSwayA * M.sin(b.t * C.bossSwayW) * b.side;
        b.y = C.bossY + 0.12 * M.sin(b.t * 2.6);
        b.z = C.bossZ;
        if (b.thrown < b.toThrow) {
          b.throwT -= dt;
          b.windup = clamp(1 - b.throwT / C.windupT, 0, 1);
          if (b.throwT <= C.windupT && b.mood !== 'throw') { b.mood = 'throw'; b.moodT = 0; }
          if (b.throwT <= 0) {
            this._throwPillow(null);
            b.thrown++; b.throwT = this.D.pillowEvery; b.windup = 0; b.mood = 'throw'; b.moodT = 0.25;
            b.lastThrowT = b.t;
          }
        } else if (b.t - b.lastThrowT > 0.5 && !this._pillowsPending()) this._bossLeave(true);
        break;
      }
      case 'leave': {
        b.t += dt;
        var q = clamp(b.t / C.bossLeaveT, 0, 1), q2 = q * q;     // accelerates away
        b.z = C.bossZ + (26 - C.bossZ) * q2;
        b.y = b.ly + 5 * q2;
        b.x = b.lx * (1 - q);
        if (b.t >= C.bossLeaveT) { b.state = 'away'; b.t = 0; b.nextT = M.max(b.nextT, C.bossMinAway); b.mood = 'grin'; }
        break;
      }
    }
    var vx = (b.x - px) / dt;
    b.tilt += (clamp(vx * 0.25, -0.35, 0.35) - b.tilt) * (1 - M.exp(-8 * dt));
  };

  World.prototype._pillowsPending = function () {
    var v = this.boss.visits;
    for (var i = 0; i < this.objects.length; i++) {
      var o = this.objects[i];
      if (o.kind === 'pillow' && o.visit === v && !o.done && (o.state === 'fly' || o.state === 'live')) return true;
    }
    return false;
  };

  /** Throw a pillow from Fizz at a lane (null → aim per difficulty). */
  World.prototype._throwPillow = function (lane, extra) {
    var C = CONFIG, b = this.boss, r = this.bossRng, D = this.D;
    if (lane === null || lane === undefined) lane = r.chance(D.aimRandom) ? r.int(-1, 1) : this.hero.lane;
    var T = (extra && extra.T) || D.flightT;
    var landS = this.dist + this.speed * T + D.zLand;
    // fair landing spot: not on a pot stack, and a full jump length away from other low things in that lane
    // (so one jump never has to clear two of them, and Pebble can land between them)
    var jl = this.speed * 2 * C.jumpV / C.g + 1.2;
    for (var k = 0; k < 4; k++) {
      var moved = false;
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.state !== 'live' && o.state !== 'fly') continue;
        if (o.kind === 'shell') continue;
        var ox = o.state === 'fly' ? o.landX : o.x, os = o.state === 'fly' ? o.landS : o.s;
        var need = o.kind === 'pots' ? 1.6 : (o.kind === 'tumble' ? jl + 1 : jl);
        if (M.abs(ox - lane) < 0.6 + (o.kind === 'tumble' ? 2 : 0) && M.abs(os - landS) < need) { landS = os + need; moved = true; }
      }
      if (!moved) break;
    }
    var s0 = this.dist + (b.state === 'away' ? C.bossZ : b.z), x0 = b.state === 'away' ? 0 : b.x;
    var h0 = (b.state === 'away' ? C.bossY : b.y) + 0.5;
    var vy0 = (0.5 * C.g * T * T - h0) / T;
    var p = this._obj('pillow', x0, s0, {
      y: h0, vy: vy0, state: 'fly', T: T, p: 0, landX: lane, landS: landS, s0: s0, x0: x0, h0: h0, vy0: vy0,
      spin: r.sign() * C.pillowTurns * TAU / T, variant: r.int(0, 1), visit: b.visits
    });
    this.events.push({ type: 'throw', o: p });
    return p;
  };

  World.prototype._flyPillow = function (o, dt) {
    var C = CONFIG, t = M.min(o.t, o.T), p = t / o.T;
    o.p = p;
    o.s = o.s0 + (o.landS - o.s0) * p;
    o.x = o.x0 + (o.landX - o.x0) * (1 - (1 - p) * (1 - p));      // ease-out across the lanes
    o.y = o.h0 + o.vy0 * t - 0.5 * C.g * t * t;                    // a real ballistic arc
    o.vy = o.vy0 - C.g * t;
    o.rot += o.spin * dt;
    if (o.t >= o.T) {
      o.y = 0; o.s = o.landS; o.x = o.landX; o.p = 1;
      o.rot = M.round(o.rot / TAU) * TAU;
      o.state = 'live'; o.t = 0; o.vy = 1.4; o.squash = 1; o.spin = 0;
      this.events.push({ type: 'pillowLand', o: o });
      // landing right on Pebble counts as a hit
      var h = this.hero;
      if (this.phase === 'play' && h.invuln <= 0 && M.abs(o.s - this.dist) < o.d + C.hitZPad &&
          M.abs(o.x - h.x) < o.w + C.heroHalfW && h.y < o.h) this._bump(o);
    }
  };

  // ------------------------------------------------------------------ track generation
  World.prototype._rowZone = function (s) {
    // which chapter will Pebble be in when he reaches s?
    var lv = this.level, end = this.endS;
    while (s >= end) { lv++; end += this._goalFor(lv); }
    return lv;
  };
  World.prototype._bossAt = function (s) {
    var b = this.boss, v = M.max(this.speed, this.D.speed * 0.6), t = (s - this.dist) / v;
    var visit = CONFIG.bossEnterT + this._bossPillows() * this.D.pillowEvery + 3 + CONFIG.bossLeaveT;
    if (b.state === 'away') return t > b.nextT - 1 && t < b.nextT + visit;
    if (b.state === 'leave') return false;
    return t < visit;
  };

  World.prototype._fill = function () {
    var lim = this.dist + CONFIG.spawnAhead, n = 0;
    while (this._gen.nextS < lim && n++ < 50) this._genRow();
  };

  World.prototype._pickPattern = function (zone, boss) {
    var r = this.trackRng, P = CONFIG.zones[zone].patterns, names = [], ws = [], tot = 0;
    for (var k in P) {
      var w = P[k];
      if (boss && HEAVY[k]) continue;
      if (this.difficulty === 'easy') {
        if (k === 'log3' && zone < 2) continue;
        if (k === 'pots2') w *= 0.5;
      }
      if (boss && (k === 'shellLine' || k === 'shellZig')) w *= 1.5;
      names.push(k); ws.push(w); tot += w;
    }
    var x = r.next() * tot;
    for (var i = 0; i < names.length; i++) { x -= ws[i]; if (x < 0) return names[i]; }
    return names[names.length - 1];
  };

  World.prototype._genRow = function () {
    var C = CONFIG, r = this.trackRng, g = this._gen, D = this.D;
    var S = g.nextS, lv = this._rowZone(S), zone = lv % 4, loop = M.floor(lv / 4);
    var boss = this._bossAt(S);
    var pat = this._pickPattern(zone, boss);
    var vEst = M.min(C.maxSpeed, D.speed * (1 + C.zoneSpeedK * zone + C.loopSpeedK * loop) * (1 + C.chapterRamp));
    var minGap = vEst * D.react + 2.5;
    var gap = minGap * C.zones[zone].gapK * r.range(1, 1.3) * (boss ? 1.2 : 1);
    var variant = g.variant = (g.variant + 1 + r.int(0, 1)) % 3;
    var self = this, items = [], obstS = null, end = S, tall = [], low = [];
    function shell(x, s, y) { items.push(['shell', x, s, { y: y === undefined ? C.shellY : y, variant: variant }]); }
    function lanesExcept(a) { var o = []; for (var l = -1; l <= 1; l++) if (a.indexOf(l) < 0) o.push(l); return o; }

    switch (pat) {
      case 'pots1': case 'pots2': {
        var free;
        if (pat === 'pots1') {
          var L = r.int(-1, 1); tall = [L];
        } else {
          var cands = [-1, 0, 1];
          if (g.lastFree && this.difficulty !== 'hard') {        // keep the free lane within one step of the last one
            cands = cands.filter(function (f) { return g.lastFree.some(function (q) { return M.abs(q - f) <= 1; }); });
          }
          var F = r.pick(cands); tall = lanesExcept([F]);
        }
        free = lanesExcept(tall);
        for (var i = 0; i < tall.length; i++) items.push(['pots', tall[i], S, { variant: r.int(0, 1) }]);
        if (r.chance(pat === 'pots2' ? 0.6 : 0.4)) {            // a little shell "this way!" lure in a free lane
          var fl = r.pick(free);
          for (var j = -1; j <= 1; j++) shell(fl, S + j * 1.2);
          end = S + 1.2;
        }
        obstS = S; g.lastFree = free;
        break;
      }
      case 'log1': {
        var L1 = r.int(-1, 1); low = [L1];
        items.push(['log', L1, S, {}]); obstS = S;
        break;
      }
      case 'log3': {
        low = [-1, 0, 1];
        for (var l3 = -1; l3 <= 1; l3++) items.push(['log', l3, S, {}]);
        if (r.chance(0.5)) this._arc(items, r.int(-1, 1), S, vEst, variant, 4);
        obstS = S; end = S + vEst * 0.35;
        break;
      }
      case 'tumble': {
        var side = r.sign();
        items.push(['tumble', side * 1.9, S, { awake: false, vx: -side * r.range(C.tumbleSpeed[0], C.tumbleSpeed[1]) * (1 + 0.1 * (zone - 2)),
          bounces: 0, wake: r.range(C.tumbleWake[0], C.tumbleWake[1]), variant: 0 }]);
        low = [-1, 0, 1]; obstS = S;
        break;
      }
      case 'shellArc': {
        var La = r.int(-1, 1); low = [La];
        items.push(['log', La, S, {}]);
        this._arc(items, La, S, vEst, variant, 6);
        obstS = S; end = S + vEst * 0.33;
        break;
      }
      case 'shellLine': {
        var n = r.int(5, 8), Ll = r.int(-1, 1);
        for (var a = 0; a < n; a++) shell(Ll, S + a * 1.2);
        end = S + (n - 1) * 1.2;
        break;
      }
      case 'shellZig': {
        var nz = r.int(6, 8), lane = r.int(-1, 1), dir = lane === 0 ? r.sign() : -lane;
        for (var z = 0; z < nz; z++) {
          shell(lane, S + z * 1.5);
          if (z % 2 === 1) { if (M.abs(lane + dir) > 1) dir = -dir; lane += dir; }
        }
        end = S + (nz - 1) * 1.5;
        break;
      }
    }

    // spacing rules: obstacle rows ≥ minGap apart (randomly more), and not right behind a shell run
    var shift = 0;
    if (obstS !== null) {
      var need = M.max(g.lastObstS + gap, g.lastShellEnd + 0.6 * minGap);
      if (obstS < need) shift = need - obstS;
    }
    var grp = { n: 0, taken: 0 };
    for (var it = 0; it < items.length; it++) {
      var e = items[it];
      if (e[0] === 'shell') { grp.n++; e[3].grp = grp; }
      self._obj(e[0], e[1], e[2] + shift, e[3]);
    }
    end += shift;
    if (obstS !== null) { g.lastObstS = obstS + shift; }
    var hasShell = grp.n > 0;
    if (hasShell) g.lastShellEnd = M.max(g.lastShellEnd, end);
    g.nextS = (obstS !== null ? M.max(end, obstS + shift) : end) + r.range(2.5, 4.5);
    if (this.rowLog) this.rowLog.push({ s: S + shift, obstS: obstS === null ? null : obstS + shift, pattern: pat, zone: zone,
      level: lv, tall: tall.slice(), low: low.slice(), minGap: minGap, vEst: vEst, boss: boss, end: end, diff: this.difficulty });
  };

  /** n shells along Pebble's jump arc with its apex over s = S (a jump grabs them all). */
  World.prototype._arc = function (items, lane, S, v, variant, n) {
    var C = CONFIG, T = 2 * C.jumpV / C.g, s0 = S - v * T / 2;
    for (var i = 0; i < n; i++) {
      var t = T * (i + 0.5) / n, y = C.jumpV * t - 0.5 * C.g * t * t;
      items.push(['shell', lane, s0 + v * t, { y: y + C.shellY, variant: variant, arc: true }]);
    }
  };

  // ------------------------------------------------------------------ summary for tests / debug
  World.prototype.getState = function () {
    var h = this.hero, b = this.boss, counts = {};
    for (var i = 0; i < this.objects.length; i++) { var k = this.objects[i].kind; counts[k] = (counts[k] || 0) + 1; }
    var st = {}; for (var s in this.stats) st[s] = this.stats[s];
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop, dist: this.dist,
      levelDist: this.levelDist, goal: this.goal, progress: this.progress, speed: this.speed, score: this.score,
      shells: this.shells, hearts: this.hearts, maxHearts: this.maxHearts, difficulty: this.difficulty,
      combo: this.combo, maxCombo: this.maxCombo,
      hero: { lane: h.lane, x: h.x, y: h.y, vx: h.vx, vy: h.vy, onGround: h.onGround, tilt: h.tilt, squash: h.squash,
        stretch: h.stretch, mood: h.mood, invuln: h.invuln, stumbleT: h.stumbleT, run: h.run },
      boss: { state: b.state, x: b.x, y: b.y, z: b.z, mood: b.mood, nextT: b.nextT, toThrow: b.toThrow, thrown: b.thrown,
        hits: b.hits, visits: b.visits },
      objects: this.objects.length, counts: counts, stats: st
    };
  };

  PO.World = World;
})(window.PO = window.PO || {});
