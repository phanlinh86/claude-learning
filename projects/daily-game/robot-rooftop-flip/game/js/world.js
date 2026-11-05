/* Bolt's Rooftop Flip — RF.World (headless, deterministic) + RF.World.CONFIG
 *
 * Contract: docs/DESIGN.md §2 and §5.1. Motion model, generator, fairness and tuning: docs/MECHANICS.md.
 * Units: px (logical, y DOWN) and seconds. Lengths in CONFIG are in "unit" multiples (layout.unit = 100 at
 * 960×540) and accelerations/speeds are given for unit = 100 and multiplied by u = unit/100 at use, so the
 * game plays the same on any screen. Everything runs in fixed sub-steps of CONFIG.step: same seed + same
 * flip() calls at the same simulated times → the same game at any frame rate.
 *
 *   var w = new RF.World({ seed: 7, difficulty: 'easy', width: 960, height: 540, level: 0 });
 *   w.flip(); w.update(1/60);
 *   var ev = w.drainEvents();          // [{type:'flip', grav}, {type:'land', side, speed}, ...]
 *   // render: screenX = lerp(x.prevX, x, w.alpha) − lerp(cam.prevX, cam.x, w.alpha);
 *   //         hero y / flipT, fireflies and the drone lerp prev* the same way.
 *
 * The track is made of solid spans (roofs[], rails[]); a gap is the space between two spans of one surface.
 * hazards[] {kind, side, x0, x1, ob} is the generator's own list of gaps + obstacles (sorted by x0); it is what
 * hazardAhead() and the fairness tests read. Extras beyond DESIGN §5.1 (docs/MECHANICS.md §8): hero.prevX/knock/
 * coyote/buffer, firefly.baseX/ph2, drone.flipY/side, plans[] (level spans; draw every visible finishX), and the
 * pure helpers standY(side), clearRange(side,a,b), safeAt(side,x), speedTarget(x), levelBase(l), levelUnits(l).
 */
