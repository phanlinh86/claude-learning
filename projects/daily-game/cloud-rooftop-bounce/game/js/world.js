/* Wisp's Rooftop Bounce — WRB.World: the headless, deterministic brick-breaker simulation (DESIGN §5)
 *
 *   var w = new WRB.World({ seed: 1, difficulty: 'easy', level: 0 });
 *   w.setPaddleTarget(x);   // pointer: absolute target x (u); Wisp eases to it (critically damped)
 *   w.movePaddle(dir);      // keys: -1 / 0 / +1 held; ±1 clears the pointer target (0 only releases the keys)
 *   w.serve();              // launch the pearl while phase === 'serve', or let go of a magnet-stuck pearl
 *   w.update(dt);           // fixed 1/120 s sub-steps inside; w.alpha = leftover fraction for render lerp
 *   w.drainEvents();        // [{type:'brick', ...}, ...]
 *
 * Units: u and seconds; x grows right, y grows UP; the rooftop line is y = 0, field x 0…16, ceiling y 8.6,
 * Wisp's bounce line (the cloud top) y 1.35. No pixels in here. Rotations are radians (world convention,
 * counter-clockwise positive): draw with ctx.rotate(-rot) on a y-down canvas.
 * Everything that moves keeps p* values (saved at the start of each sub-step) so the renderer can lerp with alpha.
 *
 * Collision: the pearl moves in micro-steps of ≤ 0.1 u inside every 1/120 s sub-step (2 micro-steps at 16 u/s).
 * The pearl (r 0.22) vs. a block (1.4 × 0.5) is circle vs. box: closest point on the box (= the Minkowski
 * "rounded box"); reflect on the axis of least penetration that the pearl is moving into, push out by the
 * penetration; every overlapping block the pearl moves into is hit (a corner can break two), but only one
 * reflection happens per micro-step. The thinnest thing to cross is 2·(0.25 + 0.22) = 0.94 u, ≫ 0.1 u: no tunnelling.
 *
 * Items: gems and magnet bubbles fall with gravity + linear air drag (so they float to a terminal speed) plus a
 * sideways sway. While the magnet is on, each item within MAGNET_RANGE gets a constant-magnitude acceleration
 * toward Wisp's centre (+ a little drag so it homes in instead of orbiting): a smooth curved path, never a teleport.
 *
 * CONFIG (units → why) is listed next to each key below; DIFF holds the per-difficulty overrides.
 */
