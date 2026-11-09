/* Finn's Island Fling — FIF.World: the headless, deterministic game simulation (DESIGN §5)
 *
 *   var w = new FIF.World({ seed: 1, difficulty: 'easy', level: 0, day: 0.12 });
 *   w.aim(dx, dy);        // pull offset from the sling anchor (world u); the fox sits at sling + pull
 *   w.release();          // fling (or cancel if the pull is tiny)
 *   w.flutter();          // once per flight: a small lift
 *   w.update(dt);         // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction for render lerp
 *   w.drainEvents();      // [{type:'launch', power}, …]
 *
 * Units: u (≈ 1 m) and seconds; x grows right, y grows UP; the sea surface is y = 0. No pixels in here.
 * Rotations (fox.rot) are radians in WORLD convention (y up, counter-clockwise positive, 0 = facing right):
 * draw with ctx.rotate(-rot) on a y-down canvas.
 * Everything that moves keeps p* values (saved at the start of each sub-step) so the renderer can lerp with alpha.
 *
 * Raft, gulls and leaves move as pure functions of their own clocks (raft.t, gull.t, leaf.t). That is what lets
 * predictShot() (used by FIF.Bot and the tests) replay the future exactly with the very same step code.
 *
 * CONFIG (units → why):
 *   STEP 1/120 s ............. fixed sub-step: at 14 u/s the fox moves 0.12 u per step (< leaf radius, exact hits)
 *   G 9 u/s² ................. a little lighter than Earth: flights of 1.4–2.2 s read as "wheee… plop", not a dart
 *   VMAX 14 u/s .............. full pull speed: 45° on flat ground would carry 21 u, so 1/2–2/3 pulls reach the raft
 *   PULL_MAX 1.8 u ........... band stretch at full power (≈ 1.4 fox heights: a big, visible rubber band)
 *   PULL_MIN 0.3 u ........... a smaller pull is a cancel (a stray tap never fires)
 *   PULL_DOWN 1.4 u .......... the fox never goes lower than sling.y − 1.4 (stays above the rock)
 *   PULL_FWD 0 u ............. the fox can't be pulled in front of the fork: every fling goes RIGHT (kids)
 *   FLUTTER_VY 3.2 u/s ....... vy = max(vy,0) + 3.2: +0.57 u of rise and ≈ 0.7 s of hang time — rescues a short shot
 *   R_FOX 0.45, R_LEAF 0.35 u  pickup when the centres are < 0.8 u apart (generous: a near miss still counts)
 *   FOOT 0.49 u .............. body centre → feet (art: feet line y 112 of a 128 box drawn 1.3 u)
 *   LAND_PAD 0.15 u .......... a landing counts while |x − raft.x| ≤ hw + 0.15 (toes on the edge)
 *   BUMP_E 0.7 ............... gull bounce restitution: a soft "boing", the fox keeps most of its speed
 *   GULL_R 0.42 u ............ gull hit circle (art 1.2 × 0.8 u)
 *   ROCK_X 4.6, ROCK_TOP 1.2 u a weak fling that comes down on the beach rock is a harmless 'flop' (retry)
 *   OUT_L −1, OUT_R 17.5 u ... leaving the field sideways counts as a splash
 *   RAFT_TOP 0.35 u .......... deck top (DESIGN §2); the bob is visual only
 *   RAFT_GLIDE 0.9 s ......... the raft glides (smoothstep) to its new spot after each shot — no teleports
 *   LAND_T 1.0 s, SPLASH_T 1.2 s, FLOP_T 0.8 s … how long each outcome is shown before the next shot
 *   LAND_KEEP 0.3 ............ share of vx kept on touchdown (the rest is absorbed by the legs)
 *   FRICTION 5 u/s² .......... deck friction: a 1.3 u/s slide stops in ≈ 0.17 u (never off a small raft)
 *   ROT_RATE 7 /s ............ fox nose eases toward the velocity angle (≈ 0.14 s lag: smooth, not twitchy)
 *   BONK_T 0.5 s, BONK_SPIN 11 rad/s, BONK_DRAG 4 /s … after a gull bump: a short tumble that slows down
 *   FLUTTER_T 0.45 s ......... 'flutter' frame duration
 *   SPLASH_SINK 0.2 u, SINK_RATE 6 /s … after a splash the body centre eases to y 0.2 (the frame's water line)
 *   LEAF_BOB 0.06 u / 2.2 s .. leaves hover gently (always within the 0.8 u pickup tolerance of their arc)
 *   GULL_SPEED [0.5, 0.9] u/s  slow drifting gulls (cross the field in ≈ 20–35 s); GULL_Y [2.5, 5.5] band
 *   GULL_BOB 0.18 u / 3 s .... gentle glide wobble; GULL_CLEAR_X 5.4 / _Y 5.2 … gulls climb over the palm sling
 *   MIN_RAFT_DX 5 u .......... the raft never comes closer than 5 u to the sling (always a real fling)
 *   LEAF_Y [1.0, 6.8] u ...... leaves stay in the visible, calm band; LEAF_MIN_X 4.4 u keeps them off the rock/sling
 *   LEAF_GAP 0.9 u ........... min distance between leaves (each one is its own little "ding")
 *   ARC_ANG [34, 64]° ........ angles tried for the solution arc; ARC_APEX 6.5 u max apex (leaves must fit ≤ 6.8)
 *   LANDINGS_PER_LEVEL 5 ..... five landings per island, then the next island
 *   HEART_EVERY 20 ........... every 20 leaves give a heart back (capped at maxHearts)
 *   DAY_LEN 150 s, DAY_START 0.12 … a 2½ min day; a run starts at full daylight
 *   DAWN_END 0.12, DUSK [0.55, 0.70] … light: dawn ramp 0–0.12, day, dusk ramp, night 0.70–1 (smoothstep ramps)
 *   NIGHT_LIGHT 0.3, NIGHT_AT 0.55 … darkest light; isNight while light < 0.55
 *   NIGHT_PREVIEW 0.6 ........ the preview is 60 % as long at full night (scaled smoothly with light)
 *   PREVIEW_DT 0.06 s ........ time between preview dots (34 dots ≈ 2 s = a whole flight on Sunny Cove)
 *   POINTS leaf 1 / moon 2, land 2, bull +3, streak +1 per step (max +4)
 *   LOOP_CAP 3 ............... loops get harder up to loop 3, then stay (always playable)
 *   DIFF.*: hearts, hwK (raft width ×), bullK, ampK (drift ×), previewK, gullK (gull count +), gullSpeedK
 *   LEVELS[zone]: x [min, max] raft range incl. drift, hw u, bull u, amp u, period s, gulls, PREVIEW dots
 */
