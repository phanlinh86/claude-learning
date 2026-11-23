/* Puddle's Greenhouse Hop — PH.World: the headless, deterministic game simulation (DESIGN §5.1)
 *
 *   var w = new PH.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.steer(-1 | 0 | +1);                // the HELD direction (main.js: key/pointer down/up)
 *   w.update(dt);                        // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction
 *   w.drainEvents();                     // [{type:'bounce', …}, …]
 *
 * Units: u (1 u = 1 metre on the HUD) and seconds. x grows right, y grows UP, the greenhouse floor is y = 0.
 * The play column is x ∈ [0, COLW]. hero.y is Puddle's FEET; her body centre is hero.y + bodyY·size.
 * No pixels in here. Everything that moves keeps prev* values (saved at the start of each sub-step) so the
 * renderer can lerp with `alpha`; the camera keeps prevCamY, the hero prevSize.
 *
 * THE TWIST: Puddle grows (growRate per second + growPerFirefly per firefly, up to maxSize). mass = size².
 * Heavier = slower steering (÷ 1 + steerK·(mass − 1), never below minVxK), wider feet (landPad·size), bigger
 * catch radius, deeper leaf bends and higher leaf flicks, ×2 metre points while big. Each new floor pays a size
 * bonus and she shrinks back to 1.0 over shrinkT.
 *
 * Every CONFIG key with its unit and rationale is in docs/MECHANICS.md §1 (the values here are the truth).
 */
