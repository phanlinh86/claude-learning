/* Bristle's Moon Pop — MP.CONFIG + MP.DIFFICULTY + MP.ZONES + MP.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 scene), seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s) with an accumulator
 *  (w._acc = leftover time, 0..step). Results depend only on the seed and on the sub-step index at
 *  which setMove / setTarget / action / setPlayRange are called.
 *
 *  Render interpolation: at the START of every sub-step the previous position is saved as `_px,_py`
 *  on hog, on hog.board and on every item:  drawX = _px + (x − _px) · (w._acc / w.cfg.step).
 *
 *  Drawing (DESIGN §2 / §4.1):
 *   - Bristle: body centre (hog.x, hog.y); on the floor hog.y = cfg.hogRestY (446). face 1 = sprite as drawn
 *     (facing right), −1 = mirrored. tilt > 0 = clockwise = leaning right (into the motion).
 *     squash 0..1: scaleX ×(1+0.15·s), scaleY ×(1−0.15·s) (feet anchored). curl 0..1 cross-fades the
 *     standing frame into the ball (frame 'ball' once curl > 0.5); spin = ball rotation (rad, signed).
 *   - Board: deck centre (board.x, board.y), rotation board.rot (kick-flip in the air, = tilt on the floor).
 *     wheel = wheel rotation (rad) = distance / cfg.wheelR.
 *   - Bubbles (kind 'cupcake' | 'magnet'): centre (x, y), radius r (grows 0.55 → 1 while emerging),
 *     film wobble phase `wob` (≈ 1.6 Hz), squish 0..1 (bumped by neighbours / pops), rot = gentle rocking of the
 *     cupcake inside. state 'puff' = telegraph at the vent (alpha 0, not drawn as a bubble; vents[i].puff glows),
 *     'rise', 'pop' (≈ 0.25 s fade, film bursts), 'escape' (floats up and fades 0.5 s).
 *   - Pebbles (kind 'pebble'): centre (x, y), r, rot (spin). state 'fall' | 'land' (rolls a little, fades).
 *     Extra fields for the renderer: lx = predicted landing x (shadow ring position), shadow 0..1 (ring grows
 *     during the fall), harmless (bounced off / box full: no longer bonks; fading if alpha < 1).
 *
 *  Bubble model (docs/MECHANICS.md §3):  vy += (−buoy − k·vy)·h → terminal rise vR = buoy/k;
 *  vx += (−kx·vx + repulsion + walls + magnet)·h;  x += (vx + A·sin(sw))·h  (slow sway, phase sw).
 *  Pebble model: vy += (g − k·vy)·h → terminal vT = g/k;  x = bx + A·sin(φ).  Both have exact closed forms
 *  (World.bubbleAt / pebbleAt) that the bot and the fair pebble planner use.
 * ========================================================================
 */