(function (RF) {
  'use strict';
  var M = Math;

  var CONFIG = {
    step: 1 / 120,          // s      fixed sub-step: at 4.3 u/s Bolt moves 3.6 px per step, a flip's 2 u are ~45 steps
    maxFrame: 0.25,         // s      longest frame simulated (a hidden tab does not fast-forward minutes)

    // ---- Bolt's body (DESIGN §5.1) ----
    standOff: 0.42,         // unit   body centre ↔ the surface he stands on (feet line of the 0.95 u sprite)
    heroBox: 0.50,          // unit   hit box w = h around the body centre
    foot: 0.18,             // unit   half footprint: supported while either paw is over a solid span
    stepUp: 0.12,           // unit   a sag of up to this below the surface still "catches" on the far edge of a
                            //        narrow crack (feels like a stumble, not a fall); deeper = inside the wall → falls

    // ---- gravity flip (the "zoop") ----
    g: 2200,                // px/s²  (×u) pull toward the current surface. With kick 140 a flip crosses the 2.06 u
                            //        between the two standing lines in 0.374 s: snappy, yet you can see the arc
    kick: 140,              // px/s   (×u) push toward the new surface at the flip: Bolt "springs" off, no dead float
    maxVy: 1500,            // px/s   (×u) terminal speed (a flip lands at ≈960; only gap falls reach it)
    turnK: 0.95,            // ×      the turn-over (flipT) takes 95 % of the flight: he is upside-down just before the clank
    coyote: 0.12,           // s      flip still allowed this long after running off an edge (DESIGN)
    buffer: 0.18,           // s      a press in the air is kept this long and fires on landing (one press only)
    fallOut: 1.3,           // unit   past floorY + 1.3 u / above ceilY − 1.3 u Bolt has left the corridor → fall

    // ---- feel ----
    squashRef: 1000,        // px/s   (×u) landing speed that gives squash 1 × squashMax…
    squashMin: 0.2,         // —      …a stumble still squashes a little
    squashMax: 0.7,         // —      …a full flip lands at ≈0.67: a clear cartoon "CLANK"
    squashDecay: 8,         // 1/s    fades to < 10 % in 0.29 s
    knockDecay: 5,          // 1/s    hero.knock (bump recoil 0..1, for the renderer's wobble) fades in ≈0.5 s
    stride: 1.1,            // unit   one 4-frame run cycle per 1.1 u: ≈3 cycles/s at Normal noon (a scampering pup)

    // ---- scroll speed ----
    speedRamp: 0.10,        // ×      the scroll eases up 10 % from a level's start to its finish arch…
    speedEase: 0.6,         // 1/s    …and follows its target with this rate (a level change blends over ≈3 s)
    loopSpeed: 0.08,        // ×/loop each round after Night is 8 % faster (DESIGN)…
    loopSpeedCap: 1.4,      // ×      …up to 40 % (loop 5+)
    overStop: 0.6,          // s      game over: the scroll eases to a stop

    // ---- hearts / safety ----
    invuln: 1.5,            // s      blink of safety after a bump or a rescue (DESIGN)

    // ---- rescue drone ----
    droneIn: 0.45,          // s      the drone swoops in from the upper left and grabs Bolt…
    carry: 0.9,             // s      …carries him (≥ 0.9 s, longer if the next safe spot is further)…
    droneOut: 0.6,          // s      …drops him and flies off ahead
    hang: 0.72,             // unit   drone body centre ↔ Bolt's body centre while carried (rope + hook)
    catchDamp: 18,          // 1/s    Bolt's fall speed is damped out while the drone reaches him (he dangles, no snap)
    rescueAhead: 1.6,       // unit   the drop spot needs this much clear surface ahead (+ half a reaction)

    // ---- scoring ----
    ffPoints: 10,           // pts    × mult per matching firefly
    multEvery: 5,           // ff     mult = 1 + ⌊combo / 5⌋…
    multMax: 5,             // ×      …up to ×5 (REQUIREMENT)
    finishBonus: 100,       // pts    × (zone + 1) × (loop + 1)
    heartReward: 1,         // —      hearts back at every finish arch (up to max)

    // ---- fireflies ----
    ff: {
      r: 0.22,              // unit   circle radius (catch radius ×difficulty.catchK)
      bob: 0.08, bobW: 2.4, // unit, rad/s   gentle hover: ±8 px, period 2.6 s
      drift: 0.05, driftW: 0.9, // unit, rad/s  a tiny sideways drift on top (they look alive, never leave their spot)
      caughtT: 0.22,        // s      caught: sucked into Bolt's chest lantern, then gone
      suck: 22,             // 1/s    …the pull rate toward his chest (95 % in 0.14 s)
      fleeVx: 2.2,          // unit/s wrong colour: zips forward…
      fleeVy: 2.6,          // unit/s …and away from Bolt (up, or down if he is above it)…
      fleeAcc: 4.5,         // unit/s² …accelerating: a curved "zip" arc…
      fleeWiggle: 0.35,     // unit/s  …with a little flutter
      fleeT: 1.1,           // s      then it is gone
      spacing: 0.58,        // unit   between fireflies of a line
      minGap: 0.45          // unit   no two fireflies closer than this
    },

    // ---- track generator (DESIGN §5.1 fairness) ----
    gen: {
      ahead: 2.5,           // screens generated ahead of the camera (≥ 2)
      behind: 1.0,          // screens kept behind (then culled)
      margin: 0.8,          // unit   m: the safe surface must be clear from x0 − (flightDist + m) to x1 + m
      sameGap: 1.2,         // unit   min solid run between two hazards on the same surface (a building ≥ 1.2 u)
      finishClear: 2.5,     // unit   both surfaces safe this far before and after a finish arch
      breather: 1.2,        // s      plus this much calm after a finish (the sky crossfades)
      gateEvery: [8, 13],   // s      asked gap to the next paint gate; the first clear spot after it is used → ≈8.5–13.5 s in play (DESIGN 8–14)
      firstGate: [6, 9],    // s      the first gate of a run comes a bit sooner
      gateClear: 0.8,       // unit   a gate needs both surfaces safe ± this (its posts stand on solid ground)
      match: 0.65,          // —      share of fireflies in Bolt's colour (DESIGN ≈65 %)
      arcMatch: 0.8,        // —      fireflies on a flip arc are a reward: mostly matching
      arcLead: 0.45,        // unit   the arc starts this far before the latest flip point (where a good player flips)
      lineMono: true,       // —      a firefly line is ONE colour (like a cluster), so the player can read it and pick a surface
      maxGapUnit: 2.2       // unit   widest gap anywhere
    },

    // ---- per difficulty (Easy is tuned for a 4–6-year-old: playtest docs/reports/playtest.md) ----
    difficulty: {
      easy:   { speed: 0.78, hearts: 5, reaction: 1.8,  gapMin: 0.8, gapMax: 1.4, gapShare: 0.30, extra: [0.8, 2.0], catchK: 1.35, hitK: 0.6,  wrongBreaks: false, hitBreaks: false, safeStart: 3.0 },
      normal: { speed: 1.0,  hearts: 3, reaction: 0.95, gapMin: 0.8, gapMax: 1.9, gapShare: 0.45, extra: [0.2, 1.1], catchK: 1.0,  hitK: 1.0,  wrongBreaks: true,  hitBreaks: true,  safeStart: 2.0 },
      hard:   { speed: 1.15, hearts: 3, reaction: 0.7,  gapMin: 1.0, gapMax: 2.2, gapShare: 0.5,  extra: [0.05, 0.8], catchK: 1.0, hitK: 1.05, wrongBreaks: true,  hitBreaks: true,  safeStart: 2.0 }
    },
    //  speed = × zone speed · reaction = s the player gets between two forced flips (on top of the flight) ·
    //  gapMin/Max = gap width (unit) · gapShare = share of hazards that are gaps (the rest are vents/signs: you
    //  can see them coming better) · extra = s of random calm added after each hazard · catchK = × catch radius ·
  //  hitK = × obstacle hit box (Easy 0.6: a flip that grazes a corner, or a tap a bit late, is forgiven; running into it still bumps) ·
    //  wrongBreaks = a wrong-colour firefly resets the combo · hitBreaks = a bump/fall resets the combo ·
    //  safeStart = s of an empty track at the start of a run / after gotoLevel

    // ---- times of day (zone = level % 4) ----
    zones: [
      { key: 'dawn',   speed: 3.0, seconds: 62, alt: 0.55, gapK: 0.8, extraK: 1.25, arc: 0.45, line: 0.8 },  // sleepy rooftops: slow, calm, fewer gaps
      { key: 'noon',   speed: 3.3, seconds: 68, alt: 0.6,  gapK: 1.0, extraK: 1.1,  arc: 0.5,  line: 0.8 },
      { key: 'sunset', speed: 3.6, seconds: 72, alt: 0.65, gapK: 1.1, extraK: 1.0,  arc: 0.55, line: 0.75 },
      { key: 'night',  speed: 3.9, seconds: 76, alt: 0.65, gapK: 1.15, extraK: 0.95, arc: 0.6, line: 0.75 }  // brightest fireflies, busiest rooftops
    ],
    //  speed = unit/s at difficulty 1, loop 0 (×1.1 by the level's end) · seconds = intended level duration
    //  (levelLen = seconds × the level's mean speed) · alt = chance the next hazard is on the other surface
    //  (forces a flip) · gapK = × gapShare · extraK = × difficulty.extra · arc = chance of fireflies along a
    //  flip path · line = chance of a firefly line / cluster per stretch

    // ---- obstacle sizes (DESIGN §4.1 drawn sizes) and the softer hit box ----
    obstacles: {
      vent: [{ w: 0.80, h: 0.62 }, { w: 0.50, h: 0.78 }],   // AC unit, chimney (stand on the roof)
      sign: [{ w: 0.80, h: 0.66 }, { w: 0.55, h: 0.70 }]    // shop sign, flower basket (hang from the rail)
    },
    obHitW: 0.8,            // ×      hit box = 80 % of the drawn width (rounded art: corners never "hit")…
    obHitH: 0.88            // ×      …and 88 % of the height (a smoke puff / chain does not count)
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smoother(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function opp(side) { return side === 'floor' ? 'ceil' : 'floor'; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** DESIGN §2 */
  function computeLayout(w, h) {
    w = +w || 960; h = +h || 540;
    var portrait = h > w;
    var unit = portrait ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4);
    var midY = portrait ? 0.47 * h : 0.53 * h;   // portrait: a little higher, less empty sky above the rail
    var ceilY = midY - 1.45 * unit, floorY = midY + 1.45 * unit;
    return { width: w, height: h, portrait: portrait, unit: unit, midY: midY, ceilY: ceilY, floorY: floorY,
      corridorH: floorY - ceilY, heroX: portrait ? 0.22 * w : 0.26 * w };
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.computeLayout = computeLayout;

  // ------------------------------------------------------------------ setup
  World.prototype.reset = function (opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.D = CONFIG.difficulty[this.difficulty];
    this.rng = new RF.RNG(this.seed);
    this.genRng = this.rng.fork('track');
    this.layout = computeLayout(opts.width || 960, opts.height || 540);
    var L = this.layout, u = L.unit;
    this.time = 0; this.phase = 'run'; this.overT = 0; this._overV = 0;
    this.level = M.max(0, opts.level | 0); this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.score = 0; this.combo = 0; this.mult = 1; this.maxCombo = 0;
    this.hearts = this.maxHearts = this.D.hearts;
    this.distance = 0; this.progress = 0; this.levelLen = 0;
    this.acc = 0; this.alpha = 0; this.events = [];
    this._id = 1; this._cullN = 0;
    this.cam = { x: 0, prevX: 0 };
    var hx = L.heroX;
    this.hero = { x: hx, prevX: hx, y: this.standY('floor'), prevY: this.standY('floor'), vy: 0, grav: 1,
      grounded: true, side: 'floor', flipT: 0, prevFlipT: 0, color: this.rng.int(3), state: 'run', invuln: 0,
      runPhase: 0, squash: 0, bumpT: 99, happyT: 99, knock: 0, coyote: 0, buffer: 0, turn: null };
    this.roofs = []; this.rails = []; this.obstacles = []; this.fireflies = []; this.gates = []; this.hazards = [];
    this.finish = null; this.drone = null; this.rescue = null;
    this.stats = { flips: 0, caught: 0, wrong: 0, bumps: 0, falls: 0, gates: 0, levels: 0, distance: 0 };
    this._startTrack(hx, this.level);
    this.speed = this.speedTarget(hx);
    this._welcome();
    this._generate();
    this._syncLevel();
  };

  /** Fresh generator + both surfaces solid from one screen behind x (used by reset and gotoLevel). */
  World.prototype._startTrack = function (x, level, r0, c0) {
    var L = this.layout, u = L.unit, D = this.D, G = CONFIG.gen;
    this.plans = [{ level: level, startX: x, finishX: x + this.levelUnits(level) * u }];
    this.planIdx = 0;
    if (!r0) { r0 = { x0: x - L.width - u, x1: x }; this.roofs.push(r0); }
    if (!c0) { c0 = { x0: x - L.width - u, x1: x }; this.rails.push(c0); }
    var S = this._capFor(this.plans[0]);
    this.gen = {
      off: false, planIdx: 0,
      open: { floor: r0, ceil: c0 },
      cursor: x + D.safeStart * S + S * this.flightTime(),
      lastStart: { floor: -1e9, ceil: -1e9 }, lastEnd: { floor: -1e9, ceil: -1e9 }, lastSide: null,
      frontier: x, decoX: x + 1.5 * u,
      nextGateX: x + this.genRng.range(G.firstGate[0], G.firstGate[1]) * S,
      color: this.hero.color, marks: [{ x: -1e18, color: this.hero.color }]
    };
  };

  /** A short line of matching fireflies on the roof right after the start: the first thing a child sees. */
  World.prototype._welcome = function () {
    var u = this.layout.unit, x = this.hero.x + 2.6 * u;
    for (var i = 0; i < 3; i++) this._addFF(x + i * CONFIG.ff.spacing * u, this.standY('floor'), this.hero.color);
    this.gen.decoX = x + 3 * u;
  };

  // ------------------------------------------------------------------ geometry helpers
  World.prototype.standY = function (side) {
    var L = this.layout;
    return side === 'ceil' ? L.ceilY + CONFIG.standOff * L.unit : L.floorY - CONFIG.standOff * L.unit;
  };
  World.prototype._spans = function (side) { return side === 'ceil' ? this.rails : this.roofs; };
  World.prototype._span = function (side, x) {
    var a = this._spans(side), lo = 0, hi = a.length - 1;
    while (lo <= hi) {                    // binary search: last span with x0 ≤ x
      var mid = (lo + hi) >> 1;
      if (a[mid].x0 <= x) lo = mid + 1; else hi = mid - 1;
    }
    var s = a[hi];
    return s && x <= s.x1 ? s : null;
  };
  /** Is there a solid span of this surface under world x? (pure) */
  World.prototype.solidAt = function (side, x) { return !!this._span(side, x); };
  /** Is [a, b] of this surface solid AND free of obstacles (drawn extent)? (pure) */
  World.prototype.clearRange = function (side, a, b) {
    var s = this._span(side, a);
    if (!s || s.x1 < b) return false;
    for (var i = 0; i < this.obstacles.length; i++) {
      var ob = this.obstacles[i];
      if (ob.side === side && ob.x + ob.w / 2 >= a && ob.x - ob.w / 2 <= b) return false;
    }
    return true;
  };
  World.prototype.safeAt = function (side, x) { return this.clearRange(side, x, x); };
  /** Nearest gap/obstacle on `side` overlapping [fromX, fromX + dist] → {kind, x0, x1, ob} | null (pure). */
  World.prototype.hazardAhead = function (side, fromX, dist) {
    var hz = this.hazards, end = fromX + (dist === undefined ? 1e9 : dist);
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.x0 > end) break;
      if (h.side === side && h.x1 >= fromX) return h;
    }
    return null;
  };
  /** Seconds from one standing line to the other (kick + constant pull), independent of the scroll. */
  World.prototype.flightTime = function () {
    var u = this.layout.unit / 100, d = this.layout.corridorH - 2 * CONFIG.standOff * this.layout.unit;
    var g = CONFIG.g * u, k = CONFIG.kick * u;
    return (-k + M.sqrt(k * k + 2 * g * d)) / g;
  };
  World.prototype.flightDist = function () { return this.speed * this.flightTime(); };
  World.prototype._supported = function (side) {
    var f = CONFIG.foot * this.layout.unit;
    return this.solidAt(side, this.hero.x - f) || this.solidAt(side, this.hero.x + f);
  };

  // ------------------------------------------------------------------ speed & levels
  World.prototype.levelBase = function (level) {   // px/s at the start of that level
    var Z = CONFIG.zones[level % 4], loop = M.floor(level / 4);
    return Z.speed * this.D.speed * M.min(CONFIG.loopSpeedCap, 1 + CONFIG.loopSpeed * loop) * this.layout.unit;
  };
  /** Level length in units: its intended seconds × its mean speed (so every difficulty takes ≈ the same time). */
  World.prototype.levelUnits = function (level) {
    return CONFIG.zones[level % 4].seconds * this.levelBase(level) * (1 + CONFIG.speedRamp / 2) / this.layout.unit;
  };
  World.prototype._planAt = function (x) {
    for (var i = this.plans.length - 1; i > 0; i--) if (x >= this.plans[i].startX) return this.plans[i];
    return this.plans[0];
  };
  /** Scroll speed the world eases toward at world x (rises 10 % across a level). */
  World.prototype.speedTarget = function (x) {
    var p = this._planAt(x), len = p.finishX - p.startX;
    var f = isFinite(len) && len > 0 ? clamp((x - p.startX) / len, 0, 1) : 0;
    return this.levelBase(p.level) * (1 + CONFIG.speedRamp * f);
  };
  /** Upper bound of the real speed inside plan p (its end speed; the previous level's end speed early on,
   *  because the eased speed may still be higher there, e.g. Night → Dawn of the next round). */
  World.prototype._capFor = function (p, x) {
    var S = this.levelBase(p.level) * (1 + CONFIG.speedRamp);
    if (p.level > 0 && (x === undefined || x < p.startX + 0.35 * (p.finishX - p.startX)))
      S = M.max(S, this.levelBase(p.level - 1) * (1 + CONFIG.speedRamp));
    return S;
  };
  World.prototype._syncLevel = function () {
    var p = this.plans[this.planIdx], u = this.layout.unit;
    this.level = p.level; this.zone = p.level % 4; this.loop = M.floor(p.level / 4);
    var len = p.finishX - p.startX;
    this.levelLen = len / u;
    this.progress = isFinite(len) && len > 0 ? clamp((this.hero.x - p.startX) / len, 0, 1) : 0;
    this.finish = isFinite(p.finishX) ? { x: p.finishX } : null;
  };

  // ------------------------------------------------------------------ generator
  World.prototype._generate = function () {
    var g = this.gen;
    if (g.off) return;
    var limit = this.cam.x + this.layout.width * (1 + CONFIG.gen.ahead), guard = 0;
    while (g.frontier < limit && guard++ < 200) this._placeNext();
    g.open.floor.x1 = M.max(g.open.floor.x1, g.frontier);
    g.open.ceil.x1 = M.max(g.open.ceil.x1, g.frontier);
  };

  World.prototype._placeNext = function () {
    var g = this.gen, p = this.plans[g.planIdx], r = this.genRng, D = this.D, u = this.layout.unit;
    var G = CONFIG.gen, Z = CONFIG.zones[p.level % 4], loop = M.floor(p.level / 4);
    var S = this._capFor(p, g.cursor), F = S * this.flightTime(), R = D.reaction * S, m = G.margin * u;
    var side = g.lastSide === null ? (r.chance(0.5) ? 'floor' : 'ceil') : (r.chance(Z.alt) ? opp(g.lastSide) : g.lastSide);
    var other = opp(side);
    var gap = r.chance(D.gapShare * Z.gapK);
    var kind = gap ? 'gap' : (side === 'floor' ? 'vent' : 'sign');
    var variant = r.int(2), w, h = 0;
    if (gap) w = r.range(D.gapMin, M.min(G.maxGapUnit, D.gapMax + 0.1 * loop)) * u;
    else { var sz = CONFIG.obstacles[kind][variant]; w = sz.w * u; h = sz.h * u; }
    var b0 = g.cursor;
    b0 = M.max(b0, g.lastEnd[side] + G.sameGap * u);          // a real building between two hazards on one surface
    b0 = M.max(b0, g.lastEnd[other] + F + m);                 // the other surface is clear from b0 − F − m
    b0 = M.max(b0, g.lastStart[other] + F + R);               // forced flips: reaction time + a flight apart
    b0 += r.range(D.extra[0], D.extra[1]) * Z.extraK * S;
    var b1 = b0 + w;
    if (b1 + G.finishClear * u > p.finishX) { this._placeFinish(p); return; }
    var hz = { kind: kind, side: side, x0: b0, x1: b1, ob: null };
    if (gap) {
      var sp = g.open[side];
      sp.x1 = b0;
      var ns = { x0: b1, x1: b1 };
      this._spans(side).push(ns); g.open[side] = ns;
    } else {
      var ob = { id: this._id++, kind: kind, variant: variant, side: side, x: (b0 + b1) / 2, w: w, h: h, hit: false, hitT: 0 };
      this.obstacles.push(ob); hz.ob = ob;
    }
    this.hazards.push(hz);
    g.lastStart[side] = b0; g.lastEnd[side] = b1; g.lastSide = side;
    g.cursor = b1; g.frontier = b1;
    if (g.open[other].x1 < b1) g.open[other].x1 = b1;     // both surfaces are final up to b1 (the gap side's new span starts there)
    if (g.open[side].x1 < b1) g.open[side].x1 = b1;
    this._decorate(g.decoX, b1, hz, p);
    g.decoX = M.max(g.decoX, b1);
  };

  World.prototype._placeFinish = function (p) {
    var g = this.gen, u = this.layout.unit, G = CONFIG.gen;
    var np = { level: p.level + 1, startX: p.finishX, finishX: p.finishX + this.levelUnits(p.level + 1) * u };
    this.plans.push(np); g.planIdx = this.plans.length - 1;
    var end = p.finishX + G.finishClear * u;
    g.cursor = M.max(g.cursor, end + G.breather * this._capFor(np, np.startX));
    g.frontier = M.max(g.frontier, end);
    if (g.open.floor.x1 < g.frontier) g.open.floor.x1 = g.frontier;
    if (g.open.ceil.x1 < g.frontier) g.open.ceil.x1 = g.frontier;
    this._decorate(g.decoX, g.frontier, null, p);
    g.decoX = M.max(g.decoX, g.frontier);
  };

  World.prototype._nearFinish = function (x, d) {
    for (var i = 0; i < this.plans.length; i++) if (M.abs(this.plans[i].finishX - x) < d) return true;
    return false;
  };
  World.prototype._colorAt = function (x) {
    var mk = this.gen.marks;
    for (var i = mk.length - 1; i >= 0; i--) if (mk[i].x <= x) return mk[i].color;
    return this.hero.color;
  };
  World.prototype._ffColor = function (x, pMatch) {
    var c = this._colorAt(x), r = this.genRng;
    return r.chance(pMatch) ? c : (c + 1 + r.int(2)) % 3;
  };
  World.prototype._addFF = function (x, y, color) {
    var u = this.layout.unit, r = this.genRng;
    var ff = { id: this._id++, x: x, y: y, prevX: x, prevY: y, baseX: x, baseY: y, color: color, r: CONFIG.ff.r * u,
      phase: r.range(0, 6.283), ph2: r.range(0, 6.283), state: 'fly', t: 0, vx: 0, vy: 0 };
    this.fireflies.push(ff);
    return ff;
  };
  /** Can a firefly sit at (x, y)? Not in an obstacle, not on a gate/finish, not on another firefly. */
  World.prototype._ffOk = function (x, y) {
    var u = this.layout.unit, rr = CONFIG.ff.r * u, i;
    for (i = 0; i < this.obstacles.length; i++) {
      var ob = this.obstacles[i];
      var top = ob.side === 'floor' ? this.layout.floorY - ob.h : this.layout.ceilY;
      var cx = clamp(x, ob.x - ob.w / 2, ob.x + ob.w / 2), cy = clamp(y, top, top + ob.h);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < (rr + 0.12 * u) * (rr + 0.12 * u)) return false;
    }
    for (i = this.gates.length - 1; i >= 0 && i >= this.gates.length - 3; i--) if (M.abs(this.gates[i].x - x) < 0.7 * u) return false;
    if (this._nearFinish(x, 0.9 * u)) return false;
    var md = CONFIG.ff.minGap * u;
    for (i = this.fireflies.length - 1; i >= 0 && i >= this.fireflies.length - 24; i--) {
      var f = this.fireflies[i];
      if (M.abs(f.baseX - x) < md && M.abs(f.baseY - y) < md) return false;
    }
    return true;
  };

  /** Gates, firefly arcs, lines and clusters in [s, e] (final track there). hz = the hazard ending at e. */
  World.prototype._decorate = function (s, e, hz, p) {
    var g = this.gen, r = this.genRng, u = this.layout.unit, G = CONFIG.gen, Z = CONFIG.zones[p.level % 4];
    if (e <= s) return;
    // paint gate
    if (g.nextGateX <= e - 0.6 * u) {
      for (var gx = M.max(s + 0.6 * u, g.nextGateX); gx <= e - 0.6 * u; gx += 0.2 * u) {
        var gc = G.gateClear * u;
        if (this.clearRange('floor', gx - gc, gx + gc) && this.clearRange('ceil', gx - gc, gx + gc) && !this._nearFinish(gx, 2.5 * u)) {
          var col = (g.color + 1 + r.int(2)) % 3;
          this.gates.push({ id: this._id++, x: gx, color: col, passed: false });
          g.marks.push({ x: gx, color: col }); g.color = col;
          var S0 = this.speedTarget(gx);
          g.nextGateX = gx + r.range(G.gateEvery[0], G.gateEvery[1]) * S0;
          break;
        }
      }
    }
    // an arc of fireflies along the flip that this hazard forces
    if (hz && r.chance(Z.arc)) this._arc(hz, s);
    // lines / clusters along a safe surface
    var n = 1 + M.floor((e - s) / (5 * u));
    for (var k = 0; k < n; k++) if (r.chance(Z.line)) { if (r.chance(0.72)) this._line(s, e); else this._cluster(s, e); }
  };

  World.prototype._arc = function (hz, s) {
    var u = this.layout.unit, tF = this.flightTime(), S = this.speedTarget(hz.x0), F = S * tF;
    var fx = hz.x0 - F - CONFIG.gen.arcLead * u;
    if (fx < s + 0.2 * u) return;
    var side = hz.side, y0 = this.standY(side), dir = side === 'floor' ? -1 : 1;
    var g = CONFIG.g * u / 100, k = CONFIG.kick * u / 100;
    for (var i = 0; i < 4; i++) {
      var t = tF * (0.22 + 0.2 * i), x = fx + S * t, y = y0 + dir * (k * t + 0.5 * g * t * t);
      if (this._ffOk(x, y)) this._addFF(x, y, this._ffColor(x, CONFIG.gen.arcMatch));
    }
  };
  World.prototype._line = function (s, e) {
    var u = this.layout.unit, r = this.genRng, n = r.int(3, 5), len = (n - 1) * CONFIG.ff.spacing * u;
    for (var tries = 0; tries < 4; tries++) {
      var a = s + 0.5 * u, b = e - 0.5 * u - len;
      if (b < a) return;
      var x0 = r.range(a, b), side = r.chance(0.5) ? 'floor' : 'ceil';
      if (!this.clearRange(side, x0 - 0.5 * u, x0 + len + 0.5 * u)) side = opp(side);
      if (!this.clearRange(side, x0 - 0.5 * u, x0 + len + 0.5 * u)) continue;
      var y = this.standY(side), ok = true, i;
      for (i = 0; i < n && ok; i++) ok = this._ffOk(x0 + i * CONFIG.ff.spacing * u, y);
      if (!ok) continue;
      var mono = CONFIG.gen.lineMono, lc = -1;
      if (mono) {
        if (this._colorAt(x0) !== this._colorAt(x0 + len)) continue;   // never straddle a paint gate
        lc = this._ffColor(x0, CONFIG.gen.match);
      }
      for (i = 0; i < n; i++) { var x = x0 + i * CONFIG.ff.spacing * u; this._addFF(x, y, mono ? lc : this._ffColor(x, CONFIG.gen.match)); }
      return;
    }
  };
  World.prototype._cluster = function (s, e) {
    var u = this.layout.unit, r = this.genRng;
    for (var tries = 0; tries < 4; tries++) {
      var a = s + 0.8 * u, b = e - 0.8 * u;
      if (b < a) return;
      var cx = r.range(a, b), side = r.chance(0.5) ? 'floor' : 'ceil';
      if (!this.clearRange(side, cx - 0.8 * u, cx + 0.8 * u)) side = opp(side);
      if (!this.clearRange(side, cx - 0.8 * u, cx + 0.8 * u)) continue;
      var sy = this.standY(side), dir = side === 'floor' ? -1 : 1;
      var pts = [[cx - 0.32 * u, sy], [cx, sy + dir * 0.3 * u], [cx + 0.32 * u, sy]], ok = true, i;
      for (i = 0; i < 3 && ok; i++) ok = this._ffOk(pts[i][0], pts[i][1]);
      if (!ok) continue;
      var c = this._ffColor(cx, CONFIG.gen.match);           // a cluster is one colour (easy to read)
      for (i = 0; i < 3; i++) this._addFF(pts[i][0], pts[i][1], c);
      return;
    }
  };

  // ------------------------------------------------------------------ input
  /** Tap: flip now if standing (or within coyote time), else keep the press for CONFIG.buffer s. */
  World.prototype.flip = function () {
    var h = this.hero;
    if (this.phase !== 'run' || h.state === 'rescue') return false;
    if (h.grounded || h.coyote > 0) { this._doFlip(); return true; }
    h.buffer = CONFIG.buffer;
    return false;
  };
  World.prototype._doFlip = function () {
    var h = this.hero, u = this.layout.unit / 100;
    h.grav = -h.grav;
    h.vy = h.grav * CONFIG.kick * u;
    h.grounded = false; h.side = null; h.state = 'air'; h.coyote = 0; h.buffer = 0;
    h.turn = { from: h.flipT, to: h.grav < 0 ? 1 : 0, t: 0, dur: this.flightTime() * CONFIG.turnK };
    this.stats.flips++;
    this.events.push({ type: 'flip', grav: h.grav });
  };

  // ------------------------------------------------------------------ loop
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    this.acc += M.min(dt, CONFIG.maxFrame);
    var h = CONFIG.step;
    while (this.acc >= h) { this._step(h); this.acc -= h; }
    this.alpha = this.acc / h;
  };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  World.prototype._step = function (dt) {
    var hero = this.hero, L = this.layout, u = L.unit, i;
    // ---- prev* for the renderer's lerp
    this.cam.prevX = this.cam.x; hero.prevX = hero.x; hero.prevY = hero.y; hero.prevFlipT = hero.flipT;
    for (i = 0; i < this.fireflies.length; i++) { var f0 = this.fireflies[i]; f0.prevX = f0.x; f0.prevY = f0.y; }
    if (this.drone) { this.drone.prevX = this.drone.x; this.drone.prevY = this.drone.y; }
    this.time += dt;
    var run = this.phase === 'run';

    // ---- scroll
    if (run) {
      this.speed += (this.speedTarget(hero.x) - this.speed) * (1 - M.exp(-CONFIG.speedEase * dt));
    } else {
      this.overT += dt;
      var q = clamp(1 - this.overT / CONFIG.overStop, 0, 1);
      this.speed = this._overV * q * q;                      // ease-out to a stop
    }
    var dx = this.speed * dt;
    this.cam.x += dx;
    hero.x = this.cam.x + L.heroX;
    this.distance += dx / u; this.stats.distance = this.distance;
    hero.runPhase = (hero.runPhase + dx / (CONFIG.stride * u)) % 1;

    // ---- Bolt
    if (hero.state === 'rescue') this._stepRescue(dt);
    else this._stepHero(dt, run);

    // turn-over (eased, time-based so it reads the same at any speed)
    if (hero.turn) {
      hero.turn.t += dt;
      hero.flipT = lerp(hero.turn.from, hero.turn.to, smooth(hero.turn.t / hero.turn.dur));
      if (hero.turn.t >= hero.turn.dur) { hero.flipT = hero.turn.to; hero.turn = null; }
    }
    if (hero.buffer > 0) hero.buffer = M.max(0, hero.buffer - dt);
    if (hero.invuln > 0) hero.invuln = M.max(0, hero.invuln - dt);
    hero.squash *= M.exp(-CONFIG.squashDecay * dt); if (hero.squash < 1e-3) hero.squash = 0;
    hero.knock *= M.exp(-CONFIG.knockDecay * dt); if (hero.knock < 1e-3) hero.knock = 0;
    hero.bumpT += dt; hero.happyT += dt;

    // ---- obstacles
    for (i = 0; i < this.obstacles.length; i++) { var o = this.obstacles[i]; if (o.hit) o.hitT += dt; }
    if (run && hero.state !== 'rescue' && hero.invuln <= 0) this._collide();

    // ---- fireflies, gates, finish
    this._stepFireflies(dt, run && hero.state !== 'rescue');
    if (run) {
      for (i = 0; i < this.gates.length; i++) {
        var gt = this.gates[i];
        if (!gt.passed && hero.x >= gt.x) {
          gt.passed = true; hero.color = gt.color; this.stats.gates++;
          this.events.push({ type: 'gate', color: gt.color, x: gt.x });
        }
      }
      var p = this.plans[this.planIdx];
      if (hero.x >= p.finishX) this._finishLevel(p);
    }
    this._syncLevel();

    // ---- drone flying out
    if (this.drone && this.drone.state === 'out') this._stepDroneOut(dt);

    // ---- track
    this._generate();
    if (++this._cullN >= 30) { this._cullN = 0; this._cull(); }
  };

  World.prototype._stepHero = function (dt, run) {
    var h = this.hero, L = this.layout, u = L.unit, uu = u / 100;
    if (h.grounded) {
      if (!this._supported(h.side)) {                        // ran off an edge: start falling, coyote time
        h.grounded = false; h.state = 'air'; h.coyote = CONFIG.coyote; h.vy = 0;
        h._from = h.side; h.side = null;
      } else {
        h.y = this.standY(h.side); h.vy = 0;
        return;
      }
    }
    // airborne: constant pull toward the current surface
    h.coyote = M.max(0, h.coyote - dt);
    var g = CONFIG.g * uu, vmax = CONFIG.maxVy * uu;
    h.vy = clamp(h.vy + h.grav * g * dt, -vmax, vmax);
    h.y += h.vy * dt;
    var side = h.grav > 0 ? 'floor' : 'ceil', sy = this.standY(side), tol = CONFIG.stepUp * u;
    var crossed = h.grav > 0 ? h.y >= sy : h.y <= sy;
    var wasAbove = h.grav > 0 ? h.prevY <= sy + tol : h.prevY >= sy - tol;
    if (crossed && wasAbove && this._supported(side)) {
      var sp = M.abs(h.vy);
      h.y = sy; h.vy = 0; h.grounded = true; h.side = side; h.state = 'run'; h.coyote = 0;
      h.flipT = side === 'ceil' ? 1 : 0; h.turn = null;
      h.squash = clamp(CONFIG.squashMax * sp / (CONFIG.squashRef * uu), CONFIG.squashMin, CONFIG.squashMax);
      this.events.push({ type: 'land', side: side, speed: sp });
      if (h.buffer > 0 && run) this._doFlip();
      return;
    }
    if (!run) {                                              // game over: let him settle, never fly off forever
      if (h.y > L.floorY + 4 * u || h.y < L.ceilY - 4 * u) h.vy = 0;
      return;
    }
    if (h.y > this._fallY('floor')) this._fall('floor');
    else if (h.y < this._fallY('ceil')) this._fall('ceil');
  };

  World.prototype._collide = function () {
    var h = this.hero, L = this.layout, u = L.unit, hb = CONFIG.heroBox * u / 2;
    for (var i = 0; i < this.obstacles.length; i++) {
      var ob = this.obstacles[i];
      if (ob.hit) continue;
      var hk = this.D.hitK, hw = ob.w * CONFIG.obHitW * hk / 2;
      if (h.x + hb < ob.x - hw || h.x - hb > ob.x + hw) continue;
      var hh = ob.h * CONFIG.obHitH * hk, top, bot;
      if (ob.side === 'floor') { bot = L.floorY; top = bot - hh; } else { top = L.ceilY; bot = top + hh; }
      if (h.y + hb < top || h.y - hb > bot) continue;
      ob.hit = true; ob.hitT = 0;
      h.invuln = CONFIG.invuln; h.bumpT = 0; h.knock = 1;
      this.stats.bumps++;
      this.events.push({ type: 'bump', ob: ob });
      this._hitCombo();
      this._loseHeart();
      return;
    }
  };

  World.prototype._hitCombo = function () {
    if (!this.D.hitBreaks) return;
    if (this.combo >= 2) this.events.push({ type: 'comboBreak', combo: this.combo });
    this.combo = 0; this.mult = 1;
  };
  World.prototype._loseHeart = function () {
    this.hearts = M.max(0, this.hearts - 1);
    this.events.push({ type: 'heartLost', hearts: this.hearts });
    if (this.hearts <= 0 && this.phase === 'run') {
      this.phase = 'over'; this.overT = 0; this._overV = this.speed;
      this.events.push({ type: 'gameOver' });
    }
  };

  // ------------------------------------------------------------------ fall + drone rescue
  /** y past which Bolt has left the corridor. Capped so the fall and the rescue stay on screen (16:9 is only
   *  540 tall: floorY + 1.3 u would be below the bottom edge) and clear of the HUD at the top. */
  World.prototype._fallY = function (side) {
    var L = this.layout, u = L.unit;
    return side === 'floor' ? M.min(L.floorY + CONFIG.fallOut * u, L.height - 0.45 * u)
                            : M.max(L.ceilY - CONFIG.fallOut * u, 0.75 * u);
  };
  World.prototype._fall = function (fromSide) {
    var h = this.hero;
    this.stats.falls++;
    this.events.push({ type: 'fall' });
    this._hitCombo();
    this._loseHeart();
    if (this.phase !== 'run') return;                        // the last battery: no rescue, game over
    var L = this.layout, u = L.unit;
    h.state = 'rescue'; h.grounded = false; h.side = null; h.coyote = 0; h.buffer = 0;
    var tg = this._rescueTarget(fromSide, h.x + this.speed * (CONFIG.droneIn + CONFIG.carry));
    var hs = tg.side === 'floor' ? -1 : 1;                    // drone above Bolt (roof drop) / below him (rail)
    var sx = L.heroX - 3 * u, sy = fromSide === 'floor' ? L.floorY - 0.6 * u : L.ceilY + 0.6 * u;
    this.drone = { x: this.cam.x + sx, y: sy, prevX: this.cam.x + sx, prevY: sy, state: 'in', t: 0, flipY: hs > 0, side: tg.side };
    this.rescue = { t: 0, sx: sx, sy: sy, hs: hs, side: tg.side, x: tg.x, catchY: h.y, dur: 0, fromT: h.flipT };
  };

  /** The first spot at/after x where a surface is safe for a drop + a short run (prefer the one he fell from). */
  World.prototype._rescueTarget = function (fromSide, x) {
    var u = this.layout.unit, ahead = CONFIG.rescueAhead * u + 0.5 * this.D.reaction * this.speed;
    var lim = x + 4 * this.layout.width, best = null;
    var sides = [fromSide, opp(fromSide)];
    for (var k = 0; k < 2; k++) {
      for (var cx = x; cx < lim; cx += 0.1 * u) {
        if (this.clearRange(sides[k], cx - 0.4 * u, cx + ahead)) {
          if (!best || cx < best.x - u) best = { side: sides[k], x: cx };
          break;
        }
      }
    }
    return best || { side: 'floor', x: x };
  };

  World.prototype._stepRescue = function (dt) {
    var h = this.hero, d = this.drone, R = this.rescue, L = this.layout, u = L.unit;
    R.t += dt; d.t += dt;
    var hang = CONFIG.hang * u;
    if (d.state === 'in') {
      h.vy *= M.exp(-CONFIG.catchDamp * dt);                 // he dangles to a stop as the drone reaches him
      h.y += h.vy * dt;
      var lo = L.height - 0.4 * u, hi = 0.7 * u;            // …and never dangles off screen
      if (h.y > lo) { h.y = lo; h.vy = 0; } else if (h.y < hi) { h.y = hi; h.vy = 0; }
      var e = smooth(d.t / CONFIG.droneIn);
      d.x = this.cam.x + lerp(R.sx, L.heroX, e);
      d.y = lerp(R.sy, h.y + R.hs * hang, e);
      if (d.t >= CONFIG.droneIn) {
        d.state = 'carry'; d.t = 0; h.vy = 0;
        R.catchY = h.y; R.fromT = h.flipT;
        R.dur = M.max(CONFIG.carry, (R.x - h.x) / M.max(1, this.speed));
        h.turn = null;
      }
      return;
    }
    if (d.state === 'carry') {
      var k = smoother(d.t / R.dur), ty = this.standY(R.side);
      h.y = lerp(R.catchY, ty, k);
      h.flipT = lerp(R.fromT, R.side === 'ceil' ? 1 : 0, smooth(d.t / R.dur));
      d.x = this.cam.x + L.heroX;
      d.y = h.y + R.hs * hang;
      if (d.t >= R.dur) {
        if (!this.clearRange(R.side, h.x - 0.3 * u, h.x + 0.6 * u)) {   // the spot scrolled onto a hazard: hold on
          var tg = this._rescueTarget(R.side, h.x);
          R.side = tg.side; R.x = tg.x; R.catchY = h.y; R.fromT = h.flipT; d.t = 0;
          R.dur = M.max(0.3, (tg.x - h.x) / M.max(1, this.speed));
          R.hs = tg.side === 'floor' ? -1 : 1; d.flipY = R.hs > 0; d.side = tg.side;
          return;
        }
        h.y = ty; h.vy = 0; h.grounded = true; h.side = R.side; h.grav = R.side === 'floor' ? 1 : -1;
        h.flipT = R.side === 'ceil' ? 1 : 0; h.state = 'run'; h.invuln = CONFIG.invuln; h.squash = 0.45;
        d.state = 'out'; d.t = 0; R.outX = L.heroX; R.outY = d.y;
        this.events.push({ type: 'rescue' });
      }
    }
  };
  World.prototype._stepDroneOut = function (dt) {
    var d = this.drone, R = this.rescue, L = this.layout, u = L.unit;
    d.t += dt;
    var e = d.t / CONFIG.droneOut; e = e * e;               // accelerates away
    d.x = this.cam.x + R.outX + 3.2 * u * e;
    d.y = R.outY + (R.hs < 0 ? -1 : 1) * 3 * u * e;
    if (d.t >= CONFIG.droneOut) { this.drone = null; this.rescue = null; }
  };

  // ------------------------------------------------------------------ fireflies
  World.prototype._stepFireflies = function (dt, canCatch) {
    var h = this.hero, u = this.layout.unit, FF = CONFIG.ff, hb = CONFIG.heroBox * u / 2;
    var cr = FF.r * u * this.D.catchK, keep = 0, list = this.fireflies;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      f.t += dt;
      if (f.state === 'fly') {
        f.phase += FF.bobW * dt;
        f.y = f.baseY + FF.bob * u * M.sin(f.phase);
        f.x = f.baseX + FF.drift * u * M.sin(FF.driftW / FF.bobW * f.phase + f.ph2);
        if (canCatch && M.abs(f.x - h.x) < hb + cr + 1) {
          var cx = clamp(f.x, h.x - hb, h.x + hb), cy = clamp(f.y, h.y - hb, h.y + hb);
          if ((f.x - cx) * (f.x - cx) + (f.y - cy) * (f.y - cy) <= cr * cr) this._touch(f);
        }
      } else if (f.state === 'caught') {
        var k = 1 - M.exp(-FF.suck * dt);
        f.x += (h.x - f.x) * k; f.y += (h.y + 0.08 * u * (h.grav > 0 ? 1 : -1) - f.y) * k;
        if (f.t >= FF.caughtT) f.state = 'gone';
      } else if (f.state === 'flee') {
        var dir = f.vy < 0 ? -1 : 1;
        f.vy += dir * FF.fleeAcc * u * dt;
        f.x += (f.vx + FF.fleeWiggle * u * 6 * M.cos(f.t * 16)) * dt;
        f.y += f.vy * dt;
        if (f.t >= FF.fleeT) f.state = 'gone';
      }
      if (f.state !== 'gone') list[keep++] = f;
    }
    list.length = keep;
  };
  World.prototype._touch = function (f) {
    var h = this.hero, u = this.layout.unit;
    f.t = 0;
    if (f.color === h.color) {
      f.state = 'caught';
      this.combo++; this.maxCombo = M.max(this.maxCombo, this.combo);
      var m = M.min(CONFIG.multMax, 1 + M.floor(this.combo / CONFIG.multEvery));
      var up = m > this.mult; this.mult = m;
      var pts = CONFIG.ffPoints * m;
      this.score += pts; this.stats.caught++; h.happyT = 0;
      this.events.push({ type: 'catch', ff: f, x: f.x, y: f.y, combo: this.combo, mult: m, points: pts });
      if (up) this.events.push({ type: 'combo', combo: this.combo, mult: m });
    } else {
      f.state = 'flee';
      f.vx = CONFIG.ff.fleeVx * u;
      f.vy = (h.grav > 0 ? -1 : 1) * CONFIG.ff.fleeVy * u;     // away from the surface Bolt is pulled to (up from the roof, down from the rail)
      this.stats.wrong++;
      this.events.push({ type: 'wrong', ff: f });
      if (this.D.wrongBreaks) {
        if (this.combo >= 2) this.events.push({ type: 'comboBreak', combo: this.combo });
        this.combo = 0; this.mult = 1;
      }
    }
  };

  // ------------------------------------------------------------------ levels
  World.prototype._finishLevel = function (p) {
    var zone = p.level % 4, loop = M.floor(p.level / 4);
    var bonus = CONFIG.finishBonus * (zone + 1) * (loop + 1);
    this.score += bonus;
    this.events.push({ type: 'finish', x: p.finishX });
    if (this.hearts < this.maxHearts) {
      this.hearts = M.min(this.maxHearts, this.hearts + CONFIG.heartReward);
      this.events.push({ type: 'heartGain', hearts: this.hearts });
    }
    if (!this.plans[this.planIdx + 1]) this.plans.push({ level: p.level + 1, startX: p.finishX, finishX: Infinity });
    this.planIdx++;
    this.stats.levels++;
    this._syncLevel();
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: bonus });
  };

  /** Jump to level i: the track ahead of Bolt is rebuilt (a safe start), score and hearts are kept. */
  World.prototype.gotoLevel = function (i) {
    i = M.max(0, i | 0);
    var h = this.hero, u = this.layout.unit, x = h.x;
    if (h.state === 'rescue') {
      h.state = 'run'; h.grounded = true; h.side = 'floor'; h.grav = 1; h.y = this.standY('floor'); h.vy = 0;
      h.flipT = 0; h.turn = null; h.invuln = M.max(h.invuln, 1);
      this.drone = null; this.rescue = null;
    }
    this.obstacles = this.obstacles.filter(function (o) { return o.x + o.w / 2 < x - u; });
    this.hazards = this.hazards.filter(function (z) { return z.x1 < x - u; });
    this.fireflies = this.fireflies.filter(function (f) { return f.x < x - 0.5 * u; });
    this.gates = this.gates.filter(function (g) { return g.x <= x; });
    var self = this, open = {};
    ['floor', 'ceil'].forEach(function (side) {           // cut the track ahead; solid under Bolt on both surfaces
      var a = self._spans(side);
      while (a.length && a[a.length - 1].x0 > x) a.pop();
      var last = a[a.length - 1];
      if (!last || last.x1 < x - 0.6 * u) { last = { x0: x - 0.6 * u, x1: x }; a.push(last); }
      last.x1 = x; open[side] = last;
    });
    this._startTrack(x, i, open.floor, open.ceil);
    this.speed = this.speedTarget(x);
    this.phase = 'run';
    this._generate();
    this._syncLevel();
    this.events.push({ type: 'levelUp', level: this.level, zone: this.zone, bonus: 0 });
  };
  // ------------------------------------------------------------------ resize / rotate
  /** New logical size: re-anchors everything (x scaled by the unit ratio; y kept relative to the corridor). */
  World.prototype.setLayout = function (w, h) {
    var old = this.layout, L = computeLayout(w, h);
    if (L.width === old.width && L.height === old.height) return;
    var k = L.unit / old.unit, m0 = old.midY, m1 = L.midY;
    function Y(v) { return m1 + (v - m0) * k; }
    this.layout = L;
    var i, hero = this.hero;
    hero.x *= k; hero.vy *= k;
    hero.y = hero.grounded ? this.standY(hero.side) : Y(hero.y);
    this.cam.x = hero.x - L.heroX;
    this.speed *= k; this._overV *= k;
    var sc = function (arr) { for (var j = 0; j < arr.length; j++) { arr[j].x0 *= k; arr[j].x1 *= k; } };
    sc(this.roofs); sc(this.rails); sc(this.hazards);
    for (i = 0; i < this.obstacles.length; i++) { var o = this.obstacles[i]; o.x *= k; o.w *= k; o.h *= k; }
    for (i = 0; i < this.fireflies.length; i++) {
      var f = this.fireflies[i];
      f.x *= k; f.baseX *= k; f.y = Y(f.y); f.baseY = Y(f.baseY); f.r *= k; f.vx *= k; f.vy *= k;
    }
    for (i = 0; i < this.gates.length; i++) this.gates[i].x *= k;
    for (i = 0; i < this.plans.length; i++) { this.plans[i].startX *= k; this.plans[i].finishX *= k; }
    var g = this.gen;
    g.cursor *= k; g.frontier *= k; g.decoX *= k; g.nextGateX *= k;
    g.lastStart.floor *= k; g.lastStart.ceil *= k; g.lastEnd.floor *= k; g.lastEnd.ceil *= k;
    for (i = 0; i < g.marks.length; i++) g.marks[i].x *= k;
    if (this.drone) { this.drone.x *= k; this.drone.y = Y(this.drone.y); }
    if (this.rescue) {
      var R = this.rescue;
      R.x *= k; R.catchY = Y(R.catchY); R.sx *= k; R.sy = Y(R.sy);
      if (R.outX !== undefined) { R.outX = R.outX * k; R.outY = Y(R.outY); }
    }
    // no lerp streak on the next frame
    this.cam.prevX = this.cam.x; hero.prevX = hero.x; hero.prevY = hero.y; hero.prevFlipT = hero.flipT;
    for (i = 0; i < this.fireflies.length; i++) { this.fireflies[i].prevX = this.fireflies[i].x; this.fireflies[i].prevY = this.fireflies[i].y; }
    if (this.drone) { this.drone.prevX = this.drone.x; this.drone.prevY = this.drone.y; }
    this._generate();
    this._syncLevel();
  };

  World.prototype._cull = function () {
    var cut = this.cam.x - this.layout.width * CONFIG.gen.behind, u = this.layout.unit;
    var sc = function (a) { var n = 0; while (n < a.length - 1 && a[n].x1 < cut) n++; if (n) a.splice(0, n); };
    sc(this.roofs); sc(this.rails);
    var n = 0; while (n < this.hazards.length && this.hazards[n].x1 < cut) n++; if (n) this.hazards.splice(0, n);
    this.obstacles = this.obstacles.filter(function (o) { return o.x + o.w / 2 >= cut; });
    this.fireflies = this.fireflies.filter(function (f) { return f.x >= cut - u; });
    this.gates = this.gates.filter(function (g) { return g.x >= cut; });
    var mk = this.gen.marks; while (mk.length > 2 && mk[1].x < cut) mk.shift();
    var keepFrom = 0; while (keepFrom < this.planIdx - 1) keepFrom++;
    if (keepFrom > 0) { this.plans.splice(0, keepFrom); this.planIdx -= keepFrom; this.gen.planIdx -= keepFrom; }
  };

  // ------------------------------------------------------------------ test hooks
  /** Hand-made track (tests). x values in UNITS relative to Bolt's current x; y offsets in units.
   *  spec = { roofs: [[a,b],…], rails: [[a,b],…] (default: solid everywhere), obstacles: [{kind:'vent'|'sign', variant, x}],
   *           fireflies: [{x, side:'floor'|'ceil'|'mid', dy, color}], gates: [{x, color}], finish: units | null } */
  World.prototype.setTrack = function (spec) {
    spec = spec || {};
    var u = this.layout.unit, X = this.hero.x, self = this, i;
    var mkSpans = function (list) {
      list = list || [[-50, 5000]];
      return list.map(function (s) { return { x0: X + s[0] * u, x1: X + s[1] * u }; }).sort(function (a, b) { return a.x0 - b.x0; });
    };
    this.roofs = mkSpans(spec.roofs); this.rails = mkSpans(spec.rails);
    this.obstacles = []; this.fireflies = []; this.gates = []; this.hazards = [];
    ['floor', 'ceil'].forEach(function (side) {
      var a = self._spans(side);
      for (var j = 0; j + 1 < a.length; j++) if (a[j + 1].x0 > a[j].x1) self.hazards.push({ kind: 'gap', side: side, x0: a[j].x1, x1: a[j + 1].x0, ob: null });
      if (a.length) self.hazards.push({ kind: 'gap', side: side, x0: a[a.length - 1].x1, x1: 1e12, ob: null });
    });
    (spec.obstacles || []).forEach(function (o) {
      var kind = o.kind === 'sign' ? 'sign' : 'vent', v = o.variant | 0, sz = CONFIG.obstacles[kind][v];
      var ob = { id: self._id++, kind: kind, variant: v, side: kind === 'vent' ? 'floor' : 'ceil', x: X + o.x * u, w: sz.w * u, h: sz.h * u, hit: false, hitT: 0 };
      self.obstacles.push(ob);
      self.hazards.push({ kind: kind, side: ob.side, x0: ob.x - ob.w / 2, x1: ob.x + ob.w / 2, ob: ob });
    });
    this.hazards.sort(function (a, b) { return a.x0 - b.x0; });
    (spec.fireflies || []).forEach(function (f) {
      var y = f.side === 'mid' ? self.layout.midY : self.standY(f.side || 'floor');
      var ff = self._addFF(X + f.x * u, y + (f.dy || 0) * u, f.color | 0);
      ff.phase = 0;
    });
    (spec.gates || []).forEach(function (g) { self.gates.push({ id: self._id++, x: X + g.x * u, color: g.color | 0, passed: false }); });
    var fin = spec.finish === undefined || spec.finish === null ? Infinity : X + spec.finish * u;
    this.plans = [{ level: this.level, startX: X, finishX: fin }]; this.planIdx = 0;
    this.gen.off = true; this.gen.planIdx = 0;
    this._syncLevel();
  };

  World.prototype.getState = function () {
    var h = this.hero;
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      score: this.score, combo: this.combo, mult: this.mult, maxCombo: this.maxCombo,
      hearts: this.hearts, maxHearts: this.maxHearts, difficulty: this.difficulty,
      distance: this.distance, progress: this.progress, levelLen: this.levelLen, speed: this.speed,
      cam: { x: this.cam.x },
      hero: { x: h.x, y: h.y, vy: h.vy, grav: h.grav, grounded: h.grounded, side: h.side, flipT: h.flipT,
        color: h.color, state: h.state, invuln: h.invuln, squash: h.squash },
      counts: { roofs: this.roofs.length, rails: this.rails.length, obstacles: this.obstacles.length,
        fireflies: this.fireflies.length, gates: this.gates.length, hazards: this.hazards.length },
      finish: this.finish ? this.finish.x : null,
      drone: this.drone ? this.drone.state : null,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  RF.World = World;
})(window.RF = window.RF || {});
