/* Bao's Arctic Reel — PR.World (headless, deterministic) + PR.CONFIG
 *
 * Contract: docs/DESIGN.md §5.1. Motion model and tuning notes: docs/MECHANICS.md.
 * Units: px (logical, y down) and seconds. Everything is driven by fixed sub-steps of
 * CONFIG.step so the same seed + the same press/release calls give the same game.
 *
 *   var w = new PR.World();
 *   w.reset({ seed: 7, difficulty: 'normal', width: 960, height: 540, level: 0 });
 *   w.press(); w.update(1/60); w.release(); ...
 *   var ev = w.drainEvents();       // [{type:'hook', item}, ...]
 *   // render: lerp prevX/prevY -> x/y with w.alpha
 */
(function (PR) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  var CONFIG = {
    step: 1 / 120,          // s     fixed sub-step; small enough that a 300 px/s hook moves 2.5 px per step (no tunnelling)
    maxFrame: 0.25,         // s     longest frame we simulate (tab was hidden → don't fast-forward minutes)

    // ---- layout (DESIGN §2) ----
    surfaceY: 150,          // px    top of the snow (Bao's seat line)
    waterTop: 190,          // px    just under the ice slab
    floorPad: 34,           // px    FLOOR_Y = H - floorPad (seabed line)
    hookTopPad: 14,         // px    minHookY = waterTop + 14: the hook rests just under the ice
    hookBottomPad: 22,      // px    maxHookY = floorY - 22: the hook never touches the sand
    bandSplits: [0.36, 0.68], // frac of minHookY..maxHookY: shallow | middle | deep

    // ---- hook motion ----
    hookR: 11,              // px    hit radius of the hook (around its hit centre = hook.x, hook.y)
    airGravity: 980,        // px/s² free fall when the hook dangles above the water (after a catch / new line)
    sinkAccel: 900,         // px/s² weight − buoyancy while held: reaches terminal speed in ≈0.35 s, feels "heavy"
    riseAccel: 520,         // px/s² buoyancy while released: weaker than the weight, so floating up is calmer than sinking
    // terminal speeds live in CONFIG.difficulty (sinkTerm / riseTerm); quadratic drag k = accel / vTerm²
    limitBounce: 0.25,      // —     restitution at the top/bottom limit: a small "thunk" instead of a hard stop
    limitRest: 18,          // px/s  below this the bounce is killed (no endless micro-jitter)
    tiltMax: 0.42,          // rad   hook leans this much at terminal speed (swings like it has inertia)
    tiltRate: 7,            // 1/s   exponential easing rate of tilt toward its target
    hangTime: 0.35,         // s     after a catch the empty hook hangs out of the hole before dropping back in
    hangAbove: 22,          // px    the hook hangs this far above waterTop (just inside the hole)
    newLineAbove: 30,       // px    a fresh line after a snap starts this far above waterTop and drops in

    // ---- reeling ----
    gemHang: 18,
    attachTime: 0.15,       // s     a hooked gem slides onto the hook instead of snapping to it            // px    a hooked gem's centre hangs this far below the hook's hit centre
    tugTime: 0.22,          // s     duration of the ease-out tug per good tap (fast but visible, not a teleport)
    slipTime: 0.38,         // s     duration of a slip (gem sinks back half a step)
    wobbleDecay: 3.2,       // 1/s   slip wobble fades with exp(-3.2 t)
    tugDecay: 4.5,          // 1/s   reel.tug (0..1 rod-bend anim value) fades with exp(-4.5 t)
    stepMinPx: 26,          // px    smallest reel step (keeps catches short in shallow water)
    zoneJumpMin: 0.22,      // frac  after each tap the green zone moves at least this far (no memorising)
    zoneEdge: 0.04,         // frac  zone never touches the meter ends
    zoneStartMin: 0.35,     // frac  first zone centre ≥ this, so the needle (starting at 0) gives time to aim
    catchFly: 0.65,         // s     gem flies in an arc from the hole to the bucket
    bucketDX: -150,         // px    bucket (gem landing point) relative to holeX
    bucketDY: -20,          // px    bucket landing y relative to surfaceY

    // ---- lines / snaps ----
    maxLines: 3,            // —     spools; a puffer bump snaps one
    snapReset: 1.0,         // s     after a snap the hook is gone this long, then a new line drops in
    invuln: 1.5,            // s     after the new line arrives, puffers can't snap it (no double-snap)
    puffTime: 0.28,         // s     puffer inflates over this time (item.puff 0..1)
    puffDrift: 42,          // px/s  puffed puffer drifts away from the hole this fast…
    puffRise: 16,           // px/s  …and floats up gently
    leaveSpeed: 150,        // px/s  on zone clear, puffers turn and swim off at this speed (harmless)

    // ---- scoring ----
    points: { amethyst: 10, emerald: 20, ruby: 30, gold: 50 }, // REQUIREMENT: gold = 5 × amethyst
    perfectBonus: 5,        // pts   per Perfect reel tap

    // ---- gems / swimmers ----
    gemR: 26,               // px    default gem hit radius (bubble drawn 62 px → 31 px; difficulty overrides)
    gemBobAmp: 5,           // px    gems in bubbles bob gently…
    gemBobRate: 1.9,        // rad/s …at ~3.3 s per bob
    goldChance: 1 / 12,     // —     per gem spawn; never twice in a row
    goldSpeed: 1.6,         // ×     golden gems drift faster (harder to get, worth more)
    goldNeedle: 1.15,       // ×     needle 15% faster while reeling a golden gem
    depthSpeed: 0.35,       // ×     swimmers 35% faster at the deepest point than at the top
    zoneSpeed: 0.1,         // ×     +10% swim speed per zone within a loop
    loopSpeedUp: 0.08,      // ×     endless: +8% speeds per completed loop of 4 zones…
    loopSpeedCap: 1.4,      // ×     …capped at +40%
    spawnMargin: 46,        // px    swimmers spawn this far outside the screen edge
    exitMargin: 90,         // px    and are removed this far outside
    maxGems: 4,             // —     swimming gems at once (more is visual noise for small kids)
    // gem band weights per zone (shallow, middle, deep): deeper zones put more value deeper
    bandWeights: [[0.62, 0.28, 0.10], [0.42, 0.38, 0.20], [0.30, 0.40, 0.30], [0.24, 0.36, 0.40]],
    bandTypes: ['amethyst', 'emerald', 'ruby'],
    pufferR: 19,            // px    default puffer hit radius (drawn 64×53; forgiving)
    pufferBobAmp: 10,       // px    puffers bob more than gems (they "swim")
    pufferBobRate: 2.4,     // rad/s
    pufferSpeed: [28, 46],  // px/s  slow, readable
    fishEvery: [2.5, 5.5],  // s     decorative fish
    fishSpeed: [55, 95],    // px/s
    fishSchool: [[1, 2], [2, 4], [1, 3], [1, 2]], // fish per spawn by zone (kelp = little schools)
    maxFish: 8,
    firstZoneGrace: 10,     // s     no puffers in the first 10 s of zone 0 (it teaches itself)
    zoneGrace: 4,           // s     every later zone also starts with a short puffer-free breather

    difficulty: {
      easy: {
        gemsNeeded: 6,
        sinkTerm: 190, riseTerm: 125,  // px/s  slow hook = easy to stop on a gem
        gemR: 30, pufferR: 16,         // px    big gems, small puffers
        gemEvery: [3.0, 4.4],          // s     gem spawn interval
        gemSpeed: [30, 44],            // px/s  slow drift
        reelWidth: 0.38, reelWidthZone: 0.02, reelWidthMin: 0.30, // frac of meter
        perfect: 0.11,                 // frac  gold centre width
        needle: 0.5, needleZone: 0.04, // sweeps/s (one sweep = 0→1)
        stepsFull: 4,                  // good taps to land a gem from the deepest point
        maxSlips: 3,
        pufferEvery: 24, pufferMin: 10, pufferMax: 1, pufferMaxCap: 2, // s, s, alive, alive cap
        pufferGrow: 0.85               // × spawn interval per level
      },
      normal: {
        gemsNeeded: 8,
        sinkTerm: 230, riseTerm: 150,
        gemR: 27, pufferR: 19,
        gemEvery: [3.0, 4.4],
        gemSpeed: [38, 56],
        reelWidth: 0.30, reelWidthZone: 0.025, reelWidthMin: 0.20,
        perfect: 0.08,
        needle: 0.65, needleZone: 0.07,
        stepsFull: 5,
        maxSlips: 3,
        pufferEvery: 13, pufferMin: 5, pufferMax: 2, pufferMaxCap: 4,
        pufferGrow: 0.82
      },
      hard: {
        gemsNeeded: 10,
        sinkTerm: 265, riseTerm: 170,
        gemR: 24, pufferR: 21,
        gemEvery: [2.8, 4.2],
        gemSpeed: [46, 68],
        reelWidth: 0.24, reelWidthZone: 0.025, reelWidthMin: 0.15,
        perfect: 0.06,
        needle: 0.85, needleZone: 0.09,
        stepsFull: 6,
        maxSlips: 3,
        pufferEvery: 8, pufferMin: 3.2, pufferMax: 3, pufferMaxCap: 5,
        pufferGrow: 0.8
      }
    }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeInOutSine(t) { return 0.5 - 0.5 * M.cos(M.PI * t); }

  function World(opts) {
    this.events = [];
    if (opts) this.reset(opts);
  }

  World.prototype.reset = function (opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = new PR.RNG(this.seed);
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = CONFIG.difficulty[this.difficulty];
    this.time = 0;
    this._acc = 0;
    this.alpha = 0;
    this.phase = 'roam';
    this.score = 0;
    this.maxLines = CONFIG.maxLines;
    this.lines = CONFIG.maxLines;
    this.gemsInZone = 0;
    this.gemsNeeded = this.diff.gemsNeeded;
    this.totalGems = 0;
    this.perfects = 0;
    this.invuln = 0;
    this.items = [];
    this._id = 1;
    this.events = [];
    this.stats = { casts: 0, hooks: 0, catches: 0, escapes: 0, snaps: 0, perfect: 0, good: 0, slip: 0,
      byType: { amethyst: 0, emerald: 0, ruby: 0, gold: 0 }, zoneTimes: [] };
    this.bao = { anim: 'idle', t: 0 };
    this.reel = { active: false, itemId: 0, needle: 0, dir: 1, speed: 0, zone: 0.5, width: 0.3, perfect: 0.08,
      stepPx: 40, slips: 0, maxSlips: this.diff.maxSlips, tug: 0, steps: 0, targetY: 0, u: 0, taps: 0 };
    this._tw = null;            // active hook tween while reeling
    this._lastGold = false;
    this._snapT = 0;
    this._hangT = 0;
    this.layout = null;
    this.setLayout(opts.width || 960, opts.height || 540);
    var L = this.layout;
    this.hook = { x: L.holeX, y: L.waterTop - CONFIG.newLineAbove, prevX: L.holeX, prevY: L.waterTop - CONFIG.newLineAbove,
      vy: 0, holding: false, tilt: 0, drop: true, lost: false, wob: 0, r: CONFIG.hookR };
    this._startLevel(opts.level | 0, true);
    return this;
  };

  // ------------------------------------------------------------------ layout
  World.prototype._calcLayout = function (w, h) {
    var surfaceY = CONFIG.surfaceY, waterTop = CONFIG.waterTop, floorY = h - CONFIG.floorPad;
    var minHookY = waterTop + CONFIG.hookTopPad, maxHookY = floorY - CONFIG.hookBottomPad;
    if (maxHookY < minHookY + 120) maxHookY = minHookY + 120; // tiny windows: still playable
    var span = maxHookY - minHookY;
    return {
      width: w, height: h, surfaceY: surfaceY, waterTop: waterTop, floorY: floorY,
      holeX: M.round(w / 2), minHookY: minHookY, maxHookY: maxHookY,
      bands: [minHookY, minHookY + span * CONFIG.bandSplits[0], minHookY + span * CONFIG.bandSplits[1], maxHookY]
    };
  };

  World.prototype.setLayout = function (w, h) {
    var old = this.layout, L = this._calcLayout(w, h);
    this.layout = L;
    if (!old) return;
    var oSpan = old.maxHookY - old.minHookY, nSpan = L.maxHookY - L.minHookY;
    function mapY(y) {
      if (y < old.minHookY) return y;                   // above the water: unchanged (ice is fixed)
      return L.minHookY + (y - old.minHookY) / oSpan * nSpan;
    }
    function mapX(x) { return x - old.holeX + L.holeX; }
    var hk = this.hook;
    if (hk) {
      hk.x = hk.prevX = L.holeX;
      hk.y = hk.prevY = mapY(hk.y);
      if (!hk.drop && !hk.lost) hk.y = hk.prevY = clamp(hk.y, L.minHookY, L.maxHookY);
    }
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      it.x = it.prevX = mapX(it.x);
      it.y = it.prevY = mapY(it.y);
      if (it.by !== undefined) it.by = mapY(it.by);
    }
    if (this._tw) { this._tw.from = mapY(this._tw.from); this._tw.to = mapY(this._tw.to); }
    if (this.reel.active) {
      this.reel.targetY = mapY(this.reel.targetY);
      this.reel.stepPx = this._stepPx();
      this.reel.steps = this._stepsLeft(this.reel.targetY);
    }
  };

  // ------------------------------------------------------------------ levels
  World.prototype._mult = function () { return M.min(1 + this.loop * CONFIG.loopSpeedUp, CONFIG.loopSpeedCap); };

  World.prototype._startLevel = function (level, first) {
    this.level = level;
    this.zone = level % 4;
    this.loop = M.floor(level / 4);
    this.zoneTime = 0;
    this.gemsInZone = 0;
    this.gemsNeeded = this.diff.gemsNeeded;
    var d = this.diff;
    this._gemT = first ? 0.6 : 1.2;
    this._fishT = 0.8;
    this._pufT = this._pufferInterval() * (first ? 0.6 : 0.5);
    this._grace = level === 0 ? CONFIG.firstZoneGrace : CONFIG.zoneGrace;
    this._reelWidth = M.max(d.reelWidthMin, d.reelWidth - d.reelWidthZone * this.zone - 0.02 * this.loop);
    this._needle = (d.needle + d.needleZone * this.zone) * this._mult();
    if (first) {
      // seed the sea with a calm first view: one gem already drifting in, one fish
      this._spawnGem(true);
      this._spawnFish(true);
    }
  };

  World.prototype._pufferInterval = function () {
    var d = this.diff;
    return M.max(d.pufferMin, d.pufferEvery * M.pow(d.pufferGrow, this.level)) / this._mult();
  };
  World.prototype._pufferMax = function () {
    var d = this.diff;
    return M.min(d.pufferMaxCap, d.pufferMax + M.floor(this.level / 2));
  };

  // ------------------------------------------------------------------ input
  World.prototype.press = function () {
    if (this.phase === 'roam') {
      if (!this.hook.holding) {
        this.hook.holding = true;
        this.stats.casts++;
        this._emit({ type: 'sinkStart' });
      }
    } else if (this.phase === 'reel') {
      this._reelTap();
    }
  };
  World.prototype.release = function () { this.hook.holding = false; };

  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };
  World.prototype._emit = function (e) { this.events.push(e); };

  // ------------------------------------------------------------------ main loop
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    if (dt > CONFIG.maxFrame) dt = CONFIG.maxFrame;
    this._acc += dt;
    var h = CONFIG.step;
    while (this._acc >= h - 1e-12) {
      this._step(h);
      this._acc -= h;
    }
    if (this._acc < 0) this._acc = 0;
    this.alpha = this._acc / h;
  };

  World.prototype._step = function (h) {
    this.time += h;
    this.zoneTime += h;
    var hk = this.hook, i, it;
    hk.prevX = hk.x; hk.prevY = hk.y;
    for (i = 0; i < this.items.length; i++) { it = this.items[i]; it.prevX = it.x; it.prevY = it.y; }
    if (this.invuln > 0) this.invuln = M.max(0, this.invuln - h);
    this.bao.t += h;
    if ((this.bao.anim === 'happy' || this.bao.anim === 'oops') && this.bao.t > 1.2) this._setBao(this.phase === 'reel' ? 'reel' : 'idle');

    if (this.phase === 'roam') this._stepHookRoam(h);
    else if (this.phase === 'reel') this._stepReel(h);
    else if (this.phase === 'snap') this._stepSnap(h);
    // 'over': the sea keeps living, the hook stays gone

    this._stepItems(h);
    if (this.phase !== 'over') this._spawn(h);
    if (this.phase === 'roam') this._collide();
  };

  World.prototype._setBao = function (a) { this.bao.anim = a; this.bao.t = 0; };

  // ---- hook physics while roaming: weight + buoyancy + quadratic drag
  World.prototype._stepHookRoam = function (h) {
    var hk = this.hook, L = this.layout, d = this.diff;
    if (this._hangT > 0) {               // empty hook hangs in the hole after a catch
      this._hangT -= h;
      hk.vy = 0;
      hk.tilt += (0 - hk.tilt) * (1 - M.exp(-CONFIG.tiltRate * h));
      return;
    }
    var a, wasAbove = hk.y < L.waterTop;
    if (hk.y < L.waterTop) {
      a = CONFIG.airGravity;             // dangling in the hole: free fall
    } else if (hk.holding) {
      var ks = CONFIG.sinkAccel / (d.sinkTerm * d.sinkTerm);
      a = CONFIG.sinkAccel - ks * hk.vy * M.abs(hk.vy);
    } else {
      var kr = CONFIG.riseAccel / (d.riseTerm * d.riseTerm);
      a = -CONFIG.riseAccel - kr * hk.vy * M.abs(hk.vy);
    }
    hk.vy += a * h;                      // semi-implicit Euler
    hk.y += hk.vy * h;
    if (wasAbove && hk.y >= L.waterTop) this._emit({ type: 'splash', x: hk.x, y: L.waterTop });
    if (hk.drop && (hk.y >= L.minHookY || (hk.y >= L.waterTop && hk.vy <= 0))) hk.drop = false;
    if (!hk.drop) {
      if (hk.y > L.maxHookY) {
        hk.y = L.maxHookY;
        hk.vy = hk.vy > CONFIG.limitRest ? -hk.vy * CONFIG.limitBounce : 0;
      } else if (hk.y < L.minHookY) {
        hk.y = L.minHookY;
        hk.vy = hk.vy < -CONFIG.limitRest ? -hk.vy * CONFIG.limitBounce : 0;
      }
    }
    var term = hk.vy >= 0 ? d.sinkTerm : d.riseTerm;
    var target = clamp(hk.vy / term, -1.2, 1.2) * CONFIG.tiltMax;
    hk.tilt += (target - hk.tilt) * (1 - M.exp(-CONFIG.tiltRate * h));
  };

  // ---- reel phase
  World.prototype._stepPx = function () {
    var L = this.layout;
    return M.max(CONFIG.stepMinPx, (L.maxHookY - L.waterTop) / this.diff.stepsFull);
  };
  World.prototype._stepsLeft = function (y) {
    return M.max(0, M.ceil((y - this.layout.waterTop) / this.reel.stepPx - 1e-9));
  };
  World.prototype._needleAt = function (u) { return 0.5 - 0.5 * M.cos(M.PI * u); };
  /** Needle position `t` seconds from now (for the bot; pure). */
  World.prototype.needleAfter = function (t) {
    var u = (this.reel.u + this.reel.speed * t) % 2;
    return this._needleAt(u);
  };

  World.prototype._newZone = function (first) {
    var r = this.reel, half = r.width / 2;
    var lo = half + CONFIG.zoneEdge, hi = 1 - half - CONFIG.zoneEdge;
    if (first) { r.zone = this.rng.range(M.max(lo, CONFIG.zoneStartMin), hi); return; }
    var c, tries = 0;
    do { c = this.rng.range(lo, hi); } while (M.abs(c - r.zone) < CONFIG.zoneJumpMin && ++tries < 12);
    r.zone = c;
  };

  World.prototype._startReel = function (it) {
    var r = this.reel, hk = this.hook;
    it.state = 'hooked';
    it.t = 0;
    it.ax0 = it.x; it.ay0 = it.y;
    hk.holding = false;
    hk.vy = 0;
    hk.drop = false;
    this.phase = 'reel';
    r.active = true;
    r.itemId = it.id;
    r.u = 0; r.needle = 0; r.dir = 1;
    r.width = this._reelWidth;
    r.perfect = M.min(this.diff.perfect, r.width * 0.5);
    r.speed = this._needle * (it.type === 'gold' ? CONFIG.goldNeedle : 1);
    r.stepPx = this._stepPx();
    r.slips = 0;
    r.maxSlips = this.diff.maxSlips;
    r.tug = 0;
    r.taps = 0;
    r.targetY = hk.y;
    r.steps = this._stepsLeft(hk.y);
    this._newZone(true);
    this._tw = null;
    this.stats.hooks++;
    this._setBao('reel');
    this._emit({ type: 'hook', item: it });
  };

  World.prototype._reelItem = function () {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].id === this.reel.itemId) return this.items[i];
    return null;
  };

  World.prototype._reelTap = function () {
    var r = this.reel, hk = this.hook, L = this.layout;
    if (!r.active || this._catching) return;
    r.taps++;
    var d = M.abs(r.needle - r.zone);
    if (d <= r.width / 2) {
      var perfect = d <= r.perfect / 2;
      var n = perfect ? 2 : 1;
      r.targetY = r.targetY - n * r.stepPx;
      if (r.targetY - L.waterTop < 0.5) r.targetY = L.waterTop - CONFIG.hangAbove;   // out of the water: landed
      r.tug = 1;
      this._tw = { from: hk.y, to: r.targetY, t: 0, dur: CONFIG.tugTime, kind: 'tug' };
      if (perfect) { this.perfects++; this.stats.perfect++; this.score += CONFIG.perfectBonus; }
      else this.stats.good++;
      r.steps = this._stepsLeft(r.targetY);
      this._emit({ type: 'reelGood', perfect: perfect, y: r.targetY });
      if (r.targetY <= L.waterTop) this._catching = true;
    } else {
      r.slips++;
      this.stats.slip++;
      r.targetY = M.min(L.maxHookY, r.targetY + r.stepPx / 2);
      this._tw = { from: hk.y, to: r.targetY, t: 0, dur: CONFIG.slipTime, kind: 'slip' };
      hk.wob = 1;
      r.steps = this._stepsLeft(r.targetY);
      this._emit({ type: 'reelSlip', slips: r.slips });
      if (r.slips >= r.maxSlips) { this._escape(); return; }
    }
    this._newZone(false);
  };

  World.prototype._stepReel = function (h) {
    var r = this.reel, hk = this.hook, it = this._reelItem();
    r.u = (r.u + r.speed * h) % 2;
    r.needle = this._needleAt(r.u);
    r.dir = r.u < 1 ? 1 : -1;
    r.tug *= M.exp(-CONFIG.tugDecay * h);
    hk.wob *= M.exp(-CONFIG.wobbleDecay * h);
    hk.vy = 0;
    if (this._tw) {
      var tw = this._tw;
      tw.t += h;
      var k = clamp(tw.t / tw.dur, 0, 1);
      var e = tw.kind === 'tug' ? easeOutCubic(k) : easeInOutSine(k);
      var ny = tw.from + (tw.to - tw.from) * e;
      hk.vy = (ny - hk.y) / h;
      hk.y = ny;
      if (k >= 1) this._tw = null;
    }
    // tilt: tugs lean the hook up toward the rod, slips swing it
    var target = clamp(hk.vy / 600, -1, 1) * CONFIG.tiltMax + M.sin(this.time * 18) * 0.35 * hk.wob;
    hk.tilt += (target - hk.tilt) * (1 - M.exp(-CONFIG.tiltRate * 2 * h));
    if (it) {
      // the gem eases onto the hook over attachTime, then rides it (wobbling after a slip)
      var tx = hk.x + M.sin(this.time * 20) * 7 * hk.wob, ty = hk.y + CONFIG.gemHang;
      var ka = easeOutCubic(clamp(it.t / CONFIG.attachTime, 0, 1));
      it.x = it.ax0 + (tx - it.ax0) * ka;
      it.y = it.ay0 + (ty - it.ay0) * ka;
    }
    if (this._catching && !this._tw) this._catch(it);
  };

  World.prototype._endReel = function () {
    this.reel.active = false;
    this.reel.itemId = 0;
    this._tw = null;
    this._catching = false;
    this.hook.holding = false;
    this.hook.wob = 0;
    this.phase = 'roam';
  };

  World.prototype._catch = function (it) {
    var L = this.layout, hk = this.hook;
    var pts = it ? CONFIG.points[it.type] || 0 : 0;
    this._endReel();
    this.score += pts;
    this.totalGems++;
    this.gemsInZone++;
    this.stats.catches++;
    if (it) {
      this.stats.byType[it.type] = (this.stats.byType[it.type] || 0) + 1;
      it.state = 'caught';
      it.t = 0;
      it.fx0 = it.x; it.fy0 = L.waterTop - 4;
      it.y = it.fy0;
    }
    hk.y = L.waterTop - CONFIG.hangAbove;
    hk.vy = 0;
    hk.drop = true;
    this._hangT = CONFIG.hangTime;
    this._setBao('happy');
    this._emit({ type: 'splash', x: hk.x, y: L.waterTop });
    this._emit({ type: 'catch', item: it, points: pts, x: hk.x, y: L.waterTop });
    if (this.gemsInZone >= this.gemsNeeded) this._levelUp();
  };

  World.prototype._escape = function () {
    var it = this._reelItem();
    this._endReel();
    this.stats.escapes++;
    if (it) {
      it.state = 'escape';
      it.t = 0;
      it.vx = this.rng.sign() * this.rng.range(55, 85);
      it.vy = -this.rng.range(50, 70);
    }
    this._setBao('oops');
    this._emit({ type: 'escape', item: it });
  };

  World.prototype._levelUp = function () {
    this.stats.zoneTimes.push(M.round(this.zoneTime * 10) / 10);
    if (this.lines < this.maxLines) { this.lines++; this._emit({ type: 'lineBack' }); }
    // puffers swim off gently and become harmless
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.kind === 'puffer' && it.state === 'swim') {
        it.leaving = true;
        it.vx = (it.x < this.layout.holeX ? -1 : 1) * M.max(M.abs(it.vx), 40);
      }
    }
    this._startLevel(this.level + 1, false);
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone });
  };

  /** Jump to a level (debug / tests). Keeps score and lines. */
  World.prototype.gotoLevel = function (level) {
    if (this.phase === 'reel') this._endReel();
    for (var i = this.items.length - 1; i >= 0; i--) if (this.items[i].kind === 'puffer') this.items.splice(i, 1);
    this._startLevel(M.max(0, level | 0), false);
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone });
  };

  // ---- snap
  World.prototype._snap = function (pf) {
    var hk = this.hook;
    this.lines--;
    this.stats.snaps++;
    pf.state = 'puffed';
    pf.t = 0;
    pf.puff = 0;
    pf.vx = (pf.x < hk.x ? -1 : 1) * CONFIG.puffDrift;
    pf.vy = -CONFIG.puffRise;
    hk.holding = false;
    hk.lost = true;
    hk.vy = 30;                           // the cut hook sinks slowly while it fades
    this._setBao('oops');
    this._emit({ type: 'snap', x: hk.x, y: hk.y });
    this._emit({ type: 'puff', item: pf });
    if (this.lines <= 0) {
      this.lines = 0;
      this.phase = 'over';
      this._emit({ type: 'gameOver' });
    } else {
      this.phase = 'snap';
      this._snapT = CONFIG.snapReset;
      this.invuln = CONFIG.snapReset + CONFIG.invuln;
    }
  };

  World.prototype._stepSnap = function (h) {
    var hk = this.hook, L = this.layout;
    hk.y = M.min(L.maxHookY, hk.y + hk.vy * h);
    hk.tilt += (0.6 - hk.tilt) * (1 - M.exp(-3 * h));
    this._snapT -= h;
    if (this._snapT <= 0) {
      hk.lost = false;
      hk.y = hk.prevY = L.waterTop - CONFIG.newLineAbove;
      hk.vy = 0; hk.tilt = 0; hk.drop = true; hk.holding = false;
      this.phase = 'roam';
      this._setBao('idle');
    }
  };

  // ------------------------------------------------------------------ items
  World.prototype._stepItems = function (h) {
    var L = this.layout, W = L.width, items = this.items, i, it;
    for (i = items.length - 1; i >= 0; i--) {
      it = items[i];
      it.t += h;
      var remove = false;
      if (it.state === 'swim') {
        if (it.leaving) it.vx = clamp(it.vx + (it.vx > 0 ? 1 : -1) * 220 * h, -CONFIG.leaveSpeed, CONFIG.leaveSpeed);
        it.x += it.vx * h;
        it.phase += it.bobRate * h;
        it.y = it.by + M.sin(it.phase) * it.bobAmp;
        if ((it.vx > 0 && it.x > W + CONFIG.exitMargin) || (it.vx < 0 && it.x < -CONFIG.exitMargin)) remove = true;
      } else if (it.state === 'escape') {
        // bubble wriggles free: rises with buoyancy, drifts sideways, slows in the water
        it.vy += -60 * h;
        it.vy *= M.exp(-0.6 * h);
        it.vx *= M.exp(-0.3 * h);
        it.x += it.vx * h + M.sin(it.t * 9) * 0.6;
        it.y += it.vy * h;
        if (it.y < L.waterTop + 8) { it.y = L.waterTop + 8; it.vy = 0; it.vx += (it.vx >= 0 ? 1 : -1) * 40 * h; }
        if (it.t > 3 || it.x < -CONFIG.exitMargin || it.x > W + CONFIG.exitMargin) remove = true;
      } else if (it.state === 'caught') {
        var k = clamp(it.t / CONFIG.catchFly, 0, 1);
        var bx = L.holeX + CONFIG.bucketDX, by = L.surfaceY + CONFIG.bucketDY;
        it.x = it.fx0 + (bx - it.fx0) * k;
        it.y = it.fy0 + (by - it.fy0) * k - M.sin(M.PI * k) * 90;
        if (k >= 1) remove = true;
      } else if (it.state === 'puffed') {
        it.puff = clamp(it.t / CONFIG.puffTime, 0, 1);
        it.r = it.r0 * (1 + 0.5 * it.puff);
        var go = it.t > CONFIG.puffTime ? 1 : 0.2;   // inflate first, then drift
        it.x += it.vx * go * h;
        it.y = M.max(L.waterTop + it.r, it.y + it.vy * go * h + M.sin(it.t * 3) * 0.3);
        if (it.t > 7 || it.x < -CONFIG.exitMargin || it.x > W + CONFIG.exitMargin) remove = true;
      }
      if (remove) items.splice(i, 1);
    }
  };

  World.prototype._count = function (kind) {
    var n = 0;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.kind === kind && it.state === 'swim' && !it.leaving) n++;
    }
    return n;
  };

  World.prototype._swimSpeed = function (base, depthFrac) {
    return base * (1 + CONFIG.depthSpeed * depthFrac) * (1 + CONFIG.zoneSpeed * this.zone) * this._mult();
  };

  World.prototype._newItem = function (kind, type, y, speed, side, r, bobAmp, bobRate, inside) {
    var L = this.layout;
    var dir = side < 0 ? 1 : -1;  // from the left edge → swim right
    var x = side < 0 ? -CONFIG.spawnMargin : L.width + CONFIG.spawnMargin;
    if (inside) x = side < 0 ? L.holeX - 260 : L.holeX + 260;
    var it = { id: this._id++, kind: kind, type: type, x: x, y: y, prevX: x, prevY: y, by: y,
      vx: dir * speed, vy: 0, r: r, r0: r, phase: this.rng.range(0, M.PI * 2), bobAmp: bobAmp, bobRate: bobRate,
      state: 'swim', t: 0, puff: 0, leaving: false };
    this.items.push(it);
    return it;
  };

  World.prototype._spawnGem = function (inside, forceGold) {
    var L = this.layout, rng = this.rng, d = this.diff;
    var gold = forceGold || (!this._lastGold && rng.chance(CONFIG.goldChance));
    this._lastGold = !!gold;
    var w = CONFIG.bandWeights[this.zone], roll = rng.next(), band = roll < w[0] ? 0 : roll < w[0] + w[1] ? 1 : 2;
    if (gold) band = rng.int(0, 2);
    var pad = CONFIG.gemBobAmp + 4;
    var y0 = L.bands[band] + pad, y1 = L.bands[band + 1] - pad;
    if (band === 0) y0 = L.minHookY + 2;     // shallow gems may sit right under the ice
    var y = rng.range(y0, M.max(y0 + 1, y1));
    var depth = (y - L.minHookY) / (L.maxHookY - L.minHookY);
    var speed = this._swimSpeed(rng.range(d.gemSpeed[0], d.gemSpeed[1]), depth) * (gold ? CONFIG.goldSpeed : 1);
    var type = gold ? 'gold' : CONFIG.bandTypes[band];
    var it = this._newItem('gem', type, y, speed, rng.sign(), d.gemR * (gold ? 1.05 : 1), CONFIG.gemBobAmp, CONFIG.gemBobRate, inside);
    if (gold) this._emit({ type: 'golden', item: it });
    return it;
  };

  World.prototype._spawnFish = function (inside) {
    var L = this.layout, rng = this.rng;
    var sch = CONFIG.fishSchool[this.zone], n = rng.int(sch[0], sch[1]);
    var side = rng.sign(), type = rng.chance(0.5) ? 'a' : 'b';
    var y = rng.range(L.minHookY + 20, L.maxHookY - 10);
    var depth = (y - L.minHookY) / (L.maxHookY - L.minHookY);
    var speed = this._swimSpeed(rng.range(CONFIG.fishSpeed[0], CONFIG.fishSpeed[1]), depth);
    for (var k = 0; k < n && this._count('fish') < CONFIG.maxFish; k++) {
      var it = this._newItem('fish', type, clamp(y + rng.range(-24, 24), L.minHookY, L.maxHookY), speed * rng.range(0.95, 1.05), side, 14, 4, rng.range(2.5, 3.5), inside);
      it.x -= (side < 0 ? 1 : -1) * k * rng.range(26, 40);   // trail behind the leader
      it.prevX = it.x;
    }
  };

  World.prototype._spawnPuffer = function () {
    var L = this.layout, rng = this.rng, d = this.diff;
    var y = rng.range(L.minHookY + 16, L.maxHookY - 6);
    var depth = (y - L.minHookY) / (L.maxHookY - L.minHookY);
    var speed = this._swimSpeed(rng.range(CONFIG.pufferSpeed[0], CONFIG.pufferSpeed[1]), depth * 0.5);
    return this._newItem('puffer', 'puffer', y, speed, rng.sign(), d.pufferR, CONFIG.pufferBobAmp, CONFIG.pufferBobRate);
  };

  World.prototype._spawn = function (h) {
    var rng = this.rng, d = this.diff;
    this._gemT -= h;
    if (this._gemT <= 0) {
      if (this._count('gem') < CONFIG.maxGems) this._spawnGem(false);
      this._gemT = rng.range(d.gemEvery[0], d.gemEvery[1]) / this._mult();
    }
    this._fishT -= h;
    if (this._fishT <= 0) {
      if (this._count('fish') < CONFIG.maxFish) this._spawnFish(false);
      this._fishT = rng.range(CONFIG.fishEvery[0], CONFIG.fishEvery[1]);
    }
    if (this.zoneTime >= this._grace) {
      this._pufT -= h;
      if (this._pufT <= 0) {
        if (this._count('puffer') < this._pufferMax()) this._spawnPuffer();
        this._pufT = this._pufferInterval() * rng.range(0.75, 1.25);
      }
    }
  };

  /** Test/debug hook: a golden gem drifting toward the hole from the left, in the middle band. */
  World.prototype.spawnGold = function () {
    var it = this._spawnGem(false, true), L = this.layout;
    it.x = it.prevX = L.holeX - 220;
    it.vx = M.abs(it.vx);
    it.by = it.y = it.prevY = (L.bands[1] + L.bands[2]) / 2;
    return it;
  };

  // ------------------------------------------------------------------ collisions
  World.prototype._collide = function () {
    var hk = this.hook;
    if (hk.lost || hk.y < this.layout.waterTop) return;
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state !== 'swim' || it.kind === 'fish') continue;
      var dx = it.x - hk.x, dy = it.y - hk.y, rr = it.r + hk.r;
      var d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (it.kind === 'puffer') {
        if (this.invuln > 0 || it.leaving) continue;
        this._snap(it);
        return;
      }
      if (d2 < bestD) { bestD = d2; best = it; }
    }
    if (best) this._startReel(best);
  };

  // ------------------------------------------------------------------ helpers for main / tests
  World.prototype.getState = function () {
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      score: this.score, lines: this.lines, gemsInZone: this.gemsInZone, gemsNeeded: this.gemsNeeded,
      totalGems: this.totalGems, perfects: this.perfects, difficulty: this.difficulty,
      hookY: this.hook.y, items: this.items.length
    };
  };

  PR.CONFIG = CONFIG;
  PR.World = World;
})(window.PR = window.PR || {});
