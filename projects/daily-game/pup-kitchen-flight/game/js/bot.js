/* Biscuit's Kitchen Flight — BKF.Bot autopilot (high-speed playtests + title-screen attract demo)
 *
 *   const bot = new BKF.Bot(world, { skill: 0..1, seed });
 *   bot.step(dt);   // call each frame BEFORE world.update(dt); may call world.flap()
 *   bot.stats       // { flaps, starts, decisions, lapses, time }
 *
 * Strategy: tiny model-predictive control. Every decision it simulates Biscuit ≈1.2 s ahead with the
 * world's own numbers (gravity, flapVy, wind, steam, the current hit shapes shifted by the scroll)
 * for two first moves — "tap now" and "don't tap now" — each followed by a simple height-holding
 * policy at several target heights. A plan that touches anything (or the counter) costs a lot (more
 * when sooner); leaves on the way are a reward; staying mid-room is a tiny preference. It taps when
 * the best "tap now" plan beats the best "wait" plan. Lower skill adds perception noise, a reaction
 * delay, a thinner safety margin and now-and-then lapses (looks away for a moment).
 */
(function (BKF) {
  'use strict';

  var YT = [100, 165, 230, 295, 360, 425];   // policy target heights (px, pup centre)
  var SOLID = { head: 1, handle: 1, chain: 1, stack: 1, kettle: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill === undefined ? 1 : clamp(opts.skill, 0, 1);
    this.rng = new BKF.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.startDelay = opts.startDelay === undefined ? 0.5 : opts.startDelay;
    this.horizon = opts.horizon || 1.2;    // s
    this.simStep = opts.simStep || 1 / 20;  // s (exact ballistic steps, so coarse is fine)
    this.thinkEvery = opts.thinkEvery || 1 / 20;   // s between decisions
    this.enabled = true;
    this.stats = { flaps: 0, starts: 0, decisions: 0, lapses: 0, time: 0 };
    this.reset();
  }

  Bot.prototype.reset = function () {
    this.time = 0;
    this._readyT = 0;
    this._pending = -1;
    this._distracted = 0;
    this._think = 0;
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled) return;
    var w = this.world;
    dt = dt || 0;
    this.time += dt; this.stats.time += dt;
    if (w.phase === 'ready') {
      this._readyT += dt;
      if (this._readyT >= this.startDelay) { this._readyT = 0; if (w.flap()) { this.stats.starts++; this.stats.flaps++; } }
      return;
    }
    this._readyT = 0;
    if (w.phase !== 'playing') { this._pending = -1; return; }

    if (this._pending >= 0) {
      if (this.time >= this._pending) { this._pending = -1; if (w.flap()) this.stats.flaps++; }
      return;
    }
    var k = 1 - this.skill;
    if (this._distracted > 0) { this._distracted -= dt; return; }
    if (k > 0 && this.rng.chance(k * 0.15 * dt)) { this._distracted = k * this.rng.range(0.25, 0.7); this.stats.lapses++; return; }

    // think 20 times a second (plenty: a child reacts in 0.2–0.4 s)
    this._think -= dt;
    if (this._think > 0) return;
    this._think += this.thinkEvery;
    if (this._think < 0) this._think = 0;
    this.stats.decisions++;
    var delay = k > 0 ? k * (0.04 + 0.12 * this.rng.next()) : 0;   // reaction delay, known to the planner
    if (this._decide(k, delay)) {
      if (delay <= 0) { if (w.flap()) this.stats.flaps++; }
      else this._pending = this.time + delay;
    }
  };

  Bot.prototype._decide = function (k, delay) {
    var w = this.world, c = w.cfg, p = w.pup;
    var speed = Math.max(w.scrollSpeed, 1);
    var reach = speed * this.horizon + 120;
    var all = w.hitShapes(), shapes = [], leaves = [], kettles = [], i, s;
    for (i = 0; i < all.length; i++) {
      s = all[i];
      var sx = s.kind === 'seg' ? Math.min(s.x1, s.x2) : s.x;
      var ex = s.kind === 'seg' ? Math.max(s.x1, s.x2) : s.kind === 'rect' ? s.x + s.w : s.x;
      var rad = s.r || 0;
      if (ex + rad < p.x - 70 || sx - rad > p.x + reach) continue;
      if (SOLID[s.tag]) { s._x0 = sx - rad; s._x1 = ex + rad; shapes.push(s); }
      else if (s.tag === 'leaf') leaves.push(s);
    }
    for (i = 0; i < w.obstacles.length; i++) if (w.obstacles[i].kind === 'kettle') kettles.push(w.obstacles[i]);
    var noise = k > 0 ? this.rng.gauss() * 12 * k : 0;
    var ctx = {
      w: w, c: c, speed: speed, shapes: shapes, leaves: leaves, kettles: kettles,
      y0: p.y + noise, vy0: p.vy, x0: p.x, since0: w.sinceFlap,
      r: c.pupR - c.hitForgive, margin: 8, gy: w.wind.gy, steamDamp: Math.exp(-c.steamDrag * this.simStep), firstAt: Math.round((delay || 0) / this.simStep),
      nextAt: Math.round((delay || 0) / this.simStep) + Math.max(1, Math.round(this.thinkEvery / this.simStep)), taken: new Array(leaves.length)
    };
    var bestNo = 1e18, bestYes = 1e18;
    for (i = 0; i < YT.length; i++) {
      bestNo = Math.min(bestNo, this._sim(ctx, false, YT[i]));
      bestYes = Math.min(bestYes, this._sim(ctx, true, YT[i]));
    }
    return bestYes < bestNo - 0.5;
  };

  /** Cost of a plan: first move (tap or not), then "tap whenever below yT and not rising". */
  Bot.prototype._sim = function (ctx, first, yT) {
    var c = ctx.c, h = this.simStep, N = Math.ceil(this.horizon / h), T = this.horizon;
    var y = ctx.y0, vy = ctx.vy0, since = ctx.since0, cost = 0, r = ctx.r, i, j;
    var base = c.counterY - 120, taken = ctx.taken;
    for (j = 0; j < taken.length; j++) taken[j] = false;
    for (i = 0; i < N; i++) {
      var t = i * h;
      if ((i === ctx.firstAt && first) || (i >= ctx.nextAt && y > yT && vy > -80 && since > 0.2)) { vy = c.flapVy; since = 0; }
      var X = ctx.x0 + ctx.speed * (t + h);
      var a = c.gravity + ctx.gy;
      for (j = 0; j < ctx.kettles.length; j++) {
        var o = ctx.kettles[j];
        if (Math.abs(X - o.x) > c.steamHalfW + c.pupR * 0.5) continue;
        var hg = base - y;
        if (hg < -c.pupR || hg > o.steamH) continue;
        var f = 1 - clamp(hg, 0, o.steamH) / o.steamH;
        a -= c.steamLift * (c.steamFadePow === 1 ? f : Math.pow(f, c.steamFadePow));
        vy *= ctx.steamDamp;
      }
      // exact for constant accel, plus the world's semi-implicit Euler bias (a·step·h/2)
      var vn = clamp(vy + a * h, -c.maxRise, c.maxFall);
      y += (vn === vy + a * h) ? vy * h + 0.5 * a * h * h + 0.5 * a * c.step * h : 0.5 * (vy + vn) * h;
      vy = vn;
      since += h;
      if (y - c.pupR < c.ceilingY) { y = c.ceilingY + c.pupR; if (vy < 0) vy = 0; }
      if (y + c.pupR > c.counterY - 2) { cost += 1000 * (2 - t / T); break; }
      var cl = this._clear(ctx.shapes, X, y, r);
      if (cl < 0) { cost += 1000 * (2 - t / T) - cl; break; }           // touching: big, sooner = worse
      if (cl < ctx.margin) cost += (ctx.margin - cl) * 6;                 // inside the safety margin: soft
      for (j = 0; j < ctx.leaves.length; j++) {
        if (taken[j]) continue;
        var L = ctx.leaves[j], dx = L.x - X, dy = L.y - y, R = c.pupR + c.leafR;
        if (dx > R || dx < -R) continue;
        if (dx * dx + dy * dy < R * R) { taken[j] = true; cost -= 30 * (1 - 0.5 * t / T); }
      }
      cost += 0.01 * Math.abs(y - 285);
    }
    return cost;
  };

  /** Smallest clearance (px) between Biscuit's circle (radius r) at (X,y) and any shape; < 0 = touching. */
  Bot.prototype._clear = function (shapes, X, y, r) {
    var best = 1e9;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i], dx, dy, d;
      if (X + r + 16 < s._x0 || X - r - 16 > s._x1) continue;   // far away in x: cheap reject
      if (s.kind === 'circle') {
        dx = X - s.x; dy = y - s.y; d = Math.sqrt(dx * dx + dy * dy) - s.r - r;
      } else if (s.kind === 'rect') {
        dx = X - clamp(X, s.x, s.x + s.w); dy = y - clamp(y, s.y, s.y + s.h); d = Math.sqrt(dx * dx + dy * dy) - r;
      } else {
        var ex = s.x2 - s.x1, ey = s.y2 - s.y1, L2 = ex * ex + ey * ey;
        var u = L2 > 0 ? clamp(((X - s.x1) * ex + (y - s.y1) * ey) / L2, 0, 1) : 0;
        dx = X - (s.x1 + ex * u); dy = y - (s.y1 + ey * u); d = Math.sqrt(dx * dx + dy * dy) - s.r - r;
      }
      if (d < best) best = d;
    }
    return best;
  };

  BKF.Bot = Bot;
})(window.BKF = window.BKF || {});
