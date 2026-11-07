/* Pebble's Oasis Run — PO.Bot: an autopilot / player model (title demo, high-speed playtests, pacing sims) (DESIGN §5.3)
 *
 *   var bot = new PO.Bot(world, { skill: 0.5, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Every ~0.1 s it scans the next look = speed·(1.2 + 1.0·skill) u of track per lane and scores each lane:
 *   +1000  a tall obstacle (pots) Pebble will meet in that lane within 0.75 s (+25 if further: leave soon, but
 *          not through a pillow)
 *   +4…12  a low obstacle (log / tumbleweed / resting pillow / a flying pillow's landing spot): jumpable, but a
 *          clean lane is nicer; much more if it is too close to time a jump
 *   −3     per shell Pebble can grab in that lane (arc shells count only if a jump is planned anyway)
 *   +2.5   per lane change, +1000 if a tall obstacle is in the way of the lane change itself
 * and moves toward the cheapest lane (current lane wins ties). Jumps are checked every call: when a low
 * obstacle in Pebble's lane (at its predicted x) is within speed·0.28 + 0.6 u, or an arc of shells starts.
 * Skill model: actions happen after a reaction delay (1 − skill)·0.35 s; with chance (1 − skill)·0.15 per
 * decision a danger is "not noticed" (and an object once missed stays missed until it is within ~0.5 s);
 * look-ahead shrinks with low skill. skill 1 ≈ never hit, 0.5 ≈ a casual player.
 */
