/* Mochi's Fairy Bounce — MFB.World: the headless, deterministic brick-breaker simulation (DESIGN §5)
 *
 *   var w = new MFB.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.setPaddleTarget(x);   // pointer: absolute target x (u); the paddle eases to it (critically damped)
 *   w.movePaddle(dir);      // keys: -1 / 0 / +1 held; ±1 clears the pointer target (0 only releases the keys)
 *   w.serve();              // launch the ball from the cap while phase === 'serve' (auto-serve after AUTO_SERVE s)
 *   w.update(dt);           // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction for render lerp
 *   w.drainEvents();        // [{type:'brick', ...}, ...]
 *
 * Units: u and seconds; x grows right, y grows UP; the ground (Mochi's feet) is y = 0, field x 0…16,
 * ceiling y 8.6, the cap's bounce line y 1.35. No pixels in here. Rotations are radians (world convention,
 * counter-clockwise positive): draw with ctx.rotate(-rot) on a y-down canvas.
 * Everything that moves keeps p* values (saved at the start of each sub-step) so the renderer can lerp with alpha.
 *
 * Collision: the ball moves in micro-steps of ≤ 0.1 u inside every 1/120 s sub-step (2 micro-steps at 16 u/s).
 * The ball (r 0.22) vs. a block (1.4 × 0.5) is circle vs. box: closest point on the box (= the Minkowski
 * "rounded box"); reflect on the axis of least penetration that the ball is moving into, push out by the
 * penetration; every overlapping block that the ball moves into is hit (a corner can break two), but only one
 * reflection happens per micro-step. The thinnest thing to cross is 2·(0.25 + 0.22) = 0.94 u, ≫ 0.1 u: no tunnelling.
 *
 * CONFIG (units → why) is listed next to each key below; DIFF holds the per-difficulty overrides.
 */
