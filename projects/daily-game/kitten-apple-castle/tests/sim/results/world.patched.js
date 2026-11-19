/* Ziggy's Apple Castle — AC.World (headless, deterministic) + AC.World.CONFIG
 *
 * Contract: docs/DESIGN.md §2 and §5.1. Physics model, tuning and tables: docs/MECHANICS.md.
 * Units: px (logical, y DOWN) and seconds. Every length and acceleration in CONFIG is given for
 * layout.unit = 100 and is multiplied by unit/100 ("u") at use, so the game plays the same on any screen.
 * Everything runs in fixed sub-steps of CONFIG.step: same seed + same drop() calls at the same
 * simulated times → same game at any frame rate.
 *
 *   var w = new AC.World({ seed: 7, difficulty: 'easy', width: 960, height: 540, level: 0 });
 *   w.drop(); w.update(1/60); ...
 *   var ev = w.drainEvents();          // [{type:'drop', x, vx}, {type:'land', ...}, ...]
 *   // render: lerp prevX/prevY/prevRot → x/y/rot, cam.prevY → cam.y, tower.prevSway → sway with w.alpha
 *   var L = w.lights();                // [{x, y, r, a}] world coords: cut these out of the darkness layer
 *
 * The tower is `this.tower.list` (placed crates, bottom first). Placed crates keep their REST x; the
 * tower's sway is a separate damped spring added at draw time by swayOffset(y).
 * The twist: `light` (0..1) slides from the current time of day's light toward the next one's as the
 * tower grows; Perfect drops hang lanterns that light the tower up again.
 */