(function (PO) {
  'use strict';
  var M = Math;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new PO.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.stats = { decisions: 0, moves: 0, jumps: 0, lapses: 0 };
    this.t = 0; this._decT = 0; this._queue = []; this._missed = {}; this._jumpFor = {};
  }
  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  Bot.prototype._later = function (kind, arg) {
    var d = (1 - this.skill) * 0.35;
    if (d <= 0) return this._do(kind, arg);
    this._queue.push({ at: this.t + d * this.rng.range(0.7, 1.3), kind: kind, arg: arg });
  };
  Bot.prototype._do = function (kind, arg) {
    var w = this.world;
    if (kind === 'move') { if (w.move(arg)) this.stats.moves++; }
    else if (kind === 'lane') {
      this._pendingLane = undefined;
      var h = w.hero, n = M.abs(arg - h.lane), dir = arg > h.lane ? 1 : -1;
      for (var i = 0; i < n; i++) if (w.move(dir)) this.stats.moves++;      // the 2nd one is queued by the world
    }
    else if (kind === 'jump') { w.jump(); this.stats.jumps++; }
  };

  /** where an object will be (x) when Pebble reaches it */
  Bot.prototype._xAt = function (o) {
    var w = this.world;
    if (o.kind === 'pillow' && o.state === 'fly') return o.landX;
    if (o.kind !== 'tumble') return o.x;
    var t = M.max(0, (o.kind === 'pillow' ? o.landS : o.s) - w.dist) / M.max(w.speed, 1);
    var x = o.x, vx = o.vx, b = o.bounces;
    if (!o.awake) { var tw = M.max(0, (o.z - w.speed * o.wake) / M.max(w.speed, 1)); t = M.max(0, t - tw); }
    for (var k = 0; k < 40 && t > 0; k++) {
      var dt = M.min(t, 0.05); x += vx * dt; t -= dt;
      if (b < 1 && M.abs(x) > 1.45 && (x > 0) === (vx > 0)) { vx = -vx * 0.9; b++; }
    }
    return x;
  };

  Bot.prototype._dangers = function (look) {
    var w = this.world, out = [], s = this.skill;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o.kind === 'shell' || o.state === 'hit') continue;
      if (o.state !== 'live' && o.state !== 'fly') continue;
      var z = o.state === 'fly' ? o.landS - w.dist : o.z;
      if (z < -0.5 || z > look) continue;
      // attention lapse: decided once per object, cleared when it gets close
      if (this._missed[o.id] === undefined) {
        this._missed[o.id] = this.rng.chance((1 - s) * 0.15);
        if (this._missed[o.id]) this.stats.lapses++;
      }
      if (this._missed[o.id] && z > w.speed * (0.25 + 0.35 * s)) continue;
      out.push({ o: o, z: z, x: this._xAt(o), tall: o.h > 1 });
    }
    return out;
  };

  Bot.prototype._decide = function () {
    var w = this.world, h = w.hero, s = this.skill, v = M.max(w.speed, 1);
    var look = v * (1.2 + 1.0 * s);
    var dangers = this._dangers(look);
    var best = h.lane, bestC = 1e9, costs = [0, 0, 0];
    for (var lane = -1; lane <= 1; lane++) {
      var c = M.abs(lane - h.lane) * 2.5 + (lane === h.lane ? 0 : 0.01);
      var lo = M.min(lane, h.lane), hi = M.max(lane, h.lane);
      for (var i = 0; i < dangers.length; i++) {
        var d = dangers[i], dl = M.abs(d.x - lane);
        if (dl < 0.5 + d.o.w) {
          if (d.tall) c += d.z / v < 0.75 ? 1000 : 25 + 10 / (1 + d.z);   // far away: "leave soon", not "leave now at any price"
          else {
            var tReach = d.z / v;
            c += tReach < (lane === h.lane ? 0.25 : 0.45) ? 40 : (d.o.kind === 'tumble' ? 12 : 5);
          }
        }
        // anything in the way of the lane change itself (lanes crossed on the way, while we are crossing them)
        if (lane !== h.lane && d.z > -0.5 && d.x >= lo - 0.45 && d.x <= hi + 0.45 && M.abs(d.x - lane) > 0.5 &&
            d.z / v < 0.14 * M.abs(lane - h.x) + 0.12) c += d.tall ? 1000 : 30;
      }
      // shells
      for (var j = 0; j < w.objects.length; j++) {
        var o = w.objects[j];
        if (o.kind !== 'shell' || o.state !== 'live' || o.z < 0.3 || o.z > look) continue;
        if (M.abs(o.x - lane) < 0.3 && (o.y < 0.8 || s > 0.4)) c -= 3 * (1 - 0.5 * o.z / look);
      }
      costs[lane + 1] = c;
      if (c < bestC - 1e-9) { bestC = c; best = lane; }
    }
    if (costs[h.lane + 1] <= bestC + 0.5) best = h.lane;
    this._lastCosts = costs;
    if (best !== h.lane && h.queued === 0 && this._pendingLane === undefined) { this._pendingLane = best; this._later('lane', best); }
  };

  Bot.prototype._checkJump = function () {
    var w = this.world, h = w.hero, v = M.max(w.speed, 1);
    if (!h.onGround) return;
    var reach = v * 0.28 + 0.6;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o.state !== 'live' && o.state !== 'fly') continue;
      if (this._jumpFor[o.id]) continue;
      var arcShell = o.kind === 'shell' && o.arc && this.skill > 0.4;
      if (o.kind === 'pots' || (o.kind === 'shell' && !arcShell)) continue;
      var z = o.state === 'fly' ? o.landS - w.dist : o.z;
      if (o.state === 'fly' && o.T - o.t > z / v) continue;            // it will still be in the air when we pass
      var lead = arcShell ? reach - 0.6 - 0.15 * v : reach;
      if (z < 0.05 || z > lead) continue;
      if (this._missed[o.id] && z > v * (0.25 + 0.35 * this.skill)) continue;
      var x = this._xAt(o), tgt = h.lane;
      if (M.abs(x - tgt) < o.w + 0.35 || M.abs(x - h.x) < o.w + 0.3) {
        this._jumpFor[o.id] = true;
        this._later('jump');
        return;
      }
    }
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this.t += dt;
    if (w.phase !== 'play') { this._queue.length = 0; return; }
    for (var i = 0; i < this._queue.length; i++) {
      var a = this._queue[i];
      if (a.at <= this.t) { this._do(a.kind, a.arg); this._queue.splice(i, 1); i--; }
    }
    this._decT -= dt;
    if (this._decT <= 0) {
      this._decT = 0.1;
      this.stats.decisions++;
      this._decide();
    }
    this._checkJump();
    if (this.stats.decisions % 50 === 0) {           // forget old objects
      var keep = {}, keepJ = {};
      for (var j = 0; j < w.objects.length; j++) {
        var id = w.objects[j].id;
        if (this._missed[id] !== undefined) keep[id] = this._missed[id];
        if (this._jumpFor[id]) keepJ[id] = true;
      }
      this._missed = keep; this._jumpFor = keepJ;
    }
  };

  PO.Bot = Bot;
})(window.PO = window.PO || {});
