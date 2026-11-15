/* Shelly's Sky Catch — SC.Bot (autoplay / tests / title demo / high-speed playtest)
 *
 *   const bot = new SC.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { decisions, catches, gold, misses, zaps, jets, jetCatches, levels, deaths, maxLevel }
 *
 * Plays only through the public input API (setTarget / setMove / action).
 * Strategy (docs/MECHANICS.md §6):
 *  1. Predict where every peeking / falling item crosses the resting rim line (y = 384) with
 *     world.predict(): the exact drag-fall solution incl. flutter sway and the current wind
 *     (eased toward a gust that is blowing in). Items are noticed after (1 − skill)·0.45 s.
 *  2. Plan: best chain of reachable stars in time order (DP; gold worth more, streak bonus),
 *     reachability |Δx| ≤ v·Δt + slack with v = maxSpeed × (0.78 + 0.15·skill) (× 0.8 on snow:
 *     icy grip) after a reaction delay. Target = first star of the chain, leaning toward the next.
 *  3. Thunder puffs: if a puff will cross where the rim will be, side-step it (to the side of the
 *     plan) unless blinking (invulnerable). A less skilled bot overlooks some puffs.
 *  4. Jet Hop: when a star cannot be reached at the resting rim (blown away / too far / too soon)
 *     but a hop NOW catches it on the way up or down (simulated arc vs the star's predicted path),
 *     and no puff meets the hop path → action(). Skill < 0.5 hops less reliably.
 *  5. Idle: drift toward the middle (the best spot to reach anything).
 */
