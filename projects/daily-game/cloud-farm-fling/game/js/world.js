/* Nubi's Farm Fling — CFF.World: the headless, deterministic game simulation (DESIGN §5)
 *
 *   var w = new CFF.World({ seed: 1, difficulty: 'easy', level: 0, size: 1 });
 *   w.aim(dx, dy);        // pull offset from the sling anchor (world u); Nubi sits at sling + pull
 *   w.release();          // fling (or cancel if the pull is tiny)
 *   w.puff();             // once per flight, only once Nubi has stopped shooting up: a small lift (alias: flutter)
 *   w.update(dt);         // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction for render lerp
 *   w.drainEvents();      // [{type:'launch', power}, …]
 *
 * Units: u (≈ 1 m) and seconds; x grows right, y grows UP; the grass top is y = 0. No pixels in here.
 * Rotations (nubi.rot) are radians in WORLD convention (y up, counter-clockwise positive): draw with ctx.rotate(-rot).
 * Everything that moves keeps p* values (saved at the start of each sub-step) so the renderer can lerp with alpha.
 *
 * ONE step function. stepFlight() (body + size + pickups + crows + landing tests) is used by the live flight,
 * preview(), predictShot() (bot, tests) and the firefly-arc generator. The wagon, crows and fireflies move as pure
 * functions of their own clocks, so a copy of the world replays the future exactly.
 *
 * Growth twist (all in stepBody / growSize):
 *   size s ∈ [1, SIZE_MAX]; nubi.goal is the target, nubi.size eases toward it (SIZE_EASE /s) → no pops.
 *   goal += GROW_RATE·dt while aiming / flying, += GROW_FLY per firefly (GROW_GOLD for a gold one).
 *   gravity  g = G·(1 − BUOY·(s − 1))                    (a bigger, puffier cloud is more buoyant)
 *   drag     a = −DRAG·(s − 1)·|v|·v                     (quadratic, zero at size 1: classic parabola)
 *   pickup   R_NUBI·s + R_FLY;   bottom = y − FOOT·s;   landing pad = LAND_PAD + RAIN_PAD·(s − 1)
 *   landing  goal = 1 + (goal − 1)·RAIN_KEEP (eased over the rain phase);  plop: goal = max(1, goal − PLOP_LOSS)
 *   Drag outweighs the buoyancy, so the same pull flies a SHORTER, loftier, floatier arc when Nubi is big.
 * Integration: x += v·h + ½·a·h², v += a·h with a from the start of the step (exact parabola when s = 1).
 *
 * CONFIG (units → why) — the full table with rationale is in docs/MECHANICS.md.
 */
