/* Spike's Dino Jam — DJ.Bot (autoplay / tests / demo / high-speed playtest)
 *
 *   const bot = new DJ.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { thinks, flips, trailFlips, pillowFlips, notes, bonks, pillowHits, dodges, levels, maxLevel }
 *
 * Plays only through the public input API (setDir / action). Strategy (docs/MECHANICS.md §7):
 *  1. Target: the note with the lowest travel-time estimate d / v + |Δθ| / turnRate (loose notes
 *     count ×0.6 and are skipped if they would vanish first); a little hysteresis so it doesn't dither.
 *     A note inside the current turning circle is unreachable by turning → drive straight first.
 *  2. Steering: 7 candidate turn rates (−max … +max). Each is rolled out over a look-ahead
 *     (0.35 + 0.45·skill s) with the world's own eased-turn dynamics and edge reflection. A rollout that
 *     touches the trail (index ≥ safeNeck) or stands under a landing pillow is dangerous (cost ≫ any
 *     distance, earlier = worse); otherwise cost = closest approach to the target.
 *  3. Kickflip: when the best rollout still bonks within ~0.3 s, or a pillow lands where Spike will be
 *     within the airborne window, and the board is charged.
 *  skill < 1: slower thinking (reaction delay), shorter look-ahead, aim noise, sometimes misses a flip.
 */
