/* Mossy's Egg Grove — MEG.World: the headless, deterministic drop-and-merge simulation (DESIGN §2, §5)
 *
 *   var w = new MEG.World({ seed: 1, difficulty: 'normal', level: 0 });
 *   w.moveTo(x) / w.nudge(dir)   // Mossy's target x / held arrow key (−1, 0, +1)
 *   w.drop()                     // let go of the held egg (if canDrop and the spawn point is free, else 'blocked')
 *   w.update(dt)                 // fixed 1/120 s sub-steps with an accumulator; w.alpha = leftover fraction
 *   w.drainEvents()              // [{ type: 'drop', x, kind }, …]
 *   w.predictDrop(x[, vx])       // { path:[{x,y}], landX, landY, t } — the SAME step function as live eggs
 *   w.getState()                 // plain JSON-able snapshot (the world's own fields carry the same names)
 *   test hooks: spawnEgg(kind, x, y[, opts]), setWind(dir, strength[, hold]), gotoLevel(i)
 *
 * Units: u and seconds; x grows right, y grows UP; nest floor y = 0, inner walls x = 0 and x = NEST_W.
 * Rotations (egg.rot, egg.w) use the WORLD convention (counter-clockwise positive): draw with ctx.rotate(-rot).
 * Every egg and Mossy keep p* values (saved at the start of each sub-step) so the renderer can lerp with alpha.
 *
 * Physics = position-based dynamics (PBD) per 1/120 s sub-step, which is unconditionally stable for stacks:
 *   1. integrateEgg(): gravity, wind (falling eggs only), air drag, fall-speed cap, x += v·h      ← shared with
 *      predictDrop(); the predicted egg uses the same circle overlap test vs the pile and touchesNest() to "land".
 *   2. ITERS Gauss–Seidel passes: push overlapping circle pairs apart (split by inverse mass, mass ∝ r²) and
 *      clamp to the walls / floor; the pushes are summed per contact (λ, ≈ normal impulse · h). In the same
 *      passes, position-level Coulomb friction cancels the contact points' tangential slip (spin included,
 *      solid disc I = ½ m r²) up to MU·λ (MU_S between two resting eggs) → eggs roll and spin, piles lock.
 *      Sticking contacts keep their leftover slip as an anchor for the next step (no slow creep), and FIX_ITERS
 *      final normal-only passes clean up overlap that friction re-pressed.
 *   3. v = (x − x_prev) / h (capped at VMAX; PUSH_VMAX for landed eggs in contact), w = (rot − rot_prev) / h.
 *   4. restitution only for impacts faster than REST_MIN (resting contacts never bounce); rolling
 *      resistance + contact damping let rolling eggs come to rest; a resting egg slower than REST_V carries no
 *      velocity into the next step (dead-band) → a full nest is perfectly still.
 *   5. merges (one per egg per step), hatch, combo; a merged egg grows its physics radius from 0.75·R to R
 *      over GROW_T with smoothstep, so neighbours are eased aside (no explosions).
 * Broad phase: sort-and-sweep on x (insertion sort, nearly sorted every step) → O(n) pairs.
 */