(function (CFF) {
  'use strict';
  var M = Math, TAU = M.PI * 2, DEG = M.PI / 180;

  var CONFIG = {
    STEP: 1 / 120, GROUND_Y: 0, FIELD_W: 16, FIELD_H: 9,
    SLING: { x: 2.3, y: 2.9 },
    G: 9, VMAX: 14, PULL_MAX: 1.8, PULL_MIN: 0.3, PULL_DOWN: 1.4, PULL_FWD: 0,
    PUFF_VY: 3.2, R_NUBI: 0.45, R_FLY: 0.35, FOOT: 0.45, LAND_PAD: 0.15, RAIN_PAD: 0.5,
    // growth
    SIZE_MAX: 1.7, GROW_RATE: 0.006, GROW_FLY: 0.05, GROW_GOLD: 0.1, SIZE_EASE: 4, SHRINK_EASE: 2.5,
    BIG_AT: 1.4, RAIN_KEEP: 0.4, PLOP_LOSS: 0.15, BUOY: 0.15, DRAG: 0.05,
    // world bits
    BUMP_E: 0.7, CROW_R: 0.42, BALE_X: 4.6, BALE_TOP: 1.2, OUT_L: -1, OUT_R: 17.5,
    WAGON_TOP: 0.55, WAGON_GLIDE: 0.9,
    LAND_T: 1.2, PLOP_T: 1.2, FLOP_T: 0.8, LAND_KEEP: 0.3, FRICTION: 5, DECK_EDGE: 0.25,
    ROT_RATE: 7, TILT: 0.45, BONK_T: 0.5, BONK_SPIN: 11, BONK_DRAG: 4, PUFF_T: 0.45,
    PLOP_SQUASH: 0.75, PLOP_RATE: 6, MAX_FLIGHT: 8,
    FLY_BOB: 0.06, FLY_BOB_T: 2.2, GOLD_P: 0.125,
    CROW_SPEED: [0.5, 0.9], CROW_Y: [2.5, 5.5], CROW_BOB: 0.18, CROW_BOB_T: 3.0,
    CROW_CLEAR_X: 5.4, CROW_CLEAR_Y: 5.2, CROW_FLAP: 2.5,
    MIN_WAGON_DX: 5, FLY_Y: [1.0, 6.8], FLY_MIN_X: 4.4, FLY_GAP: 0.9,
    ARC_ANG: [34, 64], ARC_APEX: 6.5, ARC_WAIT: 1.0,
    LANDINGS_PER_LEVEL: 5, HEART_EVERY: 20, PREVIEW_DT: 0.06,
    POINTS: { fly: 1, gold: 3, land: 2, bull: 3, big: 2, streakMax: 4 },
    LOOP_CAP: 3, LOOP_HW: 0.06, LOOP_AMP: 0.15, LOOP_PREVIEW: 0.08, LOOP_PERIOD: 0.06
  };

  var DIFF = {
    easy:   { hearts: 5, heartEvery: 12, hwK: 1.4,  bullK: 1.2,  ampK: 0.5,  previewK: 1.6,  crowK: 0, crowSpeedK: 0.8 },
    normal: { hearts: 3, heartEvery: 20, hwK: 1.0,  bullK: 1.0,  ampK: 1.0,  previewK: 1.0,  crowK: 0, crowSpeedK: 1.0 },
    hard:   { hearts: 3, heartEvery: 25, hwK: 0.85, bullK: 0.85, ampK: 1.25, previewK: 0.75, crowK: 1, crowSpeedK: 1.2 }
  };

  var LEVELS = [
    { key: 'spring', name: 'Spring Sprouts',    x: [7.3, 13.8], hw: 1.6,  bull: 0.45, amp: 0,    period: 7.0, crows: 0, PREVIEW: 34 },
    { key: 'summer', name: 'Sunflower Summer',  x: [7.4, 14.0], hw: 1.45, bull: 0.4,  amp: 0.7,  period: 6.5, crows: 0, PREVIEW: 24 },
    { key: 'autumn', name: 'Pumpkin Autumn',    x: [7.8, 14.3], hw: 1.3,  bull: 0.35, amp: 0.85, period: 5.5, crows: 1, PREVIEW: 18 },
    { key: 'winter', name: 'Snowy Winter',      x: [8.3, 14.5], hw: 1.2,  bull: 0.32, amp: 0.95, period: 5.2, crows: 2, PREVIEW: 13 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function wrapAng(a) { while (a > M.PI) a -= TAU; while (a < -M.PI) a += TAU; return a; }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  // ---------- pull ↔ velocity ----------
  function clampPull(dx, dy) {
    var C = CONFIG;
    dx = M.min(+dx || 0, C.PULL_FWD); dy = M.max(+dy || 0, -C.PULL_DOWN);
    var L = M.sqrt(dx * dx + dy * dy);
    if (L > C.PULL_MAX) { dx *= C.PULL_MAX / L; dy *= C.PULL_MAX / L; }
    return { x: dx, y: dy };
  }
  /** the velocity a pull would give: v = −pull / PULL_MAX · VMAX (pull clamped like aim()) */
  function launchVelocity(dx, dy) {
    var C = CONFIG, p = clampPull(dx, dy);
    return { vx: -p.x / C.PULL_MAX * C.VMAX, vy: -p.y / C.PULL_MAX * C.VMAX };
  }
  /** pull that gives speed v in direction ang (radians); null if the pull limits can't produce it */
  function pullFor(ang, v) {
    var C = CONFIG, k = C.PULL_MAX / C.VMAX;
    if (v > C.VMAX + 1e-9 || v <= 0) return null;
    var p = { x: -M.cos(ang) * v * k, y: -M.sin(ang) * v * k };
    if (p.x > C.PULL_FWD + 1e-9 || p.y < -C.PULL_DOWN - 1e-9) return null;
    return p;
  }

  // ---------- the physics (shared by everything) ----------
  function gravityAt(s) { return CONFIG.G * (1 - CONFIG.BUOY * (s - 1)); }
  function dragAt(s) { return CONFIG.DRAG * (s - 1); }
  function padAt(s) { return CONFIG.LAND_PAD + CONFIG.RAIN_PAD * (s - 1); }
  var easeK = { e: 0, h: 0, k: 0 };
  /** grow the goal by rate·h (capped) and ease size toward it; keeps psize */
  function growSize(f, h, rate, ease) {
    var C = CONFIG;
    if (rate) f.goal = M.min(C.SIZE_MAX, f.goal + rate * h);
    f.psize = f.size;
    if (f.goal === f.size) return;
    ease = ease || C.SIZE_EASE;
    if (ease !== easeK.e || h !== easeK.h) { easeK.e = ease; easeK.h = h; easeK.k = 1 - M.exp(-ease * h); }
    f.size += (f.goal - f.size) * easeK.k;
    if (M.abs(f.goal - f.size) < 1e-7) f.size = f.goal;
  }
  /** body sub-step: size growth, buoyant gravity + quadratic drag */
  function stepBody(f, h) {
    growSize(f, h, CONFIG.GROW_RATE);
    var s = f.size, g = gravityAt(s), k = dragAt(s), sp = M.sqrt(f.vx * f.vx + f.vy * f.vy);
    var ax = -k * sp * f.vx, ay = -g - k * sp * f.vy;
    f.x += f.vx * h + 0.5 * ax * h * h; f.y += f.vy * h + 0.5 * ay * h * h;
    f.vx += ax * h; f.vy += ay * h;
    f.flightT += h;
  }

  // ---------- moving things: pure functions of their own clock ----------
  function wagonX(r, t) {
    var base = r.fromX + (r.baseX - r.fromX) * smooth(t / CONFIG.WAGON_GLIDE);
    return base + (r.amp > 0 ? r.amp * M.sin(TAU * t / r.period + r.phase) : 0);
  }
  function crowPos(g, t, out) {
    var C = CONFIG, span = C.OUT_R - C.OUT_L + 1, x = g.x0 + g.vx * t;
    x = C.OUT_L - 0.5 + (((x - (C.OUT_L - 0.5)) % span) + span) % span;       // wrap off-screen on both sides
    var y = g.baseY + C.CROW_BOB * M.sin(TAU * t / C.CROW_BOB_T + g.ph);
    var lift = 1 - smooth((x - C.CROW_CLEAR_X) / 1.6);                         // climb over the slingshot
    if (lift > 0) y = M.max(y, y + (C.CROW_CLEAR_Y - y) * lift);
    out.x = x; out.y = y;
    return out;
  }
  function flyY(l, t) { return l.y0 + CONFIG.FLY_BOB * M.sin(TAU * t / CONFIG.FLY_BOB_T + l.ph); }

  /** advance wagon / crows / fireflies by h (shared by the world and the predictor) */
  function stepMovers(ctx, h) {
    var r = ctx.wagon, i;
    r.px = r.x; r.t += h; r.x = wagonX(r, r.t);
    for (i = 0; i < ctx.crows.length; i++) {
      var g = ctx.crows[i]; g.px = g.x; g.py = g.y; g.t += h; crowPos(g, g.t, g);
      g.flap = (g.flap + h * CONFIG.CROW_FLAP) % 1;
    }
    for (i = 0; i < ctx.flies.length; i++) {
      var l = ctx.flies[i]; l.px = l.x; l.py = l.y; l.t += h; l.y = flyY(l, l.t);
    }
  }

  /** one flight sub-step for ctx {nubi, wagon, crows, flies}; returns null or an outcome {type, …};
   *  calls hit(kind, obj) for fireflies (after the growth goal is raised) and crows */
  function stepFlight(ctx, h, hit) {
    var C = CONFIG, f = ctx.nubi, i;
    var bot0 = f.y - C.FOOT * f.size;
    stepBody(f, h);
    var s = f.size;
    // rotation: tumble after a bump, else a gentle tilt toward the velocity (a cloud doesn't nose-dive)
    if (f.bonkT > 0) {
      f.rot = wrapAng(f.rot + f.spin * h); f.spin *= M.exp(-C.BONK_DRAG * h); f.bonkT -= h;
      if (f.bonkT <= 0) f.state = f.puffT > 0 ? 'puff' : 'fly';
    } else {
      var target = M.atan2(f.vy, M.abs(f.vx) + 1e-9) * C.TILT;
      f.rot = wrapAng(f.rot + wrapAng(target - f.rot) * (1 - M.exp(-C.ROT_RATE * h)));
    }
    if (f.puffT > 0) { f.puffT -= h; if (f.puffT <= 0 && f.bonkT <= 0) f.state = 'fly'; }
    // fireflies (pickup radius grows with Nubi)
    var rr = C.R_NUBI * s + C.R_FLY;
    for (i = ctx.flies.length - 1; i >= 0; i--) {
      var l = ctx.flies[i], dx = l.x - f.x, dy = l.y - f.y;
      if (dx * dx + dy * dy < rr * rr) {
        ctx.flies.splice(i, 1);
        f.goal = M.min(C.SIZE_MAX, f.goal + (l.kind === 'gold' ? C.GROW_GOLD : C.GROW_FLY));
        hit('fly', l);
      }
    }
    // crows: circle bounce
    for (i = 0; i < ctx.crows.length; i++) {
      var g = ctx.crows[i], nx = f.x - g.x, ny = f.y - g.y, d = M.sqrt(nx * nx + ny * ny), R = C.R_NUBI * s + g.r;
      if (d < R && d > 1e-6) {
        nx /= d; ny /= d;
        var gvx = (g.x - g.px) / h, gvy = (g.y - g.py) / h;
        if (M.abs(gvx) > 5) gvx = 0;                                           // wrap jump: not a real speed
        var rvx = f.vx - gvx, rvy = f.vy - gvy, vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          f.vx -= (1 + C.BUMP_E) * vn * nx; f.vy -= (1 + C.BUMP_E) * vn * ny;
          f.x = g.x + nx * (R + 0.01); f.y = g.y + ny * (R + 0.01);
          f.spin = (nx * f.vy - ny * f.vx >= 0 ? 1 : -1) * C.BONK_SPIN; f.bonkT = C.BONK_T; f.state = 'bonk';
          hit('crow', g);
        }
      }
    }
    var foot = C.FOOT * s, bot = f.y - foot, r = ctx.wagon;
    if (f.vy < 0 && bot0 >= r.top && bot < r.top && M.abs(f.x - r.x) <= r.hw + padAt(s)) {
      var k = (bot0 - r.top) / M.max(1e-9, bot0 - bot);                       // exact touchdown inside the step
      f.x -= f.vx * h * (1 - k); f.y = r.top + foot;
      return { type: 'land', x: f.x, y: f.y, off: f.x - r.x };
    }
    if (f.vy < 0 && f.x < C.BALE_X && bot0 >= C.BALE_TOP && bot < C.BALE_TOP) {
      f.y = C.BALE_TOP + foot;
      return { type: 'flop', x: f.x, y: f.y };
    }
    if (bot < C.GROUND_Y || f.x < C.OUT_L || f.x > C.OUT_R || f.flightT > C.MAX_FLIGHT) return { type: 'plop', x: f.x, y: f.y };
    return null;
  }

  /** body-only flight (no pickups, no crows) from a launch; where the bottom comes DOWN through height top.
   *  Returns {x, T, apex} (x = −1e9 if it never comes down there within MAX_FLIGHT). */
  function bodyLand(s0, goal0, x0, y0, vx, vy, top) {
    var C = CONFIG, h = C.STEP, f = { x: x0, y: y0, vx: vx, vy: vy, size: s0, psize: s0, goal: goal0, flightT: 0 };
    var apex = y0, n = M.ceil(C.MAX_FLIGHT / h);
    for (var i = 0; i < n; i++) {
      var b0 = f.y - C.FOOT * f.size, px = f.x;
      stepBody(f, h);
      if (f.y > apex) apex = f.y;
      var b = f.y - C.FOOT * f.size;
      if (f.vy < 0 && b0 >= top && b < top) {
        var k = (b0 - top) / M.max(1e-9, b0 - b);
        return { x: px + (f.x - px) * k, T: f.flightT - h * (1 - k), apex: apex };
      }
      if (b < top - 3 || f.x > 40) break;
    }
    return { x: -1e9, T: C.MAX_FLIGHT, apex: apex };
  }
  /** launch speed at angle ang (from the sling, launch point = sling + pull) that lands Nubi's bottom on height top
   *  at x = X, for a start size s0 / goal g0 (size keeps growing in flight). Illinois false position on v.
   *  Returns {v, T, pull, x0, y0, vx, vy, apex} or null. */
  function solveSpeed(ang, X, top, s0, g0) {
    var C = CONFIG, S = C.SLING, k = C.PULL_MAX / C.VMAX, c = M.cos(ang), sn = M.sin(ang);
    s0 = s0 || 1; g0 = g0 === undefined ? s0 : g0;
    top = top === undefined ? C.WAGON_TOP : top;
    function run(v) { return bodyLand(s0, g0, S.x - c * v * k, S.y - sn * v * k, v * c, v * sn, top); }
    var vmax = C.VMAX;
    if (sn > 0) vmax = M.min(vmax, C.PULL_DOWN / (sn * k));
    var vmin = C.PULL_MIN / k, v = clamp(10, vmin, vmax), r = run(v), fv = r.x - X, lo, hi, flo, fhi, i;
    // bracket: walk from a typical speed (×1.2 steps) until the landing point changes side of X
    if (fv < 0) { lo = v; flo = fv; for (i = 0; ; i++) { if (v >= vmax) return null; v = M.min(vmax, v * 1.2); r = run(v); fv = r.x - X; if (fv >= 0) break; lo = v; flo = fv; } hi = v; fhi = fv; }
    else { hi = v; fhi = fv; for (i = 0; ; i++) { if (v <= vmin) return null; v = M.max(vmin, v / 1.2); r = run(v); fv = r.x - X; if (fv <= 0) break; hi = v; fhi = fv; } lo = v; flo = fv; }
    var side = 0;
    for (i = 0; i < 40 && M.abs(fv) >= 1e-3 && hi - lo > 1e-7; i++) {   // Illinois false position
      v = flo < -1e8 ? 0.5 * (lo + hi) : (lo * fhi - hi * flo) / (fhi - flo);
      r = run(v); fv = r.x - X;
      if (fv < 0) { lo = v; flo = fv; if (side === -1) fhi *= 0.5; side = -1; }
      else { hi = v; fhi = fv; if (side === 1) flo *= 0.5; side = 1; }
    }
    return { v: v, T: r.T, pull: pullFor(ang, v), x0: S.x - c * v * k, y0: S.y - sn * v * k, vx: v * c, vy: v * sn, apex: r.apex };
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.DIFF = DIFF;
  World.LEVELS = LEVELS;
  World.solveSpeed = solveSpeed;
  World.bodyLand = bodyLand;
  World.pullFor = pullFor;
  World.wagonX = wagonX;
  World.gravityAt = gravityAt;
  World.dragAt = dragAt;
  World.padAt = padAt;
  World.prototype.launchVelocity = function (dx, dy) { return launchVelocity(dx, dy); };
  World.prototype.setLayout = function () {};       // the world has no pixels

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.seed = opts.seed === undefined || opts.seed === null ? 1 : opts.seed;
    this.difficulty = DIFF[opts.difficulty] ? opts.difficulty : 'easy';
    this.D = DIFF[this.difficulty];
    this.rng = new CFF.RNG(this.seed);
    this.rWagon = this.rng.fork('wagon'); this.rFly = this.rng.fork('fly'); this.rCrow = this.rng.fork('crow');
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.events = [];
    this._id = 1;
    this.level = M.max(0, opts.level | 0);
    this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.score = 0; this.flyCount = 0; this.landings = 0; this.levelLandings = 0; this.shots = 0;
    this.streak = 0; this.bestStreak = 0;
    this.hearts = this.maxHearts = this.D.hearts;
    var s0 = clamp(+opts.size || 1, 1, C.SIZE_MAX);
    this.stats = { flies: 0, goldFlies: 0, landings: 0, bulls: 0, bigShowers: 0, plops: 0, puffs: 0, bumps: 0, hearts: 0,
      shots: 0, maxStreak: 0, maxSize: s0, flops: 0 };
    this.sling = { x: C.SLING.x, y: C.SLING.y };
    this.pull = null; this.puffed = false; this.fluttered = false;
    this.nubi = { x: C.SLING.x, y: C.SLING.y, vx: 0, vy: 0, px: C.SLING.x, py: C.SLING.y, rot: 0, prot: 0, state: 'sit',
      size: s0, psize: s0, goal: s0, spin: 0, bonkT: 0, puffT: 0, flightT: 0 };
    this.wagon = null;
    this.flies = []; this.crows = [];
    this._pulled = false;
    this._setLevel(this.level, true);
    this._newShot(true);
  };

  /** effective level parameters for a level index (zone table × difficulty × loop) */
  World.prototype.levelParams = function (level) {
    var C = CONFIG, D = this.D, L = LEVELS[level % 4], lp = M.min(M.floor(level / 4), C.LOOP_CAP);
    var hw = L.hw * D.hwK * (1 - C.LOOP_HW * lp);
    var amp = L.amp * D.ampK * (1 + C.LOOP_AMP * lp);
    if (L.amp === 0 && lp > 0) amp = 0.3 * lp * D.ampK;                     // later loops: even spring rolls a bit
    var xmin = M.max(L.x[0], C.SLING.x + C.MIN_WAGON_DX), xmax = M.min(L.x[1], C.FIELD_W - hw - 0.2);
    amp = M.min(amp, M.max(0, (xmax - xmin) / 2 - 0.3));
    return {
      key: L.key, name: L.name, xmin: xmin, xmax: xmax, hw: hw, bull: L.bull * D.bullK,
      amp: amp, period: L.period * (1 - C.LOOP_PERIOD * lp),
      crows: L.crows + (L.crows > 0 || lp > 0 ? D.crowK : 0) + (lp >= 2 && L.crows === 0 ? 1 : 0),
      preview: L.PREVIEW * D.previewK * (1 - C.LOOP_PREVIEW * lp)
    };
  };

  World.prototype._setLevel = function (level, quiet) {
    this.level = level; this.zone = level % 4; this.loop = M.floor(level / 4);
    this.P = this.levelParams(level);
    this.levelName = this.P.name;
    this.levelLandings = 0;
    this._spawnCrows();
    if (!quiet) this._emit({ type: 'levelUp', zone: this.zone, level: this.level, loop: this.loop });
  };

  World.prototype._spawnCrows = function () {
    var C = CONFIG, r = this.rCrow, n = this.P.crows;
    this.crows = [];
    for (var i = 0; i < n; i++) {
      var dir = r.sign(), sp = r.range(C.CROW_SPEED[0], C.CROW_SPEED[1]) * this.D.crowSpeedK;
      var band = (C.CROW_Y[1] - C.CROW_Y[0]) / n;
      var g = { id: this._id++, x0: r.range(6.5, 15) + i * 3.7, vx: dir * sp, baseY: C.CROW_Y[0] + band * (i + r.range(0.2, 0.8)),
        ph: r.range(0, TAU), t: 0, r: C.CROW_R, flap: 0, x: 0, y: 0, px: 0, py: 0 };
      crowPos(g, 0, g); g.px = g.x; g.py = g.y;
      this.crows.push(g);
    }
  };

  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  function resetNubi(n, sling) {
    n.x = n.px = sling.x; n.y = n.py = sling.y;
    n.vx = n.vy = 0; n.rot = n.prot = 0; n.spin = 0; n.bonkT = 0; n.puffT = 0; n.flightT = 0; n.state = 'sit';
  }

  // ---------- new shot: wagon spot + fireflies on a solution arc for the current size ----------
  World.prototype._newShot = function (first) {
    var P = this.P, r = this.rWagon;
    this.phase = 'aim'; this.phaseT = 0;
    this.pull = null; this.puffed = this.fluttered = false; this._pulled = false;
    resetNubi(this.nubi, this.sling);
    var lo = P.xmin + P.amp, hi = P.xmax - P.amp, base = lo < hi ? r.range(lo, hi) : 0.5 * (P.xmin + P.xmax);
    var old = this.wagon, fromX = first || !old ? base : old.x;
    this.wagon = { x: fromX, px: fromX, top: CONFIG.WAGON_TOP, hw: P.hw, bull: P.bull, baseX: base, fromX: fromX,
      amp: P.amp, period: P.period, phase: r.chance(0.5) ? 0 : M.PI, t: 0 };  // sin(phase) = 0: x(0) = fromX, no jump
    this.wagon.x = this.wagon.px = wagonX(this.wagon, 0);
    this._makeFlies();
    if (!first) this._emit({ type: 'newShot', retry: false });
  };

  /** after a flop: Nubi hops back into the sling; wagon (still rolling) and the remaining fireflies stay */
  World.prototype._retryShot = function () {
    this.phase = 'aim'; this.phaseT = 0; this.pull = null; this.puffed = this.fluttered = false; this._pulled = false;
    resetNubi(this.nubi, this.sling);
    this._emit({ type: 'newShot', retry: true });
  };

  /** a still copy of the scene for the predictor (wagon parked at its spot, current crows, given flies) */
  World.prototype._ctxCopy = function (flies, still) {
    var i, ctx = { wagon: copy(this.wagon), crows: [], flies: [] };
    if (still) { ctx.wagon.amp = 0; ctx.wagon.fromX = ctx.wagon.baseX; ctx.wagon.x = ctx.wagon.baseX; }
    for (i = 0; i < this.crows.length; i++) ctx.crows.push(copy(this.crows[i]));
    flies = flies || this.flies;
    for (i = 0; i < flies.length; i++) ctx.flies.push(copy(flies[i]));
    return ctx;
  };

  World.prototype._makeFlies = function () {
    var C = CONFIG, r = this.rFly, wg = this.wagon, n0 = this.nubi, self = this;
    this.flies = []; this.solution = null;
    // size expected at release ≈ ARC_WAIT s from now (Nubi keeps growing slowly while you aim)
    var wait = C.ARC_WAIT, g0 = M.min(C.SIZE_MAX, n0.goal + C.GROW_RATE * wait);
    var s0 = g0 + (n0.size - n0.goal) * M.exp(-C.SIZE_EASE * wait);
    function ok(x, y, list) {
      if (y < C.FLY_Y[0] || y > C.FLY_Y[1] || x < C.FLY_MIN_X || x > C.FIELD_W - 0.4) return false;
      for (var j = 0; j < list.length; j++) {
        var dx = list[j].x - x, dy = list[j].y - y;
        if (dx * dx + dy * dy < C.FLY_GAP * C.FLY_GAP) return false;
      }
      return true;
    }
    function mkFly(x, y, bonus) {
      var gold = r.chance(C.GOLD_P);
      var l = { id: self._id++, x: x, y: y, y0: y, px: x, py: y, kind: gold ? 'gold' : 'fly',
        value: gold ? C.POINTS.gold : C.POINTS.fly, taken: false, t: 0, ph: r.range(0, TAU), bonus: !!bonus };
      l.y = l.py = flyY(l, 0);
      return l;
    }
    /** record the path of a perfect shot (with pickups), sampled every step */
    function trace(pull, flies) {
      var ctx = self._ctxCopy(flies, true), path = []; ctx.crows = [];
      var res = self._simulate(ctx, pull, wait, null, path, s0, g0);
      return { res: res, path: path };
    }
    var best = null;
    for (var tries = 0; tries < 16 && !best; tries++) {
      var ang = r.range(C.ARC_ANG[0], C.ARC_ANG[1]) * DEG, X = wg.baseX + r.range(-0.35, 0.35) * wg.hw;
      var sol = solveSpeed(ang, X, wg.top, s0, g0);
      if (!sol || !sol.pull || sol.apex > C.ARC_APEX || sol.v > C.VMAX * 0.97) continue;
      if (tries < 12 && this._arcHitsCrow(sol.pull, s0, g0)) continue;
      // fireflies on the body path
      var tr = trace(sol.pull, []), path = tr.path, want = r.int(3, 5), pts = [], k;
      if (tr.res.type !== 'land' || path.length < 20) continue;
      for (k = 0; k < 60 && pts.length < want; k++) {
        var f = r.range(0.12, 0.9), p = path[M.floor(f * (path.length - 1))];
        var vl = M.sqrt(p.vx * p.vx + p.vy * p.vy) || 1, j = r.range(-0.12, 0.12);
        var x = p.x - p.vy / vl * j, y = p.y + p.vx / vl * j;                   // a tiny jitter across the arc
        if (y < wg.top + 1.0 + C.FOOT * p.s && f > 0.8) continue;               // not sitting on the soil
        if (ok(x, y, pts)) pts.push({ x: x, y: y, f: f });
      }
      if (pts.length < 3) continue;
      pts.sort(function (a, b) { return a.f - b.f; });
      var arc = []; for (k = 0; k < pts.length; k++) arc.push(mkFly(pts[k].x, pts[k].y, false));
      // eating fireflies makes Nubi bigger (shorter flight): re-aim so the perfect shot still lands on the spot
      var pull = sol.pull, landed = null, tgt = X;
      for (var it = 0; it < 4; it++) {
        var t2 = trace(pull, arc);
        if (t2.res.type === 'land' && t2.res.flies === arc.length && M.abs(t2.res.x - X) < 0.25 * wg.hw) { landed = t2.res; break; }
        if (t2.res.type === 'land') tgt += X - t2.res.x; else tgt += X - (t2.res.x || X) > 0 ? 0.3 : -0.3;
        var s2 = solveSpeed(ang, tgt, wg.top, s0, g0);
        if (!s2 || !s2.pull) break;
        pull = s2.pull;
      }
      if (!landed) continue;
      best = { pull: pull, ang: ang, arc: arc, T: landed.flightT };
    }
    if (!best) {                                                               // fallback: a plain 45° arc, no flies
      var fb = solveSpeed(45 * DEG, wg.baseX, wg.top, s0, g0);
      this.solution = fb && fb.pull ? { pull: fb.pull, angle: 45 * DEG, T: fb.T, landX: wg.baseX, wait: wait, size: s0 } : null;
      return;
    }
    this.solution = { pull: best.pull, angle: best.ang, T: best.T, landX: wg.baseX, wait: wait, size: s0 };
    var all = best.arc.slice(), bonus = r.int(1, 2);
    for (var b = 0; b < 30 && bonus > 0; b++) {                                // off-arc bonus fireflies (a puff / other angle)
      var a = best.arc[r.int(0, best.arc.length - 1)];
      var d = r.range(0.95, 1.5), side = r.chance(0.7) ? 1 : -1;
      var bx = a.x + r.range(-0.4, 0.4), by = a.y0 + side * d;
      if (ok(bx, by, all.map(function (q) { return { x: q.x, y: q.y0 }; }))) { all.push(mkFly(bx, by, true)); bonus--; }
    }
    this.flies = all;
  };

  /** does the shot with this pull pass close to a crow for a release 0.5–3 s from now? */
  World.prototype._arcHitsCrow = function (pull, s0, g0) {
    if (!this.crows.length) return false;
    var C = CONFIG, h = C.STEP, v = launchVelocity(pull.x, pull.y), i, w, p = { x: 0, y: 0 };
    var path = [], f = { x: this.sling.x + pull.x, y: this.sling.y + pull.y, vx: v.vx, vy: v.vy, size: s0, psize: s0, goal: g0, flightT: 0 };
    for (i = 0; i < 1000 && f.y - C.FOOT * f.size > C.GROUND_Y; i++) { stepBody(f, h); if (i % 5 === 0) path.push({ x: f.x, y: f.y, t: f.flightT, s: f.size }); }
    for (var c = 0; c < this.crows.length; c++) {
      var g = this.crows[c];
      for (w = 0.5; w <= 3.01; w += 0.5) for (i = 0; i < path.length; i++) {
        crowPos(g, g.t + w + path[i].t, p);
        var R = C.R_NUBI * path[i].s + g.r + 0.15, dx = path[i].x - p.x, dy = path[i].y - p.y;
        if (dx * dx + dy * dy < R * R) return true;
      }
    }
    return false;
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
    var v = launchVelocity(p.x, p.y), n = this.nubi;
    n.x = this.sling.x + p.x; n.y = this.sling.y + p.y;
    n.vx = v.vx; n.vy = v.vy; n.rot = M.atan2(v.vy, v.vx) * C.TILT * 0.5; n.state = 'fly'; n.flightT = 0;
    this.pull = null; this._pulled = false; this.puffed = this.fluttered = false;
    this.phase = 'fly'; this.phaseT = 0;
    this.shots++; this.stats.shots++;
    this._emit({ type: 'launch', power: L / C.PULL_MAX });
    return true;
  };
  World.prototype.puff = function () {
    if (this.phase !== 'fly' || this.puffed) return false;
    var n = this.nubi;
    if (n.vy > CONFIG.PUFF_VY) return false;                                // still shooting up: tap ignored, not used up
    n.vy = CONFIG.PUFF_VY;
    n.puffT = CONFIG.PUFF_T; if (n.bonkT <= 0) n.state = 'puff';
    this.puffed = this.fluttered = true; this.stats.puffs++;
    this._emit({ type: 'puff' });
    return true;
  };
  World.prototype.flutter = World.prototype.puff;

  // ---------- preview ----------
  World.prototype.previewCount = function () {
    if (this.phase !== 'aim' || !this.pull) return 0;
    return M.max(3, M.round(this.P.preview));
  };
  /** predicted flight from the current pull, released now: the very same step code (size growth, buoyancy, drag,
   *  firefly pickups and crow bumps included), sampled every dt (rounded to whole sub-steps); stops at the outcome */
  World.prototype.preview = function (n, dt) {
    var C = CONFIG, out = [];
    if (!this.pull || this.phase !== 'aim') return out;
    n = n === undefined ? this.previewCount() : n;
    var every = M.max(1, M.round((dt || C.PREVIEW_DT) / C.STEP)), steps = 0;
    var ctx = this._ctxCopy(null, false);
    this._simulate(ctx, this.pull, 0, null, null, null, null, function (f, o) {
      if (o) return true;
      if (++steps % every === 0) { out.push({ x: f.x, y: f.y, size: f.size }); if (out.length >= n) return true; }
      return false;
    });
    return out;
  };

  /** core predictor on ctx: release `pull` after `wait` s (movers + aim growth continue), optional puff at flight
   *  time puffAt; path (array) gets {x,y,vx,vy,s} per step; s0/g0 override the start size; onStep(f, outcome) → true
   *  stops. Without pull it continues the current flight. Returns the outcome summary. */
  World.prototype._simulate = function (ctx, pull, wait, puffAt, path, s0, g0, onStep) {
    var C = CONFIG, h = C.STEP, i, f, t = 0, N = this.nubi, puffed = this.puffed;
    if (pull) {
      var ss = s0 !== undefined && s0 !== null ? s0 : N.size;
      f = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, bonkT: 0, puffT: 0, flightT: 0, state: 'fly', size: ss, psize: ss,
        goal: g0 !== undefined && g0 !== null ? g0 : s0 !== undefined && s0 !== null ? s0 : N.goal };
      var n = M.round((wait || 0) / h);
      for (i = 0; i < n; i++) { stepMovers(ctx, h); growSize(f, h, C.GROW_RATE); t += h; }
      var p = clampPull(pull.x, pull.y), v = launchVelocity(p.x, p.y);
      f.x = this.sling.x + p.x; f.y = this.sling.y + p.y; f.vx = v.vx; f.vy = v.vy;
      puffed = false;
    } else {
      f = copy(N);
    }
    ctx.nubi = f;
    var res = { flies: 0, bumps: 0, value: 0, maxSize: f.size }, ft = 0;
    var hit = function (kind, o) { if (kind === 'fly') { res.flies++; res.value += o.value; } else res.bumps++; };
    for (var s = 0; s < 1500; s++) {
      if (puffAt !== undefined && puffAt !== null && !puffed && ft >= puffAt && f.vy <= C.PUFF_VY) { f.vy = C.PUFF_VY; puffed = true; }
      stepMovers(ctx, h); t += h; ft += h;
      var o = stepFlight(ctx, h, hit);
      if (f.size > res.maxSize) res.maxSize = f.size;
      if (path) path.push({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, s: f.size });
      if (onStep && onStep(f, o)) { if (!o) return res; }
      if (o) {
        var wg = ctx.wagon;
        res.type = o.type; res.x = o.x; res.y = o.y; res.t = t; res.flightT = f.flightT; res.wagonX = wg.x; res.size = f.size;
        res.off = o.type === 'land' ? o.off : f.x - wg.x; res.bull = o.type === 'land' && M.abs(o.off) <= wg.bull;
        return res;
      }
    }
    res.type = 'plop'; res.x = f.x; res.y = f.y; res.t = t; res.off = f.x - ctx.wagon.x; res.wagonX = ctx.wagon.x; res.size = f.size;
    return res;
  };

  /** Replay the future without touching the world: release `pull` after `wait` s (wagon/crows/fireflies keep moving,
   *  Nubi keeps growing), optional puff at flight time `puffAt`. When pull is null and Nubi is flying, continue the
   *  current flight (puffAt then counts from now). Returns {type: 'land'|'plop'|'flop', x, y, t, off, bull, flies,
   *  value, bumps, wagonX, flightT, size}. */
  /** Nubi's {size, goal} after `wait` more seconds of aiming (what a shot released then starts with) */
  World.prototype.sizeAfter = function (wait) {
    var f = { size: this.nubi.size, psize: this.nubi.size, goal: this.nubi.goal }, n = M.round((wait || 0) / CONFIG.STEP);
    for (var i = 0; i < n; i++) growSize(f, CONFIG.STEP, CONFIG.GROW_RATE);
    return { size: f.size, goal: f.goal };
  };

  World.prototype.predictShot = function (pull, wait, puffAt) {
    return this._simulate(this._ctxCopy(null, false), pull, wait, puffAt);
  };

  // ---------- simulation ----------
  World.prototype.update = function (dt) {
    var C = CONFIG;
    this.acc += M.min(M.max(+dt || 0, 0), 0.5);
    while (this.acc >= C.STEP) { this.acc -= C.STEP; this._step(C.STEP); }
    this.alpha = this.acc / C.STEP;
  };

  World.prototype._step = function (h) {
    var C = CONFIG, n = this.nubi;
    if (this.phase === 'over') { n.px = n.x; n.py = n.y; n.prot = n.rot; n.psize = n.size; return; }
    this.time += h; this.phaseT += h;
    n.px = n.x; n.py = n.y; n.prot = n.rot;
    stepMovers(this, h);

    if (this.phase === 'aim') {
      growSize(n, h, C.GROW_RATE);
      n.x = this.sling.x + (this.pull ? this.pull.x : 0); n.y = this.sling.y + (this.pull ? this.pull.y : 0);
      n.state = this.pull ? 'pull' : 'sit';
      n.rot = this.pull ? M.atan2(-this.pull.y, -this.pull.x) * 0.25 : 0;   // a slight lean along the band
    } else if (this.phase === 'fly') {
      var self = this;
      var out = stepFlight(this, h, function (kind, o) { self._hit(kind, o); });
      if (out) this._outcome(out);
    } else if (this.phase === 'land') {
      growSize(n, h, 0, C.SHRINK_EASE);                                        // raining uses the water up
      var wg = this.wagon, rel = n.x - wg.px;                                  // ride the wagon
      if (n.vx !== 0) {
        var sg = n.vx > 0 ? 1 : -1, nv = n.vx - sg * C.FRICTION * h;
        n.vx = nv * sg > 0 ? nv : 0;
      }
      rel += n.vx * h;
      var edge = wg.hw - C.DECK_EDGE;
      if (rel > edge) { rel = edge; n.vx = 0; } else if (rel < -edge) { rel = -edge; n.vx = 0; }
      n.x = wg.x + rel; n.y = wg.top + C.FOOT * n.size;                       // bottom stays on the soil as he shrinks
      n.rot *= M.exp(-10 * h);
      if (this.phaseT >= C.LAND_T) {
        if (this.levelLandings >= C.LANDINGS_PER_LEVEL) this._setLevel(this.level + 1, false);
        this._newShot(false);
      }
    } else if (this.phase === 'plop') {
      growSize(n, h, 0, C.SHRINK_EASE);
      n.y += (C.GROUND_Y + C.FOOT * n.size * C.PLOP_SQUASH - n.y) * (1 - M.exp(-C.PLOP_RATE * h));
      n.vx *= M.exp(-6 * h); n.x += n.vx * h;
      n.rot *= M.exp(-8 * h);
      if (this.phaseT >= C.PLOP_T) {
        if (this.hearts <= 0) {
          this.phase = 'over'; this.phaseT = 0;
          this._emit({ type: 'gameOver', score: this.score });
        } else this._newShot(false);
      }
    } else if (this.phase === 'flop') {
      growSize(n, h, 0);
      n.vx *= M.exp(-8 * h); n.x += n.vx * h; n.rot *= M.exp(-8 * h);
      n.y = C.BALE_TOP + C.FOOT * n.size;
      if (this.phaseT >= C.FLOP_T) this._retryShot();
    }
    this._sizeEvents();
  };

  /** grow {size} each time size crosses a 0.1 step upward; big once when it crosses BIG_AT */
  World.prototype._sizeEvents = function () {
    var n = this.nubi, C = CONFIG;
    if (n.size > this.stats.maxSize) this.stats.maxSize = n.size;
    if (n.size > n.psize) {
      if (M.floor(n.size * 10 + 1e-9) > M.floor(n.psize * 10 + 1e-9)) this._emit({ type: 'grow', size: M.floor(n.size * 10 + 1e-9) / 10 });
      if (n.psize < C.BIG_AT && n.size >= C.BIG_AT) this._emit({ type: 'big', size: n.size });
    }
  };

  World.prototype._hit = function (kind, o) {
    var C = CONFIG;
    if (kind === 'fly') {
      o.taken = true;
      this.flyCount++; this.score += o.value;
      this.stats.flies++; if (o.kind === 'gold') this.stats.goldFlies++;
      this._emit({ type: 'fly', x: o.x, y: o.y, value: o.value, kind: o.kind, count: this.flyCount, size: this.nubi.goal, id: o.id });
      if (this.flyCount % (this.D.heartEvery || C.HEART_EVERY) === 0 && this.hearts < this.maxHearts) {
        this.hearts++; this.stats.hearts++;
        this._emit({ type: 'heartGain', hearts: this.hearts });
      }
    } else if (kind === 'crow') {
      this.stats.bumps++;
      this._emit({ type: 'bump', x: this.nubi.x, y: this.nubi.y, id: o.id });
    }
  };

  World.prototype._outcome = function (o) {
    var C = CONFIG, n = this.nubi, wg = this.wagon;
    this.phaseT = 0;
    if (o.type === 'land') {
      var bull = M.abs(o.off) <= wg.bull, size = n.size, big = size >= C.BIG_AT;
      this.streak++; this.bestStreak = M.max(this.bestStreak, this.streak); this.stats.maxStreak = this.bestStreak;
      var pts = C.POINTS.land + (bull ? C.POINTS.bull : 0) + (big ? C.POINTS.big : 0) + M.min(C.POINTS.streakMax, this.streak - 1);
      this.score += pts; this.landings++; this.levelLandings++;
      this.stats.landings++; if (bull) this.stats.bulls++; if (big) this.stats.bigShowers++;
      n.goal = 1 + (n.goal - 1) * C.RAIN_KEEP;
      n.vx = (n.vx - (wg.x - wg.px) / C.STEP) * C.LAND_KEEP;                 // relative to the wagon
      n.vy = 0; n.state = 'rain'; n.bonkT = 0; n.puffT = 0;
      this.phase = 'land';
      this._emit({ type: 'land', x: o.x, y: o.y, points: pts, bull: bull, big: big, streak: this.streak, size: size, shrinkTo: n.goal });
    } else if (o.type === 'flop') {
      this.streak = 0; this.stats.flops++;
      n.vy = 0; n.vx *= 0.3; n.state = 'bonk'; n.bonkT = 0;
      this.phase = 'flop';
      this._emit({ type: 'flop', x: o.x, y: o.y });
    } else {
      this.streak = 0; this.stats.plops++;
      this.hearts = M.max(0, this.hearts - 1);
      n.goal = M.max(1, n.goal - C.PLOP_LOSS);
      n.vy = 0; n.state = 'plop'; n.bonkT = 0; n.puffT = 0;
      n.x = clamp(n.x, -0.6, 16.6);
      this.phase = 'plop';
      this._emit({ type: 'plop', x: n.x, y: C.GROUND_Y });
      this._emit({ type: 'heartLost', hearts: this.hearts });
    }
  };

  World.prototype.gotoLevel = function (i) {
    i = M.max(0, i | 0);
    if (this.phase === 'over') return;
    this._setLevel(i, false);
    this._newShot(false);
  };

  /** test hook: set Nubi's size at once (no easing); the fireflies of an aiming shot are re-laid for the new size */
  World.prototype.setSize = function (s) {
    var n = this.nubi; s = clamp(+s || 1, 1, CONFIG.SIZE_MAX);
    n.size = n.psize = n.goal = s;
    if (s > this.stats.maxSize) this.stats.maxSize = s;
    if (this.phase === 'aim') this._makeFlies();
  };

  World.prototype.getState = function () {
    var f = this.nubi, r = this.wagon, i, st = {};
    for (var s in this.stats) st[s] = this.stats[s];
    var flies = [], crows = [];
    for (i = 0; i < this.flies.length; i++) { var l = this.flies[i]; flies.push({ id: l.id, x: l.x, y: l.y, kind: l.kind, value: l.value }); }
    for (i = 0; i < this.crows.length; i++) { var g = this.crows[i]; crows.push({ id: g.id, x: g.x, y: g.y, vx: g.vx, r: g.r }); }
    return {
      time: this.time, phase: this.phase, phaseT: this.phaseT, difficulty: this.difficulty,
      level: this.level, zone: this.zone, loop: this.loop, levelName: this.P.name,
      score: this.score, hearts: this.hearts, maxHearts: this.maxHearts, flyCount: this.flyCount,
      landings: this.landings, levelLandings: this.levelLandings, shots: this.shots, streak: this.streak, bestStreak: this.bestStreak,
      puffed: this.puffed, pull: this.pull ? { x: this.pull.x, y: this.pull.y } : null, previewCount: this.previewCount(),
      nubi: { x: f.x, y: f.y, vx: f.vx, vy: f.vy, rot: f.rot, state: f.state, size: f.size, goal: f.goal },
      wagon: { x: r.x, top: r.top, hw: r.hw, bull: r.bull, baseX: r.baseX, amp: r.amp, period: r.period },
      flies: flies, crows: crows, stats: st
    };
  };

  CFF.World = World;
})(window.CFF = window.CFF || {});
