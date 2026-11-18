/* Taffy's Candy Reel — PR.Bot: a player model for autoplay, playtests and pacing sims (DESIGN §5.3).
 *
 *   var bot = new PR.Bot(world, { skill: 0.75, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Roam: for each drifting flake it predicts WHERE and WHEN the flake (pushed by the wind
 * current) meets the wind-swayed hook column (hook x = holeX + wind·driftMax·depthFrac, with
 * the wind eased toward its target, or toward the announced gust), picks the best value / time
 * and steers the depth with press/release (with a braking lead). Sour gummies whose path
 * crosses the hook's column soon block a depth band; the bot never crosses a blocked band.
 * Reel: predicts when the needle passes the zone centre and taps then, plus a reaction floor
 * and a Gaussian timing error; both grow as skill drops (skill 1 ≈ always Perfect).
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
    this._tapsSeen = -1;
    this._danger = null;
    this.stats = { taps: 0, presses: 0, dodges: 0, retargets: 0 };
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  // skill → model parameters
  Bot.prototype._react = function () { return 0.1 + 0.3 * (1 - this.skill); };          // s, reaction floor
  Bot.prototype._timingSd = function () { return 0.008 + 0.3 * M.pow(1 - this.skill, 1.5); }; // s, tap error
  Bot.prototype._thinkEvery = function () { return 0.06 + 0.3 * (1 - this.skill); };   // s, roam re-plan period
  Bot.prototype._lookahead = function () { return 0.6 + 1.6 * this.skill; };            // s, gummy foresight
  Bot.prototype._margin = function () { return 4 + 18 * this.skill; };                  // px, gummy clearance

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

  // ---------------------------------------------------------------- wind prediction
  /** Wind value expected `t` s from now: critically damped ease toward the target, or toward the
   *  announced gust (warnDir, average magnitude) once it arrives. What a player reads off the windsock. */
  Bot.prototype._windAt = function (t) {
    var w = this.world, wd = w.wind, C = PR.CONFIG, w0 = C.windOmega;
    var v = wd.value, tgt = wd.target;
    if (wd.warn > 0 && t > wd.next) {
      var gm = 0.5 * (C.gustMag[0] + C.gustMag[1]) * wd.strength;
      var a = M.max(0, wd.next), e1 = M.exp(-w0 * a) * (1 + w0 * a);
      v = tgt + (v - tgt) * e1;              // where the old ease got to when the gust hits
      tgt = wd.warnDir * gm; t -= a;
    }
    var e = M.exp(-w0 * t) * (1 + w0 * t);
    return tgt + (v - tgt) * e;
  };
  /** Sample the predicted wind every MEET_DT s up to MEET_T (once per plan; keeps the bot cheap). */
  var MEET_DT = 0.1, MEET_N = 120;
  Bot.prototype._sampleWind = function () {
    var ws = this._ws || (this._ws = new Array(MEET_N + 1));
    for (var k = 0; k <= MEET_N; k++) ws[k] = this._windAt(k * MEET_DT);
  };
  /** When does `it` (travelling at depth y) meet the wind-swayed hook column? → {tIn, tMid, tOut} or null. */
  Bot.prototype._meet = function (it, y, reach) {
    var w = this.world, L = w.layout, C = PR.CONFIG, ws = this._ws;
    var room = M.max(0, L.holeX - C.screenPad), df = w.depthFrac(y), dm = w.driftMax() * df;
    var k = w.current() * (1 - 0.5 * df), lo = M.abs(it.vx) * C.minOwnSpeed, dir = it.vx >= 0 ? 1 : -1;
    var x = it.x, tIn = -1, tOut = -1;
    for (var j = 0; j <= MEET_N; j++) {
      var hx = L.holeX + clamp(ws[j] * dm, -room, room);
      var rel = (x - hx) * dir;                           // < 0: still before the hook
      if (tIn < 0) { if (rel >= -reach) tIn = j * MEET_DT; }
      if (rel > reach) { tOut = j * MEET_DT; break; }
      var v = it.vx + ws[j] * k;                          // current from the predicted wind
      v = dir > 0 ? M.max(v, lo) : M.min(v, -lo);
      x += v * MEET_DT;
    }
    if (tIn < 0) return null;
    if (tOut < 0) tOut = MEET_N * MEET_DT;
    if (tOut <= tIn) return null;
    return { tIn: tIn, tOut: tOut, tMid: 0.5 * (tIn + tOut) };
  };

  // ---------------------------------------------------------------- roam
  Bot.prototype._plan = function () {
    var w = this.world, L = w.layout, hk = w.hook, d = w.diff, C = PR.CONFIG;
    var best = null, bestV = -1, bestY = 0;
    this._sampleWind();
    for (var i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      if (it.kind !== 'flake' || it.state !== 'swim') continue;
      var reach = it.r + hk.r - 6;
      var m = this._meet(it, it.by, reach);
      if (!m) continue;
      var gy = it.by + M.sin(it.phase + it.bobRate * m.tMid) * it.bobAmp;
      var dist = gy - hk.y;
      var travel = M.abs(dist) / (dist > 0 ? d.sinkTerm : d.riseTerm) + 0.25 + this._react();
      if (travel > m.tOut - 0.1) continue;                     // can't make it
      var depthFrac = (gy - L.waterTop) / (L.maxHookY - L.waterTop);
      var reelT = depthFrac * d.stepsFull * (0.9 / w.reel.speed + 0.2) + 0.8;
      var v = (C.points[it.type] || 10) / (M.max(m.tMid, travel) + reelT);
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

  /** Gummy avoidance in space AND time. Each gummy that will cross the (swayed) hook column within the
   *  foresight blocks a depth band [top, bot] during [tIn, tOut]. A plan is safe when the hook's
   *  straight trip to its target (at terminal speed) is never inside a band while that band is blocked. */
  Bot.prototype._avoid = function () {
    var w = this.world, L = w.layout, hk = w.hook, d = w.diff;
    this._danger = null;
    var look = this._lookahead(), m = this._margin(), bands = [], i;
    for (i = 0; i < w.items.length; i++) {
      var p = w.items[i];
      if (p.kind !== 'gummy' || p.state !== 'swim' || p.leaving) continue;
      var R = p.r + hk.r + m;
      var mt = this._meet(p, p.by, R);
      var near = M.abs(p.x - hk.x) < R + 8;
      if (!near && (!mt || mt.tIn > look)) continue;
      var bt = { tIn: near ? 0 : mt.tIn - 0.2, tOut: (mt ? mt.tOut : 1) + 0.2, id: p.id };
      var r0 = p.r + hk.r + 3;                // the real contact distance (+3 px), no comfort margin
      bands.push({ top: p.by - p.bobAmp - R, bot: p.by + p.bobAmp + R, tIn: bt.tIn, tOut: bt.tOut, id: p.id, hard: false });
      bands.push({ top: p.by - p.bobAmp - r0, bot: p.by + p.bobAmp + r0, tIn: bt.tIn, tOut: bt.tOut, id: p.id, hard: true });
    }
    if (!bands.length) return;
    var y0 = hk.y, v0 = hk.vy;
    function tAt(y, y1) {                     // when the hook (going y0 → y1) passes y
      var down = y1 > y0, rev = (down && v0 < -30) || (!down && v0 > 30);
      return M.abs(y - y0) / (down ? d.sinkTerm : d.riseTerm) + (rev ? 0.25 : 0.06);
    }
    function conflict(y1) {
      var c = 0, lo = M.min(y0, y1), hi = M.max(y0, y1);
      for (var k = 0; k < bands.length; k++) {
        var b = bands[k];
        if (hi <= b.top || lo >= b.bot) continue;          // never inside this band
        var inside0 = y0 > b.top && y0 < b.bot, inside1 = y1 > b.top && y1 < b.bot;
        var down = y1 > y0;
        var enter = inside0 ? 0 : tAt(down ? b.top : b.bot, y1);
        var exit = inside1 ? 1e9 : tAt(down ? b.bot : b.top, y1);
        var ov = M.min(exit, b.tOut) - M.max(enter, b.tIn);
        if (ov > 0) c += (M.min(ov, 5) + 1) * (b.hard ? 1000 : 1);   // touching ≫ just too close
      }
      return c;
    }
    if (conflict(this._targetY) === 0) return;               // plan is already safe
    this.stats.dodges++;
    var want = this._targetY, cands = [want, y0, L.minHookY, L.maxHookY];
    for (i = 0; i < bands.length; i++) cands.push(bands[i].top - 3, bands[i].bot + 3);
    if (hk.drop) cands.push(y0);           // falling in: stopping right under the surface is an option
    var best = null, bestScore = 1e18;
    for (i = 0; i < cands.length; i++) {
      var y = clamp(cands[i], L.minHookY, L.maxHookY);
      var sc = conflict(y) * 1e4 + M.abs(y - want) * 0.25 + M.abs(y - y0) * 0.5;
      if (sc < bestScore) { bestScore = sc; best = y; }
    }
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
