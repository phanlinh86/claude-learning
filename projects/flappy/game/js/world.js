/* Family Flappy — FF.CONFIG + FF.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 canvas), seconds, radians. y grows DOWN.
 *
 *  SCREEN-SPACE x. Every entity's `x` is its on-screen x. The bird never moves
 *  horizontally (bird.x === CONFIG.birdX ≈ 260). "The world" scrolls LEFT at
 *  w.scrollSpeed px/s, so anything resting on / attached to the ground moves
 *  left by scrollSpeed*dt each step, plus its own motion.
 *    - turtle screen velocity  = dir*speed - scrollSpeed
 *    - drop screen velocity    = drop.vx           (stored screen-space)
 *      drop WORLD velocity     = drop.vxWorld = drop.vx + scrollSpeed
 *      Air drag acts on the world velocity relative to the air (= w.wind).
 *  w.scroll accumulates total distance scrolled (px) for parallax layers.
 *  Wind: w.wind in px/s, negative = blowing LEFT (same direction as scroll).
 *
 *  Time: update(dt) accepts any dt; it runs fixed sub-steps of CONFIG.step
 *  (1/120 s) with an accumulator, so results only depend on seed + the step
 *  index at which flap() was called. Leftover time is carried to next update.
 * ========================================================================
 */
