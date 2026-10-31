/* Spike's Dino Jam — DJ.CONFIG + DJ.DIFFICULTY + DJ.BIOMES + DJ.World (headless, deterministic)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (world coords = logical canvas coords), seconds, radians. y grows DOWN,
 *  so a POSITIVE heading change turns Spike CLOCKWISE on screen (to his right).
 *  update(dt) accepts any dt (e.g. 0.1 × 64 at high game speed) and runs fixed sub-steps of
 *  cfg.step (1/120 s) with an accumulator: w._acc = leftover time (0..step). The result depends
 *  only on the seed and on the sub-step index at which setDir/setTarget/action are called.
 *
 *  Render interpolation: at the START of each sub-step `_px,_py` are saved on spike, every
 *  trail item, every note, every pillow (landing spot, plus `_pcx,_pcy,_pz` for the flying
 *  pillow) and the boss. drawX = _px + (x - _px) · (w._acc / w.cfg.step).
 *
 *  Drawing hints (docs/MECHANICS.md):
 *   - spike: board centre (x, y) on the ground; draw the hedgehog at y − z. Board rotated by
 *            `heading`. `lean` −1..1: + = leaning into a clockwise (right-hand) turn; renderer
 *            rotates the body by lean × ~0.25 rad in the direction of travel. `facing` 1/−1.
 *   - trail: note centre (x, y − z). `pop` 1 → 0 just after joining (scale it up a bit).
 *   - notes: (x, y − z); 'spawn' pops in over cfg.spawnTime (t / spawnTime); 'loose' blink when
 *            life < cfg.looseBlink.
 *   - pillow: shadow at the landing spot (x, y), radius ∝ 1 − z / zMax (pillow.z0);
 *            the pillow itself at (cx, cy − z), rotated by rot. 'landed' sits on (x, y).
 *   - boss: screen position (x, y) (he flies above everything; no ground shadow needed).
 * ========================================================================
 */
