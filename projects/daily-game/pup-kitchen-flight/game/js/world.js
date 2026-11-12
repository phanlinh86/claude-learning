/* Biscuit's Kitchen Flight — BKF.CONFIG, BKF.DIFFICULTY, BKF.GEOM, BKF.World
 * Headless, deterministic simulation (no DOM). Contract: docs/DESIGN.md §5. Notes: docs/MECHANICS.md.
 *
 * Conventions
 *  - Logical stage 960×540 px, y DOWN, px / seconds / radians.
 *  - Every entity x is SCREEN x inside the 960 frame. Biscuit stays near PUP_X = 260; the kitchen
 *    scrolls LEFT at w.scrollSpeed px/s; w.scroll = total distance (parallax).
 *  - Rotations: positive = clockwise on screen = Biscuit's nose DOWN (he faces right).
 *    Hanger ang: positive = the head swings to the RIGHT (head.x = x + sin(ang)·R).
 *  - update(dt) runs fixed sub-steps of CONFIG.step (1/120 s) with an accumulator, so a run only
 *    depends on seed + difficulty + the step index at which flap() is called.
 *    w.alpha = leftover/step in [0,1) for render interpolation (lerp prev* → current).
 *
 *   const w = new BKF.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, config: {} });
 *   w.reset(); w.flap(); w.update(dt); w.drainEvents(); w.getState(); w.gotoLevel(i);
 *   w.hangHead(o) → {x,y}; w.hitShapes() → [{kind:'circle'|'rect'|'seg', ..., tag}]
 */
