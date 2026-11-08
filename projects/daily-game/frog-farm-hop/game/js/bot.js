/* Clover's Farm Hop — FH.Bot: an autopilot that plays like a person (DESIGN §5.3)
 *
 *   var bot = new FH.Bot(world, { skill: 0.7, seed: 3 });
 *   bot.step(dt);          // call once per frame BEFORE world.update(dt); it only uses world.steer(-1|0|1)
 *   bot.stats              // {decisions, retargets, badPicks, noTarget, falls}
 *
 * Every 0.08 s it re-plans: for every landable platform it solves the gravity arc for the time T at which
 * Clover's feet come down through that platform's top (with the terminal-speed cap), predicts where a cart
 * will be at T, and tabulates how far left/right she can still get by T (full steer, walls and the current or
 * announced wind included). Reachable platforms are scored: height, + a one-hop look-ahead (how high she can
 * go from there), + springs, + fireflies near the way, − puffs (when there is a choice), − tight margins.
 * Steering is a "release-point" controller: hold toward the target until letting go (drag drift vx/drag +
 * wind drift) would stop her over it, with a dead zone.
 * Skill s ∈ [0, 1]: reaction delay (1 − s)·0.3 s on the steer output, aim noise (1 − s)·0.8 u (Gaussian, fixed per
 * target), and a (1 − s)·0.1 chance per decision of a bad pick (any platform in view, reachable or not).
 */