(function (MFB) {
  'use strict';
  var M = Math, DEG = M.PI / 180;

  var CONFIG = {
    STEP: 1 / 120,          // s — fixed sub-step: at 16 u/s the ball moves 0.13 u per step (split into ≤ 0.1 u micro-steps)
    MICRO: 0.1,             // u — max ball travel per micro-step (≪ 0.94 u, the thinnest block + ball): no tunnelling
    FIELD_W: 16,            // u — walls at x = 0 and x = 16 (DESIGN §2)
    CEIL: 8.6,              // u — ceiling (above Hoot)
    PADDLE_Y: 1.35,         // u — the cap's bounce line (top surface), Mochi's feet at y 0
    LOST_Y: -0.3,           // u — ball centre below this = lost
    NET_Y: 0.3,             // u — the fairy vine catches the ball centre here (well below the cap: it reads as a rescue)
    BALL_R: 0.22,           // u — ball hit radius (art 0.6 u incl. glow; solid core ≈ 0.43 u)
    MAX_ANGLE: 60,          // ° — the edge of the cap sends the ball 60° from vertical
    MIN_VY_K: 0.38,         // × speed — |vy| never below this: the ball never crawls sideways (≈ 68° max from vertical)
    NUDGE_K: 1.2,           // °/(u/s) — a moving cap tilts the bounce a little (20 u/s → 24°, clamped below)
    NUDGE_MAX: 12,          // ° — max paddle-velocity tilt, so a swipe helps but never overrides the hit point
    SERVE_ANGLE: [8, 22],   // ° — serve leaves 8–22° from vertical (random side), never dead straight
    SERVE_NUDGE: 0.08,      // × paddle vx (u/s) — a moving serve inherits a little sideways speed (clamped ±1 u/s)
    AUTO_SERVE: 3,          // s — serve by itself so a waiting child is never stuck
    PADDLE_SPEED: 20,       // u/s — max cap speed: crosses the field in < 1 s, still readable
    PADDLE_OMEGA: 18,       // 1/s — critically damped spring to the pointer: ≈ 0.25 s to settle, no overshoot
    KEY_RESP: 22,           // 1/s — keys: velocity reaches the held speed in ≈ 0.1 s (and stops as quickly)
    SLEEPY_SPEED_K: 0.4,    // × — sleepy Mochi moves at 40 % (and eases slower)
    SPEED_SEASON: 0.04,     // × — +4 % ball speed per season of the year
    SPEED_ROUND: 0.06,      // × — +6 % per round (year) …
    LOOP_CAP: 3,            //      … up to round 4, then it stays (always playable)
    SPEED_HITS: 8,          // cap hits — +1 % every 8 cap hits …
    SPEED_HIT_STEP: 0.01,   // × — … the step …
    SPEED_HIT_CAP: 0.15,    // × — … capped at +15 % per life (losing the ball resets the ramp)
    SPEED_MAX: 16,          // u/s — absolute cap (the collision is proven safe up to here)
    COLS: 10, BRICK_W: 1.4, BRICK_H: 0.5, GAP_X: 0.08, GAP_Y: 0.1, // u — 10 × 1.4 u blocks centred on x = 8 (0.64…15.36)
    TOP_Y: 7.2,             // u — top block row centre; rows go down by 0.6 u (6th row centre 4.2)
    HIT_COOLDOWN: 0.05,     // s — a block can't be damaged twice by one contact
    STAR_FALL: 2.4,         // u/s — falling star terminal speed (≈ 2.5 s from the blocks: easy to catch)
    STAR_POP: 1.4,          // u/s — a star pops up a little out of its block before it falls
    STAR_RELAX: 2.2,        // 1/s — how fast the star's vy relaxes to −STAR_FALL (soft float, not a drop)
    STAR_SWAY: [0.35, 0.7], // u/s amplitude — gentle side-to-side sway …
    STAR_SWAY_W: [1.8, 2.8],// rad/s — … with a ≈ 2.5–3.5 s period
    STAR_SPIN: [1.2, 2.6],  // rad/s — stars turn slowly as they fall
    CATCH_PAD: 0.25,        // u — stars are caught in the box x ±(w/2 + 0.25), y 0 … CATCH_TOP
    CATCH_TOP: 1.7,         // u — top of Mochi + cap catch box
    STARS_PER_HEART: 10,    // stars — +1 heart every 10 stars caught
    HEARTS: 3, MAX_HEARTS: 5,
    BOSS_Y: 8.0,            // u — Hoot floats between the blocks and the ceiling
    BOSS_BOB: 0.15,         // u — ± bob amplitude …
    BOSS_BOB_T: 2.2,        // s — … and period
    BOSS_X: [2, 14],        // u — drift band
    BOSS_R: 0.55,           // u — Hoot's hit circle
    BOSS_FLAP_HZ: 2.2,      // 1/s — wing beats while floating (×2.5 while throwing / giggling)
    GIGGLE_T: 1.2,          // s — 'giggle' pose after a ball hit
    THROW_T: 0.6,           // s — 'throw' pose
    BOSS_PUSH: 2.2,         // u/s — a ball hit shoves Hoot sideways (a spring brings him back)
    BOSS_SPRING: 5,         // 1/s — push spring ω (critically damped: ≈ 0.5 s back to his path)
    TICKLE_HITS: 3,         // hits per season → tickled
    PILLOW_R: 0.3,          // u — pillow hit circle (art 0.75 × 0.56)
    PILLOW_G: 3,            // u/s² — soft gravity …
    PILLOW_TERM: 3.2,       // u/s — … with linear air drag k = G/TERM ≈ 0.94 /s → terminal 3.2 u/s (≈ 3 s fall)
    PILLOW_TOSS: 0.9,       // u/s — Hoot tosses the pillow up a little first (a visible arc)
    PILLOW_MISS: [0.5, 1.5],// u — aimed this far beside Mochi (random side): never perfectly at him
    PILLOW_SWAY: 0.3,       // u/s — sideways sway amplitude (part of the shadow prediction)
    PILLOW_SWAY_W: 2.4,     // rad/s
    PILLOW_SPIN: [1.5, 3.5],// rad/s — tumble (± random), with a wobble
    PILLOW_GROUND: 0.28,    // u — pillow centre at this height = it landed
    PILLOW_HIT_TOP: 1.6,    // u — Mochi + cap hit box top (box x ±w/2, y 0 … 1.6)
    ANTI_STALL: 5,          // s — no block hit for 5 s → cap bounces steer toward the nearest block (playtest: 12 s let stalls run to 28 s)
    CLEAR_T: 2.0,           // s — the 'clear' celebration
    OOPS_T: 1.0, CHEER_T: 0.8, CLEAR_CHEER_T: 2.0, // s — Mochi face timers
    FACE_MOVE_V: 1.5,       // u/s — faster than this shows the left/right frame
    PTS: { brick: 10, combo: 5, star: 50, boss: 30, tickle: 100, clear: 100, clearHeart: 20, pillow: 10 },
    COMBO_FROM: 3,          // the 3rd block before the ball comes back to the cap starts the +5 bonus
    DIFF: {
      easy:   { paddleW: 3.6, ballSpeed: 5.4, netSaves: 8, pillowEvery: 35, sleepyTime: 1.6, budStar: 0.15 },   // playtest: a 5-year-old model clears spring 0 % → 73 %
      normal: { paddleW: 2.5, ballSpeed: 7.6, netSaves: 1, pillowEvery: 30, sleepyTime: 2.0, budStar: 0.10 },
      hard:   { paddleW: 2.1, ballSpeed: 9.0, netSaves: 0, pillowEvery: 25, sleepyTime: 2.4, budStar: 0.08 }
    },
    ZONES: ['spring', 'summer', 'autumn', 'winter'],
    TOUGH_LOOP: 0.15        // chance per loop (max 0.45) that a bud becomes tough on round ≥ 2
  };

  // 'b' bud (1 hit), 't' tough (2 hits), 's' star block (1 hit, always drops a star), '.' empty
  var LAYOUTS = [
    [ // Spring Meadow — a big flower with a stem
      '..b.bb.b..',
      '.bbbbbbbb.',
      '.bbtsstbb.',
      '.bbbbbbbb.',
      '..s.bb.s..',
      '....bb....'
    ],
    [ // Summer Glade — the sun with its rays
      'b...bb...b',
      '..bbbbbb..',
      '.bbsbbsbb.',
      'bbbbttbbbb',
      '.bbbbbbbb.',
      '..s.bb.s..'
    ],
    [ // Autumn Hollow — a big acorn (stem, cap, nut)
      '....ss....',
      '..bttttb..',
      '.bbbbbbbb.',
      '.bbsbbsbb.',
      '..bbbbbb..',
      '...bbbb...'
    ],
    [ // Winter Glow — a fir tree with a star on top
      '....ss....',
      '....bb....',
      '...bbbb...',
      '..bsbbsb..',
      '.bbbbbbbb.',
      'bbbtbbtbbb'
    ]
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v < 0 ? -1 : 1; }

  function World(opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.difficulty = CONFIG.DIFF[opts.difficulty] ? opts.difficulty : 'easy';
    this.startLevel = M.max(0, opts.level | 0);
    this.reset();
  }
  World.CONFIG = CONFIG;
  World.LAYOUTS = LAYOUTS;

  World.prototype.reset = function () {
    var D = CONFIG.DIFF[this.difficulty];
    this.D = D;
    this.rng = new MFB.RNG(this.seed);
    this.time = 0; this.alpha = 0; this.acc = 0;
    this.events = [];
    this.score = 0; this.hearts = CONFIG.HEARTS; this.maxHearts = CONFIG.MAX_HEARTS;
    this.starCount = 0; this.combo = 0;
    this.stats = { bricks: 0, stars: 0, starsMissed: 0, bossHits: 0, tickles: 0, pillowHits: 0, pillowsPopped: 0,
      lost: 0, serves: 0, paddleHits: 0, netSaves: 0, maxCombo: 0, seasonTimes: [] };
    this.paddle = { x: 8, px: 8, y: CONFIG.PADDLE_Y, w: D.paddleW, vx: 0, target: null, sleepy: 0, cheer: 0, oops: 0,
      face: 'idle' };
    this.keyDir = 0;
    this._id = 1;
    this.bossPh = [this.rng.range(0, 6.283), this.rng.range(0, 6.283)];
    this.boss = { x: 8, y: CONFIG.BOSS_Y, px: 8, py: CONFIG.BOSS_Y, state: 'float', stateT: 0, nextThrow: D.pillowEvery,
      hits: 0, flap: 0, off: 0, offV: 0, t: 0 };
    this.boss.x = this.boss.px = this._bossPathX(0);
    this.level = this.startLevel;
    this._startSeason();
  };

  World.prototype._loopK = function () { return M.min(this.loop, CONFIG.LOOP_CAP); };
  World.prototype._baseSpeed = function () {
    return M.min(CONFIG.SPEED_MAX, this.D.ballSpeed * (1 + CONFIG.SPEED_SEASON * this.zone + CONFIG.SPEED_ROUND * this._loopK()));
  };
  World.prototype._speed = function () {
    var ramp = M.min(CONFIG.SPEED_HIT_CAP, CONFIG.SPEED_HIT_STEP * M.floor(this.lifeHits / CONFIG.SPEED_HITS));
    return M.min(CONFIG.SPEED_MAX, this._baseSpeed() * (1 + ramp));
  };

  World.prototype._buildBricks = function () {
    var L = LAYOUTS[this.zone], C = CONFIG, list = [];
    var toughP = this.loop >= 1 ? M.min(0.45, C.TOUGH_LOOP * this._loopK()) : 0;
    var pitchX = C.BRICK_W + C.GAP_X, pitchY = C.BRICK_H + C.GAP_Y;
    for (var r = 0; r < L.length; r++) {
      for (var c = 0; c < C.COLS; c++) {
        var ch = L[r].charAt(c);
        if (ch === '.' || !ch) continue;
        var kind = ch === 't' ? 'tough' : ch === 's' ? 'star' : 'bud';
        if (kind === 'bud' && toughP > 0 && this.rng.chance(toughP)) kind = 'tough';
        var hp = kind === 'tough' ? 2 : 1;
        list.push({ id: this._id++, x: C.FIELD_W / 2 + (c - (C.COLS - 1) / 2) * pitchX, y: C.TOP_Y - r * pitchY,
          w: C.BRICK_W, h: C.BRICK_H, hp: hp, maxHp: hp, kind: kind, alive: true, hitT: 99, row: r, col: c });
      }
    }
    this.bricks = list;
  };

  World.prototype._startSeason = function () {
    this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this._buildBricks();
    this.stars = []; this.pillows = [];
    this.net = { saves: this.D.netSaves };
    this.boss.hits = 0; this.boss.nextThrow = this.D.pillowEvery; this.boss.state = 'float'; this.boss.stateT = 0;
    this.seasonT = 0; this.noBrickT = 0; this.lifeHits = 0; this.combo = 0;
    this._toServe();
  };

  World.prototype._toServe = function () {
    this.phase = 'serve'; this.serveT = 0; this.combo = 0;
    var r = CONFIG.BALL_R, p = this.paddle;
    this.ball = { x: p.x, y: CONFIG.PADDLE_Y + r, px: p.x, py: CONFIG.PADDLE_Y + r, vx: 0, vy: 0, r: r,
      speed: this._speed(), onPaddle: true, spin: 0 };
  };

  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };
  World.prototype.bricksLeft = function () {
    var n = 0; for (var i = 0; i < this.bricks.length; i++) if (this.bricks[i].alive) n++; return n;
  };

  // ---------------- input ----------------
  World.prototype.setPaddleTarget = function (x) {
    var hw = this.paddle.w / 2;
    this.paddle.target = clamp(+x, hw, CONFIG.FIELD_W - hw);
    this.keyDir = 0;
  };
  World.prototype.movePaddle = function (dir) {
    dir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
    if (dir !== 0) this.paddle.target = null;   // keys take over from the pointer
    this.keyDir = dir;
  };
  World.prototype.serve = function () {
    if (this.phase !== 'serve') return false;
    var C = CONFIG, b = this.ball, p = this.paddle;
    var a = this.rng.range(C.SERVE_ANGLE[0], C.SERVE_ANGLE[1]) * DEG * this.rng.sign();
    b.speed = this._speed();
    b.vx = b.speed * M.sin(a) + clamp(p.vx * C.SERVE_NUDGE, -1, 1);
    b.vy = b.speed * M.cos(a);
    this._normalize(b);
    b.onPaddle = false;
    this.phase = 'play';
    this.stats.serves++;
    this._emit({ type: 'serve', x: b.x });
    return true;
  };

  // ---------------- test hooks ----------------
  World.prototype.gotoLevel = function (i) {
    this.level = M.max(0, i | 0);
    this._startSeason();
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop });
  };
  World.prototype.debugClear = function (leave) {
    leave = leave === undefined ? 1 : leave;
    var alive = this.bricks.filter(function (b) { return b.alive; });
    for (var i = 0; i < alive.length - leave; i++) alive[i].alive = false;
  };
  World.prototype.debugThrow = function () { this._throwPillow(); };

  // ---------------- simulation ----------------
  World.prototype.update = function (dt) {
    dt = clamp(+dt || 0, 0, 0.25);
    var H = CONFIG.STEP;
    this.acc += dt;
    while (this.acc >= H - 1e-9) { this._step(H); this.acc -= H; }
    if (this.acc < 0) this.acc = 0;
    this.alpha = clamp(this.acc / H, 0, 1);
  };

  World.prototype._step = function (h) {
    this.time += h;
    var p = this.paddle, b = this.ball, boss = this.boss;
    p.px = p.x;
    if (b) { b.px = b.x; b.py = b.y; }
    boss.px = boss.x; boss.py = boss.y;
    for (var i = 0; i < this.stars.length; i++) { this.stars[i].px = this.stars[i].x; this.stars[i].py = this.stars[i].y; }
    for (i = 0; i < this.pillows.length; i++) { this.pillows[i].px = this.pillows[i].x; this.pillows[i].py = this.pillows[i].y; }
    for (i = 0; i < this.bricks.length; i++) this.bricks[i].hitT += h;

    this._stepPaddle(h);
    if (this.phase !== 'over') this._stepBoss(h);
    this._stepStars(h);
    this._stepPillows(h);

    if (this.phase === 'serve') {
      b.x = p.x; b.y = CONFIG.PADDLE_Y + b.r; b.px = p.px; b.py = b.y;
      this.serveT += h;
      if (this.serveT >= CONFIG.AUTO_SERVE) this.serve();
    } else if (this.phase === 'play') {
      this.seasonT += h; this.noBrickT += h;
      this._stepBall(h);
    } else if (this.phase === 'clear') {
      this.clearT -= h;
      if (this.clearT <= 0) {
        this.level++;
        this._startSeason();
        this._emit({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop });
      }
    }
    if (this.phase === 'serve') this.seasonT += h;
    this._updateFace(h);
  };

  World.prototype._stepPaddle = function (h) {
    var C = CONFIG, p = this.paddle, sleepy = p.sleepy > 0;
    var vmax = C.PADDLE_SPEED * (sleepy ? C.SLEEPY_SPEED_K : 1);
    if (p.target !== null && p.target !== undefined) {
      var w = C.PADDLE_OMEGA * (sleepy ? 0.6 : 1);
      p.vx += (w * w * (p.target - p.x) - 2 * w * p.vx) * h;   // critically damped spring (semi-implicit Euler)
    } else {
      p.vx += (this.keyDir * vmax - p.vx) * M.min(1, C.KEY_RESP * h);
    }
    p.vx = clamp(p.vx, -vmax, vmax);
    p.x += p.vx * h;
    var hw = p.w / 2;
    if (p.x < hw) { p.x = hw; if (p.vx < 0) p.vx = 0; }
    if (p.x > C.FIELD_W - hw) { p.x = C.FIELD_W - hw; if (p.vx > 0) p.vx = 0; }
    if (p.sleepy > 0) p.sleepy = M.max(0, p.sleepy - h);
    if (p.cheer > 0) p.cheer = M.max(0, p.cheer - h);
    if (p.oops > 0) p.oops = M.max(0, p.oops - h);
  };

  World.prototype._updateFace = function () {
    var p = this.paddle;
    p.face = p.oops > 0 ? 'oops' : p.sleepy > 0 ? 'sleepy' : p.cheer > 0 ? 'cheer'
      : p.vx < -CONFIG.FACE_MOVE_V ? 'left' : p.vx > CONFIG.FACE_MOVE_V ? 'right' : 'idle';
  };

  World.prototype._bossPathX = function (t) {
    var ph = this.bossPh;
    return 8 + 4.2 * M.sin(0.21 * t + ph[0]) + 1.4 * M.sin(0.53 * t + ph[1]);   // slow sine + a second "noise" sine
  };

  World.prototype._stepBoss = function (h) {
    var C = CONFIG, s = this.boss;
    s.t += h;
    // push offset: a critically damped spring back to his path
    var w = C.BOSS_SPRING;
    s.offV += (-w * w * s.off - 2 * w * s.offV) * h;
    s.off += s.offV * h;
    s.x = clamp(this._bossPathX(s.t) + s.off, C.BOSS_X[0], C.BOSS_X[1]);
    s.y = C.BOSS_Y + C.BOSS_BOB * M.sin(2 * M.PI * s.t / C.BOSS_BOB_T);
    var flapHz = C.BOSS_FLAP_HZ * (s.state === 'float' ? 1 : 2.5);
    s.flap = (s.flap + flapHz * h) % 1;
    if (s.state !== 'float') { s.stateT -= h; if (s.stateT <= 0) { s.state = 'float'; s.stateT = 0; } }
    if (this.phase === 'play' || this.phase === 'serve') {
      s.nextThrow -= h;
      if (s.nextThrow <= 0) this._throwPillow();
    }
  };

  World.prototype._throwPillow = function () {
    var C = CONFIG, s = this.boss, r = this.rng;
    s.nextThrow = this.D.pillowEvery;
    if (s.state !== 'giggle') { s.state = 'throw'; s.stateT = C.THROW_T; }
    var aim = clamp(this.paddle.x + r.sign() * r.range(C.PILLOW_MISS[0], C.PILLOW_MISS[1]), 0.6, C.FIELD_W - 0.6);
    var pl = { id: this._id++, x: s.x, y: s.y - 0.35, px: s.x, py: s.y - 0.35, vx: 0, vy: C.PILLOW_TOSS, rot: 0,
      spin: r.sign() * r.range(C.PILLOW_SPIN[0], C.PILLOW_SPIN[1]), landX: aim, age: 0, ph: r.range(0, 6.283) };
    // solve vx so it lands at `aim`: x(T) = x0 + vx·(1 − e^(−kT))/k + sway drift (simulated)
    var probe = this._simLand(pl);
    var k = C.PILLOW_G / C.PILLOW_TERM, f = (1 - M.exp(-k * probe.T)) / k;
    pl.vx = (aim - probe.x) / f;
    pl.landX = this._simLand(pl).x;          // exact landing point with the very same step code (the shadow)
    this.pillows.push(pl);
    this._emit({ type: 'bossThrow', x: s.x, y: s.y });
  };

  function stepPillow(pl, h) {
    var C = CONFIG, k = C.PILLOW_G / C.PILLOW_TERM;
    pl.age += h;
    pl.vy += (-C.PILLOW_G - k * pl.vy) * h;
    pl.vx += (-k * pl.vx) * h;
    pl.x += (pl.vx + C.PILLOW_SWAY * M.sin(C.PILLOW_SWAY_W * pl.age + pl.ph)) * h;
    pl.y += pl.vy * h;
    pl.rot += pl.spin * h * (1 + 0.4 * M.sin(pl.age * 3 + pl.ph));   // tumble with a wobble
  }
  World.prototype._simLand = function (pl) {
    var q = { x: pl.x, y: pl.y, vx: pl.vx, vy: pl.vy, age: pl.age, ph: pl.ph, rot: 0, spin: 0 }, t = 0, H = CONFIG.STEP;
    while (q.y > CONFIG.PILLOW_GROUND && t < 20) { stepPillow(q, H); t += H; }
    return { x: q.x, T: t };
  };

  World.prototype._stepPillows = function (h) {
    var C = CONFIG, p = this.paddle;
    for (var i = this.pillows.length - 1; i >= 0; i--) {
      var pl = this.pillows[i];
      stepPillow(pl, h);
      var hw = p.w / 2;
      if (pl.x + C.PILLOW_R > p.x - hw && pl.x - C.PILLOW_R < p.x + hw && pl.y - C.PILLOW_R < C.PILLOW_HIT_TOP && pl.y > 0) {
        this.pillows.splice(i, 1);
        p.sleepy = this.D.sleepyTime;
        this.stats.pillowHits++;
        this._emit({ type: 'pillowHit', x: pl.x });
        continue;
      }
      if (pl.y <= C.PILLOW_GROUND) {
        this.pillows.splice(i, 1);
        this._emit({ type: 'pillowLand', x: pl.x });
      }
    }
  };

  World.prototype._spawnStar = function (x, y) {
    var C = CONFIG, r = this.rng;
    var st = { id: this._id++, x: x, y: y, px: x, py: y, vx: 0, vy: C.STAR_POP, rot: 0,
      spin: r.sign() * r.range(C.STAR_SPIN[0], C.STAR_SPIN[1]), age: 0,
      swayA: r.range(C.STAR_SWAY[0], C.STAR_SWAY[1]), swayW: r.range(C.STAR_SWAY_W[0], C.STAR_SWAY_W[1]), ph: r.range(0, 6.283) };
    this.stars.push(st);
    this._emit({ type: 'starSpawn', id: st.id, x: x, y: y });
  };

  World.prototype._stepStars = function (h) {
    var C = CONFIG, p = this.paddle;
    for (var i = this.stars.length - 1; i >= 0; i--) {
      var s = this.stars[i];
      s.age += h;
      s.vy += (-C.STAR_FALL - s.vy) * M.min(1, C.STAR_RELAX * h);
      s.vx = s.swayA * M.sin(s.swayW * s.age + s.ph);
      s.x = clamp(s.x + s.vx * h, 0.3, C.FIELD_W - 0.3);
      s.y += s.vy * h;
      s.rot += s.spin * h;
      if (M.abs(s.x - p.x) <= p.w / 2 + C.CATCH_PAD && s.y >= 0 && s.y <= C.CATCH_TOP && this.phase !== 'over') {
        this.stars.splice(i, 1);
        this.starCount++; this.stats.stars++;
        this._addScore(C.PTS.star);
        p.cheer = M.max(p.cheer, C.CHEER_T);
        this._emit({ type: 'starCatch', x: s.x, y: s.y, pts: C.PTS.star, count: this.starCount });
        if (this.starCount % C.STARS_PER_HEART === 0) this._gainHeart('stars');
        continue;
      }
      if (s.y < -0.3) {
        this.stars.splice(i, 1);
        this.stats.starsMissed++;
        this._emit({ type: 'starMiss', x: s.x });
      }
    }
  };

  World.prototype._gainHeart = function (why) {
    if (this.hearts >= this.maxHearts) return;
    this.hearts++;
    this._emit({ type: 'heartGain', hearts: this.hearts, why: why });
  };
  World.prototype._addScore = function (n) { this.score += n; };

  /** set |v| = speed and enforce |vy| ≥ MIN_VY_K·speed (keeps the sign of vy; vy = 0 counts as up) */
  World.prototype._normalize = function (b) {
    var s = b.speed, m = M.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    b.vx = b.vx / m * s; b.vy = b.vy / m * s;
    var minVy = CONFIG.MIN_VY_K * s;
    if (M.abs(b.vy) < minVy) {
      var sy = b.vy < 0 ? -1 : 1;
      b.vy = sy * minVy;
      b.vx = sgn(b.vx) * M.sqrt(s * s - minVy * minVy);
    }
  };

  World.prototype._stepBall = function (h) {
    var C = CONFIG, b = this.ball;
    var n = M.max(1, M.ceil(b.speed * h / C.MICRO)), hh = h / n;
    for (var k = 0; k < n && this.phase === 'play'; k++) {
      var ox = b.x, oy = b.y;
      b.x += b.vx * hh; b.y += b.vy * hh;
      b.spin += b.vx * hh * 2.5;
      this._collideWalls(b);
      this._collideBricks(b);
      if (this.phase !== 'play') return;
      this._collideBoss(b);
      this._collidePillows(b);
      this._collidePaddle(b, ox, oy);
      this._checkLost(b);
    }
  };

  World.prototype._collideWalls = function (b) {
    var C = CONFIG, r = b.r;
    if (b.x < r && b.vx < 0) { b.x = 2 * r - b.x; b.vx = -b.vx; this._normalize(b); this._emit({ type: 'wall', x: 0, y: b.y, side: 'left' }); }
    if (b.x > C.FIELD_W - r && b.vx > 0) { b.x = 2 * (C.FIELD_W - r) - b.x; b.vx = -b.vx; this._normalize(b); this._emit({ type: 'wall', x: C.FIELD_W, y: b.y, side: 'right' }); }
    if (b.y > C.CEIL - r && b.vy > 0) { b.y = 2 * (C.CEIL - r) - b.y; b.vy = -b.vy; this._normalize(b); this._emit({ type: 'wall', x: b.x, y: C.CEIL, side: 'top' }); }
  };

  World.prototype._collideBricks = function (b) {
    var C = CONFIG, r = b.r, best = null, bestAxis = 0, bestPen = 0, bestD = 1e9, hits = [];
    for (var i = 0; i < this.bricks.length; i++) {
      var k = this.bricks[i];
      if (!k.alive) continue;
      var hw = k.w / 2, hh = k.h / 2;
      var dxc = b.x - k.x, dyc = b.y - k.y;
      if (M.abs(dxc) > hw + r || M.abs(dyc) > hh + r) continue;
      var qx = clamp(b.x, k.x - hw, k.x + hw), qy = clamp(b.y, k.y - hh, k.y + hh);
      var dx = b.x - qx, dy = b.y - qy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      var penX = hw + r - M.abs(dxc), penY = hh + r - M.abs(dyc);
      var intoX = b.vx * dxc < 0, intoY = b.vy * dyc < 0;
      if (!intoX && !intoY) continue;           // already leaving this one
      var axis;                                  // 0 = x, 1 = y: least penetration, among the axes we move into
      if (intoX && intoY) axis = penX < penY ? 0 : 1;
      else axis = intoX ? 0 : 1;
      hits.push(k);
      if (d2 < bestD) { bestD = d2; best = k; bestAxis = axis; bestPen = axis === 0 ? penX : penY; }
    }
    if (!best) return;
    if (bestAxis === 0) { var sx = sgn(b.x - best.x); b.vx = sx * M.abs(b.vx); b.x += sx * bestPen; }
    else { var sy = sgn(b.y - best.y); b.vy = sy * M.abs(b.vy); b.y += sy * bestPen; }
    this._normalize(b);
    for (var j = 0; j < hits.length; j++) this._hitBrick(hits[j]);
  };

  World.prototype._hitBrick = function (k) {
    var C = CONFIG;
    if (k.hitT < C.HIT_COOLDOWN || !k.alive) return;
    k.hitT = 0; k.hp--;
    this.noBrickT = 0;
    this.combo++;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    var pts = C.PTS.brick + (this.combo >= C.COMBO_FROM ? C.PTS.combo : 0);
    this._addScore(pts);
    var broken = k.hp <= 0;
    if (broken) { k.alive = false; this.stats.bricks++; }
    this._emit({ type: 'brick', id: k.id, x: k.x, y: k.y, kind: k.kind, broken: broken, hp: M.max(0, k.hp), pts: pts,
      combo: this.combo, zone: this.zone });
    var c = this.combo;
    if (c === 3 || c === 5 || (c >= 8 && c % 4 === 0)) this._emit({ type: 'combo', n: c });
    if (broken && (k.kind === 'star' || (k.kind === 'bud' && this.rng.chance(this.D.budStar)))) this._spawnStar(k.x, k.y);
    if (broken && this.bricksLeft() === 0) this._seasonClear();
  };

  World.prototype._seasonClear = function () {
    var C = CONFIG;
    var pts = C.PTS.clear + C.PTS.clearHeart * this.hearts;
    this._addScore(pts);
    this.stats.seasonTimes.push(+this.seasonT.toFixed(3));
    this._emit({ type: 'levelClear', zone: this.zone, pts: pts, time: this.seasonT });
    this._gainHeart('season');
    this.phase = 'clear'; this.clearT = C.CLEAR_T; this.ball = null; this.combo = 0;
    this.paddle.cheer = C.CLEAR_CHEER_T;
    for (var i = 0; i < this.pillows.length; i++) this._emit({ type: 'pillowPop', x: this.pillows[i].x, y: this.pillows[i].y, pts: 0 });
    this.pillows = [];
  };

  World.prototype._collideBoss = function (b) {
    var C = CONFIG, s = this.boss;
    var dx = b.x - s.x, dy = b.y - s.y, R = C.BOSS_R + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    var d = M.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;                       // moving away already
    b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny;  // true circle reflection
    b.x = s.x + nx * (R + 0.001); b.y = s.y + ny * (R + 0.001);
    this._normalize(b);
    s.offV += -nx * C.BOSS_PUSH;
    var fresh = s.state !== 'giggle' || s.stateT < C.GIGGLE_T - 0.3;
    s.state = 'giggle'; s.stateT = C.GIGGLE_T;
    if (!fresh) return;
    s.hits++; this.stats.bossHits++;
    this._addScore(C.PTS.boss);
    this._emit({ type: 'bossHit', x: s.x, y: s.y, pts: C.PTS.boss, hits: s.hits });
    if (s.hits === C.TICKLE_HITS) {
      this._addScore(C.PTS.tickle); this.stats.tickles++;
      this._emit({ type: 'bossTickled', x: s.x, y: s.y, pts: C.PTS.tickle });
      this._spawnStar(s.x, s.y - 0.4);
    }
  };

  World.prototype._collidePillows = function (b) {
    var C = CONFIG, R = C.PILLOW_R + b.r;
    for (var i = this.pillows.length - 1; i >= 0; i--) {
      var pl = this.pillows[i], dx = b.x - pl.x, dy = b.y - pl.y;
      if (dx * dx + dy * dy < R * R) {
        this.pillows.splice(i, 1);
        this._addScore(C.PTS.pillow); this.stats.pillowsPopped++;
        this._emit({ type: 'pillowPop', x: pl.x, y: pl.y, pts: C.PTS.pillow });
      }
    }
  };

  World.prototype._collidePaddle = function (b, ox, oy) {
    var C = CONFIG, p = this.paddle, line = C.PADDLE_Y + b.r;
    if (b.vy >= 0 || oy < line || b.y >= line) return;
    var t = (oy - line) / (oy - b.y), xc = ox + (b.x - ox) * t;   // where the ball's bottom crossed the bounce line
    var reach = p.w / 2 + b.r;
    if (M.abs(xc - p.x) > reach) return;
    var off = clamp((xc - p.x) / reach, -1, 1);
    var ang = off * C.MAX_ANGLE + clamp(p.vx * C.NUDGE_K, -C.NUDGE_MAX, C.NUDGE_MAX);
    if (this.noBrickT > C.ANTI_STALL) {   // steer toward the nearest block: 50 % at ANTI_STALL, growing to 100 % at 2×
      var tgt = this._nearestBrickAngle(xc, line);
      var kk = M.min(1, 0.5 + 0.5 * (this.noBrickT - C.ANTI_STALL) / C.ANTI_STALL);
      if (tgt !== null) ang = (1 - kk) * ang + kk * tgt;
    }
    ang = clamp(ang, -C.MAX_ANGLE, C.MAX_ANGLE) * DEG;
    this.lifeHits++; this.stats.paddleHits++;
    b.speed = this._speed();
    b.vx = b.speed * M.sin(ang); b.vy = b.speed * M.cos(ang);
    b.y = line + (line - b.y);
    this._normalize(b);
    this.combo = 0;
    this._emit({ type: 'paddle', x: xc, y: C.PADDLE_Y, off: off });
  };

  /* Angle (°, from vertical) that sends the ball at the nearest block's underside. Out of reach (> MAX_ANGLE)?
   * Bank it off the near wall (aim at the mirror image); still out of reach → a random 18–54° toward it, because a
   * fixed angle can lock a steady player into a periodic orbit (playtest: a 175 s stall on a corner block). */
  World.prototype._nearestBrickAngle = function (x, y) {
    var C = CONFIG, best = null, bd = 1e9;
    for (var i = 0; i < this.bricks.length; i++) {
      var k = this.bricks[i];
      if (!k.alive) continue;
      var d = M.abs(k.x - x) + 0.3 * (k.y - y);
      if (d < bd) { bd = d; best = k; }
    }
    if (!best) return null;
    var r = C.BALL_R, ty = best.y - best.h / 2 - r - y;
    var a = M.atan2(best.x - x, ty) / DEG;
    if (M.abs(a) > C.MAX_ANGLE) {
      var mirror = a > 0 ? 2 * (C.FIELD_W - r) - best.x : 2 * r - best.x;
      a = M.atan2(mirror - x, ty) / DEG;
    }
    if (M.abs(a) > C.MAX_ANGLE) a = (a > 0 ? 1 : -1) * this.rng.range(0.3, 0.9) * C.MAX_ANGLE;
    return a;
  };

  World.prototype._checkLost = function (b) {
    var C = CONFIG;
    if (b.vy < 0 && b.y < C.NET_Y && this.net.saves > 0) {
      this.net.saves--; this.stats.netSaves++;
      var a = this.rng.range(5, 25) * (b.x < 8 ? 1 : -1) * DEG;   // the vine flicks it back up, toward the middle
      b.y = C.NET_Y + (C.NET_Y - b.y);
      b.vx = b.speed * M.sin(a); b.vy = b.speed * M.cos(a);
      this._normalize(b);
      this._emit({ type: 'net', x: b.x, savesLeft: this.net.saves });
      return;
    }
    if (b.y >= C.LOST_Y) return;
    this.stats.lost++;
    this._emit({ type: 'ballLost', x: b.x });
    this.hearts--; this.lifeHits = 0;
    this._emit({ type: 'heartLost', hearts: this.hearts });
    this.paddle.oops = C.OOPS_T;
    if (this.hearts <= 0) {
      this.hearts = 0; this.phase = 'over'; this.ball = null;
      this.pillows = [];
      this._emit({ type: 'gameOver', score: this.score });
    } else {
      this._toServe();
    }
  };

  World.prototype.getState = function () {
    var b = this.ball, s = this.boss;
    return {
      phase: this.phase, level: this.level, zone: this.zone, loop: this.loop, score: this.score, hearts: this.hearts,
      starCount: this.starCount, bricksLeft: this.bricksLeft(),
      ball: b ? { x: +b.x.toFixed(4), y: +b.y.toFixed(4), vx: +b.vx.toFixed(4), vy: +b.vy.toFixed(4), speed: +b.speed.toFixed(4) } : null,
      paddle: { x: +this.paddle.x.toFixed(4), w: this.paddle.w },
      boss: { x: +s.x.toFixed(4), state: s.state, nextThrow: +s.nextThrow.toFixed(3), hits: s.hits },
      pillows: this.pillows.length, stars: this.stars.length, time: +this.time.toFixed(4)
    };
  };

  MFB.World = World;
})(window.MFB = window.MFB || {});
