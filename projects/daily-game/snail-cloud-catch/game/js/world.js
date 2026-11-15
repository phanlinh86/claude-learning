/* Shelly's Sky Catch — SC.CONFIG + SC.DIFFICULTY + SC.ZONES + SC.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 scene), seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s) with an
 *  accumulator (w._acc = leftover time, 0..step). Results depend only on the seed and on
 *  the sub-step index at which setMove / setTarget / action / setPlayRange are called.
 *
 *  Render interpolation: at the START of every sub-step the previous position is saved as
 *  `_px,_py` on snail and on every item.  drawX = _px + (x − _px) · (w._acc / w.cfg.step).
 *
 *  Drawing (DESIGN §2 / §4.1):
 *   - Shelly: body centre (snail.x, snail.y); y = hover line 430 − hop (no bob: bob is render-only).
 *             face 1 = sprite as drawn (facing right), −1 = mirrored. tilt: POSITIVE = clockwise =
 *             leaning right (she leans into her motion). squash 0..1: scaleX ×(1+0.15·s), scaleY ×(1−0.15·s).
 *             flame 0..1 = jet flame strength (nozzle at sprite (22,78) → world (x ∓ 30, y + 16)).
 *   - Basket: rim centre (rimX, rimY) = (x + sway, y − 46); sway = damped spring offset in px.
 *   - Items:  centre (x, y), radius r, rotate(rot). 'peek' items are twinkles at the cloud bank
 *             (alpha ramps in). 'caught' items sit in the basket (draw before basket_front).
 *             'ground' stars bounce once then fade (alpha). 'pop' = puff / harmless pop, fading.
 *
 *  Fall model (docs/MECHANICS.md §3): per item  vy += (g − k·vy)·h  → terminal vT = g/k;
 *  horizontal centre line  vx += (wind.x·windK − kx·vx)·h ; x = bx + A·sin(sway) (flutter).
 *  World.predict(it, Y) gives the exact continuous solution for the bot and the drop planner.
 * ========================================================================
 */
