/* Nimbus's Bubble Garden — NB.World (headless, deterministic) + NB.World.CONFIG
 *
 * Contract: docs/DESIGN.md §2 and §5.1. Motion model and tuning numbers: docs/MECHANICS.md.
 * Units: px (logical, y DOWN) and seconds. Lengths/speeds in CONFIG are in "unit" multiples
 * (layout.unit = 100 at 960×540) and are multiplied by unit at use, so the garden plays the same on any
 * screen. Everything runs in fixed sub-steps of CONFIG.step: same seed + the same input calls at the same
 * simulated times → the same game at any frame rate.
 *
 *   var w = new NB.World({ seed: 7, difficulty: 'easy', width: 960, height: 540, level: 0 });
 *   w.setTarget(x, y);  w.update(1/60);
 *   var ev = w.drainEvents();        // [{type:'pop', ...}, {type:'grow', size}, ...]
 *   // render: x = lerp(o.prevX, o.x, w.alpha), y likewise; hero r = lerp(prevR, r); burr rot = lerp(prevRot, rot)
 *
 * Extras beyond DESIGN §5.1 (all optional for the renderer): hero.gemsInSize (int), hero.bob (px, already in y);
 * bubble.rise (its own terminal speed, px/s), bubble.freq (wobble Hz); burr.fade (1 → 0 alpha while rolling
 * out / washed away), burr.washed (true = knocked loose by the shower); world.alpha, world.acc.
 * Burrs: world keeps rot = 0 while hanging (the renderer swings them from burr.t); they spin while falling and
 * roll (rot += vx / r) on the lawn. 'gone' burrs stay in the array while fade > 0, then are removed.
 * Popped / escaped bubbles are removed at the end of the step (their events carry the object).
 */