(function (DJ) {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  var FRACS = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1];

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? clamp(opts.skill, 0, 1) : 0.8;
    this.rng = new DJ.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { thinks: 0, flips: 0, trailFlips: 0, pillowFlips: 0, notes: 0, bonks: 0, pillowHits: 0, dodges: 0, levels: 0, maxLevel: 0 };
    this._wait = 0;
    this._targetId = -1;
    this._dirH = null;
    this.debug = { target: null, best: 0, danger: 0 };
  }

  Bot.prototype._sync = function () {
    var w = this.world, s = this.stats;
    s.notes = w.notesTotal; s.bonks = w.bonks; s.pillowHits = w.pillowHits; s.dodges = w.dodges;
    s.levels = w.levelsCleared; s.maxLevel = Math.max(s.maxLevel, w.level);
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled) return;
    var w = this.world;
    this._sync();
    if (w.state === 'dead') { w.setDir(0, 0); return; }
    this._wait -= dt;
    if (this._wait > 0) return;
    var sk = this.skill;
    this._wait = 0.05 + (1 - sk) * 0.25 * (0.6 + 0.8 * this.rng.next());
    this._think();
  };

  /* Roll out a constant commanded turn rate; returns { danger time or -1, minD to target, x, y at tq }. */
  Bot.prototype._rollout = function (wCmd, T, tgt, out) {
    var w = this.world, c = w.cfg, s = w.spike, A = w.arena, r = c.spikeR;
    var lock = s.lock, x = s.x, y = s.y, hd = s.heading, om = s.turn, v = s.speed, h = 1 / 30, n = Math.ceil(T / h);
    var air0 = s.jump > 0 ? (c.jumpTime - s.jump) : 0;            // still airborne for this long
    var trail = w.trail, pil = w.pillows, k, i, t = 0, minD = 1e9, danger = -1;
    var br = c.bonkR + 5 + 4 * this.skill, br2 = br * br, pr = c.spikeR + c.pillowHitPad + 10;
    var ease = 1 - Math.exp(-c.turnEase * h);
    if (tgt) { var d0 = Math.hypot(tgt.x - x, tgt.y - y); minD = d0; }
    for (k = 0; k < n; k++) {
      if (lock > 0) { lock -= h; om += (0 - om) * ease; } else om += (wCmd - om) * ease;
      hd += om * h;
      x += Math.cos(hd) * v * h; y += Math.sin(hd) * v * h;
      var wx = 0, wy = 0;
      if (x < A.x0 + r) { x = 2 * (A.x0 + r) - x; wx = -1; } else if (x > A.x1 - r) { x = 2 * (A.x1 - r) - x; wx = 1; }
      if (y < A.y0 + r) { y = 2 * (A.y0 + r) - y; wy = -1; } else if (y > A.y1 - r) { y = 2 * (A.y1 - r) - y; wy = 1; }
      if (wx || wy) { hd = w.bounceHeading(hd, wx, wy, wCmd, x, y); om = -om * 0.5; lock = c.bounceLock; }
      t += h;
      if (tgt) { var dd = Math.hypot(tgt.x - x, tgt.y - y); if (dd < minD) minD = dd; }
      if (danger >= 0) continue;
      var airborne = t < air0 - 0.05 || (out.flipAt >= 0 && t > out.flipAt + 0.05 && t < out.flipAt + c.jumpTime - 0.05);
      if (!airborne && !(s.invuln > t) && !w.inEdgeZone(x, y)) {
        for (i = c.safeNeck; i < trail.length; i++) {
          var dx = trail[i].x - x, dy = trail[i].y - y;
          if (dx * dx + dy * dy < br2) { danger = t; break; }
        }
      }
      if (danger < 0 && !airborne) {
        for (i = 0; i < pil.length; i++) {
          var p = pil[i];
          if (p.state !== 'fall') continue;
          var tl = p.dur - p.t;
          if (Math.abs(tl - t) <= h * 0.5 + 0.12) {
            var ex = p.x - x, ey = p.y - y;
            if (ex * ex + ey * ey < pr * pr) { danger = t; break; }
          }
        }
      }
    }
    out.danger = danger; out.minD = minD; out.x = x; out.y = y; out.hd = hd;
    return out;
  };

  Bot.prototype._pickTarget = function () {
    var w = this.world, c = w.cfg, s = w.spike, best = null, bestCost = 1e9, cur = null, curCost = 1e9;
    var v = Math.max(60, s.speed), R = v / c.turnRate;
    for (var i = 0; i < w.notes.length; i++) {
      var n = w.notes[i], dx = n.x - s.x, dy = n.y - s.y, d = Math.sqrt(dx * dx + dy * dy);
      var da = Math.abs(wrap(Math.atan2(dy, dx) - s.heading));
      // inside the turning circle on that side → needs a loop (≈ one extra circle)
      var side = wrap(Math.atan2(dy, dx) - s.heading) > 0 ? 1 : -1;
      var ccx = s.x + Math.cos(s.heading + side * Math.PI / 2) * R, ccy = s.y + Math.sin(s.heading + side * Math.PI / 2) * R;
      var inside = Math.hypot(n.x - ccx, n.y - ccy) < R * 0.95;
      var eta = d / v + da / c.turnRate + (inside ? TAU * R / v * 0.6 : 0);
      if (n.state === 'loose' && n.life < eta + 0.25) continue;
      var cost = eta * (n.state === 'loose' ? 0.6 : 1);
      if (cost < bestCost) { bestCost = cost; best = n; }
      if (n.id === this._targetId) { cur = n; curCost = cost; }
    }
    if (cur && curCost < bestCost * 1.25 + 0.15) best = cur;
    this._targetId = best ? best.id : -1;
    return best;
  };

  Bot.prototype._think = function () {
    var w = this.world, c = w.cfg, s = w.spike, sk = this.skill, r = this.rng, A = w.arena, st = this.stats;
    st.thinks++;
    var tgt = this._pickTarget();
    if (!tgt) tgt = { x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2, none: true };
    this.debug.target = tgt;
    var T = 0.35 + 0.45 * sk;
    var o = this._o || (this._o = { flipAt: -1 }), bestF = 0, bestCost = 1e18, bestDanger = -1, k;
    o.flipAt = -1;
    var R = Math.max(60, s.speed) / c.turnRate;
    for (k = 0; k < FRACS.length; k++) {
      this._rollout(FRACS[k] * c.turnRate, T, tgt, o);
      var cost = o.minD + 0.15 * Math.abs(FRACS[k]) * R;            // mild preference for gentle lines
      if (o.danger >= 0) cost += 1e5 + 1e4 * (1 - o.danger / T);
      if (cost < bestCost) { bestCost = cost; bestF = FRACS[k]; bestDanger = o.danger; }
    }
    this.debug.best = bestF; this.debug.danger = bestDanger;
    // kickflip decisions
    if (s.flip >= 1 && s.jump <= 0 && (w.state === 'playing')) {
      var notice = r.next() < 0.55 + 0.45 * sk;
      if (bestDanger >= 0 && bestDanger < 0.32 && notice) {
        // would the hop save us? re-roll the best line with the hop starting now
        o.flipAt = 0; this._rollout(bestF * c.turnRate, Math.min(T, c.jumpTime * 0.9), null, o); o.flipAt = -1;
        if (o.danger < 0 || o.danger > bestDanger + 0.2) { if (w.action()) { st.flips++; st.trailFlips++; } }
      } else if (notice) {
        for (var i = 0; i < w.pillows.length; i++) {
          var p = w.pillows[i];
          if (p.state !== 'fall') continue;
          var tl = p.dur - p.t;
          if (tl > c.jumpTime * 0.6 || tl < 0.06) continue;
          this._rollout(bestF * c.turnRate, tl, null, o);
          var hr = c.spikeR + c.pillowHitPad + 6;
          if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) < hr * hr) { if (w.action()) { st.flips++; st.pillowFlips++; } break; }
        }
      }
    }
    // command the chosen turn: desired heading = heading + ω / gain (saturated → a big error)
    var wCmd = bestF * c.turnRate;
    var dH = Math.abs(bestF) >= 1 ? Math.sign(bestF) * 1.2 : wCmd / c.turnGain;
    dH += r.gauss() * (1 - sk) * 0.3;
    var hd = s.heading + dH;
    w.setDir(Math.cos(hd), Math.sin(hd));
  };

  DJ.Bot = Bot;
})(window.DJ = window.DJ || {});
