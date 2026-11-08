/* Clover's Farm Hop — FH.World: the headless, deterministic game simulation (DESIGN §5.1)
 *
 *   var w = new FH.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.steer(-1 | 0 | +1);                // the HELD direction (main.js: key/pointer down/up)
 *   w.update(dt);                        // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction
 *   w.drainEvents();                     // [{type:'bounce', …}, …]
 *
 * Units: u (1 u = 1 metre on the HUD) and seconds. x grows right, y grows UP, the farmyard ground is y = 0.
 * The play column is x ∈ [0, COLW]. hero.y is Clover's FEET; her body centre is hero.y + 0.55.
 * No pixels in here. Everything that moves keeps prev* values (saved at the start of each sub-step) so the
 * renderer can lerp with `alpha`; the camera keeps prevCamY.
 *
 * CONFIG (units → why):
 *   step 1/120 s ............. fixed sub-step: a 12 u/s bounce moves 0.1 u per step, so landings are exact
 *   COLW 12 u ................ column width (the renderer fits 12.8 u across a portrait phone)
 *   heroR 0.55 u ............. hero centre clamp from the walls (soft fence posts); wallBounce −0.35
 *   g 26 u/s² ................ with bounceV 12.4 u/s: apex v²/2g = 2.96 u, rise v/g = 0.48 s, hop 0.95 s —
 *                              a quick, springy "boing" (Doodle Jump's ratio), not a floaty moon jump
 *   springK 1.6 .............. spring bounce 19.8 u/s → apex 7.6 u (skips 3–4 rows: a big "BOING")
 *   rescueK 1.45 ............. trampoline 18 u/s → apex 6.2 u: high enough to get back among platforms
 *   maxFall 16 u/s ........... terminal speed: a long fall stays readable, never a blur
 *   maxVx 6.5 u/s, accel 34 u/s², drag 8 /s … full speed in 0.19 s (responsive for small fingers),
 *                              releasing stops in ≈ 0.35 s (drift vx/drag = 0.8 u) — precise, not icy
 *   landPad 0.22 u ........... a landing counts while |hero.x − p.x| < w/2 + landPad (her toes)
 *   springPad 0.45 u ......... the spring triggers within this of the bale centre (the coil is 0.55·unit wide)
 *   puffT 0.35 s, puffRegrow 3.5 s … a puff poofs 0.35 s after its bounce and grows back (new id, t = 0, state
 *                              'live') 3.5 s later at the same spot — a used puff can never strand Clover
 *   squashT 0.18 s ........... landing squash 1 → 0 linear; stretchRate 14 /s eases stretch toward vy-based target
 *   tiltMax 0.22 rad, tiltRate 10 /s … lean = clamp(vx/maxVx)·0.22 eased (no snapping when you let go)
 *   crouchT 0.1 s ............ 'crouch' mood after each bounce (the squash pose), then 'up' / 'fall' (vy < −3)
 *   startDelay 0.6 s ......... Clover sits ('idle') on the ground before the first hop
 *   camLead 4.2 u, camRate 6 /s … camera bottom follows hero.y − 4.2 up only, eased (≈ 0.17 s lag)
 *   genAhead 24 u ............ platforms exist up to camY + 24 (a portrait screen shows ≈ 20 u)
 *   removeBelow 2 u .......... platforms below camY − 2 are dropped; fallLine 1.2 u: hero.y < camY − 1.2 = a fall
 *   catchR 0.8 u ............. firefly catch radius around her body centre (generous for kids)
 *   lanternSize 20 ........... fireflies per lantern → +1 heart
 *   firstGust 6 s ............ the first wind warning comes 6 s into the run (the hint is read first)
 *   gustInK 0.4 s, gustOutK 0.5 s … strength smooth-steps in / out (wind is an acceleration, never a teleport)
 *   windOverK 0.35 ........... vx may exceed maxVx by windAx·0.35 while the wind blows
 *   rescueY 0.6 u, rescueHeroY −0.4 u, rescueT 1.2 s, rescueLife 2 s, invuln 1.6 s, ouchT 0.7 s, happyT 1 s
 *   comboT 1.2 s ............. fireflies caught within this of each other count up the combo (twinkle pitch)
 *   flyAmp 0.15 u, flyPeriod 1.5 s … the figure-eight bob (Lissajous 1:2)
 *   flyWind 0.8 u/s, flyHome 0.6 /s … wind drift of fireflies and their soft spring back home
 *   sideChance 0.35, sideDx [3, 6] u … extra side platforms
 *   springChance 0.08, springFrom 20 u … springs on hay bales (not in the first 20 m)
 *   reachSafety 0.8 .......... a path gap uses ≤ 80 % of the horizontal distance a hop can cover (wind margin)
 *   goal {easy 115, normal 140, hard 160} u of climb per level (× 1 + 0.1·loop). DESIGN said Easy 110: 115 puts a
 *                              casual bot (skill 0.5–0.7) at ≈ 50–80 s per Easy level (docs/MECHANICS.md)
 *   difficulty.*: hearts, gap [min,max] u, maxDx u, widthK, windK, warnT s, cartSpeed ×, flyEvery [min,max] u
 *                              (Easy widthK 1.35 / maxDx 3.0 instead of DESIGN's 1.25 / 3.2: wide bales, short steps for a 6-year-old)
 *   zones[z]: kinds {name: weight}, wind {every [s], blow [s], ax u/s²}, cartSpeed u/s (peak), cartRange [u] half
 */
