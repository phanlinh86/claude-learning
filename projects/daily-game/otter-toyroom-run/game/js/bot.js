/* Otto's Playroom Dash — OD.Bot: an autopilot / player model (title demo, high-speed playtests, pacing sims) (DESIGN §5.3)
 *
 *   var bot = new OD.Bot(world, { skill: 0.5, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Lanes — every ~0.1 s it scans the next look = speed·(1.2 + 1.0·skill) u of track per lane and scores each lane:
 *   +1000  a tall obstacle (tower) Otto will meet in that lane within 0.75 s (+25 if further: "leave soon")
 *   +5…40  a low obstacle (foam blocks / a ball at its predicted x): jumpable, but a clean lane is nicer
 *          (balls +14: their bounce makes the jump a timing puzzle); +40 if too close to change lanes
 *   −3     per acorn Otto can grab in that lane (arc acorns count only if skill > 0.4)
 *   +2.5   per lane change, +1000/+30 if a tall/low obstacle is in the way of the lane change itself
 * and moves toward the cheapest lane (current lane wins ties).
 * Jumps — knows the current gravity: airtime = 2·world.jumpV/world.g (+ the apex hang, via OD.World.jumpProfile).
 * Every call, while on the ground with a low obstacle within speed·(airtime + 0.4) in its path, it runs a tiny
 * look-ahead sim (hero: lane spring + this jump with the take-off gravity; blocks static; balls rolling + bouncing
 * under world.g) for "no jump", "jump after my delay" and "jump a bit later": it jumps when waiting would no
 * longer clear it (latest safe moment, so it lands well past it) — and not at all if Otto would pass under a high
 * moon bounce. Arc acorns: jump when Otto reaches the arc's take-off point (o.arcS).
 * Skill model: actions happen after a reaction delay (1 − skill)·0.35 s ±30 % (jumps: + a gaussian timing error
 * σ = (1 − skill)·0.15 s); with chance (1 − skill)·0.15 per
 * object a danger is "not noticed" until it is within ~0.5 s; look-ahead shrinks with low skill.
 * skill 1 ≈ never hit, 0.5 ≈ a casual player.
 */