(function (WRB) {
  'use strict';
  var M = Math, DEG = M.PI / 180;

  var CONFIG = {
    STEP: 1 / 120,          // s — fixed sub-step: at 16 u/s the pearl moves 0.13 u per step (split into ≤ 0.1 u micro-steps)
    MICRO: 0.1,             // u — max pearl travel per micro-step (≪ 0.94 u, the thinnest block + pearl): no tunnelling
    FIELD_W: 16,            // u — walls at x = 0 and x = 16 (DESIGN §2)
    CEIL: 8.6,              // u — ceiling: 0.6 u above the top block edge, so the pearl can rattle along the top
    PADDLE_Y: 1.35,         // u — Wisp's bounce line (the fluffy top of the cloud)
    LOST_Y: -0.3,           // u — pearl centre below this = lost
    NET_Y: 0.3,             // u — the moonbeam net catches the pearl centre here (well below Wisp: it reads as a rescue)
    BALL_R: 0.22,           // u — pearl hit radius (art 0.6 u incl. glow; solid core ≈ 0.43 u)
    MAX_ANGLE: 60,          // ° — Wisp's edge sends the pearl 60° from vertical
    MIN_VY_K: 0.38,         // × speed — |vy| never below this: the pearl never crawls sideways (≈ 68° max from vertical)
    NUDGE_K: 1.2,           // °/(u/s) — a moving Wisp tilts the bounce a little (20 u/s → 24°, clamped below)
    NUDGE_MAX: 12,          // ° — max velocity tilt, so a swipe helps but never overrides the hit point
    SERVE_ANGLE: [8, 22],   // ° — serve leaves 8–22° from vertical (random side), never dead straight
    SERVE_NUDGE: 0.08,      // × Wisp vx (u/s) — a moving serve inherits a little sideways speed (clamped ±1 u/s)
    AUTO_SERVE: 3,          // s — serve by itself so a waiting child is never stuck
    PADDLE_SPEED: 20,       // u/s — Wisp's max speed: crosses the field in < 1 s, still readable
    PADDLE_OMEGA: 18,       // 1/s — critically damped spring to the pointer: ≈ 0.25 s to settle, no overshoot
    KEY_RESP: 22,           // 1/s — keys: velocity reaches the held speed in ≈ 0.1 s (and stops as quickly)
    SQUASH_RATE: 9,         // 1/s — paddle.squash jumps to 1 on a hit and decays as e^(−9t) (≈ 0.25 s to 0.1): a soft boing
    SPEED_ZONE: 0.04,       // × — +4 % pearl speed per zone (one step lower in the city)
    SPEED_ROUND: 0.06,      // × — +6 % per round (4 zones) …
    LOOP_CAP: 3,            //      … up to round 4, then it stays (always playable)
    SPEED_HITS: 8,          // Wisp hits — +1 % every 8 hits …
    SPEED_HIT_STEP: 0.01,   // × — … the step …
    SPEED_HIT_CAP: 0.15,    // × — … capped at +15 % per life (losing the pearl resets the ramp)
    SPEED_MAX: 16,          // u/s — absolute cap (the collision is proven safe up to here)
    COLS: 10, BRICK_W: 1.4, BRICK_H: 0.5, GAP_X: 0.08, // u — 10 × 1.4 u blocks centred on x = 8 (edges 0.64…15.36)
    BOTTOM_Y: 4.33,         // u — every layout's bottom row centre (bottom edge 4.08) …
    ROW_PITCH: 0.57,        // u — … rows 0.57 apart (0.07 gap) going up: a 7-row layout's top row centre is 4.33 + 6·0.57 = 7.75
    TOP_Y: 7.75,            // u — … = the highest a row can be (top edge 8.0). Band of centres 4.33…7.75 (DESIGN: y 4.3…8.0).
                            //     Bottom-aligned so a 6-row layout leaves room above it for the pearl to rattle along the top
    HIT_COOLDOWN: 0.05,     // s — a block can't be damaged twice by one contact
    GEM_P: { block: 0.25, tough: 0.5, gem: 1, magnet: 0 },  // drop chance on break (DESIGN §5)
    GEM_POP: 1.5,           // u/s — a gem pops up out of its block first (a visible little hop, ≈ 0.2 u)
    GEM_G: 6,               // u/s² — gravity on items …
    GEM_FALL: 2.4,          // u/s — … with linear drag k = G/FALL = 2.5 /s → terminal 2.4 u/s (≈ 1.4 s from the lowest row)
    GEM_SWAY: [0.3, 0.6],   // u/s amplitude — gentle side-to-side sway …
    GEM_SWAY_W: [1.8, 2.8], // rad/s — … with a ≈ 2.2–3.5 s period
    GEM_SPIN: [1.2, 2.6],   // rad/s — gems turn slowly as they fall
    BUBBLE_FALL: 1.8,       // u/s — magnet bubble terminal (k = G/1.8 = 3.3 /s): floatier than a gem
    BUBBLE_POP: 1.2,        // u/s — the bubble pops up a little too
    BUBBLE_SWAY: 0.5,       // u/s — wobble sway amplitude …
    BUBBLE_SWAY_W: 2.2,     // rad/s — … (wob = the phase, render squashes the bubble with it)
    CATCH_PAD: 0.25,        // u — items are caught in the box x ±(w/2 + 0.25), y CATCH_BOT … CATCH_TOP
    CATCH_BOT: 0.2,         // u
    CATCH_TOP: 1.8,         // u — top of Wisp's puffy body + a little grace
    ITEM_LOST_Y: -0.3,      // u — an item below this is missed
    MAGNET_RANGE: 6,        // u — items closer than this to Wisp's centre are pulled (≈ the lower half of the field)
    MAGNET_ACC: 14,         // u/s² — pull acceleration (≈ 6× gravity: wins clearly, but the curve is still visible) …
    MAGNET_VMAX: 7,         // u/s — … speed cap while pulled (from 6 u away ≈ 1.1 s: you see it fly in)
    MAGNET_DRAG: 1.5,       // 1/s — drag while pulled: removes the sideways speed so items home in instead of orbiting
    MAGNET_CY: 0.9,         // u — the pull aims at Wisp's face (inside the catch box)
    MAGNET_WARN: 2,         // s — magnetWarn when this much is left (render blinks the ring)
    STICK_T: 1.5,           // s — a stuck pearl lets go by itself after this
    STICK_MIN_T: 0.3,       // s — no sticking during the magnet's last 0.3 s (it would drop straight away)
    GEMS_PER_HEART: 10,     // gems — +1 heart every 10 gems caught
    HEARTS: 3, MAX_HEARTS: 5,
    ANTI_STALL: 3,          // s — no block hit for 3 s → Wisp's bounces (and magnet releases) steer toward the nearest block (playtest: 5 s let zone ends drag for players who don't aim)
    CLEAR_T: 2.5,           // s — the 'clear' phase = the descend transition
    OOPS_T: 1.0, CHEER_T: 0.8, CLEAR_CHEER_T: 2.5, // s — Wisp face timers
    FACE_MOVE_V: 1.5,       // u/s — faster than this shows the left/right frame
    PTS: { brick: 10, combo: 5, gem: 25, clear: 100, clearHeart: 20 },
    COMBO_FROM: 3,          // the 3rd block before the pearl comes back to Wisp starts the +5 bonus
    DIFF: {
      easy:   { paddleW: 4.2, ballSpeed: 5.4, netSaves: 12, magnetT: 12 },  // a 4–6-year-old: wide, slow, a forgiving net (playtest: 8 saves lasted a 4-year-old ≈ 70 s)
      normal: { paddleW: 2.5, ballSpeed: 7.6, netSaves: 1, magnetT: 10 },
      hard:   { paddleW: 2.1, ballSpeed: 9.0, netSaves: 0, magnetT: 8 }
    },
    TOUGH_LOOP: 0.15        // chance per round (max 0.45) that a 'b' block becomes tough on round ≥ 2
  };

  var ZONES = ['cloud', 'spires', 'gardens', 'lanes'];

  // 'b' block (1 hit), 't' tough (2 hits), 'g' gem block (1 hit, always a gem), 'm' magnet block (1 hit, drops the magnet)
  var LAYOUTS = [
    [ // Cloud Deck — a big puffy cloud (32 blocks, no tough ones: the first zone is for a 6-year-old)
      '...bb.....',
      '..bbbb.bb.',
      '.bbgbbbbb.',
      '.bmbbbbgm.',
      '..bbbbbb..',
      '...b..b...'
    ],
    [ // Skyscraper Spires — three towers, the middle one tallest
      '....bb....',
      '.b..bb..b.',
      '.b..gb..b.',
      'tbt.bb.tbt',
      'bmb.bb.bmb',
      'bgbbbbbbgb',
      '.bbbbbbbb.'
    ],
    [ // Rooftop Gardens — two flowers in a long planter
      '.bb....bb.',
      'bgbb..bbgb',
      '.bb.mb.bb.',
      '..b.bb.b..',
      '..b.bb.b..',
      'tbbbmbbbbt',
      '.tbbggbbt.'
    ],
    [ // Lantern Lane — lanterns hanging from a string
      'bbbbbbbbbb',
      '.b..b..b..',
      'tbt.tmt.tb',
      'bgb.bbb.bm',
      'bmb.bgb.bb',
      'bbb.bbb.bb',
      '.b...b...b'
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
  World.ZONES = ZONES;

  World.prototype.reset = function () {
    var D = CONFIG.DIFF[this.difficulty];
    this.D = D;
    this.rng = new WRB.RNG(this.seed);
    this.time = 0; this.alpha = 0; this.acc = 0;
    this.events = [];
    this.score = 0; this.hearts = CONFIG.HEARTS; this.maxHearts = CONFIG.MAX_HEARTS;
    this.gemCount = 0; this.combo = 0;
    this.stats = { bricks: 0, gems: 0, gemsMissed: 0, magnets: 0, magnetsMissed: 0, catches: 0, lost: 0, serves: 0,
      paddleHits: 0, netSaves: 0, maxCombo: 0, zoneTimes: [] };
    this.paddle = { x: 8, px: 8, y: CONFIG.PADDLE_Y, w: D.paddleW, vx: 0, target: null, cheer: 0, oops: 0, squash: 0,
      face: 'idle' };
    this.magnet = { t: 0, max: D.magnetT };
    this.keyDir = 0;
    this._id = 1;
    this.level = this.startLevel;
    this._startZone();
  };

  World.prototype._loopK = function () { return M.min(this.loop, CONFIG.LOOP_CAP); };
  World.prototype._baseSpeed = function () {
    return M.min(CONFIG.SPEED_MAX, this.D.ballSpeed * (1 + CONFIG.SPEED_ZONE * this.zone + CONFIG.SPEED_ROUND * this._loopK()));
  };
  World.prototype._speed = function () {
    var ramp = M.min(CONFIG.SPEED_HIT_CAP, CONFIG.SPEED_HIT_STEP * M.floor(this.lifeHits / CONFIG.SPEED_HITS));
    return M.min(CONFIG.SPEED_MAX, this._baseSpeed() * (1 + ramp));
  };

  World.prototype._buildBricks = function () {
    var L = LAYOUTS[this.zone], C = CONFIG, list = [];
    var toughP = this.loop >= 1 ? M.min(0.45, C.TOUGH_LOOP * this._loopK()) : 0;
    var pitchX = C.BRICK_W + C.GAP_X;
    for (var r = 0; r < L.length; r++) {
      for (var c = 0; c < C.COLS; c++) {
        var ch = L[r].charAt(c);
        if (ch === '.' || !ch) continue;
        var kind = ch === 't' ? 'tough' : ch === 'g' ? 'gem' : ch === 'm' ? 'magnet' : 'block';
        if (kind === 'block' && toughP > 0 && this.rng.chance(toughP)) kind = 'tough';
        var hp = kind === 'tough' ? 2 : 1;
        list.push({ id: this._id++, x: C.FIELD_W / 2 + (c - (C.COLS - 1) / 2) * pitchX, y: C.BOTTOM_Y + (L.length - 1 - r) * C.ROW_PITCH,
          w: C.BRICK_W, h: C.BRICK_H, hp: hp, maxHp: hp, kind: kind, alive: true, hitT: 99, row: r, col: c });
      }
    }
    this.bricks = list;
  };

  World.prototype._startZone = function () {
    this.zone = this.level % 4; this.loop = M.floor(this.level / 4);
    this._buildBricks();
    this.gems = []; this.powerups = [];
    this.net = { saves: this.D.netSaves };
    this.zoneT = 0; this.noBrickT = 0; this.lifeHits = 0; this.combo = 0;
    this._toServe();
  };

  World.prototype._toServe = function () {
    this.phase = 'serve'; this.serveT = 0; this.combo = 0;
    var r = CONFIG.BALL_R, p = this.paddle;
    this.ball = { x: p.x, y: CONFIG.PADDLE_Y + r, px: p.x, py: CONFIG.PADDLE_Y + r, vx: 0, vy: 0, r: r,
      speed: this._speed(), onPaddle: true, stuck: false, stuckT: 0, stuckOff: 0, spin: 0 };
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
  /** serve during 'serve', or let go of a stuck pearl during 'play'; true if the pearl launched */
  World.prototype.serve = function () {
    if (this.phase === 'play' && this.ball && this.ball.stuck) { this._release(false); return true; }
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

  /** launch a stuck pearl at the angle for its offset (+ Wisp's velocity tilt, like a normal bounce) */
  World.prototype._release = function (auto) {
    var C = CONFIG, b = this.ball, p = this.paddle;
    if (!b || !b.stuck) return;
    var reach = p.w / 2 + b.r;
    var off = clamp(b.stuckOff / reach, -1, 1);
    var ang = off * C.MAX_ANGLE + clamp(p.vx * C.NUDGE_K, -C.NUDGE_MAX, C.NUDGE_MAX);
    // the stall clock keeps running through a stick (playtest: resetting it here meant a player who doesn't aim
    // never got the anti-stall help while the magnet was on); during a stall, steer the release like a bounce
    if (this.noBrickT > C.ANTI_STALL) {
      var tgt = this._nearestBrickAngle(b.x, b.y);
      var kk = M.min(1, 0.5 + 0.5 * (this.noBrickT - C.ANTI_STALL) / C.ANTI_STALL);
      if (tgt !== null) ang = (1 - kk) * ang + kk * tgt;
    }
    ang = clamp(ang, -C.MAX_ANGLE, C.MAX_ANGLE) * DEG;
    b.speed = this._speed();
    b.vx = b.speed * M.sin(ang); b.vy = b.speed * M.cos(ang);
    this._normalize(b);
    b.stuck = false; b.onPaddle = false; b.stuckT = 0;
    this._emit({ type: 'release', x: b.x, y: b.y, auto: !!auto });
  };

  // ---------------- test hooks ----------------
  World.prototype.gotoLevel = function (i) {
    this.level = M.max(0, i | 0);
    this._startZone();
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop });
  };
  World.prototype.debugClear = function (leave) {
    leave = leave === undefined ? 1 : leave;
    var alive = this.bricks.filter(function (b) { return b.alive; });
    for (var i = 0; i < alive.length - leave; i++) alive[i].alive = false;
    if (this.bricksLeft() === 0 && this.phase === 'play') this._zoneClear();   // clearBricks(0) must not soft-lock the zone
  };
  World.prototype.debugMagnet = function () { this._magnetOn(this.paddle.x, CONFIG.PADDLE_Y); };
  World.prototype.debugDrop = function (kind) {
    var x = this.paddle.x, y = 4.5;
    if (kind === 'magnet') this._spawnBubble(x, y); else this._spawnGem(x, y);
  };

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
    var p = this.paddle, b = this.ball, i;
    p.px = p.x;
    if (b) { b.px = b.x; b.py = b.y; }
    for (i = 0; i < this.gems.length; i++) { this.gems[i].px = this.gems[i].x; this.gems[i].py = this.gems[i].y; }
    for (i = 0; i < this.powerups.length; i++) { this.powerups[i].px = this.powerups[i].x; this.powerups[i].py = this.powerups[i].y; }
    for (i = 0; i < this.bricks.length; i++) this.bricks[i].hitT += h;

    this._stepPaddle(h);
    this._stepMagnet(h);
    this._stepItems(h);

    if (this.phase === 'serve') {
      b = this.ball;
      b.x = p.x; b.y = CONFIG.PADDLE_Y + b.r; b.px = p.px; b.py = b.y;
      this.serveT += h; this.zoneT += h;
      if (this.serveT >= CONFIG.AUTO_SERVE) this.serve();
    } else if (this.phase === 'play') {
      this.zoneT += h;
      b = this.ball;
      if (b.stuck) {
        b.x = p.x + b.stuckOff; b.y = CONFIG.PADDLE_Y + b.r;
        b.stuckT -= h;
        if (b.stuckT <= 0) this._release(true);
      } else {
        this.noBrickT += h;
        this._stepBall(h);
      }
    } else if (this.phase === 'clear') {
      this.clearT -= h;
      if (this.clearT <= 0) {
        this.level++;
        this._startZone();
        this._emit({ type: 'levelUp', level: this.level, zone: this.zone, loop: this.loop });
      }
    }
    this._updateFace();
  };

  World.prototype._stepPaddle = function (h) {
    var C = CONFIG, p = this.paddle, vmax = C.PADDLE_SPEED;
    if (p.target !== null && p.target !== undefined) {
      var w = C.PADDLE_OMEGA;
      p.vx += (w * w * (p.target - p.x) - 2 * w * p.vx) * h;   // critically damped spring (semi-implicit Euler)
    } else {
      p.vx += (this.keyDir * vmax - p.vx) * M.min(1, C.KEY_RESP * h);
    }
    p.vx = clamp(p.vx, -vmax, vmax);
    p.x += p.vx * h;
    var hw = p.w / 2;
    if (p.x < hw) { p.x = hw; if (p.vx < 0) p.vx = 0; }
    if (p.x > C.FIELD_W - hw) { p.x = C.FIELD_W - hw; if (p.vx > 0) p.vx = 0; }
    if (p.cheer > 0) p.cheer = M.max(0, p.cheer - h);
    if (p.oops > 0) p.oops = M.max(0, p.oops - h);
    if (p.squash > 0) { p.squash *= M.exp(-C.SQUASH_RATE * h); if (p.squash < 0.005) p.squash = 0; }
  };

  World.prototype._updateFace = function () {
    var p = this.paddle;
    p.face = p.oops > 0 ? 'oops' : p.cheer > 0 ? 'cheer' : this.magnet.t > 0 ? 'magnet'
      : p.vx < -CONFIG.FACE_MOVE_V ? 'left' : p.vx > CONFIG.FACE_MOVE_V ? 'right' : 'idle';
  };

  // ---------------- magnet ----------------
  World.prototype._magnetOn = function (x, y) {
    var m = this.magnet;
    m.max = this.D.magnetT; m.t = m.max; m.warned = false;
    this._emit({ type: 'magnetGet', x: x, y: y, t: m.t });
  };
  World.prototype._stepMagnet = function (h) {
    var m = this.magnet, C = CONFIG;
    if (m.t <= 0) return;
    if (this.phase === 'over') { m.t = 0; return; }
    var before = m.t;
    m.t = M.max(0, m.t - h);
    if (before > C.MAGNET_WARN && m.t <= C.MAGNET_WARN) this._emit({ type: 'magnetWarn' });
    if (m.t <= 0) {
      this._emit({ type: 'magnetEnd' });
      if (this.ball && this.ball.stuck) this._release(true);   // never leave the pearl glued on
    }
  };

  // ---------------- gems + magnet bubbles ----------------
  World.prototype._spawnGem = function (x, y) {
    var C = CONFIG, r = this.rng;
    var g = { id: this._id++, x: x, y: y, px: x, py: y, vx: 0, vy: C.GEM_POP, rot: 0,
      spin: r.sign() * r.range(C.GEM_SPIN[0], C.GEM_SPIN[1]), color: r.int(0, 2), pulled: false, age: 0,
      swayA: r.range(C.GEM_SWAY[0], C.GEM_SWAY[1]), swayW: r.range(C.GEM_SWAY_W[0], C.GEM_SWAY_W[1]),
      ph: r.range(0, 6.283), swayK: 1, fall: C.GEM_FALL };
    this.gems.push(g);
    this._emit({ type: 'gemSpawn', id: g.id, x: x, y: y, color: g.color });
  };
  World.prototype._spawnBubble = function (x, y) {
    var C = CONFIG, r = this.rng;
    var u = { id: this._id++, x: x, y: y, px: x, py: y, vx: 0, vy: C.BUBBLE_POP, wob: r.range(0, 6.283), age: 0,
      swayA: C.BUBBLE_SWAY, swayW: C.BUBBLE_SWAY_W, ph: r.range(0, 6.283), swayK: 1, fall: C.BUBBLE_FALL, pulled: false };
    this.powerups.push(u);
    this._emit({ type: 'magnetSpawn', id: u.id, x: x, y: y });
  };

  /** one item step: gravity + linear drag to its terminal speed and a sway; or the magnet's pull. Returns nothing. */
  World.prototype._moveItem = function (it, h) {
    var C = CONFIG, p = this.paddle, k = C.GEM_G / it.fall;
    it.age += h;
    var pulled = false;
    if (this.magnet.t > 0 && this.phase !== 'over') {
      var dx = p.x - it.x, dy = C.MAGNET_CY - it.y, d = M.sqrt(dx * dx + dy * dy);
      if (d < C.MAGNET_RANGE && d > 1e-6) {
        pulled = true;
        it.vx += (C.MAGNET_ACC * dx / d - C.MAGNET_DRAG * it.vx) * h;
        it.vy += (C.MAGNET_ACC * dy / d - C.MAGNET_DRAG * it.vy) * h;
        var s = M.sqrt(it.vx * it.vx + it.vy * it.vy);
        if (s > C.MAGNET_VMAX) { it.vx *= C.MAGNET_VMAX / s; it.vy *= C.MAGNET_VMAX / s; }
      }
    }
    if (!pulled) {
      it.vy += (-C.GEM_G - k * it.vy) * h;     // gravity + drag → terminal −fall
      it.vx += (-k * it.vx) * h;               // left-over sideways speed (after a pull) dies away
    }
    it.pulled = pulled;
    // the sway fades out while pulled (0.25 s) and back in after
    it.swayK = clamp(it.swayK + (pulled ? -4 : 2) * h, 0, 1);
    var sway = it.swayK * it.swayA * M.sin(it.swayW * it.age + it.ph);
    it.x = clamp(it.x + (it.vx + sway) * h, 0.3, C.FIELD_W - 0.3);
    it.y += it.vy * h;
  };

  World.prototype._inCatch = function (it) {
    var C = CONFIG, p = this.paddle;
    return M.abs(it.x - p.x) <= p.w / 2 + C.CATCH_PAD && it.y >= C.CATCH_BOT && it.y <= C.CATCH_TOP && this.phase !== 'over';
  };

  World.prototype._stepItems = function (h) {
    var C = CONFIG, p = this.paddle, i;
    for (i = this.gems.length - 1; i >= 0; i--) {
      var g = this.gems[i];
      this._moveItem(g, h);
      g.rot += g.spin * h * (g.pulled ? 2.5 : 1);
      if (this._inCatch(g)) {
        this.gems.splice(i, 1);
        this.gemCount++; this.stats.gems++;
        this._addScore(C.PTS.gem);
        p.cheer = M.max(p.cheer, C.CHEER_T);
        this._emit({ type: 'gemCatch', x: g.x, y: g.y, pts: C.PTS.gem, count: this.gemCount, color: g.color });
        if (this.gemCount % C.GEMS_PER_HEART === 0) this._gainHeart('gems');
        continue;
      }
      if (g.y < C.ITEM_LOST_Y) {
        this.gems.splice(i, 1);
        this.stats.gemsMissed++;
        this._emit({ type: 'gemMiss', x: g.x });
      }
    }
    for (i = this.powerups.length - 1; i >= 0; i--) {
      var u = this.powerups[i];
      this._moveItem(u, h);
      u.wob += h * 5;
      if (this._inCatch(u)) {
        this.powerups.splice(i, 1);
        this.stats.magnets++;
        this._magnetOn(u.x, u.y);
        continue;
      }
      if (u.y < C.ITEM_LOST_Y) {
        this.powerups.splice(i, 1);
        this.stats.magnetsMissed++;
        this._emit({ type: 'magnetMiss', x: u.x });
      }
    }
  };

  World.prototype._gainHeart = function (why) {
    if (this.hearts >= this.maxHearts) return;
    this.hearts++;
    this._emit({ type: 'heartGain', hearts: this.hearts, why: why });
  };
  World.prototype._addScore = function (n) { this.score += n; };

  // ---------------- the pearl ----------------
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
    for (var k = 0; k < n && this.phase === 'play' && !b.stuck; k++) {
      var ox = b.x, oy = b.y;
      b.x += b.vx * hh; b.y += b.vy * hh;
      b.spin += b.vx * hh * 2.5;
      this._collideWalls(b);
      this._collideBricks(b);
      if (this.phase !== 'play') return;
      this._collidePaddle(b, ox, oy);
      if (b.stuck) return;
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
    var r = b.r, best = null, bestAxis = 0, bestPen = 0, bestD = 1e9, hits = [];
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
    if (broken) {
      if (k.kind === 'magnet') this._spawnBubble(k.x, k.y);
      else if (this.rng.chance(C.GEM_P[k.kind])) this._spawnGem(k.x, k.y);
      if (this.bricksLeft() === 0) this._zoneClear();
    }
  };

  World.prototype._zoneClear = function () {
    var C = CONFIG;
    var pts = C.PTS.clear + C.PTS.clearHeart * this.hearts;
    this._addScore(pts);
    this.stats.zoneTimes.push(+this.zoneT.toFixed(3));
    this._emit({ type: 'levelClear', zone: this.zone, pts: pts, time: this.zoneT });
    this._gainHeart('zone');
    this.phase = 'clear'; this.clearT = C.CLEAR_T; this.ball = null; this.combo = 0;
    this.paddle.cheer = C.CLEAR_CHEER_T;
    // falling gems and bubbles stay catchable during the descend; whatever is left goes with the old zone
  };

  World.prototype._collidePaddle = function (b, ox, oy) {
    var C = CONFIG, p = this.paddle, line = C.PADDLE_Y + b.r;
    if (b.vy >= 0 || oy < line || b.y >= line) return;
    var t = (oy - line) / (oy - b.y), xc = ox + (b.x - ox) * t;   // where the pearl's bottom crossed the bounce line
    var reach = p.w / 2 + b.r;
    if (M.abs(xc - p.x) > reach) return;
    var off = clamp((xc - p.x) / reach, -1, 1);
    this.lifeHits++; this.stats.paddleHits++;
    this.combo = 0;
    p.squash = 1;
    if (this.magnet.t > C.STICK_MIN_T) {          // the magnet: the pearl sticks where it landed
      b.stuck = true; b.onPaddle = true; b.stuckT = C.STICK_T;
      b.stuckOff = clamp(xc - p.x, -p.w / 2, p.w / 2);
      b.x = p.x + b.stuckOff; b.y = line; b.vx = 0; b.vy = 0;
      this.stats.catches++;
      this._emit({ type: 'stick', x: b.x, y: C.PADDLE_Y });
      return;
    }
    var ang = off * C.MAX_ANGLE + clamp(p.vx * C.NUDGE_K, -C.NUDGE_MAX, C.NUDGE_MAX);
    if (this.noBrickT > C.ANTI_STALL) {   // steer toward the nearest block: 50 % at ANTI_STALL, growing to 100 % at 2×
      var tgt = this._nearestBrickAngle(xc, line);
      var kk = M.min(1, 0.5 + 0.5 * (this.noBrickT - C.ANTI_STALL) / C.ANTI_STALL);
      if (tgt !== null) ang = (1 - kk) * ang + kk * tgt;
    }
    ang = clamp(ang, -C.MAX_ANGLE, C.MAX_ANGLE) * DEG;
    b.speed = this._speed();
    b.vx = b.speed * M.sin(ang); b.vy = b.speed * M.cos(ang);
    b.y = line + (line - b.y);
    this._normalize(b);
    this._emit({ type: 'paddle', x: xc, y: C.PADDLE_Y, off: off });
  };

  /* Angle (°, from vertical) that sends the pearl at the nearest block's underside. Out of reach (> MAX_ANGLE)?
   * Bank it off the near wall (aim at the mirror image); still out of reach → a random 18–54° toward it, because a
   * fixed angle can lock a steady player into a periodic orbit (fork playtest: a 175 s stall on a corner block). */
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
      var a = this.rng.range(5, 25) * (b.x < 8 ? 1 : -1) * DEG;   // the moonbeam flicks it back up, toward the middle
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
      if (this.magnet.t > 0) { this.magnet.t = 0; this._emit({ type: 'magnetEnd' }); }
      this._emit({ type: 'gameOver', score: this.score });
    } else {
      this._toServe();
    }
  };

  World.prototype.getState = function () {
    var b = this.ball;
    return {
      phase: this.phase, level: this.level, zone: this.zone, loop: this.loop, score: this.score, hearts: this.hearts,
      gemCount: this.gemCount, bricksLeft: this.bricksLeft(),
      ball: b ? { x: +b.x.toFixed(4), y: +b.y.toFixed(4), vx: +b.vx.toFixed(4), vy: +b.vy.toFixed(4), speed: +b.speed.toFixed(4),
        stuck: !!b.stuck } : null,
      paddle: { x: +this.paddle.x.toFixed(4), w: this.paddle.w },
      magnet: +this.magnet.t.toFixed(3), gems: this.gems.length, powerups: this.powerups.length, time: +this.time.toFixed(4)
    };
  };

  WRB.World = World;
})(window.WRB = window.WRB || {});
