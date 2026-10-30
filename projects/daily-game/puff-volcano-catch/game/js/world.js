/* Puff's Volcano Catch — VC.CONFIG + VC.DIFFICULTY + VC.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 canvas), seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s)
 *  with an accumulator (w._acc = leftover time, 0..step). Results depend only on
 *  the seed and on the sub-step index at which setMove/setTarget/action are called.
 *
 *  Render interpolation: at the START of every sub-step the previous position is
 *  saved as `_px,_py` on puff and on every item.
 *  Renderer: drawX = _px + (x - _px) * (w._acc / w.cfg.step).
 *
 *  Drawing (DESIGN §2):
 *   - Puff:   body centre (puff.x, puff.y) — y already includes the 2 px bob.
 *             ctx.rotate(puff.tilt): POSITIVE tilt = clockwise = leaning RIGHT, so
 *             Puff leans into its motion (tilt eases toward +vx·k, see docs/MECHANICS.md).
 *             squash 0..1: scaleX ×(1 + 0.18·squash), scaleY ×(1 − 0.18·squash).
 *   - Basket: rim centre (rimX, rimY + puff.bob); hang it from Puff's rope points,
 *             rotated by puff.swing (pendulum angle, + = basket swung to the right).
 *             rimY (446) is the fixed catch line; the bob is cosmetic.
 *   - Items:  centre (x, y), radius r; coins: scaleX = cos(spin) (flip), rocks: rotate(rot).
 *             'caught' items sit inside the basket (draw them before basket_front.svg).
 *
 *  Arcs: every launched item gets a SOLVED target: it crosses the catch line
 *  (y = rimY) exactly at x = item.tx at world time item.tCross. Integration is the
 *  exact ballistic step (x += vx·h, y += vy·h + ½g·h², vy += g·h), so the crossing
 *  matches the solution to floating-point precision.
 * ========================================================================
 */