(function (OD) {
  'use strict';
  var M = Math;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new OD.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.stats = { decisions: 0, moves: 0, jumps: 0, lapses: 0 };
    this.t = 0; this._decT = 0; this._queue = []; this._missed = {}; this._jumpFor = {}; this._jumpPending = false;
  }
  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  Bot.prototype._delay = function () { return (1 - this.skill) * 0.35; };
  Bot.prototype._later = function (kind, arg) {
    var d = this._delay();
    if (kind === 'jump' && this.skill < 1) d = M.max(0, d + this.rng.gauss() * (1 - this.skill) * 0.15);   // timing error
    if (d <= 0) return this._do(kind, arg);
    if (kind === 'jump') this._jumpPending = true;
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
    else if (kind === 'jump') { this._jumpPending = false; w.jump(); this.stats.jumps++; }
  };

  /** airtime of a jump taken now (s) */
  Bot.prototype._air = function () {
    var w = this.world;
    return OD.World.jumpProfile ? OD.World.jumpProfile(w.gk).air : 2 * w.jumpV / w.g;
  };

  /** where a ball will be (x) after t seconds (rolling, one wall bounce, waking when Otto gets near) */
  Bot.prototype._ballX = function (o, t) {
    var w = this.world, v = M.max(w.speed, 1);
    var x = o.x, vx = o.vx, b = o.bounces;
    if (!o.awake) { var tw = M.max(0, (o.z - v * o.wake) / v); t = M.max(0, t - tw); }
    for (var k = 0; k < 60 && t > 0; k++) {
      var dt = M.min(t, 0.05); x += vx * dt; t -= dt;
      if (b < 1 && M.abs(x) > 1.45 && (x > 0) === (vx > 0)) { vx = -vx * 0.9; b++; }
    }
    return x;
  };
  /** where an object will be (x) when Otto reaches it */
  Bot.prototype._xAt = function (o) {
    if (o.kind !== 'ball') return o.x;
    return this._ballX(o, M.max(0, o.z) / M.max(this.world.speed, 1));
  };

  Bot.prototype._dangers = function (look) {
    var w = this.world, out = [], s = this.skill;
    for (var i = 0; i < w.objects.length; i++) {
      var o = w.objects[i];
      if (o.kind === 'acorn' || o.state !== 'live') continue;
      var z = o.z;
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
            c += tReach < (lane === h.lane ? 0.25 : 0.45) ? 40 : (d.o.kind === 'ball' ? 14 : 5);
          }
        }
        // anything in the way of the lane change itself (lanes crossed on the way, while we are crossing them)
        if (lane !== h.lane && d.z > -0.5 && d.x >= lo - 0.45 && d.x <= hi + 0.45 && M.abs(d.x - lane) > 0.5 &&
            d.z / v < 0.14 * M.abs(lane - h.x) + 0.12) c += d.tall ? 1000 : 30;
      }
      // acorns
      for (var j = 0; j < w.objects.length; j++) {
        var o = w.objects[j];
        if (o.kind !== 'acorn' || o.state !== 'live' || o.z < 0.3 || o.z > look) continue;
        if (M.abs(o.x - lane) < 0.3 && (o.y < 0.8 || s > 0.4)) c -= 3 * (1 - 0.5 * o.z / look);
      }
      costs[lane + 1] = c;
      if (c < bestC - 1e-9) { bestC = c; best = lane; }
    }
    if (costs[h.lane + 1] <= bestC + 0.5) best = h.lane;
    this._lastCosts = costs;
    if (best !== h.lane && h.queued === 0 && this._pendingLane === undefined) { this._pendingLane = best; this._later('lane', best); }
  };

  /** Look-ahead: does Otto bump one of `objs` within `horizon` s if he jumps after `jumpAt` s (null = never)? */
  Bot.prototype._sim = function (objs, jumpAt, horizon) {
    var w = this.world, C = OD.World.CONFIG, h = w.hero, dt = 1 / 60, v = w.speed;
    var x = h.x, vx = h.vx, lane = h.lane, y = h.y, vy = h.vy, ground = h.onGround;
    var jg = h.jg || w.g, prof = OD.World.jumpProfile ? OD.World.jumpProfile(w.gk) : null, jt = -1;
    var w0 = C.laneOmega, zeta = C.laneZeta, g = w.g;
    var bs = [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      bs.push({ o: o, x: o.x, y: o.y, vy: o.vy, vx: o.vx, z: o.z, awake: o.kind !== 'ball' || o.awake, b: o.bounces || 0 });
    }
    for (var t = 0; t <= horizon; t += dt) {
      // hero
      var ax = w0 * w0 * (lane - x) - 2 * zeta * w0 * vx; vx += ax * dt; x += vx * dt;
      if (ground && jumpAt !== null && t >= jumpAt) { ground = false; jt = 0; vy = w.jumpV; jg = w.g; }
      if (!ground) {
        if (jt >= 0 && prof) { jt += dt; y = OD.World.pathY(prof, jt); if (jt >= prof.air) { y = 0; ground = true; jt = -1; } }
        else { y += vy * dt - 0.5 * jg * dt * dt; vy -= jg * dt; if (y <= 0) { y = 0; ground = true; } }
      }
      // objects
      for (var k = 0; k < bs.length; k++) {
        var b = bs[k], ob = b.o;
        b.z -= v * dt;
        if (ob.kind === 'ball') {
          if (!b.awake) { if (b.z < v * ob.wake) { b.awake = true; b.vy = C.ballV * C.ballKick; } }
          else {
            b.x += b.vx * dt;
            b.y += b.vy * dt - 0.5 * g * dt * dt; b.vy -= g * dt;
            if (b.y <= 0) { b.y = 0; b.vy = M.max(C.ballRest * -b.vy, C.ballV); }
            if (b.b < 1 && M.abs(b.x) > 1.45 && (b.x > 0) === (b.vx > 0)) { b.vx = -b.vx * 0.9; b.b++; }
          }
        }
        // a small safety margin on top of the world's rule
        if (M.abs(b.z) < ob.d + C.hitZPad + 0.05 && M.abs(b.x - x) < ob.w + C.heroHalfW + 0.04 &&
            y < b.y + ob.h + 0.03 && (ob.kind !== 'ball' || y + C.heroH > b.y - 0.03)) return true;
      }
    }
    return false;
  };

  Bot.prototype._checkJump = function () {
    var w = this.world, h = w.hero, v = M.max(w.speed, 1), s = this.skill;
    if (!h.onGround || this._jumpPending) return;
    var air = this._air(), d = this._delay(), reach = v * (air + 0.4 + d);
    // 1) arc acorns: take off at the arc's take-off point
    if (s > 0.4) {
      for (var i = 0; i < w.objects.length; i++) {
        var a = w.objects[i];
        if (a.kind !== 'acorn' || !a.arc || a.state !== 'live' || a.arcS === undefined) continue;
        if (M.abs(a.x - h.lane) > 0.3 || M.abs(a.x - h.x) > 0.45) continue;
        var key = 'arc' + a.arcS.toFixed(2);
        if (this._jumpFor[key]) continue;
        var dz = a.arcS - w.dist;
        if (dz <= v * d + 0.05 && dz > -0.6) { this._jumpFor[key] = true; this._later('jump'); return; }
      }
    }
    // 2) low obstacles in the way
    var near = [];
    for (var j = 0; j < w.objects.length; j++) {
      var o = w.objects[j];
      if (o.state !== 'live' || o.kind === 'acorn' || o.kind === 'tower') continue;
      if (o.z < -0.6 || o.z > reach) continue;
      if (this._missed[o.id] && o.z > v * (0.25 + 0.35 * s)) continue;
      if (o.kind !== 'ball' && M.abs(o.x - h.lane) > o.w + 0.45 && M.abs(o.x - h.x) > o.w + 0.45) continue;
      near.push(o);
    }
    if (!near.length) return;
    var zMin = 1e9; for (var n = 0; n < near.length; n++) zMin = M.min(zMin, near[n].z - near[n].d);
    if (zMin > v * (d + air * 0.75) + 0.8) return;              // still far: a jump now would land before it
    var hz = air + 0.5 + d;
    if (!this._sim(near, null, hz)) return;                     // no bump if we just keep running (or pass under)
    var step = s >= 1 ? 1 / 60 : 0.05;
    if (this._sim(near, d, hz)) {
      // a jump after my delay doesn't clear it: if any later jump would, wait; else (too late) jump anyway
      for (var tj = d + 0.04; tj < d + 0.6; tj += 0.04) if (!this._sim(near, tj, hz + 0.6)) return;
      this._later('jump'); return;
    }
    if (this._sim(near, d + step * 2, hz + step * 2)) this._later('jump');   // waiting longer would no longer clear it
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this.t += dt;
    if (w.phase !== 'play') { this._queue.length = 0; this._jumpPending = false; return; }
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
        if (w.objects[j].arcS !== undefined) { var k = 'arc' + w.objects[j].arcS.toFixed(2); if (this._jumpFor[k]) keepJ[k] = true; }
      }
      this._missed = keep; this._jumpFor = keepJ;
    }
  };

  OD.Bot = Bot;
})(window.OD = window.OD || {});
