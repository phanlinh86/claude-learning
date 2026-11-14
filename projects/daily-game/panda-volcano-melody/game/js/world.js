/* Tofu's Volcano Melody — PVM.CONFIG, PVM.DIFFICULTY, PVM.LEVELS, PVM.ARENA/VOLCANO/CRATER/SPAWN, PVM.World
 * Headless, deterministic simulation (no DOM). Contract: docs/DESIGN.md §5. Tuning notes: docs/MECHANICS.md.
 *
 *   const w = new PVM.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, config: {} });
 *   w.setTarget(x, y) / w.clearTarget() / w.setAxis(ax, ay)
 *   w.update(dt); w.drainEvents(); w.getState(); w.gotoLevel(i); w.alpha
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px on the 960×540 stage, seconds, radians. y grows DOWN.
 *  Every entity's (x, y) is its GROUND point (feet / shadow centre). Airborne things have z (px above
 *  the ground, up = +z); the renderer draws them at y − z with a shadow at y.
 *  update(dt) runs fixed sub-steps of CONFIG.step (1/120 s) with an accumulator; `alpha` = leftover / step
 *  for render interpolation: drawX = prevX + (x − prevX) · alpha (same for y and z).
 *  All collisions are circles on the ground plane. Results depend only on the seed and on the sub-step at
 *  which input arrives, so the same seed + the same input stream = the same game.
 * ========================================================================
 */
