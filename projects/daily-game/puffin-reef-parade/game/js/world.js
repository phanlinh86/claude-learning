/* Dottie's Reef Parade — RP.CONFIG + RP.DIFFICULTY + RP.BIOMES + RP.World (headless, deterministic)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (world coords = logical canvas coords), seconds, radians. y grows DOWN,
 *  so a POSITIVE heading change turns Dottie CLOCKWISE on screen (to her right).
 *  update(dt) accepts any dt (e.g. 0.1 × 64 at high game speed) and runs fixed sub-steps of
 *  cfg.step (1/120 s) with an accumulator: w._acc = leftover time (0..step). The result depends
 *  only on the seed and on the sub-step index at which setDir/setTarget/action are called.
 *
 *  Render interpolation: at the START of each sub-step `_px,_py` are saved on the hero, every
 *  trail item and every note (incl. the golden star). drawX = _px + (x - _px) · (w._acc / w.cfg.step).
 *
 *  Drawing hints (docs/MECHANICS.md):
 *   - hero:  body centre (x, y) at swim height; draw Dottie at y − z, shadow on the sand at (x, y).
 *            `heading` = swim direction, `lean` −1..1 (+ = leaning into a clockwise turn), `facing` 1/−1.
 *   - trail: star centre (x, y − z). `pop` 1 → 0 just after joining (scale it up a bit). `gold` / `worth`.
 *   - notes: (x, y − z); 'spawn' pops in over t / spawnTime (gold: t / goldSpawnTime); 'loose' blinks when
 *            life < cfg.looseBlink; the golden star ('flee') blinks when life < cfg.goldBlink, faces
 *            `heading` (vx, vy = its velocity) and sinks into the sand during 'hide' (t / goldHideTime).
 * ========================================================================
 */