(function (SC) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = new SC.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { decisions: 0, catches: 0, gold: 0, misses: 0, zaps: 0, jets: 0, jetCatches: 0, levels: 0, deaths: 0, maxLevel: 0 };
    this._wait = 0; this._tx = null; this._noise = 0; this._last = null; this._jetWish = false;
    this._seen = {}; this._seenN = 0; this._jetFor = null;
    this.plan = [];          // debug: [{id, x, t}] chosen chain
  }

  Bot.prototype._sync = function () {
    var w = this.world, l = this._last, s = this.stats;
    if (l && l.world === w && w.time >= l.time) {
      s.catches += Math.max(0, w.starsTotal - l.c);
      if (w.jet.air || w.snail.hop > 0) s.jetCatches += Math.max(0, w.starsTotal - l.c);
      s.gold += Math.max(0, w.goldTotal - l.g);
      s.misses += Math.max(0, w.missed - l.m);
      s.zaps += Math.max(0, w.zaps - l.z);
      s.jets += Math.max(0, w.jets - l.j);
      s.levels += Math.max(0, w.levelsCleared - l.lv);
      if (w.state === 'dead' && l.state !== 'dead') s.deaths++;
    }
    s.maxLevel = Math.max(s.maxLevel, w.level);
    this._last = { world: w, time: w.time, c: w.starsTotal, g: w.goldTotal, m: w.missed, z: w.zaps, j: w.jets, lv: w.levelsCleared, state: w.state };
  };

  /** Crossing { t, x } of y = Y for an item (delegates to the world's physics), or null. */
  Bot.cross = function (world, it, Y) { return world.predict(it, Y); };

  // a less skilled player overlooks some puffs (decided once per puff)
  Bot.prototype._sees = function (it) {
    if (this._seen[it.id] === undefined) {
      if (++this._seenN > 256) { this._seen = {}; this._seenN = 0; }
      this._seen[it.id] = !this.rng.chance((1 - this.skill) * 0.3);
    }
    return this._seen[it.id];
  };

  // simulate a hop starting now; returns true if it catches `it` and meets no puff
  Bot.prototype._hopCatches = function (it, tx, puffs) {
    var w = this.world, c = w.cfg, s = w.snail, vAir = c.maxSpeed * c.jetAirSpeed * 0.9;
    var lim = c.catchHalfW * 0.75 + it.r * c.catchRFrac * 0.5, dt = 1 / 60, prevD = null, T = 2 * c.jetImpulse / c.jetG;
    for (var tau = 0; tau <= T + 1e-9; tau += dt) {
      var hop = c.jetImpulse * tau - 0.5 * c.jetG * tau * tau; if (hop < 0) hop = 0;
      var rimY = c.hoverY - hop - c.rimOff;
      var dx = tx - s.x, mv = Math.min(Math.abs(dx), vAir * tau);
      var rimX = Math.max(c.xMin, Math.min(c.xMax, s.x + (dx < 0 ? -mv : mv)));
      for (var k = 0; k < puffs.length; k++) {
        var pp = w.itemAt(puffs[k], tau);
        if (Math.abs(pp.y - rimY) < 22 && Math.abs(pp.x - rimX) < c.catchHalfW + 14) return false;
      }
      var p = w.itemAt(it, tau), d = p.y - rimY;
      if (prevD !== null && prevD < 0 && d >= 0) return Math.abs(p.x - rimX) <= lim;
      prevD = d;
    }
    return false;
  };

  Bot.prototype._decide = function () {
    var w = this.world, c = w.cfg, s = w.snail, sk = this.skill, i, j, it, k;
    this.stats.decisions++;
    var notice = (1 - sk) * 0.45, react = 0.05 + (1 - sk) * 0.3;
    var v = c.maxSpeed * (0.78 + 0.15 * sk) * (w._info.grip < 1 ? 0.8 : 1), slack = c.catchHalfW * (0.5 + 0.3 * sk);
    var Y = c.hoverY - c.rimOff, mid = (c.xMin + c.xMax) / 2;
    var stars = [], puffs = [], puffItems = [];
    for (i = 0; i < w.items.length; i++) {
      it = w.items[i];
      if (it.state !== 'peek' && it.state !== 'fall') continue;
      var age = it.state === 'peek' ? it.t : it._peek + it.t;
      if (age < notice) continue;
      if (it.state === 'fall' && it.y > s.rimY) continue;
      var cr = w.predict(it, Y);
      if (!cr) continue;
      if (it.kind === 'puff') { if (this._sees(it)) { puffs.push({ id: it.id, x: cr.x, t: cr.t, r: it.r }); puffItems.push(it); } }
      else stars.push({ id: it.id, x: cr.x, t: cr.t, val: it.value + 2, it: it });
    }
    stars.sort(function (a, b) { return a.t - b.t; });
    // DP: best[i] = best chain value starting at star i
    var n = stars.length, best = new Array(n), next = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      best[i] = stars[i].val; next[i] = -1;
      for (j = i + 1; j < n; j++) {
        if (Math.abs(stars[j].x - stars[i].x) <= v * (stars[j].t - stars[i].t) + slack && stars[i].val + best[j] > best[i]) {
          best[i] = stars[i].val + best[j]; next[i] = j;
        }
      }
    }
    var first = -1, bv = -1, reach = [];
    for (i = 0; i < n; i++) {
      var tt = Math.max(0, stars[i].t - react);
      reach[i] = Math.abs(stars[i].x - s.rimX) <= v * tt + slack;
      if (reach[i] && (best[i] > bv || (best[i] === bv && first >= 0 && stars[i].t < stars[first].t))) { bv = best[i]; first = i; }
    }
    this.plan = [];
    for (k = first; k >= 0; k = next[k]) this.plan.push({ id: stars[k].id, x: stars[k].x, t: stars[k].t });
    var tx = first >= 0 ? stars[first].x : mid + (s.x - mid) * 0.5;
    if (first >= 0 && next[first] >= 0) {
      var nx = stars[next[first]], win = c.catchHalfW * 0.6 * sk;
      if (nx.t - stars[first].t < 1.2) tx = Math.max(tx - win, Math.min(tx + win, nx.x));
    }
    // Jet Hop: a star we cannot get at the resting rim, but a hop now would catch
    this._jetWish = false;
    if (w.jet.charge >= 1 && !w.jet.air && w.state === 'playing' && this.rng.chance(0.35 + 0.65 * sk)) {
      for (i = 0; i < n; i++) {
        if (stars[i].t > 1.2) continue;
        var already = first >= 0 && this.plan.length && stars[i].id === this.plan[0].id && reach[i];
        if (already && !(stars[i].it.kind === 'gold')) continue;
        var hx = stars[i].it.state === 'fall' ? w.itemAt(stars[i].it, 0.3).x : stars[i].x;
        if (this._hopCatches(stars[i].it, hx, puffItems)) { this._jetWish = true; tx = hx; this._jetFor = stars[i].id; break; }
      }
    }
    // aim noise (refreshed slowly)
    if (sk < 1) { this._noise += (this.rng.gauss() * 24 * (1 - sk) - this._noise) * 0.4; tx += this._noise; }
    // the target is a RIM position; Shelly x = rim − sway offset
    tx -= (s.rimX - s.x);
    // puffs: side-step
    var danger = null;
    if (!this._jetWish) for (i = 0; i < puffs.length; i++) {
      var pf = puffs[i];
      if (pf.t > 1.2 || s.invuln > pf.t + 0.05) continue;
      var dx = tx - s.x, rch = v * Math.max(0, pf.t - react * 0.5);
      var at = s.x + (Math.abs(dx) <= rch ? dx : (dx > 0 ? rch : -rch));
      var lim = c.catchHalfW + pf.r * c.catchRFrac + 14;
      if (Math.abs(pf.x - at) < lim || (Math.abs(pf.x - s.rimX) < lim && pf.t < 0.35)) { if (!danger || pf.t < danger.t) danger = pf; }
    }
    if (danger) {
      var lim2 = c.catchHalfW + danger.r * c.catchRFrac + 26;
      var left = danger.x - lim2, right = danger.x + lim2;
      tx = (Math.abs(left - tx) < Math.abs(right - tx) && left > c.xMin + 5) || right > c.xMax - 5 ? left : right;
    }
    this._tx = Math.max(c.xMin, Math.min(c.xMax, tx));
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this._sync();
    if (!this.enabled) return;
    if (w.state === 'dead') { w.setTarget(null); w.setMove(0); this._wait = 0; return; }
    this._wait -= dt;
    if (this._wait <= 0) {
      this._decide();
      this._wait = 0.02 + (1 - this.skill) * 0.22 + this.rng.range(0, 0.03 + (1 - this.skill) * 0.1);
      if (this._jetWish && w.action()) { this._jetWish = false; }
    }
    w.setMove(0);
    w.setTarget(this._tx);
  };

  SC.Bot = Bot;
})(window.SC = window.SC || {});