(function (FIF) {
  'use strict';
  var M = Math, TAU = M.PI * 2, DEG = M.PI / 180;

  var CONFIG = {
    STEP: 1 / 120, SEA_Y: 0, FIELD_W: 16, FIELD_H: 9,
    SLING: { x: 2.3, y: 2.9 },
    G: 9, VMAX: 14, PULL_MAX: 1.8, PULL_MIN: 0.3, PULL_DOWN: 1.4, PULL_FWD: 0,
    FLUTTER_VY: 3.2, R_FOX: 0.45, R_LEAF: 0.35, FOOT: 0.49, LAND_PAD: 0.15,
    BUMP_E: 0.7, GULL_R: 0.42, ROCK_X: 4.6, ROCK_TOP: 1.2, OUT_L: -1, OUT_R: 17.5,
    RAFT_TOP: 0.35, RAFT_GLIDE: 0.9,
    LAND_T: 1.0, SPLASH_T: 1.2, FLOP_T: 0.8, LAND_KEEP: 0.3, FRICTION: 5, DECK_EDGE: 0.25,
    ROT_RATE: 7, BONK_T: 0.5, BONK_SPIN: 11, BONK_DRAG: 4, FLUTTER_T: 0.45,
    SPLASH_SINK: 0.2, SINK_RATE: 6, MAX_FLIGHT: 8,
    LEAF_BOB: 0.06, LEAF_BOB_T: 2.2,
    GULL_SPEED: [0.5, 0.9], GULL_Y: [2.5, 5.5], GULL_BOB: 0.18, GULL_BOB_T: 3.0,
    GULL_CLEAR_X: 5.4, GULL_CLEAR_Y: 5.2, GULL_FLAP: 2.5,
    MIN_RAFT_DX: 5, LEAF_Y: [1.0, 6.8], LEAF_MIN_X: 4.4, LEAF_GAP: 0.9,
    ARC_ANG: [34, 64], ARC_APEX: 6.5,
    LANDINGS_PER_LEVEL: 5, HEART_EVERY: 20,
    DAY_LEN: 150, DAY_START: 0.12, DAWN_END: 0.12, DUSK: [0.55, 0.70], NIGHT_LIGHT: 0.3, NIGHT_AT: 0.55,
    NIGHT_PREVIEW: 0.6, PREVIEW_DT: 0.06,
    POINTS: { leaf: 1, moon: 2, land: 2, bull: 3, streakMax: 4 },
    LOOP_CAP: 3, LOOP_HW: 0.06, LOOP_AMP: 0.15, LOOP_PREVIEW: 0.08, LOOP_PERIOD: 0.06
  };

  var DIFF = {
    easy:   { hearts: 5, hwK: 1.15, bullK: 1.2, ampK: 0.7,  previewK: 1.25, gullK: 0, gullSpeedK: 0.8 },
    normal: { hearts: 3, hwK: 1.0,  bullK: 1.0, ampK: 1.0,  previewK: 1.0,  gullK: 0, gullSpeedK: 1.0 },
    hard:   { hearts: 3, hwK: 0.85, bullK: 0.85, ampK: 1.25, previewK: 0.75, gullK: 1, gullSpeedK: 1.2 }
  };

  var LEVELS = [
    { key: 'cove',    name: 'Sunny Cove',   x: [8.0, 12.5], hw: 1.7,  bull: 0.45, amp: 0,   period: 7.0, gulls: 0, PREVIEW: 34 },
    { key: 'jungle',  name: 'Jungle Isle',  x: [8.0, 13.5], hw: 1.5,  bull: 0.4,  amp: 0.7, period: 6.5, gulls: 0, PREVIEW: 24 },
    { key: 'lagoon',  name: 'Coral Lagoon', x: [8.5, 14.0], hw: 1.3,  bull: 0.35, amp: 0.85, period: 5.5, gulls: 1, PREVIEW: 18 },
    { key: 'lantern', name: 'Lantern Bay',  x: [9.0, 14.3], hw: 1.2,  bull: 0.32, amp: 0.95, period: 5.2, gulls: 2, PREVIEW: 13 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function wrapAng(a) { while (a > M.PI) a -= TAU; while (a < -M.PI) a += TAU; return a; }

  /** daylight for a day phase d ∈ [0,1): smooth dawn ramp, full day, smooth dusk ramp, night */
  function lightAt(d) {
    var C = CONFIG, N = C.NIGHT_LIGHT;
    d = d - M.floor(d);
    if (d < C.DAWN_END) return N + (1 - N) * smooth(d / C.DAWN_END);
    if (d < C.DUSK[0]) return 1;
    if (d < C.DUSK[1]) return 1 - (1 - N) * smooth((d - C.DUSK[0]) / (C.DUSK[1] - C.DUSK[0]));
    return N;
  }

  /** the velocity a pull would give: v = −pull / PULL_MAX · VMAX (pull clamped like aim()) */
  function launchVelocity(dx, dy) {
    var C = CONFIG, p = clampPull(dx, dy);
    return { vx: -p.x / C.PULL_MAX * C.VMAX, vy: -p.y / C.PULL_MAX * C.VMAX };
  }
  function clampPull(dx, dy) {
    var C = CONFIG;
    dx = M.min(+dx || 0, C.PULL_FWD); dy = M.max(+dy || 0, -C.PULL_DOWN);
    var L = M.sqrt(dx * dx + dy * dy);
    if (L > C.PULL_MAX) { dx *= C.PULL_MAX / L; dy *= C.PULL_MAX / L; }
    return { x: dx, y: dy };
  }
  /** pull that gives speed v in direction ang (radians); null if the pull limits can't produce it */
  function pullFor(ang, v) {
    var C = CONFIG, k = C.PULL_MAX / C.VMAX;
    if (v > C.VMAX + 1e-9 || v <= 0) return null;
    var p = { x: -M.cos(ang) * v * k, y: -M.sin(ang) * v * k };
    if (p.x > C.PULL_FWD + 1e-9 || p.y < -C.PULL_DOWN - 1e-9) return null;
    return p;
  }
  /** analytic: time when the body centre comes DOWN through height yc for a launch (x0,y0,vx,vy); null if never */
  function timeDownTo(y0, vy, yc) {
    var g = CONFIG.G, disc = vy * vy + 2 * g * (y0 - yc);
    if (disc < 0) return null;
    return (vy + M.sqrt(disc)) / g;
  }
  /** analytic speed that lands a launch at angle ang (from the sling) at x = X with the centre at height yc.
   *  Bisection on v (landing x grows with v). Returns {v, T, pull, apex} or null. */
  function solveSpeed(ang, X, yc) {
    var C = CONFIG, S = C.SLING, k = C.PULL_MAX / C.VMAX, c = M.cos(ang), s = M.sin(ang);
    function landX(v) {
      var x0 = S.x - c * v * k, y0 = S.y - s * v * k, T = timeDownTo(y0, v * s, yc);
      return T === null ? -1e9 : x0 + v * c * T;
    }
    var vmax = C.VMAX;
    if (s > 0) vmax = M.min(vmax, C.PULL_DOWN / (s * k));
    var lo = C.PULL_MIN / k, hi = vmax;
    if (landX(hi) < X || landX(lo) > X) return null;
    for (var i = 0; i < 40; i++) { var mid = 0.5 * (lo + hi); if (landX(mid) < X) lo = mid; else hi = mid; }
    var v = 0.5 * (lo + hi), x0 = S.x - c * v * k, y0 = S.y - s * v * k, vy = v * s;
    return { v: v, T: timeDownTo(y0, vy, yc), pull: pullFor(ang, v), x0: x0, y0: y0, vx: v * c, vy: vy,
      apex: vy > 0 ? y0 + vy * vy / (2 * C.G) : y0 };
  }

  // ---------- moving things: pure functions of their own clock ----------
  function raftX(r, t) {
    var base = r.fromX + (r.baseX - r.fromX) * smooth(t / CONFIG.RAFT_GLIDE);
    return base + (r.amp > 0 ? r.amp * M.sin(TAU * t / r.period + r.phase) : 0);
  }
  function gullPos(g, t, out) {
    var C = CONFIG, span = C.OUT_R - C.OUT_L + 1, x = g.x0 + g.vx * t;
    x = C.OUT_L - 0.5 + (((x - (C.OUT_L - 0.5)) % span) + span) % span;       // wrap off-screen on both sides
    var y = g.baseY + C.GULL_BOB * M.sin(TAU * t / C.GULL_BOB_T + g.ph);
    var lift = 1 - smooth((x - C.GULL_CLEAR_X) / 1.6);                         // climb over the palm sling
    if (lift > 0) y = M.max(y, y + (C.GULL_CLEAR_Y - y) * lift);
    out.x = x; out.y = y;
    return out;
  }
  function leafY(l, t) { return l.y0 + CONFIG.LEAF_BOB * M.sin(TAU * t / CONFIG.LEAF_BOB_T + l.ph); }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.DIFF = DIFF;
  World.LEVELS = LEVELS;
  World.lightAt = lightAt;
  World.solveSpeed = solveSpeed;
  World.pullFor = pullFor;
  World.raftX = raftX;
  World.prototype.launchVelocity = function (dx, dy) { return launchVelocity(dx, dy); };
  World.prototype.setLayout = function () {};       // the world has no pixels

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.seed = opts.seed === undefined || opts.seed === null ? 1 : opts.seed;
    this.difficulty = DIFF[opts.difficulty] ? opts.difficulty : 'easy';
    this.D = DIFF[this.difficulty];
    this.rng = new FIF.RNG(this.seed);
    this.rRaft = this.rng.fork('raft'); this.rLeaf = this.rng.fork('leaf'); this.rGull = this.rng.fork('gull');
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.events = [];
    this._id = 1;
    this.level = M.max(0, opts.level | 0);
    this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.score = 0; this.leafCount = 0; this.landings = 0; this.levelLandings = 0; this.shots = 0;
    this.streak = 0; this.bestStreak = 0;
    this.hearts = this.maxHearts = this.D.hearts;
    this.stats = { leaves: 0, moonLeaves: 0, landings: 0, bulls: 0, splashes: 0, flutters: 0, bumps: 0, hearts: 0,
      shots: 0, maxStreak: 0, flops: 0 };
    var d0 = opts.day === undefined || opts.day === null || !isFinite(+opts.day) ? C.DAY_START : +opts.day;
    this.dayT = d0 - M.floor(d0);
    this.light = lightAt(this.dayT);
    this.isNight = this.light < C.NIGHT_AT;
    this.sling = { x: C.SLING.x, y: C.SLING.y };
    this.pull = null; this.fluttered = false;
    this.fox = { x: C.SLING.x, y: C.SLING.y, vx: 0, vy: 0, px: C.SLING.x, py: C.SLING.y, rot: 0, prot: 0, state: 'sit',
      spin: 0, bonkT: 0, flutT: 0, flightT: 0 };
    this.raft = null;
    this.leaves = []; this.gulls = [];
    this._pulled = false;
    this._setLevel(this.level, true);
    this._newShot(true);
  };

  /** effective level parameters for a level index (zone table × difficulty × loop) */
  World.prototype.levelParams = function (level) {
    var C = CONFIG, D = this.D, L = LEVELS[level % 4], lp = M.min(M.floor(level / 4), C.LOOP_CAP);
    var hw = L.hw * D.hwK * (1 - C.LOOP_HW * lp);
    var amp = L.amp * D.ampK * (1 + C.LOOP_AMP * lp);
    if (L.amp === 0 && lp > 0) amp = 0.3 * lp * D.ampK;                     // later loops: even the cove drifts a bit
    var xmin = M.max(L.x[0], C.SLING.x + C.MIN_RAFT_DX), xmax = M.min(L.x[1], C.FIELD_W - hw - 0.2);
    amp = M.min(amp, M.max(0, (xmax - xmin) / 2 - 0.3));
    return {
      key: L.key, name: L.name, xmin: xmin, xmax: xmax, hw: hw, bull: L.bull * D.bullK,
      amp: amp, period: L.period * (1 - C.LOOP_PERIOD * lp),
      gulls: L.gulls + (L.gulls > 0 || lp > 0 ? D.gullK : 0) + (lp >= 2 && L.gulls === 0 ? 1 : 0),
      preview: L.PREVIEW * D.previewK * (1 - C.LOOP_PREVIEW * lp)
    };
  };

  World.prototype._setLevel = function (level, quiet) {
    this.level = level; this.zone = level % 4; this.loop = M.floor(level / 4);
    this.P = this.levelParams(level);
    this.levelLandings = 0;
    this._spawnGulls();
    if (!quiet) this._emit({ type: 'levelUp', zone: this.zone, level: this.level, loop: this.loop });
  };

  World.prototype._spawnGulls = function () {
    var C = CONFIG, r = this.rGull, n = this.P.gulls;
    this.gulls = [];
    for (var i = 0; i < n; i++) {
      var dir = r.sign(), sp = r.range(C.GULL_SPEED[0], C.GULL_SPEED[1]) * this.D.gullSpeedK;
      var band = (C.GULL_Y[1] - C.GULL_Y[0]) / n;
      var g = { id: this._id++, x0: r.range(6.5, 15) + i * 3.7, vx: dir * sp, baseY: C.GULL_Y[0] + band * (i + r.range(0.2, 0.8)),
        ph: r.range(0, TAU), t: 0, r: C.GULL_R, flap: 0, x: 0, y: 0, px: 0, py: 0 };
      gullPos(g, 0, g); g.px = g.x; g.py = g.y;
      this.gulls.push(g);
    }
  };

  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ---------- new shot: raft spot + leaves on a solution arc ----------
  World.prototype._newShot = function (first) {
    var C = CONFIG, P = this.P, r = this.rRaft, fox = this.fox;
    this.phase = 'aim'; this.phaseT = 0;
    this.pull = null; this.fluttered = false; this._pulled = false;
    fox.x = fox.px = this.sling.x; fox.y = fox.py = this.sling.y;
    fox.vx = fox.vy = 0; fox.rot = fox.prot = 0; fox.spin = 0; fox.bonkT = 0; fox.flutT = 0; fox.flightT = 0;
    fox.state = 'sit';
    var lo = P.xmin + P.amp, hi = P.xmax - P.amp, base = lo < hi ? r.range(lo, hi) : 0.5 * (P.xmin + P.xmax);
    var old = this.raft, fromX = first || !old ? base : old.x;
    this.raft = { x: fromX, px: fromX, top: C.RAFT_TOP, hw: P.hw, bull: P.bull, baseX: base, fromX: fromX,
      amp: P.amp, period: P.period, phase: r.chance(0.5) ? 0 : M.PI, t: 0 };   // sin(phase) = 0: x(0) = fromX, no jump
    this.raft.x = this.raft.px = raftX(this.raft, 0);
    this._makeLeaves();
    if (!first) this._emit({ type: 'newShot' });
  };

  World.prototype._makeLeaves = function () {
    var C = CONFIG, r = this.rLeaf, raft = this.raft, yc = raft.top + C.FOOT, moon = this.isNight;
    this.leaves = [];
    var sol = null, tries = 0;
    while (!sol && tries++ < 24) {
      var ang = r.range(C.ARC_ANG[0], C.ARC_ANG[1]) * DEG, X = raft.baseX + r.range(-0.35, 0.35) * raft.hw;
      var s = solveSpeed(ang, X, yc);
      if (s && s.pull && s.apex <= C.ARC_APEX && s.v <= C.VMAX * 0.97) sol = s;
    }
    if (!sol) sol = solveSpeed(45 * DEG, raft.baseX, yc);
    this.solution = sol ? { pull: sol.pull, angle: M.atan2(sol.vy, sol.vx), T: sol.T, landX: raft.baseX } : null;
    if (!sol) return;
    var want = r.int(3, 5), pts = [], i, k;
    function ok(x, y, list) {
      if (y < C.LEAF_Y[0] || y > C.LEAF_Y[1] || x < C.LEAF_MIN_X || x > C.FIELD_W - 0.4) return false;
      for (var j = 0; j < list.length; j++) {
        var dx = list[j].x - x, dy = list[j].y - y;
        if (dx * dx + dy * dy < C.LEAF_GAP * C.LEAF_GAP) return false;
      }
      return true;
    }
    for (k = 0; k < 60 && pts.length < want; k++) {
      var f = r.range(0.12, 0.9), t = f * sol.T;
      var x = sol.x0 + sol.vx * t, y = sol.y0 + sol.vy * t - 0.5 * C.G * t * t;
      var vy = sol.vy - C.G * t, vl = M.sqrt(sol.vx * sol.vx + vy * vy), j = r.range(-0.12, 0.12);
      x += -vy / vl * j; y += sol.vx / vl * j;                                  // a tiny jitter across the arc
      if (y < raft.top + 1.0 && f > 0.8) continue;                              // not sitting on the deck
      if (ok(x, y, pts)) pts.push({ x: x, y: y, f: f });
    }
    pts.sort(function (a, b) { return a.f - b.f; });
    var bonus = r.int(0, 2), arc = pts.slice();
    for (k = 0; k < 30 && bonus > 0; k++) {                                     // off-arc bonus leaves (a flutter / other angle)
      var a = arc[r.int(0, arc.length - 1)]; if (!a) break;
      var d = r.range(0.95, 1.5), side = r.chance(0.7) ? 1 : -1;
      var bx = a.x + r.range(-0.4, 0.4), by = a.y + side * d;
      if (ok(bx, by, pts)) { pts.push({ x: bx, y: by, bonus: true }); bonus--; }
    }
    for (i = 0; i < pts.length; i++) {
      var kind = moon ? 'moon' : 'leaf';
      var l = { id: this._id++, x: pts[i].x, y: pts[i].y, y0: pts[i].y, px: pts[i].x, py: pts[i].y, kind: kind,
        value: moon ? C.POINTS.moon : C.POINTS.leaf, taken: false, t: 0, ph: r.range(0, TAU), bonus: !!pts[i].bonus };
      l.y = l.py = leafY(l, 0);
      this.leaves.push(l);
    }
  };

  // ---------- input ----------
  World.prototype.aim = function (dx, dy) {
    if (this.phase !== 'aim') return;
    this.pull = clampPull(dx, dy);
    if (!this._pulled) { this._pulled = true; this._emit({ type: 'pull' }); }
  };
  World.prototype.cancelAim = function () {
    if (this.phase !== 'aim') return;
    this.pull = null; this._pulled = false;
  };
  World.prototype.release = function () {
    if (this.phase !== 'aim' || !this.pull) return false;
    var C = CONFIG, p = this.pull, L = M.sqrt(p.x * p.x + p.y * p.y);
    if (L < C.PULL_MIN) { this.pull = null; this._pulled = false; return false; }
    var v = launchVelocity(p.x, p.y), fox = this.fox;
    fox.x = this.sling.x + p.x; fox.y = this.sling.y + p.y;
    fox.vx = v.vx; fox.vy = v.vy; fox.rot = M.atan2(v.vy, v.vx) * 0.5; fox.state = 'fly'; fox.flightT = 0;
    this.pull = null; this._pulled = false; this.fluttered = false;
    this.phase = 'fly'; this.phaseT = 0;
    this.shots++; this.stats.shots++;
    this._emit({ type: 'launch', power: L / C.PULL_MAX });
    return true;
  };
  World.prototype.flutter = function () {
    if (this.phase !== 'fly' || this.fluttered) return false;
    var fox = this.fox;
    fox.vy = M.max(fox.vy, 0) + CONFIG.FLUTTER_VY;
    fox.flutT = CONFIG.FLUTTER_T; if (fox.bonkT <= 0) fox.state = 'flutter';
    this.fluttered = true; this.stats.flutters++;
    this._emit({ type: 'flutter' });
    return true;
  };

  // ---------- preview ----------
  World.prototype.previewCount = function () {
    if (this.phase !== 'aim' || !this.pull) return 0;
    var C = CONFIG, k = (this.light - C.NIGHT_LIGHT) / (1 - C.NIGHT_LIGHT);
    return M.max(3, M.round(this.P.preview * (C.NIGHT_PREVIEW + (1 - C.NIGHT_PREVIEW) * clamp(k, 0, 1))));
  };
  /** predicted flight from the current pull (gravity only, stops at the sea) — exactly the path the fox takes */
  World.prototype.preview = function (n, dt) {
    var C = CONFIG, out = [];
    if (!this.pull) return out;
    n = n === undefined ? this.previewCount() : n; dt = dt || C.PREVIEW_DT;
    var v = launchVelocity(this.pull.x, this.pull.y), x0 = this.sling.x + this.pull.x, y0 = this.sling.y + this.pull.y;
    for (var i = 1; i <= n; i++) {
      var t = i * dt, y = y0 + v.vy * t - 0.5 * C.G * t * t;
      if (y < C.SEA_Y) break;
      out.push({ x: x0 + v.vx * t, y: y });
    }
    return out;
  };

  // ---------- simulation ----------
  World.prototype.update = function (dt) {
    var C = CONFIG;
    this.acc += M.min(M.max(+dt || 0, 0), 0.5);
    while (this.acc >= C.STEP) { this.acc -= C.STEP; this._step(C.STEP); }
    this.alpha = this.acc / C.STEP;
  };

  /** advance raft / gulls / leaves by h (shared by the world and the predictor) */
  function stepMovers(ctx, h) {
    var r = ctx.raft, i;
    r.px = r.x; r.t += h; r.x = raftX(r, r.t);
    for (i = 0; i < ctx.gulls.length; i++) {
      var g = ctx.gulls[i]; g.px = g.x; g.py = g.y; g.t += h; gullPos(g, g.t, g);
      g.flap = (g.flap + h * CONFIG.GULL_FLAP) % 1;
    }
    for (i = 0; i < ctx.leaves.length; i++) {
      var l = ctx.leaves[i]; l.px = l.x; l.py = l.y; l.t += h; l.y = leafY(l, l.t);
    }
  }

  /** one flight sub-step for ctx {fox, raft, gulls, leaves}; returns null or an outcome {type, …};
   *  calls hit(kind, obj) for leaves / gulls */
  function stepFlight(ctx, h, hit) {
    var C = CONFIG, f = ctx.fox, i;
    var feet0 = f.y - C.FOOT;
    f.x += f.vx * h; f.y += f.vy * h - 0.5 * C.G * h * h; f.vy -= C.G * h;
    f.flightT += h;
    // rotation: tumble after a bump, else ease the nose toward the velocity
    if (f.bonkT > 0) {
      f.rot = wrapAng(f.rot + f.spin * h); f.spin *= M.exp(-C.BONK_DRAG * h); f.bonkT -= h;
      if (f.bonkT <= 0) f.state = f.flutT > 0 ? 'flutter' : 'fly';
    } else {
      var target = M.atan2(f.vy, f.vx);
      f.rot = wrapAng(f.rot + wrapAng(target - f.rot) * (1 - M.exp(-C.ROT_RATE * h)));
    }
    if (f.flutT > 0) { f.flutT -= h; if (f.flutT <= 0 && f.bonkT <= 0) f.state = 'fly'; }
    // leaves
    var rr = C.R_FOX + C.R_LEAF;
    for (i = ctx.leaves.length - 1; i >= 0; i--) {
      var l = ctx.leaves[i], dx = l.x - f.x, dy = l.y - f.y;
      if (dx * dx + dy * dy < rr * rr) { ctx.leaves.splice(i, 1); hit('leaf', l); }
    }
    // gulls: circle bounce
    for (i = 0; i < ctx.gulls.length; i++) {
      var g = ctx.gulls[i], nx = f.x - g.x, ny = f.y - g.y, d = M.sqrt(nx * nx + ny * ny), R = C.R_FOX + g.r;
      if (d < R && d > 1e-6) {
        nx /= d; ny /= d;
        var gvx = (g.x - g.px) / h, gvy = (g.y - g.py) / h;
        if (M.abs(gvx) > 5) gvx = 0;                                           // wrap jump: not a real speed
        var rvx = f.vx - gvx, rvy = f.vy - gvy, vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          f.vx -= (1 + C.BUMP_E) * vn * nx; f.vy -= (1 + C.BUMP_E) * vn * ny;
          f.x = g.x + nx * (R + 0.01); f.y = g.y + ny * (R + 0.01);
          f.spin = (nx * f.vy - ny * f.vx >= 0 ? 1 : -1) * C.BONK_SPIN; f.bonkT = C.BONK_T; f.state = 'bonk';
          hit('gull', g);
        }
      }
    }
    var feet = f.y - C.FOOT, r = ctx.raft;
    if (f.vy < 0 && feet0 >= r.top && feet < r.top && M.abs(f.x - r.x) <= r.hw + C.LAND_PAD) {
      // interpolate the exact touchdown point inside the step
      var k = (feet0 - r.top) / M.max(1e-9, feet0 - feet);
      f.x -= f.vx * h * (1 - k); f.y = r.top + C.FOOT;
      return { type: 'land', x: f.x, y: f.y, off: f.x - r.x };
    }
    if (f.vy < 0 && f.x < C.ROCK_X && feet0 >= C.ROCK_TOP && feet < C.ROCK_TOP) {
      f.y = C.ROCK_TOP + C.FOOT;
      return { type: 'flop', x: f.x, y: f.y };
    }
    if (feet < C.SEA_Y || f.x < C.OUT_L || f.x > C.OUT_R || f.flightT > C.MAX_FLIGHT) return { type: 'splash', x: f.x, y: f.y };
    return null;
  }

  World.prototype._step = function (h) {
    var C = CONFIG, fox = this.fox, i;
    if (this.phase === 'over') { fox.px = fox.x; fox.py = fox.y; fox.prot = fox.rot; return; }
    this.time += h; this.phaseT += h;
    fox.px = fox.x; fox.py = fox.y; fox.prot = fox.rot;
    // day cycle
    this.dayT += h / C.DAY_LEN; if (this.dayT >= 1) this.dayT -= 1;
    this.light = lightAt(this.dayT);
    var night = this.light < C.NIGHT_AT;
    if (night !== this.isNight) { this.isNight = night; this._emit({ type: night ? 'night' : 'dawn' }); }
    stepMovers(this, h);

    if (this.phase === 'aim') {
      fox.x = this.sling.x + (this.pull ? this.pull.x : 0); fox.y = this.sling.y + (this.pull ? this.pull.y : 0);
      fox.state = this.pull ? 'pull' : 'sit';
      fox.rot = this.pull ? M.atan2(-this.pull.y, -this.pull.x) * 0.25 : 0;   // a slight lean along the band
    } else if (this.phase === 'fly') {
      var self = this;
      var out = stepFlight(this, h, function (kind, o) { self._hit(kind, o); });
      if (out) this._outcome(out);
    } else if (this.phase === 'land') {
      var raft = this.raft, rel = fox.x - raft.px;                              // ride the raft
      if (fox.vx !== 0) {
        var s = fox.vx > 0 ? 1 : -1, nv = fox.vx - s * C.FRICTION * h;
        fox.vx = nv * s > 0 ? nv : 0;
      }
      rel += fox.vx * h;
      var edge = raft.hw - C.DECK_EDGE;
      if (rel > edge) { rel = edge; fox.vx = 0; } else if (rel < -edge) { rel = -edge; fox.vx = 0; }
      fox.x = raft.x + rel; fox.y = raft.top + C.FOOT;
      fox.rot *= M.exp(-10 * h);
      if (this.phaseT >= C.LAND_T) {
        if (this.levelLandings >= C.LANDINGS_PER_LEVEL) this._setLevel(this.level + 1, false);
        this._newShot(false);
      }
    } else if (this.phase === 'splash') {
      fox.y += (C.SEA_Y + C.SPLASH_SINK - fox.y) * (1 - M.exp(-C.SINK_RATE * h));
      fox.vx *= M.exp(-6 * h); fox.x += fox.vx * h;
      fox.rot *= M.exp(-8 * h);
      if (this.phaseT >= C.SPLASH_T) {
        if (this.hearts <= 0) {
          this.phase = 'over'; this.phaseT = 0;
          this._emit({ type: 'gameOver', score: this.score });
        } else this._newShot(false);
      }
    } else if (this.phase === 'flop') {
      fox.vx *= M.exp(-8 * h); fox.x += fox.vx * h; fox.rot *= M.exp(-8 * h);
      if (this.phaseT >= C.FLOP_T) this._newShot(false);
    }
  };

  World.prototype._hit = function (kind, o) {
    var C = CONFIG;
    if (kind === 'leaf') {
      o.taken = true;
      this.leafCount++; this.score += o.value;
      this.stats.leaves++; if (o.kind === 'moon') this.stats.moonLeaves++;
      this._emit({ type: 'leaf', x: o.x, y: o.y, value: o.value, kind: o.kind, count: this.leafCount, id: o.id });
      if (this.leafCount % C.HEART_EVERY === 0 && this.hearts < this.maxHearts) {
        this.hearts++; this.stats.hearts++;
        this._emit({ type: 'heartGain', hearts: this.hearts });
      }
    } else if (kind === 'gull') {
      this.stats.bumps++;
      this._emit({ type: 'bump', x: this.fox.x, y: this.fox.y, id: o.id });
    }
  };

  World.prototype._outcome = function (o) {
    var C = CONFIG, fox = this.fox, raft = this.raft;
    this.phaseT = 0;
    if (o.type === 'land') {
      var bull = M.abs(o.off) <= raft.bull;
      this.streak++; this.bestStreak = M.max(this.bestStreak, this.streak); this.stats.maxStreak = this.bestStreak;
      var pts = C.POINTS.land + (bull ? C.POINTS.bull : 0) + M.min(C.POINTS.streakMax, this.streak - 1);
      this.score += pts; this.landings++; this.levelLandings++;
      this.stats.landings++; if (bull) this.stats.bulls++;
      fox.vx = (fox.vx - (raft.x - raft.px) / C.STEP) * C.LAND_KEEP;           // relative to the deck
      fox.vy = 0; fox.state = 'land'; fox.bonkT = 0; fox.flutT = 0;
      this.phase = 'land';
      this._emit({ type: 'land', x: o.x, y: o.y, points: pts, bull: bull, streak: this.streak });
    } else if (o.type === 'flop') {
      this.streak = 0; this.stats.flops++;
      fox.vy = 0; fox.vx *= 0.3; fox.state = 'bonk'; fox.bonkT = 0;
      this.phase = 'flop';
      this._emit({ type: 'flop', x: o.x, y: o.y });
    } else {
      this.streak = 0; this.stats.splashes++;
      this.hearts = M.max(0, this.hearts - 1);
      fox.vy = 0; fox.state = 'splash'; fox.bonkT = 0; fox.flutT = 0;
      fox.x = clamp(fox.x, -0.6, 16.6);
      this.phase = 'splash';
      this._emit({ type: 'splash', x: fox.x, y: C.SEA_Y });
      this._emit({ type: 'heartLost', hearts: this.hearts });
    }
  };

  World.prototype.gotoLevel = function (i) {
    i = M.max(0, i | 0);
    if (this.phase === 'over') return;
    this._setLevel(i, false);
    this._newShot(false);
  };

  World.prototype.setDay = function (d) {
    d = +d || 0; this.dayT = d - M.floor(d);
    this.light = lightAt(this.dayT);
    var night = this.light < CONFIG.NIGHT_AT;
    if (night !== this.isNight) { this.isNight = night; this._emit({ type: night ? 'night' : 'dawn' }); }
  };

  /** Replay the future without touching the world: release `pull` after `wait` s (raft/gulls/leaves keep moving),
   *  optional flutter at flight time `flutterAt`. When pull is null and the fox is flying, continue the current
   *  flight instead (flutterAt then counts from now). Returns {type: 'land'|'splash'|'flop', x, y, t, off, bull,
   *  leaves, bumps, raftX, flightT}. */
  World.prototype.predictShot = function (pull, wait, flutterAt) {
    var C = CONFIG, h = C.STEP, i, f, t = 0;
    var raft = {}, k; for (k in this.raft) raft[k] = this.raft[k];
    var gulls = []; for (i = 0; i < this.gulls.length; i++) { var g = {}; for (k in this.gulls[i]) g[k] = this.gulls[i][k]; gulls.push(g); }
    var leaves = []; for (i = 0; i < this.leaves.length; i++) { var l = {}; for (k in this.leaves[i]) l[k] = this.leaves[i][k]; leaves.push(l); }
    var ctx = { raft: raft, gulls: gulls, leaves: leaves };
    var fluttered = this.fluttered;
    if (pull) {
      var p = clampPull(pull.x, pull.y), n = M.round((wait || 0) / h);
      for (i = 0; i < n; i++) { stepMovers(ctx, h); t += h; }
      var v = launchVelocity(p.x, p.y);
      f = { x: this.sling.x + p.x, y: this.sling.y + p.y, vx: v.vx, vy: v.vy, rot: 0, spin: 0, bonkT: 0, flutT: 0, flightT: 0, state: 'fly' };
      fluttered = false;
    } else {
      var F = this.fox; f = { x: F.x, y: F.y, vx: F.vx, vy: F.vy, rot: F.rot, spin: F.spin, bonkT: F.bonkT, flutT: F.flutT, flightT: F.flightT, state: F.state };
    }
    ctx.fox = f;
    var res = { leaves: 0, bumps: 0, value: 0 }, ft = 0;
    var hit = function (kind, o) { if (kind === 'leaf') { res.leaves++; res.value += o.value; } else res.bumps++; };
    for (var s = 0; s < 1500; s++) {
      if (flutterAt !== undefined && flutterAt !== null && !fluttered && ft >= flutterAt) { f.vy = M.max(f.vy, 0) + C.FLUTTER_VY; fluttered = true; }
      stepMovers(ctx, h); t += h; ft += h;
      var o = stepFlight(ctx, h, hit);
      if (o) {
        res.type = o.type; res.x = o.x; res.y = o.y; res.t = t; res.flightT = f.flightT; res.raftX = raft.x;
        res.off = o.type === 'land' ? o.off : f.x - raft.x; res.bull = o.type === 'land' && M.abs(o.off) <= raft.bull;
        return res;
      }
    }
    res.type = 'splash'; res.x = f.x; res.y = f.y; res.t = t; res.off = f.x - raft.x; res.raftX = raft.x;
    return res;
  };

  World.prototype.getState = function () {
    var f = this.fox, r = this.raft, i, st = {};
    for (var s in this.stats) st[s] = this.stats[s];
    var leaves = [], gulls = [];
    for (i = 0; i < this.leaves.length; i++) { var l = this.leaves[i]; leaves.push({ id: l.id, x: l.x, y: l.y, kind: l.kind, value: l.value }); }
    for (i = 0; i < this.gulls.length; i++) { var g = this.gulls[i]; gulls.push({ id: g.id, x: g.x, y: g.y, vx: g.vx, r: g.r }); }
    return {
      time: this.time, phase: this.phase, phaseT: this.phaseT, difficulty: this.difficulty,
      level: this.level, zone: this.zone, loop: this.loop, levelName: this.P.name,
      score: this.score, hearts: this.hearts, maxHearts: this.maxHearts, leafCount: this.leafCount,
      landings: this.landings, levelLandings: this.levelLandings, shots: this.shots, streak: this.streak, bestStreak: this.bestStreak,
      dayT: this.dayT, light: this.light, isNight: this.isNight, fluttered: this.fluttered,
      pull: this.pull ? { x: this.pull.x, y: this.pull.y } : null, previewCount: this.previewCount(),
      fox: { x: f.x, y: f.y, vx: f.vx, vy: f.vy, rot: f.rot, state: f.state },
      raft: { x: r.x, top: r.top, hw: r.hw, bull: r.bull, baseX: r.baseX, amp: r.amp, period: r.period },
      leaves: leaves, gulls: gulls, stats: st
    };
  };

  FIF.World = World;
})(window.FIF = window.FIF || {});