(function (RP) {
  'use strict';

  /* All tunables. Override per world with new RP.World({ config: {...} }) (e.g. RP.DIFFICULTY.easy). */
  var CONFIG = {
    // --- timing
    step: 1 / 120,                 // s, fixed simulation sub-step (render interpolates)
    readyTime: 1.2,                // s, 'ready' banner: Dottie swims slowly, no pickups
    clearTime: 2.4,                // s, 'cleared' celebration before the next season

    // --- arena (DESIGN §2: default for 960×540; renderer overrides with setArena)
    arena: [28, 76, 932, 516],     // x0, y0, x1, y1 px (inner side of the coral border)

    // --- Dottie
    heroR: 14,                     // px, body radius (sprite is 64 px)
    speed0: 150,                   // px/s in season 1, lap 0 (≈ 6 s to cross the 904 px arena)
    speedPerBiome: 6,              // px/s added per season (0..3)
    speedLapMul: 1.08,             // × per lap (endless loops get faster)
    speedPerNote: 0.6,             // px/s per parade star (a long parade has momentum)
    speedMax: 230,                 // px/s cap (min turning radius stays ≤ 55 px)
    readySpeed: 0.4,               // × speed while 'ready' / 'cleared' (gentle glide)
    speedAccel: 160,               // px/s² toward the target speed (recovers a bounce dip in ≈ 0.2 s)
    turnRate: 4.2,                 // rad/s max → min radius = 150 / 4.2 ≈ 36 px
    turnGain: 9,                   // 1/s, desired turn rate = heading error × gain (then clamped)
    turnEase: 12,                  // 1/s, angular velocity eases to the desired rate (63 % in 0.08 s: no snap)
    wallSlide: 36,                 // px: within this of the coral, the part of the wish pointing into it is dropped
    targetDead: 48,                // px, pointer within this → keep heading (no orbit jitter around the finger)
    bounceGrace: 0.8,              // s, no self-bonk right after a coral bounce (the fold-back is not the kid's fault)
    leanRate: 8,                   // 1/s, lean easing
    // edges
    bounceDip: 0.78,               // × speed on an edge bounce (soft coral absorbs a bit)
    bounceLock: 0.15,              // s, no steering after a bounce (so she doesn't turn straight back in)
    bounceGap: 0.08,               // s, min time between two `bounce` events (corner = one event)
    bounceSep: 1.05,               // rad (60°), min angle between the new heading and "straight back"
    bounceMinIn: 0.26,             // rad (15°), min angle into the arena after a bounce (no skimming the coral)

    // --- parade (trail)
    pathStep: 3,                   // px between recorded path points (ring buffer)
    pathCap: 2048,                 // points (≥ 6000 px of history; parade ≤ 41 × 24 px)
    trailSpacing: 24,              // px of path between consecutive stars (star sprite 30 px)
    joinTime: 0.25,                // s, a picked star flies to the end of the parade
    bounceAmp: 5,                  // px, |sin| bob height of parade stars
    bounceHz: 2.4,                 // bobs per second at speed0 (scales with speed)
    bouncePhase: 0.7,              // rad per index: a wave runs down the parade
    safeNeck: 4,                   // parade stars 0..safeNeck−1 never bonk (they hug the turn)
    bonkR: 17,                     // px, Dottie-centre ↔ star-centre distance for a bonk
    airZ: 6,                       // px, above this flip height Dottie passes over her parade
    edgeSafe: 36,                  // px from the coral (Dottie-centre bounds): no bonks in this soft strip

    // --- hearts / bonks
    heartsMax: 3,
    invulnTime: 1.5,               // s after a bonk (blink)
    dizzyBonk: 0.6,                // s dizzy after a bonk
    dizzySteer: 0.35,              // × steering authority while dizzy
    dizzySpeed: 0.85,              // × speed while dizzy
    happyTime: 0.35,               // s 'happy' frame after a pickup
    clearBonusPerHeart: 100,
    healOnClear: 1,

    // --- flip (somersault toward the surface)
    jumpTime: 0.65,                // s up high
    jumpHeight: 28,                // px apex of the parabola z = 4·H·u(1−u)
    flipRecharge: 3,               // s from take-off until charged again

    // --- sea stars
    notesOnField: 2,               // normal stars kept on the sand
    noteR: 15,                     // px (sprite 30)
    pickPad: 16,                   // pick radius = heroR + pickPad
    spawnTime: 0.3,                // s pop-in
    spawnMinDist: 120,             // px from Dottie
    spawnEdge: 40,                 // px inside the arena
    spawnTrailClear: 30,           // px from any parade star
    spawnNoteClear: 70,            // px from other stars
    goldChance: 0,                 // normal stars are never gold (the golden star is its own twist below)
    songTargets: [10, 12, 14, 16], // song length (sum of worth) per season
    songPerLap: 2,
    songMax: 40,
    notePoints: 10, notePerTrail: 2,  // star = 10 + 2 × parade length before the pickup
    regrabPoints: 5,
    // loose stars (cut off by a bonk)
    looseLife: 4,                  // s re-collectable, then pop
    looseBlink: 1.2,               // s of blinking before vanishing (renderer)
    looseMinAge: 0.35,             // s before a loose star can be re-grabbed (they drift away first)
    looseSpeed: [70, 140],         // px/s outward scatter
    looseVz: [150, 230],           // px/s up
    looseG: 700,                   // px/s² (arc apex 16–38 px, ≈ 0.5 s up)
    looseBounce: 0.35,             // restitution of the little bounce on the sand
    looseFric: 5,                  // 1/s sand friction (slides to a stop in ≈ 0.4 s)

    // --- golden sea star (the twist, DESIGN §5.1)
    goldFirst: 10,                 // s of 'playing' per level before the first one
    goldEvery: 18,                 // s after the previous one was caught or hid
    goldLife: 9,                   // s out of the sand ('spawn' + 'flee'), then it hides
    goldBlink: 2,                  // s of blinking before hiding (renderer)
    goldSpawnTime: 0.4,            // s pop out of the sand (does not move yet)
    goldHideTime: 0.5,             // s burrowing back in (cannot be caught)
    goldMinDist: 160,              // px from Dottie at spawn
    goldEdge: 60,                  // px inside the arena at spawn
    goldR: 18,                     // px (sprite 36): wall margin and pick radius bonus
    goldPickPad: 20,               // pick radius = heroR + goldPickPad (a bit kinder than a normal star)
    goldSpeed: 0.42,               // × Dottie's level speed when scared (normal: 63 px/s vs her 150)
    goldCalm: 0.45,                // × goldSpeed while Dottie is outside goldFear (a gentle wander)
    goldFear: 170,                 // px: within this it turns away from Dottie (stronger when closer)
    goldAccel: 120,                // px/s² speed easing (no instant starts)
    goldTurn: 2.6,                 // rad/s max turn rate (radius ≈ 24 px at 63 px/s)
    goldTurnGain: 4,               // 1/s heading error → turn rate
    goldTurnEase: 5,               // 1/s turn rate easing (63 % in 0.2 s: a soft curve, never a snap)
    goldWobble: 0.35,              // rad, heading wobble amplitude (sum of two sines)
    goldWall: 80,                  // px: wall awareness band (inward push + slide along)
    goldDart: 1.3,                 // × speed while darting sideways out of a corner
    goldDartTime: 0.8,             // s a corner dart lasts (side is latched, no dithering)
    goldWorth: 5,                  // song += 5 (the star counts as 5)
    goldMul: 5                     // points × 5
  };

  /* Difficulty presets: overrides merged over CONFIG. */
  var DIFFICULTY = {
    // ages 3–5: slow Dottie, 5 hearts, short songs, a forgiving parade, a slow and long-lived golden star
    easy: {
      speed0: 105, speedPerBiome: 4, heartsMax: 5,
      songTargets: [8, 10, 12, 14], trailSpacing: 22, spawnMinDist: 160,
      jumpTime: 0.8, flipRecharge: 2.4,
      safeNeck: 7, bonkR: 12, edgeSafe: 40,
      looseLife: 5, invulnTime: 1.8,
      goldLife: 11, goldSpeed: 0.32, goldFear: 140, goldPickPad: 24
    },
    // REQUIREMENT songs 10 / 12 / 14 / 16; stars spawn farther apart so a season is a real swim around the reef
    normal: { safeNeck: 6, bonkR: 14, trailSpacing: 22, spawnMinDist: 200 },
    // faster laps, wider turns, a longer and more spaced parade, no soft edge strip, no heal, a quicker golden star
    hard: {
      speed0: 185, speedPerBiome: 7, speedMax: 330, speedLapMul: 1.15, turnRate: 3.6,
      songTargets: [16, 20, 24, 28], songPerLap: 3, notesOnField: 1, spawnMinDist: 200,
      safeNeck: 3, bonkR: 18, edgeSafe: 0, trailSpacing: 26,
      invulnTime: 1.2, looseLife: 3.5, healOnClear: 0, bounceGrace: 0,
      goldLife: 7, goldSpeed: 0.5, goldFear: 200, goldPickPad: 16
    }
  };

  var BIOMES = ['Spring Bloom', 'Summer Shallows', 'Autumn Kelp', 'Winter Glow'];

  /* ---------- helpers ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) if (over[k] !== undefined) o[k] = over[k];
    return o;
  }

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    var a = this.cfg.arena;
    this.arena = { x0: a[0], y0: a[1], x1: a[2], y1: a[3] };
    this.avoid = [];
    var n = this.cfg.pathCap;
    this._pathX = new Float64Array(n); this._pathY = new Float64Array(n);
    this.reset();
  }
  World.CONFIG = CONFIG;

  /** reset([seed]) — level 0, score 0, full hearts, state 'ready'; Dottie at the centre heading right. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new RP.RNG(this.seed);
    this.time = 0; this.steps = 0;
    this.score = 0;
    this.heartsMax = c.heartsMax; this.hearts = c.heartsMax;
    this.notesTotal = 0; this.bonks = 0; this.flips = 0; this.golds = 0; this.goldMissed = 0;
    this.regrabs = 0; this.levelsCleared = 0;
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this._dir = null; this._target = null;
    this.hero = {
      x: 0, y: 0, heading: 0, speed: 0, turn: 0, lean: 0, jump: 0, z: 0, flip: 1, dizzy: 0, invuln: 0,
      frame: 'idle', facing: 1, happy: 0, lock: 0, _px: 0, _py: 0
    };
    this._emit({ type: 'start' });
    this.startLevel(0);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /** Numbers for level i (UI / tests / sim). */
  World.prototype.levelInfo = function (i) {
    var c = this.cfg, b = i % 4, lap = Math.floor(i / 4);
    return {
      biome: b, lap: lap,
      songTarget: Math.min(c.songMax, c.songTargets[b] + c.songPerLap * lap),
      speed: (c.speed0 + c.speedPerBiome * b) * Math.pow(c.speedLapMul, lap)
    };
  };

  /** startLevel(i): season = i % 4, lap = floor(i / 4); clears parade/stars, keeps score/hearts. */
  World.prototype.startLevel = function (i) {
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i), c = this.cfg, A = this.arena, s = this.hero;
    this.level = i; this.biome = info.biome; this.lap = info.lap;
    this.songTarget = info.songTarget; this._baseSpeed = info.speed;
    this.song = 0;
    this.levelTime = 0;
    this.state = 'ready'; this._stateT = 0;
    this.trail = []; this.notes = [];
    this._goldNext = c.goldFirst;
    s.x = (A.x0 + A.x1) / 2; s.y = (A.y0 + A.y1) / 2; s.heading = 0; s.turn = 0; s.lean = 0;
    s.speed = info.speed * c.readySpeed; s.jump = 0; s.z = 0; s.flip = 1; s.dizzy = 0; s.invuln = 0;
    s.happy = 0; s.lock = 0; s.facing = 1; s.frame = 'idle'; s._px = s.x; s._py = s.y;
    this._bounceT = 0; this._graceT = 0; this._hop = 0;
    // seed the path history with a straight line behind Dottie (clamped inside the arena)
    this._pathHead = -1; this._pathLen = 0;
    for (var k = 40; k >= 0; k--) this._pushPath(Math.max(A.x0 + c.heroR, s.x - k * c.pathStep), s.y);
    this._pushPath(s.x, s.y);
    this._fillNotes();
    this._emit({ type: 'biome', biome: this.biome, level: i, lap: this.lap });
    return this;
  };

  /* ------------------------------ arena ------------------------------ */
  /** setArena(x0, y0, x1, y1, avoid): the playable rectangle (may change any time, e.g. rotation).
   *  Everything is mapped proportionally from the old arena into the new one (Dottie, path, parade,
   *  stars), then clamped inside its margin; idle stars that end up in an `avoid` circle are re-placed. */
  World.prototype.setArena = function (x0, y0, x1, y1, avoid) {
    var c = this.cfg, O = this.arena, i, k;
    x0 = +x0; y0 = +y0; x1 = +x1; y1 = +y1;
    if (!(x1 - x0 > 4 * c.heroR) || !(y1 - y0 > 4 * c.heroR)) return this;
    this.avoid = [];
    if (avoid) for (i = 0; i < avoid.length; i++) this.avoid.push({ x: +avoid[i].x, y: +avoid[i].y, r: +avoid[i].r || 0 });
    var same = O.x0 === x0 && O.y0 === y0 && O.x1 === x1 && O.y1 === y1;
    if (!same) {
      var sx = (x1 - x0) / (O.x1 - O.x0), sy = (y1 - y0) / (O.y1 - O.y0);
      var mx = function (x) { return x0 + (x - O.x0) * sx; }, my = function (y) { return y0 + (y - O.y0) * sy; };
      var r = c.heroR, s = this.hero;
      s.x = clamp(mx(s.x), x0 + r, x1 - r); s.y = clamp(my(s.y), y0 + r, y1 - r); s._px = s.x; s._py = s.y;
      for (k = 0; k < this._pathLen; k++) {
        i = (this._pathHead - k + c.pathCap) % c.pathCap;
        this._pathX[i] = clamp(mx(this._pathX[i]), x0 + r, x1 - r);
        this._pathY[i] = clamp(my(this._pathY[i]), y0 + r, y1 - r);
      }
      for (i = 0; i < this.trail.length; i++) {
        var t = this.trail[i];
        t._jx = clamp(mx(t._jx), x0 + r, x1 - r); t._jy = clamp(my(t._jy), y0 + r, y1 - r);
      }
      for (i = 0; i < this.notes.length; i++) {
        var n = this.notes[i], m = n._g ? c.goldR : c.noteR;
        n.x = clamp(mx(n.x), x0 + m, x1 - m); n.y = clamp(my(n.y), y0 + m, y1 - m); n._px = n.x; n._py = n.y;
      }
    }
    this.arena = { x0: x0, y0: y0, x1: x1, y1: y1 };
    this._layoutTrail(0);
    for (i = 0; i < this.trail.length; i++) { this.trail[i]._px = this.trail[i].x; this.trail[i]._py = this.trail[i].y; }
    // idle stars under the avoid circles (or too close to the edge) → re-place; the golden star swims out itself
    for (i = this.notes.length - 1; i >= 0; i--) {
      var q = this.notes[i];
      if (q._g) { if (this.avoid.length) this._outOfAvoid(q, c.goldR); q._px = q.x; q._py = q.y; continue; }
      if (q.state !== 'loose' && !this._spotOk(q.x, q.y, c.spawnEdge * 0.5, 0, q)) {
        var spot = this._findSpot();
        q.x = q._px = spot.x; q.y = q._py = spot.y;
      }
    }
    return this;
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.setDir = function (dx, dy) {
    dx = +dx || 0; dy = +dy || 0;
    this._dir = (dx * dx + dy * dy > 1e-6) ? Math.atan2(dy, dx) : null;
  };
  World.prototype.setTarget = function (x, y) {
    if (x === null || x === undefined || !isFinite(x) || !isFinite(y)) { this._target = null; return; }
    if (!this._target) this._target = { x: 0, y: 0 };
    this._target.x = +x; this._target.y = +y;
  };
  /** Flip if charged and not already flipping. Returns true when Dottie flips. */
  World.prototype.action = function () {
    var s = this.hero;
    if ((this.state !== 'playing' && this.state !== 'ready') || s.flip < 1 || s.jump > 0) return false;
    s.flip = 0; s.jump = 1e-9; this.flips++;
    this._emit({ type: 'flip', x: s.x, y: s.y });
    return true;
  };

  /* ------------------------------ simulation ------------------------------ */
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += dt;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
  };

  World.prototype._step = function (h) {
    var c = this.cfg, s = this.hero, i, o;
    s._px = s.x; s._py = s.y;
    for (i = 0; i < this.trail.length; i++) { o = this.trail[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.notes.length; i++) { o = this.notes[i]; o._px = o.x; o._py = o.y; }
    this.time += h; this.steps++; this._stateT += h;

    var st = this.state;
    if (st === 'playing') this.levelTime += h;
    this._stepHero(h);
    this._layoutTrail(h);
    this._stepNotes(h);
    if (st === 'playing') {
      this._goldTimer(h);
      this._collide();
      if (this.state === 'playing') this._fillNotes();
    } else if (st === 'ready') {
      if (this._stateT >= c.readyTime) { this.state = 'playing'; this._stateT = 0; this._emit({ type: 'go', level: this.level }); }
    } else if (st === 'cleared') {
      if (this._stateT >= c.clearTime) this.startLevel(this.level + 1);
    }
  };

  /* ---- Dottie ---- */
  World.prototype._stepHero = function (h) {
    var c = this.cfg, s = this.hero, A = this.arena, st = this.state;
    // timers
    if (s.dizzy > 0) s.dizzy = Math.max(0, s.dizzy - h);
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - h);
    if (s.happy > 0) s.happy = Math.max(0, s.happy - h);
    if (s.lock > 0) s.lock = Math.max(0, s.lock - h);
    if (this._bounceT > 0) this._bounceT -= h;
    if (this._graceT > 0) this._graceT -= h;
    // flip
    if (s.flip < 1) {
      s.flip = Math.min(1, s.flip + h / c.flipRecharge);
      if (s.flip >= 1) this._emit({ type: 'flipready' });
    }
    if (s.jump > 0) {
      s.jump += h;
      if (s.jump >= c.jumpTime) { s.jump = 0; s.z = 0; this._emit({ type: 'land', x: s.x, y: s.y }); }
      else { var u = s.jump / c.jumpTime; s.z = 4 * c.jumpHeight * u * (1 - u); }
    }
    // speed
    var vt;
    if (st === 'dead') vt = 0;
    else {
      vt = Math.min(c.speedMax, this._baseSpeed + c.speedPerNote * this.trail.length);
      if (st !== 'playing') vt *= c.readySpeed;
      if (s.dizzy > 0) vt *= c.dizzySpeed;
    }
    var dv = c.speedAccel * h;
    s.speed = s.speed < vt ? Math.min(vt, s.speed + dv) : Math.max(vt, s.speed - dv);
    // steering: desired turn rate from the heading error, eased angular velocity
    var desired = null;
    if (st !== 'dead') {
      if (this._dir !== null) desired = this._dir;
      else if (this._target) {
        var dx = this._target.x - s.x, dy = this._target.y - s.y;
        if (dx * dx + dy * dy > c.targetDead * c.targetDead) desired = Math.atan2(dy, dx);
      }
    }
    // wall slide: a wish pointing into the coral she is next to becomes "along the coral"
    if (desired !== null) {
      var dvx = Math.cos(desired), dvy = Math.sin(desired), ws = c.wallSlide, R0 = c.heroR, zx = false, zy = false;
      if ((dvx < 0 && s.x - (A.x0 + R0) < ws) || (dvx > 0 && (A.x1 - R0) - s.x < ws)) { dvx = 0; zx = true; }
      if ((dvy < 0 && s.y - (A.y0 + R0) < ws) || (dvy > 0 && (A.y1 - R0) - s.y < ws)) { dvy = 0; zy = true; }
      if (zx && zy) desired = s.heading;                                   // into a corner: the bounce handles it
      else if (zx || zy) {
        if (zx && Math.abs(dvy) < 0.1) dvy = Math.sin(s.heading) >= 0 ? 1 : -1;
        if (zy && Math.abs(dvx) < 0.1) dvx = Math.cos(s.heading) >= 0 ? 1 : -1;
        desired = Math.atan2(dvy, dvx);
      }
    }
    var wTurn = 0;
    if (desired !== null && s.lock <= 0) {
      var auth = s.dizzy > 0 ? c.dizzySteer : 1, max = c.turnRate * auth;
      wTurn = clamp(wrap(desired - s.heading) * c.turnGain, -max, max);
    }
    s.turn += (wTurn - s.turn) * (1 - Math.exp(-c.turnEase * h));
    s.heading = wrap(s.heading + s.turn * h);
    // lean into the turn (centripetal feel ∝ ω·v)
    var leanT = clamp(s.turn / c.turnRate * (s.speed / c.speed0), -1, 1);
    s.lean += (leanT - s.lean) * (1 - Math.exp(-c.leanRate * h));
    // move
    s.x += Math.cos(s.heading) * s.speed * h; s.y += Math.sin(s.heading) * s.speed * h;
    // edges: mirror the position back inside, deflect the heading (bounceHeading), dip the speed
    var r = c.heroR, bx0 = A.x0 + r, bx1 = A.x1 - r, by0 = A.y0 + r, by1 = A.y1 - r, wx = 0, wy = 0;
    if (s.x < bx0) { s.x = Math.min(bx1, 2 * bx0 - s.x); wx = -1; }
    else if (s.x > bx1) { s.x = Math.max(bx0, 2 * bx1 - s.x); wx = 1; }
    if (s.y < by0) { s.y = Math.min(by1, 2 * by0 - s.y); wy = -1; }
    else if (s.y > by1) { s.y = Math.max(by0, 2 * by1 - s.y); wy = 1; }
    if (wx || wy) {
      s.heading = this.bounceHeading(s.heading, wx, wy, desired !== null ? wrap(desired - s.heading - Math.PI) : s.turn, s.x, s.y);
      s.turn = -s.turn * 0.5;
      s.lock = c.bounceLock;
      this._graceT = c.bounceGrace;
      if (this._bounceT <= 0) {
        s.speed *= c.bounceDip;
        this._bounceT = c.bounceGap;
        this._emit({ type: 'bounce', x: s.x, y: s.y });
      }
    }
    // facing with hysteresis
    var hc = Math.cos(s.heading);
    if (hc > 0.15) s.facing = 1; else if (hc < -0.15) s.facing = -1;
    s.frame = s.jump > 0 ? 'jump' : s.dizzy > 0 ? 'ouch' : (s.happy > 0 || st === 'cleared') ? 'happy' : 'idle';
    // path history
    var hx = this._pathX[this._pathHead], hy = this._pathY[this._pathHead];
    var ddx = s.x - hx, ddy = s.y - hy;
    if (ddx * ddx + ddy * ddy >= c.pathStep * c.pathStep) this._pushPath(s.x, s.y);
    // parade bob phase advances with distance
    this._hop += TAU * c.bounceHz * (s.speed / c.speed0) * h;
    if (this._hop > 1e4) this._hop -= TAU * 1000;
  };

  /** Edge deflection. h0 = heading into the wall; wx/wy = −1 (left/top wall), +1 (right/bottom), 0.
   *  1. mirror the outward component(s);
   *  2. never send Dottie straight back along her own parade: the new heading is kept ≥ bounceSep away
   *     from the reversed incoming heading (a head-on hit glances off to the side of `pref`, a hint
   *     sign: the player's steering wish, else the current turn). If (x, y) is given and another wall
   *     is within wallSlide (a corner), glance away from that one;
   *  3. never skim the coral: inward component ≥ sin(bounceMinIn) for every wall that was hit. */
  World.prototype.bounceHeading = function (h0, wx, wy, pref, x, y) {
    var c = this.cfg, cx = Math.cos(h0), sy = Math.sin(h0);
    if (wx < 0 && cx < 0) cx = -cx; else if (wx > 0 && cx > 0) cx = -cx;
    if (wy < 0 && sy < 0) sy = -sy; else if (wy > 0 && sy > 0) sy = -sy;
    var ho = Math.atan2(sy, cx), rev = wrap(h0 + Math.PI), d = wrap(ho - rev), sep = c.bounceSep;
    if (Math.abs(d) < sep) {
      var sg = Math.abs(d) > 1e-3 ? (d > 0 ? 1 : -1) : (pref > 0 ? 1 : pref < 0 ? -1 : 1);
      var a = rev + sg * sep, b = rev - sg * sep;
      var nx = 0, ny = 0;
      if (x !== undefined) {
        var A = this.arena, R0 = c.heroR, ws = c.wallSlide;
        if (!wx) nx = x - (A.x0 + R0) < ws ? -1 : (A.x1 - R0) - x < ws ? 1 : 0;
        if (!wy) ny = y - (A.y0 + R0) < ws ? -1 : (A.y1 - R0) - y < ws ? 1 : 0;
      }
      var okA = this._inwardOk(a, wx, wy), okB = this._inwardOk(b, wx, wy);
      if ((nx || ny) && okA && okB) {
        var awayA = Math.cos(a) * -nx + Math.sin(a) * -ny, awayB = Math.cos(b) * -nx + Math.sin(b) * -ny;
        ho = awayB > awayA ? b : a;
      } else ho = okA ? a : okB ? b : a;
    }
    var m = Math.sin(c.bounceMinIn);
    cx = Math.cos(ho); sy = Math.sin(ho);
    if (wx < 0 && cx < m) cx = m; else if (wx > 0 && cx > -m) cx = -m;
    if (wy < 0 && sy < m) sy = m; else if (wy > 0 && sy > -m) sy = -m;
    return Math.atan2(sy, cx);
  };
  World.prototype._inwardOk = function (h, wx, wy) {
    var m = Math.sin(this.cfg.bounceMinIn), cx = Math.cos(h), sy = Math.sin(h);
    return !((wx < 0 && cx < m) || (wx > 0 && cx > -m) || (wy < 0 && sy < m) || (wy > 0 && sy > -m));
  };

  World.prototype._pushPath = function (x, y) {
    var cap = this.cfg.pathCap;
    this._pathHead = (this._pathHead + 1) % cap;
    this._pathX[this._pathHead] = x; this._pathY[this._pathHead] = y;
    if (this._pathLen < cap) this._pathLen++;
  };

  /** Point at arc length `d` behind Dottie along the path → writes into out {x, y}. */
  World.prototype.pathPoint = function (d, out) {
    out = out || {};
    var c = this.cfg, s = this.hero, cap = c.pathCap, px = s.x, py = s.y, k, i, acc = 0;
    for (k = 0; k < this._pathLen; k++) {
      i = (this._pathHead - k + cap) % cap;
      var qx = this._pathX[i], qy = this._pathY[i], sl = Math.sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py));
      if (acc + sl >= d) { var f = sl > 0 ? (d - acc) / sl : 0; out.x = px + (qx - px) * f; out.y = py + (qy - py) * f; return out; }
      acc += sl; px = qx; py = qy;
    }
    out.x = px; out.y = py;
    return out;
  };

  /* Parade star i at arc length (i+1)·spacing behind Dottie: one pass along the ring buffer. */
  World.prototype._layoutTrail = function (h) {
    var c = this.cfg, s = this.hero, T = this.trail, n = T.length;
    if (!n) return;
    var cap = c.pathCap, px = s.x, py = s.y, acc = 0, k = 0, j = 0, d = c.trailSpacing;
    var qx, qy, sl = 0, have = false, moving = clamp(s.speed / c.speed0, 0, 1.4);
    while (j < n) {
      if (!have) {
        if (k >= this._pathLen) break;
        var idx = (this._pathHead - k + cap) % cap;
        qx = this._pathX[idx]; qy = this._pathY[idx];
        sl = Math.sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py));
        have = true;
      }
      if (acc + sl >= d) {
        var f = sl > 0 ? (d - acc) / sl : 0;
        this._place(T[j], j, px + (qx - px) * f, py + (qy - py) * f, h, moving);
        j++; d += c.trailSpacing;
      } else { acc += sl; px = qx; py = qy; have = false; k++; }
    }
    for (; j < n; j++) this._place(T[j], j, px, py, h, moving);   // ran out of history: stack at the oldest point
  };

  World.prototype._place = function (t, j, x, y, h, moving) {
    var c = this.cfg;
    t.phase = j * c.bouncePhase;
    t.z = c.bounceAmp * moving * Math.abs(Math.sin(this._hop - t.phase));
    if (t.join < 1) {
      t.join = Math.min(1, t.join + h / c.joinTime);
      var e = 1 - (1 - t.join) * (1 - t.join);           // ease-out flight to the slot
      t.x = t._jx + (x - t._jx) * e; t.y = t._jy + (y - t._jy) * e;
      t.z += 18 * Math.sin(Math.PI * t.join);            // little hop onto the parade
    } else { t.x = x; t.y = y; t._jx = x; t._jy = y; }
    if (t.pop > 0) t.pop = Math.max(0, t.pop - h / (c.joinTime * 1.6));
  };

  /* ---- stars ---- */
  World.prototype._spotOk = function (x, y, edge, minHero, self) {
    var c = this.cfg, A = this.arena, s = this.hero, i;
    if (x < A.x0 + edge || x > A.x1 - edge || y < A.y0 + edge || y > A.y1 - edge) return false;
    if (minHero > 0 && (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < minHero * minHero) return false;
    for (i = 0; i < this.avoid.length; i++) {
      var a = this.avoid[i], rr = a.r + c.noteR + 4;
      if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < rr * rr) return false;
    }
    var tc = c.spawnTrailClear;
    for (i = 0; i < this.trail.length; i++) {
      var t = this.trail[i];
      if ((x - t.x) * (x - t.x) + (y - t.y) * (y - t.y) < tc * tc) return false;
    }
    if (self === undefined) {
      var nc = c.spawnNoteClear;
      for (i = 0; i < this.notes.length; i++) {
        var n = this.notes[i];
        if ((x - n.x) * (x - n.x) + (y - n.y) * (y - n.y) < nc * nc) return false;
      }
    }
    return true;
  };

  World.prototype._findSpot = function (minDist, edge) {
    var c = this.cfg, A = this.arena, r = this.rng, e = edge || c.spawnEdge, x = 0, y = 0;
    e = Math.min(e, 0.45 * Math.min(A.x1 - A.x0, A.y1 - A.y0));
    var minD = Math.min(minDist || c.spawnMinDist, 0.4 * Math.min(A.x1 - A.x0, A.y1 - A.y0) + 40);
    for (var pass = 0; pass < 3; pass++) {
      for (var k = 0; k < 30; k++) {
        x = r.range(A.x0 + e, A.x1 - e); y = r.range(A.y0 + e, A.y1 - e);
        if (this._spotOk(x, y, e, pass === 2 ? minD * 0.5 : minD, pass === 0 ? undefined : null)) return { x: x, y: y };
      }
    }
    return { x: x, y: y };      // crowded: last candidate (always inside the arena)
  };

  World.prototype._fillNotes = function () {
    var c = this.cfg, n = 0, i;
    for (i = 0; i < this.notes.length; i++) if (this.notes[i].state !== 'loose' && !this.notes[i]._g) n++;
    while (n < c.notesOnField) {
      var spot = this._findSpot(), gold = this.rng.chance(c.goldChance);
      this.notes.push({ id: this._nextId++, x: spot.x, y: spot.y, kind: this.rng.int(0, 3), gold: gold, worth: 1, t: 0,
        state: 'spawn', life: 0, vx: 0, vy: 0, z: 0, vz: 0, heading: 0, _px: spot.x, _py: spot.y });
      n++;
    }
  };

  World.prototype._stepNotes = function (h) {
    var c = this.cfg, A = this.arena, m = c.noteR, i;
    for (i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      n.t += h;
      if (n._g) { if (this._stepGold(n, h)) this.notes.splice(i, 1); continue; }
      if (n.state === 'spawn') { if (n.t >= c.spawnTime) n.state = 'idle'; continue; }
      if (n.state !== 'loose') continue;
      n.life -= h;
      if (n.life <= 0) { this.notes.splice(i, 1); this._emit({ type: 'loosegone', x: n.x, y: n.y }); continue; }
      // ballistic hop with a small bounce, then friction on the sand
      if (n.z > 0 || n.vz > 0) {
        n.vz -= c.looseG * h; n.z += n.vz * h;
        if (n.z <= 0) {
          n.z = 0;
          if (n.vz < -60) { n.vz = -n.vz * c.looseBounce; n.vx *= 0.7; n.vy *= 0.7; } else n.vz = 0;
        }
      } else { var f = Math.exp(-c.looseFric * h); n.vx *= f; n.vy *= f; }
      n.x += n.vx * h; n.y += n.vy * h;
      if (n.x < A.x0 + m) { n.x = A.x0 + m; n.vx = Math.abs(n.vx) * 0.5; } else if (n.x > A.x1 - m) { n.x = A.x1 - m; n.vx = -Math.abs(n.vx) * 0.5; }
      if (n.y < A.y0 + m) { n.y = A.y0 + m; n.vy = Math.abs(n.vy) * 0.5; } else if (n.y > A.y1 - m) { n.y = A.y1 - m; n.vy = -Math.abs(n.vy) * 0.5; }
      if (this.avoid.length) this._outOfAvoid(n, m);
    }
  };

  /* Push a point out of the `avoid` circles (the touch flip button), then back inside the arena. */
  World.prototype._outOfAvoid = function (p, m) {
    var A = this.arena;
    for (var k = 0; k < this.avoid.length; k++) {
      var a = this.avoid[k], dx = p.x - a.x, dy = p.y - a.y, d = Math.sqrt(dx * dx + dy * dy), R = a.r + m;
      if (d >= R) continue;
      // push toward the arena centre side so it never ends up off-screen in the corner
      var ux = d > 1 ? dx / d : -1, uy = d > 1 ? dy / d : -1;
      if (ux > 0 && a.x + R > A.x1 - m) ux = -Math.abs(ux) || -1;
      if (uy > 0 && a.y + R > A.y1 - m) uy = -Math.abs(uy) || -1;
      var L = Math.sqrt(ux * ux + uy * uy); ux /= L; uy /= L;
      p.x = clamp(a.x + ux * R, A.x0 + m, A.x1 - m); p.y = clamp(a.y + uy * R, A.y0 + m, A.y1 - m);
      if (p.vx !== undefined && !p._g) { p.vx *= 0.3; p.vy *= 0.3; }
    }
  };

  /* ---- golden sea star (DESIGN §5.1) ---- */
  /** The live golden star (state 'spawn' | 'flee' | 'hide'), or null. A cut-off gold parade star is 'loose', not this. */
  World.prototype.goldStar = function () {
    for (var i = 0; i < this.notes.length; i++) if (this.notes[i]._g) return this.notes[i];
    return null;
  };

  World.prototype._goldTimer = function (h) {
    if (this.goldStar()) return;
    this._goldNext -= h;
    if (this._goldNext <= 0) this._spawnGold();
  };

  /** Test hook: spawn the golden star now (if none is out). Returns it. */
  World.prototype.goldNow = function () {
    return this.goldStar() || this._spawnGold();
  };

  World.prototype._spawnGold = function () {
    var c = this.cfg, r = this.rng, s = this.hero;
    var spot = this._findSpot(c.goldMinDist, c.goldEdge);
    // away from Dottie at first, with a random swerve
    var h0 = Math.atan2(spot.y - s.y, spot.x - s.x) + r.range(-1.2, 1.2);
    var g = { id: this._nextId++, x: spot.x, y: spot.y, kind: r.int(0, 3), gold: true, worth: c.goldWorth, t: 0,
      state: 'spawn', life: c.goldLife, vx: 0, vy: 0, z: 0, vz: 0, heading: h0,
      speed: 0, turn: 0, _g: true, _wander: h0, _ph1: r.range(0, TAU), _ph2: r.range(0, TAU), _ph3: r.range(0, TAU),
      _dartT: 0, _dartX: 0, _dartY: 0, _px: spot.x, _py: spot.y };
    this.notes.push(g);
    this._goldNext = c.goldEvery;
    this._emit({ type: 'goldspawn', x: g.x, y: g.y, id: g.id });
    return g;
  };

  /* Steering model (all eased, so it reads as a little creature, not a cursor):
   *   desired direction D = wander (slowly drifting heading)
   *                       + flee: away from Dottie × 3·(1 − d/goldFear)   (only within goldFear)
   *                       + walls: inward push ∝ (1 − dw/goldWall)² for each wall in the band
   *                       + avoid circles (flip button): pushed out the same way
   *   slide: the into-wall part of D is faded out near a wall, so it glides along instead of pressing in;
   *   corner escape: when scared and the walls cancel the flee (|D| small or ≥ 2 walls near), it darts
   *     sideways — perpendicular to Dottie's approach, the side with more room / against her motion —
   *     for goldDartTime at goldDart × speed (side latched).
   *   heading turns toward atan2(D) + wobble with an eased, capped turn rate; speed eases to
   *   goldSpeed × level speed × (goldCalm … 1 by fear) (× goldDart while darting).
   *   A hard clamp keeps it inside the arena (the heading is turned along the wall it touched).
   * Returns true when it should be removed (finished hiding). */
  World.prototype._stepGold = function (g, h) {
    var c = this.cfg, A = this.arena, s = this.hero, m = c.goldR;
    if (g.state === 'spawn') {
      g.life -= h;
      if (g.t >= c.goldSpawnTime) { g.state = 'flee'; g.t = 0; }
      return false;
    }
    if (g.state === 'hide') {
      g.speed = Math.max(0, g.speed - 4 * c.goldAccel * h);
      g.x += Math.cos(g.heading) * g.speed * h; g.y += Math.sin(g.heading) * g.speed * h;
      g.x = clamp(g.x, A.x0 + m, A.x1 - m); g.y = clamp(g.y, A.y0 + m, A.y1 - m);
      g.vx = Math.cos(g.heading) * g.speed; g.vy = Math.sin(g.heading) * g.speed;
      if (g.t >= c.goldHideTime) { this._goldNext = c.goldEvery; return true; }
      return false;
    }
    // --- flee
    if (this.state === 'playing') g.life -= h;
    if (g.life <= 0 && this.state === 'playing') {
      g.state = 'hide'; g.t = 0; this.goldMissed++;
      this._emit({ type: 'goldhide', x: g.x, y: g.y, id: g.id });
      return false;
    }
    var T = this.time;
    g._wander = wrap(g._wander + (0.8 * Math.sin(T * 0.53 + g._ph1) + 0.5 * Math.sin(T * 1.27 + g._ph2)) * h);
    var Dx = Math.cos(g._wander), Dy = Math.sin(g._wander);
    var ax = g.x - s.x, ay = g.y - s.y, d = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= d; ay /= d;
    var fear = this.state === 'playing' ? clamp(1 - d / c.goldFear, 0, 1) : 0;
    if (fear > 0) { Dx += ax * 3 * fear; Dy += ay * 3 * fear; }
    // walls: distances from the star centre to each wall (its own margin included)
    var W = c.goldWall, dl = g.x - (A.x0 + m), dr = (A.x1 - m) - g.x, dt = g.y - (A.y0 + m), db = (A.y1 - m) - g.y;
    var near = 0, k;
    if (dl < W) { k = 1 - dl / W; Dx += 2.2 * k * k; near++; }
    if (dr < W) { k = 1 - dr / W; Dx -= 2.2 * k * k; near++; }
    if (dt < W) { k = 1 - dt / W; Dy += 2.2 * k * k; near++; }
    if (db < W) { k = 1 - db / W; Dy -= 2.2 * k * k; near++; }
    for (var i = 0; i < this.avoid.length; i++) {
      var av = this.avoid[i], ox = g.x - av.x, oy = g.y - av.y, od = Math.sqrt(ox * ox + oy * oy) || 1, band = av.r + m + 50;
      if (od < band) { k = 1 - (od - av.r - m) / 50; k = clamp(k, 0, 1.5); Dx += 2.2 * k * ox / od; Dy += 2.2 * k * oy / od; }
    }
    // slide: fade out the component pressing into a close wall
    var S = W * 0.5;
    if (Dx < 0 && dl < S) Dx *= dl / S; else if (Dx > 0 && dr < S) Dx *= dr / S;
    if (Dy < 0 && dt < S) Dy *= dt / S; else if (Dy > 0 && db < S) Dy *= db / S;
    // corner escape: dart sideways across Dottie's approach (side latched for goldDartTime)
    var L = Math.sqrt(Dx * Dx + Dy * Dy);
    if (g._dartT > 0) g._dartT -= h;
    else if (fear > 0.25 && (near >= 2 || L < 0.7)) {
      var px = -ay, py = ax, cxm = (A.x0 + A.x1) / 2 - g.x, cym = (A.y0 + A.y1) / 2 - g.y, cl = Math.sqrt(cxm * cxm + cym * cym) || 1;
      var hvx = Math.cos(s.heading), hvy = Math.sin(s.heading);
      var score = (px * cxm + py * cym) / cl - 0.8 * (px * hvx + py * hvy);
      if (score < 0) { px = -px; py = -py; }
      g._dartX = px; g._dartY = py; g._dartT = c.goldDartTime;
    }
    var dart = g._dartT > 0;
    if (dart) {
      Dx += g._dartX * 2.5; Dy += g._dartY * 2.5;
      if (Dx < 0 && dl < S) Dx *= dl / S; else if (Dx > 0 && dr < S) Dx *= dr / S;
      if (Dy < 0 && dt < S) Dy *= dt / S; else if (Dy > 0 && db < S) Dy *= db / S;
    }
    var want = (Dx * Dx + Dy * Dy > 1e-8 ? Math.atan2(Dy, Dx) : g.heading) +
      c.goldWobble * (0.7 * Math.sin(T * 2.3 + g._ph3) + 0.3 * Math.sin(T * 4.1 + g._ph1));
    var cmd = clamp(wrap(want - g.heading) * c.goldTurnGain, -c.goldTurn, c.goldTurn) * (dart ? 1.4 : 1);
    g.turn += (cmd - g.turn) * (1 - Math.exp(-c.goldTurnEase * h));
    g.heading = wrap(g.heading + g.turn * h);
    var vt = this._baseSpeed * c.goldSpeed * (c.goldCalm + (1 - c.goldCalm) * fear) * (dart ? c.goldDart : 1);
    if (this.state !== 'playing') vt *= 0.5;
    var dv = c.goldAccel * h;
    g.speed = g.speed < vt ? Math.min(vt, g.speed + dv) : Math.max(vt, g.speed - dv);
    g.x += Math.cos(g.heading) * g.speed * h; g.y += Math.sin(g.heading) * g.speed * h;
    // hard bounds: clamp the position (it slides along the wall); the heading is never snapped — the slide and
    // inward push above already turn the wish along / away from the wall, so it curves off smoothly
    var x0 = g.x, y0 = g.y;
    g.x = clamp(g.x, A.x0 + m, A.x1 - m); g.y = clamp(g.y, A.y0 + m, A.y1 - m);
    if (this.avoid.length) this._outOfAvoid(g, m);
    // velocity = actual motion this step (what the renderer and the bot see)
    var mvx = Math.cos(g.heading) * g.speed, mvy = Math.sin(g.heading) * g.speed;
    if (g.x !== x0) mvx = 0;
    if (g.y !== y0) mvy = 0;
    g.vx = mvx; g.vy = mvy;
    return false;
  };

  /* Turn parade items [from, to) loose: scatter outward from (ox, oy) in ballistic arcs. */
  World.prototype._loosen = function (from, to, ox, oy) {
    var c = this.cfg, r = this.rng, out = this.trail.splice(from, to - from);
    for (var i = 0; i < out.length; i++) {
      var t = out[i], dx = t.x - ox, dy = t.y - oy, d = Math.sqrt(dx * dx + dy * dy);
      var ang = d > 1 ? Math.atan2(dy, dx) : r.range(0, TAU);
      ang += r.range(-0.6, 0.6);
      var sp = r.range(c.looseSpeed[0], c.looseSpeed[1]);
      this.notes.push({ id: this._nextId++, x: t.x, y: t.y, kind: t.kind, gold: t.gold, worth: t.worth, t: 0, state: 'loose', life: c.looseLife,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, z: Math.max(0, t.z), vz: r.range(c.looseVz[0], c.looseVz[1]), heading: 0, _px: t.x, _py: t.y });
    }
    this._songSum();
    return out.length;
  };

  /** w.song = sum of worth over the parade (capped at songTarget). */
  World.prototype._songSum = function () {
    var s = 0;
    for (var i = 0; i < this.trail.length; i++) s += this.trail[i].worth;
    this._songRaw = s;
    this.song = Math.min(this.songTarget, s);
    return s;
  };

  /* ---- collisions: pickups, self-bonk ---- */
  World.prototype._collide = function () {
    var c = this.cfg, s = this.hero, i, pr = c.heroR + c.pickPad, gr = c.heroR + c.goldPickPad;
    for (i = 0; i < this.notes.length; i++) {
      var n = this.notes[i];
      if (n.state === 'loose' && (n.t < c.looseMinAge || n.z > 20)) continue;
      if (n.state === 'hide') continue;
      var dx = n.x - s.x, dy = n.y - s.y, R = n._g ? gr : pr;
      if (dx * dx + dy * dy > R * R) continue;
      this.notes.splice(i, 1); i--;
      this._pick(n);
      if (this.state !== 'playing') return;
    }
    if (s.z > c.airZ || s.invuln > 0 || this._graceT > 0 || this.inEdgeZone(s.x, s.y)) return;
    var T = this.trail, br2 = c.bonkR * c.bonkR;
    for (i = c.safeNeck; i < T.length; i++) {
      var t = T[i];
      if (t.join < 1) continue;                // still hopping onto the parade
      var ex = t.x - s.x, ey = t.y - s.y;
      if (ex * ex + ey * ey < br2) { this._bonk(i); return; }
    }
  };

  /** True when (x, y) is within cfg.edgeSafe of the arena bounds (Dottie-centre bounds): no bonks there. */
  World.prototype.inEdgeZone = function (x, y) {
    var c = this.cfg, A = this.arena, r = c.heroR, e = c.edgeSafe;
    return x - (A.x0 + r) < e || (A.x1 - r) - x < e || y - (A.y0 + r) < e || (A.y1 - r) - y < e;
  };

  World.prototype._pick = function (n) {
    var c = this.cfg, s = this.hero, regrab = n.state === 'loose', star = !!n._g;
    var len = this.trail.length, worth = n.worth || 1;
    var pts = regrab ? c.regrabPoints : (c.notePoints + c.notePerTrail * len) * (n.gold ? c.goldMul : 1);
    this.trail.push({ x: n.x, y: n.y, kind: n.kind, gold: !!n.gold, worth: worth, z: 0, phase: len * c.bouncePhase, pop: 1, join: 0,
      _jx: n.x, _jy: n.y, _px: n.x, _py: n.y });
    this._songSum();
    this.score += pts; this.notesTotal++;
    s.happy = c.happyTime;
    if (regrab) { this.regrabs++; this._emit({ type: 'regrab', x: n.x, y: n.y, gold: !!n.gold, worth: worth }); }
    this._emit({ type: 'note', x: n.x, y: n.y, kind: n.kind, gold: !!n.gold, worth: worth, points: pts, song: this.song,
      index: this.trail.length - 1, regrab: regrab });
    if (star) {
      this.golds++; this._goldNext = c.goldEvery;
      this._emit({ type: 'gold', x: n.x, y: n.y, points: pts, worth: worth, id: n.id });
    }
    if (this._songRaw >= this.songTarget) this._clear();
  };

  World.prototype._bonk = function (i) {
    var c = this.cfg, s = this.hero;
    this.hearts--; this.bonks++;
    s.invuln = c.invulnTime; s.dizzy = c.dizzyBonk; s.frame = 'ouch';
    var hx = this.trail[i].x, hy = this.trail[i].y;
    var lost = this._loosen(i, this.trail.length, hx, hy);
    this._emit({ type: 'bonk', x: hx, y: hy, hearts: this.hearts, lost: lost });
    if (this.hearts <= 0) this._die();
  };

  World.prototype._clear = function () {
    var c = this.cfg;
    var bonus = this.hearts * c.clearBonusPerHeart;
    this.score += bonus;
    this.hearts = Math.min(this.heartsMax, this.hearts + c.healOnClear);
    this.levelsCleared++;
    this.state = 'cleared'; this._stateT = 0;
    this._emit({ type: 'songdone', level: this.level });
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
    this.notes.length = 0;
  };

  World.prototype._die = function () {
    this.state = 'dead'; this._stateT = 0;
    this._emit({ type: 'dead', score: this.score });
  };

  /** Snapshot for debug / tests. */
  World.prototype.getState = function () {
    var s = this.hero, g = this.goldStar();
    return {
      state: this.state, level: this.level, biome: this.biome, lap: this.lap, time: this.time, levelTime: this.levelTime,
      score: this.score, hearts: this.hearts, song: this.song, songTarget: this.songTarget, trail: this.trail.length,
      notes: this.notes.length, bonks: this.bonks, golds: this.golds, goldMissed: this.goldMissed,
      gold: g ? { x: g.x, y: g.y, state: g.state, life: g.life } : null, goldNext: this._goldNext,
      hero: { x: s.x, y: s.y, heading: s.heading, speed: s.speed, z: s.z, flip: s.flip }
    };
  };

  RP.CONFIG = CONFIG;
  RP.DIFFICULTY = DIFFICULTY;
  RP.BIOMES = BIOMES;
  RP.World = World;
})(window.RP = window.RP || {});
