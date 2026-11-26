/* Wisp's Rooftop Bounce — WRB.Bot: autopilot for tests, the title demo and the high-speed playtest (DESIGN §5)
 *
 *   var bot = new WRB.Bot(world, { skill: 0.8, seed: 3 });
 *   bot.step(dt);   // call once per frame before world.update(dt); uses only world.setPaddleTarget() / world.serve()
 *
 * How it plays:
 *  - every `react` seconds it re-plans (skill 1: 0.04 s, skill 0: 0.44 s — a late, slow young child);
 *  - it predicts where the pearl's centre reaches the bounce line (y 1.35 + r), folding the path at the side walls
 *    (and the ceiling when the pearl is still going up — blocks are ignored, so early plans are rough and get better);
 *  - it picks a target block (the lowest living block of a column, i.e. one the pearl can reach) and the hit offset
 *    that sends the pearl toward it (off = angle / 60°, scaled by skill), plus a hand error σ that grows as skill drops;
 *  - while the pearl is far away it grabs falling gems and magnet bubbles it can reach and come back from in time
 *    (bubbles first: the magnet makes everything easier);
 *  - while the pearl is stuck (magnet), it slides Wisp so the launch line (the angle for the stuck offset) points at a
 *    target block, then taps to release — after a short skill-based pause, always before the auto-release;
 *  - it serves after a short random delay (longer when skill is low).
 * Deterministic: its own WRB.RNG, never the global random source.
 */
