/* Mochi's Fairy Bounce — MFB.Bot: autopilot for tests, the title demo and the high-speed playtest (DESIGN §5)
 *
 *   var bot = new MFB.Bot(world, { skill: 0.8, seed: 3 });
 *   bot.step(dt);   // call once per frame before world.update(dt); uses only world.setPaddleTarget() / world.serve()
 *
 * How it plays:
 *  - every `react` seconds it re-plans (skill 1: 0.04 s, skill 0: 0.44 s — a late, slow 5-year-old);
 *  - it predicts where the ball's centre reaches the bounce line (y 1.35 + r), folding the path at the side walls
 *    (and the ceiling when the ball is still going up — blocks are ignored, so early plans are rough and get better);
 *  - it picks a target block (the lowest living block of a column, i.e. one the ball can reach) and the hit offset
 *    that sends the ball toward it (off = angle / 60°, scaled by skill), plus a hand error σ that grows as skill drops;
 *  - while the ball is far away it grabs falling stars it can reach and come back from in time, and steps aside
 *    from a pillow that would land on it (only when that still leaves time to get back under the ball);
 *  - it serves after a short random delay (longer when skill is low).
 * Deterministic: its own MFB.RNG, never the global random source.
 */
(function (MFB) {
  'use strict';
  var M = Math;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new MFB.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.t = 0; this.nextPlan = 0; this.serveWait = -1;
    this.err = 0; this.aimOff = 0; this.lastVySign = 0; this.targetBrick = null;
    this.planX = world.paddle.x; this.mode = 'idle';
  }

  Bot.prototype.react = function () { return 0.04 + 0.4 * (1 - this.skill); };
  Bot.prototype.jitter = function () { return 0.04 + 0.9 * M.pow(1 - this.skill, 1.3); };

  /** where (x) and when (t, s) the ball centre reaches the bounce line, walls folded; null if not in play */
  Bot.prototype.predict = function () {
    var w = this.world, b = w.ball, C = MFB.World.CONFIG;
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
    var C = MFB.World.CONFIG, p = this.world.paddle;
    var v = C.PADDLE_SPEED * (p.sleepy > 0 ? C.SLEEPY_SPEED_K : 1);
    return M.abs(to - from) / v + 0.18;    // + the spring's settle time
  };

  Bot.prototype.step = function (dt) {
    var w = this.world, C = MFB.World.CONFIG, p = w.paddle;
    this.t += dt;
    if (w.phase === 'serve') {
      if (this.serveWait < 0) this.serveWait = this.t + this.rng.range(0.25, 0.5 + 1.2 * (1 - this.skill));
      if (this.t >= this.serveWait) { w.serve(); this.serveWait = -1; }
    } else this.serveWait = -1;
    if (this.t < this.nextPlan) return;
    this.nextPlan = this.t + this.react();

    var b = w.ball, pred = this.predict(), x = this.planX, reach = p.w / 2 + C.BALL_R;
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
      x = pred.x - off * reach + this.err;
      this.mode = 'ball';
      var tBall = pred.t;
      if (b.vy > 0) {                               // going up: the lowest block may turn it back early (be safe)
        var yLow = C.CEIL - C.BALL_R;
        for (var q = 0; q < w.bricks.length; q++) if (w.bricks[q].alive) yLow = M.min(yLow, w.bricks[q].y - w.bricks[q].h / 2 - C.BALL_R);
        if (b.y < yLow) tBall = M.min(tBall, (yLow - b.y) / b.vy + (yLow - line) / b.vy);
        else tBall = 0.3;
      }
      // stars: grab one if there is time to come back
      if (this.skill > 0.2) {
        for (var i = 0; i < w.stars.length; i++) {
          var s = w.stars[i], ts = (s.y - 1.0) / C.STAR_FALL;
          if (ts < 0) continue;
          if (this._travel(p.x, s.x) < ts && ts + this._travel(s.x, x) < tBall - 0.15) { x = s.x; this.mode = 'star'; break; }
        }
      }
      x = this._dodge(x, tBall);
    } else {
      // serve / clear / over: catch stars, otherwise drift to the middle
      x = C.FIELD_W / 2;
      var best = null, bt = 1e9;
      for (var j = 0; j < w.stars.length; j++) {
        var st = w.stars[j], tt = (st.y - 1.0) / C.STAR_FALL;
        if (tt > 0 && tt < bt && this._travel(p.x, st.x) < tt + 0.3) { bt = tt; best = st; }
      }
      if (best) { x = best.x; this.mode = 'star'; }
      if (w.phase === 'serve') x = this._dodge(x, 99);
    }
    this.planX = x;
    w.setPaddleTarget(x);
  };

  Bot.prototype._dodge = function (x, tBall) {
    var w = this.world, C = MFB.World.CONFIG, p = w.paddle;
    if (this.skill < 0.35) return x;
    for (var i = 0; i < w.pillows.length; i++) {
      var pl = w.pillows[i], tp = (pl.y - C.PILLOW_HIT_TOP) / M.max(1.5, -pl.vy);
      if (tp < 0 || tp > 2.5) continue;
      var danger = p.w / 2 + C.PILLOW_R + 0.25;
      if (M.abs(pl.landX - x) > danger) continue;
      var dl = pl.landX - danger - 0.2, dr = pl.landX + danger + 0.2, hw = p.w / 2;
      var opts = [];
      if (dl >= hw) opts.push(dl);
      if (dr <= C.FIELD_W - hw) opts.push(dr);
      opts.sort(function (a, b) { return M.abs(a - x) - M.abs(b - x); });
      for (var k = 0; k < opts.length; k++) {
        if (this._travel(p.x, opts[k]) < tp && tp + 0.4 + this._travel(opts[k], x) < tBall) { this.mode = 'dodge'; return opts[k]; }
      }
    }
    return x;
  };

  MFB.Bot = Bot;
})(window.MFB = window.MFB || {});