(function (PVM) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---------------- stage geometry (DESIGN §2) ---------------- */
  var ARENA = { x: 40, y: 92, w: 880, h: 420 };            // where ground points may be
  var VOLCANO = { x: 480, y: 330 };                        // base centre (sprite anchor)
  var VOLCANO_COLLIDER = { x: 480, y: 305, r: 78 };        // solid circle
  var CRATER = { x: 480, y: 196 };                         // screen point where notes / smoke leave
  var SPAWN = { x: 480, y: 470 };                          // Tofu's start, below the volcano

  /* Prop colliders relative to the prop's ground point (DESIGN §5). */
  var PROP_COLLIDERS = {
    palm: { dy: -8, r: 18 },
    rock: { dy: -16, r: 28 },
    bush: { dy: -18, r: 28 }
  };

  /* ---------------- tunables ---------------- */
  var CONFIG = {
    // --- timing
    step: 1 / 120,          // s; fixed simulation sub-step (smooth, deterministic, cheap)
    maxDt: 0.25,            // s; largest dt accepted per update() (tab-out guard; speed ×8 at 30 fps still fits)
    introTime: 1.2,         // s; season banner. Tofu may walk, nothing else moves or spawns
    clearTime: 2.6,         // s; celebration: leftover notes fly to Tofu, crabs doze, then next season

    // --- Tofu (the panda)
    tofuR: 18,              // px; collider radius (≈ half his 36 px wide body at 72 px drawn size)
    accel: 1900,            // px/s²; towards the wanted velocity: 0 → 230 px/s in ≈0.12 s (weighty, not instant)
    brake: 1900,            // px/s²; with no input: 230 → 0 in ≈0.12 s, ≈14 px of slide (no ice feeling)
    arriveR: 6,             // px; pointer-follow stops inside this
    arriveSafety: 0.85,     // ×; fraction of the braking distance used by the arrive profile (no overshoot)
    faceDeadZone: 25,       // px/s; |vx| needed to turn around (no flicker when walking straight up/down)
    stride: 120,            // px per walk cycle (2 footfalls) → a `step` event every ≈0.26 s at full speed
    walkMin: 20,            // px/s; below this Tofu is 'idle'
    happyTime: 0.45,        // s; arms-up after catching a note
    hurtTime: 0.8,          // s; dizzy after a pinch (input ignored while the knock-back slides out)
    knockBack: 260,         // px/s; push away from the crab on a pinch
    hurtBrake: 800,         // px/s²; friction during the knock-back → ≈42 px slide
    invulnTime: 2.5,        // s; safe blink after a pinch
    hitForgive: 10,          // px; crab and Tofu must overlap this much before a pinch (kind hitbox for kids)
    steerPad: 4,            // px; extra clearance when Tofu auto-steers around an obstacle towards the finger

    // --- notes
    pickR: 34,              // px; Tofu's ground point within this of a note's ground point = caught (generous)
    catchZ: 30,             // px; a note is catchable only below this height
    g: 900,                 // px/s²; gravity for notes and the mango (arcs ≈1.1 s: readable for kids)
    craterZ: 134,           // px; crater height above VOLCANO's ground point (330 − 196)
    eruptVz: [340, 420],    // px/s; launch speed upwards → apex ≈ 200–230 px, flight ≈1.0–1.2 s
    landMin: 120,           // px; landing distance from VOLCANO, min
    landMax: 300,           // px; … max (always inside ARENA, off obstacles)
    bounce: 0.35,           // restitution of the one small bounce of a volcano note (≈25 px hop)
    bounceSlide: 0.25,      // × horizontal speed kept through the bounce (rolls ≈15 px further, then rests)
    popVz: 170,             // px/s; small hop when a note pops up on the meadow (≈16 px, 0.38 s)
    popDelay: 3.6,          // s; between two pop-ups (the field refills gently: walking, not vacuuming)
    noteSpacing: 56,        // px; min distance between two notes
    noteEdge: 26,           // px; notes stay this far inside ARENA (sprite 40 px never clipped by the beach)
    noteTop: 116,           // px; min ground y of a note (keeps it well clear of the HUD band, y < 92)
    noteFromTofu: 150,      // px; pop-ups appear at least this far from Tofu (he has to walk for them)
    noteFromCrab: 60,       // px; … and from crabs
    noteFromObstacle: 60,   // px; … and from obstacle collider edges (pop-ups); volcano notes use noteObsPad
    noteObsPad: 26,         // px; volcano-note landing/rest spot clearance from collider edges (reachable)
    volcanoLifeExtra: 1.6,  // s; volcano notes live this much longer (their flight)
    extraNotes: 4,          // never more notes on the field than the level still needs + this
    blinkTime: 2,           // s; renderer blinks a note in its last 2 s (reads life − age)
    clearFly: 520,          // px/s; leftover notes fly to Tofu during 'clear'

    // --- volcano
    rumbleTime: 0.9,        // s; warning wobble before an eruption
    eruptCount: [2, 4],     // notes per eruption (inclusive)
    eruptJitter: 0.2,       // ±20 % on the eruption interval
    firstErupt: 0.55,       // × interval; the first eruption of a season comes a bit sooner
    puffTime: 0.6,          // s; `volcano.puffT` after an eruption (renderer: squash + glow)

    // --- combo / Coco the parrot
    helperAt: 5,            // reaching this combo summons Coco (or refreshes her if she is still around)
    helperTime: 7,          // s; Coco helps this long
    cocoInTime: 1.6,        // s; max time flying in before she starts helping
    cocoSeekR: 200,         // px; she goes for notes within this of Tofu
    cocoReach: 30,          // px; ground distance for her to collect a note
    cocoReachZ: 45,         // px; height difference allowed for a collect
    cocoK: 38,              // 1/s²; spring stiffness of her steering (ω ≈ 6.2 rad/s)
    cocoDamp: 0.7,          // damping ratio (< 1: a little overshoot = a swoop)
    cocoMaxSpeed: 560,      // px/s
    cocoOrbitR: 96,         // px; circle radius around Tofu (×0.6 vertically: an ellipse in 3/4 view)
    cocoOrbitW: 2.4,        // rad/s; orbit angular speed
    cocoZ: 100,              // px; flight height while circling
    cocoDiveZ: 10,          // px; height when swooping onto a note
    cocoKz: 30,             // 1/s²; vertical spring stiffness

    // --- crabs
    crabR: 16,              // px; collider radius (56×45 sprite)
    crabAccel: 700,         // px/s²; quick little scuttle starts/stops
    crabCapFrac: 0.5,       // crabs never exceed 0.5 × Tofu's speed (always escapable)
    crabSepDist: 46,        // px; crabs push apart inside this
    crabEnterTime: 0.9,     // s; walking in from the beach (harmless)
    crabFirstDelay: 0.6,    // s; after 'go' the first crab enters
    crabGap: 2.5,           // s; between crab entries
    crabSpawnMin: 300,      // px; entry point at least this far from Tofu (when possible)
    crabStride: 40,         // px per leg cycle (crab_1/crab_2 frames)
    chaseTime: [3, 6],      // s; a chase spell
    wanderTime: [2, 4],     // s; a wander spell
    wanderMul: 0.7,         // × speed while wandering
    scaredMul: 1.15,        // × speed while running from Coco
    wobble: 0.35,           // sideways scuttle amplitude (fraction of the forward direction)
    wobbleHz: 1.7,          // Hz; sideways scuttle frequency
    dizzyTime: 1.5,         // s; a crab stops after a pinch
    afterPinchAway: 300,    // px; then it wanders off to a spot at least this far from Tofu (no pinch chains)
    crabKnock: 140,         // px/s; the crab is pushed back after a pinch
    crabFriction: 5,        // 1/s; exponential velocity decay while dizzy
    steerPadCrab: 6,        // px; obstacle clearance when crabs steer around props

    // --- score / bonuses
    noteBase: 10,           // points per note
    noteStep: 2,            // + per combo step
    noteMaxCombo: 10,       // combo bonus caps at +20
    clearBonus: 50,         // season finished
    perfectBonus: 50,       // … without losing a heart
    mangoLife: 14            // s; a mango waits this long
  };

  /* Difficulty presets (season index 0 spring … 3 winter). */
  var DIFFICULTY = {
    easy: {
      hearts: 5,
      speed: 230,                       // px/s Tofu max speed
      crabSpeed: [36, 40, 44, 48],      // px/s (≈ 1/6 – 1/5 of Tofu)          (playtest: was 45/52/58/64)
      crabs: [1, 1, 1, 2],              //                                      (playtest: was 1/1/2/2)
      goal: [12, 14, 16, 18],           // notes in the song (≈ 45–60 s for a 4-year-old)
      erupt: [10, 9, 9, 8],             // s between eruptions
      notesOnField: 3,                  // pop-up notes kept on the meadow
      noteLife: 14,                     // s before a resting note fades
      comboWindow: 6,                   // s to keep a chain going (small kids walk slowly: Coco must be reachable)
      chaseFrac: 0.2,                   // probability a crab's next spell is a chase (else wander)
      mangoEvery: [8, 12],              // s between mango chances (only while a heart is missing)
      wanderPinch: false,               // a wandering crab only bumps Tofu aside; only a chasing one pinches
      loopCrabs: 0                      // extra crabs per year after winter (none on Easy)
    },
    normal: {
      hearts: 3, speed: 230,
      crabSpeed: [50, 56, 62, 68], crabs: [1, 1, 2, 2], goal: [24, 26, 28, 30], erupt: [10, 9, 9, 8],
      notesOnField: 2, noteLife: 12, comboWindow: 2.4, chaseFrac: 0.45, mangoEvery: [16, 24], wanderPinch: true, loopCrabs: 1
    },
    hard: {
      hearts: 3, speed: 235,
      crabSpeed: [66, 74, 82, 90], crabs: [2, 2, 3, 3], goal: [25, 27, 29, 30], erupt: [9, 8, 8, 7],
      notesOnField: 2, noteLife: 10, comboWindow: 2.0, chaseFrac: 0.6, mangoEvery: [20, 30], wanderPinch: true, loopCrabs: 1
    }
  };

  /* Prop layouts per season. Rules (checked by tests/unit/run.js): inside ARENA with ≥ 44 px between a
   * collider and the ARENA edge (Tofu is 36 px wide), ground points ≥ 110 px apart, collider ≥ 110 px from
   * the volcano circle's edge, ≥ 110 px from SPAWN, palms at y ≥ 190 (their crowns stay under the HUD). */
  var LEVELS = [
    { season: 'spring', props: [
      { kind: 'palm', x: 170, y: 200 }, { kind: 'rock', x: 790, y: 190 }, { kind: 'bush', x: 230, y: 440 }
    ] },
    { season: 'summer', props: [
      { kind: 'palm', x: 150, y: 190 }, { kind: 'rock', x: 760, y: 196 }, { kind: 'palm', x: 820, y: 410 },
      { kind: 'bush', x: 250, y: 430 }
    ] },
    { season: 'autumn', props: [
      { kind: 'palm', x: 130, y: 300 }, { kind: 'rock', x: 300, y: 190 }, { kind: 'rock', x: 820, y: 250 },
      { kind: 'bush', x: 700, y: 440 }, { kind: 'bush', x: 260, y: 450 }
    ] },
    { season: 'winter', props: [
      { kind: 'rock', x: 180, y: 210 }, { kind: 'palm', x: 770, y: 200 }, { kind: 'bush', x: 150, y: 420 },
      { kind: 'palm', x: 320, y: 440 }, { kind: 'rock', x: 800, y: 420 }
    ] }
  ];

  /* ---------------- small helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function merge(dst) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) dst[k] = s[k];
    }
    return dst;
  }

  /* Obstacle list for a level: props + the volcano, as { kind, x, y, cx, cy, r }. */
  function buildObstacles(levelIndex) {
    var L = LEVELS[((levelIndex % 4) + 4) % 4], out = [];
    out.push({ kind: 'volcano', x: VOLCANO.x, y: VOLCANO.y, cx: VOLCANO_COLLIDER.x, cy: VOLCANO_COLLIDER.y, r: VOLCANO_COLLIDER.r });
    for (var i = 0; i < L.props.length; i++) {
      var p = L.props[i], c = PROP_COLLIDERS[p.kind];
      out.push({ kind: p.kind, x: p.x, y: p.y, cx: p.x, cy: p.y + c.dy, r: c.r });
    }
    return out;
  }

  /* Steering around circles: unit direction from `e` towards (tx, ty) that bends around the first
   * obstacle blocking the straight line (aims at the tangent point of the circle grown by rad + pad).
   * The chosen side is remembered on e._side so it does not flip-flop when the target is right behind. */
  function steerAround(e, tx, ty, rad, pad, obstacles) {
    var dx = tx - e.x, dy = ty - e.y, dist = hyp(dx, dy);
    if (dist < 1e-6) return { x: 0, y: 0 };
    var ux = dx / dist, uy = dy / dist, best = null, bestT = Infinity, bestCross = 0, i;
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i], R = o.r + rad + pad;
      if (hyp(tx - o.cx, ty - o.cy) < R) continue;         // target sits on/in it: just walk up to it
      var cx = o.cx - e.x, cy = o.cy - e.y, t = cx * ux + cy * uy;
      if (t <= -R * 0.2 || t - R > dist) continue;           // behind us or beyond the target
      var cross = cx * uy - cy * ux;                         // signed distance of the centre from the line
      if (Math.abs(cross) >= R) continue;                    // the line misses it
      if (t < bestT) { bestT = t; best = o; bestCross = cross; }
    }
    if (!best) { e._side = 0; return { x: ux, y: uy }; }
    var bx = best.cx - e.x, by = best.cy - e.y, D = hyp(bx, by), RR = best.r + rad + pad;
    var side = bestCross >= 0 ? 1 : -1;
    if (e._side && Math.abs(bestCross) < RR * 0.35) side = e._side;      // keep the side we already chose
    e._side = side;
    var a = Math.atan2(by, bx);
    var off = D > RR ? Math.asin(RR / D) : Math.PI / 2 + Math.min(0.5, (RR - D) / RR);
    return { x: Math.cos(a + side * off), y: Math.sin(a + side * off) };
  }

  /* Push a circle (e, radius r) out of every obstacle; remove the inward part of its velocity (slide). */
  function collide(e, r, obstacles) {
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i], dx = e.x - o.cx, dy = e.y - o.cy, d = hyp(dx, dy), min = o.r + r;
        if (d >= min) continue;
        var nx, ny;
        if (d < 1e-6) { nx = 0; ny = 1; } else { nx = dx / d; ny = dy / d; }
        e.x = o.cx + nx * min; e.y = o.cy + ny * min;
        var vn = e.vx * nx + e.vy * ny;
        if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
      }
    }
  }

  /* Keep a circle's ground point inside ARENA inset by r; walls slide (normal velocity removed). */
  function clampArena(e, r) {
    var x0 = ARENA.x + r, x1 = ARENA.x + ARENA.w - r, y0 = ARENA.y + r, y1 = ARENA.y + ARENA.h - r;
    if (e.x < x0) { e.x = x0; if (e.vx < 0) e.vx = 0; }
    if (e.x > x1) { e.x = x1; if (e.vx > 0) e.vx = 0; }
    if (e.y < y0) { e.y = y0; if (e.vy < 0) e.vy = 0; }
    if (e.y > y1) { e.y = y1; if (e.vy > 0) e.vy = 0; }
  }

  /* Move velocity (vx, vy) towards (wx, wy) by at most a·dt (constant-acceleration approach). */
  function approach(e, wx, wy, a, dt) {
    var dvx = wx - e.vx, dvy = wy - e.vy, dv = hyp(dvx, dvy), m = a * dt;
    if (dv > m) { dvx *= m / dv; dvy *= m / dv; }
    e.vx += dvx; e.vy += dvy;
  }

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.opts = opts;
    this.difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.cfg = merge({}, CONFIG, opts.config);
    this.diff = merge({}, DIFFICULTY[this.difficulty], opts.diff);
    this.seed = opts.seed !== undefined && opts.seed !== null ? opts.seed : 1;
    this.startLevel = opts.level | 0;
    this.alpha = 0;
    this.reset();
  }

  World.CONFIG = CONFIG;

  World.prototype.reset = function () {
    var root = PVM.RNG(this.seed);
    this.rng = root.fork('world');          // spawns, landing spots, kinds
    this.crng = root.fork('crabs');         // crab moods (separate stream: crab AI never shifts note spawns)
    this._acc = 0;
    this.alpha = 0;
    this._events = [];
    this._nid = 0; this._cid = 0;
    this.t = 0;
    this.score = 0;
    this.maxHearts = this.diff.hearts;
    this.hearts = this.maxHearts;
    this.comboWindow = this.diff.comboWindow;
    this.stats = { notes: 0, volcanoNotes: 0, cocoNotes: 0, pinches: 0, mangoes: 0, levelsCleared: 0, perfectLevels: 0, bestCombo: 0, distance: 0 };
    this.target = null;
    this.axis = { x: 0, y: 0 };
    this.tofu = { x: SPAWN.x, y: SPAWN.y, prevX: SPAWN.x, prevY: SPAWN.y, vx: 0, vy: 0, face: 1, state: 'idle', stateT: 0, walk: 0, r: this.cfg.tofuR };
    this._lastKind = -1;
    this._setupLevel(this.startLevel);
  };

  World.prototype._emit = function (type, data) {
    var e = { type: type };
    if (data) for (var k in data) e[k] = data[k];
    this._events.push(e);
  };

  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  World.prototype._setupLevel = function (level) {
    var c = this.cfg, d = this.diff;
    this.level = level;
    this.season = level % 4;
    this.loop = Math.floor(level / 4);
    this.goal = d.goal[this.season] + 2 * this.loop;
    this.got = 0;
    this.combo = 0; this.comboT = 0;
    this.invulnT = 0;
    this.phase = 'intro'; this.phaseT = 0;
    this.notes = []; this.crabs = []; this.coco = null; this.mango = null;
    this.obstacles = buildObstacles(level);
    this.crabSpeed = Math.min(d.crabSpeed[this.season] * Math.min(1.35, Math.pow(1.1, this.loop)), c.crabCapFrac * d.speed);
    this._crabsLeft = d.crabs[this.season] + Math.min(2, (d.loopCrabs || 0) * Math.max(0, this.loop - 1));   // years 3+: one more crab per year (max +2)
    this._crabTimer = c.crabFirstDelay;
    this._popTimer = 0.2;
    this._mangoT = this.rng.range(d.mangoEvery[0], d.mangoEvery[1]);
    this._lostHeart = false;
    this._eruptN = 0;
    var iv = d.erupt[this.season];
    this.volcano = { rumbleT: 0, next: iv * c.firstErupt, puffT: 0 };
    var T = this.tofu;
    T.x = T.prevX = SPAWN.x; T.y = T.prevY = SPAWN.y; T.vx = T.vy = 0; T.state = 'idle'; T.stateT = 0;
    this.target = null;
    this._emit('intro', { level: level, season: this.season });
  };

  World.prototype.gotoLevel = function (i) {
    i = Math.max(0, i | 0);
    this._acc = 0;
    this._setupLevel(i);
  };

  /* ---------------- input ---------------- */
  World.prototype.setTarget = function (x, y) { this.target = { x: +x, y: +y }; };
  World.prototype.clearTarget = function () { this.target = null; };
  World.prototype.setAxis = function (ax, ay) {
    ax = clamp(+ax || 0, -1, 1); ay = clamp(+ay || 0, -1, 1);
    var m = hyp(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }                    // diagonals are not faster
    this.axis = { x: ax, y: ay };
  };

  /* ---------------- main loop ---------------- */
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var step = this.cfg.step;
    this._acc += Math.min(dt, this.cfg.maxDt);
    while (this._acc >= step) { this._acc -= step; this._step(step); }
    this.alpha = this._acc / step;
  };

  World.prototype._savePrev = function () {
    var T = this.tofu, i, e;
    T.prevX = T.x; T.prevY = T.y;
    for (i = 0; i < this.crabs.length; i++) { e = this.crabs[i]; e.prevX = e.x; e.prevY = e.y; }
    for (i = 0; i < this.notes.length; i++) { e = this.notes[i]; e.prevX = e.x; e.prevY = e.y; e.prevZ = e.z; }
    if (this.mango) { e = this.mango; e.prevX = e.x; e.prevY = e.y; e.prevZ = e.z; }
    if (this.coco) { e = this.coco; e.prevX = e.x; e.prevY = e.y; e.prevZ = e.z; }
  };

  World.prototype._step = function (dt) {
    var c = this.cfg;
    this._savePrev();
    this.t += dt;
    this.phaseT += dt;
    if (this.volcano.puffT > 0) this.volcano.puffT = Math.max(0, this.volcano.puffT - dt);

    if (this.phase === 'intro') {
      this._moveTofu(dt, true);
      if (this.phaseT >= c.introTime) { this.phase = 'playing'; this.phaseT = 0; this._emit('go'); }
      return;
    }
    if (this.phase === 'playing') {
      if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this._endCombo();
      }
      this._moveTofu(dt, true);
      this._spawnCrabs(dt);
      this._updateCrabs(dt);
      this._updateCoco(dt);
      this._updateNotes(dt);
      this._updateMango(dt);
      this._pickups();
      if (this.phase !== 'playing') return;              // the song just finished
      this._pinches();
      if (this.phase !== 'playing') return;              // last heart lost
      this._updateVolcano(dt);
      this._spawnPops(dt);
      return;
    }
    if (this.phase === 'clear') {
      this._moveTofu(dt, false);
      this._updateCrabs(dt);
      this._updateCoco(dt);
      this._clearNotesFly(dt);
      if (this.phaseT >= c.clearTime) {
        var next = this.level + 1;
        this._emit('levelUp', { level: next, season: next % 4 });
        this._setupLevel(next);
      }
      return;
    }
    // 'over': Tofu naps, the world rests
    this._moveTofu(dt, false);
    this._updateCoco(dt);
  };

  /* ---------------- Tofu ---------------- */
  World.prototype._moveTofu = function (dt, canInput) {
    var T = this.tofu, c = this.cfg, sp = this.diff.speed, wx = 0, wy = 0, acc = c.brake;
    T.stateT += dt;
    if (T.state === 'hurt') {
      acc = c.hurtBrake;                                   // knock-back slides out with friction
    } else if (canInput && T.state !== 'sleep') {
      var ax = this.axis.x, ay = this.axis.y;
      if (ax !== 0 || ay !== 0) {
        wx = ax * sp; wy = ay * sp; acc = c.accel;          // keyboard wins while held
      } else if (this.target) {
        var dx = this.target.x - T.x, dy = this.target.y - T.y, d = hyp(dx, dy);
        if (d > c.arriveR) {
          var dir = steerAround(T, this.target.x, this.target.y, T.r, c.steerPad, this.obstacles);
          // arrive: never faster than what the brake can stop before the target
          var vmax = Math.min(sp, Math.sqrt(2 * c.brake * c.arriveSafety * (d - c.arriveR)));
          wx = dir.x * vmax; wy = dir.y * vmax; acc = c.accel;
        }
      }
    }
    approach(T, wx, wy, acc, dt);
    var ox = T.x, oy = T.y;
    T.x += T.vx * dt; T.y += T.vy * dt;
    collide(T, T.r, this.obstacles);
    clampArena(T, T.r);
    var moved = hyp(T.x - ox, T.y - oy), speed = hyp(T.vx, T.vy);
    this.stats.distance += moved;
    var half = Math.floor(T.walk * 2);
    T.walk += moved / c.stride;
    if (Math.floor(T.walk * 2) > half && speed > c.walkMin && T.state !== 'hurt') this._emit('step', { x: T.x, y: T.y });
    if (T.vx > c.faceDeadZone) T.face = 1; else if (T.vx < -c.faceDeadZone) T.face = -1;
    // animation state
    var s = T.state;
    if (s === 'sleep') return;
    if (s === 'hurt' && T.stateT < c.hurtTime) return;
    if (s === 'happy' && T.stateT < c.happyTime) return;
    var ns = speed > c.walkMin ? 'walk' : 'idle';
    if (this.phase === 'clear') ns = 'happy';
    if (ns !== s) { T.state = ns; T.stateT = 0; }
  };

  World.prototype._setTofuState = function (s) { this.tofu.state = s; this.tofu.stateT = 0; };

  /* ---------------- spot finding ---------------- */
  World.prototype._inPlayRect = function (x, y, edge) {
    return x >= ARENA.x + edge && x <= ARENA.x + ARENA.w - edge && y >= Math.max(ARENA.y + edge, this.cfg.noteTop) && y <= ARENA.y + ARENA.h - edge;
  };

  World.prototype._clearOfObstacles = function (x, y, pad) {
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (hyp(x - o.cx, y - o.cy) < o.r + pad) return false;
    }
    return true;
  };

  World.prototype._farFromNotes = function (x, y, minD) {
    for (var i = 0; i < this.notes.length; i++) {
      var n = this.notes[i], px = n.landX !== undefined ? n.landX : n.x, py = n.landY !== undefined ? n.landY : n.y;
      if (hyp(x - px, y - py) < minD) return false;
    }
    if (this.mango && hyp(x - this.mango.x, y - this.mango.y) < minD) return false;
    return true;
  };

  /* A random reachable ground spot for a pop-up (note or mango). Constraints relax after 30 tries. */
  World.prototype._findSpot = function () {
    var c = this.cfg, r = this.rng, T = this.tofu;
    for (var tries = 0; tries < 60; tries++) {
      var k = tries < 30 ? 1 : 0.6;
      var x = r.range(ARENA.x + c.noteEdge, ARENA.x + ARENA.w - c.noteEdge);
      var y = r.range(c.noteTop, ARENA.y + ARENA.h - c.noteEdge);
      if (hyp(x - T.x, y - T.y) < c.noteFromTofu * k) continue;
      if (!this._clearOfObstacles(x, y, Math.max(c.noteObsPad, c.noteFromObstacle * k))) continue;
      if (!this._farFromNotes(x, y, c.noteSpacing * k)) continue;
      var bad = false;
      for (var i = 0; i < this.crabs.length; i++) if (hyp(x - this.crabs[i].x, y - this.crabs[i].y) < c.noteFromCrab * k) { bad = true; break; }
      if (bad) continue;
      return { x: x, y: y };
    }
    return null;
  };

  World.prototype._pickKind = function () {
    var k = this.rng.int(0, 3);
    if (k === this._lastKind) k = (k + 1 + this.rng.int(0, 2)) % 4;
    this._lastKind = k;
    return k;
  };

  World.prototype._room = function () { return this.goal - this.got + this.cfg.extraNotes - this.notes.length; };

  /* ---------------- notes ---------------- */
  World.prototype._spawnPops = function (dt) {
    this._popTimer -= dt;
    if (this._popTimer > 0) return;
    this._popTimer = this.cfg.popDelay;
    var pops = 0;
    for (var i = 0; i < this.notes.length; i++) if (this.notes[i].src === 'pop') pops++;
    if (pops >= this.diff.notesOnField || this._room() <= 0) return;
    var s = this._findSpot();
    if (!s) return;
    var n = {
      id: ++this._nid, kind: this._pickKind(), x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: this.cfg.popVz,
      prevX: s.x, prevY: s.y, prevZ: 0, state: 'fly', age: 0, life: this.diff.noteLife, src: 'pop'
    };
    this.notes.push(n);
    this._emit('pop', { id: n.id, kind: n.kind, x: n.x, y: n.y });
  };

  /* Plan a volcano note: launch speed, landing point L and rest point after the bounce, both valid. */
  World.prototype._planVolcanoNote = function () {
    var c = this.cfg, r = this.rng;
    for (var tries = 0; tries < 40; tries++) {
      var ang = r.range(0, TAU), dist = r.range(c.landMin, c.landMax);
      var lx = VOLCANO.x + Math.cos(ang) * dist, ly = VOLCANO.y + Math.sin(ang) * dist;
      var vz0 = r.range(c.eruptVz[0], c.eruptVz[1]);
      var T = (vz0 + Math.sqrt(vz0 * vz0 + 2 * c.g * c.craterZ)) / c.g;          // flight time to z = 0
      var vx = (lx - VOLCANO.x) / T, vy = (ly - VOLCANO.y) / T;
      var vzHit = vz0 - c.g * T;                                                 // < 0
      var tb = 2 * (-vzHit * c.bounce) / c.g;                                    // bounce air time
      var rx = lx + vx * c.bounceSlide * tb, ry = ly + vy * c.bounceSlide * tb;  // rest point
      if (!this._inPlayRect(lx, ly, c.noteEdge) || !this._inPlayRect(rx, ry, c.noteEdge)) continue;
      if (!this._clearOfObstacles(lx, ly, c.noteObsPad) || !this._clearOfObstacles(rx, ry, c.noteObsPad)) continue;
      if (!this._farFromNotes(rx, ry, c.noteSpacing * 0.8)) continue;
      return { vx: vx, vy: vy, vz: vz0, landX: lx, landY: ly, restX: rx, restY: ry, T: T };
    }
    return null;
  };

  World.prototype._erupt = function () {
    var c = this.cfg, n = Math.min(this._eruptN, this._room()), made = 0;
    for (var i = 0; i < n; i++) {
      var p = this._planVolcanoNote();
      if (!p) continue;
      this.notes.push({
        id: ++this._nid, kind: this._pickKind(), x: VOLCANO.x, y: VOLCANO.y, z: c.craterZ,
        vx: p.vx, vy: p.vy, vz: p.vz, prevX: VOLCANO.x, prevY: VOLCANO.y, prevZ: c.craterZ,
        state: 'fly', age: 0, life: this.diff.noteLife + c.volcanoLifeExtra, src: 'volcano',
        landX: p.restX, landY: p.restY, bounced: false
      });
      made++;
    }
    this.volcano.puffT = c.puffTime;
    this._emit('erupt', { n: made });
  };

  World.prototype._updateVolcano = function (dt) {
    var v = this.volcano, c = this.cfg;
    if (v.rumbleT > 0) {
      v.rumbleT -= dt;
      if (v.rumbleT <= 0) { v.rumbleT = 0; this._erupt(); }
      return;
    }
    v.next -= dt;
    if (v.next > 0) return;
    var n = Math.min(this.rng.int(c.eruptCount[0], c.eruptCount[1]), this._room());
    if (n < 1) { v.next = 1; return; }                       // field already full: try again soon
    this._eruptN = n;
    v.rumbleT = c.rumbleTime;
    v.next = this.diff.erupt[this.season] * this.rng.range(1 - c.eruptJitter, 1 + c.eruptJitter);
    this._emit('rumble');
  };

  World.prototype._updateNotes = function (dt) {
    var c = this.cfg, g = c.g;
    for (var i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      n.age += dt;
      if (n.state === 'fly') {
        n.x += n.vx * dt; n.y += n.vy * dt;
        n.z += n.vz * dt - 0.5 * g * dt * dt;                 // exact for constant gravity
        n.vz -= g * dt;
        if (n.z <= 0) {
          n.z = 0;
          if (n.src === 'volcano' && !n.bounced) {
            n.bounced = true;
            n.vz = -n.vz * c.bounce;                          // one small bounce
            n.vx *= c.bounceSlide; n.vy *= c.bounceSlide;
            this._emit('land', { id: n.id, x: n.x, y: n.y });
          } else {
            n.vz = 0; n.vx = 0; n.vy = 0; n.state = 'ground';
          }
        }
      }
      if (n.age >= n.life) { this.notes.splice(i, 1); this._emit('fade', { id: n.id }); }
    }
  };

  /* During 'clear' the leftover notes are sucked to Tofu (a little magnet flourish, no points). */
  World.prototype._clearNotesFly = function (dt) {
    var T = this.tofu, c = this.cfg;
    for (var i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i], dx = T.x - n.x, dy = T.y - n.y, d = hyp(dx, dy);
      n.state = 'fly';
      var s = Math.min(d, c.clearFly * Math.min(1, 0.3 + this.phaseT * 1.5) * dt);
      if (d > 1e-6) { n.x += dx / d * s; n.y += dy / d * s; n.vx = dx / d * c.clearFly; n.vy = dy / d * c.clearFly; }
      n.z += (24 - n.z) * Math.min(1, 8 * dt); n.vz = 0;
      if (d < 12) this.notes.splice(i, 1);
    }
    if (this.mango) this.mango = null;
  };

  World.prototype._catch = function (idx, byCoco) {
    var n = this.notes[idx], c = this.cfg;
    this.notes.splice(idx, 1);
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = this.comboWindow;
    var value = c.noteBase + c.noteStep * Math.min(c.noteMaxCombo, this.combo);
    this.score += value;
    this.got++;
    this.stats.notes++;
    if (n.src === 'volcano') this.stats.volcanoNotes++;
    if (byCoco) this.stats.cocoNotes++;
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    this._emit('note', { id: n.id, kind: n.kind, x: n.x, y: n.y, score: value, total: this.score, combo: this.combo, byCoco: !!byCoco, idx: this.got - 1 });
    if (!byCoco && this.tofu.state !== 'hurt') this._setTofuState('happy');
    if (this.got >= this.goal) { this._clearLevel(); return; }
    if (this.combo === c.helperAt) this._summonCoco();   // once per chain: break it and rebuild to call her again
  };

  World.prototype._endCombo = function () {
    if (this.combo > 0) this._emit('comboEnd', { n: this.combo });
    this.combo = 0; this.comboT = 0;
  };

  World.prototype._pickups = function () {
    var T = this.tofu, c = this.cfg, i;
    for (i = this.notes.length - 1; i >= 0 && this.phase === 'playing'; i--) {
      var n = this.notes[i];
      if (n.z < c.catchZ && hyp(n.x - T.x, n.y - T.y) < c.pickR) this._catch(i, false);
    }
    var m = this.mango;
    if (m && this.phase === 'playing' && m.z < c.catchZ && hyp(m.x - T.x, m.y - T.y) < c.pickR) {
      this.mango = null;
      this.hearts = Math.min(this.maxHearts, this.hearts + 1);
      this.stats.mangoes++;
      this._emit('mango', { x: m.x, y: m.y, hearts: this.hearts });
    }
  };

  World.prototype._clearLevel = function () {
    var c = this.cfg, perfect = !this._lostHeart, bonus = c.clearBonus + (perfect ? c.perfectBonus : 0);
    this.score += bonus;
    this.stats.levelsCleared++;
    if (perfect) this.stats.perfectLevels++;
    this.phase = 'clear'; this.phaseT = 0;
    this.comboT = 0;
    this._setTofuState('happy');
    this.volcano.rumbleT = 0;
    for (var i = 0; i < this.crabs.length; i++) { var k = this.crabs[i]; k.state = 'dizzy'; k.stateT = -99; }   // doze
    this._cocoLeave();
    this._emit('levelClear', { level: this.level, bonus: bonus, perfect: perfect });
  };

  /* ---------------- mango ---------------- */
  World.prototype._updateMango = function (dt) {
    var c = this.cfg, m = this.mango;
    if (m) {
      m.age += dt;
      if (m.vz !== 0 || m.z > 0) {
        m.z += m.vz * dt - 0.5 * c.g * dt * dt; m.vz -= c.g * dt;
        if (m.z <= 0) { m.z = 0; m.vz = 0; }
      }
      if (m.age >= m.life) this.mango = null;
      return;
    }
    this._mangoT -= dt;
    if (this._mangoT > 0) return;
    this._mangoT = this.rng.range(this.diff.mangoEvery[0], this.diff.mangoEvery[1]);
    if (this.hearts >= this.maxHearts) return;
    var s = this._findSpot();
    if (!s) return;
    this.mango = { x: s.x, y: s.y, z: 0, vz: 200, prevX: s.x, prevY: s.y, prevZ: 0, age: 0, life: c.mangoLife };
    this._emit('mangoPop', { x: s.x, y: s.y });
  };

  /* ---------------- crabs ---------------- */
  World.prototype._spawnCrabs = function (dt) {
    if (this._crabsLeft <= 0) return;
    this._crabTimer -= dt;
    if (this._crabTimer > 0) return;
    this._crabTimer = this.cfg.crabGap;
    this._spawnCrab();
  };

  /* Enter from a beach edge, far from Tofu. Returns the crab (tests use it). */
  World.prototype._spawnCrab = function () {
    var c = this.cfg, r = this.crng, T = this.tofu, best = null, bestD = -1, R = c.crabR;
    for (var i = 0; i < 12; i++) {
      var edge = r.int(0, 3), x, y, nx = 0, ny = 0;
      if (edge === 0) { x = ARENA.x + R; y = r.range(ARENA.y + 60, ARENA.y + ARENA.h - 40); nx = 1; }
      else if (edge === 1) { x = ARENA.x + ARENA.w - R; y = r.range(ARENA.y + 60, ARENA.y + ARENA.h - 40); nx = -1; }
      else if (edge === 2) { y = ARENA.y + R; x = r.range(ARENA.x + 60, ARENA.x + ARENA.w - 60); ny = 1; }
      else { y = ARENA.y + ARENA.h - R; x = r.range(ARENA.x + 60, ARENA.x + ARENA.w - 60); ny = -1; }
      if (!this._clearOfObstacles(x + nx * 60, y + ny * 60, R + 10) || !this._clearOfObstacles(x, y, R + 10)) continue;
      var d = hyp(x - T.x, y - T.y);
      if (d > bestD) { bestD = d; best = { x: x, y: y, nx: nx, ny: ny }; }
      if (d >= c.crabSpawnMin && i >= 3) break;
    }
    if (!best) best = { x: ARENA.x + R, y: ARENA.y + 100, nx: 1, ny: 0 };
    var k = {
      id: ++this._cid, x: best.x, y: best.y, prevX: best.x, prevY: best.y, vx: 0, vy: 0,
      state: 'enter', stateT: 0, walk: 0, r: R,
      _nx: best.nx, _ny: best.ny, _ph: r.range(0, TAU), _modeT: 0, _wx: 0, _wy: 0, _side: 0
    };
    this.crabs.push(k);
    this._crabsLeft--;
    this._emit('crabIn', { id: k.id });
    return k;
  };

  World.prototype._newMode = function (k) {
    var c = this.cfg, r = this.crng;
    if (r.chance(this.diff.chaseFrac)) { k.state = 'chase'; k._modeT = r.range(c.chaseTime[0], c.chaseTime[1]); }
    else { k.state = 'wander'; k._modeT = r.range(c.wanderTime[0], c.wanderTime[1]); this._wanderTarget(k); }
    k.stateT = 0;
  };

  /* Pick a wander destination off obstacles; `away` (px) = keep it at least that far from Tofu. */
  World.prototype._wanderTarget = function (k, away) {
    var r = this.crng, T = this.tofu;
    for (var i = 0; i < 30; i++) {
      var x = r.range(ARENA.x + 40, ARENA.x + ARENA.w - 40), y = r.range(ARENA.y + 40, ARENA.y + ARENA.h - 30);
      if (away && i < 24 && hyp(x - T.x, y - T.y) < away) continue;
      if (this._clearOfObstacles(x, y, k.r + 12)) { k._wx = x; k._wy = y; return; }
    }
    k._wx = this.tofu.x; k._wy = this.tofu.y;
  };

  World.prototype._updateCrabs = function (dt) {
    var c = this.cfg, T = this.tofu, sp = this.crabSpeed, cocoHelps = this.coco && this.coco.state !== 'out', i, j;
    for (i = 0; i < this.crabs.length; i++) {
      var k = this.crabs[i], wx = 0, wy = 0, acc = c.crabAccel, dir;
      k.stateT += dt;
      if (this.phase === 'playing' && cocoHelps && (k.state === 'chase' || k.state === 'wander')) { k.state = 'scared'; k.stateT = 0; }
      if (k.state === 'scared' && !cocoHelps) this._newMode(k);
      switch (k.state) {
        case 'enter':
          wx = k._nx * sp; wy = k._ny * sp;
          if (k.stateT >= c.crabEnterTime) { k.state = 'wander'; k._modeT = this.crng.range(1, 2); k.stateT = 0; this._wanderTarget(k); }
          break;
        case 'dizzy':
          k.vx *= Math.exp(-c.crabFriction * dt); k.vy *= Math.exp(-c.crabFriction * dt);
          acc = 0;
          if (this.phase === 'playing' && k.stateT >= c.dizzyTime) {
            // a satisfied grumpy crab: always one wander spell after a pinch before it may chase again
            k.state = 'wander'; k.stateT = 0; k._modeT = this.crng.range(c.wanderTime[0], c.wanderTime[1]); this._wanderTarget(k, c.afterPinchAway);
          }
          break;
        case 'scared':
          var ax = k.x - T.x, ay = k.y - T.y, ad = hyp(ax, ay) || 1;
          dir = steerAround(k, k.x + ax / ad * 200, k.y + ay / ad * 200, k.r, c.steerPadCrab, this.obstacles);
          wx = dir.x * sp * c.scaredMul; wy = dir.y * sp * c.scaredMul;
          break;
        case 'chase':
        case 'wander':
          k._modeT -= dt;
          if (k._modeT <= 0) { this._newMode(k); }
          var tx, ty, s;
          if (k.state === 'chase') { tx = T.x; ty = T.y; s = sp; }
          else {
            if (hyp(k._wx - k.x, k._wy - k.y) < 20) this._wanderTarget(k);
            tx = k._wx; ty = k._wy; s = sp * c.wanderMul;
          }
          dir = steerAround(k, tx, ty, k.r, c.steerPadCrab, this.obstacles);
          // sideways scuttle: a little perpendicular wobble
          var wob = c.wobble * Math.sin(TAU * c.wobbleHz * k.stateT + k._ph);
          var px = -dir.y, py = dir.x, ex = dir.x + px * wob, ey = dir.y + py * wob, el = hyp(ex, ey) || 1;
          wx = ex / el * s; wy = ey / el * s;
          break;
      }
      // separation from the other crabs (soft, in the wanted velocity)
      if (k.state !== 'dizzy') {
        for (j = 0; j < this.crabs.length; j++) {
          if (j === i) continue;
          var o = this.crabs[j], dx = k.x - o.x, dy = k.y - o.y, d = hyp(dx, dy);
          if (d < c.crabSepDist && d > 1e-6) { var f = (1 - d / c.crabSepDist) * sp * 1.2; wx += dx / d * f; wy += dy / d * f; }
        }
      }
      if (acc > 0) approach(k, wx, wy, acc, dt);
      var vm = hyp(k.vx, k.vy), cap = k.state === 'dizzy' ? c.crabKnock : sp * c.scaredMul;
      if (vm > cap) { k.vx *= cap / vm; k.vy *= cap / vm; }
      var ox = k.x, oy = k.y;
      k.x += k.vx * dt; k.y += k.vy * dt;
      collide(k, k.r, this.obstacles);
      clampArena(k, k.r);
      k.walk += hyp(k.x - ox, k.y - oy) / c.crabStride;
    }
    // hard separation (no overlapping shells)
    for (i = 0; i < this.crabs.length; i++) for (j = i + 1; j < this.crabs.length; j++) {
      var a = this.crabs[i], b = this.crabs[j], ddx = b.x - a.x, ddy = b.y - a.y, dd = hyp(ddx, ddy), mn = a.r + b.r;
      if (dd < mn && dd > 1e-6) {
        var push = (mn - dd) / 2, ux = ddx / dd, uy = ddy / dd;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        collide(a, a.r, this.obstacles); collide(b, b.r, this.obstacles); clampArena(a, a.r); clampArena(b, b.r);
      }
    }
  };

  World.prototype._pinches = function () {
    var c = this.cfg, T = this.tofu;
    for (var i = 0; i < this.crabs.length; i++) {
      var k = this.crabs[i], dx = T.x - k.x, dy = T.y - k.y, d = hyp(dx, dy), touch = T.r + k.r;
      if (d >= touch) continue;
      var harmful = k.state === 'chase' || (k.state === 'wander' && this.diff.wanderPinch !== false);
      if (harmful && this.invulnT <= 0 && d < touch - c.hitForgive) {
        var ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 1;
        this.hearts--;
        this._lostHeart = true;
        this.stats.pinches++;
        this.invulnT = c.invulnTime;
        this._setTofuState('hurt');
        T.vx = ux * c.knockBack; T.vy = uy * c.knockBack;
        k.state = 'dizzy'; k.stateT = 0;
        k.vx = -ux * c.crabKnock; k.vy = -uy * c.crabKnock;
        this._endCombo();
        this._emit('pinch', { x: (T.x + k.x) / 2, y: (T.y + k.y) / 2, hearts: this.hearts });
        if (this.hearts <= 0) { this._gameOver(); return; }
      } else if (d > 1e-6 && (!harmful || this.invulnT > 0)) {
        // no pinch possible (safe blink / dizzy / scared / entering): nudge the crab out so they never overlap
        var p = touch - d;
        k.x -= dx / d * p; k.y -= dy / d * p;
        collide(k, k.r, this.obstacles); clampArena(k, k.r);
      }
    }
  };

  World.prototype._gameOver = function () {
    this.phase = 'over'; this.phaseT = 0;
    this.hearts = 0;
    this.comboT = 0;
    this.target = null;
    this._setTofuState('sleep');
    this._cocoLeave();
    // the crabs doze off too, a little away from the napping panda (never on top of him)
    for (var i = 0; i < this.crabs.length; i++) {
      var k = this.crabs[i], dx = k.x - this.tofu.x, dy = k.y - this.tofu.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 80) { var nx = this.tofu.x + dx / d * 80, ny = this.tofu.y + dy / d * 80; k.x = nx; k.y = Math.max(ARENA.y, Math.min(ARENA.y + ARENA.h, ny)); k.prevX = k.x; k.prevY = k.y; }
      k.vx = 0; k.vy = 0; k.state = 'dizzy'; k.stateT = 0;
    }
    this._emit('gameOver', { score: this.score });
  };

  /* ---------------- Coco the parrot ---------------- */
  World.prototype._summonCoco = function () {
    var T = this.tofu, co = this.coco;
    if (co) {
      if (co.state === 'out') { co.state = 'help'; this._emit('helperIn'); }
      co.t = 0;                                              // refresh her timer
      return;
    }
    var fromLeft = T.x >= 480;                               // come in from the far side, so she is seen flying in
    var x = fromLeft ? -60 : 1020, y = clamp(T.y - 120, 100, 320);
    this.coco = { x: x, y: y, z: 90, prevX: x, prevY: y, prevZ: 90, vx: fromLeft ? 200 : -200, vy: 0, vz: 0,
      face: fromLeft ? 1 : -1, state: 'in', t: 0, flap: 0, ang: Math.atan2(y - T.y, x - T.x), goal: 0 };
    this._emit('helperIn');
  };

  World.prototype._cocoLeave = function () {
    if (this.coco && this.coco.state !== 'out') { this.coco.state = 'out'; this.coco.t = 0; this._emit('helperOut'); }
  };

  World.prototype._updateCoco = function (dt) {
    var co = this.coco;
    if (!co) return;
    var c = this.cfg, T = this.tofu, tx, ty, tz = c.cocoZ, note = null, i;
    co.t += dt;
    co.flap += dt * (co.state === 'out' ? 3.2 : 2.6);         // wing beats per second
    if (co.state === 'help' && co.t >= c.helperTime) this._cocoLeave();
    if (co.state === 'out') {
      tx = co.x < 480 ? -140 : 1100; ty = co.y - 80; tz = 120;
    } else {
      // nearest note (to her) within cocoSeekR of Tofu; she ignores notes still high in the air
      if (co.state === 'help' && this.phase === 'playing') {
        var bestD = Infinity;
        for (i = 0; i < this.notes.length; i++) {
          var n = this.notes[i];
          if (n.z > 80 || hyp(n.x - T.x, n.y - T.y) > c.cocoSeekR) continue;
          var dn = hyp(n.x - co.x, n.y - co.y);
          if (dn < bestD) { bestD = dn; note = n; }
        }
      }
      if (note) { tx = note.x; ty = note.y; tz = Math.max(c.cocoDiveZ, note.z); co.goal = note.id; }
      else {
        co.goal = 0;
        co.ang += c.cocoOrbitW * dt;
        tx = T.x + Math.cos(co.ang) * c.cocoOrbitR;
        ty = T.y + Math.sin(co.ang) * c.cocoOrbitR * 0.25;   // flat ellipse: she never sits on Tofu's face
      }
      if (co.state === 'in' && (co.t >= c.cocoInTime || hyp(tx - co.x, ty - co.y) < 60)) { co.state = 'help'; co.t = 0; }
    }
    // damped spring steering: a = k·(target − p) − 2ζ√k·v
    var k = c.cocoK, damp = 2 * c.cocoDamp * Math.sqrt(k);
    co.vx += (k * (tx - co.x) - damp * co.vx) * dt;
    co.vy += (k * (ty - co.y) - damp * co.vy) * dt;
    var v = hyp(co.vx, co.vy);
    if (v > c.cocoMaxSpeed) { co.vx *= c.cocoMaxSpeed / v; co.vy *= c.cocoMaxSpeed / v; }
    var kz = c.cocoKz;
    co.vz += (kz * (tz - co.z) - 2 * 0.9 * Math.sqrt(kz) * co.vz) * dt;
    co.x += co.vx * dt; co.y += co.vy * dt; co.z = Math.max(4, co.z + co.vz * dt);
    if (co.vx > 30) co.face = 1; else if (co.vx < -30) co.face = -1;
    // collect
    if (co.state !== 'out' && this.phase === 'playing') {
      for (i = this.notes.length - 1; i >= 0; i--) {
        var m = this.notes[i];
        if (hyp(m.x - co.x, m.y - co.y) < c.cocoReach && Math.abs(m.z - co.z) < c.cocoReachZ) { this._catch(i, true); if (this.phase !== 'playing') break; }
      }
    }
    if (this.coco && this.coco.state === 'out' && (co.x < -80 || co.x > 1040)) this.coco = null;
  };

  /* ---------------- state snapshot ---------------- */
  World.prototype.getState = function () {
    var self = this;
    var s = {
      t: self.t, level: self.level, season: self.season, loop: self.loop, phase: self.phase, phaseT: self.phaseT,
      score: self.score, hearts: self.hearts, maxHearts: self.maxHearts, got: self.got, goal: self.goal,
      combo: self.combo, comboT: self.comboT, comboWindow: self.comboWindow, invulnT: self.invulnT,
      difficulty: self.difficulty, crabSpeed: self.crabSpeed,
      tofu: self.tofu, crabs: self.crabs, notes: self.notes, mango: self.mango, coco: self.coco,
      volcano: self.volcano, stats: self.stats, obstacles: self.obstacles, target: self.target, axis: self.axis
    };
    return JSON.parse(JSON.stringify(s, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }));
  };

  /* ---------------- exports ---------------- */
  PVM.CONFIG = CONFIG;
  PVM.DIFFICULTY = DIFFICULTY;
  PVM.LEVELS = LEVELS;
  PVM.ARENA = ARENA;
  PVM.VOLCANO = VOLCANO;
  PVM.VOLCANO_COLLIDER = VOLCANO_COLLIDER;
  PVM.CRATER = CRATER;
  PVM.SPAWN = SPAWN;
  PVM.PROP_COLLIDERS = PROP_COLLIDERS;
  PVM.SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  PVM.buildObstacles = buildObstacles;
  PVM.steerAround = steerAround;
  PVM.World = World;
})(window.PVM = window.PVM || {});