(function (WRB) {
  'use strict';
  var M = Math;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new WRB.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.t = 0; this.nextPlan = 0; this.serveWait = -1;
    this.err = 0; this.lastVySign = 0; this.targetBrick = null;
    this.aim = null;                       // while stuck: { x: paddle goal, until: give-up time }
    this.planX = world.paddle.x; this.mode = 'idle';
  }

  Bot.prototype.react = function () { return 0.04 + 0.4 * (1 - this.skill); };
  Bot.prototype.jitter = function () { return 0.04 + 0.9 * M.pow(1 - this.skill, 1.3); };

  /** where (x) and when (t, s) the pearl centre reaches the bounce line, walls folded; null if not in flight */
  Bot.prototype.predict = function () {
    var w = this.world, b = w.ball, C = WRB.World.CONFIG;
    if (!b || b.onPaddle || w.phase !== 'play') return null;
    var r = b.r, line = C.PADDLE_Y + r, x = b.x, y = b.y, vx = b.vx, vy = b.vy, t = 0;
    if (vy > 0) { var t1 = (C.CEIL - r - y) / vy; x += vx * t1; t += t1; y = C.CEIL - r; vy = -vy; }
    if (y < line) return { x: fold(x, r, C.FIELD_W - r), t: 0 };
    var t2 = (y - line) / -vy; x += vx * t2; t += t2;
    return { x: fold(x, r, C.FIELD_W - r), t: t };
  };
  function fold(x, a, b) {
    var L = b - a, u = (x - a) % (2 * L);
    if (u < 0) u += 2 * L;
    return a + (u <= L ? u : 2 * L - u);
  }
  Bot.fold = fold;

  Bot.prototype._pickTarget = function () {
    var w = this.world, low = {}, list = [];
    for (var i = 0; i < w.bricks.length; i++) {
      var k = w.bricks[i];
      if (!k.alive) continue;
      if (!low[k.col] || k.y < low[k.col].y) low[k.col] = k;
    }
    for (var c in low) list.push(low[c]);
    if (!list.length) return null;
    return this.rng.pick(list);
  };

  Bot.prototype._travel = function (from, to) {
    return M.abs(to - from) / WRB.World.CONFIG.PADDLE_SPEED + 0.18;    // + the spring's settle time
  };

  /** time until an item's centre falls into the catch band (≈ y 1.0) at its terminal speed */
  function fallT(it, C) { return (it.y - 1.0) / (it.fall || C.GEM_FALL); }

  /** paddle x that makes a stuck pearl (offset `off`) fly at block k (direct or banked off a wall); null if none */
  Bot.prototype._aimFor = function (k) {
    var w = this.world, C = WRB.World.CONFIG, b = w.ball, p = w.paddle, r = C.BALL_R;
    var reach = p.w / 2 + r, off = clamp(b.stuckOff / reach, -1, 1);
    var ang = off * C.MAX_ANGLE * M.PI / 180, dy = k.y - k.h / 2 - r - (C.PADDLE_Y + r);
    var dx = M.tan(ang) * dy, hw = p.w / 2;
    var cands = [k.x, 2 * (C.FIELD_W - r) - k.x, 2 * r - k.x];   // direct, banked right, banked left
    for (var i = 0; i < cands.length; i++) {
      var px = cands[i] - dx - b.stuckOff;
      if (px >= hw && px <= C.FIELD_W - hw) return px;
    }
    return null;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world, C = WRB.World.CONFIG, p = w.paddle, b = w.ball;
    this.t += dt;
    if (w.phase === 'serve') {
      if (this.serveWait < 0) this.serveWait = this.t + this.rng.range(0.25, 0.5 + 1.2 * (1 - this.skill));
      if (this.t >= this.serveWait) { w.serve(); this.serveWait = -1; }
    } else this.serveWait = -1;

    // ---- the pearl is stuck on Wisp: aim, then let go ----
    if (b && b.stuck && w.phase === 'play') {
      if (!this.aim) {
        var x = null, tries = 0;
        while (x === null && tries++ < 6) { var k = this._pickTarget(); if (k) x = this._aimFor(k); }
        var wait = this.rng.range(0.15, 0.3 + 0.6 * (1 - this.skill));
        this.aim = { x: x === null ? p.x : x + this.rng.gauss() * 0.5 * this.jitter(), at: this.t + wait };
      }
      w.setPaddleTarget(this.aim.x); this.planX = this.aim.x; this.mode = 'aim';
      var there = M.abs(p.x - this.aim.x) < 0.15 && M.abs(p.vx) < 1.5;
      if ((there && this.t >= this.aim.at) || b.stuckT < 0.25) { w.serve(); this.aim = null; this.lastVySign = 1; }
      return;
    }
    this.aim = null;

    if (this.t < this.nextPlan) return;
    this.nextPlan = this.t + this.react();

    var pred = this.predict(), reach = p.w / 2 + C.BALL_R, gx = this.planX;
    this.mode = 'idle';
    if (pred) {
      var sign = b.vy < 0 ? -1 : 1;
      if (sign !== this.lastVySign) {           // a new approach: new target, new hand error
        this.lastVySign = sign;
        if (sign < 0) {
          this.err = this.rng.gauss() * this.jitter();
          this.targetBrick = this._pickTarget();
        }
      }
      var off = 0, line = C.PADDLE_Y + C.BALL_R;
      var tb = this.targetBrick;
      if (!tb || !tb.alive) tb = this.targetBrick = this._pickTarget();
      if (tb) {
        var ang = M.atan2(tb.x - pred.x, tb.y - line) * 180 / M.PI;
        off = clamp(ang / C.MAX_ANGLE, -0.8, 0.8) * (0.3 + 0.7 * this.skill);
      }
      if (w.magnet.t > C.STICK_MIN_T + 0.2) off = 0;   // it will stick anyway: just get under it, aim later
      gx = pred.x - off * reach + this.err;
      this.mode = 'ball';
      var tBall = pred.t;
      if (b.vy > 0) {                               // going up: the lowest block may turn it back early (be safe)
        var yLow = C.CEIL - C.BALL_R;
        for (var q = 0; q < w.bricks.length; q++) if (w.bricks[q].alive) yLow = M.min(yLow, w.bricks[q].y - w.bricks[q].h / 2 - C.BALL_R);
        if (b.y < yLow) tBall = M.min(tBall, (yLow - b.y) / b.vy + (yLow - line) / b.vy);
        else tBall = 0.3;
      }
      // items: grab one if there is time to come back (magnet bubbles first, then the soonest gem)
      if (this.skill > 0.2) {
        var items = w.powerups.concat(w.gems);
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.pulled) continue;                  // the magnet brings it anyway
          var ts = fallT(it, C);
          if (ts < 0) continue;
          if (this._travel(p.x, it.x) < ts && ts + this._travel(it.x, gx) < tBall - 0.15) { gx = it.x; this.mode = 'item'; break; }
        }
      }
    } else {
      // serve / clear / over: catch items, otherwise drift to the middle
      gx = w.phase === 'serve' ? p.x : C.FIELD_W / 2;
      var best = null, bt = 1e9, all = w.powerups.concat(w.gems);
      for (var j = 0; j < all.length; j++) {
        var st = all[j], tt = fallT(st, C);
        if (tt > -0.2 && tt < bt && this._travel(p.x, st.x) < tt + 0.3) { bt = tt; best = st; }
      }
      if (best) { gx = best.x; this.mode = 'item'; }
    }
    this.planX = gx;
    w.setPaddleTarget(gx);
  };

  WRB.Bot = Bot;
})(window.WRB = window.WRB || {});