(function (PH) {
  'use strict';
  var M = Math, TAU = M.PI * 2;

  var CONFIG = {
    step: 1 / 120,
    COLW: 12, heroR: 0.55, wallBounce: -0.35,
    g: 26, bounceV: 12.4, springK: 1.6, rescueK: 1.45, maxFall: 16,
    maxVx: 5.0, accel: 34, drag: 8,
    landPad: 0.32, springPad: 0.45,
    squashT: 0.18, stretchRate: 14, tiltMax: 0.22, tiltRate: 10, crouchT: 0.1, startDelay: 0.6,
    camLead: 4.2, camRate: 6, genAhead: 24, removeBelow: 2, fallLine: 1.2,
    catchR: 0.8, bodyY: 0.55, lanternSize: 15, flyPoints: 10, comboT: 1.2,
    flyAmp: 0.15, flyPeriod: 1.5,
    rescueY: 0.6, rescueHeroY: -0.4, rescueW: 3.0, rescueT: 1.2, rescueLife: 2.0, rescueAfter: 0.5,
    invuln: 1.6, ouchT: 0.7, happyT: 1.0, springShow: 0.25,
    sideChance: 0.35, sideDx: [2.5, 5], springChance: 0.08, springFrom: 20,
    maxGap: 2.7, loopGap: 0.08, reachSafety: 0.8, edgeMargin: 0.3, leafGapMargin: 0.15,
    widths: { pot: 2.4, shelf: 1.7, leaf: 2.2, basket: 2.0 },
    meterEvery: 25, levelBonus: 100,
    // --- growth + weight (the twist)
    growRate: 0.004, growPerFirefly: 0.006, maxSize: 1.6, bigAt: 1.3, growStep: 0.1,
    steerK: 0.24, minVxK: 0.7, shrinkT: 0.8, sizeBonusK: 200, sizeHookMax: 2.5,
    // --- leaf: damped torsion spring about the stem (ω0 = √k ≈ 15.8 rad/s, ζ = c / 2ω0 ≈ 0.19)
    leaf: { k: 250, c: 6, impulse: 2.6, maxBend: 0.35, flick: 0.18, flickCap: 1.15 },
    // --- hanging basket: pendulum from a pivot above (g = world g)
    basket: { len: [2.0, 3.2], push: 0.35, maxK: 1.25, ampCap: 0.5 },
    goal: { easy: 115, normal: 125, hard: 160 },
    difficulty: {
      easy:   { hearts: 5, gap: [1.3, 2.0], maxDx: 2.6, widthK: 1.5,  basketK: 0.75, maxSize: 1.5, flyEvery: [5, 7] },
      normal: { hearts: 3, gap: [1.5, 2.4], maxDx: 4.0, widthK: 1.2,  basketK: 1.0,  maxSize: 1.6, flyEvery: [6, 9] },
      hard:   { hearts: 3, gap: [1.7, 2.6], maxDx: 4.6, widthK: 0.95, basketK: 1.15, maxSize: 1.6, flyEvery: [7, 10] }
    },
    zones: [
      { key: 'potting', kinds: { pot: 0.6, shelf: 0.4 },                             basketAmp: [0.25, 0.3] },
      { key: 'fern',    kinds: { pot: 0.3, shelf: 0.2, leaf: 0.35, basket: 0.15 },    basketAmp: [0.25, 0.32] },
      { key: 'balcony', kinds: { pot: 0.25, shelf: 0.2, leaf: 0.25, basket: 0.3 },    basketAmp: [0.3, 0.42] },
      { key: 'roof',    kinds: { pot: 0.3, shelf: 0.25, leaf: 0.25, basket: 0.2 },    basketAmp: [0.28, 0.38] }
    ]
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function pickW(r, weights) {
    var tot = 0, k;
    for (k in weights) tot += weights[k];
    var x = r.next() * tot;
    for (k in weights) { x -= weights[k]; if (x < 0) return k; }
    return k;
  }

  /** steering multiplier for a hero of this size: 1 / (1 + steerK·(mass − 1)), floored at minVxK */
  function steerF(size, C) {
    C = C || CONFIG;
    var mass = size * size;
    return M.max(C.minVxK, 1 / (1 + C.steerK * M.max(0, mass - 1)));
  }

  /** Horizontal distance a hop launched at bounceV covers (from vx = 0, full steer with steering factor k) by
   *  the time the feet come back DOWN through height dy above the launch point. Shared by generator, bot, tests. */
  function reachX(dy, C, k) {
    C = C || CONFIG; k = k || 1;
    var v = C.bounceV, disc = v * v - 2 * C.g * dy;
    if (disc < 0) return 0;
    var vm = C.maxVx * k, ac = C.accel * k;
    var t = (v + M.sqrt(disc)) / C.g, ta = vm / ac;
    return t <= ta ? 0.5 * ac * t * t : vm * vm / (2 * ac) + vm * (t - ta);
  }
  /** the generator's guaranteed limit for |centre A − centre B| (swing ranges subtracted by the caller) */
  function pathLimit(dy, wA, wB, D, C, k) {
    C = C || CONFIG;
    return M.min(D.maxDx, C.reachSafety * reachX(dy, C, k) + 0.5 * (wA / 2 + wB / 2));
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.reachX = reachX;
  World.pathLimit = pathLimit;
  World.steerF = steerF;

  World.prototype.setLayout = function () {};       // the world has no pixels

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.difficulty = C.difficulty[opts.difficulty] ? opts.difficulty : 'easy';
    this.D = C.difficulty[this.difficulty];
    this.rng = new PH.RNG(this.seed);
    this.rPlat = this.rng.fork('plat'); this.rFly = this.rng.fork('fly');
    this.time = 0; this.acc = 0; this.alpha = 0;
    this.phase = 'play';
    this.events = [];
    this.input = 0;
    this._id = 1;
    this.level = M.max(0, opts.level | 0);
    this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this.camY = 0; this.prevCamY = 0;
    this.maxY = 0; this.levelY0 = 0;
    this.goal = this._goalFor(this.level);
    this.progress = 0;
    this.score = 0; this.fireflyCount = 0; this.lantern = 0;
    this.hearts = this.maxHearts = this.D.hearts;
    this._metre = 0; this._nextMeter = C.meterEvery; this._lastCatch = -9; this._combo = 0; this._wallCd = 0;
    this._growStep = 0; this._shrinkFrom = 1;
    this.hero = { x: C.COLW / 2, prevX: C.COLW / 2, y: 0, prevY: 0, vx: 0, vy: 0, dir: 0, face: 1,
      squash: 0, stretch: 0, tilt: 0, mood: 'idle', moodT: 0, airT: 0, lastPlat: 0, invuln: 0, rescueT: 0, started: false,
      size: 1, prevSize: 1, mass: 1, big: false, shrinkT: 0 };
    this.platforms = [];
    // DESIGN uses `fireflies` for both the live array and the caught count: it is the ARRAY, and its
    // valueOf()/toString() give the caught count, so `world.fireflies + ''` / `> 0` still read as the count.
    var self = this, arr = [];
    Object.defineProperty(arr, 'valueOf', { value: function () { return self.fireflyCount; }, enumerable: false });
    Object.defineProperty(arr, 'toString', { value: function () { return String(self.fireflyCount); }, enumerable: false });
    this.fireflies = arr;
    this.stats = { fireflies: 0, bounces: 0, springs: 0, falls: 0, rescues: 0, levels: 0, maxY: 0, time: 0, lanterns: 0,
      maxSize: 1, bigTime: 0, leafFlicks: 0, swings: 0, shrinks: 0 };
    // ground + generator
    this.platforms.push(this._mkPlat('ground', C.COLW / 2, 0, { w: C.COLW + 2 }));
    this._gen = { last: { x: C.COLW / 2, y: 0, w: 3.0, hr: 0, rise: 0, kind: 'ground' }, top: 0, nextFly: 3.5 };
    this._generate();
  };

  Object.defineProperty(World.prototype, 'flies', { get: function () { return this.fireflies; } });   // short alias

  World.prototype._goalFor = function (level) {
    return CONFIG.goal[this.difficulty] * (1 + 0.1 * M.floor(level / 4));
  };
  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };
  /** current steering multiplier (1 at size 1, ≈ 0.73 at 1.6) */
  World.prototype.steerF = function () { return steerF(this.hero.size); };
  /** the slowest steering this difficulty can reach (the generator guarantees every gap with it) */
  World.prototype.slowF = function () { return steerF(this.D.maxSize); };

  // ------------------------------------------------------------------ input / hooks
  World.prototype.steer = function (dir) {
    dir = +dir || 0; this.input = dir > 0 ? 1 : dir < 0 ? -1 : 0;
    this.hero.dir = this.input;
    if (this.input) this.hero.face = this.input;
  };
  World.prototype.setX = function (x) {
    var C = CONFIG, h = this.hero, r = C.heroR * h.size;
    h.x = h.prevX = clamp(+x || 0, r, C.COLW - r);
  };
  World.prototype.gotoLevel = function (i) { this._levelUp(M.max(0, i | 0), 0, true); };
  /** test hook: grow by `amount` now (clamped to maxSize; emits grow / big like real growth) */
  World.prototype.grow = function (amount) { this._addSize(+amount || 0); };
  /** test hook: set the size directly (1 .. sizeHookMax; silent: no grow/big events, any shrink is cancelled) */
  World.prototype.setSize = function (s) {
    var C = CONFIG, h = this.hero;
    h.size = h.prevSize = clamp(+s || 1, 1, C.sizeHookMax);
    h.shrinkT = 0;
    this._sizeChanged(true);
  };

  World.prototype.spawn = function (kind, x, y, opts) {
    opts = opts || {};
    if (kind === 'firefly') {
      var f = this._mkFly(x, y); this.fireflies.push(f); return f;
    }
    var p = this._mkPlat(kind, x, y, opts);
    this.platforms.push(p);
    return p;
  };

  // ------------------------------------------------------------------ factories
  /** (x, y) = centre of the top surface at REST (a leaf unbent, a basket hanging straight down) */
  World.prototype._mkPlat = function (kind, x, y, opts) {
    opts = opts || {};
    var C = CONFIG, base = C.widths[kind] || (kind === 'rescue' ? C.rescueW : 2.4);
    var w = opts.w !== undefined ? opts.w : (kind === 'rescue' || kind === 'ground' ? base : base * this.D.widthK);
    var p = { id: this._id++, kind: kind, x: x, prevX: x, y: y, prevY: y, w: w, spring: kind === 'pot' && !!opts.spring,
      springT: 99, vx: 0, vy: 0, xm: x, hr: 0, state: 'live', t: 0, bounces: 0, path: false, lvl: this.level };
    if (kind === 'leaf') {
      p.side = opts.side === -1 || opts.side === 1 ? opts.side : (x < C.COLW / 2 ? -1 : 1);
      p.bend = opts.bend || 0; p.prevBend = p.bend; p.bendV = opts.bendV || 0; p.y0 = y;
      p.y = p.prevY = y - (w / 2) * M.sin(p.bend);
    } else if (kind === 'basket') {
      var B = C.basket;
      p.len = opts.len !== undefined ? opts.len : 0.5 * (B.len[0] + B.len[1]);
      p.amp0 = opts.amp !== undefined ? opts.amp : 0.3;
      p.ampMax = opts.ampMax !== undefined ? opts.ampMax : M.min(B.ampCap, M.max(p.amp0, p.amp0 * B.maxK));
      p.px = x; p.py = y + p.len; p.y0 = y; p.xm = x;
      p.hr = p.len * M.sin(p.ampMax);                       // worst-case horizontal half range
      p.rise = p.len * (1 - M.cos(p.ampMax));               // worst-case rise above the rest y
      var ph = opts.ph !== undefined ? opts.ph : 0;
      if (opts.ang !== undefined) { p.ang = opts.ang; p.angV = opts.angV || 0; }
      else {
        p.ang = p.amp0 * M.sin(ph);
        var e = 2 * (C.g / p.len) * (M.cos(p.ang) - M.cos(p.amp0));
        p.angV = (M.cos(ph) >= 0 ? 1 : -1) * M.sqrt(M.max(0, e));
      }
      this._placeBasket(p);
      p.prevX = p.x; p.prevY = p.y;
    }
    return p;
  };
  World.prototype._placeBasket = function (p) {
    var s = M.sin(p.ang), c = M.cos(p.ang);
    p.x = p.px + s * p.len; p.y = p.py - c * p.len;
    p.vx = c * p.len * p.angV; p.vy = s * p.len * p.angV;
  };
  /** current swing amplitude from the pendulum's energy (rad) */
  World.basketAmp = function (p, g) {
    g = g || CONFIG.g;
    var cA = M.cos(p.ang) - p.angV * p.angV * p.len / (2 * g);
    return M.acos(clamp(cA, -1, 1));
  };
  /** where platform p will be after `t` more seconds: {x, y}. Baskets: the pendulum integrated forward
   *  (1/60 s kick-drift-kick steps, as the world but coarser); everything else stays where it is. */
  World.prototype.platAt = function (p, t) {
    if (p.kind !== 'basket' || t <= 0) return { x: p.x, y: p.y };
    var g = CONFIG.g / p.len, a = p.ang, v = p.angV, dt = 1 / 60, n = M.floor(t / dt), rem = t - n * dt;
    for (var i = 0; i <= n; i++) {
      var h = i < n ? dt : rem; if (h <= 0) break;
      v -= 0.5 * g * M.sin(a) * h; a += v * h; v -= 0.5 * g * M.sin(a) * h;
    }
    return { x: p.px + M.sin(a) * p.len, y: p.py - M.cos(a) * p.len };
  };
  World.prototype.platXAt = function (p, t) { return this.platAt(p, t).x; };
  World.prototype._mkFly = function (x, y) {
    return { id: this._id++, x: x, prevX: x, y: y, prevY: y, bx: x, by: y,
      ph: this.rFly.range(0, TAU), state: 'live', t: 0 };
  };

  /** distance along a leaf from its stem to world x (0 .. w) */
  function leafDist(p, x) { return clamp((x - (p.x + p.side * p.w / 2)) * -p.side, 0, p.w); }
  /** the top surface height of p under world x, now or at the start of this sub-step */
  function surfY(p, x, prev) {
    if (p.kind === 'leaf') return p.y0 - leafDist(p, x) * M.sin(prev ? p.prevBend : p.bend);
    return prev ? p.prevY : p.y;
  }
  World.surfY = surfY;
  World.leafDist = leafDist;

  // ------------------------------------------------------------------ generation (deterministic, rng 'plat')
  /** which level a given height belongs to (levels are measured in climb, so future boundaries are known) */
  World.prototype._levelAt = function (y) {
    var L = this.level, y0 = this.levelY0, g = this.goal;
    while (y >= y0 + g && L < this.level + 4) { y0 += g; L++; g = this._goalFor(L); }
    return L;
  };

  World.prototype._basketParams = function (r, zone, loop) {
    var C = CONFIG, B = C.basket, Z = C.zones[zone];
    var len = r.range(B.len[0], B.len[1]);
    var amp0 = r.range(Z.basketAmp[0], Z.basketAmp[1]) * this.D.basketK * (1 + 0.05 * loop);
    amp0 = M.min(amp0, B.ampCap / B.maxK);
    var ampMax = M.min(B.ampCap, amp0 * B.maxK);
    return { len: len, amp: amp0, ampMax: ampMax, hr: len * M.sin(ampMax), rise: len * (1 - M.cos(ampMax)), ph: r.range(0, TAU) };
  };

  World.prototype._generate = function () {
    var C = CONFIG, G = this._gen, r = this.rPlat, D = this.D, kS = this.slowF();
    while (G.top < this.camY + C.genAhead) {
      var L = this._levelAt(G.top), zone = L % 4, loop = M.floor(L / 4), Z = C.zones[zone];
      var last = G.last;
      var gap1 = M.min(C.maxGap, D.gap[1] + C.loopGap * loop), gap0 = M.min(gap1, D.gap[0] + C.loopGap * loop);
      if (last.kind === 'leaf') { gap1 -= C.leafGapMargin; gap0 = M.min(gap0, gap1); }   // a leaf may still sag a bit
      var dy = r.range(gap0, gap1);
      var kind = pickW(r, Z.kinds);
      if (kind === 'basket' && (last.kind === 'basket' || last.kind === 'ground')) kind = 'pot';
      var w = C.widths[kind] * D.widthK, bp = null, hr = 0, rise = 0;
      if (kind === 'basket') {
        bp = this._basketParams(r, zone, loop); hr = bp.hr; rise = bp.rise;
        dy = M.max(0.8, M.min(dy, gap1 - rise));               // its highest swing point stays within the gap
      }
      var lim = pathLimit(dy + rise, last.w, w, D, C, kS) - last.hr - hr;
      if (lim < 0.6 && kind === 'basket') {
        kind = 'pot'; w = C.widths.pot * D.widthK; hr = 0; rise = 0; bp = null;
        lim = pathLimit(dy, last.w, w, D, C, kS) - last.hr;
      }
      lim = M.max(0, lim);
      var y = last.y + dy;
      var lo = w / 2 + C.edgeMargin + hr, hi = C.COLW - w / 2 - C.edgeMargin - hr;
      var mag = lim * (0.15 + 0.85 * r.next()), sgn = r.sign();
      var x = last.x + sgn * mag;
      if (x < lo || x > hi) x = last.x - sgn * mag;      // bounce off the column edge instead of hugging it
      x = clamp(x, lo, hi);
      if (M.abs(x - last.x) > lim) x = last.x + clamp(x - last.x, -lim, lim);
      x = clamp(x, lo, hi);
      var spring = kind === 'pot' && y > C.springFrom && r.chance(C.springChance);
      var opts = { w: w, spring: spring };
      if (bp) { opts.len = bp.len; opts.amp = bp.amp; opts.ampMax = bp.ampMax; opts.ph = bp.ph; }
      var p = this._mkPlat(kind, x, y, opts);
      p.path = true; p.lvl = L;
      this.platforms.push(p);
      // fireflies on a gentle arc between the previous path platform and this one
      if (y >= G.nextFly && last.kind !== 'ground') {
        this._flyArc(last, { x: x, y: y });
        var fe = D.flyEvery; G.nextFly = y + this.rFly.range(fe[0], fe[1]);
      }
      // ~35 % of rows get an extra side platform 2.5–5 u away (never a basket; not part of the guaranteed path)
      if (r.chance(C.sideChance)) {
        var sk = pickW(r, Z.kinds); if (sk === 'basket') sk = 'shelf';
        var sw = C.widths[sk] * D.widthK, sy = y + r.range(-0.35, 0.35);
        // never a trap: from the side platform Puddle can always hop back to this row's path platform, even at
        // her slowest (max-size) steering and with a basket at the far end of its swing
        var sMax = C.reachSafety * reachX(M.max(0, y + rise - sy), C, kS) + 0.5 * (sw / 2 + w / 2) - hr;
        var sMin = (sw + w) / 2 + hr + 0.4;
        var sdx = M.min(r.range(C.sideDx[0], C.sideDx[1]), sMax) * r.sign();
        var sx = x + sdx, slo = sw / 2 + C.edgeMargin, shi = C.COLW - sw / 2 - C.edgeMargin;
        if (sx < slo || sx > shi) sx = x - sdx;
        if (sMax >= sMin && sx >= slo && sx <= shi && M.abs(sx - x) >= sMin && !this._overlaps(sx, sy, sw)) {
          var sp = this._mkPlat(sk, sx, sy, { w: sw, spring: false });   // no mushrooms on side platforms (a launch could land nowhere)
          sp.lvl = L; this.platforms.push(sp);
        }
      }
      G.last = { x: x, y: y, w: w, hr: hr, rise: rise, kind: kind };
      G.top = y;
    }
  };
  /** true when a platform of width w at (x, y) would touch another one within 1.5 u of height (visual overlap) */
  World.prototype._overlaps = function (x, y, w) {
    for (var i = this.platforms.length - 1; i >= 0; i--) {
      var q = this.platforms[i]; if (q.kind === 'ground') continue;
      var qy = q.y0 !== undefined ? q.y0 : q.y, qx = q.kind === 'basket' ? q.xm : q.x;
      if (M.abs(qy - y) < 1.5 && M.abs(qx - x) < (q.w + w) / 2 + (q.hr || 0) + 0.3) return true;
      if (qy < y - 3) break;
    }
    return false;
  };

  World.prototype._flyArc = function (a, b) {
    var C = CONFIG, r = this.rFly, n = r.int(3, 5), arc = r.range(0.6, 1.1);
    for (var i = 0; i < n; i++) {
      var t = (i + 1) / (n + 1);
      var x = clamp(a.x + (b.x - a.x) * t, 0.8, C.COLW - 0.8);
      var y = a.y + (b.y - a.y) * t + 1.1 + M.sin(M.PI * t) * arc;
      this.fireflies.push(this._mkFly(x, y));
    }
  };

  // ------------------------------------------------------------------ main loop
  World.prototype.update = function (dt) {
    var C = CONFIG;
    this.acc += M.min(M.max(+dt || 0, 0), 0.25);
    while (this.acc >= C.step) { this.acc -= C.step; this._step(C.step); }
    this.alpha = this.acc / C.step;
  };

  World.prototype._step = function (dt) {
    var h = this.hero;
    this.time += dt; this.stats.time = this.time;
    h.prevX = h.x; h.prevY = h.y; h.prevSize = h.size; this.prevCamY = this.camY;
    var i, ps = this.platforms, fs = this.fireflies;
    for (i = 0; i < ps.length; i++) { var p = ps[i]; p.prevX = p.x; p.prevY = p.y; if (p.kind === 'leaf') p.prevBend = p.bend; }
    for (i = 0; i < fs.length; i++) { fs[i].prevX = fs[i].x; fs[i].prevY = fs[i].y; }

    this._stepPlatforms(dt);
    this._stepSize(dt);
    this._stepFlies(dt);
    this._stepHero(dt);
    if (this.phase === 'play') {
      this._stepCamera(dt);
      this._stepScore();
      this._generate();
      this._cleanup();
    }
  };

  // ------------------------------------------------------------------ growth (the twist)
  World.prototype._sizeChanged = function (silent) {
    var C = CONFIG, h = this.hero, wasBig = h.big;
    h.mass = h.size * h.size;
    h.big = h.size >= C.bigAt - 1e-9;
    if (h.size > this.stats.maxSize) this.stats.maxSize = h.size;
    var step = M.floor((h.size - 1) / C.growStep + 1e-6);
    if (silent || h.shrinkT > 0) { this._growStep = step; return; }
    while (step > this._growStep) { this._growStep++; this._emit({ type: 'grow', size: h.size, step: this._growStep }); }
    if (step < this._growStep) this._growStep = step;
    if (h.big && !wasBig) this._emit({ type: 'big', size: h.size });
  };
  World.prototype._addSize = function (d) {
    var h = this.hero, mx = this.D.maxSize;
    if (d <= 0 || h.size >= mx) return;
    h.size = M.min(mx, h.size + d);
    this._sizeChanged(false);
  };
  World.prototype._stepSize = function (dt) {
    var C = CONFIG, h = this.hero;
    if (h.shrinkT > 0) {                               // easing back to 1.0 after a new floor
      h.shrinkT = M.max(0, h.shrinkT - dt);
      h.size = 1 + (this._shrinkFrom - 1) * smooth(h.shrinkT / C.shrinkT);
      this._sizeChanged(true);
    } else if (this.phase === 'play' && h.started) {
      this._addSize(C.growRate * dt);
    }
    if (h.big && this.phase === 'play') this.stats.bigTime += dt;
  };

  // ------------------------------------------------------------------ platforms
  World.prototype._stepPlatforms = function (dt) {
    var C = CONFIG, ps = this.platforms, L = C.leaf;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.t += dt; p.springT += dt;
      if (p.kind === 'leaf') {                         // damped torsion spring (semi-implicit Euler)
        if (p.bend !== 0 || p.bendV !== 0) {
          p.bendV += (-L.k * p.bend - L.c * p.bendV) * dt;
          p.bend += p.bendV * dt;
          if (p.bend > L.maxBend) { p.bend = L.maxBend; if (p.bendV > 0) p.bendV = 0; }
          else if (p.bend < -L.maxBend) { p.bend = -L.maxBend; if (p.bendV < 0) p.bendV = 0; }
          if (M.abs(p.bend) < 1e-5 && M.abs(p.bendV) < 1e-4) { p.bend = 0; p.bendV = 0; }
          p.y = p.y0 - (p.w / 2) * M.sin(p.bend);
        }
      } else if (p.kind === 'basket') {                // pendulum, no damping: angV += −(g/len)·sin(ang)·dt as a
        var gl = C.g / p.len;                          // kick-drift-kick (velocity Verlet) step: energy error O(dt²)
        p.angV -= 0.5 * gl * M.sin(p.ang) * dt;
        p.ang += p.angV * dt;
        p.angV -= 0.5 * gl * M.sin(p.ang) * dt;
        this._placeBasket(p);
      } else if (p.kind === 'rescue' && ((p.bounces > 0 && p.t >= C.rescueAfter) || (p.bounces === 0 && p.t >= C.rescueLife))) {
        p.state = 'gone'; ps.splice(i, 1); continue;
      }
    }
  };
  function landable(p) { return p.state === 'live' && !(p.kind === 'rescue' && p.bounces > 0); }
  World.landable = landable;

  // ------------------------------------------------------------------ fireflies (figure-eight bob)
  World.prototype._stepFlies = function (dt) {
    var C = CONFIG, fs = this.fireflies, h = this.hero;
    var om = TAU / C.flyPeriod, cx = h.x, cy = h.y + C.bodyY * h.size, R = C.catchR * (0.75 + 0.25 * h.size), R2 = R * R;
    for (var i = fs.length - 1; i >= 0; i--) {
      var f = fs[i];
      f.t += dt;
      if (f.state === 'taken') { if (f.t > 0.4) { f.state = 'gone'; fs.splice(i, 1); } continue; }
      f.ph += om * dt;
      f.x = clamp(f.bx + C.flyAmp * M.sin(f.ph), 0.4, C.COLW - 0.4);
      f.y = f.by + C.flyAmp * 0.6 * M.sin(2 * f.ph);
      if (this.phase === 'play') {
        var dx = f.x - cx, dy = f.y - cy;
        if (dx * dx + dy * dy < R2) this._catch(f);
      }
    }
  };
  World.prototype._catch = function (f) {
    var C = CONFIG;
    f.state = 'taken'; f.t = 0;
    this._combo = this.time - this._lastCatch <= C.comboT ? this._combo + 1 : 1;
    this._lastCatch = this.time;
    this.fireflyCount++; this.stats.fireflies++; this.score += C.flyPoints; this.lantern++;
    this._emit({ type: 'firefly', f: f, x: f.x, y: f.y, combo: this._combo });
    if (this.hero.shrinkT <= 0) this._addSize(C.growPerFirefly);
    if (this.lantern >= C.lanternSize) {
      this.lantern = 0; this.stats.lanterns++;
      if (this.hearts < this.maxHearts) this.hearts++;
      this._emit({ type: 'lantern', hearts: this.hearts });
      this._emit({ type: 'heartGain', hearts: this.hearts });
    }
  };

  // ------------------------------------------------------------------ hero
  World.prototype._stepHero = function (dt) {
    var C = CONFIG, h = this.hero;
    h.moodT += dt; h.airT += dt;
    if (h.invuln > 0) h.invuln = M.max(0, h.invuln - dt);
    if (h.squash > 0) h.squash = M.max(0, h.squash - dt / C.squashT);

    if (!h.started) {                                 // sitting at the greenhouse door before the first hop
      if (this.time >= C.startDelay && this.phase === 'play') { h.started = true; this._bounce(this.platforms[0], 1, 0, 0); }
      else return;
    }

    // --- horizontal: steering accel / drag, all scaled by the weight factor
    var kf = steerF(h.size), vmax = C.maxVx * kf, acc = C.accel * kf;
    var dir = this.phase === 'play' ? this.input : 0;
    if (h.rescueT > 0) {                              // the umbrella keeps her lined up (no steering)
      h.rescueT = M.max(0, h.rescueT - dt);
      var tr = this._rescuePlat();
      var tvx = tr ? clamp((tr.x - h.x) * 4, -vmax, vmax) : 0;
      h.vx += (tvx - h.vx) * (1 - M.exp(-12 * dt));
    } else {
      if (dir !== 0) {
        if (h.vx * dir < vmax) {
          h.vx += dir * acc * dt;
          if (h.vx * dir > vmax && h.vx * dir - acc * dt <= vmax) h.vx = dir * vmax;
        }
      } else {
        h.vx *= M.exp(-C.drag * kf * dt);             // heavier: drifts further
      }
      if (M.abs(h.vx) > vmax) {                       // relax back under the cap (she just got heavier: never snap)
        var s = h.vx > 0 ? 1 : -1;
        h.vx = s * M.max(vmax, M.abs(h.vx) - acc * dt);
      }
    }
    if (dir) h.face = dir; else if (M.abs(h.vx) > 0.8) h.face = h.vx > 0 ? 1 : -1;
    h.x += h.vx * dt;
    if (this._wallCd > 0) this._wallCd -= dt;
    var rr = C.heroR * h.size, lo = rr, hi = C.COLW - rr;
    if (h.x < lo || h.x > hi) {
      var side = h.x < lo ? -1 : 1;
      h.x = side < 0 ? lo : hi;
      if (h.vx * side > 0) {
        var hard = M.abs(h.vx) > 1.2;
        h.vx *= C.wallBounce;
        if (hard && this._wallCd <= 0 && this.phase === 'play') { this._emit({ type: 'wall', side: side }); this._wallCd = 0.3; }
      }
    }

    // --- vertical: true gravity arc, terminal speed
    var y0 = h.y, v0 = h.vy;                          // exact ballistic step (trapezoid = the true parabola),
    h.vy = M.max(-C.maxFall, v0 - C.g * dt);          // so the apex is exactly v²/2g and the bot's maths match
    h.y += 0.5 * (v0 + h.vy) * dt;

    // --- one-way landing: the feet were above the (moving) top at the start of the step and are at/below it now
    if (h.vy <= 0 && this.phase === 'play') {
      var best = null, bestY = 0, ps = this.platforms, pad = C.landPad * h.size;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (!landable(p)) continue;
        if (M.abs(h.x - p.x) >= p.w / 2 + pad) continue;
        var sPrev = surfY(p, h.prevX, true), sNow = surfY(p, h.x, false);
        if (y0 >= sPrev - 1e-9 && h.y <= sNow) {
          if (!best || sNow > bestY) { best = p; bestY = sNow; }
        }
      }
      if (best) {
        var k = best.kind === 'rescue' ? C.rescueK : (best.spring && M.abs(h.x - best.x) < C.springPad ? C.springK : 1);
        this._bounce(best, k, bestY, v0);
      }
    }

    // --- pose: tilt, stretch, mood
    var tt = clamp(h.vx / C.maxVx, -1, 1) * C.tiltMax;
    h.tilt += (tt - h.tilt) * (1 - M.exp(-C.tiltRate * dt));
    var st = h.vy > 0 ? clamp((h.vy - 2) / 10, 0, 1) : clamp((-h.vy - 8) / 16, 0, 0.5);
    st *= 1 - h.squash;
    h.stretch += (st - h.stretch) * (1 - M.exp(-C.stretchRate * dt));
    this._updMood();

    // --- falling off the bottom
    if (this.phase === 'play' && h.y < this.camY - C.fallLine) this._fall();
  };

  World.prototype._setMood = function (m) { if (this.hero.mood !== m) { this.hero.mood = m; this.hero.moodT = 0; } };
  World.prototype._updMood = function () {
    var C = CONFIG, h = this.hero, m = h.mood;
    if (this.phase === 'over') { if (m !== 'ouch' && m !== 'fall') this._setMood(h.vy < -3 ? 'fall' : 'ouch'); else if (h.vy < -3) this._setMood('fall'); return; }
    if (m === 'happy' && h.moodT < C.happyT) return;
    if (m === 'ouch' && h.moodT < C.ouchT) return;
    if (m === 'crouch' && h.moodT < C.crouchT) return;
    if (h.vy > 0) this._setMood('up');
    else if (h.vy < -3) this._setMood('fall');
    else if (m === 'crouch' || m === 'happy' || m === 'ouch' || m === 'idle') this._setMood('up');
  };

  /** bounce off p: k = spring / rescue factor, sy = surface height at the contact, vLand = vy just before */
  World.prototype._bounce = function (p, k, sy, vLand) {
    var C = CONFIG, h = this.hero, L = C.leaf;
    var spring = k === C.springK && p.spring, flick = 1;
    if (p.kind === 'leaf' && !spring) {
      flick = M.min(L.flickCap, 1 + L.flick * M.max(0, h.mass - 1));
      var lev = 0.5 + leafDist(p, h.x) / p.w;          // lever: 0.5 at the stem, 1 mid-leaf, 1.5 at the tip
      p.bendV += L.impulse * h.mass * lev * M.abs(vLand) / C.bounceV;
      var peak = clamp(p.bend + p.bendV / M.sqrt(L.k) * 0.75, 0, L.maxBend);
      this._emit({ type: 'leafBend', p: p, depth: peak / L.maxBend, rad: peak });
      if (flick > 1.001) this.stats.leafFlicks++;
    }
    if (p.kind === 'basket') {                        // a nudge in her vx direction ∝ mass, amplitude clamped
      var B = C.basket;
      p.angV += B.push * h.mass * clamp(h.vx / C.maxVx, -1, 1) / p.len * 2;
      var gl = C.g / p.len, A = World.basketAmp(p);
      if (A > p.ampMax) {
        var e = 2 * gl * (M.cos(p.ang) - M.cos(p.ampMax));
        p.angV = (p.angV >= 0 ? 1 : -1) * M.sqrt(M.max(0, e));
      }
      this.stats.swings++;
    }
    h.y = p.kind === 'leaf' ? sy : (sy || p.y);
    h.vy = C.bounceV * k * flick; h.airT = 0; h.lastPlat = p.id;
    h.squash = 1; h.stretch = 0;
    p.bounces++;
    this.stats.bounces++;
    if (spring) { p.springT = 0; this.stats.springs++; }
    if (!(h.mood === 'happy' && h.moodT < C.happyT) && !(h.mood === 'ouch' && h.moodT < C.ouchT)) this._setMood('crouch');
    this._emit({ type: 'bounce', p: p, kind: p.kind, spring: spring, x: h.x, y: h.y, size: h.size, flick: flick });
    if (p.kind === 'rescue') p.t = 0;                 // removed rescueAfter s after its bounce
  };

  World.prototype._rescuePlat = function () {
    for (var i = this.platforms.length - 1; i >= 0; i--) {
      var p = this.platforms[i]; if (p.kind === 'rescue' && p.bounces === 0) return p;
    }
    return null;
  };

  World.prototype._fall = function () {
    var C = CONFIG, h = this.hero;
    this.hearts = M.max(0, this.hearts - 1);
    this.stats.falls++;
    this._emit({ type: 'fall', hearts: this.hearts });
    if (this.hearts <= 0) {
      this.phase = 'over';
      h.vy = M.min(h.vy, -2); h.vx *= 0.3;
      this._setMood('ouch');
      this._emit({ type: 'gameOver' });
      return;
    }
    // remove any older umbrella, open a fresh one and throw Puddle up through it
    for (var i = this.platforms.length - 1; i >= 0; i--) if (this.platforms[i].kind === 'rescue') this.platforms.splice(i, 1);
    // aim the umbrella under the nearest platform Puddle can reach from its throw (apex 6.2 u)
    var x = clamp(h.x, 1.6, C.COLW - 1.6), best = null, bd = 1e9;
    for (var j = 0; j < this.platforms.length; j++) {
      var q = this.platforms[j];
      if (q.kind === 'rescue' || q.kind === 'ground' || q.state !== 'live') continue;
      var qy = q.y0 !== undefined ? q.y0 : q.y;
      if (qy < this.camY + 1.6 || qy > this.camY + 5.0) continue;
      var d = M.abs((q.kind === 'basket' ? q.xm : q.x) - h.x) + (q.kind === 'basket' ? 1 : 0);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) x = clamp(best.kind === 'basket' ? best.xm : best.x, 1.6, C.COLW - 1.6);
    var p = this._mkPlat('rescue', x, this.camY + C.rescueY, { w: C.rescueW });
    this.platforms.push(p);
    h.y = h.prevY = this.camY + C.rescueHeroY;
    h.vy = C.bounceV * C.rescueK; h.vx = 0; h.airT = 0;
    h.rescueT = C.rescueT; h.invuln = C.invuln;
    this.stats.rescues++;
    this._setMood('ouch');
    this._emit({ type: 'rescue', x: x, y: p.y });
  };

  // ------------------------------------------------------------------ camera, score, levels
  World.prototype._stepCamera = function (dt) {
    var C = CONFIG, target = M.max(this.camY, this.hero.y - C.camLead);
    this.camY += (target - this.camY) * (1 - M.exp(-C.camRate * dt));
  };

  World.prototype._stepScore = function () {
    var C = CONFIG, h = this.hero;
    if (h.y > this.maxY) { this.maxY = h.y; this.stats.maxY = h.y; }
    var m = M.floor(this.maxY);
    if (m > this._metre) { this.score += (m - this._metre) * (h.big ? 2 : 1); this._metre = m; }
    while (this.maxY >= this._nextMeter) { this._emit({ type: 'meter', m: this._nextMeter }); this._nextMeter += C.meterEvery; }
    this.progress = clamp((this.maxY - this.levelY0) / this.goal, 0, 1);
    if (this.maxY - this.levelY0 >= this.goal) {
      this._levelUp(this.level + 1, C.levelBonus * (this.zone + 1) * (this.loop + 1), false);
    }
  };

  World.prototype._levelUp = function (L, bonus, hook) {
    var C = CONFIG, h = this.hero;
    var size = h.size, sizeBonus = hook ? 0 : M.max(0, M.round(C.sizeBonusK * (size - 1)));
    this.level = L; this.zone = L % 4; this.loop = M.floor(L / 4);
    this.levelY0 = this.maxY; this.goal = this._goalFor(L); this.progress = 0;
    this.score += bonus + sizeBonus; this.stats.levels++;
    if (this.hearts < this.maxHearts) { this.hearts++; this._emit({ type: 'heartGain', hearts: this.hearts }); }
    this._setMood('happy');
    if (size > 1) { this._shrinkFrom = size; h.shrinkT = C.shrinkT; this.stats.shrinks++; }
    this._emit({ type: 'levelUp', level: L, zone: this.zone, bonus: bonus, sizeBonus: sizeBonus, size: size });
  };

  World.prototype._cleanup = function () {
    var C = CONFIG, cut = this.camY - C.removeBelow, ps = this.platforms, fs = this.fireflies, i;
    for (i = ps.length - 1; i >= 0; i--) {
      var p = ps[i], py = p.y0 !== undefined ? p.y0 : p.y;
      if ((p.kind === 'ground' && this.camY > 3) || (p.kind !== 'rescue' && p.kind !== 'ground' && py < cut)) ps.splice(i, 1);
    }
    for (i = fs.length - 1; i >= 0; i--) if (fs[i].by < cut - 1) fs.splice(i, 1);
  };

  // ------------------------------------------------------------------ summary for tests / debug
  World.prototype.getState = function () {
    var h = this.hero, counts = {}, i;
    for (i = 0; i < this.platforms.length; i++) { var k = this.platforms[i].kind; counts[k] = (counts[k] || 0) + 1; }
    var st = {}; for (var s in this.stats) st[s] = this.stats[s];
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      camY: this.camY, maxY: this.maxY, levelY0: this.levelY0, goal: this.goal, progress: this.progress,
      score: this.score, fireflies: this.fireflyCount, lantern: this.lantern, hearts: this.hearts, maxHearts: this.maxHearts,
      difficulty: this.difficulty, size: h.size, big: h.big, mass: h.mass,
      hero: { x: h.x, y: h.y, vx: h.vx, vy: h.vy, dir: h.dir, face: h.face, squash: h.squash, stretch: h.stretch,
        tilt: h.tilt, mood: h.mood, airT: h.airT, lastPlat: h.lastPlat, invuln: h.invuln, rescueT: h.rescueT,
        size: h.size, mass: h.mass, big: h.big, shrinkT: h.shrinkT },
      platforms: this.platforms.length, kinds: counts, flies: this.fireflies.length, stats: st
    };
  };

  PH.World = World;
})(window.PH = window.PH || {});