(function (FH) {
  'use strict';
  var M = Math;
  var PLAN = 0.08, SIM = 1 / 60, HORIZON = 3.0, APEX_MARGIN = 0.12;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 1 : +opts.skill, 0, 1);
    this.rng = new FH.RNG(opts.seed === undefined ? 1 : opts.seed);
    this.t = 0; this._planT = 0;
    this.target = null; this.noise = 0; this.nextX = null;
    this.queue = []; this.out = 0;
    this.stats = { decisions: 0, retargets: 0, badPicks: 0, noTarget: 0, falls: 0 };
    this._xl = []; this._xr = [];
    this._repeat = 0; this._lastPlat = 0; this._lastAir = 0;
  }

  /** time until the feet come DOWN through height py (null if the arc never gets there) */
  Bot.prototype._timeTo = function (py) {
    var C = FH.World.CONFIG, h = this.world.hero, g = C.g, vy = h.vy, y = h.y;
    var apex = vy > 0 ? y + vy * vy / (2 * g) : y;
    if (py > apex - APEX_MARGIN) return null;          // a top right at the apex is a coin flip: skip it
    var t = (vy + M.sqrt(M.max(0, vy * vy + 2 * g * (y - py)))) / g;
    if (vy - g * t < -C.maxFall) {                       // terminal speed reached on the way down
      var tc = (vy + C.maxFall) / g, yc = y + vy * tc - 0.5 * g * tc * tc;
      t = tc + M.max(0, (yc - py) / C.maxFall);
    }
    return t;
  };

  /** wind the bot expects over the next seconds: [{from, to, ax}] approximated as (start time, accel) */
  Bot.prototype._windPlan = function () {
    var w = this.world, W = w.wind;
    if (W.state === 'blow') return { start: 0, end: M.max(0, W.dur - W.t), a: W.dir * (W.ax || w._windAx()) * M.max(W.strength, 0.6) };
    if (W.state === 'warn' && this.skill > 0.3) return { start: M.max(0, W.dur - W.t) + 0.2, end: 99, a: W.dir * w._windAx() * 0.8 };
    return { start: 99, end: 99, a: 0 };
  };

  /** tabulate x(t) for full-left and full-right steering (same rules as World._stepHero, coarse step) */
  Bot.prototype._tabulate = function () {
    var w = this.world, C = FH.World.CONFIG, h = w.hero, wp = this._windPlan();
    var n = M.ceil(HORIZON / SIM), lo = C.heroR, hi = C.COLW - C.heroR;
    for (var s = -1; s <= 1; s += 2) {
      var x = h.x, vx = h.vx, arr = s < 0 ? this._xl : this._xr;
      arr.length = n + 1; arr[0] = x;
      for (var k = 1; k <= n; k++) {
        var t = k * SIM;
        if (h.rescueT > 0 && t < h.rescueT) { arr[k] = x; continue; }
        if (vx * s < C.maxVx) vx = s * M.min(C.maxVx, vx * s + C.accel * SIM);
        if (t >= wp.start && t <= wp.end) vx += wp.a * SIM;
        x += vx * SIM;
        if (x < lo) { x = lo; vx = 0; } else if (x > hi) { x = hi; vx = 0; }
        arr[k] = x;
      }
    }
  };
  Bot.prototype._xAt = function (arr, t) {
    var k = t / SIM, i = M.floor(k);
    if (i >= arr.length - 1) return arr[arr.length - 1];
    var f = k - i; return arr[i] * (1 - f) + arr[i + 1] * f;
  };

  Bot.prototype._candidates = function () {
    var w = this.world, C = FH.World.CONFIG, ps = w.platforms, out = [];
    var floor = w.camY - C.fallLine + 0.25;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!FH.World.landable(p) || p.y < floor) continue;
      var T = this._timeTo(p.y);
      if (T === null || T < 0.02 || T > HORIZON) continue;
      if (p.kind === 'puff' && T > C.puffT && p.state !== 'live') continue;
      var px = w.platXAt(p, T), half = p.w / 2 + C.landPad;
      var xl = this._xAt(this._xl, T), xr = this._xAt(this._xr, T);
      var inner = M.max(0.15, half - 0.3);
      var a = px - inner, b = px + inner;
      var reach = xr >= a && xl <= b;
      var slack = reach ? M.min(xr - a, b - xl) : 0;  // how much room to spare
      out.push({ p: p, T: T, px: px, half: half, reach: reach, slack: slack });
    }
    return out;
  };

  Bot.prototype._score = function (c, all) {
    var w = this.world, C = FH.World.CONFIG, p = c.p, s = 2 * p.y;
    // one-hop look-ahead: how high can she get from p?
    var best = 0, ps = w.platforms;
    c.nextX = null;
    for (var i = 0; i < ps.length; i++) {
      var q = ps[i]; if (q === p || !FH.World.landable(q)) continue;
      var dy = q.y - p.y; if (dy <= 0.2 || dy > 2.8) continue;
      if (M.abs(q.x - p.x) <= 0.9 * FH.World.reachX(dy) + (p.w + q.w) / 2 - 0.2 && dy > best) { best = dy; c.nextX = q.x; }
    }
    var spring = p.spring ? 1 : 0;
    s += 0.6 * best;
    if (spring) s += 3;
    if (p.kind === 'puff') {                          // avoid puffs only when there is a real alternative
      for (var a = 0; a < all.length; a++) if (all[a].p !== p && all[a].p.kind !== 'puff' && all[a].p.y >= p.y - 0.5) { s -= 1.2; break; }
    }
    if (p.id === w.hero.lastPlat) s -= 1.5 * this._repeat;   // bored of bouncing on the same spot: move on
    if (p.kind === 'rescue') s += 2;
    if (best === 0 && !spring) s -= 2.5;              // a dead end (nothing reachable above it)
    // fireflies between Clover and the landing point
    var fs = w.fireflies, h = w.hero, fb = 0;
    for (var j = 0; j < fs.length; j++) {
      var f = fs[j]; if (f.state !== 'live') continue;
      var lo = M.min(h.y, p.y) - 0.5, hi = M.max(h.y + M.max(0, h.vy * h.vy / (2 * C.g)), p.y + 3) + 0.5;
      if (f.y < lo || f.y > hi) continue;
      var u = clamp((f.y - h.y) / ((p.y - h.y) || 1), 0, 1), lx = h.x + (c.px - h.x) * u;
      if (M.abs(f.x - lx) < 1.0) fb += 0.25;
    }
    s += M.min(fb, 1.0);
    s += M.min(c.slack, 1.2) * 0.8 - 0.05 * M.abs(c.px - h.x);
    return s;
  };

  Bot.prototype._plan = function () {
    var w = this.world, r = this.rng, sk = this.skill;
    this.stats.decisions++;
    this._tabulate();
    var cs = this._candidates(), reach = [], i;
    for (i = 0; i < cs.length; i++) if (cs[i].reach) reach.push(cs[i]);
    var pick = null;
    if (cs.length && r.chance((1 - sk) * 0.1)) {        // a bad pick: whatever caught the eye
      pick = cs[r.int(cs.length)]; this.stats.badPicks++;
    } else if (reach.length) {
      var bestS = -1e9;
      for (i = 0; i < reach.length; i++) { reach[i].s = this._score(reach[i], reach); if (reach[i].s > bestS) { bestS = reach[i].s; pick = reach[i]; } }
      // keep the current target unless the new one is clearly better (no dithering)
      if (this.target && pick.p !== this.target) {
        for (i = 0; i < reach.length; i++) if (reach[i].p === this.target && reach[i].s > bestS - 0.5 && this.target.y >= pick.p.y - 0.3 && reach[i].slack > 0.15) { pick = reach[i]; break; }
      }
    } else if (cs.length) {                             // nothing reachable: go for the closest one
      var bd = 1e9;
      for (i = 0; i < cs.length; i++) { var d = M.abs(cs[i].px - w.hero.x) - cs[i].half; if (d < bd) { bd = d; pick = cs[i]; } }
    }
    if (!pick) { this.stats.noTarget++; this.target = null; return; }
    if (pick.p !== this.target) {
      this.stats.retargets++;
      this.target = pick.p;
      this.noise = r.gauss() * (1 - sk) * 0.8 * 0.5;    // sd = half the stated aim noise → |noise| ≲ (1−s)·0.8
    }
    this.nextX = pick.nextX === undefined ? null : pick.nextX;
  };

  Bot.prototype._control = function () {
    var w = this.world, C = FH.World.CONFIG, h = w.hero, p = this.target;
    if (!p || w.platforms.indexOf(p) < 0 || !FH.World.landable(p)) {
      this.target = null;
      return 0;
    }
    var T = this._timeTo(p.y); if (T === null) T = 0.3;
    var px = w.platXAt(p, T), tx = px;
    // aim at the side of the platform nearest the next hop (like a person walking to the edge of a step)
    if (this.nextX !== null && p.kind !== 'cart') {
      var room = M.max(0, p.w / 2 + C.landPad - 0.45);
      tx = clamp(this.nextX, px - room, px + room);
    }
    tx += this.noise;
    var W = w.wind, drift = 0;
    if (W.state === 'blow') drift = W.dir * (W.ax || 0) * W.strength / C.drag * M.min(T, M.max(0, W.dur - W.t));
    var xs = h.x + h.vx / C.drag + drift;               // where she ends up if she lets go now
    var err = tx - xs;
    var half = p.w / 2 + C.landPad, dead = clamp(half * 0.25, 0.1, 0.3);
    if (err > dead) return 1;
    if (err < -dead) return -1;
    return 0;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    dt = M.max(0, +dt || 0);
    this.t += dt;
    if (w.phase !== 'play') { w.steer(0); return; }
    var h = w.hero;
    if (h.airT === 0 || h.airT < this._lastAir) {        // a new bounce: count repeats on the same platform
      this._repeat = h.lastPlat === this._lastPlat ? this._repeat + 1 : 0; this._lastPlat = h.lastPlat;
    }
    this._lastAir = h.airT;
    this._planT -= dt;
    if (this._planT <= 0) { this._planT += PLAN; if (this._planT < 0) this._planT = PLAN; this._plan(); }
    var dir = this._control();
    var delay = (1 - this.skill) * 0.3;
    if (delay <= 0) this.out = dir;
    else {
      this.queue.push({ at: this.t + delay, dir: dir });
      while (this.queue.length && this.queue[0].at <= this.t) this.out = this.queue.shift().dir;
    }
    w.steer(this.out);
    this.stats.falls = w.stats.falls;
  };

  FH.Bot = Bot;
})(window.FH = window.FH || {});
