/* Pip's Oasis Glow — POG.World: the headless, deterministic game simulation (DESIGN §5, docs/MECHANICS.md)
 *
 *   var w = new POG.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.update(dt);                    // any dt; internally fixed sub-steps of CONFIG.STEP (1/120 s)
 *   w.tapAt(x, y) / w.tapHole(i)     // → 'match' | 'wrong' | 'empty' | 'busy' | 'none'
 *   w.drainEvents()                  // [{ type, ... }] since the last drain
 *   w.getState()                     // plain JSON-able snapshot
 *
 * Coordinates are logical stage px (960×540, y down), time in seconds. No DOM, no Date, no Math.random:
 * everything random comes from POG.RNG(seed), so the same seed + the same inputs give the same game.
 *
 * The rule: friends pop out of burrows holding a firefly (type 'firefly', rarely 'gold') → boop them;
 * or napping (type 'sleepy') → leave them alone (a tap is 'wrong').
 *
 * Motion (details and numbers in docs/MECHANICS.md):
 *  - pop height h: 'rise' is a damped spring toward 1 (ζ≈0.63, ωn≈34 rad/s → peak ≈1.08 at ≈0.11 s), 'up' keeps it,
 *    'sink' eases h0→0 with a cosine in 0.2 s, 'booped' stays up and bounces when Pip lands on its head, 'wow' holds 0.4 s.
 *  - Pip is ballistic: every hop is an exact gravity parabola (g = CONFIG.G, y down) from his current feet point to the
 *    target, x(t) = x0 + vx·t, y(t) = y0 + vy·t + ½gt², with vx = Δx/T, vy = (Δy − ½gT²)/T so he lands exactly at T.
 *    The return hop home picks T from a wanted apex height above the lily pad, so it is higher and slower.
 */