(function (FH) {
  'use strict';
  var M = Math, TAU = M.PI * 2;

  var CONFIG = {
    step: 1 / 120,
    COLW: 12, heroR: 0.55, wallBounce: -0.35,
    g: 26, bounceV: 12.4, springK: 1.6, rescueK: 1.45, maxFall: 16,
    maxVx: 6.5, accel: 34, drag: 8,
    landPad: 0.22, springPad: 0.45,
    squashT: 0.18, stretchRate: 14, tiltMax: 0.22, tiltRate: 10, crouchT: 0.1, startDelay: 0.6,
    camLead: 4.2, camRate: 6, genAhead: 24, removeBelow: 2, fallLine: 1.2,
    catchR: 0.8, bodyY: 0.55, lanternSize: 20, flyPoints: 10, comboT: 1.2,
    flyAmp: 0.15, flyPeriod: 1.5, flyWind: 0.8, flyHome: 0.6,
    firstGust: 6, gustInK: 0.4, gustOutK: 0.5, windOverK: 0.35, flipChance: 0.7,
    rescueY: 0.6, rescueHeroY: -0.4, rescueW: 3.0, rescueT: 1.2, rescueLife: 2.0, rescueAfter: 0.5,
    invuln: 1.6, ouchT: 0.7, happyT: 1.0, puffT: 0.35, puffRegrow: 3.5, springShow: 0.25,
    sideChance: 0.35, sideDx: [3, 6], springChance: 0.08, springFrom: 20,
    maxGap: 2.7, loopGap: 0.08, reachSafety: 0.8, edgeMargin: 0.3,
    widths: { hay: 2.4, plank: 1.7, cart: 2.3, puff: 2.1 },
    meterEvery: 25, levelBonus: 100,
    goal: { easy: 115, normal: 140, hard: 160 },
    difficulty: {
      easy:   { hearts: 5, gap: [1.3, 2.0], maxDx: 3.0, widthK: 1.35, windK: 0.6,  warnT: 2.0, cartSpeed: 0.7,  flyEvery: [5, 7] },
      normal: { hearts: 3, gap: [1.5, 2.4], maxDx: 4.0, widthK: 1.0,  windK: 1.0,  warnT: 1.6, cartSpeed: 1.0,  flyEvery: [6, 9] },
      hard:   { hearts: 3, gap: [1.7, 2.6], maxDx: 4.6, widthK: 0.88, windK: 1.25, warnT: 1.3, cartSpeed: 1.25, flyEvery: [7, 10] }
    },
    zones: [
      { key: 'sunny', kinds: { hay: 0.6, plank: 0.4 },                           wind: { every: [11, 15], blow: [2.2, 3.0], ax: 5 },  cartSpeed: 1.0, cartRange: [0.8, 1.2] },
      { key: 'rain',  kinds: { hay: 0.35, plank: 0.25, cart: 0.22, puff: 0.18 }, wind: { every: [8, 12],  blow: [2.5, 3.5], ax: 7 },  cartSpeed: 1.1, cartRange: [0.8, 1.3] },
      { key: 'wind',  kinds: { hay: 0.3, plank: 0.2, cart: 0.28, puff: 0.22 },   wind: { every: [5, 8],   blow: [3.0, 4.5], ax: 10 }, cartSpeed: 1.3, cartRange: [0.9, 1.4] },
      { key: 'snow',  kinds: { hay: 0.3, plank: 0.3, cart: 0.2, puff: 0.2 },     wind: { every: [7, 10],  blow: [2.5, 4.0], ax: 8 },  cartSpeed: 1.2, cartRange: [0.9, 1.4] }
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

  /** Horizontal distance a hop launched at bounceV covers (from vx = 0, full steer) by the time the feet come
   *  back DOWN through height dy above the launch point. Pure maths, shared by the generator, bot and tests. */
  function reachX(dy, C) {
    C = C || CONFIG;
    var v = C.bounceV, disc = v * v - 2 * C.g * dy;
    if (disc < 0) return 0;
    var t = (v + M.sqrt(disc)) / C.g, ta = C.maxVx / C.accel;
    return t <= ta ? 0.5 * C.accel * t * t : C.maxVx * C.maxVx / (2 * C.accel) + C.maxVx * (t - ta);
  }
  /** the generator's guaranteed limit for |centre A − centre B| (cart ranges already subtracted by the caller) */
  function pathLimit(dy, wA, wB, D, C) {
    C = C || CONFIG;
    return M.min(D.maxDx, C.reachSafety * reachX(dy, C) + 0.5 * (wA / 2 + wB / 2));
  }

  function World(opts) { this.reset(opts); }
  World.CONFIG = CONFIG;
  World.reachX = reachX;
  World.pathLimit = pathLimit;

  World.prototype.setLayout = function () {};       // the world has no pixels

  World.prototype.reset = function (opts) {
    opts = opts || {};
    var C = CONFIG;
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.difficulty = C.difficulty[opts.difficulty] ? opts.difficulty : 'easy';
    this.D = C.difficulty[this.difficulty];
    this.rng = new FH.RNG(this.seed);
    this.rPlat = this.rng.fork('plat'); this.rFly = this.rng.fork('fly'); this.rWind = this.rng.fork('wind');
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
    this.hero = { x: C.COLW / 2, prevX: C.COLW / 2, y: 0, prevY: 0, vx: 0, vy: 0, dir: 0, face: 1,
      squash: 0, stretch: 0, tilt: 0, mood: 'idle', moodT: 0, airT: 0, lastPlat: 0, invuln: 0, rescueT: 0, started: false };
    this.platforms = [];
    this._regrow = [];
    // DESIGN uses `fireflies` for both the live array and the caught count: it is the ARRAY, and its
    // valueOf()/toString() give the caught count, so `world.fireflies + ''` / `> 0` still read as the count.
    var self = this, arr = [];
    Object.defineProperty(arr, 'valueOf', { value: function () { return self.fireflyCount; }, enumerable: false });
    Object.defineProperty(arr, 'toString', { value: function () { return String(self.fireflyCount); }, enumerable: false });
    this.fireflies = arr;
    this.wind = { state: 'calm', dir: this.rWind.sign(), t: 0, dur: 0, strength: 0, next: C.firstGust, count: 0, ax: 0 };
    this.stats = { fireflies: 0, bounces: 0, springs: 0, puffs: 0, falls: 0, rescues: 0, gusts: 0, levels: 0, maxY: 0, time: 0, lanterns: 0 };
    // ground + generator
    this.platforms.push(this._mkPlat('ground', C.COLW / 2, 0, { w: C.COLW + 2 }));
    this._gen = { last: { x: C.COLW / 2, y: 0, w: 3.0, hr: 0, kind: 'ground' }, top: 0, nextFly: 3.5, lastPuff: false };
    this._generate();
  };

  Object.defineProperty(World.prototype, 'flies', { get: function () { return this.fireflies; } });   // short alias

  World.prototype._goalFor = function (level) {
    return CONFIG.goal[this.difficulty] * (1 + 0.1 * M.floor(level / 4));
  };
  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ------------------------------------------------------------------ input / hooks
  World.prototype.steer = function (dir) {
    dir = +dir || 0; this.input = dir > 0 ? 1 : dir < 0 ? -1 : 0;
    this.hero.dir = this.input;
    if (this.input) this.hero.face = this.input;
  };
  World.prototype.setX = function (x) {
    var C = CONFIG, h = this.hero;
    h.x = h.prevX = clamp(+x || 0, C.heroR, C.COLW - C.heroR);
  };
  World.prototype.gust = function (dir) { this._startWarn(dir > 0 ? 1 : dir < 0 ? -1 : -this.wind.dir); };
  World.prototype.gotoLevel = function (i) { this._levelUp(M.max(0, i | 0), 0); };

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
  World.prototype._mkPlat = function (kind, x, y, opts) {
    opts = opts || {};
    var C = CONFIG, base = C.widths[kind] || (kind === 'rescue' ? C.rescueW : 2.4);
    var w = opts.w !== undefined ? opts.w : (kind === 'rescue' || kind === 'ground' ? base : base * this.D.widthK);
    var p = { id: this._id++, kind: kind, x: x, prevX: x, y: y, w: w, spring: !!opts.spring, springT: 99,
      vx: 0, x0: x, x1: x, xm: x, hr: 0, om: 0, ph: 0, state: 'live', t: 0, bounces: 0 };
    if (kind === 'cart') {
      var hr = opts.hr !== undefined ? opts.hr : (opts.x0 !== undefined && opts.x1 !== undefined ? (opts.x1 - opts.x0) / 2 : 1.0);
      var xm = opts.x0 !== undefined && opts.x1 !== undefined ? (opts.x0 + opts.x1) / 2 : x;
      var sp = opts.speed !== undefined ? opts.speed : this._cartSpeed(this.zone);
      p.hr = hr; p.xm = xm; p.x0 = xm - hr; p.x1 = xm + hr;
      p.om = hr > 0 ? sp / hr : 0;                 // peak speed = hr·ω = sp (sine easing: slow at the ends)
      p.ph = opts.ph !== undefined ? opts.ph : M.asin(clamp((x - xm) / (hr || 1), -1, 1));
      p.x = p.prevX = xm + hr * M.sin(p.ph);
      p.vx = hr * p.om * M.cos(p.ph);
    }
    return p;
  };
  World.prototype._cartSpeed = function (zone) {
    return CONFIG.zones[zone].cartSpeed * this.D.cartSpeed * (1 + 0.1 * this.loop);
  };
  /** cart / platform x after `t` more seconds (the bot leads moving carts with this) */
  World.prototype.platXAt = function (p, t) {
    if (p.kind !== 'cart' || !p.om) return p.x;
    return p.xm + p.hr * M.sin(p.ph + p.om * t);
  };
  World.prototype._mkFly = function (x, y) {
    return { id: this._id++, x: x, prevX: x, y: y, prevY: y, bx: x, by: y, wx: 0,
      ph: this.rFly.range(0, TAU), state: 'live', t: 0 };
  };

  // ------------------------------------------------------------------ generation (deterministic, rng 'plat')
  /** which level a given height belongs to (levels are measured in climb, so future boundaries are known) */
  World.prototype._levelAt = function (y) {
    var L = this.level, y0 = this.levelY0, g = this.goal;
    while (y >= y0 + g && L < this.level + 4) { y0 += g; L++; g = this._goalFor(L); }
    return L;
  };

  World.prototype._generate = function () {
    var C = CONFIG, G = this._gen, r = this.rPlat, D = this.D;
    while (G.top < this.camY + C.genAhead) {
      var L = this._levelAt(G.top), zone = L % 4, loop = M.floor(L / 4), Z = C.zones[zone];
      var last = G.last;
      var gap0 = D.gap[0] + C.loopGap * loop, gap1 = M.min(C.maxGap, D.gap[1] + C.loopGap * loop);
      var dy = M.min(C.maxGap, r.range(M.min(gap0, gap1), gap1));
      var y = last.y + dy;
      var kind = pickW(r, Z.kinds);
      if (kind === 'puff' && (G.lastPuff || last.kind === 'ground')) kind = 'hay';
      var w = C.widths[kind] * D.widthK;
      var hr = 0;
      if (kind === 'cart') hr = r.range(Z.cartRange[0], Z.cartRange[1]);
      var lim = pathLimit(dy, last.w, w, D) - last.hr - hr;
      if (lim < 0.6 && kind === 'cart') { kind = 'hay'; w = C.widths.hay * D.widthK; hr = 0; lim = pathLimit(dy, last.w, w, D) - last.hr; }
      lim = M.max(0, lim);
      var lo = w / 2 + C.edgeMargin + hr, hi = C.COLW - w / 2 - C.edgeMargin - hr;
      var mag = lim * (0.15 + 0.85 * r.next()), sgn = r.sign();
      var x = last.x + sgn * mag;
      if (x < lo || x > hi) x = last.x - sgn * mag;      // bounce off the column edge instead of hugging it
      x = clamp(x, lo, hi);
      if (M.abs(x - last.x) > lim) x = last.x + clamp(x - last.x, -lim, lim);
      x = clamp(x, lo, hi);
      var spring = kind === 'hay' && y > C.springFrom && r.chance(C.springChance);
      var opts = { w: w, spring: spring };
      if (kind === 'cart') { opts.hr = hr; opts.x0 = x - hr; opts.x1 = x + hr; opts.speed = this._cartSpeedFor(zone, loop); opts.ph = r.range(0, TAU); }
      var p = this._mkPlat(kind, x, y, opts);
      p.path = true; p.lvl = L;
      this.platforms.push(p);
      // fireflies on a gentle arc between the previous path platform and this one
      if (y >= G.nextFly && last.kind !== 'ground') {
        this._flyArc(last, { x: x, y: y });
        var fe = D.flyEvery; G.nextFly = y + this.rFly.range(fe[0], fe[1]);
      }
      // ~35 % of rows get an extra side platform 3–6 u away (never a cart; not part of the guaranteed path)
      if (r.chance(C.sideChance)) {
        var sk = pickW(r, Z.kinds); if (sk === 'cart') sk = 'plank';
        var sw = C.widths[sk] * D.widthK, sdx = r.range(C.sideDx[0], C.sideDx[1]) * r.sign();
        var sx = x + sdx, slo = sw / 2 + C.edgeMargin, shi = C.COLW - sw / 2 - C.edgeMargin;
        if (sx < slo || sx > shi) sx = x - sdx;
        if (sx >= slo && sx <= shi && M.abs(sx - x) >= (sw + w) / 2 + hr + 0.4) {
          var sp = this._mkPlat(sk, sx, y + r.range(-0.35, 0.35), { w: sw, spring: sk === 'hay' && y > C.springFrom && r.chance(C.springChance * 0.5) });
          sp.lvl = L; this.platforms.push(sp);
        }
      }
      G.last = { x: x, y: y, w: w, hr: hr, kind: kind };
      G.lastPuff = kind === 'puff';
      G.top = y;
    }
  };
  World.prototype._cartSpeedFor = function (zone, loop) {
    return CONFIG.zones[zone].cartSpeed * this.D.cartSpeed * (1 + 0.1 * loop);
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
    var C = CONFIG, h = this.hero;
    this.time += dt; this.stats.time = this.time;
    h.prevX = h.x; h.prevY = h.y; this.prevCamY = this.camY;
    var i, ps = this.platforms, fs = this.fireflies;
    for (i = 0; i < ps.length; i++) ps[i].prevX = ps[i].x;
    for (i = 0; i < fs.length; i++) { fs[i].prevX = fs[i].x; fs[i].prevY = fs[i].y; }

    this._stepWind(dt);
    this._stepPlatforms(dt);
    this._stepFlies(dt);
    this._stepHero(dt);
    if (this.phase === 'play') {
      this._stepCamera(dt);
      this._stepScore();
      this._generate();
      this._cleanup();
    }
  };

  // ------------------------------------------------------------------ wind: calm → warn → blow → calm
  World.prototype._windAx = function () {
    var C = CONFIG;
    return C.zones[this.zone].wind.ax * this.D.windK * (1 + 0.1 * this.loop);
  };
  World.prototype._startWarn = function (dir) {
    var W = this.wind;
    W.state = 'warn'; W.t = 0; W.dur = this.D.warnT; W.dir = dir; W.strength = 0;
    this._emit({ type: 'windWarn', dir: dir });
  };
  World.prototype._stepWind = function (dt) {
    var C = CONFIG, W = this.wind, Z = C.zones[this.zone].wind, r = this.rWind;
    W.t += dt;
    if (this.phase !== 'play') { W.strength = M.max(0, W.strength - dt * 2); return; }
    if (W.state === 'calm') {
      W.strength = 0;
      W.next -= dt;
      if (W.next <= 0) {
        var dir = W.count === 0 ? W.dir : (r.chance(C.flipChance) ? -W.dir : W.dir);
        this._startWarn(dir);
      }
    } else if (W.state === 'warn') {
      W.strength = 0;
      if (W.t >= W.dur) {
        W.state = 'blow'; W.t = 0; W.dur = r.range(Z.blow[0], Z.blow[1]); W.count++; this.stats.gusts++;
        W.ax = this._windAx();
        this._emit({ type: 'windStart', dir: W.dir });
      }
    } else {                                          // blow: ease in over 0.4 s, out over the last 0.5 s
      W.strength = M.min(smooth(W.t / C.gustInK), smooth((W.dur - W.t) / C.gustOutK));
      W.ax = this._windAx();
      if (W.t >= W.dur) {
        W.state = 'calm'; W.t = 0; W.strength = 0; W.next = r.range(Z.every[0], Z.every[1]);
        this._emit({ type: 'windEnd' });
      }
    }
  };

  // ------------------------------------------------------------------ platforms
  World.prototype._stepPlatforms = function (dt) {
    var C = CONFIG, ps = this.platforms;
    while (this._regrow.length && this._regrow[0].at <= this.time) {
      var g = this._regrow.shift();
      if (g.y < this.camY - C.removeBelow) continue;
      var np = this._mkPlat(g.kind, g.x, g.y, { w: g.w }); np.path = g.path; np.lvl = g.lvl; np.regrown = true;
      ps.push(np);
    }
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.t += dt; p.springT += dt;
      if (p.kind === 'cart' && p.om) {
        p.ph += p.om * dt; if (p.ph > TAU) p.ph -= TAU;
        p.x = p.xm + p.hr * M.sin(p.ph);
        p.vx = p.hr * p.om * M.cos(p.ph);
      }
      if (p.state === 'poof' && p.t >= C.puffT) {
        p.state = 'gone'; ps.splice(i, 1);
        this._regrow.push({ at: this.time + C.puffRegrow - C.puffT, kind: p.kind, x: p.x, y: p.y, w: p.w, path: p.path, lvl: p.lvl });
        continue;
      }
      if (p.kind === 'rescue' && ((p.bounces > 0 && p.t >= C.rescueAfter) || (p.bounces === 0 && p.t >= C.rescueLife))) {
        p.state = 'gone'; ps.splice(i, 1); continue;
      }
    }
  };
  function landable(p) { return p.state === 'live' && !(p.kind === 'rescue' && p.bounces > 0); }
  World.landable = landable;

  // ------------------------------------------------------------------ fireflies (figure-eight + wind drift)
  World.prototype._stepFlies = function (dt) {
    var C = CONFIG, fs = this.fireflies, W = this.wind, h = this.hero;
    var om = TAU / C.flyPeriod, cx = h.x, cy = h.y + C.bodyY, R2 = C.catchR * C.catchR;
    for (var i = fs.length - 1; i >= 0; i--) {
      var f = fs[i];
      f.t += dt;
      if (f.state === 'taken') { if (f.t > 0.4) { f.state = 'gone'; fs.splice(i, 1); } continue; }
      f.ph += om * dt;
      if (W.state === 'blow') f.wx += W.dir * W.strength * C.flyWind * dt;
      f.wx -= f.wx * C.flyHome * dt * (W.state === 'blow' ? 0.5 : 1.5);
      f.wx = clamp(f.wx, -2.5, 2.5);
      f.x = clamp(f.bx + f.wx + C.flyAmp * M.sin(f.ph), 0.4, C.COLW - 0.4);
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
    if (this.lantern >= C.lanternSize) {
      this.lantern = 0; this.stats.lanterns++;
      if (this.hearts < this.maxHearts) this.hearts++;
      this._emit({ type: 'lantern', hearts: this.hearts });
      this._emit({ type: 'heartGain', hearts: this.hearts });
    }
  };

  // ------------------------------------------------------------------ hero
  World.prototype._stepHero = function (dt) {
    var C = CONFIG, h = this.hero, W = this.wind;
    h.moodT += dt; h.airT += dt;
    if (h.invuln > 0) h.invuln = M.max(0, h.invuln - dt);
    if (h.squash > 0) h.squash = M.max(0, h.squash - dt / C.squashT);

    if (!h.started) {                                 // sitting in the farmyard before the first hop
      if (this.time >= C.startDelay && this.phase === 'play') { h.started = true; this._bounce(this.platforms[0], 1); }
      else return;
    }

    // --- horizontal: steering accel / drag, wind as an acceleration
    var dir = this.phase === 'play' ? this.input : 0;
    if (h.rescueT > 0) {                              // the trampoline keeps her lined up (no steering, no wind)
      h.rescueT = M.max(0, h.rescueT - dt);
      var tr = this._rescuePlat();
      var tvx = tr ? clamp((tr.x - h.x) * 4, -C.maxVx, C.maxVx) : 0;
      h.vx += (tvx - h.vx) * (1 - M.exp(-12 * dt));
    } else {
      if (dir !== 0) {
        if (h.vx * dir < C.maxVx) {
          h.vx += dir * C.accel * dt;
          if (h.vx * dir > C.maxVx && h.vx * dir - C.accel * dt <= C.maxVx) h.vx = dir * C.maxVx;
        }
      } else {
        h.vx *= M.exp(-C.drag * dt);
      }
      var cap = C.maxVx;
      if (W.state === 'blow' && W.strength > 0) {
        h.vx += W.dir * W.ax * W.strength * dt;
        cap = C.maxVx + W.ax * C.windOverK;
      }
      if (M.abs(h.vx) > cap) {                        // relax back under the cap (never snap)
        var s = h.vx > 0 ? 1 : -1;
        h.vx = s * M.max(cap, M.abs(h.vx) - C.accel * dt);
      }
    }
    if (dir) h.face = dir; else if (M.abs(h.vx) > 0.8) h.face = h.vx > 0 ? 1 : -1;
    h.x += h.vx * dt;
    if (this._wallCd > 0) this._wallCd -= dt;
    var lo = C.heroR, hi = C.COLW - C.heroR;
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

    // --- one-way landing (feet crossed the top this step while falling)
    if (h.vy <= 0 && this.phase === 'play') {
      var best = null, ps = this.platforms;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (!landable(p)) continue;
        if (y0 >= p.y && h.y <= p.y && M.abs(h.x - p.x) < p.w / 2 + C.landPad) {
          if (!best || p.y > best.y) best = p;
        }
      }
      if (best) {
        var k = best.kind === 'rescue' ? C.rescueK : (best.spring && M.abs(h.x - best.x) < C.springPad ? C.springK : 1);
        this._bounce(best, k);
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

  World.prototype._bounce = function (p, k) {
    var C = CONFIG, h = this.hero;
    var spring = k === C.springK && p.spring;
    h.y = p.y; h.vy = C.bounceV * k; h.airT = 0; h.lastPlat = p.id;
    h.squash = 1; h.stretch = 0;
    p.bounces++;
    this.stats.bounces++;
    if (spring) { p.springT = 0; this.stats.springs++; }
    if (!(h.mood === 'happy' && h.moodT < C.happyT) && !(h.mood === 'ouch' && h.moodT < C.ouchT)) this._setMood('crouch');
    this._emit({ type: 'bounce', p: p, kind: p.kind, spring: spring, x: h.x, y: p.y });
    if (p.kind === 'puff' && p.state === 'live') {
      p.state = 'poof'; p.t = 0; this.stats.puffs++;
      this._emit({ type: 'poof', p: p });
    }
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
      this.wind.state = 'calm';
      this._emit({ type: 'gameOver' });
      return;
    }
    // remove any older rescue mat, spawn a fresh one and throw Clover up through it
    for (var i = this.platforms.length - 1; i >= 0; i--) if (this.platforms[i].kind === 'rescue') this.platforms.splice(i, 1);
    var x = clamp(h.x, 1.6, C.COLW - 1.6);
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
    if (m > this._metre) { this.score += m - this._metre; this._metre = m; }
    while (this.maxY >= this._nextMeter) { this._emit({ type: 'meter', m: this._nextMeter }); this._nextMeter += C.meterEvery; }
    this.progress = clamp((this.maxY - this.levelY0) / this.goal, 0, 1);
    if (this.maxY - this.levelY0 >= this.goal) {
      this._levelUp(this.level + 1, C.levelBonus * (this.zone + 1) * (this.loop + 1));
    }
  };

  World.prototype._levelUp = function (L, bonus) {
    var C = CONFIG;
    this.level = L; this.zone = L % 4; this.loop = M.floor(L / 4);
    this.levelY0 = this.maxY; this.goal = this._goalFor(L); this.progress = 0;
    this.score += bonus; this.stats.levels++;
    if (this.hearts < this.maxHearts) { this.hearts++; this._emit({ type: 'heartGain', hearts: this.hearts }); }
    this._setMood('happy');
    var Z = C.zones[this.zone].wind;
    if (this.wind.state === 'calm') this.wind.next = M.min(this.wind.next, Z.every[1]);
    this._emit({ type: 'levelUp', level: L, zone: this.zone, bonus: bonus });
  };

  World.prototype._cleanup = function () {
    var C = CONFIG, cut = this.camY - C.removeBelow, ps = this.platforms, fs = this.fireflies, i;
    for (i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      if ((p.kind === 'ground' && this.camY > 3) || (p.kind !== 'rescue' && p.kind !== 'ground' && p.y < cut)) ps.splice(i, 1);
    }
    for (i = fs.length - 1; i >= 0; i--) if (fs[i].by < cut - 1) fs.splice(i, 1);
  };

  // ------------------------------------------------------------------ summary for tests / debug
  World.prototype.getState = function () {
    var h = this.hero, W = this.wind, counts = {}, i;
    for (i = 0; i < this.platforms.length; i++) { var k = this.platforms[i].kind; counts[k] = (counts[k] || 0) + 1; }
    var st = {}; for (var s in this.stats) st[s] = this.stats[s];
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      camY: this.camY, maxY: this.maxY, levelY0: this.levelY0, goal: this.goal, progress: this.progress,
      score: this.score, fireflies: this.fireflyCount, lantern: this.lantern, hearts: this.hearts, maxHearts: this.maxHearts,
      difficulty: this.difficulty,
      hero: { x: h.x, y: h.y, vx: h.vx, vy: h.vy, dir: h.dir, face: h.face, squash: h.squash, stretch: h.stretch,
        tilt: h.tilt, mood: h.mood, airT: h.airT, lastPlat: h.lastPlat, invuln: h.invuln, rescueT: h.rescueT },
      wind: { state: W.state, dir: W.dir, t: W.t, dur: W.dur, strength: W.strength, next: W.next, count: W.count },
      platforms: this.platforms.length, kinds: counts, flies: this.fireflies.length, stats: st
    };
  };

  FH.World = World;
})(window.FH = window.FH || {});