(function (NB) {
  'use strict';
  var M = Math;

  var CONFIG = {
    step: 1 / 120,          // s      fixed sub-step: at heroMax (6 u/s) Nimbus moves 5 px per step, far less than a bubble radius
    maxFrame: 0.25,         // s      longest frame simulated (a hidden tab does not fast-forward minutes)

    // ---- Nimbus (hero) ----
    heroR: 0.34,            // unit   hit radius at size 1 (sprite circle is 1.25× bigger)
    growK: 0.25,            // ×      r = heroR·(1 + growK·(size − 1)) → 0.34 u … 0.68 u at size 5: twice as wide, a clearly bigger target
    gemsPerSize: 4,         // gems   per size step (REQUIREMENT)
    maxSize: 5,             // —      size 5 + gemsPerSize more gems → shower
    heroOmega: 7.0,         // rad/s  spring stiffness ω at size 1 (÷(1 + 0.15·(size − 1)) → 4.4 at size 5): ~0.5 s to settle, floaty but responsive
    heroZeta: 0.75,         // —      damping ratio: ≈3 % overshoot, a soft cloud-like "settle" instead of a robotic stop
    heroMax: 6.0,           // unit/s speed cap: crossing a 9.6 u wide screen takes ≈1.8 s, a toddler can follow her
    keySpeed: 5.0,          // unit/s keyboard target speed (slightly under heroMax so the spring keeps up)
    keyLead: 0.8,           // unit   keyboard target never runs more than this ahead of Nimbus (no long glide after release)
    touchLift: 0.7,         // unit   (main.js) touch target is this far above the finger so the finger never hides her
    bobAmp: 0.04,           // unit   idle bob ±4 px…
    bobHz: 0.6,             // Hz     …at 0.6 Hz, only while slow (fades out above 1 u/s)
    tiltMax: 0.25,          // rad    lean into the motion at full speed…
    tiltRate: 8,            // 1/s    …eased (95 % in 0.37 s)
    rRate: 9,               // 1/s    r eases to the size's radius: 95 % in ≈0.33 s — a soft puff-up (DESIGN ≈0.35 s)
    squashDecay: 6,         // 1/s    squash kick fades (to 10 % in 0.38 s)
    knockSpeed: 3.0,        // unit/s bump knock-back impulse (DESIGN)
    knockT: 0.35,           // s      spring is weakened (×knockSpring) for this long so the knock-back reads
    knockSpring: 0.25,      // ×
    invuln: 1.5,            // s      blink of safety after a bump (DESIGN)
    happyT: 0.6,            // s      mood 'happy' after a pop / grow
    ouchT: 0.9,             // s      mood 'ouch' after a bump
    blinkEvery: [2.2, 5],   // s      eye blink interval (cosmetic, own RNG stream)
    blinkLen: 0.16,         // s

    // ---- physics ----
    g: 9.8,                 // unit/s² burr gravity: "real" g if 1 unit = 1 m; a fall from the branch to the lawn takes ≈0.8 s
    burrDrag: 0.15,         // 1/s    light air drag on falling burrs (barely visible, keeps fast falls sane)
    burrWind: 0.5,          // ×      share of the wind a falling burr drifts with (heavy: a little)
    burrWindRate: 0.8,      // 1/s    …reached at this rate
    burrSpin: [2, 4.5],     // rad/s  spin while falling (random sign)
    burrRest: 0.26,         // unit   burr centre rests this far above groundY (the spike tips touch the lawn line)
    bounce: 0.35,           // ×      the one soft bounce: vy = −0.35·vy (DESIGN)
    rollSpeed: 1.5,         // unit/s sideways roll after the bounce…
    rollDecay: 0.9,         // 1/s    …slowing down (rolling friction)
    rollLife: 1.2,          // s      after landing it fades out and is gone (fade over the last 0.4 s)
    burrR: 0.24,            // unit   burr hit radius (×difficulty.burrR); the solid body is 0.19 u, spikes 0.32 u
    hangDY: 0.15,           // unit   burrs dangle at topY + 0.15 u
    burrClear: { easy: 1.3, normal: 0.5, hard: 0 }, // unit  a new burr is never spawned this close to Nimbus's x
    burrFirst: 0.6,         // ×      first burr of a level comes after 0.6 × the interval (min 3.5 s)
    burrBreather: 3.5,      // s      no burr during the first 3.5 s of a level
    washT: 0.6,             // s      a hanging burr knocked loose by the shower fades away over this

    // ---- bubbles ----
    bubbleR: [0.30, 0.42],  // unit   radius range; r = 0.30 + 0.12·√rand → small ones are rarer…
    smallFast: 0.25,        // ×      …and rise up to 25 % faster
    riseVar: 0.1,           // ×      ± per-bubble terminal speed variation
    buoyRate: 1.6,          // 1/s    velocity relaxes toward the terminal rise speed (buoyancy vs drag): 80 % in 1 s
    wobAmp: 0.25,           // unit   horizontal wobble amplitude (DESIGN)
    wobHz: [0.5, 0.9],      // Hz
    windShare: 0.8,         // ×      bubbles drift with 80 % of the wind (DESIGN)
    sideRate: 3.0,          // 1/s    horizontal velocity follows wobble + wind at this rate (light, soapy)
    pushK: 40,              // 1/s²   overlapping bubbles push apart: accel = pushK·overlap (20 px overlap → 800 px/s², apart in ≈0.2 s)
    bornDY: 0.15,           // unit   born this far below groundY (in the puddle)
    bornVy: 0.25,           // unit/s initial upward speed
    puddleJitter: 0.2,      // unit   ± around a puddle centre
    maxBubbles: 14,         // —      alive at once (≈ what fits a landscape screen without clutter)
    maxBurrs: 3,            // —      non-gone burrs at once

    // ---- scoring ----
    gemPoints: 10,          // pts × size
    showerTime: 2.5,        // s      (DESIGN)
    showerPop: 0.08,        // s      between rain pops during a shower
    showerBonus: 50,        // pts × (level + 1)
    levelBonus: 100,        // pts × (zone + 1) × (loop + 1)
    comboWindow: 1.2,       // s      a pop within this of the last one continues the streak
    comboAt: [3, 5, 8, 12, 20], // then every +10
    popK: 0.85,             // ×      pop when dist < hero.r + b.r·popK·difficulty.popK

    // ---- levels ----
    goal: { easy: 48, normal: 48, hard: 52 },   // gems per level (+2 per loop): ≈2 showers per level, 60–80 s for a casual player
    loopRise: 0.08,         // ×/loop each round after Night: bubbles 8 % faster…
    loopBurr: 0.1,          // ×/loop …burrs 10 % more often…
    loopCap: 4,             // loops  …up to loop 4
    windEvery: [4, 8],      // s      wind target changes this often (DESIGN)
    windRate: 0.5,          // 1/s    wind.x eases toward its target

    // ---- per difficulty (Easy is for a 4–6-year-old) ----
    //  hearts · rise = × zone rise speed · spawn = × zone bubbles/s · burrEvery = × zone burr interval ·
    //  hangTime = s of dangling before the drop · burrR = × burr hit radius · popK = × pop reach
    difficulty: {
      easy:   { hearts: 5, rise: 0.75, spawn: 1.05, burrEvery: 1.5,  hangTime: 1.6,  burrR: 0.85, popK: 1.25 },
      normal: { hearts: 3, rise: 1.0,  spawn: 1.0,  burrEvery: 1.0,  hangTime: 1.1,  burrR: 1.0,  popK: 1.0 },
      hard:   { hearts: 3, rise: 1.2,  spawn: 0.95, burrEvery: 0.72, hangTime: 0.85, burrR: 1.0,  popK: 0.95 }
    },
    //  rise = unit/s terminal rise · spawn = bubbles/s · burrEvery = s between burrs · windMax = unit/s (DESIGN)
    zones: [
      { rise: 0.85, spawn: 0.80, burrEvery: 6.0, windMax: 0.1 },   // dawn   (Easy: 0.64 u/s, 0.84/s, a burr every 9 s)
      { rise: 0.95, spawn: 0.82, burrEvery: 5.0, windMax: 0.35 },  // noon
      { rise: 1.05, spawn: 0.84, burrEvery: 4.2, windMax: 0.6 },   // sunset
      { rise: 1.12, spawn: 0.86, burrEvery: 3.5, windMax: 0.3 }    // night  (Hard: a burr every 2.5 s)
    ]
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;

  /** DESIGN §2 layout. */
  World.computeLayout = function (w, h) {
    var portrait = h > w;
    var unit = portrait ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4);
    var groundY = h - 0.95 * unit, topY = 0.85 * unit;
    return { width: w, height: h, portrait: portrait, unit: unit, groundY: groundY, topY: topY,
      minY: topY, maxY: groundY - 0.1 * unit };
  };

  World.prototype.reset = function (opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = new NB.RNG(this.seed);
    this.rngFx = this.rng.fork('fx');          // cosmetic only (blink): never shifts the gameplay stream
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.D = CONFIG.difficulty[this.difficulty];
    this.layout = World.computeLayout(opts.width || 960, opts.height || 540);
    var L = this.layout, u = L.unit;
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.phase = 'play';
    this.score = 0;
    this.maxHearts = this.hearts = this.D.hearts;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0; this._lastPop = -1e9;
    this.wind = { x: 0, target: 0, t: 2 };
    this.bubbles = []; this.burrs = []; this.events = [];
    this.stats = { pops: 0, gems: 0, bumps: 0, showers: 0, escaped: 0, levels: 0, sizeMax: 1, time: 0 };
    this._id = 0; this._spawnT = 0.4; this._rainPopT = 0;
    this._move = { x: 0, y: 0, on: false };
    var r0 = this.rFor(1);
    var hx = L.width / 2, hy = clamp(L.minY + (L.maxY - L.minY) * 0.55, L.minY + r0, L.maxY - r0);
    this.hero = { x: hx, y: hy, prevX: hx, prevY: hy, vx: 0, vy: 0, tx: hx, ty: hy, size: 1, grow: 0, gemsInSize: 0,
      r: r0, prevR: r0, tilt: 0, squash: 0, mood: 'idle', moodT: 0, invuln: 0, rainT: 0, blink: 0, knockT: 0, bob: 0 };
    this._blinkT = this.rngFx.range(CONFIG.blinkEvery[0], CONFIG.blinkEvery[1]); this._blinkA = -1;
    this._setLevel(opts.level | 0);
    void u;
  };

  World.prototype.rFor = function (size) {
    return CONFIG.heroR * this.layout.unit * (1 + CONFIG.growK * (size - 1));
  };

  World.prototype._setLevel = function (level) {
    this.level = M.max(0, level | 0);
    this.zone = this.level % 4;
    this.loop = M.floor(this.level / 4);
    this.Z = CONFIG.zones[this.zone];
    this.goal = CONFIG.goal[this.difficulty] + 2 * this.loop;
    this.gems = 0; this.progress = 0;
    var lk = M.min(this.loop, CONFIG.loopCap);
    this._riseK = 1 + CONFIG.loopRise * lk;
    this._burrK = 1 + CONFIG.loopBurr * lk;
    this._burrT = M.max(CONFIG.burrBreather, CONFIG.burrFirst * this.burrInterval());
  };

  /** Mean seconds between burrs in this level. */
  World.prototype.burrInterval = function () { return this.Z.burrEvery * this.D.burrEvery / this._burrK; };
  /** Terminal rise speed (px/s) of an average bubble in this level. */
  World.prototype.riseSpeed = function () { return this.Z.rise * this.D.rise * this._riseK * this.layout.unit; };

  World.prototype._emit = function (e) { this.events.push(e); return e; };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ---------------------------------------------------------------- input
  World.prototype._box = function (r) {
    var L = this.layout;
    var x0 = r, x1 = L.width - r, y0 = L.minY + r, y1 = L.maxY - r;
    if (x1 < x0) x0 = x1 = L.width / 2;
    if (y1 < y0) y0 = y1 = (L.minY + L.maxY) / 2;
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  };
  World.prototype.setTarget = function (x, y) {
    if (!isFinite(x) || !isFinite(y)) return;
    var b = this._box(this.hero.r);
    this.hero.tx = clamp(x, b.x0, b.x1); this.hero.ty = clamp(y, b.y0, b.y1);
  };
  World.prototype.clearTarget = function () { /* keeps the last target: Nimbus floats there and stays */ };
  World.prototype.setMove = function (ax, ay) {
    ax = clamp(+ax || 0, -1, 1); ay = clamp(+ay || 0, -1, 1);
    this._move.x = ax; this._move.y = ay;
  };

  // ---------------------------------------------------------------- spawns
  World.prototype._puddles = function () {
    var L = this.layout, u = L.unit, k = u / 100, out = [];
    if (L.portrait) return out;
    for (var n = 0; n * 960 * k < L.width; n++) {
      for (var i = 0; i < 4; i++) {
        var x = (120 + 240 * i + 960 * n) * k;
        if (x > 0.45 * u && x < L.width - 0.45 * u) out.push(x);
      }
    }
    return out;
  };

  World.prototype.spawnBubble = function (x, gem) {
    var L = this.layout, u = L.unit, r = this.rng;
    if (x === undefined || x === null) {
      var P = this._puddles();
      if (P.length >= 2) x = r.pick(P) + r.range(-1, 1) * CONFIG.puddleJitter * u;
      else x = r.range(0.5 * u, L.width - 0.5 * u);
    }
    var rr = CONFIG.bubbleR[0] + (CONFIG.bubbleR[1] - CONFIG.bubbleR[0]) * M.sqrt(r.next());
    var small = (CONFIG.bubbleR[1] - rr) / (CONFIG.bubbleR[1] - CONFIG.bubbleR[0]);
    var rise = this.riseSpeed() * (1 + CONFIG.smallFast * small) * (1 + r.range(-1, 1) * CONFIG.riseVar);
    if (gem === undefined || gem === null) gem = r.int(5); else gem = clamp(gem | 0, 0, 4);
    var y = L.groundY + CONFIG.bornDY * u;
    var b = { id: ++this._id, x: x, y: y, prevX: x, prevY: y, vx: 0, vy: -CONFIG.bornVy * u, r: rr * u, gem: gem,
      wob: r.range(0, 6.283), freq: r.range(CONFIG.wobHz[0], CONFIG.wobHz[1]), rise: rise, born: this.time, state: 'rise' };
    this.bubbles.push(b);
    this._emit({ type: 'spawn', b: b });
    return b;
  };

  World.prototype.spawnBurr = function (x) {
    var L = this.layout, u = L.unit, r = this.rng;
    if (x === undefined || x === null) {
      var clear = CONFIG.burrClear[this.difficulty] * u, hx = this.hero.x, best = null, bd = -1;
      for (var k = 0; k < 10; k++) {
        var c = r.range(0.5 * u, L.width - 0.5 * u), d = M.abs(c - hx);
        if (d >= clear) { best = c; break; }
        if (d > bd) { bd = d; best = c; }
      }
      if (M.abs(best - hx) < clear) {       // narrow screen: take the far side
        best = hx < L.width / 2 ? M.min(L.width - 0.5 * u, hx + clear) : M.max(0.5 * u, hx - clear);
      }
      x = best;
    }
    var y = L.topY + CONFIG.hangDY * u;
    var b = { id: ++this._id, x: x, y: y, prevX: x, prevY: y, vx: 0, vy: 0, rot: 0, prevRot: 0, spin: 0,
      r: CONFIG.burrR * this.D.burrR * u, variant: r.int(2), state: 'hang', t: 0, bounced: false, hit: false,
      fade: 1, washed: false };
    this.burrs.push(b);
    this._emit({ type: 'hang', burr: b });
    return b;
  };

  // ---------------------------------------------------------------- main loop
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    dt = M.min(dt, CONFIG.maxFrame);
    this.acc += dt;
    var h = CONFIG.step;
    while (this.acc >= h - 1e-12) { this._step(h); this.acc -= h; }
    if (this.acc < 0) this.acc = 0;
    this.alpha = clamp(this.acc / h, 0, 1);
  };

  World.prototype._step = function (h) {
    this.time += h;
    if (this.phase === 'play') this.stats.time += h;
    var i;
    var H = this.hero;
    H.prevX = H.x; H.prevY = H.y; H.prevR = H.r;
    for (i = 0; i < this.bubbles.length; i++) { var b = this.bubbles[i]; b.prevX = b.x; b.prevY = b.y; }
    for (i = 0; i < this.burrs.length; i++) { var c = this.burrs[i]; c.prevX = c.x; c.prevY = c.y; c.prevRot = c.rot; }
    this._wind(h);
    this._hero(h);
    if (this.phase === 'play') this._spawns(h);
    this._bubbles(h);
    if (this.phase === 'play') this._pops();
    this._shower(h);
    this._burrs(h);
    this._timers(h);
    // cleanup
    for (i = this.bubbles.length - 1; i >= 0; i--) if (this.bubbles[i].state === 'gone') this.bubbles.splice(i, 1);
    for (i = this.burrs.length - 1; i >= 0; i--) { var q = this.burrs[i]; if (q.state === 'gone' && q.fade <= 0) this.burrs.splice(i, 1); }
  };

  World.prototype._wind = function (h) {
    var W = this.wind, u = this.layout.unit, r = this.rng;
    W.t -= h;
    if (W.t <= 0) {
      W.t = r.range(CONFIG.windEvery[0], CONFIG.windEvery[1]);
      W.target = r.range(-1, 1) * this.Z.windMax * u;
    }
    var lim = this.Z.windMax * u;
    W.target = clamp(W.target, -lim, lim);
    W.x += (W.target - W.x) * (1 - M.exp(-CONFIG.windRate * h));
  };

  World.prototype._hero = function (h) {
    var H = this.hero, L = this.layout, u = L.unit;
    // keyboard: move the target from the hero's position
    var mv = this._move;
    if (mv.x || mv.y) {
      if (!mv.on) { mv.on = true; H.tx = H.x; H.ty = H.y; }
      var n = M.sqrt(mv.x * mv.x + mv.y * mv.y), s = CONFIG.keySpeed * u * h / M.max(1, n);
      H.tx += mv.x * s; H.ty += mv.y * s;
      var lead = CONFIG.keyLead * u, dx = H.tx - H.x, dy = H.ty - H.y, dl = M.sqrt(dx * dx + dy * dy);
      if (dl > lead) { H.tx = H.x + dx * lead / dl; H.ty = H.y + dy * lead / dl; }
    } else mv.on = false;
    // radius eases to the size's radius
    H.r += (this.rFor(H.size) - H.r) * (1 - M.exp(-CONFIG.rRate * h));
    var bx = this._box(H.r);
    H.tx = clamp(H.tx, bx.x0, bx.x1); H.ty = clamp(H.ty, bx.y0, bx.y1);
    // idle bob, folded into the spring target (fades out with speed)
    var sp = M.sqrt(H.vx * H.vx + H.vy * H.vy);
    var bobK = clamp(1 - sp / u, 0, 1);
    H.bob = CONFIG.bobAmp * u * M.sin(2 * M.PI * CONFIG.bobHz * this.time) * bobK;
    var ty = H.ty + H.bob;
    // spring
    var w = CONFIG.heroOmega / (1 + 0.15 * (H.size - 1)), z = CONFIG.heroZeta;
    var k = H.knockT > 0 ? CONFIG.knockSpring : 1;
    var ax = k * (w * w * (H.tx - H.x) - 2 * z * w * H.vx);
    var ay = k * (w * w * (ty - H.y) - 2 * z * w * H.vy);
    H.vx += ax * h; H.vy += ay * h;
    var cap = CONFIG.heroMax * u * (H.knockT > 0 ? 1.2 : 1);
    sp = M.sqrt(H.vx * H.vx + H.vy * H.vy);
    if (sp > cap) { H.vx *= cap / sp; H.vy *= cap / sp; }
    H.x += H.vx * h; H.y += H.vy * h;
    // stay inside the box (the box shrinks as she grows)
    if (H.x < bx.x0) { H.x = bx.x0; if (H.vx < 0) H.vx = 0; }
    if (H.x > bx.x1) { H.x = bx.x1; if (H.vx > 0) H.vx = 0; }
    if (H.y < bx.y0) { H.y = bx.y0; if (H.vy < 0) H.vy = 0; }
    if (H.y > bx.y1) { H.y = bx.y1; if (H.vy > 0) H.vy = 0; }
    var tt = clamp(H.vx / (CONFIG.heroMax * u), -1, 1) * CONFIG.tiltMax;
    H.tilt += (tt - H.tilt) * (1 - M.exp(-CONFIG.tiltRate * h));
  };

  World.prototype._spawns = function (h) {
    var r = this.rng;
    this._spawnT -= h;
    if (this._spawnT <= 0) {
      var rate = this.Z.spawn * this.D.spawn;
      this._spawnT += (1 / rate) * r.range(0.6, 1.4);
      if (this._alive(this.bubbles, 'rise') < CONFIG.maxBubbles) this.spawnBubble();
    }
    if (this.hero.rainT > 0) return;                     // no burrs during a shower
    this._burrT -= h;
    if (this._burrT <= 0) {
      this._burrT = this.burrInterval() * r.range(0.8, 1.2);
      var live = 0;
      for (var i = 0; i < this.burrs.length; i++) if (this.burrs[i].state !== 'gone') live++;
      if (live < CONFIG.maxBurrs) this.spawnBurr();
    }
  };
  World.prototype._alive = function (arr, st) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i].state === st) n++;
    return n;
  };

  World.prototype._bubbles = function (h) {
    var B = this.bubbles, u = this.layout.unit, i, j, b;
    var buoy = 1 - M.exp(-CONFIG.buoyRate * h), side = 1 - M.exp(-CONFIG.sideRate * h);
    var wind = this.wind.x * CONFIG.windShare;
    for (i = 0; i < B.length; i++) {
      b = B[i];
      if (b.state !== 'rise') continue;
      b.wob += 2 * M.PI * b.freq * h;
      // buoyancy vs drag: vy relaxes toward the terminal rise speed
      b.vy += (-b.rise - b.vy) * buoy;
      // sideways: the wobble's own velocity + wind drift
      var wv = CONFIG.wobAmp * u * 2 * M.PI * b.freq * M.cos(b.wob);
      b.vx += (wv + wind - b.vx) * side;
    }
    // soft push apart (never pop each other)
    for (i = 0; i < B.length; i++) {
      var a = B[i]; if (a.state !== 'rise') continue;
      for (j = i + 1; j < B.length; j++) {
        b = B[j]; if (b.state !== 'rise') continue;
        var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        var d = M.sqrt(dx * dx + dy * dy);
        if (d >= rr) continue;
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        var push = CONFIG.pushK * (rr - d) * h / 2;     // each gets half: accel = pushK·overlap
        var nx = dx / d, ny = dy / d;
        a.vx -= nx * push; a.vy -= ny * push * 0.5;      // mostly sideways: they slide around each other
        b.vx += nx * push; b.vy += ny * push * 0.5;
      }
    }
    var W = this.layout.width;
    for (i = 0; i < B.length; i++) {
      b = B[i]; if (b.state !== 'rise') continue;
      b.x += b.vx * h; b.y += b.vy * h;
      // soft walls at the screen edges (bubbles bounce gently off the sides)
      if (b.x < b.r * 0.6) { b.x = b.r * 0.6; if (b.vx < 0) b.vx = -b.vx * 0.3; }
      if (b.x > W - b.r * 0.6) { b.x = W - b.r * 0.6; if (b.vx > 0) b.vx = -b.vx * 0.3; }
      if (b.y < -b.r) {
        b.state = 'gone';
        this.stats.escaped++;
        this.combo = 0; this.comboT = 0;
        this._emit({ type: 'escape', b: b });
      }
    }
  };

  World.prototype._pops = function () {
    var H = this.hero, B = this.bubbles, k = CONFIG.popK * this.D.popK;
    for (var i = 0; i < B.length; i++) {
      var b = B[i];
      if (b.state !== 'rise') continue;
      var dx = b.x - H.x, dy = b.y - H.y, rr = H.r + b.r * k;
      if (dx * dx + dy * dy < rr * rr) this._pop(b, 'hero');
    }
  };

  World.prototype._pop = function (b, by) {
    var H = this.hero;
    b.state = 'gone';
    var points = CONFIG.gemPoints * H.size;
    this.score += points;
    this.gems++;
    this.stats.pops++; this.stats.gems++;
    this.combo = (this.time - this._lastPop < CONFIG.comboWindow) ? this.combo + 1 : 1;
    this._lastPop = this.time; this.comboT = CONFIG.comboWindow;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this._emit({ type: 'pop', b: b, x: b.x, y: b.y, gem: b.gem, points: points, size: H.size, combo: this.combo, by: by });
    if (isComboMark(this.combo)) this._emit({ type: 'combo', combo: this.combo });
    if (H.rainT <= 0) {
      H.squash = M.max(H.squash, 0.45);
      if (H.mood !== 'ouch' || H.moodT <= 0) { H.mood = 'happy'; H.moodT = CONFIG.happyT; }
      H.gemsInSize++;
      if (H.gemsInSize >= CONFIG.gemsPerSize) {
        if (H.size < CONFIG.maxSize) {
          H.size++; H.gemsInSize = 0; H.squash = 1;
          if (H.size > this.stats.sizeMax) this.stats.sizeMax = H.size;
          this._emit({ type: 'grow', size: H.size });
        } else {
          H.gemsInSize = CONFIG.gemsPerSize;
          this._startShower();
        }
      }
      H.grow = H.gemsInSize / CONFIG.gemsPerSize;
    }
    this.progress = clamp(this.gems / this.goal, 0, 1);
    if (this.gems >= this.goal) this._levelUp();
  };

  function isComboMark(c) {
    var A = CONFIG.comboAt;
    for (var i = 0; i < A.length; i++) if (A[i] === c) return true;
    var last = A[A.length - 1];
    return c > last && (c - last) % 10 === 0;
  }

  World.prototype._startShower = function () {
    var H = this.hero;
    H.rainT = CONFIG.showerTime;
    H.mood = 'rain'; H.moodT = CONFIG.showerTime;
    H.invuln = M.max(H.invuln, CONFIG.showerTime);
    H.squash = 1; H.grow = 1;
    this.stats.showers++;
    this._rainPopT = 0.12;
    this._emit({ type: 'shower' });
    // hanging burrs are washed off the branches (harmless)
    for (var i = 0; i < this.burrs.length; i++) {
      var c = this.burrs[i];
      if (c.state === 'hang') { c.state = 'gone'; c.washed = true; c.fade = 1; c.t = 0; }
    }
  };

  World.prototype._shower = function (h) {
    var H = this.hero;
    if (H.rainT <= 0) return;
    H.rainT -= h;
    this._rainPopT -= h;
    if (this._rainPopT <= 0 && this.phase === 'play') {
      this._rainPopT += CONFIG.showerPop;
      // pop the on-screen bubble nearest to Nimbus (the rain spreads out from her)
      var best = null, bd = 1e18, L = this.layout;
      for (var i = 0; i < this.bubbles.length; i++) {
        var b = this.bubbles[i];
        if (b.state !== 'rise' || b.y > L.groundY || b.y < -b.r * 0.5) continue;
        var dx = b.x - H.x, dy = b.y - H.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) this._pop(best, 'rain');
    }
    if (H.rainT <= 0) {
      H.rainT = 0;
      this.score += CONFIG.showerBonus * (this.level + 1);
      H.size = 1; H.gemsInSize = 0; H.grow = 0; H.squash = 1;
      H.mood = 'happy'; H.moodT = CONFIG.happyT;
      H.invuln = M.min(H.invuln, 0.3);
      this._emit({ type: 'showerEnd' });
      this._emit({ type: 'shrink', size: 1 });
    }
  };

  World.prototype._burrs = function (h) {
    var L = this.layout, u = L.unit, C = this.burrs, H = this.hero, g = CONFIG.g * u, r = this.rng;
    var rest = L.groundY - CONFIG.burrRest * u;
    for (var i = 0; i < C.length; i++) {
      var c = C[i];
      c.t += h;
      if (c.state === 'hang') {
        c.rot = 0;
        if (c.t >= this.D.hangTime) {
          c.state = 'fall'; c.t = 0; c.vx = this.wind.x * CONFIG.burrWind; c.vy = 0;
          c.spin = r.sign() * r.range(CONFIG.burrSpin[0], CONFIG.burrSpin[1]);
          this._emit({ type: 'drop', burr: c });
        }
      } else if (c.state === 'fall' || c.state === 'roll') {
        var drag = M.exp(-CONFIG.burrDrag * h);
        c.vy = c.vy * drag + g * h;
        if (c.state === 'fall') {
          c.vx += (this.wind.x * CONFIG.burrWind - c.vx) * (1 - M.exp(-CONFIG.burrWindRate * h));
          c.rot += c.spin * h;
        } else {
          c.vx *= M.exp(-CONFIG.rollDecay * h);
          c.rot += c.vx / (CONFIG.burrRest * u) * h;     // rolling without slipping
          c.spin = c.vx / (CONFIG.burrRest * u);
          if (c.t > CONFIG.rollLife - 0.4) c.fade = clamp((CONFIG.rollLife - c.t) / 0.4, 0, 1);
        }
        c.x += c.vx * h; c.y += c.vy * h;
        if (c.y >= rest) {
          c.y = rest;
          if (!c.bounced) {
            c.bounced = true;
            c.vy = -CONFIG.bounce * c.vy;
            var dir = M.abs(c.vx) > 0.2 * u ? (c.vx > 0 ? 1 : -1) : (c.x < H.x ? -1 : 1);   // roll away from Nimbus
            if (c.x < 0.8 * u) dir = 1; else if (c.x > L.width - 0.8 * u) dir = -1;
            c.vx = dir * CONFIG.rollSpeed * u;
            c.state = 'roll'; c.t = 0;
            this._emit({ type: 'land', burr: c });
          } else c.vy = 0;
        }
        if (c.state === 'roll' && (c.t >= CONFIG.rollLife || c.x < -u || c.x > L.width + u)) { c.state = 'gone'; c.fade = 0; }
        // bump: only a falling, not-yet-harmless burr hurts
        if (c.state === 'fall' && !c.hit && this.phase === 'play' && H.invuln <= 0 && H.rainT <= 0) {
          var dx = H.x - c.x, dy = H.y - c.y, rr = H.r * 0.9 + c.r;
          if (dx * dx + dy * dy < rr * rr) this._bump(c, dx, dy);
        }
      } else if (c.state === 'gone' && c.washed) {
        c.fade = clamp(1 - c.t / CONFIG.washT, 0, 1);
        c.vy += g * 0.25 * h; c.y += c.vy * h; c.x += this.wind.x * h;
      }
    }
  };

  World.prototype._bump = function (c, dx, dy) {
    var H = this.hero, u = this.layout.unit;
    var d = M.sqrt(dx * dx + dy * dy);
    var nx = d > 1e-6 ? dx / d : (H.x < this.layout.width / 2 ? 1 : -1), ny = d > 1e-6 ? dy / d : 0;
    if (ny < 0.2) ny = 0.2;                              // pushed down-ish and sideways (away from the spikes)
    var nl = M.sqrt(nx * nx + ny * ny); nx /= nl; ny /= nl;
    var mx = (H.x + c.x) / 2, my = (H.y + c.y) / 2;
    this.stats.bumps++;
    this.hearts = M.max(0, this.hearts - 1);
    var old = H.size;
    H.size = M.max(1, H.size - 1); H.gemsInSize = 0; H.grow = 0;
    H.vx = nx * CONFIG.knockSpeed * u + 0.3 * H.vx; H.vy = ny * CONFIG.knockSpeed * u + 0.3 * H.vy;
    H.knockT = CONFIG.knockT; H.invuln = CONFIG.invuln; H.squash = 1;
    H.mood = 'ouch'; H.moodT = CONFIG.ouchT;
    c.hit = true;
    c.vy = -M.abs(c.vy) * 0.3;
    c.vx = -nx * 1.5 * u;
    c.spin = -c.spin * 1.5;
    this.combo = 0; this.comboT = 0;
    this._emit({ type: 'bump', burr: c, x: mx, y: my });
    this._emit({ type: 'heartLost', hearts: this.hearts });
    if (H.size !== old) this._emit({ type: 'shrink', size: H.size });
    if (this.hearts <= 0) {
      this.phase = 'over';
      this._emit({ type: 'gameOver' });
    }
  };

  World.prototype._timers = function (h) {
    var H = this.hero, fx = this.rngFx;
    if (H.invuln > 0) H.invuln = M.max(0, H.invuln - h);
    if (H.knockT > 0) H.knockT = M.max(0, H.knockT - h);
    H.squash *= M.exp(-CONFIG.squashDecay * h);
    if (H.squash < 1e-3) H.squash = 0;
    if (H.rainT > 0) H.mood = 'rain';
    else if (H.moodT > 0) { H.moodT -= h; if (H.moodT <= 0) { H.moodT = 0; H.mood = 'idle'; } }
    else H.mood = 'idle';
    if (this.comboT > 0) this.comboT = M.max(0, this.comboT - h);
    // blink (cosmetic)
    if (this._blinkA >= 0) {
      this._blinkA += h;
      var p = this._blinkA / CONFIG.blinkLen;
      H.blink = p < 0.5 ? p * 2 : M.max(0, 2 - p * 2);
      if (p >= 1) { this._blinkA = -1; H.blink = 0; this._blinkT = fx.range(CONFIG.blinkEvery[0], CONFIG.blinkEvery[1]); }
    } else if ((this._blinkT -= h) <= 0) this._blinkA = 0;
  };

  World.prototype._levelUp = function () {
    var bonus = CONFIG.levelBonus * (this.zone + 1) * (this.loop + 1);
    this.score += bonus;
    this.stats.levels++;
    if (this.hearts < this.maxHearts) {
      this.hearts++;
      this._emit({ type: 'heartGain', hearts: this.hearts });
    }
    this._setLevel(this.level + 1);
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone, bonus: bonus });
  };

  World.prototype.gotoLevel = function (i) {
    this._setLevel(i);
    for (var k = 0; k < this.burrs.length; k++) { var c = this.burrs[k]; c.state = 'gone'; c.fade = 0; }
    this.burrs.length = 0;
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone, bonus: 0 });
  };

  // ---------------------------------------------------------------- resize / rotate
  World.prototype.setLayout = function (w, h) {
    var O = this.layout, L = World.computeLayout(w, h);
    if (O.width === L.width && O.height === L.height) return;
    var kx = L.width / O.width, ku = L.unit / O.unit;
    var ky = (L.groundY - L.topY) / (O.groundY - O.topY);
    function mx(x) { return x * kx; }
    function my(y) { return L.topY + (y - O.topY) * ky; }
    this.layout = L;
    var H = this.hero, u = L.unit, i;
    H.x = mx(H.x); H.y = my(H.y); H.tx = mx(H.tx); H.ty = my(H.ty);
    H.vx *= ku; H.vy *= ku; H.r = this.rFor(H.size); H.prevR = H.r;
    var bx = this._box(H.r);
    H.x = clamp(H.x, bx.x0, bx.x1); H.y = clamp(H.y, bx.y0, bx.y1);
    H.tx = clamp(H.tx, bx.x0, bx.x1); H.ty = clamp(H.ty, bx.y0, bx.y1);
    H.prevX = H.x; H.prevY = H.y;
    for (i = 0; i < this.bubbles.length; i++) {
      var b = this.bubbles[i];
      b.x = clamp(mx(b.x), 0, L.width); b.y = my(b.y); b.vx *= ku; b.vy *= ku; b.r *= ku; b.rise *= ku;
      b.prevX = b.x; b.prevY = b.y;
    }
    var rest = L.groundY - CONFIG.burrRest * u;
    for (i = 0; i < this.burrs.length; i++) {
      var c = this.burrs[i];
      c.x = clamp(mx(c.x), 0, L.width); c.vx *= ku; c.vy *= ku; c.r *= ku;
      if (c.state === 'hang') c.y = L.topY + CONFIG.hangDY * u;
      else c.y = M.min(my(c.y), rest);
      c.prevX = c.x; c.prevY = c.y; c.prevRot = c.rot;
    }
    this.wind.x *= ku; this.wind.target *= ku;
  };

  // ---------------------------------------------------------------- tests / debug
  World.prototype.getState = function () {
    var H = this.hero, live = 0;
    for (var i = 0; i < this.burrs.length; i++) if (this.burrs[i].state !== 'gone') live++;
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop, score: this.score,
      hearts: this.hearts, maxHearts: this.maxHearts, difficulty: this.difficulty, gems: this.gems, goal: this.goal,
      progress: this.progress, combo: this.combo, maxCombo: this.maxCombo, wind: this.wind.x,
      hero: { x: H.x, y: H.y, vx: H.vx, vy: H.vy, r: H.r, size: H.size, grow: H.grow, mood: H.mood, invuln: H.invuln, rainT: H.rainT },
      counts: { bubbles: this.bubbles.length, burrs: live, burrsAll: this.burrs.length },
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  NB.World = World;
})(window.NB = window.NB || {});