(function (POG) {
  'use strict';
  var M = Math;

  var CONFIG = {
    STEP: 1 / 120,            // s, fixed simulation sub-step
    MAX_DT: 0.5,              // s, longest dt accepted by one update() (anything above is dropped, no spiral of death)
    // --- scoring / rules (DESIGN §5) ---
    POINTS: 10,               // per firefly, × mult
    GOLD_X: 5,                // a golden firefly is worth GOLD_X × POINTS × mult
    MULT_AT: [5, 10],         // combo thresholds for ×2 and ×3
    COMBO_EVENT_EVERY: 5,     // 'combo' event at 5, 10, 15…
    CLEAR_BONUS: 50,
    LEVEL_GOAL: 15,           // fireflies per chapter (a gold counts 1)
    START_LEAVES: 5, MAX_LEAVES: 5, LEAF_EVERY: 12,   // hearts (lily-pad leaves)
    GOLD_P: 0.10,             // share of firefly pops that are golden…
    GOLD_AFTER: 3,            // …once this many pops of the chapter have happened (so never the first pop)
    GOLD_UP_K: 0.90,          // a gold stays up × this
    FAIR_T: 1.7,              // s without a visible firefly holder → the next pop holds one…
    FAIR_HURRY: 0.35,         // …and comes within 0.35 s (may exceed max up by one)
    MAX_FIREFLY_STREAK: 2,    // after 2 firefly pops in a row with no sleeper up, the next is a sleeper (preset maxStreak overrides)
    MASH_N: 3, MASH_WINDOW: 1.0, MASH_NAP: 1.5,   // 3 empty taps within 1 s → Pip naps 1.5 s (no heart lost)
    HIT_MIN_H: 0.25,          // a friend is tappable in 'rise'/'up' once h ≥ this
    START_DELAY: 1.5,         // s from chapter start to the first pop
    CLEAR_T: 1.2,             // s of empty field between levelClear and levelUp
    VACATE_GAP: 0.22,         // s, minimum pause after a burrow empties before the next pop
    // --- friend motion ---
    RISE_ZETA: 0.63, RISE_OMEGA: 34,   // damped spring (overshoot e^(−ζπ/√(1−ζ²)) ≈ 7.7 %)
    RISE_T: 0.22,             // s in 'rise' before 'up'
    SINK_T: 0.2,              // s
    BOOP_AFTER: 0.32,         // s a booped friend stays up after Pip lands on it
    BOOP_HOLD_MAX: 0.9,       // s a booped friend stays up if Pip never lands (he re-aimed elsewhere)
    BOOP_BOUNCE_T: 0.25, BOOP_BOUNCE_A: 0.07,     // happy bounce on landing: +A·sin(πu) over T s
    WOW_HOLD: 0.4,            // s
    // --- Pip ---
    HOME: { x: 480, y: 132 }, // feet point on the lily pad
    HEAD_DY: 112,             // head point = (bx, by − 112·s) at h = 1
    FIREFLY_DY: 31,           // firefly point = (bx, by − 31·s) (friend-local (70, 94))
    G: 2600,                  // px/s², gravity for every hop (y down)
    HOP_A: 0.30, HOP_B: 0.00035, HOP_MAX: 0.48,   // hop flight time T = clamp(A + B·dist, A, MAX) s…
    HOP_LIFT: 20, HOP_LIFT_MAX: 0.55,             // …but long enough that he rises ≥ 20 px off the pad (T ≤ 0.55 s)
    SKY_Y: 96,                // px, Pip's feet never fly above this line (his ~96 px tall sprite stays on the stage)
    RET_APEX: 40,             // px, the return hop peaks this far above the higher end (the pad), not above SKY_Y…
    RET_MIN: 0.42, RET_MAX: 0.72,                 // …with T clamped to these s
    BOOP_T: 0.18,             // s on the friend's head before hopping home
    SQUASH_RATE: 11,          // 1/s, landing squash decays e^(−rate·t)
    TILT_MAX: 0.45, TILT_RATE: 14, TILT_SOFT: 260, // rad, 1/s, px/s (tilt target = face·atan2(vy, |vx| + SOFT))
    DIZZY_T: 0.6, DIZZY_LOCK: 0.35, DIZZY_WOBBLE: 0.3, DIZZY_HZ: 3,
    // --- pacing ---
    LEVEL_SPEEDUP: 0.08,      // per chapter within a loop: speed × (1 + 0.08·zone)
    LOOP_SPEEDUP: 0.15,       // per loop: speed × (1 + 0.15·loop), loop capped at 4
    UP_MIN: 0.8, INTERVAL_MIN: 0.4,
    DIFFICULTY: {
      //        up s  spawn s   max up per zone  misses cost  P(firefly holder)  firefly streak before a forced sleeper
      easy:   { up: 2.8, interval: 3.0, maxUp: [2, 3, 3, 3], missCosts: false, fireflyP: 0.75, maxStreak: 3 },
      normal: { up: 1.9, interval: 1.8, maxUp: [3, 3, 4, 4], missCosts: true,  fireflyP: 0.6 },
      hard:   { up: 1.35, interval: 1.3, maxUp: [3, 4, 4, 5], missCosts: true,  fireflyP: 0.5 }
    }
  };

  function row(y, s, xs) { return xs.map(function (x) { return { x: x, y: y, s: s }; }); }
  var L23 = [].concat(row(280, 0.74, [330, 480, 630]), row(375, 0.87, [250, 480, 710]), row(480, 1.0, [190, 480, 770]));
  var LAYOUTS = [
    [].concat(row(330, 0.86, [280, 480, 680]), row(460, 1.0, [230, 480, 730])),
    [].concat(row(315, 0.84, [225, 395, 565, 735]), row(460, 1.0, [165, 375, 585, 795])),
    L23,
    L23.map(function (h) { return { x: h.x, y: h.y, s: h.s }; })
  ];
  var BIOMES = ['spring', 'palms', 'dunes', 'night'];
  var BIOME_NAMES = ['The Morning Spring', 'The Palm Grove', 'The Sunset Dunes', 'The Starlit Oasis'];
  var KINDS = ['fennec', 'jerboa', 'tortoise'];
  var TYPES = ['firefly', 'gold', 'sleepy'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function holds(c) { return c.type !== 'sleepy'; }

  function World(opts) {
    opts = opts || {};
    this.difficulty = CONFIG.DIFFICULTY[opts.difficulty] ? opts.difficulty : 'easy';
    this.startLevel = opts.level | 0;
    this.reset(opts.seed === undefined ? 1 : opts.seed);
  }
  World.CONFIG = CONFIG;
  World.LAYOUTS = LAYOUTS;
  World.BIOMES = BIOMES;
  World.BIOME_NAMES = BIOME_NAMES;
  World.KINDS = KINDS;
  World.TYPES = TYPES;

  /** ballistic launch velocity to go from (x0,y0) to (x1,y1) in T s under gravity g (y down) */
  World.ballistic = function (x0, y0, x1, y1, T, g) {
    return { vx: (x1 - x0) / T, vy: (y1 - y0 - 0.5 * g * T * T) / T };
  };

  var P = World.prototype;

  P.reset = function (seed) {
    if (seed !== undefined) this.seed = seed;
    this.rng = new POG.RNG(this.seed);
    this.preset = CONFIG.DIFFICULTY[this.difficulty];
    this.events = [];
    this.phase = 'play';
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.score = 0;
    this.leaves = CONFIG.START_LEAVES; this.maxLeaves = CONFIG.MAX_LEAVES;
    this.combo = 0; this.mult = 1; this.boops = 0; this.golds = 0; this.napT = 0; this._empties = [];
    this.levelGoal = CONFIG.LEVEL_GOAL;
    this.stats = { boops: 0, golds: 0, wrong: 0, missed: 0, bestCombo: 0, leavesGained: 0, levelTimes: [] };
    this.nextId = 1;
    var H = CONFIG.HOME;
    this.pip = { x: H.x, y: H.y, px: H.x, py: H.y, vx: 0, vy: 0, tilt: 0, face: 1, state: 'home', t: 0, target: null, squash: 0 };
    this._fl = null;          // current flight { kind: 'hop'|'return', x0, y0, vx0, vy0, T, t, x1, y1, hole, cid }
    this._dizzyFor = 0; this._standOn = -1;
    this._enterLevel(this.startLevel, false);
  };

  /** speed factor for the current level (bigger = faster pops) */
  P.speed = function () {
    return (1 + CONFIG.LEVEL_SPEEDUP * this.zone) * (1 + CONFIG.LOOP_SPEEDUP * M.min(this.loop, 4));
  };

  P._enterLevel = function (level, emit) {
    this.level = M.max(0, level | 0);
    this.zone = this.level % 4;
    this.loop = M.floor(this.level / 4);
    this.holes = LAYOUTS[this.zone].map(function (h) { return { x: h.x, y: h.y, s: h.s, critter: null }; });
    this.levelBoops = 0;
    this.clearing = false; this.clearT = 0;
    this.spawnT = CONFIG.START_DELAY;
    this.noFireflyT = 0; this.fireflyStreak = 0; this.lastVacated = -1; this.levelPops = 0; this._sleeperUp = false;
    this.levelStartT = this.time;
    // Pip may be standing on a friend that no longer exists: hop home
    if (this.pip && this.pip.state === 'boop') this._goHome();
    if (this._fl && this._fl.kind === 'hop') { this._fl.cid = -1; this._fl.hole = -1; }
    if (emit) this._ev({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop, name: BIOME_NAMES[this.zone] });
  };

  P._ev = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ------------------------------------------------------------------ update
  P.update = function (dt) {
    if (!(dt > 0)) return;
    this.acc += M.min(dt, CONFIG.MAX_DT);
    var h = CONFIG.STEP;
    while (this.acc >= h) { this._step(h); this.acc -= h; }
    this.alpha = this.acc / h;
  };

  P._step = function (dt) {
    this.time += dt;
    if (this.napT > 0) this.napT = M.max(0, this.napT - dt);
    var playing = this.phase === 'play';
    var z = this.pip; z.px = z.x; z.py = z.y;
    for (var i = 0; i < this.holes.length; i++) { var c = this.holes[i].critter; if (c) c.hPrev = c.h; }

    if (playing && !this.clearing) this._rules(dt);
    this._critters(dt, playing && !this.clearing);
    this._pip(dt);

    if (this.clearing) {
      this.clearT -= dt;
      if (this.clearT <= 0) this._enterLevel(this.level + 1, true);
    }
  };

  P._rules = function (dt) {
    // fairness clock: time since a firefly holder was last visible (rise/up)
    var vis = false, live = 0, sleeperUp = false;
    for (var i = 0; i < this.holes.length; i++) {
      var c = this.holes[i].critter;
      if (!c) continue;
      if (c.state === 'rise' || c.state === 'up') {
        live++;
        if (holds(c)) vis = true; else sleeperUp = true;
      } else if (c.state !== 'sink') live++;
    }
    this.noFireflyT = vis ? 0 : this.noFireflyT + dt;
    this._sleeperUp = sleeperUp;
    // spawning
    this.spawnT -= dt;
    var max = this.preset.maxUp[this.zone];
    var fair = this.noFireflyT >= CONFIG.FAIR_T;
    if (fair && this.spawnT > CONFIG.FAIR_HURRY) this.spawnT = CONFIG.FAIR_HURRY;
    if (this.spawnT <= 0 && (live < max || (fair && live < max + 1))) {
      var first = this.levelPops === 0;               // the first pop of every chapter holds a firefly
      if (this._spawn(fair || first) >= 0) {
        this.levelPops++;
        var iv = M.max(CONFIG.INTERVAL_MIN, this.preset.interval / this.speed());
        this.spawnT = iv * this.rng.range(0.8, 1.2);
        if (fair) this.noFireflyT = 0;
      }
    }
  };

  /** pop a friend into a free burrow; forceFirefly = must hold a firefly. Returns the hole index or −1. */
  P._spawn = function (forceFirefly) {
    var free = [], i;
    for (i = 0; i < this.holes.length; i++) if (!this.holes[i].critter && i !== this.lastVacated) free.push(i);
    if (!free.length && this.lastVacated >= 0 && !this.holes[this.lastVacated].critter) free.push(this.lastVacated);
    if (!free.length) return -1;
    var hi = this.rng.pick(free);
    var fly;
    if (forceFirefly) fly = true;
    else if (this.fireflyStreak >= (this.preset.maxStreak || CONFIG.MAX_FIREFLY_STREAK) && !this._sleeperUp) fly = false;
    else fly = this.rng.chance(this.preset.fireflyP);
    var type = 'sleepy';
    if (fly) type = this.levelPops >= CONFIG.GOLD_AFTER && this.rng.chance(CONFIG.GOLD_P) ? 'gold' : 'firefly';
    this.fireflyStreak = fly ? this.fireflyStreak + 1 : 0;
    this._place(hi, type);
    return hi;
  };

  P._place = function (hi, type) {
    var up = M.max(CONFIG.UP_MIN, this.preset.up / this.speed()) * this.rng.range(0.88, 1.12);
    if (type === 'gold') up *= CONFIG.GOLD_UP_K;
    var c = { kind: this.rng.pick(KINDS), type: type, state: 'rise', h: 0, hPrev: 0, hs: 0, v: 0, t: 0, upFor: up,
      id: this.nextId++, bounceAt: -1 };
    this.holes[hi].critter = c;
    // NB: the event's own `type` is 'pop', so the friend's type travels as `critterType` (DESIGN §5 wrote `type`)
    this._ev({ type: 'pop', hole: hi, kind: c.kind, critterType: type });
    return c;
  };

  P._critters = function (dt, live) {
    var C = CONFIG, k = C.RISE_OMEGA * C.RISE_OMEGA, d = 2 * C.RISE_ZETA * C.RISE_OMEGA;
    for (var i = 0; i < this.holes.length; i++) {
      var hole = this.holes[i], c = hole.critter;
      if (!c) continue;
      c.t += dt;
      var st = c.state;
      if (st === 'rise' || st === 'up' || st === 'booped' || st === 'wow') {
        // semi-implicit Euler on the spring h'' = k(1−h) − d·h'
        c.v += (k * (1 - c.hs) - d * c.v) * dt;
        c.hs += c.v * dt;
        c.h = c.hs;
      }
      if (st === 'rise') {
        if (c.t >= C.RISE_T) { c.state = 'up'; c.t = 0; }
      } else if (st === 'up') {
        if (!live) this._sink(c);
        else if (c.t >= c.upFor) {
          this._sink(c);
          if (holds(c)) {
            this.stats.missed++;
            this._ev({ type: 'miss', hole: i });
            if (this.preset.missCosts) { this._resetCombo(); this._loseLeaf(); }
          }
        }
      } else if (st === 'booped') {
        if (c.bounceAt >= 0) {
          var u = (c.t - c.bounceAt) / C.BOOP_BOUNCE_T;
          if (u > 0 && u < 1) c.h = c.hs + C.BOOP_BOUNCE_A * M.sin(M.PI * u) * (1 - 0.4 * u);
          if (c.t >= c.bounceAt + C.BOOP_AFTER) this._sink(c);
        } else if (c.t >= C.BOOP_HOLD_MAX) this._sink(c);
      } else if (st === 'wow') {
        if (c.t >= C.WOW_HOLD) this._sink(c);
      } else if (st === 'sink') {
        var s = M.min(1, c.t / C.SINK_T);
        c.h = c.h0 * (0.5 + 0.5 * M.cos(M.PI * s));
        if (s >= 1) {
          hole.critter = null; this.lastVacated = i;
          if (this.spawnT < C.VACATE_GAP && this.noFireflyT < C.FAIR_T) this.spawnT = C.VACATE_GAP;
        }
      }
    }
  };

  P._sink = function (c) { c.state = 'sink'; c.t = 0; c.h0 = M.max(0, c.h); c.v = 0; };

  P._resetCombo = function () { this.combo = 0; this.mult = 1; };

  P._loseLeaf = function () {
    if (this.phase !== 'play') return;
    this.leaves = M.max(0, this.leaves - 1);
    this._ev({ type: 'leafLost', leaves: this.leaves });
    if (this.leaves <= 0) {
      this.phase = 'over';
      this._ev({ type: 'gameOver', score: this.score });
    }
  };

  // ------------------------------------------------------------------ Pip
  /** head point of hole i for pop height h (Pip's feet when standing on the friend) */
  P.headPoint = function (i, h) {
    var o = this.holes[i]; if (h === undefined) h = 1;
    return { x: o.x, y: o.y - CONFIG.HEAD_DY * o.s + (1 - h) * 140 * o.s };
  };

  P._takeoff = function (kind, tx, ty, T, hole, cid) {
    var z = this.pip, C = CONFIG;
    var v = World.ballistic(z.x, z.y, tx, ty, T, C.G);
    this._fl = { kind: kind, x0: z.x, y0: z.y, vx0: v.vx, vy0: v.vy, T: T, t: 0, x1: tx, y1: ty, hole: hole, cid: cid };
    z.vx = v.vx; z.vy = v.vy;
    if (M.abs(tx - z.x) > 1) z.face = tx > z.x ? 1 : -1;
    this._ev({ type: 'pipLaunch', x: z.x, y: z.y, tx: tx, ty: ty, kind: kind });
  };

  /** hop to hole i's head point (from wherever Pip is now — a mid-air re-aim is a fresh parabola) */
  P._hop = function (i, c) {
    var z = this.pip, C = CONFIG, hp = this.headPoint(i, 1);
    var dx = hp.x - z.x, dy = hp.y - z.y, dist = M.sqrt(dx * dx + dy * dy);
    var T = World.hopT(z.x, z.y, hp.x, hp.y);
    this._takeoff('hop', hp.x, hp.y, T, i, c.id);
    z.state = 'hop'; z.t = 0; z.target = { x: hp.x, y: hp.y, hole: i };
    return T;
  };

  /** hop flight time: clamp(A + B·dist, A, MAX), stretched (up to HOP_LIFT_MAX) so the take-off speed points
   *  up by at least √(2g·HOP_LIFT) — a real leap even when the head is straight below the pad — and never so long
   *  that the apex would pass SKY_Y */
  World.hopT = function (x0, y0, x1, y1) {
    var C = CONFIG, dx = x1 - x0, dy = y1 - y0, dist = M.sqrt(dx * dx + dy * dy);
    var T = clamp(C.HOP_A + C.HOP_B * dist, C.HOP_A, C.HOP_MAX);
    var lift = clamp(y0 - C.SKY_Y, 0, C.HOP_LIFT);          // less lift when he is already high (a mid-air re-aim)
    var vl = M.sqrt(2 * C.G * lift), disc = vl * vl + 2 * C.G * dy;
    if (disc > 0) T = M.max(T, M.min(C.HOP_LIFT_MAX, (vl + M.sqrt(disc)) / C.G));
    // and short enough that the apex stays below SKY_Y: take-off vy ≥ −√(2g·(y0 − SKY_Y))
    var vs = M.sqrt(2 * C.G * M.max(0, y0 - C.SKY_Y)), ds = vs * vs + 2 * C.G * dy;
    if (ds > 0) T = M.min(T, (vs + M.sqrt(ds)) / C.G);
    return M.max(0.12, T);
  };

  /** return flight time: rise to RET_APEX above the higher end, then fall to the pad */
  World.returnT = function (y0, y1) {
    var C = CONFIG, top = M.max(C.SKY_Y, M.min(y0, y1) - C.RET_APEX);
    if (top > M.min(y0, y1)) top = M.min(y0, y1);
    var T = M.sqrt(2 * (y0 - top) / C.G) + M.sqrt(2 * (y1 - top) / C.G);
    return clamp(T, C.RET_MIN, C.RET_MAX);
  };

  P._goHome = function () {
    var z = this.pip, H = CONFIG.HOME;
    if (M.abs(z.x - H.x) < 0.5 && M.abs(z.y - H.y) < 0.5) {
      z.x = H.x; z.y = H.y; z.vx = 0; z.vy = 0; this._fl = null; return false;
    }
    this._takeoff('return', H.x, H.y, World.returnT(z.y, H.y), -1, -1);
    if (z.state !== 'dizzy') { z.state = 'return'; z.t = 0; }
    z.target = null;
    return true;
  };

  P._land = function (f) {
    var z = this.pip, C = CONFIG;
    z.x = f.x1; z.y = f.y1; z.vx = 0; z.vy = 0; z.squash = 1;
    this._fl = null;
    if (f.kind === 'hop') {
      var c = f.hole >= 0 && this.holes[f.hole] ? this.holes[f.hole].critter : null;
      if (c && c.id === f.cid && c.state === 'booped' && c.bounceAt < 0) c.bounceAt = c.t;
      this._standOn = (c && c.id === f.cid) ? f.hole : -1;
      this._ev({ type: 'pipLand', x: z.x, y: z.y, hole: f.hole });
      if (z.state === 'hop') { z.state = 'boop'; z.t = 0; }
      else this._goHome();                       // dazed: bounce straight back home
    } else {
      this._standOn = -1;
      this._ev({ type: 'pipHome', x: z.x, y: z.y });
      if (z.state === 'return') { z.state = 'home'; z.t = 0; z.target = null; }
    }
  };

  P._pip = function (dt) {
    var z = this.pip, C = CONFIG, f = this._fl;
    z.t += dt;
    z.squash = z.squash > 0.001 ? z.squash * M.exp(-C.SQUASH_RATE * dt) : 0;
    var tiltTarget = 0;
    if (f) {
      f.t += dt;
      if (f.t >= f.T) this._land(f);
      else {   // exact parabola (no integration drift)
        z.x = f.x0 + f.vx0 * f.t;
        z.y = f.y0 + f.vy0 * f.t + 0.5 * C.G * f.t * f.t;
        z.vx = f.vx0; z.vy = f.vy0 + C.G * f.t;
        tiltTarget = z.face * M.atan2(z.vy, M.abs(z.vx) + C.TILT_SOFT);
      }
    } else if (z.state === 'boop') {
      // ride the friend's head (its happy bounce lifts Pip a little)
      var o = this._standOn, c = o >= 0 ? this.holes[o].critter : null;
      if (c && c.state === 'booped') { var hp = this.headPoint(o, c.h); z.y = hp.y; }
      if (z.t >= C.BOOP_T) this._goHome();
    } else if (z.state === 'home' || z.state === 'return') {
      var H = C.HOME; z.x = H.x; z.y = H.y; z.vx = 0; z.vy = 0;
      if (z.state === 'return') z.state = 'home';
    }
    if (z.state === 'dizzy') {
      tiltTarget += C.DIZZY_WOBBLE * M.sin(2 * M.PI * C.DIZZY_HZ * z.t) * (1 - 0.5 * M.min(1, z.t / this._dizzyFor));
      if (!this._fl && (z.x !== C.HOME.x || z.y !== C.HOME.y)) this._goHome();
      if (z.t >= this._dizzyFor) {
        if (this._fl) { z.state = this._fl.kind === 'return' ? 'return' : 'hop'; }
        else { z.state = 'home'; z.target = null; }
        z.t = 0;
      }
    }
    tiltTarget = clamp(tiltTarget, -C.TILT_MAX, C.TILT_MAX);
    z.tilt += (tiltTarget - z.tilt) * (1 - M.exp(-C.TILT_RATE * dt));
    z.tilt = clamp(z.tilt, -C.TILT_MAX, C.TILT_MAX);
  };

  P._dizzy = function (dur) {
    var z = this.pip;
    if (z.state === 'boop') { z.state = 'dizzy'; this._goHome(); }
    z.state = 'dizzy'; z.t = 0; z.target = null; this._dizzyFor = dur;
  };

  // ------------------------------------------------------------------ input
  P.holeAt = function (x, y) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < this.holes.length; i++) {
      var h = this.holes[i], dx = x - h.x, dy = y - (h.y - 45 * h.s), d = M.sqrt(dx * dx + dy * dy);
      if (d <= 88 * h.s && d < bd) { bd = d; best = i; }
    }
    return best;
  };

  P.tapAt = function (x, y) {
    var i = this.holeAt(x, y);
    return i < 0 ? 'none' : this.tapHole(i);
  };

  P.tapHole = function (i) {
    if (this.phase !== 'play') return 'none';
    var hole = this.holes[i];
    if (!hole) return 'none';
    if (this.clearing) return 'busy';
    var z = this.pip, C = CONFIG;
    if (z.state === 'dizzy' && z.t < C.DIZZY_LOCK) return 'busy';
    if (this.napT > 0) return 'busy';
    var c = hole.critter, fx = hole.x, fy = hole.y - C.FIREFLY_DY * hole.s;   // (fx, fy) = where the firefly sits
    if (!c || !(c.state === 'rise' || c.state === 'up') || c.h < C.HIT_MIN_H) {
      this._ev({ type: 'empty', x: hole.x, y: hole.y - 45 * hole.s });
      var now = this.time, em = this._empties;
      em.push(now); while (em.length && now - em[0] > C.MASH_WINDOW) em.shift();
      if (em.length >= C.MASH_N) {   // mashing: a short nap (no heart lost)
        em.length = 0; this.napT = C.MASH_NAP; this._resetCombo();
        this._dizzy(C.MASH_NAP);
        this._ev({ type: 'nap', t: C.MASH_NAP });
      }
      return 'empty';
    }
    if (holds(c)) {
      var gold = c.type === 'gold';
      c.state = 'booped'; c.t = 0; c.bounceAt = -1;
      this.combo++; this.boops++; this.levelBoops++;
      this.mult = 1 + (this.combo >= C.MULT_AT[0] ? 1 : 0) + (this.combo >= C.MULT_AT[1] ? 1 : 0);
      var pts = C.POINTS * this.mult * (gold ? C.GOLD_X : 1);
      this.score += pts;
      var s = this.stats; s.boops++; if (this.combo > s.bestCombo) s.bestCombo = this.combo;
      if (gold) { this.golds++; s.golds++; }
      this._hop(i, c);
      this._ev({ type: 'boop', hole: i, gold: gold, points: pts, combo: this.combo, mult: this.mult, x: fx, y: fy });
      if (this.combo % C.COMBO_EVENT_EVERY === 0) this._ev({ type: 'combo', n: this.combo });
      if (this.boops % C.LEAF_EVERY === 0 && this.leaves < this.maxLeaves) {
        this.leaves++; s.leavesGained++;
        this._ev({ type: 'leafGained', leaves: this.leaves });
      }
      if (this.levelBoops >= this.levelGoal) this._levelClear();
      return 'match';
    }
    // a napping friend: oops
    c.state = 'wow'; c.t = 0;
    this.stats.wrong++;
    this._resetCombo();
    this._dizzy(C.DIZZY_T);
    this._ev({ type: 'wrong', hole: i, x: fx, y: fy });
    this._loseLeaf();
    return 'wrong';
  };

  P._levelClear = function () {
    var C = CONFIG;
    this.score += C.CLEAR_BONUS;
    this.stats.levelTimes.push(+(this.time - this.levelStartT).toFixed(3));
    this._ev({ type: 'levelClear', level: this.level, bonus: C.CLEAR_BONUS });
    this.clearing = true; this.clearT = C.CLEAR_T;
    for (var i = 0; i < this.holes.length; i++) {
      var c = this.holes[i].critter;
      if (c && (c.state === 'rise' || c.state === 'up')) this._sink(c);
    }
  };

  // ------------------------------------------------------------------ debug / snapshot
  P.gotoLevel = function (i) {
    this.drainEvents();
    this.phase = this.leaves > 0 ? 'play' : this.phase;
    this._enterLevel(i, true);
  };

  /** force a friend of `type` ('firefly' default | 'gold' | 'sleepy') into burrow i (replaces whatever is there). */
  P.debugSpawn = function (i, type) {
    if (!this.holes[i]) return null;
    if (TYPES.indexOf(type) < 0) type = 'firefly';
    return this._place(i, type);
  };

  P.getState = function () {
    var z = this.pip;
    return {
      phase: this.phase, time: this.time, alpha: this.alpha, difficulty: this.difficulty,
      score: this.score, leaves: this.leaves, maxLeaves: this.maxLeaves,
      level: this.level, zone: this.zone, loop: this.loop, levelBoops: this.levelBoops, levelGoal: this.levelGoal,
      combo: this.combo, mult: this.mult, boops: this.boops, golds: this.golds,
      clearing: this.clearing, napT: this.napT,
      holes: this.holes.map(function (h) {
        var c = h.critter;
        return { x: h.x, y: h.y, s: h.s, critter: c ? { kind: c.kind, type: c.type, state: c.state, h: c.h, hPrev: c.hPrev,
          t: c.t, upFor: c.upFor, id: c.id } : null };
      }),
      pip: { x: z.x, y: z.y, px: z.px, py: z.py, vx: z.vx, vy: z.vy, tilt: z.tilt, face: z.face, state: z.state, t: z.t,
        target: z.target ? { x: z.target.x, y: z.target.y, hole: z.target.hole } : null, squash: z.squash },
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  POG.World = World;
})(window.POG = window.POG || {});