(function (MEG) {
  'use strict';
  var M = Math;

  // ---- tuning (units → why). Full table with rationale + sim results: docs/MECHANICS.md ----
  var CONFIG = {
    STEP: 1 / 120,        // s: fixed sub-step; small enough that a 16 u/s egg moves 0.13 u (< ¼ of the smallest r)
    MAX_DT: 0.25,         // s: longest update() slice accepted (a background tab must not spiral)
    NEST_W: 9,            // u: inner nest width (DESIGN §2)
    WALL_TOP: 11.2,       // u: wall height (drawn); walls are infinite planes in physics so eggs can never leave
    DANGER_Y: 9.8,        // u: vine line
    MOSSY_Y: 12.6,        // u: Mossy's body centre
    HOLD_Y: 11.3,         // u: held egg centre (drop start)
    G: 22,                // u/s²: weighty but soft eggs (a 10 u drop takes ≈ 0.95 s)
    VMAX: 16,             // u/s: fall-speed cap
    PUSH_VMAX: 6,         // u/s: top speed a landed egg in contact can get from the solver (no squeeze launches)
    AIR: 0.08,            // 1/s: tiny linear air drag (keeps wind drift bounded, barely visible)
    ITERS: 8,             // position passes per step (normal push + friction)
    FIX_ITERS: 4,         // + normal-only passes: friction corrections can re-press a wedged egg; these clean up (< 0.02 u)
    REST: 0.15,           // restitution: a small "plonk" bounce
    REST_MIN: 1.2,        // u/s: slower impacts do not bounce (resting contacts stay dead still)
    MU: 0.4,              // Coulomb (kinetic) friction egg–egg and egg–nest
    ANCHOR_MAX: 0.02,     // u: a sticking contact remembers up to this much leftover slip (bigger = a real disturbance)
    MU_S: 0.6,            // static friction between two slow eggs: a settled pile locks instead of creeping
    ROLL_MIN: 0.6,        // u/s: slower eggs with ≥ 2 supports rest instead of rolling (eggs are not balls: they sit in grooves)
    ROLL_RES: 1.6,        // 1/s: angular damping of a rolling egg in contact (rolling resistance)
    REST_SPIN: 8,         // 1/s: angular damping of a slow (resting) egg — spin dies within ~0.3 s
    SPIN_DAMP: 0.3,       // 1/s: angular damping in the air
    CONTACT_DAMP: 0.6,    // 1/s: linear damping of a rolling egg while touching
    REST_DAMP: 3,         // 1/s: linear damping of a slow egg held in a groove (settles a pile within ~1 s)
    REST_V: 0.08,         // u/s: resting-egg dead-band (≈ 0.03 px per frame: invisible) → a full nest is dead still
    MARGIN: 0.05,         // u: broad-phase margin (covers the merge gap)
    MERGE_GAP: 0.02,      // u: equal eggs closer than r1 + r2 + gap merge
    POP_VY: 2,            // u/s: gentle upward pop of a merged egg
    GROW_FROM: 0.75,      // × R: physics radius of a fresh merged egg (renderer scales 0.7 → 1)
    GROW_T: 0.3,          // s: radius growth time (≈ 1–1.5 u/s of push on the neighbours)
    HATCH_POINTS: 100,    // two Golden Dragon eggs hatch a baby dragon
    COMBO_T: 0.8,         // s: merges closer than this chain into a combo (+combo−1 bonus)
    DROP_COOLDOWN: 0.8,   // s: next egg appears in Mossy's claws (playtest: 0.55 allowed spam-dropping; 0.8 keeps a calm pace)
    DROP_VX: 0.3,         // × Mossy's vx given to a dropped egg
    MOSSY_OMEGA: 11,      // 1/s: critically damped follow (≈ 0.35 s to cross the nest)
    MOSSY_VMAX: 14,       // u/s: Mossy's top speed
    NUDGE_SPEED: 8,       // u/s: keyboard target speed
    FLAP_HZ: 2.4,         // wing cycles per second (× 1.6 in a gust)
    MOOD_DROP: 0.35, MOOD_HAPPY: 0.9,   // s: timed moods
    OVER_T: 2.5,          // s: resting above the vine this long → rescue / game over
    OVER_AGE: 1,          // s: a freshly dropped egg is ignored this long
    OVER_DECAY: 2,        // × dt: `over` decays faster than it grows (one bounce over the line is forgiven)
    WARN_ON: 0.35, WARN_OFF: 0.25,      // danger thresholds for warnOn / warnOff (hysteresis)
    RESCUE_N: 4,          // highest eggs removed by the fairy
    BUMP_MIN: 2,          // u/s: egg–egg hits faster than this emit `bump`
    BUMP_GAP: 0.12,       // s: per-egg rate limit for bumps (global: 0.04 s)
    CALM: [5, 9],         // s: calm between gusts
    FIRST_CALM: 8,        // s: the first 8 s of a game are always calm
    WARN_T: 1.5,          // s: windsock / arrow warning before every gust
    GUST: [3, 5],         // s: gust length (ease-in/out included)
    EASE_IN: 0.5, EASE_OUT: 0.6,        // s: smoothstep ramps of the gust force
    DIR_SWITCH: 0.7,      // P(next gust blows the other way)
    LOOP_WIND: 0.15,      // +15 % wind per winter loop
    HOOK_HOLD: 6,         // s: how long setWind(dir≠0) holds full force before easing out
    PREDICT_T: 3,         // s: longest predicted fall
    PATH_DT: 0.05         // s: spacing of predictDrop path points
  };

  var KINDS = [
    { kind: 1, r: 0.50, points: 1,  name: 'Dewdrop' },
    { kind: 2, r: 0.66, points: 3,  name: 'Sky' },
    { kind: 3, r: 0.84, points: 6,  name: 'Berry' },
    { kind: 4, r: 1.04, points: 10, name: 'Moon' },
    { kind: 5, r: 1.26, points: 15, name: 'Fern' },
    { kind: 6, r: 1.50, points: 21, name: 'Sunset' },
    { kind: 7, r: 1.78, points: 28, name: 'Starry' },
    { kind: 8, r: 2.10, points: 36, name: 'Golden Dragon' }
  ];

  // goals: score needed to leave season i (× goal factor); after winter +LOOP per loop
  var DIFF = {
    easy:   { pool: [45, 35, 20],         wind: 0.6,  rescues: 2, goal: 0.75 },
    normal: { pool: [35, 30, 22, 13],     wind: 1,    rescues: 1, goal: 1 },
    hard:   { pool: [30, 28, 20, 14, 8],  wind: 1.25, rescues: 0, goal: 1.2 }
  };
  var GOALS = [150, 400, 750], GOAL_LOOP = 500;

  var LEVELS = [
    { name: 'Spring Blossom Glade',  key: 'spring', wind: 2.0 },
    { name: 'Summer Mushroom Meadow', key: 'summer', wind: 3.0 },
    { name: 'Autumn Lantern Woods',  key: 'autumn', wind: 4.0 },
    { name: 'Winter Frost Hollow',   key: 'winter', wind: 5.0 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function kindR(k) { return KINDS[k - 1].r; }

  /** goal score of season `level` for difficulty factor f (rounded to 5) */
  function goalOf(level, f) {
    var g = level < GOALS.length ? GOALS[level] : GOALS[GOALS.length - 1] + GOAL_LOOP * (level - GOALS.length + 1);
    return M.round(g * f / 5) * 5;
  }

  // ---------- the shared step function (live eggs AND predictDrop) ----------
  /** free motion of one egg over h: gravity, wind (falling eggs only), drag, cap, position, spin */
  function integrateEgg(e, h, windForce) {
    var C = CONFIG;
    e.vy -= C.G * h;
    if (e.falling) e.vx += windForce * h;
    var k = 1 - C.AIR * h;
    e.vx *= k; e.vy *= k;
    if (e.vy < -C.VMAX) e.vy = -C.VMAX;
    e.x += e.vx * h; e.y += e.vy * h;
    e.rot += e.w * h;
  }
  /** does a free egg touch the nest (walls / floor)? */
  function touchesNest(e) { return e.x - e.r <= 0 || e.x + e.r >= CONFIG.NEST_W || e.y - e.r <= 0; }

  function World(opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.difficulty = DIFF[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = DIFF[this.difficulty];
    this.rng = new MEG.RNG(this.seed);
    this.poolRng = this.rng.fork('pool');
    this.windRng = this.rng.fork('wind');
    this.events = [];
    this.phase = 'play'; this.time = 0; this.acc = 0; this.alpha = 0;
    this.eggs = []; this._id = 0;
    this.score = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.maxKind = 1; this.merges = 0; this.drops = 0;
    this.stats = { drops: 0, merges: 0, maxKind: 1, hatches: 0, maxCombo: 0, rescues: 0, windDrops: 0, kinds: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    this.maxRescues = this.rescues = this.diff.rescues;
    this.danger = 0; this._warn = false;
    this.level = 0; this.zone = 0; this.loop = 0;
    this._setLevel(opts.level | 0);
    this.wind = { dir: 0, phase: 'calm', t: 0, dur: M.max(CONFIG.FIRST_CALM, this.windRng.range(CONFIG.CALM[0], CONFIG.CALM[1])),
      strength: this._windStrength(), force: 0, nextDir: 0 };
    this._lastDir = this.windRng.sign();
    this.wind.nextDir = this._pickDir();
    this.held = this._draw(); this.next = this._draw();
    this.cooldown = 0; this.canDrop = true;
    var x0 = CONFIG.NEST_W / 2;
    this.mossy = { x: x0, px: x0, vx: 0, tx: x0, mood: 'idle', moodT: 0, flap: 0 };
    this._nudge = 0; this._bumpT = 0;
    // broad-phase scratch (grown on demand, never shrunk)
    this._order = []; this._pi = new Int32Array(256); this._pj = new Int32Array(256); this._pl = new Float64Array(256);
    this._pairs = 0; this._pt = new Float64Array(256); this._pc = new Float64Array(256);
    this._emit('ready', { kind: this.held, next: this.next });
  }

  World.CONFIG = CONFIG; World.DIFF = DIFF; World.LEVELS = LEVELS; World.KINDS = KINDS; World.GOALS = GOALS; World.GOAL_LOOP = GOAL_LOOP;
  World.integrateEgg = integrateEgg; World.goalOf = goalOf;

  var P = World.prototype;

  P._emit = function (type, data) { var e = data || {}; e.type = type; this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };

  // ---------- seasons ----------
  P._setLevel = function (i) {
    this.level = M.max(0, i);
    this.zone = this.level < 4 ? this.level : 3;
    this.loop = M.max(0, this.level - 3);
    this.levelStart = this.level > 0 ? goalOf(this.level - 1, this.diff.goal) : 0;
    this.levelGoal = goalOf(this.level, this.diff.goal);
  };
  P._windStrength = function () { return LEVELS[this.zone].wind * this.diff.wind * (1 + CONFIG.LOOP_WIND * this.loop); };
  P.gotoLevel = function (i) {
    this._setLevel(i);
    if (this.score < this.levelStart) this.score = this.levelStart;
    if (this.wind.phase !== 'gust') this.wind.strength = this._windStrength();
    this._emit('levelUp', { zone: this.zone, level: this.level, loop: this.loop });
  };

  // ---------- drop pool ----------
  P._draw = function () {
    var w = this.diff.pool, top = M.min(w.length, M.max(2, this.maxKind - 1)), sum = 0, i;
    for (i = 0; i < top; i++) sum += w[i];
    var r = this.poolRng.next() * sum;
    for (i = 0; i < top; i++) { r -= w[i]; if (r < 0) return i + 1; }
    return top;
  };
  P._heldR = function () { return kindR(this.held || this.next); };

  // ---------- input ----------
  P.moveTo = function (x) { var r = this._heldR(); this.mossy.tx = clamp(+x || 0, r, CONFIG.NEST_W - r); };
  P.nudge = function (dir) { this._nudge = dir > 0 ? 1 : dir < 0 ? -1 : 0; };
  P.drop = function () {
    if (this.phase !== 'play' || !this.canDrop || !this.held) return false;
    var C = CONFIG, m = this.mossy, k = this.held, r = kindR(k);
    var x = clamp(m.x, r, C.NEST_W - r);
    // the pile reaches Mossy's claws here: refuse (the egg stays held; the vine timer keeps running)
    if (this.dropBlocked(x)) { this._emit('blocked', { x: x }); return false; }
    var e = this._newEgg(k, x, C.HOLD_Y, true);
    e.vx = m.vx * C.DROP_VX;
    this.drops++; this.stats.drops++; this.stats.kinds[k]++;
    if (this.wind.phase === 'gust') this.stats.windDrops++;
    if (k > this.maxKind) { this.maxKind = k; this.stats.maxKind = k; }
    this.held = 0; this.canDrop = false; this.cooldown = C.DROP_COOLDOWN;
    m.mood = 'drop'; m.moodT = C.MOOD_DROP;
    this._emit('drop', { x: x, kind: k });
    return true;
  };

  /** true if the held egg's spawn point (x, HOLD_Y) overlaps a landed egg */
  P.dropBlocked = function (x) {
    var C = CONFIG, r = this._heldR(), eggs = this.eggs;
    x = clamp(x, r, C.NEST_W - r);
    for (var i = 0; i < eggs.length; i++) {
      var e = eggs[i]; if (e.falling) continue;
      var dx = e.x - x, dy = e.y - C.HOLD_Y, R = e.r + r;
      if (dx * dx + dy * dy < R * R) return true;
    }
    return false;
  };
  P._newEgg = function (kind, x, y, falling) {
    var r = kindR(kind);
    var e = { id: ++this._id, kind: kind, r: r, R: r, r0: r, x: x, y: y, px: x, py: y, vx: 0, vy: 0, rot: 0, prot: 0, w: 0,
      falling: !!falling, age: 0, born: 99, over: 0,
      m: r * r, im: 1 / (r * r), vx0: 0, vy0: 0, lamL: 0, lamR: 0, lamF: 0, jtL: 0, jtR: 0, jtF: 0, ancL: 0, ancR: 0, ancF: 0, anc: null, hitN: 0, nc: 0, roll: true, touch: false, dead: false, merged: false, bumpT: 0 };
    this.eggs.push(e);
    return e;
  };
  /** test hook: an egg at rest (or opts.falling) at x, y; returns it */
  P.spawnEgg = function (kind, x, y, opts) {
    kind = clamp(kind | 0, 1, 8);
    var r = kindR(kind);
    var e = this._newEgg(kind, clamp(x, r, CONFIG.NEST_W - r), M.max(r, y), opts && opts.falling);
    if (opts && opts.vx) e.vx = opts.vx;
    if (opts && opts.vy) e.vy = opts.vy;
    if (kind > this.maxKind) { this.maxKind = kind; this.stats.maxKind = kind; }
    return e;
  };

  // ---------- wind ----------
  P._pickDir = function () {
    var d = this.windRng.chance(CONFIG.DIR_SWITCH) ? -this._lastDir : this._lastDir;
    return d || 1;
  };
  P.setWind = function (dir, strength, hold) {
    var C = CONFIG, w = this.wind;
    dir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
    if (dir) {
      w.phase = 'gust'; w.dir = dir; w.t = C.EASE_IN; w.dur = C.EASE_IN + (hold == null ? C.HOOK_HOLD : hold) + C.EASE_OUT;
      w.strength = strength == null ? this._windStrength() : +strength; w.force = dir * w.strength;
      this._lastDir = dir; w.nextDir = 0;
      this._emit('gust', { dir: dir, strength: w.strength });
    } else {
      w.phase = 'calm'; w.dir = 0; w.t = 0; w.force = 0;
      w.dur = hold == null ? this.windRng.range(C.CALM[0], C.CALM[1]) : hold;
      w.nextDir = this._pickDir();
      this._emit('calm', {});
    }
  };
  P._stepWind = function (h) {
    var C = CONFIG, w = this.wind;
    w.t += h;
    if (this.phase !== 'play') { w.force = 0; w.dir = 0; return; }
    if (w.phase === 'calm') {
      if (w.t >= w.dur) {
        w.phase = 'warn'; w.t = 0; w.dur = C.WARN_T;
        if (!w.nextDir) w.nextDir = this._pickDir();
        this._emit('windWarn', { dir: w.nextDir });
      }
    } else if (w.phase === 'warn') {
      if (w.t >= w.dur) {
        w.phase = 'gust'; w.t = 0; w.dir = w.nextDir; w.nextDir = 0; this._lastDir = w.dir;
        w.dur = this.windRng.range(C.GUST[0], C.GUST[1]);
        w.strength = this._windStrength();
        this._emit('gust', { dir: w.dir, strength: w.strength });
      }
    } else if (w.t >= w.dur) {
      w.phase = 'calm'; w.t = 0; w.dir = 0; w.force = 0;
      w.dur = this.windRng.range(C.CALM[0], C.CALM[1]);
      w.nextDir = this._pickDir();
      this._emit('calm', {});
    }
    w.force = w.phase === 'gust' ? w.dir * w.strength * smooth(w.t / C.EASE_IN) * smooth((w.dur - w.t) / C.EASE_OUT) : 0;
  };

  // ---------- Mossy ----------
  P._stepMossy = function (h) {
    var C = CONFIG, m = this.mossy, r = this._heldR();
    if (this._nudge) m.tx += this._nudge * C.NUDGE_SPEED * h;
    m.tx = clamp(m.tx, r, C.NEST_W - r);
    m.px = m.x;
    var om = C.MOSSY_OMEGA, a = om * om * (m.tx - m.x) - 2 * om * m.vx;
    m.vx = clamp(m.vx + a * h, -C.MOSSY_VMAX, C.MOSSY_VMAX);
    m.x = clamp(m.x + m.vx * h, r, C.NEST_W - r);
    m.flap = (m.flap + h * C.FLAP_HZ * (this.wind.phase === 'gust' ? 1.6 : 1)) % 1;
    if (m.moodT > 0) { m.moodT -= h; if (m.moodT <= 0) m.moodT = 0; }
    if (m.moodT <= 0) m.mood = this.danger > C.WARN_ON || this.phase === 'over' ? 'worry' : 'idle';
    if (this.cooldown > 0) {
      this.cooldown -= h;
      if (this.cooldown <= 0) {
        this.cooldown = 0;
        if (this.phase === 'play') {
          this.held = this.next; this.next = this._draw(); this.canDrop = true;
          this._emit('ready', { kind: this.held, next: this.next });
        }
      }
    }
  };

  // ---------- physics ----------
  P._addPair = function (i, j) {
    var n = this._pairs;
    if (n >= this._pi.length) {
      var L = this._pi.length * 2, a = new Int32Array(L), b = new Int32Array(L);
      a.set(this._pi); b.set(this._pj); this._pi = a; this._pj = b; this._pl = new Float64Array(L);
    }
    this._pi[n] = i; this._pj[n] = j; this._pl[n] = 0; this._pairs = n + 1;
  };
  P._broadPhase = function () {
    var eggs = this.eggs, n = eggs.length, ord = this._order, i, j, k;
    // keep the previous order (nearly sorted): drop stale indices, append new ones, insertion-sort by left edge
    if (ord.length !== n) { ord.length = 0; for (i = 0; i < n; i++) ord.push(i); }
    for (i = 1; i < n; i++) {
      var v = ord[i], key = eggs[v].x - eggs[v].r; j = i - 1;
      while (j >= 0 && eggs[ord[j]].x - eggs[ord[j]].r > key) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = v;
    }
    this._pairs = 0;
    var mg = CONFIG.MARGIN;
    for (i = 0; i < n; i++) {
      var a = eggs[ord[i]], right = a.x + a.r + mg;
      for (k = i + 1; k < n; k++) {
        var b = eggs[ord[k]];
        if (b.x - b.r > right) break;
        if (M.abs(b.y - a.y) < a.r + b.r + mg) { if (ord[i] < ord[k]) this._addPair(ord[i], ord[k]); else this._addPair(ord[k], ord[i]); }
      }
    }
  };

  /** position-level Coulomb friction for one contact (b = null → the nest), inside the PBD iterations.
   *  Cancels the relative tangential slip of the two contact points accumulated over this step (spin included),
   *  with the accumulated tangential correction clamped to μ·(accumulated normal correction): static friction
   *  holds a slow egg exactly, sliding eggs lose μ of their normal push. A rolling egg (fast, or resting on a
   *  single support) takes part of the correction as spin (solid disc, I = ½ m r² → 2·im per unit r²);
   *  a slow egg in a groove does not spin (eggs are not perfect balls). Returns the new accumulated value.
   *  `carry` = the slip this contact had left over at the end of the previous step while it was sticking (the
   *  contact's anchor): Gauss–Seidel never fully converges in a deep pile, and without the anchor those tiny
   *  leftovers would add up to a slow creep; with it the next step pulls the contact back → no drift. */
  function slipOf(a, b, tx, ty) {
    return ((b ? b.x - b.px : 0) - (a.x - a.px)) * tx + ((b ? b.y - b.py : 0) - (a.y - a.py)) * ty -
      ((b ? (b.rot - b.prot) * b.r : 0) + (a.rot - a.prot) * a.r);
  }
  function frictionContact(a, b, nx, ny, lam, acc, carry) {
    var C = CONFIG, ima = a.im, imb = b ? b.im : 0;
    var tx = -ny, ty = nx;
    var slip = slipOf(a, b, tx, ty) + carry;
    var ra = a.roll ? 2 * ima : 0, rb = b && b.roll ? 2 * imb : 0;
    var mu = a.roll || (b && b.roll) ? C.MU : C.MU_S, mx = mu * lam;
    var tot = acc - slip / (ima + imb + ra + rb);
    if (tot > mx) tot = mx; else if (tot < -mx) tot = -mx;
    var jt = tot - acc;
    a.x -= tx * jt * ima; a.y -= ty * jt * ima; if (a.roll) a.rot -= 2 * jt * ima / a.r;
    if (b) { b.x += tx * jt * imb; b.y += ty * jt * imb; if (b.roll) b.rot -= 2 * jt * imb / b.r; }
    return tot;
  }
  /** restitution for an impact faster than REST_MIN (resting contacts never bounce); returns the approach speed */
  function bounce(a, b, nx, ny) {
    var C = CONFIG, ima = a.im, imb = b ? b.im : 0;
    var vnPre = ((b ? b.vx0 : 0) - a.vx0) * nx + ((b ? b.vy0 : 0) - a.vy0) * ny;
    if (vnPre < -C.REST_MIN) {
      var vn = ((b ? b.vx : 0) - a.vx) * nx + ((b ? b.vy : 0) - a.vy) * ny, dv = -C.REST * vnPre - vn;
      if (dv > 0) {
        var j = dv / (ima + imb);
        a.vx -= nx * j * ima; a.vy -= ny * j * ima;
        if (b) { b.vx += nx * j * imb; b.vy += ny * j * imb; }
      }
    }
    return -vnPre;
  }

  P._stepEggs = function (h) {
    var C = CONFIG, eggs = this.eggs, n = eggs.length, i, k, e, W = C.NEST_W, R2 = C.ROLL_MIN * C.ROLL_MIN;
    var force = this.phase === 'play' ? this.wind.force : 0;
    for (i = 0; i < n; i++) {
      e = eggs[i];
      e.px = e.x; e.py = e.y; e.prot = e.rot; e.vx0 = e.vx; e.vy0 = e.vy;
      e.age += h;
      if (e.born < 99) {
        e.born += h;
        e.r = e.r0 + (e.R - e.r0) * smooth(e.born / C.GROW_T);
        e.m = e.r * e.r; e.im = 1 / e.m;
      }
      // fast eggs roll; slow ones rest — unless they sat on a single support last step (an egg perched on one
      // round egg must roll off; two or more supports form a groove that holds it)
      e.roll = e.nc < 2 || e.vx * e.vx + e.vy * e.vy > R2 || e.w * e.r * e.w * e.r > R2;
      e.lamL = e.lamR = e.lamF = 0; e.jtL = e.jtR = e.jtF = 0; e.touch = false; e.nc = 0;
      integrateEgg(e, h, force);
    }
    this._broadPhase();
    var np = this._pairs, PI = this._pi, PJ = this._pj, PL = this._pl, PT = this._pt, PC = this._pc, it;
    if (PT.length < PI.length) { PT = this._pt = new Float64Array(PI.length); PC = this._pc = new Float64Array(PI.length); }
    for (k = 0; k < np; k++) { PT[k] = 0; var ca = eggs[PI[k]].anc; PC[k] = (ca && ca[eggs[PJ[k]].id]) || 0; }
    for (it = 0; it < C.ITERS + C.FIX_ITERS; it++) {
      var fr = it < C.ITERS;                         // the last FIX_ITERS passes only remove overlap
      for (k = 0; k < np; k++) {
        var a = eggs[PI[k]], b = eggs[PJ[k]];
        var dx = b.x - a.x, dy = b.y - a.y, R = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= R * R) { if (fr && PL[k] > 0 && d2 < (R + 0.002) * (R + 0.002)) PT[k] = frictionContact(a, b, dx / M.sqrt(d2), dy / M.sqrt(d2), PL[k], PT[k], PC[k]); continue; }
        var d = M.sqrt(d2), nx, ny;
        if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { nx = 0; ny = 1; d = 0; }
        var s = (R - d) / (a.im + b.im);
        a.x -= nx * s * a.im; a.y -= ny * s * a.im;
        b.x += nx * s * b.im; b.y += ny * s * b.im;
        if (PL[k] === 0) { a.nc++; b.nc++; }
        PL[k] += s;
        if (fr) PT[k] = frictionContact(a, b, nx, ny, PL[k], PT[k], PC[k]);
      }
      for (i = 0; i < n; i++) {
        e = eggs[i];
        if (e.y < e.r) { if (!e.lamF) e.nc++; e.lamF += (e.r - e.y) * e.m; e.y = e.r; }
        if (fr && e.lamF > 0) e.jtF = frictionContact(e, null, 0, -1, e.lamF, e.jtF, e.ancF);
        if (e.x < e.r) { if (!e.lamL) e.nc++; e.lamL += (e.r - e.x) * e.m; e.x = e.r; }
        else if (e.x > W - e.r) { if (!e.lamR) e.nc++; e.lamR += (e.x - W + e.r) * e.m; e.x = W - e.r; }
        if (fr && e.lamL > 0) e.jtL = frictionContact(e, null, -1, 0, e.lamL, e.jtL, e.ancL);
        if (fr && e.lamR > 0) e.jtR = frictionContact(e, null, 1, 0, e.lamR, e.jtR, e.ancR);
        // friction never pushes an egg through the nest
        if (e.y < e.r) e.y = e.r;
        if (e.x < e.r) e.x = e.r; else if (e.x > W - e.r) e.x = W - e.r;
      }
    }
    // contact anchors for the next step: the leftover slip of every sticking contact (sliding ones restart)
    for (i = 0; i < n; i++) {
      e = eggs[i]; e.anc = null;
      e.ancF = this._anchor(e, null, 0, -1, e.lamF, e.jtF, e.ancF);
      e.ancL = this._anchor(e, null, -1, 0, e.lamL, e.jtL, e.ancL);
      e.ancR = this._anchor(e, null, 1, 0, e.lamR, e.jtR, e.ancR);
    }
    for (k = 0; k < np; k++) {
      if (PL[k] <= 0) continue;
      var a1 = eggs[PI[k]], b1 = eggs[PJ[k]], ux = b1.x - a1.x, uy = b1.y - a1.y, ud = M.sqrt(ux * ux + uy * uy) || 1;
      var an = this._anchor(a1, b1, ux / ud, uy / ud, PL[k], PT[k], PC[k]);
      if (an) { if (!a1.anc) a1.anc = {}; a1.anc[b1.id] = an; }
    }
    // velocities (linear and spin) from the solved positions
    for (i = 0; i < n; i++) {
      e = eggs[i];
      e.vx = (e.x - e.px) / h; e.vy = (e.y - e.py) / h; e.w = (e.rot - e.prot) / h;
      // contact pushes never fling a landed egg faster than PUSH_VMAX (a small egg pinched in a wedge by a
      // growing merged egg would otherwise shoot out like a squeezed seed); free flight keeps VMAX
      var sp = e.vx * e.vx + e.vy * e.vy, cap = !e.falling && (e.nc > 0) ? C.PUSH_VMAX : C.VMAX;
      if (sp > cap * cap) { sp = cap / M.sqrt(sp); e.vx *= sp; e.vy *= sp; }
      e.hitN = 0;
    }
    // bounces + events: first contact (land) and egg–egg knocks (bump)
    this._bumpT -= h;
    for (k = 0; k < np; k++) {
      if (PL[k] <= 0) continue;
      var A = eggs[PI[k]], B = eggs[PJ[k]];
      var ex = B.x - A.x, ey = B.y - A.y, dd = M.sqrt(ex * ex + ey * ey) || 1;
      var hit = bounce(A, B, ex / dd, ey / dd);
      A.touch = B.touch = true;
      if (A.falling || B.falling) { if (A.falling) this._land(A, hit); if (B.falling) this._land(B, hit); }
      else if (hit > C.BUMP_MIN && this._bumpT <= 0 && A.bumpT <= 0 && B.bumpT <= 0) {
        this._bumpT = 0.04; A.bumpT = B.bumpT = C.BUMP_GAP;
        this._emit('bump', { x: (A.x * B.r + B.x * A.r) / (A.r + B.r), y: (A.y * B.r + B.y * A.r) / (A.r + B.r), speed: hit });
      }
    }
    for (i = 0; i < n; i++) {
      e = eggs[i];
      if (e.lamF > 0) e.hitN = M.max(e.hitN, bounce(e, null, 0, -1));
      if (e.lamL > 0) e.hitN = M.max(e.hitN, bounce(e, null, -1, 0));
      if (e.lamR > 0) e.hitN = M.max(e.hitN, bounce(e, null, 1, 0));
      if (e.lamF > 0 || e.lamL > 0 || e.lamR > 0) { e.touch = true; if (e.falling) this._land(e, e.hitN); }
      if (e.bumpT > 0) e.bumpT -= h;
      if (e.touch) {
        var cd = 1 - (e.roll ? C.CONTACT_DAMP : C.REST_DAMP) * h;
        e.vx *= cd; e.vy *= cd; e.w *= 1 - (e.roll ? C.ROLL_RES : C.REST_SPIN) * h;
        // rest dead-band: a resting egg carries no sub-REST_V velocity into the next step (kills the period-2
        // stick/slip limit cycle of a wedged egg; positions are still solved every step, so this is not sleeping)
        if (!e.roll && e.vx * e.vx + e.vy * e.vy < C.REST_V * C.REST_V) { e.vx = 0; e.vy = 0; e.w = 0; }
      } else e.w *= 1 - C.SPIN_DAMP * h;
    }
  };
  /** leftover slip of a contact that is sticking (friction below its limit), else 0 */
  P._anchor = function (a, b, nx, ny, lam, acc, carry) {
    if (!(lam > 0)) return 0;
    var mu = a.roll || (b && b.roll) ? CONFIG.MU : CONFIG.MU_S;
    if (M.abs(acc) >= mu * lam * 0.999) return 0;
    var r = slipOf(a, b, -ny, nx) + carry;
    return M.abs(r) < CONFIG.ANCHOR_MAX ? r : 0;
  };
  P._land = function (e, hit) {
    if (!e.falling) return;
    e.falling = false;
    this._emit('land', { id: e.id, x: e.x, y: e.y, kind: e.kind, speed: M.max(hit, M.sqrt(e.vx0 * e.vx0 + e.vy0 * e.vy0)) });
  };

  // ---------- merges, hatch, combo ----------
  P._stepMerges = function () {
    if (this.phase !== 'play') return;
    var C = CONFIG, eggs = this.eggs, np = this._pairs, PI = this._pi, PJ = this._pj, k, any = false, born = [];
    for (k = 0; k < np; k++) {
      var a = eggs[PI[k]], b = eggs[PJ[k]];
      if (a.kind !== b.kind || a.merged || b.merged) continue;
      var dx = b.x - a.x, dy = b.y - a.y, R = a.r + b.r + C.MERGE_GAP;
      if (dx * dx + dy * dy >= R * R) continue;
      a.merged = b.merged = a.dead = b.dead = true; any = true;
      if (a.falling) this._land(a, 0);              // a drop that merges on first touch still "lands"
      if (b.falling) this._land(b, 0);
      var mx = (a.x * a.m + b.x * b.m) / (a.m + b.m), my = (a.y * a.m + b.y * b.m) / (a.m + b.m);
      var pts, combo = this._comboStep();
      if (a.kind === 8) {
        pts = C.HATCH_POINTS + combo - 1;
        this.score += pts; this.stats.hatches++;
        this._emit('hatch', { x: mx, y: my, points: pts });
      } else {
        var nk = a.kind + 1, NR = kindR(nk);
        pts = KINDS[nk - 1].points + combo - 1;
        this.score += pts; this.merges++; this.stats.merges++; this.stats.kinds[nk]++;
        var e = { kind: nk, x: clamp(mx, NR, C.NEST_W - NR), y: M.max(NR * C.GROW_FROM, my),
          vx: (a.vx * a.m + b.vx * b.m) / (a.m + b.m), vy: (a.vy * a.m + b.vy * b.m) / (a.m + b.m) + C.POP_VY,
          w: (a.w + b.w) / 2, rot: (a.rot + b.rot) / 2 };
        born.push(e);
        if (nk > this.maxKind) { this.maxKind = nk; this.stats.maxKind = nk; this._emit('newKind', { kind: nk }); }
        e.points = pts; e.combo = combo;
      }
      this.mossy.mood = 'happy'; this.mossy.moodT = C.MOOD_HAPPY;
    }
    if (!any) return;
    this.eggs = eggs.filter(function (e) { return !e.dead; });
    for (k = 0; k < born.length; k++) {
      var s = born[k], ne = this._newEgg(s.kind, s.x, s.y, false);
      ne.vx = s.vx; ne.vy = s.vy; ne.w = s.w; ne.rot = ne.prot = s.rot; ne.age = 0; ne.born = 0;
      ne.r0 = ne.R * C.GROW_FROM; ne.r = ne.r0; ne.m = ne.r * ne.r; ne.im = 1 / ne.m;
      this._emit('merge', { x: ne.x, y: ne.y, kind: ne.kind, points: s.points, combo: s.combo, id: ne.id });
    }
  };
  P._comboStep = function () {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = CONFIG.COMBO_T;
    if (this.combo > this.bestCombo) { this.bestCombo = this.combo; this.stats.maxCombo = this.combo; }
    if (this.combo >= 2) this._emit('combo', { n: this.combo });
    return this.combo;
  };

  // ---------- danger / rescue / game over ----------
  P._stepDanger = function (h) {
    if (this.phase !== 'play') return;
    var C = CONFIG, eggs = this.eggs, i, e, mx = 0, trip = false;
    for (i = 0; i < eggs.length; i++) {
      e = eggs[i];
      if (!e.falling && e.age > C.OVER_AGE && e.y + e.r > C.DANGER_Y) e.over += h;
      else if (e.over > 0) e.over = M.max(0, e.over - C.OVER_DECAY * h);
      if (e.over > mx) mx = e.over;
      if (e.over >= C.OVER_T) trip = true;
    }
    this.danger = M.min(1, mx / C.OVER_T);
    if (!this._warn && this.danger > C.WARN_ON) { this._warn = true; this._emit('warnOn', {}); }
    else if (this._warn && this.danger < C.WARN_OFF) { this._warn = false; this._emit('warnOff', {}); }
    if (!trip) return;
    if (this.rescues > 0) {
      this.rescues--; this.stats.rescues++;
      var sorted = eggs.slice().sort(function (a, b) { return (b.y + b.r) - (a.y + a.r) || a.id - b.id; });
      var gone = sorted.slice(0, C.RESCUE_N), ids = [], sx = 0, sy = 0;
      for (i = 0; i < gone.length; i++) { gone[i].dead = true; ids.push(gone[i].id); sx += gone[i].x; sy += gone[i].y; }
      this.eggs = eggs.filter(function (e) { return !e.dead; });
      for (i = 0; i < this.eggs.length; i++) this.eggs[i].over = 0;
      this.danger = 0;
      this._emit('rescue', { ids: ids, x: sx / gone.length, y: sy / gone.length });
    } else {
      this.phase = 'over'; this.canDrop = false;
      this._emit('gameOver', { score: this.score });
    }
    if (this._warn) { this._warn = false; this._emit('warnOff', {}); }
  };

  P._stepLevel = function () {
    if (this.phase !== 'play') return;
    while (this.score >= this.levelGoal) {
      this._setLevel(this.level + 1);
      this.mossy.mood = 'happy'; this.mossy.moodT = CONFIG.MOOD_HAPPY;
      this._emit('levelUp', { zone: this.zone, level: this.level, loop: this.loop });
    }
  };

  // ---------- main loop ----------
  P.step = function (h) {
    h = h || CONFIG.STEP;
    this.time += h;
    if (this.comboT > 0) { this.comboT -= h; if (this.comboT < 0) this.comboT = 0; }
    this._stepWind(h);
    this._stepMossy(h);
    this._stepEggs(h);
    for (var i = 0; i < this.eggs.length; i++) this.eggs[i].merged = false;
    this._stepMerges();
    this._stepDanger(h);
    this._stepLevel();
  };
  P.update = function (dt) {
    var S = CONFIG.STEP;
    this.acc += M.min(M.max(dt || 0, 0), CONFIG.MAX_DT);
    while (this.acc >= S - 1e-12) { this.step(S); this.acc -= S; }
    if (this.acc < 0) this.acc = 0;
    this.alpha = this.acc / S;
  };

  // ---------- prediction (bot + drop guide) ----------
  /** where the held egg lands if dropped at x NOW (current wind held constant; the pile is static) */
  P.predictDrop = function (x, vx) {
    var C = CONFIG, k = this.held || this.next, r = kindR(k), h = C.STEP;
    if (x == null) { x = this.mossy.x; if (vx == null) vx = this.mossy.vx * C.DROP_VX; }
    x = clamp(x, r, C.NEST_W - r);
    var e = { x: x, y: C.HOLD_Y, vx: vx || 0, vy: 0, w: 0, rot: 0, r: r, falling: true };
    var force = this.phase === 'play' ? this.wind.force : 0;
    var path = [{ x: e.x, y: e.y }], every = M.max(1, M.round(C.PATH_DT / h)), eggs = this.eggs, n = eggs.length, t = 0, steps = 0;
    var maxSteps = M.ceil(C.PREDICT_T / h), hit = null;
    while (steps < maxSteps) {
      integrateEgg(e, h, force);
      steps++; t += h;
      if (touchesNest(e)) hit = 'nest';
      else for (var i = 0; i < n; i++) {
        var o = eggs[i], dx = o.x - e.x, dy = o.y - e.y, R = o.r + e.r;
        if (dx * dx + dy * dy < R * R) { hit = o; break; }
      }
      if (hit) break;
      if (steps % every === 0) path.push({ x: e.x, y: e.y });
    }
    // report the resting contact point: back the egg out of the overlap along its last motion
    if (hit) {
      var lx = e.x, ly = e.y;
      if (hit === 'nest') { lx = clamp(lx, r, C.NEST_W - r); ly = M.max(ly, r); }
      else {
        var ox = lx - hit.x, oy = ly - hit.y, od = M.sqrt(ox * ox + oy * oy) || 1, RR = hit.r + r;
        lx = hit.x + ox / od * RR; ly = hit.y + oy / od * RR;
      }
      e.x = lx; e.y = ly;
    }
    path.push({ x: e.x, y: e.y });
    return { path: path, landX: e.x, landY: e.y, t: t, kind: k, r: r, onId: hit && hit !== 'nest' ? hit.id : 0, onKind: hit && hit !== 'nest' ? hit.kind : 0 };
  };

  // ---------- snapshot ----------
  P.getState = function () {
    var m = this.mossy, w = this.wind;
    return {
      phase: this.phase, time: this.time, alpha: this.alpha,
      mossy: { x: m.x, px: m.px, vx: m.vx, tx: m.tx, mood: m.mood, moodT: m.moodT, flap: m.flap },
      held: this.held, next: this.next, canDrop: this.canDrop, cooldown: this.cooldown,
      eggs: this.eggs.map(function (e) {
        return { id: e.id, kind: e.kind, r: e.r, x: e.x, y: e.y, px: e.px, py: e.py, vx: e.vx, vy: e.vy, rot: e.rot, prot: e.prot,
          w: e.w, falling: e.falling, age: e.age, born: e.born, over: e.over };
      }),
      wind: { dir: w.dir, phase: w.phase, t: w.t, dur: w.dur, strength: w.strength, force: w.force, nextDir: w.nextDir },
      danger: this.danger, rescues: this.rescues, maxRescues: this.maxRescues,
      score: this.score, level: this.level, zone: this.zone, loop: this.loop, difficulty: this.difficulty,
      combo: this.combo, comboT: this.comboT, bestCombo: this.bestCombo, maxKind: this.maxKind, merges: this.merges, drops: this.drops,
      stats: JSON.parse(JSON.stringify(this.stats)),
      levelGoal: this.levelGoal, levelStart: this.levelStart
    };
  };

  MEG.World = World;
})(window.MEG = window.MEG || {});
