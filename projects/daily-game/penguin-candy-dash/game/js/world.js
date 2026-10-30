/* Pip's Candy Dash — CD.CONFIG + CD.DIFFICULTY + CD.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 canvas), seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s)
 *  with an accumulator (w._acc = leftover time, 0..step). Results depend only on
 *  the seed and on the sub-step index at which setMove/setTarget/action are called.
 *
 *  Render interpolation: at the START of every sub-step the previous position is
 *  saved as `_px,_py` on pip, every bear and every gem.
 *  Renderer: drawX = _px + (x - _px) * (w._acc / w.cfg.step).
 *
 *  Ground plane: every (x, y) is a point ON THE GROUND (feet anchor for Pip and
 *  bears, shadow point for gems). All collisions are circles in this plane.
 *   - Pip:   draw sprite feet at (x, y − z), size 60·scale, scaleX ×(1+squash),
 *            scaleY ×(1−squash), mirror when facing = −1. Shadow at (x, y).
 *   - Bears: feet at (x, y − z), alpha = spawnT. Shadow at (x, y).
 *   - Gems:  centre at (x, y − cfg.gemHover − bob), alpha/scale from `appear`
 *            (0..1 sparkle telegraph; collectable only at 1). Blink when life < 1.5.
 *  Collision radius: Pip 16 × (1 + 0.15·(size−1)) (= size-based, NOT the smoothed
 *  visual `scale`, so shrinking from a bump/Pop helps immediately), bears 18, gems 12.
 * ========================================================================
 */
