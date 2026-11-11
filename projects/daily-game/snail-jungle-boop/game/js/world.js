/* Zippy's Jungle Boop — ZJB.World: the headless, deterministic game simulation (DESIGN §5, docs/MECHANICS.md)
 *
 *   var w = new ZJB.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.update(dt);                    // any dt; internally fixed sub-steps of CONFIG.STEP (1/120 s)
 *   w.tapAt(x, y) / w.tapHole(i)     // → 'match' | 'wrong' | 'empty' | 'busy' | 'none'
 *   w.drainEvents()                  // [{ type, ... }] since the last drain
 *   w.getState()                     // plain JSON-able snapshot
 *
 * Coordinates are logical stage px (960×540, y down), time in seconds. No DOM, no Date, no Math.random:
 * everything random comes from ZJB.RNG(seed), so the same seed + the same inputs give the same game.
 *
 * Motion (details and numbers in docs/MECHANICS.md):
 *  - pop height h: 'rise' is a damped spring toward 1 (ζ≈0.63, ωn≈34 rad/s → peak ≈1.08 at ≈0.11 s, settled ≈0.22 s),
 *    'up' keeps the spring (settled), 'sink' eases h0→0 with a cosine in 0.2 s, 'booped' springs to 1 then does a
 *    happy bounce (when Zippy arrives) and sinks after 0.45 s, 'wow' holds surprised for 0.4 s then sinks.
 *  - Zippy flies cubic-Hermite arcs: start velocity = his current velocity + a jetpack lift (so retargets are smooth
 *    and he hops up before swooping down), end velocity = a fraction of the chord speed (he arrives with a bump).
 *    Flight time 0.18–0.30 s by distance. Tilt eases toward the velocity direction, clamped ±0.5 rad.
 */