(function (VC) {
  'use strict';

  /* All tunables. Override per-world with new VC.World({ config: {...} }). */
  var CONFIG = {
    // --- screen / timing
    width: 960, height: 540,
    step: 1 / 120,                 // s, fixed simulation sub-step (render interpolates)
    introDelay: 1.4,               // s, 'ready' zone banner, no eruptions (Puff may already move)
    clearTime: 2.2,                // s, 'cleared' celebration before the next zone
    firstEruptDelay: 0.5,          // s after 'go' before the first rumble starts (then rumble 0.5–0.7 s)

    // --- scene geometry (DESIGN §2)
    crater: { x: 480, y: 210 },    // eruption origin (same for every zone / custom backgrounds)
    groundY: 492,                  // px, ground line where items land
    puffY: 392,                    // px, Puff body centre (before the 2 px bob)
    xMin: 70, xMax: 890,           // px, Puff x clamp
    rimY: 446,                     // px, basket rim = catch line
    catchHalfW: 38,                // px, catch half-width (+ item r × catchRFrac) — generous for kids
    catchRFrac: 0.5,
    targetMin: 90, targetMax: 870, // px, range of solved landing x (always under Puff's reach: 70..890 ± 38)

    // --- Puff movement
    maxSpeed: 400,                 // px/s (crosses the whole shore in ~2.1 s)
    accel: 2400,                   // px/s² toward input × maxSpeed (0 → max in 0.17 s: responsive but floaty)
    brake: 3000,                   // px/s² with no input (stops from max in 0.13 s, ≈ 27 px drift)
    followOmega: 13,               // rad/s, pointer-follow critically damped spring (ζ = 1)
    followAccel: 4200,             // px/s², |a| cap of the spring (from max speed stops in ≈ 19 px)
    arriveStop: 3,                 // px, pointer-follow "arrived" dead zone
    tiltK: 0.28 / 400,             // rad per px/s: tilt target = +vx·k (lean into motion)
    tiltMax: 0.28,                 // rad
    tiltRate: 7,                   // 1/s, exponential easing of the tilt (≈ 0.14 s half-life)
    bobAmp: 2, bobFreq: 0.6,       // px, Hz (render only; NOT used for catching)
    // basket = pendulum hanging from Puff in Puff's accelerating frame:
    //   θ'' = −(swingG/L)·sinθ − (swingDrive·a/L)·cosθ − swingDamp·θ'
    ropeLen: 50,                   // px, L
    swingG: 1400,                  // px/s², effective gravity of the basket → f = √(g/L)/2π ≈ 0.84 Hz
    swingDrive: 0.3,               // fraction of Puff's acceleration felt (ropes are springy) — keeps hard
                                   //  starts (2400 px/s²) at ≈ 0.48 rad → clamped, small taps swing freely
    swingDamp: 3.2,                // 1/s, ζ ≈ 0.3: two or three visible swings, settles in ~1 s
    swingMax: 0.35,                // rad, clamp (rimX moves ≤ 17 px)
    squashCatch: 0.6, squashOuch: 1, squashDecay: 8,   // 0..1 squish, exp decay 1/s
    happyTime: 0.45, ouchTime: 0.7,                   // s, face frames

    // --- hearts
    heartsMax: 3,
    invulnTime: 1.2,               // s after a rock: rocks caught now fizzle harmlessly
    healOnClear: 1,                // hearts back on a zone clear (after the bonus is counted)…
    healLaps: 2,                   // …only during the first 2 laps (later laps are the endless challenge)
    clearBonusPerHeart: 100,

    // --- items
    gravity: 520,                  // px/s² at speed ×1 (gEff = g·speed², so arcs keep their shape and just play faster)
    coinR: { copper: 14, silver: 15, gold: 17 },     // px (drawn 28/30/34)
    coinValue: { copper: 1, silver: 2, gold: 5 },
    rockR: 17,                     // px (drawn 34)
    goldChance: 0.06, silverChance: 0.25,           // of coins
    coinRestitution: 0.35,         // one bounce on the sand, then rest
    coinGroundFric: 0.5,           // vx × on the bounce (sand grabs)
    rockRestitution: 0.12,         // a dull thud
    fadeTime: 0.6,                 // s, coin fades after it settles
    fizzleTime: 0.8,               // s, rock fizzles out on the ground
    caughtTime: 0.25, caughtDrop: 14,                 // s, px: drop into the basket
    steamTime: 0.7, steamRise: 55, // s, px/s
    coinSpin: [6, 10],             // rad/s of the flip phase (≈ 1–1.6 flips/s)
    rockSpin: [2, 4.5],            // rad/s tumble (random sign)
    launchJitter: 10,              // px, horizontal spread of the launch points in the crater mouth

    // --- eruptions (index = zone 0 beach, 1 jungle, 2 ash, 3 crater)
    rumbleTime: [0.5, 0.7],        // s, telegraph before each burst
    burstInterval: [3.0, 2.7, 2.5, 2.3],   // s between launches at lap 0
    intervalLap: 0.08,             // −8 % per lap
    intervalMin: 1.3,
    burstWeights: [                // P(1 item), P(2), P(3)
      [0.8, 0.2, 0], [0.6, 0.35, 0.05], [0.45, 0.42, 0.13], [0.35, 0.45, 0.2]
    ],
    apex: [[150, 210], [135, 200], [125, 190], [115, 180]],   // px above the crater
    speedMul: 1,                   // difficulty multiplier on flight speed
    zoneSpeed: [1, 1.06, 1.12, 1.18],
    lapSpeed: 0.08, speedCap: 1.45,
    rockChance: [0.06, 0.14, 0.22, 0.28],
    rockLap: 0.04, rockCap: 0.4,
    rockDelay: 20,                 // s, no rocks on the beach of lap 0 before this
    maxPerBurst: 3,
    // fairness
    fairSpeed: 250,                // px/s a reasonably fast player sustains (62 % of maxSpeed)
    fairSlack: 40,                 // px, ≈ catch half-width: you don't need to be centred
    rockCoinDt: 0.6, rockCoinDx: 110,  // a rock never crosses within 110 px of a coin within 0.6 s
    rockAim: 0.45,                 // chance a rock aims near Puff (±160 px) — a threat to read, never a trap
    // endless laps get busier so every run ends (lap 0 is never affected)
    rockCoinDxLap: 40,             // px less rock–coin keep-out per lap (lap 2: 30 px → a rock can share a coin's spot)
    rockAimCoinLap: 0.2,           // per lap ≥ 2: chance a rock shadows a coin (Cool Rain or let the coin go), cap 0.45
    lapBurst: 0.1,                 // per lap: P(1 item) −0.1, P(3 items) +0.1 (P(1) ≥ 0.1)
    fairTries: 24,

    // --- scoring / levels
    pouchTargets: [20, 25, 30, 35],   // coins to fill the pouch per zone
    pouchLap: 0,                   // + fraction per lap (0 = same pouch every lap)
    coinPoints: 10,                // × value × mult
    multThresholds: [0, 5, 12, 22, 35],   // combo needed for ×1..×5
    steamPoints: 5,

    // --- Cool Rain
    rainTime: 1.2,                 // s
    rainWidth: 130,                // px, column centred on Puff (follows Puff)
    rainRecharge: 7                // s to refill after the rain ends
  };

  /* Difficulty presets: overrides merged over CONFIG. */
  var DIFFICULTY = {
    easy: {
      heartsMax: 5, invulnTime: 1.6, rainRecharge: 5, healLaps: 4,
      pouchTargets: [16, 20, 24, 28],
      speedMul: 0.75,                       // playtest: slower, floatier arcs (4-year-old zone 1: 95 s → 65 s)
      apex: [[125, 175], [115, 170], [110, 165], [105, 160]],      // lower (and slower) eruptions
      burstInterval: [3.0, 2.8, 2.6, 2.4],
      burstWeights: [[0.85, 0.15, 0], [0.7, 0.3, 0], [0.55, 0.4, 0.05], [0.45, 0.45, 0.1]],
      rockChance: [0.03, 0.08, 0.12, 0.16], rockCap: 0.3,   // playtest: fewer rocks offset the wider basket
      catchHalfW: 44,                       // playtest: wider basket for 3–5 year olds
      multThresholds: [0, 3, 7, 12, 20],    // playtest: ×2 after 3 catches so little kids feel the combo
      fairSpeed: 130
    },
    normal: {},
    hard: {
      speedMul: 1.1, invulnTime: 1.0, healOnClear: 0, rainRecharge: 8,
      pouchTargets: [24, 30, 35, 40],
      burstInterval: [2.6, 2.4, 2.2, 2.0],
      burstWeights: [[0.6, 0.35, 0.05], [0.45, 0.4, 0.15], [0.35, 0.45, 0.2], [0.25, 0.45, 0.3]],
      rockChance: [0.1, 0.2, 0.28, 0.34], rockDelay: 8,
      fairSpeed: 290
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

  function lapWeights(wts, d) {
    var s = Math.min(d, Math.max(0, wts[0] - 0.1));
    return [wts[0] - s, wts[1], wts[2] + s];
  }

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

  /** reset([seed]) — new game: level 0 (beach), score 0, full hearts, state 'ready'. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new VC.RNG(this.seed);
    this.time = 0;
    this.steps = 0;
    this.score = 0;
    this.heartsMax = c.heartsMax;
    this.hearts = c.heartsMax;
    this.combo = 0; this.mult = 1; this.bestCombo = 0;
    this.coinsTotal = 0; this.rocksCaught = 0; this.steamed = 0; this.missed = 0;
    this.rains = 0; this.levelsCleared = 0; this.launched = 0; this.coinsLaunched = 0;
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this._mx = 0; this._target = null;
    var x = (c.xMin + c.xMax) / 2;
    this.puff = {
      x: x, y: c.puffY, vx: 0, ax: 0, tilt: 0, bob: 0, swing: 0, swingV: 0,
      rimX: x, rimY: c.rimY, frame: 'idle', invuln: 0, squash: 0,
      happy: 0, ouch: 0, _px: x, _py: c.puffY
    };
    this.rain = { charge: 1, active: 0, x: x, w: c.rainWidth };
    this.volcano = { rumble: 0, glow: 0.2, shake: 0 };
    this._emit({ type: 'start' });
    this.startLevel(0);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /* ------------------------------ level setup ------------------------------ */
  /** Numbers for level i (also handy for the UI / tests / sim). */
  World.prototype.levelInfo = function (i) {
    var c = this.cfg, z = i % 4, lap = Math.floor(i / 4);
    return {
      zone: z, lap: lap,
      pouchTarget: Math.round(c.pouchTargets[z] * (1 + c.pouchLap * lap)),
      interval: Math.max(c.intervalMin, c.burstInterval[z] * (1 - c.intervalLap * lap)),
      speed: Math.min(c.speedCap, c.speedMul * c.zoneSpeed[z] * (1 + c.lapSpeed * lap)),
      rockChance: Math.min(c.rockCap, c.rockChance[z] + c.rockLap * lap),
      rockDelay: (z === 0 && lap === 0) ? c.rockDelay : 0,
      weights: lapWeights(c.burstWeights[z], c.lapBurst * lap), apex: c.apex[z],
      rockCoinDx: Math.max(0, c.rockCoinDx - c.rockCoinDxLap * lap),
      rockAimCoin: lap >= 2 ? Math.min(0.45, c.rockAimCoinLap * (lap - 1)) : 0
    };
  };

  /** startLevel(i): zone = i % 4, lap = floor(i / 4); clears items, keeps score/hearts/combo. */
  World.prototype.startLevel = function (i) {
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i), c = this.cfg;
    this.level = i;
    this.zone = info.zone;
    this.lap = info.lap;
    this.levelTime = 0;
    this.pouch = 0;
    this.pouchTarget = info.pouchTarget;
    this._info = info;
    this.gEff = c.gravity * info.speed * info.speed;
    this.items = [];
    this.rain.charge = 1; this.rain.active = 0;
    this.volcano.rumble = 0; this.volcano.shake = 0;
    this._rumbling = false; this._plan = null; this._kick = 0; this._nextRumble = null;
    this._nextLaunch = 1e9;          // armed on 'go'
    this.state = 'ready';
    this._stateT = 0;
    this._emit({ type: 'zone', zone: this.zone, level: i, lap: this.lap });
    return this;
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.setMove = function (mx) { mx = +mx || 0; this._mx = clamp(mx, -1, 1); };
  World.prototype.setTarget = function (x) {
    if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) { this._target = null; return; }
    this._target = +x;
  };
  /** Cool Rain if charged. Returns true when the rain starts. */
  World.prototype.action = function () {
    if (this.state !== 'playing' || this.rain.charge < 1 || this.rain.active > 0) return false;
    var c = this.cfg;
    this.rain.charge = 0; this.rain.active = c.rainTime; this.rain.x = this.puff.x;
    this.rains++;
    this._emit({ type: 'rain', x: this.puff.x });
    return true;
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
    var c = this.cfg, p = this.puff, i;
    p._px = p.x; p._py = p.y;
    for (i = 0; i < this.items.length; i++) { this.items[i]._px = this.items[i].x; this.items[i]._py = this.items[i].y; }
    this.time += h; this.levelTime += h; this._stateT += h; this.steps++;

    var st = this.state;
    this._stepPuff(h, st !== 'dead');
    if (st === 'ready') {
      if (this._stateT >= c.introDelay) {
        this.state = 'playing'; this._stateT = 0;
        this._nextLaunch = c.firstEruptDelay + this._rumbleDur();
        this._emit({ type: 'go', level: this.level });
      }
    } else if (st === 'playing') {
      this._stepVolcano(h, true);
      this._stepRain(h);
    } else if (st === 'cleared') {
      this._stepVolcano(h, false);
      this._stepRain(h);
    } else this._stepVolcano(h, false);
    this._stepItems(h);
    this._stepPuffVisual(h);
    if (this.state === 'cleared' && this._stateT >= c.clearTime) this.startLevel(this.level + 1);
  };

  /* ---- Puff ---- */
  World.prototype._stepPuff = function (h, control) {
    var c = this.cfg, p = this.puff, vx0 = p.vx, a = 0;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - h);
    if (p.happy > 0) p.happy = Math.max(0, p.happy - h);
    if (p.ouch > 0) p.ouch = Math.max(0, p.ouch - h);
    if (control && Math.abs(this._mx) > 0.05) {
      var want = this._mx * c.maxSpeed, d = want - p.vx, rate = (want * p.vx < 0 || Math.abs(want) < Math.abs(p.vx)) ? Math.max(c.accel, c.brake) : c.accel;
      a = clamp(d / h, -rate, rate);
    } else if (control && this._target !== null) {
      var tx = clamp(this._target, c.xMin, c.xMax), dx = tx - p.x;
      if (Math.abs(dx) < c.arriveStop && Math.abs(p.vx) < 25) a = clamp(-p.vx / h, -c.brake, c.brake);
      else {
        // critically damped spring (ζ = 1): never overshoots from rest; |a| and |v| capped
        var w = c.followOmega;
        a = clamp(w * w * dx - 2 * w * p.vx, -c.followAccel, c.followAccel);
      }
    } else {
      a = clamp(-p.vx / h, -c.brake, c.brake);
    }
    p.vx = clamp(p.vx + a * h, -c.maxSpeed, c.maxSpeed);
    p.x += p.vx * h;
    if (p.x < c.xMin) { p.x = c.xMin; if (p.vx < 0) p.vx = 0; }
    else if (p.x > c.xMax) { p.x = c.xMax; if (p.vx > 0) p.vx = 0; }
    p.ax = (p.vx - vx0) / h;            // actual acceleration (after caps / walls)
    // basket pendulum in Puff's accelerating frame (semi-implicit Euler, stable at h = 1/120)
    var L = c.ropeLen, th = p.swing;
    var acc = -(c.swingG / L) * Math.sin(th) - (c.swingDrive * p.ax / L) * Math.cos(th) - c.swingDamp * p.swingV;
    p.swingV += acc * h;
    th += p.swingV * h;
    if (th > c.swingMax) { th = c.swingMax; if (p.swingV > 0) p.swingV *= -0.3; }
    else if (th < -c.swingMax) { th = -c.swingMax; if (p.swingV < 0) p.swingV *= -0.3; }
    p.swing = th;
    p.rimX = p.x + Math.sin(th) * L;
    p.rimY = c.rimY;
    if (this.rain.active > 0) this.rain.x = p.x;
  };

  World.prototype._stepPuffVisual = function (h) {
    var c = this.cfg, p = this.puff;
    var tt = clamp(p.vx * c.tiltK, -c.tiltMax, c.tiltMax);
    p.tilt += (tt - p.tilt) * (1 - Math.exp(-c.tiltRate * h));
    p.bob = c.bobAmp * Math.sin(TAU * c.bobFreq * this.time);
    p.y = c.puffY + p.bob;
    p.squash *= Math.exp(-c.squashDecay * h);
    if (p.squash < 1e-3) p.squash = 0;
    if (this.state === 'dead' || p.ouch > 0) p.frame = 'ouch';
    else if (this.rain.active > 0) p.frame = 'blow';
    else if (p.happy > 0 || this.state === 'cleared') p.frame = 'happy';
    else p.frame = 'idle';
    if (this.rain.active <= 0) this.rain.x = p.x;
  };

  /* ---- volcano: rumble telegraph → burst ---- */
  World.prototype._stepVolcano = function (h, active) {
    var c = this.cfg, v = this.volcano, r = this.rng;
    this._kick *= Math.exp(-5 * h);
    if (active) {
      this._nextLaunch -= h;
      if (!this._rumbling && this._nextLaunch <= this._rumbleDur()) {
        // plan the burst now (count + kinds), aim at launch time with fresh positions
        this._rumbling = true;
        this._rumbleLen = Math.max(this._nextLaunch, 0.05);
        var info = this._info, wts = info.weights, u = r.next(), n = 1;
        if (u >= wts[0]) n = (u < wts[0] + wts[1]) ? 2 : 3;
        n = Math.min(n, c.maxPerBurst);
        var kinds = [], rc = this.levelTime >= info.rockDelay ? info.rockChance : 0, coins = 0;
        for (var k = 0; k < n; k++) {
          var rock = r.chance(rc);
          if (rock && k === n - 1 && coins === 0 && n > 1) rock = false;   // multi-bursts always carry a coin
          if (!rock) coins++;
          kinds.push(rock ? 'rock' : this._pickMetal());
        }
        this._plan = kinds;
        this._emit({ type: 'rumble', n: n, time: this._rumbleLen });
      }
      if (this._rumbling) {
        var prog = clamp(1 - this._nextLaunch / this._rumbleLen, 0, 1);
        v.rumble = prog * prog * (3 - 2 * prog);          // smoothstep build-up
        if (this._nextLaunch <= 0) {
          this._launch(this._plan);
          this._rumbling = false; this._plan = null;
          this._nextLaunch += this._info.interval;
          this._nextRumble = null;
        }
      } else v.rumble = Math.max(0, v.rumble - h / 0.25);
    } else {
      this._rumbling = false; this._plan = null;
      v.rumble = Math.max(0, v.rumble - h / 0.25);
    }
    v.glow = clamp(0.2 + 0.55 * v.rumble + this._kick, 0, 1);
    v.shake = v.rumble * 4 + this._kick * 5;
  };

  // rumble duration of the NEXT burst, drawn once per burst (deterministic)
  World.prototype._rumbleDur = function () {
    if (this._nextRumble === null || this._nextRumble === undefined) {
      var c = this.cfg; this._nextRumble = this.rng.range(c.rumbleTime[0], c.rumbleTime[1]);
    }
    return this._nextRumble;
  };

  World.prototype._pickMetal = function () {
    var c = this.cfg, u = this.rng.next();
    return u < c.goldChance ? 'gold' : u < c.goldChance + c.silverChance ? 'silver' : 'copper';
  };

  /** Flight solution from the crater to cross y = rimY at x = tx with apex height H (px above the crater). */
  World.prototype.solveArc = function (tx, H, g) {
    var c = this.cfg, cx = c.crater.x, cy = c.crater.y;
    g = g || this.gEff;
    var vy = -Math.sqrt(2 * g * H), ta = Math.sqrt(2 * H / g), tf = Math.sqrt(2 * (c.rimY - cy + H) / g), T = ta + tf;
    return { vx: (tx - cx) / T, vy: vy, T: T, ta: ta };
  };

  // pick a fair target for one item; `plan` = coin crossings already promised [{x,t}], `rocks` = rock crossings
  World.prototype._aim = function (isRock, plan, rocks, info) {
    var c = this.cfg, r = this.rng, p = this.puff, best = null, bestV = 1e9;
    var now = this.time, fs = c.fairSpeed, dxKeep = info.rockCoinDx;
    var shadow = isRock && plan.length && info.rockAimCoin > 0 && r.chance(info.rockAimCoin) ? plan[plan.length - 1] : null;
    for (var k = 0; k < c.fairTries; k++) {
      var tx;
      if (shadow) tx = clamp(shadow.x + r.range(-40, 40), c.targetMin, c.targetMax);
      else if (isRock && r.chance(c.rockAim)) tx = clamp(p.x + r.range(-160, 160), c.targetMin, c.targetMax);
      else tx = r.range(c.targetMin, c.targetMax);
      var H = r.range(info.apex[0], info.apex[1]);
      var s = this.solveArc(tx, H), t = now + s.T, viol = 0, j, d;
      if (!isRock) {
        // reachable from Puff now, and chainable with every promised coin
        viol += Math.max(0, Math.abs(tx - p.x) - c.fairSlack - fs * s.T);
        for (j = 0; j < plan.length; j++) viol += Math.max(0, Math.abs(tx - plan[j].x) - c.fairSlack - fs * Math.abs(t - plan[j].t));
        for (j = 0; j < rocks.length; j++) {
          d = Math.abs(tx - rocks[j].x);
          if (Math.abs(t - rocks[j].t) < c.rockCoinDt && d < dxKeep) viol += dxKeep - d;
        }
      } else {
        if (shadow) viol += Math.max(0, Math.abs(t - shadow.t) - 0.25) * 100;   // arrive together with its coin
        for (j = 0; j < plan.length; j++) {
          d = Math.abs(tx - plan[j].x);
          if (Math.abs(t - plan[j].t) < c.rockCoinDt && d < dxKeep) viol += dxKeep - d;
        }
      }
      if (viol < bestV) { bestV = viol; best = { tx: tx, H: H, s: s, t: t }; if (viol <= 0) break; }
    }
    best.viol = bestV;
    return best;
  };

  World.prototype._launch = function (kinds) {
    var c = this.cfg, r = this.rng, info = this._info, i, it;
    var plan = [], rocks = [];
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state !== 'fly' || it.tCross <= this.time) continue;
      (it.kind === 'coin' ? plan : rocks).push({ x: it.tx, t: it.tCross });
    }
    // coins first (they carry the fairness promise), then rocks around them
    var order = kinds.slice().sort(function (a, b) { return (a === 'rock') - (b === 'rock'); });
    for (i = 0; i < order.length; i++) {
      var isRock = order[i] === 'rock', aim = this._aim(isRock, plan, rocks, info);
      var x0 = c.crater.x + r.range(-c.launchJitter, c.launchJitter);
      // re-solve from the jittered mouth so the crossing still lands on tx
      var s = this.solveArc(aim.tx - (x0 - c.crater.x), aim.H);
      it = {
        id: this._nextId++, kind: isRock ? 'rock' : 'coin', metal: isRock ? null : order[i],
        value: isRock ? 0 : c.coinValue[order[i]],
        x: x0, y: c.crater.y, vx: s.vx, vy: s.vy, _px: x0, _py: c.crater.y,
        rot: r.range(0, TAU), spin: r.range(0, TAU), r: isRock ? c.rockR : c.coinR[order[i]],
        state: 'fly', t: 0, alpha: 1,
        tx: aim.tx, tCross: this.time + s.T, apexY: c.crater.y - aim.H, fair: aim.viol <= 0,
        variant: isRock ? r.int(0, 1) : 0,
        _w: isRock ? r.range(c.rockSpin[0], c.rockSpin[1]) * r.sign() : r.range(c.coinSpin[0], c.coinSpin[1]) * info.speed,
        _bounces: 0, _off: 0
      };
      this.items.push(it);
      (isRock ? rocks : plan).push({ x: it.tx, t: it.tCross });
      this.launched++; if (!isRock) this.coinsLaunched++;
    }
    this._kick = 1;
    this._emit({ type: 'erupt', x: c.crater.x, y: c.crater.y, n: kinds.length });
  };

  /* ---- items ---- */
  World.prototype._stepItems = function (h) {
    var c = this.cfg, p = this.puff, g = this.gEff, i, it;
    var canCatch = this.state === 'playing' || this.state === 'cleared';
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      it.t += h;
      if (it.state === 'fly') {
        var x0 = it.x, y0 = it.y;
        it.x += it.vx * h; it.y += it.vy * h + 0.5 * g * h * h; it.vy += g * h;
        if (it.kind === 'coin') it.spin += it._w * h; else it.rot += it._w * h;
        // catch: moving down and crossing the rim line this sub-step
        if (canCatch && it.vy > 0 && y0 < c.rimY && it.y >= c.rimY) {
          var f = (c.rimY - y0) / (it.y - y0), cx = x0 + (it.x - x0) * f;
          if (Math.abs(cx - p.rimX) <= c.catchHalfW + it.r * c.catchRFrac) { this._caught(it, cx); continue; }
        }
        var gy = c.groundY - it.r * 0.6;
        if (it.y >= gy) this._hitGround(it, gy);
      } else if (it.state === 'ground') {
        if (it._bounces === 1 && it._rest === undefined) {
          // airborne after the single coin bounce
          it.x += it.vx * h; it.y += it.vy * h + 0.5 * g * h * h; it.vy += g * h; it.spin += it._w * h;
          var gy2 = c.groundY - it.r * 0.6;
          if (it.y >= gy2) { it.y = gy2; it.vy = 0; it._rest = 0; it.t = 0; }
        } else {
          it.vx *= Math.exp(-6 * h); it.x += it.vx * h;
          it._w *= Math.exp(-5 * h);
          if (it.kind === 'coin') it.spin += it._w * h; else it.rot += it._w * h;
          var life = it.kind === 'coin' ? c.fadeTime : c.fizzleTime;
          it.alpha = clamp(1 - it.t / life, 0, 1);
          if (it.alpha <= 0) { this.items.splice(i, 1); continue; }
        }
      } else if (it.state === 'caught') {
        var u = clamp(it.t / c.caughtTime, 0, 1);
        it.x = p.rimX + it._off; it.y = c.rimY + c.caughtDrop * u * u;
        it.spin += it._w * h * (1 - u);
        it.alpha = 1;
        if (it.t >= c.caughtTime) { this.items.splice(i, 1); continue; }
      } else if (it.state === 'steam') {
        it.vx *= Math.exp(-3 * h); it.x += it.vx * h; it.y -= c.steamRise * h;
        it.alpha = clamp(1 - it.t / c.steamTime, 0, 1);
        if (it.alpha <= 0) { this.items.splice(i, 1); continue; }
      }
    }
    // Cool Rain: rocks in flight inside the column and above Puff turn to steam
    if (this.rain.active > 0) {
      var rx = this.rain.x, hw = this.rain.w / 2;
      for (i = 0; i < this.items.length; i++) {
        it = this.items[i];
        if (it.kind === 'rock' && it.state === 'fly' && Math.abs(it.x - rx) <= hw + it.r * 0.5 && it.y < p.y) this._steam(it, c.steamPoints);
      }
    }
  };

  World.prototype._caught = function (it, cx) {
    var c = this.cfg, p = this.puff;
    if (it.kind === 'rock') {
      if (p.invuln > 0) { this._steam(it, 0); return; }   // fizzles harmlessly in the blink window
      it.state = 'steam'; it.t = 0; it.vx *= 0.2;
      this.rocksCaught++;
      this.hearts = Math.max(0, this.hearts - 1);
      var had = this.combo;
      this.combo = 0; this.mult = 1;
      p.invuln = c.invulnTime; p.ouch = c.ouchTime; p.happy = 0; p.squash = c.squashOuch;
      this._emit({ type: 'ouch', x: cx, y: c.rimY, hearts: this.hearts, combo: had });
      if (this.hearts <= 0 && this.state !== 'dead') {
        this.state = 'dead'; this._stateT = 0;
        this._emit({ type: 'dead', score: this.score, level: this.level });
      }
      return;
    }
    it.state = 'caught'; it.t = 0; it._off = clamp(cx - p.rimX, -18, 18); it.vx = 0; it.vy = 0;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    var m = 1, th = c.multThresholds;
    for (var k = th.length - 1; k >= 0; k--) if (this.combo >= th[k]) { m = k + 1; break; }
    var up = m > this.mult;
    this.mult = m;
    var pts = it.value * c.coinPoints * this.mult;
    this.score += pts;
    this.coinsTotal++;
    p.happy = c.happyTime; p.squash = Math.max(p.squash, c.squashCatch);
    this._emit({ type: 'catch', x: cx, y: c.rimY, metal: it.metal, value: it.value, points: pts, combo: this.combo, mult: this.mult });
    if (up) this._emit({ type: 'multup', mult: this.mult });
    if (this.state === 'playing') {
      this.pouch = Math.min(this.pouchTarget, this.pouch + 1);
      if (this.pouch >= this.pouchTarget) this._clear();
    }
  };

  World.prototype._hitGround = function (it, gy) {
    var c = this.cfg;
    it.y = gy; it.t = 0; it.state = 'ground';
    if (it.kind === 'coin') {
      it._bounces = 1;
      it.vy = -Math.abs(it.vy) * c.coinRestitution; it.vx *= c.coinGroundFric;
      this.missed++;
      if (this.state === 'playing') {
        var had = this.combo;
        this.combo = 0; this.mult = 1;
        this._emit({ type: 'miss', x: it.x, y: c.groundY, combo: had });
      }
    } else {
      it._bounces = 2; it._rest = 0; it.vy = 0; it.vx *= 0.15;
      this._emit({ type: 'rockland', x: it.x, y: c.groundY });
    }
  };

  World.prototype._steam = function (it, pts) {
    it.state = 'steam'; it.t = 0; it.vx *= 0.3; it.vy = 0;
    if (pts > 0) { this.score += pts; this.steamed++; }
    this._emit({ type: 'steam', x: it.x, y: it.y, points: pts });
  };

  World.prototype._stepRain = function (h) {
    var c = this.cfg, R = this.rain;
    if (R.active > 0) {
      R.active = Math.max(0, R.active - h);
    } else if (R.charge < 1) {
      R.charge = Math.min(1, R.charge + h / c.rainRecharge);
      if (R.charge >= 1) this._emit({ type: 'raincharged' });
    }
  };

  World.prototype._clear = function () {
    var c = this.cfg, i, it;
    this._emit({ type: 'pouchfull' });
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.kind === 'rock' && it.state === 'fly') this._steam(it, c.steamPoints);
    }
    var bonus = this.hearts * c.clearBonusPerHeart;
    this.score += bonus;
    this.levelsCleared++;
    this.state = 'cleared'; this._stateT = 0;
    this.rain.active = 0;
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
    if (c.healOnClear > 0 && this.lap < c.healLaps && this.hearts < this.heartsMax) {
      this.hearts = Math.min(this.heartsMax, this.hearts + c.healOnClear);
      this._emit({ type: 'heal', hearts: this.hearts });
    }
  };

  /** Compact snapshot for debug / tests. */
  World.prototype.snapshot = function () {
    return {
      state: this.state, level: this.level, zone: this.zone, lap: this.lap, score: this.score, hearts: this.hearts,
      combo: this.combo, mult: this.mult, pouch: this.pouch, pouchTarget: this.pouchTarget, items: this.items.length,
      puff: { x: +this.puff.x.toFixed(2), rimX: +this.puff.rimX.toFixed(2) }, rain: +this.rain.charge.toFixed(3), time: +this.time.toFixed(3)
    };
  };

  VC.CONFIG = CONFIG;
  VC.DIFFICULTY = DIFFICULTY;
  VC.World = World;
})(window.VC = window.VC || {});
