/* Juno's Moon Stack — MS.World (headless, deterministic) + MS.World.CONFIG
 *
 * Contract: docs/DESIGN.md §2 and §5.1. Physics model, tuning and tables: docs/MECHANICS.md.
 * Units: px (logical, y DOWN) and seconds. Every length and acceleration in CONFIG is given for
 * layout.unit = 100 and is multiplied by unit/100 ("u") at use, so the game plays the same on any screen.
 * Everything runs in fixed sub-steps of CONFIG.step: same seed + same drop() calls at the same
 * simulated times → same game at any frame rate.
 *
 *   var w = new MS.World({ seed: 7, difficulty: 'easy', width: 960, height: 540, level: 0 });
 *   w.drop(); w.update(1/60); ...
 *   var ev = w.drainEvents();          // [{type:'drop', x, vx}, {type:'land', ...}, ...]
 *   // render: lerp prevX/prevY/prevRot → x/y/rot, cam.prevY → cam.y, tower.prevSway → sway with w.alpha
 *
 * The tower is `this.tower.list` (placed crates, bottom first). Placed crates keep their REST x; the
 * tower's sway is a separate damped spring added at draw time by swayOffset(y).
 */
(function (MS) {
  'use strict';
  var M = Math;

  var CONFIG = {
    step: 1 / 120,          // s      fixed sub-step: a falling crate at 900 px/s moves 7.5 px per step (< ⅒ crate), landings are crisp
    maxFrame: 0.25,         // s      longest frame simulated (hidden tab → no fast-forward of minutes)

    // ---- layout pieces (DESIGN §2/§4; lengths in "unit" multiples) ----
    baseW: 2.4,             // unit   launch pad width (base.svg 240 px at unit 100)
    baseH: 0.64,            // unit   launch pad height
    baseTopFrac: 4 / 64,    // ×h     base.svg's flat top is y = 4 of 64: crates sit there, not on the box top
    saucerSize: 1.55,       // unit   Juno + saucer drawn square (× saucer.scale)
    emitterDY: 0.6,         // unit   body centre (80,78) → beam emitter (80,140) of the 160 viewBox: 62/160 × 1.55
    beamGap: 0.3,           // unit   visible beam between emitter and the held crate's top
    rocketDX: 2.15,         // unit   the rocket lands this far right of cx (beside the base, inside a 560-wide portrait)
    rocketHalfH: 0.675,     // unit   rocket centre → nozzle bottom: (152 − 80)/160 × 1.5 unit
    flagH: 1.2,             // unit   beacon flag height (for the event y)

    // ---- crates ----
    crateGrow: 0.06,        // ×/step each grow step makes new crates 6 % bigger (5 steps → +30 %: easier to land, heavier)
    holdOmega: 18,          // rad/s  held crate follows the saucer on a spring: ≈0.07 s lag, a soft pendulum swing-out…
    holdZeta: 0.6,          // —      …that overshoots ≈10 % at the turn-arounds (reads as "hanging", never wobbly)
    inherit: 0.3,           // ×      share of the saucer's sideways speed a released crate keeps (the beam damps the rest; ×difficulty.inherit)
    spinK: 0.0006,          // rad/s per px/s  a moving release spins the crate a hair (≈0.05 rad over a fall), purely cosmetic
    squashRef: 900,         // px/s   landing speed that gives squash 1.0 (×u)…
    squashMin: 0.15,        // —      …but even a short drop squashes visibly
    squashMax: 0.65,        // —      …and a long one stays cartoon-readable
    squashDecay: 7,         // 1/s    squash fades to <10 % in 0.33 s (a "thunk", then still)
    slideRate: 28,          // 1/s    perfect snap / beam-assist slide: 95 % in 0.11 s (reads as a snap, but no 1-frame jump)

    // ---- landing rules ----
    perfectSnapFloor: 6,    // px     (×u) perfect zone is never smaller than this (tiny crates in later loops)
    comboCap: 5,            // ×      perfect bonus multiplier cap (REQUIREMENT)
    placePoints: 10,        // pts    every crate that stays
    perfectPoints: 10,      // pts    × min(combo, comboCap) on a perfect
    coinPoints: 5,          // pts    per star-coin
    goalPoints: 100,        // pts    × (zone+1) × (loop+1)
    settleTime: 0.5,        // s      after a crate stays: squash + sway read before the next crate appears
    missSettle: 0.9,        // s      after a miss/topple: time to watch the tumble (and for Juno's "oops")
    overWait: 1.6,          // s      max wait for tumbling crates before game over is announced

    // ---- tumbles (miss pivot + centre-of-mass topple) ----
    impactSpin: 0.55,       // ×      share of the impact's angular momentum about the edge corner kept as spin (rest lost to the "thunk")
    toppleSpin0: 0.6,       // rad/s  a COM topple starts from a gentle nudge (the support gives way)
    releaseAngle: 0.6,      // rad    pivoting crates slide off the corner after tipping ≈34° (friction cone of cardboard on metal)
    clearPush: 60,          // px/s   (×u) small outward push at release so tumblers clear the tower they fell from
    slideAcc: 900,          // px/s²  (×u) a tumbler resting on the launch pad slides/tips off its outer edge
    bounce: 0.3,            // —      ground restitution: one soft "boing", then it rests
    bounceMin: 120,         // px/s   (×u) slower touch-downs don't bounce
    groundFriction: 0.65,   // ×      vx kept at each ground contact
    restFade: 0.55,         // s      a tumbler rests this long on the ground…
    fadeTime: 0.4,          // s      …then fades out and is gone

    // ---- tower sway (damped spring at the top; DESIGN §5.1) ----
    swayOmega: 3.4,         // rad/s  natural frequency: one sway every ≈1.9 s (a tall, springy tower)
    swayZeta: 0.34,         // —      damping ratio: first overshoot 32 %, < 5 % after 2 swings — wobbly but never wild
    swayKick: 1.3,          // 1/s    sway velocity per px of off-centre landing (dx 40 px → ≈15 px top sway)
    swayVxKick: 0.06,       // ×      plus the crate's own sideways momentum
    perfectKick: 0.25,      // ×      perfect drops kick lightly (a "settle" not a wobble)
    growKick: 9,            // px/s   (×u) per grow step: bigger crates are heavier, every landing shakes more
    swayHeightRef: 4,       // crates the kick ramps up to full strength over the first 4 crates (a short tower is stiff)
    swayMax: 0.32,          // unit   hard limit of the top sway (×u) — keeps the landing target fair

    // ---- camera ----
    camOmega: 5,            // rad/s  critically damped spring to the target: 90 % in ≈0.8 s, never overshoots
    goalCamStart: 0.75,     // s      in the goal phase the camera starts gliding down with the rocket…
    goalCamEnd: 2.05,       // s      …and reaches the ground when it touches down

    // ---- saucer ----
    saucerGrow: 0.08,       // ×/step scale = 1 + 0.08·grow (DESIGN)
    scaleRate: 4,           // 1/s    scale eases to the target (grow/shrink take ≈0.5 s)
    bobAmp: 0.04,           // unit   gentle hover bob…
    bobW: 2.2,              // rad/s  …period ≈2.9 s
    tiltK: 0.00045,         // rad per px/s (÷u)  leans into the swing…
    tiltMax: 0.2,           // rad    …at most ≈11°
    tiltRate: 8,            // 1/s    tilt eases (no snapping)
    anim: { drop: 0.35, happy: 0.8, oops: 0.95 }, // s  pose durations before back to idle
    dropBuffer: 0.25,       // s      a press while no crate is held is kept this long (one press only)

    // ---- goal sequence ----
    goalTime: 2.6,          // s      flag rises, rocket glides in and lands
    rocketIn: 0.75,         // s      rocket appears (top of screen) at this time…
    rocketLand: 2.05,       // s      …and touches down here (decelerating like a retro-burn)
    travelTime: 1.0,        // s      crates fade, rocket lifts off, then levelUp
    rocketAcc: 1400,        // px/s²  (×u) lift-off acceleration in travel
    heartReward: 1,         // —      hearts back on every new planet (up to max)

    // ---- coins ----
    coins: { max: 3, life: 3, r: 0.21, bandTop: 0.8, bandBot: 0.45, minGap: 0.65, bob: 0.06, bobW: 2.6, spinRate: 7, pair: 0.25, onPath: 0.7, follow: 3 },
    //       max alive · life in drops · radius (unit) · fall band: centre ≥ saucer + 0.8 unit (and below the
    //       held crate) and ≤ tower top − 0.45 unit (DESIGN says 0.6; 0.45 leaves room in the 1-crate gap) · min gap
    //       between coins (unit) · bob amplitude (unit) · bob rad/s · spin frames/s · chance of a second coin ·
    //       share of coins placed over the drop path (top x ± 0.6 crate) — the rest anywhere on the swing ·
    //       follow 1/s: coins drift up with the tower (63 % in 0.33 s) so they stay in the fall band
    growEvery: 5,           // coins  per grow step (REQUIREMENT)
    growMax: 5,             // steps

    // ---- loops (after Comet Garden the planets repeat) ----
    loopSwing: 0.12,        // ×/loop saucer swings 12 % faster each round…
    loopSwingCap: 1.6,      // ×      …up to 60 % faster
    loopG: 0.06,            // ×/loop slightly heavier gravity each round
    loopGoal: 2,            // crates more per round
    loopTol: 0.06,          // ×/loop perfect zone shrinks 6 % per round…
    loopTolMin: 0.7,        // ×      …to at least 70 %

    // ---- per difficulty (Easy is tuned for a 6-year-old) ----
    difficulty: {
      easy:   { swing: 0.72, crate: 1.15, perfectTol: 0.22,  hearts: 4, inherit: 0.5,  sway: 0.65, assist: 0.4 },
      normal: { swing: 1.0,  crate: 1.0,  perfectTol: 0.13,  hearts: 3, inherit: 1.0,  sway: 1.0,  assist: 0.15 },
      hard:   { swing: 1.22, crate: 0.9,  perfectTol: 0.085, hearts: 3, inherit: 1.15, sway: 1.25, assist: 0 }
    },
    //  swing = × planet swingW · crate = × crate size · perfectTol = |dx| ≤ tol·w is perfect · hearts at start/max
    //  inherit = × CONFIG.inherit · sway = × sway kicks · assist = share of an off-centre landing the beam
    //  pulls back toward the centre (the crate slides in over ≈0.12 s; Easy forgives lean, Hard is raw physics)

    // ---- planets (zone = level % 4) ----
    planets: [
      { key: 'moon',  g: 760,  swingW: 1.75, drag: 0,    coinChance: 0.55, goal: 10 },  // low gravity: slow gentle falls; swing period 3.6 s (5 s on Easy)
      { key: 'dunes', g: 1050, swingW: 1.95, drag: 0.25, coinChance: 0.6,  goal: 12 },  // thin dusty air: a little drag on the sideways drift
      { key: 'rings', g: 1250, swingW: 2.3,  drag: 0.1,  coinChance: 0.6,  goal: 14 },  // "faster saucer" (REQUIREMENT)
      { key: 'comet', g: 1400, swingW: 2.5,  drag: 0.15, coinChance: 0.65, goal: 16 }   // the busiest planet before the loop
    ]
    //  g px/s² (×u) · swingW rad/s (phase speed of x = cx + swingA·sin φ) · drag 1/s on vx (0 = no air) · coin chance per crate · goal crates
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v < 0 ? -1 : 1; }
  function easeOutCubic(s) { s = clamp(s, 0, 1); return 1 - (1 - s) * (1 - s) * (1 - s); }
  function easeInOut(s) { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); }

  function Crate(id, x, y, w, h, style) {
    this.id = id; this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.w = w; this.h = h; this.style = style;
    this.rot = 0; this.prevRot = 0; this.vx = 0; this.vy = 0; this.vr = 0;
    this.state = 'held'; this.perfect = false; this.squash = 0; this.t = 0;
    this.alpha = 1; this.hvx = 0; this.rest = 0; this.onGround = false; this.pivot = null; this.floor = 0;
    this.tx = x;            // rest x target of a placed crate (x slides into it after a perfect snap / assist)
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;

  /** DESIGN §2 layout for a logical view w×h. */
  World.computeLayout = function (w, h) {
    var portrait = h > w;
    var unit = portrait ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4);
    var crateW0 = 1.1 * unit;
    return {
      width: w, height: h, portrait: portrait, unit: unit,
      groundY: h - 140 * unit / 100,
      saucerScreenY: (portrait ? 0.20 : 0.17) * h + 34,
      topLine: portrait ? 0.56 * h : 0.60 * h,
      crateW0: crateW0, crateH0: crateW0 * 2 / 3,
      swingA: portrait ? 0.34 * w : M.min(0.30 * w, 3.0 * unit),
      cx: w / 2
    };
  };

  World.prototype.reset = function (opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = new MS.RNG(this.seed);
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = CONFIG.difficulty[this.difficulty];
    this.layout = World.computeLayout(opts.width || 960, opts.height || 540);
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.events = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.maxHearts = this.diff.hearts; this.hearts = this.maxHearts;
    this.coins = 0; this.grow = 0; this.growCoins = 0;
    this.stats = { drops: 0, placed: 0, perfect: 0, edges: 0, misses: 0, topples: 0, coins: 0, grows: 0, levels: 0, bestTower: 0 };
    this._id = 0; this._lastStyle = -1; this._buf = -1;
    var L = this.layout;
    this.saucer = { x: L.cx, prevX: L.cx, y: 0, prevY: 0, vx: 0, phase: 0, scale: 1, prevScale: 1, anim: 'idle', animT: 0, tilt: 0 };
    this.level = opts.level | 0;
    this._startLevel(this.level, false);
  };

  // ---------- planets & sizes ----------
  World.prototype._planetFor = function (level) {
    var zone = ((level % 4) + 4) % 4, loop = M.floor(level / 4), P = CONFIG.planets[zone], D = this.diff;
    return {
      key: P.key, zone: zone, loop: loop,
      g: P.g * (1 + CONFIG.loopG * loop),
      swingW: P.swingW * D.swing * M.min(CONFIG.loopSwingCap, 1 + CONFIG.loopSwing * loop),
      drag: P.drag,
      coinChance: P.coinChance,
      goal: P.goal + CONFIG.loopGoal * loop,
      perfectTol: D.perfectTol * M.max(CONFIG.loopTolMin, 1 - CONFIG.loopTol * loop),
      inherit: CONFIG.inherit * D.inherit
    };
  };

  World.prototype._u = function () { return this.layout.unit / 100; };
  World.prototype._crateSize = function () {
    var L = this.layout, s = this.diff.crate * (1 + CONFIG.crateGrow * this.grow);
    return { w: L.crateW0 * s, h: L.crateH0 * s };
  };

  World.prototype._makeBase = function () {
    var L = this.layout, u = L.unit, h = CONFIG.baseH * u;
    this.base = { x: L.cx, y: L.groundY - h / 2, w: CONFIG.baseW * u, h: h, top: L.groundY - h + h * CONFIG.baseTopFrac };
  };

  World.prototype._startLevel = function (level, emit) {
    this.level = level;
    this.zone = ((level % 4) + 4) % 4;
    this.loop = M.floor(level / 4);
    this.planet = this._planetFor(level);
    this.goal = this.planet.goal;
    this.placed = 0;
    this.crates = []; this.coinList = []; this.pivots = [];
    this.held = null; this.falling = null;
    this.flag = null; this.rocket = null;
    this._makeBase();
    this.tower = { sway: 0, prevSway: 0, swayV: 0, height: 0, topY: this.base.top, topX: this.base.x, count: 0, list: [] };
    // on a new planet the camera keeps its place (≈0 after the travel glide) and springs to the new target;
    // on a fresh game it starts on the target
    var camY = emit && this.cam ? this.cam.y : null;
    this.cam = { y: 0, prevY: 0, v: 0 };
    this.phase = 'swing'; this.phaseT = 0;
    this._overPending = false; this._goalPending = false; this._goalCam = undefined;
    this._updateTower();
    this.cam.y = camY === null ? this._camTarget() : camY; this.cam.prevY = this.cam.y;
    this._placeSaucer();
    this.saucer.prevX = this.saucer.x; this.saucer.prevY = this.saucer.y;
    if (emit) this._emit({ type: 'levelUp', level: level, zone: this.zone });
    this._spawn();
  };

  /** Jump straight to level i (fresh tower; emits levelUp). */
  World.prototype.gotoLevel = function (i) {
    i = M.max(0, i | 0);
    this.stats.levels = M.max(this.stats.levels, i);
    this._startLevel(i, true);
  };

  // ---------- public helpers ----------
  /** Coins array (alias kept for the contract name `coins[]`; `coins` is the total count). */
  Object.defineProperty(World.prototype, 'coinsAlive', { get: function () { return this.coinList; } });

  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };
  World.prototype._emit = function (e) { this.events.push(e); };

  World.prototype._swayFrac = function (y, topY) {
    var H = this.layout.groundY - topY;
    if (H <= 1) return 0;
    var f = clamp((this.layout.groundY - y) / H, 0, 1);
    return f * M.sqrt(f);
  };
  /** Horizontal tower offset at world height y (0 at the ground, tower.sway at the top). */
  World.prototype.swayOffset = function (y) { return this.tower.sway * this._swayFrac(y, this.tower.topY); };
  World.prototype.swayOffsetLerp = function (y, alpha) {
    var a = alpha === undefined ? this.alpha : alpha, t = this.tower;
    return (t.prevSway + (t.sway - t.prevSway) * a) * this._swayFrac(y, t.topY);
  };

  // ---------- input ----------
  World.prototype.drop = function () {
    if (this.phase === 'swing' && this.held) { this._release(); return true; }
    if (this.phase === 'over') return false;
    this._buf = this.time;               // one buffered press (newer replaces older)
    return false;
  };

  World.prototype._release = function () {
    var c = this.held, s = this.saucer;
    c.state = 'falling';
    c.vx = this.planet.inherit * s.vx;
    c.vy = 0;
    c.vr = c.vx * CONFIG.spinK;
    c.t = 0;
    this.held = null; this.falling = c;
    this.phase = 'fall'; this.phaseT = 0;
    this._buf = -1;
    this.stats.drops++;
    this._anim('drop');
    this._emit({ type: 'drop', x: c.x, vx: c.vx });
  };

  World.prototype._anim = function (a) { this.saucer.anim = a; this.saucer.animT = 0; };

  // ---------- tower summary ----------
  World.prototype._top = function () {
    var l = this.tower.list;
    if (l.length) { var t = l[l.length - 1]; return { x: t.tx, y: t.y - t.h / 2, w: t.w, crate: t }; }
    return { x: this.base.x, y: this.base.top, w: this.base.w, crate: null };
  };
  World.prototype._updateTower = function () {
    var T = this.tower, top = this._top();
    T.topY = top.y; T.topX = top.x; T.count = T.list.length; this.placed = T.list.length;
    T.height = this.layout.groundY - top.y;
    if (T.count > this.stats.bestTower) this.stats.bestTower = T.count;
  };

  World.prototype._camTarget = function () {
    var L = this.layout, h = this.held ? this.held.h : this._crateSize().h;
    return M.min(0, this.tower.topY - h - L.topLine);
  };

  World.prototype._placeSaucer = function () {
    var s = this.saucer, L = this.layout, u = this._u();
    s.x = L.cx + L.swingA * M.sin(s.phase);
    s.vx = L.swingA * this.planet.swingW * M.cos(s.phase);
    s.y = this.cam.y + L.saucerScreenY + CONFIG.bobAmp * L.unit * M.sin(this.time * CONFIG.bobW);
    return u;
  };
  World.prototype._holdY = function (c) {
    var s = this.saucer, u = this.layout.unit;
    return s.y + CONFIG.emitterDY * u * s.scale + CONFIG.beamGap * u + c.h / 2;
  };

  World.prototype._spawn = function () {
    var sz = this._crateSize(), style = this.rng.int(0, 3);
    if (style === this._lastStyle) style = (style + 1 + this.rng.int(0, 2)) % 4;
    this._lastStyle = style;
    var c = new Crate(++this._id, this.saucer.x, 0, sz.w, sz.h, style);
    c.y = this._holdY(c); c.prevY = c.y; c.hvx = this.saucer.vx;
    this.crates.push(c);
    this.held = c;
    this.phase = 'swing'; this.phaseT = 0;
    this._emit({ type: 'spawn' });
    this._spawnCoins();
    if (this._buf >= 0 && this.time - this._buf <= CONFIG.dropBuffer + 1e-9) this._release();
    this._buf = -1;
  };

  // ---------- coins ----------
  World.prototype._coinBand = function () {
    var L = this.layout, u = L.unit, K = CONFIG.coins;
    // screen space; never overlapping the crate hanging in the beam (its bottom + one coin radius)
    var ch = this.held ? this.held.h : this._crateSize().h, sc = 1 + CONFIG.saucerGrow * this.grow;
    var heldBottom = L.saucerScreenY + (CONFIG.emitterDY * sc + CONFIG.beamGap) * u + ch + CONFIG.bobAmp * u;
    var top = M.max(L.saucerScreenY + K.bandTop * u, heldBottom + (K.r + 0.05) * u);
    var bot = this.tower.topY - this._camTarget() - K.bandBot * u;   // where the camera is heading (it lags one crate at spawn)
    return { top: top, bot: bot };
  };
  World.prototype._spawnCoins = function () {
    var K = CONFIG.coins, L = this.layout, u = L.unit, alive = 0, i;
    for (i = 0; i < this.coinList.length; i++) {
      var c0 = this.coinList[i];
      if (c0.state === 'float' && ++c0.life >= K.life) { c0.state = 'gone'; c0.fade = 1; }
    }
    for (i = 0; i < this.coinList.length; i++) if (this.coinList[i].state === 'float') alive++;
    if (alive >= K.max || !this.rng.chance(this.planet.coinChance)) return;
    var n = this.rng.chance(K.pair) ? 2 : 1, band = this._coinBand();
    if (band.bot - band.top < 2) return;
    for (var k = 0; k < n && alive < K.max; k++) {
      for (var tries = 0; tries < 6; tries++) {
        // most coins hang over the drop path (a good drop grabs them); some sit out on the swing (a risky grab)
        var x = this.rng.chance(K.onPath)
          ? clamp(this.tower.topX + this.rng.range(-0.6, 0.6) * this._crateSize().w, L.cx - L.swingA, L.cx + L.swingA)
          : L.cx + this.rng.range(-0.9, 0.9) * L.swingA;
        var sy = this.rng.range(band.top, band.bot);
        var ok = true;
        for (i = 0; i < this.coinList.length; i++) {
          var o = this.coinList[i];
          if (o.state === 'float' && M.hypot(o.x - x, o.sy - sy) < K.minGap * u) { ok = false; break; }
        }
        if (!ok) continue;
        var y = this._camTarget() + sy;
        this.coinList.push({ id: ++this._id, x: x, y: y, prevX: x, prevY: y, sy: sy, baseY: y, r: K.r * u, t: 0,
          spin: this.rng.range(0, 4), state: 'float', life: 0, ph: this.rng.range(0, 6.283), fade: 1 });
        alive++;
        break;
      }
    }
  };

  // ---------- main loop ----------
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    this.acc += M.min(dt, CONFIG.maxFrame);
    var h = CONFIG.step;
    while (this.acc >= h - 1e-12) { this._step(h); this.acc -= h; }
    if (this.acc < 0) this.acc = 0;
    this.alpha = clamp(this.acc / h, 0, 1);
  };

  World.prototype._step = function (h) {
    var i, c, s = this.saucer, T = this.tower, L = this.layout;
    // prev* for interpolation
    s.prevX = s.x; s.prevY = s.y; s.prevScale = s.scale;
    this.cam.prevY = this.cam.y; T.prevSway = T.sway;
    for (i = 0; i < this.crates.length; i++) { c = this.crates[i]; c.prevX = c.x; c.prevY = c.y; c.prevRot = c.rot; }
    for (i = 0; i < this.coinList.length; i++) { c = this.coinList[i]; c.prevX = c.x; c.prevY = c.y; }
    if (this.rocket) { this.rocket.prevX = this.rocket.x; this.rocket.prevY = this.rocket.y; }

    this.time += h; this.phaseT += h;

    // sway spring
    this._swayStep(T, h);
    // saucer phase (position is placed after the camera moved, below)
    s.phase += this.planet.swingW * h;
    if (s.phase > 1e4) s.phase -= 2 * M.PI * M.floor(s.phase / (2 * M.PI));
    var tScale = 1 + CONFIG.saucerGrow * this.grow;
    s.scale += (tScale - s.scale) * (1 - M.exp(-CONFIG.scaleRate * h));
    var tTilt = clamp(s.vx * CONFIG.tiltK / this._u(), -CONFIG.tiltMax, CONFIG.tiltMax);
    s.tilt += (tTilt - s.tilt) * (1 - M.exp(-CONFIG.tiltRate * h));
    s.animT += h;
    if (s.anim !== 'idle' && s.animT >= (CONFIG.anim[s.anim] || 0.5)) { s.anim = 'idle'; s.animT = 0; }

    // held crate: spring-lagged pendulum under the beam (uses last step's saucer: one step of lag is the spring's input)
    if (this.held) {
      c = this.held; c.t += h;
      var w0 = CONFIG.holdOmega, z = CONFIG.holdZeta;
      c.hvx += (w0 * w0 * (s.x - c.x) - 2 * z * w0 * c.hvx) * h;
      c.x += c.hvx * h;
      c.y = this._holdY(c);
      c.rot = clamp((s.x - c.x) * 0.004 / this._u(), -0.12, 0.12) * 0.5;
    }

    // falling crate
    if (this.falling) this._fallStep(h);

    // pivots + tumblers
    for (i = this.pivots.length - 1; i >= 0; i--) this._pivotStep(this.pivots[i], h, i);
    var anyTumble = false;
    for (i = 0; i < this.crates.length; i++) {
      c = this.crates[i];
      if (c.state === 'toppling' && !c.pivot) { this._tumbleStep(c, h); anyTumble = true; }
      else if (c.state === 'toppling') anyTumble = true;
      if (c.state === 'placed' || c.state === 'falling') { c.t += h; }
      if (c.squash > 0) { c.squash *= M.exp(-CONFIG.squashDecay * h); if (c.squash < 0.002) c.squash = 0; }
      if (c.state === 'placed' && c.x !== c.tx) {
        c.x += (c.tx - c.x) * (1 - M.exp(-CONFIG.slideRate * h));
        if (M.abs(c.tx - c.x) < 0.05) c.x = c.tx;
      }
      if (c.state === 'placed' && c.rot !== 0) { c.rot *= M.exp(-20 * h); if (M.abs(c.rot) < 1e-4) c.rot = 0; }
    }
    // remove gone crates
    for (i = this.crates.length - 1; i >= 0; i--) if (this.crates[i].state === 'gone') this.crates.splice(i, 1);

    // camera (after landings/topples so the top never pokes above topLine), then the saucer rides with it
    this._camStep(h);
    this._placeSaucer();
    if (this.held) this.held.y = this._holdY(this.held);
    // coins
    this._coinStep(h);

    // phases
    if (this.phase === 'settle') {
      var wait = this._settleWait;
      if (this._overPending) {
        if ((!anyTumble && this.phaseT >= M.min(wait, 0.6)) || this.phaseT >= CONFIG.overWait) {
          this.phase = 'over'; this.phaseT = 0; this._anim('oops');
          this._emit({ type: 'gameOver' });
        }
      } else if (this.phaseT >= wait) {
        if (this._goalPending) this._startGoal();
        else this._spawn();
      }
    } else if (this.phase === 'goal') this._goalStep(h);
    else if (this.phase === 'travel') this._travelStep(h);
  };

  World.prototype._swayStep = function (T, h) {
    var w0 = CONFIG.swayOmega, z = CONFIG.swayZeta, lim = CONFIG.swayMax * this.layout.unit;
    T.swayV += (-w0 * w0 * T.sway - 2 * z * w0 * T.swayV) * h;
    T.sway += T.swayV * h;
    if (T.sway > lim) { T.sway = lim; if (T.swayV > 0) T.swayV *= -0.3; }
    else if (T.sway < -lim) { T.sway = -lim; if (T.swayV < 0) T.swayV *= -0.3; }
  };

  World.prototype._camStep = function (h) {
    var cam = this.cam;
    if (this.phase === 'goal' || this.phase === 'travel') {
      // the camera glides down with the rocket (kinematic ease, C¹ at both ends), then stays on the ground
      if (this._goalCam === undefined) this._goalCam = cam.y;
      var t = this.phase === 'goal' ? this.phaseT : CONFIG.goalCamEnd + this.phaseT;
      var e = easeInOut((t - CONFIG.goalCamStart) / (CONFIG.goalCamEnd - CONFIG.goalCamStart));
      var ny = this._goalCam * (1 - e);
      cam.v = (ny - cam.y) / h; cam.y = ny;
      return;
    }
    var target = this._camTarget(), w0 = CONFIG.camOmega;
    cam.v += (w0 * w0 * (target - cam.y) - 2 * w0 * cam.v) * h;
    cam.y += cam.v * h;
    // implicit guard: never let the top climb above topLine (the spring lags by at most one crate)
    var L = this.layout, minScreen = L.topLine;
    if (this.tower.topY - cam.y < minScreen && target < 0) { cam.y = M.min(0, this.tower.topY - minScreen); }
    if (cam.y > 0) { cam.y = 0; if (cam.v > 0) cam.v = 0; }
  };

  // ---------- falling + landing ----------
  /** Advance one falling body by h with planet gravity/drag (exact for constant g). */
  World.prototype._ballistic = function (c, h) {
    var g = this.planet.g * this._u(), d = this.planet.drag;
    if (d > 0) {
      var k = M.exp(-d * h);
      c.x += c.vx * (1 - k) / d; c.vx *= k;
    } else c.x += c.vx * h;
    c.y += c.vy * h + 0.5 * g * h * h;
    c.vy += g * h;
  };

  World.prototype._fallStep = function (h) {
    var c = this.falling, top = this._top();
    var prevBottom = c.y + c.h / 2;
    this._ballistic(c, h);
    c.rot += c.vr * h; c.t += h;
    this._collectCoins(c);
    var bottom = c.y + c.h / 2;
    if (prevBottom <= top.y + 1e-9 && bottom >= top.y) {
      var sx = this.swayOffset(top.y);
      var dx = c.x - (top.x + sx);
      if (M.abs(dx) <= (top.w + c.w) / 2) { this._land(c, top, dx, sx); return; }
      // clean miss: passes by the tower without touching it
      this._missAir(c, dx);
    }
  };

  World.prototype._land = function (c, top, dx, sx) {
    var speed = c.vy, vx = c.vx, u = this._u(), P = this.planet;
    this.falling = null;
    var tol = M.max(P.perfectTol * c.w, CONFIG.perfectSnapFloor * u);
    if (M.abs(dx) > top.w / 2) { this._missPivot(c, top, dx, sx, speed); return; }
    var perfect = M.abs(dx) <= tol;
    c.state = 'placed'; c.perfect = perfect;
    var landX = top.x + dx;               // REST x where it touched (sway is added at draw time)
    c.tx = perfect ? top.x : top.x + dx * (1 - this.diff.assist);
    c.x = c.tx;                            // the COM rule below judges the final resting place…
    c.y = top.y - c.h / 2; c.prevY = M.min(c.prevY, c.y);
    c.vx = 0; c.vy = 0; c.vr = 0; c.rot *= 0.3; c.t = 0;
    c.squash = clamp(speed / (CONFIG.squashRef * u), CONFIG.squashMin, CONFIG.squashMax);
    this.tower.list.push(c);
    this._updateTower();
    this.stats.placed++;
    this._emit({ type: 'land', crate: c, dx: dx, perfect: perfect, speed: speed });
    this.score += CONFIG.placePoints;
    // sway kick: off-centre landings rock the tower; perfect ones only settle it
    var n = this.tower.list.length, hf = M.min(1, n / CONFIG.swayHeightRef), D = this.diff;
    var kick = CONFIG.swayKick * dx * (perfect ? CONFIG.perfectKick : 1) + CONFIG.swayVxKick * vx;
    kick += this.grow * CONFIG.growKick * u * sgn(dx !== 0 ? dx : vx);
    this.tower.swayV += kick * hf * D.sway;
    if (perfect) {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.stats.perfect++;
      this.score += CONFIG.perfectPoints * M.min(this.combo, CONFIG.comboCap);
      this._anim('happy');
      this._emit({ type: 'perfect', crate: c, combo: this.combo });
      if (this.combo >= 2) this._emit({ type: 'combo', combo: this.combo });
    } else {
      this.stats.edges++;
      this._breakCombo();
      this._emit({ type: 'edge', crate: c, dx: dx });
    }
    // centre-of-mass rule
    var toppled = this._checkTopple();
    if (c.state === 'placed') { c.x = landX; c.prevX = landX; }   // …which it slides into (perfect snap / assist)
    if (toppled) {
      this._loseHeart();
      this._enterSettle(CONFIG.missSettle);
    } else {
      if (this.placed >= this.goal) this._goalPending = true;
      this._enterSettle(CONFIG.settleTime);
    }
  };

  World.prototype._breakCombo = function () {
    if (this.combo > 0) this._emit({ type: 'comboBreak', combo: this.combo });
    this.combo = 0;
  };

  World.prototype._enterSettle = function (t) {
    this.phase = 'settle'; this.phaseT = 0; this._settleWait = t;
  };

  World.prototype._loseHeart = function () {
    this.hearts = M.max(0, this.hearts - 1);
    this._emit({ type: 'heartLost', hearts: this.hearts });
    this._anim('oops');
    if (this.hearts <= 0) this._overPending = true;
  };

  World.prototype._missCommon = function (c) {
    this.stats.misses++;
    this._breakCombo();
    this._emit({ type: 'miss', crate: c });
    if (this.grow > 0) { this.grow--; this._emit({ type: 'shrink', grow: this.grow }); }
    this._loseHeart();
    this._enterSettle(CONFIG.missSettle);
  };

  World.prototype._missAir = function (c, dx) {
    this.falling = null;
    c.state = 'toppling';
    c.vr += sgn(dx) * 1.5;
    this._missCommon(c);
  };

  /** A crate whose centre is past the support edge pivots on that corner, then tumbles away. */
  World.prototype._missPivot = function (c, top, dx, sx, speed) {
    var dir = sgn(dx);
    var px = top.x + sx + dir * top.w / 2, py = top.y;
    c.y = py - c.h / 2;                       // resting on the corner at the moment of contact
    c.state = 'toppling'; c.rot = 0; c.vr = 0;
    var g = this._pivotGroup([c], px, py, dir);
    // angular momentum of the impact about the corner: L = m·v·arm → ω0 = v·arm / (k² + r²)
    var arm = M.abs(c.x - px);
    g.omega = CONFIG.impactSpin * speed * arm / g.I;
    c.squash = clamp(speed / (CONFIG.squashRef * this._u()), CONFIG.squashMin, CONFIG.squashMax) * 0.6;
    this._emit({ type: 'land', crate: c, dx: dx, perfect: false, speed: speed });
    this._missCommon(c);
  };

  /** Rigid group rotating about a pivot corner (DESIGN: tipping off an edge). */
  World.prototype._pivotGroup = function (list, px, py, dir) {
    var g = { px: px, py: py, dir: dir, theta: 0, omega: 0, items: [], I: 0, m: 0 };
    for (var i = 0; i < list.length; i++) {
      var c = list[i], m = c.w * c.h, rx = c.x - px, ry = c.y - py;
      g.items.push({ c: c, rx: rx, ry: ry, rot0: c.rot, m: m });
      g.I += m * ((c.w * c.w + c.h * c.h) / 12 + rx * rx + ry * ry);
      g.m += m;
      c.pivot = g; c.state = 'toppling'; c.vx = 0; c.vy = 0; c.vr = 0;
    }
    g.I /= g.m;                                // per unit mass: k² + r²
    this.pivots.push(g);
    return g;
  };

  World.prototype._pivotStep = function (g, h, idx) {
    var gr = this.planet.g * this._u(), phi, cs, sn, i, it, tq = 0;
    phi = g.dir * g.theta; cs = M.cos(phi); sn = M.sin(phi);
    for (i = 0; i < g.items.length; i++) {
      it = g.items[i];
      tq += it.m * (it.rx * cs - it.ry * sn);  // current horizontal arm of each crate's centre
    }
    var alpha = g.dir * gr * (tq / g.m) / g.I;
    g.omega = M.max(g.omega + alpha * h, 0.05);
    g.theta += g.omega * h;
    phi = g.dir * g.theta; cs = M.cos(phi); sn = M.sin(phi);
    var W = g.dir * g.omega, release = g.theta >= CONFIG.releaseAngle, u = this._u();
    for (i = 0; i < g.items.length; i++) {
      it = g.items[i];
      var x = it.rx * cs - it.ry * sn, y = it.rx * sn + it.ry * cs;
      it.c.x = g.px + x; it.c.y = g.py + y; it.c.rot = it.rot0 + phi;
      if (release) {
        it.c.vx = -W * y + g.dir * CONFIG.clearPush * u;
        it.c.vy = W * x;
        it.c.vr = W;
        it.c.pivot = null;
      }
    }
    if (release) this.pivots.splice(idx, 1);
  };

  World.prototype._tumbleStep = function (c, h) {
    var u = this._u(), L = this.layout, B = this.base;
    c.t += h;
    if (c.rest > 0) {
      c.rest += h;
      c.vx *= M.exp(-6 * h); c.x += c.vx * h;
      var q = M.round(c.rot / (M.PI / 2)) * (M.PI / 2);
      c.rot += (q - c.rot) * (1 - M.exp(-14 * h));     // a crate resting on a corner falls flat
      c.y = c.floor - (M.abs(c.w / 2 * M.sin(c.rot)) + M.abs(c.h / 2 * M.cos(c.rot)));
      if (c.rest > CONFIG.restFade) c.alpha = M.max(0, 1 - (c.rest - CONFIG.restFade) / CONFIG.fadeTime);
      if (c.alpha <= 0) c.state = 'gone';
      return;
    }
    this._ballistic(c, h);
    c.rot += c.vr * h;
    var hey = M.abs(c.w / 2 * M.sin(c.rot)) + M.abs(c.h / 2 * M.cos(c.rot));
    var onBase = M.abs(c.x - B.x) < B.w / 2 && c.y - c.vy * h + hey <= B.top + 2 && !this._overTowerColumn(c);
    var floor = onBase ? B.top : L.groundY;
    if (c.y + hey >= floor) {
      c.y = floor - hey; c.floor = floor;
      if (onBase) {
        // on the launch pad shelf: slide/tip towards its outer edge
        if (c.vy > CONFIG.bounceMin * u) c.vy = -c.vy * CONFIG.bounce; else c.vy = 0;
        var dir = sgn(c.x - B.x);
        c.vx = c.vx * 0.9 + dir * CONFIG.slideAcc * u * h;
        c.vr *= 0.9;
      } else if (c.vy > CONFIG.bounceMin * u) {
        c.vy = -c.vy * CONFIG.bounce; c.vx *= CONFIG.groundFriction; c.vr *= 0.55;
        c.onGround = true;
      } else {
        c.vy = 0; c.vr = 0; c.rest = h; c.onGround = true;
      }
    }
    if (M.abs(c.x - L.cx) > L.width * 0.75 + c.w || c.y > L.groundY + L.height) c.state = 'gone';
  };
  World.prototype._overTowerColumn = function (c) {
    var l = this.tower.list;
    for (var i = 0; i < l.length; i++) if (M.abs(c.x - l[i].x) < (l[i].w + c.w) / 2 * 0.8 && c.y < l[i].y) return true;
    return false;
  };

  /** Centre-of-mass rule (DESIGN §5.1). Returns the number of toppled crates (0 if stable). */
  World.prototype._checkTopple = function () {
    var total = 0, lowestY = null;
    for (var guard = 0; guard < 50; guard++) {
      var l = this.tower.list, n = l.length, found = -2, comX = 0, dir = 1;
      // supports from the bottom up (−1 = the launch pad): the lowest joint that fails takes everything above
      for (var i = -1; i < n - 1; i++) {
        var m = 0, sx = 0;
        for (var j = i + 1; j < n; j++) { var mj = l[j].w * l[j].h; m += mj; sx += mj * l[j].tx; }
        comX = sx / m;
        var sup = i < 0 ? this.base : l[i];
        var supX = i < 0 ? sup.x : sup.tx;
        if (M.abs(comX - supX) > sup.w / 2 + 1e-6) { found = i; dir = sgn(comX - supX); break; }
      }
      if (found === -2) break;
      var sup2 = found < 0 ? this.base : l[found];
      var supTop = found < 0 ? this.base.top : sup2.y - sup2.h / 2;
      var sxTop = this.swayOffset(supTop);
      var group = l.splice(found + 1);
      for (var k = 0; k < group.length; k++) {         // into drawn (swayed) world positions: they are free bodies now
        group[k].x = group[k].tx + this.swayOffset(group[k].y); group[k].prevX = group[k].x;
      }
      var g = this._pivotGroup(group, (found < 0 ? sup2.x : sup2.tx) + sxTop + dir * sup2.w / 2, supTop, dir);
      g.omega = CONFIG.toppleSpin0;
      total += group.length;
      if (lowestY === null || group[0].y > lowestY) lowestY = group[0].y;
      this._updateTower();
    }
    if (total) {
      this.stats.topples++;
      this.tower.swayV *= 0.4;
      this._breakCombo();
      this._emit({ type: 'topple', count: total, y: lowestY });
    }
    return total;
  };

  // ---------- coins ----------
  World.prototype._coinStep = function (h) {
    var K = CONFIG.coins, u = this.layout.unit;
    for (var i = this.coinList.length - 1; i >= 0; i--) {
      var c = this.coinList[i];
      c.t += h; c.spin = (c.spin + K.spinRate * h) % 4;
      if (c.state === 'float') {
        // anchored in the world where the camera is heading; floats up gently as the tower grows
        c.baseY += (this._camTarget() + c.sy - c.baseY) * (1 - M.exp(-CONFIG.coins.follow * h));
        c.y = c.baseY + K.bob * u * M.sin(c.ph + c.t * K.bobW);
        if (c.y > this.tower.topY - c.r) { c.state = 'gone'; }   // the tower grew into it (rare)
      } else if (c.state === 'collected') {
        if (c.t > 0.6) c.state = 'gone';
      }
      if (c.state === 'gone') {
        c.fade = (c.fade || 1) - h / 0.25;
        if (c.fade <= 0) this.coinList.splice(i, 1);
      }
    }
  };

  World.prototype._collectCoins = function (cr) {
    for (var i = 0; i < this.coinList.length; i++) {
      var c = this.coinList[i];
      if (c.state !== 'float') continue;
      var nx = clamp(c.x, cr.x - cr.w / 2, cr.x + cr.w / 2), ny = clamp(c.y, cr.y - cr.h / 2, cr.y + cr.h / 2);
      var ddx = c.x - nx, ddy = c.y - ny;
      if (ddx * ddx + ddy * ddy > c.r * c.r) continue;
      c.state = 'collected'; c.t = 0;
      this.coins++; this.stats.coins++;
      this.score += CONFIG.coinPoints;
      this._emit({ type: 'coin', coin: c, x: c.x, y: c.y, total: this.coins });
      if (this.grow < CONFIG.growMax) {
        this.growCoins++;
        if (this.growCoins >= CONFIG.growEvery) {
          this.growCoins = 0; this.grow++; this.stats.grows++;
          this._emit({ type: 'grow', grow: this.grow });
        }
      }
    }
  };

  // ---------- goal → rocket → travel → levelUp ----------
  World.prototype._startGoal = function () {
    this._goalPending = false;
    var top = this._top(), L = this.layout, u = L.unit;
    this.phase = 'goal'; this.phaseT = 0; this._goalCam = this.cam.y;
    this.flag = { x: top.x, y: top.y, t: 0 };
    var bonus = CONFIG.goalPoints * (this.zone + 1) * (this.loop + 1);
    this.score += bonus;
    this._anim('happy');
    this._emit({ type: 'goal', x: top.x + this.swayOffset(top.y), y: top.y - CONFIG.flagH * u, bonus: bonus });
    // remove the held crate if any (none: goal starts from settle) and float coins fade
    for (var i = 0; i < this.coinList.length; i++) if (this.coinList[i].state === 'float') { this.coinList[i].state = 'gone'; this.coinList[i].fade = 1; }
  };

  World.prototype._rocketLandY = function () { return this.layout.groundY - CONFIG.rocketHalfH * this.layout.unit; };

  World.prototype._goalStep = function (h) {
    var t = this.phaseT, L = this.layout, u = L.unit;
    if (this.flag) this.flag.t += h;
    if (t >= CONFIG.rocketIn) {
      var rx = L.cx + CONFIG.rocketDX * u;
      var s = (t - CONFIG.rocketIn) / (CONFIG.rocketLand - CONFIG.rocketIn);
      var y0 = -1.2 * u, y1 = this._rocketLandY() - 0;       // screen-relative start, world landing
      var y = s >= 1 ? y1 : (this.cam.y + y0) + (y1 - (this.cam.y + y0)) * easeOutCubic(s);
      if (!this.rocket) this.rocket = { x: rx, y: y, prevX: rx, prevY: y, state: 'in', t: 0, vy: 0 };
      var r = this.rocket;
      r.t += h; r.x = rx; r.y = y;
      if (s >= 1 && r.state === 'in') {
        r.state = 'land'; r.y = y1;
        this._emit({ type: 'rocket' });
      }
    }
    if (t >= CONFIG.goalTime) {
      if (this.rocket && this.rocket.state === 'in') { this.rocket.state = 'land'; this.rocket.y = this._rocketLandY(); this._emit({ type: 'rocket' }); }
      this.phase = 'travel'; this.phaseT = 0;
      if (this.rocket) { this.rocket.state = 'out'; this.rocket.vy = 0; this.rocket.t = 0; }
    }
  };

  World.prototype._travelStep = function (h) {
    var t = this.phaseT, u = this._u();
    var a = M.max(0, 1 - t / (CONFIG.travelTime * 0.8));
    for (var i = 0; i < this.crates.length; i++) this.crates[i].alpha = M.min(this.crates[i].alpha, a);
    if (this.flag) { this.flag.t += h; }
    var r = this.rocket;
    if (r) { r.t += h; r.vy -= CONFIG.rocketAcc * u * h; r.y += r.vy * h; }
    if (t >= CONFIG.travelTime) {
      this._goalCam = undefined;
      this.stats.levels++;
      this.hearts = M.min(this.maxHearts, this.hearts + CONFIG.heartReward);
      this._startLevel(this.level + 1, true);
    }
  };

  // ---------- prediction (pure; used by the bot and the renderer's drop guide) ----------
  /** Where would the held crate land if released now? {x, dx, perfect, ok, landY} or null. */
  World.prototype.predictLanding = function () {
    var c = this.held;
    if (!c) return null;
    var top = this._top(), u = this._u(), P = this.planet;
    var b = { x: c.x, y: c.y, vx: P.inherit * this.saucer.vx, vy: 0 };
    var sw = { sway: this.tower.sway, swayV: this.tower.swayV };
    var h = CONFIG.step;
    for (var n = 0; n < 4000; n++) {
      var prevBottom = b.y + c.h / 2;
      this._ballistic(b, h);
      this._swayStep(sw, h);
      var bottom = b.y + c.h / 2;
      if (prevBottom <= top.y + 1e-9 && bottom >= top.y) {
        var sx = sw.sway * this._swayFrac(top.y, this.tower.topY);
        var dx = b.x - (top.x + sx);
        var tol = M.max(P.perfectTol * c.w, CONFIG.perfectSnapFloor * u);
        var ok = M.abs(dx) <= top.w / 2, perfect = M.abs(dx) <= tol;
        return { x: perfect ? top.x + sx : b.x, dx: dx, perfect: perfect, ok: ok,
          landY: ok ? top.y - c.h / 2 : this.layout.groundY - c.h / 2, topX: top.x + sx, topW: top.w, tol: tol };
      }
    }
    return null;
  };

  // ---------- layout changes ----------
  /** Recompute the layout for a new view size and re-anchor everything (x by the cx change, y by the
   *  groundY change; sizes, offsets and speeds scale with the unit change). */
  World.prototype.setLayout = function (w, h) {
    var o = this.layout, L = World.computeLayout(w, h);
    if (o.width === L.width && o.height === L.height) return;
    var k = L.unit / o.unit;
    function X(x) { return L.cx + (x - o.cx) * k; }
    function Y(y) { return L.groundY - (o.groundY - y) * k; }
    this.layout = L;
    var i, c;
    for (i = 0; i < this.crates.length; i++) {
      c = this.crates[i];
      c.x = X(c.x); c.tx = X(c.tx); c.y = Y(c.y); c.w *= k; c.h *= k; c.vx *= k; c.vy *= k; c.hvx *= k;
      c.prevX = c.x; c.prevY = c.y; c.prevRot = c.rot;
    }
    for (i = 0; i < this.pivots.length; i++) {
      var g = this.pivots[i]; g.px = X(g.px); g.py = Y(g.py); g.I *= k * k;
      for (var j = 0; j < g.items.length; j++) { g.items[j].rx *= k; g.items[j].ry *= k; g.items[j].m *= k * k; }
      g.m *= k * k;
    }
    this._makeBase();
    var T = this.tower; T.sway *= k; T.swayV *= k; T.prevSway = T.sway;
    this._updateTower();
    if (this.flag) { this.flag.x = X(this.flag.x); this.flag.y = Y(this.flag.y); }
    if (this.rocket) { this.rocket.x = X(this.rocket.x); this.rocket.y = Y(this.rocket.y); this.rocket.vy *= k; this.rocket.prevX = this.rocket.x; this.rocket.prevY = this.rocket.y; }
    // camera: straight to its new target (no spring from a stale value)
    if (this.phase === 'goal' || this.phase === 'travel') { if (this._goalCam !== undefined) this._goalCam *= k; this.cam.y *= k; }
    else this.cam.y = this._camTarget();
    this.cam.v = 0; this.cam.prevY = this.cam.y;
    var s = this.saucer;
    this._placeSaucer(); s.prevX = s.x; s.prevY = s.y;
    if (this.held) { this.held.y = this._holdY(this.held); this.held.prevY = this.held.y; }
    // coins: keep their place in the fall band (screen-relative), x re-anchored
    var band = this._coinBand(), ob = { top: o.saucerScreenY + CONFIG.coins.bandTop * o.unit };
    for (i = 0; i < this.coinList.length; i++) {
      c = this.coinList[i];
      c.x = X(c.x); c.r *= k;
      c.sy = clamp(band.top + (c.sy - ob.top) * k, band.top, M.max(band.top, band.bot));
      c.baseY = this._camTarget() + c.sy; c.y = c.baseY; c.prevX = c.x; c.prevY = c.y;
    }
  };

  // ---------- test hooks ----------
  /** Build a tower of placed crates at rest offsets dxs[i] (px from cx, ×u). Test/debug helper. */
  World.prototype.setTower = function (dxs) {
    var L = this.layout, u = this._u(), i;
    for (i = this.crates.length - 1; i >= 0; i--) if (this.crates[i].state === 'placed') this.crates.splice(i, 1);
    this.tower.list = [];
    this._updateTower();
    var sz = this._crateSize(), y = this.base.top;
    for (i = 0; i < dxs.length; i++) {
      var c = new Crate(++this._id, L.cx + dxs[i] * u, y - sz.h / 2, sz.w, sz.h, i % 4);
      c.state = 'placed'; c.tx = c.x; y -= sz.h;
      this.crates.push(c); this.tower.list.push(c);
    }
    this.tower.sway = this.tower.swayV = this.tower.prevSway = 0;
    this._updateTower();
    if (this.held) { this.held.y = this._holdY(this.held); }
    this.cam.y = this._camTarget(); this.cam.prevY = this.cam.y; this.cam.v = 0;
    this._placeSaucer();
    if (this.held) { this.held.y = this._holdY(this.held); this.held.prevY = this.held.y; }
  };

  /** Plain summary for tests (no object identity, JSON-safe). */
  World.prototype.getState = function () {
    var r = function (v) { return M.round(v * 1000) / 1000; };
    return {
      time: r(this.time), phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      score: this.score, combo: this.combo, maxCombo: this.maxCombo, hearts: this.hearts, maxHearts: this.maxHearts,
      difficulty: this.difficulty, coins: this.coins, grow: this.grow, growCoins: this.growCoins,
      placed: this.placed, goal: this.goal,
      cam: { y: r(this.cam.y) },
      saucer: { x: r(this.saucer.x), y: r(this.saucer.y), scale: r(this.saucer.scale), anim: this.saucer.anim },
      tower: { sway: r(this.tower.sway), height: r(this.tower.height), topY: r(this.tower.topY), topX: r(this.tower.topX), count: this.tower.count },
      crates: this.crates.map(function (c) { return { id: c.id, style: c.style, x: r(c.x), y: r(c.y), w: r(c.w), state: c.state, perfect: c.perfect, rot: r(c.rot) }; }),
      coinsAlive: this.coinList.map(function (c) { return { x: r(c.x), y: r(c.y), state: c.state }; }),
      held: !!this.held, flag: !!this.flag, rocket: this.rocket ? this.rocket.state : null,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  MS.World = World;
  MS.CONFIG = CONFIG;
})(window.MS = window.MS || {});