(function (SC) {
  'use strict';

  var ZONES = ['sunny', 'rain', 'wind', 'snow'];

  /* All tunables. Override per world with new SC.World({ config: {...} }). Arrays are per zone
   * [sunny, rain, wind, snow]. */
  var CONFIG = {
    // --- screen / timing
    width: 960, height: 540,
    step: 1 / 120,                 // s, fixed simulation sub-step (render interpolates)
    introDelay: 1.4,               // s, 'ready' banner, no drops (Shelly can already move and hop)
    clearTime: 2.2,                // s, 'cleared' celebration before the next weather
    jarGrace: 1.0,                 // s after the jar is full: stars still falling can be caught, then 'cleared'
    firstDropDelay: 0.4,           // s after 'go' before the first twinkle peeks

    // --- scene geometry (DESIGN §2)
    peekY: 96,                     // px, items peek here (fluffy bottom of the cloud bank)
    groundY: 492,                  // px, cloud floor
    hoverY: 430,                   // px, Shelly body centre at rest (hover line)
    rimOff: 46,                    // px, rimY = snail.y − rimOff (384 at rest)
    xMin: 70, xMax: 890,           // px, Shelly x clamp (setPlayRange changes it)
    dropMin: 80, dropMax: 880,     // px, drop x range (∩ play range ± dropInset)
    dropInset: 10,                 // px, drops stay this far inside the play range
    catchHalfW: 36,                // px, catch half-width (+ item r × catchRFrac): a wide, forgiving basket
    catchRFrac: 0.5,

    // --- Shelly movement
    maxSpeed: 380,                 // px/s: crosses the 820 px floor in ~2.2 s, quick enough for any drop
    accel: 2400,                   // px/s² toward the key speed (0 → max in 0.16 s: responsive but soft)
    brake: 3000,                   // px/s² when keys are released (stops in 0.13 s / ≈ 24 px drift)
    followOmega: 13,               // 1/s, pointer-follow: v_des = ω·dx near the target (exponential, no overshoot)
    followAccel: 4200,             // px/s², pointer-follow acceleration cap
    followBrake: 0.5,              // fraction of followAccel used for the √(2·a·dx) braking profile
                                   //  (0.5 keeps the ω-regime decel ≤ the cap → no overshoot even on ice)
    snowGrip: 0.35,                // snow: accel / brake / followAccel × 0.35 → she slides (≈ 70 px after release)
    jetAirSpeed: 1.35,             // max sideways speed × while airborne (a jetpack burst is fast)
    windPushK: 0.45,               // Shelly drift velocity = wind.x × k (px/s per px/s²)…
    windPushMax: 0.15,             // …capped at 15 % of maxSpeed (DESIGN: a nudge, never a shove)
    windPushRate: 2,               // 1/s, the drift eases in (she has mass)
    tiltK: 0.22 / 380,             // rad per px/s: tilt target = vx·k (lean into motion)
    tiltMax: 0.22,                 // rad
    tiltRate: 8,                   // 1/s, exponential easing of the tilt (≈ 0.09 s half-life)
    faceDead: 30,                  // px/s, |vx| below this keeps the current facing (no flicker)
    // basket sway = damped spring driven by Shelly's acceleration (inertia of the basket):
    //   s'' = −ω²·s − 2ζω·s' − drive·ax      (s > 0 = basket shifted right)
    swayFreq: 1.6,                 // Hz → ω ≈ 10 rad/s: a quick wobble, not a lazy swing
    swayZeta: 0.22,                // 2–3 visible wobbles, settles in ~1 s
    swayDrive: 0.3,                // static lag = drive·a/ω² ≈ 0.3·2400/101 ≈ 7 px on a hard start
    swayMax: 10,                   // px, clamp (DESIGN ±10)
    squashCatch: 0.6, squashZap: 1, squashLand: 0.75, squashDecay: 8,   // 0..1, exp decay 1/s
    happyTime: 0.45, zapTime: 0.8, // s, face frames

    // --- Jet Hop: impulse + constant gravity. apex H = v²/2g, air time T = 2v/g → v = 4H/T, g = 8H/T²
    jetImpulse: 570,               // px/s upward (H = 100 px, T = 0.7 s with jetG)
    jetG: 1630,                    // px/s²
    jetRecharge: 2.5,              // s from landing to a full charge
    jetFlameTime: 0.22,            // s, flame decay time constant after the burst

    // --- hearts
    heartsMax: 3,
    invulnTime: 1.2,               // s after a zap: puffs caught now pop harmlessly
    healOnClear: 1,                // hearts back on a clear (after the bonus is counted)…
    healLaps: 1,                   // …only on the first loop (later loops are the endless challenge)
    clearBonusPerHeart: 100,

    // --- items: radius, terminal speed vT (px/s) and drag k (1/s) → g = k·vT
    starR: 15, goldR: 20, puffR: 19,          // px (drawn 32 / 44 / 46)
    starVT: 165, starDrag: 2.0,    // light: ~2.3 s from the bank to the rim on sunny (τ = 0.5 s)
    goldVT: 1.5, goldDrag: 1.4,    // × star vT (heavier: falls faster, smaller drag/mass)
    puffVT: 0.6, puffDrag: 2.6,    // × star vT (floaty cloud)
    zoneFall: [1, 1.15, 1, 0.85],  // rain: wet stars ×1.15; snow: slow and fluttery
    fallMul: 1,                    // difficulty multiplier on all terminal speeds
    lapFall: 0.08, fallCap: 1.4,   // +8 % per loop, capped
    windDragX: 1.1,                // 1/s, sideways drag → side drift = wind·windK/kx
    windK: { star: 1, gold: 0.55, puff: 1.3 },
    swayAmp: { star: 10, gold: 5, puff: 16 },   // px flutter half-width
    swayRate: { star: 2.6, gold: 3.4, puff: 1.4 },   // rad/s (≈ 0.4 Hz flutter; puffs bob slowly)
    zoneSway: [1, 0.9, 1.2, 1.8],  // snow flutters ×1.8
    starSpin: [0.6, 1.4], goldSpin: [2.4, 3.4], puffSpin: [0, 0],   // rad/s (random sign)
    wobble: 0.16,                  // rad, rot also rocks with the flutter (a falling leaf tilts with its swing)
    peekTime: 0.6,                 // s, telegraph twinkle at the drop x
    groundBounce: 0.4,             // star bounces once softly (restitution) → a ≈ 5 px hop
    groundG: 400,                  // px/s², gravity for that little bounce (floaty, like the fall)
    fadeTime: 0.6,                 // s, star fades on the floor
    popTime: 0.35,                 // s, puff pop fade
    caughtTime: 0.25, caughtDrop: 12,   // s, px: sinks into the basket

    // --- drops (index = zone)
    dropGap: [2.1, 1.85, 1.75, 1.6],   // s between drops (lap 0); ±dropJitter
    dropJitter: 0.15,
    lapGap: 0.06, gapMin: 0.9,     // −6 % per loop
    goldChance: 0.08,              // of stars (+ one guaranteed by mid-jar)
    puffChance: [0.08, 0.16, 0.14, 0.18],
    lapPuff: 0.03, puffCap: 0.32,
    puffDelay: 20,                 // s, no puffs on sunny lap 0 before this
    maxPuffRun: 2,                 // never more than 2 puffs in a row
    puffAim: 0.4,                  // chance a puff aims near Shelly (±150 px): a threat to read, never a trap
    // fairness
    fairSpeed: 230,                // px/s a casual player sustains (60 % of maxSpeed)
    fairSlack: 36,                 // px ≈ catch half-width
    puffKeepDt: 0.7, puffKeepDx: 110,   // a puff never crosses within 110 px of a star within 0.7 s…
    puffKeepLap: 25,               // …−25 px per loop from loop 2 on (endless loops get tighter, min 40 px)
    fairTries: 40,

    // --- wind (only zones with windMax > 0)
    windMax: [0, 0, 110, 0],       // px/s² gust strength upper bound (side drift ≈ 100 px/s for stars)
    windMinFrac: 0.45,             // gust strength ∈ [0.45, 1] × windMax
    windCalm: 0.2,                 // chance a gust is a lull (strength × 0.2)
    windFirst: 4,                  // s of play before the first telegraph
    gustEvery: [5, 8],             // s between gusts
    gustWarn: 1.2,                 // s telegraph (streaks + windsock turn) before the gust
    gustEase: 0.6,                 // s smoothstep ease from the old to the new wind
    windTurb: 0.08,                // fraction of |wind| as a slow flutter (alive, deterministic)
    windSame: 0.3,                 // chance the next gust keeps the direction
    lapWind: 0.1,                  // +10 % per loop

    // --- scoring / jar
    jarTargets: [18, 22, 26, 30],
    starPoints: 10,                // × value × mult
    starValue: 1, goldValue: 5,
    multThresholds: [0, 8, 20]     // combo needed for ×1..×3
  };

  /* Difficulty presets: overrides merged over CONFIG. Normal = CONFIG. */
  var DIFFICULTY = {
    easy: {
      heartsMax: 5, invulnTime: 1.6, jetRecharge: 2.0, healLaps: 2,
      jarTargets: [12, 15, 18, 21],
      peekTime: 0.8,
      fallMul: 0.82,               // softer falls for 3–5 year olds
      catchHalfW: 44,              // wider basket
      puffChance: [0.05, 0.1, 0.09, 0.12], puffCap: 0.22,
      dropGap: [2.8, 2.5, 2.35, 2.2],  // calmer: one star at a time for little kids (sunny ≈ 40 s)
      windMax: [0, 0, 75, 0],
      multThresholds: [0, 5, 12],  // ×2 sooner so little kids feel the streak
      fairSpeed: 150
    },
    normal: {},
    hard: {
      invulnTime: 1.0, healOnClear: 0, jetRecharge: 3.0,
      jarTargets: [22, 26, 30, 34],
      fallMul: 1.12,
      puffChance: [0.12, 0.2, 0.18, 0.22], puffDelay: 8,
      dropGap: [1.7, 1.55, 1.45, 1.35],
      windMax: [0, 0, 140, 0],
      fairSpeed: 280
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
  World.ZONES = ZONES;

  /** reset([seed]) — new game: level 0 (sunny), score 0, full hearts, state 'ready'. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new SC.RNG(this.seed);
    this.time = 0; this.steps = 0;
    this.score = 0;
    this.heartsMax = c.heartsMax; this.hearts = c.heartsMax;
    this.combo = 0; this.mult = 1; this.bestCombo = 0;
    this.starsTotal = 0; this.goldTotal = 0; this.zaps = 0; this.missed = 0; this.puffsPopped = 0;
    this.jets = 0; this.levelsCleared = 0; this.starsDropped = 0; this.puffsDropped = 0;
    this._acc = 0; this._events = []; this._nextId = 1;
    this._mx = 0; this._target = null;
    var x = (c.xMin + c.xMax) / 2;
    this.snail = {
      x: x, y: c.hoverY, vx: 0, vy: 0, hop: 0, tilt: 0, face: 1, frame: 'idle',
      invuln: 0, squash: 0, sway: 0, rimX: x, rimY: c.hoverY - c.rimOff, flame: 0,
      ax: 0, swayV: 0, vc: 0, vw: 0, happy: 0, zap: 0,
      _px: x, _py: c.hoverY, _prx: x, _pry: c.hoverY - c.rimOff
    };
    this.jet = { charge: 1, air: false, cooldown: 0 };
    this.wind = { x: 0, target: 0, warn: 0, nextDir: 1, t: 0, level: 0 };
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
      jarTarget: c.jarTargets[z],
      dropGap: Math.max(c.gapMin, c.dropGap[z] * (1 - c.lapGap * lap)),
      fall: Math.min(c.fallCap, c.fallMul * c.zoneFall[z] * (1 + c.lapFall * lap)),
      sway: c.zoneSway[z],
      puffChance: Math.min(c.puffCap, c.puffChance[z] + c.lapPuff * lap),
      puffDelay: (z === 0 && lap === 0) ? c.puffDelay : 0,
      goldChance: c.goldChance,
      peekTime: c.peekTime,
      windMax: c.windMax[z] * (1 + c.lapWind * lap),
      grip: z === 3 ? c.snowGrip : 1,
      puffKeepDx: Math.max(40, c.puffKeepDx - c.puffKeepLap * Math.max(0, lap - 1))
    };
  };

  /** startLevel(i): zone = i % 4, lap = floor(i / 4); clears items, keeps score/hearts/streak. */
  World.prototype.startLevel = function (i) {
    i = Math.max(0, i | 0);
    var info = this.levelInfo(i);
    this.level = i; this.zone = info.zone; this.lap = info.lap;
    this.levelTime = 0;
    this.jar = 0; this.jarTarget = info.jarTarget;
    this._info = info;
    this.items = [];
    this._jarFull = false; this._graceT = 0;
    this._nextDrop = 1e9;               // armed on 'go'
    this._goldLevel = 0; this._puffRun = 0; this._lastKinds = [];
    var W = this.wind;
    W.x = 0; W.target = 0; W.warn = 0; W.t = 0; W.level = 0; W.nextDir = this.rng.sign();
    this._windFrom = 0; this._windEase = 1; this._windNext = 1e9; this._warning = false;
    this.jet.charge = 1; this.jet.cooldown = 0;
    this.state = 'ready'; this._stateT = 0;
    this._emit({ type: 'zone', zone: this.zone, level: i, lap: this.lap });
    return this;
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.setMove = function (mx) { mx = +mx || 0; this._mx = clamp(mx, -1, 1); };
  World.prototype.setTarget = function (x) {
    if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) { this._target = null; return; }
    this._target = +x;
  };

  /** setPlayRange(xMin, xMax): the part of the cloud floor Shelly can reach on this screen (mobile).
   *  Stars and puffs only drop where she can go (drop range = play range ∓ dropInset, ∩ 80..880 by
   *  default); peeking items are re-aimed into the new range, falling ones are moved in. */
  World.prototype.setPlayRange = function (xMin, xMax) {
    var c = this.cfg, cx = 480;
    xMin = Math.max(20, Math.min(cx - 120, +xMin || 70));
    xMax = Math.min(940, Math.max(cx + 120, +xMax || 890));
    c.xMin = xMin; c.xMax = xMax;
    var s = this.snail;
    if (s) {
      if (s.x < xMin) { s.x = xMin; s.vc = 0; s.vx = s.vw; } else if (s.x > xMax) { s.x = xMax; s.vc = 0; s.vx = s.vw; }
      s._px = s.x; s.rimX = s.x + s.sway; s._prx = s.rimX;
    }
    var lo = this._dropLo(), hi = this._dropHi(), items = this.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.state === 'peek') { it.x = it._px = clamp(it.x, lo, hi); it._bx = it.x - it._A * Math.sin(it.sway); }
      else if (it.state === 'fall') {
        var nb = clamp(it._bx, xMin, xMax);
        if (nb !== it._bx) { it.x += nb - it._bx; it._bx = nb; it._px = it.x; it.vx = 0; }
      }
    }
    return this;
  };
  World.prototype._dropLo = function () { var c = this.cfg; return Math.max(c.dropMin, c.xMin + c.dropInset); };
  World.prototype._dropHi = function () { var c = this.cfg; return Math.min(c.dropMax, c.xMax - c.dropInset); };

  /** Jet Hop if charged and on the hover line. Returns true when Shelly takes off. */
  World.prototype.action = function () {
    if (this.state === 'dead' || this.jet.air || this.jet.charge < 1) return false;
    var c = this.cfg, s = this.snail;
    this.jet.air = true; this.jet.charge = 0; this.jet.cooldown = c.jetRecharge;
    s.vy = -c.jetImpulse; s.flame = 1;
    this.jets++;
    this._emit({ type: 'jet', x: s.x });
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
    var c = this.cfg, s = this.snail, i, it;
    s._px = s.x; s._py = s.y; s._prx = s.rimX; s._pry = s.rimY;
    for (i = 0; i < this.items.length; i++) { it = this.items[i]; it._px = it.x; it._py = it.y; }
    this.time += h; this.levelTime += h; this._stateT += h; this.steps++;

    var st = this.state;
    this._stepWind(h, st === 'playing' && !this._jarFull);
    this._stepSnail(h, st !== 'dead');
    this._stepJet(h);
    if (st === 'ready') {
      if (this._stateT >= c.introDelay) {
        this.state = 'playing'; this._stateT = 0;
        this._nextDrop = c.firstDropDelay;
        this._windNext = this._info.windMax > 0 ? c.windFirst + c.gustWarn : 1e9;
        this._emit({ type: 'go', level: this.level });
      }
    } else if (st === 'playing') {
      if (!this._jarFull) this._stepDrops(h);
      else {
        this._graceT -= h;
        if (this._graceT <= 0) this._clear();
      }
    }
    this._stepItems(h);
    this._stepVisual(h);
    if (this.state === 'cleared' && this._stateT >= c.clearTime) this.startLevel(this.level + 1);
  };

  /* ---- wind: telegraph (gustwarn) → gust (eased) ---- */
  World.prototype._stepWind = function (h, active) {
    var c = this.cfg, W = this.wind, r = this.rng, info = this._info;
    W.t += h;
    if (active && info.windMax > 0) {
      this._windNext -= h;
      if (!this._warning && this._windNext <= c.gustWarn && this._windNext > 0) {
        // decide the next direction now so the telegraph can show it
        var cur = W.target !== 0 ? (W.target > 0 ? 1 : -1) : r.sign();
        W.nextDir = W.target === 0 ? cur : (r.chance(c.windSame) ? cur : -cur);
        this._warning = true;
        this._emit({ type: 'gustwarn', dir: W.nextDir });
      }
      if (this._warning) W.warn = Math.max(1e-3, this._windNext);
      if (this._windNext <= 0) {
        var str = r.range(c.windMinFrac, 1) * info.windMax;
        if (r.chance(c.windCalm)) str *= 0.2;
        this._windFrom = W.x; W.target = W.nextDir * str; this._windEase = 0; W.t = 0; W.warn = 0;
        this._windNext = r.range(c.gustEvery[0], c.gustEvery[1]); this._warning = false;
        this._emit({ type: 'gust', dir: W.nextDir, strength: Math.round(str) });
      }
    } else if (!active) {
      W.warn = 0; this._warning = false;
      if (this.state !== 'playing' && W.target !== 0) { this._windFrom = W.x; W.target = 0; this._windEase = 0; }
    }
    if (this._windEase < 1) this._windEase = Math.min(1, this._windEase + h / c.gustEase);
    var base = this._windFrom + (W.target - this._windFrom) * smooth(this._windEase);
    W.x = base * (1 + c.windTurb * Math.sin(1.9 * this.time) * Math.sin(0.73 * this.time + 1));
    W.level = info.windMax > 0 ? clamp(Math.abs(W.x) / info.windMax, 0, 1) : 0;
  };

  /* ---- Shelly: horizontal control + wind drift + basket sway ---- */
  World.prototype._stepSnail = function (h, control) {
    var c = this.cfg, s = this.snail, info = this._info, grip = info.grip, a = 0;
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - h);
    if (s.happy > 0) s.happy = Math.max(0, s.happy - h);
    if (s.zap > 0) s.zap = Math.max(0, s.zap - h);
    var vmax = c.maxSpeed * (this.jet.air ? c.jetAirSpeed : 1);
    var A = c.accel * grip, B = c.brake * grip, F = c.followAccel * grip, vx0 = s.vx;
    // wind drift (a separate velocity component; the controller compensates when steering)
    var wt = clamp(this.wind.x * c.windPushK, -c.windPushMax * c.maxSpeed, c.windPushMax * c.maxSpeed);
    s.vw += (wt - s.vw) * (1 - Math.exp(-c.windPushRate * h));
    if (control && Math.abs(this._mx) > 0.05) {
      var want = this._mx * vmax, d = want - s.vc;
      var rate = (want * s.vc < 0 || Math.abs(want) < Math.abs(s.vc)) ? Math.max(A, B) : A;
      a = clamp(d / h, -rate, rate);
    } else if (control && this._target !== null) {
      var dx = clamp(this._target, c.xMin, c.xMax) - s.x, adx = Math.abs(dx);
      // desired total speed: exponential approach near the target, a braking parabola further out
      var vdes = (dx < 0 ? -1 : 1) * Math.min(vmax, c.followOmega * adx, Math.sqrt(2 * c.followBrake * F * adx));
      a = clamp((vdes - s.vw - s.vc) / h, -F, F);
    } else {
      a = clamp(-s.vc / h, -B, B);
    }
    s.vc += a * h;
    if (s.vc > vmax) s.vc = Math.max(vmax, s.vc - B * h); else if (s.vc < -vmax) s.vc = Math.min(-vmax, s.vc + B * h);
    s.vx = s.vc + s.vw;
    s.x += s.vx * h;
    if (s.x < c.xMin) { s.x = c.xMin; if (s.vx < 0) { s.vc = -s.vw; s.vx = 0; } }
    else if (s.x > c.xMax) { s.x = c.xMax; if (s.vx > 0) { s.vc = -s.vw; s.vx = 0; } }
    s.ax = (s.vx - vx0) / h;
    // basket: damped spring in Shelly's accelerating frame (semi-implicit Euler, stable at h = 1/120)
    var om = TAU * c.swayFreq, drive = clamp(s.ax, -3 * c.accel, 3 * c.accel);
    s.swayV += (-om * om * s.sway - 2 * c.swayZeta * om * s.swayV - c.swayDrive * drive) * h;
    s.sway += s.swayV * h;
    if (s.sway > c.swayMax) { s.sway = c.swayMax; if (s.swayV > 0) s.swayV *= -0.3; }
    else if (s.sway < -c.swayMax) { s.sway = -c.swayMax; if (s.swayV < 0) s.swayV *= -0.3; }
  };

  /* ---- Jet Hop: vertical ballistic arc, landing, recharge ---- */
  World.prototype._stepJet = function (h) {
    var c = this.cfg, s = this.snail, J = this.jet;
    if (J.air) {
      s.vy += c.jetG * h;
      s.y += s.vy * h;
      if (s.y >= c.hoverY) {
        s.y = c.hoverY; s.vy = 0; J.air = false;
        s.squash = Math.max(s.squash, c.squashLand);
        this._emit({ type: 'jetland', x: s.x });
      }
    } else {
      s.y = c.hoverY; s.vy = 0;
      if (J.charge < 1) {
        J.charge = Math.min(1, J.charge + h / c.jetRecharge);
        if (J.charge >= 1) this._emit({ type: 'jetcharged' });
      }
    }
    J.cooldown = J.charge >= 1 ? 0 : (1 - J.charge) * c.jetRecharge + (J.air ? Math.max(0, (c.hoverY - s.y) / 400) : 0);
    s.hop = Math.max(0, c.hoverY - s.y);
    s.flame = J.air && s.vy < 0 ? Math.max(s.flame * Math.exp(-h / c.jetFlameTime), 0.35 * (-s.vy / c.jetImpulse)) : s.flame * Math.exp(-h / (c.jetFlameTime * 0.5));
    if (s.flame < 1e-3) s.flame = 0;
    s.rimX = s.x + s.sway;
    s.rimY = s.y - c.rimOff;
  };

  World.prototype._stepVisual = function (h) {
    var c = this.cfg, s = this.snail;
    var tt = clamp(s.vx * c.tiltK, -c.tiltMax, c.tiltMax);
    s.tilt += (tt - s.tilt) * (1 - Math.exp(-c.tiltRate * h));
    if (s.vx > c.faceDead) s.face = 1; else if (s.vx < -c.faceDead) s.face = -1;
    s.squash *= Math.exp(-c.squashDecay * h);
    if (s.squash < 1e-3) s.squash = 0;
    if (this.state === 'dead' || s.zap > 0) s.frame = 'zap';
    else if (this.jet.air) s.frame = 'jet';
    else if (s.happy > 0 || this.state === 'cleared') s.frame = 'happy';
    else s.frame = 'idle';
  };

  /* ---- drops: scheduler + fair aiming ---- */
  World.prototype._stepDrops = function (h) {
    this._nextDrop -= h;
    if (this._nextDrop > 0) return;
    this._spawnDrop();
    var g = this._info.dropGap, j = this.cfg.dropJitter;
    this._nextDrop += g * this.rng.range(1 - j, 1 + j);
  };

  World.prototype._pickKind = function () {
    var c = this.cfg, r = this.rng, info = this._info;
    var pc = this.levelTime >= info.puffDelay ? info.puffChance : 0;
    if (this._puffRun < c.maxPuffRun && r.chance(pc)) return 'puff';
    var u = r.next();
    if (this._goldLevel === 0 && this.jar >= Math.floor(this.jarTarget / 2)) return 'gold';   // guaranteed by mid-jar
    return u < info.goldChance ? 'gold' : 'star';
  };

  /** Physical parameters of a kind in the current level. */
  World.prototype._phys = function (kind) {
    var c = this.cfg, info = this._info, vT = c.starVT * info.fall, k = c.starDrag;
    if (kind === 'gold') { vT *= c.goldVT; k = c.goldDrag; }
    else if (kind === 'puff') { vT *= c.puffVT; k = c.puffDrag; }
    return { vT: vT, k: k, g: vT * k, kx: c.windDragX, wk: c.windK[kind], A: c.swayAmp[kind] * info.sway, om: c.swayRate[kind] };
  };

  World.prototype._newItem = function (kind, x) {
    var c = this.cfg, r = this.rng, P = this._phys(kind);
    var spinR = kind === 'gold' ? c.goldSpin : kind === 'puff' ? c.puffSpin : c.starSpin;
    var it = {
      id: this._nextId++, kind: kind, color: kind === 'star' ? r.int(0, 2) : 0,
      value: kind === 'gold' ? c.goldValue : kind === 'puff' ? 0 : c.starValue,
      x: x, y: c.peekY, vx: 0, vy: 0, rot: 0, spin: r.range(spinR[0], spinR[1]) * r.sign(),
      sway: r.range(0, TAU), r: kind === 'gold' ? c.goldR : kind === 'puff' ? c.puffR : c.starR,
      state: 'peek', t: 0, alpha: 0, _px: x, _py: c.peekY,
      _bx: x, _g: P.g, _k: P.k, _kx: P.kx, _wk: P.wk, _A: P.A, _om: P.om, _rot0: r.range(-0.3, 0.3),
      _peek: this._info.peekTime, _bounced: false, _off: 0, tx: x, tCross: 0
    };
    it.rot = it._rot0;
    // the flutter is centred on the drop x: start x = bx + A·sin(phase)
    it._bx = x - it._A * Math.sin(it.sway);
    return it;
  };

  /** Crossing of y = Y (moving down) for an item from its current state, with the current wind held
   *  (eased toward its target). Returns { t (s from now), x, bx } or null. Exact continuous solution of
   *  the integrator's ODE; peek time is included for peeking items. */
  World.prototype.predict = function (it, Y, windX) {
    if (it.state !== 'peek' && it.state !== 'fall') return null;
    var t0 = it.state === 'peek' ? Math.max(0, it._peek - it.t) : 0;
    var vy0 = it.state === 'peek' ? 0 : it.vy, y0 = it.y, k = it._k, vT = it._g / k;
    if (y0 >= Y) return null;
    var tau = Math.max(0.01, (Y - y0) / Math.max(30, vT));
    for (var n = 0; n < 12; n++) {
      var e = Math.exp(-k * tau);
      var f = y0 + vT * tau + (vy0 - vT) / k * (1 - e) - Y, fp = vT + (vy0 - vT) * e;
      if (fp <= 1e-6) { tau += 0.1; continue; }
      var d = f / fp; tau -= d;
      if (tau < 0) tau = 0;
      if (Math.abs(d) < 1e-6) break;
    }
    var p = this._posAt(it, t0, tau, windX);
    return { t: t0 + tau, x: p.x, bx: p.bx };
  };

  /** Position after waiting `t0` (peek) and falling for `tau` s (closed form, constant wind). */
  World.prototype._posAt = function (it, t0, tau, windX) {
    var c = this.cfg, W = windX !== undefined ? windX : this._windAhead();
    var peeking = it.state === 'peek';
    var vx0 = peeking ? 0 : it.vx, kx = it._kx, vxT = W * it._wk / kx;
    var bx = it._bx + vxT * tau + (vx0 - vxT) / kx * (1 - Math.exp(-kx * tau));
    bx = clamp(bx, c.xMin, c.xMax);
    var ph = it.sway + it._om * tau;   // the flutter phase only advances while falling
    var y0 = it.y, k = it._k, vT = it._g / k, vy0 = peeking ? 0 : it.vy;
    var y = y0 + vT * tau + (vy0 - vT) / k * (1 - Math.exp(-k * tau));
    return { x: bx + it._A * Math.sin(ph), y: y, bx: bx, t: t0 + tau };
  };
  /** Public: item position `tau` s from now (bot hop planning). */
  World.prototype.itemAt = function (it, tau, windX) {
    var t0 = it.state === 'peek' ? Math.max(0, it._peek - it.t) : 0;
    if (tau <= t0) return { x: it.x, y: it.y, t: tau };
    return this._posAt(it, t0, tau - t0, windX);
  };
  // wind the item will mostly feel: the eased target if a gust is easing in, else the current wind
  World.prototype._windAhead = function () {
    return this._windEase < 1 ? this.wind.x + (this.wind.target - this.wind.x) * 0.7 : this.wind.x;
  };

  // pick a fair drop x for one item
  World.prototype._aim = function (kind, info, probe) {   // probe = the new item (its flutter phase is part of the aim)
    var c = this.cfg, r = this.rng, s = this.snail, lo = this._dropLo(), hi = this._dropHi();
    var now = this.time, rimRest = c.hoverY - c.rimOff, stars = [], puffs = [], i, it, pr;
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state !== 'peek' && it.state !== 'fall') continue;
      pr = this.predict(it, rimRest);
      if (!pr) continue;
      (it.kind === 'puff' ? puffs : stars).push({ x: pr.x, t: now + pr.t });
    }
    stars.sort(function (a, b) { return a.t - b.t; });
    var last = stars.length ? stars[stars.length - 1] : null;
    var best = null, bestV = 1e9;
    for (var k = 0; k < c.fairTries; k++) {
      var x = kind === 'puff' && r.chance(c.puffAim) ? clamp(s.x + r.range(-150, 150), lo, hi) : r.range(lo, hi);
      probe._bx = x - probe._A * Math.sin(probe.sway); probe.x = x;
      pr = this.predict(probe, rimRest);
      var cx = pr.x, t = now + pr.t, viol = 0, j, d;
      if (kind !== 'puff') {
        // chainable after the last promised star (the player will be there), else reachable from Shelly now
        if (last) viol += Math.max(0, Math.abs(cx - last.x) - c.fairSlack - c.fairSpeed * Math.abs(t - last.t));
        else viol += Math.max(0, Math.abs(cx - s.rimX) - c.fairSlack - c.fairSpeed * pr.t);
        for (j = 0; j < puffs.length; j++) {
          d = Math.abs(cx - puffs[j].x);
          if (Math.abs(t - puffs[j].t) < c.puffKeepDt && d < info.puffKeepDx) viol += 3 * (info.puffKeepDx - d);   // a forced puff is worse than a far star
        }
      } else {
        for (j = 0; j < stars.length; j++) {
          d = Math.abs(cx - stars[j].x);
          if (Math.abs(t - stars[j].t) < c.puffKeepDt && d < info.puffKeepDx) viol += info.puffKeepDx - d;
        }
      }
      if (viol < bestV) { bestV = viol; best = { x: x, cx: cx, t: t }; if (viol <= 0) break; }
    }
    best.viol = bestV;
    return best;
  };

  World.prototype._spawnDrop = function () {
    var kind = this._pickKind(), info = this._info, it = this._newItem(kind, 480), aim = this._aim(kind, info, it);
    it.x = it._px = aim.x; it._bx = aim.x - it._A * Math.sin(it.sway);
    it.tx = aim.cx; it.tCross = aim.t; it.fair = aim.viol <= 0;
    this.items.push(it);
    if (kind === 'puff') { this._puffRun++; this.puffsDropped++; }
    else { this._puffRun = 0; this.starsDropped++; if (kind === 'gold') this._goldLevel++; }
    this._emit({ type: 'peek', id: it.id, kind: kind, x: it.x });
  };

  /* ---- items ---- */
  World.prototype._stepItems = function (h) {
    var c = this.cfg, s = this.snail, W = this.wind.x, i, it;
    var canCatch = this.state === 'playing';
    for (i = this.items.length - 1; i >= 0; i--) {
      it = this.items[i];
      it.t += h;
      if (it.state === 'peek') {
        it.alpha = clamp(it.t / 0.15, 0, 1);
        if (it.t >= it._peek) {
          it.state = 'fall'; it.t = 0; it.alpha = 1;
          this._emit({ type: 'drop', id: it.id, kind: it.kind, x: it.x });
        }
      } else if (it.state === 'fall') {
        var x0 = it.x, y0 = it.y;
        it.vy += (it._g - it._k * it.vy) * h;
        it.vx += (W * it._wk - it._kx * it.vx) * h;
        it._bx += it.vx * h;
        if (it._bx < c.xMin) { it._bx = c.xMin; if (it.vx < 0) it.vx = -it.vx * 0.35; }
        else if (it._bx > c.xMax) { it._bx = c.xMax; if (it.vx > 0) it.vx = -it.vx * 0.35; }
        it.sway += it._om * h;
        it.x = it._bx + it._A * Math.sin(it.sway);
        it.y += it.vy * h;
        it._spinA = (it._spinA || 0) + it.spin * h;
        it.rot = it._rot0 + it._spinA + c.wobble * Math.cos(it.sway);
        // catch: the item enters the basket opening from above this sub-step (rim may be moving: Jet Hop)
        if (canCatch) {
          var d0 = y0 - s._pry, d1 = it.y - s.rimY;
          if (d0 < 0 && d1 >= 0) {
            var f = -d0 / (d1 - d0), cx = x0 + (it.x - x0) * f, rx = s._prx + (s.rimX - s._prx) * f;
            if (Math.abs(cx - rx) <= c.catchHalfW + it.r * c.catchRFrac) { this._caught(it, cx); continue; }
          }
        }
        var gy = c.groundY - it.r * 0.6;
        if (it.y >= gy) this._hitGround(it, gy);
      } else if (it.state === 'ground') {
        if (!it._rest) {
          it.vy += c.groundG * h; it.y += it.vy * h; it.x += it.vx * h; it._spinA += it.spin * h; it.rot = it._rot0 + it._spinA;
          var gy2 = c.groundY - it.r * 0.6;
          if (it.y >= gy2 && it.vy > 0) { it.y = gy2; it.vy = 0; it._rest = true; it.t = 0; }
        } else {
          it.vx *= Math.exp(-6 * h); it.x += it.vx * h;
          it.alpha = clamp(1 - it.t / c.fadeTime, 0, 1);
          if (it.alpha <= 0) { this.items.splice(i, 1); continue; }
        }
      } else if (it.state === 'caught') {
        var u = clamp(it.t / c.caughtTime, 0, 1);
        it.x = s.rimX + it._off; it.y = s.rimY + c.caughtDrop * u * u;
        it.rot *= Math.exp(-10 * h);
        it.alpha = 1;
        if (it.t >= c.caughtTime) { this.items.splice(i, 1); continue; }
      } else if (it.state === 'pop') {
        it.vy *= Math.exp(-5 * h); it.vx *= Math.exp(-5 * h);
        it.x += it.vx * h; it.y += it.vy * h;
        it.alpha = clamp(1 - it.t / c.popTime, 0, 1);
        if (it.alpha <= 0) { this.items.splice(i, 1); continue; }
      }
    }
  };

  World.prototype._pop = function (it, harmless) {
    it.state = 'pop'; it.t = 0; it.vx *= 0.3; it.vy = harmless ? -20 : 0; it.alpha = 1;
    if (harmless) { this.puffsPopped++; this._emit({ type: 'pop', x: it.x, y: it.y, kind: it.kind }); }
  };

  World.prototype._caught = function (it, cx) {
    var c = this.cfg, s = this.snail;
    if (it.kind === 'puff') {
      if (s.invuln > 0) { this._pop(it, true); return; }      // pops harmlessly in the blink window
      this._pop(it, false);
      this.zaps++;
      this.hearts = Math.max(0, this.hearts - 1);
      var had = this.combo;
      this.combo = 0; this.mult = 1;
      s.invuln = c.invulnTime; s.zap = c.zapTime; s.happy = 0; s.squash = c.squashZap;
      this._emit({ type: 'zap', x: cx, y: s.rimY, hearts: this.hearts, combo: had });
      if (this.hearts <= 0 && this.state !== 'dead') {
        this.state = 'dead'; this._stateT = 0;
        this._emit({ type: 'dead', score: this.score, level: this.level });
      }
      return;
    }
    it.state = 'caught'; it.t = 0; it._off = clamp(cx - s.rimX, -16, 16); it.vx = 0; it.vy = 0;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    var m = 1, th = c.multThresholds;
    for (var k = th.length - 1; k >= 0; k--) if (this.combo >= th[k]) { m = k + 1; break; }
    var up = m > this.mult;
    this.mult = m;
    var pts = it.value * c.starPoints * this.mult;
    this.score += pts;
    this.starsTotal++;
    if (it.kind === 'gold') this.goldTotal++;
    s.happy = c.happyTime; s.squash = Math.max(s.squash, c.squashCatch);
    this._emit({ type: 'catch', x: cx, y: s.rimY, kind: it.kind, value: it.value, points: pts, combo: this.combo, mult: this.mult, id: it.id });
    if (up) this._emit({ type: 'multup', mult: this.mult });
    if (!this._jarFull) {
      this.jar = Math.min(this.jarTarget, this.jar + 1);
      if (this.jar >= this.jarTarget) this._fillJar();
    }
  };

  World.prototype._hitGround = function (it, gy) {
    var c = this.cfg;
    it.y = gy; it.t = 0;
    if (it.kind === 'puff') {
      it.state = 'pop'; it.vy = 0; it.vx *= 0.2; it.alpha = 1;
      this.puffsPopped++;
      this._emit({ type: 'puffland', x: it.x, y: c.groundY });
      return;
    }
    it.state = 'ground'; it._rest = false;
    it.vy = -Math.abs(it.vy) * c.groundBounce; it.vx *= 0.5;
    if (this.state === 'playing' && !this._jarFull) {
      this.missed++;
      var had = this.combo;
      this.combo = 0; this.mult = 1;
      this._emit({ type: 'miss', x: it.x, y: c.groundY, combo: had, kind: it.kind });
    }
  };

  World.prototype._fillJar = function () {
    this._jarFull = true; this._graceT = this.cfg.jarGrace;
    this._emit({ type: 'jarfull', level: this.level });
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (it.state === 'peek') this.items.splice(i, 1);                    // drops stop
      else if (it.kind === 'puff' && it.state === 'fall') this._pop(it, true);
    }
  };

  World.prototype._clear = function () {
    var c = this.cfg;
    var bonus = this.hearts * c.clearBonusPerHeart;
    this.score += bonus;
    this.levelsCleared++;
    this.state = 'cleared'; this._stateT = 0;
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
    if (c.healOnClear > 0 && this.lap < c.healLaps && this.hearts < this.heartsMax) {
      this.hearts = Math.min(this.heartsMax, this.hearts + c.healOnClear);
      this._emit({ type: 'heal', hearts: this.hearts });
    }
  };

  /** Compact snapshot for debug / tests. */
  World.prototype.snapshot = function () {
    var s = this.snail;
    return {
      state: this.state, level: this.level, zone: this.zone, zoneName: ZONES[this.zone], lap: this.lap,
      score: this.score, hearts: this.hearts, combo: this.combo, mult: this.mult,
      jar: this.jar, jarTarget: this.jarTarget, items: this.items.length,
      snail: { x: +s.x.toFixed(2), y: +s.y.toFixed(2), rimX: +s.rimX.toFixed(2), rimY: +s.rimY.toFixed(2), frame: s.frame },
      jet: { charge: +this.jet.charge.toFixed(3), air: this.jet.air },
      wind: { x: +this.wind.x.toFixed(2), warn: +this.wind.warn.toFixed(2) },
      time: +this.time.toFixed(3)
    };
  };

  SC.CONFIG = CONFIG;
  SC.DIFFICULTY = DIFFICULTY;
  SC.ZONES = ZONES;
  SC.World = World;
})(window.SC = window.SC || {});