(function (AC) {
  'use strict';
  var M = Math;

  var CONFIG = {
    step: 1 / 120,          // s      fixed sub-step: a falling crate at 900 px/s moves 7.5 px per step (< ⅒ crate), landings are crisp
    maxFrame: 0.25,         // s      longest frame simulated (hidden tab → no fast-forward of minutes)

    // ---- layout pieces (DESIGN §2/§4; lengths in "unit" multiples) ----
    baseW: 2.4,             // unit   stone plinth width (base.svg 240 px at unit 100)
    baseH: 0.64,            // unit   plinth height
    baseTopFrac: 4 / 64,    // ×h     base.svg's flat top is y = 4 of 64: crates sit there, not on the box top
    saucerSize: 1.55,       // unit   Ziggy + hover-rocket drawn square
    emitterDY: 0.6,         // unit   body centre (80,78) → lantern emitter (80,140) of the 160 viewBox: 62/160 × 1.55
    beamGap: 0.3,           // unit   visible lantern glow between emitter and the held crate's top
    flagH: 1.2,             // unit   goal pennant height (its little lantern sits on top)

    // ---- crates ----
    holdOmega: 18,          // rad/s  held crate follows the rocket on a spring: ≈0.07 s lag, a soft pendulum swing-out…
    holdZeta: 0.6,          // —      …that overshoots ≈10 % at the turn-arounds (reads as "hanging", never wobbly)
    inherit: 0.3,           // ×      share of the rocket's sideways speed a released crate keeps (the glow damps the rest; ×difficulty.inherit)
    spinK: 0.0006,          // rad/s per px/s  a moving release spins the crate a hair (≈0.05 rad over a fall), purely cosmetic
    squashRef: 900,         // px/s   landing speed that gives squash 1.0 (×u)…
    squashMin: 0.15,        // —      …but even a short drop squashes visibly (the wooden "thunk")
    squashMax: 0.65,        // —      …and a long one stays cartoon-readable
    squashDecay: 7,         // 1/s    squash fades to <10 % in 0.33 s (a "thunk", then still)
    slideRate: 28,          // 1/s    perfect snap / assist slide: 95 % in 0.11 s (reads as a snap, but no 1-frame jump)

    // ---- landing rules & score ----
    perfectSnapFloor: 6,    // px     (×u) perfect zone is never smaller than this (later loops)
    comboCap: 5,            // ×      perfect bonus multiplier cap (REQUIREMENT)
    placePoints: 10,        // pts    every crate that stays
    perfectPoints: 10,      // pts    × min(combo, comboCap) on a perfect
    goalPoints: 100,        // pts    × (zone+1) × (loop+1)
    settleTime: 0.5,        // s      after a crate stays: squash + sway read before the next crate appears
    missSettle: 0.9,        // s      after a miss/topple: time to watch the tumble (and for Ziggy's "oops")
    overWait: 1.6,          // s      max wait for tumbling crates before game over is announced

    // ---- apples & pies (REQUIREMENT "Score and lose") ----
    applePoints: 5,         // pts    an apple in daylight
    appleGlowPoints: 10,    // pts    a "glow apple" (collected while light < glowBelow): rewards stacking on into the dark
    glowBelow: 0.5,         // light  below this ambient light apples glow (and score double)
    pieEvery: 5,            // apples Granny Boo bakes a pie every 5 apples → +1 heart (up to maxHearts)
    apples: { max: 3, life: 3, r: 0.21, bandTop: 0.8, bandBot: 0.45, minGap: 0.65, bob: 0.06, bobW: 2.6, rock: 0.14, flutter: 2.2, pair: 0.25, onPath: 0.7, follow: 3 },
    //       max alive · life in drops · radius (unit; apple drawn 0.42 unit) · fall band: centre ≥ rocket + 0.8 unit (and
    //       below the held crate) and ≤ tower top − 0.45 unit · min gap between apples (unit) · bob amplitude (unit) ·
    //       bob rad/s (period 2.4 s) · rock: rotation amplitude (rad) of the hanging-pendulum rock, a quarter period
    //       ahead of the bob (an apple hanging from an invisible stem) · flutter: leaf frame flips per s (apple_0/apple_1) ·
    //       chance of a second apple · share placed over the drop path (top x ± 0.6 crate), the rest anywhere on the
    //       swing (a risky grab) · follow 1/s: apples drift up with the tower (63 % in 0.33 s) so they stay in the fall band

    // ---- light: the day-to-night twist (DESIGN §5.1) ----
    nightEnd: 0.24,         // light  where Night's light ends (darkest point; still readable, never black)
    lightRate: 1.0,         // 1/s    world.light eases toward its target: 63 % in 1 s — a change you notice, never a jump
    darkNoise: 0.7,         // ×      the bot's timing/aim noise is × (1 + darkNoise·(1 − lit)): ×1.5 on an unlit Night top (Normal 0.5-skill
                            //        night misses 20 % → 31 % of drops; 1.0 gave 34 %, too punishing; Easy kid 2 % → 8 %)
    lightFalloff: 2,        // —      light falloff (1 − (d/r)²)^2 used by predictLanding().lit (matches a soft radial gradient)
    lights: {               // radius in unit, a = strength 0..1 (DESIGN §5.1)
      ziggy:   { r: 2.0, a: 1 },    // Ziggy's lantern at the emitter
      held:    { r: 1.1, a: 0.6 },  // the crate hanging in her glow
      falling: { r: 0.9, a: 0.45 }, // (extra) a released crate keeps a little glow until it lands
      lantern: { r: 1.5, a: 0.9 },  // a lantern hung by a Perfect drop
      apple:   { r: 0.55, a: 0.5 }, // a floating glow apple (only when dark)
      flag:    { r: 1.2, a: 1 },    // the goal pennant's little lantern
      ghost:   { r: 1.1, a: 0.55 }, // (extra) Granny Boo glows softly
      maxLanterns: 10               // only the top 10 lanterns of the tower are lights (cheap darkness pass)
    },
    lantern: { hookIn: 0.12, hookDown: 0.1, bodyDY: 0.25, omega: 5.8, zeta: 0.12, kick: 2.2, maxRot: 0.6 },
    //       hook point: hookIn unit inside the crate's side edge, hookDown unit below its top · light centre bodyDY unit
    //       below the hook (lantern drawn 0.34×0.45 unit) · the lantern is a little pendulum on its hook: ω = √(g/ℓ) with
    //       ℓ = bodyDY ≈ 0.25 unit → ≈5.6, tuned to 5.8 rad/s (a 1.1 s swing), ζ 0.12 (swings ≈4 times), driven by the hook's sideways
    //       acceleration (tower sway) and kicked kick rad/s when it is hung · |rot| ≤ maxRot rad

    // ---- tumbles (miss pivot + centre-of-mass topple) ----
    impactSpin: 0.55,       // ×      share of the impact's angular momentum about the edge corner kept as spin (rest lost to the "thunk")
    toppleSpin0: 0.6,       // rad/s  a COM topple starts from a gentle nudge (the support gives way)
    releaseAngle: 0.6,      // rad    pivoting crates slide off the corner after tipping ≈34° (friction cone of wood on wood)
    clearPush: 60,          // px/s   (×u) small outward push at release so tumblers clear the tower they fell from
    slideAcc: 900,          // px/s²  (×u) a tumbler resting on the plinth slides/tips off its outer edge
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
    swayHeightRef: 4,       // crates the kick ramps up to full strength over the first 4 crates (a short tower is stiff)
    swayMax: 0.32,          // unit   hard limit of the top sway (×u) — keeps the landing target fair

    // ---- camera ----
    camOmega: 5,            // rad/s  critically damped spring to the target: 90 % in ≈0.8 s, never overshoots

    // ---- Ziggy's hover-rocket ----
    bobAmp: 0.04,           // unit   gentle hover bob…
    bobW: 2.2,              // rad/s  …period ≈2.9 s
    tiltK: 0.00045,         // rad per px/s (÷u)  leans into the swing…
    tiltMax: 0.2,           // rad    …at most ≈11°
    tiltRate: 8,            // 1/s    tilt eases (no snapping)
    anim: { drop: 0.35, happy: 0.8, oops: 0.95 }, // s  pose durations before back to idle
    dropBuffer: 0.25,       // s      a press while no crate is held is kept this long (one press only)

    // ---- goal show: Granny Boo (DESIGN §5.1) ----
    goalTime: 3.0,          // s      the whole show in phase 'goal' (flag at 0 s)
    ghostIn: 0.35,          // s      Granny Boo appears off-screen at the side…
    ghostArrive: 1.45,      // s      …and arrives beside the tower top (x ease-out cubic, y smoothstep → a curved path that slows to a stop)
    ghostWaveOn: 1.7,       // s      waves (ghost_wave frame)…
    ghostWaveOff: 2.8,      // s      …until here
    ghostDX: 1.3,           // unit   hover centre beside the tower top (crate ½w ≤ 0.75 + ghost ½w 0.45 + a gap)
    ghostDY: -0.45,         // unit   hover centre relative to the tower top (her hem is level with the top crate)
    ghostFrom: 1.1,         // unit   she starts this far above her hover point (floats DOWN in, like the requirement says)
    ghostBob: 0.07,         // unit   hover bob amplitude…
    ghostBobW: 3.2,         // rad/s  …period ≈2 s
    ghostRiseAcc: 700,      // px/s²  (×u) in travel she floats up and away (and drifts outward 40 % of that)
    travelTime: 1.2,        // s      crates fade, the camera glides down to the ground (C¹ smoothstep), then levelUp
    heartReward: 1,         // —      hearts back on every new time of day (up to max)

    // ---- loops (after Night the day starts again) ----
    loopSwing: 0.12,        // ×/loop rocket swings 12 % faster each round…
    loopSwingCap: 1.6,      // ×      …up to 60 % faster
    loopG: 0.06,            // ×/loop slightly heavier crates each round
    loopGoal: 1,            // crates more per round (fox-moon-stack playtest: +1 keeps 45–60 s per level)
    loopTol: 0.06,          // ×/loop perfect zone shrinks 6 % per round…
    loopTolMin: 0.8,        // ×      …to at least 80 % (70 % left Hard 1–2-frame perfect windows)

    // ---- per difficulty (Easy is tuned for a 6-year-old; values from the fox-moon-stack playtest) ----
    difficulty: {
      easy:   { swing: 0.52, crate: 1.45, perfectTol: 0.22,  hearts: 5, inherit: 0.5,  sway: 0.65, assist: 0.6 },
      normal: { swing: 1.0,  crate: 1.0,  perfectTol: 0.15,  hearts: 3, inherit: 1.0,  sway: 1.0,  assist: 0.5 },
      hard:   { swing: 1.22, crate: 0.9,  perfectTol: 0.11,  hearts: 3, inherit: 1.15, sway: 1.25, assist: 0.35 }
    },
    //  swing = × zone swingW · crate = × crate size · perfectTol = |dx| ≤ tol·w is perfect · hearts at start/max
    //  inherit = × CONFIG.inherit · sway = × sway kicks · assist = share of an off-centre landing the glow
    //  pulls back toward the centre (the crate slides in over ≈0.12 s; Easy forgives lean, Hard is nearly raw physics)

    // ---- times of day (zone = level % 4) ----
    zones: [
      { key: 'dawn',   light: 0.85, g: 760,  swingW: 1.75, drag: 0,    appleChance: 0.55, goal: 10 },  // soft light, slow swing (5 s period on Easy), gentle falls
      { key: 'noon',   light: 1.0,  g: 980,  swingW: 1.95, drag: 0.1,  appleChance: 0.6,  goal: 12 },  // brightest; a breeze trims the sideways drift a little
      { key: 'sunset', light: 0.55, g: 1120, swingW: 2.2,  drag: 0.15, appleChance: 0.6,  goal: 13 },  // getting dim: lanterns start to matter
      { key: 'night',  light: 0.3,  g: 1220, swingW: 2.35, drag: 0.1,  appleChance: 0.65, goal: 14 }   // dark + fastest swing, but gentler than fox's comet (the dark is the challenge)
    ]
    //  light 0..1 at the START of the zone (it eases toward the next zone's light, Night → nightEnd) · g px/s² (×u) ·
    //  swingW rad/s (phase speed of x = cx + swingA·sin φ) · drag 1/s on vx (0 = none) · apple chance per crate · goal crates
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
    this.lantern = false; this.lanternSide = 1; this.lanternRot = 0; this.prevLanternRot = 0; this.lanternW = 0;
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
    this.rng = new AC.RNG(this.seed);
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = CONFIG.difficulty[this.difficulty];
    this.layout = World.computeLayout(opts.width || 960, opts.height || 540);
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.events = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.maxHearts = this.diff.hearts; this.hearts = this.maxHearts;
    this.apples = 0; this.pieApples = 0;
    this.stats = { drops: 0, placed: 0, perfect: 0, edges: 0, misses: 0, topples: 0, apples: 0, glowApples: 0, pies: 0, lanterns: 0, levels: 0, bestTower: 0 };
    this._id = 0; this._lastStyle = -1; this._buf = -1;
    var L = this.layout;
    this.saucer = { x: L.cx, prevX: L.cx, y: 0, prevY: 0, vx: 0, phase: 0, scale: 1, prevScale: 1, anim: 'idle', animT: 0, tilt: 0 };
    this.level = opts.level | 0;
    this._startLevel(this.level, false, true);
  };

  // ---------- zones & sizes ----------
  World.prototype._zoneFor = function (level) {
    var zone = ((level % 4) + 4) % 4, loop = M.floor(level / 4), Z = CONFIG.zones[zone], D = this.diff;
    return {
      key: Z.key, zone: zone, loop: loop,
      light: Z.light, lightEnd: zone === 3 ? CONFIG.nightEnd : CONFIG.zones[zone + 1].light,
      g: Z.g * (1 + CONFIG.loopG * loop),
      swingW: Z.swingW * D.swing * M.min(CONFIG.loopSwingCap, 1 + CONFIG.loopSwing * loop),
      drag: Z.drag,
      appleChance: Z.appleChance,
      goal: Z.goal + CONFIG.loopGoal * loop,
      perfectTol: D.perfectTol * M.max(CONFIG.loopTolMin, 1 - CONFIG.loopTol * loop),
      inherit: CONFIG.inherit * D.inherit
    };
  };

  World.prototype._u = function () { return this.layout.unit / 100; };
  World.prototype._crateSize = function () {
    var L = this.layout, s = this.diff.crate;
    return { w: L.crateW0 * s, h: L.crateH0 * s };
  };

  World.prototype._makeBase = function () {
    var L = this.layout, u = L.unit, h = CONFIG.baseH * u;
    this.base = { x: L.cx, y: L.groundY - h / 2, w: CONFIG.baseW * u, h: h, top: L.groundY - h + h * CONFIG.baseTopFrac };
  };

  World.prototype._startLevel = function (level, emit, instantLight) {
    this.level = level;
    this.zone = ((level % 4) + 4) % 4;
    this.loop = M.floor(level / 4);
    this.planet = this._zoneFor(level);          // DESIGN keeps the fox name `planet` for the zone params
    this.goal = this.planet.goal;
    this.placed = 0;
    this.crates = []; this.appleList = []; this.pivots = [];
    this.held = null; this.falling = null;
    this.flag = null; this.ghost = null;
    this._lanternSide = -1;
    this._prog = 0;                               // max tower progress placed/goal reached in this level (light never goes back)
    if (instantLight || this.light === undefined) { this.light = this.planet.light; this._progE = 0; }
    this._progE = 0;
    this.dayT = this.zone;
    this.lightTint = this.planet.key;
    this._makeBase();
    this.tower = { sway: 0, prevSway: 0, swayV: 0, swayA: 0, height: 0, topY: this.base.top, topX: this.base.x, count: 0, list: [] };
    // on a new time of day the camera keeps its place (≈0 after the travel glide) and springs to the new target;
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

  /** Jump straight to level i (fresh tower; emits levelUp; the light jumps to that time of day). */
  World.prototype.gotoLevel = function (i) {
    i = M.max(0, i | 0);
    this.stats.levels = M.max(this.stats.levels, i);
    this._startLevel(i, true, true);
  };

  // ---------- public helpers ----------
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

  /** Where a lantern crate's lantern hangs (world coords, sway included for placed crates; pure):
   *  {x, y} = the hook (lantern.svg's (24, 0)), {lx, ly} = the glowing body centre, rot = pendulum angle (rad, about the hook). */
  World.prototype.lanternPos = function (c, alpha) {
    var K = CONFIG.lantern, u = this.layout.unit, s = c.lanternSide;
    var sx = c.state === 'placed' ? (alpha === undefined ? this.swayOffset(c.y) : this.swayOffsetLerp(c.y, alpha)) : 0;
    var cs = M.cos(c.rot), sn = M.sin(c.rot);
    var ox = s * (c.w / 2 - K.hookIn * u), oy = -c.h / 2 + K.hookDown * u;      // crate-local, rotated with the crate
    var hx = c.x + sx + ox * cs - oy * sn, hy = c.y + ox * sn + oy * cs;
    var a = c.lanternRot + c.rot, d = K.bodyDY * u;
    return { x: hx, y: hy, lx: hx - M.sin(a) * d, ly: hy + M.cos(a) * d, rot: a };
  };

  /** Light sources for the darkness layer, world coords (pure, no RNG): [{x, y, r, a, kind}]. */
  World.prototype.lights = function () {
    var out = [], u = this.layout.unit, LC = CONFIG.lights, s = this.saucer, i, c;
    out.push({ x: s.x, y: s.y + CONFIG.emitterDY * u, r: LC.ziggy.r * u, a: LC.ziggy.a, kind: 'ziggy' });
    if (this.held) out.push({ x: this.held.x, y: this.held.y, r: LC.held.r * u, a: LC.held.a, kind: 'held' });
    if (this.falling) out.push({ x: this.falling.x, y: this.falling.y, r: LC.falling.r * u, a: LC.falling.a, kind: 'falling' });
    this._towerLights(out);
    if (this.light < CONFIG.glowBelow) {
      for (i = 0; i < this.appleList.length; i++) {
        c = this.appleList[i];
        if (c.state === 'float') out.push({ x: c.x, y: c.y, r: LC.apple.r * u, a: LC.apple.a, kind: 'apple' });
      }
    }
    if (this.flag) out.push({ x: this.flag.x + this.swayOffset(this.flag.y), y: this.flag.y - CONFIG.flagH * u * 0.9, r: LC.flag.r * u, a: LC.flag.a, kind: 'flag' });
    if (this.ghost) out.push({ x: this.ghost.x, y: this.ghost.y, r: LC.ghost.r * u, a: LC.ghost.a, kind: 'ghost' });
    return out;
  };
  World.prototype._towerLights = function (out) {
    var l = this.tower.list, u = this.layout.unit, LC = CONFIG.lights, n = 0;
    for (var i = l.length - 1; i >= 0 && n < LC.maxLanterns; i--) {
      if (!l[i].lantern) continue;
      var p = this.lanternPos(l[i]);
      out.push({ x: p.lx, y: p.ly, r: LC.lantern.r * u, a: LC.lantern.a, kind: 'lantern' });
      n++;
    }
    return out;
  };

  /** How lit is world point (x, y)? ambient light screened with the strongest light that reaches it (0..1).
   *  `out` = the light list to use (default: everything but Ziggy's own lantern and the crate in her glow). */
  World.prototype.litAt = function (x, y, list) {
    if (!list) {
      list = this._towerLights([]);
      var all = this.lights();
      for (var k = 0; k < all.length; k++) if (all[k].kind === 'apple' || all[k].kind === 'flag' || all[k].kind === 'ghost') list.push(all[k]);
    }
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var Lg = list[i], d2 = ((x - Lg.x) * (x - Lg.x) + (y - Lg.y) * (y - Lg.y)) / (Lg.r * Lg.r);
      if (d2 >= 1) continue;
      var f = M.pow(1 - d2, CONFIG.lightFalloff) * Lg.a;
      if (f > best) best = f;
    }
    return clamp(1 - (1 - this.light) * (1 - best), 0, 1);
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
    if (this.goal > 0) this._prog = M.max(this._prog || 0, M.min(1, this.placed / this.goal));
  };
  World.prototype._lanternCount = function () {
    var n = 0, l = this.tower.list;
    for (var i = 0; i < l.length; i++) if (l[i].lantern) n++;
    return n;
  };
  Object.defineProperty(World.prototype, 'lanterns', { get: function () { return this._lanternCount(); } });

  World.prototype._camTarget = function () {
    var L = this.layout, h = this.held ? this.held.h : this._crateSize().h;
    return M.min(0, this.tower.topY - h - L.topLine);
  };

  World.prototype._placeSaucer = function () {
    var s = this.saucer, L = this.layout;
    s.x = L.cx + L.swingA * M.sin(s.phase);
    s.vx = L.swingA * this.planet.swingW * M.cos(s.phase);
    s.y = this.cam.y + L.saucerScreenY + CONFIG.bobAmp * L.unit * M.sin(this.time * CONFIG.bobW);
  };
  World.prototype._holdY = function (c) {
    var s = this.saucer, u = this.layout.unit;
    return s.y + CONFIG.emitterDY * u + CONFIG.beamGap * u + c.h / 2;
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
    this._spawnApples();
    if (this._buf >= 0 && this.time - this._buf <= CONFIG.dropBuffer + 1e-9) this._release();
    this._buf = -1;
  };

  // ---------- apples ----------
  World.prototype._appleBand = function () {
    var L = this.layout, u = L.unit, K = CONFIG.apples;
    // screen space; never overlapping the crate hanging in the glow (its bottom + one apple radius)
    var ch = this.held ? this.held.h : this._crateSize().h;
    var heldBottom = L.saucerScreenY + (CONFIG.emitterDY + CONFIG.beamGap) * u + ch + CONFIG.bobAmp * u;
    var top = M.max(L.saucerScreenY + K.bandTop * u, heldBottom + (K.r + 0.05) * u);
    var bot = this.tower.topY - this._camTarget() - K.bandBot * u;   // where the camera is heading (it lags one crate at spawn)
    return { top: top, bot: bot };
  };
  World.prototype._newApple = function (x, sy, ph) {
    var y = this._camTarget() + sy, K = CONFIG.apples;
    return { id: ++this._id, x: x, y: y, prevX: x, prevY: y, sy: sy, baseY: y, r: K.r * this.layout.unit, t: 0,
      frame: 0, rot: 0, prevRot: 0, state: 'float', glow: this.light < CONFIG.glowBelow, life: 0, ph: ph, fade: 1 };
  };
  World.prototype._spawnApples = function () {
    var K = CONFIG.apples, L = this.layout, u = L.unit, alive = 0, i;
    for (i = 0; i < this.appleList.length; i++) {
      var a0 = this.appleList[i];
      if (a0.state === 'float' && ++a0.life >= K.life) { a0.state = 'gone'; a0.fade = 1; }
    }
    for (i = 0; i < this.appleList.length; i++) if (this.appleList[i].state === 'float') alive++;
    if (alive >= K.max || !this.rng.chance(this.planet.appleChance)) return;
    var n = this.rng.chance(K.pair) ? 2 : 1, band = this._appleBand();
    if (band.bot - band.top < 2) return;
    for (var k = 0; k < n && alive < K.max; k++) {
      for (var tries = 0; tries < 6; tries++) {
        // most apples hang over the drop path (a good drop grabs them); some sit out on the swing (a risky grab)
        var x = this.rng.chance(K.onPath)
          ? clamp(this.tower.topX + this.rng.range(-0.6, 0.6) * this._crateSize().w, L.cx - L.swingA, L.cx + L.swingA)
          : L.cx + this.rng.range(-0.9, 0.9) * L.swingA;
        var sy = this.rng.range(band.top, band.bot);
        var ok = true;
        for (i = 0; i < this.appleList.length; i++) {
          var o = this.appleList[i];
          if (o.state === 'float' && M.hypot(o.x - x, o.sy - sy) < K.minGap * u) { ok = false; break; }
        }
        if (!ok) continue;
        this.appleList.push(this._newApple(x, sy, this.rng.range(0, 6.283)));
        alive++;
        break;
      }
    }
  };

  World.prototype._appleStep = function (h) {
    var K = CONFIG.apples, u = this.layout.unit, dark = this.light < CONFIG.glowBelow;
    for (var i = this.appleList.length - 1; i >= 0; i--) {
      var c = this.appleList[i];
      c.prevRot = c.rot;
      c.t += h;
      var th = c.ph + c.t * K.bobW;
      c.frame = M.floor(c.t * K.flutter + c.ph) % 2;
      if (c.state === 'float') {
        // anchored in the world where the camera is heading; floats up gently as the tower grows
        c.baseY += (this._camTarget() + c.sy - c.baseY) * (1 - M.exp(-K.follow * h));
        c.y = c.baseY + K.bob * u * M.sin(th);
        c.rot = K.rock * M.cos(th);                 // pendulum rock: max tilt at the middle of the bob, upright at its ends
        c.glow = dark;
        if (c.y > this.tower.topY - c.r) { c.state = 'gone'; }   // the tower grew into it (rare)
      } else if (c.state === 'collected') {
        if (c.t > 0.6) c.state = 'gone';
      }
      if (c.state === 'gone') {
        c.fade = (c.fade || 1) - h / 0.25;
        if (c.fade <= 0) this.appleList.splice(i, 1);
      }
    }
  };

  World.prototype._collectApples = function (cr) {
    for (var i = 0; i < this.appleList.length; i++) {
      var c = this.appleList[i];
      if (c.state !== 'float') continue;
      var nx = clamp(c.x, cr.x - cr.w / 2, cr.x + cr.w / 2), ny = clamp(c.y, cr.y - cr.h / 2, cr.y + cr.h / 2);
      var ddx = c.x - nx, ddy = c.y - ny;
      if (ddx * ddx + ddy * ddy > c.r * c.r) continue;
      this._takeApple(c);
    }
  };
  World.prototype._takeApple = function (c) {
    var glow = this.light < CONFIG.glowBelow, pts = glow ? CONFIG.appleGlowPoints : CONFIG.applePoints;
    c.state = 'collected'; c.t = 0; c.glow = glow;
    this.apples++; this.stats.apples++; if (glow) this.stats.glowApples++;
    this.score += pts;
    this._emit({ type: 'apple', apple: c, x: c.x, y: c.y, total: this.apples, points: pts, glow: glow });
    this.pieApples++;
    if (this.pieApples >= CONFIG.pieEvery) {
      this.pieApples = 0; this.stats.pies++;
      var gained = this.hearts < this.maxHearts;
      if (gained) this.hearts++;
      this._emit({ type: 'pie', hearts: this.hearts, gained: gained });
    }
  };

  // ---------- light ----------
  World.prototype._lightStep = function (h) {
    var P = this.planet, k = 1 - M.exp(-CONFIG.lightRate * h);
    this._progE += (this._prog - this._progE) * k;
    var target = P.light + (P.lightEnd - P.light) * easeInOut(this._prog);
    this.light += (target - this.light) * k;
    this.dayT = this.zone + this._progE;
    this.lightTint = this._progE < 0.5 ? P.key : CONFIG.zones[M.min(3, this.zone + 1)].key;
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
    var i, c, s = this.saucer, T = this.tower;
    // prev* for interpolation
    s.prevX = s.x; s.prevY = s.y; s.prevScale = s.scale;
    this.cam.prevY = this.cam.y; T.prevSway = T.sway;
    for (i = 0; i < this.crates.length; i++) { c = this.crates[i]; c.prevX = c.x; c.prevY = c.y; c.prevRot = c.rot; c.prevLanternRot = c.lanternRot; }
    for (i = 0; i < this.appleList.length; i++) { c = this.appleList[i]; c.prevX = c.x; c.prevY = c.y; }
    if (this.ghost) { this.ghost.prevX = this.ghost.x; this.ghost.prevY = this.ghost.y; }

    this.time += h; this.phaseT += h;

    // sway spring, then the lantern pendulums it drives
    this._swayStep(T, h);
    this._lanternStep(h);
    // rocket phase (position is placed after the camera moved, below)
    s.phase += this.planet.swingW * h;
    if (s.phase > 1e4) s.phase -= 2 * M.PI * M.floor(s.phase / (2 * M.PI));
    var tTilt = clamp(s.vx * CONFIG.tiltK / this._u(), -CONFIG.tiltMax, CONFIG.tiltMax);
    s.tilt += (tTilt - s.tilt) * (1 - M.exp(-CONFIG.tiltRate * h));
    s.animT += h;
    if (s.anim !== 'idle' && s.animT >= (CONFIG.anim[s.anim] || 0.5)) { s.anim = 'idle'; s.animT = 0; }

    // held crate: spring-lagged pendulum under the glow (uses last step's rocket: one step of lag is the spring's input)
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

    // camera (after landings/topples so the top never pokes above topLine), then the rocket rides with it
    this._camStep(h);
    this._placeSaucer();
    if (this.held) this.held.y = this._holdY(this.held);
    // light, then apples (their glow follows the light)
    this._lightStep(h);
    this._appleStep(h);

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
    var a = -w0 * w0 * T.sway - 2 * z * w0 * T.swayV;
    T.swayV += a * h;
    T.sway += T.swayV * h;
    T.swayA = a;
    if (T.sway > lim) { T.sway = lim; if (T.swayV > 0) T.swayV *= -0.3; }
    else if (T.sway < -lim) { T.sway = -lim; if (T.swayV < 0) T.swayV *= -0.3; }
  };

  /** Each hung lantern is a damped pendulum on its hook, driven by the hook's sideways acceleration (tower sway). */
  World.prototype._lanternStep = function (h) {
    var K = CONFIG.lantern, l = this.tower.list, ell = K.bodyDY * this.layout.unit, w0 = K.omega, aT = this.tower.swayA || 0;
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (!c.lantern) continue;
      var ax = aT * this._swayFrac(c.y, this.tower.topY);
      // θ'' = −ω²θ − 2ζωθ' − a_hook/ℓ  (a hook accelerating right swings the lantern left: θ > 0 = clockwise)
      c.lanternW += (-w0 * w0 * c.lanternRot - 2 * K.zeta * w0 * c.lanternW + ax / ell) * h;
      c.lanternRot = clamp(c.lanternRot + c.lanternW * h, -K.maxRot, K.maxRot);
    }
  };

  World.prototype._camStep = function (h) {
    var cam = this.cam;
    if (this.phase === 'travel') {
      // the camera glides down to the ground while Granny Boo floats up (kinematic ease, C¹ at both ends)
      if (this._goalCam === undefined) this._goalCam = cam.y;
      var e = easeInOut(this.phaseT / CONFIG.travelTime);
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
  /** Advance one falling body by h with zone gravity/drag (exact for constant g). */
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
    this._collectApples(c);
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
    this.tower.swayV += kick * hf * D.sway;
    if (perfect) {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.stats.perfect++;
      this.score += CONFIG.perfectPoints * M.min(this.combo, CONFIG.comboCap);
      this._anim('happy');
      this._emit({ type: 'perfect', crate: c, combo: this.combo });
      if (this.combo >= 2) this._emit({ type: 'combo', combo: this.combo });
      // a Perfect hangs a lantern on the crate, alternating sides up the tower
      this._lanternSide = -this._lanternSide;
      c.lantern = true; c.lanternSide = this._lanternSide;
      c.lanternRot = 0; c.prevLanternRot = 0; c.lanternW = -c.lanternSide * CONFIG.lantern.kick;   // swings out as it is hung
      this.stats.lanterns++;
      this._emit({ type: 'lantern', crate: c });
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
        // on the plinth: slide/tip towards its outer edge
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
      // supports from the bottom up (−1 = the plinth): the lowest joint that fails takes everything above
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

  // ---------- goal → Granny Boo → travel → levelUp ----------
  World.prototype._startGoal = function () {
    this._goalPending = false;
    var top = this._top(), u = this.layout.unit;
    this.phase = 'goal'; this.phaseT = 0;
    this.flag = { x: top.x, y: top.y, t: 0 };
    var bonus = CONFIG.goalPoints * (this.zone + 1) * (this.loop + 1);
    this.score += bonus;
    this._anim('happy');
    this._emit({ type: 'goal', x: top.x + this.swayOffset(top.y), y: top.y - CONFIG.flagH * u, bonus: bonus });
    // the floating apples fade (Granny Boo takes them in through her window: renderer)
    for (var i = 0; i < this.appleList.length; i++) if (this.appleList[i].state === 'float') { this.appleList[i].state = 'gone'; this.appleList[i].fade = 1; }
  };

  /** Granny Boo's hover point (world): beside the tower top. */
  World.prototype._ghostHome = function (side) {
    var u = this.layout.unit, top = this._top();
    return { x: top.x + side * CONFIG.ghostDX * u, y: top.y + CONFIG.ghostDY * u };
  };

  World.prototype._goalStep = function (h) {
    var t = this.phaseT, L = this.layout, u = L.unit;
    if (this.flag) this.flag.t += h;
    if (t >= CONFIG.ghostIn) {
      var side = 1, home = this._ghostHome(side);
      if (!this.ghost) {
        var sx = L.cx + side * (L.width / 2 + 0.6 * u);
        this.ghost = { x: sx, y: home.y - CONFIG.ghostFrom * u, prevX: sx, prevY: home.y - CONFIG.ghostFrom * u,
          state: 'in', t: 0, wave: false, side: side, x0: sx, y0: home.y - CONFIG.ghostFrom * u, vx: 0, vy: 0 };
      }
      var g = this.ghost;
      g.t += h;
      var s = (t - CONFIG.ghostIn) / (CONFIG.ghostArrive - CONFIG.ghostIn);
      if (g.state === 'in') {
        // ease-out arc: x decelerates (cubic) faster than y settles (smoothstep) → a curved swoop that stops softly
        g.x = g.x0 + (home.x - g.x0) * easeOutCubic(s);
        g.y = g.y0 + (home.y - g.y0) * easeInOut(s);
        if (s >= 1) { g.state = 'hover'; g.x = home.x; g.y = home.y; this._emit({ type: 'ghost' }); }
      } else {
        var th = (t - CONFIG.ghostArrive) * CONFIG.ghostBobW;
        g.x = home.x;
        g.y = home.y + CONFIG.ghostBob * u * M.sin(th);
      }
      g.wave = t >= CONFIG.ghostWaveOn && t < CONFIG.ghostWaveOff;
    }
    if (t >= CONFIG.goalTime) {
      if (this.ghost && this.ghost.state === 'in') { this.ghost.state = 'hover'; this._emit({ type: 'ghost' }); }
      this.phase = 'travel'; this.phaseT = 0; this._goalCam = this.cam.y;
      if (this.ghost) {
        var gg = this.ghost; gg.state = 'out'; gg.t = 0; gg.wave = false;
        // leave with the bob's current velocity (C¹), then float up and outward
        gg.vx = 0; gg.vy = CONFIG.ghostBob * u * CONFIG.ghostBobW * M.cos((t - CONFIG.ghostArrive) * CONFIG.ghostBobW);
      }
    }
  };

  World.prototype._travelStep = function (h) {
    var t = this.phaseT, u = this._u();
    var a = M.max(0, 1 - t / (CONFIG.travelTime * 0.8));
    for (var i = 0; i < this.crates.length; i++) this.crates[i].alpha = M.min(this.crates[i].alpha, a);
    if (this.flag) { this.flag.t += h; }
    var g = this.ghost;
    if (g) {
      g.t += h;
      g.vy -= CONFIG.ghostRiseAcc * u * h; g.vx += g.side * 0.4 * CONFIG.ghostRiseAcc * u * h;
      g.x += g.vx * h; g.y += g.vy * h;
    }
    if (t >= CONFIG.travelTime) {
      this._goalCam = undefined;
      this.stats.levels++;
      this.hearts = M.min(this.maxHearts, this.hearts + CONFIG.heartReward);
      this._startLevel(this.level + 1, true, false);
    }
  };

  // ---------- prediction (pure; used by the bot and the renderer's drop guide) ----------
  /** Where would the held crate land if released now? {x, dx, perfect, ok, landY, topX, topW, tol, lit} or null. */
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
          landY: ok ? top.y - c.h / 2 : this.layout.groundY - c.h / 2, topX: top.x + sx, topW: top.w, tol: tol,
          lit: this.litAt(top.x + this.swayOffset(top.y), top.y) };
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
    var T = this.tower; T.sway *= k; T.swayV *= k; T.swayA *= k; T.prevSway = T.sway;
    this._updateTower();
    if (this.flag) { this.flag.x = X(this.flag.x); this.flag.y = Y(this.flag.y); }
    var gh = this.ghost;
    if (gh) {
      gh.x = X(gh.x); gh.y = Y(gh.y); gh.x0 = L.cx + gh.side * (L.width / 2 + 0.6 * L.unit); gh.y0 = Y(gh.y0);
      gh.vx *= k; gh.vy *= k; gh.prevX = gh.x; gh.prevY = gh.y;
    }
    // camera: straight to its new target (no spring from a stale value)
    if (this.phase === 'travel') { if (this._goalCam !== undefined) this._goalCam *= k; this.cam.y *= k; }
    else this.cam.y = this._camTarget();
    this.cam.v = 0; this.cam.prevY = this.cam.y;
    var s = this.saucer;
    this._placeSaucer(); s.prevX = s.x; s.prevY = s.y;
    if (this.held) { this.held.y = this._holdY(this.held); this.held.prevY = this.held.y; }
    // apples: keep their place in the fall band (screen-relative), x re-anchored
    var band = this._appleBand(), ob = { top: o.saucerScreenY + CONFIG.apples.bandTop * o.unit };
    for (i = 0; i < this.appleList.length; i++) {
      c = this.appleList[i];
      c.x = X(c.x); c.r *= k;
      c.sy = clamp(band.top + (c.sy - ob.top) * k, band.top, M.max(band.top, band.bot));
      c.baseY = this._camTarget() + c.sy; c.y = c.baseY; c.prevX = c.x; c.prevY = c.y;
    }
  };

  // ---------- test hooks ----------
  /** Build a tower of placed crates at rest offsets dxs[i] (px from cx, ×u). Test/debug helper.
   *  opts.lanterns: true → every crate gets a lantern (alternating sides). */
  World.prototype.setTower = function (dxs, opts) {
    var L = this.layout, u = this._u(), i;
    for (i = this.crates.length - 1; i >= 0; i--) if (this.crates[i].state === 'placed') this.crates.splice(i, 1);
    this.tower.list = [];
    this._updateTower();
    var sz = this._crateSize(), y = this.base.top;
    for (i = 0; i < dxs.length; i++) {
      var c = new Crate(++this._id, L.cx + dxs[i] * u, y - sz.h / 2, sz.w, sz.h, i % 4);
      c.state = 'placed'; c.tx = c.x; y -= sz.h;
      if (opts && opts.lanterns) { c.lantern = true; c.perfect = true; c.lanternSide = i % 2 ? -1 : 1; }
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
      difficulty: this.difficulty, apples: this.apples, pieApples: this.pieApples,
      light: r(this.light), dayT: r(this.dayT), lightTint: this.lightTint, lanterns: this._lanternCount(),
      placed: this.placed, goal: this.goal,
      cam: { y: r(this.cam.y) },
      saucer: { x: r(this.saucer.x), y: r(this.saucer.y), scale: this.saucer.scale, anim: this.saucer.anim },
      tower: { sway: r(this.tower.sway), height: r(this.tower.height), topY: r(this.tower.topY), topX: r(this.tower.topX), count: this.tower.count },
      crates: this.crates.map(function (c) { return { id: c.id, style: c.style, x: r(c.x), y: r(c.y), w: r(c.w), state: c.state, perfect: c.perfect, lantern: c.lantern, rot: r(c.rot) }; }),
      appleList: this.appleList.map(function (c) { return { x: r(c.x), y: r(c.y), state: c.state, glow: c.glow }; }),
      held: !!this.held, flag: !!this.flag, ghost: this.ghost ? this.ghost.state : null,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  AC.World = World;
  AC.CONFIG = CONFIG;
})(window.AC = window.AC || {});
