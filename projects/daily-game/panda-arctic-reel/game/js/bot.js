/* Bao's Arctic Reel — PR.Bot: a player model for autoplay, playtests and pacing sims.
 *
 *   var bot = new PR.Bot(world, { skill: 0.75, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Roam: picks the gem with the best value / time (time to reach its depth vs. time for
 * it to drift into the hole column + reel time), steers the hook with press/release
 * (with a braking lead), and dodges puffers whose path crosses the hole column soon.
 * Reel: predicts when the needle passes the zone centre and taps then, plus a reaction
 * floor and a Gaussian timing error; both grow as skill drops (skill 1 ≈ always Perfect).
 * Skill also controls how often it re-thinks, how far ahead it sees puffers and how
 * much margin it keeps.
 */
(function (PR) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new PR.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.t = 0;
    this._think = 0;
    this._targetY = null;
    this._targetId = 0;
    this._tapAt = -1;
    this._zoneSeen = -1;
    this._tapsSeen = -1;
    this._danger = null;
    this.stats = { taps: 0, presses: 0, dodges: 0, retargets: 0 };
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  // skill → model parameters
  Bot.prototype._react = function () { return 0.1 + 0.3 * (1 - this.skill); };          // s, reaction floor
  Bot.prototype._timingSd = function () { return 0.008 + 0.3 * M.pow(1 - this.skill, 1.5); }; // s, tap error
  Bot.prototype._thinkEvery = function () { return 0.06 + 0.3 * (1 - this.skill); };   // s, roam re-plan period
  Bot.prototype._lookahead = function () { return 0.5 + 1.3 * this.skill; };            // s, puffer foresight
  Bot.prototype._margin = function () { return 4 + 18 * this.skill; };                  // px, puffer clearance

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this.t += dt;
    if (w.phase === 'reel') { this._reel(dt); return; }
    this._tapAt = -1; this._tapsSeen = -1;
    if (w.phase !== 'roam') { if (w.hook.holding) w.release(); return; }
    this._think -= dt;
    if (this._think <= 0) { this._plan(); this._think = this._thinkEvery() * this.rng.range(0.7, 1.3); }
    this._steer();
  };

  // ---------------------------------------------------------------- reel
  Bot.prototype._reel = function () {
    var w = this.world, r = w.reel;
    if (w.hook.holding) w.release();
    if (r.taps !== this._tapsSeen) {          // new zone (or first): plan the next tap
      this._tapsSeen = r.taps;
      var react = this._react() * this.rng.range(0.8, 1.25);
      var tCross = this._nextCross(react);
      this._tapAt = this.t + tCross + this.rng.gauss() * this._timingSd();
      if (this._tapAt < this.t + 0.05) this._tapAt = this.t + 0.05;
    }
    if (this._tapAt >= 0 && this.t >= this._tapAt) {
      this._tapAt = -1;
      this.stats.taps++;
      w.press();
      w.release();
    }
  };

  /** Seconds (≥ from) until the needle next crosses the zone centre. */
  Bot.prototype._nextCross = function (from) {
    var w = this.world, z = w.reel.zone, h = 1 / 480, prev = w.needleAfter(from) - z;
    var end = from + 2.2 / M.max(0.1, w.reel.speed);
    for (var t = from + h; t < end; t += h) {
      var cur = w.needleAfter(t) - z;
      if (cur === 0 || (cur > 0) !== (prev > 0)) return t - h * M.abs(cur) / (M.abs(cur) + M.abs(prev));
      prev = cur;
    }
    return from;
  };

  // ---------------------------------------------------------------- roam
  Bot.prototype._plan = function () {
    var w = this.world, L = w.layout, hk = w.hook, d = w.diff, C = PR.CONFIG;
    var best = null, bestV = -1, bestY = 0;
    for (var i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      if (it.kind !== 'gem' || it.state !== 'swim') continue;
      var dx = L.holeX - it.x, reach = it.r + hk.r - 4;
      var approaching = (dx > 0) === (it.vx > 0);
      var tc = approaching ? M.max(0, (M.abs(dx) - reach) / M.abs(it.vx)) : (M.abs(dx) < reach ? 0 : -1);
      if (tc < 0) continue;
      var tWin = (M.abs(dx) + reach) / M.abs(it.vx);     // when it leaves the column
      var tMid = M.max(tc, M.min(tWin, M.abs(dx) / M.abs(it.vx)));
      var gy = it.by + M.sin(it.phase + it.bobRate * tMid) * it.bobAmp;
      var dist = gy - hk.y;
      var travel = M.abs(dist) / (dist > 0 ? d.sinkTerm : d.riseTerm) + 0.25 + this._react();
      if (travel > tWin) continue;                             // can't make it
      var depthFrac = (gy - L.waterTop) / (L.maxHookY - L.waterTop);
      var reelT = depthFrac * d.stepsFull * (0.9 / w.reel.speed + 0.2) + 0.8;
      var v = (C.points[it.type] || 10) / (M.max(tMid, travel) + reelT);
      if (it.id === this._targetId) v *= 1.15;                 // hysteresis: don't dither
      if (v > bestV) { bestV = v; best = it; bestY = gy; }
    }
    if (best) {
      if (best.id !== this._targetId) this.stats.retargets++;
      this._targetId = best.id;
      this._targetY = bestY;
    } else {
      this._targetId = 0;
      this._targetY = L.bands[0] + (L.bands[1] - L.bands[0]) * 0.5;  // wait in the shallows
    }
    this._targetY = clamp(this._targetY, L.minHookY, L.maxHookY);
    this._avoid();
  };

  Bot.prototype._avoid = function () {
    var w = this.world, L = w.layout, hk = w.hook;
    this._danger = null;
    var look = this._lookahead(), m = this._margin(), bands = [], i;
    for (i = 0; i < w.items.length; i++) {
      var p = w.items[i];
      if (p.kind !== 'puffer' || p.state !== 'swim' || p.leaving) continue;
      var dx = L.holeX - p.x, R = p.r + hk.r + m;
      var approaching = (dx > 0) === (p.vx > 0);
      if (!approaching && M.abs(dx) > R) continue;
      var tIn = M.max(0, (M.abs(dx) - R) / M.abs(p.vx));
      if (tIn > look) continue;
      bands.push({ top: p.by - p.bobAmp - R, bot: p.by + p.bobAmp + R, id: p.id });
    }
    if (!bands.length) return;
    function free(y) { for (var k = 0; k < bands.length; k++) if (y > bands[k].top && y < bands[k].bot) return false; return true; }
    function pathFree(y0, y1) {
      var lo = M.min(y0, y1), hi = M.max(y0, y1);
      for (var k = 0; k < bands.length; k++) if (!(hi <= bands[k].top || lo >= bands[k].bot)) return false;
      return true;
    }
    if (pathFree(hk.y, this._targetY)) return;               // plan is already safe
    this.stats.dodges++;
    var want = this._targetY, cands = [];
    for (i = 0; i < bands.length; i++) { cands.push(bands[i].top - 2, bands[i].bot + 2); }
    cands.push(L.minHookY, L.maxHookY, hk.y);
    var best = null, bestScore = 1e9;
    for (i = 0; i < cands.length; i++) {
      var y = clamp(cands[i], L.minHookY, L.maxHookY);
      if (!free(y)) continue;
      // reachable without crossing a band is best; otherwise just get out of the way fast
      var sc = pathFree(hk.y, y) ? M.abs(y - want) * 0.25 + M.abs(y - hk.y) : 10000 + M.abs(y - hk.y);
      if (sc < bestScore) { bestScore = sc; best = y; }
    }
    if (best === null) best = hk.y < (L.minHookY + L.maxHookY) / 2 ? L.minHookY : L.maxHookY;
    this._targetY = best;
    this._targetId = 0;
    this._danger = bands[0].id;
  };

  Bot.prototype._steer = function () {
    var w = this.world, hk = w.hook;
    if (this._targetY === null || hk.lost) { if (hk.holding) w.release(); return; }
    var lead = hk.y + hk.vy * 0.12;           // brake early: the hook has momentum
    var dead = 3 + 6 * (1 - this.skill);
    if (lead < this._targetY - dead) { if (!hk.holding) { w.press(); this.stats.presses++; } }
    else if (lead > this._targetY + dead) { if (hk.holding) w.release(); }
  };

  PR.Bot = Bot;
})(window.PR = window.PR || {});