(function (ZJB) {
  'use strict';
  var M = Math;

  var CONFIG = {
    STEP: 1 / 120,            // s, fixed simulation sub-step
    MAX_DT: 0.5,              // s, longest dt accepted by one update() (anything above is dropped, no spiral of death)
    // --- scoring / rules (DESIGN §5) ---
    POINTS: 10,               // per boop, × mult
    MULT_AT: [5, 10],         // combo thresholds for ×2 and ×3
    COMBO_EVENT_EVERY: 5,     // 'combo' event at 5, 10, 15…
    CLEAR_BONUS: 50,
    LEVEL_GOAL: 15,           // boops per biome
    START_LEAVES: 4, MAX_LEAVES: 5, LEAF_EVERY: 12,
    COLOUR_EVERY: 6,          // boops per colour
    COLOUR_TIME: 14,          // s without a boop → colour changes anyway
    COLOUR_WARN: 1.0,         // s of warning before a change
    GRACE: 1.5,               // s the previous colour is still accepted
    FAIR_T: 1.7,              // s without a visible matching critter → the next spawn matches…
    FAIR_HURRY: 0.35,         // …and comes within 0.35 s (may exceed max up by one)
    MAX_MATCH_STREAK: 2,      // after 2 matching spawns in a row with no decoy up, the next is a decoy
    MASH_N: 3, MASH_WINDOW: 1.0, MASH_NAP: 1.5,   // 3 empty taps within 1 s → Zippy naps 1.5 s (no leaf lost): mashing never beats looking
    HIT_MIN_H: 0.25,          // a critter is tappable in 'rise'/'up' once h ≥ this
    START_DELAY: 1.5,         // s from level start to the first pop
    CLEAR_T: 1.2,             // s of empty field between levelClear and levelUp
    VACATE_GAP: 0.22,         // s, minimum pause after a burrow empties before the next pop
    // --- critter motion ---
    RISE_ZETA: 0.63, RISE_OMEGA: 34,   // damped spring (overshoot e^(−ζπ/√(1−ζ²)) ≈ 7.7 %)
    RISE_T: 0.22,             // s in 'rise' before 'up'
    SINK_T: 0.2,              // s
    BOOP_HOLD: 0.45,          // s in 'booped' before sinking
    BOOP_BOUNCE_AT: 0.2, BOOP_BOUNCE_T: 0.25, BOOP_BOUNCE_A: 0.07,
    WOW_HOLD: 0.4,            // s
    // --- Zippy ---
    HOME: { x: 480, y: 112 },
    TARGET_DY: 160,           // he boops at (bx, by − 160·s): above the friend's head, not over its face
    FLY_MIN: 0.18, FLY_MAX: 0.30, FLY_PER_PX: 0.00028,   // flight time = clamp(MIN + dist·PER_PX)
    LIFT: 260,                // px/s, upward kick added at launch (fades as he is already fast)
    ARRIVE_K: 0.35,           // end speed as a fraction of chord speed
    BOOP_T: 0.18,             // s squash at the target
    RETURN_MIN: 0.42, RETURN_MAX: 0.7, RETURN_PER_PX: 0.0009, RETURN_LIFT: 140,
    TILT_MAX: 0.5, TILT_RATE: 16, TILT_SOFT: 250,         // rad, 1/s, px/s (atan2(vy, |vx| + SOFT))
    DIZZY_T: 0.6, DIZZY_LOCK: 0.35, DIZZY_DRAG: 8, DIZZY_WOBBLE: 0.38, DIZZY_HZ: 3,
    BOB_A: 4, BOB_HZ: 0.8,    // px, Hz hover bob at home
    // --- pacing ---
    LEVEL_SPEEDUP: 0.08,      // per biome within a loop: speed × (1 + 0.08·zone)
    LOOP_SPEEDUP: 0.15,       // per loop: speed × (1 + 0.15·loop), loop capped at 4
    UP_MIN: 0.8, INTERVAL_MIN: 0.4,
    DIFFICULTY: {
      //        up s  spawn s   max up per zone  misses cost  P(match)
      easy:   { up: 2.8, interval: 3.0,  maxUp: [2, 3, 3, 3], missCosts: false, matchP: 0.75 },
      normal: { up: 1.9, interval: 1.8,  maxUp: [3, 3, 4, 4], missCosts: true,  matchP: 0.5 },
      hard:   { up: 1.35, interval: 1.3,  maxUp: [3, 4, 4, 5], missCosts: true,  matchP: 0.42 }
    },
    COLOURS: [[0, 1], [0, 1, 2], [1, 2, 3], [0, 1, 2, 3]]   // colour ids per zone (Coral, Sunny, Sky, Grape)
  };

  function row(y, s, xs) { return xs.map(function (x) { return { x: x, y: y, s: s }; }); }
  var L23 = [].concat(row(280, 0.74, [330, 480, 630]), row(375, 0.87, [250, 480, 710]), row(480, 1.0, [190, 480, 770]));
  var LAYOUTS = [
    [].concat(row(330, 0.86, [280, 480, 680]), row(460, 1.0, [230, 480, 730])),
    [].concat(row(315, 0.84, [225, 395, 565, 735]), row(460, 1.0, [165, 375, 585, 795])),
    L23,
    L23.map(function (h) { return { x: h.x, y: h.y, s: h.s }; })
  ];
  var BIOMES = ['riverbank', 'bamboo', 'canopy', 'ruins'];
  var BIOME_NAMES = ['Riverbank Morning', 'Bamboo Grove', 'Treetop Canopy', 'Waterfall Ruins'];
  var KINDS = ['monkey', 'frog', 'toucan'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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

  var P = World.prototype;

  P.reset = function (seed) {
    if (seed !== undefined) this.seed = seed;
    this.rng = new ZJB.RNG(this.seed);
    this.preset = CONFIG.DIFFICULTY[this.difficulty];
    this.events = [];
    this.phase = 'play';
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.score = 0;
    this.leaves = CONFIG.START_LEAVES; this.maxLeaves = CONFIG.MAX_LEAVES;
    this.combo = 0; this.mult = 1; this.boops = 0; this.napT = 0; this._empties = [];
    this.levelGoal = CONFIG.LEVEL_GOAL;
    this.stats = { boops: 0, wrong: 0, missed: 0, bestCombo: 0, byColour: [0, 0, 0, 0], leavesGained: 0, levelTimes: [] };
    this.nextId = 1;
    var H = CONFIG.HOME;
    this.zippy = { x: H.x, y: H.y, px: H.x, py: H.y, vx: 0, vy: 0, tilt: 0, face: 1, state: 'home', t: 0, target: null };
    this._fl = null;        // current flight { x0,y0,vx0,vy0,x1,y1,vx1,vy1,T }
    this._bobT = 0;
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
    this.colours = CONFIG.COLOURS[this.zone].slice();
    var prev = this.colour;
    this.colour = this.rng.pick(this.colours);
    if (prev !== undefined && this.colours.length > 1 && this.colour === prev) this.colour = this._otherColour(prev);
    this.nextColourIn = CONFIG.COLOUR_EVERY;
    this.colourWarn = false; this.warnT = 0; this.pendingColour = -1;
    this.graceColour = -1; this.graceT = 0;
    this.sinceBoop = 0;
    this.levelBoops = 0;
    this.clearing = false; this.clearT = 0;
    this.spawnT = CONFIG.START_DELAY;
    this.noMatchT = 0; this.matchStreak = 0; this.lastVacated = -1; this.levelPops = 0;
    this.levelStartT = this.time;
    if (emit) this._ev({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop, name: BIOME_NAMES[this.zone] });
  };

  P._ev = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };

  P._otherColour = function (c) {
    var o = [];
    for (var i = 0; i < this.colours.length; i++) if (this.colours[i] !== c) o.push(this.colours[i]);
    return o.length ? this.rng.pick(o) : c;
  };

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
    // previous values for render interpolation
    var z = this.zippy; z.px = z.x; z.py = z.y;
    for (var i = 0; i < this.holes.length; i++) { var c = this.holes[i].critter; if (c) c.hPrev = c.h; }

    if (playing && !this.clearing) this._rules(dt);
    this._critters(dt, playing && !this.clearing);
    this._zippy(dt);

    if (this.clearing) {
      this.clearT -= dt;
      if (this.clearT <= 0) this._enterLevel(this.level + 1, true);
    }
  };

  P._isMatch = function (colour) {
    return colour === this.colour || (this.graceT > 0 && colour === this.graceColour);
  };

  P._rules = function (dt) {
    // grace
    if (this.graceT > 0) { this.graceT -= dt; if (this.graceT <= 0) { this.graceT = 0; this.graceColour = -1; } }
    // colour cadence: every COLOUR_EVERY boops, or COLOUR_TIME s without a boop; 1 s warning first
    this.sinceBoop += dt;
    if (!this.colourWarn) {
      if (this.nextColourIn <= 0 || this.sinceBoop >= CONFIG.COLOUR_TIME - CONFIG.COLOUR_WARN) {
        this.colourWarn = true; this.warnT = CONFIG.COLOUR_WARN;
        this.pendingColour = this._pickNextColour();
        this._ev({ type: 'colourWarn', to: this.pendingColour });
      }
    } else {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        var from = this.colour;
        this.colour = this.pendingColour;
        this.graceColour = from; this.graceT = CONFIG.GRACE;
        this.nextColourIn = CONFIG.COLOUR_EVERY; this.sinceBoop = 0;
        this.colourWarn = false; this.warnT = 0; this.pendingColour = -1;
        this.matchStreak = 0;
        this._ev({ type: 'colour', from: from, to: this.colour });
      }
    }
    // fairness clock: time since a matching critter was last visible (rise/up)
    var vis = false, live = 0, decoyUp = false;
    for (var i = 0; i < this.holes.length; i++) {
      var c = this.holes[i].critter;
      if (!c) continue;
      if (c.state === 'rise' || c.state === 'up') {
        live++;
        if (c.colour === this.colour) vis = true; else decoyUp = true;
      } else if (c.state !== 'sink') live++;
    }
    this.noMatchT = vis ? 0 : this.noMatchT + dt;
    this._decoyUp = decoyUp;
    // spawning
    this.spawnT -= dt;
    var max = this.preset.maxUp[this.zone];
    var fair = this.noMatchT >= CONFIG.FAIR_T;
    if (fair && this.spawnT > CONFIG.FAIR_HURRY) this.spawnT = CONFIG.FAIR_HURRY;
    if (this.spawnT <= 0 && (live < max || (fair && live < max + 1))) {
      var first = this.levelPops === 0;               // the first pop of every level is a matching one
      if (this._spawn(fair || first ? this.colour : -1) >= 0) {
        this.levelPops++;
        var iv = M.max(CONFIG.INTERVAL_MIN, this.preset.interval / this.speed());
        this.spawnT = iv * this.rng.range(0.8, 1.2);
        if (fair) this.noMatchT = 0;
      }
    }
  };

  P._pickNextColour = function () {
    // prefer a colour that is already up, so the new target is visible straight away
    var up = [];
    for (var i = 0; i < this.holes.length; i++) {
      var c = this.holes[i].critter;
      if (c && (c.state === 'rise' || c.state === 'up') && c.colour !== this.colour && up.indexOf(c.colour) < 0) up.push(c.colour);
    }
    up.sort();
    return up.length ? this.rng.pick(up) : this._otherColour(this.colour);
  };

  /** pop a critter into a free burrow; colour −1 = choose by the spawn rules. Returns the hole index or −1. */
  P._spawn = function (colour) {
    var free = [], i;
    for (i = 0; i < this.holes.length; i++) if (!this.holes[i].critter && i !== this.lastVacated) free.push(i);
    if (!free.length && this.lastVacated >= 0 && !this.holes[this.lastVacated].critter) free.push(this.lastVacated);
    if (!free.length) return -1;
    var hi = this.rng.pick(free);
    if (colour < 0) {
      var wantMatch;
      if (this.matchStreak >= CONFIG.MAX_MATCH_STREAK && !this._decoyUp) wantMatch = false;
      else wantMatch = this.rng.chance(this.preset.matchP);
      colour = wantMatch ? this.colour : this._otherColour(this.colour);
    }
    this.matchStreak = colour === this.colour ? this.matchStreak + 1 : 0;
    this._place(hi, colour);
    return hi;
  };

  P._place = function (hi, colour) {
    var up = M.max(CONFIG.UP_MIN, this.preset.up / this.speed()) * this.rng.range(0.88, 1.12);
    var c = { kind: this.rng.pick(KINDS), colour: colour, state: 'rise', h: 0, hPrev: 0, hs: 0, v: 0, t: 0, upFor: up, id: this.nextId++ };
    this.holes[hi].critter = c;
    this._ev({ type: 'pop', hole: hi, kind: c.kind, colour: colour });
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
          if (c.colour === this.colour) {
            this.stats.missed++;
            this._ev({ type: 'miss', hole: i, colour: c.colour });
            if (this.preset.missCosts) { this._resetCombo(); this._loseLeaf(); }
          }
        }
      } else if (st === 'booped') {
        var u = (c.t - C.BOOP_BOUNCE_AT) / C.BOOP_BOUNCE_T;
        if (u > 0 && u < 1) c.h = c.hs + C.BOOP_BOUNCE_A * M.sin(M.PI * u) * (1 - 0.4 * u);
        if (c.t >= C.BOOP_HOLD) this._sink(c);
      } else if (st === 'wow') {
        if (c.t >= C.WOW_HOLD) this._sink(c);
      } else if (st === 'sink') {
        var s = M.min(1, c.t / C.SINK_T);
        c.h = c.h0 * (0.5 + 0.5 * M.cos(M.PI * s));
        if (s >= 1) {
          hole.critter = null; this.lastVacated = i;
          if (this.spawnT < C.VACATE_GAP && this.noMatchT < C.FAIR_T) this.spawnT = C.VACATE_GAP;
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
      this.colourWarn = false;
      this._ev({ type: 'gameOver', score: this.score });
    }
  };

  // ------------------------------------------------------------------ Zippy
  P._launch = function (tx, ty, hole) {
    var z = this.zippy, C = CONFIG;
    var dx = tx - z.x, dy = ty - z.y, dist = M.sqrt(dx * dx + dy * dy);
    var T = clamp(C.FLY_MIN + dist * C.FLY_PER_PX, C.FLY_MIN, C.FLY_MAX);
    var sp = M.sqrt(z.vx * z.vx + z.vy * z.vy);
    var lift = C.LIFT * M.max(0, 1 - sp / 900);
    this._fl = { x0: z.x, y0: z.y, vx0: z.vx, vy0: z.vy - lift, x1: tx, y1: ty,
      vx1: dx / T * C.ARRIVE_K, vy1: dy / T * C.ARRIVE_K, T: T };
    z.state = 'fly'; z.t = 0; z.target = { x: tx, y: ty, hole: hole };
    this._ev({ type: 'zippyLaunch', x: tx, y: ty });
  };

  P._goHome = function () {
    var z = this.zippy, C = CONFIG, H = C.HOME;
    var dx = H.x - z.x, dy = H.y - z.y, dist = M.sqrt(dx * dx + dy * dy);
    if (dist < 1) { z.state = 'home'; z.t = 0; z.target = null; this._fl = null; return; }
    var T = clamp(C.RETURN_MIN + dist * C.RETURN_PER_PX, C.RETURN_MIN, C.RETURN_MAX);
    this._fl = { x0: z.x, y0: z.y, vx0: z.vx * 0.3, vy0: z.vy * 0.3 - C.RETURN_LIFT, x1: H.x, y1: H.y, vx1: 0, vy1: 0, T: T };
    z.state = 'return'; z.t = 0; z.target = null;
  };

  /** cubic Hermite position + velocity at time t of flight f */
  function hermite(f, t, out) {
    var T = f.T, u = clamp(t / T, 0, 1), u2 = u * u, u3 = u2 * u;
    var a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u, c = -2 * u3 + 3 * u2, d = u3 - u2;
    out.x = a * f.x0 + b * T * f.vx0 + c * f.x1 + d * T * f.vx1;
    out.y = a * f.y0 + b * T * f.vy0 + c * f.y1 + d * T * f.vy1;
    var da = 6 * u2 - 6 * u, db = 3 * u2 - 4 * u + 1, dc = -da, dd = 3 * u2 - 2 * u;
    out.vx = (da * f.x0 + dc * f.x1) / T + db * f.vx0 + dd * f.vx1;
    out.vy = (da * f.y0 + dc * f.y1) / T + db * f.vy0 + dd * f.vy1;
    return u >= 1;
  }
  var tmp = { x: 0, y: 0, vx: 0, vy: 0 };

  P._zippy = function (dt) {
    var z = this.zippy, C = CONFIG, H = C.HOME;
    z.t += dt;
    var tiltTarget = 0;
    if (z.state === 'fly' || z.state === 'return') {
      var done = hermite(this._fl, z.t, tmp);
      z.x = tmp.x; z.y = tmp.y; z.vx = tmp.vx; z.vy = tmp.vy;
      if (done) {
        if (z.state === 'fly') {
          z.x = this._fl.x1; z.y = this._fl.y1; z.vx = 0; z.vy = 0;
          z.state = 'boop'; z.t = 0;
          this._ev({ type: 'zippyArrive', x: z.x, y: z.y });
        } else {
          z.x = H.x; z.y = H.y; z.vx = 0; z.vy = 0; z.state = 'home'; z.t = 0; this._fl = null; this._bobT = 0;
        }
      } else {
        tiltTarget = z.face * M.atan2(z.vy, M.abs(z.vx) + C.TILT_SOFT);
      }
    } else if (z.state === 'boop') {
      if (z.t >= C.BOOP_T) this._goHome();
    } else if (z.state === 'dizzy') {
      var drag = M.exp(-C.DIZZY_DRAG * dt);
      z.vx *= drag; z.vy *= drag;
      z.x += z.vx * dt; z.y += z.vy * dt;
      tiltTarget = C.DIZZY_WOBBLE * M.sin(2 * M.PI * C.DIZZY_HZ * z.t) * (1 - 0.5 * z.t / C.DIZZY_T);
      if (z.t >= C.DIZZY_T) this._goHome();
    } else { // home: hover bob
      this._bobT += dt;
      var ny = H.y + C.BOB_A * M.sin(2 * M.PI * C.BOB_HZ * this._bobT);
      z.vx = 0; z.vy = (ny - z.y) / dt; z.x = H.x; z.y = ny;
    }
    if (M.abs(z.vx) > 30) z.face = z.vx > 0 ? 1 : -1;
    tiltTarget = clamp(tiltTarget, -C.TILT_MAX, C.TILT_MAX);
    z.tilt += (tiltTarget - z.tilt) * (1 - M.exp(-C.TILT_RATE * dt));
    z.tilt = clamp(z.tilt, -C.TILT_MAX, C.TILT_MAX);
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
    var z = this.zippy, C = CONFIG;
    if (z.state === 'dizzy' && z.t < C.DIZZY_LOCK) return 'busy';
    if (this.napT > 0) return 'busy';
    var c = hole.critter, sx = hole.x, sy = hole.y - 29 * hole.s;   // (sx, sy) = where the star sits
    if (!c || !(c.state === 'rise' || c.state === 'up') || c.h < C.HIT_MIN_H) {
      this._ev({ type: 'empty', x: hole.x, y: hole.y - 45 * hole.s });
      var now = this.time, em = this._empties;
      em.push(now); while (em.length && now - em[0] > C.MASH_WINDOW) em.shift();
      if (em.length >= C.MASH_N) {   // mashing: a short nap (no leaf lost)
        em.length = 0; this.napT = C.MASH_NAP; this._resetCombo();
        z.state = 'dizzy'; z.t = 0; z.target = null; this._fl = null;
        this._ev({ type: 'nap', t: C.MASH_NAP });
      }
      return 'empty';
    }
    if (this._isMatch(c.colour)) {
      c.state = 'booped'; c.t = 0;
      this.combo++; this.boops++; this.levelBoops++;
      this.mult = 1 + (this.combo >= C.MULT_AT[0] ? 1 : 0) + (this.combo >= C.MULT_AT[1] ? 1 : 0);
      var pts = C.POINTS * this.mult;
      this.score += pts;
      var s = this.stats; s.boops++; s.byColour[c.colour]++; if (this.combo > s.bestCombo) s.bestCombo = this.combo;
      this.sinceBoop = 0;
      if (this.nextColourIn > 0) this.nextColourIn--;
      this._launch(hole.x, hole.y - C.TARGET_DY * hole.s, i);
      this._ev({ type: 'boop', hole: i, colour: c.colour, points: pts, combo: this.combo, mult: this.mult, x: sx, y: sy });
      if (this.combo % C.COMBO_EVENT_EVERY === 0) this._ev({ type: 'combo', n: this.combo });
      if (this.boops % C.LEAF_EVERY === 0 && this.leaves < this.maxLeaves) {
        this.leaves++; s.leavesGained++;
        this._ev({ type: 'leafGained', leaves: this.leaves });
      }
      if (this.levelBoops >= this.levelGoal) this._levelClear();
      return 'match';
    }
    // wrong colour
    c.state = 'wow'; c.t = 0;
    this.stats.wrong++;
    this._resetCombo();
    var sp = M.sqrt(z.vx * z.vx + z.vy * z.vy);
    z.state = 'dizzy'; z.t = 0; z.target = null; this._fl = null;
    if (sp < 1) { z.vx = 0; z.vy = 0; }
    this._ev({ type: 'wrong', hole: i, x: sx, y: sy });
    this._loseLeaf();
    return 'wrong';
  };

  P._levelClear = function () {
    var C = CONFIG;
    this.score += C.CLEAR_BONUS;
    this.stats.levelTimes.push(+(this.time - this.levelStartT).toFixed(3));
    this._ev({ type: 'levelClear', level: this.level, bonus: C.CLEAR_BONUS });
    this.clearing = true; this.clearT = C.CLEAR_T;
    this.colourWarn = false; this.warnT = 0; this.pendingColour = -1;
    this.graceT = 0; this.graceColour = -1;
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

  /** force a critter of `colour` (default: Zippy's colour) into burrow i (replaces whatever is there). */
  P.debugSpawn = function (i, colour) {
    if (!this.holes[i]) return null;
    if (colour === undefined || colour === null || colour < 0) colour = this.colour;
    return this._place(i, colour | 0);
  };

  P.getState = function () {
    var z = this.zippy;
    return {
      phase: this.phase, time: this.time, alpha: this.alpha, difficulty: this.difficulty,
      score: this.score, leaves: this.leaves, maxLeaves: this.maxLeaves,
      level: this.level, zone: this.zone, loop: this.loop, levelBoops: this.levelBoops, levelGoal: this.levelGoal,
      combo: this.combo, mult: this.mult, boops: this.boops,
      colour: this.colour, colours: this.colours.slice(), nextColourIn: this.nextColourIn, colourWarn: this.colourWarn,
      graceColour: this.graceColour, graceT: this.graceT, clearing: this.clearing, napT: this.napT,
      holes: this.holes.map(function (h) {
        var c = h.critter;
        return { x: h.x, y: h.y, s: h.s, critter: c ? { kind: c.kind, colour: c.colour, state: c.state, h: c.h, hPrev: c.hPrev,
          t: c.t, upFor: c.upFor, id: c.id } : null };
      }),
      zippy: { x: z.x, y: z.y, px: z.px, py: z.py, vx: z.vx, vy: z.vy, tilt: z.tilt, face: z.face, state: z.state, t: z.t,
        target: z.target ? { x: z.target.x, y: z.target.y, hole: z.target.hole } : null },
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  ZJB.World = World;
})(window.ZJB = window.ZJB || {});
