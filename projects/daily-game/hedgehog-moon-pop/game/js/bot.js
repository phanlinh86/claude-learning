/* Bristle's Moon Pop — MP.Bot (autoplay / tests / title demo / high-speed playtest)
 *
 *   const bot = new MP.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { decisions, pops, airPops, chains, bestChain, escapes, bonks, jumps, magnets, levels, deaths, maxLevel }
 *
 * Plays only through the public input API (setTarget / setMove / action).
 * Strategy (docs/MECHANICS.md §6):
 *  1. Predict every bubble with world.bubbleAt() — the exact closed form of the rise (drag, sway, the remaining
 *     puff time). While the magnet is on the prediction is refreshed every decision (bubbles come to him anyway).
 *  2. On the floor, for each bubble build plans:
 *       ground — skate under it while it is still low (y > 400) → tier 1;
 *       jump   — for sample hit times τ: the jump arc meets the bubble's height on the way up (or at the apex),
 *                jump time = τ − rise time ≥ reaction delay, and he can skate there in time → tier by height.
 *     Utility = points / (time + 0.6) (+ streak rescue for bubbles about to escape, + magnet bubble bonus,
 *     + chain potential: other bubbles near the hit point that a pop-bounce can reach).
 *  3. In the air: simulate the remaining arc and steer to the bubble the arc can touch (chains).
 *  4. Pebbles: every plan's path (skate + arc) is checked against the predicted pebble path (world.pebbleAt);
 *     unsafe plans are dropped; with no safe plan he moves to the nearest safe spot. A less skilled bot
 *     overlooks some pebbles and reacts later, aims with noise and mistimes jumps a little.
 *  5. Idle: wait near the middle of the vents.
 */