(function (DJ) {
  'use strict';

  /* All tunables. Override per world with new DJ.World({ config: {...} }) (e.g. DJ.DIFFICULTY.easy). */
  var CONFIG = {
    // --- timing
    step: 1 / 120,                 // s, fixed simulation sub-step (render interpolates)
    readyTime: 1.2,                // s, 'ready' banner: Spike rolls slowly, no boss, no pickups
    clearTime: 2.4,                // s, 'cleared' celebration before the next biome

    // --- arena (DESIGN §2: default for 960×540; renderer overrides with setArena)
    arena: [28, 76, 932, 516],     // x0, y0, x1, y1 px (inner side of the bush border)

    // --- Spike
    spikeR: 14,                    // px, body radius (sprite is 64 px; the board ≈ 60×25)
    speed0: 150,                   // px/s on biome 1, lap 0 (≈ 6 s to cross the 904 px arena)
    speedPerBiome: 6,              // px/s added per biome (0..3)
    speedLapMul: 1.08,             // × per lap (endless loops get faster)
    speedPerNote: 0.6,             // px/s per trail note (a long train has momentum)
    speedMax: 230,                 // px/s cap (min turning radius stays ≤ 55 px)
    readySpeed: 0.4,               // × speed while 'ready' / 'cleared' (gentle roll)
    speedAccel: 160,               // px/s² toward the target speed (recovers a bounce dip in ≈ 0.2 s)
    turnRate: 4.2,                 // rad/s max → min radius = 150 / 4.2 ≈ 36 px (DESIGN: ≈ 38)
    turnGain: 9,                   // 1/s, desired turn rate = heading error × gain (then clamped)
    turnEase: 12,                  // 1/s, angular velocity eases to the desired rate (63 % in 0.08 s: no snap)
    wallSlide: 36,                 // px: within this of a bush, the part of the wish pointing into it is dropped
    targetDead: 24,                // px, pointer within this → keep heading (no orbit jitter)
    leanRate: 8,                   // 1/s, lean easing
    // edges
    bounceDip: 0.78,               // × speed on an edge bounce (a soft bush absorbs a bit)
    bounceLock: 0.15,              // s, no steering after a bounce (so he doesn't turn straight back in)
    bounceGap: 0.08,               // s, min time between two `bounce` events (corner = one event)
    bounceSep: 1.05,               // rad (60°), min angle between the new heading and "straight back": a head-on
                                   //  hit glances off, so Spike never rolls back into his own trail (index ≥ 4 is
                                   //  ≥ 120·sin(30°) = 60 px away; a reversal along a bush ends ≥ 30 px from the old lane)
    bounceMinIn: 0.26,             // rad (15°), min angle into the arena after a bounce (no skimming the bush)

    // --- trail (the melody train)
    pathStep: 3,                   // px between recorded path points (ring buffer)
    pathCap: 2048,                 // points (≥ 6000 px of history; trail ≤ 41 × 24 px)
    trailSpacing: 24,              // px of path between consecutive notes (note sprite 30 px)
    joinTime: 0.25,                // s, a picked note flies to the end of the train
    bounceAmp: 5,                  // px, |sin| hop height of trail notes
    bounceHz: 2.4,                 // hops per second at speed0 (scales with speed)
    bouncePhase: 0.7,              // rad per index: a wave runs down the train
    safeNeck: 4,                   // trail notes 0..safeNeck−1 never bonk (they hug the turn)
    bonkR: 17,                     // px, Spike-centre ↔ note-centre distance for a bonk
    airZ: 6,                       // px, above this hop height Spike flies over his trail
    edgeSafe: 36,                  // px from the bush (Spike-centre bounds): no bonks in this soft strip.
                                   //  Bounces / sliding along a bush fold the train back next to itself;
                                   //  that should never cost a heart (playtest: holding a key into a bush)

    // --- hearts / bonks
    heartsMax: 3,
    invulnTime: 1.5,               // s after a bonk (blink)
    dizzyBonk: 0.6,                // s dizzy after a bonk
    dizzyPillow: 1.0,              // s dizzy after a pillow
    dizzySteer: 0.35,              // × steering authority while dizzy
    dizzySpeed: 0.85,              // × speed while dizzy
    happyTime: 0.35,               // s 'happy' frame after a pickup
    clearBonusPerHeart: 100,
    healOnClear: 1,

    // --- kickflip
    jumpTime: 0.65,                // s airborne
    jumpHeight: 28,                // px apex of the parabola z = 4·H·u(1−u)
    flipRecharge: 3,               // s from take-off until charged again

    // --- notes
    notesOnField: 2,               // idle notes kept on the field
    noteR: 15,                     // px (sprite 30)
    pickPad: 16,                   // pick radius = spikeR + pickPad
    spawnTime: 0.3,                // s pop-in
    spawnMinDist: 120,             // px from Spike
    spawnEdge: 40,                 // px inside the arena
    spawnTrailClear: 30,           // px from any trail note
    spawnNoteClear: 70,            // px from other notes
    goldChance: 0.08,
    songTargets: [10, 14, 18, 22], // notes per biome
    songPerLap: 2,
    songMax: 40,
    notePoints: 10, notePerTrail: 2, goldMul: 3,   // (10 + 2 × trail length before the pickup) × (gold ? 3 : 1)
    regrabPoints: 5,
    // loose notes (cut off by a bonk / knocked off by a pillow)
    looseLife: 4,                  // s re-collectable, then pop
    looseBlink: 1.2,               // s of blinking before vanishing (renderer)
    looseMinAge: 0.35,             // s before a loose note can be re-grabbed (they fly away first)
    looseSpeed: [70, 140],         // px/s outward scatter
    looseVz: [150, 230],           // px/s up
    looseG: 700,                   // px/s² (arc apex 16–38 px, ≈ 0.5 s airborne)
    looseBounce: 0.35,             // restitution of the little bounce
    looseFric: 5,                  // 1/s ground friction (slides to a stop in ≈ 0.4 s)

    // --- boss Mumbles
    bossFirst: 12,                 // s into each level ('playing' time)
    bossEvery: 30,                 // s between visit starts
    bossVisit: 6,                  // s: 1 enter + 4 hover + 1 leave
    bossEnter: 1, bossHover: 4,
    bossThrowAt: [0.6, 1.5, 2.4],  // s into the hover (0.9 s apart, DESIGN: 3 pillows)
    bossThrowFrame: 0.35,          // s 'throw' frame
    bossFlapHz: 4,                 // fly1/fly2 alternation
    bossHigh: -50,                 // px relative to arena top at entry/exit (above the arena)
    bossLow: 0.22,                 // fraction of the arena height (lowest point mid-visit)
    bossBob: 14, bossBobHz: 0.9,   // px, Hz of the sine bob
    bossSwing: 0.6,                // speed profile: fast at the ends, slow over the middle (k < 1)
    bossOut: 90,                   // px outside the arena sides at entry/exit
    pillowDur: 1.3,                // s flight time
    pillowZ0: 70,                  // px: Mumbles' height above the ground point under him
    pillowG: 420,                  // px/s² (arc up a little, then drop)
    pillowSpread: 70,              // px, ± offset of pillows 2 and 3
    pillowEdge: 30,                // px, landing spots stay inside the arena
    pillowHitPad: 18,              // hit radius = spikeR + pad
    pillowKnock: 3,                // notes knocked off the END of the trail
    pillowLife: 1.5,               // s a landed pillow sits before puffing into feathers
    dodgePoints: 15
  };

  /* Difficulty presets: overrides merged over CONFIG. */
  var DIFFICULTY = {
    easy: {
      speed0: 120, speedPerBiome: 5, heartsMax: 5,
      songTargets: [8, 11, 14, 17],
      jumpTime: 0.8, flipRecharge: 2.4,
      safeNeck: 6, bonkR: 14, edgeSafe: 40,
      pillowDur: 1.6, looseLife: 5, invulnTime: 1.8
    },
    normal: {},
    hard: {
      // playtest (tests/sim): with the normal numbers the bot never lost on hard → faster, tighter,
      // a thinner soft edge, more accurate pillows and Mumbles every 25 s
      speed0: 185, speedPerBiome: 7, speedMax: 260,
      songTargets: [12, 16, 20, 24], notesOnField: 1,
      safeNeck: 3, bonkR: 18, edgeSafe: 12, pillowDur: 1.15, pillowSpread: 55, bossEvery: 25,
      invulnTime: 1.2, looseLife: 3.5, healOnClear: 0
    }
  };

  var BIOMES = ['Fern Meadow', 'Misty Swamp', 'Red Rock Canyon', 'Snowy Peaks'];

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

  /** reset([seed]) — level 0, score 0, full hearts, state 'ready'; Spike at the centre heading right. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new DJ.RNG(this.seed);
    this.time = 0; this.steps = 0;
    this.score = 0;
    this.heartsMax = c.heartsMax; this.hearts = c.heartsMax;
    this.notesTotal = 0; this.bonks = 0; this.pillowHits = 0; this.flips = 0; this.dodges = 0;
    this.regrabs = 0; this.levelsCleared = 0;
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this._dir = null; this._target = null;
    this.spike = {
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

  /** startLevel(i): biome = i % 4, lap = floor(i / 4); clears trail/notes/pillows, keeps score/hearts. */
  World.prototype.startLevel = function (i) {
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i), c = this.cfg, A = this.arena, s = this.spike;
    this.level = i; this.biome = info.biome; this.lap = info.lap;
    this.songTarget = info.songTarget; this._baseSpeed = info.speed;
    this.song = 0;
    this.levelTime = 0;
    this.state = 'ready'; this._stateT = 0;
    this.trail = []; this.notes = []; this.pillows = [];
    this.boss = { state: 'away', x: -200, y: A.y0 + c.bossHigh, t: 0, next: c.bossFirst, frame: 'fly1', facing: 1,
      throws: 0, side: 1, _px: -200, _py: A.y0 + c.bossHigh, _throwT: 0, _exit: false, _vx: 0, _vy: 0 };
    s.x = (A.x0 + A.x1) / 2; s.y = (A.y0 + A.y1) / 2; s.heading = 0; s.turn = 0; s.lean = 0;
    s.speed = info.speed * c.readySpeed; s.jump = 0; s.z = 0; s.flip = 1; s.dizzy = 0; s.invuln = 0;
    s.happy = 0; s.lock = 0; s.facing = 1; s.frame = 'idle'; s._px = s.x; s._py = s.y;
    this._bounceT = 0; this._hop = 0;
    // seed the path history with a straight line behind Spike (clamped inside the arena)
    this._pathHead = -1; this._pathLen = 0;
    for (var k = 40; k >= 0; k--) this._pushPath(Math.max(A.x0 + c.spikeR, s.x - k * c.pathStep), s.y);
    this._pushPath(s.x, s.y);
    this._fillNotes();
    this._emit({ type: 'biome', biome: this.biome, level: i, lap: this.lap });
    return this;
  };

  /* ------------------------------ arena ------------------------------ */
  /** setArena(x0, y0, x1, y1, avoid): the playable rectangle (may change any time, e.g. rotation).
   *  Everything is mapped proportionally from the old arena into the new one (Spike, path, trail,
   *  notes, pillows), then clamped inside its margin; idle notes that end up in an `avoid` circle are
   *  re-placed. */
  World.prototype.setArena = function (x0, y0, x1, y1, avoid) {
    var c = this.cfg, O = this.arena, i, k;
    x0 = +x0; y0 = +y0; x1 = +x1; y1 = +y1;
    if (!(x1 - x0 > 4 * c.spikeR) || !(y1 - y0 > 4 * c.spikeR)) return this;
    this.avoid = [];
    if (avoid) for (i = 0; i < avoid.length; i++) this.avoid.push({ x: +avoid[i].x, y: +avoid[i].y, r: +avoid[i].r || 0 });
    var same = O.x0 === x0 && O.y0 === y0 && O.x1 === x1 && O.y1 === y1;
    var N = { x0: x0, y0: y0, x1: x1, y1: y1 };
    if (!same) {
      var sx = (x1 - x0) / (O.x1 - O.x0), sy = (y1 - y0) / (O.y1 - O.y0);
      var mx = function (x) { return x0 + (x - O.x0) * sx; }, my = function (y) { return y0 + (y - O.y0) * sy; };
      var r = c.spikeR, s = this.spike;
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
      var m = c.noteR;
      for (i = 0; i < this.notes.length; i++) {
        var n = this.notes[i];
        n.x = clamp(mx(n.x), x0 + m, x1 - m); n.y = clamp(my(n.y), y0 + m, y1 - m); n._px = n.x; n._py = n.y;
      }
      for (i = 0; i < this.pillows.length; i++) {
        var p = this.pillows[i];
        p.x = clamp(mx(p.x), x0 + c.pillowEdge, x1 - c.pillowEdge); p.y = clamp(my(p.y), y0 + c.pillowEdge, y1 - c.pillowEdge);
        p.sx = mx(p.sx); p.sy = my(p.sy); p._px = p.x; p._py = p.y;
        this._pillowPos(p); p._pcx = p.cx; p._pcy = p.cy; p._pz = p.z;
      }
      var b = this.boss;
      b._ax = mx(b._ax || 0); b._bx = mx(b._bx || 0);
    }
    this.arena = N;
    this._layoutTrail(0);
    for (i = 0; i < this.trail.length; i++) { this.trail[i]._px = this.trail[i].x; this.trail[i]._py = this.trail[i].y; }
    // idle notes under the avoid circles (or too close to the edge) → re-place
    for (i = this.notes.length - 1; i >= 0; i--) {
      var q = this.notes[i];
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
  /** Kickflip if charged and grounded. Returns true when Spike hops. */
  World.prototype.action = function () {
    var s = this.spike;
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
    var c = this.cfg, s = this.spike, i, o, b = this.boss;
    s._px = s.x; s._py = s.y;
    for (i = 0; i < this.trail.length; i++) { o = this.trail[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.notes.length; i++) { o = this.notes[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.pillows.length; i++) { o = this.pillows[i]; o._px = o.x; o._py = o.y; o._pcx = o.cx; o._pcy = o.cy; o._pz = o.z; }
    b._px = b.x; b._py = b.y;
    this.time += h; this.steps++; this._stateT += h;

    var st = this.state;
    if (st === 'playing') this.levelTime += h;
    this._stepSpike(h);
    this._layoutTrail(h);
    this._stepNotes(h);
    this._stepBoss(h);
    this._stepPillows(h);
    if (st === 'playing') {
      this._collide();
      if (this.state === 'playing') this._fillNotes();
    } else if (st === 'ready') {
      if (this._stateT >= c.readyTime) { this.state = 'playing'; this._stateT = 0; this._emit({ type: 'go', level: this.level }); }
    } else if (st === 'cleared') {
      if (this._stateT >= c.clearTime) this.startLevel(this.level + 1);
    }
  };

  /* ---- Spike ---- */
  World.prototype._stepSpike = function (h) {
    var c = this.cfg, s = this.spike, A = this.arena, st = this.state;
    // timers
    if (s.dizzy > 0) s.dizzy = Math.max(0, s.dizzy - h);
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - h);
    if (s.happy > 0) s.happy = Math.max(0, s.happy - h);
    if (s.lock > 0) s.lock = Math.max(0, s.lock - h);
    if (this._bounceT > 0) this._bounceT -= h;
    // kickflip
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
    // wall slide: a wish pointing into a bush Spike is next to becomes "along the bush", so holding
    // a direction (or a finger) into an edge glides along it instead of looping into his own trail
    if (desired !== null) {
      var dvx = Math.cos(desired), dvy = Math.sin(desired), ws = c.wallSlide, R0 = c.spikeR, zx = false, zy = false;
      if ((dvx < 0 && s.x - (A.x0 + R0) < ws) || (dvx > 0 && (A.x1 - R0) - s.x < ws)) { dvx = 0; zx = true; }
      if ((dvy < 0 && s.y - (A.y0 + R0) < ws) || (dvy > 0 && (A.y1 - R0) - s.y < ws)) { dvy = 0; zy = true; }
      if (zx && zy) desired = s.heading;                                   // into a corner: the bounce handles it
      else if (zx || zy) {
        // straight into the bush: slide the way he is already going along it
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
    var cx = Math.cos(s.heading), sy = Math.sin(s.heading);
    s.x += cx * s.speed * h; s.y += sy * s.speed * h;
    // edges: mirror the position back inside, deflect the heading (bounceHeading), dip the speed
    var r = c.spikeR, bx0 = A.x0 + r, bx1 = A.x1 - r, by0 = A.y0 + r, by1 = A.y1 - r, wx = 0, wy = 0;
    if (s.x < bx0) { s.x = Math.min(bx1, 2 * bx0 - s.x); wx = -1; }
    else if (s.x > bx1) { s.x = Math.max(bx0, 2 * bx1 - s.x); wx = 1; }
    if (s.y < by0) { s.y = Math.min(by1, 2 * by0 - s.y); wy = -1; }
    else if (s.y > by1) { s.y = Math.max(by0, 2 * by1 - s.y); wy = 1; }
    if (wx || wy) {
      s.heading = this.bounceHeading(s.heading, wx, wy, desired !== null ? wrap(desired - s.heading - Math.PI) : s.turn, s.x, s.y);
      s.turn = -s.turn * 0.5;
      s.lock = c.bounceLock;
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
    // trail bounce phase advances with distance (hop per ~ speed0 / bounceHz px)
    this._hop += TAU * c.bounceHz * (s.speed / c.speed0) * h;
    if (this._hop > 1e4) this._hop -= TAU * 1000;
  };

  /** Edge deflection. h0 = heading into the wall; wx/wy = −1 (left/top wall), +1 (right/bottom), 0.
   *  1. mirror the outward component(s);
   *  2. never send Spike straight back along his own trail: the new heading is kept ≥ bounceSep away
   *     from the reversed incoming heading (a head-on hit glances off to the side of `pref`, a hint
   *     sign: the player's steering wish, else the current turn);
   *     If (x, y) is given and another bush is within wallSlide (a corner), glance away from that one;
   *  3. never skim the bush: inward component ≥ sin(bounceMinIn) for every wall that was hit. */
  World.prototype.bounceHeading = function (h0, wx, wy, pref, x, y) {
    var c = this.cfg, cx = Math.cos(h0), sy = Math.sin(h0);
    if (wx < 0 && cx < 0) cx = -cx; else if (wx > 0 && cx > 0) cx = -cx;
    if (wy < 0 && sy < 0) sy = -sy; else if (wy > 0 && sy > 0) sy = -sy;
    var ho = Math.atan2(sy, cx), rev = wrap(h0 + Math.PI), d = wrap(ho - rev), sep = c.bounceSep;
    if (Math.abs(d) < sep) {
      var sg = Math.abs(d) > 1e-3 ? (d > 0 ? 1 : -1) : (pref > 0 ? 1 : pref < 0 ? -1 : 1);
      var a = rev + sg * sep, b = rev - sg * sep;
      // a bush close by on another side (near a corner): glance away from it, not into a second bounce
      var nx = 0, ny = 0;
      if (x !== undefined) {
        var A = this.arena, R0 = c.spikeR, ws = c.wallSlide;
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

  /** Point at arc length `d` behind Spike along the path → writes into out {x, y}. */
  World.prototype.pathPoint = function (d, out) {
    out = out || {};
    var c = this.cfg, s = this.spike, cap = c.pathCap, px = s.x, py = s.y, k, i, acc = 0;
    for (k = 0; k < this._pathLen; k++) {
      i = (this._pathHead - k + cap) % cap;
      var qx = this._pathX[i], qy = this._pathY[i], sl = Math.sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py));
      if (acc + sl >= d) { var f = sl > 0 ? (d - acc) / sl : 0; out.x = px + (qx - px) * f; out.y = py + (qy - py) * f; return out; }
      acc += sl; px = qx; py = qy;
    }
    out.x = px; out.y = py;
    return out;
  };

  /* Trail note i at arc length (i+1)·spacing behind Spike: one pass along the ring buffer. */
  World.prototype._layoutTrail = function (h) {
    var c = this.cfg, s = this.spike, T = this.trail, n = T.length;
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
      t.z += 18 * Math.sin(Math.PI * t.join);            // little hop onto the train
    } else { t.x = x; t.y = y; t._jx = x; t._jy = y; }
    if (t.pop > 0) t.pop = Math.max(0, t.pop - h / (c.joinTime * 1.6));
  };

  /* ---- notes ---- */
  World.prototype._spotOk = function (x, y, edge, minSpike, self) {
    var c = this.cfg, A = this.arena, s = this.spike, i;
    if (x < A.x0 + edge || x > A.x1 - edge || y < A.y0 + edge || y > A.y1 - edge) return false;
    if (minSpike > 0 && (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < minSpike * minSpike) return false;
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

  World.prototype._findSpot = function () {
    var c = this.cfg, A = this.arena, r = this.rng, e = c.spawnEdge, x = 0, y = 0;
    var minD = Math.min(c.spawnMinDist, 0.4 * Math.min(A.x1 - A.x0, A.y1 - A.y0) + 40);
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
    for (i = 0; i < this.notes.length; i++) if (this.notes[i].state !== 'loose') n++;
    while (n < c.notesOnField) {
      var spot = this._findSpot(), gold = this.rng.chance(c.goldChance);
      this.notes.push({ id: this._nextId++, x: spot.x, y: spot.y, kind: this.rng.int(0, 3), gold: gold, t: 0,
        state: 'spawn', life: 0, vx: 0, vy: 0, z: 0, vz: 0, _px: spot.x, _py: spot.y });
      n++;
    }
  };

  World.prototype._stepNotes = function (h) {
    var c = this.cfg, A = this.arena, m = c.noteR, i;
    for (i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      n.t += h;
      if (n.state === 'spawn') { if (n.t >= c.spawnTime) n.state = 'idle'; continue; }
      if (n.state !== 'loose') continue;
      n.life -= h;
      if (n.life <= 0) { this.notes.splice(i, 1); this._emit({ type: 'loosegone', x: n.x, y: n.y }); continue; }
      // ballistic hop with a small bounce, then friction on the ground
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
    }
  };

  /* Turn trail items [from, to) loose: scatter outward from (ox, oy) in ballistic arcs. */
  World.prototype._loosen = function (from, to, ox, oy) {
    var c = this.cfg, r = this.rng, out = this.trail.splice(from, to - from);
    for (var i = 0; i < out.length; i++) {
      var t = out[i], dx = t.x - ox, dy = t.y - oy, d = Math.sqrt(dx * dx + dy * dy);
      var ang = d > 1 ? Math.atan2(dy, dx) : r.range(0, TAU);
      ang += r.range(-0.6, 0.6);
      var sp = r.range(c.looseSpeed[0], c.looseSpeed[1]);
      this.notes.push({ id: this._nextId++, x: t.x, y: t.y, kind: t.kind, gold: t.gold, t: 0, state: 'loose', life: c.looseLife,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, z: Math.max(0, t.z), vz: r.range(c.looseVz[0], c.looseVz[1]), _px: t.x, _py: t.y });
    }
    this.song = this.trail.length;
    return out.length;
  };

  /* ---- collisions: pickups, self-bonk ---- */
  World.prototype._collide = function () {
    var c = this.cfg, s = this.spike, i, pr = c.spikeR + c.pickPad;
    for (i = 0; i < this.notes.length; i++) {
      var n = this.notes[i];
      if (n.state === 'loose' && (n.t < c.looseMinAge || n.z > 20)) continue;
      var dx = n.x - s.x, dy = n.y - s.y;
      if (dx * dx + dy * dy > pr * pr) continue;
      this.notes.splice(i, 1); i--;
      this._pick(n);
      if (this.state !== 'playing') return;
    }
    if (s.z > c.airZ || s.invuln > 0 || this.inEdgeZone(s.x, s.y)) return;
    var T = this.trail, br2 = c.bonkR * c.bonkR;
    for (i = c.safeNeck; i < T.length; i++) {
      var t = T[i];
      if (t.join < 1) continue;                // still hopping onto the train
      var ex = t.x - s.x, ey = t.y - s.y;
      if (ex * ex + ey * ey < br2) { this._bonk(i); return; }
    }
  };

  /** True when (x, y) is within cfg.edgeSafe of the arena bounds (Spike-centre bounds): no bonks there. */
  World.prototype.inEdgeZone = function (x, y) {
    var c = this.cfg, A = this.arena, r = c.spikeR, e = c.edgeSafe;
    return x - (A.x0 + r) < e || (A.x1 - r) - x < e || y - (A.y0 + r) < e || (A.y1 - r) - y < e;
  };

  World.prototype._pick = function (n) {
    var c = this.cfg, s = this.spike, regrab = n.state === 'loose';
    var len = this.trail.length;
    var pts = regrab ? c.regrabPoints : (c.notePoints + c.notePerTrail * len) * (n.gold ? c.goldMul : 1);
    this.trail.push({ x: n.x, y: n.y, kind: n.kind, gold: n.gold, z: 0, phase: len * c.bouncePhase, pop: 1, join: 0,
      _jx: n.x, _jy: n.y, _px: n.x, _py: n.y });
    this.song = this.trail.length;
    this.score += pts; this.notesTotal++;
    s.happy = c.happyTime;
    if (regrab) { this.regrabs++; this._emit({ type: 'regrab', x: n.x, y: n.y }); }
    this._emit({ type: 'note', x: n.x, y: n.y, kind: n.kind, gold: n.gold, points: pts, song: this.song, index: this.song - 1, regrab: regrab });
    if (this.song >= this.songTarget) this._clear();
  };

  World.prototype._bonk = function (i) {
    var c = this.cfg, s = this.spike;
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
    this.pillows.length = 0;
    for (var i = this.notes.length - 1; i >= 0; i--) this.notes.splice(i, 1);
    this._bossLeave();
  };

  World.prototype._die = function () {
    this.state = 'dead'; this._stateT = 0;
    this.pillows.length = 0;
    this._bossLeave();
    this._emit({ type: 'dead', score: this.score });
  };

  /* ---- boss Mumbles ---- */
  World.prototype._bossLeave = function () {
    var b = this.boss;
    if (b.state === 'away') return;
    b.state = 'leave'; b._exit = true;
    b._vx = b.facing * 260; b._vy = -140;
  };

  World.prototype._stepBoss = function (h) {
    var c = this.cfg, b = this.boss, A = this.arena;
    if (b.state === 'away') {
      if (this.state !== 'playing') return;
      b.next -= h;
      if (b.next > 0) return;
      // start a visit: enter from the side away from Spike so the throws come across the field
      b.next += c.bossEvery;
      b.side = this.spike.x > (A.x0 + A.x1) / 2 ? -1 : 1;       // −1: enters from the left, flies right
      b._ax = b.side < 0 ? A.x0 - c.bossOut : A.x1 + c.bossOut;
      b._bx = b.side < 0 ? A.x1 + c.bossOut : A.x0 - c.bossOut;
      b.state = 'enter'; b.t = 0; b.throws = 0; b._throwT = 0; b._exit = false;
      b.facing = b._bx > b._ax ? 1 : -1;
      this._bossPos(b);
      b._px = b.x; b._py = b.y;
      this._emit({ type: 'bossin', x: b.x, y: b.y });
      return;
    }
    if (this.state === 'playing') b.next -= h;
    b.t += h;
    if (b._throwT > 0) b._throwT -= h;
    if (b._exit) {
      // forced exit (song done / game over): fly up and away
      b.x += b._vx * h; b.y += b._vy * h; b._vy -= 60 * h;
      if (b.y < A.y0 - 220 || b.x < A.x0 - 260 || b.x > A.x1 + 260) { b.state = 'away'; b._exit = false; }
    } else {
      this._bossPos(b);
      if (b.t < c.bossEnter) b.state = 'enter';
      else if (b.t < c.bossEnter + c.bossHover) b.state = 'hover';
      else if (b.t < c.bossVisit) b.state = 'leave';
      else { b.state = 'away'; b.x = b._bx; }
      if (b.state === 'hover' && b.throws < c.bossThrowAt.length && b.t - c.bossEnter >= c.bossThrowAt[b.throws] && this.state === 'playing') {
        this._throw(b.throws === 0);
        b.throws++; b._throwT = c.bossThrowFrame;
      }
    }
    b.frame = b._throwT > 0 ? 'throw' : (Math.floor(b.t * c.bossFlapHz * 2) % 2 === 0 ? 'fly1' : 'fly2');
  };

  /* Smooth visit path: x(u) = a + (b−a)·(u + k·sin(2πu)/2π) → fast at the ends, slow mid-field;
   * y dips from above the arena to bossLow·H and back (sin πu) with a gentle sine bob. */
  World.prototype._bossPos = function (b) {
    var c = this.cfg, A = this.arena, u = clamp(b.t / c.bossVisit, 0, 1);
    var sx = u + c.bossSwing * Math.sin(TAU * u) / TAU;
    b.x = b._ax + (b._bx - b._ax) * sx;
    var yHigh = A.y0 + c.bossHigh, yLow = A.y0 + c.bossLow * (A.y1 - A.y0);
    b.y = yHigh + (yLow - yHigh) * Math.sin(Math.PI * u) + c.bossBob * Math.sin(TAU * c.bossBobHz * b.t) * Math.sin(Math.PI * u);
  };

  /** Where a pillow thrown now should land: Spike's linear prediction after the flight time. */
  World.prototype.predictSpike = function (t, out) {
    var c = this.cfg, s = this.spike, A = this.arena, e = c.pillowEdge;
    out = out || {};
    out.x = clamp(s.x + Math.cos(s.heading) * s.speed * t, A.x0 + e, A.x1 - e);
    out.y = clamp(s.y + Math.sin(s.heading) * s.speed * t, A.y0 + e, A.y1 - e);
    return out;
  };

  World.prototype._throw = function (exact) {
    var c = this.cfg, b = this.boss, A = this.arena, r = this.rng, e = c.pillowEdge;
    var p = this.predictSpike(c.pillowDur, {});
    if (!exact) {
      p.x = clamp(p.x + r.range(-c.pillowSpread, c.pillowSpread), A.x0 + e, A.x1 - e);
      p.y = clamp(p.y + r.range(-c.pillowSpread, c.pillowSpread), A.y0 + e, A.y1 - e);
    }
    var pl = { id: this._nextId++, x: p.x, y: p.y, sx: b.x, sy: b.y + c.pillowZ0, t: 0, dur: c.pillowDur, z: c.pillowZ0, z0: c.pillowZ0,
      vz0: (0.5 * c.pillowG * c.pillowDur * c.pillowDur - c.pillowZ0) / c.pillowDur,
      zMax: 0, rot: 0, spin: r.range(2.5, 4.5) * r.sign(), state: 'fall', life: c.pillowLife, cx: b.x, cy: b.y + c.pillowZ0,
      _px: p.x, _py: p.y };
    // apex height above ground (for the renderer's shadow scale)
    var tA = clamp(pl.vz0 / c.pillowG, 0, pl.dur);
    pl.zMax = pl.z0 + pl.vz0 * tA - 0.5 * c.pillowG * tA * tA;
    pl._pcx = pl.cx; pl._pcy = pl.cy; pl._pz = pl.z;
    this.pillows.push(pl);
    this._emit({ type: 'throw', x: b.x, y: b.y, tx: p.x, ty: p.y });
  };

  /* Pillow flight: the ground point moves linearly from (sx, sy) to (x, y); the height is ballistic
   * z(t) = z0 + vz0·t − ½g·t² with z(dur) = 0 exactly. */
  World.prototype._pillowPos = function (p) {
    var c = this.cfg, t = Math.min(p.t, p.dur), u = t / p.dur;
    p.cx = p.sx + (p.x - p.sx) * u; p.cy = p.sy + (p.y - p.sy) * u;
    p.z = Math.max(0, p.z0 + p.vz0 * t - 0.5 * c.pillowG * t * t);
    if (p.t >= p.dur) { p.z = 0; p.cx = p.x; p.cy = p.y; }
  };

  World.prototype._stepPillows = function (h) {
    var c = this.cfg, s = this.spike, i;
    for (i = this.pillows.length - 1; i >= 0; i--) {
      var p = this.pillows[i];
      if (p.state === 'fall') {
        p.t += h; p.rot += p.spin * h;
        this._pillowPos(p);
        if (p.t >= p.dur) {
          p.state = 'landed'; p.rot = p.rot % TAU;
          var dx = s.x - p.x, dy = s.y - p.y, R = c.spikeR + c.pillowHitPad, near = dx * dx + dy * dy < R * R, hit = false;
          if (near && this.state === 'playing') {
            if (s.jump > 0) {
              this.dodges++; this.score += c.dodgePoints;
              this._emit({ type: 'dodge', x: p.x, y: p.y, points: c.dodgePoints });
            } else if (s.invuln <= 0) {
              hit = true; this.pillowHits++;
              s.dizzy = Math.max(s.dizzy, c.dizzyPillow); s.frame = 'ouch';
              var n = this.trail.length, k = Math.min(c.pillowKnock, n);
              var lost = this._loosen(n - k, n, s.x, s.y);
              this._emit({ type: 'pillowhit', x: p.x, y: p.y, lost: lost });
            }
          }
          this._emit({ type: 'pillowland', x: p.x, y: p.y, hit: hit });
        }
      } else {
        p.life -= h;
        if (p.life <= 0) { this.pillows.splice(i, 1); this._emit({ type: 'pillowpuff', x: p.x, y: p.y }); }
      }
    }
  };

  /** Snapshot for debug / tests. */
  World.prototype.getState = function () {
    var s = this.spike;
    return {
      state: this.state, level: this.level, biome: this.biome, lap: this.lap, time: this.time, levelTime: this.levelTime,
      score: this.score, hearts: this.hearts, song: this.song, songTarget: this.songTarget, trail: this.trail.length,
      notes: this.notes.length, pillows: this.pillows.length, boss: this.boss.state, bonks: this.bonks, pillowHits: this.pillowHits,
      spike: { x: s.x, y: s.y, heading: s.heading, speed: s.speed, z: s.z, flip: s.flip }
    };
  };

  DJ.CONFIG = CONFIG;
  DJ.DIFFICULTY = DIFFICULTY;
  DJ.BIOMES = BIOMES;
  DJ.World = World;
})(window.DJ = window.DJ || {});