(function (MP) {
  'use strict';

  var ZONES = ['dawn', 'noon', 'sunset', 'night'];

  /* All tunables. Override per world with new MP.World({ config: {...} }). Arrays are per zone
   * [dawn, noon, sunset, night]. */
  var CONFIG = {
    // --- screen / timing
    width: 960, height: 540,
    step: 1 / 120,                 // s, fixed simulation sub-step (render interpolates)
    introDelay: 1.4,               // s, 'ready' banner: no spawns (Bristle can already skate and jump)
    clearTime: 2.2,                // s, 'cleared' celebration before the next time of day
    boxGrace: 1.0,                 // s after the box is full: bubbles still up can be popped, then 'cleared'
    firstSpawn: 0.5,               // s after 'go' before the first vent puffs

    // --- scene geometry (DESIGN §2)
    floorY: 492,                   // px, the Moon floor (skate surface, wheels touch here)
    hogRestY: 446,                 // px, Bristle's body centre when skating (board top 478)
    escapeY: 60,                   // px, a bubble whose centre goes above this floats away
    ventY: 470,                    // px, bubbles emerge at (vent.x, ventY)
    ceilY: 124,                    // px, soft ceiling for Bristle's centre (chains can't fly him into the HUD)
    xMin: 60, xMax: 900,           // px, Bristle x clamp (setPlayRange changes it)

    // --- skating (a skateboard on the Moon: low friction, but precise enough for a 6-year-old)
    maxSpeed: 380,                 // px/s: crosses the 840 px floor in 2.2 s — any vent is reachable during its puff + rise
    accel: 1900,                   // px/s² toward the key speed (0 → max in 0.2 s: a push, not a teleport)
    turnAccel: 2800,               // px/s² when the input opposes the motion (kick-turn: reversing feels snappy)
    coastDecel: 1500,              // px/s² rolling friction when released: 380 → 0 in 0.25 s, ≈ 48 px glide
    airControl: 0.6,               // × accelerations while airborne (you steer a jump, you don't fly it)
    airDrag: 0.35,                 // 1/s, horizontal drag in the air with no input (keeps momentum: no air brakes)
    followOmega: 9,                // 1/s, pointer-follow: v_des = ω·dx near the target (exponential approach)
    followAccel: 2600,             // px/s², pointer-follow acceleration cap
    followBrake: 0.5,              // fraction of followAccel used for the √(2·a·dx) braking profile (no overshoot)
    followStop: 4,                 // px, inside this and slow → stop exactly (no creeping)
    tiltMax: 0.2,                  // rad, lean into the motion
    tiltRate: 7,                   // 1/s, exponential easing of the tilt (≈ 0.1 s half-life)
    faceDead: 25,                  // px/s, |vx| below this keeps the current facing (no flicker)
    pushPeriod: 0.36,              // s, 'push' ↔ 'skate' frame cycle while accelerating on the floor
    pushMinA: 300,                 // px/s², accelerating harder than this (along the motion) counts as pushing
    wheelR: 5,                     // px, wheel radius (wheel angle = distance / wheelR)

    // --- jump: impulse + Moon gravity. apex H = v²/2g, air time T = 2v/g → v = 4H/T, g = 8H/T²
    jumpV: 572,                    // px/s up  (H = 200 px, T = 1.40 s with gravity)
    gravity: 818,                  // px/s² ("Moon gravity": floaty, readable arcs)
    jumpBuffer: 0.12,              // s, a press this early before landing still jumps on touch-down
    coyote: 0.08,                  // s, grace after leaving the floor (flat floor: only matters after a bonk hop)
    landLag: 0.1,                  // s on the board after a landing before the next jump (the board settles;
                                   //  a buffered press fires right after it) — mashing Jump is not free
    ceilSoft: 40,                  // px band under ceilY where an extra pull-down eases him off the ceiling
    curlDelay: 0.1,                // s in the air before he curls into a ball
    curlRate: 12,                  // 1/s, curl easing (≈ 0.06 s half-life)
    uncurlRate: 16,                // 1/s, uncurl on landing
    spinRate: 2.2,                 // turns/s, ball spin in the facing direction
    popBounce: 400,                // px/s: an air pop sets vy = min(vy, −popBounce) → ≈ 100 px more hang
    hogR: 28, hogBallR: 30,        // px, pop radius standing / as a ball (interpolated by curl)
    squashLand: 0.75, squashPop: 0.35, squashDecay: 7,   // 0..1 and exp decay 1/s
    happyTime: 0.45,               // s, 'happy' face after a ground pop
    boardOff: 38,                  // px, deck centre below the body centre
    boardOmega: 20,                // 1/s, critically damped spring: the board trails him a little in the air
    flipTime: 0.9,                 // s, one kick-flip turn per jump (smoothstep), flat again before landing

    // --- bubbles
    bubbleR: 30,                   // px (drawn 60)
    emergeV: 45,                   // px/s initial upward speed out of the crater
    emergeVx: 22,                  // px/s, ± random sideways kick (pre-rolled at the puff: predictable)
    bubbleDrag: 1.5,               // 1/s, vertical drag k (τ = 0.67 s to reach the terminal rise)
    rise: [65, 75, 85, 95],        // px/s terminal rise per zone: dawn ≈ 6.4 s from the vent to the escape line
    riseMul: 1,                    // difficulty multiplier
    lapRise: 0.06, riseCap: 1.25,  // +6 % per loop, capped at +25 %
    dragX: 0.7,                    // 1/s, sideways drag (the kick fades: ≈ 30 px drift)
    swayA: 18,                     // px/s sway velocity amplitude (≈ ±7.5 px wander)
    swayRate: 2.4,                 // rad/s sway phase rate (≈ 0.38 Hz)
    wobRate: 1.6,                  // Hz, film wobble phase rate (renderer squash-wobble)
    growTime: 0.25,                // s, r grows 0.55 → 1 while emerging
    repelK: 900,                   // px/s² per unit overlap fraction: soft mutual repulsion
    repelRange: 1.08,              // × (r1 + r2): repulsion starts just before touching
    overlapMax: 0.3,               // never overlap more than 30 % of (r1 + r2) (positional correction)
    wallPad: 10,                   // px, bubbles bounce softly inside [xMin − pad, xMax + pad]
    wallK: 60,                     // 1/s², wall spring
    squishDecay: 6,                // 1/s
    popTime: 0.25,                 // s, pop fade
    escapeTime: 0.5,               // s, escape fade (keeps rising)
    tierY: [360, 240],             // px: y > 360 tier 1 (low), 240 < y ≤ 360 tier 2, y ≤ 240 tier 3 (sky). Playtest: 220 → 240 (sky pops 0.1 → 0.5–0.7/min for good players).
                                   //  220, not 200: the apex (y 246) + pop reach (58) then just touches the sky band,
                                   //  so a perfectly timed single jump can score ×3; chains get there easily

    // --- vents & spawning (index = zone)
    vents: [3, 4, 4, 5],           // vents per level
    ventGap: 120,                  // px, minimum distance between vents (shrinks on a very narrow phone floor)
    ventMargin: 40,                // px, vents stay this far inside the play range
    puffTime: 0.8,                 // s, vent telegraph before the bubble emerges
    ventCool: 1.0,                 // s, a vent is not reused this soon
    spawnGap: [2.2, 1.9, 1.7, 1.5],    // s between bubbles (lap 0), ± spawnJitter
    spawnJitter: 0.15,
    lapGap: 0.06, gapMin: 0.9,     // −6 % per loop

    // --- scoring / box
    basePoints: 10,                // × tier × mult
    chainPoints: 10,               // × (chain − 1): from the 2nd pop of one jump on
    multThresholds: [0, 8, 20],    // combo needed for ×1..×3
    boxTargets: [20, 24, 26, 28],  // playtest: night 32 → 28 (kid6 night 78 → 73 s, kid4 108 → 88 s); cupcakes per level; dawn ≈ 50–60 s at bot skill 0.8 (see MECHANICS.md)
    lengthK: 1,                    // settings level length (short 0.7 / normal 1 / long 1.4) × box target
    boxMin: 6,

    // --- magnet bubble (the twist)
    magnetFirst: 12,               // s of play (level 1) before the first magnet bubble
    magnetEvery: [22, 28],         // s between magnet bubbles (never two alive, never while one is active)
    magnetDur: 7,                  // s magnet time
    magnetR: 300,                  // px pull radius
    magnetAccel: 520,              // px/s² × (1 − d/R)^0.5 toward Bristle
    magnetDrag: 2.4,               // 1/s extra drag while pulled: they curve in instead of slingshotting
    magnetMaxV: 260,               // px/s speed cap while pulled

    // --- moon pebbles
    pebbleR: 18,                   // px hit radius (drawn 40)
    pebbleHitK: 0.8,               // hit if dist < pebbleR + hogR·0.8 (forgiving)
    pebbleVT: 190,                 // px/s terminal fall
    pebbleDrag: 1.4,               // 1/s → g = 266 px/s²; ≈ 2.7 s from y −30 to the hero band
    pebbleV0: 30,                  // px/s initial fall speed
    pebbleSwayA: 10, pebbleSwayRate: 1.3,   // px, rad/s
    pebbleSpinMax: 1.6,            // rad/s
    pebbleSpawnY: -30,
    pebbleGap: [14, 9, 6, 5.5],    // s per pebble (lap 0) ± pebbleJitter
    pebbleDelay: [20, 4, 4, 4],    // s of play before the first pebble of a level (dawn of loop 1: 20 s)
    pebbleMul: 1,                  // difficulty rate multiplier (gap / mul)
    lapPebble: 0.10, pebbleCap: 1.4,   // +10 % rate per loop, capped at +40 %
    pebbleJitter: 0.3,
    pebbleAim: 0.35,               // chance a pebble lands near Bristle (± 60..160 px): a threat to read…
    pebbleAvoid: 60,               // …never within 60 px of where he will be (x + 0.4 s · vx)…
    pebbleLead: 0.4,
    pebbleNearOK: true,            // …unless he has room to dodge (Normal/Hard: the fall gives ≥ 2 s; Easy: never)
    pebbleDodgeT: 1.3,             // s, minimum time to the hero band for a pebble that may land near him
    pebbleSep: 130,                // px: two pebbles in the hero band at about the same time are ≥ 130 px apart
    pebbleSepT: 0.9,               //  (± 0.9 s): there is always a gap to stand in
    pebbleTries: 30,
    landTime: 0.8,                 // s, a landed pebble rolls and fades
    landRoll: 45,                  // px/s roll speed on landing (decays)

    // --- hearts
    heartsMax: 3,
    invulnTime: 1.5,               // s after a bonk (blink)
    bonkTime: 0.6,                 // s, 'bonk' frame
    knockV: 170,                   // px/s knock-back away from the pebble
    healOnClear: 1,                // hearts back on a clear (after the bonus)…
    healLaps: 1,                   // …only on the first loop
    clearBonusPerHeart: 100
  };

  /* Difficulty presets: overrides merged over CONFIG. Normal = CONFIG. */
  var DIFFICULTY = {
    easy: {
      heartsMax: 5, invulnTime: 1.8, healLaps: 2,
      puffTime: 1.1,               // longer telegraph for 4-year-olds
      magnetDur: 9,
      riseMul: 0.85,               // dawn ≈ 55 px/s: a long, easy window
      spawnGap: [2.7, 2.4, 2.2, 2.0],
      boxTargets: [14, 17, 20, 23],
      multThresholds: [0, 5, 12],  // ×2 sooner so little kids feel the streak
      pebbleMul: 0.5, pebbleNearOK: false, pebbleAim: 0.25,
      pebbleDelay: [30, 6, 6, 6]
    },
    normal: {},
    hard: {
      invulnTime: 1.2, healOnClear: 0,
      magnetDur: 6,
      riseMul: 1.1,
      spawnGap: [1.8, 1.6, 1.45, 1.3],
      boxTargets: [26, 30, 34, 38],
      pebbleMul: 1.35, pebbleAim: 0.5, pebbleDelay: [10, 3, 3, 3]
    }
  };

  /* ---------- helpers ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) if (over[k] !== undefined) o[k] = over[k];
    return o;
  }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function sgn(v) { return v < 0 ? -1 : 1; }

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    // main.js (sister game) scales the target after startLevel unless _lenLevel === level; when the config
    // already carries lengthK we mark every level as done so the scale is never applied twice.
    this._ownLength = !!(opts.config && opts.config.lengthK !== undefined);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.width = this.cfg.width;
    this.height = this.cfg.height;
    this.reset();
  }
  World.CONFIG = CONFIG;
  World.ZONES = ZONES;

  /** reset([seed]) — new game: level 0 (dawn), score 0, full hearts, state 'ready'. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new MP.RNG(this.seed);
    this.time = 0; this.steps = 0;
    this.score = 0;
    this.heartsMax = c.heartsMax; this.hearts = c.heartsMax;
    this.combo = 0; this.mult = 1; this.bestCombo = 0; this.chain = 0; this.bestChain = 0;
    this.popsTotal = 0; this.cupcakes = 0; this.airPops = 0; this.skyPops = 0; this.bonks = 0; this.escaped = 0;
    this.magnets = 0; this.jumps = 0; this.levelsCleared = 0; this.spawned = 0; this.pebblesDropped = 0;
    this.magnet = { t: 0, dur: c.magnetDur, r: c.magnetR };
    this._acc = 0; this._events = []; this._nextId = 1;
    this._mx = 0; this._target = null; this._jumpBuf = 0; this._coyote = 0; this._landT = 1;
    this._playClock = 0; this._magnetAt = c.magnetFirst;
    var x = (c.xMin + c.xMax) / 2, by = c.hogRestY + c.boardOff;
    this.hog = {
      x: x, y: c.hogRestY, vx: 0, vy: 0, air: false, lift: 0, tilt: 0, face: 1, frame: 'skate',
      spin: 0, curl: 0, invuln: 0, squash: 0, wheel: 0,
      board: { x: x, y: by, rot: 0, vx: 0, vy: 0, _px: x, _py: by },
      ax: 0, airT: 0, bonkT: 0, happyT: 0, pushT: 0, _flip: 1,
      _px: x, _py: c.hogRestY
    };
    this.vents = [];
    this.items = [];
    this._emit({ type: 'start' });
    this.startLevel(0);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /* ------------------------------ level setup ------------------------------ */
  /** Numbers for level i (UI / tests / sim). */
  World.prototype.levelInfo = function (i) {
    var c = this.cfg, z = i % 4, lap = Math.floor(i / 4);
    return {
      zone: z, zoneName: ZONES[z], lap: lap,
      boxTarget: Math.max(c.boxMin, Math.round(c.boxTargets[z] * (c.lengthK || 1))),
      vents: c.vents[z],
      spawnGap: Math.max(c.gapMin, c.spawnGap[z] * (1 - c.lapGap * lap)),
      rise: c.rise[z] * c.riseMul * Math.min(c.riseCap, 1 + c.lapRise * lap),
      pebbleGap: c.pebbleGap[z] / (c.pebbleMul * Math.min(c.pebbleCap, 1 + c.lapPebble * lap)),
      pebbleDelay: lap === 0 ? c.pebbleDelay[z] : Math.min(c.pebbleDelay[z], 4),
      puffTime: c.puffTime,
      magnetDur: c.magnetDur
    };
  };

  /** startLevel(i): zone = i % 4, lap = floor(i / 4); clears items, picks vents, keeps score/hearts/streak. */
  World.prototype.startLevel = function (i) {
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i);
    this.level = i; this.zone = info.zone; this.lap = info.lap;
    this.levelTime = 0;
    this.box = 0; this.boxTarget = info.boxTarget;
    if (this._ownLength) this._lenLevel = i;
    this._info = info;
    this.items = [];
    this._boxFull = false; this._graceT = 0;
    this._nextSpawn = 1e9;             // armed on 'go'
    this._pebClock = 0; this._nextPebble = info.pebbleDelay;
    this.magnet.t = 0; this.magnet.dur = this.cfg.magnetDur;
    this.chain = 0;
    this._placeVents(info.vents);
    this.state = 'ready'; this._stateT = 0;
    this._emit({ type: 'zone', zone: this.zone, level: i, lap: this.lap });
    return this;
  };

  /* vents: n craters inside the play range, ≥ ventGap apart (deterministic for the rng state) */
  World.prototype._placeVents = function (n) {
    var c = this.cfg, r = this.rng, lo = c.xMin + c.ventMargin, hi = c.xMax - c.ventMargin, span = hi - lo;
    var gap = c.ventGap;
    var nMax = 1 + Math.floor(span / Math.max(1, Math.min(gap, 90)));
    n = Math.max(1, Math.min(n, nMax));
    if ((n - 1) * gap > span) gap = span / Math.max(1, n - 1);
    // stratified: n slots, then jitter inside the freedom left over
    var free = span - (n - 1) * gap, xs = [], u = [], k;
    for (k = 0; k < n; k++) u.push(r.next());
    u.sort(function (a, b) { return a - b; });
    for (k = 0; k < n; k++) xs.push(lo + k * gap + u[k] * free);
    var old = this.vents || [];
    this.vents = [];
    for (k = 0; k < n; k++) this.vents.push({ x: xs[k], puff: 0, cool: old[k] ? old[k].cool : 0 });
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.setMove = function (mx) { mx = +mx || 0; this._mx = clamp(mx, -1, 1); };
  World.prototype.setTarget = function (x) {
    if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) { this._target = null; return; }
    this._target = +x;
  };

  /** setPlayRange(xMin, xMax): the part of the floor Bristle can reach on this screen (mobile).
   *  Vents are re-placed inside it (same count when they fit), puffing bubbles move with their vent,
   *  bubbles in flight and falling pebbles are clamped into the range. */
  World.prototype.setPlayRange = function (xMin, xMax) {
    var c = this.cfg, cx = 480;
    xMin = Math.max(20, Math.min(cx - 120, +xMin || 60));
    xMax = Math.min(940, Math.max(cx + 120, +xMax || 900));
    if (xMin === c.xMin && xMax === c.xMax) return this;
    c.xMin = xMin; c.xMax = xMax;
    var s = this.hog;
    if (s) {
      if (s.x < xMin) { s.x = xMin; if (s.vx < 0) s.vx = 0; } else if (s.x > xMax) { s.x = xMax; if (s.vx > 0) s.vx = 0; }
      s._px = s.x; s.board.x = s.board._px = s.x;
    }
    var ventsOut = false, lo = xMin + c.ventMargin, hi = xMax - c.ventMargin;
    if (this.vents) for (var vi = 0; vi < this.vents.length; vi++) if (this.vents[vi].x < lo || this.vents[vi].x > hi) ventsOut = true;
    if (this.vents && this._info) {
      if (ventsOut) this._placeVents(this._info.vents);   // only re-place when a vent left the visible floor (functional P3-3)
      var items = this.items || [], i, it;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        if (it.state === 'puff') {
          var v = this.vents[Math.min(it.vent, this.vents.length - 1)];
          it.vent = Math.min(it.vent, this.vents.length - 1);
          it.x = it._px = v.x;
        } else if (it.kind === 'pebble') {
          var nb = clamp(it._bx, xMin + 10, xMax - 10);
          if (nb !== it._bx) { it.x += nb - it._bx; it._bx = nb; it._px = it.x; this._predictLand(it); }
        } else if (it.state === 'rise') {
          var nx = clamp(it.x, xMin - c.wallPad, xMax + c.wallPad);
          if (nx !== it.x) { it.x = it._px = nx; it.vx = 0; }
        }
      }
    }
    return this;
  };

  /** Jump (buffered ≈ 0.12 s). Returns true when Bristle takes off now. */
  World.prototype.action = function () {
    if (this.state === 'dead') return false;
    this._jumpBuf = Math.max(this._jumpBuf, this.cfg.jumpBuffer);
    if ((!this.hog.air && this._landT >= this.cfg.landLag) || this._coyote > 0) { this._jump(); return true; }
    if (!this.hog.air) this._jumpBuf = Math.max(this._jumpBuf, this.cfg.landLag - this._landT + this.cfg.step);   // fires after the lag
    return false;
  };
  World.prototype._jump = function () {
    var c = this.cfg, s = this.hog;
    this._jumpBuf = 0; this._coyote = 0;
    s.air = true; s.vy = -c.jumpV; s.airT = 0; s._flip = 0;
    s.squash = Math.max(s.squash, 0.25);
    this.chain = 0;
    this.jumps++;
    this._emit({ type: 'jump', x: s.x });
  };

  /* ------------------------------ simulation ------------------------------ */
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += dt;                 // no clamp: main.js clamps tab-switch gaps BEFORE × speed
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
  };

  World.prototype._step = function (h) {
    var c = this.cfg, s = this.hog, i, it;
    s._px = s.x; s._py = s.y; s.board._px = s.board.x; s.board._py = s.board.y;
    for (i = 0; i < this.items.length; i++) { it = this.items[i]; it._px = it.x; it._py = it.y; }
    this.time += h; this.levelTime += h; this._stateT += h; this.steps++;

    var st = this.state;
    this._stepHog(h, st !== 'dead');
    if (st === 'ready') {
      if (this._stateT >= c.introDelay) {
        this.state = 'playing'; this._stateT = 0;
        this._nextSpawn = c.firstSpawn;
        this._emit({ type: 'go', level: this.level });
      }
    } else if (st === 'playing') {
      if (!this._boxFull) {
        this._playClock += h;
        this._stepSpawns(h);
        this._stepPebbleSpawns(h);
      } else {
        this._graceT -= h;
        if (this._graceT <= 0) this._clear();
      }
    }
    if (this.magnet.t > 0) {
      this.magnet.t = Math.max(0, this.magnet.t - h);
      if (this.magnet.t <= 0) this._emit({ type: 'magnetend' });
    }
    this._stepVents(h);
    this._stepItems(h);
    this._stepVisual(h);
    if (this.state === 'cleared' && this._stateT >= c.clearTime) this.startLevel(this.level + 1);
  };

  /* ---- Bristle: skating, jump arc, landing ---- */
  World.prototype._stepHog = function (h, control) {
    var c = this.cfg, s = this.hog, a = 0, vx0 = s.vx;
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - h);
    if (s.bonkT > 0) s.bonkT = Math.max(0, s.bonkT - h);
    if (s.happyT > 0) s.happyT = Math.max(0, s.happyT - h);
    if (this._jumpBuf > 0) this._jumpBuf = Math.max(0, this._jumpBuf - h);
    if (this._coyote > 0) this._coyote = Math.max(0, this._coyote - h);
    var k = s.air ? c.airControl : 1, vmax = c.maxSpeed, stopped = false;
    if (control && Math.abs(this._mx) > 0.05) {
      var want = this._mx * vmax, d = want - s.vx;
      var rate = (want * s.vx < 0 || Math.abs(want) < Math.abs(s.vx)) ? c.turnAccel : c.accel;
      if (Math.abs(want) < Math.abs(s.vx) && want * s.vx >= 0) rate = c.coastDecel;   // slowing to a lower key speed: roll
      a = clamp(d / h, -rate * k, rate * k);
    } else if (control && this._target !== null) {
      var dx = clamp(this._target, c.xMin, c.xMax) - s.x, adx = Math.abs(dx), F = c.followAccel * k;
      if (adx < c.followStop && Math.abs(s.vx) < 40 && !s.air) { a = -s.vx / h; stopped = true; }
      else {
        var vdes = sgn(dx) * Math.min(vmax, c.followOmega * adx, Math.sqrt(2 * c.followBrake * F * adx));
        a = clamp((vdes - s.vx) / h, -F, F);
      }
    } else if (!s.air) {
      a = -sgn(s.vx) * Math.min(Math.abs(s.vx) / h, c.coastDecel);
    } else {
      a = -c.airDrag * s.vx;
    }
    s.vx += a * h;
    if (stopped) s.vx = 0;
    if (s.vx > vmax) s.vx = vmax; else if (s.vx < -vmax) s.vx = -vmax;
    s.x += s.vx * h;
    if (s.x < c.xMin) { s.x = c.xMin; if (s.vx < 0) s.vx = 0; }
    else if (s.x > c.xMax) { s.x = c.xMax; if (s.vx > 0) s.vx = 0; }
    s.ax = (s.vx - vx0) / h;
    if (!s.air) s.wheel += s.vx * h / c.wheelR;
    else s.wheel += s.vx * 0.5 * h / c.wheelR;   // free-spinning, slowing

    // vertical: Moon gravity arc
    if (s.air) {
      s.airT += h;
      var vy0 = s.vy;
      s.vy += c.gravity * h;
      var soft = c.ceilY + c.ceilSoft;
      if (s.y < soft && s.vy < 0) s.vy += c.gravity * 3 * ((soft - s.y) / c.ceilSoft) * h;   // eases off the ceiling
      s.y += 0.5 * (vy0 + s.vy) * h;     // average velocity: exact for constant gravity (apex = v²/2g on the dot)
      if (s.y < c.ceilY) { s.y = c.ceilY; if (s.vy < 0) s.vy = 0; }
      if (s.y >= c.hogRestY) {
        var vLand = s.vy;
        s.y = c.hogRestY; s.vy = 0; s.air = false; s._flip = 1;
        s.squash = Math.max(s.squash, c.squashLand * clamp(vLand / c.jumpV, 0.3, 1.2));
        if (this.chain > 0) this.chain = 0;
        this._landT = 0;
        this._emit({ type: 'land', x: s.x, vy: vLand });
        if (this._jumpBuf > 0) this._jumpBuf = Math.max(this._jumpBuf, c.landLag + h);   // keep the press through the lag
      }
    } else {
      s.y = c.hogRestY; s.vy = 0;
      this._landT += h;
      if (this._jumpBuf > 0 && control && this._landT >= c.landLag) this._jump();
    }
    s.lift = Math.max(0, c.hogRestY - s.y);
  };

  World.prototype._hogR = function () { var c = this.cfg; return c.hogR + (c.hogBallR - c.hogR) * this.hog.curl; };

  World.prototype._stepVisual = function (h) {
    var c = this.cfg, s = this.hog, b = s.board;
    var tt = clamp(s.vx / c.maxSpeed * c.tiltMax, -c.tiltMax, c.tiltMax);
    s.tilt += (tt - s.tilt) * (1 - Math.exp(-c.tiltRate * h));
    if (s.vx > c.faceDead) s.face = 1; else if (s.vx < -c.faceDead) s.face = -1;
    s.squash *= Math.exp(-c.squashDecay * h);
    if (s.squash < 1e-3) s.squash = 0;
    // curl into a ball after curlDelay in the air; uncurl on the floor
    var ct = s.air && s.airT >= c.curlDelay ? 1 : 0;
    s.curl += (ct - s.curl) * (1 - Math.exp(-(ct ? c.curlRate : c.uncurlRate) * h));
    if (Math.abs(ct - s.curl) < 1e-3) s.curl = ct;
    if (s.curl > 0.02) s.spin += s.face * c.spinRate * TAU * s.curl * h;
    else s.spin = 0;
    // board: follows with a small lag in the air (critically damped spring), snapped on the floor
    var tx = s.x, ty = Math.min(s.y + c.boardOff + 6 * s.curl, c.hogRestY + c.boardOff);
    if (s.air) {
      var om = c.boardOmega;
      b.vx += (om * om * (tx - b.x) - 2 * om * b.vx) * h; b.vy += (om * om * (ty - b.y) - 2 * om * b.vy) * h;
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.y > c.hogRestY + c.boardOff) { b.y = c.hogRestY + c.boardOff; if (b.vy > 0) b.vy = 0; }
      s._flip = Math.min(1, s._flip + h / c.flipTime);
      b.rot = s.tilt + (s._flip < 1 ? s.face * TAU * smooth(s._flip) : 0);
    } else {
      b.x = tx; b.y = c.hogRestY + c.boardOff; b.vx = s.vx; b.vy = 0; b.rot = 0;   // flat on the floor (visual QA P1: both wheels on the ground)
    }
    // pushing (accelerating along the motion on the floor) alternates 'push' / 'skate'
    var pushing = !s.air && Math.abs(s.vx) > 20 && s.ax * sgn(s.vx) > c.pushMinA && Math.abs(s.vx) < c.maxSpeed - 1;
    s.pushT = pushing ? s.pushT + h : 0;
    if (this.state === 'dead' || s.bonkT > 0) s.frame = 'bonk';
    else if (s.air) s.frame = s.curl > 0.5 ? 'ball' : 'jump';
    else if (s.happyT > 0 || this.state === 'cleared') s.frame = 'happy';
    else if (pushing && (s.pushT % c.pushPeriod) < c.pushPeriod * 0.5) s.frame = 'push';
    else s.frame = 'skate';
  };

  /* ---- vents: puff glow + cooldown ---- */
  World.prototype._stepVents = function (h) {
    var c = this.cfg, i, v;
    for (i = 0; i < this.vents.length; i++) { v = this.vents[i]; v.puff = 0; if (v.cool > 0) v.cool = Math.max(0, v.cool - h); }
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state === 'puff' && this.vents[it.vent]) this.vents[it.vent].puff = Math.max(this.vents[it.vent].puff, clamp(it.t / it._puff, 0, 1));
    }
  };

  /* ---- spawn scheduler (bubbles) ---- */
  World.prototype._stepSpawns = function (h) {
    this._nextSpawn -= h;
    if (this._nextSpawn > 0) return;
    if (this._spawnBubble()) {
      var g = this._info.spawnGap, j = this.cfg.spawnJitter;
      this._nextSpawn += g * this.rng.range(1 - j, 1 + j);
    } else this._nextSpawn = 0.1;      // no free vent: try again soon
  };

  World.prototype._magnetAlive = function () {
    for (var i = 0; i < this.items.length; i++) { var it = this.items[i]; if (it.kind === 'magnet' && (it.state === 'puff' || it.state === 'rise')) return true; }
    return false;
  };

  World.prototype._spawnBubble = function () {
    var c = this.cfg, r = this.rng, free = [], i;
    var busy = {};
    for (i = 0; i < this.items.length; i++) if (this.items[i].state === 'puff') busy[this.items[i].vent] = 1;
    for (i = 0; i < this.vents.length; i++) if (this.vents[i].cool <= 0 && !busy[i]) free.push(i);
    if (!free.length) return false;
    var vi = free[r.int(0, free.length - 1)], v = this.vents[vi];
    var kind = 'cupcake';
    if (this._playClock >= this._magnetAt && this.magnet.t <= 0 && !this._magnetAlive() && this.box < this.boxTarget - 2) {
      kind = 'magnet';
      this._magnetAt = this._playClock + r.range(c.magnetEvery[0], c.magnetEvery[1]);
    }
    var R = c.bubbleR;
    var it = {
      id: this._nextId++, kind: kind, color: kind === 'cupcake' ? r.int(0, 2) : 0,
      x: v.x, y: c.ventY, vx: 0, vy: 0, r: R * 0.55, wob: r.range(0, TAU), squish: 0, rot: 0, spin: 0,
      vent: vi, state: 'puff', t: 0, alpha: 0, _px: v.x, _py: c.ventY,
      _R: R, _sw: r.range(0, TAU), _evx: r.range(-c.emergeVx, c.emergeVx), _puff: this._info.puffTime,
      _k: c.bubbleDrag, _vR: this._info.rise
    };
    v.cool = c.ventCool + it._puff;
    this.items.push(it);
    this.spawned++;
    this._emit({ type: 'puff', id: it.id, kind: kind, x: v.x });
    return true;
  };

  /* ---- pebble scheduler + fair aiming ---- */
  World.prototype._stepPebbleSpawns = function (h) {
    this._pebClock += h;
    if (this._pebClock < this._nextPebble) return;
    this._spawnPebble();
    var g = this._info.pebbleGap, j = this.cfg.pebbleJitter;
    this._nextPebble = this._pebClock + g * this.rng.range(1 - j, 1 + j);
  };

  /** Closed-form pebble position `tau` s from now (no bounce). */
  World.prototype.pebbleAt = function (it, tau) {
    var k = it._k, vT = it._vT, e = Math.exp(-k * tau);
    return {
      x: it._bx + it._A * Math.sin(it._ph + it._om * tau),
      y: it.y + vT * tau + (it.vy - vT) / k * (1 - e)
    };
  };
  /** Seconds until a falling pebble's centre reaches y = Y (exact solution of the integrator's ODE). */
  World.prototype.pebbleTimeTo = function (it, Y) {
    var k = it._k, vT = it._vT, y0 = it.y, vy0 = it.vy;
    if (y0 >= Y) return 0;
    var tau = Math.max(0.01, (Y - y0) / vT);
    for (var n = 0; n < 16; n++) {
      var e = Math.exp(-k * tau);
      var f = y0 + vT * tau + (vy0 - vT) / k * (1 - e) - Y, fp = vT + (vy0 - vT) * e;
      if (fp <= 1e-6) { tau += 0.1; continue; }
      var d = f / fp; tau -= d;
      if (tau < 0) tau = 0;
      if (Math.abs(d) < 1e-7) break;
    }
    return tau;
  };
  World.prototype._landY = function () { return this.cfg.floorY - this.cfg.pebbleR - 2; };
  World.prototype._predictLand = function (it) {
    var tl = this.pebbleTimeTo(it, this._landY());
    it.lx = this.pebbleAt(it, tl).x; it.lt = this.time + tl;
    // hero band: the pebble can touch a skating Bristle once it is this low
    var c = this.cfg, band = c.hogRestY - (c.pebbleR + c.hogR * c.pebbleHitK);
    it.te = this.time + this.pebbleTimeTo(it, band);
    return tl;
  };

  World.prototype._newPebble = function (x) {
    var c = this.cfg, r = this.rng;
    var it = {
      id: this._nextId++, kind: 'pebble', color: r.int(0, 1), x: x, y: c.pebbleSpawnY, vx: 0, vy: c.pebbleV0,
      r: c.pebbleR, wob: 0, squish: 0, rot: r.range(0, TAU), spin: r.range(0.4, c.pebbleSpinMax) * r.sign(),
      vent: -1, state: 'fall', t: 0, alpha: 1, _px: x, _py: c.pebbleSpawnY,
      _bx: x, _A: c.pebbleSwayA, _om: c.pebbleSwayRate, _ph: r.range(0, TAU), _k: c.pebbleDrag, _vT: c.pebbleVT,
      harmless: false, shadow: 0, lx: x, lt: 0, te: 0
    };
    return it;
  };

  World.prototype._spawnPebble = function () {
    var c = this.cfg, r = this.rng, s = this.hog, lo = c.xMin + 10, hi = c.xMax - 10;
    var p = clamp(s.x + c.pebbleLead * s.vx, c.xMin, c.xMax);
    var it = this._newPebble(480), others = [], i, o;
    for (i = 0; i < this.items.length; i++) {
      o = this.items[i];
      if (o.kind === 'pebble' && o.state === 'fall' && !o.harmless) others.push(o);
    }
    var best = null, bestV = 1e9;
    for (var k = 0; k < c.pebbleTries; k++) {
      var x;
      if (r.chance(c.pebbleAim)) x = p + r.sign() * r.range(c.pebbleAvoid, 160);
      else x = r.range(lo, hi);
      x = clamp(x, lo, hi);
      // choose the base so that the LANDING x (incl. sway) is x
      it._bx = x; this._predictLand(it);
      it._bx = x - (it.lx - x); it.x = it._bx + it._A * Math.sin(it._ph);
      this._predictLand(it);
      var viol = 0, tEnter = it.te - this.time;
      var near = Math.abs(it.lx - p);
      if (near < c.pebbleAvoid && (!c.pebbleNearOK || tEnter < c.pebbleDodgeT)) viol += c.pebbleAvoid - near;
      for (i = 0; i < others.length; i++) {
        o = others[i];
        var overlapT = it.te - c.pebbleSepT < o.lt && o.te - c.pebbleSepT < it.lt;
        var d = Math.abs(o.lx - it.lx);
        if (overlapT && d < c.pebbleSep) viol += c.pebbleSep - d;
      }
      if (viol < bestV) { bestV = viol; best = { bx: it._bx }; if (viol <= 0) break; }
    }
    if (bestV > 0) return false;          // no fair spot right now: skip this pebble
    it._bx = best.bx; it.x = it._px = it._bx + it._A * Math.sin(it._ph);
    this._predictLand(it);
    this.items.push(it);
    this.pebblesDropped++;
    this._emit({ type: 'pebblewarn', id: it.id, x: it.lx, t: +(it.lt - this.time).toFixed(3) });
    return true;
  };

  /** Closed-form bubble position `tau` s from now, without magnet / repulsion / walls (bot planning).
   *  Includes the remaining puff time for puffing bubbles. */
  World.prototype.bubbleAt = function (it, tau) {
    var c = this.cfg, x0 = it.x, y0 = it.y, vx0 = it.vx, vy0 = it.vy, sw = it._sw, t = tau;
    if (it.state === 'puff') {
      var wait = Math.max(0, it._puff - it.t);
      if (t <= wait) return { x: x0, y: y0 };
      t -= wait; vx0 = it._evx; vy0 = -c.emergeV;
    }
    var k = it._k, vR = it._vR, kx = c.dragX, w = c.swayRate;
    var y = y0 - vR * t + (vy0 + vR) / k * (1 - Math.exp(-k * t));
    var x = x0 + vx0 / kx * (1 - Math.exp(-kx * t)) + c.swayA / w * (Math.cos(sw) - Math.cos(sw + w * t));
    return { x: x, y: y };
  };
  /** Seconds until a bubble (rise or puff) escapes (centre above escapeY), ignoring the magnet. */
  World.prototype.bubbleEscapeIn = function (it) {
    var lo = 0, hi = 30;
    if (this.bubbleAt(it, hi).y > this.cfg.escapeY) return hi;
    for (var n = 0; n < 30; n++) { var m = (lo + hi) / 2; if (this.bubbleAt(it, m).y > this.cfg.escapeY) lo = m; else hi = m; }
    return hi;
  };

  /* ---- items: bubbles + pebbles ---- */
  World.prototype._stepItems = function (h) {
    var c = this.cfg, s = this.hog, i, j, it, o;
    var canPop = this.state === 'playing' || this.state === 'ready';
    var lo = c.xMin - c.wallPad, hi = c.xMax + c.wallPad, M = this.magnet, R = M.r;
    // soft mutual repulsion between rising bubbles (pairwise, n ≤ ~10)
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state !== 'rise') continue;
      for (j = i + 1; j < this.items.length; j++) {
        o = this.items[j];
        if (o.state !== 'rise') continue;
        var dx = o.x - it.x, dy = o.y - it.y, d2 = dx * dx + dy * dy, minD = it.r + o.r, rr = minD * c.repelRange;
        if (d2 >= rr * rr) continue;
        var d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d;
        if (d2 < 1e-6) { nx = 1; ny = 0; }
        var f = c.repelK * (rr - d) / minD;
        it.vx -= nx * f * h; it.vy -= ny * f * h; o.vx += nx * f * h; o.vy += ny * f * h;
        var sq = clamp((rr - d) / (minD * 0.3), 0, 1);
        if (sq > it.squish) it.squish = sq;
        if (sq > o.squish) o.squish = sq;
        var dMin = minD * (1 - c.overlapMax);
        if (d < dMin) {                                  // hard limit: push apart to 70 % of (r1 + r2)
          var push = (dMin - d) / 2;
          it.x -= nx * push; it.y -= ny * push; o.x += nx * push; o.y += ny * push;
        }
      }
    }
    var hogR = this._hogR();
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      it.t += h;
      if (it.kind === 'pebble') { if (this._stepPebble(it, h, i)) this.items.splice(i, 1); continue; }
      it.wob += c.wobRate * TAU * h;
      if (it.squish > 0) { it.squish *= Math.exp(-c.squishDecay * h); if (it.squish < 1e-3) it.squish = 0; }
      if (it.state === 'puff') {
        it.alpha = 0;
        if (it.t >= it._puff) {
          it.state = 'rise'; it.t = 0; it.alpha = 1;
          it.vx = it._evx; it.vy = -c.emergeV;
          this._emit({ type: 'emerge', id: it.id, kind: it.kind, x: it.x });
        }
      } else if (it.state === 'rise') {
        var k = it._k, buoy = it._vR * k, ax = -c.dragX * it.vx, ay = -buoy - k * it.vy, swK = 1;
        if (it.x < lo) ax += c.wallK * (lo - it.x) - 2 * it.vx * (it.vx < 0 ? 1 : 0);
        else if (it.x > hi) ax += c.wallK * (hi - it.x) - 2 * it.vx * (it.vx > 0 ? 1 : 0);
        if (M.t > 0) {
          var mdx = s.x - it.x, mdy = s.y - it.y, md = Math.sqrt(mdx * mdx + mdy * mdy) || 1;
          if (md < R) {
            var pull = c.magnetAccel * Math.sqrt(1 - md / R);
            // pull toward Bristle + extra drag (they curve in, not slingshot); 60 % of the buoyancy is
            // cancelled so bubbles above him really sink toward him
            ax += pull * mdx / md - c.magnetDrag * it.vx;
            ay += pull * mdy / md - c.magnetDrag * it.vy + 0.6 * buoy;
            swK = 0.3;
          }
        }
        it.vx += ax * h; it.vy += ay * h;
        if (M.t > 0) {
          var sp = Math.sqrt(it.vx * it.vx + it.vy * it.vy);
          if (sp > c.magnetMaxV) { it.vx *= c.magnetMaxV / sp; it.vy *= c.magnetMaxV / sp; }
        }
        it._sw += c.swayRate * h;
        it.x += (it.vx + swK * c.swayA * Math.sin(it._sw)) * h;
        it.y += it.vy * h;
        if (it.x < lo - 20) { it.x = lo - 20; if (it.vx < 0) it.vx = 0; } else if (it.x > hi + 20) { it.x = hi + 20; if (it.vx > 0) it.vx = 0; }
        if (it.y > c.ventY + 4) { it.y = c.ventY + 4; if (it.vy > 0) it.vy = 0; }
        it.r = it._R * (0.55 + 0.45 * smooth(it.t / c.growTime));
        it.rot = 0.12 * Math.sin(it._sw * 0.8);
        // pop test: Bristle's spikes
        if (canPop) {
          var ddx = it.x - s.x, ddy = it.y - s.y, rr2 = it.r + hogR;
          if (ddx * ddx + ddy * ddy < rr2 * rr2) { this._pop(it); continue; }
        }
        if (it.y < c.escapeY) this._escape(it, true);
      } else if (it.state === 'pop') {
        it.x += it.vx * h; it.y += it.vy * h;
        it.alpha = clamp(1 - it.t / c.popTime, 0, 1);
        it.r = it._R * (1 + 0.25 * (it.t / c.popTime));
        if (it.t >= c.popTime) { this.items.splice(i, 1); continue; }
      } else if (it.state === 'escape') {
        it.vy += (-it._vR * 1.2 - it.vy) * (1 - Math.exp(-3 * h));
        it.x += it.vx * h; it.y += it.vy * h;
        it.alpha = clamp(1 - it.t / c.escapeTime, 0, 1);
        if (it.t >= c.escapeTime) { this.items.splice(i, 1); continue; }
      }
    }
  };

  /* pebble motion; returns true when it should be removed */
  World.prototype._stepPebble = function (it, h) {
    var c = this.cfg, s = this.hog, ly = this._landY();
    if (it.state === 'fall') {
      it.vy += (it._vT * it._k - it._k * it.vy) * h;
      if (it.vx) { it._bx += it.vx * h; it.vx *= Math.exp(-0.8 * h); }
      it._ph += it._om * h;
      it.x = it._bx + it._A * Math.sin(it._ph);
      it.y += it.vy * h;
      it.rot += it.spin * h;
      var span = ly - c.pebbleSpawnY;
      it.shadow = clamp((it.y - c.pebbleSpawnY) / span, 0, 1);
      if (it.harmless && this._boxFull) { it.alpha -= h / 0.5; if (it.alpha <= 0) return true; }
      if (!it.harmless && this.state === 'playing' && !this._boxFull && s.invuln <= 0) {
        var dx = it.x - s.x, dy = it.y - s.y, rr = c.pebbleR + this._hogR() * c.pebbleHitK;
        if (dx * dx + dy * dy < rr * rr) this._bonk(it);
      }
      if (it.y >= ly) {
        it.y = ly; it.state = 'land'; it.t = 0; it.shadow = 1;
        it.vx = (it.vx ? sgn(it.vx) : sgn(it.spin)) * c.landRoll; it.vy = 0;
        if (it.alpha > 0.05) this._emit({ type: 'pebbleland', id: it.id, x: it.x, y: c.floorY });
      }
    } else if (it.state === 'land') {
      it.vx *= Math.exp(-3 * h);
      it.x += it.vx * h;
      it.rot += it.vx / it.r * h;
      it.alpha = Math.min(it.alpha, clamp(1 - it.t / c.landTime, 0, 1));
      if (it.t >= c.landTime) return true;
    }
    return false;
  };

  World.prototype._bonk = function (it) {
    var c = this.cfg, s = this.hog, dir = s.x >= it.x ? 1 : -1;
    it.harmless = true;
    it.vy = -120; it.vx = -dir * 90; it.spin *= 2;   // bounces off Bristle's spikes, then falls on
    this.bonks++;
    this.hearts = Math.max(0, this.hearts - 1);
    var had = this.combo;
    this.combo = 0; this.mult = 1;
    s.invuln = c.invulnTime; s.bonkT = c.bonkTime; s.happyT = 0; s.squash = 1;
    s.vx = dir * c.knockV;
    this._emit({ type: 'bonk', id: it.id, x: (s.x + it.x) / 2, y: (s.y + it.y) / 2, hearts: this.hearts, combo: had });
    if (this.hearts <= 0 && this.state !== 'dead') {
      this.state = 'dead'; this._stateT = 0;
      this._emit({ type: 'dead', score: this.score, level: this.level });
    }
  };

  World.prototype._tier = function (y) { var t = this.cfg.tierY; return y > t[0] ? 1 : y > t[1] ? 2 : 3; };

  World.prototype._pop = function (it) {
    var c = this.cfg, s = this.hog;
    var tier = this._tier(it.y), air = s.air;
    var pvx = it.vx, pvy = it.vy;
    it.state = 'pop'; it.t = 0; it.alpha = 1; it.squish = 1;
    it.vx *= 0.2; it.vy *= 0.2;
    if (air) {
      if (s.vy > -c.popBounce) s.vy = -c.popBounce;
      this.chain++;
      if (this.chain > this.bestChain) this.bestChain = this.chain;
      this.airPops++;
    }
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    var m = 1, th = c.multThresholds;
    for (var k = th.length - 1; k >= 0; k--) if (this.combo >= th[k]) { m = k + 1; break; }
    var up = m > this.mult;
    this.mult = m;
    var chainN = air ? this.chain : 0;
    var pts = c.basePoints * tier * this.mult + c.chainPoints * Math.max(0, chainN - 1);
    this.score += pts;
    this.popsTotal++;
    if (tier === 3) this.skyPops++;
    s.squash = Math.max(s.squash, c.squashPop);
    if (!air) s.happyT = c.happyTime;
    this._emit({ type: 'pop', id: it.id, x: it.x, y: it.y, kind: it.kind, color: it.color, tier: tier, points: pts,
      combo: this.combo, mult: this.mult, chain: chainN, air: air, vx: pvx, vy: pvy });
    if (up) this._emit({ type: 'multup', mult: this.mult });
    if (air && this.chain >= 2) this._emit({ type: 'chain', n: this.chain, x: it.x, y: it.y });
    if (it.kind === 'magnet') {
      this.magnets++;
      this.magnet.t = this.magnet.dur = c.magnetDur;
      this._emit({ type: 'magnet', dur: c.magnetDur });
    } else {
      this.cupcakes++;
      if (!this._boxFull) {
        this.box = Math.min(this.boxTarget, this.box + 1);
        if (this.box >= this.boxTarget) this._fillBox();
      }
    }
  };

  World.prototype._escape = function (it, counts) {
    it.state = 'escape'; it.t = 0;
    if (!counts) return;
    var had = this.combo;
    if (it.kind === 'cupcake') {
      this.escaped++;
      if (this.combo > 0) { this.combo = 0; this.mult = 1; }
    }
    this._emit({ type: 'escape', id: it.id, kind: it.kind, x: it.x, y: it.y, combo: it.kind === 'cupcake' ? had : 0 });
  };

  World.prototype._fillBox = function () {
    this._boxFull = true; this._graceT = this.cfg.boxGrace;
    this._emit({ type: 'boxfull', level: this.level });
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (it.state === 'puff') this.items.splice(i, 1);                                   // spawns stop
      else if (it.kind === 'pebble' && it.state === 'fall') it.harmless = true;            // falling pebbles fade
    }
  };

  World.prototype._clear = function () {
    var c = this.cfg;
    var bonus = this.hearts * c.clearBonusPerHeart;
    this.score += bonus;
    this.levelsCleared++;
    this.state = 'cleared'; this._stateT = 0;
    this.magnet.t = 0;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state === 'rise') this._escape(this.items[i], false);   // float away quietly
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
    if (c.healOnClear > 0 && this.lap < c.healLaps && this.hearts < this.heartsMax) {
      this.hearts = Math.min(this.heartsMax, this.hearts + c.healOnClear);
      this._emit({ type: 'heal', hearts: this.hearts });
    }
  };

  /** Compact snapshot for debug / tests. */
  World.prototype.snapshot = function () {
    var s = this.hog, f = function (v) { return +v.toFixed(2); };
    return {
      state: this.state, level: this.level, zone: this.zone, zoneName: ZONES[this.zone], lap: this.lap,
      score: this.score, hearts: this.hearts, combo: this.combo, mult: this.mult, chain: this.chain,
      box: this.box, boxTarget: this.boxTarget, items: this.items.length, pops: this.popsTotal, bonks: this.bonks,
      escaped: this.escaped, magnet: f(this.magnet.t),
      hog: { x: f(s.x), y: f(s.y), vx: f(s.vx), vy: f(s.vy), air: s.air, frame: s.frame, curl: f(s.curl) },
      vents: this.vents.map(function (v) { return f(v.x); }),
      itemsAt: this.items.map(function (it) { return [it.id, it.kind, it.state, f(it.x), f(it.y)]; }),
      time: +this.time.toFixed(3)
    };
  };

  // aliases for code written against the sister game ("jar"): w.jar / w.jarTarget ↔ w.box / w.boxTarget
  Object.defineProperty(World.prototype, 'jar', { get: function () { return this.box; }, set: function (v) { this.box = v; } });
  Object.defineProperty(World.prototype, 'jarTarget', { get: function () { return this.boxTarget; }, set: function (v) { this.boxTarget = v; } });

  MP.CONFIG = CONFIG;
  MP.DIFFICULTY = DIFFICULTY;
  MP.ZONES = ZONES;
  MP.World = World;
})(window.MP = window.MP || {});