(function (MP) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = new MP.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { decisions: 0, pops: 0, airPops: 0, chains: 0, bestChain: 0, escapes: 0, bonks: 0, jumps: 0, magnets: 0, levels: 0, deaths: 0, maxLevel: 0 };
    this._wait = 0; this._tx = null; this._noise = 0; this._last = null;
    this._jumpAt = null; this._seen = {}; this._seenN = 0;
    this.plan = null;        // debug: { kind, id, x, t, jumpAt }
  }

  Bot.prototype._sync = function () {
    var w = this.world, l = this._last, s = this.stats;
    if (l && l.world === w && w.time >= l.time) {
      s.pops += Math.max(0, w.popsTotal - l.p);
      s.airPops += Math.max(0, w.airPops - l.a);
      s.escapes += Math.max(0, w.escaped - l.e);
      s.bonks += Math.max(0, w.bonks - l.b);
      s.jumps += Math.max(0, w.jumps - l.j);
      s.magnets += Math.max(0, w.magnets - l.m);
      s.levels += Math.max(0, w.levelsCleared - l.lv);
      if (w.chain >= 2 && l.chain < 2) s.chains++;
      if (w.state === 'dead' && l.state !== 'dead') s.deaths++;
    }
    s.bestChain = Math.max(s.bestChain, w.bestChain || 0);
    s.maxLevel = Math.max(s.maxLevel, w.level);
    this._last = { world: w, time: w.time, p: w.popsTotal, a: w.airPops, e: w.escaped, b: w.bonks, j: w.jumps, m: w.magnets, lv: w.levelsCleared, chain: w.chain, state: w.state };
  };

  // a less skilled player overlooks some pebbles (decided once per pebble)
  Bot.prototype._sees = function (it) {
    if (this._seen[it.id] === undefined) {
      if (++this._seenN > 256) { this._seen = {}; this._seenN = 0; }
      this._seen[it.id] = !this.rng.chance((1 - this.skill) * 0.35);
    }
    return this._seen[it.id];
  };

  /* Hog x after τ s skating from x0 toward tx at speed v (after a reaction delay). */
  function moveX(x0, tx, v, tau) {
    var d = tx - x0, m = v * Math.max(0, tau);
    return Math.abs(d) <= m ? tx : x0 + (d > 0 ? m : -m);
  }

  /* Is a path safe from pebbles?  path(τ) → {x, y}; checks τ ∈ [0, T]. */
  Bot.prototype._safe = function (pebs, path, T, pad) { return this._clear(pebs, path, T) >= pad; };
  /* smallest (distance − hit distance) between the path and any seen pebble over τ ∈ [0, T] */
  Bot.prototype._clear = function (pebs, path, T) {
    var w = this.world, c = w.cfg, lim = c.pebbleR + c.hogBallR * c.pebbleHitK, m = 1e9;
    if (w.hog.invuln > 0.4 || !pebs.length) return m;
    for (var tau = 0; tau <= T; tau += 0.05) {
      var p = path(tau);
      for (var k = 0; k < pebs.length; k++) {
        var it = pebs[k];
        if (tau > it._tl) continue;
        var q = w.pebbleAt(it, tau), dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) - lim;
        if (d < m) m = d;
      }
    }
    return m;
  };

  Bot.prototype._decide = function () {
    var w = this.world, c = w.cfg, s = w.hog, sk = this.skill, i, it, k;
    this.stats.decisions++;
    var notice = (1 - sk) * 0.5, react = 0.06 + (1 - sk) * 0.35;
    var v = c.maxSpeed * (0.8 + 0.1 * sk), reachG = c.bubbleR + c.hogR - 8, reachA = c.bubbleR + c.hogBallR - 8;
    var rest = c.hogRestY, g = c.gravity, J = c.jumpV, mult = w.mult;
    var bubbles = [], pebs = [];
    for (i = 0; i < w.items.length; i++) {
      it = w.items[i];
      if (it.kind === 'pebble') {
        if (it.state === 'fall' && !it.harmless && this._sees(it) && it.t >= notice * 0.6) {
          it._tl = w.pebbleTimeTo(it, rest + 30); pebs.push(it);
        }
        continue;
      }
      var age = it.state === 'puff' ? it.t : it.state === 'rise' ? it._puff + it.t : -1;
      if (age < notice) continue;
      bubbles.push(it);
    }
    // patience: a skilled player waits for high pops (×2, ×3) when nothing is urgent; a weak one grabs low ones
    var pad = 6 + 10 * sk, plans = [], patience = 0.6 + 1.8 * sk, jumpK = 0.6 + 0.4 * sk;
    var playing = w.state === 'playing' || w.state === 'ready';
    var mid = 0; for (i = 0; i < w.vents.length; i++) mid += w.vents[i].x; mid = w.vents.length ? mid / w.vents.length : 480;

    if (s.air) {
      // ---- in the air: which bubble can the remaining arc touch? ----
      var best = null, bestU = -1;
      var vyNow = s.vy, yNow = s.y;
      for (i = 0; i < bubbles.length; i++) {
        it = bubbles[i];
        if (it.state !== 'rise') continue;
        for (var ta = 0; ta <= 1.6; ta += 1 / 30) {
          var hy = yNow + vyNow * ta + 0.5 * g * ta * ta;
          if (hy > rest) break;
          var bp = w.bubbleAt(it, ta);
          if (Math.abs(bp.y - hy) > reachA) continue;
          var hx = moveX(s.x, bp.x, c.maxSpeed * 0.8, ta - 0.05);
          if (Math.abs(hx - bp.x) > reachA * 0.8) continue;
          var tier = bp.y > c.tierY[0] ? 1 : bp.y > c.tierY[1] ? 2 : 3;
          var u = (tier * 10 + (it.kind === 'magnet' ? 40 : 0) + 10 * w.chain) / (ta + 0.4);
          if (u > bestU && this._safe(pebs, this._airPath(bp.x, react * 0.5), 1.6, pad)) { bestU = u; best = { kind: 'air', id: it.id, x: bp.x, t: ta }; }
          break;
        }
      }
      this.plan = best;
      this._jumpAt = null;
      var txA = best ? best.x : s.x;
      if (!best) {   // nothing up here: drift toward the next ground plan (the middle of the vents), safely
        var wantA = s.x + (mid - s.x) * 0.3, bdA = 1e9;
        txA = wantA;
        for (k = -8; k <= 8; k++) {
          var xa = Math.max(c.xMin, Math.min(c.xMax, wantA + k * 45));
          if (Math.abs(xa - wantA) < bdA && this._safe(pebs, this._airPath(xa, react * 0.5), 1.6, pad)) { bdA = Math.abs(xa - wantA); txA = xa; }
        }
      }
      this._setTarget(txA);
      return;
    }

    // ---- on the floor ----
    for (i = 0; i < bubbles.length; i++) {
      it = bubbles[i];
      var esc = w.bubbleEscapeIn(it), wait = it.state === 'puff' ? Math.max(0, it._puff - it.t) : 0;
      var magB = it.kind === 'magnet' ? 40 : 0;
      var rescue = 0;
      // ground plan: be under it while it is still low
      var tLow = 0, lowEnd = -1;
      for (tLow = wait; tLow < 4; tLow += 0.05) { if (w.bubbleAt(it, tLow).y < rest - reachG * 0.85) break; lowEnd = tLow; }
      if (lowEnd >= 0) {
        var p0 = w.bubbleAt(it, Math.max(wait, Math.min(lowEnd, wait + 0.2)));
        var arrive = react + Math.abs(p0.x - s.x) / v;
        if (arrive <= lowEnd) {
          var tHit = Math.max(arrive, wait);
          rescue = esc < 2.5 ? 8 : 0;
          plans.push({ kind: 'ground', id: it.id, x: w.bubbleAt(it, tHit).x, t: tHit, jumpAt: null,
            u: (10 * mult + magB + rescue) / (tHit + patience), it: it });
        }
      }
      // jump plans
      var bestJ = null;
      // a jump already committed to keeps its hit time (re-planning would postpone it forever) and has already reacted
      var mine = this.plan && this.plan.kind === 'jump' && this.plan.id === it.id && this.plan.hitAt > w.time;
      var reactJ = mine ? 0 : react, tb0 = Math.max(wait, reactJ + 0.15), tb1 = Math.min(esc, 4.5), tbStep = 0.08;
      if (mine) { tb0 = this.plan.hitAt - w.time; tb1 = tb0 + 1e-6; tbStep = 1; }
      for (var tb = tb0; tb < tb1; tb += tbStep) {
        var b = w.bubbleAt(it, tb), dy = rest - b.y;
        if (dy < reachG * 0.85) continue;                     // still low: ground plan
        var tau;
        var disc = J * J - 2 * g * dy;
        if (disc >= 0) tau = (J - Math.sqrt(disc)) / g;
        else if (dy - J * J / (2 * g) < reachA * 0.8) tau = J / g;   // at the apex, the spikes reach it
        else break;                                            // too high (and only getting higher)
        var jt = tb - tau;
        if (jt < reactJ) continue;
        if (Math.abs(b.x - s.x) > v * (tb - reactJ) + reachA * 0.5) continue;
        var tierJ = b.y > c.tierY[0] ? 1 : b.y > c.tierY[1] ? 2 : 3;
        // chain potential: other bubbles a pop-bounce can reach from here
        var chainB = 0;
        if (tierJ >= 2) for (k = 0; k < bubbles.length; k++) {
          var o = bubbles[k]; if (o === it || o.state !== 'rise') continue;
          var op = w.bubbleAt(o, tb + 0.4);
          if (Math.abs(op.x - b.x) < 130 && op.y < b.y + 40 && op.y > b.y - 120) chainB += 12;
        }
        rescue = esc - tb < 1.5 ? 8 : 0;
        var uJ = (10 * tierJ * mult + magB + chainB * sk + rescue) / (tb + patience) * jumpK;
        if (mine) uJ *= 1.25;                                  // commitment: no dithering between plans
        if (!bestJ || uJ > bestJ.u) bestJ = { kind: 'jump', id: it.id, x: b.x, t: tb, jumpAt: jt, u: uJ, it: it };
      }
      if (bestJ) plans.push(bestJ);
    }
    plans.sort(function (a, b) { return b.u - a.u; });
    var chosen = null;
    for (i = 0; i < plans.length && i < 8; i++) {
      var P = plans[i];
      P.wx = null; P.wUntil = 0;
      if (P.kind === 'jump') {
        // wait beside its path while it is still low enough to pop from the floor, step under it just in time
        var bn = P.it.state === 'puff' ? { x: P.it.x, y: c.ventY } : P.it;
        var lowNow = bn.y > rest - (c.bubbleR + c.hogR) - 6, side = s.x >= bn.x ? 1 : -1, off = c.bubbleR + c.hogR + 20;
        var need = (Math.abs(P.x - bn.x) + off) / v + 0.15;
        if (lowNow && P.jumpAt > need) {
          P.wx = bn.x + side * off;
          if (P.wx < c.xMin || P.wx > c.xMax) P.wx = bn.x - side * off;
          P.wUntil = P.jumpAt - need;
        }
      }
      var path = this._path(P, react, v);
      // a jump is checked over its whole arc (he cannot stop in the air)
      var T = P.kind === 'jump' ? Math.min(3.2, P.jumpAt + 2 * J / g + 0.1) : Math.min(2.6, P.t + 0.4);
      if (this._safe(pebs, path, T, pad)) { chosen = P; break; }
    }
    if (chosen) {
      var keep = this.plan && this.plan.kind === 'jump' && chosen.kind === 'jump' && this.plan.id === chosen.id;
      if (!keep) this._jerr = (this.rng.next() * 2 - 1) * (1 - sk) * 0.08;     // timing error, once per jump
      this.plan = { kind: chosen.kind, id: chosen.id, x: chosen.x, t: chosen.t, jumpAt: chosen.jumpAt, hitAt: w.time + chosen.t };
      this._jumpAt = chosen.jumpAt !== null ? w.time + chosen.jumpAt + (this._jerr || 0) : null;
      this._setTarget(chosen.wx !== null ? chosen.wx : chosen.x, true);
      return;
    }
    this.plan = null; this._jumpAt = null;
    // idle / dodge: the nearest safe spot to the middle of the vents
    var want = s.x + (mid - s.x) * 0.5, bestX = null, bestD = 1e9, maxC = -1e9, maxX = want;
    for (k = -12; k <= 12; k++) {
      var xx = Math.max(c.xMin, Math.min(c.xMax, want + k * 40));
      var cl = this._clear(pebs, function (tau) { return { x: moveX(s.x, xx, v, tau - react), y: rest }; }, 2.6);
      if (cl >= pad + 6 && Math.abs(xx - want) < bestD) { bestD = Math.abs(xx - want); bestX = xx; }
      if (cl > maxC) { maxC = cl; maxX = xx; }
    }
    this._setTarget(bestX !== null ? bestX : maxX, false);
  };

  /* the rest of the current arc while steering to tx (air control: a bit slower than skating) */
  Bot.prototype._airPath = function (tx, react) {
    var w = this.world, c = w.cfg, s = w.hog, x0 = s.x, y0 = s.y, vy0 = s.vy, g = c.gravity, rest = c.hogRestY, v = c.maxSpeed * 0.75;
    return function (tau) {
      var y = y0 + vy0 * tau + 0.5 * g * tau * tau;
      return { x: moveX(x0, tx, v, tau - react), y: y > rest ? rest : y };
    };
  };

  Bot.prototype._path = function (P, react, v) {
    var w = this.world, c = w.cfg, s = w.hog, x0 = s.x, rest = c.hogRestY, g = c.gravity, J = c.jumpV;
    var wx = P.wx, wu = P.wUntil;
    return function (tau) {
      var x, y = rest;
      if (wx === null || wx === undefined) x = moveX(x0, P.x, v, tau - react);
      else if (tau <= wu) x = moveX(x0, wx, v, tau - react);
      else x = moveX(moveX(x0, wx, v, wu - react), P.x, v, tau - wu);
      if (P.jumpAt !== null && tau > P.jumpAt) {
        var ta = tau - P.jumpAt;
        y = rest - J * ta + 0.5 * g * ta * ta;
        if (y > rest) y = rest;
      }
      return { x: x, y: y };
    };
  };

  Bot.prototype._setTarget = function (tx, refreshNoise) {
    var w = this.world, c = w.cfg, sk = this.skill;
    if (sk < 1) {
      if (refreshNoise || Math.abs(this._noise) < 1e-9) this._noise += (this.rng.gauss() * 22 * (1 - sk) - this._noise) * 0.35;
      tx += this._noise;
    }
    this._tx = Math.max(c.xMin, Math.min(c.xMax, tx));
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this._sync();
    if (!this.enabled) return;
    if (w.state === 'dead') { w.setTarget(null); w.setMove(0); this._wait = 0; this._jumpAt = null; return; }
    this._wait -= dt;
    if (this._wait <= 0) {
      this._decide();
      this._wait = 0.05 + (1 - this.skill) * 0.15 + this.rng.range(0, 0.02 + (1 - this.skill) * 0.08);
    }
    if (this._jumpAt !== null && w.time >= this._jumpAt && !w.hog.air) { w.action(); this._jumpAt = null; }
    w.setMove(0);
    w.setTarget(this._tx);
  };

  MP.Bot = Bot;
})(window.MP = window.MP || {});