(function (CD) {
  'use strict';

  /* All tunables. Override per-world with new CD.World({ config: {...} }). */
  var CONFIG = {
    // --- screen / timing
    width: 960, height: 540,
    step: 1 / 120,                 // s, fixed simulation sub-step
    arena: { x: 40, y: 84, w: 880, h: 432 },   // walkable feet area (DESIGN §2)
    hudAvoid: [{ x: 0, y: 64, w: 300, h: 46 }, { x: 790, y: 64, w: 170, h: 80 }],  // no gem spawns under hearts / jar
    introDelay: 1.4,               // s, 'ready' (biome banner) before play
    clearTime: 2.0,                // s, 'cleared' gate walk-out before the next level

    // --- Pip
    pipStart: { x: 120, y: 220 },
    heartsMax: 3,
    sizeMax: 5,
    scalePerSize: 0.15,            // visual & collision scale = 1 + 0.15·(size−1)
    pipRadius: 16,                 // px at size 1
    speedSmall: 210, speedBig: 165,// px/s max speed at size 1 / size 5 (linear between)
    accelSmall: 1500, accelBig: 950,   // px/s² toward the input velocity (= turn rate; heavier = lazier)
    brakeSmall: 1200, brakeBig: 850,   // px/s² with no input (≈ 18–20 px drift: a little ice-slide)
    arriveStop: 6,                 // px, pointer-follow stops inside this
    arriveSafety: 0.85,            // fraction of the braking distance used by arrive (no overshoot)
    facingHyst: 25,                // px/s, |vx| needed to flip facing
    strideLen: 22,                 // px of travel per waddle frame
    idleSpeed: 14,                 // px/s, below this frame = idle
    scaleRate: 10,                 // 1/s, visual scale smoothing
    wallBounce: 0.2,               // soft wall: normal velocity × −0.2
    // dash (belly-slide)
    dashTime: 0.25, dashMul: 2.2, dashCooldown: 1.2,
    // Pop!
    popBase: 50, popPerBear: 10, popRadius: 160, stunTime: 2.5, popPush: 140,
    // bump
    invulnTime: 1.5, hurtTime: 0.35, knockPip: 280, knockBear: 150, bearRestTime: 0.8,
    dropGems: 2,
    hitForgive: 0.85,              // bear hit radius factor (kind hitbox for kids)
    // squash (renderer: scaleX ×(1+squash), scaleY ×(1−squash)); decaying wobble
    squashGrow: 0.16, squashPop: 0.3, squashBump: 0.22, squashFreq: 17, squashDecay: 7,
    cheerTime: 0.8,

    // --- gems
    gemRadius: 12, gemHover: 14, gemBobAmp: 3, gemBobFreq: 1.3,
    gemTelegraph: 0.6,             // s, appear 0→1
    gemCount: [3, 4, 4, 5],        // gems present per biome, lap 0 (+1 per lap, cap gemCountMax)
    gemCountMax: 6,
    gemRespawn: 0.4,               // s after a pickup before a replacement starts its telegraph
    gemLife: 14,                   // s, an uncollected gem fades and respawns elsewhere
    gemPointsPerSize: 10,
    gemMinFromPip: 130, gemMinFromBear: 80, gemMinFromGem: 70, gemMinFromGate: 90, gemEdge: 26,
    looseLife: 6, looseSpeed: [240, 320], looseDrag: 3.2, looseTelegraph: 0.6, looseBounce: 0.6,

    // --- bears
    bearRadius: 18,
    bearCounts: [2, 3, 3, 4],      // per biome, lap 0; +bearsPerLap each lap, cap bearMax
    bearsPerLap: 1, bearMax: 8,
    bearOrder: ['red', 'green', 'orange', 'green', 'red', 'orange', 'green', 'red'],
    bearSpeed: { red: 88, green: 100, orange: 92 },   // px/s base (before multipliers and the cap)
    guardCharge: 1.25,             // × orange speed while charging (still capped)
    bearBiomeMul: [0.85, 1, 1.05, 1.1],
    bearLapMul: 0.12,              // +12 % per lap (the cap still applies)
    bearSpeedMul: 1,               // difficulty multiplier
    bearCapFrac: 0.75,             // bears ≤ 0.75 × Pip's CURRENT max speed (size-based)
    bearAccel: 520,                // px/s² (readable, rounded turns)
    bearSpawnTime: 0.8,            // s fade-in (harmless, still)
    bearSpawnMinDist: 320,         // px from Pip
    bearSepDist: 46,               // px, bears push apart inside this
    gateOpenBearMul: 0.6,
    wanderPause: [0.3, 0.8], wanderNearPip: 0.4, wanderNearR: 140,
    followLag: 0.8, followLagPerLap: 0.15, followLagMin: 0.35,
    followDirect: 60,              // px: closer than this the follower seeks Pip directly
    guardOrbitR: 62, guardOrbitW: 1.6, guardAggro: 120, guardGiveUp: 210, guardChargeMax: 1.6, guardCool: 1.2,

    // --- terrain zones (one flavour per biome)
    zonesByBiome: [
      [],
      [ // Chocolate River: slow stream band y 270–350, wafer-bridge gaps x 300–360 and 640–700,
        // and no slow from x 850 on (wafer landing under the gate, art x 852–964)
        { type: 'slow', shape: 'rect', x: 40, y: 270, w: 260, h: 80 },
        { type: 'slow', shape: 'rect', x: 360, y: 270, w: 280, h: 80 },
        { type: 'slow', shape: 'rect', x: 700, y: 270, w: 150, h: 80 }
      ],
      [ // Cotton Candy Clouds: springy puffs
        { type: 'bouncy', shape: 'circle', x: 300, y: 200, r: 70 },
        { type: 'bouncy', shape: 'circle', x: 640, y: 380, r: 80 },
        { type: 'bouncy', shape: 'circle', x: 760, y: 170, r: 60 }
      ],
      [ // Ice-Cream Glacier: slippery ice
        { type: 'ice', shape: 'rect', x: 160, y: 140, w: 260, h: 140 },
        { type: 'ice', shape: 'rect', x: 560, y: 320, w: 280, h: 150 }
      ]
    ],
    // non-slow wafer surfaces across the river: 2 bridges + the gate landing (x ≥ 850)
    bridgesByBiome: [[], [{ x: 300, y: 270, w: 60, h: 80 }, { x: 640, y: 270, w: 60, h: 80 }, { x: 850, y: 270, w: 70, h: 80 }], [], []],
    slowMul: 0.55,                 // max speed × in 'slow'
    iceMul: 0.25,                  // accel & braking × on 'ice' (keeps momentum)
    bouncyPush: 2.2,               // 1/s: outward drift = 2.2 px/s per px of penetration (added to position,
                                   //  so braking can't cancel it; centre of r70 = 154 px/s < Pip's 165–210)
    bouncyImpulse: 140,            // px/s outward kick on entering a puff
    bouncyFloat: 0.6,              // accel & braking × inside a puff (floaty)
    hopVz: 150, hopGravity: 900,   // visual hop (z) on a puff bounce

    // --- jar / gate / levels
    jarTargets: [12, 15, 18, 20],  // gems per biome, lap 0
    jarLapMul: 0.2,                // + 20 % per lap
    gate: { x: 900, y: 300 }, gateRadius: 34, gateOpenTime: 0.6,
    clearBonusPerHeart: 100,
    healOnClear: 1                 // hearts refilled on each clear (cap heartsMax)
  };

  /* Difficulty presets: overrides merged over CONFIG. */
  var DIFFICULTY = {
    easy: {
      heartsMax: 5, bearSpeedMul: 0.8, jarTargets: [8, 10, 12, 14], invulnTime: 2.0,
      bearCounts: [1, 2, 3, 3], followLag: 1.0, guardAggro: 100, healOnClear: 1
    },
    normal: {},
    hard: {
      heartsMax: 3, bearSpeedMul: 1.15, jarTargets: [15, 18, 22, 25], invulnTime: 1.2,
      bearCounts: [3, 3, 4, 5], followLag: 0.6, healOnClear: 0, bearBiomeMul: [1, 1.05, 1.1, 1.15]
    }
  };

  /* ---------- helpers ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) if (over[k] !== undefined) o[k] = over[k];
    return o;
  }
  function inRect(z, x, y) { return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h; }
  function inZone(z, x, y) {
    if (z.shape === 'circle') { var dx = x - z.x, dy = y - z.y; return dx * dx + dy * dy < z.r * z.r; }
    return inRect(z, x, y);
  }
  // velocity v moves toward desired d by at most a·h (vector "accelerate toward")
  function approach(e, dx, dy, a, h) {
    var ex = dx - e.vx, ey = dy - e.vy, el = hyp(ex, ey), m = a * h;
    if (el <= m || el < 1e-9) { e.vx = dx; e.vy = dy; }
    else { e.vx += ex / el * m; e.vy += ey / el * m; }
  }
  var GEM_COLORS = ['pink', 'blue', 'yellow', 'green'];
  var HIST_N = 64, HIST_DT = 0.05;   // Pip trail for the follower bear (3.2 s)

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.width = this.cfg.width;
    this.height = this.cfg.height;
    this.reset();
  }
  World.CONFIG = CONFIG;

  /** reset([seed]) — new game: level 0 (meadow), score 0, full hearts, state 'ready'. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new CD.RNG(this.seed);
    this.time = 0;
    this.steps = 0;                       // added: fixed sub-steps simulated so far
    this.score = 0;
    this.heartsMax = c.heartsMax;
    this.hearts = c.heartsMax;
    this.sizeMax = c.sizeMax;
    this.size = 1;
    this.gemsTotal = 0; this.pops = 0; this.bumps = 0; this.dashes = 0;   // dashes: added
    this.levelsCleared = 0;               // added
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this._mx = 0; this._my = 0; this._target = null;
    this._emit({ type: 'start' });
    this.startLevel(0);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /* ------------------------------ level setup ------------------------------ */
  /** Numbers for level i (also handy for the UI / tests). */
  World.prototype.levelInfo = function (i) {
    var c = this.cfg, b = i % 4, lap = Math.floor(i / 4);
    return {
      biome: b, lap: lap,
      jarTarget: Math.round(c.jarTargets[b] * (1 + c.jarLapMul * lap)),
      bears: Math.min(c.bearMax, c.bearCounts[b] + c.bearsPerLap * lap),
      gems: Math.min(c.gemCountMax, c.gemCount[b] + lap),
      bearMul: c.bearSpeedMul * c.bearBiomeMul[b] * (1 + c.bearLapMul * lap),
      followLag: Math.max(c.followLagMin, c.followLag - c.followLagPerLap * lap)
    };
  };

  World.prototype.startLevel = function (i) {
    var c = this.cfg, k;
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i);
    this.level = i;
    this.biome = info.biome;
    this.lap = info.lap;
    this.levelTime = 0;
    this.jar = 0;
    this.jarTarget = info.jarTarget;
    this.gemsWanted = info.gems;          // added: gems kept on the arena
    this._info = info;
    this.size = 1;                         // every biome starts with a small Pip
    this.arena = { x: c.arena.x, y: c.arena.y, w: c.arena.w, h: c.arena.h };
    this.zones = c.zonesByBiome[this.biome].map(function (z) { return merge(z); });
    this.bridges = c.bridgesByBiome[this.biome].map(function (z) { return merge(z); });   // added (river art helper)
    this.gate = { x: c.gate.x, y: c.gate.y, open: false, t: 0 };
    var r = this.pipRadiusFor(1);
    this.pip = {
      x: c.pipStart.x, y: c.pipStart.y, vx: 0, vy: 0, _px: c.pipStart.x, _py: c.pipStart.y,
      facing: 1, frame: 'idle', scale: 1, radius: r, invuln: 0, dashCd: 0, sliding: false, squash: 0,
      z: 0,                 // added: visual hop height (px) from cloud puffs
      dashT: 0,             // added: s of dash left
      hurt: 0,              // added: s of hurt pose left
      cheer: 0,             // added: s of cheer pose left
      onIce: false, inSlow: false, inPuff: false,   // added: terrain under Pip
      _stride: 0, _sqA: 0, _sqT: 9, _vz: 0, _dx: 1, _dy: 0, _puff: -1
    };
    this._hist = []; this._histT = 0;
    for (k = 0; k < HIST_N; k++) this._hist.push(c.pipStart.x, c.pipStart.y);
    this._histHead = 0;
    this.gems = [];
    this._gemTimer = 0;
    this.bears = [];
    for (k = 0; k < info.bears; k++) this._spawnBear(c.bearOrder[k % c.bearOrder.length], k);
    for (k = 0; k < info.gems; k++) this._spawnGem();
    this.state = 'ready';
    this._stateT = 0;
    this._emit({ type: 'biome', biome: this.biome, level: i, lap: this.lap });
    return this;
  };

  World.prototype.pipRadiusFor = function (s) { return this.cfg.pipRadius * (1 + this.cfg.scalePerSize * (s - 1)); };
  /** Pip's max speed (px/s) at size s, before terrain. */
  World.prototype.pipMaxSpeed = function (s) {
    var c = this.cfg; s = s === undefined ? this.size : s;
    return lerp(c.speedSmall, c.speedBig, (s - 1) / (c.sizeMax - 1));
  };
  /** Bear speed cap right now = bearCapFrac × Pip's current max speed. */
  World.prototype.bearCap = function () { return this.cfg.bearCapFrac * this.pipMaxSpeed(this.size); };

  /** Terrain under a ground point: { speedMul, fricMul, puff (index or −1), ice, slow }. */
  World.prototype.terrainAt = function (x, y) {
    var c = this.cfg, o = { speedMul: 1, fricMul: 1, puff: -1, ice: false, slow: false };
    for (var i = 0; i < this.zones.length; i++) {
      var z = this.zones[i];
      if (!inZone(z, x, y)) continue;
      if (z.type === 'slow') { o.slow = true; o.speedMul = c.slowMul; }
      else if (z.type === 'ice') { o.ice = true; o.fricMul = c.iceMul; }
      else if (z.type === 'bouncy') { o.puff = i; o.fricMul = c.bouncyFloat; }
    }
    return o;
  };

  World.prototype._farFromAll = function (x, y, dPip, dBear, dGem) {
    var c = this.cfg, i, p = this.pip;
    if (p && hyp(x - p.x, y - p.y) < dPip) return false;
    for (i = 0; i < this.bears.length; i++) if (hyp(x - this.bears[i].x, y - this.bears[i].y) < dBear) return false;
    for (i = 0; i < this.gems.length; i++) if (hyp(x - this.gems[i].x, y - this.gems[i].y) < dGem) return false;
    if (hyp(x - c.gate.x, y - c.gate.y) < c.gemMinFromGate) return false;
    for (i = 0; i < c.hudAvoid.length; i++) if (inRect(c.hudAvoid[i], x, y)) return false;
    for (i = 0; i < this.zones.length; i++) {
      var z = this.zones[i];
      if (z.type === 'bouncy' && hyp(x - z.x, y - z.y) < z.r * 0.5) return false;   // not in a puff's core
    }
    return true;
  };

  World.prototype._spawnGem = function () {
    var c = this.cfg, a = this.arena, r = this.rng, x = 0, y = 0, ok = false, k, relax = 1;
    for (k = 0; k < 80 && !ok; k++) {
      if (k === 40) relax = 0.6;
      x = r.range(a.x + c.gemEdge, a.x + a.w - c.gemEdge);
      y = r.range(a.y + c.gemEdge, a.y + a.h - c.gemEdge);
      ok = this._farFromAll(x, y, c.gemMinFromPip * relax, c.gemMinFromBear * relax, c.gemMinFromGem * relax);
    }
    var g = {
      id: this._nextId++, color: GEM_COLORS[r.int(0, 3)], x: x, y: y, vx: 0, vy: 0, _px: x, _py: y,
      appear: 0, loose: false, life: c.gemLife, bob: 0, _ph: r.range(0, TAU)
    };
    this.gems.push(g);
    return g;
  };

  World.prototype._spawnBear = function (kind, idx) {
    var c = this.cfg, a = this.arena, r = this.rng, p = this.pip, x = 0, y = 0, k, best = -1, bx = 0, by = 0;
    // try points along the top/right/bottom edges; keep the one farthest from Pip and other bears
    for (k = 0; k < 24; k++) {
      var side = r.int(0, 2);
      if (side === 0) { x = r.range(a.x + 300, a.x + a.w - 40); y = a.y + 24; }
      else if (side === 1) { x = a.x + a.w - 30; y = r.range(a.y + 40, a.y + a.h - 30); }
      else { x = r.range(a.x + 300, a.x + a.w - 40); y = a.y + a.h - 16; }
      if (hyp(x - c.gate.x, y - c.gate.y) < 60) continue;
      var d = hyp(x - p.x, y - p.y), dm = 1e9;
      for (var j = 0; j < this.bears.length; j++) dm = Math.min(dm, hyp(x - this.bears[j].x, y - this.bears[j].y));
      var sc = Math.min(d, c.bearSpawnMinDist + 80) + Math.min(dm, 120) * 1.5 + (d >= c.bearSpawnMinDist ? 1000 : 0);
      if (sc > best) { best = sc; bx = x; by = y; }
    }
    var b = {
      id: this._nextId++, kind: kind, x: bx, y: by, vx: 0, vy: 0, _px: bx, _py: by,
      facing: bx > p.x ? -1 : 1, frame: '1', stun: 0, radius: c.bearRadius, spawnT: 0,
      z: 0,                 // added: hop height from puffs
      mode: 'idle',         // added: 'idle'|'wander'|'follow'|'orbit'|'charge'|'rest'|'stun'
      rest: 0,              // added: s of post-bump rest
      _stride: 0, _wx: bx, _wy: by, _wait: r.range(0.2, 0.8), _ang: r.range(0, TAU), _chT: 0, _cool: 0,
      _gem: -1, _orbitDir: r.sign(), _puff: -1, _vz: 0, _kb: 0
    };
    this.bears.push(b);
    return b;
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.setMove = function (mx, my) {
    mx = +mx || 0; my = +my || 0;
    var l = hyp(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this._mx = mx; this._my = my;
  };
  World.prototype.setTarget = function (x, y) {
    if (x === null || x === undefined || typeof x !== 'number') { this._target = null; return; }
    this._target = { x: +x, y: +y };
  };

  /** Dash, or Pop! at max size. Returns 'dash' | 'pop' | null. */
  World.prototype.action = function () {
    if (this.state !== 'playing') return null;
    var c = this.cfg, p = this.pip;
    if (this.size >= this.sizeMax) { this._pop(); return 'pop'; }
    if (p.dashCd > 0 || p.dashT > 0) return null;
    var d = this._inputDir();
    if (!d) d = hyp(p.vx, p.vy) > 20 ? { x: p.vx / hyp(p.vx, p.vy), y: p.vy / hyp(p.vx, p.vy) } : { x: p.facing, y: 0 };
    p._dx = d.x; p._dy = d.y;
    p.dashT = c.dashTime; p.dashCd = c.dashCooldown; p.sliding = true;
    this.dashes++;
    this._emit({ type: 'dash', x: p.x, y: p.y, dx: d.x, dy: d.y });
    return 'dash';
  };

  // unit direction of the current input, or null
  World.prototype._inputDir = function () {
    var l = hyp(this._mx, this._my);
    if (l > 0.05) return { x: this._mx / l, y: this._my / l };
    var t = this._target, p = this.pip;
    if (t) { var dx = t.x - p.x, dy = t.y - p.y, d = hyp(dx, dy); if (d > this.cfg.arriveStop + 4) return { x: dx / d, y: dy / d }; }
    return null;
  };

  World.prototype._pop = function () {
    var c = this.cfg, p = this.pip, n = 0;
    for (var i = 0; i < this.bears.length; i++) {
      var b = this.bears[i];
      if (b.spawnT < 1) continue;
      var dx = b.x - p.x, dy = b.y - p.y, d = hyp(dx, dy);
      if (d <= c.popRadius) {
        n++;
        b.stun = c.stunTime; b.mode = 'stun';
        var u = d > 1e-6 ? 1 / d : 0;
        b.vx = dx * u * c.popPush; b.vy = dy * u * c.popPush; b._kb = 0.3;
      }
    }
    var pts = c.popBase + c.popPerBear * n;
    this.score += pts;
    this.size = 1;
    p.radius = this.pipRadiusFor(1);
    this.pops++;
    this._squash(c.squashPop);
    p.cheer = c.cheerTime;
    this._emit({ type: 'pop', x: p.x, y: p.y, stunned: n, points: pts });
    this._emit({ type: 'shrink', size: 1 });
  };

  World.prototype._squash = function (a) { this.pip._sqA = a; this.pip._sqT = 0; };

  /* ------------------------------ simulation ------------------------------ */
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += dt;                     // no clamp here: main.js clamps tab-switch gaps BEFORE × speed
    while (this._acc >= h - 1e-12) {
      this._acc -= h;
      this._step(h);
    }
    if (this._acc < 0) this._acc = 0;
  };

  World.prototype._step = function (h) {
    var c = this.cfg, i, p = this.pip;
    p._px = p.x; p._py = p.y;
    for (i = 0; i < this.bears.length; i++) { this.bears[i]._px = this.bears[i].x; this.bears[i]._py = this.bears[i].y; }
    for (i = 0; i < this.gems.length; i++) { this.gems[i]._px = this.gems[i].x; this.gems[i]._py = this.gems[i].y; }
    this.time += h; this.levelTime += h; this._stateT += h; this.steps++;

    if (this.state === 'ready') {
      this._stepGems(h, false);
      this._stepBears(h, false);
      this._stepPipVisual(h);
      if (this._stateT >= c.introDelay) {
        this.state = 'playing'; this._stateT = 0;
        this._emit({ type: 'go', level: this.level });
      }
    } else if (this.state === 'playing') {
      this._stepPip(h);
      this._stepBears(h, true);
      this._stepGems(h, true);
      this._collide();
      this._stepGate(h);
      this._stepPipVisual(h);
    } else if (this.state === 'cleared') {
      this._stepExit(h);
      this._stepBears(h, false);
      this._stepGems(h, false);
      this._stepGate(h);
      this._stepPipVisual(h);
      if (this._stateT >= c.clearTime) this.startLevel(this.level + 1);
    } else { // dead: let things settle
      p.vx *= Math.exp(-6 * h); p.vy *= Math.exp(-6 * h);
      p.x += p.vx * h; p.y += p.vy * h;
      this._stepBears(h, false);
      this._stepPipVisual(h);
    }
  };

  /* ---- Pip ---- */
  World.prototype._stepPip = function (h) {
    var c = this.cfg, p = this.pip, s = this.size, f = (s - 1) / (c.sizeMax - 1);
    var ter = this.terrainAt(p.x, p.y);
    p.onIce = ter.ice; p.inSlow = ter.slow; p.inPuff = ter.puff >= 0;
    var maxS = this.pipMaxSpeed(s) * ter.speedMul;
    var accel = lerp(c.accelSmall, c.accelBig, f) * ter.fricMul;
    var brake = lerp(c.brakeSmall, c.brakeBig, f) * ter.fricMul;
    if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - h);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - h);
    if (p.hurt > 0) p.hurt = Math.max(0, p.hurt - h);
    if (p.cheer > 0) p.cheer = Math.max(0, p.cheer - h);

    if (p.dashT > 0) {
      p.dashT -= h;
      var ds = this.pipMaxSpeed(s) * c.dashMul * ter.speedMul;
      // keep the burst along the dash direction (tiny steering allowed)
      var d = this._inputDir();
      if (d) { p._dx += (d.x - p._dx) * 4 * h; p._dy += (d.y - p._dy) * 4 * h; var l = hyp(p._dx, p._dy) || 1; p._dx /= l; p._dy /= l; }
      p.vx = p._dx * ds; p.vy = p._dy * ds;
      if (p.dashT <= 0) { p.dashT = 0; p.sliding = false; }
    } else if (p.hurt > 0) {
      approach(p, 0, 0, brake * 0.6, h);            // knock-back glides out, no control
    } else {
      var dx = 0, dy = 0, ml = hyp(this._mx, this._my);
      if (ml > 0.05) { dx = this._mx * maxS; dy = this._my * maxS; }
      else if (this._target) {
        var tx = this._target.x - p.x, ty = this._target.y - p.y, td = hyp(tx, ty);
        if (td > c.arriveStop) {
          // arrive: never faster than what can still brake to a stop at the target
          var want = Math.min(maxS, Math.sqrt(2 * brake * c.arriveSafety * (td - c.arriveStop)));
          dx = tx / td * want; dy = ty / td * want;
        }
      }
      approach(p, dx, dy, (dx || dy) ? accel : brake, h);
    }
    this._puffForce(p, ter, h, 'pip');
    p.x += p.vx * h; p.y += p.vy * h;
    this._clampArena(p, p.radius);
    // trail for the follower bear
    this._histT += h;
    if (this._histT >= HIST_DT) {
      this._histT -= HIST_DT;
      this._histHead = (this._histHead + 1) % HIST_N;
      this._hist[this._histHead * 2] = p.x; this._hist[this._histHead * 2 + 1] = p.y;
    }
  };

  World.prototype._trail = function (lag) {
    var n = Math.min(HIST_N - 1, Math.round(lag / HIST_DT));
    var k = ((this._histHead - n) % HIST_N + HIST_N) % HIST_N;
    return { x: this._hist[k * 2], y: this._hist[k * 2 + 1] };
  };

  // springy cloud puffs: outward spring + a kick and a hop on entry (pip and bears)
  World.prototype._puffForce = function (e, ter, h, who) {
    var c = this.cfg;
    if (ter.puff >= 0) {
      var z = this.zones[ter.puff], dx = e.x - z.x, dy = e.y - z.y, d = hyp(dx, dy);
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      var ux = dx / d, uy = dy / d, pen = z.r - d;
      e.x += ux * c.bouncyPush * pen * h; e.y += uy * c.bouncyPush * pen * h;
      if (e._puff !== ter.puff) {
        var vin = -(e.vx * ux + e.vy * uy);           // speed toward the centre
        if (vin > 20) {
          var k = Math.min(c.bouncyImpulse, vin * 0.9);
          e.vx += ux * k; e.vy += uy * k;
          if (e.z <= 0.01) e._vz = c.hopVz;
          this._emit({ type: 'bounce', x: e.x, y: e.y, who: who, id: e.id || 0 });
        }
      }
    }
    e._puff = ter.puff;
  };

  World.prototype._clampArena = function (e, r) {
    var a = this.arena, c = this.cfg;
    var x0 = a.x + r, x1 = a.x + a.w - r, y0 = a.y + r * 0.6, y1 = a.y + a.h - r * 0.3;
    if (e.x < x0) { e.x = x0; if (e.vx < 0) e.vx *= -c.wallBounce; }
    else if (e.x > x1) { e.x = x1; if (e.vx > 0) e.vx *= -c.wallBounce; }
    if (e.y < y0) { e.y = y0; if (e.vy < 0) e.vy *= -c.wallBounce; }
    else if (e.y > y1) { e.y = y1; if (e.vy > 0) e.vy *= -c.wallBounce; }
  };

  // frame, facing, smoothed scale, squash, hop — all states
  World.prototype._stepPipVisual = function (h) {
    var c = this.cfg, p = this.pip, sp = hyp(p.vx, p.vy);
    if (p.vx > c.facingHyst) p.facing = 1; else if (p.vx < -c.facingHyst) p.facing = -1;
    var target = 1 + c.scalePerSize * (this.size - 1);
    p.scale += (target - p.scale) * (1 - Math.exp(-c.scaleRate * h));
    p.radius = this.pipRadiusFor(this.size);
    p._sqT += h;
    p.squash = p._sqA * Math.exp(-c.squashDecay * p._sqT) * Math.cos(c.squashFreq * p._sqT);
    if (Math.abs(p.squash) < 1e-4) p.squash = 0;
    if (p.z > 0 || p._vz > 0) { p._vz -= c.hopGravity * h; p.z += p._vz * h; if (p.z <= 0) { p.z = 0; p._vz = 0; } }
    p._stride += sp * h / c.strideLen;
    var coasting = p.onIce && sp > 70 && hyp(this._mx, this._my) < 0.05 && !this._target;
    if (this.state === 'dead' || p.hurt > 0) p.frame = 'hurt';
    else if (p.sliding || coasting) p.frame = 'slide';
    else if (p.cheer > 0 || this.state === 'cleared' && sp < c.idleSpeed) p.frame = 'cheer';
    else if (sp < c.idleSpeed) p.frame = 'idle';
    else p.frame = (Math.floor(p._stride) % 2) ? 'walk2' : 'walk1';
  };

  World.prototype._stepExit = function (h) {
    var p = this.pip, g = this.gate, tx = g.x + 6 - p.x, ty = g.y - p.y, d = hyp(tx, ty);
    if (p.dashT > 0) { p.dashT = 0; p.sliding = false; }
    if (d > 3) approach(p, tx / d * Math.min(110, d * 4), ty / d * Math.min(110, d * 4), 900, h);
    else approach(p, 0, 0, 900, h);
    p.x += p.vx * h; p.y += p.vy * h;
    if (p.cheer > 0) p.cheer = Math.max(0, p.cheer - h);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - h);
  };

  /* ---- bears ---- */
  World.prototype._stepBears = function (h, active) {
    var c = this.cfg, p = this.pip, info = this._info, i, j, b;
    var cap = this.bearCap();
    for (i = 0; i < this.bears.length; i++) {
      b = this.bears[i];
      if (b.spawnT < 1) { b.spawnT = Math.min(1, b.spawnT + h / c.bearSpawnTime); b.frame = '1'; b.mode = 'idle'; continue; }
      var ter = this.terrainAt(b.x, b.y);
      var mul = info.bearMul * (this.gate.open ? c.gateOpenBearMul : 1);
      var base = c.bearSpeed[b.kind] * mul;
      var dvx = 0, dvy = 0, sp;
      if (b._kb > 0) b._kb -= h;
      if (b.stun > 0) {
        b.stun = Math.max(0, b.stun - h); b.mode = 'stun';
      } else if (!active) {
        b.mode = 'idle';
      } else if (b.rest > 0) {
        b.rest = Math.max(0, b.rest - h); b.mode = 'rest';
        if (b.nap > 0) b.nap = Math.max(0, b.nap - h);
      } else if (b.kind === 'red') {
        b.mode = 'wander';
        var wx = b._wx - b.x, wy = b._wy - b.y, wd = hyp(wx, wy);
        if (wd < 12) {
          b._wait -= h;
          if (b._wait <= 0) this._pickWander(b);
        } else { sp = Math.min(base * 0.9, wd * 3); dvx = wx / wd * sp; dvy = wy / wd * sp; }
      } else if (b.kind === 'green') {
        b.mode = 'follow';
        // Sleepy follower (playtest addition #1): after chasing a while it naps — a clear "run now!" window for kids.
        b._chase = (b._chase || 0) + h;
        if (c.followNapAfter > 0 && b._chase > c.followNapAfter) {
          b._chase = 0; b.rest = b.nap = c.followNap; b.mode = 'rest';
          this._emit({ type: 'nap', id: b.id, x: b.x, y: b.y, time: c.followNap });
        }
        var dpx = p.x - b.x, dpy = p.y - b.y, dp = hyp(dpx, dpy);
        var t = dp < c.followDirect ? p : this._trail(info.followLag);
        var fx = t.x - b.x, fy = t.y - b.y, fd = hyp(fx, fy);
        if (fd > 4) { sp = Math.min(base, fd * 3); dvx = fx / fd * sp; dvy = fy / fd * sp; }
      } else { // orange guard
        if (b._cool > 0) b._cool -= h;
        var g = this._guardGem(b);
        var pd = g ? hyp(p.x - g.x, p.y - g.y) : 1e9;
        if (b.mode === 'charge') {
          b._chT += h;
          if (!g || pd > c.guardGiveUp || b._chT > c.guardChargeMax) { b.mode = 'orbit'; b._cool = c.guardCool; }
        } else if (g && pd < c.guardAggro && b._cool <= 0 && p.invuln <= 0) { b.mode = 'charge'; b._chT = 0; }
        else b.mode = g ? 'orbit' : 'wander';
        if (b.mode === 'charge') {
          var cx = p.x - b.x, cy = p.y - b.y, cd = hyp(cx, cy) || 1;
          sp = base * c.guardCharge; dvx = cx / cd * sp; dvy = cy / cd * sp;
        } else if (g) {
          // orbit: aim at a point ahead on the circle around the gem
          b._ang = Math.atan2(b.y - g.y, b.x - g.x) + b._orbitDir * 0.6;
          var ox = g.x + Math.cos(b._ang) * c.guardOrbitR - b.x, oy = g.y + Math.sin(b._ang) * c.guardOrbitR - b.y, od = hyp(ox, oy) || 1;
          sp = Math.min(base * 0.8, od * 3); dvx = ox / od * sp; dvy = oy / od * sp;
        } else {
          var ux = b._wx - b.x, uy = b._wy - b.y, ud = hyp(ux, uy);
          if (ud < 12) { b._wait -= h; if (b._wait <= 0) this._pickWander(b); }
          else { sp = Math.min(base * 0.7, ud * 3); dvx = ux / ud * sp; dvy = uy / ud * sp; }
        }
      }
      // separation (steering) from other bears
      for (j = 0; j < this.bears.length; j++) {
        if (j === i) continue;
        var o = this.bears[j], sx = b.x - o.x, sy = b.y - o.y, sd = hyp(sx, sy);
        if (sd < c.bearSepDist && sd > 1e-6) { var k = (c.bearSepDist - sd) / c.bearSepDist * 120; dvx += sx / sd * k; dvy += sy / sd * k; }
      }
      var lim = cap * ter.speedMul, dl = hyp(dvx, dvy);
      if (dl > lim) { dvx *= lim / dl; dvy *= lim / dl; }
      var acc = c.bearAccel * ter.fricMul;
      if (b.stun > 0) acc *= 0.5;
      approach(b, dvx, dvy, acc, h);
      this._puffForce(b, ter, h, 'bear');
      // hard cap: never faster than 0.75 × Pip's max speed (except a short knock-back, still < Pip)
      var vl = hyp(b.vx, b.vy), vmax = b._kb > 0 ? 0.95 * this.pipMaxSpeed(this.sizeMax) : lim;
      if (vl > vmax) { b.vx *= vmax / vl; b.vy *= vmax / vl; }
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.z > 0 || b._vz > 0) { b._vz -= c.hopGravity * h; b.z += b._vz * h; if (b.z <= 0) { b.z = 0; b._vz = 0; } }
      // visuals
      if (b.vx > c.facingHyst * 0.6) b.facing = 1; else if (b.vx < -c.facingHyst * 0.6) b.facing = -1;
      vl = hyp(b.vx, b.vy);
      b._stride += vl * h / 18;
      b.frame = b.stun > 0 ? 'stun' : (vl < 8 ? '1' : (Math.floor(b._stride) % 2 ? '2' : '1'));
    }
    // positional separation so bears never stack (after moving)
    for (i = 0; i < this.bears.length; i++) {
      b = this.bears[i];
      for (j = i + 1; j < this.bears.length; j++) {
        var q = this.bears[j], ex = q.x - b.x, ey = q.y - b.y, ed = hyp(ex, ey), mind = b.radius + q.radius;
        if (ed < mind) {
          if (ed < 1e-6) { ex = 1; ey = 0; ed = 1; }
          var push = (mind - ed) / 2;
          b.x -= ex / ed * push; b.y -= ey / ed * push; q.x += ex / ed * push; q.y += ey / ed * push;
        }
      }
      this._clampArena(b, b.radius);
    }
  };

  World.prototype._pickWander = function (b) {
    var c = this.cfg, a = this.arena, r = this.rng, p = this.pip;
    if (r.chance(c.wanderNearPip)) {
      b._wx = clamp(p.x + r.range(-c.wanderNearR, c.wanderNearR), a.x + 30, a.x + a.w - 30);
      b._wy = clamp(p.y + r.range(-c.wanderNearR, c.wanderNearR), a.y + 30, a.y + a.h - 20);
    } else {
      b._wx = r.range(a.x + 40, a.x + a.w - 40); b._wy = r.range(a.y + 30, a.y + a.h - 20);
    }
    b._wait = r.range(c.wanderPause[0], c.wanderPause[1]);
  };

  // nearest visible, non-loose gem to this guard (sticky while it exists)
  World.prototype._guardGem = function (b) {
    var i, g, best = null, bd = 1e9;
    for (i = 0; i < this.gems.length; i++) if (this.gems[i].id === b._gem && !this.gems[i].loose) return this.gems[i];
    for (i = 0; i < this.gems.length; i++) {
      g = this.gems[i];
      if (g.loose || g.appear < 0.3) continue;
      // two guards don't share a gem
      var taken = false;
      for (var j = 0; j < this.bears.length; j++) if (this.bears[j] !== b && this.bears[j]._gem === g.id) taken = true;
      if (taken) continue;
      var d = hyp(g.x - b.x, g.y - b.y);
      if (d < bd) { bd = d; best = g; }
    }
    b._gem = best ? best.id : -1;
    return best;
  };

  /* ---- gems ---- */
  World.prototype._stepGems = function (h, active) {
    var c = this.cfg, a = this.arena, i, g;
    for (i = this.gems.length - 1; i >= 0; i--) {
      g = this.gems[i];
      g._ph += c.gemBobFreq * TAU * h;
      g.bob = c.gemBobAmp * (0.5 + 0.5 * Math.sin(g._ph));
      if (g.appear < 1) g.appear = Math.min(1, g.appear + h / (g.loose ? c.looseTelegraph : c.gemTelegraph));
      if (g.loose) {
        var e = Math.exp(-c.looseDrag * h);
        g.vx *= e; g.vy *= e;
        g.x += g.vx * h; g.y += g.vy * h;
        var r = c.gemRadius;
        if (g.x < a.x + r) { g.x = a.x + r; g.vx = Math.abs(g.vx) * c.looseBounce; }
        else if (g.x > a.x + a.w - r) { g.x = a.x + a.w - r; g.vx = -Math.abs(g.vx) * c.looseBounce; }
        if (g.y < a.y + r) { g.y = a.y + r; g.vy = Math.abs(g.vy) * c.looseBounce; }
        else if (g.y > a.y + a.h - r * 0.5) { g.y = a.y + a.h - r * 0.5; g.vy = -Math.abs(g.vy) * c.looseBounce; }
      }
      if (active || this.state === 'ready') {
        if (this.state === 'playing' || g.loose) g.life -= h;
        if (g.life <= 0) {
          this.gems.splice(i, 1);
          this._emit({ type: 'gemgone', id: g.id, x: g.x, y: g.y, loose: g.loose });
        }
      }
    }
    if (!active || this.gate.open) return;
    var have = 0;
    for (i = 0; i < this.gems.length; i++) if (!this.gems[i].loose) have++;
    if (have < this.gemsWanted) {
      this._gemTimer += h;
      if (this._gemTimer >= c.gemRespawn) { this._gemTimer = 0; this._spawnGem(); }
    } else this._gemTimer = 0;
  };

  /* ---- collisions & rules ---- */
  World.prototype._collide = function () {
    var c = this.cfg, p = this.pip, i;
    // gems
    for (i = this.gems.length - 1; i >= 0; i--) {
      var g = this.gems[i];
      if (g.appear < 1) continue;
      if (hyp(g.x - p.x, g.y - p.y) < p.radius + c.gemRadius) {
        this.gems.splice(i, 1);
        this._collectGem(g);
      }
    }
    if (this.state !== 'playing') return;
    // bears
    if (p.invuln > 0) return;
    for (i = 0; i < this.bears.length; i++) {
      var b = this.bears[i];
      if (b.spawnT < 1 || b.stun > 0) continue;
      var dx = p.x - b.x, dy = p.y - b.y, d = hyp(dx, dy);
      if (d < p.radius + b.radius * c.hitForgive) { this._bump(b, dx, dy, d); break; }
    }
  };

  World.prototype._collectGem = function (g) {
    var c = this.cfg, p = this.pip, s = this.size, pts = c.gemPointsPerSize * s;
    this.score += pts;
    this.gemsTotal++;
    if (!this.gate.open) this.jar = Math.min(this.jarTarget, this.jar + 1);
    this._emit({ type: 'gem', x: g.x, y: g.y, points: pts, size: s, color: g.color, loose: g.loose, id: g.id });
    if (this.size < this.sizeMax) {
      this.size++;
      p.radius = this.pipRadiusFor(this.size);
      this._squash(c.squashGrow);
      this._emit({ type: 'grow', size: this.size });
      if (this.size === this.sizeMax) { this._emit({ type: 'maxsize' }); p.cheer = c.cheerTime * 0.6; }
    }
    if (!this.gate.open && this.jar >= this.jarTarget) {
      this.gate.open = true;
      p.cheer = c.cheerTime * 1.25;
      this._emit({ type: 'jarfull' });
      this._emit({ type: 'gateopen', x: this.gate.x, y: this.gate.y });
    }
  };

  World.prototype._bump = function (b, dx, dy, d) {
    var c = this.cfg, p = this.pip, r = this.rng;
    if (d < 1e-6) { dx = -p.facing; dy = 0; d = 1; }
    var ux = dx / d, uy = dy / d;
    this.hearts--;
    this.bumps++;
    p.invuln = c.invulnTime; p.hurt = c.hurtTime;
    p.dashT = 0; p.sliding = false;
    p.vx = ux * c.knockPip; p.vy = uy * c.knockPip;
    b.vx = -ux * c.knockBear; b.vy = -uy * c.knockBear; b._kb = 0.35; b.rest = c.bearRestTime;
    this._squash(c.squashBump);
    this._emit({ type: 'bump', x: p.x, y: p.y, hearts: this.hearts, bear: b.id, kind: b.kind });
    if (this.size > 1) { this.size--; p.radius = this.pipRadiusFor(this.size); this._emit({ type: 'shrink', size: this.size }); }
    // drop gems (taken out of the jar; while the gate is open the jar is locked, the drops are just points)
    var n = this.gate.open ? c.dropGems : Math.min(c.dropGems, this.jar);
    if (!this.gate.open) this.jar -= n;
    for (var k = 0; k < n; k++) {
      var ang = Math.atan2(uy, ux) + r.range(-1.1, 1.1), spd = r.range(c.looseSpeed[0], c.looseSpeed[1]);
      this.gems.push({
        id: this._nextId++, color: GEM_COLORS[r.int(0, 3)], x: p.x, y: p.y, _px: p.x, _py: p.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, appear: 0, loose: true, life: c.looseLife, bob: 0, _ph: r.range(0, TAU)
      });
    }
    if (n > 0) this._emit({ type: 'drop', x: p.x, y: p.y, n: n });
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.state = 'dead'; this._stateT = 0;
      this._emit({ type: 'dead', score: this.score, level: this.level });
    }
  };

  World.prototype._stepGate = function (h) {
    var c = this.cfg, g = this.gate, p = this.pip;
    if (!g.open) return;
    g.t = Math.min(1, g.t + h / c.gateOpenTime);
    if (this.state === 'playing' && hyp(p.x - g.x, p.y - g.y) < c.gateRadius + p.radius * 0.5) {
      var bonus = this.hearts * c.clearBonusPerHeart;
      this.score += bonus;
      this.levelsCleared++;
      this.state = 'cleared'; this._stateT = 0;
      p.cheer = c.clearTime;
      this._emit({ type: 'cleared', bonus: bonus, level: this.level });
      if (c.healOnClear > 0 && this.hearts < this.heartsMax) {
        this.hearts = Math.min(this.heartsMax, this.hearts + c.healOnClear);
        this._emit({ type: 'heal', hearts: this.hearts });
      }
    }
  };

  /** Compact snapshot for debug / tests. */
  World.prototype.snapshot = function () {
    return {
      state: this.state, level: this.level, biome: this.biome, lap: this.lap, score: this.score, hearts: this.hearts,
      size: this.size, jar: this.jar, jarTarget: this.jarTarget, gems: this.gems.length, bears: this.bears.length,
      pip: { x: +this.pip.x.toFixed(2), y: +this.pip.y.toFixed(2) }, time: +this.time.toFixed(3)
    };
  };

  CD.CONFIG = CONFIG;
  /* v1.1 tuning from docs/reports/playtest_report.md (package "final"): stops bump chains, gentler follower and guard,
   * kinder contact, one new bear kind per biome, longer biomes, Pop rewards popping next to bears. */
  Object.assign(CONFIG, {
    bearRestTime: 2.5, followLag: 1.2, followDirect: 40,
    guardAggro: 80, guardCharge: 1.0, guardChargeMax: 0.9, guardCool: 2.0, guardOrbitR: 75,
    hitForgive: 0.70, bearCapFrac: 0.65, popBase: 30, popPerBear: 30,
    // Normal is the base config
    invulnTime: 2.0, bearSpeedMul: 0.75, bearCounts: [1, 2, 2, 3], healOnClear: 2, jarTargets: [18, 23, 27, 30],
    followNapAfter: 6, followNap: 2.5   // sleepy follower
  });
  DIFFICULTY.normal = {};
  Object.assign(DIFFICULTY.easy, { bearRestTime: 3.0, followLag: 1.4, guardAggro: 70, invulnTime: 2.5, bearSpeedMul: 0.6, healOnClear: 2,
    bearCounts: [1, 2, 2, 3], jarTargets: [12, 15, 18, 21], hitForgive: 0.6, bearLapMul: 0.22, followNapAfter: 5, followNap: 3 });
  Object.assign(DIFFICULTY.hard, { guardAggro: 100, guardCharge: 1.15, jarTargets: [20, 23, 29, 33], followNapAfter: 9, followNap: 1.5 });
  CD.DIFFICULTY = DIFFICULTY;
  CD.World = World;
})(window.CD = window.CD || {});