(function (FF) {
  'use strict';

  var DEG = Math.PI / 180;

  /* All tunables. Override per-world with new FF.World({ config: {...} }). */
  var CONFIG = {
    // --- screen / timing
    width: 960,            // px, logical canvas width
    height: 540,           // px
    groundY: 470,          // px, top surface of ground
    step: 1 / 120,         // s, fixed simulation sub-step

    // --- bird
    birdX: 260,            // px, fixed screen x of bird centre
    birdStartY: 230,       // px, hover height in READY
    birdRadius: 22,        // px, collision radius (sprite drawn 78×65)
    gravity: 1500,         // px/s², bird gravity
    flapImpulse: -460,     // px/s, vy is SET to this on flap  → rise ≈ 70 px, apex ≈ 0.31 s
    maxFall: 650,          // px/s, terminal fall velocity
    ceilingBounce: 140,    // px/s, downward vy given after touching the ceiling
    readyBobAmp: 9,        // px, READY hover amplitude
    readyBobFreq: 0.85,    // Hz, READY hover frequency
    readyWingRate: 2.6,    // wing cycles/s while hovering in READY
    readyScrollSpeed: 70,  // px/s, ground scroll on READY screen
    tiltUp: -25 * DEG,     // rad, nose-up angle after a flap
    tiltDown: 70 * DEG,    // rad, max nose-down angle
    tiltHold: 0.18,        // s, keep nose-up at least this long after a flap
    noseDownFrom: 160,     // px/s, start pitching down once vy exceeds this…
    noseDownFull: 640,     // px/s, …and reach tiltDown at this vy
    tiltUpRate: 20,        // 1/s, exponential approach rate toward nose-up target
    tiltDownRate: 4.5,     // 1/s, approach rate toward nose-down (slow = smooth)
    wingFastRate: 7,       // wing cycles/s right after a flap (each pose holds ≥2 frames at 60 fps)
    wingGlideRate: 3.2,    // wing cycles/s when gliding / falling
    wingFastTime: 0.25,    // s, fast-flap duration after a flap
    squashFlap: 1.15,      // squash value right after a flap (1 = normal)
    squashRecover: 11,     // 1/s, squash → 1 recovery rate

    // --- drops (the item the bird drops on every flap)
    dropCooldown: 0.18,    // s, min time between drops
    maxDrops: 6,           // max airborne drops at once
    dropRadius: 13,        // px, collision radius vs ground (sprite 32×32)
    dropOffsetX: -8,       // px, spawn offset from bird centre (behind)
    dropOffsetY: 20,       // px, spawn offset (below)
    dropForward: 1.0,      // fraction of scrollSpeed the drop keeps as forward WORLD speed
    dropInheritVy: 0.25,   // fraction of the bird's pre-flap vy inherited
    dropInitialVy: 40,     // px/s, extra downward toss
    dropGravity: 950,      // px/s², heavier-feeling than the bird's air time, lighter than g
    dropMaxFall: 720,      // px/s
    dropDrag: 1.5,         // 1/s, horizontal air drag (world vx relaxes toward wind)
    dropSpin: [2.5, 6],    // rad/s, |spin| range at spawn (sign random, biased by direction)
    dropBounce: 0.28,      // restitution of the single small ground bounce
    dropGroundFriction: 7, // 1/s, how fast a landed drop stops sliding (in world)
    dropFadeTime: 0.6,     // s, fade-out time after landing

    // --- turtles
    turtleW: 132, turtleH: 79,          // px, drawn size (feet at groundY)
    turtleSpawnX: 80,                   // px beyond right edge (x = width + this)
    turtleSpeedMin: 15,                 // px/s at difficulty 0
    turtleSpeedMax: 45,                 // px/s at difficulty 0
    turtleSpeedMaxHard: 75,             // px/s max walking speed at difficulty 1
    turtleRightChance: 0.45,            // probability a turtle walks right (against scroll)
    turtleGapMin: 300,                  // px of scroll between spawns (difficulty 0)
    turtleGapMax: 520,
    turtleGapMinHard: 380,              // px (difficulty 1: sparser, faster)
    turtleGapMaxHard: 680,
    turtleMaxEmptyTime: 1.5,            // s, never leave the screen turtle-free longer than this
    turtleStride: 34,                   // px walked per full leg cycle
    turtlePauseEvery: [3, 7],           // s between little pauses
    turtlePauseFor: [0.5, 1.3],         // s pause duration
    turtleMinGap: 125,                  // px, turtles turn around rather than overlap
    turtleDespawnX: -150,               // px, despawn when x < this
    happyTime: 0.6,                     // s, happy frame after being fed
    hitCooldown: 0.4,                   // s, a turtle can't be fed again within this
    shellX0: 0.2, shellX1: 0.8,         // shell hit zone, fraction of turtle width
    shellY0: 0.12, shellY1: 0.58,       // fraction of turtle height from the top
    shellForgive: 6,                    // px added on every side of the shell box

    // --- scoring & seasons
    pointsPerHit: 1,
    comboBonusAt: 3,       // combo ≥ this gives a bonus
    comboBonus: 1,         // bonus points per hit at/after comboBonusAt
    pointsPerSeason: 10,

    // --- difficulty (smoothstep of score / rampScore)
    rampScore: 60,         // score where difficulty reaches 1
    scrollSpeedStart: 120, // px/s
    scrollSpeedMax: 220,   // px/s
    scrollEase: 0.8,       // 1/s, how fast actual speed follows target
    deadScrollDecel: 3.5,  // 1/s, scroll slows to a stop after death

    // --- wind per season: w = base + gust * noise(t*rate) * (1 + windDifficulty*d)
    wind: [
      { base: -10, gust: 12, rate: 0.25 }, // spring: light breeze
      { base: -3,  gust: 5,  rate: 0.15 }, // summer: calm
      { base: -22, gust: 36, rate: 0.40 }, // autumn: gusty (≈ -60..+14)
      { base: -14, gust: 18, rate: 0.30 }  // winter: moderate
    ],
    windDifficulty: 0.5,
    windBlend: 0.5         // 1/s, season wind profile cross-fade rate
  };

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function approach(cur, target, rate, h) { return cur + (target - cur) * (1 - Math.exp(-rate * h)); }
  function frac(v) { return v - Math.floor(v); }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) o[k] = over[k];
    return o;
  }
  function wingFrame(p) { return p < 0.2 ? 'up' : p < 0.4 ? 'mid' : p < 0.75 ? 'down' : 'mid'; } // biased to the power stroke

  /**
   * Pure drop physics for one sub-step (shared by World and by prediction/Bot).
   * d: { x, y, vx (screen), vxWorld, vy, angle, spin }
   */
  function stepDropAir(d, h, scrollSpeed, wind, cfg) {
    // horizontal: world-space velocity relaxes toward the air velocity (wind)
    d.vxWorld += (wind - d.vxWorld) * (1 - Math.exp(-cfg.dropDrag * h));
    d.vx = d.vxWorld - scrollSpeed;
    d.vy = Math.min(d.vy + cfg.dropGravity * h, cfg.dropMaxFall);
    d.x += d.vx * h;
    d.y += d.vy * h;
    // spin slowly decays a little; a hint of extra spin from sideways air speed
    d.spin *= Math.exp(-0.15 * h);
    d.angle += (d.spin + (d.vxWorld - wind) * 0.004) * h;
  }

  /* 3-octave smooth noise from seeded sines: returns roughly −1..1 */
  function makeNoise(rng) {
    var p = [rng.range(0, 6.283), rng.range(0, 6.283), rng.range(0, 6.283)];
    return function (t) {
      return (Math.sin(t * 1.0 + p[0]) * 0.55 +
              Math.sin(t * 2.31 + p[1]) * 0.3 +
              Math.sin(t * 5.17 + p[2]) * 0.15);
    };
  }

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.width = this.cfg.width;
    this.height = this.cfg.height;
    this.groundY = this.cfg.groundY;
    this.reset(this.seed);
  }

  /** reset([seed]) — back to READY. Passing a seed re-seeds (identical round). */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined || !this.rng) {
      if (seed !== undefined) this.seed = seed;
      this.rng = new FF.RNG(this.seed);
      this.windNoise = makeNoise(this.rng.fork('wind'));
    }
    this.state = 'ready';
    this.time = 0;
    this.playTime = 0;            // added: seconds spent in 'playing'
    this.score = 0; this.combo = 0; this.bestCombo = 0;
    this.hits = 0; this.drops_made = 0; this.misses = 0; this.flaps = 0;
    this.season = 0; this.seasonIndex = 0;
    this.scroll = 0;
    this.scrollSpeed = c.readyScrollSpeed;
    this.difficulty = 0;          // added: 0..1
    this.windProfile = { base: c.wind[0].base, gust: c.wind[0].gust, rate: c.wind[0].rate };
    this.windClock = 0;
    this.wind = c.wind[0].base;
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this._lastDropAt = -1e9;
    this._sinceFlap = 1e9;
    this._turtleGap = 0;          // px of scroll until next turtle spawn
    this._emptyTime = 0;
    this.bird = {
      x: c.birdX, y: c.birdStartY, vy: 0, angle: 0, wingPhase: 0, frame: 'mid',
      radius: c.birdRadius, alive: true, squash: 1
    };
    this.drops = [];
    this.turtles = [];
    // a friendly turtle is already on screen, another follows
    this._spawnTurtle(this.width * 0.62);
    this._turtleGap = this._nextGap();
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /** Player input. */
  World.prototype.flap = function () {
    if (this.state === 'dead') return false;
    if (this.state === 'ready') {
      this.state = 'playing';
      this.scrollSpeed = Math.max(this.scrollSpeed, this.cfg.scrollSpeedStart * 0.85);
      this._emit({ type: 'start' });
      this._doFlap(false);           // the starting flap does not drop an item
      return true;
    }
    this._doFlap(true);
    return true;
  };

  World.prototype._doFlap = function (allowDrop) {
    var c = this.cfg, b = this.bird, preVy = b.vy;
    b.vy = c.flapImpulse;
    b.squash = c.squashFlap;
    b.wingPhase = 0.25;              // 'mid' → snaps straight into the down-stroke
    this._sinceFlap = 0;
    this.flaps++;
    this._emit({ type: 'flap', x: b.x, y: b.y });
    if (allowDrop && this.canDrop()) this._spawnDrop(preVy);
  };

  /** True if a flap right now would release a drop. */
  World.prototype.canDrop = function () {
    if (this.state !== 'playing') return false;
    if (this.time - this._lastDropAt < this.cfg.dropCooldown - 1e-9) return false;
    var n = 0;
    for (var i = 0; i < this.drops.length; i++) if (!this.drops[i].landed) n++;
    return n < this.cfg.maxDrops;
  };

  /** Initial drop state for a flap now (used by spawn AND by prediction). */
  World.prototype.dropInit = function (preVy) {
    var c = this.cfg, b = this.bird;
    var vxWorld = this.scrollSpeed * c.dropForward;
    return {
      x: b.x + c.dropOffsetX,
      y: b.y + c.dropOffsetY,
      vxWorld: vxWorld,
      vx: vxWorld - this.scrollSpeed,
      vy: clamp(preVy, -c.maxFall, c.maxFall) * c.dropInheritVy + c.dropInitialVy,
      angle: 0, spin: 0
    };
  };

  World.prototype._spawnDrop = function (preVy) {
    var c = this.cfg, s = this.dropInit(preVy);
    var d = {
      id: this._nextId++, x: s.x, y: s.y, vx: s.vx, vxWorld: s.vxWorld, vy: s.vy,
      angle: this.rng.range(-0.3, 0.3),
      spin: this.rng.range(c.dropSpin[0], c.dropSpin[1]) * (this.rng.chance(0.7) ? 1 : -1),
      alive: true, landed: false, bounced: false,
      life: 1,          // 1 while airborne; fades 1→0 over dropFadeTime after landing (use as alpha)
      alpha: 1, age: 0
    };
    this.drops.push(d);
    this.drops_made++;
    this._lastDropAt = this.time;
    this._emit({ type: 'drop', x: d.x, y: d.y, id: d.id });
  };

  /* ------------------------------ turtles ------------------------------ */
  World.prototype._nextGap = function () {
    var c = this.cfg, d = this.difficulty;
    var lo = c.turtleGapMin + (c.turtleGapMinHard - c.turtleGapMin) * d;
    var hi = c.turtleGapMax + (c.turtleGapMaxHard - c.turtleGapMax) * d;
    return this.rng.range(lo, hi);
  };

  World.prototype._spawnTurtle = function (x) {
    var c = this.cfg, r = this.rng, d = this.difficulty;
    var maxS = c.turtleSpeedMax + (c.turtleSpeedMaxHard - c.turtleSpeedMax) * d;
    var minS = c.turtleSpeedMin + 5 * d;
    var t = {
      id: this._nextId++,
      x: x !== undefined ? x : this.width + c.turtleSpawnX,
      y: this.groundY,
      dir: r.chance(c.turtleRightChance) ? 1 : -1,
      speed: r.range(minS, maxS),
      walkPhase: r.next(),
      frame: 'walk1',
      happyTimer: 0,
      hitCooldown: 0,     // added: s until it can be fed again
      paused: false,      // added: standing still for a moment (look around)
      pauseTimer: 0,      // added: s left in current pause
      look: 0,            // added: −1..1 head-turn hint while paused (optional for renderer)
      w: c.turtleW, h: c.turtleH,
      fed: 0,
      _nextPause: r.range(c.turtlePauseEvery[0], c.turtlePauseEvery[1]),
      _turnCd: 0
    };
    this.turtles.push(t);
    return t;
  };

  /** Shell hit zone (screen coords, forgiveness included). */
  World.prototype.shellBox = function (t) {
    var c = this.cfg, f = c.shellForgive;
    var left = t.x - t.w / 2, top = t.y - t.h;
    return {
      x: left + t.w * c.shellX0 - f,
      y: top + t.h * c.shellY0 - f,
      w: t.w * (c.shellX1 - c.shellX0) + 2 * f,
      h: t.h * (c.shellY1 - c.shellY0) + 2 * f
    };
  };

  /** Turtle walking velocity (own, excluding scroll) right now. */
  function turtleWalkV(t) {
    return (t.happyTimer > 0 || t.paused) ? 0 : t.dir * t.speed;
  }

  World.prototype._updateTurtles = function (h) {
    var c = this.cfg, r = this.rng, i, t;
    for (i = 0; i < this.turtles.length; i++) {
      t = this.turtles[i];
      if (t.hitCooldown > 0) t.hitCooldown = Math.max(0, t.hitCooldown - h);
      if (t._turnCd > 0) t._turnCd -= h;
      if (t.happyTimer > 0) {
        t.happyTimer = Math.max(0, t.happyTimer - h);
      } else if (t.paused) {
        t.pauseTimer -= h;
        t.look = Math.sin((t.pauseTimer) * 4) * 0.8;
        if (t.pauseTimer <= 0) { t.paused = false; t.look = 0; }
      } else {
        t._nextPause -= h;
        if (t._nextPause <= 0) {
          t.paused = true;
          t.pauseTimer = r.range(c.turtlePauseFor[0], c.turtlePauseFor[1]);
          t._nextPause = r.range(c.turtlePauseEvery[0], c.turtlePauseEvery[1]);
        }
      }
      var v = turtleWalkV(t);
      t.walkPhase = frac(t.walkPhase + Math.abs(v) / c.turtleStride * h);
      t.x += (v - this.scrollSpeed) * h;
      t.frame = t.happyTimer > 0 ? 'happy' : (t.walkPhase < 0.5 ? 'walk1' : 'walk2');
    }
    // personal space: a turtle walking into a neighbour turns around
    for (i = 0; i < this.turtles.length; i++) {
      for (var j = 0; j < this.turtles.length; j++) {
        if (i === j) continue;
        var a = this.turtles[i], b = this.turtles[j], dx = b.x - a.x;
        if (Math.abs(dx) < c.turtleMinGap && a.dir * dx > 0 && a._turnCd <= 0 && a.happyTimer <= 0) {
          a.dir = -a.dir; a._turnCd = 1.5;
        }
      }
    }
    // despawn
    for (i = this.turtles.length - 1; i >= 0; i--) {
      if (this.turtles[i].x < c.turtleDespawnX || this.turtles[i].x > this.width + 400) this.turtles.splice(i, 1);
    }
    // spawn by scrolled distance; plus a guarantee that the screen is never empty for long
    this._turtleGap -= this.scrollSpeed * h;
    var onScreen = 0, rightmost = -1e9;
    for (i = 0; i < this.turtles.length; i++) {
      t = this.turtles[i];
      if (t.x > -t.w / 2 && t.x < this.width + t.w / 2) onScreen++;
      if (t.x > rightmost) rightmost = t.x;
    }
    this._emptyTime = onScreen === 0 ? this._emptyTime + h : 0;
    var roomy = rightmost < this.width + c.turtleSpawnX - c.turtleMinGap;
    if (roomy && (this._turtleGap <= 0 || this._emptyTime > c.turtleMaxEmptyTime)) {
      // an empty screen gets a turtle that pops in right at the edge
      this._spawnTurtle(this._emptyTime > c.turtleMaxEmptyTime ? this.width + 40 : undefined);
      this._turtleGap = this._nextGap();
      this._emptyTime = 0;
    }
  };

  /* ------------------------------ drops ------------------------------ */
  World.prototype._updateDrops = function (h) {
    var c = this.cfg, i, j, d;
    for (i = 0; i < this.drops.length; i++) {
      d = this.drops[i];
      if (!d.alive) continue;
      d.age += h;
      if (!d.landed) {
        stepDropAir(d, h, this.scrollSpeed, this.wind, c);
        // shell hit?
        if (d.vy > 0) {
          for (j = 0; j < this.turtles.length; j++) {
            var t = this.turtles[j];
            if (t.hitCooldown > 0) continue;
            var bx = this.shellBox(t);
            if (d.x >= bx.x && d.x <= bx.x + bx.w && d.y >= bx.y && d.y <= bx.y + bx.h) {
              this._hit(d, t);
              break;
            }
          }
          if (!d.alive) continue;
        }
        if (d.y + c.dropRadius >= this.groundY) {
          d.y = this.groundY - c.dropRadius;
          d.landed = true;
          d.bounced = true;
          d.vy = -Math.min(d.vy * c.dropBounce, 160);
          d.spin *= 0.5;
          this.misses++;
          this.combo = 0;
          this._emit({ type: 'miss', x: d.x, y: this.groundY, id: d.id });
        }
      } else {
        // small bounce, then slide with the ground and fade
        d.vy += c.dropGravity * h;
        d.y += d.vy * h;
        if (d.y + c.dropRadius >= this.groundY) { d.y = this.groundY - c.dropRadius; d.vy = 0; }
        d.vxWorld *= Math.exp(-c.dropGroundFriction * h);
        d.vx = d.vxWorld - this.scrollSpeed;
        d.x += d.vx * h;
        d.spin *= Math.exp(-6 * h);
        d.angle += d.spin * h;
        d.life -= h / c.dropFadeTime;
        d.alpha = Math.max(0, d.life);
        if (d.life <= 0) d.alive = false;
      }
      if (d.x < -80) d.alive = false;
    }
    for (i = this.drops.length - 1; i >= 0; i--) if (!this.drops[i].alive) this.drops.splice(i, 1);
  };

  World.prototype._hit = function (d, t) {
    var c = this.cfg;
    d.alive = false;
    t.happyTimer = c.happyTime;
    t.hitCooldown = c.hitCooldown;
    t.paused = false; t.look = 0;
    t.frame = 'happy';
    t.fed++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.hits++;
    var pts = c.pointsPerHit + (this.combo >= c.comboBonusAt ? c.comboBonus : 0);
    this.score += pts;
    this._emit({ type: 'hit', x: d.x, y: d.y, points: pts, combo: this.combo, turtleId: t.id });
    var idx = Math.floor(this.score / c.pointsPerSeason);
    if (idx !== this.seasonIndex) {
      this.seasonIndex = idx;
      this.season = idx % 4;
      this._emit({ type: 'season', season: this.season, seasonIndex: this.seasonIndex });
    }
  };

  /* ------------------------------ bird ------------------------------ */
  World.prototype._updateBird = function (h) {
    var c = this.cfg, b = this.bird;
    this._sinceFlap += h;
    if (this.state === 'ready') {
      var w = 2 * Math.PI * c.readyBobFreq;
      b.y = c.birdStartY + Math.sin(this.time * w) * c.readyBobAmp;
      b.vy = Math.cos(this.time * w) * c.readyBobAmp * w;
      b.angle = approach(b.angle, b.vy * 0.004, 6, h);
      b.wingPhase = frac(b.wingPhase + c.readyWingRate * h);
    } else if (this.state === 'playing') {
      b.vy = Math.min(b.vy + c.gravity * h, c.maxFall);
      b.y += b.vy * h;
      // ceiling: clamp + gentle bounce (no death)
      if (b.y - b.radius < 0) {
        b.y = b.radius;
        if (b.vy < 0) {
          b.vy = c.ceilingBounce;
          this._emit({ type: 'ceiling', x: b.x, y: b.y });
        }
      }
      // tilt
      var target = (this._sinceFlap < c.tiltHold) ? c.tiltUp
        : c.tiltUp + (c.tiltDown - c.tiltUp) * smoothstep(c.noseDownFrom, c.noseDownFull, b.vy);
      b.angle = approach(b.angle, target, target < b.angle ? c.tiltUpRate : c.tiltDownRate, h);
      // wings: energetic right after a flap, blending to slow glide flaps
      var k = smoothstep(c.wingFastTime * 0.6, c.wingFastTime * 1.4, this._sinceFlap);
      b.wingPhase = frac(b.wingPhase + (c.wingFastRate + (c.wingGlideRate - c.wingFastRate) * k) * h);
      // ground → dead
      if (b.y + b.radius >= this.groundY) {
        b.y = this.groundY - b.radius;
        b.vy = 0;
        b.alive = false;
        this.state = 'dead';
        this._emit({ type: 'dead', x: b.x, y: b.y, score: this.score });
      }
    } else { // dead: a soft belly-flop on the ground (beak stays out of the dirt), wings still
      b.angle = approach(b.angle, 0.45, 8, h);
    }
    b.squash = 1 + (b.squash - 1) * Math.exp(-c.squashRecover * h);
    b.frame = wingFrame(b.wingPhase);
  };

  /* ------------------------------ difficulty & wind ------------------------------ */
  World.prototype._updateEnv = function (h) {
    var c = this.cfg;
    this.difficulty = smoothstep(0, c.rampScore, this.score);
    if (this.state === 'playing') {
      this.playTime += h;
      var target = c.scrollSpeedStart + (c.scrollSpeedMax - c.scrollSpeedStart) * this.difficulty;
      this.scrollSpeed = approach(this.scrollSpeed, target, c.scrollEase, h);
    } else if (this.state === 'dead') {
      this.scrollSpeed = approach(this.scrollSpeed, 0, c.deadScrollDecel, h);
      if (this.scrollSpeed < 0.5) this.scrollSpeed = 0;
    } else {
      this.scrollSpeed = c.readyScrollSpeed;
    }
    var p = c.wind[this.season] || c.wind[0], wp = this.windProfile;
    wp.base = approach(wp.base, p.base, c.windBlend, h);
    wp.gust = approach(wp.gust, p.gust, c.windBlend, h);
    wp.rate = approach(wp.rate, p.rate, c.windBlend, h);
    this.windClock += wp.rate * h * 2 * Math.PI;
    this.wind = wp.base + wp.gust * (1 + c.windDifficulty * this.difficulty) * this.windNoise(this.windClock);
  };

  /* ------------------------------ main step ------------------------------ */
  World.prototype._step = function (h) {
    this.time += h;
    this._updateEnv(h);
    this.scroll += this.scrollSpeed * h;
    this._updateBird(h);
    this._updateTurtles(h);
    this._updateDrops(h);
  };

  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += dt;
    while (this._acc >= h - 1e-12) {
      this._acc -= h;
      this._step(h);
    }
  };

  /* ------------------------------ prediction (for Bot / aim assist) ------------------------------ */
  /**
   * Simulate a drop released by a flap right now (bird state unchanged) and
   * the turtles' motion, assuming scrollSpeed & wind stay as they are.
   * Returns { hitId: turtle id | null, t: seconds until hit/ground, x, y }.
   */
  World.prototype.predictDrop = function (preVy, maxT) {
    var c = this.cfg, h = 1 / 60;    // coarser step is plenty for prediction
    var d = this.dropInit(preVy === undefined ? this.bird.vy : preVy);
    var ghosts = [], i;
    for (i = 0; i < this.turtles.length; i++) {
      var t = this.turtles[i];
      ghosts.push({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, dir: t.dir, speed: t.speed,
        stop: t.happyTimer > 0 ? t.happyTimer : (t.paused ? t.pauseTimer : 0), cd: t.hitCooldown });
    }
    maxT = maxT || 3;
    for (var time = 0; time < maxT; time += h) {
      stepDropAir(d, h, this.scrollSpeed, this.wind, c);
      for (i = 0; i < ghosts.length; i++) {
        var g = ghosts[i];
        var v = g.stop > 0 ? 0 : g.dir * g.speed;
        if (g.stop > 0) g.stop -= h;
        g.cd -= h;
        g.x += (v - this.scrollSpeed) * h;
        if (d.vy > 0 && g.cd <= 0) {
          var bx = this.shellBox(g);
          if (d.x >= bx.x && d.x <= bx.x + bx.w && d.y >= bx.y && d.y <= bx.y + bx.h) {
            return { hitId: g.id, t: time + h, x: d.x, y: d.y, margin: Math.min(d.x - bx.x, bx.x + bx.w - d.x) };
          }
        }
      }
      if (d.y + c.dropRadius >= this.groundY) return { hitId: null, t: time + h, x: d.x, y: d.y };
    }
    return { hitId: null, t: maxT, x: d.x, y: d.y };
  };

  /** Plain snapshot for tests / debugging (no functions, no rng). */
  World.prototype.snapshot = function () {
    return JSON.parse(JSON.stringify({
      state: this.state, time: this.time, score: this.score, combo: this.combo, hits: this.hits,
      drops_made: this.drops_made, misses: this.misses, season: this.season, seasonIndex: this.seasonIndex,
      scroll: this.scroll, scrollSpeed: this.scrollSpeed, wind: this.wind,
      bird: this.bird, drops: this.drops, turtles: this.turtles
    }));
  };

  World.stepDropAir = stepDropAir;
  World.smoothstep = smoothstep;
  FF.CONFIG = CONFIG;
  FF.World = World;
})(typeof window !== 'undefined' ? (window.FF = window.FF || {}) : (globalThis.FF = globalThis.FF || {}));