(function (BKF) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ CONFIG
   * Base values = NORMAL. BKF.DIFFICULTY.easy/hard override some keys. */
  var CONFIG = {
    // --- stage / timing
    width: 960, height: 540,        // px, logical stage
    step: 1 / 120,                  // s, fixed sub-step: stable springs/pendulums, crisp input timing
    maxFrame: 0.25,                 // s, longest dt one update() will simulate (tab-switch guard)
    counterY: 470,                  // px, top of the counter (COUNTER_Y)
    railY: 40,                      // px, hanging rail = pendulum pivot (RAIL_Y)
    ceilingY: 24,                   // px, top of Biscuit's hit circle is clamped here (ceiling never hurts)
    pupX: 260,                      // px, Biscuit's fixed screen x (PUP_X)
    spawnX: 1240,                   // px, new beats are generated once the last one is left of this (SPAWN_X)
    despawnX: -200,                 // px, things left of this are removed
    visibleRight: 1100,             // px, right edge seen on a 2.2:1 phone (+ margin): nothing may pop in left of it

    // --- Biscuit's body
    pupR: 28,                       // px, hit circle (sprite 120×110, body centre (60,64))
    hitForgive: 2,                  // px, subtracted from pupR vs obstacles (kid-friendly near misses)
    leafForgive: 4,                 // px, added to the leaf pickup distance (pupR + leafR + this)

    // --- flight (soft helicopter hop: rise = flapVy²/2g ≈ 71 px, apex ≈ 0.33 s)
    gravity: 1300,                  // px/s², pulls Biscuit down
    flapVy: -430,                   // px/s, vy is SET (not added) on a tap → every tap feels the same
    maxFall: 560,                   // px/s, terminal fall: readable, never a plummet
    maxRise: 640,                   // px/s, cap on upward speed (steam + flap can't rocket him)
    flapCooldown: 0.05,             // s, swallow double events (touch + click) from one tap

    // --- READY hover
    readyY: 250,                    // px, hover height before the first tap
    readyBobAmp: 8,                 // px, hover bob amplitude
    readyBobHz: 0.8,                // Hz, hover bob frequency (calm breathing)
    readyScroll: 60,                // px/s, background drift while waiting (no obstacles)

    // --- eased tilt (max ±0.45 rad ≈ 26°: kid-friendly, never a nose-dive)
    tiltMax: 0.45,                  // rad, clamp both ways
    tiltUp: -0.36,                  // rad, nose-up pose right after a tap
    tiltHold: 0.14,                 // s, hold the nose-up target this long after a tap
    tiltVyFull: 520,                // px/s, |vy| that maps to full ±tiltMax afterwards
    tiltUpRate: 14,                 // 1/s, fast exponential approach when the nose goes UP
    tiltDownRate: 3.2,              // 1/s, slow approach when it goes DOWN (lazy, floaty)

    // --- propeller (frames = floor(prop*3) % 3; keep 3·rate ≤ 30 so 60 fps never aliases)
    propIdle: 4.5,                  // cycles/s while gliding
    propFast: 9,                    // cycles/s for propFastTime after a tap
    propFastTime: 0.3,              // s
    propEase: 10,                   // 1/s, spin-rate easing
    propStopRate: 2.2,              // 1/s, spin-rate decay when powered down

    // --- squash spring (scaleY = squash, scaleX ≈ 1 + (1 − squash)·0.8)
    squashKick: -5,                 // 1/s, velocity kick on tap → dips to ≈0.88 then overshoots ≈1.02
    squashHz: 3.2,                  // Hz, spring natural frequency
    squashDamp: 0.45,               // damping ratio (<1 = a little wobble)

    // --- bump response
    hurtTime: 1.5,                  // s, safe blink after a bump (collisions ignored)
    bumpVy: 230,                    // px/s, upward bounce when hitting the top of something
    bumpVyDown: 170,                // px/s, downward bounce when hitting the underside of a hanger
    counterBounceVy: -380,          // px/s, counter bounce (rises ≈ 55 px)
    bumpKnock: 420,                 // px/s, backward x-kick of the knock spring (peak ≈ 15 px)
    knockHz: 1.8,                   // Hz, knock spring (pulls Biscuit back to PUP_X)
    knockDamp: 0.9,                 // damping ratio (no overshoot past PUP_X worth seeing)
    hurtWobble: 0.12,               // rad, dizzy wobble amplitude, fades with hurtT
    bumpSwing: 0.7,                 // rad/s, angular kick given to a bumped hanger

    // --- batteries
    batteries: 3, maxBatteries: 3,
    leavesPerBattery: 15,           // every 15th leaf gives a battery back (if not full)

    // --- powered down (parachute float)
    downHopVy: -140,                // px/s, tiny "oh!" hop when the last battery goes
    downGravity: 520,               // px/s², weak: drag of the still propeller
    downMaxFall: 250,               // px/s, parachute terminal speed
    downRest: 0.6,                  // s on the counter (or a stack top) before 'over'
    downScrollDecel: 3,             // 1/s, kitchen slows to a stop
    downSway: 0.18,                 // rad, gentle side-to-side rock while floating

    // --- scrolling and levels
    scrollSpeed: 185,               // px/s, base speed
    zoneSpeedStep: 0.025,           // +2.5 % per zone (morning slowest, night fastest)
    loopSpeedStep: 0.08,            // +8 % per round (day 2, 3 …)
    loopSpeedMaxLoops: 4,           // cap the round bonus (+32 %)
    scrollEase: 1.2,                // 1/s, speed changes ease in
    levelLen: 60,                   // s per level (zone)
    emptyStart: 3,                  // s, no obstacle visible (even on 2.2:1 screens) at the start
    levelBreather: 1.2,             // s, extra space after a level change (room for the banner)

    // --- generation ("beats")
    beatGap: 340,                   // px between consecutive beats (centre to centre)
    beatJitter: [0.92, 1.12],       // × beatGap
    gapMin: 200,                    // px, minimum clearance of every opening (see MECHANICS.md)
    hangLenMax: 70,                 // px, longest chain from the rail to the hook
    gateLenMax: 40,                 // px, chain limit for hangers inside a gate
    gateStackMax: 200,              // px, tallest stack inside a gate
    weights: { hang: 0.32, stack: 0.38, gate: 0.3, kettle: 0.2 }, // kettle only from zone 1
    gateLoopBonus: 0.05,            // gate weight added per round
    leafGroupChance: 0.65,          // chance a beat carries a leaf group
    leafMin: 3, leafMax: 5,         // leaves per group
    leafSpacing: 46,                // px between leaves in a group
    leafClear: 12,                  // px, min clearance from leaf edge to any obstacle shape
    leafSwingPad: 18,               // px, extra clearance around hanger heads (they swing)

    // --- leaves
    leafR: 22,                      // px, hit circle (drawn 44×44)
    leafBobAmp: 6,                  // px
    leafBobHz: 0.55,                // Hz
    leafSpin: [0.4, 0.9],           // rad/s, slow spin (random sign)
    leafWind: 0.5,                  // fraction of wind.gy applied to leaves
    leafDrag: 1.6,                  // 1/s, leaf drift damping (they settle after a gust)
    leafYMin: 70, leafYMax: 430,    // px, leaves never drift out of the flyable band

    // --- hanging utensils (damped pendulum pivoting on the rail)
    hangG: 800,                     // px/s², pendulum gravity (lazy kitchen sway: T ≈ 2.1–2.9 s)
    hangCom: 90,                    // px below the hook of the swinging mass centre
    hangDamp: 0.35,                 // 1/s, angular damping
    hangDrive: 0.075,               // rad/s², tiny resonant draught → steady ±≈0.07 rad sway
    hangAmp0: [0.03, 0.08],         // rad, starting amplitude
    hangMax: 0.25,                  // rad, hard clamp (small amplitude)
    windSwing: 0.6,                 // rad/s², sideways nudge at full gust strength

    // --- kettles and steam
    steamH: [240, 290],             // px, column height above the spout line (COUNTER_Y − 120)
    steamHalfW: 40,                 // px, column half width around kettle.x
    steamLift: 1700,                // px/s², upward accel at the spout (> gravity), fades with height
    steamFadePow: 1,                // lift ∝ (1 − h/H)^pow
    steamDrag: 1.8,                 // 1/s, vy damping inside the column (soft cushion)
    steamPuffEvery: 0.22,           // s, renderer emits a puff each time o.puffs increments

    // --- wind gusts (zone 2 only)
    gustEvery: [6, 9],              // s between gust starts
    firstGust: [4, 6],              // s into zone 2 before the first gust
    gustWarn: 1.0,                  // s of warning (gustWarn event) before the push
    gustLen: 2.5,                   // s, gust duration
    gustEase: 0.5,                  // s, ease in / ease out (smoothstep)
    gustAccel: 200,                 // px/s², vertical push at full strength

    // --- night lamp
    lampRadius: 180,                // px
    lampAhead: 64,                  // px, lamp centre ahead of the nose

    // --- scoring
    leafPoints: 1, passPoints: 1, cleanBonus: 5
  };

  var DIFFICULTY = {
    easy: {   // floaty and forgiving (playtest: a 4-year-old model finishes Sunny Morning 2 % → 71 %)
      scrollSpeed: 140, beatGap: 380, gapMin: 230,
      gravity: 850, flapVy: -350, maxFall: 290, tiltVyFull: 300,   // rise ≈ 72 px, apex 0.41 s, slow parachute fall
      hurtTime: 2.5, counterBounceVy: -520, batteries: 4, maxBatteries: 4, leavesPerBattery: 6,
      lampRadius: 215, gustAccel: 150, hitForgive: 4, leafForgive: 8,
      weights: { hang: 0.36, stack: 0.42, gate: 0.2, kettle: 0.18 },
      leafGroupChance: 0.8, hangDrive: 0.06
    },
    normal: { gapMin: 180, leavesPerBattery: 25 },   // playtest: a casual adult reached day 2 in 94 % of runs → 44 %
    hard: {
      scrollSpeed: 220, beatGap: 300, gapMin: 175,
      gravity: 1350, flapVy: -440, maxFall: 600,    // rise 71.7 px, apex 0.33 s
      lampRadius: 160, gustAccel: 230, hitForgive: 0, leafForgive: 2, leavesPerBattery: 30,
      weights: { hang: 0.28, stack: 0.32, gate: 0.4, kettle: 0.22 },
      leafGroupChance: 0.55
    }
  };

  /* Sprite geometry from DESIGN.md §4 (viewBox units = px). */
  var GEOM = {
    hang: { sprites: ['ladle', 'whisk', 'pan'], hookY: 6, headDist: 144, headR: 42, handleR: 8, chainR: 5, w: 120, h: 200 },
    pieces: { pot: { w: 150, h: 90 }, mug: { w: 110, h: 90 }, jar: { w: 100, h: 120 }, bowl: { w: 150, h: 70 } },
    pieceInsetX: 8, pieceInsetTop: 6,
    kettle: { w: 140, h: 120, inset: 12 },
    leafSprites: ['mint', 'basil', 'bay'],
    // stacks, bottom piece first (wider pieces at the bottom)
    stacks: [['pot'], ['bowl'], ['jar'], ['mug'], ['pot', 'mug'], ['pot', 'jar'], ['bowl', 'mug'], ['bowl', 'jar'],
      ['pot', 'bowl'], ['bowl', 'bowl', 'mug'], ['pot', 'bowl', 'mug'], ['pot', 'mug', 'mug']]
  };

  var ZONES = ['sunny', 'rainy', 'windy', 'snowy'];
  // darkness keys (dayT, darkness): morning 0, rain ≈0.08, sunset 0.25, night 0.62, dawn back to 0
  var DARK = [[0, 0], [0.18, 0], [0.375, 0.08], [0.5, 0.12], [0.625, 0.25], [0.72, 0.45], [0.8, 0.62], [0.96, 0.62], [1, 0]];

  /* ------------------------------------------------------------------ helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(cur, target, rate, h) { return cur + (target - cur) * (1 - Math.exp(-rate * h)); }
  function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) o[k] = over[k];
    return o;
  }
  function darknessAt(dayT) {
    dayT = dayT - Math.floor(dayT);
    for (var i = 1; i < DARK.length; i++) {
      if (dayT <= DARK[i][0]) {
        var a = DARK[i - 1], b = DARK[i];
        return a[1] + (b[1] - a[1]) * smooth01((dayT - a[0]) / (b[0] - a[0]));
      }
    }
    return 0;
  }
  // nearest point helpers write into `out` ({x,y,d}) to avoid allocations in the hot loop
  function nearRect(px, py, rx, ry, rw, rh, out) {
    out.x = clamp(px, rx, rx + rw); out.y = clamp(py, ry, ry + rh);
    out.d = Math.sqrt((px - out.x) * (px - out.x) + (py - out.y) * (py - out.y));
    return out;
  }
  function nearSeg(px, py, x1, y1, x2, y2, out) {
    var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1) : 0;
    out.x = x1 + dx * t; out.y = y1 + dy * t;
    out.d = Math.sqrt((px - out.x) * (px - out.x) + (py - out.y) * (py - out.y));
    return out;
  }
  function pieceRect(o, p) {
    var G = GEOM;
    return { x: o.x + (p.dx || 0) - p.w / 2 + G.pieceInsetX, y: p.y - p.h + G.pieceInsetTop, w: p.w - 2 * G.pieceInsetX, h: p.h - G.pieceInsetTop };
  }

  /* ------------------------------------------------------------------ World */
  function World(opts) {
    opts = opts || {};
    this.opts = opts;
    this.difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.cfg = merge(merge(CONFIG, DIFFICULTY[this.difficulty]), opts.config);
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this._tmp = { x: 0, y: 0, d: 0 };
    this._hit = { o: null, what: '', nx: 0, ny: 0 };
    this.reset();
  }

  World.prototype.reset = function () {
    var c = this.cfg;
    this.rng = new BKF.RNG(this.seed);
    this.events = [];
    this.acc = 0; this.alpha = 0;
    this.phase = 'ready';
    this.readyT = 0;
    this.t = 0;
    this.scroll = 0;
    this.scrollSpeed = c.readyScroll;
    this.level = Math.max(0, (this.opts.level | 0));
    this.levelT = 0;
    this.levelLen = c.levelLen;
    this.batteries = c.batteries;
    this.maxBatteries = c.maxBatteries;
    this.score = 0; this.leafCount = 0; this.passed = 0; this.levelBumps = 0;
    this.obstacles = []; this.leaves = [];
    this.nextId = 1;
    this.cursor = null;            // screen x of the last generated obstacle (moves with the scroll)
    this.lastExit = null;          // {x,y}: safe-path point at the last generated obstacle
    this.beats = 0;
    this.noSpawn = !!this.opts.noSpawn;  // test hook: no generation
    this.run = 0;                  // leaves since the last bump
    this.restT = 0;
    this.sinceFlap = 1e9;
    this.pup = {
      x: c.pupX, y: c.readyY, prevX: c.pupX, prevY: c.readyY, vy: 0, rot: 0, prevRot: 0,
      prop: 0, propRate: c.propIdle, squash: 1, squashV: 0, knock: 0, knockV: 0, hurtT: 0, state: 'fly'
    };
    this.wind = { gy: 0, target: 0, warnT: 0, dir: '', k: 0, gustT: 0, nextT: 0, phase: 'calm' };
    this.stats = { flaps: 0, leaves: 0, bumps: 0, passed: 0, steam: 0, cleanLevels: 0, bestRun: 0 };
    this._levelChanged();
    this._derive();
  };

  Object.defineProperty(World.prototype, 'zone', { get: function () { return this.level % 4; } });
  Object.defineProperty(World.prototype, 'loop', { get: function () { return Math.floor(this.level / 4); } });
  Object.defineProperty(World.prototype, 'zoneName', { get: function () { return ZONES[this.level % 4]; } });

  World.prototype._emit = function (type, data) {
    var e = data || {}; e.type = type; this.events.push(e); return e;
  };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  World.prototype._targetSpeed = function () {
    var c = this.cfg;
    return c.scrollSpeed * (1 + c.zoneSpeedStep * this.zone) * (1 + c.loopSpeedStep * Math.min(this.loop, c.loopSpeedMaxLoops));
  };

  /** Tap. Returns true when it did something. */
  World.prototype.flap = function () {
    var c = this.cfg, p = this.pup;
    if (this.phase === 'ready') {
      this.phase = 'playing';
      this._emit('start', {});
      this._startPlay();
      this.sinceFlap = 1e9;
    }
    if (this.phase !== 'playing') return false;
    if (this.sinceFlap < c.flapCooldown) return false;
    p.vy = c.flapVy;
    p.squashV += c.squashKick;
    this.sinceFlap = 0;
    this.stats.flaps++;
    this._emit('flap', { x: p.x, y: p.y });
    return true;
  };

  World.prototype._startPlay = function () {
    var c = this.cfg;
    // first beat lands so that its left edge reaches visibleRight only after emptyStart seconds
    var firstX = c.visibleRight + 80 + this._targetSpeed() * c.emptyStart;
    this.cursor = firstX - c.beatGap;
    this.lastExit = { o: null, x: c.pupX, y: c.readyY };
    // a friendly intro arc of 3 leaves at hover height (just right of the widest screen)
    for (var i = 0; i < 3; i++) this.addLeaf(c.visibleRight + 50 + i * c.leafSpacing, c.readyY - 18 - (i === 1 ? 10 : 0));
  };

  /** Debug / URL ?level=N: jump to a level (keeps the run, clears wind). */
  World.prototype.gotoLevel = function (i) {
    this.level = Math.max(0, i | 0);
    this.levelT = 0;
    this.levelBumps = 0;
    this._levelChanged();
    this._emit('levelUp', { level: this.level, zone: this.zone, clean: false, skip: true });
    this._derive();
  };

  World.prototype._levelChanged = function () {
    var c = this.cfg, wd = this.wind;
    if (this.zone === 2) {
      wd.nextT = this.rng.range(c.firstGust[0], c.firstGust[1]);
    } else {
      wd.nextT = 1e9;  // an active gust finishes; no new ones
    }
  };

  /* --------------------------------------------------------------- update */
  World.prototype.update = function (dt) {
    var c = this.cfg;
    dt = clamp(+dt || 0, 0, c.maxFrame);
    this.acc += dt;
    var n = 0;
    while (this.acc >= c.step - 1e-9 && n < 64) { this._step(c.step); this.acc -= c.step; n++; }
    if (this.acc < 0) this.acc = 0;
    this.alpha = clamp(this.acc / c.step, 0, 0.999999);
  };

  World.prototype._step = function (h) {
    var c = this.cfg, p = this.pup, i, o;
    // remember previous positions for interpolation
    p.prevX = p.x; p.prevY = p.y; p.prevRot = p.rot;
    for (i = 0; i < this.obstacles.length; i++) { o = this.obstacles[i]; o.prevX = o.x; if (o.kind === 'hang') o.prevAng = o.ang; }
    for (i = 0; i < this.leaves.length; i++) { o = this.leaves[i]; o.prevX = o.x; o.prevY = o.y; o.prevRot = o.rot; }

    if (this.phase === 'ready') this._stepReady(h);
    else if (this.phase === 'playing') this._stepPlaying(h);
    else if (this.phase === 'down') this._stepDown(h);
    else this._stepOver(h);
    this._derive();
  };

  World.prototype._stepReady = function (h) {
    var c = this.cfg, p = this.pup;
    this.readyT += h;
    var w = TAU * c.readyBobHz;
    p.y = c.readyY + Math.sin(w * this.readyT) * c.readyBobAmp;
    p.vy = Math.cos(w * this.readyT) * c.readyBobAmp * w;
    p.rot = approach(p.rot, Math.sin(w * this.readyT + 0.6) * 0.05, 8, h);
    this.scrollSpeed = c.readyScroll;
    this.scroll += c.readyScroll * h;
    this._propeller(h, false);
    this._springs(h);
    this._moveLeaves(h, 0);
  };

  World.prototype._stepPlaying = function (h) {
    var c = this.cfg, p = this.pup, i, o;
    this.t += h;
    this.sinceFlap += h;

    // level clock
    this.levelT += h;
    if (this.levelT >= this.levelLen) this._levelUp();

    // scroll
    this.scrollSpeed = approach(this.scrollSpeed, this._targetSpeed(), c.scrollEase, h);
    var ds = this.scrollSpeed * h;
    this.scroll += ds;

    this._wind(h);
    this._moveObstacles(h, ds);
    this._moveLeaves(h, ds);
    if (this.cursor !== null) this.cursor -= ds;
    if (!this.noSpawn) this._spawn();

    // Biscuit: gravity + wind + steam
    var a = c.gravity + this.wind.gy;
    var st = this.steamAt(p.x, p.y);
    if (st.inside) {
      a += st.acc;
      p.vy *= Math.exp(-c.steamDrag * h);
      if (!st.o.steamIn) { st.o.steamIn = true; this.stats.steam++; this._emit('steam', { x: st.o.x }); }
    }
    for (i = 0; i < this.obstacles.length; i++) { o = this.obstacles[i]; if (o.kind === 'kettle' && o !== st.o) o.steamIn = false; }
    p.vy += a * h;
    p.vy = clamp(p.vy, -c.maxRise, c.maxFall);
    p.y += p.vy * h;

    // ceiling: clamp only
    if (p.y - c.pupR < c.ceilingY) { p.y = c.ceilingY + c.pupR; if (p.vy < 0) p.vy = 0; }

    // hurt timer (stays on while still overlapping something, so leaving a blink never costs twice)
    if (p.hurtT > 0) {
      p.hurtT -= h;
      if (p.hurtT <= 0) p.hurtT = this._collide(p.x, p.y, c.pupR - c.hitForgive) ? 0.02 : 0;
    }

    // obstacles
    if (p.hurtT <= 0 && this._collide(p.x, p.y, c.pupR - c.hitForgive)) this._bump(this._hit);

    // counter
    if (this.phase === 'playing' && p.y + c.pupR > c.counterY) {
      p.y = c.counterY - c.pupR;
      p.vy = c.counterBounceVy;
      var cost = p.hurtT <= 0;
      this._emit('counter', { x: p.x, y: c.counterY, cost: cost });
      if (cost) this._loseBattery(null, 'counter', 0, -1);
    }

    p.state = this.phase === 'down' ? 'sleep' : p.hurtT > 0 ? 'hurt' : 'fly';
    this._tilt(h);
    this._propeller(h, false);
    this._springs(h);

    if (this.phase === 'playing') {
      this._pickLeaves();
      this._passes();
    }
    this._despawn();
  };

  World.prototype._stepDown = function (h) {
    var c = this.cfg, p = this.pup;
    this.t += h;
    this.sinceFlap += h;
    this.scrollSpeed = approach(this.scrollSpeed, 0, c.downScrollDecel, h);
    if (this.scrollSpeed < 0.5) this.scrollSpeed = 0;
    var ds = this.scrollSpeed * h;
    this.scroll += ds;
    this._wind(h);
    this._moveObstacles(h, ds);
    this._moveLeaves(h, ds);

    p.hurtT = Math.max(0, p.hurtT - h);
    p.vy = Math.min(p.vy + c.downGravity * h, c.downMaxFall);
    p.y += p.vy * h;
    if (p.y - c.pupR < c.ceilingY) { p.y = c.ceilingY + c.pupR; if (p.vy < 0) p.vy = 0; }
    var floor = this._floorUnder(p.x, p.prevY + c.pupR);
    if (p.y + c.pupR >= floor) {
      p.y = floor - c.pupR; p.vy = 0;
      this.restT += h;
      if (this.restT >= c.downRest) {
        this.phase = 'over';
        this._emit('gameOver', { score: this.score });
      }
    }
    p.state = 'sleep';
    p.rot = approach(p.rot, Math.sin(this.t * 2.4) * c.downSway * (p.vy > 1 ? 1 : 0.3), 4, h);
    this._propeller(h, true);
    this._springs(h);
    this._despawn();
  };

  World.prototype._stepOver = function (h) {
    this.scrollSpeed = 0;
    this._moveObstacles(h, 0);
    this._moveLeaves(h, 0);
    this._propeller(h, true);
    this._springs(h);
    this.pup.rot = approach(this.pup.rot, 0, 3, h);
  };

  /** Top of whatever Biscuit can land on below x, ignoring anything whose top is above `fromY`. */
  World.prototype._floorUnder = function (x, fromY) {
    var c = this.cfg, best = c.counterY, i, j, o;
    for (i = 0; i < this.obstacles.length; i++) {
      o = this.obstacles[i];
      if (o.kind === 'stack') {
        for (j = 0; j < o.pieces.length; j++) {
          var r = pieceRect(o, o.pieces[j]);
          if (x > r.x && x < r.x + r.w && r.y >= fromY - 1 && r.y < best) best = r.y;
        }
      } else if (o.kind === 'kettle') {
        var top = c.counterY - GEOM.kettle.h + GEOM.kettle.inset, hw = GEOM.kettle.w / 2 - GEOM.kettle.inset;
        if (Math.abs(x - o.x) < hw && top >= fromY - 1 && top < best) best = top;
      }
    }
    return best;
  };

  /* ------------------------------------------------------------ pup motion */
  World.prototype._tilt = function (h) {
    var c = this.cfg, p = this.pup;
    var target = this.sinceFlap < c.tiltHold ? c.tiltUp : clamp(p.vy / c.tiltVyFull, -1, 1) * c.tiltMax;
    if (p.hurtT > 0) target += Math.sin(p.hurtT * 18) * c.hurtWobble * clamp(p.hurtT / c.hurtTime, 0, 1);
    p.rot = approach(p.rot, target, target < p.rot ? c.tiltUpRate : c.tiltDownRate, h);
    p.rot = clamp(p.rot, -c.tiltMax, c.tiltMax);
  };

  World.prototype._propeller = function (h, stopped) {
    var c = this.cfg, p = this.pup;
    if (stopped) p.propRate = approach(p.propRate, 0, c.propStopRate, h);
    else p.propRate = approach(p.propRate, this.sinceFlap < c.propFastTime ? c.propFast : c.propIdle, c.propEase, h);
    if (stopped && p.propRate < 0.05) p.propRate = 0;
    p.prop += p.propRate * h;
    if (p.prop > 1e6) p.prop -= 1e6;
  };

  World.prototype._springs = function (h) {
    var c = this.cfg, p = this.pup;
    var w = TAU * c.squashHz;
    p.squashV += (-w * w * (p.squash - 1) - 2 * c.squashDamp * w * p.squashV) * h;
    p.squash += p.squashV * h;
    var k = TAU * c.knockHz;
    p.knockV += (-k * k * p.knock - 2 * c.knockDamp * k * p.knockV) * h;
    p.knock += p.knockV * h;
    p.x = c.pupX + p.knock;
  };

  /* ---------------------------------------------------------------- wind */
  World.prototype._wind = function (h) {
    var c = this.cfg, wd = this.wind;
    if (wd.phase === 'calm') {
      wd.nextT -= h;
      if (wd.nextT <= c.gustWarn && this.zone === 2 && this.phase === 'playing' &&
          this.levelT + wd.nextT + c.gustLen < this.levelLen) {
        wd.phase = 'warn';
        wd.dir = this.rng.chance(0.5) ? 'up' : 'down';
        wd.warnT = Math.max(0, wd.nextT);
        this._emit('gustWarn', { dir: wd.dir });
      } else if (wd.nextT <= c.gustWarn && this.zone === 2) {
        wd.nextT = 1e9;   // too close to the level end: skip
      }
    } else if (wd.phase === 'warn') {
      wd.warnT -= h;
      if (wd.warnT <= 0) {
        wd.warnT = 0;
        wd.phase = 'gust'; wd.gustT = 0;
        wd.target = (wd.dir === 'up' ? -1 : 1) * c.gustAccel;
        this._emit('gust', { dir: wd.dir });
      }
    } else if (wd.phase === 'gust') {
      wd.gustT += h;
      wd.k = Math.min(smooth01(wd.gustT / c.gustEase), smooth01((c.gustLen - wd.gustT) / c.gustEase));
      if (wd.gustT >= c.gustLen) {
        wd.phase = 'calm'; wd.k = 0; wd.target = 0; wd.dir = '';
        wd.nextT = this.zone === 2 ? this.rng.range(c.gustEvery[0], c.gustEvery[1]) - c.gustLen : 1e9;
        this._emit('gustEnd', {});
      }
    }
    wd.gy = wd.target * wd.k;
  };

  /* ------------------------------------------------------------ obstacles */
  World.prototype._moveObstacles = function (h, ds) {
    var c = this.cfg, wd = this.wind, i, o;
    for (i = 0; i < this.obstacles.length; i++) {
      o = this.obstacles[i];
      o.x -= ds;
      if (o.kind === 'hang') {
        var L = o.len + c.hangCom, w2 = c.hangG / L;
        o.swingT += h;
        var acc = -w2 * Math.sin(o.ang) - c.hangDamp * o.angVel +
          c.hangDrive * Math.sin(o.omega * o.swingT + o.drivePh) -
          c.windSwing * wd.k * (wd.target !== 0 ? 1 : 0);
        o.angVel += acc * h;
        o.ang += o.angVel * h;
        if (o.ang > c.hangMax) { o.ang = c.hangMax; if (o.angVel > 0) o.angVel *= -0.3; }
        if (o.ang < -c.hangMax) { o.ang = -c.hangMax; if (o.angVel < 0) o.angVel *= -0.3; }
      } else if (o.kind === 'kettle') {
        o.puffT -= h;
        if (o.puffT <= 0) { o.puffT += c.steamPuffEvery; o.puffs++; }
      }
    }
  };

  World.prototype._moveLeaves = function (h, ds) {
    var c = this.cfg, wd = this.wind, i, l;
    for (i = 0; i < this.leaves.length; i++) {
      l = this.leaves[i];
      l.x -= ds;
      l.phase += TAU * c.leafBobHz * h;
      l.rot += l.spin * h;
      l.vy += c.leafWind * wd.gy * h;
      l.vy *= Math.exp(-c.leafDrag * h);
      l.baseY = clamp(l.baseY + l.vy * h, c.leafYMin, c.leafYMax);
      l.y = l.baseY + Math.sin(l.phase) * c.leafBobAmp;
    }
  };

  World.prototype._despawn = function () {
    var c = this.cfg, i;
    for (i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].x + this.obstacles[i].halfW < c.despawnX) this.obstacles.splice(i, 1);
    for (i = this.leaves.length - 1; i >= 0; i--) if (this.leaves[i].x < c.despawnX) this.leaves.splice(i, 1);
  };

  /** Head centre of a hanger (pendulum pivot = (o.x, RAIL_Y)). */
  World.prototype.hangHead = function (o) {
    var c = this.cfg, R = o.len + GEOM.hang.headDist;
    return { x: o.x + Math.sin(o.ang) * R, y: c.railY + Math.cos(o.ang) * R };
  };
  /** Hook (sprite attach point) of a hanger: the renderer rotates the sprite by o.ang around it. */
  World.prototype.hangHook = function (o) {
    var c = this.cfg;
    return { x: o.x + Math.sin(o.ang) * o.len, y: c.railY + Math.cos(o.ang) * o.len };
  };

  /** Steam acceleration at a point. Returns a shared object {inside, acc, o}. */
  World.prototype.steamAt = function (px, py) {
    var c = this.cfg, out = this._steam || (this._steam = { inside: false, acc: 0, o: null });
    out.inside = false; out.acc = 0; out.o = null;
    var base = c.counterY - GEOM.kettle.h;
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (o.kind !== 'kettle') continue;
      if (Math.abs(px - o.x) > c.steamHalfW + c.pupR * 0.5) continue;
      var hgt = base - py;
      if (hgt < -c.pupR || hgt > o.steamH) continue;
      var f = 1 - clamp(hgt, 0, o.steamH) / o.steamH;
      out.inside = true; out.acc += -c.steamLift * Math.pow(f, c.steamFadePow); out.o = o;
    }
    return out;
  };

  /** Circle (px,py,r) vs every obstacle. Fills this._hit and returns true on contact. */
  World.prototype._collide = function (px, py, r) {
    var c = this.cfg, G = GEOM, q = this._tmp, H = this._hit, i, j, o;
    for (i = 0; i < this.obstacles.length; i++) {
      o = this.obstacles[i];
      if (Math.abs(o.x - px) > o.halfW + r + 60) continue;
      if (o.kind === 'hang') {
        var s = Math.sin(o.ang), co = Math.cos(o.ang), R = o.len + G.hang.headDist;
        var ax = o.x + s * o.len, ay = c.railY + co * o.len, hx = o.x + s * R, hy = c.railY + co * R;
        var dx = px - hx, dy = py - hy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < r + G.hang.headR) return this._setHit(o, 'head', dx, dy, d);
        nearSeg(px, py, ax, ay, hx, hy, q);
        if (q.d < r + G.hang.handleR) return this._setHit(o, 'handle', px - q.x, py - q.y, q.d);
        if (o.len > 0) {
          nearSeg(px, py, o.x, c.railY, ax, ay, q);
          if (q.d < r + G.hang.chainR) return this._setHit(o, 'chain', px - q.x, py - q.y, q.d);
        }
      } else if (o.kind === 'stack') {
        for (j = 0; j < o.pieces.length; j++) {
          var pc = o.pieces[j];
          nearRect(px, py, o.x + (pc.dx || 0) - pc.w / 2 + G.pieceInsetX, pc.y - pc.h + G.pieceInsetTop, pc.w - 2 * G.pieceInsetX, pc.h - G.pieceInsetTop, q);
          if (q.d < r) return this._setHit(o, pc.sprite, px - q.x, py - q.y, q.d, j);
        }
      } else if (o.kind === 'kettle') {
        var K = G.kettle;
        nearRect(px, py, o.x - K.w / 2 + K.inset, c.counterY - K.h + K.inset, K.w - 2 * K.inset, K.h - K.inset, q);
        if (q.d < r) return this._setHit(o, 'kettle', px - q.x, py - q.y, q.d);
      }
    }
    return false;
  };
  World.prototype._setHit = function (o, part, nx, ny, d, piece) {
    var H = this._hit;
    if (d > 1e-6) { H.nx = nx / d; H.ny = ny / d; } else { H.nx = -1; H.ny = 0; }
    H.o = o; H.part = part; H.piece = piece === undefined ? -1 : piece;
    H.what = o.kind === 'hang' ? o.sprite : o.kind === 'kettle' ? 'kettle' : o.pieces[piece].sprite;
    return true;
  };

  World.prototype._bump = function (hit) {
    var c = this.cfg, p = this.pup, o = hit.o;
    var dirY = Math.abs(hit.ny) < 0.3 ? (o.kind === 'hang' ? 1 : -1) : (hit.ny < 0 ? -1 : 1);
    p.vy = dirY < 0 ? -c.bumpVy : c.bumpVyDown;
    p.knockV -= c.bumpKnock * (0.4 + 0.6 * Math.max(0, -hit.nx));
    if (o.kind === 'hang') {
      var hd = this.hangHead(o);
      o.angVel += c.bumpSwing * (hd.x >= p.x ? 1 : -1);
    }
    this._emit('bump', { x: p.x, y: p.y, what: hit.what, kind: o.kind, part: hit.part, id: o.id });
    this._loseBattery(o, hit.what);
  };

  World.prototype._loseBattery = function () {
    var c = this.cfg, p = this.pup;
    this.batteries = Math.max(0, this.batteries - 1);
    this.levelBumps++; this.stats.bumps++;
    this.run = 0;
    p.hurtT = c.hurtTime;
    p.state = 'hurt';
    p.squashV += c.squashKick * 0.8;
    if (this.batteries === 1) this._emit('lowBattery', {});
    if (this.batteries === 0) this._goDown();
  };

  World.prototype._goDown = function () {
    var c = this.cfg, p = this.pup;
    this.phase = 'down';
    this.restT = 0;
    p.state = 'sleep';
    p.vy = Math.min(p.vy, 0) * 0.3 + c.downHopVy;
    this.wind.target = 0; this.wind.k = 0; this.wind.gy = 0;
    if (this.wind.phase !== 'calm') { this.wind.phase = 'calm'; this.wind.dir = ''; this._emit('gustEnd', {}); }
    this.wind.nextT = 1e9;
    this._emit('down', {});
  };

  World.prototype._pickLeaves = function () {
    var c = this.cfg, p = this.pup, R = c.pupR + c.leafR + c.leafForgive;
    for (var i = this.leaves.length - 1; i >= 0; i--) {
      var l = this.leaves[i], dx = l.x - p.x, dy = l.y - p.y;
      if (dx * dx + dy * dy > R * R) continue;
      this.leaves.splice(i, 1);
      this.leafCount++; this.stats.leaves++;
      this.score += c.leafPoints;
      this.run++; if (this.run > this.stats.bestRun) this.stats.bestRun = this.run;
      this._emit('leaf', { x: l.x, y: l.y, sprite: l.sprite, score: this.score });
      if (this.leafCount % c.leavesPerBattery === 0 && this.batteries < this.maxBatteries) {
        this.batteries++;
        this._emit('battery', { n: this.batteries });
      }
    }
  };

  World.prototype._passes = function () {
    var c = this.cfg, p = this.pup;
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (o.passed || o.x + o.halfW >= p.x - c.pupR) continue;
      o.passed = true;
      this.passed++; this.stats.passed++;
      this.score += c.passPoints;
      this._emit('pass', { x: o.x, id: o.id, kind: o.kind });
    }
  };

  World.prototype._levelUp = function () {
    var c = this.cfg;
    var clean = this.levelBumps === 0;
    if (clean) { this.score += c.cleanBonus; this.stats.cleanLevels++; }
    this.level++;
    this.levelT = 0;
    this.levelBumps = 0;
    this._levelChanged();
    if (this.cursor !== null) this.cursor += this._targetSpeed() * c.levelBreather;
    this._emit('levelUp', { level: this.level, zone: this.zone, clean: clean, score: this.score });
  };

  /* ----------------------------------------------------------- derived */
  World.prototype._derive = function () {
    var c = this.cfg, p = this.pup;
    this.dayT = (this.zone + clamp(this.levelT / this.levelLen, 0, 0.999999)) / 4;
    this.darkness = darknessAt(this.dayT);
    var L = this.lamp || (this.lamp = { x: 0, y: 0, r: 0 });
    L.x = p.x + Math.cos(p.rot) * c.lampAhead;
    L.y = p.y + Math.sin(p.rot) * c.lampAhead;
    L.r = c.lampRadius;
  };

  /* --------------------------------------------------------- generation */
  /** Test/debug hook: add an obstacle. kind 'hang' {x, sprite, len, ang}, 'stack' {x, pieces:[names] | pieces objs}, 'kettle' {x, steamH} */
  World.prototype.spawn = function (kind, o) {
    var c = this.cfg, G = GEOM, ob, i;
    o = o || {};
    var x = o.x === undefined ? c.spawnX : o.x;
    if (kind === 'hang') {
      var L = (o.len || 0) + c.hangCom, omega = Math.sqrt(c.hangG / L);
      var amp = o.amp !== undefined ? o.amp : this.rng.range(c.hangAmp0[0], c.hangAmp0[1]);
      var ph = o.amp !== undefined ? 0 : this.rng.range(0, TAU);
      ob = { id: this.nextId++, kind: 'hang', x: x, prevX: x, passed: false, sprite: o.sprite || 'ladle', len: o.len || 0,
        ang: o.ang !== undefined ? o.ang : amp * Math.sin(ph), angVel: o.ang !== undefined ? 0 : amp * omega * Math.cos(ph),
        omega: omega, swingT: 0, drivePh: ph, halfW: G.hang.headR + 8 };
      if (o.still) { ob.ang = 0; ob.angVel = 0; ob.still = true; }
      ob.prevAng = ob.ang;
    } else if (kind === 'stack') {
      var names = o.pieces || ['pot'], y = c.counterY, pieces = [], hw = 0;
      for (i = 0; i < names.length; i++) {
        var nm = typeof names[i] === 'string' ? names[i] : names[i].sprite;
        var g = G.pieces[nm], dx = typeof names[i] === 'object' && names[i].dx !== undefined ? names[i].dx : (i > 0 && o.dx !== false ? Math.round(this.rng.range(-6, 6)) : 0);
        pieces.push({ sprite: nm, w: g.w, h: g.h, y: y, dx: dx });
        hw = Math.max(hw, g.w / 2 + Math.abs(dx));
        y -= g.h;
      }
      ob = { id: this.nextId++, kind: 'stack', x: x, prevX: x, passed: false, pieces: pieces, height: c.counterY - y, top: y, halfW: hw };
    } else {
      var sh = o.steamH !== undefined ? o.steamH : Math.round(this.rng.range(c.steamH[0], c.steamH[1]));
      ob = { id: this.nextId++, kind: 'kettle', x: x, prevX: x, passed: false, steamH: sh, puffT: this.rng.range(0, c.steamPuffEvery),
        puffs: 0, steamIn: false, halfW: G.kettle.w / 2 };
    }
    this.obstacles.push(ob);
    return ob;
  };

  World.prototype.addLeaf = function (x, y, sprite) {
    var c = this.cfg;
    var l = { id: this.nextId++, sprite: sprite || this.rng.pick(GEOM.leafSprites), x: x, y: y, prevX: x, prevY: y,
      baseY: y, vy: 0, phase: this.rng.range(0, TAU), rot: this.rng.range(-0.5, 0.5), prevRot: 0,
      spin: this.rng.sign() * this.rng.range(c.leafSpin[0], c.leafSpin[1]) };
    l.y = l.baseY + Math.sin(l.phase) * c.leafBobAmp; l.prevY = l.y; l.prevRot = l.rot;
    this.leaves.push(l);
    return l;
  };

  World.prototype._spawn = function () {
    var c = this.cfg;
    var guard = 0;
    while (this.cursor !== null && this.cursor <= c.spawnX && guard++ < 4) {
      var gap = this.beats === 0 ? c.beatGap : c.beatGap * this.rng.range(c.beatJitter[0], c.beatJitter[1]);
      this._makeBeat(this.cursor + gap);
    }
  };

  /** Safe pup-centre band [lo, hi] for passing an obstacle. */
  World.prototype._band = function (o) {
    var c = this.cfg, pad = 8;
    if (o.kind === 'hang') return { lo: c.railY + o.len + GEOM.hang.headDist + GEOM.hang.headR + c.pupR + pad, hi: c.counterY - c.pupR - pad };
    if (o.kind === 'stack') return { lo: c.ceilingY + c.pupR + pad, hi: o.top + GEOM.pieceInsetTop - c.pupR - pad };
    return { lo: c.ceilingY + c.pupR + pad, hi: c.counterY - GEOM.kettle.h + GEOM.kettle.inset - c.pupR - pad };
  };

  World.prototype._pickType = function () {
    var c = this.cfg, W = c.weights, z = this.zone;
    if (this.beats === 0) return 'stack';
    var wg = W.gate + c.gateLoopBonus * Math.min(this.loop, 4);
    var wk = z >= 1 ? W.kettle : 0;
    var sum = W.hang + W.stack + wg + wk, r = this.rng.next() * sum;
    if ((r -= W.hang) < 0) return 'hang';
    if ((r -= W.stack) < 0) return 'stack';
    if ((r -= wg) < 0) return 'gate';
    return 'kettle';
  };

  World.prototype._stackRecipes = function (maxH) {
    var out = [];
    for (var i = 0; i < GEOM.stacks.length; i++) {
      var s = GEOM.stacks[i], H = 0;
      for (var j = 0; j < s.length; j++) H += GEOM.pieces[s[j]].h;
      if (H <= maxH) out.push(s);
    }
    return out;
  };

  /** Clearance between a hanger head (straight down) and the pieces of a stack centred at sx. */
  World.prototype._gateClear = function (hang, stack, sx) {
    var c = this.cfg, q = this._tmp, best = 1e9;
    var hx = hang.x, hy = c.railY + hang.len + GEOM.hang.headDist;
    for (var j = 0; j < stack.pieces.length; j++) {
      var pc = stack.pieces[j];
      nearRect(hx, hy, sx + pc.dx - pc.w / 2 + GEOM.pieceInsetX, pc.y - pc.h + GEOM.pieceInsetTop, pc.w - 2 * GEOM.pieceInsetX, pc.h - GEOM.pieceInsetTop, q);
      best = Math.min(best, q.d - GEOM.hang.headR - c.leafSwingPad * 0.5);
    }
    return best;
  };

  World.prototype._makeBeat = function (x) {
    var c = this.cfg, rng = this.rng, G = GEOM, type = this._pickType(), first, last, a, b;
    var lenMaxLone = Math.max(0, Math.min(c.hangLenMax, c.counterY - (c.railY + G.hang.headDist + G.hang.headR) - c.gapMin));
    var stackMaxLone = (c.counterY - c.ceilingY) - c.gapMin;

    if (type === 'hang') {
      first = last = this.spawn('hang', { x: x, sprite: rng.pick(G.hang.sprites), len: Math.round(rng.range(0, lenMaxLone)) });
    } else if (type === 'stack') {
      var rec = this._stackRecipes(this.beats === 0 ? 90 : stackMaxLone);
      first = last = this.spawn('stack', { x: x, pieces: rng.pick(rec) });
    } else if (type === 'kettle') {
      first = last = this.spawn('kettle', { x: x });
    } else {
      // gate: a hanger and a stack, offset in x so the diagonal opening between them is ≥ gapMin
      var hangFirst = rng.chance(0.5);
      var len = Math.round(rng.range(0, Math.min(c.gateLenMax, lenMaxLone)));
      var recs = this._stackRecipes(Math.min(c.gateStackMax, stackMaxLone));
      var hang = this.spawn('hang', { x: x, sprite: rng.pick(G.hang.sprites), len: len });
      var stack = this.spawn('stack', { x: x, pieces: rng.pick(recs) });
      var d = 40;
      while (this._gateClear(hang, stack, x + d) < c.gapMin && d < 600) d += 4;
      d += Math.round(rng.range(0, 30));
      if (hangFirst) { stack.x = stack.prevX = x + d; first = hang; last = stack; }
      else { hang.x = hang.prevX = x + d; first = stack; last = hang; }
      stack.gate = hang.gate = true;
    }
    this.beats++;
    this.cursor = last.x;

    // leaves on the safe path
    var bf = this._band(first), bl = this._band(last);
    var entry = { x: first.x, y: this._pathY(first, bf) }, exit = { o: last, x: last.x, y: this._pathY(last, bl) };
    if (this.beats > 1 && rng.chance(c.leafGroupChance)) {
      var n = rng.int(c.leafMin, c.leafMax), sp = c.leafSpacing, k;
      var mode = first !== last ? 'gate' : (this.lastExit && rng.chance(0.4) ? 'connect' : 'at');
      if (mode === 'gate') {
        // a line along the diagonal between the two gate pieces
        for (k = 0; k < n; k++) {
          var tt = (k + 1) / (n + 1);
          this._tryLeaf(first.x + (last.x - first.x) * tt, entry.y + (exit.y - entry.y) * tt);
        }
      } else if (mode === 'connect') {
        // a line from the last obstacle's safe point to this one, in the open space between them
        var P = this.lastExit, px0 = P.o ? P.o.x : c.pupX, span = entry.x - px0;
        for (k = 0; k < n; k++) {
          var u = 0.5 + (k - (n - 1) / 2) * sp / Math.max(span, 1);
          if (u <= 0.15 || u >= 0.85) continue;
          this._tryLeaf(px0 + span * u, P.y + (entry.y - P.y) * smooth01(u));
        }
      } else {
        // an arc through the opening: dips under hangers, hops over stacks and kettles
        var sign = first.kind === 'hang' ? 1 : -1;
        for (k = 0; k < n; k++) {
          var v = (k - (n - 1) / 2) / Math.max(1, (n - 1) / 2);   // −1..1
          var ly = entry.y + sign * 22 * (1 - v * v);
          this._tryLeaf(first.x + v * (n - 1) / 2 * sp, clamp(ly, bf.lo, bf.hi));
        }
      }
    }
    this.lastExit = exit;
  };

  /** Comfortable pup-centre y for passing an obstacle (inside its band). */
  World.prototype._pathY = function (o, b) {
    if (o.kind === 'hang') return Math.min(b.lo + 34, (b.lo + b.hi) / 2);
    if (o.kind === 'stack') return Math.max(b.hi - 40, b.lo + 20);
    return clamp(b.hi - 70, b.lo + 20, b.hi);         // kettle: ride the steam above it
  };

  /** Place a leaf only if it clears every obstacle shape and stays in the flyable band. */
  World.prototype._tryLeaf = function (x, y) {
    var c = this.cfg;
    if (y < c.leafYMin || y > c.leafYMax) return null;
    if (x < c.visibleRight + c.leafR) return null;   // never pop in on screen
    if (!this._leafFree(x, y)) return null;
    for (var i = 0; i < this.leaves.length; i++) {
      var l = this.leaves[i];
      if (Math.abs(l.x - x) < c.leafR * 1.6 && Math.abs(l.baseY - y) < c.leafR * 1.6) return null;
    }
    return this.addLeaf(x, y);
  };
  World.prototype._leafFree = function (x, y) {
    var c = this.cfg, G = GEOM, q = this._tmp, r = c.leafR + c.leafClear + c.leafBobAmp;
    for (var i = 0; i < this.obstacles.length; i++) {
      var o = this.obstacles[i];
      if (Math.abs(o.x - x) > o.halfW + r + 60) continue;
      if (o.kind === 'hang') {
        var R = o.len + G.hang.headDist;
        if (Math.hypot(x - o.x, y - (c.railY + R)) < r + G.hang.headR + c.leafSwingPad) return false;
        if (Math.abs(x - o.x) < r + G.hang.handleR + c.leafSwingPad * 0.6 && y < c.railY + R) return false;
      } else if (o.kind === 'stack') {
        for (var j = 0; j < o.pieces.length; j++) {
          var pc = o.pieces[j];
          nearRect(x, y, o.x + pc.dx - pc.w / 2 + G.pieceInsetX, pc.y - pc.h + G.pieceInsetTop, pc.w - 2 * G.pieceInsetX, pc.h - G.pieceInsetTop, q);
          if (q.d < r) return false;
        }
      } else {
        var K = G.kettle;
        nearRect(x, y, o.x - K.w / 2 + K.inset, c.counterY - K.h + K.inset, K.w - 2 * K.inset, K.h - K.inset, q);
        if (q.d < r) return false;
      }
    }
    return true;
  };

  /* ------------------------------------------------------------- debug */
  World.prototype.hitShapes = function () {
    var c = this.cfg, G = GEOM, out = [], i, j, o;
    var p = this.pup;
    out.push({ kind: 'circle', x: p.x, y: p.y, r: c.pupR - c.hitForgive, tag: 'pup' });
    for (i = 0; i < this.obstacles.length; i++) {
      o = this.obstacles[i];
      if (o.kind === 'hang') {
        var hk = this.hangHook(o), hd = this.hangHead(o);
        if (o.len > 0) out.push({ kind: 'seg', x1: o.x, y1: c.railY, x2: hk.x, y2: hk.y, r: G.hang.chainR, tag: 'chain', id: o.id });
        out.push({ kind: 'seg', x1: hk.x, y1: hk.y, x2: hd.x, y2: hd.y, r: G.hang.handleR, tag: 'handle', id: o.id });
        out.push({ kind: 'circle', x: hd.x, y: hd.y, r: G.hang.headR, tag: 'head', id: o.id });
      } else if (o.kind === 'stack') {
        for (j = 0; j < o.pieces.length; j++) { var r = pieceRect(o, o.pieces[j]); r.kind = 'rect'; r.tag = 'stack'; r.id = o.id; out.push(r); }
      } else {
        var K = G.kettle;
        out.push({ kind: 'rect', x: o.x - K.w / 2 + K.inset, y: c.counterY - K.h + K.inset, w: K.w - 2 * K.inset, h: K.h - K.inset, tag: 'kettle', id: o.id });
        out.push({ kind: 'rect', x: o.x - c.steamHalfW, y: c.counterY - K.h - o.steamH, w: c.steamHalfW * 2, h: o.steamH, tag: 'steam', id: o.id });
      }
    }
    for (i = 0; i < this.leaves.length; i++) out.push({ kind: 'circle', x: this.leaves[i].x, y: this.leaves[i].y, r: c.leafR, tag: 'leaf' });
    return out;
  };

  World.prototype.getState = function () {
    return JSON.parse(JSON.stringify({
      phase: this.phase, difficulty: this.difficulty, seed: this.seed, alpha: this.alpha,
      t: this.t, scroll: this.scroll, scrollSpeed: this.scrollSpeed,
      level: this.level, zone: this.zone, loop: this.loop, zoneName: this.zoneName, levelT: this.levelT, levelLen: this.levelLen,
      dayT: this.dayT, darkness: this.darkness, lamp: this.lamp,
      pup: this.pup, batteries: this.batteries, maxBatteries: this.maxBatteries,
      score: this.score, leafCount: this.leafCount, passed: this.passed, levelBumps: this.levelBumps,
      wind: this.wind, obstacles: this.obstacles, leaves: this.leaves, stats: this.stats
    }));
  };

  World.CONFIG = CONFIG;
  World.DIFFICULTY = DIFFICULTY;
  World.GEOM = GEOM;
  World.ZONES = ZONES;
  World.darknessAt = darknessAt;
  BKF.CONFIG = CONFIG;
  BKF.DIFFICULTY = DIFFICULTY;
  BKF.GEOM = GEOM;
  BKF.World = World;
})(window.BKF = window.BKF || {});
